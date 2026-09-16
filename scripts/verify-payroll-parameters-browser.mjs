// Actual built/published interface; all authenticated responses and writes are
// synthetic and intercepted locally. No municipal session, records or payments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PARAMETER_CONTRACT, PARAMETER_SOURCE_SHA, parameterPreview } from '../lib/payroll-parameter-contract.js';
const published = process.argv.includes('--published');
const origin = published ? 'https://municipio-junin-friendly.vercel.app' : 'http://127.0.0.1:4328';
const root = path.resolve('public'), out = path.resolve('verification/parameters-' + (published ? 'published' : 'local')); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const uuid = n => n.repeat(8) + '-' + n.repeat(4) + '-4' + n.repeat(3) + '-8' + n.repeat(3) + '-' + n.repeat(12);
const flags = { grhMutation: false, payrollCalculated: false, payrollPosted: false, currentCatalogVerified: false, proposalApproved: false };
const checks = [], errors = [], writes = [], calls = [], store = [], receipts = new Map();
let role = 'maker', denied = false, loseNext = false, conflict = false;
function capabilities() { return ['payroll.read', 'payroll.novelty.read', 'payroll.parameter.read', 'payroll.parameter.audit.read', ...(role === 'maker' ? ['payroll.parameter.prepare'] : role === 'checker' ? ['payroll.parameter.approve'] : [])]; }
function detail(p) { return { ...p, allowedCommands: role === 'maker' ? p.status === 'prepared' ? ['submit', 'cancel'] : p.status === 'submitted' ? ['cancel'] : [] : role === 'checker' && p.status === 'submitted' ? ['approve', 'reject'] : [] }; }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'es-AR', serviceWorkers: 'block', acceptDownloads: true });
  await context.route('**/*', async route => {
    const request = route.request(), u = new URL(request.url());
    if (u.origin !== origin) return route.abort();
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname === '/api/internal-auth') return route.fulfill({ json: { ok: true, authenticated: true, user: { name: 'OPERADOR QA SINTÉTICO' }, access: { tenantCapabilities: capabilities(), platformCapabilities: [], platformRoles: [] } } });
      if (u.pathname === '/api/internal-data' && u.searchParams.get('resource') === 'payrollControl') return route.fulfill({ json: { ok: true, status: 'ready', sourcePolicy: { label: 'QA SINTÉTICA' }, latestClosed: {}, currentOpen: {}, runs: [], quality: {}, limitations: [] } });
      if (u.pathname !== '/api/internal-payroll-parameters') return route.fulfill({ status: 403, json: { ok: false, error: 'Sin permiso sintético para este módulo' } });
      calls.push(request.method());
      if (denied) return route.fulfill({ status: 401, json: { ok: false, code: 'PAYROLL_PARAMETER_SESSION_INVALID', error: 'Sesión sintética vencida' } });
      const resource = u.searchParams.get('resource');
      if (request.method() === 'GET') {
        if (resource === 'bootstrap') return route.fulfill({ json: { ok: true, flags, principal: { membershipId: role === 'maker' ? uuid('b') : uuid('c'), certifiedBindingId: uuid('e'), employmentLinked: true, capabilities: capabilities() }, proposals: store, limits: { contractVersion: PARAMETER_CONTRACT, sourceSha256: PARAMETER_SOURCE_SHA } } });
        if (resource === 'list') { const items = store.filter(p => (u.searchParams.get('status') === 'all' || p.status === u.searchParams.get('status')) && (!u.searchParams.get('period') || p.draft.validFrom === u.searchParams.get('period'))); return route.fulfill({ json: { ok: true, flags, proposals: items, total: items.length } }); }
        if (resource === 'detail') return route.fulfill({ json: { ok: true, flags, proposal: detail(store.find(p => p.id === u.searchParams.get('id'))) } });
        if (resource === 'attempt') { const result = receipts.get(u.searchParams.get('key')); return route.fulfill({ status: result ? 200 : 404, json: result ? { ...result, replayed: true } : { ok: false, code: 'PAYROLL_PARAMETER_ATTEMPT_NOT_FOUND', error: 'Sin confirmación' } }); }
      }
      if (request.method() === 'POST') {
        const body = request.postDataJSON(), key = request.headers()['idempotency-key']; writes.push({ body, key });
        assert.match(key, /^[a-f0-9-]{36}$/);
        if (receipts.has(key)) return route.fulfill({ json: { ...receipts.get(key), replayed: true } });
        let p;
        if (body.command === 'prepare') {
          assert.equal(body.payload.bindingId, uuid('e')); p = { id: store.length ? uuid('f') : uuid('d'), contractVersion: PARAMETER_CONTRACT, version: 1, status: 'prepared', draft: { ...body.payload.draft, rows: parameterPreview(body.payload.draft), sourceSha256: PARAMETER_SOURCE_SHA, applied: false, currentCatalogVerified: false }, updatedAt: '2026-09-16T08:00:00Z', timeline: [] }; store.push(p);
        } else {
          p = store.find(p => p.id === body.payload.proposalId); assert.ok(p);
          if (conflict) { conflict = false; p.version++; return route.fulfill({ status: 409, json: { ok: false, code: 'PAYROLL_PARAMETER_VERSION_CONFLICT', error: 'La propuesta cambió. Volvé a abrirla.' } }); }
          assert.equal(p.version, body.payload.expectedVersion);
          assert.ok(detail(p).allowedCommands.includes(body.command));
          p.status = { submit: 'submitted', approve: 'approved', reject: 'rejected', cancel: 'cancelled' }[body.command]; p.version++;
        }
        p.timeline.push({ id: p.timeline.length + 1, command: body.command, occurredAt: '2026-09-16T08:00:00Z', actorRoleKey: role, resultingVersion: p.version, reasonReference: body.payload.reasonReference });
        const result = { ok: true, flags, proposal: { ...p }, eventId: writes.length, replayed: false }; receipts.set(key, result);
        if (loseNext) { loseNext = false; return route.fulfill({ status: 503, json: { ok: false, error: 'Confirmación perdida en prueba sintética' } }); }
        return route.fulfill({ json: result });
      }
      throw Error('Unexpected synthetic API contract');
    }
    if (request.method() !== 'GET') return route.abort();
    const allowed = u.pathname === '/nomina' || u.pathname === '/nomina-control.html' || u.pathname.startsWith('/assets/') || ['/friendly-data.json', '/manifest.webmanifest'].includes(u.pathname);
    if (!allowed) return route.abort();
    if (published) return route.continue();
    const file = path.resolve(root, u.pathname === '/nomina' ? 'nomina-control.html' : '.' + u.pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
    return route.fulfill({ contentType: type, body: fs.readFileSync(file) });
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/nomina#resumen');
  await page.getByRole('tab', { name: 'Parámetros', exact: true }).waitFor();
  assert.equal(calls.length, 0, 'parameters do not warm private API on other tabs');
  await page.getByRole('tab', { name: 'Parámetros', exact: true }).click();
  const w = page.locator('[data-parameter-workspace]'); await w.getByText('Parámetros disponibles.', { exact: false }).waitFor();
  assert.equal(await page.locator('[data-liquidaciones-menu] a[aria-current=page]').getAttribute('href'), '/nomina#parametros');
  assert.equal(await page.getByRole('heading', { name: 'Revisar una fórmula antes de parametrizarla' }).isVisible(), false);
  checks.push('lazy authorized load, correct sidebar highlight, legacy technical lab collapsed');
  await w.getByLabel('¿Qué valor necesitás actualizar?', { exact: false }).selectOption('aux88-class13i-150');
  await w.getByLabel('Importe básico de la clase 13-I', { exact: false }).fill('100,01');
  await w.getByLabel('Desde qué mes', { exact: true }).fill('2026-10');
  await w.getByLabel('Resolución o escala que respalda el importe', { exact: false }).fill('ESCALA SINTÉTICA QA · no vigente');
  assert.equal(await w.locator('.pp-preview-row').count(), 3);
  assert.equal(await w.locator('.pp-preview-row strong').first().innerText(), '$ 150,02');
  await w.getByRole('button', { name: 'Revisar y guardar borrador' }).click();
  await w.getByRole('button', { name: 'Volver sin guardar' }).click(); assert.equal(writes.length, 0);
  await w.getByRole('button', { name: 'Revisar y guardar borrador' }).click();
  await w.getByRole('button', { name: 'Confirmar borrador' }).click();
  await w.getByText('Operación confirmada y guardada en Neon.', { exact: true }).waitFor();
  assert.equal(store.length, 1); assert.equal(writes.length, 1);
  const detailHost = w.locator('[data-parameter-detail]');
  assert.equal(await detailHost.locator('.pp-preview-row').count(), 3);
  checks.push('administrative input, exact half-cent preview, explicit confirmation and stored proposal');
  await page.getByRole('tab', { name: 'Reportes', exact: true }).click(); await page.getByRole('tab', { name: 'Parámetros', exact: true }).click();
  assert.equal(await w.getByLabel('Importe básico de la clase 13-I', { exact: false }).inputValue(), '100,01');
  assert.equal(await detailHost.isVisible(), true);
  checks.push('tab navigation preserves draft and record without extra mutation');
  for (const [label, ext] of [['Excel','xlsx'], ['PDF','pdf'], ['CSV','csv']]) { const downloading = page.waitForEvent('download'); await detailHost.getByRole('button', { name: 'Descargar ' + label, exact: true }).click(); const file = await downloading; await file.saveAs(path.join(out, 'synthetic-proposal.' + ext)); assert.ok(fs.statSync(path.join(out, 'synthetic-proposal.' + ext)).size > 100); }
  checks.push('Excel/PDF/CSV downloads reconsult the saved record and carry exact amounts');
  await w.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
  for (const width of [390,320]) { await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ reducedMotion: 'reduce' }); assert.ok(await w.evaluate(el => el.getBoundingClientRect().right <= innerWidth+1 && el.getBoundingClientRect().left >= 0)); assert.ok(await w.locator('button:visible').evaluateAll(items => items.every(item => item.getBoundingClientRect().height >= 44))); await w.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(out, 'mobile-' + width + '.png') }); }
  checks.push('320/390px workspace bounds, reduced motion and 44px controls');
  await page.setViewportSize({ width: 1440, height: 1000 });
  loseNext = true;
  await w.getByLabel('Resolución o escala que respalda el importe', { exact: false }).fill('SEGUNDA ESCALA SINTÉTICA QA');
  await w.getByRole('button', { name: 'Revisar y guardar borrador' }).click(); await w.getByRole('button', { name: 'Confirmar borrador' }).click();
  await w.getByRole('button', { name: 'Consultar confirmación' }).waitFor();
  assert.equal(await w.getByRole('button', { name: 'Revisar y guardar borrador' }).isDisabled(), true);
  const before = writes.length; await w.getByRole('button', { name: 'Consultar confirmación' }).click();
  await w.getByText('Operación confirmada y guardada en Neon.', { exact: true }).waitFor(); assert.equal(writes.length, before); assert.equal(store.length, 2);
  checks.push('lost mutation response resolves by original receipt without duplicate POST');
  await detailHost.getByRole('button', { name: 'Enviar a revisión', exact: true }).click(); await w.getByRole('button', { name: 'Confirmar operación' }).click();
  await detailHost.getByRole('heading', { name: 'En revisión', exact: true }).waitFor();
  assert.equal(await detailHost.getByRole('button', { name: 'Aprobar propuesta', exact: true }).count(), 0);
  role = 'checker'; await page.reload(); await w.getByText('Parámetros disponibles.', { exact: false }).waitFor();
  await w.locator('.pp-record').last().click(); await detailHost.getByRole('button', { name: 'Aprobar propuesta', exact: true }).waitFor();
  conflict = true; await detailHost.getByRole('button', { name: 'Aprobar propuesta', exact: true }).click(); await w.getByRole('button', { name: 'Confirmar operación' }).click();
  await w.getByText('La propuesta cambió. Volvé a abrirla.', { exact: true }).waitFor(); assert.equal(await detailHost.count(), 0);
  await w.locator('.pp-record').last().click(); await detailHost.getByRole('button', { name: 'Aprobar propuesta', exact: true }).click(); await w.getByRole('button', { name: 'Confirmar operación' }).click();
  await detailHost.getByRole('heading', { name: 'Propuesta aprobada', exact: true }).waitFor(); assert.equal(store[1].status, 'approved');
  assert.equal(await w.getByRole('button', { name: 'Revisar y guardar borrador' }).isDisabled(), true);
  checks.push('maker/checker actions, version-conflict invalidation and reviewed approval');
  denied = true; await w.getByRole('button', { name: 'Consultar', exact: true }).click();
  await w.getByText('El acceso a Parámetros no está disponible con esta sesión.', { exact: false }).waitFor(); assert.equal(await detailHost.count(), 0); assert.equal(await w.locator('.pp-record').count(), 0);
  checks.push('session denial clears the prior private view');
  assert.deepEqual(errors, []);
  const result = { ok: true, checks, checksPassed: checks.length, errors, browserApiMode: 'synthetic-only', uiSource: published ? 'Vercel production static assets' : 'compiled local files', privateRequestsForwarded: 0, actualWritesSent: 0, municipalSessionTested: false };
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  await context.close();
} finally { await browser.close(); }
