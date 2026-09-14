import test from 'node:test';
import assert from 'node:assert/strict';
import { createInternalPayrollMonthlySourceSummaryHandler } from '../api/internal-payroll-monthly-source-summary.js';
import { MONTHLY_SOURCE_VERSION, monthlySourceDecimal, monthlySourceSafeError, parseMonthlySourceQuery,
  validateMonthlySourceResponse, readMonthlySourceSummary } from '../lib/internal-payroll-monthly-source-summary.js';

// Synthetic source summaries only. No municipal rows, files, tokens or database.
const SOURCE_A = 'fedcba98-7654-0321-0123-456789abcdef';
const SOURCE_B = '11111111-2222-3333-4444-555555555555';
const TENANT = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP = '44444444-4444-4444-8444-444444444444';
const SESSION = '55555555-5555-4555-8555-555555555555';
const EMAIL = 'synthetic-summary@example.invalid', RELEASE = 'a'.repeat(40);
const PERIOD = '2026-08', HASH = 'b'.repeat(64);
const query = (resource = 'summary', period = PERIOD, datasetIds = [SOURCE_A, SOURCE_B]) => ({ resource, period, datasetIds: resource === 'catalog' ? null : datasetIds });
const scope = () => ({ kind: 'selected_available_general', completeMonthCertified: false, payrollCalculated: false, payrollPosted: false, official: false });
const source = (id = SOURCE_A, type = 'M') => ({ datasetId: id, date: '2026-08-31', sourcePeriod: 2026, sourceMonth: 8,
  type, closureStatus: 'open', statementCount: 1, lineCount: 2, sourceLabel: 'Liquidación sintética', sourceSha256: HASH,
  payloadHash: 'c'.repeat(64), importedAt: '2026-09-14T07:00:01.123456Z' });
function summary() {
  return { version: MONTHLY_SOURCE_VERSION, mode: 'summary', period: PERIOD, sources: [source(), source(SOURCE_B, 'S')],
    counts: { datasetCount: 2, statementParticipations: 2, distinctLegajos: 1, lineCount: 4, conceptCount: 2 },
    rows: [
      { code: '001', description: 'Concepto sintético', unit: null, totalGroup: null, sourceRows: 2, distinctLegajos: 1, missingQuantities: 0, quantity: '2.00', missingAmounts: 0, amount: '9007199254740993.01' },
      { code: '998', description: 'Total informado por la fuente', unit: '', totalGroup: '998', sourceRows: 2, distinctLegajos: 1, missingQuantities: 1, quantity: null, missingAmounts: 1, amount: null },
    ], reportHash: 'd'.repeat(64), scope: scope() };
}
const catalog = (period = null) => ({ version: MONTHLY_SOURCE_VERSION, mode: 'catalog', period, items: [source()], total: 1, scope: scope() });
const access = () => ({ mode: 'managed', session: { id: SESSION, email: EMAIL, version: 3 },
  principal: { user: { email: EMAIL }, tenant: { source: 'membership', id: TENANT, membershipId: MEMBERSHIP,
    certifiedReleaseSha: RELEASE, effectiveCapabilities: ['payroll.read'] } } });
const session = () => ({ id: SESSION, email: EMAIL, version: 3, releaseSha: RELEASE });
const code = suffix => ({ code: 'PAYROLL_MONTHLY_SOURCE_' + suffix });
function response() {
  return { headers: {}, statusCode: null, payload: null,
    setHeader(name, value) { this.headers[name] = value; }, status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; } };
}
function request(values = { resource: 'summary', period: PERIOD, datasetIds: SOURCE_A + ',' + SOURCE_B }) {
  return { method: 'GET', query: values, url: '/api/internal-payroll-monthly-source-summary?' + new URLSearchParams(values), headers: {} };
}
function setup(overrides = {}, data = summary()) {
  const calls = { access: 0, sqlFactory: 0, queries: [] };
  const handler = createInternalPayrollMonthlySourceSummaryHandler({ env: { INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE },
    requireCompatibleInternalAccess: async (_req, _res, options) => { calls.access++; calls.options = options; return access(); },
    getInternalSql: async () => { calls.sqlFactory++; return { query: async (statement, values) => { calls.queries.push({ statement, values }); return [{ result: data }]; } }; }, ...overrides });
  return { handler, calls };
}

test('GET binds principal6 and exact generic PostgreSQL IDs without altering microseconds or money', async () => {
  const { handler, calls } = setup(); const res = response();
  await handler(request(), res);
  assert.equal(res.statusCode, 200); assert.equal(res.payload.ok, true);
  assert.equal(res.payload.data.sources[0].importedAt, '2026-09-14T07:00:01.123456Z');
  assert.equal(res.payload.data.rows[0].amount, '9007199254740993.01');
  assert.equal(res.payload.data.rows[1].amount, null);
  assert.deepEqual(calls.queries[0].values, [EMAIL, SESSION, 3, RELEASE, TENANT, MEMBERSHIP, PERIOD, [SOURCE_A, SOURCE_B]]);
  assert.match(calls.queries[0].statement, /^SELECT public\.payroll_monthly_source_summary_v1\(\$1::text,\$2::uuid,\$3::integer,\$4::text,\$5::uuid,\$6::uuid,\$7::text,\$8::uuid\[\]\) AS result$/);
  assert.deepEqual(calls.options.requiredCapabilities, ['payroll.read']);
  assert.equal(calls.options.requireCertifiedDataBinding, true); assert.equal(calls.options.requireDataPlaneReady, true);
  assert.equal(calls.options.allowLegacy, false); assert.match(res.headers['Cache-Control'], /private, no-store/);
});
test('catalog supports optional period and empty available sources without fabricating a summary', async () => {
  for (const period of [null, PERIOD]) {
    const { handler, calls } = setup({}, { ...catalog(period), items: [], total: 0 }); const res = response();
    await handler(request({ resource: 'catalog', ...(period ? { period } : {}) }), res);
    assert.equal(res.statusCode, 200); assert.equal(res.payload.data.total, 0);
    assert.deepEqual(calls.queries[0].values.slice(6), [period, null]);
  }
  const data = catalog(); data.items.push({ ...source(SOURCE_B, 'S'), sourcePeriod: 2025, sourceMonth: 1, sourceSha256: 'e'.repeat(64) }); data.total = 2;
  assert.equal(validateMonthlySourceResponse(data, query('catalog', null)).total, 2);
});
test('flat query rejects arrays, repeats including encoded raw keys, middleware drift and unknown parameters before access', async () => {
  const valid = request();
  const invalid = [
    request({ resource: ['summary'], period: PERIOD, datasetIds: SOURCE_A }), request({ resource: 'summary', period: [PERIOD], datasetIds: SOURCE_A }),
    request({ resource: 'summary', period: PERIOD, datasetIds: [SOURCE_A] }), request({ resource: 'summary', period: PERIOD }),
    request({ resource: 'catalog', datasetIds: SOURCE_A }), request({ resource: 'catalog', tenantId: TENANT }),
    request({ resource: 'summary', period: PERIOD, datasetIds: SOURCE_A, sourceSha256: HASH }),
    { ...valid, url: valid.url + '&resource=summary' }, { ...valid, url: valid.url + '&%70eriod=' + PERIOD },
    { ...valid, url: valid.url + '&unknown=1' }, { ...valid, url: '/api/internal-payroll-monthly-source-summary?resource=summary' },
    request({ resource: 'summary', period: PERIOD, datasetIds: '' }), request({ resource: 'summary', period: PERIOD, datasetIds: SOURCE_A + ',' }),
    request({ resource: 'summary', period: PERIOD, datasetIds: SOURCE_A + ',' + SOURCE_A.toUpperCase() }),
  ];
  for (const req of invalid) { const { handler, calls } = setup(); const res = response(); await handler(req, res);
    assert.equal(res.statusCode, 400); assert.equal(calls.access, 0); assert.equal(calls.queries.length, 0); }
});
test('period and dataset bounds are exact, and UUID case is canonicalized without changing the selected set', () => {
  for (const period of ['1900-01', '2100-12']) assert.equal(parseMonthlySourceQuery(request({ resource: 'catalog', period })).period, period);
  for (const period of ['1899-12', '2101-01', '2026-00', '2026-13', '2026-1', '2026-01-01', ' 2026-01', '']) {
    assert.throws(() => parseMonthlySourceQuery(request({ resource: 'catalog', period })), code('QUERY_INVALID'));
  }
  const ids = Array.from({ length: 25 }, (_, i) => `${i.toString(16).padStart(8, '0')}-0000-0000-0000-000000000000`);
  assert.equal(parseMonthlySourceQuery(request({ resource: 'summary', period: PERIOD, datasetIds: ids.slice(0, 24).join(',') })).datasetIds.length, 24);
  assert.throws(() => parseMonthlySourceQuery(request({ resource: 'summary', period: PERIOD, datasetIds: ids.join(',') })), code('QUERY_INVALID'));
  assert.deepEqual(parseMonthlySourceQuery(request({ resource: 'summary', period: PERIOD, datasetIds: SOURCE_A.toUpperCase() })).datasetIds, [SOURCE_A]);
});
test('write methods never reach access or SQL and return Allow GET', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    const { handler, calls } = setup(); const res = response(); await handler({ ...request(), method, body: { nominal: 'synthetic' } }, res);
    assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, 'GET'); assert.equal(calls.access, 0); assert.equal(calls.sqlFactory, 0);
  }
});
test('anonymous gateway denial preserves its safe response and never initializes SQL', async () => {
  const { handler, calls } = setup({ requireCompatibleInternalAccess: async (_req, res) => { res.status(401).json({ ok: false, code: 'INTERNAL_ACCESS_REQUIRED' }); return null; } });
  const res = response(); await handler(request(), res); assert.equal(res.statusCode, 401); assert.equal(calls.sqlFactory, 0);
  assert.match(res.headers['Cache-Control'], /no-store/);
});
test('legacy, unbound, unrelated capabilities and invalid tenant identities fail before SQL', async () => {
  const changes = [a => { a.mode = 'legacy'; }, a => { a.principal.tenant.source = 'owner'; },
    a => { a.principal.tenant.effectiveCapabilities = ['workforce.employee.read']; }, a => { a.principal.tenant.membershipId = ''; },
    a => { a.principal.tenant.id = [TENANT]; }];
  for (const change of changes) {
    const a = access(); change(a); const { handler, calls } = setup({ requireCompatibleInternalAccess: async () => a });
    const res = response(); await handler(request(), res); assert.ok([401, 403].includes(res.statusCode)); assert.equal(calls.sqlFactory, 0);
  }
});
test('session email, version and certified release are tied to the current principal', async () => {
  for (const change of [a => { a.session.email = 'other@example.invalid'; }, a => { a.session.version = 0; },
    a => { a.session.id = ''; }, a => { a.principal.tenant.certifiedReleaseSha = 'f'.repeat(40); }]) {
    const a = access(); change(a); const { handler, calls } = setup({ requireCompatibleInternalAccess: async () => a }); const res = response();
    await handler(request(), res); assert.ok([401, 503].includes(res.statusCode)); assert.equal(calls.sqlFactory, 0);
  }
  const sql = { query() { assert.fail('invalid principal must not reach SQL'); } };
  await assert.rejects(readMonthlySourceSummary(sql, access().principal, { ...session(), email: 'other@example.invalid' }, query()), code('SESSION_INVALID'));
  await assert.rejects(readMonthlySourceSummary(sql, access().principal, { ...session(), releaseSha: 'f'.repeat(40) }, query()), code('RELEASE_NOT_CERTIFIED'));
});
test('source period, selected ID set, duplicate revisions and mixed backup cohorts cannot pass DTO validation', () => {
  const mutations = [data => { data.period = '2026-09'; }, data => { data.sources[0].sourceMonth = 9; },
    data => { data.sources[1].datasetId = '66666666-6666-6666-6666-666666666666'; }, data => { data.sources[1].datasetId = SOURCE_A; },
    data => { data.sources[1].type = 'M'; }, data => { data.sources[1].sourceSha256 = 'f'.repeat(64); },
    data => { data.sources.pop(); }, data => { data.sources[0].date = '2026-02-30'; }, data => { data.sources[0].sourcePeriod = 2101; },
    data => { data.sources[0].statementCount = 0; }, data => { data.sources[0].lineCount = 0; },
  ];
  for (const mutate of mutations) { const data = summary(); mutate(data); assert.throws(() => validateMonthlySourceResponse(data, query()), code('SOURCE_DRIFT')); }
  const reversed = summary(); reversed.sources.reverse(); assert.equal(validateMonthlySourceResponse(reversed, query()).sources[0].datasetId, SOURCE_B);
  const sourceDate = summary(); sourceDate.sources[0].date = '2026-09-01'; assert.equal(validateMonthlySourceResponse(sourceDate, query()).period, PERIOD);
});
test('unknown fields and unsupported official claims are rejected at every DTO boundary', () => {
  const mutations = [data => { data.personId = SOURCE_A; }, data => { data.scope.completeMonthCertified = true; }, data => { data.scope.official = true; },
    data => { data.scope.kind = 'all_payroll'; }, data => { data.sources[0].rawPayload = { synthetic: true }; },
    data => { data.counts.extra = 1; }, data => { data.rows[0].employeeName = 'Synthetic'; }, data => { delete data.sources[0].payloadHash; },
    data => { data.rows[0].unit = 'x'.repeat(33); }, data => { data.rows[0].totalGroup = 'group'; },
    data => { data.rows[0].description = ' '; }, data => { data.sources[0].sourceLabel = 'bad\nlabel'; }, data => { data.reportHash = 'invalid'; }];
  for (const mutate of mutations) { const data = summary(); mutate(data); assert.throws(() => validateMonthlySourceResponse(data, query()), code('SOURCE_DRIFT')); }
});
test('participations, concepts, distinct legajos and line totals remain mutually consistent', () => {
  const mutations = [data => { data.counts.datasetCount++; }, data => { data.counts.statementParticipations++; }, data => { data.counts.distinctLegajos = 3; },
    data => { data.counts.lineCount++; }, data => { data.counts.conceptCount++; }, data => { data.rows[0].sourceRows++; },
    data => { data.rows[0].distinctLegajos = 2; }, data => { data.rows[0].missingAmounts = 3; }, data => { data.rows[0].missingQuantities = -1; },
    data => { data.rows[1].code = '001'; }, data => { data.counts.lineCount = null; }, data => { data.counts.distinctLegajos = 0; }];
  for (const mutate of mutations) { const data = summary(); mutate(data); assert.throws(() => validateMonthlySourceResponse(data, query()), code('SOURCE_DRIFT')); }
});
test('missing amounts and quantities stay null; unknown can never become zero or a partial total', () => {
  for (const [field, missingKey] of [['amount', 'missingAmounts'], ['quantity', 'missingQuantities']]) {
    for (const value of ['0.00', '1.00']) { const data = summary(); data.rows[1][field] = value; assert.throws(() => validateMonthlySourceResponse(data, query()), code('SOURCE_DRIFT')); }
    const unexpectedNull = summary(); unexpectedNull.rows[0][field] = null; assert.throws(() => validateMonthlySourceResponse(unexpectedNull, query()), code('SOURCE_DRIFT'));
    const missing = summary(); missing.rows[1][field] = '0.00'; missing.rows[1][missingKey] = 0;
    assert.equal(validateMonthlySourceResponse(missing, query()).rows[1][field], '0.00');
  }
});
test('numeric(24,2) decimals retain 22 integer digits and cents through BigInt without Number rounding', () => {
  for (const value of ['0.00', '-0.01', '9007199254740993.01', '9999999999999999999999.99', '-9999999999999999999999.99']) {
    assert.equal(monthlySourceDecimal(value), BigInt(value.replace('.', '')));
    const data = summary(); data.rows[0].amount = value; assert.equal(validateMonthlySourceResponse(data, query()).rows[0].amount, value);
  }
  for (const value of [0, 1.1, '1', '1.0', '1.000', '01.00', '+1.00', '-0.00', '1e2', '10000000000000000000000.00', 'NaN', 'Infinity', ' 1.00']) {
    assert.throws(() => monthlySourceDecimal(value), code('SOURCE_DRIFT'));
  }
});
test('source timestamps preserve microsecond distinctions and reject normalized impossible dates', () => {
  const data = summary(); data.sources[1].importedAt = '2026-09-14T07:00:01.123457Z';
  const result = validateMonthlySourceResponse(data, query()); assert.notEqual(result.sources[0].importedAt, result.sources[1].importedAt);
  for (const timestamp of ['2026-02-30T07:00:00.000000Z', '2026-09-14T24:00:00Z', '2026-09-14T07:60:00Z', '2026-09-14T07:00:01.1234567Z', '2026-09-14 07:00:00', '2026-09-14T07:00:00']) {
    const invalid = summary(); invalid.sources[0].importedAt = timestamp; assert.throws(() => validateMonthlySourceResponse(invalid, query()), code('SOURCE_DRIFT'));
  }
});
test('catalog/concept caps reject excess instead of truncating and integer count overflow is rejected', () => {
  const data = catalog(); data.items = Array.from({ length: 241 }, () => source()); data.total = 241;
  assert.throws(() => validateMonthlySourceResponse(data, query('catalog', null)), code('SOURCE_DRIFT'));
  const concepts = summary(); concepts.rows = Array.from({ length: 1001 }, () => summary().rows[0]); concepts.counts.conceptCount = 1001;
  assert.throws(() => validateMonthlySourceResponse(concepts, query()), code('SOURCE_DRIFT'));
  const overflow = summary(); overflow.sources[0].lineCount = Number.MAX_SAFE_INTEGER; overflow.sources[1].lineCount = Number.MAX_SAFE_INTEGER;
  assert.throws(() => validateMonthlySourceResponse(overflow, query()), code('SOURCE_DRIFT'));
});
test('SQL facade accepts driver rows and rejects empty, multiple or malformed envelopes', async () => {
  assert.equal((await readMonthlySourceSummary({ query: async () => ({ rows: [{ result: summary() }] }) }, access().principal, session(), query())).mode, 'summary');
  for (const result of [[], [{ result: summary() }, { result: summary() }], [{ result: null }], [{ result: 'raw text' }], {}]) {
    await assert.rejects(readMonthlySourceSummary({ query: async () => result }, access().principal, session(), query()), code('SOURCE_DRIFT'));
  }
});
test('SQL errors use only exact whitelisted codes, safe Spanish messages and contention retry guidance', async () => {
  const cases = { QUERY_INVALID: 400, SESSION_INVALID: 401, SESSION_BUSY: 409, CAPABILITY_REQUIRED: 403, SOURCE_BINDING_REQUIRED: 503,
    RELEASE_NOT_CERTIFIED: 503, NOT_FOUND: 404, MIXED_PERIOD: 409, DUPLICATE_REVISION: 409, CATALOG_CONFLICT: 409,
    SOURCE_INCOMPLETE: 503, SOURCE_DRIFT: 503, ROW_LIMIT: 422, UNAVAILABLE: 503 };
  for (const [suffix, status] of Object.entries(cases)) {
    const { handler } = setup({ getInternalSql: async () => ({ query: async () => { throw new Error('PAYROLL_MONTHLY_SOURCE_' + suffix); } }) });
    const res = response(); await handler(request(), res); assert.equal(res.statusCode, status); assert.equal(res.payload.code, code(suffix).code);
    if (suffix === 'SESSION_BUSY') assert.equal(res.headers['Retry-After'], '1');
  }
  for (const error of [new Error('SQL raw synthetic sensitive text'), new Error('PAYROLL_MONTHLY_SOURCE_SOURCE_DRIFT: raw details'),
    { code: '08006', message: 'connection string must never be returned' }]) {
    const safe = monthlySourceSafeError(error); assert.equal(safe.code, code('UNAVAILABLE').code); assert.doesNotMatch(safe.message, /raw|connection|SQL/);
  }
});
