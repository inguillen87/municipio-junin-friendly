import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  PAYROLL_TYPE_MAPPING_MIGRATION_VERSION,
  payrollTypeMappingLedgerFingerprint,
  verifyPayrollTypeMappingFinalState,
} from './apply-payroll-type-mapping-fail-closed-schema.mjs';
import {
  resolvePinnedNeonTarget,
  verifyPinnedNeonConnectedTarget,
} from './lib/pinned-neon-target.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const GRH_PAYROLL_TYPE_HOMOLOGATION_MIGRATION_VERSION =
  '039-grh-payroll-type-homologation';
export const GRH_PAYROLL_TYPE_HOMOLOGATION_LEDGER_VERSION =
  'payroll-type-mapping-ledger.v2';
export const GRH_PAYROLL_TYPE_CANONICAL_TYPES = Object.freeze([
  'monthly',
  'first_fortnight',
  'sac',
  'vacation',
  'supplementary',
  'final',
  'other',
]);
export const GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS = Object.freeze({
  F: 'final',
  M: 'monthly',
  O: 'other',
  P: 'first_fortnight',
  S: 'sac',
  V: 'vacation',
});
export const GRH_PAYROLL_TYPE_VERIFICATION_MATRIX = Object.freeze([
  ...Object.entries(GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS).map(
    ([sourceCode, expected]) => Object.freeze({
      sourceSystem: 'GRH', sourceCode, expected,
    }),
  ),
  Object.freeze({ sourceSystem: 'GRH', sourceCode: ' p ', expected: 'first_fortnight' }),
  Object.freeze({ sourceSystem: 'GRH', sourceCode: 'X', expected: null }),
  Object.freeze({ sourceSystem: 'GRH', sourceCode: null, expected: null }),
  Object.freeze({ sourceSystem: 'OTHER', sourceCode: 'M', expected: null }),
  ...GRH_PAYROLL_TYPE_CANONICAL_TYPES.map((sourceCode) => Object.freeze({
    sourceSystem: 'GRH', sourceCode, expected: sourceCode,
  })),
]);

const MIGRATION_URL = new URL(
  './migrations/039-grh-payroll-type-homologation.sql', import.meta.url,
);
const CONTRACT_URL = new URL(
  '../contracts/grh-payroll-type-map.v2.json', import.meta.url,
);
const PREREQUISITE_MIGRATION_URL = new URL(
  './migrations/032-payroll-type-mapping-fail-closed.sql', import.meta.url,
);
const PREREQUISITE_CONTRACT_URL = new URL(
  '../contracts/grh-payroll-type-map.v1.json', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const HELPER_SIGNATURE = 'public.payroll_type_canonical_v1(text,text)';
const PREPARE_SIGNATURE =
  'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)';
const EXPECTED_EVIDENCE = Object.freeze({
  F: Object.freeze({ label: 'Liquidación Final', meaning: 'liquidación final' }),
  M: Object.freeze({ label: 'Mes', meaning: 'mensual o segunda quincena' }),
  O: Object.freeze({ label: 'Otros Conceptos', meaning: 'otras liquidaciones' }),
  P: Object.freeze({ label: 'Primera Quincena', meaning: 'primera quincena' }),
  S: Object.freeze({ label: 'SAC', meaning: 'sueldo anual complementario' }),
  V: Object.freeze({ label: 'Vacaciones', meaning: 'vacaciones anuales' }),
});
const CORROBORATING_SOURCE =
  'GRHW_Formulas_Acrobat.pdf, página física 28 / folio 16';

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

export function grhPayrollTypeHomologationFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function grhPayrollTypeHomologationLedgerFingerprint(
  migration, contractSource,
) {
  const migrationHash = grhPayrollTypeHomologationFingerprint(migration);
  const contractHash = grhPayrollTypeHomologationFingerprint(contractSource);
  return grhPayrollTypeHomologationFingerprint(
    `${GRH_PAYROLL_TYPE_HOMOLOGATION_LEDGER_VERSION}\n${migrationHash}\n${contractHash}`,
  );
}

export function validateGrhPayrollTypeHomologationContract(contract) {
  if (contract?.contractVersion !== 'grh-payroll-type-map.v2'
      || contract?.supersedes !== 'grh-payroll-type-map.v1'
      || contract?.sourceSystem !== 'GRH'
      || contract?.sourceField !== 'TIPO_31') {
    throw new Error('contrato de homologación GRH fuera de versión');
  }
  exactSet(contract.canonicalTypes, GRH_PAYROLL_TYPE_CANONICAL_TYPES,
    'tipos canónicos v2');
  const mappings = Array.isArray(contract.verifiedMappings)
    ? contract.verifiedMappings : [];
  const mappingCodes = mappings.map((item) => item?.sourceCode);
  exactSet(mappingCodes, Object.keys(GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS),
    'códigos GRH homologados');
  for (const mapping of mappings) {
    const sourceCode = String(mapping?.sourceCode || '');
    const expected = GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS[sourceCode];
    if (!expected
        || mapping?.canonicalType !== expected
        || mapping?.evidence?.kind !== 'observed_ui_value_label_pair'
        || mapping?.evidence?.label !== EXPECTED_EVIDENCE[sourceCode]?.label
        || mapping?.evidence?.documentedMeaning !== EXPECTED_EVIDENCE[sourceCode]?.meaning
        || mapping?.evidence?.corroboratingSource !== CORROBORATING_SOURCE
        || mapping?.evidence?.surface
          !== 'GRH y GRH_WEB - selector Tipo de liquidación'
        || !/^20\d{2}-\d{2}-\d{2}$/.test(mapping?.evidence?.observedOn || '')) {
      throw new Error(`evidencia GRH v2 inválida para ${sourceCode || '?'}`);
    }
  }
  if (!Array.isArray(contract.unclassifiedSourceCodes)
      || contract.unclassifiedSourceCodes.length !== 0) {
    throw new Error('v2 no debe conservar códigos observados sin homologar');
  }
  if (contract.ledger?.version !== GRH_PAYROLL_TYPE_HOMOLOGATION_LEDGER_VERSION
      || contract.ledger?.algorithm
        !== 'sha256(version + LF + sha256(sql-bytes) + LF + sha256(contract-bytes))'
      || contract.ledger?.table !== 'schema_migrations'
      || contract.ledger?.column !== 'checksum_sha256') {
    throw new Error('ledger de homologación GRH v2 fuera de contrato');
  }
  if (contract.policy?.unknownResult !== null
      || contract.policy?.duplicateDetection
        !== 'block_when_same_contract_period_concept_cost_center_has_unknown_source_type'
      || !String(contract.policy?.evidenceScope || '').includes('TIPO_31')) {
    throw new Error('política GRH v2 no conserva el límite fail-closed');
  }
  return true;
}

export function validateGrhPayrollTypeHomologationMigrationSql(sql) {
  const source = String(sql || '');
  for (const token of [
    'public.payroll_type_canonical_v1',
    "WHEN 'F' THEN 'final'",
    "WHEN 'M' THEN 'monthly'",
    "WHEN 'O' THEN 'other'",
    "WHEN 'P' THEN 'first_fortnight'",
    "WHEN 'S' THEN 'sac'",
    "WHEN 'V' THEN 'vacation'",
    'ELSE NULL',
    'GRH_PAYROLL_TYPE_HOMOLOGATION_UNLEDGERED_MAPPING',
    'GRH_PAYROLL_TYPE_HOMOLOGATION_MATRIX_DRIFT',
    'GRH_PAYROLL_TYPE_HOMOLOGATION_ACL_DRIFT',
    'REVOKE ALL ON FUNCTION public.payroll_type_canonical_v1(text,text) FROM PUBLIC',
    'FROM municontrol_actions_runtime_app',
    'aclexplode',
  ]) {
    if (!source.includes(token)) throw new Error(`migración 039 no contiene ${token}`);
  }
  if (/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|GRANT)\b/i
    .test(source)) {
    throw new Error('migración 039 amplía datos, tablas o privilegios');
  }
  if (splitPostgresStatements(source).length !== 8) {
    throw new Error('migración 039 incompleta o no segmentable');
  }
  return true;
}

function validateFunctionAcl(fn, expectedGrantees, label) {
  const entries = Array.isArray(fn?.aclEntries) ? fn.aclEntries : [];
  exactSet(entries.map((entry) => entry?.grantee), expectedGrantees, `${label} ACL`);
  if (entries.some((entry) => entry?.privilege !== 'EXECUTE'
      || entry?.grantable !== false
      || entry?.grantor !== fn.ownerName)) {
    throw new Error(`${label} ACL fuera de contrato`);
  }
}

function validateMappingMatrix(actualRows) {
  const actual = Array.isArray(actualRows) ? actualRows : [];
  if (actual.length !== GRH_PAYROLL_TYPE_VERIFICATION_MATRIX.length) {
    throw new Error('matriz canónica 039 incompleta');
  }
  for (const [index, expected] of GRH_PAYROLL_TYPE_VERIFICATION_MATRIX.entries()) {
    const item = actual[index] || {};
    if (Number(item.ordinal) !== index + 1
        || item.sourceSystem !== expected.sourceSystem
        || item.sourceCode !== expected.sourceCode
        || item.actual !== expected.expected) {
      throw new Error(`matriz canónica 039 divergente en caso ${index + 1}`);
    }
  }
}

export function validateGrhPayrollTypeHomologationEvidence(evidence) {
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
      || Object.entries(GRH_PAYROLL_TYPE_VERIFIED_MAPPINGS).some(
        ([sourceCode, canonicalType]) => !helperDefinition.includes(
          `WHEN '${sourceCode}' THEN '${canonicalType}'`,
        ),
      )
      || !helperDefinition.includes('ELSE NULL')) {
    throw new Error('helper canónico 039 inseguro o fuera de contrato');
  }
  validateFunctionAcl(helper, [helper.ownerName], 'helper canónico 039');
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
    throw new Error('fachada prepare 039 insegura o fuera de contrato');
  }
  validateFunctionAcl(prepare, [prepare.ownerName, RUNTIME_ROLE], 'fachada prepare 039');
  return true;
}

export function resolveGrhPayrollTypeHomologationTarget(
  argv = process.argv, env = process.env,
) {
  return resolvePinnedNeonTarget({
    argv,
    env,
    envPrefix: 'GRH_PAYROLL_TYPE_HOMOLOGATION',
    targetLabel: '039',
  });
}

export async function verifyGrhPayrollTypeHomologationConnectedTarget(client, target) {
  return verifyPinnedNeonConnectedTarget(client, target, '039');
}

async function collectEvidence(client) {
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
  `, [JSON.stringify(GRH_PAYROLL_TYPE_VERIFICATION_MATRIX.map((item, index) => ({
    ordinal: index + 1,
    source_system: item.sourceSystem,
    source_code: item.sourceCode,
  })))]);
  return {
    helper: functionMap[HELPER_SIGNATURE],
    prepare: functionMap[PREPARE_SIGNATURE],
    mappingMatrix: rows(mappingMatrixResult),
  };
}

export async function verifyGrhPayrollTypeHomologationFinalState(client) {
  return validateGrhPayrollTypeHomologationEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const [migration, contractSource] = await Promise.all([
    readFile(PREREQUISITE_MIGRATION_URL, 'utf8'),
    readFile(PREREQUISITE_CONTRACT_URL, 'utf8'),
  ]);
  const expected = payrollTypeMappingLedgerFingerprint(migration, contractSource);
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [PAYROLL_TYPE_MAPPING_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${PAYROLL_TYPE_MAPPING_MIGRATION_VERSION}`);
  }
}

async function verifyNoUnledgeredState(client) {
  try {
    await verifyPayrollTypeMappingFinalState(client);
  } catch (error) {
    throw new Error('estado 039 presente o base 032 con drift sin ledger', { cause: error });
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  const contractSource = await readFile(CONTRACT_URL, 'utf8');
  let contract;
  try {
    contract = JSON.parse(contractSource);
  } catch (error) {
    throw new Error('contrato de homologación GRH v2 no es JSON válido', { cause: error });
  }
  validateGrhPayrollTypeHomologationContract(contract);
  validateGrhPayrollTypeHomologationMigrationSql(migration);
  const checksum = grhPayrollTypeHomologationLedgerFingerprint(
    migration, contractSource,
  );
  const statements = splitPostgresStatements(migration);
  const target = resolveGrhPayrollTypeHomologationTarget(
    process.argv.slice(2), process.env,
  );
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await verifyGrhPayrollTypeHomologationConnectedTarget(client, target);
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:grh-payroll-type-homologation-039'))",
    );
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [GRH_PAYROLL_TYPE_HOMOLOGATION_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== checksum) {
      throw new Error(`Drift detectado: ${GRH_PAYROLL_TYPE_HOMOLOGATION_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredState(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migración ${GRH_PAYROLL_TYPE_HOMOLOGATION_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL inválido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [GRH_PAYROLL_TYPE_HOMOLOGATION_MIGRATION_VERSION, checksum],
      );
    }
    await verifyGrhPayrollTypeHomologationFinalState(client);
    await client.query('COMMIT');
    console.log(`${GRH_PAYROLL_TYPE_HOMOLOGATION_MIGRATION_VERSION}: ${existing.rowCount
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
