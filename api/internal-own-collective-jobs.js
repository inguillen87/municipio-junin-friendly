import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { employeeContext } from '../lib/internal-native-employees.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { readRawPrivateJson } from '../lib/private-json-body.js';
import { salaryExact } from '../assets/native-salary-catalog-model.js';
import {
  COLLECTIVE_JOB_READ, COLLECTIVE_JOB_MAX_BYTES, collectiveJobCapability,
  collectiveJobCreateInput, collectiveJobActionInput, collectiveJobError,
  collectiveJobFail, ownCollectiveJobOperation,
} from '../lib/own-collective-jobs.js';
import { publishCollectiveJob } from '../lib/own-collective-jobs-queue.js';

export const config = { api: { bodyParser: false } };

function requestQuery(req, method) {
  const q = req.query ?? {};
  if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(value => typeof value !== 'string')) collectiveJobFail('QUERY_INVALID', 400, 'Consulta inválida.');
  if (req.url) {
    const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
    if (entries.length !== Object.keys(q).length || entries.some(([key, value]) => q[key] !== value)
        || new Set(entries.map(([key]) => key)).size !== entries.length) collectiveJobFail('QUERY_INVALID', 400, 'Consulta ambigua.');
  }
  if (method === 'POST') {
    if (Object.keys(q).length) collectiveJobFail('QUERY_INVALID', 400, 'La operación no admite parámetros.');
    return null;
  }
  const allowed = q.resource === 'list' ? ['resource', 'family', 'period', 'cursor']
    : q.resource === 'status' ? ['resource', 'id'] : q.resource === 'detail' ? ['resource', 'id', 'offset', 'limit'] : [];
  if (!allowed.length || Object.keys(q).some(key => !allowed.includes(key))
      || q.resource === 'list' && !q.family || q.resource !== 'list' && !q.id
      || ['offset', 'limit'].some(key => Object.hasOwn(q, key) && !/^(?:0|[1-9][0-9]*)$/.test(q[key]))) collectiveJobFail('QUERY_INVALID', 400, 'Consulta inválida.');
  if (q.resource === 'list') return { operation: 'list', input: { family: q.family, period: q.period ?? null, cursor: q.cursor ?? null } };
  return { operation: q.resource, input: { id: q.id, ...(q.offset === undefined ? {} : { offset: Number(q.offset) }), ...(q.limit === undefined ? {} : { limit: Number(q.limit) }) } };
}

export function createOwnCollectiveJobsHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess;
  const sessionFor = deps.sessionFor ?? actionMutationSession, getSql = deps.getSql ?? getActionCenterSql;
  const operate = deps.operate ?? ownCollectiveJobOperation, publish = deps.publish ?? publishCollectiveJob;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); collectiveJobFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      let parsed = requestQuery(req, method);
      if (method === 'POST') {
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') collectiveJobFail('CONTENT_TYPE', 415, 'Se requiere un archivo JSON.');
        schoolCertificateHttp.checkLength(req, COLLECTIVE_JOB_MAX_BYTES);
      }
      const access = await authorize(req, res, { env, requiredCapabilities: COLLECTIVE_JOB_READ, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, COLLECTIVE_JOB_READ)) collectiveJobFail('FORBIDDEN', 403, 'La membresía no permite consultar estos conjuntos.');
      const session = sessionFor(access, env);
      employeeContext(access.principal, session);
      if (method === 'POST') {
        const body = await readRawPrivateJson(req, { maxBytes: COLLECTIVE_JOB_MAX_BYTES, maxDepth: 9, timeoutMs: 10000, declaredLength: schoolCertificateHttp.header(req, 'content-length'), fail: kind => {
          if (kind === 'large') collectiveJobFail('LIMIT', 413, 'El conjunto supera el tamaño permitido. No se recortaron registros.');
          if (kind === 'unavailable') collectiveJobFail('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Consultá el mismo intento.');
          collectiveJobFail('INPUT_INVALID', 400, 'El envío contiene datos ambiguos o inválidos.');
        } });
        if (!salaryExact(body, ['operation', 'payload'])) collectiveJobFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
        const input = body.operation === 'create' ? collectiveJobCreateInput(body.payload, schoolCertificateHttp.header(req, 'idempotency-key'))
          : collectiveJobActionInput(body.operation, body.payload);
        const permitted = body.operation === 'create' ? principalHasCapabilities(access.principal, [collectiveJobCapability(input.command)])
          : ['payroll.parameter.prepare', 'payroll.parameter.approve'].some(capability => principalHasCapabilities(access.principal, [capability]));
        if (!permitted) collectiveJobFail('FORBIDDEN', 403, 'La membresía no permite esta operación.');
        parsed = { operation: body.operation, input };
      }
      const sql = await getSql(env);
      const data = await operate(sql, access.principal, session, parsed.operation, parsed.input);
      let dispatch = null;
      if (method === 'POST' && ['create', 'confirm', 'resume'].includes(parsed.operation) && ['preparing', 'running'].includes(data.phase)) {
        try { await publish(data); dispatch = 'queued'; }
        catch { dispatch = 'pending'; } // The scheduled outbox dispatcher retries independently of this browser.
      }
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(dispatch ? 202 : 200).json({ ok: true, data, dispatch });
    } catch (error) {
      const safe = String(error?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(error) : collectiveJobError(error);
      return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
    }
  };
}

export default createOwnCollectiveJobsHandler();
