import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import {
  AttendanceGatewayError,
  applyAttendanceCommand,
  getAttendanceBootstrap,
  listAttendanceResources,
} from '../lib/internal-attendance-gateway.js';
import { getReportedAttendanceInventory } from '../lib/internal-attendance-reported-inventory.js';
import { hasEffectivePlatformOwnerAuthority } from '../lib/internal-platform-owner-policy.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';

const MAX_BODY_BYTES = 32 * 1024;
const MUTATION_METHODS = new Set(['POST']);

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

function fail(code, status, message) {
  throw new AttendanceGatewayError(code, status, message);
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
    if (value.length !== 1) fail('ATTENDANCE_QUERY_AMBIGUOUS', 400, `Parámetro ${name} ambiguo`);
    return String(value[0] ?? fallback);
  }
  return String(value ?? fallback);
}

function assertQueryKeys(req, allowed) {
  const extra = Object.keys(req?.query || {}).find((key) => !allowed.has(key));
  if (extra) fail('ATTENDANCE_QUERY_INVALID', 400, `Parámetro no permitido: ${extra}`);
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
    if (productionLike(env)) fail('ATTENDANCE_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
    return '';
  }
  try {
    return new URL(candidate).origin;
  } catch {
    fail('ATTENDANCE_ORIGIN_NOT_CONFIGURED', 503, 'Origen canónico no configurado');
  }
  return '';
}

function assertSameOrigin(req, env) {
  const origin = firstHeader(req, 'origin').trim();
  const fetchSite = firstHeader(req, 'sec-fetch-site').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    fail('ATTENDANCE_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  if (!origin) {
    if (productionLike(env)) fail('ATTENDANCE_ORIGIN_REQUIRED', 403, 'Origen de solicitud no permitido');
    return;
  }
  let actual;
  try {
    actual = new URL(origin).origin;
  } catch {
    fail('ATTENDANCE_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
  const expected = trustedOrigin(env);
  if (expected && actual !== expected) {
    fail('ATTENDANCE_ORIGIN_INVALID', 403, 'Origen de solicitud no permitido');
  }
}

function assertJsonContentType(req) {
  const mediaType = firstHeader(req, 'content-type').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
    fail('ATTENDANCE_CONTENT_TYPE_REQUIRED', 415, 'Content-Type debe ser application/json');
  }
}

async function requestBody(req) {
  const declaredLength = Number.parseInt(firstHeader(req, 'content-length'), 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    fail('ATTENDANCE_BODY_TOO_LARGE', 413, 'El cuerpo supera 32 KiB');
  }
  let value = req?.body;
  if (value === undefined && req && typeof req[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) fail('ATTENDANCE_BODY_TOO_LARGE', 413, 'El cuerpo supera 32 KiB');
      chunks.push(buffer);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_BODY_BYTES) {
      fail('ATTENDANCE_BODY_TOO_LARGE', 413, 'El cuerpo supera 32 KiB');
    }
    try { value = JSON.parse(value); } catch { fail('ATTENDANCE_JSON_INVALID', 400, 'JSON inválido'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ATTENDANCE_BODY_INVALID', 400, 'El cuerpo JSON debe ser un objeto');
  }
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BODY_BYTES) {
    fail('ATTENDANCE_BODY_TOO_LARGE', 413, 'El cuerpo supera 32 KiB');
  }
  return value;
}

function idempotencyKey(req) {
  const value = firstHeader(req, 'idempotency-key').trim();
  if (!value) fail('ATTENDANCE_IDEMPOTENCY_KEY_REQUIRED', 428, 'Idempotency-Key es obligatorio');
  return value;
}

function safeUnexpectedError(error) {
  if (error?.code === 'ACTION_DATABASE_ROLE_REQUIRED') {
    return new AttendanceGatewayError(
      'ATTENDANCE_DATABASE_ROLE_REQUIRED', 503,
      'El rol aislado de marcaciones no está configurado',
    );
  }
  if (error?.code === 'INTERNAL_AUTH_NOT_CONFIGURED') {
    return new AttendanceGatewayError(
      'ATTENDANCE_NOT_CONFIGURED', 503, 'Gateway de marcaciones no configurado',
    );
  }
  return null;
}

export function createInternalAttendanceHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const requireAccess = dependencies.requireCompatibleInternalAccess
    ?? requireCompatibleInternalAccess;
  const getSql = dependencies.getInternalSql ?? getActionCenterSql;
  const bootstrap = dependencies.getAttendanceBootstrap ?? getAttendanceBootstrap;
  const list = dependencies.listAttendanceResources ?? listAttendanceResources;
  const apply = dependencies.applyAttendanceCommand ?? applyAttendanceCommand;
  const reportedInventory = dependencies.getReportedAttendanceInventory
    ?? getReportedAttendanceInventory;

  return async function internalAttendanceHandler(req, res) {
    const method = String(req?.method || 'GET').toUpperCase();
    try {
      if (!['GET', 'POST'].includes(method)) {
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido' });
      }
      let body = null;
      if (MUTATION_METHODS.has(method)) {
        assertSameOrigin(req, env);
        assertJsonContentType(req);
        body = await requestBody(req);
      }
      const requestedResource = method === 'GET'
        ? queryValue(req, 'resource', 'bootstrap').trim().toLowerCase()
        : '';

      const access = await requireAccess(req, res, {
        env,
        requiredCapabilities: [requestedResource === 'audit'
          ? 'attendance.audit.read'
          : 'attendance.read'],
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
          code: 'ATTENDANCE_TENANT_MEMBERSHIP_REQUIRED',
          error: 'Marcaciones exige una membresía municipal activa',
        });
      }

      if (method === 'POST' && body?.command === 'site.create'
          && (!hasEffectivePlatformOwnerAuthority(
            access.principal, ['platform.tenants.manage'],
          ) || access.session?.mfa !== true)) {
        return send(res, 403, {
          ok: false,
          code: 'ATTENDANCE_PLATFORM_OWNER_REQUIRED',
          error: 'El alta de sedes está reservada al propietario vigente de la plataforma',
        });
      }

      if (method === 'GET' && requestedResource === 'reported-inventory') {
        assertQueryKeys(req, new Set(['resource']));
        const result = reportedInventory(access.principal);
        if (!result) {
          return send(res, 404, {
            ok: false,
            code: 'ATTENDANCE_REPORTED_INVENTORY_NOT_AVAILABLE',
            error: 'No hay un inventario reportado para este municipio',
          });
        }
        return send(res, 200, { ok: true, ...result });
      }

      const tenantSession = actionMutationSession(access, env);
      const sql = await getSql(env);

      if (method === 'GET') {
        const resource = requestedResource;
        if (resource === 'bootstrap') {
          assertQueryKeys(req, new Set(['resource']));
          const result = await bootstrap(sql, access.principal, tenantSession);
          const { principal, ...payload } = result;
          return send(res, 200, { ok: true, ...payload });
        }
        assertQueryKeys(req, new Set(['resource', 'page', 'pageSize']));
        const result = await list(sql, access.principal, {
          resource,
          page: queryValue(req, 'page', '1'),
          pageSize: queryValue(req, 'pageSize', '25'),
        }, tenantSession);
        return send(res, 200, { ok: true, ...result });
      }

      assertQueryKeys(req, new Set());
      const result = await apply(
        sql,
        access.principal,
        tenantSession,
        body,
        idempotencyKey(req),
        { identityPepper: env?.ATTENDANCE_IDENTITY_PEPPER },
      );
      if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
      return send(res, 200, { ok: true, replayed: Boolean(result.replayed), data: result.data });
    } catch (error) {
      const safe = error instanceof AttendanceGatewayError ? error : safeUnexpectedError(error);
      if (safe) {
        if (safe.status === 409 && /BUSY/.test(safe.code)) res.setHeader('Retry-After', '1');
        return send(res, safe.status, { ok: false, code: safe.code, error: safe.message });
      }
      console.error('internal-attendance unexpected error', {
        name: error?.name, code: error?.code,
      });
      return send(res, 500, {
        ok: false,
        code: 'ATTENDANCE_INTERNAL_ERROR',
        error: 'No se pudo completar la operación de marcaciones',
      });
    }
  };
}

export default createInternalAttendanceHandler();
