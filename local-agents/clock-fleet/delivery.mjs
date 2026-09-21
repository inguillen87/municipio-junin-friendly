// SPDX-License-Identifier: GPL-2.0-only
// Reads existing fleet captures only. No clock socket, CommKey, source rewrite or deletion.
import path from 'node:path';
import {lstat,readFile,readdir,open} from 'node:fs/promises';
import {hash,atomicJson,safeDirectory} from '../pm10/store.mjs';
import {fault} from '../pm10/config.mjs';

export const ENDPOINT='https://municipio-junin-friendly.vercel.app/api/attendance-zk40';
export const PART_SIZE=500,MAX_PARTS_PER_CYCLE=4;
const HEX=/^[a-f0-9]{64}$/,ID=/^[a-z][a-z0-9-]{1,63}$/,SERIAL=/^[A-Za-z0-9-]{6,64}$/;
const CONNECTOR=/^[a-z0-9][a-z0-9._-]{7,127}$/,UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).sort().join()===keys.slice().sort().join();
const fail=code=>{throw fault('ZK40_DELIVERY_'+code);};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export function stamp(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===v.slice(0,10);}
function absolute(v){if(typeof v!=='string'||!path.isAbsolute(v)||/[\x00-\x1f"]/.test(v)||v.startsWith('\\\\')||path.resolve(v)===path.parse(v).root)fail('PATH_INVALID');return path.resolve(v);}
const pathKey=p=>process.platform==='win32'?p.toLowerCase():p;
export function validateFleetSenderConfig(v){
 if(!exact(v,['schema','approved','stateDir','pollSeconds','clocks'])||v.schema!=='clock-fleet-delivery-config.v1'||v.approved!==true||!integer(v.pollSeconds,60,3600)||!Array.isArray(v.clocks)||!integer(v.clocks.length,1,16))fail('CONFIG_INVALID');
 const stateDir=absolute(v.stateDir),ids=new Set(),serials=new Set(),connectors=new Set(),tokens=new Set();
 const clocks=v.clocks.map(c=>{
  if(!exact(c,['clockId','serial','tokenFile','connectorKey','enabled'])||!ID.test(c.clockId)||typeof c.clockId!=='string'||typeof c.serial!=='string'||!SERIAL.test(c.serial)||c.serial.toUpperCase()==='CQTU225360168'||typeof c.connectorKey!=='string'||!CONNECTOR.test(c.connectorKey)||typeof c.enabled!=='boolean')fail('CONFIG_INVALID');
  const tokenFile=absolute(c.tokenFile),keys=[c.clockId,c.serial.toLowerCase(),c.connectorKey,pathKey(tokenFile)],sets=[ids,serials,connectors,tokens];
  if(sets.some((set,i)=>set.has(keys[i])))fail('DUPLICATE_IDENTITY');sets.forEach((set,i)=>set.add(keys[i]));
  return Object.freeze({...c,tokenFile});
 });return Object.freeze({...v,stateDir,clocks:Object.freeze(clocks)});
}
async function noLinks(p){for(let at=path.resolve(p);;at=path.dirname(at)){const s=await lstat(at);if(!s.isDirectory()||s.isSymbolicLink())fail('FILE_UNSAFE');if(at===path.dirname(at))break;}}
async function directory(p,privateMode=true){await noLinks(p);const s=await lstat(p);if(privateMode&&process.platform!=='win32'&&(s.mode&0o077))fail('FILE_UNSAFE');}
export async function privateFile(p,max){
 await noLinks(path.dirname(p));const s=await lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.size<1||s.size>max||(process.platform!=='win32'&&(s.mode&0o077)))fail('FILE_UNSAFE');
 const bytes=await readFile(p);if(bytes.length>max)fail('FILE_UNSAFE');return bytes;
}
export async function privateJson(p,max=8192){try{return JSON.parse((await privateFile(p,max)).toString('utf8'));}catch(e){if(e.code)throw e;fail('FILE_INVALID');}}
export async function loadFleetSenderConfig(file){return validateFleetSenderConfig(await privateJson(absolute(file),65536));}
export async function loadFleetToken(file){const bytes=await privateFile(file,256);try{const token=bytes.toString('utf8').replace(/\r?\n$/,'');if(!/^[A-Za-z0-9_-]{43,128}$/.test(token))fail('TOKEN_INVALID');return token;}finally{bytes.fill(0);}}
export function validateFleetBatch(name,m,bytes,identity){
 const fields=['version','clockId','serial','batchId','snapshotSha256','recordsSha256','snapshotRecordCount','snapshotBytes','newUniqueRecords','repeatedWithinNewRecords','ordinals','capturedAt','deviceTimeLocal','clockTimeZone','observation','cloudConfirmed'];
 if(!exact(m,fields)||m.version!=='clock-local-batch.v1'||m.clockId!==identity.clockId||m.serial!==identity.serial||!HEX.test(name)||m.batchId!==name||!Buffer.isBuffer(bytes)||!integer(bytes.length,40,4194280)||bytes.length%40||m.recordsSha256!==hash(bytes)||!HEX.test(m.snapshotSha256)||hash(identity.clockId+':'+identity.serial+':'+m.snapshotSha256+':'+m.recordsSha256)!==name)fail('BATCH_CORRUPT');
 if(!integer(m.newUniqueRecords,1,104857)||bytes.length!==m.newUniqueRecords*40||!integer(m.snapshotRecordCount,m.newUniqueRecords,104857)||m.snapshotBytes!==4+m.snapshotRecordCount*40||!integer(m.repeatedWithinNewRecords,0,m.snapshotRecordCount-m.newUniqueRecords)||!Array.isArray(m.ordinals)||m.ordinals.length!==m.newUniqueRecords||m.ordinals.some((n,i)=>!integer(n,1,m.snapshotRecordCount)||(i>0&&n<=m.ordinals[i-1])))fail('BATCH_CORRUPT');
 if(typeof m.capturedAt!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(m.capturedAt)||!stamp(m.capturedAt)||new Date(m.capturedAt).toISOString()!==m.capturedAt||m.clockTimeZone!=='America/Argentina/Mendoza'||m.cloudConfirmed!==false||m.observation!=='Exact raw records; no attendance or payroll interpretation'||!(m.deviceTimeLocal===null||typeof m.deviceTimeLocal==='string'&&m.deviceTimeLocal.length<=128&&!/[\x00-\x1f]/.test(m.deviceTimeLocal)))fail('BATCH_CORRUPT');
 return {manifest:m,bytes};
}
export function fleetPartPayload(m,bytes,start){
 validateFleetBatch(m.batchId,m,bytes,{clockId:m.clockId,serial:m.serial});
 return part(m,bytes,start);
}
function part(m,bytes,start){
 if(!integer(start,0,m.newUniqueRecords-1)||start%PART_SIZE)fail('PART_INVALID');
 const end=Math.min(start+PART_SIZE,m.newUniqueRecords),part=bytes.subarray(start*40,end*40);
 return {version:'zk40-delivery.v1',serial:m.serial,batchId:hash(m.snapshotSha256+':'+m.recordsSha256),snapshotSha256:m.snapshotSha256,recordsSha256:m.recordsSha256,snapshotRecordCount:m.snapshotRecordCount,totalRecords:m.newUniqueRecords,partStart:start,capturedAt:m.capturedAt,partSha256:hash(part),ordinals:m.ordinals.slice(start,end),recordsBase64:part.toString('base64')};
}
export function checkFleetReceipt(r,p){
 const fields=['version','serial','receiptId','batchId','partStart','partSha256','snapshotSha256','count','newCanonical','observed','duplicates','receivedAt','persisted','payrollModified','replayed'];
 if(!exact(r,fields)||r.version!=='zk40-receipt.v1'||!UUID.test(r.receiptId)||r.persisted!==true||r.payrollModified!==false||typeof r.replayed!=='boolean'||!stamp(r.receivedAt))fail('RECEIPT_INVALID');
 for(const key of ['serial','batchId','partStart','partSha256','snapshotSha256'])if(r[key]!==p[key])fail('RECEIPT_INVALID');
 if(!['count','newCanonical','observed','duplicates'].every(k=>integer(r[k],0,PART_SIZE))||r.count!==p.ordinals.length||r.newCanonical+r.observed+r.duplicates!==r.count)fail('RECEIPT_INVALID');return r;
}
const retryStatuses=new Set([408,425,429,500,502,503,504]);
const permanentCodes=new Set(['ZK40_AUTH_DENIED','ZK40_CONTEXT_DENIED','ZK40_BINDING_REQUIRED','ZK40_IDENTITY_KEY_REQUIRED','ZK40_NOT_READY','ZK40_PAYLOAD_INVALID','ZK40_IDEMPOTENCY_CONFLICT','ZK40_EVENT_CONFLICT']);
const networkCodes=new Set(['ECONNRESET','ECONNREFUSED','EPIPE','EHOSTUNREACH','ENETUNREACH','ETIMEDOUT','EAI_AGAIN','ENOTFOUND','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET']);
function transportFailure(error){const seen=new Set();for(let e=error;e&&seen.size<4&&!seen.has(e);e=e.cause){seen.add(e);if(networkCodes.has(e.code)||['AbortError','TimeoutError'].includes(e.name))fail('NETWORK_RETRY');}fail('TRANSPORT_BLOCKED');}
async function discard(response){try{await response.body?.cancel();}catch{}}
export async function sendFleetPart(payload,token,connectorKey,fetchImpl=fetch,signal){
 if(signal?.aborted)fail('STOPPED');if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(token)||typeof connectorKey!=='string'||!CONNECTOR.test(connectorKey))fail('CONFIG_INVALID');
 const timeout=AbortSignal.timeout(20000),requestSignal=signal?AbortSignal.any([signal,timeout]):timeout;let response;
 try{response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',cache:'no-store',signal:requestSignal,headers:{'content-type':'application/json','authorization':'Bearer '+token,'x-clock-connector':connectorKey},body:JSON.stringify(payload)});}
 catch(e){if(signal?.aborted)fail('STOPPED');transportFailure(e);}
 if([401,403].includes(response.status)){await discard(response);fail('AUTH_BLOCKED');}
 if(response.redirected){await discard(response);fail('TRANSPORT_BLOCKED');}
 if(response.status!==200&&response.status!==409&&!retryStatuses.has(response.status)){await discard(response);fail('REJECTED');}
 if(!response.body)fail(retryStatuses.has(response.status)?'NETWORK_RETRY':'RECEIPT_INVALID');
 const reader=response.body.getReader(),chunks=[];let count=0;
 try{for(;;){const{done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>8192){await reader.cancel();fail('RECEIPT_INVALID');}chunks.push(Buffer.from(value));}}
 catch(e){if(signal?.aborted)fail('STOPPED');if(e.code==='ZK40_DELIVERY_RECEIPT_INVALID')throw e;transportFailure(e);}finally{reader.releaseLock();}
 let json;try{json=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{if(!retryStatuses.has(response.status))fail('RECEIPT_INVALID');}
 if(json?.ok===false&&permanentCodes.has(json.code))fail('REJECTED');
 if(retryStatuses.has(response.status)||response.status===409&&json?.ok===false&&json.code==='ZK40_BUSY')fail('NETWORK_RETRY');
 if(response.status!==200||!exact(json,['ok','receipt'])||json.ok!==true)fail('REJECTED');return checkFleetReceipt(json.receipt,payload);
}
export class FleetDeliveryStore{
 constructor(captureRoot,identity){this.captureRoot=absolute(captureRoot);if(!exact(identity,['clockId','serial','connectorKey'])||!ID.test(identity.clockId)||!SERIAL.test(identity.serial)||!CONNECTOR.test(identity.connectorKey))fail('CONFIG_INVALID');this.identity=Object.freeze({...identity});this.root=path.join(this.captureRoot,'delivery-zk40');this.receiptDir=path.join(this.root,'receipts');}
 async assertCaptureIdentity(){await directory(this.captureRoot);const identity=await privateJson(path.join(this.captureRoot,'identity.json'),1024);if(!exact(identity,['schema','clockId','serial'])||identity.schema!=='clock-fleet-identity.v1'||identity.clockId!==this.identity.clockId||identity.serial!==this.identity.serial)fail('IDENTITY_MISMATCH');}
 async init(){
  await this.assertCaptureIdentity();await safeDirectory(this.root);await safeDirectory(this.receiptDir);await directory(this.root);await directory(this.receiptDir);
  const expected={schema:'clock-fleet-delivery-identity.v1',...this.identity},file=path.join(this.root,'identity.json');
  try{const h=await open(file,'wx',0o600);try{await h.writeFile(JSON.stringify(expected));await h.sync();}finally{await h.close();}}
  catch(e){if(e.code!=='EEXIST')throw e;}
  const value=await privateJson(file,2048);if(!exact(value,Object.keys(expected))||Object.keys(expected).some(k=>expected[k]!==value[k]))fail('IDENTITY_MISMATCH');return this;
 }
 async *iterateBatches(){
  await this.assertCaptureIdentity();const dir=path.join(this.captureRoot,'pending');await directory(dir);
  for(const name of (await readdir(dir)).sort()){
   const root=path.join(dir,name);await directory(root);
   if(/^\.pending-[a-f0-9-]+$/.test(name))continue;
   if(!HEX.test(name)||(await readdir(root)).sort().join()!=='manifest.json,records.bin')fail('BATCH_CORRUPT');
   const m=await privateJson(path.join(root,'manifest.json'),4194304),bytes=await privateFile(path.join(root,'records.bin'),4194280);
   yield validateFleetBatch(name,m,bytes,this.identity);
  }
 }
 async batches(){const list=[];for await(const batch of this.iterateBatches())list.push(batch);return list;}
 receiptFile(p){if(!HEX.test(p.batchId)||!integer(p.partStart,0,104856)||p.partStart%PART_SIZE)fail('PART_INVALID');return path.join(this.receiptDir,p.batchId+'-'+p.partStart+'.json');}
 async acknowledged(p){
  let value;try{value=await privateJson(this.receiptFile(p),8192);}catch(e){if(e.code==='ENOENT')return false;fail('RECEIPT_CORRUPT');}
  if(!exact(value,['requestSha256','receipt'])||value.requestSha256!==hash(JSON.stringify(p)))fail('RECEIPT_CORRUPT');
  try{return checkFleetReceipt(value.receipt,p);}catch{fail('RECEIPT_CORRUPT');}
 }
 async confirm(p,r){
  checkFleetReceipt(r,p);const previous=await this.acknowledged(p);
  if(previous){if(Object.keys(previous).some(k=>k!=='replayed'&&previous[k]!==r[k]))fail('RECEIPT_CONFLICT');return previous;}
  await atomicJson(this.receiptFile(p),{requestSha256:hash(JSON.stringify(p)),receipt:r});const stored=await this.acknowledged(p);if(!stored)fail('RECEIPT_CORRUPT');return stored;
 }
 async deliver({token,fetchImpl=fetch,signal,limit=MAX_PARTS_PER_CYCLE}){
  if(!integer(limit,1,MAX_PARTS_PER_CYCLE))fail('LIMIT_INVALID');let sent=0,confirmedRecords=0,remainingParts=0,lastReceiptAt=null;
  for await(const{manifest,bytes}of this.iterateBatches())for(let start=0;start<manifest.newUniqueRecords;start+=PART_SIZE){
   if(signal?.aborted)fail('STOPPED');const payload=part(manifest,bytes,start);let receipt=await this.acknowledged(payload);
   if(!receipt&&sent<limit){const result=await sendFleetPart(payload,token,this.identity.connectorKey,fetchImpl,signal);receipt=await this.confirm(payload,result);sent++;}
   if(receipt){confirmedRecords+=receipt.count;if(!lastReceiptAt||Date.parse(receipt.receivedAt)>Date.parse(lastReceiptAt))lastReceiptAt=receipt.receivedAt;}else remainingParts++;
  }
  return{sent,confirmedRecords,remainingParts,lastReceiptAt,captureFilesRemoved:false,physicalClockVerified:false};
 }
}
