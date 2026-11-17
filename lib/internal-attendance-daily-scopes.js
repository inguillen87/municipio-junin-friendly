// T4 · B: the area × site pairs a bell reader may read (migration 241). Only area source ids and
// site keys come back; the bell reader validates each pair again before producing any cut.
import {parseScopedPrivateJson} from './private-json-body.js';
import {expectedDevicesContext} from './internal-attendance-expected-devices.js';

export const ATTENDANCE_DAILY_SCOPES_VERSION = 'attendance-daily-scopes.v1';
export const ATTENDANCE_DAILY_SCOPES_SQL = 'SELECT public.attendance_daily_scopes_read_v1($1::jsonb,$2::jsonb)::text AS result';
const DAY = /^20\d\d-\d\d-\d\d$/;
const fail = () => { throw Object.assign(new Error('ATTENDANCE_DAILY_SCOPES_UNAVAILABLE'), {code: 'ATTENDANCE_DAILY_SCOPES_UNAVAILABLE'}); };
const exact = (v, keys) => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v))
  && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));

/** window = {firstDay, lastDay}: civil days, at most seven, as the bell reader asks for them. */
export async function listAttendanceDailyScopes(sql, principal, session, window) {
  const ctx = expectedDevicesContext(principal, session);
  if (!exact(window, ['firstDay', 'lastDay']) || !DAY.test(window.firstDay) || !DAY.test(window.lastDay) || window.lastDay < window.firstDay) fail();
  const rows = await sql.query(ATTENDANCE_DAILY_SCOPES_SQL, [JSON.stringify(ctx), JSON.stringify({firstDay: window.firstDay, lastDay: window.lastDay})]);
  const values = Array.isArray(rows) ? rows : rows?.rows;
  if (!Array.isArray(values) || values.length !== 1 || typeof values[0]?.result !== 'string' || Buffer.byteLength(values[0].result) > 256 * 1024) fail();
  let data;
  try { data = parseScopedPrivateJson(values[0].result, {maxDepth: 6}); } catch { fail(); }
  // The answer must belong to this exact tenant and membership.
  if (!exact(data, ['version', 'tenantId', 'membershipId', 'scopes']) || data.version !== ATTENDANCE_DAILY_SCOPES_VERSION
    || data.tenantId !== ctx.tenantId || data.membershipId !== ctx.membershipId || !Array.isArray(data.scopes)) fail();
  return data.scopes;
}
