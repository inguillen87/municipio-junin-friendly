// Run explicitly: node --test tests/payroll-novelty-retro.browser.mjs
// Browser interaction uses invented records and intercepted routes only. No live API.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { before, after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:41789';
const record = (legajo = '42', amount = '0000123.45') => `${legajo.padStart(8, '0')}${amount}`;
const csvHeader = 'legajo;concepto;centro_costo;mes_ajuste;unidades;importe_ars;movimiento;instrumento_legal;observacion;forzado';
const staticFiles = new Set([
  '/novedades-nomina.html', '/assets/payroll-novelty-workbench.js',
  '/assets/payroll-novelty-retro-import.js', '/assets/payroll-novelty-exporter.js',
  '/assets/payroll-novelty-xlsx-exporter.js', '/assets/internal-capability-gate.js',
  '/assets/internal-guide.js', '/assets/product-guidance.js',
  '/assets/municontrol-enterprise.css', '/assets/pwa/icon.svg',
]);
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function openWorkbench(t, { capabilities = ['payroll.novelty.read', 'payroll.novelty.prepare'], viewport } = {}) {
  const context = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  t.after(() => context.close());
  const page = await context.newPage();
  const fixture = { capabilities, posts: [], failures: 0, errors: [], unexpected: [] };
  page.on('pageerror', (error) => fixture.errors.push(error.message));
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.origin !== origin) {
      fixture.unexpected.push(request.url());
      return route.abort();
    }
    if (url.pathname === '/api/internal-auth') {
      return json({ ok: true, authenticated: true, access: { tenantCapabilities: fixture.capabilities } });
    }
    if (url.pathname === '/api/internal-payroll-novelties') {
      if (request.method() === 'POST') {
        fixture.posts.push({ body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
        if (fixture.failures > 0) {
          fixture.failures -= 1;
          return json({ ok: false, error: 'Movimiento existente en conflicto.', details: { rowOrdinal: 1 } }, 409);
        }
        return json({ ok: true, data: { id: '00000000-0000-4000-8000-000000000042' } });
      }
      return json({
        ok: true, batches: [],
        principal: { capabilities: fixture.capabilities, email: 'operator@example.invalid', membershipId: 'synthetic-only' },
        limits: {
          contractVersion: 'payroll-novelty-batch.v1', approvalEffect: 'export_only',
          grhMutation: false, payrollCalculated: false, payrollPosted: false,
          maxRows: 500, payrollTypes: ['monthly', 'first_fortnight'],
        },
      });
    }
    if (!staticFiles.has(url.pathname)) {
      fixture.unexpected.push(url.pathname);
      return route.fulfill({ status: 404, body: 'Not available in isolated test' });
    }
    const contentType = url.pathname.endsWith('.html') ? 'text/html'
      : url.pathname.endsWith('.css') ? 'text/css'
        : url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/javascript';
    return route.fulfill({ contentType, body: await readFile(new URL(`..${url.pathname}`, import.meta.url)) });
  });
  await page.goto(`${origin}/novedades-nomina.html`);
  await page.locator('#loadingState').waitFor({ state: 'hidden' });
  t.after(() => {
    assert.deepEqual(fixture.errors, [], 'no JavaScript errors');
    assert.deepEqual(fixture.unexpected, [], 'no routes outside the isolated test');
  });
  return { page, fixture };
}

async function selectRetro(page, concept = '777') {
  await page.locator('[name="sourceMode"][value="bulk"]').check();
  await page.locator('#bulkFormat').selectOption('retro');
  await page.locator('#periodMonth').fill('2026-08');
  await page.locator('#payrollType').selectOption('monthly');
  if (concept !== null) await page.locator('#retroConceptSourceId').fill(concept);
}

test('RETRO requiere concepto explícito y crea sólo después de previsualizar; conserva CSV', async (t) => {
  const { page, fixture } = await openWorkbench(t);
  await selectRetro(page, null);
  assert.equal(await page.locator('#retroConceptSourceId').inputValue(), '');
  const source = `${record('42', '0000000.29')}\n${record('43', '9999999.99')}`;
  await page.locator('#bulkSource').fill(source);
  await page.locator('#preflightButton').click();
  assert.match(await page.locator('#messageHost').innerText(), /Indicá el concepto GRH/);
  assert.equal(await page.locator('#prepareButton').isDisabled(), true);
  await page.locator('#retroConceptSourceId').fill('777');
  await page.locator('#preflightButton').click();
  assert.match(await page.locator('#retroReport').innerText(), /2 filas con formato válido · 0 filas rechazadas/);
  assert.match(await page.locator('#previewCaption').innerText(), /TXT RETRO · concepto 777 · 2026-08 · Mensual/);
  assert.equal(fixture.posts.length, 0, 'preflight is local only');
  await page.locator('#prepareButton').click();
  await page.locator('#messageHost').filter({ hasText: 'Lote creado y auditado' }).waitFor();
  assert.equal(fixture.posts.length, 1);
  assert.deepEqual(fixture.posts[0].body.payload.rows.map((row) => [row.legajo, row.amountCents]), [['42', '29'], ['43', '999999999']]);
  assert.equal(fixture.posts[0].body.payload.sourceMode, 'bulk');
  assert.equal(fixture.posts[0].body.payload.periodMonth, '2026-08-01');
  assert.equal(fixture.posts[0].body.payload.payrollType, 'monthly');
  assert.equal(await page.locator('#bulkSource').inputValue(), source);
  await page.locator('#bulkFormat').selectOption('csv');
  await page.locator('#bulkSource').fill(`${csvHeader}\n${['44', '777', '', '', '', '1.23', '', '', '', 'NO'].join(';')}`);
  await page.locator('#preflightButton').click();
  assert.equal(await page.locator('#previewPanel').isVisible(), true);
  assert.match(await page.locator('#previewRows').innerText(), /1,23/);
});

test('RETRO conserva archivo y contenido al rechazar; exige corregir todas las filas', async (t) => {
  const { page, fixture } = await openWorkbench(t);
  await selectRetro(page);
  const source = `${record('42')}\r\nnot-retro\r\n${record('43', '0000000,01')}\r\n`;
  await page.locator('#bulkFile').setInputFiles({ name: 'synthetic-retro.txt', mimeType: 'text/plain', buffer: Buffer.from(`\uFEFF${source}`) });
  await page.locator('#bulkFileStatus').filter({ hasText: 'contenido leído' }).waitFor();
  await page.locator('#preflightButton').click();
  assert.match(await page.locator('#retroReport').innerText(), /1 filas con formato válido · 2 filas rechazadas/);
  assert.match(await page.locator('#retroReport').innerText(), /Fila 2:.*Fila 3:/s);
  assert.equal(await page.locator('#prepareButton').isDisabled(), true);
  assert.equal(await page.locator('#bulkFile').evaluate((element) => element.files.length), 1);
  assert.match(await page.locator('#bulkSource').inputValue(), /not-retro/);
  assert.equal(fixture.posts.length, 0);
  await page.locator('#bulkSource').fill(`${record('42')}\n${record('43', '0000000.01')}`);
  assert.equal(await page.locator('#retroReport').isVisible(), false);
  await page.locator('#preflightButton').click();
  assert.equal(await page.locator('#prepareButton').isDisabled(), false);
  assert.equal(await page.locator('#bulkFile').evaluate((element) => element.files[0].name), 'synthetic-retro.txt');
});

test('período, liquidación, concepto, formato y modo invalidan el resultado sin borrar contenido', async (t) => {
  const { page } = await openWorkbench(t);
  await selectRetro(page);
  await page.locator('#bulkSource').fill(record());
  const mutations = [
    () => page.locator('#periodMonth').fill('2026-09'),
    () => page.locator('#payrollType').selectOption('first_fortnight'),
    () => page.locator('#retroConceptSourceId').fill('778'),
    () => page.locator('#bulkFormat').selectOption('csv'),
    () => page.locator('[name="sourceMode"][value="individual"]').check(),
  ];
  for (const change of mutations) {
    await selectRetro(page);
    await page.locator('#preflightButton').click();
    assert.equal(await page.locator('#prepareButton').isDisabled(), false);
    await change();
    assert.equal(await page.locator('#prepareButton').isDisabled(), true);
    assert.equal(await page.locator('#previewPanel').isVisible(), false);
    assert.equal(await page.locator('#retroReport').isVisible(), false);
    assert.equal(await page.locator('#bulkSource').inputValue(), record());
  }
});

test('RETRO y CSV bloquean la clave de negocio duplicada existente', async (t) => {
  const { page, fixture } = await openWorkbench(t);
  await selectRetro(page);
  await page.locator('#bulkSource').fill(`${record('42')}\n${record('42', '0000000.01')}`);
  await page.locator('#preflightButton').click();
  assert.match(await page.locator('#retroReport').innerText(), /Repite el legajo y concepto de la fila 1/);
  assert.equal(await page.locator('#prepareButton').isDisabled(), true);
  await page.locator('#bulkFormat').selectOption('csv');
  const row = ['42', '777', '', '', '', '1.23', '', '', '', 'NO'].join(';');
  await page.locator('#bulkSource').fill(`${csvHeader}\n${row}\n${row}`);
  await page.locator('#preflightButton').click();
  assert.match(await page.locator('#messageHost').innerText(), /Fila 2: duplica la fila 1/);
  assert.equal(fixture.posts.length, 0);
});

test('conflicto del servidor conserva datos e idempotencia para reintento', async (t) => {
  const { page, fixture } = await openWorkbench(t);
  await selectRetro(page);
  await page.locator('#bulkSource').fill(record());
  await page.locator('#preflightButton').click();
  fixture.failures = 1;
  await page.locator('#prepareButton').click();
  await page.locator('#messageHost').filter({ hasText: 'No se pudo preparar el lote' }).waitFor();
  assert.match(await page.locator('#messageHost').innerText(), /Revisá la fila 1/);
  assert.equal(await page.locator('#bulkSource').inputValue(), record());
  assert.equal(await page.locator('#prepareButton').isDisabled(), false);
  await page.locator('#prepareButton').click();
  await page.locator('#messageHost').filter({ hasText: 'Lote creado y auditado' }).waitFor();
  assert.equal(fixture.posts.length, 2);
  assert.equal(fixture.posts[0].key, fixture.posts[1].key);
  assert.deepEqual(fixture.posts[0].body, fixture.posts[1].body);
});

test('UTF-8 inválido bloquea origen anterior, conserva contenido y no bloquea carga individual', async (t) => {
  const { page, fixture } = await openWorkbench(t);
  await selectRetro(page);
  await page.locator('#bulkSource').fill(record());
  await page.locator('#preflightButton').click();
  await page.locator('#bulkFile').setInputFiles({ name: 'invalid-utf8.txt', mimeType: 'text/plain', buffer: Buffer.from([0xc3, 0x28]) });
  await page.locator('#messageHost').filter({ hasText: 'No se pudo leer el archivo' }).waitFor();
  assert.equal(await page.locator('#bulkSource').inputValue(), record());
  assert.equal(await page.locator('#bulkFile').evaluate((element) => element.files.length), 1);
  await page.locator('#preflightButton').click();
  assert.equal(await page.locator('#prepareButton').isDisabled(), true);
  await page.locator('[name="sourceMode"][value="individual"]').check();
  await page.locator('#legajo').fill('44');
  await page.locator('#conceptSourceId').fill('777');
  await page.locator('#amountArs').fill('1.23');
  await page.locator('#preflightButton').click();
  await page.locator('#prepareButton').click();
  await page.locator('#messageHost').filter({ hasText: 'Lote creado y auditado' }).waitFor();
  assert.equal(fixture.posts.length, 1);
  assert.equal(fixture.posts[0].body.payload.sourceMode, 'individual');
});

test('consulta y aprobación sin prepare no ofrecen importación ni permiten preflight programático', async (t) => {
  for (const capabilities of [['payroll.novelty.read'], ['payroll.novelty.read', 'payroll.novelty.approve']]) {
    const { page, fixture } = await openWorkbench(t, { capabilities });
    assert.equal(await page.locator('#entrySection').isVisible(), false);
    assert.equal(await page.locator('#readOnlySection').isVisible(), true);
    await page.locator('#preflightButton').evaluate((element) => element.dispatchEvent(new Event('click')));
    await page.locator('#prepareButton').evaluate((element) => element.dispatchEvent(new Event('click')));
    assert.equal(fixture.posts.length, 0);
    assert.match(await page.locator('#messageHost').innerText(), /no tiene permiso para preparar/);
  }
});

test('pérdida de capacidad invalida el lote listo antes de permitir reintentos', async (t) => {
  const { page, fixture } = await openWorkbench(t);
  await selectRetro(page);
  await page.locator('#bulkSource').fill(record());
  await page.locator('#preflightButton').click();
  fixture.capabilities = ['payroll.novelty.read'];
  await page.locator('#refreshButton').click();
  await page.locator('#readOnlySection').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#prepareButton').isDisabled(), true);
  await page.locator('#prepareButton').evaluate((element) => element.dispatchEvent(new Event('click')));
  assert.equal(fixture.posts.length, 0);
});

test('RETRO móvil mantiene controles dentro de la pantalla y ayuda técnica plegada', async (t) => {
  const { page } = await openWorkbench(t, { viewport: { width: 390, height: 844 } });
  await selectRetro(page);
  await page.locator('#bulkSource').fill(record());
  await page.locator('#preflightButton').click();
  assert.equal(await page.locator('#retroFormatHelp details').evaluate((element) => element.open), false);
  const previewBadge = await page.locator('#previewPanel header .status').boundingBox();
  assert.ok(previewBadge && previewBadge.height <= 44, 'preview badge must not stretch on mobile');
  for (const id of ['bulkFormat', 'retroConceptSourceId', 'bulkSource', 'preflightButton', 'prepareButton']) {
    const box = await page.locator(`#${id}`).boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 391, `${id} fits mobile viewport`);
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
});

test('capturas RETRO opcionales con datos sintéticos y previsualización válida', {
  skip: process.env.PAYROLL_RETRO_QA_SCREENSHOTS !== '1',
}, async (t) => {
  await mkdir(new URL('../tmp/', import.meta.url), { recursive: true });
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 900 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const { page, fixture } = await openWorkbench(t, { viewport });
    await selectRetro(page);
    await page.locator('#bulkFile').setInputFiles({
      name: 'synthetic-retro.txt', mimeType: 'text/plain',
      buffer: Buffer.from(`${record('42', '0000123.45')}\r\n${record('43', '0000456.78')}\r\n`),
    });
    await page.locator('#bulkFileStatus').filter({ hasText: 'contenido leído' }).waitFor();
    await page.locator('#preflightButton').click();
    assert.equal(await page.locator('#previewPanel').isVisible(), true);
    assert.equal(await page.locator('#prepareButton').isDisabled(), false);
    assert.equal(fixture.posts.length, 0);
    if (name === 'desktop') {
      await page.locator('#bulkFormat').evaluate((element) => window.scrollTo({
        top: window.scrollY + element.getBoundingClientRect().top - 44, behavior: 'instant',
      }));
    } else await page.locator('#previewPanel').scrollIntoViewIfNeeded();
    const path = fileURLToPath(new URL(`../tmp/retro-qa-${name}.png`, import.meta.url));
    await page.screenshot({ path, animations: 'disabled' });
    console.log(`RETRO synthetic QA screenshot: ${path}`);
  }
});
