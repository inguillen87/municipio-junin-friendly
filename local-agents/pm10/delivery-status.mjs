// SPDX-License-Identifier: GPL-2.0-only
// Read-only projection for the capture panel. This never contacts the receiver.
import path from 'node:path';
import {lstat,open} from 'node:fs/promises';

const states=new Set(['ready','pending','queue_confirmed','retry_wait','blocked']);
const date=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
const count=v=>Number.isSafeInteger(v)&&v>=0;
export function deliveryStatusProjection(v){
 if(!v||v.version!=='pm10-sender-status.v1'||!states.has(v.state)||v.physicalClockVerified!==false||!date(v.updatedAt))throw Error('Invalid delivery status');
 for(const key of ['confirmedRecords','remainingParts','sent'])if(v[key]!==undefined&&!count(v[key]))throw Error('Invalid delivery count');
 if(v.lastReceiptAt!=null&&!date(v.lastReceiptAt))throw Error('Invalid receipt date');
 if(v.nextAttemptAt!=null&&!date(v.nextAttemptAt))throw Error('Invalid retry date');
 if(v.code!==undefined&&(typeof v.code!=='string'||!/^[A-Z][A-Z0-9_]{0,63}$/.test(v.code)))throw Error('Invalid delivery code');
 if(['pending','queue_confirmed'].includes(v.state)&&(!count(v.confirmedRecords)||!count(v.remainingParts)||v.captureFilesRemoved!==false||!('lastReceiptAt' in v)))throw Error('Incomplete delivery summary');
 if(v.state==='queue_confirmed'&&v.remainingParts!==0)throw Error('Inconsistent delivery summary');
 if(v.confirmedRecords>0&&!date(v.lastReceiptAt))throw Error('Missing receipt date');
 if(v.state==='retry_wait'&&(!date(v.nextAttemptAt)||v.code!=='DELIVERY_NETWORK_RETRY'))throw Error('Incomplete retry status');
 // No additional fields from the persisted file reach the HTML renderer.
 return {availability:'available',state:v.state,updatedAt:v.updatedAt,
  confirmedRecords:v.confirmedRecords??null,remainingParts:v.remainingParts??null,
  lastReceiptAt:v.lastReceiptAt??null,nextAttemptAt:v.nextAttemptAt??null,code:v.code??null};
}
export async function loadDeliveryStatus(root){
 try{
  const dir=path.join(root,'delivery'),ds=await lstat(dir);
  if(!ds.isDirectory()||ds.isSymbolicLink())throw Error('Unsafe delivery directory');
  const file=path.join(dir,'status.json'),st=await lstat(file);
  if(!st.isFile()||st.isSymbolicLink()||st.size>8192)throw Error('Unsafe delivery status');
  const h=await open(file,'r');
  try{
   const hs=await h.stat();
   if(!hs.isFile()||hs.dev!==st.dev||hs.ino!==st.ino||hs.size>8192)throw Error('Changed delivery status');
   const bytes=Buffer.alloc(8193),{bytesRead}=await h.read(bytes,0,bytes.length,0);
   if(bytesRead>8192)throw Error('Oversized delivery status');
   return deliveryStatusProjection(JSON.parse(bytes.subarray(0,bytesRead).toString('utf8')));
  }finally{await h.close();}
 }catch(e){return {availability:e.code==='ENOENT'?'missing':'invalid'};}
}
