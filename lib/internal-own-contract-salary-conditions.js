import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {salaryUuid,salaryKey,salarySerialized,SalaryInputError} from '../assets/native-salary-catalog-model.js';
import {SALARY_CONDITIONS_READ,salaryConditionsBootstrap,salaryConditionsCommand,salaryConditionsReceipt,salaryConditionsDetail} from '../assets/own-contract-salary-conditions-model.js';
export {SALARY_CONDITIONS_READ};
export const SALARY_CONDITIONS_CAPS=Object.freeze({propose:['payroll.parameter.prepare'],approve:['payroll.parameter.approve'],reject:['payroll.parameter.approve']});
export class SalaryConditionsError extends Error {constructor(code,status,message){super(message);Object.assign(this,{code:code.startsWith('SALARY_CONDITIONS_')?code:'SALARY_CONDITIONS_'+code,status});}}
export const salaryConditionsFail=(code,status,message)=>{throw new SalaryConditionsError(code,status,message);};
export const salaryConditionsFingerprint=body=>createHash('sha256').update(salarySerialized(body)).digest('hex');
const messages={
 INPUT_INVALID:[422,'Revisá antigüedad parcial, título, porcentaje, insalubridad, período y constancia.'],
 FORBIDDEN:[403,'Tu cuenta no permite esta operación sobre condiciones salariales.'],
 SOURCE_REQUIRED:[422,'Se necesita la fuente completa de contratos propios verificados.'],
 POPULATION_CHANGED:[409,'Cambió el conjunto o la identidad de una fila. Volvé a consultar y comparar todas las filas.'],
 IDENTITY_CHANGED:[409,'Cambió la identidad de un contrato. La captura completa no fue confirmada.'],
 NOT_FOUND:[404,'No se encontró la propuesta o el intento dentro de tu acceso.'],
 BASE_CHANGED:[409,'Cambió la revisión o la fuente completa. Actualizá antes de preparar o aprobar.'],
 SCOPE_CHANGED:[409,'Cambió la cuenta, la sesión o el período. Consultá el intento desde su ámbito original.'],
 INDEPENDENT_REQUIRED:[403,'La decisión requiere otra persona habilitada.'],
 IDEMPOTENCY_REUSE:[409,'La referencia pertenece a otro contenido. Consultá el mismo intento.'],
 DECIDED:[409,'La propuesta ya tiene una decisión. Actualizá la consulta.'],
 PROPOSAL_CHANGED:[409,'El contenido no coincide con la propuesta revisada.'],
 LIMIT:[422,'El conjunto alcanzó su capacidad. No se recortaron filas ni propuestas.'],
 BUSY:[409,'Otra operación está en curso. Consultá el mismo intento.'],
};
export function salaryConditionsError(e){
 if(e instanceof SalaryConditionsError)return e;
 if(e instanceof SalaryInputError)return new SalaryConditionsError(e.code,/CONTRACT_INVALID|CAPTURE_INVALID/.test(e.code)?503:422,e.message);
 const m=String(e?.message??'');
 if(/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m)||/SESSION_INVALID/.test(String(e?.code??'')))return new SalaryConditionsError('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar.');
 if(/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m))return new SalaryConditionsError('FORBIDDEN',403,messages.FORBIDDEN[1]);
 if(/NATIVE_EMPLOYMENT_CHANGE_(?:NOT_FOUND|IDENTITY_CHANGED)|PAYROLL_FIXED_.*(?:NOT_FOUND|IDENTITY_CHANGED|DATES_INVALID)/.test(m))return new SalaryConditionsError('SOURCE_REQUIRED',422,messages.SOURCE_REQUIRED[1]);
 for(const[code,[status,message]]of Object.entries(messages))if(new RegExp('\\bSALARY_CONDITIONS_'+code+'\\b').test(m))return new SalaryConditionsError(code,status,message);
 return new SalaryConditionsError('UNAVAILABLE',503,'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function salaryConditionsOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){
   if(typeof input.period!=='string'||!/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(input.period))salaryConditionsFail('INPUT_INVALID',400,'Elegí un período válido.');
   query='SELECT public.own_salary_conditions_bootstrap_v1($1::jsonb,$2::text) AS result';values=[ctx,input.period];
  }else if(operation==='detail'){
   if(!salaryUuid(input.id))salaryConditionsFail('INPUT_INVALID',400,'Elegí una propuesta válida.');
   query='SELECT public.own_salary_conditions_detail_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.id];
  }else{
   if(!salaryKey(input.key))salaryConditionsFail('INPUT_INVALID',428,'La operación requiere una referencia de intento.');
   if(operation==='attempt'){query='SELECT public.own_salary_conditions_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
   else if(operation==='command'){body=salaryConditionsCommand(input.body);query='SELECT public.own_salary_conditions_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(body),input.key];}
   else salaryConditionsFail('INPUT_INVALID',400,'Operación no admitida.');
  }
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  try{
   if(operation==='bootstrap'){
    salaryConditionsBootstrap(result);
    if(result.period!==input.period)salaryConditionsFail('CONTRACT_INVALID',503,'La consulta devolvió otro período.');
   }else if(operation==='detail'){
    await salaryConditionsDetail(result);
    if(result.proposal.id.toLowerCase()!==input.id.toLowerCase())salaryConditionsFail('CONTRACT_INVALID',503,'La consulta devolvió otra propuesta.');
   }else{
    await salaryConditionsReceipt(result,body?{key:input.key,body}:null);
    if(result.requestKey!==input.key||result.requestSha256!==salaryConditionsFingerprint(result.body))salaryConditionsFail('CONTRACT_INVALID',503,'No se verificó el contenido del intento.');
   }
   return result;
  }catch(e){if(e instanceof SalaryConditionsError)throw e;salaryConditionsFail('CONTRACT_INVALID',503,'No se pudo verificar la respuesta conservada. Consultá el mismo intento.');}
 }catch(e){throw salaryConditionsError(e);}
}
