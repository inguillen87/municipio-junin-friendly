import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GRH_PUBLICATION_LOCKS } from '../scripts/lib/grh-publication-lock.mjs';
import { getGrhSourceProfile } from '../scripts/lib/grh-source-profile.mjs';

import { importGrhCoreWithinTransaction, preflightGrhCore, runGrhCoreCliTransaction } from '../scripts/import-grh-core-canonical.mjs';

const run = promisify(execFile);
const importer = new URL('../scripts/import-grh-core-canonical.mjs', import.meta.url);
const BATCH_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const RUN_ID = '7';
const SHA = 'CB5C60A0E5DD2462AB7D5E89BA4FE9B7F57B9283AEEB0F89F7C8918730359E92';
const PRIVATE_DETAIL = 'private-person private-path postgres://user:secret@invalid/private';
const FILES = {
  payrollRuns: 'grh-core-payroll-runs.json',
  payrollSnapshot: 'grh-core-payroll-snapshot.json',
  movements: 'grh-core-movements.json',
  payrollMonthly: 'grh-core-payroll-monthly.json',
  employmentReconciliation: 'grh-core-employment-reconciliation.json',
};
const PHASES = [
  'core_artifact_staging', 'core_payroll_runs', 'core_payroll_snapshot', 'core_movements',
  'core_payroll_monthly', 'core_reconciliation', 'core_quality_issues', 'core_verified',
];
const digest = (value) => createHash('sha256').update(value).digest('hex');
const employeeKey = (index) => ({ companyCode: 1, employeeNumber: String(10000 + index) });

// All source/count gates stay enabled. Database responses below are a client
// double; real PostgreSQL rollback and constraint evidence belongs to local QA.
async function fixture(t, mutateManifest = () => {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'grh-core-unit-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.match(path.basename(directory), /^grh-core-unit-/);
    await rm(directory, { recursive: true, force: true });
  });
  const dataDir = pathToFileURL(`${directory}${path.sep}`);
  const snapshot = Array.from({ length: 854 }, (_, index) => ({
    sourceKey: employeeKey(index), payrollDate: '2026-08-31', period: 2026, month: 8, payrollType: 'M',
  }));
  const reconciliation = Array.from({ length: 2450 }, (_, index) => ({
    sourceKey: employeeKey(index), administrativeActive: index < 882, liquidatedCurrent: index < 854,
    evidenceStatus: index < 854 ? 'active_liquidated_current'
      : index < 882 ? 'active_not_liquidated_never_observed' : 'administrative_inactive',
    lastPayrollDate: index < 854 ? '2026-08-31' : null,
  }));
  const rows = {
    payrollRuns: [7, 8].map((month) => ({
      sourceKey: { companyCode: 1, payrollDate: `2026-0${month}-31`, period: 2026, month, payrollType: 'M' },
      sourceClosureFlag: month === 7 ? 1 : null, closureStatus: month === 7 ? 'closed' : 'open',
      executivePublishable: month === 7, sourceDateIg: null,
    })),
    payrollSnapshot: snapshot,
    movements: [{ sourceKey: { ...employeeKey(0), year: 2026, month: 8, conceptCode: '1', costCenterCode: '1' } }],
    payrollMonthly: Array.from({ length: 856 }, (_, index) => ({
      sourceKey: { ...employeeKey(index), payrollDate: '2026-07-31', period: 2026, month: 7, payrollType: 'M' },
      itemCount: 1, quantitySum: '1', technicalSourceAmountSum: '1', sourceTotals: { netPayable: '1' },
      qualityFlags: [], distinctConcepts: 1,
    })),
    employmentReconciliation: reconciliation,
  };
  const manifest = {
    schemaVersion: 1, profile: 'grh-core-junin-2026-08',
    source: { sha256: SHA, currentPayrollDate: '2026-08-31', currentPayrollClosureStatus: 'open',
      latestClosedPayrollDate: '2026-07-31' },
    sourceCounts: { calculo: 4363790, concepto: 294, histocal: 625, histolegajo: 854, legajo: 2450, legamov: 489681 },
    reconciliation: { administrativeActive: 882, liquidatedCurrent: 854, activeNotLiquidated: 28,
      liquidatedNotActive: 0, activeAndLiquidated: 854 },
    quality: { strictSnapshot: true, crossSourceJoinByIdPersona: 0,
      moneySemantics: 'technicalSourceAmountSum is never a financial KPI',
      payrollRunClosure: { currentRun: 'open', latestClosedDate: '2026-07-31', executiveFinancialRule: 'closureStatus=closed' },
      invalidCalculationDatesExcluded: { records: 0 }, invalidMovementYearsExcluded: { records: 0 },
      invalidPayrollRunDatesExcluded: { records: 0 } },
    methodology: ['Synthetic unit fixture'], outputs: {},
  };
  for (const [name, records] of Object.entries(rows)) {
    const content = `[\n${records.map((record) => JSON.stringify(record)).join(',\n')}\n]\n`;
    await writeFile(new URL(FILES[name], dataDir), content);
    manifest.outputs[name] = { file: FILES[name], records: records.length,
      bytes: Buffer.byteLength(content), sha256: digest(content) };
  }
  mutateManifest(manifest);
  await writeFile(new URL('grh-core-manifest.json', dataDir), JSON.stringify(manifest));
  return { directory, dataDir, manifest, rows };
}

function expectedCounts(manifest) {
  return {
    artifact_staging: 5, payroll_runs: manifest.outputs.payrollRuns.records,
    payroll_snapshot: 854, payroll_monthly: manifest.outputs.payrollMonthly.records,
    movements: manifest.outputs.movements.records, reconciliation: 2450,
    administrative_active: 882, closed_liquidated_current: 0, preliquidated_current: 854,
    active_not_liquidated: 28, latest_closed_date: '2026-07-31', latest_closed_headcount: 856,
  };
}

function clientDouble(manifest, options = {}) {
  const calls = [], writes = [];
  const client = {
    calls, writes,
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/\b(?:INSERT INTO|UPDATE |DELETE |TRUNCATE )/.test(sql)) writes.push({ sql, values });
      if (options.reject?.test(sql)) throw new Error(PRIVATE_DETAIL);
      if (sql.startsWith('SAVEPOINT') && options.inTransaction === false) throw new Error(PRIVATE_DETAIL);
      if (/pg_try_advisory_xact_lock/.test(sql)) return { rows: [{ acquired: options.lockAvailable ?? true }] };
      if (/FROM source_import_batch batch/.test(sql)) {
        return options.batchMissing ? { rowCount: 0, rows: [] } : {
          rowCount: 1, rows: [{ id: BATCH_ID, source_database: 'grh_junin', source_sha256: SHA, import_run_id: RUN_ID,
            ...options.batchRow }],
        };
      }
      if (/information_schema.tables/.test(sql)) return { rowCount: 9, rows: [] };
      if (/FROM employment_contract\s+WHERE/.test(sql)) return { rows: [{ records: options.contractCount ?? 2450 }] };
      if (/AS cohort_collision/.test(sql)) return { rows: [{ cohort_collision: options.collision ?? false }] };
      if (/AS matching/.test(sql)) return { rows: [{ matching: 5 }] };
      if (/AS input_count/.test(sql)) {
        const records = JSON.parse(values[1]).length;
        return { rows: [{ input_count: records,
          resolved_count: options.unresolved?.test(sql) ? records - 1 : records, missing_run_count: 0 }] };
      }
      if (/AS artifact_staging/.test(sql)) return { rows: [{ ...expectedCounts(manifest), ...options.counts }] };
      if (/source_payload \? 'nominalAmountSum'/.test(sql)) return { rows: [{ records: 0 }] };
      return { rowCount: 0, rows: [] };
    },
  };
  return client;
}

async function verifiedFixture(t, options) {
  const value = await fixture(t);
  return { ...value, source: await preflightGrhCore({ dataDir: value.dataDir }),
    client: clientDouble(value.manifest, options) };
}

function assertNoLifecycle(client) {
  for (const { sql } of client.calls) assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\b/);
}

test('importing the module has no CLI, filesystem-source or connection side effects', async () => {
  const { stdout, stderr } = await run(process.execPath, ['--input-type=module', '-e',
    `const m = await import(${JSON.stringify(importer.href)}); process.stdout.write(Object.keys(m).sort().join(','));`],
  { env: { ...process.env, DATABASE_URL_UNPOOLED: '', DATABASE_URL: '' } });
  assert.equal(stdout, 'importGrhCoreWithinTransaction,importGrhOperationalSnapshotWithinTransaction,preflightGrhCore,runGrhCoreCliTransaction');
  assert.equal(stderr, '');
});

test('preflight verifies fixed artifacts and freezes its provenance, without database access', async (t) => {
  const { dataDir, manifest } = await fixture(t);
  const source = await preflightGrhCore({ dataDir });
  assert.equal(source.artifacts.payrollSnapshot.records, 854);
  assert.equal(source.artifacts.employmentReconciliation.records, 2450);
  assert.equal(source.manifestSha256, digest(JSON.stringify(manifest)));
  assert.ok(source.logicalBytes > source.rowOverheadEstimate);
  assert.ok(Object.isFrozen(source.manifest.source));
  assert.ok(Object.isFrozen(source.artifacts.payrollMonthly.descriptor));
  assert.throws(() => { source.manifest.source.currentPayrollDate = '2026-09-30'; }, TypeError);
});

for (const [name, mutate, code] of [
  ['September profile', (m) => { m.profile = 'grh-core-junin-2026-09'; }, 'UNSUPPORTED_PROFILE'],
  ['September date under August profile', (m) => { m.source.currentPayrollDate = '2026-09-30'; }, 'INVALID_CURRENT_PAYROLL_DATE'],
  ['source drift', (m) => { m.quality.strictSnapshot = false; }, 'STRICT_SNAPSHOT_REQUIRED'],
  ['source counts', (m) => { m.sourceCounts.legajo++; }, 'SOURCE_COUNTS_MISMATCH'],
  ['another source', (m) => { m.source.database = PRIVATE_DETAIL; }, 'INVALID_SOURCE_DATABASE'],
  ['forbidden person join', (m) => { m.quality.crossSourceJoinByIdPersona = 1; }, 'CROSS_SOURCE_ID_JOIN_FORBIDDEN'],
  ['changed closure', (m) => { m.source.latestClosedPayrollDate = '2026-08-31'; }, 'PAYROLL_CLOSURE_MISMATCH'],
  ['path traversal', (m) => { m.outputs.payrollMonthly.file = '../private.json'; }, 'UNEXPECTED_ARTIFACT_FILENAME'],
  ['absolute file URL', (m) => { m.outputs.payrollMonthly.file = 'file:///private.json'; }, 'UNEXPECTED_ARTIFACT_FILENAME'],
]) test(`preflight rejects ${name} without exposing source values`, async (t) => {
  const { dataDir } = await fixture(t, mutate);
  await assert.rejects(preflightGrhCore({ dataDir }), { code: `GRH_CORE_${code}` });
});

test('preflight rejects a non-file directory URL or ordinary filesystem string', async () => {
  for (const dataDir of [new URL('https://invalid/private/'), 'C:/private/', new URL('file:///private.json')]) {
    await assert.rejects(preflightGrhCore({ dataDir }), { code: 'GRH_CORE_FILE_DIRECTORY_URL_REQUIRED' });
  }
});

test('September preflight is explicit and verified but cannot authorize core history writes',async(t)=>{
  const value=await fixture(t);
  const profile=getGrhSourceProfile('grh-junin-2026-09-10');
  const manifest=value.manifest;
  manifest.profile=profile.core.profileId;
  manifest.source={sha256:profile.source.sha256,database:profile.source.database,dumpCompletedAt:profile.source.cutoff,
    currentPayrollDate:profile.source.currentPayrollDate,currentPayrollClosureStatus:'open',
    latestClosedPayrollDate:profile.source.latestClosedPayrollDate};
  manifest.sourceCounts=structuredClone(profile.core.expectedCounts);
  manifest.reconciliation=structuredClone(profile.core.expectedReconciliation);
  manifest.quality.payrollRunClosure.latestClosedDate=profile.source.latestClosedPayrollDate;
  value.rows.payrollSnapshot=value.rows.payrollSnapshot.slice(0,847).map(row=>({...row,payrollDate:'2026-09-30',month:9}));
  value.rows.employmentReconciliation=Array.from({length:2452},(_,index)=>({sourceKey:employeeKey(index),
    administrativeActive:index<875,liquidatedCurrent:index<847,evidenceStatus:index<847?'active_liquidated_current':
      index<875?'active_not_liquidated_never_observed':'administrative_inactive',lastPayrollDate:index<847?'2026-09-30':null}));
  for(const [name,rows] of Object.entries(value.rows)) {
    const content=`[\n${rows.map(row=>JSON.stringify(row)).join(',\n')}\n]\n`;
    await writeFile(new URL(FILES[name],value.dataDir),content);
    manifest.outputs[name]={file:FILES[name],records:rows.length,bytes:Buffer.byteLength(content),sha256:digest(content)};
  }
  await writeFile(new URL('grh-core-manifest.json',value.dataDir),JSON.stringify(manifest));
  await assert.rejects(preflightGrhCore({dataDir:value.dataDir}),{code:'GRH_CORE_UNSUPPORTED_PROFILE'});
  const source=await preflightGrhCore({dataDir:value.dataDir,profileId:profile.id});
  assert.equal(source.artifacts.payrollSnapshot.records,847);
  assert.equal(source.artifacts.employmentReconciliation.records,2452);
  const client=clientDouble(manifest);
  await assert.rejects(importGrhCoreWithinTransaction({client,source,batchId:BATCH_ID,importRunId:RUN_ID}),
    {code:'GRH_CORE_SOURCE_REPLACEMENT_COORDINATION_REQUIRED'});
  assert.equal(client.writes.length,0);
  assert.equal(client.calls.some(({sql})=>sql.includes('FROM source_import_batch batch')),false);
  manifest.source.sha256=profile.source.gzipSha256;
  await writeFile(new URL('grh-core-manifest.json',value.dataDir),JSON.stringify(manifest));
  await assert.rejects(preflightGrhCore({dataDir:value.dataDir,profileId:profile.id}),{code:'GRH_CORE_SOURCE_SHA256_PROFILE_MISMATCH'});
});

test('the transaction is required before batch lookup, artifact reads or writes', async () => {
  const client = clientDouble({}, { inTransaction: false });
  await assert.rejects(importGrhCoreWithinTransaction({ client, batchId: BATCH_ID, importRunId: RUN_ID }),
    { code: 'GRH_CORE_TRANSACTION_REQUIRED' });
  assert.deepEqual(client.calls.map(({ sql }) => sql), ['SAVEPOINT grh_core_external_transaction']);
  assert.equal(client.writes.length, 0);
});

test('explicit source IDs are mandatory and invalid values never reach SQL parameters', async () => {
  for (const [batchId, importRunId, code] of [
    [undefined, RUN_ID, 'EXPLICIT_BATCH_ID_REQUIRED'],
    [PRIVATE_DETAIL, RUN_ID, 'EXPLICIT_BATCH_ID_REQUIRED'],
    [BATCH_ID, undefined, 'EXPLICIT_IMPORT_RUN_ID_REQUIRED'],
    [BATCH_ID, '0', 'EXPLICIT_IMPORT_RUN_ID_REQUIRED'],
    [BATCH_ID, '9223372036854775808', 'EXPLICIT_IMPORT_RUN_ID_REQUIRED'],
    [BATCH_ID, Number.MAX_SAFE_INTEGER + 1, 'EXPLICIT_IMPORT_RUN_ID_REQUIRED'],
  ]) {
    const client = clientDouble({});
    await assert.rejects(importGrhCoreWithinTransaction({ client, batchId, importRunId }), { code: `GRH_CORE_${code}` });
    assert.ok(client.calls.every(({ values }) => values.length === 0));
    assert.equal(client.writes.length, 0);
    assertNoLifecycle(client);
  }
});

test('successful execution keeps transaction ownership with its caller and scopes all SQL joins', async (t) => {
  const { client, source } = await verifiedFixture(t);
  const checkpoints = [];
  const result = await importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID,
    checkpoint: async (phase, evidence) => { checkpoints.push({ phase, evidence }); } });
  assert.deepEqual(checkpoints.map(({ phase }) => phase), PHASES);
  assert.equal(result.batchId, BATCH_ID);
  assert.equal(result.importRunId, RUN_ID);
  assert.equal(result.counts.reconciliation, 2450);
  assertNoLifecycle(client);
  assert.match(client.calls[0].sql, /^SAVEPOINT /);
  assert.match(client.calls[1].sql, /^RELEASE SAVEPOINT /);
  assert.deepEqual(client.calls.filter(({ sql }) => /pg_try_advisory_xact_lock/.test(sql)).map(({ values }) => values[0]),
    GRH_PUBLICATION_LOCKS);
  const provenance = client.calls.find(({ sql }) => sql.includes('FROM source_import_batch batch'));
  assert.deepEqual(provenance.values, [BATCH_ID, SHA, RUN_ID, null]);
  assert.match(provenance.sql, /batch\.id = \$1::uuid/);
  assert.match(provenance.sql, /imported\.id = \$3::bigint/);
  assert.match(provenance.sql, /batch\.source_cutoff = imported\.source_cutoff AT TIME ZONE/);
  assert.match(provenance.sql, /FOR SHARE OF batch, imported/);
  for (const table of ['payroll_snapshot_assignment', 'employment_movement', 'payroll_monthly_fact', 'employment_status_snapshot']) {
    const queries = client.calls.filter(({ sql }) => sql.includes(`INSERT INTO ${table}`));
    assert.ok(queries.length > 0);
    for (const { sql, values } of queries) {
      assert.match(sql, /JOIN employment_contract contract[\s\S]*?contract\.source_batch_id = \$1::uuid/);
      assert.equal(values[0], BATCH_ID);
    }
  }
  const reconciliation = client.calls.find(({ sql }) => sql.includes('LEFT JOIN LATERAL'));
  assert.match(reconciliation.sql, /snapshot\.source_batch_id = \$1::uuid/);
  assert.match(reconciliation.sql, /snapshot\.source_system = 'GRH'/);
  assert.doesNotMatch(JSON.stringify(checkpoints), /10000|sourceKey|file:|postgres:|private/);
});

test('a competing legacy writer rejects before sources or database writes with the shared busy code', async () => {
  const client = clientDouble({}, { lockAvailable: false });
  await assert.rejects(importGrhCoreWithinTransaction({ client, source: undefined, batchId: BATCH_ID, importRunId: RUN_ID }),
    { code: 'GRH_PUBLICATION_BUSY', message: 'GRH_PUBLICATION_BUSY' });
  assert.equal(client.writes.length, 0);
  assertNoLifecycle(client);
});

for (const [name, options, code] of [
  ['missing explicit batch', { batchMissing: true }, 'CANONICAL_BATCH_PROVENANCE_MISMATCH'],
  ['different source SHA', { batchRow: { source_sha256: 'B'.repeat(64) } }, 'CANONICAL_BATCH_PROVENANCE_MISMATCH'],
  ['different curated run', { batchRow: { import_run_id: '8' } }, 'CANONICAL_BATCH_PROVENANCE_MISMATCH'],
  ['contracts from another cohort', { contractCount: 2449 }, 'BATCH_VALIDATION_FAILED'],
  ['same snapshot date from another batch', { collision: true }, 'SNAPSHOT_COHORT_COLLISION'],
]) test(`rejects ${name} before the first core write`, async (t) => {
  const { client, source } = await verifiedFixture(t, options);
  await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID }),
    { code: `GRH_CORE_${code}` });
  assert.equal(client.writes.length, 0);
  assertNoLifecycle(client);
});

test('a matching company and legajo in a different cohort cannot silently disappear during import', async (t) => {
  const { client, source } = await verifiedFixture(t, { unresolved: /INSERT INTO employment_movement/ });
  await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID }),
    { code: 'GRH_CORE_MOVEMENTS_FAILED' });
  assert.ok(!client.calls.some(({ sql }) => sql.includes('INSERT INTO payroll_monthly_fact')));
  assertNoLifecycle(client);
});

test('optional dump cutoff is passed to the explicit batch predicate with Argentine timestamp semantics', async (t) => {
  const { dataDir, manifest } = await fixture(t, (value) => { value.source.dumpCompletedAt = '2026-08-06T15:15:21'; });
  const client = clientDouble(manifest);
  const source = await preflightGrhCore({ dataDir });
  await importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID });
  const provenance = client.calls.find(({ sql }) => sql.includes('FROM source_import_batch batch'));
  assert.equal(provenance.values[3], '2026-08-06T15:15:21');
  assert.match(provenance.sql, /\$4::timestamp AT TIME ZONE 'America\/Argentina\/Buenos_Aires'/);
  assert.match(provenance.sql, /THEN \$4::timestamptz/);
});

test('invalid optional source cutoff rejects without echoing its value or writing', async (t) => {
  const { dataDir, manifest } = await fixture(t, (value) => { value.source.dumpCompletedAt = PRIVATE_DETAIL; });
  const client = clientDouble(manifest);
  const source = await preflightGrhCore({ dataDir });
  await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID }),
    { code: 'GRH_CORE_INVALID_SOURCE_CUTOFF', message: 'GRH_CORE_INVALID_SOURCE_CUTOFF' });
  assert.equal(client.writes.length, 0);
});

test('September payroll records cannot enter under an otherwise valid August manifest', async (t) => {
  const { dataDir, manifest, rows } = await fixture(t);
  rows.payrollRuns[1].sourceKey.payrollDate = '2026-09-30';
  rows.payrollRuns[1].sourceKey.month = 9;
  const content = `[\n${rows.payrollRuns.map((record) => JSON.stringify(record)).join(',\n')}\n]\n`;
  await writeFile(new URL(FILES.payrollRuns, dataDir), content);
  manifest.outputs.payrollRuns.bytes = Buffer.byteLength(content);
  manifest.outputs.payrollRuns.sha256 = digest(content);
  await writeFile(new URL('grh-core-manifest.json', dataDir), JSON.stringify(manifest));
  const source = await preflightGrhCore({ dataDir });
  const client = clientDouble(manifest);
  await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID }),
    { code: 'GRH_CORE_PAYROLL_DATE_OUTSIDE_AUGUST_PROFILE' });
  assert.ok(!client.writes.some(({ sql }) => sql.includes('INSERT INTO payroll_run')));
  assertNoLifecycle(client);
});

test('a database rejection is sanitized and stops later import phases', async (t) => {
  const { client, source } = await verifiedFixture(t, { reject: /INSERT INTO employment_movement/ });
  await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID }),
    { code: 'GRH_CORE_MOVEMENTS_FAILED', message: 'GRH_CORE_MOVEMENTS_FAILED' });
  assert.ok(!client.calls.some(({ sql }) => sql.includes('INSERT INTO payroll_monthly_fact')));
  assertNoLifecycle(client);
});

test('final cohort counts cannot be weakened or bypassed by a successful write', async (t) => {
  const { client, source } = await verifiedFixture(t, { counts: { preliquidated_current: 855 } });
  const phases = [];
  await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID,
    checkpoint: async (phase) => { phases.push(phase); } }), { code: 'GRH_CORE_DATABASE_VERIFICATION_FAILED' });
  assert.ok(!phases.includes('core_verified'));
  assertNoLifecycle(client);
});

test('quality issue replay filters the exact dedupe keys before requesting mock sequence IDs', async (t) => {
  const { dataDir, manifest, rows } = await fixture(t, (value) => {
    value.quality.invalidCalculationDatesExcluded.records = 1;
    value.quality.invalidMovementYearsExcluded.records = 1;
    value.quality.invalidPayrollRunDatesExcluded.records = 1;
  });
  rows.payrollMonthly[0].qualityFlags = ['SOURCE_MONTH_MISMATCH', 'SOURCE_PERIOD_MISMATCH'];
  const content = `[\n${rows.payrollMonthly.map((record) => JSON.stringify(record)).join(',\n')}\n]\n`;
  await writeFile(new URL(FILES.payrollMonthly, dataDir), content);
  manifest.outputs.payrollMonthly.bytes = Buffer.byteLength(content);
  manifest.outputs.payrollMonthly.sha256 = digest(content);
  await writeFile(new URL('grh-core-manifest.json', dataDir), JSON.stringify(manifest));
  const source = await preflightGrhCore({ dataDir });
  const client = clientDouble(manifest);
  const query = client.query.bind(client);
  const zeroUuid = '00000000-0000-0000-0000-000000000000';
  const issues = new Map();
  const dedupeKey = (issue) => JSON.stringify([issue.batch, issue.entity, issue.sourceId ?? '', issue.code,
    issue.field ?? '', issue.canonicalId ?? zeroUuid]);
  let sequenceRequests = 0, observedCandidates = 0;
  client.query = async (sql, values = []) => {
    if (sql.includes('INSERT INTO data_quality_issue')) {
      const monthly = sql.includes("'calculo_monthly'");
      const guard = sql.slice(sql.indexOf('WHERE NOT EXISTS (')).replace(/\s+/g, ' ');
      assert.match(guard, /^WHERE NOT EXISTS \( SELECT 1 FROM data_quality_issue existing/);
      assert.match(guard, /existing\.source_batch_id = \$1::uuid/);
      assert.match(guard, /ON CONFLICT DO NOTHING/);
      assert.match(guard, /COALESCE\(existing\.canonical_id, '00000000-0000-0000-0000-000000000000'::uuid\)/);
      const boundRows = JSON.parse(values[1]);
      let candidates;
      if (monthly) {
        assert.match(guard, /existing\.source_entity = 'calculo_monthly'/);
        assert.match(guard, /COALESCE\(existing\.source_id, ''\) = COALESCE\(resolved\.source_id, ''\)/);
        assert.match(guard, /existing\.issue_code = flag\.value/);
        assert.match(guard, /COALESCE\(existing\.field_name, ''\) = CASE flag\.value WHEN 'SOURCE_MONTH_MISMATCH' THEN 'source_month' ELSE 'source_period' END/);
        assert.match(guard, /= COALESCE\(resolved\.contract_id, '00000000-0000-0000-0000-000000000000'::uuid\)/);
        candidates = boundRows.flatMap((row) => row.quality_flags.map((code) => ({
          batch: values[0], entity: 'calculo_monthly', sourceId: row.source_id, code,
          field: code === 'SOURCE_MONTH_MISMATCH' ? 'source_month' : 'source_period',
          canonicalId: `synthetic-contract:${row.company_code}:${row.employee_number}`,
        })));
      } else {
        assert.match(guard, /existing\.source_entity = input\.source_entity/);
        assert.match(guard, /COALESCE\(existing\.source_id, ''\) = COALESCE\(input\.source_id, ''\)/);
        assert.match(guard, /existing\.issue_code = input\.issue_code/);
        assert.match(guard, /COALESCE\(existing\.field_name, ''\) = COALESCE\(input\.field_name, ''\)/);
        assert.match(guard, /= '00000000-0000-0000-0000-000000000000'::uuid/);
        candidates = boundRows.map((row) => ({ batch: values[0], entity: row.source_entity,
          sourceId: row.source_id, code: row.issue_code, field: row.field_name, canonicalId: null }));
      }
      observedCandidates += candidates.length;
      // Model the guarded INSERT separately from nextval: existing keys never
      // reach the defaults. Local PostgreSQL QA verifies the actual sequence.
      for (const candidate of candidates) {
        const key = dedupeKey(candidate);
        if (!issues.has(key)) issues.set(key, { ...candidate, id: ++sequenceRequests });
      }
    }
    return query(sql, values);
  };
  await importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID });
  assert.equal(issues.size, 5);
  assert.equal(sequenceRequests, 5);
  const firstIds = [...issues.values()].map((issue) => issue.id);
  await importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID });
  assert.equal(observedCandidates, 10);
  assert.equal(sequenceRequests, 5);
  assert.deepEqual([...issues.values()].map((issue) => issue.id), firstIds);
  assertNoLifecycle(client);
});

test('every checkpoint can inject a failure without commit, rollback, later phases or private diagnostics', async (t) => {
  const { source, manifest } = await verifiedFixture(t);
  for (const stop of PHASES) {
    const client = clientDouble(manifest);
    const seen = [];
    await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID,
      checkpoint: async (phase) => { seen.push(phase); if (phase === stop) throw new Error(PRIVATE_DETAIL); } }),
    (error) => /^GRH_CORE_[A-Z_]+$/.test(error.message) && !error.message.includes(PRIVATE_DETAIL));
    assert.deepEqual(seen, PHASES.slice(0, PHASES.indexOf(stop) + 1));
    assertNoLifecycle(client);
  }
});

test('artifact changes after preflight reject before the first database mutation', async (t) => {
  const { client, source, dataDir } = await verifiedFixture(t);
  const file = new URL(FILES.movements, dataDir);
  await writeFile(file, (await readFile(file, 'utf8')).replace('10000', '19999'));
  await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID }),
    { code: 'GRH_CORE_PREFLIGHT_FAILED' });
  assert.equal(client.writes.length, 0);
  assertNoLifecycle(client);
});

test('manifest drift is rejected even if the modified artifacts and descriptors are internally valid', async (t) => {
  const { client, source, dataDir, manifest } = await verifiedFixture(t);
  manifest.methodology.push('Changed after verification');
  await writeFile(new URL('grh-core-manifest.json', dataDir), JSON.stringify(manifest));
  await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID }),
    { code: 'GRH_CORE_SOURCE_CHANGED_AFTER_PREFLIGHT' });
  assert.equal(client.writes.length, 0);
});

test('artifact mutation during import is detected by final revalidation before success', async (t) => {
  const { client, source, dataDir } = await verifiedFixture(t);
  const phases = [];
  await assert.rejects(importGrhCoreWithinTransaction({ client, source, batchId: BATCH_ID, importRunId: RUN_ID,
    checkpoint: async (phase) => {
      phases.push(phase);
      if (phase === 'core_quality_issues') {
        const file = new URL(FILES.movements, dataDir);
        await writeFile(file, (await readFile(file, 'utf8')).replace('10000', '19999'));
      }
    } }), { code: 'GRH_CORE_PREFLIGHT_FAILED' });
  assert.ok(!phases.includes('core_verified'));
  assertNoLifecycle(client);
});

test('the standalone CLI rejects missing explicit IDs before reading sources or connecting', async () => {
  await assert.rejects(run(process.execPath, [fileURLToPath(importer), '--confirm-isolated-branch'],
    { env: { ...process.env, DATABASE_URL_UNPOOLED: PRIVATE_DETAIL } }), (error) => {
    assert.equal(error.stdout, '');
    assert.deepEqual(JSON.parse(error.stderr), { ok: false, code: 'GRH_CORE_EXPLICIT_BATCH_ID_REQUIRED',
      committed: false, requiresLedgerReconciliation: false });
    return true;
  });
});

function lifecycleClient({ commitReplyLost = false, commitRejected = false, rollbackReplyLost = false,
  connectFailure = false, closeFailure = false } = {}) {
  const calls = [];
  let databaseCommitted = false;
  return {
    calls,
    get databaseCommitted() { return databaseCommitted; },
    async connect() { calls.push('connect'); if (connectFailure) throw new Error(PRIVATE_DETAIL); },
    async query(sql) {
      calls.push(sql);
      if (sql === 'COMMIT') {
        if (commitRejected) throw new Error(PRIVATE_DETAIL);
        databaseCommitted = true;
        if (commitReplyLost) throw new Error(PRIVATE_DETAIL);
      }
      if (sql === 'ROLLBACK' && rollbackReplyLost) throw new Error(PRIVATE_DETAIL);
      return { rows: [] };
    },
    end() { calls.push('end'); if (closeFailure) throw new Error(PRIVATE_DETAIL); return Promise.resolve(); },
  };
}

test('CLI commit response loss is explicitly uncertain and never retried or followed by rollback', async () => {
  const client = lifecycleClient({ commitReplyLost: true });
  const report = await runGrhCoreCliTransaction({ client, apply: true, operation: async (transaction) => {
    assert.equal(transaction, client);
    return { counts: { reconciliation: 2450 } };
  } });
  assert.equal(client.databaseCommitted, true, 'the mock applied the commit but lost its acknowledgement');
  assert.deepEqual(report, { ok: false, code: 'GRH_CORE_COMMIT_UNCONFIRMED', committed: null,
    rollbackConfirmed: false, requiresLedgerReconciliation: true });
  assert.deepEqual(client.calls, ['connect', 'BEGIN', 'COMMIT', 'end']);
  assert.doesNotMatch(JSON.stringify(report), /private|postgres:|secret|invalid/);
});

test('CLI cannot claim rollback merely because COMMIT returned an error', async () => {
  const client = lifecycleClient({ commitRejected: true });
  const report = await runGrhCoreCliTransaction({ client, apply: true, operation: async () => ({}) });
  assert.equal(client.databaseCommitted, false);
  assert.equal(report.committed, null, 'the client does not have a successful commit acknowledgement');
  assert.equal(report.requiresLedgerReconciliation, true);
  assert.equal(report.rollbackConfirmed, false);
  assert.deepEqual(client.calls, ['connect', 'BEGIN', 'COMMIT', 'end']);
});

test('CLI reports confirmed commit and preserves that evidence if connection cleanup fails', async () => {
  const client = lifecycleClient({ closeFailure: true });
  const report = await runGrhCoreCliTransaction({ client, apply: true,
    operation: async () => ({ counts: { reconciliation: 2450 } }) });
  assert.equal(report.ok, true);
  assert.equal(report.status, 'completed');
  assert.equal(report.committed, true);
  assert.equal(report.requiresLedgerReconciliation, false);
  assert.equal(report.rollbackConfirmed, false);
  assert.deepEqual(client.calls, ['connect', 'BEGIN', 'COMMIT', 'end']);
});

test('CLI defaults to verified rollback and never requests COMMIT without apply', async () => {
  const client = lifecycleClient();
  const report = await runGrhCoreCliTransaction({ client, operation: async () => ({ counts: { reconciliation: 2450 } }) });
  assert.equal(report.status, 'verified-rolled-back');
  assert.equal(report.committed, false);
  assert.equal(report.rollbackConfirmed, true);
  assert.equal(report.requiresLedgerReconciliation, false);
  assert.deepEqual(client.calls, ['connect', 'BEGIN', 'ROLLBACK', 'end']);
});

test('CLI rolls back once after an operation failure that precedes COMMIT', async () => {
  const client = lifecycleClient();
  const report = await runGrhCoreCliTransaction({ client, apply: true,
    operation: async () => { throw new Error(PRIVATE_DETAIL); } });
  assert.deepEqual(report, { ok: false, code: 'GRH_CORE_CLI_FAILED', committed: false,
    rollbackConfirmed: true, requiresLedgerReconciliation: false });
  assert.deepEqual(client.calls, ['connect', 'BEGIN', 'ROLLBACK', 'end']);
});

test('CLI does not retry an unconfirmed rollback or invent its confirmation', async () => {
  const client = lifecycleClient({ rollbackReplyLost: true });
  const report = await runGrhCoreCliTransaction({ client, operation: async () => ({}) });
  assert.equal(report.ok, false);
  assert.equal(report.committed, false);
  assert.equal(report.rollbackConfirmed, false);
  assert.equal(report.requiresLedgerReconciliation, false);
  assert.deepEqual(client.calls, ['connect', 'BEGIN', 'ROLLBACK', 'end']);
});

test('CLI connection failure does not attempt transactional cleanup on an unopened connection', async () => {
  const client = lifecycleClient({ connectFailure: true });
  const report = await runGrhCoreCliTransaction({ client, apply: true, operation: async () => assert.fail('must not execute') });
  assert.equal(report.committed, false);
  assert.equal(report.requiresLedgerReconciliation, false);
  assert.deepEqual(client.calls, ['connect', 'end']);
});
