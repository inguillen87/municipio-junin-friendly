import { createHash } from 'node:crypto';

import { parseCookieHeader } from './internal-session.js';
import { getInternalSql } from './internal-neon.js';
import {
  IDENTITY_SESSION_COOKIE,
  verifyIdentitySessionToken,
} from './internal-identity-crypto.js';

export const IDENTITY_RESOURCES = Object.freeze(['bootstrap', 'sessions', 'invitations']);
export const IDENTITY_COMMANDS = Object.freeze([
  'issue_invitation', 'confirm_delivery', 'delivery_failed', 'begin_activation', 'complete_activation',
  'login_session', 'begin_login_context', 'select_login_context', 'begin_login_mfa', 'complete_login_mfa',
  'complete_login_enrollment',
  'begin_mfa_enrollment', 'complete_mfa_enrollment',
  'record_challenge_failure', 'revoke_session', 'logout', 'bind_legacy_access',
  'bind_source', 'certify_data_plane', 'set_delivery_ready',
  'switch_context',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const CAPABILITY = /^[a-z][a-z0-9_.]{2,95}$/;
const VERSIONED_COMMANDS = new Set([
  'issue_invitation', 'confirm_delivery', 'delivery_failed', 'begin_activation', 'complete_activation',
  'select_login_context', 'complete_login_mfa', 'complete_mfa_enrollment',
  'complete_login_enrollment',
  'revoke_session', 'logout', 'switch_context', 'certify_data_plane', 'set_delivery_ready',
]);
const RELEASE_BOUND_COMMANDS = new Set([
  'issue_invitation', 'confirm_delivery', 'begin_activation', 'complete_activation',
]);
const IDENTITY_RUNTIME_ROLE = 'municontrol_actions_runtime_app';
let cachedIdentityDatabaseUrl = null;
let cachedIdentitySqlPromise = null;

export class IdentityGatewayError extends Error {
  constructor(code, status, message, details = null) {
    super(message);
    this.name = 'IdentityGatewayError';
    this.code = code;
    this.status = status;
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      this.details = Object.freeze({ ...details });
    }
  }
}

function fail(code, status, message) {
  throw new IdentityGatewayError(code, status, message);
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : (Array.isArray(result) ? result : []);
}

function productionLike(env) {
  return env?.NODE_ENV === 'production' || env?.VERCEL_ENV === 'production' || env?.VERCEL_ENV === 'preview';
}

export function assertTenantIdentityRuntime(identity) {
  if (identity?.currentUser !== IDENTITY_RUNTIME_ROLE || identity?.sessionUser !== IDENTITY_RUNTIME_ROLE) {
    const error = new Error(`ACTIONS_DATABASE_URL no usa ${IDENTITY_RUNTIME_ROLE}`);
    error.code = 'IDENTITY_DATABASE_ROLE_REQUIRED';
    throw error;
  }
}

export async function getTenantIdentitySql(env = process.env) {
  const configured = String(env?.ACTIONS_DATABASE_URL || '').trim();
  if (!configured) {
    if (productionLike(env)) {
      const error = new Error('ACTIONS_DATABASE_URL no configurada');
      error.code = 'IDENTITY_DATABASE_ROLE_REQUIRED';
      throw error;
    }
    return getInternalSql(env);
  }
  if (productionLike(env) && configured === String(env?.DATABASE_URL || '').trim()) {
    const error = new Error('ACTIONS_DATABASE_URL debe ser un runtime no-owner');
    error.code = 'IDENTITY_DATABASE_ROLE_REQUIRED';
    throw error;
  }
  if (!cachedIdentitySqlPromise || cachedIdentityDatabaseUrl !== configured) {
    cachedIdentityDatabaseUrl = configured;
    cachedIdentitySqlPromise = import('@neondatabase/serverless').then(async ({ neon }) => {
      const sql = neon(configured);
      const result = await sql.query('SELECT current_user AS "currentUser", session_user AS "sessionUser"');
      assertTenantIdentityRuntime(rows(result)[0]);
      return sql;
    }).catch((error) => {
      cachedIdentityDatabaseUrl = null;
      cachedIdentitySqlPromise = null;
      throw error;
    });
  }
  return cachedIdentitySqlPromise;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function exactObject(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('IDENTITY_PAYLOAD_INVALID', 400, `${label} debe ser un objeto`);
  }
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unexpected) fail('IDENTITY_FIELD_UNSUPPORTED', 400, `Campo no soportado: ${unexpected}`);
}

function text(value, name, maximum = 4096) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > maximum) fail('IDENTITY_PAYLOAD_INVALID', 422, `${name} es obligatorio`);
  return normalized;
}

function integer(value, name, minimum = 1) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < minimum) {
    fail('IDENTITY_PAYLOAD_INVALID', 422, `${name} es invalido`);
  }
  return normalized;
}

function uuid(value, name) {
  const normalized = text(value, name, 64).toLowerCase();
  if (!UUID.test(normalized)) fail('IDENTITY_PAYLOAD_INVALID', 422, `${name} es invalido`);
  return normalized;
}

function hash(value, name) {
  const normalized = text(value, name, 64).toLowerCase();
  if (!SHA256.test(normalized)) fail('IDENTITY_PAYLOAD_INVALID', 422, `${name} es invalido`);
  return normalized;
}

function isoFuture(value, name) {
  const normalized = text(value, name, 64);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) fail('IDENTITY_PAYLOAD_INVALID', 422, `${name} es invalido`);
  return parsed.toISOString();
}

function optionalString(value, name, maximum) {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maximum) fail('IDENTITY_PAYLOAD_INVALID', 422, `${name} es invalido`);
  return normalized;
}

function hashList(value, name, maximum = 12) {
  if (!Array.isArray(value) || value.length > maximum || value.some((entry) => !SHA256.test(String(entry)))) {
    fail('IDENTITY_PAYLOAD_INVALID', 422, `${name} es invalido`);
  }
  return [...new Set(value.map((entry) => String(entry).toLowerCase()))];
}

const COMMAND_KEYS = Object.freeze({
  issue_invitation: ['invitationId', 'deliveryAttemptId', 'codeHash', 'expiresAt', 'releaseSha'],
  confirm_delivery: ['invitationId', 'deliveryAttemptId', 'releaseSha'],
  delivery_failed: ['invitationId', 'deliveryAttemptId'],
  begin_activation: ['invitationId', 'codeHash', 'flowHash', 'mfaSecretCiphertext', 'expiresAt', 'releaseSha'],
  complete_activation: [
    'flowHash', 'passwordHash', 'recoveryCodeHashes', 'totpStep',
    'sessionId', 'sessionExpiresAt', 'device', 'ipApprox', 'releaseSha',
  ],
  login_session: ['sessionId', 'activeTenantId', 'sessionExpiresAt', 'device', 'ipApprox'],
  begin_login_context: ['flowHash', 'expiresAt'],
  select_login_context: [
    'flowHash', 'activeTenantId', 'mfaSecretCiphertext',
    'sessionId', 'sessionExpiresAt', 'device', 'ipApprox',
  ],
  begin_login_mfa: ['flowHash', 'activeTenantId', 'expiresAt'],
  complete_login_mfa: [
    'flowHash', 'recoveryCodeHash', 'totpStep', 'sessionId', 'sessionExpiresAt', 'device', 'ipApprox',
  ],
  complete_login_enrollment: [
    'flowHash', 'recoveryCodeHashes', 'totpStep', 'sessionId',
    'sessionExpiresAt', 'device', 'ipApprox',
  ],
  begin_mfa_enrollment: ['flowHash', 'mfaSecretCiphertext', 'expiresAt'],
  complete_mfa_enrollment: [
    'flowHash', 'recoveryCodeHashes', 'totpStep', 'sessionId', 'activeTenantId',
    'sessionExpiresAt', 'device', 'ipApprox',
  ],
  record_challenge_failure: ['flowHash'],
  revoke_session: ['sessionId'],
  logout: ['sessionId'],
  bind_legacy_access: ['userEmail', 'tenantId', 'legacyRole', 'capabilities', 'reason'],
  bind_source: ['tenantId', 'sourceSystem', 'sourceDatabase', 'sourceCompanyId', 'reason'],
  certify_data_plane: ['tenantId', 'sourceBindingId', 'releaseSha', 'reason'],
  set_delivery_ready: ['tenantId', 'ready', 'reason'],
  switch_context: ['currentSessionId', 'newSessionId', 'activeTenantId', 'sessionExpiresAt', 'device', 'ipApprox'],
});

export function normalizeIdentityDatabaseCommand(command, payload, options = {}) {
  if (!IDENTITY_COMMANDS.includes(command)) fail('IDENTITY_COMMAND_INVALID', 400, 'Comando no permitido');
  exactObject(payload, COMMAND_KEYS[command], 'payload');
  const normalized = { ...payload };

  for (const key of ['invitationId', 'sessionId']) {
    if (key in normalized) normalized[key] = uuid(normalized[key], key);
  }
  for (const key of ['activeTenantId']) {
    if (key in normalized && normalized[key] != null) normalized[key] = uuid(normalized[key], key);
  }
  for (const key of ['currentSessionId', 'newSessionId']) {
    if (key in normalized) normalized[key] = uuid(normalized[key], key);
  }
  for (const key of ['codeHash', 'flowHash', 'recoveryCodeHash']) {
    if (key in normalized && normalized[key] != null) normalized[key] = hash(normalized[key], key);
  }
  for (const key of ['expiresAt', 'sessionExpiresAt']) {
    if (key in normalized) normalized[key] = isoFuture(normalized[key], key);
  }
  if ('passwordHash' in normalized) normalized.passwordHash = text(normalized.passwordHash, 'passwordHash', 1024);
  if ('releaseSha' in normalized) {
    normalized.releaseSha = text(normalized.releaseSha, 'releaseSha', 40).toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(normalized.releaseSha)) {
      fail('IDENTITY_RELEASE_NOT_CERTIFIED', 503, 'La version activa no esta certificada');
    }
  }
  if (RELEASE_BOUND_COMMANDS.has(command) && !('releaseSha' in normalized)) {
    fail('IDENTITY_RELEASE_NOT_CERTIFIED', 503, 'La version activa no esta certificada');
  }
  if ('mfaSecretCiphertext' in normalized) {
    normalized.mfaSecretCiphertext = optionalString(normalized.mfaSecretCiphertext, 'mfaSecretCiphertext', 2048);
  }
  if ('recoveryCodeHashes' in normalized) normalized.recoveryCodeHashes = hashList(normalized.recoveryCodeHashes, 'recoveryCodeHashes');
  if ('totpStep' in normalized) normalized.totpStep = integer(normalized.totpStep, 'totpStep', 0);
  if ('deliveryAttemptId' in normalized) {
    normalized.deliveryAttemptId = uuid(normalized.deliveryAttemptId, 'deliveryAttemptId');
    if (!UUID_V4.test(normalized.deliveryAttemptId)) {
      fail('IDENTITY_PAYLOAD_INVALID', 422, 'deliveryAttemptId es invalido');
    }
  }
  if (['issue_invitation', 'confirm_delivery', 'delivery_failed'].includes(command)
      && !Object.hasOwn(normalized, 'deliveryAttemptId')) {
    fail('IDENTITY_PAYLOAD_INVALID', 422, 'deliveryAttemptId es obligatorio');
  }
  if ('device' in normalized) normalized.device = optionalString(normalized.device, 'device', 120) || 'Navegador';
  if ('ipApprox' in normalized) normalized.ipApprox = optionalString(normalized.ipApprox, 'ipApprox', 64);
  if (command === 'bind_legacy_access') {
    normalized.userEmail = text(normalized.userEmail, 'userEmail', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(normalized.userEmail)) fail('IDENTITY_PAYLOAD_INVALID', 422, 'userEmail invalido');
    normalized.tenantId = uuid(normalized.tenantId, 'tenantId');
    normalized.legacyRole = text(normalized.legacyRole, 'legacyRole', 64);
    normalized.reason = text(normalized.reason, 'reason', 500);
    if (!Array.isArray(normalized.capabilities) || normalized.capabilities.length < 1
        || normalized.capabilities.length > 50
        || normalized.capabilities.some((entry) => !CAPABILITY.test(String(entry)))) {
      fail('IDENTITY_PAYLOAD_INVALID', 422, 'capabilities es invalido');
    }
    normalized.capabilities = [...new Set(normalized.capabilities.map(String))].sort();
  } else if (command === 'bind_source') {
    normalized.tenantId = uuid(normalized.tenantId, 'tenantId');
    normalized.sourceSystem = text(normalized.sourceSystem, 'sourceSystem', 32).toUpperCase();
    if (normalized.sourceSystem !== 'GRH') fail('IDENTITY_PAYLOAD_INVALID', 422, 'Solo GRH puede certificarse en este sprint');
    normalized.sourceDatabase = text(normalized.sourceDatabase, 'sourceDatabase', 128);
    normalized.sourceCompanyId = integer(normalized.sourceCompanyId, 'sourceCompanyId');
    normalized.reason = text(normalized.reason, 'reason', 500);
  } else if (command === 'certify_data_plane') {
    normalized.tenantId = uuid(normalized.tenantId, 'tenantId');
    normalized.sourceBindingId = uuid(normalized.sourceBindingId, 'sourceBindingId');
    normalized.releaseSha = text(normalized.releaseSha, 'releaseSha', 40).toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(normalized.releaseSha)) fail('IDENTITY_PAYLOAD_INVALID', 422, 'releaseSha es invalido');
    normalized.reason = text(normalized.reason, 'reason', 500);
  } else if (command === 'set_delivery_ready') {
    normalized.tenantId = uuid(normalized.tenantId, 'tenantId');
    if (typeof normalized.ready !== 'boolean') fail('IDENTITY_PAYLOAD_INVALID', 422, 'ready es invalido');
    normalized.reason = text(normalized.reason, 'reason', 500);
  }

  const idempotencyKey = String(options.idempotencyKey || '').toLowerCase();
  if (!UUID_V4.test(idempotencyKey)) fail('IDENTITY_IDEMPOTENCY_REQUIRED', 428, 'Idempotency-Key UUIDv4 es obligatorio');
  const expectedVersion = options.expectedVersion == null ? null : integer(options.expectedVersion, 'expectedVersion');
  if (VERSIONED_COMMANDS.has(command) && expectedVersion === null) {
    fail('IDENTITY_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio');
  }
  if (!VERSIONED_COMMANDS.has(command) && expectedVersion !== null) {
    fail('IDENTITY_VERSION_UNSUPPORTED', 400, 'expectedVersion no corresponde a este comando');
  }
  const commandHash = createHash('sha256')
    .update(stableJson({ command, expectedVersion, payload: normalized }))
    .digest('hex');
  return Object.freeze({ command, payload: Object.freeze(normalized), idempotencyKey, expectedVersion, commandHash });
}

export async function lookupTenantIdentity(sql, operation, identifier = '', secretHash = '', options = {}) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  const releaseSha = String(options.releaseSha || '').trim().toLowerCase();
  if ((releaseSha && !/^[a-f0-9]{40}$/.test(releaseSha))
      || (['invitation', 'invitation_delivery'].includes(String(operation || '')) && !releaseSha)) {
    fail('IDENTITY_RELEASE_NOT_CERTIFIED', 503, 'La version activa no esta certificada');
  }
  const result = await sql.query(
    'SELECT tenant_identity_lookup($1, $2, $3, $4) AS result',
    [String(operation || ''), String(identifier || '').trim().toLowerCase(),
      String(secretHash || '').toLowerCase(), releaseSha],
  );
  return rows(result)[0]?.result || null;
}

export async function applyTenantIdentityCommand(sql, actorEmail, command) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  const result = await sql.query(`
    SELECT tenant_identity_apply_command($1, $2, $3::uuid, $4, $5, $6::jsonb) AS result
  `, [
    command.command, String(actorEmail || '').trim().toLowerCase(), command.idempotencyKey,
    command.commandHash, command.expectedVersion, JSON.stringify(command.payload),
  ]);
  return rows(result)[0]?.result || {};
}

export async function takeIdentityRateLimit(sql, scope, bucketHash, options = {}) {
  const result = await sql.query(
    'SELECT tenant_identity_take_rate_limit($1, $2, $3, $4, $5) AS result',
    [String(scope || ''), hash(bucketHash, 'bucketHash'), Number(options.limit || 5),
      Number(options.windowSeconds || 300), Number(options.blockSeconds || 900)],
  );
  return rows(result)[0]?.result || { allowed: false, retryAfterSeconds: 60 };
}

export async function recordIdentityChallengeAttempt(sql, flowHash, success, totpStep = null) {
  const result = await sql.query(
    'SELECT tenant_identity_record_attempt($1, $2, $3) AS result',
    [hash(flowHash, 'flowHash'), Boolean(success), totpStep == null ? null : integer(totpStep, 'totpStep', 0)],
  );
  return rows(result)[0]?.result || {};
}

export async function getTenantIdentityCommandReplay(sql, actorEmail, idempotencyKey, releaseSha) {
  const normalizedActor = String(actorEmail || '').trim().toLowerCase();
  const normalizedKey = String(idempotencyKey || '').trim().toLowerCase();
  const normalizedRelease = String(releaseSha || '').trim().toLowerCase();
  if (!normalizedActor || !UUID_V4.test(normalizedKey) || !/^[a-f0-9]{40}$/.test(normalizedRelease)) {
    throw new TypeError('consulta idempotente invalida');
  }
  const result = await sql.query(
    'SELECT tenant_identity_command_replay($1, $2::uuid, $3) AS result',
    [normalizedActor, normalizedKey, normalizedRelease],
  );
  return rows(result)[0]?.result || null;
}

export async function getTenantIdentityView(sql, actorEmail, sessionId, resource = 'bootstrap', limit = 50) {
  if (!IDENTITY_RESOURCES.includes(resource)) fail('IDENTITY_RESOURCE_INVALID', 400, 'Recurso no soportado');
  const result = await sql.query(
    'SELECT tenant_identity_view($1, $2::uuid, $3, $4) AS result',
    [String(actorEmail || '').trim().toLowerCase(), sessionId || null, resource, Number(limit)],
  );
  return rows(result)[0]?.result || {};
}

export async function resolveTenantIdentityAccess(sql, session, options = {}) {
  const required = Array.isArray(options.requiredCapabilities) ? options.requiredCapabilities : [];
  if (required.some((capability) => !CAPABILITY.test(String(capability)))) {
    throw new TypeError('capacidad requerida invalida');
  }
  const mode = options.capabilityMode === 'any' ? 'any' : 'all';
  const result = await sql.query(`
    SELECT tenant_identity_resolve_access($1, $2::uuid, $3, $4, $5::text[], $6) AS result
  `, [session.email, session.id, session.version, session.identityVersion, required, mode]);
  return rows(result)[0]?.result || null;
}

function requestCookie(req) {
  if (typeof req?.headers?.get === 'function') return req.headers.get('cookie') || '';
  return req?.headers?.cookie || req?.headers?.Cookie || '';
}

function accessError(res, status, code, message) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.status(status).json({ ok: false, code, error: message });
  return null;
}

export async function requireInternalAccess(req, res, options = {}) {
  const token = parseCookieHeader(requestCookie(req))[IDENTITY_SESSION_COOKIE];
  const session = verifyIdentitySessionToken(token, { secret: options.sessionSecret, now: options.now });
  if (!session) return accessError(res, 401, 'IDENTITY_SESSION_REQUIRED', 'No autorizado');
  try {
    const principal = await resolveTenantIdentityAccess(options.sql, session, options);
    if (!principal) return accessError(res, 401, 'IDENTITY_SESSION_INVALID', 'No autorizado');
    if (options.requireDataPlaneReady === true
        && (!principal.tenant || principal.tenant.dataPlaneReady !== true)) {
      return accessError(res, 503, 'IDENTITY_DATA_PLANE_NOT_READY', 'El plano de datos no esta certificado');
    }
    if (options.requireDataPlaneReady === true) {
      const expectedReleaseSha = String(options.expectedReleaseSha || '').trim().toLowerCase();
      if (!/^[a-f0-9]{40}$/.test(expectedReleaseSha)
          || principal.tenant.certifiedReleaseSha !== expectedReleaseSha) {
        return accessError(res, 503, 'IDENTITY_RELEASE_NOT_CERTIFIED', 'La version activa no esta certificada');
      }
    }
    if (!principal.authorized) return accessError(res, 403, 'IDENTITY_CAPABILITY_REQUIRED', 'Permiso insuficiente');
    return Object.freeze({ session, principal });
  } catch (error) {
    if (error instanceof IdentityGatewayError) {
      return accessError(res, error.status, error.code, error.message);
    }
    return accessError(res, 503, 'IDENTITY_ACCESS_UNAVAILABLE', 'Autorizacion no disponible');
  }
}

export function identityGatewayDatabaseError(error) {
  const value = String(error?.message || '');
  const mappings = [
    ['IDENTITY_DATA_PLANE_NOT_READY', 503, 'IDENTITY_DATA_PLANE_NOT_READY', 'La activacion permanece bloqueada'],
    ['IDENTITY_RELEASE_NOT_CERTIFIED', 503, 'IDENTITY_RELEASE_NOT_CERTIFIED', 'La version activa no esta certificada'],
    ['IDENTITY_DELIVERY_NOT_READY', 503, 'IDENTITY_DELIVERY_UNAVAILABLE', 'El envio de invitaciones no esta disponible'],
    ['IDENTITY_DELIVERY_ATTEMPT_STALE', 409, 'IDENTITY_DELIVERY_ATTEMPT_STALE', 'El intento de entrega fue reemplazado'],
    ['IDENTITY_NOT_AUTHORIZED', 403, 'IDENTITY_FORBIDDEN', 'No autorizado'],
    ['IDENTITY_CONTEXT_FORBIDDEN', 403, 'IDENTITY_CONTEXT_FORBIDDEN', 'Contexto no autorizado'],
    ['IDENTITY_VERSION_CONFLICT', 409, 'IDENTITY_VERSION_CONFLICT', 'El registro cambio; actualiza y reintenta'],
    ['IDENTITY_IDEMPOTENCY_REUSED', 409, 'IDENTITY_IDEMPOTENCY_REUSED', 'Idempotency-Key reutilizada'],
    ['IDENTITY_CODE_INVALID', 401, 'IDENTITY_CODE_INVALID_OR_EXPIRED', 'Codigo invalido o vencido'],
    ['IDENTITY_FLOW_INVALID', 401, 'IDENTITY_FLOW_INVALID_OR_EXPIRED', 'Flujo invalido o vencido'],
    ['IDENTITY_CHALLENGE_LOCKED', 423, 'IDENTITY_FLOW_LOCKED', 'Flujo bloqueado'],
    ['IDENTITY_MFA_REPLAY', 409, 'IDENTITY_MFA_REPLAY', 'Codigo MFA ya utilizado'],
    ['IDENTITY_MFA_ALREADY_ENROLLED', 409, 'IDENTITY_MFA_ALREADY_ENROLLED', 'MFA ya esta configurado'],
    ['IDENTITY_MFA_REQUIRED', 428, 'IDENTITY_MFA_REQUIRED', 'Se requiere un segundo factor'],
    ['IDENTITY_MEMBERSHIP_INACTIVE', 403, 'IDENTITY_MEMBERSHIP_INACTIVE', 'Membresia inactiva'],
    ['IDENTITY_SESSION_INVALID', 401, 'IDENTITY_SESSION_INVALID', 'No autorizado'],
  ];
  const match = mappings.find(([needle]) => value.includes(needle));
  return match ? new IdentityGatewayError(match[2], match[1], match[3]) : null;
}

export async function revokeIdentitySessionForLogout({ sql, session, idempotencyKey }) {
  if (!session?.id || !session?.email || !Number.isSafeInteger(session?.version)) {
    throw new TypeError('sesion v2 requerida');
  }
  const command = normalizeIdentityDatabaseCommand('logout', { sessionId: session.id }, {
    idempotencyKey, expectedVersion: session.version,
  });
  return applyTenantIdentityCommand(sql, session.email, command);
}

export async function getLegacySessionPolicy(sql, actorEmail) {
  const result = await sql.query(
    'SELECT tenant_identity_legacy_session_policy($1) AS result',
    [String(actorEmail || '').trim().toLowerCase()],
  );
  return rows(result)[0]?.result || null;
}
