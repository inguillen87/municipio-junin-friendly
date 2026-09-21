// SPDX-License-Identifier: GPL-2.0-only
// Explicit source allowlist: never includes runtime binaries, credentials or municipal records.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyRelease} from './verify-municipal-clock-release.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const RELEASE_FILES = Object.freeze({
  'clock-fleet': ['capture-policy.mjs','control.mjs','delivery.mjs','gateway-config.mjs','gateway.mjs',
    'install-machine-windows.ps1','install-machine-linux.sh','MUNICIPAL_HOST.md','municontrol-clock-gateway.service',
    'operator-help.mjs','overview.mjs','README.md','runner.mjs','sender.mjs'],
  pm10: ['config.mjs','delivery.mjs','delivery-status.mjs','file-replacement.mjs','LICENSE','route-guard.mjs',
    'sender.mjs','service.mjs','store.mjs','reader/lector-fichadas.mjs','reader/zk-core-v3.mjs','reader/REFERENCIAS.md']
});
export async function buildRelease(output, {sourceRoot = root} = {}) {
  const destination = path.resolve(output);
  if (destination === sourceRoot || sourceRoot.startsWith(destination + path.sep)) throw Error('RELEASE_OUTPUT_UNSAFE');
  const sourceCommit = execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim();
  const sourceDirty = !!execFileSync('git',['status','--porcelain','--','local-agents','scripts/build-municipal-clock-release.mjs','scripts/verify-municipal-clock-release.mjs'],{cwd:sourceRoot,encoding:'utf8'}).trim();
  const planned = [];
  for (const [family,names] of Object.entries(RELEASE_FILES)) {
    for (const name of names) planned.push({source:`local-agents/${family}/${name}`,target:`app/${family}/${name}`});
  }
  planned.push({source:'scripts/verify-municipal-clock-release.mjs',target:'verify-release.mjs'});
  const content = [];
  for (const item of planned.sort((a,b) => a.target.localeCompare(b.target,'en'))) {
    const file = path.join(sourceRoot,item.source), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1 || stat.size > 2 * 1024 * 1024) throw Error('RELEASE_SOURCE_UNSAFE');
    const bytes = await fs.readFile(file);
    content.push({...item,bytes});
  }
  // Existing staging directories are never overwritten, including private host state.
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.mkdir(destination,{mode:0o700});
  for (const item of content) {
    const file = path.join(destination,item.target);
    await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
    await fs.writeFile(file,item.bytes,{flag:'wx',mode:0o600});
  }
  const files = content.map(item => ({path:item.target,bytes:item.bytes.length,sha256:sha(item.bytes)}));
  const manifest = {schema:'municipal-clock-release.v1',sourceCommit,sourceDirty,contentSha256:sha(JSON.stringify(files)),
    runtimeIncluded:false,credentialsIncluded:false,municipalRecordsIncluded:false,files};
  await fs.writeFile(path.join(destination,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return verifyRelease(destination);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--output') throw Error('USAGE_BUILD_RELEASE_OUTPUT_DIRECTORY');
    console.log(JSON.stringify(await buildRelease(process.argv[3])));
  } catch (error) {
    console.error(/^RELEASE_|^USAGE_/.test(error.message) ? error.message : 'RELEASE_BUILD_FAILED');
    process.exitCode = 2;
  }
}
