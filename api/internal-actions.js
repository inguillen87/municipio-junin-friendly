import { getInternalSql } from '../lib/internal-neon.js';
import { requireInternalSession } from '../lib/internal-session.js';
import {
  loadInternalPrincipal,
  publicPrincipal,
} from '../lib/internal-rbac.js';
import {
  ACTION_CENTER_CONTRACT,
  ActionCenterError,
  createLeaveCase,
  getActionBootstrap,
  listLeaveCases,
  readLeaveCase,
  transitionLeaveCase,
  updateLeaveDraft,
} from '../lib/internal-leave-workflow.js';

const MAX_BODY_BYTES = 16 * 1024;
const CASE_TYPE = 'leave_request';
const MUTATION_METHODS = new Set(['POST', 'PATCH']);
const ACTIONS_RUNTIME_ROLE = 'municontrol_actions_runtime_app';
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

function fail(code, status, message) {
  throw new ActionCenterError(code, status, message);
}

function productionLike(env) {
  return env?.NODE_ENV === 'production'
    || env?.VERCEL_ENV === 'production'
    || env?.VERCEL_ENV === 'preview';
}

function assertSameOrigin(req, env) {
  const origin = firstHeader(req, 'origin').trim();
  if (!origin) {
    if (productionLike(env)) fail('ACTION_ORIGIN_REQUIRED', 403, 'Origen de solicitud no permitido');
    return;
  }
  const host = firstHeader(req, 'host').trim().toLowerCase();
  let actual;
  try {
    actual = new URL(origin);
  } catch {
    fail('ACTION_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const expectedProtocol = productionLike(env) ? 'https:' : 'http:';
  if (!host
      || actual.protocol.toLowerCase() !== expectedProtocol
      || actual.host.toLowerCase() !== host) {
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
  if (value !== CASE_TYPE) fail('ACTION_CASE_TYPE_INVALID', 400, 'caseType no soportado');
  return value;
}

function idempotencyKey(req) {
  const value = firstHeader(req, 'idempotency-key').trim();
  if (!value) fail('ACTION_IDEMPOTENCY_KEY_REQUIRED', 428, 'Idempotency-Key es obligatorio');
  return value;
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
  const requireSession = dependencies.requireInternalSession ?? requireInternalSession;
  const loadPrincipal = dependencies.loadInternalPrincipal ?? loadInternalPrincipal;
  const bootstrap = dependencies.getActionBootstrap ?? getActionBootstrap;
  const list = dependencies.listLeaveCases ?? listLeaveCases;
  const detail = dependencies.readLeaveCase ?? readLeaveCase;
  const create = dependencies.createLeaveCase ?? createLeaveCase;
  const update = dependencies.updateLeaveDraft ?? updateLeaveDraft;
  const transition = dependencies.transitionLeaveCase ?? transitionLeaveCase;
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

      const session = requireSession(req, res, dependencies.sessionOptions || {});
      if (!session) return undefined;
      const sql = await getSql(env);
      const principal = await loadPrincipal(sql, session);
      if (!principal) {
        return send(res, 401, {
          ok: false,
          code: 'INTERNAL_USER_INACTIVE',
          error: 'La cuenta interna no está activa',
        });
      }

      if (method === 'GET') {
        const caseType = queryValue(req, 'caseType', CASE_TYPE);
        exactCaseType(caseType);
        const resource = queryValue(req, 'resource', 'bootstrap');
        if (resource === 'bootstrap') {
          const result = await bootstrap(sql, principal);
          return send(res, 200, {
            ok: true,
            caseType,
            principal: publicPrincipal(principal),
            ...result,
          });
        }
        if (resource === 'list') {
          const type = queryValue(req, 'type', '').trim();
          if (type) exactCaseType(type);
          const due = queryValue(req, 'due', '').trim();
          const cursor = queryValue(req, 'cursor', '').trim();
          if (due) fail('ACTION_DUE_FILTER_UNSUPPORTED', 400, 'No existe un vencimiento autoritativo para filtrar');
          if (cursor) fail('ACTION_CURSOR_UNSUPPORTED', 400, 'La paginación disponible usa page y limit');
          const result = await list(sql, principal, {
            page: queryValue(req, 'page', '1'),
            limit: queryValue(req, 'limit', '20'),
            status: queryValue(req, 'status', ''),
            view: queryValue(req, 'view', 'mine'),
            caseType: type || caseType,
            due,
            cursor,
          });
          return send(res, 200, { ok: true, caseType, ...result });
        }
        if (resource === 'detail') {
          const result = await detail(sql, principal, queryValue(req, 'id'));
          return send(res, 200, { ok: true, caseType, ...result });
        }
        fail('ACTION_RESOURCE_INVALID', 400, 'resource no soportado');
      }

      const body = await requestBody(req);
      exactCaseType(body.caseType);
      const key = idempotencyKey(req);
      let result;
      let status = 200;
      if (method === 'PATCH') {
        if (body.command !== 'update_draft') {
          fail('ACTION_COMMAND_INVALID', 400, 'PATCH sólo admite update_draft');
        }
        result = await update(
          sql,
          principal,
          body.caseId,
          body.payload,
          body.expectedVersion,
          key,
        );
      } else if (body.command === 'create') {
        result = await create(sql, principal, body.payload, key);
        status = 201;
      } else if (['submit', 'approve', 'reject', 'cancel'].includes(body.command)) {
        result = await transition(sql, principal, body.command, body.caseId, body, key);
      } else {
        fail('ACTION_COMMAND_INVALID', 400, 'Comando no permitido');
      }

      if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return send(res, status, {
        ok: true,
        caseType: CASE_TYPE,
        replayed: Boolean(result.replayed),
        data: result.data,
      });
    } catch (error) {
      const safeError = error instanceof ActionCenterError ? error : safeUnexpectedError(error);
      if (safeError) {
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

export { ACTION_CENTER_CONTRACT };
