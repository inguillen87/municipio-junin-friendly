import { createHash } from 'node:crypto';
import { PARAMETER_CONTRACT, PARAMETER_SOURCE_SHA, PARAMETER_REASONS, ParameterInputError, validateParameterDraft, verifiedParameterProposal } from './payroll-parameter-contract.js';
export const PARAMETER_MAX_BODY_BYTES = 16384;
export class PayrollParameterError extends Error {
  constructor(code, status, message) { super(message); Object.assign(this, { name: 'PayrollParameterError', code, status }); }
}
const fail = (code, status, message) => { throw new PayrollParameterError(code, status, message); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const exact = (o, keys) => { if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).sort().join('|') !== [...keys].sort().join('|')) fail('PAYROLL_PARAMETER_INPUT_INVALID', 400, 'La operación contiene campos no admitidos.'); };
const id = value => { if (typeof value !== 'string' || !UUID.test(value)) fail('PAYROLL_PARAMETER_ID_INVALID', 422, 'Identificador inválido.'); return value.toLowerCase(); };
const key = value => { if (typeof value !== 'string' || !V4.test(value)) fail('PAYROLL_PARAMETER_IDEMPOTENCY_INVALID', 428, 'La operación requiere una clave de intento válida.'); return value.toLowerCase(); };
export const stableParameterJson = value => Array.isArray(value) ? '[' + value.map(stableParameterJson).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableParameterJson(value[k])).join(',') + '}' : JSON.stringify(value);
export function parameterContext(principal, session) {
  if (principal?.tenant?.source !== 'membership' || !principal?.user?.email || String(session?.email || '').toLowerCase() !== principal.user.email.toLowerCase() || !Number.isSafeInteger(session?.version) || session.version < 1 || !/^[a-f0-9]{40}$/.test(session?.releaseSha || '')) fail('PAYROLL_PARAMETER_SESSION_INVALID', 401, 'La sesión operativa ya no es válida.');
  return { actorEmail: principal.user.email.trim().toLowerCase(), actorSessionId: id(session.id), actorSessionVersion: session.version, membershipId: id(principal.tenant.membershipId), releaseSha: session.releaseSha, tenantId: id(principal.tenant.id) };
}
const errors = {
  IDEMPOTENCY_REUSE: [409, 'El intento ya fue utilizado para otra operación.'], DUPLICATE_PROPOSAL: [409, 'Ya hay una propuesta igual. Consultá los cambios guardados.'], VERSION_CONFLICT: [409, 'La propuesta cambió. Volvé a abrirla antes de decidir.'],
  MAKER_CHECKER_REQUIRED: [403, 'Quien prepara el cambio no puede aprobarlo.'], PREPARER_REQUIRED: [403, 'Sólo quien preparó el cambio puede enviarlo o cancelarlo.'], CAPABILITY_REQUIRED: [403, 'No tenés permiso para esta operación.'], EMPLOYMENT_REQUIRED: [403, 'La operación requiere un vínculo laboral verificado.'],
  BINDING_CHANGED: [409, 'Cambió la fuente certificada. Actualizá la página.'], ATTEMPT_CONTEXT_CHANGED: [409, 'El intento pertenece a otra sesión o versión. Revisá el historial antes de repetirlo.'], ATTEMPT_NOT_FOUND: [404, 'El intento todavía no tiene confirmación.'], NOT_FOUND: [404, 'Propuesta no encontrada.'],
  SESSION_INVALID: [401, 'La sesión operativa ya no es válida.'], SESSION_BUSY: [409, 'El acceso está actualizándose. Reintentá en un momento.'], TRANSITION_INVALID: [409, 'La propuesta no admite esa decisión.'],
};
function mapError(error) {
  if (error instanceof PayrollParameterError) return error;
  if (error instanceof ParameterInputError) return new PayrollParameterError(error.code, 422, error.message);
  for (const [suffix, [status, message]] of Object.entries(errors)) if (String(error?.message).includes('PAYROLL_PARAMETER_' + suffix)) return new PayrollParameterError('PAYROLL_PARAMETER_' + suffix, status, message);
  if (/PAYROLL_PARAMETER_(DRAFT|PREPARE|RULE|AMOUNT|AGREEMENT|LIST|DETAIL|ATTEMPT)_INVALID/.test(error?.message || '')) return new PayrollParameterError('PAYROLL_PARAMETER_INPUT_INVALID', 422, 'Revisá los campos de la propuesta.');
  if (/(ACTION_SESSION_INVALID|TENANT_IAM_SESSION_INVALID)/.test(error?.message || '')) return new PayrollParameterError('PAYROLL_PARAMETER_SESSION_INVALID', 401, 'La sesión operativa ya no es válida.');
  if (String(error?.message)==='TENANT_IAM_SOD_CONFLICT') return new PayrollParameterError('PAYROLL_PARAMETER_PROFILE_CONFLICT', 409, 'El perfil requiere revisar responsabilidades con el administrador. La sesión no está vencida.');
  if (/(CAPABILITY|AUTHORITY)/.test(error?.message || '')) return new PayrollParameterError('PAYROLL_PARAMETER_CAPABILITY_REQUIRED', 403, 'Tu perfil no tiene habilitada esta operación de parámetros salariales.');
  return new PayrollParameterError('PAYROLL_PARAMETER_UNAVAILABLE', 503, 'Parámetros temporalmente no disponibles. No se confirmó la operación.');
}
function assertEnvelope(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !value.flags || ['grhMutation', 'payrollCalculated', 'payrollPosted', 'currentCatalogVerified'].some(k => value.flags[k] !== false) || typeof value.flags.proposalApproved !== 'boolean') fail('PAYROLL_PARAMETER_CONTRACT_DRIFT', 503, 'La respuesta no coincide con el contrato operativo.');
  try { if (value.proposal) verifiedParameterProposal(value.proposal); if (value.proposals) { if (!Array.isArray(value.proposals)) throw Error(); value.proposals.forEach(verifiedParameterProposal); } } catch { fail('PAYROLL_PARAMETER_CONTRACT_DRIFT', 503, 'Los valores recibidos no superaron la verificación.'); }
  if (value.limits && (value.limits.contractVersion !== PARAMETER_CONTRACT || value.limits.sourceSha256 !== PARAMETER_SOURCE_SHA)) fail('PAYROLL_PARAMETER_CONTRACT_DRIFT', 503, 'El catálogo cambió. No se habilita una regla desactualizada.');
  return value;
}
const signatures = {
  bootstrap: ['payroll_parameter_bootstrap_v1', ['jsonb']], list: ['payroll_parameter_list_v1', ['jsonb', 'text', 'integer', 'integer', 'text']], detail: ['payroll_parameter_detail_v1', ['jsonb', 'uuid']], attempt: ['payroll_parameter_attempt_v1', ['jsonb', 'uuid', 'text']],
  prepare: ['payroll_parameter_prepare_v1', ['jsonb', 'uuid', 'jsonb', 'uuid', 'text']], transition: ['payroll_parameter_transition_v1', ['jsonb', 'uuid', 'text', 'integer', 'text', 'text', 'uuid', 'text']],
};
async function call(sql, operation, values) {
  const [name, casts] = signatures[operation];
  try { const result = await sql.query(`SELECT public.${name}(${casts.map((c, i) => `$${i + 1}::${c}`).join(',')}) AS result`, values); return assertEnvelope((Array.isArray(result) ? result : result?.rows)?.[0]?.result); } catch (error) { throw mapError(error); }
}
export async function readPayrollParameters(sql, principal, session, resource, input = {}) {
  const context = JSON.stringify(parameterContext(principal, session));
  if (resource === 'bootstrap') { exact(input, []); return call(sql, 'bootstrap', [context]); }
  if (resource === 'detail') { exact(input, ['id']); return call(sql, 'detail', [context, id(input.id)]); }
  if (resource === 'attempt') { exact(input, ['key', 'command']); if (!['prepare', ...Object.keys(PARAMETER_REASONS)].includes(input.command)) fail('PAYROLL_PARAMETER_COMMAND_INVALID', 400, 'Comando inválido.'); return call(sql, 'attempt', [context, key(input.key), input.command]); }
  if (resource !== 'list') fail('PAYROLL_PARAMETER_RESOURCE_INVALID', 400, 'Consulta inválida.');
  exact(input, ['status', 'page', 'limit', 'period']);
  const { status, period } = input, page = Number(input.page), limit = Number(input.limit);
  if (!['all', 'prepared', 'submitted', 'approved', 'rejected', 'cancelled'].includes(status) || !/^$|^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(period) || !/^[1-9][0-9]*$/.test(String(input.page)) || !/^[1-9][0-9]*$/.test(String(input.limit)) || !Number.isSafeInteger(page) || page > 10000 || limit > 50) fail('PAYROLL_PARAMETER_INPUT_INVALID', 422, 'Filtros inválidos.');
  return call(sql, 'list', [context, status, page, limit, period]);
}
export async function writePayrollParameters(sql, principal, session, command, payload, attemptKey) {
  const context = parameterContext(principal, session), attempt = key(attemptKey);
  try {
    let checked;
    if (command === 'prepare') { exact(payload, ['bindingId', 'draft']); checked = { bindingId: id(payload.bindingId), draft: validateParameterDraft(payload.draft) }; }
    else {
      if (!Object.hasOwn(PARAMETER_REASONS, command)) fail('PAYROLL_PARAMETER_COMMAND_INVALID', 400, 'Comando inválido.');
      exact(payload, ['proposalId', 'expectedVersion', 'reasonCode', 'reasonReference']);
      if (!Number.isSafeInteger(payload.expectedVersion) || payload.expectedVersion < 1 || !PARAMETER_REASONS[command].includes(payload.reasonCode) || !/^ref:[0-9a-f-]{36}$/.test(payload.reasonReference || '') || !V4.test(payload.reasonReference.slice(4))) fail('PAYROLL_PARAMETER_TRANSITION_INVALID', 422, 'La decisión requiere versión, motivo y referencia válidos.');
      checked = { ...payload, proposalId: id(payload.proposalId) };
    }
    const hash = createHash('sha256').update(stableParameterJson({ contractVersion: PARAMETER_CONTRACT, context, command, payload: checked })).digest('hex');
    return command === 'prepare'
      ? call(sql, 'prepare', [JSON.stringify(context), checked.bindingId, JSON.stringify(checked.draft), attempt, hash])
      : call(sql, 'transition', [JSON.stringify(context), checked.proposalId, command, checked.expectedVersion, checked.reasonCode, checked.reasonReference, attempt, hash]);
  } catch (error) { throw mapError(error); }
}
