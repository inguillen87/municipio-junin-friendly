/** Full task-shell tests. Only the browser's API responses are synthetic; no backend writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import readXlsxFile from 'read-excel-file/node';
import { comparisonFixtures, IDS } from './payroll-comparison-synthetic.mjs';

const live = process.env.COMPARISON_LIVE_ASSETS === '1';
const origin = live ? 'https://municipio-junin-friendly.vercel.app' : 'https://municontrol.test';
const root = path.resolve('public'), out = 'verification/comparison-056';
fs.mkdirSync(out, { recursive: true });
const checks = [], errors = [], calls = [], downloads = [];
const browser = await chromium.launch({ headless: true });
let mode = '', hold = false, waiting = [], catalogMode = '';
async function until(predicate) {
  const end = Date.now() + 15000;
  while (!predicate()) { if (Date.now() > end) throw Error('QA condition timed out'); await new Promise(r => setTimeout(r, 20)); }
}
function release() { hold = false; const all = waiting; waiting = []; all.forEach(resolve => resolve()); }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (u.origin !== origin) return route.abort();
    if (u.pathname.startsWith('/api/')) {
      assert.equal(request.method(), 'GET', 'The comparison must not issue write requests');
      if (u.pathname === '/api/internal-auth') return route.fulfill({ status: 200, json: { ok: true, authenticated: true,
        user: { name: 'QA sintético', email: 'qa@example.invalid', role: 'ADMIN_INTERNO' },
        access: { tenantCapabilities: ['payroll.read', 'workforce.employee.read'], platformCapabilities: [], platformRoles: [] } } });
      if (u.searchParams.get('resource') === 'payrollsourcereport') {
        const { reports, catalog } = comparisonFixtures();
        calls.push(Object.fromEntries(u.searchParams));
        const id = u.searchParams.get('datasetId');
        if (!id) {
          if (catalogMode === 'empty') { catalog.items = []; catalog.total = 0; }
          if (catalogMode === 'single') { catalog.items = catalog.items.slice(0,1); catalog.total = 1; }
          if (catalogMode === 'truncated') {
            for (let i = 4; i < 240; i++) catalog.items.push({ ...catalog.items[0], datasetId: String(i+100).padStart(8,'0')+'-0000-4000-8000-000000000056' });
            catalog.total = 300; catalog.truncated = true;
          }
          return route.fulfill({ status: 200, json: { ok: true, data: catalog } });
        }
        const data = reports.find(report => report.datasetId === id);
        const thisMode = mode;
        if (hold) await new Promise(resolve => waiting.push(resolve));
        if (thisMode === 'deny') return route.fulfill({ status: 403, json: { ok: false } }).catch(() => {});
        if (thisMode === 'network') return route.abort().catch(() => {});
        if (id === IDS[1]) {
          if (thisMode === 'hash') data.reportHash = 'b'.repeat(64);
          if (thisMode === 'contents') data.rows[0].amount = '1100.12';
          if (thisMode === 'closure') data.closureStatus = 'closed';
          if (thisMode === 'malformed') data.lineCount++;
          if (thisMode === 'missing') { data.found = false; delete data.rows; }
          if (thisMode === 'catalog-drift') data.payloadHash = 'a'.repeat(64);
        }
        return route.fulfill({ status: 200, json: { ok: true, data } }).catch(() => {});
      }
      return route.fulfill({ status: 200, json: { ok: true, data: [], status: 'ready', runs: [], limitations: ['QA sintético'] } });
    }
    if (live) return route.continue();
    const file = path.resolve(root, '.' + decodeURIComponent(u.pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: file.endsWith('.html') ? 'text/html' : file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream', body: fs.readFileSync(file) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message)); page.on('download', event => downloads.push(event));
  const $ = selector => page.locator('#task-comparar ' + selector);
  const visible = async selector => $(selector).waitFor({ state: 'visible' });
  const hidden = async selector => $(selector).waitFor({ state: 'hidden' });
  const rows = () => $('[data-pc-rows] tr');
  // Helper deliberately waits for state rather than arbitrary network sleeps.
  async function loadCatalog() {
    await $('[data-pc-catalog]').click(); await visible('[data-pc-query]');
    await page.waitForFunction(() => document.querySelector('#task-comparar [data-pc-base]')?.options.length > 1);
    await page.waitForFunction(() => !document.querySelector('#task-comparar [data-pc-catalog]')?.disabled);
  }
  async function compareFresh() {
    release(); mode = ''; catalogMode = '';
    await loadCatalog(); await $('[data-pc-base]').selectOption(IDS[0]); await $('[data-pc-target]').selectOption(IDS[1]);
    await $('[data-pc-compare]').click(); await visible('[data-pc-result]');
    await page.waitForFunction(() => !document.querySelector('#task-comparar [data-pc-format="pdf"]')?.disabled);
  }
  await page.goto(origin + '/reportes-rrhh.html#comparar'); await visible('[data-pc-catalog]');
  assert.equal(await page.locator('.task-panel:visible').count(), 1);
  assert.equal(await page.locator('input[type=file]:visible').count(), 0);
  assert.equal(calls.length, 0); checks.push('Direct link opens only the comparison task without automatically reading payroll');
  await loadCatalog(); await $('[data-pc-base]').selectOption(IDS[3]);
  assert.equal(await $('[data-pc-target]').isDisabled(), true);
  assert.match(await $('[data-pc-selection]').innerText(), /mismo tipo/);
  await $('[data-pc-base]').selectOption(IDS[0]);
  const choices = await $('[data-pc-target] option').evaluateAll(options => options.map(o => o.value));
  assert.ok(!choices.includes(IDS[0]) && !choices.includes(IDS[3]) && choices.includes(IDS[1]));
  checks.push('Same source and other payroll types are excluded, missing compatible type has an explicit state');
  await $('[data-pc-target]').selectOption(IDS[1]); await $('[data-pc-compare]').click(); await visible('[data-pc-result]');
  assert.equal(await rows().count(), 10); assert.equal(await $('[data-pc-count]').innerText(), '10');
  assert.equal(await $('[data-pc-variations]').innerText(), '4'); assert.equal(await $('[data-pc-review]').innerText(), '5');
  assert.match(await $('[data-pc-warnings]').innerText(), /distinta cantidad.*legajos/);
  assert.match(await $('[data-pc-warnings]').innerText(), /cierre/);
  assert.match(await $('[data-pc-rows]').innerText(), /No figura/); assert.match(await $('[data-pc-rows]').innerText(), /No evaluable/);
  checks.push('Two authenticated DTOs yield exact differences, explicit absences and source population/closure warnings');
  await $('[data-pc-group]').selectOption('totals'); assert.equal(await rows().count(), 1);
  assert.equal(await rows().first().getAttribute('data-pc-code'), '993');
  await $('[data-pc-group]').selectOption('concepts'); await $('[data-pc-change]').selectOption('review'); assert.equal(await rows().count(), 5);
  await $('[data-pc-reset]').click(); await $('[data-pc-sort]').selectOption('difference'); assert.equal(await rows().first().getAttribute('data-pc-code'), '1');
  checks.push('Totalizers, review filter and absolute-difference ordering work without a monetary grand total');
  await $('[data-pc-reset]').click(); await $('[data-pc-search]').fill('basico'); assert.equal(await rows().count(), 1);
  await $('[data-pc-search]').fill('no-such-qa'); assert.equal(await rows().count(), 0); await visible('[data-pc-empty]');
  const emptyEvent = page.waitForEvent('download'); await $('[data-pc-format="csv"]').click(); await (await emptyEvent).saveAs(out + '/empty-qa.csv');
  assert.equal(fs.readFileSync(out + '/empty-qa.csv','utf8').split('\r\n').length, 2);
  checks.push('Accent-insensitive search and empty CSV preserve exactly the selected scope');
  await $('[data-pc-search]').fill('44'); const before = calls.length;
  for (const ext of ['pdf','xlsx','csv']) {
    const event = page.waitForEvent('download'); await $('[data-pc-format="' + ext + '"]').click();
    await (await event).saveAs(out + '/comparison-filtered-qa.' + ext);
  }
  assert.equal(calls.length, before + 6);
  const sheets = await readXlsxFile(out + '/comparison-filtered-qa.xlsx');
  const dataSheet = sheets.find(s => s.sheet === 'Datos').data;
  assert.equal(dataSheet.length, 2); assert.equal(String(dataSheet[1][0]), '44');
  assert.equal(dataSheet[1][2], 100); assert.equal(dataSheet[1][3], 80); assert.equal(dataSheet[1][4], -20);
  const controlSheet = sheets.find(s => s.sheet === 'Control').data;
  for (const id of [IDS[0], IDS[1]]) assert.ok(controlSheet.some(row => row.includes(id)));
  checks.push('PDF/XLSX/CSV downloads each reread both sources and workbook contains exact numbers and two identities');
  await $('[data-pc-reset]').click(); await page.screenshot({ path: out + '/comparison-desktop-qa.png', fullPage: true });
  const full = page.waitForEvent('download'); await $('[data-pc-format="pdf"]').click(); await (await full).saveAs(out + '/comparison-full-qa.pdf');
  await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal(await $('[data-pc-query]').isVisible(), true);
  await $('[data-pc-search]').fill('44'); await page.screenshot({ path: out + '/comparison-mobile-qa.png', fullPage: true });
  checks.push('Mobile viewport stays bounded; only the data table scrolls horizontally');
  await page.setViewportSize({ width: 1440, height: 1050 });
  let count = downloads.length; hold = true;
  await $('[data-pc-format="pdf"]').click(); await until(() => waiting.length === 2);
  await $('[data-pc-search]').fill('601'); release(); await page.waitForTimeout(250);
  assert.equal(downloads.length, count); assert.equal(await rows().count(), 1); assert.equal(await rows().first().getAttribute('data-pc-code'), '601');
  checks.push('Changing a filter aborts both pending reads and cannot download the previous filter');
  hold = true; await $('[data-pc-format="pdf"]').click(); await until(() => waiting.length === 2);
  await $('[data-pc-cancel]').click(); release(); await page.waitForTimeout(250);
  assert.equal(downloads.length, count); assert.match(await $('[data-pc-status]').innerText(), /cancelada/);
  checks.push('Explicit cancellation produces no file and permits a fresh retry');
  for (const failureMode of ['hash','contents','closure','deny','missing','malformed','network']) {
    await compareFresh(); count = downloads.length; mode = failureMode;
    await $('[data-pc-format="pdf"]').click(); await hidden('[data-pc-result]');
    assert.equal(await rows().count(), 0); assert.equal(downloads.length, count);
    if (failureMode === 'deny') { await visible('[data-pc-login]'); assert.equal(await $('[data-pc-base] option').count(),1); }
    checks.push('Source failure ' + failureMode + ' clears result and blocks the download');
  }
  mode = ''; await loadCatalog(); await $('[data-pc-base]').selectOption(IDS[0]); await $('[data-pc-target]').selectOption(IDS[1]);
  mode = 'catalog-drift'; await $('[data-pc-compare]').click(); await page.waitForFunction(() => document.querySelector('#task-comparar [data-pc-status]')?.textContent.includes('catálogo cambió'));
  assert.equal(await $('[data-pc-result]').isVisible(),false); checks.push('Catalog/source drift requires a deliberate new selection, not silent replacement');
  await compareFresh(); hold = true; count = downloads.length;
  await $('[data-pc-format="pdf"]').click(); await until(() => waiting.length === 2);
  await page.getByRole('tab',{name:'Biblioteca',exact:true}).click(); release(); await page.waitForTimeout(250);
  assert.equal(downloads.length,count); assert.equal(await rows().count(),0);
  await page.locator('a.rc-card[href="#comparar"]').click(); await visible('[data-pc-catalog]');
  assert.equal(await $('[data-pc-result]').isVisible(),false); assert.equal(await $('[data-pc-query]').isVisible(),false);
  checks.push('Leaving the task cancels pending exports and removes all source data before returning through the library card');
  mode = ''; catalogMode = 'empty'; await $('[data-pc-catalog]').click();
  await page.waitForFunction(() => document.querySelector('#task-comparar [data-pc-status]')?.textContent.includes('No hay liquidaciones'));
  assert.equal(await $('[data-pc-query]').isVisible(),false);
  catalogMode = 'single'; await loadCatalog(); assert.match(await $('[data-pc-status]').innerText(),/una sola/);
  catalogMode = 'truncated'; await loadCatalog(); assert.equal(await $('[data-pc-base] option').count(),241);
  assert.match(await $('[data-pc-status]').innerText(),/240.*no es el historial completo/);
  checks.push('Empty, single-source and 240-item truncated catalogs do not pretend to be complete history');
  catalogMode = ''; await compareFresh(); hold = true; count = downloads.length;
  await $('[data-pc-format="pdf"]').click(); await until(() => waiting.length === 2);
  await $('[data-pc-base]').selectOption(IDS[2]); release(); await page.waitForTimeout(250);
  assert.equal(downloads.length,count); assert.equal(await rows().count(),0);
  checks.push('Changing a source while exporting aborts the previous comparison');
  await page.goto(origin + '/nomina-control.html#comparar'); await visible('[data-pc-catalog]'); await compareFresh();
  assert.equal(await rows().count(),10); await page.screenshot({ path: out + '/comparison-payroll-task-qa.png', fullPage:true });
  checks.push('Same fully functional comparison task is available in Nómina');
  await page.getByRole('tab',{name:'Comparar liquidaciones',exact:true}).focus(); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('Enter');
  assert.equal(await page.getByRole('tab',{name:'Reportes',exact:true}).getAttribute('aria-selected'),'true');
  await page.goBack(); await visible('[data-pc-catalog]'); assert.equal(await $('[data-pc-result]').isVisible(),false);
  checks.push('Keyboard and browser-back navigation preserve tasks without reviving stale results');
  assert.deepEqual(errors,[]); checks.push('No unhandled JavaScript errors');
  fs.writeFileSync(out + '/browser.json', JSON.stringify({ checksPassed:checks.length, checks, downloads:downloads.length, errors,
    liveAssets:live, financialDataSynthetic:true, realMunicipalSessionTested:false, backendWrites:false },null,2));
  console.log(JSON.stringify({ checksPassed:checks.length, downloads:downloads.length, errors, liveAssets:live }));
} catch(error) {
  fs.writeFileSync(out + '/error.txt',String(error.stack)); throw error;
} finally { release(); await browser.close(); }
