// Public UI smoke check only. No account is used and no form is submitted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://municipio-junin-friendly.vercel.app';
const output = path.join(root, 'tmp/access-qa');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const errors = [], blocked = [], failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push({ status: response.status(), path: new URL(response.url()).pathname }); });
    await page.route('**/*', route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin || url.pathname.startsWith('/api/') || request.method() !== 'GET') {
        blocked.push({ method: request.method(), path: url.pathname });
        return route.abort();
      }
      return route.continue();
    });
    const response = await page.goto(`${origin}/login`, { waitUntil: 'load' });
    assert.equal(response.status(), 200);
    await page.locator('#mc-install-share-root button').filter({ hasText: /^Compartir$/ }).waitFor({ state: 'attached' });
    assert.equal(await page.locator('h1').innerText(), 'Bienvenido a tu espacio de trabajo');
    const visual = await page.evaluate(() => {
      const brand = document.querySelector('.brand-name');
      const login = document.querySelector('#btnLogin');
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        logo: getComputedStyle(brand).backgroundImage,
        font: getComputedStyle(document.querySelector('h1')).fontFamily,
        primary: getComputedStyle(login).backgroundColor,
        loginBottom: login.getBoundingClientRect().bottom,
        installClosed: !document.querySelector('#mc-install-share-root details').open,
      };
    });
    assert.equal(visual.overflow, false);
    assert.match(visual.logo, /logo-horizontal\.svg/);
    assert.match(visual.font, /Segoe UI/);
    assert.equal(visual.primary, 'rgb(22, 116, 104)');
    assert.ok(visual.loginBottom < 768, 'primary action visible in first 768 CSS pixels');
    assert.equal(visual.installClosed, true);
    for (const id of ['contextStep', 'loginEnrollmentStep', 'loginRecoveryStep', 'mfaStep']) assert.equal(await page.locator(`#${id}`).isHidden(), true);
    await page.screenshot({ path: path.join(output, `production-${width}.png`), fullPage: true });
    await page.locator('#mc-install-share-root summary').click();
    assert.equal(await page.locator('#mc-install-share-root details').evaluate(node => node.open), true);
    assert.equal(await page.locator('#credentialStep').isVisible(), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    assert.deepEqual(blocked, []);
    results.push({ width, status: 200, newDesign: true, noOverflow: true, reactDisclosure: true, errorCount: 0, apiCalls: 0 });
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ production: origin, readOnly: true, results }, null, 2));
