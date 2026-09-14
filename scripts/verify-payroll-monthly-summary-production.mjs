import fs from 'node:fs';
import {createHash} from 'node:crypto';

const origin = 'https://municipio-junin-friendly.vercel.app';
const files = ['reportes-rrhh.html','assets/report-centre.js',
  'assets/payroll-monthly-summary-model.js','assets/payroll-monthly-summary-export.js',
  'assets/payroll-monthly-summary.js','assets/payroll-monthly-summary.css'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = Object.fromEntries(files.map(file => [file,hash(fs.readFileSync(new URL('../'+file,import.meta.url)))]));
const commit = process.env.GITHUB_SHA || 'manual';
const deadline = Date.now()+240000;
let ready = false;
while (Date.now()<deadline) {
  try {
    const results = await Promise.all(files.map(async file => {
      const response = await fetch(origin+'/'+file+'?release='+encodeURIComponent(commit), {cache:'no-store',signal:AbortSignal.timeout(10000)});
      return response.status === 200 && hash(Buffer.from(await response.arrayBuffer())) === expected[file];
    }));
    if (results.every(Boolean)) { ready=true; break; }
  } catch { /* Deployment transition; only retry immutable public asset reads. */ }
  await new Promise(resolve=>setTimeout(resolve,5000));
}
if (!ready) throw Error('MONTHLY_SOURCE_PUBLISHED_ASSET_MISMATCH');
async function privateCheck(query, options) {
  const response = await fetch(origin+'/api/internal-payroll-monthly-source-summary'+query, {...options,redirect:'manual',signal:AbortSignal.timeout(15000)});
  if (![401,403].includes(response.status)) throw Error('MONTHLY_SOURCE_ANONYMOUS_ACCESS_NOT_DENIED');
  if (!/no-store/.test(response.headers.get('cache-control') || '')) throw Error('MONTHLY_SOURCE_PRIVATE_CACHE_HEADERS_MISSING');
  return response.status;
}
const statuses = {
  anonymousCatalog:await privateCheck('?resource=catalog'),
  anonymousSummary:await privateCheck('?resource=summary&period=2026-08&datasetIds=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
};
fs.mkdirSync('verification',{recursive:true});
const result = {commit,checkedAt:new Date().toISOString(),origin,publishedAssetsMatch:true,expected,statuses,
  realMunicipalSessionTested:false,realMonthlyCloseApproved:false,physicalClockTested:false};
fs.writeFileSync('verification/payroll-monthly-summary-production.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({commit,checkedAt:result.checkedAt,publishedAssetsMatch:true,statuses,realMunicipalSessionTested:false}));
