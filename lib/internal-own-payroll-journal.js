import {employeeContext} from './internal-native-employees.js';
import {SalaryInputError,salaryKey,salaryUuid} from '../assets/native-salary-catalog-model.js';
import {JOURNAL_READ,JOURNAL_CAPS,journalBootstrap,journalCommand,journalReceipt,journalDetail,journalSource} from '../assets/own-payroll-journal-model.js';
export {JOURNAL_READ,JOURNAL_CAPS};
export class JournalError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:code.startsWith('JOURNAL_')?code:'JOURNAL_'+code,status});}}
export const journalFail=(code,status,message)=>{throw new JournalError(code,status,message);};
const errors={INPUT_INVALID:[422,'Revisá fuente, fecha, sentido, contrapartidas y motivo completos.'],FORBIDDEN:[403,'Tu cuenta no permite esta operación.'],EMPLOYMENT_REQUIRED:[403,'La operación requiere una identidad municipal vinculada.'],NOT_FOUND:[404,'No se encontró la propuesta o el intento dentro de tu acceso.'],SOURCE_CHANGED:[409,'Cambió la fuente o su revisión. Conservá la propuesta y consultá nuevamente.'],SCOPE_CHANGED:[409,'Cambió la cuenta o el ámbito. Consultá el intento desde su cuenta original.'],INDEPENDENT_REQUIRED:[403,'La decisión requiere otra persona habilitada.'],IDEMPOTENCY_REUSE:[409,'La referencia pertenece a otro contenido. Consultá el mismo intento.'],DECIDED:[409,'El asiento ya tiene una decisión o reversión. Actualizá la consulta.'],PROPOSAL_CHANGED:[409,'La decisión corresponde a otra propuesta o versión.'],REVIEW_REQUIRED:[422,'Resolvé las observaciones de todos los destinos antes de proponer.'],DUPLICATE:[409,'Estos contratos y período ya tienen un asiento pendiente o registrado. Consultá el libro; corresponde revisar o revertir el original antes de registrar otro.'],LIMIT:[422,'El conjunto alcanzó su capacidad. No se recortaron destinos, conceptos ni asientos.'],BUSY:[409,'Otra operación está en curso. Consultá o reintentá el mismo envío.']};
export function journalError(e){
 if(e instanceof JournalError)return e;
 if(e instanceof SalaryInputError)return new JournalError(e.code,/CONTRACT_INVALID/.test(e.code)?503:422,e.message);
 const m=String(e?.message??'');if(/SESSION_INVALID/.test(m+' '+String(e?.code??'')))return new JournalError('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar.');
 if(/(?:OWN_(?:CLOSE|RUN)|NATIVE_(?:EMPLOYEE|SALARY|EMPLOYMENT_CHANGE))_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m))return new JournalError('FORBIDDEN',403,errors.FORBIDDEN[1]);
 if(/OWN_RUN_EMPLOYMENT_REQUIRED/.test(m))return new JournalError('EMPLOYMENT_REQUIRED',403,errors.EMPLOYMENT_REQUIRED[1]);
 if(/(?:OWN_RUN|NATIVE_SALARY|NATIVE_EMPLOYMENT_CATALOG|ACCOUNTING|IMPUTATION)_BUSY/.test(m))return new JournalError('BUSY',409,errors.BUSY[1]);
 if(/IMPUTATION_REOPENED/.test(m))return new JournalError('SOURCE_CHANGED',409,errors.SOURCE_CHANGED[1]);
 if(/IMPUTATION_NOT_FOUND/.test(m))return new JournalError('NOT_FOUND',404,errors.NOT_FOUND[1]);
 for(const [code,[status,message]]of Object.entries(errors))if(new RegExp('\\bJOURNAL_'+code+'\\b').test(m))return new JournalError(code,status,message);
 return new JournalError('UNAVAILABLE',503,'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function journalOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){query='SELECT public.own_journal_bootstrap_v1($1::jsonb,$2::text,$3::text) AS result';values=[ctx,input.period,input.liquidationType];}
  else if(operation==='source'){if(!salaryUuid(input.id)||!['imputation','journal'].includes(input.basis))journalFail('INPUT_INVALID',400,'Elegí una fuente válida.');query='SELECT public.own_journal_source_v1($1::jsonb,$2::text,$3::uuid) AS result';values=[ctx,input.basis,input.id];}
  else if(operation==='detail'){if(!salaryUuid(input.id))journalFail('INPUT_INVALID',400,'Elegí un asiento válido.');query='SELECT public.own_journal_detail_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.id];}
  else{if(!salaryKey(input.key))journalFail('INPUT_INVALID',428,'La operación requiere una referencia de intento.');
   if(operation==='attempt'){query='SELECT public.own_journal_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}
   else if(operation==='command'){body=journalCommand(input.body);query='SELECT public.own_journal_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(body),input.key];}
   else journalFail('INPUT_INVALID',400,'Operación no admitida.');
  }
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(Buffer.byteLength(JSON.stringify(result)??'')>16777216)journalFail('LIMIT',503,'No se verificó la consulta completa. No se muestran filas parciales.');
  if(operation==='bootstrap'){journalBootstrap(result);if(result.period!==input.period||result.liquidationType!==input.liquidationType)journalFail('CONTRACT_INVALID',503,'La consulta devolvió otro período o tipo.');}
  else if(operation==='source'){await journalSource(result);if(result.basis!==input.basis||(result.basis==='imputation'?result.imputation.proposal.id:result.original.id).toLowerCase()!==input.id.toLowerCase())journalFail('CONTRACT_INVALID',503,'La consulta devolvió otra fuente.');}
  else if(operation==='detail'){await journalDetail(result);if(![result.id,result.proposalId].some(v=>v.toLowerCase()===input.id.toLowerCase()))journalFail('CONTRACT_INVALID',503,'La consulta devolvió otra propuesta.');}
  else{await journalReceipt(result,body?{key:input.key,body}:null);if(result.requestKey!==input.key)journalFail('CONTRACT_INVALID',503,'La consulta cambió la referencia del intento.');}return result;
 }catch(e){throw journalError(e);}
}
