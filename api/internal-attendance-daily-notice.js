// GET /api/internal-attendance-daily-notice?resource=notices — read-only bell reading of the
// daily attendance notices (T4 · B). Same access gates as the area facade. The joint-cut producer
// (T4 · A) and its scope list are injected through deps; while either is missing the reading
// answers "not ready" without opening a database connection.
import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession, getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {EXPECTED_DEVICES_READ} from '../assets/attendance-expected-devices-model.js';
import {attendanceDailyNoticeFail, attendanceDailyNoticeRead, attendanceDailyNoticeSafeError} from '../lib/internal-attendance-daily-notice.js';
import {produceAttendanceDailySource} from '../lib/internal-attendance-daily-source.js';
import {listAttendanceDailyScopes} from '../lib/internal-attendance-daily-scopes.js';
export const config = {api: {bodyParser: false}};
// T4 · A producer (PR300, migration 240) and the scope list (migration 241). Both SQL functions are
// installed by Codex. The reading stays "not ready" — no connection, no notice, no failure in the
// bell — until the deployment sets ATTENDANCE_DAILY_NOTICE_ENABLED=true after that installation.
export const ATTENDANCE_DAILY_NOTICE_DEFAULT_DEPS = Object.freeze({producer: produceAttendanceDailySource, scopes: listAttendanceDailyScopes});
export const attendanceDailyNoticeEnabled = env => env?.ATTENDANCE_DAILY_NOTICE_ENABLED === 'true';

export function attendanceDailyNoticeHttpQuery(req) {
  if (req.url && Buffer.byteLength(req.url, 'utf8') > 1024) attendanceDailyNoticeFail('QUERY_INVALID', 400, 'La consulta no es válida.');
  const q = req.query ?? {}, keys = Object.keys(q);
  if (keys.length !== 1 || q.resource !== 'notices') attendanceDailyNoticeFail('QUERY_INVALID', 400, 'La consulta no es válida.');
  if (req.url) {
    const pairs = [...new URL(req.url, 'http://local.invalid').searchParams];
    if (pairs.length !== 1 || pairs[0][0] !== 'resource' || pairs[0][1] !== 'notices') attendanceDailyNoticeFail('QUERY_INVALID', 400, 'La consulta no es válida.');
  }
  return {resource: 'notices'};
}

export function createAttendanceDailyNoticeHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess,
    getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession, now = deps.now ?? (() => Date.now());
  const producer = Object.hasOwn(deps, 'producer') ? deps.producer : ATTENDANCE_DAILY_NOTICE_DEFAULT_DEPS.producer;
  const scopes = Object.hasOwn(deps, 'scopes') ? deps.scopes : ATTENDANCE_DAILY_NOTICE_DEFAULT_DEPS.scopes, dayCount = deps.dayCount;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      if ((req.method || 'GET') !== 'GET') {res.setHeader('Allow', 'GET'); attendanceDailyNoticeFail('METHOD_INVALID', 405, 'Esta lectura sólo admite GET.');}
      attendanceDailyNoticeHttpQuery(req);
      const access = await authorize(req, res, {env, requiredCapabilities: [EXPECTED_DEVICES_READ], capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false});
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, [EXPECTED_DEVICES_READ]))
        attendanceDailyNoticeFail('FORBIDDEN', 403, 'Tu cuenta necesita lectura explícita de asistencia por área.');
      const session = sessionFor(access, env), enabled = attendanceDailyNoticeEnabled(env);
      const ready = enabled && typeof producer === 'function' && typeof scopes === 'function';
      const sql = ready ? await getSql(env) : null;
      const data = await attendanceDailyNoticeRead({sql, principal: access.principal, session, now: now(),
        producer: ready ? producer : null, scopes: ready ? scopes : null, ...(dayCount === undefined ? {} : {dayCount})});
      return res.status(200).json({ok: true, data});
    } catch (e) {
      const safe = attendanceDailyNoticeSafeError(e);
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}

export default createAttendanceDailyNoticeHandler();
