// T4 · B: minimal authenticated bell reading of daily attendance notices. Synthetic data only;
// no database is opened and the producer (T4 · A) is a stub.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {attendanceDailyNoticeRead, attendanceDailyNoticeDays, attendanceDailyNoticeScopes, ATTENDANCE_DAILY_NOTICE_MAX_SCOPES} from '../lib/internal-attendance-daily-notice.js';
import {createAttendanceDailyNoticeHandler} from '../api/internal-attendance-daily-notice.js';
import {dailyFixture, V3_DAY, V3_CONTRACT} from './fixtures/attendance-daily-incidents-synthetic.js';
import {V3_PRINCIPAL, V3_SESSION} from './fixtures/continuous-workdays-v3-api-synthetic.js';
import {pendingBellDailySources, pendingBellReading, PENDING_BELL_DAILY} from '../assets/pending-bell-mount.js';
import {bellState} from '../assets/pending-bell-model.js';

const principal = {...V3_PRINCIPAL, tenant: {...V3_PRINCIPAL.tenant, effectiveCapabilities: ['attendance.area.read']}};
const session = V3_SESSION;
const scope = {area: {organizationUnitSourceId: '900', sectorSourceId: '901'}, site: 'qa-site'};
// 2026-11-15 03:30 UTC is 00:30 of the 15th in Mendoza: yesterday is the fixture day.
const NOW = Date.parse('2026-11-15T03:30:00Z');
const scopes = async () => [structuredClone(scope)];
const producer = async (_sql, _p, _s, q) => {
  if (q.day !== V3_DAY) throw new Error('no cut for this synthetic day');
  return dailyFixture();
};
const sql = {query() { throw new Error('the reader must not query by itself'); }};
const read = options => attendanceDailyNoticeRead({sql, principal, session, now: NOW, dayCount: 1, producer, scopes, ...options});

test('days are civil days already closed in Mendoza, never the host zone', () => {
  assert.deepEqual(attendanceDailyNoticeDays(Date.parse('2026-11-15T02:59:59Z')), ['2026-11-13', '2026-11-12']);
  assert.deepEqual(attendanceDailyNoticeDays(Date.parse('2026-11-15T03:00:00Z')), ['2026-11-14', '2026-11-13']);
  assert.throws(() => attendanceDailyNoticeDays(NaN), e => e.code === 'ATTENDANCE_DAILY_NOTICE_CLOCK_INVALID');
});

test('without the joint-cut producer the reading is not ready: nothing read, no notice, no zero, no failure', async () => {
  const data = await attendanceDailyNoticeRead({sql, principal, session, now: NOW});
  assert.deepEqual(data, {version: 'attendance-daily-notice-read.v1', ready: false, days: ['2026-11-14', '2026-11-13'], scopeCount: 0, notices: [], failedScopes: 0});
  assert.deepEqual(pendingBellDailySources(data), []);
});

test('a produced cut leaves only as the minimized notice: counts, status and blocker codes', async () => {
  const data = await read();
  assert.equal(data.ready, true); assert.equal(data.scopeCount, 1); assert.equal(data.failedScopes, 0);
  assert.equal(data.notices.length, 1);
  const [notice] = data.notices;
  assert.equal(notice.version, 'attendance-daily-notice-source.v2'); assert.equal(notice.day, V3_DAY);
  assert.equal(notice.coverageCertified, false); assert.equal(notice.payrollEligible, false); assert.equal(notice.approvalStatus, 'not_approved');
  const text = JSON.stringify(data);
  for (const secret of [V3_CONTRACT, '9001', 'Agente sintético', 'qa-site', '"900"', 'legajo', 'name']) assert.ok(!text.includes(secret), secret);
  const state = bellState([], [], [], pendingBellDailySources(data));
  assert.equal(state.daily.length, 1); assert.deepEqual(state.failed, []);
});

test('a cut for another site, day or tenant is a producer defect and is never shown', async () => {
  for (const change of [s => { s.scope.site = 'other-site'; }, s => { s.scope.tenantId = '77777777-7777-4777-8777-777777777777'; }]) {
    const data = await read({producer: async () => { const s = dailyFixture(); change(s); return s; }});
    assert.equal(data.notices.length, 0); assert.equal(data.failedScopes, 1);
  }
  const otherSite = await read({scopes: async () => [{...structuredClone(scope), site: 'other-site'}]});
  assert.equal(otherSite.notices.length, 0); assert.equal(otherSite.failedScopes, 1);
});

test('a scope with any failed day is dropped entirely, and the bell names the failure instead of counting zero', async () => {
  const data = await read({dayCount: 2});
  assert.equal(data.notices.length, 0, 'the older day does not stand in for the failed newer one');
  assert.equal(data.failedScopes, 1);
  const sources = pendingBellDailySources(data);
  assert.deepEqual(sources, [null]);
  assert.ok(bellState([], [], [], sources).failed.includes('Asistencia diaria'));
});

test('scopes are exact, unique and bounded; more than the limit is refused, never cut', async () => {
  assert.throws(() => attendanceDailyNoticeScopes([scope, structuredClone(scope)]), e => e.code === 'ATTENDANCE_DAILY_NOTICE_SCOPES_INVALID');
  assert.throws(() => attendanceDailyNoticeScopes([{...scope, extra: 1}]), e => e.code === 'ATTENDANCE_DAILY_NOTICE_SCOPES_INVALID');
  assert.throws(() => attendanceDailyNoticeScopes([{...scope, site: 'x'.repeat(97)}]), e => e.code === 'ATTENDANCE_DAILY_NOTICE_SCOPES_INVALID');
  assert.throws(() => attendanceDailyNoticeScopes([{...scope, site: 7}]), e => e.code === 'ATTENDANCE_DAILY_NOTICE_SCOPES_INVALID');
  // A real site key the daily cut cannot carry is unsupported: counted, never silently dropped.
  assert.deepEqual(attendanceDailyNoticeScopes([{...scope, site: 'sede.con.punto'}, structuredClone(scope)]), {scopes: [structuredClone(scope)], unsupported: 1});
  const partial = await read({scopes: async () => [{...structuredClone(scope), site: 'sede.con.punto'}, structuredClone(scope)]});
  assert.equal(partial.scopeCount, 2); assert.equal(partial.failedScopes, 1); assert.equal(partial.notices.length, 1);
  assert.ok(bellState([], [], [], pendingBellDailySources(partial)).failed.includes('Asistencia diaria'));
  const many = Array.from({length: ATTENDANCE_DAILY_NOTICE_MAX_SCOPES + 1}, (_, i) => ({area: {organizationUnitSourceId: String(100 + i), sectorSourceId: null}, site: 'qa-site'}));
  await assert.rejects(read({scopes: async () => many}), e => e.code === 'ATTENDANCE_DAILY_NOTICE_LIMIT' && e.status === 413);
  await assert.rejects(read({scopes: async () => { throw new Error('boom'); }}), e => e.code === 'ATTENDANCE_DAILY_NOTICE_SCOPES_INVALID' && e.status === 503);
});

test('the reading still requires area read capability and the certified session', async () => {
  const without = {...principal, tenant: {...principal.tenant, effectiveCapabilities: []}};
  await assert.rejects(read({principal: without}), e => e.status === 403);
  await assert.rejects(read({session: {...session, releaseSha: 'b'.repeat(40)}}), e => e.status === 401);
});

const response = () => ({headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(v) { this.payload = v; return this; }});
const request = (url = '/api/internal-attendance-daily-notice?resource=notices', method = 'GET') => ({method, url, query: Object.fromEntries(new URL(url, 'http://x.invalid').searchParams), headers: {}});
function handler(options = {}) {
  const stats = {connections: 0};
  const h = createAttendanceDailyNoticeHandler({env: options.env ?? (options.ready ? {ATTENDANCE_DAILY_NOTICE_ENABLED: 'true'} : {}), now: () => NOW, sessionFor: () => session, dayCount: 1,
    requireAccess: async (_req, res, gates) => { stats.gates = gates; if (options.denied) { res.status(options.denied).json({ok: false}); return null; } return {mode: 'managed', principal}; },
    getSql: async () => { stats.connections++; return sql; }, ...(options.ready ? {producer, scopes} : {})});
  return {h, stats};
}

test('the endpoint is GET-only, takes exactly resource=notices and uses the area facade gates', async () => {
  for (const [url, method, status] of [['/api/internal-attendance-daily-notice', 'GET', 400], ['/api/internal-attendance-daily-notice?resource=notices&area=1', 'GET', 400],
    ['/api/internal-attendance-daily-notice?resource=notices&resource=notices', 'GET', 400], ['/api/internal-attendance-daily-notice?resource=notices', 'POST', 405]]) {
    const {h} = handler({ready: true}), res = response(); await h(request(url, method), res);
    assert.equal(res.statusCode, status, url + ' ' + method); assert.equal(res.payload.ok, false);
  }
  const {h, stats} = handler({ready: true}), res = response(); await h(request(), res);
  assert.equal(res.statusCode, 200); assert.equal(res.payload.data.notices.length, 1); assert.equal(stats.connections, 1);
  assert.deepEqual(stats.gates.requiredCapabilities, ['attendance.area.read']); assert.equal(stats.gates.capabilityMode, 'all');
  assert.equal(stats.gates.allowLegacy, false); assert.equal(stats.gates.requireDataPlaneReady, true); assert.equal(stats.gates.requireCertifiedDataBinding, true);
  assert.match(res.headers['Cache-Control'] ?? res.headers['cache-control'] ?? '', /no-store/);
});

test('until the producer is installed the endpoint answers not ready without opening the database', async () => {
  const {h, stats} = handler(), res = response(); await h(request(), res);
  assert.equal(res.statusCode, 200); assert.equal(res.payload.data.ready, false); assert.equal(stats.connections, 0);
});

test('the bell reads daily notices only when asked, at most every five minutes, and a refusal is no answer', async () => {
  let clock = 0, calls = 0, mode = 'ok';
  const notices = (await read()).notices;
  const getJson = async url => {
    if (url === PENDING_BELL_DAILY.url) { calls++; if (mode === 'refused') throw new Error('PENDING_READ_FAILED');
      return {ok: true, data: {version: 'attendance-daily-notice-read.v1', ready: true, days: [V3_DAY], scopeCount: 1, notices, failedScopes: 0}}; }
    throw new Error('unexpected ' + url);
  };
  const off = await pendingBellReading(getJson, [], []).read();
  assert.deepEqual(off.dailySources, []); assert.equal(calls, 0);
  const reading = pendingBellReading(getJson, [], [], {now: () => clock, daily: true});
  let r = await reading.read(); assert.equal(calls, 1); assert.equal(r.dailySources.length, 1);
  clock += 60000; r = await reading.read(); assert.equal(calls, 1, 'within five minutes the previous reading is reused');
  clock += 240000; mode = 'refused'; r = await reading.read(); assert.ok(calls >= 2);
  assert.deepEqual(r.dailySources, [null]); assert.ok(bellState([], [], [], r.dailySources).failed.includes('Asistencia diaria'));
});

test('a malformed reading is no answer; a not-ready reading with content is malformed', () => {
  const base = {version: 'attendance-daily-notice-read.v1', ready: true, days: [V3_DAY], scopeCount: 1, notices: [], failedScopes: 0};
  for (const bad of [null, [], {...base, extra: 1}, {...base, version: 'v0'}, {...base, failedScopes: 2}, {...base, scopeCount: -1}, {...base, ready: false, scopeCount: 1}])
    assert.deepEqual(pendingBellDailySources(bad), [null], JSON.stringify(bad));
  assert.deepEqual(pendingBellDailySources(base), []);
});

test('the T4 · A producer feeds the bell end to end; its partial cut is shown as blocked, never as observed', async () => {
  const {produceAttendanceDailySource} = await import('../lib/internal-attendance-daily-source.js');
  const area = await import('./fixtures/attendance-area-synthetic.js');
  const calls = [];
  const areaSql = {async query(text, values) { calls.push({text, q: JSON.parse(values[1])}); return [{result: JSON.stringify({area: area.areaSource(), catalog: {complete: false, assignments: []}})}]; }};
  // 2026-11-15 03:30 UTC: yesterday in Mendoza is the synthetic area day.
  const data = await attendanceDailyNoticeRead({sql: areaSql, principal: area.principal, session: area.session, now: NOW, dayCount: 1,
    producer: produceAttendanceDailySource, scopes: async () => [{area: structuredClone(area.area), site: 'qa-site'}]});
  assert.equal(calls.length, 1); assert.match(calls[0].text, /attendance_daily_source_read_v1/);
  assert.deepEqual(calls[0].q, {resource: 'day', area: area.area, day: area.AREA_DAY, site: 'qa-site', snapshot: null});
  assert.equal(data.failedScopes, 0); assert.equal(data.notices.length, 1);
  const [notice] = data.notices;
  assert.equal(notice.status, 'blocked'); assert.equal(notice.dayClosed, false);
  for (const code of ['JOINT_CUT_UNCONFIRMED', 'COVERAGE_UNCONFIRMED', 'JUSTIFICATIONS_UNCONFIRMED', 'ASSIGNMENT_MISSING']) assert.ok(notice.blockerCodes.includes(code), code);
  const state = bellState([], [], [], pendingBellDailySources(data));
  assert.equal(state.daily.length, 1); assert.equal(state.daily[0].observationStatus, 'review_required');
  assert.ok(!JSON.stringify(data).includes('Persona sintética'));
});

test('the endpoint is registered with a bounded duration and the bell mounts it only for area readers', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(config.functions['api/internal-attendance-daily-notice.js'], {maxDuration: 20});
  const mount = fs.readFileSync('assets/pending-bell-mount.js', 'utf8');
  assert.ok(mount.includes("capability: 'attendance.area.read'") && mount.includes('{daily}'));
  const lib = fs.readFileSync('lib/internal-attendance-daily-notice.js', 'utf8');
  assert.ok(!/sql\.query|FROM |native_leave|time_source/.test(lib), 'the reader never reads tables itself');
});

test('the scope list comes from one SQL function, bound to this tenant and membership, with the window the reader asks for', async () => {
  const {listAttendanceDailyScopes, ATTENDANCE_DAILY_SCOPES_SQL} = await import('../lib/internal-attendance-daily-scopes.js');
  const area = await import('./fixtures/attendance-area-synthetic.js');
  const answer = (over = {}) => ({version: 'attendance-daily-scopes.v1', tenantId: area.principal.tenant.id, membershipId: area.principal.tenant.membershipId,
    scopes: [{area: structuredClone(area.area), site: 'qa-site'}], ...over});
  const calls = [];
  const fake = body => ({async query(text, values) { calls.push({text, values}); return [{result: JSON.stringify(body)}]; }});
  const scopes = await listAttendanceDailyScopes(fake(answer()), area.principal, area.session, {firstDay: '2026-11-13', lastDay: '2026-11-14'});
  assert.deepEqual(scopes, [{area: area.area, site: 'qa-site'}]);
  assert.equal(calls[0].text, ATTENDANCE_DAILY_SCOPES_SQL);
  assert.deepEqual(Object.keys(JSON.parse(calls[0].values[0])).sort(), ['actorEmail', 'actorSessionId', 'actorSessionVersion', 'membershipId', 'releaseSha', 'tenantId']);
  assert.deepEqual(JSON.parse(calls[0].values[1]), {firstDay: '2026-11-13', lastDay: '2026-11-14'});
  for (const bad of [answer({tenantId: '77777777-7777-4777-8777-777777777777'}), answer({membershipId: '77777777-7777-4777-8777-777777777777'}), answer({version: 'v0'}), answer({extra: 1})])
    await assert.rejects(listAttendanceDailyScopes(fake(bad), area.principal, area.session, {firstDay: '2026-11-13', lastDay: '2026-11-14'}), e => e.code === 'ATTENDANCE_DAILY_SCOPES_UNAVAILABLE');
  await assert.rejects(listAttendanceDailyScopes(fake(answer()), area.principal, area.session, {firstDay: '2026-11-14', lastDay: '2026-11-13'}), e => e.code === 'ATTENDANCE_DAILY_SCOPES_UNAVAILABLE');
});

test('production wiring uses migrations 240 and 241 only after ATTENDANCE_DAILY_NOTICE_ENABLED=true', async () => {
  const area = await import('./fixtures/attendance-area-synthetic.js');
  const texts = [];
  const sqlAll = {async query(text) { texts.push(text); throw new Error('function does not exist'); }};
  for (const [env, expectReady] of [[{}, false], [{ATTENDANCE_DAILY_NOTICE_ENABLED: '1'}, false], [{ATTENDANCE_DAILY_NOTICE_ENABLED: 'true'}, true]]) {
    let connections = 0;
    const h = createAttendanceDailyNoticeHandler({env, now: () => NOW, sessionFor: () => area.session,
      requireAccess: async () => ({mode: 'managed', principal: area.principal}), getSql: async () => { connections++; return sqlAll; }});
    const res = response(); await h(request(), res);
    if (expectReady) { assert.equal(res.statusCode, 503); assert.equal(res.payload.code, 'ATTENDANCE_DAILY_NOTICE_SCOPES_INVALID'); assert.equal(connections, 1);
      assert.match(texts.at(-1), /attendance_daily_scopes_read_v1/); }
    else { assert.equal(res.statusCode, 200); assert.equal(res.payload.data.ready, false); assert.equal(connections, 0); }
  }
});

test('migration 241 rechecks area authority in SQL and returns only area ids and site keys', () => {
  const sql = fs.readFileSync('scripts/migrations/241-attendance-daily-scopes.sql', 'utf8');
  assert.match(sql, /RAISE EXCEPTION 'ATTENDANCE_DAILY_SCOPES_PREREQUISITE'/);
  assert.match(sql, /RAISE EXCEPTION 'ATTENDANCE_DAILY_SCOPES_ALREADY_INSTALLED'/);
  assert.match(sql, /LANGUAGE plpgsql VOLATILE SECURITY DEFINER\s+SET search_path=pg_catalog,public,pg_temp/);
  assert.match(sql, /public\.attendance_area_context_v1\(p_context,'attendance\.area\.read'\)/);
  assert.match(sql, /decision\.decision='approve'/); assert.match(sql, /retired\.id IS NULL OR retired\.effective_from>first_day/);
  assert.match(sql, /prop\.sector_source_id IS NOT DISTINCT FROM scope\.sector/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.attendance_daily_scopes_read_v1\(jsonb,jsonb\) FROM PUBLIC;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.attendance_daily_scopes_read_v1\(jsonb,jsonb\) TO municontrol_actions_runtime_app;/);
  const projected = sql.slice(sql.indexOf("'scopes',COALESCE"), sql.indexOf('INTO result_value'));
  for (const leak of ['contract', 'label', 'person', 'device_ids', 'serial', 'network']) assert.ok(!projected.includes(leak), leak);
});
