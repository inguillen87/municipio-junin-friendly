// Campanita de pendientes (pedido de Marcelo, 10/11/2026): que cada persona vea sola qué espera su decisión y qué
// decidieron sobre lo suyo. Junta las lecturas livianas de cada circuito (contrato de Root
// «own-contract-salary-conditions.pending.v1»): sin fundamentos, cuerpos ni padrón.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bellState, rememberedKeys, ago, periodText} from '../assets/pending-bell-model.js';
import {SALARY_CONDITIONS_PENDING_VERSION, salaryConditionsPending} from '../assets/own-contract-salary-conditions-pending.js';

const id = n => 'aaaaaaaa-aaaa-4aaa-8aaa-' + String(n).padStart(12, '0');
const review = (n, createdAt = '2026-11-10T12:00:00Z') => ({proposalId: id(n), period: '2026-10', authorLabel: 'Preparadora sintética', createdAt, canReview: true});
const decided = (n, recordedAt, status = 'approved') => ({eventId: id(100 + n), proposalId: id(n), period: '2026-10', status, actorLabel: 'Revisora sintética', recordedAt});
const pending = (toReview = [], done = []) => ({version: SALARY_CONDITIONS_PENDING_VERSION, generatedAt: '2026-11-10T15:00:00Z', complete: true, decisionWindowDays: 30, toReview, decided: done, counts: {toReview: toReview.length, decided: done.length}, payrollCalculated: false, payrollPosted: false});
const source = (key, title, p, extra = {}) => ({key, title, href: '/nomina#' + key, pending: p, ...extra});

test('la forma que consume la campanita es la que valida el modelo del circuito', () => {
 const p = pending([review(1)], [decided(2, '2026-11-10T14:00:00Z')]);
 try { salaryConditionsPending(p); } catch (e) { assert.fail('el ejemplo de esta prueba no cumple el contrato de Root: ' + e.message); }
 assert.equal(bellState([source('condiciones', 'Condiciones salariales', p)], []).count, 2);
});
test('el número rojo cuenta lo que espera tu decisión más las decisiones que todavía no se te mostraron', () => {
 const sources = [source('condiciones', 'Condiciones salariales', pending([review(1), review(2)], [decided(3, '2026-11-10T14:00:00Z')])), source('horas-convenio', 'Horas por convenio', pending([], [decided(4, '2026-11-09T10:00:00Z', 'rejected')]))];
 const fresh = bellState(sources, []);
 assert.deepEqual([fresh.waiting, fresh.news, fresh.count, fresh.badge], [2, 2, 4, '4']); assert.equal(fresh.label, '2 pendientes te esperan y 2 novedades de lo tuyo');
 assert.deepEqual(fresh.covered, ['Condiciones salariales', 'Horas por convenio']); assert.equal(fresh.complete, true);
 const seen = rememberedKeys(fresh, []); assert.deepEqual(seen.sort(), ['condiciones:' + id(103), 'horas-convenio:' + id(104)].sort());
 const after = bellState(sources, seen);
 assert.deepEqual([after.waiting, after.news, after.count, after.label], [2, 0, 2, '2 pendientes te esperan'], 'abrir la lista no baja lo que espera decisión');
 const oneSeen = bellState(sources, ['condiciones:' + id(103)]); assert.equal(oneSeen.news, 1, 'visto es por identificador de evento, no por hora');
 assert.deepEqual(rememberedKeys(after, ['viejo:' + id(9), ...seen]).sort(), seen.sort(), 'lo que ya no existe se olvida');
});
test('lo más antiguo que espera va primero; lo decidido, lo más reciente primero; y el mismo identificador en dos circuitos no se confunde', () => {
 const state = bellState([source('condiciones', 'Condiciones salariales', pending([review(1, '2026-11-10T12:00:00Z')], [decided(3, '2026-11-09T10:00:00Z')])), source('horas-convenio', 'Horas por convenio', pending([review(1, '2026-11-08T09:00:00Z')], [decided(3, '2026-11-10T14:00:00Z')]))], []);
 assert.deepEqual(state.toReview.map(r => r.title), ['Horas por convenio', 'Condiciones salariales']); assert.deepEqual(state.decided.map(r => r.title), ['Horas por convenio', 'Condiciones salariales']);
 assert.equal(new Set([...state.toReview, ...state.decided].map(r => r.key)).size, 4);
});
test('un circuito que falla o no cumple su forma no aporta cero: queda como sin respuesta', () => {
 const ok = pending([review(1)], []);
 const broken = [p => { p.complete = false; }, p => { p.counts.toReview = 0; }, p => { p.toReview[0].canReview = false; }, p => { p.toReview[0].period = '2026-13'; }, p => { p.toReview[0].proposalId = 'x'; }, p => { p.toReview = null; }, p => { p.decided = [{eventId: id(1)}]; p.counts.decided = 1; }];
 for (const mutate of broken) { const p = structuredClone(ok); mutate(p); const s = bellState([source('condiciones', 'Condiciones salariales', p), source('horas-convenio', 'Horas por convenio', pending([review(2)]))], []);
  assert.deepEqual([s.count, s.failed, s.covered, s.complete], [1, ['Condiciones salariales'], ['Horas por convenio'], false]); }
 const failed = bellState([source('condiciones', 'Condiciones salariales', null, {error: true})], []); assert.deepEqual([failed.count, failed.badge, failed.failed.length, failed.complete], [0, '', 1, false]);
 const none = bellState([source('condiciones', 'Condiciones salariales', pending())], []); assert.deepEqual([none.count, none.badge, none.label, none.complete], [0, '', 'Sin pendientes', true]);
 for (const bad of [null, 'x', [{key: 'a'}], [source('a', 'A', ok), source('a', 'B', ok)], [{...source('a', 'A', ok), href: 'https://ajeno.invalid/'}]]) assert.throws(() => bellState(bad, []), /PENDING_BELL/);
 assert.throws(() => bellState([], null), /PENDING_BELL_INVALID/);
});
test('tiempos y períodos en palabras', () => {
 const now = Date.parse('2026-11-10T15:00:00Z');
 assert.equal(ago('2026-11-10T14:59:40Z', now), 'recién'); assert.equal(ago('2026-11-10T14:35:00Z', now), 'hace 25 min'); assert.equal(ago('2026-11-10T12:00:00Z', now), 'hace 3 h');
 assert.equal(ago('2026-11-09T12:00:00Z', now), 'ayer'); assert.equal(ago('2026-11-05T12:00:00Z', now), 'hace 5 días'); assert.equal(ago('no', now), '');
 assert.equal(periodText('2026-10'), 'octubre de 2026'); assert.equal(periodText(null), '');
});
test('la pantalla no decide nada, no guarda datos de personas y todavía no se monta en ninguna página', () => {
 const ui = fs.readFileSync('assets/pending-bell.js', 'utf8'), model = fs.readFileSync('assets/pending-bell-model.js', 'utf8');
 assert.ok(!/fetch\(|\/api\//.test(ui + model), 'no conoce ninguna API: recibe las lecturas por parámetro');
 assert.ok(ui.includes("const key = 'mc.pendientes.visto.' + accountKey") && ui.includes('remember(rememberedKeys(state, seen()))'), 'sólo guarda identificadores de eventos ya mostrados');
 assert.ok(!/reason|authorEmail|employeeName|legajo/.test(ui + model), 'ni fundamentos ni datos de personas');
 assert.equal(ui.split('innerHTML').length - 1, 1, 'el único HTML fijo es el ícono; todo lo demás entra como texto');
 assert.ok(ui.includes("if (loading || document.hidden) return;") && ui.includes("document.addEventListener('mc:pending-refresh', () => load());"));
 assert.ok(ui.includes("'Por ahora avisa de: '") && ui.includes("No se cuentan como cero."), 'la cobertura parcial se dice');
 for (const page of fs.readdirSync('.').filter(f => f.endsWith('.html'))) assert.ok(!fs.readFileSync(page, 'utf8').includes('pending-bell'), page);
 assert.ok(!fs.readFileSync('scripts/build-friendly.mjs', 'utf8').includes('pending-bell'), 'no se publica hasta que la lectura del servidor esté instalada');
 assert.ok(!fs.readFileSync('assets/internal-guide.js', 'utf8').includes('pending-bell'));
});
