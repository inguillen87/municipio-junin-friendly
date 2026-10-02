import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession, getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readPrivateJsonBody} from './internal-employment-catalog.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {timeCatalogCommand, timeCatalogExact, timeCatalogKey} from '../assets/time-catalog-contract.js';
import {TIME_CATALOG_MAX_BYTES, TIME_CATALOG_READ, TIME_CATALOG_CAPS, timeCatalogFail, timeCatalogError, timeCatalogRead, timeCatalogWrite, timeCatalogQuery} from '../lib/internal-time-catalog.js';
export const config = {api: {bodyParser: false}};
export function createTimeCatalogHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess, getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET', q = req.query ?? {}; let resource, input;
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); timeCatalogFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) timeCatalogFail('QUERY_INVALID', 400, 'Consulta inválida.');
      if (req.url) {
        const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
        if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) timeCatalogFail('QUERY_INVALID', 400, 'Consulta ambigua.');
      }
      if (method === 'POST') {
        if (Object.keys(q).length) timeCatalogFail('QUERY_INVALID', 400, 'El envío no admite parámetros de consulta.');
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') timeCatalogFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, TIME_CATALOG_MAX_BYTES);
      } else {
        resource = q.resource;
        if (resource === 'bootstrap' && timeCatalogExact(q, ['resource'])) input = {};
        else if (resource === 'detail' && timeCatalogExact(q, ['resource', 'id'])) input = {id: q.id};
        else if (resource === 'list' && timeCatalogExact(q, ['resource', 'kind', 'status', 'limit', 'offset']) && /^(0|[1-9]\d*)$/.test(q.limit) && /^(0|[1-9]\d*)$/.test(q.offset)) input = {kind: q.kind || null, status: q.status || null, limit: Number(q.limit), offset: Number(q.offset)};
        else timeCatalogFail('QUERY_INVALID', 400, 'Consulta inválida.');
        timeCatalogQuery(resource, input);
      }
      const access = await authorize(req, res, {env, requiredCapabilities: [TIME_CATALOG_READ], capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false});
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, [TIME_CATALOG_READ])) timeCatalogFail('FORBIDDEN', 403, 'La membresía no permite consultar este catálogo.');
      const session = sessionFor(access, env); employeeContext(access.principal, session);
      if (method === 'POST') {
        const body = await readPrivateJsonBody(req, {maxBytes: TIME_CATALOG_MAX_BYTES});
        if (!timeCatalogExact(body, ['operation', 'payload']) || body.operation !== 'command') timeCatalogFail('INPUT_INVALID', 400, 'Operación no admitida.');
        input = timeCatalogCommand(body.payload);
        if (!principalHasCapabilities(access.principal, [TIME_CATALOG_CAPS[input.command]])) timeCatalogFail('FORBIDDEN', 403, 'Tu cuenta no permite esta decisión sobre el catálogo.');
        if (!timeCatalogKey(schoolCertificateHttp.header(req, 'idempotency-key'))) timeCatalogFail('KEY_REQUIRED', 428, 'El envío requiere su clave de intento.');
      }
      const sql = await getSql(env), data = method === 'GET' ? await timeCatalogRead(sql, access.principal, session, resource, input)
        : await timeCatalogWrite(sql, access.principal, session, input, schoolCertificateHttp.header(req, 'idempotency-key'));
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ok: true, data});
    } catch (e) {
      const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : timeCatalogError(e);
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}
export default createTimeCatalogHandler();
