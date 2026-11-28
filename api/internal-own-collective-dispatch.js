import { timingSafeEqual } from 'node:crypto';
import { getActionCenterSql } from './internal-actions.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { ownCollectiveJobPending } from '../lib/own-collective-jobs.js';
import { publishCollectiveJob } from '../lib/own-collective-jobs-queue.js';

export const config = { api: { bodyParser: false } };

function authorizedCron(req, env) {
  if (typeof env.CRON_SECRET !== 'string' || env.CRON_SECRET.length < 32) return false;
  let header;
  try { header = schoolCertificateHttp.header(req, 'authorization'); } catch { return false; }
  const actual = Buffer.from(header), expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createOwnCollectiveDispatchHandler(deps = {}) {
  const env = deps.env ?? process.env, getSql = deps.getSql ?? getActionCenterSql;
  const pending = deps.pending ?? ownCollectiveJobPending, publish = deps.publish ?? publishCollectiveJob;
  return async (req, res) => {
    schoolCertificateHttp.headers(res);
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ ok: false, code: 'METHOD_INVALID' }); }
    if (!authorizedCron(req, env)) return res.status(401).json({ ok: false, code: 'UNAUTHORIZED' });
    if (Object.keys(req.query ?? {}).length || req.url && new URL(req.url, 'http://local.invalid').search) return res.status(400).json({ ok: false, code: 'QUERY_INVALID' });
    try {
      const jobs = await pending(await getSql(env), 20);
      // A failed publish keeps its row runnable. Subsequent sweeps find it;
      // successful duplicate sends are deduplicated by ID and generation.
      const results = await Promise.allSettled(jobs.map(job => publish(job)));
      const queued = results.filter(result => result.status === 'fulfilled').length;
      return res.status(queued === jobs.length ? 200 : 503).json({ ok: queued === jobs.length, inspected: jobs.length, queued, pending: jobs.length - queued });
    } catch { return res.status(503).json({ ok: false, code: 'COLLECTIVE_JOB_DISPATCH_UNAVAILABLE' }); }
  };
}

export default createOwnCollectiveDispatchHandler();
