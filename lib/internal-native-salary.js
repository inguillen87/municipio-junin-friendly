import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {SalaryInputError,salaryBootstrap,salaryCommand,salaryReceipt,salaryKey,salarySerialized} from '../assets/native-salary-catalog-model.js';
export const SALARY_READ=['workforce.employee.read','payroll.parameter.read'];
export const SALARY_CAPS={propose:['payroll.parameter.prepare'],approve:['payroll.parameter.approve'],reject:['payroll.parameter.approve']};
export const SALARY_MAX_BYTES=2*1024*1024;
export class NativeSalaryError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:'NATIVE_SALARY_'+code,status});}}
export const salaryFail=(code,status,message)=>{throw new NativeSalaryError(code,status,message);};
export const salaryFingerprint=body=>createHash('sha256').update(salarySerialized(body)).digest('hex');
const errors={INPUT_INVALID:[422,'Revisá las definiciones, valores exactos y vigencias.'],FORBIDDEN:[403,'Tu cuenta no permite esta operación sobre el maestro salarial.'],EMPLOYMENT_REQUIRED:[403,'La operación requiere una identidad municipal vinculada.'],NOT_FOUND:[404,'No se encontró el intento dentro de tu acceso.'],BASE_CHANGED:[409,'Cambió el catálogo vigente o los encuadres. Conservamos el borrador para que compares la nueva versión.'],SCOPE_CHANGED:[409,'Cambió la cuenta o el ámbito. Recuperá el intento desde su cuenta original.'],INDEPENDENT_REQUIRED:[403,'La decisión requiere otra persona habilitada.'],IDEMPOTENCY_REUSE:[409,'La referencia pertenece a otro contenido. Consultá el mismo intento.'],DECIDED:[409,'Esta propuesta ya tiene una decisión. Actualizá la consulta.'],PROPOSAL_CHANGED:[409,'La propuesta no coincide con la versión revisada.'],CLASSIFICATION_INVALID:[422,'El convenio o la clase no están en el catálogo de encuadres vigente.'],HISTORY_REQUIRED:[422,'Conservá los antecedentes: desactivá la fila o cerrá su vigencia.'],DUPLICATE:[422,'Hay definiciones repetidas.'],OVERLAP:[422,'Hay vigencias superpuestas.'],DEPENDENCY:[422,'Una dependencia no existe o no cubre la vigencia.'],CYCLE:[422,'Las dependencias forman un ciclo.'],LIMIT:[422,'El conjunto alcanzó su límite. No se recortaron filas.'],BUSY:[409,'Otra operación está en curso. Consultá o reintentá el mismo envío.']};
export function salaryError(e){
 if(e instanceof NativeSalaryError)return e;if(e instanceof SalaryInputError)return new NativeSalaryError(e.code,e.code==='CONTRACT_INVALID'?503:422,e.message);
 const m=String(e?.message??'');if(/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m)||e?.code==='ACTION_SESSION_INVALID'||e?.code==='NATIVE_EMPLOYEE_SESSION_INVALID')return new NativeSalaryError('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar.');
 if(/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m))return new NativeSalaryError('FORBIDDEN',403,errors.FORBIDDEN[1]);
 for(const[code,[status,message]]of Object.entries(errors))if(new RegExp('\\bNATIVE_SALARY_'+code+'\\b').test(m))return new NativeSalaryError(code,status,message);
 return new NativeSalaryError('UNAVAILABLE',503,'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function salaryOperation(sql,principal,session,operation,input={}){
 try{const ctx=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){query='SELECT public.native_salary_bootstrap_v1($1::jsonb) AS result';values=[ctx];}
  else{if(!salaryKey(input.key))salaryFail('INPUT_INVALID',428,'La operación requiere una referencia de intento.');
   if(operation==='attempt'){query='SELECT public.native_salary_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
   else if(operation==='command'){body=salaryCommand(input.body);query='SELECT public.native_salary_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(body),input.key];}
   else salaryFail('INPUT_INVALID',400,'Operación no admitida.');}
  const rows=await sql.query(query,values),r=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(operation==='bootstrap')return salaryBootstrap(r);
  salaryReceipt(r,body?{key:input.key,body}:null);if(r.requestKey!==input.key||r.requestSha256!==salaryFingerprint(r.body))salaryFail('CONTRACT_INVALID',503,'No se pudo verificar el contenido del intento.');return r;
 }catch(e){throw salaryError(e);}
}
