import {createHash} from 'node:crypto';
import {employeeContext} from './internal-native-employees.js';
import {TIME_CATALOG_VERSION, TIME_CATALOG_KINDS, TIME_CATALOG_STATUSES, TIME_CATALOG_REASONS, TimeCatalogInputError,
  timeCatalogCommand, timeCatalogRecord, timeCatalogMatches, timeCatalogExact, timeCatalogUuid, timeCatalogKey, timeCatalogSha, timeCatalogInteger} from '../assets/time-catalog-contract.js';
import {parseTimeCatalogSqlJson, normalizeTimeCatalogSqlJson, timeCatalogSqlPayload} from './time-catalog-json.js';
export const TIME_CATALOG_MAX_BYTES = 256 * 1024;
export const TIME_CATALOG_READ = 'time.catalog.read';
export const TIME_CATALOG_CAPS = Object.freeze(Object.fromEntries(Object.keys(TIME_CATALOG_REASONS).map(k => [k, ['create_draft', 'update_draft', 'submit'].includes(k) ? 'time.catalog.propose' : 'time.catalog.approve'])));
export class TimeCatalogError extends Error {
  constructor(code, status, message) { super(message); Object.assign(this, {name: 'TimeCatalogError', code: 'TIME_CATALOG_' + code, status}); }
}
export const timeCatalogFail = (code, status, message) => { throw new TimeCatalogError(code, status, message); };
const messages = {
  SESSION_INVALID: [401, 'La sesión cambió o venció. Volvé a ingresar.'],
  FORBIDDEN: [403, 'Tu cuenta no permite esta operación sobre el catálogo de asistencia.'],
  EMPLOYMENT_REQUIRED: [403, 'Se requiere una cuenta vinculada a una persona habilitada.'],
  MAKER_CHECKER_REQUIRED: [403, 'La revisión debe realizarla otra persona autorizada.'],
  SCOPE_CHANGED: [409, 'Cambió la sesión, el ámbito o el vínculo autorizado. Conservá el intento y consultá con el acceso original.'],
  VERSION_CONFLICT: [409, 'La configuración cambió. Consultá su versión actual antes de preparar otro envío.'],
  IDEMPOTENCY_REUSED: [409, 'La clave pertenece a otro contenido. Conservá y reintentá el envío original.'],
  NOT_FOUND: [404, 'No se encontró la configuración dentro de tu acceso.'],
  STATE_INVALID: [409, 'La configuración ya no admite esta operación. Actualizá su detalle.'],
  PERIOD_INVALID: [422, 'La asignación debe quedar dentro de un mismo período laboral y de configuraciones aprobadas vigentes.'],
  OVERLAP: [409, 'La configuración se superpone con otra vigente. Revisá fechas y tramos.'],
  SOURCE_INVALID: [409, 'Falta una fuente aprobada y vigente para esta configuración.'],
  BUSY: [409, 'Hay otra operación en curso. Reintentá el mismo contenido y clave.'],
};
export function timeCatalogError(e) {
  if (e instanceof TimeCatalogError) return e;
  if (e instanceof TimeCatalogInputError) return new TimeCatalogError('INPUT_INVALID', 422, e.message);
  const message = String(e?.code ?? '') + ' ' + String(e?.message ?? '');
  let code;
  if (/ACTION_SESSION_INVALID|NATIVE_EMPLOYEE_SESSION_INVALID|TIME_SOURCE_SESSION_INVALID/.test(message)) code = 'SESSION_INVALID';
  else if (/AUTHORITY_REQUIRED|CAPABILITY_REQUIRED|SOD_CONFLICT|SEPARATION_OF_DUTIES|PROPOSER_INVALID|APPROVER_INVALID/.test(message)) code = 'FORBIDDEN';
  else if (/MAKER_CHECKER/.test(message)) code = 'MAKER_CHECKER_REQUIRED';
  else if (/EMPLOYMENT_REQUIRED|NATIVE_ACTOR_INVALID/.test(message)) code = 'EMPLOYMENT_REQUIRED';
  else if (/BINDING_REQUIRED|BINDING_CHANGED/.test(message)) code = 'SCOPE_CHANGED';
  else if (/TIME_CATALOG_VERSION_CONFLICT/.test(message)) code = 'VERSION_CONFLICT';
  else if (/TIME_CATALOG_IDEMPOTENCY_REUSED/.test(message)) code = 'IDEMPOTENCY_REUSED';
  else if (/TIME_CATALOG_NOT_FOUND/.test(message)) code = 'NOT_FOUND';
  else if (/TIME_CATALOG_.*OVERLAP/.test(message)) code = 'OVERLAP';
  else if (/TIME_CATALOG_(?:NATIVE_PERIOD_INVALID|ASSIGNMENT_.*(?:INVALID|MISSING|RANGE))/.test(message)) code = 'PERIOD_INVALID';
  else if (/TIME_CATALOG_.*SOURCE_/.test(message)) code = 'SOURCE_INVALID';
  else if (/TIME_CATALOG_(?:STATE|TRANSITION|DRAFT|IMMUTABLE|IDENTITY_IMMUTABLE)/.test(message)) code = 'STATE_INVALID';
  else if (/SESSION_BUSY|_BUSY|55P03|40P01|40001/.test(message)) code = 'BUSY';
  else if (/NATIVE_EMPLOYMENT_CATALOG_(?:INPUT_INVALID|LIMIT|UNAVAILABLE)/.test(message)) return new TimeCatalogError('INPUT_INVALID', e.status >= 400 && e.status <= 503 ? e.status : 400, 'No se pudo leer el formulario completo sin ambigüedades.');
  if (code) return new TimeCatalogError(code, ...messages[code]);
  return new TimeCatalogError('UNAVAILABLE', 503, 'No se confirmó la operación. Conservá el contenido y la clave antes de reintentar.');
}
export function timeCatalogStable(v) {
  return Array.isArray(v) ? '[' + v.map(timeCatalogStable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + timeCatalogStable(v[k])).join(',') + '}' : JSON.stringify(v);
}
export const timeCatalogHash = v => createHash('sha256').update(timeCatalogStable(v)).digest('hex');
const flags = ['catalogReady', 'attendanceEvaluationReady', 'punchesLoaded', 'minutesCalculated', 'payrollPosted', 'grhMutation'];
const check = condition => { if (!condition) timeCatalogFail('RESPONSE_INVALID', 503, 'La respuesta del catálogo no pudo verificarse. Conservá el mismo intento.'); };
const args = ctx => [ctx.actorEmail, ctx.actorSessionId, ctx.actorSessionVersion, ctx.releaseSha, ctx.tenantId, ctx.membershipId];
const contextTypes = '$1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid';
export const TIME_CATALOG_BOOTSTRAP_SQL = `public.time_catalog_bootstrap_v1(${contextTypes})`;
export const TIME_CATALOG_COMMAND_SQL = `WITH checked AS MATERIALIZED (SELECT ${TIME_CATALOG_BOOTSTRAP_SQL} AS bootstrap)
SELECT public.time_catalog_apply_command_v1(${contextTypes},$7::text,$8::text,$9::uuid,$10::integer,$11::uuid,$12::text,$13::jsonb,$14::text,$15::text)::text AS result
FROM checked WHERE checked.bootstrap#>>'{principal,scopeVersion}'=$16::text`;
function principal(p, ctx) {
  check(timeCatalogExact(p, ['roleKey', 'authorityVersion', 'capabilities', 'areaScopes', 'scopeVersion'])
    && typeof p.roleKey === 'string' && /^[A-Z][A-Z0-9_]{1,95}$/.test(p.roleKey)
    && timeCatalogInteger(p.authorityVersion, 1, 2147483647) && timeCatalogSha(p.scopeVersion)
    && Array.isArray(p.areaScopes) && p.areaScopes.length === 0 && Array.isArray(p.capabilities)
    && new Set(p.capabilities).size === p.capabilities.length && p.capabilities.includes(TIME_CATALOG_READ)
    && p.capabilities.every(c => [TIME_CATALOG_READ, 'time.catalog.propose', 'time.catalog.approve', 'time.catalog.audit.read'].includes(c)));
  return {scopeVersion: timeCatalogHash(ctx) + '.' + p.scopeVersion, permissions: {
    canPropose: p.capabilities.includes('time.catalog.propose'), canApprove: p.capabilities.includes('time.catalog.approve'), canAudit: p.capabilities.includes('time.catalog.audit.read'),
  }};
}
function decode(rows) {
  const values = Array.isArray(rows) ? rows : rows?.rows;
  check(Array.isArray(values) && values.length === 1);
  try { return normalizeTimeCatalogSqlJson(parseTimeCatalogSqlJson(values[0]?.result)); }
  catch (e) { if (e instanceof TimeCatalogError) throw e; timeCatalogFail('RESPONSE_INVALID', 503, 'La respuesta perdió sus valores exactos o contiene datos no admitidos. Conservá el intento.'); }
}
function record(r) { try { return timeCatalogRecord(r); } catch { timeCatalogFail('RESPONSE_INVALID', 503, 'La configuración recibida no pudo verificarse.'); } }
function pagination(p, input, records) {
  check(timeCatalogExact(p, ['limit', 'offset', 'total', 'hasMore']) && p.limit === input.limit && p.offset === input.offset
    && timeCatalogInteger(p.total, 0, 2147483647) && p.hasMore === (p.offset + p.limit < p.total)
    && records.length === Math.max(0, Math.min(p.limit, p.total - p.offset)));
  return p;
}
export function timeCatalogQuery(resource, input) {
  if (resource === 'bootstrap' && timeCatalogExact(input, [])) return input;
  if (resource === 'detail' && timeCatalogExact(input, ['id']) && timeCatalogUuid(input.id)) return input;
  if (resource === 'list' && timeCatalogExact(input, ['kind', 'status', 'limit', 'offset'])
    && (input.kind === null || TIME_CATALOG_KINDS.includes(input.kind)) && (input.status === null || TIME_CATALOG_STATUSES.includes(input.status))
    && timeCatalogInteger(input.limit, 1, 100) && timeCatalogInteger(input.offset, 0, 100000)) return input;
  timeCatalogFail('QUERY_INVALID', 400, 'La consulta requiere filtros y paginación válidos.');
}
export async function timeCatalogRead(sql, identity, session, resource, input = {}) {
  try {
    const ctx = employeeContext(identity, session); timeCatalogQuery(resource, input);
    const extra = resource === 'list' ? [input.kind, input.status, input.limit, input.offset] : resource === 'detail' ? [input.id] : [];
    const call = resource === 'bootstrap' ? TIME_CATALOG_BOOTSTRAP_SQL : resource === 'list'
      ? `public.time_catalog_list_v1(${contextTypes},$7::text,$8::text,$9::integer,$10::integer)` : `public.time_catalog_detail_v1(${contextTypes},$7::uuid)`;
    const r = decode(await sql.query(`SELECT (${call})::text AS result`, [...args(ctx), ...extra]));
    const projected = principal(r.principal, ctx), base = {version: TIME_CATALOG_VERSION, ...projected};
    if (resource === 'bootstrap') {
      check(timeCatalogExact(r, ['principal', 'summary', ...flags]) && flags.every(f => r[f] === false)
        && timeCatalogExact(r.summary, ['calendar', 'shift', 'ruleProfile', 'assignment', 'submitted']) && Object.values(r.summary).every(n => timeCatalogInteger(n, 0, 2147483647)));
      return {...base, summary: r.summary, ...Object.fromEntries(flags.map(f => [f, false]))};
    }
    if (resource === 'list') {
      check(timeCatalogExact(r, ['principal', 'records', 'page']) && Array.isArray(r.records) && r.records.length <= input.limit && new Set(r.records.map(v => v.id)).size === r.records.length);
      r.records.forEach(v => { record(v); check((input.kind === null || v.kind === input.kind) && (input.status === null || v.status === input.status)); });
      return {...base, records: r.records, page: pagination(r.page, input, r.records)};
    }
    check(timeCatalogExact(r, ['principal', 'record', 'timeline', 'auditAvailable', 'timelineLimit']) && r.auditAvailable === projected.permissions.canAudit
      && r.timelineLimit === 100 && Array.isArray(r.timeline) && r.timeline.length <= 100 && (r.auditAvailable || r.timeline.length === 0));
    record(r.record); check(r.record.id.toLowerCase() === input.id.toLowerCase());
    for (const e of r.timeline) check(timeCatalogExact(e, ['command', 'expectedVersion', 'resultingVersion', 'reasonCode', 'occurredAt'])
      && Object.hasOwn(TIME_CATALOG_REASONS, e.command) && TIME_CATALOG_REASONS[e.command].includes(e.reasonCode)
      && timeCatalogInteger(e.expectedVersion, 0, 2147483646) && e.resultingVersion === e.expectedVersion + 1 && e.resultingVersion <= r.record.version
      && typeof e.occurredAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(e.occurredAt) && Number.isFinite(Date.parse(e.occurredAt)));
    return {...base, record: r.record, timeline: r.timeline, auditAvailable: r.auditAvailable, timelineLimit: 100, timelineMayBeIncomplete: r.auditAvailable && r.timeline.length === 100};
  } catch (e) { throw timeCatalogError(e); }
}
export async function timeCatalogWrite(sql, identity, session, input, key) {
  try {
    const ctx = employeeContext(identity, session), body = timeCatalogCommand(input);
    if (!timeCatalogKey(key)) timeCatalogFail('KEY_REQUIRED', 428, 'El envío requiere una clave de intento válida.');
    if (body.scopeVersion.split('.')[0] !== timeCatalogHash(ctx)) timeCatalogFail('SCOPE_CHANGED', ...messages.SCOPE_CHANGED);
    const hash = timeCatalogHash({version: TIME_CATALOG_VERSION, context: ctx, body});
    // MATERIALIZED bootstrap retains the binding/session/actor locks for this
    // single SQL statement. A changed scope yields no row and no command call.
    const values = [...args(ctx), body.command, body.kind, body.id, body.expectedVersion, key, hash, timeCatalogSqlPayload(body.payload), body.reasonCode,
      createHash('sha256').update(body.reason).digest('hex'), body.scopeVersion.split('.')[1]];
    const rows = await sql.query(TIME_CATALOG_COMMAND_SQL, values);
    if ((Array.isArray(rows) ? rows : rows?.rows)?.length === 0) timeCatalogFail('SCOPE_CHANGED', ...messages.SCOPE_CHANGED);
    const r = decode(rows);
    check(timeCatalogExact(r, ['data', 'replayed', 'requestSha256', 'attemptKey', ...flags], ['historical']) && flags.every(f => r[f] === false)
      && typeof r.replayed === 'boolean' && (Object.hasOwn(r, 'historical') ? r.replayed && typeof r.historical === 'boolean' : !r.replayed)
      && r.requestSha256 === hash && r.attemptKey?.toLowerCase() === key.toLowerCase());
    try { timeCatalogMatches(r.data, body); } catch { timeCatalogFail('RESPONSE_INVALID', 503, 'La confirmación no corresponde al envío. Conservá su contenido y clave.'); }
    return {version: TIME_CATALOG_VERSION, scopeVersion: body.scopeVersion, ...r};
  } catch (e) { throw timeCatalogError(e); }
}
