/** Read-only protocol envelope: only 40-byte attendance records, never biometrics. */
import {createHash} from 'node:crypto';
export const COLLECTOR_VERSION='clock-collector.v1';
export const BODY_LIMIT=90000;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
export function collectorError(code){return Object.assign(new Error(code),{code});}
export function validateCollectorRequest(j){
 const allowed=['version','kind','requestId','connectorKey','serial','readAt','sourceSha256','state','pendingRecords','records'];
 const invalid=()=>{throw collectorError('COLLECTOR_INVALID');};
 if(!j||typeof j!=='object'||Array.isArray(j)||Object.keys(j).length!==allowed.length||Object.keys(j).some(k=>!allowed.includes(k)))invalid();
 if(j.version!==COLLECTOR_VERSION||!['batch','heartbeat'].includes(j.kind)||!UUID.test(j.requestId)||! /^[a-z0-9][a-z0-9._-]{7,127}$/.test(j.connectorKey)||typeof j.serial!=='string'||! /^[A-Za-z0-9-]{4,64}$/.test(j.serial))invalid();
 if(!['read_ok','device_offline','blocked','spool_full'].includes(j.state)||!Number.isSafeInteger(j.pendingRecords)||j.pendingRecords<0||j.pendingRecords>200000)invalid();
 if(j.readAt!==null&&(typeof j.readAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(j.readAt)||!Number.isFinite(Date.parse(j.readAt))||new Date(j.readAt).toISOString()!==j.readAt))invalid();
 if(j.sourceSha256!==null&&!SHA.test(j.sourceSha256))invalid();
 if(j.state==='read_ok'&&(!j.readAt||!j.sourceSha256))invalid();
 if(!Array.isArray(j.records)||j.records.length>500||j.records.some(v=>typeof v!=='string'||! /^[a-f0-9]{80}$/.test(v)))invalid();
 if(j.kind==='batch'&&(!j.records.length||j.state!=='read_ok')||j.kind==='heartbeat'&&j.records.length)invalid();
 if(Buffer.byteLength(JSON.stringify(j))>BODY_LIMIT)invalid();
 return j;
}
export function sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}
export function validateCollectorReceipt(receipt,requestText){
 const request=validateCollectorRequest(JSON.parse(requestText));
 const keys=['version','requestId','inputSha256','accepted','duplicates','observed','received','replayed'];
 if(!receipt||typeof receipt!=='object'||Object.keys(receipt).length!==keys.length||Object.keys(receipt).some(k=>!keys.includes(k))||receipt.version!=='clock-collector-receipt.v1'||receipt.requestId!==request.requestId||receipt.inputSha256!==sha256(requestText)||typeof receipt.replayed!=='boolean')throw collectorError('COLLECTOR_RECEIPT_INVALID');
 for(const k of ['accepted','duplicates','observed','received'])if(!Number.isSafeInteger(receipt[k])||receipt[k]<0||receipt[k]>500)throw collectorError('COLLECTOR_RECEIPT_INVALID');
 if(receipt.received!==request.records.length||receipt.accepted+receipt.duplicates+receipt.observed!==receipt.received)throw collectorError('COLLECTOR_RECEIPT_INVALID');
 return receipt;
}
