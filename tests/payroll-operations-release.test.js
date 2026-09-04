import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_OPERATIONS_RELEASE_STEPS,
  payrollOperationsChildArguments,
  payrollOperationsChildEnvironment,
  payrollOperationsReleaseStepsForState,
  resolvePayrollOperationsReleaseTarget,
} from '../scripts/apply-governed-payroll-operations-release-schema.mjs';
import { payrollControlImportBindingFingerprint } from
  '../scripts/apply-payroll-control-import-binding-lock-schema.mjs';
import {
  OWNER_TENANT_AUTHORITY_MIGRATION_VERSION,
  ownerTenantAuthorityFingerprint,
} from '../scripts/apply-owner-tenant-operational-authority-schema.mjs';

const source = await readFile(new URL(
  '../scripts/apply-governed-payroll-operations-release-schema.mjs', import.meta.url,
), 'utf8');

function target(mode = 'isolated') {
  return {
    mode,
    branchId: 'br-payroll-release',
    projectId: 'junin-friendly',
    expectedHost: 'ep-payroll-release.sa-east-1.aws.neon.tech',
    expectedDatabase: 'municontrol',
  };
}

test('release ejecuta en orden estricto 024 a 037', () => {
  assert.deepEqual(PAYROLL_OPERATIONS_RELEASE_STEPS.map((step) => step.version), [
    '024-governed-monthly-attendance-evaluation',
    '025-governed-payroll-control-import',
    '026-governed-payroll-novelties',
    '027-institutional-payroll-novelty-profiles',
    '028-governed-account-profile',
    '029-payroll-novelty-first-fortnight',
    '030-governed-account-profile-admin-view',
    '031-governed-employee-payroll-history',
    '032-payroll-type-mapping-fail-closed',
    '033-payroll-art-report-capability',
    '034-payroll-control-import-binding-lock',
    '035-governed-payroll-reprocessing',
    '036-owner-tenant-operational-authority',
    '037-payroll-control-import-lock-semantics',
  ]);
  const step029 = PAYROLL_OPERATIONS_RELEASE_STEPS.find((step) => (
    step.version === '029-payroll-novelty-first-fortnight'
  ));
  assert.equal(step029.envPrefix, 'PAYROLL_NOVELTY_FIRST_FORTNIGHT');
  assert.match(step029.script.pathname, /apply-payroll-novelty-first-fortnight-schema\.mjs$/);
  const step030 = PAYROLL_OPERATIONS_RELEASE_STEPS.find((step) => (
    step.version === '030-governed-account-profile-admin-view'
  ));
  assert.equal(step030.envPrefix, 'ACCOUNT_PROFILE_GOVERNANCE');
  assert.match(step030.script.pathname,
    /apply-governed-account-profile-admin-view-schema\.mjs$/);
  const step031 = PAYROLL_OPERATIONS_RELEASE_STEPS.at(-7);
  assert.equal(step031.envPrefix, 'EMPLOYEE_PAYROLL_HISTORY');
  assert.match(step031.script.pathname,
    /apply-governed-employee-payroll-history-schema\.mjs$/);
  const step032 = PAYROLL_OPERATIONS_RELEASE_STEPS.at(-6);
  assert.equal(step032.envPrefix, 'PAYROLL_TYPE_MAPPING');
  assert.match(step032.script.pathname,
    /apply-payroll-type-mapping-fail-closed-schema\.mjs$/);
  const step033 = PAYROLL_OPERATIONS_RELEASE_STEPS.at(-5);
  assert.equal(step033.envPrefix, 'PAYROLL_ART_REPORT');
  assert.match(step033.script.pathname,
    /apply-payroll-art-report-capability-schema\.mjs$/);
  const step034 = PAYROLL_OPERATIONS_RELEASE_STEPS.at(-4);
  assert.equal(step034.envPrefix, 'PAYROLL_CONTROL_IMPORT_BINDING');
  assert.match(step034.script.pathname,
    /apply-payroll-control-import-binding-lock-schema\.mjs$/);
  const step035 = PAYROLL_OPERATIONS_RELEASE_STEPS.at(-3);
  assert.equal(step035.envPrefix, 'PAYROLL_REPROCESSING');
  assert.match(step035.script.pathname,
    /apply-governed-payroll-reprocessing-schema\.mjs$/);
  const step036 = PAYROLL_OPERATIONS_RELEASE_STEPS.at(-2);
  assert.equal(step036.envPrefix, 'OWNER_TENANT_AUTHORITY');
  assert.match(step036.script.pathname,
    /apply-owner-tenant-operational-authority-schema\.mjs$/);
  const step037 = PAYROLL_OPERATIONS_RELEASE_STEPS.at(-1);
  assert.equal(step037.envPrefix, 'PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS');
  assert.match(step037.script.pathname,
    /apply-payroll-control-import-lock-semantics-schema\.mjs$/);
  assert.match(source, /result\.status !== 0/);
  assert.match(source, /release se detuvo antes del siguiente paso/);
  assert.match(source, /verifyPinnedNeonConnectedTarget\(client, target, 'release 024-037'\)/);
});

test('hijos reciben modo y cuatro pines, nunca el secreto como argumento', () => {
  const isolated = payrollOperationsChildArguments(target());
  assert.deepEqual(isolated, [
    '--confirm-isolated-branch',
    '--expected-neon-branch-id=br-payroll-release',
    '--expected-neon-project-id=junin-friendly',
    '--expected-neon-host=ep-payroll-release.sa-east-1.aws.neon.tech',
    '--expected-database=municontrol',
  ]);
  const production = payrollOperationsChildArguments(target('production'));
  assert.equal(production[0], '--confirm-production-branch=br-payroll-release');
  assert.equal(production.some((argument) => /secret|postgresql/i.test(argument)), false);
  const env = payrollOperationsChildEnvironment(target(), 'PAYROLL_NOVELTY', {});
  assert.equal(env.PAYROLL_NOVELTY_EXPECTED_NEON_BRANCH_ID, 'br-payroll-release');
  assert.equal(env.PAYROLL_NOVELTY_EXPECTED_NEON_HOST,
    'ep-payroll-release.sa-east-1.aws.neon.tech');
  const fortnightEnv = payrollOperationsChildEnvironment(
    target(), 'PAYROLL_NOVELTY_FIRST_FORTNIGHT', {},
  );
  assert.equal(fortnightEnv.PAYROLL_NOVELTY_FIRST_FORTNIGHT_EXPECTED_NEON_BRANCH_ID,
    'br-payroll-release');
  const accountProfileViewEnv = payrollOperationsChildEnvironment(
    target(), 'ACCOUNT_PROFILE_GOVERNANCE', {},
  );
  assert.equal(accountProfileViewEnv.ACCOUNT_PROFILE_GOVERNANCE_EXPECTED_NEON_BRANCH_ID,
    'br-payroll-release');
  const historyEnv = payrollOperationsChildEnvironment(
    target(), 'EMPLOYEE_PAYROLL_HISTORY', {},
  );
  assert.equal(historyEnv.EMPLOYEE_PAYROLL_HISTORY_EXPECTED_NEON_BRANCH_ID,
    'br-payroll-release');
  const typeMappingEnv = payrollOperationsChildEnvironment(
    target(), 'PAYROLL_TYPE_MAPPING', {},
  );
  assert.equal(typeMappingEnv.PAYROLL_TYPE_MAPPING_EXPECTED_NEON_BRANCH_ID,
    'br-payroll-release');
  const artReportEnv = payrollOperationsChildEnvironment(
    target(), 'PAYROLL_ART_REPORT', {},
  );
  assert.equal(artReportEnv.PAYROLL_ART_REPORT_EXPECTED_NEON_BRANCH_ID,
    'br-payroll-release');
  const bindingEnv = payrollOperationsChildEnvironment(
    target(), 'PAYROLL_CONTROL_IMPORT_BINDING', {},
  );
  assert.equal(bindingEnv.PAYROLL_CONTROL_IMPORT_BINDING_EXPECTED_NEON_BRANCH_ID,
    'br-payroll-release');
  const reprocessingEnv = payrollOperationsChildEnvironment(
    target(), 'PAYROLL_REPROCESSING', {},
  );
  assert.equal(reprocessingEnv.PAYROLL_REPROCESSING_EXPECTED_NEON_BRANCH_ID,
    'br-payroll-release');
  const ownerAuthorityEnv = payrollOperationsChildEnvironment(
    target(), 'OWNER_TENANT_AUTHORITY', {},
  );
  assert.equal(ownerAuthorityEnv.OWNER_TENANT_AUTHORITY_EXPECTED_NEON_BRANCH_ID,
    'br-payroll-release');
  const lockSemanticsEnv = payrollOperationsChildEnvironment(
    target(), 'PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS', {},
  );
  assert.equal(
    lockSemanticsEnv.PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_EXPECTED_NEON_BRANCH_ID,
    'br-payroll-release',
  );
});

test('release productivo repite branch id en comando, canonico y pin propio', () => {
  const host = 'ep-payroll-release.sa-east-1.aws.neon.tech';
  const env = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    PAYROLL_OPERATIONS_EXPECTED_NEON_BRANCH_ID: 'br-payroll-release',
    PAYROLL_OPERATIONS_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_OPERATIONS_EXPECTED_NEON_HOST: host,
    PAYROLL_OPERATIONS_EXPECTED_DATABASE: 'municontrol',
    CANONICAL_PRODUCTION_BRANCH_ID: 'br-payroll-release',
    CANONICAL_PRODUCTION_HOST: host,
    CANONICAL_PRODUCTION_DATABASE: 'municontrol',
    VERCEL_ENV: 'production',
  };
  assert.equal(resolvePayrollOperationsReleaseTarget(
    ['--confirm-production-branch=br-payroll-release'], env,
  ).mode, 'production');
  assert.throws(() => resolvePayrollOperationsReleaseTarget(
    ['--confirm-production-branch=br-other'], env,
  ), /rama confirmada no coincide/);
});

test('reapply 034 omite la verificacion historica 025 y valida su ledger antes de escribir', async () => {
  const migration = await readFile(new URL(
    '../scripts/migrations/034-payroll-control-import-binding-lock.sql', import.meta.url,
  ), 'utf8');
  const checksum = payrollControlImportBindingFingerprint(migration);
  const fresh = await payrollOperationsReleaseStepsForState({
    async query() { return { rowCount: 0, rows: [] }; },
  });
  assert.equal(fresh.some((step) => step.version === '025-governed-payroll-control-import'), true);

  const reapply = await payrollOperationsReleaseStepsForState({
    async query(_sql, [version]) {
      if (version === OWNER_TENANT_AUTHORITY_MIGRATION_VERSION) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [{ checksum_sha256: checksum }] };
    },
  });
  assert.equal(reapply.some((step) => step.version === '025-governed-payroll-control-import'), false);
  assert.equal(reapply.at(-1).version, '037-payroll-control-import-lock-semantics');

  await assert.rejects(() => payrollOperationsReleaseStepsForState({
    async query(_sql, [version]) {
      if (version === OWNER_TENANT_AUTHORITY_MIGRATION_VERSION) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [{ checksum_sha256: '0'.repeat(64) }] };
    },
  }), /Drift detectado: 034-payroll-control-import-binding-lock/);
  assert.match(source, /releaseSteps = await payrollOperationsReleaseStepsForState\(client\)/);
});

test('reapply 036 valida su checksum y ejecuta unicamente el hotfix 037', async () => {
  const migration = await readFile(new URL(
    '../scripts/migrations/036-owner-tenant-operational-authority.sql', import.meta.url,
  ), 'utf8');
  const checksum = ownerTenantAuthorityFingerprint(migration);
  const queriedVersions = [];
  const plan = await payrollOperationsReleaseStepsForState({
    async query(_sql, [version]) {
      queriedVersions.push(version);
      return { rowCount: 1, rows: [{ checksum_sha256: checksum }] };
    },
  });
  assert.deepEqual(plan.map((step) => step.version), [
    '037-payroll-control-import-lock-semantics',
  ]);
  assert.deepEqual(queriedVersions, [OWNER_TENANT_AUTHORITY_MIGRATION_VERSION]);

  await assert.rejects(() => payrollOperationsReleaseStepsForState({
    async query() {
      return { rowCount: 1, rows: [{ checksum_sha256: '0'.repeat(64) }] };
    },
  }), /Drift detectado: 036-owner-tenant-operational-authority/);
  assert.ok(
    source.indexOf('releaseSteps = await payrollOperationsReleaseStepsForState(client)')
      < source.indexOf('for (const step of releaseSteps)'),
    'el checksum 036 debe validarse antes de iniciar hijos',
  );
});

test('package expone release explícito y Vercel conserva 026 a 037 y la pantalla', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:operations:release'],
    'node --env-file=.env.local scripts/apply-governed-payroll-operations-release-schema.mjs');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/026-governed-payroll-novelties\.sql/);
  assert.match(ignore, /!scripts\/migrations\/027-institutional-payroll-novelty-profiles\.sql/);
  assert.match(ignore, /!scripts\/migrations\/028-governed-account-profile\.sql/);
  assert.match(ignore, /!scripts\/migrations\/029-payroll-novelty-first-fortnight\.sql/);
  assert.match(ignore, /!scripts\/migrations\/030-governed-account-profile-admin-view\.sql/);
  assert.match(ignore, /!scripts\/migrations\/031-governed-employee-payroll-history\.sql/);
  assert.match(ignore, /!scripts\/migrations\/032-payroll-type-mapping-fail-closed\.sql/);
  assert.match(ignore, /!scripts\/migrations\/033-payroll-art-report-capability\.sql/);
  assert.match(ignore, /!scripts\/migrations\/034-payroll-control-import-binding-lock\.sql/);
  assert.match(ignore, /!scripts\/migrations\/035-governed-payroll-reprocessing\.sql/);
  assert.match(ignore, /!scripts\/migrations\/036-owner-tenant-operational-authority\.sql/);
  assert.match(ignore, /!scripts\/migrations\/037-payroll-control-import-lock-semantics\.sql/);
  assert.match(ignore, /!novedades-nomina\.html/);
  assert.doesNotMatch(source, /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});
