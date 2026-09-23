// SPDX-License-Identifier: GPL-2.0-only
// One host coordinator for existing verified workers; no arbitrary executables or remote commands.
import path from 'node:path';import os from 'node:os';import {lstat,readFile,open,readdir,realpath} from 'node:fs/promises';
import {fault} from '../pm10/config.mjs';import {loadConfig} from '../pm10/config.mjs';
import {loadSenderConfig,checkReceipt} from '../pm10/delivery.mjs';import {loadFleetConfig} from './runner.mjs';
import {hash} from '../pm10/store.mjs';import {stamp,checkFleetReceipt} from './delivery.mjs';
import {loadSourceSenderConfig,checkSourceReceipt} from './source-delivery.mjs';
import {deliveryStatusProjection} from '../pm10/delivery-status.mjs';
export const WORKERS=Object.freeze({'fleet-capture':'runner.mjs','legacy-capture':'../pm10/service.mjs','legacy-delivery':'../pm10/sender.mjs','fleet-delivery':'sender.mjs','fleet-source-delivery':'source-sender.mjs'});
const plain=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.sort().join();
export function absoluteLocal(value){if(typeof value!=='string'||!path.isAbsolute(value)||/[\x00-\x1f"]/.test(value)||value.startsWith('\\\\')||path.resolve(value)===path.parse(value).root)throw fault('GATEWAY_PATH_INVALID');return path.resolve(value);}
export function gatewayConfig(value,hostname=os.hostname()){
 if(!plain(value,['schema','approved','approvedHost','stateDir','workers'])||value.schema!=='municipal-clock-gateway.v1'||value.approved!==true||typeof value.approvedHost!=='string'||!value.approvedHost.trim()||value.approvedHost.toLowerCase()!==hostname.toLowerCase()||!Array.isArray(value.workers)||value.workers.length<1||value.workers.length>Object.keys(WORKERS).length)throw fault('GATEWAY_HOST_CONFIG_INVALID');
 const seen=new Set();const workers=value.workers.map(w=>{if(!plain(w,['kind','configFile','enabled'])||!Object.hasOwn(WORKERS,w.kind)||seen.has(w.kind)||typeof w.enabled!=='boolean')throw fault('GATEWAY_WORKER_INVALID');seen.add(w.kind);return Object.freeze({...w,configFile:absoluteLocal(w.configFile)});});
 return Object.freeze({...value,stateDir:absoluteLocal(value.stateDir),workers:Object.freeze(workers)});
}
export async function safeJson(file,max=8192){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size<2||s.size>max||(process.platform!=='win32'&&(s.mode&0o077)))throw fault('GATEWAY_FILE_UNSAFE');return JSON.parse(await readFile(file,'utf8'));}
export async function loadGateway(file){return gatewayConfig(await safeJson(absoluteLocal(file)));}
const queueKey=value=>process.platform==='win32'?path.resolve(value).toLowerCase():path.resolve(value);
const overlaps=(a,b)=>a===b||a.startsWith(b+path.sep)||b.startsWith(a+path.sep);
export function validateOwnership(specs){
 const captures=specs.filter(x=>x.capture),deliveries=specs.filter(x=>!x.capture),seenSerial=new Set(),captureQueues=[];
 for(const s of captures){const queue=queueKey(s.stateDir);if(seenSerial.has(s.serial.toLowerCase())||captureQueues.some(other=>overlaps(other,queue)))throw fault('GATEWAY_DUPLICATE_CAPTURE');seenSerial.add(s.serial.toLowerCase());captureQueues.push(queue);}
 const deliverySerial=new Set(),deliveryQueue=new Set(),connectors=new Set();
 const matches=(c,d)=>c.serial===d.serial&&queueKey(c.stateDir)===queueKey(d.stateDir)&&(c.clockId??null)===(d.clockId??null);
 for(const s of deliveries){
  if(!captures.some(c=>matches(c,s)))throw fault('GATEWAY_DELIVERY_WITHOUT_CAPTURE');
  if(typeof s.connectorKey!=='string'||!/^[a-z0-9][a-z0-9._-]{7,127}$/.test(s.connectorKey))throw fault('GATEWAY_DELIVERY_CONNECTOR_INVALID');
  const queue=queueKey(s.stateDir);if(deliverySerial.has(s.serial.toLowerCase())||deliveryQueue.has(queue)||connectors.has(s.connectorKey))throw fault('GATEWAY_DUPLICATE_DELIVERY');
  deliverySerial.add(s.serial.toLowerCase());deliveryQueue.add(queue);connectors.add(s.connectorKey);
 }
 return {captureIdentities:captures.length,deliveryIdentities:deliveries.length,allSendersConfigured:captures.length>0&&captures.every(c=>deliveries.some(d=>matches(c,d)))};
}
export async function inspectGateway(config){
 const identities=[],workerRoots=[];
 for(const w of config.workers){if(!w.enabled)continue;
  if(w.kind==='fleet-capture'){const f=await loadFleetConfig(w.configFile);workerRoots.push(f.stateDir);for(const c of f.clocks.filter(c=>c.enabled))identities.push({capture:true,clockId:c.clockId,serial:c.serial,stateDir:path.join(f.stateDir,c.clockId)});}
  else if(w.kind==='legacy-capture'){const c=await loadConfig(w.configFile);workerRoots.push(c.stateDir);identities.push({capture:true,clockId:null,serial:c.serial,stateDir:c.stateDir});}
  else if(w.kind==='fleet-delivery'){const {loadFleetSenderConfig}=await import('./delivery.mjs');const d=await loadFleetSenderConfig(w.configFile);workerRoots.push(d.stateDir);for(const c of d.clocks.filter(c=>c.enabled))identities.push({capture:false,clockId:c.clockId,serial:c.serial,stateDir:path.join(d.stateDir,c.clockId),connectorKey:c.connectorKey});}
  else if(w.kind==='fleet-source-delivery'){const {loadSourceSenderConfig}=await import('./source-delivery.mjs');const d=await loadSourceSenderConfig(w.configFile);if(!d.enabled)throw fault('GATEWAY_SOURCE_DISABLED');workerRoots.push(d.stateDir);for(const c of d.clocks.filter(c=>c.enabled))identities.push({capture:false,clockId:c.clockId,serial:c.serial,stateDir:path.join(d.stateDir,c.clockId),connectorKey:c.connectorKey});}
  else{const d=await loadSenderConfig(w.configFile);const {SERIAL}=await import('../pm10/reader/lector-fichadas.mjs');workerRoots.push(d.stateDir);identities.push({capture:false,clockId:null,serial:SERIAL,stateDir:d.stateDir,connectorKey:d.connectorKey});}
 }
 for(const root of workerRoots)if(overlaps(queueKey(config.stateDir),queueKey(root)))throw fault('GATEWAY_STATE_OVERLAP');
 return {schema:'municipal-clock-gateway-preflight.v1',...validateOwnership(identities),automaticHostRole:'requires_external_municipal_host',operationWhileLoggedOutVerified:false,networkTested:false,realWrites:0};
}

// This projection only opens bounded metadata files. It never initializes a store,
// acquires a capture lock, reads credentials/raw punches, or contacts a receiver.
const HEX=/^[a-f0-9]{64}$/,count=n=>Number.isSafeInteger(n)&&n>=0;
const nullableStamp=v=>v===null||stamp(v);
const codes=new Set(['LAYOUT_NOT_CONFIRMED','AUTH_NOT_ACCEPTED','AUTHENTICATION_UNVERIFIED','SERIAL_MISMATCH','QUEUE_CORRUPT','QUEUE_CAPACITY_REACHED','DISK_SPACE_LOW','MUNICIPAL_ROUTE_REQUIRED','ROUTE_LOOKUP_UNAVAILABLE','CONNECT_TIMEOUT','RESPONSE_TIMEOUT','CONNECTION_ENDED','CONNECTION_CLOSED','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','DELIVERY_NETWORK_RETRY','DELIVERY_AUTH_BLOCKED','DELIVERY_REJECTED','ZK40_DELIVERY_NETWORK_RETRY','ZK40_DELIVERY_AUTH_BLOCKED','ZK40_DELIVERY_REJECTED','CLOCK_SOURCE_DELIVERY_NETWORK_RETRY','CLOCK_SOURCE_DELIVERY_AUTH_BLOCKED','CLOCK_SOURCE_DELIVERY_REJECTED']);
for(const code of ['TRANSFER_NOT_CONFIRMED','BYTE_COUNT_MISMATCH','TOTAL_TIMEOUT','CHECKSUM_MISMATCH','SESSION_MISMATCH','REPLY_MISMATCH'])codes.add(code);
const safeObservation=value=>value==null?null:codes.has(value)?value:'REVIEW_REQUIRED';
const need=condition=>{if(!condition)throw fault('GATEWAY_EVIDENCE_INVALID');};
async function metadata(file,max,budget){
 const resolved=path.resolve(file);need(queueKey(await realpath(resolved))===queueKey(resolved));
 const s=await lstat(resolved);need(s.isFile()&&!s.isSymbolicLink()&&s.size>0&&s.size<=max&&(process.platform==='win32'||!(s.mode&0o077)));
 budget.bytes+=s.size;need(budget.bytes<=16*1024*1024);
 const h=await open(resolved,'r');try{
  const actual=await h.stat();need(actual.isFile()&&actual.dev===s.dev&&actual.ino===s.ino&&actual.size===s.size);
  const bytes=Buffer.alloc(s.size+1);let used=0;while(used<bytes.length){const r=await h.read(bytes,used,bytes.length-used,used);if(!r.bytesRead)break;used+=r.bytesRead;}need(used===s.size);
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,used)));need(value&&typeof value==='object'&&!Array.isArray(value));
  return{value,checkedAt:s.mtime.toISOString()};
 }finally{await h.close();}
}
async function directoryFiles(dir){
 const resolved=path.resolve(dir);need(queueKey(await realpath(resolved))===queueKey(resolved));const s=await lstat(resolved);
 need(s.isDirectory()&&!s.isSymbolicLink()&&(process.platform==='win32'||!(s.mode&0o077)));
 const names=await readdir(resolved);need(names.length<=2048);return names;
}
async function overviewDescriptors(config){
 const captures=[],deliveries=[],configuration=[];
 for(const worker of config.workers){
  let raw;
  if(worker.kind==='fleet-capture'){
   raw=await loadFleetConfig(worker.configFile);
   for(const c of raw.clocks)captures.push({capture:true,kind:worker.kind,clockId:c.clockId,label:c.label,serial:c.serial,stateDir:path.join(raw.stateDir,c.clockId),enabled:worker.enabled&&c.enabled});
  }else if(worker.kind==='legacy-capture'){
   raw=await loadConfig(worker.configFile);captures.push({capture:true,kind:worker.kind,clockId:null,label:'Edificio Viejo',serial:raw.serial,stateDir:raw.stateDir,enabled:worker.enabled});
  }else if(worker.kind==='legacy-delivery'){
   raw=await loadSenderConfig(worker.configFile);const {SERIAL}=await import('../pm10/reader/lector-fichadas.mjs');
   deliveries.push({capture:false,kind:worker.kind,clockId:null,serial:SERIAL,stateDir:raw.stateDir,connectorKey:raw.connectorKey,enabled:worker.enabled});
  }else{
   raw=worker.kind==='fleet-source-delivery'?await loadSourceSenderConfig(worker.configFile):await(await import('./delivery.mjs')).loadFleetSenderConfig(worker.configFile);
   for(const c of raw.clocks)deliveries.push({capture:false,kind:worker.kind,clockId:c.clockId,serial:c.serial,stateDir:path.join(raw.stateDir,c.clockId),connectorKey:c.connectorKey,tenantId:raw.tenantId,enabled:worker.enabled&&c.enabled&&(raw.enabled??true)});
  }
  configuration.push([worker,raw]);
 }
 // Disabled configured identities also cannot alias another queue in this view.
 validateOwnership([...captures,...deliveries]);
 for(const s of [...captures,...deliveries])need(!overlaps(queueKey(config.stateDir),queueKey(s.stateDir)));
 return{captures,deliveries,configuration:JSON.stringify(configuration)};
}
async function captureIdentity(c,budget){
 if(c.clockId===null)return;
 const {value:v}=await metadata(path.join(c.stateDir,'identity.json'),1024,budget);
 need(plain(v,['schema','clockId','serial'])&&v.schema==='clock-fleet-identity.v1'&&v.clockId===c.clockId&&v.serial===c.serial);
}
const emptyCapture=evidenceState=>({state:'unknown',lastAttemptAt:null,lastCaptureAt:null,nextPollAt:null,blocked:false,lastError:null,records:null,checkedAt:null,evidenceState});
async function captureSnapshot(c){
 const budget={bytes:0};try{
  await captureIdentity(c,budget);const {value:v,checkedAt}=await metadata(path.join(c.stateDir,'status.json'),32768,budget);
  need(c.clockId===null?v.schema==='pm10-local-status.v1'&&v.mode==='capture_only'&&v.cloudReception==='not_connected':v.schema==='clock-fleet-status.v1'&&v.clockId===c.clockId&&v.serial===c.serial&&v.cloudReception==='not_configured');
  need(['waiting','captured_locally','network_wait','connection_wait','retry_wait','blocked','review_required','disabled','stopped'].includes(v.status)&&typeof v.blocked==='boolean'&&count(v.failureCount)&&nullableStamp(v.lastAttemptAt)&&nullableStamp(v.lastCaptureAt)&&nullableStamp(v.nextPollAt));
  need(v.uniqueLocalRecords===undefined||count(v.uniqueLocalRecords));need(v.lastCaptureAt===null||HEX.test(v.lastCaptureSha256)&&count(v.snapshotRecordCount));
  need(v.status!=='captured_locally'||v.lastCaptureAt!==null);need(v.status!=='blocked'||v.blocked);
  return{state:v.status,lastAttemptAt:v.lastAttemptAt,lastCaptureAt:v.lastCaptureAt,nextPollAt:v.nextPollAt,blocked:v.blocked,lastError:safeObservation(v.lastError),records:v.uniqueLocalRecords??null,checkedAt,evidenceState:'verified'};
 }catch(e){return emptyCapture(e.code==='ENOENT'?'missing':'invalid');}
}
const emptyDelivery=(evidenceState,enabled=false,scope=null)=>({state:'unknown',enabled,lastReceiptAt:null,confirmedRecords:null,pendingParts:null,nextAttemptAt:null,lastError:null,scope,checkedAt:null,evidenceState});
async function receiptSummary(c,d,root,budget){
 const names=await directoryFiles(path.join(root,'receipts')),manifests=new Map();let records=0,lastReceiptAt=null;
 for(const name of names){
  // atomicJson may be publishing a receipt concurrently. Its incomplete file
  // is neither an ACK nor corruption of the previously committed receipts.
  if(/^[a-f0-9]{64}-(?:0|[1-9][0-9]*)\.json\.tmp-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(name))continue;
  const match=/^([a-f0-9]{64})-(0|[1-9][0-9]*)\.json$/.exec(name);need(match&&Number.isSafeInteger(Number(match[2])));
  const {value:stored}=await metadata(path.join(root,'receipts',name),8192,budget);
  need(plain(stored,['requestSha256','receipt'])&&HEX.test(stored.requestSha256));const r=stored.receipt;need(r&&r.batchId===match[1]&&r.partStart===Number(match[2])&&r.partStart%500===0&&HEX.test(r.partSha256));
  // Fleet wire batch IDs omit clockId/serial. Match its local manifest by the
  // same derivation, never by an ordinal, label, or a receipt from another queue.
  const localId=c.clockId===null?r.batchId:null;
  if(!manifests.size){
   for(const id of await directoryFiles(path.join(c.stateDir,'pending'))){
    if(/^\.pending-[a-f0-9-]+$/.test(id))continue;need(HEX.test(id));
    const {value:m}=await metadata(path.join(c.stateDir,'pending',id,'manifest.json'),4194304,budget);
    need(HEX.test(m.snapshotSha256)&&HEX.test(m.recordsSha256)&&m.batchId===id&&m.cloudConfirmed===false&&count(m.snapshotRecordCount)&&count(m.newUniqueRecords)&&m.newUniqueRecords>0&&m.newUniqueRecords<=m.snapshotRecordCount&&m.snapshotBytes===4+m.snapshotRecordCount*40&&Array.isArray(m.ordinals)&&m.ordinals.length===m.newUniqueRecords&&m.ordinals.every((n,i)=>Number.isSafeInteger(n)&&n>=1&&n<=m.snapshotRecordCount&&(!i||n>m.ordinals[i-1])));
    need(c.clockId===null?m.version==='pm10-local-batch.v1':m.version==='clock-local-batch.v1'&&m.clockId===c.clockId&&m.serial===c.serial);
    need(hash((c.clockId===null?'':c.clockId+':'+c.serial+':')+m.snapshotSha256+':'+m.recordsSha256)===id);
    const wireId=hash(m.snapshotSha256+':'+m.recordsSha256);need(!manifests.has(wireId));manifests.set(wireId,m);
   }
  }
  const m=manifests.get(localId??r.batchId);need(m&&r.snapshotSha256===m.snapshotSha256&&r.partStart<m.newUniqueRecords);
  const p={serial:c.serial,batchId:r.batchId,partStart:r.partStart,partSha256:r.partSha256,snapshotSha256:m.snapshotSha256,recordsSha256:m.recordsSha256,ordinals:m.ordinals.slice(r.partStart,r.partStart+500)};
  if(d.kind==='legacy-delivery')checkReceipt(r,p);else if(d.kind==='fleet-source-delivery')checkSourceReceipt(r,p,d.tenantId);else checkFleetReceipt(r,p);
  need(stamp(r.receivedAt));records+=r.count;need(count(records));if(!lastReceiptAt||Date.parse(r.receivedAt)>Date.parse(lastReceiptAt))lastReceiptAt=r.receivedAt;
 }
 return{confirmedRecords:records,lastReceiptAt};
}
async function deliverySnapshot(c,d){
 if(!d)return emptyDelivery('missing');const source=d.kind==='fleet-source-delivery',legacy=d.kind==='legacy-delivery',scope=source?'source_only':'canonical',budget={bytes:0};
 try{
  await captureIdentity(c,budget);const root=path.join(c.stateDir,legacy?'delivery':source?'delivery-source':'delivery-zk40');
  if(!legacy){const {value:v}=await metadata(path.join(root,'identity.json'),2048,budget);need(plain(v,source?['schema','clockId','serial','connectorKey','tenantId']:['schema','clockId','serial','connectorKey'])&&v.schema===(source?'clock-fleet-source-identity.v1':'clock-fleet-delivery-identity.v1')&&v.clockId===c.clockId&&v.serial===c.serial&&v.connectorKey===d.connectorKey&&(!source||v.tenantId===d.tenantId));}
  const {value:v}=await metadata(path.join(root,'status.json'),8192,budget);
  if(legacy){deliveryStatusProjection(v);need(stamp(v.updatedAt)&&nullableStamp(v.lastReceiptAt??null)&&nullableStamp(v.nextAttemptAt??null));}else{
   need(plain(v,['version','clockId','state','updatedAt','failures','code','sent',source?'sourceStoredRecords':'confirmedRecords','remainingParts','lastReceiptAt','lastReconciledAt','captureFilesRemoved','physicalClockVerified',...(source?['scope','payrollModified']:['nextAttemptAt'])]));
   need(v.version===(source?'clock-source-sender-status.v1':'zk40-sender-status.v1')&&v.clockId===c.clockId&&['ready','pending','queue_confirmed','source_stored','retry_wait','blocked'].includes(v.state)&&stamp(v.updatedAt)&&v.physicalClockVerified===false&&v.captureFilesRemoved===false&&count(v.failures)&&count(v.sent)&&v.sent<=4&&nullableStamp(v.lastReceiptAt)&&nullableStamp(v.lastReconciledAt));
   need(source?v.scope==='source_only'&&v.payrollModified===false&&v.state!=='queue_confirmed':v.state!=='source_stored');
   need(v.remainingParts===null||count(v.remainingParts));need((source?v.sourceStoredRecords:v.confirmedRecords)===null||count(source?v.sourceStoredRecords:v.confirmedRecords));
   need(v.state!=='retry_wait'||v.code===(source?'CLOCK_SOURCE_DELIVERY_NETWORK_RETRY':'ZK40_DELIVERY_NETWORK_RETRY')&&v.failures>0);
   need(v.state!=='blocked'||typeof v.code==='string'&&v.failures>0);need(source||nullableStamp(v.nextAttemptAt));
   need(!['queue_confirmed','source_stored'].includes(v.state)||v.remainingParts===0);
  }
  const receipts=await receiptSummary(c,d,root,budget);
  const recorded=source?v.sourceStoredRecords:v.confirmedRecords;
  need(recorded==null||recorded<=receipts.confirmedRecords);
  need(v.lastReceiptAt==null||receipts.lastReceiptAt!==null&&Date.parse(v.lastReceiptAt)<=Date.parse(receipts.lastReceiptAt));
  return{state:v.state,enabled:d.enabled,...receipts,pendingParts:v.remainingParts??null,nextAttemptAt:v.nextAttemptAt??null,lastError:safeObservation(v.code),scope,checkedAt:v.updatedAt,evidenceState:'verified'};
 }catch(e){return emptyDelivery(e.code==='ENOENT'?'missing':'invalid',d.enabled,scope);}
}
export async function readGatewayOverview(raw,{now=()=>new Date(),desiredState='unknown'}={}){
 const config=gatewayConfig(raw);need(['running','stopped','unknown'].includes(desiredState));await inspectGateway(config);
 const before=await overviewDescriptors(config),clocks=[];
 for(const c of before.captures){const d=before.deliveries.find(d=>d.serial===c.serial&&d.clockId===c.clockId&&queueKey(d.stateDir)===queueKey(c.stateDir));
  const capture=await captureSnapshot(c),delivery=await deliverySnapshot(c,d),evidenceState=[capture,delivery].some(b=>b.evidenceState==='invalid')?'invalid':[capture,delivery].some(b=>b.evidenceState==='missing')?'missing':'verified';
  clocks.push({clockId:c.clockId,label:c.label,enabled:c.enabled,capture,delivery,evidenceState});
 }
 need(before.configuration===(await overviewDescriptors(config)).configuration);
 return{schema:'municipal-clock-overview.v1',updatedAt:now().toISOString(),desiredState,clocks,counts:{configured:clocks.length,captured:clocks.filter(c=>c.capture.lastCaptureAt!==null).length,needsReview:clocks.filter(c=>c.evidenceState==='invalid'||c.capture.blocked||c.capture.state==='review_required'||['blocked','review_required'].includes(c.delivery.state)).length,withReceipt:clocks.filter(c=>c.delivery.lastReceiptAt!==null).length},networkTested:false,realWrites:0};
}
