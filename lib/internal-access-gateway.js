import {
  INTERNAL_SESSION_COOKIE,
  parseCookieHeader,
  requireInternalSession,
} from './internal-session.js';
import {
  IDENTITY_SESSION_COOKIE,
  identitySecrets,
} from './internal-identity-crypto.js';
import {
  getTenantIdentitySql,
  requireInternalAccess,
} from './internal-identity-access.js';

function cookieHeader(req) {
  if (typeof req?.headers?.get === 'function') return req.headers.get('cookie') || '';
  return req?.headers?.cookie || req?.headers?.Cookie || '';
}

function requestCookies(req) {
  return parseCookieHeader(cookieHeader(req));
}

export function hasManagedIdentityCookie(req) {
  return Object.prototype.hasOwnProperty.call(requestCookies(req), IDENTITY_SESSION_COOKIE);
}

function sendAccessError(res, status, code, message) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.status(status).json({ ok: false, code, error: message });
  return null;
}

function legacyAccessEnabled(env) {
  if (Object.prototype.hasOwnProperty.call(env || {}, 'IDENTITY_LEGACY_SESSION_ALLOWED')) {
    return String(env.IDENTITY_LEGACY_SESSION_ALLOWED).trim().toLowerCase() === 'true';
  }
  const productionLike = env?.NODE_ENV === 'production'
    || env?.VERCEL_ENV === 'production'
    || env?.VERCEL_ENV === 'preview';
  return !productionLike;
}

function expectedFriendlyBinding(env, override) {
  if (override) return override;
  const tenantId = String(env?.FRIENDLY_TENANT_ID || '').trim().toLowerCase();
  const database = String(env?.FRIENDLY_GRH_SOURCE_DATABASE || '').trim().toLowerCase();
  const companyId = Number(env?.FRIENDLY_GRH_COMPANY_ID);
  if (!tenantId || !database || !Number.isSafeInteger(companyId) || companyId < 1) return null;
  return { tenantId, system: 'GRH', database, companyId };
}

export function principalMatchesFriendlyDataBinding(principal, expected) {
  if (!principal?.tenant || !expected) return false;
  if (String(principal.tenant.id || '').toLowerCase() !== String(expected.tenantId || '').toLowerCase()) {
    return false;
  }
  const bindings = Array.isArray(principal.tenant.sourceBindings)
    ? principal.tenant.sourceBindings
    : [];
  return bindings.some((binding) => (
    String(binding?.system || '').toUpperCase() === String(expected.system || 'GRH').toUpperCase()
    && String(binding?.database || '').toLowerCase() === String(expected.database || '').toLowerCase()
    && Number(binding?.companyId) === Number(expected.companyId)
    && binding?.verified === true
  ));
}

/**
 * Transitional access gateway.
 *
 * A v2 cookie is always authoritative: an invalid/revoked v2 session never
 * falls back to the legacy cookie. Legacy access can be disabled atomically at
 * deploy time with IDENTITY_LEGACY_SESSION_ALLOWED=false after the controlled
 * account migration is complete.
 */
export async function requireCompatibleInternalAccess(req, res, options = {}) {
  const env = options.env ?? process.env;
  const managedCookiePresent = hasManagedIdentityCookie(req);

  if (managedCookiePresent) {
    try {
      const secrets = options.secrets ?? identitySecrets(env);
      const sql = options.sql ?? await (options.getIdentitySql ?? getTenantIdentitySql)(env);
      const access = await (options.requireManagedAccess ?? requireInternalAccess)(req, res, {
        sql,
        sessionSecret: secrets.sessionSecret,
        requiredCapabilities: options.requiredCapabilities ?? [],
        capabilityMode: options.capabilityMode ?? 'all',
        requireDataPlaneReady: options.requireDataPlaneReady === true,
        expectedReleaseSha: options.expectedReleaseSha
          ?? (options.requireDataPlaneReady === true ? env?.VERCEL_GIT_COMMIT_SHA : undefined),
        now: options.now,
      });
      if (!access) return null;
      if (options.requireCertifiedDataBinding === true) {
        const expected = expectedFriendlyBinding(env, options.expectedDataBinding);
        if (!principalMatchesFriendlyDataBinding(access.principal, expected)) {
          return sendAccessError(
            res,
            503,
            'IDENTITY_SOURCE_BINDING_REQUIRED',
            'La fuente municipal certificada no coincide con este despliegue',
          );
        }
      }
      return Object.freeze({ mode: 'managed', ...access });
    } catch (error) {
      if (error?.name === 'InternalAuthConfigurationError'
          || error?.code === 'IDENTITY_DATABASE_ROLE_REQUIRED') {
        return sendAccessError(res, 503, 'IDENTITY_ACCESS_UNAVAILABLE', 'Autorizacion no disponible');
      }
      throw error;
    }
  }

  if (options.allowLegacy === false || !legacyAccessEnabled(env)) {
    const legacyCookiePresent = Object.prototype.hasOwnProperty.call(requestCookies(req), INTERNAL_SESSION_COOKIE);
    return sendAccessError(
      res,
      401,
      legacyCookiePresent ? 'IDENTITY_SESSION_UPGRADE_REQUIRED' : 'IDENTITY_SESSION_REQUIRED',
      legacyCookiePresent ? 'La sesion debe renovarse con el nuevo acceso seguro' : 'No autorizado',
    );
  }

  const requireLegacy = options.requireLegacySession ?? requireInternalSession;
  const session = requireLegacy(req, res, options.legacySessionOptions || {});
  if (!session) return null;
  return Object.freeze({ mode: 'legacy', session, principal: null });
}
