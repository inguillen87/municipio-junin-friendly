import test from 'node:test';import assert from 'node:assert/strict';import os from 'node:os';import path from 'node:path';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {control,desiredState,pm10CaptureOverview} from '../../clock-fleet/control.mjs';import {fleetOverview} from '../../clock-fleet/overview.mjs';
async function fixture(parent=os.tmpdir()){const root=await mkdtemp(path.join(parent,'fleet-control-'));await mkdir(path.join(root,'config'));const config={schema:'municontrol-clock-fleet.v1',approved:true,stateDir:path.join(root,'state'),maxQueueMiB:128,minFreeMiB:128,clocks:[{clockId:'clock-test',label:'Sede <script>prueba</script>',host:'172.100.126.241',port:4370,serial:'SYNTHETIC-ONLY',credentialFile:path.join(root,'never-read.key'),pollSeconds:900,enabled:true}]};await writeFile(path.join(root,'config','fleet.json'),JSON.stringify(config));return{root,config};}
test('missing desired state never starts a clock',async()=>{const {root}=await fixture();try{let calls=0;const r=await control(['tick','--base',root],{execute:async()=>{calls++;}});assert.equal(r.state,'stopped');assert.equal(calls,0);}finally{await rm(root,{recursive:true,force:true});}});
test('start enables future ticks, stop persists without discarding any queue',async()=>{const {root}=await fixture();try{let calls=0;const run=args=>control(args,{execute:async()=>{calls++;}});await run(['start','--base',root]);assert.equal(calls,0);await run(['tick','--base',root]);assert.equal(calls,1);await run(['stop','--base',root]);await run(['tick','--base',root]);assert.equal(calls,1);assert.equal(JSON.parse(await readFile(path.join(root,'control','desired.json'))).state,'stopped');}finally{await rm(root,{recursive:true,force:true});}});
test('malformed control is preserved and refuses execution',async()=>{const {root}=await fixture();try{await mkdir(path.join(root,'control'),{mode:0o700});const file=path.join(root,'control','desired.json');await writeFile(file,'{broken');await assert.rejects(control(['tick','--base',root],{execute:async()=>assert.fail()}),e=>e.code==='FLEET_CONTROL_INVALID');assert.equal(await readFile(file,'utf8'),'{broken');}finally{await rm(root,{recursive:true,force:true});}});
test('another live cycle is left untouched',async()=>{const {root}=await fixture();try{await control(['start','--base',root]);const r=await control(['tick','--base',root],{execute:async()=>{throw Object.assign(Error(),{code:'ALREADY_RUNNING'});}});assert.equal(r.state,'cycle_already_running');}finally{await rm(root,{recursive:true,force:true});}});
test('stop while a cycle finishes remains stopped at its completion',async()=>{const {root}=await fixture();try{await control(['start','--base',root]);await control(['tick','--base',root],{execute:async()=>{await control(['stop','--base',root]);}});assert.equal(desiredState(JSON.parse(await readFile(path.join(root,'control','desired.json')))),'stopped');}finally{await rm(root,{recursive:true,force:true});}});
test('summary is sanitized, distinguishes local capture and server reception and never exposes raw identifiers',()=>{const config={clocks:[{clockId:'clock-test',label:'Sede <script>alert(1)</script>',host:'172.100.126.241',serial:'PRIVATE-SERIAL',credentialFile:'PRIVATE-KEY'}]};const html=fleetOverview(config,{updatedAt:'2026-09-17T13:00:00Z',clocks:[{clockId:'clock-test',status:'captured_locally',uniqueLocalRecords:10}]});assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|PRIVATE-SERIAL|PRIVATE-KEY|172\.100/);assert.match(html,/Recepción no consultada/);assert.match(html,/Sin comprobación/);});
test('invalid desired states are rejected',()=>{for(const v of [null,{}, {schema:'clock-fleet-desired.v1',state:'running',updatedAt:'wrong'}])assert.throws(()=>desiredState(v));});

const at='2026-09-23T12:00:00.000Z',before='2026-09-22T12:00:00.000Z';
const capture=()=>({schema:'pm10-local-status.v1',mode:'capture_only',cloudReception:'not_connected',cloudConfirmedRecords:0,
 status:'blocked',blocked:true,lastError:'TRANSFER_NOT_CONFIRMED',failureCount:1,lastAttemptAt:at,lastCaptureAt:before,
 lastCaptureSha256:'a'.repeat(64),snapshotRecordCount:10,uniqueLocalRecords:8,nextPollAt:null});
const delivery=()=>({version:'pm10-sender-status.v1',state:'queue_confirmed',updatedAt:before,physicalClockVerified:false,
 confirmedRecords:8,remainingParts:0,sent:1,lastReceiptAt:before,captureFilesRemoved:false});
async function withPm10(c,d,run){
 const parent=await mkdtemp(path.join(os.tmpdir(),'fleet-pm10-view-'));
 try{const {root}=await fixture(parent),state=path.join(parent,'PM10','state');await mkdir(path.join(state,'delivery'),{recursive:true});
  const files=[];for(const [name,value]of [['status.json',c],[path.join('delivery','status.json'),d]])if(value!==undefined){
   const file=path.join(state,name),bytes=typeof value==='string'?value:JSON.stringify(value);await writeFile(file,bytes);files.push([file,bytes]);
  }
  let calls=0;const result=await control(['status','--base',root],{execute:async()=>{calls++;}}),html=await readFile(path.join(root,'estado.html'),'utf8');
  assert.equal(calls,0);assert.equal(result.state,'stopped');for(const [file,bytes]of files)assert.equal(await readFile(file,'utf8'),bytes);
  await run(html,root);
 }finally{await rm(parent,{recursive:true,force:true});}
}
test('PM10 projection contains only reviewed capture fields and sanitizes arbitrary errors',()=>{
 const raw={...capture(),lastError:'PRIVATE_PERSON_NAME',serial:'PRIVATE_SERIAL',host:'192.0.2.123',token:'PRIVATE_TOKEN',records:['PRIVATE_RECORD']};
 const result=pm10CaptureOverview(raw);assert.equal(result.state,'blocked');assert.equal(result.blocked,true);assert.equal(result.lastError,'REVIEW_REQUIRED');
 assert.deepEqual(Object.keys(result).sort(),['state','blocked','lastError','checkedAt','lastAttemptAt','lastCaptureAt','nextPollAt','records','evidenceState'].sort());
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|192\.0\.2/);assert.equal(result.records,8);assert.equal(result.lastCaptureAt,before);
});
test('PM10 projection rejects malformed status, timestamps and counts',()=>{
 for(const patch of [{schema:'wrong'},{mode:'write'},{status:'arbitrary'},{blocked:'true'},{status:'blocked',blocked:false},{lastCaptureAt:'2026-02-30T12:00:00Z'},
  {nextPollAt:'not a date'},{lastAttemptAt:null,lastCaptureAt:'yesterday'},{uniqueLocalRecords:-1},{failureCount:1001},{lastCaptureSha256:'wrong'},
  {status:'captured_locally',lastCaptureAt:null},{cloudConfirmedRecords:1}])assert.throws(()=>pm10CaptureOverview({...capture(),...patch}),e=>e.code==='FLEET_CONTROL_INVALID');
});
test('current control panel preserves PM10 capture block alongside a previous receipt',()=>withPm10(capture(),delivery(),html=>{
 assert.match(html,/PM-10 · Edificio Viejo/);assert.match(html,/Captura detenida para revisión/);assert.match(html,/data-metric="needsReview"><strong>1/);
 assert.match(html,/data-metric="withReceipt"><strong>1/);assert.match(html,/Acuse guardado/);assert.match(html,/Registros locales únicos<\/dt><dd>8/);
 assert.doesNotMatch(html,/TRANSFER_NOT_CONFIRMED|captura nueva pendiente/i);
}));
test('missing PM10 delivery does not hide a valid capture block',()=>withPm10(capture(),undefined,html=>{
 assert.match(html,/Captura detenida para revisión/);assert.match(html,/Recepción no consultada/);assert.match(html,/data-metric="needsReview"><strong>1/);
}));
test('invalid PM10 delivery does not hide capture and cannot supply a receipt count',()=>withPm10(capture(),{...delivery(),version:'wrong',confirmedRecords:987654321},html=>{
 assert.match(html,/Captura detenida para revisión/);assert.match(html,/Recepción por revisar/);assert.doesNotMatch(html,/987654321/);
 assert.match(html,/data-metric="withReceipt"><strong>0/);
}));
test('invalid PM10 capture retains an independently valid receipt but clears capture metrics',()=>withPm10('{broken',delivery(),html=>{
 assert.match(html,/Estado de captura por revisar/);assert.match(html,/Acuse guardado/);assert.match(html,/data-metric="captured"><strong>0/);
 assert.match(html,/data-metric="withReceipt"><strong>1/);
}));
test('PM10 connection wait remains a scheduled attempt, never an inferred authentication block',()=>withPm10({...capture(),status:'connection_wait',blocked:false,lastError:'ECONNREFUSED',nextPollAt:at},delivery(),html=>{
 assert.match(html,/Esperando conexión al reloj/);assert.match(html,/no llegó a establecer una sesión/);assert.match(html,/data-metric="needsReview"><strong>0/);
 assert.doesNotMatch(html,/Captura detenida para revisión|ECONNREFUSED|PRIVATE/);
}));
test('unknown PM10 capture error and extra private fields do not reach the panel',()=>withPm10({...capture(),lastError:'PRIVATE_NAME',token:'PRIVATE_TOKEN',user:'PRIVATE_USER'},delivery(),html=>{
 assert.match(html,/Captura detenida para revisión/);assert.doesNotMatch(html,/PRIVATE_/);
}));
