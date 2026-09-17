// Public release bytes + anonymous rejection. No private records, credentials or login.
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {setTimeout as sleep} from 'node:timers/promises';
export async function verifyLegalRegistryPublication(output){
 const origin='https://municipio-junin-friendly.vercel.app',html=fs.readFileSync('public/juridica-registro.html','utf8');
 const bundle=html.match(/src="(\/assets\/islands\/legal-registry-[^"]+\.js)"/)?.[1];assert.ok(bundle,'Compiled legal registry entry required');
 const files=['juridica-registro.html','internal-dashboard.html','assets/legal-registry-model.js','assets/legal-registry.css','assets/legal-pdf-text-worker.js','assets/legal-pdf-text-model.js','assets/legal-registry-entry-card.css','assets/app-routes.js','assets/work-area-model.js',bundle.slice(1)];
 const hash=b=>createHash('sha256').update(b).digest('hex');const expected=Object.fromEntries(files.map(f=>[f,hash(fs.readFileSync('public/'+f))]));
 for(let attempt=1;attempt<=24;attempt++){
  try{for(const file of files){const r=await fetch(origin+'/'+file,{cache:'no-store',redirect:'follow',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,file);assert.equal(hash(Buffer.from(await r.arrayBuffer())),expected[file],'Published bytes differ: '+file);}break;}
  catch(error){console.log('Registry publication check '+attempt+': '+error.message.split('\n')[0]);if(attempt===24)throw error;await sleep(7500);}
 }
 const page=await fetch(origin+'/juridica',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(page.status,200);assert.match(await page.text(),/legalRegistryRoot/);
 const r=await fetch(origin+'/api/internal-legal-registry?resource=bootstrap',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,401,'Anonymous registry API must remain denied');assert.match(r.headers.get('cache-control')||'',/no-store/);
 const result={ok:true,checkedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,files:expected,cleanRouteStatus:200,anonymousApiStatus:401,municipalSessionTested:false,realMunicipalWrites:0};
 fs.writeFileSync(output+'/publication.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));return result;
}
