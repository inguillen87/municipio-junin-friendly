import {salaryExact,salaryHash,salaryUuid} from './native-salary-catalog-model.js';
import {civilDay} from './employment-adoption-review-model.js';
import {periodClassificationDefinition,periodClassificationProvenance,periodClassificationPeriod} from './own-period-classification-model.js';

const need=(ok,message)=>{if(!ok)throw Error(message);};
const code=v=>typeof v==='string'&&/^[0-9]{1,9}$/.test(v);
const nullable=(v,check)=>v===null||check(v);
const currentKeys=['agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode','startDate','endDate'];
const dense=v=>Array.isArray(v)&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value')&&d.enumerable);

// This validates evidence frozen by the authorized SQL reader. It does not
// approve a declaration or rebuild classification from today's employee record.
// Captures predating this component keep their original absence of evidence.
export function ownRunPeriodClassifications(capture){
 const inventory=capture?.payload?.sourceInventory;
 if(!inventory||!Object.hasOwn(inventory,'periodClassifications'))return null;
 const value=inventory.periodClassifications,population=capture.payload.population?.employees,period=capture.body?.period;
 need(salaryExact(value,['version','complete','total','rows'])&&value.version==='own-period-classification-capture.v1'&&value.complete===true&&dense(value.rows)&&value.rows.length<=10000&&value.total===value.rows.length&&dense(population)&&population.length===value.total&&periodClassificationPeriod(period)&&salaryHash(capture.payloadSha256),'No se verificó el encuadre completo conservado en el cálculo.');
 const people=new Map(population.map(e=>[e.contractId,e])),ids=new Set(),registrations=new Set();
 need(people.size===population.length,'Hay contratos repetidos en el encuadre capturado.');
 const first=period+'-01',last=new Date(Date.UTC(Number(period.slice(0,4)),Number(period.slice(5,7)),0)).toISOString().slice(0,10);
 for(const row of value.rows){
  const employee=people.get(row.contractId),d=row.definition;
  need(salaryExact(row,['contractId','registrationId','identityToken','basis','classificationVersion','approvalId','definition','provenance'])&&salaryUuid(row.contractId)&&salaryUuid(row.registrationId)&&salaryHash(row.identityToken)&&!ids.has(row.contractId)&&!registrations.has(row.registrationId)&&employee?.origin==='MUNICONTROL'&&employee.identityToken===row.identityToken,'El encuadre no coincide con la identidad propia capturada.');
  if(row.basis==='current_own_registration'){
   need(row.classificationVersion===null&&row.approvalId===null&&row.provenance===null&&salaryExact(d,currentKeys)&&code(d.agreementCode)&&code(d.sectorCode)&&['categoryCode','organizationId'].every(k=>nullable(d[k],code))&&[null,'42','55'].includes(d.jurisdictionCode)&&['startDate','endDate'].every(k=>nullable(d[k],civilDay))&&(d.startDate===null||d.endDate===null||d.startDate<=d.endDate),'El antecedente actual no conserva sus códigos y fechas exactos.');
  }else{
   need(row.basis==='approved_own_period_classification'&&salaryHash(row.classificationVersion)&&salaryUuid(row.approvalId),'Falta la aprobación propia del encuadre del período.');
   periodClassificationDefinition(d,period);const provenance=periodClassificationProvenance(row.provenance);
   need(provenance.registrationId===row.registrationId&&['agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode','startDate','effectiveFrom','effectiveUntil'].every(k=>d[k]!==null)&&d.startDate<=first&&(d.endDate===null||d.endDate>=last)&&d.effectiveFrom<=first&&d.effectiveUntil>=last,'La declaración aprobada no cubre el mes completo o corresponde a otro registro.');
  }
  need(code(employee.categoryCode)&&d.categoryCode===employee.categoryCode&&d.agreementCode===employee.agreementCode&&d.sectorCode===employee.departmentCode,'La población salarial no coincide con los códigos del período capturados.');
  ids.add(row.contractId);registrations.add(row.registrationId);
 }
 return value;
}
