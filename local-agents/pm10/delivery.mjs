// SPDX-License-Identifier: GPL-2.0-only
// HTTPS sender only. It never opens a clock socket, reads a CommKey or deletes capture data.
import {lstat,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {hash,atomicJson,safeDirectory} from './store.mjs';
import {fault} from './config.mjs';
export const ENDPOINT='https://municipio-junin-friendly.vercel.app/api/attendance-pm10';
export const PART_SIZE=500;
const hex=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const retryStatuses=new Set([408,425,429,500,502,503,504]);
const permanentCodes=new Set(['PM10_AUTH_DENIED','PM10_CONTEXT_DENIED','PM10_BINDING_REQUIRED','PM10_IDENTITY_KEY_REQUIRED','PM10_NOT_READY','PM10_PAYLOAD_INVALID','PM10_IDEMPOTENCY_CONFLICT','PM10_EVENT_CONFLICT']);
const retryTransportCodes=new Set(['ECONNRESET','ECONNREFUSED','EPIPE','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET']);
function transportFault(error){
 // Certificate, redirect and unrecognized failures need review, not an endless loop.
 const causes=[];for(let e=error;e&&causes.length<4;e=e.cause)causes.push(e);
 const transient=causes.some(e=>retryTransportCodes.has(e.code)||e.name==='TimeoutError'||e.name==='AbortError');
 return fault(transient?'DELIVERY_NETWORK_RETRY':'DELIVERY_TRANSPORT_BLOCKED');
}
async function discard(response){try{await response.body?.cancel();}catch{/* Discard failure must not hide an authorization rejection. */}}
export function validateSenderConfig(x){
 const keys=['schema','approved','stateDir','tokenFile','connectorKey','pollSeconds'];
 if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join()!==keys.sort().join()||x.schema!=='pm10-delivery-config.v1'||x.approved!==true)throw fault('DELIVERY_CONFIG_INVALID');
 for(const k of ['stateDir','tokenFile'])if(typeof x[k]!=='string'||!path.isAbsolute(x[k])||/[\x00-\x1f]/.test(x[k])||path.resolve(x[k])===path.parse(x[k]).root)throw fault('DELIVERY_PATH_INVALID');
 if(!/^[a-z0-9][a-z0-9._-]{7,127}$/.test(x.connectorKey)||!Number.isInteger(x.pollSeconds)||x.pollSeconds<60||x.pollSeconds>3600)throw fault('DELIVERY_CONFIG_INVALID');
 return Object.freeze({...x,stateDir:path.resolve(x.stateDir),tokenFile:path.resolve(x.tokenFile)});
}
async function file(p,max,privateMode=false){const s=await lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size>max||(privateMode&&process.platform!=='win32'&&(s.mode&0o077)))throw fault('DELIVERY_FILE_UNSAFE');return readFile(p);}
export async function loadSenderConfig(p){return validateSenderConfig(JSON.parse((await file(p,4096,true)).toString('utf8')));}
export async function loadToken(p){const b=await file(p,256,true);try{const t=b.toString('utf8').replace(/\r?\n$/,'');if(!/^[A-Za-z0-9_-]{43,128}$/.test(t))throw fault('DELIVERY_TOKEN_INVALID');return t;}finally{b.fill(0);}}
export function validateBatch(name,m,bytes){
 if(!hex.test(name)||m?.version!=='pm10-local-batch.v1'||m.batchId!==name||!Buffer.isBuffer(bytes)||bytes.length<40||bytes.length>4194304||bytes.length%40||m.newUniqueRecords!==bytes.length/40||m.recordsSha256!==hash(bytes)||!hex.test(m.snapshotSha256)||hash(m.snapshotSha256+':'+m.recordsSha256)!==name||m.clockTimeZone!=='America/Argentina/Mendoza'||m.cloudConfirmed!==false)throw fault('DELIVERY_BATCH_CORRUPT');
 if(!Number.isSafeInteger(m.snapshotRecordCount)||m.snapshotRecordCount<m.newUniqueRecords||m.snapshotRecordCount>104857||m.snapshotBytes!==4+m.snapshotRecordCount*40||!Array.isArray(m.ordinals)||m.ordinals.length!==m.newUniqueRecords||m.ordinals.some((n,i)=>!Number.isSafeInteger(n)||n<1||n>m.snapshotRecordCount||(i&&n<=m.ordinals[i-1])))throw fault('DELIVERY_BATCH_CORRUPT');
 if(typeof m.capturedAt!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.capturedAt)||!Number.isFinite(Date.parse(m.capturedAt))||new Date(m.capturedAt).toISOString()!==m.capturedAt)throw fault('DELIVERY_BATCH_CORRUPT');
 return {manifest:m,bytes};
}
export function partPayload(m,bytes,start){
 if(!Number.isInteger(start)||start<0||start>=m.newUniqueRecords||start%PART_SIZE)throw fault('DELIVERY_PART_INVALID');
 const end=Math.min(start+PART_SIZE,m.newUniqueRecords),part=bytes.subarray(start*40,end*40);
 return {version:'pm10-delivery.v1',serial:'CQTU225360168',batchId:m.batchId,snapshotSha256:m.snapshotSha256,recordsSha256:m.recordsSha256,snapshotRecordCount:m.snapshotRecordCount,totalRecords:m.newUniqueRecords,partStart:start,capturedAt:m.capturedAt,partSha256:hash(part),ordinals:m.ordinals.slice(start,end),recordsBase64:part.toString('base64')};
}
export function checkReceipt(r,p){
 const fields=['version','receiptId','batchId','partStart','partSha256','snapshotSha256','count','newCanonical','observed','duplicates','receivedAt','persisted','payrollModified','replayed'];
 if(!r||typeof r!=='object'||Object.keys(r).sort().join()!==fields.sort().join()||r.version!=='pm10-receipt.v1'||!uuid.test(r.receiptId)||r.persisted!==true||r.payrollModified!==false||typeof r.replayed!=='boolean'||!Number.isFinite(Date.parse(r.receivedAt)))throw fault('DELIVERY_RECEIPT_INVALID');
 for(const k of ['batchId','partStart','partSha256','snapshotSha256'])if(r[k]!==p[k])throw fault('DELIVERY_RECEIPT_INVALID');
 if(!['count','newCanonical','observed','duplicates'].every(k=>Number.isSafeInteger(r[k])&&r[k]>=0)||r.count!==p.ordinals.length||r.newCanonical+r.observed+r.duplicates!==r.count)throw fault('DELIVERY_RECEIPT_INVALID');
 return r;
}
export async function sendPart(p,token,connector,fetchImpl=fetch,signal){
 let response;
 if(signal?.aborted)throw fault('DELIVERY_STOPPED');
 const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000);
 try{response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',cache:'no-store',signal:requestSignal,headers:{'content-type':'application/json','authorization':'Bearer '+token,'x-pm10-connector':connector},body:JSON.stringify(p)});}catch(e){if(signal?.aborted)throw fault('DELIVERY_STOPPED');throw transportFault(e);}
 if(response.status===401||response.status===403){await discard(response);throw fault('DELIVERY_AUTH_BLOCKED');}
 if(response.redirected){await discard(response);throw fault('DELIVERY_TRANSPORT_BLOCKED');}
 if(response.status!==200&&response.status!==409&&!retryStatuses.has(response.status)){await discard(response);throw fault('DELIVERY_REJECTED');}
 if(!response.body)throw fault(retryStatuses.has(response.status)?'DELIVERY_NETWORK_RETRY':'DELIVERY_RECEIPT_INVALID');
 const reader=response.body.getReader();let n=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>8192){await reader.cancel();throw fault('DELIVERY_RECEIPT_INVALID');}chunks.push(Buffer.from(value));}}
 catch(e){if(signal?.aborted)throw fault('DELIVERY_STOPPED');if(e.code==='DELIVERY_RECEIPT_INVALID')throw e;throw transportFault(e);}finally{reader.releaseLock();}
 let json;try{json=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{if(!retryStatuses.has(response.status))throw fault('DELIVERY_RECEIPT_INVALID');}
 if(json?.ok===false&&permanentCodes.has(json.code))throw fault('DELIVERY_REJECTED');
 if(retryStatuses.has(response.status)||(response.status===409&&json?.ok===false&&json.code==='PM10_BUSY'))throw fault('DELIVERY_NETWORK_RETRY');
 if(response.status!==200||json?.ok!==true||Object.keys(json).sort().join()!=='ok,receipt')throw fault('DELIVERY_REJECTED');
 return checkReceipt(json.receipt,p);
}
export class DeliveryStore{
 constructor(root){this.captureRoot=root;this.root=path.join(root,'delivery');this.receiptDir=path.join(this.root,'receipts');}
 async init(){
  const st=await lstat(this.captureRoot);if(!st.isDirectory()||st.isSymbolicLink()||(process.platform!=='win32'&&(st.mode&0o077)))throw fault('DELIVERY_FILE_UNSAFE');
  await safeDirectory(this.root);await safeDirectory(this.receiptDir);return this;
 }
 async *iterateBatches(){
  const dir=path.join(this.captureRoot,'pending'),st=await lstat(dir);if(!st.isDirectory()||st.isSymbolicLink())throw fault('DELIVERY_FILE_UNSAFE');
  for(const name of (await readdir(dir)).sort()){
   if(/^\.pending-[a-f0-9-]+$/.test(name))continue;
   if(!hex.test(name))throw fault('DELIVERY_BATCH_CORRUPT');
   const root=path.join(dir,name),s=await lstat(root);if(!s.isDirectory()||s.isSymbolicLink())throw fault('DELIVERY_FILE_UNSAFE');
   const names=(await readdir(root)).sort();if(names.join()!=='manifest.json,records.bin')throw fault('DELIVERY_BATCH_CORRUPT');
   const m=JSON.parse((await file(path.join(root,'manifest.json'),4194304)).toString('utf8'));
   yield validateBatch(name,m,await file(path.join(root,'records.bin'),4194304));
  }
 }
 async batches(){const a=[];for await(const item of this.iterateBatches())a.push(item);return a;}
 receiptFile(p){return path.join(this.receiptDir,p.batchId+'-'+p.partStart+'.json');}
 async acknowledged(p){
  let x;try{x=JSON.parse((await file(this.receiptFile(p),4096,true)).toString('utf8'));}catch(e){if(e.code==='ENOENT')return false;throw fault('DELIVERY_RECEIPT_CORRUPT');}
  if(!x||typeof x!=='object'||Object.keys(x).sort().join()!=='receipt,requestSha256'||x.requestSha256!==hash(JSON.stringify(p)))throw fault('DELIVERY_RECEIPT_CORRUPT');
  try{return checkReceipt(x.receipt,p);}catch{throw fault('DELIVERY_RECEIPT_CORRUPT');}
 }
 async confirm(p,r){
  checkReceipt(r,p);
  const previous=await this.acknowledged(p);
  if(previous){
   if(Object.keys(previous).some(k=>k!=='replayed'&&previous[k]!==r[k]))throw fault('DELIVERY_RECEIPT_CONFLICT');
   return previous;
  }
  await atomicJson(this.receiptFile(p),{requestSha256:hash(JSON.stringify(p)),receipt:r});
  // Report confirmation only after the durable write and a read of the stored receipt.
  const persisted=await this.acknowledged(p);
  if(!persisted)throw fault('DELIVERY_RECEIPT_CORRUPT');
  return persisted;
 }
 async deliver({token,connectorKey,fetchImpl=fetch,limit=4,signal}){
  if(!Number.isInteger(limit)||limit<1||limit>32)throw fault('DELIVERY_LIMIT_INVALID');
  let sent=0,confirmedRecords=0,remainingParts=0,lastReceiptAt=null;
  for await(const {manifest:m,bytes} of this.iterateBatches())for(let at=0;at<m.newUniqueRecords;at+=PART_SIZE){
   if(signal?.aborted)throw fault('DELIVERY_STOPPED');
   const p=partPayload(m,bytes,at);let ack=await this.acknowledged(p);
   if(!ack&&sent<limit){const received=await sendPart(p,token,connectorKey,fetchImpl,signal);ack=await this.confirm(p,received);sent++;}
   if(ack){confirmedRecords+=ack.count;if(!lastReceiptAt||Date.parse(ack.receivedAt)>Date.parse(lastReceiptAt))lastReceiptAt=ack.receivedAt;}else remainingParts++;
  }
  return {sent,confirmedRecords,remainingParts,lastReceiptAt,captureFilesRemoved:false,physicalClockVerified:false};
 }
}
