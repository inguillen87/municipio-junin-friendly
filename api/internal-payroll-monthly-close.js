import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import {
  PAYROLL_MONTHLY_CLOSE_MAX_SOURCE_BYTES,
  PayrollMonthlyCloseError,
  getPayrollMonthlyCloseBootstrap,
  listPayrollMonthlyCloseRuns,
  normalizePayrollMonthlyCloseDraft,
  persistPayrollMonthlyCloseRun,
  readPayrollMonthlyCloseAttempt,
  readPayrollMonthlyCloseRun,
  transitionPayrollMonthlyCloseRun,
} from '../lib/internal-payroll-monthly-close.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { MonthlyCloseContractError } from '../lib/internal-monthly-close-contracts.js';

export const PAYROLL_MONTHLY_CLOSE_API_MAX_BASE64_CHARS =
  Math.ceil(PAYROLL_MONTHLY_CLOSE_MAX_SOURCE_BYTES / 3) * 4;
export const PAYROLL_MONTHLY_CLOSE_API_MAX_BODY_BYTES =
  (PAYROLL_MONTHLY_CLOSE_API_MAX_BASE64_CHARS * 3) + 8192;
export const PAYROLL_MONTHLY_CLOSE_REQUIRED_CAPABILITY =
  'payroll.monthly_close.read';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const POST_COMMANDS = new Set(['prepare', 'submit', 'approve', 'reject', 'cancel']);
const GET_RESOURCES = new Set(['bootstrap', 'list', 'detail', 'attempt']);
const TOP_LEVEL_KEYS = new Set(['command', 'payload']);
const PREPARE_KEYS = new Set(['period', 'jurisdiction', 'sources']);
const SOURCE_KEYS = new Set(['definitionKey', 'sourceKind', 'contentBase64']);
const TRANSITION_KEYS = new Set([
  'runId', 'expectedVersion', 'reasonCode', 'reasonReference',
]);
const COMMAND_CAPABILITY = Object.freeze({
  prepare: 'payroll.monthly_close.prepare',
  submit: 'payroll.monthly_close.prepare',
  approve: 'payroll.monthly_close.approve',
  reject: 'payroll.monthly_close.approve',
  cancel: 'payroll.monthly_close.prepare',
});
const SAFE_PAYROLL_ERRORS = Object.freeze({
  PAYROLL_MONTHLY_CLOSE_ATTEMPT_COMMAND_INVALID: [422, 'El comando del intento no es válido'],
  PAYROLL_MONTHLY_CLOSE_ATTEMPT_CONTEXT_CHANGED: [409, 'La autoridad del intento cambió; no se puede confirmar su resultado'],
  PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND: [404, 'No se encontró un resultado para este intento'],
  PAYROLL_MONTHLY_CLOSE_BINDING_CHANGED: [409, 'El binding GRH cambió durante la preparación'],
  PAYROLL_MONTHLY_CLOSE_BINDING_REQUIRED: [503, 'El binding GRH certificado no está disponible'],
  PAYROLL_MONTHLY_CLOSE_BLOCKING_ISSUES: [409, 'El cierre conserva controles bloqueantes'],
  PAYROLL_MONTHLY_CLOSE_CAPABILITY_REQUIRED: [403, 'No posee la capacidad requerida'],
  PAYROLL_MONTHLY_CLOSE_COMMAND_INVALID: [400, 'Comando no permitido'],
  PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT: [503, 'El contrato de cierre mensual no es seguro'],
  PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL: [409, 'Una diferencia de uno o más centavos bloquea la aprobación'],
  PAYROLL_MONTHLY_CLOSE_DRAFT_INVALID: [400, 'El cierre mensual no coincide con el contrato vigente'],
  PAYROLL_MONTHLY_CLOSE_DUPLICATE_RUN: [409, 'Ya existe un cierre activo para ese período y jurisdicción'],
  PAYROLL_MONTHLY_CLOSE_EMPLOYMENT_REQUIRED: [403, 'La decisión exige un vínculo laboral vigente'],
  PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_KEY_INVALID: [428, 'Idempotency-Key debe ser un UUID v4'],
  PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_REUSE: [409, 'La clave de idempotencia ya fue usada'],
  PAYROLL_MONTHLY_CLOSE_JURISDICTION_INVALID: [422, 'La jurisdicción debe ser 42 o 55'],
  PAYROLL_MONTHLY_CLOSE_LIST_INVALID: [422, 'Filtros de cierres inválidos'],
  PAYROLL_MONTHLY_CLOSE_MAKER_CHECKER_REQUIRED: [409, 'La membresía que preparó el cierre no puede decidirlo'],
  PAYROLL_MONTHLY_CLOSE_NOT_FOUND: [404, 'Cierre mensual no encontrado'],
  PAYROLL_MONTHLY_CLOSE_PERIOD_INVALID: [422, 'El período debe usar YYYY-MM'],
  PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID: [422, 'Las fuentes no cumplen el contrato de cierre'],
  PAYROLL_MONTHLY_CLOSE_PREPARER_REQUIRED: [403, 'Sólo la membresía que preparó el cierre puede enviarlo o cancelarlo'],
  PAYROLL_MONTHLY_CLOSE_REASON_INVALID: [422, 'El motivo no corresponde al comando'],
  PAYROLL_MONTHLY_CLOSE_REASON_REFERENCE_REQUIRED: [422, 'La decisión exige una referencia opaca de expediente o respaldo'],
  PAYROLL_MONTHLY_CLOSE_RELEASE_NOT_CERTIFIED: [503, 'El contrato de datos activo no está certificado'],
  PAYROLL_MONTHLY_CLOSE_RUN_ID_INVALID: [422, 'La corrida de cierre no es válida'],
  PAYROLL_MONTHLY_CLOSE_SESSION_BUSY: [409, 'El acceso se está actualizando; reintentá en un momento'],
  PAYROLL_MONTHLY_CLOSE_SESSION_INVALID: [401, 'La sesión operativa ya no es válida'],
  PAYROLL_MONTHLY_CLOSE_SOURCE_INVALID: [400, 'Cada fuente debe aportar bytes transitorios'],
  PAYROLL_MONTHLY_CLOSE_SOURCE_SET_INVALID: [422, 'El cierre exige exactamente las tres fuentes agregadas'],
  PAYROLL_MONTHLY_CLOSE_TRANSITION_INVALID: [409, 'La transición no está permitida'],
  PAYROLL_MONTHLY_CLOSE_UNAVAILABLE: [503, 'Cierre mensual temporalmente no disponible'],
  PAYROLL_MONTHLY_CLOSE_VERSION_CONFLICT: [409, 'La corrida fue modificada por otra persona'],
  PAYROLL_MONTHLY_CLOSE_VERSION_REQUIRED: [428, 'expectedVersion es obligatorio'],
});

export class InternalPayrollMonthlyCloseApiError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'InternalPayrollMonthlyCloseApiError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new InternalPayrollMonthlyCloseApiError(code, status, message);
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
      fail('PAYROLL_MONTHLY_CLOSE_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
    }
    return '';
  }
  try {
    return new URL(candidate).origin;
  } catch {
    fail('PAYROLL_MONTHLY_CLOSE_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
  }
}

function assertSameOrigin(req, env) {
  const fetchSite = firstHeader(req, 'sec-fetch-site').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    fail('PAYROLL_MONTHLY_CLOSE_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const supplied = firstHeader(req, 'origin').trim();
  if (!supplied) {
    if (productionLike(env)) {
      fail('PAYROLL_MONTHLY_CLOSE_ORIGIN_REQUIRED', 403, 'Origen de solicitud no permitido');
    }
    return;
  }
  let actual;
  try {
    actual = new URL(supplied).origin;
  } catch {
    fail('PAYROLL_MONTHLY_CLOSE_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const expected = trustedOrigin(env);
  if (expected && actual !== expected) {
    fail('PAYROLL_MONTHLY_CLOSE_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
}

function assertJson(req) {
  const mediaType = firstHeader(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail('PAYROLL_MONTHLY_CLOSE_CONTENT_TYPE_REQUIRED', 415, 'Content-Type debe ser application/json');
  }
}

function assertDeclaredLength(req) {
  const value = firstHeader(req, 'content-length').trim();
  if (!value) return;
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) {
    fail('PAYROLL_MONTHLY_CLOSE_CONTENT_LENGTH_INVALID', 400, 'Content-Length inválido');
  }
  if (Number(value) > PAYROLL_MONTHLY_CLOSE_API_MAX_BODY_BYTES) {
    fail('PAYROLL_MONTHLY_CLOSE_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
  }
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    fail('PAYROLL_MONTHLY_CLOSE_JSON_INVALID', 400, 'JSON inválido');
  }
}

function exactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === expected.size
    && Object.keys(value).every((key) => expected.has(key));
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
      if (size > PAYROLL_MONTHLY_CLOSE_API_MAX_BODY_BYTES) {
        fail('PAYROLL_MONTHLY_CLOSE_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
      }
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks);
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') value = parseJson(value);
  let encoded;
  try {
    encoded = JSON.stringify(value);
  } catch {
    fail('PAYROLL_MONTHLY_CLOSE_BODY_INVALID', 400, 'El cuerpo JSON debe ser un objeto exacto');
  }
  if (typeof encoded !== 'string'
      || Buffer.byteLength(encoded, 'utf8') > PAYROLL_MONTHLY_CLOSE_API_MAX_BODY_BYTES) {
    fail('PAYROLL_MONTHLY_CLOSE_BODY_TOO_LARGE', 413, 'El cuerpo supera el límite permitido');
  }
  if (!exactKeys(value, TOP_LEVEL_KEYS)
      || typeof value.command !== 'string' || !POST_COMMANDS.has(value.command)) {
    fail('PAYROLL_MONTHLY_CLOSE_BODY_INVALID', 400, 'El cuerpo JSON contiene campos no permitidos');
  }
  const expectedKeys = value.command === 'prepare' ? PREPARE_KEYS : TRANSITION_KEYS;
  if (!exactKeys(value.payload, expectedKeys)) {
    fail('PAYROLL_MONTHLY_CLOSE_PAYLOAD_INVALID', 400, 'El payload no coincide con el comando');
  }
  if (value.command === 'prepare'
      && (!Array.isArray(value.payload.sources) || value.payload.sources.length !== 3
        || value.payload.sources.some((source) => !exactKeys(source, SOURCE_KEYS)))) {
    fail('PAYROLL_MONTHLY_CLOSE_PAYLOAD_INVALID', 400, 'El cierre exige las tres fuentes exactas');
  }
  return value;
}

function queryValue(req, name, fallback = '') {
  const value = req?.query?.[name];
  return Array.isArray(value) ? String(value[0] ?? fallback) : String(value ?? fallback);
}

function assertQueryKeys(req, allowed) {
  if (Object.keys(req?.query || {}).some((key) => !allowed.has(key))) {
    fail('PAYROLL_MONTHLY_CLOSE_QUERY_INVALID', 400, 'La consulta contiene parámetros no permitidos');
  }
}

function idempotencyKey(req) {
  const value = firstHeader(req, 'idempotency-key').trim();
  if (!value) {
    fail('PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_KEY_REQUIRED', 428, 'Idempotency-Key es obligatorio');
  }
  return value;
}

function attemptCommand(req) {
  const value = firstHeader(req, 'x-municontrol-command').trim().toLowerCase();
  if (!value) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_ATTEMPT_COMMAND_REQUIRED',
      428,
      'X-MuniControl-Command es obligatorio para consultar el intento',
    );
  }
  if (!POST_COMMANDS.has(value)) {
    fail(
      'PAYROLL_MONTHLY_CLOSE_ATTEMPT_COMMAND_INVALID',
      422,
      'X-MuniControl-Command no es válido',
    );
  }
  return value;
}

function decodeCanonicalBase64(value) {
  if (typeof value !== 'string' || value.length === 0
      || value.length > PAYROLL_MONTHLY_CLOSE_API_MAX_BASE64_CHARS
      || value.length % 4 !== 0 || !BASE64.test(value)) {
    fail('PAYROLL_MONTHLY_CLOSE_CONTENT_INVALID', 400, 'El contenido base64 no es canónico');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.byteLength === 0 || bytes.byteLength > PAYROLL_MONTHLY_CLOSE_MAX_SOURCE_BYTES
      || bytes.toString('base64') !== value) {
    bytes.fill(0);
    fail('PAYROLL_MONTHLY_CLOSE_CONTENT_INVALID', 400, 'El contenido base64 no es canónico');
  }
  return bytes;
}

function fingerprintKey(env) {
  const value = typeof env?.PAYROLL_MONTHLY_CLOSE_HMAC_SECRET === 'string'
    ? env.PAYROLL_MONTHLY_CLOSE_HMAC_SECRET : '';
  const key = Buffer.from(value, 'utf8');
  if (key.byteLength < 32 || key.byteLength > 1024) {
    key.fill(0);
    fail('PAYROLL_MONTHLY_CLOSE_HMAC_NOT_CONFIGURED', 503, 'Cierre mensual no configurado');
  }
  return key;
}

function governedContext(access, bootstrap, session, key) {
  const tenantId = String(access?.principal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(access?.principal?.tenant?.membershipId || '').trim().toLowerCase();
  const principal = bootstrap?.principal;
  const sourceBindingId = String(principal?.certifiedBindingId || '').trim().toLowerCase();
  if (access?.mode !== 'managed'
      || access?.principal?.tenant?.source !== 'membership'
      || !UUID.test(tenantId) || !UUID.test(membershipId) || !UUID.test(sourceBindingId)
      || principal?.tenantId !== tenantId || principal?.membershipId !== membershipId
      || !Array.isArray(principal?.capabilities)
      || !principal.capabilities.includes(PAYROLL_MONTHLY_CLOSE_REQUIRED_CAPABILITY)) {
    fail('PAYROLL_MONTHLY_CLOSE_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad sobre cierres');
  }
  return Object.freeze({
    tenantId,
    sourceBindingId,
    releaseSha: session.releaseSha,
    fingerprintKey: key,
  });
}

function governedBindingId(access, bootstrap) {
  const tenantId = String(access?.principal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(access?.principal?.tenant?.membershipId || '').trim().toLowerCase();
  const sourceBindingId = String(
    bootstrap?.principal?.certifiedBindingId || '',
  ).trim().toLowerCase();
  if (access?.mode !== 'managed'
      || access?.principal?.tenant?.source !== 'membership'
      || !UUID.test(tenantId) || !UUID.test(membershipId) || !UUID.test(sourceBindingId)
      || bootstrap?.principal?.tenantId !== tenantId
      || bootstrap?.principal?.membershipId !== membershipId) {
    fail('PAYROLL_MONTHLY_CLOSE_AUTHORITY_REQUIRED', 403,
      'La membresía no tiene autoridad sobre cierres');
  }
  return sourceBindingId;
}

function assertCommandAuthority(bootstrap, command) {
  const capability = COMMAND_CAPABILITY[command];
  if (!capability || !bootstrap?.principal?.capabilities?.includes(capability)) {
    fail('PAYROLL_MONTHLY_CLOSE_CAPABILITY_REQUIRED', 403, 'No posee la capacidad requerida');
  }
}

function safeError(error) {
  if (error instanceof InternalPayrollMonthlyCloseApiError) return error;
  if (error instanceof PayrollMonthlyCloseError) {
    const safe = SAFE_PAYROLL_ERRORS[error.code];
    return safe ? new InternalPayrollMonthlyCloseApiError(error.code, ...safe) : null;
  }
  if (error instanceof MonthlyCloseContractError) {
    return new InternalPayrollMonthlyCloseApiError(
      error.code,
      Number.isInteger(error.status) ? error.status : 422,
      error.message,
    );
  }
  const aliases = {
    ACTION_SESSION_INVALID: ['PAYROLL_MONTHLY_CLOSE_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ACTION_RELEASE_NOT_CERTIFIED: ['PAYROLL_MONTHLY_CLOSE_RELEASE_NOT_CERTIFIED', 503, 'El contrato de datos activo no está certificado'],
    ACTION_DATABASE_ROLE_REQUIRED: ['PAYROLL_MONTHLY_CLOSE_DATABASE_ROLE_REQUIRED', 503, 'El rol aislado de nómina no está configurado'],
    INTERNAL_AUTH_NOT_CONFIGURED: ['PAYROLL_MONTHLY_CLOSE_NOT_CONFIGURED', 503, 'Cierre mensual no configurado'],
  };
  const alias = aliases[error?.code];
  return alias ? new InternalPayrollMonthlyCloseApiError(...alias) : null;
}

export function createInternalPayrollMonthlyCloseHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const requireAccess = dependencies.requireCompatibleInternalAccess
    ?? requireCompatibleInternalAccess;
  const getSql = dependencies.getInternalSql ?? getActionCenterSql;
  const getBootstrap = dependencies.getPayrollMonthlyCloseBootstrap
    ?? getPayrollMonthlyCloseBootstrap;
  const list = dependencies.listPayrollMonthlyCloseRuns ?? listPayrollMonthlyCloseRuns;
  const detail = dependencies.readPayrollMonthlyCloseRun ?? readPayrollMonthlyCloseRun;
  const attempt = dependencies.readPayrollMonthlyCloseAttempt
    ?? readPayrollMonthlyCloseAttempt;
  const prepare = dependencies.normalizePayrollMonthlyCloseDraft
    ?? normalizePayrollMonthlyCloseDraft;
  const persist = dependencies.persistPayrollMonthlyCloseRun
    ?? persistPayrollMonthlyCloseRun;
  const transition = dependencies.transitionPayrollMonthlyCloseRun
    ?? transitionPayrollMonthlyCloseRun;

  return async function internalPayrollMonthlyCloseHandler(req, res) {
    const method = String(req?.method || 'GET').toUpperCase();
    const sourceBuffers = [];
    let contextKey = null;
    try {
      if (!['GET', 'POST'].includes(method)) {
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido' });
      }
      if (method === 'POST') {
        assertSameOrigin(req, env);
        assertJson(req);
      }
      const access = await requireAccess(req, res, {
        env,
        requiredCapabilities: [PAYROLL_MONTHLY_CLOSE_REQUIRED_CAPABILITY],
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
          code: 'PAYROLL_MONTHLY_CLOSE_TENANT_MEMBERSHIP_REQUIRED',
          error: 'El cierre mensual exige una membresía municipal activa',
        });
      }

      const session = actionMutationSession(access, env);
      const sql = await getSql(env);
      const bootstrap = await getBootstrap(sql, access.principal, session);

      if (method === 'GET') {
        const resource = queryValue(req, 'resource', 'bootstrap').trim().toLowerCase();
        if (!GET_RESOURCES.has(resource)) {
          fail('PAYROLL_MONTHLY_CLOSE_RESOURCE_INVALID', 400, 'resource no soportado');
        }
        if (resource === 'bootstrap') {
          assertQueryKeys(req, new Set(['resource']));
          return send(res, 200, { ok: true, data: bootstrap });
        }
        if (resource === 'list') {
          assertQueryKeys(req, new Set(['resource', 'status', 'page', 'limit']));
          const result = await list(sql, access.principal, session, {
            status: queryValue(req, 'status', 'all'),
            page: queryValue(req, 'page', '1'),
            limit: queryValue(req, 'limit', '20'),
          });
          return send(res, 200, { ok: true, data: result });
        }
        if (resource === 'attempt') {
          assertQueryKeys(req, new Set(['resource']));
          const command = attemptCommand(req);
          assertCommandAuthority(bootstrap, command);
          const result = await attempt(
            sql, access.principal, session, idempotencyKey(req), command,
          );
          res.setHeader('Idempotency-Replayed', 'true');
          return send(res, 200, {
            ok: true,
            replayed: true,
            data: result,
          });
        }
        assertQueryKeys(req, new Set(['resource', 'id']));
        return send(res, 200, {
          ok: true,
          data: await detail(sql, access.principal, session, queryValue(req, 'id')),
        });
      }

      const body = await readBody(req);
      assertCommandAuthority(bootstrap, body.command);
      const key = idempotencyKey(req);
      let result;
      if (body.command === 'prepare') {
        contextKey = fingerprintKey(env);
        const context = governedContext(access, bootstrap, session, contextKey);
        const sources = body.payload.sources.map((source) => {
          const bytes = decodeCanonicalBase64(source.contentBase64);
          sourceBuffers.push(bytes);
          return {
            definitionKey: source.definitionKey,
            sourceKind: source.sourceKind,
            bytes,
          };
        });
        const prepared = prepare({
          period: body.payload.period,
          jurisdiction: body.payload.jurisdiction,
          sources,
        }, context);
        result = await persist(
          sql, access.principal, session, prepared, key, context.sourceBindingId,
        );
      } else {
        const sourceBindingId = governedBindingId(access, bootstrap);
        result = await transition(
          sql, access.principal, session, body.command, body.payload, key,
          sourceBindingId,
        );
      }
      if (result?.replayed === true) res.setHeader('Idempotency-Replayed', 'true');
      return send(res, body.command === 'prepare' ? 201 : 200, {
        ok: true,
        replayed: result?.replayed === true,
        data: result,
      });
    } catch (error) {
      const safe = safeError(error);
      if (safe) {
        if (safe.code === 'PAYROLL_MONTHLY_CLOSE_SESSION_BUSY') res.setHeader('Retry-After', '1');
        return send(res, safe.status, { ok: false, code: safe.code, error: safe.message });
      }
      console.error('internal-payroll-monthly-close failed', {
        name: error?.name,
        code: typeof error?.code === 'string' ? error.code : undefined,
      });
      return send(res, 503, {
        ok: false,
        code: 'PAYROLL_MONTHLY_CLOSE_UNAVAILABLE',
        error: 'Cierre mensual temporalmente no disponible',
      });
    } finally {
      sourceBuffers.forEach((buffer) => buffer.fill(0));
      if (contextKey) contextKey.fill(0);
    }
  };
}

export default createInternalPayrollMonthlyCloseHandler();
