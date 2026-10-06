import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {salaryKey,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {AnnualBudgetError,annualBudgetBootstrap,annualBudgetCommand,annualBudgetReceipt,budgetYear,BUDGET_READ} from '../assets/annual-position-budget-model.js';
export {BUDGET_READ};
export const BUDGET_CAPS={propose:['workforce.structure.prepare'],approve:['workforce.structure.approve'],reject:['workforce.structure.approve']};
export class AnnualBudgetHttpError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:'ANNUAL_BUDGET_'+code,status});}}
export const budgetFail=(code,status,message)=>{throw new AnnualBudgetHttpError(code,status,message);};
export const annualBudgetFingerprint=body=>createHash('sha256').update(salarySerialized(body)).digest('hex');
const errors={INPUT_INVALID:[422,'Revisá el ejercicio, la fuente normativa y todas las filas.'],FORBIDDEN:[403,'Tu membresía no permite esta operación sobre la planta anual.'],EMPLOYMENT_REQUIRED:[403,'Se requiere una identidad municipal vinculada.'],NOT_FOUND:[404,'No se encontró el intento dentro de tu acceso.'],BASE_CHANGED:[409,'Cambió la versión anual. Actualizá y revisá el conjunto completo.'],SCOPE_CHANGED:[409,'Cambió la cuenta o el ámbito. Consultá con la cuenta del envío original.'],INDEPENDENT_REQUIRED:[403,'La decisión requiere otra persona habilitada.'],IDEMPOTENCY_REUSE:[409,'La referencia pertenece a otro contenido. Consultá el mismo intento.'],DECIDED:[409,'Esta propuesta ya tiene una decisión.'],PROPOSAL_CHANGED:[409,'La propuesta no coincide con la versión revisada.'],LIMIT:[422,'Se alcanzó la capacidad del registro. No se recortaron filas ni antecedentes.'],BUSY:[409,'Otra operación está en curso. Consultá o reintentá el mismo envío.']};
export function annualBudgetError(e){
 if(e instanceof AnnualBudgetHttpError)return e;
 if(e instanceof AnnualBudgetError)return new AnnualBudgetHttpError(e.code,e.code==='CONTRACT_INVALID'?503:422,e.message);
 const m=String(e?.message??'');if(/SESSION_INVALID/.test(m+' '+e?.code))return new AnnualBudgetHttpError('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar.');
 if(/NATIVE_EMPLOYEE_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m))return new AnnualBudgetHttpError('FORBIDDEN',403,errors.FORBIDDEN[1]);
 for(const [code,[status,message]] of Object.entries(errors))if(new RegExp('\\bANNUAL_BUDGET_'+code+'\\b').test(m))return new AnnualBudgetHttpError(code,status,message);
 return new AnnualBudgetHttpError('UNAVAILABLE',503,'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function annualBudgetOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){if(!budgetYear(input.year))budgetFail('INPUT_INVALID',400,'Elegí un ejercicio válido.');query='SELECT public.annual_budget_bootstrap_v1($1::jsonb,$2::integer) AS result';values=[ctx,input.year];}
  else{if(!salaryKey(input.key))budgetFail('INPUT_INVALID',428,'Se requiere una referencia de intento.');if(operation==='attempt'){query='SELECT public.annual_budget_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}else if(operation==='command'){body=annualBudgetCommand(input.body);query='SELECT public.annual_budget_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(body),input.key];}else budgetFail('INPUT_INVALID',400,'Operación no admitida.');}
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(operation==='bootstrap'){annualBudgetBootstrap(result,input.year);for(const p of result.proposals)if(annualBudgetFingerprint(p.body)!==p.requestSha256)budgetFail('CONTRACT_INVALID',503,'La propuesta no tiene una huella verificable.');if(result.catalog.definition&&annualBudgetFingerprint(result.catalog.definition)!==result.catalog.definitionSha256)budgetFail('CONTRACT_INVALID',503,'La versión anual no tiene una huella verificable.');return result;}
  annualBudgetReceipt(result,body?{key:input.key,body}:null);if(result.requestKey!==input.key||annualBudgetFingerprint(result.body)!==result.requestSha256)budgetFail('CONTRACT_INVALID',503,'No se verificó el contenido del intento.');return result;
 }catch(e){const safe=annualBudgetError(e);if(safe!==e)safe.cause=e;throw safe;}
}
