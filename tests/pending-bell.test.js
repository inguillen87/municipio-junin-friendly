// Campanita de pendientes (pedido de Marcelo, 10/11/2026): que cada persona vea sola qué espera su decisión y qué
// decidieron sobre lo suyo. Junta las lecturas livianas de cada circuito (contrato de Root
// «own-contract-salary-conditions.pending.v1»): sin fundamentos, cuerpos ni padrón.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bellState, bellSeen, rememberedKeys, ago, periodText} from '../assets/pending-bell-model.js';
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
test('la pantalla no decide nada, no guarda datos de personas y sólo la conecta su módulo de montaje', () => {
 const ui = fs.readFileSync('assets/pending-bell.js', 'utf8'), model = fs.readFileSync('assets/pending-bell-model.js', 'utf8');
 assert.ok(!/fetch\(|\/api\//.test(ui + model), 'no conoce ninguna API: recibe las lecturas por parámetro');
 assert.ok(ui.includes("const key = 'mc.pendientes.visto.' + accountKey") && ui.includes('remember(rememberedKeys(state, seen()))'), 'sólo guarda identificadores de eventos ya mostrados');
 assert.ok(!/reason|authorEmail|employeeName|legajo/.test(ui + model), 'ni fundamentos ni datos de personas');
 assert.equal(ui.split('innerHTML').length - 1, 1, 'el único HTML fijo es el ícono; todo lo demás entra como texto');
 assert.ok(ui.includes("if (loading || document.hidden) return;") && ui.includes("document.addEventListener('mc:pending-refresh', () => load());"));
 assert.ok(ui.includes("'Sin respuesta de: '") && ui.includes("No se cuentan como cero.") && ui.includes("'No se pudo consultar ningún circuito. Se vuelve a intentar solo en un minuto.'"), 'un circuito sin lectura se nombra, y sin ninguna lectura no se dice «no hay nada»');
 assert.ok(!ui.includes('Por ahora avisa de'), 'ya no avisa de un solo circuito');
 const pages = fs.readdirSync('.').filter(f => f.endsWith('.html')).filter(f => fs.readFileSync(f, 'utf8').includes('pending-bell'));
 assert.deepEqual(pages, ['internal-dashboard.html', 'nomina-control.html', 'novedades-nomina.html'], 'la muestran Inicio, Liquidaciones y Novedades');
 for (const page of pages) assert.equal(fs.readFileSync(page, 'utf8').split('<script type="module" src="assets/pending-bell-mount.js"></script>').length - 1, 1, page);
 const build = fs.readFileSync('scripts/build-friendly.mjs', 'utf8');
 for (const file of ['assets/own-contract-salary-conditions-pending.js', 'assets/pending-bell-model.js', 'assets/pending-bell.js', 'assets/pending-bell.css', 'assets/pending-bell-mount.js']) assert.equal(build.split("'" + file + "'").length - 1, 1, file);
 assert.ok(!fs.readFileSync('assets/internal-guide.js', 'utf8').includes('pending-bell'));
});

// La campanita muestra los mismos circuitos que la bandeja «Pendientes de aprobación». Antes sólo escuchaba uno, y quien
// tenía una propuesta del maestro salarial esperándolo veía «No hay nada esperándote».
const circuit = (key, title, count, reviewable, href = '/nomina#parametros') => ({key, title, href, count, reviewable});

test('lo que espera a esta persona en cualquier circuito de la bandeja cuenta en el número rojo', () => {
 const state = bellState([], [], [circuit('salary-master', 'Maestro salarial', 1, 1), circuit('program', 'Programa de cálculo', 0, 0, '/nomina#reglas'), circuit('monthly-batches', 'Lotes mensuales', 2, 1, '/novedades#lotes')]);
 assert.equal(state.waiting, 2); assert.equal(state.count, 2); assert.equal(state.badge, '2'); assert.equal(state.label, '2 pendientes te esperan');
 assert.deepEqual(state.circuits.map(c => [c.title, c.mine, c.sure, c.href]), [['Maestro salarial', 1, true, '/nomina#parametros'], ['Lotes mensuales', 1, true, '/novedades#lotes']]);
 assert.equal(state.elsewhere, 1, 'el lote que decide otra persona no cuenta para vos, pero se dice que existe');
 assert.deepEqual(state.covered, ['Maestro salarial', 'Programa de cálculo', 'Lotes mensuales']); assert.equal(state.complete, true);
});

// Pedido de Marcelo (12/11): con 50 novedades fijas esperando, la campanita decía «50». El número cuenta avisos: uno por
// circuito con pendientes, uno por propuesta de la consulta liviana y uno por decisión sobre lo propio todavía no mostrada.
test('el número rojo cuenta avisos, no filas: 50 novedades fijas esperando son un aviso y el 50 se lee adentro', () => {
 const light = [{key: 'condiciones', title: 'Condiciones salariales', href: '/nomina#condiciones', pending: {complete: true, counts: {toReview: 0, decided: 1}, toReview: [],
  decided: [{eventId: '00000000-0000-4000-8000-000000000003', proposalId: '00000000-0000-4000-8000-000000000002', period: '2026-10', status: 'approved', actorLabel: 'Revisión municipal', recordedAt: '2026-11-10T12:00:00Z'}]}}];
 const state = bellState(light, [], [circuit('fixed', 'Novedades fijas', 50, 50, '/novedades#fijas')]);
 assert.deepEqual([state.waiting, state.notices, state.news, state.count, state.badge, state.total], [50, 1, 1, 2, '2', 51]);
 assert.equal(state.label, '2 avisos · 50 pendientes te esperan y 1 novedad de lo tuyo');
 assert.deepEqual(state.circuits.map(c => [c.title, c.mine]), [['Novedades fijas', 50]], 'la cantidad de propuestas sigue disponible para el texto del aviso');
 const opened = bellSeen(state);
 assert.deepEqual([opened.waiting, opened.notices, opened.news, opened.count, opened.badge, opened.total, opened.label], [50, 1, 0, 1, '1', 50, '1 aviso · 50 pendientes te esperan'], 'al abrir la lista queda el aviso que espera decisión');
 const more = bellState(light, state.shownKeys, [circuit('fixed', 'Novedades fijas', 51, 51, '/novedades#fijas')]);
 assert.deepEqual([more.count, more.badge, more.total], [1, '1', 51], 'una fila más en el mismo aviso no sube el número; sí cambia el total que se anuncia');
 const another = bellState(light, state.shownKeys, [circuit('fixed', 'Novedades fijas', 51, 51, '/novedades#fijas'), circuit('salary-master', 'Maestro salarial', 1, 1)]);
 assert.deepEqual([another.count, another.badge, another.label], [2, '2', '2 avisos · 52 pendientes te esperan'], 'otro circuito con pendientes es un aviso nuevo');
 const many = bellState([], [], Array.from({length: 120}, (_, i) => circuit('c' + i, 'Circuito ' + i, 2, 2)));
 assert.deepEqual([many.count, many.badge, many.waiting], [120, '99+', 240]);
});

test('un circuito que no dice cuáles decide esta persona avisa todas y lo aclara; uno sin pendientes no aparece', () => {
 const state = bellState([], [], [circuit('leave', 'Licencias solicitadas', 3, null, '/acciones'), circuit('adoption', 'Altas al padrón propio', 0, 0, '/personal?adopcion=pendientes#legajos')]);
 assert.equal(state.waiting, 3); assert.deepEqual(state.circuits.map(c => [c.title, c.mine, c.sure]), [['Licencias solicitadas', 3, false]]); assert.equal(state.elsewhere, 0);
});

test('un circuito sin respuesta o con una cuenta imposible queda «sin respuesta», nunca en cero', () => {
 for (const broken of [{key: 'adoption', title: 'Altas al padrón propio', href: '/personal?adopcion=pendientes#legajos', error: true}, circuit('adoption', 'Altas al padrón propio', 1, 2), circuit('adoption', 'Altas al padrón propio', -1, 0), circuit('adoption', 'Altas al padrón propio', '1', 0)]) {
  const state = bellState([], [], [circuit('salary-master', 'Maestro salarial', 1, 1), broken]);
  assert.deepEqual(state.failed, ['Altas al padrón propio']); assert.equal(state.complete, false); assert.equal(state.waiting, 1);
 }
 assert.throws(() => bellState([], [], [circuit('a', 'Uno', 0, 0), circuit('a', 'Otro', 0, 0)]), /PENDING_BELL_CIRCUIT_INVALID/);
 assert.throws(() => bellState([], [], [circuit('a', 'Uno', 0, 0, 'https://otro.example/x')]), /PENDING_BELL_CIRCUIT_INVALID/);
 assert.throws(() => bellState([], [], null), /PENDING_BELL_INVALID/);
});

test('los pendientes de los circuitos se suman a los de la consulta liviana y a las novedades de lo propio', () => {
 const light = [{key: 'condiciones', title: 'Condiciones salariales', href: '/nomina#condiciones', pending: {complete: true, counts: {toReview: 1, decided: 1},
  toReview: [{proposalId: '00000000-0000-4000-8000-000000000001', period: '2026-10', authorLabel: 'Preparación municipal', createdAt: '2026-11-01T10:00:00Z', canReview: true}],
  decided: [{eventId: '00000000-0000-4000-8000-000000000003', proposalId: '00000000-0000-4000-8000-000000000002', period: '2026-10', status: 'approved', actorLabel: 'Revisión municipal', recordedAt: '2026-11-09T12:00:00Z'}]}}];
 const state = bellState(light, [], [circuit('salary-master', 'Maestro salarial', 1, 1)]);
 assert.equal(state.waiting, 2); assert.equal(state.news, 1); assert.equal(state.count, 3); assert.equal(state.label, '2 pendientes te esperan y 1 novedad de lo tuyo');
 assert.deepEqual(bellState(light, []).circuits, [], 'sin circuitos, la campanita sigue funcionando como antes');
});
