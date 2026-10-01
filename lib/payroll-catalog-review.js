import {verifyCatalogResponse} from './payroll-catalog-contract.js';
import {verifiedParameterProposal, parameterPreview, PARAMETER_SOURCE_SHA} from './payroll-parameter-contract.js';

const uuid=value=>typeof value==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const requireValue=value=>{if(!value)throw Error('La confirmación del catálogo no corresponde a la revisión. Volvé a consultar.');};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const reviews=new WeakSet();

export function catalogScope(principal){
  requireValue(principal&&['tenantId','membershipId','certifiedBindingId'].every(key=>uuid(principal[key]))&&Array.isArray(principal.capabilities));
  return ['tenantId','membershipId','certifiedBindingId'].map(key=>principal[key].toLowerCase()).join('|');
}
export function catalogActivationReview(envelope,proposal,scopeKey){
  verifyCatalogResponse(envelope);verifiedParameterProposal(proposal);
  const preview=envelope.preview;
  requireValue(typeof scopeKey==='string'&&scopeKey.length>0&&preview?.canActivate&&proposal.status==='approved'
    &&preview.proposalId===proposal.id&&preview.proposalVersion===proposal.version
    &&preview.validFrom===proposal.draft.validFrom&&preview.sourceReference===proposal.draft.sourceReference);
  const {rows,sourceSha256,applied,currentCatalogVerified,...draft}=proposal.draft;
  const expected=parameterPreview(draft);
  requireValue(expected.length===preview.changes.length&&expected.every(row=>{
    const observed=preview.changes.find(value=>value.agreementId===row.agreementId);
    return observed&&Object.keys(row).every(key=>row[key]===observed[key]);
  }));
  const review=freeze(structuredClone({preview,proposal,scopeKey}));reviews.add(review);return review;
}
export function sameCatalogActivationReview(review,envelope,proposal){
  requireValue(reviews.has(review));
  const fresh=catalogActivationReview(envelope,proposal,review.scopeKey);
  return equal(review.preview,fresh.preview)&&equal(review.proposal.draft,fresh.proposal.draft);
}
export function catalogActivationAttempt(review,key){
  requireValue(reviews.has(review)&&uuid(key));
  const payload={proposalId:review.preview.proposalId,proposalVersion:review.preview.proposalVersion,catalogRevision:review.preview.catalogRevision};
  return freeze({command:'activate',payload,key,scopeKey:review.scopeKey,body:JSON.stringify({command:'activate',payload}),review});
}
export function assertCatalogActivationInput(result,payload){
  verifyCatalogResponse(result);
  requireValue(result.activation&&result.activation.proposalId.toLowerCase()===payload.proposalId.toLowerCase()
    &&result.activation.proposalVersion===payload.proposalVersion&&result.activation.revision===payload.catalogRevision+1);
  return result;
}
export function assertCatalogActivationReceipt(result,attempt){
  requireValue(reviews.has(attempt?.review));assertCatalogActivationInput(result,attempt.payload);
  const {preview,proposal}=attempt.review,activation=result.activation;
  requireValue(activation.validFrom===preview.validFrom&&activation.activatedAt.length>0);
  const rows=result.catalog.rows.filter(row=>row.activationId===activation.id);
  requireValue(rows.length===preview.changes.length&&preview.changes.every(change=>{
    const row=rows.find(value=>value.agreementId===change.agreementId);
    return row&&['agreementId','auxiliaryId','baseClass','newValueCents','referenceConceptId'].every(key=>row[key]===change[key])
      &&row.ruleId===proposal.draft.ruleId&&row.sourceSha256===PARAMETER_SOURCE_SHA
      &&row.sourceReference===preview.sourceReference&&row.validFrom===preview.validFrom
      &&row.proposalId===activation.proposalId&&row.proposalVersion===activation.proposalVersion
      &&row.activationRevision===activation.revision&&row.activatedAt===activation.activatedAt;
  }));
  return result;
}
