// Only synthetic API responses. Reusable checks for built and deployed UI.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export async function verifyReportCatalogViews(page, catalog, prefix) {
  const checks = [];
  const display = catalog.getByRole('group', { name: 'Presentación de reportes' });
  const shortcuts = catalog.getByRole('group', { name: 'Accesos rápidos de reportes' });
  const search = catalog.locator('[data-catalog-search]');
  const format = catalog.locator('[data-catalog-format]');
  const areas = catalog.getByRole('group', { name: 'Área de trabajo' });
  const count = () => catalog.locator('.rc-card').count();
  const reset = () => catalog.getByRole('button', { name: 'Restablecer filtros', exact: true }).click();
  const initial = await catalog.locator('.rc-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  assert.equal(initial.length, 12);
  assert.equal(await display.getByRole('button', { name: 'Tarjetas', exact: true }).getAttribute('aria-pressed'), 'true');
  const list = display.getByRole('button', { name: 'Lista compacta', exact: true });
  await list.focus();
  await page.keyboard.press('Space');
  assert.equal(await list.getAttribute('aria-pressed'), 'true');
  assert.equal(await catalog.locator('.rc-card').first().evaluate(node => getComputedStyle(node).display), 'grid');
  assert.deepEqual(await catalog.locator('.rc-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('href'))), initial);
  checks.push('keyboard switches presentation without changing the twelve report destinations');

  await areas.getByRole('button', { name: 'Asistencia', exact: true }).click();
  await format.selectOption('PDF');
  assert.equal(await count(), 0);
  for (const [name, href] of [['Bancos', '#planilla-bancaria'], ['Escolaridad', '#certificados-escolares'], ['Recibos', '/personal#legajos'], ['Mutuales', '#haberes']]) {
    await shortcuts.getByRole('button', { name, exact: true }).click();
    assert.equal(await count(), 1, name);
    assert.equal(await catalog.locator('.rc-card').getAttribute('href'), href);
    assert.equal(await format.inputValue(), 'all');
    assert.equal(await search.evaluate(node => node === document.activeElement), true);
    assert.equal(await list.getAttribute('aria-pressed'), 'true');
  }
  checks.push('four shortcuts reset incompatible filters, preserve presentation and restore search focus');

  await display.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  assert.equal(await search.inputValue(), 'mutuales');
  assert.equal(await count(), 1);
  await list.click();
  await catalog.locator('a[href="#haberes"]').click();
  await page.locator('#task-haberes').waitFor({ state: 'visible' });
  await page.goBack();
  await catalog.waitFor({ state: 'visible' });
  assert.equal(await search.inputValue(), 'mutuales');
  assert.equal(await list.getAttribute('aria-pressed'), 'true');
  assert.equal(await count(), 1);
  await reset();
  assert.equal(await count(), 12);
  assert.equal(await list.getAttribute('aria-pressed'), 'true');
  checks.push('changing layout and navigating to a task/back preserve filters and view; reset clears only filters');

  await page.screenshot({ path: `${prefix}-desktop.png`, fullPage: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await shortcuts.getByRole('button', { name: 'Bancos', exact: true }).click();
    assert.equal(await count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(await catalog.locator('.rc-card').evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1; }));
    assert.ok(await display.getByRole('button').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)));
    await page.screenshot({ path: `${prefix}-mobile-${width}.png`, fullPage: true });
    await reset();
  }
  checks.push('compact mobile layout at 320/390px keeps readable actions, 44px controls and reduced motion');
  return checks;
}

async function main() {
  const root = path.resolve('public'), origin = 'https://report-catalog-views.test';
  fs.mkdirSync('verification', { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/api/internal-auth') return route.fulfill({ status: 200, json: {
        ok: true, authenticated: true, user: { name: 'QA sintético', email: 'qa@example.invalid', role: 'ADMIN_INTERNO' },
        access: { tenantCapabilities: ['workforce.summary.read', 'workforce.employee.read', 'management.analytics.read', 'payroll.read', 'attendance.read'], platformCapabilities: [], platformRoles: [] },
      } });
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 401, json: { ok: false, authenticated: false } });
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const contentType = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
      return route.fulfill({ status: 200, contentType, body: fs.readFileSync(file) });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/reportes-rrhh.html');
    const catalog = page.locator('[data-catalog-workspace="v2"]');
    await catalog.waitFor({ state: 'visible' });
    const checks = await verifyReportCatalogViews(page, catalog, 'verification/report-catalog-views');
    assert.deepEqual(errors, []);
    const result = { checksPassed: checks.length, checks, errors, apiResponsesSynthetic: true, municipalSessionTested: false };
    fs.writeFileSync('verification/report-catalog-views-browser.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    await context.close();
  } finally { await browser.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
