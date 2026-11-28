import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import net from 'node:net';
import {beforeAuthentication,beforeClockSession,nextCaptureFailure,unattendedRetryAllowed,verifiedPriorCapture} from '../../clock-fleet/capture-policy.mjs';
import {collectConfigured} from '../reader/lector-fichadas.mjs';
import {captureClock,validateFleetConfig} from '../../clock-fleet/runner.mjs';
import {dataSet} from './fixture.mjs';
const offline=()=>({report:{schemaVersion:'municontrol.attendance-download-pilot.v4.1',status:'CONNECTION_OR_AUTH_FAILED',tcpConnected:false,authenticationAccepted:false,credentialAttempts:0,error:{phase:'TCP_CONNECT',code:'ETIMEDOUT'},diagnostics:{lastPhase:'TCP_CONNECT'}}});
const config=root=>validateFleetConfig({schema:'municontrol-clock-fleet.v1',approved:true,stateDir:root,maxQueueMiB:64,minFreeMiB:64,clocks:[{clockId:'qa-clock',label:'Reloj QA',serial:'SYNTHETIC-A',host:'172.100.126.245',port:4370,credentialFile:path.join(root,'qa.key'),pollSeconds:60,enabled:true}]});
const route=async()=>({localLookup:true}),credential=async()=>Buffer.from('0');
test('recovery needs explicit evidence that no TCP session or authentication began',()=>{
 assert.equal(beforeClockSession(offline()),true);
 for(const patch of [{tcpConnected:true},{credentialAttempts:1},{authenticationAccepted:true},{schemaVersion:'other'},{status:'AUTH_NOT_ACCEPTED'},{error:{phase:'READ',code:'ETIMEDOUT'}},{diagnostics:{lastPhase:'AUTH'}}])assert.equal(beforeClockSession({report:{...offline().report,...patch}}),false);
 assert.equal(beforeClockSession(null),false);
});
test('eight offline intervals resume automatically with the same approved key and keep queues empty until actual capture',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-retry-'));try{const fleet=config(root),clock=fleet.clocks[0];let time=new Date('2026-09-18T10:00:00.000Z'),calls=0;
 for(let n=1;n<=8;n++){const s=await captureClock(fleet,clock,{route,credential,collect:async(_c,o)=>{assert.equal(o.commKey.toString(),'0');calls++;return offline();},now:()=>time});
  assert.equal(s.blocked,false);assert.equal(s.failureCount,0);assert.equal(s.connectionFailureCount,n);assert.equal(s.status,'retry_wait');assert.ok(Date.parse(s.nextPollAt)-time<=900000);time=new Date(Date.parse(s.nextPollAt)+1);
 }
 const raw=dataSet(2),s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async(c,o)=>({raw,parsed:{layout:'legacy-40-byte-candidate'},report:{authenticationAccepted:true,finishedAt:time.toISOString(),metadata:{serialNumber:c.serial},transfer:{plannedBytes:raw.length,receivedBytes:raw.length,confirmedChunkBytes:raw.length},attendanceTransferComplete:true,cleanup:{bufferReleaseConfirmed:true,exitConfirmed:true}}})});
 assert.equal(calls,8);assert.equal(s.status,'captured_locally');assert.equal(s.connectionFailureCount,0);assert.equal(s.uniqueLocalRecords,2);assert.equal(s.cloudReception,'not_configured');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('ambiguous post-session errors still exhaust the original six-failure budget',()=>{
 let s={failureCount:0,connectionFailureCount:12};for(let n=1;n<=6;n++){s=nextCaptureFailure(s,{code:'RESPONSE_TIMEOUT',network:false,cancelled:false,preconnect:false,transient:true,pollSeconds:60,now:new Date('2026-09-18T10:00:00Z')});assert.equal(s.failureCount,n);assert.equal(s.blocked,n===6);}
 assert.equal(s.nextPollAt,null);
});
test('authentication failure remains blocked across restarts and never attempts another key',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-auth-'));try{const fleet=config(root),clock=fleet.clocks[0];let calls=0;
 const s=await captureClock(fleet,clock,{route,credential,collect:async()=>{calls++;return{report:{status:'AUTH_NOT_ACCEPTED',authenticationAccepted:false}};}});
 assert.equal(s.blocked,true);const original=await fs.readFile(path.join(root,clock.clockId,'status.json'),'utf8');
 await captureClock(fleet,clock,{route,credential,collect:async()=>{calls++;return offline();}});assert.equal(calls,1);assert.equal(await fs.readFile(path.join(root,clock.clockId,'status.json'),'utf8'),original);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('new counter is optional for old statuses but invalid values never overwrite evidence',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-status-'));try{const fleet=config(root),clock=fleet.clocks[0];const args={route,credential,collect:async()=>offline(),now:()=>new Date('2026-09-18T10:00:00Z')};await captureClock(fleet,clock,args);
 const file=path.join(root,clock.clockId,'status.json'),s=JSON.parse(await fs.readFile(file,'utf8'));delete s.connectionFailureCount;await fs.writeFile(file,JSON.stringify(s));assert.equal((await captureClock(fleet,clock,args)).connectionFailureCount,0);
 s.connectionFailureCount=-1;await fs.writeFile(file,JSON.stringify(s));const before=await fs.readFile(file,'utf8');await assert.rejects(captureClock(fleet,clock,args),e=>e.code==='FLEET_STATE_INVALID');assert.equal(await fs.readFile(file,'utf8'),before);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
const silent=serial=>({report:{schemaVersion:'municontrol.attendance-download-pilot.v4.1',expectedSerial:serial,status:'CONNECTION_OR_AUTH_FAILED',tcpConnected:true,authenticationAccepted:false,credentialAttempts:0,attendanceTransferComplete:false,
 error:{code:'RESPONSE_TIMEOUT',phase:'CONNECT'},diagnostics:{lastPhase:'CONNECT'},exchanges:[{code:1000,errorCode:'RESPONSE_TIMEOUT'}],configurationChanged:false,attendanceDeleted:false,biometricTemplatesRead:false,userDirectoryRead:false}});
const captured=(clock,time,n)=>{const raw=dataSet(n);return{raw,parsed:{layout:'legacy-40-byte-candidate'},report:{authenticationAccepted:true,finishedAt:time.toISOString(),metadata:{serialNumber:clock.serial},transfer:{plannedBytes:raw.length,receivedBytes:raw.length,confirmedChunkBytes:raw.length},attendanceTransferComplete:true,cleanup:{bufferReleaseConfirmed:true,exitConfirmed:true}}};};
const qa={clockId:'qa-clock',serial:'SYNTHETIC-A'};
const evidence={schema:'clock-fleet-status.v1',clockId:'qa-clock',serial:'SYNTHETIC-A',blocked:false,lastCaptureAt:'2026-10-06T11:21:31.846Z',lastCaptureSha256:'a'.repeat(64),snapshotRecordCount:3,newUniqueRecordsLastCycle:1,uniqueLocalRecords:3};
const statusFile=(root,clock)=>path.join(root,clock.clockId,'status.json');
const readStatus=async(root,clock)=>JSON.parse(await fs.readFile(statusFile(root,clock),'utf8'));
test('unattended retry of a silent reader needs evidence that no credential left this host and that the report is of this reader',()=>{
 assert.equal(beforeAuthentication(silent('SYNTHETIC-A'),qa),true);
 for(const patch of [{tcpConnected:false},{credentialAttempts:1},{authenticationAccepted:true},{attendanceTransferComplete:true},{schemaVersion:'other'},{status:'AUTH_NOT_ACCEPTED'},
  {error:{code:'RESPONSE_TIMEOUT',phase:'AUTH'}},{error:{code:'ECONNRESET',phase:'CONNECT'}},{diagnostics:{lastPhase:'SERIAL_READ'}},{exchanges:[]},{exchanges:[{code:1000},{code:1102}]},{exchanges:[{code:1102}]},
  {configurationChanged:true},{attendanceDeleted:true},{biometricTemplatesRead:true},{userDirectoryRead:true},{expectedSerial:'OTHER'},{expectedSerial:undefined},{expectedSerial:null},{expectedSerial:''}])
  assert.equal(beforeAuthentication({report:{...silent('SYNTHETIC-A').report,...patch}},qa),false,JSON.stringify(patch));
 const absent=silent('SYNTHETIC-A');delete absent.report.expectedSerial;assert.equal(beforeAuthentication(absent,qa),false);
 for(const clock of [null,{},{clockId:'qa-clock'},{clockId:'qa-clock',serial:''},{clockId:'qa-clock',serial:'OTHER'}])assert.equal(beforeAuthentication(silent('SYNTHETIC-A'),clock),false);
 assert.equal(beforeAuthentication(null,qa),false);
});
test('a previous capture counts only with coherent evidence bound to the same identity; empty and repeated captures count',()=>{
 assert.equal(verifiedPriorCapture(evidence,qa),true);
 // A complete capture of an empty reader, and one that only repeated earlier records, are still verified captures.
 assert.equal(verifiedPriorCapture({...evidence,snapshotRecordCount:0,newUniqueRecordsLastCycle:0,uniqueLocalRecords:0},qa),true);
 assert.equal(verifiedPriorCapture({...evidence,newUniqueRecordsLastCycle:0},qa),true);
 // Old evidence does not expire.
 assert.equal(verifiedPriorCapture({...evidence,lastCaptureAt:'2019-01-01T00:00:00Z'},qa),true);
 for(const patch of [{lastCaptureAt:''},{lastCaptureAt:'ayer'},{lastCaptureAt:'2026-10-06'},{lastCaptureAt:'2026-13-45T99:00:00Z'},{lastCaptureAt:null},{lastCaptureAt:undefined},{lastCaptureAt:1759749691846},
  {lastCaptureSha256:undefined},{lastCaptureSha256:null},{lastCaptureSha256:'a'.repeat(63)},{lastCaptureSha256:'A'.repeat(64)},{snapshotRecordCount:undefined},{snapshotRecordCount:-1},{snapshotRecordCount:1.5},
  {newUniqueRecordsLastCycle:undefined},{newUniqueRecordsLastCycle:4},{uniqueLocalRecords:undefined},{clockId:'other-clock'},{serial:'OTHER'},{schema:'other'}])
  assert.equal(verifiedPriorCapture({...evidence,...patch},qa),false,JSON.stringify(patch));
 assert.equal(verifiedPriorCapture(null,qa),false);assert.equal(verifiedPriorCapture(evidence,null),false);assert.equal(verifiedPriorCapture(evidence,{clockId:'qa-clock',serial:''}),false);
 assert.equal(unattendedRetryAllowed(evidence,silent('SYNTHETIC-A'),qa),true);
 assert.equal(unattendedRetryAllowed({...evidence,lastCaptureAt:''},silent('SYNTHETIC-A'),qa),false);
 assert.equal(unattendedRetryAllowed({...evidence,blocked:true},silent('SYNTHETIC-A'),qa),false);
 assert.equal(unattendedRetryAllowed(evidence,silent('OTHER'),qa),false);
 assert.equal(unattendedRetryAllowed({},offline(),qa),true);
});
test('previous capture time must be a real calendar instant without normalizing invalid civil dates',()=>{
 for(const lastCaptureAt of ['2026-02-30T00:00:00Z','2025-02-29T00:00:00Z','2026-01-01T24:00:00Z'])
  assert.equal(verifiedPriorCapture({...evidence,lastCaptureAt},qa),false,lastCaptureAt);
 for(const lastCaptureAt of ['2024-02-29T00:00:00Z','2019-01-01T00:00:00Z','2026-10-06T11:21:31.846-03:00'])
  assert.equal(verifiedPriorCapture({...evidence,lastCaptureAt},qa),true,lastCaptureAt);
});
test('a reader already captured waits through eight silent intervals and resumes by itself',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-silent-'));try{const fleet=config(root),clock=fleet.clocks[0];let time=new Date('2026-11-10T20:00:00.000Z'),calls=0;
 let s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>captured(c,time,2)});assert.equal(s.status,'captured_locally');assert.equal(verifiedPriorCapture(s,clock),true);const first=s.lastCaptureAt;time=new Date(Date.parse(s.nextPollAt)+1);
 for(let n=1;n<=8;n++){s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>{calls++;return silent(c.serial);}});
  assert.equal(s.blocked,false);assert.equal(s.status,'retry_wait');assert.equal(s.lastError,'RESPONSE_TIMEOUT');assert.equal(s.failureCount,0);assert.equal(s.connectionFailureCount,n);
  assert.equal(s.lastCaptureAt,first);assert.equal(s.uniqueLocalRecords,2);assert.ok(Date.parse(s.nextPollAt)-time<=900000);time=new Date(Date.parse(s.nextPollAt)+1);
 }
 s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>captured(c,time,3)});
 assert.equal(calls,8);assert.equal(s.status,'captured_locally');assert.equal(s.blocked,false);assert.equal(s.connectionFailureCount,0);assert.equal(s.uniqueLocalRecords,3);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('a complete capture of an empty reader, or one that only repeats records, is enough previous evidence',async()=>{
 for(const sizes of [[0],[2,2]]){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-empty-'));try{const fleet=config(root),clock=fleet.clocks[0];let time=new Date('2026-11-10T20:00:00.000Z'),s;
  for(const n of sizes){s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>captured(c,time,n)});assert.equal(s.status,'captured_locally');time=new Date(Date.parse(s.nextPollAt)+1);}
  assert.equal(s.snapshotRecordCount,sizes.at(-1));assert.equal(s.newUniqueRecordsLastCycle,0);assert.equal(verifiedPriorCapture(s,clock),true);
  s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>silent(c.serial)});
  assert.equal(s.blocked,false);assert.equal(s.status,'retry_wait');assert.equal(s.failureCount,0);assert.equal(s.connectionFailureCount,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 }
});
test('a reader never captured still exhausts the six-failure budget when it stays silent',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-unseen-'));try{const fleet=config(root),clock=fleet.clocks[0];let time=new Date('2026-11-10T20:00:00.000Z'),calls=0,s;
 for(let n=1;n<=6;n++){s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>{calls++;return silent(c.serial);}});
  assert.equal(s.failureCount,n);assert.equal(s.blocked,n===6);if(s.nextPollAt)time=new Date(Date.parse(s.nextPollAt)+1);}
 assert.equal(s.status,'blocked');assert.equal(s.nextPollAt,null);
 await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>{calls++;return silent(c.serial);}});assert.equal(calls,6);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('invalid stored evidence or a report of another reader spends the budget instead of waiting',async()=>{
 for(const [name,spoil,report] of [
  ['empty capture time',s=>{s.lastCaptureAt='';},c=>silent(c.serial)],
  ['invalid capture time',s=>{s.lastCaptureAt='ayer';},c=>silent(c.serial)],
  ['capture hash missing',s=>{delete s.lastCaptureSha256;},c=>silent(c.serial)],
  ['record count missing',s=>{delete s.snapshotRecordCount;},c=>silent(c.serial)],
  ['new records exceed total unique records',s=>{s.uniqueLocalRecords=0;},c=>silent(c.serial)],
  ['report of another serial',()=>{},()=>silent('OTHER-SERIAL')],
  ['report without serial',()=>{},c=>{const r=silent(c.serial);delete r.report.expectedSerial;return r;}],
 ]){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-evidence-'));try{const fleet=config(root),clock=fleet.clocks[0];let time=new Date('2026-11-10T20:00:00.000Z');
  let s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>captured(c,time,2)});time=new Date(Date.parse(s.nextPollAt)+1);
  const stored=await readStatus(root,clock);spoil(stored);await fs.writeFile(statusFile(root,clock),JSON.stringify(stored,null,2)+'\n');
  s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>report(c)});
  assert.equal(s.failureCount,1,name);assert.equal(s.connectionFailureCount,0,name);assert.equal(s.status,'retry_wait',name);assert.equal(s.blocked,false,name);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 }
});
test('a local write failure is never excused by the silence of the reader or by an unreachable reader',async()=>{
 for(const [name,attempt] of [['silent reader',c=>silent(c.serial)],['unreachable reader',()=>offline()]]){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-write-'));try{const fleet=config(root),clock=fleet.clocks[0];let time=new Date('2026-11-10T20:00:00.000Z');
  let s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>captured(c,time,2)});time=new Date(Date.parse(s.nextPollAt)+1);
  // The attempt report cannot be replaced: its place is taken by a directory that is not empty.
  const report=path.join(root,clock.clockId,'attempt-report.json');await fs.rm(report,{force:true});await fs.mkdir(report);await fs.writeFile(path.join(report,'occupied'),'x');
  s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>attempt(c)});
  assert.notEqual(s.lastError,'RESPONSE_TIMEOUT',name);assert.notEqual(s.lastError,'ETIMEDOUT',name);assert.equal(s.connectionFailureCount,0,name);assert.equal(s.failureCount,1,name);assert.equal(s.blocked,true,name);assert.equal(s.nextPollAt,null,name);
  }finally{await fs.rm(root,{recursive:true,force:true});}
 }
});
test('a stored block is not cleared by the new waiting rule even when the reader was captured before',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-stored-'));try{const fleet=config(root),clock=fleet.clocks[0];let time=new Date('2026-11-10T20:00:00.000Z'),calls=0;
 await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>captured(c,time,2)});
 const stored={...await readStatus(root,clock),status:'blocked',blocked:true,failureCount:6,lastError:'RESPONSE_TIMEOUT',nextPollAt:null};
 await fs.writeFile(statusFile(root,clock),JSON.stringify(stored,null,2)+'\n');const before=await fs.readFile(statusFile(root,clock),'utf8');time=new Date('2026-11-13T12:00:00.000Z');
 const s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>{calls++;return captured(c,time,3);}});
 assert.equal(calls,0);assert.equal(s.blocked,true);assert.equal(await fs.readFile(statusFile(root,clock),'utf8'),before);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
// The cases above inject the report. This one runs the real reader against a loopback socket that accepts the connection
// and never answers: the report it writes is the reviewed class, and not one authentication packet leaves this host.
async function withSilentSocket(run){
 const frames=[],sockets=new Set();
 const server=net.createServer(sock=>{sockets.add(sock);sock.on('error',()=>{});sock.on('close',()=>sockets.delete(sock));let b=Buffer.alloc(0);
  sock.on('data',incoming=>{b=Buffer.concat([b,incoming]);while(b.length>=8&&b.length>=b.readUInt32LE(4)+8){const len=b.readUInt32LE(4);frames.push(b.readUInt16LE(8));b=b.subarray(8+len);}});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await run(server.address().port,frames);}finally{for(const sock of sockets)sock.destroy();await new Promise(resolve=>server.close(resolve));}
}
test('the real reader facing a silent socket writes the reviewed class and sends no authentication packet',async()=>{
 await withSilentSocket(async(port,frames)=>{
  const clock={clockId:'qa-clock',serial:'SYNTHETIC-A'};
  const result=await collectConfigured({approved:true,host:'127.0.0.1',port,serial:clock.serial},{commKey:Buffer.from('0'),approved:true,timeoutMs:80,totalMs:3000,pacingMs:0});
  assert.equal(result.report.tcpConnected,true);assert.equal(result.report.credentialAttempts,0);assert.equal(result.report.authenticationAccepted,false);assert.equal(result.report.expectedSerial,clock.serial);
  assert.deepEqual(result.report.error&&{code:result.report.error.code,phase:result.report.error.phase},{code:'RESPONSE_TIMEOUT',phase:'CONNECT'});
  assert.equal(beforeAuthentication(result,clock),true);assert.equal(beforeClockSession(result),false);
  assert.deepEqual(frames,[1000]);assert.ok(!frames.includes(1102));
 });
});
test('through the runner, the real reader of an already captured clock waits on a silent socket without authenticating',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'mc-fleet-socket-'));try{await withSilentSocket(async(port,frames)=>{
  const fleet=config(root),clock=fleet.clocks[0];let time=new Date('2026-11-10T20:00:00.000Z');
  let s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:async c=>captured(c,time,2)});time=new Date(Date.parse(s.nextPollAt)+1);
  const real=(identity,options)=>collectConfigured({...identity,host:'127.0.0.1',port},{...options,timeoutMs:80,totalMs:3000,pacingMs:0});
  for(let n=1;n<=2;n++){s=await captureClock(fleet,clock,{route,credential,now:()=>time,collect:real});
   assert.equal(s.status,'retry_wait');assert.equal(s.blocked,false);assert.equal(s.lastError,'RESPONSE_TIMEOUT');assert.equal(s.failureCount,0);assert.equal(s.connectionFailureCount,n);time=new Date(Date.parse(s.nextPollAt)+1);}
  assert.deepEqual(frames,[1000,1000]);
  const saved=JSON.parse(await fs.readFile(path.join(root,clock.clockId,'attempt-report.json'),'utf8'));assert.equal(saved.credentialAttempts,0);assert.equal(saved.error.phase,'CONNECT');
 });}finally{await fs.rm(root,{recursive:true,force:true});}
});
