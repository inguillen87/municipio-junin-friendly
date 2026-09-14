// CI only: municipal agent stays outside the Vercel bundle and application tests.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import fs from 'node:fs';
import {partPayload,checkReceipt,sendPart} from '../local-agents/pm10/delivery.mjs';
import {createPm10Receiver} from '../api/attendance-pm10.js';
import {validatePm10Payload,assertPm10Receipt} from '../lib/internal-pm10-reception.js';
const hash=b=>createHash('sha256').update(b).digest('hex');let checks=0;
for(const count of [1,500,501,2501]){
 const bytes=Buffer.alloc(count*40,1),rh=hash(bytes),sh=hash('synthetic full capture '+count);
 const m={batchId:hash(sh+':'+rh),snapshotSha256:sh,recordsSha256:rh,newUniqueRecords:count,snapshotRecordCount:count,capturedAt:'2026-09-13T09:00:00.000Z',ordinals:Array.from({length:count},(_,i)=>i+1)};
 for(let at=0;at<count;at+=500){const p=partPayload(m,bytes,at);validatePm10Payload(p);const r={version:'pm10-receipt.v1',receiptId:'a1111111-1111-4111-8111-111111111111',batchId:p.batchId,partStart:p.partStart,partSha256:p.partSha256,snapshotSha256:p.snapshotSha256,count:p.ordinals.length,newCanonical:0,observed:0,duplicates:p.ordinals.length,receivedAt:'2026-09-13T09:10:00.000Z',persisted:true,payrollModified:false,replayed:false};assert.deepEqual(checkReceipt(r,p),assertPm10Receipt(r,p));checks++;}
}
const bytes=Buffer.alloc(40,1),recordsSha256=hash(bytes),snapshotSha256=hash('synthetic conflict');
const body=partPayload({batchId:hash(snapshotSha256+':'+recordsSha256),snapshotSha256,recordsSha256,newUniqueRecords:1,snapshotRecordCount:1,capturedAt:'2026-09-13T09:00:00.000Z',ordinals:[1]},bytes,0);
const receiver=createPm10Receiver({env:{INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:'a'.repeat(40)},getSql:async()=>({query:async()=>{throw Object.assign(Error('PM10_BUSY'),{code:'P0001'});}})});
await assert.rejects(sendPart(body,'q'.repeat(43),'qa-pm10-connector',async(_url,options)=>{
 const response={setHeader(){},status(code){this.code=code;return this;},json(value){this.value=value;return this;}};
 await receiver({method:'POST',headers:options.headers,query:{},body:JSON.parse(options.body)},response);
 assert.equal(response.code,409);assert.equal(response.value.code,'PM10_BUSY');assert.ok(!Object.hasOwn(response.value,'receipt'));
 return new Response(JSON.stringify(response.value),{status:response.code});
}),{code:'DELIVERY_NETWORK_RETRY'});checks++;
fs.mkdirSync('verification',{recursive:true});fs.writeFileSync('verification/protocol-alignment.json',JSON.stringify({checksPassed:checks,syntheticOnly:true,clockContacted:false}));console.log({checksPassed:checks});
