import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TENANT_IAM_SCHEMA_CONTRACT,
  validateTenantIamEvidence,
} from '../scripts/apply-tenant-iam-schema.mjs';
import { bootstrapConfiguration } from '../scripts/bootstrap-tenant-iam.mjs';

const migrationUrl = new URL('../scripts/migrations/004-tenant-iam-control-plane.sql', import.meta.url);
const applyUrl = new URL('../scripts/apply-tenant-iam-schema.mjs', import.meta.url);
const bootstrapUrl = new URL('../scripts/bootstrap-tenant-iam.mjs', import.meta.url);

function validEvidence() {
  const contract = TENANT_IAM_SCHEMA_CONTRACT;
  return {
    tables: [...contract.tables],
    functions: contract.functions.map((signature) => ({
      signature, securityDefiner: true, config: 'search_path=public, pg_temp',
      ownedByCurrentUser: true, publicExecuteRevoked: true,
    })),
    indexes: contract.indexes.map((name) => ({ name, unique: true, valid: true, ready: true })),
    trigger: {
      name: contract.trigger, enabled: 'O', tableName: 'tenant_iam_event',
      functionName: 'tenant_iam_reject_change',
      definition: 'CREATE TRIGGER tenant_iam_event_append_only BEFORE UPDATE OR DELETE ON tenant_iam_event',
    },
    constraint: {
      name: contract.constraint, validated: true,
      definition: 'CHECK ((active IS FALSE) OR (password_hash IS NOT NULL))',
    },
  };
}

test('004 crea control plane, CRM, membresías, overrides y auditoría append-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const table of TENANT_IAM_SCHEMA_CONTRACT.tables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(sql, /tenant_membership_status_ck CHECK \(status IN \('invited', 'active', 'suspended'\)\)/);
  assert.match(sql, /allow_override IS TRUE AND deny_override IS FALSE[\s\S]+allow_override IS FALSE AND deny_override IS TRUE/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS tenant_exclusive_capability_active_uk[\s\S]+WHERE active IS TRUE/);
  assert.match(sql, /capability_key = 'time\.overtime\.enter'/);
  assert.match(sql, /CREATE TRIGGER tenant_iam_event_append_only\s+BEFORE UPDATE OR DELETE ON tenant_iam_event/);
  assert.match(sql, /TENANT_IAM_AUDIT_IMMUTABLE/);
  assert.match(sql, /tenant_iam_event_actor_idempotency_uk UNIQUE \(actor_user_email, idempotency_key\)/);
  assert.match(sql, /event\.actor_user_email AS "actorEmail"/);
  assert.match(sql, /event\.outcome, event\.occurred_at AS "occurredAt"/);
  assert.doesNotMatch(sql.slice(sql.indexOf("ELSIF p_resource = 'audit'"), sql.indexOf('RAISE EXCEPTION', sql.indexOf("ELSIF p_resource = 'audit'"))), /command_hash|idempotency_key|event\.result/);
  assert.match(sql, /TENANT_IAM_VERSION_CONFLICT/);
  assert.match(sql, /internal_users_active_password_ck[\s\S]+active IS FALSE OR password_hash IS NOT NULL/);
});

test('invitación queda preparada sin contraseña ni token y no habilita login', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const invitationStart = sql.indexOf('CREATE TABLE IF NOT EXISTS tenant_invitation');
  const invitation = sql.slice(invitationStart, sql.indexOf('CREATE TABLE IF NOT EXISTS tenant_exclusive_capability'));
  assert.doesNotMatch(invitation, /password_hash|token_hash|secret/i);
  assert.match(sql, /ALTER TABLE internal_users ALTER COLUMN password_hash DROP NOT NULL/);
  assert.match(sql, /'INVITED_TENANT_USER', NULL, false/);
  assert.match(sql, /WHERE lower\(email\) = normalized_email LIMIT 1 FOR UPDATE/);
  assert.match(sql, /IF FOUND THEN\s+RAISE EXCEPTION 'TENANT_IAM_USER_ALREADY_EXISTS'/);
  assert.doesNotMatch(sql, /IF invited_user\.active IS TRUE/);
  assert.doesNotMatch(sql, /ON CONFLICT \(email\) DO UPDATE SET[\s\S]+INVITED_TENANT_USER/);
  assert.match(sql, /'credentialsCreated', false/);
  assert.match(sql, /'invitationGatewayReady', false/);
  assert.match(sql, /'tenantDataPlaneReady', false/);
  assert.match(sql, /jsonb_object_keys\(p_payload\)/);
  assert.match(sql, /jsonb_typeof\(p_payload->'membershipId'\) IS DISTINCT FROM 'string'/);
  assert.ok(sql.indexOf("(p_payload->>'tenantId') !~*") < sql.indexOf("WHERE id = (p_payload->>'tenantId')::uuid"));
});

test('catálogo separa PLATFORM_OWNER del rol operativo y materializa SoD', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /ORDER BY item\."legalName"/);
  assert.doesNotMatch(sql, /ORDER BY item\.legal_name/);
  assert.match(sql, /\('PLATFORM_OWNER', 'Propietario de plataforma'/);
  assert.match(sql, /no hereda permisos laborales/i);
  assert.match(sql, /\('JUNIN_TESORERIA_CARGA'/);
  assert.match(sql, /\('JUNIN_RRHH_OPERADOR'/);
  assert.match(sql, /\('JUNIN_RRHH_APROBADOR'/);
  assert.match(sql, /\('time\.overtime\.approve', 'time\.overtime\.enter'/);
  assert.match(sql, /\('leave\.approve', 'leave\.enter'/);
  assert.match(sql, /\('absence\.enter', 'absence\.validate'/);
  assert.match(sql, /tenant_iam_assert_no_sod_conflict\(membership\.id\)/);
});

test('update_access revoca atómicamente una exclusividad cuyo permiso efectivo desaparece', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const updateAccessStart = sql.indexOf("ELSIF p_command = 'update_access'");
  const updateAccess = sql.slice(updateAccessStart, sql.indexOf("ELSIF p_command = 'suspend_membership'", updateAccessStart));
  assert.match(updateAccess, /UPDATE tenant_exclusive_capability exclusive_assignment[\s\S]+SET active = false, revoked_at = now\(\)/);
  assert.match(updateAccess, /NOT EXISTS \([\s\S]+tenant_iam_effective_capabilities\(membership\.id\)[\s\S]+effective\.capability_key = exclusive_assignment\.capability_key/);
  assert.match(updateAccess, /GET DIAGNOSTICS exclusive_revoked_count = ROW_COUNT/);
  assert.match(updateAccess, /'exclusiveAssignmentsRevoked', exclusive_revoked_count/);
  assert.ok(updateAccess.indexOf('PERFORM tenant_iam_assert_no_sod_conflict') < updateAccess.indexOf('UPDATE tenant_exclusive_capability'));
});

test('update_access audita snapshots gobernados y ordenados antes y después del cambio', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const updateAccessStart = sql.indexOf("ELSIF p_command = 'update_access'");
  const updateAccess = sql.slice(updateAccessStart, sql.indexOf("ELSIF p_command = 'suspend_membership'", updateAccessStart));
  assert.match(updateAccess, /INTO access_before/);
  assert.match(updateAccess, /INTO access_after/);
  assert.match(updateAccess, /'accessChange', jsonb_build_object\([\s\S]+?'reason', btrim\(p_payload->>'reason'\), 'before', access_before, 'after', access_after/);
  const beforeSnapshot = updateAccess.slice(
    updateAccess.lastIndexOf('SELECT jsonb_build_object(', updateAccess.indexOf('INTO access_before')),
    updateAccess.indexOf('INTO access_before'),
  );
  const afterSnapshot = updateAccess.slice(
    updateAccess.lastIndexOf('SELECT jsonb_build_object(', updateAccess.indexOf('INTO access_after')),
    updateAccess.indexOf('INTO access_after'),
  );
  for (const snapshotKey of ["'roleKey'", "'allow'", "'deny'", "'effectiveCapabilities'"]) {
    assert.equal(beforeSnapshot.split(snapshotKey).length - 1, 1, `${snapshotKey} debe existir en before`);
    assert.equal(afterSnapshot.split(snapshotKey).length - 1, 1, `${snapshotKey} debe existir en after`);
  }
  assert.equal(beforeSnapshot.split("'version'").length - 1, 1);
  assert.equal(afterSnapshot.split("'version'").length - 1, 1);
  assert.match(updateAccess, /jsonb_agg\(access_override\.capability_key ORDER BY access_override\.capability_key\)/);
  assert.match(updateAccess, /jsonb_agg\(effective\.capability_key ORDER BY effective\.capability_key\)/);
  assert.ok(updateAccess.indexOf('INTO access_before') < updateAccess.indexOf('DELETE FROM tenant_membership_capability_override'));
  assert.ok(updateAccess.indexOf('UPDATE tenant_membership SET role_key') < updateAccess.indexOf('INTO access_after'));
});

test('runtime aislado sólo ejecuta dos fachadas SECURITY DEFINER y no recibe DML', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /runtime_role\.rolinherit/);
  assert.match(sql, /runtime_role\.rolbypassrls/);
  assert.match(sql, /pg_auth_members/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION tenant_iam_admin_view\(text, text, integer\)/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION tenant_iam_apply_command\(text, text, uuid, text, integer, jsonb\)/);
  assert.doesNotMatch(sql, /GRANT (?:INSERT|UPDATE|DELETE|ALL)[\s\S]+TO municontrol_actions_runtime_app/);
  for (const signature of TENANT_IAM_SCHEMA_CONTRACT.functions) {
    assert.match(sql, /SECURITY DEFINER SET search_path = public, pg_temp/);
    assert.ok(signature.startsWith('public.tenant_iam_'));
  }
});

test('aplicador usa conexión directa, checksum, lock y verificación semántica/ACL', async () => {
  const source = await readFile(applyUrl, 'utf8');
  assert.match(source, /directCanonicalDatabaseUrl\(\)/);
  assert.match(source, /splitPostgresStatements/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /validateTenantIamEvidence/);
  assert.match(source, /has_any_column_privilege/);
  assert.match(source, /has_function_privilege/);
  assert.match(source, /has_sequence_privilege/);
  assert.match(source, /owner\.rolname = current_user/);
  assert.match(source, /aclexplode/);
  assert.match(source, /acl\.grantee = 0/);
  assert.match(source, /pg_get_triggerdef/);
  assert.match(source, /con\.convalidated AS validated/);
  assert.doesNotThrow(() => validateTenantIamEvidence(validEvidence()));
  const broken = validEvidence();
  broken.trigger.enabled = 'D';
  assert.throws(() => validateTenantIamEvidence(broken), /append-only/);
});

test('bootstrap exige email exacto, no crea cuentas ni cambia rol operativo legado', async () => {
  assert.throws(() => bootstrapConfiguration({}), /PLATFORM_OWNER_EMAIL/);
  const config = bootstrapConfiguration({ PLATFORM_OWNER_EMAIL: 'Marcelo@Example.test' });
  assert.equal(config.ownerEmail, 'marcelo@example.test');
  assert.equal(config.slug, 'junin-mendoza');
  const source = await readFile(bootstrapUrl, 'utf8');
  assert.match(source, /rowCount !== 1/);
  assert.match(source, /exactamente un usuario interno activo/);
  assert.match(source, /INSERT INTO platform_user_role/);
  assert.match(source, /PLATFORM_OWNER fue revocado y el bootstrap no puede reactivarlo/);
  assert.match(source, /previous\.rowCount && existingOwnerRole\.rowCount !== 1/);
  assert.match(source, /\$2::uuid, 'bootstrap_platform_owner'/);
  assert.match(source, /\$2::uuid::text/);
  assert.doesNotMatch(source, /ON CONFLICT \(user_email, role_key\) DO UPDATE/);
  assert.doesNotMatch(source, /active = true, revoked_at = NULL/);
  assert.doesNotMatch(source, /INSERT INTO internal_users/);
  assert.doesNotMatch(source, /password_hash|INTERNAL_ADMIN_PASSWORD/);
  assert.match(source, /operationalLegacyRoleChanged: false/);
  assert.match(source, /employmentLinkCreated: false/);
  assert.match(source, /\$2::uuid[^\n]+\$2::uuid::text/);
});
