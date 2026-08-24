import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { createInternalIdentityHandler } from '../api/internal-identity.js';
import {
  encryptEmailMfaDestination,
  hashIdentitySecret,
} from '../lib/internal-identity-crypto.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const ORIGIN = 'https://municipio.example';
const NOW = Date.parse('2026-08-24T15:00:00.000Z');
const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHALLENGE_ID = '40000000-0000-4000-8000-000000000001';
const RELEASE_SHA = 'a'.repeat(40);
const SECRETS = Object.freeze({
  tokenPepper: 'p'.repeat(48),
  sessionSecret: 's'.repeat(48),
  encryptionKey: Buffer.alloc(32, 7),
  emailMfaPepper: 'e'.repeat(48),
  emailMfaEncryptionKey: Buffer.alloc(32, 8),
});

function loginScript() {
  const html = read('login.html');
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]));
  const script = scripts.find((match) => match[2].includes("var IDENTITY_URL = '/api/internal-identity'"));
  assert.ok(script, 'falta el script de identidad del login');
  new vm.Script(script[2], { filename: 'login.html' });
  return script[2];
}

function functionDeclaration(source, name) {
  const marker = `async function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `falta ${marker}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`funcion ${name} incompleta`);
}

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function request(key) {
  return {
    method: 'POST',
    headers: {
      origin: ORIGIN,
      'content-type': 'application/json',
      'x-vercel-forwarded-for': '203.0.113.44',
      'idempotency-key': key,
    },
    body: {
      command: 'request_email_mfa',
      payload: { flowToken: 'f'.repeat(43) },
      expectedVersion: 2,
    },
  };
}

test('Continuar abre MFA y solicita el primer email una sola vez', async () => {
  const source = loginScript();
  const contextStart = source.indexOf('if (contextResult.challenge)');
  const contextEnd = source.indexOf('completeLogin(contextResult.session', contextStart);
  const contextBranch = source.slice(contextStart, contextEnd);
  assert.match(contextBranch, /openMfaStep\(contextResult\.challenge, contextEmail\);/);
  assert.match(contextBranch, /await requestEmailMfa\(\{ automatic: true \}\);/);
  assert.ok(contextBranch.indexOf('openMfaStep') < contextBranch.indexOf('requestEmailMfa'),
    'el formulario de código debe estar abierto antes de iniciar el envío');
  assert.match(source, /async function doLogin\(e\) \{\s*e\.preventDefault\(\);\s*if \(identityLoading\) return;/);

  let resolveRequest;
  let requests = 0;
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { textContent: '', focus() {} });
    return elements.get(id);
  };
  const context = {
    loginFlow: { token: 'flow-token', version: 2 },
    emailMfaRequestInFlight: false,
    emailMfaChallenge: null,
    emailMfaRequestKey: null,
    emailMfaRequestRetryAt: 0,
    usingEmailMfa: false,
    emailMfaExpired: () => true,
    emailMfaRetrySeconds: () => 0,
    document: { getElementById: element },
    hideError() {},
    setLoading() {},
    commandKey: () => KEY,
    identityRequest(command, payload, options) {
      requests += 1;
      assert.equal(command, 'request_email_mfa');
      assert.equal(payload.flowToken, 'flow-token');
      assert.equal(Object.keys(payload).length, 1);
      assert.equal(options.expectedVersion, 2);
      assert.equal(options.idempotencyKey, KEY);
      assert.equal(Object.keys(options).length, 2);
      return new Promise((resolve) => { resolveRequest = resolve; });
    },
    normalizeEmailMfaChallenge: (value) => value,
    selectMfaMethod(method) { context.usingEmailMfa = method === 'email'; },
    startEmailMfaCountdown() {},
    identityError: () => 'error',
    showError() {},
    cancelMfa() {},
    Date,
    Number,
  };
  vm.createContext(context);
  vm.runInContext(functionDeclaration(source, 'requestEmailMfa'), context);

  const first = context.requestEmailMfa({ automatic: true });
  assert.equal(context.emailMfaRequestInFlight, true);
  const duplicate = context.requestEmailMfa({ automatic: true });
  assert.equal(requests, 1, 'dos gestos concurrentes no deben crear dos solicitudes');
  resolveRequest({
    emailChallenge: {
      id: KEY,
      maskedDestination: 'g•••••n@example.test',
      expiresAt: '2026-08-24T15:05:00.000Z',
      retryAfterSeconds: 45,
      expectedVersion: 2,
    },
  });
  await Promise.all([first, duplicate]);
  assert.equal(context.emailMfaRequestInFlight, false);
  assert.equal(context.usingEmailMfa, true, 'el éxito debe dejar visible el ingreso del código email');
  assert.equal(context.emailMfaRequestKey, null, 'una respuesta cierta cierra el intento idempotente');
});

test('un usuario TOTP-only conserva TOTP y recovery sin error bloqueante', async () => {
  const source = loginScript();
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { textContent: '', focus() {} });
    return elements.get(id);
  };
  let selectedMethod = '';
  let blockingErrors = 0;
  const context = {
    loginFlow: { token: 'flow-token', version: 2 },
    emailMfaRequestInFlight: false,
    emailMfaChallenge: null,
    emailMfaRequestKey: null,
    emailMfaRequestRetryAt: 0,
    usingEmailMfa: false,
    emailMfaExpired: () => true,
    emailMfaRetrySeconds: () => 0,
    document: { getElementById: element },
    hideError() {},
    setLoading() {},
    commandKey: () => KEY,
    async identityRequest() {
      const error = new Error('email factor ausente');
      error.code = 'IDENTITY_EMAIL_MFA_NOT_CONFIGURED';
      throw error;
    },
    normalizeEmailMfaChallenge: (value) => value,
    selectMfaMethod(method) { selectedMethod = method; },
    startEmailMfaCountdown() {},
    identityError: () => 'error',
    showError() { blockingErrors += 1; },
    cancelMfa() {},
    Date,
    Number,
    Boolean,
  };
  vm.createContext(context);
  vm.runInContext(functionDeclaration(source, 'requestEmailMfa'), context);

  await context.requestEmailMfa({ automatic: true });

  assert.equal(selectedMethod, 'totp');
  assert.equal(blockingErrors, 0);
  assert.equal(context.loginFlow.token, 'flow-token', 'el desafío TOTP debe seguir vigente');
  assert.match(element('emailMfaStatus').textContent, /aplicación autenticadora o un código de recuperación/);
  assert.equal(context.emailMfaRequestInFlight, false);
});

test('replay 016 conserva un intento y el proveedor recibe una sola entrega', async () => {
  const destination = 'seguridad@municipio.example';
  const destinationCiphertext = encryptEmailMfaDestination(
    destination,
    SECRETS.emailMfaEncryptionKey,
    { random: (size) => Buffer.alloc(size, 4) },
  );
  const destinationHash = hashIdentitySecret(
    `email-mfa-destination|${destination}`,
    SECRETS.emailMfaPepper,
  );
  let challengeStatus = 'pending_delivery';
  let challengeVersion = 1;
  let deliveries = 0;
  const providerKeys = [];
  const sql = {
    async query(statement, params) {
      if (statement.includes('tenant_identity_lookup')) return [{ result: {
        purpose: 'login_mfa', status: 'pending', email: 'owner@junin.example', version: 2,
        requestedTenantId: null,
      } }];
      if (statement.includes('tenant_identity_take_rate_limit')) {
        return [{ result: { allowed: true, remaining: 4 } }];
      }
      if (statement.includes('tenant_identity_prepare_email_mfa')) {
        if (params[1] === KEY_B) throw new Error('IDENTITY_EMAIL_MFA_COOLDOWN');
        return [{ result: {
          id: CHALLENGE_ID,
          deliveryAttemptId: KEY,
          destinationCiphertext,
          destinationHash,
          expiresAt: '2026-08-24T15:05:00.000Z',
          status: challengeStatus,
          flowVersion: 2,
          factorVersion: 1,
          version: challengeVersion,
          replayed: challengeStatus === 'active',
        } }];
      }
      if (statement.includes('tenant_identity_mark_email_mfa_delivery')) {
        challengeStatus = 'active';
        challengeVersion += 1;
        return [{ result: { id: CHALLENGE_ID, status: challengeStatus, version: challengeVersion } }];
      }
      throw new Error(`consulta no esperada: ${statement}`);
    },
  };
  const handler = createInternalIdentityHandler({
    env: {
      IDENTITY_APP_ORIGIN: ORIGIN,
      VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
      NODE_ENV: 'test',
    },
    identitySecrets: SECRETS,
    now: () => NOW,
    randomUUID: () => '30000000-0000-4000-8000-000000000001',
    randomBytes: (size) => Buffer.alloc(size, 5),
    getTenantIdentitySql: async () => sql,
    mfaEmailDelivery: {
      isConfigured: () => true,
      async deliver(input) {
        deliveries += 1;
        providerKeys.push(input.idempotencyKey);
        return { providerAccepted: true };
      },
    },
  });

  const first = response();
  await handler(request(KEY), first);
  const replay = response();
  await handler(request(KEY), replay);
  const prematureResend = response();
  await handler(request(KEY_B), prematureResend);

  assert.equal(first.statusCode, 202);
  assert.equal(first.payload.replayed, false);
  assert.equal(replay.statusCode, 202);
  assert.equal(replay.payload.replayed, true);
  assert.equal(deliveries, 1);
  assert.deepEqual(providerKeys, [`challenge-${KEY}`]);
  assert.equal(prematureResend.statusCode, 429);
  assert.equal(prematureResend.headers['Retry-After'], '45');
  assert.equal(prematureResend.payload.code, 'IDENTITY_EMAIL_MFA_COOLDOWN');
  assert.doesNotMatch(JSON.stringify(first.payload), new RegExp(destination));
  assert.doesNotMatch(JSON.stringify(first.payload), /destinationCiphertext|destinationHash|\b\d{6}\b/);
});
