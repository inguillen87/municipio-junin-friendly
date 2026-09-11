/** Match canonical production bytes and check actual anonymous rejection. No authenticated payroll read. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const origin = 'https://municipio-junin-friendly.vercel.app';
const paths = ['reportes-rrhh.html','nomina-control.html','assets/payroll-comparison-model.js','assets/payroll-comparison.js','assets/payroll-comparison.css',
  'assets/report-centre.js','assets/payroll-navigation.js','assets/payroll-source-report-model.js','assets/report-document.js','assets/payroll-document-library-model.js'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = Object.fromEntries(paths.map(file => [file, hash(fs.readFileSync(file))]));
const commit = process.env.GITHUB_SHA || 'manual', deadline = Date.now() + 300000;
let published = false;
while (Date.now() < deadline) {
  try {
    let matches = true;
    for (const file of paths) {
      const response = await fetch(origin + '/' + file + '?release=' + commit, {cache:'no-store',signal:AbortSignal.timeout(12000)});
      if (!response.ok || hash(new Uint8Array(await response.arrayBuffer())) !== expected[file]) { matches = false; break; }
    }
    if (matches) { published = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve,5000));
}
if (!published) throw Error('COMPARISON_056_PRODUCTION_BYTES_NOT_MATCHED');
const anonymous = [];
for (const query of ['resource=payrollsourcereport','resource=payrollsourcereport&datasetId=00000001-0000-4000-8000-000000000056']) {
  const response = await fetch(origin + '/api/internal-data?' + query, {redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if (![401,403].includes(response.status)) throw Error('COMPARISON_056_ANONYMOUS_NOT_DENIED');
  anonymous.push({kind:query.includes('datasetId')?'report':'catalog',status:response.status});
}
fs.mkdirSync('verification',{recursive:true});
fs.writeFileSync('verification/comparison-056-production.json',JSON.stringify({commit,checkedAt:new Date().toISOString(),expected,
  publishedAssetsMatch:true,anonymous,realMunicipalSessionTested:false,backendWrites:false},null,2));
console.log(JSON.stringify({publishedAssetsMatch:true,files:paths.length,anonymous}));
