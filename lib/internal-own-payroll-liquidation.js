import {employeeContext} from './internal-native-employees.js';
import {principalHasCapabilities} from './internal-resource-access.js';
import {ownRunHash,verifyOwnRunReceipt,runError} from './internal-own-payroll-run.js';
import {salaryKey,salaryUuid} from '../assets/native-salary-catalog-model.js';
import {OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {OWN_LIQ_READ,OWN_LIQ_NOMINAL,OWN_LIQ_REVIEW,OWN_LIQ_CANCEL,ownLiquidationCommand,ownLiquidationBootstrap,ownLiquidationDetail,ownLiquidationReceipt} from '../assets/own-payroll-liquidation-model.js';
export {OWN_LIQ_READ,OWN_LIQ_NOMINAL,OWN_LIQ_REVIEW,OWN_LIQ_CANCEL};
export class OwnLiquidationError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:'OWN_LIQ_'+code,status});}}
export const liquidationFail=(code,status,message)=>{throw new OwnLiquidationError(code,status,message);};
const errors={FORBIDDEN:[403,'Tu cuenta no permite esta decisión sobre la liquidación.'],NOT_FOUND:[404,'No se encontró la corrida o el intento en tu ámbito.'],STATE_CHANGED:[409,'Cambió el alcance o una decisión del período. Actualizá y revisá antes de otro envío.'],RESULT_CHANGED:[409,'El resultado no coincide con la versión revisada.'],DECISION_INVALID:[409,'El conjunto completo no admite esta decisión. Revisá estados, otra liquidación activa y separación de funciones.'],SELECTION_INVALID:[422,'No se verificó todo el alcance. No se modificó ningún legajo.'],INPUT_INVALID:[422,'Revisá la decisión, su motivo y la revisión explícita.'],IDEMPOTENCY_REUSE:[409,'La referencia pertenece a otro contenido. Consultá el mismo intento.'],CONTRACT_INVALID:[503,'No se pudo verificar la liquidación contra las fuentes y resultados guardados.'],LIMIT:[422,'El alcance completo supera la capacidad. No se recortaron ni dividieron filas.'],BUSY:[409,'Otra operación está en curso. Consultá o reintentá el mismo envío.']};
export function liquidationError(e){
 if(e instanceof OwnLiquidationError)return e;
 if(/\bOWN_CLOSE_REOPEN_REQUIRED\b/.test(String(e?.message??'')))return new OwnLiquidationError('REOPEN_REQUIRED',409,'El alcance incluye una liquidación cerrada. Reabrí su grupo antes de confirmar, anular o cancelar una versión.');
 for(const[code,[status,message]]of Object.entries(errors))if(new RegExp('\\bOWN_LIQ_'+code+'\\b').test(String(e?.message??'')))return new OwnLiquidationError(code,status,message);
 const prior=runError(e);if(['OWN_RUN_SESSION_INVALID','OWN_RUN_FORBIDDEN','OWN_RUN_EMPLOYMENT_REQUIRED','OWN_RUN_BUSY'].includes(prior.code))return new OwnLiquidationError(prior.code.slice(8),prior.status,prior.message);
 return new OwnLiquidationError('UNAVAILABLE',503,'No se confirmó la decisión. Consultá el mismo intento antes de enviar otra.');
}
const checked=v=>{if(Buffer.byteLength(JSON.stringify({ok:true,data:v}))>OWN_RUN_MAX_RESPONSE)liquidationFail('LIMIT',...errors.LIMIT);return v;};
export async function ownLiquidationOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session)),query=async(q,values)=>{const rows=await sql.query(q,values);return(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;};
  if(operation==='bootstrap')return checked(ownLiquidationBootstrap(await query('SELECT public.own_liquidation_bootstrap_v1($1::jsonb) AS result',[ctx])));
  if(operation==='detail'){
   if(!salaryUuid(input.id))liquidationFail('INPUT_INVALID',400,'Elegí una corrida propia guardada.');
   const v=ownLiquidationDetail(await query('SELECT public.own_liquidation_detail_v1($1::jsonb,$2::uuid) AS result',[ctx,input.id]));
   if(v.reviewAccessRequired&&!principalHasCapabilities(principal,OWN_LIQ_REVIEW))liquidationFail('FORBIDDEN',...errors.FORBIDDEN);
   if(v.id!==input.id)liquidationFail('CONTRACT_INVALID',...errors.CONTRACT_INVALID);verifyOwnRunReceipt(v.capture);return checked(v);
  }
  if(!salaryKey(input.key))liquidationFail('INPUT_INVALID',428,'Se requiere una referencia de intento.');
  let value,attempt;
  if(operation==='attempt')value=await query('SELECT public.own_liquidation_attempt_v1($1::jsonb,$2::uuid) AS result',[ctx,input.key]);
  else if(operation==='command'){
   let body;try{body=ownLiquidationCommand(input.body);}catch{liquidationFail('INPUT_INVALID',...errors.INPUT_INVALID);}attempt={key:input.key,body};value=await query('SELECT public.own_liquidation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',[ctx,JSON.stringify(body),input.key]);
  }else liquidationFail('INPUT_INVALID',400,'Operación no admitida.');
  ownLiquidationReceipt(value,attempt);if(value.key!==input.key||value.bodySha256!==ownRunHash(value.body))liquidationFail('CONTRACT_INVALID',...errors.CONTRACT_INVALID);return checked(value);
 }catch(e){throw liquidationError(e);}
}
