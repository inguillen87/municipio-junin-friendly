import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {normalizeLeavePayload} from './internal-leave-workflow.js';
import {nativeLeaveCommand,nativeLeaveSame,nativeLeaveUuid,nativeLeaveAttemptKey,validateNativeLeaveBootstrap,validateNativeLeaveReceipt} from '../assets/native-leave-contract.js';
import {NativeLeaveError} from '../assets/native-leave-model.js';

export const NATIVE_LEAVE_READ=Object.freeze(['workforce.employee.read','actions.read']);
export const NATIVE_LEAVE_MAX_BYTES=32768;
export const NATIVE_LEAVE_CAPS=Object.freeze({
 create:['leave.request.self.create','leave.request.area.create','leave.request.all.manage'],
 update_draft:['leave.request.self.update','leave.request.area.update','leave.request.all.manage'],
 submit:['leave.request.self.submit','leave.request.area.submit','leave.request.all.manage'],
 approve:['leave.request.area.decide','leave.request.all.manage'],reject:['leave.request.area.decide','leave.request.all.manage'],
 cancel:['leave.request.self.cancel','leave.request.area.cancel_pending','leave.request.area.cancel_approved','leave.request.all.manage'],
 profile_propose:['leave.request.all.manage'],profile_approve:['leave.request.all.manage'],profile_reject:['leave.request.all.manage'],
});
export class NativeLeaveOperationError extends Error{constructor(code,status,message){super(message);Object.assign(this,{name:'NativeLeaveOperationError',code:'NATIVE_LEAVE_'+code,status});}}
export const nativeLeaveFail=(code,status,message)=>{throw new NativeLeaveOperationError(code,status,message);};
const messages={
 INPUT_INVALID:[422,'Revisá el motivo, las fechas, la unidad y el respaldo.'],FORBIDDEN:[403,'Tu cuenta no permite esta operación o la consulta completa de este legajo.'],
 SESSION_INVALID:[401,'La sesión cambió. Volvé a ingresar.'],EMPLOYMENT_REQUIRED:[403,'La operación requiere una persona vinculada y habilitada.'],
 NOT_FOUND:[404,'No se encontró la solicitud o el intento dentro de tu acceso.'],SCOPE_CHANGED:[409,'Cambió el ámbito o la identidad del intento. Conservá su referencia y consultá con el acceso original.'],
 IDENTITY_CHANGED:[409,'Cambió la identidad del legajo. Volvé a consultar.'],EMPLOYMENT_CHANGED:[409,'Cambió el historial laboral. Volvé a revisar las fechas.'],
 SNAPSHOT_CHANGED:[409,'Cambió el conjunto de solicitudes o saldos. Actualizá y revisá antes de preparar otro envío.'],VERSION_CHANGED:[409,'La solicitud tiene otra versión. Volvé a consultar.'],PROFILE_CHANGED:[409,'Otra declaración de saldo fue aprobada. Compará la vigente antes de preparar otra propuesta.'],
 STATE_INVALID:[409,'La solicitud ya no admite esta operación.'],MAKER_CHECKER_REQUIRED:[403,'Debe revisar otra persona autorizada, distinta de quienes prepararon la solicitud.'],
 IDEMPOTENCY_REUSE:[409,'La referencia corresponde a otro contenido. Consultá el intento original.'],PERIOD_OUTSIDE_EMPLOYMENT:[422,'La solicitud debe quedar dentro de un mismo período laboral vigente.'],
 EVIDENCE_REQUIRED:[422,'La aprobación requiere evidencia verificada y confirmación humana expresa.'],OVERLAP:[409,'Existe una solicitud enviada o aprobada que se superpone. Consultá con una persona habilitada.'],
 BALANCE_UNAVAILABLE:[409,'Falta una declaración de saldo aprobada para el motivo, año y unidad. No se presume saldo cero.'],BALANCE_INSUFFICIENT:[409,'El saldo declarado no alcanza para reservar toda la solicitud.'],BALANCE_CONFLICT:[409,'El saldo propuesto es menor que las reservas y licencias aprobadas.'],
 LIMIT:[409,'Se alcanzó un límite del historial. Se conserva completo y la operación necesita revisión.'],BUSY:[409,'Hay otra operación en curso. Consultá o reintentá el mismo envío.'],
 CAPACITY_LIMIT:[409,'No hay capacidad disponible para guardar la operación completa.'],
};
export function nativeLeaveError(error){
 if(error instanceof NativeLeaveOperationError)return error;
 if(error instanceof NativeLeaveError)return new NativeLeaveOperationError(error.code,error.code==='CONTRACT_INVALID'?503:422,error.message);
 const source=String(error?.code||'')+' '+String(error?.message||'');
 for(const [code,[status,message]]of Object.entries(messages))if(new RegExp('\\bNATIVE_LEAVE_'+code+'\\b').test(source))return new NativeLeaveOperationError(code,status,message);
 if(/ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID/.test(source))return new NativeLeaveOperationError('SESSION_INVALID',...messages.SESSION_INVALID);
 if(/NATIVE_EMPLOYEE_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(source))return new NativeLeaveOperationError('FORBIDDEN',...messages.FORBIDDEN);
 if(/NATIVE_EMPLOYMENT_(?:CHANGE|LIFECYCLE)_NOT_FOUND|PAYROLL_FIXED_NOT_FOUND/.test(source))return new NativeLeaveOperationError('NOT_FOUND',...messages.NOT_FOUND);
 if(/NATIVE_EMPLOYMENT_(?:CHANGE|LIFECYCLE|CATALOG)_BUSY|55P03|40P01|40001/.test(source))return new NativeLeaveOperationError('BUSY',...messages.BUSY);
 if(/NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT/.test(source))return new NativeLeaveOperationError('CAPACITY_LIMIT',...messages.CAPACITY_LIMIT);
 if(/NATIVE_EMPLOYMENT_CATALOG_(?:INPUT_INVALID|LIMIT|UNAVAILABLE)/.test(source))return new NativeLeaveOperationError('INPUT_INVALID',error?.status>=400&&error.status<=503?error.status:400,'No se pudo leer el formulario completo, sin ambigüedades.');
 return new NativeLeaveOperationError('UNAVAILABLE',503,'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export function nativeLeaveSerialized(value){
 if(Array.isArray(value))return '['+value.map(nativeLeaveSerialized).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+nativeLeaveSerialized(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export const nativeLeaveFingerprint=body=>createHash('sha256').update(nativeLeaveSerialized(body)).digest('hex');

export async function nativeLeaveOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session));let query,values,expected=null;
  if(operation==='command'){
   if(!nativeLeaveAttemptKey(input.key))nativeLeaveFail('INPUT_INVALID',428,'La operación requiere su referencia de intento.');
   expected=nativeLeaveCommand(input.body);
   if(['create','update_draft'].includes(expected.command))normalizeLeavePayload({beneficiaryContractId:expected.contractId,...expected.payload});
   query='SELECT public.native_leave_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(expected),input.key];
  }else{
   if(!nativeLeaveUuid(input.contractId))nativeLeaveFail('INPUT_INVALID',400,'La consulta requiere un contrato válido.');
   if(operation==='bootstrap'){query='SELECT public.native_leave_bootstrap_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.contractId];}
   else if(operation==='attempt'){
    if(!nativeLeaveAttemptKey(input.key))nativeLeaveFail('INPUT_INVALID',428,'La consulta requiere la referencia original.');
    query='SELECT public.native_leave_attempt_v1($1::jsonb,$2::uuid,$3::uuid) AS result';values=[ctx,input.contractId,input.key];
   }else nativeLeaveFail('INPUT_INVALID',400,'Operación no admitida.');
  }
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(operation==='bootstrap')return validateNativeLeaveBootstrap(result,input.contractId);
  validateNativeLeaveReceipt(result,expected?.contractId??input.contractId,expected);
  if(expected&&result.requestSha256!==nativeLeaveFingerprint(expected))nativeLeaveFail('CONTRACT_INVALID',503,'La confirmación pertenece a otro contenido. Conservá y consultá el mismo intento.');
  return result;
 }catch(error){throw nativeLeaveError(error);}
}
