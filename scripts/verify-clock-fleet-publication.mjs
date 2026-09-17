// Public assets and anonymous boundary only. No signing/employee/device credentials and no data writes.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {setTimeout as sleep} from 'node:timers/promises';
const origin='https://municipio-junin-friendly.vercel.app',out='verification/clock-fleet';fs.mkdirSync(out,{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=['assets/clock-fleet-model.js','assets/clock-fleet-panel.js','assets/clock-fleet-panel.css','assets/pm10-reception.js','relojes-marcaciones.html'];
const expected=Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync('public/'+f))]));
for(let attempt=1;attempt<=40;attempt++){
 try{for(const [file,sha]of Object.entries(expected)){const url=file.endsWith('.html')?origin+'/relojes':origin+'/'+file;const r=await fetch(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,file);assert.equal(hash(Buffer.from(await r.arrayBuffer())),sha,file+' is not the release');}break;}
 catch(error){console.log('Publication check '+attempt+': '+error.message.split('\n')[0]);if(attempt===40)throw error;await sleep(6000);}
}
const r=await fetch(origin+'/api/internal-clock-fleet',{cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
assert.equal(r.status,401,'Fleet is not public municipal data');assert.match(r.headers.get('cache-control')||'',/no-store/);
const invalid=await fetch(origin+'/api/internal-clock-fleet?tenant=not-allowed',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(invalid.status,400);
const legacy=await fetch(origin+'/api/attendance-pm10',{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(legacy.status,405);
const additional=await fetch(origin+'/api/attendance-zk40',{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(additional.status,405);
const report={ok:true,commit:process.env.GITHUB_SHA||null,checkedAt:new Date().toISOString(),files:expected,anonymousFleetRead:401,scopeOverrideRejected:400,existingPm10Method:405,additionalClockMethod:405,nominalDataRequested:false,realMunicipalSessionTested:false,clockRequests:0,municipalWrites:0};
fs.writeFileSync(out+'/publication.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
