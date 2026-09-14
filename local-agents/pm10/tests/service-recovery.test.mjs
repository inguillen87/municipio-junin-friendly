// SPDX-License-Identifier: GPL-2.0-only
// Synthetic records and public test credential; real sockets are loopback only.
import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {runCycle,initialState,loadState,writeStatus,statusHtml} from '../service.mjs';
import {CaptureStore,hash} from '../store.mjs';
import {validateConfig,SCHEMA} from '../config.mjs';
import {collect,TARGET,PORT,SERIAL} from '../reader/lector-fichadas.mjs';
import {withClock,fakeKey,dataSet} from './fixture.mjs';

const routeCheck=async()=>({prefix:'172.100.96.0/19',interface:'synthetic',localLookup:true});
const config=root=>validateConfig({schema:SCHEMA,mode:'capture_only',approved:true,host:TARGET,port:PORT,serial:SERIAL,stateDir:root,credentialFile:path.join(root,'test-key'),pollSeconds:60,maxQueueMiB:256,minFreeMiB:16});
const storeAt=root=>new CaptureStore(root,{freeBytes:async()=>1e10}).init();
async function temporary(fn){const root=await mkdtemp(path.join(os.tmpdir(),'pm10-recovery-'));try{return await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
const failedConnect=(patch={})=>({report:{schemaVersion:'municontrol.attendance-download-pilot.v4.1',status:'CONNECTION_OR_AUTH_FAILED',tcpConnected:false,authenticationAccepted:false,credentialAttempts:0,error:{code:'ECONNREFUSED',phase:'TCP_CONNECT'},diagnostics:{lastPhase:'TCP_CONNECT'},...patch}});

test('a long pre-auth TCP outage preserves the queue and its retry deadline across restarts',()=>temporary(async root=>{
 let store=await storeAt(root);await store.save(dataSet(2));
 let state=initialState(),time=Date.parse('2026-09-14T01:00:00Z'),attempts=0;
 const deps={routeCheck,now:()=>new Date(time),credentialReader:async()=>fakeKey(),collectImpl:async()=>{attempts++;return failedConnect();}};
 for(let i=1;i<=10;i++){
  state=await runCycle(config(root),store,state,deps);
  assert.equal(state.status,'connection_wait');assert.equal(state.blocked,false);
  assert.equal(state.failureCount,0);assert.equal(state.connectionFailureCount,i);
  assert.equal(store.summary().uniqueLocalRecords,2);
  const due=Date.parse(state.nextPollAt);assert.ok(due-time>=60000&&due-time<=900000);
  await writeStatus(root,state);state=await loadState(root);store=await storeAt(root);
  time=due-1;state=await runCycle(config(root),store,state,deps);assert.equal(attempts,i);
  time=due;
 }
 assert.equal(attempts,10);assert.equal(state.cloudConfirmedRecords,0);
 await withClock({count:3},async port=>{
  state=await runCycle(config(root),store,state,{...deps,collectImpl:opts=>collect({...opts,host:'127.0.0.1',port,pacingMs:0,timeoutMs:1000,totalMs:5000})});
 });
 assert.equal(state.status,'captured_locally');assert.equal(state.connectionFailureCount,0);assert.equal(state.failureCount,0);
 assert.equal(store.summary().uniqueLocalRecords,3);assert.equal(store.summary().pendingLocalBatches,2);
}));

test('the real reader reports a refused loopback connection with zero AUTH attempts',()=>temporary(async root=>{
 const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));
 const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 let report;const key=fakeKey();
 const state=await runCycle(config(root),await storeAt(root),initialState(),{routeCheck,credentialReader:async()=>key,collectImpl:async opts=>{
  const result=await collect({...opts,host:'127.0.0.1',port,timeoutMs:1000,totalMs:3000});report=result.report;return result;
 }});
 assert.equal(report.tcpConnected,false);assert.equal(report.credentialAttempts,0);assert.equal(report.error.phase,'TCP_CONNECT');
 assert.equal(state.status,'connection_wait');assert.equal(state.blocked,false);assert.ok(key.equals(Buffer.alloc(key.length)));
}));

test('deliberate stop during a real partial transfer resumes after restart without queuing partial bytes',()=>temporary(async root=>{
 let store=await storeAt(root);const before=await store.save(dataSet(2));
 const savedPath=path.join(root,'pending',before.batchId,'records.bin'),saved=await readFile(savedPath);
 const controller=new AbortController();let time=Date.parse('2026-09-14T01:00:00Z'),partial;
 const deps={routeCheck,credentialReader:async()=>fakeKey(),now:()=>new Date(time)};
 let state={...initialState(),failureCount:2,lastError:'RESPONSE_TIMEOUT',lastCaptureAt:'2026-09-13T01:00:00Z'};
 await withClock({count:500},async port=>{
  state=await runCycle(config(root),store,state,{...deps,signal:controller.signal,collectImpl:async opts=>{
   const result=await collect({...opts,host:'127.0.0.1',port,pacingMs:0,timeoutMs:1000,totalMs:5000,onProgress:()=>controller.abort()});partial=result;return result;
  }});
 });
 assert.equal(partial.report.error.code,'CANCELLED');assert.ok(partial.raw.length<dataSet(500).length);
 assert.equal(state.status,'stopped');assert.equal(state.blocked,false);assert.equal(state.failureCount,2);
 assert.equal(state.lastError,'RESPONSE_TIMEOUT');assert.equal(state.lastCaptureAt,'2026-09-13T01:00:00Z');
 assert.equal(store.summary().pendingLocalBatches,1);assert.deepEqual(await readFile(savedPath),saved);
 await writeStatus(root,state);state=await loadState(root);store=await storeAt(root);
 time=Date.parse(state.nextPollAt);
 await withClock({count:500},async (port,commands,raw)=>{
  state=await runCycle(config(root),store,state,{...deps,collectImpl:opts=>collect({...opts,host:'127.0.0.1',port,pacingMs:0,timeoutMs:1000,totalMs:5000})});
  assert.equal(state.lastCaptureSha256,hash(raw));assert.equal(commands.filter(x=>x.code===1102).length,1);
 });
 assert.equal(state.status,'captured_locally');assert.equal(state.blocked,false);assert.equal(state.failureCount,0);
 assert.equal(store.summary().pendingLocalBatches,2);assert.deepEqual(await readFile(savedPath),saved);
}));

test('a prior authentication lock remains locked even when the process is stopping',()=>temporary(async root=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const state=await runCycle(config(root),await storeAt(root),{...initialState(),blocked:true,lastError:'AUTH_NOT_ACCEPTED'},{signal:controller.signal,routeCheck:async()=>{calls++;},credentialReader:async()=>{calls++;}});
 assert.equal(state.blocked,true);assert.equal(state.lastError,'AUTH_NOT_ACCEPTED');assert.equal(calls,0);
}));

for(const during of ['exit_request','exit_pacing'])test('deliberate stop during '+during+' preserves a restartable state with the real reader',()=>temporary(async root=>{
 const controller=new AbortController(),store=await storeAt(root);let observed,countRequests=0,abortImmediate,watchedSocket,onCounts;
 const originalWrite=net.Socket.prototype.write;
 try{
  await withClock({count:3},async port=>{
   net.Socket.prototype.write=function(bytes,...args){
    const packet=Buffer.isBuffer(bytes)&&bytes.length>=16&&bytes.subarray(0,4).equals(Buffer.from([0x50,0x50,0x82,0x7d]));
    if(packet&&during==='exit_request'&&bytes.readUInt16LE(8)===1001){controller.abort();return true;}
    if(packet&&during==='exit_pacing'&&bytes.readUInt16LE(8)===50&&++countRequests===2){
     watchedSocket=this;let response=Buffer.alloc(0);
     onCounts=chunk=>{response=Buffer.concat([response,chunk]);if(response.length>=128){
      watchedSocket.off('data',onCounts);
      // Let the reader finish its response microtasks and enter EXIT's pacing.
      abortImmediate=setImmediate(()=>controller.abort());
     }};
     this.on('data',onCounts);
    }
    const result=originalWrite.call(this,bytes,...args);
    return result;
   };
   observed=await runCycle(config(root),store,initialState(),{routeCheck,signal:controller.signal,credentialReader:async()=>fakeKey(),collectImpl:async opts=>{
    const result=await collect({...opts,host:'127.0.0.1',port,pacingMs:during==='exit_pacing'?30:0,timeoutMs:1000,totalMs:5000});
    assert.equal(result.report.error,null);assert.equal(result.report.cleanup.skippedReason,'EXIT_NOT_CONFIRMED');
    assert.equal(result.report.exchanges.at(-1).code,during==='exit_pacing'?50:1001);
    return result;
   }});
  });
 }finally{net.Socket.prototype.write=originalWrite;clearImmediate(abortImmediate);if(watchedSocket&&onCounts)watchedSocket.off('data',onCounts);}
 assert.equal(controller.signal.aborted,true);assert.equal(observed.status,'stopped');assert.equal(observed.blocked,false);
 assert.equal(observed.failureCount,0);assert.equal(store.summary().pendingLocalBatches,0);
 await writeStatus(root,observed);assert.equal((await loadState(root)).blocked,false);
}));

test('stopping during cleanup does not hide an invalid layout, byte count or EXIT response',()=>temporary(async root=>{
 for(const fault of ['layout','bytes','exit_rejected']){
  const controller=new AbortController(),raw=dataSet(3);
  const result={raw,parsed:{layout:fault==='layout'?'unknown':'legacy-40-byte-candidate'},report:{status:'ATTENDANCE_DOWNLOADED_FOR_REVIEW',authenticationAccepted:true,attendanceTransferComplete:true,metadata:{serialNumber:SERIAL},error:null,
   transfer:{plannedBytes:fault==='bytes'?raw.length+40:raw.length,receivedBytes:raw.length,confirmedChunkBytes:raw.length},
   cleanup:{bufferReleaseConfirmed:true,exitConfirmed:false,skippedReason:'EXIT_NOT_CONFIRMED'},
   exchanges:[{code:1001,errorCode:fault==='exit_rejected'?'SESSION_MISMATCH':'CANCELLED'}]}};
  const state=await runCycle(config(root),await storeAt(root),initialState(),{routeCheck,signal:controller.signal,credentialReader:async()=>fakeKey(),collectImpl:async()=>{controller.abort();return result;}});
  assert.equal(state.blocked,true,fault);assert.equal(state.status,'blocked');
 }
}));

test('a peer close before the stop signal remains a real failure during EXIT pacing',()=>temporary(async root=>{
 const controller=new AbortController(),store=await storeAt(root),originalWrite=net.Socket.prototype.write;
 let peer,client,counts=0,observed,report,closeImmediate,received=Buffer.alloc(0),onCounts,peerEndObserved=false;
 try{
  await withClock({count:3},async port=>{
   net.Socket.prototype.write=function(bytes,...args){
    const packet=Buffer.isBuffer(bytes)&&bytes.length>=16&&bytes.subarray(0,4).equals(Buffer.from([0x50,0x50,0x82,0x7d]));
    if(packet&&bytes.readUInt16LE(8)===2000&&bytes.length===128)peer=this;
    if(packet&&bytes.readUInt16LE(8)===50&&++counts===2){
     client=this;
     onCounts=chunk=>{received=Buffer.concat([received,chunk]);if(received.length>=128){client.off('data',onCounts);closeImmediate=setImmediate(()=>peer.end());}};
     client.on('data',onCounts);
     // Channel registered its 'end' handler first and records CONNECTION_ENDED.
     client.once('end',()=>{peerEndObserved=true;controller.abort();});
    }
    return originalWrite.call(this,bytes,...args);
   };
   observed=await runCycle(config(root),store,{...initialState(),failureCount:5,lastError:'RESPONSE_TIMEOUT'},{routeCheck,signal:controller.signal,credentialReader:async()=>fakeKey(),collectImpl:async opts=>{
    const result=await collect({...opts,host:'127.0.0.1',port,pacingMs:30,timeoutMs:1000,totalMs:5000});report=result.report;return result;
   }});
  });
 }finally{net.Socket.prototype.write=originalWrite;clearImmediate(closeImmediate);if(client&&onCounts)client.off('data',onCounts);}
 assert.equal(peerEndObserved,true);assert.equal(controller.signal.aborted,true);assert.equal(report.error,null);
 assert.equal(report.cleanup.errorCode,'CONNECTION_ENDED');assert.equal(report.exchanges.at(-1).code,50);
 assert.equal(observed.status,'blocked');assert.equal(observed.blocked,true);assert.equal(observed.failureCount,6);
 assert.equal(store.summary().pendingLocalBatches,0);
}));

test('a cancellation without an actual stop signal still requires review',()=>temporary(async root=>{
 const state=await runCycle(config(root),await storeAt(root),initialState(),{routeCheck,credentialReader:async()=>fakeKey(),collectImpl:async()=>{throw Object.assign(Error('synthetic'),{code:'CANCELLED'});}});
 assert.equal(state.blocked,true);assert.equal(state.lastError,'CANCELLED');
}));

test('a real authentication rejection is not cleared by a simultaneous stop signal',()=>temporary(async root=>{
 const controller=new AbortController();
 const state=await runCycle(config(root),await storeAt(root),initialState(),{signal:controller.signal,routeCheck,credentialReader:async()=>fakeKey(),collectImpl:async()=>{controller.abort();return {report:{status:'AUTH_NOT_ACCEPTED',authenticationAccepted:false}};}});
 assert.equal(state.blocked,true);assert.equal(state.lastError,'AUTH_NOT_ACCEPTED');
}));

test('missing TCP evidence or an AUTH attempt cannot obtain unbounded automatic retries',()=>temporary(async root=>{
 for(const patch of [{schemaVersion:'unknown'},{tcpConnected:true},{credentialAttempts:1},{authenticationAccepted:true},{diagnostics:{lastPhase:'AUTH'}},{error:{code:'RESPONSE_TIMEOUT',phase:'AUTH'}},{error:{code:'AUTH_NOT_ACCEPTED',phase:'TCP_CONNECT'}}]){
  const state=await runCycle(config(root),await storeAt(root),{...initialState(),failureCount:5},{routeCheck,credentialReader:async()=>fakeKey(),collectImpl:async()=>failedConnect(patch)});
  assert.equal(state.blocked,true,JSON.stringify(patch));assert.equal(state.connectionFailureCount,0);
 }
}));

test('older state loads with a zero connection count; corrupt new counts are rejected',()=>temporary(async root=>{
 const old=initialState();delete old.connectionFailureCount;await writeFile(path.join(root,'status.json'),JSON.stringify(old));
 assert.equal((await loadState(root)).connectionFailureCount,0);
 for(const invalid of [null,-1,1001,1.2,'1']){
  await writeFile(path.join(root,'status.json'),JSON.stringify({...old,connectionFailureCount:invalid}));
  await assert.rejects(loadState(root),{code:'STATE_CORRUPT'});
 }
}));

test('an already aborted cycle does not read a credential or contact a clock',()=>temporary(async root=>{
 const controller=new AbortController();controller.abort();let calls=0;
 const state=await runCycle(config(root),await storeAt(root),initialState(),{signal:controller.signal,routeCheck:async()=>{calls++;},credentialReader:async()=>{calls++;},collectImpl:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(state.status,'stopped');assert.equal(state.blocked,false);
}));

test('local outage status explains the next retry without claiming receipt or attendance',()=>{
 const html=statusHtml({...initialState(),status:'connection_wait',connectionFailureCount:9});
 assert.match(html,/no llegó a establecer la conexión ni a enviar la clave/);
 assert.match(html,/hasta 15 minutos/);assert.match(html,/última captura completa se conservan/);
});
