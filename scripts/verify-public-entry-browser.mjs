// Built public page, isolated browser and fixture responses. No municipal session or writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import '../assets/app-routes.js';

const root = path.resolve('public'), output = path.resolve('verification/public-entry-browser');
const origin = 'https://municontrol.test';
const source = JSON.parse(fs.readFileSync(path.join(root, 'friendly-data.json')));
const checks = [];
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
try {
  for (const width of [1440, 1024, 760, 390, 320]) {
    for (const state of ['anonymous', 'authenticated', 'expired', 'unavailable', 'invalid', 'source-error']) {
      const context = await browser.newContext({ viewport: { width, height: width < 800 ? 844 : 1000 }, locale: 'es-AR', serviceWorkers: 'block', reducedMotion: 'reduce' });
      const requests = [], errors = [], missing = [];
      try {
        await context.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          requests.push({ method: request.method(), path: url.pathname });
          assert.equal(url.origin, origin, 'No external network request');
          assert.equal(request.method(), 'GET', 'Opening and navigation never write');
          if (url.pathname === '/api/internal-auth') {
            if (state === 'unavailable') return route.fulfill({ status: 503, json: { ok: false } });
            if (state === 'expired') return route.fulfill({ status: 401, json: { authenticated: false } });
            if (state === 'invalid') return route.fulfill({ json: { authenticated: 'true' } });
            return route.fulfill({ json: { authenticated: state === 'authenticated' } });
          }
          if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 401, json: { ok: false } });
          if (url.pathname === '/friendly-data.json' && state === 'source-error') return route.fulfill({ status: 503, body: '' });
          const resolved = globalThis.MuniControlRoutes.resolve(url.href, origin);
          const relative = url.pathname === '/' ? 'friendly-dashboard.html' : resolved?.file || '.' + decodeURIComponent(url.pathname);
          const file = path.resolve(root, relative);
          if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            missing.push(url.pathname); return route.fulfill({ status: 404, body: '' });
          }
          const type = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }[path.extname(file)] || 'application/octet-stream';
          return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin + '/');
        if (state === 'source-error') await page.locator('#loading .error-state').waitFor();
        else await page.locator('#dashboard:not([hidden])').waitFor();
        await page.waitForFunction(expected => document.querySelector('#publicPortalEntry').textContent.includes(expected), state === 'authenticated' ? 'Continuar' : 'Ingresar');
        const entry = page.getByRole('link', { name: /(?:Ingresar|Continuar) al portal interno/ });
        assert.equal(await entry.count(), 1);
        assert.equal(await entry.getAttribute('href'), '/personal#inicio');
        assert.equal(await page.getByRole('button', { name: 'Cerrar sesión' }).isVisible(), state === 'authenticated');
        assert.match(await page.locator('.crumb').innerText(), /Vista de consulta/);
        const layout = await entry.evaluate(el => {
          const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
          return { height: rect.height, top: rect.top, bottom: rect.bottom, fontSize: parseFloat(style.fontSize), overflow: document.documentElement.scrollWidth > innerWidth + 1 };
        });
        assert.ok(layout.height >= 56 && layout.fontSize >= 16, 'Prominent readable access');
        assert.ok(layout.top >= 0 && layout.bottom <= page.viewportSize().height, 'Entry is visible without scrolling');
        assert.equal(layout.overflow, false, 'No horizontal overflow');
        if (['anonymous', 'authenticated'].includes(state) && [1440, 390].includes(width)) {
          await page.screenshot({ path: path.join(output, `entry-${state}-${width}.png`), fullPage: false });
        }
        await entry.focus();
        assert.equal(await entry.evaluate(el => el === document.activeElement), true);
        assert.notEqual(await entry.evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'Keyboard focus is visible');
        if (state !== 'source-error') {
          const actual = await page.locator('#kpiActive').innerText();
          assert.equal(Number(actual.replace(/[^0-9]/g, '')), source.workforce.active);
          assert.equal(Number((await page.locator('#kpiHistorical').innerText()).replace(/[^0-9]/g, '')), source.workforce.historicalRecords);
          assert.equal(await page.locator('.nav [data-section]').count(), 11);
          for (const section of ['personas', 'ausentismo', 'gestion']) {
            await page.locator(`[data-section="${section}"]`).click();
            assert.equal(await page.locator('.section.active').getAttribute('id'), section);
          }
          await page.getByRole('button', { name: 'Ver indicadores municipales' }).click();
          assert.equal(await page.locator('.section.active').getAttribute('id'), 'inicio');
          assert.equal(await page.locator('#inicio').evaluate(el => el === document.activeElement), true);
          assert.equal(await page.locator('#publicIndicatorsTitle').isVisible(), true);
        }
        if (state === 'anonymous') {
          await entry.press('Enter');
          await page.waitForURL(url => url.pathname === '/acceso');
          assert.match(new URL(page.url()).searchParams.get('next'), /(?:internal-dashboard\.html|\/personal)#inicio/);
          assert.equal(await page.locator('#emailInput').inputValue(), '');
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(missing, []);
        assert.equal(requests.filter(request => request.method !== 'GET').length, 0);
        checks.push({ width, state, ok: true });
      } finally { await context.close(); }
    }
  }
} finally { await browser.close(); }
fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ fixtureOnly: true, municipalWrites: 0, checks }, null, 2) + '\n');
console.log(JSON.stringify({ ok: true, scenarios: checks.length, municipalWrites: 0 }));
