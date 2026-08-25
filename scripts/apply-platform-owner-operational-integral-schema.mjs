import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION,
  emailFirstFactorLoginFingerprint,
  verifyEmailFirstFactorFinalState,
} from './apply-email-first-factor-login-schema.mjs';
import {
  EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST,
} from './apply-email-otp-mfa-schema.mjs';
import {
  CONSULTA_INTEGRAL_ROLE,
  INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION,
  INSTITUTIONAL_READ_CAPABILITIES,
  institutionalAccessProfilesFingerprint,
  verifyInstitutionalAccessProfilesFinalState,
} from './apply-institutional-access-profiles-schema.mjs';
import {
  EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
  TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES,
  existingIdentityMembershipFingerprint,
  verifyExistingIdentityMembershipRoleContract,
} from './apply-existing-identity-membership-governance-schema.mjs';

export const PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION =
  '021-platform-owner-operational-integral';
export const PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE =
  'PLATFORM_OWNER_OPERATIVO_INTEGRAL';

export const PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES = Object.freeze([
  ...new Set([
    ...INSTITUTIONAL_READ_CAPABILITIES,
    ...TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES,
  ]),
]);

export const PLATFORM_OWNER_OPERATIONAL_FORBIDDEN_CAPABILITIES = Object.freeze([
  'absence.validate',
  'employee.record.approve',
  'leave.approve',
  'leave.request.all.manage',
  'leave.request.area.decide',
  'leave.request.area.cancel_approved',
  'leave.request.restricted.decide',
  'time.overtime.approve',
  'time.overtime.post',
  'time.source.approve',
  'time.catalog.approve',
]);

const MIGRATION_URL = new URL(
  './migrations/021-platform-owner-operational-integral.sql', import.meta.url,
);
const PREREQUISITES = Object.freeze([
  Object.freeze({
    version: EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
    url: new URL('./migrations/013-existing-identity-membership-governance.sql', import.meta.url),
    fingerprint: existingIdentityMembershipFingerprint,
  }),
  Object.freeze({
    version: INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION,
    url: new URL('./migrations/019-institutional-access-profiles.sql', import.meta.url),
    fingerprint: institutionalAccessProfilesFingerprint,
  }),
  Object.freeze({
    version: EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION,
    url: new URL('./migrations/020-email-first-factor-login.sql', import.meta.url),
    fingerprint: emailFirstFactorLoginFingerprint,
  }),
]);

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

function requiredQaPin(value, variableName, pattern) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Falta ${variableName}`);
  if (!pattern.test(text)) throw new Error(`${variableName} tiene un formato invalido.`);
  return text;
}

/**
 * Add an explicit, externally corroborated QA identity to the generic canonical
 * target gate. The branch id cannot be derived from a PostgreSQL URL, so the
 * caller must pin it from Neon control-plane evidence before running 021. Host
 * and database are independently compared with the direct connection URL.
 */
export function resolvePlatformOwnerOperationalIntegralTarget(
  argv = process.argv,
  env = process.env,
) {
  const target = resolveCanonicalDatabaseTarget(argv, env);
  if (target.mode === 'production') return target;

  const branchId = requiredQaPin(
    env.CANONICAL_QA_BRANCH_ID,
    'CANONICAL_QA_BRANCH_ID',
    /^br-[a-z0-9-]+$/,
  );
  const expectedHost = requiredQaPin(
    env.CANONICAL_QA_HOST,
    'CANONICAL_QA_HOST',
    /^ep-[a-z0-9-]+\.[a-z0-9.-]+\.neon\.tech$/,
  );
  if (expectedHost.includes('-pooler.')) {
    throw new Error('CANONICAL_QA_HOST debe identificar el endpoint directo, no el pooled.');
  }
  const expectedDatabase = requiredQaPin(
    env.CANONICAL_QA_DATABASE,
    'CANONICAL_QA_DATABASE',
    /^[A-Za-z_][A-Za-z0-9_$-]*$/,
  );

  const parsed = new URL(target.databaseUrl);
  if (parsed.hostname !== expectedHost) {
    throw new Error('El host de DATABASE_URL_UNPOOLED no coincide con CANONICAL_QA_HOST.');
  }
  let actualDatabase;
  try {
    actualDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  } catch {
    throw new Error('La base de DATABASE_URL_UNPOOLED no tiene un formato valido.');
  }
  if (actualDatabase !== expectedDatabase) {
    throw new Error('La base de DATABASE_URL_UNPOOLED no coincide con CANONICAL_QA_DATABASE.');
  }

  const productionBranchId = String(env.CANONICAL_PRODUCTION_BRANCH_ID ?? '').trim();
  if (productionBranchId && branchId === productionBranchId) {
    throw new Error('CANONICAL_QA_BRANCH_ID coincide con CANONICAL_PRODUCTION_BRANCH_ID.');
  }

  return Object.freeze({ ...target, branchId });
}

function roleGrantCapabilities(sql) {
  const tuple = new RegExp(
    `\\(\\s*'${PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE}'\\s*,\\s*'([^']+)'\\s*\\)`,
    'g',
  );
  const blocks = [
    ...String(sql || '').matchAll(
      /INSERT\s+INTO\s+public\.iam_role_capability\s*\([^)]*\)\s*VALUES([\s\S]*?)ON\s+CONFLICT\s*\(role_key,\s*capability_key\)\s*DO\s+NOTHING\s*;/gi,
    ),
  ].map((match) => match[1]);
  return blocks.flatMap((block) => [...block.matchAll(tuple)].map((match) => match[1]));
}

function roleDeleteCapabilities(sql) {
  const block = String(sql || '').match(new RegExp(
    'DELETE\\s+FROM\\s+public\\.iam_role_capability\\s+role_capability\\s+'
      + `WHERE\\s+role_capability\\.role_key\\s*=\\s*'${PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE}'\\s+`
      + 'AND\\s+role_capability\\.capability_key\\s+NOT\\s+IN\\s*'
      + '\\(([\\s\\S]*?)\\)\\s*;',
    'i',
  ))?.[1];
  if (block === undefined) return [];
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function platformOwnerOperationalIntegralFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validatePlatformOwnerOperationalIntegralMigrationSql(sql) {
  const source = String(sql || '');
  const compact = normalized(source);
  const granted = roleGrantCapabilities(source);
  const synchronized = roleDeleteCapabilities(source);

  exactSet(
    granted,
    PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES,
    'grants PLATFORM_OWNER_OPERATIVO_INTEGRAL',
  );
  exactSet(
    synchronized,
    PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES,
    'sincronizacion PLATFORM_OWNER_OPERATIVO_INTEGRAL',
  );
  if (granted.length !== 34 || synchronized.length !== 34
      || PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES.length !== 34) {
    throw new Error('migracion 021 no conserva la cardinalidad exacta de 34 capacidades');
  }
  for (const token of [
    "'PLATFORM_OWNER_OPERATIVO_INTEGRAL'",
    "'CONSULTA_INTEGRAL', 'TENANT_RRHH_ADMIN_OPERATIVO'",
    "'tenant'",
    'system_managed',
    'DELETE FROM public.iam_role_capability',
    'ON CONFLICT (role_key, capability_key) DO NOTHING',
    'role_count <> 34 OR union_count <> 34 OR union_drift_count <> 0',
    'SELECT capability_key FROM source_union EXCEPT SELECT capability_key FROM target',
    'SELECT capability_key FROM target EXCEPT SELECT capability_key FROM source_union',
    'PLATFORM_OWNER_OPERATIONAL_CAPABILITY_CATALOG_DRIFT',
    'PLATFORM_OWNER_OPERATIONAL_FORBIDDEN_CAPABILITY',
    'PLATFORM_OWNER_OPERATIONAL_SOD_CONFLICT',
    'FROM public.iam_capability_conflict conflict',
  ]) {
    if (!compact.includes(normalized(token))) {
      throw new Error(`migracion 021 incompleta: ${token}`);
    }
  }
  const forbidden = granted.filter((capability) => (
    capability.startsWith('platform.')
    || PLATFORM_OWNER_OPERATIONAL_FORBIDDEN_CAPABILITIES.includes(capability)
  ));
  if (forbidden.length) {
    throw new Error(`migracion 021 otorga capacidades prohibidas: ${forbidden.join(',')}`);
  }
  if (/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|SCHEMA|DATABASE|TABLE)\b/i.test(source)
      || /\b(?:GRANT|REVOKE)\b/i.test(source)
      || /\b(?:internal_users|tenant_membership|platform_user_role|password_hash)\b/i
        .test(source)
      || /guillen|gmail\.com|marcelo@|hugo@|admin@/i.test(source)) {
    throw new Error('migracion 021 amplia objetos, identidades, ACL o material sensible');
  }
  return true;
}

export function validatePlatformOwnerOperationalIntegralEvidence(evidence) {
  const roles = Array.isArray(evidence?.roles) ? evidence.roles : [];
  exactSet(
    roles.map((role) => role.roleKey),
    [PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE],
    'rol 021',
  );
  const role = roles[0];
  if (!role || role.scopeKind !== 'tenant' || role.systemManaged !== true
      || !String(role.label || '').trim() || !String(role.description || '').trim()) {
    throw new Error('rol 021 fuera de contrato');
  }
  exactSet(
    role.capabilities,
    PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES,
    'capacidades PLATFORM_OWNER_OPERATIVO_INTEGRAL',
  );
  if (role.capabilities.length !== 34) throw new Error('cardinalidad 021 fuera de contrato');

  const sourceRoles = Array.isArray(evidence?.sourceRoles) ? evidence.sourceRoles : [];
  exactSet(
    sourceRoles.map((sourceRole) => sourceRole.roleKey),
    [CONSULTA_INTEGRAL_ROLE, 'TENANT_RRHH_ADMIN_OPERATIVO'],
    'roles fuente 021',
  );
  const consulta = sourceRoles.find((sourceRole) => sourceRole.roleKey === CONSULTA_INTEGRAL_ROLE);
  const operativo = sourceRoles.find(
    (sourceRole) => sourceRole.roleKey === 'TENANT_RRHH_ADMIN_OPERATIVO',
  );
  exactSet(consulta?.capabilities, INSTITUTIONAL_READ_CAPABILITIES, 'fuente CONSULTA_INTEGRAL');
  exactSet(
    operativo?.capabilities,
    TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES,
    'fuente TENANT_RRHH_ADMIN_OPERATIVO',
  );
  exactSet(
    [
      ...new Set([
        ...(consulta?.capabilities || []),
        ...(operativo?.capabilities || []),
      ]),
    ],
    role.capabilities,
    'union fuente 021',
  );

  const catalog = Array.isArray(evidence?.catalog) ? evidence.catalog : [];
  exactSet(
    catalog.map((capability) => capability.capabilityKey),
    PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES,
    'catalogo 021',
  );
  if (catalog.some((capability) => capability.scopeKind !== 'tenant')) {
    throw new Error('catalogo 021 incluye capacidad no tenant');
  }
  if ((evidence?.conflicts || []).length) throw new Error('rol 021 contiene conflictos SoD');
  if (role.capabilities.some((capability) => capability.startsWith('platform.')
      || PLATFORM_OWNER_OPERATIONAL_FORBIDDEN_CAPABILITIES.includes(capability))) {
    throw new Error('rol 021 contiene autoridad prohibida');
  }
  return true;
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function collectEvidence(client) {
  const rolesResult = await client.query(`
    SELECT role.role_key AS "roleKey", role.label, role.description,
      role.scope_kind AS "scopeKind", role.system_managed AS "systemManaged",
      COALESCE(array_agg(mapping.capability_key ORDER BY mapping.capability_key)
        FILTER (WHERE mapping.capability_key IS NOT NULL), ARRAY[]::varchar[]) AS capabilities
    FROM public.iam_role role
    LEFT JOIN public.iam_role_capability mapping ON mapping.role_key = role.role_key
    WHERE role.role_key = $1
    GROUP BY role.role_key, role.label, role.description, role.scope_kind, role.system_managed
  `, [PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE]);
  const sourceRolesResult = await client.query(`
    SELECT role.role_key AS "roleKey",
      COALESCE(array_agg(mapping.capability_key ORDER BY mapping.capability_key)
        FILTER (WHERE mapping.capability_key IS NOT NULL), ARRAY[]::varchar[]) AS capabilities
    FROM public.iam_role role
    LEFT JOIN public.iam_role_capability mapping ON mapping.role_key = role.role_key
    WHERE role.role_key = ANY($1::varchar[])
    GROUP BY role.role_key
    ORDER BY role.role_key
  `, [[CONSULTA_INTEGRAL_ROLE, 'TENANT_RRHH_ADMIN_OPERATIVO']]);
  const catalogResult = await client.query(`
    SELECT capability_key AS "capabilityKey", scope_kind AS "scopeKind"
    FROM public.iam_capability
    WHERE capability_key = ANY($1::varchar[])
    ORDER BY capability_key
  `, [PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES]);
  const conflictsResult = await client.query(`
    SELECT conflict.capability_key AS "capabilityKey",
      conflict.conflicts_with_key AS "conflictsWithKey"
    FROM public.iam_capability_conflict conflict
    JOIN public.iam_role_capability left_grant
      ON left_grant.role_key = $1
     AND left_grant.capability_key = conflict.capability_key
    JOIN public.iam_role_capability right_grant
      ON right_grant.role_key = left_grant.role_key
     AND right_grant.capability_key = conflict.conflicts_with_key
    ORDER BY conflict.capability_key, conflict.conflicts_with_key
  `, [PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE]);
  return {
    roles: rows(rolesResult),
    sourceRoles: rows(sourceRolesResult),
    catalog: rows(catalogResult),
    conflicts: rows(conflictsResult),
  };
}

async function verifyCurrentRuntimeFunctionAllowlist(client) {
  const runtimeFunctions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
      replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.prosecdef IS TRUE
      AND has_function_privilege(
        'municontrol_actions_runtime_app', function_row.oid, 'EXECUTE'
      )
    ORDER BY signature
  `);
  exactSet(
    rows(runtimeFunctions).map((row) => row.signature),
    EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST,
    'allowlist runtime acumulada 021',
  );
}

export async function verifyPlatformOwnerOperationalIntegralFinalState(client) {
  validatePlatformOwnerOperationalIntegralEvidence(await collectEvidence(client));
  await verifyExistingIdentityMembershipRoleContract(client);
  await verifyInstitutionalAccessProfilesFinalState(client);
  await verifyEmailFirstFactorFinalState(client);
  await verifyCurrentRuntimeFunctionAllowlist(client);
  return true;
}

async function verifyPrerequisiteLedger(client) {
  for (const prerequisite of PREREQUISITES) {
    const expected = prerequisite.fingerprint(await readFile(prerequisite.url, 'utf8'));
    const installed = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [prerequisite.version],
    );
    if (installed.rowCount !== 1
        || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
      throw new Error(`prerequisito ausente o con drift ${prerequisite.version}`);
    }
  }
  await verifyExistingIdentityMembershipRoleContract(client);
  await verifyInstitutionalAccessProfilesFinalState(client);
  await verifyEmailFirstFactorFinalState(client);
  await verifyCurrentRuntimeFunctionAllowlist(client);
}

async function verifyNoUnledgeredRole(client) {
  const reserved = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM public.iam_role WHERE role_key = $1
    ) OR EXISTS (
      SELECT 1 FROM public.iam_role_capability WHERE role_key = $1
    ) AS present
  `, [PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE]);
  if (rows(reserved)[0]?.present === true) {
    throw new Error('rol 021 presente sin ledger');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePlatformOwnerOperationalIntegralMigrationSql(migration);
  const fingerprint = platformOwnerOperationalIntegralFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const args = process.argv.slice(2);
  const target = resolvePlatformOwnerOperationalIntegralTarget(args, process.env);
  const databaseUrl = directCanonicalDatabaseUrl(args, process.env);
  if (databaseUrl !== target.databaseUrl) {
    throw new Error('el target canonico cambio durante el preflight');
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:platform-owner-operational-integral-021'))",
    );
    await verifyPrerequisiteLedger(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredRole(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: `
              + `${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyPlatformOwnerOperationalIntegralFinalState(client);
    await client.query('COMMIT');
    const targetLabel = `${target.mode}:${target.branchId}`;
    console.log(existing.rowCount
      ? `${PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION}: reapply verificado `
        + `(${targetLabel}, SHA-256 ${fingerprint})`
      : `${PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION}: fresh apply `
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
