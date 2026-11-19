// A reference to a recorded annulment is navigation context, never authority.
// No actor, capability, employee label, reason or prior request key is carried.
import {salaryExact,salaryUuid,salaryHash,salarySerialized} from './native-salary-catalog-model.js';
import {ownLiquidationDetail,verifiedOwnLiquidationDetail} from './own-payroll-liquidation-model.js';
import {OWN_RUN_PREPARE,hasOwnRunAccess} from './own-payroll-run-workspace-model.js';
import {ownRunDate} from './own-payroll-run-date.js';

export const OWN_RECAPTURE_SOURCE_VERSION='own-payroll-recapture-source.v1';
const need=(ok,message='La anulación ya no permite recuperar ese alcance completo. Volvé a consultar la corrida.')=>{if(!ok)throw Error(message);};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const exactData=(value,keys)=>salaryExact(value,keys)&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).length===keys.length&&Object.values(Object.getOwnPropertyDescriptors(value)).every(property=>Object.hasOwn(property,'value')&&property.enumerable);
export function ownRecaptureSource(value){
 need(exactData(value,['version','runId','eventId','resultSha256','employeeCount'])&&value.version===OWN_RECAPTURE_SOURCE_VERSION&&salaryUuid(value.runId)&&salaryUuid(value.eventId)&&salaryHash(value.resultSha256)&&Number.isSafeInteger(value.employeeCount)&&value.employeeCount>0&&value.employeeCount<=10000);
 return Object.freeze({version:value.version,runId:value.runId,eventId:value.eventId,resultSha256:value.resultSha256,employeeCount:value.employeeCount});
}
export function ownRecaptureContext(value){
 need(exactData(value,['kind','source'])&&value.kind==='annulled-event');
 return Object.freeze({kind:'annulled-event',source:ownRecaptureSource(value.source)});
}
function annulledRows(detail,eventId){
 const rows=detail.employees.filter(employee=>employee.events.some(event=>event.id===eventId));
 need(rows.length>0);
 const first=rows[0].events.find(event=>event.id===eventId);
 for(const employee of rows){
  const event=employee.events.find(event=>event.id===eventId);
  need(event.command==='annul'&&employee.state==='annulled'&&employee.events.at(-1)===event&&event.version===employee.version&&event.liquidationVersion===employee.liquidationVersion);
  need(event.recordedAt===first.recordedAt&&event.actorLabel===first.actorLabel&&event.reason===first.reason);
 }
 return rows;
}
// Every row from this event is kept, including a blocked one. The UI may show
// the event as unavailable; it must not silently prepare only its free rows.
export function ownRecaptureEvents(detail){
 ownLiquidationDetail(detail);
 const ids=new Set(detail.employees.flatMap(employee=>employee.events.filter(event=>event.command==='annul').map(event=>event.id)));
 return [...ids].map(eventId=>{
  const rows=annulledRows(detail,eventId),event=rows[0].events.at(-1);
  return Object.freeze({source:ownRecaptureSource({version:OWN_RECAPTURE_SOURCE_VERSION,runId:detail.id,eventId,resultSha256:detail.capture.saved.resultSha256,employeeCount:rows.length}),recordedAt:event.recordedAt,count:rows.length,available:rows.every(row=>row.blockedBy===null)});
 }).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)||a.source.eventId.localeCompare(b.source.eventId));
}
export function ownRecapturePreparation(detail,source){
 const reference=ownRecaptureSource(source);ownLiquidationDetail(detail);
 need(detail.id===reference.runId&&detail.capture.saved.resultSha256===reference.resultSha256);
 const rows=annulledRows(detail,reference.eventId);
 need(rows.length===reference.employeeCount);
 need(rows.every(row=>row.blockedBy===null),'Hay otra liquidación confirmada para parte de esta anulación. No se preparó un alcance parcial.');
 const people=new Map(detail.capture.saved.input.employees.map(person=>[person.contractId,person]));
 return freeze({source:reference,scopeVersion:detail.scopeVersion,period:detail.capture.body.period,liquidationType:detail.capture.body.liquidationType,liquidationDate:detail.capture.body.liquidationDate??null,
  selection:{kind:'contracts',values:rows.map(row=>row.contractId).sort()},affected:rows.map(row=>({contractId:row.contractId,employeeNumber:people.get(row.contractId).employeeNumber}))});
}
// Reauthorize on both sides of the private read. An event is recoverable by a
// different actor only when the current detail API allows that actor to read it.
export async function readOwnRecapture(source,{reauthorize,readDetail,valid=()=>true}){
 const reference=ownRecaptureSource(source);
 const check=access=>{if(!access||typeof access.key!=='string'||!access.key||!hasOwnRunAccess(access.caps,OWN_RUN_PREPARE))throw Object.assign(Error('Tu cuenta no permite preparar una recaptura.'),{status:403});return access.key;};
 const current=()=>{if(!valid())throw Object.assign(Error('La revisión de la anulación quedó desactualizada.'),{name:'AbortError'});};
 const key=check(await reauthorize());current();
 const detail=await verifiedOwnLiquidationDetail(structuredClone(await readDetail(reference.runId)));current();
 const next=check(await reauthorize());current();
 if(key!==next)throw Object.assign(Error('Cambió la cuenta durante la revisión. Volvé a abrir la anulación con tu cuenta.'),{status:403});
 return ownRecapturePreparation(detail,reference);
}
export function ownRecaptureMatchesCommand(preparation,body){
 need(body.period===preparation.period&&body.liquidationType===preparation.liquidationType&&body.scopeVersion===preparation.scopeVersion
  &&body.selection?.kind==='contracts'&&salarySerialized(body.selection.values)===salarySerialized(preparation.selection.values)
  &&(preparation.liquidationDate===null?ownRunDate(body.liquidationDate):body.liquidationDate===preparation.liquidationDate),
 'El período, la fecha, el tipo o el alcance ya no coinciden con la anulación. Volvé a recuperarla o elegí preparar un alcance diferente.');
 return body;
}
