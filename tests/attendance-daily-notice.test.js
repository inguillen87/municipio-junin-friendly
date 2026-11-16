import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ATTENDANCE_DAILY_NOTICE_SOURCE_VERSION, ATTENDANCE_DAILY_BLOCKER_CODES, ATTENDANCE_DAILY_BLOCKER_LABELS, attendanceDailyNotice, attendanceDailyCountText} from '../assets/attendance-daily-notice.js';
import {bellState, bellSeen, rememberedKeys} from '../assets/pending-bell-model.js';
import {mountPendingBell} from '../assets/pending-bell.js';

// Only generated aggregate counts; no municipal records or account identities.
const daily = (overrides = {}) => ({version: ATTENDANCE_DAILY_NOTICE_SOURCE_VERSION, key: 'a'.repeat(64), scopeKey: 'c'.repeat(64), day: '2026-11-16', dayClosed: false, status: 'blocked',
  counts: {population: null, observedContracts: 5, expectedContracts: null, lateArrivals: null, missingMarks: null, missingMarksToReview: null, justifiedMissingMarks: null, incompleteWorkdays: 2, extraTimeObservedContracts: 1, blockedContracts: 5},
  blockerCodes: ['COVERAGE_UNCONFIRMED', 'POPULATION_INCOMPLETE'], coverageCertified: false, approvalStatus: 'not_approved', payrollEligible: false, ...overrides});
const observed = (overrides = {}) => daily({status: 'observed', dayClosed: true, blockerCodes: [],
  counts: {population: 5, observedContracts: 5, expectedContracts: 5, lateArrivals: 0, missingMarks: 0, missingMarksToReview: 0, justifiedMissingMarks: 0, incompleteWorkdays: 0, extraTimeObservedContracts: 0, blockedContracts: 0}, ...overrides});
const conversionPending = (overrides = {}) => observed({status: 'blocked', blockerCodes: ['TARDINESS_CONVERSION_UNCONFIRMED', 'EXTRA_CONVERSION_UNCONFIRMED'],
  counts: {...observed().counts, lateArrivals: 2, extraTimeObservedContracts: 1, blockedContracts: 2}, ...overrides});

test('daily adapter preserves unknowns and safe observation flags without changing its input', () => {
  const input = daily(), original = structuredClone(input), result = attendanceDailyNotice(input);
  assert.deepEqual(input, original);
  assert.equal(result.kind, 'attendance_daily'); assert.equal(result.href, '/relojes'); assert.equal(result.title, 'Asistencia diaria');
  assert.equal(result.key, 'attendance-daily:' + input.key);
  assert.deepEqual(result.counts, input.counts); assert.notEqual(result.counts, input.counts);
  assert.deepEqual([result.coverageCertified, result.approvalStatus, result.payrollEligible], [false, 'not_approved', false]);
  assert.equal(attendanceDailyCountText(result.counts.lateArrivals), 'A confirmar');
  assert.equal(attendanceDailyCountText(0), '0');
  result.counts.observedContracts = 99; result.blockerCodes.pop(); assert.deepEqual(input, original);
});

test('daily adapter rejects extra fields, nominal data and malformed or promoted authority claims', () => {
  const mutations = [
    v => { v.employeeName = 'PERSONA_SINTETICA_NO_PROYECTAR'; },
    v => { v.counts.legajo = '9999'; }, v => { v.counts = {...v.counts, absenceDays: 1}; },
    v => { v.href = '/acciones'; }, v => { v.canReview = true; },
    v => { delete v.day; }, v => { v.version = 'otra.v1'; },
    v => { v.version = 'attendance-daily-notice-source.v1'; }, v => { delete v.scopeKey; }, v => { delete v.dayClosed; },
    v => { v.scopeKey = 'not-an-opaque-scope'; }, v => { v.dayClosed = 'true'; },
    v => { v.dayClosed = true; v.blockerCodes = ['DAY_NOT_CLOSED']; },
    v => { v.key = 'name@example.invalid'; }, v => { v.key = 'A'.repeat(64); },
    v => { v.day = '2026-02-29'; }, v => { v.day = '2026-04-31'; }, v => { v.day = '2026-11-16T00:00:00Z'; },
    v => { v.status = 'approved'; }, v => { v.coverageCertified = true; },
    v => { v.approvalStatus = 'approved'; }, v => { v.payrollEligible = true; },
    v => { v.blockerCodes = ['ARBITRARY_PRIVATE_TEXT']; }, v => { v.blockerCodes.push(v.blockerCodes[0]); },
    v => { v.blockerCodes = Array(1); }, v => { v.blockerCodes.note = 'PRIVATE'; },
    v => { v.counts.observedContracts = null; }, v => { v.counts.incompleteWorkdays = -1; },
    v => { v.counts.expectedContracts = '5'; }, v => { v.counts.lateArrivals = 0.5; },
    v => { v.counts.missingMarks = Number.MAX_SAFE_INTEGER + 1; }, v => { v.counts.population = NaN; },
    v => { Object.defineProperty(v.counts, 'population', {value: 'PRIVATE', enumerable: false}); },
  ];
  for (const change of mutations) { const input = daily(); change(input); assert.throws(() => attendanceDailyNotice(input), /^TypeError: ATTENDANCE_DAILY_NOTICE_INVALID$/); }
  for (const input of [null, [], false, 'PERSONA_SINTETICA_NO_PROYECTAR']) assert.throws(() => attendanceDailyNotice(input), /ATTENDANCE_DAILY_NOTICE_INVALID/);
  assert.equal(attendanceDailyNotice(daily({day: '2024-02-29'})).day, '2024-02-29');
});

test('daily blocker messages come only from the fixed vocabulary in canonical order', () => {
  const input = daily({blockerCodes: [...ATTENDANCE_DAILY_BLOCKER_CODES].reverse()}), result = attendanceDailyNotice(input);
  assert.deepEqual(result.blockerCodes, ATTENDANCE_DAILY_BLOCKER_CODES);
  assert.ok(Object.isFrozen(ATTENDANCE_DAILY_BLOCKER_CODES));
  for (const code of result.blockerCodes) assert.equal(typeof ATTENDANCE_DAILY_BLOCKER_LABELS[code], 'string');
});

test('daily opaque SHA keys require the entire string and every count rejects negative zero', () => {
  for (const ending of ['\n', '\r', '\r\n', '\u2028', '\u2029', ' ']) for (const key of ['key', 'scopeKey']) assert.throws(() => attendanceDailyNotice(daily({[key]: 'a'.repeat(64) + ending})), /ATTENDANCE_DAILY_NOTICE_INVALID/);
  for (const key of Object.keys(daily().counts)) {
    const input = daily(); input.counts[key] = -0;
    assert.throws(() => attendanceDailyNotice(input), /ATTENDANCE_DAILY_NOTICE_INVALID/, key);
  }
});

test('observed status cannot conceal unresolved counts, blocked contracts or blockers', () => {
  assert.equal(attendanceDailyNotice(observed()).status, 'observed');
  for (const key of ['population', 'expectedContracts', 'lateArrivals', 'missingMarks', 'missingMarksToReview', 'justifiedMissingMarks']) {
    const input = observed(); input.counts[key] = null;
    assert.throws(() => attendanceDailyNotice(input), /ATTENDANCE_DAILY_NOTICE_INVALID/, key);
    const state = bellState([], [], [], [input]);
    assert.deepEqual(state.daily, []); assert.deepEqual(state.failed, ['Asistencia diaria']); assert.equal(state.complete, false);
  }
  const blockedCount = observed(); blockedCount.counts.blockedContracts = 1;
  for (const input of [blockedCount, observed({dayClosed: false}), observed({blockerCodes: ['COVERAGE_UNCONFIRMED']}), daily({blockerCodes: []})]) assert.throws(() => attendanceDailyNotice(input), /ATTENDANCE_DAILY_NOTICE_INVALID/);
  const empty = observed(); for (const key of Object.keys(empty.counts)) empty.counts[key] = 0;
  assert.deepEqual(attendanceDailyNotice(empty).counts, empty.counts, 'explicit complete zero counts remain valid');
});

test('aggregate notice counts stay within their declared populations and observations', () => {
  const mutations = [
    v => { v.counts.population = 4; },
    v => { v.counts.expectedContracts = 6; },
    v => { v.counts.blockedContracts = 6; },
    v => { v.counts.extraTimeObservedContracts = 6; },
    v => { v.counts.lateArrivals = 6; },
    v => { v.counts.expectedContracts = 3; v.counts.lateArrivals = 4; },
    v => { v.counts.missingMarks = 6; },
  ];
  for (const change of mutations) {
    const input = daily({counts: {...observed().counts}}); change(input);
    assert.throws(() => attendanceDailyNotice(input), /ATTENDANCE_DAILY_NOTICE_INVALID/);
  }
  const boundaries = daily({counts: {...observed().counts, lateArrivals: 5, incompleteWorkdays: 7, extraTimeObservedContracts: 5, blockedContracts: 5}});
  assert.deepEqual(attendanceDailyNotice(boundaries).counts, boundaries.counts, 'upper limits are inclusive; workdays may exceed contract count');
  const noEvents = daily({counts: {...observed().counts, observedContracts: 0, missingMarks: 5, missingMarksToReview: 5, blockedContracts: 5}});
  assert.equal(attendanceDailyNotice(noEvents).counts.missingMarks, 5, 'missing marks are bounded by expected contracts, not observed ones');
});

test('reviewable missing marks and approved justifications partition the technical total', () => {
  const input = daily({counts: {...observed().counts, observedContracts: 0, missingMarks: 5, missingMarksToReview: 2, justifiedMissingMarks: 3, blockedContracts: 5}});
  assert.equal(attendanceDailyNotice(input).counts.missingMarksToReview, 2);
  for (const change of [v => { v.counts.missingMarks = 4; }, v => { v.counts.justifiedMissingMarks = 2; }, v => { v.counts.missingMarksToReview = 6; }]) {
    const invalid = structuredClone(input); change(invalid); assert.throws(() => attendanceDailyNotice(invalid), /ATTENDANCE_DAILY_NOTICE_INVALID/);
  }
  input.counts.missingMarksToReview = null;
  assert.equal(attendanceDailyNotice(input).counts.missingMarksToReview, null, 'a blocked unknown partition is not filled by subtraction');
});

test('only conversion blockers change display status while preserving core blocking and non-payroll flags', () => {
  const input = conversionPending(), result = attendanceDailyNotice(input);
  assert.equal(result.status, 'blocked'); assert.equal(result.observationStatus, 'observed'); assert.equal(result.conversionPending, true);
  assert.deepEqual(result.blockerCodes, input.blockerCodes);
  assert.deepEqual([result.coverageCertified, result.approvalStatus, result.payrollEligible], [false, 'not_approved', false]);
  for (const code of input.blockerCodes) assert.equal(attendanceDailyNotice(conversionPending({blockerCodes: [code]})).observationStatus, 'observed');
  assert.equal(attendanceDailyNotice(conversionPending({blockerCodes: [...input.blockerCodes, 'COVERAGE_UNCONFIRMED']})).observationStatus, 'review_required');
  assert.equal(attendanceDailyNotice(daily()).observationStatus, 'review_required');
  assert.equal(attendanceDailyNotice(observed()).conversionPending, false);
  assert.throws(() => attendanceDailyNotice(conversionPending({dayClosed: false})), /ATTENDANCE_DAILY_NOTICE_INVALID/);
  const unknown = conversionPending(); unknown.counts.missingMarksToReview = null;
  assert.throws(() => attendanceDailyNotice(unknown), /ATTENDANCE_DAILY_NOTICE_INVALID/);
});

test('blocked and observed daily notices count as notices without inventing approvals', () => {
  const state = bellState([], [], [], [daily(), observed({key: 'b'.repeat(64), scopeKey: 'd'.repeat(64), day: '2026-11-15'})]);
  assert.deepEqual([state.waiting, state.news, state.notices, state.count, state.total, state.badge], [0, 0, 2, 2, 2, '2']);
  assert.equal(state.label, '2 avisos de asistencia'); assert.equal(state.complete, true);
  assert.deepEqual([state.toReview, state.decided, state.circuits], [[], [], []]);
  assert.deepEqual(state.daily.map(v => [v.day, v.status]), [['2026-11-16', 'blocked'], ['2026-11-15', 'observed']]);
  assert.equal(state.daily[0].counts.expectedContracts, null);
  assert.deepEqual(state.shownKeys, []); assert.deepEqual(rememberedKeys(state), []);
  assert.deepEqual(bellSeen(state), state, 'opening the panel does not turn an observation into a decision');
});

test('opaque daily keys deduplicate identical cuts and refuse conflicting or malformed duplicates', () => {
  const input = daily(), reordered = daily({blockerCodes: [...input.blockerCodes].reverse()});
  const same = bellState([], [], [], [input, structuredClone(input), reordered]);
  assert.equal(same.count, 1); assert.equal(same.daily.length, 1); assert.deepEqual(same.failed, []);
  const conflicting = daily(); conflicting.counts.observedContracts++;
  const malformed = {...daily(), employeeName: 'DO_NOT_ECHO'};
  for (const bad of [conflicting, malformed]) for (const pair of [[input, bad], [bad, input]]) {
    const state = bellState([], [], [], [...pair, daily({key: 'b'.repeat(64), scopeKey: 'd'.repeat(64)})]);
    assert.equal(state.count, 1); assert.equal(state.daily[0].key, 'attendance-daily:' + 'b'.repeat(64));
    assert.deepEqual(state.failed, ['Asistencia diaria']); assert.equal(state.complete, false);
    assert.ok(!JSON.stringify(state).includes('DO_NOT_ECHO'));
  }
});

test('daily bell selects the latest closed day separately for each opaque scope', () => {
  const input = [daily({key: '1'.repeat(64)}), observed({key: '2'.repeat(64), day: '2026-11-15'}),
    observed({key: '3'.repeat(64), day: '2026-11-14'}),
    observed({key: '4'.repeat(64), scopeKey: 'd'.repeat(64), day: '2026-11-18'}),
    observed({key: '5'.repeat(64), scopeKey: 'd'.repeat(64), day: '2026-11-17'})];
  for (const sources of [input, [...input].reverse()]) {
    const state = bellState([], [], [], sources);
    assert.deepEqual(state.daily.map(v => [v.scopeKey, v.day]), [['d'.repeat(64), '2026-11-18'], ['c'.repeat(64), '2026-11-15']]);
    assert.equal(state.count, 2); assert.equal(state.waiting, 0); assert.deepEqual(state.failed, []);
  }
});

test('a scope without a closed day retains only its latest blocked observation', () => {
  const state = bellState([], [], [], [daily({key: '1'.repeat(64), day: '2026-11-14'}), daily({key: '2'.repeat(64), day: '2026-11-15'})]);
  assert.equal(state.daily.length, 1); assert.equal(state.daily[0].day, '2026-11-15');
  assert.equal(state.daily[0].status, 'blocked'); assert.equal(state.daily[0].counts.missingMarksToReview, null);
});

test('different cuts for one scope and day suppress the entire scope instead of displaying an older day', () => {
  const input = [observed({key: '1'.repeat(64)}), observed({key: '2'.repeat(64)}),
    observed({key: '3'.repeat(64), day: '2026-11-15'}),
    observed({key: '4'.repeat(64), scopeKey: 'd'.repeat(64), day: '2026-11-14'})];
  for (const sources of [input, [...input].reverse()]) {
    const state = bellState([], [], [], sources);
    assert.deepEqual(state.daily.map(v => v.scopeKey), ['d'.repeat(64)]);
    assert.deepEqual(state.failed, ['Asistencia diaria']); assert.equal(state.complete, false);
  }
  const invalidLatest = {...daily({key: '5'.repeat(64)}), privateText: 'NOT_FOR_DISPLAY'};
  const stale = bellState([], [], [], [invalidLatest, observed({key: '6'.repeat(64), day: '2026-11-15'})]);
  assert.deepEqual(stale.daily, []); assert.deepEqual(stale.failed, ['Asistencia diaria']);
  assert.ok(!JSON.stringify(stale).includes('NOT_FOR_DISPLAY'));
});

test('invalid daily sources are unavailable rather than a complete empty result', () => {
  for (const source of [null, {}, daily({blockerCodes: ['PRIVATE_TEXT']})]) {
    const state = bellState([], [], [], [source]);
    assert.deepEqual(state.daily, []); assert.deepEqual(state.covered, []); assert.deepEqual(state.failed, ['Asistencia diaria']);
    assert.equal(state.complete, false); assert.ok(!JSON.stringify(state).includes('PRIVATE_TEXT'));
  }
  assert.throws(() => bellState([], [], [], null), /PENDING_BELL_INVALID/);
});

test('daily notices coexist with approvals and remain outside remembered decision identifiers', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const source = {key: 'qa', title: 'Prueba sintética', href: '/nomina', pending: {complete: true, toReview: [],
    decided: [{eventId: id, proposalId: id, period: '2026-10', status: 'approved', actorLabel: 'Revisión sintética', recordedAt: '2026-11-16T12:00:00Z'}], counts: {toReview: 0, decided: 1}}};
  const state = bellState([source], [], [{key: 'qa2', title: 'Otro circuito', href: '/nomina', count: 50, reviewable: 50}], [daily()]);
  assert.deepEqual([state.waiting, state.notices, state.news, state.count, state.total], [50, 2, 1, 3, 52]);
  assert.equal(state.label, '3 avisos · 50 pendientes te esperan y 1 novedad de lo tuyo y 1 aviso de asistencia');
  assert.deepEqual(rememberedKeys(state, [state.daily[0].key]), ['qa:' + id]);
  const opened = bellSeen(state);
  assert.deepEqual([opened.waiting, opened.news, opened.count, opened.total], [50, 0, 2, 51]);
  assert.equal(opened.daily.length, 1); assert.equal(opened.label, '2 avisos · 50 pendientes te esperan y 1 aviso de asistencia');
  assert.deepEqual(bellState([source], [], []), bellState([source], [], [], []), 'old callers need no extra argument');
});

// Small DOM fixture to verify rendered behavior without a browser, network or dependencies.
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.events = new Map(); this.hidden = false; this.textContent = ''; this.classList = {toggle() {}}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, callback) { this.events.set(key, callback); }
  focus() {}
  contains(value) { return this === value || this.children.some(c => c.contains?.(value)); }
}
const all = node => [node, ...node.children.flatMap(all)];
const contents = node => all(node).map(n => n.textContent).join('\n');

test('optional daily UI renders blocked observations and unknowns without approval controls or persistence', async t => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const doc = {hidden: false, head: new Element('head'), createElement: tag => new Element(tag), querySelector: () => null, addEventListener() {}};
  Object.defineProperty(globalThis, 'document', {value: doc, configurable: true});
  t.after(() => { if (saved) Object.defineProperty(globalThis, 'document', saved); else delete globalThis.document; });
  const host = new Element('div'), writes = [];
  let payload = {sources: [], circuits: [], dailySources: [daily()]};
  const ui = mountPendingBell({host, accountKey: 'synthetic-account', read: async () => payload, storage: {getItem: () => '[]', setItem: (...v) => writes.push(v)}});
  t.after(() => ui.stop()); await new Promise(resolve => setImmediate(resolve));
  const button = all(host).find(n => n.tagName === 'button'); button.events.get('click')();
  const text = contents(host);
  for (const expected of ['Asistencia diaria', '16/11/2026 · Requiere revisión', 'Llegadas tarde: A confirmar · Sin marcas para revisar: A confirmar · 1 con extra', 'Ver jornadas']) assert.ok(text.includes(expected), expected);
  for (const removed of ['Población:', 'Marcaciones faltantes:', 'Jornadas incompletas:', 'Contratos bloqueados:']) assert.ok(!text.includes(removed), removed);
  assert.ok(!text.includes('Esperan tu decisión')); assert.ok(!text.includes('No hay nada esperándote'));
  assert.ok(!text.includes('Aprobado')); assert.deepEqual(writes, []);
  assert.equal(all(host).find(n => n.tagName === 'a').href, '/relojes');
  assert.equal(button.attributes['aria-label'], 'Pendientes: 1 aviso de asistencia');
  const justified = observed({counts: {...observed().counts, observedContracts: 0, missingMarks: 5, missingMarksToReview: 0, justifiedMissingMarks: 5}});
  payload = {sources: [], circuits: [], dailySources: [justified]}; await ui.load();
  assert.ok(contents(host).includes('0 llegadas tarde · 0 sin marcas para revisar · 0 con extra'));
  assert.ok(contents(host).includes('Con justificación aprobada: 5'));
  assert.ok(!contents(host).includes('5 sin marcas para revisar'));
  payload = {sources: [], circuits: [], dailySources: [conversionPending()]}; await ui.load();
  assert.ok(contents(host).includes('Observado · conversión para liquidación: A confirmar'));
  assert.ok(contents(host).includes('2 llegadas tarde · 0 sin marcas para revisar · 1 con extra'));
  assert.ok(!contents(host).includes('Requiere revisión')); assert.deepEqual(writes, []);
  payload = {sources: [], circuits: [], dailySources: [{...daily(), employeeName: 'SECRET_SYNTHETIC'}]};
  await ui.load();
  assert.ok(contents(host).includes('No se pudo consultar ningún circuito.')); assert.ok(!contents(host).includes('SECRET_SYNTHETIC'));
});

test('daily asset is published while readers and endpoints remain unchanged', () => {
  const build = fs.readFileSync('scripts/build-friendly.mjs', 'utf8');
  assert.equal(build.split("'assets/attendance-daily-notice.js'").length - 1, 1);
  const mount = fs.readFileSync('assets/pending-bell-mount.js', 'utf8');
  assert.ok(!mount.includes('attendance-daily')); assert.ok(!mount.includes('dailySources'));
  const dailyCode = fs.readFileSync('assets/attendance-daily-notice.js', 'utf8');
  assert.ok(!/fetch\(|\/api\/|localStorage|sessionStorage/.test(dailyCode));
});
