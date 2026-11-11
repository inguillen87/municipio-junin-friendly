// Pure, source-pinned protocol construction. The caller owns each connection.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './sql-statements.mjs';
import {ownInstallationFunctionPin} from './own-payroll-installation.mjs';
import {pinsCheck, preservationSnapshot} from './native-leave-installation.mjs';
import {installationPriorMetadataFingerprint} from './installation-prior-metadata.mjs';
import {salaryConditionsTableCheck} from './own-contract-salary-conditions-installation.mjs';
import {ownInstallationDestination, ownInstallationSettings} from '../prepare-own-payroll-installation.mjs';
import {OWN_RELEASE_TARGETS} from './own-payroll-release-target.mjs';

export const SALARY_CONDITIONS_PENDING_FILE = 'scripts/migrations/227-own-salary-conditions-pending.sql';
export const SALARY_CONDITIONS_PENDING_SHA256 = '170acf1c69100782ee4ce33b54dc6db0d0c8791afbc598059688c30ab008668a';
export const SALARY_CONDITIONS_PENDING_SOURCE_PINS = Object.freeze({
  [SALARY_CONDITIONS_PENDING_FILE]: SALARY_CONDITIONS_PENDING_SHA256,
  'scripts/migrations/171-own-contract-salary-conditions.sql': '42c253a0395abf7abe326804cdd1a641d6936df84c960728c1e6a6aa6319c8ee',
  'scripts/migrations/007-action-center-read-facades.sql': 'd0e04ca20e3b67518d1340fe38d409fc3c7b339da4dee20e7a6850ebadbc8a1e',
  'scripts/lib/own-contract-salary-conditions-installation.mjs': '28b0d48ffe6271fdb6a022eb4f083545337c0a7005d6cd21cacbbad1529c4d5f',
  'scripts/lib/own-payroll-installation.mjs': '6ad8f07733adfb17b6a32a6efd228073bfb3566844b858167581e2d7896bb3d0',
  'scripts/lib/native-leave-installation.mjs': '57d7f79c358665dc208dfcb9b0d7b2a2ecebaba84dfb6c6057bb3acef6bb25ef',
  'scripts/lib/installation-prior-metadata.mjs': 'b86d85a76a3c61bf963f61b9a991df65b1caec6056a74fe0c7396db4e808f8c9',
  'scripts/lib/sql-statements.mjs': 'd81477c5aed918e944aefe16d05015080acc4fe543059cbf15e2c69e9f5201c2',
  'scripts/prepare-own-payroll-installation.mjs': '8984ec722bf2928ec2e177e6e3bf4f21b4a95f182452bdaa5e29a6f1ea8854e7',
  'scripts/lib/own-payroll-release-target.mjs': '85c1f346424ee97279434701245bb50bf819850a3114405d0647fe846721d448',
});

const functionName = 'own_salary_conditions_pending_v1';
const signature = 'public.' + functionName + '(jsonb)';
const prefix = 'municontrol_salary_conditions_pending_install.';
const version = 'own-salary-conditions-pending-installation.v1';
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprintPattern = /^[a-f0-9]{64}$/;
const namespaceCount = `(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=${quote(functionName)})`;

function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, 'SALARY_PENDING_SNAPSHOT_ANCHOR_CHANGED');
  return source.replace(anchor, () => replacement);
}

export function salaryConditionsPendingPreservationSnapshot(slot) {
  let source = preservationSnapshot(slot);
  const leaveExclusion = " AND p.oid IS DISTINCT FROM to_regclass('public.native_leave_event')";
  assert.equal(source.split(leaveExclusion).length, 3, 'SALARY_PENDING_TABLE_EXCLUSION_CHANGED');
  source = source.replaceAll(leaveExclusion, '');
  source = replaceOnce(source,
    "NOT(s.nspname='public' AND p.proname LIKE 'native_leave_%')",
    `p.oid IS DISTINCT FROM to_regprocedure(${quote(signature)})`);
  source = replaceOnce(source, "p.relkind IN ('r','p')", "p.relkind IN ('r','p','m')");
  // Foreign rows cannot be preserved by an ordinary local transaction snapshot.
  source = replaceOnce(source, ' BEGIN\n FOR c', ` BEGIN
 IF EXISTS(SELECT 1 FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname<>'information_schema' AND relation.relkind='f') THEN RAISE EXCEPTION 'SALARY_PENDING_FOREIGN_TABLE_UNAUDITED';END IF;
 FOR c`);
  source = replaceOnce(source, ' PERFORM set_config', ` result:=result||jsonb_build_object(
 'relations',(SELECT jsonb_agg(jsonb_build_object('oid',relation.oid,'namespace',relation.relnamespace,'name',relation.relname,'kind',relation.relkind,'owner',relation.relowner,'acl',relation.relacl,'options',relation.reloptions,'persistence',relation.relpersistence,'rls',relation.relrowsecurity,'forceRls',relation.relforcerowsecurity,'replicaIdentity',relation.relreplident,'tablespace',relation.reltablespace,'accessMethod',relation.relam,'rowType',relation.reltype,'typedTable',relation.reloftype,'isPartition',relation.relispartition,'partitionBound',relation.relpartbound) ORDER BY relation.oid) FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname<>'information_schema'),
 'types',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_type t JOIN pg_namespace namespace ON namespace.oid=t.typnamespace WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname<>'information_schema'),
 'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class relation ON relation.oid=a.attrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname<>'information_schema'),
 'indexes',(SELECT jsonb_agg(jsonb_build_object('metadata',to_jsonb(i),'definition',pg_get_indexdef(i.indexrelid)) ORDER BY i.indexrelid) FROM pg_index i JOIN pg_class relation ON relation.oid=i.indrelid JOIN pg_namespace namespace ON namespace.oid=relation.relnamespace WHERE namespace.nspname NOT LIKE 'pg_%' AND namespace.nspname<>'information_schema'),
 'eventTriggers',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.oid) FROM pg_event_trigger e));
 PERFORM set_config`);
  return source.replaceAll('municontrol_sql111.', prefix);
}

function modeCheck(mode) {
  const readOnly = mode === 'verify' || mode === 'absent';
  return `DO $pending_mode$ DECLARE names integer; BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('transaction_read_only')<>${quote(readOnly ? 'on' : 'off')} THEN RAISE EXCEPTION 'SALARY_PENDING_TRANSACTION_MODE';END IF;
 IF NOT pg_try_advisory_xact_lock(171) OR NOT pg_try_advisory_xact_lock(hashtextextended('own-salary-conditions-pending-installation:v1',0)) THEN RAISE EXCEPTION 'SALARY_PENDING_INSTALL_BUSY';END IF;
 LOCK TABLE public.own_salary_conditions_event IN ACCESS SHARE MODE NOWAIT;
 names:=${namespaceCount};
 ${mode === 'install' ? `IF names=0 THEN PERFORM set_config('${prefix}mode','install',true);
 ELSIF names=1 AND to_regprocedure(${quote(signature)}) IS NOT NULL THEN PERFORM set_config('${prefix}mode','repeat',true);
 ELSE RAISE EXCEPTION 'SALARY_PENDING_OBJECT_CONFLICT';END IF;` :
 mode === 'absent' ? `IF names<>0 THEN RAISE EXCEPTION 'SALARY_PENDING_ROLLBACK_NOT_ABSENT';END IF;PERFORM set_config('${prefix}mode','absent',true);` :
 `IF names<>1 OR to_regprocedure(${quote(signature)}) IS NULL THEN RAISE EXCEPTION 'SALARY_PENDING_OBJECT_CONFLICT';END IF;PERFORM set_config('${prefix}mode',${quote(mode)},true);`}
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SALARY_PENDING_INSTALL_BUSY';END $pending_mode$`;
}

function newFunctionCheck(pin) {
  return pinsCheck([pin], 'SALARY_PENDING_FUNCTION_CHANGED') + `;
 DO $pending_function$ DECLARE p pg_proc;actual jsonb;expected jsonb; BEGIN
 IF ${namespaceCount}<>1 THEN RAISE EXCEPTION 'SALARY_PENDING_OBJECT_CONFLICT';END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(${quote(signature)});
 SELECT jsonb_agg(jsonb_build_array(a.grantor,a.grantee,a.privilege_type,a.is_grantable) ORDER BY a.grantee,a.privilege_type,a.is_grantable,a.grantor) INTO actual FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a;
 SELECT jsonb_agg(jsonb_build_array(p.proowner,grantee,'EXECUTE',false) ORDER BY grantee) INTO expected FROM(VALUES(p.proowner),('municontrol_actions_runtime_app'::regrole::oid)) allowed(grantee);
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'SALARY_PENDING_FUNCTION_ACL_CHANGED';END IF;
 END $pending_function$`;
}

export function buildOwnSalaryConditionsPendingInstallation({read, sourceCommit}) {
  assert.equal(typeof read, 'function');
  assert.match(sourceCommit, /^[a-f0-9]{40}$/);
  const texts = {};
  const sourceHashes = {};
  for (const [file, expected] of Object.entries(SALARY_CONDITIONS_PENDING_SOURCE_PINS)) {
    const source = read(file).replace(/\r\n?/g, '\n');
    assert.equal(hash(source), expected, 'SALARY_PENDING_SOURCE_CHANGED: ' + file);
    texts[file] = source;
    sourceHashes[file] = expected;
  }
  const migration = splitPostgresStatements(texts[SALARY_CONDITIONS_PENDING_FILE]);
  assert.equal(migration.length, 4, 'SALARY_PENDING_MIGRATION_SHAPE');
  assert.match(migration[0], /\bDO \$pending_prerequisite\$/);
  assert.match(migration[1], /^CREATE FUNCTION public\.own_salary_conditions_pending_v1\(p jsonb\)/);
  assert.match(migration[2], /^REVOKE ALL ON FUNCTION public\.own_salary_conditions_pending_v1/);
  assert.match(migration[3], /^GRANT EXECUTE ON FUNCTION public\.own_salary_conditions_pending_v1/);
  const newPin = {...ownInstallationFunctionPin(migration[1]), runtime: true};
  assert.equal(newPin.signature, signature);
  const conditions = splitPostgresStatements(texts['scripts/migrations/171-own-contract-salary-conditions.sql']);
  const authority = splitPostgresStatements(texts['scripts/migrations/007-action-center-read-facades.sql']);
  const prerequisitePins = [
    ...['own_salary_conditions_context_v1', 'own_salary_conditions_session_live_v1', 'own_salary_conditions_immutable_v1'].map(name => {
      const definition = conditions.find(statement => statement.startsWith('CREATE FUNCTION public.' + name + '('));
      assert.ok(definition, 'SALARY_PENDING_PREREQUISITE_SOURCE_MISSING: ' + name);
      return {...ownInstallationFunctionPin(definition), runtime: false};
    }),
    {...ownInstallationFunctionPin(authority.find(statement => /^CREATE OR REPLACE FUNCTION action_center_context_has_capability\(/.test(statement))), runtime: false},
  ];
  const prerequisiteCheck = pinsCheck(prerequisitePins, 'SALARY_PENDING_PREREQUISITE_CHANGED') + ';' + salaryConditionsTableCheck();
  const functionCheck = newFunctionCheck(newPin);
  const before = salaryConditionsPendingPreservationSnapshot('before');
  const after = salaryConditionsPendingPreservationSnapshot('after');
  const conservation = `DO $pending_conservation$ BEGIN IF current_setting('${prefix}before')::jsonb IS DISTINCT FROM current_setting('${prefix}after')::jsonb THEN RAISE EXCEPTION 'SALARY_PENDING_PRIOR_STATE_CHANGED';END IF;END $pending_conservation$`;
  const choose = `DO $pending_choose$ BEGIN IF current_setting('${prefix}mode')='repeat' THEN EXECUTE ${quote(functionCheck)};END IF;END $pending_choose$`;
  const apply = `DO $pending_apply$ BEGIN IF current_setting('${prefix}mode')='install' THEN\n${migration.map(statement => 'EXECUTE ' + quote(statement) + ';').join('\n')}\nEND IF;END $pending_apply$`;
  const objectFingerprint = `(SELECT encode(public.digest(jsonb_build_object('catalog',to_jsonb(p),'xmin',p.xmin::text)::text,'sha256'),'hex') FROM pg_proc p WHERE p.oid=to_regprocedure(${quote(signature)}))`;
  const proof = transactionDataPreserved => `SELECT jsonb_build_object(
 'version',${quote(version)},'sourceCommit',${quote(sourceCommit)},'sourceHashes',${quote(JSON.stringify(sourceHashes))}::jsonb,'mode',current_setting('${prefix}mode'),
 'functionsAdded',CASE WHEN current_setting('${prefix}mode')='install' THEN 1 ELSE 0 END,'newTables',0,'runtimeFacades',1,'existingAclChanges',0,'roleAssignmentsAdded',0,'businessWrites',0,'nominalRowsReturned',0,
 'transactionDataPreserved',${transactionDataPreserved},${transactionDataPreserved ? `'beforeFingerprint',encode(public.digest(current_setting('${prefix}before')::jsonb::text,'sha256'),'hex'),` : ''}
 'preservationSha256',encode(public.digest(current_setting('${prefix}after')::jsonb::text,'sha256'),'hex'),
 'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix + 'after')},'priorTableCount',jsonb_array_length(current_setting('${prefix}after')::jsonb->'tables'),
 'functionOid',to_regprocedure(${quote(signature)})::oid::text,'functionXmin',(SELECT xmin::text FROM pg_proc WHERE oid=to_regprocedure(${quote(signature)})),'objectFingerprint',${objectFingerprint}) AS proof`;
  const installation = [modeCheck('install'), prerequisiteCheck, choose, before, apply, functionCheck, prerequisiteCheck, after, conservation, proof(true)];
  const repetition = [modeCheck('repeat'), prerequisiteCheck, functionCheck, before, functionCheck, prerequisiteCheck, after, conservation, proof(true)];
  const durableVerification = [modeCheck('verify'), prerequisiteCheck, functionCheck, after, proof(false)];
  const rollbackVerification = [modeCheck('absent'), prerequisiteCheck, after,
    `SELECT jsonb_build_object('version',${quote(version)},'sourceCommit',${quote(sourceCommit)},'mode','absent','functionAbsent',true,'sourceHashes',${quote(JSON.stringify(sourceHashes))}::jsonb,'priorMetadataSha256',${installationPriorMetadataFingerprint(prefix + 'after')},'businessWrites',0,'nominalRowsReturned',0) AS proof`];
  return {version, sourceCommit, sourceHashes, migration, newPin, prerequisitePins, prerequisiteCheck, functionCheck,
    before, after, conservation, choose, apply, installation, repetition, durableVerification, rollbackVerification,
    connects: false, executesSql: false};
}

export function prepareOwnSalaryConditionsPendingInstallation(options) {
  const batch = buildOwnSalaryConditionsPendingInstallation(options);
  const transaction = (target, statements, completion, readOnly = false) => ({begin: 'BEGIN',
    statements: [...(readOnly ? ['SET TRANSACTION READ ONLY'] : []), ...ownInstallationSettings,
      ownInstallationDestination(target), ...statements], completion, readOnly});
  return {...batch, targets: OWN_RELEASE_TARGETS.map(target => ({...target, transactions: {
    rehearsal: transaction(target, batch.installation, 'ROLLBACK'),
    install: transaction(target, batch.installation, 'COMMIT'),
    repeat: transaction(target, batch.repetition, 'COMMIT'),
    durable: transaction(target, batch.durableVerification, 'COMMIT', true),
    rollbackVerification: transaction(target, batch.rollbackVerification, 'COMMIT', true),
  }}))};
}

export function assertOwnSalaryConditionsPendingDurability({installed, durable, repeated, batch}) {
  for (const [name, receipt] of Object.entries({installed, durable, repeated})) {
    assert.equal(receipt.version, version);
    assert.equal(receipt.sourceCommit, batch.sourceCommit);
    assert.deepEqual(receipt.sourceHashes, batch.sourceHashes);
    assert.equal(receipt.transactionDataPreserved, name !== 'durable');
    for (const [field, expected] of Object.entries({newTables: 0, runtimeFacades: 1, existingAclChanges: 0,
      roleAssignmentsAdded: 0, businessWrites: 0, nominalRowsReturned: 0})) assert.equal(receipt[field], expected, field);
    assert.ok(Number.isSafeInteger(receipt.priorTableCount) && receipt.priorTableCount > 0);
    for (const field of ['preservationSha256', 'priorMetadataSha256', 'objectFingerprint']) assert.match(receipt[field], fingerprintPattern);
    assert.match(receipt.functionOid, /^[1-9][0-9]*$/);
    assert.match(receipt.functionXmin, /^[0-9]+$/);
    if (name !== 'durable') assert.equal(receipt.beforeFingerprint, receipt.preservationSha256, 'SALARY_PENDING_TRANSACTION_NOT_PRESERVED');
  }
  assert.ok(['install', 'repeat'].includes(installed.mode));
  assert.equal(installed.functionsAdded, installed.mode === 'install' ? 1 : 0);
  assert.equal(durable.mode, 'verify');
  assert.equal(repeated.mode, 'repeat');
  assert.equal(durable.functionsAdded, 0);
  assert.equal(repeated.functionsAdded, 0);
  for (const receipt of [durable, repeated]) for (const field of ['priorTableCount', 'priorMetadataSha256',
    'functionOid', 'functionXmin', 'objectFingerprint']) assert.equal(receipt[field], installed[field], 'SALARY_PENDING_NOT_DURABLE: ' + field);
  return {passed: true, transactionDataPreserved: true, priorMetadataPreserved: true,
    wholeDatabaseStaticAcrossConnections: false, functionOidPreserved: true, repeatedWithoutDdl: true,
    existingAclChanges: 0, businessWrites: 0, nominalRowsReturned: 0};
}
