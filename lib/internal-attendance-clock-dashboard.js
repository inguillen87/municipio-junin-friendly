import { getAttendanceClockOperations, normalizeClockOperationsQuery } from './internal-attendance-clock-operations.js';
import { AttendanceGatewayError } from './internal-attendance-gateway.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(code,status,message)=>{throw new AttendanceGatewayError(code,status,message)};
export function normalizeClockDashboardQuery(options={}){
 const q=normalizeClockOperationsQuery(options),search=String(options.search??'').trim(),identity=String(options.identity??'all'),rawHour=String(options.hour??''),snapshot=options.snapshot?String(options.snapshot):null;
 if(search.length>120||/[\x00-\x1f\x7f]/.test(search)||!['all','mapped','unmapped'].includes(identity)||rawHour!==''&&!/^(?:[0-9]|1[0-9]|2[0-3])$/.test(rawHour)||snapshot&&!UUID.test(snapshot))fail('ATTENDANCE_OPERATIONS_QUERY_INVALID',400,'Filtros de tablero inválidos');
 return {...q,search,identity,hour:rawHour===''?null:Number(rawHour),snapshot};
}
function checkExtra(d,base,q){
 const drift=()=>fail('ATTENDANCE_CONTRACT_DRIFT',503,'El tablero no cumple el contrato operativo');
 const keys=(v,allowed)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!allowed.includes(k)))drift()};
 keys(d,['version','snapshotId','filters','periodSummary','heatmap','codes','device','unlinkedPeople']);
 if(d.version!=='clock-dashboard.v2'||d.snapshotId!==null&&!UUID.test(d.snapshotId||'')||q.snapshot&&d.snapshotId!==q.snapshot)drift();
 keys(d.filters,['search','identity','hour']);if(d.filters.search!==q.search||d.filters.identity!==q.identity||d.filters.hour!==q.hour)drift();
 keys(d.periodSummary,['marks','people','mappedMarks','unmappedMarks','sourceRows','observedRows','latestMarkAt']);
 const count=v=>Number.isSafeInteger(v)&&v>=0;
 if(!count(d.unlinkedPeople)||d.unlinkedPeople>base.summary.people)drift();
 if(!count(base.pagination.total)||base.pagination.total!==base.summary.marks||!count(base.pagination.pages)||base.pagination.pages!==Math.ceil(base.pagination.total/q.pageSize))drift();
 if(base.summary.mappedMarks>base.summary.marks||base.summary.people>base.summary.marks||base.summary.unmappedMarks!==undefined&&base.summary.unmappedMarks!==base.summary.marks-base.summary.mappedMarks)drift();
 if(!Array.isArray(d.heatmap)||d.heatmap.length>168||!Array.isArray(d.codes)||d.codes.length>256)drift();
 const seen=new Set();for(const cell of d.heatmap){keys(cell,['weekday','hour','marks']);if(!Number.isInteger(cell.weekday)||cell.weekday<1||cell.weekday>7||!Number.isInteger(cell.hour)||cell.hour<0||cell.hour>23||!count(cell.marks)||seen.has(cell.weekday+':'+cell.hour))drift();seen.add(cell.weekday+':'+cell.hour)}
 for(const c of d.codes){keys(c,['code','marks']);if(!Number.isInteger(c.code)||c.code<0||c.code>255||!count(c.marks))drift()}
 if(d.heatmap.reduce((s,x)=>s+x.marks,0)!==base.summary.marks||d.codes.reduce((s,x)=>s+x.marks,0)!==base.summary.marks)drift();
 if(d.device!==null){keys(d.device,['model','serial','firmware','metadataAvailable','automaticCollectorVerified']);for(const k of ['model','serial','firmware'])if(d.device[k]!==null&&(typeof d.device[k]!=='string'||d.device[k].length>200))drift();if(d.device.automaticCollectorVerified!==false||typeof d.device.metadataAvailable!=='boolean')drift()}
 for(const row of base.records){if(!Number.isInteger(row.punchCode)||row.punchCode<0||row.punchCode>255||!Number.isInteger(row.verificationCode)||row.verificationCode<0||row.verificationCode>255)drift()}
 return d;
}
export async function getAttendanceClockDashboard(sql,principal,options,session){
 const q=normalizeClockDashboardQuery(options);let extra;
 // Reuse v1's live-session checks, tenant binding, safe SQL errors and nominal response guard.
 const adapter={query:async(statement,params)=>{
  if(!statement.startsWith('SELECT public.attendance_clock_operations_v1('))fail('ATTENDANCE_CONTRACT_DRIFT',503,'Consulta incompatible');
  const response=await sql.query('SELECT public.attendance_clock_dashboard_v2($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::text,$8::date,$9::date,$10::integer,$11::integer,$12::text,$13::text,$14::integer,$15::uuid) AS result',[...params,q.search,q.identity,q.hour,q.snapshot]);
  const rows=Array.isArray(response)?response:response?.rows,raw=rows?.[0]?.result;
  if(!raw||typeof raw!=='object'||Buffer.byteLength(JSON.stringify(raw))>512*1024)fail('ATTENDANCE_CONTRACT_DRIFT',503,'Respuesta de tablero inválida');
  const {dashboard,...base}=raw;extra=checkExtra(dashboard,base,q);return [{result:base}];
 }};
 try{const base=await getAttendanceClockOperations(adapter,principal,q,session);return {...base,dashboard:extra}}
 catch(error){if(/ATTENDANCE_CAPTURE_CHANGED/.test(String(error?.message)))fail('ATTENDANCE_CAPTURE_CHANGED',409,'Llegó una nueva captura. Actualizá y repetí la exportación.');throw error}
}
