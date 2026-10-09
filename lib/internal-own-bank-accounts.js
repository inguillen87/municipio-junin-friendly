import { createHash } from 'node:crypto';
import { employeeContext } from './internal-native-employees.js';
import { SalaryInputError, salaryKey, salaryUuid, salarySerialized } from '../assets/native-salary-catalog-model.js';
import { bankAccountsBootstrap, bankAccountsCommand, bankAccountsReceipt, bankAccountsDetail } from '../assets/own-bank-accounts-model.js';
export const BANK_ACCOUNTS_READ = ['workforce.employee.read', 'payroll.parameter.read'];
export const BANK_ACCOUNTS_CAPS = { propose: ['payroll.parameter.prepare'], approve: ['payroll.parameter.approve'], reject: ['payroll.parameter.approve'] };
export class BankAccountsError extends Error { constructor(code, status, message) { super(message); Object.assign(this, { code: code.startsWith('BANK_ACCOUNTS_') ? code : 'BANK_ACCOUNTS_' + code, status }); } }
export const bankAccountsFail = (code, status, message) => { throw new BankAccountsError(code, status, message); };
export const bankAccountsFingerprint = body => createHash('sha256').update(salarySerialized(body)).digest('hex');
const errors = {
  INPUT_INVALID: [422, 'Revisá cuentas, constancias y vigencias completos.'],
  FORBIDDEN: [403, 'Tu cuenta no permite esta operación sobre las cuentas.'],
  EMPLOYMENT_REQUIRED: [403, 'La operación requiere una identidad municipal vinculada.'],
  NOT_FOUND: [404, 'No se encontró la propuesta o el intento dentro de tu acceso.'],
  BASE_CHANGED: [409, 'Cambió la configuración o su fuente. Actualizá y revisá el conjunto completo.'],
  SCOPE_CHANGED: [409, 'Cambió la cuenta o el ámbito. Recuperá el intento desde su cuenta original.'],
  INDEPENDENT_REQUIRED: [403, 'La decisión requiere otra persona habilitada.'],
  IDEMPOTENCY_REUSE: [409, 'La referencia pertenece a otro contenido. Consultá el mismo intento.'],
  DECIDED: [409, 'Esta propuesta ya tiene una decisión. Actualizá la consulta.'],
  PROPOSAL_CHANGED: [409, 'La propuesta no coincide con la versión revisada.'],
  HISTORY_REQUIRED: [422, 'Conservá cada referencia y su contrato; el retiro y la corrección requieren una nueva revisión.'],
  SOURCE_REQUIRED: [422, 'Antes de preparar cuentas, incorporá los contratos al padrón propio. No se vincula una cuenta por nombre o documento.'],
  OVERLAP: [422, 'Hay cuentas superpuestas. Cerrá la vigencia anterior antes de agregar otra.'],
  LIMIT: [422, 'El conjunto alcanzó su capacidad. No se recortaron cuentas.'],
  BUSY: [409, 'Otra operación está en curso. Consultá o reintentá el mismo envío.'],
};
export function bankAccountsError(e) {
  if (e instanceof BankAccountsError) return e;
  if (e instanceof SalaryInputError) return new BankAccountsError(e.code, /CONTRACT_INVALID/.test(e.code) ? 503 : 422, e.message);
  const m = String(e?.message ?? '');
  if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TENANT_IAM_SESSION_INVALID/.test(m) || /SESSION_INVALID/.test(String(e?.code ?? ''))) return new BankAccountsError('SESSION_INVALID', 401, 'La sesión venció. Volvé a ingresar.');
  if (/NATIVE_EMPLOYEE_FORBIDDEN|NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN|NATIVE_SALARY_FORBIDDEN|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/.test(m)) return new BankAccountsError('FORBIDDEN', 403, errors.FORBIDDEN[1]);
  for (const [code, [status, message]] of Object.entries(errors)) if (new RegExp('\\bBANK_ACCOUNTS_' + code + '\\b').test(m)) return new BankAccountsError(code, status, message);
  return new BankAccountsError('UNAVAILABLE', 503, 'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.');
}
export async function bankAccountsOperation(sql, principal, session, operation, input = {}) {
  try {
    const ctx = JSON.stringify(employeeContext(principal, session)); let query, values, body;
    if (operation === 'bootstrap') { query = 'SELECT public.own_bank_accounts_bootstrap_v1($1::jsonb) AS result'; values = [ctx]; }
    else if (operation === 'detail') {
      if (!salaryUuid(input.id)) bankAccountsFail('INPUT_INVALID', 400, 'Elegí una propuesta válida.');
      query = 'SELECT public.own_bank_accounts_detail_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.id];
    } else {
      if (!salaryKey(input.key)) bankAccountsFail('INPUT_INVALID', 428, 'La operación requiere una referencia de intento.');
      if (operation === 'attempt') { query = 'SELECT public.own_bank_accounts_attempt_v1($1::jsonb,$2::uuid) AS result'; values = [ctx, input.key]; }
      else if (operation === 'command') { body = bankAccountsCommand(input.body); query = 'SELECT public.own_bank_accounts_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result'; values = [ctx, JSON.stringify(body), input.key]; }
      else bankAccountsFail('INPUT_INVALID', 400, 'Operación no admitida.');
    }
    const rows = await sql.query(query, values), result = (Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result;
    if (operation === 'bootstrap') return bankAccountsBootstrap(result);
    if (operation === 'detail') { await bankAccountsDetail(result); if (result.proposal.id.toLowerCase() !== input.id.toLowerCase()) bankAccountsFail('CONTRACT_INVALID', 503, 'La consulta devolvió otra propuesta.'); return result; }
    bankAccountsReceipt(result, body ? { key: input.key, body } : null);
    if (result.requestKey !== input.key || result.requestSha256 !== bankAccountsFingerprint(result.body)) bankAccountsFail('CONTRACT_INVALID', 503, 'No se pudo verificar el contenido del intento.');
    return result;
  } catch (e) { throw bankAccountsError(e); }
}
