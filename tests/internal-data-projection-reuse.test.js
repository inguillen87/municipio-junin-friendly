import assert from 'node:assert/strict';
import test from 'node:test';
import { createInternalDataHandler, employees, summary } from '../api/internal-data.js';
import { directoryQueryRows } from './fixtures/internal-directory-query.js';
import { binding, principal } from './fixtures/employment-adoption-history-synthetic.js';

const summaryFixture = () => {
  const totals = { historical_records: 9, active: 5, inactive: 3, absence_events: 7,
    leave_records: 6, family_records: 4, sectors: 2, categories: 3, unions: 1,
    agreements: 2, active_without_sector: 1, absence_orphans: 2, leave_orphans: 1,
    suspicious_early_absences: 1, suspicious_early_leaves: 2, absences_after_source_cutoff: 3 };
  const source = { id: 44, source_name: 'synthetic', source_sha256: 'a'.repeat(64),
    source_cutoff: '2026-09-10T00:00:00Z', completed_at: '2026-09-22T00:00:00Z',
    status: 'completed', table_counts: { synthetic: 9 }, quality_flags: { pending: true } };
  const sectors = [{ label: 'Sin sector homologado', value: 9 }];
  const yearly = [{ year: 2026, events: 3, employees_affected: 2 }];
  return { totals, source, sectors, yearly };
};
const summaryRow = ({ totals, source, sectors, yearly }) => ({ ...totals,
  __sourceId: source?.id ?? null, __sourceName: source?.source_name ?? null,
  __sourceSha256: source?.source_sha256 ?? null, __sourceCutoff: source?.source_cutoff ?? null,
  __sourceCompletedAt: source?.completed_at ?? null, __sourceStatus: source?.status ?? null,
  __sourceTableCounts: source?.table_counts ?? null, __sourceQualityFlags: source?.quality_flags ?? null,
  __sectors: sectors, __absenceYearly: yearly,
});
const summaryExpected = ({ totals: t, source: s, sectors, yearly }) => ({
  ok: true,
  source: s ? { importId: s.id, name: s.source_name, sha256: s.source_sha256,
    cutoff: s.source_cutoff, importedAt: s.completed_at, status: s.status } : { status: 'not_imported' },
  workforce: { historicalRecords: t.historical_records, active: t.active, inactive: t.inactive, sectors },
  absence: { totalEvents: t.absence_events, yearly },
  related: { leaveRecords: t.leave_records, familyRecords: t.family_records },
  catalogs: { sectors: t.sectors, sectorOptions: sectors.map(s => s.label), categories: t.categories,
    unions: t.unions, agreements: t.agreements },
  quality: { activeWithoutSector: t.active_without_sector, absenceOrphans: t.absence_orphans,
    leaveOrphans: t.leave_orphans, suspiciousEarlyAbsences: t.suspicious_early_absences,
    suspiciousEarlyLeaves: t.suspicious_early_leaves, absencesAfterSourceCutoff: t.absences_after_source_cutoff,
    flags: s?.quality_flags || {}, importedCounts: s?.table_counts || {} },
});
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; },
  status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; } });
const handlerForSummary = (sql, extra = {}) => createInternalDataHandler({
  env: { FRIENDLY_GRH_SOURCE_DATABASE: binding.database, FRIENDLY_GRH_COMPANY_ID: String(binding.companyId) },
  requireCompatibleInternalAccess: async (_req, _res, options) => {
    assert.equal(options.allowLegacy, false);
    assert.equal(options.requireDataPlaneReady, true);
    assert.equal(options.requireCertifiedDataBinding, true);
    return { mode: 'managed', principal };
  },
  getInternalSql: async () => sql, reportReadFailure() {}, ...extra,
});
const summaryRequest = { method: 'GET', query: { resource: 'summary' } };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('summary reuses one narrow source projection and retains counts, cutoff, ordering and source metadata', async () => {
  const fixture = summaryFixture(), calls = [];
  const result = await summary({ async query(text, params = []) {
    calls.push({ text, params }); return [summaryRow(fixture)];
  } });
  assert.equal(calls.length, 1);
  const query = calls[0].text;
  for (const name of ['employees', 'absences', 'leaves', 'catalog_rows', 'family']) {
    assert.equal(query.match(new RegExp('\\bgrh_effective_' + name + '_v1\\b', 'g'))?.length, 1);
  }
  assert.equal(query.match(/\bdata_import_runs\b/g)?.length, 1);
  assert.equal(query.match(/\bgrh_effective_source_batch_v1\b/g)?.length, 1);
  assert.match(query, /summary_source AS MATERIALIZED\s*\(\s*SELECT id, source_name, source_sha256, source_cutoff, completed_at, status, table_counts, quality_flags/);
  assert.match(query, /WHERE status = 'completed'\s+AND id IN \(SELECT legacy_import_run_id FROM grh_effective_source_batch_v1\)\s+ORDER BY completed_at DESC NULLS LAST, id DESC\s+LIMIT 1/);
  assert.match(query, /summary_employees AS MATERIALIZED\s*\(\s*SELECT company_id, legajo, activo, sector FROM grh_effective_employees_v1/);
  assert.match(query, /summary_absences AS MATERIALIZED\s*\(\s*SELECT company_id, legajo, fecha FROM grh_effective_absences_v1/);
  assert.match(query, /summary_leaves AS MATERIALIZED\s*\(\s*SELECT company_id, legajo, fecha_inicio FROM grh_effective_leaves_v1/);
  assert.match(query, /summary_catalog AS MATERIALIZED\s*\(\s*SELECT catalog FROM grh_effective_catalog_rows_v1/);
  assert.match(query, /FROM summary_absences a LEFT JOIN summary_employees e USING \(company_id, legajo\) WHERE e.legajo IS NULL/);
  assert.match(query, /FROM summary_leaves l LEFT JOIN summary_employees e USING \(company_id, legajo\) WHERE e.legajo IS NULL/);
  assert.match(query, /FROM summary_employees WHERE NOT activo/);
  assert.match(query, /FROM summary_employees\s+GROUP BY COALESCE\(NULLIF\(btrim\(sector\), ''\), 'Sin sector homologado'\)/);
  assert.match(query, /count\(DISTINCT \(company_id, legajo\)\)::int AS employees_affected\s+FROM summary_absences/);
  assert.match(query, /WHERE fecha >= DATE '1990-01-01'\s+AND fecha <= COALESCE\(\(SELECT source_cutoff::date FROM summary_source\), DATE '9999-12-31'\)/);
  assert.match(query, /WHERE fecha > COALESCE\(\(SELECT source_cutoff::date FROM summary_source\), DATE '9999-12-31'\)/);
  assert.match(query, /jsonb_agg\(to_jsonb\(s\) ORDER BY s.value DESC, s.label\), '\[\]'::jsonb/);
  assert.match(query, /jsonb_agg\(to_jsonb\(y\) ORDER BY y.year\), '\[\]'::jsonb/);
  assert.match(query, /FROM \(SELECT 1\) summary_row\s+LEFT JOIN summary_source ON true/);
  assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|OFFSET)\b|\bSELECT \*\b/i);
  assert.doesNotMatch(query, /to_jsonb\(summary_source\)|jsonb_build_object\(/);
  assert.deepEqual(calls[0].params, []);
  assert.deepEqual(result, summaryExpected(fixture));
  assert.equal(result.workforce.historicalRecords, 9);
  assert.equal(result.workforce.active, 5);
  assert.equal(result.workforce.inactive, 3);
  assert.equal(Object.keys(result.source).some(k => k.startsWith('__')), false);
});

test('summary preserves typed driver dates, opaque identifiers and source nulls outside JSON aggregates', async () => {
  const fixture = summaryFixture();
  Object.assign(fixture.source, { id: '9007199254740993', source_name: null, source_sha256: null,
    source_cutoff: new Date('2026-09-10T18:05:36.123Z'), completed_at: new Date('2026-09-22T19:10:01.456Z'),
    table_counts: null, quality_flags: null });
  const result = await summary({ query: async () => [summaryRow(fixture)] });
  assert.deepEqual(result, summaryExpected(fixture));
  assert.equal(result.source.cutoff, fixture.source.source_cutoff);
  assert.equal(result.source.importedAt, fixture.source.completed_at);
  assert.equal(result.source.importId, '9007199254740993');
  assert.equal(result.source.name, null);
  assert.equal(result.source.sha256, null);
  assert.deepEqual(result.quality.flags, {});
  assert.deepEqual(result.quality.importedCounts, {});
});

test('summary retains not_imported and zero aggregates without manufacturing an import or a sector', async () => {
  const fixture = summaryFixture();
  fixture.source = null; fixture.sectors = []; fixture.yearly = [];
  fixture.totals = Object.fromEntries(Object.keys(fixture.totals).map(k => [k, 0]));
  let calls = 0;
  const result = await summary({ query: async () => { calls++; return [summaryRow(fixture)]; } });
  assert.equal(calls, 1);
  assert.deepEqual(result, summaryExpected(fixture));
  assert.deepEqual(result.source, { status: 'not_imported' });
  assert.deepEqual(result.catalogs.sectorOptions, []);
});

test('summary does not retry SQL errors or turn a missing aggregate result into an empty successful census', async () => {
  const failure = Object.assign(new Error('synthetic read failure'), { code: '57014' });
  let calls = 0;
  await assert.rejects(summary({ query: async () => { calls++; throw failure; } }), e => e === failure);
  assert.equal(calls, 1);
  await assert.rejects(summary({ query: async () => [] }), TypeError);
});

test('summary handler retains both identical effective-source bookends and waits for the final guard before responding', async () => {
  const fixture = summaryFixture(), calls = [], finalStarted = deferred(), finalReply = deferred();
  let snapshots = 0;
  const sql = { async query(text, params = []) {
    calls.push({ text, params });
    if (text.includes('effective-source:snapshot')) {
      snapshots++;
      if (snapshots === 2) { finalStarted.resolve(); await finalReply.promise; }
      return [{ token: 'b'.repeat(64) }];
    }
    return [summaryRow(fixture)];
  } };
  const res = response(), running = handlerForSummary(sql)(summaryRequest, res);
  await finalStarted.promise;
  assert.equal(calls.length, 3);
  assert.equal(res.body, undefined);
  assert.equal(calls[0].text, calls[2].text);
  assert.deepEqual(calls[0].params, [principal.tenant.id, binding.database, binding.companyId]);
  assert.deepEqual(calls[2].params, calls[0].params);
  finalReply.resolve(); await running;
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, summaryExpected(fixture));
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
});

for (const mode of ['changed', 'missing', 'revoked']) test('summary handler discards every aggregate when its final source guard is ' + mode, async () => {
  const calls = [], fixture = summaryFixture(), diagnostics = []; let snapshots = 0;
  const sql = { async query(text, params) {
    calls.push({ text, params });
    if (!text.includes('effective-source:snapshot')) return [summaryRow(fixture)];
    snapshots++;
    if (snapshots === 2 && mode === 'revoked') throw Object.assign(new Error('private revocation detail'), { code: 'IDENTITY_SESSION_INVALID' });
    if (snapshots === 2 && mode === 'missing') return [];
    return [{ token: (snapshots === 2 && mode === 'changed' ? 'c' : 'b').repeat(64) }];
  } };
  const res = response();
  await handlerForSummary(sql, { reportReadFailure: d => diagnostics.push(d) })(summaryRequest, res);
  assert.equal(calls.length, 3);
  assert.equal(snapshots, 2);
  assert.equal(res.code, mode === 'revoked' ? 401 : 503);
  assert.equal(res.body.code, mode === 'changed' ? 'GRH_SOURCE_CHANGED' : mode === 'revoked' ? 'IDENTITY_SESSION_INVALID' : 'INTERNAL_DATA_UNAVAILABLE');
  assert.equal(res.body.workforce, undefined);
  assert.equal(res.body.source, undefined);
  assert.equal(diagnostics.length, 1);
  assert.doesNotMatch(JSON.stringify([res.body, diagnostics]), /synthetic_grh|private revocation detail|historical_records|__source/);
});

test('summary handler rejects a missing initial source without querying any aggregate', async () => {
  let calls = 0;
  const res = response();
  await handlerForSummary({ query: async text => { calls++; assert.match(text, /effective-source:snapshot/); return []; } })(summaryRequest, res);
  assert.equal(calls, 1);
  assert.equal(res.code, 503);
  assert.equal(res.body.workforce, undefined);
});

test('summary handler preserves access denial and performs no SQL', async () => {
  let calls = 0;
  const res = response();
  await handlerForSummary({ query: async () => { calls++; throw Error('unreachable'); } }, {
    requireCompatibleInternalAccess: async (_req, out, options) => {
      assert.equal(options.allowLegacy, false);
      assert.equal(options.requireCertifiedDataBinding, true);
      out.status(403).json({ ok: false, code: 'SYNTHETIC_DENIED' }); return null;
    },
  })(summaryRequest, res);
  assert.equal(calls, 0);
  assert.equal(res.code, 403);
});

test('summary handler reports one safe read failure without retrying or exposing source data', async () => {
  let calls = 0; const diagnostics = [], res = response();
  await handlerForSummary({ query: async text => {
    calls++;
    if (text.includes('effective-source:snapshot')) return [{ token: 'b'.repeat(64) }];
    throw Object.assign(new Error('private fixture payload must stay private'), { code: '57014' });
  } }, { reportReadFailure: d => diagnostics.push(d) })(summaryRequest, res);
  assert.equal(calls, 2);
  assert.equal(res.code, 503);
  assert.equal(res.body.code, 'INTERNAL_DATA_UNAVAILABLE');
  assert.equal(res.body.source, undefined);
  assert.equal(res.body.workforce, undefined);
  assert.equal(diagnostics[0].sqlstate, '57014');
  assert.doesNotMatch(JSON.stringify([res.body, diagnostics]), /private fixture|__source|synthetic_grh/);
});

test('one directory read reuses the source and retains tenant, GRH join, cohort and pagination bindings', async () => {
  const calls = [];
  const binding = { database: 'synthetic_grh', companyId: 9, tenantId: '00000000-0000-4000-8000-000000000001' };
  const result = await employees({ async query(text, params) {
    calls.push({ text, params });
    return directoryQueryRows();
  } }, { query: { status: 'administrative_active', includeFacets: '1', page: '2', limit: '25' } }, binding);
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  for (const { text, params } of calls) {
    assert.equal(text.match(/\bgrh_effective_employees_v1\b/g)?.length, 1);
    assert.match(text, /directory_employees AS MATERIALIZED\s*\(\s*SELECT company_id, legajo, nombre, sector, categoria, convenio, cargo\s+FROM grh_effective_employees_v1/);
    assert.match(text, /LEFT JOIN directory_employees employee\s+ON employee.company_id = contract.legacy_company_id\s+AND employee.legajo = contract.legacy_legajo\s+AND contract.source_system = 'GRH'/);
    assert.match(text, /source_batch.source_database=\$1::text AND contract.legacy_company_id=\$2::bigint/);
    assert.match(text, /contract.tenant_id=\$3::uuid/);
    assert.deepEqual(params.slice(0, 3), [binding.database, binding.companyId, binding.tenantId]);
    assert.doesNotMatch(text, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER)\b/i);
  }
  const pageQuery = calls.find(({ text }) => text.includes('LIMIT $'));
  assert.match(pageQuery.text, /directory.activo IS TRUE/);
  assert.deepEqual(pageQuery.params.slice(-2), [25, 25]);
  assert.match(calls[0].text, /SELECT DISTINCT f.employment_contract_id/);
  assert.match(calls[0].text, /AND f.payroll_date >= \(SELECT month FROM closed_month\)/);
  assert.match(calls[0].text, /AND f.payroll_date < \(SELECT month FROM closed_month\) \+ interval '1 month'/);
  assert.match(calls[0].text, /AND r.payroll_date >= \(SELECT month FROM closed_month\)/);
  assert.match(calls[0].text, /LEFT JOIN directory_page ON true\s+ORDER BY directory_page\."__pageOrder" NULLS LAST/);
  assert.equal(result.payload.scope.authority, 'GRH_AND_MUNICONTROL');
  assert.deepEqual(result.payload.facets, { sectors: [], organizations: [], agreements: [] });
});

test('directory preserves typed dates/numeric values and strips all internal metadata from every row', async () => {
  const entered = new Date('2021-04-01T00:00:00Z'), cutoff = new Date('2026-09-10T18:05:36Z');
  const row = { contractId: '00000000-0000-4000-8000-000000000001', nombre: 'Synthetic employee',
    legajo: '7', fechaIngreso: entered, fechaEgreso: null, crosswalkConfidence: '0.9500',
    sourceSystem: 'GRH', sourceBatchId: 'private', sourceCutoff: cutoff };
  const rows = directoryQueryRows({ rows: [row, { ...row, contractId: '00000000-0000-4000-8000-000000000002' }],
    total: 28, scope: { totalContracts: 31, activeContracts: 28, sourceCutoffFrom: cutoff, sourceCutoffTo: cutoff },
    sectors: [{ value: 'All source sectors', count: 31 }] });
  // JSON scope timestamps differ in representation; the typed columns are authoritative.
  for (const r of rows) r.__scope = { ...r.__scope, sourceCutoffFrom: '2026-09-10T18:05:36+00:00', sourceCutoffTo: '2026-09-10T18:05:36+00:00' };
  const result = await employees({ async query() { return rows; } }, { query: { status: 'all', page: '2', limit: '25' } });
  assert.equal(result.payload.data.length, 2);
  assert.equal(result.payload.data[0].fechaIngreso, entered);
  assert.equal(result.payload.data[0].crosswalkConfidence, '0.9500');
  assert.equal(result.payload.operational.sourceCutoffFrom, cutoff.toISOString());
  assert.equal(result.payload.scope.totalContracts, 31);
  assert.deepEqual(result.payload.pagination, { page: 2, limit: 25, total: 28, pages: 2 });
  for (const r of result.payload.data) {
    assert.equal(Object.keys(r).some((key) => key.startsWith('__')), false);
    assert.equal('sourceBatchId' in r, false);
  }
});

test('empty or out-of-range page retains source-wide counts and facets without inventing a row', async () => {
  for (const total of [0, 31]) {
    const result = await employees({ async query() { return directoryQueryRows({ total,
      scope: { totalContracts: 31, activeContracts: 14 }, sectors: [{ value: 'Synthetic', count: 31 }] }); } },
    { query: { page: '999', limit: '25', search: 'Synthetic', includeFacets: '1' } });
    assert.deepEqual(result.payload.data, []);
    assert.equal(result.payload.pagination.total, total);
    assert.equal(result.payload.scope.totalContracts, 31);
    assert.deepEqual(result.payload.facets.sectors, [{ value: 'Synthetic', count: 31 }]);
  }
});

test('missing combined-query metadata fails closed instead of reporting an empty directory', async () => {
  for (const rows of [[], [{}], [{ __scope: {}, __sectors: [], __organizations: [] }]]) {
    await assert.rejects(employees({ async query() { return rows; } }, { query: {} }), { code: 'DIRECTORY_RESULT_INVALID' });
  }
});
