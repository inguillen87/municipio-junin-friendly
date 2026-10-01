import {lifecycleAttemptKey,lifecycleProposalInput,lifecycleReviewInput,lifecycleAfter,validateLifecycleBootstrap,validateLifecycleProposal,validateLifecycleReceipt} from './native-employment-lifecycle-model.js';
const reviewed=new WeakSet();
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const requireValue=v=>{if(!v)throw Object.assign(Error('La confirmación no corresponde al movimiento revisado. Consultá el mismo intento.'),{code:'RESPONSE_INVALID',status:503});};
export function reviewedLifecycleAttempt(body,bootstrap,proposal,key){
 requireValue(lifecycleAttemptKey(key)&&['propose','review'].includes(body?.operation));
 const payload=body.operation==='propose'?lifecycleProposalInput(body.payload):lifecycleReviewInput(body.payload);
 validateLifecycleBootstrap(bootstrap,payload.contractId);requireValue(bootstrap.scopeVersion===payload.scopeVersion);
 if(body.operation==='propose'){
  requireValue(bootstrap.permissions.canPropose&&payload.identityToken===bootstrap.subject.identityToken&&payload.baseVersion===bootstrap.employment.version);
  lifecycleAfter(bootstrap.employment.intervals,payload.movement,payload.date);
 }else{
  validateLifecycleProposal({version:bootstrap.version,proposal},payload.contractId,payload.proposalId);
  requireValue(bootstrap.permissions.canReview&&proposal.canReview&&proposal.status==='pending'&&same(proposal.subject,bootstrap.subject));
  if(payload.decision==='approve')requireValue(proposal.baseVersion===bootstrap.employment.version&&same(proposal.before.intervals,bootstrap.employment.intervals));
 }
 const input={operation:body.operation,payload},attempt=freeze(structuredClone({key,body:input,bytes:JSON.stringify(input),bootstrap,proposal:proposal??null}));reviewed.add(attempt);return attempt;
}
export function assertLifecycleAttemptFresh(attempt,bootstrap,proposal){
 requireValue(reviewed.has(attempt));validateLifecycleBootstrap(bootstrap,attempt.body.payload.contractId);
 const fresh=v=>{if(!v)throw Object.assign(Error('Cambió el historial o la propuesta. Volvé a consultar antes de decidir.'),{code:'REVIEW_CHANGED',status:409});};
 fresh(bootstrap.scopeVersion===attempt.body.payload.scopeVersion&&same(bootstrap.subject,attempt.bootstrap.subject));
 const employment=e=>({version:e.version,revision:e.revision,appliedAt:e.appliedAt,intervals:e.intervals});
 if(attempt.body.operation==='propose')fresh(bootstrap.permissions.canPropose&&same(employment(bootstrap.employment),employment(attempt.bootstrap.employment)));
 else{
  validateLifecycleProposal({version:bootstrap.version,proposal},attempt.body.payload.contractId,attempt.body.payload.proposalId);
  fresh(bootstrap.permissions.canReview&&proposal.canReview&&same(proposal,attempt.proposal));
  if(attempt.body.payload.decision==='approve')fresh(same(employment(bootstrap.employment),employment(attempt.bootstrap.employment)));
 }
 return attempt;
}
export function assertLifecycleAttemptReceipt(receipt,attempt,envelope,bootstrap){
 requireValue(reviewed.has(attempt));const {operation,payload}=attempt.body;
 validateLifecycleReceipt(receipt,payload.contractId);validateLifecycleBootstrap(bootstrap,payload.contractId);validateLifecycleProposal(envelope,payload.contractId,receipt.proposalId);
 const p=envelope.proposal;requireValue(receipt.operation===operation&&bootstrap.scopeVersion===payload.scopeVersion&&same(p.subject,attempt.bootstrap.subject));
 if(operation==='propose'){
  requireValue(receipt.status==='pending'&&receipt.employmentVersion===payload.baseVersion&&receipt.revision===attempt.bootstrap.employment.revision&&p.baseVersion===payload.baseVersion&&p.reason===payload.reason&&p.legalReference===payload.legalReference&&p.movement===payload.movement&&p.date===payload.date&&same(p.before.intervals,attempt.bootstrap.employment.intervals));
  requireValue(same(p.after.intervals,lifecycleAfter(attempt.bootstrap.employment.intervals,payload.movement,payload.date)));
 }else{
  const expected=payload.decision==='approve'?'approved':'rejected';requireValue(receipt.proposalId.toLowerCase()===payload.proposalId&&receipt.status===expected&&p.status===expected&&p.review?.decision===payload.decision&&p.review.reason===payload.reason);
  for(const key of ['subject','baseVersion','movement','date','before','after','reason','legalReference','createdAt','authorLabel'])requireValue(same(p[key],attempt.proposal[key]));
  if(expected==='approved'){
   requireValue(receipt.revision===attempt.bootstrap.employment.revision+1&&bootstrap.employment.revision>=receipt.revision);
   if(bootstrap.employment.revision===receipt.revision)requireValue(bootstrap.employment.version===receipt.employmentVersion&&same(bootstrap.employment.intervals,p.after.intervals));
  }
 }
 return receipt;
}
