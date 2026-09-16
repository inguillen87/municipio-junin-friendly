import { createHash } from 'node:crypto';
import { parameterContext, stableParameterJson, PayrollParameterError } from './internal-payroll-parameters.js';
import { CATALOG_CONTRACT, catalogPeriod, catalogRevision, verifyCatalogResponse } from './payroll-catalog-contract.js';
export { PayrollParameterError };
export const PARAMETER_MAX_BODY_BYTES = 4096;
const fail = (code, status, message) => { throw new PayrollParameterError('PAYROLL_CATALOG_' + code, status, message); };
const exact = (o, keys) => { if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).sort().join('|') !== [...keys].sort().join('|')) fail('INPUT_INVALID', 422, 'Campos no admitidos.'); };
function id(v, v4 = false) {
  if (typeof v !== 'string' || !(v4 ? /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i : /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i).test(v)) fail('INPUT_INVALID', 422, 'Identificador no válido.');
  return v.toLowerCase();
}
function integer(v, min = 0) { if (!/^(0|[1-9][0-9]*)$/.test(String(v)) || !catalogRevision(Number(v)) || Number(v) < min) fail('INPUT_INVALID', 422, 'Versión no válida.'); return Number(v); }
const messages = {
  VERSION_CONFLICT: [409, 'El catálogo cambió. Volvé a revisar el impacto antes de activar.'],
  PROPOSAL_CHANGED: [409, 'La propuesta cambió. Abrí su versión actual.'],
  ALREADY_ACTIVATED: [409, 'La propuesta ya fue activada. Consultá el catálogo.'],
  APPROVAL_REQUIRED: [409, 'La propuesta necesita aprobación antes de activarse.'],
  INDEPENDENT_REVIEWER_REQUIRED: [403, 'Quien preparó la propuesta no puede activarla.'],
  EMPLOYMENT_REQUIRED: [403, 'La cuenta necesita un vínculo laboral verificado.'],
  PAST_PERIOD: [422, 'No se admiten activaciones retroactivas de meses anteriores.'],
  NOT_FOUND: [404, 'No se encontró la propuesta en este municipio.'],
  ATTEMPT_NOT_FOUND: [404, 'Todavía no hay una activación confirmada para este intento.'],
  ATTEMPT_CONFLICT: [409, 'El intento pertenece a otra operación o sesión. Consultá el catálogo antes de continuar.'],
  REVISION_INVALID: [422, 'Esa revisión del catálogo no existe.'],
  INPUT_INVALID: [422, 'Revisá el período y la versión indicados.'],
  SOURCE_INVALID: [409, 'Los valores aprobados no coinciden con la definición de origen.'],
};
async function call(sql, name, types, values) {
  let rows;
  try { rows = await sql.query(`SELECT public.${name}(${types.map((t, i) => `$${i+1}::${t}`).join(',')}) AS result`, values); }
  catch (e) {
    const msg = String(e?.message || '');
    for (const [code, [status, text]] of Object.entries(messages)) if (msg.includes('PAYROLL_CATALOG_' + code)) fail(code, status, text);
    if (/SESSION_INVALID|SESSION_EXPIRED/.test(msg)) fail('SESSION_INVALID', 401, 'La sesión ya no es válida.');
    if (/CAPABILITY|AUTHORITY|SOD_CONFLICT/.test(msg)) fail('ACCESS_REQUIRED', 403, 'Tu perfil no permite esta operación.');
    if (/EMPLOYMENT_REQUIRED/.test(msg)) fail('EMPLOYMENT_REQUIRED', 403, 'Falta el vínculo laboral verificado.');
    fail('UNAVAILABLE', 503, 'No hay confirmación del catálogo. Conservá el intento y consultá su estado.');
  }
  try {
    const answer=verifyCatalogResponse((Array.isArray(rows) ? rows : rows?.rows)?.[0]?.result);
    if ((/activate|attempt/.test(name) && !answer.activation) || (name.includes('preview') && !answer.preview) || (name.includes('catalog') && (!answer.catalog || answer.currentRevision===undefined))) throw Error('Wrong operation response');
    return answer;
  }
  catch { fail('RESPONSE_INVALID', 503, 'No se pudo verificar la respuesta del catálogo.'); }
}
export async function readPayrollCatalog(sql, principal, session, resource, input = {}) {
  const context = JSON.stringify(parameterContext(principal, session));
  if (resource === 'catalog') {
    exact(input, ['period','revision']); if (!catalogPeriod(input.period)) fail('INPUT_INVALID', 422, 'Indicá un mes válido.');
    const revision = input.revision === '' ? null : integer(input.revision);
    return call(sql, 'payroll_auxiliary_catalog_v1', ['jsonb','text','integer'], [context,input.period,revision]);
  }
  if (resource === 'preview') {
    exact(input, ['id','version']); return call(sql, 'payroll_auxiliary_preview_v1', ['jsonb','uuid','integer'], [context,id(input.id),integer(input.version,1)]);
  }
  if (resource === 'attempt') {
    exact(input, ['key']); return call(sql, 'payroll_auxiliary_attempt_v1', ['jsonb','uuid'], [context,id(input.key,true)]);
  }
  fail('INPUT_INVALID', 400, 'Consulta no admitida.');
}
export async function writePayrollCatalog(sql, principal, session, command, payload, attemptKey) {
  const context = parameterContext(principal, session), key = id(attemptKey,true);
  if (command !== 'activate') fail('INPUT_INVALID', 400, 'Operación no admitida.');
  exact(payload, ['proposalId','proposalVersion','catalogRevision']);
  if (typeof payload.proposalVersion !== 'number' || typeof payload.catalogRevision !== 'number') fail('INPUT_INVALID', 422, 'La operación requiere versiones numéricas.');
  const p = { proposalId:id(payload.proposalId), proposalVersion:integer(payload.proposalVersion,1), catalogRevision:integer(payload.catalogRevision) };
  const hash = createHash('sha256').update(stableParameterJson({contractVersion:CATALOG_CONTRACT,context,command,payload:p})).digest('hex');
  return call(sql, 'payroll_auxiliary_activate_v1', ['jsonb','uuid','integer','integer','uuid','text'], [JSON.stringify(context),p.proposalId,p.proposalVersion,p.catalogRevision,key,hash]);
}
