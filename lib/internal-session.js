import { createHmac, timingSafeEqual } from 'node:crypto';

export const INTERNAL_SESSION_COOKIE = 'municontrol_internal_session';
export const INTERNAL_SESSION_TTL_SECONDS = 12 * 60 * 60;

const TOKEN_VERSION = 'v1';
const TOKEN_ISSUER = 'municipio-junin-friendly-internal';

export class InternalAuthConfigurationError extends Error {
  constructor(variableName) {
    super(`${variableName} no esta configurado`);
    this.name = 'InternalAuthConfigurationError';
    this.code = 'INTERNAL_AUTH_NOT_CONFIGURED';
    this.variableName = variableName;
  }
}

export function getInternalSessionSecret(env = process.env) {
  const secret = env?.INTERNAL_SESSION_SECRET;
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    throw new InternalAuthConfigurationError('INTERNAL_SESSION_SECRET');
  }
  return secret;
}

function toEpochSeconds(value) {
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError('fecha de sesion invalida');
  return Math.floor(milliseconds / 1000);
}

function normalizeIdentity(user) {
  const id = String(user?.id ?? '').trim();
  const email = String(user?.email ?? '').trim().toLowerCase();
  const name = String(user?.displayName ?? user?.name ?? '').trim();
  const role = String(user?.role ?? '').trim();
  if (!id || !email || !role) throw new TypeError('identidad interna incompleta');
  return { id, email, name, role };
}

function sign(unsignedToken, secret) {
  return createHmac('sha256', secret).update(unsignedToken).digest('base64url');
}

function safeSignatureEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual), 'utf8');
  const expectedBuffer = Buffer.from(String(expected), 'utf8');
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function issueInternalSessionToken(user, options = {}) {
  const secret = options.secret ?? getInternalSessionSecret(options.env);
  const now = toEpochSeconds(options.now ?? Date.now());
  const ttlSeconds = options.ttlSeconds ?? INTERNAL_SESSION_TTL_SECONDS;
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new RangeError('duracion de sesion invalida');
  }

  const identity = normalizeIdentity(user);
  const payload = {
    v: 1,
    iss: TOKEN_ISSUER,
    sub: identity.id,
    email: identity.email,
    ...(identity.name ? { name: identity.name } : {}),
    role: identity.role,
    iat: now,
    exp: now + ttlSeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const unsignedToken = `${TOKEN_VERSION}.${encodedPayload}`;
  return `${unsignedToken}.${sign(unsignedToken, secret)}`;
}

export function verifyInternalSessionToken(token, options = {}) {
  try {
    if (typeof token !== 'string' || token.length > 8192) return null;
    const [version, encodedPayload, signature, extra] = token.split('.');
    if (extra !== undefined || version !== TOKEN_VERSION || !encodedPayload || !signature) return null;

    const secret = options.secret ?? getInternalSessionSecret(options.env);
    const unsignedToken = `${version}.${encodedPayload}`;
    if (!safeSignatureEqual(signature, sign(unsignedToken, secret))) return null;

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    const now = toEpochSeconds(options.now ?? Date.now());
    if (payload?.v !== 1 || payload?.iss !== TOKEN_ISSUER) return null;
    if (!Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)) return null;
    if (payload.exp <= payload.iat || now >= payload.exp || payload.iat > now + 60) return null;
    if (!payload.sub || !payload.email || !payload.role) return null;

    return Object.freeze({
      id: String(payload.sub),
      email: String(payload.email),
      ...(typeof payload.name === 'string' && payload.name.trim()
        ? { name: payload.name.trim() }
        : {}),
      role: String(payload.role),
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    });
  } catch (error) {
    if (error instanceof InternalAuthConfigurationError) throw error;
    return null;
  }
}

export function parseCookieHeader(headerValue) {
  const cookies = {};
  if (typeof headerValue !== 'string' || headerValue.length === 0) return cookies;

  for (const part of headerValue.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

function requestCookieHeader(req) {
  if (typeof req?.headers?.get === 'function') return req.headers.get('cookie') || '';
  return req?.headers?.cookie || req?.headers?.Cookie || '';
}

function defaultSecureCookie() {
  return process.env.NODE_ENV === 'production'
    || process.env.VERCEL_ENV === 'production'
    || process.env.VERCEL_ENV === 'preview';
}

export function serializeInternalSessionCookie(token, options = {}) {
  if (typeof token !== 'string' || token.length === 0) throw new TypeError('token requerido');
  const maxAge = options.maxAge ?? INTERNAL_SESSION_TTL_SECONDS;
  if (!Number.isSafeInteger(maxAge) || maxAge <= 0) throw new RangeError('Max-Age invalido');

  const attributes = [
    `${INTERNAL_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.secure ?? defaultSecureCookie()) attributes.push('Secure');
  return attributes.join('; ');
}

export function serializeClearedInternalSessionCookie(options = {}) {
  const attributes = [
    `${INTERNAL_SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.secure ?? defaultSecureCookie()) attributes.push('Secure');
  return attributes.join('; ');
}

export function setInternalSessionCookie(res, token, options = {}) {
  res.setHeader('Set-Cookie', serializeInternalSessionCookie(token, options));
}

export function clearInternalSessionCookie(res, options = {}) {
  res.setHeader('Set-Cookie', serializeClearedInternalSessionCookie(options));
}

export function getInternalSession(req, options = {}) {
  const token = parseCookieHeader(requestCookieHeader(req))[INTERNAL_SESSION_COOKIE];
  if (!token) return null;
  return verifyInternalSessionToken(token, options);
}

function sendAuthError(res, statusCode, code, message) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(statusCode).json({ ok: false, code, error: message });
}

export function requireInternalSession(req, res, options = {}) {
  try {
    const session = getInternalSession(req, options);
    if (!session) {
      sendAuthError(res, 401, 'INTERNAL_SESSION_REQUIRED', 'No autorizado');
      return null;
    }
    return session;
  } catch (error) {
    if (error instanceof InternalAuthConfigurationError) {
      sendAuthError(res, 503, error.code, 'Autenticacion interna no configurada');
      return null;
    }
    sendAuthError(res, 401, 'INTERNAL_SESSION_INVALID', 'No autorizado');
    return null;
  }
}
