import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';

export const PAYROLL_OPERATIONS_RELEASE_STEPS = Object.freeze([
  Object.freeze({
    version: '024-governed-monthly-attendance-evaluation',
    script: new URL('./apply-governed-monthly-attendance-evaluation-schema.mjs', import.meta.url),
    envPrefix: 'ATTENDANCE_EVALUATION',
  }),
  Object.freeze({
    version: '025-governed-payroll-control-import',
    script: new URL('./apply-governed-payroll-control-import-schema.mjs', import.meta.url),
    envPrefix: 'PAYROLL_CONTROL_IMPORT',
  }),
  Object.freeze({
    version: '026-governed-payroll-novelties',
    script: new URL('./apply-governed-payroll-novelties-schema.mjs', import.meta.url),
    envPrefix: 'PAYROLL_NOVELTY',
  }),
  Object.freeze({
    version: '027-institutional-payroll-novelty-profiles',
    script: new URL('./apply-institutional-payroll-novelty-profiles-schema.mjs', import.meta.url),
    envPrefix: 'PAYROLL_NOVELTY_PROFILES',
  }),
  Object.freeze({
    version: '028-governed-account-profile',
    script: new URL('./apply-governed-account-profile-schema.mjs', import.meta.url),
    envPrefix: 'ACCOUNT_PROFILE_GOVERNANCE',
  }),
  Object.freeze({
    version: '029-payroll-novelty-first-fortnight',
    script: new URL('./apply-payroll-novelty-first-fortnight-schema.mjs', import.meta.url),
    envPrefix: 'PAYROLL_NOVELTY_FIRST_FORTNIGHT',
  }),
  Object.freeze({
    version: '030-governed-account-profile-admin-view',
    script: new URL('./apply-governed-account-profile-admin-view-schema.mjs', import.meta.url),
    envPrefix: 'ACCOUNT_PROFILE_GOVERNANCE',
  }),
  Object.freeze({
    version: '031-governed-employee-payroll-history',
    script: new URL('./apply-governed-employee-payroll-history-schema.mjs', import.meta.url),
    envPrefix: 'EMPLOYEE_PAYROLL_HISTORY',
  }),
  Object.freeze({
    version: '032-payroll-type-mapping-fail-closed',
    script: new URL('./apply-payroll-type-mapping-fail-closed-schema.mjs', import.meta.url),
    envPrefix: 'PAYROLL_TYPE_MAPPING',
  }),
]);

export function resolvePayrollOperationsReleaseTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_OPERATIONS',
    targetLabel: 'release 024-032',
  });
}

export function payrollOperationsChildArguments(target) {
  const modeArgument = target.mode === 'production'
    ? `--confirm-production-branch=${target.branchId}`
    : '--confirm-isolated-branch';
  return Object.freeze([
    modeArgument,
    `--expected-neon-branch-id=${target.branchId}`,
    `--expected-neon-project-id=${target.projectId}`,
    `--expected-neon-host=${target.expectedHost}`,
    `--expected-database=${target.expectedDatabase}`,
  ]);
}

export function payrollOperationsChildEnvironment(target, envPrefix, env = process.env) {
  return {
    ...env,
    [`${envPrefix}_EXPECTED_NEON_BRANCH_ID`]: target.branchId,
    [`${envPrefix}_EXPECTED_NEON_PROJECT_ID`]: target.projectId,
    [`${envPrefix}_EXPECTED_NEON_HOST`]: target.expectedHost,
    [`${envPrefix}_EXPECTED_DATABASE`]: target.expectedDatabase,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const target = resolvePayrollOperationsReleaseTarget(args, process.env);

  // One preflight connection proves all nine migrations will target the same
  // branch, project, direct endpoint and database before the first write.
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPinnedNeonConnectedTarget(client, target, 'release 024-032');
  } finally {
    await client.end().catch(() => undefined);
  }

  const childArguments = payrollOperationsChildArguments(target);
  for (const step of PAYROLL_OPERATIONS_RELEASE_STEPS) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(step.script), ...childArguments],
      {
        cwd: process.cwd(),
        env: payrollOperationsChildEnvironment(target, step.envPrefix),
        stdio: 'inherit',
      },
    );
    if (result.error) {
      throw new Error(`no se pudo iniciar ${step.version}: ${result.error.message}`,
        { cause: result.error });
    }
    if (result.status !== 0) {
      throw new Error(`${step.version} fallo; el release se detuvo antes del siguiente paso`);
    }
  }
  console.log(`release 024-032 verificado (${target.mode}:${target.branchId})`);
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
