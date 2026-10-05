import { createHash } from 'node:crypto';
import { employeeContext } from './internal-native-employees.js';
import { SalaryInputError, salaryKey, salarySerialized } from '../assets/native-salary-catalog-model.js';
import { OwnPayrollError } from '../assets/own-payroll-exact.js';
import { ownProgramBootstrap, ownProgramCommand, ownProgramReceipt } from '../assets/own-payroll-program-model.js';
export const PROGRAM_READ = ['workforce.employee.read', 'payroll.parameter.read'];
export const PROGRAM_CAPS = { propose: ['payroll.parameter.prepare'], approve: ['payroll.parameter.approve'], reject: ['payroll.parameter.approve'] };
export class OwnProgramError extends Error { constructor(code, status, message) { super(message); Object.assign(this, { code: 'OWN_PROGRAM_' + code, status }); } }
export const programFail = (code, status, message) => { throw new OwnProgramError(code, status, message); };
export const programFingerprint = body => createHash('sha256').update(salarySerialized(body)).digest('hex');
const errors = {
  INPUT_INVALID: [422, 'Revisá las reglas, entradas y vigencias completas.'],
  FORBIDDEN: [403, 'Tu cuenta no permite esta operación sobre las reglas.'],
  EMPLOYMENT_REQUIRED: [403, 'La operación requiere una identidad municipal vinculada.'],
  NOT_FOUND: [404, 'No se encontró el intento dentro de tu acceso.'],
  BASE_CHANGED: [409, 'Cambió el programa o el catálogo aprobado. Actualizá y revisá el conjunto completo.'],
  SCOPE_CHANGED: [409, 'Cambió la cuenta o el ámbito. Recuperá el intento desde su cuenta original.'],
  INDEPENDENT_REQUIRED: [403, 'La decisión requiere otra persona habilitada.'],
  IDEMPOTENCY_REUSE: [409, 'La referencia pertenece a otro contenido. Consultá el mismo intento.'],
  DECIDED: [409, 'Esta propuesta ya tiene una decisión. Actualizá la consulta.'],
  PROPOSAL_CHANGED: [409, 'La propuesta no coincide con la versión revisada.'],
  HISTORY_REQUIRED: [422, 'Conservá las reglas anteriores y cerrá su vigencia.'],
  LIMIT: [422, 'El conjunto alcanzó su capacidad. No se recortaron reglas.'],
  BUSY: [409, 'Otra operación está en curso. Consultá o reintentá el mismo envío.'],
};
export function programError(e) {
  if (e instanceof OwnProgramError) return e;
  if (e instanceof OwnPayrollError || e instanceof SalaryInputError) return new OwnProgramError(e.code, /CONTRACT_INVALID/.test(e.code) ? 503 : 422, e.message);
  const m = String(e?.message ?? '');
  if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m) || /SESSION_INVALID/.test(String(e?.code ?? ''))) return new OwnProgramError('SESSION_INVALID', 401, 'La sesión venció. Volvé a ingresar.');
  if (/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m)) return new OwnProgramError('FORBIDDEN', 403, errors.FORBIDDEN[1]);
  for (const [code, [status, message]] of Object.entries(errors)) if (new RegExp('\\bOWN_PROGRAM_' + code + '\\b').test(m)) return new OwnProgramError(code, status, message);
  if (/\bOWN_PROGRAM_(BINDING_[A-Z_]+|DEFINITION_MISSING|SOURCE_DEFINITION_MISSING|UNIT_MISMATCH|CONVERSION_REQUIRED|OPERATION_UNSUPPORTED|ROUNDING_REQUIRED|EXPRESSION_LIMIT|OVERLAP|DEPENDENCY|CYCLE)\b/.test(m)) return new OwnProgramError('INPUT_INVALID', 422, errors.INPUT_INVALID[1]);
  return new OwnProgramError('UNAVAILABLE', 503, 'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function programOperation(sql, principal, session, operation, input = {}) {
  try {
    const ctx = JSON.stringify(employeeContext(principal, session)); let query, values, body;
    if (operation === 'bootstrap') { query = 'SELECT public.own_program_bootstrap_v1($1::jsonb) AS result'; values = [ctx]; }
    else {
      if (!salaryKey(input.key)) programFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
      if (operation === 'attempt') { query = 'SELECT public.own_program_attempt_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.key]; }
      else if (operation === 'command') { body = ownProgramCommand(input.body); query = 'SELECT public.own_program_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'; values = [ctx, JSON.stringify(body), input.key]; }
      else programFail('INPUT_INVALID', 400, 'Operación no admitida.');
    }
    // SQL links new requests against the approved catalog after locking. It
    // recovers a prior receipt first, so later catalog changes cannot break replay.
    const rows = await sql.query(query, values), result = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
    if (operation === 'bootstrap') return ownProgramBootstrap(result);
    ownProgramReceipt(result, body ? { key: input.key, body } : null);
    if (result.requestKey !== input.key || result.requestSha256 !== programFingerprint(result.body)) programFail('CONTRACT_INVALID', 503, 'No se pudo verificar el contenido del intento.');
    return result;
  } catch (e) { throw programError(e); }
}
