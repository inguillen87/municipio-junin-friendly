import { randomUUID } from 'node:crypto';

import {
  parseCookieHeader,
  serializeClearedInternalSessionCookie,
} from '../lib/internal-session.js';
import {
  IDENTITY_SESSION_COOKIE,
  identitySecrets,
  serializeClearedIdentitySessionCookie,
  verifyIdentitySessionToken,
} from '../lib/internal-identity-crypto.js';
import {
  getTenantIdentitySql,
  revokeIdentitySessionForLogout,
} from '../lib/internal-identity-access.js';
import {
  hasManagedIdentityCookie,
  requireCompatibleInternalAccess,
} from '../lib/internal-access-gateway.js';

function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function setResponseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

function managedSessionResponse(access) {
  const user = access.principal?.user || {};
  const tenant = access.principal?.tenant || null;
  const platformRoles = Array.isArray(access.principal?.platform?.roles)
    ? access.principal.platform.roles
    : [];
  const platformCapabilities = normalizedCapabilityList(
    access.principal?.platform?.capabilities,
  );
  const tenantCapabilities = normalizedCapabilityList(
    tenant?.effectiveCapabilities || tenant?.capabilities,
  );
  return {
    ok: true,
    authenticated: true,
    sessionVersion: 2,
    user: {
      id: access.session.id,
      email: user.email || access.session.email,
      name: String(user.name || user.email || access.session.email).trim(),
      role: tenant?.roleKey || platformRoles[0] || 'ACCESO_INTERNO',
    },
    access: {
      context: tenant ? 'tenant' : 'platform',
      tenant: tenant ? { id: tenant.id, slug: tenant.slug, roleKey: tenant.roleKey } : null,
      platformRoles,
      platformCapabilities,
      tenantCapabilities,
    },
    expiresAt: new Date(access.session.expiresAt * 1000).toISOString(),
  };
}

function normalizedCapabilityList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((capability) => String(capability || '').trim())
    .filter((capability) => /^[a-z][a-z0-9._-]{2,119}$/.test(capability)))]
    .sort();
}

function requestCookie(req) {
  if (typeof req?.headers?.get === 'function') return req.headers.get('cookie') || '';
  return req?.headers?.cookie || req?.headers?.Cookie || '';
}

function secureCookie(env) {
  return env?.NODE_ENV === 'production' || env?.VERCEL_ENV === 'production' || env?.VERCEL_ENV === 'preview';
}

function assertLogoutOrigin(req, env) {
  const configured = String(env?.IDENTITY_APP_ORIGIN || env?.INTERNAL_APP_ORIGIN || '').trim();
  const candidate = configured || (env?.VERCEL_URL ? `https://${env.VERCEL_URL}` : '');
  if (!candidate && !secureCookie(env)) return;
  let expected;
  try { expected = new URL(candidate).origin; } catch { expected = ''; }
  const supplied = typeof req?.headers?.get === 'function'
    ? req.headers.get('origin') || ''
    : req?.headers?.origin || req?.headers?.Origin || '';
  if (!expected || supplied !== expected) {
    const error = new Error('logout_origin_forbidden');
    error.code = 'IDENTITY_ORIGIN_FORBIDDEN';
    throw error;
  }
}

function clearAllSessionCookies(res, env) {
  res.setHeader('Set-Cookie', [
    serializeClearedIdentitySessionCookie({ secure: true }),
    serializeClearedInternalSessionCookie({ secure: secureCookie(env) }),
  ]);
}

export function createInternalAuthHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const getIdentitySql = dependencies.getTenantIdentitySql ?? getTenantIdentitySql;
  const getSecrets = dependencies.identitySecrets ?? identitySecrets;
  const requireAccess = dependencies.requireCompatibleInternalAccess ?? requireCompatibleInternalAccess;
  const revokeSession = dependencies.revokeIdentitySessionForLogout ?? revokeIdentitySessionForLogout;
  const generator = dependencies.randomUUID ?? randomUUID;
  const logger = dependencies.logger ?? console;

  return async function handler(req, res) {
  setResponseHeaders(res);
  const method = String(req.method || 'GET').toUpperCase();

  if (method === 'DELETE') {
    let revocationError = null;
    try {
      assertLogoutOrigin(req, env);
      if (hasManagedIdentityCookie(req)) {
        const secrets = getSecrets(env);
        const token = parseCookieHeader(requestCookie(req))[IDENTITY_SESSION_COOKIE];
        const session = verifyIdentitySessionToken(token, { secret: secrets.sessionSecret });
        if (session) {
          const sql = await getIdentitySql(env);
          await revokeSession({ sql, session, idempotencyKey: generator() });
        }
      }
    } catch (error) {
      revocationError = error;
    } finally {
      clearAllSessionCookies(res, env);
    }
    if (revocationError) {
      if (revocationError.code === 'IDENTITY_ORIGIN_FORBIDDEN') {
        return sendJson(res, 403, { ok: false, code: revocationError.code, error: 'Origen no permitido' });
      }
      logger.error('[internal-auth] logout:', revocationError instanceof Error ? revocationError.name : 'error');
      return sendJson(res, 503, {
        ok: false,
        code: 'IDENTITY_LOGOUT_UNAVAILABLE',
        error: 'No se pudo confirmar la revocacion de la sesion',
      });
    }
    return sendJson(res, 200, { ok: true, authenticated: false });
  }

  if (method === 'GET') {
    const access = await requireAccess(req, res, { env, allowLegacy: false });
    if (!access) return undefined;
    return sendJson(res, 200, managedSessionResponse(access));
  }

  if (method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido' });
  }
  return sendJson(res, 410, {
    ok: false,
    code: 'IDENTITY_LOGIN_REQUIRED',
    error: 'Usa el acceso seguro con seleccion de contexto y MFA',
    login: '/login.html',
  });
  };
}

export default createInternalAuthHandler();
