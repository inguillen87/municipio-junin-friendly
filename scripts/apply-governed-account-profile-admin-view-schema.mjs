import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION,
  accountProfileGovernanceFingerprint,
} from './apply-governed-account-profile-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const ACCOUNT_PROFILE_ADMIN_VIEW_MIGRATION_VERSION =
  '030-governed-account-profile-admin-view';
export const ACCOUNT_PROFILE_ADMIN_VIEW_SIGNATURE =
  'public.tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)';

const MIGRATION_URL = new URL(
  './migrations/030-governed-account-profile-admin-view.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/028-governed-account-profile.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

export function accountProfileAdminViewFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validateAccountProfileAdminViewMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    'CREATE OR REPLACE FUNCTION tenant_iam_admin_view_v4(',
    'tenant_iam_admin_view_v3(',
    "p_resource NOT IN ('bootstrap', 'users')",
    "policy.tenant_data_plane_ready IS TRUE",
    'policy.certified_release_sha = p_release_sha',
    "binding.source_system = 'GRH'",
    'binding.verified IS TRUE',
    "jsonb_build_object('identityVersion', account.identity_version)",
    "command.value = 'update_account_profile'",
    "jsonb_build_array('update_account_profile')",
    'SECURITY DEFINER SET search_path = public, pg_temp',
    'REVOKE ALL ON FUNCTION tenant_iam_admin_view_v4',
    'GRANT EXECUTE ON FUNCTION tenant_iam_admin_view_v4',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 030 no contiene ${token}`);
  }
  if (/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(source)) {
    throw new Error('migracion 030 no puede mutar datos de identidad, membresia o GRH');
  }
  if (/\b(?:password_hash|password_credential|mfa_secret|recovery_code)\b/i.test(source)) {
    throw new Error('migracion 030 no puede exponer credenciales');
  }
  return true;
}

export function validateAccountProfileAdminViewEvidence(evidence) {
  const fn = evidence?.function || {};
  if (fn.signature !== ACCOUNT_PROFILE_ADMIN_VIEW_SIGNATURE
      || fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
      || fn.ownerIsRuntime !== false || fn.publicExecuteRevoked !== true
      || fn.runtimeCanExecute !== true || fn.runtimeExecuteGrantable !== false
      || JSON.stringify(fn.nonOwnerExecuteGrantees || []) !== JSON.stringify([RUNTIME_ROLE])
      || JSON.stringify(fn.config || []) !== JSON.stringify(['search_path=public, pg_temp'])) {
    throw new Error('fachada de lectura 030 fuera de contrato');
  }
  const source = String(fn.sourceBody || '');
  for (const token of [
    'tenant_iam_admin_view_v3', 'identityVersion', 'identity_version',
    'update_account_profile', 'tenant_data_plane_ready', 'certified_release_sha',
  ]) {
    if (!source.includes(token)) throw new Error(`fachada 030 sin ${token}`);
  }
  if (/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(source)) {
    throw new Error('fachada 030 contiene DML');
  }
  return true;
}

export function resolveAccountProfileAdminViewTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'ACCOUNT_PROFILE_GOVERNANCE',
    targetLabel: '030',
  });
}

export async function verifyAccountProfileAdminViewConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '030');
}

async function collectEvidence(client) {
  const fn = await client.query(`
    SELECT format('%I.%I(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_row.rolname = $1 AS "ownerIsRuntime",
      COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
      function_row.prosrc AS "sourceBody",
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeCanExecute",
      COALESCE((
        SELECT bool_or(acl.is_grantable)
        FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE grantee.rolname = $1 AND acl.privilege_type = 'EXECUTE'
      ), false) AS "runtimeExecuteGrantable",
      to_jsonb(ARRAY(
        SELECT role_row.rolname
        FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        JOIN pg_roles role_row ON role_row.oid = acl.grantee
        WHERE acl.privilege_type = 'EXECUTE'
          AND role_row.rolname <> owner_row.rolname
        ORDER BY role_row.rolname
      )) AS "nonOwnerExecuteGrantees"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_row ON owner_row.oid = function_row.proowner
    WHERE function_row.oid = $2::regprocedure
  `, [RUNTIME_ROLE, ACCOUNT_PROFILE_ADMIN_VIEW_SIGNATURE]);
  return { function: rows(fn)[0] };
}

export async function verifyAccountProfileAdminViewFinalState(client) {
  return validateAccountProfileAdminViewEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const source = await readFile(PREREQUISITE_URL, 'utf8');
  const expected = accountProfileGovernanceFingerprint(source);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION}`);
  }
}

async function verifyNoUnledgeredObjects(client) {
  const reserved = await client.query(
    'SELECT to_regprocedure($1) IS NOT NULL AS "viewExists"',
    [ACCOUNT_PROFILE_ADMIN_VIEW_SIGNATURE],
  );
  if (rows(reserved)[0]?.viewExists === true) {
    throw new Error('objeto 030 sin ledger: tenant_iam_admin_view_v4');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateAccountProfileAdminViewMigrationSql(migration);
  const checksum = accountProfileAdminViewFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolveAccountProfileAdminViewTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyAccountProfileAdminViewConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:account-profile-view-030'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [ACCOUNT_PROFILE_ADMIN_VIEW_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${ACCOUNT_PROFILE_ADMIN_VIEW_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredObjects(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${ACCOUNT_PROFILE_ADMIN_VIEW_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [ACCOUNT_PROFILE_ADMIN_VIEW_MIGRATION_VERSION, checksum],
      );
    }
    await verifyAccountProfileAdminViewFinalState(client);
    await client.query('COMMIT');
    console.log(`${ACCOUNT_PROFILE_ADMIN_VIEW_MIGRATION_VERSION}: ${existing.rowCount
      ? 'ledger y estado final verificados' : 'fresh apply'} `
      + `(${target.mode}, SHA-256 ${checksum})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
