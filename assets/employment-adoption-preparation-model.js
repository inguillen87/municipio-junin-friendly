import {DECLARED_ADOPTION_INPUT_VERSION,DECLARED_ADOPTION_PREPARATION_VERSION} from './employment-source-declarations.js';
import {adoptionProposalInput,adoptionReceipt,AdoptionInputError,adoptionUuid,ADOPTION_PENDING_INPUT_VERSION,ADOPTION_FINAL_INPUT_VERSION,ADOPTION_ACTIVE_INPUT_VERSION,ADOPTION_ACTIVE_COHORT} from './employment-adoption-contract.js';
import {verifiedAdoptionReview,adoptionReviewHash,civilDay} from './employment-adoption-review-model.js';
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
export async function adoptionPreparationPayload(review,catalogVersion,jurisdictionCode,legalReference,reason,options={}){
 const r=await verifiedAdoptionReview(review);
 if(!exact(options,Object.keys(options??{}))||Object.keys(options).some(k=>k!=='allowInactivePending')||Object.hasOwn(options,'allowInactivePending')&&typeof options.allowInactivePending!=='boolean')fail();
 const declared=Boolean(r.source.municipalDeclarations),active=Boolean(r.source.operationalCohort),final=Boolean(r.source.finalRevision),pending=final||options.allowInactivePending===true;
 if(final&&r.rows.some(row=>row.sourceIssues.length))throw new AdoptionInputError('INPUT_INVALID','El corte final conserva incidencias pendientes. Revisá los antecedentes antes de preparar la adopción completa.');
 let rows;
 if(typeof jurisdictionCode==='string'){
  if(!['42','55',...(pending?['']:[])].includes(jurisdictionCode))throw new AdoptionInputError('INPUT_INVALID','Elegí expresamente la jurisdicción de los contratos que no la tienen declarada.');
  rows=r.rows.map(row=>({contractId:row.contractId,jurisdictionCode:row.jurisdictionCode??(pending&&adoptionInactiveJurisdictionPending(row,r.today)?null:jurisdictionCode)}));
 }else{
  // A declaration belongs to one complete review, including inactive contracts.
  // Existing declarations remain immutable; search/pagination cannot supply a subset.
  if(!exact(jurisdictionCode,['snapshot','rows'])||jurisdictionCode.snapshot!==r.snapshot||!Array.isArray(jurisdictionCode.rows)||jurisdictionCode.rows.length!==r.total)fail();
  rows=jurisdictionCode.rows;
  for(const [n,row]of rows.entries())if(!exact(row,['contractId','jurisdictionCode'])||row.contractId!==r.rows[n].contractId||r.rows[n].jurisdictionCode!==null&&row.jurisdictionCode!==r.rows[n].jurisdictionCode)fail();
 }
 for(const [n,row]of rows.entries())if(!['42','55'].includes(row.jurisdictionCode)&&!(pending&&row.jurisdictionCode===null&&adoptionInactiveJurisdictionPending(r.rows[n],r.today)))fail();
 return adoptionProposalInput({...(pending?{version:declared?DECLARED_ADOPTION_INPUT_VERSION:active?ADOPTION_ACTIVE_INPUT_VERSION:final?ADOPTION_FINAL_INPUT_VERSION:ADOPTION_PENDING_INPUT_VERSION}:{}),...(final?{finalSource:{revisionId:r.source.finalRevision.revisionId,packageSha256:r.source.finalRevision.packageSha256}}:{}),...(active?{cohort:ADOPTION_ACTIVE_COHORT}:{}),...(declared?{declarations:r.source.municipalDeclarations.rows}:{}),sourceContextVersion:r.sourceContextVersion,selectionVersion:await adoptionSelectionVersion(r),catalogVersion,rows:rows.map((row,n)=>({...row,contractVersion:r.rows[n].contractVersion})),legalReference,reason});
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
 if(!exact(value,['version','review','catalogVersion','canPrepare','applicationAvailable','attempts'])||![ADOPTION_PREPARATION_VERSION,ADOPTION_PENDING_PREPARATION_VERSION,ADOPTION_FINAL_PREPARATION_VERSION,ADOPTION_ACTIVE_PREPARATION_VERSION,DECLARED_ADOPTION_PREPARATION_VERSION].includes(value.version)||!hash(value.catalogVersion)||typeof value.canPrepare!=='boolean'||value.applicationAvailable!==false||!Array.isArray(value.attempts)||value.attempts.length>500)fail();
 const review=await verifiedAdoptionReview(value.review),attempts=await Promise.all(value.attempts.map(v=>adoptionPreparationReceipt(v))),seen=new Set();
 if([ADOPTION_FINAL_PREPARATION_VERSION,ADOPTION_ACTIVE_PREPARATION_VERSION,DECLARED_ADOPTION_PREPARATION_VERSION].includes(value.version)!==Boolean(review.source.finalRevision)||[ADOPTION_ACTIVE_PREPARATION_VERSION,DECLARED_ADOPTION_PREPARATION_VERSION].includes(value.version)!==Boolean(review.source.operationalCohort)||(value.version===DECLARED_ADOPTION_PREPARATION_VERSION)!==Boolean(review.source.municipalDeclarations))fail();
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
