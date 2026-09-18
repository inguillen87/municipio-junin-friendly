import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {beforeClockSession,nextCaptureFailure} from '../../clock-fleet/capture-policy.mjs';
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
