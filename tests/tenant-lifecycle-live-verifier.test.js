import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  EXPECTED_RUNTIME_SECURITY_DEFINERS,
  PROTECTED_DATA_RELATIONS,
  buildSafeFailure,
  buildSafeSummary,
  lifecycleFixtureEmail,
  loadTenantLifecycleQaConfig,
  localTenantLifecycleMigrationChecksum,
  selectQaSource,
  validateRuntimeBoundaryEvidence,
} from '../scripts/verify-tenant-lifecycle-live.mjs';

const verifierUrl = new URL('../scripts/verify-tenant-lifecycle-live.mjs', import.meta.url);
const migrationUrl = new URL(
  '../scripts/migrations/009-tenant-lifecycle-hardening.sql',
  import.meta.url,
);
const source = readFileSync(verifierUrl, 'utf8');

function sourceSection(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `sección ausente: ${startMarker}`);
  return source.slice(start, end);
}

function safeEnv(overrides = {}) {
  return {
    ACTION_CENTER_QA_BRANCH_ID: 'br-qa-lifecycle-123',
    ACTION_CENTER_QA_PROJECT_ID: 'qa-project-123',
    ACTION_CENTER_QA_ENDPOINT_HOST: 'ep-qa-lifecycle.us-east-2.aws.neon.tech',
    CANONICAL_PRODUCTION_BRANCH_ID: 'br-production-999',
    CANONICAL_PRODUCTION_HOST: 'ep-production.us-east-2.aws.neon.tech',
    TENANT_LIFECYCLE_QA_DATABASE_NAME: 'neondb',
    TENANT_LIFECYCLE_QA_RELEASE_SHA: '1'.repeat(40),
    DATABASE_URL_UNPOOLED:
      'postgresql://qa_owner:owner-secret@ep-qa-lifecycle.us-east-2.aws.neon.tech/neondb',
    ACTIONS_DATABASE_URL:
      'postgresql://municontrol_actions_runtime_app:runtime-secret@ep-qa-lifecycle-pooler.us-east-2.aws.neon.tech/neondb',
    ...overrides,
  };
}

function safeEvidence() {
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

test('gate exige rama Neon descartable, host corroborado y roles owner/runtime separados', () => {
  const config = loadTenantLifecycleQaConfig(safeEnv(), ['--confirm-isolated-branch']);
  assert.equal(config.branchId, 'br-qa-lifecycle-123');
  assert.equal(config.databaseName, 'neondb');
  assert.equal(config.ownerUser, 'qa_owner');
  assert.equal(config.runtimeUser, 'municontrol_actions_runtime_app');
  assert.equal(config.releaseSha, '1'.repeat(40));

  for (const [overrides, expectedCode] of [
    [{}, 'QA_CONFIRMATION_REQUIRED'],
    [{ ACTION_CENTER_QA_BRANCH_ID: 'br-production-999' }, 'QA_PRODUCTION_TARGET_FORBIDDEN'],
    [{ ACTION_CENTER_QA_ENDPOINT_HOST: 'ep-production.us-east-2.aws.neon.tech' },
      'QA_PRODUCTION_TARGET_FORBIDDEN'],
    [{ DATABASE_URL_UNPOOLED:
      'postgresql://qa_owner:owner-secret@ep-qa-lifecycle-pooler.us-east-2.aws.neon.tech/neondb' },
    'QA_OWNER_MUST_BE_UNPOOLED'],
    [{ ACTIONS_DATABASE_URL:
      'postgresql://qa_owner:runtime-secret@ep-qa-lifecycle.us-east-2.aws.neon.tech/neondb' },
    'QA_CREDENTIAL_SEPARATION_REQUIRED'],
    [{ ACTIONS_DATABASE_URL:
      'postgresql://another_runtime:runtime-secret@ep-qa-lifecycle.us-east-2.aws.neon.tech/neondb' },
    'QA_RUNTIME_ROLE_INVALID'],
    [{ TENANT_LIFECYCLE_QA_RELEASE_SHA: 'not-a-release' }, 'QA_RELEASE_INVALID'],
  ]) {
    const argv = expectedCode === 'QA_CONFIRMATION_REQUIRED' ? [] : ['--confirm-isolated-branch'];
    assert.throws(
      () => loadTenantLifecycleQaConfig(safeEnv(overrides), argv),
      (error) => error.code === expectedCode,
    );
  }
});

test('allowlist SECDEF global es exacta y falla ante ACL, membresía u ownership extra', () => {
  assert.equal(EXPECTED_RUNTIME_SECURITY_DEFINERS.length, 26);
  assert.equal(new Set(EXPECTED_RUNTIME_SECURITY_DEFINERS).size, 26);
  assert.ok(EXPECTED_RUNTIME_SECURITY_DEFINERS.every((signature) => signature.startsWith('public.')));
  for (const signature of [
    'public.tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)',
    'public.tenant_identity_platform_command_replay_v2(text,uuid,integer,text,uuid,text,integer,uuid)',
    'public.tenant_identity_platform_invitations_view_v2(text,uuid,integer,text,integer)',
    'public.tenant_action_apply_provisioning_command_v2(text,uuid,integer,text,uuid,text,uuid,text,integer,jsonb)',
    'public.tenant_action_lookup_employment_v2(text,uuid,integer,text,uuid,text,integer)',
    'public.tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)',
  ]) {
    assert.ok(EXPECTED_RUNTIME_SECURITY_DEFINERS.includes(signature), `falta ${signature}`);
  }
  assert.ok(EXPECTED_RUNTIME_SECURITY_DEFINERS.every((signature) => (
    !signature.includes('_core_009')
      && !signature.startsWith('public.tenant_action_apply_provisioning_command(')
      && !signature.startsWith('public.tenant_iam_admin_view_v2(')
      && !signature.startsWith('public.tenant_identity_command_replay(')
  )));
  assert.doesNotThrow(() => validateRuntimeBoundaryEvidence(safeEvidence()));

  const mutations = [
    ['QA_SECDEF_OUTSIDE_ALLOWLIST', (evidence) => evidence.securityDefiners.push({
      signature: 'private.unrelated_privileged_helper()',
    })],
    ['QA_SECDEF_MISSING', (evidence) => evidence.securityDefiners.pop()],
    ['QA_RUNTIME_RELATION_PRIVILEGE', (evidence) => evidence.relations.push({
      name: 'public.tenant_membership',
    })],
    ['QA_RUNTIME_SEQUENCE_PRIVILEGE', (evidence) => evidence.sequences.push({
      name: 'public.unsafe_sequence',
    })],
    ['QA_RUNTIME_ROLE_DRIFT', (evidence) => { evidence.role.bypassRls = true; }],
    ['QA_RUNTIME_ROLE_MEMBERSHIP', (evidence) => evidence.memberships.push({ name: 'qa_owner' })],
    ['QA_RUNTIME_SCHEMA_DRIFT', (evidence) => evidence.schemas.push({
      name: 'private', usage: true, create: true,
    })],
    ['QA_RUNTIME_OBJECT_OWNERSHIP', (evidence) => evidence.ownedObjects.push({
      kind: 'function', name: 'public.unsafe',
    })],
  ];
  for (const [expectedCode, mutate] of mutations) {
    const evidence = safeEvidence();
    mutate(evidence);
    assert.throws(
      () => validateRuntimeBoundaryEvidence(evidence),
      (error) => error.code === expectedCode,
    );
  }
});

test('checksum 009 se calcula desde bytes locales y se compara dinámicamente con schema_migrations', async () => {
  const migration = readFileSync(migrationUrl);
  const expected = createHash('sha256').update(migration).digest('hex');
  assert.equal(await localTenantLifecycleMigrationChecksum(), expected);
  assert.match(source, /SELECT checksum_sha256 FROM schema_migrations WHERE version = \$1/);
  assert.match(source, /const expectedChecksum = await localTenantLifecycleMigrationChecksum\(\)/);
  assert.match(source, /checksum_sha256 \|\| ''\)\.trim\(\) === expectedChecksum/);
  assert.doesNotMatch(source, /(?:EXPECTED|HARDCODED)_MIGRATION_(?:SHA|CHECKSUM)/);
  assert.doesNotMatch(source, /['"][a-f0-9]{64}['"]/);
});

test('fixtures y reportes públicos no exponen PII, URLs, IDs, hashes ni secretos', () => {
  assert.equal(
    lifecycleFixtureEmail('session-terminal', 'abcdef123456'),
    'qa-lifecycle-session-terminal-abcdef123456@local.invalid',
  );
  assert.throws(() => lifecycleFixtureEmail('persona@real.example', 'abcdef123456'));
  assert.throws(() => lifecycleFixtureEmail('valid-kind', 'not-a-suffix'));

  const summary = buildSafeSummary();
  assert.equal(summary.syntheticControlPlaneFixtures, true);
  assert.equal(summary.protectedSourceDataReadOnly, true);
  assert.equal(Object.hasOwn(summary, 'syntheticFixturesOnly'), false);
  assert.doesNotMatch(source, /syntheticFixturesOnly/);
  const failure = buildSafeFailure({
    stage: 'runtime-acl',
    code: 'QA_SECDEF_OUTSIDE_ALLOWLIST',
    message: 'postgresql://real-user:secret@example.invalid/db 01234567-89ab-cdef-0123-456789abcdef',
  });
  for (const report of [summary, failure]) {
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /@|postgres(?:ql)?:|secret/i);
    assert.doesNotMatch(serialized, /[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    assert.doesNotMatch(serialized, /[a-f0-9]{40,64}/i);
    assert.equal(report.piiPrinted, false);
  }
  assert.deepEqual(failure, {
    ok: false,
    stage: 'runtime-acl',
    code: 'QA_SECDEF_OUTSIDE_ALLOWLIST',
    piiPrinted: false,
  });
});

test('harness dedicado no ejecuta al importar y audita ACL global sin SELECT legacy', () => {
  assert.doesNotMatch(source, /verify-(?:action-center|governed-overtime)-live/);
  assert.doesNotMatch(source, /proname\s+LIKE|console\.(?:log|error)/);
  assert.match(source, /function_row\.prosecdef IS TRUE/);
  assert.match(source, /has_schema_privilege\(\$1::name, namespace\.oid, 'USAGE'\)/);
  assert.match(source, /has_function_privilege\(\$1::name, function_row\.oid, 'EXECUTE'\)/);
  assert.match(source, /UPDATE public\.tenant_identity_policy SET updated_at = updated_at WHERE false/);
  assert.match(source, /tenant_identity_apply_command_core_009/);
  assert.match(source, /tenant_action_apply_provisioning_command\(/);
  assert.match(source, /tenant_iam_admin_view_v2/);
  assert.match(source, /tenant_identity_command_replay/);
  assert.match(source, /expectPgCode\('42501'/);
  assert.match(source, /pathToFileURL\(process\.argv\[1\]\)\.href === import\.meta\.url/);
  assert.match(source, /process\.stdout\.write\(`\$\{JSON\.stringify\(summary\)\}/);
  assert.match(source, /process\.stderr\.write\(`\$\{JSON\.stringify\(buildSafeFailure\(error\)\)\}/);
});

test('descubrimiento exige un binding verificado exacto pero no policy ready', () => {
  const selector = sourceSection(
    'async function selectQaSource',
    'function platformActorFixture',
  );
  assert.match(selector, /JOIN tenant_identity_policy policy ON policy\.tenant_id = tenant\.id/);
  assert.match(selector, /tenant\.status IN \('onboarding', 'active'\)/);
  assert.match(selector, /JOIN source_import_batch batch ON batch\.id = contract\.source_batch_id/);
  assert.match(selector, /batch\.validation_state = 'published'/);
  assert.match(selector, /batch\.legacy_import_run_id IS NOT NULL/);
  assert.match(selector, /batch\.id AS batch_id, batch\.source_cutoff/);
  assert.match(selector, /GROUP BY[\s\S]+?batch\.id, batch\.source_cutoff/);
  assert.match(selector, /PARTITION BY candidate\.id[\s\S]+?candidate\.source_cutoff DESC/);
  assert.match(selector, /WHERE candidate\.batch_rank = 1/);
  assert.match(selector, /NOT EXISTS \([\s\S]+?tenant_action_employment_link existing_link/);
  assert.match(selector, /FROM platform_tenant_source_binding binding/);
  assert.match(selector, /binding\.source_system = 'GRH' AND binding\.verified IS TRUE/);
  assert.match(selector, /batch\.source_database = binding\.source_database/);
  assert.match(selector, /contract\.legacy_company_id = binding\.source_company_id/);
  assert.match(selector, /LIMIT 2/);
  assert.match(selector, /QA_OPERATIONAL_BINDING_REQUIRED/);
  assert.match(selector, /QA_OPERATIONAL_BINDING_AMBIGUOUS/);
  assert.doesNotMatch(selector, /tenant_data_plane_ready|certified_source_binding_id/);
  assert.doesNotMatch(selector, /CROSS JOIN|LEFT JOIN platform_tenant_source_binding/);
});

test('selector falla cerrado si no hay binding operativo único', async () => {
  await assert.rejects(
    () => selectQaSource({ query: async () => ({ rowCount: 0, rows: [] }) }),
    (error) => error.code === 'QA_OPERATIONAL_BINDING_REQUIRED',
  );
  await assert.rejects(
    () => selectQaSource({ query: async () => ({ rowCount: 2, rows: [{}, {}] }) }),
    (error) => error.code === 'QA_OPERATIONAL_BINDING_AMBIGUOUS',
  );
});

test('bindings canary usan coordenadas sintéticas y el binding real sólo se consume', () => {
  const operationalCertification = sourceSection(
    'async function prepareOperationalControlPlane',
    'async function verifyInitialPolicySnapshot',
  );
  const syntheticControlPlane = sourceSection(
    'async function createControlPlaneFixtures',
    'function memberFixture',
  );
  const memberFixtures = sourceSection(
    'async function seedMemberFixtures',
    'async function verifyClosedPlatformCommands',
  );

  assert.doesNotMatch(source, /function ensureOperationalBinding/);
  assert.equal((source.match(/INSERT INTO platform_tenant_source_binding/g) || []).length, 1);
  assert.match(operationalCertification, /binding\.id = \$2::uuid/);
  assert.match(operationalCertification, /binding\.source_system = 'GRH' AND binding\.verified IS TRUE/);
  assert.doesNotMatch(operationalCertification, /INSERT INTO|UPDATE platform_tenant_source_binding/);
  assert.match(operationalCertification, /let policyVersion = Number\(current\.version\)/);
  assert.match(operationalCertification, /if \(current\.deliveryReady === true\)/);
  assert.match(operationalCertification, /platformRequest\('set_delivery_ready', policyVersion/);
  assert.match(operationalCertification, /ready: false/);
  assert.match(operationalCertification, /certifyTenant\(runtime, actor,[\s\S]+?policyVersion\)/);

  assert.match(syntheticControlPlane, /`qa-lifecycle-\$\{suffix\}-a`/);
  assert.match(syntheticControlPlane, /`qa-lifecycle-\$\{suffix\}-b`/);
  assert.match(syntheticControlPlane, /\$3, -1, true/);
  assert.match(syntheticControlPlane, /\$4, -2, false/);
  assert.match(syntheticControlPlane, /bindingA\.sourceDatabase !== bindingB\.sourceDatabase/);
  assert.doesNotMatch(syntheticControlPlane, /source\.sourceDatabase|source\.sourceCompanyId/);
  assert.match(source, /createControlPlaneFixtures\(owner, runtime, actor, suffix, releases\)/);
  assert.doesNotMatch(source, /createControlPlaneFixtures\(owner, runtime, actor, source,/);

  assert.equal((memberFixtures.match(/controlPlane\.operationalTenantId/g) || []).length, 6);
  assert.equal((memberFixtures.match(/controlPlane\.tenantB\.id/g) || []).length, 1);
  assert.doesNotMatch(memberFixtures, /controlPlane\.tenantA\.id/);
  assert.doesNotMatch(source, /controlPlane\.bindingAId|controlPlane\.bindingBId/);
  assert.match(source, /verifyLateCreateReplay\(owner, runtime, actor, controlPlane\.tenantA\)/);
});

test('matriz live cubre invariantes 009, replay stale/durable e historia transferible', () => {
  for (const token of [
    'IDENTITY_PLATFORM_COMMAND_CLOSED',
    'TENANT_IAM_IDEMPOTENCY_KEY_REUSED',
    'IDENTITY_SESSION_ID_IMMUTABLE',
    'IDENTITY_SESSION_REVOKE_TRANSITION_INVALID',
    'IDENTITY_SESSION_REVOKED_TERMINAL',
    'IDENTITY_SESSION_DELETE_FORBIDDEN',
    'TENANT_ACTION_EMPLOYMENT_HISTORY_IMMUTABLE',
    'TENANT_ACTION_SOURCE_BINDING_REQUIRED',
    'TENANT_ACTION_MEMBERSHIP_NOT_ACTIVE',
    'link_employment',
    'replace_action_scopes',
    'revoke_employment_link',
    "suspended?.membership?.status, 'suspended'",
    'revokeReplay.replayed',
    'pg_locks',
    'pg_blocking_pids',
    'QA_CONCURRENCY_NOT_BLOCKED',
    '@local.invalid',
  ]) {
    assert.ok(source.includes(token), `falta contrato live ${token}`);
  }
  assert.match(source, /expectPgCode\('23503'[\s\S]+?INSERT INTO tenant_exclusive_capability/);
  assert.match(source, /DELETE FROM tenant_identity_session WHERE id = \$1::uuid/);
  assert.match(source, /INSERT INTO tenant_identity_session[\s\S]+?SELECT \* FROM tenant_identity_session/);
  const sessionMatrix = sourceSection(
    'async function sessionIdentitySnapshot',
    'async function degradePolicy',
  );
  assert.match(sessionMatrix, /SET id = \$3::uuid, status = 'revoked'/);
  assert.match(sessionMatrix, /SET user_email = \$3, status = 'revoked'/);
  assert.match(sessionMatrix, /SET source = 'platform', status = 'revoked'/);
  assert.match(sessionMatrix, /SET active_tenant_id = \$3::uuid, status = 'revoked'/);
  assert.match(sessionMatrix, /SET session_version = session_version \+ 1, status = 'revoked'/);
  assert.equal((sessionMatrix.match(/IDENTITY_SESSION_REVOKE_TRANSITION_INVALID/g) || []).length, 4);
  assert.match(sessionMatrix, /await owner\.query\('ROLLBACK'\)/);
  assert.match(sessionMatrix, /assert\.deepEqual\(await sessionIdentitySnapshot\(owner, sessionId\), originalSnapshot\)/);
  assert.match(sessionMatrix, /assert\.equal\(originalSession\.status, 'active'\)/);
  assert.ok((source.match(/expectPgCode\('23505'/g) || []).length >= 3);
  assert.ok((source.match(/TENANT_ACTION_SOURCE_BINDING_REQUIRED/g) || []).length >= 2);
  assert.match(source, /count\(DISTINCT id\)::integer AS ids/);
  assert.match(source, /active IS FALSE AND revoked_at IS NOT NULL/);
  assert.match(source, /assert\.equal\(Number\(value\.history\), 2\)/);
  assert.match(source, /assert\.equal\(Number\(value\.events\), 0\)/);
  assert.match(source, /assert\.deepEqual\(replayed\.identityPolicy, \{[\s\S]+?version: 1,[\s\S]+?dataPlaneReady: false/);
});

test('reapply es transaccional y los fingerprints cubren GRH/payroll con doble hash', () => {
  assert.deepEqual(PROTECTED_DATA_RELATIONS, [
    'source_import_batch',
    'source_staging_row',
    'source_xref',
    'person_identity',
    'person_identity_assertion',
    'crosswalk_persona',
    'employment_contract',
    'employment_status_snapshot',
    'employment_movement',
    'data_quality_issue',
    'grh_employees',
    'grh_absences',
    'grh_catalog_rows',
    'payroll_run',
    'payroll_snapshot_assignment',
    'payroll_monthly_fact',
  ]);
  for (const relation of PROTECTED_DATA_RELATIONS) assert.ok(source.includes(relation));
  assert.match(source, /splitPostgresStatements\(migration\)/);
  assert.match(source, /statements\.length > 100/);
  assert.match(source, /pg_advisory_xact_lock\(hashtext\('municipio-junin-friendly:lifecycle-009-live-qa'\)\)/);
  assert.match(source, /await owner\.query\('ROLLBACK'\)/);
  assert.match(source, /hashtextextended\(to_jsonb\(snapshot_row\)::text, 17\)/);
  assert.match(source, /hashtextextended\(to_jsonb\(snapshot_row\)::text, 71\)/);
  assert.ok((source.match(/protectedDataFingerprint\(owner\)/g) || []).length >= 3);
  assert.match(source, /pg_try_advisory_lock\(hashtextextended\(\$1, 0\)\)/);
  assert.match(source, /QA_CONCURRENT_RUN_FORBIDDEN/);
  assert.match(source, /pg_advisory_unlock\(hashtextextended\(\$1, 0\)\)/);
  assert.match(source, /if \(runLockAcquired\) await releaseRunLock\(owner\)/);
});
