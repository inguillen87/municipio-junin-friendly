import test from 'node:test';
import assert from 'node:assert/strict';
import {adoptionProposalInput,adoptionReceipt} from '../assets/employment-adoption-contract.js';
import {sealAdoptionReview,adoptionReviewHash} from '../assets/employment-adoption-review-model.js';
import {adoptionSelectionVersion} from '../assets/employment-adoption-preparation-model.js';
import {municipalAdoptionCommand,municipalAdoptionAttempt} from '../assets/municipal-adoption-operator-model.js';
import {OWNER_DECISION_PREVIEW_VERSION as PV,OWNER_DECISION_COMMAND_VERSION as CV,OWNER_DECISION_RECEIPT_VERSION as RV,OWNER_DECISION_ATTEMPT_VERSION as AV,OWNER_DECISION_AUTHORITY_VERSION as AUTH,OWNER_DECISION_POLICY_VERSION as POLICY,ownerDecisionPreview,ownerDecisionCommand,ownerDecisionReceipt,ownerDecisionAttempt} from '../assets/municipal-adoption-owner-decision-model.js';
import {activeAdoptionRaw} from './fixtures/active-contract-adoption-synthetic.js';
import {reviewId as id} from './fixtures/employment-adoption-review-synthetic.js';
const clone=structuredClone,key=id(80001),hash=v=>adoptionReviewHash(v);
async function rehash(v){const{previewSha256,review,...payload}=v;return{...payload,review,previewSha256:await hash(payload)};}
async function fixture({otherOwner=false,count=63}={}){
  const raw=activeAdoptionRaw(count);raw.source.finalRevision.cutoff='2026-10-14T15:18:17';
  const review=await sealAdoptionReview(raw),catalogVersion='a'.repeat(64);
  const body=adoptionProposalInput({version:'employment-adoption-input.v4',finalSource:{revisionId:review.source.finalRevision.revisionId,packageSha256:review.source.finalRevision.packageSha256},cohort:'active-contracts.v1',sourceContextVersion:review.sourceContextVersion,selectionVersion:await adoptionSelectionVersion(review),catalogVersion,rows:review.rows.map(r=>({contractId:r.contractId,contractVersion:r.contractVersion,jurisdictionCode:r.jurisdictionCode})),legalReference:'Antecedente íntegramente sintético QA',reason:'Propuesta de adopción exclusivamente sintética'});
  const author={personId:id(81002),membershipId:review.scope.membershipId,email:'propietario@example.invalid'};
  const authority={version:AUTH,policyVersion:POLICY,policySha256:'b'.repeat(64),actor:{personId:author.personId,email:author.email,identityVersion:7,sessionId:id(81003),sessionVersion:4,releaseSha:'c'.repeat(40)}};
  const scope=clone(review.scope);
  if(otherOwner){scope.membershipId=id(82001);authority.actor.personId=id(82003);authority.actor.email='otro-propietario@example.invalid';authority.actor.identityVersion=8;}
  const wire=await rehash({version:PV,decisionMode:'owner',independence:false,scope,authority,proposal:{proposalId:id(83001),proposalVersion:'d'.repeat(64),sourceContextVersion:review.sourceContextVersion,catalogVersion,total:review.total,status:'pending',author},body,review,rawReviewSha256:await hash(raw),reviewVersion:'e'.repeat(64),current:true});
  const expected={scope:clone(scope),authority:clone(authority),source:clone(review.source.finalRevision)};
  const preview=await ownerDecisionPreview(wire,expected);
  const command=ownerDecisionCommand({version:CV,operation:'approve_owner',proposalId:preview.proposal.proposalId,proposalVersion:preview.proposal.proposalVersion,sourceContextVersion:preview.proposal.sourceContextVersion,catalogVersion:preview.proposal.catalogVersion,reviewVersion:preview.reviewVersion,previewSha256:preview.previewSha256,reason:'Decisión explícita del propietario exclusivamente sintética',reviewConfirmed:true},{preview});
  const receipt={version:RV,operation:'approve_owner',decisionMode:'owner',independence:false,decisionId:id(84001),status:'approved',scope:clone(scope),authority:clone(authority),author:clone(author),proposalId:command.proposalId,proposalVersion:command.proposalVersion,sourceContextVersion:command.sourceContextVersion,catalogVersion:command.catalogVersion,reviewVersion:command.reviewVersion,previewSha256:command.previewSha256,source:clone(expected.source),reason:command.reason,total:review.total,replayed:false,decidedAt:'2026-10-15T12:34:56.123456Z',effects:{identitiesCreated:0,contractsCreated:0,contractsAdopted:review.total,sourceHistoryRetained:true,payrollCalculated:false,payrollPosted:false,paymentsExecuted:false}};
  const attempt={version:AV,scope:clone(scope),requestKey:key,bodySha256:await hash(command),receipt};
  return{wire,expected,preview,command,receipt,attempt};
}

test('owner mode preserves the complete proposal and honestly permits the same author without claiming independence',async()=>{
  const f=await fixture(),before=clone(f.wire);
  assert.equal(f.preview.proposal.total,63);assert.equal(f.preview.body.rows.length,63);assert.equal(f.preview.review.rows.length,63);
  assert.equal(f.preview.authority.actor.email,f.preview.proposal.author.email);
  assert.equal(f.preview.authority.actor.identityVersion,7);assert.equal(Object.hasOwn(f.preview.proposal.author,'identityVersion'),false);
  assert.equal(Object.hasOwn(f.preview.authority.actor,'accountId'),false);assert.equal(Object.hasOwn(f.preview.proposal.author,'accountId'),false);
  assert.equal(f.preview.authority.actor.personId,f.preview.proposal.author.personId);assert.equal(f.preview.scope.membershipId,f.preview.proposal.author.membershipId);
  assert.equal(f.preview.decisionMode,'owner');assert.equal(f.preview.independence,false);assert.ok(Object.isFrozen(f.preview.review.rows));
  assert.equal((await ownerDecisionAttempt(f.attempt,{preview:f.preview,command:f.command,key})).receipt.effects.contractsAdopted,63);
  assert.deepEqual(f.wire,before);assert.notEqual(f.preview,f.wire);
});

test('different actual accounts still use an owner decision, never a fabricated independent review',async()=>{
  const f=await fixture({otherOwner:true});assert.notEqual(f.preview.authority.actor.email,f.preview.proposal.author.email);
  assert.notEqual(f.preview.scope.membershipId,f.preview.review.scope.membershipId);
  assert.equal(ownerDecisionReceipt(f.receipt,f).independence,false);
});

for(const[name,change]of Object.entries({
  missingContext:e=>delete e.source,tenant:e=>e.scope.tenantId=id(90001),membership:e=>e.scope.membershipId=id(90002),binding:e=>e.scope.bindingId=id(90003),company:e=>e.scope.companyId++,
  identityVersion:e=>e.authority.actor.identityVersion++,person:e=>e.authority.actor.personId=id(90005),email:e=>e.authority.actor.email='otra@example.invalid',session:e=>e.authority.actor.sessionId=id(90006),sessionVersion:e=>e.authority.actor.sessionVersion++,release:e=>e.authority.actor.releaseSha='f'.repeat(40),policy:e=>e.authority.policySha256='f'.repeat(64),
  requiredNewSource:e=>e.source.sourceSha256='0'.repeat(64),requiredCutoff:e=>e.source.cutoff='2026-10-15T15:18:17',revision:e=>e.source.revisionId=id(90007),package:e=>e.source.packageSha256='0'.repeat(64),manifest:e=>e.source.coreManifestSha256='0'.repeat(64),facts:e=>e.source.factsSha256='0'.repeat(64),
}))test('preview must match the pinned server context and requested source: '+name,async()=>{
  const f=await fixture(),e=clone(f.expected);change(e);await assert.rejects(ownerDecisionPreview(f.wire,e),/^OwnerDecisionInputError:/);
});

for(const[name,change]of Object.entries({
  independent:v=>v.independence=true,wrongMode:v=>v.decisionMode='independent',stale:v=>v.current=false,status:v=>v.proposal.status='approved',count:v=>v.proposal.total--,partial:v=>v.body.rows.pop(),reordered:v=>v.body.rows.reverse(),changedContract:v=>v.body.rows[0].contractVersion='0'.repeat(64),catalog:v=>v.body.catalogVersion='f'.repeat(64),selection:v=>v.body.selectionVersion='f'.repeat(64),
  authorMembership:v=>v.proposal.author.membershipId=id(91001),authorEmail:v=>v.proposal.author.email='CASE@example.invalid',sourceIssue:v=>v.review.rows[0].sourceIssues.push('CONTRACT_NOT_FOUND'),extraTop:v=>v.isOwner=true,extraAuthority:v=>v.authority.authorized=true,extraActor:v=>v.authority.actor.roles=['PLATFORM_OWNER'],wrongPolicy:v=>v.authority.policyVersion='client-policy.v1',nullActor:v=>v.authority.actor.personId=null,
  inventedActorAccount:v=>v.authority.actor.accountId=id(91002),inventedAuthorAccount:v=>v.proposal.author.accountId=id(91003),inventedHistoricalIdentityVersion:v=>v.proposal.author.identityVersion=v.authority.actor.identityVersion,
  missingIdentityVersion:v=>delete v.authority.actor.identityVersion,zeroIdentityVersion:v=>v.authority.actor.identityVersion=0,negativeIdentityVersion:v=>v.authority.actor.identityVersion=-1,fractionalIdentityVersion:v=>v.authority.actor.identityVersion=1.5,stringIdentityVersion:v=>v.authority.actor.identityVersion='7',booleanIdentityVersion:v=>v.authority.actor.identityVersion=true,unsafeIdentityVersion:v=>v.authority.actor.identityVersion=Number.MAX_SAFE_INTEGER+1,
}))test('rehashing cannot conceal an invalid owner preview: '+name,async()=>{
  const f=await fixture(),v=clone(f.wire);change(v);await assert.rejects(ownerDecisionPreview(await rehash(v),f.expected));
});

test('a source-consistent but altered preview hash is rejected',async()=>{const f=await fixture();await assert.rejects(ownerDecisionPreview({...f.wire,previewSha256:'f'.repeat(64)},f.expected));});

test('original raw facts are bound independently of the derived display review',async()=>{
  const f=await fixture(),review=f.wire.review,raw={scope:review.scope,source:review.source,today:review.today,queriedAt:review.queriedAt,total:review.total,rows:review.rows.map(({contractVersion,observations,...row})=>row)};
  assert.equal(f.wire.rawReviewSha256,await hash(raw));
  for(const value of[undefined,null,'f'.repeat(64),'0'.repeat(64)+'\n']){
    const v=clone(f.wire);if(value===undefined)delete v.rawReviewSha256;else v.rawReviewSha256=value;
    await assert.rejects(ownerDecisionPreview(await rehash(v),f.expected));
  }
  raw.queriedAt='2026-10-15T12:00:01Z';const changed=await rehash({...clone(f.wire),review:await sealAdoptionReview(raw)});
  await assert.rejects(ownerDecisionPreview(changed,f.expected));
  const{review:derived,previewSha256,...sqlPayload}=f.wire;assert.equal(await hash(sqlPayload),previewSha256);
  assert.ok(!Object.hasOwn(sqlPayload,'review'));assert.equal(sqlPayload.rawReviewSha256,f.wire.rawReviewSha256);
});
test('JSON clones must be validated before they can prepare a command',async()=>{const f=await fixture();assert.throws(()=>ownerDecisionCommand(f.command,{preview:clone(f.preview)}));assert.throws(()=>ownerDecisionCommand(f.command));});

for(const[name,change]of Object.entries({
  clientAuthority:v=>v.authority={},clientOwner:v=>v.isOwner=true,clientActor:v=>v.actorEmail='propietario@example.invalid',clientMode:v=>v.decisionMode='owner',clientIndependence:v=>v.independence=false,clientScope:v=>v.scope={},keyInBody:v=>v.key=key,
  missingConfirmation:v=>delete v.reviewConfirmed,falseConfirmation:v=>v.reviewConfirmed=false,wrongOperation:v=>v.operation='approve',oldVersion:v=>v.version='municipal-adoption-operator.v1',wrongProposal:v=>v.proposalId=id(92001),changedProposal:v=>v.proposalVersion='f'.repeat(64),changedSource:v=>v.sourceContextVersion='f'.repeat(64),changedCatalogue:v=>v.catalogVersion='f'.repeat(64),changedReview:v=>v.reviewVersion='f'.repeat(64),changedPreview:v=>v.previewSha256='f'.repeat(64),shortReason:v=>v.reason='sí',reasonMarkup:v=>v.reason='<b>aprobar</b>',reasonNewline:v=>v.reason+='\n',noncanonicalText:v=>v.reason='Decisio\u0301n explícita sintética',
}))test('the command cannot inject authority or change the confirmed attempt: '+name,async()=>{
  const f=await fixture(),v=clone(f.command);change(v);assert.throws(()=>ownerDecisionCommand(v,{preview:f.preview}));
});

for(const[name,change]of Object.entries({
  wrongMode:v=>v.decisionMode='independent',falseClaim:v=>v.independence=true,otherOwner:v=>v.authority.actor.email='otro-owner@example.invalid',otherIdentityVersion:v=>v.authority.actor.identityVersion++,otherAuthor:v=>v.author.email='otra@example.invalid',otherScope:v=>v.scope.tenantId=id(93002),otherSource:v=>v.source.sourceSha256='0'.repeat(64),otherPreview:v=>v.previewSha256='0'.repeat(64),partialTotal:v=>v.total--,partialEffects:v=>v.effects.contractsAdopted--,createdIdentity:v=>v.effects.identitiesCreated=1,createdContract:v=>v.effects.contractsCreated=1,calculated:v=>v.effects.payrollCalculated=true,paid:v=>v.effects.paymentsExecuted=true,lostHistory:v=>v.effects.sourceHistoryRetained=false,invalidDate:v=>v.decidedAt='2026-02-30T12:00:00Z',missingZone:v=>v.decidedAt='2026-10-15T12:00:00',extra:v=>v.rawSql='PRIVATE_MARKER',
  changedReason:v=>v.reason='Otro fundamento explícito completamente sintético',
}))test('saved acknowledgement must preserve exact owner provenance and complete effects: '+name,async()=>{
  const f=await fixture(),v=clone(f.receipt);change(v);assert.throws(()=>ownerDecisionReceipt(v,f),e=>e.code==='OWNER_ADOPTION_CONTRACT_INVALID'&&!e.message.includes('PRIVATE_MARKER'));
});

test('idempotent recovery preserves the saved receipt and the original key, bytes and audit session',async()=>{
  const f=await fixture(),copy=clone(f.attempt);copy.receipt.replayed=true;
  const result=await ownerDecisionAttempt(copy,{preview:f.preview,command:f.command,key});assert.equal(result.receipt.replayed,true);assert.deepEqual(result.receipt.authority,f.receipt.authority);
  for(const v of[{...clone(copy),requestKey:id(94001)},{...clone(copy),bodySha256:'f'.repeat(64)},{...clone(copy),scope:{...copy.scope,membershipId:id(94002)}}])await assert.rejects(ownerDecisionAttempt(v,{preview:f.preview,command:f.command,key}));
  await assert.rejects(ownerDecisionAttempt(copy,{preview:f.preview,command:{...f.command,reason:'Otro fundamento completamente sintético'},key}));
  await assert.rejects(ownerDecisionAttempt(copy,{preview:f.preview,command:f.command,key:id(94003)}));await assert.rejects(ownerDecisionAttempt(copy,{preview:f.preview,command:f.command,key:'10000000-1000-1000-8000-000000000001'}));
});

test('the new wire format is not accepted as an old independent command or receipt',async()=>{
  const f=await fixture();assert.throws(()=>municipalAdoptionCommand(f.command));assert.throws(()=>adoptionReceipt(f.receipt));await assert.rejects(municipalAdoptionAttempt(f.attempt));
});

test('accessors, inherited authority, symbols, cycles and sparse rows are refused without invoking getters',async()=>{
  const f=await fixture();let calls=0;
  const v=clone(f.command);Object.defineProperty(v,'reason',{get(){calls++;return 'Fundamento sintético';},enumerable:true});assert.throws(()=>ownerDecisionCommand(v,{preview:f.preview}));assert.equal(calls,0);
  const inherited=Object.assign(Object.create({isOwner:true}),clone(f.wire));await assert.rejects(ownerDecisionPreview(inherited,f.expected));
  const symbol=clone(f.wire);symbol[Symbol('owner')]=true;await assert.rejects(ownerDecisionPreview(symbol,f.expected));
  const cycle=clone(f.wire);cycle.body.loop=cycle;await assert.rejects(ownerDecisionPreview(cycle,f.expected));
  const sparse=clone(f.wire);delete sparse.body.rows[1];await assert.rejects(ownerDecisionPreview(sparse,f.expected));
  const hidden=clone(f.command);Object.defineProperty(hidden,'reason',{value:hidden.reason,enumerable:false});assert.throws(()=>ownerDecisionCommand(hidden,{preview:f.preview}));
});

test('identifiers, digests, releases and civil timestamps reject final line terminators and noncanonical UUID spelling',async()=>{
  const f=await fixture();
  for(const change of[v=>v.proposal.proposalId+='\n',v=>v.proposal.proposalVersion+='\n',v=>v.authority.actor.personId+='\n',v=>v.authority.actor.releaseSha+='\n',v=>v.authority.policySha256+='\n',v=>v.proposal.author.membershipId+='\n',v=>v.proposal.proposalId=v.proposal.proposalId.replace('10000000','abcdefab').toUpperCase()]){
    const v=clone(f.wire);change(v);await assert.rejects(ownerDecisionPreview(await rehash(v),f.expected));
  }
  await assert.rejects(ownerDecisionPreview(f.wire,{...f.expected,source:{...f.expected.source,cutoff:f.expected.source.cutoff+'\n'}}));
  await assert.rejects(ownerDecisionAttempt(f.attempt,{preview:f.preview,command:f.command,key:key+'\n'}));
  assert.throws(()=>ownerDecisionReceipt({...f.receipt,decidedAt:f.receipt.decidedAt+'\n'},f));
});
