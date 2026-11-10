import { createHash } from 'node:crypto';
import { employeeContext } from './internal-native-employees.js';
import { salaryUuid, salaryKey, salarySerialized, SalaryInputError } from '../assets/native-salary-catalog-model.js';
import { MONTHLY_DAY_DECLARATION_READ, monthlyDayDeclarationPeriod, monthlyDayDeclarationBootstrap, monthlyDayDeclarationCommand, monthlyDayDeclarationReceipt, monthlyDayDeclarationDetail } from '../assets/own-monthly-day-declaration-model.js';
export { MONTHLY_DAY_DECLARATION_READ };
export const MONTHLY_DAY_DECLARATION_CAPS = { propose: ['payroll.parameter.prepare'], approve: ['payroll.parameter.approve'], reject: ['payroll.parameter.approve'] };
export class MonthlyDayDeclarationError extends Error { constructor(code, status, message) { super(message); Object.assign(this, { code: code.startsWith('MONTHLY_DAY_DECLARATION_') ? code : 'MONTHLY_DAY_DECLARATION_' + code, status }); } }
export const monthlyDayDeclarationFail = (code, status, message) => { throw new MonthlyDayDeclarationError(code, status, message); };
export const monthlyDayDeclarationFingerprint = body => createHash('sha256').update(salarySerialized(body)).digest('hex');
const messages = {
 VALUE_REQUIRED: [422, 'Faltan días aprobados explícitos. Vacío no equivale a cero.'],
 FULL_MONTH_REQUIRED: [422, 'El mes completo liquidable declarado requiere 30 días explícitos.'],
 APPROVAL_REQUIRED: [422, 'Se requiere una declaración tipada aprobada para la fuente actual.'],
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
export function monthlyDayDeclarationError(e) {
 if (e instanceof MonthlyDayDeclarationError) return e;
 if (e instanceof SalaryInputError) return new MonthlyDayDeclarationError(e.code, /CONTRACT_INVALID|CAPTURE_INVALID/.test(e.code) ? 503 : 422, e.message);
 const m = String(e?.message ?? '');
 if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m) || /SESSION_INVALID/.test(String(e?.code ?? ''))) return new MonthlyDayDeclarationError('SESSION_INVALID', 401, 'La sesión venció. Volvé a ingresar.');
 if (/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m)) return new MonthlyDayDeclarationError('FORBIDDEN', 403, messages.FORBIDDEN[1]);
 if (/PARTICIPATION_SOURCE_REQUIRED|NATIVE_EMPLOYMENT_CHANGE_(?:NOT_FOUND|IDENTITY_CHANGED)|PAYROLL_FIXED_.*(?:NOT_FOUND|IDENTITY_CHANGED)/.test(m)) return new MonthlyDayDeclarationError('SOURCE_REQUIRED', 422, messages.SOURCE_REQUIRED[1]);
 for (const [code, [status, message]] of Object.entries(messages)) if (new RegExp('\\bMONTHLY_DAY_DECLARATION_' + code + '\\b').test(m)) return new MonthlyDayDeclarationError(code, status, message);
 return new MonthlyDayDeclarationError('UNAVAILABLE', 503, 'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function monthlyDayDeclarationOperation(sql, principal, session, operation, input = {}) {
 try {
  const ctx = JSON.stringify(employeeContext(principal, session)); let query, values, body;
  if (operation === 'bootstrap') {
   if (!salaryUuid(input.contractId) || !monthlyDayDeclarationPeriod(input.period)) monthlyDayDeclarationFail('INPUT_INVALID', 400, 'Elegí contrato propio y período válidos.');
   query = 'SELECT public.own_monthly_days_bootstrap_v1($1::jsonb,$2::uuid,$3::text) AS result'; values = [ctx, input.contractId, input.period];
  } else if (operation === 'detail') {
   if (!salaryUuid(input.id)) monthlyDayDeclarationFail('INPUT_INVALID', 400, 'Elegí una propuesta válida.');
   query = 'SELECT public.own_monthly_days_detail_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.id];
  } else {
   if (!salaryKey(input.key)) monthlyDayDeclarationFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
   if (operation === 'attempt') { query = 'SELECT public.own_monthly_days_attempt_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.key]; }
   else if (operation === 'command') { body = monthlyDayDeclarationCommand(input.body); query = 'SELECT public.own_monthly_days_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'; values = [ctx, JSON.stringify(body), input.key]; }
   else monthlyDayDeclarationFail('INPUT_INVALID', 400, 'Operación no admitida.');
  }
  const rows = await sql.query(query, values), result = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
  try {
  if (operation === 'bootstrap') {
   monthlyDayDeclarationBootstrap(result);
   if (result.contractId.toLowerCase() !== input.contractId.toLowerCase() || result.period !== input.period) monthlyDayDeclarationFail('CONTRACT_INVALID', 503, 'La consulta devolvió otro contrato o período.');
   return result;
  }
  if (operation === 'detail') {
   await monthlyDayDeclarationDetail(result);
   if (result.proposal.id.toLowerCase() !== input.id.toLowerCase()) monthlyDayDeclarationFail('CONTRACT_INVALID', 503, 'La consulta devolvió otra propuesta.');
   return result;
  }
  monthlyDayDeclarationReceipt(result, body ? { key: input.key, body } : null);
  if (result.requestKey !== input.key || result.requestSha256 !== monthlyDayDeclarationFingerprint(result.body)) monthlyDayDeclarationFail('CONTRACT_INVALID', 503, 'No se verificó el contenido del intento.');
  return result;
  } catch (e) {
   if (e instanceof MonthlyDayDeclarationError) throw e;
   monthlyDayDeclarationFail('CONTRACT_INVALID', 503, 'No se pudo verificar la respuesta conservada. Consultá el mismo intento.');
  }
 } catch (e) { throw monthlyDayDeclarationError(e); }
}
