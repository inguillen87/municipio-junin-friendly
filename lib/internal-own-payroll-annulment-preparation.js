import {employeeContext} from './internal-native-employees.js';
import {principalHasCapabilities} from './internal-resource-access.js';
import {salaryExact,salaryUuid} from '../assets/native-salary-catalog-model.js';
import {ownRunBootstrap,OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {OWN_RUN_PREPARE} from '../assets/own-payroll-run-workspace-model.js';
import {OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {verifiedOwnAnnulPreparation} from '../assets/own-payroll-annulment-preparation-model.js';

export {OWN_RUN_PREPARE};
export class OwnAnnulPreparationError extends Error{
 constructor(code,status,message){super(message);Object.assign(this,{code:'OWN_ANNUL_PREPARATION_'+code,status});}
}
export const annulPreparationFail=(code,status,message)=>{throw new OwnAnnulPreparationError(code,status,message);};
const errors={
 NOT_FOUND:[404,'No se encontró la anulación en tu ámbito municipal.'],
 SOURCE_CHANGED:[409,'Cambió la fuente o tu ámbito de preparación. Actualizá la anulación antes de continuar.'],
 CURRENT_STATE_CHANGED:[409,'Cambió una liquidación del alcance anulado. Actualizá la consulta completa antes de preparar otro cálculo.'],
 FORBIDDEN:[403,'Tu membresía no permite preparar este alcance nominal.'],
 CONTRACT_INVALID:[503,'No se verificó la entrega completa para preparar otro cálculo. Actualizá la referencia desde tu sesión municipal.'],
 LIMIT:[422,'El alcance completo supera la capacidad de lectura. No se recortaron ni dividieron filas.'],
 SESSION_INVALID:[401,'La sesión municipal venció. Volvé a ingresar.'],
 UNAVAILABLE:[503,'No se pudo consultar la preparación. No se creó ningún cálculo; volvé a consultar la misma referencia.']
};
export function annulPreparationError(error){
 if(error instanceof OwnAnnulPreparationError)return error;
 const message=String(error?.message??'');
 for(const code of ['NOT_FOUND','SOURCE_CHANGED','CURRENT_STATE_CHANGED','FORBIDDEN','CONTRACT_INVALID','LIMIT'])
  if(new RegExp('\\bOWN_ANNUL_PREPARATION_'+code+'\\b').test(message))return new OwnAnnulPreparationError(code,...errors[code]);
 if(/\b(?:ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID)\b/.test(message)||error?.code==='NATIVE_EMPLOYEE_SESSION_INVALID')return new OwnAnnulPreparationError('SESSION_INVALID',...errors.SESSION_INVALID);
 if(/\b(?:OWN_RUN_FORBIDDEN|NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT|CAPABILITY_REQUIRED|NOMINAL_READ_REQUIRED)\b/.test(message))return new OwnAnnulPreparationError('FORBIDDEN',...errors.FORBIDDEN);
 if(/\bOWN_RUN_LIMIT\b/.test(message))return new OwnAnnulPreparationError('LIMIT',...errors.LIMIT);
 // A malformed DTO/model rejection or unrecognised database error is never
 // returned verbatim. The DTO hash proves declared content, not SQL authority.
 if(String(error?.code??'').startsWith('OWN_ANNUL_PREPARATION_'))return new OwnAnnulPreparationError('CONTRACT_INVALID',...errors.CONTRACT_INVALID);
 return new OwnAnnulPreparationError('UNAVAILABLE',...errors.UNAVAILABLE);
}
const responseBudget=(value,limit)=>{
 if(Buffer.byteLength(JSON.stringify({ok:true,data:value}),'utf8')>limit)annulPreparationFail('LIMIT',...errors.LIMIT);
 return value;
};
function currentBootstrap(value){
 try{ownRunBootstrap(value);}catch{annulPreparationFail('CONTRACT_INVALID',...errors.CONTRACT_INVALID);}
 if(value.version!=='own-payroll-bootstrap.v2')annulPreparationFail('CONTRACT_INVALID',...errors.CONTRACT_INVALID);
 if(value.canCalculate!==true)annulPreparationFail('FORBIDDEN',...errors.FORBIDDEN);
 return value;
}

// Read-only purpose projection for the CURRENT preparer. No attempt/receipt or
// full capture is read under a historical creator/checker context. All three
// calls must authorise the same actual session in PostgreSQL; this service does
// not claim an atomic association with a later, voluntary calculation command.
export async function ownAnnulPreparationOperation(sql,principal,session,operation,input={},deps={}){
 try{
  if(operation!=='detail'||!salaryExact(input,['id'])||!salaryUuid(input.id))annulPreparationFail('INPUT_INVALID',400,'Elegí una anulación municipal guardada.');
  if(!principalHasCapabilities(principal,OWN_RUN_PREPARE))annulPreparationFail('FORBIDDEN',...errors.FORBIDDEN);
  const sourceId=input.id,ctx=JSON.stringify(employeeContext(principal,session));
  const fullJson=deps.fullJson===true,limit=fullJson?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE;
  const query=async(statement,values)=>{const rows=await sql.query(statement,values);return(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;};
  const readBootstrap=async()=>currentBootstrap(responseBudget(await query('SELECT public.own_run_bootstrap_v2($1::jsonb) AS result',[ctx]),limit));
  const before=await readBootstrap(),scopeVersion=before.scopeVersion;
  const value=await query(fullJson?'SELECT public.own_annul_preparation_full_v1($1::jsonb,$2::uuid) AS result':'SELECT public.own_annul_preparation_v1($1::jsonb,$2::uuid) AS result',[ctx,sourceId]);
  // Freeze and validate every affected row and every date before any local date
  // selection. The model rejects extra fields, partial sets and changed hashes.
  const verified=await verifiedOwnAnnulPreparation(responseBudget(value,limit),{scopeVersion,sourceId});
  const after=await readBootstrap();
  if(after.scopeVersion!==scopeVersion||JSON.stringify(employeeContext(principal,session))!==ctx)annulPreparationFail('SOURCE_CHANGED',...errors.SOURCE_CHANGED);
  if(!principalHasCapabilities(principal,OWN_RUN_PREPARE))annulPreparationFail('FORBIDDEN',...errors.FORBIDDEN);
  return responseBudget(verified,limit);
 }catch(error){throw annulPreparationError(error);}
}
