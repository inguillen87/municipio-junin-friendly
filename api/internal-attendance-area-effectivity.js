import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession, getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {
  AREA_EFFECTIVITY_CAPABILITIES, AREA_EFFECTIVITY_MAX_BYTES, areaEffectivityExact, areaEffectivityKey,
  areaEffectivityCommandCapabilities, validateAreaEffectivityCommand,
} from '../assets/attendance-area-effectivity-model.js';
import {
  areaEffectivityContext, areaEffectivityFail, areaEffectivitySafeError, areaEffectivityRead, areaEffectivityWrite,
} from '../lib/internal-attendance-area-effectivity.js';
export const config = {api: {bodyParser: false}};

const holdsAny = (principal, capabilities) => capabilities.some(capability => principalHasCapabilities(principal, [capability]));

/**
 * Declaración municipal de vigencia de área de los contratos adoptados. Contexto municipal, membresía
 * propia y capacidad de legajo (preparar o aprobar) verificadas antes de abrir una conexión; la base
 * vuelve a leer sesión, capacidad y persona en cada pedido.
 */
export function createAttendanceAreaEffectivityHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess,
    getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); areaEffectivityFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      const q = req.query ?? {};
      if (!q || typeof q !== 'object' || Array.isArray(q) || Object.keys(q).length || (req.url && [...new URL(req.url, 'http://local.invalid').searchParams].length))
        areaEffectivityFail('QUERY_INVALID', 400, 'La consulta no admite filtros.');
      if (method === 'POST') {
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') areaEffectivityFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, AREA_EFFECTIVITY_MAX_BYTES);
      }
      const access = await authorize(req, res, {env, requiredCapabilities: AREA_EFFECTIVITY_CAPABILITIES, capabilityMode: 'any', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false});
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !holdsAny(access.principal, AREA_EFFECTIVITY_CAPABILITIES))
        areaEffectivityFail('FORBIDDEN', 403, 'Se requiere una membresía municipal que pueda preparar o revisar cambios de legajo.');
      const session = sessionFor(access, env); areaEffectivityContext(access.principal, session);
      let command, key;
      if (method === 'POST') {
        const body = await readRawPrivateJson(req, {maxBytes: AREA_EFFECTIVITY_MAX_BYTES, declaredLength: schoolCertificateHttp.header(req, 'content-length'), maxDepth: 4,
          fail: kind => areaEffectivityFail(kind === 'large' ? 'LIMIT' : kind === 'unavailable' ? 'UNAVAILABLE' : 'INPUT_INVALID', kind === 'large' ? 413 : kind === 'unavailable' ? 503 : 400, 'No se pudo leer el formulario completo sin ambigüedades.')});
        if (!areaEffectivityExact(body, ['operation', 'payload']) || body.operation !== 'command') areaEffectivityFail('INPUT_INVALID', 400, 'Operación no admitida.');
        command = validateAreaEffectivityCommand(body.payload);
        if (!holdsAny(access.principal, areaEffectivityCommandCapabilities(command))) areaEffectivityFail('FORBIDDEN', 403, 'Tu cuenta no permite esta operación.');
        key = schoolCertificateHttp.header(req, 'idempotency-key');
        if (!areaEffectivityKey(key)) areaEffectivityFail('KEY_REQUIRED', 428, 'La operación necesita su clave de envío.');
      }
      const sql = await getSql(env), data = method === 'GET'
        ? await areaEffectivityRead(sql, access.principal, session)
        : await areaEffectivityWrite(sql, access.principal, session, command, key);
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ok: true, data});
    } catch (e) {
      const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : areaEffectivitySafeError(e);
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}
export default createAttendanceAreaEffectivityHandler();
