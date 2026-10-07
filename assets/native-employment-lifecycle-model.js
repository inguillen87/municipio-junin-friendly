import {isoDay} from './native-employee-contract.js';
import {catalogUuid, catalogAttemptKey} from './native-employment-catalog-model.js';

export const LIFECYCLE_VERSION='native-employment-lifecycle.v1';
export const ADOPTED_LIFECYCLE_VERSION='native-employment-lifecycle.v2';
export const LIFECYCLE_MOVEMENTS=Object.freeze({terminate:'Baja',reenter:'Reingreso'});
export const LIFECYCLE_STATUSES=Object.freeze({active:'Activo',inactive:'Inactivo',pending_start:'Ingreso futuro',unknown:'Fechas pendientes de verificar',state_error:'Estado pendiente de revisión'});
export {catalogUuid as lifecycleUuid,catalogAttemptKey as lifecycleAttemptKey};
export class LifecycleInputError extends Error{constructor(code,message){super(message);this.name='LifecycleInputError';this.code=code;}}
const fail=(message,code='INPUT_INVALID')=>{throw new LifecycleInputError(code,message);};
const obj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>obj(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const stamp=v=>typeof v==='string'&&isoDay(v.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const text=(v,min,max,label)=>{if(typeof v!=='string')fail('Revisá '+label+'.');const n=v.normalize('NFC').trim();if([...n].length<min||[...n].length>max||/[\p{Cc}<>]/u.test(n))fail('Revisá '+label+': entre '+min+' y '+max+' caracteres, sin etiquetas ni controles.');return n;};
const contract=valid=>{if(!valid)fail('No se pudo verificar el historial laboral. Consultá nuevamente antes de continuar.','CONTRACT_INVALID');};

// Civil dates and inclusive work intervals. No duration, seniority, salary,
// absence or eligibility is inferred from the interval alone.
const adoptedVersion=v=>v===ADOPTED_LIFECYCLE_VERSION;
const validVersion=v=>v===LIFECYCLE_VERSION||adoptedVersion(v);
// Historical facts may precede the new-movement date range. They never widen
// the allowed dates for a newly proposed termination or reentry.
const civilDay=v=>typeof v==='string'&&/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
export function lifecycleIntervals(value,version=LIFECYCLE_VERSION){
 if(!validVersion(version))fail('La versión del historial no es válida.');
 const day=adoptedVersion(version)?civilDay:isoDay;
 if(!Array.isArray(value)||!value.length||value.length>51)fail('El historial debe conservar todos los períodos laborales.');
 let previous=null;for(const interval of value){
  if(!exact(interval,['startDate','endDate'])||!day(interval.startDate)||interval.endDate!==null&&!day(interval.endDate)||interval.endDate!==null&&interval.endDate<interval.startDate||previous&&(previous.endDate===null||interval.startDate<=previous.endDate))fail('Revisá las fechas: los períodos no pueden superponerse ni borrar una baja.');
  previous=interval;
 }
 return structuredClone(value);
}
export function lifecycleActivity(intervals,today,version=LIFECYCLE_VERSION){
 const rows=lifecycleIntervals(intervals,version);if(!isoDay(today))fail('La fecha municipal no es válida.');
 if(rows.some(r=>r.startDate<=today&&(r.endDate===null||r.endDate>=today)))return 'active';
 return rows.some(r=>r.startDate>today)?'pending_start':'inactive';
}
export function lifecycleAfter(intervals,movement,date,version=LIFECYCLE_VERSION){
 const rows=lifecycleIntervals(intervals,version),last=rows.at(-1);if(!Object.hasOwn(LIFECYCLE_MOVEMENTS,movement)||!isoDay(date))fail('Elegí baja o reingreso e indicá una fecha válida.');
 if(movement==='terminate'){
  if(last.endDate!==null)fail('El último período ya tiene una baja. Consultá su historial.');
  if(date<last.startDate)fail('La última fecha de vigencia no puede ser anterior al ingreso.');
  last.endDate=date;
 }else{
  if(last.endDate===null)fail('El reingreso requiere una baja previa.');
  if(date<=last.endDate)fail('El reingreso debe ser posterior a la última fecha de vigencia de la baja.');
  if(rows.length>=51)fail('Se alcanzó el límite de períodos de este contrato. Su historial se conserva.');
  rows.push({startDate:date,endDate:null});
 }
 return rows;
}
export function lifecycleProposalInput(v){
 if(!exact(v,['contractId','identityToken','scopeVersion','baseVersion','movement','date','legalReference','reason'])||!catalogUuid(v.contractId)||![v.identityToken,v.scopeVersion,v.baseVersion].every(hash)||!Object.hasOwn(LIFECYCLE_MOVEMENTS,v.movement)||!isoDay(v.date))fail('Volvé a consultar el legajo y revisá el movimiento y sus fechas.');
 return {...v,contractId:v.contractId.toLowerCase(),legalReference:text(v.legalReference,3,180,'la resolución o documento'),reason:text(v.reason,10,1000,'el motivo')};
}
export function lifecycleReviewInput(v){
 if(!exact(v,['contractId','proposalId','scopeVersion','decision','reason'])||![v.contractId,v.proposalId].every(catalogUuid)||!hash(v.scopeVersion)||!['approve','reject'].includes(v.decision))fail('La revisión debe identificar el contrato, la propuesta y la decisión.');
 return {...v,contractId:v.contractId.toLowerCase(),proposalId:v.proposalId.toLowerCase(),reason:text(v.reason,10,1000,'el motivo de la revisión')};
}
function subject(s,id,version){const adopted=adoptedVersion(version);contract(exact(s,['contractId','legajo','employeeName','identityToken','sourceCutoff','origin','registrationId','registeredAt',...(adopted?['recordKind']:[])])&&(!adopted||s.recordKind==='adopted')&&catalogUuid(s.contractId)&&s.contractId.toLowerCase()===id.toLowerCase()&&catalogUuid(s.registrationId)&&typeof s.legajo==='string'&&(adopted?s.legajo.length>0&&s.legajo.length<=64&&!/[\p{Cc}]/u.test(s.legajo):/^[1-9]\d{0,8}$/.test(s.legajo))&&typeof s.employeeName==='string'&&s.employeeName.trim().length>0&&[...s.employeeName].length<=160&&hash(s.identityToken)&&s.sourceCutoff===null&&s.origin==='MUNICONTROL'&&stamp(s.registeredAt));}
function intervals(v,version){try{return lifecycleIntervals(v,version);}catch{contract(false);}}
function summary(p,full=false){
 contract(exact(p,full?['id','contractId','subject','status','movement','date','reason','legalReference','createdAt','authorLabel','baseVersion','canReview','before','after','review']:['id','status','movement','date','reason','legalReference','createdAt','authorLabel','baseVersion','canReview'])&&catalogUuid(p.id)&&['pending','approved','rejected'].includes(p.status)&&Object.hasOwn(LIFECYCLE_MOVEMENTS,p.movement)&&isoDay(p.date)&&typeof p.reason==='string'&&[...p.reason].length>=10&&[...p.reason].length<=1000&&typeof p.legalReference==='string'&&[...p.legalReference].length>=3&&[...p.legalReference].length<=180&&stamp(p.createdAt)&&typeof p.authorLabel==='string'&&p.authorLabel.length>0&&[...p.authorLabel].length<=160&&hash(p.baseVersion)&&typeof p.canReview==='boolean'&&(p.status==='pending'||p.canReview===false));
}
export function validateLifecycleBootstrap(v,id){
 contract(exact(v,['version','scopeVersion','subject','employment','permissions','proposals','historyTruncated'])&&validVersion(v.version)&&hash(v.scopeVersion));subject(v.subject,id,v.version);
 const e=v.employment;contract(exact(e,['version','revision','appliedAt','intervals','today','status',...(adoptedVersion(v.version)?['datesVerified']:[])])&&hash(e.version)&&Number.isSafeInteger(e.revision)&&e.revision>=0&&e.revision<=100&&(e.revision===0?e.appliedAt===null:stamp(e.appliedAt))&&isoDay(e.today));if(adoptedVersion(v.version)){contract(typeof e.datesVerified==='boolean');if(!e.datesVerified)contract(Array.isArray(e.intervals)&&e.intervals.length===0&&e.revision===0&&['inactive','unknown','state_error'].includes(e.status)&&v.permissions?.canPropose===false);}
 if(!adoptedVersion(v.version)||e.datesVerified){const rows=intervals(e.intervals,v.version);contract(e.status===lifecycleActivity(rows,e.today,v.version));}
 contract(exact(v.permissions,['canPropose','canReview'])&&Object.values(v.permissions).every(x=>typeof x==='boolean')&&Array.isArray(v.proposals)&&v.proposals.length<=20&&typeof v.historyTruncated==='boolean'&&(!v.historyTruncated||v.proposals.length===20));const ids=new Set();for(const p of v.proposals){summary(p);contract(!ids.has(p.id.toLowerCase()));ids.add(p.id.toLowerCase());}return v;
}
export function validateLifecycleProposal(v,id,proposalId){
 contract(exact(v,['version','proposal'])&&validVersion(v.version));const p=v.proposal;summary(p,true);contract(catalogUuid(p.contractId)&&p.contractId.toLowerCase()===id.toLowerCase()&&p.id.toLowerCase()===proposalId.toLowerCase());subject(p.subject,id,v.version);contract(exact(p.before,['intervals'])&&exact(p.after,['intervals']));const before=intervals(p.before.intervals,v.version),after=intervals(p.after.intervals,v.version);let expected;try{expected=lifecycleAfter(before,p.movement,p.date,v.version);}catch{contract(false);}contract(JSON.stringify(expected)===JSON.stringify(after));
 contract(p.status==='pending'?p.review===null:exact(p.review,['decision','reason','reviewedAt','reviewerLabel'])&&p.review.decision===(p.status==='approved'?'approve':'reject')&&typeof p.review.reason==='string'&&[...p.review.reason].length>=10&&[...p.review.reason].length<=1000&&stamp(p.review.reviewedAt)&&typeof p.review.reviewerLabel==='string'&&p.review.reviewerLabel.length>0&&[...p.review.reviewerLabel].length<=160);return v;
}
export function validateLifecycleReceipt(v,id){
 contract(exact(v,['version','operation','contractId','proposalId','status','employmentVersion','revision','replayed','payrollModified'])&&validVersion(v.version)&&['propose','review'].includes(v.operation)&&catalogUuid(v.contractId)&&v.contractId.toLowerCase()===id.toLowerCase()&&catalogUuid(v.proposalId)&&['pending','approved','rejected'].includes(v.status)&&hash(v.employmentVersion)&&Number.isSafeInteger(v.revision)&&v.revision>=0&&v.revision<=100&&typeof v.replayed==='boolean'&&v.payrollModified===false&&(v.operation==='propose'?v.status==='pending':v.status!=='pending')&&(v.status!=='approved'||v.revision>0));return v;
}
