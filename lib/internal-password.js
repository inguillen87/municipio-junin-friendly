import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export const INTERNAL_PASSWORD_HASH_PREFIX = 'scrypt';
export const INTERNAL_PASSWORD_SCRYPT_PARAMS = Object.freeze({
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 64,
});

const MIN_SALT_BYTES = 8;
const MAX_SALT_BYTES = 64;
const MAX_PASSWORD_BYTES = 4096;

function assertPassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new TypeError('password debe ser un string no vacio');
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new RangeError('password excede el limite permitido');
  }
}

function isPowerOfTwo(value) {
  return Number.isSafeInteger(value) && value > 1 && (value & (value - 1)) === 0;
}

function validateParams({ N, r, p, keyLength }) {
  if (!isPowerOfTwo(N) || N < 1024 || N > 1048576) return false;
  if (!Number.isSafeInteger(r) || r < 1 || r > 32) return false;
  if (!Number.isSafeInteger(p) || p < 1 || p > 16) return false;
  return Number.isSafeInteger(keyLength) && keyLength >= 32 && keyLength <= 128;
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const decoded = Buffer.from(value, 'base64url');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function scryptOptions(N, r, p) {
  return {
    N,
    r,
    p,
    maxmem: Math.max(64 * 1024 * 1024, (128 * N * r) + (2 * 1024 * 1024)),
  };
}

export function parseInternalPasswordHash(encodedHash) {
  if (typeof encodedHash !== 'string') return null;

  const parts = encodedHash.split('$');
  if (parts.length !== 6 || parts[0] !== INTERNAL_PASSWORD_HASH_PREFIX) return null;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = decodeBase64Url(parts[4]);
  const digest = decodeBase64Url(parts[5]);
  const params = { N, r, p, keyLength: digest?.length || 0 };

  if (!salt || salt.length < MIN_SALT_BYTES || salt.length > MAX_SALT_BYTES) return null;
  if (!digest || !validateParams(params)) return null;

  return { ...params, salt, digest };
}

export async function hashInternalPassword(password, options = {}) {
  assertPassword(password);

  const params = {
    ...INTERNAL_PASSWORD_SCRYPT_PARAMS,
    ...(options.params || {}),
  };
  if (!validateParams(params)) throw new RangeError('parametros scrypt invalidos');

  const salt = options.salt == null ? randomBytes(16) : Buffer.from(options.salt);
  if (salt.length < MIN_SALT_BYTES || salt.length > MAX_SALT_BYTES) {
    throw new RangeError('salt scrypt invalido');
  }

  const digest = await scrypt(
    password,
    salt,
    params.keyLength,
    scryptOptions(params.N, params.r, params.p),
  );

  return [
    INTERNAL_PASSWORD_HASH_PREFIX,
    params.N,
    params.r,
    params.p,
    salt.toString('base64url'),
    Buffer.from(digest).toString('base64url'),
  ].join('$');
}

export async function verifyInternalPassword(password, encodedHash) {
  try {
    assertPassword(password);
    const parsed = parseInternalPasswordHash(encodedHash);
    if (!parsed) return false;

    const actual = Buffer.from(await scrypt(
      password,
      parsed.salt,
      parsed.keyLength,
      scryptOptions(parsed.N, parsed.r, parsed.p),
    ));

    return actual.length === parsed.digest.length && timingSafeEqual(actual, parsed.digest);
  } catch {
    return false;
  }
}
