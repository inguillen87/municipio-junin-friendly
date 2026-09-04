import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import {
  PAYROLL_CONTROL_IMPORT_DEFINITION,
  PAYROLL_CONTROL_IMPORT_MAX_BYTES,
  PayrollControlImportError,
  getPayrollControlImportBootstrap,
  listPayrollControlImports,
  persistPayrollControlImport,
  preparePayrollControlImport,
  readPayrollControlImport,
  transitionPayrollControlImport,
} from '../lib/internal-payroll-control-import.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';

export const PAYROLL_CONTROL_IMPORT_API_MAX_BASE64_CHARS =
  Math.ceil(PAYROLL_CONTROL_IMPORT_MAX_BYTES / 3) * 4;
export const PAYROLL_CONTROL_IMPORT_API_MAX_BODY_BYTES =
  PAYROLL_CONTROL_IMPORT_API_MAX_BASE64_CHARS + 2048;
export const PAYROLL_CONTROL_IMPORT_REQUIRED_CAPABILITY =
  'payroll.control_import.read';

const POST_COMMANDS = new Set(['prepare', 'submit', 'approve', 'reject', 'cancel']);
const GET_RESOURCES = new Set(['bootstrap', 'list', 'detail']);
const TOP_LEVEL_KEYS = new Set(['command', 'payload']);
const PREPARE_KEYS = new Set([
  'sourceKind', 'period', 'jurisdiction', 'definitionKey', 'contentBase64',
]);
const TRANSITION_KEYS = new Set([
  'batchId', 'expectedVersion', 'reasonCode', 'reasonReference',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const COMMAND_CAPABILITY = Object.freeze({
  prepare: 'payroll.control_import.prepare',
  submit: 'payroll.control_import.prepare',
  approve: 'payroll.control_import.validate',
  reject: 'payroll.control_import.validate',
  cancel: 'payroll.control_import.prepare',
});

export class InternalPayrollControlImportApiError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'InternalPayrollControlImportApiError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new InternalPayrollControlImportApiError(code, status, message);
}

function setHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function send(res, status, payload) {
  setHeaders(res);
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
      fail(
        'PAYROLL_CONTROL_IMPORT_ORIGIN_NOT_CONFIGURED',
        503,
        'Origen canónico no configurado',
      );
    }
    return '';
  }
  try {
    return new URL(candidate).origin;
  } catch {
    fail(
      'PAYROLL_CONTROL_IMPORT_ORIGIN_NOT_CONFIGURED',
      503,
      'Origen canónico no configurado',
    );
  }
}

function assertSameOrigin(req, env) {
  const fetchSite = firstHeader(req, 'sec-fetch-site').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_ORIGIN_INVALID',
      403,
      'Origen de solicitud no permitido',
    );
  }
  const supplied = firstHeader(req, 'origin').trim();
  if (!supplied) {
    if (productionLike(env)) {
      fail(
        'PAYROLL_CONTROL_IMPORT_ORIGIN_REQUIRED',
        403,
        'Origen de solicitud no permitido',
      );
    }
    return;
  }
  let actual;
  try {
    actual = new URL(supplied).origin;
  } catch {
    fail(
      'PAYROLL_CONTROL_IMPORT_ORIGIN_INVALID',
      403,
      'Origen de solicitud no permitido',
    );
  }
  const expected = trustedOrigin(env);
  if (expected && actual !== expected) {
    fail(
      'PAYROLL_CONTROL_IMPORT_ORIGIN_INVALID',
      403,
      'Origen de solicitud no permitido',
    );
  }
}

function assertJson(req) {
  const mediaType = firstHeader(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTENT_TYPE_REQUIRED',
      415,
      'Content-Type debe ser application/json',
    );
  }
}

function assertDeclaredLength(req) {
  const value = firstHeader(req, 'content-length').trim();
  if (!value) return;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTENT_LENGTH_INVALID',
      400,
      'Content-Length inválido',
    );
  }
  if (Number(value) > PAYROLL_CONTROL_IMPORT_API_MAX_BODY_BYTES) {
    fail(
      'PAYROLL_CONTROL_IMPORT_BODY_TOO_LARGE',
      413,
      'El cuerpo supera el límite permitido',
    );
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    fail('PAYROLL_CONTROL_IMPORT_JSON_INVALID', 400, 'JSON inválido');
  }
}

async function readBody(req) {
  assertDeclaredLength(req);
  let value = req?.body;
  if (value === undefined && req && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > PAYROLL_CONTROL_IMPORT_API_MAX_BODY_BYTES) {
        fail(
          'PAYROLL_CONTROL_IMPORT_BODY_TOO_LARGE',
          413,
          'El cuerpo supera el límite permitido',
        );
      }
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(value)) {
    if (value.byteLength > PAYROLL_CONTROL_IMPORT_API_MAX_BODY_BYTES) {
      fail(
        'PAYROLL_CONTROL_IMPORT_BODY_TOO_LARGE',
        413,
        'El cuerpo supera el límite permitido',
      );
    }
    value = value.toString('utf8');
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > PAYROLL_CONTROL_IMPORT_API_MAX_BODY_BYTES) {
      fail(
        'PAYROLL_CONTROL_IMPORT_BODY_TOO_LARGE',
        413,
        'El cuerpo supera el límite permitido',
      );
    }
    value = parseJson(value);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_BODY_INVALID',
      400,
      'El cuerpo JSON debe ser un objeto exacto',
    );
  }
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    fail(
      'PAYROLL_CONTROL_IMPORT_BODY_INVALID',
      400,
      'El cuerpo JSON debe ser un objeto exacto',
    );
  }
  if (typeof encoded !== 'string'
      || Buffer.byteLength(encoded, 'utf8') > PAYROLL_CONTROL_IMPORT_API_MAX_BODY_BYTES) {
    fail(
      'PAYROLL_CONTROL_IMPORT_BODY_TOO_LARGE',
      413,
      'El cuerpo supera el límite permitido',
    );
  }
  if (Object.keys(value).length !== TOP_LEVEL_KEYS.size
      || Object.keys(value).some((key) => !TOP_LEVEL_KEYS.has(key))
      || typeof value.command !== 'string'
      || !POST_COMMANDS.has(value.command)
      || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_BODY_INVALID',
      400,
      'El cuerpo JSON contiene campos no permitidos',
    );
  }
  const expectedKeys = value.command === 'prepare' ? PREPARE_KEYS : TRANSITION_KEYS;
  if (Object.keys(value.payload).length !== expectedKeys.size
      || Object.keys(value.payload).some((key) => !expectedKeys.has(key))) {
    fail(
      'PAYROLL_CONTROL_IMPORT_PAYLOAD_INVALID',
      400,
      'El payload no coincide con el comando',
    );
  }
  return value;
}

function queryValue(req, name, fallback = '') {
  const value = req?.query?.[name];
  return Array.isArray(value) ? String(value[0] ?? fallback) : String(value ?? fallback);
}

function assertQueryKeys(req, allowed) {
  if (Object.keys(req?.query || {}).some((key) => !allowed.has(key))) {
    fail(
      'PAYROLL_CONTROL_IMPORT_QUERY_INVALID',
      400,
      'La consulta contiene parámetros no permitidos',
    );
  }
}

function idempotencyKey(req) {
  const value = firstHeader(req, 'idempotency-key').trim();
  if (!value) {
    fail(
      'PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_KEY_REQUIRED',
      428,
      'Idempotency-Key es obligatorio',
    );
  }
  return value;
}

function decodeCanonicalBase64(value) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTENT_INVALID',
      400,
      'El contenido base64 es obligatorio',
    );
  }
  if (value.length > PAYROLL_CONTROL_IMPORT_API_MAX_BASE64_CHARS) {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTENT_TOO_LARGE',
      413,
      'La fuente supera el límite permitido',
    );
  }
  if (value.length % 4 !== 0 || !BASE64.test(value)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTENT_INVALID',
      400,
      'El contenido base64 no es canónico',
    );
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength === 0 || bytes.toString('base64') !== value) {
    bytes.fill(0);
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTENT_INVALID',
      400,
      'El contenido base64 no es canónico',
    );
  }
  if (bytes.byteLength > PAYROLL_CONTROL_IMPORT_MAX_BYTES) {
    bytes.fill(0);
    fail(
      'PAYROLL_CONTROL_IMPORT_CONTENT_TOO_LARGE',
      413,
      'La fuente supera el límite permitido',
    );
  }
  return bytes;
}

function fingerprintKey(env) {
  const value = typeof env?.PAYROLL_CONTROL_IMPORT_HMAC_SECRET === 'string'
    ? env.PAYROLL_CONTROL_IMPORT_HMAC_SECRET : '';
  const key = Buffer.from(value, 'utf8');
  if (key.byteLength < 32 || key.byteLength > 1024) {
    key.fill(0);
    fail(
      'PAYROLL_CONTROL_IMPORT_HMAC_NOT_CONFIGURED',
      503,
      'Importación de controles de cierre no configurada',
    );
  }
  return key;
}

function governedContext(access, bootstrap, session, key) {
  const tenantId = String(access?.principal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(access?.principal?.tenant?.membershipId || '').trim().toLowerCase();
  const principal = bootstrap?.principal;
  const sourceBindingId = String(principal?.certifiedBindingId || '').trim().toLowerCase();
  const capabilities = principal?.capabilities;
  if (access?.mode !== 'managed'
      || access?.principal?.tenant?.source !== 'membership'
      || !UUID.test(tenantId) || !UUID.test(membershipId) || !UUID.test(sourceBindingId)
      || String(principal?.tenantId || '').trim().toLowerCase() !== tenantId
      || String(principal?.membershipId || '').trim().toLowerCase() !== membershipId
      || !Array.isArray(capabilities)
      || !capabilities.includes(PAYROLL_CONTROL_IMPORT_REQUIRED_CAPABILITY)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_AUTHORITY_REQUIRED',
      403,
      'La membresía no tiene autoridad para operar controles de cierre',
    );
  }
  return Object.freeze({
    tenantId,
    sourceBindingId,
    releaseSha: session.releaseSha,
    fingerprintKey: key,
  });
}

function assertCommandAuthority(bootstrap, command) {
  const capability = COMMAND_CAPABILITY[command];
  const capabilities = bootstrap?.principal?.capabilities;
  if (!capability || !Array.isArray(capabilities) || !capabilities.includes(capability)) {
    fail(
      'PAYROLL_CONTROL_IMPORT_CAPABILITY_REQUIRED',
      403,
      'No posee la capacidad requerida',
    );
  }
}

function safeError(error) {
  if (error instanceof InternalPayrollControlImportApiError) return error;
  if (error instanceof PayrollControlImportError) {
    return new InternalPayrollControlImportApiError(error.code, error.status, error.message);
  }
  if (error?.code === 'ACTION_SESSION_INVALID') {
    return new InternalPayrollControlImportApiError(
      'PAYROLL_CONTROL_IMPORT_SESSION_INVALID',
      401,
      'La sesión operativa ya no es válida',
    );
  }
  if (error?.code === 'ACTION_RELEASE_NOT_CERTIFIED') {
    return new InternalPayrollControlImportApiError(
      'PAYROLL_CONTROL_IMPORT_RELEASE_NOT_CERTIFIED',
      503,
      'El contrato de datos activo no está certificado',
    );
  }
  if (error?.code === 'ACTION_DATABASE_ROLE_REQUIRED') {
    return new InternalPayrollControlImportApiError(
      'PAYROLL_CONTROL_IMPORT_DATABASE_ROLE_REQUIRED',
      503,
      'El rol aislado de controles de cierre no está configurado',
    );
  }
  if (error?.code === 'INTERNAL_AUTH_NOT_CONFIGURED') {
    return new InternalPayrollControlImportApiError(
      'PAYROLL_CONTROL_IMPORT_NOT_CONFIGURED',
      503,
      'Importación de controles de cierre no configurada',
    );
  }
  return null;
}

export function createInternalPayrollControlImportHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const requireAccess = dependencies.requireCompatibleInternalAccess
    ?? requireCompatibleInternalAccess;
  const getSql = dependencies.getInternalSql ?? getActionCenterSql;
  const getBootstrap = dependencies.getPayrollControlImportBootstrap
    ?? getPayrollControlImportBootstrap;
  const list = dependencies.listPayrollControlImports ?? listPayrollControlImports;
  const detail = dependencies.readPayrollControlImport ?? readPayrollControlImport;
  const prepareSource = dependencies.preparePayrollControlImport
    ?? preparePayrollControlImport;
  const persist = dependencies.persistPayrollControlImport
    ?? persistPayrollControlImport;
  const transition = dependencies.transitionPayrollControlImport
    ?? transitionPayrollControlImport;

  return async function internalPayrollControlImportHandler(req, res) {
    const method = String(req?.method || 'GET').toUpperCase();
    let sourceBytes = null;
    let contextKey = null;
    try {
      if (!['GET', 'POST'].includes(method)) {
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, {
          ok: false,
          code: 'METHOD_NOT_ALLOWED',
          error: 'Método no permitido',
        });
      }
      if (method === 'POST') {
        assertSameOrigin(req, env);
        assertJson(req);
        assertDeclaredLength(req);
      }

      const access = await requireAccess(req, res, {
        env,
        requiredCapabilities: [PAYROLL_CONTROL_IMPORT_REQUIRED_CAPABILITY],
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
          code: 'PAYROLL_CONTROL_IMPORT_TENANT_MEMBERSHIP_REQUIRED',
          error: 'El control de cierre exige una membresía municipal activa',
        });
      }

      const session = actionMutationSession(access, env);
      let resource = null;
      if (method === 'GET') {
        resource = queryValue(req, 'resource', 'bootstrap').trim().toLowerCase();
        if (!GET_RESOURCES.has(resource)) {
          fail('PAYROLL_CONTROL_IMPORT_RESOURCE_INVALID', 400, 'resource no soportado');
        }
        assertQueryKeys(
          req,
          resource === 'detail' ? new Set(['resource', 'id']) : new Set(['resource']),
        );
      }
      const sql = await getSql(env);
      const bootstrap = await getBootstrap(sql, access.principal, session);

      if (method === 'GET') {
        if (resource === 'bootstrap') {
          return send(res, 200, { ok: true, data: bootstrap });
        }
        if (resource === 'list') {
          return send(res, 200, { ok: true, data: list(bootstrap) });
        }
        const result = detail(bootstrap, queryValue(req, 'id'));
        return send(res, 200, { ok: true, data: result });
      }

      const body = await readBody(req);
      assertCommandAuthority(bootstrap, body.command);
      const key = idempotencyKey(req);
      let result;
      if (body.command === 'prepare') {
        contextKey = fingerprintKey(env);
        const context = governedContext(access, bootstrap, session, contextKey);
        sourceBytes = decodeCanonicalBase64(body.payload.contentBase64);
        const prepared = prepareSource({
          sourceKind: body.payload.sourceKind,
          period: body.payload.period,
          jurisdiction: body.payload.jurisdiction,
          definitionKey: body.payload.definitionKey,
          bytes: sourceBytes,
          context,
        });
        result = await persist(
          sql,
          access.principal,
          session,
          prepared,
          key,
          context.sourceBindingId,
        );
      } else {
        result = await transition(
          sql,
          access.principal,
          session,
          body.command,
          body.payload,
          key,
        );
      }
      if (result?.replayed === true) res.setHeader('Idempotency-Replayed', 'true');
      return send(res, body.command === 'prepare' ? 201 : 200, {
        ok: true,
        replayed: result?.replayed === true,
        data: result?.data ?? result,
      });
    } catch (error) {
      const safe = safeError(error);
      if (safe) {
        if (safe.code === 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY') {
          res.setHeader('Retry-After', '1');
        }
        return send(res, safe.status, {
          ok: false,
          code: safe.code,
          error: safe.message,
        });
      }
      console.error('internal-payroll-control-import failed', {
        name: error?.name,
        code: typeof error?.code === 'string' ? error.code : undefined,
      });
      return send(res, 503, {
        ok: false,
        code: 'PAYROLL_CONTROL_IMPORT_UNAVAILABLE',
        error: 'Controles de cierre temporalmente no disponibles',
      });
    } finally {
      if (sourceBytes) sourceBytes.fill(0);
      if (contextKey) contextKey.fill(0);
    }
  };
}

export default createInternalPayrollControlImportHandler();
