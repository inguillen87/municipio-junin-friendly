/** Triggers only existing owner-preauthorized jobs. No data, URLs, or secrets in CI. */
import fs from 'node:fs';
const origin='https://municipio-junin-friendly.vercel.app';
const jobs=JSON.parse(fs.readFileSync('ops/payroll-delivery-jobs.json','utf8'));
if(!Array.isArray(jobs)||jobs.length<1||jobs.length>6||jobs.some(x=>! /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x)))throw Error('INVALID_JOB_LIST');
const results=[];
for(const jobId of jobs){
 const r=await fetch(origin+'/api/payroll-source-delivery',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jobId,mode:'pull'}),signal:AbortSignal.timeout(65000),redirect:'error'});
 let body;try{body=await r.json()}catch{throw Error('DELIVERY_RESPONSE_INVALID')}
 if(!r.ok||body.ok!==true||body.datasetId!==jobId||body.payrollModified!==false)throw Error('DELIVERY_NOT_COMPLETED: '+r.status);
 results.push({jobId,statements:body.statements,lines:body.lines,replayed:body.replayed,payrollModified:false});
}
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/private-delivery-receipts.json',JSON.stringify({checkedAt:new Date().toISOString(),receipts:results,privateContentsLogged:false},null,2));
console.log('Delivery receipts:',results.map(x=>({statements:x.statements,lines:x.lines,replayed:x.replayed})));
