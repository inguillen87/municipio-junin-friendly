// Explicit owner decisions use their own endpoint and audit mode. Independent
// review keeps its existing capabilities and SQL commands.
import {assertOwnerAdoptionAccess,ownerAdoptionAuthorityFromDatabase} from './internal-municipal-owner-decision-authority.js';
import {MUNICIPAL_OWNER_ADOPTION_POLICY} from './municipal-owner-adoption-policy.js';
import {sealAdoptionReview,adoptionReviewJson} from '../assets/employment-adoption-review-model.js';
import {adoptionUuid} from '../assets/employment-adoption-contract.js';
import {ownerDecisionPreview,ownerDecisionCommandInput,ownerDecisionAttempt,ownerDecisionExpectedSource} from '../assets/municipal-adoption-owner-decision-model.js';

const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const fail=(code='CONTRACT_INVALID',status=503)=>{throw Object.assign(new Error(code==='INPUT_INVALID'?'Revisá la propuesta y conservá la clave del mismo intento.':'No se pudo verificar la decisión del propietario. Consultá el mismo intento antes de repetirla.'),{code:'OWNER_ADOPTION_'+code,status});};
const same=(a,b)=>adoptionReviewJson(a)===adoptionReviewJson(b);
// A PostgreSQL uuid parameter normalizes uppercase text. Require the exact
// lowercase v4 wire key before SQL so a committed ACK keeps the caller's key.
const ownerAttemptKey=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function municipalOwnerAdoptionError(error){
 const value=String(error?.code??'')+' '+String(error?.message??'');
 const known=[
  [['OWNER_ADOPTION_AUTHORITY_REQUIRED'],'AUTHORITY_REQUIRED',403,'Tu sesión no permite aprobar el padrón como propietario de este municipio.'],
  [['OWNER_ADOPTION_AUTHORITY_BUSY'],'AUTHORITY_BUSY',409,'Hay otra operación de autorización en curso. Conservá el intento y volvé a consultar.'],
  [['OWNER_ADOPTION_INPUT_INVALID','EMPLOYMENT_ADOPTION_INPUT_INVALID'],'INPUT_INVALID',400,'Revisá la propuesta y conservá la clave del mismo intento.'],
  [['OWNER_ADOPTION_BUSY','EMPLOYMENT_ADOPTION_BUSY','ACTION_SESSION_BUSY'],'BUSY',409,'Hay otra operación en curso. Conservá el intento y volvé a consultar.'],
  [['OWNER_ADOPTION_SOURCE_CHANGED','EMPLOYMENT_ADOPTION_SOURCE_CHANGED'],'SOURCE_CHANGED',409,'Cambió el respaldo de la propuesta. Conservá el intento y volvé a consultar.'],
  [['OWNER_ADOPTION_IDEMPOTENCY_REUSE','EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE'],'IDEMPOTENCY_REUSE',409,'La clave corresponde a otro contenido o responsable. Consultá el mismo intento antes de repetirlo.'],
  [['OWNER_ADOPTION_STALE_PREVIEW','EMPLOYMENT_ADOPTION_SELECTION_CHANGED','EMPLOYMENT_ADOPTION_ALREADY_DECIDED','EMPLOYMENT_ADOPTION_REPLAY_CONFLICT','EMPLOYMENT_ADOPTION_UNSEALED'],'STALE_PREVIEW',409,'Cambió la propuesta o su respaldo. Conservá el intento y volvé a consultar.'],
  [['OWNER_ADOPTION_NOT_FOUND','EMPLOYMENT_ADOPTION_NOT_FOUND'],'NOT_FOUND',404,'No se encontró ese intento o propuesta en tu ámbito actual.'],
  [['OWNER_ADOPTION_FORBIDDEN','EMPLOYMENT_ADOPTION_FORBIDDEN','EMPLOYMENT_ADOPTION_ACTOR_REQUIRED','NATIVE_EMPLOYEE_FORBIDDEN','NATIVE_EMPLOYEE_BINDING_INVALID','TENANT_IAM_SOD_CONFLICT','ACTION_TENANT_AUTHORITY_REQUIRED','ACTION_SOURCE_BINDING_REQUIRED','ACTION_RELEASE_NOT_CERTIFIED'],'FORBIDDEN',403,'Tu autorización vigente no permite esta operación.'],
  [['OWNER_ADOPTION_SESSION_INVALID','ACTION_SESSION_INVALID','NATIVE_EMPLOYEE_SESSION_INVALID'],'SESSION_INVALID',401,'La sesión ya no está vigente. Volvé a ingresar y consultá el mismo intento.'],
  [['OWNER_ADOPTION_LIMIT','EMPLOYMENT_ADOPTION_LIMIT'],'LIMIT',413,'La propuesta supera el límite permitido. Conservá el intento para su revisión.'],
 ];
 for(const[codes,code,status,message]of known)if(codes.some(c=>new RegExp('\\b'+c+'\\b').test(value)))return{code:'OWNER_ADOPTION_'+code,status,message};
 return{code:'OWNER_ADOPTION_UNAVAILABLE',status:503,message:'No se confirmó la decisión del propietario. Consultá el mismo intento antes de repetirla.'};
}
async function queryOne(sql,text,args){let rows;try{rows=await sql.query(text,args);}catch(error){const safe=municipalOwnerAdoptionError(error);throw Object.assign(new Error(safe.message),{code:safe.code,status:safe.status});}if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.result)fail();return rows[0].result;}
async function verifyStage(stage,{access,session,expectedSource,original=false,currentAuthorization}={}){
 if(!exact(stage,['version','preview','rawReview'])||stage.version!=='municipal-adoption-owner-stage.v1')fail();
 const {preview,rawReview}=stage;
 const authorization=ownerAdoptionAuthorityFromDatabase(access,session,currentAuthorization??{scope:preview?.scope,authority:preview?.authority},MUNICIPAL_OWNER_ADOPTION_POLICY);
 if(original){
  // A fresh MFA session may retrieve its immutable acknowledgement. Preserve
  // the old session/identity version, but never let another actor claim it.
  if(!same(preview.scope,authorization.scope)||preview.authority?.actor?.personId!==authorization.authority.actor.personId
   ||preview.authority.actor.email!==authorization.authority.actor.email||preview.authority.policyVersion!==MUNICIPAL_OWNER_ADOPTION_POLICY.version
   ||preview.authority.policySha256!==MUNICIPAL_OWNER_ADOPTION_POLICY.sha256)fail();
 }
 const review=await sealAdoptionReview(rawReview),source=expectedSource??rawReview?.source?.finalRevision;
 return ownerDecisionPreview({...preview,review},{scope:authorization.scope,authority:original?preview.authority:authorization.authority,source});
}
export async function municipalOwnerAdoptionOperation(sql,access,session,operation,input={}){
 const context=assertOwnerAdoptionAccess(access,session),params=[JSON.stringify(context)];
 if(!sql||typeof sql.query!=='function')fail();
 if(operation==='authority'){
  const result=await queryOne(sql,'SELECT public.municipal_owner_adoption_authority_v1($1::jsonb) AS result',params);
  return ownerAdoptionAuthorityFromDatabase(access,session,result,MUNICIPAL_OWNER_ADOPTION_POLICY);
 }
 if(operation==='preview'){
  if(!exact(input,['id','source'])||!adoptionUuid(input.id))fail('INPUT_INVALID',400);
  let source;try{source=ownerDecisionExpectedSource(input.source);}catch{fail('INPUT_INVALID',400);}
  const result=await queryOne(sql,'SELECT public.municipal_owner_adoption_preview_v1($1::jsonb,$2::uuid) AS result',[...params,input.id]);
  const preview=await verifyStage(result,{access,session,expectedSource:source});
  if(preview.proposal.proposalId!==input.id)fail();return preview;
 }
 if(!['command','attempt'].includes(operation)||!ownerAttemptKey(input.key))fail('INPUT_INVALID',400);
 const command=operation==='command'?ownerDecisionCommandInput(input.body):null;
 const result=await queryOne(sql,operation==='command'
  ?'SELECT public.municipal_owner_adoption_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'
  :'SELECT public.municipal_owner_adoption_attempt_v1($1::jsonb,$2::uuid) AS result',
  operation==='command'?[...params,JSON.stringify(command),input.key]:[...params,input.key]);
 if(!exact(result,['version','authorization','preview','rawReview','command','attempt'])||result.version!=='municipal-adoption-owner-stored.v1')fail();
 if(command&&!same(command,result.command))fail();
 const preview=await verifyStage({version:'municipal-adoption-owner-stage.v1',preview:result.preview,rawReview:result.rawReview},
  {access,session,original:true,currentAuthorization:result.authorization});
 const attempt=await ownerDecisionAttempt(result.attempt,{preview,command:result.command,key:input.key});
 return Object.freeze({version:result.version,preview,command:ownerDecisionCommandInput(result.command),attempt});
}
