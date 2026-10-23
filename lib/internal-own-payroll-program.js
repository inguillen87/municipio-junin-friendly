import { createHash } from 'node:crypto';
import { employeeContext } from './internal-native-employees.js';
import { SalaryInputError, salaryKey, salarySerialized } from '../assets/native-salary-catalog-model.js';
import { OwnPayrollError } from '../assets/own-payroll-exact.js';
import { ownProgramBootstrap, ownProgramCommand, ownProgramReceipt, ownProgramMonetary } from '../assets/own-payroll-program-model.js';
import { verifyOwnMonetaryProgrammeManifestSync } from './own-payroll-monetary-verification.js';
export const PROGRAM_READ = ['workforce.employee.read', 'payroll.parameter.read'];
export const PROGRAM_CAPS = { propose: ['payroll.parameter.prepare'], approve: ['payroll.parameter.approve'], reject: ['payroll.parameter.approve'] };
export class OwnProgramError extends Error { constructor(code, status, message) { super(message); Object.assign(this, { code: 'OWN_PROGRAM_' + code, status }); } }
export const programFail = (code, status, message) => { throw new OwnProgramError(code, status, message); };
export const programFingerprint = body => createHash('sha256').update(salarySerialized(body)).digest('hex');
const errors = {
  FORCED_POLICY_INVALID: [422, 'La política del importe fijo forzado está incompleta o no coincide con sus reglas. Revisá la declaración completa.'],
  FORCED_LINEAGE_REQUIRED: [422, 'Falta la declaración documental revisada de las fases de cantidad. No se certificó su procedencia histórica.'],
  FORCED_SOURCE_CHANGED: [422, 'La huella no conserva las expresiones actuales de la política. Revisá el programa completo antes de proponerlo.'],
  INPUT_INVALID: [422, 'Revisá las reglas, entradas y vigencias completas.'],
  PRECISION_REQUIRED: [422, 'Las reglas nuevas deben conservar el resultado exacto en todas las etapas y usar referencias antes del redondeo. Conservamos la carga; revisá la precisión y las fuentes.'],
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
// This verifies only the declared complete manifest. SQL still owns catalogue
// linkage, history, capabilities, locking, maker/checker and idempotent replay.
function checkedProgramMonetaryDefinition(definition) {
  if (definition !== null && ownProgramMonetary(definition)) verifyOwnMonetaryProgrammeManifestSync(definition);
}
// The complete local command is declarative client input. A protocol shape error
// named CONTRACT_INVALID is still a client rejection here, never a SQL failure.
function checkedProgramCommand(raw) {
  try {
    const body = ownProgramCommand(raw);
    if (body.command === 'propose') checkedProgramMonetaryDefinition(body.program);
    return body;
  } catch (error) {
    if (error instanceof OwnPayrollError || error instanceof SalaryInputError) throw new OwnProgramError(error.code, 422, error.message);
    throw error;
  }
}
// Validate the whole preserved response inside one boundary, including structure,
// history, inner manifest and outer receipt digest. SQL/auth errors never enter it.
function checkedProgramResponse(result, operation, key, body) {
  try {
    if (operation === 'bootstrap') {
      ownProgramBootstrap(result);
      checkedProgramMonetaryDefinition(result.program.definition);
      for (const proposal of result.proposals) {
        checkedProgramMonetaryDefinition(proposal.baseDefinition);
        checkedProgramMonetaryDefinition(proposal.definition);
      }
      return result;
    }
    ownProgramReceipt(result, body ? { key, body } : null);
    if (result.body.command === 'propose') checkedProgramMonetaryDefinition(result.body.program);
    if (result.requestKey !== key || result.requestSha256 !== programFingerprint(result.body)) programFail('CONTRACT_INVALID', 503, 'No se pudo verificar el contenido del intento.');
    return result;
  } catch {
    programFail('CONTRACT_INVALID', 503, 'No se pudo verificar el programa o el intento conservado. Consultá el mismo intento.');
  }
}
export async function programOperation(sql, principal, session, operation, input = {}) {
  try {
    const ctx = JSON.stringify(employeeContext(principal, session)); let query, values, body;
    if (operation === 'bootstrap') { query = 'SELECT public.own_program_bootstrap_v1($1::jsonb) AS result'; values = [ctx]; }
    else {
      if (!salaryKey(input.key)) programFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
      if (operation === 'attempt') { query = 'SELECT public.own_program_attempt_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.key]; }
      else if (operation === 'command') { body = checkedProgramCommand(input.body); query = 'SELECT public.own_program_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'; values = [ctx, JSON.stringify(body), input.key]; }
      else programFail('INPUT_INVALID', 400, 'Operación no admitida.');
    }
    // SQL links new requests against the approved catalog after locking. It
    // recovers a prior receipt first, so later catalog changes cannot break replay.
    const rows = await sql.query(query, values), result = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
    return checkedProgramResponse(result, operation, input.key, body);
  } catch (e) { throw programError(e); }
}
