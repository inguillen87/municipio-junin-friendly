import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasManagedIdentityCookie,
  principalMatchesFriendlyDataBinding,
  requireCompatibleInternalAccess,
} from '../lib/internal-access-gateway.js';
import { IDENTITY_SESSION_COOKIE } from '../lib/internal-identity-crypto.js';

function response() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test('detecta la cookie administrada aunque su valor sea invalido o vacio', () => {
  assert.equal(hasManagedIdentityCookie({ headers: { cookie: `${IDENTITY_SESSION_COOKIE}=x` } }), true);
  assert.equal(hasManagedIdentityCookie({ headers: { cookie: `${IDENTITY_SESSION_COOKIE}=` } }), true);
  assert.equal(hasManagedIdentityCookie({ headers: { cookie: 'municontrol_internal_session=legacy' } }), false);
});

test('una sesion v2 invalida nunca degrada a la cookie legacy', async () => {
  let legacyCalls = 0;
  const res = response();
  const result = await requireCompatibleInternalAccess({
    headers: { cookie: `${IDENTITY_SESSION_COOKIE}=invalid; municontrol_internal_session=valid` },
  }, res, {
    secrets: { sessionSecret: 's'.repeat(64) },
    sql: {},
    requireManagedAccess: async (_req, managedRes) => {
      managedRes.status(401).json({ ok: false, code: 'IDENTITY_SESSION_INVALID' });
      return null;
    },
    requireLegacySession: () => { legacyCalls += 1; return { email: 'legacy@example.invalid' }; },
  });
  assert.equal(result, null);
  assert.equal(legacyCalls, 0);
  assert.equal(res.statusCode, 401);
});

test('la sesion administrada recibe capability, data-plane y SHA de release', async () => {
  let received;
  const access = await requireCompatibleInternalAccess({
    headers: { cookie: `${IDENTITY_SESSION_COOKIE}=token` },
  }, response(), {
    env: { VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) },
    secrets: { sessionSecret: 's'.repeat(64) },
    sql: { kind: 'identity' },
    requiredCapabilities: ['assistant.use'],
    requireDataPlaneReady: true,
    requireManagedAccess: async (_req, _res, options) => {
      received = options;
      return { session: { email: 'owner@example.invalid' }, principal: { authorized: true } };
    },
  });
  assert.equal(access.mode, 'managed');
  assert.deepEqual(received.requiredCapabilities, ['assistant.use']);
  assert.equal(received.requireDataPlaneReady, true);
  assert.equal(received.expectedReleaseSha, 'a'.repeat(40));
});

test('la transicion legacy es explicita y se puede cerrar por configuracion', async () => {
  const res = response();
  let legacyCalls = 0;
  const denied = await requireCompatibleInternalAccess({ headers: {} }, res, {
    env: { IDENTITY_LEGACY_SESSION_ALLOWED: 'false' },
    requireLegacySession: () => { legacyCalls += 1; return {}; },
  });
  assert.equal(denied, null);
  assert.equal(legacyCalls, 0);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'IDENTITY_SESSION_REQUIRED');

  const upgradeRes = response();
  await requireCompatibleInternalAccess({
    headers: { cookie: 'municontrol_internal_session=legacy' },
  }, upgradeRes, {
    env: { IDENTITY_LEGACY_SESSION_ALLOWED: 'false' },
  });
  assert.equal(upgradeRes.body.code, 'IDENTITY_SESSION_UPGRADE_REQUIRED');

  const allowed = await requireCompatibleInternalAccess({ headers: {} }, response(), {
    env: { IDENTITY_LEGACY_SESSION_ALLOWED: 'true' },
    requireLegacySession: () => ({ email: 'owner@example.invalid', role: 'ADMIN_INTERNO' }),
  });
  assert.equal(allowed.mode, 'legacy');
  assert.equal(allowed.session.email, 'owner@example.invalid');

  const productionRes = response();
  const productionDenied = await requireCompatibleInternalAccess({ headers: {} }, productionRes, {
    env: { VERCEL_ENV: 'production' },
    requireLegacySession: () => ({ email: 'owner@example.invalid' }),
  });
  assert.equal(productionDenied, null);
  assert.equal(productionRes.body.code, 'IDENTITY_SESSION_REQUIRED');
});

test('la fuente GRH debe pertenecer exactamente al tenant Friendly certificado', async () => {
  const expected = {
    tenantId: '4daa7815-0816-4506-b497-c7432cb1aa9f',
    system: 'GRH',
    database: 'grh_junin',
    companyId: 101,
  };
  const principal = {
    tenant: {
      id: expected.tenantId,
      sourceBindings: [{ system: 'GRH', database: 'grh_junin', companyId: 101, verified: true }],
    },
  };
  assert.equal(principalMatchesFriendlyDataBinding(principal, expected), true);
  assert.equal(principalMatchesFriendlyDataBinding({
    tenant: { ...principal.tenant, id: 'd9ac8965-8629-491a-93cb-e24978bf08a8' },
  }, expected), false);
  assert.equal(principalMatchesFriendlyDataBinding({
    tenant: { ...principal.tenant, sourceBindings: [{ system: 'GRH', database: 'grh_junin', companyId: 102, verified: true }] },
  }, expected), false);

  const res = response();
  const result = await requireCompatibleInternalAccess({
    headers: { cookie: `${IDENTITY_SESSION_COOKIE}=token` },
  }, res, {
    secrets: { sessionSecret: 's'.repeat(64) },
    sql: {},
    requireCertifiedDataBinding: true,
    expectedDataBinding: expected,
    requireManagedAccess: async () => ({
      session: { email: 'owner@example.invalid' },
      principal: {
        authorized: true,
        tenant: { ...principal.tenant, sourceBindings: [] },
      },
    }),
  });
  assert.equal(result, null);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'IDENTITY_SOURCE_BINDING_REQUIRED');
});
