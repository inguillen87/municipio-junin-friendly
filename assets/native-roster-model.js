import {isoDay} from './native-employee-contract.js';
export const MAX_NATIVE_ROSTER_ROWS=10000;
export const NATIVE_ROSTER_STATUSES=Object.freeze({all:'Todos',active:'Activos',pending_start:'Ingreso futuro',inactive:'Inactivos',state_error:'Estado a revisar'});
export const NATIVE_ROSTER_FILTERS=Object.freeze(['search','status','jurisdiction','organization','sector','agreement']);
export const NATIVE_ROSTER_FIELDS=Object.freeze(['contractId','registrationId','legajo','name','dni','cuil','sexCode','birthDate','startDate','endDate','status','jurisdictionCode','agreement','category','organization','sector','jobTitle','legalReference','registeredAt']);
const verified=new WeakSet(),uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v)&&!/^0+$/.test(v.replaceAll('-',''));
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v),exact=(v,keys)=>obj(v)&&Object.keys(v).sort().join('|')===[...keys].sort().join('|');
const freeze=v=>{if(obj(v)||Array.isArray(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export class NativeRosterError extends Error{constructor(message='El padrón completo no pudo verificarse. Consultalo nuevamente.',status=503,code='NATIVE_ROSTER_INVALID'){super(message);Object.assign(this,{name:'NativeRosterError',status,code});}}
const fail=()=>{throw new NativeRosterError();};
export function nativeRosterFilters(input={}){
 if(!obj(input)||Object.keys(input).some(k=>!NATIVE_ROSTER_FILTERS.includes(k)))throw new NativeRosterError('Revisá los filtros del padrón.',400,'NATIVE_ROSTER_FILTERS_INVALID');
 const result=Object.fromEntries(NATIVE_ROSTER_FILTERS.map(k=>[k,input[k]??(k==='status'?'all':'')]));
 for(const [k,v] of Object.entries(result))if(typeof v!=='string'||v!==v.trim()||v.length>(k==='search'?100:160)||/[\u0000-\u001f\u007f]/.test(v))throw new NativeRosterError('Revisá los filtros del padrón.',400,'NATIVE_ROSTER_FILTERS_INVALID');
 if(!Object.hasOwn(NATIVE_ROSTER_STATUSES,result.status)||!['','42','55','not_reported'].includes(result.jurisdiction))throw new NativeRosterError('Revisá situación y jurisdicción.',400,'NATIVE_ROSTER_FILTERS_INVALID');
 return freeze(result);
}
export function nativeRosterScope(scope){if(!exact(scope,['tenantId','membershipId','bindingId','companyId'])||![scope.tenantId,scope.membershipId,scope.bindingId].every(uuid)||!Number.isSafeInteger(scope.companyId)||scope.companyId<1)fail();return [scope.tenantId,scope.membershipId,scope.bindingId,scope.companyId].join(':');}
const timestamp=v=>typeof v==='string'&&isoDay(v.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
const nullableText=v=>v===null||typeof v==='string'&&v.length<=180&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
export function nativeRoster(value,expectedFilters=null){
 if(!exact(value,['version','origin','complete','today','queriedAt','scope','filters','total','people','counts','facets','rows','snapshot'])||value.version!=='native-roster.v1'||value.origin!=='MUNICONTROL'||value.complete!==true||!isoDay(value.today)||!timestamp(value.queriedAt)||!/^[a-f0-9]{64}$/.test(value.snapshot)||!Array.isArray(value.rows)||value.rows.length>MAX_NATIVE_ROSTER_ROWS||!Number.isSafeInteger(value.total)||value.total!==value.rows.length||!Number.isSafeInteger(value.people)||value.people<0||value.people>value.total)fail();
 nativeRosterScope(value.scope);const filters=nativeRosterFilters(value.filters);if(expectedFilters&&JSON.stringify(filters)!==JSON.stringify(nativeRosterFilters(expectedFilters)))fail();
 if(!exact(value.counts,['active','pending_start','inactive','state_error'])||!exact(value.facets,['organization','sector','agreement']))fail();
 for(const items of Object.values(value.facets))if(!Array.isArray(items)||items.some(v=>typeof v!=='string'||!v||v.length>160)||new Set(items).size!==items.length)fail();
 const ids=new Set(),counts={active:0,pending_start:0,inactive:0,state_error:0};
 for(const r of value.rows){
  if(!exact(r,NATIVE_ROSTER_FIELDS)||!uuid(r.contractId)||!uuid(r.registrationId)||ids.has(r.contractId.toLowerCase())||typeof r.legajo!=='string'||!/^[1-9]\d{0,8}$/.test(r.legajo)||typeof r.name!=='string'||!r.name.trim()||r.name.length>160||typeof r.dni!=='string'||!/^\d{5,8}$/.test(r.dni)||/^0+$/.test(r.dni)||typeof r.cuil!=='string'||!/^\d{11}$/.test(r.cuil)||!['F','M','X',null].includes(r.sexCode)||!isoDay(r.birthDate)||!isoDay(r.startDate)||r.endDate!==null&&!isoDay(r.endDate)||!['42','55',null].includes(r.jurisdictionCode)||!Object.hasOwn(counts,r.status)||!timestamp(r.registeredAt)||!['agreement','category','organization','sector','jobTitle','legalReference'].every(k=>nullableText(r[k])))fail();
  if(filters.status!=='all'&&r.status!==filters.status||filters.jurisdiction&&(filters.jurisdiction==='not_reported'?r.jurisdictionCode!==null:r.jurisdictionCode!==filters.jurisdiction)||['organization','sector','agreement'].some(k=>filters[k]&&r[k]!==filters[k])||r.status==='pending_start'&&r.startDate<=value.today||r.status==='active'&&r.startDate>value.today)fail();
  ids.add(r.contractId.toLowerCase());counts[r.status]++;
 }
 if(Object.keys(counts).some(k=>value.counts[k]!==counts[k]))fail();
 const result=freeze(structuredClone(value));verified.add(result);return result;
}
export function requireNativeRoster(value){if(!verified.has(value))fail();return value;}
