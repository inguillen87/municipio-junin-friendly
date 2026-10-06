import {adoptionProposalInput,adoptionReceipt,AdoptionInputError} from './employment-adoption-contract.js';
import {verifiedAdoptionReview,adoptionReviewHash} from './employment-adoption-review-model.js';
export const ADOPTION_PREPARATION_VERSION='employment-adoption-preparation.v1';
export const adoptionAttemptKey=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=()=>{throw new AdoptionInputError('CONTRACT_INVALID','No se pudo verificar la propuesta completa. Consultá el mismo intento.');};
export async function adoptionSelectionVersion(review){const r=await verifiedAdoptionReview(review);return adoptionReviewHash(r.rows.map(({contractId,contractVersion})=>({contractId,contractVersion})));}
export async function adoptionPreparationPayload(review,catalogVersion,jurisdictionCode,legalReference,reason){
 const r=await verifiedAdoptionReview(review);
 if(!['42','55'].includes(jurisdictionCode))throw new AdoptionInputError('INPUT_INVALID','Elegí expresamente la jurisdicción de los contratos que no la tienen declarada.');
 return adoptionProposalInput({sourceContextVersion:r.sourceContextVersion,selectionVersion:await adoptionSelectionVersion(r),catalogVersion,rows:r.rows.map(row=>({contractId:row.contractId,contractVersion:row.contractVersion,jurisdictionCode:row.jurisdictionCode??jurisdictionCode})),legalReference,reason});
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
 if(!exact(value,['version','review','catalogVersion','canPrepare','applicationAvailable','attempts'])||value.version!==ADOPTION_PREPARATION_VERSION||!hash(value.catalogVersion)||typeof value.canPrepare!=='boolean'||value.applicationAvailable!==false||!Array.isArray(value.attempts)||value.attempts.length>500)fail();
 const review=await verifiedAdoptionReview(value.review),attempts=await Promise.all(value.attempts.map(v=>adoptionPreparationReceipt(v))),seen=new Set();
 for(const a of attempts){if(seen.has(a.requestKey.toLowerCase()))fail();seen.add(a.requestKey.toLowerCase());}
 return Object.freeze({...value,review,attempts:Object.freeze(attempts)});
}
