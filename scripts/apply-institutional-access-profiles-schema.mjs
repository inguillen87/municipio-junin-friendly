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
  ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION,
  actionCenterOperationalCompletionFingerprint,
  verifyActionCenterOperationalCompletionFinalState,
} from './apply-action-center-operational-completion-schema.mjs';

export const INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION =
  '019-institutional-access-profiles';
export const CONSULTA_INTEGRAL_ROLE = 'CONSULTA_INTEGRAL';
export const HUGO_APROBADOR_INTEGRAL_ROLE = 'HUGO_APROBADOR_INTEGRAL';

export const INSTITUTIONAL_READ_CAPABILITIES = Object.freeze([
  'workforce.summary.read',
  'workforce.structure.read',
  'workforce.employee.read',
  'payroll.read',
  'absence.analytics.read',
  'absence.nominal.read',
  'leave.policy.read',
  'leave.preview.read',
  'management.analytics.read',
  'quality.read',
  'lineage.read',
  'budget.approved.read',
  'assistant.use',
  'actions.read',
  'leave.request.aggregate.read',
  'leave.request.all.read',
  'leave.request.audit.read',
  'leave.request.restricted.read',
  'leave.request.payroll.read',
  'time.overtime.read',
  'time.source.read',
  'time.source.audit.read',
  'time.catalog.read',
  'time.catalog.audit.read',
]);

export const INSTITUTIONAL_DECISION_CAPABILITIES = Object.freeze([
  'absence.validate',
  'employee.record.approve',
  'leave.approve',
  'leave.request.area.read',
  'leave.request.area.decide',
  'leave.request.area.cancel_approved',
  'leave.request.restricted.decide',
  'time.overtime.approve',
  'time.source.approve',
  'time.catalog.approve',
]);

export const HUGO_APROBADOR_INTEGRAL_CAPABILITIES = Object.freeze([
  ...INSTITUTIONAL_READ_CAPABILITIES,
  ...INSTITUTIONAL_DECISION_CAPABILITIES,
]);

const MIGRATION_URL = new URL(
  './migrations/019-institutional-access-profiles.sql', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/018-action-center-operational-completion.sql', import.meta.url,
);
const TARGET_ROLES = Object.freeze([
  CONSULTA_INTEGRAL_ROLE,
  HUGO_APROBADOR_INTEGRAL_ROLE,
]);
const EXPECTED_CAPABILITY_CATALOG = Object.freeze([
  ...new Set(HUGO_APROBADOR_INTEGRAL_CAPABILITIES),
]);

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

function roleGrantCapabilities(sql, roleKey) {
  const escaped = roleKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tuple = new RegExp(`\\(\\s*'${escaped}'\\s*,\\s*'([^']+)'\\s*\\)`, 'g');
  const grantBlocks = [
    ...String(sql || '').matchAll(
      /INSERT\s+INTO\s+public\.iam_role_capability\s*\([^)]*\)\s*VALUES([\s\S]*?)ON\s+CONFLICT\s*\(role_key,\s*capability_key\)\s*DO\s+NOTHING\s*;/gi,
    ),
  ].map((match) => match[1]);
  return grantBlocks.flatMap((block) => (
    [...block.matchAll(tuple)].map((match) => match[1])
  ));
}

function roleDeleteCapabilities(sql, roleKey) {
  const escaped = roleKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = String(sql || '').match(new RegExp(
    `DELETE\\s+FROM\\s+public\\.iam_role_capability\\s+role_capability\\s+`
      + `WHERE\\s+role_capability\\.role_key\\s*=\\s*'${escaped}'\\s+`
      + 'AND\\s+role_capability\\.capability_key\\s+NOT\\s+IN\\s*'
      + '\\(([\\s\\S]*?)\\)\\s*;',
    'i',
  ))?.[1];
  if (block === undefined) return [];
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

export function institutionalAccessProfilesFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validateInstitutionalAccessProfilesMigrationSql(sql) {
  const source = String(sql || '');
  const compact = normalized(source);
  const consulta = roleGrantCapabilities(source, CONSULTA_INTEGRAL_ROLE);
  const aprobador = roleGrantCapabilities(source, HUGO_APROBADOR_INTEGRAL_ROLE);
  const consultaDelete = roleDeleteCapabilities(source, CONSULTA_INTEGRAL_ROLE);
  const aprobadorDelete = roleDeleteCapabilities(source, HUGO_APROBADOR_INTEGRAL_ROLE);

  exactSet(consulta, INSTITUTIONAL_READ_CAPABILITIES, 'grants CONSULTA_INTEGRAL');
  exactSet(
    aprobador,
    HUGO_APROBADOR_INTEGRAL_CAPABILITIES,
    'grants HUGO_APROBADOR_INTEGRAL',
  );
  exactSet(
    consultaDelete,
    INSTITUTIONAL_READ_CAPABILITIES,
    'sincronizacion CONSULTA_INTEGRAL',
  );
  exactSet(
    aprobadorDelete,
    HUGO_APROBADOR_INTEGRAL_CAPABILITIES,
    'sincronizacion HUGO_APROBADOR_INTEGRAL',
  );
  if (consulta.length !== INSTITUTIONAL_READ_CAPABILITIES.length
      || aprobador.length !== HUGO_APROBADOR_INTEGRAL_CAPABILITIES.length
      || consultaDelete.length !== INSTITUTIONAL_READ_CAPABILITIES.length
      || aprobadorDelete.length !== HUGO_APROBADOR_INTEGRAL_CAPABILITIES.length) {
    throw new Error('migracion 019 contiene grants o allowlists de sincronizacion duplicados');
  }

  for (const token of [
    "'CONSULTA_INTEGRAL'",
    "'HUGO_APROBADOR_INTEGRAL'",
    'scope_kind, system_managed',
    "'tenant', true",
    'DELETE FROM public.iam_role_capability',
    'role_capability.capability_key NOT IN',
    'ON CONFLICT (role_key, capability_key) DO NOTHING',
    'consulta_count <> 24 OR aprobador_count <> 34',
    'INSTITUTIONAL_PROFILE_CAPABILITY_CATALOG_DRIFT',
    'INSTITUTIONAL_PROFILE_FORBIDDEN_CAPABILITY',
    'INSTITUTIONAL_PROFILE_SOD_CONFLICT',
    'FROM public.iam_capability_conflict conflict',
  ]) {
    if (!compact.includes(normalized(token))) {
      throw new Error(`migracion 019 incompleta: ${token}`);
    }
  }

  const deleteCount = (source.match(/DELETE\s+FROM\s+public\.iam_role_capability/gi) || [])
    .length;
  const insertGrantCount = (
    source.match(/INSERT\s+INTO\s+public\.iam_role_capability/gi) || []
  ).length;
  if (deleteCount !== 2 || insertGrantCount !== 2) {
    throw new Error('migracion 019 no sincroniza exactamente ambos roles');
  }

  const forbiddenGrants = [...consulta, ...aprobador].filter((capability) => (
    capability.startsWith('platform.')
    || capability === 'leave.request.all.manage'
    || [
      'absence.enter', 'employee.record.propose', 'leave.enter',
      'time.overtime.enter', 'time.overtime.post',
      'time.source.propose', 'time.catalog.propose',
    ].includes(capability)
    || /\.(?:create|update|submit|cancel|cancel_pending|propose|enter|post|manage)$/.test(
      capability,
    )
  ));
  if (forbiddenGrants.length) {
    throw new Error(`migracion 019 otorga capacidades prohibidas: ${forbiddenGrants.join(',')}`);
  }
  if (/\b(?:CREATE|ALTER|DROP)\s+(?:ROLE|SCHEMA|DATABASE|TABLE)\b/i.test(source)
      || /\b(?:GRANT|REVOKE)\b/i.test(source)
      || /\b(?:internal_users|tenant_membership|platform_user_role|password_hash)\b/i
        .test(source)
      || /guillen|gmail\.com|marcelo@|hugo@|admin@/i.test(source)) {
    throw new Error('migracion 019 amplia objetos, identidades, ACL o material sensible');
  }
  return true;
}

export function validateInstitutionalAccessProfilesEvidence(evidence) {
  const roles = Array.isArray(evidence?.roles) ? evidence.roles : [];
  exactSet(roles.map((role) => role.roleKey), TARGET_ROLES, 'roles institucionales');
  const byRole = new Map(roles.map((role) => [role.roleKey, role]));
  const consulta = byRole.get(CONSULTA_INTEGRAL_ROLE);
  const aprobador = byRole.get(HUGO_APROBADOR_INTEGRAL_ROLE);
  for (const role of [consulta, aprobador]) {
    if (!role || role.scopeKind !== 'tenant' || role.systemManaged !== true
        || !String(role.label || '').trim() || !String(role.description || '').trim()) {
      throw new Error(`rol 019 fuera de contrato: ${role?.roleKey || 'ausente'}`);
    }
  }
  exactSet(
    consulta.capabilities,
    INSTITUTIONAL_READ_CAPABILITIES,
    'capacidades CONSULTA_INTEGRAL',
  );
  exactSet(
    aprobador.capabilities,
    HUGO_APROBADOR_INTEGRAL_CAPABILITIES,
    'capacidades HUGO_APROBADOR_INTEGRAL',
  );
  if (consulta.capabilities.length !== 24 || aprobador.capabilities.length !== 34) {
    throw new Error('cardinalidad 019 fuera de contrato');
  }

  const catalog = Array.isArray(evidence?.catalog) ? evidence.catalog : [];
  exactSet(
    catalog.map((capability) => capability.capabilityKey),
    EXPECTED_CAPABILITY_CATALOG,
    'catalogo requerido 019',
  );
  if (catalog.some((capability) => capability.scopeKind !== 'tenant')) {
    throw new Error('catalogo 019 incluye capacidad no tenant');
  }
  if ((evidence?.conflicts || []).length) {
    throw new Error('perfiles 019 contienen conflictos SoD');
  }
  return true;
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function collectInstitutionalAccessProfilesEvidence(client) {
  const rolesResult = await client.query(`
    SELECT role.role_key AS "roleKey", role.label, role.description,
      role.scope_kind AS "scopeKind", role.system_managed AS "systemManaged",
      COALESCE(array_agg(role_capability.capability_key
        ORDER BY role_capability.capability_key)
        FILTER (WHERE role_capability.capability_key IS NOT NULL), ARRAY[]::varchar[])
        AS capabilities
    FROM public.iam_role role
    LEFT JOIN public.iam_role_capability role_capability
      ON role_capability.role_key = role.role_key
    WHERE role.role_key = ANY($1::varchar[])
    GROUP BY role.role_key, role.label, role.description, role.scope_kind, role.system_managed
    ORDER BY role.role_key
  `, [TARGET_ROLES]);
  const catalogResult = await client.query(`
    SELECT capability_key AS "capabilityKey", scope_kind AS "scopeKind"
    FROM public.iam_capability
    WHERE capability_key = ANY($1::varchar[])
    ORDER BY capability_key
  `, [EXPECTED_CAPABILITY_CATALOG]);
  const conflictsResult = await client.query(`
    SELECT left_grant.role_key AS "roleKey",
      conflict.capability_key AS "capabilityKey",
      conflict.conflicts_with_key AS "conflictsWithKey"
    FROM public.iam_capability_conflict conflict
    JOIN public.iam_role_capability left_grant
      ON left_grant.capability_key = conflict.capability_key
    JOIN public.iam_role_capability right_grant
      ON right_grant.capability_key = conflict.conflicts_with_key
     AND right_grant.role_key = left_grant.role_key
    WHERE left_grant.role_key = ANY($1::varchar[])
    ORDER BY left_grant.role_key, conflict.capability_key, conflict.conflicts_with_key
  `, [TARGET_ROLES]);
  return {
    roles: rows(rolesResult),
    catalog: rows(catalogResult),
    conflicts: rows(conflictsResult),
  };
}

export async function verifyInstitutionalAccessProfilesFinalState(client) {
  validateInstitutionalAccessProfilesEvidence(
    await collectInstitutionalAccessProfilesEvidence(client),
  );
  await verifyActionCenterOperationalCompletionFinalState(client);
  return true;
}

async function verifyPrerequisiteLedger(client) {
  const prerequisite = await readFile(PREREQUISITE_URL, 'utf8');
  const expected = actionCenterOperationalCompletionFingerprint(prerequisite);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(
      `prerequisito ausente o con drift ${ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION}`,
    );
  }
  await verifyActionCenterOperationalCompletionFinalState(client, prerequisite);
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateInstitutionalAccessProfilesMigrationSql(migration);
  const fingerprint = institutionalAccessProfilesFingerprint(migration);
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
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:institutional-access-profiles-019'))",
    );
    await verifyPrerequisiteLedger(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: `
              + `${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyInstitutionalAccessProfilesFinalState(client);
    await client.query('COMMIT');
    const targetLabel = target.mode === 'production'
      ? `production:${target.branchId}` : 'isolated';
    console.log(existing.rowCount
      ? `${INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION}: reapply verificado `
        + `(${targetLabel}, SHA-256 ${fingerprint})`
      : `${INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION}: fresh apply `
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
