import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION,
  payrollNoveltyFirstFortnightFingerprint,
} from './apply-payroll-novelty-first-fortnight-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const PAYROLL_TYPE_MAPPING_MIGRATION_VERSION =
  '032-payroll-type-mapping-fail-closed';
export const PAYROLL_TYPE_MAPPING_CANONICAL_TYPES = Object.freeze([
  'monthly',
  'first_fortnight',
  'sac',
  'vacation',
  'supplementary',
  'final',
  'other',
]);
export const PAYROLL_TYPE_MAPPING_VERIFIED_GRH = Object.freeze({ M: 'monthly' });
export const PAYROLL_TYPE_MAPPING_LEDGER_VERSION =
  'payroll-type-mapping-ledger.v1';
export const PAYROLL_TYPE_MAPPING_VERIFICATION_MATRIX = Object.freeze([
  Object.freeze({ sourceSystem: 'GRH', sourceCode: 'M', expected: 'monthly' }),
  ...['P', 'S', 'V', 'O', 'F'].map((sourceCode) => Object.freeze({
    sourceSystem: 'GRH', sourceCode, expected: null,
  })),
  Object.freeze({ sourceSystem: 'GRH', sourceCode: 'X', expected: null }),
  Object.freeze({ sourceSystem: 'GRH', sourceCode: null, expected: null }),
  Object.freeze({ sourceSystem: 'OTHER', sourceCode: 'M', expected: null }),
  ...PAYROLL_TYPE_MAPPING_CANONICAL_TYPES.map((sourceCode) => Object.freeze({
    sourceSystem: 'GRH', sourceCode, expected: sourceCode,
  })),
]);

const MIGRATION_URL = new URL(
  './migrations/032-payroll-type-mapping-fail-closed.sql', import.meta.url,
);
const CONTRACT_URL = new URL(
  '../contracts/grh-payroll-type-map.v1.json', import.meta.url,
);
const PREREQUISITE_URL = new URL(
  './migrations/029-payroll-novelty-first-fortnight.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const PREPARE_SIGNATURE =
  'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)';
const HELPER_SIGNATURE = 'public.payroll_type_canonical_v1(text,text)';
const EXPECTED_ISSUE_CODES = Object.freeze([
  'duplicate_business_key',
  'concept_not_observed',
  'cost_center_not_observed',
  'movement_type_not_observed',
  'already_observed',
  'existing_movement_conflict',
  'legacy_payroll_type_unclassified',
]);
const EXPECTED_ISSUE_FIELDS = Object.freeze([
  'legajo',
  'conceptSourceId',
  'costCenterSourceId',
  'movementType',
  'payrollType',
  'quantityDecimal',
  'amountCents',
]);

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (got.length !== (actual || []).length
      || JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function quotedValues(definition) {
  return [...String(definition || '').matchAll(/'([A-Za-z][A-Za-z0-9_]*)'/g)]
    .map((match) => match[1]);
}

export function payrollTypeMappingFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function payrollTypeMappingLedgerFingerprint(migration, contractSource) {
  const migrationHash = payrollTypeMappingFingerprint(migration);
  const contractHash = payrollTypeMappingFingerprint(contractSource);
  return payrollTypeMappingFingerprint(
    `${PAYROLL_TYPE_MAPPING_LEDGER_VERSION}\n${migrationHash}\n${contractHash}`,
  );
}

export function validatePayrollTypeMappingContract(contract) {
  if (contract?.contractVersion !== 'grh-payroll-type-map.v1'
      || contract?.sourceSystem !== 'GRH'
      || contract?.sourceField !== 'TIPO_31') {
    throw new Error('contrato de tipos GRH fuera de version');
  }
  exactSet(contract.canonicalTypes, PAYROLL_TYPE_MAPPING_CANONICAL_TYPES,
    'tipos canonicos');
  const mappings = Array.isArray(contract.verifiedMappings)
    ? contract.verifiedMappings : [];
  const mappingCodes = mappings.map((item) => item?.sourceCode);
  if (mappingCodes.some((code) => typeof code !== 'string')
      || new Set(mappingCodes).size !== mappingCodes.length
      || mappings.length !== 1
      || mappings[0]?.sourceCode !== 'M'
      || mappings[0]?.canonicalType !== 'monthly'
      || mappings[0]?.evidence?.kind !== 'observed_ui_label'
      || mappings[0]?.evidence?.label !== 'M - Mensuales'
      || mappings[0]?.evidence?.surface !== 'GRH_WEB - Cierre de liquidacion'
      || !/^20\d{2}-\d{2}-\d{2}$/.test(mappings[0]?.evidence?.observedOn || '')) {
    throw new Error('mapeos GRH sin evidencia exacta');
  }
  exactSet(contract.unclassifiedSourceCodes, ['P', 'S', 'V', 'O', 'F'],
    'codigos GRH no clasificados');
  if (contract.unclassifiedSourceCodes.some((code) => mappingCodes.includes(code))) {
    throw new Error('un codigo GRH no puede estar mapeado y no clasificado');
  }
  if (contract.ledger?.version !== PAYROLL_TYPE_MAPPING_LEDGER_VERSION
      || contract.ledger?.algorithm
        !== 'sha256(version + LF + sha256(sql-bytes) + LF + sha256(contract-bytes))'
      || contract.ledger?.table !== 'schema_migrations'
      || contract.ledger?.column !== 'checksum_sha256') {
    throw new Error('contrato de ledger 032 fuera de version');
  }
  if (contract.policy?.unknownResult !== null
      || contract.policy?.duplicateDetection
        !== 'block_when_same_contract_period_concept_cost_center_has_unclassified_source_type') {
    throw new Error('politica de desconocidos no es fail-closed');
  }
  return true;
}

export function validatePayrollTypeMappingMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    'public.payroll_type_canonical_v1',
    "= 'GRH'",
    "= 'M' THEN 'monthly'",
    'ELSE NULL',
    'legacy_payroll_type_unclassified',
    'versioned_payroll_type_mapping_required',
    'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)',
    'PAYROLL_TYPE_MAPPING_FUNCTION_DRIFT',
    'public.payroll_type_canonical_v1(equal_movement.source_system',
    'public.payroll_type_canonical_v1(movement.source_system',
    'public.payroll_type_canonical_v1(\n          unresolved_movement.source_system',
    "'payrollType'",
    'REVOKE ALL ON FUNCTION public.payroll_type_canonical_v1(text,text) FROM PUBLIC',
    'FROM municontrol_actions_runtime_app',
  ]) {
    if (!source.includes(token)) throw new Error(`migracion 032 no contiene ${token}`);
  }
  const issueInserts = source.match(
    /INSERT\s+INTO\s+public\.payroll_novelty_issue/gi,
  ) || [];
  if (issueInserts.length !== 1
      || /\b(?:UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\b/i.test(source)
      || /\bCREATE\s+TABLE\b/i.test(source)
      || /\bGRANT\b/i.test(source)) {
    throw new Error('migracion 032 amplia mutaciones, tablas o privilegios');
  }
  if (splitPostgresStatements(source).length !== 14) {
    throw new Error('migracion 032 incompleta o no segmentable');
  }
  return true;
}

function validateFunctionAcl(fn, expectedGrantees, label) {
  const entries = Array.isArray(fn?.aclEntries) ? fn.aclEntries : [];
  const actualGrantees = entries.map((entry) => entry?.grantee);
  exactSet(actualGrantees, expectedGrantees, `${label} ACL`);
  if (entries.some((entry) => entry?.privilege !== 'EXECUTE'
      || entry?.grantable !== false
      || entry?.grantor !== fn.ownerName)) {
    throw new Error(`${label} ACL fuera de contrato`);
  }
}

function validateMappingMatrix(actualRows) {
  const actual = Array.isArray(actualRows) ? actualRows : [];
  if (actual.length !== PAYROLL_TYPE_MAPPING_VERIFICATION_MATRIX.length) {
    throw new Error('matriz canonica 032 incompleta');
  }
  for (const [index, expected] of PAYROLL_TYPE_MAPPING_VERIFICATION_MATRIX.entries()) {
    const item = actual[index] || {};
    if (Number(item.ordinal) !== index + 1
        || item.sourceSystem !== expected.sourceSystem
        || item.sourceCode !== expected.sourceCode
        || item.actual !== expected.expected) {
      throw new Error(`matriz canonica 032 divergente en caso ${index + 1}`);
    }
  }
}

export function validatePayrollTypeMappingEvidence(evidence) {
  const constraints = evidence?.constraints || {};
  exactSet(quotedValues(constraints.issueCode?.definition), EXPECTED_ISSUE_CODES,
    'codigos de issue 032');
  exactSet(quotedValues(constraints.issueField?.definition), EXPECTED_ISSUE_FIELDS,
    'campos de issue 032');
  if (constraints.issueCode?.validated !== true
      || constraints.issueField?.validated !== true) {
    throw new Error('constraints 032 no validados');
  }

  const helper = evidence?.helper || {};
  const helperDefinition = String(helper.definition || '');
  if (helper.signature !== HELPER_SIGNATURE
      || helper.securityDefiner !== false
      || helper.ownedByCurrentUser !== true
      || helper.ownerIsRuntime !== false
      || helper.publicExecuteRevoked !== true
      || helper.runtimeCanExecute !== false
      || helper.volatility !== 'i'
      || helper.parallelSafety !== 's'
      || JSON.stringify(helper.config || []) !== JSON.stringify(['search_path=public, pg_temp'])
      || !helperDefinition.includes("= 'M' THEN 'monthly'")
      || !helperDefinition.includes('ELSE NULL')) {
    throw new Error('helper canonico 032 inseguro o fuera de contrato');
  }
  validateFunctionAcl(helper, [helper.ownerName], 'helper canonico 032');
  validateMappingMatrix(evidence?.mappingMatrix);

  const prepare = evidence?.prepare || {};
  const prepareDefinition = String(prepare.definition || '');
  if (prepare.signature !== PREPARE_SIGNATURE
      || prepare.securityDefiner !== true
      || prepare.ownedByCurrentUser !== true
      || prepare.ownerIsRuntime !== false
      || prepare.publicExecuteRevoked !== true
      || prepare.runtimeCanExecute !== true
      || JSON.stringify(prepare.config || []) !== JSON.stringify(['search_path=public, pg_temp'])
      || !prepareDefinition.includes('legacy_payroll_type_unclassified')
      || !prepareDefinition.includes('versioned_payroll_type_mapping_required')
      || (prepareDefinition.match(/payroll_type_canonical_v1/g) || []).length !== 3) {
    throw new Error('fachada prepare 032 insegura o fuera de contrato');
  }
  validateFunctionAcl(prepare, [prepare.ownerName, RUNTIME_ROLE], 'fachada prepare 032');
  return true;
}

export function resolvePayrollTypeMappingTarget(argv = process.argv, env = process.env) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'PAYROLL_TYPE_MAPPING',
    targetLabel: '032',
  });
}

export async function verifyPayrollTypeMappingConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '032');
}

async function collectEvidence(client) {
  const constraintResult = await client.query(`
    SELECT conname AS name, pg_get_constraintdef(oid) AS definition,
      convalidated AS validated
    FROM pg_constraint
    WHERE conrelid = 'public.payroll_novelty_issue'::regclass
      AND conname IN ('payroll_novelty_issue_code_ck','payroll_novelty_issue_field_ck')
  `);
  const constraintMap = Object.fromEntries(rows(constraintResult)
    .map((item) => [item.name, item]));
  const functionResult = await client.query(`
    SELECT format('%I.%I(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      pg_get_functiondef(function_row.oid) AS definition,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner_row.rolname AS "ownerName",
      owner_row.rolname = $1 AS "ownerIsRuntime",
      COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
      function_row.provolatile AS volatility,
      function_row.proparallel AS "parallelSafety",
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked",
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS "runtimeCanExecute",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END,
          'grantor', grantor.rolname,
          'privilege', acl.privilege_type,
          'grantable', acl.is_grantable
        ) ORDER BY CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE grantee.rolname END)
        FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
        JOIN pg_roles grantor ON grantor.oid = acl.grantor
      ), '[]'::jsonb) AS "aclEntries"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner_row ON owner_row.oid = function_row.proowner
    WHERE function_row.oid IN ($2::regprocedure, $3::regprocedure)
  `, [RUNTIME_ROLE, HELPER_SIGNATURE, PREPARE_SIGNATURE]);
  const functionMap = Object.fromEntries(rows(functionResult)
    .map((item) => [item.signature, item]));
  const mappingMatrixResult = await client.query(`
    SELECT test_case.ordinal AS ordinal,
      test_case.source_system AS "sourceSystem",
      test_case.source_code AS "sourceCode",
      public.payroll_type_canonical_v1(
        test_case.source_system, test_case.source_code
      ) AS actual
    FROM jsonb_to_recordset($1::jsonb) AS test_case(
      ordinal integer, source_system text, source_code text
    )
    ORDER BY test_case.ordinal
  `, [JSON.stringify(PAYROLL_TYPE_MAPPING_VERIFICATION_MATRIX.map((item, index) => ({
    ordinal: index + 1,
    source_system: item.sourceSystem,
    source_code: item.sourceCode,
  })))]);
  return {
    constraints: {
      issueCode: constraintMap.payroll_novelty_issue_code_ck,
      issueField: constraintMap.payroll_novelty_issue_field_ck,
    },
    helper: functionMap[HELPER_SIGNATURE],
    prepare: functionMap[PREPARE_SIGNATURE],
    mappingMatrix: rows(mappingMatrixResult),
  };
}

export async function verifyPayrollTypeMappingFinalState(client) {
  return validatePayrollTypeMappingEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const source = await readFile(PREREQUISITE_URL, 'utf8');
  const expected = payrollNoveltyFirstFortnightFingerprint(source);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${PAYROLL_NOVELTY_FIRST_FORTNIGHT_MIGRATION_VERSION}`);
  }
}

async function verifyNoUnledgeredState(client) {
  const helper = await client.query(
    "SELECT to_regprocedure('public.payroll_type_canonical_v1(text,text)') AS oid",
  );
  const prepare = await client.query(
    "SELECT pg_get_functiondef('public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)'::regprocedure) AS definition",
  );
  const constraints = await client.query(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.payroll_novelty_issue'::regclass
      AND conname IN ('payroll_novelty_issue_code_ck','payroll_novelty_issue_field_ck')
  `);
  if (rows(helper)[0]?.oid
      || String(rows(prepare)[0]?.definition || '').includes('payroll_type_canonical_v1')
      || rows(constraints).some((item) => String(item.definition || '')
        .includes('legacy_payroll_type_unclassified'))) {
    throw new Error('estado 032 presente sin ledger');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  const contractSource = await readFile(CONTRACT_URL, 'utf8');
  let contract;
  try {
    contract = JSON.parse(contractSource);
  } catch (error) {
    throw new Error('contrato de tipos GRH no es JSON valido', { cause: error });
  }
  validatePayrollTypeMappingContract(contract);
  validatePayrollTypeMappingMigrationSql(migration);
  const checksum = payrollTypeMappingLedgerFingerprint(migration, contractSource);
  const statements = splitPostgresStatements(migration);
  const target = resolvePayrollTypeMappingTarget(process.argv.slice(2), process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyPayrollTypeMappingConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:payroll-type-mapping-032'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [PAYROLL_TYPE_MAPPING_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${PAYROLL_TYPE_MAPPING_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${PAYROLL_TYPE_MAPPING_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [PAYROLL_TYPE_MAPPING_MIGRATION_VERSION, checksum],
      );
    }
    await verifyPayrollTypeMappingFinalState(client);
    await client.query('COMMIT');
    console.log(`${PAYROLL_TYPE_MAPPING_MIGRATION_VERSION}: ${existing.rowCount
      ? 'ledger y estado final verificados' : 'fresh apply'} `
      + `(${target.mode}, SHA-256 ${checksum})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
