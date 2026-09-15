// Local visual/auth interaction checks. Requests are intercepted with synthetic
// accounts and challenges; this never logs into a municipal account or sends mail.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('public'), output = path.resolve('verification'), origin = 'https://access-qa.test';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, locale: 'es-AR', serviceWorkers: 'block' });
    const errors = [], commands = [], missing = [];
    let mode = 'unavailable', verifyAttempts = 0, enrollmentAttempts = 0;
    const expiry = () => new Date(Date.now() + 600000).toISOString();
    const session = { ok: true, session: { tenantId: 'qa-tenant' }, user: { name: 'Cuenta de prueba', email: 'qa@example.invalid' } };
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { errors.push('External request blocked'); return route.abort(); }
      if (url.pathname === '/api/internal-identity') {
        assert.equal(request.method(), 'POST');
        const body = request.postDataJSON(); commands.push(body.command);
        const reply = (json, status = 200) => route.fulfill({ json, status });
        if (body.command === 'login') {
          assert.equal(body.payload.email, 'qa@example.invalid');
          if (mode === 'unavailable') return reply({ ok: false, code: 'IDENTITY_GATEWAY_UNAVAILABLE' }, 503);
          return reply({ ok: true, code: 'CONTEXT_REQUIRED', flowToken: 'qa-context-only', expectedVersion: 1, expiresAt: expiry(), contexts: [{ kind: 'tenant', tenantId: 'qa-tenant', tenantName: 'Municipalidad de prueba', tenantSlug: 'qa-local' }] }, 202);
        }
        if (body.command === 'select_context') {
          assert.deepEqual(body.payload.context, { kind: 'tenant', tenantId: 'qa-tenant' });
          assert.equal(body.expectedVersion, 1);
          if (mode === 'enroll') return reply({ ok: true, code: 'MFA_ENROLLMENT_REQUIRED', flow: { flowToken: 'qa-enroll-only', expectedVersion: 2, expiresAt: expiry() }, mfaEnrollment: { manualKey: 'QA-LOCAL-NOT-A-REAL-MFA-KEY' } }, 202);
          return reply({ ok: true, code: 'MFA_REQUIRED', flowToken: 'qa-mfa-only', expectedVersion: 2, expiresAt: expiry() }, 202);
        }
        if (body.command === 'request_email_mfa') return reply({ ok: true, code: 'EMAIL_MFA_ACCEPTED', challenge: { id: 'qa-email-only', expectedVersion: 1, expiresAt: expiry(), retryAfterSeconds: 45, maskedDestination: 'q***@example.invalid' } }, 202);
        if (body.command === 'verify_email_mfa') {
          verifyAttempts++;
          assert.equal(body.expectedVersion, verifyAttempts);
          if (verifyAttempts === 1) return reply({ ok: false, code: 'IDENTITY_EMAIL_MFA_INVALID', expectedVersion: 2, remainingAttempts: 4 }, 401);
          return reply(session);
        }
        if (body.command === 'complete_login_mfa_enrollment') {
          enrollmentAttempts++;
          assert.equal(body.expectedVersion, enrollmentAttempts + 1);
          if (enrollmentAttempts === 1) return reply({ ok: false, code: 'IDENTITY_MFA_INVALID', expectedVersion: 3, remainingAttempts: 4 }, 401);
          return reply({ ...session, recoveryCodes: ['QA-RECOVERY-ONE', 'QA-RECOVERY-TWO'] });
        }
        if (body.command === 'begin_activation') return reply({ flowToken: 'qa-invite-only', expectedVersion: 1, expiresAt: expiry(), requiresMfa: true, mfaEnrollment: { manualKey: 'QA-INVITATION-KEY' } });
        throw Error('Unexpected identity command: ' + body.command);
      }
      if (['/', '/relojes-marcaciones.html'].includes(url.pathname)) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Destino local de prueba</title><h1>Destino local de prueba</h1>' });
      if (url.pathname.startsWith('/api/')) throw Error('Unexpected API: ' + url.pathname);
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { missing.push(url.pathname); return route.fulfill({ status: 404, body: '' }); }
      const type = { '.css': 'text/css', '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(file)] || 'application/octet-stream';
      return route.fulfill({ body: fs.readFileSync(file), contentType: type });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    const loginUrl = origin + '/login.html?next=relojes-marcaciones.html';
    const screen = async name => {
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': no horizontal overflow');
      await page.evaluate(() => {
        if (document.getElementById('qa-note')) return;
        const note = document.createElement('div'); note.id = 'qa-note'; note.textContent = 'VERIFICACIÓN LOCAL · Cuenta y respuestas de prueba';
        note.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff0cb;color:#453406;font:600 11px Arial;padding:6px;text-align:center'; document.body.append(note);
      });
      await page.screenshot({ path: path.join(output, `access-portal-${name}-${width}.png`), fullPage: false });
    };
    const begin = async target => {
      mode = target;
      await page.locator('#emailInput').fill('qa@example.invalid');
      await page.locator('#passInput').fill('Synthetic password for QA only');
      await page.locator('#btnLogin').click();
      await page.locator('#contextStep').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#contextOptions input:checked').count(), 0);
      assert.equal(await page.locator('#continueContextButton').isDisabled(), true);
      await page.locator('#contextOptions input').check();
      await page.locator('#continueContextButton').click();
    };
    await page.goto(loginUrl);
    const actualIds = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
    assert.equal(actualIds.length, new Set(actualIds).size);
    assert.match(await page.title(), /^Ingresar \| MuniControl$/);
    assert.doesNotMatch(await page.locator('body').innerText(), /tenant|servidor|respaldo|2\.450|31\.572|882|agosto|septiembre/i);
    assert.equal(await page.locator('#emailInput').inputValue(), ''); assert.equal(await page.locator('#passInput').inputValue(), '');
    assert.match(await page.locator('h1').evaluate(el => getComputedStyle(el).fontFamily), /Segoe UI|sans-serif/);
    const brand = await page.locator('.brand-name').evaluate(el => getComputedStyle(el).backgroundImage);
    assert.match(brand, /logo-horizontal\.svg/);
    if (width < 700) {
      assert.ok((await page.locator('#access-panel').boundingBox()).y < 140);
      assert.ok((await page.locator('#passInput').boundingBox()).y < 560);
      assert.ok((await page.locator('#btnLogin').boundingBox()).y < 680);
    }
    await screen('initial');
    await page.keyboard.press('Tab'); assert.equal(await page.locator('.skip-link').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Enter'); await page.keyboard.press('Tab'); assert.equal(await page.locator('#emailInput').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab'); assert.equal(await page.locator('#passInput').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Tab'); assert.equal(await page.locator('#togglePassBtn').evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('Space'); assert.equal(await page.locator('#passInput').getAttribute('type'), 'text');
    await page.keyboard.press('Space'); assert.equal(await page.locator('#passInput').getAttribute('type'), 'password');
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
    assert.equal(await page.locator('#errorMsg').isVisible(), true); assert.equal(commands.length, 0);
    await page.locator('#emailInput').fill('qa@example.invalid'); await page.locator('#passInput').fill('Synthetic password for QA only'); await page.locator('#btnLogin').click();
    await page.locator('#errorMsg').waitFor({ state: 'visible' }); await page.waitForFunction(() => !document.getElementById('btnLogin').disabled);
    assert.equal(await page.locator('#emailInput').inputValue(), 'qa@example.invalid'); assert.equal(await page.locator('#passInput').inputValue(), '');
    await screen('error');
    await begin('mfa'); await page.locator('#mfaStep').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#contextStep').isVisible(), false, 'The completed context choice must not compete with MFA');
    await screen('mfa');
    await page.locator('#toggleRecoveryButton').click(); assert.equal(await page.locator('#mfaInput').getAttribute('inputmode'), 'text');
    await page.locator('#useAuthenticatorButton').click(); assert.equal(await page.locator('#mfaInput').getAttribute('inputmode'), 'numeric');
    await page.locator('#cancelMfaButton').click(); assert.equal(await page.locator('#credentialStep').isVisible(), true);
    assert.equal(await page.locator('#contextStep').isVisible(), false);
    assert.equal(await page.locator('#mfaInput').inputValue(), '');
    await begin('mfa'); await page.locator('#requestEmailMfaButton').click();
    await page.waitForFunction(() => document.getElementById('mfaInputLabel').textContent.includes('por correo'));
    assert.equal(await page.locator('#requestEmailMfaButton').isDisabled(), true);
    await page.locator('#mfaInput').fill('000000'); await page.locator('#verifyMfaButton').click();
    await page.waitForFunction(() => document.getElementById('errorMsg').textContent.includes('Quedan 4 intentos'));
    assert.equal(await page.locator('#mfaInput').inputValue(), '');
    const errorBox = await page.locator('#errorMsg').boundingBox();
    assert.ok(errorBox.y >= 0 && errorBox.y + errorBox.height < (width < 700 ? 844 : 1000), 'MFA error remains in view after the code field receives focus');
    await screen('email-error');
    await page.locator('#mfaInput').fill('123456'); await page.locator('#verifyMfaButton').click(); await page.waitForURL(origin + '/relojes-marcaciones.html');
    await page.goto(loginUrl); await begin('enroll'); await page.locator('#loginEnrollmentStep').waitFor({ state: 'visible' });
    await screen('enrollment');
    await page.locator('#loginEnrollmentTotp').fill('000000'); await page.locator('#completeEnrollmentButton').click();
    await page.waitForFunction(() => document.getElementById('errorMsg').textContent.includes('Quedan 4 intentos'));
    assert.equal(await page.locator('#loginEnrollmentTotp').inputValue(), '');
    await page.locator('#loginEnrollmentTotp').fill('123456'); await page.locator('#completeEnrollmentButton').click(); await page.locator('#loginRecoveryStep').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#loginManualMfaKey').innerText(), '');
    assert.equal(await page.locator('#finishLoginEnrollmentButton').isDisabled(), true); await screen('recovery');
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some(key => /flow|mfa|token|recovery/i.test(key))), false);
    await page.locator('#loginRecoveryConfirmed').check(); await page.locator('#finishLoginEnrollmentButton').click(); await page.waitForURL(origin + '/relojes-marcaciones.html');
    await page.goto(loginUrl); await page.locator('a[href="activar-cuenta.html"]').click(); await page.waitForURL(origin + '/activar-cuenta.html');
    assert.equal(new URL(page.url()).search, '');
    await page.locator('#invitationCode').fill('QA-INVITATION-ONLY'); await page.locator('#verifyCodeButton').click(); await page.locator('#credentialsForm').waitFor({ state: 'visible' });
    await page.locator('#cancelActivationButton').click(); await page.waitForURL(origin + '/login.html'); assert.equal(await page.locator('#passInput').inputValue(), '');
    await page.goto(loginUrl); await page.locator('a[href="login.html?next=centro-ayuda.html"]').click(); await page.waitForURL(origin + '/login.html?next=centro-ayuda.html');
    await page.locator('#publicAccessBtn').click(); await page.waitForURL(origin + '/');
    assert.deepEqual(errors, []); assert.deepEqual(missing, []);
    await context.close();
    console.log(`Access portal ${width}px passed: layout, blank fields, approved brand, keyboard, password toggle, errors, explicit context, MFA/email retry, enrollment/recovery, next route and invitation.`);
  }
} finally { await browser.close(); }
