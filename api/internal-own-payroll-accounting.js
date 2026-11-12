import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { readRawPrivateJson } from '../lib/private-json-body.js';
import { employeeContext } from '../lib/internal-native-employees.js';
import { salaryExact } from '../assets/native-salary-catalog-model.js';
import { accountingCommand, ACCOUNTING_MAX_BYTES } from '../assets/own-payroll-accounting-model.js';
import { ACCOUNTING_READ, ACCOUNTING_CAPS, accountingFail, accountingError, accountingOperation } from '../lib/internal-own-payroll-accounting.js';
import { ownPeriodReadScopeKey, recoverOwnPeriodRead } from '../lib/own-period-read-recovery.js';
export const config = { api: { bodyParser: false } };
export function createOwnAccountingHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess,
    getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET', q = req.query ?? {}; let operation, input;
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); accountingFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) accountingFail('QUERY_INVALID', 400, 'Consulta inválida.');
      if (req.url) {
        const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
        if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) accountingFail('QUERY_INVALID', 400, 'Consulta ambigua.');
      }
      if (method === 'POST') {
        if (Object.keys(q).length) accountingFail('QUERY_INVALID', 400, 'La operación no admite parámetros.');
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') accountingFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, ACCOUNTING_MAX_BYTES);
      } else if (q.resource === 'bootstrap' && Object.keys(q).join('|') === 'resource') { operation = 'bootstrap'; input = {}; }
      else if (q.resource === 'detail' && Object.keys(q).sort().join('|') === 'id|resource') { operation = 'detail'; input = { id: q.id }; }
      else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'key|resource') { operation = 'attempt'; input = { key: q.key }; }
      else accountingFail('QUERY_INVALID', 400, 'Consulta inválida.');
      const accessOptions = { env, requiredCapabilities: ACCOUNTING_READ, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false };
      const assertAccess = a => { if (a.mode !== 'managed' || a.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(a.principal, ACCOUNTING_READ)) accountingFail('FORBIDDEN', 403, 'La membresía no permite consultar las asociaciones.'); };
      let access = await authorize(req, res, accessOptions);
      if (!access) return;
      assertAccess(access);
      let session = sessionFor(access, env); employeeContext(access.principal, session);
      if (method === 'POST') {
        const body = await readRawPrivateJson(req, { maxBytes: ACCOUNTING_MAX_BYTES, maxDepth: 12, timeoutMs: 10000, declaredLength: schoolCertificateHttp.header(req, 'content-length'), fail: kind => {
          if (kind === 'large') accountingFail('LIMIT', 413, 'El conjunto supera el tamaño permitido. No se recortaron asociaciones.');
          if (kind === 'unavailable') accountingFail('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Reintentá el mismo contenido.');
          accountingFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.');
        } });
        if (!salaryExact(body, ['operation', 'payload']) || body.operation !== 'command') accountingFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
        const command = accountingCommand(body.payload);
        if (!principalHasCapabilities(access.principal, ACCOUNTING_CAPS[command.command])) accountingFail('FORBIDDEN', 403, 'La membresía no permite esta operación.');
        operation = 'command'; input = { body: command, key: schoolCertificateHttp.header(req, 'idempotency-key') };
      }
      // Una lectura que choca con un candado de escritura (409 ACCOUNTING_BUSY) se recupera como en los demás circuitos del
      // período: una espera, una reautorización completa y, si la cuenta y el ámbito son los mismos, una sola lectura más.
      const sql = await getSql(env), read = () => accountingOperation(sql, access.principal, session, operation, input), scope = method === 'GET' ? ownPeriodReadScopeKey(access.principal, session) : null;
      const data = method === 'GET' ? await recoverOwnPeriodRead({ method, operation, busyCode: 'ACCOUNTING_BUSY', read, reauthorize: async () => {
        const next = await authorize(req, res, accessOptions); if (!next) return false; assertAccess(next); const nextSession = sessionFor(next, env);
        if (ownPeriodReadScopeKey(next.principal, nextSession) !== scope) accountingFail('SCOPE_CHANGED', 409, 'Cambió la cuenta, la sesión o el ámbito municipal. Volvé a abrir la consulta.');
        access = next; session = nextSession; return true;
      } }) : await read();
      if (data === null) return;
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ ok: true, data });
    } catch (e) {
      const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : accountingError(e);
      return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
    }
  };
}
export default createOwnAccountingHandler();
