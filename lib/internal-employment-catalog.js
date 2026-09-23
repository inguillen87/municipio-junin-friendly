import { employeeContext, NativeEmployeeError } from './internal-native-employees.js';
import { CatalogInputError, catalogAttemptKey, catalogUuid, catalogProposalInput, catalogReviewInput, validateCatalogBootstrap, validateCatalogProposal, validateCatalogReceipt } from '../assets/native-employment-catalog-model.js';
export const EMPLOYMENT_CATALOG_MAX_BYTES = 2 * 1024 * 1024;
export const EMPLOYMENT_CATALOG_READ = 'workforce.employee.read';
export const EMPLOYMENT_CATALOG_CAPS = Object.freeze({propose: 'employee.catalog.propose', review: 'employee.catalog.approve'});
export class EmploymentCatalogError extends Error {
  constructor(code, status, message) { super(message); Object.assign(this, {name: 'EmploymentCatalogError', code: 'NATIVE_EMPLOYMENT_CATALOG_' + code, status}); }
}
export const catalogFail = (code, status, message) => { throw new EmploymentCatalogError(code, status, message); };
const messages = {
  INPUT_INVALID: [422, 'Revisá las opciones, sus códigos y el motivo.'], FORBIDDEN: [403, 'Tu cuenta no permite esta operación sobre el catálogo.'],
  EMPLOYMENT_REQUIRED: [403, 'La operación requiere una cuenta vinculada a una persona habilitada.'], SESSION_INVALID: [401, 'La sesión venció o cambió. Volvé a ingresar.'],
  BINDING_INVALID: [409, 'Cambió el ámbito municipal. Volvé a consultar el catálogo.'], BASE_CHANGED: [409, 'El catálogo vigente cambió. Conservamos tu propuesta para que compares las diferencias antes de volver a prepararla.'],
  SCOPE_CHANGED: [409, 'Cambió la identidad o el ámbito de la operación. Volvé a consultar con la cuenta original antes de recuperar el intento.'],
  NOT_FOUND: [404, 'No se encontró la propuesta o el intento dentro de tu acceso.'], DECIDED: [409, 'La propuesta ya tiene una decisión. Consultá su resultado.'],
  MAKER_CHECKER_REQUIRED: [403, 'La revisión debe realizarla otra persona habilitada.'], IDEMPOTENCY_REUSE: [409, 'Esta clave corresponde a otro contenido. Consultá el intento antes de repetirlo.'],
  BUSY: [409, 'Hay otra operación en curso. Reintentá el mismo intento en un momento.'], LIMIT: [422, 'El catálogo supera los límites de opciones o contenido.'],
  CAPACITY_LIMIT: [409, 'Se alcanzó el cupo de propuestas. Los registros existentes se conservan.'], CATALOG_UNAVAILABLE: [503, 'El catálogo vigente no está disponible.'],
};
export function employmentCatalogError(error) {
  if (error instanceof EmploymentCatalogError) return error;
  if (error instanceof CatalogInputError) return new EmploymentCatalogError(error.code, error.code === 'CONTRACT_INVALID' ? 503 : 422, error.message);
  if (error instanceof NativeEmployeeError && error.code === 'NATIVE_EMPLOYEE_SESSION_INVALID') return new EmploymentCatalogError('SESSION_INVALID', ...messages.SESSION_INVALID);
  const message = String(error?.message || '');
  for (const [code, [status, safe]] of Object.entries(messages)) if (new RegExp(`\\bNATIVE_EMPLOYMENT_CATALOG_${code}\\b`).test(message)) return new EmploymentCatalogError(code, status, safe);
  if (/ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID/.test(message)) return new EmploymentCatalogError('SESSION_INVALID', ...messages.SESSION_INVALID);
  if (/NATIVE_EMPLOYEE_BINDING_INVALID|ACTION_SOURCE_BINDING_REQUIRED|ACTION_RELEASE_NOT_CERTIFIED/.test(message)) return new EmploymentCatalogError('BINDING_INVALID', ...messages.BINDING_INVALID);
  if (/NATIVE_EMPLOYEE_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(message)) return new EmploymentCatalogError('FORBIDDEN', ...messages.FORBIDDEN);
  if (/NATIVE_EMPLOYEE_CATALOG_UNAVAILABLE/.test(message)) return new EmploymentCatalogError('CATALOG_UNAVAILABLE', ...messages.CATALOG_UNAVAILABLE);
  if (['55P03', '40P01', '40001'].includes(error?.code) || /ACTION_SESSION_BUSY/.test(message)) return new EmploymentCatalogError('BUSY', ...messages.BUSY);
  return new EmploymentCatalogError('UNAVAILABLE', 503, 'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function employmentCatalogOperation(sql, principal, session, operation, input = {}) {
  try {
    const ctx = JSON.stringify(employeeContext(principal, session)); let query, values, expected;
    if (operation === 'bootstrap') { query = 'SELECT public.native_employment_catalog_bootstrap_v1($1::jsonb) AS result'; values = [ctx]; }
    else if (operation === 'proposal') {
      if (!catalogUuid(input.id)) catalogFail('INPUT_INVALID', 400, 'La propuesta no es válida.');
      query = 'SELECT public.native_employment_catalog_proposal_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.id];
    } else {
      if (!catalogAttemptKey(input.key)) catalogFail('INPUT_INVALID', 428, 'La operación requiere una clave de intento.');
      if (operation === 'attempt') { query = 'SELECT public.native_employment_catalog_attempt_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.key]; }
      else if (operation === 'propose') {
        expected = catalogProposalInput(input.body);
        query = 'SELECT public.native_employment_catalog_propose_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'; values = [ctx, JSON.stringify(expected), input.key];
      } else if (operation === 'review') {
        expected = catalogReviewInput(input.body);
        query = 'SELECT public.native_employment_catalog_review_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'; values = [ctx, JSON.stringify(expected), input.key];
      } else catalogFail('INPUT_INVALID', 400, 'Operación no admitida.');
    }
    const rows = await sql.query(query, values), value = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
    if (operation === 'bootstrap') return validateCatalogBootstrap(value);
    if (operation === 'proposal') { validateCatalogProposal(value); if (value.proposal.id.toLowerCase() !== input.id.toLowerCase()) catalogFail('CONTRACT_INVALID', 503, 'No se pudo verificar la propuesta solicitada.'); return value; }
    validateCatalogReceipt(value);
    if (expected && (value.operation !== operation || operation === 'propose' && value.catalogVersion !== expected.baseVersion
      || operation === 'review' && (value.proposalId.toLowerCase() !== expected.proposalId.toLowerCase() || value.status !== (expected.decision === 'approve' ? 'approved' : 'rejected')))) catalogFail('CONTRACT_INVALID', 503, 'La confirmación no corresponde a esta operación. Consultá el mismo intento.');
    return value;
  } catch (error) { throw employmentCatalogError(error); }
}
