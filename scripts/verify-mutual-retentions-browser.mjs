/** Synthetic browser QA only. Every request is intercepted; no real session, municipal API or backend write.
 * Default: complete public/ build, with no source overlays.
 * MUTUAL_RETENTIONS_BUILD_DIR selects a separately prepared build.
 * MUTUAL_RETENTIONS_SOURCE_OVERLAY=1 is an explicit development-only mode. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
import { mutualFixture, mutualCatalog } from '../tests/mutual-retentions/fixture.mjs';

const origin = 'https://mutual-retentions.test', base = path.resolve(process.env.MUTUAL_RETENTIONS_BUILD_DIR ?? 'public');
const out = path.resolve('verification/mutual-retentions'), overlay = process.env.MUTUAL_RETENTIONS_SOURCE_OVERLAY === '1';
assert.ok(!overlay || !process.env.CI, 'SOURCE_OVERLAY_NOT_ALLOWED_IN_CI');
const changedAssets = new Set(['payroll-monthly-summary.js', 'payroll-monthly-summary-model.js', 'payroll-monthly-summary-export.js', 'payroll-monthly-summary.css'].map(file => '/assets/' + file));
if (!overlay) for (const asset of changedAssets) {
  const built = path.join(base, asset.slice(1));
  assert.ok(fs.existsSync(built) && fs.readFileSync(built).equals(fs.readFileSync(path.resolve('.' + asset))), 'STALE_OR_MISSING_BUILD_ASSET: ' + asset);
}
fs.mkdirSync(out, { recursive: true });
const checks = [], errors = [], calls = [], downloads = [];
let mutate = null, responseError = null, hold = null;
const browser = await chromium.launch({ headless: true, ...(process.env.MUTUAL_RETENTIONS_BROWSER_CHANNEL ? { channel: process.env.MUTUAL_RETENTIONS_BROWSER_CHANNEL } : {}) });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, locale: 'es-AR', acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    assert.equal(request.method(), 'GET', 'READ_ONLY_QA_MUST_NOT_WRITE');
    if (!url.pathname.startsWith('/api/')) {
      const root = overlay && changedAssets.has(url.pathname) ? path.resolve('.') : base;
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: /\.m?js$/.test(file) ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream', body: fs.readFileSync(file) });
    }
    calls.push({ path: url.pathname, resource: url.searchParams.get('resource'), period: url.searchParams.get('period'), datasetIds: url.searchParams.get('datasetIds'), method: request.method() });
    if (url.pathname === '/api/internal-payroll-monthly-source-summary') {
      if (hold) { const waiting = hold; hold = null; await waiting; }
      if (responseError) return route.fulfill({ status: responseError.status, json: { ok: false, code: responseError.code } });
      if (url.searchParams.get('resource') === 'catalog') { const payload = mutualCatalog(); payload.data.period = url.searchParams.get('period'); return route.fulfill({ status: 200, json: payload }); }
      const ids = url.searchParams.get('datasetIds').split(',');
      const payload = mutualFixture(undefined, mutualCatalog().data.items.filter(source => ids.includes(source.datasetId)));
      assert.equal(url.searchParams.get('period'), '2026-08');
      if (mutate) mutate(payload);
      return route.fulfill({ status: 200, json: payload });
    }
    if (url.pathname === '/api/internal-auth') return route.fulfill({ status: 200, json: { ok: true, authenticated: true,
      user: { name: 'Operador sintético QA', email: 'qa@example.invalid', role: 'ADMIN_INTERNO' }, access: { tenantCapabilities: ['payroll.read', 'workforce.summary.read'], platformCapabilities: [], platformRoles: [] } } });
    return route.fulfill({ status: 200, json: { ok: true, data: [] } });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message)); page.on('download', download => downloads.push(download));
  const panel = page.locator('#resumen-mensual'), state = panel.locator('[data-ms-status]');
  const idle = () => page.waitForFunction(() => document.querySelector('#resumen-mensual')?.getAttribute('aria-busy') === 'false');
  async function consult() { await panel.locator('[data-ms-consult]').click(); await idle(); }
  async function available() { await panel.locator('[data-ms-catalog]').click(); await idle(); await panel.locator('[data-ms-period]').selectOption('2026-08'); for (const checkbox of await panel.locator('[data-ms-id]').all()) await checkbox.check(); await consult(); }
  async function open() { await panel.locator('.ms-mutuals summary').click(); }
  async function preset() { await panel.locator('[data-mr-preset]').click(); }
  async function exported(format, name = 'mutuals-synthetic') {
    const event = page.waitForEvent('download'), before = calls.length;
    await panel.locator('[data-mr-export="' + format + '"]').click(); const download = await event; await idle();
    assert.ok(calls.length > before); assert.equal(calls.at(-1).resource, 'summary'); assert.equal(calls.at(-1).period, '2026-08');
    const file = path.join(out, name + '.' + format); await download.saveAs(file); return file;
  }
  async function screenshot(name, width, selector = '.ms-mutuals') {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1050 });
    await page.evaluate(async target => {
      let label = document.getElementById('mutuals-qa-label'); if (!label) { label = document.createElement('div'); label.id = 'mutuals-qa-label'; label.textContent = 'QA SINTÉTICA · APIs simuladas · No evidencia municipal'; label.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff0cb;color:#453406;font:700 12px Arial;padding:8px;text-align:center'; document.body.append(label); }
      document.activeElement?.blur(); await document.fonts.ready; window.scrollTo({ top: window.scrollY + document.querySelector(target).getBoundingClientRect().top - 85, behavior: 'instant' });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, selector);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'PAGE_OVERFLOW');
    await page.screenshot({ path: path.join(out, name + '.png') });
  }
  await page.goto(origin + '/reportes-rrhh.html#resumen-mensual');
  await panel.locator('[data-ms-catalog]').waitFor(); assert.equal(calls.filter(call => call.resource).length, 0);
  await available(); await open(); assert.equal(await panel.locator('[data-mr-code]:checked').count(), 0); assert.equal(await panel.locator('[data-mr-export="xlsx"]').isDisabled(), true);
  checks.push('explicit source consultation; no monthly read on mount and no mutual concepts autoselected');
  await preset(); assert.equal(await panel.locator('[data-mr-code]:checked').count(), 10);
  assert.equal(await panel.locator('[data-mr-code][value="0614"]').count(), 1); assert.equal(await panel.locator('[data-mr-code][value="614"]').count(), 0);
  assert.equal(await panel.locator('[data-mr-code][value="996"]').count(), 0); assert.equal(await panel.locator('[data-mr-total]').innerText(), '1,90');
  assert.equal(await panel.locator('[data-mr-rows] tr').count(), 10);
  checks.push('August preset resolves 614 to unique literal 0614, preserves ten choices and excludes totalizers');
  await panel.locator('[data-ms-search]').fill('no coincide'); assert.equal(await panel.locator('[data-ms-export="xlsx"]').isDisabled(), true);
  assert.equal(await panel.locator('[data-mr-export="xlsx"]').isDisabled(), false);
  const excel = await exported('xlsx'), zip = unzipSync(fs.readFileSync(excel)), detail = strFromU8(zip['xl/worksheets/sheet1.xml']);
  assert.equal((detail.match(/<row /g) || []).length, 13); assert.match(detail, />0614<\/t>/); assert.match(detail, /<v>1.90<\/v>/);
  const pdf = await exported('pdf'); assert.match(fs.readFileSync(pdf).toString(), /^%PDF-1.4/);
  assert.match(strFromU8(zip['xl/worksheets/sheet2.xml']), /00000000-0000-4000-8000-000000000002/);
  assert.match(strFromU8(zip['xl/worksheets/sheet3.xml']), /Sin firma aplicada/);
  checks.push('mutual exports ignore general text filter, recheck summary access and carry exact values, period, datasets and provenance');
  await panel.locator('[data-ms-search]').fill('');
  await panel.locator('[data-mr-search]').fill('606'); await panel.locator('[data-mr-code][value="606"]').check();
  assert.equal(await panel.locator('[data-mr-total]').innerText(), '2,10');
  await panel.locator('[data-mr-search]').fill(''); await panel.locator('[data-mr-code][value="0614"]').uncheck();
  assert.equal(await panel.locator('[data-mr-total]').innerText(), '2,00');
  await preset(); assert.equal(await panel.locator('[data-mr-total]').innerText(), '1,90');
  checks.push('search, add, remove and restore preset keep existing choices and recalculate exact selected components');
  await screenshot('mutuals-desktop-synthetic', 1440); await screenshot('mutuals-mobile-synthetic', 390);
  await screenshot('mutuals-totals-desktop-synthetic', 1440, '.mr-totals'); await screenshot('mutuals-totals-mobile-synthetic', 390, '.mr-totals');
  await page.setViewportSize({ width: 1440, height: 1050 });
  checks.push('desktop and 390px mobile preserve readable selection, totals, confined table scrolling and zero page overflow');
  mutate = payload => { payload.data.rows[4].code = '650'; Object.assign(payload.data.rows[1], { missingAmounts: 1, amount: null }); payload.data.rows[2].totalGroup = '993'; };
  await consult(); assert.equal(await panel.locator('[data-mr-total]').innerText(), 'No determinable');
  assert.match(await panel.locator('[data-mr-status]').innerText(), /1 ausentes · 1 con importe faltante · 1 no sumables/);
  const incomplete = await exported('xlsx', 'mutuals-pending-synthetic');
  assert.match(strFromU8(unzipSync(fs.readFileSync(incomplete))['xl/worksheets/sheet1.xml']), /No equivale a cero/);
  checks.push('missing, absent and non-summable values remain separate and export with an explicitly undetermined total');
  mutate = payload => { payload.data.rows[1].code = '614'; }; await consult();
  assert.match(await panel.locator('[data-mr-status]').innerText(), /inequívocos/); assert.equal(await panel.locator('[data-mr-export="pdf"]').isDisabled(), true);
  assert.equal(await panel.locator('[data-ms-result]').isVisible(), true); assert.equal(await panel.locator('[data-ms-export="xlsx"]').isDisabled(), false);
  checks.push('ambiguous source aliases block mutual detail only and keep the verified general summary usable');
  mutate = payload => { payload.data.rows[0].description = 'Descuento sintético 🧾'; }; await consult();
  let before = downloads.length; await panel.locator('[data-mr-export="pdf"]').click(); await idle();
  assert.equal(downloads.length, before); assert.match(await state.innerText(), /Descargá el Excel/); assert.equal(await panel.locator('[data-ms-result]').isVisible(), true);
  await exported('xlsx', 'mutuals-unicode-synthetic'); checks.push('unsupported PDF glyphs preserve the report and allow exact Excel export');
  mutate = null; await consult();
  for (const [name, change] of [['closure', payload => { payload.data.sources[0].closureStatus = 'unknown'; }], ['source content', payload => { payload.data.sources[0].payloadHash = 'c'.repeat(64); }], ['amount', payload => { payload.data.rows[0].amount = '10.00'; }]]) {
    before = downloads.length; mutate = change; await panel.locator('[data-mr-export="xlsx"]').click(); await idle();
    assert.equal(downloads.length, before); assert.match(await state.innerText(), /Cambió el resumen/); assert.equal(await panel.locator('[data-ms-result]').isVisible(), false);
    checks.push(name + ' drift blocks download even when report hash is unchanged'); mutate = null; await consult();
  }
  for (const [statusCode, message] of [[403, /permiso vigente/], [401, /sesión venció/]]) {
    before = downloads.length; responseError = { status: statusCode, code: 'SESSION_OR_CAPABILITY_REVOKED' };
    await panel.locator('[data-mr-export="pdf"]').click(); await idle(); assert.equal(downloads.length, before); assert.match(await state.innerText(), message);
    assert.equal(await panel.locator('[data-ms-result]').isVisible(), false); assert.equal(await panel.locator('[data-ms-selection]').isVisible(), false);
    assert.equal(await panel.locator('[data-mr-rows] tr').count(), 0);
    responseError = null; await available();
  }
  checks.push('401 and 403 during revalidation remove protected rows and source labels with no download or fallback');
  async function cancelledExport(action) {
    let release; hold = new Promise(resolve => { release = resolve; }); before = downloads.length;
    try { await panel.locator('[data-mr-export="xlsx"]').click(); await page.waitForFunction(() => document.querySelector('#resumen-mensual').getAttribute('aria-busy') === 'true'); await action(); }
    finally { release(); }
    await idle(); await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 30))); assert.equal(downloads.length, before);
  }
  await cancelledExport(() => panel.locator('[data-mr-code][value="620"]').uncheck());
  assert.equal(await panel.locator('[data-ms-result]').isVisible(), true); assert.equal(await panel.locator('[data-mr-code]:checked').count(), 9);
  await preset(); await cancelledExport(() => panel.locator('[data-ms-id]:checked').first().uncheck());
  assert.equal(await panel.locator('[data-ms-result]').isVisible(), false); await consult();
  checks.push('changing mutual concepts or source datasets cancels an in-flight export and prevents late downloads');
  await cancelledExport(() => page.evaluate(() => document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready'))));
  assert.equal(await panel.locator('[data-ms-result]').isVisible(), false); assert.equal(await panel.locator('[data-ms-selection]').isVisible(), false);
  checks.push('capability or tenant refresh cancels export and clears the cached report and catalog');
  await available(); await panel.locator('[data-mr-clear]').click(); assert.equal(await panel.locator('[data-mr-rows] tr').count(), 0); assert.equal(await panel.locator('[data-mr-export="pdf"]').isDisabled(), true);
  checks.push('clearing all concepts removes totals and disables downloads');
  assert.deepEqual(errors, []);
  const result = { ok: true, mode: overlay ? 'local_build_shell_with_four_source_assets' : 'prepared_build', builtAssetsMatch: overlay ? null : true, checksPassed: checks.length, checks, errors, syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false, browser: browser.version() };
  fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  fs.writeFileSync(path.join(out, 'browser-report.json'), JSON.stringify({ ok: false, checksPassed: checks.length, checks, errors, error: error.message, syntheticDataOnly: true, municipalSessionTested: false, backendWrites: false }, null, 2)); throw error;
} finally { await browser.close(); }
