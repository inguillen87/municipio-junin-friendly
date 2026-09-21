// Synthetic source files and intercepted HTTP only. Never contacts a real device or API.
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir,mkdir,symlink,chmod} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {CaptureStore,hash} from '../store.mjs';import {dataSet} from './fixture.mjs';
import {validateZk40Payload,assertZk40Receipt} from '../../../lib/internal-zk40-reception.js';
import {ENDPOINT,validateFleetSenderConfig,loadFleetSenderConfig,loadFleetToken,validateFleetBatch,fleetPartPayload,checkFleetReceipt,sendFleetPart,FleetDeliveryStore} from '../../clock-fleet/delivery.mjs';
const capturedAt='2026-09-21T12:00:00.000Z',token='s'.repeat(43);
const identity={clockId:'clock-a',serial:'SYNTHETIC-A',connectorKey:'qa-fleet-clock-a'};
const receipt=p=>({version:'zk40-receipt.v1',serial:p.serial,receiptId:'a1111111-1111-4111-8111-'+String(p.partStart).padStart(12,'0'),batchId:p.batchId,partStart:p.partStart,partSha256:p.partSha256,snapshotSha256:p.snapshotSha256,count:p.ordinals.length,newCanonical:p.ordinals.length,observed:0,duplicates:0,receivedAt:'2026-09-21T12:01:00.123456Z',persisted:true,payrollModified:false,replayed:false});
const reply=(p,patch={})=>new Response(JSON.stringify({ok:true,receipt:{...receipt(p),...patch}}),{status:200});
async function temp(fn,count=3){const root=await mkdtemp(path.join(os.tmpdir(),'zk40-delivery-qa-'));try{
 const captureRoot=path.join(root,identity.clockId),capture=await new CaptureStore(captureRoot,{identity:{clockId:identity.clockId,serial:identity.serial},freeBytes:async()=>1e10}).init();
 await writeFile(path.join(captureRoot,'identity.json'),JSON.stringify({schema:'clock-fleet-identity.v1',clockId:identity.clockId,serial:identity.serial}),{mode:0o600});
 const raw=dataSet(count);for(let i=0;i<count;i++)raw.writeUInt16LE(i+1,4+i*40);const saved=await capture.save(raw,{capturedAt});
 const store=await new FleetDeliveryStore(captureRoot,identity).init(),batch=(await store.batches())[0];
 await fn({root,captureRoot,raw,saved,store,...batch,payload:fleetPartPayload(batch.manifest,batch.bytes,0)});
}finally{await rm(root,{recursive:true,force:true});}}
const config=root=>({schema:'clock-fleet-delivery-config.v1',approved:true,stateDir:root,pollSeconds:60,clocks:[{...identity,tokenFile:path.join(root,'clock-a.token'),enabled:true}]});
test('configuration is closed, approved, bounded, excludes PM10 and has exclusive identifiers',()=>{
 const v=config(os.tmpdir());assert.equal(validateFleetSenderConfig(v).clocks[0].serial,identity.serial);
 for(const change of [{approved:false},{pollSeconds:59},{endpoint:'https://example.invalid'},{stateDir:'relative'},{stateDir:path.parse(os.tmpdir()).root},{schema:'unknown'}])assert.throws(()=>validateFleetSenderConfig({...v,...change}));
 for(const change of [{serial:'CQTU225360168'},{serial:'BAD_SERIAL'},{serial:'short'},{tokenFile:'relative'},{enabled:'true'}])assert.throws(()=>validateFleetSenderConfig({...v,clocks:[{...v.clocks[0],...change}]}));
 const second={clockId:'clock-b',serial:'SYNTHETIC-B',tokenFile:path.join(os.tmpdir(),'b.token'),connectorKey:'qa-fleet-clock-b',enabled:true};
 for(const key of ['clockId','serial','tokenFile','connectorKey'])assert.throws(()=>validateFleetSenderConfig({...v,clocks:[v.clocks[0],{...second,[key]:v.clocks[0][key]}]}));
});
test('private config and token readers reject numeric clock keys and malformed files',()=>temp(async({root})=>{
 const c=config(root),file=path.join(root,'sender.json');await writeFile(file,JSON.stringify(c),{mode:0o600});assert.deepEqual(await loadFleetSenderConfig(file),validateFleetSenderConfig(c));
 await writeFile(c.clocks[0].tokenFile,token+'\n',{mode:0o600});assert.equal(await loadFleetToken(c.clocks[0].tokenFile),token);
 await writeFile(c.clocks[0].tokenFile,'123456');await assert.rejects(loadFleetToken(c.clocks[0].tokenFile),{code:'ZK40_DELIVERY_TOKEN_INVALID'});
 await writeFile(file,'{broken');await assert.rejects(loadFleetSenderConfig(file));
}));
test('unsafe token permission and symlinks are rejected',{skip:process.platform==='win32'},()=>temp(async({root})=>{
 const file=path.join(root,'token');await writeFile(file,token,{mode:0o644});await assert.rejects(loadFleetToken(file));await chmod(file,0o600);const link=path.join(root,'link');await symlink(file,link);await assert.rejects(loadFleetToken(link));
}));
test('wire batch differs from local key; exact 500+1 parts satisfy the real receiver validator',()=>temp(async({manifest,bytes,raw})=>{
 const a=fleetPartPayload(manifest,bytes,0),b=fleetPartPayload(manifest,bytes,500);
 assert.notEqual(a.batchId,manifest.batchId);assert.equal(manifest.batchId,hash(identity.clockId+':'+identity.serial+':'+manifest.snapshotSha256+':'+manifest.recordsSha256));
 assert.equal(validateZk40Payload(a),a);assert.equal(validateZk40Payload(b),b);assert.deepEqual(b.ordinals,[501]);
 assert.ok(Buffer.concat([Buffer.from(a.recordsBase64,'base64'),Buffer.from(b.recordsBase64,'base64')]).equals(raw.subarray(4)));
 assert.equal(assertZk40Receipt(receipt(a),a).serial,identity.serial);assert.throws(()=>fleetPartPayload(manifest,bytes,1));
},501));
test('manifest drift, incompatible PM10, identity substitution and corrupt source are rejected without mutation',()=>temp(async({manifest,bytes})=>{
 for(const patch of [{version:'pm10-local-batch.v1'},{clockId:'clock-b'},{serial:'SYNTHETIC-B'},{cloudConfirmed:true},{snapshotBytes:0},{newUniqueRecords:0},{repeatedWithinNewRecords:10},{capturedAt:'2026-02-30T12:00:00.000Z'},{clockTimeZone:'UTC'},{ordinals:[1,1,3]},{observation:'changed'},{extra:'unexpected'}])assert.throws(()=>validateFleetBatch(manifest.batchId,{...manifest,...patch},bytes,identity));
 assert.throws(()=>validateFleetBatch(manifest.batchId,manifest,Buffer.alloc(bytes.length),identity));
}));
test('configured serial and connector binding cannot reuse another queue or receipt directory',()=>temp(async({captureRoot,store})=>{
 await assert.rejects(new FleetDeliveryStore(captureRoot,{...identity,serial:'SYNTHETIC-B'}).init(),{code:'ZK40_DELIVERY_IDENTITY_MISMATCH'});
 await assert.rejects(new FleetDeliveryStore(captureRoot,{...identity,connectorKey:'other-connector'}).init(),{code:'ZK40_DELIVERY_IDENTITY_MISMATCH'});
 assert.equal((await readdir(store.receiptDir)).length,0);
}));
test('acknowledgement is persisted and read before success; restart never resends or changes originals',()=>temp(async({captureRoot,store,manifest,bytes})=>{
 const manifestFile=path.join(captureRoot,'pending',manifest.batchId,'manifest.json'),original=await readFile(manifestFile);let calls=0;
 const fetchImpl=async(url,o)=>{calls++;assert.equal(url,ENDPOINT);assert.equal(o.redirect,'error');assert.equal(o.headers['x-clock-connector'],identity.connectorKey);assert.equal(o.headers.authorization,'Bearer '+token);assert.equal(o.headers.origin,undefined);return reply(JSON.parse(o.body));};
 assert.equal((await store.deliver({token,fetchImpl})).confirmedRecords,3);
 const next=await new FleetDeliveryStore(captureRoot,identity).init();assert.equal((await next.deliver({token,fetchImpl})).sent,0);assert.equal(calls,1);
 assert.ok((await readFile(manifestFile)).equals(original));assert.ok((await readFile(path.join(captureRoot,'pending',manifest.batchId,'records.bin'))).equals(bytes));
 assert.equal((await readdir(path.join(captureRoot,'pending'))).length,1);
}));
test('lost reply after remote commit retries identical bytes and accepts the replay ACK',()=>temp(async({captureRoot,store})=>{
 let original,calls=0;const fetchImpl=async(_u,o)=>{calls++;if(!original){original=o.body;throw Object.assign(Error('synthetic ACK loss'),{code:'ECONNRESET'});}assert.equal(o.body,original);return reply(JSON.parse(o.body),{replayed:true});};
 await assert.rejects(store.deliver({token,fetchImpl}),{code:'ZK40_DELIVERY_NETWORK_RETRY'});assert.equal((await readdir(store.receiptDir)).length,0);
 const next=await new FleetDeliveryStore(captureRoot,identity).init();assert.equal((await next.deliver({token,fetchImpl})).confirmedRecords,3);assert.equal(calls,2);
}));
test('local persistence failure after ACK preserves unconfirmed queue for exact retry',()=>temp(async({captureRoot,store})=>{
 store.confirm=async()=>{throw Object.assign(Error('synthetic disk full'),{code:'ENOSPC'});};
 await assert.rejects(store.deliver({token,fetchImpl:async(_u,o)=>reply(JSON.parse(o.body))}),{code:'ENOSPC'});
 assert.equal((await readdir(store.receiptDir)).length,0);const next=await new FleetDeliveryStore(captureRoot,identity).init();assert.equal((await next.deliver({token,fetchImpl:async(_u,o)=>reply(JSON.parse(o.body),{replayed:true})})).confirmedRecords,3);
}));
for(const patch of [{serial:'SYNTHETIC-B'},{version:'pm10-receipt.v1'},{persisted:false},{payrollModified:true},{batchId:'0'.repeat(64)},{partSha256:'0'.repeat(64)},{snapshotSha256:'0'.repeat(64)},{partStart:500},{count:0},{newCanonical:4},{receivedAt:'2026-02-30T12:00:00Z'},{receiptId:'bad'},{extra:'secret'}])test('invalid ACK is never checkpointed '+Object.keys(patch),()=>temp(async({store})=>{
 await assert.rejects(store.deliver({token,fetchImpl:async(_u,o)=>reply(JSON.parse(o.body),patch)}),{code:'ZK40_DELIVERY_RECEIPT_INVALID'});assert.equal((await readdir(store.receiptDir)).length,0);
}));
test('persisted ACK cannot be silently replaced by corrupt or conflicting data',()=>temp(async({store,payload})=>{
 const r=receipt(payload);await store.confirm(payload,r);const before=await readFile(store.receiptFile(payload));
 assert.deepEqual(await store.confirm(payload,{...r,replayed:true}),r);await assert.rejects(store.confirm(payload,{...r,newCanonical:0,duplicates:r.count}),{code:'ZK40_DELIVERY_RECEIPT_CONFLICT'});
 assert.ok((await readFile(store.receiptFile(payload))).equals(before));await writeFile(store.receiptFile(payload),'{}');await assert.rejects(store.confirm(payload,r),{code:'ZK40_DELIVERY_RECEIPT_CORRUPT'});assert.equal(await readFile(store.receiptFile(payload),'utf8'),'{}');
}));
test('four-part cycle limit provides backpressure and counts all remaining parts',()=>temp(async({store})=>{
 let calls=0;const fetchImpl=async(_u,o)=>{calls++;return reply(JSON.parse(o.body));};const first=await store.deliver({token,fetchImpl});assert.equal(calls,4);assert.equal(first.confirmedRecords,2000);assert.equal(first.remainingParts,2);
 assert.equal((await store.deliver({token,fetchImpl})).confirmedRecords,2501);assert.equal(calls,6);await assert.rejects(store.deliver({token,fetchImpl,limit:5}),{code:'ZK40_DELIVERY_LIMIT_INVALID'});
},2501));
test('incomplete capture is retained and never interpreted as a ready batch',()=>temp(async({captureRoot,store})=>{
 await mkdir(path.join(captureRoot,'pending','.pending-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),{mode:0o700});assert.equal((await store.deliver({token,fetchImpl:async(_u,o)=>reply(JSON.parse(o.body))})).confirmedRecords,3);assert.equal((await readdir(path.join(captureRoot,'pending'))).length,2);
}));
test('bounded transport separates busy/network failures from authentication, TLS and permanent conflicts',()=>temp(async({payload})=>{
 for(const status of [408,425,429,500,502,503,504])await assert.rejects(sendFleetPart(payload,token,identity.connectorKey,async()=>new Response('temporary',{status})),{code:'ZK40_DELIVERY_NETWORK_RETRY'});
 await assert.rejects(sendFleetPart(payload,token,identity.connectorKey,async()=>new Response(JSON.stringify({ok:false,code:'ZK40_BUSY'}),{status:409})),{code:'ZK40_DELIVERY_NETWORK_RETRY'});
 for(const code of ['ZK40_IDEMPOTENCY_CONFLICT','ZK40_EVENT_CONFLICT','ZK40_NOT_READY','ZK40_BINDING_REQUIRED'])await assert.rejects(sendFleetPart(payload,token,identity.connectorKey,async()=>new Response(JSON.stringify({ok:false,code}),{status:503})),{code:'ZK40_DELIVERY_REJECTED'});
 for(const status of [401,403])await assert.rejects(sendFleetPart(payload,token,identity.connectorKey,async()=>({status,body:{cancel:async()=>{throw Error('discard');}}})),{code:'ZK40_DELIVERY_AUTH_BLOCKED'});
 await assert.rejects(sendFleetPart(payload,token,identity.connectorKey,async()=>{throw Object.assign(Error('TLS'),{code:'CERT_HAS_EXPIRED'});}),{code:'ZK40_DELIVERY_TRANSPORT_BLOCKED'});
 await assert.rejects(sendFleetPart(payload,token,identity.connectorKey,async()=>new Response(' '.repeat(8193))),{code:'ZK40_DELIVERY_RECEIPT_INVALID'});
 await assert.rejects(sendFleetPart(payload,token,identity.connectorKey,async()=>({status:200,redirected:true,body:null})),{code:'ZK40_DELIVERY_TRANSPORT_BLOCKED'});
}));
