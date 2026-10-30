// Candidate v2 read contract. It does not enlarge a writer, capture or group.
// Values are existing technical budgets; none is a salary rule or roster size.
import {FIXED_TYPES,fixedPeriod,fixedCoverage,fixedRegistryRecord,fixedRegistryEffects,fixedSubjectEqual} from './payroll-fixed-novelties-model.js';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export const FIXED_CAPACITY_V2=freeze({
 version:'payroll-fixed-capacity.v2',roots:{basis:'retained_storage_bytes',maxBytes:1056964608},
 history:{maxProposalsPerRoot:100,maxRecordVersion:200},ledger:{maxForcedEntriesPerEmployee:500},
 read:{maxJsonBytes:33554432},capture:{normalMaxBytes:4194304,fullMaxBytes:33554432},
 completion:{normalMaxBytes:4194304,fullMaxBytes:33554432,inputMaxBytes:8388608,resultMaxBytes:33554432,overheadBytes:8192},
 runStorage:{maxCaptures:1000,maxBytes:536870912,maxReservationBytes:41943040}
});
export const FIXED_COMPLETE_JSON='application/vnd.municontrol.payroll-fixed-full.v2+json';
const verified=new WeakSet(),verifiedLists=new WeakSet();
const fail=(code='PAYROLL_FIXED_V2_INVALID')=>{throw Object.assign(Error('No se pudo verificar el registro completo de novedades fijas. Volvé a consultar.'),{code});};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const token=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const text=v=>typeof v==='string'&&v.length>=1&&v.length<=100&&v===v.trim()&&v===v.normalize('NFC')&&!/[<>\x00-\x1f\x7f]/.test(v);
const equal=(a,b)=>{
 if(a===b)return true;if(Array.isArray(b))return Array.isArray(a)&&a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
 if(object(b))return exact(a,Object.keys(b))&&Object.keys(b).every(k=>equal(a[k],b[k]));return false;
};
// JSON from the wire is plain and dense. Do not let custom toJSON/getters,
// symbols, sparse arrays or cycles make the byte check describe another value.
function jsonValue(v,path=new Set()){
 if(v===null||typeof v==='string'||typeof v==='boolean')return;
 if(typeof v==='number'){if(!Number.isSafeInteger(v))fail();return;}
 if(!v||typeof v!=='object'||path.has(v))fail();path.add(v);
 const keys=Reflect.ownKeys(v);if(Array.isArray(v)){
  if(Object.getPrototypeOf(v)!==Array.prototype||keys.length!==v.length+1||!keys.includes('length'))fail();
  for(let i=0;i<v.length;i++){const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value')||!d.enumerable)fail();jsonValue(d.value,path);}
 }else{
  if(!object(v)||keys.some(k=>typeof k!=='string'))fail();
  for(const key of keys){const d=Object.getOwnPropertyDescriptor(v,key);if(!d||!Object.hasOwn(d,'value')||!d.enumerable)fail();jsonValue(d.value,path);}
 }path.delete(v);
}
export function fixedCompleteJsonBytes(payload){
 jsonValue(payload);const bytes=new TextEncoder().encode(JSON.stringify(payload)).byteLength;
 if(bytes>FIXED_CAPACITY_V2.read.maxJsonBytes)throw Object.assign(Error('El registro completo supera la capacidad de lectura. No se omitieron filas.'),{code:'PAYROLL_FIXED_V2_READ_BYTE_LIMIT',dimension:'httpJsonBytes',observedBytes:bytes,maxBytes:FIXED_CAPACITY_V2.read.maxJsonBytes});return bytes;
}
export function fixedCapacityV2(value){if(!equal(value,FIXED_CAPACITY_V2))fail('PAYROLL_FIXED_V2_CAPACITY_CHANGED');return FIXED_CAPACITY_V2;}
function envelope(payload,version,keys){
 if(!exact(payload,['ok','data'])||payload.ok!==true||!exact(payload.data,['version','capacity','complete',...keys])||payload.data.version!==version||payload.data.complete!==true)fail();
 fixedCapacityV2(payload.data.capacity);fixedCompleteJsonBytes(payload);return payload.data;
}
const mark=data=>{freeze(data);verified.add(data);return data;};
export const isVerifiedFixedV2Data=data=>verified.has(data);
function scopeCounts(value,listed,approved){
 if(!exact(value,['retainedRoots','listedRoots','approvedSources']))fail('PAYROLL_FIXED_V2_COUNTS_REQUIRED');
 if(!Number.isSafeInteger(value.retainedRoots)||value.retainedRoots<listed||value.listedRoots!==listed||value.approvedSources!==approved)fail('PAYROLL_FIXED_V2_COUNTS_CHANGED');return {...value};
}
export function fixedBootstrapV2(payload){
 const d=envelope(payload,'payroll-fixed-bootstrap.v2',['principal','payrollTypes','effects']),p=d.principal;
 if(!exact(p,['tenantId','membershipId','certifiedBindingId','capabilities','employmentLinked'])||!uuid(p.tenantId)||!uuid(p.membershipId)||!uuid(p.certifiedBindingId)||!Array.isArray(p.capabilities)||p.capabilities.some(c=>!text(c))||new Set(p.capabilities).size!==p.capabilities.length||typeof p.employmentLinked!=='boolean'||!Array.isArray(d.payrollTypes)||d.payrollTypes.length!==Object.keys(FIXED_TYPES).length||new Set(d.payrollTypes).size!==d.payrollTypes.length||d.payrollTypes.some(t=>!Object.hasOwn(FIXED_TYPES,t)))fail();
 return mark({...d,capacity:FIXED_CAPACITY_V2,principal:{...p,capabilities:[...p.capabilities]},payrollTypes:[...d.payrollTypes],effects:fixedRegistryEffects(d.effects)});
}
export function fixedListV2(payload,periodMonth=null){
 const d=envelope(payload,'payroll-fixed-list.v2',['periodMonth','rows','total','counts','snapshotToken','effects']);
 if(d.periodMonth!==periodMonth||periodMonth!==null&&fixedPeriod(periodMonth)!==periodMonth||!Array.isArray(d.rows)||d.total!==d.rows.length||!token(d.snapshotToken))fail();
 const rows=d.rows.map(fixedRegistryRecord);if(new Set(rows.map(r=>r.id)).size!==rows.length||rows.some(r=>r.version>FIXED_CAPACITY_V2.history.maxRecordVersion))fail();
 if(periodMonth!==null&&rows.some(r=>![r.approved,r.latest].some(p=>p?.values&&fixedCoverage(p.values,periodMonth).intersects)))fail();
 const approved=periodMonth===null?null:rows.filter(r=>r.approved?.operation==='set'&&fixedCoverage(r.approved.values,periodMonth).intersects).length;
 const counts=scopeCounts(d.counts,rows.length,approved),result=mark({...d,capacity:FIXED_CAPACITY_V2,counts,rows,effects:fixedRegistryEffects(d.effects)});verifiedLists.add(result);return result;
}
export function fixedExportV2(payload,list){
 if(!verifiedLists.has(list)||!list.periodMonth)fail('PAYROLL_FIXED_V2_VERIFIED_LIST_REQUIRED');
 const d=envelope(payload,'payroll-fixed-export.v2',['periodMonth','snapshotToken','rows','total','counts','effects']);
 if(d.periodMonth!==list.periodMonth||d.snapshotToken!==list.snapshotToken||!Array.isArray(d.rows)||d.total!==d.rows.length)fail();
 const applicable=list.rows.filter(r=>r.approved?.operation==='set'&&fixedCoverage(r.approved.values,list.periodMonth).intersects),byId=new Map(applicable.map(r=>[r.id,r]));
 if(!equal(d.counts,list.counts)||d.rows.length!==applicable.length||d.rows.length!==d.counts.approvedSources||new Set(d.rows.map(r=>r.recordId)).size!==d.rows.length)fail();
 const rows=d.rows.map(r=>{
  if(!exact(r,['recordId','version','proposalId','subject','values']))fail();const source=byId.get(r.recordId);
  if(!source||!source.identityCurrent||r.version!==source.version||r.proposalId!==source.approved.id||!fixedSubjectEqual(r.subject,source.subject)||!equal(r.values,source.approved.values))fail();
  return {...r,subject:{...r.subject},values:{...r.values}};
 });return mark({...d,capacity:FIXED_CAPACITY_V2,counts:{...d.counts},rows,effects:fixedRegistryEffects(d.effects)});
}
export function fixedJunin638V2(payload,list){
 if(!verifiedLists.has(list)||!list.periodMonth)fail('PAYROLL_FIXED_V2_VERIFIED_LIST_REQUIRED');
 const d=envelope(payload,'payroll-fixed-junin638.v2',['periodMonth','snapshotToken','concept','receiver','sourceFormat','format','rows','total','counts','effects']);
 if(d.periodMonth!==list.periodMonth||d.snapshotToken!==list.snapshotToken||d.concept!=='638'||d.receiver!=='AMARU'||!equal(d.counts,list.counts)
  ||!equal(d.sourceFormat,{id:1,name:'Formato Junin',filename:'amaru.txt',dniStart:5,dniLength:8,amountStart:44,amountLength:11})
  ||!equal(d.format,{recordBytes:55,lineEnding:'CRLF',trailingLineEnding:false})||!Array.isArray(d.rows)||d.total!==d.rows.length)fail();
 const applicable=list.rows.filter(r=>r.approved?.operation==='set'&&r.approved.values.conceptSourceId==='638'&&fixedCoverage(r.approved.values,list.periodMonth).intersects);
 const byId=new Map(applicable.map(r=>[r.id,r]));
 if(d.rows.length!==applicable.length||new Set(d.rows.map(r=>r.recordId)).size!==d.rows.length)fail();
 let previous=null;
 const rows=d.rows.map(r=>{
  if(!exact(r,['recordId','version','proposalId','contractId','dni','amountCents']))fail();
  const source=byId.get(r.recordId),order=typeof r.dni==='string'?r.dni.padStart(8,'0')+r.recordId:'';
  if(!source||!source.identityCurrent||r.version!==source.version||r.proposalId!==source.approved.id||r.contractId!==source.subject.contractId
   ||typeof r.dni!=='string'||!/^\d{5,8}$/.test(r.dni)||/^0+$/.test(r.dni)||typeof r.amountCents!=='string'||!/^(?:0|[1-9][0-9]*)$/.test(r.amountCents)
   ||BigInt(r.amountCents)>9999999999n||r.amountCents!==source.approved.values.amountCents||previous!==null&&order<previous)fail();
  previous=order;return {...r};
 });return mark({...d,capacity:FIXED_CAPACITY_V2,counts:{...d.counts},rows,sourceFormat:{...d.sourceFormat},format:{...d.format},effects:fixedRegistryEffects(d.effects)});
}
