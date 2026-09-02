import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ATTENDANCE_EVALUATION_EXPECTED_COLUMNS,
  ATTENDANCE_EVALUATION_EXPECTED_CONSTRAINTS,
  ATTENDANCE_EVALUATION_EXPECTED_INDEXES,
  ATTENDANCE_EVALUATION_FOREIGN_KEY_TOKENS,
  ATTENDANCE_EVALUATION_CHECK_TOKENS,
  ATTENDANCE_EVALUATION_INDEX_TOKENS,
  ATTENDANCE_EVALUATION_EXPECTED_TRIGGERS,
  ATTENDANCE_EVALUATION_FUNCTION_SOURCE_HASHES,
  ATTENDANCE_EVALUATION_FUNCTIONS,
  ATTENDANCE_EVALUATION_MIGRATION_VERSION,
  ATTENDANCE_EVALUATION_PAYROLL_TABLES,
  ATTENDANCE_EVALUATION_REQUIRED_CONFLICTS,
  ATTENDANCE_EVALUATION_ROLE_MATRIX,
  ATTENDANCE_EVALUATION_TABLES,
  attendanceEvaluationFingerprint,
  attendanceEvaluationExpectedColumnContract,
  resolveAttendanceEvaluationTarget,
  verifyAttendanceEvaluationConnectedTarget,
  validateAttendanceEvaluationEvidence,
  validateAttendanceEvaluationMigrationSql,
} from '../scripts/apply-governed-monthly-attendance-evaluation-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const [migration, applier, packageSource] = await Promise.all([
  readFile(new URL('../scripts/migrations/024-governed-monthly-attendance-evaluation.sql',
    import.meta.url), 'utf8'),
  readFile(new URL('../scripts/apply-governed-monthly-attendance-evaluation-schema.mjs',
    import.meta.url), 'utf8'),
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
]);

function syntheticEvidence(overrides = {}) {
  const ownerName = 'neondb_owner';
  const constraintDefinition = (name) => {
    if (ATTENDANCE_EVALUATION_FOREIGN_KEY_TOKENS[name]) {
      return ATTENDANCE_EVALUATION_FOREIGN_KEY_TOKENS[name].join(' ');
    }
    if (ATTENDANCE_EVALUATION_CHECK_TOKENS[name]) {
      return `CHECK (${ATTENDANCE_EVALUATION_CHECK_TOKENS[name].join(' ')})`;
    }
    return name.endsWith('_fk') ? 'FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id)'
      : name.endsWith('_pkey') ? 'PRIMARY KEY (id)'
        : name.endsWith('_uk') ? 'UNIQUE (id)' : 'CHECK (true)';
  };
  return {
    currentUser: ownerName,
    tables: ATTENDANCE_EVALUATION_TABLES.map((tableName) => ({
      tableName, ownerIsRuntime: false, publicPrivileges: false,
      runtimePrivileges: false, hasTenantId: true, tenantIdNotNull: true, ownerName,
    })),
    columns: Object.entries(ATTENDANCE_EVALUATION_EXPECTED_COLUMNS).flatMap(
      ([tableName, columns]) => columns.map((columnName) => ({
        tableName, columnName,
        ...attendanceEvaluationExpectedColumnContract(tableName, columnName),
      })),
    ),
    constraints: ATTENDANCE_EVALUATION_EXPECTED_CONSTRAINTS.map((name) => ({
      name, type: name.endsWith('_fk') ? 'f' : name.endsWith('_pkey') ? 'p'
        : name.endsWith('_uk') ? 'u' : 'c',
      validated: true, deferrable: false, definition: constraintDefinition(name),
    })),
    indexes: ATTENDANCE_EVALUATION_EXPECTED_INDEXES.map((name) => ({
      name, valid: true, ready: true,
      definition: `CREATE INDEX ${name} ${ATTENDANCE_EVALUATION_INDEX_TOKENS[name].join(' ')}`,
    })),
    payroll: ATTENDANCE_EVALUATION_PAYROLL_TABLES.map((tableName) => ({
      tableName, notNull: true, defaultValue: 'false', blockedByCheck: true,
    })),
    functions: ATTENDANCE_EVALUATION_FUNCTIONS.map((signature) => ({
      signature, securityDefiner: true, ownerIsRuntime: false,
      ownerName,
      publicExecuteRevoked: true, runtimeExecuteRevoked: true,
      config: ['search_path=public, pg_temp'],
      sourceHash: ATTENDANCE_EVALUATION_FUNCTION_SOURCE_HASHES[signature],
    })),
    triggers: Object.entries(ATTENDANCE_EVALUATION_EXPECTED_TRIGGERS)
      .map(([name, contract]) => ({
        name, ...contract, enabled: 'O', rowLevel: true, unconditional: true,
      })),
    nonOwnerAcl: [],
    roles: Object.entries(ATTENDANCE_EVALUATION_ROLE_MATRIX)
      .map(([roleKey, capabilities]) => ({ roleKey, capabilities: [...capabilities] })),
    requiredConflicts: ATTENDANCE_EVALUATION_REQUIRED_CONFLICTS.map((key) => ({ key })),
    conflicts: [],
    ...overrides,
  };
}

test('aplicador 024 valida contrato y fingerprint sin conectarse', () => {
  assert.equal(ATTENDANCE_EVALUATION_MIGRATION_VERSION,
    '024-governed-monthly-attendance-evaluation');
  assert.equal(validateAttendanceEvaluationMigrationSql(migration), true);
  assert.match(attendanceEvaluationFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.ok(splitPostgresStatements(migration).length >= 40);
});

test('validador rechaza revalidar un rechazo o desligar la fuente del binding certificado', () => {
  assert.throws(() => validateAttendanceEvaluationMigrationSql(migration.replace(
    "NEW.status IN ('submitted','approved')",
    "NEW.status IN ('submitted','approved','rejected')",
  )), /migracion 024 no contiene/);
  assert.throws(() => validateAttendanceEvaluationMigrationSql(migration.replace(
    'policy.certified_source_binding_id = run_row.certified_binding_id',
    'policy.certified_source_binding_id IS NOT NULL',
  )), /migracion 024 no contiene/);
});

test('preflight exige rama aislada y URL directa', () => {
  const env = {
    DATABASE_URL_UNPOOLED: 'postgresql://user:password@ep-isolated.us-east-2.aws.neon.tech/municipio?sslmode=require',
    NODE_ENV: 'test',
    ATTENDANCE_EVALUATION_EXPECTED_NEON_BRANCH_ID: 'br-isolated',
    ATTENDANCE_EVALUATION_EXPECTED_NEON_PROJECT_ID: 'project-isolated',
    ATTENDANCE_EVALUATION_EXPECTED_NEON_HOST: 'ep-isolated.us-east-2.aws.neon.tech',
    ATTENDANCE_EVALUATION_EXPECTED_DATABASE: 'municipio',
  };
  assert.throws(() => resolveAttendanceEvaluationTarget([], env),
    /confirm-isolated-branch/);
  assert.equal(resolveAttendanceEvaluationTarget(['--confirm-isolated-branch'], env).mode,
    'isolated');
  assert.throws(() => resolveAttendanceEvaluationTarget(['--confirm-isolated-branch'], {
    ...env,
    DATABASE_URL_UNPOOLED:
      'postgresql://user:password@ep-isolated-pooler.us-east-2.aws.neon.tech/municipio?sslmode=require',
  }), /endpoint pooled/);
  assert.throws(() => resolveAttendanceEvaluationTarget([
    '--confirm-isolated-branch', '--expected-neon-branch-id=br-other',
  ], env), /no coincide entre CLI y entorno/);
});

test('post-connect compara branch, project, endpoint y base informados por Neon', async () => {
  const target = resolveAttendanceEvaluationTarget(['--confirm-isolated-branch'], {
    DATABASE_URL_UNPOOLED:
      'postgresql://user:password@ep-isolated.us-east-2.aws.neon.tech/municipio?sslmode=require',
    NODE_ENV: 'test',
    ATTENDANCE_EVALUATION_EXPECTED_NEON_BRANCH_ID: 'br-isolated',
    ATTENDANCE_EVALUATION_EXPECTED_NEON_PROJECT_ID: 'project-isolated',
    ATTENDANCE_EVALUATION_EXPECTED_NEON_HOST: 'ep-isolated.us-east-2.aws.neon.tech',
    ATTENDANCE_EVALUATION_EXPECTED_DATABASE: 'municipio',
  });
  const goodClient = { query: async () => ({ rows: [{
    branchId: 'br-isolated', projectId: 'project-isolated',
    endpointId: 'ep-isolated', database: 'municipio',
  }] }) };
  assert.equal(await verifyAttendanceEvaluationConnectedTarget(goodClient, target), true);
  await assert.rejects(() => verifyAttendanceEvaluationConnectedTarget({
    query: async () => ({ rows: [{ ...goodClient.query.rows, branchId: 'br-wrong' }] }),
  }, target), /conexion efectiva/);
});

test('aplicador verifica prerequisitos exactos, lock, ledger, fresh y reapply', () => {
  for (const version of [
    '011-versioned-time-catalog',
    '022-attendance-device-gateway',
    '023-time-source-unlinked-reader',
  ]) assert.match(applier, new RegExp(version));
  assert.match(applier, /await client\.query\('BEGIN'\)/);
  assert.match(applier, /pg_advisory_xact_lock/);
  assert.match(applier, /SELECT checksum_sha256 FROM schema_migrations WHERE version = \$1/);
  assert.match(applier, /INSERT INTO schema_migrations \(version, checksum_sha256\)/);
  assert.match(applier, /verifyNoUnledgeredObjects/);
  assert.match(applier, /verifyAttendanceEvaluationFinalState/);
  assert.match(applier, /await client\.query\('COMMIT'\)/);
  assert.match(applier, /await client\.query\('ROLLBACK'\)/);
  assert.match(applier, /reapply verificado/);
  assert.match(applier, /fresh apply/);
});

test('evidencia final exige tablas privadas, triggers y payroll bloqueado', () => {
  assert.equal(validateAttendanceEvaluationEvidence(syntheticEvidence()), true);
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    tables: syntheticEvidence().tables.map((table) => table.tableName === 'attendance_evaluation_run'
      ? { ...table, runtimePrivileges: true } : table),
  })), /tabla insegura/);
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    payroll: syntheticEvidence().payroll.map((column) =>
      column.tableName === 'attendance_evaluation_result'
        ? { ...column, blockedByCheck: false } : column),
  })), /payroll no bloqueado/);
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    triggers: syntheticEvidence().triggers.filter((trigger) =>
      trigger.name !== 'attendance_evaluation_audit_append_only_v1'),
  })), /triggers 024 fuera de contrato/);
});

test('evidencia rechaza PII duplicada, drift funcional y ACL residual', () => {
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    columns: [...syntheticEvidence().columns,
      { tableName: 'attendance_evaluation_result', columnName: 'dni' }],
  })), /columnas 024.*fuera de contrato|duplica PII/);
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    functions: syntheticEvidence().functions.map((fn) =>
      fn.signature === ATTENDANCE_EVALUATION_FUNCTIONS[0]
        ? { ...fn, sourceHash: '0'.repeat(64) } : fn),
  })), /drift/);
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    nonOwnerAcl: [{ tableName: 'attendance_evaluation_run', grantee: 0 }],
  })), /ACL directa/);
});

test('reapply rechaza drift de columna, owner, FK, CHECK e indice aunque conserven nombres', () => {
  const baseline = syntheticEvidence();
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    columns: baseline.columns.map((column) =>
      column.tableName === 'attendance_evaluation_result'
        && column.columnName === 'source_event_count'
        ? { ...column, dataType: 'bigint' } : column),
  })), /columna con drift/);
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    tables: baseline.tables.map((table) => table.tableName === 'attendance_evaluation_run'
      ? { ...table, ownerName: 'otro_owner' } : table),
  })), /tabla insegura/);
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    constraints: baseline.constraints.map((constraint) =>
      constraint.name === 'attendance_evaluation_result_contract_fk'
        ? { ...constraint,
          definition: 'FOREIGN KEY (employment_contract_id) REFERENCES otra_tabla(id)' }
        : constraint),
  })), /FK attendance_evaluation_result_contract_fk/);
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    constraints: baseline.constraints.map((constraint) =>
      constraint.name === 'attendance_evaluation_source_count_ck'
        ? { ...constraint, definition: 'CHECK (true)' } : constraint),
  })), /constraint invalido/);
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    indexes: baseline.indexes.map((index) =>
      index.name === 'attendance_evaluation_run_tenant_period_idx'
        ? { ...index, definition: 'CREATE INDEX ON attendance_evaluation_run (tenant_id)' }
        : index),
  })), /indice attendance_evaluation_run_tenant_period_idx/);
});

test('reapply exige los pares SoD aunque no exista una coasignacion actual', () => {
  const baseline = syntheticEvidence();
  assert.throws(() => validateAttendanceEvaluationEvidence(syntheticEvidence({
    requiredConflicts: baseline.requiredConflicts.slice(1),
  })), /conflictos SoD requeridos 024/);
});

test('comando package es explícito y el aplicador no imprime secretos', () => {
  const packageJson = JSON.parse(packageSource);
  assert.equal(packageJson.scripts['db:attendance:evaluation:schema'],
    'node --env-file=.env.local scripts/apply-governed-monthly-attendance-evaluation-schema.mjs --confirm-isolated-branch');
  assert.doesNotMatch(applier, /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
  assert.doesNotMatch(applier, /process\.env\.(?:PASSWORD|PGPASSWORD)/);
});

test('el paquete Vercel conserva la migración 024 requerida por el aplicador', async () => {
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/024-governed-monthly-attendance-evaluation\.sql/);
});
