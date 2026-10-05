// Browser runtime parity for the actual calculator, without municipal APIs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { calculateOwnPayroll } from '../assets/own-payroll-engine.js';
import { payrollInput, employee, payrollId } from '../tests/fixtures/own-payroll-synthetic.js';
const root = path.resolve(import.meta.dirname, '..');
const allowed = new Map(['/assets/own-payroll-engine.js', '/assets/own-payroll-exact.js'].map(p => [p, fs.readFileSync(path.join(root, p))]));
const server = http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end('<!doctype html><html lang="es"><title>QA sintético del motor propio</title></html>'); return; }
  if (!allowed.has(req.url)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end(allowed.get(req.url));
});
const channel = process.argv.find(a => a.startsWith('--channel='))?.slice(10);
assert(channel === undefined || ['chrome', 'msedge'].includes(channel), 'Canal de navegador no admitido.');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
let checks = 0;
try {
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const run = input => page.evaluate(async raw => (await import('/assets/own-payroll-engine.js')).calculateOwnPayroll(raw), input);
  const golden = payrollInput(); assert.deepEqual(await run(golden), calculateOwnPayroll(golden)); checks++;
  const complete = payrollInput({ employees: Array.from({ length: 37 }, (_, i) => employee(i + 1)) });
  assert.deepEqual(await run(complete), calculateOwnPayroll(complete)); checks++;
  for (const selection of [{ kind: 'contracts', values: [payrollId(37)] }, { kind: 'agreements', values: ['1'] }, { kind: 'departments', values: ['2'] }]) { const input = { ...complete, selection }; assert.deepEqual(await run(input), calculateOwnPayroll(input)); checks++; }
  const missing = payrollInput(); missing.employees[1].inputs[0].value = null;
  const rejected = await page.evaluate(async raw => { try { (await import('/assets/own-payroll-engine.js')).calculateOwnPayroll(raw); return 'unexpected-result'; } catch (e) { return e.code; } }, missing);
  assert.equal(rejected, 'INPUT_MISSING'); checks++;
  const injection = payrollInput(); injection.rules[0].expression = { op: 'eval', text: 'globalThis.ownPayrollInjected=true' };
  const safe = await page.evaluate(async raw => { try { (await import('/assets/own-payroll-engine.js')).calculateOwnPayroll(raw); return {}; } catch (e) { return { code: e.code, sideEffect: Object.hasOwn(globalThis, 'ownPayrollInjected') }; } }, injection);
  assert.deepEqual(safe, { code: 'OPERATION_UNSUPPORTED', sideEffect: false }); checks++;
  const report = { checks, passed: true, runtime: channel ?? 'Chromium', synthetic: true, municipalApisCalled: 0, municipalWrites: 0, productUiVerified: false };
  fs.writeFileSync(path.join(root, 'verification/own-payroll-engine-browser-20261004.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
