import {assertOwnerAdoptionAccess,ownerAdoptionAuthorityFromDatabase} from './internal-municipal-owner-decision-authority.js';
import {MUNICIPAL_OWNER_ADOPTION_POLICY} from './municipal-owner-adoption-policy.js';
import {MUNICIPAL_OWNER_SALARY_POLICY} from './municipal-owner-salary-policy.js';
import {principalHasCapabilities} from './internal-resource-access.js';
import {salaryError} from './internal-native-salary.js';
import {ownerSalaryAuthority,ownerSalaryPreview,ownerSalaryCommandInput,ownerSalaryAttempt,ownerSalaryAttemptKey} from '../assets/municipal-owner-salary-model.js';
export const OWNER_SALARY_CAPABILITIES=Object.freeze(['workforce.employee.read','employee.record.propose','payroll.parameter.read','payroll.parameter.prepare']);
export class OwnerSalaryApiError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:'OWNER_SALARY_'+code,status});}}
export const ownerSalaryFail=(code,status,message)=>{throw new OwnerSalaryApiError(code,status,message);};
export function assertOwnerSalaryAccess(access,session){const context=assertOwnerAdoptionAccess(access,session);if(!principalHasCapabilities(access.principal,OWNER_SALARY_CAPABILITIES))ownerSalaryFail('AUTHORITY_REQUIRED',403,'La decisión requiere propietario y operador municipal verificados.');return context;}
export function municipalOwnerSalaryError(error){
 if(error instanceof OwnerSalaryApiError)return error;
 const message=String(error?.message??''),code=String(error?.code??'');
 if(/\b(?:ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID)\b/.test(message))return new OwnerSalaryApiError('SESSION_INVALID',401,'La sesión venció o cambió. Volvé a ingresar.');
 if(['55P03','40P01','40001'].includes(code)||/\b(?:OWNER_ADOPTION_AUTHORITY_BUSY|ACTION_SESSION_BUSY)\b/.test(message))return new OwnerSalaryApiError('BUSY',409,'Otra operación está en curso. Conservamos el mismo intento.');
 if(/\b(?:OWNER_SALARY_AUTHORITY_REQUIRED|OWNER_ADOPTION_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT|NATIVE_EMPLOYEE_FORBIDDEN)\b/.test(message)||code==='OWNER_ADOPTION_AUTHORITY_REQUIRED')return new OwnerSalaryApiError('AUTHORITY_REQUIRED',403,'La decisión requiere propietario y operador municipal verificados.');
 if(/\bOWNER_SALARY_PREVIEW_CHANGED\b/.test(message))return new OwnerSalaryApiError('PREVIEW_CHANGED',409,'Cambió la propuesta o su respaldo. Consultá y revisá nuevamente el conjunto completo.');
 if(code==='OWNER_SALARY_INPUT_INVALID'||/\bOWNER_SALARY_INPUT_INVALID\b/.test(message))return new OwnerSalaryApiError('INPUT_INVALID',422,'La decisión no contiene una propuesta y revisión completas.');
 if(/\bNATIVE_SALARY_[A-Z_]+\b/.test(message)||code.startsWith('NATIVE_SALARY_'))return salaryError(error);
 return new OwnerSalaryApiError('UNAVAILABLE',503,'No se confirmó la decisión. Consultá el mismo intento antes de repetirla.');
}
const uuid=v=>typeof v==='string'&&v.length===36&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
function authority(access,session,raw){const value=ownerSalaryAuthority(raw);ownerAdoptionAuthorityFromDatabase(access,session,{scope:value.scope,authority:value.authority},MUNICIPAL_OWNER_ADOPTION_POLICY);if(value.policy.version!==MUNICIPAL_OWNER_SALARY_POLICY.version||value.policy.sha256!==MUNICIPAL_OWNER_SALARY_POLICY.sha256)ownerSalaryFail('AUTHORITY_REQUIRED',403,'La política de decisión salarial no coincide.');return value;}
export async function municipalOwnerSalaryOperation(sql,access,session,operation,input={}){
 try{
  const ctx=JSON.stringify(assertOwnerSalaryAccess(access,session));let query,values,command;
  if(operation==='authority'){query='SELECT public.municipal_owner_salary_authority_v1($1::jsonb) AS result';values=[ctx];}
  else if(operation==='preview'){if(!uuid(input.id))ownerSalaryFail('INPUT_INVALID',400,'La propuesta no es válida.');query='SELECT public.municipal_owner_salary_preview_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.id];}
  else if(operation==='command'||operation==='attempt'){
   if(!ownerSalaryAttemptKey(input.key))ownerSalaryFail('INPUT_INVALID',400,'La clave del intento debe ser un UUIDv4 canónico en minúsculas.');
   if(operation==='command'){command=ownerSalaryCommandInput(input.body);query='SELECT public.municipal_owner_salary_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(command),input.key];}
   else{query='SELECT public.municipal_owner_salary_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
  }else ownerSalaryFail('INPUT_INVALID',400,'Operación no admitida.');
  const result=await sql.query(query,values),value=(Array.isArray(result)?result:result?.rows)?.[0]?.result;
  if(operation==='authority')return authority(access,session,value);
  if(operation==='preview'){const expected=authority(access,session,value?.context);const verified=await ownerSalaryPreview(value,expected);if(verified.proposal.id!==input.id)ownerSalaryFail('UNAVAILABLE',503,'La previa no corresponde a la propuesta.');return verified;}
  authority(access,session,value?.authorization);return await ownerSalaryAttempt(value,{key:input.key,command});
 }catch(error){throw municipalOwnerSalaryError(error);}
}
