import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_NOVELTY_PROFILE_MATRIX,
  PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION,
  payrollNoveltyProfilesFingerprint,
  resolvePayrollNoveltyProfilesTarget,
  validatePayrollNoveltyProfilesEvidence,
  validatePayrollNoveltyProfilesMigrationSql,
} from '../scripts/apply-institutional-payroll-novelty-profiles-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/027-institutional-payroll-novelty-profiles.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-institutional-payroll-novelty-profiles-schema.mjs', import.meta.url,
), 'utf8');

function evidence(overrides = {}) {
  const capabilities = [...new Set(Object.values(PAYROLL_NOVELTY_PROFILE_MATRIX).flat())];
  return {
    roles: Object.entries(PAYROLL_NOVELTY_PROFILE_MATRIX).map(
      ([roleKey, roleCapabilities]) => ({
        roleKey, scopeKind: 'tenant', systemManaged: true,
        capabilities: [...roleCapabilities],
      }),
    ),
    catalog: capabilities.map((capabilityKey) => ({ capabilityKey, scopeKind: 'tenant' })),
    conflicts: [],
    ...overrides,
  };
}

test('027 fija exactamente consulta agregada, aprobador y preparador/exportador', () => {
  assert.equal(PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION,
    '027-institutional-payroll-novelty-profiles');
  assert.deepEqual(PAYROLL_NOVELTY_PROFILE_MATRIX.CONSULTA_INTEGRAL,
    ['payroll.novelty.read']);
  assert.equal(PAYROLL_NOVELTY_PROFILE_MATRIX.HUGO_APROBADOR_INTEGRAL
    .includes('payroll.novelty.approve'), true);
  assert.equal(PAYROLL_NOVELTY_PROFILE_MATRIX.HUGO_APROBADOR_INTEGRAL
    .includes('payroll.novelty.prepare'), false);
  assert.equal(PAYROLL_NOVELTY_PROFILE_MATRIX.PLATFORM_OWNER_OPERATIVO_INTEGRAL
    .includes('payroll.novelty.prepare'), true);
  assert.equal(PAYROLL_NOVELTY_PROFILE_MATRIX.PLATFORM_OWNER_OPERATIVO_INTEGRAL
    .includes('payroll.novelty.export'), true);
  assert.equal(PAYROLL_NOVELTY_PROFILE_MATRIX.PLATFORM_OWNER_OPERATIVO_INTEGRAL
    .includes('payroll.novelty.approve'), false);
  assert.equal(validatePayrollNoveltyProfilesMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 4);
  assert.match(payrollNoveltyProfilesFingerprint(migration), /^[a-f0-9]{64}$/);
});

test('validador 027 rechaza autoridad extra, identidad y cambios estructurales', () => {
  assert.throws(() => validatePayrollNoveltyProfilesMigrationSql(migration.replace(
    "  ('CONSULTA_INTEGRAL', 'payroll.novelty.read'),",
    "  ('CONSULTA_INTEGRAL', 'payroll.novelty.read'),\n"
      + "  ('CONSULTA_INTEGRAL', 'payroll.novelty.nominal.read'),",
  )), /matriz SQL 027/);
  assert.throws(() => validatePayrollNoveltyProfilesMigrationSql(
    `${migration}\nUPDATE internal_users SET password_hash = 'x';`,
  ), /identidades/);
  assert.throws(() => validatePayrollNoveltyProfilesMigrationSql(
    `${migration}\nGRANT SELECT ON public.payroll_novelty_batch TO PUBLIC;`,
  ), /ACL/);
});

test('evidencia 027 exige matriz exacta, tenant y cero conflictos SoD', () => {
  assert.equal(validatePayrollNoveltyProfilesEvidence(evidence()), true);
  const overgrant = evidence();
  overgrant.roles.find((role) => role.roleKey === 'CONSULTA_INTEGRAL')
    .capabilities.push('payroll.novelty.nominal.read');
  assert.throws(() => validatePayrollNoveltyProfilesEvidence(overgrant), /CONSULTA_INTEGRAL/);
  const conflict = evidence({ conflicts: [{ roleKey: 'x' }] });
  assert.throws(() => validatePayrollNoveltyProfilesEvidence(conflict), /SoD/);
});

test('applier 027 es ledgered, transaccional, idempotente y verifica 026', () => {
  for (const pattern of [
    /026-governed-payroll-novelties\.sql/,
    /verifyPayrollNoveltyFinalState\(client\)/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /reapply con matriz y SoD verificados/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier, /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});

test('target 027 admite QA y Production solo con pines coincidentes', () => {
  const host = 'ep-profile.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    PAYROLL_NOVELTY_PROFILES_EXPECTED_NEON_BRANCH_ID: 'br-profile',
    PAYROLL_NOVELTY_PROFILES_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_NOVELTY_PROFILES_EXPECTED_NEON_HOST: host,
    PAYROLL_NOVELTY_PROFILES_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolvePayrollNoveltyProfilesTarget(
    ['--confirm-isolated-branch'], base,
  ).mode, 'isolated');
  assert.equal(resolvePayrollNoveltyProfilesTarget(
    ['--confirm-production-branch=br-profile'], {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-profile',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
});
