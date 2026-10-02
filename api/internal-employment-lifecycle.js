import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession, getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readCatalogBody} from './internal-employment-catalog.js';
import {EMPLOYMENT_LIFECYCLE_READ, EMPLOYMENT_LIFECYCLE_CAPS, EMPLOYMENT_LIFECYCLE_MAX_BYTES, lifecycleFail, employmentLifecycleError, employmentLifecycleOperation} from '../lib/internal-employment-lifecycle.js';
export const config = {api: {bodyParser: false}};

export function createEmploymentLifecycleHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess, getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); lifecycleFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      const q = req.query ?? {};
      if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) lifecycleFail('QUERY_INVALID', 400, 'Consulta inválida.');
      if (req.url) {
        const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
        if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) lifecycleFail('QUERY_INVALID', 400, 'Consulta ambigua.');
      }
      let operation, input;
      if (method === 'POST') {
        if (Object.keys(q).length) lifecycleFail('QUERY_INVALID', 400, 'No se admiten parámetros en la operación.');
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') lifecycleFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, EMPLOYMENT_LIFECYCLE_MAX_BYTES);
      } else if (q.resource === 'bootstrap' && Object.keys(q).sort().join('|') === 'contractId|resource') { operation = 'bootstrap'; input = {contractId: q.contractId}; }
      else if (q.resource === 'proposal' && Object.keys(q).sort().join('|') === 'contractId|id|resource') { operation = 'proposal'; input = {contractId: q.contractId, id: q.id}; }
      else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'contractId|key|resource') { operation = 'attempt'; input = {contractId: q.contractId, key: q.key}; }
      else lifecycleFail('QUERY_INVALID', 400, 'Consulta inválida.');
      const access = await authorize(req, res, {env, requiredCapabilities: [EMPLOYMENT_LIFECYCLE_READ], capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false});
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, [EMPLOYMENT_LIFECYCLE_READ])) lifecycleFail('FORBIDDEN', 403, 'La membresía no permite consultar este legajo.');
      const session=sessionFor(access,env);
      if (method === 'POST') {
        const body = await readCatalogBody(req, {maxBytes: EMPLOYMENT_LIFECYCLE_MAX_BYTES}); operation = body.operation;
        if (Buffer.byteLength(JSON.stringify(body)) > EMPLOYMENT_LIFECYCLE_MAX_BYTES) lifecycleFail('INPUT_INVALID', 413, 'El formulario supera el tamaño permitido.');
        if (!principalHasCapabilities(access.principal, [EMPLOYMENT_LIFECYCLE_CAPS[operation]])) lifecycleFail('FORBIDDEN', 403, 'La membresía no permite esta operación sobre el historial laboral.');
        input = {body: body.payload, key: schoolCertificateHttp.header(req, 'idempotency-key')};
      }
      const data = await employmentLifecycleOperation(await getSql(env), access.principal, session, operation, input);
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ok: true, data});
    } catch (error) {
      const safe = String(error?.code || '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(error) : employmentLifecycleError(error);
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}
export default createEmploymentLifecycleHandler();
