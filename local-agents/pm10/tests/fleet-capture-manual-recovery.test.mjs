// Synthetic filesystem and injected reader only. No listener, VPN, credential file or real clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {captureClock,validateFleetConfig,requestReviewedCaptureRecovery} from '../../clock-fleet/runner.mjs';
import {captureRecoveryReadiness,acquireCaptureRecoveryOwner,beginCaptureRecovery} from '../../clock-fleet/capture-recovery.mjs';
import {acquireLock} from '../store.mjs';
import {dataSet} from './fixture.mjs';
import {RELEASE_FILES} from '../../../scripts/build-municipal-clock-release.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const later=()=>new Date('2026-11-11T03:00:00.000Z');
const fail=code=>Object.assign(new Error(code),{code});
const bytes=value=>JSON.stringify(value,null,2)+'\n';
const readJson=async file=>JSON.parse(await fs.readFile(file,'utf8'));
function historical(clock){return {schemaVersion:'municontrol.attendance-download-pilot.v4.1',expectedSerial:clock.serial,
 status:'CONNECTION_OR_AUTH_FAILED',tcpConnected:true,authenticationAccepted:false,credentialAttempts:0,attendanceTransferComplete:false,
 error:{code:'RESPONSE_TIMEOUT',phase:'CONNECT'},diagnostics:{lastPhase:'CONNECT'},exchanges:[{code:1000,errorCode:'RESPONSE_TIMEOUT'}],
 configurationChanged:false,attendanceDeleted:false,biometricTemplatesRead:false,userDirectoryRead:false};}
function complete(clock,n=5){const raw=dataSet(n);return {raw,parsed:{layout:'legacy-40-byte-candidate'},report:{
 authenticationAccepted:true,finishedAt:later().toISOString(),metadata:{serialNumber:clock.serial,deviceTimeBefore:'2026-11-11T00:00:00'},
 transfer:{plannedBytes:raw.length,receivedBytes:raw.length,confirmedChunkBytes:raw.length},attendanceTransferComplete:true,
 cleanup:{bufferReleaseConfirmed:true,exitConfirmed:true}}};}
async function files(root){
 const out={};
 async function visit(directory,relative=''){
  for(const entry of await fs.readdir(directory,{withFileTypes:true})){
   const name=relative?relative+'/'+entry.name:entry.name;
   if(entry.name==='process.lock'||entry.name==='process.lock.transition')continue;
   if(entry.isDirectory())await visit(path.join(directory,entry.name),name);
   else out[name]=await fs.readFile(path.join(directory,entry.name));
  }
 }
 await visit(root);return out;
}
async function setup(run){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-clock-recovery-synthetic-'));
 const fleet=validateFleetConfig({schema:'municontrol-clock-fleet.v1',approved:true,stateDir:root,maxQueueMiB:64,minFreeMiB:64,
  clocks:['qa-first','qa-second'].map((clockId,index)=>({clockId,label:'Synthetic '+clockId,host:'172.100.126.'+(240+index),port:4370,
   serial:'SYNTHETIC-'+index,credentialFile:path.join(root,'synthetic-'+index+'.key'),pollSeconds:60,enabled:true}))});
 const clock=fleet.clocks[0],directory=path.join(root,clock.clockId),statusFile=path.join(directory,'status.json');
 const io={route:async()=>({localLookup:true}),credential:async()=>Buffer.from('0'),collect:async()=>complete(clock,3),now:later};
 try{
  for(const c of fleet.clocks){
   const initial=complete(c,3);initial.report.finishedAt='2026-10-06T11:21:31.846Z';initial.report.metadata.deviceTimeBefore='2026-10-06T08:21:31';
   await captureClock(fleet,c,{...io,now:()=>new Date('2026-10-06T11:21:00Z'),collect:async()=>initial});
  }
  const state=await readJson(statusFile);Object.assign(state,{status:'blocked',blocked:true,failureCount:6,connectionFailureCount:1000,
   lastAttemptAt:'2026-10-29T19:46:15.495Z',lastError:'RESPONSE_TIMEOUT',nextPollAt:null});
  await fs.writeFile(statusFile,bytes(state));await fs.writeFile(path.join(directory,'attempt-report.json'),bytes(historical(clock)));
  await fs.mkdir(path.join(directory,'delivery-zk40'),{mode:0o700});await fs.writeFile(path.join(directory,'delivery-zk40','ack-synthetic.json'),'synthetic-ack-preserved\n');
  const ctx={root,fleet,clock,directory,statusFile,io,state};
  ctx.review=async patch=>{
   const ready=await captureRecoveryReadiness(fleet,clock);
   return {version:'clock-capture-recovery-review.v1',requestId:randomUUID(),clockId:clock.clockId,serial:clock.serial,
    configurationSha256:ready.configurationSha256,statusSha256:ready.statusSha256,reportSha256:ready.reportSha256,
    reason:'Revisión exclusivamente sintética del retorno de enlace y bloqueo conocido',...patch};
  };
  ctx.request=async review=>requestReviewedCaptureRecovery(fleet,review,{now:later});
  ctx.owner=async work=>{const acquired=await acquireCaptureRecoveryOwner(fleet);try{return await work(acquired.owner);}finally{await acquired.release();}};
  ctx.operation=review=>path.join(directory,'capture-recovery',review.requestId);
  await run(ctx);
 }finally{
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'mc-clock-recovery-synthetic-'));
  await fs.rm(root,{recursive:true,force:true});
 }
}
test('readiness reads metadata only and an unreviewed persisted block makes zero route/key/reader calls',async()=>setup(async c=>{
 const before=await files(c.root);await c.review();assert.deepEqual(await files(c.root),before);
 let calls=0;const state=await captureClock(c.fleet,c.clock,{route:async()=>{calls++;},credential:async()=>{calls++;},collect:async()=>{calls++;}});
 assert.equal(state.blocked,true);assert.equal(calls,0);assert.deepEqual(await files(c.root),before);
}));
test('review rejects stale preimages and a different clock identity before creating a request',async()=>setup(async c=>{
 const before=await fs.readFile(c.statusFile);const bad=await c.review({statusSha256:'f'.repeat(64)});
 await assert.rejects(c.request(bad),/CAPTURE_RECOVERY_PREIMAGE_CHANGED/);
 const wrong=await c.review({serial:'OTHER'});await assert.rejects(c.request(wrong),/CAPTURE_RECOVERY_IDENTITY_CHANGED/);
 assert.deepEqual(await fs.readFile(c.statusFile),before);
}));
test('a single owned recovery preserves historical bytes, sibling, queues and ACKs and admits the next normal cycle only after complete capture',async()=>setup(async c=>{
 const before=await files(c.root),review=await c.review();await c.request(review);
 const op=c.operation(review);assert.deepEqual(await fs.readFile(path.join(op,'status-before.json')),before[c.clock.clockId+'/status.json']);
 assert.deepEqual(await fs.readFile(path.join(op,'attempt-before.json')),before[c.clock.clockId+'/attempt-report.json']);
 let calls=0;const result=await c.owner(owner=>captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:owner,collect:async()=>{calls++;return complete(c.clock);}}));
 assert.equal(result.status,'captured_locally');assert.equal(result.blocked,false);assert.equal(result.uniqueLocalRecords,5);assert.equal(calls,1);
 const receipt=await readJson(path.join(op,'result.json'));assert.equal(receipt.outcome,'capture_complete');assert.equal(receipt.automaticRetry,false);
 assert.equal(receipt.statusAfterSha256,sha(await fs.readFile(c.statusFile)));
 const after=await files(c.root);
 for(const [name,value]of Object.entries(before))if(![c.clock.clockId+'/status.json',c.clock.clockId+'/attempt-report.json'].includes(name))assert.deepEqual(after[name],value,name);
 await captureClock(c.fleet,c.clock,{...c.io,now:()=>new Date(later().getTime()+61000),collect:async()=>{calls++;return complete(c.clock);}});
 assert.equal(calls,2);assert.equal((await readJson(c.statusFile)).uniqueLocalRecords,5);
}));
test('a request cannot create or substitute the sole collector owner',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);let calls=0;
 await captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:{},collect:async()=>{calls++;return complete(c.clock);}});
 assert.equal(calls,0);await assert.rejects(fs.stat(path.join(c.operation(review),'consumed.json')),error=>error.code==='ENOENT');
 await c.owner(async()=>{await assert.rejects(acquireCaptureRecoveryOwner(c.fleet),error=>error.code==='ALREADY_RUNNING');});
}));
test('the reviewed class rejects authentication, serial and post-auth reports',async()=>setup(async c=>{
 for(const patch of [{authenticationAccepted:true},{credentialAttempts:1},{expectedSerial:'OTHER'},{error:{code:'RESPONSE_TIMEOUT',phase:'SERIAL_READ'}}]){
  await fs.writeFile(path.join(c.directory,'attempt-report.json'),bytes({...historical(c.clock),...patch}));
  await assert.rejects(c.review(),/CAPTURE_RECOVERY_CLASS_NOT_REVIEWED/);
 }
}));
test('cancellation consumes the request once, keeps the block and never starts I/O on a later timer',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);const controller=new AbortController();controller.abort();let calls=0;
 const io={...c.io,route:async()=>{calls++;return {localLookup:true};}};
 await c.owner(owner=>captureClock(c.fleet,c.clock,{...io,recoveryOwner:owner,signal:controller.signal}));
 const receipt=await readJson(path.join(c.operation(review),'result.json'));assert.equal(receipt.code,'CANCELLED');assert.equal(receipt.outcome,'blocked');
 await c.owner(owner=>captureClock(c.fleet,c.clock,{...io,recoveryOwner:owner}));assert.equal(calls,0);assert.equal((await readJson(c.statusFile)).blocked,true);
}));
test('timeout preserves the block, records a terminal outcome and makes no automatic retry or replay',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);let calls=0;
 const io={...c.io,collect:async()=>{calls++;throw fail('RESPONSE_TIMEOUT');}};
 await c.owner(owner=>captureClock(c.fleet,c.clock,{...io,recoveryOwner:owner}));
 const receipt=await readJson(path.join(c.operation(review),'result.json'));assert.equal(receipt.code,'RESPONSE_TIMEOUT');
 const state=await readJson(c.statusFile);assert.equal(state.blocked,true);assert.equal(state.nextPollAt,null);assert.equal(state.failureCount,7);
 await c.owner(owner=>captureClock(c.fleet,c.clock,{...io,recoveryOwner:owner}));assert.equal(calls,1);
 await assert.rejects(c.request(review),/CAPTURE_RECOVERY_(PREIMAGE_CHANGED|REQUEST_REPLAY)/);
 assert.deepEqual(await readJson(path.join(c.operation(review),'result.json')),receipt);
}));
test('a lost route remains blocked after consumption with zero credential or reader calls',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);let keys=0,reads=0;
 await c.owner(owner=>captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:owner,route:async()=>{throw fail('MUNICIPAL_ROUTE_REQUIRED');},credential:async()=>{keys++;},collect:async()=>{reads++;}}));
 assert.equal(keys,0);assert.equal(reads,0);assert.equal((await readJson(c.statusFile)).blocked,true);
 assert.equal((await readJson(path.join(c.operation(review),'result.json'))).code,'MUNICIPAL_ROUTE_REQUIRED');
}));
test('insufficient storage cannot bypass capacity or release the block',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);let reads=0;
 await c.owner(owner=>captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:owner,freeBytes:async()=>0,collect:async()=>{reads++;}}));
 assert.equal(reads,0);assert.equal((await readJson(c.statusFile)).blocked,true);
 assert.equal((await readJson(path.join(c.operation(review),'result.json'))).code,'DISK_SPACE_LOW');
}));
test('corrupt queue evidence is retained and a recovery receipt never authorizes rewriting status or queue',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);const before=await fs.readFile(c.statusFile);
 const bad=path.join(c.directory,'pending','unexpected');await fs.mkdir(bad);await fs.writeFile(path.join(bad,'raw.bin'),'corrupt synthetic source');
 await assert.rejects(c.owner(owner=>captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:owner})),/QUEUE_CORRUPT/);
 assert.deepEqual(await fs.readFile(c.statusFile),before);assert.equal(await fs.readFile(path.join(bad,'raw.bin'),'utf8'),'corrupt synthetic source');
 assert.equal((await readJson(path.join(c.operation(review),'result.json'))).outcome,'blocked');
}));
test('a status changed after review produces a terminal stale rejection without network or overwriting the new state',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);const state=await readJson(c.statusFile);state.failureCount=7;await fs.writeFile(c.statusFile,bytes(state));
 const before=await fs.readFile(c.statusFile);let calls=0;
 await c.owner(owner=>captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:owner,route:async()=>{calls++;}}));
 assert.equal(calls,0);assert.deepEqual(await fs.readFile(c.statusFile),before);
 const receipt=await readJson(path.join(c.operation(review),'result.json'));assert.equal(receipt.code,'CAPTURE_RECOVERY_PREIMAGE_CHANGED');assert.equal(receipt.statusAfterSha256,sha(before));
}));
test('a durable consumed marker survives an interrupted process phase and prevents reattempt after restart',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);
 await c.owner(async owner=>{
  const release=await acquireLock(c.directory);
  try{const attempt=await beginCaptureRecovery(c.fleet,c.clock,await readJson(c.statusFile),{owner,now:later});assert.equal(attempt.allowed,true);}
  finally{await release();}
 });
 let reads=0;await c.owner(owner=>captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:owner,collect:async()=>{reads++;}}));
 assert.equal(reads,0);assert.equal((await readJson(c.statusFile)).blocked,true);
 await assert.rejects(fs.stat(path.join(c.operation(review),'result.json')),error=>error.code==='ENOENT');
 await assert.rejects(c.request(await c.review()),/CAPTURE_RECOVERY_INTERRUPTED_REVIEW/);
}));

test('missing identity remains missing and cannot be reconstructed by the review command',async()=>setup(async c=>{
 const review=await c.review();await fs.rename(path.join(c.directory,'identity.json'),path.join(c.directory,'identity-synthetic-held.json'));
 const status=await fs.readFile(c.statusFile);
 await assert.rejects(c.request(review),error=>error.code==='ENOENT');
 await assert.rejects(fs.stat(path.join(c.directory,'identity.json')),error=>error.code==='ENOENT');
 assert.deepEqual(await fs.readFile(c.statusFile),status);
}));
test('a corrupt recovery request stays intact and cannot overwrite a persisted capture block',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);const status=await fs.readFile(c.statusFile),op=c.operation(review);
 await fs.writeFile(path.join(op,'request.json'),'corrupt synthetic recovery evidence');
 await assert.rejects(c.owner(owner=>captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:owner})),/CAPTURE_RECOVERY_EVIDENCE_INVALID/);
 assert.deepEqual(await fs.readFile(c.statusFile),status);
 assert.equal(await fs.readFile(path.join(op,'request.json'),'utf8'),'corrupt synthetic recovery evidence');
}));

test('the current collector configuration must match the reviewed configuration',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);const before=await fs.readFile(c.statusFile);
 const next=validateFleetConfig({...c.fleet,clocks:c.fleet.clocks.map(value=>({...value,label:value.label+' reviewed later'}))});
 const acquired=await acquireCaptureRecoveryOwner(next);let reads=0;
 try{await captureClock(next,next.clocks[0],{...c.io,recoveryOwner:acquired.owner,collect:async()=>{reads++;return complete(c.clock);}});}
 finally{await acquired.release();}
 assert.equal(reads,0);assert.deepEqual(await fs.readFile(c.statusFile),before);
 assert.equal((await readJson(path.join(c.operation(review),'result.json'))).code,'CAPTURE_RECOVERY_PREIMAGE_CHANGED');
}));
test('the global collector owner cannot consume without the separate clock lock',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);
 await c.owner(owner=>assert.rejects(beginCaptureRecovery(c.fleet,c.clock,c.state,{owner}),/CAPTURE_RECOVERY_CLOCK_OWNER_REQUIRED/));
 await assert.rejects(fs.stat(path.join(c.operation(review),'consumed.json')),error=>error.code==='ENOENT');
}));
test('a failed completion receipt cannot expose an unblocked status even after a complete capture',async()=>setup(async c=>{
 const review=await c.review();await c.request(review);const before=await fs.readFile(c.statusFile),op=c.operation(review);
 await fs.writeFile(path.join(op,'result.json'),'synthetic conflicting receipt');let reads=0;
 await assert.rejects(c.owner(owner=>captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:owner,collect:async()=>{reads++;return complete(c.clock);}})),error=>error.code==='EEXIST');
 assert.deepEqual(await fs.readFile(c.statusFile),before);
 assert.equal(await fs.readFile(path.join(op,'result.json'),'utf8'),'synthetic conflicting receipt');
 await c.owner(owner=>captureClock(c.fleet,c.clock,{...c.io,recoveryOwner:owner,collect:async()=>{reads++;return complete(c.clock);}}));
 assert.equal(reads,1);
}));


test('the offline release includes the recovery dependency used by the normal collector',()=>{
  assert.ok(RELEASE_FILES['clock-fleet'].includes('capture-recovery.mjs'));
});