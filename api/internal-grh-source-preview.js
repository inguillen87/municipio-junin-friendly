import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import {
  GRH_SOURCE_PREVIEW_CONTRACT_VERSION,
  GRH_SOURCE_PREVIEW_MAX_BYTES,
  GrhSourcePreviewError,
  previewGrhSource,
} from '../lib/internal-grh-source-preview.js';
import { ActionCenterError } from '../lib/internal-leave-workflow.js';
import { getTimeSourceBootstrap } from '../lib/internal-time-source-registry.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';

// JSON/base64 is intentional. The current serverless surface has no streaming
// multipart contract, and accepting multipart here would make the effective
// memory and parser limits deployment-dependent. Keep this below the platform
// request ceiling as base64 expands input by roughly one third.
export const GRH_SOURCE_PREVIEW_API_MAX_BYTES = 2 * 1024 * 1024;
export const GRH_SOURCE_PREVIEW_API_MAX_BASE64_CHARS =
  Math.ceil(GRH_SOURCE_PREVIEW_API_MAX_BYTES / 3) * 4;
export const GRH_SOURCE_PREVIEW_API_MAX_BODY_BYTES =
  GRH_SOURCE_PREVIEW_API_MAX_BASE64_CHARS + 512;

export const GRH_SOURCE_PREVIEW_REQUIRED_CAPABILITIES = Object.freeze([
  'payroll.read',
  'lineage.read',
  'time.source.read',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFINITION_KEY = /^[a-z][a-z0-9._-]{2,79}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BODY_KEYS = new Set(['definitionKey', 'contentBase64']);
const PREVIEW_STATUSES = new Set(['valid', 'has_rejections', 'invalid_structure']);
const SHA256 = /^[a-f0-9]{64}$/;
const HMAC_SHA256 = /^hmac-sha256:[a-f0-9]{64}$/;

const CALCULO_FIELDS = Object.freeze([
  Object.freeze({ name: 'codi_01', type: 'integer', required: true }),
  Object.freeze({ name: 'peri_31', type: 'integer', required: true }),
  Object.freeze({ name: 'mes_31', type: 'integer', required: true }),
  Object.freeze({ name: 'feca_31', type: 'date', required: true }),
  Object.freeze({ name: 'tipo_31', type: 'text', required: true }),
  Object.freeze({ name: 'lega_12', type: 'integer', required: true }),
  Object.freeze({ name: 'codi_27', type: 'integer', required: true }),
  Object.freeze({ name: 'cant_31', type: 'decimal', required: false }),
  Object.freeze({ name: 'impo_31', type: 'decimal', required: false }),
  Object.freeze({ name: 'codi_02', type: 'integer', required: false }),
  Object.freeze({ name: 'codi_06', type: 'integer', required: false }),
  Object.freeze({ name: 'codi_07', type: 'integer', required: false }),
]);

// These are adapters, not user-authored schemas. Adding another shape requires
// code review and a versioned key; the request can only select one exact entry.
export const GRH_MONTHLY_SOURCE_DEFINITIONS = Object.freeze({
  'grh-calculo-pipe-utf8.v1': Object.freeze({
    format: 'pipe',
    encoding: 'utf-8',
    delimiter: '|',
    header: true,
    fields: CALCULO_FIELDS,
  }),
  'grh-calculo-semicolon-windows1252.v1': Object.freeze({
    format: 'pipe',
    encoding: 'windows-1252',
    delimiter: ';',
    header: true,
    fields: CALCULO_FIELDS,
  }),
});

export class InternalGrhSourcePreviewApiError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'InternalGrhSourcePreviewApiError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new InternalGrhSourcePreviewApiError(code, status, message);
}

function setResponseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function send(res, status, payload) {
  setResponseHeaders(res);
  return res.status(status).json(payload);
}

function firstHeader(req, name) {
  const value = typeof req?.headers?.get === 'function'
    ? req.headers.get(name)
    : (req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()]);
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function productionLike(env) {
  return env?.NODE_ENV === 'production'
    || env?.VERCEL_ENV === 'production'
    || env?.VERCEL_ENV === 'preview';
}

function trustedOrigin(env) {
  const configured = String(env?.IDENTITY_APP_ORIGIN || env?.INTERNAL_APP_ORIGIN || '').trim();
  const candidate = configured || (env?.VERCEL_URL ? `https://${env.VERCEL_URL}` : '');
  if (!candidate) {
    if (productionLike(env)) {
      fail('GRH_SOURCE_PREVIEW_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
    }
    return '';
  }
  try {
    return new URL(candidate).origin;
  } catch {
    fail('GRH_SOURCE_PREVIEW_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
  }
}

function assertSameOrigin(req, env) {
  const fetchSite = firstHeader(req, 'sec-fetch-site').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    fail('GRH_SOURCE_PREVIEW_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const supplied = firstHeader(req, 'origin').trim();
  if (!supplied) {
    if (productionLike(env)) {
      fail('GRH_SOURCE_PREVIEW_ORIGIN_REQUIRED', 403, 'Origen de solicitud no permitido');
    }
    return;
  }
  let actual;
  try {
    actual = new URL(supplied).origin;
  } catch {
    fail('GRH_SOURCE_PREVIEW_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const expected = trustedOrigin(env);
  if (expected && actual !== expected) {
    fail('GRH_SOURCE_PREVIEW_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
}

function assertJson(req) {
  const mediaType = firstHeader(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail(
      'GRH_SOURCE_PREVIEW_CONTENT_TYPE_REQUIRED',
      415,
      'Content-Type debe ser application/json',
    );
  }
}

function assertDeclaredLength(req) {
  const raw = firstHeader(req, 'content-length').trim();
  if (!raw) return;
  if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) {
    fail('GRH_SOURCE_PREVIEW_CONTENT_LENGTH_INVALID', 400, 'Content-Length inválido');
  }
  if (Number(raw) > GRH_SOURCE_PREVIEW_API_MAX_BODY_BYTES) {
    fail('GRH_SOURCE_PREVIEW_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    fail('GRH_SOURCE_PREVIEW_JSON_INVALID', 400, 'JSON inválido');
  }
}

async function readJsonBody(req) {
  assertDeclaredLength(req);
  let value = req?.body;
  if (value === undefined && req && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > GRH_SOURCE_PREVIEW_API_MAX_BODY_BYTES) {
        fail('GRH_SOURCE_PREVIEW_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
      }
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(value)) {
    if (value.byteLength > GRH_SOURCE_PREVIEW_API_MAX_BODY_BYTES) {
      fail('GRH_SOURCE_PREVIEW_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
    }
    value = value.toString('utf8');
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > GRH_SOURCE_PREVIEW_API_MAX_BODY_BYTES) {
      fail('GRH_SOURCE_PREVIEW_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
    }
    value = parseJson(value);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('GRH_SOURCE_PREVIEW_BODY_INVALID', 400, 'El cuerpo JSON debe ser un objeto exacto');
  }
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    fail('GRH_SOURCE_PREVIEW_BODY_INVALID', 400, 'El cuerpo JSON debe ser un objeto exacto');
  }
  if (typeof encoded !== 'string'
      || Buffer.byteLength(encoded, 'utf8') > GRH_SOURCE_PREVIEW_API_MAX_BODY_BYTES) {
    fail('GRH_SOURCE_PREVIEW_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
  }
  if (Object.keys(value).some((key) => !BODY_KEYS.has(key))
      || Object.keys(value).length !== BODY_KEYS.size) {
    fail('GRH_SOURCE_PREVIEW_BODY_INVALID', 400, 'El cuerpo JSON contiene campos no permitidos');
  }
  return value;
}

function resolveDefinition(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!DEFINITION_KEY.test(key)
      || !Object.prototype.hasOwnProperty.call(GRH_MONTHLY_SOURCE_DEFINITIONS, key)) {
    fail('GRH_SOURCE_PREVIEW_DEFINITION_INVALID', 400, 'Definición de fuente no permitida');
  }
  return { key, definition: GRH_MONTHLY_SOURCE_DEFINITIONS[key] };
}

function decodeCanonicalBase64(value) {
  if (typeof value !== 'string' || value.length === 0) {
    fail('GRH_SOURCE_PREVIEW_CONTENT_INVALID', 400, 'El contenido base64 es obligatorio');
  }
  if (value.length > GRH_SOURCE_PREVIEW_API_MAX_BASE64_CHARS) {
    fail('GRH_SOURCE_PREVIEW_CONTENT_TOO_LARGE', 413, 'La fuente supera el límite permitido');
  }
  if (value.length % 4 !== 0 || !BASE64.test(value)) {
    fail('GRH_SOURCE_PREVIEW_CONTENT_INVALID', 400, 'El contenido base64 no es canónico');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength === 0 || bytes.toString('base64') !== value) {
    bytes.fill(0);
    fail('GRH_SOURCE_PREVIEW_CONTENT_INVALID', 400, 'El contenido base64 no es canónico');
  }
  if (bytes.byteLength > GRH_SOURCE_PREVIEW_API_MAX_BYTES
      || bytes.byteLength > GRH_SOURCE_PREVIEW_MAX_BYTES) {
    bytes.fill(0);
    fail('GRH_SOURCE_PREVIEW_CONTENT_TOO_LARGE', 413, 'La fuente supera el límite permitido');
  }
  return bytes;
}

function fingerprintKey(env) {
  const value = typeof env?.GRH_SOURCE_PREVIEW_HMAC_SECRET === 'string'
    ? env.GRH_SOURCE_PREVIEW_HMAC_SECRET : '';
  const key = Buffer.from(value, 'utf8');
  if (key.byteLength < 32 || key.byteLength > 1024) {
    key.fill(0);
    fail(
      'GRH_SOURCE_PREVIEW_HMAC_NOT_CONFIGURED',
      503,
      'Previsualización de fuente no configurada',
    );
  }
  return key;
}

function governedFingerprintContext(access, bootstrap, env) {
  const tenantId = String(access?.principal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(access?.principal?.tenant?.membershipId || '').trim().toLowerCase();
  const principal = bootstrap?.principal;
  const sourceBindingId = String(principal?.certifiedBindingId || '').trim().toLowerCase();
  const capabilities = principal?.capabilities;
  if (access?.mode !== 'managed'
      || access?.principal?.tenant?.source !== 'membership'
      || !UUID.test(tenantId)
      || !UUID.test(membershipId)
      || String(principal?.tenantId || '').trim().toLowerCase() !== tenantId
      || String(principal?.membershipId || '').trim().toLowerCase() !== membershipId
      || !UUID.test(sourceBindingId)
      || !(capabilities instanceof Set)
      || !capabilities.has('payroll.read')
      || !capabilities.has('lineage.read')
      || !capabilities.has('time.source.read')
  ) {
    fail(
      'GRH_SOURCE_PREVIEW_AUTHORITY_REQUIRED',
      403,
      'La membresía no tiene autoridad para previsualizar esta fuente',
    );
  }
  return Object.freeze({
    fingerprintKey: fingerprintKey(env),
    tenantId,
    sourceBindingId,
  });
}

export function aggregateGrhSourcePreview(preview, definitionKey) {
  const definition = GRH_MONTHLY_SOURCE_DEFINITIONS[definitionKey];
  const expectedEncoding = definition?.format === 'fixed_width' ? 'ascii' : definition?.encoding;
  const safeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
  const counts = [
    preview?.byteLength,
    preview?.recordCount,
    preview?.acceptedCount,
    preview?.rejectedRecordCount,
    preview?.structuralErrorCount,
    preview?.issueCount,
  ];
  const summaryEntries = preview?.rejectionSummary
    && typeof preview.rejectionSummary === 'object'
    && !Array.isArray(preview.rejectionSummary)
    ? Object.entries(preview.rejectionSummary) : null;
  const rejectionSummaryValid = summaryEntries !== null
    && summaryEntries.every(([key, count]) => /^[A-Z][A-Z0-9_]{1,127}$/.test(key)
      && safeInteger(count));
  const summaryCount = rejectionSummaryValid
    ? summaryEntries.reduce((total, [, count]) => total + count, 0) : -1;
  const expectedStatus = preview?.structuralErrorCount > 0
    ? 'invalid_structure' : preview?.issueCount > 0 ? 'has_rejections' : 'valid';
  if (!preview || typeof preview !== 'object' || !definition
      || preview.contractVersion !== GRH_SOURCE_PREVIEW_CONTRACT_VERSION
      || !PREVIEW_STATUSES.has(preview.status)
      || preview.status !== expectedStatus
      || preview.format !== definition.format
      || preview.encoding !== expectedEncoding
      || !HMAC_SHA256.test(preview.contentFingerprint)
      || !SHA256.test(preview.schemaSha256)
      || counts.some((value) => !safeInteger(value))
      || preview.byteLength < 1
      || preview.byteLength > GRH_SOURCE_PREVIEW_API_MAX_BYTES
      || preview.recordCount > 100_000
      || preview.acceptedCount + preview.rejectedRecordCount !== preview.recordCount
      || preview.structuralErrorCount > preview.issueCount
      || preview.schemaValid !== (preview.structuralErrorCount === 0)
      || typeof preview.rejectionsTruncated !== 'boolean'
      || preview.includesRecordValues !== false
      || preview.persistencePerformed !== false
      || !rejectionSummaryValid
      || summaryCount !== preview.issueCount) {
    fail(
      'GRH_SOURCE_PREVIEW_CONTRACT_DRIFT',
      503,
      'Previsualización de fuente no disponible',
    );
  }
  const rejectionSummary = Object.fromEntries(
    summaryEntries.sort(([left], [right]) => left.localeCompare(right)),
  );
  return Object.freeze({
    contractVersion: preview.contractVersion,
    definitionKey,
    status: preview.status,
    format: preview.format,
    encoding: preview.encoding,
    contentFingerprint: preview.contentFingerprint,
    schemaSha256: preview.schemaSha256,
    byteLength: preview.byteLength,
    recordCount: preview.recordCount,
    acceptedCount: preview.acceptedCount,
    rejectedRecordCount: preview.rejectedRecordCount,
    structuralErrorCount: preview.structuralErrorCount,
    issueCount: preview.issueCount,
    schemaValid: preview.schemaValid,
    rejectionSummary: Object.freeze(rejectionSummary),
    rejectionsTruncated: preview?.rejectionsTruncated === true,
    includesRecordValues: false,
    persistencePerformed: false,
  });
}

function mappedPreviewError(error) {
  if (!(error instanceof GrhSourcePreviewError)) return null;
  if (error.code === 'GRH_SOURCE_TOO_LARGE') {
    return new InternalGrhSourcePreviewApiError(
      'GRH_SOURCE_PREVIEW_CONTENT_TOO_LARGE', 413, 'La fuente supera el límite permitido',
    );
  }
  if (error.code === 'GRH_SOURCE_FINGERPRINT_KEY_INVALID'
      || error.code === 'GRH_SOURCE_FINGERPRINT_CONTEXT_INVALID') {
    return new InternalGrhSourcePreviewApiError(
      'GRH_SOURCE_PREVIEW_CONTEXT_INVALID', 503, 'Previsualización de fuente no disponible',
    );
  }
  return new InternalGrhSourcePreviewApiError(
    error.code, 422, 'La fuente no cumple el contrato de previsualización',
  );
}

export function createInternalGrhSourcePreviewHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const requireAccess = dependencies.requireCompatibleInternalAccess
    ?? requireCompatibleInternalAccess;
  const getSql = dependencies.getInternalSql ?? getActionCenterSql;
  const getBootstrap = dependencies.getTimeSourceBootstrap ?? getTimeSourceBootstrap;
  const previewSource = dependencies.previewGrhSource ?? previewGrhSource;

  return async function internalGrhSourcePreviewHandler(req, res) {
    const method = String(req?.method || '').toUpperCase();
    let sourceBytes = null;
    let contextKey = null;
    try {
      if (method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return send(res, 405, {
          ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido',
        });
      }
      assertSameOrigin(req, env);
      assertJson(req);
      assertDeclaredLength(req);

      // Authenticate and re-resolve the current certified source binding before
      // reading or decoding any source bytes.
      const access = await requireAccess(req, res, {
        env,
        requiredCapabilities: [...GRH_SOURCE_PREVIEW_REQUIRED_CAPABILITIES],
        requireDataPlaneReady: true,
        requireCertifiedDataBinding: true,
        allowLegacy: false,
        legacySessionOptions: dependencies.sessionOptions || {},
      });
      if (!access) return undefined;
      if (access.mode !== 'managed'
          || access.principal?.tenant?.source !== 'membership'
          || !access.principal?.tenant?.membershipId) {
        return send(res, 403, {
          ok: false,
          code: 'GRH_SOURCE_PREVIEW_TENANT_MEMBERSHIP_REQUIRED',
          error: 'La previsualización exige una membresía municipal activa',
        });
      }

      const session = actionMutationSession(access, env);
      const sql = await getSql(env);
      const bootstrap = await getBootstrap(sql, access.principal, session);
      const context = governedFingerprintContext(access, bootstrap, env);
      contextKey = context.fingerprintKey;

      const body = await readJsonBody(req);
      const { key: definitionKey, definition } = resolveDefinition(body.definitionKey);
      sourceBytes = decodeCanonicalBase64(body.contentBase64);
      const preview = previewSource(sourceBytes, definition, context);
      const aggregate = aggregateGrhSourcePreview(preview, definitionKey);

      return send(res, 200, {
        ok: true,
        data: aggregate,
        includesRecordValues: false,
        persistencePerformed: false,
      });
    } catch (error) {
      const safe = error instanceof InternalGrhSourcePreviewApiError
        ? error
        : error instanceof ActionCenterError
          ? new InternalGrhSourcePreviewApiError(error.code, error.status, error.message)
          : mappedPreviewError(error);
      if (safe) {
        return send(res, safe.status, { ok: false, code: safe.code, error: safe.message });
      }
      return send(res, 500, {
        ok: false,
        code: 'GRH_SOURCE_PREVIEW_INTERNAL_ERROR',
        error: 'No se pudo previsualizar la fuente',
      });
    } finally {
      if (sourceBytes) sourceBytes.fill(0);
      if (contextKey) contextKey.fill(0);
    }
  };
}

export default createInternalGrhSourcePreviewHandler();
