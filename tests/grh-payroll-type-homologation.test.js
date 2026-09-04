import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  GRH_PAYROLL_TYPE_CANONICAL_TYPES,
  GRH_PAYROLL_TYPE_HOMOLOGATION_LEDGER_VERSION,
  GRH_PAYROLL_TYPE_HOMOLOGATION_MIGRATION_VERSION,
  GRH_PAYROLL_TYPE_VERIFICATION_MATRIX,
  GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS,
  grhPayrollTypeHomologationLedgerFingerprint,
  resolveGrhPayrollTypeHomologationTarget,
  validateGrhPayrollTypeHomologationContract,
  validateGrhPayrollTypeHomologationEvidence,
  validateGrhPayrollTypeHomologationMigrationSql,
} from '../scripts/apply-grh-payroll-type-homologation-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const contractSource = await readFile(new URL(
  '../contracts/grh-payroll-type-map.v2.json', import.meta.url,
), 'utf8');
const contract = JSON.parse(contractSource);
const migration = await readFile(new URL(
  '../scripts/migrations/039-grh-payroll-type-homologation.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-grh-payroll-type-homologation-schema.mjs', import.meta.url,
), 'utf8');
const api = await readFile(new URL('../api/internal-data.js', import.meta.url), 'utf8');
const vercelIgnore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');

function sourceFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  const opening = source.indexOf('{', start);
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} quedó sin cierre`);
}

function apiPayrollTypeNormalizer() {
  const mappingFunction = sourceFunction(api, 'verifiedPayrollTypeMappings');
  const canonicalFunction = sourceFunction(api, 'employeePayrollCanonicalType');
  const context = { payrollTypeContract: structuredClone(contract) };
  vm.runInNewContext(`
    ${mappingFunction}
    const EMPLOYEE_PAYROLL_TYPE_CONTRACT = verifiedPayrollTypeMappings(payrollTypeContract);
    ${canonicalFunction}
    globalThis.normalize = employeePayrollCanonicalType;
  `, context, { filename: 'employee-payroll-type-contract-runtime.js' });
  return context.normalize;
}

function aclEntry(grantee, ownerName = 'schema_owner') {
  return {
    grantee,
    grantor: ownerName,
    privilege: 'EXECUTE',
    grantable: false,
  };
}

function evidence(overrides = {}) {
  const ownerName = 'schema_owner';
  const helperDefinition = `CREATE FUNCTION public.payroll_type_canonical_v1(text,text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=public,pg_temp
AS $$ SELECT CASE
WHEN 'F' THEN 'final'
WHEN 'M' THEN 'monthly'
WHEN 'O' THEN 'other'
WHEN 'P' THEN 'first_fortnight'
WHEN 'S' THEN 'sac'
WHEN 'V' THEN 'vacation'
ELSE NULL END $$`;
  const prepareDefinition = `CREATE FUNCTION public.payroll_novelty_prepare_v1(
jsonb,text,date,text,jsonb,uuid,text) RETURNS jsonb SECURITY DEFINER
SET search_path=public,pg_temp AS $$
SELECT payroll_type_canonical_v1('GRH','M');
SELECT payroll_type_canonical_v1('GRH','P');
SELECT payroll_type_canonical_v1('GRH','S');
-- legacy_payroll_type_unclassified versioned_payroll_type_mapping_required
$$`;
  const mappingMatrix = GRH_PAYROLL_TYPE_VERIFICATION_MATRIX.map((item, index) => ({
    ordinal: index + 1,
    sourceSystem: item.sourceSystem,
    sourceCode: item.sourceCode,
    actual: item.expected,
  }));
  return {
    helper: {
      signature: 'public.payroll_type_canonical_v1(text,text)',
      definition: helperDefinition,
      securityDefiner: false,
      ownedByCurrentUser: true,
      ownerName,
      ownerIsRuntime: false,
      config: ['search_path=public, pg_temp'],
      volatility: 'i',
      parallelSafety: 's',
      publicExecuteRevoked: true,
      runtimeCanExecute: false,
      aclEntries: [aclEntry(ownerName)],
    },
    prepare: {
      signature: 'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)',
      definition: prepareDefinition,
      securityDefiner: true,
      ownedByCurrentUser: true,
      ownerName,
      ownerIsRuntime: false,
      config: ['search_path=public, pg_temp'],
      publicExecuteRevoked: true,
      runtimeCanExecute: true,
      aclEntries: [aclEntry(ownerName), aclEntry('municontrol_actions_runtime_app')],
    },
    mappingMatrix,
    ...overrides,
  };
}

test('contrato v2 homologa los seis códigos TIPO_31 observados sin inferir futuros', () => {
  assert.equal(validateGrhPayrollTypeHomologationContract(contract), true);
  assert.equal(contract.contractVersion, 'grh-payroll-type-map.v2');
  assert.equal(contract.supersedes, 'grh-payroll-type-map.v1');
  assert.equal(contract.ledger.version, GRH_PAYROLL_TYPE_HOMOLOGATION_LEDGER_VERSION);
  assert.deepEqual(contract.unclassifiedSourceCodes, []);
  assert.deepEqual(
    Object.fromEntries(contract.verifiedMappings.map((mapping) => (
      [mapping.sourceCode, mapping.canonicalType]
    ))),
    GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS,
  );
  assert.deepEqual(GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS, {
    F: 'final',
    M: 'monthly',
    O: 'other',
    P: 'first_fortnight',
    S: 'sac',
    V: 'vacation',
  });
  assert.equal(contract.policy.unknownResult, null);
  assert.match(contract.policy.prohibited, /Do not infer future mappings/);
});

test('contrato v2 rechaza evidencia incompleta, duplicada o una semántica inventada', () => {
  const incomplete = structuredClone(contract);
  incomplete.verifiedMappings.pop();
  assert.throws(() => validateGrhPayrollTypeHomologationContract(incomplete),
    /códigos GRH homologados/);

  const duplicate = structuredClone(contract);
  duplicate.verifiedMappings[1].sourceCode = 'F';
  assert.throws(() => validateGrhPayrollTypeHomologationContract(duplicate),
    /códigos GRH homologados/);

  const supplementary = structuredClone(contract);
  supplementary.verifiedMappings.find((item) => item.sourceCode === 'O').canonicalType =
    'supplementary';
  assert.throws(() => validateGrhPayrollTypeHomologationContract(supplementary),
    /evidencia GRH v2 inválida para O/);
});

test('migración 039 conserva canonicals, homologa F M O P S V y deja desconocidos en NULL', () => {
  assert.equal(validateGrhPayrollTypeHomologationMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 8);
  for (const [sourceCode, canonicalType] of Object.entries(
    GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS,
  )) {
    assert.match(migration, new RegExp(
      `WHEN '${sourceCode}' THEN '${canonicalType}'`,
    ));
  }
  assert.match(migration, /ELSE NULL/);
  assert.doesNotMatch(migration, /WHEN 'O' THEN 'supplementary'/);
  assert.doesNotMatch(migration,
    /\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|GRANT)\b/i);
});

test('matriz 039 cubre homologados, trim/case, desconocidos y passthrough canónico', () => {
  assert.deepEqual(GRH_PAYROLL_TYPE_CANONICAL_TYPES, [
    'monthly', 'first_fortnight', 'sac', 'vacation',
    'supplementary', 'final', 'other',
  ]);
  assert.deepEqual(
    GRH_PAYROLL_TYPE_VERIFICATION_MATRIX.slice(0, 6).map((item) => item.sourceCode),
    ['F', 'M', 'O', 'P', 'S', 'V'],
  );
  assert.equal(GRH_PAYROLL_TYPE_VERIFICATION_MATRIX.some((item) => (
    item.sourceSystem === 'GRH' && item.sourceCode === 'X' && item.expected === null
  )), true);
  assert.equal(GRH_PAYROLL_TYPE_VERIFICATION_MATRIX.some((item) => (
    item.sourceSystem === 'OTHER' && item.sourceCode === 'M' && item.expected === null
  )), true);
  assert.equal(GRH_PAYROLL_TYPE_VERIFICATION_MATRIX.some((item) => (
    item.sourceSystem === 'GRH' && item.sourceCode === ' p '
      && item.expected === 'first_fortnight'
  )), true);
});

test('evidencia final exige matriz exacta y ACL fail-closed', () => {
  assert.equal(validateGrhPayrollTypeHomologationEvidence(evidence()), true);

  const invented = evidence();
  invented.mappingMatrix[2].actual = 'supplementary';
  assert.throws(() => validateGrhPayrollTypeHomologationEvidence(invented),
    /matriz canónica 039 divergente/);

  const runtimeHelper = evidence();
  runtimeHelper.helper.runtimeCanExecute = true;
  assert.throws(() => validateGrhPayrollTypeHomologationEvidence(runtimeHelper),
    /helper canónico 039/);

  const publicHelper = evidence();
  publicHelper.helper.aclEntries.push(aclEntry('PUBLIC'));
  assert.throws(() => validateGrhPayrollTypeHomologationEvidence(publicHelper),
    /helper canónico 039 ACL/);

  const missingRuntime = evidence();
  missingRuntime.prepare.aclEntries = missingRuntime.prepare.aclEntries
    .filter((item) => item.grantee !== 'municontrol_actions_runtime_app');
  assert.throws(() => validateGrhPayrollTypeHomologationEvidence(missingRuntime),
    /fachada prepare 039 ACL/);
});

test('ledger 039 fija conjuntamente bytes de SQL y contrato v2', () => {
  const checksum = grhPayrollTypeHomologationLedgerFingerprint(
    migration, contractSource,
  );
  assert.match(checksum, /^[a-f0-9]{64}$/);
  assert.notEqual(checksum, grhPayrollTypeHomologationLedgerFingerprint(
    `${migration}\n`, contractSource,
  ));
  assert.notEqual(checksum, grhPayrollTypeHomologationLedgerFingerprint(
    migration, `${contractSource}\n`,
  ));
});

test('aplicador 039 es transaccional, pinned, depende del ledger 032 y detecta drift', () => {
  assert.equal(GRH_PAYROLL_TYPE_HOMOLOGATION_MIGRATION_VERSION,
    '039-grh-payroll-type-homologation');
  for (const pattern of [
    /032-payroll-type-mapping-fail-closed\.sql/,
    /grh-payroll-type-map\.v1\.json/,
    /payrollTypeMappingLedgerFingerprint/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredState\(client\)/,
    /verifyPayrollTypeMappingFinalState\(client\)/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyGrhPayrollTypeHomologationFinalState\(client\)/,
    /grhPayrollTypeHomologationLedgerFingerprint/,
    /aclexplode/,
    /aclEntries/,
  ]) assert.match(applier, pattern);
  assert.doesNotMatch(applier,
    /console\.log\([^)]*(?:databaseUrl|DATABASE_URL|connectionString)/);
});

test('target 039 exige pines propios y distingue QA de Producción', () => {
  const host = 'ep-grh-type-homologation.sa-east-1.aws.neon.tech';
  const base = {
    DATABASE_URL_UNPOOLED: `postgresql://user:secret@${host}/municontrol`,
    GRH_PAYROLL_TYPE_HOMOLOGATION_EXPECTED_NEON_BRANCH_ID: 'br-grh-type-v2',
    GRH_PAYROLL_TYPE_HOMOLOGATION_EXPECTED_NEON_PROJECT_ID: 'junin-friendly',
    GRH_PAYROLL_TYPE_HOMOLOGATION_EXPECTED_NEON_HOST: host,
    GRH_PAYROLL_TYPE_HOMOLOGATION_EXPECTED_DATABASE: 'municontrol',
  };
  assert.equal(resolveGrhPayrollTypeHomologationTarget(
    ['--confirm-isolated-branch'], base,
  ).mode, 'isolated');
  assert.equal(resolveGrhPayrollTypeHomologationTarget(
    ['--confirm-production-branch=br-grh-type-v2'], {
      ...base,
      CANONICAL_PRODUCTION_BRANCH_ID: 'br-grh-type-v2',
      CANONICAL_PRODUCTION_HOST: host,
      CANONICAL_PRODUCTION_DATABASE: 'municontrol',
      VERCEL_ENV: 'production',
    },
  ).mode, 'production');
});

test('API de historial consume exclusivamente el contrato v2', () => {
  assert.match(api,
    /import payrollTypeContract from '\.\.\/contracts\/grh-payroll-type-map\.v2\.json'/);
  assert.match(api, /contractVersion !== 'grh-payroll-type-map\.v2'/);
  assert.doesNotMatch(api,
    /import payrollTypeContract from '\.\.\/contracts\/grh-payroll-type-map\.v1\.json'/);
});

test('API normaliza cada código observado y no adivina uno desconocido', () => {
  const normalize = apiPayrollTypeNormalizer();
  for (const [sourceCode, canonicalType] of Object.entries(
    GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS,
  )) {
    assert.equal(normalize(sourceCode), canonicalType, sourceCode);
    assert.equal(normalize(` ${sourceCode.toLowerCase()} `), canonicalType, sourceCode);
  }
  assert.equal(normalize('supplementary'), 'supplementary');
  assert.equal(normalize('X'), null);
  assert.equal(normalize(''), null);
  assert.equal(normalize(null), null);
});

test('el artefacto de Vercel conserva la migración 039 y el contrato v2', () => {
  assert.match(vercelIgnore,
    /!scripts\/migrations\/039-grh-payroll-type-homologation\.sql/);
  assert.doesNotMatch(vercelIgnore, /grh-payroll-type-map\.v2\.json/);
});
