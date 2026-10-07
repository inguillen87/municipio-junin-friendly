import {employeeContext} from './internal-native-employees.js';
import {adoptionUuid} from '../assets/employment-adoption-contract.js';
import {adoptionAttemptKey} from '../assets/employment-adoption-preparation-model.js';
import {sealAdoptionReview} from '../assets/employment-adoption-review-model.js';
import {municipalAdoptionQueue,municipalAdoptionDetail,municipalAdoptionCommand,municipalAdoptionAttempt} from '../assets/municipal-adoption-operator-model.js';
import {AdoptionPreparationError,adoptionPreparationError,adoptionFail} from './internal-employment-adoption.js';
export const MUNICIPAL_ADOPTION_CAPS=Object.freeze(['workforce.employee.read','employee.record.approve']);
export function municipalAdoptionError(e){
 const code=String(e?.code??'')+' '+String(e?.message??'');
 for(const[k,status,message]of [['SELF_REVIEW',403,'La propuesta requiere otra persona, cuenta y membresía para revisarla.'],['UNSEALED',409,'Esta propuesta anterior no tiene el respaldo completo requerido. No se adoptaron contratos.'],['ALREADY_DECIDED',409,'La propuesta ya tiene una decisión. Consultá su resultado antes de otro intento.'],['SELECTION_CHANGED',409,'Cambió algún antecedente de la propuesta completa. Volvé a consultar antes de decidir.']])if(new RegExp('\\bEMPLOYMENT_ADOPTION_'+k+'\\b').test(code))return new AdoptionPreparationError(k,status,message);
 if(/MUNICIPAL_ADOPTION_|ADOPTION_INSTALL_|ADOPTED_CONSUMERS_/.test(code))return new AdoptionPreparationError('NOT_READY',503,'El circuito de adopción aún no está instalado y verificado por completo. No se adoptaron contratos.');
 const safe=adoptionPreparationError(e);if(safe.code==='EMPLOYMENT_ADOPTION_UNAVAILABLE')safe.message='No se confirmó la decisión. Consultá el mismo intento antes de repetirla.';return safe;
}
export async function municipalAdoptionOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=employeeContext(principal,session);if(!MUNICIPAL_ADOPTION_CAPS.every(c=>principal.tenant.effectiveCapabilities?.includes(c)))adoptionFail('FORBIDDEN',403,'Tu cuenta no permite revisar y decidir adopciones.');
  let query,values=[JSON.stringify(ctx)],body;
  if(operation==='queue')query='SELECT public.municipal_adoption_queue_v1($1::jsonb) AS result';
  else if(operation==='review'){if(!adoptionUuid(input.id))adoptionFail('INPUT_INVALID',400,'Propuesta inválida.');query='SELECT public.municipal_adoption_review_v1($1::jsonb,$2::uuid) AS result';values.push(input.id);}
  else if(['attempt','command'].includes(operation)){
   if(!adoptionAttemptKey(input.key))adoptionFail('INPUT_INVALID',428,'La operación requiere la clave del mismo intento.');
   if(operation==='command'){body=municipalAdoptionCommand(input.body);query='SELECT public.municipal_adoption_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values.push(JSON.stringify(body),input.key);}
   else{query='SELECT public.municipal_adoption_attempt_v1($1::jsonb,$2::uuid) AS result';values.push(input.key);}
  }else adoptionFail('INPUT_INVALID',400,'Operación inválida.');
  const rows=await sql.query(query,values);if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.result)adoptionFail('CONTRACT_INVALID',503,'No se confirmó una decisión completa. Consultá el mismo intento.');
  let r=rows[0].result;if(r.scope?.tenantId!==ctx.tenantId||r.scope?.membershipId!==ctx.membershipId)adoptionFail('CONTRACT_INVALID',503,'El resultado no corresponde a tu ámbito vigente.');
  if(operation==='queue')return municipalAdoptionQueue(r);
  if(operation==='review'){const {rawReview,...metadata}=r;r=await municipalAdoptionDetail({...metadata,review:await sealAdoptionReview(rawReview)});if(r.proposal.proposalId!==input.id)adoptionFail('CONTRACT_INVALID',503,'No se obtuvo la misma propuesta.');return r;}
  return await municipalAdoptionAttempt(r,{key:input.key,...(body?{body}:{})});
 }catch(e){throw municipalAdoptionError(e);}
}
