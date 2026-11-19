import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession, getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readPrivateJsonBody} from './internal-employment-catalog.js';
import {
  EMPLOYMENT_VOID_READ, EMPLOYMENT_VOID_CAPS, EMPLOYMENT_VOID_MAX_BYTES,
  voidFail, employmentVoidError, employmentVoidOperation,
} from '../lib/internal-employment-void.js';

export const config = {api: {bodyParser: false}};

export function createEmploymentVoidHandler(deps = {}) {
  const env = deps.env ?? process.env;
  const authorize = deps.requireAccess ?? requireCompatibleInternalAccess;
  const getSql = deps.getSql ?? getActionCenterSql;
  const sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET';
      if (!['GET', 'POST'].includes(method)) {
        res.setHeader('Allow', 'GET, POST');
        voidFail('METHOD_INVALID', 405, 'Método no admitido.');
      }
      const q = req.query ?? {};
      if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) {
        voidFail('QUERY_INVALID', 400, 'Consulta inválida.');
      }
      if (typeof req.url === 'string') {
        const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
        if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v)
          || new Set(entries.map(([k]) => k)).size !== entries.length) {
          voidFail('QUERY_INVALID', 400, 'Consulta ambigua.');
        }
      }
      let operation, input;
      if (method === 'POST') {
        if (Object.keys(q).length) voidFail('QUERY_INVALID', 400, 'No se admiten parámetros en la operación.');
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') {
          voidFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        }
        schoolCertificateHttp.checkLength(req, EMPLOYMENT_VOID_MAX_BYTES);
      } else if (q.resource === 'bootstrap' && Object.keys(q).sort().join('|') === 'contractId|resource') {
        operation = 'bootstrap'; input = {contractId: q.contractId};
      } else if (q.resource === 'proposal' && Object.keys(q).sort().join('|') === 'contractId|id|resource') {
        operation = 'proposal'; input = {contractId: q.contractId, id: q.id};
      } else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'contractId|key|resource') {
        operation = 'attempt'; input = {contractId: q.contractId, key: q.key};
      } else {
        voidFail('QUERY_INVALID', 400, 'Consulta inválida.');
      }
      const access = await authorize(req, res, {
        env, requiredCapabilities: [EMPLOYMENT_VOID_READ], capabilityMode: 'all',
        requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false,
      });
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership'
        || !principalHasCapabilities(access.principal, [EMPLOYMENT_VOID_READ])) {
        voidFail('FORBIDDEN', 403, 'La membresía no permite consultar este legajo.');
      }
      const session = sessionFor(access, env);
      if (method === 'POST') {
        const body = await readPrivateJsonBody(req, {maxBytes: EMPLOYMENT_VOID_MAX_BYTES});
        if (!body || typeof body !== 'object' || Array.isArray(body)
          || Object.keys(body).sort().join('|') !== 'operation|payload'
          || !Object.hasOwn(EMPLOYMENT_VOID_CAPS, body.operation)) {
          voidFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
        }
        operation = body.operation;
        if (!principalHasCapabilities(access.principal, [EMPLOYMENT_VOID_CAPS[operation]])) {
          voidFail('FORBIDDEN', 403, 'La membresía no permite esta operación de corrección del alta.');
        }
        input = {body: body.payload, key: schoolCertificateHttp.header(req, 'idempotency-key')};
      }
      const data = await employmentVoidOperation(await getSql(env), access.principal, session, operation, input);
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ok: true, data});
    } catch (error) {
      const safe = String(error?.code || '').startsWith('SCHOOL_CERTIFICATE_')
        ? schoolCertificateSafeError(error) : employmentVoidError(error);
      if (safe.code === 'NATIVE_EMPLOYMENT_VOID_BUSY') res.setHeader('Retry-After', '1');
      return res.status(safe.status).json({ok: false, code: safe.code, error: safe.message});
    }
  };
}
export default createEmploymentVoidHandler();
