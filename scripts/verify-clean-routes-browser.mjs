// Read-only route verification. Fresh browser context, no credentials, no auth
// fixtures and no session/database writes. Run against Vercel dev or a Preview.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import '../assets/app-routes.js';

const origin = new URL(process.env.CLEAN_ROUTES_BASE_URL || 'http://127.0.0.1:4317').origin;
const localDev = process.argv.includes('--local-dev');
if (localDev) assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'local-dev is loopback only');
const pending = [], checks = [], routes = globalThis.MuniControlRoutes;
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const platformAssert = (condition, message) => {
  if (condition) return;
  if (localDev) pending.push(message);
  else assert.ok(condition, message);
};
const output = path.resolve('verification'); fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext({ locale: 'es-AR', serviceWorkers: 'block' });
  for (const entry of routes.definitions) {
    const response = await context.request.get(origin + entry.path, { maxRedirects: 0 });
    assert.equal(response.status(), 200, entry.path + ': canonical shell');
    assert.match(response.headers()['content-type'], /text\/html/, entry.path);
    assert.match(await response.text(), /\/assets\/app-routes\.js/, entry.path + ': route contract loads');
    const privateHeader = config.headers.find(h => h.source === entry.path)?.headers.find(h => h.key === 'Cache-Control')?.value;
    if (privateHeader?.includes('private')) platformAssert(/private.*no-store/.test(response.headers()['cache-control'] || ''), entry.path + ': private no-store header');
    const old = await context.request.get(origin + '/' + entry.file + '?period=2026-08&filter=A%2BB', { maxRedirects: 0 });
    assert.equal(old.status(), 307, entry.file + ': legacy redirect');
    const target = new URL(old.headers().location, origin);
    assert.equal(target.pathname, entry.path);
    platformAssert(target.searchParams.get('period') === '2026-08' && target.searchParams.get('filter') === 'A+B', entry.file + ': redirect preserves query');
  }
  checks.push('26 canonical shells, legacy redirects, explicit private headers');
  for (const resource of ['/api/internal-auth', '/api/internal-attendance', '/api/internal-payroll-bank-report?resource=catalog']) {
    const response = await context.request.get(origin + resource);
    assert.equal(response.status(), 401, resource + ': real anonymous denial');
    assert.match(response.headers()['cache-control'], /private.*no-store/);
    const body = await response.json();
    assert.notEqual(body.authenticated, true); assert.ok(!body.data?.rows);
  }
  checks.push('real APIs deny anonymous access with 401/no-store');
  for (const width of [1440, 390]) {
    const page = await context.newPage(); await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 });
    const errors = [], failures = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/assets/')) failures.push(new URL(response.url()).pathname); });
    await page.goto(origin + '/login.html?next=%2Frelojes%3Fperiod%3D2026-08%23conectores');
    await page.locator('#emailInput').waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).pathname, '/acceso');
    platformAssert(new URL(page.url()).searchParams.get('next') === '/relojes?period=2026-08#conectores', 'browser legacy login query at ' + width);
    assert.match(await page.locator('.brand-name').evaluate(el => getComputedStyle(el).backgroundImage), /logo-horizontal\.svg/);
    await page.screenshot({ path: path.join(output, `clean-routes-access-${width}.png`) });

    for (const [route, hash] of [['/relojes', '#conectores'], ['/nomina', '#comparar'], ['/personal', '#legajos']]) {
      await page.goto(origin + route + '?period=2026-08' + hash);
      await page.waitForURL(url => url.pathname === '/acceso');
      assert.equal(new URL(page.url()).searchParams.get('next'), route + '?period=2026-08' + hash, route + ': complete unauthenticated return');
      assert.equal(await page.locator('#emailInput').inputValue(), '');
    }
    await page.goto(origin + '/reportes-rrhh.html?period=2026-08#planilla-bancaria');
    await page.locator('#reportContent').waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).pathname, '/reportes');
    assert.equal(new URL(page.url()).hash, '#planilla-bancaria');
    platformAssert(new URL(page.url()).searchParams.get('period') === '2026-08', 'browser report query at ' + width);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(output, `clean-routes-reports-${width}.png`) });
    await page.goto(origin + '/inicio');
    await page.locator('#dashboard').waitFor({ state: 'visible' });
    assert.equal(new URL(page.url()).pathname, '/inicio');
    assert.deepEqual(failures, [], 'all referenced assets load');
    assert.deepEqual(errors, [], 'no browser exceptions');
    await page.close();
  }
  checks.push('desktop/mobile, complete login return, reports anchor, public home and assets');
  await context.close();
  console.log(JSON.stringify({ ok: pending.length === 0, mode: localDev ? 'vercel-dev-with-pending-platform-checks' : 'strict', checks, platformChecksPending: pending }, null, 2));
} finally { await browser.close(); }
