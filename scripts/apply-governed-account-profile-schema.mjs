import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
  existingIdentityMembershipFingerprint,
} from './apply-existing-identity-membership-governance-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION =
  '028-governed-account-profile';
export const ACCOUNT_PROFILE_GOVERNANCE_SIGNATURE =
  'public.account_profile_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)';
export const ACCOUNT_PROFILE_GOVERNANCE_CONTEXT_COLUMNS = Object.freeze([
  'event_id', 'tenant_id', 'membership_id', 'target_user_email',
  'actor_session_id', 'actor_session_version', 'release_sha',
  'expected_identity_version', 'resulting_identity_version',
  'previous_display_name_hash', 'resulting_display_name_hash',
  'reason_hash', 'created_at',
]);

const MIGRATION_URL = new URL(
  './migrations/028-governed-account-profile.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/013-existing-identity-membership-governance.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (got.length !== (actual || []).length
      || JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

export function accountProfileGovernanceFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validateAccountProfileGovernanceMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    'CREATE TABLE IF NOT EXISTS account_profile_governance_event_context',
    'CREATE OR REPLACE FUNCTION account_profile_governance_apply_v1(',
    "p_command IS DISTINCT FROM 'update_account_profile'",
    "ARRAY['tenantId','targetEmail','displayName','reason']",
    "'platform.users.manage'",
    "tenant.status = 'active'",
    'policy.tenant_data_plane_ready IS TRUE',
    'policy.certified_release_sha = p_release_sha',
    "binding.source_system = 'GRH'",
    'binding.verified IS TRUE',
    "'command', p_command",
    'replay.command_hash IS DISTINCT FROM command_hash_value',
    "membership.status = 'active'",
    'target_user.identity_version IS DISTINCT FROM p_expected_version',
    'display_name = normalized_display_name',
    'identity_version = identity_version + 1',
    "WHERE lower(user_email) = target_email AND status = 'active'",
    'GET DIAGNOSTICS revoked_sessions = ROW_COUNT',
    'previous_display_name_hash',
    'resulting_display_name_hash',
    'reason_hash',
    "'institutional_account_profile'",
    'account_profile_governance_event_context_append_only',
    'tenant_iam_reject_change()',
    'account_profile_acl_hardening',
    'GRANT EXECUTE ON FUNCTION account_profile_governance_apply_v1',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 028 no contiene ${token}`);
  }
  if ((source.match(/ARRAY\['tenantId','targetEmail','displayName','reason'\]/g) || []).length !== 2) {
    throw new Error('migracion 028 altera la allowlist tenantId/targetEmail/displayName/reason');
  }
  if ((source.match(/UPDATE\s+internal_users\s+SET/gi) || []).length !== 1
      || (source.match(/UPDATE\s+tenant_identity_session\s+SET/gi) || []).length !== 1) {
    throw new Error('migracion 028 amplia las mutaciones de identidad permitidas');
  }
  if (source.indexOf('UPDATE tenant_identity_session SET')
      > source.indexOf('UPDATE internal_users SET')) {
    throw new Error('migracion 028 debe atribuir y contar la revocacion antes del trigger de identidad');
  }
  if (/\b(?:grh_employees|person_identity|employment_contract|tenant_action_employment_link)\b/i
    .test(source)) {
    throw new Error('migracion 028 no puede mutar ni consultar registros laborales');
  }
  if (/\b(?:password_hash|password_credential|mfa_secret|recovery_code)\b/i.test(source)
      || /\b(?:hugo|marcelo|admin)@/i.test(source)
      || /jsonb_build_object\(\s*'displayName'/i.test(source)) {
    throw new Error('migracion 028 expone identidad o credenciales fuera del contrato');
  }
  return true;
}

export function validateAccountProfileGovernanceEvidence(evidence) {
  exactSet((evidence?.contextColumns || []).map((item) => item.name),
    ACCOUNT_PROFILE_GOVERNANCE_CONTEXT_COLUMNS, 'columnas contexto 028');
  const trigger = evidence?.trigger || {};
  if (trigger.name !== 'account_profile_governance_event_context_append_only'
      || trigger.functionName !== 'tenant_iam_reject_change'
      || trigger.enabled !== 'O' || trigger.rowLevel !== true
      || trigger.timing !== 'before'
      || JSON.stringify([...(trigger.events || [])].sort()) !== JSON.stringify(['delete', 'update'])) {
    throw new Error('trigger inmutable 028 fuera de contrato');
  }
  const fn = evidence?.function || {};
  if (fn.signature !== ACCOUNT_PROFILE_GOVERNANCE_SIGNATURE
      || fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
      || fn.ownerIsRuntime !== false || fn.publicExecuteRevoked !== true
      || fn.runtimeCanExecute !== true
      || JSON.stringify(fn.config || []) !== JSON.stringify(['search_path=public, pg_temp'])) {
    throw new Error('fachada gobernada 028 fuera de contrato');
  }
  const table = evidence?.contextTable || {};
  if (table.ownedByCurrentUser !== true || table.ownerIsRuntime !== false
      || table.publicPrivilegesRevoked !== true || table.runtimePrivilegesRevoked !== true) {
    throw new Error('ACL contexto 028 fuera de contrato');
  }
  if (Number(evidence?.orphanEvents || 0) !== 0
      || Number(evidence?.orphanContexts || 0) !== 0
      || Number(evidence?.invalidVersionContexts || 0) !== 0) {
    throw new Error('auditoria 028 incompleta o inconsistente');
  }
  return true;
}

export function resolveAccountProfileGovernanceTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'ACCOUNT_PROFILE_GOVERNANCE',
    targetLabel: '028',
  });
}

export async function verifyAccountProfileGovernanceConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '028');
}

async function collectEvidence(client) {
  const contextColumns = await client.query(`
    SELECT column_name AS name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'account_profile_governance_event_context'
    ORDER BY ordinal_position
  `);
  const trigger = await client.query(`
    SELECT trigger_row.tgname AS name,
      function_row.proname AS "functionName",
      trigger_row.tgenabled AS enabled,
      trigger_row.tgtype & 1 = 1 AS "rowLevel",
      CASE WHEN trigger_row.tgtype & 2 = 2 THEN 'before' ELSE 'other' END AS timing,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN trigger_row.tgtype & 8 = 8 THEN 'delete' END,
        CASE WHEN trigger_row.tgtype & 16 = 16 THEN 'update' END
      ], NULL) AS events
    FROM pg_trigger trigger_row
    JOIN pg_proc function_row ON function_row.oid = trigger_row.tgfoid
    WHERE trigger_row.tgrelid =
      'public.account_profile_governance_event_context'::regclass
      AND trigger_row.tgname = 'account_profile_governance_event_context_append_only'
      AND trigger_row.tgisinternal IS FALSE
  `);
  const fn = await client.query(`
    SELECT format('%I.%I(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_row.rolname = $1 AS "ownerIsRuntime",
      COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeCanExecute"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_row ON owner_row.oid = function_row.proowner
    WHERE function_row.oid = $2::regprocedure
  `, [RUNTIME_ROLE, ACCOUNT_PROFILE_GOVERNANCE_SIGNATURE]);
  const contextTable = await client.query(`
    SELECT relation.relowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_row.rolname = $1 AS "ownerIsRuntime",
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          relation.relacl, acldefault('r', relation.relowner)
        )) acl
        WHERE acl.grantee = 0
      ) AS "publicPrivilegesRevoked",
      NOT has_table_privilege($1, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        AS "runtimePrivilegesRevoked"
    FROM pg_class relation
    JOIN pg_roles owner_row ON owner_row.oid = relation.relowner
    WHERE relation.oid = 'public.account_profile_governance_event_context'::regclass
  `, [RUNTIME_ROLE]);
  const invariants = await client.query(`
    SELECT
      (SELECT count(*) FROM tenant_iam_event event
       LEFT JOIN account_profile_governance_event_context context ON context.event_id = event.id
       WHERE event.command = 'update_account_profile' AND context.event_id IS NULL)::integer
        AS "orphanEvents",
      (SELECT count(*) FROM account_profile_governance_event_context context
       LEFT JOIN tenant_iam_event event ON event.id = context.event_id
       WHERE event.id IS NULL OR event.command <> 'update_account_profile')::integer
        AS "orphanContexts",
      (SELECT count(*) FROM account_profile_governance_event_context context
       WHERE context.resulting_identity_version <> context.expected_identity_version + 1)::integer
        AS "invalidVersionContexts"
  `);
  return {
    contextColumns: rows(contextColumns),
    trigger: rows(trigger)[0],
    function: rows(fn)[0],
    contextTable: rows(contextTable)[0],
    ...(rows(invariants)[0] || {}),
  };
}

export async function verifyAccountProfileGovernanceFinalState(client) {
  return validateAccountProfileGovernanceEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const source = await readFile(PREREQUISITE_URL, 'utf8');
  const expected = existingIdentityMembershipFingerprint(source);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION}`);
  }
}

async function verifyNoUnledgeredObjects(client) {
  const reserved = await client.query(`
    SELECT
      to_regclass('public.account_profile_governance_event_context') IS NOT NULL
        AS "contextTableExists",
      to_regprocedure($1) IS NOT NULL AS "applyFunctionExists"
  `, [ACCOUNT_PROFILE_GOVERNANCE_SIGNATURE]);
  const present = Object.entries(rows(reserved)[0] || {})
    .filter(([, exists]) => exists === true)
    .map(([name]) => name);
  if (present.length) throw new Error(`objetos 028 sin ledger: ${present.join(',')}`);
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateAccountProfileGovernanceMigrationSql(migration);
  const checksum = accountProfileGovernanceFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolveAccountProfileGovernanceTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyAccountProfileGovernanceConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:account-profile-028'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredObjects(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION, checksum],
      );
    }
    await verifyAccountProfileGovernanceFinalState(client);
    await client.query('COMMIT');
    console.log(`${ACCOUNT_PROFILE_GOVERNANCE_MIGRATION_VERSION}: ${existing.rowCount
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
