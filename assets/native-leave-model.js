import {isoDay} from './native-employee-contract.js';
import {catalogUuid} from './native-employment-catalog-model.js';
import {lifecycleIntervals} from './native-employment-lifecycle-model.js';
import {TITLE_VI_CATALOG_VERSION,getTitleViCatalog,reasonPolicyMapping} from './mendoza-title-vi.js';

export const NATIVE_LEAVE_VERSION='native-leave-workflow.v1';
export const NATIVE_LEAVE_STATES=Object.freeze({draft:'Borrador',submitted:'Pendiente de revisión',approved:'Aprobada',rejected:'Rechazada',cancelled:'Cancelada'});
export const NATIVE_LEAVE_UNITS=Object.freeze({calendar_day:'Días corridos',minute:'Minutos'});
export const NATIVE_LEAVE_POLICY_VERSION=TITLE_VI_CATALOG_VERSION;
export class NativeLeaveError extends Error{constructor(code,message){super(message);this.name='NativeLeaveError';this.code=code;}}
const fail=(message,code='INPUT_INVALID')=>{throw new NativeLeaveError(code,message);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const note=(v,min,max,label)=>{if(typeof v!=='string')fail('Revisá '+label+'.');const value=v.normalize('NFC').trim();if([...value].length<min||[...value].length>max||/[\p{Cc}<>]/u.test(value))fail('Revisá '+label+': entre '+min+' y '+max+' caracteres, sin etiquetas o controles.');return value;};
const catalog=getTitleViCatalog(),rules=new Set([...catalog.provisions,...catalog.keyRules].map(r=>r.id));
const provisions=new Map([
 ['annual-window','annual-ordinary'],['annual-carryover','annual-ordinary'],
 ['health-under-5-no-family','health'],['health-under-5-family','health'],['health-over-5-no-family','health'],['health-over-5-family','health'],['health-exactly-5','health'],['work-accident-art44-repealed','health'],['job-reservation','health'],
 ['marriage','special'],['bereavement-direct','special'],['bereavement-sibling','special'],['exam','special'],['blood-donation','special'],['family-care','special'],['training','special'],['personal-paid','special'],['organ-donation','special'],['special-work','special'],
 ['gender-violence-duration','gender-violence'],['unpaid-personal-duration','unpaid-personal'],['birth-gestating','family-protection'],['birth-non-gestating','family-protection'],['lactation','family-protection'],['adoption','family-protection'],['tardiness','attendance']
]);
function reason(value){
 const code=note(value,1,32,'el motivo');if(!/^[\p{L}\p{N}._-]+$/u.test(code))fail('Revisá el motivo.');
 const mapping=reasonPolicyMapping(code);
 if(!mapping.provisionId||['unmapped','not_a_leave','not_title_vi_policy','separate_regime'].includes(mapping.status))fail('El motivo no tiene una regla de solicitud operativa verificada.','REASON_NOT_SUPPORTED');
 return {code,mapping};
}
const milliseconds=day=>Date.parse(day+'T00:00:00Z');
const localMinutes=value=>{if(typeof value!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))fail('Revisá la hora, con formato HH:MM.');return Number(value.slice(0,2))*60+Number(value.slice(3));};

// These are requested civil days/minutes, never payable time or an inferred
// entitlement. The server also applies the existing leave input validator.
export function nativeLeavePayload(input){
 if(!exact(input,['reasonCode','policyVersionId','policyRuleId','startsOn','endsOn','durationUnit','startsAtLocal','endsAtLocal','confidentiality','employeeNote']))fail('La solicitud debe conservar todos sus campos explícitos.');
 const {code,mapping}=reason(input.reasonCode);
 if(input.policyVersionId!==TITLE_VI_CATALOG_VERSION)fail('Volvé a consultar la versión normativa.','POLICY_CHANGED');
 const rule=input.policyRuleId===null?null:note(input.policyRuleId,1,128,'la regla');
 const provision=rule&&(catalog.provisions.some(r=>r.id===rule)?rule:provisions.get(rule));
 if(rule&&(!rules.has(rule)||provision!==mapping.provisionId))fail('La regla no corresponde al motivo seleccionado.','POLICY_RULE_MISMATCH');
 if(!isoDay(input.startsOn)||!isoDay(input.endsOn)||input.startsOn<'2000-01-01'||input.endsOn>'2100-12-31')fail('Revisá las fechas de la solicitud.');
 const days=(milliseconds(input.endsOn)-milliseconds(input.startsOn))/86400000;
 if(days<0||days>366)fail('La solicitud debe comprender entre 1 y 367 días corridos.');
 if(!Object.hasOwn(NATIVE_LEAVE_UNITS,input.durationUnit))fail('Elegí días corridos o minutos.');
 if(input.durationUnit==='minute'){
  if(code!=='13'||input.startsOn!==input.endsOn||localMinutes(input.endsAtLocal)<=localMinutes(input.startsAtLocal))fail('El motivo habilitado por minutos requiere un solo día y una hora final posterior.');
 }else if(input.startsAtLocal!==null||input.endsAtLocal!==null)fail('Las horas sólo corresponden a solicitudes por minutos.');
 if(!['standard','restricted'].includes(input.confidentiality))fail('Revisá la confidencialidad.');
 if(!(mapping.provisionId==='annual-ordinary'&&mapping.status==='candidate')&&input.confidentiality!=='restricted')fail('Este motivo requiere tratamiento restringido.');
 const employeeNote=input.employeeNote===null?null:note(input.employeeNote,1,500,'la observación');
 if(input.confidentiality==='restricted'&&employeeNote!==null)fail('El motivo restringido no admite una observación nominal en esta solicitud.');
 return Object.freeze({...input,reasonCode:code,policyRuleId:rule,employeeNote});
}

export function nativeLeaveFitsEmployment(payload,intervals){
 const p=nativeLeavePayload(payload),rows=lifecycleIntervals(intervals);
 return rows.some(row=>p.startsOn>=row.startDate&&(row.endDate===null||p.endsOn<=row.endDate));
}

export function nativeLeaveAllocations(payload){
 const p=nativeLeavePayload(payload),parts=new Map();
 if(p.durationUnit==='minute')return Object.freeze([Object.freeze({year:Number(p.startsOn.slice(0,4)),reasonCode:p.reasonCode,durationUnit:p.durationUnit,units:localMinutes(p.endsAtLocal)-localMinutes(p.startsAtLocal)})]);
 for(let day=milliseconds(p.startsOn);day<=milliseconds(p.endsOn);day+=86400000){const year=new Date(day).getUTCFullYear();parts.set(year,(parts.get(year)||0)+1);}
 return Object.freeze([...parts].map(([year,units])=>Object.freeze({year,reasonCode:p.reasonCode,durationUnit:p.durationUnit,units})));
}

export function nativeLeaveProfile(input){
 if(!exact(input,['reasonCode','year','durationUnit','mode','entitledUnits','legalReference','reason']))fail('Revisá todos los campos de la declaración de saldo.');
 const {code}=reason(input.reasonCode);
 if(!Number.isSafeInteger(input.year)||input.year<2000||input.year>2100)fail('Revisá el año del saldo.');
 if(!Object.hasOwn(NATIVE_LEAVE_UNITS,input.durationUnit)||input.durationUnit==='minute'&&code!=='13')fail('Revisá la unidad del saldo.');
 if(!['confirmed','not_applicable'].includes(input.mode))fail('Elegí saldo declarado o saldo no aplicable con respaldo.');
 if(input.mode==='confirmed'&&(!Number.isSafeInteger(input.entitledUnits)||input.entitledUnits<0||input.entitledUnits>1000000)||input.mode==='not_applicable'&&input.entitledUnits!==null)fail('El saldo debe ser un entero explícito; no aplicable conserva un valor ausente.');
 return Object.freeze({...input,reasonCode:code,legalReference:note(input.legalReference,1,240,'el respaldo'),reason:note(input.reason,10,1000,'el fundamento')});
}

// Callers must supply the full, verified request set for this contract and
// the independently approved profiles, including zero entitlements.
export function nativeLeaveBalances(profiles,requests,{complete}={}){
 if(complete!==true||!Array.isArray(profiles)||!Array.isArray(requests)||profiles.length>500||requests.length>1000)fail('Consultá el historial completo antes de revisar saldos.','INCOMPLETE');
 const pools=new Map(),seen=new Set();
 const key=p=>p.reasonCode+':'+p.year+':'+p.durationUnit;
 for(const row of profiles){const p=nativeLeaveProfile(row),k=key(p);if(pools.has(k))fail('Hay declaraciones vigentes repetidas para un mismo saldo.','CONFLICT');pools.set(k,{year:p.year,reasonCode:p.reasonCode,durationUnit:p.durationUnit,mode:p.mode,entitledUnits:p.entitledUnits,reservedUnits:0,approvedUnits:0,availableUnits:p.entitledUnits});}
 for(const row of requests){if(!exact(row,['id','status','payload'])||!catalogUuid(row.id)||seen.has(row.id)||!Object.hasOwn(NATIVE_LEAVE_STATES,row.status))fail('El historial contiene una solicitud inválida o repetida.','CONTRACT_INVALID');seen.add(row.id);const allocations=nativeLeaveAllocations(row.payload);for(const part of allocations){const k=key(part);if(!pools.has(k))pools.set(k,{year:part.year,reasonCode:part.reasonCode,durationUnit:part.durationUnit,mode:'unavailable',entitledUnits:null,reservedUnits:0,approvedUnits:0,availableUnits:null});const pool=pools.get(k);if(row.status==='submitted')pool.reservedUnits+=part.units;else if(row.status==='approved')pool.approvedUnits+=part.units;}}
 for(const pool of pools.values())if(pool.mode==='confirmed'){pool.availableUnits=pool.entitledUnits-pool.reservedUnits-pool.approvedUnits;if(pool.availableUnits<0)fail('Las reservas y licencias aprobadas exceden el saldo declarado.','BALANCE_CONFLICT');}
 return Object.freeze([...pools.values()].sort((a,b)=>a.year-b.year||a.reasonCode.localeCompare(b.reasonCode)||a.durationUnit.localeCompare(b.durationUnit)).map(Object.freeze));
}

export function nativeLeaveCanReserve(payload,balances){
 const parts=nativeLeaveAllocations(payload);if(!Array.isArray(balances))fail('Consultá los saldos vigentes.');
 return parts.every(part=>{const matches=balances.filter(p=>p.year===part.year&&p.reasonCode===part.reasonCode&&p.durationUnit===part.durationUnit);if(matches.length!==1)return false;const pool=matches[0];return pool.mode==='not_applicable'&&pool.entitledUnits===null&&pool.availableUnits===null||pool.mode==='confirmed'&&Number.isSafeInteger(pool.availableUnits)&&pool.availableUnits>=part.units;});
}

// Dates are compared as civil intervals; touching calendar days and exact
// half-open minute intervals preserve their different units.
export function nativeLeaveConflicts(payload,requests){
 const p=nativeLeavePayload(payload);if(!Array.isArray(requests)||requests.length>1000)fail('Consultá las solicitudes completas.');
 const conflicts=[];
 for(const row of requests){if(!catalogUuid(row.id)||!Object.hasOwn(NATIVE_LEAVE_STATES,row.status))fail('No se pudo verificar la identidad de una solicitud.','CONTRACT_INVALID');const q=nativeLeavePayload(row.payload);if(!['submitted','approved'].includes(row.status)||p.endsOn<q.startsOn||q.endsOn<p.startsOn)continue;
  if(p.durationUnit==='minute'&&q.durationUnit==='minute'&&(localMinutes(p.endsAtLocal)<=localMinutes(q.startsAtLocal)||localMinutes(q.endsAtLocal)<=localMinutes(p.startsAtLocal)))continue;
  conflicts.push(row.id);
 }
 if(new Set(conflicts).size!==conflicts.length)fail('Hay solicitudes repetidas en la revisión.','CONTRACT_INVALID');return Object.freeze(conflicts);
}

export function nativeLeaveTransition(current,command,{independent=false,evidenceStatus=null,manualValidationConfirmed=false,confidentiality='restricted'}={}){
 if(!Object.hasOwn(NATIVE_LEAVE_STATES,current))fail('No se pudo verificar el estado de la solicitud.','STATE_INVALID');
 if(command==='update_draft'&&current==='draft')return 'draft';
 if(command==='submit'&&current==='draft')return 'submitted';
 if(['approve','reject'].includes(command)&&current==='submitted'){
  if(!independent)fail('Debe revisar otra persona autorizada.','SELF_REVIEW');
  if(command==='approve'&&(manualValidationConfirmed!==true||!['verified','not_required'].includes(evidenceStatus)||confidentiality!=='standard'&&evidenceStatus!=='verified'))fail('La aprobación requiere evidencia y validación humana expresa.','EVIDENCE_REQUIRED');
  return command==='approve'?'approved':'rejected';
 }
 if(command==='cancel'&&['draft','submitted','approved'].includes(current)){if(current==='approved'&&!independent)fail('La cancelación de una licencia aprobada exige revisión independiente.','SELF_REVIEW');return 'cancelled';}
 fail('La solicitud cambió. Volvé a consultar su historia.','STATE_INVALID');
}
