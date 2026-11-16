import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession, getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {parseScopedPrivateJson, readRawPrivateJson} from '../lib/private-json-body.js';
import {
  EXPECTED_DEVICES_READ, EXPECTED_DEVICES_MAX_BYTES, expectedDevicesExact, expectedDevicesUuid,
  validateExpectedDevicesQuery, validateExpectedDevicesCommand, expectedDevicesCommandCapability,
} from '../assets/attendance-expected-devices-model.js';
import {expectedDevicesContext, expectedDevicesFail, expectedDevicesSafeError, expectedDevicesRead, expectedDevicesWrite} from '../lib/internal-attendance-expected-devices.js';
export const config = {api: {bodyParser: false}};

export function expectedDevicesHttpQuery(req, method = 'GET') {
  const q = req.query ?? {};
  if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) expectedDevicesFail('QUERY_INVALID', 400, 'Consulta inválida.');
  if (req.url) {
    const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
    if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length)
      expectedDevicesFail('QUERY_INVALID', 400, 'La consulta contiene parámetros repetidos o ambiguos.');
  }
  if (method === 'POST') {
    if (Object.keys(q).length) expectedDevicesFail('QUERY_INVALID', 400, 'El envío no admite filtros de consulta.');
    return {};
  }
  const input = {...q};
  if (Object.hasOwn(q, 'area')) {
    if (q.area.length > 256) expectedDevicesFail('QUERY_INVALID', 400, 'Área inválida.');
    try { input.area = parseScopedPrivateJson(q.area, {maxDepth: 2}); } catch { expectedDevicesFail('QUERY_INVALID', 400, 'Área inválida o ambigua.'); }
  }
  for (const k of ['limit', 'offset']) if (Object.hasOwn(q, k)) {
    if (!/^(0|[1-9][0-9]{0,6})$/.test(q[k])) expectedDevicesFail('QUERY_INVALID', 400, 'Paginación inválida.');
    input[k] = Number(q[k]);
  }
  return validateExpectedDevicesQuery(input);
}
export function createExpectedDevicesHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess,
    getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); expectedDevicesFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      const query = expectedDevicesHttpQuery(req, method);
      if (method === 'POST') {
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') expectedDevicesFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, EXPECTED_DEVICES_MAX_BYTES);
      }
      const access = await authorize(req, res, {env, requiredCapabilities: [EXPECTED_DEVICES_READ], capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false});
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, [EXPECTED_DEVICES_READ]))
        expectedDevicesFail('FORBIDDEN', 403, 'Se requiere una membresía con lectura explícita de asistencia por área.');
      const session = sessionFor(access, env); expectedDevicesContext(access.principal, session);
      let command, key;
      if (method === 'POST') {
        const body = await readRawPrivateJson(req, {maxBytes: EXPECTED_DEVICES_MAX_BYTES, declaredLength: schoolCertificateHttp.header(req, 'content-length'), maxDepth: 8,
          fail: kind => expectedDevicesFail(kind === 'large' ? 'LIMIT' : kind === 'unavailable' ? 'UNAVAILABLE' : 'INPUT_INVALID', kind === 'large' ? 413 : kind === 'unavailable' ? 503 : 400, 'No se pudo leer el formulario completo sin ambigüedades.')});
        if (!expectedDevicesExact(body, ['operation', 'payload']) || body.operation !== 'command') expectedDevicesFail('INPUT_INVALID', 400, 'Operación no admitida.');
        command = validateExpectedDevicesCommand(body.payload);
        if (!principalHasCapabilities(access.principal, [expectedDevicesCommandCapability(command.command)])) expectedDevicesFail('FORBIDDEN', 403, 'Tu cuenta no permite esta operación.');
        key = schoolCertificateHttp.header(req, 'idempotency-key');
        if (!expectedDevicesUuid(key)) expectedDevicesFail('KEY_REQUIRED', 428, 'La operación necesita su clave de intento.');
      }
      const sql = await getSql(env), data = method === 'GET'
        ? await expectedDevicesRead(sql, access.principal, session, query)
        : await expectedDevicesWrite(sql, access.principal, session, command, key);
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ok: true, data});
    } catch (e) {
      const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : expectedDevicesSafeError(e);
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}
export default createExpectedDevicesHandler();
