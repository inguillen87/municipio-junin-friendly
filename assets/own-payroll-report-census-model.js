// Closed-report discovery is distinct from the operational close review.
// This contract never contains a live roster, current classifications or captures.
import {salaryExact,salaryHash,salaryUuid,salarySerialized,SalaryInputError} from './native-salary-catalog-model.js';
import {OWN_RUN_TYPES} from './own-payroll-run-workspace-model.js';

export const OWN_REPORT_CENSUS_VERSION='own-report-close-census.v1';
export const OWN_REPORT_CENSUS_MAX_GROUPS=1000;
export const OWN_REPORT_CENSUS_MAX_EVENTS=2000;
const need=(ok,message)=>{if(!ok)throw new SalaryInputError('REPORT_CENSUS_CONTRACT_INVALID',message);};
const month=v=>typeof v==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const dense=(v,max)=>Array.isArray(v)&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1;
const ascending=(previous,id)=>previous===null||previous<id;

export function ownReportCensusQuery(value){
 need(salaryExact(value,['period','liquidationType'])&&month(value.period)&&Object.hasOwn(OWN_RUN_TYPES,value.liquidationType),'Elegí un período y tipo válidos para el histórico cerrado.');
 return {period:value.period,liquidationType:value.liquidationType};
}

export function ownReportCensus(value){
 need(salaryExact(value,['version','period','liquidationType','scopeVersion','sourceVersion','complete','eventCount','events','groups'])&&value.version===OWN_REPORT_CENSUS_VERSION&&[value.scopeVersion,value.sourceVersion].every(salaryHash)&&value.complete===true,'No se verificó el censo completo de cierres.');
 ownReportCensusQuery({period:value.period,liquidationType:value.liquidationType});
 need(dense(value.events,OWN_REPORT_CENSUS_MAX_EVENTS)&&dense(value.groups,OWN_REPORT_CENSUS_MAX_GROUPS)&&Number.isSafeInteger(value.eventCount)&&value.eventCount===value.events.length,'No se verificó el conjunto completo de eventos de cierre.');
 const events=new Map(),closed=new Map(),reopened=new Map();let previous=null;
 for(const event of value.events){
  need(salaryExact(event,['id','groupId','command','bodySha256','snapshotSha256','recordedAt'])&&[event.id,event.groupId].every(salaryUuid)&&['close','reopen'].includes(event.command)&&[event.bodySha256,event.snapshotSha256].every(salaryHash)&&date(event.recordedAt)&&ascending(previous,event.id)&&!events.has(event.id),'Un evento del histórico está incompleto, repetido o fuera de orden.');
  previous=event.id;events.set(event.id,event);
  const target=event.command==='close'?closed:reopened;
  need(!target.has(event.groupId)&&(event.command==='close'?event.id===event.groupId:event.id!==event.groupId),'El historial repite un cierre o una reapertura.');
  target.set(event.groupId,event);
 }
 need(closed.size===value.groups.length,'El censo perdió un grupo cerrado o agregó un grupo sin evento.');
 previous=null;
 for(const group of value.groups){
  need(salaryExact(group,['id','state','snapshotSha256','employeeCount','populationCount','populationComplete','recordedAt','reopenedAt'])&&salaryUuid(group.id)&&ascending(previous,group.id)&&['closed','reopened'].includes(group.state)&&salaryHash(group.snapshotSha256)&&Number.isSafeInteger(group.employeeCount)&&group.employeeCount>0&&group.employeeCount<=10000&&Number.isSafeInteger(group.populationCount)&&group.populationCount>=group.employeeCount&&group.populationCount<=10000&&group.populationComplete===(group.employeeCount===group.populationCount)&&date(group.recordedAt),'No se verificó cada copia histórica del censo.');
  previous=group.id;
  const close=closed.get(group.id),reopen=reopened.get(group.id);
  need(close&&close.snapshotSha256===group.snapshotSha256&&close.recordedAt===group.recordedAt,'El grupo no coincide con su evento de cierre.');
  need(reopen?group.state==='reopened'&&group.reopenedAt===reopen.recordedAt&&reopen.snapshotSha256===close.snapshotSha256&&Date.parse(reopen.recordedAt)>=Date.parse(close.recordedAt):group.state==='closed'&&group.reopenedAt===null,'El estado del grupo no coincide con sus eventos originales.');
 }
 for(const id of reopened.keys())need(closed.has(id),'Una reapertura perdió su cierre original.');
 return value;
}

// The SQL facade must produce this same complete, scope- and query-bound value.
// A matching hash alone is not proof that the SQL reader did not omit rows.
export function ownReportCensusSource(value){
 ownReportCensus(value);const {sourceVersion,...source}=value;return source;
}
export async function verifiedOwnReportCensus(value){
 const source=ownReportCensusSource(value);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(source)));
 const actual=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
 need(actual===value.sourceVersion,'Cambió la huella del conjunto completo de cierres.');
 return value;
}
