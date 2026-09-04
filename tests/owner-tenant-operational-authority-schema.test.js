import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  OWNER_TENANT_AUTHORITY_CAPABILITIES,
  OWNER_TENANT_AUTHORITY_FUNCTIONS,
  OWNER_TENANT_AUTHORITY_MIGRATION_VERSION,
  OWNER_TENANT_AUTHORITY_ROLE,
  OWNER_TENANT_AUTHORITY_SCOPE_CAPABILITIES,
  OWNER_TENANT_AUTHORITY_SOD_EXCEPTIONS,
  assertNoAffectedOwnerDenyOverrides,
  ownerTenantAuthorityFingerprint,
  resolveOwnerTenantAuthorityTarget,
  validateOwnerTenantAuthorityEvidence,
  validateOwnerTenantAuthorityMigrationSql,
} from '../scripts/apply-owner-tenant-operational-authority-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/036-owner-tenant-operational-authority.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-owner-tenant-operational-authority-schema.mjs', import.meta.url,
), 'utf8');

function fn(signature, sourceBody, runtimeCanExecute = false) {
  return {
    signature,
    securityDefiner: true,
    ownedByCurrentUser: true,
    ownerIsRuntime: false,
    volatility: signature === OWNER_TENANT_AUTHORITY_FUNCTIONS.sod ? 's' : 'v',
    config: ['search_path=public, pg_temp'],
    sourceBody,
    publicExecuteRevoked: true,
    runtimeCanExecute,
    runtimeExecuteGrantable: false,
    nonOwnerExecuteGrantees: runtimeCanExecute ? ['municontrol_actions_runtime_app'] : [],
  };
}

function evidence() {
  return {
    role: {
      roleKey: OWNER_TENANT_AUTHORITY_ROLE,
      label: 'Owner operativo integral',
      description: 'Decision sobre expedientes de otro actor.',
      scopeKind: 'tenant',
      systemManaged: true,
    },
    requiredCapabilities: [...OWNER_TENANT_AUTHORITY_CAPABILITIES],
    forbiddenCapabilities: [],
    overrideCount: 0,
    conflicts: [...OWNER_TENANT_AUTHORITY_SOD_EXCEPTIONS],
    eligibleScopeCount: OWNER_TENANT_AUTHORITY_SCOPE_CAPABILITIES.length,
    actualScopeCount: OWNER_TENANT_AUTHORITY_SCOPE_CAPABILITIES.length,
    makerCheckerReady: true,
    sodEvaluationPassed: true,
    functions: [
      fn(OWNER_TENANT_AUTHORITY_FUNCTIONS.sod,
        `PLATFORM_OWNER_OPERATIVO_INTEGRAL
        payroll.control_import.prepare payroll.control_import.validate
        payroll.novelty.approve payroll.novelty.prepare
        payroll.reprocessing.approve payroll.reprocessing.prepare
        TENANT_IAM_SOD_CONFLICT`),
      fn(OWNER_TENANT_AUTHORITY_FUNCTIONS.importContext,
        `payroll.control_import.read tenant_iam_assert_no_sod_conflict
        PAYROLL_CONTROL_IMPORT_CAPABILITY_REQUIRED
        INTO capabilities
        FROM public.tenant_iam_effective_capabilities(membership_row.id) effective
        WHERE effective.capability_key LIKE 'payroll.control_import.%';
        INTO report_capabilities
        FROM public.tenant_iam_effective_capabilities(membership_row.id) effective
        WHERE effective.capability_key = 'payroll.art_report.generate';
        'capabilities', capabilities,
        'reportCapabilities', report_capabilities`),
      fn(OWNER_TENANT_AUTHORITY_FUNCTIONS.importBootstrap,
        `payroll_control_import_assert_context_v1 allowedCommands
        prepared_by_membership_id prepared_by_person_id
        'capabilities'::text, context_value -> 'capabilities'::text,
        'reportCapabilities'::text, context_value -> 'reportCapabilities'::text`, true),
    ],
  };
}

test('036 declara autoridad owner tenant exacta y un canal ART separado', () => {
  assert.equal(OWNER_TENANT_AUTHORITY_MIGRATION_VERSION,
    '036-owner-tenant-operational-authority');
  assert.equal(validateOwnerTenantAuthorityMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 16);
  assert.match(ownerTenantAuthorityFingerprint(migration), /^[a-f0-9]{64}$/);
  for (const capability of OWNER_TENANT_AUTHORITY_CAPABILITIES) {
    assert.match(migration, new RegExp(capability.replaceAll('.', '\\.')));
  }
  assert.match(migration,
    /'capabilities', context_value->'capabilities',[\s\S]*'reportCapabilities', context_value->'reportCapabilities'/);
  assert.match(migration,
    /INTO report_capabilities[\s\S]*WHERE effective\.capability_key = 'payroll\.art_report\.generate'/);
  assert.match(migration,
    /bootstrap_source_compact := replace\([\s\S]*regexp_replace\(bootstrap_source, '\[\[:space:\]\]\+'/);
  assert.match(migration,
    /'capabilities'',context_value->''capabilities'',''reportCapabilities'',context_value->''reportCapabilities''/);
  assert.doesNotMatch(migration,
    /bootstrap_source NOT LIKE '%context_value -> ''reportCapabilities''%'/);
});

test('036 conserva maker-checker por registro y no habilita publicación o mutación', () => {
  assert.deepEqual(OWNER_TENANT_AUTHORITY_SOD_EXCEPTIONS, [
    'payroll.control_import.prepare|payroll.control_import.validate',
    'payroll.novelty.approve|payroll.novelty.prepare',
    'payroll.reprocessing.approve|payroll.reprocessing.prepare',
  ]);
  for (const guard of [
    'payroll_control_import_batch_maker_checker_ck',
    'payroll_novelty_batch_maker_checker_ck',
    'payroll_reprocessing_case_maker_checker_ck',
    'action_center_overtime_decider_separated_v1',
    'action_center_tenant_detail_v2',
  ]) assert.match(migration, new RegExp(guard));
  assert.match(migration, /time\.overtime\.post/);
  assert.match(migration, /payroll\.novelty\.post/);
  assert.match(migration, /payroll\.reprocessing\.execute/);
  assert.doesNotMatch(migration,
    /\(\s*'PLATFORM_OWNER_OPERATIVO_INTEGRAL'\s*,\s*'(?:time\.overtime\.post|payroll\.novelty\.post|payroll\.reprocessing\.execute|platform\.)/);
});

test('evidencia 036 exige ACL execute-only, alcances exactos y tres excepciones SoD', () => {
  assert.equal(validateOwnerTenantAuthorityEvidence(evidence()), true);

  const broad = evidence();
  broad.forbiddenCapabilities.push('payroll.reprocessing.execute');
  assert.throws(() => validateOwnerTenantAuthorityEvidence(broad), /prohibidas/);

  const missingScope = evidence();
  missingScope.actualScopeCount -= 1;
  assert.throws(() => validateOwnerTenantAuthorityEvidence(missingScope), /alcance/);

  const publicHelper = evidence();
  publicHelper.functions[0].publicExecuteRevoked = false;
  assert.throws(() => validateOwnerTenantAuthorityEvidence(publicHelper), /insegura/);

  const mixedReport = evidence();
  mixedReport.functions[2].sourceBody = `payroll_control_import_assert_context_v1
    reportCapabilities allowedCommands prepared_by_membership_id prepared_by_person_id
    'capabilities', context_value->'capabilities',
    'reportCapabilities', context_value->'capabilities'`;
  assert.throws(() => validateOwnerTenantAuthorityEvidence(mixedReport),
    /reportCapabilities separado/);

  const mixedContext = evidence();
  mixedContext.functions[1].sourceBody = mixedContext.functions[1].sourceBody
    .replace("LIKE 'payroll.control_import.%'", "LIKE 'payroll.%'");
  assert.throws(() => validateOwnerTenantAuthorityEvidence(mixedContext),
    /canales separados/);
});

test('aplicador 036 diferencia fresh/reapply y verifica ledger, pines y estado final', () => {
  for (const pattern of [
    /008-governed-overtime-actions/,
    /018-action-center-operational-completion/,
    /021-platform-owner-operational-integral/,
    /025-governed-payroll-control-import/,
    /026-governed-payroll-novelties/,
    /027-institutional-payroll-novelty-profiles/,
    /033-payroll-art-report-capability/,
    /034-payroll-control-import-binding-lock/,
    /035-governed-payroll-reprocessing/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /if \(!existing\.rowCount\) \{[\s\S]*verifyNoUnledgeredState\(client\)/,
    /if \(!existing\.rowCount\) \{[\s\S]*assertNoAffectedOwnerDenyOverrides\(client\)[\s\S]*verifyNoUnledgeredState\(client\)/,
    /verifyOwnerTenantAuthorityFinalState\(client\)/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /existing\.rowCount[\s\S]*ledger y estado final verificados/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});

test('aplicador 036 aborta antes de mutar si un owner conserva un deny explicito', async () => {
  let capturedSql = '';
  let capturedParams = [];
  const client = {
    async query(sql, params) {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [{ count: 1 }] };
    },
  };
  await assert.rejects(
    () => assertNoAffectedOwnerDenyOverrides(client),
    /OWNER_TENANT_AUTHORITY_DENY_OVERRIDE_REVIEW_REQUIRED: 1/,
  );
  assert.match(capturedSql, /override_row\.deny_override IS TRUE/);
  assert.equal(capturedParams[0], OWNER_TENANT_AUTHORITY_ROLE);
  assert.deepEqual(capturedParams[1], OWNER_TENANT_AUTHORITY_CAPABILITIES);

  assert.equal(await assertNoAffectedOwnerDenyOverrides({
    async query() { return { rows: [{ count: 0 }] }; },
  }), true);
});

test('target 036 exige pines propios y separa QA de Produccion', () => {
  const host = 'ep-owner-authority.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    OWNER_TENANT_AUTHORITY_EXPECTED_NEON_BRANCH_ID: 'br-owner-authority',
    OWNER_TENANT_AUTHORITY_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    OWNER_TENANT_AUTHORITY_EXPECTED_NEON_HOST: host,
    OWNER_TENANT_AUTHORITY_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolveOwnerTenantAuthorityTarget(['--confirm-isolated-branch'], base).mode,
    'isolated');
  assert.equal(resolveOwnerTenantAuthorityTarget(
    ['--confirm-production-branch=br-owner-authority'], {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-owner-authority',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
});

test('package y despliegue incluyen aplicador y SQL 036', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:iam:owner-tenant-authority:schema'],
    'node --env-file=.env.local scripts/apply-owner-tenant-operational-authority-schema.mjs --confirm-isolated-branch');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/036-owner-tenant-operational-authority\.sql/);
});
