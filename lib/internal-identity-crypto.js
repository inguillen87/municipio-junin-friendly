import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { InternalAuthConfigurationError } from './internal-session.js';

export const IDENTITY_SESSION_COOKIE = '__Host-mc_identity';
export const IDENTITY_SESSION_TTL_SECONDS = 8 * 60 * 60;
export const IDENTITY_FLOW_TTL_SECONDS = 10 * 60;
export const IDENTITY_INVITATION_TTL_SECONDS = 48 * 60 * 60;

const SESSION_VERSION = 'v2';
const SESSION_ISSUER = 'municipio-junin-friendly-identity';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const MFA_SECRET_AAD = 'municontrol:mfa:v1';
const EMAIL_MFA_DESTINATION_AAD = 'municontrol:email-mfa-destination:v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

function requiredSecret(env, key) {
  const value = env?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new InternalAuthConfigurationError(key);
  }
  return value.trim();
}

export function identitySecrets(env = process.env) {
  const tokenPepper = requiredSecret(env, 'IDENTITY_TOKEN_PEPPER');
  const sessionSecret = requiredSecret(env, 'INTERNAL_SESSION_SECRET');
  const encodedEncryptionKey = requiredSecret(env, 'IDENTITY_MFA_ENCRYPTION_KEY');
  let encryptionKey;
  try {
    encryptionKey = Buffer.from(encodedEncryptionKey, 'base64url');
  } catch {
    encryptionKey = Buffer.alloc(0);
  }
  if (encryptionKey.length !== 32) {
    const error = new InternalAuthConfigurationError('IDENTITY_MFA_ENCRYPTION_KEY');
    error.message = 'IDENTITY_MFA_ENCRYPTION_KEY debe ser base64url de 32 bytes';
    throw error;
  }
  const configuredEmailPepper = String(env?.IDENTITY_EMAIL_MFA_PEPPER || '').trim();
  const configuredEmailEncryptionKey = String(
    env?.IDENTITY_EMAIL_MFA_ENCRYPTION_KEY || '',
  ).trim();
  if (Boolean(configuredEmailPepper) !== Boolean(configuredEmailEncryptionKey)) {
    throw new InternalAuthConfigurationError('IDENTITY_EMAIL_MFA_SECRET_PAIR');
  }
  let emailMfaPepper = null;
  let emailMfaEncryptionKey = null;
  if (configuredEmailPepper && configuredEmailEncryptionKey) {
    if (Buffer.byteLength(configuredEmailPepper, 'utf8') < 32) {
      const error = new InternalAuthConfigurationError('IDENTITY_EMAIL_MFA_PEPPER');
      error.message = 'IDENTITY_EMAIL_MFA_PEPPER debe tener al menos 32 bytes';
      throw error;
    }
    try {
      emailMfaEncryptionKey = Buffer.from(configuredEmailEncryptionKey, 'base64url');
    } catch {
      emailMfaEncryptionKey = Buffer.alloc(0);
    }
    if (emailMfaEncryptionKey.length !== 32) {
      const error = new InternalAuthConfigurationError('IDENTITY_EMAIL_MFA_ENCRYPTION_KEY');
      error.message = 'IDENTITY_EMAIL_MFA_ENCRYPTION_KEY debe ser base64url de 32 bytes';
      throw error;
    }
    emailMfaPepper = configuredEmailPepper;
  }
  return Object.freeze({
    tokenPepper, sessionSecret, encryptionKey,
    emailMfaPepper, emailMfaEncryptionKey,
  });
}

function safeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left), 'utf8');
  const rightBuffer = Buffer.from(String(right), 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashIdentitySecret(value, pepper) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 4096) {
    throw new TypeError('secreto opaco invalido');
  }
  if (typeof pepper !== 'string' || pepper.length < 32) {
    throw new TypeError('pepper de identidad invalido');
  }
  return createHmac('sha256', pepper).update(value, 'utf8').digest('hex');
}

export function createInvitationCode(random = randomBytes) {
  const raw = base32Encode(random(16));
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}-${raw.slice(20)}`;
}

export function normalizeInvitationCode(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '');
  if (!/^[A-Z2-7]{26}$/.test(normalized)) return '';
  return normalized;
}

export function createFlowToken(random = randomBytes) {
  return random(32).toString('base64url');
}

export function createRecoveryCodes(random = randomBytes, count = 8) {
  if (!Number.isSafeInteger(count) || count < 4 || count > 12) {
    throw new RangeError('cantidad de recuperacion invalida');
  }
  return Object.freeze(Array.from({ length: count }, () => {
    const value = random(10).toString('hex').toUpperCase();
    return `${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}-${value.slice(15)}`;
  }));
}

export function normalizeRecoveryCode(value) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '');
  return /^[A-F0-9]{20}$/.test(normalized) ? normalized : '';
}

export function normalizeEmailMfaCode(value) {
  const normalized = String(value || '').trim();
  return /^\d{6}$/.test(normalized) ? normalized : '';
}

export function emailMfaCode(flowHash, deliveryAttemptId, pepper) {
  const normalizedFlowHash = String(flowHash || '').trim().toLowerCase();
  const normalizedAttemptId = String(deliveryAttemptId || '').trim().toLowerCase();
  if (!SHA256.test(normalizedFlowHash) || !UUID.test(normalizedAttemptId)) {
    throw new TypeError('coordenadas OTP email invalidas');
  }
  const digest = hashIdentitySecret(
    `email-mfa-code|${normalizedFlowHash}|${normalizedAttemptId}`,
    pepper,
  );
  return String(BigInt(`0x${digest}`) % 1_000_000n).padStart(6, '0');
}

export function maskEmailDestination(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const match = normalized.match(/^([^\s@]+)@([^\s@]+)$/);
  if (!match || normalized.length > 254) return '';
  const local = match[1];
  const visible = local.length === 1
    ? '•'
    : local.length === 2
      ? `${local[0]}•`
      : `${local[0]}${'•'.repeat(Math.min(8, local.length - 2))}${local.at(-1)}`;
  return `${visible}@${match[2]}`;
}

function base32Encode(buffer) {
  let bits = 0;
  let bitCount = 0;
  let output = '';
  for (const byte of buffer) {
    bits = (bits << 8) | byte;
    bitCount += 8;
    while (bitCount >= 5) {
      output += BASE32_ALPHABET[(bits >>> (bitCount - 5)) & 31];
      bitCount -= 5;
    }
  }
  if (bitCount > 0) output += BASE32_ALPHABET[(bits << (5 - bitCount)) & 31];
  return output;
}

function base32Decode(value) {
  const normalized = String(value || '').replace(/=+$/g, '').toUpperCase();
  if (!normalized || !/^[A-Z2-7]+$/.test(normalized)) return null;
  let bits = 0;
  let bitCount = 0;
  const bytes = [];
  for (const character of normalized) {
    bits = (bits << 5) | BASE32_ALPHABET.indexOf(character);
    bitCount += 5;
    if (bitCount >= 8) {
      bytes.push((bits >>> (bitCount - 8)) & 255);
      bitCount -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function createTotpEnrollment(accountEmail, options = {}) {
  const secret = base32Encode((options.random ?? randomBytes)(20));
  return totpEnrollmentFromSecret(accountEmail, secret, options);
}

export function totpEnrollmentFromSecret(accountEmail, secret, options = {}) {
  const issuer = String(options.issuer || 'MuniControl').trim();
  const account = String(accountEmail || '').trim().toLowerCase();
  if (!account || account.length > 254 || !issuer || !base32Decode(secret)) throw new TypeError('cuenta TOTP invalida');
  const label = `${issuer}:${account}`;
  const otpauthUri = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}`
    + `&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return Object.freeze({ manualKey: secret, otpauthUri });
}

export function totpCode(secret, options = {}) {
  const key = base32Decode(secret);
  if (!key || key.length < 16) throw new TypeError('secreto TOTP invalido');
  const timestamp = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  if (!Number.isFinite(timestamp)) throw new TypeError('fecha TOTP invalida');
  const counter = Math.floor(timestamp / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret, code, options = {}) {
  return matchTotpStep(secret, code, options) !== null;
}

export function matchTotpStep(secret, code, options = {}) {
  const normalized = String(code || '').trim();
  if (!/^\d{6}$/.test(normalized)) return null;
  const now = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const window = Number.isSafeInteger(options.window) ? Math.min(Math.max(options.window, 0), 2) : 1;
  try {
    for (let offset = -window; offset <= window; offset += 1) {
      const candidateTime = now + (offset * 30_000);
      if (safeEqualText(normalized, totpCode(secret, { now: candidateTime }))) {
        return Math.floor(candidateTime / 30_000);
      }
    }
  } catch {
    return null;
  }
  return null;
}

function encryptOpaqueSecret(secret, encryptionKey, aad, limits, options = {}) {
  if (typeof secret !== 'string' || secret.length < limits.minimum || secret.length > limits.maximum) {
    throw new TypeError(limits.error);
  }
  const key = Buffer.from(encryptionKey || []);
  if (key.length !== 32) throw new TypeError('clave MFA invalida');
  const iv = (options.random ?? randomBytes)(12);
  if (!Buffer.isBuffer(iv) || iv.length !== 12) throw new TypeError('entropia MFA invalida');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
}

function decryptOpaqueSecret(value, encryptionKey, aad, validate) {
  try {
    const [version, ivValue, ciphertextValue, tagValue, extra] = String(value || '').split('.');
    if (version !== 'v1' || extra !== undefined) return null;
    const key = Buffer.from(encryptionKey || []);
    const iv = Buffer.from(ivValue, 'base64url');
    const ciphertext = Buffer.from(ciphertextValue, 'base64url');
    const tag = Buffer.from(tagValue, 'base64url');
    if (key.length !== 32 || iv.length !== 12 || !ciphertext.length || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return validate(decrypted) ? decrypted : null;
  } catch {
    return null;
  }
}

export function encryptMfaSecret(secret, encryptionKey, options = {}) {
  return encryptOpaqueSecret(secret, encryptionKey, MFA_SECRET_AAD, {
    minimum: 16, maximum: 256, error: 'secreto MFA invalido',
  }, options);
}

export function decryptMfaSecret(value, encryptionKey) {
  return decryptOpaqueSecret(value, encryptionKey, MFA_SECRET_AAD,
    (secret) => typeof secret === 'string' && secret.length >= 16 && secret.length <= 256);
}

export function encryptEmailMfaDestination(destination, encryptionKey, options = {}) {
  const normalized = String(destination || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(normalized) || normalized.length > 254) {
    throw new TypeError('destino MFA email invalido');
  }
  return encryptOpaqueSecret(normalized, encryptionKey, EMAIL_MFA_DESTINATION_AAD, {
    minimum: 3, maximum: 254, error: 'destino MFA email invalido',
  }, options);
}

export function decryptEmailMfaDestination(value, encryptionKey) {
  return decryptOpaqueSecret(value, encryptionKey, EMAIL_MFA_DESTINATION_AAD,
    (destination) => destination.length <= 254 && /^[^\s@]+@[^\s@]+$/.test(destination));
}

function epochSeconds(value) {
  const milliseconds = value instanceof Date ? value.getTime() : Number(value);
  if (!Number.isFinite(milliseconds)) throw new TypeError('fecha de sesion invalida');
  return Math.floor(milliseconds / 1000);
}

export function issueIdentitySessionToken(session, options = {}) {
  const secret = options.secret;
  if (typeof secret !== 'string' || secret.length < 32) throw new TypeError('secreto de sesion invalido');
  const sid = String(session?.id || '').trim().toLowerCase();
  const email = String(session?.email || '').trim().toLowerCase();
  const sessionVersion = Number(session?.version);
  const identityVersion = Number(session?.identityVersion);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sid)
      || !email || !Number.isSafeInteger(sessionVersion) || sessionVersion < 1
      || !Number.isSafeInteger(identityVersion) || identityVersion < 1) {
    throw new TypeError('sesion registrada incompleta');
  }
  const now = epochSeconds(options.now ?? Date.now());
  const ttl = Number(options.ttlSeconds ?? IDENTITY_SESSION_TTL_SECONDS);
  if (!Number.isSafeInteger(ttl) || ttl < 60 || ttl > 24 * 60 * 60) throw new RangeError('TTL de sesion invalido');
  const payload = {
    v: 2, iss: SESSION_ISSUER, sub: email, sid,
    sv: sessionVersion, iv: identityVersion, iat: now, exp: now + ttl,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const unsigned = `${SESSION_VERSION}.${encoded}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

export function verifyIdentitySessionToken(token, options = {}) {
  try {
    if (typeof token !== 'string' || token.length > 4096) return null;
    const [version, encoded, signature, extra] = token.split('.');
    if (version !== SESSION_VERSION || !encoded || !signature || extra !== undefined) return null;
    const secret = options.secret;
    if (typeof secret !== 'string' || secret.length < 32) throw new TypeError('secreto de sesion invalido');
    const unsigned = `${version}.${encoded}`;
    const expected = createHmac('sha256', secret).update(unsigned).digest('base64url');
    if (!safeEqualText(signature, expected)) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    const now = epochSeconds(options.now ?? Date.now());
    if (payload?.v !== 2 || payload?.iss !== SESSION_ISSUER
        || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
        || payload.exp <= payload.iat || now >= payload.exp || payload.iat > now + 60
        || !/^[0-9a-f-]{36}$/.test(String(payload.sid || ''))
        || !Number.isSafeInteger(payload.sv) || payload.sv < 1
        || !Number.isSafeInteger(payload.iv) || payload.iv < 1
        || typeof payload.sub !== 'string' || !payload.sub.includes('@')) return null;
    return Object.freeze({
      id: payload.sid, email: payload.sub.toLowerCase(), version: payload.sv,
      identityVersion: payload.iv, issuedAt: payload.iat, expiresAt: payload.exp,
    });
  } catch {
    return null;
  }
}

export function serializeIdentitySessionCookie(token, options = {}) {
  const secure = options.secure ?? true;
  const persistent = options.persistent === true;
  const maxAge = Number(options.maxAge ?? IDENTITY_SESSION_TTL_SECONDS);
  if (typeof token !== 'string' || !token
      || (persistent && (!Number.isSafeInteger(maxAge) || maxAge <= 0))) {
    throw new TypeError('cookie de identidad invalida');
  }
  return [
    `${IDENTITY_SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/',
    ...(persistent ? [`Max-Age=${maxAge}`] : []),
    'HttpOnly', 'SameSite=Strict', ...(secure ? ['Secure'] : []),
  ].join('; ');
}

export function serializeClearedIdentitySessionCookie(options = {}) {
  return [
    `${IDENTITY_SESSION_COOKIE}=`, 'Path=/', 'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT', 'HttpOnly', 'SameSite=Strict',
    ...((options.secure ?? true) ? ['Secure'] : []),
  ].join('; ');
}
