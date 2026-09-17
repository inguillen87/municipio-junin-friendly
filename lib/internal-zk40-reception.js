// Device identity and enrollment are checked again in PostgreSQL. PM10 unchanged.
import {createHash} from 'node:crypto';
import {AttendanceGatewayError} from './internal-attendance-gateway.js';
export const ZK40_PART_SIZE=500;
export const ZK40_MAX_BODY=65536;
const hex=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const zk40Hash=b=>createHash('sha256').update(b).digest('hex');
export function zk40Fail(code,status=400){throw new AttendanceGatewayError(code,status,zk40ErrorMessage(code));}
export function zk40ErrorMessage(code){return ({ZK40_AUTH_DENIED:'Credencial de colector no habilitada',ZK40_BUSY:'Recepción ocupada; se conserva la cola',ZK40_IDEMPOTENCY_CONFLICT:'El lote requiere revisión',ZK40_BINDING_REQUIRED:'Fuente municipal no habilitada',ZK40_NOT_READY:'Recepción pendiente de configuración',ZK40_PAYLOAD_INVALID:'El lote no cumple el contrato de recepción',ZK40_RECEIPT_INVALID:'No se pudo verificar la confirmación'})[code]||'No se completó la recepción';}
export function validateZk40Payload(value){
 const keys=['version','serial','batchId','snapshotSha256','recordsSha256','snapshotRecordCount','totalRecords','partStart','capturedAt','partSha256','ordinals','recordsBase64'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==keys.sort().join())zk40Fail('ZK40_PAYLOAD_INVALID');
 if(value.version!=='zk40-delivery.v1'||(typeof value.serial!=='string'||!/^[A-Za-z0-9-]{6,64}$/.test(value.serial))||!['batchId','snapshotSha256','recordsSha256','partSha256'].every(k=>typeof value[k]==='string'&&hex.test(value[k])))zk40Fail('ZK40_PAYLOAD_INVALID');
 if(!Number.isSafeInteger(value.totalRecords)||value.totalRecords<1||value.totalRecords>104857||!Number.isSafeInteger(value.snapshotRecordCount)||value.snapshotRecordCount<value.totalRecords||value.snapshotRecordCount>104857||!Number.isSafeInteger(value.partStart)||value.partStart<0||value.partStart>=value.totalRecords||value.partStart%ZK40_PART_SIZE)zk40Fail('ZK40_PAYLOAD_INVALID');
 if(typeof value.capturedAt!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.capturedAt)||!Number.isFinite(Date.parse(value.capturedAt))||new Date(value.capturedAt).toISOString()!==value.capturedAt)zk40Fail('ZK40_PAYLOAD_INVALID');
 if(typeof value.recordsBase64!=='string'||value.recordsBase64.length>26668||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.recordsBase64))zk40Fail('ZK40_PAYLOAD_INVALID');
 const bytes=Buffer.from(value.recordsBase64,'base64'),n=Math.min(ZK40_PART_SIZE,value.totalRecords-value.partStart);
 if(bytes.length!==n*40||bytes.toString('base64')!==value.recordsBase64||zk40Hash(bytes)!==value.partSha256||zk40Hash(value.snapshotSha256+':'+value.recordsSha256)!==value.batchId||(value.totalRecords<=ZK40_PART_SIZE&&value.partSha256!==value.recordsSha256))zk40Fail('ZK40_PAYLOAD_INVALID');
 if(!Array.isArray(value.ordinals)||value.ordinals.length!==n||value.ordinals.some((v,i)=>!Number.isSafeInteger(v)||v<1||v>value.snapshotRecordCount||(i>0&&v<=value.ordinals[i-1])))zk40Fail('ZK40_PAYLOAD_INVALID');
 return value;
}
export function assertZk40Receipt(receipt,body){
 const keys=['version','serial','receiptId','batchId','partStart','partSha256','snapshotSha256','count','newCanonical','observed','duplicates','receivedAt','persisted','payrollModified','replayed'];
 if(!receipt||Object.keys(receipt).sort().join()!==keys.sort().join()||receipt.version!=='zk40-receipt.v1'||!uuid.test(receipt.receiptId)||receipt.persisted!==true||receipt.payrollModified!==false||typeof receipt.replayed!=='boolean'||!Number.isFinite(Date.parse(receipt.receivedAt)))zk40Fail('ZK40_RECEIPT_INVALID',502);
 for(const k of ['serial','batchId','partStart','partSha256','snapshotSha256'])if(receipt[k]!==body[k])zk40Fail('ZK40_RECEIPT_INVALID',502);
 if(!['count','newCanonical','observed','duplicates'].every(k=>Number.isSafeInteger(receipt[k])&&receipt[k]>=0)||receipt.count!==body.ordinals.length||receipt.newCanonical+receipt.observed+receipt.duplicates!==receipt.count)zk40Fail('ZK40_RECEIPT_INVALID',502);
 return receipt;
}
export async function receiveZk40(sql,connector,tokenHash,body,release){
 try{
  const r=await sql.query('SELECT public.attendance_zk40_receive_v1($1::text,$2::text,$3::jsonb,$4::text) AS result',[connector,tokenHash,JSON.stringify(body),release]);
  return assertZk40Receipt((Array.isArray(r)?r:r?.rows)?.[0]?.result,body);
 }catch(e){
  if(e instanceof AttendanceGatewayError)throw e;
  const m=String(e?.message||'');
  for(const [code,status] of [['ZK40_AUTH_DENIED',401],['ZK40_CONTEXT_DENIED',403],['ZK40_BINDING_REQUIRED',503],['ZK40_IDENTITY_KEY_REQUIRED',503],['ZK40_IDEMPOTENCY_CONFLICT',409],['ZK40_EVENT_CONFLICT',409],['ZK40_PAYLOAD_INVALID',400],['ZK40_BUSY',409]])if(m.includes(code))zk40Fail(code,status);
  if(['42883','42P01'].includes(e?.code))zk40Fail('ZK40_NOT_READY',503);
  zk40Fail('ZK40_TEMPORARY_UNAVAILABLE',503);
 }
}
