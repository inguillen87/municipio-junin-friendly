/** Synthetic, intercepted UI verification. Never opens a municipal session or real API. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import '../assets/app-routes.js';

assert.ok(process.argv.slice(2).every(arg => arg === '--published'), 'UNKNOWN_ARGUMENT');
const published = process.argv.includes('--published');
const base = path.resolve('public'), out = path.resolve('verification/employee-source-seniority' + (published ? '-published' : ''));
const origin = published ? 'https://municipio-junin-friendly.vercel.app' : 'https://municontrol.test';
for (const file of ['internal-dashboard.html', 'assets/employee-source-seniority-model.js', 'assets/civil-date.js']) {
  assert.ok(fs.existsSync(path.join(base, file)), 'BUILD_REQUIRED:' + file);
  if (file.endsWith('.js')) assert.ok(fs.readFileSync(file).equals(fs.readFileSync(path.join(base, file))), 'STALE_BUILD:' + file);
}
const assetReceipts = new Map(), routeFailures = [];
async function publicBytes(url, expected) {
  assert.equal(url.origin, origin);
  assert.ok(!url.pathname.startsWith('/api/'));
  const canonical = globalThis.MuniControlRoutes.resolve(url.href, origin);
  const target = new URL(canonical?.path || url.pathname, origin);
  assert.equal(target.origin, 'https://municipio-junin-friendly.vercel.app');
  assert.ok(!target.pathname.startsWith('/api/'));
  const response = await fetch(target, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, 'PUBLIC_ASSET_STATUS:' + target.pathname);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; assert.ok(size <= expected.length, 'PUBLIC_ASSET_SIZE:' + target.pathname); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  assert.ok(bytes.equals(expected), 'PUBLIC_ASSET_PARITY:' + target.pathname);
  assetReceipts.set(target.pathname, createHash('sha256').update(bytes).digest('hex'));
  return bytes;
}
const contractId = '10000000-0000-4000-8000-000000000001';
const batchId = '20000000-0000-4000-8000-000000000002';
const otherId = '30000000-0000-4000-8000-000000000003';
const row = { recordOrigin: 'GRH', contractId, canonicalPersonId: otherId, companyId: 7, legajo: '900001', nombre: 'AGENTE SINTÉTICO QA', activo: true, liquidable: false, administrativeStatus: 'active', payrollStatus: 'not_liquidated', controlState: 'activo_no_incluido', crosswalkStatus: 'not_loaded' };
let years = 8, months = 7, native = false, foreignCutoff = false, deny = false, hireDate = '1999-01-02', terminationDate = null;
const requests = [], errors = [], checks = [];
const browser = await chromium.launch({ headless: true, ...(process.env.CLOCK_BROWSER_CHANNEL ? { channel: process.env.CLOCK_BROWSER_CHANNEL } : {}) });
fs.mkdirSync(out, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    try {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    assert.equal(request.method(), 'GET', 'GET_ONLY');
    if (!url.pathname.startsWith('/api/')) {
      const canonical = globalThis.MuniControlRoutes.resolve(url.href, origin);
      const file = path.resolve(base, canonical?.file || '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      const expected = fs.readFileSync(file), body = published ? await publicBytes(url, expected) : expected;
      const types = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
      return route.fulfill({ status: 200, contentType: types[path.extname(file)] || 'application/octet-stream', body });
    }
    requests.push({ resource: url.searchParams.get('resource'), method: request.method() });
    if (deny) return route.fulfill({ status: 401, json: { ok: false } });
    let payload = { ok: true, data: [] };
    if (url.pathname === '/api/internal-auth') payload = { ok: true, authenticated: true, user: { name: 'Operador QA', email: 'qa@example.invalid', role: 'ADMIN_INTERNO' }, access: { tenantCapabilities: ['workforce.employee.read', 'workforce.summary.read'], platformCapabilities: [], platformRoles: [] } };
    else if (url.searchParams.get('resource') === 'employees') payload = { ok: true, data: [row], pagination: { page: 1, limit: 25, total: 1, pages: 1 }, facets: { sectors: [], organizations: [], agreements: [] } };
    else if (url.searchParams.get('resource') === 'employee') payload = { ok: true, data: { ...row, recordOrigin: native ? 'MUNICONTROL' : 'GRH', contractSourceBatchId: batchId, fechaIngreso: hireDate, fechaEgreso: terminationDate, rawFields: { employment: { seniorityYears: years, seniorityMonths: months } }, sourceReferences: [{ sourceSystem: 'GRH', sourceEntity: 'legajo', canonicalEntity: 'employment_contract', canonicalId: foreignCutoff ? otherId : contractId, sourceBatchId: batchId, validFrom: '2026-09-10T18:17:30.000Z' }], personas: { available: false }, employmentHistory: [], ausencias: [], licencias: [], familiares: [], movements: [] }, meta: {} };
    return route.fulfill({ status: 200, json: payload });
    } catch (error) { routeFailures.push(error.message); await route.abort().catch(() => {}); }
  });
  await context.routeWebSocket('**/*', socket => { routeFailures.push('UNEXPECTED_WEBSOCKET'); socket.close(); });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/personal#legajos');
  const open = async () => { await page.locator('#employeeRows button').first().click(); await page.locator('#employeeDialog[open] #employeeSourceSeniority').waitFor(); };
  const close = async () => { await page.locator('#closeDialog').click(); };
  const field = label => page.locator('#employeeSourceSeniority .detail-field').filter({ has: page.locator('dt', { hasText: new RegExp('^' + label + '$') }) }).locator('dd');
  await open();
  assert.equal(await field('Años informados').innerText(), '8'); assert.equal(await field('Meses informados').innerText(), '7');
  assert.match(await field('Corte de estos datos').innerText(), /10\/09\/2026.*15:17/);
  assert.match(await field('Fecha de ingreso').innerText(), /1999/);
  assert.match(await page.locator('#employeeSourceSeniority').innerText(), /No indican la antigüedad aplicada a cada liquidación mensual/);
  assert.equal(requests.some(r => r.resource === 'employeepayroll'), false);
  checks.push('original source values and exact cutoff visible without payroll capability or extra payroll request');
  await page.locator('#employeeSourceSeniority').scrollIntoViewIfNeeded();
  await page.locator('#employeeSourceSeniority').screenshot({ path: path.join(out, 'desktop.png') });
  await close(); years = 0; months = 0; await open();
  assert.equal(await field('Años informados').innerText(), '0'); assert.equal(await field('Meses informados').innerText(), '0'); checks.push('reported zero remains visible');
  await close(); hireDate = '2013-07-01'; await open();
  assert.equal(await page.locator('[data-elapsed-service]').innerText(), '13 años y 2 meses');
  assert.equal(await field('Años informados').innerText(), '0');
  assert.match(await page.locator('.employee-elapsed-service').innerText(), /Difiere.*no antigüedad reconocida/s);
  await page.locator('#employeeSourceSeniority').screenshot({path:path.join(out,'elapsed-desktop.png')});
  checks.push('Caso informado: 13 años y 2 meses calculados al corte, con cero fuente conservado y sin impacto salarial.');
  await close(); terminationDate = '2016-09-30'; await open();
  assert.equal(await page.locator('[data-elapsed-service]').innerText(), '3 años y 2 meses');
  assert.match(await page.locator('.employee-elapsed-service').innerText(), /hasta el egreso/);
  checks.push('Egreso informado detiene el tiempo del vínculo sin seguir acumulando años.');
  terminationDate = null;
  await close(); years = null; months = undefined; await open();
  assert.equal(await field('Años informados').innerText(), 'No informado'); assert.equal(await field('Meses informados').innerText(), 'No informado'); checks.push('missing components are not zero');
  await close(); years = 2; months = 14; await open();
  assert.equal(await field('Años informados').innerText(), '2'); assert.equal(await field('Meses informados').innerText(), '14 · Requiere revisión');
  assert.match(await page.locator('#employeeSourceSeniority .notice').innerText(), /no se corrigieron ni se convirtieron/); checks.push('out of range month preserves literal value and requests review');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.employee-section-nav select').selectOption({ label: 'Antigüedad informada por GRH al corte' });
  await page.getByRole('button', { name: 'Ir a la sección', exact: true }).click();
  assert.ok(await page.locator('#employeeSourceSeniority').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(out, 'mobile.png') }); checks.push('mobile section navigation, fields and review copy fit without horizontal overflow');
  await close(); foreignCutoff = true; await open(); assert.equal(await field('Corte de estos datos').innerText(), 'No disponible'); assert.match(await page.locator('[data-elapsed-service]').innerText(), /No calculable/); checks.push('unrelated contract cutoff is not shown');
  await close(); native = true;
  await page.locator('#employeeRows button').first().click(); await page.getByRole('heading', { name: 'Registro del alta', exact: true }).waitFor();
  assert.equal(await page.locator('#employeeSourceSeniority').count(), 0); checks.push('native record does not acquire GRH seniority');
  await close(); deny = true; await page.locator('#employeeRows button').first().click();
  await page.waitForURL(url => url.origin === origin && url.pathname === '/acceso'); checks.push('expired session prevents rendering personnel data');
  assert.deepEqual(errors, []); assert.deepEqual(routeFailures, []); assert.ok(requests.every(r => r.method === 'GET'));
  if (published) for (const asset of ['/personal', '/assets/employee-source-seniority-model.js', '/assets/civil-date.js']) assert.ok(assetReceipts.has(asset), 'REQUIRED_PUBLIC_ASSET:' + asset);
  const result = { checksPassed: checks.length, checks, errors, routeFailures, mode: published ? 'published_assets_with_synthetic_api' : 'local_build_with_synthetic_api', assets: Object.fromEntries(assetReceipts), privateApisIntercepted: true, syntheticDataOnly: true, municipalSessionTested: false, realApiCalls: 0, writes: 0, browser: browser.version() };
  fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { await browser.close(); }
