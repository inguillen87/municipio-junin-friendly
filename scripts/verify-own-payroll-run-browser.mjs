// Browser contract/parity of the receipt from actual isolated PostgreSQL.
// No product page, storage of nominal data or municipal API is exercised.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readOwnRunSqlFixture } from './verify-own-payroll-run-contract.mjs';
const root = path.resolve(import.meta.dirname, '..'), args = process.argv.slice(2), log = args.find(a => a.startsWith('--sql-log='))?.slice(10), channel = args.find(a => a.startsWith('--channel='))?.slice(10);
assert.ok(log); assert.ok(channel === undefined || ['chrome', 'msedge'].includes(channel)); assert.equal(args.length, channel ? 2 : 1);
const { capture } = readOwnRunSqlFixture(log), files = new Map(['own-payroll-run-model.js', 'own-payroll-engine.js', 'own-payroll-exact.js', 'native-salary-catalog-model.js'].map(n => ['/assets/' + n, fs.readFileSync(path.join(root, 'assets', n))]));
const server = http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end('<!doctype html><html lang="es"><title>QA sintético de recuperación C2</title></html>'); return; }
  if (!files.has(req.url)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end(files.get(req.url));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser, checks = 0;
try {
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) }); const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  assert.deepEqual(await page.evaluate(async c => (await import('/assets/own-payroll-run-model.js')).ownRunCapture(c), capture), capture); checks++;
  assert.deepEqual(await page.evaluate(async c => (await import('/assets/own-payroll-engine.js')).calculateOwnPayroll(c.saved.input), capture), capture.saved.result); checks++;
  for (const change of [c => c.saved.result.paymentExecuted = true, c => c.body.period = '2026-13', c => c.payload.period = '2026-01', c => c.saved.input.period = '2026-01']) {
    const c = structuredClone(capture); change(c); assert.equal(await page.evaluate(async c => { try { (await import('/assets/own-payroll-run-model.js')).ownRunCapture(c); return false; } catch { return true; } }, c), true); checks++;
  }
  const report = { passed: true, checks, runtime: channel ?? 'Chromium', synthetic: true, savedResultFromRealPostgres: true, employeeCount: capture.saved.result.employeeCount, resultRows: capture.saved.result.rowCount, productUiVerified: false, municipalApisCalled: 0, productiveInstallation: false };
  fs.writeFileSync(path.join(root, 'verification/own-payroll-run-browser-20261005.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
