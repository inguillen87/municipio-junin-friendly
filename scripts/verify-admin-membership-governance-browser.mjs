import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

export const ADMIN_MEMBERSHIP_BROWSER_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1440, height: 900 }),
  Object.freeze({ name: 'mobile', width: 390, height: 844 }),
]);

const PAGE_PATH = '/administracion-plataforma.html';
const AUTH_PATH = '/api/internal-auth';
const ADMIN_PATH = '/api/internal-admin';
const IDENTITY_PATH = '/api/internal-identity';
const ROLE_KEY = 'TENANT_RRHH_ADMIN_OPERATIVO';
const APPROVAL_REASON = 'Aprobación RRHH QA';
const ASSOCIATION_REASON = 'Alta operativa QA';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const STATIC_MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

const FIXTURE = Object.freeze({
  actorId: '10000000-0000-4000-8000-000000000001',
  actorEmail: 'checker-owner-ui-qa@local.invalid',
  makerEmail: 'maker-owner-ui-qa@local.invalid',
  tenantId: '20000000-0000-4000-8000-000000000002',
  ineligibleTenantId: '20000000-0000-4000-8000-000000000003',
  pendingRequestId: '30000000-0000-4000-8000-000000000004',
  expiredRequestId: '30000000-0000-4000-8000-000000000005',
  targetEmail: 'target-existing-ui-qa@local.invalid',
  // Caso mínimo gobernado: con dos owners, el objetivo solicita su propia
  // membresía y deja al segundo owner disponible como checker.
  associationEmail: 'checker-owner-ui-qa@local.invalid',
});

function cleanBaseUrl(rawValue) {
  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error('ADMIN_MEMBERSHIP_BROWSER_BASE_URL_INVALID');
  }
  const loopback = new Set(['127.0.0.1', 'localhost', '[::1]']);
  assert.equal(parsed.protocol, 'http:', 'ADMIN_MEMBERSHIP_BROWSER_REQUIRES_LOCAL_HTTP');
  assert.ok(loopback.has(parsed.hostname.toLowerCase()), 'ADMIN_MEMBERSHIP_BROWSER_REQUIRES_LOOPBACK');
  assert.equal(parsed.username, '', 'ADMIN_MEMBERSHIP_BROWSER_URL_CREDENTIALS_FORBIDDEN');
  assert.equal(parsed.password, '', 'ADMIN_MEMBERSHIP_BROWSER_URL_CREDENTIALS_FORBIDDEN');
  assert.ok(parsed.pathname === '/' || parsed.pathname === '', 'ADMIN_MEMBERSHIP_BROWSER_URL_PATH_FORBIDDEN');
  assert.equal(parsed.search, '', 'ADMIN_MEMBERSHIP_BROWSER_URL_QUERY_FORBIDDEN');
  assert.equal(parsed.hash, '', 'ADMIN_MEMBERSHIP_BROWSER_URL_HASH_FORBIDDEN');
  return parsed.origin;
}

export function loadAdminMembershipBrowserConfig(env = process.env) {
  return Object.freeze({
    baseUrl: cleanBaseUrl(env.BASE_URL || 'http://127.0.0.1:3100'),
  });
}

function resolveStaticFile(requestPath) {
  const pathname = requestPath === '/' ? '/friendly-dashboard.html' : requestPath;
  let relative;
  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  const resolved = path.resolve(PUBLIC_ROOT, relative);
  return resolved === PUBLIC_ROOT || resolved.startsWith(`${PUBLIC_ROOT}${path.sep}`) ? resolved : null;
}

export async function startAdminMembershipBrowserServer() {
  assert.ok(
    fs.existsSync(path.join(PUBLIC_ROOT, 'administracion-plataforma.html')),
    'ADMIN_MEMBERSHIP_BROWSER_BUILD_REQUIRED',
  );
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    const file = resolveStaticFile(pathname);
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': STATIC_MIME_TYPES.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
    });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'ADMIN_MEMBERSHIP_BROWSER_SERVER_ADDRESS_INVALID');
  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  });
}

export function buildAdminMembershipAuthFixture() {
  return {
    ok: true,
    authenticated: true,
    sessionVersion: 2,
    user: {
      id: FIXTURE.actorId,
      email: FIXTURE.actorEmail,
      name: 'Checker Owner UI QA',
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

function tenantFixtures() {
  return [
    {
      id: FIXTURE.tenantId,
      slug: 'junin-membership-ui-qa',
      legalName: 'Municipalidad de Junín QA',
      shortName: 'Junín QA',
      kind: 'municipality',
      jurisdiction: 'Mendoza QA local',
      status: 'active',
    },
    {
      id: FIXTURE.ineligibleTenantId,
      slug: 'future-tenant-ui-qa',
      legalName: 'Gobierno futuro no elegible QA',
      shortName: 'Futuro no elegible',
      kind: 'municipality',
      jurisdiction: 'Fuera de alcance QA',
      status: 'planned',
    },
  ];
}

function membershipRequests(approvalRecorded) {
  return [
    {
      id: FIXTURE.pendingRequestId,
      action: 'add',
      status: approvalRecorded ? 'approved' : 'pending',
      tenantId: FIXTURE.tenantId,
      tenantName: 'Municipalidad de Junín QA',
      targetEmail: FIXTURE.targetEmail,
      targetDisplayName: 'Cuenta existente QA',
      membershipId: null,
      roleKey: ROLE_KEY,
      expectedMembershipVersion: 0,
      reason: 'Solicitud operativa de prueba local',
      requestedByEmail: FIXTURE.makerEmail,
      requestedByDisplayName: 'Maker Owner UI QA',
      requestedAt: '2098-12-31T12:00:00.000Z',
      expiresAt: '2099-01-01T12:00:00.000Z',
      decidedByEmail: approvalRecorded ? FIXTURE.actorEmail : null,
      decisionReason: approvalRecorded ? APPROVAL_REASON : null,
      decidedAt: approvalRecorded ? '2098-12-31T12:05:00.000Z' : null,
      version: approvalRecorded ? 4 : 3,
      canCurrentActorDecide: !approvalRecorded,
    },
    {
      id: FIXTURE.expiredRequestId,
      action: 'add',
      status: 'expired',
      tenantId: FIXTURE.tenantId,
      tenantName: 'Municipalidad de Junín QA',
      targetEmail: 'expired-target-ui-qa@local.invalid',
      targetDisplayName: 'Solicitud vencida QA',
      membershipId: null,
      roleKey: ROLE_KEY,
      expectedMembershipVersion: 0,
      reason: 'Solicitud que venció sin decisión',
      requestedByEmail: FIXTURE.makerEmail,
      requestedByDisplayName: 'Maker Owner UI QA',
      requestedAt: '2098-12-29T12:00:00.000Z',
      expiresAt: '2098-12-30T12:00:00.000Z',
      decidedByEmail: null,
      decisionReason: null,
      decidedAt: null,
      version: 2,
      canCurrentActorDecide: false,
    },
  ];
}

export function buildAdminMembershipBootstrapFixture(approvalRecorded = false) {
  return {
    ok: true,
    contractVersion: 3,
    user: {
      id: FIXTURE.actorId,
      email: FIXTURE.actorEmail,
      displayName: 'Checker Owner UI QA',
      platformRole: 'PLATFORM_OWNER',
    },
    context: {
      mode: 'platform',
      tenantId: '',
      label: 'Plataforma QA local',
      environment: 'local',
      tenantAwareGateway: true,
    },
    tenants: tenantFixtures(),
    roles: [
      {
        key: ROLE_KEY,
        label: 'Administración RR.HH. operativa',
        description: 'Gestión operativa explícita y acotada al gobierno seleccionado.',
        scopeKind: 'tenant',
        capabilities: ['hr.employee.read'],
      },
    ],
    allowedCommands: [
      'request_existing_membership',
      'approve_membership_change',
      'reject_membership_change',
    ],
    controls: {
      sodReady: true,
      auditReady: true,
      tenantDataPlaneReady: false,
      invitationGatewayReady: false,
    },
    membershipGovernance: {
      explicitTenantOnly: true,
      futureTenantAccess: false,
      makerCheckerRequired: true,
      usableOwnerCount: 2,
      actorGovernanceReady: true,
      makerCheckerReady: true,
      actionableRequestCount: approvalRecorded ? 0 : 1,
      eligibleTenantIds: [FIXTURE.tenantId],
    },
    membershipRequests: membershipRequests(approvalRecorded),
    operationalCatalog: {
      sourceBindings: [],
      scopeCapabilities: [],
      organizations: [],
      sectors: [],
      reasonCodes: [],
    },
    metrics: {
      tenants: 2,
      attention: 1,
      overdueAccessReviews: 0,
      securityAlerts: 0,
    },
    source: {
      label: 'Contrato sintético local',
      cutoff: '2099-01-01T00:00:00.000Z',
    },
  };
}

export function buildAdminMembershipPlatformOwnersFixture() {
  return {
    ok: true,
    currentActorEmail: FIXTURE.actorEmail,
    owners: [
      {
        email: FIXTURE.actorEmail,
        displayName: 'Checker Owner UI QA',
        active: true,
        version: 2,
        mfaEnrolled: true,
      },
      {
        email: FIXTURE.makerEmail,
        displayName: 'Maker Owner UI QA',
        active: true,
        version: 2,
        mfaEnrolled: true,
      },
    ],
    eligibleUsers: [],
    requests: [],
    allowedCommands: [],
    controls: {
      activeOwnerCount: 2,
      makerCheckerReady: true,
      lastOwnerProtected: true,
      selfApprovalBlocked: true,
      mfaRequiredForGrant: true,
      auditReady: true,
    },
  };
}

export function expectedMembershipApprovalBody() {
  return {
    command: 'approve_membership_change',
    payload: {
      requestId: FIXTURE.pendingRequestId,
      reason: APPROVAL_REASON,
    },
    expectedVersion: 3,
  };
}

export function expectedExistingMembershipBody() {
  return {
    command: 'request_existing_membership',
    payload: {
      tenantId: FIXTURE.tenantId,
      email: FIXTURE.associationEmail,
      roleKey: ROLE_KEY,
      reason: ASSOCIATION_REASON,
    },
    expectedVersion: 0,
  };
}

function assertSafeMutationRecord(record, expectedBody, codePrefix) {
  assert.equal(record.method, 'POST', `${codePrefix}_METHOD_INVALID`);
  assert.equal(record.pathname, ADMIN_PATH, `${codePrefix}_PATH_INVALID`);
  assert.equal(record.search, '', `${codePrefix}_QUERY_FORBIDDEN`);
  assert.equal(record.resourceType, 'fetch', `${codePrefix}_NOT_FETCH`);
  assert.equal(record.headers.accept, 'application/json', `${codePrefix}_ACCEPT_INVALID`);
  assert.match(record.headers['content-type'] || '', /^application\/json(?:;|$)/i, `${codePrefix}_CONTENT_TYPE_INVALID`);
  assert.match(record.headers['idempotency-key'] || '', UUID_V4, `${codePrefix}_IDEMPOTENCY_INVALID`);
  assert.equal(record.headers.authorization, undefined, `${codePrefix}_AUTHORIZATION_FORBIDDEN`);
  assert.deepEqual(record.body, expectedBody, `${codePrefix}_BODY_INVALID`);
  const serializedBody = JSON.stringify(record.body);
  assert.doesNotMatch(serializedBody, /password|secret|authorization|bearer|token/i, `${codePrefix}_SENSITIVE_FIELD_FORBIDDEN`);
  assert.equal(serializedBody.includes(FIXTURE.ineligibleTenantId), false, `${codePrefix}_INELIGIBLE_TENANT_FORBIDDEN`);
  return true;
}

export function validateMembershipApprovalRequest(record) {
  return assertSafeMutationRecord(record, expectedMembershipApprovalBody(), 'ADMIN_MEMBERSHIP_APPROVAL');
}

export function validateExistingMembershipRequest(record) {
  return assertSafeMutationRecord(record, expectedExistingMembershipBody(), 'ADMIN_MEMBERSHIP_ASSOCIATION');
}

function jsonResponse(payload, status = 200) {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    body: JSON.stringify(payload),
  };
}

function hasOnlyResourceQuery(url, resource) {
  const keys = [...url.searchParams.keys()];
  return keys.length === 1 && keys[0] === 'resource' && url.searchParams.get('resource') === resource;
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

async function routeApiRequest(route, evidence) {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();

  if (url.pathname === AUTH_PATH && method === 'GET' && url.search === '') {
    evidence.authGets += 1;
    evidence.events.push('get:auth');
    return route.fulfill(jsonResponse(buildAdminMembershipAuthFixture()));
  }

  if (url.pathname === IDENTITY_PATH && method === 'GET' && hasOnlyResourceQuery(url, 'invitations')) {
    evidence.identityGets += 1;
    evidence.events.push('get:invitations');
    return route.fulfill(jsonResponse({ ok: true, allowedCommands: [], invitations: [] }));
  }

  if (url.pathname === ADMIN_PATH && method === 'GET') {
    const resource = url.searchParams.get('resource');
    if (!hasOnlyResourceQuery(url, resource || '')) {
      evidence.unexpectedApiRequests += 1;
      return route.fulfill(jsonResponse({ ok: false, code: 'ADMIN_MEMBERSHIP_BROWSER_QUERY_BLOCKED' }, 418));
    }
    if (resource === 'bootstrap') {
      evidence.bootstrapGets += 1;
      evidence.events.push('get:bootstrap');
      return route.fulfill(jsonResponse(buildAdminMembershipBootstrapFixture(evidence.approvalRecorded)));
    }
    if (resource === 'users') {
      evidence.userGets += 1;
      evidence.events.push('get:users');
      return route.fulfill(jsonResponse({ ok: true, users: [], source: { cutoff: '2099-01-01T00:00:00.000Z' } }));
    }
    if (resource === 'audit') {
      evidence.auditGets += 1;
      evidence.events.push('get:audit');
      return route.fulfill(jsonResponse({ ok: true, events: [] }));
    }
    if (resource === 'platform_owners') {
      evidence.platformOwnerGets += 1;
      evidence.events.push('get:platform_owners');
      return route.fulfill(jsonResponse(buildAdminMembershipPlatformOwnersFixture()));
    }
  }

  if (url.pathname === ADMIN_PATH && method === 'POST' && url.search === '') {
    const record = requestRecord(request);
    if (record.body && record.body.command === 'approve_membership_change') {
      validateMembershipApprovalRequest(record);
      evidence.approvalRequests.push(record);
      evidence.approvalRecorded = true;
      evidence.events.push('post:approve:200');
      return route.fulfill(jsonResponse({ ok: true, replayed: false }, 200));
    }
    if (record.body && record.body.command === 'request_existing_membership') {
      validateExistingMembershipRequest(record);
      evidence.associationRequests.push(record);
      evidence.events.push('post:associate:202');
      return route.fulfill(jsonResponse({ ok: true, replayed: false, status: 'pending' }, 202));
    }
  }

  evidence.unexpectedApiRequests += 1;
  return route.fulfill(jsonResponse({ ok: false, code: 'ADMIN_MEMBERSHIP_BROWSER_API_BLOCKED' }, 418));
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
  assert.deepEqual(storage, { local: [], session: [], cookies: '', caches: [], indexedDb: [] }, 'ADMIN_MEMBERSHIP_BROWSER_STORAGE_NOT_EMPTY');
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    openDialogs: Array.from(document.querySelectorAll('dialog[open]')).map((dialog) => ({
      id: dialog.id,
      clientWidth: dialog.clientWidth,
      scrollWidth: dialog.scrollWidth,
    })),
  }));
  assert.ok(overflow.documentWidth <= overflow.viewport + 1, `ADMIN_MEMBERSHIP_BROWSER_DOCUMENT_OVERFLOW_${JSON.stringify(overflow)}`);
  assert.ok(overflow.bodyWidth <= overflow.viewport + 1, `ADMIN_MEMBERSHIP_BROWSER_BODY_OVERFLOW_${JSON.stringify(overflow)}`);
  overflow.openDialogs.forEach((dialog) => {
    assert.ok(dialog.scrollWidth <= dialog.clientWidth + 1, `ADMIN_MEMBERSHIP_BROWSER_DIALOG_OVERFLOW_${dialog.id}`);
  });
}

function assertCleanPageUrl(actualUrl, baseUrl) {
  const url = new URL(actualUrl);
  assert.equal(url.origin, baseUrl, 'ADMIN_MEMBERSHIP_BROWSER_PAGE_ORIGIN_CHANGED');
  assert.equal(url.pathname, PAGE_PATH, 'ADMIN_MEMBERSHIP_BROWSER_PAGE_PATH_CHANGED');
  assert.equal(url.search, '', 'ADMIN_MEMBERSHIP_BROWSER_PAGE_QUERY_FORBIDDEN');
  assert.equal(url.hash, '', 'ADMIN_MEMBERSHIP_BROWSER_PAGE_HASH_FORBIDDEN');
}

async function openAccessView(page, viewport) {
  if (viewport.width <= 820) await page.locator('#menuButton').click();
  const accessNavigation = page.locator('[data-admin-view="access"]');
  await accessNavigation.waitFor({ state: 'visible' });
  await accessNavigation.click();
  await page.locator('#accessView').waitFor({ state: 'visible' });
}

async function verifyViewport(browser, config, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const runtimeErrors = [];
  const evidence = {
    authGets: 0,
    bootstrapGets: 0,
    userGets: 0,
    auditGets: 0,
    identityGets: 0,
    platformOwnerGets: 0,
    unexpectedApiRequests: 0,
    approvalRequests: [],
    associationRequests: [],
    approvalRecorded: false,
    events: [],
  };

  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console:${message.text()}`);
  });
  page.on('pageerror', (error) => runtimeErrors.push(`pageerror:${error && error.message ? error.message : String(error)}`));
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === config.baseUrl) runtimeErrors.push(`requestfailed:${new URL(request.url()).pathname}`);
  });
  page.on('response', (response) => {
    const responseUrl = new URL(response.url());
    if (responseUrl.origin === config.baseUrl && response.status() >= 400) runtimeErrors.push(`http:${response.status()}:${responseUrl.pathname}`);
  });

  await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  await context.route('**/api/**', (route) => routeApiRequest(route, evidence));

  try {
    await page.goto(`${config.baseUrl}${PAGE_PATH}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#platformAdminShell').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#authGate').isHidden(), true, 'ADMIN_MEMBERSHIP_BROWSER_AUTH_GATE_VISIBLE');
    await openAccessView(page, viewport);

    assert.equal(await page.locator('#membershipRequestGateTitle').innerText(), 'Doble control operativo disponible');
    assert.match(await page.locator('#membershipRequestFacts').innerText(), /2 propietarios utilizables/);
    assert.match(await page.locator('#membershipRequestFacts').innerText(), /Futuros tenants: no/);

    const pendingReason = page.locator(`[data-membership-decision-reason="${FIXTURE.pendingRequestId}"]`);
    const approveButton = page.locator(`[data-approve-membership-request="${FIXTURE.pendingRequestId}"]`);
    const rejectButton = page.locator(`[data-reject-membership-request="${FIXTURE.pendingRequestId}"]`);
    await pendingReason.waitFor({ state: 'visible' });
    assert.equal(await approveButton.isDisabled(), true, 'ADMIN_MEMBERSHIP_BROWSER_APPROVE_PREMATURELY_ENABLED');
    assert.equal(await rejectButton.isDisabled(), true, 'ADMIN_MEMBERSHIP_BROWSER_REJECT_PREMATURELY_ENABLED');
    await pendingReason.fill('ab');
    assert.equal(await approveButton.isDisabled(), true, 'ADMIN_MEMBERSHIP_BROWSER_APPROVE_SHORT_REASON_ENABLED');
    assert.equal(await rejectButton.isDisabled(), true, 'ADMIN_MEMBERSHIP_BROWSER_REJECT_SHORT_REASON_ENABLED');
    await pendingReason.fill(APPROVAL_REASON);
    assert.equal(await approveButton.isEnabled(), true, 'ADMIN_MEMBERSHIP_BROWSER_APPROVE_NOT_ENABLED');
    assert.equal(await rejectButton.isEnabled(), true, 'ADMIN_MEMBERSHIP_BROWSER_REJECT_NOT_ENABLED');

    const expiredRow = page.locator('#membershipRequestRows tr').filter({ hasText: 'Vencida sin decisión' });
    await expiredRow.waitFor({ state: 'visible' });
    assert.match((await expiredRow.innerText()).replace(/\s+/g, ' '), /Vencida.+Límite.+Vencida sin decisión.+No modificó permisos ni creó una membresía/i);
    await assertNoHorizontalOverflow(page);

    const approvalResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      const url = new URL(response.url());
      return request.method() === 'POST' && url.pathname === ADMIN_PATH
        && request.postDataJSON().command === 'approve_membership_change';
    });
    const approvalReloadPromise = page.waitForResponse((response) => {
      const request = response.request();
      const url = new URL(response.url());
      return request.method() === 'GET' && url.pathname === ADMIN_PATH
        && url.searchParams.get('resource') === 'bootstrap' && evidence.approvalRecorded;
    });
    const dialogPromise = page.waitForEvent('dialog');
    const clickPromise = approveButton.click();
    const dialog = await dialogPromise;
    const confirmation = dialog.message();
    assert.match(confirmation, /APROBAR acceso operativo/);
    assert.ok(confirmation.includes('Gobierno: Municipalidad de Junín QA'));
    assert.ok(confirmation.includes(`Cuenta: ${FIXTURE.targetEmail}`));
    assert.ok(confirmation.includes(`Rol: ${ROLE_KEY}`));
    assert.ok(confirmation.includes(`Fundamento: ${APPROVAL_REASON}`));
    await dialog.accept();
    await clickPromise;
    const approvalResponse = await approvalResponsePromise;
    assert.equal(approvalResponse.status(), 200, 'ADMIN_MEMBERSHIP_BROWSER_APPROVAL_STATUS_INVALID');
    await approvalReloadPromise;
    await page.locator('#toastRegion').getByText('Acceso operativo aprobado y auditado.').waitFor({ state: 'visible' });
    assert.equal(evidence.approvalRequests.length, 1, 'ADMIN_MEMBERSHIP_BROWSER_APPROVAL_COUNT_INVALID');
    validateMembershipApprovalRequest(evidence.approvalRequests[0]);
    const approvalEvent = evidence.events.indexOf('post:approve:200');
    const approvalReloadEvent = evidence.events.indexOf('get:bootstrap', approvalEvent + 1);
    assert.ok(approvalEvent >= 0 && approvalReloadEvent > approvalEvent, 'ADMIN_MEMBERSHIP_BROWSER_APPROVAL_RELOAD_ORDER_INVALID');

    await page.locator('#attachExistingButton:not([disabled])').click();
    await page.locator('#attachExistingDialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#attachExistingSubmit').isDisabled(), true, 'ADMIN_MEMBERSHIP_BROWSER_ASSOCIATION_PREMATURELY_ENABLED');
    const tenantOptions = await page.locator('#attachExistingTenant option').evaluateAll((options) => options.map((option) => ({ value: option.value, label: option.textContent })));
    assert.deepEqual(tenantOptions.map((option) => option.value), ['', FIXTURE.tenantId], 'ADMIN_MEMBERSHIP_BROWSER_TENANT_OPTIONS_INVALID');
    assert.equal(tenantOptions.some((option) => option.value === FIXTURE.ineligibleTenantId || /futuro/i.test(option.label || '')), false, 'ADMIN_MEMBERSHIP_BROWSER_FUTURE_TENANT_RENDERED');
    const roleOptions = await page.locator('#attachExistingRole option').evaluateAll((options) => options.map((option) => option.value));
    assert.deepEqual(roleOptions, ['', ROLE_KEY], 'ADMIN_MEMBERSHIP_BROWSER_ROLE_OPTIONS_INVALID');

    await page.locator('#attachExistingEmail').fill(FIXTURE.associationEmail);
    await page.locator('#attachExistingTenant').selectOption(FIXTURE.tenantId);
    await page.locator('#attachExistingRole').selectOption(ROLE_KEY);
    await page.locator('#attachExistingReason').fill('ab');
    assert.equal(await page.locator('#attachExistingSubmit').isDisabled(), true, 'ADMIN_MEMBERSHIP_BROWSER_ASSOCIATION_SHORT_REASON_ENABLED');
    await page.locator('#attachExistingReason').fill(ASSOCIATION_REASON);
    assert.equal(await page.locator('#attachExistingSubmit').isEnabled(), true, 'ADMIN_MEMBERSHIP_BROWSER_ASSOCIATION_NOT_ENABLED');
    await assertNoHorizontalOverflow(page);

    const associationResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      const url = new URL(response.url());
      return request.method() === 'POST' && url.pathname === ADMIN_PATH
        && request.postDataJSON().command === 'request_existing_membership';
    });
    const associationReloadPromise = page.waitForResponse((response) => {
      const request = response.request();
      const url = new URL(response.url());
      return request.method() === 'GET' && url.pathname === ADMIN_PATH
        && url.searchParams.get('resource') === 'bootstrap'
        && evidence.associationRequests.length === 1;
    });
    await page.locator('#attachExistingSubmit').click();
    const associationResponse = await associationResponsePromise;
    assert.equal(associationResponse.status(), 202, 'ADMIN_MEMBERSHIP_BROWSER_ASSOCIATION_STATUS_INVALID');
    await associationReloadPromise;
    await page.locator('#toastRegion').getByText('Solicitud registrada; todavía no se modificaron permisos.').waitFor({ state: 'visible' });
    assert.equal(evidence.associationRequests.length, 1, 'ADMIN_MEMBERSHIP_BROWSER_ASSOCIATION_COUNT_INVALID');
    validateExistingMembershipRequest(evidence.associationRequests[0]);
    const associationEvent = evidence.events.indexOf('post:associate:202');
    const associationReloadEvent = evidence.events.indexOf('get:bootstrap', associationEvent + 1);
    assert.ok(associationEvent >= 0 && associationReloadEvent > associationEvent, 'ADMIN_MEMBERSHIP_BROWSER_ASSOCIATION_RELOAD_ORDER_INVALID');

    assert.equal(evidence.authGets, 1, 'ADMIN_MEMBERSHIP_BROWSER_AUTH_COUNT_INVALID');
    assert.ok(evidence.bootstrapGets >= 3, 'ADMIN_MEMBERSHIP_BROWSER_BOOTSTRAP_RELOADS_MISSING');
    assert.ok(evidence.userGets >= 3, 'ADMIN_MEMBERSHIP_BROWSER_USERS_RELOADS_MISSING');
    assert.ok(evidence.auditGets >= 3, 'ADMIN_MEMBERSHIP_BROWSER_AUDIT_RELOADS_MISSING');
    assert.ok(evidence.identityGets >= 3, 'ADMIN_MEMBERSHIP_BROWSER_IDENTITY_RELOADS_MISSING');
    assert.ok(evidence.platformOwnerGets >= 3, 'ADMIN_MEMBERSHIP_BROWSER_OWNER_RELOADS_MISSING');
    assert.equal(evidence.unexpectedApiRequests, 0, 'ADMIN_MEMBERSHIP_BROWSER_UNEXPECTED_API');
    await assertNoHorizontalOverflow(page);
    await assertStorageEmpty(page);
    assertCleanPageUrl(page.url(), config.baseUrl);
    await page.waitForTimeout(100);
    assert.deepEqual(runtimeErrors, [], 'ADMIN_MEMBERSHIP_BROWSER_RUNTIME_ERRORS');
  } finally {
    await context.close();
  }
}

export function buildAdminMembershipBrowserSummary() {
  return Object.freeze({
    ok: true,
    viewportsVerified: ADMIN_MEMBERSHIP_BROWSER_VIEWPORTS.length,
    apiFullyIntercepted: true,
    databaseMutations: false,
    approvalRequestsVerified: ADMIN_MEMBERSHIP_BROWSER_VIEWPORTS.length,
    associationRequestsVerified: ADMIN_MEMBERSHIP_BROWSER_VIEWPORTS.length,
    approvalStatus: 200,
    associationStatus: 202,
    browserStorageEmpty: true,
    runtimeErrors: 0,
  });
}

export function buildAdminMembershipBrowserFailure() {
  return Object.freeze({
    ok: false,
    code: 'ADMIN_MEMBERSHIP_BROWSER_VERIFICATION_FAILED',
  });
}

export async function runAdminMembershipBrowserVerification(config) {
  const localServer = config || process.env.BASE_URL ? null : await startAdminMembershipBrowserServer();
  const effectiveConfig = config || (localServer
    ? Object.freeze({ baseUrl: localServer.baseUrl })
    : loadAdminMembershipBrowserConfig());
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of ADMIN_MEMBERSHIP_BROWSER_VIEWPORTS) {
      await verifyViewport(browser, effectiveConfig, viewport);
    }
    return buildAdminMembershipBrowserSummary();
  } finally {
    await browser.close();
    if (localServer) await localServer.close();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(await runAdminMembershipBrowserVerification())}\n`);
  } catch {
    process.stderr.write(`${JSON.stringify(buildAdminMembershipBrowserFailure())}\n`);
    process.exitCode = 1;
  }
}
