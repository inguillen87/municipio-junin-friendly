import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION,
  payrollControlImportBindingFingerprint,
} from './apply-payroll-control-import-binding-lock-schema.mjs';
import {
  OWNER_TENANT_AUTHORITY_MIGRATION_VERSION,
  ownerTenantAuthorityFingerprint,
} from './apply-owner-tenant-operational-authority-schema.mjs';
import {
  PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION,
} from './apply-payroll-control-import-lock-semantics-schema.mjs';
import {
  PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION,
} from './apply-governed-monthly-close-schema.mjs';
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
  Object.freeze({
    version: '033-payroll-art-report-capability',
    script: new URL('./apply-payroll-art-report-capability-schema.mjs', import.meta.url),
    envPrefix: 'PAYROLL_ART_REPORT',
  }),
  Object.freeze({
    version: '034-payroll-control-import-binding-lock',
    script: new URL('./apply-payroll-control-import-binding-lock-schema.mjs', import.meta.url),
    envPrefix: 'PAYROLL_CONTROL_IMPORT_BINDING',
  }),
  Object.freeze({
    version: '035-governed-payroll-reprocessing',
    script: new URL('./apply-governed-payroll-reprocessing-schema.mjs', import.meta.url),
    envPrefix: 'PAYROLL_REPROCESSING',
  }),
  Object.freeze({
    version: '036-owner-tenant-operational-authority',
    script: new URL('./apply-owner-tenant-operational-authority-schema.mjs', import.meta.url),
    envPrefix: 'OWNER_TENANT_AUTHORITY',
  }),
  Object.freeze({
    version: '037-payroll-control-import-lock-semantics',
    script: new URL(
      './apply-payroll-control-import-lock-semantics-schema.mjs', import.meta.url,
    ),
    envPrefix: 'PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS',
  }),
  Object.freeze({
    version: PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION,
    script: new URL('./apply-governed-monthly-close-schema.mjs', import.meta.url),
    envPrefix: 'PAYROLL_MONTHLY_CLOSE',
  }),
]);

export function resolvePayrollOperationsReleaseTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_OPERATIONS',
    targetLabel: 'release 024-038',
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

export async function payrollOperationsReleaseStepsForState(client) {
  const ownerAuthorityInstalled = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [OWNER_TENANT_AUTHORITY_MIGRATION_VERSION],
  );
  if (ownerAuthorityInstalled.rowCount) {
    const ownerAuthorityMigration = await readFile(new URL(
      './migrations/036-owner-tenant-operational-authority.sql', import.meta.url,
    ), 'utf8');
    const ownerAuthorityExpected = ownerTenantAuthorityFingerprint(ownerAuthorityMigration);
    if (ownerAuthorityInstalled.rowCount !== 1
        || String(ownerAuthorityInstalled.rows[0].checksum_sha256 || '').trim()
          !== ownerAuthorityExpected) {
      throw new Error(`Drift detectado: ${OWNER_TENANT_AUTHORITY_MIGRATION_VERSION}`);
    }

    // 036 reemplaza contratos de 026, 027 y 035 para conceder autoridad owner
    // con maker-checker por registro. Revalidar esas versiones historicas
    // contra el estado posterior produciria un falso drift antes de los incrementos.
    return Object.freeze(PAYROLL_OPERATIONS_RELEASE_STEPS.filter((step) => (
      step.version === PAYROLL_CONTROL_IMPORT_LOCK_SEMANTICS_MIGRATION_VERSION
        || step.version === PAYROLL_MONTHLY_CLOSE_MIGRATION_VERSION
    )));
  }

  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION],
  );
  if (!installed.rowCount) return PAYROLL_OPERATIONS_RELEASE_STEPS;

  const migration = await readFile(new URL(
    './migrations/034-payroll-control-import-binding-lock.sql', import.meta.url,
  ), 'utf8');
  const expected = payrollControlImportBindingFingerprint(migration);
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`Drift detectado: ${PAYROLL_CONTROL_IMPORT_BINDING_MIGRATION_VERSION}`);
  }

  // 034 reemplaza deliberadamente la firma publica que 025 verifica. En un
  // reapply se conserva el ledger 025 y se verifica mediante el prerequisito
  // checksum de 034, sin intentar reconstruir la fachada historica.
  return Object.freeze(PAYROLL_OPERATIONS_RELEASE_STEPS.filter((step) => (
    step.version !== '025-governed-payroll-control-import'
  )));
}

async function main() {
  const args = process.argv.slice(2);
  const target = resolvePayrollOperationsReleaseTarget(args, process.env);

  // One preflight connection proves every migration will target the same
  // branch, project, direct endpoint and database before the first write.
  const client = new Client({ connectionString: target.databaseUrl });
  let releaseSteps;
  await client.connect();
  try {
    await verifyPinnedNeonConnectedTarget(client, target, 'release 024-038');
    releaseSteps = await payrollOperationsReleaseStepsForState(client);
  } finally {
    await client.end().catch(() => undefined);
  }

  const childArguments = payrollOperationsChildArguments(target);
  for (const step of releaseSteps) {
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
  console.log(`release 024-038 verificado (${target.mode}:${target.branchId})`);
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
