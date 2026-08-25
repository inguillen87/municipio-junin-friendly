import { getInternalSql } from '../lib/internal-neon.js';
import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import {
  InternalCertifiedReleaseError,
  resolveInternalCertifiedReleaseSha,
} from '../lib/internal-certified-release.js';
import { capabilitiesForActionCenter } from '../lib/internal-resource-access.js';
import { publicPrincipal } from '../lib/internal-rbac.js';
import {
  ACTION_CENTER_CONTRACT,
  ActionCenterError,
  createLeaveCase,
  getActionBootstrap,
  listLeaveCases,
  loadTenantActionContext,
  readLeaveCase,
  transitionLeaveCase,
  updateLeaveDraft,
} from '../lib/internal-leave-workflow.js';
import {
  OVERTIME_ACTION_CONTRACT,
  OVERTIME_CASE_TYPE,
  createOvertimeCase,
  getOvertimeBootstrap,
  listOvertimeCases,
  readOvertimeCase,
  transitionOvertimeCase,
  updateOvertimeDraft,
} from '../lib/internal-overtime-workflow.js';
import {
  TIME_SOURCE_CASE_TYPE,
  TIME_SOURCE_REGISTRY_CONTRACT,
  applyTimeSourceCommand,
  getTimeSourceBootstrap,
  listTimeSources,
  readTimeSource,
} from '../lib/internal-time-source-registry.js';

const MAX_BODY_BYTES = 16 * 1024;
const CASE_TYPE = 'leave_request';
const CASE_TYPES = new Set([CASE_TYPE, OVERTIME_CASE_TYPE, TIME_SOURCE_CASE_TYPE]);
const MUTATION_METHODS = new Set(['POST', 'PATCH']);
const ACTIONS_RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let cachedActionsDatabaseUrl = null;
let cachedActionsSqlPromise = null;

function setResponseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
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

function queryValue(req, name, fallback = '') {
  const value = req?.query?.[name];
  if (Array.isArray(value)) {
    if (value.length !== 1) fail('ACTION_QUERY_AMBIGUOUS', 400, `Parámetro ${name} ambiguo`);
    return String(value[0] ?? fallback);
  }
  return String(value ?? fallback);
}

function assertQueryKeys(req, allowed) {
  const keys = Object.keys(req?.query || {});
  const extra = keys.find((key) => !allowed.has(key));
  if (extra) fail('ACTION_QUERY_INVALID', 400, `Parámetro no permitido: ${extra}`);
}

function fail(code, status, message) {
  throw new ActionCenterError(code, status, message);
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
    if (productionLike(env)) fail('ACTION_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
    return '';
  }
  try {
    return new URL(candidate).origin;
  } catch {
    fail('ACTION_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
  }
  return '';
}

function assertSameOrigin(req, env) {
  const origin = firstHeader(req, 'origin').trim();
  const fetchSite = firstHeader(req, 'sec-fetch-site').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    fail('ACTION_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  if (!origin) {
    if (productionLike(env)) fail('ACTION_ORIGIN_REQUIRED', 403, 'Origen de solicitud no permitido');
    return;
  }
  const expected = trustedOrigin(env);
  if (!expected) return;
  let actual = '';
  try {
    actual = new URL(origin).origin;
  } catch {
    fail('ACTION_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  if (actual !== expected) {
    fail('ACTION_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
}

function assertJsonContentType(req) {
  const mediaType = firstHeader(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail('ACTION_CONTENT_TYPE_REQUIRED', 415, 'Content-Type debe ser application/json');
  }
}

function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    fail('ACTION_JSON_INVALID', 400, 'JSON inválido');
  }
}

async function requestBody(req) {
  const declaredLength = Number.parseInt(firstHeader(req, 'content-length'), 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    fail('ACTION_BODY_TOO_LARGE', 413, 'El cuerpo supera 16 KiB');
  }

  let value = req?.body;
  if (value === undefined && req && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) fail('ACTION_BODY_TOO_LARGE', 413, 'El cuerpo supera 16 KiB');
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_BODY_BYTES) {
      fail('ACTION_BODY_TOO_LARGE', 413, 'El cuerpo supera 16 KiB');
    }
    value = parseJsonText(value);
  } else if (value !== undefined) {
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_BODY_BYTES) {
      fail('ACTION_BODY_TOO_LARGE', 413, 'El cuerpo supera 16 KiB');
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ACTION_BODY_INVALID', 400, 'El cuerpo JSON debe ser un objeto');
  }
  return value;
}

function exactCaseType(value) {
  if (!CASE_TYPES.has(value)) fail('ACTION_CASE_TYPE_INVALID', 400, 'caseType no soportado');
  return value;
}

function idempotencyKey(req) {
  const value = firstHeader(req, 'idempotency-key').trim();
  if (!value) fail('ACTION_IDEMPOTENCY_KEY_REQUIRED', 428, 'Idempotency-Key es obligatorio');
  return value;
}

export function actionMutationSession(access, env = process.env) {
  const sessionId = String(access?.session?.id || '').trim().toLowerCase();
  const sessionEmail = String(access?.session?.email || '').trim().toLowerCase();
  const principalEmail = String(access?.principal?.user?.email || '').trim().toLowerCase();
  const sessionVersion = Number(access?.session?.version);
  if (access?.mode !== 'managed' || !UUID_PATTERN.test(sessionId)
      || !sessionEmail || sessionEmail !== principalEmail
      || !Number.isSafeInteger(sessionVersion) || sessionVersion < 1) {
    fail('ACTION_SESSION_INVALID', 401, 'La sesión operativa ya no es válida');
  }
  let releaseSha;
  try {
    releaseSha = resolveInternalCertifiedReleaseSha(env);
  } catch (error) {
    if (!(error instanceof InternalCertifiedReleaseError)) throw error;
    fail('ACTION_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada para operar');
  }
  const certifiedSha = String(access?.principal?.tenant?.certifiedReleaseSha || '').trim().toLowerCase();
  if (releaseSha !== certifiedSha) {
    fail('ACTION_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada para operar');
  }
  return Object.freeze({
    id: sessionId,
    email: sessionEmail,
    version: sessionVersion,
    releaseSha,
  });
}

function safeUnexpectedError(error) {
  if (error?.code === 'ACTION_DATABASE_ROLE_REQUIRED') {
    return new ActionCenterError(
      error.code,
      503,
      'El rol aislado del centro de acciones no está configurado',
    );
  }
  if (error?.code === 'INTERNAL_AUTH_NOT_CONFIGURED') {
    return new ActionCenterError(
      'ACTION_CENTER_NOT_CONFIGURED',
      503,
      'Centro de acciones no configurado',
    );
  }
  return null;
}

export function assertActionCenterRuntimeIdentity(identity) {
  if (identity?.currentUser !== ACTIONS_RUNTIME_ROLE
      || identity?.sessionUser !== ACTIONS_RUNTIME_ROLE) {
    const error = new Error(`ACTIONS_DATABASE_URL no usa ${ACTIONS_RUNTIME_ROLE} como current_user y session_user`);
    error.code = 'ACTION_DATABASE_ROLE_REQUIRED';
    throw error;
  }
}

export async function getActionCenterSql(env = process.env) {
  const configuredUrl = typeof env?.ACTIONS_DATABASE_URL === 'string'
    ? env.ACTIONS_DATABASE_URL.trim()
    : '';
  if (!configuredUrl) {
    if (productionLike(env)) {
      const error = new Error('ACTIONS_DATABASE_URL no está configurado');
      error.code = 'ACTION_DATABASE_ROLE_REQUIRED';
      throw error;
    }
    return getInternalSql(env);
  }
  if (productionLike(env)
      && typeof env?.DATABASE_URL === 'string'
      && configuredUrl === env.DATABASE_URL.trim()) {
    const error = new Error('ACTIONS_DATABASE_URL debe usar un rol distinto al owner');
    error.code = 'ACTION_DATABASE_ROLE_REQUIRED';
    throw error;
  }
  if (!cachedActionsSqlPromise || cachedActionsDatabaseUrl !== configuredUrl) {
    cachedActionsDatabaseUrl = configuredUrl;
    cachedActionsSqlPromise = import('@neondatabase/serverless')
      .then(async ({ neon }) => {
        const sql = neon(configuredUrl);
        const roles = await sql.query(`
          SELECT current_user AS "currentUser", session_user AS "sessionUser"
        `);
        assertActionCenterRuntimeIdentity(roles[0]);
        return sql;
      })
      .catch((error) => {
        cachedActionsDatabaseUrl = null;
        cachedActionsSqlPromise = null;
        throw error;
      });
  }
  return cachedActionsSqlPromise;
}

export function createInternalActionsHandler(dependencies = {}) {
  const getSql = dependencies.getInternalSql ?? getActionCenterSql;
  const requireAccess = dependencies.requireCompatibleInternalAccess
    ?? requireCompatibleInternalAccess;
  const loadPrincipal = dependencies.loadTenantActionContext
    ?? dependencies.loadTenantActionPrincipal
    ?? loadTenantActionContext;
  const bootstrap = dependencies.getActionBootstrap ?? getActionBootstrap;
  const list = dependencies.listLeaveCases ?? listLeaveCases;
  const detail = dependencies.readLeaveCase ?? readLeaveCase;
  const create = dependencies.createLeaveCase ?? createLeaveCase;
  const update = dependencies.updateLeaveDraft ?? updateLeaveDraft;
  const transition = dependencies.transitionLeaveCase ?? transitionLeaveCase;
  const overtimeBootstrap = dependencies.getOvertimeBootstrap ?? getOvertimeBootstrap;
  const overtimeList = dependencies.listOvertimeCases ?? listOvertimeCases;
  const overtimeDetail = dependencies.readOvertimeCase ?? readOvertimeCase;
  const overtimeCreate = dependencies.createOvertimeCase ?? createOvertimeCase;
  const overtimeUpdate = dependencies.updateOvertimeDraft ?? updateOvertimeDraft;
  const overtimeTransition = dependencies.transitionOvertimeCase ?? transitionOvertimeCase;
  const timeSourceBootstrap = dependencies.getTimeSourceBootstrap ?? getTimeSourceBootstrap;
  const timeSourceList = dependencies.listTimeSources ?? listTimeSources;
  const timeSourceDetail = dependencies.readTimeSource ?? readTimeSource;
  const timeSourceApply = dependencies.applyTimeSourceCommand ?? applyTimeSourceCommand;
  const env = dependencies.env ?? process.env;

  return async function internalActionsHandler(req, res) {
    const method = String(req?.method || 'GET').toUpperCase();
    try {
      if (!['GET', 'POST', 'PATCH'].includes(method)) {
        res.setHeader('Allow', 'GET, POST, PATCH');
        return send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido' });
      }
      if (MUTATION_METHODS.has(method)) {
        assertSameOrigin(req, env);
        assertJsonContentType(req);
      }

      const preloadedBody = MUTATION_METHODS.has(method) ? await requestBody(req) : null;
      const requestedCaseType = method === 'GET'
        ? exactCaseType(queryValue(req, 'caseType', CASE_TYPE))
        : exactCaseType(preloadedBody.caseType);
      const isTimeSource = requestedCaseType === TIME_SOURCE_CASE_TYPE;

      const access = await requireAccess(req, res, {
        env,
        requiredCapabilities: isTimeSource ? ['time.source.read'] : capabilitiesForActionCenter(),
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
          code: 'ACTION_TENANT_MEMBERSHIP_REQUIRED',
          error: 'El Centro de Acciones exige una membresía municipal activa',
        });
      }
      const tenantSession = actionMutationSession(access, env);
      const sql = await getSql(env);

      if (method === 'GET') {
        const caseType = requestedCaseType;
        const isOvertime = caseType === OVERTIME_CASE_TYPE;
        const resource = queryValue(req, 'resource', 'bootstrap');
        if (isTimeSource) {
          if (resource === 'bootstrap') {
            assertQueryKeys(req, new Set(['caseType', 'resource']));
            const result = await timeSourceBootstrap(sql, access.principal, tenantSession);
            const { principal, ...payload } = result;
            return send(res, 200, { ok: true, caseType, ...payload });
          }
          if (resource === 'list') {
            assertQueryKeys(req, new Set(['caseType', 'resource', 'domain', 'status', 'page', 'limit']));
            const result = await timeSourceList(sql, access.principal, {
              domain: queryValue(req, 'domain', ''),
              status: queryValue(req, 'status', ''),
              page: queryValue(req, 'page', '1'),
              limit: queryValue(req, 'limit', '20'),
            }, tenantSession);
            const { principal, ...payload } = result;
            return send(res, 200, { ok: true, caseType, ...payload });
          }
          if (resource === 'detail') {
            assertQueryKeys(req, new Set(['caseType', 'resource', 'id']));
            const result = await timeSourceDetail(
              sql, access.principal, queryValue(req, 'id'), tenantSession,
            );
            const { principal, ...payload } = result;
            return send(res, 200, { ok: true, caseType, ...payload });
          }
          fail('ACTION_RESOURCE_INVALID', 400, 'resource no soportado');
        }
        if (resource === 'bootstrap') {
          const result = await (isOvertime ? overtimeBootstrap : bootstrap)(
            sql, access.principal, tenantSession,
          );
          const { principal, ...payload } = result;
          return send(res, 200, {
            ok: true,
            caseType,
            principal: publicPrincipal(principal),
            ...payload,
          });
        }
        if (resource === 'list') {
          const type = queryValue(req, 'type', '').trim();
          if (type) exactCaseType(type);
          if (type && type !== caseType) {
            fail('ACTION_CASE_TYPE_INVALID', 400, 'type y caseType deben coincidir');
          }
          const due = queryValue(req, 'due', '').trim();
          const cursor = queryValue(req, 'cursor', '').trim();
          if (due) fail('ACTION_DUE_FILTER_UNSUPPORTED', 400, 'No existe un vencimiento autoritativo para filtrar');
          if (cursor) fail('ACTION_CURSOR_UNSUPPORTED', 400, 'La paginación disponible usa page y limit');
          const selectedView = queryValue(req, 'view', isOvertime ? '' : 'mine');
          if (isOvertime && selectedView) {
            fail('ACTION_VIEW_INVALID', 400, 'Mayor esfuerzo no admite vistas heredadas de licencias');
          }
          const result = await (isOvertime ? overtimeList : list)(sql, access.principal, {
            page: queryValue(req, 'page', '1'),
            limit: queryValue(req, 'limit', '20'),
            status: queryValue(req, 'status', ''),
            view: selectedView || 'mine',
            caseType: type || caseType,
            due,
            cursor,
          }, tenantSession);
          const { principal: governedPrincipal, ...payload } = result;
          return send(res, 200, { ok: true, caseType, ...payload });
        }
        if (resource === 'detail') {
          const result = await (isOvertime ? overtimeDetail : detail)(
            sql, access.principal, queryValue(req, 'id'), tenantSession,
          );
          const { principal: governedPrincipal, ...payload } = result;
          return send(res, 200, { ok: true, caseType, ...payload });
        }
        fail('ACTION_RESOURCE_INVALID', 400, 'resource no soportado');
      }

      const body = preloadedBody;
      const caseType = exactCaseType(body.caseType);
      const isOvertime = caseType === OVERTIME_CASE_TYPE;
      if (caseType === TIME_SOURCE_CASE_TYPE) {
        if ((body.command === 'update_draft' && method !== 'PATCH')
            || (body.command !== 'update_draft' && method !== 'POST')) {
          fail('ACTION_COMMAND_INVALID', 400, 'Método incompatible con el comando temporal');
        }
        const key = idempotencyKey(req);
        const result = await timeSourceApply(
          sql, access.principal, tenantSession, body, key,
        );
        if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
        return send(res, body.command === 'create_draft' ? 201 : 200, {
          ok: true,
          caseType,
          replayed: Boolean(result.replayed),
          historical: Boolean(result.historical),
          data: result.data,
        });
      }
      if (method === 'POST' && body.command === 'search_subjects') {
        if (Object.keys(body).some((keyName) => !['caseType', 'command', 'payload'].includes(keyName))
            || !body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)
            || Object.keys(body.payload).some((keyName) => keyName !== 'query')
            || typeof body.payload.query !== 'string') {
          fail('ACTION_SUBJECT_QUERY_INVALID', 400, 'La búsqueda de legajos es inválida');
        }
        const result = await (isOvertime ? overtimeBootstrap : bootstrap)(
          sql, access.principal, tenantSession, body.payload.query,
        );
        const { principal, ...payload } = result;
        return send(res, 200, {
          ok: true,
          caseType,
          principal: publicPrincipal(principal),
          ...payload,
        });
      }
      const principal = await loadPrincipal(sql, access.principal, tenantSession);
      if (!principal) {
        return send(res, 403, {
          ok: false,
          code: 'ACTION_TENANT_AUTHORITY_REQUIRED',
          error: 'La membresía no tiene autoridad operativa vigente',
        });
      }
      const key = idempotencyKey(req);
      let result;
      let status = 200;
      if (method === 'PATCH') {
        if (body.command !== 'update_draft') {
          fail('ACTION_COMMAND_INVALID', 400, 'PATCH sólo admite update_draft');
        }
        if (isOvertime && Object.keys(body).some((name) => ![
          'caseType', 'command', 'caseId', 'expectedVersion', 'payload',
        ].includes(name))) {
          fail('ACTION_COMMAND_INVALID', 400, 'El comando contiene campos no permitidos');
        }
        result = await (isOvertime ? overtimeUpdate : update)(
          sql,
          principal,
          body.caseId,
          body.payload,
          body.expectedVersion,
          key,
          tenantSession,
        );
      } else if (body.command === 'create') {
        if (isOvertime && Object.keys(body).some((name) => !['caseType', 'command', 'payload'].includes(name))) {
          fail('ACTION_COMMAND_INVALID', 400, 'El comando contiene campos no permitidos');
        }
        result = await (isOvertime ? overtimeCreate : create)(
          sql, principal, body.payload, key, tenantSession,
        );
        status = 201;
      } else if (['submit', 'approve', 'reject', 'cancel'].includes(body.command)) {
        result = await (isOvertime ? overtimeTransition : transition)(
          sql, principal, body.command, body.caseId, body, key, tenantSession,
        );
      } else {
        fail('ACTION_COMMAND_INVALID', 400, 'Comando no permitido');
      }

      if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return send(res, status, {
        ok: true,
        caseType,
        replayed: Boolean(result.replayed),
        data: result.data,
      });
    } catch (error) {
      const safeError = error instanceof ActionCenterError ? error : safeUnexpectedError(error);
      if (safeError) {
        if (safeError.code === 'ACTION_SESSION_BUSY'
            || safeError.code === 'TIME_SOURCE_SESSION_BUSY') {
          res.setHeader('Retry-After', '1');
        }
        return send(res, safeError.status, {
          ok: false,
          code: safeError.code,
          error: safeError.message,
          ...(safeError.details === undefined ? {} : { details: safeError.details }),
        });
      }
      console.error('internal-actions failed', { name: error?.name, code: error?.code });
      return send(res, 503, {
        ok: false,
        code: 'ACTION_CENTER_UNAVAILABLE',
        error: 'Centro de acciones temporalmente no disponible',
      });
    }
  };
}

export default createInternalActionsHandler();

export { ACTION_CENTER_CONTRACT, OVERTIME_ACTION_CONTRACT, TIME_SOURCE_REGISTRY_CONTRACT };
