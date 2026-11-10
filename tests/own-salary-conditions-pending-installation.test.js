import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

import {buildOwnSalaryConditionsPendingInstallation as build,
  prepareOwnSalaryConditionsPendingInstallation as prepare,
  assertOwnSalaryConditionsPendingDurability as durable,
  salaryConditionsPendingPreservationSnapshot as snapshot,
  SALARY_CONDITIONS_PENDING_FILE as sqlFile,
  SALARY_CONDITIONS_PENDING_SHA256 as sqlSha,
  SALARY_CONDITIONS_PENDING_SOURCE_PINS as sourcePins} from '../scripts/lib/own-salary-conditions-pending-installation.mjs';
import {preservationSnapshot as inheritedSnapshot} from '../scripts/lib/native-leave-installation.mjs';

const repository = new URL('../', import.meta.url);
const sourceCommit = '9f5062c4bcf6a5e3862b170507d8514282d6ffcb';
const read = file => readFileSync(new URL(file, repository), 'utf8');
const batch = build({read, sourceCommit});
const containsDdl = statements => /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\s/i.test(statements.join('\n'));

function receipt(mode) {
  const inTransaction = mode !== 'verify';
  return {version: batch.version, sourceCommit, sourceHashes: structuredClone(batch.sourceHashes), mode,
    functionsAdded: mode === 'install' ? 1 : 0, newTables: 0, runtimeFacades: 1,
    existingAclChanges: 0, roleAssignmentsAdded: 0, businessWrites: 0, nominalRowsReturned: 0,
    transactionDataPreserved: inTransaction, ...(inTransaction ? {beforeFingerprint: 'a'.repeat(64)} : {}),
    preservationSha256: 'a'.repeat(64), priorMetadataSha256: 'b'.repeat(64),
    priorTableCount: 30, functionOid: '123456', functionXmin: '4000', objectFingerprint: 'c'.repeat(64)};
}
const receipts = () => ({installed: receipt('install'), durable: receipt('verify'), repeated: receipt('repeat'), batch});

test('pure construction pins the exact four-statement candidate and existing source helpers', () => {
  assert.equal(batch.connects, false);
  assert.equal(batch.executesSql, false);
  assert.equal(batch.sourceHashes[sqlFile], sqlSha);
  assert.equal(batch.migration.length, 4);
  assert.equal(batch.newPin.signature, 'public.own_salary_conditions_pending_v1(jsonb)');
  assert.equal(batch.newPin.runtime, true);
  assert.deepEqual(batch.newPin.argNames, ['p']);
  assert.deepEqual(batch.newPin.config, ['search_path=pg_catalog, public, pg_temp', 'TimeZone=UTC']);
  assert.equal(batch.newPin.definer, true);
  assert.equal(batch.newPin.volatility, 'v');
});

for (const file of Object.keys(sourcePins)) test('changed source is refused before SQL construction for ' + file, () => {
  assert.throws(() => build({read: path => read(path) + (path === file ? '\n' : ''), sourceCommit}), /SALARY_PENDING_SOURCE_CHANGED/);
});

test('line ending normalization accepts the same reviewed source', () => {
  assert.deepEqual(build({read: file => read(file).replace(/\r?\n/g, '\r\n'), sourceCommit}).sourceHashes, batch.sourceHashes);
});

test('invalid source identities and missing read interface are refused', () => {
  assert.throws(() => build({read, sourceCommit: 'latest'}));
  assert.throws(() => build({sourceCommit}));
});

test('four exact prerequisites pin authority and event immutability with no runtime grant', () => {
  assert.deepEqual(batch.prerequisitePins.map(pin => pin.name), [
    'own_salary_conditions_context_v1', 'own_salary_conditions_session_live_v1',
    'own_salary_conditions_immutable_v1', 'action_center_context_has_capability']);
  assert.ok(batch.prerequisitePins.every(pin => pin.runtime === false));
  assert.equal(batch.prerequisitePins[3].volatility, 'i');
  assert.deepEqual(batch.prerequisitePins[3].config, ['search_path=public, pg_temp']);
  assert.match(batch.prerequisiteCheck, /SALARY_CONDITIONS_TABLE_SHAPE/);
  assert.match(batch.prerequisiteCheck, /SALARY_CONDITIONS_INDEX_SHAPE/);
  assert.match(batch.prerequisiteCheck, /SALARY_CONDITIONS_IMMUTABLE_GUARD/);
});

test('only a completely absent name selects installation and every other kind or overload is rejected', () => {
  const mode = batch.installation[0];
  assert.match(mode, /IF names=0 THEN/);
  assert.match(mode, /ELSIF names=1 AND to_regprocedure\('public\.own_salary_conditions_pending_v1\(jsonb\)'\) IS NOT NULL/);
  assert.match(mode, /SALARY_PENDING_OBJECT_CONFLICT/);
  assert.match(batch.functionCheck, /p\.prokind<>'f'/);
  assert.match(batch.functionCheck, /count\(\*\).*proname='own_salary_conditions_pending_v1'/);
});

test('existing exact facade is checked before the conditional installation branch', () => {
  assert.match(batch.choose, /mode'\)='repeat' THEN EXECUTE/);
  assert.ok(batch.installation.indexOf(batch.choose) < batch.installation.indexOf(batch.apply));
  assert.match(batch.apply, /mode'\)='install' THEN/);
  assert.match(batch.apply, /CREATE FUNCTION public\.own_salary_conditions_pending_v1/);
  assert.doesNotMatch(batch.apply, /CREATE OR REPLACE|ALTER TABLE|CREATE INDEX/);
});

test('the dedicated repetition and durable paths contain no DDL or grant operations', () => {
  assert.equal(containsDdl(batch.repetition), false);
  assert.equal(containsDdl(batch.durableVerification), false);
  assert.equal(containsDdl(batch.rollbackVerification), false);
  assert.ok(!batch.repetition.includes(batch.apply));
  assert.match(batch.repetition[0], /names<>1/);
});

test('new function checks require exact body, metadata, owner and both exact execute ACL entries', () => {
  for (const text of ['p.proowner<>current_user::regrole', 'p.proconfig', 'p.prosrc', 'p.proargnames',
    'p.provolatile', 'p.proisstrict', 'p.prosupport', 'p.procost', 'p.proparallel']) assert.ok(batch.functionCheck.includes(text), text);
  assert.match(batch.functionCheck, /a\.grantor,a\.grantee,a\.privilege_type,a\.is_grantable/);
  assert.match(batch.functionCheck, /VALUES\(p\.proowner\),\('municontrol_actions_runtime_app'::regrole::oid\)/);
  assert.match(batch.functionCheck, /actual IS DISTINCT FROM expected/);
});

test('preservation excludes only the one exact new function and restores all legacy exclusions', () => {
  const source = snapshot('before');
  assert.match(source, /p\.oid IS DISTINCT FROM to_regprocedure\('public\.own_salary_conditions_pending_v1\(jsonb\)'\)/);
  assert.doesNotMatch(source, /native_leave_%|IS DISTINCT FROM to_regclass|proname LIKE 'own_salary_conditions_/);
  assert.match(source, /p\.relkind IN \('r','p','m'\)/);
  assert.match(source, /SALARY_PENDING_FOREIGN_TABLE_UNAUDITED/);
  for (const key of ["'roles'", "'memberships'", "'defaultAcl'", "'relations'", "'types'", "'attributes'", "'indexes'", "'eventTriggers'"]) assert.ok(source.includes(key), key);
  assert.match(source, /municontrol_salary_conditions_pending_install\.before/);
  assert.match(batch.conservation, /before'\)::jsonb IS DISTINCT FROM current_setting\('municontrol_salary_conditions_pending_install\.after'\)::jsonb/);
  assert.throws(() => snapshot('untrusted'));
});

test('existing destination interfaces create independent finite transactions for both supported targets', () => {
  const prepared = prepare({read, sourceCommit});
  assert.deepEqual(prepared.targets.map(target => target.major), [17, 18]);
  for (const target of prepared.targets) {
    const transactions = target.transactions;
    assert.equal(transactions.rehearsal.completion, 'ROLLBACK');
    assert.equal(transactions.install.completion, 'COMMIT');
    assert.equal(transactions.repeat.completion, 'COMMIT');
    assert.equal(transactions.durable.readOnly, true);
    assert.equal(transactions.rollbackVerification.readOnly, true);
    assert.ok(transactions.install.statements.includes('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'));
    assert.match(transactions.install.statements.join('\n'), /OWN_INSTALL_DESTINATION_MISMATCH/);
    assert.equal(transactions.durable.statements[0], 'SET TRANSACTION READ ONLY');
    assert.match(transactions.rollbackVerification.statements.join('\n'), /SALARY_PENDING_ROLLBACK_NOT_ABSENT/);
    assert.equal(containsDdl(transactions.repeat.statements), false);
  }
});

test('durability compares prior metadata, OID, xmin and object bytes while permitting legitimate interconnection row changes', () => {
  const input = receipts();
  input.durable.preservationSha256 = 'd'.repeat(64);
  input.repeated.preservationSha256 = input.repeated.beforeFingerprint = 'e'.repeat(64);
  const result = durable(input);
  assert.equal(result.passed, true);
  assert.equal(result.wholeDatabaseStaticAcrossConnections, false);
  assert.equal(result.repeatedWithoutDdl, true);
});

for (const [label, change] of Object.entries({
  source: input => { input.durable.sourceCommit = '0'.repeat(40); },
  sourceHashes: input => { input.durable.sourceHashes[sqlFile] = '0'.repeat(64); },
  preservation: input => { input.repeated.beforeFingerprint = '0'.repeat(64); },
  metadata: input => { input.durable.priorMetadataSha256 = '0'.repeat(64); },
  oid: input => { input.durable.functionOid = '123457'; },
  xmin: input => { input.repeated.functionXmin = '4001'; },
  object: input => { input.durable.objectFingerprint = '0'.repeat(64); },
  mode: input => { input.repeated.mode = 'install'; },
  writes: input => { input.durable.businessWrites = 1; },
  grants: input => { input.installed.existingAclChanges = 1; },
  replacement: input => { input.repeated.functionsAdded = 1; },
})) test('durability refuses changed ' + label, () => {
  const input = receipts();
  change(input);
  assert.throws(() => durable(input));
});

test('an already installed exact facade can be admitted as a no-DDL repeat', () => {
  const input = receipts();
  input.installed = receipt('repeat');
  assert.equal(durable(input).passed, true);
});

function addedSnapshotQueries(sql) {
  const guardStart = sql.indexOf(' IF EXISTS(SELECT 1 FROM pg_class ');
  const guardEnd = sql.indexOf('\n FOR c', guardStart);
  const metadataStart = sql.indexOf(' result:=result||jsonb_build_object(');
  const metadataEnd = sql.indexOf('\n PERFORM set_config', metadataStart);
  assert.ok(guardStart >= 0 && guardEnd > guardStart && metadataStart > guardEnd && metadataEnd > metadataStart);
  return [sql.slice(guardStart, guardEnd), sql.slice(metadataStart, metadataEnd)];
}
function assertNoAddedAliasCollision(sql) {
  const declaration = /\bDECLARE ([\s\S]*?) BEGIN\n/.exec(sql);
  assert.ok(declaration);
  const variables = new Set(declaration[1].split(';').filter(Boolean).map(item => /^\s*(\w+)/.exec(item)[1]));
  for (const query of addedSnapshotQueries(sql)) {
    for (const match of query.matchAll(/\b(?:FROM|JOIN)\s+(?:[a-z_]+\.)?[a-z_]+\s+(?:AS\s+)?([a-z_]+)/gi)) {
      assert.ok(!variables.has(match[1]), 'SQL alias collides with DECLARE variable ' + match[1]);
    }
  }
  return variables;
}
function snapshotWithCollidingAliases(sql) {
  let fixture = sql;
  for (const query of addedSnapshotQueries(sql)) {
    const changed = query.replaceAll('pg_class relation', 'pg_class c')
      .replaceAll('pg_namespace namespace', 'pg_namespace n').replace(/\brelation\./g, 'c.').replace(/\bnamespace\./g, 'n.');
    fixture = fixture.replace(query, changed);
  }
  return fixture;
}

test('added snapshot aliases never reuse a variable declared by the inherited PLpgSQL block', () => {
  for (const slot of ['before', 'after']) {
    const variables = assertNoAddedAliasCollision(snapshot(slot));
    assert.ok(variables.has('c') && variables.has('n'));
    assert.match(snapshot(slot), /pg_class relation JOIN pg_namespace namespace/);
    assert.match(snapshot(slot), /pg_type t JOIN pg_namespace namespace/);
  }
});

test('the same detector rejects a self-contained fixture reproducing the original alias collision', () => {
  for (const slot of ['before', 'after']) assert.throws(() =>
    assertNoAddedAliasCollision(snapshotWithCollidingAliases(snapshot(slot))),
    /SQL alias collides with DECLARE variable c/);
});

test('snapshot extensions preserve the complete inherited body after the declared exclusions', () => {
  for (const slot of ['before', 'after']) {
    let inherited = snapshot(slot);
    for (const query of addedSnapshotQueries(inherited)) inherited = inherited.replace(query + '\n', '');
    const excludedTable = " AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
    let expected = inheritedSnapshot(slot);
    assert.equal(expected.split(excludedTable).length - 1, 2);
    expected = expected.replaceAll(excludedTable, '')
      .replace("NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",
        "p.oid IS DISTINCT FROM to_regprocedure('public.own_salary_conditions_pending_v1(jsonb)')")
      .replace("p.relkind IN ('r','p')", "p.relkind IN ('r','p','m')")
      .replaceAll('municontrol_sql111.', 'municontrol_salary_conditions_pending_install.');
    assert.equal(inherited, expected);
  }
  assert.equal(sourcePins['scripts/lib/native-leave-installation.mjs'],
    '57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef');
});

test('all newly added pg_class and pg_namespace joins use the noncolliding aliases', () => {
  const added = addedSnapshotQueries(snapshot('before')).join('\n');
  assert.equal([...added.matchAll(/\bpg_class relation\b/g)].length, 4);
  assert.equal([...added.matchAll(/\bpg_namespace namespace\b/g)].length, 5);
  assert.doesNotMatch(added, /\bpg_class c\b|\bpg_namespace n\b/);
});