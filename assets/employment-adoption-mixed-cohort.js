// A new, explicit source version. Earlier proposals and cohort contracts stay immutable.
export const MIXED_ADOPTION_INPUT_VERSION='employment-adoption-input.v8';
export const MIXED_ADOPTION_PREPARATION_VERSION='employment-adoption-preparation.v8';
export const MIXED_ADOPTION_REVIEW_VERSION='employment-adoption-review.v5';
export const MIXED_ADOPTION_COHORT='active-known-with-entry.v1';
const issueCodes=new Set(['CONTRACT_NOT_FOUND','START_DATE_MISSING','DATE_INVALID','PERIOD_INVALID','STATUS_DATE_CONFLICT','CLASSIFICATION_MISSING','JURISDICTION_MISSING_ACTIVE','JURISDICTION_UNKNOWN','ACTIVE_STATE_CONFLICT','SOURCE_FACTS_MISSING','SOURCE_KEY_INVALID','CORE_RECORD_MISSING','CORE_RECORD_AMBIGUOUS','PERSON_LINK_MISSING','PERSON_LINK_AMBIGUOUS','PERSON_FACTS_CHANGED','JURISDICTION_CONFLICT','CONTRACT_SCOPE_CONFLICT','CONTRACT_AMBIGUOUS']);
const fail=()=>{throw Object.assign(new Error('La cobertura completa del padrón no pudo verificarse.'),{code:'MIXED_ADOPTION_COHORT_INVALID'});};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k)&&Object.hasOwn(Object.getOwnPropertyDescriptor(v,k),'value'));
const sha=v=>typeof v==='string'&&v.length===64&&/^[a-f0-9]{64}$/.test(v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
/** Counts cover every source row, including pending identities. No identity is guessed here. */
export function mixedAdoptionCohort(value){
 const keys=['version','sourceTotal','knownTotal','selectedTotal','archivedTotal','deferredTotal','pendingTotal','adoptedTotal','deferredSourceRowNumbers','pendingSourceRows','adoptedSourceRowNumbers'];
 if(!exact(value,keys)||value.version!==MIXED_ADOPTION_COHORT||keys.slice(1,8).some(k=>!Number.isSafeInteger(value[k])||value[k]<0||value[k]>10000)||value.sourceTotal<1||value.knownTotal+value.pendingTotal!==value.sourceTotal||value.selectedTotal+value.archivedTotal+value.deferredTotal+value.adoptedTotal!==value.knownTotal)fail();
 const seen=new Set(),rowKeys=new Set();const rowNumber=n=>{if(!Number.isSafeInteger(n)||n<1||n>value.sourceTotal||seen.has(n))fail();seen.add(n);};
 for(const[countKey,arrayKey]of[['deferredTotal','deferredSourceRowNumbers'],['adoptedTotal','adoptedSourceRowNumbers']]){if(!Array.isArray(value[arrayKey])||value[arrayKey].length!==value[countKey])fail();let previous=0;for(const n of value[arrayKey]){rowNumber(n);if(n<=previous)fail();previous=n;}}
 if(!Array.isArray(value.pendingSourceRows)||value.pendingSourceRows.length!==value.pendingTotal)fail();let previous=0;
 for(const row of value.pendingSourceRows){if(!exact(row,['rowKey','sourceRowNumber','factsSha256','reasons'])||!sha(row.rowKey)||!sha(row.factsSha256)||rowKeys.has(row.rowKey)||!Array.isArray(row.reasons)||row.reasons.length<1||row.reasons.length>issueCodes.size||new Set(row.reasons).size!==row.reasons.length||!row.reasons.includes('CONTRACT_NOT_FOUND')||row.reasons.some(c=>!issueCodes.has(c)))fail();rowKeys.add(row.rowKey);rowNumber(row.sourceRowNumber);if(row.sourceRowNumber<=previous)fail();previous=row.sourceRowNumber;}
 return freeze(structuredClone(value));
}
