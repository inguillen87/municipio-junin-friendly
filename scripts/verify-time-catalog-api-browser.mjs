// Browser transport/shared-contract QA, not an operator screen or acceptance.
// Real HTTP handler; SQL stand-in is synthetic. Persistence is proved separately.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createTimeCatalogHandler} from '../api/internal-time-catalog.js';
import {ID, principal, session, command, payload, receipt, sqlText, bootstrap} from '../tests/fixtures/time-catalog-synthetic.js';
const origin = 'https://time-catalog-qa.invalid', checks = [], queries = [];
let allowed = true, activeSession = {...session}, scopeChanged = false;
const saved = new Map(), initial = command();
const sql = {async query(query, values) {
  queries.push({query, values});
  if (!query.includes('apply_command')) return [{result: sqlText(bootstrap())}];
  if (scopeChanged) return [];
  const old = saved.get(values[10]);
  if (old) { assert.equal(old.requestSha256, values[11]); return [{result: sqlText({...old, replayed: true, historical: false})}]; }
  const result = receipt(initial, {requestSha256: values[11], attemptKey: values[10]});
  saved.set(values[10], result); return [{result: sqlText(result)}];
}};
const handler = createTimeCatalogHandler({env: {INTERNAL_APP_ORIGIN: origin}, sessionFor: () => activeSession,
  requireAccess: async (_req, res) => { if (!allowed) { res.status(403).json({ok: false, code: 'TIME_CATALOG_FORBIDDEN'}); return null; } return {mode: 'managed', principal}; }, getSql: async () => sql});
const browser = await chromium.launch({headless: true, ...(process.env.TIME_CATALOG_QA_HEADLESS_EXECUTABLE ? {executablePath: process.env.TIME_CATALOG_QA_HEADLESS_EXECUTABLE} : {})});
try {
  const context = await browser.newContext({locale: 'es-AR'}), page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url()); assert.equal(url.origin, origin, 'EXTERNAL_REQUEST');
    if (url.pathname === '/qa.html') return route.fulfill({contentType: 'text/html', body: '<!doctype html><html lang="es"><meta charset="utf-8"><title>Prueba sintética de transporte del catálogo</title><main>QA de API. No es la pantalla operativa.</main><script type="module">import * as contract from "/assets/time-catalog-contract.js";window.contract=contract;</script></html>'});
    if (url.pathname === '/assets/time-catalog-contract.js') return route.fulfill({contentType: 'text/javascript', body: fs.readFileSync(path.resolve('assets/time-catalog-contract.js'), 'utf8')});
    assert.equal(url.pathname, '/api/internal-time-catalog');
    const request = {method: req.method(), url: url.pathname + url.search, query: Object.fromEntries(url.searchParams), headers: req.headers(), body: req.postDataBuffer() ?? undefined};
    const response = {headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.payload = v; return this; }};
    await handler(request, response);
    return route.fulfill({status: response.statusCode, headers: response.headers, contentType: 'application/json', body: JSON.stringify(response.payload)});
  });
  await page.goto(origin + '/qa.html'); await page.waitForFunction(() => !!window.contract);
  for (const kind of ['calendar', 'shift', 'rule_profile', 'assignment']) {
    const b = command({kind, payload: payload(kind)});
    await page.evaluate(b => window.contract.timeCatalogCommand(b), b); checks.push('shared browser contract: ' + kind);
  }
  const read = await page.evaluate(async () => { const r = await fetch('/api/internal-time-catalog?resource=bootstrap'); return {status: r.status, cache: r.headers.get('cache-control'), body: await r.json()}; });
  assert.equal(read.status, 200); assert.match(read.cache, /no-store/); assert.equal(read.body.data.minutesCalculated, false); checks.push('private scoped bootstrap with truthful readiness');
  const send = () => page.evaluate(async ({body, key}) => {
    const r = await fetch('/api/internal-time-catalog', {method: 'POST', headers: {'content-type': 'application/json', 'idempotency-key': key}, body: JSON.stringify({operation: 'command', payload: body})});
    return {status: r.status, replayed: r.headers.get('idempotency-replayed'), body: await r.json()};
  }, {body: initial, key: ID});
  const first = await send(); assert.equal(first.status, 201); assert.equal(saved.size, 1);
  const params = first.body.data.data.configuration.parameters;
  assert.equal(params.find(p => p.valueKind === 'decimal').decimalValue, '99999999999999.123456');
  assert.equal(params.find(p => p.valueKind === 'integer').integerValue, '999999999999999999'); checks.push('browser HTTP keeps exact numeric strings');
  const second = await send(); assert.equal(second.status, 200); assert.equal(second.replayed, 'true'); assert.equal(saved.size, 1);
  const writes = queries.filter(q => q.query.includes('apply_command')); assert.deepEqual(writes[0], writes[1]); checks.push('voluntary identical body/key retry, one synthetic receipt');
  activeSession = {...session, version: 2}; const before = queries.length;
  assert.equal((await send()).status, 409); assert.equal(queries.length, before); checks.push('session change rejects frozen attempt before SQL');
  activeSession = {...session}; scopeChanged = true;
  assert.equal((await send()).status, 409); assert.equal(saved.size, 1); checks.push('binding/actor scope filter prevents another write');
  scopeChanged = false; allowed = false; const after = queries.length;
  assert.equal((await send()).status, 403); assert.equal(queries.length, after); checks.push('revocation stops access before SQL');
  assert.equal(errors.length, 0); assert.equal(saved.size, 1);
  fs.writeFileSync(path.resolve('verification/time-catalog-api-browser-result.json'), JSON.stringify({ok: true, checksPassed: checks.length, checks,
    syntheticOnly: true, realHandler: true, databaseStandIn: true, operatorUiTested: false, municipalWrites: 0, errors}, null, 2));
  console.log(JSON.stringify({ok: true, checksPassed: checks.length, syntheticOnly: true, operatorUiTested: false}));
} finally { await browser.close(); }
