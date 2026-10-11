import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { readRawPrivateJson } from '../lib/private-json-body.js';
import { employeeContext } from '../lib/internal-native-employees.js';
import { ownPeriodReadScopeKey, recoverOwnPeriodRead } from '../lib/own-period-read-recovery.js';
import { salaryExact } from '../assets/native-salary-catalog-model.js';
import { artDaysCommand, ART_DAYS_MAX_BYTES } from '../assets/own-art-days-model.js';
import { ART_DAYS_READ, ART_DAYS_CAPS, artDaysFail, artDaysError, artDaysOperation } from '../lib/internal-own-art-days.js';
export const config = { api: { bodyParser: false } };
export function createOwnPeriodArtDaysHandler(deps = {}) {
 const env = deps.env ?? process.env, authorize = deps.requireAccess ?? requireCompatibleInternalAccess, getSql = deps.getSql ?? getActionCenterSql, sessionFor = deps.sessionFor ?? actionMutationSession;
 return async (req, res) => {
  schoolCertificateHttp.headers(res);
  try {
   const method = req.method || 'GET', q = req.query ?? {}; let operation, input;
   if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); artDaysFail('METHOD_INVALID', 405, 'Método no admitido.'); }
   if (!q || typeof q !== 'object' || Array.isArray(q) || Object.values(q).some(v => typeof v !== 'string')) artDaysFail('QUERY_INVALID', 400, 'Consulta inválida.');
   if (req.url) {
    const entries = [...new URL(req.url, 'http://local.invalid').searchParams];
    if (entries.length !== Object.keys(q).length || entries.some(([k, v]) => q[k] !== v) || new Set(entries.map(([k]) => k)).size !== entries.length) artDaysFail('QUERY_INVALID', 400, 'Consulta ambigua.');
   }
   if (method === 'POST') {
    if (Object.keys(q).length) artDaysFail('QUERY_INVALID', 400, 'La operación no admite parámetros.');
    schoolCertificateHttp.assertOrigin(req, env);
    if (schoolCertificateHttp.header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') artDaysFail('CONTENT_TYPE', 415, 'Se requiere un formulario JSON.');
    schoolCertificateHttp.checkLength(req, ART_DAYS_MAX_BYTES);
   } else if (q.resource === 'bootstrap' && Object.keys(q).sort().join('|') === 'contractId|period|resource') { operation = 'bootstrap'; input = { contractId: q.contractId, period: q.period }; }
   else if (q.resource === 'detail' && Object.keys(q).sort().join('|') === 'id|resource') { operation = 'detail'; input = { id: q.id }; }
   else if (q.resource === 'attempt' && Object.keys(q).sort().join('|') === 'key|resource') { operation = 'attempt'; input = { key: q.key }; }
   else artDaysFail('QUERY_INVALID', 400, 'Consulta inválida.');
   let access = await authorize(req, res, { env, requiredCapabilities: ART_DAYS_READ, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
   if (!access) return;
   if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(access.principal, ART_DAYS_READ)) artDaysFail('FORBIDDEN', 403, 'La membresía no permite consultar días ART.');
   let session = sessionFor(access, env); employeeContext(access.principal, session);
   if (method === 'POST') {
    const body = await readRawPrivateJson(req, { maxBytes: ART_DAYS_MAX_BYTES, maxDepth: 8, timeoutMs: 10000, declaredLength: schoolCertificateHttp.header(req, 'content-length'), fail: kind => {
     if (kind === 'large') artDaysFail('LIMIT', 413, 'El formulario supera el tamaño permitido.');
     if (kind === 'unavailable') artDaysFail('UNAVAILABLE', 503, 'No se pudo leer el envío completo. Consultá el mismo intento.');
     artDaysFail('INPUT_INVALID', 400, 'El formulario contiene datos ambiguos o inválidos.');
    } });
    if (!salaryExact(body, ['operation', 'payload']) || body.operation !== 'command') artDaysFail('INPUT_INVALID', 400, 'Operación o formulario no admitidos.');
    const command = artDaysCommand(body.payload);
    if (!principalHasCapabilities(access.principal, ART_DAYS_CAPS[command.command])) artDaysFail('FORBIDDEN', 403, 'La membresía no permite esta operación.');
    operation = 'command'; input = { body: command, key: schoolCertificateHttp.header(req, 'idempotency-key') };
   }
   const sql = await getSql(env), read = () => artDaysOperation(sql, access.principal, session, operation, input), scope = method === 'GET' ? ownPeriodReadScopeKey(access.principal, session) : null;
   const data = method === 'GET' ? await recoverOwnPeriodRead({ method, operation, busyCode: 'ART_DAYS_BUSY', read, reauthorize: async () => {
    const next = await authorize(req, res, { env, requiredCapabilities: ART_DAYS_READ, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
    if (!next) return false;
    if (next.mode !== 'managed' || next.principal?.tenant?.source !== 'membership' || !principalHasCapabilities(next.principal, ART_DAYS_READ)) artDaysFail('FORBIDDEN', 403, 'La membresía no permite consultar días ART.');
    const nextSession = sessionFor(next, env);
    if (ownPeriodReadScopeKey(next.principal, nextSession) !== scope) artDaysFail('SCOPE_CHANGED', 409, 'Cambió la cuenta, la sesión o el ámbito municipal. Volvé a abrir la consulta.');
    access = next; session = nextSession; return true;
   } }) : await read();
   if (data === null) return;
   if (data.replayed) res.setHeader('Idempotency-Replayed', 'true');
   return res.status(method === 'POST' && !data.replayed ? 201 : 200).json({ ok: true, data });
  } catch (e) {
   const safe = String(e?.code ?? '').startsWith('SCHOOL_CERTIFICATE_') ? schoolCertificateSafeError(e) : artDaysError(e);
   return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
  }
 };
}
export default createOwnPeriodArtDaysHandler();
