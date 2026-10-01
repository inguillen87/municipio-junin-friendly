import {employeeDraft,isoDay} from './native-employee-contract.js';

const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)&&!/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const freeze=value=>{if(object(value)||Array.isArray(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const text=value=>typeof value==='string'&&value===value.trim()&&value.normalize('NFC')===value&&!/[\u0000-\u001f\u007f<>]/.test(value);
export class EmployeeConfirmationError extends Error{constructor(message='La confirmación del alta necesita verificación. Consultá el intento original.'){super(message);this.name='EmployeeConfirmationError';this.status=503;this.code='NATIVE_EMPLOYEE_CONTRACT_INVALID';}}
const fail=message=>{throw new EmployeeConfirmationError(message);};

export function employeeScopeKey(scope){
  if(!exact(scope,['tenantId','membershipId'])||!uuid(scope.tenantId)||!uuid(scope.membershipId))fail('No se pudo verificar el municipio y la membresía del alta.');
  return scope.tenantId.toLowerCase()+':'+scope.membershipId.toLowerCase();
}
export function employeeCreationBootstrap(value){
  if(!object(value)||value.version!=='native-employee.v1'||typeof value.canCreate!=='boolean'||!isoDay(value.today)||!(/^[1-9]\d{0,9}$/).test(value.suggestedLegajo)||!object(value.catalog)||!/^[a-f0-9]{64}$/.test(value.catalog.version)||!Array.isArray(value.catalog.items))fail('El catálogo y el acceso al alta no pudieron verificarse.');
  employeeScopeKey(value.scope);const seen=new Set();
  for(const item of value.catalog.items){
    if(!object(item)||!['agreements','categories','organizations','sectors'].includes(item.kind)||typeof item.code!=='string'||!/^\d{1,9}$/.test(item.code)||typeof item.label!=='string'||!item.label.trim()||/[\u0000-\u001f\u007f]/.test(item.label)||item.kind==='categories'&&(typeof item.agreementCode!=='string'||!/^\d{1,9}$/.test(item.agreementCode)))fail('El catálogo de encuadres no pudo verificarse.');
    const key=[item.kind,item.kind==='categories'?item.agreementCode:'',item.code].join(':');if(seen.has(key))fail('El catálogo contiene opciones repetidas.');seen.add(key);
  }
  return freeze(structuredClone(value));
}
const canonical=value=>Array.isArray(value)?value.map(canonical):object(value)?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const employeeCatalogEqual=(left,right)=>JSON.stringify(canonical(left))===JSON.stringify(canonical(right));

export function employeeReceipt(value,draft=null){
  const keys=['version','registrationId','contractId','legajo','name','startDate','createdAt','origin','accountCreated','payrollCalculated','replayed'];
  if(object(value)&&Object.hasOwn(value,'jurisdictionCode'))keys.push('jurisdictionCode');
  if(!exact(value,keys)||value.version!=='native-employee.v1'||!uuid(value.registrationId)||!uuid(value.contractId)||typeof value.legajo!=='string'||!/^[1-9]\d{0,8}$/.test(value.legajo)||!text(value.name)||value.name.length<3||value.name.length>160||!isoDay(value.startDate)||typeof value.createdAt!=='string'||!isoDay(value.createdAt.slice(0,10))||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value.createdAt)||!Number.isFinite(Date.parse(value.createdAt))||value.origin!=='MUNICONTROL'||value.accountCreated!==false||value.payrollCalculated!==false||typeof value.replayed!=='boolean'||Object.hasOwn(value,'jurisdictionCode')&&!['42','55'].includes(value.jurisdictionCode))fail();
  if(draft){
    const d=employeeDraft(draft,'2099-12-31');
    if(Object.hasOwn(d,'jurisdictionCode')!==Object.hasOwn(value,'jurisdictionCode')||d.jurisdictionCode!==value.jurisdictionCode)fail('La jurisdicción confirmada necesita verificación. Consultá el intento original.');
    if(value.name!==d.fullName||value.startDate!==d.startDate||d.legajo&&value.legajo!==d.legajo)fail('Los datos confirmados no corresponden al alta revisada. Consultá el intento original.');
  }
  return value;
}

export function employeeCreationFinalRefusal(error){
  return [400,409,422,428].includes(error?.status)&&/^NATIVE_EMPLOYEE_(?:INPUT_INVALID|IDENTITY_EXISTS|DUPLICATE|NUMBER_EXISTS|NUMBER_LIMIT|CATALOG_CHANGED|CATALOG_SELECTION_INVALID|BINDING_INVALID|BUSY)$/.test(error?.code||'');
}
