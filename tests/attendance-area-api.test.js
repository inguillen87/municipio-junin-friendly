// HTTP and contract tests with synthetic SQL responses. No database is opened.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAttendanceAreaHandler, attendanceAreaHttpQuery } from '../api/internal-attendance-area.js';
import { attendanceAreaRead, attendanceAreaQuery, attendanceAreaDeviceKey, validateAttendanceAreaSource } from '../lib/internal-attendance-area.js';
import { v3Events } from './fixtures/continuous-workdays-v3-api-synthetic.js';
import { id, area, principal, session, areaQuery, areaSource, AREA_SNAPSHOT } from './fixtures/attendance-area-synthetic.js';

const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } });
const queryStrings = (q = areaQuery()) => Object.fromEntries(Object.entries(q).filter(([, value]) => value !== null).map(([key, value]) => [key, key === 'area' ? JSON.stringify(value) : value]));
const request = (q = queryStrings()) => ({ method: 'GET', url: '/api/internal-attendance-area?' + new URLSearchParams(q), query: q, headers: {} });
const sourceInvalid = error => error.code === 'ATTENDANCE_AREA_SOURCE_INVALID' && error.status === 503;
const ctx = () => ({ tenantId: principal.tenant.id, membershipId: principal.tenant.membershipId, actorSessionId: session.id, actorSessionVersion: session.version });
function setup(options = {}) {
  const stats = { connections: 0, calls: [] };
  const sql = { async query(text, values) {
    stats.calls.push({ text, values });
    if (options.error) throw options.error;
    return options.rows ?? [{ result: JSON.stringify(options.result ?? areaSource()) }];
  } };
  const handler = createAttendanceAreaHandler({ env: { INTERNAL_APP_ORIGIN: 'https://synthetic.invalid' },
    requireAccess: async (_request, res, gates) => {
      stats.gates = gates;
      if (options.denied) { res.status(options.denied).json({ ok: false }); return null; }
      return options.access ?? { mode: 'managed', principal };
    }, sessionFor: () => options.session ?? session, getSql: async () => { stats.connections++; return sql; } });
  return { handler, stats, sql };
}

test('area authority reads one scoped source without global attendance or employee permissions', async () => {
  const actor = { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: ['attendance.area.read'] } };
  const source = areaSource(); source.principal.capabilities = ['attendance.area.read']; source.principal.actorPersonId = null;
  const original = structuredClone(source), { handler, stats } = setup({ access: { mode: 'managed', principal: actor }, result: source }), res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 200); assert.deepEqual(res.payload.data, original);
  assert.deepEqual(stats.gates.requiredCapabilities, ['attendance.area.read']); assert.equal(stats.gates.capabilityMode, 'all');
  assert.equal(stats.gates.allowLegacy, false); assert.equal(stats.gates.requireDataPlaneReady, true); assert.equal(stats.gates.requireCertifiedDataBinding, true);
  assert.equal(stats.connections, 1); assert.equal(stats.calls.length, 1);
  assert.match(stats.calls[0].text, /^SELECT public\.attendance_area_workdays_read_v1\(/);
  assert.doesNotMatch(stats.calls[0].text, /attendance_clock_workday_source_v[123]/);
  assert.deepEqual(JSON.parse(stats.calls[0].values[1]), areaQuery());
  assert.deepEqual(JSON.parse(stats.calls[0].values[0]), { actorEmail: session.email, actorSessionId: session.id, actorSessionVersion: session.version,
    releaseSha: session.releaseSha, tenantId: principal.tenant.id, membershipId: principal.tenant.membershipId });
  assert.match(res.headers['Cache-Control'], /private, no-store/); assert.match(res.headers.Vary, /Cookie/);
  assert.equal(source.workdays.nominalReadAllowed, true);
});

test('day/site/area are explicit; the first unpinned read normalizes snapshot to null and a repeat pins it', () => {
  const without = queryStrings(); delete without.snapshot;
  assert.deepEqual(attendanceAreaHttpQuery(request(without)), areaQuery({ snapshot: null }));
  assert.deepEqual(attendanceAreaHttpQuery(request()), areaQuery());
  assert.equal(attendanceAreaQuery(areaQuery()).snapshot, AREA_SNAPSHOT);
  const missing = areaQuery(); delete missing.snapshot;
  assert.throws(() => attendanceAreaQuery(missing), error => error.status === 400);
  assert.throws(() => validateAttendanceAreaSource(areaSource(), areaQuery({ snapshot: id(99) }), ctx()), sourceInvalid);
});

for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) test(method + ' is rejected before authorization, request body or SQL', async () => {
  const { handler, stats } = setup(), req = request(), res = response(); req.method = method;
  Object.defineProperty(req, 'body', { get() { throw Error('must not read a body'); } });
  await handler(req, res); assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, 'GET');
  assert.equal(stats.connections, 0); assert.equal(stats.gates, undefined);
});

for (const [label, mutate] of [
  ['missing area', q => { delete q.area; }], ['missing day', q => { delete q.day; }], ['missing site', q => { delete q.site; }],
  ['implicit latest day', q => { q.day = 'latest'; }], ['impossible date', q => { q.day = '2026-02-30'; }],
  ['unsupported pre-2000 day', q => { q.day = '1999-12-31'; }],
  ['timestamp as date', q => { q.day += 'T00:00:00Z'; }], ['blank site', q => { q.site = ''; }], ['decorated site', q => { q.site += '\n'; }],
  ['foreign client tenant', q => { q.tenantId = id(99); }], ['resource bypass', q => { q.resource = 'global'; }],
  ['zero snapshot', q => { q.snapshot = '00000000-0000-0000-0000-000000000000'; }], ['decorated snapshot', q => { q.snapshot += '\n'; }],
  ['array query value', q => { q.site = ['qa-site']; }], ['numeric scope', q => { q.area = JSON.stringify({ ...area, organizationUnitSourceId: 900 }); }],
  ['wildcard sector', q => { q.area = JSON.stringify({ ...area, sectorSourceId: '*' }); }], ['extra scope key', q => { q.area = JSON.stringify({ ...area, includeAll: true }); }],
  ['duplicate scope key', q => { q.area = '{"organizationUnitSourceId":"900","sectorSourceId":"901","sectorSourceId":null}'; }],
  ['oversized scope', q => { q.area = ' '.repeat(257); }],
]) test('rejects ' + label + ' before obtaining SQL', async () => {
  const q = queryStrings(); mutate(q); const { handler, stats } = setup(), res = response();
  await handler(request(q), res); assert.equal(res.statusCode, 400, JSON.stringify(res.payload)); assert.equal(stats.connections, 0);
});

test('duplicate or inconsistent query strings cannot hide behind the framework parsed query', async () => {
  for (const mutate of [r => { r.url += '&day=' + r.query.day; }, r => { r.url = r.url.replace('qa-site', 'other-site'); }]) {
    const { handler, stats } = setup(), req = request(), res = response(); mutate(req);
    await handler(req, res); assert.equal(res.statusCode, 400); assert.equal(stats.connections, 0);
  }
});

test('anonymous, revoked, legacy and global-only accounts cannot enter the area facade', async () => {
  for (const options of [{ denied: 401 }, { denied: 403 }, { access: { mode: 'legacy', principal } },
    { access: { mode: 'managed', principal: { ...principal, tenant: { ...principal.tenant, source: 'legacy' } } } },
    { access: { mode: 'managed', principal: { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: ['attendance.read', 'workforce.employee.read'] } } } }]) {
    const { handler, stats } = setup(options), req = request(), res = response();
    Object.defineProperty(req, 'body', { get() { throw Error('must not read'); } });
    await handler(req, res); assert.ok([401, 403].includes(res.statusCode)); assert.equal(stats.connections, 0);
  }
});

test('wrong session email, version or uncertified release fails before any SQL', async () => {
  for (const options of [{ session: { ...session, email: 'another-synthetic@example.invalid' } }, { session: { ...session, version: 0 } },
    { session: { ...session, id: 'invalid' } }, { session: { ...session, releaseSha: 'f'.repeat(40) } },
    { access: { mode: 'managed', principal: { ...principal, tenant: { ...principal.tenant, certifiedReleaseSha: null } } } }]) {
    const { handler, stats } = setup(options), res = response(); await handler(request(), res);
    assert.equal(res.statusCode, 401); assert.equal(stats.connections, 0);
  }
});

test('foreign contracts reject the whole response even when the v3 context counts are internally consistent', async () => {
  const source = areaSource(), extra = v3Events({ contractId: id(99), stream: 'foreign-synthetic', device: 'other-device', legajo: 'FOREIGN_SYNTHETIC', ordinal: 3 });
  source.workdays.events.push(...extra); source.workdays.context.recordCount += extra.length; source.workdays.context.eventCount += extra.length;
  const before = structuredClone(source), { handler } = setup({ result: source }), res = response(); await handler(request(), res);
  assert.equal(res.statusCode, 503); assert.equal(res.payload.code, 'ATTENDANCE_AREA_SOURCE_INVALID');
  assert.equal(res.payload.data, undefined); assert.doesNotMatch(JSON.stringify(res.payload), /FOREIGN_SYNTHETIC|Persona sintética/);
  assert.deepEqual(source, before, 'validator did not filter the untrusted global source into an area');
});

test('foreign principals, nominal population or area labels cannot accompany otherwise valid events', () => {
  const changes = [
    s => { s.principal.tenantId = id(91); }, s => { s.principal.membershipId = id(92); }, s => { s.principal.sessionId = id(93); }, s => { s.principal.sessionVersion++; },
    s => { s.principal.areaScopes = []; }, s => { s.area.sectorSourceId = null; }, s => { s.areaLabel = 'Otra repartición'; },
    s => { s.population.area.organizationUnitSourceId = '999'; }, s => { s.population.areaLabel = 'Otra área'; },
    s => { s.population.contracts[0].areaLabel = 'Otra área'; }, s => { s.population.contracts[0].id = id(99); },
    s => { s.population.validFrom = '2026-11-13'; }, s => { s.workdays.events[0].contractId = id(99); },
    s => { s.population.contracts[0].dni = 'DO_NOT_PROJECT'; }, s => { s.workdays.events[0].sourceDatabase = 'DO_NOT_PROJECT'; },
  ];
  for (const mutate of changes) { const source = areaSource(); mutate(source); assert.throws(() => validateAttendanceAreaSource(source, areaQuery(), ctx()), sourceInvalid); }
});

test('an authorized contract UUID cannot carry another person label, employee number or non-string nominal value', async () => {
  for (const mutate of [
    e => { e.personLabel = 'PERSONA_AJENA_NO_PROYECTAR'; }, e => { e.legajo = 'LEGAJO_AJENO_NO_PROYECTAR'; },
    e => { e.legajo = 9001; }, e => { e.personLabel = { nombre: 'PERSONA_AJENA_NO_PROYECTAR' }; },
    e => { e.personLabel += '\u200b'; }, e => { e.personLabel = '<strong>PERSONA_AJENA_NO_PROYECTAR</strong>'; },
  ]) {
    const source = areaSource(); mutate(source.workdays.events[0]);
    assert.equal(source.workdays.events[0].contractId, source.population.contracts[0].id);
    const { handler } = setup({ result: source }), res = response(); await handler(request(), res);
    assert.equal(res.statusCode, 503); assert.equal(res.payload.code, 'ATTENDANCE_AREA_SOURCE_INVALID');
    assert.equal(res.payload.data, undefined); assert.doesNotMatch(JSON.stringify(res.payload), /AJENA_NO_PROYECTAR|AJENO_NO_PROYECTAR/);
  }
});

test('source cut, civil-day context, counts and nominal-only events must describe the exact requested cut', () => {
  const changes = [
    s => { s.day = '2026-11-15'; }, s => { s.site = 'other-site'; }, s => { s.workdays.site.key = 'other-site'; },
    s => { s.sourceCut.id = id(99); }, s => { s.sourceCut.consistency = 'several_snapshots'; }, s => { s.sourceCut.generatedAt = '2026-11-15T02:00:00Z'; },
    s => { s.workdays.revision = id(99); s.sourceCut.id = id(99); }, s => { s.workdays.context.recordCount++; }, s => { s.workdays.context.eventCount++; },
    s => { s.workdays.context.from = '2026-11-12'; }, s => { s.workdays.filters.anchoredToLatest = true; },
    s => { s.workdays.nominalReadAllowed = false; }, s => { s.workdays.events[0].identityState = 'unmapped'; s.workdays.events[0].contractId = null; },
  ];
  for (const mutate of changes) { const source = areaSource(); mutate(source); assert.throws(() => validateAttendanceAreaSource(source, areaQuery(), ctx()), sourceInvalid); }
  const opaque = areaSource(), event = opaque.workdays.events[0];
  opaque.workdays.observations = [{ eventRef: '9'.repeat(64), deviceKey: event.deviceKey, source: { ...event.source, ordinal: 90 },
    occurredAt: null, localTimestamp: null, issues: ['timestamp_unusable'] }];
  opaque.workdays.context.observationCount = 1; opaque.workdays.context.recordCount++;
  assert.throws(() => validateAttendanceAreaSource(opaque, areaQuery(), ctx()), sourceInvalid);
});

test('device keys use the exact tenant-plus-inventory-UUID namespace; labels and observed hashes do not substitute', () => {
  const expected = createHash('sha256').update('clock-device-v2:' + principal.tenant.id + ':' + id(8)).digest('hex');
  assert.equal(attendanceAreaDeviceKey(principal.tenant.id, id(8)), expected);
  for (const args of [[id(1) + '\n', id(8)], [id(1), 'Reloj sintético'], [id(1), '00000000-0000-0000-0000-000000000000']]) assert.throws(() => attendanceAreaDeviceKey(...args));
  for (const mutate of [r => { r.expectedDeviceKeys = ['1'.repeat(64)]; }, r => { r.expectedDeviceKeys = [attendanceAreaDeviceKey(id(99), id(8))]; },
    r => { r.expectedDeviceIds = [id(99)]; }, r => { r.deviceKeyNamespace = 'clock-device-v3'; }, r => { r.expectedDeviceKeys.push(r.expectedDeviceKeys[0]); }]) {
    const source = areaSource(); mutate(source.expectedDevices.records[0]); assert.throws(() => validateAttendanceAreaSource(source, areaQuery(), ctx()), sourceInvalid);
  }
});

test('every demonstrated contract needs one matching expected-device result and completeness cannot exceed declarations', () => {
  const changes = [
    s => { s.expectedDevices.records = []; }, s => { s.expectedDevices.records.push(structuredClone(s.expectedDevices.records[0])); },
    s => { s.expectedDevices.records[0].contractId = id(99); }, s => { s.expectedDevices.records[0].date = '2026-11-13'; },
    s => { s.expectedDevices.records[0].expectedDeviceIds = []; s.expectedDevices.records[0].expectedDeviceKeys = []; },
    s => { s.expectedDevices.records[0].approvalId = null; }, s => { s.expectedDevices.records[0].complete = false; },
    s => { s.expectedDevices.records[0].validUntil = '2026-11-13'; }, s => { s.expectedDevices.records[0].retiredEffectiveFrom = s.day; },
    s => { s.expectedDevices.complete = false; },
  ];
  for (const mutate of changes) { const source = areaSource(); mutate(source); assert.throws(() => validateAttendanceAreaSource(source, areaQuery(), ctx()), sourceInvalid); }
  const blocked = areaSource({ declarationBlocked: true });
  assert.equal(validateAttendanceAreaSource(blocked, areaQuery(), ctx()).expectedDevices.complete, false);
  blocked.expectedDevices.complete = true; assert.throws(() => validateAttendanceAreaSource(blocked, areaQuery(), ctx()), sourceInvalid);
});

test('partial population preserves only demonstrated rows and all unresolved/coverage blockers without promoting readiness', () => {
  for (const source of [areaSource({ populationComplete: false }), areaSource({ populationComplete: false, empty: true }), areaSource({ declarationBlocked: true })]) {
    const before = structuredClone(source); assert.deepEqual(validateAttendanceAreaSource(source, areaQuery(), ctx()), before);
    assert.equal(source.expectedDevices.complete, false); assert.ok(source.blockerCodes.includes('EXPECTED_DEVICES_UNRESOLVED'));
    assert.ok(source.blockerCodes.includes('PERIOD_COVERAGE_UNCONFIRMED'));
    assert.deepEqual([source.coverageCertified, source.installationReady, source.payrollPosted, source.NoeliaReady], [false, false, false, false]);
  }
  for (const field of ['coverageCertified', 'installationReady', 'payrollPosted', 'NoeliaReady']) {
    const source = areaSource(); source[field] = true; assert.throws(() => validateAttendanceAreaSource(source, areaQuery(), ctx()), sourceInvalid);
  }
  for (const mutate of [s => { s.blockerCodes = []; }, s => { s.blockerCodes.push('AREA_HISTORY_UNRESOLVED'); },
    s => { s.population.complete = false; }, s => { s.expectedDevices.records[0].coverageCertified = true; }]) {
    const source = areaSource(); mutate(source); assert.throws(() => validateAttendanceAreaSource(source, areaQuery(), ctx()), sourceInvalid);
  }
});

test('declared empty population still keeps period coverage unconfirmed and no absence inference', () => {
  const source = areaSource({ empty: true });
  assert.deepEqual(validateAttendanceAreaSource(source, areaQuery(), ctx()).blockerCodes, ['PERIOD_COVERAGE_UNCONFIRMED']);
  assert.equal(source.workdays.events.length, 0); assert.equal(source.workdays.context.recordCount, 0);
  assert.equal(source.expectedDevices.complete, true); assert.equal(source.coverageCertified, false);
});

test('malformed, duplicate-key or multiple SQL envelopes fail closed without exposing their contents', async () => {
  const raw = JSON.stringify(areaSource());
  for (const rows of [[], [{ result: raw }, { result: raw }], [{ result: areaSource() }], [{ result: '{"private":"NEVER_ECHO"' }],
    [{ result: raw.replace('"day":', '"day":"2099-01-01","day":') }]]) {
    const { handler } = setup({ rows }), res = response(); await handler(request(), res);
    assert.equal(res.statusCode, 503); assert.equal(res.payload.data, undefined); assert.doesNotMatch(JSON.stringify(res.payload), /NEVER_ECHO|Persona sintética|sourceDatabase/);
  }
});

test('a source beyond four MiB fails 413 before parsing or returning a trimmed population', async () => {
  const { handler, stats } = setup({ rows: [{ result: ' '.repeat(4 * 1024 * 1024 + 1) }] }), res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 413); assert.equal(res.payload.code, 'ATTENDANCE_AREA_LIMIT');
  assert.equal(res.payload.data, undefined); assert.match(res.payload.error, /no se devolvió una población recortada/);
  assert.equal(stats.calls.length, 1, 'one synthetic SQL response, with no fallback or second source');
});

test('missing candidate, revocation, session/release changes and source conflicts report precise safe outcomes', async () => {
  const cases = [
    [{ code: '42883', message: 'private SQL body NEVER_ECHO' }, 503, 'UNAVAILABLE'],
    [{ code: '42P01', message: 'private table NEVER_ECHO' }, 503, 'UNAVAILABLE'],
    [{ message: 'ATTENDANCE_AREA_CAPABILITY_REQUIRED' }, 403, 'FORBIDDEN'],
    [{ message: 'ATTENDANCE_AREA_SCOPE_DENIED' }, 403, 'FORBIDDEN'],
    [{ message: 'ATTENDANCE_SESSION_INVALID' }, 401, 'SESSION_INVALID'],
    [{ message: 'ATTENDANCE_RELEASE_NOT_CERTIFIED' }, 409, 'SCOPE_CHANGED'],
    [{ message: 'ATTENDANCE_CAPTURE_CHANGED' }, 409, 'CAPTURE_CHANGED'],
    [{ message: 'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE' }, 409, 'SOURCE_BLOCKED'],
    [{ message: 'ATTENDANCE_WORKDAY_SOURCE_CONFLICT' }, 409, 'SOURCE_BLOCKED'],
    [{ message: 'ATTENDANCE_AREA_EVENT_DATE_UNPROVEN' }, 409, 'SOURCE_BLOCKED'],
    [{ message: 'ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE' }, 413, 'LIMIT'],
    [{ message: 'ATTENDANCE_WORKDAY_SITE_NOT_FOUND' }, 404, 'NOT_FOUND'],
  ];
  for (const [error, status, code] of cases) {
    const { handler, stats } = setup({ error }), res = response(); await handler(request(), res);
    assert.equal(res.statusCode, status); assert.equal(res.payload.code, 'ATTENDANCE_AREA_' + code);
    assert.equal(stats.calls.length, 1); assert.doesNotMatch(JSON.stringify(res.payload), /NEVER_ECHO|SELECT|private table/);
  }
});

test('read adapter accepts only one authenticated scoped result and never filters a rejected result', async () => {
  const data = areaSource(), before = structuredClone(data);
  const sql = { calls: 0, async query() { this.calls++; return { rows: [{ result: JSON.stringify(data) }] }; } };
  const result = await attendanceAreaRead(sql, principal, session, areaQuery());
  assert.deepEqual(result, before); assert.equal(sql.calls, 1); assert.deepEqual(data, before);
});

test('collection capture/receipt counts cannot smuggle totals from unscoped source rows', () => {
  for (const mutate of [s => { s.workdays.collection.captureCount = 9; }, s => { s.workdays.collection.receiptCount = 9; },
    s => { s.workdays.collection.batchCount = 0; }, s => { s.workdays.collection.batchCount = 2; }]) {
    const source = areaSource(); mutate(source); assert.throws(() => validateAttendanceAreaSource(source, areaQuery(), ctx()), sourceInvalid);
  }
  const empty = areaSource({ empty: true }); empty.workdays.collection.lastReceiptAt = '2026-11-14T17:00:00Z';
  assert.throws(() => validateAttendanceAreaSource(empty, areaQuery(), ctx()), sourceInvalid);
});
