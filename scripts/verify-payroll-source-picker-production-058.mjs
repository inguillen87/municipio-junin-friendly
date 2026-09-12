/** Canonical production resource hashes and anonymous read rejection; no authenticated writes. */
import fs from 'node:fs';import crypto from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app';
const files=['reportes-rrhh.html','nomina-control.html','assets/payroll-source-picker.js','assets/payroll-source-picker.css','assets/payroll-source-reports.js','assets/payroll-source-report-model.js','assets/payroll-document-library-model.js','assets/payroll-roster-panel.js','assets/report-document.js'];
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');const expected=Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(file))]));
const commit=process.env.GITHUB_SHA||'manual',deadline=Date.now()+420000;let published=false;
while(Date.now()<deadline){try{let matches=true;for(const file of files){const r=await fetch(origin+'/'+file+'?release='+commit,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==expected[file]){matches=false;break;}}if(matches){published=true;break;}}catch{}await new Promise(r=>setTimeout(r,5000));}
if(!published)throw Error('SOURCE_PICKER_058_NOT_PUBLISHED');
const r=await fetch(origin+'/api/internal-data?resource=payrollsourcereport',{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(15000)});
if(![401,403].includes(r.status))throw Error('SOURCE_PICKER_ANONYMOUS_ACCESS_NOT_DENIED');if(!/no-store/.test(r.headers.get('cache-control')||''))throw Error('PRIVATE_RESPONSE_CACHE_POLICY');
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/source-picker-production-058.json',JSON.stringify({commit,checkedAt:new Date().toISOString(),publishedAssetsMatch:true,expected,anonymousStatus:r.status,cacheControl:r.headers.get('cache-control'),municipalMfaSessionTested:false,productionApiWrites:0},null,2));console.log(JSON.stringify({publishedAssetsMatch:true,files:files.length,anonymousStatus:r.status}));
