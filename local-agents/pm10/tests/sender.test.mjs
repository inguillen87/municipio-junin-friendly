// SPDX-License-Identifier: GPL-2.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {CaptureStore} from '../store.mjs';
import {DeliveryStore,partPayload,sendPart,validateSenderConfig} from '../delivery.mjs';
import {retryDelayMs,runSender} from '../sender.mjs';
import {dataSet} from './fixture.mjs';

const capturedAt='2026-09-13T09:00:00.000Z';
const token='s'.repeat(43),connectorKey='qa-pm10-sender';
const networkError=()=>Object.assign(new Error('Synthetic connection reset'),{code:'ECONNRESET'});
const receipt=p=>({version:'pm10-receipt.v1',receiptId:'a1111111-1111-4111-8111-'+String(p.partStart).padStart(12,'0'),batchId:p.batchId,partStart:p.partStart,partSha256:p.partSha256,snapshotSha256:p.snapshotSha256,count:p.ordinals.length,newCanonical:p.ordinals.length,observed:0,duplicates:0,receivedAt:capturedAt,persisted:true,payrollModified:false,replayed:false});
const response=r=>new Response(JSON.stringify({ok:true,receipt:r}),{status:200});

async function fixture(fn,count=3){
 const dir=await mkdtemp(path.join(os.tmpdir(),'pm10-sender-'));
 try{
  const capture=await new CaptureStore(dir,{freeBytes:async()=>1e10}).init(),raw=dataSet(count);
  for(let i=0;i<count;i++)raw.writeUInt16LE(i+1,4+i*40);
  await capture.save(raw,{capturedAt});
  const config=validateSenderConfig({schema:'pm10-delivery-config.v1',approved:true,stateDir:dir,tokenFile:path.join(dir,'api-token'),connectorKey,pollSeconds:60});
  await writeFile(config.tokenFile,token,{mode:0o600});
  const store=await new DeliveryStore(dir).init(),statusFile=path.join(store.root,'status.json');
  const [{manifest,bytes}]=await store.batches();
  await fn({dir,config,store,statusFile,payload:partPayload(manifest,bytes,0)});
 }finally{await rm(dir,{recursive:true,force:true});}
}

test('jitter varies retries even at the ceiling and remains between one and fifteen minutes',()=>{
 for(const failures of [1,2,3,4,5,1000]){
  const early=retryDelayMs(failures,()=>0),late=retryDelayMs(failures,()=>0.999999);
  assert.ok(early>=60000);assert.ok(late<=900000);assert.ok(late>early);
 }
 assert.ok(retryDelayMs(2,()=>0)>retryDelayMs(1,()=>0));
});

test('restart honors the saved jitter deadline and continues the prior failure count',()=>fixture(async({config,statusFile})=>{
 let calls=0,time=Date.parse(capturedAt);
 const fetchImpl=async()=>{calls++;throw networkError();};
 const options={once:true,now:()=>new Date(time),random:()=>0.8,fetchImpl};
 await assert.rejects(runSender(config,options),/DELIVERY_NETWORK_RETRY/);
 const first=JSON.parse(await readFile(statusFile,'utf8'));
 assert.equal(first.failures,1);assert.ok(Date.parse(first.nextAttemptAt)>time+60000);
 time=Date.parse(first.nextAttemptAt)-1;
 await runSender(config,{...options,random:()=>{throw Error('Must reuse persisted jitter');}});
 assert.equal(calls,1);assert.deepEqual(JSON.parse(await readFile(statusFile,'utf8')),first);
 time=Date.parse(first.nextAttemptAt)+1;
 await assert.rejects(runSender(config,options),/DELIVERY_NETWORK_RETRY/);
 const second=JSON.parse(await readFile(statusFile,'utf8'));
 assert.equal(calls,2);assert.equal(second.failures,2);
 assert.ok(Date.parse(second.nextAttemptAt)-time>Date.parse(first.nextAttemptAt)-Date.parse(first.updatedAt));
}));

test('restart completes a multipart batch after a lost ACK without resending confirmed parts',()=>fixture(async({config,store,statusFile})=>{
 const committed=new Map(),payloads=new Map(),attempts=[];
 let loseSecond=true,time=Date.parse(capturedAt);
 const fetchImpl=async(_url,options)=>{
  const payload=JSON.parse(options.body),at=payload.partStart;attempts.push(at);
  if(committed.has(at)){
   assert.equal(options.body,payloads.get(at));
   return response({...committed.get(at),replayed:true});
  }
  committed.set(at,receipt(payload));payloads.set(at,options.body);
  if(at===500&&loseSecond){loseSecond=false;throw networkError();}
  return response(committed.get(at));
 };
 const options={once:true,now:()=>new Date(time),random:()=>0.5,fetchImpl};
 await assert.rejects(runSender(config,options),/DELIVERY_NETWORK_RETRY/);
 assert.deepEqual(attempts,[0,500]);assert.equal((await readdir(store.receiptDir)).length,1);
 const waiting=JSON.parse(await readFile(statusFile,'utf8'));time=Date.parse(waiting.nextAttemptAt)+1;
 await runSender(config,options);
 assert.deepEqual(attempts,[0,500,500,1000]);assert.equal(committed.size,3);
 const done=JSON.parse(await readFile(statusFile,'utf8'));
 assert.equal(done.state,'queue_confirmed');assert.equal(done.confirmedRecords,1001);assert.equal(done.remainingParts,0);
 await runSender(config,options);assert.deepEqual(attempts,[0,500,500,1000]);
 assert.equal((await readdir(path.join(config.stateDir,'pending'))).length,1);
 assert.equal((await readdir(store.receiptDir)).length,3);
},1001));

for(const status of [408,425,429,500,502,503,504])test('only designated HTTP failure '+status+' is retried',()=>fixture(async({payload})=>{
 await assert.rejects(sendPart(payload,token,connectorKey,async()=>new Response('Temporary upstream failure',{status})),{code:'DELIVERY_NETWORK_RETRY'});
}));

for(const [status,code] of [[400,'PM10_PAYLOAD_INVALID'],[409,'PM10_IDEMPOTENCY_CONFLICT'],[409,'PM10_EVENT_CONFLICT'],[503,'PM10_BINDING_REQUIRED'],[503,'PM10_IDENTITY_KEY_REQUIRED'],[503,'PM10_NOT_READY'],[501,'NOT_IMPLEMENTED'],[505,'VERSION_UNSUPPORTED']]){
 test('permanent '+code+' blocks the sender across restart',()=>fixture(async({config,statusFile})=>{
  let calls=0;const fetchImpl=async()=>{calls++;return new Response(JSON.stringify({ok:false,code}),{status});};
  await assert.rejects(runSender(config,{once:true,fetchImpl}),{code:'DELIVERY_REJECTED'});
  const state=JSON.parse(await readFile(statusFile,'utf8'));
  assert.equal(state.state,'blocked');assert.equal(state.nextAttemptAt,null);
  await assert.rejects(runSender(config,{once:true,fetchImpl}),{code:'DELIVERY_REVIEW_REQUIRED'});
  assert.equal(calls,1);
 }));
}

test('busy retries but a malformed busy response requires review',()=>fixture(async({payload})=>{
 await assert.rejects(sendPart(payload,token,connectorKey,async()=>new Response(JSON.stringify({ok:false,code:'PM10_BUSY'}),{status:409})),{code:'DELIVERY_NETWORK_RETRY'});
 await assert.rejects(sendPart(payload,token,connectorKey,async()=>new Response(JSON.stringify({ok:true,code:'PM10_BUSY'}),{status:409})),{code:'DELIVERY_REJECTED'});
}));

test('a temporary receiver outage retries without treating the database as unconfigured',()=>fixture(async({config,statusFile})=>{
 const fetchImpl=async()=>new Response(JSON.stringify({ok:false,code:'PM10_TEMPORARY_UNAVAILABLE'}),{status:503});
 await assert.rejects(runSender(config,{once:true,random:()=>0.5,fetchImpl}),{code:'DELIVERY_NETWORK_RETRY'});
 const state=JSON.parse(await readFile(statusFile,'utf8'));
 assert.equal(state.state,'retry_wait');assert.equal(state.failures,1);assert.ok(state.nextAttemptAt);
}));

test('certificate and unrecognized transport failures require review; known socket failures retry',()=>fixture(async({payload})=>{
 for(const error of [Object.assign(Error('Certificate validation failed'),{code:'CERT_HAS_EXPIRED'}),new TypeError('Invalid request configuration')]){
  await assert.rejects(sendPart(payload,token,connectorKey,async()=>{throw error;}),{code:'DELIVERY_TRANSPORT_BLOCKED'});
 }
 await assert.rejects(sendPart(payload,token,connectorKey,async()=>{throw new TypeError('Fetch failed',{cause:networkError()});}),{code:'DELIVERY_NETWORK_RETRY'});
}));

test('an authorization denial cannot turn into a transient error while discarding its body',()=>fixture(async({payload})=>{
 const fetchImpl=async()=>({status:401,body:{cancel:async()=>{throw networkError();}}});
 await assert.rejects(sendPart(payload,token,connectorKey,fetchImpl),{code:'DELIVERY_AUTH_BLOCKED'});
}));

test('a stored receipt is stable across replay and conflicting receipts cannot overwrite it',()=>fixture(async({store,payload})=>{
 const original=receipt(payload);assert.deepEqual(await store.confirm(payload,original),original);
 const first=await readFile(store.receiptFile(payload),'utf8');
 assert.deepEqual(await store.confirm(payload,{...original,replayed:true}),original);
 assert.equal(await readFile(store.receiptFile(payload),'utf8'),first);
 await assert.rejects(store.confirm(payload,{...original,newCanonical:0,duplicates:original.count}),{code:'DELIVERY_RECEIPT_CONFLICT'});
 assert.equal(await readFile(store.receiptFile(payload),'utf8'),first);
}));

test('a corrupt saved ACK is preserved rather than overwritten by a new confirmation',()=>fixture(async({store,payload})=>{
 await writeFile(store.receiptFile(payload),'null',{mode:0o600});
 await assert.rejects(store.confirm(payload,receipt(payload)),{code:'DELIVERY_RECEIPT_CORRUPT'});
 assert.equal(await readFile(store.receiptFile(payload),'utf8'),'null');
}));

test('stopping during a request preserves the queue and releases the lock for restart',()=>fixture(async({config,store})=>{
 const controller=new AbortController();let first=true;
 const fetchImpl=async(_url,options)=>{
  if(first){first=false;controller.abort();throw options.signal.reason;}
  return response(receipt(JSON.parse(options.body)));
 };
 await runSender(config,{once:true,signal:controller.signal,fetchImpl});
 assert.equal((await readdir(store.receiptDir)).length,0);
 assert.equal((await readdir(path.join(config.stateDir,'pending'))).length,1);
 await runSender(config,{once:true,fetchImpl});
 assert.equal((await readdir(store.receiptDir)).length,1);
}));

test('stopping after one received ACK preserves it and sends no further parts',()=>fixture(async({config,store})=>{
 const controller=new AbortController(),attempts=[];
 const fetchImpl=async(_url,options)=>{
  const payload=JSON.parse(options.body);attempts.push(payload.partStart);
  controller.abort();return response(receipt(payload));
 };
 await runSender(config,{once:true,signal:controller.signal,fetchImpl});
 assert.deepEqual(attempts,[0]);assert.equal((await readdir(store.receiptDir)).length,1);
 await runSender(config,{once:true,fetchImpl:async(_url,options)=>{const payload=JSON.parse(options.body);attempts.push(payload.partStart);return response(receipt(payload));}});
 assert.deepEqual(attempts,[0,500]);assert.equal((await readdir(store.receiptDir)).length,2);
},501));

test('invalid persisted retry state blocks before HTTP and preserves the evidence',()=>fixture(async({config,statusFile})=>{
 const state={version:'pm10-sender-status.v1',state:'retry_wait',physicalClockVerified:false,updatedAt:capturedAt,nextAttemptAt:capturedAt,failures:1001,code:'DELIVERY_NETWORK_RETRY'};
 await writeFile(statusFile,JSON.stringify(state),{mode:0o600});let calls=0;
 await assert.rejects(runSender(config,{once:true,fetchImpl:async()=>{calls++;}}),{code:'DELIVERY_STATE_CORRUPT'});
 assert.equal(calls,0);assert.deepEqual(JSON.parse(await readFile(statusFile,'utf8')),state);
}));
