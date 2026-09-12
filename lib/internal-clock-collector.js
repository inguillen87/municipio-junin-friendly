import {AttendanceGatewayError} from './internal-attendance-gateway.js';
const bad=()=>{throw new AttendanceGatewayError('COLLECTOR_STATUS_INVALID',503,'No se pudo comprobar el estado del colector.');};
export function validateCollectorStatus(r,site){
 const fields=['version','generatedAt','site','label','connectorState','enabled','lastContactAt','lastReadAt','lastBatchAt','reportedState','pendingReported','captureLastAt','totals','recent','payrollImpact'];
 if(!r||typeof r!=='object'||Object.keys(r).length!==fields.length||Object.keys(r).some(k=>!fields.includes(k))||r.version!=='clock-collector-status.v1'||r.site!==site||r.payrollImpact!==false||typeof r.enabled!=='boolean')bad();
 if(!['active','suspended','retired','not_registered'].includes(r.connectorState)||!['not_installed','read_ok','device_offline','blocked','spool_full'].includes(r.reportedState))bad();
 for(const field of ['generatedAt','lastContactAt','lastReadAt','lastBatchAt','captureLastAt'])if(r[field]!==null&&(typeof r[field]!=='string'||!Number.isFinite(Date.parse(r[field]))))bad();
 if(!r.generatedAt||r.label!==null&&(typeof r.label!=='string'||r.label.length>180))bad();
 if(!Number.isSafeInteger(r.pendingReported)||r.pendingReported<0||r.pendingReported>200000)bad();
 if(!r.totals||Object.keys(r.totals).sort().join(',')!=='normalized,observed,stored')bad();
 for(const n of Object.values(r.totals))if(!Number.isSafeInteger(n)||n<0)bad();
 if(r.totals.stored!==r.totals.normalized+r.totals.observed||!Array.isArray(r.recent)||r.recent.length>20)bad();
 for(const row of r.recent){
  if(!row||Object.keys(row).sort().join(',')!=='id,identityState,issue,localTime,punchCode,receivedAt,verificationCode'||!/^\d+$/.test(row.id)||!['mapped','unmapped','ambiguous'].includes(row.identityState))bad();
  if(row.issue!==null&&!['invalid_identity','invalid_date','future_date','before_activation'].includes(row.issue))bad();
  if(row.localTime!==null&&!/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(row.localTime)||!Number.isFinite(Date.parse(row.receivedAt)))bad();
  for(const k of ['punchCode','verificationCode'])if(!Number.isInteger(row[k])||row[k]<0||row[k]>255)bad();
 }
 return r;
}
export async function getClockCollectorStatus(sql,principal,site,session){
 if(typeof site!=='string'||! /^[a-z0-9][a-z0-9._-]{1,95}$/.test(site))throw new AttendanceGatewayError('ATTENDANCE_OPERATIONS_QUERY_INVALID',400,'Punto inválido');
 const t=principal?.tenant,email=principal?.user?.email;
 if(t?.source!=='membership'||!email||session?.email!==email||session?.releaseSha!==t.certifiedReleaseSha)throw new AttendanceGatewayError('ATTENDANCE_SESSION_INVALID',401,'Sesión municipal requerida');
 const rows=await sql.query('SELECT public.attendance_collector_status_v1($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::text) AS result',[email,session.id,session.version,session.releaseSha,t.id,t.membershipId,site]);
 return validateCollectorStatus((Array.isArray(rows)?rows:rows?.rows)?.[0]?.result,site);
}
