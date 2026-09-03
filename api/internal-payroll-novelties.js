import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import {
  PAYROLL_NOVELTY_MAX_BODY_BYTES,
  PayrollNoveltyError,
  exportPayrollNovelty,
  getPayrollNoveltyBootstrap,
  preparePayrollNovelty,
  readPayrollNovelty,
  transitionPayrollNovelty,
} from '../lib/internal-payroll-novelty.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';

const POST_COMMANDS = new Set(['prepare', 'submit', 'approve', 'reject', 'cancel']);
const MUTATION_METHODS = new Set(['POST']);
const TOP_LEVEL_KEYS = new Set(['command', 'payload']);
const GET_RESOURCES = new Set(['bootstrap', 'detail', 'export']);
const SAFE_LIBRARY_MESSAGES = Object.freeze({
  PAYROLL_NOVELTY_LEGAJO_NOT_FOUND: 'Un legajo no tiene un contrato GRH activo y único',
  PAYROLL_NOVELTY_CONCEPT_INVALID: 'Un concepto no pertenece al contrato de nómina vigente',
  PAYROLL_NOVELTY_DUPLICATE_ROW: 'El lote contiene novedades duplicadas',
  PAYROLL_NOVELTY_VALIDATION_REQUIRED: 'El lote contiene observaciones que impiden enviarlo',
  PAYROLL_NOVELTY_BLOCKING_ISSUES: 'El lote contiene validaciones bloqueantes',
  PAYROLL_NOVELTY_PREPARE_INVALID: 'El lote no cumple el contrato de novedades',
  PAYROLL_NOVELTY_CONTRACT_OUT_OF_BINDING: 'Un legajo no pertenece al binding GRH certificado',
  PAYROLL_NOVELTY_ADJUSTMENT_AFTER_PERIOD: 'El mes de ajuste supera el período de liquidación',
  PAYROLL_NOVELTY_IDEMPOTENCY_REUSE: 'La clave de idempotencia ya fue usada',
  PAYROLL_NOVELTY_DUPLICATE_BATCH: 'Ya existe un lote activo con las mismas novedades para ese período',
  PAYROLL_NOVELTY_VERSION_CONFLICT: 'El lote fue modificado por otra persona',
  PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED: 'La persona que preparó el lote no puede aprobarlo',
  PAYROLL_NOVELTY_CAPABILITY_REQUIRED: 'No posee la capacidad requerida',
  PAYROLL_NOVELTY_EMPLOYMENT_REQUIRED: 'La operación exige un vínculo laboral vigente',
  PAYROLL_NOVELTY_AUTHORITY_REQUIRED: 'La membresía no tiene autoridad operativa',
  PAYROLL_NOVELTY_NOT_FOUND: 'Lote de novedades no encontrado',
  PAYROLL_NOVELTY_NOT_EXPORTABLE: 'El lote todavía no está aprobado para exportar',
  PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED: 'La exportación exige acceso nominal explícito',
  PAYROLL_NOVELTY_SESSION_BUSY: 'El acceso se está actualizando; reintentá en un momento',
  PAYROLL_NOVELTY_SESSION_INVALID: 'La sesión operativa ya no es válida',
  PAYROLL_NOVELTY_RELEASE_NOT_CERTIFIED: 'La versión desplegada no está certificada',
  PAYROLL_NOVELTY_BINDING_REQUIRED: 'El binding GRH certificado no está disponible',
  TENANT_IAM_SOD_CONFLICT: 'La membresía combina capacidades incompatibles',
});

export class InternalPayrollNoveltiesApiError extends Error {
  constructor(code, status, message, details) {
    super(message);
    this.name = 'InternalPayrollNoveltiesApiError';
    this.code = code;
    this.status = status;
    if (details !== undefined) this.details = details;
  }
}

function fail(code, status, message, details) {
  throw new InternalPayrollNoveltiesApiError(code, status, message, details);
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
      fail('PAYROLL_NOVELTY_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
    }
    return '';
  }
  try {
    return new URL(candidate).origin;
  } catch {
    fail('PAYROLL_NOVELTY_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
  }
}

function assertSameOrigin(req, env) {
  const fetchSite = firstHeader(req, 'sec-fetch-site').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    fail('PAYROLL_NOVELTY_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const supplied = firstHeader(req, 'origin').trim();
  if (!supplied) {
    if (productionLike(env)) {
      fail('PAYROLL_NOVELTY_ORIGIN_REQUIRED', 403, 'Origen de solicitud no permitido');
    }
    return;
  }
  let actual;
  try {
    actual = new URL(supplied).origin;
  } catch {
    fail('PAYROLL_NOVELTY_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const expected = trustedOrigin(env);
  if (expected && actual !== expected) {
    fail('PAYROLL_NOVELTY_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
}

function assertJson(req) {
  const mediaType = firstHeader(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail('PAYROLL_NOVELTY_CONTENT_TYPE_REQUIRED', 415, 'Content-Type debe ser application/json');
  }
}

function assertDeclaredLength(req) {
  const value = firstHeader(req, 'content-length').trim();
  if (!value) return;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail('PAYROLL_NOVELTY_CONTENT_LENGTH_INVALID', 400, 'Content-Length inválido');
  }
  if (Number(value) > PAYROLL_NOVELTY_MAX_BODY_BYTES) {
    fail('PAYROLL_NOVELTY_BODY_TOO_LARGE', 413, 'El cuerpo supera 512 KiB');
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    fail('PAYROLL_NOVELTY_JSON_INVALID', 400, 'JSON inválido');
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
      if (size > PAYROLL_NOVELTY_MAX_BODY_BYTES) {
        fail('PAYROLL_NOVELTY_BODY_TOO_LARGE', 413, 'El cuerpo supera 512 KiB');
      }
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(value)) {
    if (value.byteLength > PAYROLL_NOVELTY_MAX_BODY_BYTES) {
      fail('PAYROLL_NOVELTY_BODY_TOO_LARGE', 413, 'El cuerpo supera 512 KiB');
    }
    value = value.toString('utf8');
  }
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > PAYROLL_NOVELTY_MAX_BODY_BYTES) {
      fail('PAYROLL_NOVELTY_BODY_TOO_LARGE', 413, 'El cuerpo supera 512 KiB');
    }
    value = parseJson(value);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('PAYROLL_NOVELTY_BODY_INVALID', 400, 'El cuerpo JSON debe ser un objeto exacto');
  }
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    fail('PAYROLL_NOVELTY_BODY_INVALID', 400, 'El cuerpo JSON debe ser un objeto exacto');
  }
  if (Buffer.byteLength(encoded, 'utf8') > PAYROLL_NOVELTY_MAX_BODY_BYTES) {
    fail('PAYROLL_NOVELTY_BODY_TOO_LARGE', 413, 'El cuerpo supera 512 KiB');
  }
  if (Object.keys(value).length !== TOP_LEVEL_KEYS.size
      || Object.keys(value).some((key) => !TOP_LEVEL_KEYS.has(key))
      || !value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
    fail('PAYROLL_NOVELTY_BODY_INVALID', 400, 'El cuerpo JSON contiene campos no permitidos');
  }
  return value;
}

function queryValue(req, name, fallback = '') {
  const value = req?.query?.[name];
  return Array.isArray(value) ? String(value[0] ?? fallback) : String(value ?? fallback);
}

function assertQueryKeys(req, allowed) {
  const keys = Object.keys(req?.query || {});
  if (keys.some((key) => !allowed.has(key))) {
    fail('PAYROLL_NOVELTY_QUERY_INVALID', 400, 'La consulta contiene parámetros no permitidos');
  }
}

function idempotencyKey(req) {
  const value = firstHeader(req, 'idempotency-key').trim();
  if (!value) {
    fail('PAYROLL_NOVELTY_IDEMPOTENCY_KEY_REQUIRED', 428, 'Idempotency-Key es obligatorio');
  }
  return value;
}

function safeError(error) {
  if (error instanceof InternalPayrollNoveltiesApiError) return error;
  if (error instanceof PayrollNoveltyError) {
    const safeMessage = SAFE_LIBRARY_MESSAGES[error.code] || error.message;
    const safeDetails = Number.isSafeInteger(error.details?.rowOrdinal)
      ? {
        rowOrdinal: error.details.rowOrdinal,
        ...(Number.isSafeInteger(error.details?.duplicateOf)
          ? { duplicateOf: error.details.duplicateOf } : {}),
      }
      : undefined;
    return new InternalPayrollNoveltiesApiError(
      error.code, error.status, safeMessage, safeDetails,
    );
  }
  if (SAFE_LIBRARY_MESSAGES[error?.code] && Number.isInteger(error?.status)) {
    return new InternalPayrollNoveltiesApiError(
      error.code, error.status, SAFE_LIBRARY_MESSAGES[error.code],
    );
  }
  if (error?.code === 'ACTION_SESSION_INVALID') {
    return new InternalPayrollNoveltiesApiError(
      'PAYROLL_NOVELTY_SESSION_INVALID', 401, 'La sesión operativa ya no es válida',
    );
  }
  if (error?.code === 'ACTION_RELEASE_NOT_CERTIFIED') {
    return new InternalPayrollNoveltiesApiError(
      'PAYROLL_NOVELTY_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada',
    );
  }
  if (error?.code === 'ACTION_DATABASE_ROLE_REQUIRED') {
    return new InternalPayrollNoveltiesApiError(
      'PAYROLL_NOVELTY_DATABASE_ROLE_REQUIRED',
      503,
      'El rol aislado de novedades no está configurado',
    );
  }
  return null;
}

export function createInternalPayrollNoveltiesHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const requireAccess = dependencies.requireCompatibleInternalAccess
    ?? requireCompatibleInternalAccess;
  const getSql = dependencies.getInternalSql ?? getActionCenterSql;
  const bootstrap = dependencies.getPayrollNoveltyBootstrap ?? getPayrollNoveltyBootstrap;
  const detail = dependencies.readPayrollNovelty ?? readPayrollNovelty;
  const prepare = dependencies.preparePayrollNovelty ?? preparePayrollNovelty;
  const transition = dependencies.transitionPayrollNovelty ?? transitionPayrollNovelty;
  const exportBatch = dependencies.exportPayrollNovelty ?? exportPayrollNovelty;

  return async function internalPayrollNoveltiesHandler(req, res) {
    const method = String(req?.method || 'GET').toUpperCase();
    try {
      if (!['GET', 'POST'].includes(method)) {
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, {
          ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido',
        });
      }
      if (MUTATION_METHODS.has(method)) {
        assertSameOrigin(req, env);
        assertJson(req);
      }

      const access = await requireAccess(req, res, {
        env,
        requiredCapabilities: ['payroll.novelty.read'],
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
          code: 'PAYROLL_NOVELTY_TENANT_MEMBERSHIP_REQUIRED',
          error: 'Novedades de nómina exige una membresía municipal activa',
        });
      }
      const session = actionMutationSession(access, env);
      const body = method === 'POST' ? await readBody(req) : null;
      if (body && (typeof body.command !== 'string' || !POST_COMMANDS.has(body.command))) {
        fail('PAYROLL_NOVELTY_COMMAND_INVALID', 400, 'Comando no permitido');
      }
      const sql = await getSql(env);

      if (method === 'GET') {
        const resource = queryValue(req, 'resource', 'bootstrap').trim().toLowerCase();
        if (!GET_RESOURCES.has(resource)) {
          fail('PAYROLL_NOVELTY_RESOURCE_INVALID', 400, 'resource no soportado');
        }
        if (resource === 'bootstrap') {
          assertQueryKeys(req, new Set(['resource']));
          const result = await bootstrap(sql, access.principal, session);
          return send(res, 200, { ok: true, ...result });
        }
        assertQueryKeys(req, new Set(['resource', 'id']));
        const id = queryValue(req, 'id').trim();
        const result = resource === 'detail'
          ? await detail(sql, access.principal, session, id)
          : await exportBatch(sql, access.principal, session, id);
        return send(res, 200, { ok: true, ...result });
      }

      const key = idempotencyKey(req);
      const result = body.command === 'prepare'
        ? await prepare(sql, access.principal, session, body.payload, key)
        : await transition(
          sql, access.principal, session, body.command, body.payload, key,
        );
      if (result?.replayed === true) res.setHeader('Idempotency-Replayed', 'true');
      return send(res, body.command === 'prepare' ? 201 : 200, {
        ok: true,
        replayed: result?.replayed === true,
        data: result?.data ?? result,
      });
    } catch (error) {
      const safe = safeError(error);
      if (safe) {
        if (safe.code === 'PAYROLL_NOVELTY_SESSION_BUSY') res.setHeader('Retry-After', '1');
        return send(res, safe.status, {
          ok: false,
          code: safe.code,
          error: safe.message,
          ...(safe.details === undefined ? {} : { details: safe.details }),
        });
      }
      console.error('internal-payroll-novelties failed', {
        name: error?.name,
        code: typeof error?.code === 'string' ? error.code : undefined,
      });
      return send(res, 503, {
        ok: false,
        code: 'PAYROLL_NOVELTY_UNAVAILABLE',
        error: 'Novedades de nómina temporalmente no disponibles',
      });
    }
  };
}

export default createInternalPayrollNoveltiesHandler();
