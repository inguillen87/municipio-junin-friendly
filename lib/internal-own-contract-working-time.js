import { createHash } from 'node:crypto';
import { employeeContext } from './internal-native-employees.js';
import { salaryUuid, salaryKey, salarySerialized, SalaryInputError } from '../assets/native-salary-catalog-model.js';
import { WORKING_TIME_READ, workingTimePeriod, workingTimeBootstrap, workingTimeCommand, workingTimeReceipt, workingTimeDetail } from '../assets/own-contract-working-time-model.js';
export { WORKING_TIME_READ };
export const WORKING_TIME_CAPS = { propose: ['payroll.parameter.prepare'], approve: ['payroll.parameter.approve'], reject: ['payroll.parameter.approve'] };
export class WorkingTimeError extends Error { constructor(code, status, message) { super(message); Object.assign(this, { code: code.startsWith('WORKING_TIME_') ? code : 'WORKING_TIME_' + code, status }); } }
export const workingTimeFail = (code, status, message) => { throw new WorkingTimeError(code, status, message); };
export const workingTimeFingerprint = body => createHash('sha256').update(salarySerialized(body)).digest('hex');
const messages = {
 INPUT_INVALID: [422, 'Revisá horas diarias y mensuales, fecha, período y constancia.'],
 FORBIDDEN: [403, 'Tu cuenta no permite esta operación de jornada contractual.'],
 SOURCE_REQUIRED: [422, 'Elegí un contrato incorporado al padrón propio.'],
 NOT_FOUND: [404, 'No se encontró la propuesta o el intento dentro de tu acceso.'],
 BASE_CHANGED: [409, 'Cambió la revisión o la identidad. Actualizá antes de preparar o aprobar.'],
 SCOPE_CHANGED: [409, 'Cambió la cuenta, el contrato o el período. Consultá el intento desde su ámbito original.'],
 INDEPENDENT_REQUIRED: [403, 'La decisión requiere otra persona habilitada.'],
 IDEMPOTENCY_REUSE: [409, 'La referencia pertenece a otro contenido. Consultá el mismo intento.'],
 DECIDED: [409, 'La propuesta ya tiene una decisión. Actualizá la consulta.'],
 PROPOSAL_CHANGED: [409, 'El contenido no coincide con la propuesta revisada.'],
 LIMIT: [422, 'El conjunto alcanzó su capacidad. No se recortaron propuestas.'],
 BUSY: [409, 'Otra operación está en curso. Consultá el mismo intento.'],
};
export function workingTimeError(e) {
 if (e instanceof WorkingTimeError) return e;
 if (e instanceof SalaryInputError) return new WorkingTimeError(e.code, /CONTRACT_INVALID|CAPTURE_INVALID/.test(e.code) ? 503 : 422, e.message);
 const m = String(e?.message ?? '');
 if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m) || /SESSION_INVALID/.test(String(e?.code ?? ''))) return new WorkingTimeError('SESSION_INVALID', 401, 'La sesión venció. Volvé a ingresar.');
 if (/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m)) return new WorkingTimeError('FORBIDDEN', 403, messages.FORBIDDEN[1]);
 if (/NATIVE_EMPLOYMENT_CHANGE_(?:NOT_FOUND|IDENTITY_CHANGED)|PAYROLL_FIXED_.*(?:NOT_FOUND|IDENTITY_CHANGED)/.test(m)) return new WorkingTimeError('SOURCE_REQUIRED', 422, messages.SOURCE_REQUIRED[1]);
 for (const [code, [status, message]] of Object.entries(messages)) if (new RegExp('\\bWORKING_TIME_' + code + '\\b').test(m)) return new WorkingTimeError(code, status, message);
 return new WorkingTimeError('UNAVAILABLE', 503, 'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function workingTimeOperation(sql, principal, session, operation, input = {}) {
 try {
  const ctx = JSON.stringify(employeeContext(principal, session)); let query, values, body;
  if (operation === 'bootstrap') {
   if (!salaryUuid(input.contractId) || !workingTimePeriod(input.period)) workingTimeFail('INPUT_INVALID', 400, 'Elegí contrato propio y período válidos.');
   query = 'SELECT public.own_working_time_bootstrap_v1($1::jsonb,$2::uuid,$3::text) AS result'; values = [ctx, input.contractId, input.period];
  } else if (operation === 'detail') {
   if (!salaryUuid(input.id)) workingTimeFail('INPUT_INVALID', 400, 'Elegí una propuesta válida.');
   query = 'SELECT public.own_working_time_detail_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.id];
  } else {
   if (!salaryKey(input.key)) workingTimeFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
   if (operation === 'attempt') { query = 'SELECT public.own_working_time_attempt_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.key]; }
   else if (operation === 'command') { body = workingTimeCommand(input.body); query = 'SELECT public.own_working_time_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'; values = [ctx, JSON.stringify(body), input.key]; }
   else workingTimeFail('INPUT_INVALID', 400, 'Operación no admitida.');
  }
  const rows = await sql.query(query, values), result = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
  try {
  if (operation === 'bootstrap') {
   workingTimeBootstrap(result);
   if (result.contractId.toLowerCase() !== input.contractId.toLowerCase() || result.period !== input.period) workingTimeFail('CONTRACT_INVALID', 503, 'La consulta devolvió otro contrato o período.');
   return result;
  }
  if (operation === 'detail') {
   await workingTimeDetail(result);
   if (result.proposal.id.toLowerCase() !== input.id.toLowerCase()) workingTimeFail('CONTRACT_INVALID', 503, 'La consulta devolvió otra propuesta.');
   return result;
  }
  workingTimeReceipt(result, body ? { key: input.key, body } : null);
  if (result.requestKey !== input.key || result.requestSha256 !== workingTimeFingerprint(result.body)) workingTimeFail('CONTRACT_INVALID', 503, 'No se verificó el contenido del intento.');
  return result;
  } catch (e) {
   if (e instanceof WorkingTimeError) throw e;
   workingTimeFail('CONTRACT_INVALID', 503, 'No se pudo verificar la respuesta conservada. Consultá el mismo intento.');
  }
 } catch (e) { throw workingTimeError(e); }
}
