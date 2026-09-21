// SPDX-License-Identifier: GPL-2.0-only
// Offline integrity check. A digest establishes parity, not publisher authenticity.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
const safeName = name => typeof name === 'string' && /^(?:app\/(?:clock-fleet|pm10)\/[A-Za-z0-9_./-]+|verify-release\.mjs)$/.test(name)
  && !name.split('/').some(part => !part || part === '.' || part === '..');
async function regular(base, name) {
  const parts = name.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const stat = await fs.lstat(path.join(base, ...parts.slice(0, i)));
    if (stat.isSymbolicLink() || (i < parts.length ? !stat.isDirectory() : !stat.isFile())) fail('RELEASE_PATH_UNSAFE');
    if (i === parts.length && stat.size > 2 * 1024 * 1024) fail('RELEASE_FILE_TOO_LARGE');
  }
  return fs.readFile(path.join(base, ...parts));
}
async function namesIn(base, relative = 'app') {
  const stat = await fs.lstat(path.join(base, relative));
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('RELEASE_PATH_UNSAFE');
  const names = [];
  for (const item of await fs.readdir(path.join(base, relative), {withFileTypes:true})) {
    const name = relative + '/' + item.name;
    if (item.isSymbolicLink() || (!item.isDirectory() && !item.isFile())) fail('RELEASE_PATH_UNSAFE');
    names.push(...(item.isDirectory() ? await namesIn(base, name) : [name]));
  }
  return names;
}
export async function verifyRelease(root) {
  if (!path.isAbsolute(root)) fail('RELEASE_ABSOLUTE_PATH_REQUIRED');
  const base = path.resolve(root), stat = await fs.lstat(base);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('RELEASE_PATH_UNSAFE');
  const manifest = JSON.parse((await regular(base, 'release-manifest.json')).toString('utf8'));
  if (manifest.schema !== 'municipal-clock-release.v1' || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)
    || typeof manifest.sourceDirty !== 'boolean' || !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 100) fail('RELEASE_MANIFEST_INVALID');
  const seen = new Set(), modules = new Map();
  for (const entry of manifest.files) {
    if (!safeName(entry.path) || seen.has(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)
      || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || entry.bytes > 2 * 1024 * 1024) fail('RELEASE_MANIFEST_INVALID');
    seen.add(entry.path);
    const bytes = await regular(base, entry.path);
    if (bytes.length !== entry.bytes || sha(bytes) !== entry.sha256) fail('RELEASE_CONTENT_MISMATCH');
    if (entry.path.endsWith('.mjs')) modules.set(entry.path, bytes.toString('utf8'));
  }
  if (!seen.has('verify-release.mjs') || !seen.has('app/clock-fleet/gateway.mjs') || !seen.has('app/clock-fleet/sender.mjs')
    || !seen.has('app/pm10/reader/lector-fichadas.mjs')) fail('RELEASE_INCOMPLETE');
  const actual = (await namesIn(base)).concat('verify-release.mjs').sort();
  if (JSON.stringify(actual) !== JSON.stringify([...seen].sort())) fail('RELEASE_UNEXPECTED_CONTENT');
  // Check literal ESM imports without executing a collector or contacting a device.
  for (const [name, source] of modules) {
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\()(['"])([^'"]+)\1/g)) {
      const specifier = match[2];
      if (specifier.startsWith('node:')) continue;
      if (!specifier.startsWith('.') || !seen.has(path.posix.normalize(path.posix.join(path.posix.dirname(name),specifier)))) fail('RELEASE_DEPENDENCY_MISSING');
    }
  }
  const contentHash = sha(JSON.stringify(manifest.files));
  if (manifest.contentSha256 !== contentHash) fail('RELEASE_MANIFEST_MISMATCH');
  return {schema:'municipal-clock-release-check.v1',ok:true,sourceCommit:manifest.sourceCommit,
    sourceDirty:manifest.sourceDirty,contentSha256:contentHash,files:seen.size,networkRequests:0,serviceChanges:0};
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length !== 3) fail('USAGE_VERIFY_RELEASE_ABSOLUTE_DIRECTORY');
    console.log(JSON.stringify(await verifyRelease(process.argv[2])));
  } catch (error) {
    console.error(/^RELEASE_|^USAGE_/.test(error.message) ? error.message : 'RELEASE_CHECK_FAILED');
    process.exitCode = 2;
  }
}
