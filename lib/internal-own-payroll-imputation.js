import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {SalaryInputError,salaryKey,salaryUuid,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {IMPUTATION_READ,IMPUTATION_CAPS,imputationBootstrap,imputationCommand,verifiedImputationReceipt,imputationDetail,imputationPreview} from '../assets/own-payroll-imputation-workspace-model.js';
export {IMPUTATION_READ,IMPUTATION_CAPS};
export class ImputationError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:code.startsWith('IMPUTATION_')?code:'IMPUTATION_'+code,status});}}
export const imputationFail=(code,status,message)=>{throw new ImputationError(code,status,message);};
export const imputationFingerprint=body=>createHash('sha256').update(salarySerialized(body)).digest('hex');
const errors={INPUT_INVALID:[422,'Revisá grupo, año y motivo completos.'],FORBIDDEN:[403,'Tu cuenta no permite esta operación.'],EMPLOYMENT_REQUIRED:[403,'La operación requiere una identidad municipal vinculada.'],NOT_FOUND:[404,'No se encontró la propuesta o el intento dentro de tu acceso.'],SOURCE_CHANGED:[409,'Cambió el cierre, la configuración o su revisión. Consultá y revisá nuevamente.'],SCOPE_CHANGED:[409,'Cambió la cuenta o el ámbito. Consultá el intento desde su cuenta original.'],INDEPENDENT_REQUIRED:[403,'La decisión requiere otra persona habilitada.'],IDEMPOTENCY_REUSE:[409,'La referencia pertenece a otro contenido. Consultá el mismo intento.'],DECIDED:[409,'La propuesta ya tiene una decisión. Actualizá la consulta.'],PROPOSAL_CHANGED:[409,'La decisión corresponde a otra propuesta o versión.'],REOPENED:[409,'Este cierre fue reabierto. Consultá su historial; no puede imputarse.'],REVIEW_REQUIRED:[422,'Resolvé todas las observaciones antes de proponer la imputación.'],DUPLICATE:[409,'Ya existe una propuesta pendiente o aprobada para esta misma fuente. Consultá su historial.'],LIMIT:[422,'El conjunto alcanzó su capacidad. No se recortaron conceptos ni propuestas.'],BUSY:[409,'Otra operación está en curso. Consultá o reintentá el mismo envío.']};
export function imputationError(e){
 if(e instanceof ImputationError)return e;
 if(e instanceof SalaryInputError)return new ImputationError(e.code,/CONTRACT_INVALID/.test(e.code)?503:422,e.message);
 const m=String(e?.message??'');if(/SESSION_INVALID/.test(m+' '+String(e?.code??'')))return new ImputationError('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar.');
 if(/(?:OWN_(?:CLOSE|RUN)|NATIVE_(?:EMPLOYEE|SALARY|EMPLOYMENT_CHANGE))_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m))return new ImputationError('FORBIDDEN',403,errors.FORBIDDEN[1]);
 if(/OWN_RUN_EMPLOYMENT_REQUIRED/.test(m))return new ImputationError('EMPLOYMENT_REQUIRED',403,errors.EMPLOYMENT_REQUIRED[1]);
 if(/(?:OWN_RUN|NATIVE_SALARY|NATIVE_EMPLOYMENT_CATALOG|ACCOUNTING)_BUSY/.test(m))return new ImputationError('BUSY',409,errors.BUSY[1]);
 for(const [code,[status,message]]of Object.entries(errors))if(new RegExp('\\bIMPUTATION_'+code+'\\b').test(m))return new ImputationError(code,status,message);
 return new ImputationError('UNAVAILABLE',503,'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function imputationOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){query='SELECT public.own_imputation_bootstrap_v1($1::jsonb,$2::text,$3::text) AS result';values=[ctx,input.period,input.liquidationType];}
  else if(operation==='source'){if(!salaryUuid(input.id)||typeof input.fiscalYear!=='string'||!/^(19|20)[0-9]{2}$/.test(input.fiscalYear))imputationFail('INPUT_INVALID',400,'Elegí grupo y año válidos.');query='SELECT public.own_imputation_source_v1($1::jsonb,$2::uuid,$3::text) AS result';values=[ctx,input.id,input.fiscalYear];}
  else if(operation==='detail'){if(!salaryUuid(input.id))imputationFail('INPUT_INVALID',400,'Elegí una propuesta válida.');query='SELECT public.own_imputation_detail_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.id];}
  else{if(!salaryKey(input.key))imputationFail('INPUT_INVALID',428,'La operación requiere una referencia de intento.');
   if(operation==='attempt'){query='SELECT public.own_imputation_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
   else if(operation==='command'){body=imputationCommand(input.body);query='SELECT public.own_imputation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(body),input.key];}
   else imputationFail('INPUT_INVALID',400,'Operación no admitida.');
  }
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(Buffer.byteLength(JSON.stringify(result)??'')>16777216)imputationFail('LIMIT',503,'No se verificó la consulta completa. No se muestran filas parciales.');
  if(operation==='bootstrap'){imputationBootstrap(result);if(result.period!==input.period||result.liquidationType!==input.liquidationType)imputationFail('CONTRACT_INVALID',503,'La consulta devolvió otro período o tipo.');}
  else if(operation==='source'){await imputationPreview(result);if(result.source.group.groupId.toLowerCase()!==input.id.toLowerCase()||result.source.fiscalYear!==input.fiscalYear)imputationFail('CONTRACT_INVALID',503,'La consulta devolvió otra fuente.');}
  else if(operation==='detail'){await imputationDetail(result);if(result.proposal.id.toLowerCase()!==input.id.toLowerCase())imputationFail('CONTRACT_INVALID',503,'La consulta devolvió otra propuesta.');}
  else{await verifiedImputationReceipt(result,body?{key:input.key,body}:null);if(result.requestKey!==input.key)imputationFail('CONTRACT_INVALID',503,'La consulta cambió la referencia del intento.');}
  return result;
 }catch(e){throw imputationError(e);}
}
