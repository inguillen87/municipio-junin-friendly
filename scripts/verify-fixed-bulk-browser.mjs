// Página compilada de Novedades en Chromium. Sólo respuestas sintéticas en memoria;
// todas las solicitudes se interceptan, sin servicios externos ni base de datos.
// Ejecutar: node scripts/verify-fixed-bulk-browser.mjs (incluye build-friendly).
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {openFixedNovelties} from './lib/novelty-reference-browser.mjs';
import {fixedFixture, fixedSubject, fixedApprovedRecord, fixedPayrollTypes} from '../tests/fixtures/payroll-fixed-novelties-synthetic.js';
import '../assets/app-routes.js';

const root = path.resolve(import.meta.dirname, '..'), base = path.join(root, 'public');
const origin = 'https://municontrol.test', endpoint = '/api/internal-payroll-fixed-novelties';
const timeout = 12000;
const header = 'Legajo\tConcepto\tUnidades\tImporte\tFecha de alta\tVencimiento\tInstrumento';
const row = (legajo, concept = '80', date = '2026-09-15') => `${legajo}\t${concept}\t1\t\t${date}\t\tActo sintético QA`;
const sheet = (...rows) => [header, ...rows].join('\n');
const threeRows = sheet(row('1001'), row('1002'), row('1003'));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Tiempo agotado: ' + label)), timeout); })]); }
  finally { clearTimeout(timer); }
}

async function session(browser, {prepare = true, records = [], width = 1440} = {}) {
  const fixture = fixedFixture();
  fixture.state.records = structuredClone(records);
  // Sólo cambia esta capacidad: misma cuenta, identidad y permisos de lectura.
  const caps = fixture.cap().filter(cap => prepare || cap !== 'payroll.fixed.prepare');
  const context = await browser.newContext({viewport: {width, height: 1000}, locale: 'es-AR', serviceWorkers: 'block'});
  const posts = [], reads = [], unexpected = [], errors = [], gates = new Map();
  const h = {context, fixture, posts, reads, unexpected, errors, gates, failAt: null, inFlight: 0, maxInFlight: 0};
  h.hold = ordinal => {
    const started = deferred(), release = deferred(), done = deferred();
    const gate = {started, release, done, abort: false}; gates.set(ordinal, gate); return gate;
  };
  h.close = async () => {
    for (const gate of gates.values()) { gate.abort = true; gate.release.resolve(); }
    await context.close();
  };
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    const ok = data => route.fulfill({json: {ok: true, data}});
    const refuse = async () => { unexpected.push(request.method() + ' ' + url.pathname); await route.abort(); };
    try {
      if (url.origin !== origin) return await refuse();
      if (!url.pathname.startsWith('/api/')) {
        if (request.method() !== 'GET') return await refuse();
        const relative = globalThis.MuniControlRoutes.resolve(url.href, origin)?.file || url.pathname.slice(1);
        const file = path.resolve(base, relative);
        if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return await refuse();
        const contentType = /\.m?js$/.test(file) ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.json') ? 'application/json' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
        return await route.fulfill({contentType, body: fs.readFileSync(file)});
      }
      if (url.pathname === endpoint) {
        if (request.method() === 'POST') {
          const entry = {body: request.postDataJSON(), key: request.headers()['idempotency-key']};
          posts.push(entry); const ordinal = posts.length, gate = gates.get(ordinal);
          h.maxInFlight = Math.max(h.maxInFlight, ++h.inFlight);
          try {
            assert.equal(entry.body.command, 'propose', 'sólo se permiten propuestas individuales');
            assert.equal(prepare, true, 'no se admite un POST sin preparar');
            gate?.started.resolve();
            if (gate) { await gate.release.promise; if (gate.abort) return await route.abort('aborted'); }
            if (ordinal === h.failAt) return await route.fulfill({status: 409, json: {ok: false, code: 'PAYROLL_FIXED_CAPACITY_LIMIT', error: 'Falla sintética de la segunda propuesta'}});
            const result = fixture.mutate(entry.body.command, entry.body.payload, entry.key);
            assert.ok(result.data, 'el simulador debe aceptar la propuesta válida');
            return await route.fulfill({status: result.status, json: {ok: true, data: result.data}});
          } finally { h.inFlight--; gate?.done.resolve(); }
        }
        if (request.method() !== 'GET') return await refuse();
        const resource = url.searchParams.get('resource') || 'bootstrap'; reads.push(resource);
        if (resource === 'bootstrap') {
          const data = fixture.bootstrap(); data.principal.capabilities = caps; return await ok(data);
        }
        if (resource === 'list') return await ok(fixture.list(url.searchParams.get('periodMonth')));
        if (resource === 'employee') {
          const legajo = url.searchParams.get('legajo');
          assert.ok(['1001', '1002', '1003'].includes(legajo), 'sólo se consultan legajos sintéticos previstos');
          return await ok({version: 'payroll-fixed-employee.v1', subject: fixedSubject(legajo)});
        }
        return await refuse();
      }
      if (request.method() !== 'GET') return await refuse();
      if (url.pathname === '/api/internal-auth') return await route.fulfill({json: {
        ok: true, authenticated: true,
        user: {email: 'preparer@example.invalid', name: 'OPERADOR SINTÉTICO', role: 'ADMIN_INTERNO'},
        access: {tenantCapabilities: ['payroll.read', ...caps], platformCapabilities: [], platformRoles: []},
      }});
      if (url.pathname === '/api/internal-payroll-novelties') return await route.fulfill({json: {
        ok: true, principal: {email: 'preparer@example.invalid', ...fixture.principal(), capabilities: caps.filter(cap => cap.startsWith('payroll.novelty.'))},
        feature: {contractVersion: 'payroll-novelty-batch.v2', approvalEffect: 'export_only'},
        limits: {contractVersion: 'payroll-novelty-batch.v2', sourceModes: ['individual', 'bulk'], native: {maxRows: 1, sourceModes: ['individual'], payrollTypes: ['monthly']}, approvalEffect: 'export_only', grhMutation: false, payrollCalculated: false, payrollPosted: false, maxRows: 500, payrollTypes: fixedPayrollTypes}, batches: [],
      }});
      return await refuse();
    } catch (error) {
      errors.push(error.message);
      await route.abort().catch(() => {});
    }
  });
  try {
    const page = await context.newPage(); h.page = page; page.setDefaultTimeout(timeout);
    page.on('pageerror', error => errors.push(error.message));
    const host = page.locator('[data-fixed-host]');
    const select = name => host.locator(`[data-fn-${name}]`);
    const field = name => host.locator(`[data-fn-field="${name}"]`);
    const idle = () => page.waitForFunction(() => document.querySelector('[data-fixed-host]')?.getAttribute('aria-busy') === 'false');
    const status = async pattern => {
      await page.waitForFunction(source => new RegExp(source).test(document.querySelector('[data-fn-form-status]')?.textContent || ''), pattern.source);
      assert.match(await select('form-status').innerText(), pattern);
    };
    Object.assign(h, {host, select, field, idle, status});
    h.verify = async (text = threeRows) => {
      await select('bulk-new').click();
      await field('sheet').fill(text);
      await field('reason').fill('Carga conjunta sintética para revisión independiente');
      await select('bulk-verify').click();
      await select('preview-result').waitFor({state: 'visible'}); await idle();
    };
    h.start = async () => { await select('bulk-reviewed').check(); assert.equal(await select('save').isEnabled(), true); await select('save').click(); };
    h.finished = async total => { await status(new RegExp(`${total} propuestas guardadas de ${total}\\.`)); await idle(); };
    h.integrity = () => { assert.deepEqual(unexpected, [], 'ninguna solicitud imprevista ni externa'); assert.deepEqual(errors, [], 'sin errores de página o del simulador'); };
    await page.goto(origin + '/novedades-nomina.html'); await openFixedNovelties(page);
    await page.waitForFunction(() => /Registro consultado/.test(document.querySelector('[data-fn-status]')?.textContent || ''));
    await idle(); assert.ok(reads.includes('bootstrap') && reads.includes('list'), 'registro y permisos consultados');
    return h;
  } catch (error) { await h.close(); throw error; }
}

const scenarios = [
  ['El botón aparece únicamente con payroll.fixed.prepare', async run => {
    for (const prepare of [true, false]) await run({prepare}, async h => {
      assert.equal(await h.select('bulk-new').isVisible(), prepare);
      if (prepare) assert.equal(await h.select('bulk-new').isEnabled(), true);
      assert.equal(h.posts.length, 0, 'consultar permisos no guarda');
    });
  }],
  ['Tres filas tabuladas con encabezado muestran nombres consultados y Lista para guardar', async run => {
    await run({}, async h => {
      await h.verify(); assert.equal(await h.select('bulk-row').count(), 3);
      for (const [index, legajo] of ['1001', '1002', '1003'].entries()) {
        const cells = await h.host.locator(`[data-fn-bulk-row="${index + 2}"] td`).allTextContents();
        assert.equal(cells[0], String(index + 2), 'se conserva la fila física del encabezado');
        assert.equal(cells[1], legajo); assert.equal(cells[2], fixedSubject(legajo).employeeName);
        assert.equal(cells.at(-1), 'Lista para guardar');
      }
      assert.equal(await h.select('save').isDisabled(), true, 'falta confirmar la revisión');
      assert.equal(h.posts.length, 0, 'verificar no guarda');
    });
  }],
  ['La coincidencia de contrato, concepto y tipo queda en Ya existen y no se envía', async run => {
    await run({records: [fixedApprovedRecord(0)]}, async h => {
      await h.verify(sheet(row('1001'), row('1001', '81'), row('1002')));
      const group = h.select('preview-result').locator('tbody').filter({hasText: 'Ya existen en el registro consultado'});
      assert.equal(await group.count(), 1); assert.equal(await group.locator('[data-fn-bulk-row]').count(), 1);
      assert.equal(await group.locator('[data-fn-bulk-row="2"] td').last().innerText(), 'Ya existe');
      await h.start(); await h.finished(2);
      assert.deepEqual(h.posts.map(p => [p.body.payload.legajo, p.body.payload.values.conceptSourceId]), [['1001', '81'], ['1002', '80']]);
      assert.equal(h.fixture.state.records.filter(r => r.pending).length, 2);
    });
  }],
  ['Una fecha imposible informa la fila física y bloquea todo el guardado', async run => {
    await run({}, async h => {
      await h.verify(sheet(row('1001'), row('1002', '80', '2026-02-30'), row('1003')));
      assert.match(await h.host.locator('[data-fn-bulk-row="3"]').innerText(), /Fila 3:.*fecha/i);
      await h.select('bulk-reviewed').check();
      assert.equal(await h.select('save').isDisabled(), true);
      assert.equal(h.posts.length, 0);
    });
  }],
  ['Guardado en serie: una propuesta y clave por fila, con avance de 0 a 3 de 3', async run => {
    await run({}, async h => {
      await h.verify(); const gates = [1, 2, 3].map(n => h.hold(n)); await h.start();
      for (let index = 0; index < gates.length; index++) {
        await bounded(gates[index].started.promise, 'propuesta ' + (index + 1));
        await h.status(new RegExp(`${index} propuesta${index === 1 ? '' : 's'} guardada${index === 1 ? '' : 's'} de 3\\. Guardando la fila ${index + 2}`));
        assert.equal(h.posts.length, index + 1, 'no se adelanta otra propuesta mientras la respuesta está retenida');
        assert.equal(h.inFlight, 1); gates[index].release.resolve();
        await bounded(gates[index].done.promise, 'respuesta de propuesta ' + (index + 1));
      }
      await h.finished(3);
      assert.equal(h.maxInFlight, 1); assert.equal(h.posts.length, 3);
      assert.deepEqual(h.posts.map(p => p.body.payload.legajo), ['1001', '1002', '1003']);
      for (const entry of h.posts) {
        assert.equal(entry.body.command, 'propose');
        assert.match(entry.key, /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i, 'Idempotency-Key presente');
        assert.equal(entry.body.payload.values.payrollType, 'monthly');
      }
      assert.equal(new Set(h.posts.map(p => p.key)).size, 3);
      assert.equal(h.fixture.state.records.length, 3);
      assert.ok(h.fixture.state.records.every(r => r.pending && !r.approved), 'sólo propuestas pendientes');
    });
  }],
  ['Falla la segunda: se detiene y Continuar sólo reenvía pendientes con la clave y cuerpo originales', async run => {
    await run({}, async h => {
      h.failAt = 2; await h.verify(); await h.start();
      await h.status(/1 propuesta guardada de 3\..*Fila 3:.*Se detuvo la carga/); await h.idle();
      assert.equal(h.posts.length, 2); assert.equal(h.fixture.state.records.length, 1);
      assert.equal(await h.select('retry').innerText(), 'Continuar con las propuestas pendientes');
      assert.equal(await h.select('retry').isEnabled(), true);
      await h.select('retry').click(); await h.finished(3);
      assert.deepEqual(h.posts.map(p => p.body.payload.legajo), ['1001', '1002', '1002', '1003']);
      assert.deepEqual(h.posts[2], h.posts[1], 'reintenta exactamente el cuerpo y la clave fallidos');
      assert.equal(h.fixture.state.records.length, 3); assert.equal(h.maxInFlight, 1);
    });
  }],
  ['Ocultar durante el segundo envío conserva el contador y permite continuar sin duplicar la primera', async run => {
    await run({}, async h => {
      await h.verify(); const gate = h.hold(2); await h.start();
      await bounded(gate.started.promise, 'segundo envío antes de ocultar');
      await h.status(/1 propuesta guardada de 3\./);
      await h.page.evaluate(() => {
        Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal(await h.select('preview-result').isHidden(), true, 'se retiran los datos consultados');
      gate.abort = true; gate.release.resolve(); await bounded(gate.done.promise, 'envío interrumpido');
      await h.page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await h.status(/1 propuesta guardada de 3\..*La carga está detenida/); await h.idle();
      assert.equal(h.posts.length, 2, 'volver a la pestaña no reenvía automáticamente');
      assert.equal(await h.select('retry').isEnabled(), true);
      assert.equal(await h.select('bulk-row').count(), 3);
      assert.match(await h.host.locator('[data-fn-bulk-row="2"]').innerText(), /AGENTE SINTÉTICO 1001.*Guardada para revisión/s);
      await h.select('retry').click(); await h.finished(3);
      assert.deepEqual(h.posts.map(p => p.body.payload.legajo), ['1001', '1002', '1002', '1003']);
      assert.deepEqual(h.posts[2], h.posts[1]); assert.equal(h.fixture.state.records.length, 3);
    });
  }],
  ['A 390 px la página no desborda con planilla, revisión, error y carga finalizada', async run => {
    await run({width: 390}, async h => {
      const fits = async () => {
        await h.page.evaluate(() => document.fonts.ready);
        const size = await h.page.evaluate(() => ({page: document.documentElement.scrollWidth, body: document.body.scrollWidth, viewport: innerWidth}));
        assert.equal(size.viewport, 390); assert.ok(size.page <= 391 && size.body <= 391, 'la página no debe tener desplazamiento horizontal');
      };
      await h.select('bulk-new').click(); await h.field('sheet').fill(threeRows); await fits();
      await h.select('cancel').click(); await h.verify(); await fits();
      assert.equal(await h.select('bulk-row').count(), 3);
      h.failAt = 2; await h.start(); await h.status(/Se detuvo la carga/); await h.idle(); await fits();
      await h.select('retry').click(); await h.finished(3); await fits();
    });
  }],
];

export async function runFixedBulkVerification() {
  const results = []; let browser, prerequisite = null;
  try {
    console.log('Compilando con node scripts/build-friendly.mjs…');
    const build = spawnSync(process.execPath, ['scripts/build-friendly.mjs'], {cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024});
    if (build.error || build.status !== 0) {
      const denied = /Access is denied|EACCES|EPERM/i.test((build.stderr || '') + (build.error?.message || ''));
      throw Error(`No se pudo compilar (código ${build.status ?? build.error?.code ?? 'desconocido'})${denied ? ': acceso denegado' : ''}. No se usan archivos de una compilación incompleta.`);
    }
    browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})});
    const run = async (options, exercise) => {
      const h = await session(browser, options);
      try { await exercise(h); h.integrity(); } finally { await h.close(); }
    };
    for (const [name, exercise] of scenarios) {
      try { await exercise(run); results.push({name, status: 'passed'}); console.log(`OK ${results.length}. ${name}`); }
      catch (error) { results.push({name, status: 'failed'}); console.error(`FALLÓ ${results.length}. ${name}\n${error.message}`); }
    }
  } catch (error) {
    prerequisite = error.message; console.error('BLOQUEADO: ' + prerequisite);
  } finally {
    if (browser) try { await bounded(browser.close(), 'cerrar Chromium'); }
    catch { prerequisite = 'No se pudo cerrar Chromium.'; console.error('BLOQUEADO: ' + prerequisite); }
    for (const [name] of scenarios.slice(results.length)) {
      results.push({name, status: 'skipped'}); console.log(`NO EJECUTADO ${results.length}. ${name}`);
    }
  }
  const passed = results.filter(r => r.status === 'passed').length, failed = results.filter(r => r.status === 'failed').length, skipped = results.filter(r => r.status === 'skipped').length;
  const result = {ok: !prerequisite && failed === 0 && skipped === 0, total: results.length, passed, failed, skipped, prerequisite};
  console.log(`TOTAL: ${passed}/${results.length} aprobados; ${failed} fallidos; ${skipped} no ejecutados.`);
  console.log(JSON.stringify(result)); return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { if (!(await runFixedBulkVerification()).ok) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
