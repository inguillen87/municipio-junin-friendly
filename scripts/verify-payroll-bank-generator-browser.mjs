// Synthetic browser checks: all APIs intercepted, no municipal account or source used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
import { bankGeneratorFixture, bankGeneratorCatalog, bankFixtureId } from '../tests/fixtures/payroll-bank-generator-synthetic.js';

const base = path.resolve('public'), output = path.resolve('verification'), origin = 'https://municontrol.test';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, locale: 'es-AR', acceptDownloads: true, serviceWorkers: 'block' });
    let responseStatus = null, changed = false, reportCalls = 0, delay = null;
    const errors = [], downloads = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) {
        const file = path.resolve(base, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
      }
      assert.equal(request.method(), 'GET');
      if (url.pathname === '/api/internal-payroll-bank-report') {
        if (url.searchParams.get('resource') === 'catalog') return route.fulfill({ json: bankGeneratorCatalog() });
        reportCalls++; assert.equal(url.searchParams.get('datasetId'), bankFixtureId);
        if (delay) { const waiting = delay; delay = null; await waiting; }
        if (responseStatus) return route.fulfill({ status: responseStatus, json: { ok: false, code: 'PAYROLL_BANK_UNAVAILABLE' } }).catch(() => {});
        return route.fulfill({ json: bankGeneratorFixture(75, raw => { if (changed) raw.rows[0].netAmount = '999.00'; }) }).catch(() => {});
      }
      if (url.pathname === '/api/internal-auth') return route.fulfill({ json: { ok: true, authenticated: true, user: { id: 'synthetic-session', name: 'QA sintética', role: 'ADMIN_INTERNO' }, access: { tenantCapabilities: ['payroll.read', 'workforce.employee.read', 'workforce.summary.read'], platformCapabilities: [], platformRoles: [] } } });
      return route.fulfill({ json: { ok: true, data: [] } });
    });
    const page = await context.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message)); page.on('download', download => downloads.push(download));
    const panel = page.locator('#planilla-bancaria'), idle = () => page.waitForFunction(() => document.getElementById('planilla-bancaria')?.getAttribute('aria-busy') === 'false');
    const consult = async () => { await panel.locator('[data-pbg-dataset]').selectOption(bankFixtureId); await panel.locator('[data-pbg-consult]').click(); await panel.locator('[data-pbg-result]').waitFor({ state: 'visible' }); await idle(); };
    await page.goto(origin + '/reportes-rrhh.html#formatos');
    await page.getByRole('link', { name: 'Generar planilla bancaria desde una liquidación' }).click();
    await panel.locator('[data-pbg-dataset] option[value="' + bankFixtureId + '"]').waitFor({ state: 'attached' });
    await idle();
    assert.equal(await panel.locator('input[type=file]').count(), 0);
    assert.equal(await page.getByRole('tab', { name: 'Planilla bancaria', exact: true }).getAttribute('aria-selected'), 'true');
    await consult();
    assert.equal(await panel.locator('[data-pbg-rows] tr').count(), 50);
    assert.match(await panel.locator('[data-pbg-count]').innerText(), /75 \/ 75/);
    assert.deepEqual(await panel.locator('[data-pbg-account] option').evaluateAll(options => options.map(option => option.value)), ['all', 'unknown']);
    await panel.locator('[data-pbg-next]').click(); assert.match(await panel.locator('[data-pbg-rows]').innerText(), /Persona sintética 75/i);
    const beforeExport = reportCalls;
    const excelEvent = page.waitForEvent('download'); await panel.locator('[data-pbg-export=xlsx]').click(); const excel = await excelEvent; await idle();
    const excelPath = path.join(output, `bank-generator-${width}-synthetic.xlsx`); await excel.saveAs(excelPath);
    const parts = unzipSync(fs.readFileSync(excelPath)); assert.equal((strFromU8(parts['xl/worksheets/sheet1.xml']).match(/<row /g) || []).length, 76);
    assert.equal(reportCalls, beforeExport + 1);
    await panel.locator('[data-pbg-bank]').selectOption('credicoop'); await idle(); assert.equal(await panel.locator('[data-pbg-count]').innerText(), '25 / 75');
    const pdfEvent = page.waitForEvent('download'); await panel.locator('[data-pbg-export=pdf]').click(); const pdf = await pdfEvent; await idle(); await pdf.saveAs(path.join(output, `bank-generator-${width}-synthetic.pdf`));
    assert.match(await panel.locator('[data-pbg-status]').innerText(), /25 filas/);
    await panel.locator('[data-pbg-bank]').selectOption('santander'); assert.equal(await panel.locator('[data-pbg-account] option[value=cuenta_corriente]').count(), 0);
    await panel.locator('[data-pbg-bank]').selectOption('all');
    await page.evaluate(() => { const badge = document.createElement('div'); badge.textContent = 'QA SINTÉTICA · APIs simuladas · No evidencia municipal'; badge.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff0cb;color:#453406;font:700 12px Arial;padding:8px;text-align:center'; document.body.append(badge); });
    await panel.locator('[data-pbg-source]').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Unexpected horizontal page overflow');
    await page.screenshot({ path: path.join(output, `bank-generator-${width}-synthetic.png`) });
    responseStatus = 503;
    const countBeforeFailure = downloads.length; await panel.locator('[data-pbg-export=xlsx]').click(); await idle();
    assert.equal(await panel.locator('[data-pbg-result]').isVisible(), true); assert.equal(downloads.length, countBeforeFailure);
    responseStatus = null; changed = true;
    await panel.locator('[data-pbg-export=xlsx]').click(); await idle(); assert.equal(await panel.locator('[data-pbg-result]').isVisible(), false); assert.equal(downloads.length, countBeforeFailure);
    assert.match(await panel.locator('[data-pbg-status]').innerText(), /fuente cambió/);
    changed = false; await consult(); responseStatus = 403;
    await panel.locator('[data-pbg-export=xlsx]').click(); await idle(); assert.equal(await panel.locator('[data-pbg-rows] tr').count(), 0); assert.equal(downloads.length, countBeforeFailure);
    responseStatus = null; await panel.locator('[data-pbg-catalog]').click(); await idle(); await consult();
    let release; delay = new Promise(resolve => { release = resolve; }); const beforeDelayed = reportCalls;
    await panel.locator('[data-pbg-export=xlsx]').click();
    await page.waitForFunction(() => document.getElementById('planilla-bancaria').getAttribute('aria-busy') === 'true');
    const deadline = Date.now() + 15000;
    while (reportCalls === beforeDelayed) { assert.ok(Date.now() < deadline, 'Export did not revalidate the report'); await new Promise(resolve => setTimeout(resolve, 10)); }
    await page.getByRole('tab', { name: 'Biblioteca', exact: true }).click(); release(); await page.waitForTimeout(100);
    assert.equal(downloads.length, countBeforeFailure); assert.equal(await panel.locator('[data-pbg-rows] tr').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`Bank generator ${width}px passed: primary navigation, source-bound rows, all-row Excel/PDF, exact filters, session/export gates, 503 retry, changed source, 403 purge, late-response cancellation and layout.`);
  }
} finally { await browser.close(); }
