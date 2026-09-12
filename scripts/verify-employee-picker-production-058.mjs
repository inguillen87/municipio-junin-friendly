/** Anonymous production smoke: never provides a real session or writes municipal data. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app';
const files=['novedades-nomina.html','assets/employee-picker.js','assets/employee-picker-model.js','assets/employee-picker.css','assets/payroll-novelty-workbench.js','assets/payroll-novelty-sheet.js','sw.js'];
const digest=b=>createHash('sha256').update(b).digest('hex');
const out='verification/employee-picker-058-production';fs.mkdirSync(out,{recursive:true});
let hashes=[],matched=false;
for(let attempt=0;attempt<36;attempt++){
 hashes=await Promise.all(files.map(async file=>{try{const r=await fetch(origin+'/'+file+'?verify=058-'+Date.now(),{redirect:'error',signal:AbortSignal.timeout(20000)});const bytes=Buffer.from(await r.arrayBuffer()),expected=digest(fs.readFileSync('public/'+file));return {file,status:r.status,expected,actual:digest(bytes),matches:r.status===200&&digest(bytes)===expected};}catch(error){return{file,matches:false,error:error.message};}}));
 if(hashes.every(r=>r.matches)){matched=true;break;}
 await new Promise(resolve=>setTimeout(resolve,10000));
}
const access=[];
for(const url of ['/api/internal-data?resource=employees&view=novelty-selector&status=administrative_active&includeFacets=0&limit=20&page=1&search=QA_ANONYMOUS','/api/internal-payroll-novelties?resource=bootstrap']){
 const r=await fetch(origin+url,{redirect:'error',signal:AbortSignal.timeout(20000)});access.push({route:url,status:r.status});await r.arrayBuffer();
}
fs.writeFileSync(out+'/production.json',JSON.stringify({checkedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,publishedAssetsMatch:matched,hashes,anonymousAccess:access,realMunicipalSessionTested:false,municipalBackendWrites:false},null,2));
assert.equal(matched,true,'Published resources must match this exact build');assert.ok(access.every(r=>r.status===401),'Unauthenticated reads must stay denied');console.log(JSON.stringify({publishedAssetsMatch:matched,assets:hashes.length,anonymousStatuses:access.map(x=>x.status)}));
