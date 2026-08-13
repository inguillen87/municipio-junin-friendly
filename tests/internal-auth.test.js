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

test('endpoint GET lee la sesion y DELETE la cierra sin consultar DB', async (t) => {
  const previousSecret = process.env.INTERNAL_SESSION_SECRET;
  process.env.INTERNAL_SESSION_SECRET = TEST_SECRET;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.INTERNAL_SESSION_SECRET;
    else process.env.INTERNAL_SESSION_SECRET = previousSecret;
  });

  const token = issueInternalSessionToken(TEST_USER, { secret: TEST_SECRET });
  const getResponse = createMockResponse();
  await internalAuthHandler({
    method: 'GET',
    headers: { cookie: `${INTERNAL_SESSION_COOKIE}=${encodeURIComponent(token)}` },
  }, getResponse);

  assert.equal(getResponse.statusCode, 200);
  assert.equal(getResponse.payload.authenticated, true);
  assert.equal(getResponse.payload.user.email, 'admin@example.test');
  assert.equal(getResponse.payload.user.name, 'admin@example.test');

  const deleteResponse = createMockResponse();
  await internalAuthHandler({ method: 'DELETE', headers: {} }, deleteResponse);
  assert.equal(deleteResponse.statusCode, 200);
  assert.equal(deleteResponse.payload.authenticated, false);
  assert.match(deleteResponse.headers['Set-Cookie'], /Max-Age=0/);
});

test('endpoint POST conserva display_name en la sesion y GET lo recupera', async (t) => {
  const previousSecret = process.env.INTERNAL_SESSION_SECRET;
  process.env.INTERNAL_SESSION_SECRET = TEST_SECRET;
  t.after(() => {
    if (previousSecret === undefined) delete process.env.INTERNAL_SESSION_SECRET;
    else process.env.INTERNAL_SESSION_SECRET = previousSecret;
  });

  const passwordHash = await hashInternalPassword('clave sintetica');
  const handler = createInternalAuthHandler({
    async findInternalUserByEmail(email) {
      assert.equal(email, 'marcelo@example.test');
      return {
        id: email,
        email,
        display_name: 'Marcelo QA',
        password_hash: passwordHash,
        role: 'ADMIN_INTERNO',
      };
    },
  });
  const loginResponse = createMockResponse();
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { email: 'Marcelo@Example.test', password: 'clave sintetica' },
  }, loginResponse);

  assert.equal(loginResponse.statusCode, 200);
  assert.equal(loginResponse.payload.user.name, 'Marcelo QA');
  assert.match(loginResponse.headers['Set-Cookie'], new RegExp(`^${INTERNAL_SESSION_COOKIE}=`));

  const sessionResponse = createMockResponse();
  await handler({
    method: 'GET',
    headers: { cookie: loginResponse.headers['Set-Cookie'] },
  }, sessionResponse);
  assert.equal(sessionResponse.statusCode, 200);
  assert.equal(sessionResponse.payload.user.name, 'Marcelo QA');
});
