import {employeeContext} from './internal-native-employees.js';
import {
  VoidInputError, voidUuid, voidAttemptKey, voidProposalInput, voidReviewInput,
  validateVoidBootstrap, validateVoidProposal, validateVoidReceipt,
} from '../assets/native-employment-void-model.js';

export const EMPLOYMENT_VOID_READ = 'workforce.employee.read';
export const EMPLOYMENT_VOID_CAPS = Object.freeze({
  propose: 'employee.record.propose', review: 'employee.record.approve',
});
export const EMPLOYMENT_VOID_MAX_BYTES = 16384;
export class EmploymentVoidError extends Error {
  constructor(code, status, message) {
    super(message);
    Object.assign(this, {name: 'EmploymentVoidError', code: 'NATIVE_EMPLOYMENT_VOID_' + code, status});
  }
}
export const voidFail = (code, status, message) => { throw new EmploymentVoidError(code, status, message); };
const messages = Object.freeze({
  INPUT_INVALID: [422, 'Revisá el motivo y la confirmación de que el alta histórica no corresponde a una relación vigente.'],
  FORBIDDEN: [403, 'Tu cuenta no permite esta operación de corrección del alta.'],
  ACTOR_REQUIRED: [403, 'La operación requiere identificar a la persona responsable de esta cuenta en el municipio.'],
  SESSION_INVALID: [401, 'La sesión venció o cambió. Volvé a ingresar.'],
  BINDING_INVALID: [409, 'Cambió el ámbito municipal. Volvé a consultar el legajo.'],
  SCOPE_CHANGED: [409, 'Cambió la identidad o el ámbito. Consultá el intento con la cuenta y el legajo originales.'],
  IDENTITY_CHANGED: [409, 'Cambió la identificación de la cuenta o del legajo. Volvé a consultar.'],
  BASE_CHANGED: [409, 'El legajo cambió. Conservamos la propuesta para que compares antes de preparar otra.'],
  PROPOSAL_CHANGED: [409, 'La propuesta no coincide con la versión revisada. Volvé a consultarla.'],
  NOT_FOUND: [404, 'No se encontró el legajo, la propuesta o el intento dentro de tu acceso.'],
  DECIDED: [409, 'La propuesta ya tiene una decisión. Consultá el resultado.'],
  MAKER_CHECKER_REQUIRED: [403, 'La revisión debe realizarla otra persona habilitada.'],
  IDEMPOTENCY_REUSE: [409, 'Esta clave corresponde a otro contenido. Consultá el intento antes de repetirlo.'],
  BUSY: [409, 'Hay otra operación en curso. Reintentá el mismo intento en un momento.'],
  IN_USE: [409, 'El legajo tiene movimientos propios que deben revisarse antes de corregir el alta.'],
  ORIGIN_NOT_SUPPORTED: [409, 'Esta corrección corresponde a un legajo histórico incorporado al padrón. Para otras altas, revisá su circuito administrativo.'],
  WITHDRAWN: [409, 'El alta ya fue retirada o el legajo no está activo. Consultá su historial.'],
  LIMIT: [409, 'Se alcanzó el límite de propuestas de corrección. El historial se conserva.'],
  CAPACITY_LIMIT: [409, 'No hay capacidad disponible para registrar la corrección. El padrón se conserva.'],
  CONTRACT_INVALID: [503, 'No se pudo verificar la corrección del alta. Consultá el mismo intento antes de repetirlo.'],
});

export function employmentVoidError(error) {
  if (error instanceof EmploymentVoidError) return error;
  if (error instanceof VoidInputError) {
    return new EmploymentVoidError(error.code, error.code === 'CONTRACT_INVALID' ? 503 : 422, error.message);
  }
  const code = String(error?.code || ''), source = code + ' ' + String(error?.message || '');
  for (const [name, [status, message]] of Object.entries(messages)) {
    if (new RegExp('\\bNATIVE_EMPLOYMENT_VOID_' + name + '\\b').test(source)) {
      return new EmploymentVoidError(name, status, message);
    }
  }
  if (/ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|PAYROLL_FIXED_SESSION_INVALID/.test(source)) {
    return new EmploymentVoidError('SESSION_INVALID', ...messages.SESSION_INVALID);
  }
  if (/NATIVE_EMPLOYEE_BINDING_INVALID|ACTION_SOURCE_BINDING_REQUIRED|ACTION_RELEASE_NOT_CERTIFIED/.test(source)) {
    return new EmploymentVoidError('BINDING_INVALID', ...messages.BINDING_INVALID);
  }
  if (/NATIVE_EMPLOYEE_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT|PAYROLL_FIXED_FORBIDDEN|NATIVE_EMPLOYMENT_LIFECYCLE_FORBIDDEN/.test(source)) {
    return new EmploymentVoidError('FORBIDDEN', ...messages.FORBIDDEN);
  }
  if (/PAYROLL_FIXED_(?:IDENTITY_CHANGED|NATIVE_IDENTITY_INVALID)/.test(source)) {
    return new EmploymentVoidError('IDENTITY_CHANGED', ...messages.IDENTITY_CHANGED);
  }
  if (/PAYROLL_FIXED_(?:NOT_FOUND|LEGAJO_NOT_FOUND)|NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND|NATIVE_EMPLOYEE_READ_NOT_FOUND/.test(source)) {
    return new EmploymentVoidError('NOT_FOUND', ...messages.NOT_FOUND);
  }
  if (code === 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID') {
    return new EmploymentVoidError('INPUT_INVALID', error.status === 413 ? 413 : 400, 'El formulario contiene datos ambiguos o inválidos.');
  }
  if (code === 'NATIVE_EMPLOYMENT_CATALOG_LIMIT' && error.status === 413) {
    return new EmploymentVoidError('INPUT_INVALID', 413, 'El formulario supera el tamaño permitido. Reducí su contenido antes de enviarlo.');
  }
  if (['55P03', '40P01', '40001'].includes(code) || /NATIVE_EMPLOYMENT_(?:LIFECYCLE|CATALOG)_BUSY|ACTION_SESSION_BUSY|PAYROLL_FIXED_SESSION_BUSY/.test(source)) {
    return new EmploymentVoidError('BUSY', ...messages.BUSY);
  }
  if (/NATIVE_EMPLOYMENT_LIFECYCLE_CAPACITY_LIMIT/.test(source)) {
    return new EmploymentVoidError('CAPACITY_LIMIT', ...messages.CAPACITY_LIMIT);
  }
  return new EmploymentVoidError('UNAVAILABLE', 503, 'No se confirmó la corrección del alta. Consultá el mismo intento antes de iniciar otro.');
}

export async function employmentVoidOperation(sql, principal, session, operation, input = {}) {
  try {
    const ctx = JSON.stringify(employeeContext(principal, session));
    let query, values, expected, contractId;
    if (operation === 'propose' || operation === 'review') {
      if (!voidAttemptKey(input.key)) voidFail('INPUT_INVALID', 428, 'La operación requiere una clave de intento.');
      expected = operation === 'propose' ? voidProposalInput(input.body) : voidReviewInput(input.body);
      contractId = expected.contractId;
      query = operation === 'propose'
        ? 'SELECT public.native_employment_void_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'
        : 'SELECT public.native_employment_void_review_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
      values = [ctx, JSON.stringify(expected), input.key];
    } else {
      if (!voidUuid(input.contractId)) voidFail('INPUT_INVALID', 400, 'El legajo debe identificarse por su contrato.');
      contractId = input.contractId.toLowerCase();
      if (operation === 'bootstrap') {
        query = 'SELECT public.native_employment_void_bootstrap_v1($1::jsonb,$2::uuid) AS result';
        values = [ctx, contractId];
      } else if (operation === 'proposal') {
        if (!voidUuid(input.id)) voidFail('INPUT_INVALID', 400, 'La propuesta no es válida.');
        query = 'SELECT public.native_employment_void_proposal_v1($1::jsonb,$2::uuid,$3::uuid) AS result';
        values = [ctx, contractId, input.id.toLowerCase()];
      } else if (operation === 'attempt') {
        if (!voidAttemptKey(input.key)) voidFail('INPUT_INVALID', 428, 'La operación requiere una clave de intento.');
        query = 'SELECT public.native_employment_void_attempt_v1($1::jsonb,$2::uuid,$3::uuid) AS result';
        values = [ctx, contractId, input.key];
      } else voidFail('INPUT_INVALID', 400, 'Operación no admitida.');
    }
    const rows = await sql.query(query, values);
    const value = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
    if (operation === 'bootstrap') return validateVoidBootstrap(value, contractId);
    if (operation === 'proposal') return validateVoidProposal(value, contractId, input.id.toLowerCase());
    validateVoidReceipt(value, contractId);
    if (expected && (value.operation !== operation
      || operation === 'propose' && value.status !== 'pending'
      || operation === 'review' && (value.proposalId.toLowerCase() !== expected.proposalId
        || value.proposalVersion !== expected.proposalVersion
        || value.status !== (expected.decision === 'approve' ? 'approved' : 'rejected')))) {
      voidFail('CONTRACT_INVALID', ...messages.CONTRACT_INVALID);
    }
    return value;
  } catch (error) {
    throw employmentVoidError(error);
  }
}
