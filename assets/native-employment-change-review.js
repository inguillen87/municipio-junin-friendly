import {changeAttemptKey,changeProposalInput,changeReviewInput,changeDiff,validateChangeBootstrap,validateChangeProposal,validateChangeReceipt} from './native-employment-change-model.js';

const reviews=new WeakSet();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
const requireValue=value=>{if(!value)throw Object.assign(Error('La confirmación no corresponde a la rectificación revisada. Consultá el mismo intento.'),{code:'RESPONSE_INVALID',status:503});};
const fields=['agreementCode','categoryCode','organizationId','sectorCode','jobTitle'];
function expectedLabels(values,items){return Object.fromEntries([['agreementCode','agreements','agreementName'],['categoryCode','categories','categoryName'],['organizationId','organizations','organizationName'],['sectorCode','sectors','sectorName']].map(([field,kind,label])=>{
 const matches=items.filter(row=>row.kind===kind&&row.code===values[field]&&(kind!=='categories'||row.agreementCode===values.agreementCode));requireValue(matches.length===1);return [label,matches[0].label];
}));}
export function reviewedChangeAttempt(body,bootstrap,proposal,key){
 requireValue(changeAttemptKey(key)&&['propose','review'].includes(body?.operation));
 const payload=body.operation==='propose'?changeProposalInput(body.payload):changeReviewInput(body.payload);
 validateChangeBootstrap(bootstrap,payload.contractId);requireValue(bootstrap.scopeVersion===payload.scopeVersion);
 if(body.operation==='propose'){
  requireValue(bootstrap.permissions.canPropose&&payload.identityToken===bootstrap.subject.identityToken&&payload.baseVersion===bootstrap.employment.version&&payload.catalogVersion===bootstrap.catalog.version&&changeDiff(bootstrap.employment.values,payload.values).length>0);
  expectedLabels(payload.values,bootstrap.catalog.items);
 }else{
  validateChangeProposal({version:bootstrap.version,proposal},payload.contractId,payload.proposalId);
  requireValue(bootstrap.permissions.canReview&&proposal.canReview&&proposal.status==='pending'&&same(proposal.subject,bootstrap.subject));
  if(payload.decision==='approve')requireValue(proposal.baseVersion===bootstrap.employment.version&&proposal.catalogVersion===bootstrap.catalog.version&&same(proposal.before,{values:bootstrap.employment.values,labels:bootstrap.employment.labels}));
 }
 const input={operation:body.operation,payload},attempt=frozen(structuredClone({key,body:input,bytes:JSON.stringify(input),bootstrap,proposal:proposal??null}));reviews.add(attempt);return attempt;
}
export function assertChangeAttemptFresh(attempt,bootstrap,proposal){
 requireValue(reviews.has(attempt));validateChangeBootstrap(bootstrap,attempt.body.payload.contractId);
 const fresh=value=>{if(!value)throw Object.assign(Error('La propuesta o su contexto cambió. Volvé a consultar la comparación antes de decidir.'),{code:'REVIEW_CHANGED',status:409});};
 fresh(bootstrap.scopeVersion===attempt.body.payload.scopeVersion&&same(bootstrap.subject,attempt.bootstrap.subject));
 if(attempt.body.operation==='propose')fresh(bootstrap.permissions.canPropose&&same(bootstrap.employment,attempt.bootstrap.employment)&&same(bootstrap.catalog,attempt.bootstrap.catalog));
 else{
  validateChangeProposal({version:bootstrap.version,proposal},attempt.body.payload.contractId,attempt.body.payload.proposalId);
  fresh(bootstrap.permissions.canReview&&proposal.canReview&&same(proposal,attempt.proposal));
  if(attempt.body.payload.decision==='approve')fresh(same(bootstrap.employment,attempt.bootstrap.employment)&&same(bootstrap.catalog,attempt.bootstrap.catalog));
 }
 return attempt;
}
export function assertChangeAttemptReceipt(receipt,attempt,envelope,bootstrap){
 requireValue(reviews.has(attempt));const {operation,payload}=attempt.body;
 validateChangeReceipt(receipt,payload.contractId);validateChangeBootstrap(bootstrap,payload.contractId);validateChangeProposal(envelope,payload.contractId,receipt.proposalId);
 const p=envelope.proposal;requireValue(receipt.operation===operation&&bootstrap.scopeVersion===payload.scopeVersion&&same(p.subject,attempt.bootstrap.subject));
 if(operation==='propose'){
  requireValue(receipt.status==='pending'&&receipt.employmentVersion===payload.baseVersion&&receipt.revision===attempt.bootstrap.employment.revision&&p.baseVersion===payload.baseVersion&&p.catalogVersion===payload.catalogVersion&&p.reason===payload.reason&&p.legalReference===payload.legalReference&&same(p.before,{values:attempt.bootstrap.employment.values,labels:attempt.bootstrap.employment.labels}));
  requireValue(fields.every(field=>p.after.values[field]===payload.values[field])&&same(p.after.labels,expectedLabels(payload.values,attempt.bootstrap.catalog.items)));
 }else{
  const expected=payload.decision==='approve'?'approved':'rejected';requireValue(receipt.proposalId.toLowerCase()===payload.proposalId&&receipt.status===expected&&p.status===expected&&p.review?.decision===payload.decision&&p.review.reason===payload.reason);
  for(const key of ['subject','baseVersion','catalogVersion','before','after','reason','legalReference','createdAt','authorLabel'])requireValue(same(p[key],attempt.proposal[key]));
  if(expected==='approved'){
   requireValue(receipt.revision===attempt.bootstrap.employment.revision+1&&bootstrap.employment.revision>=receipt.revision);
   if(bootstrap.employment.revision===receipt.revision)requireValue(bootstrap.employment.version===receipt.employmentVersion&&same({values:bootstrap.employment.values,labels:bootstrap.employment.labels},p.after));
  }
 }
 return receipt;
}
