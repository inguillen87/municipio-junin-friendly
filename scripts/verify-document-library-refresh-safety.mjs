/** Synthetic-only browser regressions. No credentials, databases or municipal identities. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { syntheticDetail } from './payroll-detail-synthetic.mjs';

const out = 'verification/document-library-pagination';
fs.mkdirSync(out, { recursive: true });
const base = process.cwd();
const server = http.createServer((req, res) => {
 const url = new URL(req.url, 'http://localhost');
 if (url.pathname === '/') {
  res.setHeader('Content-Type', 'text/html');
  return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/payroll-document-library.css"><link rel="stylesheet" href="/assets/payroll-detail-panel.css"><body style="margin:12px;font-family:Arial"><h1>MuniControl · prueba sintética</h1><button id="opener">Abrir biblioteca</button><div id="host"></div></body></html>');
 }
 const file = path.resolve(base, '.' + url.pathname);
 if (!file.startsWith(path.join(base, 'assets') + path.sep) || !fs.existsSync(file)) {
  res.statusCode = 404; return res.end();
 }
 res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
 res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true,
 ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const checks = [], errors = [];
const record = name => checks.push(name);
try {
 const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, acceptDownloads: true });
 page.setDefaultTimeout(10000);
 page.on('pageerror', error => errors.push(error.message));
 await page.goto('http://127.0.0.1:' + server.address().port);
 const init = async () => page.evaluate(async detail => {
  window.qaAllowed = true; window.qaFail = false; window.qaDeferredResource = null;
  window.qaDeferred = []; window.qaCalls = []; window.qaSignals = [];
  window.qaItems = Array.from({ length: 1000 }, (_, i) => {
   const date = new Date(Date.UTC(1940, i, 1));
   return { datasetId: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`,
    payrollDate: date.toISOString().slice(0, 10), sourcePeriod: date.getUTCFullYear(), sourceMonth: date.getUTCMonth() + 1,
    payrollType: i % 2 ? 'M' : 'V', closureStatus: 'closed', sourceLabel: 'Fuente sintética de QA',
    importedAt: '2026-09-22T12:00:00Z', conceptCount: detail.lines.length, versionsAvailable: 1, historySummaryAvailable: i % 3 !== 0 };
  });
  window.qaDetail = detail;
  const { openPayrollDocumentLibrary } = await import('/assets/payroll-document-library.js');
  window.qaRequest = async (url, options = {}) => {
   const q = new URL(url, location.origin).searchParams, resource = q.get('resource');
   window.qaCalls.push(Object.fromEntries(q)); window.qaSignals.push(options.signal);
   const item = window.qaItems.find(x => x.payrollType === q.get('type') && x.sourcePeriod === Number(q.get('period')) && x.sourceMonth === Number(q.get('month')));
   const payload = resource === 'employeepayrolldocuments'
    ? { ok: true, data: { version: 'payroll-document-library.v1', found: true, items: structuredClone(window.qaItems), total: window.qaItems.length, truncated: false, officialReceipt: false, signatureApplied: false } }
    : { ok: true, data: { ...window.qaDetail, datasetId: item.datasetId, payrollDate: item.payrollDate,
        sourcePeriod: item.sourcePeriod, sourceMonth: item.sourceMonth, payrollType: item.payrollType, closureStatus: item.closureStatus } };
   if (window.qaDeferredResource === resource) await new Promise(resolve => window.qaDeferred.push(resolve));
   if (window.qaFail) throw Error('Synthetic request failure');
   return payload;
  };
  window.openQa = async () => window.qaLibrary = await openPayrollDocumentLibrary({ host: document.getElementById('host'),
   employee: { contractId: '44444444-4444-4444-8444-444444444444', name: 'PERSONA SINTÉTICA QA', legajo: '0012' },
   request: window.qaRequest, canRead: () => window.qaAllowed });
  document.getElementById('opener').focus();
  const started = performance.now(); await window.openQa();
  return { milliseconds: performance.now() - started, cards: document.querySelectorAll('.pdl-card').length,
   elements: document.querySelectorAll('[data-payroll-document-library] *').length,
   sourceRecords: window.qaItems.length, requests: window.qaCalls.length };
 }, syntheticDetail());
 const measurement = await init();
 if (process.env.PDL_BASELINE_ONLY === '1') {
  fs.writeFileSync(out + '/baseline.json', JSON.stringify({ measurement, syntheticOnly: true }, null, 2));
  console.log(JSON.stringify({ baseline: measurement }));
 } else {
  assert.equal(measurement.cards, 24); assert.equal(measurement.requests, 1);
  record('1000 metadata records produce 24 visible cards and one authorized index read');
  await page.getByRole('button', { name: 'Última página', exact: true }).click();
  assert.equal(await page.locator('.pdl-card').count(), 16);
  assert.match(await page.locator('.pdl-page-position').innerText(), /42 de 42/);
  assert.match(await page.locator('.pdl-body > .pdl-status').innerText(), /985–1000/);
  record('last page exposes all 16 remaining records with an exact record range');
  await page.locator('[data-document-page]').selectOption('20');
  assert.match(await page.locator('.pdl-page-position').innerText(), /20 de 42/);
  assert.equal(await page.locator('.pdl-card').count(), 24);
  assert.equal(await page.evaluate(() => window.qaCalls.length), 1);
  record('direct page navigation is local and creates no additional API requests');
  await page.locator('[data-document-filter="year"]').selectOption('1940');
  await page.locator('[data-document-filter="month"]').selectOption('1');
  await page.locator('[data-document-filter="type"]').selectOption('V');
  assert.equal(await page.locator('.pdl-card').count(), 1);
  assert.match(await page.locator('.pdl-card').innerText(), /Enero de 1940/);
  record('filtering searches every received record, not just the currently visible page');
  await page.getByRole('button', { name: 'Actualizar biblioteca', exact: true }).click();
  assert.equal(await page.locator('[data-document-filter="year"]').inputValue(), '1940');
  assert.equal(await page.locator('[data-document-filter="month"]').inputValue(), '1');
  assert.equal(await page.locator('.pdl-card').count(), 1);
  record('refresh preserves explicit year, month and type filters in panel memory');
  await page.locator('.pdl-card button').click();
  await page.locator('.pd-table').first().waitFor();
  await page.getByRole('button', { name: 'Cerrar detalle', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.closest('.pdl-card') !== null), true);
  record('closing a detail restores keyboard focus to the selected document');
  await page.evaluate(() => window.qaItems = window.qaItems.filter(x => x.sourcePeriod !== 1940));
  await page.getByRole('button', { name: 'Actualizar biblioteca', exact: true }).click();
  assert.equal(await page.locator('[data-document-filter="year"]').inputValue(), '1940');
  assert.equal(await page.locator('.pdl-card').count(), 0);
  record('a missing filter value after refresh remains an explicit empty result, never an expanded search');
  await page.evaluate(() => window.qaFail = true);
  await page.getByRole('button', { name: 'Actualizar biblioteca', exact: true }).click();
  await page.getByRole('button', { name: 'Reintentar biblioteca', exact: true }).waitFor();
  assert.equal(await page.locator('.pdl-card').count(), 0);
  assert.equal(await page.locator('[data-payroll-detail-panel]').count(), 0);
  record('failed refresh clears private rows and details rather than displaying stale results');
  await init();
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).click();
  await page.getByRole('button', { name: 'Actualizar biblioteca', exact: true }).click();
  assert.match(await page.locator('.pdl-page-position').innerText(), /2 de 42/);
  record('refresh preserves the page when it still exists');
  await page.evaluate(() => window.qaItems = window.qaItems.slice(0, 2));
  await page.getByRole('button', { name: 'Actualizar biblioteca', exact: true }).click();
  assert.equal(await page.locator('.pdl-card').count(), 2);
  assert.equal(await page.locator('.pdl-pagination').isVisible(), false);
  record('a shorter refreshed catalog clamps the page rather than hiding available records');
  await page.evaluate(() => window.qaItems = []);
  await page.getByRole('button', { name: 'Actualizar biblioteca', exact: true }).click();
  await page.getByText(/Todavía no hay liquidaciones detalladas incorporadas/).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Actualizar biblioteca', exact: true }).count(), 1);
  record('an empty catalog remains refreshable without reopening the employee');
  await init();
  await page.evaluate(() => window.qaDeferredResource = 'employeepayrolldetail');
  await page.locator('.pdl-card button').first().click();
  await page.waitForFunction(() => window.qaDeferred.length === 1);
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).click();
  await page.evaluate(() => window.qaDeferred.shift()());
  assert.equal(await page.locator('[data-payroll-detail-panel]').count(), 0);
  assert.equal(await page.evaluate(() => window.qaSignals.at(-1).aborted), true);
  record('paging during a delayed detail read aborts it and cannot restore the old document');
  await init();
  await page.locator('.pdl-card button').first().click();
  await page.locator('.pd-table').first().waitFor();
  await page.evaluate(() => window.qaDeferredResource = 'employeepayrolldetail');
  let downloads = 0; page.on('download', () => downloads++);
  await page.getByRole('button', { name: 'Descargar detalle · PDF', exact: true }).click();
  await page.waitForFunction(() => window.qaDeferred.length === 1);
  await page.getByRole('button', { name: 'Página siguiente', exact: true }).click();
  await page.evaluate(() => window.qaDeferred.shift()());
  await page.waitForTimeout(100);
  assert.equal(downloads, 0); assert.equal(await page.locator('[data-payroll-detail-panel]').count(), 0);
  record('pending export cannot download after its source selection has been replaced');
  await init();
  await page.evaluate(() => { window.qaDeferredResource = 'employeepayrolldocuments'; window.qaPending = window.qaLibrary.refresh(); });
  await page.waitForFunction(() => window.qaDeferred.length === 1);
  await page.getByRole('button', { name: 'Cerrar biblioteca', exact: true }).click();
  await page.evaluate(async () => { window.qaDeferred.shift()(); await window.qaPending; });
  assert.equal(await page.locator('[data-payroll-document-library]').count(), 0);
  assert.equal(await page.locator('#opener').evaluate(n => n === document.activeElement), true);
  record('closing during a delayed refresh aborts and restores focus without repopulation');
  await init();
  await page.evaluate(() => { window.qaDeferredResource = 'employeepayrolldocuments'; window.qaPending = window.qaLibrary.refresh(); });
  await page.waitForFunction(() => window.qaDeferred.length === 1);
  await page.evaluate(async () => { window.qaAllowed = false; window.qaDeferred.shift()(); await window.qaPending; });
  assert.equal(await page.locator('[data-payroll-document-library]').count(), 0);
  record('access revoked during refresh removes the library before a response can render');
  await init();
  await page.screenshot({ path: out + '/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: out + '/mobile.png', fullPage: true });
  record('mobile layout fits 390 CSS pixels without horizontal overflow');
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  record('metadata, identity and filters are not persisted in browser storage');
  assert.deepEqual(errors, []); record('no uncaught browser errors');
  const result = { checksPassed: checks.length, checks, measurement, errors,
   syntheticOnly: true, municipalSessionTested: false, databaseWrites: 0 };
  fs.writeFileSync(out + '/results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
 }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
