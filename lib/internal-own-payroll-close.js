import {employeeContext} from './internal-native-employees.js';
import {ownRunHash,verifyOwnRunReceipt,runError} from './internal-own-payroll-run.js';
import {salaryKey,salaryUuid} from '../assets/native-salary-catalog-model.js';
import {OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {OWN_CLOSE_READ,OWN_CLOSE_NOMINAL,OWN_CLOSE_WRITE,ownCloseCommand,ownCloseDetail,ownCloseReceipt} from '../assets/own-payroll-close-model.js';
export {OWN_CLOSE_READ,OWN_CLOSE_NOMINAL,OWN_CLOSE_WRITE};
export class OwnCloseError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:'OWN_CLOSE_'+code,status});}}
export const closeFail=(code,status,message)=>{throw new OwnCloseError(code,status,message);};
const errors={FORBIDDEN:[403,'Tu cuenta no permite consultar o cerrar estas liquidaciones.'],NOT_FOUND:[404,'No se encontró el grupo o el intento en tu ámbito.'],STATE_CHANGED:[409,'Cambió el padrón o una decisión de este período y tipo. Actualizá y revisá el alcance.'],DECISION_INVALID:[409,'El alcance incluye legajos sin confirmar, cerrados o sin revisión independiente. No se omitió ninguno.'],REOPEN_REQUIRED:[409,'Este legajo tiene una liquidación cerrada. Reabrí su grupo antes de calcular o modificar la versión.'],SELECTION_INVALID:[422,'No se verificó el alcance completo. No se cerró ningún legajo.'],INPUT_INVALID:[422,'Revisá período, tipo, alcance y motivo de la decisión.'],IDEMPOTENCY_REUSE:[409,'La referencia pertenece a otro contenido. Consultá el mismo intento.'],CONTRACT_INVALID:[503,'No se verificó el resultado histórico contra todas sus fuentes guardadas.'],LIMIT:[422,'El conjunto completo supera la capacidad. No se omitieron ni dividieron filas.'],BUSY:[409,'Otra operación está en curso. Consultá o reintentá el mismo envío.']};
export function closeError(e){
 if(e instanceof OwnCloseError)return e;
 for(const[code,[status,message]]of Object.entries(errors))if(new RegExp('\\bOWN_CLOSE_'+code+'\\b').test(String(e?.message??'')))return new OwnCloseError(code,status,message);
 const prior=runError(e);if(prior.status!==503)return new OwnCloseError(prior.code.slice(8),prior.status,prior.message);
 return new OwnCloseError('UNAVAILABLE',503,'No se confirmó el cierre. Consultá el mismo intento antes de enviar otro.');
}
export async function ownCloseOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session)),query=async(q,values)=>{const rows=await sql.query(q,values);return(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;};let value;
  if(operation==='detail'){
   value=ownCloseDetail(await query('SELECT public.own_close_detail_v1($1::jsonb,$2::text,$3::text) AS result',[ctx,input.period,input.liquidationType]));
   if(value.period!==input.period||value.liquidationType!==input.liquidationType)closeFail('CONTRACT_INVALID',...errors.CONTRACT_INVALID);for(const c of value.captures)verifyOwnRunReceipt(c);
  }else{
   if(operation==='group'){if(!salaryUuid(input.id))closeFail('INPUT_INVALID',400,'Elegí un grupo cerrado.');value=await query('SELECT public.own_close_group_v1($1::jsonb,$2::uuid) AS result',[ctx,input.id]);if(value.groupId!==input.id)closeFail('CONTRACT_INVALID',...errors.CONTRACT_INVALID);}
   else{if(!salaryKey(input.key))closeFail('INPUT_INVALID',428,'Se requiere una referencia de intento.');
    if(operation==='attempt')value=await query('SELECT public.own_close_attempt_v1($1::jsonb,$2::uuid) AS result',[ctx,input.key]);
    else if(operation==='command'){let body;try{body=ownCloseCommand(input.body);}catch{closeFail('INPUT_INVALID',...errors.INPUT_INVALID);}value=await query('SELECT public.own_close_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',[ctx,JSON.stringify(body),input.key]);}
    else closeFail('INPUT_INVALID',400,'Operación no admitida.');
   }
   ownCloseReceipt(value,operation==='command'?{key:input.key,body:input.body}:null);
   if(operation!=='group'&&value.key!==input.key||value.bodySha256!==ownRunHash(value.body)||value.snapshotSha256!==ownRunHash(value.snapshot))closeFail('CONTRACT_INVALID',...errors.CONTRACT_INVALID);
  }
  if(Buffer.byteLength(JSON.stringify({ok:true,data:value}))>OWN_RUN_MAX_RESPONSE)closeFail('LIMIT',...errors.LIMIT);return value;
 }catch(e){throw closeError(e);}
}
