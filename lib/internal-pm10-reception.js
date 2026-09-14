import {createHash} from 'node:crypto';
import {AttendanceGatewayError} from './internal-attendance-gateway.js';
export const PM10_PART_SIZE=500;
export const PM10_MAX_BODY=65536;
const hex=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export const pm10Hash=b=>createHash('sha256').update(b).digest('hex');
export function pm10Fail(code,status=400){throw new AttendanceGatewayError(code,status,pm10ErrorMessage(code));}
export function pm10ErrorMessage(code){return ({PM10_AUTH_DENIED:'Credencial de colector no habilitada',PM10_BUSY:'Recepción ocupada; se conserva la cola',PM10_IDEMPOTENCY_CONFLICT:'El lote requiere revisión',PM10_BINDING_REQUIRED:'Fuente municipal no habilitada',PM10_NOT_READY:'Recepción pendiente de configuración',PM10_PAYLOAD_INVALID:'El lote no cumple el contrato de recepción',PM10_RECEIPT_INVALID:'No se pudo verificar la confirmación'})[code]||'No se completó la recepción';}
export function validatePm10Payload(value){
 const keys=['version','serial','batchId','snapshotSha256','recordsSha256','snapshotRecordCount','totalRecords','partStart','capturedAt','partSha256','ordinals','recordsBase64'];
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join()!==keys.sort().join())pm10Fail('PM10_PAYLOAD_INVALID');
 if(value.version!=='pm10-delivery.v1'||value.serial!=='CQTU225360168'||!['batchId','snapshotSha256','recordsSha256','partSha256'].every(k=>typeof value[k]==='string'&&hex.test(value[k])))pm10Fail('PM10_PAYLOAD_INVALID');
 if(!Number.isSafeInteger(value.totalRecords)||value.totalRecords<1||value.totalRecords>104857||!Number.isSafeInteger(value.snapshotRecordCount)||value.snapshotRecordCount<value.totalRecords||value.snapshotRecordCount>104857||!Number.isSafeInteger(value.partStart)||value.partStart<0||value.partStart>=value.totalRecords||value.partStart%PM10_PART_SIZE)pm10Fail('PM10_PAYLOAD_INVALID');
 if(typeof value.capturedAt!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.capturedAt)||!Number.isFinite(Date.parse(value.capturedAt))||new Date(value.capturedAt).toISOString()!==value.capturedAt)pm10Fail('PM10_PAYLOAD_INVALID');
 if(typeof value.recordsBase64!=='string'||value.recordsBase64.length>26668||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.recordsBase64))pm10Fail('PM10_PAYLOAD_INVALID');
 const bytes=Buffer.from(value.recordsBase64,'base64'),n=Math.min(PM10_PART_SIZE,value.totalRecords-value.partStart);
 if(bytes.length!==n*40||bytes.toString('base64')!==value.recordsBase64||pm10Hash(bytes)!==value.partSha256||pm10Hash(value.snapshotSha256+':'+value.recordsSha256)!==value.batchId||(value.totalRecords<=PM10_PART_SIZE&&value.partSha256!==value.recordsSha256))pm10Fail('PM10_PAYLOAD_INVALID');
 if(!Array.isArray(value.ordinals)||value.ordinals.length!==n||value.ordinals.some((v,i)=>!Number.isSafeInteger(v)||v<1||v>value.snapshotRecordCount||(i>0&&v<=value.ordinals[i-1])))pm10Fail('PM10_PAYLOAD_INVALID');
 return value;
}
export function assertPm10Receipt(receipt,body){
 const keys=['version','receiptId','batchId','partStart','partSha256','snapshotSha256','count','newCanonical','observed','duplicates','receivedAt','persisted','payrollModified','replayed'];
 if(!receipt||Object.keys(receipt).sort().join()!==keys.sort().join()||receipt.version!=='pm10-receipt.v1'||!uuid.test(receipt.receiptId)||receipt.persisted!==true||receipt.payrollModified!==false||typeof receipt.replayed!=='boolean'||!Number.isFinite(Date.parse(receipt.receivedAt)))pm10Fail('PM10_RECEIPT_INVALID',502);
 for(const k of ['batchId','partStart','partSha256','snapshotSha256'])if(receipt[k]!==body[k])pm10Fail('PM10_RECEIPT_INVALID',502);
 if(!['count','newCanonical','observed','duplicates'].every(k=>Number.isSafeInteger(receipt[k])&&receipt[k]>=0)||receipt.count!==body.ordinals.length||receipt.newCanonical+receipt.observed+receipt.duplicates!==receipt.count)pm10Fail('PM10_RECEIPT_INVALID',502);
 return receipt;
}
export async function receivePm10(sql,connector,tokenHash,body,release){
 try{
  const r=await sql.query('SELECT public.attendance_pm10_receive_v1($1::text,$2::text,$3::jsonb,$4::text) AS result',[connector,tokenHash,JSON.stringify(body),release]);
  return assertPm10Receipt((Array.isArray(r)?r:r?.rows)?.[0]?.result,body);
 }catch(e){
  if(e instanceof AttendanceGatewayError)throw e;
  const m=String(e?.message||'');
  for(const [code,status] of [['PM10_AUTH_DENIED',401],['PM10_CONTEXT_DENIED',403],['PM10_BINDING_REQUIRED',503],['PM10_IDENTITY_KEY_REQUIRED',503],['PM10_IDEMPOTENCY_CONFLICT',409],['PM10_EVENT_CONFLICT',409],['PM10_PAYLOAD_INVALID',400],['PM10_BUSY',409]])if(m.includes(code))pm10Fail(code,status);
  if(['42883','42P01'].includes(e?.code))pm10Fail('PM10_NOT_READY',503);
  pm10Fail('PM10_TEMPORARY_UNAVAILABLE',503);
 }
}
