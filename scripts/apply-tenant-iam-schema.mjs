import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

const MIGRATION_VERSION = '004-tenant-iam-control-plane';
const ACTION_AUTHORITY_MIGRATION_VERSION = '006-tenant-action-authority';
const MIGRATION_URL = new URL('./migrations/004-tenant-iam-control-plane.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const LEGACY_ADMIN_VIEW_SIGNATURE = 'public.tenant_iam_admin_view(text,text,integer)';
const LEGACY_ADMIN_APPLY_SIGNATURE = 'public.tenant_iam_apply_command(text,text,uuid,text,integer,jsonb)';
const V2_ADMIN_VIEW_SIGNATURE = 'public.tenant_iam_admin_view_v2(text,uuid,integer,text,integer)';
const V2_ADMIN_APPLY_SIGNATURE = 'public.tenant_iam_apply_command_v2(text,uuid,integer,text,uuid,text,integer,jsonb)';
const V2_ADMIN_ASSERT_SIGNATURE = 'public.tenant_iam_assert_platform_session_v2(text,uuid,integer)';

export const TENANT_IAM_SCHEMA_CONTRACT = Object.freeze({
  tables: Object.freeze([
    'iam_capability', 'iam_capability_conflict', 'iam_role', 'iam_role_capability',
    'platform_tenant', 'platform_tenant_source_binding', 'platform_crm_account',
    'platform_user_role', 'tenant_membership', 'tenant_membership_capability_override',
    'tenant_invitation', 'tenant_exclusive_capability', 'tenant_iam_event',
  ]),
  functions: Object.freeze([
    'public.tenant_iam_reject_change()',
    'public.tenant_iam_is_platform_owner(text)',
    'public.tenant_iam_effective_capabilities(uuid)',
    'public.tenant_iam_assert_no_sod_conflict(uuid)',
    'public.tenant_iam_admin_view(text,text,integer)',
    'public.tenant_iam_apply_command(text,text,uuid,text,integer,jsonb)',
  ]),
  runtimeFunctions: Object.freeze([
    LEGACY_ADMIN_VIEW_SIGNATURE,
    LEGACY_ADMIN_APPLY_SIGNATURE,
  ]),
  indexes: Object.freeze([
    'internal_users_tenant_iam_id_uk',
    'platform_tenant_slug_lower_uk',
    'tenant_exclusive_capability_active_uk',
  ]),
  trigger: 'tenant_iam_event_append_only',
  constraint: 'internal_users_active_password_ck',
});

export function tenantIamRuntimeAclProfile(actionAuthorityApplied) {
  return Object.freeze({
    signatures: Object.freeze([
      ...TENANT_IAM_SCHEMA_CONTRACT.functions,
      ...(actionAuthorityApplied
        ? [V2_ADMIN_ASSERT_SIGNATURE, V2_ADMIN_VIEW_SIGNATURE, V2_ADMIN_APPLY_SIGNATURE]
        : []),
    ]),
    allowed: Object.freeze(actionAuthorityApplied
      ? [V2_ADMIN_VIEW_SIGNATURE, V2_ADMIN_APPLY_SIGNATURE]
      : [...TENANT_IAM_SCHEMA_CONTRACT.runtimeFunctions]),
  });
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

export function validateTenantIamEvidence(evidence) {
  const expected = TENANT_IAM_SCHEMA_CONTRACT;
  const tableNames = new Set(evidence.tables || []);
  for (const name of expected.tables) {
    if (!tableNames.has(name)) throw new Error(`tabla IAM ausente: ${name}`);
  }
  const functionRows = new Map((evidence.functions || []).map((row) => [row.signature, row]));
  for (const signature of expected.functions) {
    const row = functionRows.get(signature);
    if (!row || row.securityDefiner !== true
        || row.ownedByCurrentUser !== true
        || row.publicExecuteRevoked !== true
        || !String(row.config || '').includes('search_path=public, pg_temp')) {
      throw new Error(`funcion IAM insegura o ausente: ${signature}`);
    }
  }
  const indexRows = new Map((evidence.indexes || []).map((row) => [row.name, row]));
  for (const name of expected.indexes) {
    const row = indexRows.get(name);
    if (!row || row.valid !== true || row.ready !== true || row.unique !== true) {
      throw new Error(`indice IAM ausente o invalido: ${name}`);
    }
  }
  if (evidence.trigger?.name !== expected.trigger
      || evidence.trigger.enabled !== 'O'
      || evidence.trigger.tableName !== 'tenant_iam_event'
      || evidence.trigger.functionName !== 'tenant_iam_reject_change'
      || !['before', 'update', 'delete'].every((token) =>
        String(evidence.trigger.definition || '').toLowerCase().includes(token))) {
    throw new Error('trigger append-only IAM ausente o deshabilitado');
  }
  if (evidence.constraint?.name !== expected.constraint
      || evidence.constraint.validated !== true
      || !String(evidence.constraint.definition || '').includes('password_hash')
      || !String(evidence.constraint.definition || '').includes('active')) {
    throw new Error('constraint active/password IAM ausente o NOT VALID');
  }
}

async function verifyPrerequisites(client) {
  const requiredTables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [['internal_users']]);
  if (requiredTables.rowCount !== 1) throw new Error('004 requiere internal_users');

  const roleResult = await client.query(`
    SELECT rolcanlogin, rolinherit, rolsuper, rolcreaterole, rolcreatedb,
           rolreplication, rolbypassrls,
           EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member = role.oid) AS inherits_role
    FROM pg_roles role WHERE rolname = $1
  `, [RUNTIME_ROLE]);
  const role = roleResult.rows[0];
  if (!role || !role.rolcanlogin || role.rolinherit || role.rolsuper || role.rolcreaterole
      || role.rolcreatedb || role.rolreplication || role.rolbypassrls || role.inherits_role) {
    throw new Error(`${RUNTIME_ROLE} no es un runtime aislado LOGIN NOINHERIT`);
  }
}

async function collectEvidence(client) {
  const contract = TENANT_IAM_SCHEMA_CONTRACT;
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
  `, [contract.tables]);
  const functions = await client.query(`
    SELECT requested.signature,
           proc.prosecdef AS "securityDefiner",
           array_to_string(proc.proconfig, ',') AS config,
           owner.rolname = current_user AS "ownedByCurrentUser",
           NOT EXISTS (
             SELECT 1
             FROM aclexplode(COALESCE(proc.proacl, acldefault('f', proc.proowner))) acl
             WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
           ) AS "publicExecuteRevoked"
    FROM unnest($1::text[]) requested(signature)
    JOIN pg_proc proc ON proc.oid = to_regprocedure(requested.signature)
    JOIN pg_roles owner ON owner.oid = proc.proowner
  `, [contract.functions]);
  const indexes = await client.query(`
    SELECT idx.relname AS name, meta.indisunique AS unique,
           meta.indisvalid AS valid, meta.indisready AS ready
    FROM pg_index meta JOIN pg_class idx ON idx.oid = meta.indexrelid
    JOIN pg_namespace ns ON ns.oid = idx.relnamespace
    WHERE ns.nspname = 'public' AND idx.relname = ANY($1::text[])
  `, [contract.indexes]);
  const triggerResult = await client.query(`
    SELECT trg.tgname AS name, trg.tgenabled AS enabled,
           relation.relname AS "tableName", proc.proname AS "functionName",
           pg_get_triggerdef(trg.oid, true) AS definition
    FROM pg_trigger trg JOIN pg_proc proc ON proc.oid = trg.tgfoid
    JOIN pg_class relation ON relation.oid = trg.tgrelid
    WHERE NOT trg.tgisinternal AND trg.tgname = $1
  `, [contract.trigger]);
  const constraintResult = await client.query(`
    SELECT con.conname AS name, con.convalidated AS validated,
           pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_constraint con
    WHERE con.conrelid = 'public.internal_users'::regclass AND con.conname = $1
  `, [contract.constraint]);
  return {
    tables: rows(tables).map((row) => row.table_name),
    functions: rows(functions), indexes: rows(indexes), trigger: rows(triggerResult)[0],
    constraint: rows(constraintResult)[0],
  };
}

async function verifyRuntimeAcl(client, actionAuthorityApplied = false) {
  const contract = TENANT_IAM_SCHEMA_CONTRACT;
  const profile = tenantIamRuntimeAclProfile(actionAuthorityApplied);
  const direct = await client.query(`
    SELECT rel.relname AS resource,
      has_any_column_privilege($1, rel.oid, 'SELECT') AS can_select,
      has_any_column_privilege($1, rel.oid, 'INSERT') AS can_insert,
      has_any_column_privilege($1, rel.oid, 'UPDATE') AS can_update,
      has_table_privilege($1, rel.oid, 'DELETE') AS can_delete
    FROM pg_class rel JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND rel.relname = ANY($2::text[])
  `, [RUNTIME_ROLE, contract.tables]);
  for (const row of direct.rows) {
    if (row.can_select || row.can_insert || row.can_update || row.can_delete) {
      throw new Error(`ACL directa insegura para ${RUNTIME_ROLE}: ${row.resource}`);
    }
  }
  const functionAcl = await client.query(`
    SELECT signature, to_regprocedure(signature) IS NOT NULL AS exists,
           has_function_privilege($1, to_regprocedure(signature), 'EXECUTE') AS can_execute
    FROM unnest($2::text[]) requested(signature)
  `, [RUNTIME_ROLE, profile.signatures]);
  for (const row of functionAcl.rows) {
    const expected = profile.allowed.includes(row.signature);
    if (!row.exists || row.can_execute !== expected) {
      throw new Error(`ACL de funcion IAM incorrecta: ${row.signature}`);
    }
  }
  const sequenceAcl = await client.query(`
    SELECT has_sequence_privilege($1, 'public.tenant_iam_event_id_seq', 'USAGE') AS usage,
           has_sequence_privilege($1, 'public.tenant_iam_event_id_seq', 'SELECT') AS can_select,
           has_sequence_privilege($1, 'public.tenant_iam_event_id_seq', 'UPDATE') AS can_update
  `, [RUNTIME_ROLE]);
  if (sequenceAcl.rows[0]?.usage || sequenceAcl.rows[0]?.can_select || sequenceAcl.rows[0]?.can_update) {
    throw new Error(`ACL de secuencia insegura para ${RUNTIME_ROLE}`);
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
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:tenant-iam-schema'))`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum_sha256 char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1', [MIGRATION_VERSION],
    );
    const actionAuthority = await client.query(
      'SELECT 1 FROM schema_migrations WHERE version = $1', [ACTION_AUTHORITY_MIGRATION_VERSION],
    );
    const actionAuthorityApplied = actionAuthority.rowCount > 0;
    if (actionAuthorityApplied && !existing.rowCount) {
      throw new Error(`${MIGRATION_VERSION} no puede aplicarse después de ${ACTION_AUTHORITY_MIGRATION_VERSION}`);
    }
    if (existing.rowCount && existing.rows[0].checksum_sha256.trim() !== checksum) {
      throw new Error(`Drift detectado: ${MIGRATION_VERSION} ya existe con otro SHA-256`);
    }
    if (!existing.rowCount) {
      for (const statement of statements) await client.query(statement);
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [MIGRATION_VERSION, checksum],
      );
    }
    validateTenantIamEvidence(await collectEvidence(client));
    await verifyRuntimeAcl(client, actionAuthorityApplied);
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
