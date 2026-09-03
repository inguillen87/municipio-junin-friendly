import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_NOVELTY_SMOKE_PROFILES,
  payrollNoveltySmokeDraft,
  payrollNoveltySmokeSafeCode,
  resolvePayrollNoveltySmokeProfiles,
  resolvePayrollNoveltySmokeTarget,
  validatePayrollNoveltySmokeActor,
} from '../scripts/smoke-governed-payroll-novelties.mjs';
import { PAYROLL_NOVELTY_PROFILE_MATRIX } from
  '../scripts/apply-institutional-payroll-novelty-profiles-schema.mjs';

const source = await readFile(new URL(
  '../scripts/smoke-governed-payroll-novelties.mjs', import.meta.url,
), 'utf8');

const host = 'ep-payroll-smoke.sa-east-1.aws.neon.tech';
const productionHost = 'ep-payroll-production.sa-east-1.aws.neon.tech';

function targetEnv(overrides = {}) {
  return {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol?sslmode=require`,
    PAYROLL_NOVELTY_SMOKE_EXPECTED_NEON_BRANCH_ID: 'br-payroll-smoke',
    PAYROLL_NOVELTY_SMOKE_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_NOVELTY_SMOKE_EXPECTED_NEON_HOST: host,
    PAYROLL_NOVELTY_SMOKE_EXPECTED_DATABASE: 'municontrol',
    CANONICAL_PRODUCTION_BRANCH_ID: 'br-payroll-production',
    CANONICAL_PRODUCTION_HOST: productionHost,
    ...overrides,
  };
}

function actor(profile, overrides = {}) {
  return {
    userEmail: profile.email,
    identityVersion: 3,
    membershipId: '10000000-0000-4000-8000-000000000001',
    roleKey: profile.roleKey,
    membershipStatus: 'active',
    hasAuthority: true,
    activeEmploymentLinks: 0,
    payrollCapabilities: [...PAYROLL_NOVELTY_PROFILE_MATRIX[profile.roleKey]],
    ...overrides,
  };
}

test('smoke 026 sólo resuelve rama Neon aislada con pines y Production conocida', () => {
  const target = resolvePayrollNoveltySmokeTarget(
    ['--confirm-isolated-branch'], targetEnv(),
  );
  assert.equal(target.mode, 'isolated');
  assert.equal(target.branchId, 'br-payroll-smoke');
  assert.equal(target.expectedHost, host);

  assert.throws(() => resolvePayrollNoveltySmokeTarget(
    ['--confirm-isolated-branch'],
    targetEnv({ CANONICAL_PRODUCTION_BRANCH_ID: 'br-payroll-smoke' }),
  ), /produccion|PRODUCTION_BRANCH_FORBIDDEN/i);
  assert.throws(() => resolvePayrollNoveltySmokeTarget(
    ['--confirm-isolated-branch'], targetEnv({ CANONICAL_PRODUCTION_HOST: host }),
  ), /CANONICAL_PRODUCTION_HOST|produccion/i);
  assert.throws(() => resolvePayrollNoveltySmokeTarget(
    ['--confirm-isolated-branch'], targetEnv({ CANONICAL_PRODUCTION_BRANCH_ID: '' }),
  ), /CANONICAL_PRODUCTION_BRANCH_ID_REQUIRED/);
});

test('smoke 026 rechaza expresamente el modo Production aunque sus pines coincidan', () => {
  const productionEnv = targetEnv({
    DATABASE_URL_UNPOOLED:
      `postgresql://user:secret@${productionHost}/municontrol?sslmode=require`,
    PAYROLL_NOVELTY_SMOKE_EXPECTED_NEON_BRANCH_ID: 'br-payroll-production',
    PAYROLL_NOVELTY_SMOKE_EXPECTED_NEON_HOST: productionHost,
    CANONICAL_PRODUCTION_DATABASE: 'municontrol',
    VERCEL_ENV: 'production',
  });
  assert.throws(() => resolvePayrollNoveltySmokeTarget(
    ['--confirm-production-branch=br-payroll-production'], productionEnv,
  ), /PRODUCTION_MODE_FORBIDDEN/);
});

test('perfiles del smoke representan owner, aprobador y consulta sin contraseñas', () => {
  assert.deepEqual(PAYROLL_NOVELTY_SMOKE_PROFILES, {
    owner: {
      email: 'marcelo@junin.com', roleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
    },
    approver: {
      email: 'hugo@junin.com', roleKey: 'HUGO_APROBADOR_INTEGRAL',
    },
    reader: {
      email: 'admin@junin.com', roleKey: 'CONSULTA_INTEGRAL',
    },
  });
  const resolved = resolvePayrollNoveltySmokeProfiles({});
  assert.equal(resolved.tenantSlug, 'junin-mendoza');
  assert.equal(resolved.owner.roleKey, 'PLATFORM_OWNER_OPERATIVO_INTEGRAL');
  assert.doesNotMatch(source, /(?:password|passwd|contrase(?:n|ñ)a)\s*[:=]/i);
});

test('validador de actores exige matriz exacta y vínculos esperados', () => {
  const owner = actor(PAYROLL_NOVELTY_SMOKE_PROFILES.owner);
  assert.equal(validatePayrollNoveltySmokeActor(
    owner, PAYROLL_NOVELTY_SMOKE_PROFILES.owner, { expectedEmploymentLinks: 0 },
  ), true);
  assert.throws(() => validatePayrollNoveltySmokeActor(
    { ...owner, roleKey: 'HUGO_APROBADOR_INTEGRAL' },
    PAYROLL_NOVELTY_SMOKE_PROFILES.owner,
  ), /ACTOR_ROLE_DRIFT/);
  assert.throws(() => validatePayrollNoveltySmokeActor(
    { ...owner, payrollCapabilities: [...owner.payrollCapabilities, 'payroll.novelty.approve'] },
    PAYROLL_NOVELTY_SMOKE_PROFILES.owner,
  ), /ACTOR_PAYROLL_CAPABILITY_DRIFT/);
  assert.throws(() => validatePayrollNoveltySmokeActor(
    { ...owner, activeEmploymentLinks: 1 },
    PAYROLL_NOVELTY_SMOKE_PROFILES.owner,
    { expectedEmploymentLinks: 0 },
  ), /ACTOR_EMPLOYMENT_LINK_DRIFT/);
});

test('fixture usa una novedad individual válida, única por corrida y sin efecto salarial', () => {
  const draft = payrollNoveltySmokeDraft({
    runId: '10000000-0000-4000-8000-000000000002',
    legajo: '257',
    periodMonth: '2026-09-01',
  });
  assert.equal(draft.sourceMode, 'individual');
  assert.equal(draft.payrollType, 'first_fortnight');
  assert.equal(draft.rows.length, 1);
  assert.equal(draft.rows[0].legajo, '257');
  assert.match(draft.rows[0].conceptSourceId, /^[1-9][0-9]{17}$/);
  assert.equal(draft.rows[0].quantityDecimal, '1');
  assert.equal(draft.rows[0].amountCents, null);
  assert.equal(draft.rows[0].forced, false);
});

test('código seguro prioriza el dominio sobre el SQLSTATE P0001', () => {
  assert.equal(payrollNoveltySmokeSafeCode({
    code: 'P0001', message: 'PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED',
  }), 'PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED');
  assert.equal(payrollNoveltySmokeSafeCode({
    code: 'PAYROLL_NOVELTY_DUPLICATE_BATCH', message: 'mensaje omitido',
  }), 'PAYROLL_NOVELTY_DUPLICATE_BATCH');
});

test('smoke cubre flujo real, controles negativos, auditoría y rollback sin COMMIT', async () => {
  for (const pattern of [
    /verifyPinnedNeonConnectedTarget\(client, target, 'smoke transaccional 026'\)/,
    /PAYROLL_NOVELTY_MIGRATION_VERSION/,
    /PAYROLL_NOVELTY_PROFILES_MIGRATION_VERSION/,
    /PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION/,
    /await client\.query\('BEGIN'\)/,
    /SET LOCAL lock_timeout/,
    /reader_prepare_denied[\s\S]*PAYROLL_NOVELTY_CAPABILITY_REQUIRED/,
    /reader_approve_denied[\s\S]*PAYROLL_NOVELTY_CAPABILITY_REQUIRED/,
    /owner-prepare/,
    /owner-submit/,
    /maker_checker_guard[\s\S]*PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED/,
    /approver-decision/,
    /approved-export/,
    /duplicate_content_guard[\s\S]*PAYROLL_NOVELTY_DUPLICATE_BATCH/,
    /reader-redaction/,
    /audit-chain/,
    /await client\.query\('ROLLBACK'\)/,
    /PAYROLL_NOVELTY_ROLLBACK_INCOMPLETE/,
  ]) assert.match(source, pattern);
  assert.doesNotMatch(source, /client\.query\('COMMIT'\)/);
  assert.doesNotMatch(source,
    /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+public\.(?:employment_contract|employment_movement|source_import_batch|person_identity)\b/i);
  assert.doesNotMatch(source,
    /console\.(?:log|error)\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);

  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:novelties:smoke'],
    'node --env-file=.env.local scripts/smoke-governed-payroll-novelties.mjs --confirm-isolated-branch');
});
