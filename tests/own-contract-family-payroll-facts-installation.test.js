import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {buildOwnContractFamilyPayrollFactsInstallation as build,
  prepareOwnContractFamilyPayrollFactsInstallation as prepare,
  assertOwnContractFamilyPayrollFactsDurability as durability,
  assertOwnContractFamilyPayrollFactsRollback as rollback,
  FAMILY_PAYROLL_FACTS_FILE as sqlFile,
  FAMILY_PAYROLL_FACTS_SHA256 as sqlSha,
  FAMILY_PAYROLL_FACTS_SOURCE_COMMIT as sourceCommit,
  FAMILY_PAYROLL_FACTS_SOURCE_PINS as sourcePins} from '../scripts/lib/own-contract-family-payroll-facts-installation.mjs';

const repository = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, repository), 'utf8');
const batch = build({read, sourceCommit});
const prepared = prepare({read, sourceCommit});
const containsDdl = statements => /\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\s/i.test(statements.join('\n'));

function receipt(mode) {
  const inTransaction = mode !== 'verify';
  return {version: batch.version, sourceCommit, sourceHashes: structuredClone(batch.sourceHashes), mode,
    backendPid: mode === 'install' ? 1001 : mode === 'verify' ? 1002 : 1003,
    tablesAdded: mode === 'install' ? 1 : 0, functionsAdded: mode === 'install' ? 15 : 0,
    newTables: 1, newFunctions: 15, runtimeFacades: 4, adaptedFunctions: 0,
    existingAclChanges: 0, roleAssignmentsAdded: 0, businessWrites: 0, nominalRowsReturned: 0,
    transactionDataPreserved: inTransaction, ...(inTransaction ? {beforeFingerprint: 'a'.repeat(64)} : {}),
    preservationSha256: 'a'.repeat(64), priorMetadataSha256: 'b'.repeat(64),
    priorTableCount: 30, tableOid: '123456', eventRows: 0, objectFingerprint: 'c'.repeat(64)};
}
const receipts = () => ({installed: receipt('install'), durable: receipt('verify'), repeated: receipt('repeat'), batch});
const absent = () => ({version: batch.version, sourceCommit, sourceHashes: structuredClone(batch.sourceHashes),
  mode: 'absent', backendPid: 1004, newObjectsAbsent: true, priorMetadataSha256: 'b'.repeat(64), businessWrites: 0, nominalRowsReturned: 0});

test('pure construction consumes the exact reviewed R2 source and cannot connect', () => {
  assert.equal(batch.connects, false);
  assert.equal(batch.executesSql, false);
  assert.equal(batch.sourceHashes[sqlFile], sqlSha);
  assert.equal(batch.migration.length, 25);
  assert.equal(batch.newPins.length, 15);
  assert.equal(batch.newPins.filter(pin => pin.runtime).length, 4);
  assert.equal(prepared.targets.length, 2);
});

for (const file of Object.keys(sourcePins)) test('changed source is refused for ' + file, () => {
  assert.throws(() => build({read: path => read(path) + (path === file ? '\n' : ''), sourceCommit}), /FAMILY_INSTALL_SOURCE_CHANGED/);
});

test('CRLF is accepted as the same reviewed source', () => {
  assert.deepEqual(build({read: file => read(file).replace(/\r?\n/g, '\r\n'), sourceCommit}).sourceHashes, batch.sourceHashes);
});

test('source commit must be the reviewed R2 commit and read is required', () => {
  assert.throws(() => build({read, sourceCommit: '9f5062c4bcf6a5e3862b170507d8514282d6ffcb'}), /SOURCE_COMMIT_CHANGED/);
  assert.throws(() => build({sourceCommit}));
});

test('all nine direct application dependencies come from declarative sources', () => {
  assert.deepEqual(batch.prerequisitePins.map(pin => pin.name), [
    'native_salary_administrative_context_v1', 'native_salary_lock_v1', 'native_salary_scope_v1',
    'native_salary_serialized_v1', 'own_program_exact_v1', 'own_program_text_v1',
    'payroll_fixed_registry_subject_v2', 'payroll_fixed_registry_range_v2', 'action_center_context_has_capability']);
  assert.ok(batch.prerequisitePins.every(pin => !pin.runtime));
  assert.equal(batch.prerequisitePins[5].sha256, 'c822b9615ba27ff69fbfb63f691d506d668c3d80ae99eb11a74c56526406341a');
  assert.equal(batch.prerequisitePins[0].sha256, '346e45cc443193a34b8f000d988cd8e5b4356ec961173a82df91350fd0159451');
  assert.equal(batch.prerequisitePins[8].sha256, '2c11f52b97664769613495b4929de39ac008181fbaa5ab701c028e92f9d82df8');
});

test('the only runtime grants are bootstrap/detail/attempt/command', () => {
  assert.deepEqual(batch.newPins.filter(pin => pin.runtime).map(pin => pin.name), [
    'own_family_payroll_facts_bootstrap_v1', 'own_family_payroll_facts_detail_v1',
    'own_family_payroll_facts_attempt_v1', 'own_family_payroll_facts_command_v1']);
  assert.equal(batch.newPins.find(pin => pin.name === 'own_family_payroll_facts_capture_v1').runtime, false);
  assert.match(batch.objectCheck, /acl\.grantor,acl\.grantee,acl\.privilege_type,acl\.is_grantable/);
  assert.match(batch.objectCheck, /FAMILY_INSTALL_FUNCTION_ACL_CHANGED/);
});

test('source-derived function metadata includes composite signature, defaults, config and immutability', () => {
  const summary = batch.newPins.find(pin => pin.name === 'own_family_payroll_facts_summary_v1');
  assert.equal(summary.signature, 'public.own_family_payroll_facts_summary_v1(jsonb,public.own_family_payroll_facts_event)');
  assert.equal(summary.volatility, 's');
  const items = batch.newPins.find(pin => pin.name === 'own_family_payroll_facts_items_v1');
  assert.equal(items.defaults, 'false');
  const context = batch.newPins.find(pin => pin.name === 'own_family_payroll_facts_context_v1');
  assert.deepEqual(context.config, ['search_path=pg_catalog, public, pg_temp', 'TimeZone=UTC']);
  assert.equal(context.definer, true);
  assert.equal(batch.newPins.find(pin => pin.name === 'own_family_payroll_facts_definition_v1').volatility, 'i');
});

test('an absent namespace alone permits install, and partial kinds/overloads conflict', () => {
  const mode = batch.installation[0];
  assert.match(mode, /names=0 AND relations=0 AND types=0/);
  assert.match(mode, /names=15 AND relations=6 AND types=2/);
  assert.match(mode, /FAMILY_INSTALL_OBJECT_CONFLICT/);
  assert.doesNotMatch(mode, /to_regprocedure/);
  assert.match(batch.objectCheck, /p\.prokind<>'f'/);
  assert.match(batch.objectCheck, /FAMILY_PAYROLL_FACTS_TABLE_SHAPE/);
});

test('the complete family table shape and inherited guards remain mandatory', () => {
  for (const guard of ['TABLE_SECURITY', 'TABLE_SHAPE', 'CONSTRAINT_SHAPE', 'FOREIGN_SHAPE',
    'UNIQUE_SHAPE', 'NOT_NULL_SHAPE', 'INDEX_SHAPE', 'IMMUTABLE_GUARD', 'FOREIGN_GUARD'])
    assert.ok(batch.objectCheck.includes('FAMILY_PAYROLL_FACTS_' + guard));
  assert.match(batch.objectCheck, /FAMILY_INSTALL_INDEX_SECURITY/);
  assert.match(batch.objectCheck, /am\.amname<>'btree'/);
});

test('private helper runtime access, other grantees and grant options are rejected', () => {
  for (const field of ['p.proowner', 'p.prosecdef', 'p.proisstrict', 'p.proretset', 'p.proconfig',
    'p.provolatile', 'p.proparallel', 'p.proleakproof', 'p.procost', 'p.prorows', 'p.proargnames'])
    assert.ok(batch.objectCheck.includes(field));
  assert.match(batch.objectCheck, /has_function_privilege/);
  assert.match(batch.objectCheck, /NOT a\.is_grantable/);
});

test('only the reviewed new family DDL can run, and only in install mode', () => {
  assert.match(batch.apply, /IF current_setting\('municontrol_family_payroll_facts_install\.mode'\)='install' THEN/);
  assert.equal((batch.apply.match(/^EXECUTE /gm) || []).length, 25);
  assert.doesNotMatch(batch.apply, /CREATE OR REPLACE|ALTER FUNCTION|DROP |CREATE ROLE|GRANT .* TO .* WITH GRANT OPTION/i);
  assert.doesNotMatch(batch.apply, /CREATE FUNCTION public\.own_salary_conditions_|CREATE TABLE public\.own_payroll_/);
  assert.match(batch.apply, /FAMILY_INSTALL_NEW_TABLE_NOT_EMPTY/);
});

test('repetition, durable read and independent absence contain no DDL/apply body', () => {
  for (const statements of [batch.repetition, batch.durableVerification, batch.rollbackVerification]) {
    assert.equal(containsDdl(statements), false);
    assert.ok(!statements.includes(batch.apply));
  }
  assert.equal(batch.repetition[0].includes("'repeat'"), true);
});

test('every generated item is one complete PostgreSQL statement including nested DO strings', () => {
  for (const statements of [batch.installation, batch.repetition, batch.durableVerification, batch.rollbackVerification]) {
    for (const statement of statements) assert.equal(splitPostgresStatements(statement).length,
      statement === batch.objectCheck ? 3 : 1);
    assert.ok(splitPostgresStatements(statements.join(';\n')).length >= statements.length);
  }
});

test('the snapshot restores the old leave scope and excludes only the reviewed new function names', () => {
  for (const snapshot of [batch.before, batch.after]) {
    assert.doesNotMatch(snapshot, /native_leave_/);
    assert.doesNotMatch(snapshot, /proname LIKE/);
    for (const pin of batch.newPins) assert.ok(snapshot.includes("'" + pin.name + "'"));
    assert.match(snapshot, /AND NOT\(t\.tgisinternal AND t\.tgconstraint IN/);
    assert.match(snapshot, /conrelid=to_regclass\('public\.own_family_payroll_facts_event'\) AND contype='f'/);
  }
});

test('absent new relation exclusion is an empty set and cannot introduce NOT IN NULL', () => {
  assert.match(batch.before, /SELECT oid FROM pg_class WHERE oid=to_regclass\('public\.own_family_payroll_facts_event'\) UNION SELECT indexrelid/);
  assert.doesNotMatch(batch.before, /SELECT to_regclass\('public\.own_family_payroll_facts_event'\) AS oid/);
});

test('preservation covers every old row, sequences and security metadata including materialized views', () => {
  for (const token of ["p.relkind IN ('r','p','m')", "'rowsSha256'", "'sequences'", "'functions'", "'triggers'",
    "'schemas'", "'defaultAcl'", "'roles'", "'memberships'", "'views'", "'relations'", "'types'", "'attributes'", "'indexes'", "'eventTriggers'"])
    assert.ok(batch.before.includes(token), token);
  assert.match(batch.before, /FAMILY_INSTALL_FOREIGN_TABLE_UNAUDITED/);
  assert.doesNotMatch(batch.before, /SELECT [\s\S]*FROM pg_class c\b/);
});

test('existing family event rows are also preserved during repeat without requiring zero', () => {
  assert.ok(batch.repetition.some(statement => statement.includes('family_rows_before')));
  assert.ok(batch.repetition.some(statement => statement.includes('family_rows_after')));
  assert.match(batch.conservation, /FAMILY_INSTALL_EXISTING_EVENT_ROWS_CHANGED/);
  assert.match(batch.conservation, /FAMILY_INSTALL_PRIOR_STATE_CHANGED/);
  assert.doesNotMatch(batch.repetition.join('\n'), /NEW_TABLE_NOT_EMPTY/);
});

test('the transaction settings and finite phase order are explicit for PG17 and PG18', () => {
  for (const target of prepared.targets) {
    const t = target.transactions;
    assert.equal(t.rehearsal.begin, 'BEGIN');
    assert.equal(t.rehearsal.completion, 'ROLLBACK');
    assert.equal(t.install.completion, 'COMMIT');
    assert.equal(t.repeat.completion, 'COMMIT');
    for (const name of ['durable', 'rollbackVerification']) {
      assert.equal(t[name].readOnly, true);
      assert.equal(t[name].statements[0], 'SET TRANSACTION READ ONLY');
      assert.equal(t[name].completion, 'COMMIT');
    }
    for (const phase of Object.values(t)) {
      assert.ok(phase.statements.includes('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'));
      assert.ok(phase.statements.some(statement => statement.includes('native_employee_contract_guard_v1()')));
    }
  }
});

test('both mode gates require correct transaction mode, locks and immediate conflicts', () => {
  assert.match(batch.installation[0], /transaction_read_only'\)<>'off'/);
  assert.match(batch.durableVerification[0], /transaction_read_only'\)<>'on'/);
  assert.match(batch.rollbackVerification[0], /transaction_read_only'\)<>'on'/);
  assert.match(batch.installation[0], /pg_try_advisory_xact_lock\(171\)/);
  assert.match(batch.installation[0], /pg_try_advisory_xact_lock\(226\)/);
  assert.match(batch.installation[0], /IN ACCESS SHARE MODE NOWAIT/);
});

test('aggregate receipts demonstrate an independent rollback', () => {
  assert.equal(rollback({rehearsed: receipt('install'), absent: absent(), batch}).passed, true);
  const proof = absent();proof.newObjectsAbsent = false;
  assert.throws(() => rollback({rehearsed: receipt('install'), absent: proof, batch}));
  const changed = absent();changed.priorMetadataSha256 = 'd'.repeat(64);
  assert.throws(() => rollback({rehearsed: receipt('install'), absent: changed, batch}), /NOT_ROLLED_BACK/);
  assert.throws(() => rollback({rehearsed: receipt('repeat'), absent: absent(), batch}), /ABSENT_START/);
});

test('aggregate receipts demonstrate durable installation and DDL-free repetition', () => {
  assert.equal(durability(receipts()).passed, true);
  const p = receipts();p.installed = receipt('repeat');p.installed.backendPid = 1001;
  assert.equal(durability(p).passed, true);
});

for (const field of ['priorMetadataSha256', 'objectFingerprint', 'tableOid', 'priorTableCount'])
  test('independent metadata drift is refused for ' + field, () => {
    const p = receipts();p.durable[field] = field.endsWith('Count') ? 31 : field === 'tableOid' ? '123457' : 'd'.repeat(64);
    assert.throws(() => durability(p), /NOT_DURABLE/);
  });

for (const field of ['businessWrites', 'nominalRowsReturned', 'existingAclChanges', 'adaptedFunctions', 'roleAssignmentsAdded'])
  test('unexpected changes are refused for ' + field, () => {
    const p = receipts();p.repeated[field] = 1;
    assert.throws(() => durability(p));
  });

test('receipt source, conservation and DDL count mismatches fail closed', () => {
  const a = receipts();a.durable.sourceHashes[sqlFile] = 'd'.repeat(64);assert.throws(() => durability(a));
  const b = receipts();b.installed.beforeFingerprint = 'd'.repeat(64);assert.throws(() => durability(b), /NOT_PRESERVED/);
  const c = receipts();c.repeated.functionsAdded = 15;assert.throws(() => durability(c));
  const d = receipts();d.durable.transactionDataPreserved = true;assert.throws(() => durability(d));
});

test('legitimate event growth between connections does not invalidate metadata durability', () => {
  const p = receipts();p.durable.eventRows = 2;p.repeated.eventRows = 3;
  assert.equal(durability(p).wholeDatabaseStaticAcrossConnections, false);
});

test('emitted receipts contain only metadata aggregates and no family row payload', () => {
  const proof = batch.installation.at(-1);
  for (const token of ["'nominalRowsReturned',0", "'businessWrites',0", "'eventRows',(SELECT count(*)", "'objectFingerprint'", "'priorMetadataSha256'"])
    assert.ok(proof.includes(token));
  assert.doesNotMatch(proof, /'items'|'actorEmail'|'documentReference'|'body'|'receipt'/);
});

test('rollback receipt source, zero-event start and independent connection are mandatory', () => {
  const a = receipt('install');a.version = 'other';assert.throws(() => rollback({rehearsed: a, absent: absent(), batch}));
  const b = receipt('install');b.eventRows = 1;assert.throws(() => rollback({rehearsed: b, absent: absent(), batch}));
  const c = absent();c.backendPid = 1001;assert.throws(() => rollback({rehearsed: receipt('install'), absent: c, batch}), /CONNECTION_REUSED/);
});

test('durability receipt must come from independent backend connections', () => {
  const a = receipts();a.durable.backendPid = a.installed.backendPid;
  assert.throws(() => durability(a), /CONNECTION_REUSED/);
  const b = receipts();b.repeated.backendPid = 0;assert.throws(() => durability(b));
  assert.match(batch.installation.at(-1), /'backendPid',pg_backend_pid\(\)/);
  assert.match(batch.rollbackVerification.at(-1), /'backendPid',pg_backend_pid\(\)/);
});

const source224File = 'scripts/migrations/224-native-employment-void.sql';
const source224 = read(source224File).replace(/\r\n?/g, '\n');
const source224Definition = name => {
  const marker = 'CREATE OR REPLACE FUNCTION public.' + name + '(';
  assert.equal(source224.split(marker).length, 2);
  const remaining = source224.slice(source224.indexOf(marker));
  const tag = /\bAS\s+(\$[a-z_0-9]*\$)/i.exec(remaining);
  const closing = remaining.indexOf(tag[1], tag.index + tag[0].length);
  assert.equal(remaining[closing + tag[1].length], ';');
  return remaining.slice(0, closing + tag[1].length + 1);
};
const currentSubject = batch.prerequisitePins.find(pin => pin.name === 'payroll_fixed_registry_subject_v2');
const currentRange = batch.prerequisitePins.find(pin => pin.name === 'payroll_fixed_registry_range_v2');

test('current224 authority is the exact complete E416 source by SHA256 and Git blob', () => {
  const bytes = Buffer.from(source224);
  assert.equal(bytes.length, 102089);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'ad708d03348188a09d26ebb22980133e6be96cc5ef9cc3e156f90601362ce384');
  assert.equal(createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex'), '80c85232ea744740bc88a24a92608f8b90ad9bee');
  assert.equal(sourcePins[source224File], 'ad708d03348188a09d26ebb22980133e6be96cc5ef9cc3e156f90601362ce384');
  assert.equal(Object.keys(sourcePins).length, 15);
  assert.equal(splitPostgresStatements(source224).length, 1);
});

test('subject successor has complete source-derived current224 metadata', () => {
  assert.deepEqual(currentSubject, {name: 'payroll_fixed_registry_subject_v2',
    signature: 'public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)',
    sha256: '394dade4020058b50f37d6cef28427dd0e3920a894062d4e175b013b61f4a8c9',
    argNames: ['ctx', 'target', 'hold_lock'], defaults: 'false', resultType: 'jsonb',
    language: 'plpgsql', returnsSet: false, strict: false, definer: true, volatility: 'v',
    config: ['search_path=pg_catalog, public, pg_temp'], runtime: false});
});

test('range successor has complete source-derived current224 metadata', () => {
  assert.deepEqual(currentRange, {name: 'payroll_fixed_registry_range_v2',
    signature: 'public.payroll_fixed_registry_range_v2(jsonb,uuid,date,date,boolean)',
    sha256: 'b7e8305da7038cbd6519ac16765fb57213286b51451983b10f3935eccca7b1fd',
    argNames: ['ctx', 'target', 'first_date', 'last_date', 'continuous'], defaults: 'false', resultType: 'boolean',
    language: 'plpgsql', returnsSet: false, strict: false, definer: true, volatility: 'v',
    config: ['search_path=pg_catalog, public, pg_temp'], runtime: false});
});

test('predecessor138 bodies remain excluded from this fixed current224 preflight', () => {
  const statements = splitPostgresStatements(read('scripts/migrations/138-adopted-fixed-novelties.sql'));
  for (const current of [currentSubject, currentRange]) {
    const definition = statements.find(statement => statement.startsWith('CREATE FUNCTION public.' + current.name + '('));
    const predecessor = ownInstallationFunctionPin(definition);
    assert.notEqual(current.sha256, predecessor.sha256);
    assert.ok(batch.prerequisiteCheck.includes(current.sha256));
    assert.ok(!batch.prerequisiteCheck.includes(predecessor.sha256));
  }
  assert.match(batch.prerequisiteCheck, /FAMILY_INSTALL_PREREQUISITE_CHANGED/);
});

test('changed224 withdrawal body or substituted138 source is rejected before SQL construction', () => {
  const changed = source224.replace("RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN'", "RAISE EXCEPTION 'SYNTHETIC_CHANGED_GUARD'");
  assert.notEqual(changed, source224);
  assert.throws(() => build({read: file => file === source224File ? changed : read(file), sourceCommit}), /FAMILY_INSTALL_SOURCE_CHANGED/);
  assert.throws(() => build({read: file => file === source224File ? read('scripts/migrations/138-adopted-fixed-novelties.sql') : read(file), sourceCommit}), /FAMILY_INSTALL_SOURCE_CHANGED/);
});

test('the224 original preflight and private core remain source only, never226 installation mutations', () => {
  for (const marker of ['DO $preflight$', 'VOID_LEDGER_REQUIRED',
    'VOID_READER_BASE_CHANGED: payroll_fixed_registry_subject_v2',
    'VOID_READER_BASE_CHANGED: payroll_fixed_registry_range_v2']) assert.ok(source224.includes(marker));
  assert.equal(batch.migration.length, 25);
  assert.doesNotMatch(batch.apply, /native_employment_void_|migration_224|VOID_LEDGER_REQUIRED|VOID_READER_BASE_CHANGED/);
  assert.equal(batch.newPins.length, 15);
  assert.equal(batch.newPins.filter(pin => pin.runtime).length, 4);
});

test('both successor pins retain strict owner/private ACL/body/config checks', () => {
  assert.equal(currentSubject.runtime, false);
  assert.equal(currentRange.runtime, false);
  for (const token of ['p.proowner<>current_user::regrole', "p.prokind<>'f'", 'p.prosecdef',
    'p.proconfig', 'p.prosrc', 'has_function_privilege', 'NOT a.is_grantable'])
    assert.ok(batch.prerequisiteCheck.includes(token), token);
  for (const stage of [batch.installation, batch.repetition, batch.durableVerification, batch.rollbackVerification])
    assert.ok(stage.includes(batch.prerequisiteCheck));
});

test('canonicalizing only224 headers preserves each exact published body SHA', () => {
  for (const expected of [currentSubject, currentRange]) {
    const definition = source224Definition(expected.name);
    const match = /\bAS\s+(\$[a-z_0-9]*\$)([\s\S]*)\1\s*;$/i.exec(definition);
    assert.ok(match);
    assert.equal(createHash('sha256').update(match[2]).digest('hex'), expected.sha256);
    const normalized = definition.slice(0, match.index)
      .replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'", 'SET search_path=pg_catalog,public,pg_temp')
      .replace(/\s+/g, ' ') + definition.slice(match.index);
    assert.deepEqual({...ownInstallationFunctionPin(normalized), runtime: false}, expected);
  }
});
