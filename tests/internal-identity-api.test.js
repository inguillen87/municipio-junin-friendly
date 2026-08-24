import assert from 'node:assert/strict';
import test from 'node:test';

import { createInternalIdentityHandler } from '../api/internal-identity.js';
import {
  IdentityGatewayError,
  normalizeIdentityDatabaseCommand,
  requireInternalAccess,
  revokeIdentitySessionForLogout,
} from '../lib/internal-identity-access.js';
import {
  createTotpEnrollment,
  encryptEmailMfaDestination,
  encryptMfaSecret,
  hashIdentitySecret,
  IDENTITY_SESSION_COOKIE,
  issueIdentitySessionToken,
  totpCode,
} from '../lib/internal-identity-crypto.js';
import { INTERNAL_SESSION_COOKIE, issueInternalSessionToken } from '../lib/internal-session.js';
import { hashInternalPassword } from '../lib/internal-password.js';
import {
  InvitationDeliveryError,
  createResendInvitationDelivery,
} from '../lib/internal-invitation-delivery.js';

const ORIGIN = 'https://municipio.example';
const SESSION_SECRET = 's'.repeat(48);
const SECRETS = Object.freeze({
  tokenPepper: 'p'.repeat(48), sessionSecret: SESSION_SECRET, encryptionKey: Buffer.alloc(32, 7),
  emailMfaPepper: 'e'.repeat(48), emailMfaEncryptionKey: Buffer.alloc(32, 8),
});
const NOW = Date.parse('2026-08-20T15:00:00.000Z');
const RELEASE_SHA = 'a'.repeat(40);
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const DELIVERY_ATTEMPT_A = '30000000-0000-4000-8000-000000000001';
const DELIVERY_ATTEMPT_B = '30000000-0000-4000-8000-000000000002';
const EMAIL_CHALLENGE_ID = '40000000-0000-4000-8000-000000000001';

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function request(command, payload, options = {}) {
  return {
    method: 'POST',
    headers: {
      origin: options.origin ?? ORIGIN,
      'content-type': 'application/json',
      'x-vercel-forwarded-for': options.ip || '203.0.113.44',
      ...(options.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: { command, payload, ...(options.expectedVersion ? { expectedVersion: options.expectedVersion } : {}) },
  };
}

function handlerWithQuery(query, overrides = {}) {
  return createInternalIdentityHandler({
    env: { IDENTITY_APP_ORIGIN: ORIGIN, VERCEL_GIT_COMMIT_SHA: RELEASE_SHA, NODE_ENV: 'test' },
    identitySecrets: SECRETS, now: () => NOW,
    randomUUID: (() => {
      let index = 0;
      const values = [
        '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
        '30000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004',
      ];
      return () => values[index++ % values.length];
    })(),
    randomBytes: (size) => Buffer.alloc(size, 5),
    getTenantIdentitySql: async () => ({ query }),
    ...overrides,
  });
}

function successfulRateLimit(sql, params) {
  if (sql.includes('tenant_identity_take_rate_limit')) return [{ result: { allowed: true, remaining: 5 } }];
  return null;
}

test('login incorrecto/usuario desconocido comparte status y body generico con dummy KDF', async () => {
  const handler = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) return [{ result: null }];
    throw new Error('consulta no esperada');
  });
  const res = response();
  await handler(request('login', { email: 'unknown@example.test', password: 'incorrecta' }), res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { ok: false, code: 'IDENTITY_AUTH_FAILED', error: 'Credenciales incorrectas' });
  assert.match(res.headers['Cache-Control'], /no-store/);
});

test('password valido devuelve CONTEXT_REQUIRED sin hash, token de DB ni auto-seleccion', async () => {
  const passwordHash = await hashInternalPassword('una-clave-realmente-larga');
  const handler = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      email: 'marcelo@example.test', passwordHash, requiresMfa: true,
      contexts: [
        { kind: 'platform', label: 'Administracion de plataforma', tenantId: null },
        { kind: 'tenant', tenantId: TENANT_ID, tenantName: 'Junin', source: 'legacy_explicit' },
      ],
    } }];
    if (sql.includes('tenant_identity_apply_command')) {
      assert.equal(params[0], 'begin_login_context');
      return [{ result: { challengeId: SESSION_ID, version: 1, expiresAt: '2026-08-20T15:10:00.000Z' } }];
    }
    throw new Error('consulta no esperada');
  });
  const res = response();
  await handler(request('login', { email: 'marcelo@example.test', password: 'una-clave-realmente-larga' }), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.code, 'CONTEXT_REQUIRED');
  assert.equal(res.payload.contexts.length, 2);
  assert.equal(typeof res.payload.flowToken, 'string');
  assert.doesNotMatch(JSON.stringify(res.payload), /passwordHash|mfaSecret|ciphertext/i);
});

test('select_context privilegiado sin factor inicia enrolamiento, no crea sesion password', async () => {
  const handler = handlerWithQuery(async (sql, params) => {
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      purpose: 'login_context', status: 'pending', email: 'marcelo@example.test', version: 1,
    } }];
    if (sql.includes('tenant_identity_apply_command')) {
      assert.equal(params[0], 'select_login_context');
      const payload = JSON.parse(params[5]);
      assert.equal(payload.activeTenantId, TENANT_ID);
      assert.match(payload.mfaSecretCiphertext, /^v1\./);
      return [{ result: {
        mfaEnrollmentRequired: true, version: 2, expiresAt: '2026-08-20T15:10:00.000Z',
      } }];
    }
    throw new Error('consulta no esperada');
  });
  const res = response();
  await handler(request('select_context', {
    flowToken: 'f'.repeat(43), context: { kind: 'tenant', tenantId: TENANT_ID },
  }, { idempotencyKey: KEY, expectedVersion: 1 }), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.code, 'MFA_ENROLLMENT_REQUIRED');
  assert.equal(res.payload.flow.expectedVersion, 2);
  assert.match(res.payload.mfaEnrollment.otpauthUri, /^otpauth:\/\/totp\//);
  assert.equal(res.headers['Set-Cookie'], undefined);
});

test('select_context rechaza tenant IDOR y replay consumido de otro proposito', async () => {
  const idor = handlerWithQuery(async (sql) => {
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      purpose: 'login_context', status: 'pending', email: 'marcelo@example.test', version: 1,
    } }];
    if (sql.includes('tenant_identity_apply_command')) throw new Error('IDENTITY_CONTEXT_FORBIDDEN');
    throw new Error('consulta no esperada');
  });
  const denied = response();
  await idor(request('select_context', {
    flowToken: 'f'.repeat(43), context: { kind: 'tenant', tenantId: TENANT_ID },
  }, { idempotencyKey: KEY, expectedVersion: 1 }), denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.payload.code, 'IDENTITY_CONTEXT_FORBIDDEN');

  const crossPurpose = handlerWithQuery(async (sql) => {
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      purpose: 'activation', status: 'consumed', email: 'marcelo@example.test',
      requestedTenantId: TENANT_ID, completionIdempotencyKey: KEY,
      completedSession: { id: SESSION_ID, email: 'marcelo@example.test', version: 1,
        identityVersion: 2, authLevel: 'mfa', tenantId: TENANT_ID,
        expiresAt: '2026-08-20T16:00:00.000Z', source: 'membership' },
    } }];
    throw new Error('consulta no esperada');
  });
  const replay = response();
  await crossPurpose(request('select_context', {
    flowToken: 'f'.repeat(43), context: { kind: 'tenant', tenantId: TENANT_ID },
  }, { idempotencyKey: KEY, expectedVersion: 1 }), replay);
  assert.equal(replay.statusCode, 401);
  assert.equal(replay.payload.code, 'IDENTITY_FLOW_INVALID_OR_EXPIRED');
  assert.equal(replay.headers['Set-Cookie'], undefined);
});

test('MFA invalido devuelve nueva version y el siguiente codigo correcto completa una sola vez', async () => {
  const enrollment = createTotpEnrollment('marcelo@example.test', { random: (size) => Buffer.alloc(size, 0x2a) });
  const ciphertext = encryptMfaSecret(enrollment.manualKey, SECRETS.encryptionKey,
    { random: (size) => Buffer.alloc(size, 0x19) });
  const validCode = totpCode(enrollment.manualKey, { now: NOW });
  const invalidCode = validCode === '000000' ? '999999' : '000000';
  let version = 2;
  let completes = 0;
  const handler = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      purpose: 'login_mfa', status: 'pending', email: 'marcelo@example.test', version,
      mfaSecretCiphertext: ciphertext,
    } }];
    if (sql.includes('tenant_identity_record_attempt')) {
      version += 1;
      return [{ result: { accepted: false, locked: false, remainingAttempts: 4, version } }];
    }
    if (sql.includes('tenant_identity_apply_command')) {
      completes += 1;
      assert.equal(params[0], 'complete_login_mfa');
      assert.equal(params[4], version);
      return [{ result: { session: {
        id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
        authLevel: 'mfa', expiresAt: '2026-08-20T16:00:00.000Z', tenantId: TENANT_ID,
        source: 'membership',
      } } }];
    }
    throw new Error('consulta no esperada');
  });
  const wrong = response();
  await handler(request('verify_mfa', { flowToken: 'f'.repeat(43), totpCode: invalidCode }, {
    idempotencyKey: KEY, expectedVersion: 2,
  }), wrong);
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(wrong.payload, { ok: false, code: 'IDENTITY_MFA_INVALID', error: 'Codigo invalido',
    expectedVersion: 3, remainingAttempts: 4 });

  const correct = response();
  await handler(request('verify_mfa', { flowToken: 'f'.repeat(43), totpCode: validCode }, {
    idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expectedVersion: 3,
  }), correct);
  assert.equal(correct.statusCode, 200);
  assert.equal(correct.payload.session.authLevel, 'mfa');
  assert.equal(completes, 1);
});

test('quinto MFA invalido bloquea durablemente y un intento posterior no revive el flow', async () => {
  const enrollment = createTotpEnrollment('marcelo@example.test', { random: (size) => Buffer.alloc(size, 0x2a) });
  const ciphertext = encryptMfaSecret(enrollment.manualKey, SECRETS.encryptionKey,
    { random: (size) => Buffer.alloc(size, 0x19) });
  const validCode = totpCode(enrollment.manualKey, { now: NOW });
  const invalidCode = validCode === '000000' ? '999999' : '000000';
  let version = 1;
  let attempts = 0;
  let locked = false;
  const handler = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      purpose: 'login_mfa', status: locked ? 'locked' : 'pending',
      email: 'marcelo@example.test', version, mfaSecretCiphertext: ciphertext,
    } }];
    if (sql.includes('tenant_identity_record_attempt')) {
      attempts += 1; version += 1; locked = attempts >= 5;
      return [{ result: { accepted: false, locked, remainingAttempts: Math.max(0, 5 - attempts), version } }];
    }
    throw new Error('consulta no esperada');
  });
  for (let index = 0; index < 5; index += 1) {
    const res = response();
    const key = `${String(index + 1).padStart(8, '0')}-0000-4000-8000-000000000000`;
    await handler(request('verify_mfa', { flowToken: 'f'.repeat(43), totpCode: invalidCode }, {
      idempotencyKey: key, expectedVersion: version,
    }), res);
    assert.equal(res.statusCode, index === 4 ? 423 : 401);
    if (index === 4) {
      assert.equal(res.payload.code, 'IDENTITY_FLOW_LOCKED');
      assert.equal(res.payload.expectedVersion, 6);
      assert.equal(res.payload.remainingAttempts, 0);
    }
  }
  const afterLock = response();
  await handler(request('verify_mfa', { flowToken: 'f'.repeat(43), totpCode: validCode }, {
    idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedVersion: 6,
  }), afterLock);
  assert.equal(afterLock.statusCode, 401);
  assert.equal(afterLock.payload.code, 'IDENTITY_FLOW_INVALID_OR_EXPIRED');
  assert.equal(afterLock.payload.expectedVersion, undefined);
});

test('request_email_mfa obtiene destino cifrado del servidor, envia OTP y responde solo pista', async () => {
  const destination = 'seguridad@municipio.example';
  const destinationCiphertext = encryptEmailMfaDestination(
    destination, SECRETS.emailMfaEncryptionKey,
    { random: (size) => Buffer.alloc(size, 4) });
  const destinationHash = hashIdentitySecret(
    `email-mfa-destination|${destination}`, SECRETS.emailMfaPepper,
  );
  const deliveries = [];
  const handler = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      purpose: 'login_mfa', status: 'pending', email: 'owner@junin.example', version: 2,
      requestedTenantId: null,
    } }];
    if (sql.includes('tenant_identity_prepare_email_mfa')) {
      assert.equal(params[1], KEY);
      assert.match(params[2], /^[a-f0-9]{64}$/);
      assert.equal(params[4], 2);
      return [{ result: {
        id: EMAIL_CHALLENGE_ID, deliveryAttemptId: KEY,
        destinationCiphertext, destinationHash,
        expiresAt: '2026-08-20T15:05:00.000Z', status: 'pending_delivery',
        flowVersion: 2, version: 1,
      } }];
    }
    if (sql.includes('tenant_identity_mark_email_mfa_delivery')) {
      assert.match(params[0], /^[a-f0-9]{64}$/);
      assert.deepEqual(params.slice(1), [KEY, true]);
      return [{ result: { id: EMAIL_CHALLENGE_ID, status: 'active', version: 2 } }];
    }
    throw new Error(`consulta no esperada: ${sql}`);
  }, {
    mfaEmailDelivery: {
      isConfigured: () => true,
      async deliver(input) { deliveries.push(input); return { providerAccepted: true }; },
    },
  });
  const res = response();
  await handler(request('request_email_mfa', { flowToken: 'f'.repeat(43) }, {
    idempotencyKey: KEY, expectedVersion: 2,
  }), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.code, 'EMAIL_MFA_ACCEPTED');
  assert.equal(res.payload.challenge.id, KEY);
  assert.equal(res.payload.challenge.maskedDestination, 's•••••••d@municipio.example');
  assert.equal(res.payload.challenge.expectedVersion, 2);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].to, destination);
  assert.match(deliveries[0].code, /^\d{6}$/);
  assert.doesNotMatch(JSON.stringify(res.payload), /seguridad@municipio|destinationCiphertext|destinationHash/i);
  assert.doesNotMatch(JSON.stringify(res.payload), new RegExp(deliveries[0].code));
});

test('request_email_mfa expone cooldown 429 con Retry-After sin contactar al proveedor', async () => {
  let deliveries = 0;
  const handler = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      purpose: 'login_mfa', status: 'pending', email: 'owner@junin.example', version: 2,
      requestedTenantId: null,
    } }];
    if (sql.includes('tenant_identity_prepare_email_mfa')) {
      throw new Error('IDENTITY_EMAIL_MFA_COOLDOWN');
    }
    throw new Error(`consulta no esperada: ${sql}`);
  }, {
    mfaEmailDelivery: {
      isConfigured: () => true,
      async deliver() { deliveries += 1; return { providerAccepted: true }; },
    },
  });
  const res = response();
  await handler(request('request_email_mfa', { flowToken: 'f'.repeat(43) }, {
    idempotencyKey: KEY, expectedVersion: 2,
  }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '45');
  assert.deepEqual(res.payload, {
    ok: false,
    code: 'IDENTITY_EMAIL_MFA_COOLDOWN',
    error: 'Espera antes de solicitar otro codigo',
    retryAfterSeconds: 45,
  });
  assert.equal(deliveries, 0);
});

test('request_email_mfa sin proveedor falla antes de abrir DB', async () => {
  let opened = false;
  const handler = handlerWithQuery(async () => [], {
    getTenantIdentitySql: async () => { opened = true; return { query: async () => [] }; },
    mfaEmailDelivery: { isConfigured: () => false, deliver: async () => ({}) },
  });
  const res = response();
  await handler(request('request_email_mfa', { flowToken: 'f'.repeat(43) }, {
    idempotencyKey: KEY, expectedVersion: 2,
  }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE');
  assert.equal(opened, false);
});

test('request_email_mfa exige secretos dedicados antes de abrir DB', async () => {
  let opened = false;
  const handler = createInternalIdentityHandler({
    env: { IDENTITY_APP_ORIGIN: ORIGIN, VERCEL_GIT_COMMIT_SHA: RELEASE_SHA },
    identitySecrets: {
      tokenPepper: SECRETS.tokenPepper,
      sessionSecret: SECRETS.sessionSecret,
      encryptionKey: SECRETS.encryptionKey,
    },
    getTenantIdentitySql: async () => { opened = true; return { query: async () => [] }; },
    mfaEmailDelivery: { isConfigured: () => true, deliver: async () => ({ providerAccepted: true }) },
  });
  const res = response();
  await handler(request('request_email_mfa', { flowToken: 'f'.repeat(43) }, {
    idempotencyKey: KEY, expectedVersion: 2,
  }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE');
  assert.equal(opened, false);
});

test('verify_email_mfa consume hash server-side y crea sesion recovery auditada', async () => {
  let completed = 0;
  const handler = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      purpose: 'login_mfa', status: 'pending', email: 'owner@junin.example', version: 2,
    } }];
    if (sql.includes('tenant_identity_complete_email_mfa')) {
      completed += 1;
      assert.equal(params[1], KEY_B);
      assert.match(params[2], /^[a-f0-9]{64}$/);
      assert.equal(params[7], 2);
      assert.equal(params[8], KEY);
      assert.match(params[9], /^[a-f0-9]{64}$/);
      return [{ result: { verified: true, session: {
        id: SESSION_ID, email: 'owner@junin.example', version: 1, identityVersion: 2,
        authLevel: 'recovery', expiresAt: '2026-08-20T23:00:00.000Z', tenantId: null,
        source: 'platform',
      } } }];
    }
    throw new Error(`consulta no esperada: ${sql}`);
  });
  const res = response();
  await handler(request('verify_email_mfa', {
    flowToken: 'f'.repeat(43), emailChallengeId: KEY, code: '482731',
  }, { idempotencyKey: KEY_B, expectedVersion: 2 }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.authMethod, 'email_otp');
  assert.equal(res.payload.session.authLevel, 'recovery');
  assert.equal(completed, 1);
  assert.match(String(res.headers['Set-Cookie']), new RegExp(IDENTITY_SESSION_COOKIE));
  assert.doesNotMatch(JSON.stringify(res.payload), /482731|emailChallengeId/i);
});

test('verify_email_mfa versiona el desafio email sin confundirlo con la version del flow TOTP', async () => {
  let completes = 0;
  const handler = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      purpose: 'login_mfa', status: 'pending', email: 'owner@junin.example', version: 2,
    } }];
    if (sql.includes('tenant_identity_complete_email_mfa')) {
      completes += 1;
      assert.equal(params[7], completes === 1 ? 2 : 3);
      assert.equal(params[8], KEY);
      if (completes === 1) return [{ result: {
        verified: false, locked: false, remainingAttempts: 4, version: 3,
      } }];
      return [{ result: { verified: true, version: 4, session: {
        id: SESSION_ID, email: 'owner@junin.example', version: 1, identityVersion: 2,
        authLevel: 'recovery', expiresAt: '2026-08-20T23:00:00.000Z', tenantId: null,
        source: 'platform',
      } } }];
    }
    throw new Error(`consulta no esperada: ${sql}`);
  });
  const wrong = response();
  await handler(request('verify_email_mfa', {
    flowToken: 'f'.repeat(43), emailChallengeId: KEY, code: '111111',
  }, { idempotencyKey: KEY_B, expectedVersion: 2 }), wrong);
  assert.equal(wrong.statusCode, 401);
  assert.equal(wrong.payload.code, 'IDENTITY_EMAIL_MFA_INVALID');
  assert.equal(wrong.payload.expectedVersion, 3);
  assert.equal(wrong.payload.remainingAttempts, 4);

  const correct = response();
  await handler(request('verify_email_mfa', {
    flowToken: 'f'.repeat(43), emailChallengeId: KEY, code: '222222',
  }, {
    idempotencyKey: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', expectedVersion: 3,
  }), correct);
  assert.equal(correct.statusCode, 200);
  assert.equal(completes, 2);
});

test('origin canonico no confia en Host reflejado y corta antes de abrir DB', async () => {
  let opened = false;
  const handler = handlerWithQuery(async () => [], {
    getTenantIdentitySql: async () => { opened = true; return { query: async () => [] }; },
  });
  const res = response();
  await handler(request('login', { email: 'x@example.test', password: 'x' }, { origin: 'https://evil.example' }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'IDENTITY_ORIGIN_FORBIDDEN');
  assert.equal(opened, false);
});

test('issue_invitation sin provider falla antes de mutar y nunca devuelve codigo', async () => {
  let queried = false;
  let opened = false;
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  const handler = handlerWithQuery(async () => { queried = true; return []; }, {
    getTenantIdentitySql: async () => {
      opened = true;
      return { query: async () => { queried = true; return []; } };
    },
  });
  const res = response();
  await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 1,
  }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_DELIVERY_UNAVAILABLE');
  assert.equal(opened, false);
  assert.equal(queried, false);
});

test('issue_invitation con Resend sin configurar falla antes de abrir DB', async () => {
  let opened = false;
  const handler = handlerWithQuery(async () => [], {
    deliverInvitation: createResendInvitationDelivery({
      env: { IDENTITY_APP_ORIGIN: ORIGIN },
      fetch: async () => { throw new Error('fetch no debe ejecutarse'); },
    }),
    getTenantIdentitySql: async () => {
      opened = true;
      return { query: async () => [] };
    },
  });
  const res = response();
  await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    idempotencyKey: KEY, expectedVersion: 1,
  }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_DELIVERY_UNAVAILABLE');
  assert.equal(opened, false);
});

test('requireInternalAccess exige data plane y SHA exacto del release', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  const release = 'a'.repeat(40);
  const sql = { query: async () => [{ result: {
    authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
    platform: { roles: ['PLATFORM_OWNER'], capabilities: [] },
    tenant: { id: TENANT_ID, dataPlaneReady: true, certifiedReleaseSha: release,
      effectiveCapabilities: ['workforce.summary.read'] },
  } }] };
  const req = { headers: { cookie: `${IDENTITY_SESSION_COOKIE}=${token}` } };
  const mismatch = response();
  assert.equal(await requireInternalAccess(req, mismatch, {
    sql, sessionSecret: SESSION_SECRET, now: NOW,
    requiredCapabilities: ['workforce.summary.read'], requireDataPlaneReady: true,
    expectedReleaseSha: 'b'.repeat(40),
  }), null);
  assert.equal(mismatch.statusCode, 503);
  assert.equal(mismatch.payload.code, 'IDENTITY_RELEASE_NOT_CERTIFIED');

  const accepted = response();
  const result = await requireInternalAccess(req, accepted, {
    sql, sessionSecret: SESSION_SECRET, now: NOW,
    requiredCapabilities: ['workforce.summary.read'], requireDataPlaneReady: true,
    expectedReleaseSha: release,
  });
  assert.equal(result.principal.tenant.id, TENANT_ID);
});

test('normalizador exige expectedVersion y logout helper deriva version del sid firmado', async () => {
  assert.throws(() => normalizeIdentityDatabaseCommand('revoke_session', { sessionId: SESSION_ID }, {
    idempotencyKey: KEY,
  }), (error) => error instanceof IdentityGatewayError && error.code === 'IDENTITY_VERSION_REQUIRED');
  assert.throws(() => normalizeIdentityDatabaseCommand('begin_activation', {
    invitationId: SESSION_ID, flowHash: 'a'.repeat(64), mfaSecretCiphertext: null,
    expiresAt: '2026-08-20T16:00:00.000Z',
  }, { idempotencyKey: KEY, expectedVersion: 1 }),
  (error) => error instanceof IdentityGatewayError && error.code === 'IDENTITY_RELEASE_NOT_CERTIFIED');
  const calls = [];
  const result = await revokeIdentitySessionForLogout({
    sql: { query: async (_sql, params) => { calls.push(params); return [{ result: { status: 'revoked' } }]; } },
    session: { id: SESSION_ID, email: 'marcelo@example.test', version: 3 }, idempotencyKey: KEY,
  });
  assert.equal(result.status, 'revoked');
  assert.equal(calls[0][0], 'logout');
  assert.equal(calls[0][4], 3);
});

test('body mayor a 16 KiB se rechaza antes de abrir la base', async () => {
  let opened = false;
  const handler = handlerWithQuery(async () => [], {
    getTenantIdentitySql: async () => { opened = true; return { query: async () => [] }; },
  });
  const res = response();
  await handler(request('login', { email: 'x@example.test', password: 'x'.repeat(17 * 1024) }), res);
  assert.equal(res.statusCode, 413);
  assert.equal(res.payload.code, 'IDENTITY_BODY_TOO_LARGE');
  assert.equal(opened, false);
});

test('rate limit usa buckets durables independientes de cuenta e IP confiable', async () => {
  const calls = [];
  const handler = handlerWithQuery(async (sql, params) => {
    if (sql.includes('tenant_identity_take_rate_limit')) {
      calls.push([params[0], params[1]]);
      return [{ result: { allowed: true, remaining: 5 } }];
    }
    if (sql.includes('tenant_identity_lookup')) return [{ result: null }];
    throw new Error('consulta no esperada');
  });
  for (const [address, spoof] of [['a@example.test', '198.51.100.1'], ['a@example.test', '198.51.100.2'], ['b@example.test', '198.51.100.3']]) {
    const req = request('login', { email: address, password: 'incorrecta' });
    req.headers['x-forwarded-for'] = spoof;
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.payload.code, 'IDENTITY_AUTH_FAILED');
  }
  const account = calls.filter(([scope]) => scope === 'identity.login.account').map(([, bucket]) => bucket);
  const ip = calls.filter(([scope]) => scope === 'identity.login.ip').map(([, bucket]) => bucket);
  assert.equal(account[0], account[1]);
  assert.notEqual(account[1], account[2]);
  assert.equal(new Set(ip).size, 1);
});

test('cookie v2 invalida nunca cae a una cookie v1 valida', async () => {
  const legacy = issueInternalSessionToken({
    id: 'marcelo', email: 'marcelo@example.test', role: 'ADMIN_INTERNO',
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  let queried = false;
  const handler = handlerWithQuery(async () => { queried = true; return []; });
  const res = response();
  await handler({ method: 'GET', query: { resource: 'bootstrap' }, headers: {
    cookie: `${IDENTITY_SESSION_COOKIE}=token-invalido; ${INTERNAL_SESSION_COOKIE}=${legacy}`,
  } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, 'IDENTITY_SESSION_INVALID');
  assert.equal(queried, false);
});

test('logout limpia cookies v1 y v2 aun si la revocacion DB no se confirma', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  const handler = handlerWithQuery(async (sql) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: [] }, tenant: null,
    } }];
    if (sql.includes('tenant_identity_apply_command')) throw new Error('database unavailable');
    throw new Error('consulta no esperada');
  });
  const res = response();
  await handler(request('logout', {}, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY,
  }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_GATEWAY_UNAVAILABLE');
  assert.equal(Array.isArray(res.headers['Set-Cookie']), true);
  assert.match(res.headers['Set-Cookie'].join('\n'), /__Host-mc_identity=.*Max-Age=0/);
  assert.match(res.headers['Set-Cookie'].join('\n'), /municontrol_internal_session=.*Max-Age=0/);
});

test('operaciones platform-only rechazan contexto tenant y aceptan contexto platform', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  const make = (tenant) => handlerWithQuery(async (sql) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.read'] }, tenant,
    } }];
    if (sql.includes('tenant_identity_platform_invitations_view_v2')) {
      return [{ result: { allowedCommands: [], invitations: [] } }];
    }
    throw new Error('consulta no esperada');
  });
  const tenantRes = response();
  await make({ id: TENANT_ID })({ method: 'GET', query: { resource: 'invitations' },
    headers: { cookie: `${IDENTITY_SESSION_COOKIE}=${token}` } }, tenantRes);
  assert.equal(tenantRes.statusCode, 403);
  const platformRes = response();
  await make(null)({ method: 'GET', query: { resource: 'invitations' },
    headers: { cookie: `${IDENTITY_SESSION_COOKIE}=${token}` } }, platformRes);
  assert.equal(platformRes.statusCode, 200);
  assert.deepEqual(platformRes.payload.invitations, []);
});

test('switch_context valida server-side, rota SID y no extiende la expiracion absoluta', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 3, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  let switchedPayload;
  const handler = handlerWithQuery(async (sql, params) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: [] }, tenant: null,
    } }];
    if (sql.includes('tenant_identity_apply_command')) {
      assert.equal(params[0], 'switch_context');
      assert.equal(params[4], 3);
      switchedPayload = JSON.parse(params[5]);
      return [{ result: { session: {
        id: switchedPayload.newSessionId, email: 'marcelo@example.test', version: 1,
        identityVersion: 2, authLevel: 'mfa', expiresAt: switchedPayload.sessionExpiresAt,
        tenantId: TENANT_ID, source: 'legacy_explicit',
      } } }];
    }
    throw new Error('consulta no esperada');
  });
  const res = response();
  await handler(request('switch_context', { context: { kind: 'tenant', tenantId: TENANT_ID } }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 3,
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(switchedPayload.currentSessionId, SESSION_ID);
  assert.notEqual(switchedPayload.newSessionId, SESSION_ID);
  assert.equal(switchedPayload.activeTenantId, TENANT_ID);
  assert.equal(switchedPayload.sessionExpiresAt, '2026-08-20T16:00:00.000Z');
  assert.equal(Array.isArray(res.headers['Set-Cookie']), true);
});

test('activacion queda cerrada si policy no esta lista', async () => {
  const code = 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAAA';
  const handler = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) return [{ result: {
      invitationId: SESSION_ID, invitationVersion: 1, email: 'persona@example.test',
      requiresMfa: false, tenant: { id: TENANT_ID, name: 'Junin' }, roleKey: 'RRHH_OPERADOR',
    } }];
    if (sql.includes('tenant_identity_apply_command')) throw new Error('IDENTITY_DATA_PLANE_NOT_READY');
    throw new Error('consulta no esperada');
  });
  const res = response();
  await handler(request('begin_activation', { invitationCode: code }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_DATA_PLANE_NOT_READY');
  assert.doesNotMatch(JSON.stringify(res.payload), /flowToken|manualKey|otpauth/i);
});

test('activacion exige SHA de release y lo vincula a lookup y comando transaccional', async () => {
  const code = 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAAA';
  let lookedUpRelease;
  let lookedUpCodeHash;
  let commandRelease;
  let commandCodeHash;
  const accepted = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) {
      lookedUpRelease = params[3];
      lookedUpCodeHash = params[2];
      return [{ result: {
        invitationId: SESSION_ID, invitationVersion: 1, email: 'persona@example.test',
        requiresMfa: false, tenant: { id: TENANT_ID, name: 'Junin' }, roleKey: 'RRHH_OPERADOR',
      } }];
    }
    if (sql.includes('tenant_identity_apply_command')) {
      const commandPayload = JSON.parse(params[5]);
      commandRelease = commandPayload.releaseSha;
      commandCodeHash = commandPayload.codeHash;
      return [{ result: { version: 1, expiresAt: '2026-08-20T15:10:00.000Z' } }];
    }
    throw new Error('consulta no esperada');
  });
  const ok = response();
  await accepted(request('begin_activation', { invitationCode: code }), ok);
  assert.equal(ok.statusCode, 200);
  assert.equal(lookedUpRelease, RELEASE_SHA);
  assert.equal(commandRelease, RELEASE_SHA);
  assert.match(lookedUpCodeHash, /^[a-f0-9]{64}$/);
  assert.equal(commandCodeHash, lookedUpCodeHash);

  let queried = false;
  const missing = handlerWithQuery(async () => { queried = true; return []; }, {
    env: { IDENTITY_APP_ORIGIN: ORIGIN, NODE_ENV: 'test' },
  });
  const missingRes = response();
  await missing(request('begin_activation', { invitationCode: code }), missingRes);
  assert.equal(missingRes.statusCode, 503);
  assert.equal(missingRes.payload.code, 'IDENTITY_RELEASE_NOT_CERTIFIED');
  assert.equal(queried, false);

  const releaseB = 'b'.repeat(40);
  const mismatch = handlerWithQuery(async (sql, params) => {
    const rate = successfulRateLimit(sql, params); if (rate) return rate;
    if (sql.includes('tenant_identity_lookup')) {
      assert.equal(params[3], releaseB);
      throw new Error('IDENTITY_RELEASE_NOT_CERTIFIED');
    }
    throw new Error('consulta no esperada');
  }, { env: { IDENTITY_APP_ORIGIN: ORIGIN, VERCEL_GIT_COMMIT_SHA: releaseB, NODE_ENV: 'test' } });
  const mismatchRes = response();
  await mismatch(request('begin_activation', { invitationCode: code }), mismatchRes);
  assert.equal(mismatchRes.statusCode, 503);
  assert.equal(mismatchRes.payload.code, 'IDENTITY_RELEASE_NOT_CERTIFIED');
});

test('fallo definitivo conocido compensa la invitacion pendiente y nunca expone el codigo', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  const commands = [];
  let providerAttempt;
  const handler = handlerWithQuery(async (sql, params) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.invite'] }, tenant: null,
    } }];
    if (sql.includes('tenant_identity_platform_invitation_delivery_v2')) return [{ result: {
      invitationId: TENANT_ID, version: 1, email: 'persona@example.test',
      membershipStatus: 'invited', deliveryStatus: 'not_issued', tenant: { id: TENANT_ID, name: 'Junin' },
    } }];
    if (sql.includes('tenant_identity_platform_command_replay_v2')) return [{ result: null }];
    if (sql.includes('tenant_identity_apply_platform_command_v2')) {
      commands.push([params[4], JSON.parse(params[8])]);
      if (params[4] === 'issue_invitation') return [{ result: { deliveryAttemptId: DELIVERY_ATTEMPT_A, invitation: {
        id: TENANT_ID, status: 'prepared', version: 2,
        delivery: { status: 'pending', expiresAt: '2026-08-22T15:00:00.000Z' },
      } } }];
      if (params[4] === 'delivery_failed') return [{ result: { invitation: {
        id: TENANT_ID, status: 'prepared', version: 3, delivery: { status: 'failed' },
      } } }];
    }
    throw new Error('consulta no esperada');
  }, { deliverInvitation: async (delivery) => {
    providerAttempt = delivery.deliveryAttempt;
    throw new InvitationDeliveryError('PROVIDER_REJECTED', false);
  } });
  const res = response();
  await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 1,
  }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_DELIVERY_UNAVAILABLE');
  assert.deepEqual(commands.map(([command]) => command), ['issue_invitation', 'delivery_failed']);
  assert.match(commands[0][1].codeHash, /^[a-f0-9]{64}$/);
  assert.equal(commands[0][1].deliveryAttemptId, DELIVERY_ATTEMPT_A);
  assert.equal(commands[1][1].deliveryAttemptId, DELIVERY_ATTEMPT_A);
  assert.deepEqual(providerAttempt, { invitationId: TENANT_ID, id: DELIVERY_ATTEMPT_A });
  assert.doesNotMatch(JSON.stringify(res.payload), /AAAAA|invitationCode|codeHash/i);
});

test('fallos transitorios o desconocidos conservan el intento pending', async (t) => {
  const failures = [
    ['transitorio conocido', new InvitationDeliveryError('PROVIDER_TIMEOUT', true)],
    ['desconocido', new Error('fallo externo sin clasificar')],
  ];
  for (const [label, providerError] of failures) {
    await t.test(label, async () => {
      const token = issueIdentitySessionToken({
        id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
      }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
      const commands = [];
      const handler = handlerWithQuery(async (sql, params) => {
        if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
          authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
          platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.invite'] }, tenant: null,
        } }];
        if (sql.includes('tenant_identity_platform_invitation_delivery_v2')) return [{ result: {
          invitationId: TENANT_ID, version: 1, email: 'persona@example.test',
          membershipStatus: 'invited', deliveryStatus: 'not_issued',
          tenant: { id: TENANT_ID, name: 'Junin' },
        } }];
        if (sql.includes('tenant_identity_platform_command_replay_v2')) return [{ result: null }];
        if (sql.includes('tenant_identity_apply_platform_command_v2')) {
          commands.push(params[4]);
          if (params[4] === 'issue_invitation') return [{ result: {
            deliveryAttemptId: DELIVERY_ATTEMPT_A,
            invitation: { id: TENANT_ID, status: 'prepared', version: 2,
              delivery: { status: 'pending', expiresAt: '2026-08-22T15:00:00.000Z' } },
          } }];
          return [{ result: {} }];
        }
        throw new Error('consulta no esperada');
      }, { deliverInvitation: async () => { throw providerError; } });
      const res = response();
      await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
        cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 1,
      }), res);
      assert.equal(res.statusCode, 503);
      assert.equal(res.payload.code, 'IDENTITY_DELIVERY_UNAVAILABLE');
      assert.deepEqual(commands, ['issue_invitation']);
      assert.doesNotMatch(JSON.stringify(res.payload), /invitationCode|codeHash|fallo externo/i);
    });
  }
});

test('replay HTTP de entrega A no reenvia ni confirma cuando ya existe el intento B', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  let delivered = false;
  let applied = false;
  const handler = handlerWithQuery(async (sql) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.invite'] }, tenant: null,
    } }];
    if (sql.includes('tenant_identity_platform_invitation_delivery_v2')) return [{ result: {
      invitationId: TENANT_ID, version: 3, email: 'persona@example.test',
      membershipStatus: 'invited', deliveryStatus: 'pending', deliveryAttemptId: DELIVERY_ATTEMPT_B,
      tenant: { id: TENANT_ID, name: 'Junin' },
    } }];
    if (sql.includes('tenant_identity_platform_command_replay_v2')) return [{ result: {
      command: 'issue_invitation', result: {
        deliveryAttemptId: DELIVERY_ATTEMPT_A,
        invitation: { id: TENANT_ID, status: 'prepared', version: 2,
          delivery: { status: 'pending', expiresAt: '2026-08-22T15:00:00.000Z' } },
      },
    } }];
    if (sql.includes('tenant_identity_apply_platform_command_v2')) { applied = true; return []; }
    throw new Error('consulta no esperada');
  }, { deliverInvitation: async () => { delivered = true; } });
  const res = response();
  await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 2,
  }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.code, 'IDENTITY_DELIVERY_ATTEMPT_STALE');
  assert.equal(delivered, false);
  assert.equal(applied, false);
});

test('replay confirmado devuelve delivered sin reenviar ni volver a mutar', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  let providerCalls = 0;
  let applyCalls = 0;
  const handler = handlerWithQuery(async (sql, params) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.invite'] }, tenant: null,
    } }];
    if (sql.includes('tenant_identity_platform_invitation_delivery_v2')) return [{ result: {
      invitationId: TENANT_ID, version: 3, email: 'persona@example.test',
      membershipStatus: 'invited', deliveryStatus: 'delivered',
      deliveryAttemptId: DELIVERY_ATTEMPT_A, tenant: { id: TENANT_ID, name: 'Junin' },
    } }];
    if (sql.includes('tenant_identity_platform_command_replay_v2')) {
      assert.deepEqual(params.slice(0, 4), ['marcelo@example.test', SESSION_ID, 1, RELEASE_SHA]);
      assert.equal(params[6], 1);
      assert.equal(params[7], TENANT_ID);
      return [{ result: { command: 'issue_invitation', result: {
        deliveryAttemptId: DELIVERY_ATTEMPT_A,
        invitation: { id: TENANT_ID, status: 'prepared', version: 2,
          delivery: { status: 'pending', expiresAt: '2026-08-22T15:00:00.000Z' } },
      } } }];
    }
    if (sql.includes('tenant_identity_apply_platform_command_v2')) applyCalls += 1;
    throw new Error('consulta no esperada');
  }, { deliverInvitation: async () => { providerCalls += 1; } });
  const res = response();
  await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 1,
  }), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.payload.invitation.delivery.status, 'delivered');
  assert.equal(providerCalls, 0);
  assert.equal(applyCalls, 0);
});

test('replay pending con 23 horas no recontacta provider ni muta fuera de idempotencia segura', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  let providerCalls = 0;
  let applyCalls = 0;
  const handler = handlerWithQuery(async (sql) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.invite'] }, tenant: null,
    } }];
    if (sql.includes('tenant_identity_platform_invitation_delivery_v2')) return [{ result: {
      invitationId: TENANT_ID, version: 2, email: 'persona@example.test',
      membershipStatus: 'invited', deliveryStatus: 'pending', deliveryAttemptId: DELIVERY_ATTEMPT_A,
      tenant: { id: TENANT_ID, name: 'Junin' },
    } }];
    if (sql.includes('tenant_identity_platform_command_replay_v2')) return [{ result: {
      command: 'issue_invitation', result: {
        deliveryAttemptId: DELIVERY_ATTEMPT_A,
        invitation: { id: TENANT_ID, status: 'prepared', version: 2,
          delivery: { status: 'pending', expiresAt: '2026-08-21T16:00:00.000Z' } },
      },
    } }];
    if (sql.includes('tenant_identity_apply_platform_command_v2')) {
      applyCalls += 1;
      return [];
    }
    throw new Error('consulta no esperada');
  }, { deliverInvitation: async () => { providerCalls += 1; } });
  const res = response();
  await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 1,
  }), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_DELIVERY_UNAVAILABLE');
  assert.equal(providerCalls, 0);
  assert.equal(applyCalls, 0);
});

test('replay pending menor a 23 horas conserva envio idempotente y confirma', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  let providerCalls = 0;
  const commands = [];
  const handler = handlerWithQuery(async (sql, params) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.invite'] }, tenant: null,
    } }];
    if (sql.includes('tenant_identity_platform_invitation_delivery_v2')) return [{ result: {
      invitationId: TENANT_ID, version: 2, email: 'persona@example.test',
      membershipStatus: 'invited', deliveryStatus: 'pending', deliveryAttemptId: DELIVERY_ATTEMPT_A,
      tenant: { id: TENANT_ID, name: 'Junin' },
    } }];
    if (sql.includes('tenant_identity_platform_command_replay_v2')) return [{ result: {
      command: 'issue_invitation', result: {
        deliveryAttemptId: DELIVERY_ATTEMPT_A,
        invitation: { id: TENANT_ID, status: 'prepared', version: 2,
          delivery: { status: 'pending', expiresAt: '2026-08-21T16:01:00.000Z' } },
      },
    } }];
    if (sql.includes('tenant_identity_apply_platform_command_v2')) {
      commands.push(params[4]);
      assert.equal(params[4], 'confirm_delivery');
      return [{ result: { invitation: {
        id: TENANT_ID, status: 'issued', version: 3,
        delivery: { status: 'delivered', expiresAt: '2026-08-21T16:01:00.000Z' },
      } } }];
    }
    throw new Error('consulta no esperada');
  }, { deliverInvitation: async ({ deliveryAttempt }) => {
    providerCalls += 1;
    assert.equal(deliveryAttempt.id, DELIVERY_ATTEMPT_A);
  } });
  const res = response();
  await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 1,
  }), res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.invitation.delivery.status, 'delivered');
  assert.equal(providerCalls, 1);
  assert.deepEqual(commands, ['confirm_delivery']);
});

test('replay pending con kill-switch cerrado falla antes del provider', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  let providerCalls = 0;
  const handler = handlerWithQuery(async (sql) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.invite'] }, tenant: null,
    } }];
    if (sql.includes('tenant_identity_platform_invitation_delivery_v2')) return [{ result: {
      invitationId: TENANT_ID, version: 2, email: 'persona@example.test',
      membershipStatus: 'invited', deliveryStatus: 'pending',
      deliveryAttemptId: DELIVERY_ATTEMPT_A, tenant: { id: TENANT_ID, name: 'Junin' },
    } }];
    if (sql.includes('tenant_identity_platform_command_replay_v2')) {
      throw new Error('IDENTITY_DELIVERY_ATTEMPT_STALE');
    }
    throw new Error('consulta no esperada');
  }, { deliverInvitation: async () => { providerCalls += 1; } });
  const res = response();
  await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 1,
  }), res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.code, 'IDENTITY_DELIVERY_ATTEMPT_STALE');
  assert.equal(providerCalls, 0);
});

test('callback tardio A queda rechazado despues de emitir y confirmar B', async () => {
  const token = issueIdentitySessionToken({
    id: SESSION_ID, email: 'marcelo@example.test', version: 1, identityVersion: 2,
  }, { secret: SESSION_SECRET, now: NOW, ttlSeconds: 3600 });
  let invitationVersion = 1;
  let currentAttempt = null;
  let deliveryStatus = 'not_issued';
  let releaseA;
  let notifyAStarted;
  const aStarted = new Promise((resolve) => { notifyAStarted = resolve; });
  const holdA = new Promise((resolve) => { releaseA = resolve; });
  const confirmations = [];
  const handler = handlerWithQuery(async (sql, params) => {
    if (sql.includes('tenant_identity_resolve_access')) return [{ result: {
      authorized: true, user: { email: 'marcelo@example.test' }, session: { id: SESSION_ID },
      platform: { roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.invite'] }, tenant: null,
    } }];
    if (sql.includes('tenant_identity_platform_invitation_delivery_v2')) return [{ result: {
      invitationId: TENANT_ID, version: invitationVersion, email: 'persona@example.test',
      membershipStatus: 'invited', deliveryStatus, deliveryAttemptId: currentAttempt,
      tenant: { id: TENANT_ID, name: 'Junin' },
    } }];
    if (sql.includes('tenant_identity_platform_command_replay_v2')) return [{ result: null }];
    if (sql.includes('tenant_identity_apply_platform_command_v2')) {
      const command = params[4];
      const expected = params[7];
      const commandPayload = JSON.parse(params[8]);
      if (command === 'issue_invitation') {
        if (expected !== invitationVersion) throw new Error('IDENTITY_VERSION_CONFLICT');
        currentAttempt = commandPayload.deliveryAttemptId;
        deliveryStatus = 'pending';
        invitationVersion += 1;
        return [{ result: {
          deliveryAttemptId: currentAttempt,
          invitation: { id: TENANT_ID, status: 'prepared', version: invitationVersion,
            delivery: { status: 'pending', expiresAt: '2026-08-22T15:00:00.000Z' } },
        } }];
      }
      if (command === 'confirm_delivery') {
        confirmations.push(commandPayload.deliveryAttemptId);
        if (expected !== invitationVersion) throw new Error('IDENTITY_VERSION_CONFLICT');
        if (commandPayload.deliveryAttemptId !== currentAttempt || deliveryStatus !== 'pending') {
          throw new Error('IDENTITY_DELIVERY_ATTEMPT_STALE');
        }
        deliveryStatus = 'delivered';
        invitationVersion += 1;
        return [{ result: { invitation: {
          id: TENANT_ID, status: 'issued', version: invitationVersion,
          delivery: { status: 'delivered', expiresAt: '2026-08-22T15:00:00.000Z' },
        } } }];
      }
    }
    throw new Error('consulta no esperada');
  }, { deliverInvitation: async ({ deliveryAttempt }) => {
    if (deliveryAttempt.id === DELIVERY_ATTEMPT_A) {
      notifyAStarted();
      await holdA;
    }
  } });

  const responseA = response();
  const pendingA = handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY, expectedVersion: 1,
  }), responseA);
  await aStarted;

  const responseB = response();
  await handler(request('issue_invitation', { invitationId: TENANT_ID }, {
    cookie: `${IDENTITY_SESSION_COOKIE}=${token}`, idempotencyKey: KEY_B, expectedVersion: 2,
  }), responseB);
  assert.equal(responseB.statusCode, 202);
  assert.equal(deliveryStatus, 'delivered');
  assert.equal(currentAttempt, DELIVERY_ATTEMPT_B);
  assert.doesNotMatch(JSON.stringify(responseB.payload), /deliveryAttemptId/i);

  releaseA();
  await pendingA;
  assert.equal(responseA.statusCode, 409);
  assert.equal(responseA.payload.code, 'IDENTITY_VERSION_CONFLICT');
  assert.equal(deliveryStatus, 'delivered');
  assert.equal(currentAttempt, DELIVERY_ATTEMPT_B);
  assert.deepEqual(confirmations, [DELIVERY_ATTEMPT_B, DELIVERY_ATTEMPT_A]);
});
