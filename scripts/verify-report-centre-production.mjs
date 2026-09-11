/** Public deployment checks; no employee session, data or credentials. */
import fs from 'node:fs';import {createHash} from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app',sha=process.env.GITHUB_SHA||'manual';
const paths=['assets/report-centre.js','assets/report-centre.css','assets/report-analysis.js','assets/report-document.js','assets/task-workspace.js','assets/civil-date.js','assets/payroll-summary-pdf.js','assets/payroll-navigation.js','assets/payroll-source-reports.js','assets/payroll-source-report-model.js'];
const digest=b=>createHash('sha256').update(b).digest('hex');
const expected=Object.fromEntries(paths.map(p=>[p,digest(fs.readFileSync(p))]));
const end=Date.now()+240000;let ready=false;
while(Date.now()<end){try{let ok=true;for(const p of paths){const r=await fetch(origin+'/'+p+'?release='+sha,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok||digest(Buffer.from(await r.arrayBuffer()))!==expected[p]){ok=false;break}}if(ok){for(const [p,marker] of [['reportes-rrhh.html','assets/report-centre.js'],['nomina-control.html','assets/payroll-navigation.js'],['internal-dashboard.html','payroll-summary-status'],['novedades-nomina.html','Sin guardar; requiere validación y revisión.']]){const r=await fetch(origin+'/'+p+'?release='+sha,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok||!(await r.text()).includes(marker)){ok=false;break}}}if(ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,5000))}
if(!ready)throw Error('REPORT_CENTRE_NOT_PUBLISHED');
const response=await fetch(origin+'/api/internal-data?resource=payrollsourcereport',{redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(15000)});
if(![401,403].includes(response.status))throw Error('ANONYMOUS_PAYROLL_REPORT_NOT_DENIED');
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/report-centre-production.json',JSON.stringify({commit:sha,checkedAt:new Date().toISOString(),assetHashes:expected,pagesVerified:4,anonymousFinancialReportStatus:response.status,realMunicipalSessionTested:false,payrollModified:false,signatureApplied:false},null,2));
