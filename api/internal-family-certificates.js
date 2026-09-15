import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import {
  SCHOOL_CERTIFICATE_MAX_BODY_BYTES, SCHOOL_CERTIFICATE_READ_CAPABILITY, SCHOOL_CERTIFICATE_WRITE_CAPABILITY,
  schoolCertificateFail, schoolCertificateSafeError, schoolCertificateUuid, schoolCertificateContractId,
  prepareSchoolCertificate, readSchoolCertificates, registerSchoolCertificate, downloadSchoolCertificate,
} from '../lib/internal-family-certificates.js';

export const config = { api: { bodyParser: false } };
function headers(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; frame-ancestors 'none'");
}
function header(req, name) {
  const matches = Object.entries(req.headers ?? {}).filter(([key]) => key.toLowerCase() === name);
  if (matches.length > 1 || matches.some(([, value]) => Array.isArray(value))) schoolCertificateFail('BODY_INVALID');
  const raw = req.rawHeaders;
  if (Array.isArray(raw) && raw.filter((value, index) => index % 2 === 0 && String(value).toLowerCase() === name).length > 1) schoolCertificateFail('BODY_INVALID');
  const value = typeof req.headers?.get === 'function' ? req.headers.get(name) : matches[0]?.[1];
  if (value !== undefined && value !== null && typeof value !== 'string') schoolCertificateFail('BODY_INVALID');
  return value ?? '';
}
function assertOrigin(req, env) {
  let expected;
  const candidate = env.IDENTITY_APP_ORIGIN || env.INTERNAL_APP_ORIGIN || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '');
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error();
    expected = url.origin;
  } catch { schoolCertificateFail('ORIGIN_NOT_CONFIGURED'); }
  const origin = header(req, 'origin'), site = header(req, 'sec-fetch-site');
  if (origin !== expected || site && site !== 'same-origin') schoolCertificateFail('ORIGIN_INVALID');
}
function query(req, method) {
  const values = req.query ?? {};
  if (!values || typeof values !== 'object' || Array.isArray(values) || Object.values(values).some(value => typeof value !== 'string')) schoolCertificateFail('QUERY_INVALID');
  // Check the raw URL as well: middleware may otherwise flatten repeated keys.
  if (typeof req.url === 'string') {
    const raw = new URL(req.url, 'http://localhost').searchParams, seen = new Set();
    for (const [key, value] of raw) {
      if (seen.has(key) || !Object.hasOwn(values, key) || values[key] !== value) schoolCertificateFail('QUERY_INVALID');
      seen.add(key);
    }
    if (seen.size !== Object.keys(values).length) schoolCertificateFail('QUERY_INVALID');
  }
  if (method === 'POST') {
    if (Object.keys(values).some(key => key !== 'version') || Object.hasOwn(values, 'version') && values.version !== '2') schoolCertificateFail('QUERY_INVALID');
    return values;
  }
  const resource = values.resource;
  const field = resource === 'family' ? 'contractId' : resource === 'download' ? 'certificateId' : null;
  const allowed = resource === 'report' ? ['resource'] : field ? ['resource', field] : [];
  if (Object.hasOwn(values, 'version')) {
    if (!allowed.length || values.version !== '2') schoolCertificateFail('QUERY_INVALID');
    allowed.push('version');
  }
  if (!allowed.length || Object.keys(values).length !== allowed.length || Object.keys(values).some(key => !allowed.includes(key))
      || field && !(field === 'contractId' ? schoolCertificateContractId(values[field]) : schoolCertificateUuid(values[field]))) schoolCertificateFail('QUERY_INVALID');
  return values;
}
function checkLength(req, maxBytes = SCHOOL_CERTIFICATE_MAX_BODY_BYTES) {
  const length = header(req, 'content-length');
  if (length && !/^(?:0|[1-9][0-9]*)$/.test(length)) schoolCertificateFail('BODY_INVALID');
  if (length && Number(length) > maxBytes) schoolCertificateFail('BODY_TOO_LARGE');
}
function parseJson(value) {
  // Accepted objects use disjoint names (v2 adds only familyRef.kind/id).
  // Reject repeated, including escaped, names before JSON.parse overwrites them.
  const keys = new Set();
  try {
    for (let i = 0; i < value.length; i++) {
      if (value[i] !== '"') continue;
      const start = i++;
      for (; i < value.length && value[i] !== '"'; i++) if (value[i] === '\\') i++;
      const end = i + 1;
      let next = end; while (/\s/.test(value[next] ?? '') && next < value.length) next++;
      if (value[next] === ':') {
        const key = JSON.parse(value.slice(start, end));
        if (keys.has(key)) schoolCertificateFail('BODY_INVALID');
        keys.add(key);
      }
    }
    return JSON.parse(value);
  } catch { schoolCertificateFail('BODY_INVALID'); }
}
async function readBody(req, maxBytes = SCHOOL_CERTIFICATE_MAX_BODY_BYTES) {
  checkLength(req, maxBytes);
  let value = req.body;
  if (value === undefined && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > maxBytes) schoolCertificateFail('BODY_TOO_LARGE');
      chunks.push(bytes);
    }
    value = Buffer.concat(chunks, size);
  }
  if (Buffer.isBuffer(value)) {
    if (value.length > maxBytes) schoolCertificateFail('BODY_TOO_LARGE');
    value = value.toString('utf8');
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value) > maxBytes) schoolCertificateFail('BODY_TOO_LARGE');
    value = parseJson(value);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) schoolCertificateFail('BODY_INVALID');
  let size;
  try { size = Buffer.byteLength(JSON.stringify(value)); } catch { schoolCertificateFail('BODY_INVALID'); }
  if (size > maxBytes) schoolCertificateFail('BODY_TOO_LARGE');
  return value;
}
function capability(principal, key) {
  return principalHasCapabilities(principal, [key]);
}
// The own-family endpoint uses the same private transport and origin checks.
export const schoolCertificateHttp = Object.freeze({ headers, header, assertOrigin, checkLength, readBody });
export function createInternalFamilyCertificatesHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const accessFn = dependencies.requireCompatibleInternalAccess ?? requireCompatibleInternalAccess;
  const sessionFn = dependencies.actionMutationSession ?? actionMutationSession;
  const sqlFn = dependencies.getInternalSql ?? getActionCenterSql;
  return async function internalFamilyCertificates(req, res) {
    headers(res);
    try {
      const method = req.method ?? 'GET';
      if (!['GET', 'POST'].includes(method)) { res.setHeader('Allow', 'GET, POST'); schoolCertificateFail('METHOD_NOT_ALLOWED'); }
      const q = query(req, method);
      const version = q.version === '2' ? 2 : 1;
      if (method === 'POST') {
        assertOrigin(req, env);
        if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(header(req, 'content-type'))) schoolCertificateFail('CONTENT_TYPE_REQUIRED');
        checkLength(req);
      }
      const requiredCapabilities = [SCHOOL_CERTIFICATE_READ_CAPABILITY, ...(method === 'POST' ? [SCHOOL_CERTIFICATE_WRITE_CAPABILITY] : [])];
      const access = await accessFn(req, res, { env, requiredCapabilities, capabilityMode: 'all', requireDataPlaneReady: true, requireCertifiedDataBinding: true, allowLegacy: false });
      if (!access) return undefined;
      if (access.mode !== 'managed' || access.principal?.tenant?.source !== 'membership'
          || !schoolCertificateUuid(access.principal.tenant.id) || !schoolCertificateUuid(access.principal.tenant.membershipId)) schoolCertificateFail('TENANT_MEMBERSHIP_REQUIRED');
      if (requiredCapabilities.some(key => !capability(access.principal, key))) schoolCertificateFail('CAPABILITY_REQUIRED');
      const session = sessionFn(access, env);
      if (method === 'POST') {
        const key = header(req, 'idempotency-key');
        if (!key) schoolCertificateFail('IDEMPOTENCY_KEY_REQUIRED');
        if (!schoolCertificateUuid(key)) schoolCertificateFail('IDEMPOTENCY_KEY_INVALID');
        const payload = await prepareSchoolCertificate(await readBody(req), { validatePdf: dependencies.validatePdf, version });
        const sql = await sqlFn(env);
        const data = await registerSchoolCertificate(sql, access.principal, session, payload, key, { version });
        if (data.duplicate) res.setHeader('Idempotency-Replayed', 'true');
        return res.status(data.duplicate ? 200 : 201).json({ ok: true, data });
      }
      const sql = await sqlFn(env);
      if (q.resource === 'download') {
        const result = await downloadSchoolCertificate(sql, access.principal, session, q.certificateId, { version });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.setHeader('Content-Length', String(result.bytes.length));
        return res.status(200).end(result.bytes);
      }
      const data = await readSchoolCertificates(sql, access.principal, session, q.contractId ?? null, { version });
      data.canRegister = data.canRegister && capability(access.principal, SCHOOL_CERTIFICATE_WRITE_CAPABILITY);
      return res.status(200).json({ ok: true, data });
    } catch (error) {
      const safe = schoolCertificateSafeError(error);
      if (safe.code === 'SCHOOL_CERTIFICATE_SESSION_BUSY') res.setHeader('Retry-After', '1');
      return res.status(safe.status).json({ ok: false, code: safe.code, error: safe.message });
    }
  };
}
export default createInternalFamilyCertificatesHandler();
