import { getClockSourceSql, receiveClockSource } from '../lib/clock-source-store.js';
import { readSourceBody, sourceHeader, sourceHeaders, sourceRequestShape } from '../lib/clock-source-http.js';
import { assertSourceReceipt, safeSourceError, sourceFail, sourceHash, validateSourcePayload } from '../lib/clock-source-contract.js';
export const config = {api:{bodyParser:false}};
export function createClockSourceIngestHandler(deps = {}) {
  const env = deps.env ?? process.env;
  return async (req,res) => {
    sourceHeaders(res);
    try {
      if (req.method !== 'POST') { res.setHeader('Allow','POST'); sourceFail('METHOD_NOT_ALLOWED'); }
      sourceRequestShape(req,'/api/clock-source-ingest',true);
      const authorization = sourceHeader(req,'authorization'), connector = sourceHeader(req,'x-clock-connector');
      if (!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(authorization) || !/^[a-z0-9][a-z0-9._-]{7,127}$/.test(connector)) sourceFail('CLOCK_SOURCE_AUTH_DENIED');
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(sourceHeader(req,'content-type'))) sourceFail('CLOCK_SOURCE_PAYLOAD_INVALID');
      const payload = validateSourcePayload(await readSourceBody(req));
      const sql = await (deps.getSql ?? getClockSourceSql)(env,'writer');
      const receipt = assertSourceReceipt(await (deps.receive ?? receiveClockSource)(sql,connector,sourceHash(authorization.slice(7)),payload),payload);
      if (receipt.replayed) res.setHeader('Idempotency-Replayed','true');
      return res.status(200).json({ok:true,receipt});
    } catch (error) {
      const safe = safeSourceError(error);
      if (safe.code === 'CLOCK_SOURCE_BUSY') res.setHeader('Retry-After','900');
      return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});
    }
  };
}
export default createClockSourceIngestHandler();
