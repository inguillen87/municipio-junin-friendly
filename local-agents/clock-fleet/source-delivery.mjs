// SPDX-License-Identifier: GPL-2.0-only
// Source storage only: never consumes a canonical ACK, deletes capture bytes,
// opens a device socket or interprets attendance/payroll.
import path from 'node:path';
import {open,lstat} from 'node:fs/promises';
import {hash,atomicJson,safeDirectory} from '../pm10/store.mjs';
import {fault} from '../pm10/config.mjs';
import {validateFleetSenderConfig,privateJson,stamp,FleetDeliveryStore,fleetPartPayload,PART_SIZE,MAX_PARTS_PER_CYCLE} from './delivery.mjs';

export const SOURCE_ENDPOINT='https://municipio-junin-friendly.vercel.app/api/clock-source-ingest';
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const uuid=value=>typeof value==='string'&&UUID.test(value)&&value!=='00000000-0000-0000-0000-000000000000';
const receiptStamp=value=>stamp(value)&&/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(value);
const HEX=/^[a-f0-9]{64}$/;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).sort().join()===keys.slice().sort().join();
const fail=code=>{throw fault('CLOCK_SOURCE_DELIVERY_'+code);};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function validateSourceSenderConfig(v){
 if(!exact(v,['schema','approved','enabled','stateDir','tenantId','windowSeconds','clocks'])||v.schema!=='clock-fleet-source-config.v1'||typeof v.approved!=='boolean'||typeof v.enabled!=='boolean'||v.enabled&&!v.approved||!uuid(v.tenantId)||!integer(v.windowSeconds,900,3600)||v.windowSeconds%900)fail('CONFIG_INVALID');
 // Reuse capture/serial/path restrictions, including the explicit PM10 exclusion.
 const shared=validateFleetSenderConfig({schema:'clock-fleet-delivery-config.v1',approved:true,stateDir:v.stateDir,pollSeconds:v.windowSeconds,clocks:v.clocks});
 return Object.freeze({...v,stateDir:shared.stateDir,clocks:shared.clocks});
}
export async function loadSourceSenderConfig(file){return validateSourceSenderConfig(await privateJson(file,65536));}
export async function ensureSourceDirectory(dir){
 // Check existing ancestors before creating anything: a symlinked state root
 // must not redirect coordinator writes outside the configured local queue.
 for(let at=path.resolve(dir);;at=path.dirname(at)){
  try{const s=await lstat(at);if(!s.isDirectory()||s.isSymbolicLink())fail('FILE_UNSAFE');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(at===path.dirname(at))break;
 }
 await safeDirectory(dir);
}
export function checkSourceReceipt(r,p,tenantId){
 const keys=['version','receiptId','tenantId','serial','batchId','partStart','partSha256','snapshotSha256','recordsSha256','count','receivedAt','persisted','scope','payrollModified','replayed'];
 if(!exact(r,keys)||r.version!=='clock-source-receipt.v1'||!uuid(r.receiptId)||!uuid(tenantId)||r.tenantId!==tenantId||r.persisted!==true||r.scope!=='source_only'||r.payrollModified!==false||typeof r.replayed!=='boolean'||!receiptStamp(r.receivedAt))fail('RECEIPT_INVALID');
 for(const key of ['serial','batchId','partStart','partSha256','snapshotSha256','recordsSha256'])if(r[key]!==p[key])fail('RECEIPT_INVALID');
 if(!integer(r.count,1,PART_SIZE)||r.count!==p.ordinals.length)fail('RECEIPT_INVALID');return r;
}
const retryStatuses=new Set([408,425,429,500,502,503,504]);
const permanentCodes=new Set(['CLOCK_SOURCE_AUTH_DENIED','CLOCK_SOURCE_PAYLOAD_INVALID','CLOCK_SOURCE_IDEMPOTENCY_CONFLICT','CLOCK_SOURCE_CAPACITY_LIMIT','CLOCK_SOURCE_BATCH_INTEGRITY_INVALID','CLOCK_SOURCE_NOT_READY','CLOCK_SOURCE_NOT_CONFIGURED']);
const networkCodes=new Set(['ECONNRESET','ECONNREFUSED','EPIPE','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET']);
function transportFailure(error){const seen=new Set();for(let e=error;e&&seen.size<4&&!seen.has(e);e=e.cause){seen.add(e);if(networkCodes.has(e.code)||['AbortError','TimeoutError'].includes(e.name))fail('NETWORK_RETRY');}fail('TRANSPORT_BLOCKED');}
async function discard(response){try{await response.body?.cancel();}catch{}}
export async function sendSourcePart(payload,token,connectorKey,tenantId,fetchImpl=fetch,signal){
 if(signal?.aborted)fail('STOPPED');
 if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(token)||typeof connectorKey!=='string'||!/^[a-z0-9][a-z0-9._-]{7,127}$/.test(connectorKey)||!uuid(tenantId))fail('CONFIG_INVALID');
 const timeout=AbortSignal.timeout(20000),requestSignal=signal?AbortSignal.any([signal,timeout]):timeout;let response;
 try{response=await fetchImpl(SOURCE_ENDPOINT,{method:'POST',redirect:'error',cache:'no-store',signal:requestSignal,headers:{'content-type':'application/json','authorization':'Bearer '+token,'x-clock-connector':connectorKey},body:JSON.stringify(payload)});}
 catch(e){if(signal?.aborted)fail('STOPPED');transportFailure(e);}
 if([401,403].includes(response.status)){await discard(response);fail('AUTH_BLOCKED');}
 if(response.redirected){await discard(response);fail('TRANSPORT_BLOCKED');}
 if(response.status!==200&&response.status!==409&&!retryStatuses.has(response.status)){await discard(response);fail('REJECTED');}
 if(!response.body)fail(retryStatuses.has(response.status)?'NETWORK_RETRY':'RECEIPT_INVALID');
 const reader=response.body.getReader(),chunks=[];let count=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>8192){await reader.cancel();fail('RECEIPT_INVALID');}chunks.push(Buffer.from(value));}}
 catch(e){if(signal?.aborted)fail('STOPPED');if(e.code==='CLOCK_SOURCE_DELIVERY_RECEIPT_INVALID')throw e;transportFailure(e);}finally{reader.releaseLock();}
 let json;try{json=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{if(!retryStatuses.has(response.status))fail('RECEIPT_INVALID');}
 if(json?.ok===false&&permanentCodes.has(json.code))fail('REJECTED');
 if(retryStatuses.has(response.status)||response.status===409&&json?.ok===false&&json.code==='CLOCK_SOURCE_BUSY')fail('NETWORK_RETRY');
 if(response.status!==200||!exact(json,['ok','receipt'])||json.ok!==true)fail('REJECTED');return checkSourceReceipt(json.receipt,payload,tenantId);
}
export class SourceDeliveryStore{
 constructor(captureRoot,identity){
  if(!exact(identity,['clockId','serial','connectorKey','tenantId'])||!uuid(identity.tenantId))fail('CONFIG_INVALID');
  // This reader is never initialized: its canonical delivery directory is never created.
  this.reader=new FleetDeliveryStore(captureRoot,{clockId:identity.clockId,serial:identity.serial,connectorKey:identity.connectorKey});
  this.captureRoot=this.reader.captureRoot;this.identity=Object.freeze({...identity});
  this.root=path.join(this.captureRoot,'delivery-source');this.receiptDir=path.join(this.root,'receipts');
 }
 async init(){
  await this.reader.assertCaptureIdentity();await ensureSourceDirectory(this.root);await ensureSourceDirectory(this.receiptDir);
  for(const file of [this.root,this.receiptDir]){const s=await lstat(file);if(!s.isDirectory()||s.isSymbolicLink()||process.platform!=='win32'&&(s.mode&0o077))fail('FILE_UNSAFE');}
  const expected={schema:'clock-fleet-source-identity.v1',...this.identity},file=path.join(this.root,'identity.json');
  try{const h=await open(file,'wx',0o600);try{await h.writeFile(JSON.stringify(expected));await h.sync();}finally{await h.close();}}catch(e){if(e.code!=='EEXIST')throw e;}
  const saved=await privateJson(file,2048);if(!exact(saved,Object.keys(expected))||Object.keys(expected).some(k=>saved[k]!==expected[k]))fail('IDENTITY_MISMATCH');return this;
 }
 iterateBatches(){return this.reader.iterateBatches();}
 receiptFile(p){if(!HEX.test(p.batchId)||!integer(p.partStart,0,104856)||p.partStart%PART_SIZE)fail('PART_INVALID');return path.join(this.receiptDir,p.batchId+'-'+p.partStart+'.json');}
 async acknowledged(p){
  let value;try{value=await privateJson(this.receiptFile(p),8192);}catch(e){if(e.code==='ENOENT')return false;fail('RECEIPT_CORRUPT');}
  if(!exact(value,['requestSha256','receipt'])||value.requestSha256!==hash(JSON.stringify(p)))fail('RECEIPT_CORRUPT');
  try{return checkSourceReceipt(value.receipt,p,this.identity.tenantId);}catch{fail('RECEIPT_CORRUPT');}
 }
 async confirm(p,r){
  checkSourceReceipt(r,p,this.identity.tenantId);const previous=await this.acknowledged(p);
  if(previous){if(Object.keys(previous).some(k=>k!=='replayed'&&previous[k]!==r[k]))fail('RECEIPT_CONFLICT');return previous;}
  await atomicJson(this.receiptFile(p),{requestSha256:hash(JSON.stringify(p)),receipt:r});const stored=await this.acknowledged(p);if(!stored)fail('RECEIPT_CORRUPT');return stored;
 }
 async deliver({token,fetchImpl=fetch,signal,limit=MAX_PARTS_PER_CYCLE,beforeSend=()=>true}){
  if(!integer(limit,1,MAX_PARTS_PER_CYCLE))fail('LIMIT_INVALID');let sent=0,sourceStoredRecords=0,remainingParts=0,lastReceiptAt=null;
  for await(const{manifest,bytes}of this.iterateBatches())for(let start=0;start<manifest.newUniqueRecords;start+=PART_SIZE){
   if(signal?.aborted)fail('STOPPED');const payload=fleetPartPayload(manifest,bytes,start);let receipt=await this.acknowledged(payload);
   if(!receipt&&sent<limit&&beforeSend()){receipt=await this.confirm(payload,await sendSourcePart(payload,token,this.identity.connectorKey,this.identity.tenantId,fetchImpl,signal));sent++;}
   if(receipt){sourceStoredRecords+=receipt.count;if(!lastReceiptAt||Date.parse(receipt.receivedAt)>Date.parse(lastReceiptAt))lastReceiptAt=receipt.receivedAt;}else remainingParts++;
  }
  return{sent,sourceStoredRecords,remainingParts,lastReceiptAt,captureFilesRemoved:false,physicalClockVerified:false,scope:'source_only',payrollModified:false};
 }
}
