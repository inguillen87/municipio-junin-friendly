// SPDX-License-Identifier: GPL-2.0-only
// Files below stateDir are municipal source records. Never commit/share the queue.
import {createHash, randomUUID} from 'node:crypto';
import {mkdir,lstat,readdir,readFile,open,rename,rm,statfs} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fault} from './config.mjs';
import {replaceFile} from './file-replacement.mjs';
export const hash=b=>createHash('sha256').update(b).digest('hex');
const HEX=/^[a-f0-9]{64}$/;
const MAX_RAW=4194304;
async function syncDir(p){
 if(process.platform==='win32')return; // NTFS durability also depends on volume/cache settings.
 const h=await open(p,'r');try{await h.sync();}finally{await h.close();}
}
export async function atomicJson(file,value){
 const tmp=file+'.tmp-'+randomUUID();const h=await open(tmp,'wx',0o600);
 try{await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync();}finally{await h.close();}
 await replaceFile(tmp,file);await syncDir(path.dirname(file));
}
export async function safeDirectory(p){
 await mkdir(p,{recursive:true,mode:0o700});const s=await lstat(p);
 if(!s.isDirectory()||s.isSymbolicLink()||(process.platform!=='win32'&&(s.mode&0o077)))throw fault('STATE_DIRECTORY_UNSAFE');
}
async function lockOwner(dir){
 const s=await lstat(dir);if(!s.isDirectory()||s.isSymbolicLink())throw fault('LOCK_INVALID');
 let owner;
 try{
  const file=path.join(dir,'owner.json'),st=await lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>4096)throw fault('LOCK_NEEDS_REVIEW');
  owner=JSON.parse(await readFile(file,'utf8'));
 }catch{throw fault('LOCK_NEEDS_REVIEW');}
 if(!owner||!Number.isSafeInteger(owner.pid)||owner.pid<1||owner.hostname!==os.hostname()||typeof owner.token!=='string'||!owner.token)throw fault('LOCK_NEEDS_REVIEW');
 return owner;
}
function ownerIsDead(owner){
 try{process.kill(owner.pid,0);return false;}
 catch(e){if(e.code==='ESRCH')return true;throw fault('ALREADY_RUNNING');}
}
async function lockTransition(root){
 const gate=path.join(root,'process.lock.transition');
 try{await mkdir(gate,{mode:0o700});}
 catch(e){
  if(e.code!=='EEXIST')throw e;
  // Never recover this short-lived gate: doing so would recreate the same race.
  // An interrupted transition is preserved for review; an ordinary dead owner
  // in process.lock remains recoverable on the next start.
  throw fault(ownerIsDead(await lockOwner(gate))?'LOCK_NEEDS_REVIEW':'ALREADY_RUNNING');
 }
 await atomicJson(path.join(gate,'owner.json'),{pid:process.pid,hostname:os.hostname(),token:randomUUID()});
 return async()=>{await rm(gate,{recursive:true});await syncDir(root);};
}
export async function acquireLock(root){
 await safeDirectory(root);const dir=path.join(root,'process.lock'),leave=await lockTransition(root);
 const token=randomUUID();
 try{
  try{await mkdir(dir,{mode:0o700});}catch(e){
   if(e.code!=='EEXIST')throw e;
   if(!ownerIsDead(await lockOwner(dir)))throw fault('ALREADY_RUNNING');
   // All acquisitions and releases use the gate. Nobody can replace the owner
   // between checking the dead PID and retaining its directory as evidence.
   await rename(dir,path.join(root,'recovered-lock-'+randomUUID()));
   await mkdir(dir,{mode:0o700});
  }
  await atomicJson(path.join(dir,'owner.json'),{pid:process.pid,hostname:os.hostname(),token});
 }finally{await leave();}
 let releasing;
 return ()=>releasing??=(async()=>{
  const leaveRelease=await lockTransition(root);
  try{
   let owner;try{owner=await lockOwner(dir);}catch(e){if(e.code==='ENOENT')return;throw e;}
   if(owner.token===token){await rm(dir,{recursive:true});await syncDir(root);}
  }finally{await leaveRelease();}
 })();
}
async function boundedFile(file,max){const s=await lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw fault('QUEUE_CORRUPT');return readFile(file);}
export function splitRaw(raw){
 if(!Buffer.isBuffer(raw)||raw.length<4||raw.length>MAX_RAW||(raw.length-4)%40||raw.readUInt32LE()!==raw.length-4)throw fault('RAW_LAYOUT_INVALID');
 const rows=[];
 for(let at=4;at<raw.length;at+=40)rows.push({ordinal:(at-4)/40+1,bytes:raw.subarray(at,at+40)});
 return rows;
}
export class CaptureStore {
 constructor(root,{maxQueueBytes=256*1048576,minFreeBytes=64*1048576,freeBytes}={}){this.root=root;this.batchDir=path.join(root,'pending');this.maxQueueBytes=maxQueueBytes;this.minFreeBytes=minFreeBytes;this.freeBytes=freeBytes??(async()=>{const s=await statfs(root);return s.bavail*s.bsize;});this.seen=new Set();this.bytes=0;this.batches=0;this.incomplete=0;}
 async init(){
  await safeDirectory(this.root);await safeDirectory(this.batchDir);
  this.seen.clear();this.bytes=0;this.batches=0;this.incomplete=0;
  for(const name of (await readdir(this.batchDir)).sort()){
   const p=path.join(this.batchDir,name),s=await lstat(p);
   if(!s.isDirectory()||s.isSymbolicLink())throw fault('QUEUE_CORRUPT');
   if(!HEX.test(name)&&!/^\.pending-[a-f0-9-]+$/.test(name))throw fault('QUEUE_CORRUPT');
   const entries=await readdir(p);
   for(const f of entries){if(!['records.bin','manifest.json'].includes(f))throw fault('QUEUE_CORRUPT');const st=await lstat(path.join(p,f));if(!st.isFile()||st.isSymbolicLink())throw fault('QUEUE_CORRUPT');this.bytes+=st.size;}
   // An interrupted unpublished batch is kept but never used as a checkpoint.
   if(name.startsWith('.pending-')){this.incomplete++;continue;}
   const data=await boundedFile(path.join(p,'records.bin'),MAX_RAW);
   const m=JSON.parse((await boundedFile(path.join(p,'manifest.json'),MAX_RAW*4)).toString('utf8'));
   if(m.version!=='pm10-local-batch.v1'||m.batchId!==name||m.recordsSha256!==hash(data)||data.length!==m.newUniqueRecords*40||!Array.isArray(m.ordinals)||m.ordinals.length!==m.newUniqueRecords||!HEX.test(m.snapshotSha256)||hash(Buffer.from(m.snapshotSha256+':'+m.recordsSha256))!==name)throw fault('QUEUE_CORRUPT');
   if(m.ordinals.some((n,i)=>!Number.isSafeInteger(n)||n<1||n>m.snapshotRecordCount||(i>0&&n<=m.ordinals[i-1])))throw fault('QUEUE_CORRUPT');
   for(let at=0;at<data.length;at+=40)this.seen.add(hash(data.subarray(at,at+40)));
   this.batches++;
  }
  return this;
 }
 async capacity(reserve=0){if(this.bytes+reserve>this.maxQueueBytes)throw fault('QUEUE_CAPACITY_REACHED');if(await this.freeBytes()<this.minFreeBytes+reserve)throw fault('DISK_SPACE_LOW');}
 async save(raw,metadata={}){
  const rows=splitRaw(raw);const newHashes=new Set(),novel=[],ordinals=[];let repeated=0;
  for(const r of rows){const h=hash(r.bytes);if(newHashes.has(h)){repeated++;continue;}if(this.seen.has(h))continue;newHashes.add(h);novel.push(r.bytes);ordinals.push(r.ordinal);}
  const snapshotSha256=hash(raw);
  if(!novel.length)return {saved:false,snapshotSha256,snapshotRecordCount:rows.length,newUniqueRecords:0,batchId:null};
  const data=Buffer.concat(novel),recordsSha256=hash(data),id=hash(Buffer.from(snapshotSha256+':'+recordsSha256));
  const manifest={version:'pm10-local-batch.v1',batchId:id,snapshotSha256,recordsSha256,
   snapshotRecordCount:rows.length,snapshotBytes:raw.length,newUniqueRecords:novel.length,
   repeatedWithinNewRecords:repeated,ordinals,capturedAt:metadata.capturedAt??null,
   deviceTimeLocal:metadata.deviceTimeLocal??null,clockTimeZone:'America/Argentina/Mendoza',
   observation:'Exact raw records; no attendance or payroll interpretation',cloudConfirmed:false};
  const manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
  await this.capacity(data.length+manifestBytes.length);
  const stage=path.join(this.batchDir,'.pending-'+randomUUID());await mkdir(stage,{mode:0o700});
  for(const [name,bytes] of [['records.bin',data],['manifest.json',manifestBytes]]){const h=await open(path.join(stage,name),'wx',0o600);try{await h.writeFile(bytes);await h.sync();}finally{await h.close();}}
  await syncDir(stage);await rename(stage,path.join(this.batchDir,id));await syncDir(this.batchDir);
  for(const h of newHashes)this.seen.add(h);this.bytes+=data.length+manifestBytes.length;this.batches++;
  return {saved:true,snapshotSha256,snapshotRecordCount:rows.length,newUniqueRecords:novel.length,batchId:id};
 }
 summary(){return {pendingLocalBatches:this.batches,uniqueLocalRecords:this.seen.size,queueBytes:this.bytes,interruptedWrites:this.incomplete,cloudConfirmedRecords:0};}
}
