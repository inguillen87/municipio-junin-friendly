import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { readRawPrivateJson } from '../lib/private-json-body.js';
import { employeeContext } from '../lib/internal-native-employees.js';
import { salaryExact } from '../assets/native-salary-catalog-model.js';
import { ownRunCommand, OWN_RUN_MAX_BODY } from '../assets/own-payroll-run-model.js';
import { RUN_READ, RUN_NOMINAL, RUN_CALCULATE, runFail, runError, ownRunOperation } from '../lib/internal-own-payroll-run.js';
export const config = { api: { bodyParser: false } };
export function createOwnRunHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess,
    getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET', q = req.query ?? {}; let operation, input;
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); runFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) runFail('QUERY_INVALID', 400, 'Consulta inválida.');
      if (req.url) {
        const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
        if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) runFail('QUERY_INVALID', 400, 'Consulta ambigua.');
      }
      if (method === 'POST') {
        if (Object.keys(q).length) runFail('QUERY_INVALID', 400, 'La operación no admite parámetros.');
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') runFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, OWN_RUN_MAX_BODY);
        operation = 'calculate';
      } else if (q.resource === 'bootstrap' && Object.keys(q).join('|') === 'resource') { operation = 'bootstrap'; input = {}; }
      else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'key|resource') { operation = 'attempt'; input = { key: q.key }; }
      else runFail('QUERY_INVALID', 400, 'Consulta inválida.');
      const required = operation === 'bootstrap' ? RUN_READ : operation === 'attempt' ? RUN_NOMINAL : RUN_CALCULATE;
      const access = await authorize(req, res, { env, requiredCapabilities: required, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, required)) runFail('FORBIDDEN', 403, 'La membresía no permite esta operación sobre las corridas.');
      const session = sessionFor(access, env); employeeContext(access.principal, session);
      if (method === 'POST') {
        const body = await readRawPrivateJson(req, { maxBytes: OWN_RUN_MAX_BODY, timeoutMs: 10000, declaredLength: schoolCertificateHttp.header(req, 'content-length'), fail: kind => {
          if (kind === 'large') runFail('LIMIT', 413, 'El alcance supera el tamaño permitido. No se recortaron contratos.');
          if (kind === 'unavailable') runFail('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Consultá el mismo intento.');
          runFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.');
        } });
        if (!salaryExact(body, ['operation', 'payload']) || body.operation !== 'calculate') runFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
        input = { body: ownRunCommand(body.payload), key: schoolCertificateHttp.header(req, 'idempotency-key') };
      }
      const data = await ownRunOperation(await getSql(env), access.principal, session, operation, input, deps);
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ ok: true, data });
    } catch (e) {
      const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : runError(e);
      return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
    }
  };
}
export default createOwnRunHandler();
