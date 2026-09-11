/** Production source-byte verification and anonymous denial. No municipal login. */
import fs from 'node:fs';
import crypto from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app';
const files=['assets/payroll-comparison-model.js','assets/payroll-comparison-panel.js','assets/payroll-comparison-056.css','assets/payroll-source-reports.js','assets/payroll-source-report-model.js','assets/report-document.js','assets/report-centre.js','assets/payroll-navigation.js'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const expected=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(f))]));
const commit=process.env.GITHUB_SHA||'manual',deadline=Date.now()+240000;let published=false;
while(Date.now()<deadline){try{let match=true;for(const f of files){const r=await fetch(origin+'/'+f+'?release='+commit,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok||sha(Buffer.from(await r.arrayBuffer()))!==expected[f]){match=false;break;}}if(match){published=true;break;}}catch{}await new Promise(r=>setTimeout(r,5000));}
if(!published)throw Error('COMPARISON_056_PRODUCTION_SOURCE_MISMATCH');
const anonymous=[];for(const query of ['resource=payrollsourcereport','resource=payrollsourcereport&datasetId=10000000-0000-4000-8000-000000000001']){const r=await fetch(origin+'/api/internal-data?'+query,{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});if(![401,403].includes(r.status))throw Error('COMPARISON_056_ANONYMOUS_ACCESS_NOT_DENIED');anonymous.push({query,status:r.status});}
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/comparison-056-production.json',JSON.stringify({commit,checkedAt:new Date().toISOString(),origin,publishedAssetsMatch:true,expected,anonymous,municipalSessionTested:false,payrollWrites:false},null,2));
console.log(JSON.stringify({publishedAssetsMatch:true,files:files.length,anonymous}));
