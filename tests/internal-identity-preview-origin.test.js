import assert from 'node:assert/strict';
import test from 'node:test';
import { createInternalIdentityHandler } from '../api/internal-identity.js';

const PRODUCTION = 'https://municipio.example.test';
const PREVIEW = 'https://municipio-git-attendance-team.vercel.app';
const DEPLOYMENT_HOST = 'municipio-a1b2c3-team.vercel.app';

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

async function probe(env, origin, extraHeaders = {}) {
  let openedDatabase = 0;
  let sentMail = 0;
  const handler = createInternalIdentityHandler({
    env,
    getTenantIdentitySql: async () => {
      openedDatabase += 1;
      throw new Error('This probe must stop before opening a database');
    },
    mfaEmailDelivery: async () => { sentMail += 1; },
    deliverInvitation: async () => { sentMail += 1; },
  });
  const res = response();
  // Deliberately malformed JSON: even an allowed origin stops before credentials,
  // sessions, rate-limit storage, secret configuration or email delivery.
  await handler({
    method: 'POST',
    headers: { 'content-type': 'application/json', origin, 'sec-fetch-site': 'same-origin', ...extraHeaders },
    body: '{',
  }, res);
  assert.equal(openedDatabase, 0);
  assert.equal(sentMail, 0);
  assert.match(res.headers['Cache-Control'], /no-store/);
  assert.equal(res.headers['Set-Cookie'], undefined);
  return res;
}

function expectResult(res, status, code) {
  assert.equal(res.statusCode, status);
  assert.equal(res.payload.code, code);
  assert.equal(res.payload.ok, false);
}

test('preview with a production canonical origin is rejected before database or MFA', async () => {
  const res = await probe({ IDENTITY_APP_ORIGIN: PRODUCTION, VERCEL_ENV: 'preview', VERCEL_URL: DEPLOYMENT_HOST }, PREVIEW);
  expectResult(res, 403, 'IDENTITY_ORIGIN_FORBIDDEN');
});

test('production canonical origin continues to the JSON guard without account access', async () => {
  expectResult(await probe({ IDENTITY_APP_ORIGIN: PRODUCTION }, PRODUCTION), 400, 'IDENTITY_JSON_INVALID');
});

test('an explicitly configured preview origin continues to the JSON guard', async () => {
  expectResult(await probe({ IDENTITY_APP_ORIGIN: PREVIEW, VERCEL_ENV: 'preview', VERCEL_URL: DEPLOYMENT_HOST }, PREVIEW), 400, 'IDENTITY_JSON_INVALID');
});

test('INTERNAL_APP_ORIGIN fallback is explicit and also rejects another origin', async () => {
  expectResult(await probe({ INTERNAL_APP_ORIGIN: PRODUCTION }, PREVIEW), 403, 'IDENTITY_ORIGIN_FORBIDDEN');
});

test('VERCEL_URL fallback accepts only the exact deployment origin', async () => {
  expectResult(await probe({ VERCEL_URL: DEPLOYMENT_HOST }, `https://${DEPLOYMENT_HOST}`), 400, 'IDENTITY_JSON_INVALID');
});

test('branch alias is not implicitly trusted by a different VERCEL_URL', async () => {
  expectResult(await probe({ VERCEL_URL: DEPLOYMENT_HOST }, PREVIEW), 403, 'IDENTITY_ORIGIN_FORBIDDEN');
});

test('missing origin fails closed', async () => {
  expectResult(await probe({ IDENTITY_APP_ORIGIN: PRODUCTION }, ''), 403, 'IDENTITY_ORIGIN_FORBIDDEN');
});

test('cross-site requests fail even with a canonical Origin header', async () => {
  expectResult(await probe({ IDENTITY_APP_ORIGIN: PRODUCTION }, PRODUCTION, { 'sec-fetch-site': 'cross-site' }), 403, 'IDENTITY_ORIGIN_FORBIDDEN');
});

test('reflected host and forwarded host cannot authorize a preview', async () => {
  expectResult(await probe({ IDENTITY_APP_ORIGIN: PRODUCTION }, PREVIEW, { host: new URL(PREVIEW).host, 'x-forwarded-host': new URL(PREVIEW).host }), 403, 'IDENTITY_ORIGIN_FORBIDDEN');
});

test('absent origin configuration fails before database access', async () => {
  expectResult(await probe({}, PREVIEW), 503, 'IDENTITY_ORIGIN_NOT_CONFIGURED');
});
