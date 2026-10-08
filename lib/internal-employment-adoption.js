import {employeeContext} from './internal-native-employees.js';
import {adoptionProposalInput,AdoptionInputError,adoptionUuid} from '../assets/employment-adoption-contract.js';
import {sealAdoptionReview} from '../assets/employment-adoption-review-model.js';
import {adoptionAttemptKey,adoptionPreparationBootstrap,adoptionPreparationReceipt,adoptionFinalSources} from '../assets/employment-adoption-preparation-model.js';
export const ADOPTION_PREPARATION_MAX_BYTES=2097152;
export class AdoptionPreparationError extends Error{constructor(code,status,message){super(message);Object.assign(this,{name:'AdoptionPreparationError',code:'EMPLOYMENT_ADOPTION_'+code,status});}}
export const adoptionFail=(code,status,message)=>{throw new AdoptionPreparationError(code,status,message);};
const messages={SOURCE_CHANGED:[409,'Cambió la fuente o el padrón completo. Conservá el formulario y volvé a revisar.'],CATALOG_CHANGED:[409,'Cambió el catálogo vigente. Volvé a consultar antes de preparar la propuesta.'],SELECTION_CHANGED:[409,'La propuesta no coincide con todos los contratos revisados. No se omitieron contratos.'],FORBIDDEN:[403,'Tu cuenta no permite preparar esta propuesta.'],NOT_FOUND:[404,'No se encontró ese intento dentro de tu cuenta y municipio.'],IDEMPOTENCY_REUSE:[409,'La clave corresponde a otro contenido. Consultá el mismo intento antes de preparar otro.'],LIMIT:[422,'La propuesta completa supera la capacidad disponible. No se dividió ni omitió ningún contrato.'],BUSY:[409,'Hay otra operación en curso. Consultá el mismo intento antes de repetirlo.'],INPUT_INVALID:[422,'Revisá la jurisdicción, el documento y el motivo de la propuesta.']};
export function adoptionPreparationError(e){
 if(e instanceof AdoptionPreparationError)return e;
 if(e instanceof AdoptionInputError)return new AdoptionPreparationError(e.code,e.code==='CONTRACT_INVALID'?503:422,e.message);
 if(e?.code==='ADOPTION_REVIEW_LIMIT')return new AdoptionPreparationError('LIMIT',...messages.LIMIT);
 if(['NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID','NATIVE_EMPLOYMENT_CATALOG_LIMIT','NATIVE_EMPLOYMENT_CATALOG_UNAVAILABLE'].includes(e?.code))return new AdoptionPreparationError('BODY_INVALID',[400,413,503].includes(e.status)?e.status:400,'No se pudo leer un formulario completo y válido. Consultá el mismo intento antes de repetirlo.');
 const source=String(e?.code??'')+' '+String(e?.message??'');
 if(e?.code==='42883'||/FINAL_ADOPTION_(?:SOURCE_METADATA|SOURCE_PROTECTION|NEW_METADATA|AFTER_METADATA)/.test(source))return new AdoptionPreparationError('NOT_READY',503,'La revisión del respaldo final todavía no está habilitada. Pedí al administrador verificar la instalación y volvé a consultar; no prepares otro intento.');
 for(const [code,[status,message]]of Object.entries(messages))if(new RegExp('\\bEMPLOYMENT_ADOPTION_'+code+'\\b').test(source))return new AdoptionPreparationError(code,status,message);
 if(/ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID/.test(source))return new AdoptionPreparationError('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar y consultá el mismo intento.');
 if(/FORBIDDEN|SOD_CONFLICT|EMPLOYMENT_REQUIRED/.test(source))return new AdoptionPreparationError('FORBIDDEN',403,'La cuenta requiere permiso vigente y vínculo municipal para preparar esta propuesta.');
 if(/BINDING_INVALID|ACTION_SOURCE_BINDING_REQUIRED|ACTION_RELEASE_NOT_CERTIFIED/.test(source))return new AdoptionPreparationError('SOURCE_CHANGED',...messages.SOURCE_CHANGED);
 if(['55P03','40P01','40001'].includes(e?.code)||/CATALOG_BUSY|SOURCE_BUSY/.test(source))return new AdoptionPreparationError('BUSY',...messages.BUSY);
 return new AdoptionPreparationError('UNAVAILABLE',503,'No se confirmó la propuesta. Consultá el mismo intento antes de preparar otro.');
}
export async function adoptionPreparationOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=employeeContext(principal,session);let query,values,body;
  if(!principal.tenant.effectiveCapabilities?.includes('workforce.employee.read'))adoptionFail('FORBIDDEN',...messages.FORBIDDEN);
  if(operation==='bootstrap'){query='SELECT public.employment_adoption_bootstrap_v1($1::jsonb) AS result';values=[JSON.stringify(ctx)];}
  else if(operation==='final-sources'){query='SELECT public.employment_adoption_final_available_v1($1::jsonb) AS result';values=[JSON.stringify(ctx)];}
  else if(operation==='final-bootstrap'){
   if(!adoptionUuid(input.revisionId)||typeof input.packageSha256!=='string'||!/^[a-f0-9]{64}$/.test(input.packageSha256))adoptionFail('INPUT_INVALID',400,'La revisión final requiere su referencia completa y verificada.');
   query='SELECT public.employment_adoption_final_bootstrap_v1($1::jsonb,$2::uuid,$3::text) AS result';values=[JSON.stringify(ctx),input.revisionId,input.packageSha256];
  }
  else{
   if(!adoptionAttemptKey(input.key))adoptionFail('INPUT_INVALID',428,'La operación requiere una clave de intento.');
   if(operation==='propose'){if(!principal.tenant.effectiveCapabilities?.includes('employee.record.propose'))adoptionFail('FORBIDDEN',...messages.FORBIDDEN);body=adoptionProposalInput(input.body);query='SELECT public.employment_adoption_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[JSON.stringify(ctx),JSON.stringify(body),input.key];}
   else if(operation==='attempt'){query='SELECT public.employment_adoption_attempt_v1($1::jsonb,$2::uuid) AS result';values=[JSON.stringify(ctx),input.key];}
   else adoptionFail('INPUT_INVALID',400,'Operación no admitida.');
  }
  const rows=await sql.query(query,values);if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.result)adoptionFail('CONTRACT_INVALID',503,'No se confirmó una propuesta completa. Consultá el mismo intento.');
  const raw=rows[0].result;
  if(operation==='final-sources'){
   // The certified binding is resolved and locked by SQL from this membership.
   // It is deliberately absent from the client-supplied actor context.
   const value=adoptionFinalSources(raw);if(value.scope.tenantId!==ctx.tenantId||value.scope.membershipId!==ctx.membershipId)adoptionFail('CONTRACT_INVALID',503,'La revisión no corresponde a tu ámbito vigente.');return value;
  }
  if(['bootstrap','final-bootstrap'].includes(operation)){
   if(raw.rawReview?.scope?.tenantId!==ctx.tenantId||raw.rawReview?.scope?.membershipId!==ctx.membershipId)adoptionFail('CONTRACT_INVALID',503,'La revisión no corresponde a tu ámbito vigente.');
   const {rawReview,...metadata}=raw;const value=await adoptionPreparationBootstrap({...metadata,review:await sealAdoptionReview(rawReview)});
   if(operation==='final-bootstrap'&&(value.review.source.finalRevision?.revisionId!==input.revisionId||value.review.source.finalRevision?.packageSha256!==input.packageSha256))adoptionFail('CONTRACT_INVALID',503,'No se obtuvo la misma revisión final.');return value;
  }
  return adoptionPreparationReceipt(raw,{key:input.key,...(body?{body}:{})});
 }catch(e){throw adoptionPreparationError(e);}
}
