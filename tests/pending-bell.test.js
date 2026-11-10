// Campanita de pendientes (pedido de Marcelo, 10/11/2026): que cada persona vea sola qué espera su decisión y qué
// decidieron sobre lo suyo, sin mails ni WhatsApp. Modelo contra el contrato «pending-work.v1» propuesto a Root.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PENDING_WORK_VERSION, pendingWorkSummary, bellState, ago, periodText} from '../assets/pending-bell-model.js';

const id = n => 'aaaaaaaa-aaaa-4aaa-8aaa-' + String(n).padStart(12, '0');
const review = (n, createdAt = '2026-11-10T12:00:00Z') => ({source: 'own-contract-salary-conditions', title: 'Condiciones salariales', period: '2026-10', proposalId: id(n), authorLabel: 'Preparadora sintética', createdAt, reason: 'Propuesta exclusivamente sintética', href: '/nomina#condiciones'});
const decided = (n, recordedAt, status = 'approved') => ({source: 'own-agreement-working-time', title: 'Horas por convenio', period: '2026-10', proposalId: id(n), status, actorLabel: 'Revisora sintética', recordedAt, reason: 'Decisión exclusivamente sintética', href: '/nomina#horas-convenio'});
const summary = (toReview = [], done = [], counts = null) => ({version: PENDING_WORK_VERSION, generatedAt: '2026-11-10T15:00:00Z', toReview, decided: done, counts: counts ?? {toReview: toReview.length, decided: done.length}});

test('el número rojo cuenta lo que espera tu decisión más las novedades que todavía no viste', () => {
 const s = summary([review(1), review(2)], [decided(3, '2026-11-10T14:00:00Z'), decided(4, '2026-11-09T10:00:00Z', 'rejected')]);
 const fresh = bellState(s, null);
 assert.deepEqual([fresh.waiting, fresh.news, fresh.count, fresh.badge], [2, 2, 4, '4']);
 assert.equal(fresh.label, '2 pendientes te esperan y 2 novedades de lo tuyo');
 const afterOpening = bellState(s, '2026-11-10T13:00:00Z');
 assert.deepEqual([afterOpening.waiting, afterOpening.news, afterOpening.count], [2, 1, 3]);
 const allSeen = bellState(s, '2026-11-10T14:30:00Z');
 assert.equal(allSeen.count, 2, 'abrir la lista no baja lo que espera decisión: baja cuando se decide');
 assert.equal(allSeen.label, '2 pendientes te esperan');
 assert.deepEqual(allSeen.decided.map(r => r.fresh), [false, false]);
});
test('sin pendientes no hay número, y el tope se muestra como 99+', () => {
 const none = bellState(summary(), null); assert.deepEqual([none.count, none.badge, none.label], [0, '', 'Sin pendientes']);
 assert.equal(bellState(summary([review(1)], [], {toReview: 1, decided: 0}), null).label, '1 pendiente te espera');
 assert.equal(bellState(summary([], [decided(1, '2026-11-10T14:00:00Z')]), null).label, '1 novedad de lo tuyo');
 const many = bellState(summary([review(1)], [], {toReview: 250, decided: 0}), null); assert.equal(many.badge, '99+'); assert.equal(many.more, 249);
});
test('lo más antiguo que espera va primero; lo decidido, lo más reciente primero', () => {
 const state = bellState(summary([review(1, '2026-11-10T12:00:00Z'), review(2, '2026-11-08T09:00:00Z')], [decided(3, '2026-11-09T10:00:00Z'), decided(4, '2026-11-10T14:00:00Z')]), null);
 assert.deepEqual(state.toReview.map(r => r.proposalId), [id(2), id(1)]); assert.deepEqual(state.decided.map(r => r.proposalId), [id(4), id(3)]);
});
test('una respuesta que no cumple el contrato se rechaza entera: nunca se muestra un número inventado', () => {
 const ok = summary([review(1)], [decided(2, '2026-11-10T14:00:00Z')]); assert.equal(pendingWorkSummary(ok), ok);
 const cases = [
  s => { s.version = 'otra'; }, s => { s.extra = 1; }, s => { s.counts.toReview = 0; }, s => { s.counts.decided = -1; }, s => { s.toReview[0].href = 'https://ajeno.invalid/x'; },
  s => { s.toReview[0].href = '//ajeno.invalid'; }, s => { s.toReview[0].reason = 'x'.repeat(161); }, s => { s.toReview[0].reason = '<b>negrita</b>'; }, s => { s.toReview[0].dni = '1'; },
  s => { s.toReview[0].period = '2026-13'; }, s => { s.decided[0].status = 'pending'; }, s => { s.decided[0].recordedAt = 'ayer'; }, s => { s.decided[0].proposalId = s.toReview[0].proposalId; s.decided[0].source = s.toReview[0].source; },
  s => { s.toReview = null; }, s => { s.generatedAt = ''; },
 ];
 for (const mutate of cases) { const bad = structuredClone(ok); mutate(bad); assert.throws(() => bellState(bad, null), /PENDING_WORK_INVALID/); }
 for (const bad of [null, undefined, [], 'texto', 7]) assert.throws(() => pendingWorkSummary(bad), /PENDING_WORK_INVALID/);
});
test('tiempos y períodos en palabras', () => {
 const now = Date.parse('2026-11-10T15:00:00Z');
 assert.equal(ago('2026-11-10T14:59:40Z', now), 'recién'); assert.equal(ago('2026-11-10T14:35:00Z', now), 'hace 25 min'); assert.equal(ago('2026-11-10T12:00:00Z', now), 'hace 3 h');
 assert.equal(ago('2026-11-09T12:00:00Z', now), 'ayer'); assert.equal(ago('2026-11-05T12:00:00Z', now), 'hace 5 días'); assert.equal(ago('no', now), '');
 assert.equal(periodText('2026-10'), 'octubre de 2026'); assert.equal(periodText(null), '');
});
test('la pantalla no decide nada, no guarda datos de personas y todavía no se monta en ninguna página', () => {
 const ui = fs.readFileSync('assets/pending-bell.js', 'utf8');
 assert.ok(!/fetch\(|\/api\//.test(ui), 'no conoce ninguna API: recibe la lectura por parámetro');
 assert.ok(ui.includes("const key = 'mc.pendientes.visto.' + accountKey") && ui.includes('remember(new Date(now()).toISOString())'), 'sólo guarda cuándo se abrió la lista');
 assert.equal(ui.split('innerHTML').length - 1, 1, 'el único HTML fijo es el ícono; todo lo demás entra como texto');
 assert.ok(ui.includes("if (loading || document.hidden) return;"), 'con la pestaña oculta no consulta');
 assert.ok(ui.includes("document.addEventListener('mc:pending-refresh', () => load());"));
 for (const page of fs.readdirSync('.').filter(f => f.endsWith('.html'))) assert.ok(!fs.readFileSync(page, 'utf8').includes('pending-bell'), page);
 assert.ok(!fs.readFileSync('scripts/build-friendly.mjs', 'utf8').includes('pending-bell'), 'no se publica hasta que exista la lectura liviana del servidor');
 assert.ok(!fs.readFileSync('assets/internal-guide.js', 'utf8').includes('pending-bell'));
});
