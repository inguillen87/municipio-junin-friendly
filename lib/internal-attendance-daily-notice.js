// Minimal authenticated reading of the daily attendance notices for the bell (T4 · B).
// The joint-cut producer (T4 · A) is injected; this module never reads attendance, catalog,
// coverage or leave tables itself. Each produced cut is re-validated by the pure evaluator, must
// match the requested area, site, day and tenant, and leaves only through the minimized notice
// projection: counts, status and closed blocker codes. No names, legajos, contract ids, reasons
// or notes reach the response.
import {evaluateAttendanceDailyIncidents, projectAttendanceDailyNoticeSource} from './attendance-daily-incidents.js';
import {expectedDevicesContext} from './internal-attendance-expected-devices.js';

export const ATTENDANCE_DAILY_NOTICE_READ_VERSION = 'attendance-daily-notice-read.v1';
export const ATTENDANCE_DAILY_NOTICE_TIMEZONE = 'America/Argentina/Mendoza';
// Closed days only: yesterday and the day before, in the municipal civil calendar.
export const ATTENDANCE_DAILY_NOTICE_DAYS = 2;
// One bell reading may evaluate at most this many area/site scopes. More is refused, never cut.
export const ATTENDANCE_DAILY_NOTICE_MAX_SCOPES = 12;
const SITE = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const SOURCE_ID = /^(?:0|[1-9]\d{0,18})$/;

export class AttendanceDailyNoticeError extends Error {
  constructor(code, status, message) {super(message); this.name = 'AttendanceDailyNoticeError'; this.code = 'ATTENDANCE_DAILY_NOTICE_' + code; this.status = status;}
}
export function attendanceDailyNoticeFail(code, status, message) {throw new AttendanceDailyNoticeError(code, status, message);}

const matches = (re, v) => typeof v === 'string' && re.exec(v)?.[0] === v;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const exact = (v, keys) => plain(v) && Reflect.ownKeys(v).length === keys.length
  && keys.every(k => {const d = Object.getOwnPropertyDescriptor(v, k); return d && d.enumerable && Object.hasOwn(d, 'value');});
const areaValid = a => exact(a, ['organizationUnitSourceId', 'sectorSourceId'])
  && matches(SOURCE_ID, a.organizationUnitSourceId) && (a.sectorSourceId === null || matches(SOURCE_ID, a.sectorSourceId));
// Rechazos del catálogo horario que dependen de la cuenta y no del área: sin autoridad operativa, sin la capacidad viva o
// sin vínculo laboral activo (time_catalog_assert_actor_authority_v1). Ningún corte puede salir para esa cuenta, así que la
// lectura entera se rechaza con su motivo en lugar de contar cada área como «sin respuesta».
export const ATTENDANCE_DAILY_NOTICE_ACTOR_REFUSALS = /TIME_CATALOG_(?:AUTHORITY|CAPABILITY|EMPLOYMENT)_REQUIRED|ACTION_TENANT_AUTHORITY_REQUIRED|TENANT_IAM_SOD_CONFLICT/;
const scopeKey = s => s.area.organizationUnitSourceId + '/' + (s.area.sectorSourceId ?? '-') + '@' + s.site;

/** Civil days to read, newest first, computed in the municipal zone and never from the host zone. */
export function attendanceDailyNoticeDays(nowMs, count = ATTENDANCE_DAILY_NOTICE_DAYS) {
  if (!Number.isFinite(nowMs) || !Number.isSafeInteger(count) || count < 1 || count > ATTENDANCE_DAILY_NOTICE_DAYS)
    attendanceDailyNoticeFail('CLOCK_INVALID', 500, 'No se pudo determinar el día civil.');
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: ATTENDANCE_DAILY_NOTICE_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(nowMs));
  const base = Date.parse(today + 'T00:00:00Z');
  return Array.from({length: count}, (_, i) => new Date(base - (i + 1) * 86400000).toISOString().slice(0, 10));
}

/** The scopes declared for this principal: exact, unique and bounded. A well-formed pair whose site
 *  key the daily cut cannot carry (for example, with a dot or longer than 80) is counted as
 *  unsupported, so the bell says «sin respuesta» for it instead of failing the whole reading. */
export function attendanceDailyNoticeScopes(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1)
    attendanceDailyNoticeFail('SCOPES_INVALID', 503, 'El ámbito de asistencia por área no es verificable.');
  if (value.length > ATTENDANCE_DAILY_NOTICE_MAX_SCOPES)
    attendanceDailyNoticeFail('LIMIT', 413, 'La cuenta tiene más áreas y sedes de las que la campanita lee de una vez; no se devolvió un recorte.');
  let unsupported = 0;
  const all = value.map(s => {
    if (!exact(s, ['area', 'site']) || !areaValid(s.area) || typeof s.site !== 'string' || s.site.length < 1 || s.site.length > 96)
      attendanceDailyNoticeFail('SCOPES_INVALID', 503, 'El ámbito de asistencia por área no es verificable.');
    return {area: {organizationUnitSourceId: s.area.organizationUnitSourceId, sectorSourceId: s.area.sectorSourceId}, site: s.site};
  });
  if (new Set(all.map(scopeKey)).size !== all.length) attendanceDailyNoticeFail('SCOPES_INVALID', 503, 'El ámbito de asistencia por área repite un área o sede.');
  const scopes = all.filter(s => matches(SITE, s.site) || (unsupported++, false));
  return {scopes: scopes.sort((a, b) => scopeKey(a) < scopeKey(b) ? -1 : scopeKey(a) > scopeKey(b) ? 1 : 0), unsupported};
}

function notice(input, q, tenantId) {
  const result = evaluateAttendanceDailyIncidents(input);
  const s = result.scope;
  // The producer must return exactly the cut that was asked for; a different area, site, day or
  // tenant is a producer defect and is never shown.
  if (s.tenantId !== tenantId || s.site !== q.site || s.day !== q.day
    || s.area.organizationUnitSourceId !== q.area.organizationUnitSourceId || s.area.sectorSourceId !== q.area.sectorSourceId)
    throw new AttendanceDailyNoticeError('SCOPE_MISMATCH', 503, 'El corte producido no corresponde al ámbito pedido.');
  return projectAttendanceDailyNoticeSource(result);
}

/**
 * deps.scopes(sql, principal, session, {firstDay, lastDay}) → [{area, site}] (listAttendanceDailyScopes,
 * migration 241) and deps.producer(sql, principal, session, {resource:'day', area, day, site,
 * snapshot:null}) → attendance-daily-source.v1 input (T4 · A, produceAttendanceDailySource). Without
 * both, the reading is "not ready": nothing is read and no notice, zero or failure is invented.
 */
export async function attendanceDailyNoticeRead({sql, principal, session, now = Date.now(), producer = null, scopes = null, dayCount = ATTENDANCE_DAILY_NOTICE_DAYS}) {
  const ctx = expectedDevicesContext(principal, session);
  const days = attendanceDailyNoticeDays(now, dayCount);
  if (typeof producer !== 'function' || typeof scopes !== 'function')
    return {version: ATTENDANCE_DAILY_NOTICE_READ_VERSION, ready: false, days, scopeCount: 0, notices: [], failedScopes: 0};
  let declared, unsupported;
  try {({scopes: declared, unsupported} = attendanceDailyNoticeScopes(await scopes(sql, principal, session, {firstDay: days.at(-1), lastDay: days[0]})));}
  catch (e) {throw e instanceof AttendanceDailyNoticeError ? e : new AttendanceDailyNoticeError('SCOPES_INVALID', 503, 'El ámbito de asistencia por área no es verificable.');}
  const notices = [];
  let failedScopes = unsupported;
  for (const scope of declared) {
    const own = [];
    try {
      for (const day of days) {
        const q = {area: {...scope.area}, site: scope.site, day};
        // The T4 · A producer takes the area facade query: the latest cut of that day, no pinned snapshot.
        const input = await producer(sql, principal, session, {resource: 'day', area: {...scope.area}, day, site: scope.site, snapshot: null});
        own.push(notice(input, q, ctx.tenantId));
      }
    } catch (e) {
      if (ATTENDANCE_DAILY_NOTICE_ACTOR_REFUSALS.test(String(e?.message ?? '')))
        attendanceDailyNoticeFail('ACTOR_NOT_ELIGIBLE', 403, 'Tu cuenta no tiene el vínculo laboral activo y la autoridad que exige el catálogo horario; la campanita no puede armar los cortes diarios.');
      // A scope with any failed day is dropped entirely, so an older day never stands in for a
      // failed newer one. The reading says how many scopes failed, never which or why.
      failedScopes++; continue;
    }
    notices.push(...own);
  }
  return {version: ATTENDANCE_DAILY_NOTICE_READ_VERSION, ready: true, days, scopeCount: declared.length + unsupported, notices, failedScopes};
}

export function attendanceDailyNoticeSafeError(e) {
  if (e instanceof AttendanceDailyNoticeError) return e;
  const code = String(e?.code ?? '');
  // Session and capability refusals keep their status and Spanish message; anything else is generic.
  if (code.startsWith('ATTENDANCE_EXPECTED_DEVICES_') && Number.isInteger(e.status) && e.status < 500)
    return new AttendanceDailyNoticeError(code.slice('ATTENDANCE_EXPECTED_DEVICES_'.length), e.status, String(e.message ?? 'No autorizado.'));
  return new AttendanceDailyNoticeError('UNAVAILABLE', 503, 'La lectura de asistencia diaria no está disponible. Se vuelve a intentar.');
}
