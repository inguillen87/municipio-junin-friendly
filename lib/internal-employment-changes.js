import {employeeContext} from './internal-native-employees.js';
import {ChangeInputError, changeUuid, changeAttemptKey, changeProposalInput, changeReviewInput, validateChangeBootstrap, validateChangeProposal, validateChangeReceipt} from '../assets/native-employment-change-model.js';

export const EMPLOYMENT_CHANGE_READ = 'workforce.employee.read';
export const EMPLOYMENT_CHANGE_CAPS = Object.freeze({propose: 'employee.record.propose', review: 'employee.record.approve'});
export const EMPLOYMENT_CHANGE_MAX_BYTES = 32768;
export class EmploymentChangeError extends Error {
  constructor(code, status, message) { super(message); Object.assign(this, {name: 'EmploymentChangeError', code: 'NATIVE_EMPLOYMENT_CHANGE_' + code, status}); }
}
export const changeFail = (code, status, message) => { throw new EmploymentChangeError(code, status, message); };
const messages = {
  INPUT_INVALID: [422, 'Revisá el encuadre, el motivo y el documento que respalda la rectificación.'],
  FORBIDDEN: [403, 'Tu cuenta no permite esta operación sobre el legajo.'],
  EMPLOYMENT_REQUIRED: [403, 'La operación requiere una cuenta vinculada a una persona habilitada.'],
  SESSION_INVALID: [401, 'La sesión venció o cambió. Volvé a ingresar.'],
  BINDING_INVALID: [409, 'Cambió el ámbito municipal. Volvé a consultar el legajo.'],
  SCOPE_CHANGED: [409, 'Cambió la identidad o el ámbito de la operación. Consultá el intento con la cuenta y el legajo originales.'],
  IDENTITY_CHANGED: [409, 'Cambió la identificación del legajo. Volvé a consultar antes de continuar.'],
  BASE_CHANGED: [409, 'El encuadre vigente cambió. Conservamos tu propuesta para que compares los valores antes de preparar otra.'],
  CATALOG_CHANGED: [409, 'Cambió el catálogo de encuadres. Actualizá las opciones y revisá la propuesta.'],
  CATALOG_SELECTION_INVALID: [422, 'El convenio, la categoría, el sector o la repartición no corresponden al catálogo vigente.'],
  NO_CHANGE: [422, 'La propuesta no modifica el encuadre vigente.'],
  NOT_FOUND: [404, 'No se encontró el legajo, la propuesta o el intento dentro de tu acceso.'],
  DECIDED: [409, 'La propuesta ya tiene una decisión. Consultá su resultado.'],
  MAKER_CHECKER_REQUIRED: [403, 'La revisión debe realizarla otra persona habilitada.'],
  IDEMPOTENCY_REUSE: [409, 'Esta clave corresponde a otro contenido. Consultá el intento antes de repetirlo.'],
  BUSY: [409, 'Hay otra operación en curso. Reintentá el mismo intento en un momento.'],
  LIMIT: [409, 'Se alcanzó el límite de rectificaciones de este legajo. Su historial se conserva.'],
  CAPACITY_LIMIT: [409, 'No hay capacidad disponible para confirmar esta rectificación. El encuadre vigente se conserva.'],
  CATALOG_UNAVAILABLE: [503, 'El catálogo vigente no está disponible.'],
};
export function employmentChangeError(error) {
  if (error instanceof EmploymentChangeError) return error;
  if (error instanceof ChangeInputError) return new EmploymentChangeError(error.code, error.code === 'CONTRACT_INVALID' ? 503 : 422, error.message);
  const code = String(error?.code || ''), source = code + ' ' + String(error?.message || '');
  for (const [name, [status, message]] of Object.entries(messages)) if (new RegExp(`\\bNATIVE_EMPLOYMENT_CHANGE_${name}\\b`).test(source)) return new EmploymentChangeError(name, status, message);
  if (/ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|PAYROLL_FIXED_SESSION_INVALID/.test(source)) return new EmploymentChangeError('SESSION_INVALID', ...messages.SESSION_INVALID);
  if (/NATIVE_EMPLOYEE_BINDING_INVALID|ACTION_SOURCE_BINDING_REQUIRED|ACTION_RELEASE_NOT_CERTIFIED/.test(source)) return new EmploymentChangeError('BINDING_INVALID', ...messages.BINDING_INVALID);
  if (/NATIVE_EMPLOYEE_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT|PAYROLL_FIXED_FORBIDDEN/.test(source)) return new EmploymentChangeError('FORBIDDEN', ...messages.FORBIDDEN);
  if (/PAYROLL_FIXED_(?:IDENTITY_CHANGED|NATIVE_IDENTITY_INVALID)/.test(source)) return new EmploymentChangeError('IDENTITY_CHANGED', ...messages.IDENTITY_CHANGED);
  if (/PAYROLL_FIXED_(?:NOT_FOUND|LEGAJO_NOT_FOUND)/.test(source)) return new EmploymentChangeError('NOT_FOUND', ...messages.NOT_FOUND);
  if (/NATIVE_EMPLOYEE_CATALOG_UNAVAILABLE|NATIVE_EMPLOYMENT_CATALOG_CATALOG_UNAVAILABLE/.test(source)) return new EmploymentChangeError('CATALOG_UNAVAILABLE', ...messages.CATALOG_UNAVAILABLE);
  if (['NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID', 'NATIVE_EMPLOYMENT_CATALOG_LIMIT', 'NATIVE_EMPLOYMENT_CATALOG_UNAVAILABLE'].includes(code)) return new EmploymentChangeError(code.slice('NATIVE_EMPLOYMENT_CATALOG_'.length), error.status >= 400 && error.status <= 503 ? error.status : 503, code.endsWith('INPUT_INVALID') ? messages.INPUT_INVALID[1] : 'No se pudo leer el envío completo. Consultá el mismo intento antes de repetirlo.');
  if (['55P03', '40P01', '40001'].includes(code) || /NATIVE_EMPLOYMENT_CATALOG_BUSY|ACTION_SESSION_BUSY|PAYROLL_FIXED_SESSION_BUSY/.test(source)) return new EmploymentChangeError('BUSY', ...messages.BUSY);
  return new EmploymentChangeError('UNAVAILABLE', 503, 'No se confirmó la rectificación. Consultá el mismo intento antes de iniciar otro.');
}
export async function employmentChangeOperation(sql, principal, session, operation, input = {}) {
  try {
    const ctx = JSON.stringify(employeeContext(principal, session)); let query, values, expected, contractId;
    if (['propose', 'review'].includes(operation)) {
      if (!changeAttemptKey(input.key)) changeFail('INPUT_INVALID', 428, 'La operación requiere una clave de intento.');
      expected = operation === 'propose' ? changeProposalInput(input.body) : changeReviewInput(input.body); contractId = expected.contractId;
      query = operation === 'propose' ? 'SELECT public.native_employment_change_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result' : 'SELECT public.native_employment_change_review_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
      values = [ctx, JSON.stringify(expected), input.key];
    } else {
      contractId = input.contractId;
      if (!changeUuid(contractId)) changeFail('INPUT_INVALID', 400, 'El legajo debe identificarse por su contrato.');
      if (operation === 'bootstrap') { query = 'SELECT public.native_employment_change_bootstrap_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, contractId]; }
      else if (operation === 'proposal') {
        if (!changeUuid(input.id)) changeFail('INPUT_INVALID', 400, 'La propuesta no es válida.');
        query = 'SELECT public.native_employment_change_proposal_v1($1::jsonb,$2::uuid,$3::uuid) AS result'; values = [ctx, contractId, input.id];
      } else if (operation === 'attempt') {
        if (!changeAttemptKey(input.key)) changeFail('INPUT_INVALID', 428, 'La operación requiere una clave de intento.');
        query = 'SELECT public.native_employment_change_attempt_v1($1::jsonb,$2::uuid,$3::uuid) AS result'; values = [ctx, contractId, input.key];
      } else changeFail('INPUT_INVALID', 400, 'Operación no admitida.');
    }
    const rows = await sql.query(query, values), value = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
    if (operation === 'bootstrap') return validateChangeBootstrap(value, contractId);
    if (operation === 'proposal') return validateChangeProposal(value, contractId, input.id);
    validateChangeReceipt(value, contractId);
    if (expected && (value.operation !== operation || operation === 'propose' && value.employmentVersion !== expected.baseVersion
      || operation === 'review' && (value.proposalId.toLowerCase() !== expected.proposalId || value.status !== (expected.decision === 'approve' ? 'approved' : 'rejected')))) changeFail('CONTRACT_INVALID', 503, 'La confirmación no corresponde a esta rectificación. Consultá el mismo intento.');
    return value;
  } catch (error) { throw employmentChangeError(error); }
}
