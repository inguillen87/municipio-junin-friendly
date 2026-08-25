import { randomUUID } from 'node:crypto';

import {
  InternalCertifiedReleaseError,
  resolveInternalCertifiedReleaseSha,
} from '../lib/internal-certified-release.js';
import { hashInternalPassword, verifyInternalPassword } from '../lib/internal-password.js';
import {
  InvitationDeliveryError,
  createResendInvitationDelivery,
} from '../lib/internal-invitation-delivery.js';
import {
  MfaEmailDeliveryError,
  createResendMfaEmailDelivery,
} from '../lib/internal-mfa-email-delivery.js';
import {
  getInternalSession,
  parseCookieHeader,
  serializeClearedInternalSessionCookie,
} from '../lib/internal-session.js';
import {
  IDENTITY_FLOW_TTL_SECONDS,
  IDENTITY_INVITATION_TTL_SECONDS,
  IDENTITY_SESSION_COOKIE,
  IDENTITY_SESSION_TTL_SECONDS,
  createFlowToken,
  createInvitationCode,
  createRecoveryCodes,
  createTotpEnrollment,
  decryptEmailMfaDestination,
  decryptMfaSecret,
  emailMfaCode,
  encryptMfaSecret,
  hashIdentitySecret,
  identitySecrets,
  issueIdentitySessionToken,
  maskEmailDestination,
  matchTotpStep,
  normalizeInvitationCode,
  normalizeEmailMfaCode,
  normalizeRecoveryCode,
  serializeClearedIdentitySessionCookie,
  serializeIdentitySessionCookie,
  totpEnrollmentFromSecret,
  verifyIdentitySessionToken,
} from '../lib/internal-identity-crypto.js';
import {
  IDENTITY_RESOURCES,
  IdentityGatewayError,
  applyTenantIdentityCommand,
  applyTenantIdentityPlatformCommand,
  completeIdentityEmailMfa,
  getLegacySessionPolicy,
  getTenantIdentityPlatformCommandReplay,
  getTenantIdentityPlatformInvitationsView,
  getTenantIdentitySourceOnboardingView,
  getTenantIdentitySql,
  getTenantIdentityView,
  identityGatewayDatabaseError,
  lookupTenantInvitationDelivery,
  lookupTenantIdentity,
  markIdentityEmailMfaDelivery,
  normalizeIdentityDatabaseCommand,
  prepareIdentityEmailMfa,
  recordIdentityChallengeAttempt,
  resolveTenantIdentityAccess,
  revokeIdentitySessionForLogout,
  takeIdentityRateLimit,
} from '../lib/internal-identity-access.js';

const MAX_BODY_BYTES = 16 * 1024;
const DUMMY_PASSWORD_HASH = 'scrypt$16384$8$1$R0dHR0dHR0dHR0dHR0dHRw$sCqc4_u2rJULQEkXAuvGyxs8APXfS0S3tj1-cWJAPYxQTt6ZXmFC5D3-SRBZSsBAjgWf6AMEXQnmA4nn7G1KJg';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTITY_DELIVERY_RETRY_MAX_AGE_SECONDS = 23 * 60 * 60;
const IDENTITY_EMAIL_MFA_TTL_SECONDS = 5 * 60;

function header(req, name) {
  const value = typeof req?.headers?.get === 'function'
    ? req.headers.get(name)
    : (req?.headers?.[name] ?? req?.headers?.[name.toLowerCase()]);
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function responseHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Vary', 'Cookie, Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function send(res, status, payload) {
  responseHeaders(res);
  return res.status(status).json(payload);
}

function fail(code, status, message) {
  throw new IdentityGatewayError(code, status, message);
}

function failMfaAttempt(attempt) {
  const expected = Number(attempt?.version);
  const remaining = Number(attempt?.remainingAttempts);
  const details = {
    ...(Number.isSafeInteger(expected) && expected > 0 ? { expectedVersion: expected } : {}),
    ...(Number.isSafeInteger(remaining) && remaining >= 0 ? { remainingAttempts: remaining } : {}),
  };
  if (attempt?.locked === true) {
    throw new IdentityGatewayError('IDENTITY_FLOW_LOCKED', 423, 'Flujo bloqueado', details);
  }
  throw new IdentityGatewayError('IDENTITY_MFA_INVALID', 401, 'Codigo invalido', details);
}

function trustedOrigin(env) {
  const configured = String(env?.IDENTITY_APP_ORIGIN || env?.INTERNAL_APP_ORIGIN || '').trim();
  const candidate = configured || (env?.VERCEL_URL ? `https://${env.VERCEL_URL}` : '');
  if (!candidate) fail('IDENTITY_ORIGIN_NOT_CONFIGURED', 503, 'Origen canonico no configurado');
  try { return new URL(candidate).origin; } catch {
    fail('IDENTITY_ORIGIN_NOT_CONFIGURED', 503, 'Origen canonico no configurado');
  }
  return '';
}

function certifiedReleaseSha(env) {
  try {
    return resolveInternalCertifiedReleaseSha(env);
  } catch (error) {
    if (!(error instanceof InternalCertifiedReleaseError)) throw error;
    fail('IDENTITY_RELEASE_NOT_CERTIFIED', 503, 'La version activa no esta certificada');
  }
}

function assertSameOrigin(req, env) {
  const origin = header(req, 'origin').trim();
  if (!origin || origin !== trustedOrigin(env)) fail('IDENTITY_ORIGIN_FORBIDDEN', 403, 'Origen no permitido');
  const fetchSite = header(req, 'sec-fetch-site').trim().toLowerCase();
  if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
    fail('IDENTITY_ORIGIN_FORBIDDEN', 403, 'Origen no permitido');
  }
}

async function readBody(req) {
  const declared = Number.parseInt(header(req, 'content-length'), 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) fail('IDENTITY_BODY_TOO_LARGE', 413, 'Solicitud demasiado grande');
  let value = req?.body;
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > MAX_BODY_BYTES) fail('IDENTITY_BODY_TOO_LARGE', 413, 'Solicitud demasiado grande');
    try { value = JSON.parse(value); } catch { fail('IDENTITY_JSON_INVALID', 400, 'JSON invalido'); }
  }
  if (value === undefined && typeof req?.[Symbol.asyncIterator] === 'function') {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES) fail('IDENTITY_BODY_TOO_LARGE', 413, 'Solicitud demasiado grande');
      chunks.push(buffer);
    }
    try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail('IDENTITY_JSON_INVALID', 400, 'JSON invalido'); }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('IDENTITY_PAYLOAD_INVALID', 400, 'Solicitud invalida');
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BODY_BYTES) fail('IDENTITY_BODY_TOO_LARGE', 413, 'Solicitud demasiado grande');
  const unexpected = Object.keys(value).find((key) => !['command', 'payload', 'expectedVersion'].includes(key));
  if (unexpected || typeof value.command !== 'string' || !value.payload || typeof value.payload !== 'object'
      || Array.isArray(value.payload)) fail('IDENTITY_PAYLOAD_INVALID', 400, 'Solicitud invalida');
  return value;
}

function queryResource(req) {
  const value = req?.query?.resource;
  if (Array.isArray(value)) fail('IDENTITY_QUERY_INVALID', 400, 'Recurso ambiguo');
  const resource = String(value || 'bootstrap').trim().toLowerCase();
  if (!IDENTITY_RESOURCES.includes(resource)) fail('IDENTITY_RESOURCE_INVALID', 400, 'Recurso no soportado');
  return resource;
}

function sourceOnboardingTenantId(req) {
  const query = req?.query;
  if (!query || typeof query !== 'object' || Array.isArray(query)
      || query.resource !== 'source_onboarding'
      || Object.keys(query).some((key) => !['resource', 'tenantId'].includes(key))) {
    fail('IDENTITY_QUERY_INVALID', 400, 'Consulta invalida');
  }
  const value = query.tenantId;
  if (Array.isArray(value) || typeof value !== 'string' || value !== value.trim() || !UUID.test(value)) {
    fail('IDENTITY_QUERY_INVALID', 400, 'tenantId invalido');
  }
  return value.toLowerCase();
}

function email(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(normalized) ? normalized : '';
}

function password(value) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 1024 ? value : '';
}

function assertPasswordPolicy(value) {
  const bytes = Buffer.byteLength(value, 'utf8');
  if (value.length < 12 || bytes > 256) fail('IDENTITY_PASSWORD_POLICY', 422, 'La contrasena debe tener entre 12 y 256 caracteres');
}

function exactPayload(payload, allowed) {
  const set = new Set(allowed);
  if (Object.keys(payload).some((key) => !set.has(key))) fail('IDENTITY_FIELD_UNSUPPORTED', 400, 'Campo no soportado');
}

function assertInvitationDeliveryConfigured(deliverInvitation) {
  if (typeof deliverInvitation !== 'function') {
    fail('IDENTITY_DELIVERY_UNAVAILABLE', 503, 'Canal de entrega no disponible');
  }
  try {
    if (typeof deliverInvitation.assertConfigured === 'function') {
      deliverInvitation.assertConfigured();
    }
  } catch {
    fail('IDENTITY_DELIVERY_UNAVAILABLE', 503, 'Canal de entrega no disponible');
  }
}

function assertMfaEmailDeliveryConfigured(delivery) {
  if (!delivery || typeof delivery.deliver !== 'function'
      || typeof delivery.isConfigured !== 'function' || delivery.isConfigured() !== true) {
    fail('IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE', 503,
      'El envio de codigos por correo no esta disponible');
  }
}

function assertReplayInsideDeliveryWindow(replay, now) {
  const expiresAt = Date.parse(String(replay?.result?.invitation?.delivery?.expiresAt || ''));
  const issuedAt = expiresAt - (IDENTITY_INVITATION_TTL_SECONDS * 1000);
  const age = now.getTime() - issuedAt;
  if (!Number.isFinite(expiresAt) || !Number.isFinite(age) || age < 0
      || age >= IDENTITY_DELIVERY_RETRY_MAX_AGE_SECONDS * 1000) {
    fail('IDENTITY_DELIVERY_UNAVAILABLE', 503, 'Canal de entrega no disponible');
  }
}

function nowDate(dependencies) {
  const value = (dependencies.now ?? Date.now)();
  return value instanceof Date ? value : new Date(value);
}

function futureIso(now, seconds) {
  return new Date(now.getTime() + (seconds * 1000)).toISOString();
}

function requestCookie(req) {
  return header(req, 'cookie');
}

function secureCookie(env) {
  return env?.NODE_ENV === 'production' || env?.VERCEL_ENV === 'production' || env?.VERCEL_ENV === 'preview';
}

function ipApprox(req) {
  const raw = header(req, 'x-vercel-forwarded-for').split(',')[0].trim();
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(raw)) {
    const parts = raw.split('.').map(Number);
    if (parts.every((part) => part >= 0 && part <= 255)) return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  if (/^[a-f0-9:]+$/i.test(raw) && raw.includes(':')) {
    const groups = raw.toLowerCase().split(':').filter(Boolean).slice(0, 3);
    if (groups.length) return `${groups.join(':')}::/48`;
  }
  return null;
}

function deviceLabel(req) {
  const agent = header(req, 'user-agent').toLowerCase();
  const browser = agent.includes('edg/') ? 'Edge'
    : agent.includes('firefox/') ? 'Firefox'
      : agent.includes('chrome/') ? 'Chrome'
        : agent.includes('safari/') ? 'Safari' : 'Navegador';
  return /mobile|android|iphone/.test(agent) ? `${browser} movil` : browser;
}

function idempotency(req, generator, required = false) {
  const value = header(req, 'idempotency-key').trim().toLowerCase();
  if (value) {
    if (!UUID_V4.test(value)) fail('IDENTITY_IDEMPOTENCY_REQUIRED', 428, 'Idempotency-Key UUIDv4 es obligatorio');
    return value;
  }
  if (required) fail('IDENTITY_IDEMPOTENCY_REQUIRED', 428, 'Idempotency-Key UUIDv4 es obligatorio');
  return generator();
}

function expectedVersion(body, required = false) {
  if (body.expectedVersion == null) {
    if (required) fail('IDENTITY_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio');
    return null;
  }
  const value = Number(body.expectedVersion);
  if (!Number.isSafeInteger(value) || value < 1) fail('IDENTITY_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio');
  return value;
}

function activeTenantFromContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    fail('IDENTITY_CONTEXT_FORBIDDEN', 403, 'Contexto invalido');
  }
  const kind = String(context.kind || '');
  if (kind === 'platform') return null;
  if (kind === 'tenant' && /^[0-9a-f-]{36}$/i.test(String(context.tenantId || ''))) {
    return String(context.tenantId).toLowerCase();
  }
  fail('IDENTITY_CONTEXT_FORBIDDEN', 403, 'Contexto invalido');
  return undefined;
}

function sessionPayload(session) {
  return {
    id: session.id, version: session.version, authLevel: session.authLevel,
    expiresAt: session.expiresAt, tenantId: session.tenantId, source: session.source,
  };
}

function setSessionCookie(res, registeredSession, secrets, env, now) {
  const ttlSeconds = Math.max(60, Math.floor((new Date(registeredSession.expiresAt).getTime() - now.getTime()) / 1000));
  const token = issueIdentitySessionToken({
    id: registeredSession.id, email: registeredSession.email,
    version: registeredSession.version, identityVersion: registeredSession.identityVersion,
  }, { secret: secrets.sessionSecret, now, ttlSeconds });
  res.setHeader('Set-Cookie', [
    serializeIdentitySessionCookie(token),
    serializeClearedInternalSessionCookie({ secure: secureCookie(env) }),
  ]);
}

function clearAllIdentityCookies(res, env) {
  res.setHeader('Set-Cookie', [
    serializeClearedIdentitySessionCookie(),
    serializeClearedInternalSessionCookie({ secure: secureCookie(env) }),
  ]);
}

async function rateLimit(sql, scope, identifier, req, secrets) {
  const accountBucket = hashIdentitySecret(`${scope}|account|${identifier || 'anonymous'}`, secrets.tokenPepper);
  const ipBucket = hashIdentitySecret(`${scope}|trusted-ip|${ipApprox(req) || 'unavailable'}`, secrets.tokenPepper);
  const [accountResult, ipResult] = await Promise.all([
    takeIdentityRateLimit(sql, `${scope}.account`, accountBucket, { limit: 6, windowSeconds: 300, blockSeconds: 900 }),
    takeIdentityRateLimit(sql, `${scope}.ip`, ipBucket, { limit: 30, windowSeconds: 300, blockSeconds: 900 }),
  ]);
  if (accountResult.allowed !== true || ipResult.allowed !== true) {
    const error = new IdentityGatewayError('IDENTITY_RATE_LIMITED', 429, 'Demasiados intentos');
    error.retryAfter = Math.max(Number(accountResult.retryAfterSeconds || 0), Number(ipResult.retryAfterSeconds || 0), 60);
    throw error;
  }
}

function newSessionPayload(req, now, generator, activeTenantId = undefined) {
  return {
    sessionId: generator(), ...(activeTenantId !== undefined ? { activeTenantId } : {}),
    sessionExpiresAt: futureIso(now, IDENTITY_SESSION_TTL_SECONDS),
    device: deviceLabel(req), ipApprox: ipApprox(req),
  };
}

function invitationCodeFor(invitationId, idempotencyKey, secrets) {
  const entropy = Buffer.from(hashIdentitySecret(
    `invitation-code|${invitationId}|${idempotencyKey}`,
    secrets.tokenPepper,
  ), 'hex');
  return createInvitationCode((size) => entropy.subarray(0, size));
}

function assertCompletedFlowReplay(flow, requestKey, expectedPurpose, expectedAuthLevel = null) {
  if (flow?.status !== 'consumed') return null;
  if (flow.purpose !== expectedPurpose || flow.completionIdempotencyKey !== requestKey
      || !flow.completedSession
      || (expectedAuthLevel && flow.completedSession.authLevel !== expectedAuthLevel)) {
    fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
  }
  return flow.completedSession;
}

function emailDestinationHash(destination, secrets) {
  return hashIdentitySecret(
    `email-mfa-destination|${destination}`,
    secrets.emailMfaPepper,
  );
}

function emailCodeHash(code, deliveryAttemptId, secrets) {
  return hashIdentitySecret(
    `email-mfa-code|${deliveryAttemptId}|${code}`,
    secrets.emailMfaPepper,
  );
}

function assertEmailMfaSecretsConfigured(secrets) {
  if (typeof secrets?.emailMfaPepper !== 'string'
      || Buffer.byteLength(secrets.emailMfaPepper, 'utf8') < 32
      || !Buffer.isBuffer(secrets?.emailMfaEncryptionKey)
      || secrets.emailMfaEncryptionKey.length !== 32) {
    fail('IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE', 503,
      'El envio de codigos por correo no esta disponible');
  }
}

function safePreparedEmailMfa(prepared, deliveryAttemptId, flow, secrets) {
  const databaseId = String(prepared?.id || prepared?.challengeId || '').trim().toLowerCase();
  const attemptId = String(prepared?.deliveryAttemptId || '').trim().toLowerCase();
  const destinationCiphertext = String(prepared?.destinationCiphertext || '');
  const destinationHash = String(prepared?.destinationHash || '').trim().toLowerCase();
  const expiresAt = String(prepared?.expiresAt || '');
  const status = String(prepared?.status || '');
  const flowVersion = Number(prepared?.flowVersion ?? flow?.version);
  const challengeVersion = Number(prepared?.version);
  const destination = decryptEmailMfaDestination(
    destinationCiphertext,
    secrets.emailMfaEncryptionKey,
  );
  if (!UUID.test(databaseId) || attemptId !== deliveryAttemptId
      || !/^[a-f0-9]{64}$/.test(destinationHash)
      || !destination || emailDestinationHash(destination, secrets) !== destinationHash
      || !Number.isFinite(Date.parse(expiresAt))
      || !['pending_delivery', 'active'].includes(status)
      || !Number.isSafeInteger(flowVersion) || flowVersion < 1
      || !Number.isSafeInteger(challengeVersion) || challengeVersion < 1) {
    fail('IDENTITY_GATEWAY_UNAVAILABLE', 503, 'Gateway de identidad no disponible');
  }
  return Object.freeze({
    id: attemptId, databaseId, deliveryAttemptId: attemptId,
    destination, expiresAt, status, flowVersion, challengeVersion,
    maskedDestination: maskEmailDestination(destination),
  });
}

function emailMfaResponse(challenge, delivery = null) {
  const scheduledExpiry = delivery?.temporaryRouteExpiryMode === 'scheduled'
    && typeof delivery.temporaryRouteExpiresAt === 'string'
    && Number.isFinite(Date.parse(delivery.temporaryRouteExpiresAt));
  const manualExpiry = delivery?.temporaryRouteExpiryMode === 'manual'
    && delivery.temporaryRouteExpiresAt === null;
  const temporary = delivery?.temporarySharedInbox === true
    && typeof delivery.maskedDestination === 'string'
    && delivery.maskedDestination.length >= 5
    && delivery.maskedDestination.length <= 254
    && !/[\u0000-\u001f\u007f]/.test(delivery.maskedDestination)
    && (scheduledExpiry || manualExpiry);
  return {
    id: challenge.id,
    maskedDestination: temporary ? delivery.maskedDestination : challenge.maskedDestination,
    expiresAt: challenge.expiresAt,
    retryAfterSeconds: 45,
    expectedVersion: challenge.challengeVersion,
    ...(temporary ? {
      temporarySharedInbox: true,
      temporaryRouteExpiresAt: delivery.temporaryRouteExpiresAt,
      temporaryRouteExpiryMode: delivery.temporaryRouteExpiryMode,
    } : {}),
  };
}

async function currentIdentity(req, sql, secrets, env, options = {}) {
  const cookies = parseCookieHeader(requestCookie(req));
  const v2Present = Object.hasOwn(cookies, IDENTITY_SESSION_COOKIE);
  if (v2Present) {
    const session = verifyIdentitySessionToken(cookies[IDENTITY_SESSION_COOKIE], { secret: secrets.sessionSecret, now: options.now });
    if (!session) fail('IDENTITY_SESSION_INVALID', 401, 'No autorizado');
    const principal = await resolveTenantIdentityAccess(sql, session, {
      requiredCapabilities: options.requiredCapabilities || [],
    });
    if (!principal) fail('IDENTITY_SESSION_INVALID', 401, 'No autorizado');
    return { kind: 'v2', session, principal };
  }
  if (!options.allowLegacy) fail('IDENTITY_SESSION_REQUIRED', 401, 'No autorizado');
  const legacy = getInternalSession(req, { secret: secrets.sessionSecret, now: options.now });
  if (!legacy) fail('IDENTITY_SESSION_REQUIRED', 401, 'No autorizado');
  const policy = await getLegacySessionPolicy(sql, legacy.email);
  if (!policy?.legacySessionAllowed) fail('IDENTITY_UPGRADE_REQUIRED', 401, 'La sesion debe actualizarse');
  return { kind: 'v1', session: legacy, principal: null, policy };
}

function assertPlatformCapability(identity, capability) {
  const capabilities = identity?.principal?.platform?.capabilities;
  if (identity?.kind !== 'v2' || identity?.principal?.tenant !== null
      || !Array.isArray(capabilities) || !capabilities.includes(capability)
      || identity.session?.identityVersion == null) fail('IDENTITY_FORBIDDEN', 403, 'No autorizado');
}

function assertGovernedPlatformCapability(identity, capability) {
  assertPlatformCapability(identity, capability);
  if (identity?.principal?.authorized !== true || identity?.principal?.session?.mfa !== true) {
    fail('IDENTITY_FORBIDDEN', 403, 'No autorizado');
  }
}

function safeSourceBindingResult(result, expected = {}) {
  const sourceBinding = result?.sourceBinding && typeof result.sourceBinding === 'object'
    ? result.sourceBinding : {};
  const canonicalEvidence = result?.canonicalEvidence && typeof result.canonicalEvidence === 'object'
    ? result.canonicalEvidence : {};
  const bindingId = String(sourceBinding.id || '').trim().toLowerCase();
  const tenantId = String(sourceBinding.tenantId || '').trim().toLowerCase();
  const sourceSystem = String(sourceBinding.sourceSystem || '').trim().toUpperCase();
  const sourceDatabase = String(sourceBinding.sourceDatabase || '').trim();
  const sourceCompanyId = Number(sourceBinding.sourceCompanyId);
  const sourceBatchId = String(canonicalEvidence.sourceBatchId || '').trim().toLowerCase();
  const sourceCutoff = String(canonicalEvidence.sourceCutoff || '').trim();
  const contractCount = Number(canonicalEvidence.contractCount);
  const policyVersion = Number(result?.policyVersion);
  if (!UUID.test(bindingId) || !UUID.test(tenantId)
      || tenantId !== String(expected.tenantId || '').trim().toLowerCase()
      || sourceSystem !== 'GRH'
      || sourceDatabase !== String(expected.sourceDatabase || '').trim()
      || !Number.isSafeInteger(sourceCompanyId)
      || sourceCompanyId !== Number(expected.sourceCompanyId)
      || sourceBinding.verified !== true
      || !UUID.test(sourceBatchId) || !Number.isFinite(Date.parse(sourceCutoff))
      || canonicalEvidence.validationState !== 'published'
      || !Number.isSafeInteger(contractCount) || contractCount < 1
      || !Number.isSafeInteger(policyVersion) || policyVersion < 1) {
    fail('IDENTITY_GATEWAY_UNAVAILABLE', 503, 'Gateway de identidad no disponible');
  }
  return {
    sourceBinding: {
      id: bindingId,
      tenantId,
      sourceSystem: 'GRH',
      verified: true,
    },
    canonicalEvidence: {
      sourceCutoff,
      validationState: 'published',
      contractCount,
    },
    policyVersion,
    replayed: result?.replayed === true,
  };
}

function safeDataPlaneCertificationResult(result, tenantId, sourceBindingId) {
  const policy = result?.policy && typeof result.policy === 'object' ? result.policy : null;
  const expectedTenantId = String(tenantId || '').trim().toLowerCase();
  const expectedSourceBindingId = String(sourceBindingId || '').trim().toLowerCase();
  const policyTenantId = String(policy?.tenantId || '').trim().toLowerCase();
  const policySourceBindingId = String(policy?.sourceBindingId || '').trim().toLowerCase();
  const version = Number(policy?.version);
  if (!policy || !UUID.test(policyTenantId) || policyTenantId !== expectedTenantId
      || !UUID.test(policySourceBindingId) || policySourceBindingId !== expectedSourceBindingId
      || policy.dataPlaneReady !== true || policy.deliveryReady !== false
      || !Number.isSafeInteger(version) || version < 1) {
    fail('IDENTITY_GATEWAY_UNAVAILABLE', 503, 'Gateway de identidad no disponible');
  }
  return {
    policy: {
      tenantId: policyTenantId,
      dataPlaneReady: true,
      deliveryReady: false,
      version,
      sourceBindingId: policySourceBindingId,
    },
    replayed: result?.replayed === true,
  };
}

function safeSourceOnboardingView(result, tenantId) {
  const identityPolicy = result?.identityPolicy && typeof result.identityPolicy === 'object'
    ? result.identityPolicy : null;
  const sourceBinding = result?.sourceBinding && typeof result.sourceBinding === 'object'
    ? result.sourceBinding : null;
  const canonicalEvidence = result?.canonicalEvidence && typeof result.canonicalEvidence === 'object'
    ? result.canonicalEvidence : null;
  const policyVersion = Number(identityPolicy?.version);
  const allowedCommands = Array.isArray(result?.allowedCommands) ? result.allowedCommands : null;
  const bindingTenantId = sourceBinding?.tenantId == null
    ? tenantId : String(sourceBinding.tenantId).trim().toLowerCase();
  const bindingValid = sourceBinding === null || (
    UUID.test(String(sourceBinding.id || ''))
    && bindingTenantId === tenantId
    && sourceBinding.sourceSystem === 'GRH'
    && sourceBinding.verified === true
  );
  const cutoff = canonicalEvidence?.sourceCutoff == null
    ? NaN : Date.parse(String(canonicalEvidence.sourceCutoff));
  const contractCount = Number(canonicalEvidence?.contractCount);
  const evidenceValid = canonicalEvidence === null || (
    Number.isFinite(cutoff)
    && canonicalEvidence.validationState === 'published'
    && Number.isSafeInteger(contractCount)
    && contractCount > 0
  );
  const expectedCommands = identityPolicy?.dataPlaneReady === true
    ? [] : (sourceBinding === null ? ['bind_source'] : ['certify_data_plane']);
  const commandsValid = Array.isArray(allowedCommands)
    && allowedCommands.length === expectedCommands.length
    && allowedCommands.every((command, index) => command === expectedCommands[index]);
  if (!identityPolicy || !Number.isSafeInteger(policyVersion) || policyVersion < 1
      || typeof identityPolicy.dataPlaneReady !== 'boolean'
      || (sourceBinding === null) !== (canonicalEvidence === null)
      || !bindingValid || !evidenceValid || !commandsValid
      || (identityPolicy.dataPlaneReady === true && sourceBinding === null)) {
    fail('IDENTITY_GATEWAY_UNAVAILABLE', 503, 'Gateway de identidad no disponible');
  }
  return {
    identityPolicy: {
      version: policyVersion,
      dataPlaneReady: identityPolicy.dataPlaneReady,
    },
    allowedCommands: expectedCommands,
    ...(sourceBinding ? {
      sourceBinding: {
        id: String(sourceBinding.id).toLowerCase(),
        tenantId,
        sourceSystem: 'GRH',
        verified: true,
      },
      canonicalEvidence: {
        sourceCutoff: String(canonicalEvidence.sourceCutoff),
        validationState: 'published',
        contractCount,
      },
    } : {}),
  };
}

async function apply(sql, actorEmail, command, payload, options) {
  const normalized = normalizeIdentityDatabaseCommand(command, payload, options);
  return applyTenantIdentityCommand(sql, actorEmail, normalized);
}

async function applyPlatform(sql, session, releaseSha, command, payload, options) {
  const normalized = normalizeIdentityDatabaseCommand(command, payload, options);
  return applyTenantIdentityPlatformCommand(sql, session, releaseSha, normalized);
}

export function createInternalIdentityHandler(dependencies = {}) {
  const env = dependencies.env ?? process.env;
  const getSql = dependencies.getTenantIdentitySql ?? getTenantIdentitySql;
  const generator = dependencies.randomUUID ?? randomUUID;
  const deliverInvitation = dependencies.deliverInvitation;
  const mfaEmailDelivery = dependencies.mfaEmailDelivery;

  return async function handler(req, res) {
    const method = String(req?.method || 'GET').toUpperCase();
    try {
      responseHeaders(res);
      if (!['GET', 'POST'].includes(method)) {
        res.setHeader('Allow', 'GET, POST');
        return send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Metodo no permitido' });
      }
      if (method === 'POST') {
        assertSameOrigin(req, env);
        if (header(req, 'content-type').split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
          fail('IDENTITY_JSON_REQUIRED', 415, 'Se requiere application/json');
        }
      }
      const body = method === 'POST' ? await readBody(req) : null;
      if (body?.command === 'issue_invitation') {
        assertInvitationDeliveryConfigured(deliverInvitation);
      }
      if (body?.command === 'request_email_mfa') {
        assertMfaEmailDeliveryConfigured(mfaEmailDelivery);
      }
      const secrets = dependencies.identitySecrets ?? identitySecrets(env);
      if (body?.command === 'request_email_mfa' || body?.command === 'verify_email_mfa') {
        assertEmailMfaSecretsConfigured(secrets);
      }
      const sql = await getSql(env);
      const now = nowDate(dependencies);

      if (method === 'GET') {
        const resource = queryResource(req);
        const sourceTenantId = resource === 'source_onboarding' ? sourceOnboardingTenantId(req) : null;
        const sourceCapability = 'platform.tenants.manage';
        const identity = await currentIdentity(req, sql, secrets, env, {
          allowLegacy: !['invitations', 'source_onboarding'].includes(resource),
          now,
          requiredCapabilities: resource === 'source_onboarding' ? [sourceCapability] : [],
        });
        if (resource === 'invitations') assertPlatformCapability(identity, 'platform.users.read');
        if (resource === 'source_onboarding') assertGovernedPlatformCapability(identity, sourceCapability);
        const view = resource === 'source_onboarding'
          ? safeSourceOnboardingView(await getTenantIdentitySourceOnboardingView(
            sql, identity.session, certifiedReleaseSha(env), sourceTenantId,
          ), sourceTenantId)
          : resource === 'invitations'
            ? await getTenantIdentityPlatformInvitationsView(
            sql, identity.session, certifiedReleaseSha(env), 100,
          )
            : await getTenantIdentityView(sql, identity.session.email,
              identity.kind === 'v2' ? identity.session.id : null, resource, 100);
        return send(res, 200, {
          ok: true,
          ...(resource === 'bootstrap' ? {
            access: identity.kind === 'v2' ? identity.principal : {
              mode: 'legacy_upgrade', legacySessionAllowed: true, upgradeRequired: false,
            },
          } : {}),
          ...view,
        });
      }

      const { command, payload } = body;

      if (command === 'login') {
        exactPayload(payload, ['email', 'password']);
        const normalizedEmail = email(payload.email);
        const suppliedPassword = password(payload.password);
        await rateLimit(sql, 'identity.login', normalizedEmail || 'invalid-email', req, secrets);
        const login = normalizedEmail ? await lookupTenantIdentity(sql, 'login', normalizedEmail) : null;
        const passwordMatches = await verifyInternalPassword(suppliedPassword || 'invalid-password', login?.passwordHash || DUMMY_PASSWORD_HASH);
        if (!normalizedEmail || !suppliedPassword || !login || !passwordMatches) {
          fail('IDENTITY_AUTH_FAILED', 401, 'Credenciales incorrectas');
        }
        if (!Array.isArray(login.contexts) || login.contexts.length === 0) fail('IDENTITY_CONTEXT_FORBIDDEN', 403, 'No hay contextos habilitados');
        const flowToken = createFlowToken(dependencies.randomBytes);
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const expiresAt = futureIso(now, IDENTITY_FLOW_TTL_SECONDS);
        const result = await apply(sql, login.email, 'begin_login_context', { flowHash, expiresAt }, {
          idempotencyKey: generator(), expectedVersion: null,
        });
        return send(res, 202, {
          ok: true, code: 'CONTEXT_REQUIRED', flowToken,
          expectedVersion: result.version, expiresAt: result.expiresAt,
          contexts: login.contexts,
        });
      }

      if (command === 'select_context') {
        exactPayload(payload, ['flowToken', 'context']);
        const flowToken = String(payload.flowToken || '');
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const flow = await lookupTenantIdentity(sql, 'flow', '', flowHash);
        const requestKey = idempotency(req, generator, true);
        const activeTenantId = activeTenantFromContext(payload.context);
        if (flow?.status === 'consumed') {
          if (flow.purpose !== 'login_context' || flow.completionIdempotencyKey !== requestKey
              || !flow.completedSession
              || (flow.requestedTenantId || null) !== activeTenantId
              || (flow.completedSession.tenantId || null) !== activeTenantId) {
            fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
          }
          setSessionCookie(res, flow.completedSession, secrets, env, now);
          return send(res, 200, { ok: true, replayed: true, session: sessionPayload(flow.completedSession) });
        }
        if (flow?.purpose === 'login_mfa' || flow?.purpose === 'login_enrollment') {
          if (flow.selectionIdempotencyKey !== requestKey
              || (flow.requestedTenantId || null) !== activeTenantId) {
            fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
          }
          if (flow.purpose === 'login_mfa') {
            return send(res, 202, { ok: true, code: 'MFA_REQUIRED', challenge: {
              flowToken, expectedVersion: flow.version, expiresAt: flow.expiresAt,
              emailMfaAvailable: flow.emailMfaAvailable === true,
            } });
          }
          const pendingSecret = decryptMfaSecret(flow.mfaSecretCiphertext, secrets.encryptionKey);
          if (!pendingSecret) fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
          return send(res, 202, {
            ok: true, code: 'MFA_ENROLLMENT_REQUIRED',
            flow: { flowToken, expectedVersion: flow.version, expiresAt: flow.expiresAt },
            mfaEnrollment: totpEnrollmentFromSecret(flow.email, pendingSecret),
          });
        }
        if (flow?.purpose !== 'login_context' || flow.status !== 'pending') {
          fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
        }
        const enrollment = createTotpEnrollment(flow.email, { random: dependencies.randomBytes });
        const result = await apply(sql, flow.email, 'select_login_context', {
          flowHash,
          mfaSecretCiphertext: encryptMfaSecret(enrollment.manualKey, secrets.encryptionKey, { random: dependencies.randomBytes }),
          ...newSessionPayload(req, now, generator, activeTenantId),
        }, {
          idempotencyKey: requestKey, expectedVersion: expectedVersion(body, true),
        });
        if (result.mfaRequired) {
          return send(res, 202, { ok: true, code: 'MFA_REQUIRED', challenge: {
            flowToken, expectedVersion: result.version, expiresAt: result.expiresAt,
            emailMfaAvailable: result.emailMfaAvailable === true,
          } });
        }
        if (result.mfaEnrollmentRequired) {
          return send(res, 202, {
            ok: true, code: 'MFA_ENROLLMENT_REQUIRED',
            flow: { flowToken, expectedVersion: result.version, expiresAt: result.expiresAt },
            mfaEnrollment: enrollment,
          });
        }
        setSessionCookie(res, result.session, secrets, env, now);
        return send(res, 200, { ok: true, session: sessionPayload(result.session) });
      }

      if (command === 'complete_login_mfa_enrollment') {
        exactPayload(payload, ['flowToken', 'totpCode']);
        const flowToken = String(payload.flowToken || '');
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const requestKey = idempotency(req, generator, true);
        const flow = await lookupTenantIdentity(sql, 'flow', '', flowHash);
        const replaySession = assertCompletedFlowReplay(flow, requestKey, 'login_enrollment', 'mfa');
        if (replaySession) {
          setSessionCookie(res, replaySession, secrets, env, now);
          return send(res, 200, { ok: true, replayed: true, session: sessionPayload(replaySession),
            recoveryCodes: [], recoveryCodesAlreadyIssued: true });
        }
        if (flow?.purpose !== 'login_enrollment' || flow.status !== 'pending') {
          fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
        }
        await rateLimit(sql, 'identity.mfa_enrollment', flow.email, req, secrets);
        const secret = decryptMfaSecret(flow.mfaSecretCiphertext, secrets.encryptionKey);
        const totpStep = secret ? matchTotpStep(secret, payload.totpCode, { now }) : null;
        if (totpStep === null) {
          failMfaAttempt(await recordIdentityChallengeAttempt(sql, flowHash, false, null));
        }
        const recoveryCodes = createRecoveryCodes(dependencies.randomBytes);
        const result = await apply(sql, flow.email, 'complete_login_enrollment', {
          flowHash, totpStep,
          recoveryCodeHashes: recoveryCodes.map((value) => hashIdentitySecret(normalizeRecoveryCode(value), secrets.tokenPepper)),
          ...newSessionPayload(req, now, generator),
        }, {
          idempotencyKey: requestKey, expectedVersion: expectedVersion(body, true),
        });
        setSessionCookie(res, result.session, secrets, env, now);
        return send(res, 200, { ok: true, session: sessionPayload(result.session), recoveryCodes });
      }

      if (command === 'verify_mfa' || command === 'recover_mfa') {
        exactPayload(payload, command === 'verify_mfa' ? ['flowToken', 'totpCode'] : ['flowToken', 'recoveryCode']);
        const flowToken = String(payload.flowToken || '');
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const requestKey = idempotency(req, generator, true);
        const flow = await lookupTenantIdentity(sql, 'flow', '', flowHash);
        const replaySession = assertCompletedFlowReplay(flow, requestKey, 'login_mfa',
          command === 'verify_mfa' ? 'mfa' : 'recovery');
        if (replaySession) {
          setSessionCookie(res, replaySession, secrets, env, now);
          return send(res, 200, { ok: true, replayed: true, session: sessionPayload(replaySession) });
        }
        if (flow?.purpose !== 'login_mfa' || flow.status !== 'pending') {
          fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
        }
        await rateLimit(sql, 'identity.mfa', flow.email, req, secrets);
        let totpStep = null;
        let recoveryCodeHash = null;
        if (command === 'verify_mfa') {
          const secret = decryptMfaSecret(flow.mfaSecretCiphertext, secrets.encryptionKey);
          totpStep = secret ? matchTotpStep(secret, payload.totpCode, { now }) : null;
          if (totpStep === null) {
            failMfaAttempt(await recordIdentityChallengeAttempt(sql, flowHash, false, null));
          }
        } else {
          const recovery = normalizeRecoveryCode(payload.recoveryCode);
          if (!recovery) {
            failMfaAttempt(await recordIdentityChallengeAttempt(sql, flowHash, false, null));
          }
          recoveryCodeHash = hashIdentitySecret(recovery, secrets.tokenPepper);
        }
        try {
          const result = await apply(sql, flow.email, 'complete_login_mfa', {
            flowHash, ...(totpStep === null ? { recoveryCodeHash } : { totpStep }),
            ...newSessionPayload(req, now, generator),
          }, {
            idempotencyKey: requestKey, expectedVersion: expectedVersion(body, true),
          });
          setSessionCookie(res, result.session, secrets, env, now);
          return send(res, 200, { ok: true, session: sessionPayload(result.session) });
        } catch (error) {
          if (command === 'recover_mfa' && String(error?.message || '').includes('IDENTITY_MFA_REQUIRED')) {
            const attempt = await recordIdentityChallengeAttempt(sql, flowHash, false, null);
            failMfaAttempt(attempt);
          }
          throw error;
        }
      }

      if (command === 'request_email_mfa') {
        exactPayload(payload, ['flowToken']);
        const flowToken = String(payload.flowToken || '');
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const flow = await lookupTenantIdentity(sql, 'flow', '', flowHash);
        if (flow?.purpose !== 'login_mfa' || flow.status !== 'pending') {
          fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
        }
        const requestKey = idempotency(req, generator, true);
        const requiredVersion = expectedVersion(body, true);
        if (Number(flow.version) !== requiredVersion) {
          fail('IDENTITY_VERSION_CONFLICT', 409, 'El registro cambio; actualiza y reintenta');
        }
        await rateLimit(sql, 'identity.mfa_email_send', flow.email, req, secrets);
        const deliveryAttemptId = requestKey;
        const code = emailMfaCode(
          flowHash, deliveryAttemptId, secrets.emailMfaPepper,
        );
        const expiresAt = futureIso(now, IDENTITY_EMAIL_MFA_TTL_SECONDS);
        const preparedResult = await prepareIdentityEmailMfa(sql, {
          flowHash, deliveryAttemptId,
          codeHash: emailCodeHash(code, deliveryAttemptId, secrets),
          expiresAt, expectedVersion: requiredVersion, idempotencyKey: requestKey,
        });
        let prepared = safePreparedEmailMfa(
          preparedResult, deliveryAttemptId, flow, secrets,
        );
        if (prepared.status === 'active') {
          return send(res, 202, {
            ok: true, code: 'EMAIL_MFA_ACCEPTED', replayed: true,
            challenge: emailMfaResponse(prepared),
          });
        }
        let providerAccepted = false;
        let deliveryPresentation = null;
        try {
          const delivery = await mfaEmailDelivery.deliver({
            to: prepared.destination, code, expiresAt: prepared.expiresAt,
            identityEmail: flow.email,
            tenantId: flow.requestedTenantId || null,
            contextLabel: flow.requestedTenantId
              ? 'Portal interno de la Municipalidad de Junin'
              : 'Administracion de plataforma',
            idempotencyKey: `challenge-${prepared.deliveryAttemptId}`,
          });
          providerAccepted = delivery?.providerAccepted === true;
          deliveryPresentation = delivery;
          if (!providerAccepted) throw new MfaEmailDeliveryError('PROVIDER_UNAVAILABLE', true);
          const accepted = await markIdentityEmailMfaDelivery(sql, {
            flowHash, deliveryAttemptId, accepted: true,
          });
          const acceptedVersion = Number(accepted?.version);
          if (String(accepted?.id || '').toLowerCase() !== prepared.databaseId
              || accepted?.status !== 'active'
              || !Number.isSafeInteger(acceptedVersion)
              || acceptedVersion <= prepared.challengeVersion) {
            fail('IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE', 503,
              'El envio de codigos por correo no esta disponible');
          }
          prepared = Object.freeze({
            ...prepared, status: 'active', challengeVersion: acceptedVersion,
          });
        } catch (error) {
          if (!providerAccepted) {
            await markIdentityEmailMfaDelivery(sql, {
              flowHash, deliveryAttemptId, accepted: false,
            }).catch(() => undefined);
          }
          if (error instanceof IdentityGatewayError) throw error;
          if (error instanceof MfaEmailDeliveryError) {
            fail('IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE', 503,
              'El envio de codigos por correo no esta disponible');
          }
          throw error;
        }
        return send(res, 202, {
          ok: true, code: 'EMAIL_MFA_ACCEPTED', replayed: false,
          challenge: emailMfaResponse(prepared, deliveryPresentation),
        });
      }

      if (command === 'verify_email_mfa') {
        exactPayload(payload, ['flowToken', 'emailChallengeId', 'code']);
        const flowToken = String(payload.flowToken || '');
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const requestKey = idempotency(req, generator, true);
        const requiredVersion = expectedVersion(body, true);
        const flow = await lookupTenantIdentity(sql, 'flow', '', flowHash);
        const replaySession = assertCompletedFlowReplay(
          flow, requestKey, 'login_mfa', 'recovery',
        );
        if (replaySession) {
          setSessionCookie(res, replaySession, secrets, env, now);
          return send(res, 200, {
            ok: true, replayed: true, session: sessionPayload(replaySession),
          });
        }
        if (flow?.purpose !== 'login_mfa' || flow.status !== 'pending') {
          fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
        }
        const emailChallengeId = String(payload.emailChallengeId || '').trim().toLowerCase();
        if (!UUID.test(emailChallengeId)) {
          fail('IDENTITY_PAYLOAD_INVALID', 422, 'Desafio email invalido');
        }
        const code = normalizeEmailMfaCode(payload.code);
        if (!code) fail('IDENTITY_EMAIL_MFA_INVALID', 401, 'Codigo de correo invalido');
        await rateLimit(sql, 'identity.mfa_email_verify', flow.email, req, secrets);
        const result = await completeIdentityEmailMfa(sql, {
          flowHash, deliveryAttemptId: emailChallengeId,
          codeHash: emailCodeHash(code, emailChallengeId, secrets),
          ...newSessionPayload(req, now, generator),
          expectedVersion: requiredVersion, idempotencyKey: requestKey,
        });
        if (result?.verified !== true || !result.session) {
          const remaining = Number(result?.remainingAttempts);
          const nextVersion = Number(result?.version);
          const details = {
            expectedVersion: Number.isSafeInteger(nextVersion) && nextVersion > requiredVersion
              ? nextVersion : requiredVersion,
            ...(Number.isSafeInteger(remaining) && remaining >= 0
              ? { remainingAttempts: remaining } : {}),
          };
          throw new IdentityGatewayError(
            result?.locked === true ? 'IDENTITY_FLOW_LOCKED' : 'IDENTITY_EMAIL_MFA_INVALID',
            result?.locked === true ? 423 : 401,
            result?.locked === true ? 'Flujo bloqueado' : 'Codigo invalido',
            details,
          );
        }
        setSessionCookie(res, result.session, secrets, env, now);
        return send(res, 200, {
          ok: true, session: sessionPayload(result.session), authMethod: 'email_otp',
        });
      }

      if (command === 'begin_activation') {
        exactPayload(payload, ['invitationCode']);
        const releaseSha = certifiedReleaseSha(env);
        const code = normalizeInvitationCode(payload.invitationCode);
        const codeHash = code ? hashIdentitySecret(code, secrets.tokenPepper) : hashIdentitySecret('invalid-invitation-code', secrets.tokenPepper);
        await rateLimit(sql, 'identity.activation', codeHash, req, secrets);
        const invitation = code ? await lookupTenantIdentity(sql, 'invitation', '', codeHash, { releaseSha }) : null;
        if (!invitation) fail('IDENTITY_CODE_INVALID_OR_EXPIRED', 401, 'Codigo invalido o vencido');
        const flowToken = createFlowToken(dependencies.randomBytes);
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const expiresAt = futureIso(now, IDENTITY_FLOW_TTL_SECONDS);
        const enrollment = invitation.requiresMfa ? createTotpEnrollment(invitation.email, { random: dependencies.randomBytes }) : null;
        const result = await apply(sql, invitation.email, 'begin_activation', {
          invitationId: invitation.invitationId, codeHash, flowHash,
          mfaSecretCiphertext: enrollment ? encryptMfaSecret(enrollment.manualKey, secrets.encryptionKey, { random: dependencies.randomBytes }) : null,
          expiresAt, releaseSha,
        }, { idempotencyKey: generator(), expectedVersion: invitation.invitationVersion });
        return send(res, 200, {
          ok: true, flowToken, expectedVersion: result.version,
          expiresAt: result.expiresAt, requiresMfa: invitation.requiresMfa,
          ...(enrollment ? { mfaEnrollment: enrollment } : {}),
          tenant: invitation.tenant, roleKey: invitation.roleKey,
        });
      }

      if (command === 'complete_activation') {
        exactPayload(payload, ['flowToken', 'password', 'totpCode']);
        const releaseSha = certifiedReleaseSha(env);
        const flowToken = String(payload.flowToken || '');
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const requestKey = idempotency(req, generator, true);
        const flow = await lookupTenantIdentity(sql, 'flow', '', flowHash, { releaseSha });
        const replaySession = assertCompletedFlowReplay(flow, requestKey, 'activation');
        if (replaySession) {
          setSessionCookie(res, replaySession, secrets, env, now);
          return send(res, 200, { ok: true, replayed: true, session: sessionPayload(replaySession),
            recoveryCodes: [], recoveryCodesAlreadyIssued: true });
        }
        if (flow?.purpose !== 'activation' || flow.status !== 'pending') {
          fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
        }
        const suppliedPassword = password(payload.password);
        assertPasswordPolicy(suppliedPassword);
        let totpStep = null;
        if (flow.mfaSecretCiphertext) {
          const mfaSecret = decryptMfaSecret(flow.mfaSecretCiphertext, secrets.encryptionKey);
          totpStep = mfaSecret ? matchTotpStep(mfaSecret, payload.totpCode, { now }) : null;
          if (totpStep === null) {
            failMfaAttempt(await recordIdentityChallengeAttempt(sql, flowHash, false, null));
          }
        }
        const recoveryCodes = flow.mfaSecretCiphertext ? createRecoveryCodes(dependencies.randomBytes) : [];
        const result = await apply(sql, flow.email, 'complete_activation', {
          flowHash, passwordHash: await hashInternalPassword(suppliedPassword),
          recoveryCodeHashes: recoveryCodes.map((value) => hashIdentitySecret(normalizeRecoveryCode(value), secrets.tokenPepper)),
          ...(totpStep === null ? {} : { totpStep }), ...newSessionPayload(req, now, generator), releaseSha,
        }, {
          idempotencyKey: requestKey, expectedVersion: expectedVersion(body, true),
        });
        setSessionCookie(res, result.session, secrets, env, now);
        return send(res, 201, { ok: true, session: sessionPayload(result.session), recoveryCodes });
      }

      if (command === 'begin_mfa_enrollment') {
        exactPayload(payload, ['currentPassword']);
        const identity = await currentIdentity(req, sql, secrets, env, { allowLegacy: true, now });
        await rateLimit(sql, 'identity.reauth', identity.session.email, req, secrets);
        const login = await lookupTenantIdentity(sql, 'login', identity.session.email);
        const matches = await verifyInternalPassword(password(payload.currentPassword) || 'invalid-password', login?.passwordHash || DUMMY_PASSWORD_HASH);
        if (!login || !matches) fail('IDENTITY_REAUTH_FAILED', 401, 'No se pudo revalidar la identidad');
        const enrollment = createTotpEnrollment(identity.session.email, { random: dependencies.randomBytes });
        const flowToken = createFlowToken(dependencies.randomBytes);
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const expiresAt = futureIso(now, IDENTITY_FLOW_TTL_SECONDS);
        const result = await apply(sql, identity.session.email, 'begin_mfa_enrollment', {
          flowHash, mfaSecretCiphertext: encryptMfaSecret(enrollment.manualKey, secrets.encryptionKey, { random: dependencies.randomBytes }),
          expiresAt,
        }, { idempotencyKey: idempotency(req, generator, true), expectedVersion: null });
        return send(res, 200, { ok: true, flowToken, expectedVersion: result.version,
          expiresAt: result.expiresAt, mfaEnrollment: enrollment });
      }

      if (command === 'complete_mfa_enrollment') {
        exactPayload(payload, ['flowToken', 'totpCode']);
        const flowToken = String(payload.flowToken || '');
        const flowHash = hashIdentitySecret(flowToken, secrets.tokenPepper);
        const requestKey = idempotency(req, generator, true);
        const flow = await lookupTenantIdentity(sql, 'flow', '', flowHash);
        const replaySession = assertCompletedFlowReplay(flow, requestKey, 'mfa_enrollment', 'mfa');
        if (replaySession) {
          setSessionCookie(res, replaySession, secrets, env, now);
          return send(res, 200, { ok: true, replayed: true, session: sessionPayload(replaySession),
            recoveryCodes: [], recoveryCodesAlreadyIssued: true });
        }
        const identity = await currentIdentity(req, sql, secrets, env, { allowLegacy: true, now });
        if (flow?.purpose !== 'mfa_enrollment' || flow.status !== 'pending'
            || flow.email !== identity.session.email) {
          fail('IDENTITY_FLOW_INVALID_OR_EXPIRED', 401, 'Flujo invalido o vencido');
        }
        const mfaSecret = decryptMfaSecret(flow.mfaSecretCiphertext, secrets.encryptionKey);
        const totpStep = mfaSecret ? matchTotpStep(mfaSecret, payload.totpCode, { now }) : null;
        if (totpStep === null) {
          failMfaAttempt(await recordIdentityChallengeAttempt(sql, flowHash, false, null));
        }
        const recoveryCodes = createRecoveryCodes(dependencies.randomBytes);
        const activeTenantId = identity.kind === 'v2' ? identity.principal?.tenant?.id || null : null;
        const result = await apply(sql, identity.session.email, 'complete_mfa_enrollment', {
          flowHash, totpStep,
          recoveryCodeHashes: recoveryCodes.map((value) => hashIdentitySecret(normalizeRecoveryCode(value), secrets.tokenPepper)),
          ...newSessionPayload(req, now, generator, activeTenantId),
        }, {
          idempotencyKey: requestKey, expectedVersion: expectedVersion(body, true),
        });
        setSessionCookie(res, result.session, secrets, env, now);
        return send(res, 200, { ok: true, session: sessionPayload(result.session), recoveryCodes });
      }

      if (command === 'revoke_session') {
        exactPayload(payload, ['sessionId']);
        const identity = await currentIdentity(req, sql, secrets, env, { now });
        const result = await apply(sql, identity.session.email, 'revoke_session', {
          sessionId: String(payload.sessionId || ''),
        }, {
          idempotencyKey: idempotency(req, generator, true), expectedVersion: expectedVersion(body, true),
        });
        if (payload.sessionId === identity.session.id) {
          clearAllIdentityCookies(res, env);
        }
        return send(res, 200, { ok: true, ...result });
      }

      if (command === 'switch_context') {
        exactPayload(payload, ['context']);
        const identity = await currentIdentity(req, sql, secrets, env, { now });
        const activeTenantId = activeTenantFromContext(payload.context);
        const suppliedVersion = expectedVersion(body, true);
        if (suppliedVersion !== identity.session.version) {
          fail('IDENTITY_VERSION_CONFLICT', 409, 'El registro cambio; actualiza y reintenta');
        }
        const switched = newSessionPayload(req, now, generator, activeTenantId);
        switched.sessionExpiresAt = new Date(Math.min(
          new Date(switched.sessionExpiresAt).getTime(), identity.session.expiresAt * 1000,
        )).toISOString();
        const result = await apply(sql, identity.session.email, 'switch_context', {
          currentSessionId: identity.session.id,
          newSessionId: switched.sessionId,
          activeTenantId,
          sessionExpiresAt: switched.sessionExpiresAt,
          device: switched.device,
          ipApprox: switched.ipApprox,
        }, {
          idempotencyKey: idempotency(req, generator, true), expectedVersion: suppliedVersion,
        });
        setSessionCookie(res, result.session, secrets, env, now);
        return send(res, 200, { ok: true, session: sessionPayload(result.session) });
      }

      if (command === 'logout') {
        exactPayload(payload, []);
        const identity = await currentIdentity(req, sql, secrets, env, { now });
        try {
          const result = await revokeIdentitySessionForLogout({
            sql, session: identity.session, idempotencyKey: idempotency(req, generator, true),
          });
          clearAllIdentityCookies(res, env);
          return send(res, 200, { ok: true, authenticated: false, ...result });
        } catch (error) {
          clearAllIdentityCookies(res, env);
          throw error;
        }
      }

      if (command === 'issue_invitation') {
        exactPayload(payload, ['invitationId']);
        const releaseSha = certifiedReleaseSha(env);
        const identity = await currentIdentity(req, sql, secrets, env, { now });
        assertPlatformCapability(identity, 'platform.users.invite');
        const issueKey = idempotency(req, generator, true);
        const issueExpectedVersion = expectedVersion(body, true);
        const delivery = await lookupTenantInvitationDelivery(
          sql, identity.session, releaseSha, String(payload.invitationId || ''),
        );
        const replay = await getTenantIdentityPlatformCommandReplay(
          sql, identity.session, releaseSha, {
            idempotencyKey: issueKey,
            command: 'issue_invitation',
            expectedVersion: issueExpectedVersion,
            invitationId: String(payload.invitationId || ''),
          },
        );
        if (replay && replay.command !== 'issue_invitation') {
          fail('IDENTITY_IDEMPOTENCY_REUSED', 409, 'Idempotency-Key reutilizada');
        }
        if (replay && delivery.deliveryStatus === 'delivered') {
          if (replay.result.deliveryAttemptId !== delivery.deliveryAttemptId) {
            fail('IDENTITY_DELIVERY_ATTEMPT_STALE', 409, 'El intento de entrega fue reemplazado');
          }
          return send(res, 202, { ok: true, invitation: {
            ...replay.result.invitation, status: 'issued', version: delivery.version,
            delivery: { ...replay.result.invitation.delivery, status: 'delivered' },
          }, replayed: true });
        }
        if (replay && replay.result.deliveryAttemptId !== delivery.deliveryAttemptId) {
          fail('IDENTITY_DELIVERY_ATTEMPT_STALE', 409, 'El intento de entrega fue reemplazado');
        }
        if (replay && delivery.deliveryStatus !== 'pending') {
          fail('IDENTITY_DELIVERY_UNAVAILABLE', 503, 'Canal de entrega no disponible');
        }
        if (replay) assertReplayInsideDeliveryWindow(replay, now);
        const code = invitationCodeFor(delivery.invitationId, issueKey, secrets);
        const result = replay?.result || await applyPlatform(sql, identity.session, releaseSha, 'issue_invitation', {
          invitationId: delivery.invitationId,
          deliveryAttemptId: generator(),
          codeHash: hashIdentitySecret(normalizeInvitationCode(code), secrets.tokenPepper),
          expiresAt: futureIso(now, IDENTITY_INVITATION_TTL_SECONDS), releaseSha,
        }, { idempotencyKey: issueKey, expectedVersion: issueExpectedVersion });
        const deliveryAttemptId = String(result.deliveryAttemptId || '').toLowerCase();
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(deliveryAttemptId)) {
          fail('IDENTITY_DELIVERY_UNAVAILABLE', 503, 'Canal de entrega no disponible');
        }
        try {
          await deliverInvitation({
            to: delivery.email, code, expiresAt: result.invitation.delivery.expiresAt,
            identityEmail: delivery.email,
            tenantId: delivery.tenant?.id,
            tenantName: delivery.tenant?.name,
            activationUrl: `${trustedOrigin(env)}/activar-cuenta`,
            deliveryAttempt: Object.freeze({
              invitationId: delivery.invitationId, id: deliveryAttemptId,
            }),
          });
        } catch (error) {
          if (error instanceof InvitationDeliveryError && error.retryable === false) {
            await applyPlatform(sql, identity.session, releaseSha, 'delivery_failed', {
              invitationId: delivery.invitationId, deliveryAttemptId,
            }, { idempotencyKey: generator(), expectedVersion: result.invitation.version }).catch(() => undefined);
          }
          fail('IDENTITY_DELIVERY_UNAVAILABLE', 503, 'Canal de entrega no disponible');
        }
        const confirmed = await applyPlatform(sql, identity.session, releaseSha, 'confirm_delivery', {
          invitationId: delivery.invitationId, deliveryAttemptId, releaseSha,
        }, { idempotencyKey: generator(), expectedVersion: result.invitation.version });
        return send(res, 202, { ok: true, invitation: confirmed.invitation,
          replayed: result.replayed === true });
      }

      if (command === 'bind_source') {
        exactPayload(payload, ['tenantId', 'sourceSystem', 'sourceDatabase', 'sourceCompanyId', 'reason']);
        const releaseSha = certifiedReleaseSha(env);
        const capability = 'platform.tenants.manage';
        const identity = await currentIdentity(req, sql, secrets, env, {
          now, requiredCapabilities: [capability],
        });
        assertGovernedPlatformCapability(identity, capability);
        const result = await applyPlatform(sql, identity.session, releaseSha, command, {
          tenantId: String(payload.tenantId || ''),
          sourceSystem: String(payload.sourceSystem || ''),
          sourceDatabase: String(payload.sourceDatabase || ''),
          sourceCompanyId: payload.sourceCompanyId,
          reason: String(payload.reason || ''),
        }, {
          idempotencyKey: idempotency(req, generator, true),
          expectedVersion: expectedVersion(body, true),
        });
        const response = safeSourceBindingResult(result, payload);
        return send(res, response.replayed ? 200 : 201, { ok: true, ...response });
      }

      if (command === 'certify_data_plane') {
        exactPayload(payload, ['tenantId', 'sourceBindingId', 'reason']);
        const releaseSha = certifiedReleaseSha(env);
        const capability = 'platform.tenants.manage';
        const identity = await currentIdentity(req, sql, secrets, env, {
          now, requiredCapabilities: [capability],
        });
        assertGovernedPlatformCapability(identity, capability);
        const result = await applyPlatform(sql, identity.session, releaseSha, command, {
          tenantId: String(payload.tenantId || ''),
          sourceBindingId: String(payload.sourceBindingId || ''),
          releaseSha,
          reason: String(payload.reason || ''),
        }, {
          idempotencyKey: idempotency(req, generator, true),
          expectedVersion: expectedVersion(body, true),
        });
        const response = safeDataPlaneCertificationResult(
          result, payload.tenantId, payload.sourceBindingId,
        );
        return send(res, 200, { ok: true, ...response });
      }

      if (command === 'set_delivery_ready') {
        exactPayload(payload, ['tenantId', 'ready', 'reason']);
        if (payload.ready !== false) {
          fail('IDENTITY_DELIVERY_CERTIFICATION_REQUIRED', 403,
            'Solo el kill switch delivery=false esta habilitado');
        }
        const releaseSha = certifiedReleaseSha(env);
        const identity = await currentIdentity(req, sql, secrets, env, { now });
        assertPlatformCapability(identity, 'platform.tenants.manage');
        const result = await applyPlatform(sql, identity.session, releaseSha, command, {
          tenantId: String(payload.tenantId || ''), ready: false,
          reason: String(payload.reason || ''),
        }, {
          idempotencyKey: idempotency(req, generator, true),
          expectedVersion: expectedVersion(body, true),
        });
        return send(res, 200, { ok: true, ...result });
      }

      fail('IDENTITY_COMMAND_INVALID', 400, 'Comando no permitido');
    } catch (error) {
      const mapped = error instanceof IdentityGatewayError ? error : identityGatewayDatabaseError(error);
      if (mapped) {
        if (mapped.retryAfter) res.setHeader('Retry-After', String(mapped.retryAfter));
        return send(res, mapped.status, { ok: false, code: mapped.code, error: mapped.message,
          ...(mapped.retryAfter ? { retryAfterSeconds: mapped.retryAfter } : {}),
          ...(mapped.details || {}) });
      }
      if (error?.code === 'INTERNAL_AUTH_NOT_CONFIGURED' || error?.code === 'IDENTITY_DATABASE_ROLE_REQUIRED') {
        return send(res, 503, { ok: false, code: 'IDENTITY_GATEWAY_NOT_CONFIGURED', error: 'Gateway de identidad no configurado' });
      }
      console.error('[internal-identity]', error instanceof Error ? error.name : 'error');
      return send(res, 503, { ok: false, code: 'IDENTITY_GATEWAY_UNAVAILABLE', error: 'Gateway de identidad no disponible' });
    }
  };
}

export default createInternalIdentityHandler({
  deliverInvitation: createResendInvitationDelivery(),
  mfaEmailDelivery: createResendMfaEmailDelivery(),
});
