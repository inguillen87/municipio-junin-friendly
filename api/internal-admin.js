import { getInternalSql } from '../lib/internal-neon.js';
import { requireInternalSession } from '../lib/internal-session.js';
import {
  InternalAdminError,
  applyInternalAdminCommand,
  getInternalAdminView,
  internalAdminDatabaseError,
  normalizeInternalAdminCommand,
} from '../lib/internal-admin.js';

const MAX_BODY_BYTES = 16 * 1024;
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
let cachedUrl = null;
let cachedSqlPromise = null;

function productionLike(env) {
  return env?.NODE_ENV === 'production' || env?.VERCEL_ENV === 'production' || env?.VERCEL_ENV === 'preview';
}

function header(req, name) {
  const value = typeof req?.headers?.get === 'function'
    ? req.headers.get(name)
    : (req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()]);
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function queryValue(req, name, fallback = '') {
  const value = req?.query?.[name];
  if (Array.isArray(value)) {
    if (value.length !== 1) throw new InternalAdminError('INTERNAL_ADMIN_QUERY_AMBIGUOUS', 400, `Parámetro ${name} ambiguo`);
    return String(value[0] ?? fallback);
  }
  return String(value ?? fallback);
}

function responseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function send(res, status, payload) {
  responseHeaders(res);
  return res.status(status).json(payload);
}

function assertSameOrigin(req, env) {
  const origin = header(req, 'origin').trim();
  if (!origin) {
    if (productionLike(env)) throw new InternalAdminError('INTERNAL_ADMIN_ORIGIN_REQUIRED', 403, 'Origen requerido');
    return;
  }
  let parsed;
  try { parsed = new URL(origin); } catch {
    throw new InternalAdminError('INTERNAL_ADMIN_ORIGIN_INVALID', 403, 'Origen no permitido');
  }
  const protocol = productionLike(env) ? 'https:' : 'http:';
  if (parsed.protocol.toLowerCase() !== protocol || parsed.host.toLowerCase() !== header(req, 'host').toLowerCase()) {
    throw new InternalAdminError('INTERNAL_ADMIN_ORIGIN_INVALID', 403, 'Origen no permitido');
  }
}

async function readBody(req) {
  const declared = Number.parseInt(header(req, 'content-length'), 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new InternalAdminError('INTERNAL_ADMIN_BODY_TOO_LARGE', 413, 'El cuerpo supera 16 KiB');
  }
  let value = req?.body;
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_BODY_BYTES) {
      throw new InternalAdminError('INTERNAL_ADMIN_BODY_TOO_LARGE', 413, 'El cuerpo supera 16 KiB');
    }
    try { value = JSON.parse(value); } catch {
      throw new InternalAdminError('INTERNAL_ADMIN_JSON_INVALID', 400, 'JSON inválido');
    }
  }
  if (value === undefined && typeof req?.[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) {
        throw new InternalAdminError('INTERNAL_ADMIN_BODY_TOO_LARGE', 413, 'El cuerpo supera 16 KiB');
      }
      chunks.push(buffer);
    }
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {
      throw new InternalAdminError('INTERNAL_ADMIN_JSON_INVALID', 400, 'JSON inválido');
    }
  }
  if (value && typeof value === 'object') {
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_BODY_BYTES) {
      throw new InternalAdminError('INTERNAL_ADMIN_BODY_TOO_LARGE', 413, 'El cuerpo supera 16 KiB');
    }
  }
  return value;
}

export function assertInternalAdminRuntimeIdentity(identity) {
  if (identity?.currentUser !== RUNTIME_ROLE || identity?.sessionUser !== RUNTIME_ROLE) {
    const error = new Error(`ACTIONS_DATABASE_URL no usa ${RUNTIME_ROLE}`);
    error.code = 'INTERNAL_ADMIN_DATABASE_ROLE_REQUIRED';
    throw error;
  }
}

export async function getInternalAdminSql(env = process.env) {
  const configured = String(env?.ACTIONS_DATABASE_URL || '').trim();
  if (!configured) {
    if (productionLike(env)) {
      const error = new Error('ACTIONS_DATABASE_URL no configurada');
      error.code = 'INTERNAL_ADMIN_DATABASE_ROLE_REQUIRED';
      throw error;
    }
    return getInternalSql(env);
  }
  if (productionLike(env) && configured === String(env?.DATABASE_URL || '').trim()) {
    const error = new Error('ACTIONS_DATABASE_URL debe ser un runtime no-owner');
    error.code = 'INTERNAL_ADMIN_DATABASE_ROLE_REQUIRED';
    throw error;
  }
  if (!cachedSqlPromise || cachedUrl !== configured) {
    cachedUrl = configured;
    cachedSqlPromise = import('@neondatabase/serverless').then(async ({ neon }) => {
      const sql = neon(configured);
      const identity = await sql.query('SELECT current_user AS "currentUser", session_user AS "sessionUser"');
      assertInternalAdminRuntimeIdentity(identity[0]);
      return sql;
    }).catch((error) => {
      cachedUrl = null;
      cachedSqlPromise = null;
      throw error;
    });
  }
  return cachedSqlPromise;
}

export function createInternalAdminHandler(dependencies = {}) {
  const requireSession = dependencies.requireInternalSession ?? requireInternalSession;
  const getSql = dependencies.getInternalAdminSql ?? getInternalAdminSql;
  const loadView = dependencies.getInternalAdminView ?? getInternalAdminView;
  const applyCommand = dependencies.applyInternalAdminCommand ?? applyInternalAdminCommand;
  const env = dependencies.env ?? process.env;

  return async function handler(req, res) {
    const method = String(req?.method || 'GET').toUpperCase();
    try {
      if (!['GET', 'POST'].includes(method)) {
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido' });
      }
      if (method === 'POST') {
        assertSameOrigin(req, env);
        if (header(req, 'content-type').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
          throw new InternalAdminError('INTERNAL_ADMIN_JSON_REQUIRED', 415, 'Se requiere application/json');
        }
      }
      const session = requireSession(req, res, dependencies.sessionOptions || {});
      if (!session) return undefined;
      const sql = await getSql(env);
      if (method === 'GET') {
        const resource = queryValue(req, 'resource', 'bootstrap');
        const limit = Number(queryValue(req, 'limit', '100'));
        const result = await loadView(sql, session.email, resource, limit);
        return send(res, 200, { ok: true, ...result });
      }
      const body = await readBody(req);
      const command = normalizeInternalAdminCommand(body, header(req, 'idempotency-key').trim());
      const result = await applyCommand(sql, session.email, command);
      return send(res, command.command === 'create_tenant' || command.command === 'invite_user' ? 201 : 200, {
        ok: true, ...result,
      });
    } catch (error) {
      const mapped = error instanceof InternalAdminError ? error : internalAdminDatabaseError(error);
      if (mapped) return send(res, mapped.status, { ok: false, code: mapped.code, error: mapped.message });
      if (error?.code === 'INTERNAL_ADMIN_DATABASE_ROLE_REQUIRED') {
        return send(res, 503, {
          ok: false, code: error.code, error: 'El runtime aislado de administración no está configurado',
        });
      }
      console.error('[internal-admin]', error instanceof Error ? error.name : 'error desconocido');
      return send(res, 503, {
        ok: false, code: 'INTERNAL_ADMIN_UNAVAILABLE', error: 'La administración interna no está disponible',
      });
    }
  };
}

export default createInternalAdminHandler();
