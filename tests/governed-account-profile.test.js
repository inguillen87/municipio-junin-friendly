import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  InternalAdminError,
  applyInternalAdminCommand,
  internalAdminDatabaseError,
  normalizeInternalAdminCommand,
} from '../lib/internal-admin.js';
import {
  ACCOUNT_PROFILE_GOVERNANCE_CONTEXT_COLUMNS,
  ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION,
  ACCOUNT_PROFILE_GOVERNANCE_SIGNATURE,
  accountProfileGovernanceFingerprint,
  resolveAccountProfileGovernanceTarget,
  validateAccountProfileGovernanceEvidence,
  validateAccountProfileGovernanceMigrationSql,
} from '../scripts/apply-governed-account-profile-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const KEY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const RELEASE_SHA = 'a'.repeat(40);
const migration = await readFile(new URL(
  '../scripts/migrations/028-governed-account-profile.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-governed-account-profile-schema.mjs', import.meta.url,
), 'utf8');

function validBody(overrides = {}) {
  return {
    command: 'update_account_profile',
    expectedVersion: 2,
    payload: {
      tenantId: TENANT_ID,
      targetEmail: 'Cuenta.Institucional@Example.test',
      displayName: '  Alberto   Hugo   Leucrini  ',
      reason: 'Corrección validada contra la identidad institucional.',
    },
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    contextColumns: ACCOUNT_PROFILE_GOVERNANCE_CONTEXT_COLUMNS.map((name) => ({ name })),
    trigger: {
      name: 'account_profile_governance_event_context_append_only',
      functionName: 'tenant_iam_reject_change', enabled: 'O', rowLevel: true,
      timing: 'before', events: ['delete', 'update'],
    },
    function: {
      signature: ACCOUNT_PROFILE_GOVERNANCE_SIGNATURE,
      securityDefiner: true, ownedByCurrentUser: true, ownerIsRuntime: false,
      publicExecuteRevoked: true, runtimeCanExecute: true,
      config: ['search_path=public, pg_temp'],
    },
    contextTable: {
      ownedByCurrentUser: true, ownerIsRuntime: false,
      publicPrivilegesRevoked: true, runtimePrivilegesRevoked: true,
    },
    orphanEvents: 0, orphanContexts: 0, invalidVersionContexts: 0,
    ...overrides,
  };
}

test('028 expone un comando versionado y normaliza sólo displayName', () => {
  const command = normalizeInternalAdminCommand(validBody(), KEY);
  assert.equal(command.payload.targetEmail, 'cuenta.institucional@example.test');
  assert.equal(command.payload.displayName, 'Alberto Hugo Leucrini');
  assert.equal(command.expectedVersion, 2);
  assert.match(command.commandHash, /^[a-f0-9]{64}$/);

  assert.throws(() => normalizeInternalAdminCommand(validBody({
    expectedVersion: undefined,
  }), KEY), (error) => error instanceof InternalAdminError
    && error.code === 'INTERNAL_ADMIN_VERSION_REQUIRED');
  assert.throws(() => normalizeInternalAdminCommand(validBody({
    payload: { ...validBody().payload, roleKey: 'PLATFORM_OWNER' },
  }), KEY), (error) => error.code === 'INTERNAL_ADMIN_FIELD_UNSUPPORTED');
  for (const displayName of ['A', '<script>Nombre</script>', 'Nombre\u0000Interno']) {
    assert.throws(() => normalizeInternalAdminCommand(validBody({
      payload: { ...validBody().payload, displayName },
    }), KEY), (error) => error.code === 'INTERNAL_ADMIN_DISPLAY_NAME_INVALID');
  }
});

test('comando 028 usa fachada release-bound y nunca una mutación directa', async () => {
  const calls = [];
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    return [{ result: { account: { identityVersion: 3 }, sessionsRevoked: 2 } }];
  } };
  const command = normalizeInternalAdminCommand(validBody(), KEY);
  const session = { id: SESSION_ID, email: 'owner@example.test', version: 4 };
  const result = await applyInternalAdminCommand(sql, session, command, {
    releaseSha: RELEASE_SHA,
  });
  assert.equal(result.account.identityVersion, 3);
  assert.equal(calls.length, 1);
  assert.match(calls[0].statement, /account_profile_governance_apply_v1/);
  assert.doesNotMatch(calls[0].statement, /\bUPDATE\b/i);
  assert.deepEqual(calls[0].values.slice(0, 6), [
    'owner@example.test', SESSION_ID, 4, RELEASE_SHA,
    'update_account_profile', KEY,
  ]);
  assert.match(calls[0].values[6], /^[a-f0-9]{64}$/);
  assert.equal(calls[0].values[7], 2);
  assert.deepEqual(JSON.parse(calls[0].values[8]), command.payload);

  await applyInternalAdminCommand(sql, { ...session, version: 5 }, command, {
    releaseSha: RELEASE_SHA,
  });
  assert.notEqual(calls[0].values[6], calls[1].values[6],
    'el hash debe quedar ligado a la versión de la sesión actora');
});

test('errores 028 conservan estados estables para UI', () => {
  assert.equal(internalAdminDatabaseError(
    new Error('ACCOUNT_PROFILE_TENANT_NOT_ACTIVE'),
  ).code, 'INTERNAL_ADMIN_TENANT_INACTIVE');
  assert.equal(internalAdminDatabaseError(
    new Error('ACCOUNT_PROFILE_TENANT_NOT_READY'),
  ).code, 'INTERNAL_ADMIN_RELEASE_NOT_CERTIFIED');
  assert.equal(internalAdminDatabaseError(
    new Error('ACCOUNT_PROFILE_VERSION_CONFLICT'),
  ).code, 'INTERNAL_ADMIN_VERSION_CONFLICT');
  assert.equal(internalAdminDatabaseError(
    new Error('ACCOUNT_PROFILE_MEMBERSHIP_NOT_ACTIVE'),
  ).code, 'INTERNAL_ADMIN_MEMBERSHIP_INACTIVE');
  assert.equal(internalAdminDatabaseError(
    new Error('ACCOUNT_PROFILE_IDEMPOTENCY_KEY_REUSED'),
  ).code, 'INTERNAL_ADMIN_IDEMPOTENCY_REUSED');
});

test('SQL 028 está limitado a identidad visible, auditoría y revocación global', () => {
  assert.equal(ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION,
    '028-governed-account-profile');
  assert.equal(validateAccountProfileGovernanceMigrationSql(migration), true);
  assert.match(accountProfileGovernanceFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.equal(splitPostgresStatements(migration).length, 9);
  assert.match(migration, /policy\.tenant_data_plane_ready IS TRUE/);
  assert.match(migration, /policy\.certified_release_sha = p_release_sha/);
  assert.match(migration, /binding\.source_system = 'GRH'/);
  assert.match(migration, /replay\.command_hash IS DISTINCT FROM command_hash_value/);
  assert.ok(migration.indexOf('UPDATE tenant_identity_session SET')
    < migration.indexOf('UPDATE internal_users SET'));
  assert.doesNotMatch(migration,
    /\b(?:grh_employees|person_identity|employment_contract|tenant_action_employment_link)\b/i);
  assert.match(migration,
    /UPDATE internal_users SET[\s\S]+display_name = normalized_display_name[\s\S]+identity_version = identity_version \+ 1/);
  assert.match(migration,
    /UPDATE tenant_identity_session SET[\s\S]+WHERE lower\(user_email\) = target_email AND status = 'active'/);
  assert.doesNotMatch(migration,
    /WHERE lower\(user_email\) = target_email[\s\S]{0,120}\bsource\s*=/);
  assert.match(migration,
    /target_user\.identity_version IS DISTINCT FROM p_expected_version/);
  assert.match(migration,
    /previous_display_name_hash[\s\S]+resulting_display_name_hash[\s\S]+reason_hash/);
  assert.doesNotMatch(migration, /jsonb_build_object\(\s*'displayName'/i);
});

test('validador 028 rechaza ampliaciones hacia GRH, credenciales o más mutaciones', () => {
  assert.throws(() => validateAccountProfileGovernanceMigrationSql(
    `${migration}\nUPDATE grh_employees SET nombre = 'x';`,
  ), /registros laborales/);
  assert.throws(() => validateAccountProfileGovernanceMigrationSql(
    `${migration}\nUPDATE internal_users SET password_hash = 'x';`,
  ), /mutaciones de identidad/);
  assert.throws(() => validateAccountProfileGovernanceMigrationSql(
    migration.replace("ARRAY['tenantId','targetEmail','displayName','reason']",
      "ARRAY['tenantId','targetEmail','displayName','roleKey','reason']"),
  ), /tenantId/);
});

test('evidencia 028 exige fachada única, contexto inmutable y ledger completo', () => {
  assert.equal(validateAccountProfileGovernanceEvidence(evidence()), true);
  assert.throws(() => validateAccountProfileGovernanceEvidence(evidence({
    function: { ...evidence().function, publicExecuteRevoked: false },
  })), /fachada/);
  assert.throws(() => validateAccountProfileGovernanceEvidence(evidence({
    orphanEvents: 1,
  })), /auditoria/);
  assert.throws(() => validateAccountProfileGovernanceEvidence(evidence({
    contextColumns: evidence().contextColumns.filter((column) => column.name !== 'reason_hash'),
  })), /columnas/);
});

test('applier 028 es ledgered, transaccional, fijado a Neon y depende de 013', () => {
  for (const pattern of [
    /013-existing-identity-membership-governance\.sql/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredObjects\(client\)/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyAccountProfileGovernanceFinalState\(client\)/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString|targetEmail|displayName)/);
});

test('target 028 requiere pines independientes y distingue QA de Producción', () => {
  const host = 'ep-profile.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    ACCOUNT_PROFILE_GOVERNANCE_EXPECTED_NEON_BRANCH_ID: 'br-profile',
    ACCOUNT_PROFILE_GOVERNANCE_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    ACCOUNT_PROFILE_GOVERNANCE_EXPECTED_NEON_HOST: host,
    ACCOUNT_PROFILE_GOVERNANCE_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolveAccountProfileGovernanceTarget(
    ['--confirm-isolated-branch'], base,
  ).mode, 'isolated');
  assert.equal(resolveAccountProfileGovernanceTarget(
    ['--confirm-production-branch=br-profile'], {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-profile',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
});
