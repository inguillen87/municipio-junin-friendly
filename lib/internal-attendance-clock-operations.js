import { AttendanceGatewayError } from './internal-attendance-gateway.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOP = new Set(['version','generatedAt','timezone','sites','site','filters','summary','collection','records','daily','hourly','observations','nominalReadAllowed','pagination']);
const PRIVATE_KEY = /^(?:dni|cuil|password|secret|token|identity_hmac|identityHmac|identityHash|raw_attendance|rawAttendance|rawPayload|sourceUserId|userIdFromRecord)$/i;
const SQL = 'SELECT public.attendance_clock_operations_v1($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::text,$8::date,$9::date,$10::integer,$11::integer) AS result';

function fail(code, status, message) { throw new AttendanceGatewayError(code, status, message); }
function integer(value, fallback, max) {
  const text = String(value ?? fallback);
  if (!/^[1-9][0-9]*$/.test(text) || !Number.isSafeInteger(Number(text)) || Number(text) > max) {
    fail('ATTENDANCE_OPERATIONS_QUERY_INVALID',400,'Paginación inválida');
  }
  return Number(text);
}
function date(value) {
  if (value == null || value === '') return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text+'T00:00:00Z'))
      || new Date(text+'T00:00:00Z').toISOString().slice(0,10) !== text) {
    fail('ATTENDANCE_OPERATIONS_QUERY_INVALID',400,'Fecha inválida');
  }
  return text;
}
export function normalizeClockOperationsQuery(options = {}) {
  const site = String(options.site ?? 'pm-10').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,95}$/.test(site)) fail('ATTENDANCE_OPERATIONS_QUERY_INVALID',400,'Punto inválido');
  const from = date(options.from), to = date(options.to);
  if (Boolean(from) !== Boolean(to) || (from && (to < from || (Date.parse(to)-Date.parse(from))/86400000 > 92))) {
    fail('ATTENDANCE_OPERATIONS_QUERY_INVALID',400,'Seleccioná ambas fechas y un intervalo de hasta 93 días');
  }
  return { site, from, to, page: integer(options.page,1,10000), pageSize: integer(options.pageSize,50,100) };
}
export function assertClockOperationsResponse(result, query) {
  const drift = () => fail('ATTENDANCE_CONTRACT_DRIFT',503,'La respuesta del reloj no cumple el contrato operativo');
  if (!result || typeof result !== 'object' || Array.isArray(result)
      || result.version !== 'clock-operations.v1' || Object.keys(result).some(k => !TOP.has(k))) drift();
  if (Buffer.byteLength(JSON.stringify(result),'utf8') > 512*1024) drift();
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key,child] of Object.entries(value)) { if (PRIVATE_KEY.test(key)) drift(); inspect(child); }
  };
  inspect(result);
  for (const name of ['records','sites','daily','hourly','observations']) if (!Array.isArray(result[name])) drift();
  if (result.records.length > query.pageSize || result.daily.length > 93 || result.hourly.length > 24 || result.observations.length > 100) drift();
  if (!result.collection || !['no_data','import_incomplete','operator_snapshot'].includes(result.collection.status)
      || result.collection.periodCoverageCertified !== false || result.collection.automaticCollectorVerified === true) drift();
  if (result.site && result.site.key !== query.site) drift();
  if (result.site && (!result.filters || (query.from && (result.filters.from !== query.from || result.filters.to !== query.to)))) drift();
  if (!result.pagination || result.pagination.pageSize !== query.pageSize
      || (result.site && result.pagination.page !== query.page)) drift();
  for (const key of ['marks','people','mappedMarks']) if (!Number.isSafeInteger(result.summary?.[key]) || result.summary[key] < 0) drift();
  for (const record of result.records) {
    if (!Number.isSafeInteger(record.ordinal) || record.ordinal < 1
        || typeof record.personLabel !== 'string' || record.personLabel.length > 500
        || !Number.isFinite(Date.parse(record.occurredAt))
        || record.method !== 'unknown' || record.direction !== 'unknown') drift();
    if (result.nominalReadAllowed !== true && (record.legajo !== null || !/^Persona [A-F0-9]{8}$/.test(record.personLabel))) drift();
  }
  return result;
}
export async function getAttendanceClockOperations(sql, principal, options, session) {
  const query = normalizeClockOperationsQuery(options);
  const tenant = principal?.tenant;
  const email = String(principal?.user?.email || '').trim().toLowerCase();
  if (!email || tenant?.source !== 'membership' || !UUID.test(tenant?.id || '')
      || !UUID.test(tenant?.membershipId || '') || !UUID.test(session?.id || '')
      || email !== String(session?.email || '').trim().toLowerCase()
      || !Number.isSafeInteger(session?.version) || session.version < 1
      || !/^[a-f0-9]{40}$/.test(session?.releaseSha || '')
      || session.releaseSha !== tenant.certifiedReleaseSha) {
    fail('ATTENDANCE_SESSION_INVALID',401,'La sesión operativa ya no es válida');
  }
  try {
    const response = await sql.query(SQL,[email,session.id,session.version,session.releaseSha,tenant.id,tenant.membershipId,query.site,query.from,query.to,query.page,query.pageSize]);
    const rows = Array.isArray(response) ? response : response?.rows;
    return assertClockOperationsResponse(rows?.[0]?.result,query);
  } catch (error) {
    if (error instanceof AttendanceGatewayError) throw error;
    const message = String(error?.message || '');
    if (/ATTENDANCE_SESSION_INVALID|TIME_SOURCE_SESSION_INVALID/.test(message)) fail('ATTENDANCE_SESSION_INVALID',401,'La sesión operativa venció');
    if (/SESSION_BUSY/.test(message)) fail('ATTENDANCE_SESSION_BUSY',409,'El acceso se está actualizando; reintentá');
    if (/CAPABILITY_REQUIRED|AUTHORITY_REQUIRED|EMPLOYMENT_REQUIRED/.test(message)) fail('ATTENDANCE_CAPABILITY_REQUIRED',403,'Tu perfil no permite consultar estas marcaciones');
    if (/QUERY_INVALID/.test(message)) fail('ATTENDANCE_OPERATIONS_QUERY_INVALID',400,'Filtros inválidos');
    if (/RELEASE_NOT_CERTIFIED|BINDING_REQUIRED/.test(message)) fail('ATTENDANCE_RELEASE_NOT_CERTIFIED',503,'El contrato municipal no está habilitado para esta consulta');
    if (['42883','42P01'].includes(error?.code)) fail('ATTENDANCE_OPERATIONS_NOT_READY',503,'La base de este entorno todavía no tiene la actualización de relojes');
    throw error;
  }
}
