import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import {
  PAYROLL_REPROCESSING_MAX_BODY_BYTES,
  PayrollReprocessingError,
  getPayrollReprocessingBootstrap,
  listPayrollReprocessingCases,
  preparePayrollReprocessingCase,
  readPayrollReprocessingCase,
  transitionPayrollReprocessingCase,
} from '../lib/internal-payroll-reprocessing.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';

const POST_COMMANDS = new Set(['prepare', 'submit', 'approve', 'reject', 'cancel']);
const GET_RESOURCES = new Set(['bootstrap', 'list', 'detail']);
const TOP_LEVEL_KEYS = new Set(['command', 'payload']);
const SAFE_LIBRARY_MESSAGES = Object.freeze({
  PAYROLL_REPROCESSING_IDEMPOTENCY_REUSE: 'La clave de idempotencia ya fue usada',
  PAYROLL_REPROCESSING_DUPLICATE_CASE: 'Ya existe un expediente activo para esa corrida',
  PAYROLL_REPROCESSING_VERSION_CONFLICT: 'El expediente fue modificado por otra persona',
  PAYROLL_REPROCESSING_MAKER_CHECKER_REQUIRED: 'La persona que preparó el expediente no puede decidirlo',
  PAYROLL_REPROCESSING_RUN_NOT_ELIGIBLE: 'La corrida GRH no está cerrada o no pertenece al origen certificado',
  PAYROLL_REPROCESSING_PREPARE_INVALID: 'El expediente no cumple el contrato vigente',
  PAYROLL_REPROCESSING_LIST_INVALID: 'Filtros de expedientes inválidos',
  PAYROLL_REPROCESSING_DETAIL_INVALID: 'El expediente no es válido',
  PAYROLL_REPROCESSING_TRANSITION_INVALID: 'La transición no está permitida',
  PAYROLL_REPROCESSING_PREPARER_REQUIRED: 'Sólo quien preparó el expediente puede enviarlo o cancelarlo',
  PAYROLL_REPROCESSING_CAPABILITY_REQUIRED: 'No posee la capacidad requerida',
  PAYROLL_REPROCESSING_EMPLOYMENT_REQUIRED: 'La decisión exige un vínculo laboral vigente',
  PAYROLL_REPROCESSING_NOT_FOUND: 'Expediente no encontrado',
  PAYROLL_REPROCESSING_SESSION_BUSY: 'El acceso se está actualizando; reintentá en un momento',
  PAYROLL_REPROCESSING_SESSION_INVALID: 'La sesión operativa ya no es válida',
  PAYROLL_REPROCESSING_RELEASE_NOT_CERTIFIED: 'La versión desplegada no está certificada',
  PAYROLL_REPROCESSING_BINDING_REQUIRED: 'El binding GRH certificado no está disponible',
  PAYROLL_REPROCESSING_CONTRACT_DRIFT: 'El contrato de anulación/reliquidación no es seguro',
  TENANT_IAM_SOD_CONFLICT: 'La membresía combina capacidades incompatibles',
});

export class InternalPayrollReprocessingApiError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'InternalPayrollReprocessingApiError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new InternalPayrollReprocessingApiError(code, status, message);
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
        'PAYROLL_REPROCESSING_ORIGIN_NOT_CONFIGURED',
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
      'PAYROLL_REPROCESSING_ORIGIN_NOT_CONFIGURED',
      503,
      'Origen canónico no configurado',
    );
  }
}

function assertSameOrigin(req, env) {
  const fetchSite = firstHeader(req, 'sec-fetch-site').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    fail('PAYROLL_REPROCESSING_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const supplied = firstHeader(req, 'origin').trim();
  if (!supplied) {
    if (productionLike(env)) {
      fail('PAYROLL_REPROCESSING_ORIGIN_REQUIRED', 403, 'Origen de solicitud no permitido');
    }
    return;
  }
  let actual;
  try {
    actual = new URL(supplied).origin;
  } catch {
    fail('PAYROLL_REPROCESSING_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const expected = trustedOrigin(env);
  if (expected && actual !== expected) {
    fail('PAYROLL_REPROCESSING_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
}

function assertJson(req) {
  const mediaType = firstHeader(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail(
      'PAYROLL_REPROCESSING_CONTENT_TYPE_REQUIRED',
      415,
      'Content-Type debe ser application/json',
    );
  }
}

function assertDeclaredLength(req) {
  const value = firstHeader(req, 'content-length').trim();
  if (!value) return;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail('PAYROLL_REPROCESSING_CONTENT_LENGTH_INVALID', 400, 'Content-Length inválido');
  }
  if (Number(value) > PAYROLL_REPROCESSING_MAX_BODY_BYTES) {
    fail('PAYROLL_REPROCESSING_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    fail('PAYROLL_REPROCESSING_JSON_INVALID', 400, 'JSON inválido');
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
      if (size > PAYROLL_REPROCESSING_MAX_BODY_BYTES) {
        fail('PAYROLL_REPROCESSING_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
      }
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') value = parseJson(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('PAYROLL_REPROCESSING_BODY_INVALID', 400, 'El cuerpo JSON debe ser un objeto exacto');
  }
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    fail('PAYROLL_REPROCESSING_BODY_INVALID', 400, 'El cuerpo JSON debe ser un objeto exacto');
  }
  if (Buffer.byteLength(encoded, 'utf8') > PAYROLL_REPROCESSING_MAX_BODY_BYTES) {
    fail('PAYROLL_REPROCESSING_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
  }
  if (Object.keys(value).length !== TOP_LEVEL_KEYS.size
      || Object.keys(value).some((key) => !TOP_LEVEL_KEYS.has(key))
      || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
    fail('PAYROLL_REPROCESSING_BODY_INVALID', 400, 'El cuerpo JSON contiene campos no permitidos');
  }
  return value;
}

function queryValue(req, name, fallback = '') {
  const value = req?.query?.[name];
  return Array.isArray(value) ? String(value[0] ?? fallback) : String(value ?? fallback);
}

function assertQueryKeys(req, allowed) {
  if (Object.keys(req?.query || {}).some((key) => !allowed.has(key))) {
    fail('PAYROLL_REPROCESSING_QUERY_INVALID', 400, 'La consulta contiene parámetros no permitidos');
  }
}

function idempotencyKey(req) {
  const value = firstHeader(req, 'idempotency-key').trim();
  if (!value) {
    fail(
      'PAYROLL_REPROCESSING_IDEMPOTENCY_KEY_REQUIRED',
      428,
      'Idempotency-Key es obligatorio',
    );
  }
  return value;
}

function safeError(error) {
  if (error instanceof InternalPayrollReprocessingApiError) return error;
  if (error instanceof PayrollReprocessingError) {
    return new InternalPayrollReprocessingApiError(
      error.code,
      error.status,
      SAFE_LIBRARY_MESSAGES[error.code] || error.message,
    );
  }
  if (SAFE_LIBRARY_MESSAGES[error?.code] && Number.isInteger(error?.status)) {
    return new InternalPayrollReprocessingApiError(
      error.code,
      error.status,
      SAFE_LIBRARY_MESSAGES[error.code],
    );
  }
  if (error?.code === 'ACTION_SESSION_INVALID') {
    return new InternalPayrollReprocessingApiError(
      'PAYROLL_REPROCESSING_SESSION_INVALID', 401, 'La sesión operativa ya no es válida',
    );
  }
  if (error?.code === 'ACTION_RELEASE_NOT_CERTIFIED') {
    return new InternalPayrollReprocessingApiError(
      'PAYROLL_REPROCESSING_RELEASE_NOT_CERTIFIED',
      503,
      'La versión desplegada no está certificada',
    );
  }
  if (error?.code === 'ACTION_DATABASE_ROLE_REQUIRED') {
    return new InternalPayrollReprocessingApiError(
      'PAYROLL_REPROCESSING_DATABASE_ROLE_REQUIRED',
      503,
      'El rol aislado de nómina no está configurado',
    );
  }
  return null;
}

export function createInternalPayrollReprocessingHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const requireAccess = dependencies.requireCompatibleInternalAccess
    ?? requireCompatibleInternalAccess;
  const getSql = dependencies.getInternalSql ?? getActionCenterSql;
  const bootstrap = dependencies.getPayrollReprocessingBootstrap
    ?? getPayrollReprocessingBootstrap;
  const list = dependencies.listPayrollReprocessingCases ?? listPayrollReprocessingCases;
  const detail = dependencies.readPayrollReprocessingCase ?? readPayrollReprocessingCase;
  const prepare = dependencies.preparePayrollReprocessingCase
    ?? preparePayrollReprocessingCase;
  const transition = dependencies.transitionPayrollReprocessingCase
    ?? transitionPayrollReprocessingCase;

  return async function internalPayrollReprocessingHandler(req, res) {
    const method = String(req?.method || 'GET').toUpperCase();
    try {
      if (!['GET', 'POST'].includes(method)) {
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, {
          ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido',
        });
      }
      if (method === 'POST') {
        assertSameOrigin(req, env);
        assertJson(req);
      }

      const access = await requireAccess(req, res, {
        env,
        requiredCapabilities: ['payroll.reprocessing.read'],
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
          code: 'PAYROLL_REPROCESSING_TENANT_MEMBERSHIP_REQUIRED',
          error: 'Anulación y reliquidación exige una membresía municipal activa',
        });
      }

      const session = actionMutationSession(access, env);
      const body = method === 'POST' ? await readBody(req) : null;
      if (body && (typeof body.command !== 'string' || !POST_COMMANDS.has(body.command))) {
        fail('PAYROLL_REPROCESSING_COMMAND_INVALID', 400, 'Comando no permitido');
      }
      const sql = await getSql(env);

      if (method === 'GET') {
        const resource = queryValue(req, 'resource', 'bootstrap').trim().toLowerCase();
        if (!GET_RESOURCES.has(resource)) {
          fail('PAYROLL_REPROCESSING_RESOURCE_INVALID', 400, 'resource no soportado');
        }
        if (resource === 'bootstrap') {
          assertQueryKeys(req, new Set(['resource']));
          return send(res, 200, { ok: true, ...await bootstrap(sql, access.principal, session) });
        }
        if (resource === 'list') {
          assertQueryKeys(req, new Set(['resource', 'status', 'page', 'limit']));
          const result = await list(sql, access.principal, session, {
            status: queryValue(req, 'status', 'all'),
            page: queryValue(req, 'page', '1'),
            limit: queryValue(req, 'limit', '20'),
          });
          return send(res, 200, { ok: true, ...result });
        }
        assertQueryKeys(req, new Set(['resource', 'id']));
        return send(res, 200, {
          ok: true,
          ...await detail(sql, access.principal, session, queryValue(req, 'id')),
        });
      }

      const key = idempotencyKey(req);
      const result = body.command === 'prepare'
        ? await prepare(sql, access.principal, session, body.payload, key)
        : await transition(sql, access.principal, session, body.command, body.payload, key);
      if (result?.replayed === true) res.setHeader('Idempotency-Replayed', 'true');
      return send(res, body.command === 'prepare' ? 201 : 200, {
        ok: true,
        replayed: result?.replayed === true,
        data: result?.data ?? result,
      });
    } catch (error) {
      const safe = safeError(error);
      if (safe) {
        if (safe.code === 'PAYROLL_REPROCESSING_SESSION_BUSY') res.setHeader('Retry-After', '1');
        return send(res, safe.status, { ok: false, code: safe.code, error: safe.message });
      }
      console.error('internal-payroll-reprocessing failed', {
        name: error?.name,
        code: typeof error?.code === 'string' ? error.code : undefined,
      });
      return send(res, 503, {
        ok: false,
        code: 'PAYROLL_REPROCESSING_UNAVAILABLE',
        error: 'Anulación y reliquidación temporalmente no disponibles',
      });
    }
  };
}

export default createInternalPayrollReprocessingHandler();
