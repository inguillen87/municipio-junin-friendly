import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

export const TENANT_LIFECYCLE_BROWSER_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1440, height: 900 }),
  Object.freeze({ name: 'mobile', width: 390, height: 844 }),
]);

const PAGE_PATH = '/administracion-plataforma.html';
const AUTH_PATH = '/api/internal-auth';
const ADMIN_PATH = '/api/internal-admin';
const IDENTITY_PATH = '/api/internal-identity';
const REVOKE_REASON = 'Baja laboral QA';
const AUTHORITY_VERSION = 7;
const PII_SENTINEL = 'PII_SENTINEL_MUST_NOT_RENDER';
const FIXTURE = Object.freeze({
  sessionId: '10000000-0000-4000-8000-000000000001',
  tenantId: '20000000-0000-4000-8000-000000000002',
  userId: '30000000-0000-4000-8000-000000000003',
  membershipId: '40000000-0000-4000-8000-000000000004',
  contractId: '50000000-0000-4000-8000-000000000005',
  bindingId: '60000000-0000-4000-8000-000000000006',
  ownerEmail: 'platform-owner-ui-qa@local.invalid',
});
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanBaseUrl(rawValue) {
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error('TENANT_LIFECYCLE_BROWSER_BASE_URL_INVALID');
  }
  const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
  assert.equal(parsed.protocol, 'http:', 'TENANT_LIFECYCLE_BROWSER_REQUIRES_LOCAL_HTTP');
  assert.ok(loopback.has(parsed.hostname.toLowerCase()), 'TENANT_LIFECYCLE_BROWSER_REQUIRES_LOOPBACK');
  assert.equal(parsed.username, '', 'TENANT_LIFECYCLE_BROWSER_URL_CREDENTIALS_FORBIDDEN');
  assert.equal(parsed.password, '', 'TENANT_LIFECYCLE_BROWSER_URL_CREDENTIALS_FORBIDDEN');
  assert.ok(parsed.pathname === '/' || parsed.pathname === '', 'TENANT_LIFECYCLE_BROWSER_URL_PATH_FORBIDDEN');
  assert.equal(parsed.search, '', 'TENANT_LIFECYCLE_BROWSER_URL_QUERY_FORBIDDEN');
  assert.equal(parsed.hash, '', 'TENANT_LIFECYCLE_BROWSER_URL_HASH_FORBIDDEN');
  return parsed.origin;
}

export function loadTenantLifecycleBrowserConfig(env = process.env) {
  return Object.freeze({
    baseUrl: cleanBaseUrl(env.BASE_URL || 'http://127.0.0.1:3100'),
  });
}

export function buildTenantLifecycleAuthFixture() {
  return {
    ok: true,
    authenticated: true,
    sessionVersion: 2,
    user: {
      id: FIXTURE.sessionId,
      email: FIXTURE.ownerEmail,
      name: 'Platform Owner UI QA',
      role: 'PLATFORM_OWNER',
    },
    access: {
      context: 'platform',
      tenant: null,
      platformRoles: ['PLATFORM_OWNER'],
    },
    authentication: {
      level: 'mfa',
      mfaVerified: true,
    },
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

function tenantFixture() {
  return {
    id: FIXTURE.tenantId,
    slug: 'tenant-lifecycle-ui-qa',
    legalName: 'Municipio QA contractual',
    shortName: 'Municipio QA contractual',
    kind: 'municipality',
    jurisdiction: 'QA local',
    status: 'active',
  };
}

export function buildTenantLifecycleBootstrapFixture(tenantMode = false) {
  return {
    ok: true,
    contractVersion: 3,
    user: {
      id: FIXTURE.sessionId,
      email: FIXTURE.ownerEmail,
      displayName: 'Platform Owner UI QA',
      platformRole: 'PLATFORM_OWNER',
    },
    context: tenantMode
      ? {
          mode: 'tenant',
          tenantId: FIXTURE.tenantId,
          label: 'Municipio QA contractual',
          environment: 'local',
          tenantAwareGateway: true,
        }
      : {
          mode: 'platform',
          tenantId: '',
          label: 'Plataforma QA local',
          environment: 'local',
          tenantAwareGateway: true,
        },
    tenants: [tenantFixture()],
    roles: [
      {
        key: 'JUNIN_RRHH_OPERADOR',
        label: 'Operador RRHH',
        scopeKind: 'tenant',
        capabilities: [],
      },
    ],
    allowedCommands: ['revoke_employment_link'],
    controls: {
      sodReady: true,
      auditReady: true,
      tenantDataPlaneReady: false,
      invitationGatewayReady: false,
    },
    operationalCatalog: {
      sourceBindings: [],
      scopeCapabilities: [],
      organizations: [],
      sectors: [],
      reasonCodes: [],
    },
    metrics: {
      tenants: 1,
      attention: 1,
      overdueAccessReviews: 0,
      securityAlerts: 0,
    },
    source: {
      label: 'Control contractual local',
      cutoff: '2099-01-01T00:00:00.000Z',
    },
  };
}

export function buildTenantLifecycleUsersFixture() {
  return {
    ok: true,
    contractVersion: 3,
    users: [
      {
        id: FIXTURE.userId,
        email: 'suspended-member-ui-qa@local.invalid',
        displayName: 'Membresía QA suspendida',
        membership: {
          id: FIXTURE.membershipId,
          tenantId: FIXTURE.tenantId,
          tenantName: 'Municipio QA contractual',
          status: 'suspended',
          roleKey: 'JUNIN_RRHH_OPERADOR',
          roleLabel: 'Operador RRHH',
          version: 99,
        },
        security: {
          mfaEnabled: true,
        },
        capabilities: [],
        employmentLink: {
          status: 'stale',
          version: 88,
          employmentContractId: FIXTURE.contractId,
          sourceBindingId: FIXTURE.bindingId,
          displayName: PII_SENTINEL,
          legajo: PII_SENTINEL,
          organizationLabel: PII_SENTINEL,
          sectorLabel: PII_SENTINEL,
        },
        operationalAccess: {
          version: AUTHORITY_VERSION,
          scopes: [],
        },
        invitation: {
          status: 'not_applicable',
          delivery: { status: 'not_issued' },
        },
      },
    ],
    source: {
      label: 'Control contractual local',
      cutoff: '2099-01-01T00:00:00.000Z',
    },
  };
}

export function expectedTenantLifecycleRevokeBody() {
  return {
    command: 'revoke_employment_link',
    payload: {
      membershipId: FIXTURE.membershipId,
      reasonCode: 'offboarding',
      reason: REVOKE_REASON,
    },
    expectedVersion: AUTHORITY_VERSION,
  };
}

export function validateTenantLifecycleRevokeRequest(requestRecord) {
  assert.equal(requestRecord.method, 'POST', 'TENANT_LIFECYCLE_REVOKE_METHOD_INVALID');
  assert.equal(requestRecord.pathname, ADMIN_PATH, 'TENANT_LIFECYCLE_REVOKE_PATH_INVALID');
  assert.equal(requestRecord.search, '', 'TENANT_LIFECYCLE_REVOKE_QUERY_FORBIDDEN');
  assert.equal(requestRecord.resourceType, 'fetch', 'TENANT_LIFECYCLE_REVOKE_NOT_FETCH');
  assert.deepEqual(requestRecord.body, expectedTenantLifecycleRevokeBody(), 'TENANT_LIFECYCLE_REVOKE_BODY_INVALID');
  assert.equal(requestRecord.headers.accept, 'application/json', 'TENANT_LIFECYCLE_REVOKE_ACCEPT_INVALID');
  assert.match(requestRecord.headers['content-type'] || '', /^application\/json(?:;|$)/i, 'TENANT_LIFECYCLE_REVOKE_CONTENT_TYPE_INVALID');
  assert.match(requestRecord.headers['idempotency-key'] || '', UUID_V4, 'TENANT_LIFECYCLE_REVOKE_KEY_INVALID');
  assert.equal(requestRecord.headers.authorization, undefined, 'TENANT_LIFECYCLE_REVOKE_AUTH_HEADER_FORBIDDEN');
  return true;
}

function jsonResponse(payload) {
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    body: JSON.stringify(payload),
  };
}

function hasOnlyExpectedQuery(url, resource, allowTenant) {
  const keys = [...url.searchParams.keys()];
  if (!keys.includes('resource') || url.searchParams.get('resource') !== resource) return false;
  if (keys.some((key) => key !== 'resource' && key !== 'tenantId')) return false;
  const tenantId = url.searchParams.get('tenantId');
  if (tenantId && (!allowTenant || tenantId !== FIXTURE.tenantId)) return false;
  return true;
}

function requestRecord(request) {
  const url = new URL(request.url());
  let body = null;
  try {
    body = request.postDataJSON();
  } catch {
    body = null;
  }
  return {
    method: request.method(),
    pathname: url.pathname,
    search: url.search,
    resourceType: request.resourceType(),
    headers: request.headers(),
    body,
  };
}

function routeApiRequest(route, evidence) {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();

  if (url.pathname === AUTH_PATH && method === 'GET' && url.search === '') {
    evidence.authGets += 1;
    return route.fulfill(jsonResponse(buildTenantLifecycleAuthFixture()));
  }

  if (url.pathname === IDENTITY_PATH && method === 'GET'
      && hasOnlyExpectedQuery(url, 'invitations', false)) {
    evidence.identityGets += 1;
    return route.fulfill(jsonResponse({ ok: true, allowedCommands: [], invitations: [] }));
  }

  if (url.pathname === ADMIN_PATH && method === 'GET') {
    const resource = url.searchParams.get('resource');
    const tenantId = url.searchParams.get('tenantId') || '';
    if (resource === 'bootstrap' && hasOnlyExpectedQuery(url, resource, true)) {
      if (tenantId === FIXTURE.tenantId) evidence.tenantBootstrapGets += 1;
      else if (!tenantId) evidence.platformBootstrapGets += 1;
      else evidence.unexpectedApiRequests += 1;
      return route.fulfill(jsonResponse(buildTenantLifecycleBootstrapFixture(Boolean(tenantId))));
    }
    if (resource === 'users' && hasOnlyExpectedQuery(url, resource, true)) {
      evidence.userGets += 1;
      return route.fulfill(jsonResponse(buildTenantLifecycleUsersFixture()));
    }
    if (resource === 'audit' && hasOnlyExpectedQuery(url, resource, true)) {
      evidence.auditGets += 1;
      return route.fulfill(jsonResponse({ ok: true, events: [] }));
    }
  }

  if (url.pathname === ADMIN_PATH && method === 'POST' && url.search === '') {
    evidence.revokeRequests.push(requestRecord(request));
    return route.fulfill(jsonResponse({ ok: true }));
  }

  evidence.unexpectedApiRequests += 1;
  return route.fulfill({
    status: 418,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ ok: false, code: 'TENANT_LIFECYCLE_BROWSER_API_BLOCKED' }),
  });
}

async function assertStorageEmpty(page) {
  const storage = await page.evaluate(async () => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
    cookies: document.cookie,
    caches: 'caches' in window ? await window.caches.keys() : [],
    indexedDb: 'databases' in window.indexedDB
      ? (await window.indexedDB.databases()).map((database) => database.name || '')
      : [],
  }));
  assert.deepEqual(storage, { local: [], session: [], cookies: '', caches: [], indexedDb: [] }, 'TENANT_LIFECYCLE_BROWSER_STORAGE_NOT_EMPTY');
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    dialog: (() => {
      const node = document.querySelector('#userDetailDialog');
      return node && node.open ? { client: node.clientWidth, scroll: node.scrollWidth } : null;
    })(),
  }));
  assert.ok(overflow.documentWidth <= overflow.viewport + 1, 'TENANT_LIFECYCLE_BROWSER_DOCUMENT_OVERFLOW');
  assert.ok(overflow.bodyWidth <= overflow.viewport + 1, 'TENANT_LIFECYCLE_BROWSER_BODY_OVERFLOW');
  if (overflow.dialog) {
    assert.ok(overflow.dialog.scroll <= overflow.dialog.client + 1, 'TENANT_LIFECYCLE_BROWSER_DIALOG_OVERFLOW');
  }
}

function assertCleanPageUrl(actualUrl, baseUrl) {
  const url = new URL(actualUrl);
  assert.equal(url.origin, baseUrl, 'TENANT_LIFECYCLE_BROWSER_PAGE_ORIGIN_CHANGED');
  assert.equal(url.pathname, PAGE_PATH, 'TENANT_LIFECYCLE_BROWSER_PAGE_PATH_CHANGED');
  assert.equal(url.search, '', 'TENANT_LIFECYCLE_BROWSER_PAGE_QUERY_FORBIDDEN');
  assert.equal(url.hash, '', 'TENANT_LIFECYCLE_BROWSER_PAGE_HASH_FORBIDDEN');
  const normalized = actualUrl.toLowerCase();
  [PII_SENTINEL, FIXTURE.ownerEmail, FIXTURE.userId, FIXTURE.membershipId, FIXTURE.tenantId]
    .forEach((fragment) => assert.equal(normalized.includes(fragment.toLowerCase()), false, 'TENANT_LIFECYCLE_BROWSER_URL_FIXTURE_DATA_FORBIDDEN'));
}

async function openTenantAccess(page, viewport) {
  await page.locator('#tenantSwitcher').click();
  await page.locator('#tenantSwitcherDialog').waitFor({ state: 'visible' });
  const tenantBootstrap = page.waitForResponse((response) => {
    const request = response.request();
    const url = new URL(response.url());
    return response.ok()
      && request.method() === 'GET'
      && url.pathname === ADMIN_PATH
      && url.searchParams.get('resource') === 'bootstrap'
      && url.searchParams.get('tenantId') === FIXTURE.tenantId;
  });
  await page.locator(`[data-tenant-option="${FIXTURE.tenantId}"]`).click();
  await tenantBootstrap;
  await page.locator('#tenantSwitcherDialog').waitFor({ state: 'hidden' });
  await page.locator('#toastRegion').getByText('Ámbito cambiado y autorización actualizada.').waitFor({ state: 'visible' });

  if (viewport.width <= 820) {
    await page.locator('#menuButton').click();
  }
  const accessNavigation = page.locator('[data-admin-view="access"]');
  await accessNavigation.waitFor({ state: 'visible' });
  await accessNavigation.click();
  await page.locator('#accessView').waitFor({ state: 'visible' });
  await page.locator(`button[data-open-user="${FIXTURE.userId}"]`).waitFor({ state: 'visible' });
}

async function verifyViewport(browser, config, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const browserErrors = [];
  const evidence = {
    authGets: 0,
    platformBootstrapGets: 0,
    tenantBootstrapGets: 0,
    userGets: 0,
    auditGets: 0,
    identityGets: 0,
    unexpectedApiRequests: 0,
    revokeRequests: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push('console');
  });
  page.on('pageerror', () => browserErrors.push('pageerror'));
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === config.baseUrl) browserErrors.push('requestfailed');
  });
  page.on('response', (response) => {
    if (new URL(response.url()).origin === config.baseUrl && response.status() >= 400) browserErrors.push('http');
  });

  await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  await context.route('**/api/**', (route) => routeApiRequest(route, evidence));

  try {
    await page.goto(`${config.baseUrl}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#platformAdminShell').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#authGate').isHidden(), true, 'TENANT_LIFECYCLE_BROWSER_AUTH_GATE_VISIBLE');
    assert.equal(await page.locator('#portfolioTitle').innerText(), 'Cartera de gobiernos', 'TENANT_LIFECYCLE_BROWSER_CONTENT_MISSING');
    assert.equal((await page.locator('body').innerText()).includes(PII_SENTINEL), false, 'TENANT_LIFECYCLE_BROWSER_STALE_PII_RENDERED');
    await assertNoHorizontalOverflow(page);
    await assertStorageEmpty(page);
    assertCleanPageUrl(page.url(), config.baseUrl);

    await openTenantAccess(page, viewport);
    await page.locator(`button[data-open-user="${FIXTURE.userId}"]`).click();
    await page.locator('#userDetailDialog').waitFor({ state: 'visible' });

    assert.equal(await page.locator('#employmentLinkState').innerText(), 'Revisión requerida');
    assert.match(await page.locator('#employmentLinkSummary').innerText(), /El vínculo informado no es utilizable/);
    const revokeGateText = (await page.locator('#employmentOperationGate').innerText()).replace(/\s+/g, ' ');
    assert.match(revokeGateText, /La membresía no opera.+revocar el vínculo activo.+no reactiva accesos/i);
    assert.equal((await page.locator('body').innerText()).includes(PII_SENTINEL), false, 'TENANT_LIFECYCLE_BROWSER_STALE_PII_RENDERED');

    assert.equal(await page.locator('#employmentLookupQuery').isDisabled(), true, 'TENANT_LIFECYCLE_BROWSER_LOOKUP_INPUT_OPEN');
    assert.equal(await page.locator('#employmentLookupButton').isDisabled(), true, 'TENANT_LIFECYCLE_BROWSER_LOOKUP_OPEN');
    assert.equal(await page.locator('#linkEmploymentButton').isDisabled(), true, 'TENANT_LIFECYCLE_BROWSER_LINK_OPEN');
    assert.equal(await page.locator('#saveScopesButton').isDisabled(), true, 'TENANT_LIFECYCLE_BROWSER_REPLACE_OPEN');
    assert.equal(await page.locator('#revokeEmploymentButton').isDisabled(), true, 'TENANT_LIFECYCLE_BROWSER_REVOKE_PREMATURELY_OPEN');

    await page.locator('#employmentReasonCode').selectOption('offboarding');
    await page.locator('#employmentReason').fill(REVOKE_REASON);
    await page.locator('#revokeEmploymentButton:not([disabled])').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#employmentLookupButton').isDisabled(), true, 'TENANT_LIFECYCLE_BROWSER_LOOKUP_REOPENED');
    assert.equal(await page.locator('#linkEmploymentButton').isDisabled(), true, 'TENANT_LIFECYCLE_BROWSER_LINK_REOPENED');
    assert.equal(await page.locator('#saveScopesButton').isDisabled(), true, 'TENANT_LIFECYCLE_BROWSER_REPLACE_REOPENED');
    await assertNoHorizontalOverflow(page);

    let confirmationSeen = false;
    page.once('dialog', async (dialog) => {
      confirmationSeen = dialog.type() === 'confirm';
      await dialog.accept();
    });
    const postRequest = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return request.method() === 'POST' && url.pathname === ADMIN_PATH;
    });
    await page.locator('#revokeEmploymentButton').click();
    await postRequest;
    await page.locator('#toastRegion').getByText('Vínculo laboral revocado.').waitFor({ state: 'visible' });
    assert.equal(confirmationSeen, true, 'TENANT_LIFECYCLE_BROWSER_CONFIRMATION_MISSING');
    assert.equal(evidence.revokeRequests.length, 1, 'TENANT_LIFECYCLE_BROWSER_REVOKE_COUNT_INVALID');
    validateTenantLifecycleRevokeRequest(evidence.revokeRequests[0]);

    assert.equal(evidence.authGets, 1, 'TENANT_LIFECYCLE_BROWSER_AUTH_COUNT_INVALID');
    assert.equal(evidence.platformBootstrapGets, 1, 'TENANT_LIFECYCLE_BROWSER_PLATFORM_BOOTSTRAP_MISSING');
    assert.ok(evidence.tenantBootstrapGets >= 1, 'TENANT_LIFECYCLE_BROWSER_TENANT_BOOTSTRAP_MISSING');
    assert.ok(evidence.userGets >= 2, 'TENANT_LIFECYCLE_BROWSER_USERS_NOT_REFRESHED');
    assert.ok(evidence.auditGets >= 2, 'TENANT_LIFECYCLE_BROWSER_AUDIT_NOT_REFRESHED');
    assert.ok(evidence.identityGets >= 2, 'TENANT_LIFECYCLE_BROWSER_INVITATIONS_NOT_INTERCEPTED');
    assert.equal(evidence.unexpectedApiRequests, 0, 'TENANT_LIFECYCLE_BROWSER_UNEXPECTED_API');

    await assertStorageEmpty(page);
    assertCleanPageUrl(page.url(), config.baseUrl);
    assert.equal((await page.locator('body').innerText()).includes(PII_SENTINEL), false, 'TENANT_LIFECYCLE_BROWSER_STALE_PII_RENDERED');
    await page.waitForTimeout(100);
    assert.deepEqual(browserErrors, [], 'TENANT_LIFECYCLE_BROWSER_RUNTIME_ERRORS');
  } finally {
    await context.close();
  }
}

export function buildTenantLifecycleBrowserSummary() {
  return Object.freeze({
    ok: true,
    viewportsVerified: TENANT_LIFECYCLE_BROWSER_VIEWPORTS.length,
    apiFullyIntercepted: true,
    databaseMutations: false,
    revokeRequestsVerified: TENANT_LIFECYCLE_BROWSER_VIEWPORTS.length,
    stalePiiRendered: false,
    browserStorageEmpty: true,
  });
}

export function buildTenantLifecycleBrowserFailure() {
  return Object.freeze({
    ok: false,
    code: 'TENANT_LIFECYCLE_BROWSER_VERIFICATION_FAILED',
  });
}

export async function runTenantLifecycleBrowserVerification(config = loadTenantLifecycleBrowserConfig()) {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of TENANT_LIFECYCLE_BROWSER_VIEWPORTS) {
      await verifyViewport(browser, config, viewport);
    }
    return buildTenantLifecycleBrowserSummary();
  } finally {
    await browser.close();
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  try {
    const result = await runTenantLifecycleBrowserVerification();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write(`${JSON.stringify(buildTenantLifecycleBrowserFailure())}\n`);
    process.exitCode = 1;
  }
}
