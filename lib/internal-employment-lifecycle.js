import {employeeContext} from './internal-native-employees.js';
import {LifecycleInputError, lifecycleUuid, lifecycleAttemptKey, lifecycleProposalInput, lifecycleReviewInput, validateLifecycleBootstrap, validateLifecycleProposal, validateLifecycleReceipt} from '../assets/native-employment-lifecycle-model.js';

export const EMPLOYMENT_LIFECYCLE_READ = 'workforce.employee.read';
export const EMPLOYMENT_LIFECYCLE_CAPS = Object.freeze({propose: 'employee.record.propose', review: 'employee.record.approve'});
export const EMPLOYMENT_LIFECYCLE_MAX_BYTES = 32768;
export class EmploymentLifecycleError extends Error {
  constructor(code, status, message) { super(message); Object.assign(this, {name: 'EmploymentLifecycleError', code: 'NATIVE_EMPLOYMENT_LIFECYCLE_' + code, status}); }
}
export const lifecycleFail = (code, status, message) => { throw new EmploymentLifecycleError(code, status, message); };
const messages = {
  INPUT_INVALID: [422, 'Revisá el movimiento, sus fechas, el motivo y el documento de respaldo.'],
  FORBIDDEN: [403, 'Tu cuenta no permite esta operación sobre el legajo.'],
  EMPLOYMENT_REQUIRED: [403, 'La operación requiere una cuenta vinculada a una persona habilitada.'],
  SESSION_INVALID: [401, 'La sesión venció o cambió. Volvé a ingresar.'],
  BINDING_INVALID: [409, 'Cambió el ámbito municipal. Volvé a consultar el legajo.'],
  SCOPE_CHANGED: [409, 'Cambió la identidad o el ámbito de la operación. Consultá el intento con la cuenta y el legajo originales.'],
  IDENTITY_CHANGED: [409, 'Cambió la identificación del legajo. Volvé a consultar antes de continuar.'],
  BASE_CHANGED: [409, 'El historial laboral vigente cambió. Conservamos tu propuesta para que compares los valores antes de preparar otra.'],
  DATES_INVALID: [422, 'La baja debe cerrar el último período abierto. El reingreso requiere una baja previa y una fecha posterior, sin superposiciones.'],
  NOT_FOUND: [404, 'No se encontró el legajo, la propuesta o el intento dentro de tu acceso.'],
  DECIDED: [409, 'La propuesta ya tiene una decisión. Consultá su resultado.'],
  MAKER_CHECKER_REQUIRED: [403, 'La revisión debe realizarla otra persona habilitada.'],
  IDEMPOTENCY_REUSE: [409, 'Esta clave corresponde a otro contenido. Consultá el intento antes de repetirlo.'],
  BUSY: [409, 'Hay otra operación en curso. Reintentá el mismo intento en un momento.'],
  LIMIT: [409, 'Se alcanzó el límite de movimientos laborales de este legajo. Su historial se conserva.'],
  CAPACITY_LIMIT: [409, 'No hay capacidad disponible para confirmar este movimiento. El historial laboral vigente se conserva.'],
  CATALOG_UNAVAILABLE: [503, 'El catálogo vigente no está disponible.'],
};
export function employmentLifecycleError(error) {
  if (error instanceof EmploymentLifecycleError) return error;
  if (error instanceof LifecycleInputError) return new EmploymentLifecycleError(error.code, error.code === 'CONTRACT_INVALID' ? 503 : 422, error.message);
  const code = String(error?.code || ''), source = code + ' ' + String(error?.message || '');
  for (const [name, [status, message]] of Object.entries(messages)) if (new RegExp(`\\bNATIVE_EMPLOYMENT_LIFECYCLE_${name}\\b`).test(source)) return new EmploymentLifecycleError(name, status, message);
  if (/ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|PAYROLL_FIXED_SESSION_INVALID/.test(source)) return new EmploymentLifecycleError('SESSION_INVALID', ...messages.SESSION_INVALID);
  if (/NATIVE_EMPLOYEE_BINDING_INVALID|ACTION_SOURCE_BINDING_REQUIRED|ACTION_RELEASE_NOT_CERTIFIED/.test(source)) return new EmploymentLifecycleError('BINDING_INVALID', ...messages.BINDING_INVALID);
  if (/NATIVE_EMPLOYEE_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT|PAYROLL_FIXED_FORBIDDEN/.test(source)) return new EmploymentLifecycleError('FORBIDDEN', ...messages.FORBIDDEN);
  if (/PAYROLL_FIXED_(?:IDENTITY_CHANGED|NATIVE_IDENTITY_INVALID)/.test(source)) return new EmploymentLifecycleError('IDENTITY_CHANGED', ...messages.IDENTITY_CHANGED);
  if (/PAYROLL_FIXED_(?:NOT_FOUND|LEGAJO_NOT_FOUND)/.test(source)) return new EmploymentLifecycleError('NOT_FOUND', ...messages.NOT_FOUND);
  if (/NATIVE_EMPLOYEE_CATALOG_UNAVAILABLE|NATIVE_EMPLOYMENT_CATALOG_CATALOG_UNAVAILABLE/.test(source)) return new EmploymentLifecycleError('CATALOG_UNAVAILABLE', ...messages.CATALOG_UNAVAILABLE);
  if (['NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID', 'NATIVE_EMPLOYMENT_CATALOG_LIMIT', 'NATIVE_EMPLOYMENT_CATALOG_UNAVAILABLE'].includes(code)) return new EmploymentLifecycleError(code.slice('NATIVE_EMPLOYMENT_CATALOG_'.length), error.status >= 400 && error.status <= 503 ? error.status : 503, code.endsWith('INPUT_INVALID') ? messages.INPUT_INVALID[1] : 'No se pudo leer el envío completo. Consultá el mismo intento antes de repetirlo.');
  if (['55P03', '40P01', '40001'].includes(code) || /NATIVE_EMPLOYMENT_CATALOG_BUSY|ACTION_SESSION_BUSY|PAYROLL_FIXED_SESSION_BUSY/.test(source)) return new EmploymentLifecycleError('BUSY', ...messages.BUSY);
  return new EmploymentLifecycleError('UNAVAILABLE', 503, 'No se confirmó la movimiento laboral. Consultá el mismo intento antes de iniciar otro.');
}
export async function employmentLifecycleOperation(sql, principal, session, operation, input = {}) {
  try {
    const ctx = JSON.stringify(employeeContext(principal, session)); let query, values, expected, contractId;
    if (['propose', 'review'].includes(operation)) {
      if (!lifecycleAttemptKey(input.key)) lifecycleFail('INPUT_INVALID', 428, 'La operación requiere una clave de intento.');
      expected = operation === 'propose' ? lifecycleProposalInput(input.body) : lifecycleReviewInput(input.body); contractId = expected.contractId;
      query = operation === 'propose' ? 'SELECT public.native_employment_lifecycle_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result' : 'SELECT public.native_employment_lifecycle_review_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
      values = [ctx, JSON.stringify(expected), input.key];
    } else {
      contractId = input.contractId;
      if (!lifecycleUuid(contractId)) lifecycleFail('INPUT_INVALID', 400, 'El legajo debe identificarse por su contrato.');
      if (operation === 'bootstrap') { query = 'SELECT public.native_employment_lifecycle_bootstrap_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, contractId]; }
      else if (operation === 'proposal') {
        if (!lifecycleUuid(input.id)) lifecycleFail('INPUT_INVALID', 400, 'La propuesta no es válida.');
        query = 'SELECT public.native_employment_lifecycle_proposal_v1($1::jsonb,$2::uuid,$3::uuid) AS result'; values = [ctx, contractId, input.id];
      } else if (operation === 'attempt') {
        if (!lifecycleAttemptKey(input.key)) lifecycleFail('INPUT_INVALID', 428, 'La operación requiere una clave de intento.');
        query = 'SELECT public.native_employment_lifecycle_attempt_v1($1::jsonb,$2::uuid,$3::uuid) AS result'; values = [ctx, contractId, input.key];
      } else lifecycleFail('INPUT_INVALID', 400, 'Operación no admitida.');
    }
    const rows = await sql.query(query, values), value = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
    if (operation === 'bootstrap') return validateLifecycleBootstrap(value, contractId);
    if (operation === 'proposal') return validateLifecycleProposal(value, contractId, input.id);
    validateLifecycleReceipt(value, contractId);
    if (expected && (value.operation !== operation || operation === 'propose' && value.employmentVersion !== expected.baseVersion
      || operation === 'review' && (value.proposalId.toLowerCase() !== expected.proposalId || value.status !== (expected.decision === 'approve' ? 'approved' : 'rejected')))) lifecycleFail('CONTRACT_INVALID', 503, 'La confirmación no corresponde a este movimiento. Consultá el mismo intento.');
    return value;
  } catch (error) { throw employmentLifecycleError(error); }
}
