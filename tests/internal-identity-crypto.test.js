import assert from 'node:assert/strict';
import test from 'node:test';

import {
  IDENTITY_SESSION_COOKIE,
  createInvitationCode,
  createRecoveryCodes,
  createTotpEnrollment,
  decryptEmailMfaDestination,
  decryptMfaSecret,
  emailMfaCode,
  encryptEmailMfaDestination,
  encryptMfaSecret,
  hashIdentitySecret,
  identitySecrets,
  issueIdentitySessionToken,
  maskEmailDestination,
  matchTotpStep,
  normalizeEmailMfaCode,
  normalizeInvitationCode,
  normalizeRecoveryCode,
  serializeIdentitySessionCookie,
  totpCode,
  verifyIdentitySessionToken,
} from '../lib/internal-identity-crypto.js';

const PEPPER = 'p'.repeat(48);
const SESSION_SECRET = 's'.repeat(48);
const NOW = Date.parse('2026-08-20T15:00:00.000Z');

test('email MFA puede usar secretos dedicados sin rotar TOTP ni sesiones', () => {
  const baseKey = Buffer.alloc(32, 1).toString('base64url');
  const emailKey = Buffer.alloc(32, 2).toString('base64url');
  const secrets = identitySecrets({
    IDENTITY_TOKEN_PEPPER: PEPPER,
    INTERNAL_SESSION_SECRET: SESSION_SECRET,
    IDENTITY_MFA_ENCRYPTION_KEY: baseKey,
    IDENTITY_EMAIL_MFA_PEPPER: 'e'.repeat(48),
    IDENTITY_EMAIL_MFA_ENCRYPTION_KEY: emailKey,
  });
  assert.equal(secrets.tokenPepper, PEPPER);
  assert.deepEqual(secrets.encryptionKey, Buffer.alloc(32, 1));
  assert.equal(secrets.emailMfaPepper, 'e'.repeat(48));
  assert.deepEqual(secrets.emailMfaEncryptionKey, Buffer.alloc(32, 2));
  const withoutEmail = identitySecrets({
    IDENTITY_TOKEN_PEPPER: PEPPER,
    INTERNAL_SESSION_SECRET: SESSION_SECRET,
    IDENTITY_MFA_ENCRYPTION_KEY: baseKey,
  });
  assert.equal(withoutEmail.emailMfaPepper, null);
  assert.equal(withoutEmail.emailMfaEncryptionKey, null);
  assert.throws(() => identitySecrets({
    IDENTITY_TOKEN_PEPPER: PEPPER,
    INTERNAL_SESSION_SECRET: SESSION_SECRET,
    IDENTITY_MFA_ENCRYPTION_KEY: baseKey,
    IDENTITY_EMAIL_MFA_PEPPER: 'e'.repeat(48),
  }), /IDENTITY_EMAIL_MFA_SECRET_PAIR/);
});

test('codigo de invitacion usa 128 bits base32 sin confundir datos con separadores', () => {
  const code = createInvitationCode((size) => Buffer.alloc(size, 0xfb));
  assert.match(code, /^[A-Z2-7]{5}(?:-[A-Z2-7]{5}){3}-[A-Z2-7]{6}$/);
  const normalized = normalizeInvitationCode(code);
  assert.equal(normalized.length, 26);
  assert.match(hashIdentitySecret(normalized, PEPPER), /^[a-f0-9]{64}$/);
  assert.equal(normalizeInvitationCode(`${code}-`), normalized);
  assert.equal(normalizeInvitationCode('codigo-invalido'), '');
});

test('TOTP informa el step exacto y AEAD rechaza alteraciones', () => {
  const enrollment = createTotpEnrollment('marcelo@example.test', {
    random: (size) => Buffer.alloc(size, 0x2a),
  });
  const code = totpCode(enrollment.manualKey, { now: NOW });
  assert.equal(matchTotpStep(enrollment.manualKey, code, { now: NOW }), Math.floor(NOW / 30_000));
  assert.equal(matchTotpStep(enrollment.manualKey, '000000', { now: NOW }), null);

  const key = Buffer.alloc(32, 9);
  const encrypted = encryptMfaSecret(enrollment.manualKey, key, { random: (size) => Buffer.alloc(size, 7) });
  assert.equal(decryptMfaSecret(encrypted, key), enrollment.manualKey);
  assert.equal(decryptMfaSecret(`${encrypted.slice(0, -2)}AA`, key), null);
});

test('destino email MFA usa AAD separado, normaliza la pista y nunca cruza con TOTP', () => {
  const key = Buffer.alloc(32, 11);
  const encrypted = encryptEmailMfaDestination('Seguridad@Municipio.Example', key,
    { random: (size) => Buffer.alloc(size, 3) });
  assert.equal(decryptEmailMfaDestination(encrypted, key), 'seguridad@municipio.example');
  assert.equal(decryptMfaSecret(encrypted, key), null);
  assert.equal(maskEmailDestination('Seguridad@Municipio.Example'), 's•••••••d@municipio.example');
  assert.equal(maskEmailDestination('ab@example.test'), 'a•@example.test');
  assert.equal(maskEmailDestination('invalido'), '');
});

test('OTP email es determinista por flujo/intento, de seis digitos y normaliza cerrado', () => {
  const flowHash = 'a'.repeat(64);
  const attemptA = '30000000-0000-4000-8000-000000000001';
  const attemptB = '30000000-0000-4000-8000-000000000002';
  const first = emailMfaCode(flowHash, attemptA, PEPPER);
  assert.match(first, /^\d{6}$/);
  assert.equal(emailMfaCode(flowHash, attemptA, PEPPER), first);
  assert.notEqual(emailMfaCode(flowHash, attemptB, PEPPER), first);
  assert.equal(normalizeEmailMfaCode(` ${first} `), first);
  assert.equal(normalizeEmailMfaCode('12345a'), '');
  assert.throws(() => emailMfaCode('x', attemptA, PEPPER), /coordenadas/);
});

test('recovery codes son one-time material normalizable y no hashes reversibles', () => {
  const codes = createRecoveryCodes((size) => Buffer.alloc(size, 0x3c));
  assert.equal(codes.length, 8);
  assert.match(codes[0], /^[A-F0-9]{5}(?:-[A-F0-9]{5}){3}$/);
  assert.equal(normalizeRecoveryCode(codes[0]).length, 20);
  assert.notEqual(hashIdentitySecret(normalizeRecoveryCode(codes[0]), PEPPER), codes[0]);
});

test('cookie v2 es __Host no persistente y token sólo contiene referencias versionadas', () => {
  const session = {
    id: '11111111-1111-4111-8111-111111111111', email: 'marcelo@example.test',
    version: 2, identityVersion: 4,
  };
  const token = issueIdentitySessionToken(session, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  assert.deepEqual(verifyIdentitySessionToken(token, { secret: SESSION_SECRET, now: NOW + 1000 }), {
    id: session.id, email: session.email, version: 2, identityVersion: 4,
    issuedAt: Math.floor(NOW / 1000), expiresAt: Math.floor(NOW / 1000) + 3600,
  });
  const cookie = serializeIdentitySessionCookie(token);
  assert.match(cookie, new RegExp(`^${IDENTITY_SESSION_COOKIE}=`));
  assert.match(cookie, /Path=\/; HttpOnly; SameSite=Strict; Secure$/);
  assert.doesNotMatch(cookie, /Max-Age|Domain=/i);
});
