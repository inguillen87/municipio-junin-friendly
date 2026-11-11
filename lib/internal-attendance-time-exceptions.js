// Excepciones horarias por legajo (migración 221). Personal registra franquicias documentadas
// (entrada diferida, salida transitoria, salida anticipada o exención) y el cálculo de relojes
// excluye esas ventanas de tardanzas y ausencias. Capa delgada: valida igual que SQL, llama a las
// funciones gobernadas y verifica el contrato de respuesta. Sin escritura de nómina ni de relojes.
import { AttendanceGatewayError } from './internal-attendance-gateway.js';

export const TIME_EXCEPTION_VERSION = 'attendance-time-exceptions.v1';
export const TIME_EXCEPTION_KINDS = Object.freeze(['entrada_diferida', 'salida_transitoria', 'salida_anticipada', 'exento']);
export const TIME_EXCEPTION_CATEGORIES = Object.freeze(['cuidado_familiar', 'salud', 'lactancia', 'estudio', 'gremial', 'traslado', 'otro']);
export const TIME_EXCEPTION_ACTIONS = Object.freeze(['time-exception.register', 'time-exception.revoke']);
export const TIME_EXCEPTION_MAX_RANGE_DAYS = 92;

const UUID_V4 = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const UUID_ANY = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SESSION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGAJO = /^[1-9][0-9]{0,19}$/;
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// PostgreSQL [[:cntrl:]] (C0, DEL and C1) plus markup delimiters.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f<>]/;
const ITEM_FIELDS = Object.freeze(['id', 'legajo', 'name', 'kind', 'weekdays', 'from', 'to', 'validFrom', 'validTo', 'category',
  'note', 'documentReference', 'registeredAt', 'registeredBy', 'revokedAt', 'revokedBy', 'revokeReason']);
const REGISTER_KEYS = Object.freeze(['action', 'category', 'documentReference', 'from', 'kind', 'legajo', 'note', 'requestKey',
  'to', 'validFrom', 'validTo', 'weekdays']);
const REVOKE_KEYS = Object.freeze(['action', 'id', 'reason', 'requestKey']);

const ERRORS = Object.freeze([
  ['ATTENDANCE_TIME_EXCEPTION_INPUT_INVALID', 422, 'Revisá los datos de la excepción horaria'],
  ['ATTENDANCE_TIME_EXCEPTION_QUERY_INVALID', 400, 'La consulta de excepciones horarias es inválida'],
  ['ATTENDANCE_TIME_EXCEPTION_KEY_REUSED', 409, 'La clave de la solicitud ya se usó con otros datos'],
  ['ATTENDANCE_TIME_EXCEPTION_DUPLICATE', 409, 'Ya existe una excepción vigente idéntica para ese legajo'],
  ['ATTENDANCE_TIME_EXCEPTION_LEGAJO_NOT_FOUND', 404, 'El legajo no existe en la fuente municipal certificada'],
  ['ATTENDANCE_TIME_EXCEPTION_LEGAJO_AMBIGUOUS', 409, 'El legajo coincide con más de un vínculo; revisalo en Personas'],
  ['ATTENDANCE_TIME_EXCEPTION_NOT_FOUND', 404, 'La excepción horaria no existe'],
  ['ATTENDANCE_TIME_EXCEPTION_ALREADY_REVOKED', 409, 'La excepción horaria ya estaba revocada'],
  ['ATTENDANCE_TIME_EXCEPTION_BUSY', 409, 'Se está registrando otra excepción; reintentá en un momento'],
  ['ATTENDANCE_TIME_EXCEPTION_TOO_MANY', 413, 'La consulta supera 2.000 excepciones; filtrá por legajo o fechas'],
  ['ATTENDANCE_TIME_EXCEPTION_IMMUTABLE', 409, 'Las excepciones registradas no se modifican: revocá y registrá una nueva'],
  ['ATTENDANCE_TIME_EXCEPTION_TARGET_INVALID', 409, 'La revocación no corresponde a una excepción registrada'],
  ['ATTENDANCE_TIME_EXCEPTION_PREREQUISITE', 503, 'El registro de excepciones horarias todavía no está instalado'],
  ['ATTENDANCE_CAPABILITY_REQUIRED', 403, 'No posee la capacidad requerida'],
  ['ATTENDANCE_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa'],
  ['TENANT_IAM_SOD_CONFLICT', 409, 'La membresía combina responsabilidades incompatibles'],
  ['ATTENDANCE_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
  ['ATTENDANCE_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
  ['ATTENDANCE_RELEASE_NOT_CERTIFIED', 503, 'El contrato de datos activo no está certificado'],
  ['ATTENDANCE_BINDING_REQUIRED', 503, 'El binding municipal certificado no está disponible'],
]);

function fail(code, status, message) {
  throw new AttendanceGatewayError(code, status, message);
}

const invalidInput = () => fail(...ERRORS[0]);
const invalidQuery = () => fail(...ERRORS[1]);
const drift = (detail) => fail('ATTENDANCE_CONTRACT_DRIFT', 503, `Excepciones horarias fuera de contrato: ${detail}`);

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function isValidDate(value) {
  return typeof value === 'string' && DATE.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function lineText(value, min, max) {
  return typeof value === 'string' && value === value.trim() && [...value].length >= min && [...value].length <= max
    && !UNSAFE_TEXT.test(value);
}

function normalizedLegajo(value) {
  if (typeof value !== 'string' || !/^[0-9]{1,20}$/.test(value)) return null;
  const trimmed = value.replace(/^0+/, '');
  return LEGAJO.test(trimmed) ? trimmed : null;
}

function dayDistance(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** GET query: legajo (digits, leading zeros ignored) and an optional closed range of at most 92 days. */
export function parseTimeExceptionQuery({ legajo, from, to } = {}) {
  const out = { legajo: null, from: null, to: null };
  if (legajo !== undefined && legajo !== '') {
    out.legajo = normalizedLegajo(legajo);
    if (!out.legajo) invalidQuery();
  }
  const hasFrom = from !== undefined && from !== '', hasTo = to !== undefined && to !== '';
  if (hasFrom !== hasTo) invalidQuery();
  if (hasFrom) {
    if (!isValidDate(from) || !isValidDate(to) || to < from || dayDistance(from, to) > TIME_EXCEPTION_MAX_RANGE_DAYS) invalidQuery();
    out.from = from; out.to = to;
  }
  return Object.freeze(out);
}

function normalizedWeekdays(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7
      || value.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) return null;
  return [...new Set(value)].sort((a, b) => a - b);
}

function optionalText(value, min, max) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return null;
  return lineText(text, min, max) ? text : undefined;
}

/** Register body → the exact jsonb the SQL function accepts (action removed, values normalized). */
export function normalizeTimeExceptionRegister(body) {
  if (!exactKeys(body, REGISTER_KEYS) || body.action !== 'time-exception.register') invalidInput();
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.toLowerCase() : '';
  const legajo = normalizedLegajo(body.legajo);
  const weekdays = normalizedWeekdays(body.weekdays);
  const note = optionalText(body.note, 1, 300);
  const documentReference = typeof body.documentReference === 'string' ? body.documentReference.trim() : '';
  if (!UUID_V4.test(requestKey) || !legajo || !TIME_EXCEPTION_KINDS.includes(body.kind) || !weekdays
      || !TIME_EXCEPTION_CATEGORIES.includes(body.category) || note === undefined || !lineText(documentReference, 3, 160)
      || !isValidDate(body.validFrom) || !(body.validTo === null || isValidDate(body.validTo))) invalidInput();
  if (body.validTo !== null && body.validTo < body.validFrom) invalidInput();
  const exempt = body.kind === 'exento';
  if (exempt ? body.from !== null || body.to !== null
    : typeof body.from !== 'string' || typeof body.to !== 'string' || !HHMM.test(body.from) || !HHMM.test(body.to)
      || body.from >= body.to) invalidInput();
  return Object.freeze({
    requestKey, legajo, kind: body.kind, weekdays, from: exempt ? null : body.from, to: exempt ? null : body.to,
    validFrom: body.validFrom, validTo: body.validTo, category: body.category, note, documentReference,
  });
}

export function normalizeTimeExceptionRevoke(body) {
  if (!exactKeys(body, REVOKE_KEYS) || body.action !== 'time-exception.revoke') invalidInput();
  const requestKey = typeof body.requestKey === 'string' ? body.requestKey.toLowerCase() : '';
  const id = typeof body.id === 'string' ? body.id.toLowerCase() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!UUID_V4.test(requestKey) || !UUID_ANY.test(id) || !lineText(reason, 3, 160)) invalidInput();
  return Object.freeze({ requestKey, id, reason });
}

function identityCoordinates(identityPrincipal, session) {
  const email = String(identityPrincipal?.user?.email || '').trim().toLowerCase();
  const tenantId = String(identityPrincipal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(identityPrincipal?.tenant?.membershipId || '').trim().toLowerCase();
  const sessionId = String(session?.id || '').trim().toLowerCase();
  const sessionVersion = Number(session?.version);
  const releaseSha = String(session?.releaseSha || '').trim().toLowerCase();
  if (!email || identityPrincipal?.tenant?.source !== 'membership'
      || !SESSION_UUID.test(tenantId) || !SESSION_UUID.test(membershipId) || !SESSION_UUID.test(sessionId)
      || !Number.isSafeInteger(sessionVersion) || sessionVersion < 1
      || !/^[a-f0-9]{40}$/.test(releaseSha)
      || String(session?.email || '').trim().toLowerCase() !== email) {
    fail('ATTENDANCE_SESSION_INVALID', 401, 'La sesión operativa ya no es válida');
  }
  return Object.freeze({ email, tenantId, membershipId, sessionId, sessionVersion, releaseSha });
}

function mappedSqlError(error) {
  if (error instanceof AttendanceGatewayError) return error;
  // 42883: the governed functions are not installed yet (migration 221 pending).
  if (error?.code === '42883' && /attendance_time_exception_/.test(String(error?.message || ''))) {
    return new AttendanceGatewayError('ATTENDANCE_TIME_EXCEPTIONS_NOT_INSTALLED', 503,
      'El registro de excepciones horarias todavía no está instalado');
  }
  const text = String(error?.message || '').trim();
  const match = ERRORS.find(([code]) => text === code) ?? ERRORS.find(([code]) => text.includes(code));
  return match ? new AttendanceGatewayError(...match) : error;
}

async function call(sql, statement, values) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  let result;
  try {
    result = await sql.query(statement, values);
  } catch (error) {
    throw mappedSqlError(error);
  }
  const rows = Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
  const envelope = rows[0]?.result;
  if (rows.length !== 1 || !envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    fail('ATTENDANCE_UNAVAILABLE', 503, 'Gateway de asistencia no disponible');
  }
  return envelope;
}

const COORDINATE_CASTS = '$1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid';
const coordinateValues = (c) => [c.email, c.sessionId, c.sessionVersion, c.releaseSha, c.tenantId, c.membershipId];

export const TIME_EXCEPTION_SQL = Object.freeze({
  list: `SELECT public.attendance_time_exception_list_v1(${COORDINATE_CASTS},$7,$8::date,$9::date) AS result`,
  register: `SELECT public.attendance_time_exception_register_v1(${COORDINATE_CASTS},$7::jsonb) AS result`,
  revoke: `SELECT public.attendance_time_exception_revoke_v1(${COORDINATE_CASTS},$7::jsonb) AS result`,
});

function nullableIso(value) {
  return value === null || (typeof value === 'string' && ISO.test(value) && Number.isFinite(Date.parse(value)));
}

function nullableActor(value) {
  return value === null || (typeof value === 'string' && value.length >= 3 && value.length <= 320 && value === value.toLowerCase());
}

/** Strict public item contract; anything else is treated as drift and never reaches the browser. */
export function assertTimeExceptionItem(item, path = 'item') {
  if (!exactKeys(item, ITEM_FIELDS)) drift(`${path} con campos inesperados`);
  const exempt = item.kind === 'exento';
  const days = item.weekdays;
  const ok = UUID_ANY.test(item.id) && LEGAJO.test(item.legajo)
    && typeof item.name === 'string' && item.name.length >= 1 && item.name.length <= 500
    && TIME_EXCEPTION_KINDS.includes(item.kind)
    && Array.isArray(days) && days.length >= 1 && days.length <= 7
    && days.every((day, index) => Number.isInteger(day) && day >= 1 && day <= 7 && (index === 0 || day > days[index - 1]))
    && (exempt ? item.from === null && item.to === null
      : typeof item.from === 'string' && typeof item.to === 'string' && HHMM.test(item.from) && HHMM.test(item.to) && item.from < item.to)
    && isValidDate(item.validFrom) && (item.validTo === null || (isValidDate(item.validTo) && item.validTo >= item.validFrom))
    && TIME_EXCEPTION_CATEGORIES.includes(item.category)
    && (item.note === null || lineText(item.note, 1, 300))
    && lineText(item.documentReference, 3, 160)
    && nullableIso(item.registeredAt) && item.registeredAt !== null && nullableActor(item.registeredBy) && item.registeredBy !== null
    && nullableIso(item.revokedAt) && nullableActor(item.revokedBy)
    && (item.revokeReason === null || lineText(item.revokeReason, 3, 160))
    && (item.revokedAt === null) === (item.revokedBy === null) && (item.revokedAt === null) === (item.revokeReason === null);
  if (!ok) drift(path);
  return item;
}

export async function listAttendanceTimeExceptions(sql, identityPrincipal, query, session) {
  const q = parseTimeExceptionQuery(query);
  const coordinates = identityCoordinates(identityPrincipal, session);
  const envelope = await call(sql, TIME_EXCEPTION_SQL.list, [...coordinateValues(coordinates), q.legajo, q.from, q.to]);
  if (!exactKeys(envelope, ['canManage', 'items', 'version']) || envelope.version !== TIME_EXCEPTION_VERSION
      || typeof envelope.canManage !== 'boolean' || !Array.isArray(envelope.items) || envelope.items.length > 2000) {
    drift('listado');
  }
  const ids = new Set();
  envelope.items.forEach((item, index) => {
    assertTimeExceptionItem(item, `items[${index}]`);
    if (ids.has(item.id) || (q.legajo && item.legajo !== q.legajo)
        || (q.from && (item.validFrom > q.to || (item.validTo !== null && item.validTo < q.from)))) drift(`items[${index}] fuera del filtro`);
    ids.add(item.id);
  });
  return { version: TIME_EXCEPTION_VERSION, canManage: envelope.canManage, items: envelope.items };
}

/** POST time-exception.register / time-exception.revoke. Returns {item, replayed}. */
export async function applyAttendanceTimeException(sql, identityPrincipal, session, body) {
  const action = body?.action;
  if (!TIME_EXCEPTION_ACTIONS.includes(action)) invalidInput();
  const revoke = action === 'time-exception.revoke';
  const payload = revoke ? normalizeTimeExceptionRevoke(body) : normalizeTimeExceptionRegister(body);
  const coordinates = identityCoordinates(identityPrincipal, session);
  const envelope = await call(sql, revoke ? TIME_EXCEPTION_SQL.revoke : TIME_EXCEPTION_SQL.register,
    [...coordinateValues(coordinates), JSON.stringify(payload)]);
  if (!exactKeys(envelope, ['item', 'replayed']) || typeof envelope.replayed !== 'boolean') drift('resultado');
  const item = assertTimeExceptionItem(envelope.item);
  if (revoke ? item.id !== payload.id || item.revokedAt === null : item.legajo !== payload.legajo) drift('resultado');
  return { item, replayed: envelope.replayed };
}
