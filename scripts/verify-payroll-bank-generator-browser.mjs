// Synthetic browser checks: all APIs intercepted, no municipal account or source used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
import { bankGeneratorFixture, bankGeneratorCatalog, bankFixtureId } from '../tests/fixtures/payroll-bank-generator-synthetic.js';

const published=process.argv.includes('--published'),base=path.resolve('public'),output=path.resolve('verification',published?'bank-package-published':'bank-package-local'),origin=published?'https://municipio-junin-friendly.vercel.app':'https://municontrol.test';
const sha=b=>createHash('sha256').update(b).digest('hex'),checks=[];
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.CLOCK_BROWSER_CHANNEL } : {}) });
try {
  if(published){
    const files=['assets/payroll-bank-generator.js','assets/payroll-bank-generator.css','assets/payroll-bank-generator-export.js','assets/payroll-bank-reconciliation.js','assets/payroll-bank-review-panel.js','assets/payroll-bank-control-package.js','assets/clock-dashboard-zip.js'];
    for(const file of files){const response=await fetch(origin+'/'+file,{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(fs.readFileSync(path.join(base,file))),file);}
    const response=await fetch(origin+'/api/internal-payroll-bank-report?resource=catalog',{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(response.status,401);
    checks.push('published assets match the reviewed build and the anonymous bank API rejects access');
  }
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 1000 }, locale: 'es-AR', acceptDownloads: true, serviceWorkers: 'block' });
    let responseStatus = null, changed = false, reportCalls = 0, delay = null;
    const errors = [], downloads = [];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) {
        if(published)return route.continue();
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
    assert.match(await panel.locator('[data-pbg-reconcile]').innerText(),/75 filas autorizadas/);assert.match(await panel.locator('[data-pbg-reconcile]').innerText(),/75 legajos involucrados/);checks.push(width+'px: full-source controls preserve shared-CBU review');
    await panel.locator('[data-pbg-next]').click(); assert.match(await panel.locator('[data-pbg-rows]').innerText(), /Persona sintética 75/i);
    const beforeExport = reportCalls;
    const excelEvent = page.waitForEvent('download'); await panel.locator('[data-pbg-export=xlsx]').click(); const excel = await excelEvent; await idle();
    const excelPath = path.join(output, `bank-generator-${width}-synthetic.xlsx`); await excel.saveAs(excelPath);
    const parts = unzipSync(fs.readFileSync(excelPath)); assert.equal((strFromU8(parts['xl/worksheets/sheet1.xml']).match(/<row /g) || []).length, 76);
    assert.equal(reportCalls, beforeExport + 1);
    await panel.locator('[data-pbg-bank]').selectOption('credicoop'); await idle(); assert.equal(await panel.locator('[data-pbg-count]').innerText(), '25 / 75');
    const pdfEvent = page.waitForEvent('download'); await panel.locator('[data-pbg-export=pdf]').click(); const pdf = await pdfEvent; await idle(); await pdf.saveAs(path.join(output, `bank-generator-${width}-synthetic.pdf`));
    assert.match(await panel.locator('[data-pbg-status]').innerText(), /25 filas/);
    const beforePackage=reportCalls,pendingPackage=page.waitForEvent('download');await panel.locator('[data-pbg-export=package]').click();const bundle=await pendingPackage;await idle();
    const bundlePath=path.join(output,`bank-package-${width}.zip`);await bundle.saveAs(bundlePath);const archive=unzipSync(fs.readFileSync(bundlePath)),manifest=JSON.parse(strFromU8(archive['manifiesto.json']));
    assert.equal(reportCalls,beforePackage+1);assert.equal(manifest.selection.rows,25);assert.equal(manifest.fullReportSummary.rows,75);assert.equal(manifest.controlScope.bankTransferGenerated,false);assert.equal(manifest.artifacts.length,5);
    for(const f of manifest.artifacts){assert.equal(sha(archive[f.name]),f.sha256);assert.equal(archive[f.name].byteLength,f.bytes);}
    const packagedXlsx=unzipSync(archive['planilla.xlsx']);assert.equal((strFromU8(packagedXlsx['xl/worksheets/sheet1.xml']).match(/<row /g)||[]).length,26);
    assert.match(strFromU8(packagedXlsx['xl/worksheets/sheet1.xml']),/CBU informado en más de un legajo/);assert.match(strFromU8(archive['control.pdf']).slice(0,16),/^%PDF-/);
    assert.ok((await panel.locator('[data-pbg-status]').innerText()).includes(sha(fs.readFileSync(bundlePath))));
    fs.writeFileSync(path.join(output,`package-control-${width}.pdf`),archive['control.pdf']);fs.writeFileSync(path.join(output,`package-control-${width}.xlsx`),archive['planilla.xlsx']);
    checks.push(width+'px: one revalidated package contains exact filtered Excel/PDF, full-source reconciliation and verified hashes');

    await panel.locator('[data-pbg-bank]').selectOption('santander'); assert.equal(await panel.locator('[data-pbg-account] option[value=cuenta_corriente]').count(), 0);
    await panel.locator('[data-pbg-bank]').selectOption('all');
    await page.evaluate(() => { const badge = document.createElement('div'); badge.textContent = 'QA SINTÉTICA · APIs simuladas · No evidencia municipal'; badge.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#fff0cb;color:#453406;font:700 12px Arial;padding:8px;text-align:center'; document.body.append(badge); });
    await panel.locator('[data-pbg-source]').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Unexpected horizontal page overflow');
    await page.screenshot({ path: path.join(output, `bank-generator-${width}-synthetic.png`) });
    await panel.locator('[data-pbg-reconcile]').screenshot({path:path.join(output,`reconciliation-${width}-synthetic.png`)});
    responseStatus = 503;
    const countBeforeFailure = downloads.length; await panel.locator('[data-pbg-export=xlsx]').click(); await idle();
    assert.equal(await panel.locator('[data-pbg-result]').isVisible(), true); assert.equal(downloads.length, countBeforeFailure);
    responseStatus = null; changed = true;
    await panel.locator('[data-pbg-export=xlsx]').click(); await idle(); assert.equal(await panel.locator('[data-pbg-result]').isVisible(), false); assert.equal(downloads.length, countBeforeFailure);
    assert.match(await panel.locator('[data-pbg-status]').innerText(), /fuente cambió/);
    changed = false; await consult(); responseStatus = 403;
    await panel.locator('[data-pbg-export=package]').click(); await idle(); assert.equal(await panel.locator('[data-pbg-rows] tr').count(), 0); assert.equal(downloads.length, countBeforeFailure);assert.equal(await panel.locator('[data-pbg-reconcile]').innerText(),'');assert.equal(await panel.locator('[data-pbg-source]').innerText(),'');checks.push(width+'px: revoked access clears control details and blocks the whole package');
    responseStatus = null; await panel.locator('[data-pbg-catalog]').click(); await idle(); await consult();
    let release; delay = new Promise(resolve => { release = resolve; }); const beforeDelayed = reportCalls;
    await panel.locator('[data-pbg-export=package]').click();
    await page.waitForFunction(() => document.getElementById('planilla-bancaria').getAttribute('aria-busy') === 'true');
    const deadline = Date.now() + 15000;
    while (reportCalls === beforeDelayed) { assert.ok(Date.now() < deadline, 'Export did not revalidate the report'); await new Promise(resolve => setTimeout(resolve, 10)); }
    await page.getByRole('tab', { name: 'Biblioteca', exact: true }).click(); release(); await page.waitForTimeout(100);
    assert.equal(downloads.length, countBeforeFailure); assert.equal(await panel.locator('[data-pbg-rows] tr').count(), 0);
    assert.deepEqual(errors, []);
    checks.push(width+'px: original exports, retry, source-change and late-response cancellation remain intact');
    await context.close();
    console.log(`Bank generator ${width}px passed: primary navigation, source-bound rows, all-row Excel/PDF, exact filters, session/export gates, 503 retry, changed source, 403 purge, late-response cancellation and layout.`);
  }
  const summary={ok:true,published,checksPassed:checks.length,checks,simulatedPrivateApi:true,realMunicipalWrites:0};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
} finally { await browser.close(); }
