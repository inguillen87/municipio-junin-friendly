// Explicit municipal facts. No defaults, source repair, identity lookup or writes.
export const SOURCE_DECLARATIONS_VERSION='municipal-source-declarations.v1';
export const DECLARED_ADOPTION_INPUT_VERSION='employment-adoption-input.v5';
export const DECLARED_ADOPTION_REVIEW_VERSION='employment-adoption-review.v4';
export const DECLARED_ADOPTION_PREPARATION_VERSION='employment-adoption-preparation.v5';
export class SourceDeclarationError extends Error{constructor(){super('Revisá los datos faltantes y su documento de respaldo. No se sustituyeron valores de la fuente.');this.code='INPUT_INVALID';}}
const fail=()=>{throw new SourceDeclarationError();};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const day=v=>typeof v==='string'&&/^(?!0000)\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const documentText=(v,min,max)=>{if(typeof v!=='string'||v!==v.normalize('NFC').trim()||[...v].length<min||[...v].length>max||/[<>\u0000-\u001f\u007f-\u009f]/u.test(v))fail();return v;};
const fields=['startDate','agreementCode','categoryCode','jurisdictionCode'];
export function sourceDeclarations(v){
 if(!Array.isArray(v)||!v.length||v.length>10000)fail();const seen=new Set();
 return Object.freeze(v.map(d=>{
  if(!exact(d,['contractId','values','reference','reason'])||typeof d.contractId!=='string'||!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(d.contractId)||seen.has(d.contractId.toLowerCase())||!d.values||!exact(d.values,Object.keys(d.values))||!Object.keys(d.values).length||Object.keys(d.values).some(k=>!fields.includes(k)))fail();
  seen.add(d.contractId.toLowerCase());for(const [k,value]of Object.entries(d.values))if(k==='startDate'?!day(value):k==='jurisdictionCode'?!['42','55'].includes(value):typeof value!=='string'||!/^\d{1,9}$/.test(value))fail();
  return Object.freeze({contractId:d.contractId,values:Object.freeze({...d.values}),reference:documentText(d.reference,3,180),reason:documentText(d.reason,10,1000)});
 }));
}
export function verifySourceDeclarations(rows,declarations,today){
 const result=sourceDeclarations(declarations),byId=new Map(rows.map(r=>[r.contractId.toLowerCase(),r]));
 for(const d of result){const r=byId.get(d.contractId.toLowerCase());if(!r||r.status!=='active')fail();
  for(const [k,value]of Object.entries(d.values))if(r[k]!==null||!(r.sourceIssues??[]).includes(k==='startDate'?'START_DATE_MISSING':k==='jurisdictionCode'?'JURISDICTION_MISSING_ACTIVE':'CLASSIFICATION_MISSING')||k==='startDate'&&(!day(today)||value>today))fail();
 }
 return result;
}
