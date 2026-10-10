// Registry ownership preserves sealed source facts. It never supplies salary inputs.
export const REGISTRY_ADOPTION_INPUT_VERSION='employment-adoption-input.v6';
export const REGISTRY_ADOPTION_PREPARATION_VERSION='employment-adoption-preparation.v6';
export const REGISTRY_SOURCE_FACTS_POLICY='preserve-original-pending.v1';
const allowed=new Set(['START_DATE_MISSING','CLASSIFICATION_MISSING','JURISDICTION_MISSING_ACTIVE']);
const own=(v,k)=>Object.hasOwn(v,k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value');
const day=v=>typeof v==='string'&&/^(?!0000)\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
export function originalRegistryFactsAllowed(row){
 if(!row||typeof row!=='object'||Array.isArray(row)||![Object.prototype,null].includes(Object.getPrototypeOf(row))
 ||!['status','startDate','endDate','agreementCode','categoryCode','jurisdictionCode','sourceIssues'].every(k=>own(row,k)))return false;
 const issues=row.sourceIssues;
 if(row.status!=='active'||row.endDate!==null||!Array.isArray(issues)||new Set(issues).size!==issues.length||issues.some(v=>!allowed.has(v)))return false;
 if(row.startDate!==null&&!day(row.startDate)||[row.agreementCode,row.categoryCode].some(v=>v!==null&&(typeof v!=='string'||!v.trim()))
 ||row.jurisdictionCode!==null&&!['42','55'].includes(row.jurisdictionCode))return false;
 return issues.includes('START_DATE_MISSING')===(row.startDate===null)
 &&issues.includes('CLASSIFICATION_MISSING')===(row.agreementCode===null||row.categoryCode===null)
 &&issues.includes('JURISDICTION_MISSING_ACTIVE')===(row.jurisdictionCode===null);
}
export function originalRegistryFactsCounts(rows){
 if(!Array.isArray(rows)||!rows.every(originalRegistryFactsAllowed))throw Error('El padrón contiene incidencias que requieren resolución antes de incorporarlo.');
 return Object.freeze({total:rows.length,pending:rows.filter(r=>r.sourceIssues.length).length,
  startDate:rows.filter(r=>r.startDate===null).length,classification:rows.filter(r=>r.agreementCode===null||r.categoryCode===null).length,
  jurisdiction:rows.filter(r=>r.jurisdictionCode===null).length});
}
