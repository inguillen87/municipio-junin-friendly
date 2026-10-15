// Fictional wire envelopes for handler tests. No database authority or writes.
import {activeAdoptionRaw} from './active-contract-adoption-synthetic.js';
import {reviewId as id} from './employment-adoption-review-synthetic.js';
import {sealAdoptionReview,adoptionReviewHash} from '../../assets/employment-adoption-review-model.js';
import {adoptionProposalInput} from '../../assets/employment-adoption-contract.js';
import {adoptionSelectionVersion} from '../../assets/employment-adoption-preparation-model.js';
import {ownerDecisionPreview,ownerDecisionCommand} from '../../assets/municipal-adoption-owner-decision-model.js';
import {MUNICIPAL_OWNER_ADOPTION_POLICY as policy} from '../../lib/municipal-owner-adoption-policy.js';
export async function ownerAdoptionFixture(count=63){
 const rawReview=activeAdoptionRaw(count),review=await sealAdoptionReview(rawReview),scope=structuredClone(review.scope),key=id(80001);
 const actor={personId:id(81002),email:'owner-handler@example.invalid',identityVersion:7,sessionId:id(81003),sessionVersion:4,releaseSha:'c'.repeat(40)};
 const authority={version:'municipal-adoption-owner-authority.v1',policyVersion:policy.version,policySha256:policy.sha256,actor},authorization={scope,authority};
 const session={id:actor.sessionId,email:actor.email,version:actor.sessionVersion,releaseSha:actor.releaseSha};
 const access={mode:'managed',session:{id:session.id,email:session.email,version:session.version},principal:{authorized:true,
  user:{email:actor.email,identityVersion:actor.identityVersion},platform:{roles:['PLATFORM_OWNER'],capabilities:['platform.tenants.manage']},
  session:{id:session.id,version:session.version,mfa:true,authLevel:'mfa',expiresAt:new Date(Date.now()+3600000).toISOString()},
  tenant:{id:scope.tenantId,membershipId:scope.membershipId,source:'membership',dataPlaneReady:true,certifiedReleaseSha:actor.releaseSha,
   effectiveCapabilities:['actions.read','workforce.employee.read','employee.record.propose'],sourceBindings:[{system:'GRH',database:'fictional',companyId:scope.companyId,verified:true}]}}};
 const catalogVersion='a'.repeat(64),body=adoptionProposalInput({version:'employment-adoption-input.v4',
  finalSource:{revisionId:review.source.finalRevision.revisionId,packageSha256:review.source.finalRevision.packageSha256},cohort:'active-contracts.v1',
  sourceContextVersion:review.sourceContextVersion,selectionVersion:await adoptionSelectionVersion(review),catalogVersion,
  rows:review.rows.map(r=>({contractId:r.contractId,contractVersion:r.contractVersion,jurisdictionCode:r.jurisdictionCode})),legalReference:'Antecedente ficticio QA',reason:'Preparación exclusivamente sintética para probar el handler'});
 const author={personId:actor.personId,email:actor.email,membershipId:scope.membershipId};
 const metadata={version:'municipal-adoption-owner-preview.v1',decisionMode:'owner',independence:false,scope,authority,
  proposal:{proposalId:id(83001),proposalVersion:'d'.repeat(64),sourceContextVersion:review.sourceContextVersion,catalogVersion,total:count,status:'pending',author},
  body,rawReviewSha256:await adoptionReviewHash(rawReview),reviewVersion:'e'.repeat(64),current:true};
 const preview={...metadata,previewSha256:await adoptionReviewHash(metadata)},verified=await ownerDecisionPreview({...preview,review},{scope,authority,source:review.source.finalRevision});
 const command=ownerDecisionCommand({version:'municipal-adoption-owner-command.v1',operation:'approve_owner',proposalId:preview.proposal.proposalId,
  proposalVersion:preview.proposal.proposalVersion,sourceContextVersion:review.sourceContextVersion,catalogVersion,reviewVersion:preview.reviewVersion,
  previewSha256:preview.previewSha256,reason:'Aprobación del propietario exclusivamente sintética QA',reviewConfirmed:true},{preview:verified});
 const receipt={version:'municipal-adoption-owner-receipt.v1',operation:'approve_owner',decisionMode:'owner',independence:false,
  decisionId:id(84001),status:'approved',scope,authority,author,...Object.fromEntries(['proposalId','proposalVersion','sourceContextVersion','catalogVersion','reviewVersion','previewSha256','reason'].map(k=>[k,command[k]])),
  source:review.source.finalRevision,total:count,replayed:false,decidedAt:'2026-10-15T12:34:56.123456Z',
  effects:{identitiesCreated:0,contractsCreated:0,contractsAdopted:count,sourceHistoryRetained:true,payrollCalculated:false,payrollPosted:false,paymentsExecuted:false}};
 const attempt={version:'municipal-adoption-owner-attempt.v1',scope,requestKey:key,bodySha256:await adoptionReviewHash(command),receipt};
 return{access,session,authorization,key,command,stage:{version:'municipal-adoption-owner-stage.v1',preview,rawReview},
  stored:{version:'municipal-adoption-owner-stored.v1',authorization,preview,rawReview,command,attempt}};
}
