import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {salaryKey,salaryUuid,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {ownNoveltyBootstrap,ownNoveltyBatch,ownNoveltyReceipt,ownNoveltyCommand} from '../assets/own-payroll-novelties-model.js';
export const ownNoveltyHash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
export const noveltyFail=(code,status,message)=>{throw Object.assign(new Error(message),{code:'OWN_NOVELTY_'+code,status});};
const errors={FORBIDDEN:[403,'Tu membresía no permite esta operación.'],INDEPENDENT_REQUIRED:[403,'La revisión requiere otra persona y membresía habilitadas.'],NOT_FOUND:[404,'No se encontró el lote o intento dentro de tu acceso.'],IDENTITY_CHANGED:[409,'Cambió una identidad. Actualizá y revisá el lote completo.'],VERSION_CHANGED:[409,'Cambió el estado del lote. Actualizá antes de decidir.'],STATE_INVALID:[409,'El lote no admite esta operación.'],IN_USE:[409,'Una corrida ya capturó este lote. Conservá su versión y revisá la corrección del cálculo.'],DUPLICATE_BATCH:[409,'Ya existe un lote activo con este contenido completo.'],CONFLICT:[409,'Otro lote activo contiene una novedad con el mismo destino. Revisá los lotes completos.'],IDEMPOTENCY_REUSE:[409,'El intento pertenece a otro contenido. Recuperá el envío original.'],LIMIT:[422,'Se alcanzó una capacidad global. No se guardó ni recortó el lote.'],BUSY:[409,'Otra operación está en curso. Recuperá o reintentá el mismo envío.'],INPUT_INVALID:[422,'Revisá el lote completo, sus valores y referencias.']};
export function ownNoveltyError(e){
 if(e?.code?.startsWith('OWN_NOVELTY_'))return e;
 const msg=String(e?.message??'');if(/SESSION_INVALID/.test(msg)||/SESSION_INVALID/.test(String(e?.code??'')))return Object.assign(new Error('La sesión venció. Volvé a ingresar.'),{code:'OWN_NOVELTY_SESSION_INVALID',status:401});
 if(/FORBIDDEN|AUTHORITY_REQUIRED|SOD_CONFLICT/.test(msg))return Object.assign(new Error(errors.FORBIDDEN[1]),{code:'OWN_NOVELTY_FORBIDDEN',status:403});
 if(/PAYROLL_(FIXED|NOVELTY)_(IDENTITY|SUBJECT|DATES|EMPLOYEE|PERIOD)/.test(msg))return Object.assign(new Error(errors.IDENTITY_CHANGED[1]),{code:'OWN_NOVELTY_IDENTITY_CHANGED',status:409});
 if(['55P03','40P01'].includes(e?.code)||/could not obtain lock|deadlock detected/.test(msg))return Object.assign(new Error(errors.BUSY[1]),{code:'OWN_NOVELTY_BUSY',status:409});
 for(const [code,[status,message]]of Object.entries(errors))if(new RegExp('\\bOWN_NOVELTY_'+code+'\\b').test(msg))return Object.assign(new Error(message),{code:'OWN_NOVELTY_'+code,status});
 return Object.assign(new Error('No se confirmó la operación. Recuperá el mismo intento antes de iniciar otro.'),{code:'OWN_NOVELTY_UNAVAILABLE',status:503});
}
export function verifyOwnNoveltyHashes(batch){ownNoveltyBatch(batch);if(batch.rowsSha256!==ownNoveltyHash(batch.rows.map(({values,subject})=>({values,subject}))))noveltyFail('CONTRACT_INVALID',503,'No se verificó la integridad del lote completo.');return batch;}
export async function ownNoveltyOperation(sql,principal,session,operation,input={}){
 try{
  const context=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){query='SELECT public.own_novelty_bootstrap_v1($1::jsonb) AS result';values=[context];}
  else if(operation==='detail'){if(!salaryUuid(input.id))noveltyFail('INPUT_INVALID',400,'Identificador de lote inválido.');query='SELECT public.own_novelty_detail_v1($1::jsonb,$2::uuid) AS result';values=[context,input.id];}
  else{if(!salaryKey(input.key))noveltyFail('INPUT_INVALID',428,'Se requiere la referencia del intento.');
   if(operation==='attempt'){query='SELECT public.own_novelty_attempt_v1($1::jsonb,$2::uuid) AS result';values=[context,input.key];}
   else if(operation==='command'){body=ownNoveltyCommand(input.body);query='SELECT public.own_novelty_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[context,JSON.stringify(body),input.key];}
   else noveltyFail('INPUT_INVALID',400,'Operación inválida.');
  }
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(operation==='bootstrap')return ownNoveltyBootstrap(result);
  if(operation==='detail')return verifyOwnNoveltyHashes(result);
  ownNoveltyReceipt(result,body?{key:input.key,body}:null);verifyOwnNoveltyHashes(result.snapshot);
  if(result.requestKey!==input.key||result.requestSha256!==ownNoveltyHash(result.body))noveltyFail('CONTRACT_INVALID',503,'El intento no conserva su contenido original.');return result;
 }catch(e){throw ownNoveltyError(e);}
}
