/** Public release checks only; do not read employees or create sessions. */
import fs from 'node:fs';import {createHash} from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app',sha=process.env.GITHUB_SHA||'manual';
const paths=['assets/payroll-document-library.js','assets/payroll-document-library-model.js','assets/payroll-document-library.css','assets/payroll-detail-panel.js'];
const hash=b=>createHash('sha256').update(b).digest('hex');const expected=Object.fromEntries(paths.map(p=>[p,hash(fs.readFileSync(p))]));
const deadline=Date.now()+240000;let ready=false;
while(Date.now()<deadline){try{let ok=true;for(const p of paths){const r=await fetch(origin+'/'+p+'?release='+sha,{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==expected[p]){ok=false;break}}if(ok){const r=await fetch(origin+'/internal-dashboard.html?release='+sha,{signal:AbortSignal.timeout(10000)});const h=await r.text();if(r.ok&&h.includes('Liquidaciones detalladas')&&h.includes('dataPayrollDocumentLibraryOpen')&&h.includes('<option value="administrative_active" selected>')){ready=true;break}}}catch{}await new Promise(r=>setTimeout(r,5000))}
if(!ready)throw Error('DOCUMENT_LIBRARY_NOT_PUBLISHED');
const statuses={};for(const resource of ['employeepayrolldocuments','employeepayrolldetail','employees']){const r=await fetch(origin+'/api/internal-data?resource='+resource,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(![401,403].includes(r.status))throw Error('ANONYMOUS_RESOURCE_NOT_DENIED');statuses[resource]=r.status;}
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/document-library-production.json',JSON.stringify({commit:sha,checkedAt:new Date().toISOString(),assets:expected,activeRosterPreserved:true,anonymous:statuses,municipalSessionTested:false,signatureApplied:false},null,2));
