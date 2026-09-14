import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { MONTHLY_SOURCE_CAPABILITY, monthlySourceFail, monthlySourceSafeError, monthlySourceUuid,
  parseMonthlySourceQuery, readMonthlySourceSummary } from '../lib/internal-payroll-monthly-source-summary.js';

export const config = { api: { bodyParser: false } };
export function createInternalPayrollMonthlySourceSummaryHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const accessFn = dependencies.requireCompatibleInternalAccess ?? requireCompatibleInternalAccess;
  const sessionFn = dependencies.actionMutationSession ?? actionMutationSession;
  const sqlFn = dependencies.getInternalSql ?? getActionCenterSql;
  return async function internalPayrollMonthlySourceSummary(req, res) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Pragma', 'no-cache'); res.setHeader('Vary', 'Cookie, Origin');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; frame-ancestors 'none'");
    try {
      if ((req.method ?? 'GET') !== 'GET') { res.setHeader('Allow', 'GET'); monthlySourceFail('METHOD_NOT_ALLOWED'); }
      const query = parseMonthlySourceQuery(req);
      const access = await accessFn(req, res, { env, requiredCapabilities: [MONTHLY_SOURCE_CAPABILITY], capabilityMode: 'all',
        requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
      if (!access) return undefined;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership'
          || !principalHasCapabilities(access.principal, [MONTHLY_SOURCE_CAPABILITY])) monthlySourceFail('CAPABILITY_REQUIRED');
      if (!monthlySourceUuid(access.principal.tenant.id) || !monthlySourceUuid(access.principal.tenant.membershipId)) monthlySourceFail('SESSION_INVALID');
      const session = sessionFn(access, env);
      const sql = await sqlFn(env);
      const data = await readMonthlySourceSummary(sql, access.principal, session, query);
      return res.status(200).json({ ok: true, data });
    } catch (error) {
      const safe = monthlySourceSafeError(error);
      if (safe.code === 'PAYROLL_MONTHLY_SOURCE_SESSION_BUSY') res.setHeader('Retry-After', '1');
      return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
    }
  };
}
export default createInternalPayrollMonthlySourceSummaryHandler();
