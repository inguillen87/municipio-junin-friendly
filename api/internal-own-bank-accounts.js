import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { readRawPrivateJson } from '../lib/private-json-body.js';
import { employeeContext } from '../lib/internal-native-employees.js';
import { salaryExact } from '../assets/native-salary-catalog-model.js';
import { bankAccountsCommand, BANK_ACCOUNTS_MAX_BYTES } from '../assets/own-bank-accounts-model.js';
import { BANK_ACCOUNTS_READ, BANK_ACCOUNTS_CAPS, bankAccountsFail, bankAccountsError, bankAccountsOperation } from '../lib/internal-own-bank-accounts.js';
export const config = { api: { bodyParser: false } };
export function createOwnBankAccountsHandler(deps = {}) {
  const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess,
    getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method || 'GET', q = req.query ?? {}; let operation, input;
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); bankAccountsFail('METHOD_INVALID', 405, 'Método no admitido.'); }
      if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) bankAccountsFail('QUERY_INVALID', 400, 'Consulta inválida.');
      if (req.url) {
        const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
        if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) bankAccountsFail('QUERY_INVALID', 400, 'Consulta ambigua.');
      }
      if (method === 'POST') {
        if (Object.keys(q).length) bankAccountsFail('QUERY_INVALID', 400, 'La operación no admite parámetros.');
        schoolCertificateHttp.assertOrigin(req, env);
        if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') bankAccountsFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
        schoolCertificateHttp.checkLength(req, BANK_ACCOUNTS_MAX_BYTES);
      } else if (q.resource === 'bootstrap' && Object.keys(q).join('|') === 'resource') { operation = 'bootstrap'; input = {}; }
      else if (q.resource === 'detail' && Object.keys(q).sort().join('|') === 'id|resource') { operation = 'detail'; input = { id: q.id }; }
      else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'key|resource') { operation = 'attempt'; input = { key: q.key }; }
      else bankAccountsFail('QUERY_INVALID', 400, 'Consulta inválida.');
      const access = await authorize(req, res, { env, requiredCapabilities: BANK_ACCOUNTS_READ, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
      if (!access) return;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, BANK_ACCOUNTS_READ)) bankAccountsFail('FORBIDDEN', 403, 'La membresía no permite consultar las cuentas.');
      const session = sessionFor(access, env); employeeContext(access.principal, session);
      if (method === 'POST') {
        const body = await readRawPrivateJson(req, { maxBytes: BANK_ACCOUNTS_MAX_BYTES, maxDepth: 12, timeoutMs: 10000, declaredLength: schoolCertificateHttp.header(req, 'content-length'), fail: kind => {
          if (kind === 'large') bankAccountsFail('LIMIT', 413, 'El conjunto supera el tamaño permitido. No se recortaron cuentas.');
          if (kind === 'unavailable') bankAccountsFail('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Reintentá el mismo contenido.');
          bankAccountsFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.');
        } });
        if (!salaryExact(body, ['operation', 'payload']) || body.operation !== 'command') bankAccountsFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
        const command = bankAccountsCommand(body.payload);
        if (!principalHasCapabilities(access.principal, BANK_ACCOUNTS_CAPS[command.command])) bankAccountsFail('FORBIDDEN', 403, 'La membresía no permite esta operación.');
        operation = 'command'; input = { body: command, key: schoolCertificateHttp.header(req, 'idempotency-key') };
      }
      const data = await bankAccountsOperation(await getSql(env), access.principal, session, operation, input);
      if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ ok: true, data });
    } catch (e) {
      const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : bankAccountsError(e);
      return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
    }
  };
}
export default createOwnBankAccountsHandler();
