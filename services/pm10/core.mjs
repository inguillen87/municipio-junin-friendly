// SPDX-License-Identifier: GPL-2.0-only
// Resident capture stage. No cloud upload, firmware changes or biometric templates.
import {createCipheriv, createDecipheriv, createHash, createHmac, randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync, gunzipSync} from 'node:zlib';
import {collect, TARGET, PORT, SERIAL, MAX_BYTES} from './vendor/lector-fichadas.mjs';

export const VERSION='pm10-resident.v1';
const MAGIC=Buffer.from('MC59\x01');
const MAX_FILE=MAX_BYTES+65536;
const FIELDS=['version','enabled','site','host','port','serial','intervalSeconds','storageMaxBytes','maxCaptures','reserveFreeBytes'];
const NETWORK=new Set(['ECONNREFUSED','ECONNRESET','ENETUNREACH','EHOSTUNREACH','ETIMEDOUT','CONNECT_TIMEOUT','RESPONSE_TIMEOUT','CONNECTION_ENDED','CONNECTION_CLOSED','TOTAL_TIMEOUT']);
const BLOCKS=new Set(['AUTH_NOT_ACCEPTED','CONFIGURATION_REVIEW','PROTOCOL_REVIEW','COUNTER_DECREASE','STORAGE_FULL','STATE_INVALID','KEY_MISMATCH']);
const sha=b=>createHash('sha256').update(b).digest('hex');
export function fail(code){throw Object.assign(new Error(code),{code})}
export function config(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==FIELDS.length||FIELDS.some(k=>!Object.hasOwn(value,k)))fail('CONFIG_INVALID');
 if(value.version!==VERSION||typeof value.enabled!=='boolean'||value.site!=='pm-10'||value.host!==TARGET||value.port!==PORT||value.serial!==SERIAL)fail('CONFIG_INVALID');
 for(const [k,min,max] of [['intervalSeconds',60,3600],['storageMaxBytes',MAX_FILE*2,2147483648],['maxCaptures',2,10000],['reserveFreeBytes',33554432,1073741824]])if(!Number.isSafeInteger(value[k])||value[k]<min||value[k]>max)fail('CONFIG_INVALID');
 return Object.freeze({...value});
}
export function seal(bytes,key,purpose){
 if(!Buffer.isBuffer(key)||key.length!==32||!Buffer.isBuffer(bytes)||bytes.length>MAX_FILE)fail('ENCRYPTION_INPUT_INVALID');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(VERSION+'|'+purpose));
 const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return Buffer.concat([MAGIC,iv,cipher.getAuthTag(),encrypted]);
}
export function unseal(bytes,key,purpose){
 if(!Buffer.isBuffer(bytes)||bytes.length<33||bytes.length>MAX_FILE+33||!bytes.subarray(0,5).equals(MAGIC))fail('ENCRYPTED_FILE_INVALID');
 try{const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(5,17));decipher.setAAD(Buffer.from(VERSION+'|'+purpose));decipher.setAuthTag(bytes.subarray(17,33));return Buffer.concat([decipher.update(bytes.subarray(33)),decipher.final()])}catch{fail('KEY_MISMATCH')}
}
export async function syncDirectory(dir){
 let h;try{h=await fs.open(dir,'r');await h.sync()}catch(e){if(process.platform!=='win32'||!['EPERM','EISDIR','EINVAL','EBADF'].includes(e.code))throw e}finally{await h?.close()}
}
export async function atomic(file,bytes){
 const tmp=file+'.tmp-'+randomBytes(8).toString('hex');let h;
 try{h=await fs.open(tmp,'wx',0o600);await h.writeFile(bytes);await h.sync();await h.close();h=null;await fs.rename(tmp,file);await syncDirectory(path.dirname(file))}
 finally{await h?.close();await fs.rm(tmp,{force:true}).catch(()=>{})}
}
async function privateRead(file,max){
 const st=await fs.lstat(file);if(!st.isFile()||st.isSymbolicLink()||st.size>max)fail('PRIVATE_FILE_INVALID');
 if(process.platform!=='win32'&&(st.mode&0o077)!==0)fail('PRIVATE_PERMISSIONS_REQUIRED');
 return fs.readFile(file);
}
export async function readKey(root){const key=await privateRead(path.join(root,'secrets','storage.key'),32);if(key.length!==32)fail('KEY_MISMATCH');return key}
export async function readCommKey(root,key){const out=unseal(await privateRead(path.join(root,'secrets','commkey.enc'),64),key,'credential');if(!/^[0-9]{1,6}$/.test(out.toString('ascii'))){out.fill(0);fail('CREDENTIAL_INVALID')}return out}
const newState=()=>({version:VERSION,lastRawHash:null,lastCount:null,lastSuccessfulReadAt:null,lastNewCaptureAt:null,lastAttemptAt:null,failures:0,blocked:null,lastOutcome:'NEVER_STARTED'});
function validState(s){
 if(!s||Object.keys(s).sort().join()!==Object.keys(newState()).sort().join()||s.version!==VERSION||!Number.isSafeInteger(s.failures)||s.failures<0||s.failures>1000000||s.blocked!==null&&!BLOCKS.has(s.blocked))fail('STATE_INVALID');
 if(s.lastRawHash!==null&&!/^[a-f0-9]{64}$/.test(s.lastRawHash)||s.lastCount!==null&&(!Number.isSafeInteger(s.lastCount)||s.lastCount<0||s.lastCount>100000))fail('STATE_INVALID');
 for(const k of ['lastSuccessfulReadAt','lastNewCaptureAt','lastAttemptAt'])if(s[k]!==null&&(!/^\d{4}-\d\d-\d\dT.*Z$/.test(s[k])||!Number.isFinite(Date.parse(s[k]))))fail('STATE_INVALID');
 if(!/^[A-Z_]{1,60}$/.test(s.lastOutcome))fail('STATE_INVALID');return s;
}
function captureSummary(result){
 const r=result?.report,b=result?.raw;
 if(!r||r.metadata?.serialNumber!==SERIAL)fail('SERIAL_MISMATCH');
 if(r.status==='AUTH_NOT_ACCEPTED')fail('AUTH_NOT_ACCEPTED');if(r.authenticationAccepted!==true)fail('AUTH_CONFIG_CHANGED');
 if(r.error||r.attendanceTransferComplete!==true||r.cleanup?.bufferReleaseConfirmed!==true||r.cleanup?.exitConfirmed!==true||!Buffer.isBuffer(b)||b.length<4||b.length>MAX_BYTES||b.readUInt32LE(0)!==b.length-4||(b.length-4)%40!==0||sha(b)!==r.transfer?.rawSha256)fail('CAPTURE_INCOMPLETE');
 const count=(b.length-4)/40,parsed=result.parsed;
 if(count>100000||!parsed||parsed.recordCount!==count||!(count===0&&parsed.status==='DECODED_EMPTY'||parsed.status==='DECODED_CANDIDATE'&&parsed.layout==='legacy-40-byte-candidate'))fail('LAYOUT_NOT_VERIFIED');
 const before=r.metadata?.countsBefore?.counts?.attendanceRecordsReported,after=r.metadata?.countsAfter?.counts?.attendanceRecordsReported;
 if(![before,after].every(x=>Number.isSafeInteger(x)&&x>=0&&x<=100000)||![before,after].includes(count))fail('COUNTS_MISMATCH');
 return {version:'pm10-local-capture.v1',site:'pm-10',serial:SERIAL,startedAt:r.startedAt,finishedAt:r.finishedAt,rawSha256:sha(b),rawBytes:b.length,records:count,reportedBefore:before,reportedAfter:after,changedDuringRead:before!==after,invalidTimestamps:parsed.invalidTimestampCount,unresolvedIdentityFormats:parsed.nonDniOrUidCount,transportComplete:true,source:'resident_local_capture',cloudAccepted:false,periodCoverageCertified:false};
}
export class Store{
 constructor(root,key,settings){this.root=path.resolve(root);this.key=key;this.settings=config(settings);this.dir=path.join(this.root,'data');this.captures=path.join(this.dir,'captures')}
 async open(){
  // Windows 8.3 paths can name the same directory as their expanded realpath.
  // Inspect every ancestor instead of comparing path spellings. Junctions and
  // symbolic links are rejected; private descendants are checked before use.
  const volume=path.parse(this.root).root;let current=volume;
  for(const part of this.root.slice(volume.length).split(path.sep).filter(Boolean)){
   current=path.join(current,part);const st=await fs.lstat(current);
   if(!st.isDirectory()||st.isSymbolicLink())fail('STORAGE_SYMLINK_REJECTED');
  }
  for(const p of [this.dir,this.captures]){
   try{await fs.mkdir(p,{mode:0o700})}catch(e){if(e.code!=='EEXIST')throw e}
   const st=await fs.lstat(p);if(!st.isDirectory()||st.isSymbolicLink())fail('STORAGE_SYMLINK_REJECTED');
  }
 }
 async state(){try{return validState(JSON.parse(unseal(await privateRead(path.join(this.dir,'state.enc'),8192),this.key,'state').toString('utf8')))}catch(e){if(e.code==='ENOENT'){
   // An existing capture without a state is evidence of an interrupted first commit.
   // Recover the highest local count without rereading or deleting the clock.
   const files=(await fs.readdir(this.captures)).filter(x=>/^[a-f0-9]{64}\.mcq$/.test(x));if(!files.length)return newState();
   if(files.length!==1)fail('STATE_INVALID');const recovered=[];for(const name of files){const restored=await this.readCapture(name);recovered.push(restored.meta);restored.raw.fill(0)}
   recovered.sort((a,b)=>Date.parse(a.finishedAt)-Date.parse(b.finishedAt));const last=recovered.at(-1);
   return {...newState(),lastRawHash:last.rawSha256,lastCount:last.records,lastSuccessfulReadAt:last.finishedAt,lastNewCaptureAt:last.finishedAt,lastOutcome:'RECOVERED_LOCAL_CAPTURE'};
  }if(['KEY_MISMATCH','PRIVATE_PERMISSIONS_REQUIRED'].includes(e.code))throw e;fail('STATE_INVALID')}}
 async save(s){validState(s);await atomic(path.join(this.dir,'state.enc'),seal(Buffer.from(JSON.stringify(s)),this.key,'state'));return s}
 async capacity(){
  const names=await fs.readdir(this.captures);let bytes=0,count=0;
  for(const name of names){const st=await fs.lstat(path.join(this.captures,name));if(!st.isFile()||st.isSymbolicLink())fail('STORAGE_SYMLINK_REJECTED');bytes+=st.size;if(/^[a-f0-9]{64}\.mcq$/.test(name))count++}
  const v=await fs.statfs(this.dir,{bigint:true}),free=v.bavail*v.bsize;
  return {bytes,count,available:count<this.settings.maxCaptures&&bytes+MAX_FILE+33<=this.settings.storageMaxBytes&&free>=BigInt(this.settings.reserveFreeBytes+MAX_FILE+33)};
 }
 async capture(result){
  const meta=captureSummary(result),id=createHmac('sha256',this.key).update('capture|'+meta.rawSha256).digest('hex')+'.mcq';
  try{const prior=await this.readCapture(id);prior.raw.fill(0);if(prior.meta.rawSha256!==meta.rawSha256)fail('CAPTURE_CONFLICT');return {meta:prior.meta,isNew:false}}catch(e){if(e.code!=='ENOENT')throw e}
  if(!(await this.capacity()).available)fail('STORAGE_FULL');
  const metadata=Buffer.from(JSON.stringify(meta)),header=Buffer.alloc(4);header.writeUInt32LE(metadata.length);
  const payload=Buffer.concat([header,metadata,result.raw]);let zipped;
  try{zipped=gzipSync(payload);await atomic(path.join(this.captures,id),seal(zipped,this.key,'capture|'+id))}finally{payload.fill(0);zipped?.fill(0)}
  return {meta,isNew:true};
 }
 async readCapture(id){
  if(!/^[a-f0-9]{64}\.mcq$/.test(id))fail('CAPTURE_IDENTIFIER_INVALID');
  const decrypted=unseal(await privateRead(path.join(this.captures,id),MAX_FILE+33),this.key,'capture|'+id);let plain;
  try{plain=gunzipSync(decrypted,{maxOutputLength:MAX_FILE});const n=plain.readUInt32LE();if(n>8192||n<2||n+4>plain.length)fail('CAPTURE_INCOMPLETE');const meta=JSON.parse(plain.subarray(4,n+4));const raw=Buffer.from(plain.subarray(4+n));
   if(meta.version!=='pm10-local-capture.v1'||meta.serial!==SERIAL||meta.site!=='pm-10'||meta.rawBytes!==raw.length||meta.records!==(raw.length-4)/40||raw.readUInt32LE()!==raw.length-4||sha(raw)!==meta.rawSha256||!Number.isFinite(Date.parse(meta.finishedAt)))fail('CAPTURE_INCOMPLETE');
   return {meta,raw};
  }finally{decrypted.fill(0);plain?.fill(0)}
 }
 async status(now=new Date()){
  const s=await this.state(),c=await this.capacity();const stale=!s.lastSuccessfulReadAt||now.getTime()-Date.parse(s.lastSuccessfulReadAt)>Math.max(this.settings.intervalSeconds*3,300)*1000;
  return {version:VERSION,site:'pm-10',captureEnabled:this.settings.enabled,localState:s.blocked?'BLOCKED':!this.settings.enabled?'DISABLED':stale?'NO_RECENT_LOCAL_READ':'RECENT_LOCAL_READ',...s,capturesWaiting:c.count,encryptedBytes:c.bytes,capacityAvailable:c.available,cloudTransmission:'NOT_IMPLEMENTED',cloudAccepted:false,automaticCloudCollectorVerified:false};
 }
}
export class Collector{
 constructor(store,{reader=collect,credential=null,now=()=>new Date()}={}){this.store=store;this.reader=reader;this.credential=credential??(()=>readCommKey(store.root,store.key));this.now=now;this.busy=false}
 async tick(signal){
  if(this.busy)fail('CONCURRENT_CYCLE');this.busy=true;let result,secret;
  try{
   const s=await this.store.state(),stamp=this.now().toISOString();
   if(s.blocked||!this.store.settings.enabled||signal?.aborted)return {outcome:s.blocked?'BLOCKED':signal?.aborted?'STOPPED':'DISABLED',waitSeconds:this.store.settings.intervalSeconds};
   if(!(await this.store.capacity()).available){await this.store.save({...s,blocked:'STORAGE_FULL',lastOutcome:'STORAGE_FULL'});return {outcome:'BLOCKED',waitSeconds:0}}
   // Persist attempt before any network request. A crash must not erase evidence of a failed read.
   await this.store.save({...s,lastAttemptAt:stamp,lastOutcome:'READING'});
   try{secret=await this.credential();result=await this.reader({commKey:secret,approved:true,host:TARGET,port:PORT,signal});}finally{secret?.fill(0)}
   const r=result?.report;
   if(signal?.aborted||r?.error?.code==='CANCELLED')return {outcome:'STOPPED',waitSeconds:0};
   if(r?.status==='AUTH_NOT_ACCEPTED'){await this.store.save({...s,lastAttemptAt:stamp,blocked:'AUTH_NOT_ACCEPTED',lastOutcome:'AUTH_NOT_ACCEPTED'});return {outcome:'BLOCKED',waitSeconds:0}}
   if(r?.error)throw Object.assign(new Error('READ_FAILED'),{code:r.error.code});
   const saved=await this.store.capture(result),m=saved.meta;
   const decreased=s.lastCount!==null&&m.records<s.lastCount;
   await this.store.save({...s,lastRawHash:m.rawSha256,lastCount:m.records,lastSuccessfulReadAt:stamp,lastNewCaptureAt:saved.isNew?stamp:s.lastNewCaptureAt,lastAttemptAt:stamp,failures:0,blocked:decreased?'COUNTER_DECREASE':null,lastOutcome:decreased?'COUNTER_DECREASE':saved.isNew?'CAPTURE_SAVED':'UNCHANGED'});
   return {outcome:decreased?'BLOCKED':saved.isNew?'CAPTURE_SAVED':'UNCHANGED',records:m.records,waitSeconds:this.store.settings.intervalSeconds};
  }catch(e){
   if(signal?.aborted||e.code==='CANCELLED')return {outcome:'STOPPED',waitSeconds:0};
   const s=await this.store.state();const transient=NETWORK.has(e.code),failures=Math.min(s.failures+1,1000000);
   const block=transient?null:e.code==='STORAGE_FULL'?'STORAGE_FULL':e.code==='KEY_MISMATCH'?'KEY_MISMATCH':e.code==='CREDENTIAL_INVALID'?'CONFIGURATION_REVIEW':'PROTOCOL_REVIEW';
   await this.store.save({...s,failures,lastAttemptAt:this.now().toISOString(),blocked:block,lastOutcome:transient?'NETWORK_RETRY':block});
   return {outcome:transient?'NETWORK_RETRY':'BLOCKED',waitSeconds:transient?Math.min(900,this.store.settings.intervalSeconds*2**Math.min(failures,8)):0};
  }finally{result?.raw?.fill(0);if(result?.parsed)result.parsed.records=[];this.busy=false}
 }
}
