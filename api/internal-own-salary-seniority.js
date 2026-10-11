import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { readRawPrivateJson } from '../lib/private-json-body.js';
import { employeeContext } from '../lib/internal-native-employees.js';
import { ownPeriodReadScopeKey, recoverOwnPeriodRead } from '../lib/own-period-read-recovery.js';
import { salaryExact } from '../assets/native-salary-catalog-model.js';
import { seniorityCommand, SENIORITY_MAX_BYTES } from '../assets/own-salary-seniority-model.js';
import { SENIORITY_READ, SENIORITY_CAPS, seniorityFail, seniorityError, seniorityOperation } from '../lib/internal-own-salary-seniority.js';
export const config = { api: { bodyParser: false } };
export function createOwnSalarySeniorityHandler(deps = {}) {
 const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess, getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
 return async (req, res) => {
  schoolCertificateHttp.headers(res);
  try {
   const method = req.method || 'GET', q = req.query ?? {}; let operation, input;
   if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); seniorityFail('METHOD_INVALID', 405, 'Método no admitido.'); }
   if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) seniorityFail('QUERY_INVALID', 400, 'Consulta inválida.');
   if (req.url) {
    const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
    if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) seniorityFail('QUERY_INVALID', 400, 'Consulta ambigua.');
   }
   if (method === 'POST') {
    if (Object.keys(q).length) seniorityFail('QUERY_INVALID', 400, 'La operación no admite parámetros.');
    schoolCertificateHttp.assertOrigin(req, env);
    if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') seniorityFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
    schoolCertificateHttp.checkLength(req, SENIORITY_MAX_BYTES);
   } else if (q.resource === 'bootstrap' && Object.keys(q).sort().join('|') === 'contractId|period|resource') { operation = 'bootstrap'; input = { contractId: q.contractId, period: q.period }; }
   else if (q.resource === 'detail' && Object.keys(q).sort().join('|') === 'id|resource') { operation = 'detail'; input = { id: q.id }; }
   else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'key|resource') { operation = 'attempt'; input = { key: q.key }; }
   else seniorityFail('QUERY_INVALID', 400, 'Consulta inválida.');
   let access = await authorize(req, res, { env, requiredCapabilities: SENIORITY_READ, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
   if (!access) return;
   if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, SENIORITY_READ)) seniorityFail('FORBIDDEN', 403, 'La membresía no permite consultar antigüedad.');
   let session = sessionFor(access, env); employeeContext(access.principal, session);
   if (method === 'POST') {
    const body = await readRawPrivateJson(req, { maxBytes: SENIORITY_MAX_BYTES, maxDepth: 8, timeoutMs: 10000, declaredLength: schoolCertificateHttp.header(req, 'content-length'), fail: kind => {
     if (kind === 'large') seniorityFail('LIMIT', 413, 'El formulario supera el tamaño permitido.');
     if (kind === 'unavailable') seniorityFail('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Consultá el mismo intento.');
     seniorityFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.');
    } });
    if (!salaryExact(body, ['operation', 'payload']) || body.operation !== 'command') seniorityFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
    const command = seniorityCommand(body.payload);
    if (!principalHasCapabilities(access.principal, SENIORITY_CAPS[command.command])) seniorityFail('FORBIDDEN', 403, 'La membresía no permite esta operación.');
    operation = 'command'; input = { body: command, key: schoolCertificateHttp.header(req, 'idempotency-key') };
   }
   const sql = await getSql(env), read = () => seniorityOperation(sql, access.principal, session, operation, input), scope = method === 'GET' ? ownPeriodReadScopeKey(access.principal, session) : null;
   const data = method === 'GET' ? await recoverOwnPeriodRead({ method, operation, busyCode: 'SENIORITY_BUSY', read, reauthorize: async () => {
    const next = await authorize(req, res, { env, requiredCapabilities: SENIORITY_READ, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
    if (!next) return false;
    if (next.mode !== 'managed' || next.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(next.principal, SENIORITY_READ)) seniorityFail('FORBIDDEN', 403, 'La membresía no permite consultar antigüedad salarial.');
    const nextSession = sessionFor(next, env);
    if (ownPeriodReadScopeKey(next.principal, nextSession) !== scope) seniorityFail('SCOPE_CHANGED', 409, 'Cambió la cuenta, la sesión o el ámbito municipal. Volvé a abrir la consulta.');
    access = next; session = nextSession; return true;
   } }) : await read();
   if (data === null) return;
   if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
   return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ ok: true, data });
  } catch (e) {
   const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : seniorityError(e);
   return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
  }
 };
}
export default createOwnSalarySeniorityHandler();
