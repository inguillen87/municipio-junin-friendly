// Built login only. Every browser request is intercepted; no server, real account,
// identity service, email delivery, database or authenticated session is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const output = path.join(root, 'tmp/access-qa');
const origin = 'http://127.0.0.1:41907';
const widths = [320, 390, 768, 1280, 1920];
const fixture = Object.freeze({
  email: 'persona-qa@example.invalid', password: 'Only invented local QA',
  tenantId: '77777777-7777-4777-8777-777777777777',
  contextToken: 'local-qa-context-only', mfaToken: 'local-qa-mfa-only',
});
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};
const steps = ['credentialStep', 'contextStep', 'loginEnrollmentStep', 'loginRecoveryStep', 'mfaStep'];

async function visibleStep(page, expected) {
  await page.locator(`#${expected}`).waitFor({ state: 'visible' });
  for (const id of steps) {
    assert.equal(await page.locator(`#${id}`).isVisible(), id === expected, `${expected}: visibility of ${id}`);
    if (id !== expected) assert.equal(await page.locator(`#${id}`).evaluate(node => getComputedStyle(node).display), 'none');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${expected}: no horizontal overflow`);
}

async function focused(page, id) {
  await page.waitForFunction(expected => document.activeElement?.id === expected, id);
}

async function contrastAudit(page) {
  const audit = await page.evaluate(() => {
    const rgb = value => {
      const numbers = value.match(/[\d.]+/g)?.map(Number) || [];
      return [...numbers.slice(0, 3), numbers.length > 3 ? numbers[3] : 1];
    };
    const over = (front, back) => [0, 1, 2].map(i => front[i] * front[3] + back[i] * (1 - front[3])).concat(1);
    const background = node => {
      const layers = [];
      for (let current = node; current; current = current.parentElement) layers.push(rgb(getComputedStyle(current).backgroundColor));
      return layers.reverse().reduce((result, layer) => over(layer, result), [255, 255, 255, 1]);
    };
    const light = color => color.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => (Math.max(light(a), light(b)) + .05) / (Math.min(light(a), light(b)) + .05);
    const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.disabled;
    const rows = [];
    for (const node of document.querySelectorAll('h1, h2, h3, p, label, button, a, summary, .eyebrow, .route-number, .context-panel span, .context-option strong, .context-option span, .email-mfa-card strong, .email-mfa-card > span, .footer-inner span')) {
      if (!visible(node) || !node.textContent.trim() || node.classList.contains('skip-link')) continue;
      const style = getComputedStyle(node);
      if (Number(style.opacity) < 1) continue;
      const back = background(node);
      rows.push({ selector: node.id ? `#${node.id}` : `${node.tagName.toLowerCase()}.${node.className}`, kind: 'text', ratio: ratio(over(rgb(style.color), back), back), minimum: 4.5 });
    }
    for (const node of document.querySelectorAll('.form-input, .button-secondary, .context-option')) {
      if (!visible(node)) continue;
      const style = getComputedStyle(node);
      rows.push({ selector: node.id ? `#${node.id}` : `.${node.className}`, kind: 'border', ratio: ratio(rgb(style.borderTopColor), background(node.parentElement)), minimum: 3 });
      if (node.matches('input[placeholder]')) {
        const back = background(node);
        rows.push({ selector: `#${node.id}::placeholder`, kind: 'text', ratio: ratio(over(rgb(getComputedStyle(node, '::placeholder').color), back), back), minimum: 4.5 });
      }
    }
    return rows;
  });
  assert.ok(audit.length > 8, 'contrast audit includes meaningful rendered controls');
  for (const item of audit) assert.ok(item.ratio >= item.minimum, `${item.selector} ${item.kind}: ${item.ratio.toFixed(2)} < ${item.minimum}`);
  return { samples: audit.length, minimumText: Math.min(...audit.filter(item => item.kind === 'text').map(item => item.ratio)), minimumBorder: Math.min(...audit.filter(item => item.kind === 'border').map(item => item.ratio)) };
}

await fs.access(path.join(publicRoot, 'login.html'));
assert.equal(await fs.readFile(path.join(publicRoot, 'assets/access.css'), 'utf8'), await fs.readFile(path.join(root, 'assets/access.css'), 'utf8'), 'build CSS must match source; run node scripts/build-friendly.mjs');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const results = [];
try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    page.setDefaultTimeout(12000);
    const errors = [], external = [], missing = [], unexpected = [], commands = [];
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
      const json = (body, status = 202) => route.fulfill({ status, contentType: 'application/json', headers: { 'Cache-Control': 'private, no-store' }, body: JSON.stringify(body) });
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname !== '/api/internal-identity' || request.method() !== 'POST') {
          unexpected.push(`${request.method()} ${url.pathname}`);
          return json({ ok: false, code: 'UNEXPECTED_LOCAL_QA_REQUEST' }, 500);
        }
        const body = request.postDataJSON();
        commands.push(body.command);
        if (body.command === 'login') {
          assert.deepEqual(body.payload, { email: fixture.email, password: fixture.password });
          return json({ ok: true, code: 'CONTEXT_REQUIRED', flowToken: fixture.contextToken, expectedVersion: 1, expiresAt,
            contexts: [{ kind: 'platform', label: 'Administración QA inventada' }, { kind: 'tenant', tenantId: fixture.tenantId, tenantName: 'Municipio QA inventado', tenantSlug: 'municipio-qa' }] });
        }
        assert.match(request.headers()['idempotency-key'] || '', /^[0-9a-f-]{36}$/i);
        if (body.command === 'select_context') {
          assert.equal(body.expectedVersion, 1);
          assert.deepEqual(body.payload, { flowToken: fixture.contextToken, context: { kind: 'tenant', tenantId: fixture.tenantId } });
          return json({ ok: true, code: 'MFA_REQUIRED', challenge: { flowToken: fixture.mfaToken, expectedVersion: 2, expiresAt, emailMfaAvailable: false } });
        }
        if (body.command === 'request_email_mfa') {
          assert.equal(body.expectedVersion, 2);
          assert.deepEqual(body.payload, { flowToken: fixture.mfaToken });
          return json({ ok: true, code: 'EMAIL_MFA_ACCEPTED', challenge: { id: 'local-qa-email-challenge', maskedDestination: 'p***@example.invalid', expectedVersion: 1, expiresAt, retryAfterSeconds: 45 } });
        }
        unexpected.push(body.command);
        return json({ ok: false, code: 'UNEXPECTED_LOCAL_QA_COMMAND' }, 500);
      }
      const resolved = path.resolve(publicRoot, `.${url.pathname}`);
      if (!resolved.startsWith(`${publicRoot}${path.sep}`)) { unexpected.push(url.pathname); return route.abort(); }
      try {
        const real = await fs.realpath(resolved);
        if (!real.startsWith(`${publicRoot}${path.sep}`)) { unexpected.push(url.pathname); return route.abort(); }
        return route.fulfill({ contentType: contentTypes[path.extname(real)] || 'application/octet-stream', body: await fs.readFile(real) });
      } catch { missing.push(url.pathname); return route.fulfill({ status: 404, body: 'Missing local build asset' }); }
    });
    try {
      await page.goto(`${origin}/login.html`, { waitUntil: 'networkidle' });
      await visibleStep(page, 'credentialStep');
      assert.equal(await page.locator('#login-title').count(), 1);
      const initialPosition = await page.evaluate(() => Object.fromEntries(['access-panel', 'emailInput', 'passInput', 'btnLogin'].map(id => { const rect = document.getElementById(id).getBoundingClientRect(); return [id, { top: rect.top, bottom: rect.bottom }]; })));
      if (width <= 768) {
        assert.ok(initialPosition['access-panel'].top < 140, `${width}: form before introduction`);
        assert.ok(initialPosition.emailInput.top < 430, `${width}: email in first viewport`);
        assert.ok(initialPosition.passInput.top < 560, `${width}: password in first viewport`);
        assert.ok(initialPosition.btnLogin.bottom <= 900, `${width}: primary action in first viewport`);
      }
      const initialContrast = await contrastAudit(page);
      await page.screenshot({ path: path.join(output, `access-${width}-initial.png`), fullPage: true });
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.skip-link').evaluate(node => node === document.activeElement), true);
      assert.ok((await page.locator('.skip-link').boundingBox()).y >= 0);
      await page.keyboard.press('Enter');
      await focused(page, 'access-panel');
      await page.keyboard.press('Tab');
      await focused(page, 'emailInput');
      await page.keyboard.type('correo-invalido');
      await page.keyboard.press('Tab');
      await focused(page, 'passInput');
      await page.keyboard.type(fixture.password);
      await page.keyboard.press('Tab');
      await focused(page, 'togglePassBtn');
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#passInput').getAttribute('type'), 'text');
      assert.equal(await page.locator('#togglePassBtn').getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#passInput').getAttribute('type'), 'password');
      assert.equal(await page.locator('#togglePassBtn').getAttribute('aria-pressed'), 'false');
      await page.keyboard.press('Tab');
      await focused(page, 'btnLogin');
      await page.keyboard.press('Enter');
      await page.locator('#errorMsg').waitFor({ state: 'visible' });
      await focused(page, 'emailInput');
      assert.match(await page.locator('#errorMsg').innerText(), /correo institucional válido/);
      assert.equal(commands.length, 0, 'invalid form never requests identity');
      assert.equal(await page.locator('#emailInput').inputValue(), 'correo-invalido');
      await contrastAudit(page);
      await page.screenshot({ path: path.join(output, `access-${width}-validation.png`), fullPage: true });
      await page.locator('#emailInput').fill(fixture.email);
      await page.locator('#btnLogin').click();
      await visibleStep(page, 'contextStep');
      assert.equal(await page.locator('#passInput').inputValue(), '');
      assert.equal(await page.locator('#contextOptions input').count(), 2);
      assert.equal(await page.locator('#contextOptions input:checked').count(), 0);
      assert.equal(await page.locator('#continueContextButton').isDisabled(), true);
      await focused(page, 'loginContext0');
      await contrastAudit(page);
      await page.screenshot({ path: path.join(output, `access-${width}-context.png`), fullPage: true });
      await page.keyboard.press('ArrowDown');
      await focused(page, 'loginContext1');
      assert.equal(await page.locator('#loginContext1').isChecked(), true);
      await page.locator('#continueContextButton').click();
      await visibleStep(page, 'mfaStep');
      await focused(page, 'requestEmailMfaButton');
      assert.deepEqual(commands, ['login', 'select_context'], 'TOTP-only step does not send email automatically');
      await page.locator('#verifyMfaButton').click();
      await focused(page, 'mfaInput');
      assert.match(await page.locator('#errorMsg').innerText(), /seis dígitos/);
      assert.equal(commands.length, 2, 'empty MFA never requests verification');
      await contrastAudit(page);
      await page.screenshot({ path: path.join(output, `access-${width}-mfa.png`), fullPage: true });
      await page.locator('#requestEmailMfaButton').click();
      await page.waitForFunction(() => document.getElementById('emailMfaStatus').textContent.includes('El servicio aceptó'));
      await focused(page, 'mfaInput');
      assert.equal(await page.locator('#requestEmailMfaButton').isDisabled(), true);
      assert.match(await page.locator('#emailMfaStatus').innerText(), /p\*\*\*@example\.invalid/);
      assert.match(await page.locator('#mfaInputLabel').innerText(), /por correo/);
      assert.equal(await page.locator('#useAuthenticatorButton').isVisible(), true);
      assert.equal(await page.locator('#toggleRecoveryButton').isVisible(), true);
      await contrastAudit(page);
      await page.screenshot({ path: path.join(output, `access-${width}-email-mfa.png`), fullPage: true });
      await page.locator('#mfaInput').fill('12345');
      await page.locator('#verifyMfaButton').click();
      await focused(page, 'mfaInput');
      assert.match(await page.locator('#errorMsg').innerText(), /seis dígitos.*correo/);
      await page.locator('#cancelMfaButton').click();
      await visibleStep(page, 'credentialStep');
      await focused(page, 'emailInput');
      assert.equal(await page.locator('#mfaInput').inputValue(), '');
      assert.equal(await page.locator('#emailMfaStatus').innerText(), '');
      assert.equal(await page.locator('#passInput').inputValue(), '');
      assert.equal(await page.locator('#emailInput').inputValue(), fixture.email);
      assert.equal(await page.locator('#errorMsg').isVisible(), false);
      assert.deepEqual(commands, ['login', 'select_context', 'request_email_mfa']);
      const state = await page.evaluate(() => ({
        flowCleared: contextFlow === null && loginFlow === null && emailMfaChallenge === null && emailMfaCountdownTimer === null,
        storageEmpty: localStorage.length === 0 && sessionStorage.length === 0,
      }));
      assert.deepEqual(state, { flowCleared: true, storageEmpty: true });
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
      assert.deepEqual(missing, []);
      assert.deepEqual(unexpected, []);
      results.push({ width, initialPosition, contrast: initialContrast, keyboard: true, explicitContext: true, mfaCancellation: true, emailAcceptedFixtureOnly: true, interceptedIdentityRequests: commands.length, screenshots: 5 });
    } catch (error) {
      await page.screenshot({ path: path.join(output, `access-${width}-failure.png`), fullPage: true }).catch(() => {});
      throw error;
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ builtFilesOnly: true, realNetworkRequests: 0, realEmailsSent: 0, realSessionsCreated: 0, results }, null, 2));
