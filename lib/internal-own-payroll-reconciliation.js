import {employeeContext} from './internal-native-employees.js';
import {SalaryInputError,salaryKey,salaryUuid} from '../assets/native-salary-catalog-model.js';
import {RECONCILIATION_READ,RECONCILIATION_CAPS,reconciliationBootstrap,reconciliationCommand,reconciliationReceipt,reconciliationDetail,reconciliationSource} from '../assets/own-payroll-reconciliation-model.js';
export {RECONCILIATION_READ,RECONCILIATION_CAPS};
export class ReconciliationError extends Error{
 constructor(code,status,message){super(message);Object.assign(this,{code:code.startsWith('RECONCILIATION_')?code:'RECONCILIATION_'+code,status});}
}
export const reconciliationFail=(code,status,message)=>{throw new ReconciliationError(code,status,message);};
const errors={
 INPUT_INVALID:[422,'Revisá el asiento, documento, fecha, cuentas e importes completos.'],
 FORBIDDEN:[403,'Tu cuenta no permite esta operación.'],
 EMPLOYMENT_REQUIRED:[403,'La operación requiere una identidad municipal vinculada.'],
 NOT_FOUND:[404,'No se encontró el asiento, propuesta o intento dentro de tu acceso.'],
 SOURCE_CHANGED:[409,'El asiento cambió o fue revertido. Conservá la propuesta y consultá nuevamente.'],
 SCOPE_CHANGED:[409,'Cambió la cuenta o el ámbito. Consultá el intento desde su cuenta original.'],
 INDEPENDENT_REQUIRED:[403,'La decisión requiere otra persona habilitada.'],
 IDEMPOTENCY_REUSE:[409,'La referencia pertenece a otro contenido. Consultá el mismo intento.'],
 DECIDED:[409,'La constancia ya tiene una decisión o retiro. Actualizá la consulta.'],
 PROPOSAL_CHANGED:[409,'La decisión corresponde a otra propuesta o versión.'],
 REVIEW_REQUIRED:[422,'Resolvé todas las diferencias y los importes no informados antes de proponer.'],
 DUPLICATE:[409,'Este asiento ya tiene una conciliación pendiente o aprobada. Consultá su historial antes de preparar otra.'],
 LIMIT:[422,'El conjunto alcanzó su capacidad. No se recortaron cuentas, renglones ni constancias.'],
 BUSY:[409,'Otra operación está en curso. Consultá o reintentá el mismo envío.']
};
export function reconciliationError(e){
 if(e instanceof ReconciliationError)return e;
 if(e instanceof SalaryInputError)return new ReconciliationError(e.code,/CONTRACT_INVALID/.test(e.code)?503:422,e.message);
 const m=String(e?.message??'');
 if(/SESSION_INVALID/.test(m+' '+String(e?.code??'')))return new ReconciliationError('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar.');
 if(/(?:OWN_(?:CLOSE|RUN)|NATIVE_(?:EMPLOYEE|SALARY|EMPLOYMENT_CHANGE)|JOURNAL)_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m))return new ReconciliationError('FORBIDDEN',403,errors.FORBIDDEN[1]);
 if(/OWN_RUN_EMPLOYMENT_REQUIRED/.test(m))return new ReconciliationError('EMPLOYMENT_REQUIRED',403,errors.EMPLOYMENT_REQUIRED[1]);
 if(/(?:OWN_RUN|NATIVE_SALARY|NATIVE_EMPLOYMENT_CATALOG|ACCOUNTING|IMPUTATION|JOURNAL)_BUSY/.test(m))return new ReconciliationError('BUSY',409,errors.BUSY[1]);
 if(/JOURNAL_SOURCE_CHANGED|JOURNAL_DECIDED|IMPUTATION_REOPENED/.test(m))return new ReconciliationError('SOURCE_CHANGED',409,errors.SOURCE_CHANGED[1]);
 if(/JOURNAL_NOT_FOUND/.test(m))return new ReconciliationError('NOT_FOUND',404,errors.NOT_FOUND[1]);
 for(const [code,[status,message]]of Object.entries(errors))if(new RegExp('\\bRECONCILIATION_'+code+'\\b').test(m))return new ReconciliationError(code,status,message);
 return new ReconciliationError('UNAVAILABLE',503,'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function reconciliationOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){query='SELECT public.own_reconciliation_bootstrap_v1($1::jsonb,$2::text,$3::text) AS result';values=[ctx,input.period,input.liquidationType];}
  else if(operation==='source'||operation==='detail'){
   if(!salaryUuid(input.id))reconciliationFail('INPUT_INVALID',400,'Elegí un asiento o constancia válidos.');
   query=operation==='source'?'SELECT public.own_reconciliation_source_v1($1::jsonb,$2::uuid) AS result':'SELECT public.own_reconciliation_detail_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.id];
  }else{
   if(!salaryKey(input.key))reconciliationFail('INPUT_INVALID',428,'La operación requiere una referencia de intento.');
   if(operation==='attempt'){query='SELECT public.own_reconciliation_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
   else if(operation==='command'){body=reconciliationCommand(input.body);query='SELECT public.own_reconciliation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(body),input.key];}
   else reconciliationFail('INPUT_INVALID',400,'Operación no admitida.');
  }
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(Buffer.byteLength(JSON.stringify(result)??'')>16777216)reconciliationFail('CONTRACT_INVALID',503,'No se verificó la consulta completa. No se muestran filas parciales.');
  if(operation==='bootstrap'){
   reconciliationBootstrap(result);if(result.period!==input.period||result.liquidationType!==input.liquidationType)reconciliationFail('CONTRACT_INVALID',503,'La consulta devolvió otro período o tipo.');
  }else if(operation==='source'){
   await reconciliationSource(result);if(result.journal.id.toLowerCase()!==input.id.toLowerCase())reconciliationFail('CONTRACT_INVALID',503,'La consulta devolvió otro asiento.');
  }else if(operation==='detail'){
   await reconciliationDetail(result);if(![result.id,result.proposalId,result.decision?.id,result.withdrawal?.id].filter(Boolean).some(v=>v.toLowerCase()===input.id.toLowerCase()))reconciliationFail('CONTRACT_INVALID',503,'La consulta devolvió otra constancia.');
  }else{
   await reconciliationReceipt(result,body?{key:input.key,body}:null);if(result.requestKey!==input.key)reconciliationFail('CONTRACT_INVALID',503,'La consulta cambió la referencia del intento.');
  }
  return result;
 }catch(e){throw reconciliationError(e);}
}
