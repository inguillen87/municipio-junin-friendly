import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ACTION_READ_MIGRATION_VERSION,
  ACTION_READ_RUNTIME_FUNCTION_ALLOWLIST,
  ACTION_READ_SIGNATURES,
  validateActionReadEvidence,
  validateActionReadMigrationSql,
  validateActionReadRuntimeAclEvidence,
} from '../scripts/apply-action-center-read-facades-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationUrl = new URL('../scripts/migrations/007-action-center-read-facades.sql', import.meta.url);
const migration = readFileSync(migrationUrl, 'utf8');
const authorityMigration = readFileSync(
  new URL('../scripts/migrations/006-tenant-action-authority.sql', import.meta.url), 'utf8',
);
const iamMigration = readFileSync(
  new URL('../scripts/migrations/004-tenant-iam-control-plane.sql', import.meta.url), 'utf8',
);
const identityMigration = readFileSync(
  new URL('../scripts/migrations/005-tenant-identity-gateway.sql', import.meta.url), 'utf8',
);
const applier = readFileSync(
  new URL('../scripts/apply-action-center-read-facades-schema.mjs', import.meta.url), 'utf8',
);

function functionDefinition(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  assert.notEqual(start, -1, `función ausente: ${name}`);
  const end = sql.indexOf('\n$$;', start);
  assert.notEqual(end, -1, `fin de función ausente: ${name}`);
  return sql.slice(start, end + 4);
}

function evidence() {
  const sourceBySignature = new Map([
    ['public.tenant_iam_effective_capabilities(uuid)', [authorityMigration, 'tenant_iam_effective_capabilities']],
    ['public.tenant_iam_assert_no_sod_conflict(uuid)', [iamMigration, 'tenant_iam_assert_no_sod_conflict']],
    ['public.action_center_tenant_actor_authorized(text,uuid,uuid,text,uuid,bigint,text,text,text,text)',
      [authorityMigration, 'action_center_tenant_actor_authorized']],
  ]);
  for (const [key, signature] of Object.entries(ACTION_READ_SIGNATURES)) {
    const name = signature.slice('public.'.length, signature.indexOf('('));
    sourceBySignature.set(signature, [migration, name, key]);
  }
  const functions = [...sourceBySignature].map(([signature, [source, name]]) => ({
      signature,
      securityDefiner: true,
      publicExecuteRevoked: true,
      ownedByCurrentUser: true,
      owner: 'schema_owner',
      config: 'search_path=public, pg_temp',
      definition: functionDefinition(source, name),
    }));
  for (const signature of ACTION_READ_RUNTIME_FUNCTION_ALLOWLIST) {
    if (functions.some((item) => item.signature === signature)) continue;
    functions.push({
      signature,
      securityDefiner: true,
      publicExecuteRevoked: true,
      ownedByCurrentUser: true,
      owner: 'schema_owner',
      config: 'search_path=public, pg_temp',
      definition: `CREATE FUNCTION ${signature} SECURITY DEFINER SET search_path=public, pg_temp`,
    });
  }
  return { functions };
}

function aclEvidence() {
  const forbidden = [
    'public.action_center_resolve_tenant_principal(text,uuid,uuid)',
    'public.action_center_apply_command(text,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)',
    'public.tenant_iam_admin_view(text,text,integer)',
    'public.tenant_iam_apply_command(text,text,uuid,text,integer,jsonb)',
    'public.tenant_identity_create_session(text,uuid,text,text,text,uuid,text)',
    ACTION_READ_SIGNATURES.sessionAssert,
    ACTION_READ_SIGNATURES.capability,
    ACTION_READ_SIGNATURES.scope,
    ACTION_READ_SIGNATURES.nominal,
  ];
  return {
    runtimeRole: {
      canLogin: true, inherit: false, superuser: false, bypassRls: false,
      createDb: false, createRole: false, replication: false,
      membershipCount: 0, memberCount: 1, schemaUsage: true, schemaCreate: false,
    },
    roleMemberships: [{
      direction: 'member_of_runtime',
      grantedRole: 'municontrol_actions_runtime_app',
      memberRole: 'schema_owner',
      adminOption: true,
      inheritOption: false,
      setOption: false,
      memberIsCurrentUser: true,
      memberOwnsApprovedFunctions: true,
    }],
    runtimeFunctions: [
      ...ACTION_READ_RUNTIME_FUNCTION_ALLOWLIST.map((signature) => ({ signature, execute: true })),
      ...forbidden.map((signature) => ({ signature, execute: false })),
    ],
    relations: [
      { name: 'action_case', canSelect: false, canInsert: false, canUpdate: false,
        canReferences: false, canDelete: false, canTruncate: false, canTrigger: false },
      { name: 'internal_users', canSelect: false, canInsert: false, canUpdate: false,
        canReferences: false, canDelete: false, canTruncate: false, canTrigger: false },
    ],
    sequences: [{ name: 'action_case_event_id_seq', canUsage: false, canSelect: false, canUpdate: false }],
  };
}

test('007 es nueva, checksummed y no modifica las migraciones 003-006', () => {
  assert.equal(ACTION_READ_MIGRATION_VERSION, '007-action-center-read-facades');
  assert.match(createHash('sha256').update(migration).digest('hex'), /^[a-f0-9]{64}$/);
  assert.ok(splitPostgresStatements(migration).length >= 20);
  assert.doesNotMatch(migration, /ALTER TABLE action_case ADD COLUMN/);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION action_center_resolve_tenant_principal/);
  assert.doesNotMatch(migration, /ALTER\s+ROLE\s+municontrol_actions_runtime_app/i);
  assert.match(migration, /runtime_role\.rolcanlogin IS NOT TRUE/);
  assert.match(migration, /runtime_role\.rolinherit IS NOT FALSE/);
  assert.match(migration, /runtime_role\.rolsuper IS TRUE/);
  assert.match(migration, /runtime_role\.rolbypassrls IS TRUE/);
  assert.match(migration, /membership\.member = runtime_role\.oid/);
  assert.match(migration, /membership\.roleid = runtime_role\.oid/);
  assert.match(migration, /membership\.member = approved_owner_oid/);
  assert.match(migration, /membership\.admin_option IS TRUE/);
  assert.match(migration, /membership\.inherit_option IS FALSE/);
  assert.match(migration, /membership\.set_option IS FALSE/);
  validateActionReadMigrationSql(migration);

  const duplicateDeclare = migration.replace(
    '  detail_value jsonb;\n  record_value jsonb;',
    '  detail_value jsonb;\nDECLARE\n  record_value jsonb;',
  );
  assert.notEqual(duplicateDeclare, migration);
  assert.throws(() => validateActionReadMigrationSql(duplicateDeclare), /unico DECLARE/);

  const privilegedRoleMutation = migration.replace(
    'DO $role_isolation$',
    'ALTER ROLE municontrol_actions_runtime_app NOSUPERUSER;\nDO $role_isolation$',
  );
  assert.throws(() => validateActionReadMigrationSql(privilegedRoleMutation), /ALTER ROLE/);
});

test('facades 007 ligan sesión, release, tenant, provenance y proyección mínima', () => {
  validateActionReadEvidence(evidence());
  assert.match(migration, /employee\.import_run_id = batch\.legacy_import_run_id/);
  assert.match(migration, /employee\.import_run_id = page\.legacy_import_run_id/);
  assert.match(migration, /employee\.import_run_id = batch_row\.legacy_import_run_id/);
  assert.match(migration, /jsonb_strip_nulls\(jsonb_build_object\([\s\S]*?'projection', page\.access_mode/);
  assert.doesNotMatch(migration, /payload\s*-\s*'employeeNote'/);
  assert.doesNotMatch(migration, /'metadata',\s*event\.metadata(?:\s|,|\))/);
});

test('validador rechaza drift de locks, provenance y metadata', () => {
  const wrongOrder = structuredClone(evidence());
  const session = wrongOrder.functions.find((item) => item.signature === ACTION_READ_SIGNATURES.sessionAssert);
  session.definition = session.definition.replace(
    'FROM tenant_action_authority authority', 'FROM tenant_action_employment_link authority',
  );
  assert.throws(() => validateActionReadEvidence(wrongOrder), /session facade/);

  const identityOrder = structuredClone(evidence());
  const identitySession = identityOrder.functions.find(
    (item) => item.signature === ACTION_READ_SIGNATURES.sessionAssert,
  );
  identitySession.definition = identitySession.definition
    .replace('FROM internal_users users', 'FROM __lock_swap users')
    .replace('FROM tenant_identity_session identity_session', 'FROM internal_users identity_session')
    .replace('FROM __lock_swap users', 'FROM tenant_identity_session users');
  assert.throws(() => validateActionReadEvidence(identityOrder), /session facade/);

  const blockingIdentityLock = structuredClone(evidence());
  const blockingSession = blockingIdentityLock.functions.find(
    (item) => item.signature === ACTION_READ_SIGNATURES.sessionAssert,
  );
  blockingSession.definition = blockingSession.definition.replaceAll('FOR SHARE NOWAIT', 'FOR SHARE');
  assert.throws(() => validateActionReadEvidence(blockingIdentityLock), /NOWAIT|session facade/);

  const falseLogout = structuredClone(evidence());
  const falseLogoutSession = falseLogout.functions.find(
    (item) => item.signature === ACTION_READ_SIGNATURES.sessionAssert,
  );
  falseLogoutSession.definition = falseLogoutSession.definition.replace(
    "WHEN lock_not_available THEN\n    RAISE EXCEPTION 'ACTION_SESSION_BUSY'",
    "WHEN lock_not_available THEN\n    RAISE EXCEPTION 'ACTION_SESSION_INVALID'",
  );
  assert.throws(() => validateActionReadEvidence(falseLogout), /ACTION_SESSION_BUSY|contencion transitoria/);

  const rawMetadata = structuredClone(evidence());
  const detail = rawMetadata.functions.find((item) => item.signature === ACTION_READ_SIGNATURES.detail);
  detail.definition = detail.definition.replace(
    "'metadata', jsonb_strip_nulls(jsonb_build_object(", "'metadata', event.metadata || jsonb_build_object(",
  );
  assert.throws(() => validateActionReadEvidence(rawMetadata), /metadata cruda/);
});

test('ACL final es execute-only y acepta solo la arista administrativa segura de Neon', () => {
  validateActionReadRuntimeAclEvidence(aclEvidence());
  const inherited = structuredClone(aclEvidence());
  inherited.runtimeRole.inherit = true;
  assert.throws(() => validateActionReadRuntimeAclEvidence(inherited), /LOGIN NOINHERIT/);

  const runtimeToOwner = structuredClone(aclEvidence());
  runtimeToOwner.runtimeRole.membershipCount = 1;
  runtimeToOwner.runtimeRole.memberCount = 0;
  runtimeToOwner.roleMemberships = [{
    direction: 'granted_to_runtime', grantedRole: 'neondb_owner',
    memberRole: 'municontrol_actions_runtime_app', adminOption: false,
    inheritOption: false, setOption: false, memberIsCurrentUser: false,
    memberOwnsApprovedFunctions: false,
  }];
  assert.throws(() => validateActionReadRuntimeAclEvidence(runtimeToOwner), /membresias|arista/);

  const foreignMember = structuredClone(aclEvidence());
  foreignMember.roleMemberships[0].memberRole = 'foreign_operator';
  foreignMember.roleMemberships[0].memberIsCurrentUser = false;
  foreignMember.roleMemberships[0].memberOwnsApprovedFunctions = false;
  assert.throws(() => validateActionReadRuntimeAclEvidence(foreignMember), /arista/);

  for (const [field, value] of [['inheritOption', true], ['setOption', true], ['adminOption', false]]) {
    const optionDrift = structuredClone(aclEvidence());
    optionDrift.roleMemberships[0][field] = value;
    assert.throws(() => validateActionReadRuntimeAclEvidence(optionDrift), /arista/, field);
  }

  const wrongOwner = structuredClone(aclEvidence());
  wrongOwner.roleMemberships[0].memberOwnsApprovedFunctions = false;
  assert.throws(() => validateActionReadRuntimeAclEvidence(wrongOwner), /arista/);

  const direct = structuredClone(aclEvidence());
  direct.relations[0].canSelect = true;
  assert.throws(() => validateActionReadRuntimeAclEvidence(direct), /privilegio directo/);

  const legacy = structuredClone(aclEvidence());
  legacy.runtimeFunctions.find((item) => item.signature.includes('tenant_iam_admin_view(text')).execute = true;
  assert.throws(() => validateActionReadRuntimeAclEvidence(legacy), /ACL runtime de funcion/);
});

test('toda fachada runtime heredada conserva owner, SECDEF, search_path y PUBLIC revocado', () => {
  const inheritedSignature = ACTION_READ_RUNTIME_FUNCTION_ALLOWLIST.find(
    (signature) => signature.includes('tenant_identity_resolve_access'),
  );
  assert.ok(inheritedSignature);
  for (const [field, value] of [
    ['securityDefiner', false],
    ['publicExecuteRevoked', false],
    ['ownedByCurrentUser', false],
    ['owner', 'municontrol_actions_runtime_app'],
    ['config', 'search_path=public'],
  ]) {
    const drift = structuredClone(evidence());
    drift.functions.find((item) => item.signature === inheritedSignature)[field] = value;
    assert.throws(() => validateActionReadEvidence(drift), /ausente o insegura/);
  }
  assert.match(applier, /aclexplode\(COALESCE\(function_row\.proacl, acldefault/);
  assert.match(applier, /acl\.grantee = 0 AND acl\.privilege_type = 'EXECUTE'/);
});

test('orden 007 evita ciclos con revocación 005 y falla cerrado ante lock concurrente', () => {
  const session = functionDefinition(migration, 'action_center_assert_tenant_read_session_v2');
  assert.ok(session.indexOf('FROM internal_users users') < session.indexOf('FROM tenant_membership membership'));
  assert.ok(session.indexOf('FROM tenant_membership membership')
    < session.indexOf('FROM tenant_identity_session identity_session'));
  assert.match(session, /FROM tenant_membership membership[\s\S]*?FOR SHARE NOWAIT;/);
  assert.match(session, /FROM tenant_identity_session identity_session[\s\S]*?FOR SHARE NOWAIT;/);
  assert.match(session, /WHEN lock_not_available[\s\S]*?ACTION_SESSION_BUSY/);
  assert.doesNotMatch(session, /WHEN lock_not_available[\s\S]*?ACTION_SESSION_INVALID/);
  assert.match(identityMigration, /UPDATE internal_users[\s\S]*?UPDATE tenant_identity_session/);
  assert.match(identityMigration, /TG_TABLE_NAME = 'tenant_membership'[\s\S]*?UPDATE tenant_identity_session/);
  assert.match(identityMigration, /p_command = 'switch_context'[\s\S]*?FOR UPDATE;[\s\S]*?tenant_identity_create_session/);
});

test('collector usa firmas canónicas y aplicadores 003-006 son version-aware', () => {
  assert.match(applier, /format\('%s\.%s\(%s\)'[\s\S]*oidvectortypes/);
  assert.match(applier, /function_row\.proname LIKE 'tenant_iam%'/);
  assert.match(applier, /function_row\.proname LIKE 'tenant_identity%'/);
  assert.match(applier, /pg_auth_members/);
  for (const file of [
    'apply-action-center-schema.mjs',
    'apply-tenant-iam-schema.mjs',
    'apply-tenant-identity-gateway-schema.mjs',
    'apply-tenant-action-authority-schema.mjs',
  ]) {
    const source = readFileSync(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
    assert.match(source, /007-action-center-read-facades/, file);
    assert.match(source, /verifyActionReadFinalAcl/, file);
  }
});
