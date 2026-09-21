import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { schoolCertificateHttp as http } from './internal-family-certificates.js';
import { FIXED_MAX_BODY, FIXED_READ_CAPS, fixedCall, fixedFail, fixedSafeError, fixedUuid, fixedLegajo, fixedHash, fixedPeriod, prepareFixedCommand } from '../lib/internal-payroll-fixed-novelties.js';

export const config = { api: { bodyParser: false } };
function query(req, method) {
  const values = req.query ?? {};
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.values(values).some(value => typeof value !== 'string')) fixedFail('QUERY_INVALID');
  if (req.url) {
    const raw = new URL(req.url, 'http://localhost').searchParams, seen = new Set();
    for (const [key, value] of raw) { if (seen.has(key) || values[key] !== value) fixedFail('QUERY_INVALID'); seen.add(key); }
    if (seen.size !== Object.keys(values).length) fixedFail('QUERY_INVALID');
  }
  if (method === 'POST') { if (Object.keys(values).length) fixedFail('QUERY_INVALID'); return {}; }
  const resource = values.resource ?? 'bootstrap';
  const keys = { bootstrap: values.resource ? ['resource'] : [], employee: ['resource', 'legajo'], list: values.periodMonth === undefined ? ['resource'] : ['resource', 'periodMonth'],
    detail: ['resource', 'recordId'], attempt: ['resource', 'command', 'key'], export: ['resource', 'periodMonth', 'snapshotToken'] }[resource];
  if (!keys || Object.keys(values).length !== keys.length || Object.keys(values).some(key => !keys.includes(key))
    || resource === 'employee' && !fixedLegajo(values.legajo) || resource === 'detail' && !fixedUuid(values.recordId)
    || resource === 'attempt' && (!['propose', 'review'].includes(values.command) || !fixedUuid(values.key))
    || values.periodMonth !== undefined && !fixedPeriod(values.periodMonth) || resource === 'export' && !fixedHash(values.snapshotToken)) fixedFail('QUERY_INVALID');
  return { ...values, resource, ...(values.recordId ? { recordId: values.recordId.toLowerCase() } : {}), ...(values.key ? { key: values.key.toLowerCase() } : {}) };
}
export function createInternalPayrollFixedNoveltiesHandler(deps = {}) {
  const env = deps.env ?? process.env;
  return async (req, res) => {
    http.headers(res);
    try {
      const method = req.method ?? 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); fixedFail('METHOD_NOT_ALLOWED'); }
      const q = query(req, method); let command, payload, key;
      const readOperation = q.resource === 'attempt' ? q.command : q.resource;
      const extraForRead = { propose: 'payroll.fixed.prepare', review: 'payroll.fixed.approve', export: 'payroll.novelty.export' }[readOperation];
      const capabilities = [...FIXED_READ_CAPS, ...(extraForRead ? [extraForRead] : [])];
      const access = await (deps.requireCompatibleInternalAccess ?? requireCompatibleInternalAccess)(req, res, { env, requiredCapabilities: capabilities, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
      if (!access) return;
      if (access.mode !== 'managed' || !principalHasCapabilities(access.principal, capabilities)) fixedFail('CAPABILITY_REQUIRED');
      const session = (deps.actionMutationSession ?? actionMutationSession)(access, env);
      if (method === 'POST') {
        http.assertOrigin(req, env);
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(http.header(req, 'content-type'))) fixedFail('CONTENT_TYPE_REQUIRED');
        http.checkLength(req, FIXED_MAX_BODY);
        const body = await http.readBody(req, FIXED_MAX_BODY);
        if (Object.keys(body).length !== 2 || !Object.hasOwn(body, 'command') || !Object.hasOwn(body, 'payload')) fixedFail('BODY_INVALID');
        command = body.command; payload = prepareFixedCommand(command, body.payload);
        key = http.header(req, 'idempotency-key'); if (!key) fixedFail('IDEMPOTENCY_KEY_REQUIRED'); if (!fixedUuid(key)) fixedFail('IDEMPOTENCY_KEY_INVALID'); key = key.toLowerCase();
      }
      const operation = method === 'POST' ? command : q.resource === 'attempt' ? q.command : q.resource;
      const extra = { propose: 'payroll.fixed.prepare', review: 'payroll.fixed.approve', export: 'payroll.novelty.export' }[operation];
      if (extra && !principalHasCapabilities(access.principal, [extra])) fixedFail('CAPABILITY_REQUIRED');
      const sql = await (deps.getInternalSql ?? getActionCenterSql)(env);
      const data = await fixedCall(sql, access.principal, session, method === 'POST' ? command : q.resource, method === 'POST' ? { payload, key } : q);
      if (method === 'POST' && data.duplicate) res.setHeader('Idempotency-Replayed', 'true');
      return res.status(method === 'POST' && !data.duplicate ? 201 : 200).json({ ok: true, data });
    } catch (error) {
      const safe = fixedSafeError(error); if (safe.code === 'PAYROLL_FIXED_SESSION_BUSY') res.setHeader('Retry-After', '1');
      return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
    }
  };
}
export default createInternalPayrollFixedNoveltiesHandler();
