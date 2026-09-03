import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  payrollTypeMappingLedgerFingerprint,
} from './apply-payroll-type-mapping-fail-closed-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION =
  '033-payroll-art-report-capability';
export const PAYROLL_ART_REPORT_CAPABILITY = 'payroll.art_report.generate';
export const PAYROLL_ART_REPORT_TENANT_SLUG = 'junin-mendoza';
export const PAYROLL_ART_REPORT_ALLOWED_ROLES = Object.freeze([
  'HUGO_APROBADOR_INTEGRAL',
  'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
]);

const MIGRATION_URL = new URL(
  './migrations/033-payroll-art-report-capability.sql', import.meta.url,
);
const PREREQUISITE_MIGRATION_URL = new URL(
  './migrations/032-payroll-type-mapping-fail-closed.sql', import.meta.url,
);
const PREREQUISITE_CONTRACT_URL = new URL(
  '../contracts/grh-payroll-type-map.v1.json', import.meta.url,
);
const PREREQUISITE_VERSION = '032-payroll-type-mapping-fail-closed';

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

export function payrollArtReportCapabilityFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validatePayrollArtReportCapabilityMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    "'payroll.art_report.generate'",
    "'junin-mendoza'",
    "'HUGO_APROBADOR_INTEGRAL'",
    "'PLATFORM_OWNER_OPERATIVO_INTEGRAL'",
    "'tenant'",
    "'restricted'",
    'PAYROLL_ART_REPORT_ROLE_PREREQUISITE_DRIFT',
    'PAYROLL_ART_REPORT_JUNIN_TENANT_REQUIRED',
    'PAYROLL_ART_REPORT_ROLE_ALLOWLIST_DRIFT',
    'PAYROLL_ART_REPORT_OVERRIDE_FORBIDDEN',
    'PAYROLL_ART_REPORT_EFFECTIVE_AUTHORITY_DRIFT',
    'DELETE FROM public.tenant_membership_capability_override',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 033 no contiene ${token}`);
  }
  if (/\('CONSULTA_INTEGRAL',\s*'payroll\.art_report\.generate'\)/.test(source)
      || /\('TENANT_[^']+',\s*'payroll\.art_report\.generate'\)/.test(source)) {
    throw new Error('migracion 033 concede la capacidad fuera del allowlist');
  }
  if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:public\.)?(?:employment_contract|payroll_run|payroll_monthly_fact|payroll_novelty_batch|source_import_batch)\b/i
    .test(source)) {
    throw new Error('migracion 033 intenta mutar datos laborales o de liquidacion');
  }
  if (splitPostgresStatements(source).length !== 6) {
    throw new Error('migracion 033 incompleta o no segmentable');
  }
  return true;
}

export function validatePayrollArtReportCapabilityEvidence(evidence) {
  const capability = evidence?.capability || {};
  if (capability.key !== PAYROLL_ART_REPORT_CAPABILITY
      || capability.scopeKind !== 'tenant'
      || capability.sensitivity !== 'restricted') {
    throw new Error('capacidad ART 033 fuera de contrato');
  }
  exactSet(evidence?.roleMappings || [], PAYROLL_ART_REPORT_ALLOWED_ROLES,
    'allowlist ART 033');
  if (Number(evidence?.overrideCount) !== 0) {
    throw new Error('overrides ART 033 deben permanecer vacios');
  }
  const tenant = evidence?.tenant || {};
  if (tenant.slug !== PAYROLL_ART_REPORT_TENANT_SLUG
      || !['onboarding', 'active'].includes(tenant.status)) {
    throw new Error('tenant Junin 033 ausente o inhabilitado');
  }
  if ((evidence?.effectiveJuninRoles || []).some((role) => (
    !PAYROLL_ART_REPORT_ALLOWED_ROLES.includes(String(role))
  ))) {
    throw new Error('autoridad efectiva ART 033 fuera del allowlist');
  }
  return true;
}

export function resolvePayrollArtReportCapabilityTarget(
  argv = process.argv, env = process.env,
) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_ART_REPORT',
    targetLabel: '033',
  });
}

export async function verifyPayrollArtReportCapabilityConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '033');
}

async function collectEvidence(client) {
  const capabilityResult = await client.query(`
    SELECT capability_key AS key, scope_kind AS "scopeKind", sensitivity
    FROM public.iam_capability
    WHERE capability_key = $1
  `, [PAYROLL_ART_REPORT_CAPABILITY]);
  const roleResult = await client.query(`
    SELECT role_key AS "roleKey"
    FROM public.iam_role_capability
    WHERE capability_key = $1
    ORDER BY role_key
  `, [PAYROLL_ART_REPORT_CAPABILITY]);
  const overrideResult = await client.query(`
    SELECT count(*)::integer AS count
    FROM public.tenant_membership_capability_override
    WHERE capability_key = $1
  `, [PAYROLL_ART_REPORT_CAPABILITY]);
  const tenantResult = await client.query(`
    SELECT slug, status
    FROM public.platform_tenant
    WHERE lower(slug) = $1
  `, [PAYROLL_ART_REPORT_TENANT_SLUG]);
  const effectiveResult = await client.query(`
    SELECT DISTINCT membership.role_key AS "roleKey"
    FROM public.tenant_membership membership
    JOIN public.platform_tenant tenant ON tenant.id = membership.tenant_id
    JOIN public.tenant_iam_effective_capabilities(membership.id) effective
      ON effective.capability_key = $1
    WHERE lower(tenant.slug) = $2
    ORDER BY membership.role_key
  `, [PAYROLL_ART_REPORT_CAPABILITY, PAYROLL_ART_REPORT_TENANT_SLUG]);
  return {
    capability: rows(capabilityResult)[0],
    roleMappings: rows(roleResult).map((item) => item.roleKey),
    overrideCount: rows(overrideResult)[0]?.count,
    tenant: rows(tenantResult)[0],
    effectiveJuninRoles: rows(effectiveResult).map((item) => item.roleKey),
  };
}

export async function verifyPayrollArtReportCapabilityFinalState(client) {
  return validatePayrollArtReportCapabilityEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const [migration, contract] = await Promise.all([
    readFile(PREREQUISITE_MIGRATION_URL, 'utf8'),
    readFile(PREREQUISITE_CONTRACT_URL, 'utf8'),
  ]);
  const expected = payrollTypeMappingLedgerFingerprint(migration, contract);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PREREQUISITE_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${PREREQUISITE_VERSION}`);
  }
}

async function verifyNoUnledgeredState(client) {
  const result = await client.query(`
    SELECT
      EXISTS (SELECT 1 FROM public.iam_capability WHERE capability_key = $1)
        OR EXISTS (SELECT 1 FROM public.iam_role_capability WHERE capability_key = $1)
        OR EXISTS (
          SELECT 1 FROM public.tenant_membership_capability_override
          WHERE capability_key = $1
        ) AS present
  `, [PAYROLL_ART_REPORT_CAPABILITY]);
  if (rows(result)[0]?.present === true) {
    throw new Error('estado 033 presente sin ledger');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validatePayrollArtReportCapabilityMigrationSql(migration);
  const checksum = payrollArtReportCapabilityFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollArtReportCapabilityTarget(
    process.argv.slice(2), process.env,
  );
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollArtReportCapabilityConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-art-report-033'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollArtReportCapabilityFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION}: ${existing.rowCount
      ? 'ledger y autoridad final verificados' : 'fresh apply'} `
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
