import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {salaryKey,salaryUuid,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {budgetYear} from '../assets/annual-position-budget-model.js';
import {PositionAssignmentError,positionCommand,positionReceipt,verifiedPositionBootstrap,verifiedPositionRunCapture,POSITION_READ,POSITION_CAPS} from '../assets/position-assignment-model.js';
export {POSITION_READ,POSITION_CAPS};
export class PositionAssignmentHttpError extends Error{constructor(code,status,message){super(message);Object.assign(this,{code:'POSITION_ASSIGNMENT_'+code,status});}}
export const positionFail=(code,status,message)=>{throw new PositionAssignmentHttpError(code,status,message);};
export const positionFingerprint=body=>createHash('sha256').update(salarySerialized(body)).digest('hex');
const errors={INPUT_INVALID:[422,'Revisá la norma, las fechas y las cantidades del conjunto completo.'],FORBIDDEN:[403,'Tu membresía no permite esta operación.'],EMPLOYMENT_REQUIRED:[403,'Se requiere una identidad municipal vinculada.'],NOT_FOUND:[404,'No se encontró la referencia dentro de tu acceso.'],BASE_CHANGED:[409,'Cambió la asignación o la planta anual. Consultá y revisá el conjunto completo.'],SCOPE_CHANGED:[409,'Cambió el contrato, la cuenta o el vínculo. Consultá nuevamente.'],IDENTITY_CHANGED:[409,'Cambió la identidad del contrato. La propuesta necesita una nueva revisión.'],NORMATIVE_CHANGED:[409,'La fila no coincide con la norma aprobada que se eligió.'],DATES_OUTSIDE_EMPLOYMENT:[422,'La vigencia indicada no está dentro de un período laboral activo del contrato.'],INDEPENDENT_REQUIRED:[403,'La decisión requiere otra persona habilitada.'],IDEMPOTENCY_REUSE:[409,'La referencia pertenece a otro contenido. Consultá el mismo intento.'],DECIDED:[409,'La propuesta ya tiene una decisión.'],PROPOSAL_CHANGED:[409,'La propuesta no coincide con el contenido revisado.'],LIMIT:[422,'Se alcanzó la capacidad. No se recortaron asignaciones ni antecedentes.'],BUSY:[409,'Hay otra operación en curso. Consultá o reintentá el mismo envío.'],CAPTURE_INVALID:[503,'No se verificó la captura presupuestaria original.']};
export function positionError(e){
 if(e instanceof PositionAssignmentHttpError)return e;
 if(e instanceof PositionAssignmentError)return new PositionAssignmentHttpError(e.code,e.code==='CONTRACT_INVALID'?503:422,e.message);
 const m=String(e?.message??'');if(/SESSION_INVALID/.test(m+' '+e?.code))return new PositionAssignmentHttpError('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar.');
 if(/NATIVE_EMPLOYEE_FORBIDDEN|ANNUAL_BUDGET_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m))return new PositionAssignmentHttpError('FORBIDDEN',403,errors.FORBIDDEN[1]);
 if(/NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND/.test(m))return new PositionAssignmentHttpError('NOT_FOUND',404,errors.NOT_FOUND[1]);
 if(/NATIVE_EMPLOYMENT_CHANGE_IDENTITY_CHANGED/.test(m))return new PositionAssignmentHttpError('IDENTITY_CHANGED',409,errors.IDENTITY_CHANGED[1]);
 if(/OWN_RUN_BUSY|ANNUAL_BUDGET_BUSY|NATIVE_EMPLOYMENT_CHANGE_BUSY|NATIVE_EMPLOYMENT_LIFECYCLE_BUSY/.test(m))return new PositionAssignmentHttpError('BUSY',409,errors.BUSY[1]);
 for(const [code,[status,message]] of Object.entries(errors))if(new RegExp('\\bPOSITION_ASSIGNMENT_'+code+'\\b').test(m))return new PositionAssignmentHttpError(code,status,message);
 return new PositionAssignmentHttpError('UNAVAILABLE',503,'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function positionOperation(sql,principal,session,operation,input={}){
 try{
  const ctx=JSON.stringify(employeeContext(principal,session));let query,values,body;
  if(operation==='bootstrap'){if(!budgetYear(input.year)||!salaryUuid(input.contractId))positionFail('INPUT_INVALID',400,'Elegí el contrato propio y el ejercicio.');query='SELECT public.position_assignment_bootstrap_v1($1::jsonb,$2::uuid,$3::integer) AS result';values=[ctx,input.contractId,input.year];}
  else if(operation==='capture'){if(!salaryUuid(input.captureId))positionFail('INPUT_INVALID',400,'Elegí una captura propia.');query='SELECT public.position_assignment_capture_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.captureId];}
  else{if(!salaryKey(input.key))positionFail('INPUT_INVALID',428,'Se requiere una referencia de intento.');if(operation==='attempt'){query='SELECT public.position_assignment_attempt_v1($1::jsonb,$2::uuid) AS result';values=[ctx,input.key];}else if(operation==='command'){body=positionCommand(input.body);query='SELECT public.position_assignment_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';values=[ctx,JSON.stringify(body),input.key];}else positionFail('INPUT_INVALID',400,'Operación no admitida.');}
  const rows=await sql.query(query,values),result=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;
  if(operation==='bootstrap')return await verifiedPositionBootstrap(result,{year:input.year,contractId:input.contractId});
  if(operation==='capture'){await verifiedPositionRunCapture(result);if(result.captureId!==input.captureId)positionFail('CONTRACT_INVALID',503,'La captura corresponde a otra corrida.');return result;}
  positionReceipt(result,body?{key:input.key,body}:null);if(result.key!==input.key||body&&positionFingerprint(body)!==result.bodySha256)positionFail('CONTRACT_INVALID',503,'No se verificó el intento original.');return result;
 }catch(e){const safe=positionError(e);if(safe!==e)safe.cause=e;throw safe;}
}
