import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateFail, schoolCertificateUuid, schoolCertificateContractId } from '../lib/internal-family-certificates.js';
import {
  EMPLOYEE_FAMILY_MAX_BODY_BYTES, employeeFamilySafeError, prepareEmployeeFamily,
  readEmployeeFamilyContext, declareEmployeeFamily,
} from '../lib/internal-family-members.js';

export const config = { api: { bodyParser: false } };
function query(req, method) {
  const values = req.query ?? {};
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.values(values).some(value => typeof value !== 'string')) schoolCertificateFail('QUERY_INVALID');
  if (typeof req.url === 'string') {
    const seen = new Set();
    for (const [key, value] of new URL(req.url, 'http://localhost').searchParams) {
      if (seen.has(key) || !Object.hasOwn(values, key) || values[key] !== value) schoolCertificateFail('QUERY_INVALID');
      seen.add(key);
    }
    if (seen.size !== Object.keys(values).length) schoolCertificateFail('QUERY_INVALID');
  }
  if (method === 'POST') {
    if (Object.keys(values).length) schoolCertificateFail('QUERY_INVALID');
  } else if (Object.keys(values).length !== 2 || values.resource !== 'context' || !schoolCertificateContractId(values.contractId)) schoolCertificateFail('QUERY_INVALID');
  return values;
}
export function createInternalFamilyMembersHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const accessFn = dependencies.requireCompatibleInternalAccess ?? requireCompatibleInternalAccess;
  const sessionFn = dependencies.actionMutationSession ?? actionMutationSession;
  const sqlFn = dependencies.getInternalSql ?? getActionCenterSql;
  return async function internalFamilyMembers(req, res) {
    schoolCertificateHttp.headers(res);
    try {
      const method = req.method ?? 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); schoolCertificateFail('METHOD_NOT_ALLOWED'); }
      const q = query(req, method);
      if (method === 'POST') {
        schoolCertificateHttp.assertOrigin(req, env);
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(schoolCertificateHttp.header(req, 'content-type'))) schoolCertificateFail('CONTENT_TYPE_REQUIRED');
        schoolCertificateHttp.checkLength(req, EMPLOYEE_FAMILY_MAX_BODY_BYTES);
      }
      const requiredCapabilities = ['workforce.employee.read', ...(method === 'POST' ? ['employee.record.propose'] : [])];
      const access = await accessFn(req, res, { env, requiredCapabilities, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
      if (!access) return undefined;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership'
        || !schoolCertificateUuid(access.principal.tenant.id) || !schoolCertificateUuid(access.principal.tenant.membershipId)) schoolCertificateFail('TENANT_MEMBERSHIP_REQUIRED');
      if (!principalHasCapabilities(access.principal, requiredCapabilities)) schoolCertificateFail('CAPABILITY_REQUIRED');
      const session = sessionFn(access, env);
      if (method === 'POST') {
        const key = schoolCertificateHttp.header(req, 'idempotency-key');
        if (!key) schoolCertificateFail('IDEMPOTENCY_KEY_REQUIRED');
        if (!schoolCertificateUuid(key)) schoolCertificateFail('IDEMPOTENCY_KEY_INVALID');
        const payload = prepareEmployeeFamily(await schoolCertificateHttp.readBody(req, EMPLOYEE_FAMILY_MAX_BODY_BYTES));
        const sql = await sqlFn(env);
        const data = await declareEmployeeFamily(sql, access.principal, session, payload, key);
        if (data.duplicate) res.setHeader('Idempotency-Replayed', 'true');
        return res.status(data.duplicate ? 200 : 201).json({ ok: true, data });
      }
      const sql = await sqlFn(env);
      const data = await readEmployeeFamilyContext(sql, access.principal, session, q.contractId);
      data.canDeclare = data.canDeclare && principalHasCapabilities(access.principal, ['employee.record.propose']);
      return res.status(200).json({ ok: true, data });
    } catch (error) {
      const safe = employeeFamilySafeError(error);
      if (safe.code === 'EMPLOYEE_FAMILY_SESSION_BUSY') res.setHeader('Retry-After', '1');
      return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
    }
  };
}
export default createInternalFamilyMembersHandler();
