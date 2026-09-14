import assert from 'node:assert/strict';
import test from 'node:test';
import { importCuratedRrhh } from '../scripts/import-rrhh-neon.mjs';
import { inspectCuratedReplay, planCuratedReplay, safeRrhhImportError } from '../scripts/lib/rrhh-import-replay.mjs';

const SHA = 'A'.repeat(64), MANIFEST = 'B'.repeat(64);
const tables = ['grh_employees', 'grh_absences', 'grh_leaves', 'grh_family', 'grh_catalog_rows'];
const catalogOutputs = {
  sectors: 'sectors', categories: 'categories', unions: 'unions', agreements: 'agreements',
  absenceReasons: 'absence_reasons', familyRelationships: 'family_relationships', jobRoles: 'job_roles',
  organizations: 'organizations', exitReasons: 'exit_reasons', employmentStatuses: 'employment_statuses',
};
function fixture() {
  const datasets = { employees: [], absences: [], leaves: [], familyMembers: [], unionMemberships: [] };
  for (const output of Object.keys(catalogOutputs)) datasets[output] = [];
  datasets.familyMembers.push({ sourceKey: { familyMemberId: '000101' },
    employeeSourceKey: { companyCode: '1', employeeNumber: '999999' }, fullName: 'Familiar sintético',
    birthDate: '2015-03-04', relationshipId: '2', sourceFields: { PRES_14: null, VENC_14: '' } });
  datasets.familyRelationships.push({ sourceKey: { relationshipId: '2' }, name: 'HIJO', code: 'H' });
  const source = { manifestSha256: MANIFEST, embeddedMemberships: 0, datasets,
    manifest: { schemaVersion: '1.0.0', profile: 'grh-junin-2026-08-06', source: {
      sha256: SHA, dumpCompletedAt: '2026-08-06T15:15:21', database: 'grh_junin',
    }, validation: { strictSnapshot: true } } };
  const sourceCounts = Object.fromEntries(Object.entries(datasets).map(([key, rows]) => [key, rows.length]));
  const catalogs = Object.fromEntries(Object.entries(catalogOutputs).map(([key, name]) => [name, datasets[key].length]));
  const critical = { employees: 2450, absences: 31572, leaves: 3448, familyMembers: 3647,
    sectors: 36, categories: 156, unions: 6, agreements: 14 };
  const expected = { sourceName: 'grh_junin_curated', sourceSha256: SHA, sourceDatabase: 'grh_junin',
    cutoff: source.manifest.source.dumpCompletedAt,
    tableCounts: { employees: 2450, absences: 31572, leaves: 3448, family: 3647, catalog_rows: 1,
      catalogs, critical, source: sourceCounts },
    qualityFlags: { schemaVersion: '1.0.0', profile: source.manifest.profile, manifestSha256: MANIFEST,
      strictSnapshot: true, allOutputHashesVerified: true,
      postgresJsonCompatibility: { escapedNullCharacters: 0,
        strategy: 'source NUL characters are preserved reversibly as the literal text \\u0000' },
      unionProjection: { strategy: 'unionMemberships with no endDate or endDate on/after source cutoff; distinct names joined with semicolon',
        embeddedMemberships: 0, activeMemberships: 0, employeesWithActiveUnion: 0 }, joins: {}, mappingNotes: [] } };
  return { source, expected };
}
function completed(expected, id = '3', overrides = {}) {
  return { id, source_name: expected.sourceName, source_sha256: SHA, cutoff_matches: true,
    status: 'completed', completed: true, quality_flags: structuredClone(expected.qualityFlags),
    table_counts: structuredClone(expected.tableCounts), ...overrides };
}
function fakeClient(expected, options = {}) {
  const calls = [], writes = [], parameters = [], logs = [];
  const client = {
    calls, writes, parameters, logs,
    async connect() { calls.push('connect'); }, async end() { calls.push('end'); },
    async query(sql, values) {
      calls.push(sql); parameters.push(values);
      if (/^\s*(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\b/i.test(sql)) {
        writes.push(sql); throw Error('UNEXPECTED_WRITE');
      }
      if (options.reject && options.reject.test(sql)) throw Error('private database detail postgres://secret.invalid credential nominal-value');
      if (/\bhas_history\b/.test(sql)) return Object.hasOwn(options, 'initializationResult')
        ? options.initializationResult : { rows: [{ has_history: false, has_curated_rows: false,
          has_batch_table: false, has_contract_table: false, ...options.initialization }] };
      if (/\bhas_canonical_rows\b/.test(sql)) return Object.hasOwn(options, 'canonicalStateResult')
        ? options.canonicalStateResult : { rows: [{ has_canonical_rows: options.canonicalRows ?? false }] };
      if (/FROM public.data_import_runs/.test(sql)) return { rows: options.runs ?? [completed(expected)] };
      if (/SELECT import_run_id::text FROM/.test(sql)) return { rows: (options.cohortIds ?? ['3']).map(import_run_id => ({ import_run_id })) };
      if (/^WITH grh_employees_expected/.test(sql)) {
        options.inspectParameters?.(values);
        return { rows: [Object.fromEntries(tables.map(table => [table, table !== options.driftTable]))] };
      }
      if (/to_regclass/.test(sql)) return { rows: [{ present: options.canonicalPresent ?? true }] };
      if (/FROM public.source_import_batch/.test(sql)) return { rows: options.canonical ?? [{ legacy_import_run_id: '3', source_database: 'grh_junin' }] };
      return { rows: [] };
    },
  };
  return client;
}

test('planner distinguishes a new source from a completed exact replay', () => {
  const { expected } = fixture();
  assert.deepEqual(planCuratedReplay([], expected), { action: 'import' });
  assert.deepEqual(planCuratedReplay([completed(expected)], expected, ['3']), { action: 'verify_replay', importRunId: '3' });
});

test('compatible failed/completed history selects the current cohort, not max ID', () => {
  const { expected } = fixture();
  const runs = [completed(expected, '9'), completed(expected, '3'), completed(expected, '1', {
    status: 'failed', table_counts: { source: expected.tableCounts.source },
  })];
  assert.deepEqual(planCuratedReplay(runs, expected, ['3']), { action: 'verify_replay', importRunId: '3' });
  assert.throws(() => planCuratedReplay(runs, expected, ['1']), { code: 'RRHH_IMPORT_REPLAY_COHORT_MISMATCH' });
});

for (const [name, change] of [
  ['manifest', run => { run.quality_flags.manifestSha256 = 'C'.repeat(64); }],
  ['profile', run => { run.quality_flags.profile = 'new-profile'; }],
  ['source provenance', run => { run.source_name = 'other_source'; }],
  ['cutoff', run => { run.cutoff_matches = false; }],
  ['recorded counts', run => { run.table_counts.family++; }],
  ['strict source evidence', run => { run.quality_flags.strictSnapshot = false; }],
  ['incomplete attempt', run => { run.status = 'running'; }],
  ['completion timestamp', run => { run.completed = false; }],
]) test(`rejects changed ${name} before projecting or writing`, async () => {
  const { expected } = fixture(), run = completed(expected); change(run);
  const client = fakeClient(expected, { runs: [run] });
  await assert.rejects(inspectCuratedReplay(client, expected, () => assert.fail('must not project')), { code: 'RRHH_IMPORT_REPLAY_REVIEW_REQUIRED' });
  assert.deepEqual(client.writes, []);
  assert.equal(client.calls.some(sql => /\bhas_history\b|\bhas_canonical_rows\b/.test(sql)), false);
  assert.equal(client.calls.at(-1), 'ROLLBACK');
});

test('a different historical revision also blocks a newer apparently matching attempt', () => {
  const { expected } = fixture(), old = completed(expected, '2');
  old.quality_flags.manifestSha256 = 'C'.repeat(64);
  assert.throws(() => planCuratedReplay([completed(expected), old], expected, ['3']), { code: 'RRHH_IMPORT_REPLAY_REVIEW_REQUIRED' });
});

test('exact CLI execution path is read-only, under the existing lock, and emits aggregate NOOP', async () => {
  const { source, expected } = fixture();
  const client = fakeClient(expected, { inspectParameters(values) {
    const family = JSON.parse(values[3]);
    assert.equal(family[0].import_run_id, '3');
    assert.equal(family[0].family_id, '000101');
    assert.deepEqual(family[0].source_payload.sourceFields, { PRES_14: null, VENC_14: '' });
    const catalog = JSON.parse(values[4]);
    assert.equal(catalog[0].label, 'HIJO');
    assert.equal(catalog[0].source_payload.code, 'H');
  } });
  const output = await importCuratedRrhh({ client, source, log: value => client.logs.push(value) });
  assert.equal(output.status, 'noop'); assert.equal(output.importRunId, '3');
  assert.equal(output.writesPerformed, false); assert.equal(output.scope, 'curated_import_only');
  assert.equal(client.calls.some(sql => /\bhas_history\b|\bhas_canonical_rows\b/.test(sql)), false);
  assert.equal(output.sourceSha256, SHA); assert.equal(output.manifestSha256, MANIFEST);
  assert.deepEqual(client.logs.map(JSON.parse), [output]);
  assert.doesNotMatch(client.logs.join(''), /Familiar sintético|999999|000101|postgres:|credential/);
  assert.deepEqual(client.writes, []);
  assert.equal(client.calls[0], 'connect');
  assert.match(client.calls[1], /^SELECT pg_advisory_lock/);
  assert.equal(client.calls[2], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.match(client.calls[3], /FROM public.data_import_runs/);
  assert.deepEqual(client.calls.slice(-3), ['ROLLBACK', 'SELECT pg_advisory_unlock(hashtext($1))', 'end']);
  const comparison = client.calls.find(sql => /^WITH/.test(sql));
  for (const table of tables) assert.match(comparison, new RegExp(`NULL::public\\.${table}`));
  assert.equal((comparison.match(/EXCEPT ALL/g) ?? []).length, 10);
});

test('several compatible legacy attempts with one coherent cohort return NOOP without changing history', async () => {
  const { source, expected } = fixture();
  const client = fakeClient(expected, { runs: [completed(expected), completed(expected, '2'), completed(expected, '1', {
    status: 'failed', table_counts: { source: expected.tableCounts.source },
  })] });
  const result = await importCuratedRrhh({ client, source, log() {} });
  assert.equal(result.importRunId, '3'); assert.equal(result.status, 'noop'); assert.deepEqual(client.writes, []);
});

test('failed historical operational flags can differ while basic provenance and active cohort remain exact', async () => {
  const { source, expected } = fixture();
  const failed = completed(expected, '1', { status: 'failed', table_counts: { partial: true }, quality_flags: {
    manifestSha256: MANIFEST, profile: expected.qualityFlags.profile, oldOperationalFlag: 'failed-before-import',
  } });
  const client = fakeClient(expected, { runs: [completed(expected), completed(expected, '2'), failed] });
  assert.equal((await importCuratedRrhh({ client, source, log() {} })).status, 'noop');
  assert.deepEqual(client.writes, []);
  failed.quality_flags.manifestSha256 = 'C'.repeat(64);
  assert.throws(() => planCuratedReplay([completed(expected), failed], expected, ['3']), { code: 'RRHH_IMPORT_REPLAY_REVIEW_REQUIRED' });
});

for (const table of tables) test(`same counts and import ID do not mask changed content in ${table}`, async () => {
  const { source, expected } = fixture(), client = fakeClient(expected, { driftTable: table });
  await assert.rejects(importCuratedRrhh({ client, source, log() { assert.fail('no success'); } }), { code: 'RRHH_IMPORT_REPLAY_COHORT_MISMATCH' });
  assert.deepEqual(client.writes, []); assert.equal(client.calls.at(-1), 'end');
});

for (const ids of [['2', '3'], [null], [], ['999']]) test(`mixed or unknown table cohort fails closed: ${JSON.stringify(ids)}`, async () => {
  const { source, expected } = fixture(), client = fakeClient(expected, { cohortIds: ids });
  await assert.rejects(importCuratedRrhh({ client, source, log() {} }), { code: 'RRHH_IMPORT_REPLAY_COHORT_MISMATCH' });
  assert.deepEqual(client.writes, []);
  assert.equal(client.calls.some(sql => /^WITH/.test(sql)), false);
});

for (const canonical of [[{ legacy_import_run_id: '2', source_database: 'grh_junin' }],
  [{ legacy_import_run_id: '3', source_database: 'other_database' }],
  [{ legacy_import_run_id: '3', source_database: 'grh_junin' }, { legacy_import_run_id: '3', source_database: 'grh_junin' }]]) {
  test('canonical provenance mismatch cannot be silently repaired by replay', async () => {
    const { source, expected } = fixture(), client = fakeClient(expected, { canonical });
    await assert.rejects(importCuratedRrhh({ client, source, log() {} }), { code: 'RRHH_IMPORT_REPLAY_COHORT_MISMATCH' });
    assert.deepEqual(client.writes, []);
  });
}

test('unpromoted exact curated import can be NOOP without claiming canonical publication', async () => {
  const { source, expected } = fixture();
  for (const options of [{ canonicalPresent: false }, { canonical: [] }]) {
    const client = fakeClient(expected, options);
    const output = await importCuratedRrhh({ client, source, log() {} });
    assert.equal(output.scope, 'curated_import_only'); assert.deepEqual(client.writes, []);
  }
});

for (const reject of [/FROM public.data_import_runs/, /^WITH/, /^ROLLBACK/]) test('inspection failure is sanitized and never falls through to import', async () => {
  const { source, expected } = fixture(), client = fakeClient(expected, { reject });
  await assert.rejects(importCuratedRrhh({ client, source, log() {} }), error => {
    assert.equal(error.code, 'RRHH_IMPORT_REPLAY_UNAVAILABLE');
    assert.doesNotMatch(error.message, /postgres:|credential|nominal-value/); return true;
  });
  assert.deepEqual(client.writes, []); assert.equal(client.calls.at(-1), 'end');
});

test('failed lock acquisition never starts history inspection or a write', async () => {
  const { source, expected } = fixture(), client = fakeClient(expected, { reject: /^SELECT pg_advisory_lock/ });
  await assert.rejects(importCuratedRrhh({ client, source, log() {} }));
  assert.deepEqual(client.writes, []); assert.equal(client.calls.length, 3); assert.equal(client.calls.at(-1), 'end');
});

for (const canonicalSchema of [false, true]) test(`empty initial database permits first import: canonical schema ${canonicalSchema}`, async () => {
  const { source, expected } = fixture(), client = fakeClient(expected, { runs: [], initialization: {
    has_batch_table: canonicalSchema, has_contract_table: canonicalSchema,
  } });
  await assert.rejects(importCuratedRrhh({ client, source, log() {} }), /UNEXPECTED_WRITE/);
  assert.equal(client.writes.length, 1); assert.match(client.writes[0], /INSERT INTO data_import_runs/);
  const attempt = client.calls.findIndex(sql => /INSERT INTO data_import_runs/.test(sql));
  assert.equal(client.calls[attempt - 1], 'ROLLBACK');
  assert.equal(client.calls.filter(sql => /\bhas_history\b/.test(sql)).length, 1);
  assert.equal(client.calls.filter(sql => /\bhas_canonical_rows\b/.test(sql)).length, Number(canonicalSchema));
});

for (const [label, options] of [
  ['any previous attempt, including failed history', { initialization: { has_history: true } }],
  ['any curated source row', { initialization: { has_curated_rows: true } }],
  ['canonical GRH batch or contract', { initialization: { has_batch_table: true, has_contract_table: true }, canonicalRows: true }],
]) test(`a new SHA cannot refresh an initialized database: ${label}`, async () => {
  const { source, expected } = fixture(), client = fakeClient(expected, { runs: [], ...options });
  await assert.rejects(importCuratedRrhh({ client, source, log() { assert.fail('no success output'); } }), error => {
    assert.equal(error.code, 'RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED');
    assert.doesNotMatch(error.message, /postgres:|credential|nominal-value/); return true;
  });
  assert.deepEqual(client.writes, []);
  assert.equal(client.calls[1], 'SELECT pg_advisory_lock(hashtext($1))');
  assert.equal(client.calls[2], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.deepEqual(client.calls.slice(-3), ['ROLLBACK', 'SELECT pg_advisory_unlock(hashtext($1))', 'end']);
  assert.equal(client.calls.some(sql => /status = 'failed'|TRUNCATE|INSERT INTO data_import_runs/.test(sql)), false);
});

for (const initialization of [
  { has_batch_table: true, has_contract_table: false },
  { has_batch_table: false, has_contract_table: true },
]) test('partially initialized canonical schema fails closed before an import run exists', async () => {
  const { source, expected } = fixture(), client = fakeClient(expected, { runs: [], initialization });
  await assert.rejects(importCuratedRrhh({ client, source, log() {} }), { code: 'RRHH_IMPORT_REPLAY_UNAVAILABLE' });
  assert.deepEqual(client.writes, []);
  assert.equal(client.calls.some(sql => /\bhas_canonical_rows\b/.test(sql)), false);
});

for (const field of ['has_history', 'has_curated_rows', 'has_batch_table', 'has_contract_table']) {
  for (const invalid of [null, undefined, 0, 'false']) test(`initialization evidence is a strict boolean: ${field}/${String(invalid)}`, async () => {
    const { expected } = fixture();
    const client = fakeClient(expected, { runs: [], initialization: { [field]: invalid } });
    await assert.rejects(inspectCuratedReplay(client, expected, () => assert.fail('no projection')), { code: 'RRHH_IMPORT_REPLAY_UNAVAILABLE' });
    assert.deepEqual(client.writes, []); assert.equal(client.calls.at(-1), 'ROLLBACK');
  });
}

for (const initializationResult of [null, {}, { rows: [] }, { rows: [{}] }, { rows: [null] },
  { rows: [{}, {}] }, { rows: 'private nominal-value' },
  { rows: { length: 1, 0: { has_history: false, has_curated_rows: false, has_batch_table: false, has_contract_table: false } } },
]) test('malformed initialization response cannot authorize writes', async () => {
  const { source, expected } = fixture(), client = fakeClient(expected, { runs: [], initializationResult });
  await assert.rejects(importCuratedRrhh({ client, source, log() {} }), { code: 'RRHH_IMPORT_REPLAY_UNAVAILABLE' });
  assert.deepEqual(client.writes, []); assert.equal(client.calls.at(-1), 'end');
});

for (const canonicalStateResult of [null, {}, { rows: [] }, { rows: [{}] }, { rows: [null] },
  { rows: [{ has_canonical_rows: false }, { has_canonical_rows: false }] },
  { rows: { length: 1, 0: { has_canonical_rows: false } } },
  ...[null, undefined, 0, 'false'].map(value => ({ rows: [{ has_canonical_rows: value }] }))]) {
  test('malformed canonical population evidence cannot authorize writes', async () => {
    const { source, expected } = fixture(), client = fakeClient(expected, { runs: [],
      initialization: { has_batch_table: true, has_contract_table: true }, canonicalStateResult });
    await assert.rejects(importCuratedRrhh({ client, source, log() {} }), { code: 'RRHH_IMPORT_REPLAY_UNAVAILABLE' });
    assert.deepEqual(client.writes, []); assert.equal(client.calls.at(-1), 'end');
  });
}

for (const reject of [/\bhas_history\b/, /\bhas_canonical_rows\b/, /^ROLLBACK/]) {
  test('initialization query or transaction failure is sanitized and cannot write a failed run', async () => {
    const { source, expected } = fixture(), client = fakeClient(expected, { runs: [], reject,
      initialization: { has_batch_table: true, has_contract_table: true } });
    await assert.rejects(importCuratedRrhh({ client, source, log() {} }), error => {
      assert.equal(error.code, 'RRHH_IMPORT_REPLAY_UNAVAILABLE');
      assert.doesNotMatch(error.message, /postgres:|credential|nominal-value/); return true;
    });
    assert.deepEqual(client.writes, []); assert.equal(client.calls.at(-1), 'end');
  });
}

test('safe errors never echo arbitrary database errors, credentials, URLs or nominal data', () => {
  assert.deepEqual(safeRrhhImportError(Error('postgres://user:secret@host nominal-value')), {
    code: 'RRHH_IMPORT_FAILED', message: 'No se pudo completar la importación. Revisá la fuente y la configuración antes de reintentar.',
  });
  const safe = safeRrhhImportError({ code: 'RRHH_IMPORT_REPLAY_COHORT_MISMATCH', message: 'secret' });
  assert.equal(safe.code, 'RRHH_IMPORT_REPLAY_COHORT_MISMATCH'); assert.doesNotMatch(safe.message, /secret/);
  const refresh = safeRrhhImportError({ code: 'RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED', message: 'postgres://secret nominal-value' });
  assert.equal(refresh.code, 'RRHH_IMPORT_REFRESH_COORDINATION_REQUIRED');
  assert.doesNotMatch(refresh.message, /secret|postgres:|nominal-value/);
});
