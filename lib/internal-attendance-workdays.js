import { createHash } from 'node:crypto';
import { preparteMonth, summarizePreparte } from './attendance-preparte.js';
import { getAttendanceClockDashboard, normalizeClockDashboardQuery } from './internal-attendance-clock-dashboard.js';
import { reconstructWorkdays, reconstructContinuousWorkdays, CONTINUOUS_WORKDAY_RULES, filterWorkdays, summarizeWorkdays, filterContinuousWorkdays, summarizeContinuousWorkdays } from './attendance-workdays.js';
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

const UUID_V2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_V2 = /^[a-f0-9]{64}$/;
const SOURCE_SQL_V2 = 'SELECT public.attendance_clock_workday_source_v2($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::text,$8::date,$9::date,$10::uuid) AS result';
export function normalizeContinuousWorkdayQuery(options={}) {
  if (options.source !== 'continuous') fail('ATTENDANCE_WORKDAY_QUERY_INVALID',400,'La consulta v2 requiere la fuente continua explícita');
  const status=String(options.status??'all');
  const q=normalizeWorkdayQuery({...options,status:status==='extra_open'?'all':status});
  return {...q,status,snapshot:q.snapshot?.toLowerCase() || null};
}
function assertContinuousSource(raw,q) {
  const drift=()=>fail('ATTENDANCE_CONTRACT_DRIFT',503,'La fuente continua no cumple el contrato de jornadas');
  const keys=(value,names)=>{
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== names.length || Object.keys(value).some(k=>!names.includes(k))) drift();
  };
  const count=value=>Number.isSafeInteger(value) && value>=0;
  const timestamp=value=>typeof value==='string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  const date=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  keys(raw,['version','generatedAt','sourceMode','revision','rulesVersion','site','timezone','nominalReadAllowed','filters','context','collection','events','observations']);
  if (Buffer.byteLength(JSON.stringify(raw))>20*1024*1024 || raw.version!=='clock-workday-source.v2' ||
    raw.sourceMode!=='continuous' || raw.rulesVersion!==CONTINUOUS_WORKDAY_RULES.version || !timestamp(raw.generatedAt) ||
    !UUID_V2.test(raw.revision || '') || q.snapshot && raw.revision!==q.snapshot || typeof raw.nominalReadAllowed!=='boolean') drift();
  keys(raw.site,['key','label']);
  if (raw.site.key!==q.site || typeof raw.site.label!=='string' || raw.site.label.length>500 ||
    typeof raw.timezone!=='string' || raw.timezone.length>100) drift();
  try { new Intl.DateTimeFormat('sv-SE',{timeZone:raw.timezone}); } catch { drift(); }
  keys(raw.filters,['from','to','anchoredToLatest']);
  if (!date(raw.filters.from) || !date(raw.filters.to) || raw.filters.to<raw.filters.from ||
    Date.parse(raw.filters.to)-Date.parse(raw.filters.from)>92*86400000 ||
    raw.filters.anchoredToLatest!==(q.from===null) || q.from && (raw.filters.from!==q.from || raw.filters.to!==q.to)) drift();
  keys(raw.context,['from','to','recordCount','eventCount','observationCount']);
  const shift=(value,days)=>new Date(Date.parse(value+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
  if (raw.context.from!==shift(raw.filters.from,-1) || raw.context.to!==shift(raw.filters.to,1) ||
    !['recordCount','eventCount','observationCount'].every(k=>count(raw.context[k])) || raw.context.recordCount>25000 ||
    !Array.isArray(raw.events) || !Array.isArray(raw.observations) || raw.events.length!==raw.context.eventCount ||
    raw.observations.length!==raw.context.observationCount || raw.events.length+raw.observations.length!==raw.context.recordCount) drift();
  keys(raw.collection,['status','sourceComplete','captureCount','receiptCount','batchCount','lastReceiptAt','periodCoverageCertified','automaticCollectorVerified']);
  if (!['no_data','continuous_receipts'].includes(raw.collection.status) || raw.collection.sourceComplete!==true ||
    raw.collection.periodCoverageCertified!==false || raw.collection.automaticCollectorVerified!==false ||
    !['captureCount','receiptCount','batchCount'].every(k=>count(raw.collection[k])) ||
    raw.collection.batchCount>raw.collection.receiptCount ||
    (raw.collection.receiptCount===0 ? raw.collection.lastReceiptAt!==null : !timestamp(raw.collection.lastReceiptAt))) drift();
  const seen=new Set(), common=['eventRef','deviceKey','source','occurredAt','localTimestamp','issues'];
  for (const [rows,placeable] of [[raw.events,true],[raw.observations,false]]) for (const e of rows) {
    keys(e,placeable?[...common,'model','personKey','streamKey','personLabel','legajo','identityState','code']:common);
    keys(e.source,['kind','id','ordinal']);
    if (!HASH_V2.test(e.eventRef || '') || seen.has(e.eventRef) || !HASH_V2.test(e.deviceKey || '') ||
      !['historical','receipt'].includes(e.source.kind) || !UUID_V2.test(e.source.id || '') ||
      !Number.isSafeInteger(e.source.ordinal) || e.source.ordinal<1 || !Array.isArray(e.issues) || e.issues.length>10 ||
      e.issues.some(v=>typeof v!=='string' || !/^[a-z][a-z0-9_]{0,79}$/.test(v))) drift();
    seen.add(e.eventRef);
    if (placeable) {
      if (!timestamp(e.occurredAt) || typeof e.localTimestamp!=='string' ||
        e.localTimestamp.slice(0,10)<raw.context.from || e.localTimestamp.slice(0,10)>raw.context.to ||
        !HASH_V2.test(e.personKey || '') || !HASH_V2.test(e.streamKey || '') ||
        raw.nominalReadAllowed!==true && (e.legajo!==null || !/^Persona [A-F0-9]{8}$/.test(e.personLabel))) drift();
    } else if (!e.issues.length || e.occurredAt!==null && !timestamp(e.occurredAt) ||
      e.localTimestamp!==null && (typeof e.localTimestamp!=='string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(e.localTimestamp))) drift();
  }
  return raw;
}

/** Explicit v2 endpoint; no historical fallback if the new function is unavailable. */
async function loadContinuousWorkdays(sql,principal,options,session) {
  const q=normalizeContinuousWorkdayQuery(options),tenant=principal?.tenant;
  const email=String(principal?.user?.email || '').trim().toLowerCase();
  // Same session binding as the existing clock operations reader. SQL repeats
  // the authoritative live-session and attendance.read checks in the new facade.
  if (!email || tenant?.source!=='membership' || !UUID_V2.test(tenant?.id || '') ||
    !UUID_V2.test(tenant?.membershipId || '') || !UUID_V2.test(session?.id || '') ||
    email!==String(session?.email || '').trim().toLowerCase() || !Number.isSafeInteger(session?.version) || session.version<1 ||
    !/^[a-f0-9]{40}$/.test(session?.releaseSha || '') || session.releaseSha!==tenant.certifiedReleaseSha) {
    fail('ATTENDANCE_SESSION_INVALID',401,'La sesión operativa ya no es válida');
  }
  let raw;
  try {
    const response=await sql.query(SOURCE_SQL_V2,[email,session.id,session.version,session.releaseSha,
      tenant.id,tenant.membershipId,q.site,q.from,q.to,q.snapshot]);
    raw=assertContinuousSource((Array.isArray(response)?response:response?.rows)?.[0]?.result,q);
  } catch (error) {
    if (error instanceof AttendanceGatewayError) throw error;
    const message=String(error?.message || '');
    if (/ATTENDANCE_SESSION_INVALID|TIME_SOURCE_SESSION_INVALID/.test(message)) fail('ATTENDANCE_SESSION_INVALID',401,'La sesión operativa venció');
    if (/SESSION_BUSY/.test(message)) fail('ATTENDANCE_SESSION_BUSY',409,'El acceso se está actualizando; reintentá');
    if (/CAPABILITY_REQUIRED|AUTHORITY_REQUIRED|EMPLOYMENT_REQUIRED/.test(message)) fail('ATTENDANCE_CAPABILITY_REQUIRED',403,'Tu perfil no permite consultar estas marcaciones');
    if (/QUERY_INVALID/.test(message)) fail('ATTENDANCE_WORKDAY_QUERY_INVALID',400,'Filtros inválidos');
    if (/RELEASE_NOT_CERTIFIED|BINDING_REQUIRED/.test(message)) fail('ATTENDANCE_RELEASE_NOT_CERTIFIED',503,'El contrato municipal no está habilitado para esta consulta');
    if (/ATTENDANCE_CAPTURE_CHANGED/.test(message)) fail('ATTENDANCE_CAPTURE_CHANGED',409,'Cambió el corte de jornadas. Actualizá la consulta y repetí la operación.');
    if (/ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE/.test(message)) fail('ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE',409,'Hay una captura o recepción en curso. Esperá a que termine para reconstruir jornadas.');
    if (/ATTENDANCE_WORKDAY_SOURCE_CONFLICT/.test(message)) fail('ATTENDANCE_WORKDAY_SOURCE_CONFLICT',409,'Hay registros de origen incompatibles. Requieren revisión antes de reconstruir jornadas.');
    if (/ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE/.test(message)) fail('ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE',413,'Reducí el período: supera 25.000 registros de contexto');
    if (/ATTENDANCE_WORKDAY_SITE_NOT_FOUND/.test(message)) fail('ATTENDANCE_WORKDAY_SITE_NOT_FOUND',404,'No se encontró el punto solicitado');
    if (/ATTENDANCE_WORKDAY_DEVICE_CONTEXT_INVALID/.test(message)) fail('ATTENDANCE_WORKDAY_DEVICE_CONTEXT_INVALID',503,'La zona horaria del equipo requiere revisión');
    if (['42883','42P01'].includes(error?.code)) fail('ATTENDANCE_WORKDAYS_NOT_READY',503,'Este entorno todavía no tiene habilitada la consulta v2 de jornadas');
    fail('ATTENDANCE_WORKDAYS_UNAVAILABLE',503,'No se pudo consultar la fuente continua de jornadas');
  }
  if (q.search && !raw.nominalReadAllowed) fail('ATTENDANCE_CAPABILITY_REQUIRED',403,'Tu perfil no habilita búsquedas por persona');
  let result;
  try { result=reconstructContinuousWorkdays({events:raw.events,observations:raw.observations,
    from:raw.filters.from,to:raw.filters.to,timezone:raw.timezone}); }
  catch { fail('ATTENDANCE_CONTRACT_DRIFT',503,'No se pudo validar la secuencia continua recibida'); }
  return {q,raw,result};
}
export async function getAttendanceWorkdaysV2(sql,principal,options,session) {
  const {q,raw,result}=await loadContinuousWorkdays(sql,principal,options,session);
  const rows=filterContinuousWorkdays(result.rows,{search:q.search,status:q.status}),total=rows.length;
  const page=rows.slice((q.page-1)*q.pageSize,q.page*q.pageSize).map(({personKey,key,...row})=>({...row,
    key:createHash('sha256').update('clock-workday-v2:'+raw.revision+':'+key).digest('hex')}));
  const out={version:'clock-workdays.v2',generatedAt:raw.generatedAt,sourceMode:'continuous',snapshotId:raw.revision,
    site:raw.site,timezone:raw.timezone,filters:{...raw.filters,search:q.search,status:q.status},context:raw.context,
    collection:raw.collection,nominalReadAllowed:raw.nominalReadAllowed,rules:result.rules,
    summary:summarizeContinuousWorkdays(rows),periodSummary:result.summary,rows:page,
    observations:raw.observations.slice(0,100),observationSummary:{unplaced:raw.observations.length,
      placed:raw.events.filter(e=>e.issues.length).length,returned:Math.min(raw.observations.length,100),
      hasMore:raw.observations.length>100,scope:'context_including_undated'},
    pagination:{page:q.page,pageSize:q.pageSize,total,pages:Math.ceil(total/q.pageSize)},
    coverageCertified:false,homologationStatus:'unverified',approvalStatus:'not_approved',payrollEligible:false};
  if (Buffer.byteLength(JSON.stringify(out))>2*1024*1024) fail('ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE',413,'Reducí el tamaño de página para consultar el detalle');
  return out;
}

/** One complete month and one source snapshot; never a total of displayed pages. */
export async function getAttendancePreparte(sql,principal,options,session) {
  const bounds=preparteMonth(options.period);
  const {raw,result}=await loadContinuousWorkdays(sql,principal,{
    source:'continuous',site:options.site,...bounds,snapshot:options.snapshot,
    page:1,pageSize:25,status:'all',search:'',
  },session);
  const out=summarizePreparte(raw,result,options.period);
  if(options.evidence && (!/^[a-f0-9]{64}$/.test(options.evidence) || options.evidence!==out.evidenceHash))
    fail('ATTENDANCE_PREPARTE_CHANGED',409,'Las marcas o sus vínculos cambiaron. Consultá nuevamente antes de trasladar las decisiones.');
  return out;
}
