/** Exact public asset checks and anonymous-denial probes only. No municipal session. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app';
const assets=['assets/legal-read-controller.js','assets/legal-alert-center-ui.js','assets/legal-contract-agenda-ui.js','assets/legal-contract-agenda-model.js'];
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const expected=new Map(assets.map(name=>[name,digest(fs.readFileSync(name))]));
let success=null,lastError='';
for(let attempt=1;attempt<=24;attempt++){
 try{
  const verified=[];
  for(const name of assets){
   const response=await fetch(origin+'/'+name+'?release='+encodeURIComponent(process.env.GITHUB_SHA||'verify'),{cache:'no-store',signal:AbortSignal.timeout(15000)});
   assert.equal(response.status,200,'asset status');
   const actual=digest(Buffer.from(await response.arrayBuffer()));assert.equal(actual,expected.get(name),'asset fingerprint '+name);verified.push({path:name,sha256:actual});
  }
  const denied=[];
  for(const resource of ['/api/internal-legal-alert-center?resource=alerts&version=2','/api/internal-legal-contract-agenda?resource=agenda']){
   const response=await fetch(origin+resource,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(response.status,401,'anonymous read must be denied');denied.push({path:resource,status:response.status});await response.body?.cancel();
  }
  success={ok:true,commit:process.env.GITHUB_SHA||null,origin,verified,denied,attempt,checkedAt:new Date().toISOString(),realMunicipalSessionTested:false,databaseWrites:0};break;
 }catch(error){lastError=String(error.message).slice(0,300);if(attempt<24)await new Promise(resolve=>setTimeout(resolve,15000));}
}
fs.mkdirSync('verification',{recursive:true});
fs.writeFileSync('verification/legal-read-production.json',JSON.stringify(success||{ok:false,lastError,databaseWrites:0},null,2));
assert.ok(success,'LEGAL_PRODUCTION_RELEASE_NOT_VERIFIED');console.log(JSON.stringify(success));
