import {salaryExact,salaryHash,salaryUuid} from './native-salary-catalog-model.js';
import {ownPayrollEmployeeNumber} from './own-payroll-engine.js';

const need=(value,message)=>{if(!value)throw Error(message);};
export const OWN_JURISDICTIONS=Object.freeze({all:'Todas las jurisdicciones','42':'Jurisdicción 42','55':'Jurisdicción 55',not_reported:'Sin informar en el alta',not_captured:'No capturada en el cálculo'});
export const OWN_JURISDICTION_CHOICES=Object.freeze(['all','42','55','not_reported','not_captured']);
export function ownJurisdictionChoice(value){need(Object.hasOwn(OWN_JURISDICTIONS,value),'Elegí una jurisdicción disponible.');return value;}
// Reporting metadata is frozen beside the approved salary sources. It never
// changes an input, formula, result, old capture, or current employee identity.
export function ownRunJurisdictions(capture){
 const inventory=capture?.payload?.sourceInventory;
 if(!inventory||!Object.hasOwn(inventory,'jurisdictions'))return null;
 const value=inventory.jurisdictions,population=capture.payload.population?.employees;
 need(salaryExact(value,['version','complete','total','rows'])&&value.version==='own-run-jurisdictions.v1'&&value.complete===true&&Array.isArray(value.rows)&&value.rows.length<=10000&&value.total===value.rows.length&&Array.isArray(population)&&population.length===value.rows.length&&salaryHash(capture.payloadSha256),'No se verificó la jurisdicción completa conservada en el cálculo.');
 const people=new Map(population.map(e=>[e.contractId,e])),ids=new Set(),registrations=new Set();
 need(people.size===population.length,'Hay contratos repetidos en la población capturada.');
 for(const row of value.rows){const employee=people.get(row.contractId);
  need(salaryExact(row,['contractId','employeeNumber','registrationId','identityToken','jurisdictionCode'])&&salaryUuid(row.contractId)&&salaryUuid(row.registrationId)&&salaryHash(row.identityToken)&&ownPayrollEmployeeNumber(row.employeeNumber)&&[null,'42','55'].includes(row.jurisdictionCode)&&!ids.has(row.contractId)&&!registrations.has(row.registrationId)&&employee?.origin==='MUNICONTROL'&&employee.employeeNumber===row.employeeNumber&&employee.identityToken===row.identityToken,'Una jurisdicción no corresponde exactamente al contrato y registro capturados.');
  ids.add(row.contractId);registrations.add(row.registrationId);
 }
 return value;
}
export function ownJurisdictionRecord(value){
 need(salaryExact(value,['code','basis','sourceSha256'])&&[null,'42','55'].includes(value.code)&&['captured_own_registration','not_captured'].includes(value.basis)&&(value.basis==='not_captured'?value.code===null&&value.sourceSha256===null:salaryHash(value.sourceSha256)),'No se verificó la procedencia histórica de la jurisdicción.');return value;
}
export function ownJurisdictionForCapture(capture,contractId){
 const value=ownRunJurisdictions(capture);if(value===null)return {code:null,basis:'not_captured',sourceSha256:null};
 const row=value.rows.find(r=>r.contractId===contractId);need(row,'Falta la jurisdicción de un contrato seleccionado; no se omitió esa fila.');
 return {code:row.jurisdictionCode,basis:'captured_own_registration',sourceSha256:capture.payloadSha256};
}
export function ownClosedJurisdiction(employee,snapshotVersion){
 if(snapshotVersion==='own-close-snapshot.v1'){need(!Object.hasOwn(employee,'jurisdiction'),'El cierre original v1 no conserva una jurisdicción.');return {code:null,basis:'not_captured',sourceSha256:null};}
 need(['own-close-snapshot.v2','own-close-snapshot.v3'].includes(snapshotVersion),'No se verificó la versión del cierre.');return ownJurisdictionRecord(employee.jurisdiction);
}
export function ownJurisdictionLabel(value){ownJurisdictionRecord(value);return value.basis==='not_captured'?OWN_JURISDICTIONS.not_captured:value.code??OWN_JURISDICTIONS.not_reported;}
export function ownJurisdictionSelect(items,choice='all'){
 ownJurisdictionChoice(choice);const tagged=items.map(item=>({item,jurisdiction:ownClosedJurisdiction(item.employee,item.source.snapshot.version)}));
 if(['42','55'].includes(choice))need(tagged.every(({jurisdiction:j})=>j.basis==='captured_own_registration'&&j.code!==null),'El alcance contiene jurisdicciones no capturadas o sin informar. No se puede asegurar una planilla completa de 42/55. Consultá todas las jurisdicciones y revisá esas participaciones; no se omitieron filas.');
 return tagged.filter(({jurisdiction:j})=>choice==='all'||choice==='not_captured'&&j.basis==='not_captured'||choice==='not_reported'&&j.basis==='captured_own_registration'&&j.code===null||['42','55'].includes(choice)&&j.code===choice).map(({item})=>item);
}
