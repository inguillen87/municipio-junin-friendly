import fs from 'node:fs';
import {createHash} from 'node:crypto';
import '../assets/app-routes.js';

const origin = 'https://municipio-junin-friendly.vercel.app';
const files = ['internal-dashboard.html','reportes-rrhh.html','assets/family-schooling.js',
  'assets/family-schooling-model.js','assets/family-schooling-export.js','assets/family-schooling.css',
  'assets/report-centre.js','assets/internal-capability-gate.js'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = Object.fromEntries(files.map(file => {
  const built = new URL('../public/'+file,import.meta.url);
  if (!fs.existsSync(built) || !fs.statSync(built).isFile()) {
    throw Error('SCHOOLING_BUILD_ASSET_MISSING: public/'+file+'; run the Friendly build before verifying production');
  }
  return [file,hash(fs.readFileSync(built))];
}));
const publishedPaths = Object.fromEntries(files.map(file => [file,
  globalThis.MuniControlRoutes.resolve('/'+file,origin)?.path || '/'+file]));
const commit = process.env.GITHUB_SHA || 'manual';
const deadline = Date.now()+240000;
let ready = false;
while (Date.now()<deadline) {
  try {
    const results = await Promise.all(files.map(async file => {
      const response = await fetch(origin+publishedPaths[file]+'?release='+encodeURIComponent(commit), {cache:'no-store',credentials:'omit',redirect:'manual',signal:AbortSignal.timeout(10000)});
      return response.status === 200 && hash(Buffer.from(await response.arrayBuffer())) === expected[file];
    }));
    if (results.every(Boolean)) { ready=true; break; }
  } catch { /* Deployment transition; only retry immutable public asset reads. */ }
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if (!ready) throw Error('SCHOOLING_PUBLISHED_ASSET_MISMATCH');
async function privateCheck(query, options) {
  const response = await fetch(origin+'/api/internal-family-certificates'+query, {...options,redirect:'manual',signal:AbortSignal.timeout(15000)});
  if (![401,403].includes(response.status)) throw Error('SCHOOLING_ANONYMOUS_ACCESS_NOT_DENIED');
  if (!/no-store/.test(response.headers.get('cache-control') || '')) throw Error('SCHOOLING_PRIVATE_CACHE_HEADERS_MISSING');
  return response.status;
}
const statuses = {
  anonymousReport:await privateCheck('?resource=report'),
  anonymousDownload:await privateCheck('?resource=download&certificateId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  anonymousUpload:await privateCheck('',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),
  anonymousV3Report:await privateCheck('?resource=report&version=3'),
  anonymousV3History:await privateCheck('?resource=history&version=3&contractId=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&familyKind=grh&familyId=1&identityToken='+'a'.repeat(64)),
  anonymousV3Attempt:await privateCheck('?resource=attempt&version=3&key=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  anonymousV3Upload:await privateCheck('?version=3',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}),
};
fs.mkdirSync('verification',{recursive:true});
const result = {commit,checkedAt:new Date().toISOString(),origin,publishedAssetsMatch:true,expected,statuses,
  realMunicipalSessionTested:false,realCertificateUploaded:false,physicalClockTested:false};
fs.writeFileSync('verification/family-schooling-production.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({commit,checkedAt:result.checkedAt,publishedAssetsMatch:true,statuses,realMunicipalSessionTested:false}));
