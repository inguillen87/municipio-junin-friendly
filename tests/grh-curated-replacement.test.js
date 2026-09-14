import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { GRH_PUBLICATION_LOCKS } from '../scripts/lib/grh-publication-lock.mjs';
import { getGrhSourceProfile } from '../scripts/lib/grh-source-profile.mjs';
import {
  GRH_CURATED_REPLACEMENT_CHECKPOINTS, replaceCuratedWithinTransaction, safeGrhCuratedReplacementError,
} from '../scripts/lib/grh-curated-replacement.mjs';

const TABLES = ['grh_employees', 'grh_absences', 'grh_leaves', 'grh_family', 'grh_catalog_rows'];
const KEYS = {
  grh_employees: ['company_id', 'legajo'], grh_absences: ['company_id', 'legajo', 'fecha'],
  grh_leaves: ['company_id', 'periodo', 'legajo', 'fecha_inicio'], grh_family: ['family_id'],
  grh_catalog_rows: ['catalog', 'source_key'],
};
const PRIVATE = 'private-person private-file postgres://private:secret@example.invalid/database';
const OLD_ID = '7';
const NEW_ID = '8';
const OLD_PROFILE = getGrhSourceProfile('grh-junin-2026-08-06');
const NEW_PROFILE = getGrhSourceProfile('grh-junin-2026-09-10');
const OLD_SHA = OLD_PROFILE.source.sha256;
const NEW_SHA = NEW_PROFILE.source.sha256;
const hash = createHash('md5').update('source_import_batch|GRH|' + OLD_SHA).digest('hex');
const BATCH_ID = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20)}`;
const clone = value => JSON.parse(JSON.stringify(value));
const code = name => `GRH_CURATED_REPLACEMENT_${name}`;
function prepared(profile, label) {
  const output = profile.curated.expectedOutputCounts, date = profile.source.cutoff.slice(0, 10), sha = profile.source.sha256;
  const catalogMapping = { sectors: 'sectors', categories: 'categories', unions: 'unions', agreements: 'agreements',
    absenceReasons: 'absence_reasons', familyRelationships: 'family_relationships', jobRoles: 'job_roles',
    organizations: 'organizations', exitReasons: 'exit_reasons', employmentStatuses: 'employment_statuses' };
  const catalogs = Object.fromEntries(Object.entries(catalogMapping).map(([name, catalog]) => [catalog, output[name]]));
  const critical = Object.fromEntries(['employees', 'absences', 'leaves', 'familyMembers', 'sectors', 'categories', 'unions', 'agreements']
    .map(name => [name, output[name]]));
  const rows = {
    grh_employees: Array.from({ length: output.employees }, (_, index) => ({ company_id: 1, legajo: String(index).padStart(5, '0'), person_id: String(index + 101), nombre: label, activo: true, source_payload: JSON.stringify({ synthetic: label }) })),
    grh_absences: Array.from({ length: output.absences }, (_, index) => ({ company_id: 1, legajo: String(index), fecha: `${date.slice(0, 7)}-01`, cantidad: '1', source_payload: JSON.stringify({ synthetic: label, kind: 'absence' }) })),
    grh_leaves: Array.from({ length: output.leaves }, (_, index) => ({ company_id: 1, legajo: String(index), periodo: 2026, fecha_inicio: '2026-01-01', source_payload: JSON.stringify({ synthetic: label, kind: 'leave' }) })),
    grh_family: Array.from({ length: output.familyMembers }, (_, index) => ({ family_id: (9007199254740993n + BigInt(index)).toString(), company_id: 1, legajo: '0010', nombre: label, source_payload: JSON.stringify({ synthetic: label, kind: 'family' }) })),
    grh_catalog_rows: Object.entries(catalogs).flatMap(([catalog, count]) => Array.from({ length: count }, (_, index) => ({ catalog, source_key: JSON.stringify({ syntheticCode: index }), label, source_payload: JSON.stringify({ synthetic: label, kind: 'catalog' }) }))),
  };
  return {
    rows,
    expected: { sourceName: 'grh_junin_curated', sourceDatabase: 'grh_junin', sourceSha256: sha, cutoff: profile.source.cutoff.replace('T', ' '),
      qualityFlags: { profile: profile.curated.profileId, strictSnapshot: true, allOutputHashesVerified: true, manifestSha256: sha.toLowerCase() },
      tableCounts: { employees: output.employees, absences: output.absences, leaves: output.leaves, family: output.familyMembers,
        catalog_rows: rows.grh_catalog_rows.length, catalogs, source: output, critical } },
    projectTables(id) { return Object.fromEntries(TABLES.map(table => [table, this.rows[table].map(row => ({ ...row, import_run_id: id }))])); },
  };
}
function fixture() {
  return { current: { importRunId: OLD_ID, batchId: BATCH_ID, prepared: prepared(OLD_PROFILE, 'before') },
    candidate: prepared(NEW_PROFILE, 'after') };
}
function typed(row) {
  const result = clone(row);
  for (const field of ['person_id', 'family_id', 'import_run_id']) {
    if (result[field] != null) result[field] = BigInt(result[field]).toString();
  }
  for (const field of ['company_id', 'periodo', 'cantidad', 'dias']) {
    if (result[field] != null) result[field] = Number(result[field]);
  }
  if (typeof result.source_payload === 'string') result.source_payload = JSON.parse(result.source_payload);
  return result;
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).sort().join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).filter(key => value[key] !== null).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function importRecord(id, expected, status = 'completed') {
  return { id, source_name: expected.sourceName, source_sha256: expected.sourceSha256.toUpperCase(), source_cutoff: expected.cutoff,
    status, completed: status === 'completed', quality_flags: clone(expected.qualityFlags), table_counts: clone(expected.tableCounts) };
}

// This is a transactional client model, not a PostgreSQL engine. It executes
// record changes and simulates outer rollback; the private integration rehearsal
// independently verifies SQL casts, constraints, locks and real rollback.
function database(input, options = {}) {
  const calls = [], writes = [];
  const initialTables = Object.fromEntries(TABLES.map(table => [table, input.current.prepared.projectTables(OLD_ID)[table].map(typed)]));
  const initial = { tables: initialTables, runs: [importRecord(OLD_ID, input.current.prepared.expected)],
    batches: [{ id: input.current.batchId, legacy_import_run_id: OLD_ID, source_sha256: input.current.prepared.expected.sourceSha256, source_database: 'grh_junin',
      source_file_name: 'grh_junin_curated', source_system: 'GRH', source_cutoff: input.current.prepared.expected.cutoff, validation_state: 'published' }],
    staging: clone(initialTables) };
  let state = clone(initial), sequence = Number(OLD_ID), active = options.active ?? true;
  const client = {
    calls, writes,
    get state() { return state; }, get sequence() { return sequence; },
    initial: clone(initial),
    rollback() { state = clone(initial); active = false; },
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (/\b(?:INSERT INTO|UPDATE public|DELETE FROM|TRUNCATE)\b/.test(sql)) writes.push({ sql, values });
      if (options.reject?.test(sql)) throw Object.assign(new Error(PRIVATE), { code: options.rejectCode ?? 'XX000' });
      if (/^(?:SAVEPOINT|RELEASE SAVEPOINT)/.test(sql)) {
        if (!active) throw Object.assign(new Error(PRIVATE), { code: '25P01' });
        return { rows: [], rowCount: 0 };
      }
      if (/pg_try_advisory_xact_lock/.test(sql)) return { rows: [{ acquired: options.lockAvailable ?? true }] };
      if (/^LOCK TABLE/.test(sql) || /:lock-contracts/.test(sql)) return { rows: [], rowCount: 0 };
      if (/:baseline-run/.test(sql)) {
        const run = state.runs.find(row => row.id === values[0]);
        return { rows: run ? [{ ...clone(run), cutoff_matches: run.source_cutoff === values[1], ...options.run }] : [] };
      }
      if (/:baseline-batch/.test(sql)) return { rows: options.missingBatch ? [] : [{ ...clone(state.batches[0]), cutoff_matches: true, deterministic_id: true, ...options.batch }] };
      if (/:baseline-contracts/.test(sql)) return { rows: [{ complete: options.contractsComplete ?? true }] };
      if (/grh-promotion:staging/.test(sql)) return { rows: [{ exact: options.stagingExact ?? canonical(state.staging) === canonical(state.tables),
        actual_count: TABLES.reduce((sum, table) => sum + state.staging[table].length, 0),
        expected_count: TABLES.reduce((sum, table) => sum + state.tables[table].length, 0) }] };
      if (/:candidate-history/.test(sql)) return { rows: [{ later_cutoff: values[1] > values[2], unseen: !(options.candidateSeen ?? false) }] };
      const projection = sql.match(/grh-curated-replacement:projection:(\w+)/);
      if (projection) {
        const table = projection[1], rows = JSON.parse(values[0]).map(typed);
        const unique = new Set(rows.map(row => JSON.stringify(KEYS[table].map(key => row[key]))));
        const valid = rows.every(row => KEYS[table].every(key => row[key] != null) && row.import_run_id === values[1]);
        return { rows: [{ records: rows.length, unique_keys: unique.size, valid: valid && options.validProjection !== false }] };
      }
      if (/FROM public.data_import_runs WHERE upper\(source_sha256\)/.test(sql)) {
        return { rows: state.runs.filter(run => run.source_sha256 === values[0].toUpperCase()).map(run => ({ ...clone(run), cutoff_matches: run.source_cutoff === values[1] })) };
      }
      if (/SELECT import_run_id::text FROM \(/.test(sql)) return { rows: [...new Set(TABLES.flatMap(table => state.tables[table].map(row => row.import_run_id)))].map(import_run_id => ({ import_run_id })) };
      if (/^WITH grh_employees_expected/.test(sql)) {
        const results = Object.fromEntries(TABLES.map((table, index) => [table, canonical(state.tables[table]) === canonical(JSON.parse(values[index]).map(typed))]));
        if (options.resultMismatch && state.runs.length > 1) results.grh_family = false;
        return { rows: [results] };
      }
      if (/to_regclass\('public.source_import_batch'\)/.test(sql)) return { rows: [{ present: true }] };
      if (/FROM public.source_import_batch WHERE source_system = 'GRH'/.test(sql)) return { rows: state.batches.filter(batch => batch.source_sha256 === values[0].toUpperCase()).map(clone) };
      if (/:create-run/.test(sql)) {
        const id = String(++sequence);
        state.runs.push(importRecord(id, { sourceName: values[0], sourceSha256: values[1], cutoff: values[2], tableCounts: JSON.parse(values[3]), qualityFlags: JSON.parse(values[4]) }, 'running'));
        return { rows: [{ id }], rowCount: 1 };
      }
      const deletion = sql.match(/grh-curated-replacement:delete:(\w+)/);
      if (deletion) {
        const table = deletion[1], before = state.tables[table].length;
        state.tables[table] = state.tables[table].filter(row => row.import_run_id !== values[0]);
        return { rows: [], rowCount: options.deleteCountMismatch ? 0 : before - state.tables[table].length };
      }
      const insertion = sql.match(/grh-curated-replacement:insert:(\w+)/);
      if (insertion) {
        const table = insertion[1], rows = JSON.parse(values[0]).map(typed);
        state.tables[table].push(...rows);
        return { rows: [], rowCount: options.insertCountMismatch ? 0 : rows.length };
      }
      if (/:complete-run/.test(sql)) {
        const run = state.runs.find(row => row.id === values[0]);
        run.status = 'completed'; run.completed = true;
        run.table_counts = JSON.parse(values[1]); run.quality_flags = JSON.parse(values[2]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error('Unmodeled query');
    },
  };
  return client;
}

test('replaces only curated projection inside the caller transaction and preserves immutable history', async () => {
  const input = fixture(), client = database(input), phases = [];
  const result = await replaceCuratedWithinTransaction({ ...input, client, checkpoint: phase => phases.push(phase) });
  assert.deepEqual(result, { status: 'replaced_in_transaction', importRunId: NEW_ID, previousImportRunId: OLD_ID,
    previousBatchId: BATCH_ID, rows: Object.fromEntries(TABLES.map(table => [table, input.candidate.rows[table].length])), committed: false, callerOwnedTransaction: true });
  assert.deepEqual(phases, GRH_CURATED_REPLACEMENT_CHECKPOINTS);
  assert.deepEqual(client.state.runs[0], client.initial.runs[0]);
  assert.deepEqual(client.state.batches, client.initial.batches);
  assert.deepEqual(client.state.staging, client.initial.staging);
  for (const table of TABLES) assert.deepEqual(client.state.tables[table], input.candidate.projectTables(NEW_ID)[table].map(typed));
  assert.equal(client.state.runs[1].status, 'completed');
  assert.equal(client.sequence, 8);
  assert.ok(client.calls.every(({ sql }) => !/^(?:BEGIN|COMMIT|ROLLBACK|END|ABORT)\b|\b(?:TRUNCATE|CASCADE|setval|RESTART IDENTITY)\b/i.test(sql)));
  assert.ok(client.writes.every(({ sql }) => /(?:INSERT INTO|DELETE FROM) public.grh_|(?:INSERT INTO|UPDATE) public.data_import_runs/.test(sql)));
  const locks = client.calls.filter(({ sql }) => /pg_try_advisory_xact_lock/.test(sql));
  assert.deepEqual(locks.map(call => call.values[0]), [...GRH_PUBLICATION_LOCKS]);
  const index = pattern => client.calls.findIndex(call => pattern.test(call.sql));
  assert.ok(index(/:lock-contracts/) < index(/^LOCK TABLE/));
  assert.ok(index(/grh-promotion:staging/) < index(/:create-run/));
  assert.ok(index(/:baseline-batch/) < index(/^LOCK TABLE/));
  assert.ok(client.calls.filter(({ sql }) => /:delete:/.test(sql)).every(({ sql, values }) => /WHERE import_run_id=\$1::bigint/.test(sql) && values[0] === OLD_ID));
});

for (const phase of GRH_CURATED_REPLACEMENT_CHECKPOINTS) {
  test(`failure at ${phase} leaves rollback to the owner, restoring all prior rows`, async () => {
    const input = fixture(), client = database(input), reached = [];
    await assert.rejects(replaceCuratedWithinTransaction({ ...input, client, checkpoint(current) {
      reached.push(current);
      if (current === phase) throw Object.assign(new Error(PRIVATE), { code: 'INJECTED_PRIVATE_CODE' });
    } }), error => error.code === code('CHECKPOINT_FAILED') && !JSON.stringify(error).includes(PRIVATE));
    assert.equal(reached.at(-1), phase);
    assert.deepEqual(client.state.runs[0], client.initial.runs[0]);
    assert.deepEqual(client.state.batches, client.initial.batches);
    assert.deepEqual(client.state.staging, client.initial.staging);
    assert.ok(client.calls.every(call => !/^(?:ROLLBACK|COMMIT|BEGIN)\b/.test(call.sql)));
    client.rollback();
    assert.deepEqual(client.state, client.initial);
    assert.equal(client.sequence, phase === 'curated:validated' ? 7 : 8, 'sequences are not transactional');
  });
}

for (const [name, options, expectedCode] of [
  ['no outer transaction', { active: false }, 'TRANSACTION_REQUIRED'],
  ['publication lock held', { lockAvailable: false }, 'BUSY'],
  ['contract row lock held', { reject: /:lock-contracts/, rejectCode: '55P03' }, 'BUSY'],
  ['missing batch', { missingBatch: true }, 'BASELINE_MISMATCH'],
  ['unpublished batch', { batch: { validation_state: 'validated' } }, 'BASELINE_MISMATCH'],
  ['wrong canonical source run', { batch: { legacy_import_run_id: '99' } }, 'BASELINE_MISMATCH'],
  ['incomplete contracts', { contractsComplete: false }, 'BASELINE_MISMATCH'],
  ['incomplete immutable staging', { stagingExact: false }, 'STAGING_MISMATCH'],
  ['previous candidate attempt', { candidateSeen: true }, 'CANDIDATE_CONFLICT'],
  ['invalid typed projection', { validProjection: false }, 'PROJECTION_INVALID'],
]) {
  test(`${name} fails before any mutation`, async () => {
    const input = fixture(), client = database(input, options);
    await assert.rejects(replaceCuratedWithinTransaction({ ...input, client }), { code: code(expectedCode) });
    assert.equal(client.writes.length, 0);
    assert.deepEqual(client.state, client.initial);
  });
}

for (const importRunId of [null, '99']) {
  test(`mixed cohort ${String(importRunId)} fails before any deletion`, async () => {
    const input = fixture(), client = database(input);
    client.state.tables.grh_family[0].import_run_id = importRunId;
    await assert.rejects(replaceCuratedWithinTransaction({ ...input, client }), { code: code('BASELINE_MISMATCH') });
    assert.equal(client.writes.length, 0);
  });
}

test('same counts with changed current payload cannot pass replay', async () => {
  const input = fixture(), client = database(input);
  client.state.tables.grh_family[0].source_payload = { synthetic: 'different' };
  await assert.rejects(replaceCuratedWithinTransaction({ ...input, client }), { code: code('BASELINE_MISMATCH') });
  assert.equal(client.writes.length, 0);
});

test('detects primary-key collisions after bigint conversion before allocating a run', async () => {
  const input = fixture();
  input.candidate.rows.grh_family[1].family_id = '09007199254740993';
  const client = database(input);
  await assert.rejects(replaceCuratedWithinTransaction({ ...input, client }), { code: code('PROJECTION_INVALID') });
  assert.equal(client.writes.length, 0);
  const query = client.calls.find(call => /:projection:grh_family/.test(call.sql));
  assert.match(query.sql, /jsonb_populate_recordset\(NULL::public.grh_family/);
  assert.match(query.sql, /count\(DISTINCT ROW\(family_id\)\)/);
});

test('same certified source is rejected without allocating a new run', async () => {
  const input = fixture(); input.candidate = input.current.prepared;
  const client = database(input);
  await assert.rejects(replaceCuratedWithinTransaction({ ...input, client }), { code: code('CANDIDATE_CONFLICT') });
  assert.equal(client.writes.length, 0);
});

test('a previous certified source cannot replace a later published cut', async () => {
  const input = fixture();
  [input.current.prepared, input.candidate] = [input.candidate, input.current.prepared];
  const digest = createHash('md5').update('source_import_batch|GRH|' + NEW_SHA).digest('hex');
  input.current.batchId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20)}`;
  const client = database(input);
  await assert.rejects(replaceCuratedWithinTransaction({ ...input, client }), { code: code('CANDIDATE_CONFLICT') });
  assert.equal(client.writes.length, 0);
});

for (const [name, mutate] of [
  ['invalid calendar date', input => { input.candidate.expected.cutoff = '2026-02-30 12:30:00'; }],
  ['unverified artifact hashes', input => { input.candidate.expected.qualityFlags.allOutputHashesVerified = false; }],
  ['changed profile date', input => { input.candidate.expected.qualityFlags.profile = 'grh-junin-2026-08-06'; }],
  ['foreign import run', input => { input.current.importRunId = '0'; }],
  ['missing candidate projection', input => { delete input.candidate.projectTables; }],
  ['bad candidate payload', input => { input.candidate.rows.grh_family[0].source_payload = PRIVATE; }],
  ['known profile with foreign SHA', input => { input.candidate.expected.sourceSha256 = OLD_SHA; }],
  ['known profile with changed cutoff', input => { input.candidate.expected.cutoff = '2026-09-10 12:30:00'; }],
  ['unknown source profile', input => { input.candidate.expected.cutoff = '2026-10-01 12:30:00'; input.candidate.expected.qualityFlags.profile = 'grh-junin-2026-10-01'; }],
  ['changed certified table count', input => { input.candidate.expected.tableCounts.employees--; }],
  ['changed certified source count', input => { input.candidate.expected.tableCounts.source = { ...input.candidate.expected.tableCounts.source, unionMemberships: 1 }; }],
  ['changed certified catalog count', input => { input.candidate.expected.tableCounts.catalogs.sectors--; }],
]) {
  test(`${name} is sanitized and cannot issue SQL`, async () => {
    const input = fixture(), client = database(input); mutate(input);
    await assert.rejects(replaceCuratedWithinTransaction({ ...input, client }), error => {
      assert.equal(error.code, code('INPUT_INVALID'));
      assert.ok(!error.message.includes(PRIVATE)); return true;
    });
    assert.equal(client.calls.length, 0);
  });
}

test('candidate mutation during a checkpoint cannot change the captured projection or metadata', async () => {
  const input = fixture(), client = database(input), expected = clone(input.candidate.projectTables(NEW_ID));
  await replaceCuratedWithinTransaction({ ...input, client, checkpoint(phase) {
    if (phase === 'curated:validated') {
      input.candidate.rows.grh_family[0].source_payload = JSON.stringify({ unverified: true });
      input.candidate.expected.qualityFlags.profile = 'invalid';
      input.current.importRunId = '99';
    }
  } });
  assert.deepEqual(client.state.tables.grh_family, expected.grh_family.map(typed));
  assert.equal(client.state.runs[1].quality_flags.profile, NEW_PROFILE.curated.profileId);
});

for (const options of [{ deleteCountMismatch: true }, { insertCountMismatch: true }, { resultMismatch: true }]) {
  test('affected-count or final projection mismatch cannot return success', async () => {
    const input = fixture(), client = database(input, options);
    await assert.rejects(replaceCuratedWithinTransaction({ ...input, client }), { code: code('RESULT_MISMATCH') });
    client.rollback();
    assert.deepEqual(client.state, client.initial);
  });
}

test('final verification catches a changed field even when inserted counts are correct', async () => {
  const input = fixture(), client = database(input);
  await assert.rejects(replaceCuratedWithinTransaction({ ...input, client, checkpoint(phase) {
    if (phase === 'curated:inserted:grh_family') client.state.tables.grh_family[0].nombre = 'trigger-altered';
  } }), { code: code('RESULT_MISMATCH') });
});

test('bounded typed batches preserve every certified record and exact large bigint IDs', async () => {
  const input = fixture();
  const client = database(input);
  await replaceCuratedWithinTransaction({ ...input, client });
  const batches = client.calls.filter(call => /:insert:grh_family/.test(call.sql));
  assert.deepEqual(batches.map(call => JSON.parse(call.values[0]).length), [500, 500, 500, 500, 500, 500, 500, 149]);
  assert.equal(client.state.tables.grh_family.length, 3649);
  assert.equal(client.state.tables.grh_family[0].family_id, '9007199254740993');
  assert.ok(batches.every(call => /jsonb_populate_recordset\(NULL::public.grh_family/.test(call.sql)));
});

test('database and unknown error details never escape the controlled error contract', async () => {
  const input = fixture(), client = database(input, { reject: /:create-run/ });
  await assert.rejects(replaceCuratedWithinTransaction({ ...input, client }), error => {
    assert.deepEqual(safeGrhCuratedReplacementError(error), { code: code('UNAVAILABLE'), message: error.message });
    assert.ok(!error.message.includes(PRIVATE)); return true;
  });
  const sanitized = safeGrhCuratedReplacementError(Object.assign(new Error(PRIVATE), { code: PRIVATE }));
  assert.equal(sanitized.code, code('UNAVAILABLE'));
  assert.ok(!JSON.stringify(sanitized).includes(PRIVATE));
});
