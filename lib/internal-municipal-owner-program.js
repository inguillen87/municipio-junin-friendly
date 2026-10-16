import {assertOwnerAdoptionAccess,ownerAdoptionAuthorityFromDatabase} from './internal-municipal-owner-decision-authority.js';
import {MUNICIPAL_OWNER_ADOPTION_POLICY} from './municipal-owner-adoption-policy.js';
import {MUNICIPAL_OWNER_PROGRAM_POLICY} from './municipal-owner-program-policy.js';
import {principalHasCapabilities} from './internal-resource-access.js';
import {programError} from './internal-own-payroll-program.js';
import {ownerProgramAuthority,ownerProgramPreview,ownerProgramCommandInput,ownerProgramAttempt,ownerProgramAttemptKey} from '../assets/municipal-owner-program-model.js';
export const OWNER_PROGRAM_CAPABILITIES=Object.freeze(['workforce.employee.read','employee.record.propose','payroll.parameter.read','payroll.parameter.prepare']);
export class OwnerProgramApiError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:'OWNER_PROGRAM_'+code,status});}}
export const ownerProgramFail=(code,status,message)=>{throw new OwnerProgramApiError(code,status,message);};
export function assertOwnerProgramAccess(access,session){const context=assertOwnerAdoptionAccess(access,session);if(!principalHasCapabilities(access.principal,OWNER_PROGRAM_CAPABILITIES))ownerProgramFail('AUTHORITY_REQUIRED',403,'La decisión requiere propietario y operador municipal verificados.');return context;}
export function municipalOwnerProgramError(error){
 if(error instanceof OwnerProgramApiError)return error;
 const message=String(error?.message??''),code=String(error?.code??'');
 if(/\b(?:ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID)\b/.test(message))return new OwnerProgramApiError('SESSION_INVALID',401,'La sesión venció o cambió. Volvé a ingresar.');
 if(['55P03','40P01','40001'].includes(code)||/\b(?:OWNER_ADOPTION_AUTHORITY_BUSY|ACTION_SESSION_BUSY)\b/.test(message))return new OwnerProgramApiError('BUSY',409,'Otra operación está en curso. Conservamos el mismo intento.');
 if(/\b(?:OWNER_PROGRAM_AUTHORITY_REQUIRED|OWNER_ADOPTION_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT|NATIVE_EMPLOYEE_FORBIDDEN)\b/.test(message)||code==='OWNER_ADOPTION_AUTHORITY_REQUIRED')return new OwnerProgramApiError('AUTHORITY_REQUIRED',403,'La decisión requiere propietario y operador municipal verificados.');
 if(/\bOWNER_PROGRAM_PREVIEW_CHANGED\b/.test(message))return new OwnerProgramApiError('PREVIEW_CHANGED',409,'Cambió la propuesta o su respaldo. Consultá y revisá nuevamente el conjunto completo.');
 if(code==='OWNER_PROGRAM_INPUT_INVALID'||/\bOWNER_PROGRAM_INPUT_INVALID\b/.test(message))return new OwnerProgramApiError('INPUT_INVALID',422,'La decisión no contiene una propuesta y revisión completas.');
 if(/\bOWN_PROGRAM_[A-Z_]+\b/.test(message)||code.startsWith('OWN_PROGRAM_'))return programError(error);
 return new OwnerProgramApiError('UNAVAILABLE',503,'No se confirmó la decisión. Consultá el mismo intento antes de repetirla.');
}
const uuid=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
function authority(access,session,raw){const value=ownerProgramAuthority(raw);ownerAdoptionAuthorityFromDatabase(access,session,{scope:value.scope,authority:value.authority},MUNICIPAL_OWNER_ADOPTION_POLICY);if(value.policy.version!==MUNICIPAL_OWNER_PROGRAM_POLICY.version||value.policy.sha256!==MUNICIPAL_OWNER_PROGRAM_POLICY.sha256)ownerProgramFail('AUTHORITY_REQUIRED',403,'La política de decisión del programa no coincide.');return value;}
export async function municipalOwnerProgramOperation(sql,access,session,operation,input={}){
 try{
  const ctx=JSON.stringify(assertOwnerProgramAccess(access,session));let query,values,command;
  if(operation==='authority'){query='SELECT public.municipal_owner_program_authority_v1($1::jsonb) AS result';values=[ctx];}
  else if(operation==='preview'){if(!uuid(input.id))ownerProgramFail('INPUT_INVALID',400,'La propuesta no es válida.');query='SELECT public.municipal_owner_program_preview_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.id];}
  else if(operation==='command'||operation==='attempt'){
   if(!ownerProgramAttemptKey(input.key))ownerProgramFail('INPUT_INVALID',400,'La clave del intento debe ser un UUIDv4 canónico en minúsculas.');
   if(operation==='command'){command=ownerProgramCommandInput(input.body);query='SELECT public.municipal_owner_program_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(command),input.key];}
   else{query='SELECT public.municipal_owner_program_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
  }else ownerProgramFail('INPUT_INVALID',400,'Operación no admitida.');
  const result=await sql.query(query,values),rows=Array.isArray(result)?result:result?.rows;if(!Array.isArray(rows)||rows.length!==1||!rows[0]||Object.keys(rows[0]).join('|')!=='result')ownerProgramFail('UNAVAILABLE',503,'No se recibió una confirmación única y completa.');const value=rows[0].result;
  if(operation==='authority')return authority(access,session,value);
  if(operation==='preview'){const expected=authority(access,session,value?.context);const verified=await ownerProgramPreview(value,expected);if(verified.proposal.id!==input.id)ownerProgramFail('UNAVAILABLE',503,'La previa no corresponde a la propuesta.');return verified;}
  authority(access,session,value?.authorization);return await ownerProgramAttempt(value,{key:input.key,command});
 }catch(error){throw municipalOwnerProgramError(error);}
}
