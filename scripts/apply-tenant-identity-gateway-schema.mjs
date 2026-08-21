import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

const MIGRATION_VERSION = '005-tenant-identity-gateway';
const ACTION_AUTHORITY_MIGRATION_VERSION = '006-tenant-action-authority';
const MIGRATION_URL = new URL('./migrations/005-tenant-identity-gateway.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

export const TENANT_IDENTITY_SCHEMA_CONTRACT = Object.freeze({
  tables: Object.freeze([
    'tenant_identity_policy', 'tenant_identity_password_credential',
    'tenant_identity_invitation_secret', 'tenant_identity_auth_challenge',
    'tenant_identity_mfa_factor', 'tenant_identity_recovery_code',
    'tenant_identity_legacy_binding', 'tenant_identity_legacy_binding_capability',
    'tenant_identity_session', 'tenant_identity_rate_limit',
  ]),
  functions: Object.freeze([
    'public.tenant_identity_access_payload(text,uuid)',
    'public.tenant_identity_resolve_access(text,uuid,integer,integer,text[],text)',
    'public.tenant_identity_take_rate_limit(text,text,integer,integer,integer)',
    'public.tenant_identity_record_attempt(text,boolean,bigint)',
    'public.tenant_identity_lookup(text,text,text,text)',
    'public.tenant_identity_command_replay(text,uuid,text)',
    'public.tenant_identity_view(text,uuid,text,integer)',
    'public.tenant_identity_create_session(text,uuid,timestamp with time zone,text,text,text,uuid)',
    'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)',
    'public.tenant_identity_legacy_session_policy(text)',
    'public.tenant_identity_validate_policy_binding()',
    'public.tenant_identity_revoke_sessions_on_access_change()',
    'public.tenant_identity_disable_legacy_on_membership()',
  ]),
  runtimeFunctions: Object.freeze([
    'public.tenant_identity_resolve_access(text,uuid,integer,integer,text[],text)',
    'public.tenant_identity_take_rate_limit(text,text,integer,integer,integer)',
    'public.tenant_identity_record_attempt(text,boolean,bigint)',
    'public.tenant_identity_lookup(text,text,text,text)',
    'public.tenant_identity_command_replay(text,uuid,text)',
    'public.tenant_identity_view(text,uuid,text,integer)',
    'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)',
    'public.tenant_identity_legacy_session_policy(text)',
  ]),
  forbiddenFunctions: Object.freeze([
    'public.tenant_identity_lookup(text,text,text)',
    'public.tenant_identity_command_replay(text,uuid)',
  ]),
  indexes: Object.freeze([
    'platform_tenant_source_binding_tenant_id_id_uk',
    'tenant_identity_invitation_secret_attempt_uk',
    'tenant_identity_mfa_factor_active_uk',
    'tenant_identity_session_user_active_idx',
  ]),
  triggers: Object.freeze([
    'tenant_identity_policy_binding_guard', 'tenant_identity_membership_session_revoke',
    'tenant_identity_membership_disables_legacy', 'tenant_identity_legacy_session_revoke',
    'tenant_identity_user_session_revoke',
  ]),
});

function resultRows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function verificationQuery(client, label, query, parameters = []) {
  try {
    return await client.query(query, parameters);
  } catch (error) {
    throw new Error(`verificacion identity ${label}: ${error?.message || 'consulta invalida'}`, { cause: error });
  }
}

export function validateTenantIdentityEvidence(evidence) {
  const contract = TENANT_IDENTITY_SCHEMA_CONTRACT;
  const tables = new Set(evidence.tables || []);
  for (const table of contract.tables) if (!tables.has(table)) throw new Error(`tabla identity ausente: ${table}`);
  const functions = new Map((evidence.functions || []).map((row) => [row.signature, row]));
  for (const signature of contract.functions) {
    const row = functions.get(signature);
    if (!row || row.securityDefiner !== true || row.ownedByCurrentUser !== true
        || row.publicExecuteRevoked !== true
        || !String(row.config || '').includes('search_path=public, pg_temp')) {
      throw new Error(`funcion identity insegura o ausente: ${signature}`);
    }
  }
  const forbiddenFunctions = new Map((evidence.forbiddenFunctions || []).map((row) => [row.signature, row]));
  for (const signature of contract.forbiddenFunctions) {
    if (forbiddenFunctions.get(signature)?.exists !== false) {
      throw new Error(`overload identity inseguro presente: ${signature}`);
    }
  }
  const indexes = new Map((evidence.indexes || []).map((row) => [row.name, row]));
  for (const name of contract.indexes) {
    const row = indexes.get(name);
    if (!row || row.valid !== true || row.ready !== true) throw new Error(`indice identity invalido: ${name}`);
  }
  const triggers = new Map((evidence.triggers || []).map((row) => [row.name, row]));
  for (const name of contract.triggers) {
    const row = triggers.get(name);
    if (!row || row.enabled !== 'O' || !String(row.definition || '').toLowerCase().includes('trigger')) {
      throw new Error(`trigger identity ausente: ${name}`);
    }
  }
  if (evidence.activeConstraint?.validated !== true
      || !String(evidence.activeConstraint.definition || '').includes('auth_mode')
      || !String(evidence.activeConstraint.definition || '').includes('identity_version')) {
    throw new Error('constraint managed identity invalido');
  }
  if (evidence.policyForeignKey?.validated !== true
      || !String(evidence.policyForeignKey.definition || '').includes('tenant_id, certified_source_binding_id')) {
    throw new Error('FK binding certificado tenant-owned ausente');
  }
  const activationConstraint = String(evidence.activationSecretConstraint?.definition || '');
  if (evidence.activationSecretConstraint?.validated !== true
      || !activationConstraint.includes('invitation_secret_version')
      || !/status[\s\S]*<>[\s\S]*pending/i.test(activationConstraint)) {
    throw new Error('constraint activation secret-version ausente');
  }
}

async function verifyPrerequisites(client) {
  const required = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [['internal_users', 'tenant_membership', 'tenant_invitation', 'tenant_iam_event']]);
  if (required.rowCount !== 4) throw new Error('005 requiere control plane 004 completo');
  const migration = await client.query(
    `SELECT 1 FROM schema_migrations WHERE version = '004-tenant-iam-control-plane'`,
  );
  if (migration.rowCount !== 1) throw new Error('005 requiere migracion 004 registrada');
  const roleResult = await client.query(`
    SELECT rolcanlogin, rolinherit, rolsuper, rolcreaterole, rolcreatedb,
      rolreplication, rolbypassrls,
      EXISTS (SELECT 1 FROM pg_auth_members member WHERE member.member = role.oid) AS inherits_role
    FROM pg_roles role WHERE rolname = $1
  `, [RUNTIME_ROLE]);
  const role = roleResult.rows[0];
  if (!role || !role.rolcanlogin || role.rolinherit || role.rolsuper || role.rolcreaterole
      || role.rolcreatedb || role.rolreplication || role.rolbypassrls || role.inherits_role) {
    throw new Error(`${RUNTIME_ROLE} no es LOGIN NOINHERIT aislado`);
  }
}

async function collectEvidence(client) {
  const contract = TENANT_IDENTITY_SCHEMA_CONTRACT;
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [contract.tables]);
  const functions = await client.query(`
    SELECT requested.signature, proc.prosecdef AS "securityDefiner",
      array_to_string(proc.proconfig, ',') AS config,
      owner.rolname = current_user AS "ownedByCurrentUser",
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(proc.proacl, acldefault('f', proc.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked"
    FROM unnest($1::text[]) requested(signature)
    JOIN pg_proc proc ON proc.oid = to_regprocedure(requested.signature)
    JOIN pg_roles owner ON owner.oid = proc.proowner
  `, [contract.functions]);
  const forbiddenFunctions = await client.query(`
    SELECT requested.signature, to_regprocedure(requested.signature) IS NOT NULL AS exists
    FROM unnest($1::text[]) requested(signature)
  `, [contract.forbiddenFunctions]);
  const indexes = await client.query(`
    SELECT index_relation.relname AS name, index_meta.indisunique AS unique,
      index_meta.indisvalid AS valid, index_meta.indisready AS ready
    FROM pg_index index_meta
    JOIN pg_class index_relation ON index_relation.oid = index_meta.indexrelid
    JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
    WHERE namespace.nspname = 'public' AND index_relation.relname = ANY($1::text[])
  `, [contract.indexes]);
  const triggers = await client.query(`
    SELECT trigger.tgname AS name, trigger.tgenabled AS enabled,
      pg_get_triggerdef(trigger.oid, true) AS definition
    FROM pg_trigger trigger
    WHERE NOT trigger.tgisinternal AND trigger.tgname = ANY($1::text[])
  `, [contract.triggers]);
  const constraints = await verificationQuery(client, 'constraints', `
    SELECT constraint_row.conname AS name, constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    WHERE constraint_row.conname = ANY($1::text[])
  `, [[
    'internal_users_active_password_ck', 'tenant_identity_policy_certified_binding_fk',
    'tenant_identity_auth_challenge_activation_ck',
  ]]);
  const byName = new Map(constraints.rows.map((row) => [row.name, row]));
  return {
    tables: resultRows(tables).map((row) => row.table_name), functions: resultRows(functions),
    forbiddenFunctions: resultRows(forbiddenFunctions),
    indexes: resultRows(indexes), triggers: resultRows(triggers),
    activeConstraint: byName.get('internal_users_active_password_ck'),
    policyForeignKey: byName.get('tenant_identity_policy_certified_binding_fk'),
    activationSecretConstraint: byName.get('tenant_identity_auth_challenge_activation_ck'),
  };
}

async function verifyRuntimeAcl(client) {
  const contract = TENANT_IDENTITY_SCHEMA_CONTRACT;
  const direct = await client.query(`
    SELECT relation.relname AS resource,
      has_any_column_privilege($1, relation.oid, 'SELECT') AS can_select,
      has_any_column_privilege($1, relation.oid, 'INSERT') AS can_insert,
      has_any_column_privilege($1, relation.oid, 'UPDATE') AS can_update,
      has_table_privilege($1, relation.oid, 'DELETE') AS can_delete
    FROM pg_class relation JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($2::text[])
  `, [RUNTIME_ROLE, contract.tables]);
  for (const row of direct.rows) {
    if (row.can_select || row.can_insert || row.can_update || row.can_delete) {
      throw new Error(`ACL directa insegura: ${row.resource}`);
    }
  }
  const functionAcl = await client.query(`
    SELECT signature, to_regprocedure(signature) IS NOT NULL AS exists,
      has_function_privilege($1, to_regprocedure(signature), 'EXECUTE') AS can_execute
    FROM unnest($2::text[]) requested(signature)
  `, [RUNTIME_ROLE, contract.functions]);
  for (const row of functionAcl.rows) {
    const expected = contract.runtimeFunctions.includes(row.signature);
    if (!row.exists || row.can_execute !== expected) throw new Error(`ACL function incorrecta: ${row.signature}`);
  }
  const unexpectedRuntimeFunctions = await client.query(`
    SELECT procedure.oid::regprocedure::text AS signature
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname = 'public' AND procedure.proname LIKE 'tenant_identity_%'
      AND has_function_privilege($1, procedure.oid, 'EXECUTE')
      AND procedure.oid NOT IN (
        SELECT to_regprocedure(requested.signature)::oid
        FROM unnest($2::text[]) requested(signature)
      )
  `, [RUNTIME_ROLE, contract.runtimeFunctions]);
  if (unexpectedRuntimeFunctions.rowCount) {
    throw new Error(`runtime identity ejecuta facade no allowlisted: ${unexpectedRuntimeFunctions.rows[0].signature}`);
  }
  const sequences = await client.query(`
    SELECT sequence.relname AS name,
      has_sequence_privilege($1, sequence.oid, 'USAGE') AS usage,
      has_sequence_privilege($1, sequence.oid, 'SELECT') AS can_select,
      has_sequence_privilege($1, sequence.oid, 'UPDATE') AS can_update
    FROM pg_class sequence JOIN pg_namespace namespace ON namespace.oid = sequence.relnamespace
    WHERE namespace.nspname = 'public' AND sequence.relkind = 'S'
  `, [RUNTIME_ROLE]);
  for (const row of sequences.rows) {
    if (row.usage || row.can_select || row.can_update) throw new Error(`ACL sequence insegura: ${row.name}`);
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  const checksum = createHash('sha256').update(migration).digest('hex');
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:tenant-identity-005'))`);
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1', [MIGRATION_VERSION],
    );
    const actionAuthority = await client.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1', [ACTION_AUTHORITY_MIGRATION_VERSION],
    );
    if (actionAuthority.rowCount > 0 && !existing.rowCount) {
      throw new Error(`${MIGRATION_VERSION} no puede aplicarse después de ${ACTION_AUTHORITY_MIGRATION_VERSION}`);
    }
    if (existing.rowCount && existing.rows[0].checksum_sha256.trim() !== checksum) {
      throw new Error(`Drift detectado: ${MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query('INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [MIGRATION_VERSION, checksum]);
    }
    validateTenantIdentityEvidence(await collectEvidence(client));
    await verifyRuntimeAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${MIGRATION_VERSION}: ya aplicada y verificada`
      : `${MIGRATION_VERSION}: aplicada (${statements.length} sentencias, SHA-256 ${checksum})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
