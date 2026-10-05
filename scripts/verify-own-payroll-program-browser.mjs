// Actual PG approval -> shared browser validator -> existing calculator.
// Synthetic data only; no product screen or municipal API is exercised here.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { readOwnProgramSqlFixture } from './verify-own-payroll-program-contract.mjs';
import { ownProgramCommand } from '../assets/own-payroll-program-model.js';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { calculateOwnPayroll } from '../assets/own-payroll-engine.js';
import { approvedSources } from '../tests/fixtures/own-payroll-approved-synthetic.js';
const root = path.resolve(import.meta.dirname, '..'), args = process.argv.slice(2), log = args.find(a => a.startsWith('--sql-log='))?.slice(10), channel = args.find(a => a.startsWith('--channel='))?.slice(10);
assert.ok(log); assert.ok(channel === undefined || ['chrome', 'msedge'].includes(channel)); assert.equal(args.length, channel ? 2 : 1);
const data = readOwnProgramSqlFixture(log);
const allowed = new Map(['own-payroll-engine.js', 'own-payroll-exact.js', 'own-payroll-program-model.js', 'native-salary-catalog-model.js'].map(name => ['/assets/' + name, fs.readFileSync(path.join(root, 'assets', name))]));
const server = http.createServer((req, res) => {
  if (req.method !== 'GET') { res.writeHead(405).end(); return; }
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }).end('<!doctype html><html lang="es"><title>QA sintético C2</title></html>'); return; }
  if (!allowed.has(req.url)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }).end(allowed.get(req.url));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); let browser, checks = 0;
try {
  browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) }); const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const validated = await page.evaluate(async data => { const m = await import('/assets/own-payroll-program-model.js'); return { bootstrap: m.ownProgramBootstrap(data.bootstrap), proposal: m.ownProgramReceipt(data.proposal), approval: m.ownProgramReceipt(data.approval) }; }, data);
  assert.deepEqual(validated.bootstrap, data.bootstrap); assert.deepEqual(validated.proposal, data.proposal); assert.deepEqual(validated.approval, data.approval); checks += 3;
  const source = approvedSources(601); source.programState = data.bootstrap; const input = prepareOwnPayrollInput(source);
  const result = await page.evaluate(async input => (await import('/assets/own-payroll-engine.js')).calculateOwnPayroll(input), input);
  assert.deepEqual(result, calculateOwnPayroll(input)); assert.equal(result.employeeTotals.length, 601); checks++;
  const body = data.proposal.body;
  assert.deepEqual(await page.evaluate(async body => (await import('/assets/own-payroll-program-model.js')).ownProgramCommand(body), body), ownProgramCommand(body)); checks++;
  const unsafe = structuredClone(body); unsafe.program.rules[0].expression = { op: 'eval', text: 'globalThis.programInjected=true' };
  assert.deepEqual(await page.evaluate(async body => { try { (await import('/assets/own-payroll-program-model.js')).ownProgramCommand(body); return {}; } catch (e) { return { code: e.code, injected: Object.hasOwn(globalThis, 'programInjected') }; } }, unsafe), { code: 'OPERATION_UNSUPPORTED', injected: false }); checks++;
  const report = { passed: true, checks, runtime: channel ?? 'Chromium', synthetic: true, approvedProgramFromRealPostgres: true, employeeCount: 601, productUiVerified: false, municipalApisCalled: 0, productiveInstallation: false };
  fs.writeFileSync(path.join(root, 'verification/own-payroll-program-browser-20261004.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
