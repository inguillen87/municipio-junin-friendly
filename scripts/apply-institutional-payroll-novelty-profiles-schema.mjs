import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  PAYROLL_NOVELTY_MIGRATION_VERSION,
  payrollNoveltyFingerprint,
  verifyPayrollNoveltyFinalState,
} from './apply-governed-payroll-novelties-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION =
  '027-institutional-payroll-novelty-profiles';
export const PAYROLL_NOVELTY_PROFILE_MATRIX = Object.freeze({
  CONSULTA_INTEGRAL: Object.freeze([
    'payroll.novelty.read',
  ]),
  HUGO_APROBADOR_INTEGRAL: Object.freeze([
    'payroll.novelty.approve',
    'payroll.novelty.audit.read',
    'payroll.novelty.nominal.read',
    'payroll.novelty.read',
  ]),
  PLATFORM_OWNER_OPERATIVO_INTEGRAL: Object.freeze([
    'payroll.novelty.audit.read',
    'payroll.novelty.export',
    'payroll.novelty.nominal.read',
    'payroll.novelty.prepare',
    'payroll.novelty.read',
  ]),
});

const MIGRATION_URL = new URL(
  './migrations/027-institutional-payroll-novelty-profiles.sql', import.meta.url,
);

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

export function payrollNoveltyProfilesFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function extractProfileTuples(sql) {
  const block = String(sql || '').match(
    /INSERT\s+INTO\s+public\.iam_role_capability\s*\([^)]*\)\s*VALUES([\s\S]*?)ON\s+CONFLICT/i,
  )?.[1] || '';
  return [...block.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)]
    .map((match) => `${match[1]}|${match[2]}`);
}

export function validatePayrollNoveltyProfilesMigrationSql(sql) {
  const source = String(sql || '');
  const expected = Object.entries(PAYROLL_NOVELTY_PROFILE_MATRIX).flatMap(
    ([role, capabilities]) => capabilities.map((capability) => `${role}|${capability}`),
  );
  exactSet(extractProfileTuples(source), expected, 'matriz SQL 027');
  for (const token of [
    "mapping.capability_key LIKE 'payroll.novelty.%'",
    'DELETE FROM public.iam_role_capability',
    'PAYROLL_NOVELTY_PROFILE_CAPABILITY_CATALOG_DRIFT',
    'PAYROLL_NOVELTY_PROFILE_ROLE_DRIFT',
    'PAYROLL_NOVELTY_PROFILE_ALLOWLIST_DRIFT',
    'PAYROLL_NOVELTY_PROFILE_SOD_CONFLICT',
    'FROM public.iam_capability_conflict conflict',
    'EXCEPT SELECT role_key, capability_key FROM actual',
    'EXCEPT SELECT role_key, capability_key FROM expected',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 027 no contiene ${token}`);
  }
  if (/\b(?:internal_users|tenant_membership|password_hash|password_credential)\b/i.test(source)
      || /\b(?:marcelo|hugo|admin)@/i.test(source)
      || /\b(?:CREATE|ALTER|DROP|TRUNCATE)\s+(?:ROLE|SCHEMA|DATABASE|TABLE)\b/i.test(source)
      || /\b(?:GRANT|REVOKE)\b/i.test(source)) {
    throw new Error('migracion 027 amplia objetos, identidades, ACL o material sensible');
  }
  return true;
}

export function validatePayrollNoveltyProfilesEvidence(evidence) {
  const roleMap = Object.fromEntries(
    (evidence?.roles || []).map((role) => [role.roleKey, role]),
  );
  exactSet(Object.keys(roleMap), Object.keys(PAYROLL_NOVELTY_PROFILE_MATRIX), 'roles 027');
  for (const [roleKey, capabilities] of Object.entries(PAYROLL_NOVELTY_PROFILE_MATRIX)) {
    const role = roleMap[roleKey];
    if (role?.scopeKind !== 'tenant' || role?.systemManaged !== true) {
      throw new Error(`rol 027 inseguro: ${roleKey}`);
    }
    exactSet(role.capabilities, capabilities, `capacidades 027 ${roleKey}`);
  }
  if ((evidence?.catalog || []).some((capability) => capability.scopeKind !== 'tenant')) {
    throw new Error('catalogo 027 contiene capacidad no tenant');
  }
  const catalogExpected = [...new Set(Object.values(PAYROLL_NOVELTY_PROFILE_MATRIX).flat())];
  exactSet((evidence?.catalog || []).map((item) => item.capabilityKey),
    catalogExpected, 'catalogo 027');
  if ((evidence?.conflicts || []).length) throw new Error('perfiles 027 violan SoD');
  return true;
}

async function collectEvidence(client) {
  const roleKeys = Object.keys(PAYROLL_NOVELTY_PROFILE_MATRIX);
  const rolesResult = await client.query(`
    SELECT role.role_key AS "roleKey", role.scope_kind AS "scopeKind",
      role.system_managed AS "systemManaged",
      COALESCE(array_agg(mapping.capability_key ORDER BY mapping.capability_key)
        FILTER (WHERE mapping.capability_key LIKE 'payroll.novelty.%'),
        ARRAY[]::varchar[]) AS capabilities
    FROM public.iam_role role
    LEFT JOIN public.iam_role_capability mapping ON mapping.role_key = role.role_key
    WHERE role.role_key = ANY($1::varchar[])
    GROUP BY role.role_key, role.scope_kind, role.system_managed
    ORDER BY role.role_key
  `, [roleKeys]);
  const catalogResult = await client.query(`
    SELECT capability_key AS "capabilityKey", scope_kind AS "scopeKind"
    FROM public.iam_capability
    WHERE capability_key LIKE 'payroll.novelty.%'
    ORDER BY capability_key
  `);
  const conflictsResult = await client.query(`
    SELECT left_grant.role_key AS "roleKey",
      conflict.capability_key AS "capabilityKey",
      conflict.conflicts_with_key AS "conflictsWithKey"
    FROM public.iam_capability_conflict conflict
    JOIN public.iam_role_capability left_grant
      ON left_grant.capability_key = conflict.capability_key
    JOIN public.iam_role_capability right_grant
      ON right_grant.role_key = left_grant.role_key
     AND right_grant.capability_key = conflict.conflicts_with_key
    WHERE left_grant.role_key = ANY($1::varchar[])
    ORDER BY left_grant.role_key, conflict.capability_key
  `, [roleKeys]);
  return {
    roles: rows(rolesResult),
    catalog: rows(catalogResult),
    conflicts: rows(conflictsResult),
  };
}

export async function verifyPayrollNoveltyProfilesFinalState(client) {
  validatePayrollNoveltyProfilesEvidence(await collectEvidence(client));
  return true;
}

export function resolvePayrollNoveltyProfilesTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_NOVELTY_PROFILES',
    targetLabel: '027',
  });
}

export async function verifyPayrollNoveltyProfilesConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '027');
}

async function verifyPrerequisite(client) {
  const sql = await readFile(new URL(
    './migrations/026-governed-payroll-novelties.sql', import.meta.url,
  ), 'utf8');
  const expected = payrollNoveltyFingerprint(sql);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PAYROLL_NOVELTY_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${PAYROLL_NOVELTY_MIGRATION_VERSION}`);
  }
  await verifyPayrollNoveltyFinalState(client);
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePayrollNoveltyProfilesMigrationSql(migration);
  const checksum = payrollNoveltyProfilesFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollNoveltyProfilesTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollNoveltyProfilesConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-novelty-profiles-027'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollNoveltyFinalState(client);
    await verifyPayrollNoveltyProfilesFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION}: ${existing.rowCount
      ? 'reapply con matriz y SoD verificados' : 'fresh apply'} `
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
