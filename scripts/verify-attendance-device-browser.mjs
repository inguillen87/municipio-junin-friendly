import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

export const ATTENDANCE_DEVICE_BROWSER_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1440, height: 900 }),
  Object.freeze({ name: 'mobile', width: 390, height: 844 }),
]);

const PAGE_PATH = '/relojes-marcaciones.html';
const AUTH_PATH = '/api/internal-auth';
const ATTENDANCE_PATH = '/api/internal-attendance';
const PAGE_SIZE = 25;
const PUBLIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const INVENTORY_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'junin-attendance-inventory.v1.json',
);
const STATIC_MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);
const RESOURCES = Object.freeze(['site', 'device', 'connector', 'punch', 'batch', 'audit']);
const FIXTURE = Object.freeze({
  tenantId: '10000000-0000-4000-8000-000000000001',
  membershipId: '20000000-0000-4000-8000-000000000002',
  sessionId: '30000000-0000-4000-8000-000000000003',
  userId: '40000000-0000-4000-8000-000000000004',
  email: 'attendance-browser-qa@local.invalid',
});

function readInventory() {
  const inventory = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'));
  assert.equal(inventory.contractVersion, 'junin-attendance-inventory.v1');
  assert.equal(inventory.timezone, 'America/Argentina/Mendoza');
  assert.equal(inventory.source?.verificationState, 'reported_inventory');
  assert.equal(inventory.source?.recordCount, 13);
  assert.equal(inventory.sites?.length, 13);
  return inventory;
}

const INVENTORY = readInventory();

function indexedUuid(prefix, index) {
  return `${prefix}0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
}

function exactKeys(value, expected, code) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${code}_OBJECT_REQUIRED`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${code}_KEYS_INVALID`);
}

export function buildAttendanceDeviceAuthFixture() {
  return {
    ok: true,
    authenticated: true,
    sessionVersion: 2,
    user: {
      id: FIXTURE.userId,
      email: FIXTURE.email,
      name: 'Operador local de verificación',
      role: 'TENANT_ATTENDANCE_OPERATOR',
    },
    access: {
      context: 'tenant',
      tenant: {
        id: FIXTURE.tenantId,
        membershipId: FIXTURE.membershipId,
        slug: 'junin-mendoza',
        name: 'Municipalidad de Junín · QA local',
      },
    },
    authentication: { level: 'mfa', mfaVerified: true },
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

export function buildAttendanceDeviceBootstrapFixture({ audit = false, manage = false } = {}) {
  const capabilities = ['attendance.read'];
  if (audit) capabilities.unshift('attendance.audit.read');
  if (manage) capabilities.unshift('attendance.device.manage');
  return {
    ok: true,
    contract: {
      version: 'attendance-device-gateway.v1',
      timezone: 'America/Argentina/Mendoza',
      resources: [...RESOURCES],
      biometricTemplatesStored: false,
    },
    capabilities,
    summary: {
      siteCount: 13,
      deviceCount: 13,
      connectorCount: 0,
      activeConnectorCount: 0,
      rawEventCount: 0,
      punchCount: 0,
      unmatchedPunchCount: 0,
      pendingReviewCount: 0,
    },
    features: {
      hardwareConnected: false,
      hoursCalculated: false,
      payrollPosted: false,
      biometricTemplatesStored: false,
    },
  };
}

export function buildAttendanceDeviceSiteFixtures() {
  return INVENTORY.sites.map((site, index) => ({
    id: indexedUuid('5', index + 1),
    externalKey: site.code.toLowerCase(),
    label: site.name,
    addressText: site.address,
    timezone: INVENTORY.timezone,
    latitude: site.latitude,
    longitude: site.longitude,
    geofenceRadiusM: null,
    networkEnabled: site.reportedExtraction === 'network_pull',
    removableMediaEnabled: site.reportedExtraction === 'removable_media',
    status: 'draft',
    version: 1,
  }));
}

export function buildAttendanceDeviceEquipmentFixtures() {
  return INVENTORY.sites.map((site, index) => ({
    id: indexedUuid('6', index + 1),
    siteId: indexedUuid('5', index + 1),
    externalKey: `reloj-${site.code.toLowerCase()}`,
    vendorKey: 'zkteco',
    model: site.model,
    transport: site.reportedExtraction === 'network_pull' ? 'network_pull' : 'removable_media',
    driverKey: 'pending-homologation',
    timezone: INVENTORY.timezone,
    capabilities: { pull: false, push: false, biometric: false, card: false, pin: false },
    status: 'draft',
    version: 1,
  }));
}

export function buildAttendanceDeviceAuditFixtures() {
  return Array.from({ length: 26 }, (_, index) => ({
    id: indexedUuid('7', index + 1),
    targetKind: index % 2 === 0 ? 'site' : 'device',
    targetId: indexedUuid(index % 2 === 0 ? '5' : '6', (index % 13) + 1),
    actorKind: 'membership',
    actorRole: 'TENANT_ATTENDANCE_AUDITOR',
    command: index % 2 === 0 ? 'site.create' : 'device.create',
    occurredAt: new Date(Date.UTC(2098, 11, 31, 23, 59 - index)).toISOString(),
  }));
}

export function validateAttendanceDeviceApiRequest(request) {
  assert.equal(request.method, 'GET', 'ATTENDANCE_DEVICE_BROWSER_METHOD_INVALID');
  assert.equal(request.pathname, ATTENDANCE_PATH, 'ATTENDANCE_DEVICE_BROWSER_PATH_INVALID');
  assert.equal(request.headers.accept, 'application/json', 'ATTENDANCE_DEVICE_BROWSER_ACCEPT_INVALID');
  assert.equal(request.headers['cache-control'], 'no-store', 'ATTENDANCE_DEVICE_BROWSER_CACHE_INVALID');
  assert.equal(request.headers.authorization, undefined, 'ATTENDANCE_DEVICE_BROWSER_AUTHORIZATION_FORBIDDEN');
  assert.equal(request.headers.cookie, undefined, 'ATTENDANCE_DEVICE_BROWSER_COOKIE_CAPTURE_FORBIDDEN');

  const params = new URLSearchParams(request.search);
  const resource = params.get('resource');
  assert.ok(RESOURCES.includes(resource) || resource === 'bootstrap', 'ATTENDANCE_DEVICE_BROWSER_RESOURCE_INVALID');
  if (resource === 'bootstrap') {
    assert.deepEqual([...params.keys()], ['resource'], 'ATTENDANCE_DEVICE_BROWSER_BOOTSTRAP_QUERY_INVALID');
  } else {
    assert.deepEqual(
      [...params.keys()],
      ['resource', 'page', 'pageSize'],
      'ATTENDANCE_DEVICE_BROWSER_LIST_QUERY_INVALID',
    );
    assert.match(params.get('page') || '', /^[1-9]\d*$/, 'ATTENDANCE_DEVICE_BROWSER_PAGE_INVALID');
    assert.equal(params.get('pageSize'), String(PAGE_SIZE), 'ATTENDANCE_DEVICE_BROWSER_PAGE_SIZE_INVALID');
  }
  return { resource, page: Number(params.get('page') || 1) };
}

export function validateAttendanceDeviceAuthRequest(request) {
  assert.equal(request.method, 'GET', 'ATTENDANCE_DEVICE_BROWSER_AUTH_METHOD_INVALID');
  assert.equal(request.pathname, AUTH_PATH, 'ATTENDANCE_DEVICE_BROWSER_AUTH_PATH_INVALID');
  assert.equal(request.search, '', 'ATTENDANCE_DEVICE_BROWSER_AUTH_QUERY_FORBIDDEN');
  assert.equal(request.headers.accept, 'application/json', 'ATTENDANCE_DEVICE_BROWSER_AUTH_ACCEPT_INVALID');
  assert.equal(request.headers.authorization, undefined, 'ATTENDANCE_DEVICE_BROWSER_AUTHORIZATION_FORBIDDEN');
  assert.equal(request.headers.cookie, undefined, 'ATTENDANCE_DEVICE_BROWSER_AUTH_COOKIE_CAPTURE_FORBIDDEN');
  return true;
}

export function validateAttendanceDeviceMutationRequest(request, body) {
  assert.equal(request.method, 'POST', 'ATTENDANCE_DEVICE_BROWSER_MUTATION_METHOD_INVALID');
  assert.equal(request.pathname, ATTENDANCE_PATH, 'ATTENDANCE_DEVICE_BROWSER_MUTATION_PATH_INVALID');
  assert.equal(request.search, '', 'ATTENDANCE_DEVICE_BROWSER_MUTATION_QUERY_FORBIDDEN');
  assert.equal(request.headers.accept, 'application/json', 'ATTENDANCE_DEVICE_BROWSER_MUTATION_ACCEPT_INVALID');
  assert.equal(request.headers['content-type'], 'application/json', 'ATTENDANCE_DEVICE_BROWSER_MUTATION_CONTENT_TYPE_INVALID');
  assert.equal(request.headers['cache-control'], 'no-store', 'ATTENDANCE_DEVICE_BROWSER_MUTATION_CACHE_INVALID');
  assert.match(
    request.headers['idempotency-key'] || '',
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'ATTENDANCE_DEVICE_BROWSER_MUTATION_IDEMPOTENCY_INVALID',
  );
  assert.equal(request.headers.authorization, undefined, 'ATTENDANCE_DEVICE_BROWSER_MUTATION_AUTHORIZATION_FORBIDDEN');
  assert.equal(request.headers.cookie, undefined, 'ATTENDANCE_DEVICE_BROWSER_MUTATION_COOKIE_CAPTURE_FORBIDDEN');
  exactKeys(body, ['command', 'payload'], 'ATTENDANCE_DEVICE_BROWSER_MUTATION_BODY');
  assert.equal(body.command, 'device.update', 'ATTENDANCE_DEVICE_BROWSER_MUTATION_COMMAND_INVALID');
  exactKeys(
    body.payload,
    ['id', 'expectedVersion', 'serialNumber', 'firmwareVersion', 'protocolKey', 'networkHost', 'networkPort'],
    'ATTENDANCE_DEVICE_BROWSER_MUTATION_PAYLOAD',
  );
  assert.match(body.payload.id, /^[0-9a-f-]{36}$/i, 'ATTENDANCE_DEVICE_BROWSER_MUTATION_DEVICE_ID_INVALID');
  assert.equal(body.payload.expectedVersion, 1, 'ATTENDANCE_DEVICE_BROWSER_MUTATION_VERSION_INVALID');
  assert.equal(body.payload.serialNumber, 'K20-QA-0001');
  assert.equal(body.payload.firmwareVersion, 'Ver 6.60 QA');
  assert.equal(body.payload.protocolKey, 'zkteco-k20-qa');
  assert.equal(body.payload.networkHost, '10.20.30.40');
  assert.equal(body.payload.networkPort, 4370);
  assert.doesNotMatch(JSON.stringify(body), /password|secret|credential|biometric|template|status|active/i);
  return body.payload;
}

function resolveStaticFile(requestPath) {
  const pathname = requestPath === '/' ? PAGE_PATH : requestPath;
  let relative;
  try {
    relative = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  const resolved = path.resolve(PUBLIC_ROOT, relative);
  return resolved === PUBLIC_ROOT || resolved.startsWith(`${PUBLIC_ROOT}${path.sep}`) ? resolved : null;
}

export async function startAttendanceDeviceBrowserServer() {
  assert.ok(
    fs.existsSync(path.join(PUBLIC_ROOT, 'relojes-marcaciones.html')),
    'ATTENDANCE_DEVICE_BROWSER_BUILD_REQUIRED',
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
      'cache-control': 'private, no-store, max-age=0',
      'content-type': STATIC_MIME_TYPES.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'ATTENDANCE_DEVICE_BROWSER_SERVER_ADDRESS_INVALID');
  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  });
}

function cleanRequest(request) {
  const url = new URL(request.url());
  return {
    method: request.method(),
    pathname: url.pathname,
    search: url.search,
    headers: request.headers(),
  };
}

function pageEnvelope(resource, page, rows) {
  const start = (page - 1) * PAGE_SIZE;
  const data = rows.slice(start, start + PAGE_SIZE);
  return {
    ok: true,
    resource,
    data,
    pagination: {
      page,
      pageSize: PAGE_SIZE,
      total: rows.length,
      pages: Math.ceil(rows.length / PAGE_SIZE),
    },
  };
}

function emptyEnvelope(resource, page) {
  return pageEnvelope(resource, page, []);
}

async function assertNoHorizontalOverflow(page, code) {
  const evidence = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  assert.ok(
    evidence.documentWidth <= evidence.viewportWidth + 1,
    `${code}_${JSON.stringify(evidence)}`,
  );
}

async function assertFocusVisibleAndUsable(page, expectedId, code) {
  const evidence = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return { id: '', visible: false, inert: true };
    const rect = active.getBoundingClientRect();
    const style = getComputedStyle(active);
    return {
      id: active.id,
      visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none',
      inert: Boolean(active.closest('[inert]')),
    };
  });
  assert.equal(evidence.id, expectedId, `${code}_TARGET_INVALID`);
  assert.equal(evidence.visible, true, `${code}_NOT_VISIBLE`);
  assert.equal(evidence.inert, false, `${code}_INERT`);
}

async function waitForResource(page, resource, title) {
  await page.waitForFunction(
    ({ expectedResource, expectedTitle }) => {
      const tab = document.querySelector(`#tab-${expectedResource}`);
      const heading = document.querySelector('#resourceTitle');
      const panel = document.querySelector('#resourcePanel');
      return tab?.getAttribute('aria-selected') === 'true'
        && heading?.textContent?.trim() === expectedTitle
        && panel?.getAttribute('aria-busy') === 'false';
    },
    { expectedResource: resource, expectedTitle: title },
  );
}

async function selectResource(page, resource, title) {
  await page.locator(`#tab-${resource}`).click();
  await waitForResource(page, resource, title);
}

function assertExactFixtureContracts() {
  const auth = buildAttendanceDeviceAuthFixture();
  exactKeys(auth, ['ok', 'authenticated', 'sessionVersion', 'user', 'access', 'authentication', 'expiresAt'], 'ATTENDANCE_AUTH');
  const bootstrap = buildAttendanceDeviceBootstrapFixture({ audit: true });
  exactKeys(bootstrap, ['ok', 'contract', 'capabilities', 'summary', 'features'], 'ATTENDANCE_BOOTSTRAP');
  exactKeys(
    bootstrap.summary,
    ['siteCount', 'deviceCount', 'connectorCount', 'activeConnectorCount', 'rawEventCount', 'punchCount', 'unmatchedPunchCount', 'pendingReviewCount'],
    'ATTENDANCE_SUMMARY',
  );
  exactKeys(
    bootstrap.features,
    ['hardwareConnected', 'hoursCalculated', 'payrollPosted', 'biometricTemplatesStored'],
    'ATTENDANCE_FEATURES',
  );
  for (const item of buildAttendanceDeviceSiteFixtures()) {
    exactKeys(item, ['id', 'externalKey', 'label', 'addressText', 'timezone', 'latitude', 'longitude', 'geofenceRadiusM', 'networkEnabled', 'removableMediaEnabled', 'status', 'version'], 'ATTENDANCE_SITE');
  }
  for (const item of buildAttendanceDeviceEquipmentFixtures()) {
    exactKeys(item, ['id', 'siteId', 'externalKey', 'vendorKey', 'model', 'transport', 'driverKey', 'timezone', 'capabilities', 'status', 'version'], 'ATTENDANCE_DEVICE');
  }
  for (const item of buildAttendanceDeviceAuditFixtures()) {
    exactKeys(item, ['id', 'targetKind', 'targetId', 'actorKind', 'actorRole', 'command', 'occurredAt'], 'ATTENDANCE_AUDIT');
  }
}

async function verifyScenario(browser, baseUrl, viewport, accessProfile, screenshots) {
  const auditEnabled = accessProfile === 'auditor';
  const manageEnabled = accessProfile === 'manager';
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Mendoza',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const issues = [];
  const evidence = {
    authGets: 0,
    bootstrapGets: 0,
    listGets: new Map(),
    mutationPosts: 0,
    mutationPayload: null,
    unexpectedApi: 0,
  };
  const sites = buildAttendanceDeviceSiteFixtures();
  const devices = buildAttendanceDeviceEquipmentFixtures();
  const audit = buildAttendanceDeviceAuditFixtures();

  page.on('pageerror', (error) => issues.push(`pageerror: ${String(error?.message || error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`console: ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    issues.push(`requestfailed: ${new URL(request.url()).pathname} ${request.failure()?.errorText || ''}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) issues.push(`http-${response.status()}: ${new URL(response.url()).pathname}`);
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const clean = cleanRequest(request);
    if (clean.pathname === AUTH_PATH) {
      evidence.authGets += 1;
      validateAttendanceDeviceAuthRequest(clean);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'private, no-store, max-age=0' },
        body: JSON.stringify(buildAttendanceDeviceAuthFixture()),
      });
    }
    if (clean.pathname !== ATTENDANCE_PATH) {
      evidence.unexpectedApi += 1;
      return route.fulfill({
        status: 418,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code: 'UNEXPECTED_LOCAL_BROWSER_API' }),
      });
    }
    if (clean.method === 'POST') {
      if (!manageEnabled) {
        evidence.unexpectedApi += 1;
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, code: 'ATTENDANCE_DEVICE_MANAGE_FORBIDDEN' }),
        });
      }
      const payload = validateAttendanceDeviceMutationRequest(clean, request.postDataJSON());
      evidence.mutationPosts += 1;
      evidence.mutationPayload = payload;
      Object.assign(devices[0], payload, { version: 2 });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'private, no-store, max-age=0' },
        body: JSON.stringify({ ok: true, replayed: false, result: { id: payload.id, version: 2 } }),
      });
    }
    const { resource, page: requestedPage } = validateAttendanceDeviceApiRequest(clean);
    if (resource === 'bootstrap') {
      evidence.bootstrapGets += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'cache-control': 'private, no-store, max-age=0' },
        body: JSON.stringify(buildAttendanceDeviceBootstrapFixture({
          audit: auditEnabled,
          manage: manageEnabled,
        })),
      });
    }
    evidence.listGets.set(resource, (evidence.listGets.get(resource) || 0) + 1);
    let payload;
    if (resource === 'site') payload = pageEnvelope(resource, requestedPage, sites);
    else if (resource === 'device') payload = pageEnvelope(resource, requestedPage, devices);
    else if (resource === 'audit' && auditEnabled) payload = pageEnvelope(resource, requestedPage, audit);
    else if (resource === 'audit') {
      evidence.unexpectedApi += 1;
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code: 'ATTENDANCE_AUDIT_FORBIDDEN' }),
      });
    } else payload = emptyEnvelope(resource, requestedPage);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'cache-control': 'private, no-store, max-age=0' },
      body: JSON.stringify(payload),
    });
  });

  try {
    await page.goto(baseUrl + PAGE_PATH, { waitUntil: 'networkidle' });
    await page.locator('#appShell').waitFor({ state: 'visible' });
    await waitForResource(page, 'site', 'Puntos registrados');

    const authResponse = await page.evaluate(async () => {
      const response = await fetch('/api/internal-auth', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      return { status: response.status, authenticated: (await response.json()).authenticated };
    });
    assert.deepEqual(authResponse, { status: 200, authenticated: true }, 'ATTENDANCE_DEVICE_BROWSER_AUTH_FIXTURE_INVALID');

    assert.equal(await page.locator('#appShell h1').innerText(), 'Relojes y marcaciones');
    assert.equal(await page.locator('.inventory-details tbody tr').count(), 13, 'ATTENDANCE_DEVICE_BROWSER_REPORTED_POINTS_INVALID');
    assert.equal(await page.locator('#tableBody tr').count(), 13, 'ATTENDANCE_DEVICE_BROWSER_OPERATIONAL_POINTS_INVALID');
    assert.equal(await page.locator('#siteCount').innerText(), '13');
    assert.equal(await page.locator('#deviceCount').innerText(), '13');
    assert.equal(await page.locator('#hardwareState').innerText(), 'Sin conexión confirmada');
    assert.equal(await page.locator('#hardwareFeature').innerText(), 'No confirmado');
    assert.equal(await page.locator('#punchCount').innerText(), '0');
    assert.equal(await page.locator('#biometricFeature').innerText(), 'No se almacenan');
    assert.equal((await page.locator('body').innerText()).includes(FIXTURE.email), false, 'ATTENDANCE_DEVICE_BROWSER_FIXTURE_EMAIL_RENDERED');

    assert.equal(await page.locator('#tab-audit').isHidden(), !auditEnabled, 'ATTENDANCE_DEVICE_BROWSER_AUDIT_VISIBILITY_INVALID');
    assert.equal(await page.locator('[role="tab"]:visible').count(), auditEnabled ? 6 : 5, 'ATTENDANCE_DEVICE_BROWSER_TAB_COUNT_INVALID');

    await selectResource(page, 'device', 'Equipos registrados');
    assert.equal(await page.locator('#tableBody tr').count(), 13, 'ATTENDANCE_DEVICE_BROWSER_DEVICE_ROWS_INVALID');
    if (manageEnabled) {
      assert.equal(await page.getByRole('button', { name: /Registrar datos físicos de/ }).count(), 13,
        'ATTENDANCE_DEVICE_BROWSER_COMMISSIONING_BUTTONS_INVALID');
      await page.getByRole('button', { name: /Registrar datos físicos de/ }).first().click();
      await page.locator('#deviceDialog').waitFor({ state: 'visible' });
      await page.locator('#deviceSerialNumber').fill('K20-QA-0001');
      await page.locator('#deviceFirmwareVersion').fill('Ver 6.60 QA');
      await page.locator('#deviceProtocolKey').fill('ZKTeco-K20-QA');
      await page.locator('#deviceNetworkHost').fill('10.20.30.40');
      await page.locator('#deviceNetworkPort').fill('4370');
      await page.locator('#deviceDialogSubmit').click();
      await page.waitForFunction(() => document.querySelector('#operationTitle')?.textContent === 'Datos físicos registrados');
      await page.waitForFunction(() => document.querySelector('#resourcePanel')?.textContent?.includes('K20-QA-0001'));
      assert.equal(await page.locator('#deviceDialog').isVisible(), false,
        'ATTENDANCE_DEVICE_BROWSER_COMMISSIONING_DIALOG_OPEN');
      assert.equal(evidence.mutationPosts, 1, 'ATTENDANCE_DEVICE_BROWSER_COMMISSIONING_POST_COUNT_INVALID');
      assert.equal(evidence.mutationPayload?.protocolKey, 'zkteco-k20-qa',
        'ATTENDANCE_DEVICE_BROWSER_COMMISSIONING_PROTOCOL_NORMALIZATION_INVALID');
    } else {
      assert.equal(await page.getByRole('button', { name: /Registrar datos físicos de/ }).count(), 0,
        'ATTENDANCE_DEVICE_BROWSER_COMMISSIONING_AUTHORITY_LEAK');
    }

    for (const [resource, title, emptyTitle] of [
      ['connector', 'Conectores registrados', 'No hay conectores registrados'],
      ['punch', 'Marcaciones recibidas', 'No hay marcaciones recibidas'],
      ['batch', 'Lotes de ingesta', 'No hay lotes recibidos'],
    ]) {
      await selectResource(page, resource, title);
      await page.locator('#emptyState').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#emptyTitle').innerText(), emptyTitle, `ATTENDANCE_DEVICE_BROWSER_${resource.toUpperCase()}_EMPTY_INVALID`);
      assert.equal(await page.locator('#tableBody tr').count(), 0, `ATTENDANCE_DEVICE_BROWSER_${resource.toUpperCase()}_ROWS_INVALID`);
      assert.equal(await page.locator('#nextPage').isDisabled(), true, `ATTENDANCE_DEVICE_BROWSER_${resource.toUpperCase()}_NEXT_ENABLED`);
    }

    await page.locator('#tab-site').focus();
    await page.keyboard.press('End');
    if (auditEnabled) {
      await waitForResource(page, 'audit', 'Auditoría de control horario');
      await assertFocusVisibleAndUsable(page, 'tab-audit', 'ATTENDANCE_DEVICE_BROWSER_AUDIT_FOCUS');
      assert.equal(await page.locator('#tableBody tr').count(), PAGE_SIZE, 'ATTENDANCE_DEVICE_BROWSER_AUDIT_PAGE_ONE_ROWS_INVALID');
      assert.equal(await page.locator('#pageStatus').innerText(), 'Página 1 de 2 · 26 registros');
      const firstFullTargetId = audit[0].targetId;
      assert.equal((await page.locator('#resourcePanel').innerText()).includes(firstFullTargetId), false, 'ATTENDANCE_DEVICE_BROWSER_FULL_AUDIT_ID_RENDERED');
      await page.locator('#nextPage').click();
      await page.waitForFunction(() => document.querySelector('#pageStatus')?.textContent?.includes('Página 2 de 2'));
      assert.equal(await page.locator('#tableBody tr').count(), 1, 'ATTENDANCE_DEVICE_BROWSER_AUDIT_PAGE_TWO_ROWS_INVALID');
      assert.equal(await page.locator('#previousPage').isDisabled(), false, 'ATTENDANCE_DEVICE_BROWSER_AUDIT_PREVIOUS_DISABLED');
      await page.locator('#previousPage').click();
      await page.waitForFunction(() => document.querySelector('#pageStatus')?.textContent?.includes('Página 1 de 2'));
      assert.equal(await page.locator('#tableBody tr').count(), PAGE_SIZE, 'ATTENDANCE_DEVICE_BROWSER_AUDIT_RETURN_ROWS_INVALID');
    } else {
      await waitForResource(page, 'batch', 'Lotes de ingesta');
      await assertFocusVisibleAndUsable(page, 'tab-batch', 'ATTENDANCE_DEVICE_BROWSER_READER_END_FOCUS');
    }

    await page.locator('[role="tab"][aria-selected="true"]').focus();
    await page.keyboard.press('Home');
    await waitForResource(page, 'site', 'Puntos registrados');
    await assertFocusVisibleAndUsable(page, 'tab-site', 'ATTENDANCE_DEVICE_BROWSER_HOME_FOCUS');

    if (viewport.name === 'mobile') {
      await page.locator('#menuButton').click();
      assert.equal(await page.locator('#sidebar').getAttribute('data-open'), 'true');
      assert.equal(await page.locator('#workspace').getAttribute('inert'), '');
      await assertFocusVisibleAndUsable(page, 'menuClose', 'ATTENDANCE_DEVICE_BROWSER_MENU_CLOSE_FOCUS');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#sidebar').getAttribute('data-open'), 'false');
      assert.equal(await page.locator('#workspace').getAttribute('inert'), null);
      await assertFocusVisibleAndUsable(page, 'menuButton', 'ATTENDANCE_DEVICE_BROWSER_MENU_RESTORE_FOCUS');
    } else {
      assert.equal(await page.locator('#menuButton').isHidden(), true, 'ATTENDANCE_DEVICE_BROWSER_DESKTOP_MENU_VISIBLE');
    }

    await assertNoHorizontalOverflow(page, `ATTENDANCE_DEVICE_BROWSER_${viewport.name.toUpperCase()}_OVERFLOW`);
    assert.equal(evidence.authGets, 1, 'ATTENDANCE_DEVICE_BROWSER_AUTH_GET_COUNT_INVALID');
    assert.equal(evidence.bootstrapGets, manageEnabled ? 2 : 1,
      'ATTENDANCE_DEVICE_BROWSER_BOOTSTRAP_GET_COUNT_INVALID');
    for (const resource of ['site', 'device', 'connector', 'punch', 'batch']) {
      assert.ok((evidence.listGets.get(resource) || 0) >= 1, `ATTENDANCE_DEVICE_BROWSER_${resource.toUpperCase()}_NOT_VISITED`);
    }
    assert.equal((evidence.listGets.get('audit') || 0) >= 1, auditEnabled, 'ATTENDANCE_DEVICE_BROWSER_AUDIT_REQUEST_SCOPE_INVALID');
    assert.equal(evidence.mutationPosts, manageEnabled ? 1 : 0,
      'ATTENDANCE_DEVICE_BROWSER_MUTATION_SCOPE_INVALID');
    assert.equal(evidence.unexpectedApi, 0, 'ATTENDANCE_DEVICE_BROWSER_UNEXPECTED_API');
    assert.deepEqual(issues, [], `ATTENDANCE_DEVICE_BROWSER_RUNTIME_ISSUES_${JSON.stringify(issues)}`);

    if (auditEnabled) {
      await page.evaluate(() => scrollTo(0, 0));
      const screenshot = path.join(os.tmpdir(), `municontrol-attendance-devices-${viewport.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      screenshots.push(screenshot);
    }
  } finally {
    await context.close();
  }
}

export function buildAttendanceDeviceBrowserSummary() {
  return Object.freeze({
    ok: true,
    viewportsVerified: 2,
    accessProfilesVerified: 3,
    scenariosVerified: 6,
    reportedPointsVerified: 13,
    apiFullyIntercepted: true,
    databaseMutations: false,
    hardwareConnected: false,
    auditCapabilityScoped: true,
    paginationVerified: true,
    emptyStatesVerified: true,
    consoleErrors: 0,
    horizontalOverflow: false,
    focusRestored: true,
    deviceCommissioningVerified: true,
    screenshotsCaptured: 2,
  });
}

export function buildAttendanceDeviceBrowserFailure() {
  return Object.freeze({ ok: false, code: 'ATTENDANCE_DEVICE_BROWSER_VERIFICATION_FAILED' });
}

export async function runAttendanceDeviceBrowserVerification() {
  assertExactFixtureContracts();
  const server = await startAttendanceDeviceBrowserServer();
  const browser = await chromium.launch({ headless: true });
  const screenshots = [];
  try {
    for (const viewport of ATTENDANCE_DEVICE_BROWSER_VIEWPORTS) {
      for (const accessProfile of ['reader', 'auditor', 'manager']) {
        await verifyScenario(browser, server.baseUrl, viewport, accessProfile, screenshots);
      }
    }
    assert.equal(screenshots.length, 2, 'ATTENDANCE_DEVICE_BROWSER_SCREENSHOT_COUNT_INVALID');
    return buildAttendanceDeviceBrowserSummary();
  } finally {
    await browser.close();
    await server.close();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    process.stdout.write(`${JSON.stringify(await runAttendanceDeviceBrowserVerification())}\n`);
  } catch {
    process.stderr.write(`${JSON.stringify(buildAttendanceDeviceBrowserFailure())}\n`);
    process.exitCode = 1;
  }
}
