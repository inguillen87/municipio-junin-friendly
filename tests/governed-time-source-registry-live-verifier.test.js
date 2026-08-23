import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  EXPECTED_RUNTIME_SECURITY_DEFINERS,
  buildSafeFailure,
  buildSafeSummary,
  loadGovernedTimeSourceQaConfig,
  qaFixtureEmail,
  runTimeSourceMigrationTwice,
  verifyTimeSourceBackendFreeze,
  validateRoleCatalogEvidence,
  validateRuntimeBoundaryEvidence,
} from '../scripts/verify-governed-time-source-registry-live.mjs';

const source = readFileSync(
  new URL('../scripts/verify-governed-time-source-registry-live.mjs', import.meta.url),
  'utf8',
);

function safeEnv(overrides = {}) {
  return {
    TIME_SOURCE_QA_BRANCH_ID: 'br-qa-time-source-010a',
    TIME_SOURCE_QA_BRANCH_NAME: 'qa-time-source-010a-abcdef',
    TIME_SOURCE_QA_PROJECT_ID: 'qa-project-123',
    TIME_SOURCE_QA_ENDPOINT_HOST: 'ep-qa-time-source.us-east-2.aws.neon.tech',
    TIME_SOURCE_QA_DATABASE_NAME: 'neondb',
    TIME_SOURCE_QA_DISPOSABLE_CONFIRMATION: 'DELETE_AFTER_010A_QA',
    CANONICAL_PRODUCTION_BRANCH_ID: 'br-production-999',
    CANONICAL_PRODUCTION_HOST: 'ep-production.us-east-2.aws.neon.tech',
    DATABASE_URL_UNPOOLED:
      'postgresql://qa_owner:owner-secret@ep-qa-time-source.us-east-2.aws.neon.tech/neondb',
    ACTIONS_DATABASE_URL:
      'postgresql://municontrol_actions_runtime_app:runtime-secret@ep-qa-time-source-pooler.us-east-2.aws.neon.tech/neondb',
    NODE_ENV: 'test',
    VERCEL_ENV: 'preview',
    ...overrides,
  };
}

const confirmationArgs = Object.freeze([
  '--confirm-isolated-branch',
]);

function safeRuntimeEvidence() {
  return {
    identity: {
      currentUser: 'municontrol_actions_runtime_app',
      sessionUser: 'municontrol_actions_runtime_app',
    },
    role: {
      canLogin: true,
      inherit: false,
      superuser: false,
      bypassRls: false,
      createDb: false,
      createRole: false,
      replication: false,
    },
    schema: { usage: true, create: false },
    database: { connect: true, create: false },
    schemas: [{ name: 'public', usage: true, create: false }],
    memberships: [],
    ownedObjects: [],
    securityDefiners: EXPECTED_RUNTIME_SECURITY_DEFINERS.map((signature) => ({ signature })),
    relations: [],
    sequences: [],
  };
}

function safeRoleEvidence() {
  return {
    roleCapabilities: [
      { roleKey: 'JUNIN_TIEMPO_FUENTES_APROBADOR', capabilityKey: 'time.source.approve' },
      { roleKey: 'JUNIN_TIEMPO_FUENTES_APROBADOR', capabilityKey: 'time.source.audit.read' },
      { roleKey: 'JUNIN_TIEMPO_FUENTES_APROBADOR', capabilityKey: 'time.source.read' },
      { roleKey: 'JUNIN_TIEMPO_FUENTES_PROPONENTE', capabilityKey: 'time.source.propose' },
      { roleKey: 'JUNIN_TIEMPO_FUENTES_PROPONENTE', capabilityKey: 'time.source.read' },
    ],
    conflicts: [
      { capabilityKey: 'time.overtime.post', conflictsWithKey: 'time.source.approve' },
      { capabilityKey: 'time.source.approve', conflictsWithKey: 'time.source.propose' },
    ],
    platformOwnerCapabilities: [],
    overrides: [],
  };
}

test('gate exige branch descartable explicita y corrobora destino, DB y credenciales', () => {
  const config = loadGovernedTimeSourceQaConfig(safeEnv(), confirmationArgs);
  assert.equal(config.branchId, 'br-qa-time-source-010a');
  assert.equal(config.branchName, 'qa-time-source-010a-abcdef');
  assert.equal(config.databaseName, 'neondb');
  assert.equal(config.ownerUser, 'qa_owner');
  assert.equal(config.runtimeUser, 'municontrol_actions_runtime_app');

  for (const [overrides, args, code] of [
    [{}, [], 'QA_CONFIRMATION_REQUIRED'],
    [{ TIME_SOURCE_QA_DISPOSABLE_CONFIRMATION: 'yes' }, confirmationArgs,
      'QA_DISPOSABLE_CONFIRMATION_REQUIRED'],
    [{ TIME_SOURCE_QA_BRANCH_NAME: 'feature-time-source' }, confirmationArgs,
      'QA_BRANCH_NOT_DISPOSABLE'],
    [{ TIME_SOURCE_QA_BRANCH_ID: 'br-production-999' }, confirmationArgs,
      'QA_PRODUCTION_TARGET_FORBIDDEN'],
    [{ TIME_SOURCE_QA_ENDPOINT_HOST: 'ep-production.us-east-2.aws.neon.tech' },
      confirmationArgs, 'QA_PRODUCTION_TARGET_FORBIDDEN'],
    [{ DATABASE_URL_UNPOOLED:
      'postgresql://qa_owner:x@ep-qa-time-source-pooler.us-east-2.aws.neon.tech/neondb' },
    confirmationArgs, 'QA_OWNER_MUST_BE_UNPOOLED'],
    [{ ACTIONS_DATABASE_URL:
      'postgresql://qa_owner:x@ep-qa-time-source.us-east-2.aws.neon.tech/neondb' },
    confirmationArgs, 'QA_CREDENTIAL_SEPARATION_REQUIRED'],
    [{ NODE_ENV: 'production' }, confirmationArgs, 'QA_PRODUCTION_ENVIRONMENT_FORBIDDEN'],
  ]) {
    assert.throws(
      () => loadGovernedTimeSourceQaConfig(safeEnv(overrides), args),
      (error) => error.code === code,
    );
  }
});

test('allowlist SECDEF es global, exacta y runtime no posee relaciones ni secuencias', () => {
  assert.equal(EXPECTED_RUNTIME_SECURITY_DEFINERS.length, 30);
  assert.equal(new Set(EXPECTED_RUNTIME_SECURITY_DEFINERS).size, 30);
  assert.deepEqual(EXPECTED_RUNTIME_SECURITY_DEFINERS.slice(-4), [
    'public.time_source_registry_bootstrap_v1(text,uuid,integer,text,uuid,uuid)',
    'public.time_source_registry_list_v1(text,uuid,integer,text,uuid,uuid,text,text,integer,integer)',
    'public.time_source_registry_detail_v1(text,uuid,integer,text,uuid,uuid,uuid)',
    'public.time_source_registry_apply_command_v1(text,uuid,integer,text,uuid,uuid,text,uuid,integer,uuid,text,jsonb,text,text)',
  ]);
  assert.doesNotThrow(() => validateRuntimeBoundaryEvidence(safeRuntimeEvidence()));

  const cases = [
    ['QA_SECDEF_OUTSIDE_ALLOWLIST', (value) => value.securityDefiners.push({ signature: 'public.extra()' })],
    ['QA_SECDEF_MISSING', (value) => value.securityDefiners.pop()],
    ['QA_RUNTIME_RELATION_PRIVILEGE', (value) => value.relations.push({ name: 'public.action_case' })],
    ['QA_RUNTIME_SEQUENCE_PRIVILEGE', (value) => value.sequences.push({ name: 'public.any_seq' })],
    ['QA_RUNTIME_ROLE_MEMBERSHIP', (value) => value.memberships.push({ name: 'qa_owner' })],
    ['QA_RUNTIME_OBJECT_OWNERSHIP', (value) => value.ownedObjects.push({ kind: 'table', name: 'public.x' })],
    ['QA_RUNTIME_ROLE_DRIFT', (value) => { value.role.bypassRls = true; }],
    ['QA_RUNTIME_SCHEMA_DRIFT', (value) => { value.schemas[0].create = true; }],
  ];
  for (const [code, mutate] of cases) {
    const evidence = safeRuntimeEvidence();
    mutate(evidence);
    assert.throws(
      () => validateRuntimeBoundaryEvidence(evidence),
      (error) => error.code === code,
    );
  }
});

test('roles temporales son exactos y PLATFORM_OWNER no hereda autoridad operativa', () => {
  assert.doesNotThrow(() => validateRoleCatalogEvidence(safeRoleEvidence()));

  const inherited = safeRoleEvidence();
  inherited.roleCapabilities.push({
    roleKey: 'PLATFORM_OWNER', capabilityKey: 'time.source.read',
  });
  inherited.platformOwnerCapabilities.push({ capabilityKey: 'time.source.read' });
  assert.throws(() => validateRoleCatalogEvidence(inherited));

  const override = safeRoleEvidence();
  override.overrides.push({ capabilityKey: 'time.source.approve' });
  assert.throws(
    () => validateRoleCatalogEvidence(override),
    (error) => error.code === 'QA_TIME_SOURCE_OVERRIDE_DRIFT',
  );
});

test('aplicador 010 se ejecuta y reejecuta exactamente dos veces sin propagar salida', async () => {
  const config = loadGovernedTimeSourceQaConfig(safeEnv(), confirmationArgs);
  const calls = [];
  const result = await runTimeSourceMigrationTwice(config, async (received, ordinal) => {
    calls.push({ same: received === config, ordinal });
    return { stdout: 'no debe imprimirse', stderr: '' };
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    { same: true, ordinal: 1 },
    { same: true, ordinal: 2 },
  ]);
});

test('freeze backend #2 se verifica por bytes antes de cualquier conexion', async () => {
  assert.equal(await verifyTimeSourceBackendFreeze(), true);
  const freezeAt = source.indexOf("stage('local-freeze'");
  const preflightAt = source.indexOf("stage('branch-preflight'");
  const migrationAt = source.indexOf("stage('migration-apply-reapply'");
  assert.ok(freezeAt > 0 && preflightAt > freezeAt && migrationAt > preflightAt);
  for (const hash of [
    '66ab3584315db1baba52f08ac7579eddbe04898fd5fa2c383f4e778a2f1a7034',
    'a791b1c5e0d1c46126bbea81b2a93633db97fe57376cb1dd0b2216d1c83ceea7',
    '28664fa7bbf26d8a501ffc9b4c175c083137f622e4a36a4a2b45069e506b07c4',
  ]) assert.ok(source.includes(hash));
});

test('fixtures y reportes nunca exponen PII, URLs, IDs ni hashes', () => {
  assert.equal(
    qaFixtureEmail('alias-checker', 'abcdef123456'),
    'qa-time-source-alias-checker-abcdef123456@local.invalid',
  );
  assert.throws(() => qaFixtureEmail('alias@real.example', 'abcdef123456'));

  const summary = buildSafeSummary();
  const failure = buildSafeFailure({
    stage: 'runtime-acl',
    code: 'QA_SECDEF_OUTSIDE_ALLOWLIST',
    message: 'postgresql://real-user:secret@example.invalid/db',
  });
  for (const report of [summary, failure]) {
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /@|postgres(?:ql)?:|secret|[a-f0-9]{40,64}/i);
    assert.doesNotMatch(serialized,
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    assert.equal(report.piiPrinted, false);
  }
  assert.equal(Object.hasOwn(summary, 'syntheticFixturesOnly'), false);
  assert.equal(summary.syntheticControlPlaneFixturesOnly, true);
  assert.equal(summary.protectedSourceRowsReadOnly, true);
  assert.equal(summary.usesExistingProtectedReferences, true);
  assert.doesNotMatch(source, /syntheticFixturesOnly/);
  assert.deepEqual(failure, {
    ok: false,
    stage: 'runtime-acl',
    code: 'QA_SECDEF_OUTSIDE_ALLOWLIST',
    piiPrinted: false,
  });
});

test('harness deriva identificadores, rechaza extras PII y limita schemaVersion tecnico', () => {
  const metadataBody = source.slice(
    source.indexOf('function metadataFor('),
    source.indexOf('function requestFor('),
  );
  assert.doesNotMatch(metadataBody, /ownerCode|systemLocator/);
  assert.match(metadataBody, /schemaVersion: `v\$\{ordinal\}`/);
  for (const token of [
    "ownerCode: 'persona.identificable'",
    "systemLocator: 'https://example.invalid/nomina'",
    "actorEmail: 'persona@example.invalid'",
    "dni: '00000000'",
    "cuil: '20-00000000-0'",
    "employeeName: 'Persona sintetica'",
    "'qa.1', 'v01', 'v1.2.3.4', 'v20301234567', `v${'9'.repeat(40)}`",
    'TIME_SOURCE_METADATA_INVALID',
  ]) assert.ok(source.includes(token), `falta fuzz ${token}`);
});

test('matriz live cubre lifecycle, replay, limites, aislamiento, timezone y races', () => {
  for (const token of [
    'create_draft', 'update_draft', 'submit', 'approve', 'reject', 'retire', 'cancel',
    'TIME_SOURCE_PERSON_SOD_CONFLICT',
    'TIME_SOURCE_IDEMPOTENCY_REUSED',
    'TIME_SOURCE_VERSION_CONFLICT',
    'TIME_SOURCE_APPROVED_OVERLAP',
    'TIME_SOURCE_CUT_AT_FUTURE',
    'TIME_SOURCE_BINDING_STALE',
    'TIME_SOURCE_SESSION_INVALID',
    'TIME_SOURCE_SESSION_BUSY',
    'certify_data_plane',
    "SET TIME ZONE 'UTC'",
    "SET TIME ZONE 'Pacific/Kiritimati'",
    'timeline.length, 100',
    'timelineTruncated, true',
    'timelineLimit, 100',
    "Object.hasOwn(event, 'id'), false",
    "Object.hasOwn(event, 'reasonHash'), false",
    'time_source_registry_detail_v1(',
    "reason_hash !~ '^[a-f0-9]{64}$'",
    'audit_identity_drift',
    'evaluationReady', 'attendanceReconciled', 'payrollCalculated',
    'payrollPosted', 'grhMutation',
  ]) assert.ok(source.includes(token), `falta contrato live ${token}`);
  for (const relation of [
    'source_import_batch', 'person_identity', 'employment_contract',
    'grh_employees', 'grh_absences', 'grh_catalog_rows',
    'payroll_run', 'payroll_snapshot_assignment', 'payroll_monthly_fact',
    'action_case', 'action_case_event',
  ]) assert.ok(source.includes(`'${relation}'`), `falta fingerprint ${relation}`);
  assert.match(source, /hashtextextended\(to_jsonb\(snapshot_row\)::text, 17\)/);
  assert.match(source, /hashtextextended\(to_jsonb\(snapshot_row\)::text, 71\)/);
});

test('harness no registra salida intermedia y el main solo emite resumen seguro', () => {
  assert.doesNotMatch(source, /console\.(?:log|error|warn|info)/);
  assert.match(source,
    /process\.stdout\.write\(`\$\{JSON\.stringify\(summary\)\}\\n`\)/);
  assert.match(source,
    /process\.stderr\.write\(`\$\{JSON\.stringify\(buildSafeFailure\(error\)\)\}\\n`\)/);
  assert.match(source, /namespace\.nspname NOT IN \('pg_catalog', 'information_schema'\)/);
  assert.match(source, /function_row\.prosecdef IS TRUE/);
  assert.match(source, /has_function_privilege\(\$1::name, function_row\.oid, 'EXECUTE'\)/);
  assert.match(source, /QA_SECDEF_OUTSIDE_ALLOWLIST/);
});

test('package expone el verifier live 010A dedicado y discoverable', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts['db:time:sources:verify-live'],
    'node --env-file=.env.local scripts/verify-governed-time-source-registry-live.mjs --confirm-isolated-branch',
  );
  assert.notEqual(
    packageJson.scripts['db:time:sources:verify-live'],
    packageJson.scripts['db:actions:overtime:verify-live'],
  );
});
