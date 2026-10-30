import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {salaryKey,salaryUuid,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {ownNoveltyBootstrap,ownNoveltyBatch,ownNoveltyReceipt,ownNoveltyCommand,ownNoveltySuccessionContext,ownNoveltyAffectedStatePreimage} from '../assets/own-payroll-novelties-model.js';
export const ownNoveltyHash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
export const noveltyFail=(code,status,message)=>{throw Object.assign(new Error(message),{code:'OWN_NOVELTY_'+code,status});};
const errors={FORBIDDEN:[403,'Tu membresía no permite esta operación.'],INDEPENDENT_REQUIRED:[403,'La revisión requiere otra persona y membresía habilitadas.'],NOT_FOUND:[404,'No se encontró el lote o intento dentro de tu acceso.'],IDENTITY_CHANGED:[409,'Cambió una identidad. Actualizá y revisá el lote completo.'],VERSION_CHANGED:[409,'Cambió el estado del lote. Actualizá antes de decidir.'],AFFECTED_STATE_CHANGED:[409,'Cambió un cálculo o cierre afectado. Volvé a revisar la corrección y sus usos antes de un envío nuevo.'],SOURCE_IN_USE:[409,'Primero anulá los cálculos confirmados y reabrí los cierres afectados. Después revisá la corrección nuevamente.'],STATE_INVALID:[409,'El lote no admite esta operación.'],IN_USE:[409,'Una corrida ya capturó este lote. Usá Corregir este lote para conservar su versión y preparar el reemplazo.'],DUPLICATE_BATCH:[409,'Ya existe un lote activo con este contenido completo.'],CONFLICT:[409,'Otro lote activo contiene una novedad con el mismo destino. Revisá los lotes completos.'],IDEMPOTENCY_REUSE:[409,'El intento pertenece a otro contenido. Recuperá el envío original.'],LIMIT:[422,'Se alcanzó una capacidad global. No se guardó ni recortó el lote.'],BUSY:[409,'Otra operación está en curso. Recuperá o reintentá el mismo envío.'],INPUT_INVALID:[422,'Revisá el lote completo, sus valores y referencias.']};
Object.assign(errors,{
 SUCCESSION_PARENT_CHANGED:[409,'Cambió o fue reemplazado el lote anterior. Abrí su detalle vigente antes de preparar otra corrección.'],
 SUCCESSION_PENDING:[409,'Ya hay una corrección pendiente para este lote. Consultala antes de crear otra.'],
 SUCCESSION_ROWS_CHANGED:[422,'La corrección debe conservar todas las filas y modificar al menos un valor o fundamento. Revisá el lote completo.'],
 SUCCESSION_DESTINATION_CHANGED:[422,'Conservá los legajos, conceptos, centros de costo y movimientos originales; corregí sólo valores y fundamentos.'],
 SUCCESSION_INPUT_INVALID:[422,'Revisá el motivo, los valores y la confirmación de los usos afectados de esta corrección.'],
 SUCCESSION_CONTRACT_INVALID:[503,'No se verificó la integridad del historial de correcciones. Conservá el intento y solicitá revisar su trazabilidad.'],
 SUCCESSION_VERSION_REQUIRED:[409,'La corrección requiere su formulario actualizado. Recuperá primero el intento original y volvé a abrir su revisión.'],
 SUCCESSION_AFFECTED_STATE_CHANGED:[409,'Cambió un cálculo o cierre afectado. Volvé a revisar todos los usos antes de confirmar un envío nuevo.'],
 SUCCESSION_ACTIVE_USE:[409,'Primero anulá los cálculos confirmados y reabrí los cierres afectados. Después volvé a revisar la aprobación.'],
 SUCCESSOR_EFFECTIVE:[409,'Este reemplazo ya fue aprobado y no se cancela para recuperar valores anteriores. Prepará una nueva corrección explícita.']
});
export function ownNoveltyError(e){
 if(e?.code?.startsWith('OWN_NOVELTY_'))return e;
 const msg=String(e?.message??'');if(/SESSION_INVALID/.test(msg)||/SESSION_INVALID/.test(String(e?.code??'')))return Object.assign(new Error('La sesión venció. Volvé a ingresar.'),{code:'OWN_NOVELTY_SESSION_INVALID',status:401});
 if(/\bPAYROLL_FIXED_JURISDICTION_REQUIRED\b/.test(msg))return Object.assign(new Error('Este antecedente conserva la jurisdicción pendiente. Revisá y declarala antes de preparar novedades.'),{code:'OWN_NOVELTY_JURISDICTION_REQUIRED',status:422});
 if(/FORBIDDEN|AUTHORITY_REQUIRED|SOD_CONFLICT/.test(msg))return Object.assign(new Error(errors.FORBIDDEN[1]),{code:'OWN_NOVELTY_FORBIDDEN',status:403});
 if(/PAYROLL_(FIXED|NOVELTY)_(IDENTITY|SUBJECT|DATES|EMPLOYEE|PERIOD)/.test(msg))return Object.assign(new Error(errors.IDENTITY_CHANGED[1]),{code:'OWN_NOVELTY_IDENTITY_CHANGED',status:409});
 if(['55P03','40P01'].includes(e?.code)||/could not obtain lock|deadlock detected/.test(msg))return Object.assign(new Error(errors.BUSY[1]),{code:'OWN_NOVELTY_BUSY',status:409});
 for(const [code,[status,message]]of Object.entries(errors))if(new RegExp('\\bOWN_NOVELTY_'+code+'\\b').test(msg))return Object.assign(new Error(message),{code:'OWN_NOVELTY_'+code,status});
 return Object.assign(new Error('No se confirmó la operación. Recuperá el mismo intento antes de iniciar otro.'),{code:'OWN_NOVELTY_UNAVAILABLE',status:503});
}
export function verifyOwnNoveltyHashes(batch){ownNoveltyBatch(batch);if(batch.rowsSha256!==ownNoveltyHash(batch.rows.map(({values,subject})=>({values,subject}))))noveltyFail('CONTRACT_INVALID',503,'No se verificó la integridad del lote completo.');return batch;}
export function verifyOwnNoveltySuccessionContext(value){ownNoveltySuccessionContext(value);verifyOwnNoveltyHashes(value.batch);if(value.snapshotSha256!==ownNoveltyHash(value.batch))noveltyFail('CONTRACT_INVALID',503,'No se verificó la versión íntegra del lote anterior.');if(value.affectedStateVersion!==ownNoveltyHash(ownNoveltyAffectedStatePreimage(value)))noveltyFail('CONTRACT_INVALID',503,'No se verificó el conjunto completo de cálculos y cierres afectados.');return value;}
export async function ownNoveltyOperation(sql,principal,session,operation,input={}){
 try{
  const context=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){query='SELECT public.own_novelty_bootstrap_v1($1::jsonb) AS result';values=[context];}
  else if(operation==='detail'){if(!salaryUuid(input.id))noveltyFail('INPUT_INVALID',400,'Identificador de lote inválido.');query='SELECT public.own_novelty_detail_v1($1::jsonb,$2::uuid) AS result';values=[context,input.id];}
  else if(operation==='succession'){if(!salaryUuid(input.id))noveltyFail('INPUT_INVALID',400,'Identificador de lote inválido.');query='SELECT public.own_novelty_succession_context_v1($1::jsonb,$2::uuid) AS result';values=[context,input.id];}
  else{if(!salaryKey(input.key))noveltyFail('INPUT_INVALID',428,'Se requiere la referencia del intento.');
   if(operation==='attempt'){query='SELECT public.own_novelty_attempt_v1($1::jsonb,$2::uuid) AS result';values=[context,input.key];}
   else if(operation==='command'){body=ownNoveltyCommand(input.body);query='SELECT public.own_novelty_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[context,JSON.stringify(body),input.key];}
   else noveltyFail('INPUT_INVALID',400,'Operación inválida.');
  }
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(operation==='bootstrap')return ownNoveltyBootstrap(result);
  if(operation==='detail')return verifyOwnNoveltyHashes(result);
  if(operation==='succession')return verifyOwnNoveltySuccessionContext(result);
  ownNoveltyReceipt(result,body?{key:input.key,body}:null);verifyOwnNoveltyHashes(result.snapshot);
  if(result.requestKey!==input.key||result.requestSha256!==ownNoveltyHash(result.body))noveltyFail('CONTRACT_INVALID',503,'El intento no conserva su contenido original.');return result;
 }catch(e){throw ownNoveltyError(e);}
}
