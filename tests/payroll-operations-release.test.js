import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_OPERATIONS_RELEASE_STEPS,
  payrollOperationsChildArguments,
  payrollOperationsChildEnvironment,
  resolvePayrollOperationsReleaseTarget,
} from '../scripts/apply-governed-payroll-operations-release-schema.mjs';

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

test('release ejecuta en orden estricto 024 a 029', () => {
  assert.deepEqual(PAYROLL_OPERATIONS_RELEASE_STEPS.map((step) => step.version), [
    '024-governed-monthly-attendance-evaluation',
    '025-governed-payroll-control-import',
    '026-governed-payroll-novelties',
    '027-institutional-payroll-novelty-profiles',
    '028-governed-account-profile',
    '029-payroll-novelty-first-fortnight',
  ]);
  const step029 = PAYROLL_OPERATIONS_RELEASE_STEPS.at(-1);
  assert.equal(step029.envPrefix, 'PAYROLL_NOVELTY_FIRST_FORTNIGHT');
  assert.match(step029.script.pathname, /apply-payroll-novelty-first-fortnight-schema\.mjs$/);
  assert.match(source, /result\.status !== 0/);
  assert.match(source, /release se detuvo antes del siguiente paso/);
  assert.match(source, /verifyPinnedNeonConnectedTarget\(client, target, 'release 024-029'\)/);
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

test('package expone release explícito y Vercel conserva 026 a 029 y la pantalla', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:operations:release'],
    'node --env-file=.env.local scripts/apply-governed-payroll-operations-release-schema.mjs');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/026-governed-payroll-novelties\.sql/);
  assert.match(ignore, /!scripts\/migrations\/027-institutional-payroll-novelty-profiles\.sql/);
  assert.match(ignore, /!scripts\/migrations\/028-governed-account-profile\.sql/);
  assert.match(ignore, /!scripts\/migrations\/029-payroll-novelty-first-fortnight\.sql/);
  assert.match(ignore, /!novedades-nomina\.html/);
  assert.doesNotMatch(source, /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});
