import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const TENANT_ACTION_UNLINKED_OPERATOR_MIGRATION_VERSION =
  '017-tenant-action-unlinked-operator';
export const TENANT_ACTION_APPLY_SIGNATURE =
  'public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)';

const PREREQUISITE_MIGRATION_VERSION = '006-tenant-action-authority';
const MIGRATION_URL = new URL(
  './migrations/017-tenant-action-unlinked-operator.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/006-tenant-action-authority.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const EXPECTED_RETURN_TYPE =
  'TABLE(case_id uuid, case_number bigint, current_status character varying, current_version integer, replayed boolean)';

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function occurrenceCount(value, token) {
  return String(value || '').split(token).length - 1;
}

function functionBodyFromMigration(sql, functionName) {
  const source = String(sql || '');
  const markers = [
    `CREATE OR REPLACE FUNCTION public.${functionName}(`,
    `CREATE OR REPLACE FUNCTION ${functionName}(`,
  ];
  const start = markers.map((marker) => source.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  if (!Number.isInteger(start)) throw new Error(`fuente SQL ausente para ${functionName}`);
  const bodyMarker = source.indexOf('AS $$', start);
  const bodyStart = bodyMarker < 0 ? -1 : bodyMarker + 'AS $$'.length;
  const bodyEnd = bodyStart < 0 ? -1 : source.indexOf('$$;', bodyStart);
  if (bodyStart < 0 || bodyEnd < bodyStart) {
    throw new Error(`cuerpo SQL incompleto para ${functionName}`);
  }
  return source.slice(bodyStart, bodyEnd);
}

export function tenantActionUnlinkedOperatorFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function tenantActionFunctionSourceFingerprint(value) {
  const canonical = String(value || '').replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(canonical).digest('hex');
}

export function validateTenantActionUnlinkedOperatorDefinition(definition) {
  const body = normalized(definition);
  for (const token of [
    'action_center_apply_tenant_command(',
    'language plpgsql',
    'security definer',
    "p_command not in ('create', 'update_draft', 'submit', 'approve', 'reject', 'cancel')",
    'from tenant_identity_session session',
    "session.source = 'membership'",
    "session.auth_level in ('mfa', 'recovery')",
    'select * into membership from tenant_membership',
    "membership_row.status = 'active'",
    'policy.certified_release_sha = lower(p_release_sha)',
    'from tenant_action_authority authority',
    'from tenant_action_employment_link link',
    'perform tenant_iam_assert_no_sod_conflict(membership.id)',
    'select * into existing_event from action_case_event',
    'existing_event.actor_membership_id <> membership.id',
    'existing_event.actor_person_id is distinct from actor_person_snapshot_id',
    "existing_event.metadata->>'actorsessionid' <> p_actor_session_id::text",
    "existing_event.metadata->>'actorsessionversion' <> p_actor_session_version::text",
    "existing_event.metadata->>'releasesha' <> lower(p_release_sha)",
    'action_center_tenant_actor_authorized(',
    "if p_command = 'create' then",
    "if p_command = 'update_draft' then",
    "elsif p_command = 'submit' then",
    "elsif p_command in ('approve', 'reject') then",
    "elsif p_command = 'cancel' then",
    "if current_case.status = 'approved' and ( actor_person_snapshot_id is null",
    'action_center_set_tenant_command_context(',
  ]) {
    if (!body.includes(normalized(token))) {
      throw new Error(`funcion 017 incompleta: ${token}`);
    }
  }
  if (!body.includes('set search_path = public, pg_temp')
      && !body.includes('set search_path to public, pg_temp')
      && !body.includes("set search_path to 'public', 'pg_temp'")
      && !body.includes("set search_path to 'public, pg_temp'")) {
    throw new Error('funcion 017 incompleta: search_path public, pg_temp');
  }

  const linkSnapshotEnd = body.indexOf('for share of link, actor_contract;');
  const capabilityConflictGate = body.indexOf(
    'perform tenant_iam_assert_no_sod_conflict(membership.id)',
  );
  if (!(linkSnapshotEnd >= 0 && capabilityConflictGate > linkSnapshotEnd)) {
    throw new Error('funcion 017 altera el orden vinculo opcional -> SoD de capabilities');
  }
  if (body.slice(linkSnapshotEnd, capabilityConflictGate)
    .includes('if actor_person_snapshot_id is null')) {
    throw new Error('funcion 017 reintroduce el vinculo obligatorio global');
  }

  const decisionLinkGates = occurrenceCount(body, 'actor_person_snapshot_id is null');
  const membershipSodGates = occurrenceCount(
    body, 'preparation_event.actor_membership_id = membership.id',
  );
  const knownPersonSodGates = occurrenceCount(
    body,
    'preparation_event.actor_person_id is not null '
      + 'and preparation_event.actor_person_id = actor_person_snapshot_id',
  );
  if (decisionLinkGates !== 3 || membershipSodGates !== 3 || knownPersonSodGates !== 3) {
    throw new Error(
      'funcion 017 no conserva exactamente replay, decision y cancel-approved con vinculo/SoD',
    );
  }
  if (body.includes(
    'preparation_event.actor_person_id is null '
      + 'or preparation_event.actor_person_id = actor_person_snapshot_id',
  )) {
    throw new Error('funcion 017 bloquea aprobadores por preparaciones sin persona');
  }

  const approveBranch = body.indexOf("elsif p_command in ('approve', 'reject') then");
  const cancelBranch = body.indexOf("elsif p_command = 'cancel' then", approveBranch);
  const decisionBody = body.slice(approveBranch, cancelBranch);
  const pendingCancelBody = body.slice(cancelBranch);
  if (!decisionBody.includes('if actor_person_snapshot_id is null')
      || !pendingCancelBody.includes(
        "if current_case.status = 'approved' and ( actor_person_snapshot_id is null",
      )) {
    throw new Error('funcion 017 permite decisiones sin actor laboral vinculado');
  }
  for (const token of [
    'lower(actor.email) in (lower(current_case.created_by_user_email), '
      + 'lower(current_case.submitted_by_user_email))',
    'beneficiary_contract.person_id = actor_person_snapshot_id',
  ]) {
    if (occurrenceCount(body, token) !== 3) {
      throw new Error(`funcion 017 debilita maker-checker: ${token}`);
    }
  }
  return true;
}

export function validateTenantActionUnlinkedOperatorMigrationSql(sql) {
  const source = String(sql || '');
  if ((source.match(/CREATE OR REPLACE FUNCTION/gi) || []).length !== 1) {
    throw new Error('migracion 017 debe reemplazar una sola funcion');
  }
  validateTenantActionUnlinkedOperatorDefinition(source);
  for (const token of [
    'LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp',
    'COMMENT ON FUNCTION public.action_center_apply_tenant_command',
    'COMMENT ON COLUMN public.action_case_event.actor_person_id',
    'REVOKE ALL ON FUNCTION public.action_center_apply_tenant_command',
    'FROM PUBLIC CASCADE',
    'aclexplode(COALESCE(',
    'acl.grantee <> function_row.proowner',
    'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
    'GRANT EXECUTE ON FUNCTION public.action_center_apply_tenant_command',
    'TO municontrol_actions_runtime_app',
  ]) {
    if (!normalized(source).includes(normalized(token))) {
      throw new Error(`migracion 017 incompleta: ${token}`);
    }
  }
  if (/\b(?:create|alter|drop)\s+(?:table|role|schema|database)\b/i.test(source)
      || /\bgrant\s+(?!execute\b)/i.test(source)
      || /guillen|gmail\.com|marcelo@|\b(?:password|raw_code|plain_code|otp_code)\b/i
        .test(source)) {
    throw new Error('migracion 017 amplia alcance, ACL o material sensible');
  }
  return true;
}

function validateFunctionEnvelope(entry) {
  if (!entry || entry.signature !== TENANT_ACTION_APPLY_SIGNATURE
      || entry.securityDefiner !== true || entry.ownerMatches !== true
      || entry.exactSearchPath !== true || entry.language !== 'plpgsql'
      || entry.kind !== 'f' || entry.volatility !== 'v'
      || entry.strict !== false || entry.parallel !== 'u'
      || normalized(entry.returnType) !== normalized(EXPECTED_RETURN_TYPE)
      || !entry.owner || entry.owner === RUNTIME_ROLE) {
    throw new Error('funcion 017 instalada fuera de contrato');
  }
  exactSet(entry.grants, [
    `${entry.owner}:EXECUTE`, `${RUNTIME_ROLE}:EXECUTE`,
  ], 'ACL funcion 017');
  return true;
}

export function validateTenantActionUnlinkedOperatorEvidence(evidence) {
  const entry = evidence?.apply;
  validateFunctionEnvelope(entry);
  validateTenantActionUnlinkedOperatorDefinition(entry.definition);
  return true;
}

async function collectEvidence(client) {
  const result = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      pg_get_functiondef(function_row.oid) AS definition,
      function_row.prosrc AS source,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownerMatches",
      function_row.proconfig = ARRAY['search_path=public, pg_temp']::text[]
        AS "exactSearchPath",
      language.lanname AS language,
      function_row.prokind::text AS kind,
      function_row.provolatile AS volatility,
      function_row.proisstrict AS strict,
      function_row.proparallel AS parallel,
      pg_get_function_result(function_row.oid) AS "returnType",
      owner.rolname AS owner,
      COALESCE((SELECT array_agg(COALESCE(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type)
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee), ARRAY[]::text[]) AS grants
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_language language ON language.oid = function_row.prolang
    JOIN pg_roles owner ON owner.oid = function_row.proowner
    WHERE function_row.oid = to_regprocedure($1)
  `, [TENANT_ACTION_APPLY_SIGNATURE]);
  return { apply: result.rows?.[0] || null };
}

export async function verifyTenantActionUnlinkedOperatorFinalState(client) {
  validateTenantActionUnlinkedOperatorEvidence(await collectEvidence(client));
  return true;
}

async function verifyPrerequisiteLedger(client) {
  const prerequisite = await readFile(PREREQUISITE_URL, 'utf8');
  const expected = tenantActionUnlinkedOperatorFingerprint(prerequisite);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PREREQUISITE_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${PREREQUISITE_MIGRATION_VERSION}`);
  }
}

async function verifyBaselineFunction(client) {
  const baselineMigration = await readFile(PREREQUISITE_URL, 'utf8');
  const expectedSource = functionBodyFromMigration(
    baselineMigration, 'action_center_apply_tenant_command',
  );
  const evidence = await collectEvidence(client);
  validateFunctionEnvelope(evidence.apply);
  if (tenantActionFunctionSourceFingerprint(evidence.apply.source)
      !== tenantActionFunctionSourceFingerprint(expectedSource)) {
    throw new Error('drift previo no ledgerado en action_center_apply_tenant_command');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateTenantActionUnlinkedOperatorMigrationSql(migration);
  const fingerprint = tenantActionUnlinkedOperatorFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const args = process.argv.slice(2);
  const target = resolveCanonicalDatabaseTarget(args, process.env);
  const databaseUrl = directCanonicalDatabaseUrl(args, process.env);
  if (databaseUrl !== target.databaseUrl) {
    throw new Error('el target canonico cambio durante el preflight');
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:tenant-action-unlinked-operator-017'))",
    );
    await verifyPrerequisiteLedger(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [TENANT_ACTION_UNLINKED_OPERATOR_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${TENANT_ACTION_UNLINKED_OPERATOR_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyBaselineFunction(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${TENANT_ACTION_UNLINKED_OPERATOR_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: `
              + `${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [TENANT_ACTION_UNLINKED_OPERATOR_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyTenantActionUnlinkedOperatorFinalState(client);
    await client.query('COMMIT');
    const targetLabel = target.mode === 'production'
      ? `production:${target.branchId}` : 'isolated';
    console.log(existing.rowCount
      ? `${TENANT_ACTION_UNLINKED_OPERATOR_MIGRATION_VERSION}: reapply verificado `
        + `(${targetLabel}, SHA-256 ${fingerprint})`
      : `${TENANT_ACTION_UNLINKED_OPERATOR_MIGRATION_VERSION}: fresh apply `
        + `(${targetLabel}, ${statements.length} sentencias, SHA-256 ${fingerprint})`);
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
