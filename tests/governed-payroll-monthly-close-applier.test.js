import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_MONTHLY_CLOSE_INDEXES,
  PAYROLL_MONTHLY_CLOSE_REQUIRED_COLUMNS,
  PAYROLL_MONTHLY_CLOSE_ROLE_MATRIX,
  PAYROLL_MONTHLY_CLOSE_RUNTIME_SIGNATURES,
  PAYROLL_MONTHLY_CLOSE_SIGNATURES,
  PAYROLL_MONTHLY_CLOSE_TABLES,
  PAYROLL_MONTHLY_CLOSE_TRIGGERS,
  resolvePayrollMonthlyCloseTarget,
  validatePayrollMonthlyCloseEvidence,
  verifyPayrollMonthlyCloseConnectedTarget,
} from '../scripts/apply-governed-monthly-close-schema.mjs';

const [applier, packageSource, ignore, vercelSource] = await Promise.all([
  readFile(new URL('../scripts/apply-governed-monthly-close-schema.mjs', import.meta.url),
    'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../.vercelignore', import.meta.url), 'utf8'),
  readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
]);

function targetEnv(overrides = {}) {
  return {
    DATABASE_URL_UNPOOLED:
      'postgresql://user:secret@ep-monthly-close.us-east-2.aws.neon.tech/municontrol?sslmode=require',
    PAYROLL_MONTHLY_CLOSE_EXPECTED_NEON_BRANCH_ID: 'br-monthly-close',
    PAYROLL_MONTHLY_CLOSE_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_MONTHLY_CLOSE_EXPECTED_NEON_HOST:
      'ep-monthly-close.us-east-2.aws.neon.tech',
    PAYROLL_MONTHLY_CLOSE_EXPECTED_DATABASE: 'municontrol',
    ...overrides,
  };
}

function syntheticEvidence(overrides = {}) {
  const allSourceTokens = [
    'action_center_assert_tenant_read_session_v2',
    'action_center_context_has_capability',
    'sourceBindingId',
    'actorPersonId',
    'PAYROLL_MONTHLY_CLOSE_SESSION_BUSY',
    'actor_membership_id',
    'idempotency_key',
    'actor_session_id',
    'actor_session_version',
    'certified_binding_id',
    'release_sha',
    'actor_role_key',
    'authority_capability_key',
    'ATTEMPT_NOT_FOUND',
    'ATTEMPT_CONTEXT_CHANGED',
    'event_result',
    'jsonb_array_length(p_sources) <> 3',
    'grh-concept-statistics.v1',
    'bank-accreditation-summary.v1',
    'government-payroll-summary.v1',
    'three_source_exact_aggregate_reconciliation',
    'governmentComparisons',
    'computed_government_earnings',
    'computed_government_contributions',
    'comparison_mismatch <> bank_mismatch',
    'PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_REUSE',
    'payroll_monthly_close_run',
    'payroll_monthly_close_event',
    'PAYROLL_MONTHLY_CLOSE_VERSION_CONFLICT',
    'PAYROLL_MONTHLY_CLOSE_MAKER_CHECKER_REQUIRED',
    'PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL',
    'run_row.difference_cents <> 0',
    'run_row.mismatch_count <> 0',
    'run_row.blocking_issue_count <> 0',
    'differenceCents',
    'sourceSetSha256',
    'timeline',
    "'includesPersonalRecords', false",
    "'rawContentStored', false",
    "'grhMutation', false",
    "'payrollCalculated', false",
    "'payrollPosted', false",
    "'bankArtifactGenerated', false",
    "'governmentArtifactGenerated', false",
    "'fiscalArtifactGenerated', false",
    "'bindingId', NEW.certified_binding_id::text",
    "'personId', NEW.actor_person_id::text",
    "'roleKey', NEW.actor_role_key",
    "'authorityCapabilityKey', NEW.authority_capability_key",
    "'occurredAt'",
    "NEW.occurred_at AT TIME ZONE 'UTC'",
  ].join(' ');
  const runtime = new Set(PAYROLL_MONTHLY_CLOSE_RUNTIME_SIGNATURES);
  const stable = new Set([
    PAYROLL_MONTHLY_CLOSE_SIGNATURES.snapshot,
    PAYROLL_MONTHLY_CLOSE_SIGNATURES.eventResult,
  ]);
  const constraint = (tableName, name, definition) => ({
    tableName, name, validated: true, definition,
  });
  return {
    tables: PAYROLL_MONTHLY_CLOSE_TABLES.map((name) => ({
      name,
      ownedByCurrentUser: true,
      ownerIsRuntime: false,
      publicPrivileges: false,
      runtimeAnyPrivileges: false,
      nonOwnerPrivilegeGrantees: [],
    })),
    columns: Object.entries(PAYROLL_MONTHLY_CLOSE_REQUIRED_COLUMNS).flatMap(
      ([tableName, columns]) => Object.entries(columns).map(
        ([name, [dataType, notNull]]) => ({ tableName, name, dataType, notNull }),
      ),
    ),
    constraints: [
      constraint('payroll_monthly_close_run', 'payroll_monthly_close_run_binding_fk',
        'FOREIGN KEY (tenant_id, certified_binding_id) REFERENCES platform_tenant_source_binding ON DELETE RESTRICT'),
      constraint('payroll_monthly_close_run', 'payroll_monthly_close_run_maker_checker_ck',
        'CHECK (decided_by_membership_id <> prepared_by_membership_id AND decided_by_person_id <> prepared_by_person_id)'),
      constraint('payroll_monthly_close_run', 'payroll_monthly_close_run_no_side_effect_ck',
        'CHECK (includes_personal_records IS FALSE AND raw_content_stored IS FALSE AND payroll_posted IS FALSE AND fiscal_artifact_generated IS FALSE)'),
      constraint('payroll_monthly_close_run', 'payroll_monthly_close_run_state_ck',
        "CHECK (status = 'approved' AND difference_cents = 0 AND mismatch_count = 0 AND blocking_issue_count = 0)"),
      constraint('payroll_monthly_close_event', 'payroll_monthly_close_event_actor_idempotency_uk',
        'UNIQUE (tenant_id, actor_membership_id, idempotency_key)'),
      constraint('payroll_monthly_close_event', 'payroll_monthly_close_event_no_side_effect_ck',
        'CHECK (raw_content_stored IS FALSE AND grh_mutation IS FALSE AND payroll_posted IS FALSE)'),
    ],
    indexes: [
      {
        name: 'payroll_monthly_close_event_timeline_idx', valid: true, ready: true,
        unique: false, hasPredicate: false,
        definition: 'CREATE INDEX ON payroll_monthly_close_event (tenant_id, run_id, occurred_at, id)',
      },
      {
        name: 'payroll_monthly_close_run_active_period_uk', valid: true, ready: true,
        unique: true, hasPredicate: true,
        definition: "CREATE UNIQUE INDEX ON payroll_monthly_close_run (tenant_id, certified_binding_id, period_month, jurisdiction) WHERE status IN ('prepared','submitted','approved')",
      },
      {
        name: 'payroll_monthly_close_run_tenant_status_idx', valid: true, ready: true,
        unique: false, hasPredicate: false,
        definition: 'CREATE INDEX ON payroll_monthly_close_run (tenant_id, status, period_month DESC, id)',
      },
    ],
    functions: Object.entries(PAYROLL_MONTHLY_CLOSE_SIGNATURES).map(([key, signature]) => ({
      signature,
      securityDefiner: true,
      ownedByCurrentUser: true,
      ownerIsRuntime: false,
      publicExecuteRevoked: true,
      runtimeExecuteGrantable: false,
      volatility: key === 'flags' ? 'i' : stable.has(signature) ? 's' : 'v',
      config: ['search_path=public, pg_temp'],
      runtimeCanExecute: runtime.has(signature),
      nonOwnerExecuteGrantees: runtime.has(signature)
        ? ['municontrol_actions_runtime_app'] : [],
      sourceBody: allSourceTokens,
    })),
    triggers: Object.entries(PAYROLL_MONTHLY_CLOSE_TRIGGERS).map(([name, contract]) => ({
      name,
      tableName: contract.table,
      enabled: 'O',
      functionSignature: contract.functionSignature,
      definition: `CREATE TRIGGER ${name} ${contract.tokens.join(' ')} ON public.${contract.table}`,
    })),
    capabilities: [
      { key: 'payroll.monthly_close.approve', scopeKind: 'tenant', sensitivity: 'restricted' },
      { key: 'payroll.monthly_close.audit.read', scopeKind: 'tenant', sensitivity: 'restricted' },
      { key: 'payroll.monthly_close.prepare', scopeKind: 'tenant', sensitivity: 'privileged' },
      { key: 'payroll.monthly_close.read', scopeKind: 'tenant', sensitivity: 'standard' },
    ],
    roles: Object.keys(PAYROLL_MONTHLY_CLOSE_ROLE_MATRIX).map((key) => ({
      key, scopeKind: 'tenant', systemManaged: true,
    })),
    roleMappings: Object.entries(PAYROLL_MONTHLY_CLOSE_ROLE_MATRIX).flatMap(
      ([role, capabilities]) => capabilities.map((capability) => ({ role, capability })),
    ),
    conflicts: [{
      capability: 'payroll.monthly_close.approve',
      conflictsWith: 'payroll.monthly_close.prepare',
    }],
    overrideCount: 0,
    ...overrides,
  };
}

test('preflight 038 exige URL directa, confirmación y cuatro pines propios', () => {
  assert.throws(() => resolvePayrollMonthlyCloseTarget([], targetEnv()),
    /confirm-isolated-branch/);
  const target = resolvePayrollMonthlyCloseTarget(
    ['--confirm-isolated-branch'], targetEnv(),
  );
  assert.equal(target.mode, 'isolated');
  assert.equal(target.branchId, 'br-monthly-close');
  assert.equal(target.projectId, 'junin-friendly');
  assert.equal(target.endpointId, 'ep-monthly-close');
  assert.equal(target.expectedDatabase, 'municontrol');
  assert.throws(() => resolvePayrollMonthlyCloseTarget(
    ['--confirm-isolated-branch'], targetEnv({
      DATABASE_URL_UNPOOLED:
        'postgresql://u:p@ep-monthly-close-pooler.us-east-2.aws.neon.tech/municontrol',
    }),
  ), /pooled/);
  assert.throws(() => resolvePayrollMonthlyCloseTarget(
    ['--confirm-isolated-branch'], targetEnv({
      PAYROLL_MONTHLY_CLOSE_EXPECTED_NEON_BRANCH_ID: '',
    }),
  ), /EXPECTED_NEON_BRANCH_ID/);
});

test('post-connect rechaza rama, proyecto, endpoint o base distintos', async () => {
  const target = resolvePayrollMonthlyCloseTarget(
    ['--confirm-isolated-branch'], targetEnv(),
  );
  const row = {
    branchId: 'br-monthly-close', projectId: 'junin-friendly',
    endpointId: 'ep-monthly-close', database: 'municontrol',
  };
  assert.equal(await verifyPayrollMonthlyCloseConnectedTarget({
    query: async () => ({ rows: [row] }),
  }, target), true);
  await assert.rejects(verifyPayrollMonthlyCloseConnectedTarget({
    query: async () => ({ rows: [{ ...row, database: 'otra' }] }),
  }, target), /target Neon 038/);
});

test('evidencia final acepta sólo el contrato privado y sin efectos externos', () => {
  assert.equal(validatePayrollMonthlyCloseEvidence(syntheticEvidence()), true);
  const publicTable = syntheticEvidence();
  publicTable.tables[0].publicPrivileges = true;
  assert.throws(() => validatePayrollMonthlyCloseEvidence(publicTable), /tabla 038 insegura/);
  const forbiddenColumn = syntheticEvidence();
  forbiddenColumn.columns.push({
    tableName: 'payroll_monthly_close_run', name: 'dni',
    dataType: 'text', notNull: false,
  });
  assert.throws(() => validatePayrollMonthlyCloseEvidence(forbiddenColumn),
    /persiste datos prohibidos/);
  const runtimeHelper = syntheticEvidence();
  runtimeHelper.functions.find((item) =>
    item.signature === PAYROLL_MONTHLY_CLOSE_SIGNATURES.flags)
    .runtimeCanExecute = true;
  assert.throws(() => validatePayrollMonthlyCloseEvidence(runtimeHelper),
    /funcion 038 insegura/);
});

test('evidencia final detecta conciliación Gobierno, SoD y overrides alterados', () => {
  const missingGovernment = syntheticEvidence();
  missingGovernment.functions.find((item) =>
    item.signature === PAYROLL_MONTHLY_CLOSE_SIGNATURES.prepare)
    .sourceBody = 'sin conciliacion Gobierno';
  assert.throws(() => validatePayrollMonthlyCloseEvidence(missingGovernment),
    /preparacion 038 no contiene/);
  assert.throws(() => validatePayrollMonthlyCloseEvidence(syntheticEvidence({
    conflicts: [],
  })), /conflictos SoD 038/);
  assert.throws(() => validatePayrollMonthlyCloseEvidence(syntheticEvidence({
    overrideCount: 1,
  })), /overrides 038/);
});

test('applier exige 037 exacta, ledger, lock, verificación final y rollback', () => {
  for (const token of [
    '037-payroll-control-import-lock-semantics',
    'payrollControlImportLockSemanticsFingerprint',
    'schema_migrations',
    'pg_advisory_xact_lock',
    'verifyNoUnledgeredState',
    'verifyPayrollMonthlyCloseFinalState',
    "await client.query('BEGIN')",
    "await client.query('COMMIT')",
    "await client.query('ROLLBACK')",
  ]) assert.ok(applier.includes(token), `falta ${token}`);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
  assert.doesNotMatch(applier, /process\.env\.(?:PASSWORD|PGPASSWORD)/);
});

test('package Vercel conserva endpoint, applier y migración 038', () => {
  const packageJson = JSON.parse(packageSource);
  const vercel = JSON.parse(vercelSource);
  assert.equal(packageJson.scripts['db:payroll:monthly-close:schema'],
    'node --env-file=.env.local scripts/apply-governed-monthly-close-schema.mjs --confirm-isolated-branch');
  assert.match(ignore, /!scripts\/migrations\/038-governed-monthly-close-run\.sql/);
  assert.match(ignore, /!scripts\/apply-governed-monthly-close-schema\.mjs/);
  assert.deepEqual(vercel.functions['api/internal-payroll-monthly-close.js'], {
    maxDuration: 20,
  });
});
