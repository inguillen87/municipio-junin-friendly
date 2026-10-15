import {DECLARED_ADOPTION_INPUT_VERSION,DECLARED_ADOPTION_PREPARATION_VERSION} from './employment-source-declarations.js';
import {REGISTRY_ADOPTION_INPUT_VERSION,REGISTRY_ADOPTION_PREPARATION_VERSION,REGISTRY_SOURCE_FACTS_POLICY,originalRegistryFactsAllowed} from './employment-adoption-original-facts.js';
import {OPERATIONAL_ADOPTION_INPUT_VERSION,OPERATIONAL_ADOPTION_PREPARATION_VERSION,OPERATIONAL_ADOPTION_COHORT,operationalAdoptionCohort} from './employment-adoption-operational-cohort.js';
import {MIXED_ADOPTION_INPUT_VERSION,MIXED_ADOPTION_PREPARATION_VERSION,MIXED_ADOPTION_COHORT} from './employment-adoption-mixed-cohort.js';
import {adoptionProposalInput,adoptionReceipt,AdoptionInputError,adoptionUuid,ADOPTION_PENDING_INPUT_VERSION,ADOPTION_FINAL_INPUT_VERSION,ADOPTION_ACTIVE_INPUT_VERSION,ADOPTION_ACTIVE_COHORT} from './employment-adoption-contract.js';
import {verifiedAdoptionReview,adoptionReviewHash,adoptionReviewJson,civilDay} from './employment-adoption-review-model.js';
export const ADOPTION_PREPARATION_VERSION='employment-adoption-preparation.v1';
export const ADOPTION_PENDING_PREPARATION_VERSION='employment-adoption-preparation.v2';
export const ADOPTION_FINAL_PREPARATION_VERSION='employment-adoption-preparation.v3';
export const ADOPTION_ACTIVE_PREPARATION_VERSION='employment-adoption-preparation.v4';
export function adoptionInactiveJurisdictionPending(row,today){return row.jurisdictionCode===null&&row.status==='inactive'&&civilDay(today)&&civilDay(row.endDate)&&row.endDate<today&&(row.startDate===null||civilDay(row.startDate)&&row.startDate<=row.endDate);}
export const adoptionAttemptKey=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=()=>{throw new AdoptionInputError('CONTRACT_INVALID','No se pudo verificar la propuesta completa. Consultá el mismo intento.');};
export async function adoptionSelectionVersion(review){const r=await verifiedAdoptionReview(review);return adoptionReviewHash(r.rows.map(({contractId,contractVersion})=>({contractId,contractVersion})));}
export async function operationalAdoptionTransition(before,after){
 const b=await verifiedAdoptionReview(before),a=await verifiedAdoptionReview(after),bc=b.source.operationalCohort,ac=a.source.operationalCohort;
 if(!operationalAdoptionCohort(ac)||b.source.municipalDeclarations||adoptionReviewJson(b.scope)!==adoptionReviewJson(a.scope)||b.today!==a.today)fail();
 if(operationalAdoptionCohort(bc)){if(b.snapshot!==a.snapshot)fail();return a;}
 if(bc?.version!==ADOPTION_ACTIVE_COHORT)fail();
 const source=r=>{const{operationalCohort,...rest}=r.source;return rest;};
 if(adoptionReviewJson(source(b))!==adoptionReviewJson(source(a))||bc.sourceTotal!==ac.sourceTotal||bc.archivedTotal!==ac.archivedTotal)fail();
 const pending=b.rows.filter(r=>r.startDate===null),selected=b.rows.filter(r=>r.startDate!==null);
 if(!pending.every(originalRegistryFactsAllowed)||ac.deferredTotal!==pending.length||adoptionReviewJson(ac.deferredSourceRowNumbers)!==adoptionReviewJson(pending.map(r=>r.sourceRowNumber))||a.total!==selected.length)fail();
 const original=r=>{const{rowNumber,contractVersion,observations,...rest}=r;return rest;};
 for(const[n,row]of a.rows.entries())if(adoptionReviewJson(original(row))!==adoptionReviewJson(original(selected[n])))fail();
 return a;
}
export async function adoptionPreparationPayload(review,catalogVersion,jurisdictionCode,legalReference,reason,options={}){
 const r=await verifiedAdoptionReview(review);
 if(!exact(options,Object.keys(options??{}))||Object.keys(options).some(k=>!['allowInactivePending','preserveOriginalFacts'].includes(k))||Object.values(options).some(v=>typeof v!=='boolean'))fail();
 const declared=Boolean(r.source.municipalDeclarations),active=Boolean(r.source.operationalCohort),final=Boolean(r.source.finalRevision),pending=final||options.allowInactivePending===true;
 const registry=options.preserveOriginalFacts===true,operative=operationalAdoptionCohort(r.source.operationalCohort),mixed=r.source.operationalCohort?.version===MIXED_ADOPTION_COHORT;
 if((operative||mixed)&&registry)throw new AdoptionInputError('INPUT_INVALID','El alcance operativo conserva los pendientes aparte; no cambia la política de una propuesta anterior.');
 if(registry&&(!active||!final||declared||!r.rows.every(originalRegistryFactsAllowed)))throw new AdoptionInputError('INPUT_INVALID','La incorporación exige todo el padrón activo original y sus antecedentes verificados.');
 if(final&&!registry&&r.rows.some(row=>row.sourceIssues.length))throw new AdoptionInputError('INPUT_INVALID','El corte final conserva incidencias pendientes. Revisá los antecedentes antes de preparar la adopción completa.');
 let rows;
 if(registry){
  if(jurisdictionCode!==null)throw new AdoptionInputError('INPUT_INVALID','La incorporación conserva las jurisdicciones originales, incluidas las pendientes.');
  rows=r.rows.map(row=>({contractId:row.contractId,jurisdictionCode:row.jurisdictionCode}));
 }else if(typeof jurisdictionCode==='string'){
  if(!['42','55',...(pending?['']:[])].includes(jurisdictionCode))throw new AdoptionInputError('INPUT_INVALID','Elegí expresamente la jurisdicción de los contratos que no la tienen declarada.');
  rows=r.rows.map(row=>({contractId:row.contractId,jurisdictionCode:row.jurisdictionCode??(pending&&adoptionInactiveJurisdictionPending(row,r.today)?null:jurisdictionCode)}));
 }else{
  // A declaration belongs to one complete review, including inactive contracts.
  // Existing declarations remain immutable; search/pagination cannot supply a subset.
  if(!exact(jurisdictionCode,['snapshot','rows'])||jurisdictionCode.snapshot!==r.snapshot||!Array.isArray(jurisdictionCode.rows)||jurisdictionCode.rows.length!==r.total)fail();
  rows=jurisdictionCode.rows;
  for(const [n,row]of rows.entries())if(!exact(row,['contractId','jurisdictionCode'])||row.contractId!==r.rows[n].contractId||r.rows[n].jurisdictionCode!==null&&row.jurisdictionCode!==r.rows[n].jurisdictionCode)fail();
 }
 for(const [n,row]of rows.entries())if(!['42','55'].includes(row.jurisdictionCode)&&!(registry&&row.jurisdictionCode===null||pending&&row.jurisdictionCode===null&&adoptionInactiveJurisdictionPending(r.rows[n],r.today)))fail();
 return adoptionProposalInput({...(pending?{version:mixed?MIXED_ADOPTION_INPUT_VERSION:operative?OPERATIONAL_ADOPTION_INPUT_VERSION:registry?REGISTRY_ADOPTION_INPUT_VERSION:declared?DECLARED_ADOPTION_INPUT_VERSION:active?ADOPTION_ACTIVE_INPUT_VERSION:final?ADOPTION_FINAL_INPUT_VERSION:ADOPTION_PENDING_INPUT_VERSION}:{}),...(final?{finalSource:{revisionId:r.source.finalRevision.revisionId,packageSha256:r.source.finalRevision.packageSha256}}:{}),...(active?{cohort:mixed?MIXED_ADOPTION_COHORT:operative?OPERATIONAL_ADOPTION_COHORT:ADOPTION_ACTIVE_COHORT}:{}),...(declared?{declarations:r.source.municipalDeclarations.rows}:{}),...(registry?{sourceFactsPolicy:REGISTRY_SOURCE_FACTS_POLICY}:{}),sourceContextVersion:r.sourceContextVersion,selectionVersion:await adoptionSelectionVersion(r),catalogVersion,rows:rows.map((row,n)=>({...row,contractVersion:r.rows[n].contractVersion})),legalReference,reason});
}
export async function adoptionPreparationReceipt(value,expected={}){
 if(!exact(expected,Object.keys(expected??{}))||Object.keys(expected).some(k=>!['key','body'].includes(k))||expected.key!==undefined&&!adoptionAttemptKey(expected.key))fail();
 if(!exact(value,['version','requestKey','bodySha256','applicationAvailable','receipt'])||value.version!==ADOPTION_PREPARATION_VERSION||!adoptionAttemptKey(value.requestKey)||!hash(value.bodySha256)||value.applicationAvailable!==false)fail();
 if(expected.key!==undefined&&value.requestKey.toLowerCase()!==expected.key.toLowerCase())fail();
 const input=Object.hasOwn(expected,'body')?adoptionProposalInput(expected.body):null;
 if(input&&value.bodySha256!==await adoptionReviewHash(input))fail();
 const receipt=adoptionReceipt(value.receipt,{operation:'propose',status:'pending',...(input?{total:input.rows.length,sourceContextVersion:input.sourceContextVersion,catalogVersion:input.catalogVersion}:{})});
 return Object.freeze({...value,receipt});
}
export async function adoptionPreparationBootstrap(value){
 if(!exact(value,['version','review','catalogVersion','canPrepare','applicationAvailable','attempts'])||![ADOPTION_PREPARATION_VERSION,ADOPTION_PENDING_PREPARATION_VERSION,ADOPTION_FINAL_PREPARATION_VERSION,ADOPTION_ACTIVE_PREPARATION_VERSION,DECLARED_ADOPTION_PREPARATION_VERSION,REGISTRY_ADOPTION_PREPARATION_VERSION,OPERATIONAL_ADOPTION_PREPARATION_VERSION,MIXED_ADOPTION_PREPARATION_VERSION].includes(value.version)||!hash(value.catalogVersion)||typeof value.canPrepare!=='boolean'||value.applicationAvailable!==false||!Array.isArray(value.attempts)||value.attempts.length>500)fail();
 const review=await verifiedAdoptionReview(value.review),attempts=await Promise.all(value.attempts.map(v=>adoptionPreparationReceipt(v))),seen=new Set();
 if([ADOPTION_FINAL_PREPARATION_VERSION,ADOPTION_ACTIVE_PREPARATION_VERSION,DECLARED_ADOPTION_PREPARATION_VERSION,REGISTRY_ADOPTION_PREPARATION_VERSION,OPERATIONAL_ADOPTION_PREPARATION_VERSION,MIXED_ADOPTION_PREPARATION_VERSION].includes(value.version)!==Boolean(review.source.finalRevision)||[ADOPTION_ACTIVE_PREPARATION_VERSION,DECLARED_ADOPTION_PREPARATION_VERSION,REGISTRY_ADOPTION_PREPARATION_VERSION,OPERATIONAL_ADOPTION_PREPARATION_VERSION,MIXED_ADOPTION_PREPARATION_VERSION].includes(value.version)!==Boolean(review.source.operationalCohort)||(value.version===DECLARED_ADOPTION_PREPARATION_VERSION)!==Boolean(review.source.municipalDeclarations)||(value.version===OPERATIONAL_ADOPTION_PREPARATION_VERSION)!==operationalAdoptionCohort(review.source.operationalCohort)||(value.version===MIXED_ADOPTION_PREPARATION_VERSION)!==(review.source.operationalCohort?.version===MIXED_ADOPTION_COHORT))fail();
 if(value.version===MIXED_ADOPTION_PREPARATION_VERSION&&value.canPrepare&&(review.total===0||review.rows.some(r=>r.sourceIssues.length)))fail();
 if(value.version===REGISTRY_ADOPTION_PREPARATION_VERSION&&value.canPrepare&&!review.rows.every(originalRegistryFactsAllowed))fail();
 for(const a of attempts){if(seen.has(a.requestKey.toLowerCase()))fail();seen.add(a.requestKey.toLowerCase());}
 return Object.freeze({...value,review,attempts:Object.freeze(attempts)});
}
export function adoptionFinalSources(value){
 if(!exact(value,['version','scope','total','rows'])||value.version!=='employment-adoption-final-sources.v1'
 ||!Number.isSafeInteger(value.total)||value.total<0||value.total>1||!Array.isArray(value.rows)||value.rows.length!==value.total
 ||!exact(value.scope,['tenantId','membershipId','bindingId','companyId'])||![value.scope.tenantId,value.scope.membershipId,value.scope.bindingId].every(adoptionUuid)
 ||!Number.isSafeInteger(value.scope.companyId)||value.scope.companyId<1)fail();
 for(const r of value.rows)if(!exact(r,['revisionId','packageSha256','cutoff'])||!adoptionUuid(r.revisionId)||!hash(r.packageSha256)||!civilDay(r.cutoff?.slice(0,10))||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(r.cutoff)||!Number.isFinite(Date.parse(r.cutoff)))fail();
 return Object.freeze({...value,scope:Object.freeze({...value.scope}),rows:Object.freeze(value.rows.map(r=>Object.freeze({...r})))});
}
// The mixed reader admits two explicitly prepared cuts. The legacy v1 reader
// deliberately keeps its original single-cut limit and response contract.
export function adoptionMixedSources(value){
 if(!exact(value,['version','scope','total','rows'])||value.version!=='employment-adoption-final-sources.v2'||!Number.isSafeInteger(value.total)||value.total<0||value.total>2||!Array.isArray(value.rows)||value.rows.length!==value.total)fail();
 adoptionFinalSources({version:'employment-adoption-final-sources.v1',scope:value.scope,total:0,rows:[]});const seen=new Set();
 for(const row of value.rows){adoptionFinalSources({version:'employment-adoption-final-sources.v1',scope:value.scope,total:1,rows:[row]});if(row.revisionId.length!==36||row.packageSha256.length!==64||row.cutoff.length!==19)fail();const id=row.revisionId.toLowerCase();if(seen.has(id))fail();seen.add(id);}
 return Object.freeze({...value,scope:Object.freeze({...value.scope}),rows:Object.freeze(value.rows.map(r=>Object.freeze({...r})))});
}
