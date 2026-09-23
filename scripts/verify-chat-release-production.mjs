/** Public release hashes and anonymous denial only. No municipal session or database writes. */
import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const origin='https://municipio-junin-friendly.vercel.app',hash=b=>createHash('sha256').update(b).digest('hex');
const files=['assets/budget-structure-model.js','assets/budget-structure-pdf.js','assets/budget-structure-workbench.js','assets/budget-structure-worker.js','assets/budget-structure.css','assets/legal-read-controller.js'];
const expected=new Map(files.map(name=>[name,hash(fs.readFileSync(name))]));
const tone=text=>{const a=text.indexOf('    function statusTone(value)'),b=text.indexOf('    function pill(',a);assert.ok(a>0&&b>a);return text.slice(a,b).trim()};
const expectedTone=tone(fs.readFileSync('administracion-plataforma.html','utf8'));
const request=async name=>{const r=await fetch(origin+'/'+name,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,'Public file status '+name);return Buffer.from(await r.arrayBuffer())};
let result,lastError;
for(let attempt=1;attempt<=24;attempt++){
 try{
  const assets=[];for(const name of files){const digest=hash(await request(name));assert.equal(digest,expected.get(name),'Asset differs '+name);assets.push({path:name,sha256:digest})}
  const admin=(await request('administracion-plataforma.html')).toString('utf8');assert.equal(tone(admin),expectedTone,'Admin status logic differs');
  const report=(await request('assets/report-centre.js')).toString('utf8');assert.ok(report.includes('mountAuthorizedBudgetStructure')&&report.includes("label:'Estructura de cargos'"),'Report workspace missing');
  assert.ok((await request('reportes-rrhh.html')).toString('utf8').includes('assets/budget-structure.css'),'Report styles missing');
  const denied=[];for(const route of ['/api/internal-data?resource=employees','/api/internal-legal-alert-center?resource=alerts&version=2']){const r=await fetch(origin+route,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,401,'Anonymous private read '+route);await r.body?.cancel();denied.push({route,status:r.status})}
  result={ok:true,commit:process.env.GITHUB_SHA??null,checkedAt:new Date().toISOString(),origin,assets,adminStatusMatched:true,reportWorkspacePresent:true,denied,attempt,databaseWrites:0,realMunicipalSessionTested:false};break;
 }catch(e){lastError=String(e.message).slice(0,250);if(attempt<24)await new Promise(r=>setTimeout(r,15000))}
}
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/chat-release-production.json',JSON.stringify(result??{ok:false,lastError,databaseWrites:0},null,2));assert.ok(result,'PRODUCTION_RELEASE_NOT_VERIFIED');console.log(JSON.stringify(result));
