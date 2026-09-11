import { createHash } from 'node:crypto';
import { getAttendanceClockDashboard, normalizeClockDashboardQuery } from './internal-attendance-clock-dashboard.js';
import { reconstructWorkdays, filterWorkdays, summarizeWorkdays } from './attendance-workdays.js';
import { AttendanceGatewayError } from './internal-attendance-gateway.js';
const fail=(code,status,message)=>{throw new AttendanceGatewayError(code,status,message)};
const allowed=new Set(['ordinal','occurredAt','localTimestamp','personKey','streamKey','personLabel','legajo','identityState','code','issues']);
export function normalizeWorkdayQuery(options={}) {
 const q=normalizeClockDashboardQuery({...options,identity:'all',hour:''});
 const status=String(options.status??'all');
 if(!['all','closed','review','extra','unlinked'].includes(status))fail('ATTENDANCE_WORKDAY_QUERY_INVALID',400,'Estado de jornada inválido');
 return {...q,status};
}
/** All pairings happen on a bounded, complete source window, before UI filters or pagination. */
export async function getAttendanceWorkdays(sql,principal,options,session) {
 const q=normalizeWorkdayQuery(options);let events=[];
 const adapter={query:async(statement,params)=>{
  if(!statement.startsWith('SELECT public.attendance_clock_dashboard_v2('))fail('ATTENDANCE_CONTRACT_DRIFT',503,'Consulta de jornadas incompatible');
  const r=await sql.query('SELECT public.attendance_clock_workday_source_v1($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::text,$8::date,$9::date,$10::uuid) AS result',[...params.slice(0,9),q.snapshot]);
  const raw=(Array.isArray(r)?r:r?.rows)?.[0]?.result;
  if(!raw||Object.keys(raw).some(k=>!['version','base','events'].includes(k))||raw.version!=='clock-workday-source.v1'||!Array.isArray(raw.events)||raw.events.length>25000||Buffer.byteLength(JSON.stringify(raw))>20*1024*1024)fail('ATTENDANCE_CONTRACT_DRIFT',503,'Fuente de jornadas inválida');
  for(const e of raw.events){if(!e||Object.keys(e).some(k=>!allowed.has(k)))fail('ATTENDANCE_CONTRACT_DRIFT',503,'Campos de jornada incompatibles');
   if(raw.base?.nominalReadAllowed!==true&&(e.legajo!==null||!/^Persona [A-F0-9]{8}$/.test(e.personLabel)))fail('ATTENDANCE_CONTRACT_DRIFT',503,'La respuesta excede el permiso de consulta');}
  events=raw.events;return [{result:raw.base}];
 }};
 let base;
 try{base=await getAttendanceClockDashboard(adapter,principal,{...q,page:1,pageSize:1,search:'',identity:'all',hour:''},session)}catch(e){
  if(/ATTENDANCE_CAPTURE_INCOMPLETE/.test(String(e.message)))fail('ATTENDANCE_CAPTURE_INCOMPLETE',409,'La captura todavía no terminó de importarse');
  if(/ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE/.test(String(e.message)))fail('ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE',413,'Reducí el período: supera 25.000 marcaciones de contexto');throw e;
 }
 if(q.search&&base.nominalReadAllowed!==true)fail('ATTENDANCE_CAPABILITY_REQUIRED',403,'Tu perfil no habilita búsquedas por persona');
 let result;
 try{result=base.filters?reconstructWorkdays({events,from:base.filters.from,to:base.filters.to,timezone:base.timezone,model:base.dashboard.device?.model}):{rows:[],rules:{profileSupported:false,payrollEligible:false},summary:summarizeWorkdays([])}}catch{fail('ATTENDANCE_CONTRACT_DRIFT',503,'No se pudo validar la secuencia recibida')}
 const rows=filterWorkdays(result.rows,{search:q.search,status:q.status}),total=rows.length;
 const page=rows.slice((q.page-1)*q.pageSize,q.page*q.pageSize).map(r=>{const {personKey,key,...safe}=r;return {...safe,key:createHash('sha256').update(base.dashboard.snapshotId+':'+key).digest('hex')}});
 const out={version:'clock-workdays.v1',generatedAt:base.generatedAt,site:base.site,timezone:base.timezone,filters:{...base.filters,search:q.search,status:q.status},snapshotId:base.dashboard.snapshotId,collection:base.collection,nominalReadAllowed:base.nominalReadAllowed,rules:result.rules,summary:summarizeWorkdays(rows),periodSummary:result.summary,rows:page,pagination:{page:q.page,pageSize:q.pageSize,total,pages:Math.ceil(total/q.pageSize)},payrollEligible:false};
 if(Buffer.byteLength(JSON.stringify(out))>2*1024*1024)fail('ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE',413,'Reducí el tamaño de página para consultar el detalle');
 return out;
}
