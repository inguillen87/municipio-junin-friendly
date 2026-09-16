// Read-only smoke test of the deployed HTML, CSS and executable JavaScript.
// No credentials, municipal sessions, private API forwarding or writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const origin = 'https://municipio-junin-friendly.vercel.app';
const output = path.resolve('verification');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const checks = [], errors = [];
let syntheticApiResponses = 0;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      syntheticApiResponses++;
      return route.fulfill({ status: 401, json: { ok: false, authenticated: false } });
    }
    const staticPage = ['/reportes', '/reportes-rrhh', '/reportes-rrhh.html', '/manifest.webmanifest', '/favicon.ico'].includes(url.pathname);
    if (request.method() !== 'GET' || (!staticPage && !url.pathname.startsWith('/assets/'))) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.goto(origin + '/reportes', { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, 'The public /reportes route must be available');
  const catalog = page.locator('[data-catalog-workspace="v2"]');
  await catalog.waitFor();
  const search = catalog.locator('[data-catalog-search]');
  const format = catalog.locator('[data-catalog-format]');
  const areas = catalog.getByRole('group', { name: 'Área de trabajo' });
  const count = () => catalog.locator('.rc-card').count();
  assert.equal(await count(), 12);
  assert.equal(await catalog.locator('.rc-task-toolbar').evaluate(node => getComputedStyle(node).borderTopStyle), 'solid');
  assert.match(await catalog.locator('.rc-task-note').innerText(), /no envía pagos ni presenta declaraciones/);
  await page.screenshot({ path: path.join(output, 'noelia-report-live-desktop.png'), fullPage: true });
  checks.push('public /reportes returns 200 and the published workspace mounts with its actual styles');

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
  checks.push('live search, combined filters and browser history retain the working context');

  await search.fill('F.931');
  assert.equal(await count(), 1);
  assert.equal(await catalog.locator('.rc-card').getAttribute('data-external-control'), 'true');
  await format.selectOption('Excel');
  assert.equal(await count(), 0);
  assert.match(await catalog.getByRole('status').innerText(), /0 de 12/);
  await catalog.getByRole('button', { name: 'Restablecer filtros', exact: true }).click();
  checks.push('external fiscal controls remain distinct and do not claim an unavailable output');

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `published layout at ${width}px`);
    assert.ok(await areas.getByRole('button').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)));
    await search.fill('bancarización');
    assert.equal(await count(), 1);
    assert.equal(await catalog.locator('.rc-card').getAttribute('href'), '#planilla-bancaria');
    await page.screenshot({ path: path.join(output, `noelia-report-live-mobile-${width}.png`), fullPage: true });
    await catalog.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
  }
  checks.push('published 320px and 390px layouts preserve search, touch targets and reduced motion');
  assert.deepEqual(errors, []);
  const result = {
    ok: true, commit: process.env.GITHUB_SHA || null, origin, checkedAt: new Date().toISOString(),
    checksPassed: checks.length, checks, errors, syntheticApiResponses,
    frontendSource: 'published Vercel deployment', apiResponsesSynthetic: true,
    municipalSessionTested: false, privateApiRequestsSent: 0, writesSent: 0,
  };
  fs.writeFileSync(path.join(output, 'noelia-report-live-browser.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await context.close();
} finally { await browser.close(); }
