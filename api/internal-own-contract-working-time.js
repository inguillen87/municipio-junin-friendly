import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { readRawPrivateJson } from '../lib/private-json-body.js';
import { employeeContext } from '../lib/internal-native-employees.js';
import { ownPeriodReadScopeKey, recoverOwnPeriodRead } from '../lib/own-period-read-recovery.js';
import { salaryExact } from '../assets/native-salary-catalog-model.js';
import { workingTimeCommand, WORKING_TIME_MAX_BYTES } from '../assets/own-contract-working-time-model.js';
import { WORKING_TIME_READ, WORKING_TIME_CAPS, workingTimeFail, workingTimeError, workingTimeOperation } from '../lib/internal-own-contract-working-time.js';
export const config = { api: { bodyParser: false } };
export function createOwnContractWorkingTimeHandler(deps = {}) {
 const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess, getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
 return async (req, res) => {
  schoolCertificateHttp.headers(res);
  try {
   const method = req.method || 'GET', q = req.query ?? {}; let operation, input;
   if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); workingTimeFail('METHOD_INVALID', 405, 'Método no admitido.'); }
   if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) workingTimeFail('QUERY_INVALID', 400, 'Consulta inválida.');
   if (req.url) {
    const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
    if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) workingTimeFail('QUERY_INVALID', 400, 'Consulta ambigua.');
   }
   if (method === 'POST') {
    if (Object.keys(q).length) workingTimeFail('QUERY_INVALID', 400, 'La operación no admite parámetros.');
    schoolCertificateHttp.assertOrigin(req, env);
    if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') workingTimeFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
    schoolCertificateHttp.checkLength(req, WORKING_TIME_MAX_BYTES);
   } else if (q.resource === 'bootstrap' && Object.keys(q).sort().join('|') === 'contractId|period|resource') { operation = 'bootstrap'; input = { contractId: q.contractId, period: q.period }; }
   else if (q.resource === 'detail' && Object.keys(q).sort().join('|') === 'id|resource') { operation = 'detail'; input = { id: q.id }; }
   else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'key|resource') { operation = 'attempt'; input = { key: q.key }; }
   else workingTimeFail('QUERY_INVALID', 400, 'Consulta inválida.');
   let access = await authorize(req, res, { env, requiredCapabilities: WORKING_TIME_READ, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
   if (!access) return;
   if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, WORKING_TIME_READ)) workingTimeFail('FORBIDDEN', 403, 'La membresía no permite consultar jornada contractual.');
   let session = sessionFor(access, env); employeeContext(access.principal, session);
   if (method === 'POST') {
    const body = await readRawPrivateJson(req, { maxBytes: WORKING_TIME_MAX_BYTES, maxDepth: 8, timeoutMs: 10000, declaredLength: schoolCertificateHttp.header(req, 'content-length'), fail: kind => {
     if (kind === 'large') workingTimeFail('LIMIT', 413, 'El formulario supera el tamaño permitido.');
     if (kind === 'unavailable') workingTimeFail('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Consultá el mismo intento.');
     workingTimeFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.');
    } });
    if (!salaryExact(body, ['operation', 'payload']) || body.operation !== 'command') workingTimeFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
    const command = workingTimeCommand(body.payload);
    if (!principalHasCapabilities(access.principal, WORKING_TIME_CAPS[command.command])) workingTimeFail('FORBIDDEN', 403, 'La membresía no permite esta operación.');
    operation = 'command'; input = { body: command, key: schoolCertificateHttp.header(req, 'idempotency-key') };
   }
   const sql = await getSql(env), read = () => workingTimeOperation(sql, access.principal, session, operation, input), scope = method === 'GET' ? ownPeriodReadScopeKey(access.principal, session) : null;
   const data = method === 'GET' ? await recoverOwnPeriodRead({ method, operation, busyCode: 'WORKING_TIME_BUSY', read, reauthorize: async () => {
    const next = await authorize(req, res, { env, requiredCapabilities: WORKING_TIME_READ, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
    if (!next) return false;
    if (next.mode !== 'managed' || next.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(next.principal, WORKING_TIME_READ)) workingTimeFail('FORBIDDEN', 403, 'La membresía no permite consultar jornada contractual.');
    const nextSession = sessionFor(next, env);
    if (ownPeriodReadScopeKey(next.principal, nextSession) !== scope) workingTimeFail('SCOPE_CHANGED', 409, 'Cambió la cuenta, la sesión o el ámbito municipal. Volvé a abrir la consulta.');
    access = next; session = nextSession; return true;
   } }) : await read();
   if (data === null) return;
   if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
   return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ ok: true, data });
  } catch (e) {
   const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : workingTimeError(e);
   return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
  }
 };
}
export default createOwnContractWorkingTimeHandler();
