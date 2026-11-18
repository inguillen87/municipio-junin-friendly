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

const principal = {...V3_PRINCIPAL, tenant: {...V3_PRINCIPAL.tenant, effectiveCapabilities: ['attendance.area.read', 'time.catalog.read', 'workforce.employee.read']}};
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
  assert.deepEqual(stats.gates.requiredCapabilities, ['attendance.area.read', 'time.catalog.read', 'workforce.employee.read']); assert.equal(stats.gates.capabilityMode, 'all');
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
  const areaSql = {async query(text, values) { calls.push({text, q: JSON.parse(values[1])}); return [{result: JSON.stringify({area: area.areaSource(), catalog: {complete: false, assignments: []},
    transaction: {isolation: 'read committed', readOnly: 'off', snapshot: '730:730:'}})}]; }};
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
  assert.ok(mount.includes("capabilities: Object.freeze(" + JSON.stringify(['attendance.area.read', 'time.catalog.read', 'workforce.employee.read']).replaceAll('"', "'").replaceAll(',', ', ') + ")") && mount.includes('{daily}'));
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
      requireAccess: async () => ({mode: 'managed', principal: {...area.principal, tenant: {...area.principal.tenant, effectiveCapabilities: [...area.principal.tenant.effectiveCapabilities, 'time.catalog.read', 'workforce.employee.read']}}}),
      getSql: async () => { connections++; return sqlAll; }});
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
  assert.match(sql, /decision\.decision='approve'/); assert.match(sql, /retired\.id IS NULL OR retired\.effective_from>GREATEST\(first_day,prop\.valid_from\)/);
  assert.match(sql, /prop\.sector_source_id IS NOT DISTINCT FROM scope\.sector/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.attendance_daily_scopes_read_v1\(jsonb,jsonb\) FROM PUBLIC;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.attendance_daily_scopes_read_v1\(jsonb,jsonb\) TO municontrol_actions_runtime_app;/);
  const projected = sql.slice(sql.indexOf("'scopes',COALESCE"), sql.indexOf('INTO result_value'));
  for (const leak of ['contract', 'label', 'person', 'device_ids', 'serial', 'network']) assert.ok(!projected.includes(leak), leak);
});

test('the producer runs in REPEATABLE READ when the client can, and trusts only the isolation the database reports', async () => {
  const {produceAttendanceDailySource, ATTENDANCE_DAILY_SOURCE_TRANSACTION} = await import('../lib/internal-attendance-daily-source.js');
  const {evaluateAttendanceDailyIncidents} = await import('../lib/attendance-daily-incidents.js');
  const area = await import('./fixtures/attendance-area-synthetic.js');
  const body = transaction => JSON.stringify({area: area.areaSource(), catalog: {complete: false, assignments: []}, transaction});
  const neonLike = (reported, seen) => ({
    async query() { throw new Error('a transaction-capable client must not use a bare query'); },
    async transaction(build, options) {
      seen.options = options;
      const queued = build({query: (text, params) => ({text, params})});
      seen.queued = queued;
      return [[{result: body(reported)}]];
    },
  });
  const seen = {};
  const isolated = await produceAttendanceDailySource(neonLike({isolation: 'repeatable read', readOnly: 'on', snapshot: '730:731:730'}, seen), area.principal, area.session, area.areaQuery());
  assert.deepEqual(seen.options, {isolationLevel: 'RepeatableRead'}, 'not READ ONLY: the session checks take FOR SHARE row locks'); assert.deepEqual(ATTENDANCE_DAILY_SOURCE_TRANSACTION, seen.options);
  assert.equal(seen.queued.length, 1); assert.match(seen.queued[0].text, /attendance_daily_source_read_v1/);
  assert.equal(isolated.cut.consistency, 'single_snapshot'); assert.equal(isolated.cut.evidence.id, isolated.cut.id); assert.match(isolated.cut.evidence.sha256, /^[a-f0-9]{64}$/);
  assert.ok(!evaluateAttendanceDailyIncidents(isolated).blockerCodes.includes('JOINT_CUT_UNCONFIRMED'));
  // Evidence is bound to the reported snapshot: another snapshot gives other evidence.
  const other = await produceAttendanceDailySource(neonLike({isolation: 'repeatable read', readOnly: 'on', snapshot: '730:732:'}, {}), area.principal, area.session, area.areaQuery());
  assert.notEqual(other.cut.evidence.sha256, isolated.cut.evidence.sha256);
  // A database that ignored the requested isolation is never a joint cut.
  for (const reported of [{isolation: 'read committed', readOnly: 'on', snapshot: '730:730:'}, {isolation: 'read committed', readOnly: 'off', snapshot: '730:730:'}]) {
    const cut = await produceAttendanceDailySource(neonLike(reported, {}), area.principal, area.session, area.areaQuery());
    assert.equal(cut.cut.consistency, 'unconfirmed'); assert.equal(cut.cut.evidence, null);
    assert.ok(evaluateAttendanceDailyIncidents(cut).blockerCodes.includes('JOINT_CUT_UNCONFIRMED'));
  }
  // A client without transactions keeps the plain call and stays unconfirmed.
  const plain = {async query() { return [{result: body({isolation: 'read committed', readOnly: 'off', snapshot: '730:730:'})}]; }};
  assert.equal((await produceAttendanceDailySource(plain, area.principal, area.session, area.areaQuery())).cut.consistency, 'unconfirmed');
  // The report itself must be exact.
  for (const bad of [undefined, {isolation: 'repeatable read', readOnly: 'on'}, {isolation: 'snapshot', readOnly: 'on', snapshot: '1:1:'}, {isolation: 'repeatable read', readOnly: 'on', snapshot: 'x'}]) {
    const sql = {async query() { return [{result: JSON.stringify({area: area.areaSource(), catalog: {complete: false, assignments: []}, ...(bad ? {transaction: bad} : {})})}]; }};
    await assert.rejects(produceAttendanceDailySource(sql, area.principal, area.session, area.areaQuery()), e => e.code === 'ATTENDANCE_DAILY_SOURCE_UNAVAILABLE', JSON.stringify(bad));
  }
  const sqlText = fs.readFileSync('scripts/migrations/240-attendance-daily-source.sql', 'utf8');
  assert.match(sqlText, /'isolation',current_setting\('transaction_isolation'\)/); assert.match(sqlText, /'readOnly',current_setting\('transaction_read_only'\)/);
  assert.match(sqlText, /'snapshot',pg_current_snapshot\(\)::text/);
});

test('an account that only reads attendance retries the bell on its own after an empty or failed first reading', async () => {
  const {startPendingBell} = await import('../assets/pending-bell-mount.js');
  const auth = {ok: true, authenticated: true, sessionVersion: 2, expiresAt: new Date(Date.now() + 3600000).toISOString(),
    user: {id: 'qa-user', email: 'qa@example.invalid'}, access: {context: 'tenant', tenant: {id: '00000000-0000-4000-8000-000000000001', roleKey: 'qa'}, tenantCapabilities: ['attendance.area.read', 'time.catalog.read', 'workforce.employee.read']}};
  let prepended = 0;
  const actions = {querySelector: () => null, prepend: () => { prepended++; }};
  const doc = {querySelector: selector => selector.includes('top-actions') ? actions : null, createElement: () => ({dataset: {}}), addEventListener() {}};
  for (const daily of [{ok: true, data: {version: 'attendance-daily-notice-read.v1', ready: false, days: ['2026-11-14', '2026-11-13'], scopeCount: 0, notices: [], failedScopes: 0}},
    null]) {
    const scheduled = [];
    const read = async url => { if (url === '/api/internal-auth') return auth; if (url === PENDING_BELL_DAILY.url) { if (!daily) throw new Error('PENDING_READ_FAILED'); return daily; } throw new Error('unexpected ' + url); };
    const result = await startPendingBell(doc, read, {retry: (fn, ms) => scheduled.push({fn, ms})});
    assert.equal(result, null); assert.equal(prepended, 0, 'no empty bell is mounted');
    assert.equal(scheduled.length, 1); assert.equal(scheduled[0].ms, PENDING_BELL_DAILY.everyMs);
  }
});

test('a writable REPEATABLE READ transaction is still one snapshot: FOR SHARE checks need it writable', async () => {
  const {produceAttendanceDailySource} = await import('../lib/internal-attendance-daily-source.js');
  const area = await import('./fixtures/attendance-area-synthetic.js');
  const sql = {async query() { throw new Error('unused'); }, async transaction(build) { build({query: () => ({})});
    return [[{result: JSON.stringify({area: area.areaSource(), catalog: {complete: false, assignments: []}, transaction: {isolation: 'repeatable read', readOnly: 'off', snapshot: '731:731:'}})}]]; }};
  const cut = await produceAttendanceDailySource(sql, area.principal, area.session, area.areaQuery());
  assert.equal(cut.cut.consistency, 'single_snapshot'); assert.match(cut.cut.evidence.sha256, /^[a-f0-9]{64}$/);
});

test('the bell and the endpoint need every capability the producer needs: area read alone is not enough', async () => {
  const {startPendingBell} = await import('../assets/pending-bell-mount.js');
  for (const missing of ['attendance.area.read', 'time.catalog.read', 'workforce.employee.read']) {
    const caps = PENDING_BELL_DAILY.capabilities.filter(c => c !== missing);
    // Endpoint: the principal's live capabilities are rechecked even if the gateway let it through.
    let connections = 0;
    const h = createAttendanceDailyNoticeHandler({env: {ATTENDANCE_DAILY_NOTICE_ENABLED: 'true'}, now: () => NOW, sessionFor: () => session, dayCount: 1, producer, scopes,
      requireAccess: async () => ({mode: 'managed', principal: {...principal, tenant: {...principal.tenant, effectiveCapabilities: caps}}}), getSql: async () => { connections++; return sql; }});
    const res = response(); await h(request(), res);
    assert.equal(res.statusCode, 403, missing); assert.equal(res.payload.code, 'ATTENDANCE_DAILY_NOTICE_FORBIDDEN'); assert.equal(connections, 0);
    // Bell: without the full set it never asks for the daily reading, never mounts and never schedules a retry.
    const auth = {ok: true, authenticated: true, sessionVersion: 2, expiresAt: new Date(Date.now() + 3600000).toISOString(),
      user: {id: 'qa-user', email: 'qa@example.invalid'}, access: {context: 'tenant', tenant: {id: '00000000-0000-4000-8000-000000000001', roleKey: 'qa'}, tenantCapabilities: caps}};
    const asked = [], scheduled = [];
    const doc = {querySelector: selector => selector.includes('top-actions') ? {querySelector: () => null, prepend: () => assert.fail('mounted')} : null, createElement: () => ({dataset: {}}), addEventListener() {}};
    const result = await startPendingBell(doc, async url => { asked.push(url); if (url === '/api/internal-auth') return auth; throw new Error('unexpected ' + url); }, {retry: (fn, ms) => scheduled.push(ms)});
    assert.equal(result, null); assert.deepEqual(asked, ['/api/internal-auth'], missing); assert.deepEqual(scheduled, []);
  }
  assert.ok(Object.isFrozen(PENDING_BELL_DAILY.capabilities));
});

test('revisión de Codex: una cuenta sin vínculo laboral o autoridad del catálogo recibe un 403 claro y la campanita deja de reintentar', async () => {
  for (const refusal of ['TIME_CATALOG_EMPLOYMENT_REQUIRED', 'TIME_CATALOG_AUTHORITY_REQUIRED', 'TIME_CATALOG_CAPABILITY_REQUIRED', 'ACTION_TENANT_AUTHORITY_REQUIRED']) {
    const refused = async () => { throw new Error(refusal); };
    await assert.rejects(read({producer: refused}), e => e.code === 'ATTENDANCE_DAILY_NOTICE_ACTOR_NOT_ELIGIBLE' && e.status === 403 && !/TIME_CATALOG|ACTION_/.test(e.message));
  }
  // Una falla común de un área sigue contándose como «sin respuesta» sin tirar la lectura.
  const data = await read({producer: async () => { throw new Error('ATTENDANCE_DAILY_SOURCE_UNAVAILABLE'); }});
  assert.equal(data.ready, true); assert.equal(data.notices.length, 0); assert.ok(data.failedScopes >= 1);

  const {startPendingBell, pendingBellReading} = await import('../assets/pending-bell-mount.js');
  let calls = 0;
  const getJson = async url => { if (url === PENDING_BELL_DAILY.url) { calls++; throw Object.assign(new Error('PENDING_READ_FAILED'), {status: 403, code: 'ATTENDANCE_DAILY_NOTICE_ACTOR_NOT_ELIGIBLE'}); } throw new Error('unexpected ' + url); };
  let clock = 0; const reading = pendingBellReading(getJson, [], [], {daily: true, now: () => clock});
  const first = await reading.read(); assert.deepEqual(first.dailySources, [], 'un 403 no es «sin respuesta»'); assert.equal(first.dailyRefused, true);
  clock += PENDING_BELL_DAILY.everyMs * 3; await reading.read(); assert.equal(calls, 1, 'no vuelve a pedir la lectura diaria');
  const auth = {ok: true, authenticated: true, sessionVersion: 2, expiresAt: new Date(Date.now() + 3600000).toISOString(),
    user: {id: 'qa-user', email: 'qa@example.invalid'}, access: {context: 'tenant', tenant: {id: '00000000-0000-4000-8000-000000000001', roleKey: 'qa'}, tenantCapabilities: [...PENDING_BELL_DAILY.capabilities]}};
  const scheduled = [];
  const doc = {querySelector: s => s.includes('top-actions') ? {querySelector: () => null, prepend: () => assert.fail('mounted')} : null, createElement: () => ({dataset: {}}), addEventListener() {}};
  const result = await startPendingBell(doc, async url => url === '/api/internal-auth' ? auth : getJson(url), {retry: (fn, ms) => scheduled.push(ms)});
  assert.equal(result, null); assert.deepEqual(scheduled, [], 'una cuenta rechazada no reintenta cada cinco minutos');
});

test('revisión de Codex (58457598): la 240 separa la autoridad del actor; listar ámbitos también reconoce una cuenta no elegible', async () => {
  const sqlText = fs.readFileSync('scripts/migrations/240-attendance-daily-source.sql', 'utf8');
  assert.match(sqlText, /catalog_value:=public\.time_catalog_assert_actor_authority_v1\(/);
  assert.match(sqlText, /EXCEPTION WHEN raise_exception THEN\s+IF SQLERRM IN \('TIME_CATALOG_AUTHORITY_REQUIRED','TIME_CATALOG_CAPABILITY_REQUIRED','TIME_CATALOG_EMPLOYMENT_REQUIRED',\s+'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID','TIME_CATALOG_NATIVE_PERIOD_INVALID','TENANT_IAM_SOD_CONFLICT'\) THEN\s+RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_ACTOR_NOT_ELIGIBLE'/);
  assert.match(sqlText, /time_catalog_assignment_view_v2\(catalog_value,entry\.id\)/);
  await assert.rejects(read({producer: async () => { throw new Error('ATTENDANCE_DAILY_SOURCE_ACTOR_NOT_ELIGIBLE'); }}), e => e.code === 'ATTENDANCE_DAILY_NOTICE_ACTOR_NOT_ELIGIBLE' && e.status === 403);
  for (const refusal of ['TENANT_IAM_SOD_CONFLICT', 'ACTION_TENANT_AUTHORITY_REQUIRED'])
    await assert.rejects(read({scopes: async () => { throw new Error(refusal); }}), e => e.code === 'ATTENDANCE_DAILY_NOTICE_ACTOR_NOT_ELIGIBLE' && e.status === 403, refusal);
  // Los mismos códigos sueltos de una asignación concreta siguen siendo un área sin respuesta.
  for (const areaLevel of ['TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID', 'TIME_CATALOG_NATIVE_PERIOD_INVALID']) {
    const data = await read({producer: async () => { throw new Error(areaLevel); }});
    assert.equal(data.ready, true, areaLevel); assert.ok(data.failedScopes >= 1, areaLevel);
  }
  await assert.rejects(read({scopes: async () => { throw new Error('boom'); }}), e => e.code === 'ATTENDANCE_DAILY_NOTICE_SCOPES_INVALID' && e.status === 503);
});
