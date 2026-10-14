import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {salaryUuid, salaryKey, salarySerialized, salaryJsonbBytes, SalaryInputError} from '../assets/native-salary-catalog-model.js';
import {PERIOD_CLASSIFICATION_READ, PERIOD_CLASSIFICATION_MAX_RESPONSE_BYTES, periodClassificationPeriod, periodClassificationBootstrap, periodClassificationCommand, periodClassificationDetail, periodClassificationReceipt} from '../assets/own-period-classification-model.js';
export {PERIOD_CLASSIFICATION_READ};
export const PERIOD_CLASSIFICATION_CAPS = Object.freeze({propose:['payroll.parameter.prepare'], approve:['payroll.parameter.approve'], reject:['payroll.parameter.approve']});
export class PeriodClassificationError extends Error {
 constructor(code, status, message) { super(message); Object.assign(this, {code:code.startsWith('PERIOD_CLASSIFICATION_') ? code : 'PERIOD_CLASSIFICATION_' + code, status}); }
}
export const periodClassificationFail = (code, status, message) => {throw new PeriodClassificationError(code, status, message);};
export const periodClassificationFingerprint = body => createHash('sha256').update(salarySerialized(body)).digest('hex');
const messages = {
 INPUT_INVALID:[422, 'Revisá los códigos, las fechas independientes y la constancia del período.'],
 FORBIDDEN:[403, 'Tu cuenta no permite esta operación sobre el encuadre propio del período.'],
 SOURCE_REQUIRED:[422, 'Se necesita un contrato propio con procedencia verificada y catálogo municipal aprobado.'],
 NO_CHANGES:[422, 'La declaración no contiene cambios respecto de la revisión aprobada.'],
 NOT_FOUND:[404, 'No se encontró la propuesta o el intento dentro de tu acceso.'],
 SCOPE_CHANGED:[409, 'Cambió la cuenta, el contrato o el período. Consultá el intento desde su ámbito original.'],
 BASE_CHANGED:[409, 'Cambió la revisión o el catálogo. Actualizá antes de preparar o aprobar.'],
 SOURCE_CHANGED:[409, 'Cambió la identidad o procedencia. Compará la fuente antes de preparar o aprobar.'],
 CLASSIFICATION_UNKNOWN:[422, 'Un código no corresponde de forma única al catálogo aprobado. No se dedujo otro código.'],
 INCOMPLETE:[422, 'Faltan hechos o vigencias explícitas para aprobar el período completo.'],
 PARTIAL_PERIOD:[422, 'La declaración no cubre el mes completo. El tramo parcial requiere tratamiento explícito.'],
 INDEPENDENT_REQUIRED:[403, 'La decisión requiere otra persona habilitada.'],
 DECIDED:[409, 'La propuesta ya tiene una decisión. Consultá su resultado.'],
 IDEMPOTENCY_REUSE:[409, 'La referencia pertenece a otro contenido. Consultá el mismo intento.'],
 PROPOSAL_CHANGED:[409, 'El contenido no coincide con la propuesta conservada.'],
 LIMIT:[422, 'El conjunto completo alcanzó su capacidad. No se recortó su historia.'],
 BUSY:[409, 'Otra operación está en curso. Consultá el mismo intento.'],
 CONTRACT_INVALID:[503, 'No se pudo verificar la respuesta conservada. Consultá el mismo intento.'],
};
export function periodClassificationError(error) {
 if (error instanceof PeriodClassificationError) return error;
 if (error instanceof SalaryInputError) return new PeriodClassificationError(error.code, /CONTRACT_INVALID|CAPTURE_INVALID/.test(error.code) ? 503 : 422, error.message);
 const message = String(error?.message ?? '');
 if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID|PERIOD_CLASSIFICATION_SESSION_INVALID/.test(message) || /SESSION_INVALID/.test(String(error?.code ?? ''))) return new PeriodClassificationError('SESSION_INVALID', 401, 'La sesión venció o cambió. Volvé a ingresar.');
 if (/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(message)) return new PeriodClassificationError('FORBIDDEN', 403, messages.FORBIDDEN[1]);
 if (/NATIVE_EMPLOYEE_READ_(?:NOT_FOUND|ORIGIN_INVALID)|NATIVE_EMPLOYMENT_CHANGE_(?:NOT_FOUND|IDENTITY_CHANGED)|PAYROLL_FIXED_.*(?:NOT_FOUND|IDENTITY_CHANGED|DATES_INVALID)|NATIVE_EMPLOYEE_CATALOG_UNAVAILABLE/.test(message)) return new PeriodClassificationError('SOURCE_REQUIRED', 422, messages.SOURCE_REQUIRED[1]);
 for (const [code, [status, safe]] of Object.entries(messages)) if (new RegExp('\\bPERIOD_CLASSIFICATION_' + code + '\\b').test(message)) return new PeriodClassificationError(code, status, safe);
 return new PeriodClassificationError('UNAVAILABLE', 503, 'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function periodClassificationOperation(sql, principal, session, operation, input = {}) {
 try {
  const context = JSON.stringify(employeeContext(principal, session)); let query, values, body;
  if (operation === 'bootstrap') {
   if (!salaryUuid(input.contractId) || !periodClassificationPeriod(input.period)) periodClassificationFail('INPUT_INVALID', 400, 'Elegí un contrato propio y período válidos.');
   query = 'SELECT public.own_period_classification_bootstrap_v1($1::jsonb,$2::uuid,$3::text) AS result'; values = [context, input.contractId, input.period];
  } else if (operation === 'detail') {
   if (!salaryUuid(input.id)) periodClassificationFail('INPUT_INVALID', 400, 'Elegí una propuesta válida.');
   query = 'SELECT public.own_period_classification_detail_v1($1::jsonb,$2::uuid) AS result'; values = [context, input.id];
  } else {
   if (!salaryKey(input.key)) periodClassificationFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
   if (operation === 'attempt') {query = 'SELECT public.own_period_classification_attempt_v1($1::jsonb,$2::uuid) AS result'; values = [context, input.key];}
   else if (operation === 'command') {body = periodClassificationCommand(input.body); query = 'SELECT public.own_period_classification_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'; values = [context, JSON.stringify(body), input.key];}
   else periodClassificationFail('INPUT_INVALID', 400, 'Operación no admitida.');
  }
  const rows = await sql.query(query, values), result = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
  try {
   if (salaryJsonbBytes(result) > PERIOD_CLASSIFICATION_MAX_RESPONSE_BYTES) periodClassificationFail('LIMIT', 503, 'La respuesta completa supera su capacidad. No se devolvió una historia recortada.');
   if (operation === 'bootstrap') {
    const verified = periodClassificationBootstrap(result);
    if (verified.preparation.contractId.toLowerCase() !== input.contractId.toLowerCase() || verified.preparation.period !== input.period) periodClassificationFail('CONTRACT_INVALID', 503, 'La consulta devolvió otro contrato o período.');
    return verified;
   }
   if (operation === 'detail') {
    const verified = await periodClassificationDetail(result);
    if (verified.proposal.id.toLowerCase() !== input.id.toLowerCase()) periodClassificationFail('CONTRACT_INVALID', 503, 'La consulta devolvió otra propuesta.');
    return verified;
   }
   const attempt = body ? {key:input.key, requestSha256:periodClassificationFingerprint(body), body} : null;
   const verified = await periodClassificationReceipt(result, attempt);
   if (verified.requestKey !== input.key || verified.requestSha256 !== periodClassificationFingerprint(verified.body)) periodClassificationFail('CONTRACT_INVALID', 503, 'No se verificó el contenido original del intento.');
   return verified;
  } catch (error) {
   if (error instanceof PeriodClassificationError) throw error;
   periodClassificationFail('CONTRACT_INVALID', 503, 'No se pudo verificar la respuesta conservada. Consultá el mismo intento.');
  }
 } catch (error) {throw periodClassificationError(error);}
}
