import {DECLARED_ADOPTION_INPUT_VERSION} from './employment-source-declarations.js';
import {adoptionProposalInput,adoptionReviewInput,adoptionReceipt,AdoptionInputError} from './employment-adoption-contract.js';
import {verifiedAdoptionReview,adoptionReviewHash,adoptionReviewScope,adoptionReviewJson} from './employment-adoption-review-model.js';
import {adoptionAttemptKey,adoptionSelectionVersion} from './employment-adoption-preparation-model.js';
export const MUNICIPAL_ADOPTION_OPERATOR_VERSION='municipal-adoption-operator.v1';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'))&&Reflect.ownKeys(v).every(k=>keys.includes(k));
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),fail=()=>{throw new AdoptionInputError('CONTRACT_INVALID','No se pudo verificar la revisión completa. Consultá nuevamente.');};
const base=(v,fields)=>{if(!exact(v,['version','scope',...fields])||v.version!==MUNICIPAL_ADOPTION_OPERATOR_VERSION)fail();adoptionReviewScope(v.scope);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function municipalAdoptionQueue(v){
 base(v,['total','rows']);if(!Number.isSafeInteger(v.total)||v.total<0||v.total>500||!Array.isArray(v.rows)||v.rows.length!==v.total)fail();
 const seen=new Set();for(const r of v.rows){if(!exact(r,['proposal','independent'])||typeof r.independent!=='boolean')fail();const p=adoptionReceipt(r.proposal);if(seen.has(p.proposalId.toLowerCase()))fail();seen.add(p.proposalId.toLowerCase());}
 return freeze(v);
}
export async function municipalAdoptionDetail(v){
 base(v,['proposal','body','review','reviewVersion','current','applicationAvailable']);
 const p=adoptionReceipt(v.proposal),body=adoptionProposalInput(v.body),review=await verifiedAdoptionReview(v.review);
 if(!sha(v.reviewVersion)||typeof v.current!=='boolean'||v.applicationAvailable!==true||p.total!==review.total||body.rows.length!==review.total
 ||p.sourceContextVersion!==body.sourceContextVersion||review.sourceContextVersion!==body.sourceContextVersion||p.catalogVersion!==body.catalogVersion
 ||p.proposalVersion!==v.proposal.proposalVersion||body.selectionVersion!==await adoptionSelectionVersion(review)
 ||['tenantId','bindingId','companyId'].some(k=>v.scope[k]!==review.scope[k]))fail();
 if(body.version===DECLARED_ADOPTION_INPUT_VERSION&&adoptionReviewJson(body.declarations)!==adoptionReviewJson(review.source.municipalDeclarations?.rows))fail();
 for(let n=0;n<body.rows.length;n++){const r=body.rows[n],s=review.rows[n];if(r.contractId!==s.contractId||r.contractVersion!==s.contractVersion||s.jurisdictionCode!==null&&r.jurisdictionCode!==s.jurisdictionCode)fail();}
 return freeze({...v,proposal:p,body,review});
}
export function municipalAdoptionCommand(v){
 if(!exact(v,['reviewVersion','review','reviewConfirmed'])||!sha(v.reviewVersion)||v.reviewConfirmed!==true)throw new AdoptionInputError('INPUT_INVALID','Revisá todos los contratos y confirmá la decisión.');
 return freeze({reviewVersion:v.reviewVersion,review:adoptionReviewInput(v.review),reviewConfirmed:true});
}
export async function municipalAdoptionAttempt(v,expected={}){
 base(v,['requestKey','bodySha256','receipt']);if(!adoptionAttemptKey(v.requestKey)||!sha(v.bodySha256)||expected.key&&expected.key!==v.requestKey)fail();
 const receipt=adoptionReceipt(v.receipt,{operation:'review',...(expected.body?{proposalId:expected.body.review.proposalId,proposalVersion:expected.body.review.proposalVersion,sourceContextVersion:expected.body.review.sourceContextVersion,catalogVersion:expected.body.review.catalogVersion,status:expected.body.review.decision==='approve'?'approved':'rejected'}:{})});
 if(expected.body&&v.bodySha256!==await adoptionReviewHash(municipalAdoptionCommand(expected.body)))fail();return freeze({...v,receipt});
}
