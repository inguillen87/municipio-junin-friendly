import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  EMPLOYEE_PAYROLL_HISTORY_CONSTRAINTS,
  EMPLOYEE_PAYROLL_HISTORY_INDEXES,
  EMPLOYEE_PAYROLL_HISTORY_MIGRATION_VERSION,
  EMPLOYEE_PAYROLL_HISTORY_SIGNATURES,
  employeePayrollHistoryFingerprint,
  resolveEmployeePayrollHistoryTarget,
  validateEmployeePayrollHistoryEvidence,
  validateEmployeePayrollHistoryMigrationSql,
} from '../scripts/apply-governed-employee-payroll-history-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/031-governed-employee-payroll-history.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-governed-employee-payroll-history-schema.mjs', import.meta.url,
), 'utf8');

const columnRows = [
  ['actor_membership_id', 'uuid', true, null],
  ['actor_session_id', 'uuid', true, null],
  ['event_sha256', 'character', true, 64],
  ['id', 'uuid', true, null],
  ['occurred_at', 'timestamp with time zone', true, null],
  ['outcome', 'character varying', true, 16],
  ['query_limit', 'smallint', true, null],
  ['query_page', 'integer', true, null],
  ['query_year', 'smallint', false, null],
  ['request_sha256', 'character', true, 64],
  ['result_count', 'integer', true, null],
  ['source_binding_id', 'uuid', true, null],
  ['target_contract_id', 'uuid', false, null],
  ['tenant_id', 'uuid', true, null],
].map(([name, dataType, notNull, characterMaximumLength]) => ({
  name, dataType, notNull, characterMaximumLength,
}));

const constraintDefinitions = {
  employee_payroll_read_event_pkey: 'PRIMARY KEY (id)',
  employee_payroll_read_event_tenant_fk:
    'FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id) ON DELETE RESTRICT',
  employee_payroll_read_event_binding_fk:
    'FOREIGN KEY (tenant_id, source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT',
  employee_payroll_read_event_membership_fk:
    'FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT',
  employee_payroll_read_event_session_fk:
    'FOREIGN KEY (actor_session_id) REFERENCES tenant_identity_session(id) ON DELETE RESTRICT',
  employee_payroll_read_event_contract_fk:
    'FOREIGN KEY (target_contract_id) REFERENCES employment_contract(id) ON DELETE RESTRICT',
  employee_payroll_read_event_request_hash_ck: 'CHECK (request_sha256 length 64)',
  employee_payroll_read_event_event_hash_ck: 'CHECK (event_sha256 length 64)',
  employee_payroll_read_event_year_ck: 'CHECK (query_year BETWEEN 1900 AND 2100)',
  employee_payroll_read_event_page_ck: 'CHECK (query_page BETWEEN 1 AND 10000)',
  employee_payroll_read_event_limit_ck: 'CHECK (query_limit BETWEEN 1 AND 24)',
  employee_payroll_read_event_count_ck: 'CHECK (result_count BETWEEN 0 AND 24)',
  employee_payroll_read_event_outcome_ck: "CHECK (outcome IN ('success','not_found'))",
};

function evidence() {
  return {
    table: {
      name: 'employee_payroll_read_event',
      ownedByCurrentUser: true,
      ownerIsRuntime: false,
      publicPrivileges: false,
      runtimeCanSelect: false,
      runtimeCanInsert: false,
      runtimeAnyPrivileges: false,
      nonOwnerPrivilegeGrantees: [],
    },
    columns: columnRows.map((item) => ({ ...item })),
    constraints: Object.entries(EMPLOYEE_PAYROLL_HISTORY_CONSTRAINTS)
      .map(([name, type]) => ({
        name, type, validated: true, definition: constraintDefinitions[name],
      })),
    indexes: EMPLOYEE_PAYROLL_HISTORY_INDEXES.map((name) => ({
      name,
      valid: true,
      ready: true,
      unique: false,
      hasPredicate: false,
      definition: name.includes('actor')
        ? 'CREATE INDEX ON public.employee_payroll_read_event (tenant_id, actor_membership_id, occurred_at DESC, id)'
        : 'CREATE INDEX ON public.employee_payroll_read_event (tenant_id, occurred_at DESC, id)',
    })),
    functions: [
      {
        signature: EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.appendOnly,
        securityDefiner: true,
        ownedByCurrentUser: true,
        ownerIsRuntime: false,
        volatility: 'v',
        config: ['search_path=public, pg_temp'],
        publicExecuteRevoked: true,
        runtimeCanExecute: false,
        runtimeExecuteGrantable: false,
        nonOwnerExecuteGrantees: [],
        sourceBody: "RAISE EXCEPTION 'EMPLOYEE_PAYROLL_READ_APPEND_ONLY'",
      },
      {
        signature: EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.history,
        securityDefiner: true,
        ownedByCurrentUser: true,
        ownerIsRuntime: false,
        volatility: 'v',
        config: ['search_path=public, pg_temp'],
        publicExecuteRevoked: true,
        runtimeCanExecute: true,
        runtimeExecuteGrantable: false,
        nonOwnerExecuteGrantees: ['municontrol_actions_runtime_app'],
        sourceBody: `action_center_assert_tenant_read_session_v2
          action_center_context_has_capability(context_value, 'workforce.employee.read')
          action_center_context_has_capability(context_value, 'payroll.read')
          batch.source_database = context_value->>'sourceDatabase'
          contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint
          INSERT INTO employee_payroll_read_event`,
      },
    ],
    trigger: {
      name: 'employee_payroll_read_append_only_v1',
      enabled: 'O',
      functionSignature: EMPLOYEE_PAYROLL_HISTORY_SIGNATURES.appendOnly,
      definition: 'CREATE TRIGGER employee_payroll_read_append_only_v1 BEFORE DELETE OR UPDATE ON public.employee_payroll_read_event FOR EACH ROW EXECUTE FUNCTION employee_payroll_read_reject_change_v1()',
    },
  };
}

test('031 crea historial salarial execute-only con auditoria sin PII ni importes', () => {
  assert.equal(EMPLOYEE_PAYROLL_HISTORY_MIGRATION_VERSION,
    '031-governed-employee-payroll-history');
  assert.equal(validateEmployeePayrollHistoryMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 15);
  assert.match(employeePayrollHistoryFingerprint(migration), /^[a-f0-9]{64}$/);
  const auditTable = migration.slice(
    migration.indexOf('CREATE TABLE IF NOT EXISTS employee_payroll_read_event'),
    migration.indexOf('\n);', migration.indexOf(
      'CREATE TABLE IF NOT EXISTS employee_payroll_read_event',
    )),
  );
  assert.doesNotMatch(auditTable,
    /\b(?:email|legajo|dni|cuil|documento|importe|amount|salary|net_payable)\b/i);
  assert.doesNotMatch(migration,
    /\bGRANT\b[\s\S]{0,120}\b(?:TABLE\s+)?employee_payroll_read_event\b/i);
});

test('estado final 031 exige owner, ACL, funciones, FKs, CHECKs, indices y trigger exactos', () => {
  assert.equal(validateEmployeePayrollHistoryEvidence(evidence()), true);

  const directRead = evidence();
  directRead.table.runtimeCanSelect = true;
  assert.throws(() => validateEmployeePayrollHistoryEvidence(directRead), /ACL inseguros/);

  const extraGrant = evidence();
  extraGrant.functions[1].nonOwnerExecuteGrantees.push('report_reader');
  assert.throws(() => validateEmployeePayrollHistoryEvidence(extraGrant), /allowlist execute-only/);

  const runtimeOwner = evidence();
  runtimeOwner.functions[1].ownerIsRuntime = true;
  assert.throws(() => validateEmployeePayrollHistoryEvidence(runtimeOwner), /funcion 031 insegura/);

  const mutableAudit = evidence();
  mutableAudit.trigger.definition = mutableAudit.trigger.definition.replace('DELETE', 'INSERT');
  assert.throws(() => validateEmployeePayrollHistoryEvidence(mutableAudit), /trigger append-only/);

  const missingFk = evidence();
  missingFk.constraints = missingFk.constraints.filter((item) => (
    item.name !== 'employee_payroll_read_event_binding_fk'
  ));
  assert.throws(() => validateEmployeePayrollHistoryEvidence(missingFk), /constraints 031/);
});

test('aplicador 031 es ledgered, transaccional, pinned y depende de 002 y 007', () => {
  for (const pattern of [
    /002-canonical-integration\.sql/,
    /007-action-center-read-facades\.sql/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredState\(client\)/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyEmployeePayrollHistoryFinalState\(client\)/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});

test('target 031 exige pines propios y distingue QA de Produccion', () => {
  const host = 'ep-employee-payroll.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    EMPLOYEE_PAYROLL_HISTORY_EXPECTED_NEON_BRANCH_ID: 'br-employee-payroll',
    EMPLOYEE_PAYROLL_HISTORY_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    EMPLOYEE_PAYROLL_HISTORY_EXPECTED_NEON_HOST: host,
    EMPLOYEE_PAYROLL_HISTORY_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolveEmployeePayrollHistoryTarget(
    ['--confirm-isolated-branch'], base,
  ).mode, 'isolated');
  assert.equal(resolveEmployeePayrollHistoryTarget(
    ['--confirm-production-branch=br-employee-payroll'], {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-employee-payroll',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
  assert.throws(() => resolveEmployeePayrollHistoryTarget(
    ['--confirm-isolated-branch'], { ...base, EMPLOYEE_PAYROLL_HISTORY_EXPECTED_NEON_HOST:
      'ep-other.sa-east-1.aws.neon.tech' },
  ), /no coincide/);
});

test('package y despliegue incluyen aplicador y SQL 031', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:employee-history:schema'],
    'node --env-file=.env.local scripts/apply-governed-employee-payroll-history-schema.mjs --confirm-isolated-branch');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/031-governed-employee-payroll-history\.sql/);
});
