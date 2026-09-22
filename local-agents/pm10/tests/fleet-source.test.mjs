// Synthetic captures, temporary files and injected HTTP. No municipal network.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir,mkdir,symlink} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {CaptureStore,acquireLock,hash} from '../store.mjs';import {dataSet} from './fixture.mjs';
import {fleetPartPayload,checkFleetReceipt,FleetDeliveryStore} from '../../clock-fleet/delivery.mjs';
import {SOURCE_ENDPOINT,validateSourceSenderConfig,SourceDeliveryStore,checkSourceReceipt,sendSourcePart} from '../../clock-fleet/source-delivery.mjs';
import {runSourceSender,nextSourceWindowMs,SOURCE_WINDOW_WORK_MS} from '../../clock-fleet/source-sender.mjs';
import {inspectGateway,WORKERS} from '../../clock-fleet/gateway-config.mjs';
import {assertSourceReceipt,validateSourcePayload} from '../../../lib/clock-source-contract.js';
const capturedAt='2026-09-21T12:00:00.000Z',tenantId='a1111111-1111-4111-8111-111111111111';
const receipt=p=>({version:'clock-source-receipt.v1',receiptId:'a2222222-2222-4222-8222-'+String(p.partStart).padStart(12,'0'),tenantId,serial:p.serial,batchId:p.batchId,partStart:p.partStart,partSha256:p.partSha256,snapshotSha256:p.snapshotSha256,recordsSha256:p.recordsSha256,count:p.ordinals.length,receivedAt:'2026-09-21T12:01:00.123456Z',persisted:true,scope:'source_only',payrollModified:false,replayed:false});
const reply=(p,patch={})=>new Response(JSON.stringify({ok:true,receipt:{...receipt(p),...patch}}),{status:200});
async function fixture(fn,{count=3,clocks=1}={}){
 const root=await mkdtemp(path.join(os.tmpdir(),'clock-source-qa-'));try{
  const entries=[],stores=[],batches=[];for(let n=0;n<clocks;n++){
   const c={clockId:'clock-'+n,serial:'SYNTHETIC-'+n,connectorKey:'qa-source-clock-'+n,tokenFile:path.join(root,'token-'+n),enabled:true},captureRoot=path.join(root,c.clockId),identity={clockId:c.clockId,serial:c.serial};
   const capture=await new CaptureStore(captureRoot,{identity,freeBytes:async()=>1e10}).init(),raw=dataSet(count);for(let i=0;i<count;i++)raw.writeUInt16LE(i+1,4+i*40);
   await capture.save(raw,{capturedAt});await writeFile(path.join(captureRoot,'identity.json'),JSON.stringify({schema:'clock-fleet-identity.v1',...identity}),{mode:0o600});
   await writeFile(c.tokenFile,String(n).repeat(43),{mode:0o600});entries.push(c);const store=await new SourceDeliveryStore(captureRoot,{...identity,connectorKey:c.connectorKey,tenantId}).init();stores.push(store);for await(const batch of store.iterateBatches())batches.push(batch);
  }
  const config=validateSourceSenderConfig({schema:'clock-fleet-source-config.v1',approved:true,enabled:true,stateDir:root,tenantId,windowSeconds:900,clocks:entries});
  let time=Date.parse(capturedAt);const now=()=>new Date(time),advance=ms=>{time+=ms;};
  await fn({root,config,clock:entries[0],store:stores[0],stores,batches,payload:fleetPartPayload(batches[0].manifest,batches[0].bytes,0),now,advance,scheduleFile:path.join(root,'.delivery-source','schedule.json'),statusFile:path.join(stores[0].root,'status.json')});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('source opt-in is explicit, bounded, tenant-pinned and excludes PM10',()=>fixture(async({config})=>{
 for(const change of [{approved:false},{enabled:undefined},{windowSeconds:60},{windowSeconds:901},{windowSeconds:4500},{tenantId:'invalid'},{endpoint:'https://example.invalid'},{schema:'clock-fleet-delivery-config.v1'}])assert.throws(()=>validateSourceSenderConfig({...config,...change}));
 assert.equal(validateSourceSenderConfig({...config,approved:false,enabled:false}).enabled,false);
 assert.throws(()=>validateSourceSenderConfig({...config,clocks:[{...config.clocks[0],serial:'CQTU225360168'}]}));
}));
test('disabled configuration does not read secrets, create schedule or send',()=>fixture(async({config,scheduleFile})=>{
 const result=await runSourceSender({...config,enabled:false,approved:false,clocks:[{...config.clocks[0],tokenFile:path.join(config.stateDir,'missing.token')}]},{once:true,fetchImpl:()=>assert.fail('disabled')});
 assert.equal(result.enabled,false);assert.equal(result.clocks[0].state,'disabled');await assert.rejects(readFile(scheduleFile),{code:'ENOENT'});
}));
test('source and canonical ACK cannot be interchanged in either direction',()=>fixture(async({store,payload})=>{
 const r=receipt(payload);checkSourceReceipt(r,payload,tenantId);assert.throws(()=>checkFleetReceipt(r,payload),{code:'ZK40_DELIVERY_RECEIPT_INVALID'});
 const canonical={version:'zk40-receipt.v1',serial:payload.serial,receiptId:r.receiptId,batchId:r.batchId,partStart:r.partStart,partSha256:r.partSha256,snapshotSha256:r.snapshotSha256,count:r.count,newCanonical:r.count,observed:0,duplicates:0,receivedAt:r.receivedAt,persisted:true,payrollModified:false,replayed:false};
 assert.throws(()=>checkSourceReceipt(canonical,payload,tenantId),{code:'CLOCK_SOURCE_DELIVERY_RECEIPT_INVALID'});
 await assert.rejects(store.confirm(payload,canonical),{code:'CLOCK_SOURCE_DELIVERY_RECEIPT_INVALID'});assert.equal((await readdir(store.receiptDir)).length,0);
}));
test('sender payload and receipt match the independent HTTP contract',()=>fixture(async({payload})=>{
 assert.deepEqual(validateSourcePayload(payload),payload);const value=assertSourceReceipt(receipt(payload),payload);assert.deepEqual(checkSourceReceipt(value,payload,tenantId),value);
 for(const patch of [{receiptId:'00000000-0000-0000-0000-000000000000'},{receivedAt:'2026-09-21T12:01:00Z'},{receivedAt:'2026-09-21T12:01:00.123+00:00'}]){assert.throws(()=>assertSourceReceipt({...value,...patch},payload));assert.throws(()=>checkSourceReceipt({...value,...patch},payload,tenantId));}
}));
for(const patch of [{tenantId:'b1111111-1111-4111-8111-111111111111'},{recordsSha256:'f'.repeat(64)},{serial:'SYNTHETIC-OTHER'},{batchId:'0'.repeat(64)},{scope:'canonical'},{persisted:false},{payrollModified:true},{count:0},{partStart:500},{extra:'unexpected'},{replayed:'true'}])test('unbound receipt is never checkpointed: '+Object.keys(patch),()=>fixture(async({store})=>{
 await assert.rejects(store.deliver({token:'t'.repeat(43),fetchImpl:async(_u,o)=>reply(JSON.parse(o.body),patch)}),{code:'CLOCK_SOURCE_DELIVERY_RECEIPT_INVALID'});assert.equal((await readdir(store.receiptDir)).length,0);
}));
test('receipt persistence and replay preserve source bytes and existing canonical evidence',()=>fixture(async({store,clock,payload,batches})=>{
 const canonical=await new FleetDeliveryStore(store.captureRoot,{clockId:clock.clockId,serial:clock.serial,connectorKey:'qa-canonical-clock'}).init();
 const oldFile=path.join(canonical.receiptDir,'previous.json');await writeFile(oldFile,'{"old":"canonical"}',{mode:0o600});
 const rawFile=path.join(store.captureRoot,'pending',batches[0].manifest.batchId,'records.bin'),before=hash(await readFile(rawFile));
 let calls=0;const options={token:'t'.repeat(43),fetchImpl:async(url,o)=>{assert.equal(url,SOURCE_ENDPOINT);assert.equal(o.redirect,'error');assert.equal(o.headers['x-clock-connector'],clock.connectorKey);calls++;return reply(JSON.parse(o.body));}};
 const result=await store.deliver(options);await store.deliver(options);assert.equal(calls,1);assert.equal(result.sourceStoredRecords,3);assert.equal(result.scope,'source_only');assert.equal(result.captureFilesRemoved,false);
 assert.equal(hash(await readFile(rawFile)),before);assert.equal(await readFile(oldFile,'utf8'),'{"old":"canonical"}');
 const saved=await readFile(store.receiptFile(payload));await store.confirm(payload,{...receipt(payload),replayed:true});assert.ok((await readFile(store.receiptFile(payload))).equals(saved));
 await assert.rejects(store.confirm(payload,{...receipt(payload),receiptId:'a3333333-3333-4333-8333-333333333333'}),{code:'CLOCK_SOURCE_DELIVERY_RECEIPT_CONFLICT'});
}));
test('changed enrollment identity cannot reuse delivery-source checkpoint',()=>fixture(async({store,clock})=>{
 for(const patch of [{tenantId:'b1111111-1111-4111-8111-111111111111'},{connectorKey:'qa-other-connector'}])await assert.rejects(new SourceDeliveryStore(store.captureRoot,{clockId:clock.clockId,serial:clock.serial,connectorKey:clock.connectorKey,tenantId,...patch}).init(),{code:'CLOCK_SOURCE_DELIVERY_IDENTITY_MISMATCH'});
}));
test('malformed checkpoint is retained and blocks silent replay',()=>fixture(async({store,payload})=>{
 await writeFile(store.receiptFile(payload),'{}',{mode:0o600});await assert.rejects(store.deliver({token:'t'.repeat(43),fetchImpl:()=>assert.fail('no request')}),{code:'CLOCK_SOURCE_DELIVERY_RECEIPT_CORRUPT'});assert.equal(await readFile(store.receiptFile(payload),'utf8'),'{}');
}));
test('transport treats busy and unavailable as next-window retry, permanent rejection blocks',()=>fixture(async({payload})=>{
 for(const [status,code] of [[409,'CLOCK_SOURCE_BUSY'],[503,'CLOCK_SOURCE_UNAVAILABLE'],[503,undefined]])await assert.rejects(sendSourcePart(payload,'t'.repeat(43),'qa-source-clock',tenantId,async()=>new Response(JSON.stringify({ok:false,code}),{status})),{code:'CLOCK_SOURCE_DELIVERY_NETWORK_RETRY'});
 for(const [status,code] of [[409,'CLOCK_SOURCE_IDEMPOTENCY_CONFLICT'],[409,'CLOCK_SOURCE_BATCH_INTEGRITY_INVALID'],[503,'CLOCK_SOURCE_CAPACITY_LIMIT'],[503,'CLOCK_SOURCE_NOT_CONFIGURED']])await assert.rejects(sendSourcePart(payload,'t'.repeat(43),'qa-source-clock',tenantId,async()=>new Response(JSON.stringify({ok:false,code}),{status})),{code:'CLOCK_SOURCE_DELIVERY_REJECTED'});
 await assert.rejects(sendSourcePart(payload,'t'.repeat(43),'qa-source-clock',tenantId,async()=>new Response(null,{status:401})),{code:'CLOCK_SOURCE_DELIVERY_AUTH_BLOCKED'});
 await assert.rejects(sendSourcePart(payload,'t'.repeat(43),'qa-source-clock',tenantId,async()=>{throw Object.assign(Error('TLS'),{code:'CERT_HAS_EXPIRED'});}),{code:'CLOCK_SOURCE_DELIVERY_TRANSPORT_BLOCKED'});
 await assert.rejects(sendSourcePart(payload,'t'.repeat(43),'qa-source-clock',tenantId,async()=>new Response(' '.repeat(8193))),{code:'CLOCK_SOURCE_DELIVERY_RECEIPT_INVALID'});
}));
test('fresh start off-boundary waits; once cannot bypass alignment or restart deadline',()=>fixture(async({config,now,advance,scheduleFile})=>{
 advance(12345);const options={once:true,now,fetchImpl:()=>assert.fail('not due')};const result=await runSourceSender(config,options);assert.equal(result.nextWindowAt,'2026-09-21T12:15:00.000Z');await runSourceSender(config,options);assert.equal(JSON.parse(await readFile(scheduleFile)).nextWindowAt,result.nextWindowAt);
}));
test('five clocks send serially in one window, rotate fairly and persist next window before HTTP',()=>fixture(async({config,now,advance,scheduleFile})=>{
 let active=0,maxActive=0;const calls=[];const fetchImpl=async(_u,o)=>{assert.equal(JSON.parse(await readFile(scheduleFile)).nextWindowAt,'2026-09-21T12:15:00.000Z');active++;maxActive=Math.max(maxActive,active);calls.push(JSON.parse(o.body).serial);await Promise.resolve();active--;return reply(JSON.parse(o.body));};
 const result=await runSourceSender(config,{once:true,now,fetchImpl});assert.equal(calls.length,5);assert.equal(maxActive,1);assert.ok(result.clocks.every(c=>c.state==='source_stored'));assert.equal(JSON.parse(await readFile(scheduleFile)).cursor,1);
 await runSourceSender(config,{once:true,now,fetchImpl:()=>assert.fail('same window')});advance(900000);await runSourceSender(config,{once:true,now,fetchImpl:()=>assert.fail('already source stored')});
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC-|tokenFile|connectorKey|recordsBase64|captureRoot/);
},{clocks:5}));
test('lost ACK retries identical multipart request only in the next common window',()=>fixture(async({config,store,now,advance})=>{
 const requests=[],committed=new Map();let lost=true;const fetchImpl=async(_u,o)=>{const p=JSON.parse(o.body);requests.push(p.partStart);if(committed.has(p.partStart)){assert.equal(o.body,committed.get(p.partStart));return reply(p,{replayed:true});}committed.set(p.partStart,o.body);if(p.partStart===500&&lost){lost=false;throw Object.assign(Error('lost after commit'),{code:'ECONNRESET'});}return reply(p);};
 const first=await runSourceSender(config,{once:true,now,fetchImpl});assert.equal(first.clocks[0].state,'retry_wait');assert.deepEqual(requests,[0,500]);assert.equal((await readdir(store.receiptDir)).length,1);
 await runSourceSender(config,{once:true,now,fetchImpl});assert.deepEqual(requests,[0,500]);advance(900000);const next=await runSourceSender(config,{once:true,now,fetchImpl});assert.equal(next.clocks[0].sourceStoredRecords,1001);assert.deepEqual(requests,[0,500,500,1000]);assert.equal((await readdir(path.join(store.captureRoot,'pending'))).length,1);
},{count:1001}));
test('window work budget stops further requests and rotates first clock at next window',()=>fixture(async({config,now,advance})=>{
 const order=[];const first=await runSourceSender(config,{once:true,now,fetchImpl:async(_u,o)=>{const p=JSON.parse(o.body);order.push(p.serial);advance(SOURCE_WINDOW_WORK_MS);return reply(p);}});assert.deepEqual(order,['SYNTHETIC-0']);assert.equal(first.clocks[1].state,'pending');
 advance(900000-SOURCE_WINDOW_WORK_MS);await runSourceSender(config,{once:true,now,fetchImpl:async(_u,o)=>{const p=JSON.parse(o.body);order.push(p.serial);return reply(p);}});assert.equal(order[1],'SYNTHETIC-1');
},{clocks:2}));
test('missed late window skips catch-up requests and preserves next aligned boundary',()=>fixture(async({config,now,advance})=>{
 await runSourceSender(config,{once:true,now,fetchImpl:async()=>{throw Object.assign(Error('offline'),{code:'ENETUNREACH'});}});advance(1000000);const result=await runSourceSender(config,{once:true,now,fetchImpl:()=>assert.fail('missed budget')});assert.equal(result.nextWindowAt,'2026-09-21T12:30:00.000Z');
}));
test('permanent block survives windows; resume is explicit and never sends',()=>fixture(async({config,clock,now,advance,statusFile})=>{
 const first=await runSourceSender(config,{once:true,now,fetchImpl:async()=>new Response(null,{status:401})});assert.equal(first.clocks[0].state,'blocked');advance(900000);await runSourceSender(config,{once:true,now,fetchImpl:()=>assert.fail('blocked')});
 await runSourceSender(config,{resumeClock:clock.clockId,now,fetchImpl:()=>assert.fail('resume only')});assert.equal(JSON.parse(await readFile(statusFile)).state,'ready');
 await runSourceSender(config,{once:true,now,fetchImpl:()=>assert.fail('resume cannot bypass schedule')});advance(900000);assert.equal((await runSourceSender(config,{once:true,now,fetchImpl:async(_u,o)=>reply(JSON.parse(o.body))})).clocks[0].state,'source_stored');
}));
test('one blocked clock cannot prevent a sibling from using the same window',()=>fixture(async({config,now})=>{
 const result=await runSourceSender(config,{once:true,now,fetchImpl:async(_u,o)=>JSON.parse(o.body).serial==='SYNTHETIC-0'?new Response(null,{status:401}):reply(JSON.parse(o.body))});assert.equal(result.clocks[0].state,'blocked');assert.equal(result.clocks[1].state,'source_stored');
},{clocks:2}));
test('duplicate credentials are detected before any source request',()=>fixture(async({config,now})=>{
 await writeFile(config.clocks[1].tokenFile,await readFile(config.clocks[0].tokenFile));const result=await runSourceSender(config,{once:true,now,fetchImpl:()=>assert.fail('duplicate')});assert.ok(result.clocks.every(c=>c.code==='CLOCK_SOURCE_DELIVERY_DUPLICATE_TOKEN'));
},{clocks:2}));
test('global source lock prevents competing schedules and writes',()=>fixture(async({config,now})=>{
 const dir=path.join(config.stateDir,'.delivery-source');await mkdir(dir,{mode:0o700});const release=await acquireLock(dir);try{await assert.rejects(runSourceSender(config,{once:true,now,fetchImpl:()=>assert.fail('parallel')}),{code:'ALREADY_RUNNING'});}finally{await release();}
}));
test('corrupt schedule cannot be reset into an immediate send',()=>fixture(async({config,now,scheduleFile})=>{
 await mkdir(path.dirname(scheduleFile),{mode:0o700});await writeFile(scheduleFile,'{}',{mode:0o600});await assert.rejects(runSourceSender(config,{once:true,now,fetchImpl:()=>assert.fail('corrupt')}),{code:'CLOCK_SOURCE_DELIVERY_SCHEDULE_CORRUPT'});assert.equal(await readFile(scheduleFile,'utf8'),'{}');
}));
test('shutdown after ACK checkpoints only that part and respects next-window recovery',()=>fixture(async({config,store,now,advance})=>{
 const controller=new AbortController();let calls=0;await runSourceSender(config,{once:true,now,signal:controller.signal,fetchImpl:async(_u,o)=>{calls++;controller.abort();return reply(JSON.parse(o.body));}});assert.equal(calls,1);assert.equal((await readdir(store.receiptDir)).length,1);
 advance(900000);await runSourceSender(config,{once:true,now,fetchImpl:async(_u,o)=>{assert.equal(JSON.parse(o.body).partStart,500);return reply(JSON.parse(o.body));}});assert.equal((await readdir(store.receiptDir)).length,2);
},{count:501}));
test('run waits in bounded sleeps and aborts without issuing an off-window request',()=>fixture(async({config,now,advance})=>{
 advance(1);const controller=new AbortController();let waits=0;await runSourceSender(config,{now,signal:controller.signal,sleep:async(ms)=>{assert.ok(ms<=60000);waits++;controller.abort();},fetchImpl:()=>assert.fail('off-window')});assert.equal(waits,1);
}));
test('gateway source worker is opt-in and rejects two delivery modes for one queue',()=>fixture(async({root,config})=>{
 assert.equal(WORKERS['fleet-source-delivery'],'source-sender.mjs');
 const capture={schema:'municontrol-clock-fleet.v1',approved:true,stateDir:root,maxQueueMiB:64,minFreeMiB:64,clocks:config.clocks.map(c=>({clockId:c.clockId,serial:c.serial,label:'Synthetic',host:'172.100.126.241',port:4370,credentialFile:path.join(root,'never-read.key'),pollSeconds:60,enabled:true}))};
 const captureFile=path.join(root,'capture.json'),sourceFile=path.join(root,'source.json'),canonicalFile=path.join(root,'canonical.json');
 await writeFile(captureFile,JSON.stringify(capture),{mode:0o600});await writeFile(sourceFile,JSON.stringify(config),{mode:0o600});await writeFile(canonicalFile,JSON.stringify({schema:'clock-fleet-delivery-config.v1',approved:true,stateDir:root,pollSeconds:60,clocks:config.clocks}),{mode:0o600});
 const gateway={stateDir:path.join(root,'..',path.basename(root)+'-coordinator'),workers:[{kind:'fleet-capture',configFile:captureFile,enabled:true},{kind:'fleet-source-delivery',configFile:sourceFile,enabled:true}]};
 assert.equal((await inspectGateway(gateway)).deliveryIdentities,1);await assert.rejects(inspectGateway({...gateway,workers:[...gateway.workers,{kind:'fleet-delivery',configFile:canonicalFile,enabled:true}]}),{code:'GATEWAY_DUPLICATE_DELIVERY'});
 await writeFile(sourceFile,JSON.stringify({...config,enabled:false}));await assert.rejects(inspectGateway(gateway),{code:'GATEWAY_SOURCE_DISABLED'});assert.equal((await inspectGateway({...gateway,workers:gateway.workers.map(w=>w.kind==='fleet-source-delivery'?{...w,enabled:false}:w)})).deliveryIdentities,0);
}));
test('window arithmetic uses exact common boundaries, no staggered jitter',()=>{
 const at=Date.parse(capturedAt);assert.equal(nextSourceWindowMs(at,900),at);assert.equal(nextSourceWindowMs(at,900,{strict:true}),at+900000);assert.equal(nextSourceWindowMs(at+1,900),at+900000);
 for(const args of [[-1,900],[at,60],[at,901],[NaN,900]])assert.throws(()=>nextSourceWindowMs(...args));
});
test('source coordinator refuses linked state ancestors before writing schedule',()=>fixture(async({root,config,now})=>{
 const link=path.join(root,'linked');await symlink(root,link,process.platform==='win32'?'junction':'dir');
 await assert.rejects(runSourceSender({...config,stateDir:path.join(link,'other-state')},{once:true,now,fetchImpl:()=>assert.fail('linked')}),{code:'CLOCK_SOURCE_DELIVERY_FILE_UNSAFE'});
 await assert.rejects(readFile(path.join(root,'other-state','.delivery-source','schedule.json')),{code:'ENOENT'});
}));
test('each HTTP request has a twenty-second deadline and caller shutdown signal',()=>fixture(async({payload})=>{
 const original=AbortSignal.timeout,deadlines=[];AbortSignal.timeout=ms=>{deadlines.push(ms);return original(1000);};
 try{const controller=new AbortController();await assert.rejects(sendSourcePart(payload,'t'.repeat(43),'qa-source-clock',tenantId,async(_u,o)=>{assert.equal(o.signal.aborted,false);controller.abort();assert.equal(o.signal.aborted,true);throw o.signal.reason;},controller.signal),{code:'CLOCK_SOURCE_DELIVERY_STOPPED'});assert.deepEqual(deadlines,[20000]);}
 finally{AbortSignal.timeout=original;}
}));
test('a queue exceeding one window is retained and drained over later aligned windows',()=>fixture(async({config,now,advance,store})=>{
 let calls=0;const fetchImpl=async(_u,o)=>{calls++;return reply(JSON.parse(o.body));};const first=await runSourceSender(config,{once:true,now,fetchImpl});assert.equal(calls,4);assert.equal(first.clocks[0].remainingParts,2);advance(900000);const second=await runSourceSender(config,{once:true,now,fetchImpl});assert.equal(calls,6);assert.equal(second.clocks[0].sourceStoredRecords,2501);assert.equal((await readdir(path.join(store.captureRoot,'pending'))).length,1);
},{count:2501}));
