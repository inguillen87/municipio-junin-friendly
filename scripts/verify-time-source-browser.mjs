import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

export const TIME_SOURCE_BROWSER_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop-mendoza', width: 1440, height: 900, timezoneId: 'America/Argentina/Mendoza' }),
  Object.freeze({ name: 'desktop-utc', width: 1280, height: 800, timezoneId: 'UTC' }),
  Object.freeze({ name: 'mobile-asia', width: 390, height: 844, timezoneId: 'Asia/Tokyo' }),
]);

const PAGE_PATH = '/fuentes-tiempo.html';
const AUTH_PATH = '/api/internal-auth';
const ACTIONS_PATH = '/api/internal-actions';
const SOURCE_ID = 'a1000000-0000-4000-8000-000000000001';
const PII_SENTINEL = 'PII_SENTINEL_MUST_NOT_RENDER';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanBaseUrl(rawValue) {
  let parsed;
  try { parsed = new URL(rawValue); } catch { throw new Error('TIME_SOURCE_BROWSER_BASE_URL_INVALID'); }
  assert.equal(parsed.protocol, 'http:', 'TIME_SOURCE_BROWSER_REQUIRES_LOCAL_HTTP');
  assert.ok(new Set(['127.0.0.1', 'localhost', '[::1]']).has(parsed.hostname.toLowerCase()), 'TIME_SOURCE_BROWSER_REQUIRES_LOOPBACK');
  assert.equal(parsed.username, '', 'TIME_SOURCE_BROWSER_URL_CREDENTIALS_FORBIDDEN');
  assert.equal(parsed.password, '', 'TIME_SOURCE_BROWSER_URL_CREDENTIALS_FORBIDDEN');
  assert.ok(parsed.pathname === '/' || parsed.pathname === '', 'TIME_SOURCE_BROWSER_URL_PATH_FORBIDDEN');
  assert.equal(parsed.search, '', 'TIME_SOURCE_BROWSER_URL_QUERY_FORBIDDEN');
  assert.equal(parsed.hash, '', 'TIME_SOURCE_BROWSER_URL_HASH_FORBIDDEN');
  return parsed.origin;
}

export function loadTimeSourceBrowserConfig(env = process.env) {
  return Object.freeze({ baseUrl: cleanBaseUrl(env.BASE_URL || 'http://127.0.0.1:3100') });
}

export function buildTimeSourceAuthFixture() {
  return {
    ok: true,
    authenticated: true,
    sessionVersion: 2,
    user: { id: 'b1000000-0000-4000-8000-000000000002', name: 'Proponente temporal QA', role: 'JUNIN_TIEMPO_FUENTES_PROPONENTE' },
    access: { context: 'tenant', tenant: { id: 'c1000000-0000-4000-8000-000000000003', name: 'Tenant QA' } },
    authentication: { level: 'mfa', mfaVerified: true },
  };
}

export function buildTimeSourceReadinessFixture() {
  return {
    catalogApproved: false,
    evaluationReady: false,
    attendanceReconciled: false,
    payrollCalculated: false,
    payrollPosted: false,
    grhMutation: false,
    requirements: [
      { key: 'shiftAssignment', governanceStatus: 'missing', readinessState: 'missing' },
      { key: 'timePunches', governanceStatus: 'missing', readinessState: 'missing' },
      { key: 'holidayCalendar', domain: 'holiday_calendar', governanceStatus: 'draft', readinessState: 'registered_metadata', approvedMetadata: false },
      { key: 'municipalRuleProfile', governanceStatus: 'missing', readinessState: 'missing' },
      { key: 'administrativeEvents', domain: 'administrative_event', governanceStatus: 'approved', readinessState: 'partial_reference', approvedMetadata: true, metadata: { cutAt: '2099-01-01T00:00:00Z', coverageFrom: '2098-01-01', coverageTo: '2099-01-01', recordCount: 12 } },
    ],
  };
}

export function buildTimeSourceFixture() {
  return {
    id: SOURCE_ID,
    domain: 'holiday_calendar',
    status: 'draft',
    version: 1,
    ownerAuthority: 'municipal_it',
    format: 'csv',
    schemaVersion: 'v1',
    artifactSha256: 'a'.repeat(64),
    cutAt: '2099-01-01T00:00:00.000Z',
    coverageFrom: '2099-01-01',
    coverageTo: '2099-12-31',
    timezone: 'America/Argentina/Mendoza',
    grain: 'calendar_day',
    identityKeyKind: 'calendar_date',
    recordCount: 365,
    allowedCommands: ['submit', 'cancel'],
  };
}

export function buildTimeSourceBootstrapFixture() {
  const readiness = buildTimeSourceReadinessFixture();
  return {
    ok: true,
    contract: { version: 'time-source-contract.v1' },
    feature: {
      governanceStatus: 'metadata_intake',
      canPropose: true,
      canApprove: false,
      canAudit: false,
      catalogApproved: readiness.catalogApproved,
      evaluationReady: false,
      attendanceReconciled: false,
      payrollCalculated: false,
      payrollPosted: false,
      grhMutation: false,
    },
    options: {
      domains: Object.entries({ shift_assignment: 'Turnos asignados', time_punch: 'Fichadas', holiday_calendar: 'Calendario y feriados', municipal_rule_profile: 'Reglas municipales', administrative_event: 'Eventos administrativos', employment_master_reference: 'Carga nominal de referencia' }).map(([key, label]) => ({ key, label })),
      statuses: ['draft', 'submitted', 'approved', 'rejected', 'retired', 'cancelled'],
      formats: ['csv', 'json', 'jsonl', 'parquet', 'postgres_relation', 'fixed_width'],
      ownerAuthorities: [
        { key: 'municipal_human_resources', label: 'Recursos Humanos municipal' },
        { key: 'municipal_it', label: 'Tecnología municipal' },
        { key: 'municipal_payroll', label: 'Liquidación de haberes municipal' },
        { key: 'provincial_authority', label: 'Autoridad provincial' },
        { key: 'national_authority', label: 'Autoridad nacional' },
        { key: 'certified_external_provider', label: 'Proveedor externo certificado' },
      ],
      reasonCodes: [
        { key: 'source_onboarding', label: 'Registro inicial', command: 'create_draft' },
        { key: 'metadata_correction', label: 'Corrección de metadatos', command: 'update_draft' },
      ],
    },
    readiness: readiness.requirements,
    allowedCommands: ['create_draft'],
  };
}

export function expectedTimeSourceCreateBody() {
  return {
    caseType: 'time_source_contract',
    command: 'create_draft',
    expectedVersion: 0,
    payload: {
      domain: 'holiday_calendar',
      ownerAuthority: 'municipal_it',
      format: 'csv',
      schemaVersion: 'v2',
      artifactSha256: 'b'.repeat(64),
      cutAt: '2099-02-01T15:30:00Z',
      coverageFrom: '2099-01-01',
      coverageTo: '2099-12-31',
      timezone: 'America/Argentina/Mendoza',
      grain: 'calendar_day',
      identityKeyKind: 'calendar_date',
      recordCount: 365,
      reasonCode: 'source_onboarding',
      reason: 'Registro contractual QA',
    },
  };
}

export function expectedTimeSourceUpdateBody() {
  return {
    caseType: 'time_source_contract',
    command: 'update_draft',
    contractId: SOURCE_ID,
    expectedVersion: 1,
    payload: {
      domain: 'holiday_calendar',
      ownerAuthority: 'municipal_human_resources',
      format: 'csv',
      schemaVersion: 'v1',
      artifactSha256: 'a'.repeat(64),
      cutAt: '2099-01-01T00:00:00Z',
      coverageFrom: '2099-01-01',
      coverageTo: '2099-12-31',
      timezone: 'America/Argentina/Mendoza',
      grain: 'calendar_day',
      identityKeyKind: 'calendar_date',
      recordCount: 365,
      reasonCode: 'metadata_correction',
      reason: 'Corrección contractual QA',
    },
  };
}

export function validateTimeSourceCreateRequest(request) {
  assert.equal(request.method, 'POST', 'TIME_SOURCE_BROWSER_CREATE_METHOD_INVALID');
  assert.equal(request.pathname, ACTIONS_PATH, 'TIME_SOURCE_BROWSER_CREATE_PATH_INVALID');
  assert.equal(request.search, '', 'TIME_SOURCE_BROWSER_CREATE_QUERY_FORBIDDEN');
  assert.equal(request.headers.accept, 'application/json', 'TIME_SOURCE_BROWSER_CREATE_ACCEPT_INVALID');
  assert.equal(request.headers['content-type'], 'application/json', 'TIME_SOURCE_BROWSER_CREATE_CONTENT_TYPE_INVALID');
  assert.match(request.headers['idempotency-key'] || '', UUID_V4, 'TIME_SOURCE_BROWSER_CREATE_IDEMPOTENCY_INVALID');
  assert.deepEqual(request.body, expectedTimeSourceCreateBody());
  assert.equal(request.headers.authorization, undefined, 'TIME_SOURCE_BROWSER_CREATE_AUTHORIZATION_FORBIDDEN');
  assert.equal(request.headers.cookie, undefined, 'TIME_SOURCE_BROWSER_CREATE_COOKIE_CAPTURE_FORBIDDEN');
  assert.doesNotMatch(JSON.stringify(request.body), /PII_SENTINEL|@|password|secret|token|https?:\/\//i);
  return true;
}

export function validateTimeSourceUpdateRequest(request) {
  assert.equal(request.method, 'PATCH', 'TIME_SOURCE_BROWSER_UPDATE_METHOD_INVALID');
  assert.equal(request.pathname, ACTIONS_PATH, 'TIME_SOURCE_BROWSER_UPDATE_PATH_INVALID');
  assert.equal(request.search, '', 'TIME_SOURCE_BROWSER_UPDATE_QUERY_FORBIDDEN');
  assert.equal(request.headers.accept, 'application/json', 'TIME_SOURCE_BROWSER_UPDATE_ACCEPT_INVALID');
  assert.equal(request.headers['content-type'], 'application/json', 'TIME_SOURCE_BROWSER_UPDATE_CONTENT_TYPE_INVALID');
  assert.match(request.headers['idempotency-key'] || '', UUID_V4, 'TIME_SOURCE_BROWSER_UPDATE_IDEMPOTENCY_INVALID');
  assert.deepEqual(request.body, expectedTimeSourceUpdateBody());
  assert.equal(request.headers.authorization, undefined, 'TIME_SOURCE_BROWSER_UPDATE_AUTHORIZATION_FORBIDDEN');
  assert.equal(request.headers.cookie, undefined, 'TIME_SOURCE_BROWSER_UPDATE_COOKIE_CAPTURE_FORBIDDEN');
  assert.doesNotMatch(JSON.stringify(request.body), /PII_SENTINEL|@|password|secret|token|https?:\/\//i);
  return true;
}

async function assertNoHorizontalOverflow(page) {
  const evidence = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const offenders = Array.from(document.querySelectorAll('body *')).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.right > viewportWidth + 1 || rect.left < -1;
    }).slice(0, 8).map((node) => ({ tag: node.tagName.toLowerCase(), id: node.id || '', className: typeof node.className === 'string' ? node.className : '' }));
    return { overflow: document.documentElement.scrollWidth - viewportWidth, offenders };
  });
  assert.ok(evidence.overflow <= 1, `TIME_SOURCE_BROWSER_HORIZONTAL_OVERFLOW_${evidence.overflow}_${JSON.stringify(evidence.offenders)}`);
}

async function assertStorageEmpty(page) {
  const storage = await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));
  assert.deepEqual(storage, { local: [], session: [] }, 'TIME_SOURCE_BROWSER_STORAGE_NOT_EMPTY');
}

function cleanRequest(request) {
  const url = new URL(request.url());
  const headers = request.headers();
  let body = {};
  try { body = request.postDataJSON(); } catch { body = {}; }
  return { method: request.method(), pathname: url.pathname, search: url.search, headers, body };
}

async function verifyViewport(browser, config, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    timezoneId: viewport.timezoneId,
  });
  const page = await context.newPage();
  const evidence = { authGets: 0, bootstrapGets: 0, listGets: 0, detailGets: 0, createRequests: [], updateRequests: [], unexpectedApi: 0 };
  const runtimeErrors = [];
  page.on('pageerror', (error) => runtimeErrors.push(String(error && error.message || error)));
  page.on('console', (message) => { if (message.type() === 'error') runtimeErrors.push(message.text()); });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === AUTH_PATH && request.method() === 'GET') {
      evidence.authGets += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildTimeSourceAuthFixture()) });
    }
    if (url.pathname === AUTH_PATH && request.method() === 'DELETE') return route.fulfill({ status: 204, body: '' });
    if (url.pathname !== ACTIONS_PATH) {
      evidence.unexpectedApi += 1;
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'UNEXPECTED_API' }) });
    }
    if (request.method() === 'GET') {
      assert.equal(url.searchParams.get('caseType'), 'time_source_contract');
      const resource = url.searchParams.get('resource');
      if (resource === 'bootstrap') {
        evidence.bootstrapGets += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(buildTimeSourceBootstrapFixture()) });
      }
      if (resource === 'list') {
        evidence.listGets += 1;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: [buildTimeSourceFixture()], pagination: { page: 1, hasNext: false } }) });
      }
      if (resource === 'detail') {
        evidence.detailGets += 1;
        assert.equal(url.searchParams.get('id'), SOURCE_ID);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: buildTimeSourceFixture(), timeline: [{ command: 'create_draft', resultingVersion: 1, reasonCode: 'source_onboarding', occurredAt: '2099-01-01T00:00:00Z', actorEmail: PII_SENTINEL, reasonHash: 'c'.repeat(64) }], timelineTruncated: false, timelineLimit: 100, auditAvailable: true, allowedCommands: ['update_draft', 'submit', 'cancel'] }) });
      }
    }
    if (request.method() === 'POST') {
      const clean = cleanRequest(request);
      evidence.createRequests.push(clean);
      validateTimeSourceCreateRequest(clean);
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, replayed: false, source: { ...buildTimeSourceFixture(), id: 'd1000000-0000-4000-8000-000000000004' } }) });
    }
    if (request.method() === 'PATCH') {
      const clean = cleanRequest(request);
      evidence.updateRequests.push(clean);
      validateTimeSourceUpdateRequest(clean);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, replayed: false, data: { ...buildTimeSourceFixture(), ownerAuthority: 'Autoridad QA actualizada', version: 2 } }) });
    }
    evidence.unexpectedApi += 1;
    return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ code: 'UNEXPECTED_API_METHOD' }) });
  });

  try {
    await page.goto(config.baseUrl + PAGE_PATH, { waitUntil: 'domcontentloaded' });
    await page.locator('h1').getByText('Tiempo y marcaciones').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.requirement').count(), 5, 'TIME_SOURCE_BROWSER_REQUIREMENTS_INVALID');
    assert.equal(await page.locator('#evaluationReady').innerText(), 'No');
    assert.equal(await page.locator('#payrollCalculated').innerText(), 'No');
    assert.equal(await page.locator('#grhMutation').innerText(), 'No');
    assert.equal(await page.locator('#createButton').isDisabled(), false, 'TIME_SOURCE_BROWSER_CREATE_CLOSED');
    await page.locator('#sourceRows tr').first().waitFor({ state: 'visible' });
    const renderedText = await page.locator('body').innerText();
    assert.equal(renderedText.includes(PII_SENTINEL), false, 'TIME_SOURCE_BROWSER_PII_RENDERED');
    assert.match(renderedText, /01\/01\/2099\s*→\s*31\/12\/2099/, 'TIME_SOURCE_BROWSER_CIVIL_DATE_DRIFT');
    assert.match(renderedText, /31\/12\/2098 21:00 ART/, 'TIME_SOURCE_BROWSER_MENDOZA_INSTANT_DRIFT');
    await assertNoHorizontalOverflow(page);

    await page.locator('#createButton').click();
    await page.locator('#sourceDialog').waitFor({ state: 'visible' });
    await page.locator('#sourceDomain').selectOption('holiday_calendar');
    await page.locator('#ownerAuthority').selectOption('municipal_it');
    await page.locator('#sourceFormat').selectOption('csv');
    await page.locator('#schemaVersion').fill('v2');
    await page.locator('#artifactSha256').fill('b'.repeat(64));
    await page.locator('#cutAt').fill('2099-02-01T15:30:00Z');
    await page.locator('#coverageFrom').fill('2099-01-01');
    await page.locator('#coverageTo').fill('2099-12-31');
    await page.locator('#sourceGrain').selectOption('calendar_day');
    await page.locator('#identityKeyKind').selectOption('calendar_date');
    await page.locator('#recordCount').fill('365');
    await page.locator('#sourceReasonCode').selectOption('source_onboarding');
    await page.locator('#sourceReason').fill('Registro contractual QA');
    const post = page.waitForRequest((request) => request.method() === 'POST' && new URL(request.url()).pathname === ACTIONS_PATH);
    await page.locator('#saveSource').click();
    await post;
    await page.locator('#toastRegion').getByText('Borrador de fuente creado. No habilita cálculos.').waitFor({ state: 'visible' });
    assert.equal(evidence.createRequests.length, 1, 'TIME_SOURCE_BROWSER_CREATE_COUNT_INVALID');
    assert.ok(evidence.bootstrapGets >= 2, 'TIME_SOURCE_BROWSER_READINESS_NOT_REFRESHED');
    assert.ok(evidence.listGets >= 1, 'TIME_SOURCE_BROWSER_LIST_NOT_REFRESHED');
    await page.locator('#sourceRows button[data-source-id]').first().click();
    await page.locator('#detailDialog').waitFor({ state: 'visible' });
    await page.locator('#detailTimeline').getByText('Borrador creado').waitFor({ state: 'visible' });
    assert.equal((await page.locator('#detailTimeline').innerText()).includes(PII_SENTINEL), false, 'TIME_SOURCE_BROWSER_TIMELINE_PII_RENDERED');
    assert.equal((await page.locator('#detailTimeline').innerText()).includes('cccccccc'), false, 'TIME_SOURCE_BROWSER_TIMELINE_HASH_RENDERED');
    await page.locator('#detailActions button[data-command="update_draft"]').click();
    await page.locator('#sourceDialog').waitFor({ state: 'visible' });
    await page.locator('#ownerAuthority').selectOption('municipal_human_resources');
    await page.locator('#sourceReasonCode').selectOption('metadata_correction');
    await page.locator('#sourceReason').fill('Corrección contractual QA');
    const patchRequest = page.waitForRequest((request) => request.method() === 'PATCH' && new URL(request.url()).pathname === ACTIONS_PATH);
    await page.locator('#saveSource').click();
    await patchRequest;
    await page.locator('#toastRegion').getByText('Metadatos actualizados con nueva versión.').waitFor({ state: 'visible' });
    assert.equal(evidence.updateRequests.length, 1, 'TIME_SOURCE_BROWSER_UPDATE_COUNT_INVALID');
    assert.equal(evidence.unexpectedApi, 0, 'TIME_SOURCE_BROWSER_UNEXPECTED_API');
    await assertNoHorizontalOverflow(page);
    await assertStorageEmpty(page);
    const current = new URL(page.url());
    assert.equal(current.pathname, PAGE_PATH);
    assert.equal(current.search, '');
    assert.equal(current.hash, '');
    assert.deepEqual(runtimeErrors, [], 'TIME_SOURCE_BROWSER_RUNTIME_ERRORS');
  } finally {
    await context.close();
  }
}

export function buildTimeSourceBrowserSummary() {
  return Object.freeze({ ok: true, viewportsVerified: TIME_SOURCE_BROWSER_VIEWPORTS.length, apiFullyIntercepted: true, databaseMutations: false, createRequestsVerified: TIME_SOURCE_BROWSER_VIEWPORTS.length, updateRequestsVerified: TIME_SOURCE_BROWSER_VIEWPORTS.length, piiRendered: false, browserStorageEmpty: true, evaluationReady: false });
}

export function buildTimeSourceBrowserFailure() {
  return Object.freeze({ ok: false, code: 'TIME_SOURCE_BROWSER_VERIFICATION_FAILED' });
}

export async function runTimeSourceBrowserVerification(config = loadTimeSourceBrowserConfig()) {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of TIME_SOURCE_BROWSER_VIEWPORTS) await verifyViewport(browser, config, viewport);
    return buildTimeSourceBrowserSummary();
  } finally { await browser.close(); }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try { process.stdout.write(JSON.stringify(await runTimeSourceBrowserVerification()) + '\n'); }
  catch { process.stderr.write(JSON.stringify(buildTimeSourceBrowserFailure()) + '\n'); process.exitCode = 1; }
}
