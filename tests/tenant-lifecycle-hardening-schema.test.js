import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  TENANT_LIFECYCLE_MIGRATION_VERSION,
  TENANT_LIFECYCLE_RUNTIME_FUNCTION_ALLOWLIST,
  TENANT_LIFECYCLE_SIGNATURES,
  validateTenantLifecycleEvidence,
  validateTenantLifecycleMigrationSql,
  validateTenantLifecycleRuntimeAclEvidence,
} from '../scripts/apply-tenant-lifecycle-hardening-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = readFileSync(
  new URL('../scripts/migrations/009-tenant-lifecycle-hardening.sql', import.meta.url), 'utf8',
);
const applier = readFileSync(
  new URL('../scripts/apply-tenant-lifecycle-hardening-schema.mjs', import.meta.url), 'utf8',
);

const inheritedSecurity = [
  'public.tenant_action_apply_provisioning_command(text,uuid,uuid,uuid,text,uuid,text,integer,jsonb)',
  'public.tenant_iam_admin_view_v2(text,uuid,integer,text,integer)',
];

function migrationFunction(name) {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start < 0) return 'governed inherited SECURITY DEFINER function';
  const end = migration.indexOf('\n$$;', start);
  assert.ok(end > start, `funcion incompleta ${name}`);
  return migration.slice(start, end + 4);
}

function functionName(signature) {
  return signature.slice('public.'.length, signature.indexOf('('));
}

function securityFunctions() {
  return [...new Set([
    ...TENANT_LIFECYCLE_RUNTIME_FUNCTION_ALLOWLIST,
    ...Object.values(TENANT_LIFECYCLE_SIGNATURES),
    ...inheritedSecurity,
  ])];
}

function evidence() {
  return {
    functions: securityFunctions().map((signature) => ({
      signature,
      securityDefiner: true,
      ownedByCurrentUser: true,
      ownerIsRuntime: false,
      publicExecuteRevoked: true,
      config: ['search_path=public, pg_temp'],
      definition: migrationFunction(functionName(signature)),
    })),
    missingPolicies: 0,
    crossTenantExclusive: 0,
    duplicateActiveMembership: 0,
    duplicateActiveContract: 0,
    platformContextDrift: 0,
    exclusiveForeignKey: {
      validated: true,
      definition: 'FOREIGN KEY (membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT',
    },
    employmentPrimaryKey: 'id',
    activeMembershipIndex: {
      unique: true, valid: true, ready: true, predicate: '(active IS TRUE)', columns: ['membership_id'],
    },
    activeContractIndex: {
      unique: true, valid: true, ready: true, predicate: '(active IS TRUE)',
      columns: ['tenant_id', 'employment_contract_id'],
    },
    platformContextColumns: [
      ['event_id', 'bigint', true, null],
      ['actor_session_id', 'uuid', true, null],
      ['actor_session_version', 'integer', true, null],
      ['release_sha', 'character(40)', true, null],
      ['expected_version', 'integer', true, null],
      ['command', 'character varying(64)', true, null],
      ['command_hash', 'character(64)', true, null],
      ['reason_code', 'character varying(64)', false, null],
      ['reason_hash', 'character(64)', false, null],
      ['created_at', 'timestamp with time zone', true, 'now()'],
    ].map(([name, type, notNull, defaultExpression]) => ({
      name, type, notNull, defaultExpression,
    })),
    platformContextConstraints: [
      ['tenant_identity_platform_event_context_pkey', 'p', 'PRIMARY KEY (event_id)'],
      ['tenant_identity_platform_event_context_event_id_fkey', 'f',
        'FOREIGN KEY (event_id) REFERENCES tenant_iam_event(id) ON DELETE RESTRICT'],
      ['tenant_identity_platform_event_context_actor_session_id_fkey', 'f',
        'FOREIGN KEY (actor_session_id) REFERENCES tenant_identity_session(id) ON DELETE RESTRICT'],
      ['tenant_identity_platform_event_context_session_version_ck', 'c',
        'CHECK ((actor_session_version > 0))'],
      ['tenant_identity_platform_event_context_expected_version_ck', 'c',
        'CHECK ((expected_version > 0))'],
      ['tenant_identity_platform_event_context_release_ck', 'c',
        "CHECK (((release_sha)::text ~ '^[a-f0-9]{40}$'::text))"],
      ['tenant_identity_platform_event_context_hash_ck', 'c',
        "CHECK (((command_hash)::text ~ '^[a-f0-9]{64}$'::text))"],
      ['tenant_identity_platform_event_context_reason_ck', 'c',
        "CHECK (((reason_code IS NULL) AND (reason_hash IS NULL)) OR (((reason_code)::text = ANY ((ARRAY['certify_data_plane'::character varying, 'delivery_kill_switch'::character varying])::text[])) AND ((reason_hash)::text ~ '^[a-f0-9]{64}$'::text)))"],
    ].map(([name, type, definition]) => ({ name, type, definition, validated: true })),
    triggers: [
      ['platform_tenant_initialize_identity_policy_v1', 'platform_tenant',
        'tenant_lifecycle_initialize_identity_policy_v1', 'AFTER INSERT'],
      ['tenant_iam_event_enrich_create_tenant_v1', 'tenant_iam_event',
        'tenant_lifecycle_enrich_create_tenant_event_v1', 'BEFORE INSERT'],
      ['tenant_action_employment_history_guard_v1', 'tenant_action_employment_link',
        'tenant_lifecycle_guard_employment_history_v1', 'BEFORE UPDATE OR DELETE'],
      ['tenant_identity_session_revoked_terminal_v1', 'tenant_identity_session',
        'tenant_lifecycle_guard_revoked_session_v1', 'BEFORE UPDATE OR DELETE'],
      ['tenant_identity_platform_event_context_append_only', 'tenant_identity_platform_event_context',
        'tenant_iam_reject_change', 'BEFORE UPDATE OR DELETE'],
      ['tenant_action_employment_binding_guard', 'tenant_action_employment_link',
        'tenant_action_validate_binding', 'BEFORE INSERT OR UPDATE'],
    ].map(([name, table, fn, timing]) => ({
      name, enabled: 'O', tableName: table, functionSchema: 'public', functionName: fn,
      noArguments: true, notConstraint: true, rowLevel: true,
      timing: timing.startsWith('AFTER') ? 'after' : 'before',
      events: [...new Set(timing.match(/INSERT|DELETE|UPDATE|TRUNCATE/g) || [])]
        .map((event) => event.toLowerCase()).sort((left, right) => (
          ['insert','delete','update','truncate'].indexOf(left)
            - ['insert','delete','update','truncate'].indexOf(right)
        )),
      definition: `CREATE TRIGGER ${name} ${timing} ON ${table} FOR EACH ROW EXECUTE FUNCTION ${fn}()`,
    })),
  };
}

function runtimeEvidence() {
  return {
    runtimeRole: {
      canLogin: true, inherit: false, superuser: false, bypassRls: false,
      createDb: false, createRole: false, replication: false,
      membershipCount: 0, schemaUsage: true, schemaCreate: false,
    },
    roleMemberships: [],
    runtimeFunctions: TENANT_LIFECYCLE_RUNTIME_FUNCTION_ALLOWLIST
      .map((signature) => ({ signature, securityDefiner: true, execute: true })),
    unexpectedSecurityDefiners: [],
    relations: [{ name: 'tenant_identity_platform_event_context', canSelect: false,
      canInsert: false, canUpdate: false, canReferences: false, canDelete: false,
      canTruncate: false, canTrigger: false }],
    sequences: [{ name: 'tenant_iam_event_id_seq', canUsage: false, canSelect: false, canUpdate: false }],
  };
}

test('009 es nueva, parseable, reapply-safe y no reescribe 004-008', () => {
  assert.equal(TENANT_LIFECYCLE_MIGRATION_VERSION, '009-tenant-lifecycle-hardening');
  assert.ok(splitPostgresStatements(migration).length > 50);
  assert.doesNotThrow(() => validateTenantLifecycleMigrationSql(migration));
  assert.match(migration, /ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid\(\)/i);
  assert.match(migration, /IF to_regprocedure\('public\.tenant_identity_lookup_core_009/i);
  assert.doesNotMatch(migration, /ALTER ROLE\b/i);
});

test('009 certifica policy cerrada, FK tenant exacta, historia y sesion terminal', () => {
  assert.match(applier,
    /to_jsonb\(ARRAY\(SELECT attribute\.attname[\s\S]+?ORDER BY key_column\.ordinality\)\) AS columns/i);
  assert.doesNotThrow(() => validateTenantLifecycleEvidence(evidence()));
  const neonDeparse = evidence();
  neonDeparse.activeMembershipIndex.predicate = 'active IS TRUE';
  neonDeparse.activeContractIndex.predicate = 'active IS TRUE';
  assert.doesNotThrow(() => validateTenantLifecycleEvidence(neonDeparse));
  const sessionGuardSignature = TENANT_LIFECYCLE_SIGNATURES.revokedSession;
  for (const mutateGuard of [
    (definition) => definition.replace(
      'IF NEW.id IS DISTINCT FROM OLD.id THEN', 'IF false THEN',
    ),
    (definition) => definition.replaceAll(
      "ARRAY['status','revoked_at','revoked_by_user_email','version']",
      "ARRAY['status','revoked_at','revoked_by_user_email','version','id']",
    ),
    (definition) => definition.replace(
      'NEW.version IS DISTINCT FROM OLD.version + 1', 'NEW.version >= OLD.version',
    ),
    (definition) => definition.replace(
      'OR NEW.revoked_at IS NULL', 'OR false',
    ),
    (definition) => definition.replace(
      "OLD.status = 'revoked' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)",
      "OLD.status = 'revoked' AND NEW.status IS DISTINCT FROM OLD.status",
    ),
  ]) {
    const changed = structuredClone(evidence());
    const sessionGuard = changed.functions.find((row) => row.signature === sessionGuardSignature);
    sessionGuard.definition = mutateGuard(sessionGuard.definition);
    assert.throws(() => validateTenantLifecycleEvidence(changed), /sesion terminal/i);
  }
  for (const mutation of [
    (value) => { value.missingPolicies = 1; },
    (value) => { value.crossTenantExclusive = 1; },
    (value) => { value.duplicateActiveMembership = 1; },
    (value) => { value.duplicateActiveContract = 1; },
    (value) => { value.platformContextDrift = 1; },
    (value) => { value.exclusiveForeignKey.definition = 'FOREIGN KEY (membership_id) REFERENCES tenant_membership(id)'; },
    (value) => { value.activeMembershipIndex.columns = ['tenant_id']; },
    (value) => { value.activeContractIndex.columns = ['employment_contract_id']; },
    (value) => { value.activeContractIndex.predicate = '(active IS FALSE)'; },
    (value) => { value.activeContractIndex.predicate = 'active'; },
    (value) => { value.activeContractIndex.predicate = 'active IS TRUE AND tenant_id IS NOT NULL'; },
    (value) => { value.activeContractIndex.predicate = 'active IS TRUE OR active IS NULL'; },
    (value) => { value.platformContextColumns[0].type = 'integer'; },
    (value) => { value.platformContextColumns[1].notNull = false; },
    (value) => { value.platformContextColumns[9].defaultExpression = null; },
    (value) => { value.platformContextConstraints[0].definition = 'PRIMARY KEY (actor_session_id)'; },
    (value) => { value.platformContextConstraints[1].definition = 'FOREIGN KEY (event_id) REFERENCES tenant_iam_event(id) ON DELETE CASCADE'; },
    (value) => { value.platformContextConstraints[3].definition = 'CHECK (actor_session_version >= 0)'; },
    (value) => { value.platformContextConstraints[7].definition = "CHECK (reason_code IS NULL OR reason_hash IS NULL)"; },
    (value) => { value.platformContextConstraints[7].validated = false; },
  ]) {
    const changed = structuredClone(evidence());
    mutation(changed);
    assert.throws(() => validateTenantLifecycleEvidence(changed));
  }
});

test('replay provisioning valida solo la superficie saneada por cada comando', () => {
  const start = migration.indexOf('  SELECT * INTO existing_event FROM tenant_action_authority_event');
  const end = migration.indexOf("  reason_code := p_payload->>'reasonCode';", start);
  assert.ok(start > 0 && end > start);
  const replayBlock = migration.slice(start, end);
  assert.match(replayBlock,
    /IF p_command = 'link_employment'\s+AND existing_event\.after_snapshot->'employmentLink'->>'sourceBindingId'[\s\S]+?IS DISTINCT FROM binding\.id::text THEN/i);
  assert.match(replayBlock,
    /IF p_command = 'replace_action_scopes' AND EXISTS \([\s\S]+?after_snapshot->'scopes'[\s\S]+?sourceBindingId'[\s\S]+?binding\.id::text[\s\S]+?\) THEN/i);
  assert.doesNotMatch(replayBlock, /p_command <> 'revoke_employment_link'/i);
});

test('triggers se validan por bits semanticos y no por orden textual del deparser', () => {
  const neonDeparse = evidence();
  const trigger = neonDeparse.triggers.find((row) => (
    row.name === 'tenant_action_employment_history_guard_v1'
  ));
  trigger.definition = 'CREATE TRIGGER tenant_action_employment_history_guard_v1 BEFORE DELETE OR UPDATE ON tenant_action_employment_link FOR EACH ROW EXECUTE FUNCTION tenant_lifecycle_guard_employment_history_v1()';
  assert.doesNotThrow(() => validateTenantLifecycleEvidence(neonDeparse));

  for (const mutation of [
    (row) => { row.events = ['update']; },
    (row) => { row.events = ['delete','insert','update']; },
    (row) => { row.timing = 'after'; },
    (row) => { row.tableName = 'tenant_identity_session'; },
    (row) => { row.functionSchema = 'shadow'; },
    (row) => { row.functionName = 'tenant_iam_reject_change'; },
    (row) => { row.noArguments = false; },
    (row) => { row.notConstraint = false; },
    (row) => { row.rowLevel = false; },
  ]) {
    const changed = structuredClone(neonDeparse);
    mutation(changed.triggers.find((row) => (
      row.name === 'tenant_action_employment_history_guard_v1'
    )));
    assert.throws(() => validateTenantLifecycleEvidence(changed), /trigger/i);
  }
});

test('wrappers identity v2 cierran delivery, replay y PII de invitations al runtime directo', () => {
  const body = migration.toLowerCase();
  assert.match(body, /p_operation not in \('invitation','login','flow'\)/);
  assert.match(body, /p_resource not in \('bootstrap','sessions'\)/);
  assert.match(body, /tenant_identity_platform_event_context[\s\S]+actor_session_version/);
  assert.match(body, /replay_context\.actor_session_id is distinct from p_actor_session_id/);
  assert.match(body, /tenant_identity_assert_issue_replay_current_v1/);
  assert.match(body, /secret\.status = 'pending'[\s\S]+secret\.status = 'active'/);
  assert.match(body, /revoke all privileges on function tenant_identity_lookup_core_009/);
  assert.match(body, /revoke all privileges on function tenant_identity_command_replay_core_009/);
  assert.match(body, /revoke all privileges on function tenant_identity_view_core_009/);
});

test('gate 009 rechaza regresiones de compilacion, replay, sesion y grants legacy', () => {
  const mutations = [
    migration.replace("  can_invite boolean := false;", "  DECLARE can_invite boolean := false;"),
    migration.replace("  IF TG_OP = 'DELETE' THEN", "  IF false THEN"),
    migration.replace('  IF NEW.id IS DISTINCT FROM OLD.id THEN', '  IF false THEN'),
    migration.replaceAll(
      "ARRAY['status','revoked_at','revoked_by_user_email','version']",
      "ARRAY['status','revoked_at','revoked_by_user_email','version','id']",
    ),
    migration.replace(
      'OR NEW.version IS DISTINCT FROM OLD.version + 1',
      'OR NEW.version >= OLD.version',
    ),
    migration.replace("p_operation NOT IN ('invitation','login','flow')", "p_operation NOT IN ('invitation','login','flow','invitation_delivery')"),
    `${migration}\nGRANT EXECUTE ON FUNCTION tenant_identity_lookup_core_009(text,text,text,text) TO municontrol_actions_runtime_app;`,
    `${migration}\nALTER ROLE municontrol_actions_runtime_app SUPERUSER;`,
  ];
  for (const changed of mutations) {
    assert.throws(() => validateTenantLifecycleMigrationSql(changed));
  }
});

test('ACL final es execute-only exacta y detecta helper SECDEF o rol heredable', () => {
  assert.match(applier,
    /const runtimeFunctions = await client\.query\(`[\s\S]+?function_row\.prosecdef IS TRUE[\s\S]+?`, \[RUNTIME_ROLE\]\);/);
  assert.doesNotThrow(() => validateTenantLifecycleRuntimeAclEvidence(runtimeEvidence()));
  const publicInvoker = structuredClone(runtimeEvidence());
  publicInvoker.runtimeFunctions.push({
    signature: 'public.digest(bytea,text)', securityDefiner: false, execute: true,
  });
  assert.doesNotThrow(() => validateTenantLifecycleRuntimeAclEvidence(publicInvoker));
  const inherited = structuredClone(runtimeEvidence());
  inherited.runtimeRole.inherit = true;
  assert.throws(() => validateTenantLifecycleRuntimeAclEvidence(inherited), /aislamiento/);
  const legacy = structuredClone(runtimeEvidence());
  legacy.runtimeFunctions.push({
    signature: 'public.tenant_identity_command_replay(text,uuid,text)',
    securityDefiner: true, execute: true,
  });
  assert.throws(() => validateTenantLifecycleRuntimeAclEvidence(legacy), /allowlist/);
  const helper = structuredClone(runtimeEvidence());
  helper.unexpectedSecurityDefiners.push({ signature: 'public.legacy_admin_escape()' });
  assert.throws(() => validateTenantLifecycleRuntimeAclEvidence(helper), /security definer/i);
  const relation = structuredClone(runtimeEvidence());
  relation.relations[0].canSelect = true;
  assert.throws(() => validateTenantLifecycleRuntimeAclEvidence(relation), /privilegio directo/);
});

test('aplicadores 003-008 encadenan el verificador final 009 sin reotorgar ACL', () => {
  const readApplier = readFileSync(new URL('../scripts/apply-action-center-read-facades-schema.mjs', import.meta.url), 'utf8');
  const overtimeApplier = readFileSync(new URL('../scripts/apply-governed-overtime-actions-schema.mjs', import.meta.url), 'utf8');
  for (const file of [
    '../scripts/apply-action-center-schema.mjs',
    '../scripts/apply-tenant-iam-schema.mjs',
    '../scripts/apply-tenant-identity-gateway-schema.mjs',
    '../scripts/apply-tenant-action-authority-schema.mjs',
  ]) {
    const content = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(content, /verifyActionReadFinalAcl/);
  }
  assert.match(readApplier, /verifyOvertimeFinalAcl/);
  assert.match(overtimeApplier, /009-tenant-lifecycle-hardening/);
  assert.match(overtimeApplier, /verifyTenantLifecycleFinalAcl/);
});
