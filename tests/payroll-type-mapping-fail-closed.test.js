import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_TYPE_MAPPING_CANONICAL_TYPES,
  PAYROLL_TYPE_MAPPING_LEDGER_VERSION,
  PAYROLL_TYPE_MAPPING_MIGRATION_VERSION,
  PAYROLL_TYPE_MAPPING_VERIFICATION_MATRIX,
  payrollTypeMappingFingerprint,
  payrollTypeMappingLedgerFingerprint,
  resolvePayrollTypeMappingTarget,
  validatePayrollTypeMappingContract,
  validatePayrollTypeMappingEvidence,
  validatePayrollTypeMappingMigrationSql,
} from '../scripts/apply-payroll-type-mapping-fail-closed-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const contractSource = await readFile(new URL(
  '../contracts/grh-payroll-type-map.v1.json', import.meta.url,
), 'utf8');
const contract = JSON.parse(contractSource);
const migration = await readFile(new URL(
  '../scripts/migrations/032-payroll-type-mapping-fail-closed.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-payroll-type-mapping-fail-closed-schema.mjs', import.meta.url,
), 'utf8');
const workbench = await readFile(new URL(
  '../assets/payroll-novelty-workbench.js', import.meta.url,
), 'utf8');

function evidence(overrides = {}) {
  const ownerName = 'schema_owner';
  return {
    constraints: {
      issueCode: {
        validated: true,
        definition: "CHECK (issue_code IN ('duplicate_business_key','concept_not_observed','cost_center_not_observed','movement_type_not_observed','already_observed','existing_movement_conflict','legacy_payroll_type_unclassified'))",
      },
      issueField: {
        validated: true,
        definition: "CHECK (field_name IS NULL OR field_name IN ('legajo','conceptSourceId','costCenterSourceId','movementType','payrollType','quantityDecimal','amountCents'))",
      },
    },
    helper: {
      signature: 'public.payroll_type_canonical_v1(text,text)',
      definition: "CREATE FUNCTION public.payroll_type_canonical_v1(text,text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp AS $$ SELECT CASE WHEN lower(btrim(coalesce($2,''))) IN ('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN lower(btrim($2)) WHEN upper(btrim(coalesce($1,''))) = 'GRH' AND upper(btrim(coalesce($2,''))) = 'M' THEN 'monthly' ELSE NULL END $$",
      securityDefiner: false,
      ownedByCurrentUser: true,
      ownerName,
      ownerIsRuntime: false,
      publicExecuteRevoked: true,
      runtimeCanExecute: false,
      volatility: 'i',
      parallelSafety: 's',
      config: ['search_path=public, pg_temp'],
      aclEntries: [{
        grantee: ownerName,
        grantor: ownerName,
        privilege: 'EXECUTE',
        grantable: false,
      }],
    },
    prepare: {
      signature: 'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)',
      definition: 'payroll_type_canonical_v1 payroll_type_canonical_v1 payroll_type_canonical_v1 legacy_payroll_type_unclassified versioned_payroll_type_mapping_required',
      securityDefiner: true,
      ownedByCurrentUser: true,
      ownerName,
      ownerIsRuntime: false,
      publicExecuteRevoked: true,
      runtimeCanExecute: true,
      config: ['search_path=public, pg_temp'],
      aclEntries: [
        {
          grantee: ownerName,
          grantor: ownerName,
          privilege: 'EXECUTE',
          grantable: false,
        },
        {
          grantee: 'municontrol_actions_runtime_app',
          grantor: ownerName,
          privilege: 'EXECUTE',
          grantable: false,
        },
      ],
    },
    mappingMatrix: PAYROLL_TYPE_MAPPING_VERIFICATION_MATRIX.map((item, index) => ({
      ordinal: index + 1,
      sourceSystem: item.sourceSystem,
      sourceCode: item.sourceCode,
      actual: item.expected,
    })),
    ...overrides,
  };
}

test('contrato GRH sólo homologa M como mensual y deja cinco códigos sin clasificar', () => {
  assert.equal(validatePayrollTypeMappingContract(contract), true);
  assert.deepEqual(contract.verifiedMappings.map((item) => (
    [item.sourceCode, item.canonicalType]
  )), [['M', 'monthly']]);
  assert.deepEqual(contract.unclassifiedSourceCodes, ['P', 'S', 'V', 'O', 'F']);
  assert.match(contract.policy.prohibited, /Do not infer/);
  assert.equal(contract.ledger.version, PAYROLL_TYPE_MAPPING_LEDGER_VERSION);
});

test('contrato rechaza códigos duplicados, aun si el primer mapeo parece válido', () => {
  const duplicateMapping = structuredClone(contract);
  duplicateMapping.verifiedMappings.push(structuredClone(
    duplicateMapping.verifiedMappings[0],
  ));
  assert.throws(() => validatePayrollTypeMappingContract(duplicateMapping),
    /mapeos GRH sin evidencia exacta/);

  const overlap = structuredClone(contract);
  overlap.unclassifiedSourceCodes.push('M');
  assert.throws(() => validatePayrollTypeMappingContract(overlap),
    /codigos GRH no clasificados/);
});

test('migración 032 normaliza evidencia verificada y bloquea códigos legacy ambiguos', () => {
  assert.equal(PAYROLL_TYPE_MAPPING_MIGRATION_VERSION,
    '032-payroll-type-mapping-fail-closed');
  assert.equal(validatePayrollTypeMappingMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 14);
  assert.match(payrollTypeMappingFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.match(migration, /= 'M' THEN 'monthly'/);
  assert.match(migration, /legacy_payroll_type_unclassified/);
  assert.match(migration, /is_blocking, field_name/);
  assert.match(migration, /'error', true, 'payrollType'/);
  assert.match(migration, /public\.payroll_type_canonical_v1\([\s\S]*\) IS NULL/);
});

test('matriz dinámica exige M→monthly y P/S/V/O/F/desconocidos→NULL', () => {
  for (const unsupported of ['P', 'S', 'V', 'O', 'F']) {
    assert.doesNotMatch(migration,
      new RegExp(`= '${unsupported}'(?:\\s+THEN|\\s*,)`));
  }
  assert.deepEqual(PAYROLL_TYPE_MAPPING_VERIFICATION_MATRIX.slice(0, 9), [
    { sourceSystem: 'GRH', sourceCode: 'M', expected: 'monthly' },
    { sourceSystem: 'GRH', sourceCode: 'P', expected: null },
    { sourceSystem: 'GRH', sourceCode: 'S', expected: null },
    { sourceSystem: 'GRH', sourceCode: 'V', expected: null },
    { sourceSystem: 'GRH', sourceCode: 'O', expected: null },
    { sourceSystem: 'GRH', sourceCode: 'F', expected: null },
    { sourceSystem: 'GRH', sourceCode: 'X', expected: null },
    { sourceSystem: 'GRH', sourceCode: null, expected: null },
    { sourceSystem: 'OTHER', sourceCode: 'M', expected: null },
  ]);

  const inventedMapping = evidence();
  inventedMapping.mappingMatrix[2].actual = 'sac';
  assert.throws(() => validatePayrollTypeMappingEvidence(inventedMapping),
    /matriz canonica 032 divergente en caso 3/);
});

test('parche exige exactamente dos comparaciones clasificadas y un guard ambiguo', () => {
  assert.match(migration,
    /payroll_type_canonical_v1\(equal_movement\.source_system, equal_movement\.payroll_type\)/);
  assert.match(migration,
    /payroll_type_canonical_v1\(movement\.source_system, movement\.payroll_type\)/);
  assert.match(migration,
    /payroll_type_canonical_v1\([\s\S]*unresolved_movement\.source_system,[\s\S]*unresolved_movement\.payroll_type[\s\S]*\) IS NULL/);
  assert.match(migration, /equal_count <> 1 OR conflict_count <> 1 OR anchor_count <> 1/);
  assert.match(migration, /PAYROLL_TYPE_MAPPING_FUNCTION_DRIFT/);
});

test('validador de evidencia rechaza constraints o función degradados', () => {
  assert.equal(validatePayrollTypeMappingEvidence(evidence()), true);

  const missingIssue = evidence();
  missingIssue.constraints.issueCode.definition = missingIssue.constraints.issueCode.definition
    .replace(",'legacy_payroll_type_unclassified'", '');
  assert.throws(() => validatePayrollTypeMappingEvidence(missingIssue),
    /codigos de issue/);

  const unsafeHelper = evidence();
  unsafeHelper.helper.publicExecuteRevoked = false;
  assert.throws(() => validatePayrollTypeMappingEvidence(unsafeHelper),
    /helper canonico/);

  const incompletePrepare = evidence();
  incompletePrepare.prepare.definition = incompletePrepare.prepare.definition
    .replace('legacy_payroll_type_unclassified', 'legacy_type_warning');
  assert.throws(() => validatePayrollTypeMappingEvidence(incompletePrepare),
    /fachada prepare/);
});

test('ACL final es exacta: helper sólo owner; prepare sólo owner y runtime', () => {
  const runtimeHelper = evidence();
  runtimeHelper.helper.runtimeCanExecute = true;
  assert.throws(() => validatePayrollTypeMappingEvidence(runtimeHelper),
    /helper canonico 032/);

  const outsiderHelper = evidence();
  outsiderHelper.helper.aclEntries.push({
    grantee: 'unexpected_role',
    grantor: 'schema_owner',
    privilege: 'EXECUTE',
    grantable: false,
  });
  assert.throws(() => validatePayrollTypeMappingEvidence(outsiderHelper),
    /helper canonico 032 ACL/);

  const publicHelper = evidence();
  publicHelper.helper.aclEntries.push({
    grantee: 'PUBLIC',
    grantor: 'schema_owner',
    privilege: 'EXECUTE',
    grantable: false,
  });
  assert.throws(() => validatePayrollTypeMappingEvidence(publicHelper),
    /helper canonico 032 ACL/);

  const missingRuntime = evidence();
  missingRuntime.prepare.aclEntries = missingRuntime.prepare.aclEntries
    .filter((item) => item.grantee !== 'municontrol_actions_runtime_app');
  assert.throws(() => validatePayrollTypeMappingEvidence(missingRuntime),
    /fachada prepare 032 ACL/);

  const outsiderPrepare = evidence();
  outsiderPrepare.prepare.aclEntries.push({
    grantee: 'unexpected_role',
    grantor: 'schema_owner',
    privilege: 'EXECUTE',
    grantable: false,
  });
  assert.throws(() => validatePayrollTypeMappingEvidence(outsiderPrepare),
    /fachada prepare 032 ACL/);
});

test('ledger 032 fija conjuntamente los bytes de SQL y contrato JSON', () => {
  const checksum = payrollTypeMappingLedgerFingerprint(migration, contractSource);
  assert.match(checksum, /^[a-f0-9]{64}$/);
  assert.notEqual(checksum,
    payrollTypeMappingLedgerFingerprint(`${migration}\n`, contractSource));
  assert.notEqual(checksum,
    payrollTypeMappingLedgerFingerprint(migration, `${contractSource}\n`));
});

test('aplicador 032 es ledgered, transaccional, pinned y depende de 029', () => {
  for (const pattern of [
    /029-payroll-novelty-first-fortnight\.sql/,
    /payrollNoveltyFirstFortnightFingerprint/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredState\(client\)/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyPayrollTypeMappingFinalState\(client\)/,
    /CONTRACT_URL/,
    /JSON\.parse\(contractSource\)/,
    /validatePayrollTypeMappingContract\(contract\)/,
    /payrollTypeMappingLedgerFingerprint\(migration, contractSource\)/,
    /jsonb_to_recordset/,
    /PAYROLL_TYPE_MAPPING_VERIFICATION_MATRIX/,
    /aclexplode/,
    /aclEntries/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});

test('target 032 exige pines propios y distingue QA de Producción', () => {
  const host = 'ep-payroll-type.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    PAYROLL_TYPE_MAPPING_EXPECTED_NEON_BRANCH_ID: 'br-payroll-type',
    PAYROLL_TYPE_MAPPING_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    PAYROLL_TYPE_MAPPING_EXPECTED_NEON_HOST: host,
    PAYROLL_TYPE_MAPPING_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolvePayrollTypeMappingTarget(
    ['--confirm-isolated-branch'], base,
  ).mode, 'isolated');
  assert.equal(resolvePayrollTypeMappingTarget(
    ['--confirm-production-branch=br-payroll-type'], {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-payroll-type',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
});

test('los tipos canónicos del contrato coinciden con el circuito de novedades', () => {
  assert.deepEqual(PAYROLL_TYPE_MAPPING_CANONICAL_TYPES, [
    'monthly', 'first_fortnight', 'sac', 'vacation', 'supplementary', 'final', 'other',
  ]);
  assert.match(workbench,
    /legacy_payroll_type_unclassified: 'Tipo GRH pendiente de homologación'/);
  assert.match(workbench,
    /Pedí clasificar ese código antes de enviar la novedad/);
  assert.match(workbench, /issues\.map\(issueLabel\)/);
  assert.doesNotMatch(workbench, /JSON\.stringify\(issue\.details\)/);
});

test('package y despliegue incluyen el aplicador y SQL 032', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
  assert.equal(packageJson.scripts['db:payroll:type-mapping:schema'],
    'node --env-file=.env.local scripts/apply-payroll-type-mapping-fail-closed-schema.mjs --confirm-isolated-branch');
  const ignore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
  assert.match(ignore, /!scripts\/migrations\/032-payroll-type-mapping-fail-closed\.sql/);
});
