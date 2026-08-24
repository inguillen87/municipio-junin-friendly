import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  TENANT_LIFECYCLE_BROWSER_VIEWPORTS,
  buildTenantLifecycleAuthFixture,
  buildTenantLifecycleBootstrapFixture,
  buildTenantLifecycleBrowserFailure,
  buildTenantLifecycleBrowserSummary,
  buildTenantLifecycleUsersFixture,
  expectedTenantLifecycleRevokeBody,
  loadTenantLifecycleBrowserConfig,
  validateTenantLifecycleRevokeRequest,
} from '../scripts/verify-tenant-lifecycle-browser.mjs';

const verifierUrl = new URL('../scripts/verify-tenant-lifecycle-browser.mjs', import.meta.url);
const source = readFileSync(verifierUrl, 'utf8');
const UUID_KEY = '70000000-0000-4000-8000-000000000007';

function validRequest(overrides = {}) {
  return {
    method: 'POST',
    pathname: '/api/internal-admin',
    search: '',
    resourceType: 'fetch',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'idempotency-key': UUID_KEY,
    },
    body: expectedTenantLifecycleRevokeBody(),
    ...overrides,
  };
}

test('gate BASE_URL acepta sólo HTTP loopback sin credenciales, path, query ni hash', () => {
  assert.deepEqual(loadTenantLifecycleBrowserConfig({ BASE_URL: 'http://localhost:3100/' }), {
    baseUrl: 'http://localhost:3100',
  });
  assert.deepEqual(loadTenantLifecycleBrowserConfig({}), {
    baseUrl: 'http://127.0.0.1:3100',
  });
  for (const invalid of [
    'https://localhost:3100',
    'http://example.com:3100',
    'http://user:secret@localhost:3100',
    'http://localhost:3100/admin',
    'http://localhost:3100?email=qa@local.invalid',
    'http://localhost:3100/#token',
  ]) {
    assert.throws(() => loadTenantLifecycleBrowserConfig({ BASE_URL: invalid }));
  }
});

test('matriz fija cubre exactamente desktop 1440x900 y mobile 390x844', () => {
  assert.deepEqual(TENANT_LIFECYCLE_BROWSER_VIEWPORTS, [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]);
});

test('auth fixture representa sesión v2 PLATFORM_OWNER con MFA verificado', () => {
  const auth = buildTenantLifecycleAuthFixture();
  assert.equal(auth.authenticated, true);
  assert.equal(auth.sessionVersion, 2);
  assert.equal(auth.user.role, 'PLATFORM_OWNER');
  assert.deepEqual(auth.access.platformRoles, ['PLATFORM_OWNER']);
  assert.equal(auth.access.context, 'platform');
  assert.equal(auth.authentication.level, 'mfa');
  assert.equal(auth.authentication.mfaVerified, true);
});

test('bootstrap v3 publica tenant exacto, revoke únicamente y data plane cerrado', () => {
  const platform = buildTenantLifecycleBootstrapFixture(false);
  const tenant = buildTenantLifecycleBootstrapFixture(true);
  assert.equal(tenant.contractVersion, 3);
  assert.equal(platform.context.mode, 'platform');
  assert.equal(tenant.context.mode, 'tenant');
  assert.equal(tenant.context.tenantId, tenant.tenants[0].id);
  assert.deepEqual(tenant.allowedCommands, ['revoke_employment_link']);
  assert.deepEqual(tenant.controls, {
    sodReady: true,
    auditReady: true,
    tenantDataPlaneReady: false,
    invitationGatewayReady: false,
  });
  assert.deepEqual(tenant.operationalCatalog, {
    sourceBindings: [],
    scopeCapabilities: [],
    organizations: [],
    sectors: [],
    reasonCodes: [],
  });
});

test('usuario contractual es suspended + stale y authorityVersion vive en operationalAccess', () => {
  const user = buildTenantLifecycleUsersFixture().users[0];
  assert.equal(user.membership.status, 'suspended');
  assert.equal(user.employmentLink.status, 'stale');
  assert.equal(user.operationalAccess.version, 7);
  assert.notEqual(user.membership.version, user.operationalAccess.version);
  assert.notEqual(user.employmentLink.version, user.operationalAccess.version);
  assert.deepEqual(user.operationalAccess.scopes, []);
  assert.match(user.email, /@local\.invalid$/);
  assert.match(user.employmentLink.displayName, /^PII_SENTINEL_/);
});

test('POST revoke exige body exacto, versión de autoridad y UUID v4 sin Authorization', () => {
  assert.equal(validateTenantLifecycleRevokeRequest(validRequest()), true);
  assert.throws(() => validateTenantLifecycleRevokeRequest(validRequest({
    body: { ...expectedTenantLifecycleRevokeBody(), expectedVersion: 99 },
  })));
  assert.throws(() => validateTenantLifecycleRevokeRequest(validRequest({
    headers: { ...validRequest().headers, 'idempotency-key': 'not-a-uuid' },
  })));
  assert.throws(() => validateTenantLifecycleRevokeRequest(validRequest({
    headers: { ...validRequest().headers, authorization: 'Bearer forbidden' },
  })));
});

test('salidas públicas son constantes y no contienen URL, IDs, hashes ni PII fixture', () => {
  for (const payload of [buildTenantLifecycleBrowserSummary(), buildTenantLifecycleBrowserFailure()]) {
    const serialized = JSON.stringify(payload);
    assert.doesNotMatch(serialized, /https?:|@local\.invalid|PII_SENTINEL|[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    assert.doesNotMatch(serialized, /sha|hash|secret|password/i);
  }
});

test('verifier dedicado intercepta toda API y no reutiliza el multipágina legacy ni una DB', () => {
  assert.match(source, /context\.route\('\*\*\/api\/\*\*'/);
  assert.match(source, /\/api\/internal-auth/);
  assert.match(source, /\/api\/internal-admin/);
  assert.match(source, /\/api\/internal-identity/);
  assert.match(source, /\/administracion-plataforma\.html/);
  assert.match(source, /Filtro administrativo aplicado\. La sesión operativa no cambió\./);
  assert.doesNotMatch(source, /verify-friendly-browser|DATABASE_URL|@neondatabase|postgresql:\/\//i);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
});

test('verifier comprueba PII stale, overflow, errores runtime y storage efímero', () => {
  assert.match(source, /TENANT_LIFECYCLE_BROWSER_STALE_PII_RENDERED/);
  assert.match(source, /TENANT_LIFECYCLE_BROWSER_DOCUMENT_OVERFLOW/);
  assert.match(source, /TENANT_LIFECYCLE_BROWSER_DIALOG_OVERFLOW/);
  assert.match(source, /page\.on\('pageerror'/);
  assert.match(source, /message\.type\(\) === 'error'/);
  assert.match(source, /window\.localStorage/);
  assert.match(source, /window\.sessionStorage/);
  assert.match(source, /window\.indexedDB\.databases/);
  assert.match(source, /window\.caches\.keys/);
});
