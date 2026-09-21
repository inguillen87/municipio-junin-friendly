// Every network response is synthetic and injected. All files live in a temporary directory.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {EventEmitter} from 'node:events';
import {CaptureStore,acquireLock} from '../store.mjs';import {dataSet} from './fixture.mjs';
import {validateFleetSenderConfig,FleetDeliveryStore} from '../../clock-fleet/delivery.mjs';
import {runClockSender,runFleetSender,fleetRetryDelayMs,bindSenderShutdown} from '../../clock-fleet/sender.mjs';
const capturedAt='2026-09-21T12:00:00.000Z';
const receipt=p=>({version:'zk40-receipt.v1',serial:p.serial,receiptId:'a1111111-1111-4111-8111-'+String(p.partStart).padStart(12,'0'),batchId:p.batchId,partStart:p.partStart,partSha256:p.partSha256,snapshotSha256:p.snapshotSha256,count:p.ordinals.length,newCanonical:p.ordinals.length,observed:0,duplicates:0,receivedAt:capturedAt,persisted:true,payrollModified:false,replayed:false});
const reply=(p,patch={})=>new Response(JSON.stringify({ok:true,receipt:{...receipt(p),...patch}}),{status:200});
async function fixture(fn,{count=3,clocks=1}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'zk40-sender-qa-'));
 try{const entries=[],stores=[];for(let n=0;n<clocks;n++){
  const c={clockId:'clock-'+n,serial:'SYNTHETIC-'+n,connectorKey:'qa-fleet-clock-'+n,tokenFile:path.join(root,'token-'+n),enabled:true},captureRoot=path.join(root,c.clockId),identity={clockId:c.clockId,serial:c.serial};
  const capture=await new CaptureStore(captureRoot,{identity,freeBytes:async()=>1e10}).init(),raw=dataSet(count);for(let i=0;i<count;i++)raw.writeUInt16LE(i+1,4+i*40);
  await capture.save(raw,{capturedAt});await writeFile(path.join(captureRoot,'identity.json'),JSON.stringify({schema:'clock-fleet-identity.v1',...identity}),{mode:0o600});
  await writeFile(c.tokenFile,String(n).repeat(43),{mode:0o600});entries.push(c);stores.push(await new FleetDeliveryStore(captureRoot,{...identity,connectorKey:c.connectorKey}).init());
 }
 const config=validateFleetSenderConfig({schema:'clock-fleet-delivery-config.v1',approved:true,stateDir:root,pollSeconds:60,clocks:entries});
 await fn({root,config,clock:config.clocks[0],store:stores[0],stores,statusFile:path.join(stores[0].root,'status.json')});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('retry jitter is bounded at one to fifteen minutes and does not reset at the ceiling',()=>{
 for(const failures of [1,2,3,4,1000]){const low=fleetRetryDelayMs(failures,()=>0),high=fleetRetryDelayMs(failures,()=>0.99999);assert.ok(low>=60000);assert.ok(high<=900000);assert.ok(high>low);}
 for(const n of [-1,0,1001,NaN])assert.throws(()=>fleetRetryDelayMs(n));assert.throws(()=>fleetRetryDelayMs(1,()=>1));
});
test('persisted retry deadline and failure count survive restart without immediate resending',()=>fixture(async({config,clock,statusFile})=>{
 let time=Date.parse(capturedAt),calls=0;const options={once:true,now:()=>new Date(time),random:()=>0.8,fetchImpl:async()=>{calls++;throw Object.assign(Error('offline'),{code:'ENETUNREACH'});}};
 const first=await runClockSender(config,clock,options);assert.equal(first.state,'retry_wait');const disk=JSON.parse(await readFile(statusFile));assert.equal(disk.failures,1);
 time=Date.parse(disk.nextAttemptAt)-1;await runClockSender(config,clock,{...options,random:()=>assert.fail('must reuse deadline')});assert.equal(calls,1);assert.deepEqual(JSON.parse(await readFile(statusFile)),disk);
 time=Date.parse(disk.nextAttemptAt)+1;await runClockSender(config,clock,options);assert.equal(calls,2);assert.equal(JSON.parse(await readFile(statusFile)).failures,2);
}));
test('multipart restart preserves confirmed parts and retries a lost ACK with the exact request',()=>fixture(async({config,clock,store,statusFile})=>{
 const committed=new Map(),bodies=new Map(),attempts=[];let time=Date.parse(capturedAt),lose=true;
 const fetchImpl=async(_u,o)=>{const p=JSON.parse(o.body),at=p.partStart;attempts.push(at);if(committed.has(at)){assert.equal(o.body,bodies.get(at));return reply(p,{replayed:true});}committed.set(at,receipt(p));bodies.set(at,o.body);if(at===500&&lose){lose=false;throw Object.assign(Error('lost after commit'),{code:'ECONNRESET'});}return reply(p);};
 const options={once:true,now:()=>new Date(time),random:()=>0.5,fetchImpl};assert.equal((await runClockSender(config,clock,options)).state,'retry_wait');assert.deepEqual(attempts,[0,500]);assert.equal((await readdir(store.receiptDir)).length,1);
 time=Date.parse(JSON.parse(await readFile(statusFile)).nextAttemptAt)+1;const finished=await runClockSender(config,clock,options);assert.equal(finished.confirmedRecords,1001);assert.equal(finished.remainingParts,0);assert.deepEqual(attempts,[0,500,500,1000]);
 await runClockSender(config,clock,options);assert.deepEqual(attempts,[0,500,500,1000]);assert.equal((await readdir(path.join(store.captureRoot,'pending'))).length,1);
},{count:1001}));
for(const [status,code] of [[401,'ZK40_AUTH_DENIED'],[403,'ZK40_CONTEXT_DENIED'],[409,'ZK40_IDEMPOTENCY_CONFLICT'],[409,'ZK40_EVENT_CONFLICT'],[503,'ZK40_BINDING_REQUIRED'],[503,'ZK40_NOT_READY']])test('permanent '+code+' blocks across restart until explicit per-clock resume',()=>fixture(async({config,clock,statusFile})=>{
 let calls=0;const fetchImpl=async()=>{calls++;return new Response(JSON.stringify({ok:false,code}),{status});};
 assert.equal((await runClockSender(config,clock,{once:true,fetchImpl})).state,'blocked');const before=await readFile(statusFile);
 assert.equal((await runClockSender(config,clock,{once:true,fetchImpl})).state,'blocked');assert.equal(calls,1);assert.ok((await readFile(statusFile)).equals(before));
 await runClockSender(config,clock,{resume:true,fetchImpl:()=>assert.fail('resume does not fetch')});assert.equal(JSON.parse(await readFile(statusFile)).state,'ready');
}));
test('an invalid stored status is retained instead of silently reset',()=>fixture(async({config,clock,statusFile})=>{
 await writeFile(statusFile,'{"version":"wrong"}',{mode:0o600});await assert.rejects(runClockSender(config,clock,{once:true,fetchImpl:()=>assert.fail('no request')}),{code:'ZK40_DELIVERY_STATE_CORRUPT'});assert.equal(await readFile(statusFile,'utf8'),'{"version":"wrong"}');
}));
test('one blocked clock cannot stop the other four and reports contain no token, path or serial',()=>fixture(async({config,stores})=>{
 const calls=[],statuses=[];const result=await runFleetSender(config,{once:true,onStatus:async s=>statuses.push(s),fetchImpl:async(_u,o)=>{const p=JSON.parse(o.body);calls.push(p.serial);return p.serial==='SYNTHETIC-2'?new Response(null,{status:401}):reply(p);}});
 assert.equal(calls.length,5);assert.equal(result.clocks.filter(c=>c.state==='blocked').length,1);assert.equal(result.clocks.filter(c=>c.state==='queue_confirmed').length,4);
 const second=await runFleetSender(config,{once:true,fetchImpl:()=>assert.fail('no confirmed or blocked clock resends')});assert.equal(second.clocks.length,5);
 assert.doesNotMatch(JSON.stringify(statuses),/SYNTHETIC-|tokenFile|connectorKey|recordsBase64|captureRoot/);assert.equal((await readdir(stores[2].receiptDir)).length,0);
},{clocks:5}));
test('two token files holding one credential are rejected before either clock sends',()=>fixture(async({config})=>{
 await writeFile(config.clocks[1].tokenFile,await readFile(config.clocks[0].tokenFile));
 const result=await runFleetSender(config,{once:true,fetchImpl:()=>assert.fail('duplicate credential must never send')});
 assert.ok(result.clocks.every(c=>c.state==='blocked'&&c.code==='ZK40_DELIVERY_DUPLICATE_TOKEN'));
},{clocks:2}));
test('same raw bytes in two clocks remain separate and a substituted ACK is not attributed',()=>fixture(async({config,stores})=>{
 let fromFirst;const first=await runClockSender(config,config.clocks[0],{once:true,fetchImpl:async(_u,o)=>{const p=JSON.parse(o.body);fromFirst=receipt(p);return reply(p);}});assert.equal(first.confirmedRecords,3);
 const second=await runClockSender(config,config.clocks[1],{once:true,fetchImpl:async(_u,o)=>{const p=JSON.parse(o.body);assert.equal(p.batchId,fromFirst.batchId);assert.notEqual(p.serial,fromFirst.serial);return new Response(JSON.stringify({ok:true,receipt:fromFirst}));}});
 assert.equal(second.state,'blocked');assert.equal(second.code,'ZK40_DELIVERY_RECEIPT_INVALID');assert.equal((await readdir(stores[1].receiptDir)).length,0);
},{clocks:2}));
test('one process owns each delivery queue; a second cannot send or replace its state',()=>fixture(async({config,clock,store})=>{
 const release=await acquireLock(store.root);try{await assert.rejects(runClockSender(config,clock,{once:true,fetchImpl:()=>assert.fail('parallel sender')}),{code:'ALREADY_RUNNING'});}finally{await release();}
 assert.equal((await runClockSender(config,clock,{once:true,fetchImpl:async(_u,o)=>reply(JSON.parse(o.body))})).state,'queue_confirmed');
}));
test('shutdown during an unacknowledged request preserves the queue and releases the lock',()=>fixture(async({config,clock,store})=>{
 const controller=new AbortController();await runClockSender(config,clock,{once:true,signal:controller.signal,fetchImpl:async(_u,o)=>{controller.abort();throw o.signal.reason;}});
 assert.equal((await readdir(store.receiptDir)).length,0);assert.equal((await readdir(path.join(store.captureRoot,'pending'))).length,1);
 await runClockSender(config,clock,{once:true,fetchImpl:async(_u,o)=>reply(JSON.parse(o.body))});assert.equal((await readdir(store.receiptDir)).length,1);
}));
test('shutdown after a valid ACK commits that receipt but does not send a second part',()=>fixture(async({config,clock,store})=>{
 const controller=new AbortController();let calls=0;await runClockSender(config,clock,{once:true,signal:controller.signal,fetchImpl:async(_u,o)=>{calls++;controller.abort();return reply(JSON.parse(o.body));}});
 assert.equal(calls,1);assert.equal((await readdir(store.receiptDir)).length,1);
 await runClockSender(config,clock,{once:true,fetchImpl:async(_u,o)=>{assert.equal(JSON.parse(o.body).partStart,500);return reply(JSON.parse(o.body));}});assert.equal((await readdir(store.receiptDir)).length,2);
},{count:501}));
test('IPC legacy stop, shutdown, disconnect and signals cancel without accepting arbitrary commands',()=>{
 for(const [event,value] of [['message',{command:'stop'}],['message',{type:'shutdown'}],['disconnect'],['SIGINT'],['SIGTERM']]){
  const emitter=new EventEmitter(),controller=new AbortController(),unbind=bindSenderShutdown(controller,emitter);emitter.emit('message',{command:'resume'});assert.equal(controller.signal.aborted,false);emitter.emit(event,value);assert.equal(controller.signal.aborted,true);unbind();for(const name of ['message','disconnect','SIGINT','SIGTERM'])assert.equal(emitter.listenerCount(name),0);
 }
});
test('when all clocks need review the supervisor remains idle until shutdown, without retries',()=>fixture(async({config})=>{
 let calls=0,waits=0;const controller=new AbortController();const result=await runFleetSender(config,{signal:controller.signal,fetchImpl:async()=>{calls++;return new Response(null,{status:401});},sleep:async(ms,_v,{signal})=>{assert.equal(ms,60000);assert.equal(signal,controller.signal);waits++;controller.abort();}});
 assert.equal(calls,1);assert.equal(waits,1);assert.equal(result.clocks[0].state,'blocked');
}));
