// Built React island, real Chrome DOM, simulated native sharing/install APIs.
// All requests are intercepted; no clipboard, sharing, installation or login is performed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const origin = 'http://127.0.0.1:41903';
const publicUrl = 'https://municipio-junin-friendly.vercel.app/';
const shareText = 'Gestión municipal, más simple.';
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
await fs.mkdir(path.join(root, 'tmp/brand-qa'), { recursive: true });
const results = [];
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const width of [320, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    page.setDefaultTimeout(15000);
    const errors = [];
    const external = [];
    const missing = [];
    const apiRequests = [];
    const islandBundles = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__installShareQA = { clipboardMode: 'allow', shareMode: 'resolve', clipboardCalls: [], shareCalls: [], promptCalls: 0 };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value) => {
          window.__installShareQA.clipboardCalls.push(value);
          if (window.__installShareQA.clipboardMode === 'deny') throw new DOMException('Denied in QA', 'NotAllowedError');
        } },
      });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (payload) => {
          window.__installShareQA.shareCalls.push({ ...payload });
          if (window.__installShareQA.shareMode === 'abort') throw new DOMException('Cancelled in QA', 'AbortError');
        },
      });
    });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) { external.push(url.origin); return route.abort(); }
      if (url.pathname.startsWith('/api/')) {
        apiRequests.push({ path: url.pathname, method: request.method() });
        return route.fulfill({ status: 401, contentType: 'application/json', headers: { 'Cache-Control': 'private, no-store' }, body: JSON.stringify({ ok: false, authenticated: false, error: 'Unauthenticated local QA.' }) });
      }
      const resolved = path.resolve(publicRoot, `.${url.pathname}`);
      if (!resolved.startsWith(`${publicRoot}${path.sep}`)) return route.abort();
      try {
        const real = await fs.realpath(resolved);
        if (!real.startsWith(`${publicRoot}${path.sep}`)) return route.abort();
        const bytes = await fs.readFile(real);
        if (/\/assets\/islands\/install-share-[A-Z0-9]+\.js$/i.test(url.pathname)) islandBundles.push(url.pathname);
        return route.fulfill({ contentType: mimeTypes[path.extname(real)] || 'application/octet-stream', body: bytes });
      } catch {
        missing.push(url.pathname);
        return route.fulfill({ status: 404, body: 'Not found in the public build.' });
      }
    });
    await page.goto(`${origin}/login.html?next=recibos-sueldo&qa_token=synthetic-not-a-secret#qa`, { waitUntil: 'load' });
    const island = page.locator('#mc-install-share-root');
    const details = island.locator('details');
    // Static fallback has no Compartir button: attachment proves React mounted.
    await island.locator('button').filter({ hasText: /^Compartir$/ }).waitFor({ state: 'attached' });
    assert.equal(await details.evaluate(node => node.open), false, `${width}: disclosure closed initially`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: closed disclosure fits`);
    assert.equal(islandBundles.length, 1, `${width}: exactly one real React bundle loaded`);
    await details.locator('summary').click();
    assert.equal(await details.evaluate(node => node.open), true);
    await island.getByRole('button', { name: 'Compartir', exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: install help fits when expanded`);

    const initialAuth = await page.locator('#loginForm').evaluate(form => ({
      submit: form.getAttribute('onsubmit'), autocomplete: form.autocomplete,
      emailType: form.querySelector('#emailInput').type,
      passwordType: form.querySelector('#passInput').type,
      submitType: form.querySelector('#btnLogin').type,
      handler: typeof window.doLogin,
    }));
    await page.locator('#emailInput').fill('persona-qa@example.invalid');
    await page.locator('#passInput').fill('synthetic-qa-not-submitted');
    const waitIdle = () => page.waitForFunction(() => [...document.querySelectorAll('#mc-install-share-root button')].every(button => !button.disabled));
    const status = island.locator('.mc-install-share__status');

    await island.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
    await waitIdle();
    assert.equal(await status.innerText(), 'Enlace público copiado.');
    assert.deepEqual(await page.evaluate(() => window.__installShareQA.clipboardCalls), [publicUrl]);

    await island.getByRole('button', { name: 'Compartir', exact: true }).click();
    await waitIdle();
    assert.deepEqual(await page.evaluate(() => window.__installShareQA.shareCalls), [{ title: 'MuniControl', text: shareText, url: publicUrl }]);
    assert.equal(await status.innerText(), '', 'opening native share does not claim delivery');

    await page.evaluate(() => { window.__installShareQA.shareMode = 'abort'; });
    await island.getByRole('button', { name: 'Compartir', exact: true }).click();
    await waitIdle();
    assert.equal(await status.innerText(), '', 'AbortError produces no false success');
    assert.deepEqual(await page.evaluate(() => window.__installShareQA.clipboardCalls), [publicUrl], 'cancel does not copy or send');
    assert.equal(await page.evaluate(() => window.__installShareQA.shareCalls.length), 2);

    await page.evaluate(() => { window.__installShareQA.clipboardMode = 'deny'; });
    await island.getByRole('button', { name: 'Copiar enlace', exact: true }).click();
    const manualCopy = island.getByLabel('Enlace público para copiar');
    await manualCopy.waitFor({ state: 'visible' });
    await waitIdle();
    assert.equal(await manualCopy.inputValue(), publicUrl);
    assert.equal(await manualCopy.evaluate(input => input.readOnly), true);
    assert.match(await status.innerText(), /^Copiá este enlace/);
    assert.doesNotMatch(await manualCopy.inputValue(), /qa_token|synthetic|next=|recibos-sueldo/);
    const whatsapp = new URL(await island.getByRole('link', { name: /Compartir por WhatsApp/ }).getAttribute('href'));
    assert.equal(whatsapp.origin, 'https://wa.me');
    assert.equal(whatsapp.searchParams.get('text'), `${shareText} ${publicUrl}`);
    assert.equal([...whatsapp.searchParams.keys()].join(','), 'text');
    // WhatsApp is deliberately not opened or clicked.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: manual-copy fallback fits`);
    await details.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(root, `tmp/brand-qa/install-share-${width}.png`), fullPage: true });

    const promptPrevented = await page.evaluate(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.defineProperty(event, 'prompt', { value: async () => {
        window.__installShareQA.promptCalls += 1;
        return { outcome: 'accepted', platform: 'web' };
      } });
      Object.defineProperty(event, 'userChoice', { value: Promise.resolve({ outcome: 'accepted', platform: 'web' }) });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    assert.equal(promptPrevented, true, 'real controller retained the simulated install event');
    await island.getByRole('button', { name: 'Instalar MuniControl', exact: true }).click();
    await waitIdle();
    await page.waitForFunction(() => document.querySelector('.mc-install-share__status')?.textContent.includes('Esperando la confirmación'));
    assert.equal(await island.locator('.mc-install-share__installed').count(), 0, 'acceptance alone is not installed');
    assert.equal(await island.getByRole('button', { name: 'Instalar MuniControl', exact: true }).count(), 0, 'prompt is single-use');
    assert.equal(await page.evaluate(() => window.__installShareQA.promptCalls), 1);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await island.locator('.mc-install-share__installed').waitFor({ state: 'visible' });
    assert.equal(await island.locator('.mc-install-share__installed').innerText(), 'MuniControl ya está instalado en este dispositivo.');
    assert.equal(await status.innerText(), '', 'confirmation replaces pending-install wording');

    const finalAuth = await page.locator('#loginForm').evaluate(form => ({
      submit: form.getAttribute('onsubmit'), autocomplete: form.autocomplete,
      emailType: form.querySelector('#emailInput').type,
      passwordType: form.querySelector('#passInput').type,
      submitType: form.querySelector('#btnLogin').type,
      handler: typeof window.doLogin,
    }));
    assert.deepEqual(finalAuth, initialAuth, 'React island does not replace the auth form');
    assert.equal(finalAuth.handler, 'function');
    assert.equal(finalAuth.passwordType, 'password');
    assert.equal(await page.locator('#emailInput').inputValue(), 'persona-qa@example.invalid');
    assert.equal(await page.locator('#passInput').inputValue(), 'synthetic-qa-not-submitted');
    await page.locator('#togglePassBtn').click();
    assert.equal(await page.locator('#passInput').getAttribute('type'), 'text', 'existing auth interaction still works');
    await page.locator('#togglePassBtn').click();
    assert.equal(await page.locator('#passInput').getAttribute('type'), 'password');
    assert.equal(await page.locator('#btnLogin').isEnabled(), true);
    assert.ok(apiRequests.every(request => request.method === 'GET'), 'no authentication submit was performed');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${width}: no horizontal overflow`);
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    assert.deepEqual(missing, []);
    results.push({ width, reactMounted: true, initiallyClosed: true, copyCanonicalUrl: true, nativeSharePayload: true, cancelledShareNoFalseSuccess: true, clipboardDeniedManualFallback: true, whatsappHrefOnly: true, acceptedDoesNotMeanInstalled: true, appinstalledConfirmed: true, authFormIntact: true, overflow: false, pageErrors: 0, interceptedApiRequests: apiRequests.length });
    await page.close();
  }
} finally { await browser.close(); }
console.log(JSON.stringify({ builtFilesOnly: true, nativeApis: 'simulated clipboard, share, beforeinstallprompt and appinstalled', realMessagesSent: 0, realInstallations: 0, liveApiCalls: 0, results }, null, 2));
