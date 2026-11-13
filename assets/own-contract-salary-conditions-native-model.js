// Explicit native facts, selected contracts and independent approvals.
// V1 declarations and captures remain a separate immutable source.
import {salaryExact as shape,salaryUuid,salaryHash,salaryKey,salarySerialized,salaryJsonbBytes,SalaryInputError} from './native-salary-catalog-model.js';
import {SALARY_CONDITIONS_MAX_ROWS,SALARY_CONDITIONS_MAX_BYTES,salaryConditionsCapture,
 salaryConditionsSource,salaryConditionsSummary,salaryConditionsHash} from './own-contract-salary-conditions-model.js';

import {civilDay} from './employment-adoption-review-model.js';
export const SALARY_NATIVE_VERSION='own-contract-salary-conditions.v2';
export const salaryNativeCaptureMaterial=(value,period)=>[SALARY_NATIVE_VERSION,period,value.legacy.version,value.records];
const need=(ok,message,code='INPUT_INVALID')=>{if(!ok)throw new SalaryInputError('SALARY_CONDITIONS_'+code,message);};
const exact=(v,keys)=>shape(v,keys)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value')&&d.enumerable);
const periodValid=v=>typeof v==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const text=(v,min,max)=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=min&&v.length<=max&&!/[<>\u0000-\u001f\u007f]/.test(v);
const list=(v,max,empty=true)=>need(Array.isArray(v)&&v.length<=max&&(empty||v.length>0)&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value')),'La selección debe estar completa, sin huecos ni propiedades adicionales.','CONTRACT_INVALID');
const size=v=>need(salaryJsonbBytes(v)<=SALARY_CONDITIONS_MAX_BYTES,'La selección supera su capacidad. No se recortaron filas.','LIMIT');
const permissions=v=>need(exact(v,['canPropose','canReview'])&&Object.values(v).every(x=>typeof x==='boolean'),'No se verificaron los permisos.','CONTRACT_INVALID');
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);

export const SALARY_NATIVE_FIELDS=Object.freeze([
 {key:'teacherPayEnabled',label:'Habilitación de pago docente',unit:'boolean'},
 {key:'teacherReferenceAmount',label:'Importe de referencia docente',unit:'money'},
 {key:'housingHigherDedicationPayEnabled',label:'Habilitación de mayor dedicación de vivienda',unit:'boolean'},
 {key:'payrollMonthBaseDays',label:'Base de días de liquidación del mes',unit:'days'}
]);
const days=v=>v===null||typeof v==='string'&&/^(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$/.test(v);
const money=v=>v===null||typeof v==='string'&&/^-?(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$/.test(v)&&! /^-0(?:\.0+)?$/.test(v);
export function salaryNativeDefinition(v,period){
 need(periodValid(period)&&exact(v,['teacherPayEnabled','teacherReferenceAmount','housingHigherDedicationPayEnabled','payrollMonthBaseDays','asOfDate','documentReference']),'Revisá los hechos declarados, el período y la constancia.');
 for(const field of ['teacherPayEnabled','housingHigherDedicationPayEnabled'])need(v[field]===null||typeof v[field]==='boolean','Declarar sí, no o dejar sin informar. No se admiten códigos numéricos ni valores deducidos.');
 need(days(v.payrollMonthBaseDays),'La base de días es un decimal exacto no negativo o queda sin informar. No se deduce del calendario ni de la participación.');
 need(money(v.teacherReferenceAmount),'El importe de referencia docente es un decimal exacto o queda sin informar. Declararlo no habilita el pago docente.');
 need(civilDay(v.asOfDate)&&v.asOfDate.slice(0,7)<=period&&text(v.documentReference,3,180),'Indicá una fecha válida hasta el período elegido y la constancia municipal.');
 return {...v};
}
export function salaryNativeItems(items,period,{empty=true}={}){
 list(items,SALARY_CONDITIONS_MAX_ROWS,empty);let previous='';
 for(const item of items){
  need(exact(item,['contractId','identityToken','definition'])&&salaryUuid(item.contractId)&&item.contractId===item.contractId.toLowerCase()&&item.contractId>previous&&salaryHash(item.identityToken),'No se verificó la identidad canónica de las filas elegidas.','CONTRACT_INVALID');
  previous=item.contractId;salaryNativeDefinition(item.definition,period);
 }
 size(items);return items;
}

// The two sources retain their real, separate approval ids. No V1 approval is
// attributed to these new facts, and no new declaration replaces V1 fields.
export function salaryNativeCapture(value,employees,period){
 need(exact(value,['complete','version','legacy','records'])&&value.complete===true&&salaryHash(value.version)&&periodValid(period),'No se verificó la captura conjunta de condiciones propias.','CAPTURE_INVALID');
 salaryConditionsCapture(value.legacy,employees,period);list(value.records,SALARY_CONDITIONS_MAX_ROWS);
 const selected=new Map(employees.map(e=>[e.contractId,e.identityToken]));
 need(selected.size===employees.length&&value.records.length===selected.size,'La captura no contiene todos los contratos elegidos.','CAPTURE_INVALID');
 let previous='';
 for(const r of value.records){
  need(exact(r,['contractId','identityToken','revision','definition','approvalId'])&&salaryUuid(r.contractId)&&r.contractId===r.contractId.toLowerCase()&&r.contractId>previous&&selected.get(r.contractId)===r.identityToken&&salaryHash(r.identityToken)&&Number.isInteger(r.revision)&&r.revision>=0&&r.revision<=1000,'La captura tiene otra identidad, alcance o revisión.','CAPTURE_INVALID');previous=r.contractId;
  need(r.revision===0?r.definition===null&&r.approvalId===null:r.definition!==null&&salaryUuid(r.approvalId),'La declaración debe conservar su propia aprobación; sin informar no equivale a cero ni a no.','CAPTURE_INVALID');
  if(r.definition!==null)salaryNativeDefinition(r.definition,period);
 }
 size(value);return value;
}

export function salaryNativeIds(v){
 list(v,SALARY_CONDITIONS_MAX_ROWS,false);let previous='';
 for(const id of v){need(salaryUuid(id)&&id===id.toLowerCase()&&id>previous,'Elegí contratos nativos distintos, ordenados por su identidad canónica.');previous=id;}
 return v;
}
export function salaryNativeQuery(v){
 need(exact(v,['period','contractIds'])&&periodValid(v.period),'Elegí período y contratos.');salaryNativeIds(v.contractIds);size(v);return v;
}
function matchSelection(items,ids){
 need(items.length===ids.length&&items.every((item,i)=>item.contractId===ids[i]),'El contenido debe corresponder exactamente a los contratos elegidos.','POPULATION_CHANGED');
}
function matchSource(items,source,ids){
 matchSelection(source.subjects,ids);matchSelection(items,ids);
 need(items.every((item,i)=>item.identityToken===source.subjects[i].identityToken),'Cambió la identidad de un contrato seleccionado. Volvé a consultar.','IDENTITY_CHANGED');
}
export function salaryNativeCommand(v){
 need(exact(v,['version','contractIds','command','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','items','reason','reviewConfirmed'])&&v.version===SALARY_NATIVE_VERSION&&['propose','approve','reject'].includes(v.command)&&periodValid(v.period)&&[v.scopeVersion,v.baseVersion,v.sourceVersion].every(salaryHash)&&text(v.reason,10,1000)&&typeof v.reviewConfirmed==='boolean','Revisá operación, selección, período, versiones y fundamento.');
 salaryNativeIds(v.contractIds);
 if(v.command==='propose'){
  need(v.proposalId===null&&v.proposalSha256===null&&v.reviewConfirmed===false,'La propuesta queda para revisión de otra persona.');
  salaryNativeItems(v.items,v.period,{empty:false});matchSelection(v.items,v.contractIds);
 }else need(salaryUuid(v.proposalId)&&salaryHash(v.proposalSha256)&&v.items===null&&v.reviewConfirmed===true,'Elegí la propuesta y confirmá su revisión independiente.');
 size(v);return v;
}
export function salaryNativeConfiguration(v,period,ids){
 need(exact(v,['version','items','records'])&&salaryHash(v.version),'No se verificó la base de la selección.','CONTRACT_INVALID');
 salaryNativeItems(v.items,period);list(v.records,SALARY_CONDITIONS_MAX_ROWS);
 const allowed=new Set(ids);let previous='';
 for(const r of v.records){
  need(exact(r,['contractId','identityToken','revision','definition','approvalId'])&&salaryUuid(r.contractId)&&r.contractId===r.contractId.toLowerCase()&&r.contractId>previous&&allowed.has(r.contractId)&&salaryHash(r.identityToken)&&Number.isInteger(r.revision)&&r.revision>0&&r.revision<=1000&&salaryUuid(r.approvalId),'Una declaración de la base no tiene identidad, aprobación o alcance válido.','CONTRACT_INVALID');
  previous=r.contractId;salaryNativeDefinition(r.definition,period);
 }
 need(same(v.items,v.records.map(({contractId,identityToken,definition})=>({contractId,identityToken,definition}))),'La base no conserva la procedencia de cada contrato.','CONTRACT_INVALID');size(v);return v;
}
export function salaryNativeSummary(v){
 need(exact(v,['id','requestSha256','baseVersion','sourceVersion','itemCount','reason','createdAt','authorLabel','canReview','status','decision','contractIds']),'No se verificó la propuesta seleccionada.','CONTRACT_INVALID');
 const {contractIds,...legacy}=v;salaryConditionsSummary(legacy);salaryNativeIds(contractIds);need(v.itemCount===contractIds.length,'La propuesta tiene otro alcance.','CONTRACT_INVALID');return v;
}
function summaries(v){list(v,1000);const ids=new Set();for(const p of v){salaryNativeSummary(p);need(!ids.has(p.id),'Hay propuestas repetidas.','CONTRACT_INVALID');ids.add(p.id);}}
export function salaryNativeHistory(v){
 need(exact(v,['version','period','proposals','permissions','complete','payrollCalculated','payrollPosted'])&&v.version===SALARY_NATIVE_VERSION&&periodValid(v.period)&&v.complete===true&&v.payrollCalculated===false&&v.payrollPosted===false,'No se verificó el historial del período.','CONTRACT_INVALID');permissions(v.permissions);summaries(v.proposals);return v;
}
export function salaryNativeBootstrap(v){
 need(exact(v,['version','period','contractIds','scopeVersion','source','configuration','proposals','permissions','complete','payrollCalculated','payrollPosted'])&&v.version===SALARY_NATIVE_VERSION&&periodValid(v.period)&&salaryHash(v.scopeVersion)&&v.complete===true&&v.payrollCalculated===false&&v.payrollPosted===false,'No se verificó la selección y su período.','CONTRACT_INVALID');
 salaryNativeIds(v.contractIds);salaryConditionsSource(v.source);matchSelection(v.source.subjects,v.contractIds);salaryNativeConfiguration(v.configuration,v.period,v.contractIds);permissions(v.permissions);summaries(v.proposals);
 return v;
}
export async function salaryNativeDetail(v){
 need(exact(v,['version','period','contractIds','scopeVersion','proposal','body','baseItems','source','current','permissions'])&&v.version===SALARY_NATIVE_VERSION&&periodValid(v.period)&&salaryHash(v.scopeVersion)&&typeof v.current==='boolean','No se verificó el detalle de la selección.','CONTRACT_INVALID');
 salaryNativeIds(v.contractIds);salaryNativeSummary(v.proposal);salaryNativeCommand(v.body);salaryNativeItems(v.baseItems,v.period);salaryConditionsSource(v.source);permissions(v.permissions);
 need(v.body.command==='propose'&&v.body.period===v.period&&same(v.contractIds,v.body.contractIds)&&same(v.contractIds,v.proposal.contractIds)&&v.body.baseVersion===v.proposal.baseVersion&&v.body.sourceVersion===v.proposal.sourceVersion&&v.source.version===v.body.sourceVersion&&v.body.reason===v.proposal.reason&&v.proposal.requestSha256===await salaryConditionsHash(v.body),'El contenido no coincide con la propuesta conservada.','CONTRACT_INVALID');
 const allowed=new Set(v.contractIds);need(v.baseItems.every(r=>allowed.has(r.contractId)),'La base contiene contratos ajenos a la selección.','CONTRACT_INVALID');matchSource(v.body.items,v.source,v.contractIds);return v;
}
export function salaryNativeDraft(value){
 const b=salaryNativeBootstrap(value),existing=new Map(b.configuration.items.map(r=>[r.contractId,r]));
 return b.source.subjects.map(s=>{
  const old=existing.get(s.contractId);if(old){need(old.identityToken===s.identityToken,'Cambió la identidad de una declaración aprobada. Revisá el contrato.','IDENTITY_CHANGED');return structuredClone(old);}
  return{contractId:s.contractId,identityToken:s.identityToken,definition:{teacherPayEnabled:null,teacherReferenceAmount:null,housingHigherDedicationPayEnabled:null,payrollMonthBaseDays:null,asOfDate:'',documentReference:''}};
 });
}
export function prepareSalaryNative(bootstrap,items,reason){
 const b=salaryNativeBootstrap(bootstrap);need(b.permissions.canPropose,'Tu cuenta no permite preparar esta declaración.','FORBIDDEN');salaryNativeItems(items,b.period,{empty:false});matchSource(items,b.source,b.contractIds);need(!same(items,b.configuration.items),'La selección no contiene cambios.');
 return salaryNativeCommand({version:SALARY_NATIVE_VERSION,contractIds:[...b.contractIds],command:'propose',period:b.period,scopeVersion:b.scopeVersion,baseVersion:b.configuration.version,sourceVersion:b.source.version,proposalId:null,proposalSha256:null,items:structuredClone(items),reason,reviewConfirmed:false});
}
export async function decideSalaryNative(detail,command,reason){
 const d=await salaryNativeDetail(detail);need(['approve','reject'].includes(command)&&d.permissions.canReview&&d.proposal.canReview&&d.proposal.status==='pending','La decisión requiere otra persona habilitada.','INDEPENDENT_REQUIRED');
 need(command!=='approve'||d.current,'Cambió una declaración o la fuente de esta selección. Consultá antes de aprobar.','BASE_CHANGED');
 return salaryNativeCommand({version:SALARY_NATIVE_VERSION,contractIds:[...d.contractIds],command,period:d.period,scopeVersion:d.scopeVersion,baseVersion:d.proposal.baseVersion,sourceVersion:d.proposal.sourceVersion,proposalId:d.proposal.id,proposalSha256:d.proposal.requestSha256,items:null,reason,reviewConfirmed:true});
}
export async function salaryNativeReceipt(v,attempt=null){
 need(exact(v,['version','eventId','proposalId','requestKey','requestSha256','body','status','revision','configurationVersion','replayed','payrollCalculated','payrollPosted'])&&v.version===SALARY_NATIVE_VERSION&&[v.eventId,v.proposalId].every(salaryUuid)&&salaryKey(v.requestKey)&&[v.requestSha256,v.configurationVersion].every(salaryHash)&&Number.isInteger(v.revision)&&v.revision>=0&&v.revision<=1000&&typeof v.replayed==='boolean'&&v.payrollCalculated===false&&v.payrollPosted===false,'No se verificó el comprobante de la selección.','CONTRACT_INVALID');
 salaryNativeCommand(v.body);need(v.requestSha256===await salaryConditionsHash(v.body),'El comprobante cambió su contenido.','CONTRACT_INVALID');
 need(v.status===({propose:'pending',approve:'approved',reject:'rejected'})[v.body.command]&&(v.body.command==='propose'?v.eventId===v.proposalId&&v.configurationVersion===v.body.baseVersion:v.proposalId===v.body.proposalId),'El comprobante no corresponde a la operación.','CONTRACT_INVALID');
 if(v.body.command==='approve')need(v.revision>0&&v.configurationVersion!==v.body.baseVersion,'La aprobación no conservó una nueva revisión.','CONTRACT_INVALID');
 if(attempt)need(v.requestKey===attempt.key&&same(v.body,attempt.body),'Se cambió el intento original.','CONTRACT_INVALID');return v;
}
