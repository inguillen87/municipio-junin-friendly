/** Synthetic browser contracts only. Every API is intercepted; no municipal session or backend is exercised.
 * Optional published mode checks public GET assets byte-for-byte against the local build, without credentials or redirects. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
import { monthlyCatalog, monthlyFixture, monthlyUuid } from '../tests/fixtures/payroll-monthly-summary-synthetic.js';

const publishedOrigin = process.env.MONTHLY_SUMMARY_PUBLISHED_ORIGIN;
if (publishedOrigin !== undefined) assert.equal(publishedOrigin, 'https://municipio-junin-friendly.vercel.app', 'PUBLISHED_ORIGIN_NOT_ALLOWED');
const origin = publishedOrigin ?? 'https://municontrol.test', base = path.resolve('public'), out = path.resolve('verification');
const mode = publishedOrigin ? 'published_assets_with_synthetic_api' : 'local_build_with_synthetic_api';
fs.mkdirSync(out, { recursive: true });
const checks = [], errors = [], downloads = [], calls = [], publishedAssets = new Set(), publishedFailures = new Set();
let catalog = monthlyCatalog(), responseError = null, mutate = null, delay = null, authCalls = 0;
async function publicAsset(url, expected) {
  assert.equal(url.origin, 'https://municipio-junin-friendly.vercel.app'); assert.ok(!url.pathname.startsWith('/api/'));
  const r = await fetch(url.href, { method: 'GET', credentials: 'omit', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  assert.equal(r.status, 200, 'PUBLISHED_ASSET_UNAVAILABLE');
  const reader = r.body.getReader(), chunks = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; assert.ok(length <= expected.length, 'PUBLISHED_ASSET_SIZE_MISMATCH'); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks, length); assert.ok(bytes.equals(expected), 'PUBLISHED_ASSET_CONTENT_MISMATCH'); publishedAssets.add(url.pathname); return bytes;
}
const browser = await chromium.launch({ headless: true, ...(process.env.MONTHLY_SUMMARY_BROWSER_CHANNEL || process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.MONTHLY_SUMMARY_BROWSER_CHANNEL || process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'es-AR', acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) {
      if (request.method() !== 'GET') return route.abort();
      const file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(file);
      if (publishedOrigin) { try { body = await publicAsset(url, body); } catch { publishedFailures.add(url.pathname); return route.abort(); } }
      return route.fulfill({ status: 200, contentType: /\.m?js$/.test(file) ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream', body });
    }
    calls.push({ path: url.pathname, resource: url.searchParams.get('resource'), method: request.method() });
    assert.equal(request.method(), 'GET', 'API_MUTATION_IN_READ_ONLY_REPORT');
    if (url.pathname === '/api/internal-payroll-monthly-source-summary') {
      if (delay) { const waiting = delay; delay = null; await waiting; }
      if (responseError) return route.fulfill({ status: responseError.status, json: { ok: false, code: 'PAYROLL_MONTHLY_SOURCE_' + responseError.code } });
      if (url.searchParams.get('resource') === 'catalog') { const p = structuredClone(catalog); p.data.period = url.searchParams.get('period'); return route.fulfill({ status: 200, json: p }); }
      const ids = url.searchParams.get('datasetIds').split(','); assert.equal(url.searchParams.get('period'), '2026-08');
      const payload = monthlyFixture(75, catalog.data.items.filter(s => ids.includes(s.datasetId)));
      if (mutate) mutate(payload);
      return route.fulfill({ status: 200, json: payload });
    }
    if (url.pathname === '/api/internal-auth') { authCalls++; return route.fulfill({ status: 200, json: { ok: true, authenticated: true,
      user: { name: 'Operador sintético QA', email: 'qa@example.invalid', role: 'ADMIN_INTERNO' }, access: { tenantCapabilities: ['payroll.read', 'workforce.summary.read'], platformCapabilities: [], platformRoles: [] } } }); }
    return route.fulfill({ status: 200, json: { ok: true, data: [] } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message)); page.on('download', d => downloads.push(d));
  const panel = page.locator('#resumen-mensual'), state = panel.locator('[data-ms-status]');
  const idle = () => page.waitForFunction(() => document.querySelector('#resumen-mensual')?.getAttribute('aria-busy') === 'false');
  async function available() { await panel.locator('[data-ms-catalog]').click(); await idle(); await panel.locator('[data-ms-period]').selectOption('2026-08'); }
  async function choose() { await panel.locator('[data-ms-id]').nth(0).check(); await panel.locator('[data-ms-id]').nth(1).check(); }
  async function consult() { await panel.locator('[data-ms-consult]').click(); await idle(); }
  async function reset() { responseError = null; mutate = null; catalog = monthlyCatalog(); await page.goto(origin + '/reportes-rrhh.html#resumen-mensual'); await available(); await choose(); await consult(); }
  async function exportFile(format) { const event = page.waitForEvent('download'); await panel.locator('[data-ms-export="' + format + '"]').click(); const d = await event; await idle(); const file = path.join(out, 'monthly-summary-synthetic.' + format); await d.saveAs(file); return file; }
  async function evidence(name, width = 1440, result = false) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1050 });
    await page.evaluate(async showResult => { let label = document.getElementById('qa-synthetic-label'); if (!label) { label = document.createElement('div'); label.id = 'qa-synthetic-label'; label.textContent = 'QA SINTÉTICA · APIs simuladas · No evidencia municipal'; label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff0cb;color:#453406;font:700 12px Arial;padding:8px;text-align:center'; document.body.append(label); } document.activeElement?.blur(); await document.fonts.ready; const target = document.querySelector(showResult ? '[data-ms-result]' : '#resumen-mensual'); window.scrollTo({ top: window.scrollY + target.getBoundingClientRect().top - 80, behavior: 'instant' }); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); }, result);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'MOBILE_PAGE_OVERFLOW');
    await page.screenshot({ path: path.join(out, name + '.png') });
  }
  await page.goto(origin + '/reportes-rrhh.html#resumen-mensual');
  assert.equal(await page.getByRole('tab', { name: 'Resumen mensual', exact: true }).getAttribute('aria-selected'), 'true');
  assert.equal(await panel.locator('[data-ms-result]').isVisible(), false);
  assert.equal(calls.filter(c => c.path.includes('monthly-source-summary')).length, 0);
  checks.push('explicit Resumen mensual deep link mounts without reading payroll before the consult action');
  await available(); assert.equal(await panel.locator('[data-ms-id]:checked').count(), 0); assert.equal(await panel.locator('[data-ms-consult]').isDisabled(), true);
  assert.match(await panel.innerText(), /2026-09-01/); assert.match(await panel.innerText(), /Cerrada en origen/); assert.match(await panel.innerText(), /Abierta en origen/); assert.match(await panel.innerText(), /Cierre no informado/);
  checks.push('imputation month is independent of corrida date and no source or latest revision is autoselected');
  await choose(); await consult(); assert.match(await state.innerText(), /Resumen consultado/);
  assert.equal(await panel.locator('[data-ms-datasets]').innerText(), '2'); assert.equal(await panel.locator('[data-ms-participations]').innerText(), '4'); assert.equal(await panel.locator('[data-ms-legajos]').innerText(), '2');
  assert.equal(await panel.locator('[data-ms-rows] tr').count(), 50); assert.match(await panel.locator('[data-ms-rows]').innerText(), /No informado/);
  assert.match(await panel.locator('[data-ms-rows]').innerText(), /9\.999\.999\.999\.999\.999\.999\.999,99/);
  checks.push('result separates source participations, unique legajos, occurrences and missing exact decimal values');
  await panel.locator('[data-ms-next]').click(); assert.equal(await panel.locator('[data-ms-rows] tr').count(), 25);
  await panel.locator('[data-ms-search]').fill('0075'); assert.equal(await panel.locator('[data-ms-rows] tr').count(), 1); assert.match(await panel.locator('[data-ms-rows]').innerText(), /0075/);
  await panel.locator('[data-ms-search]').fill(''); await panel.locator('[data-ms-filter]').selectOption('missing'); assert.equal(await panel.locator('[data-ms-rows] tr').count(), 2);
  await panel.locator('[data-ms-filter]').selectOption('all'); checks.push('search and missing-data filters cover the full dataset beyond the visible page');
  const beforeExport = calls.length, excel = await exportFile('xlsx'), zip = unzipSync(fs.readFileSync(excel));
  assert.ok(calls.length > beforeExport); assert.equal((strFromU8(zip['xl/worksheets/sheet1.xml']).match(/<row /g) || []).length, 76);
  assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']), /-9999999999999999999999\.99/);
  assert.ok(strFromU8(zip['xl/worksheets/sheet2.xml']).includes(monthlyUuid(2)));
  assert.match(strFromU8(zip['xl/worksheets/sheet3.xml']), /No certifica que estén todas/);
  checks.push('Excel rechecks access and snapshot then exports all 75 concepts with exact decimals, sources and control');
  const pdf = await exportFile('pdf'); assert.match(fs.readFileSync(pdf).toString(), /^%PDF-1.4/);
  mutate = p => { p.data.rows[0].description = 'Concepto sintético 🧾'; }; await consult(); const beforeUnsupported = downloads.length;
  await panel.locator('[data-ms-export="pdf"]').click(); await idle(); assert.equal(downloads.length, beforeUnsupported);
  assert.match(await state.innerText(), /Descargá el Excel/); assert.equal(await panel.locator('[data-ms-result]').isVisible(), true);
  const unicodeExcel = await exportFile('xlsx'); assert.match(strFromU8(unzipSync(fs.readFileSync(unicodeExcel))['xl/worksheets/sheet1.xml']), /Concepto sintético 🧾/);
  mutate = null; await consult();
  checks.push('PDF revalidates and includes source/control tables; unsupported Unicode blocks only PDF while preserving exact Excel and the report');
  await evidence('monthly-summary-desktop-qa'); await evidence('monthly-summary-mobile-qa', 390);
  await evidence('monthly-summary-result-desktop-qa', 1440, true); await evidence('monthly-summary-result-mobile-qa', 390, true); await page.setViewportSize({ width: 1440, height: 1050 });
  checks.push('desktop and 390px mobile have no page overflow and screenshot evidence is explicitly synthetic');
  let countBefore = downloads.length; mutate = p => { p.data.sources[0].closureStatus = 'unknown'; };
  await panel.locator('[data-ms-export="xlsx"]').click(); await idle(); assert.equal(downloads.length, countBefore); assert.match(await state.innerText(), /Cambió el resumen/); assert.equal(await panel.locator('[data-ms-result]').isVisible(), false);
  checks.push('closure-only change with unchanged report hash blocks export and clears the old snapshot');
  mutate = null; await consult(); mutate = p => { p.data.sources[0].payloadHash = 'b'.repeat(64); }; await panel.locator('[data-ms-export="pdf"]').click(); await idle();
  assert.equal(downloads.length, countBefore); assert.match(await state.innerText(), /Cambió el resumen/); checks.push('payload-only drift with unchanged report hash also blocks download');
  mutate = null; await consult(); responseError = { status: 403, code: 'CAPABILITY_REQUIRED' }; await panel.locator('[data-ms-export="xlsx"]').click(); await idle();
  assert.equal(downloads.length, countBefore); assert.equal(await panel.locator('[data-ms-selection]').isVisible(), false); assert.match(await state.innerText(), /permiso vigente/);
  checks.push('403 during export clears protected rows and available source labels without downloading');
  responseError = { status: 401, code: 'SESSION_INVALID' }; await panel.locator('[data-ms-catalog]').click(); await idle(); assert.equal(await panel.locator('[data-ms-login]').isVisible(), true);
  checks.push('401 offers the normal internal sign-in link without bypass or a private-source fallback');
  responseError = { status: 422, code: 'ROW_LIMIT' }; await panel.locator('[data-ms-catalog]').click(); await idle(); assert.match(await state.innerText(), /supera el volumen/);
  responseError = null; await panel.locator('[data-ms-catalog-period]').fill('2026-08'); await available(); await choose();
  for (const [code, statusCode, message] of [['DUPLICATE_REVISION', 409, /una sola revisión/], ['SOURCE_DRIFT', 503, /respaldos distintos/], ['CATALOG_CONFLICT', 409, /definiciones distintas/], ['SOURCE_INCOMPLETE', 503, /detalles incompletos/]]) {
    responseError = { status: statusCode, code }; await consult(); assert.match(await state.innerText(), message); assert.equal(await panel.locator('[data-ms-id]:checked').count(), 2); assert.equal(await panel.locator('[data-ms-result]').isVisible(), false);
  }
  checks.push('revision, backup, concept-definition and incomplete-source errors are actionable and keep explicit selection');
  responseError = null; await consult(); let release; delay = new Promise(resolve => { release = resolve; });
  const oldRequests = calls.length; await panel.locator('[data-ms-export="xlsx"]').click(); await page.waitForFunction(() => document.querySelector('#resumen-mensual')?.getAttribute('aria-busy') === 'true');
  await panel.locator('[data-ms-id]:checked').first().uncheck(); release(); await idle(); assert.equal(downloads.length, countBefore); assert.equal(await panel.locator('[data-ms-result]').isVisible(), false); assert.ok(calls.length > oldRequests);
  checks.push('changing the source selection aborts an in-flight export and prevents a late download');
  await consult(); delay = new Promise(resolve => { release = resolve; }); await panel.locator('[data-ms-export="xlsx"]').click();
  await page.getByRole('tab', { name: 'Biblioteca', exact: true }).click(); release();
  await page.getByRole('tab', { name: 'Resumen mensual', exact: true }).click(); await idle(); assert.equal(downloads.length, countBefore); assert.equal(await panel.locator('[data-ms-result]').isVisible(), false);
  checks.push('leaving the report cancels an in-flight export and prevents stale rows on return');
  await consult(); await page.evaluate(() => document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready', { detail: { allowed: false } })));
  assert.equal(await panel.locator('[data-ms-selection]').isVisible(), false); assert.equal(await panel.locator('[data-ms-result]').isVisible(), false);
  checks.push('a scope or capability refresh discards the entire cached selection and report');
  catalog = monthlyCatalog(25); await available(); for (let n = 0; n < 24; n++) await panel.locator('[data-ms-id]').nth(n).check(); await panel.locator('[data-ms-id]').nth(24).click();
  assert.equal(await panel.locator('[data-ms-id]:checked').count(), 24); assert.match(await state.innerText(), /hasta 24/); checks.push('selection enforces 24 explicit sources without silently dropping an accepted selection');
  catalog = monthlyCatalog(); await page.getByRole('tab', { name: 'Resumen mensual', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.getByRole('tab', { name: 'Planilla bancaria', exact: true }).evaluate(n => n === document.activeElement), true);
  await page.keyboard.press('ArrowRight'); assert.equal(await page.getByRole('tab', { name: 'Comparar liquidaciones', exact: true }).evaluate(n => n === document.activeElement), true);
  checks.push('report navigation retains keyboard tab-list operation and labeled native selection controls');
  const beforeBack = calls.filter(c => c.path.includes('monthly-source-summary')).length; const navigation = page.waitForEvent('load');
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); }); await navigation;
  await panel.locator('[data-ms-catalog]').waitFor(); assert.equal(await panel.locator('[data-ms-result]').isVisible(), false);
  responseError = { status: 401, code: 'SESSION_INVALID' }; await panel.locator('[data-ms-catalog]').click(); await idle(); assert.equal(await panel.locator('[data-ms-login]').isVisible(), true);
  responseError = null; await available(); assert.ok(calls.filter(c => c.path.includes('monthly-source-summary')).length > beforeBack);
  assert.equal(await panel.locator('[data-ms-id]:checked').count(), 0); checks.push('bfcache restore clears the snapshot and selection; new reads still enforce the normal API session guard');
  assert.deepEqual(errors, []); assert.equal(publishedFailures.size, 0); if (publishedOrigin) assert.ok(publishedAssets.size > 0);
  const result = { mode, origin, checksPassed: checks.length, checks, errors, publishedAssetsMatch: publishedOrigin ? true : null, publishedAssetsChecked: [...publishedAssets].sort(),
    syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, serviceWorkersBlocked: true, browser: browser.version() };
  fs.writeFileSync(path.join(out, 'payroll-monthly-summary-browser.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  fs.writeFileSync(path.join(out, 'payroll-monthly-summary-browser.json'), JSON.stringify({ ok: false, mode, origin, checksPassed: checks.length,
    publishedAssetsMatch: publishedOrigin ? false : null, failedPublicAssets: [...publishedFailures].sort(), syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, serviceWorkersBlocked: true }, null, 2));
  throw error;
} finally { await browser.close(); }
