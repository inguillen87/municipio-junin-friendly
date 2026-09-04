import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const OWNER_TENANT_AUTHORITY_MIGRATION_VERSION =
  '036-owner-tenant-operational-authority';
export const OWNER_TENANT_AUTHORITY_ROLE = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL';
export const OWNER_TENANT_AUTHORITY_CAPABILITIES = Object.freeze([
  'leave.request.area.cancel_approved',
  'leave.request.area.decide',
  'leave.request.restricted.decide',
  'payroll.art_report.generate',
  'payroll.control_import.validate',
  'payroll.novelty.approve',
  'payroll.reprocessing.approve',
  'time.overtime.approve',
]);
export const OWNER_TENANT_AUTHORITY_SCOPE_CAPABILITIES = Object.freeze([
  'leave.request.area.cancel_approved',
  'leave.request.area.cancel_pending',
  'leave.request.area.create',
  'leave.request.area.decide',
  'leave.request.area.read',
  'leave.request.area.submit',
  'leave.request.area.update',
]);
export const OWNER_TENANT_AUTHORITY_SOD_EXCEPTIONS = Object.freeze([
  'payroll.control_import.prepare|payroll.control_import.validate',
  'payroll.novelty.approve|payroll.novelty.prepare',
  'payroll.reprocessing.approve|payroll.reprocessing.prepare',
]);
export const OWNER_TENANT_AUTHORITY_FUNCTIONS = Object.freeze({
  sod: 'public.tenant_iam_assert_no_sod_conflict(uuid)',
  importContext: 'public.payroll_control_import_assert_context_v1(jsonb,text)',
  importBootstrap: 'public.payroll_control_import_bootstrap_v1(jsonb)',
});

const MIGRATION_URL = new URL(
  './migrations/036-owner-tenant-operational-authority.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const PREREQUISITES = Object.freeze([
  '008-governed-overtime-actions',
  '018-action-center-operational-completion',
  '021-platform-owner-operational-integral',
  '025-governed-payroll-control-import',
  '026-governed-payroll-novelties',
  '027-institutional-payroll-novelty-profiles',
  '033-payroll-art-report-capability',
  '034-payroll-control-import-binding-lock',
  '035-governed-payroll-reprocessing',
].map((version) => Object.freeze({
  version,
  url: new URL(`./migrations/${version}.sql`, import.meta.url),
})));

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (got.length !== (actual || []).length
      || JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function requireTokens(label, value, tokens) {
  const source = normalized(value);
  for (const token of tokens) {
    if (!source.includes(normalized(token))) {
      throw new Error(`${label} no contiene ${token}`);
    }
  }
}

function compactFunctionSource(value) {
  return String(value || '').replace(/\s+/g, '').replaceAll('::text', '');
}

function assertSeparatedReportChannels(importContextSource, importBootstrapSource) {
  const context = compactFunctionSource(importContextSource);
  const bootstrap = compactFunctionSource(importBootstrapSource);
  if (!context.includes(
    "INTOcapabilitiesFROMpublic.tenant_iam_effective_capabilities(membership_row.id)effectiveWHEREeffective.capability_keyLIKE'payroll.control_import.%';",
  ) || !context.includes(
    "INTOreport_capabilitiesFROMpublic.tenant_iam_effective_capabilities(membership_row.id)effectiveWHEREeffective.capability_key='payroll.art_report.generate';",
  ) || !context.includes(
    "'capabilities',capabilities,'reportCapabilities',report_capabilities",
  )) {
    throw new Error('contexto importacion 036 no conserva canales separados');
  }
  if (!bootstrap.includes(
    "'capabilities',context_value->'capabilities','reportCapabilities',context_value->'reportCapabilities'",
  )) {
    throw new Error('bootstrap importacion 036 no conserva reportCapabilities separado');
  }
}

function tupleCapabilities(block, role = OWNER_TENANT_AUTHORITY_ROLE) {
  const pattern = new RegExp(`\\(\\s*'${role}'\\s*,\\s*'([^']+)'\\s*\\)`, 'g');
  return [...String(block || '').matchAll(pattern)].map((match) => match[1]);
}

export function ownerTenantAuthorityFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validateOwnerTenantAuthorityMigrationSql(sql) {
  const source = String(sql || '');
  const grantBlock = source.match(
    /INSERT\s+INTO\s+public\.iam_role_capability\s*\([^)]*\)\s*VALUES([\s\S]*?)ON\s+CONFLICT\s*\(role_key,\s*capability_key\)\s*DO\s+NOTHING\s*;/i,
  )?.[1];
  exactSet(tupleCapabilities(grantBlock), OWNER_TENANT_AUTHORITY_CAPABILITIES,
    'capacidades owner 036');

  for (const token of [
    'OWNER_TENANT_AUTHORITY_PREREQUISITE_DRIFT',
    'OWNER_TENANT_AUTHORITY_FORBIDDEN_GRANT',
    'OWNER_TENANT_AUTHORITY_MAKER_CHECKER_GUARD_DRIFT',
    'OWNER_TENANT_AUTHORITY_REPORT_CHANNEL_DRIFT',
    'OWNER_TENANT_AUTHORITY_BOOTSTRAP_REPORT_CHANNEL_DRIFT',
    'CREATE OR REPLACE FUNCTION public.tenant_iam_assert_no_sod_conflict',
    'CREATE OR REPLACE FUNCTION public.payroll_control_import_assert_context_v1',
    'CREATE OR REPLACE FUNCTION public.payroll_control_import_bootstrap_v1',
    "'reportCapabilities', report_capabilities",
    "'reportCapabilities', context_value->'reportCapabilities'",
    "WHERE effective.capability_key = 'payroll.art_report.generate'",
    'payroll_control_import_batch_maker_checker_ck',
    'payroll_novelty_batch_maker_checker_ck',
    'payroll_reprocessing_case_maker_checker_ck',
    'action_center_overtime_decider_separated_v1',
    'action_center_tenant_detail_v2',
    "ON CONFLICT ( membership_id, capability_key, source_binding_id, scope_level, (COALESCE(organization_unit_source_id, '')), (COALESCE(sector_source_id, '')) ) DO UPDATE SET",
    'REVOKE ALL ON FUNCTION public.payroll_control_import_bootstrap_v1(jsonb) FROM PUBLIC',
    'GRANT EXECUTE ON FUNCTION public.payroll_control_import_bootstrap_v1(jsonb)',
  ]) requireTokens('migracion 036', source, [token]);

  exactSet(
    [...source.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi)]
      .map((match) => match[1]),
    Object.values(OWNER_TENANT_AUTHORITY_FUNCTIONS)
      .map((signature) => signature.slice('public.'.length).split('(')[0]),
    'funciones reemplazadas 036',
  );
  exactSet(
    [...source.matchAll(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi)]
      .map((match) => match[1]),
    ['payroll_control_import_bootstrap_v1'],
    'fachadas runtime 036',
  );
  if ((source.match(/SECURITY DEFINER SET search_path = public, pg_temp/g) || []).length !== 3) {
    throw new Error('migracion 036 no fija search_path en sus tres funciones');
  }
  if (/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|SCHEMA|DATABASE|TABLE)\b/i.test(source)
      || /\b(?:password_hash|mfa_secret|otp_code|recovery_code)\b/i.test(source)
      || /(?:guillen|gmail\.com|marcelo@|hugo@|admin@)/i.test(source)) {
    throw new Error('migracion 036 amplia infraestructura, identidades o secretos');
  }
  if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?(?:employment_contract|payroll_run|payroll_monthly_fact|payroll_snapshot_assignment|source_import_batch)\b/i
    .test(source)) {
    throw new Error('migracion 036 intenta mutar fuentes o salidas salariales');
  }
  if (/\(\s*'PLATFORM_OWNER_OPERATIVO_INTEGRAL'\s*,\s*'platform\./i.test(source)) {
    throw new Error('migracion 036 mezcla autoridad global dentro del rol tenant');
  }
  if (splitPostgresStatements(source).length !== 16) {
    throw new Error('migracion 036 incompleta o no segmentable');
  }
  return true;
}

export function validateOwnerTenantAuthorityEvidence(evidence) {
  const role = evidence?.role;
  if (!role || role.roleKey !== OWNER_TENANT_AUTHORITY_ROLE
      || role.scopeKind !== 'tenant' || role.systemManaged !== true
      || !String(role.label || '').trim() || !String(role.description || '').trim()) {
    throw new Error('rol owner 036 fuera de contrato');
  }
  exactSet(evidence?.requiredCapabilities, OWNER_TENANT_AUTHORITY_CAPABILITIES,
    'capacidades efectivas owner 036');
  if ((evidence?.forbiddenCapabilities || []).length !== 0) {
    throw new Error('owner 036 conserva capacidades prohibidas');
  }
  if (Number(evidence?.overrideCount) !== 0) {
    throw new Error('owner 036 depende de overrides individuales');
  }
  exactSet(evidence?.conflicts, OWNER_TENANT_AUTHORITY_SOD_EXCEPTIONS,
    'excepciones SoD owner 036');
  if (Number(evidence?.eligibleScopeCount) !== Number(evidence?.actualScopeCount)) {
    throw new Error('alcance de compania owner 036 incompleto');
  }
  if (evidence?.makerCheckerReady !== true || evidence?.sodEvaluationPassed !== true) {
    throw new Error('maker-checker owner 036 no esta verificado');
  }

  const functions = Object.fromEntries(
    (evidence?.functions || []).map((item) => [item.signature, item]),
  );
  exactSet(Object.keys(functions), Object.values(OWNER_TENANT_AUTHORITY_FUNCTIONS),
    'funciones owner 036');
  for (const [key, signature] of Object.entries(OWNER_TENANT_AUTHORITY_FUNCTIONS)) {
    const fn = functions[signature] || {};
    const runtimeExpected = key === 'importBootstrap';
    if (fn.securityDefiner !== true || fn.ownedByCurrentUser !== true
        || fn.ownerIsRuntime !== false || fn.publicExecuteRevoked !== true
        || fn.runtimeCanExecute !== runtimeExpected || fn.runtimeExecuteGrantable !== false
        || JSON.stringify(fn.config || []) !== JSON.stringify(['search_path=public, pg_temp'])
        || fn.volatility !== (key === 'sod' ? 's' : 'v')
        || JSON.stringify(fn.nonOwnerExecuteGrantees || [])
          !== JSON.stringify(runtimeExpected ? [RUNTIME_ROLE] : [])) {
      throw new Error(`funcion owner 036 insegura: ${signature}`);
    }
  }
  requireTokens('SoD 036', functions[OWNER_TENANT_AUTHORITY_FUNCTIONS.sod].sourceBody, [
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
    'payroll.control_import.prepare', 'payroll.control_import.validate',
    'payroll.novelty.approve', 'payroll.novelty.prepare',
    'payroll.reprocessing.approve', 'payroll.reprocessing.prepare',
    'TENANT_IAM_SOD_CONFLICT',
  ]);
  requireTokens('contexto importacion 036',
    functions[OWNER_TENANT_AUTHORITY_FUNCTIONS.importContext].sourceBody, [
      'payroll.control_import.read', 'payroll.art_report.generate',
      'reportCapabilities', 'tenant_iam_assert_no_sod_conflict',
      'PAYROLL_CONTROL_IMPORT_CAPABILITY_REQUIRED',
    ]);
  requireTokens('bootstrap importacion 036',
    functions[OWNER_TENANT_AUTHORITY_FUNCTIONS.importBootstrap].sourceBody, [
      'payroll_control_import_assert_context_v1', 'reportCapabilities',
      'allowedCommands', 'prepared_by_membership_id', 'prepared_by_person_id',
    ]);
  assertSeparatedReportChannels(
    functions[OWNER_TENANT_AUTHORITY_FUNCTIONS.importContext].sourceBody,
    functions[OWNER_TENANT_AUTHORITY_FUNCTIONS.importBootstrap].sourceBody,
  );
  return true;
}

export function resolveOwnerTenantAuthorityTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'OWNER_TENANT_AUTHORITY',
    targetLabel: '036',
  });
}

export async function verifyOwnerTenantAuthorityConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '036');
}

async function collectEvidence(client) {
  const roleResult = await client.query(`
    SELECT role_key AS "roleKey", label, description,
      scope_kind AS "scopeKind", system_managed AS "systemManaged"
    FROM public.iam_role WHERE role_key = $1
  `, [OWNER_TENANT_AUTHORITY_ROLE]);
  const requiredResult = await client.query(`
    SELECT capability_key AS capability
    FROM public.iam_role_capability
    WHERE role_key = $1 AND capability_key = ANY($2::varchar[])
    ORDER BY capability_key
  `, [OWNER_TENANT_AUTHORITY_ROLE, OWNER_TENANT_AUTHORITY_CAPABILITIES]);
  const forbiddenResult = await client.query(`
    SELECT capability_key AS capability
    FROM public.iam_role_capability
    WHERE role_key = $1 AND (
      capability_key LIKE 'platform.%' OR capability_key = ANY($2::varchar[])
    ) ORDER BY capability_key
  `, [OWNER_TENANT_AUTHORITY_ROLE, [
    'time.overtime.post', 'payroll.novelty.post', 'payroll.reprocessing.execute',
  ]]);
  const overrideResult = await client.query(`
    SELECT count(*)::integer AS count
    FROM public.tenant_membership_capability_override override_row
    JOIN public.tenant_membership membership ON membership.id = override_row.membership_id
    WHERE membership.role_key = $1
      AND override_row.capability_key = ANY($2::varchar[])
  `, [OWNER_TENANT_AUTHORITY_ROLE, OWNER_TENANT_AUTHORITY_CAPABILITIES]);
  const conflictResult = await client.query(`
    SELECT conflict.capability_key AS capability,
      conflict.conflicts_with_key AS "conflictsWith"
    FROM public.iam_capability_conflict conflict
    JOIN public.iam_role_capability left_grant
      ON left_grant.role_key = $1 AND left_grant.capability_key = conflict.capability_key
    JOIN public.iam_role_capability right_grant
      ON right_grant.role_key = left_grant.role_key
     AND right_grant.capability_key = conflict.conflicts_with_key
    ORDER BY conflict.capability_key, conflict.conflicts_with_key
  `, [OWNER_TENANT_AUTHORITY_ROLE]);
  const scopeResult = await client.query(`
    WITH eligible AS (
      SELECT membership.id, membership.tenant_id,
        binding.id AS source_binding_id, binding.source_company_id AS company_id
      FROM public.tenant_membership membership
      JOIN public.internal_users users
        ON lower(users.email) = lower(membership.user_email) AND users.active IS TRUE
      JOIN public.platform_tenant tenant
        ON tenant.id = membership.tenant_id AND tenant.status = 'active'
      JOIN public.tenant_identity_policy policy
        ON policy.tenant_id = membership.tenant_id
       AND policy.tenant_data_plane_ready IS TRUE
      JOIN public.platform_tenant_source_binding binding
        ON binding.id = policy.certified_source_binding_id
       AND binding.tenant_id = membership.tenant_id
       AND binding.source_system = 'GRH' AND binding.verified IS TRUE
      JOIN public.tenant_action_authority authority
        ON authority.membership_id = membership.id
       AND authority.tenant_id = membership.tenant_id
      WHERE membership.role_key = $1 AND membership.status = 'active'
    )
    SELECT (SELECT count(*)::integer * $3 FROM eligible) AS "eligibleScopeCount",
      count(scope.id)::integer AS "actualScopeCount"
    FROM eligible
    LEFT JOIN public.tenant_action_area_scope scope
      ON scope.membership_id = eligible.id
     AND scope.tenant_id = eligible.tenant_id
     AND scope.source_binding_id = eligible.source_binding_id
     AND scope.company_id = eligible.company_id
     AND scope.scope_level = 'company'
     AND scope.organization_unit_source_id IS NULL
     AND scope.sector_source_id IS NULL
     AND scope.active IS TRUE
     AND scope.capability_key = ANY($2::varchar[])
  `, [
    OWNER_TENANT_AUTHORITY_ROLE,
    OWNER_TENANT_AUTHORITY_SCOPE_CAPABILITIES,
    OWNER_TENANT_AUTHORITY_SCOPE_CAPABILITIES.length,
  ]);
  const functionResult = await client.query(`
    SELECT format('%I.%I(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_role.rolname = $1 AS "ownerIsRuntime",
      function_row.provolatile AS volatility,
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
        SELECT grantee.rolname
        FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE acl.privilege_type = 'EXECUTE'
          AND grantee.oid <> function_row.proowner
        ORDER BY grantee.rolname
      )) AS "nonOwnerExecuteGrantees"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_role ON owner_role.oid = function_row.proowner
    WHERE format('%I.%I(%s)', namespace.nspname, function_row.proname,
      replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[])
    ORDER BY signature
  `, [RUNTIME_ROLE, Object.values(OWNER_TENANT_AUTHORITY_FUNCTIONS)]);
  const makerCheckerResult = await client.query(`
    SELECT (
      (SELECT count(*) FROM pg_constraint constraint_row
        WHERE constraint_row.conname = ANY($1::text[])
          AND constraint_row.convalidated IS TRUE) = 3
      AND to_regprocedure($2) IS NOT NULL
      AND to_regprocedure($3) IS NOT NULL
    ) AS ready
  `, [[
    'payroll_control_import_batch_maker_checker_ck',
    'payroll_novelty_batch_maker_checker_ck',
    'payroll_reprocessing_case_maker_checker_ck',
  ],
  'public.action_center_overtime_decider_separated_v1(uuid,uuid,uuid,text,uuid)',
  'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)']);
  await client.query(`
    SELECT public.tenant_iam_assert_no_sod_conflict(membership.id)
    FROM public.tenant_membership membership
    WHERE membership.role_key = $1 AND membership.status = 'active'
  `, [OWNER_TENANT_AUTHORITY_ROLE]);
  const scope = rows(scopeResult)[0] || {};
  return {
    role: rows(roleResult)[0],
    requiredCapabilities: rows(requiredResult).map((row) => row.capability),
    forbiddenCapabilities: rows(forbiddenResult).map((row) => row.capability),
    overrideCount: rows(overrideResult)[0]?.count,
    conflicts: rows(conflictResult).map((row) => `${row.capability}|${row.conflictsWith}`),
    eligibleScopeCount: scope.eligibleScopeCount,
    actualScopeCount: scope.actualScopeCount,
    makerCheckerReady: rows(makerCheckerResult)[0]?.ready,
    sodEvaluationPassed: true,
    functions: rows(functionResult),
  };
}

export async function verifyOwnerTenantAuthorityFinalState(client) {
  return validateOwnerTenantAuthorityEvidence(await collectEvidence(client));
}

async function verifyPrerequisites(client) {
  for (const prerequisite of PREREQUISITES) {
    const checksum = ownerTenantAuthorityFingerprint(await readFile(prerequisite.url, 'utf8'));
    const installed = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [prerequisite.version],
    );
    if (installed.rowCount !== 1
        || String(installed.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`prerequisito ausente o con drift ${prerequisite.version}`);
    }
  }
}

async function verifyNoUnledgeredState(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM public.iam_role_capability
      WHERE role_key = $1 AND capability_key = ANY($2::varchar[])
    ) OR position('reportCapabilities' in pg_get_functiondef(
      'public.payroll_control_import_assert_context_v1(jsonb,text)'::regprocedure
    )) > 0 AS present
  `, [OWNER_TENANT_AUTHORITY_ROLE, OWNER_TENANT_AUTHORITY_CAPABILITIES.filter(
    (capability) => capability !== 'payroll.art_report.generate',
  )]);
  if (rows(result)[0]?.present === true) {
    throw new Error('estado 036 presente sin ledger');
  }
}

export async function assertNoAffectedOwnerDenyOverrides(client) {
  const result = await client.query(`
    SELECT count(*)::integer AS count
    FROM public.tenant_membership_capability_override override_row
    JOIN public.tenant_membership membership
      ON membership.id = override_row.membership_id
    WHERE membership.role_key = $1
      AND override_row.deny_override IS TRUE
      AND override_row.capability_key = ANY($2::varchar[])
  `, [OWNER_TENANT_AUTHORITY_ROLE, OWNER_TENANT_AUTHORITY_CAPABILITIES]);
  const affectedCount = Number(rows(result)[0]?.count || 0);
  if (affectedCount > 0) {
    throw new Error(
      `OWNER_TENANT_AUTHORITY_DENY_OVERRIDE_REVIEW_REQUIRED: ${affectedCount}`,
    );
  }
  return true;
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateOwnerTenantAuthorityMigrationSql(migration);
  const checksum = ownerTenantAuthorityFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolveOwnerTenantAuthorityTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyOwnerTenantAuthorityConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:owner-tenant-authority-036'))",
    );
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [OWNER_TENANT_AUTHORITY_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${OWNER_TENANT_AUTHORITY_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      // 036 es una migracion ya publicada y su SQL elimina overrides del
      // conjunto concedido. Un deny explicito es revocatorio y no se puede
      // convertir silenciosamente en permiso: se detiene antes del primer
      // statement para que una migracion posterior lo trate de forma auditable.
      await assertNoAffectedOwnerDenyOverrides(client);
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${OWNER_TENANT_AUTHORITY_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [OWNER_TENANT_AUTHORITY_MIGRATION_VERSION, checksum],
      );
    }
    await verifyOwnerTenantAuthorityFinalState(client);
    await client.query('COMMIT');
    console.log(`${OWNER_TENANT_AUTHORITY_MIGRATION_VERSION}: ${existing.rowCount
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
