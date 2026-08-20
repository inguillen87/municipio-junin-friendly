import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedFiles = new Map([
  ['/login.html', 'login.html'],
  ['/activar-cuenta.html', 'activar-cuenta.html'],
  ['/seguridad-cuenta.html', 'seguridad-cuenta.html'],
  ['/assets/identity-security.css', 'assets/identity-security.css'],
]);

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0' });
  res.end(JSON.stringify(payload));
}

async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

let selectedContextPayload = null;
const activationRequests = [];
const loginEnrollmentRequests = [];
const recoveryRequests = [];
const lockoutRequests = [];
const securityEnrollmentRequests = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/internal-identity') {
    if (req.method === 'GET' && url.searchParams.get('resource') === 'bootstrap') {
      return json(res, 200, {
        ok: true,
        user: { displayName: 'Cuenta QA', email: 'cuenta@example.invalid' },
        security: { sessionRegistryReady: true, mfaRequired: true, mfaEnrolled: false, recoveryCodesRemaining: 0 },
        access: { platformRoles: ['PLATFORM_OWNER'], tenant: { id: 'tenant-qa', slug: 'municipio-qa', membershipId: 'membership-qa', roleKey: 'TENANT_ADMIN', capabilities: ['platform.users.manage', 'tenant.audit.read'] }, source: 'identity-policy' },
      });
    }
    if (req.method === 'GET' && url.searchParams.get('resource') === 'sessions') {
      return json(res, 200, {
        ok: true,
        security: { sessionRegistryReady: true, mfaRequired: true, mfaEnrolled: false, recoveryCodesRemaining: 0 },
        sessions: [{ id: 'session-qa', version: 1, current: true, device: 'Navegador de escritorio', ipApprox: 'Red institucional', createdAt: '2026-08-20T12:00:00Z', lastSeenAt: '2026-08-20T12:10:00Z', expiresAt: '2026-08-20T20:00:00Z', status: 'active' }],
      });
    }
    if (req.method !== 'POST') return json(res, 405, { code: 'METHOD_NOT_ALLOWED' });
    const request = await body(req);
    if (request.command === 'begin_activation') return json(res, 200, { flowToken: 'memory-only-flow', expectedVersion: 1, expiresAt: '2026-08-20T20:00:00Z', requiresMfa: true, mfaEnrollment: { manualKey: 'QA-MANUAL-KEY', otpauthUri: 'redacted' } });
    if (request.command === 'complete_activation') {
      activationRequests.push({ version: request.expectedVersion, key: req.headers['idempotency-key'] });
      if (activationRequests.length === 1) return json(res, 401, { ok: false, code: 'IDENTITY_MFA_INVALID', error: 'Codigo invalido', expectedVersion: 2, remainingAttempts: 4 });
      if (request.expectedVersion !== 2 || req.headers['idempotency-key'] === activationRequests[0].key) return json(res, 409, { ok: false, code: 'IDENTITY_VERSION_CONFLICT' });
      return json(res, 201, { ok: true, recoveryCodes: ['QA-RECOVERY-01', 'QA-RECOVERY-02'] });
    }
    if (request.command === 'login') return json(res, 202, { ok: true, code: 'CONTEXT_REQUIRED', flowToken: 'memory-only-context-flow', expectedVersion: 1, expiresAt: '2026-08-20T20:00:00Z', contexts: [{ kind: 'platform', label: 'Administración de plataforma' }, { kind: 'tenant', tenantId: 'tenant-junin-qa', tenantSlug: 'municipio-junin', tenantName: 'Municipalidad de Junín', source: 'membership' }] });
    if (request.command === 'select_context') {
      selectedContextPayload = request.payload.context;
      if (request.payload.context.kind === 'platform') return json(res, 202, { ok: true, code: 'MFA_REQUIRED', challenge: { flowToken: 'memory-only-login-flow', expectedVersion: 2, expiresAt: '2026-08-20T20:00:00Z' } });
      return json(res, 202, { ok: true, code: 'MFA_ENROLLMENT_REQUIRED', flow: { flowToken: 'memory-only-login-enrollment', expectedVersion: 2, expiresAt: '2026-08-20T20:00:00Z' }, mfaEnrollment: { manualKey: 'QA-LOGIN-MFA-KEY', otpauthUri: 'redacted' } });
    }
    if (request.command === 'complete_login_mfa_enrollment') {
      loginEnrollmentRequests.push({ version: request.expectedVersion, key: req.headers['idempotency-key'] });
      if (loginEnrollmentRequests.length === 1) return json(res, 401, { ok: false, code: 'IDENTITY_MFA_INVALID', error: 'Codigo invalido', expectedVersion: 3, remainingAttempts: 4 });
      if (request.expectedVersion !== 3 || req.headers['idempotency-key'] === loginEnrollmentRequests[0].key) return json(res, 409, { ok: false, code: 'IDENTITY_VERSION_CONFLICT' });
      return json(res, 200, { ok: true, session: { name: 'Cuenta QA', email: 'cuenta@example.invalid' }, recoveryCodes: ['QA-LOGIN-RECOVERY-01', 'QA-LOGIN-RECOVERY-02'] });
    }
    if (request.command === 'recover_mfa') {
      recoveryRequests.push({ version: request.expectedVersion, key: req.headers['idempotency-key'] });
      if (recoveryRequests.length === 1) return json(res, 401, { ok: false, code: 'IDENTITY_MFA_INVALID', error: 'Codigo invalido', expectedVersion: 3, remainingAttempts: 4 });
      if (request.expectedVersion !== 3 || req.headers['idempotency-key'] === recoveryRequests[0].key) return json(res, 409, { ok: false, code: 'IDENTITY_VERSION_CONFLICT' });
      return json(res, 200, { ok: true, user: { name: 'Cuenta QA', email: 'cuenta@example.invalid' } });
    }
    if (request.command === 'verify_mfa') {
      lockoutRequests.push({ version: request.expectedVersion, key: req.headers['idempotency-key'] });
      if (request.payload.totpCode === '999999') return json(res, 423, { ok: false, code: 'IDENTITY_FLOW_LOCKED', expectedVersion: 3, remainingAttempts: 0 });
      return json(res, 200, { ok: true, user: { name: 'Cuenta QA', email: 'cuenta@example.invalid' } });
    }
    if (request.command === 'begin_mfa_enrollment') return json(res, 200, { flowToken: 'memory-only-enrollment', expectedVersion: 1, expiresAt: '2026-08-20T20:00:00Z', mfaEnrollment: { manualKey: 'QA-ACCOUNT-MFA-KEY', otpauthUri: 'redacted' } });
    if (request.command === 'complete_mfa_enrollment') {
      securityEnrollmentRequests.push({ version: request.expectedVersion, key: req.headers['idempotency-key'] });
      if (securityEnrollmentRequests.length === 1) return json(res, 401, { ok: false, code: 'IDENTITY_MFA_INVALID', error: 'Codigo invalido', expectedVersion: 2, remainingAttempts: 4 });
      if (request.expectedVersion !== 2 || req.headers['idempotency-key'] === securityEnrollmentRequests[0].key) return json(res, 409, { ok: false, code: 'IDENTITY_VERSION_CONFLICT' });
      return json(res, 200, { ok: true, recoveryCodes: ['QA-RECOVERY-01', 'QA-RECOVERY-02'] });
    }
    if (request.command === 'revoke_session' || request.command === 'logout') return json(res, 200, { ok: true });
    return json(res, 400, { code: 'COMMAND_UNSUPPORTED' });
  }

  if (url.pathname === '/sw.js' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end("self.addEventListener('fetch', function () {});");
  }

  if (url.pathname === '/internal-dashboard.html' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('<!doctype html><html><body><h1>Portal interno QA</h1></body></html>');
  }

  const relative = allowedFiles.get(url.pathname);
  if (!relative || req.method !== 'GET') { res.writeHead(404); return res.end('Not found'); }
  const content = fs.readFileSync(path.join(root, relative));
  res.writeHead(200, {
    'Content-Type': relative.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8',
    'Cache-Control': 'private, no-store, max-age=0',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
  });
  res.end(content);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const errors = [];
const screenshots = [];

async function pageFor(viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console:${message.text()}`); });
  page.on('pageerror', (error) => errors.push(`page:${error.message}`));
  return { context, page };
}

try {
  {
    const { context, page } = await pageFor({ width: 1440, height: 1000 });
    await page.goto(`${origin}/activar-cuenta.html`, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#activationTitle').innerText(), 'Activar cuenta institucional');
    assert.equal(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth), true);
    await page.locator('#invitationCode').fill('QA-CODE-ONLY-IN-MEMORY');
    await page.locator('#verifyCodeButton').click();
    await page.locator('#credentialsForm').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#manualMfaKey').innerText(), 'QA-MANUAL-KEY');
    assert.equal(page.url(), `${origin}/activar-cuenta.html`);
    assert.deepEqual(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })), { local: [], session: [] });
    const file = path.join(os.tmpdir(), 'municontrol-activation-desktop.png');
    await page.screenshot({ path: file, fullPage: true }); screenshots.push(file);
    await page.locator('#newPassword').fill('QA password only 2026');
    await page.locator('#confirmPassword').fill('QA password only 2026');
    await page.locator('#activationTotp').fill('000000');
    await page.locator('#completeActivationButton').click();
    await page.locator('#activationError').waitFor({ state: 'visible' });
    assert.match(await page.locator('#activationError').innerText(), /Quedan 4 intentos/);
    await page.locator('#newPassword').fill('QA password only 2026');
    await page.locator('#confirmPassword').fill('QA password only 2026');
    await page.locator('#activationTotp').fill('123456');
    await page.locator('#completeActivationButton').click();
    await page.locator('#recoverySection').waitFor({ state: 'visible' });
    assert.deepEqual(activationRequests.map((item) => item.version), [1, 2]);
    assert.notEqual(activationRequests[0].key, activationRequests[1].key);
    await context.close();
  }
  {
    const { context, page } = await pageFor({ width: 390, height: 844 });
    await page.goto(`${origin}/login.html`, { waitUntil: 'networkidle' });
    await page.locator('#emailInput').fill('cuenta@example.invalid');
    await page.locator('#passInput').fill('QA password only');
    await page.locator('#btnLogin').click();
    await page.locator('#contextStep').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#contextOptions input').count(), 2);
    assert.equal(await page.locator('#contextOptions input:checked').count(), 0);
    assert.match(await page.locator('#contextOptions').innerText(), /Administración de plataforma/);
    assert.match(await page.locator('#contextOptions').innerText(), /Municipalidad de Junín/);
    const contextScreenshot = path.join(os.tmpdir(), 'municontrol-context-mobile.png');
    await page.screenshot({ path: contextScreenshot, fullPage: false }); screenshots.push(contextScreenshot);
    await page.locator('#contextOptions input').nth(1).check();
    await page.locator('#continueContextButton').click();
    await page.waitForTimeout(500);
    await page.locator('#loginEnrollmentStep').waitFor({ state: 'visible' });
    assert.deepEqual(selectedContextPayload, { kind: 'tenant', tenantId: 'tenant-junin-qa' });
    assert.equal(await page.locator('#loginManualMfaKey').innerText(), 'QA-LOGIN-MFA-KEY');
    assert.equal(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth), true);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).length), 0);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some((key) => /flow|token|mfa/i.test(key))), false);
    await page.locator('#loginEnrollmentTotp').fill('000000');
    await page.locator('#completeEnrollmentButton').click();
    await page.locator('#errorMsg').waitFor({ state: 'visible' });
    assert.match(await page.locator('#errorMsg').innerText(), /Quedan 4 intentos/);
    await page.locator('#loginEnrollmentTotp').fill('123456');
    await page.locator('#completeEnrollmentButton').click();
    await page.locator('#loginRecoveryStep').waitFor({ state: 'visible' });
    assert.match(await page.locator('#loginRecoveryCodes').innerText(), /QA-LOGIN-RECOVERY-01/);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some((key) => /recovery|flow|token|mfa/i.test(key))), false);
    const enrollmentScreenshot = path.join(os.tmpdir(), 'municontrol-login-enrollment-mobile.png');
    await page.screenshot({ path: enrollmentScreenshot, fullPage: false }); screenshots.push(enrollmentScreenshot);
    assert.deepEqual(loginEnrollmentRequests.map((item) => item.version), [2, 3]);
    assert.notEqual(loginEnrollmentRequests[0].key, loginEnrollmentRequests[1].key);
    await context.close();
  }
  {
    const { context, page } = await pageFor({ width: 390, height: 844 });
    await page.goto(`${origin}/login.html`, { waitUntil: 'networkidle' });
    await page.locator('#emailInput').fill('cuenta@example.invalid');
    await page.locator('#passInput').fill('QA password only');
    await page.locator('#btnLogin').click();
    await page.locator('#contextStep').waitFor({ state: 'visible' });
    await page.locator('#contextOptions input').first().check();
    await page.locator('#continueContextButton').click();
    await page.locator('#mfaStep').waitFor({ state: 'visible' });
    await page.locator('#toggleRecoveryButton').click();
    await page.locator('#mfaInput').fill('WRONG-RECOVERY');
    await page.locator('#verifyMfaButton').click();
    await page.locator('#errorMsg').waitFor({ state: 'visible' });
    assert.match(await page.locator('#errorMsg').innerText(), /Quedan 4 intentos/);
    await page.locator('#mfaInput').fill('QA-RECOVERY-CORRECT');
    await page.locator('#verifyMfaButton').click();
    await page.waitForURL(`${origin}/internal-dashboard.html`);
    assert.deepEqual(recoveryRequests.map((item) => item.version), [2, 3]);
    assert.notEqual(recoveryRequests[0].key, recoveryRequests[1].key);
    await context.close();
  }
  {
    const { context, page } = await pageFor({ width: 390, height: 844 });
    await page.goto(`${origin}/login.html`, { waitUntil: 'networkidle' });
    await page.locator('#emailInput').fill('cuenta@example.invalid');
    await page.locator('#passInput').fill('QA password only');
    await page.locator('#btnLogin').click();
    await page.locator('#contextStep').waitFor({ state: 'visible' });
    await page.locator('#contextOptions input').first().check();
    await page.locator('#continueContextButton').click();
    await page.locator('#mfaStep').waitFor({ state: 'visible' });
    await page.locator('#mfaInput').fill('999999');
    await page.locator('#verifyMfaButton').click();
    await page.locator('#credentialStep').waitFor({ state: 'visible' });
    assert.match(await page.locator('#errorMsg').innerText(), /agotaron los intentos/i);
    assert.equal(await page.locator('#mfaStep').isHidden(), true);
    assert.equal(await page.locator('#mfaInput').inputValue(), '');
    assert.equal(lockoutRequests.length, 1);
    assert.equal(lockoutRequests[0].version, 2);
    assert.match(lockoutRequests[0].key || '', /^[0-9a-f-]{36}$/i);
    await context.close();
  }
  {
    const { context, page } = await pageFor({ width: 390, height: 844 });
    await page.goto(`${origin}/seguridad-cuenta.html`, { waitUntil: 'networkidle' });
    await page.locator('#securityContent').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.body.scrollWidth <= window.innerWidth), true);
    assert.match(await page.locator('#identitySummary').innerText(), /TENANT_ADMIN/);
    assert.match(await page.locator('#sessionList').innerText(), /Navegador de escritorio/);
    const heights = await page.locator('button:not([hidden]), a.button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height).filter((height) => height > 0));
    assert.equal(heights.length > 0 && heights.every((height) => height >= 44), true);
    await page.locator('#startMfaButton').click();
    await page.locator('#currentPassword').fill('QA password only');
    await page.locator('#beginMfaButton').click();
    await page.locator('#mfaCodeForm').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#accountManualMfaKey').innerText(), 'QA-ACCOUNT-MFA-KEY');
    const skipState = await page.locator('.skip-link').evaluate((node) => ({ top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom, activeId: document.activeElement?.id || '' }));
    assert.equal(skipState.activeId, 'accountTotp');
    assert.equal(skipState.bottom <= 0, true);
    const file = path.join(os.tmpdir(), 'municontrol-security-mobile.png');
    await page.screenshot({ path: file, fullPage: false }); screenshots.push(file);
    await page.locator('#accountTotp').fill('000000');
    await page.locator('#completeMfaButton').click();
    await page.waitForFunction(() => /Quedan 4 intentos/.test(document.getElementById('mfaStatus')?.textContent || ''));
    await page.locator('#accountTotp').fill('123456');
    await page.locator('#completeMfaButton').click();
    await page.locator('#mfaRecoverySection').waitFor({ state: 'visible' });
    assert.deepEqual(securityEnrollmentRequests.map((item) => item.version), [1, 2]);
    assert.notEqual(securityEnrollmentRequests[0].key, securityEnrollmentRequests[1].key);
    await context.close();
  }
  const expectedMfaRejections = errors.filter((value) => /status of 401 \(Unauthorized\)/.test(value));
  const expectedLockouts = errors.filter((value) => /status of 423 \(Locked\)/.test(value));
  const unexpectedErrors = errors.filter((value) => !/status of (?:401 \(Unauthorized\)|423 \(Locked\))/.test(value));
  assert.equal(expectedMfaRejections.length, 4);
  assert.equal(expectedLockouts.length, 1);
  assert.deepEqual(unexpectedErrors, []);
  console.log(JSON.stringify({ ok: true, screenshots, consoleErrors: unexpectedErrors.length, expectedMfaRejections: expectedMfaRejections.length, expectedLockouts: expectedLockouts.length }));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
