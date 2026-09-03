import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_ART_REPORT_ALLOWED_ROLES,
  PAYROLL_ART_REPORT_CAPABILITY,
  PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION,
  payrollArtReportCapabilityFingerprint,
  resolvePayrollArtReportCapabilityTarget,
  validatePayrollArtReportCapabilityEvidence,
  validatePayrollArtReportCapabilityMigrationSql,
} from '../scripts/apply-payroll-art-report-capability-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/033-payroll-art-report-capability.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-payroll-art-report-capability-schema.mjs', import.meta.url,
), 'utf8');

function evidence() {
  return {
    capability: {
      key: PAYROLL_ART_REPORT_CAPABILITY,
      scopeKind: 'tenant',
      sensitivity: 'restricted',
    },
    roleMappings: [...PAYROLL_ART_REPORT_ALLOWED_ROLES],
    overrideCount: 0,
    tenant: { slug: 'junin-mendoza', status: 'active' },
    effectiveJuninRoles: [...PAYROLL_ART_REPORT_ALLOWED_ROLES],
  };
}

test('033 define capacidad ART restringida y sólo los dos perfiles autorizados', () => {
  assert.equal(PAYROLL_ART_REPORT_CAPABILITY_MIGRATION_VERSION,
    '033-payroll-art-report-capability');
  assert.equal(validatePayrollArtReportCapabilityMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 6);
  assert.match(payrollArtReportCapabilityFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.match(migration,
    /\('HUGO_APROBADOR_INTEGRAL', 'payroll\.art_report\.generate'\)/);
  assert.match(migration,
    /\('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll\.art_report\.generate'\)/);
  assert.doesNotMatch(migration,
    /\('CONSULTA_INTEGRAL', 'payroll\.art_report\.generate'\)/);
  assert.match(migration, /lower\(tenant\.slug\) = 'junin-mendoza'/);
  assert.match(migration, /tenant_membership_capability_override/);
});

test('evidencia final rechaza permisos amplios, overrides y tenant incorrecto', () => {
  assert.equal(validatePayrollArtReportCapabilityEvidence(evidence()), true);

  const extraRole = evidence();
  extraRole.roleMappings.push('CONSULTA_INTEGRAL');
  assert.throws(() => validatePayrollArtReportCapabilityEvidence(extraRole),
    /allowlist ART 033/);

  const override = evidence();
  override.overrideCount = 1;
  assert.throws(() => validatePayrollArtReportCapabilityEvidence(override),
    /overrides ART 033/);

  const wrongTenant = evidence();
  wrongTenant.tenant.slug = 'otro-municipio';
  assert.throws(() => validatePayrollArtReportCapabilityEvidence(wrongTenant),
    /tenant Junin 033/);

  const effectiveLeak = evidence();
  effectiveLeak.effectiveJuninRoles.push('TENANT_ADMIN');
  assert.throws(() => validatePayrollArtReportCapabilityEvidence(effectiveLeak),
    /autoridad efectiva ART 033/);
});

test('aplicador 033 es ledgered, transaccional, branch-first y depende de 032', () => {
  for (const pattern of [
    /032-payroll-type-mapping-fail-closed\.sql/,
    /grh-payroll-type-map\.v1\.json/,
    /payrollTypeMappingLedgerFingerprint/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredState\(client\)/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyPayrollArtReportCapabilityFinalState\(client\)/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});

test('target 033 exige pines propios y separa QA de Produccion', () => {
  const host = 'ep-art-report.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    PAYROLL_ART_REPORT_EXPECTED_NEON_BRANCH_ID: 'br-art-report',
    PAYROLL_ART_REPORT_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_ART_REPORT_EXPECTED_NEON_HOST: host,
    PAYROLL_ART_REPORT_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolvePayrollArtReportCapabilityTarget(
    ['--confirm-isolated-branch'], base,
  ).mode, 'isolated');
  assert.equal(resolvePayrollArtReportCapabilityTarget(
    ['--confirm-production-branch=br-art-report'], {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-art-report',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
});

test('package y despliegue incluyen el aplicador y SQL 033', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:art-report-capability:schema'],
    'node --env-file=.env.local scripts/apply-payroll-art-report-capability-schema.mjs --confirm-isolated-branch');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/033-payroll-art-report-capability\.sql/);
});
