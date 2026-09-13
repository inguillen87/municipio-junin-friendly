import {pm10Fail} from './internal-pm10-reception.js';
const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function assertPm10Status(x){
 if(!x||x.version!=='pm10-status.v1'||!Number.isFinite(Date.parse(x.checkedAt))||!['active','suspended','retired','not_configured'].includes(x.connectorState)||x.physicalClockVerified!==false||x.payrollModified!==false||typeof x.nominalReadAllowed!=='boolean'||!Number.isSafeInteger(x.baselineRecords)||x.baselineRecords<0||!Array.isArray(x.records)||x.records.length>50)pm10Fail('PM10_RECEIPT_INVALID',502);
 for(const k of ['receipts','newMarks','observations','knownRecords'])if(!Number.isSafeInteger(x.summary?.[k])||x.summary[k]<0)pm10Fail('PM10_RECEIPT_INVALID',502);
 for(const k of ['lastReceivedAt','lastCapturedAt'])if(x.summary[k]!==null&&!Number.isFinite(Date.parse(x.summary[k])))pm10Fail('PM10_RECEIPT_INVALID',502);
 for(const r of x.records){
  if((r.occurredAt!==null&&!Number.isFinite(Date.parse(r.occurredAt)))||!Number.isFinite(Date.parse(r.receivedAt))||typeof r.personLabel!=='string'||r.personLabel.length>500||!['observed','mapped','review'].includes(r.state)||!Array.isArray(r.issueCodes)||r.issueCodes.some(c=>!['identity_bytes_review','identity_format_review','timestamp_invalid','future_timestamp'].includes(c))||!Number.isInteger(r.punchCode)||r.punchCode<0||r.punchCode>255||!Number.isInteger(r.verificationCode)||r.verificationCode<0||r.verificationCode>255||(r.legajo!==null&&!/^\d{1,12}$/.test(r.legajo)))pm10Fail('PM10_RECEIPT_INVALID',502);
  if(!x.nominalReadAllowed&&(r.legajo!==null||r.personLabel!=='Identidad reservada'))pm10Fail('PM10_RECEIPT_INVALID',502);
 }
 return x;
}
export async function getPm10Status(sql,principal,session){
 const t=principal?.tenant,email=String(principal?.user?.email||'').trim().toLowerCase();
 if(!email||t?.source!=='membership'||!uuid.test(t.id)||!uuid.test(t.membershipId)||!uuid.test(session?.id)||session.email?.trim().toLowerCase()!==email||!Number.isInteger(session.version)||session.version<1||! /^[a-f0-9]{40}$/.test(session.releaseSha||'')||session.releaseSha!==t.certifiedReleaseSha)pm10Fail('PM10_AUTH_DENIED',401);
 try{const r=await sql.query('SELECT public.attendance_pm10_receipt_status_v1($1::text,$2::uuid,$3::int,$4::text,$5::uuid,$6::uuid) AS result',[email,session.id,session.version,session.releaseSha,t.id,t.membershipId]);return assertPm10Status((Array.isArray(r)?r:r?.rows)?.[0]?.result);}
 catch(e){if(e?.name==='AttendanceGatewayError')throw e;if(/SESSION_INVALID|SESSION_REQUIRED/.test(String(e.message)))pm10Fail('PM10_AUTH_DENIED',401);if(/CAPABILITY|AUTHORITY/.test(String(e.message)))pm10Fail('PM10_CONTEXT_DENIED',403);pm10Fail('PM10_NOT_READY',503);}
}
