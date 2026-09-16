// One network policy in both modes: compiled local rehearsal and deployed UI.
// All private API responses are synthetic. Never opens a municipal session.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { verifyReportCatalogViews } from './verify-report-catalog-views-browser.mjs';
import { REPORT_SMOKE_ORIGIN as origin, reportSmokeRequestPolicy } from './noelia-report-network-policy.mjs';

const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 1 && args[0] === '--local'), 'Only --local is supported');
const local = args[0] === '--local';
const root = path.resolve('public');
const output = path.resolve('verification');
const prefix = local ? 'noelia-report-network-local' : 'noelia-report-live';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [], errors = [];
let syntheticApiResponses = 0, publicAggregateRequests = 0, forwardedRequests = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request();
    const decision = reportSmokeRequestPolicy(request.url(), request.method());
    if (decision === 'synthetic-api') {
      syntheticApiResponses++;
      return route.fulfill({ status: 401, json: { ok: false, authenticated: false } });
    }
    if (decision !== 'public-get') return route.abort();
    const url = new URL(request.url());
    if (url.pathname === '/friendly-data.json') publicAggregateRequests++;
    if (!local) {
      forwardedRequests++;
      return route.continue();
    }
    const pathname = ['/reportes', '/reportes-rrhh'].includes(url.pathname) ? '/reportes-rrhh.html' : url.pathname;
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    return route.fulfill({ status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(origin + '/reportes', { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, 'The /reportes route must be available');
  await page.locator('#reportContent:not([hidden])').waitFor();
  const catalog = page.locator('[data-catalog-workspace="v2"]');
  await catalog.waitFor();
  assert.ok(publicAggregateRequests > 0, 'The report shell must load its real public aggregate');
  assert.equal(await page.locator('#loadError').isVisible(), false);
  const search = catalog.locator('[data-catalog-search]');
  const format = catalog.locator('[data-catalog-format]');
  const areas = catalog.getByRole('group', { name: 'Área de trabajo' });
  const count = () => catalog.locator('.rc-card').count();
  assert.equal(await count(), 12);
  assert.equal(await catalog.locator('.rc-task-toolbar').evaluate(node => getComputedStyle(node).borderTopStyle), 'solid');
  assert.match(await catalog.locator('.rc-task-note').innerText(), /no envía pagos ni presenta declaraciones/);
  await page.screenshot({ path: path.join(output, `${prefix}-desktop.png`), fullPage: true });
  checks.push('report shell loads the public aggregate; twelve cards and actual styles are visible');

  await search.fill('mutuales');
  await areas.getByRole('button', { name: 'Nómina', exact: true }).click();
  await format.selectOption('Excel');
  assert.equal(await count(), 1);
  await catalog.locator('a[href="#haberes"]').click();
  await page.locator('#task-haberes').waitFor({ state: 'visible' });
  await page.goBack();
  await catalog.waitFor({ state: 'visible' });
  assert.equal(await search.inputValue(), 'mutuales');
  assert.equal(await format.inputValue(), 'Excel');
  assert.equal(await areas.getByRole('button', { name: 'Nómina', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.equal(await count(), 1);
  await catalog.getByRole('button', { name: 'Restablecer filtros', exact: true }).click();
  checks.push('search, combined filters and browser history retain the working context');

  await search.fill('F.931');
  assert.equal(await count(), 1);
  assert.equal(await catalog.locator('.rc-card').getAttribute('data-external-control'), 'true');
  await format.selectOption('Excel');
  assert.equal(await count(), 0);
  assert.match(await catalog.getByRole('status').innerText(), /0 de 12/);
  await catalog.getByRole('button', { name: 'Restablecer filtros', exact: true }).click();
  checks.push('external controls stay distinct and do not claim an unavailable output');

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `layout at ${width}px`);
    assert.ok(await areas.getByRole('button').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)));
    await search.fill('bancarización');
    assert.equal(await count(), 1);
    assert.equal(await catalog.locator('.rc-card').getAttribute('href'), '#planilla-bancaria');
    await page.screenshot({ path: path.join(output, `${prefix}-mobile-${width}.png`), fullPage: true });
    await catalog.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
  }
  checks.push('320px and 390px layouts preserve search, touch targets and reduced motion');
  await page.setViewportSize({ width: 1440, height: 1000 });
  checks.push(...await verifyReportCatalogViews(page, catalog, path.join(output, `${prefix}-views`)));
  assert.deepEqual(errors, []);
  assert.ok(local ? forwardedRequests === 0 : forwardedRequests > 0);
  const result = {
    ok: true, commit: process.env.GITHUB_SHA || null, origin, checkedAt: new Date().toISOString(),
    checksPassed: checks.length, checks, errors, syntheticApiResponses, publicAggregateRequests, forwardedRequests,
    frontendSource: local ? 'compiled local build' : 'published Vercel deployment',
    apiResponsesSynthetic: true, municipalSessionTested: false, privateApiRequestsSent: 0, writesSent: 0,
  };
  fs.writeFileSync(path.join(output, `${prefix}-browser.json`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await context.close();
} finally { await browser.close(); }
