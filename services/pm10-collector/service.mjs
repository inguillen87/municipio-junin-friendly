// SPDX-License-Identifier: GPL-2.0-only
// PM-10 service: one known key, read-only clock commands, durable encrypted outbox.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {collect,TARGET,PORT,SERIAL} from './lector-fichadas.mjs';
import {validateCollectorRequest,validateCollectorReceipt,sha256,collectorError} from '../../lib/clock-collector-contract.js';
const ENDPOINT='https://municipio-junin-friendly.vercel.app/api/clock-collector';
const VERSION='0.59.0',MAX_RECORDS=200000,MAX_QUEUE=64*1024*1024;
const die=code=>{throw collectorError(code);};
const safeCode=e=>typeof e?.code==='string'&&/^[A-Z][A-Z0-9_]{1,70}$/.test(e.code)?e.code:'LOCAL_ERROR';
export function validateConfig(c){
 const fields=['version','endpoint','connectorKey','host','port','serial','pollSeconds','stateDirectory','credentialDirectory','approved'];
 if(!c||typeof c!=='object'||Object.keys(c).length!==fields.length||Object.keys(c).some(k=>!fields.includes(k))||c.version!==VERSION||c.endpoint!==ENDPOINT||c.host!==TARGET||c.port!==PORT||c.serial!==SERIAL||c.approved!==true||! /^[a-z0-9][a-z0-9._-]{7,127}$/.test(c.connectorKey)||!Number.isSafeInteger(c.pollSeconds)||c.pollSeconds<60||c.pollSeconds>3600||!path.isAbsolute(c.stateDirectory)||!path.isAbsolute(c.credentialDirectory))die('CONFIGURATION_REQUIRED');
 if(c.stateDirectory===c.credentialDirectory)die('CREDENTIAL_DIRECTORY_MUST_BE_SEPARATE');
 return Object.freeze({...c});
}
export async function atomicFile(file,bytes){
 const tmp=file+'.'+randomUUID()+'.tmp';const f=await fs.open(tmp,'wx',0o600);
 try{await f.writeFile(bytes);await f.sync();}finally{await f.close();}
 await fs.rename(tmp,file);let d;
 try{d=await fs.open(path.dirname(file),'r');await d.sync();}catch(e){if(process.platform!=='win32')throw e;}finally{await d?.close();}
}
async function noSymlink(file){const st=await fs.lstat(file);if(st.isSymbolicLink())die('SYMLINK_NOT_ALLOWED');return st;}
async function ensureDir(dir){await fs.mkdir(dir,{recursive:true,mode:0o700});const st=await noSymlink(dir);if(!st.isDirectory())die('STATE_DIRECTORY_INVALID');if(process.platform!=='win32'&&(st.mode&0o077))die('STATE_PERMISSIONS_REQUIRED');}
export async function acquireLock(root){
 const name=path.join(root,'service.lock');
 for(let tries=0;tries<2;tries++){
  try{const f=await fs.open(name,'wx',0o600);await f.writeFile(JSON.stringify({pid:process.pid}));await f.sync();await f.close();return async()=>{await fs.unlink(name);};}
  catch(e){if(e.code!=='EEXIST')throw e;await noSymlink(name);let pid;try{pid=JSON.parse(await fs.readFile(name,'utf8')).pid;}catch{die('LOCK_REVIEW_REQUIRED');}
   if(!Number.isInteger(pid)||pid<=0)die('LOCK_REVIEW_REQUIRED');
   try{process.kill(pid,0);die('COLLECTOR_ALREADY_RUNNING');}catch(err){if(err.code!=='ESRCH')throw err;await fs.unlink(name);}
  }
 }
 die('LOCK_REVIEW_REQUIRED');
}
export async function readSecret(dir,name){
 const file=path.join(dir,name);const st=await noSymlink(file);
 if(!st.isFile()||st.size>1024||process.platform!=='win32'&&(st.mode&0o077))die('CREDENTIAL_PERMISSIONS_REQUIRED');
 return (await fs.readFile(file,'utf8')).trim();
}
export class Outbox {
 constructor(root,key){if(!Buffer.isBuffer(key)||key.length!==32)die('SPOOL_KEY_REQUIRED');this.root=root;this.key=key;this.state={version:VERSION,seen:[],blocked:null,lastReadAt:null,lastSource:null};}
 async init(){await ensureDir(this.root);await ensureDir(path.join(this.root,'pending'));const f=path.join(this.root,'state.json');
  try{await noSymlink(f);this.state=JSON.parse(await fs.readFile(f,'utf8'));if(this.state.version!==VERSION||!Array.isArray(this.state.seen)||this.state.seen.length>MAX_RECORDS||this.state.seen.some(x=>! /^[a-f0-9]{64}$/.test(x)))die('STATE_INVALID');}catch(e){if(e.code!=='ENOENT')throw e;}
  this.seen=new Set(this.state.seen);
  // A crash after queue commit but before checkpoint cannot silently lose these records.
  for(const file of await this.files()){const j=JSON.parse(await this.read(file));for(const raw of j.records)this.seen.add(sha256(Buffer.from(raw,'hex')));}
  await this.save();
 }
 async save(){this.state.seen=[...this.seen].sort();await atomicFile(path.join(this.root,'state.json'),JSON.stringify(this.state));}
 async files(){return (await fs.readdir(path.join(this.root,'pending'))).filter(x=>/^\d{13}-[a-f0-9-]{36}\.enc$/.test(x)).sort();}
 async count(){let count=0;for(const f of await this.files())count+=JSON.parse(await this.read(f)).records.length;return count;}
 async size(){let bytes=0;for(const f of await this.files())bytes+=(await noSymlink(path.join(this.root,'pending',f))).size;return bytes;}
 async read(name){const file=path.join(this.root,'pending',name);const st=await noSymlink(file);if(st.size>95000)die('SPOOL_RECORD_TOO_LARGE');const bytes=await fs.readFile(file);if(bytes.length<29)die('SPOOL_CORRUPTED');try{const dec=createDecipheriv('aes-256-gcm',this.key,bytes.subarray(0,12));dec.setAuthTag(bytes.subarray(12,28));const text=Buffer.concat([dec.update(bytes.subarray(28)),dec.final()]).toString('utf8');validateCollectorRequest(JSON.parse(text));return text;}catch{die('SPOOL_CORRUPTED');}}
 async enqueue(request){validateCollectorRequest(request);const text=JSON.stringify(request);if(await this.size()+Buffer.byteLength(text)+28>MAX_QUEUE)die('SPOOL_FULL');
  const nonce=randomBytes(12),enc=createCipheriv('aes-256-gcm',this.key,nonce);const data=Buffer.concat([enc.update(text,'utf8'),enc.final()]);
  const name=String(Date.now())+'-'+request.requestId+'.enc';await atomicFile(path.join(this.root,'pending',name),Buffer.concat([nonce,enc.getAuthTag(),data]));
  for(const raw of request.records)this.seen.add(sha256(Buffer.from(raw,'hex')));await this.save();
 }
 async acknowledge(file,receipt,text){validateCollectorReceipt(receipt,text);
  await atomicFile(path.join(this.root,'last-receipt.json'),JSON.stringify(receipt));await fs.unlink(path.join(this.root,'pending',file));
 }
 async block(code){this.state.blocked=code;await this.save();}
}
export function rawRecords(raw){
 if(!Buffer.isBuffer(raw)||raw.length<4||raw.length>4*1024*1024||raw.readUInt32LE()!==raw.length-4||(raw.length-4)%40)die('LAYOUT_NOT_40_BYTES');
 const rows=[];for(let i=4;i<raw.length;i+=40)rows.push(raw.subarray(i,i+40).toString('hex'));return rows;
}
export function captureRequest(config,{records=[],readAt,sourceSha256,state='read_ok',pendingRecords=0,kind='batch'}){
 return validateCollectorRequest({version:'clock-collector.v1',kind,requestId:randomUUID(),connectorKey:config.connectorKey,serial:config.serial,readAt,sourceSha256,state,pendingRecords,records});
}
export async function enqueueCapture(outbox,config,{report,raw,parsed}){
 if(report?.status==='AUTH_NOT_ACCEPTED')die('CLOCK_AUTH_REQUIRED');
 if(report?.status!=='ATTENDANCE_DOWNLOADED_FOR_REVIEW'||report.authenticationAccepted!==true||report.attendanceTransferComplete!==true||report.metadata?.serialNumber!==config.serial||report.cleanup?.bufferReleaseConfirmed!==true||report.cleanup?.exitConfirmed!==true||report.error)die(report?.error?.code||'READ_NOT_COMPLETE');
 if(raw?.length!==4&&parsed?.layout!=='legacy-40-byte-candidate')die('LAYOUT_NOT_40_BYTES');
 const rows=rawRecords(raw),unique=new Map();for(const row of rows){const hash=sha256(Buffer.from(row,'hex'));if(!outbox.seen.has(hash))unique.set(hash,row);}
 if(outbox.seen.size+unique.size>MAX_RECORDS)die('CHECKPOINT_LIMIT');
 const readAt=report.finishedAt,sourceSha256=sha256(raw);if(sourceSha256!==report.transfer.rawSha256)die('CAPTURE_HASH_MISMATCH');
 const values=[...unique.values()];for(let i=0;i<values.length;i+=500)await outbox.enqueue(captureRequest(config,{records:values.slice(i,i+500),readAt,sourceSha256,pendingRecords:await outbox.count()+Math.min(500,values.length-i)}));
 outbox.state.lastReadAt=readAt;outbox.state.lastSource=sourceSha256;await outbox.save();return {newRecords:values.length,totalRecords:rows.length};
}
async function responseText(response){const reader=response.body?.getReader();if(!reader)die('RECEIPT_BODY_MISSING');const a=[];let n=0;try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>20000){await reader.cancel();die('RECEIPT_TOO_LARGE');}a.push(Buffer.from(value));}}finally{reader.releaseLock();}return Buffer.concat(a).toString('utf8');}
export async function deliver(config,text,token,{fetchImpl=fetch,signal}={}){
 if(!/^[A-Za-z0-9._~-]{32,512}$/.test(token))die('SERVICE_TOKEN_REQUIRED');validateCollectorRequest(JSON.parse(text));
 const response=await fetchImpl(config.endpoint,{method:'POST',redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:text});
 if([401,403,409].includes(response.status))die('RECEIVER_AUTH_OR_POLICY_BLOCK');
 if(![200,202].includes(response.status))die('RECEIVER_UNAVAILABLE');
 let result;try{result=JSON.parse(await responseText(response));}catch{die('RECEIPT_INVALID');}
 if(result?.ok!==true||Object.keys(result).sort().join(',')!=='ok,receipt')die('RECEIPT_INVALID');
 const receipt=validateCollectorReceipt(result.receipt,text);if(response.status!==(receipt.replayed?200:202))die('RECEIPT_HTTP_MISMATCH');return receipt;
}
export async function cycle(config,outbox,{read=collect,fetchImpl=fetch,credentials=readSecret,signal}={}){
 if(outbox.state.blocked)die('COLLECTOR_PAUSED');
 const token=await credentials(config.credentialDirectory,'token');
 let state='read_ok',acquisition={newRecords:0,totalRecords:0};
 try{
  if(await outbox.size()>MAX_QUEUE-9*1024*1024)die('SPOOL_FULL');
  const key=Buffer.from(await credentials(config.credentialDirectory,'commkey'));
  const result=await read({commKey:key,approved:true,host:config.host,port:config.port,signal});acquisition=await enqueueCapture(outbox,config,result);
 }catch(e){
  if(signal?.aborted)throw e;
  const code=safeCode(e);state=['ECONNREFUSED','EHOSTUNREACH','ETIMEDOUT','CONNECT_TIMEOUT','RESPONSE_TIMEOUT','CONNECTION_ENDED','CONNECTION_CLOSED'].includes(code)?'device_offline':code==='SPOOL_FULL'?'spool_full':'blocked';
  if(state==='blocked')await outbox.block(code);
 }
 // Drain committed batches even after a transient clock outage.
 for(const f of (await outbox.files()).slice(0,30)){
  const text=await outbox.read(f);try{const receipt=await deliver(config,text,token,{fetchImpl,signal});await outbox.acknowledge(f,receipt,text);}catch(e){if(['RECEIVER_AUTH_OR_POLICY_BLOCK','COLLECTOR_RECEIPT_INVALID','RECEIPT_HTTP_MISMATCH','RECEIPT_INVALID'].includes(e.code))await outbox.block(e.code);throw e;}
 }
 const heartbeat=captureRequest(config,{kind:'heartbeat',state,readAt:outbox.state.lastReadAt,sourceSha256:outbox.state.lastSource,pendingRecords:await outbox.count()});
 try{await deliver(config,JSON.stringify(heartbeat),token,{fetchImpl,signal});}catch(e){if(e.code==='RECEIVER_AUTH_OR_POLICY_BLOCK')await outbox.block(e.code);throw e;}
 return {...acquisition,state,pendingRecords:heartbeat.pendingRecords};
}
async function main(){
 if(process.argv.length!==4||process.argv[2]!=='--config')die('USAGE_CONFIG_REQUIRED');
 const config=validateConfig(JSON.parse(await fs.readFile(process.argv[3],'utf8')));await ensureDir(config.stateDirectory);
 const unlock=await acquireLock(config.stateDirectory);const signalController=new AbortController();
 const stop=()=>signalController.abort();process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const keyText=await readSecret(config.credentialDirectory,'spool-key');if(!/^[a-f0-9]{64}$/.test(keyText))die('SPOOL_KEY_REQUIRED');
  const outbox=new Outbox(config.stateDirectory,Buffer.from(keyText,'hex'));await outbox.init();let failures=0;
  while(!signalController.signal.aborted){
   if(outbox.state.blocked){console.error(JSON.stringify({state:'paused',reason:outbox.state.blocked}));process.exitCode=78;break;}
   try{const result=await cycle(config,outbox,{signal:signalController.signal});failures=result.state==='read_ok'?0:failures+1;console.log(JSON.stringify({at:new Date().toISOString(),version:VERSION,...result}));}
   catch(e){if(signalController.signal.aborted)break;failures++;console.error(JSON.stringify({at:new Date().toISOString(),state:'retry_pending',reason:safeCode(e)}));}
   const seconds=Math.min(900,config.pollSeconds*2**Math.min(failures,4));
   await new Promise(resolve=>{const finish=()=>{clearTimeout(timer);signalController.signal.removeEventListener('abort',finish);resolve();};const timer=setTimeout(finish,seconds*1000);signalController.signal.addEventListener('abort',finish,{once:true});});
  }
 }finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);await unlock();}
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(e=>{console.error(JSON.stringify({state:'not_started',reason:safeCode(e)}));process.exitCode=78;});
