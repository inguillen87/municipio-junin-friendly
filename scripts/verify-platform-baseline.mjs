import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function verifyPlatformBaseline({pkg,lock,nodeVersion,pinnedNode} = {}) {
  const findings=[];
  const validNode=typeof nodeVersion==='string' && STABLE.test(nodeVersion.replace(/^v/,''));
  if(!validNode || Number(nodeVersion.replace(/^v/,'').split('.')[0])!==24) findings.push('NODE_24_STABLE_REQUIRED');
  if(typeof pinnedNode!=='string' || !STABLE.test(pinnedNode) || !pinnedNode.startsWith('24.')) findings.push('NODE_PIN_INVALID');
  if(pkg?.engines?.node!=='24.x') findings.push('NODE_ENGINE_RANGE_INVALID');
  if(lock?.lockfileVersion!==3 || !lock?.packages?.['']) findings.push('LOCKFILE_V3_REQUIRED');
  let checkedDependencies=0;
  for(const scope of ['dependencies','devDependencies']) {
    const deps=pkg?.[scope];
    if(!deps || typeof deps!=='object' || Array.isArray(deps)) { findings.push('DEPENDENCY_MANIFEST_INVALID'); continue; }
    for(const [name,version] of Object.entries(deps)) {
      checkedDependencies++;
      if(typeof version!=='string' || !STABLE.test(version)) findings.push(`DEPENDENCY_NOT_EXACT_STABLE:${name}`);
      const resolved=lock?.packages?.[`node_modules/${name}`];
      if(lock?.packages?.['']?.[scope]?.[name]!==version || resolved?.version!==version) findings.push(`LOCKFILE_DRIFT:${name}`);
      if(typeof resolved?.integrity!=='string' || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(resolved.integrity)) findings.push(`INTEGRITY_MISSING:${name}`);
      if(typeof resolved?.resolved!=='string' || !resolved.resolved.startsWith('https://registry.npmjs.org/')) findings.push(`REGISTRY_NOT_APPROVED:${name}`);
    }
  }
  if(!pkg?.dependencies?.react || pkg.dependencies.react!==pkg.dependencies['react-dom']) findings.push('REACT_PAIR_MISMATCH');
  return {version:'municontrol-platform-baseline.v1',ok:findings.length===0,nodeVersion,pinnedNode,
    checkedDependencies,findings,networkRequests:0,databaseWrites:0};
}
export async function main() {
  const root=new URL('../',import.meta.url);
  const [pkgText,lockText,pin]=await Promise.all([
    fs.readFile(new URL('package.json',root),'utf8'),
    fs.readFile(new URL('package-lock.json',root),'utf8'),
    fs.readFile(new URL('.nvmrc',root),'utf8'),
  ]);
  const report=verifyPlatformBaseline({pkg:JSON.parse(pkgText),lock:JSON.parse(lockText),nodeVersion:process.version,pinnedNode:pin.trim()});
  console.log(JSON.stringify(report));
  if(!report.ok) process.exitCode=1;
  return report;
}
if(process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)
  main().catch(()=>{console.error('PLATFORM_BASELINE_CHECK_FAILED');process.exitCode=1;});
