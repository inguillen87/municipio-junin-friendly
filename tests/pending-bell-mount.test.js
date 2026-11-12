// Montaje de la campanita: todos los datos de estas pruebas son ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PENDING_BELL_READERS, pendingBellReadersFor, pendingBellSources, pendingBellAccountKey, pendingBellCircuits, pendingBellReading} from '../assets/pending-bell-mount.js';
import {APPROVAL_SOURCES, visibleApprovalSources} from '../assets/approvals-inbox-model.js';
import {SALARY_CONDITIONS_PENDING_VERSION} from '../assets/own-contract-salary-conditions-pending.js';
import {SALARY_CONDITIONS_READ} from '../assets/own-contract-salary-conditions-model.js';
import {bellState} from '../assets/pending-bell-model.js';

const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const pending = () => ({version: SALARY_CONDITIONS_PENDING_VERSION, generatedAt: '2026-11-10T16:00:00.000Z', complete: true, decisionWindowDays: 30,
 toReview: [{proposalId: uuid(1), period: '2026-10', authorLabel: 'Preparación municipal', createdAt: '2026-11-01T10:00:00+00:00', canReview: true}],
 decided: [{eventId: uuid(3), proposalId: uuid(2), period: '2026-10', status: 'approved', actorLabel: 'Revisión municipal', recordedAt: '2026-11-09T12:00:00.123456+00:00'}],
 counts: {toReview: 1, decided: 1}, payrollCalculated: false, payrollPosted: false});

test('each reader names one light query, its screen and the permissions it needs', () => {
 assert.equal(PENDING_BELL_READERS.length, 1);
 const [r] = PENDING_BELL_READERS;
 assert.deepEqual({key: r.key, title: r.title, href: r.href, url: r.url}, {key: 'condiciones', title: 'Condiciones salariales', href: '/nomina#condiciones', url: '/api/internal-own-contract-salary-conditions?resource=pending'});
 assert.equal(r.capabilities, SALARY_CONDITIONS_READ); assert.ok(Object.isFrozen(PENDING_BELL_READERS) && Object.isFrozen(r));
});

test('an account only reads the readers it holds every permission for', () => {
 assert.equal(pendingBellReadersFor(new Set(SALARY_CONDITIONS_READ)).length, 1);
 assert.equal(pendingBellReadersFor(new Set([...SALARY_CONDITIONS_READ, 'payroll.read'])).length, 1);
 for (const missing of SALARY_CONDITIONS_READ) assert.equal(pendingBellReadersFor(new Set(SALARY_CONDITIONS_READ.filter(c => c !== missing))).length, 0, missing);
 assert.equal(pendingBellReadersFor(new Set()).length, 0);
});

test('a good reading reaches the bell and is counted; nothing else is requested', async () => {
 const asked = [], sources = await pendingBellSources(async url => { asked.push(url); return {ok: true, data: pending()}; }, PENDING_BELL_READERS);
 assert.deepEqual(asked, ['/api/internal-own-contract-salary-conditions?resource=pending']);
 assert.deepEqual(Object.keys(sources[0]), ['key', 'title', 'href', 'pending']);
 const state = bellState(sources, []);
 assert.equal(state.count, 2); assert.equal(state.toReview.length, 1); assert.equal(state.decided.length, 1); assert.deepEqual(state.failed, []); assert.equal(state.complete, true);
 assert.equal(bellState(sources, state.shownKeys).count, 1, 'lo ya mostrado deja de contarse; lo que espera decisión sigue');
});

test('a failed, refused or malformed reading is reported as no answer, never as zero', async () => {
 const broken = pending(); broken.counts.toReview = 0;
 const extra = pending(); extra.toReview[0].reason = 'no corresponde';
 for (const read of [async () => { throw new Error('red'); }, async () => ({ok: false, code: 'FORBIDDEN'}), async () => null, async () => ({ok: true, data: broken}), async () => ({ok: true, data: extra}), async () => ({ok: true, data: {...pending(), complete: false}})]) {
  const sources = await pendingBellSources(read, PENDING_BELL_READERS);
  assert.deepEqual(sources, [{key: 'condiciones', title: 'Condiciones salariales', href: '/nomina#condiciones', error: true}]);
  const state = bellState(sources, []); assert.deepEqual(state.failed, ['Condiciones salariales']); assert.equal(state.complete, false); assert.equal(state.count, 0);
 }
});

test('the remembered-items key identifies account, municipality and role without storing the address', async () => {
 const a = await pendingBellAccountKey('["u1","persona@example.invalid","t1","payroll_reviewer"]'), b = await pendingBellAccountKey('["u1","persona@example.invalid","t1","payroll_operator"]');
 assert.match(a, /^[a-f0-9]{32}$/); assert.notEqual(a, b); assert.equal(a, await pendingBellAccountKey('["u1","persona@example.invalid","t1","payroll_reviewer"]'));
 assert.ok(!a.includes('persona') && !a.includes('example'));
});

test('the mount module is the only place that knows a query, and it knows no reasons or people', () => {
 const mount = fs.readFileSync('assets/pending-bell-mount.js', 'utf8');
 assert.deepEqual([...mount.matchAll(/'(\/api\/[^']+)'/g)].map(m => m[1]).sort(), ['/api/internal-auth', '/api/internal-own-contract-salary-conditions?resource=pending'], 'las demás consultas son las de la bandeja, no una lista propia');
 assert.ok(mount.includes("import {visibleApprovalSources, lastClosedMonth} from './approvals-inbox-model.js';"));
 assert.ok(!/reason|employeeName|innerHTML|localStorage|sessionStorage/.test(mount) && !/legajos? *[:=(]|\.legajo/.test(mount));
 assert.ok(!/method:\s*'POST'|operation:'command'/.test(mount), 'sólo lee');
 assert.ok(mount.includes("doc.querySelector('.topbar .top-actions, .topbar .topbar-actions')") && mount.includes("if (readers.length === 0 && sources.length === 0) return null;"));
 assert.ok(mount.includes("inboxHref: sources.length ? '/nomina#resumen' : ''"), 'el enlace a la bandeja completa sólo aparece si la cuenta ve algún circuito');
});

// Los circuitos de la bandeja «Pendientes de aprobación» también avisan en la campanita. Datos ficticios.
const master = n => ({ok: true, data: {catalog: {version: 'v7'}, proposals: Array.from({length: n}, (_, i) => ({status: 'pending', baseVersion: 'v7', canReview: i === 0, authorLabel: 'Preparación municipal', createdAt: '2026-11-11T21:00:00Z', reason: 'Motivo que no debe salir de la bandeja', items: [{}, {}]}))}});
const allCaps = new Set(APPROVAL_SOURCES.flatMap(s => s.caps));

test('de cada circuito de la bandeja la campanita toma sólo cuántos esperan y cuántos decide esta cuenta', async () => {
 const sources = visibleApprovalSources(allCaps).filter(s => ['program', 'salary-master'].includes(s.key)), asked = [];
 const circuits = await pendingBellCircuits(async url => { asked.push(url); return url.includes('native-salary') ? master(2) : {ok: true, data: {proposals: []}}; }, sources, '2026-10');
 assert.deepEqual(asked.sort(), ['/api/internal-native-salary?resource=bootstrap', '/api/internal-own-payroll-program?resource=bootstrap']);
 assert.deepEqual(circuits, [{key: 'program', title: 'Programa de cálculo', href: '/nomina#reglas', count: 0, reviewable: 0}, {key: 'salary-master', title: 'Maestro salarial', href: '/nomina#parametros', count: 2, reviewable: 1}]);
 assert.ok(!JSON.stringify(circuits).includes('Motivo') && !JSON.stringify(circuits).includes('Preparación'), 'ni fundamentos ni personas');
 const state = bellState([], [], circuits); assert.equal(state.waiting, 1); assert.equal(state.elsewhere, 1);
});

test('todos los circuitos de la bandeja tienen un enlace que la campanita acepta, y se leen de a dos por vez', async () => {
 const sources = visibleApprovalSources(allCaps); assert.equal(sources.length, APPROVAL_SOURCES.length);
 let running = 0, most = 0;
 const circuits = await pendingBellCircuits(async () => { running++; most = Math.max(most, running); await new Promise(resolve => setImmediate(resolve)); running--; throw new Error('red'); }, sources);
 assert.equal(most, 2); assert.equal(circuits.length, sources.length); assert.ok(circuits.every(c => c.error === true));
 const state = bellState([], [], circuits); assert.equal(state.failed.length, sources.length); assert.equal(state.count, 0); assert.equal(state.complete, false);
});

test('una respuesta rechazada o con otra forma deja el circuito sin respuesta', async () => {
 const [source] = visibleApprovalSources(allCaps).filter(s => s.key === 'salary-master');
 for (const read of [async () => ({ok: false, code: 'FORBIDDEN'}), async () => null, async () => { throw new Error('503'); }]) {
  assert.deepEqual(await pendingBellCircuits(read, [source]), [{key: 'salary-master', title: 'Maestro salarial', href: '/nomina#parametros', error: true}]);
 }
});

test('los circuitos se leen como mucho cada tres minutos, y enseguida cuando una pantalla avisa que registró algo', async () => {
 const [source] = visibleApprovalSources(allCaps).filter(s => s.key === 'salary-master'); let clock = 1000, heavy = 0, light = 0;
 const reading = pendingBellReading(async url => { if (url.includes('native-salary')) { heavy++; return master(1); } light++; return {ok: true, data: pending()}; }, PENDING_BELL_READERS, [source], {now: () => clock});
 let r = await reading.read(); assert.equal(heavy, 1); assert.equal(light, 1); assert.equal(r.circuits[0].reviewable, 1); assert.equal(r.sources.length, 1);
 clock += 60000; r = await reading.read(); assert.equal(heavy, 1, 'al minuto sólo se repite la consulta liviana'); assert.equal(light, 2); assert.equal(r.circuits.length, 1);
 clock += 120000; await reading.read(); assert.equal(heavy, 2, 'a los tres minutos se leen de nuevo');
 reading.invalidate(); await reading.read(); assert.equal(heavy, 3, 'un aviso de la pantalla los vuelve a leer enseguida');
 const state = bellState(r.sources, [], r.circuits); assert.equal(state.waiting, 2);
});

test('una cuenta sin circuitos de la bandeja sigue recibiendo la consulta liviana sola', async () => {
 const reading = pendingBellReading(async () => ({ok: true, data: pending()}), PENDING_BELL_READERS, []);
 const r = await reading.read(); assert.deepEqual(r.circuits, []); assert.equal(bellState(r.sources, [], r.circuits).waiting, 1);
});

test('a circuit the database was too busy to answer is read again before it counts as unanswered', async () => {
 const {patientRead, busyRead} = await import('../assets/approvals-inbox-model.js');
 assert.ok(busyRead(409, 'OWN_NOVELTY_BUSY') && busyRead(503, 'BANK_ACCOUNTS_UNAVAILABLE') && busyRead(503, 'ACCOUNTING_BUSY'));
 assert.ok(!busyRead(409, 'OWN_NOVELTY_VERSION_CHANGED') && !busyRead(503, 'EMPLOYMENT_ADOPTION_NOT_READY') && !busyRead(401, 'X_BUSY') && !busyRead(200, undefined));
 const busy = () => Object.assign(new Error('PENDING_READ_FAILED'), {status: 409, code: 'OWN_NOVELTY_BUSY'}), waits = [];
 let calls = 0;
 assert.equal(await patientRead(async () => { if (++calls < 3) throw busy(); return 'ok'; }, {wait: async n => { waits.push(n); }}), 'ok');
 assert.equal(calls, 3); assert.deepEqual(waits, [1, 2]);
 // Tres intentos y no más; lo que no es «ocupada» no se repite; una lectura retirada tampoco.
 calls = 0; await assert.rejects(patientRead(async () => { calls++; throw busy(); }, {wait: async () => {}}), e => e.code === 'OWN_NOVELTY_BUSY'); assert.equal(calls, 3);
 calls = 0; await assert.rejects(patientRead(async () => { calls++; throw Object.assign(new Error('x'), {status: 503, code: 'EMPLOYMENT_ADOPTION_NOT_READY'}); }, {wait: async () => {}})); assert.equal(calls, 1);
 calls = 0; await assert.rejects(patientRead(async () => { calls++; throw Object.assign(new Error('x'), {name: 'AbortError', status: 409, code: 'A_BUSY'}); }, {wait: async () => {}})); assert.equal(calls, 1);
 const mount = fs.readFileSync('assets/pending-bell-mount.js', 'utf8'), inbox = fs.readFileSync('assets/approvals-inbox.js', 'utf8');
 assert.ok(mount.includes('await patientRead(() => getJson(s.url({period})))') && mount.includes('await patientRead(() => getJson(r.url))'), 'la campanita reintenta sus dos clases de lectura');
 assert.ok(mount.includes("{status: response.status, code: body?.code}"), 'el rechazo conserva su código para saber si era «ocupada»');
 assert.ok(inbox.includes('s.pick(await patientRead(() => getJson(s.url({ period }), signal)))'), 'la bandeja reintenta igual que la campanita');
});
