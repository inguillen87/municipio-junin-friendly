import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession, getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {parseScopedPrivateJson} from '../lib/private-json-body.js';
import {EXPECTED_DEVICES_READ, expectedDevicesExact} from '../assets/attendance-expected-devices-model.js';
import {expectedDevicesContext} from '../lib/internal-attendance-expected-devices.js';
import {attendanceAreaQuery, attendanceAreaFail, attendanceAreaRead, attendanceAreaSafeError} from '../lib/internal-attendance-area.js';
export const config = {api: {bodyParser: false}};
const ATTENDANCE_AREA_MAX_QUERY_BYTES = 8192;
export function attendanceAreaHttpQuery(req) {
  const q = req.query ?? {};
  if (req.url && Buffer.byteLength(req.url, 'utf8') > ATTENDANCE_AREA_MAX_QUERY_BYTES)
    attendanceAreaFail('LIMIT', 413, 'La consulta supera el límite técnico de tamaño.');
  if (!expectedDevicesExact(q, ['resource', 'area', 'day', 'site'], ['snapshot']) || Object.values(q).some(v => typeof v !== 'string')
    || q.area.length > 256 || q.day.length !== 10 || q.site.length > 96 || q.snapshot !== undefined && q.snapshot.length > 36)
    attendanceAreaFail('QUERY_INVALID', 400, 'Indicá área, sede y día explícitos.');
  if (req.url) {
    const pairs = [...new URL(req.url, 'http://local.invalid').searchParams];
    if (pairs.length !== Object.keys(q).length || pairs.some(([k, v]) => q[k] !== v) || new Set(pairs.map(([k]) => k)).size !== pairs.length)
      attendanceAreaFail('QUERY_INVALID', 400, 'La consulta contiene parámetros repetidos o ambiguos.');
  }
  let area; try {area = parseScopedPrivateJson(q.area, {maxDepth: 2});} catch {attendanceAreaFail('QUERY_INVALID', 400, 'Área inválida o ambigua.');}
  return attendanceAreaQuery({...q, area, snapshot: q.snapshot ?? null});
}
export function createAttendanceAreaHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess,
    getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      if ((req.method || 'GET') !== 'GET') {res.setHeader('Allow', 'GET'); attendanceAreaFail('METHOD_INVALID', 405, 'Esta fachada sólo admite lectura.');}
      const q = attendanceAreaHttpQuery(req);
      const access = await authorize(req, res, {env, requiredCapabilities: [EXPECTED_DEVICES_READ], capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false});
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, [EXPECTED_DEVICES_READ]))
        attendanceAreaFail('FORBIDDEN', 403, 'Tu cuenta necesita lectura explícita de asistencia por área.');
      const session = sessionFor(access, env); expectedDevicesContext(access.principal, session);
      const data = await attendanceAreaRead(await getSql(env), access.principal, session, q);
      return res.status(200).json({ok: true, data});
    } catch (e) {
      const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : attendanceAreaSafeError(e);
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}
export default createAttendanceAreaHandler();
