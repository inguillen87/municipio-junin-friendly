import { verifyInternalPassword } from '../lib/internal-password.js';
import { findInternalUserByEmail } from '../lib/internal-neon.js';
import {
  InternalAuthConfigurationError,
  clearInternalSessionCookie,
  getInternalSessionSecret,
  issueInternalSessionToken,
  requireInternalSession,
  setInternalSessionCookie,
  verifyInternalSessionToken,
} from '../lib/internal-session.js';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_BYTES = 4096;

function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function setResponseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function requestContentType(req) {
  if (typeof req?.headers?.get === 'function') return req.headers.get('content-type') || '';
  return req?.headers?.['content-type'] || req?.headers?.['Content-Type'] || '';
}

async function readJsonBody(req) {
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > MAX_BODY_BYTES) throw new RangeError('request_body_too_large');
      return JSON.parse(req.body.toString('utf8'));
    }
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        throw new RangeError('request_body_too_large');
      }
      return JSON.parse(req.body);
    }
    if (typeof req.body === 'object') return req.body;
  }

  if (typeof req?.[Symbol.asyncIterator] !== 'function') return {};
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) throw new RangeError('request_body_too_large');
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function normalizeCredentials(body) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const validEmail = email.length > 3
    && email.length <= MAX_EMAIL_LENGTH
    && /^[^\s@]+@[^\s@]+$/.test(email);
  const validPassword = password.length > 0
    && Buffer.byteLength(password, 'utf8') <= MAX_PASSWORD_BYTES;
  return validEmail && validPassword ? { email, password } : null;
}

function sessionResponse(session) {
  return {
    ok: true,
    authenticated: true,
    user: {
      id: session.id,
      email: session.email,
      name: String(session.name || session.email).trim(),
      role: session.role,
    },
    expiresAt: new Date(session.expiresAt * 1000).toISOString(),
  };
}

function identityFromRow(row) {
  const id = String(row?.id ?? '').trim();
  const email = String(row?.email ?? '').trim().toLowerCase();
  const displayName = String(row?.display_name ?? '').trim();
  const role = String(row?.role ?? '').trim();
  if (!id || !email || !role || typeof row?.password_hash !== 'string') return null;
  return { id, email, displayName, role, passwordHash: row.password_hash };
}

export function createInternalAuthHandler(dependencies = {}) {
  const findUserByEmail = dependencies.findInternalUserByEmail ?? findInternalUserByEmail;

  return async function handler(req, res) {
  setResponseHeaders(res);
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'DELETE') {
    clearInternalSessionCookie(res);
    return sendJson(res, 200, { ok: true, authenticated: false });
  }

  if (method === 'GET') {
    const session = requireInternalSession(req, res);
    if (!session) return;
    return sendJson(res, 200, sessionResponse(session));
  }

  if (method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido' });
  }

  const contentType = requestContentType(req);
  if (!contentType.toLowerCase().includes('application/json')) {
    return sendJson(res, 415, { ok: false, code: 'JSON_REQUIRED', error: 'Se requiere application/json' });
  }

  try {
    const secret = getInternalSessionSecret();
    const credentials = normalizeCredentials(await readJsonBody(req));
    if (!credentials) {
      return sendJson(res, 400, { ok: false, code: 'INVALID_CREDENTIALS_INPUT', error: 'Email y password requeridos' });
    }

    const row = await findUserByEmail(credentials.email);
    const identity = identityFromRow(row);
    const passwordMatches = identity
      ? await verifyInternalPassword(credentials.password, identity.passwordHash)
      : false;

    if (!identity || !passwordMatches) {
      return sendJson(res, 401, { ok: false, code: 'INVALID_CREDENTIALS', error: 'Credenciales incorrectas' });
    }

    const token = issueInternalSessionToken({ ...identity, name: identity.displayName }, { secret });
    setInternalSessionCookie(res, token);
    const session = verifyInternalSessionToken(token, { secret });
    if (!session) return;
    return sendJson(res, 200, sessionResponse(session));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return sendJson(res, 400, { ok: false, code: 'INVALID_JSON', error: 'JSON invalido' });
    }
    if (error instanceof RangeError && error.message === 'request_body_too_large') {
      return sendJson(res, 413, { ok: false, code: 'BODY_TOO_LARGE', error: 'Solicitud demasiado grande' });
    }
    if (error instanceof InternalAuthConfigurationError) {
      return sendJson(res, 503, { ok: false, code: error.code, error: 'Autenticacion interna no configurada' });
    }

    console.error('[internal-auth] Error:', error instanceof Error ? error.message : 'desconocido');
    return sendJson(res, 500, { ok: false, code: 'INTERNAL_AUTH_ERROR', error: 'No se pudo iniciar sesion' });
  }
  };
}

export default createInternalAuthHandler();
