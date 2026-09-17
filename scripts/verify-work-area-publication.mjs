// Verify published code equality; no login, private data or writes.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
export async function verifyWorkAreaPublication(output){
 const origin='https://municipio-junin-friendly.vercel.app';
 const files=['assets/work-area-model.js','assets/work-area-menu.js','assets/work-area-menu.css','assets/liquidaciones-menu.js','internal-dashboard.html','modulos.html'];
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const expected=Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync('public/'+f))]));
 for(let attempt=1;attempt<=30;attempt++){
  try{for(const file of files){const response=await fetch(origin+'/'+file,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(response.status,200,file);assert.equal(hash(Buffer.from(await response.arrayBuffer())),expected[file],'Publication differs: '+file);}break;}
  catch(error){console.log('Publication check '+attempt+': '+error.message.split('\n')[0]);if(attempt===30)throw error;await sleep(6000);}
 }
 const auth=await fetch(origin+'/api/internal-data?resource=employees',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.equal(auth.status,401,'Anonymous workforce data must remain denied');assert.match(auth.headers.get('cache-control')||'',/no-store/);
 const result={ok:true,checkedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,files:expected,anonymousDataStatus:401,realMunicipalSessionTested:false,realApiWrites:0};
 fs.writeFileSync(output+'/publication.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));return result;
}
