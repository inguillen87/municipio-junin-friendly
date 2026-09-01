import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ADMIN_MEMBERSHIP_BROWSER_VIEWPORTS,
  buildAdminMembershipAuthFixture,
  buildAdminMembershipBootstrapFixture,
  buildAdminMembershipBrowserFailure,
  buildAdminMembershipBrowserSummary,
  buildAdminMembershipIdentityFixture,
  buildAdminMembershipPlatformOwnersFixture,
  expectedExistingMembershipBody,
  expectedMembershipApprovalBody,
  loadAdminMembershipBrowserConfig,
  validateExistingMembershipRequest,
  validateMembershipApprovalRequest,
} from '../scripts/verify-admin-membership-governance-browser.mjs';

const source = readFileSync(new URL('../scripts/verify-admin-membership-governance-browser.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const UUID_KEY = '70000000-0000-4000-8000-000000000007';

function mutationRecord(body, overrides = {}) {
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
    body,
    ...overrides,
  };
}

test('BASE_URL acepta únicamente HTTP loopback limpio', () => {
  assert.deepEqual(loadAdminMembershipBrowserConfig({ BASE_URL: 'http://localhost:3100/' }), { baseUrl: 'http://localhost:3100' });
  assert.deepEqual(loadAdminMembershipBrowserConfig({}), { baseUrl: 'http://127.0.0.1:3100' });
  for (const invalid of [
    'https://localhost:3100',
    'http://example.com:3100',
    'http://user:unsafe@localhost:3100',
    'http://localhost:3100/admin',
    'http://localhost:3100?unsafe=x',
    'http://localhost:3100/#unsafe',
  ]) assert.throws(() => loadAdminMembershipBrowserConfig({ BASE_URL: invalid }));
});

test('matriz fija cubre desktop 1440x900 y mobile 390x844', () => {
  assert.deepEqual(ADMIN_MEMBERSHIP_BROWSER_VIEWPORTS, [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]);
});

test('auth y gobierno sintéticos exigen PLATFORM_OWNER, MFA, dos owners y tenant explícito', () => {
  const auth = buildAdminMembershipAuthFixture();
  const identity = buildAdminMembershipIdentityFixture();
  const bootstrap = buildAdminMembershipBootstrapFixture(false);
  const owners = buildAdminMembershipPlatformOwnersFixture();
  assert.equal(auth.authenticated, true);
  assert.equal(auth.user.role, 'PLATFORM_OWNER');
  assert.deepEqual(auth.access.platformRoles, ['PLATFORM_OWNER']);
  assert.equal(auth.authentication.level, 'mfa');
  assert.equal(auth.authentication.mfaVerified, true);
  assert.equal(identity.access.authorized, true);
  assert.equal(identity.access.tenant, null);
  assert.deepEqual(identity.access.platform.roles, ['PLATFORM_OWNER']);
  assert.ok(identity.access.platform.capabilities.includes('platform.tenants.manage'));
  assert.equal(identity.access.session.authLevel, 'mfa');
  assert.equal(identity.access.session.version, 2);
  assert.equal(owners.owners.length, 2);
  assert.ok(owners.owners.every((owner) => owner.active && owner.mfaEnrolled));
  assert.equal(owners.controls.makerCheckerReady, true);
  assert.equal(bootstrap.membershipGovernance.usableOwnerCount, 2);
  assert.equal(bootstrap.membershipGovernance.futureTenantAccess, false);
  assert.deepEqual(bootstrap.membershipGovernance.eligibleTenantIds, [bootstrap.tenants[0].id]);
  assert.equal(bootstrap.roles[0].key, 'TENANT_RRHH_ADMIN_OPERATIVO');
  assert.deepEqual(bootstrap.roles[0].capabilities, ['hr.employee.read']);
  assert.equal(bootstrap.membershipRequests.filter((request) => request.status === 'pending').length, 1);
  assert.equal(bootstrap.membershipRequests.filter((request) => request.status === 'expired').length, 1);
});

test('approve envía command, request, expectedVersion y UUID v4 exactos sin datos sensibles', () => {
  const body = expectedMembershipApprovalBody();
  assert.deepEqual(body, {
    command: 'approve_membership_change',
    payload: {
      requestId: '30000000-0000-4000-8000-000000000004',
      reason: 'Aprobación RRHH QA',
    },
    expectedVersion: 3,
  });
  assert.equal(validateMembershipApprovalRequest(mutationRecord(body)), true);
  assert.throws(() => validateMembershipApprovalRequest(mutationRecord(body, {
    headers: { ...mutationRecord(body).headers, authorization: 'Bearer forbidden' },
  })));
  assert.throws(() => validateMembershipApprovalRequest(mutationRecord({ ...body, expectedVersion: 4 })));
});

test('asociación usa sólo tenant elegible, rol exacto, expectedVersion cero y respuesta 202', () => {
  const body = expectedExistingMembershipBody();
  const bootstrap = buildAdminMembershipBootstrapFixture(false);
  const auth = buildAdminMembershipAuthFixture();
  const owners = buildAdminMembershipPlatformOwnersFixture();
  assert.equal(body.command, 'request_existing_membership');
  assert.equal(body.expectedVersion, 0);
  assert.equal(body.payload.tenantId, bootstrap.membershipGovernance.eligibleTenantIds[0]);
  assert.notEqual(body.payload.tenantId, bootstrap.tenants[1].id);
  assert.equal(body.payload.roleKey, 'TENANT_RRHH_ADMIN_OPERATIVO');
  assert.equal(body.payload.email, auth.user.email);
  assert.deepEqual(
    owners.owners.filter((owner) => owner.active && owner.mfaEnrolled
      && owner.email !== auth.user.email && owner.email !== body.payload.email)
      .map((owner) => owner.email),
    ['maker-owner-ui-qa@local.invalid'],
  );
  assert.equal(validateExistingMembershipRequest(mutationRecord(body)), true);
  assert.doesNotMatch(JSON.stringify(body), /password|secret|authorization|bearer|token|future/i);
});

test('verificador intercepta toda API, valida confirmación, recarga y estados responsive', () => {
  assert.match(source, /export async function startAdminMembershipBrowserServer/);
  assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/);
  assert.match(source, /const PUBLIC_ROOT = path\.resolve/);
  assert.match(source, /'cache-control': 'no-store'/);
  assert.match(source, /context\.route\('\*\*\/api\/\*\*'/);
  assert.match(source, /ADMIN_MEMBERSHIP_BROWSER_APPROVAL_RELOAD_ORDER_INVALID/);
  assert.match(source, /ADMIN_MEMBERSHIP_BROWSER_ASSOCIATION_RELOAD_ORDER_INVALID/);
  assert.match(source, /Vencida sin decisión/);
  assert.match(source, /Fundamento: \$\{APPROVAL_REASON\}/);
  assert.match(source, /ADMIN_MEMBERSHIP_BROWSER_APPROVE_PREMATURELY_ENABLED/);
  assert.match(source, /ADMIN_MEMBERSHIP_BROWSER_APPROVE_SHORT_REASON_ENABLED/);
  assert.match(source, /ADMIN_MEMBERSHIP_BROWSER_FUTURE_TENANT_RENDERED/);
  assert.match(source, /ADMIN_MEMBERSHIP_BROWSER_DOCUMENT_OVERFLOW/);
  assert.match(source, /page\.on\('pageerror'/);
  assert.match(source, /message\.type\(\) === 'error'/);
  assert.doesNotMatch(source, /DATABASE_URL|NEON_DATABASE|@neondatabase|postgresql:\/\/|new\s+(?:Client|Pool)\b|sql`/i);
});

test('package expone el verificador dedicado sin conexión a DB', () => {
  assert.equal(
    packageJson.scripts['test:browser:membership-governance'],
    'npm run build && node scripts/verify-admin-membership-governance-browser.mjs',
  );
});

test('resúmenes públicos son constantes y no contienen URL, IDs ni emails fixture', () => {
  assert.deepEqual(buildAdminMembershipBrowserSummary(), {
    ok: true,
    viewportsVerified: 2,
    apiFullyIntercepted: true,
    databaseMutations: false,
    approvalRequestsVerified: 2,
    associationRequestsVerified: 2,
    approvalStatus: 200,
    associationStatus: 202,
    browserStorageEmpty: true,
    runtimeErrors: 0,
  });
  assert.deepEqual(buildAdminMembershipBrowserFailure(), {
    ok: false,
    code: 'ADMIN_MEMBERSHIP_BROWSER_VERIFICATION_FAILED',
  });
  for (const payload of [buildAdminMembershipBrowserSummary(), buildAdminMembershipBrowserFailure()]) {
    assert.doesNotMatch(JSON.stringify(payload), /https?:|@local\.invalid|[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  }
});
