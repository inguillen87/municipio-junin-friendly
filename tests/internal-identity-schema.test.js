import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TENANT_IDENTITY_SCHEMA_CONTRACT,
  validateTenantIdentityEvidence,
} from '../scripts/apply-tenant-identity-gateway-schema.mjs';

const migrationUrl = new URL('../scripts/migrations/005-tenant-identity-gateway.sql', import.meta.url);
const applyUrl = new URL('../scripts/apply-tenant-identity-gateway-schema.mjs', import.meta.url);

function validEvidence() {
  const contract = TENANT_IDENTITY_SCHEMA_CONTRACT;
  return {
    tables: [...contract.tables],
    functions: contract.functions.map((signature) => ({
      signature, securityDefiner: true, ownedByCurrentUser: true,
      publicExecuteRevoked: true, config: 'search_path=public, pg_temp',
    })),
    forbiddenFunctions: contract.forbiddenFunctions.map((signature) => ({ signature, exists: false })),
    indexes: contract.indexes.map((name) => ({ name, valid: true, ready: true, unique: true })),
    triggers: contract.triggers.map((name) => ({ name, enabled: 'O', definition: 'CREATE TRIGGER x' })),
    activeConstraint: { validated: true, definition: 'CHECK auth_mode identity_version' },
    policyForeignKey: {
      validated: true,
      definition: 'FOREIGN KEY (tenant_id, certified_source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id)',
    },
    activationSecretConstraint: {
      validated: true,
      definition: "CHECK purpose = 'activation' AND status <> 'pending' OR invitation_secret_version IS NOT NULL",
    },
  };
}

test('005 nace fail-closed y no almacena codigos ni recovery material en claro', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of TENANT_IDENTITY_SCHEMA_CONTRACT.tables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(sql, /tenant_data_plane_ready boolean NOT NULL DEFAULT false/);
  assert.match(sql, /invitation_delivery_ready boolean NOT NULL DEFAULT false/);
  assert.match(sql, /code_hash char\(64\) NOT NULL/);
  assert.match(sql, /flow_hash char\(64\) NOT NULL UNIQUE/);
  assert.match(sql, /tenant_identity_recovery_code[\s\S]+code_hash char\(64\) NOT NULL/);
  assert.doesNotMatch(sql, /invitation_code|recovery_code\s+text|flow_token/i);
  assert.match(sql, /IDENTITY_DATA_PLANE_NOT_READY/);
  assert.match(sql, /status varchar\(16\) NOT NULL DEFAULT 'pending'/);
  assert.match(sql, /p_command = 'confirm_delivery'/);
  assert.match(sql, /status = 'pending'[\s\S]+deliverInvitation|status = 'pending'[\s\S]+confirm_delivery/);
  assert.match(sql, /tenant_identity_command_replay/);
});

test('binding certificado es tenant-owned, GRH exacto y ligado al release', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const applyFunction = sql.match(/CREATE OR REPLACE FUNCTION tenant_identity_apply_command[\s\S]+?\n\$\$;/)?.[0] || '';
  assert.match(sql, /FOREIGN KEY \(tenant_id, certified_source_binding_id\)/);
  assert.match(sql, /binding\.id = NEW\.certified_source_binding_id[\s\S]+binding\.tenant_id = NEW\.tenant_id[\s\S]+binding\.source_system = 'GRH'[\s\S]+binding\.verified IS TRUE/);
  assert.match(sql, /'certifiedReleaseSha', policy_row\.certified_release_sha/);
  assert.match(sql, /binding\.id = policy_row\.certified_source_binding_id/);
  assert.match(sql, /certified_release_sha char\(40\)/);
  assert.match(sql, /tenant_identity_lookup\([\s\S]+p_release_sha text DEFAULT ''/);
  assert.match(sql, /tenant_identity_command_replay\([\s\S]+p_release_sha text/);
  assert.match(sql, /DROP FUNCTION IF EXISTS tenant_identity_lookup\(text, text, text\)/);
  assert.match(sql, /DROP FUNCTION IF EXISTS tenant_identity_command_replay\(text, uuid\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION tenant_identity_lookup[\s\S]+LANGUAGE plpgsql VOLATILE/);
  assert.ok((sql.match(/FOR SHARE OF policy/g) || []).length >= 3);
  assert.ok((applyFunction.match(/certified_release_sha IS DISTINCT FROM lower\(p_payload->>'releaseSha'\)/g) || []).length >= 4);
  assert.match(applyFunction, /IF replay\.command IN \('issue_invitation', 'confirm_delivery', 'begin_activation', 'complete_activation'\)[\s\S]+IDENTITY_RELEASE_NOT_CERTIFIED[\s\S]+RETURN replay\.result/);
});

test('cada flujo de activacion queda ligado a la version exacta del secreto one-time', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const applyFunction = sql.match(/CREATE OR REPLACE FUNCTION tenant_identity_apply_command[\s\S]+?\n\$\$;/)?.[0] || '';
  assert.match(sql, /invitation_secret_version integer/);
  assert.match(sql, /purpose = 'activation' AND status = 'pending' AND invitation_secret_version IS NULL/);
  assert.match(applyFunction, /code_hash = p_payload->>'codeHash' FOR SHARE/);
  assert.match(applyFunction, /invitation_secret\.version, membership\.tenant_id/);
  assert.match(applyFunction, /version = challenge\.invitation_secret_version FOR UPDATE/);
});

test('cada callback de entrega queda correlacionado con un intento inmutable', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const applyFunction = sql.match(/CREATE OR REPLACE FUNCTION tenant_identity_apply_command[\s\S]+?\n\$\$;/)?.[0] || '';
  assert.match(sql, /delivery_attempt_id uuid NOT NULL/);
  assert.match(sql, /tenant_identity_invitation_secret_attempt_uk/);
  assert.match(sql, /'deliveryAttemptId', secret_row\.delivery_attempt_id/);
  assert.match(applyFunction, /delivery_attempt_id = EXCLUDED\.delivery_attempt_id/);
  assert.match(applyFunction, /UPDATE tenant_invitation SET status = 'prepared'[\s\S]+version = version \+ 1/);
  assert.ok((applyFunction.match(/delivery_attempt_id = \(p_payload->>'deliveryAttemptId'\)::uuid/g) || []).length >= 4);
  assert.ok((applyFunction.match(/IDENTITY_DELIVERY_ATTEMPT_STALE/g) || []).length >= 4);
});

test('roles de lectura son explicitos, sin wildcard ni herencia desde PLATFORM_OWNER', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const capability of [
    'workforce.summary.read', 'workforce.structure.read', 'workforce.employee.read',
    'payroll.read', 'absence.analytics.read', 'absence.nominal.read', 'leave.policy.read',
    'leave.preview.read', 'management.analytics.read', 'quality.read', 'lineage.read',
    'budget.approved.read', 'assistant.use', 'actions.read',
  ]) assert.match(sql, new RegExp(`'${capability.replaceAll('.', '\\.')}'`));
  assert.doesNotMatch(sql, /\('PLATFORM_OWNER', '(?:workforce|payroll|absence|leave|assistant|actions)\./);
  assert.doesNotMatch(sql, /capability_key\s*=\s*'\*'/);
});

test('sesion, MFA y legacy binding fallan cerrados ante replay, suspension o contexto implicito', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const applyFunction = sql.match(/CREATE OR REPLACE FUNCTION tenant_identity_apply_command[\s\S]+?\n\$\$;/)?.[0] || '';
  assert.match(sql, /last_seen_at > now\(\) - interval '1 hour'/);
  assert.match(sql, /p_totp_step <= factor\.last_accepted_step/);
  assert.match(sql, /IDENTITY_MFA_REPLAY/);
  assert.match(sql, /purpose = 'login_context'/);
  assert.match(sql, /IDENTITY_CONTEXT_FORBIDDEN/);
  assert.match(sql, /tenant_identity_membership_disables_legacy/);
  assert.match(sql, /NOT EXISTS \([\s\S]+FROM tenant_membership any_membership/);
  assert.match(sql, /status = 'revoked', revoked_at = now\(\)/);
  assert.match(sql, /challenge\.version IS DISTINCT FROM p_expected_version/);
  assert.match(sql, /remainingAttempts'[\s\S]+challenge\.max_attempts - challenge\.attempts/);
  assert.match(applyFunction, /factor_enrolled boolean := false;/);
  assert.match(applyFunction, /privileged_context boolean := false;/);
  assert.match(applyFunction, /access_context jsonb;/);
});

test('runtime tiene solo facades SECURITY DEFINER y aplicador valida ACL', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const apply = await readFile(applyUrl, 'utf8');
  assert.doesNotMatch(sql, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]+TO municontrol_actions_runtime_app/);
  for (const signature of TENANT_IDENTITY_SCHEMA_CONTRACT.runtimeFunctions) {
    const short = signature.replace('public.', '').replaceAll('timestamp with time zone', 'timestamptz');
    assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION ${short.replace(/[()[\]]/g, '\\$&').replaceAll(',', ',\\s*')}`));
  }
  assert.match(apply, /directCanonicalDatabaseUrl\(\)/);
  assert.match(apply, /pg_advisory_xact_lock/);
  assert.match(apply, /has_any_column_privilege/);
  assert.match(apply, /has_function_privilege/);
  assert.doesNotMatch(apply, /\b(?:FROM|JOIN)\s+pg_constraint\s+constraint\b/i);
  assert.match(apply, /FROM pg_constraint constraint_row/);
  assert.match(apply, /migracion \$\{MIGRATION_VERSION\} sentencia \$\{index \+ 1\}/);
  assert.doesNotThrow(() => validateTenantIdentityEvidence(validEvidence()));
  const broken = validEvidence(); broken.triggers[0].enabled = 'D';
  assert.throws(() => validateTenantIdentityEvidence(broken), /trigger identity/);
  const unsafeOverload = validEvidence(); unsafeOverload.forbiddenFunctions[0].exists = true;
  assert.throws(() => validateTenantIdentityEvidence(unsafeOverload), /overload identity inseguro/);
  const unboundActivation = validEvidence(); unboundActivation.activationSecretConstraint.definition = 'CHECK (true)';
  assert.throws(() => validateTenantIdentityEvidence(unboundActivation), /activation secret-version/);
});
