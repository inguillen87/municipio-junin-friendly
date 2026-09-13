// CI only: municipal agent stays outside the Vercel bundle and application tests.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import fs from 'node:fs';
import {partPayload,checkReceipt} from '../local-agents/pm10/delivery.mjs';
import {validatePm10Payload,assertPm10Receipt} from '../lib/internal-pm10-reception.js';
const hash=b=>createHash('sha256').update(b).digest('hex');let checks=0;
for(const count of [1,500,501,2501]){
 const bytes=Buffer.alloc(count*40,1),rh=hash(bytes),sh=hash('synthetic full capture '+count);
 const m={batchId:hash(sh+':'+rh),snapshotSha256:sh,recordsSha256:rh,newUniqueRecords:count,snapshotRecordCount:count,capturedAt:'2026-09-13T09:00:00.000Z',ordinals:Array.from({length:count},(_,i)=>i+1)};
 for(let at=0;at<count;at+=500){const p=partPayload(m,bytes,at);validatePm10Payload(p);const r={version:'pm10-receipt.v1',receiptId:'a1111111-1111-4111-8111-111111111111',batchId:p.batchId,partStart:p.partStart,partSha256:p.partSha256,snapshotSha256:p.snapshotSha256,count:p.ordinals.length,newCanonical:0,observed:0,duplicates:p.ordinals.length,receivedAt:'2026-09-13T09:10:00.000Z',persisted:true,payrollModified:false,replayed:false};assert.deepEqual(checkReceipt(r,p),assertPm10Receipt(r,p));checks++;}
}
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/protocol-alignment.json',JSON.stringify({checksPassed:checks,syntheticOnly:true,clockContacted:false}));console.log({checksPassed:checks});
