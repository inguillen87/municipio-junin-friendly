// Real compiled page and React island; API responses are synthetic, never municipal data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('public');
const output = path.resolve('verification');
const origin = 'https://noelia-report-workspace.test';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CATALOG_BROWSER_CHANNEL ? {channel:process.env.CATALOG_BROWSER_CHANNEL} : {}) });
const checks = [], errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 401, json: { ok: false, authenticated: false } });
    let pathname = decodeURIComponent(url.pathname);
    if (!path.extname(pathname)) pathname += '.html';
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    const contentType = file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType, body: fs.readFileSync(file) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/reportes-rrhh');
  // Scope to the component's explicit contract, not legacy mounting wrappers.
  const catalog = page.locator('[data-catalog-workspace="v2"]');
  await catalog.waitFor();
  const search = catalog.locator('[data-catalog-search]');
  const format = catalog.locator('[data-catalog-format]');
  const group = catalog.getByRole('group', { name: 'Área de trabajo' });
  const count = () => catalog.locator('.rc-card').count();
  const reset = () => catalog.getByRole('button', { name: 'Restablecer filtros', exact: true }).click();
  const clear = () => catalog.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click();
  assert.equal(await count(), 14);
  assert.equal(await group.getByRole('button').count(), 6);
  assert.equal(await page.locator('#reportContent > .task-panel').count(), 11);
  checks.push('fourteen cards, six area controls and eleven distinct task panels');

  await group.getByRole('button', { name: 'Personal', exact: true }).click();
  assert.equal(await count(), 5);
  await format.selectOption('PDF');
  assert.equal(await count(), 4);
  await search.fill('ausencias');
  assert.equal(await count(), 1);
  await clear();
  assert.equal(await count(), 4);
  assert.equal(await format.inputValue(), 'PDF');
  assert.equal(await group.getByRole('button', { name: 'Personal', exact: true }).getAttribute('aria-pressed'), 'true');
  await reset();
  assert.equal(await count(), 14);
  assert.equal(await search.evaluate(node => node === document.activeElement), true);
  checks.push('area, format and query intersect; clearing search preserves filters, full reset restores focus');

  const payroll = group.getByRole('button', { name: 'Nómina', exact: true });
  await payroll.focus();
  await page.keyboard.press('Space');
  assert.equal(await payroll.getAttribute('aria-pressed'), 'true');
  assert.equal(await count(), 6);
  assert.equal(await payroll.evaluate(node => node.matches(':focus-visible')), true);
  await format.selectOption('CSV');
  assert.equal(await count(), 2);
  await search.fill('descuentos');
  await catalog.locator('a[href="#haberes"]').click();
  await page.locator('#task-haberes').waitFor({ state: 'visible' });
  await page.goBack();
  await page.locator('#task-biblioteca').waitFor({ state: 'visible' });
  assert.equal(await search.inputValue(), 'descuentos');
  assert.equal(await format.inputValue(), 'CSV');
  assert.equal(await payroll.getAttribute('aria-pressed'), 'true');
  assert.equal(await count(), 1);
  await reset();
  checks.push('keyboard area selection and browser back preserve query, area, format and existing report panel');

  for (const [query, href] of [
    ['estructura presupuestaria', '#estructura-presupuestaria'], ['sector DOTACIÓN', '#analizar-sectores'], ['mutuales', '#haberes'],
    ['planilla NACIÓN', '#planilla-bancaria'], ['escolaridad', '#certificados-escolares'],
    ['recibos', '/personal#legajos'], ['fichadas', '/relojes'], ['F.931', '#formatos'],
  ]) {
    await search.fill(query);
    assert.equal(await count(), 1, query);
    assert.equal(await catalog.locator('.rc-card').getAttribute('href'), href, query);
  }
  assert.equal(await catalog.locator('.rc-card').getAttribute('data-external-control'), 'true');
  assert.match(await catalog.locator('.rc-origin').innerText(), /archivos externos/);
  assert.match(await catalog.locator('.rc-task-note').innerText(), /no envía pagos ni presenta declaraciones/);
  await format.selectOption('Excel');
  assert.equal(await count(), 0);
  assert.match(await catalog.locator('.rc-empty').innerText(), /área o formato/);
  assert.match(await catalog.getByRole('status').innerText(), /0 de 14/);
  assert.equal(await format.locator('option[value="TXT"]').count(), 0);
  await reset();
  checks.push('administrative vocabulary, unordered words and accents find real destinations; external controls do not advertise TXT or Excel generation');

  await group.getByRole('button', { name: 'Asistencia', exact: true }).click();
  await format.selectOption('PDF');
  assert.equal(await count(), 0);
  assert.match(await catalog.getByRole('status').innerText(), /Área: Asistencia\. Formato: PDF\./);
  await reset();
  await page.screenshot({ path: path.join(output, 'noelia-report-workspace-desktop.png'), fullPage: true });
  checks.push('empty combinations remain explicit rather than silently widening the search');

  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no overflow at ${width}px`);
    assert.ok(await group.getByRole('button').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height >= 44)));
    await group.getByRole('button', { name: 'Nómina', exact: true }).click();
    await format.selectOption('Excel');
    await search.fill('mutuales');
    assert.equal(await count(), 1);
    const card = catalog.locator('.rc-card');
    assert.equal(await card.isVisible(), true);
    assert.ok(await card.evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1; }));
    await page.screenshot({ path: path.join(output, `noelia-report-workspace-mobile-${width}.png`), fullPage: true });
    await reset();
  }
  checks.push('320px and 390px layouts, readable card actions, 44px targets and reduced motion');
  assert.deepEqual(errors, []);
  const result = { checksPassed: checks.length, checks, errors, apiResponsesSynthetic: true, municipalSessionTested: false };
  fs.writeFileSync(path.join(output, 'noelia-report-workspace-browser.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  await context.close();
} finally { await browser.close(); }
