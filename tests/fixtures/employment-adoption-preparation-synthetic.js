import {sealAdoptionReview,adoptionReviewHash} from '../../assets/employment-adoption-review-model.js';
import {adoptionPreparationPayload,ADOPTION_PREPARATION_VERSION} from '../../assets/employment-adoption-preparation-model.js';
import {reviewRaw,reviewId} from './employment-adoption-review-synthetic.js';
import {principal as basePrincipal,session} from './native-employee-synthetic.js';
export {session};export const principal={...basePrincipal,tenant:{...basePrincipal.tenant,effectiveCapabilities:['workforce.employee.read','employee.record.propose']}};
export const attemptKey='90000000-0000-4000-8000-000000000001',catalogVersion='c'.repeat(64);
export const preparationReview=()=>sealAdoptionReview(reviewRaw());
export const preparationBody=async()=>adoptionPreparationPayload(await preparationReview(),catalogVersion,'42','Resolución sintética QA','Preparación completa sintética con antecedentes conservados');
export async function preparationEnvelope(body=null,key=attemptKey,replayed=false){body??=await preparationBody();return{version:ADOPTION_PREPARATION_VERSION,requestKey:key,bodySha256:await adoptionReviewHash(body),applicationAvailable:false,receipt:{version:'employment-adoption.v1',operation:'propose',proposalId:reviewId(9900),proposalVersion:'e'.repeat(64),sourceContextVersion:body.sourceContextVersion,catalogVersion:body.catalogVersion,status:'pending',total:body.rows.length,replayed,decidedAt:null,effects:{identitiesCreated:0,contractsCreated:0,contractsAdopted:0,sourceHistoryRetained:true,payrollCalculated:false,payrollPosted:false,paymentsExecuted:false}}};}
export async function preparationBoot(){return{version:ADOPTION_PREPARATION_VERSION,rawReview:reviewRaw(),catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]};}
