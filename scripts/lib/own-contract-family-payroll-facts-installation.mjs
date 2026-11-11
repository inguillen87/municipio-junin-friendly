// Pure protocol construction. The caller owns every database connection.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck, preservationSnapshot} from './native-leave-installation.mjs';
import {installationPriorMetadataFingerprint} from './installation-prior-metadata.mjs';
import {salaryConditionsTableCheck} from './own-contract-salary-conditions-installation.mjs';
import {ownInstallationDestination, ownInstallationSettings} from '../prepare-own-payroll-installation.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';

export const FAMILY_PAYROLL_FACTS_FILE = 'scripts/migrations/226-own-contract-family-payroll-facts.sql';
export const FAMILY_PAYROLL_FACTS_SHA256 = 'f2f46695a84dee098471e515d964fe0f952352671a5bbb349b56d253de5f3f90';
export const FAMILY_PAYROLL_FACTS_SOURCE_COMMIT = 'e41680a110d1aa253ddad5fd026eb4e8facdd0b8';
export const FAMILY_PAYROLL_FACTS_SOURCE_PINS = Object.freeze({
  [FAMILY_PAYROLL_FACTS_FILE]: FAMILY_PAYROLL_FACTS_SHA256,
  'scripts/migrations/224-native-employment-void.sql': 'ad708d03348188a09d26ebb22980133e6be96cc5ef9cc3e156f90601362ce384',
  'scripts/migrations/171-own-contract-salary-conditions.sql': '42c253a0395abf7abe326804cdd1a641d6936df84c960728c1e6a6aa6319c8ee',
  'scripts/migrations/007-action-center-read-facades.sql': 'd0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e',
  'scripts/migrations/112-native-salary-definitions.sql': 'da72986b8eb8b834f8f11f0cdfd793708eba90c96de59c399ff063fe31a95cd3',
  'scripts/migrations/122-own-payroll-programs.sql': 'edaf70ef87f9ac3de170e079c460d38c4188b36de349b5c58808f5a09a9f9785',
  'scripts/migrations/138-adopted-fixed-novelties.sql': 'da7bc276e367dc3c0377c99e3c687747665a53c0c186eb457f27ab9032803469',
  'scripts/lib/salary-administrative-identity-installation.mjs': 'eb898f02b87eeeeca5edde201c9a0a7d9b03d777fce80ef6a22eac7d93820a71',
  'scripts/lib/own-contract-salary-conditions-installation.mjs': '28b0d48ffe6271fdb6a022eb4f083545337c0a7005d6cd21cacbbad1529c4d5f',
  'scripts/lib/own-payroll-installation.mjs': '6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0',
  'scripts/lib/native-leave-installation.mjs': '57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
  'scripts/lib/installation-prior-metadata.mjs': 'b86d85a76a3c61bf963f61b9a991df65b1caec6056a74fe0c7396db4e808f8c9',
  'scripts/lib/sql-statements.mjs': 'd81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2',
  'scripts/prepare-own-payroll-installation.mjs': '8984ec722bf2928ec2e177e6e3bf4f21b4a95f182452bdaa5e29a6f1ea8854e7',
  'scripts/lib/own-payroll-release-target.mjs': '85c1f346424ee97279434701245bb50bf819850a3114405d0647fe846721d448',
});

const version = 'own-contract-family-payroll-facts-installation.v1';
const table = 'own_family_payroll_facts_event';
const namespace = 'own_family_payroll_facts_';
const prefix = 'municontrol_family_payroll_facts_install.';
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprintPattern = /^[a-f0-9]{64}$/;
const facades = new Set(['bootstrap', 'detail', 'attempt', 'command'].map(name => namespace + name + '_v1'));
const tableOid = "to_regclass('public." + table + "')";
const functionScope = "pronamespace='public'::regnamespace AND left(proname," + namespace.length + ')=' + quote(namespace);
const relationScope = "relnamespace='public'::regnamespace AND left(relname," + namespace.length + ')=' + quote(namespace);
const typeScope = "typnamespace='public'::regnamespace AND (left(typname," + namespace.length + ')=' + quote(namespace) + ' OR left(typname,' + (namespace.length + 1) + ')=' + quote('_' + namespace) + ')';
const newRelations = `(SELECT oid FROM pg_class WHERE oid=${tableOid} UNION SELECT indexrelid FROM pg_index WHERE indrelid=${tableOid})`;
const newTypes = `(SELECT reltype AS oid FROM pg_class WHERE oid=${tableOid} UNION SELECT typarray FROM pg_type WHERE typrelid=${tableOid})`;
const newForeignConstraints = `(SELECT oid FROM pg_constraint WHERE conrelid=${tableOid} AND contype='f')`;

function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, 'FAMILY_INSTALL_SNAPSHOT_ANCHOR_CHANGED');
  return source.replace(anchor, () => replacement);
}

export function familyPayrollFactsPreservationSnapshot(slot, newPins) {
  assert.equal(newPins.length, 15);
  const names = newPins.map(pin => quote(pin.name)).join(',');
  let source = preservationSnapshot(slot).replaceAll('native_leave_event', table);
  source = replaceOnce(source, "s.nspname='public' AND p.proname LIKE 'native_leave_%'",
    "s.nspname='public' AND p.proname IN(" + names + ')');
  source = replaceOnce(source, `p.oid IS DISTINCT FROM ${tableOid}),`,
    `p.oid IS DISTINCT FROM ${tableOid} AND NOT(t.tgisinternal AND t.tgconstraint IN ${newForeignConstraints})),`);
  source = replaceOnce(source, "p.relkind IN ('r','p')", "p.relkind IN ('r','p','m')");
  source = replaceOnce(source, ' BEGIN\n FOR c', ` BEGIN
 IF EXISTS(SELECT 1 FROM pg_class relation JOIN pg_namespace ns ON ns.oid=relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND relation.relkind='f') THEN RAISE EXCEPTION 'FAMILY_INSTALL_FOREIGN_TABLE_UNAUDITED';END IF;
 FOR c`);
  source = replaceOnce(source, ' PERFORM set_config', ` result:=result||jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('oid',relation.oid,'namespace',relation.relnamespace,'name',relation.relname,'kind',relation.relkind,'owner',relation.relowner,'acl',relation.relacl,'options',relation.reloptions,'persistence',relation.relpersistence,'rls',relation.relrowsecurity,'forceRls',relation.relforcerowsecurity,'replicaIdentity',relation.relreplident,'tablespace',relation.reltablespace,'accessMethod',relation.relam,'rowType',relation.reltype,'typedTable',relation.reloftype,'isPartition',relation.relispartition,'partitionBound',relation.relpartbound) ORDER BY relation.oid) FROM pg_class relation JOIN pg_namespace ns ON ns.oid=relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND relation.oid NOT IN ${newRelations}),
 'types',(SELECT jsonb_agg(to_jsonb(typ) ORDER BY typ.oid) FROM pg_type typ JOIN pg_namespace ns ON ns.oid=typ.typnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND typ.oid NOT IN ${newTypes}),
 'attributes',(SELECT jsonb_agg(to_jsonb(attribute) ORDER BY attribute.attrelid,attribute.attnum) FROM pg_attribute attribute JOIN pg_class relation ON relation.oid=attribute.attrelid JOIN pg_namespace ns ON ns.oid=relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND relation.oid NOT IN ${newRelations}),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('metadata',to_jsonb(idx),'definition',pg_get_indexdef(idx.indexrelid)) ORDER BY idx.indexrelid) FROM pg_index idx JOIN pg_class relation ON relation.oid=idx.indrelid JOIN pg_namespace ns ON ns.oid=relation.relnamespace WHERE ns.nspname NOT LIKE 'pg_%' AND ns.nspname<>'information_schema' AND relation.oid IS DISTINCT FROM ${tableOid}),
 'eventTriggers',(SELECT jsonb_agg(to_jsonb(event_trigger) ORDER BY event_trigger.oid) FROM pg_event_trigger event_trigger));
 PERFORM set_config`);
  return source.replaceAll('municontrol_sql111.', prefix);
}

function modeCheck(mode) {
  const readOnly = mode === 'verify' || mode === 'absent';
  const selection = mode === 'install' ? `
 IF names=0 AND relations=0 AND types=0 THEN PERFORM set_config('${prefix}mode','install',true);
 ELSIF names=15 AND relations=6 AND types=2 AND ${tableOid} IS NOT NULL THEN PERFORM set_config('${prefix}mode','repeat',true);
 ELSE RAISE EXCEPTION 'FAMILY_INSTALL_OBJECT_CONFLICT';END IF;` : mode === 'absent' ? `
 IF names<>0 OR relations<>0 OR types<>0 THEN RAISE EXCEPTION 'FAMILY_INSTALL_ROLLBACK_NOT_ABSENT';END IF;
 PERFORM set_config('${prefix}mode','absent',true);` : `
 IF names<>15 OR relations<>6 OR types<>2 OR ${tableOid} IS NULL THEN RAISE EXCEPTION 'FAMILY_INSTALL_OBJECT_CONFLICT';END IF;
 PERFORM set_config('${prefix}mode',${quote(mode)},true);`;
  return `DO $family_mode$ DECLARE names integer;relations integer;types integer; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${quote(readOnly ? 'on' : 'off')} THEN RAISE EXCEPTION 'FAMILY_INSTALL_TRANSACTION_MODE';END IF;
 IF NOT pg_try_advisory_xact_lock(171) OR NOT pg_try_advisory_xact_lock(226) THEN RAISE EXCEPTION 'FAMILY_INSTALL_BUSY';END IF;
 SELECT count(*) INTO names FROM pg_proc WHERE ${functionScope};
 SELECT count(*) INTO relations FROM pg_class WHERE ${relationScope};
 SELECT count(*) INTO types FROM pg_type WHERE ${typeScope};${selection}
 IF ${tableOid} IS NOT NULL THEN LOCK TABLE public.${table} IN ACCESS SHARE MODE NOWAIT;END IF;
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'FAMILY_INSTALL_BUSY';END $family_mode$`;
}

function familyObjectsCheck(newPins) {
  const functionCheck = pinsCheck(newPins, 'FAMILY_INSTALL_FUNCTION_CHANGED');
  const tableCheck = salaryConditionsTableCheck().replaceAll('own_salary_conditions', 'own_family_payroll_facts').replaceAll('SALARY_CONDITIONS_', 'FAMILY_PAYROLL_FACTS_');
  return functionCheck + ';' + tableCheck + `;
 DO $family_objects$ DECLARE pin jsonb;fn pg_proc;actual jsonb;expected jsonb; BEGIN
 IF(SELECT count(*) FROM pg_proc WHERE ${functionScope})<>15
 OR(SELECT count(*) FROM pg_class WHERE ${relationScope})<>6
 OR(SELECT count(*) FROM pg_type WHERE ${typeScope})<>2
 OR EXISTS(SELECT 1 FROM pg_class WHERE ${relationScope} AND oid NOT IN ${newRelations})
 OR EXISTS(SELECT 1 FROM pg_type WHERE ${typeScope} AND oid NOT IN ${newTypes})
 THEN RAISE EXCEPTION 'FAMILY_INSTALL_OBJECT_CONFLICT';END IF;
 IF EXISTS(SELECT 1 FROM pg_class idx JOIN pg_am am ON am.oid=idx.relam WHERE idx.oid IN(SELECT indexrelid FROM pg_index WHERE indrelid=${tableOid}) AND(idx.relowner<>current_user::regrole OR idx.relacl IS NOT NULL OR idx.reloptions IS NOT NULL OR am.amname<>'btree')) THEN RAISE EXCEPTION 'FAMILY_INSTALL_INDEX_SECURITY';END IF;
 FOR pin IN SELECT value FROM jsonb_array_elements(${quote(JSON.stringify(newPins))}::jsonb) LOOP
 SELECT * INTO fn FROM pg_proc WHERE oid=to_regprocedure(pin->>'signature');
 SELECT jsonb_agg(jsonb_build_array(acl.grantor,acl.grantee,acl.privilege_type,acl.is_grantable) ORDER BY acl.grantee,acl.privilege_type,acl.is_grantable,acl.grantor) INTO actual FROM aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) acl;
 SELECT jsonb_agg(jsonb_build_array(fn.proowner,grantee,'EXECUTE',false) ORDER BY grantee) INTO expected FROM(SELECT fn.proowner AS grantee UNION ALL SELECT 'municontrol_actions_runtime_app'::regrole::oid WHERE(pin->>'runtime')::boolean) allowed;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FAMILY_INSTALL_FUNCTION_ACL_CHANGED' USING DETAIL=pin->>'signature';END IF;
 END LOOP;
 END $family_objects$`;
}

function existingFamilyRowsSnapshot(slot) {
  return `DO $family_rows$ DECLARE rows_sha text; BEGIN
 IF current_setting('${prefix}mode')='repeat' THEN
 SELECT encode(public.digest(coalesce(string_agg(row_sha,'' ORDER BY row_sha COLLATE "C"),''),'sha256'),'hex') INTO rows_sha FROM(SELECT encode(public.digest(to_jsonb(event)::text,'sha256'),'hex') AS row_sha FROM public.${table} event) hashed;
 PERFORM set_config('${prefix}family_rows_${slot}',rows_sha,true);
 END IF;END $family_rows$`;
}

export function buildOwnContractFamilyPayrollFactsInstallation({read, sourceCommit}) {
  assert.equal(typeof read, 'function');
  assert.equal(sourceCommit, FAMILY_PAYROLL_FACTS_SOURCE_COMMIT, 'FAMILY_INSTALL_SOURCE_COMMIT_CHANGED');
  const texts = {}, sourceHashes = {};
  for (const [file, expected] of Object.entries(FAMILY_PAYROLL_FACTS_SOURCE_PINS)) {
    const source = read(file).replace(/\r\n?/g, '\n');
    assert.equal(hash(source), expected, 'FAMILY_INSTALL_SOURCE_CHANGED: ' + file);
    texts[file] = source;
    sourceHashes[file] = expected;
  }
  const migration = splitPostgresStatements(texts[FAMILY_PAYROLL_FACTS_FILE]);
  assert.ok(migration.every(statement => !/^\s*(BEGIN|COMMIT|ROLLBACK|CREATE OR REPLACE)\b/i.test(statement)));
  const definitions = migration.filter(statement => /^CREATE FUNCTION public\./.test(statement));
  const newPins = definitions.map(definition => {
    const pin = ownInstallationFunctionPin(definition);
    return {...pin, runtime: facades.has(pin.name)};
  });
  assert.equal(newPins.length, 15);
  assert.equal(new Set(newPins.map(pin => pin.name)).size, 15);
  assert.equal(newPins.filter(pin => pin.runtime).length, 4);
  assert.ok(newPins.every(pin => pin.name.startsWith(namespace)));
  const conditions = splitPostgresStatements(texts['scripts/migrations/171-own-contract-salary-conditions.sql']);
  const structural = statements => statements.filter(statement => /^(CREATE TABLE|CREATE (?:UNIQUE )?INDEX|ALTER TABLE|REVOKE ALL ON public\.|CREATE TRIGGER)\b/.test(statement));
  assert.deepEqual(structural(migration), structural(conditions).map(statement => statement.replaceAll('own_salary_conditions', 'own_family_payroll_facts').replaceAll('SALARY_CONDITIONS_', 'FAMILY_PAYROLL_FACTS_')), 'FAMILY_INSTALL_TABLE_CLONE_CHANGED');
  const sourceFunction = (file, name) => {
    const statements = splitPostgresStatements(texts[file]);
    const found = statements.filter(statement => new RegExp('^CREATE (?:OR REPLACE )?FUNCTION (?:public\\.)?' + name + '\\(').test(statement));
    assert.equal(found.length, 1, 'FAMILY_INSTALL_PREREQUISITE_SOURCE_MISSING: ' + name);
    return {...ownInstallationFunctionPin(found[0]), runtime: false};
  };
  // The fixed current profile consumes the existing224 successor definitions.
  // Only metadata is derived here. Its atomic migration is never appended to226.
  const current224 = texts['scripts/migrations/224-native-employment-void.sql'];
  assert.equal(splitPostgresStatements(current224).length, 1, 'FAMILY_INSTALL_224_ATOMIC_SOURCE_CHANGED');
  const current224Blob = createHash('sha1').update('blob ' + Buffer.byteLength(current224) + '\0').update(current224).digest('hex');
  assert.equal(current224Blob, '80c85232ea744740bc88a24a92608f8b90ad9bee', 'FAMILY_INSTALL_224_GIT_BLOB_CHANGED');
  assert.ok(current224.includes('DO $preflight$') && current224.includes('VOID_LEDGER_REQUIRED') && current224.includes('VOID_READER_BASE_CHANGED: payroll_fixed_registry_subject_v2') && current224.includes('VOID_READER_BASE_CHANGED: payroll_fixed_registry_range_v2'), 'FAMILY_INSTALL_224_SOURCE_GUARDS_CHANGED');
  const current224Function = name => {
    const marker = 'CREATE OR REPLACE FUNCTION public.' + name + '(';
    assert.equal(current224.split(marker).length, 2, 'FAMILY_INSTALL_224_DEFINITION_COUNT: ' + name);
    const remaining = current224.slice(current224.indexOf(marker));
    const tag = /\bAS\s+(\$[a-z_0-9]*\$)/i.exec(remaining);
    assert.ok(tag, 'FAMILY_INSTALL_224_DEFINITION_BODY: ' + name);
    const closing = remaining.indexOf(tag[1], tag.index + tag[0].length);
    assert.ok(closing > tag.index && remaining[closing + tag[1].length] === ';', 'FAMILY_INSTALL_224_DEFINITION_END: ' + name);
    const definition = remaining.slice(0, closing + tag[1].length + 1);
    const header = definition.slice(0, tag.index)
      .replace("SET search_path TO 'pg_catalog', 'public', 'pg_temp'", 'SET search_path=pg_catalog,public,pg_temp')
      .replace(/\s+/g, ' ');
    return {...ownInstallationFunctionPin(header + definition.slice(tag.index)), runtime: false};
  };
  const administrative = /export const SALARY_ADMINISTRATIVE_CONTEXT=`([^`]+)`;/.exec(texts['scripts/lib/salary-administrative-identity-installation.mjs']);
  assert.ok(administrative, 'FAMILY_INSTALL_ADMINISTRATIVE_SOURCE_MISSING');
  const prerequisitePins = [
    {...ownInstallationFunctionPin(administrative[1]), runtime: false},
    ...['native_salary_lock_v1', 'native_salary_scope_v1', 'native_salary_serialized_v1'].map(name => sourceFunction('scripts/migrations/112-native-salary-definitions.sql', name)),
    ...['own_program_exact_v1', 'own_program_text_v1'].map(name => sourceFunction('scripts/migrations/122-own-payroll-programs.sql', name)),
    ...['payroll_fixed_registry_subject_v2', 'payroll_fixed_registry_range_v2'].map(current224Function),
    sourceFunction('scripts/migrations/007-action-center-read-facades.sql', 'action_center_context_has_capability'),
  ];
  const directCalls = [...definitions.join('\n').matchAll(/\bpublic\.([a-z0-9_]+)\(/g)].map(match => match[1]);
  const externalCalls = [...new Set(directCalls.filter(name => !name.startsWith(namespace) && name !== 'digest'))].sort();
  assert.deepEqual(externalCalls, prerequisitePins.map(pin => pin.name).sort(), 'FAMILY_INSTALL_UNPINNED_DIRECT_DEPENDENCY');
  const prerequisiteCheck = pinsCheck(prerequisitePins, 'FAMILY_INSTALL_PREREQUISITE_CHANGED');
  const objectCheck = familyObjectsCheck(newPins);
  const before = familyPayrollFactsPreservationSnapshot('before', newPins);
  const after = familyPayrollFactsPreservationSnapshot('after', newPins);
  const conservation = `DO $family_conservation$ BEGIN
 IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'FAMILY_INSTALL_PRIOR_STATE_CHANGED';END IF;
 IF current_setting('${prefix}mode')='repeat' THEN
 IF current_setting('${prefix}family_rows_before') IS DISTINCT FROM current_setting('${prefix}family_rows_after') THEN RAISE EXCEPTION 'FAMILY_INSTALL_EXISTING_EVENT_ROWS_CHANGED';END IF;
 END IF;
 END $family_conservation$`;
  const choose = `DO $family_choose$ BEGIN IF current_setting('${prefix}mode')='repeat' THEN EXECUTE ${quote(objectCheck)};END IF;END $family_choose$`;
  const apply = `DO $family_apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN
${migration.map(statement => 'EXECUTE ' + quote(statement) + ';').join('\n')}
 IF(SELECT count(*) FROM public.${table})<>0 THEN RAISE EXCEPTION 'FAMILY_INSTALL_NEW_TABLE_NOT_EMPTY';END IF;
 END IF;END $family_apply$`;
  const names = newPins.map(pin => quote(pin.name)).join(',');
  const objectFingerprint = `encode(public.digest(jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('oid',relation.oid,'name',relation.relname,'owner',relation.relowner,'acl',relation.relacl,'options',relation.reloptions,'rls',relation.relrowsecurity,'forceRls',relation.relforcerowsecurity,'type',relation.reltype,'kind',relation.relkind,'persistence',relation.relpersistence,'am',relation.relam) ORDER BY relation.oid) FROM pg_class relation WHERE relation.oid IN ${newRelations}),
 'types',(SELECT jsonb_agg(to_jsonb(typ) ORDER BY typ.oid) FROM pg_type typ WHERE typ.oid IN ${newTypes}),
 'columns',(SELECT jsonb_agg(to_jsonb(attribute) ORDER BY attribute.attrelid,attribute.attnum) FROM pg_attribute attribute WHERE attribute.attrelid IN ${newRelations}),
 'defaults',(SELECT jsonb_agg(to_jsonb(def) ORDER BY def.oid) FROM pg_attrdef def WHERE def.adrelid=${tableOid}),
 'constraints',(SELECT jsonb_agg(to_jsonb(constraint_row) ORDER BY constraint_row.oid) FROM pg_constraint constraint_row WHERE constraint_row.conrelid=${tableOid}),
 'indexes',(SELECT jsonb_agg(to_jsonb(idx) ORDER BY idx.indexrelid) FROM pg_index idx WHERE idx.indrelid=${tableOid}),
 'triggers',(SELECT jsonb_agg(to_jsonb(trigger_row) ORDER BY trigger_row.oid) FROM pg_trigger trigger_row WHERE trigger_row.tgrelid=${tableOid} OR trigger_row.tgconstraint IN ${newForeignConstraints}),
 'functions',(SELECT jsonb_agg(jsonb_build_object('catalog',to_jsonb(fn),'xmin',fn.xmin::text) ORDER BY fn.oid) FROM pg_proc fn WHERE fn.pronamespace='public'::regnamespace AND fn.proname IN(${names})))::text,'sha256'),'hex')`;
  const proof = transactionDataPreserved => `SELECT jsonb_build_object(
 'version',${quote(version)},'sourceCommit',${quote(sourceCommit)},'backendPid',pg_backend_pid(),'sourceHashes',${quote(JSON.stringify(sourceHashes))}::jsonb,'mode',current_setting('${prefix}mode'),
 'tablesAdded',CASE WHEN current_setting('${prefix}mode')='install' THEN 1 ELSE 0 END,'functionsAdded',CASE WHEN current_setting('${prefix}mode')='install' THEN 15 ELSE 0 END,
 'newTables',1,'newFunctions',15,'runtimeFacades',4,'adaptedFunctions',0,'existingAclChanges',0,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,
 'eventRows',(SELECT count(*) FROM public.${table}),'transactionDataPreserved',${transactionDataPreserved},${transactionDataPreserved ? `'beforeFingerprint',encode(public.digest(current_setting('${prefix}before')::jsonb::text,'sha256'),'hex'),` : ''}
 'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),
 'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix + 'after')},'priorTableCount',jsonb_array_length(current_setting('${prefix}after')::jsonb->'tables'),
 'tableOid',${tableOid}::oid::text,'objectFingerprint',${objectFingerprint}) AS proof`;
  const installation = [modeCheck('install'), prerequisiteCheck, choose, before, existingFamilyRowsSnapshot('before'), apply, objectCheck, prerequisiteCheck, after, existingFamilyRowsSnapshot('after'), conservation, proof(true)];
  const repetition = [modeCheck('repeat'), prerequisiteCheck, objectCheck, before, existingFamilyRowsSnapshot('before'), objectCheck, prerequisiteCheck, after, existingFamilyRowsSnapshot('after'), conservation, proof(true)];
  const durableVerification = [modeCheck('verify'), prerequisiteCheck, objectCheck, after, proof(false)];
  const rollbackVerification = [modeCheck('absent'), prerequisiteCheck, after,
    `SELECT jsonb_build_object('version',${quote(version)},'sourceCommit',${quote(sourceCommit)},'backendPid',pg_backend_pid(),'sourceHashes',${quote(JSON.stringify(sourceHashes))}::jsonb,'mode','absent','newObjectsAbsent',true,'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix + 'after')},'businessWrites',0,'nominalRowsReturned',0) AS proof`];
  return {version, sourceCommit, sourceHashes, migration, newPins, prerequisitePins, prerequisiteCheck, objectCheck,
    before, after, conservation, choose, apply, installation, repetition, durableVerification, rollbackVerification,
    connects: false, executesSql: false};
}

export function prepareOwnContractFamilyPayrollFactsInstallation(options) {
  const batch = buildOwnContractFamilyPayrollFactsInstallation(options);
  const transaction = (target, statements, completion, readOnly = false) => ({begin: 'BEGIN',
    statements: [...(readOnly ? ['SET TRANSACTION READ ONLY'] : []), ...ownInstallationSettings,
      ownInstallationDestination(target), ...statements], completion, readOnly});
  return {...batch, targets: OWN_RELEASE_TARGETS.map(target => ({...target, transactions: {
    rehearsal: transaction(target, batch.installation, 'ROLLBACK'),
    rollbackVerification: transaction(target, batch.rollbackVerification, 'COMMIT', true),
    install: transaction(target, batch.installation, 'COMMIT'),
    durable: transaction(target, batch.durableVerification, 'COMMIT', true),
    repeat: transaction(target, batch.repetition, 'COMMIT'),
  }}))};
}

export function assertOwnContractFamilyPayrollFactsRollback({rehearsed, absent, batch}) {
  assert.equal(rehearsed.mode, 'install', 'FAMILY_INSTALL_REHEARSAL_REQUIRES_ABSENT_START');
  assert.equal(rehearsed.version, version);
  assert.equal(rehearsed.sourceCommit, batch.sourceCommit);
  assert.deepEqual(rehearsed.sourceHashes, batch.sourceHashes);
  for (const [field, expected] of Object.entries({tablesAdded: 1, functionsAdded: 15, newTables: 1,
    newFunctions: 15, runtimeFacades: 4, adaptedFunctions: 0, existingAclChanges: 0,
    roleAssignmentsAdded: 0, businessWrites: 0, nominalRowsReturned: 0, eventRows: 0})) assert.equal(rehearsed[field], expected, field);
  for (const field of ['preservationSha256', 'priorMetadataSha256', 'objectFingerprint']) assert.match(rehearsed[field], fingerprintPattern);
  assert.equal(rehearsed.transactionDataPreserved, true);
  assert.equal(rehearsed.beforeFingerprint, rehearsed.preservationSha256);
  assert.equal(absent.version, version);
  assert.equal(absent.sourceCommit, batch.sourceCommit);
  assert.deepEqual(absent.sourceHashes, batch.sourceHashes);
  assert.equal(absent.mode, 'absent');
  assert.equal(absent.newObjectsAbsent, true);
  assert.ok(Number.isSafeInteger(rehearsed.backendPid) && rehearsed.backendPid > 0);
  assert.ok(Number.isSafeInteger(absent.backendPid) && absent.backendPid > 0);
  assert.notEqual(rehearsed.backendPid, absent.backendPid, 'FAMILY_INSTALL_ABSENCE_CONNECTION_REUSED');
  assert.equal(absent.businessWrites, 0);
  assert.equal(absent.nominalRowsReturned, 0);
  assert.match(absent.priorMetadataSha256, fingerprintPattern);
  assert.equal(absent.priorMetadataSha256, rehearsed.priorMetadataSha256, 'FAMILY_INSTALL_REHEARSAL_NOT_ROLLED_BACK');
  return {passed: true, independentAbsenceVerified: true, nominalRowsReturned: 0};
}

export function assertOwnContractFamilyPayrollFactsDurability({installed, durable, repeated, batch}) {
  for (const [name, receipt] of Object.entries({installed, durable, repeated})) {
    assert.equal(receipt.version, version);
    assert.equal(receipt.sourceCommit, batch.sourceCommit);
    assert.deepEqual(receipt.sourceHashes, batch.sourceHashes);
    assert.equal(receipt.transactionDataPreserved, name !== 'durable');
    for (const [field, expected] of Object.entries({newTables: 1, newFunctions: 15, runtimeFacades: 4,
      adaptedFunctions: 0, existingAclChanges: 0, roleAssignmentsAdded: 0, businessWrites: 0, nominalRowsReturned: 0})) assert.equal(receipt[field], expected, field);
    assert.ok(Number.isSafeInteger(receipt.priorTableCount) && receipt.priorTableCount > 0);
    assert.ok(Number.isSafeInteger(receipt.eventRows) && receipt.eventRows >= 0);
    for (const field of ['preservationSha256', 'priorMetadataSha256', 'objectFingerprint']) assert.match(receipt[field], fingerprintPattern);
    assert.match(receipt.tableOid, /^[1-9][0-9]*$/);
    assert.ok(Number.isSafeInteger(receipt.backendPid) && receipt.backendPid > 0);
    if (name !== 'durable') assert.equal(receipt.beforeFingerprint, receipt.preservationSha256, 'FAMILY_INSTALL_TRANSACTION_NOT_PRESERVED');
  }
  assert.ok(['install', 'repeat'].includes(installed.mode));
  assert.equal(installed.tablesAdded, installed.mode === 'install' ? 1 : 0);
  assert.equal(installed.functionsAdded, installed.mode === 'install' ? 15 : 0);
  assert.equal(new Set([installed.backendPid, durable.backendPid, repeated.backendPid]).size, 3, 'FAMILY_INSTALL_CONNECTION_REUSED');
  assert.equal(durable.mode, 'verify');
  assert.equal(repeated.mode, 'repeat');
  for (const receipt of [durable, repeated]) {
    assert.equal(receipt.tablesAdded, 0);
    assert.equal(receipt.functionsAdded, 0);
    for (const field of ['priorTableCount', 'priorMetadataSha256', 'tableOid', 'objectFingerprint']) assert.equal(receipt[field], installed[field], 'FAMILY_INSTALL_NOT_DURABLE: ' + field);
  }
  return {passed: true, transactionDataPreserved: true, priorMetadataPreserved: true,
    wholeDatabaseStaticAcrossConnections: false, repeatedWithoutDdl: true,
    existingAclChanges: 0, businessWrites: 0, nominalRowsReturned: 0};
}
