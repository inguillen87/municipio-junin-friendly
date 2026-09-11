// Public asset verification and rejection without session; no municipal identities.
import fs from 'node:fs';import crypto from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app',sha=process.env.GITHUB_SHA||'manual';
const files=['assets/export-sex-code.js','assets/payroll-roster-model.js','assets/payroll-roster-panel.js','assets/payroll-source-reports.js','assets/report-document.js'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');const hashes=Object.fromEntries(files.map(p=>[p,hash(fs.readFileSync(p))]));
let ready=false;const deadline=Date.now()+240000;
while(Date.now()<deadline){try{let match=true;for(const file of files){const r=await fetch(origin+'/'+file+'?release='+sha,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==hashes[file]){match=false;break}}if(match){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,5000))}
if(!ready)throw Error('ROSTER_ASSETS_NOT_PUBLISHED');
const denied=await fetch(origin+'/api/internal-data?resource=payrollexportroster&datasetId=00000000-0000-4000-8000-000000000001',{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
if(![401,403].includes(denied.status))throw Error('ANONYMOUS_ROSTER_NOT_DENIED');
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/export-roster-production.json',JSON.stringify({commit:sha,checkedAt:new Date().toISOString(),assets:hashes,anonymousStatus:denied.status,municipalMfaSessionTested:false},null,2));
