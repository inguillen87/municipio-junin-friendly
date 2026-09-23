import assert from 'node:assert/strict';
import test from 'node:test';
import { employees, summary } from '../api/internal-data.js';
import { directoryQueryRows } from './fixtures/internal-directory-query.js';

test('summary reuses narrow effective projections without changing counts, cutoff or source metadata', async () => {
  const totals = { historical_records: 9, active: 5, inactive: 3, absence_events: 7,
    leave_records: 6, family_records: 4, sectors: 2, categories: 3, unions: 1,
    agreements: 2, active_without_sector: 1, absence_orphans: 2, leave_orphans: 1,
    suspicious_early_absences: 1, suspicious_early_leaves: 2, absences_after_source_cutoff: 3 };
  const source = { id: 44, source_name: 'synthetic', source_sha256: 'a'.repeat(64),
    source_cutoff: '2026-09-10T00:00:00Z', completed_at: '2026-09-22T00:00:00Z',
    status: 'completed', table_counts: { synthetic: 9 }, quality_flags: { pending: true } };
  const sectors = [{ label: 'Sin sector homologado', value: 9 }];
  const yearly = [{ year: 2026, events: 3, employees_affected: 2 }];
  const responses = [[totals], [source], sectors, yearly], calls = [];
  const result = await summary({ async query(text, params = []) {
    calls.push({ text, params }); return responses[calls.length - 1];
  } });
  assert.equal(calls.length, 4);
  const query = calls[0].text;
  for (const name of ['employees', 'absences', 'leaves', 'catalog_rows']) {
    assert.equal(query.match(new RegExp(`\\bgrh_effective_${name}_v1\\b`, 'g'))?.length, 1);
  }
  assert.match(query, /summary_employees AS MATERIALIZED\s*\(\s*SELECT company_id, legajo, activo, sector FROM grh_effective_employees_v1/);
  assert.match(query, /summary_absences AS MATERIALIZED\s*\(\s*SELECT company_id, legajo, fecha FROM grh_effective_absences_v1/);
  assert.match(query, /summary_leaves AS MATERIALIZED\s*\(\s*SELECT company_id, legajo, fecha_inicio FROM grh_effective_leaves_v1/);
  assert.match(query, /summary_catalog AS MATERIALIZED\s*\(\s*SELECT catalog FROM grh_effective_catalog_rows_v1/);
  assert.match(query, /FROM summary_absences a LEFT JOIN summary_employees e USING \(company_id, legajo\) WHERE e.legajo IS NULL/);
  assert.match(query, /FROM summary_leaves l LEFT JOIN summary_employees e USING \(company_id, legajo\) WHERE e.legajo IS NULL/);
  assert.match(query, /FROM summary_employees WHERE NOT activo/);
  assert.match(query, /id IN \(SELECT legacy_import_run_id FROM grh_effective_source_batch_v1\)/);
  assert.deepEqual(calls[3].params, [source.source_cutoff]);
  assert.deepEqual(result, {
    ok: true,
    source: { importId: 44, name: source.source_name, sha256: source.source_sha256,
      cutoff: source.source_cutoff, importedAt: source.completed_at, status: 'completed' },
    workforce: { historicalRecords: 9, active: 5, inactive: 3, sectors },
    absence: { totalEvents: 7, yearly }, related: { leaveRecords: 6, familyRecords: 4 },
    catalogs: { sectors: 2, sectorOptions: ['Sin sector homologado'], categories: 3, unions: 1, agreements: 2 },
    quality: { activeWithoutSector: 1, absenceOrphans: 2, leaveOrphans: 1,
      suspiciousEarlyAbsences: 1, suspiciousEarlyLeaves: 2, absencesAfterSourceCutoff: 3,
      flags: source.quality_flags, importedCounts: source.table_counts },
  });
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
