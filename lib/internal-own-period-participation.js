import { createHash } from 'node:crypto';
import { employeeContext } from './internal-native-employees.js';
import { salaryUuid, salaryKey, salarySerialized, SalaryInputError } from '../assets/native-salary-catalog-model.js';
import { PARTICIPATION_READ, participationPeriod, participationBootstrap, participationCommand, participationReceipt, participationDetail } from '../assets/own-period-participation-model.js';
export { PARTICIPATION_READ };
export const PARTICIPATION_CAPS = { propose: ['payroll.parameter.prepare'], approve: ['payroll.parameter.approve'], reject: ['payroll.parameter.approve'] };
export class ParticipationError extends Error { constructor(code, status, message) { super(message); Object.assign(this, { code: code.startsWith('PARTICIPATION_') ? code : 'PARTICIPATION_' + code, status }); } }
export const participationFail = (code, status, message) => { throw new ParticipationError(code, status, message); };
export const participationFingerprint = body => createHash('sha256').update(salarySerialized(body)).digest('hex');
const messages = {
 INPUT_INVALID: [422, 'Revisá participación reconocida, fecha, período y constancia.'],
 FORBIDDEN: [403, 'Tu cuenta no permite esta operación de participación.'],
 SOURCE_CHANGED: [409, 'Cambió el contrato o su historial laboral. Revisá la constancia y prepará una declaración nueva.'],
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
export function participationError(e) {
 if (e instanceof ParticipationError) return e;
 if (e instanceof SalaryInputError) return new ParticipationError(e.code, /CONTRACT_INVALID|CAPTURE_INVALID/.test(e.code) ? 503 : 422, e.message);
 const m = String(e?.message ?? '');
 if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m) || /SESSION_INVALID/.test(String(e?.code ?? ''))) return new ParticipationError('SESSION_INVALID', 401, 'La sesión venció. Volvé a ingresar.');
 if (/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m)) return new ParticipationError('FORBIDDEN', 403, messages.FORBIDDEN[1]);
 if (/NATIVE_EMPLOYMENT_CHANGE_(?:NOT_FOUND|IDENTITY_CHANGED)|PAYROLL_FIXED_.*(?:NOT_FOUND|IDENTITY_CHANGED)/.test(m)) return new ParticipationError('SOURCE_REQUIRED', 422, messages.SOURCE_REQUIRED[1]);
 for (const [code, [status, message]] of Object.entries(messages)) if (new RegExp('\\bPARTICIPATION_' + code + '\\b').test(m)) return new ParticipationError(code, status, message);
 return new ParticipationError('UNAVAILABLE', 503, 'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function participationOperation(sql, principal, session, operation, input = {}) {
 try {
  const ctx = JSON.stringify(employeeContext(principal, session)); let query, values, body;
  if (operation === 'bootstrap') {
   if (!salaryUuid(input.contractId) || !participationPeriod(input.period)) participationFail('INPUT_INVALID', 400, 'Elegí contrato propio y período válidos.');
   query = 'SELECT public.own_participation_bootstrap_v1($1::jsonb,$2::uuid,$3::text) AS result'; values = [ctx, input.contractId, input.period];
  } else if (operation === 'detail') {
   if (!salaryUuid(input.id)) participationFail('INPUT_INVALID', 400, 'Elegí una propuesta válida.');
   query = 'SELECT public.own_participation_detail_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.id];
  } else {
   if (!salaryKey(input.key)) participationFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
   if (operation === 'attempt') { query = 'SELECT public.own_participation_attempt_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.key]; }
   else if (operation === 'command') { body = participationCommand(input.body); query = 'SELECT public.own_participation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'; values = [ctx, JSON.stringify(body), input.key]; }
   else participationFail('INPUT_INVALID', 400, 'Operación no admitida.');
  }
  const rows = await sql.query(query, values), result = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
  try {
  if (operation === 'bootstrap') {
   participationBootstrap(result);
   if (result.contractId.toLowerCase() !== input.contractId.toLowerCase() || result.period !== input.period) participationFail('CONTRACT_INVALID', 503, 'La consulta devolvió otro contrato o período.');
   return result;
  }
  if (operation === 'detail') {
   await participationDetail(result);
   if (result.proposal.id.toLowerCase() !== input.id.toLowerCase()) participationFail('CONTRACT_INVALID', 503, 'La consulta devolvió otra propuesta.');
   return result;
  }
  participationReceipt(result, body ? { key: input.key, body } : null);
  if (result.requestKey !== input.key || result.requestSha256 !== participationFingerprint(result.body)) participationFail('CONTRACT_INVALID', 503, 'No se verificó el contenido del intento.');
  return result;
  } catch (e) {
   if (e instanceof ParticipationError) throw e;
   participationFail('CONTRACT_INVALID', 503, 'No se pudo verificar la respuesta conservada. Consultá el mismo intento.');
  }
 } catch (e) { throw participationError(e); }
}
