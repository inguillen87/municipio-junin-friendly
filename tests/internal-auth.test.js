import assert from 'node:assert/strict';
import test from 'node:test';

import internalAuthHandler, { createInternalAuthHandler } from '../api/internal-auth.js';
import {
  hashInternalPassword,
  parseInternalPasswordHash,
  verifyInternalPassword,
} from '../lib/internal-password.js';
import {
  INTERNAL_SESSION_COOKIE,
  INTERNAL_SESSION_TTL_SECONDS,
  clearInternalSessionCookie,
  getInternalSession,
  issueInternalSessionToken,
  parseCookieHeader,
  requireInternalSession,
  serializeClearedInternalSessionCookie,
  serializeInternalSessionCookie,
  verifyInternalSessionToken,
} from '../lib/internal-session.js';
import {
  IDENTITY_SESSION_COOKIE,
  issueIdentitySessionToken,
} from '../lib/internal-identity-crypto.js';

const TEST_SECRET = 'unit-test-only-internal-session-secret';
const TEST_NOW = 1_700_000_000_000;
const TEST_USER = { id: 'user-123', email: 'Admin@Example.test', role: 'INTERNAL_ADMIN' };

function createMockResponse() {
  return {
    headers: {},
    statusCode: 200,
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test('scrypt genera un formato versionado y verifica sin acceder a DB', async () => {
  const salt = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const encoded = await hashInternalPassword('una clave de prueba', { salt });
  const parsed = parseInternalPasswordHash(encoded);

  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(parsed?.salt.toString('hex'), salt.toString('hex'));
  assert.equal(await verifyInternalPassword('una clave de prueba', encoded), true);
  assert.equal(await verifyInternalPassword('clave incorrecta', encoded), false);
  assert.equal(await verifyInternalPassword('una clave de prueba', 'hash-malformado'), false);
});

test('token HMAC conserva identidad, expira a las 12 horas y detecta alteraciones', () => {
  const token = issueInternalSessionToken(TEST_USER, { secret: TEST_SECRET, now: TEST_NOW });
  const session = verifyInternalSessionToken(token, { secret: TEST_SECRET, now: TEST_NOW + 1000 });

  assert.deepEqual(session, {
    id: 'user-123',
    email: 'admin@example.test',
    role: 'INTERNAL_ADMIN',
    issuedAt: Math.floor(TEST_NOW / 1000),
    expiresAt: Math.floor(TEST_NOW / 1000) + INTERNAL_SESSION_TTL_SECONDS,
  });

  const [version, payload, signature] = token.split('.');
  const replacement = payload.endsWith('A') ? 'B' : 'A';
  const tampered = `${version}.${payload.slice(0, -1)}${replacement}.${signature}`;
  assert.equal(verifyInternalSessionToken(tampered, { secret: TEST_SECRET, now: TEST_NOW }), null);
  assert.equal(verifyInternalSessionToken(token, { secret: 'otro-secreto', now: TEST_NOW }), null);
  assert.equal(verifyInternalSessionToken(token, {
    secret: TEST_SECRET,
    now: TEST_NOW + (INTERNAL_SESSION_TTL_SECONDS * 1000),
  }), null);
});

test('token conserva un nombre opcional sin invalidar identidades anteriores', () => {
  const namedToken = issueInternalSessionToken(
    { ...TEST_USER, displayName: 'Administracion municipal' },
    { secret: TEST_SECRET, now: TEST_NOW },
  );
  assert.equal(
    verifyInternalSessionToken(namedToken, { secret: TEST_SECRET, now: TEST_NOW })?.name,
    'Administracion municipal',
  );

  const legacyToken = issueInternalSessionToken(TEST_USER, { secret: TEST_SECRET, now: TEST_NOW });
  assert.equal(
    Object.hasOwn(verifyInternalSessionToken(legacyToken, { secret: TEST_SECRET, now: TEST_NOW }), 'name'),
    false,
  );
});

test('cookie de sesion es HttpOnly, SameSite=Lax, dura 12h y puede limpiarse', () => {
  const token = issueInternalSessionToken(TEST_USER, { secret: TEST_SECRET, now: TEST_NOW });
  const cookie = serializeInternalSessionCookie(token, { secure: true });

  assert.match(cookie, new RegExp(`^${INTERNAL_SESSION_COOKIE}=`));
  assert.match(cookie, /Path=\//);
  assert.match(cookie, new RegExp(`Max-Age=${INTERNAL_SESSION_TTL_SECONDS}`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.equal(parseCookieHeader(cookie)[INTERNAL_SESSION_COOKIE], token);

  const cleared = serializeClearedInternalSessionCookie({ secure: true });
  assert.match(cleared, /Max-Age=0/);
  assert.match(cleared, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
});

test('cookie automatica funciona en vercel dev y sigue segura en preview/produccion', (t) => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  process.env.NODE_ENV = 'development';
  process.env.VERCEL = '1';
  process.env.VERCEL_ENV = 'development';
  assert.doesNotMatch(serializeInternalSessionCookie('token-local'), /; Secure(?:;|$)/);

  process.env.VERCEL_ENV = 'preview';
  assert.match(serializeInternalSessionCookie('token-preview'), /; Secure(?:;|$)/);

  process.env.VERCEL_ENV = 'production';
  assert.match(serializeInternalSessionCookie('token-production'), /; Secure(?:;|$)/);
});

test('get/requireInternalSession reutiliza la cookie y falla cerrado', () => {
  const token = issueInternalSessionToken(TEST_USER, { secret: TEST_SECRET, now: TEST_NOW });
  const req = { headers: { cookie: `${INTERNAL_SESSION_COOKIE}=${encodeURIComponent(token)}` } };
  assert.equal(getInternalSession(req, { secret: TEST_SECRET, now: TEST_NOW })?.id, 'user-123');

  const headers = {};
  const res = {
    statusCode: 200,
    payload: null,
    setHeader(name, value) { headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
  assert.equal(requireInternalSession({ headers: {} }, res, { secret: TEST_SECRET, now: TEST_NOW }), null);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, 'INTERNAL_SESSION_REQUIRED');

  clearInternalSessionCookie(res, { secure: false });
  assert.match(headers['Set-Cookie'], /Max-Age=0/);
});

test('endpoint GET obliga migrar la sesion legacy y DELETE limpia ambas cookies', async () => {
  const handler = createInternalAuthHandler({
    env: { IDENTITY_LEGACY_SESSION_ALLOWED: 'false' },
  });
  const token = issueInternalSessionToken(TEST_USER, { secret: TEST_SECRET });
  const getResponse = createMockResponse();
  await handler({
    method: 'GET',
    headers: { cookie: `${INTERNAL_SESSION_COOKIE}=${encodeURIComponent(token)}` },
  }, getResponse);

  assert.equal(getResponse.statusCode, 401);
  assert.equal(getResponse.payload.code, 'IDENTITY_SESSION_UPGRADE_REQUIRED');

  const deleteResponse = createMockResponse();
  await handler({ method: 'DELETE', headers: {} }, deleteResponse);
  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(deleteResponse.payload.authenticated, false);
  assert.equal(Array.isArray(deleteResponse.headers['Set-Cookie']), true);
  assert.equal(deleteResponse.headers['Set-Cookie'].length, 2);
  assert.ok(deleteResponse.headers['Set-Cookie'].every((value) => /Max-Age=0/.test(value)));
});

test('endpoint GET reconoce v2 y DELETE confirma revocacion antes de limpiar', async () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const token = issueIdentitySessionToken({
    id: sessionId,
    email: 'marcelo@example.test',
    version: 2,
    identityVersion: 3,
  }, { secret: TEST_SECRET });
  let revoked = null;
  const handler = createInternalAuthHandler({
    env: { IDENTITY_APP_ORIGIN: 'https://friendly.example.test' },
    identitySecrets: () => ({ sessionSecret: TEST_SECRET }),
    getTenantIdentitySql: async () => ({ kind: 'runtime' }),
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      assert.equal(options.allowLegacy, false);
      return {
        mode: 'managed',
        session: {
          id: sessionId,
          email: 'marcelo@example.test',
          version: 2,
          identityVersion: 3,
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        },
        principal: {
          user: { email: 'marcelo@example.test', name: 'Marcelo QA' },
          platform: {
            roles: ['PLATFORM_OWNER'],
            capabilities: ['platform.users.manage', 'platform.tenants.manage'],
          },
          tenant: null,
        },
      };
    },
    revokeIdentitySessionForLogout: async (value) => { revoked = value; return { revoked: true }; },
    randomUUID: () => '22222222-2222-4222-8222-222222222222',
  });

  const getResponse = createMockResponse();
  await handler({
    method: 'GET',
    headers: { cookie: `${IDENTITY_SESSION_COOKIE}=${encodeURIComponent(token)}` },
  }, getResponse);
  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.payload.sessionVersion, 2);
  assert.equal(getResponse.payload.user.name, 'Marcelo QA');
  assert.equal(getResponse.payload.user.role, 'PLATFORM_OWNER');
  assert.deepEqual(getResponse.payload.access.platformCapabilities, [
    'platform.tenants.manage', 'platform.users.manage',
  ]);
  assert.deepEqual(getResponse.payload.access.tenantCapabilities, []);

  const logoutResponse = createMockResponse();
  await handler({
    method: 'DELETE',
    headers: {
      cookie: `${IDENTITY_SESSION_COOKIE}=${encodeURIComponent(token)}`,
      origin: 'https://friendly.example.test',
    },
  }, logoutResponse);
  assert.equal(logoutResponse.statusCode, 200);
  assert.equal(revoked.session.id, sessionId);
  assert.equal(revoked.idempotencyKey, '22222222-2222-4222-8222-222222222222');
  assert.equal(logoutResponse.headers['Set-Cookie'].length, 2);
});

test('logout rechaza otro origen, limpia cookies y no intenta revocar', async () => {
  let revocations = 0;
  const handler = createInternalAuthHandler({
    env: { VERCEL_ENV: 'production', IDENTITY_APP_ORIGIN: 'https://friendly.example.test' },
    revokeIdentitySessionForLogout: async () => { revocations += 1; },
  });
  const res = createMockResponse();
  await handler({ method: 'DELETE', headers: { origin: 'https://evil.example' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'IDENTITY_ORIGIN_FORBIDDEN');
  assert.equal(revocations, 0);
  assert.equal(res.headers['Set-Cookie'].length, 2);
});

test('logout limpia el navegador aunque la revocacion server-side no pueda confirmarse', async () => {
  const sessionId = '11111111-1111-4111-8111-111111111111';
  const token = issueIdentitySessionToken({
    id: sessionId, email: 'marcelo@example.test', version: 2, identityVersion: 3,
  }, { secret: TEST_SECRET });
  const handler = createInternalAuthHandler({
    env: { IDENTITY_APP_ORIGIN: 'https://friendly.example.test' },
    identitySecrets: () => ({ sessionSecret: TEST_SECRET }),
    getTenantIdentitySql: async () => ({}),
    revokeIdentitySessionForLogout: async () => { throw new Error('database unavailable'); },
    logger: { error() {} },
  });
  const res = createMockResponse();
  await handler({
    method: 'DELETE',
    headers: {
      origin: 'https://friendly.example.test',
      cookie: `${IDENTITY_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    },
  }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'IDENTITY_LOGOUT_UNAVAILABLE');
  assert.equal(res.headers['Set-Cookie'].length, 2);
  assert.ok(res.headers['Set-Cookie'].every((value) => /Max-Age=0/.test(value)));
});

test('endpoint POST legacy no emite cookies y dirige al login seguro', async () => {
  const response = createMockResponse();
  await createInternalAuthHandler()({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { email: 'marcelo@example.test', password: 'no-se-procesa' },
  }, response);
  assert.equal(response.statusCode, 410);
  assert.equal(response.payload.code, 'IDENTITY_LOGIN_REQUIRED');
  assert.equal(response.headers['Set-Cookie'], undefined);
});
