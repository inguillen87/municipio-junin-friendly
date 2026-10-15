// Wire validation only. Authority must be resolved by the server from the real
// principal and a tenant policy; accepting this model never authenticates an owner.
import {adoptionProposalInput} from './employment-adoption-contract.js';
import {adoptionReviewHash,adoptionReviewJson,adoptionReviewScope,verifiedAdoptionReview} from './employment-adoption-review-model.js';
import {adoptionAttemptKey,adoptionSelectionVersion} from './employment-adoption-preparation-model.js';

export const OWNER_DECISION_PREVIEW_VERSION='municipal-adoption-owner-preview.v1';
export const OWNER_DECISION_COMMAND_VERSION='municipal-adoption-owner-command.v1';
export const OWNER_DECISION_RECEIPT_VERSION='municipal-adoption-owner-receipt.v1';
export const OWNER_DECISION_ATTEMPT_VERSION='municipal-adoption-owner-attempt.v1';
export const OWNER_DECISION_AUTHORITY_VERSION='municipal-adoption-owner-authority.v1';
export const OWNER_DECISION_POLICY_VERSION='tenant-owner-adoption-policy.v1';
const verifiedPreviews=new WeakSet();
export class OwnerDecisionInputError extends Error{
  constructor(code='CONTRACT_INVALID'){super(code==='STALE_PREVIEW'?'Cambió la propuesta o su respaldo. Conservá el intento y volvé a consultar.':'No se pudo verificar la decisión del propietario. Consultá el mismo intento.');Object.assign(this,{name:'OwnerDecisionInputError',code:'OWNER_ADOPTION_'+code});}
}
const fail=(code)=>{throw new OwnerDecisionInputError(code);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value'));
// Reject accessors, prototypes, cycles, sparse arrays and non-JSON values before
// using any shared validator. Never execute a getter while parsing a wire value.
function dataTree(v,stack=new Set(),depth=0){
  if(depth>32)fail();
  if(v===null||typeof v==='string'||typeof v==='boolean')return;
  if(typeof v==='number'){if(!Number.isSafeInteger(v)||Object.is(v,-0))fail();return;}
  if(!v||typeof v!=='object'||stack.has(v))fail();
  const array=Array.isArray(v),keys=Reflect.ownKeys(v),descriptors=Object.getOwnPropertyDescriptors(v);
  if(array?Object.getPrototypeOf(v)!==Array.prototype:![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();
  if(keys.some(k=>typeof k!=='string'||!Object.hasOwn(descriptors[k],'value')||(!array||k!=='length')&&!descriptors[k].enumerable))fail();
  if(array&&(keys.length!==v.length+1||keys.some(k=>k!=='length'&&(!/^(0|[1-9]\d*)$/.test(k)||Number(k)>=v.length))))fail();
  stack.add(v);for(const k of keys)if(!array||k!=='length')dataTree(descriptors[k].value,stack,depth+1);stack.delete(v);
}
const uuid=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
const sha=v=>typeof v==='string'&&v.length===64&&/^[a-f0-9]{64}$/.test(v);
const text=(v,min,max)=>typeof v==='string'&&v===v.normalize('NFC').trim()&&[...v].length>=min&&[...v].length<=max&&!/[<>\u0000-\u001f\u007f-\u009f]/u.test(v);
const email=v=>text(v,3,254)&&v===v.toLowerCase()&&/^[^\s@]+@[^\s@]+$/.test(v);
const day=v=>typeof v==='string'&&v.length===10&&/^(19|20)\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const civilTime=v=>typeof v==='string'&&v.length===19&&day(v.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(v);
const stamp=v=>text(v,20,32)&&day(v.slice(0,10))&&/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const equal=(a,b)=>adoptionReviewJson(a)===adoptionReviewJson(b);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const sourceKeys=['revisionId','packageSha256','sourceSha256','cutoff','coreManifestSha256','curatedManifestSha256','factsSha256'];
function source(v){if(!exact(v,sourceKeys)||!uuid(v.revisionId)||!civilTime(v.cutoff)||!sourceKeys.filter(k=>!['revisionId','cutoff'].includes(k)).every(k=>sha(v[k])))fail();}
export function ownerDecisionExpectedSource(v){dataTree(v);source(v);return freeze(structuredClone(v));}
function actor(v,session){
  // internal_users identifies an account by email. Identity version belongs to
  // the current verified actor, not to the author fields persisted by SQL132.
  if(!exact(v,['personId','email',...(session?['identityVersion','sessionId','sessionVersion','releaseSha']:['membershipId'])])||![v.personId,session?v.sessionId:v.membershipId].every(uuid)||!email(v.email))fail();
  if(session&&(!Number.isSafeInteger(v.identityVersion)||v.identityVersion<1||!Number.isSafeInteger(v.sessionVersion)||v.sessionVersion<1||typeof v.releaseSha!=='string'||v.releaseSha.length!==40||!/^[a-f0-9]{40}$/.test(v.releaseSha)))fail();
}
function authority(v){
  if(!exact(v,['version','policyVersion','policySha256','actor'])||v.version!==OWNER_DECISION_AUTHORITY_VERSION||v.policyVersion!==OWNER_DECISION_POLICY_VERSION||!sha(v.policySha256))fail();actor(v.actor,true);
}
function scope(v){try{adoptionReviewScope(v);}catch{fail();}if(![v.tenantId,v.membershipId,v.bindingId].every(uuid))fail();}
const previewKeys=['version','decisionMode','independence','scope','authority','proposal','body','review','rawReviewSha256','reviewVersion','current','previewSha256'];
// SQL and WebCrypto bind the same original raw facts. Counts, observations and
// display seals are derived by verifiedAdoptionReview; SQL does not duplicate
// that presentation logic or trust a client's derived review.
const previewPayload=v=>Object.fromEntries(previewKeys.filter(k=>!['previewSha256','review'].includes(k)).map(k=>[k,v[k]]));

// expected is mandatory: the caller pins the actual server context and the
// specifically requested source. A valid old source cannot substitute for it.
export async function ownerDecisionPreview(v,expected){
  try{
    dataTree(v);dataTree(expected);
    if(!exact(v,previewKeys)||!exact(expected,['scope','authority','source'])||v.version!==OWNER_DECISION_PREVIEW_VERSION||v.decisionMode!=='owner'||v.independence!==false||!sha(v.rawReviewSha256)||!sha(v.reviewVersion)||!sha(v.previewSha256))fail();
    scope(v.scope);scope(expected.scope);authority(v.authority);authority(expected.authority);source(expected.source);
    if(!equal(v.scope,expected.scope)||!equal(v.authority,expected.authority))fail();
    if(v.current!==true)fail('STALE_PREVIEW');
    const p=v.proposal;
    if(!exact(p,['proposalId','proposalVersion','sourceContextVersion','catalogVersion','total','status','author'])||!uuid(p.proposalId)||![p.proposalVersion,p.sourceContextVersion,p.catalogVersion].every(sha)||!Number.isSafeInteger(p.total)||p.total<1||p.total>10000||p.status!=='pending')fail();actor(p.author,false);
    const body=adoptionProposalInput(v.body),review=await verifiedAdoptionReview(v.review),final=review.source.finalRevision;
    const raw={scope:review.scope,source:review.source,today:review.today,queriedAt:review.queriedAt,total:review.total,
      rows:review.rows.map(({contractVersion,observations,...row})=>row)};
    if(await adoptionReviewHash(raw)!==v.rawReviewSha256)fail();
    source(final);
    if(!equal(final,expected.source))fail('STALE_PREVIEW');
    if(['tenantId','bindingId','companyId'].some(k=>v.scope[k]!==review.scope[k])||review.scope.membershipId!==p.author.membershipId||p.total!==review.total||body.rows.length!==p.total||body.sourceContextVersion!==p.sourceContextVersion||review.sourceContextVersion!==p.sourceContextVersion||body.catalogVersion!==p.catalogVersion||body.selectionVersion!==await adoptionSelectionVersion(review)||!body.finalSource||body.finalSource.revisionId!==final.revisionId||body.finalSource.packageSha256!==final.packageSha256)fail();
    for(let n=0;n<review.rows.length;n++){
      const r=review.rows[n],b=body.rows[n];
      if(!uuid(b.contractId)||!sha(b.contractVersion)||b.contractId!==r.contractId||b.contractVersion!==r.contractVersion||r.jurisdictionCode===null||b.jurisdictionCode!==r.jurisdictionCode||!Array.isArray(r.sourceIssues)||r.sourceIssues.length)fail();
    }
    if(await adoptionReviewHash(previewPayload(v))!==v.previewSha256)fail();
    const result=freeze(structuredClone({...v,body,review}));verifiedPreviews.add(result);return result;
  }catch(e){if(e instanceof OwnerDecisionInputError)throw e;fail();}
}
function previewRequired(preview){if(!verifiedPreviews.has(preview))fail();return preview;}
const commandKeys=['version','operation','proposalId','proposalVersion','sourceContextVersion','catalogVersion','reviewVersion','previewSha256','reason','reviewConfirmed'];
// Structural parsing for the server before dispatching a command. It does not
// authorize it: SQL must revalidate authority, original preview and source.
export function ownerDecisionCommandInput(v){
  dataTree(v);
  if(!exact(v,commandKeys)||v.version!==OWNER_DECISION_COMMAND_VERSION||v.operation!=='approve_owner'||v.reviewConfirmed!==true||!uuid(v.proposalId)
    ||!['proposalVersion','sourceContextVersion','catalogVersion','reviewVersion','previewSha256'].every(k=>sha(v[k]))||!text(v.reason,10,1000))fail('INPUT_INVALID');
  return freeze(structuredClone(v));
}
// There is no client actor, authority, isOwner or independence switch here.
export function ownerDecisionCommand(v,{preview}={}){
  v=ownerDecisionCommandInput(v);const p=previewRequired(preview);
  for(const k of['proposalId','proposalVersion','sourceContextVersion','catalogVersion'])if(v[k]!==p.proposal[k])fail('STALE_PREVIEW');
  for(const k of['reviewVersion','previewSha256'])if(v[k]!==p[k])fail('STALE_PREVIEW');
  return freeze(structuredClone(v));
}
const receiptKeys=['version','operation','decisionMode','independence','decisionId','status','scope','authority','author','proposalId','proposalVersion','sourceContextVersion','catalogVersion','reviewVersion','previewSha256','source','reason','total','replayed','decidedAt','effects'];
export function ownerDecisionReceipt(v,{preview,command}={}){
  dataTree(v);const p=previewRequired(preview);ownerDecisionCommand(command,{preview:p});
  if(!exact(v,receiptKeys)||v.version!==OWNER_DECISION_RECEIPT_VERSION||v.operation!=='approve_owner'||v.decisionMode!=='owner'||v.independence!==false||!uuid(v.decisionId)||v.status!=='approved'||typeof v.replayed!=='boolean'||!stamp(v.decidedAt)||v.total!==p.proposal.total||v.reason!==command.reason)fail();
  for(const k of['scope','authority'])if(!equal(v[k],p[k]))fail();
  if(!equal(v.author,p.proposal.author)||!equal(v.source,p.review.source.finalRevision))fail();
  for(const k of['proposalId','proposalVersion','sourceContextVersion','catalogVersion','reviewVersion','previewSha256'])if(v[k]!==command[k])fail();
  const effects={identitiesCreated:0,contractsCreated:0,contractsAdopted:p.proposal.total,sourceHistoryRetained:true,payrollCalculated:false,payrollPosted:false,paymentsExecuted:false};
  if(!exact(v.effects,Object.keys(effects))||!equal(v.effects,effects))fail();
  return freeze(structuredClone(v));
}
export async function ownerDecisionAttempt(v,{preview,command,key}={}){
  dataTree(v);const p=previewRequired(preview),body=ownerDecisionCommand(command,{preview:p});
  if(!exact(v,['version','scope','requestKey','bodySha256','receipt'])||v.version!==OWNER_DECISION_ATTEMPT_VERSION||!uuid(key)||!adoptionAttemptKey(key)||v.requestKey!==key||!sha(v.bodySha256)||!equal(v.scope,p.scope)||v.bodySha256!==await adoptionReviewHash(body))fail();
  return freeze({...structuredClone(v),receipt:ownerDecisionReceipt(v.receipt,{preview:p,command:body})});
}
