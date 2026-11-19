import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {getInternalAdminSql} from './internal-admin.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {InternalCertifiedDataContractError, resolveInternalCertifiedDataContractSha} from '../lib/internal-certified-release.js';
import {hasEffectivePlatformOwnerContext} from '../lib/internal-platform-owner-policy.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {expectedDevicesExact} from '../assets/attendance-expected-devices-model.js';
import {
  AREA_SCOPE_ADMIN_MAX_BYTES, AREA_SCOPE_ADMIN_READ_AUTHORITY, AREA_SCOPE_ADMIN_WRITE_AUTHORITY, areaScopeKeyV4,
  validateAreaScopeQuery, validateAreaScopeCommand,
} from '../assets/attendance-area-scopes-model.js';
import {
  areaScopeAdminActor, areaScopeAdminContext, areaScopeAdminFail, areaScopeAdminSafeError, areaScopeAdminRead, areaScopeAdminWrite,
} from '../lib/internal-attendance-area-scopes.js';
export const config = {api: {bodyParser: false}};

export function areaScopeAdminHttpQuery(req, method = 'GET') {
  const q = req.query ?? {};
  if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) areaScopeAdminFail('QUERY_INVALID', 400, 'Consulta inválida.');
  if (req.url) {
    const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
    if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length)
      areaScopeAdminFail('QUERY_INVALID', 400, 'La consulta contiene parámetros repetidos o ambiguos.');
  }
  if (method === 'POST') {
    if (Object.keys(q).length) areaScopeAdminFail('QUERY_INVALID', 400, 'El envío no admite filtros de consulta.');
    return null;
  }
  return validateAreaScopeQuery({...q});
}
function certifiedRelease(env) {
  try { return resolveInternalCertifiedDataContractSha(env); }
  catch (error) {
    if (!(error instanceof InternalCertifiedDataContractError)) throw error;
    return areaScopeAdminFail('UNAVAILABLE', 503, 'El contrato de datos activo no está certificado. No se consultó ni cambió ningún dato.');
  }
}

/**
 * Administration of attendance areas per account. Same gate as the platform administration API: managed
 * session in platform context, effective platform owner and the explicit capability, all before any SQL.
 */
export function createAttendanceAreaScopesHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess,
    getSql = deps.getSql ?? getInternalAdminSql;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); areaScopeAdminFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      const query = areaScopeAdminHttpQuery(req, method);
      if (method === 'POST') {
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') areaScopeAdminFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, AREA_SCOPE_ADMIN_MAX_BYTES);
      }
      const authority = method === 'POST' ? AREA_SCOPE_ADMIN_WRITE_AUTHORITY : AREA_SCOPE_ADMIN_READ_AUTHORITY;
      const access = await authorize(req, res, {env, requiredCapabilities: authority, capabilityMode: 'all', allowLegacy: false});
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant)
        areaScopeAdminFail('PLATFORM_CONTEXT_REQUIRED', 403, 'Cambiá al contexto Plataforma para administrar las áreas de asistencia de un municipio.');
      if (!hasEffectivePlatformOwnerContext(access.principal, authority))
        areaScopeAdminFail('FORBIDDEN', 403, 'La operación exige una persona administradora vigente de la plataforma con el permiso explícito.');
      const releaseSha = certifiedRelease(env);
      // The session must be the administrator's own before a private body is read.
      areaScopeAdminActor(access.principal, access.session, releaseSha, authority);
      let tenantId = query?.tenantId, command, key;
      if (method === 'POST') {
        key = schoolCertificateHttp.header(req, 'idempotency-key');
        if (!areaScopeKeyV4(key)) areaScopeAdminFail('KEY_REQUIRED', 428, 'La operación necesita su clave de envío.');
        const body = await readRawPrivateJson(req, {maxBytes: AREA_SCOPE_ADMIN_MAX_BYTES, declaredLength: schoolCertificateHttp.header(req, 'content-length'), maxDepth: 4,
          fail: kind => areaScopeAdminFail(kind === 'large' ? 'LIMIT' : kind === 'unavailable' ? 'UNAVAILABLE' : 'INPUT_INVALID', kind === 'large' ? 413 : kind === 'unavailable' ? 503 : 400, 'No se pudo leer el formulario completo sin ambigüedades.')});
        if (!expectedDevicesExact(body, ['operation', 'tenantId', 'payload']) || body.operation !== 'command') areaScopeAdminFail('INPUT_INVALID', 400, 'Operación no admitida.');
        tenantId = body.tenantId; command = validateAreaScopeCommand(body.payload);
      }
      // The municipality is verified too before a connection is opened.
      areaScopeAdminContext(access.principal, access.session, tenantId, releaseSha, authority);
      const sql = await getSql(env), data = method === 'GET'
        ? await areaScopeAdminRead(sql, access.principal, access.session, query, {releaseSha})
        : await areaScopeAdminWrite(sql, access.principal, access.session, tenantId, command, key, {releaseSha});
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(200).json({ok: true, data});
    } catch (e) {
      if (e?.code === 'INTERNAL_ADMIN_DATABASE_ROLE_REQUIRED')
        return res.status(503).json({ok: false, code: 'ATTENDANCE_AREA_SCOPE_UNAVAILABLE', error: 'El acceso aislado de administración no está configurado. No se consultó ni cambió ningún dato.'});
      const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : areaScopeAdminSafeError(e);
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}
export default createAttendanceAreaScopesHandler();
