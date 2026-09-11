/** Public deployment and authorization checks, no employee data or identity secrets. */
import fs from 'node:fs';import crypto from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app',sha=process.env.GITHUB_SHA||'manual';
const paths=['assets/payroll-detail-panel.js','assets/payroll-detail-model.js','assets/payroll-detail-export.js','assets/payroll-detail-panel.css'];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const expected=Object.fromEntries(paths.map(p=>[p,hash(fs.readFileSync(p))]));const deadline=Date.now()+240000;let ready=false;
while(Date.now()<deadline){try{let ok=true;for(const p of paths){const r=await fetch(origin+'/'+p+'?release='+sha,{signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok||hash(Buffer.from(await r.arrayBuffer()))!==expected[p]){ok=false;break}}if(ok){const r=await fetch(origin+'/internal-dashboard.html?release='+sha,{signal:AbortSignal.timeout(10000)});const h=await r.text();if(r.ok&&h.includes('Ver conceptos y descuentos')&&h.includes('id="workforceWorkspace"')&&h.includes('<option value="administrative_active" selected>')){ready=true;break}}}catch{}await new Promise(r=>setTimeout(r,5000))}
if(!ready)throw Error('PAYROLL_DETAIL_NOT_PUBLISHED');
const detail=await fetch(origin+'/api/internal-data?resource=employeepayrolldetail',{redirect:'manual',signal:AbortSignal.timeout(15000)});
if(![401,403].includes(detail.status))throw Error('ANONYMOUS_DETAIL_NOT_DENIED');
const delivery=await fetch(origin+'/api/payroll-source-delivery',{signal:AbortSignal.timeout(15000)});
if(delivery.status!==405)throw Error('DELIVERY_GET_NOT_DENIED');
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/payroll-detail-production.json',JSON.stringify({commit:sha,checkedAt:new Date().toISOString(),assets:expected,activeRosterPreserved:true,anonymousDetailStatus:detail.status,deliveryGetStatus:delivery.status,municipalSessionTested:false},null,2));
