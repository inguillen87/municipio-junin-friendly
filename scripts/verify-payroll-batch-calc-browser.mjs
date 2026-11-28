#!/usr/bin/env node
// Laboratorio de «Calcular un convenio completo»: el módulo real en un navegador, con un servidor simulado.
// Comprueba el reparto en tandas, las personas que no se liquidan, el avance, una tanda que falla y se repite,
// el total exacto y que la pantalla entra en escritorio y celular sin guardar nada en el navegador.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv.find(a => a.startsWith('--output='))?.slice(9) ?? path.join(root, 'verification', 'payroll-batch-calc-browser.json');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const rows = Array.from({ length: 292 }, (_, i) => ({ contractId: id(i + 1), legajo: String(1000 + i), agreement: 'CONVENIO SINTÉTICO GRANDE', status: 'active', startDate: '2020-01-01' }))
  .concat(Array.from({ length: 12 }, (_, i) => ({ contractId: id(900 + i), legajo: String(5000 + i), agreement: 'CONVENIO SINTÉTICO CHICO', status: 'active', startDate: '2021-03-01' })));
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' };
const posts = [], decisions = [], runs = new Map(); let failNext = 2, failDecision = 3, viewer = 'ana', selfConfirm = true, clock = Date.parse('2026-11-27T12:00:00Z');
const allowed = (run, state) => state === 'confirmed' ? (selfConfirm || run.by !== viewer ? ['annul'] : []) : state === 'calculated' ? [...(selfConfirm || run.by !== viewer ? ['confirm'] : []), ...(run.by === viewer ? ['cancel'] : [])] : [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (url.pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font:16px system-ui"><main style="padding:16px"><section id="host"></section></main><script type="module">import {mountBatchCalc} from "/assets/payroll-batch-calc.js";window.api=mountBatchCalc(document.getElementById("host"));</script></body></html>'); }
  if (url.pathname.startsWith('/assets/')) { const file = path.join(root, url.pathname); if (!file.startsWith(path.join(root, 'assets')) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }); return res.end(fs.readFileSync(file)); }
  if (url.pathname === '/api/internal-data') return send(200, { ok: true, data: { rows } });
  if (url.pathname === '/api/internal-own-payroll-run' && req.method === 'GET') return send(200, { ok: true, data: { scopeVersion: 'a'.repeat(64), programVersion: 'b'.repeat(64), runs: [] } });
  if (url.pathname === '/api/internal-own-payroll-run' && req.method === 'POST') {
    let raw = ''; for await (const chunk of req) raw += chunk; const body = JSON.parse(raw); posts.push({ key: req.headers['idempotency-key'], accept: req.headers.accept, body });
    if (posts.length === failNext) return send(422, { ok: false, error: 'Falta la declaración familiar aprobada del contrato y período.' });
    const runId = id(7000 + posts.length), resultSha256 = String(posts.length % 10).repeat(64); runs.set(runId, { resultSha256, selection: body.payload.selection, by: viewer, createdAt: new Date(clock += 60000).toISOString(), states: new Map(body.payload.selection.values.map(c => [c, 'calculated'])) });
    return send(201, { ok: true, data: { id: runId, saved: { id: runId, resultSha256, result: { employeeTotals: body.payload.selection.values.map(contractId => ({ contractId, gross: '1000.10', deduction: '200.05', net: '800.05' })) } } } });
  }
  if (url.pathname === '/api/internal-own-payroll-liquidation' && req.method === 'GET' && url.searchParams.get('resource') === 'bootstrap') return send(200, { ok: true, data: { version: 'own-liquidation-bootstrap.v1', scopeVersion: 'c'.repeat(64), complete: true, runs: [...runs].map(([runId, run]) => ({ id: runId, period: '2026-11', liquidationType: 'monthly', createdAt: run.createdAt, employeeCount: run.states.size, resultSha256: run.resultSha256, canConsult: true })) } });
  if (url.pathname === '/api/internal-own-payroll-liquidation' && req.method === 'GET' && url.searchParams.get('resource') === 'detail') {
    const run = runs.get(url.searchParams.get('id')); if (!run) return send(404, { ok: false, error: 'No se encontró la corrida.' });
    return send(200, { ok: true, data: { id: url.searchParams.get('id'), scopeVersion: 'c'.repeat(64), stateVersion: 'd'.repeat(64), employees: [...run.states].map(([contractId, state]) => ({ contractId, state, blockedBy: null, allowedCommands: allowed(run, state) })) } });
  }
  if (url.pathname === '/api/internal-own-payroll-liquidation' && req.method === 'POST') {
    let raw = ''; for await (const chunk of req) raw += chunk; const body = JSON.parse(raw); decisions.push({ key: req.headers['idempotency-key'], body });
    if (decisions.length === failDecision) return send(409, { ok: false, error: 'Cambió el alcance o una decisión del período. Actualizá y revisá antes de otro envío.' });
    const run = runs.get(body.payload.runId), next = { confirm: 'confirmed', annul: 'annulled', cancel: 'cancelled' }[body.payload.command];
    if (body.payload.selection.values.some(c => !allowed(run, run.states.get(c)).includes(body.payload.command))) return send(409, { ok: false, error: 'La decisión no está disponible para ese alcance.' });
    for (const c of body.payload.selection.values) run.states.set(c, next); return send(201, { ok: true, data: { runId: body.payload.runId } });
  }
  send(404, { ok: false });
});
await new Promise(r => server.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) }); const checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/'); const $ = n => page.locator('[data-bc-' + n + ']');
  assert.equal(posts.length, 0); assert.ok(await $('plan').isDisabled()); checks.push('opening the screen reads and calculates nothing');
  assert.equal(await $('load').isHidden(), true); assert.equal(posts.length, 0); await $('period').fill('2026-11'); await $('agreement').focus(); await page.waitForFunction(() => document.querySelector('[data-bc-agreement]').options.length === 3);
  await $('agreement').selectOption('CONVENIO SINTÉTICO GRANDE'); await $('excluded').fill('1001, 1005\n7777 x9'); await $('plan').click();
  assert.equal(await page.locator('.mc-batch-item').count(), 4); assert.match(await $('status').innerText(), /290 personas en 4 tandas/);
  const notes = await $('notes').innerText(); assert.match(notes, /No se liquidan este mes: 1001, 1005/); assert.match(notes, /7777/); assert.match(notes, /x9/); assert.equal(posts.length, 0);
  checks.push('292 people minus two left out become four even batches before anything is calculated');
  await $('run').click(); await page.locator('.mc-batch-item[data-state=failed]').waitFor();
  assert.equal(posts.length, 2); assert.equal(await page.locator('.mc-batch-item[data-state=done]').count(), 1); assert.match(await page.locator('.mc-batch-item[data-state=failed]').innerText(), /declaración familiar/);
  assert.equal(await $('total').isHidden(), true); checks.push('a failed batch stops the queue, shows the reason and keeps what was already calculated');
  failNext = -1; await page.locator('.mc-batch-item[data-state=failed] button').click(); await page.locator('.mc-batch-item[data-state=done]').nth(1).waitFor();
  assert.equal(posts.length, 3); assert.notEqual(posts[2].key, posts[1].key); assert.deepEqual(posts[2].body.payload.selection, posts[1].body.payload.selection); checks.push('repeating a refused batch sends the same people under a new attempt');
  await $('run').click(); await $('total').waitFor(); assert.equal(posts.length, 5);
  const sent = posts.filter((_, i) => i !== 1).flatMap(p => p.body.payload.selection.values); assert.equal(new Set(sent).size, 290); assert.ok(!sent.includes(id(2)) && !sent.includes(id(6)));
  assert.ok(posts.every(p => p.body.operation === 'calculate' && p.body.payload.selection.kind === 'contracts' && p.body.payload.period === '2026-11' && p.body.payload.liquidationDate === '2026-11-30' && p.body.payload.selection.values.length <= 90 && /payroll-full/.test(p.accept)));
  const total = await $('total').innerText(); assert.match(total, /290/); assert.match(total, /\$\s290\.029,00/); assert.match(total, /\$\s58\.014,50/); assert.match(total, /\$\s232\.014,50/);
  assert.equal(await $('bar').getAttribute('aria-valuenow'), '100'); checks.push('every person is calculated exactly once and the agreement total is exact to the cent');
  // Confirmar todo el convenio con un botón.
  await $('confirm').waitFor(); assert.ok(await $('confirm-go').isDisabled()); assert.match(await $('reason').inputValue(), /290 personas/); assert.equal(decisions.length, 0);
  await $('reviewed').check(); assert.match(await $('confirm-go').innerText(), /Confirmar 4 tandas/); checks.push('confirmation is offered only after every batch is calculated and needs an explicit review');
  await $('confirm-go').click(); await page.waitForFunction(() => /no se confirmó/.test(document.querySelector('[data-bc-confirm-status]').textContent));
  assert.equal(decisions.length, 3); assert.match(await $('confirm-go').innerText(), /Confirmar 2 tandas/); checks.push('a refused confirmation stops there and says which batches are already confirmed');
  failDecision = -1; await $('confirm-go').click(); await page.waitForFunction(() => /Convenio confirmado: 290 personas/.test(document.querySelector('[data-bc-confirm-status]').textContent));
  assert.equal(decisions.length, 5); const good = decisions.filter((_, i) => i !== 2);
  assert.equal(new Set(good.flatMap(d => d.body.payload.selection.values)).size, 290); assert.equal(new Set(decisions.map(d => d.key)).size, 5);
  assert.ok(decisions.every(d => d.body.operation === 'command' && d.body.payload.command === 'confirm' && d.body.payload.reviewConfirmed === true && d.body.payload.reason.length >= 10 && runs.get(d.body.payload.runId).resultSha256 === d.body.payload.resultSha256 && JSON.stringify(runs.get(d.body.payload.runId).selection) === JSON.stringify(d.body.payload.selection)));
  assert.ok(await $('confirm-go').isDisabled()); assert.equal(await page.locator('.mc-batch-item small', { hasText: 'Confirmada' }).count(), 4); checks.push('every batch is confirmed once, with its own result fingerprint and the same reason');
  // Corregir a dos personas: anular solo a ellas, recalcularlas y que las confirme otra persona.
  await $('only').fill('1010, 1020'); assert.equal(await page.locator('.mc-batch-item').count(), 0);
  assert.equal(await $('undo').isHidden(), true); await page.locator('[data-bc-mode=annul]').click(); assert.equal(await $('calc-step').isHidden(), true); assert.equal(await $('excluded-label').isHidden(), true); assert.match(await $('who-title').innerText(), /A quiénes anular/); await $('undo-find').click(); await page.waitForFunction(() => /2 confirmadas y 0 calculadas/.test(document.querySelector('[data-bc-undo-status]').textContent));
  assert.ok(await $('undo-go').isDisabled()); assert.equal(await $('undo-confirm').isHidden(), true); assert.equal(await $('undo-reason').inputValue(), ''); assert.equal(decisions.length, 5);
  checks.push('the three tasks are separate: Anular shows only who and why, without the calculation steps');
  checks.push('searching what is already calculated reads the newest runs first, decides nothing and never proposes an annulment reason');
  await $('undo-reason').fill('Se corrige el presentismo de dos personas'); await $('undo-reviewed').check(); assert.match(await $('undo-go').innerText(), /Anular 2 personas/); await $('undo-go').click();
  await page.waitForFunction(() => /2 personas anuladas/.test(document.querySelector('[data-bc-undo-status]').textContent));
  const annulled = decisions.slice(5); assert.ok(annulled.length >= 1 && annulled.every(d => d.body.payload.command === 'annul' && d.body.payload.selection.kind === 'contracts'));
  assert.deepEqual(annulled.flatMap(d => d.body.payload.selection.values).sort(), [id(11), id(21)]); assert.equal([...runs.values()].flatMap(r => [...r.states.values()]).filter(v => v === 'confirmed').length, 288);
  checks.push('only the two listed people are annulled; the other 288 stay confirmed');
  selfConfirm = false; await page.locator('[data-bc-mode=calc]').click(); await $('plan').click(); assert.match(await $('status').innerText(), /2 personas en 1 tanda/); await $('run').click(); await $('confirm').waitFor();
  assert.deepEqual(posts.at(-1).body.payload.selection.values, [id(11), id(21)]); await $('reviewed').check(); const before = decisions.length; await $('confirm-go').click();
  await page.waitForFunction(() => /la tiene que confirmar otra persona/.test(document.querySelector('[data-bc-confirm-status]').textContent)); assert.equal(decisions.length, before);
  checks.push('whoever calculated is told up front that another person confirms, and nothing is sent');
  viewer = 'beto'; await page.locator('[data-bc-mode=confirm]').click(); assert.equal(await $('undo-go').isHidden(), true); await $('undo-find').click(); await page.waitForFunction(() => /0 confirmadas y 2 calculadas/.test(document.querySelector('[data-bc-undo-status]').textContent));
  await $('undo-reason').fill('Totales revisados contra la planilla'); await $('undo-reviewed').check(); assert.match(await $('undo-confirm').innerText(), /Confirmar 2 personas/); assert.equal(await $('undo-go').isHidden(), true); await $('undo-confirm').click();
  await page.waitForFunction(() => /2 personas confirmadas/.test(document.querySelector('[data-bc-undo-status]').textContent));
  assert.equal(decisions.at(-1).body.payload.command, 'confirm'); assert.equal([...runs.values()].flatMap(r => [...r.states.values()]).filter(v => v === 'confirmed').length, 290);
  checks.push('a second person confirms an agreement calculated by someone else with one button');
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth ? null : [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(e => e.tagName + '.' + e.className).join(' | '));
    assert.equal(wide, null, 'overflow at ' + width + ': ' + wide);
    assert.ok(await page.evaluate(() => [...document.querySelectorAll('.mc-batch-calc :is(button,input,select,textarea)')].filter(e => e.offsetParent).every(e => (e.type === 'checkbox' ? e.closest('label') : e).getBoundingClientRect().height >= 44)), 'controls under 44px at ' + width);
    await page.screenshot({ path: out.replace(/\.json$/, '-' + width + '.png'), fullPage: true });
  }
  checks.push('fits 1440, 390 and 320 px with 44 px controls');
  assert.deepEqual(await page.evaluate(() => [Object.keys(localStorage).length, Object.keys(sessionStorage).length]), [0, 0]); assert.deepEqual(errors, []); checks.push('no browser storage and no page errors');
  await page.locator('[data-bc-mode=calc]').click(); await $('only').fill(''); await $('agreement').selectOption('CONVENIO SINTÉTICO CHICO'); assert.equal(await page.locator('.mc-batch-item').count(), 0); await $('plan').click(); assert.equal(await page.locator('.mc-batch-item').count(), 1); await $('type').selectOption('vacation'); assert.equal(await page.locator('.mc-batch-item').count(), 0); await $('plan').click(); await $('run').click(); await $('confirm').waitFor(); assert.equal(posts.at(-1).body.payload.liquidationType, 'vacation'); assert.match(await $('reason').inputValue(), /^Segunda liquidación 2026-11 de CONVENIO SINTÉTICO CHICO: 12 personas/); checks.push('changing the request discards the previous plan; a small agreement is a single batch; the second liquidation is calculated with its own type');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify({ ok: true, checksPassed: checks.length, checks, syntheticPosts: posts.length, realApiCalls: 0 }, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, checksPassed: checks.length }));
} finally { await browser.close(); server.close(); }
