/** Public byte parity and anonymous denial only. No municipal session or writes. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { publishedBuildVerification } from './lib/published-build-verification.mjs';

const origin='https://municipio-junin-friendly.vercel.app';
const commit=process.env.GITHUB_SHA || 'manual';
const files=['internal-dashboard.html','reportes-rrhh.html','assets/employee-source-seniority-model.js',
 'assets/payroll-source-reports.js','assets/payroll-source-report-model.js','assets/payroll-monthly-summary-model.js',
 'assets/payroll-monthly-summary.js','assets/payroll-monthly-summary-export.js','assets/civil-date.js','assets/report-document.js'];
const build=publishedBuildVerification({origin,release:commit});
const expected=build.expectedHashes(files);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const deadline=Date.now()+240000;
let published=false;
while(Date.now()<deadline){
 try{
  const checks=await Promise.all(files.map(async file=>{
   const response=await build.fetchFile(file);
   return response.status===200&&hash(Buffer.from(await response.arrayBuffer()))===expected[file];
  }));
  if(checks.every(Boolean)){published=true;break;}
 }catch{/* Deployment may still be moving; retry public reads only. */}
 await new Promise(resolve=>setTimeout(resolve,5000));
}
if(!published)throw Error('NOELIA_MODULE8_PUBLISHED_BYTES_MISMATCH');
const anonymous={};
for(const route of ['/api/internal-data?resource=employees','/api/internal-data?resource=payrollsourcereport','/api/internal-payroll-monthly-source-summary?resource=catalog']){
 const response=await fetch(origin+route,{method:'GET',redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});
 if(![401,403].includes(response.status))throw Error('NOELIA_MODULE8_ANONYMOUS_ACCESS_NOT_DENIED');
 anonymous[route]=response.status;
}
const receipt={commit,checkedAt:new Date().toISOString(),origin,assetHashes:expected,anonymous,municipalSessionTested:false,databaseWrites:false};
fs.mkdirSync('verification',{recursive:true});
fs.writeFileSync('verification/noelia-module8-production.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify({commit,assetsMatched:files.length,anonymous,municipalSessionTested:false,databaseWrites:false}));
