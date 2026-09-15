// Compiled React in the real report shell. All private API calls are intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('public'), output = path.resolve('verification');
const origin = 'https://report-catalog.test';
const built = fs.readFileSync(path.join(root, 'assets/report-centre.js'), 'utf8');
const bundle = built.match(/import\('(\/assets\/islands\/report-catalog-[A-Z0-9]+\.js)'\)/)?.[1];
assert.ok(bundle, 'Build the report catalog before browser verification');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CATALOG_BROWSER_CHANNEL ? { channel: process.env.CATALOG_BROWSER_CHANNEL } : {}) });
const checks = [], errors = [];
try {
  async function open({ blockBundle = false, width = 1440 } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 401, json: { ok: false, authenticated: false } });
      if (blockBundle && url.pathname === bundle) return route.fulfill({ status: 503, body: '' });
      let pathname = decodeURIComponent(url.pathname);
      if (!path.extname(pathname)) pathname += '.html';
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream', body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/reportes-rrhh');
    await page.locator('#reportContent:not([hidden])').waitFor();
    await page.locator('#mc-report-catalog-root .rc-card').first().waitFor();
    return { page, context };
  }
  const { page, context } = await open();
  const catalog = page.locator('#mc-report-catalog-root');
  await page.locator('[data-react-catalog="ready"]').waitFor();
  assert.equal(await catalog.locator('.rc-card').count(), 12);
  assert.equal(await page.locator('#reportContent > .task-panel').count(), 9);
  assert.equal(await catalog.locator('input[type=file], [data-result], [role=tabpanel]').count(), 0);
  checks.push('compiled React owns only the 12 public catalog cards; nine legacy panels stay separate');

  const destinations = await catalog.locator('.rc-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  assert.deepEqual(destinations, ['#analizar-sectores', '#analizar-movimientos', '#analizar-ausencias', '#certificados-escolares', '#haberes', '#resumen-mensual', '#planilla-bancaria', '#comparar', '/relojes', '/personal#legajos', '#descargas', '#formatos']);
  await catalog.locator('[data-catalog-search]').fill('  DOTACION  ');
  assert.equal(await catalog.locator('.rc-card').count(), 1);
  assert.match(await catalog.locator('[role=status]').innerText(), /1 de 12/);
  await catalog.locator('[data-catalog-search]').fill('sin-coincidencia-qa');
  assert.equal(await catalog.locator('.rc-card').count(), 0);
  assert.match(await catalog.locator('.rc-empty').innerText(), /limpiá la búsqueda/);
  await catalog.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  assert.equal(await catalog.locator('.rc-card').count(), 12);
  assert.equal(await catalog.locator('[data-catalog-search]').evaluate(node => node === document.activeElement), true);
  checks.push('accent-insensitive trimmed search, live result count, honest empty state and keyboard focus on reset');

  for (const target of ['certificados-escolares', 'planilla-bancaria', 'resumen-mensual']) {
    await catalog.locator(`a[href="#${target}"]`).click();
    assert.equal(await page.locator('#task-' + target).isVisible(), true);
    assert.equal(await page.locator('#reportContent > .task-panel:visible').count(), 1);
    await page.goBack();
    await page.locator('#task-biblioteca').waitFor({ state: 'visible' });
  }
  await page.getByRole('tab', { name: 'Biblioteca', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#task-analizar').isVisible(), true);
  await page.goBack();
  await page.locator('#task-biblioteca').waitFor({ state: 'visible' });
  checks.push('schooling, bank and monthly summary cards keep hashes, browser back and existing keyboard tabs');

  await page.goto(origin + '/reportes-rrhh#f931');
  await page.locator('#f931 input[type=file]').waitFor();
  const fileInput = page.locator('#f931 input[type=file]').first();
  await fileInput.setInputFiles({ name: 'control-sintetico-qa.txt', mimeType: 'text/plain', buffer: Buffer.from('QA') });
  await page.getByRole('tab', { name: 'Biblioteca', exact: true }).click();
  await page.locator('#mc-report-catalog-root[data-react-catalog="ready"]').waitFor();
  await catalog.locator('[data-catalog-search]').fill('banco');
  await page.getByRole('tab', { name: 'Controles externos', exact: true }).click();
  assert.equal(await fileInput.evaluate(node => node.files[0]?.name), 'control-sintetico-qa.txt');
  assert.equal(await page.getByRole('button', { name: 'Presentar a ARCA', exact: true }).isEnabled(), false);
  await page.getByRole('tab', { name: 'Biblioteca', exact: true }).click();
  assert.equal(await catalog.locator('[data-catalog-search]').inputValue(), 'banco');
  await catalog.getByRole('button', { name: 'Limpiar búsqueda' }).click();
  checks.push('React filtering and task navigation preserve the selected external file; submission stays disabled');

  await page.screenshot({ path: path.join(output, 'report-catalog-react-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await catalog.locator('[data-catalog-search]').fill('descuentos');
  assert.equal(await catalog.locator('.rc-card').count(), 1);
  await page.screenshot({ path: path.join(output, 'report-catalog-react-mobile.png'), fullPage: true });
  checks.push('mobile width and reduced motion preserve readable search and cards');

  const lifecycle = await page.evaluate(async bundleHref => {
    const { mountReportCatalog } = await import(bundleHref);
    const host = document.createElement('div'); document.body.append(host);
    host.innerHTML = '<label>Buscar<input type="search" data-catalog-search value="sintetico"></label>';
    const original = host.querySelector('input'); original.focus();
    const cards = [['Sintético de prueba', 'Consulta de QA', 'Control', '#qa', 'QA']];
    const handle = mountReportCatalog(host, { cards });
    const repeated = mountReportCatalog(host, { cards });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const preserved = host.querySelector('input').value === 'sintetico' && document.activeElement === host.querySelector('input');
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
    const cached = host.dataset.reactCatalog === 'ready';
    handle.unmount(); handle.unmount();
    const cleared = host.childElementCount === 0 && !host.dataset.reactCatalog;
    const next = mountReportCatalog(host, { cards });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const remounted = host.dataset.reactCatalog === 'ready' && next !== handle;
    next.unmount(); host.remove();
    return { sameHandle: repeated === handle, preserved, cached, cleared, remounted };
  }, bundle);
  assert.deepEqual(lifecycle, { sameHandle: true, preserved: true, cached: true, cleared: true, remounted: true });
  checks.push('single mount, early query and focus preserved, bfcache retained, explicit unmount and remount work');
  await context.close();

  const fallback = await open({ blockBundle: true, width: 390 });
  await fallback.page.locator('[data-catalog-search]').fill('descuentos');
  assert.equal(await fallback.page.locator('#mc-report-catalog-root .rc-card:visible').count(), 1);
  await fallback.page.locator('#mc-report-catalog-root a[href="#haberes"]').click();
  assert.equal(await fallback.page.locator('#task-haberes').isVisible(), true);
  assert.equal(await fallback.page.locator('[data-react-catalog]').count(), 0);
  checks.push('failed optional React bundle leaves the working catalog and private-report entry usable');
  await fallback.context.close();
  assert.deepEqual(errors, []);
  const result = { checksPassed: checks.length, checks, errors, apiResponsesSynthetic: true, municipalSessionTested: false };
  fs.writeFileSync(path.join(output, 'report-catalog-react-browser.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
