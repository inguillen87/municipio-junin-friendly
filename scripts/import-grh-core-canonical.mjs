import { readFile, realpath, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';
import { acquireGrhPublicationLocks } from './lib/grh-publication-lock.mjs';

import {
  directCanonicalDatabaseUrl,
  enforceLogicalSizeGate,
  forEachBatch,
  postgresJson,
  requiredInteger,
  requiredText,
  sha256Text,
  stableJson,
  streamDeterministicJsonArray,
  verifyStreamArtifact,
} from './lib/canonical-import.mjs';

const DATA_DIR = new URL('../rrhh-data/', import.meta.url);
const MANIFEST_FILE = 'grh-core-manifest.json';
const IMPORT_CONTRACT_VERSION = 'grh-core-canonical-v2';
const EXPECTED_PROFILE = 'grh-core-junin-2026-08';
const EXPECTED_CURRENT_PAYROLL_DATE = '2026-08-31';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OUTPUT_FILES = Object.freeze({
  payrollRuns: 'grh-core-payroll-runs.json',
  payrollSnapshot: 'grh-core-payroll-snapshot.json',
  movements: 'grh-core-movements.json',
  payrollMonthly: 'grh-core-payroll-monthly.json',
  employmentReconciliation: 'grh-core-employment-reconciliation.json',
});
const EXPECTED_SOURCE_COUNTS = Object.freeze({
  calculo: 4_363_790,
  concepto: 294,
  histocal: 625,
  histolegajo: 854,
  legajo: 2_450,
  legamov: 489_681,
});
const OUTPUT_TABLES = Object.freeze({
  payrollRuns: 'histocal',
  payrollSnapshot: 'histolegajo',
  movements: 'legamov',
  payrollMonthly: 'calculo',
  employmentReconciliation: 'legajo_calculo_histolegajo',
});
const SOURCE_TOTAL_FIELDS = Object.freeze([
  'employerContributions',
  'socialSecurityTaxableBase',
  'healthTaxableBase',
  'subjectEarnings',
  'nonSubjectEarnings',
  'familyAllowances',
  'employeeWithholdings',
  'employerTaxableBase',
  'net',
  'netPayable',
]);

class GrhCoreError extends Error {
  constructor(code) {
    super(`GRH_CORE_${code}`);
    this.name = 'GrhCoreError';
    this.code = this.message;
  }
}

function safeCoreError(error, code) {
  if (error?.code === 'GRH_PUBLICATION_BUSY') {
    return Object.assign(new Error('GRH_PUBLICATION_BUSY'), { code: 'GRH_PUBLICATION_BUSY' });
  }
  return error instanceof GrhCoreError ? error : new GrhCoreError(code);
}

function freezeSource(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freezeSource(nested);
    Object.freeze(value);
  }
  return value;
}

function compactSourceId(key) {
  return sha256Text(stableJson(key));
}

function cleanSourceCode(value) {
  const text = value === null || value === undefined ? null : String(value).trim();
  return !text || text === '<null>' ? null : text;
}

function assertIsoDate(value, fieldName) {
  const text = requiredText(value, fieldName);
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000Z`) : null;
  if (!parsed || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new Error(`${fieldName} no es una fecha ISO valida: ${text}`);
  }
  return text;
}

function assertPayrollDate(value, fieldName) {
  const date = assertIsoDate(value, fieldName);
  if (date < '2008-01-01' || date > EXPECTED_CURRENT_PAYROLL_DATE) {
    throw new GrhCoreError('PAYROLL_DATE_OUTSIDE_AUGUST_PROFILE');
  }
  return date;
}

function assertManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest?.profile !== EXPECTED_PROFILE) {
    throw new GrhCoreError('UNSUPPORTED_PROFILE');
  }
  if (manifest?.source?.currentPayrollDate !== EXPECTED_CURRENT_PAYROLL_DATE) {
    throw new GrhCoreError('INVALID_CURRENT_PAYROLL_DATE');
  }
  if (!/^[a-f0-9]{64}$/i.test(manifest?.source?.sha256 ?? '')) {
    throw new GrhCoreError('INVALID_SOURCE_SHA256');
  }
  if (manifest?.source?.database !== undefined && manifest.source.database !== 'grh_junin') {
    throw new GrhCoreError('INVALID_SOURCE_DATABASE');
  }
  if (manifest?.quality?.strictSnapshot !== true) {
    throw new GrhCoreError('STRICT_SNAPSHOT_REQUIRED');
  }
  if (manifest?.quality?.crossSourceJoinByIdPersona !== 0) {
    throw new GrhCoreError('CROSS_SOURCE_ID_JOIN_FORBIDDEN');
  }
  for (const [table, expected] of Object.entries(EXPECTED_SOURCE_COUNTS)) {
    if (Number(manifest?.sourceCounts?.[table]) !== expected) {
      throw new GrhCoreError('SOURCE_COUNTS_MISMATCH');
    }
  }
  const reconciliation = manifest.reconciliation ?? {};
  if (
    Number(reconciliation.administrativeActive) !== 882
    || Number(reconciliation.liquidatedCurrent) !== 854
    || Number(reconciliation.activeNotLiquidated) !== 28
    || Number(reconciliation.liquidatedNotActive) !== 0
    || Number(reconciliation.activeAndLiquidated) + Number(reconciliation.activeNotLiquidated)
      !== Number(reconciliation.administrativeActive)
  ) {
    throw new GrhCoreError('RECONCILIATION_COUNTS_MISMATCH');
  }
  const semantics = String(manifest?.quality?.moneySemantics ?? '');
  if (!semantics.includes('technicalSourceAmountSum') || !semantics.includes('never a financial KPI')) {
    throw new GrhCoreError('FINANCIAL_SEMANTICS_REQUIRED');
  }
  if (
    manifest?.source?.currentPayrollClosureStatus !== 'open'
    || manifest?.source?.latestClosedPayrollDate !== '2026-07-31'
    || manifest?.quality?.payrollRunClosure?.currentRun !== 'open'
    || manifest?.quality?.payrollRunClosure?.latestClosedDate !== '2026-07-31'
  ) {
    throw new GrhCoreError('PAYROLL_CLOSURE_MISMATCH');
  }
  if (!String(manifest?.quality?.payrollRunClosure?.executiveFinancialRule ?? '').includes('closureStatus=closed')) {
    throw new GrhCoreError('CLOSED_RUN_FINANCIAL_GATE_REQUIRED');
  }
}

async function confinedFile(directory, filename) {
  const resolved = await realpath(path.join(directory, filename));
  if (path.dirname(resolved) !== directory || !(await stat(resolved)).isFile()) {
    throw new GrhCoreError('SOURCE_FILE_OUTSIDE_DIRECTORY');
  }
  return resolved;
}

/** Verify private artifacts without opening a database connection. */
export async function preflightGrhCore({ dataDir = DATA_DIR } = {}) {
  try {
    if (!(dataDir instanceof URL) || dataDir.protocol !== 'file:' || dataDir.search || dataDir.hash
        || !dataDir.pathname.endsWith('/')) {
      throw new GrhCoreError('FILE_DIRECTORY_URL_REQUIRED');
    }
    const directory = await realpath(fileURLToPath(dataDir));
    const manifestPath = await confinedFile(directory, MANIFEST_FILE);
    const manifestBytes = await readFile(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    return await verifySourceArtifacts(manifest, directory, createHash('sha256').update(manifestBytes).digest('hex'));
  } catch (error) {
    throw safeCoreError(error, 'PREFLIGHT_FAILED');
  }
}

async function verifySourceArtifacts(manifest, directory, manifestSha256) {
  assertManifest(manifest);
  for (const outputName of Object.keys(OUTPUT_TABLES)) {
    const descriptor = manifest.outputs?.[outputName];
    if (descriptor?.file !== OUTPUT_FILES[outputName]) {
      throw new GrhCoreError('UNEXPECTED_ARTIFACT_FILENAME');
    }
    if (!Number.isSafeInteger(descriptor.records) || descriptor.records < 0
        || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 0
        || !/^[a-f0-9]{64}$/i.test(descriptor.sha256 ?? '')) {
      throw new GrhCoreError('INVALID_ARTIFACT_DESCRIPTOR');
    }
  }
  const descriptors = Object.keys(OUTPUT_TABLES).map((name) => manifest.outputs[name]);
  enforceLogicalSizeGate([
    ...descriptors,
    { bytes: descriptors.reduce((total, descriptor) => total + descriptor.records * 128, 0) },
  ]);
  const artifacts = {};
  for (const outputName of Object.keys(OUTPUT_TABLES)) {
    const descriptor = manifest.outputs[outputName];
    const artifactPath = await confinedFile(directory, descriptor.file);
    artifacts[outputName] = {
      path: artifactPath,
      descriptor,
      ...(await verifyStreamArtifact(artifactPath, descriptor, `GRH core ${outputName}`)),
    };
  }
  const rowOverheadEstimate = Object.values(artifacts).reduce(
    (total, artifact) => total + artifact.records * 128,
    0,
  );
  const logicalBytes = enforceLogicalSizeGate([
    ...Object.values(artifacts),
    { bytes: rowOverheadEstimate },
  ]);
  if (artifacts.payrollSnapshot.records !== 854 || artifacts.employmentReconciliation.records !== 2450) {
    throw new GrhCoreError('CRITICAL_OUTPUT_COUNTS_MISMATCH');
  }
  return freezeSource({
    manifest, manifestSha256, artifacts, logicalBytes, rowOverheadEstimate,
    dataDir: pathToFileURL(`${directory}${path.sep}`).href,
  });
}

async function revalidateSource(source) {
  if (!source || typeof source.dataDir !== 'string' || !/^[a-f0-9]{64}$/i.test(source.manifestSha256 ?? '')) {
    throw new GrhCoreError('VERIFIED_SOURCE_REQUIRED');
  }
  const verified = await preflightGrhCore({ dataDir: new URL(source.dataDir) });
  if (verified.manifestSha256 !== source.manifestSha256
      || stableJson(verified.manifest) !== stableJson(source.manifest)) {
    throw new GrhCoreError('SOURCE_CHANGED_AFTER_PREFLIGHT');
  }
  return verified;
}

async function requireCanonicalContracts(client, batchId) {
  const tables = [
    'source_import_batch', 'source_staging_row', 'employment_contract', 'payroll_run',
    'employment_status_snapshot', 'payroll_snapshot_assignment',
    'payroll_monthly_fact', 'employment_movement', 'data_quality_issue',
  ];
  const result = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [tables],
  );
  if (result.rowCount !== tables.length) {
    throw new Error(`Esquema canonico GRH core incompleto: ${result.rowCount}/${tables.length} tablas.`);
  }
  const contracts = await client.query(
    `SELECT count(*)::int AS records
       FROM employment_contract
      WHERE source_system = 'GRH' AND source_batch_id = $1`,
    [batchId],
  );
  if (contracts.rows[0].records !== EXPECTED_SOURCE_COUNTS.legajo) {
    throw new Error(`Contratos GRH incompletos: ${contracts.rows[0].records}/2450.`);
  }
}

function explicitSourceIds(batchId, importRunId) {
  if (typeof batchId !== 'string' || !UUID_PATTERN.test(batchId)) {
    throw new GrhCoreError('EXPLICIT_BATCH_ID_REQUIRED');
  }
  if ((typeof importRunId !== 'string' && typeof importRunId !== 'number')
      || (typeof importRunId === 'number' && !Number.isSafeInteger(importRunId))
      || !/^[1-9]\d*$/.test(String(importRunId))
      || BigInt(importRunId) > 9223372036854775807n) {
    throw new GrhCoreError('EXPLICIT_IMPORT_RUN_ID_REQUIRED');
  }
  return { batchId: batchId.toLowerCase(), importRunId: String(importRunId) };
}

async function resolveGrhBatch(client, manifest, batchId, importRunId) {
  const sha256 = requiredText(manifest?.source?.sha256, 'source.sha256').toUpperCase();
  const sourceCutoff = manifest.source.dumpCompletedAt ?? manifest.source.cutoff ?? null;
  if (sourceCutoff !== null && (typeof sourceCutoff !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})?$/.test(sourceCutoff))) {
    throw new GrhCoreError('INVALID_SOURCE_CUTOFF');
  }
  const result = await client.query(
    `SELECT batch.id, batch.source_database, batch.source_sha256,
            batch.legacy_import_run_id::text AS import_run_id
       FROM source_import_batch batch
       JOIN data_import_runs imported ON imported.id = batch.legacy_import_run_id
      WHERE batch.id = $1::uuid
        AND batch.source_system = 'GRH'
        AND batch.source_database = 'grh_junin'
        AND batch.source_sha256 = $2
        AND batch.validation_state = 'published'
        AND imported.id = $3::bigint
        AND imported.source_name = 'grh_junin_curated'
        AND upper(imported.source_sha256) = batch.source_sha256
        AND imported.status = 'completed' AND imported.completed_at IS NOT NULL
        AND batch.source_cutoff = imported.source_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires'
        AND ($4::text IS NULL OR batch.source_cutoff = CASE
          WHEN $4::text ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN $4::timestamptz
          ELSE $4::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires' END)
      FOR SHARE OF batch, imported`,
    [batchId, sha256, importRunId, sourceCutoff],
  );
  if (result.rowCount !== 1) {
    throw new GrhCoreError('CANONICAL_BATCH_PROVENANCE_MISMATCH');
  }
  const batch = result.rows[0];
  if (batch.id !== batchId || batch.source_database !== 'grh_junin'
      || batch.source_sha256.trim() !== sha256 || batch.import_run_id !== importRunId) {
    throw new GrhCoreError('CANONICAL_BATCH_PROVENANCE_MISMATCH');
  }
  return batch.id;
}

async function rejectSnapshotCohortCollision(client, batchId, currentPayrollDate) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM payroll_snapshot_assignment snapshot
       JOIN employment_contract contract ON contract.id = snapshot.employment_contract_id
       WHERE contract.source_system = 'GRH' AND contract.source_batch_id = $1::uuid
         AND snapshot.snapshot_date = $2::date AND snapshot.source_batch_id <> $1::uuid
       UNION ALL
       SELECT 1 FROM employment_status_snapshot snapshot
       JOIN employment_contract contract ON contract.id = snapshot.employment_contract_id
       WHERE contract.source_system = 'GRH' AND contract.source_batch_id = $1::uuid
         AND snapshot.snapshot_date = $2::date AND snapshot.source_batch_id <> $1::uuid
     ) AS cohort_collision`,
    [batchId, currentPayrollDate],
  );
  if (result.rows[0]?.cohort_collision !== false) {
    throw new GrhCoreError('SNAPSHOT_COHORT_COLLISION');
  }
}

async function insertArtifactStaging(client, batchId, manifest) {
  const rows = Object.entries(OUTPUT_TABLES).map(([outputName, sourceTable]) => {
    const output = manifest.outputs[outputName];
    return {
      source_entity: `artifact:${sourceTable}`,
      source_id: output.file,
      source_row_sha256: output.sha256.toLowerCase(),
      source_payload: {
        importerContractVersion: IMPORT_CONTRACT_VERSION,
        artifact: output,
        extractionProfile: manifest.profile,
        sourceTable,
        sourceDumpSha256: manifest.source.sha256,
        methodology: manifest.methodology,
        quality: manifest.quality,
      },
    };
  });
  await client.query(
    `INSERT INTO source_staging_row (
       batch_id, source_schema, source_entity, source_id,
       source_row_number, source_row_sha256, source_payload
     )
     SELECT $1::uuid, 'grh_junin', input.source_entity, input.source_id,
            1, input.source_row_sha256, input.source_payload
     FROM jsonb_to_recordset($2::jsonb) AS input(
       source_entity text, source_id text, source_row_sha256 char(64), source_payload jsonb
     )
     ON CONFLICT DO NOTHING`,
    [batchId, postgresJson(rows)],
  );
  const verified = await client.query(
    `WITH expected AS (
       SELECT * FROM jsonb_to_recordset($2::jsonb) AS input(
         source_entity text, source_id text, source_row_sha256 char(64), source_payload jsonb
       )
     )
     SELECT count(*)::int AS matching
     FROM expected
     JOIN source_staging_row staged
       ON staged.batch_id = $1::uuid
      AND staged.source_entity = expected.source_entity
      AND staged.source_id = expected.source_id
      AND staged.source_row_number = 1
      AND staged.source_row_sha256 = expected.source_row_sha256
      AND staged.source_payload ->> 'importerContractVersion' = $3`,
    [batchId, postgresJson(rows), IMPORT_CONTRACT_VERSION],
  );
  if (verified.rows[0].matching !== rows.length) {
    throw new Error(`Staging GRH core incompatible o incompleto: ${verified.rows[0].matching}/${rows.length}.`);
  }
}

function sourceKey(record, label) {
  const key = record?.sourceKey;
  const companyCode = requiredInteger(key?.companyCode, `${label}.sourceKey.companyCode`);
  const employeeNumber = requiredText(key?.employeeNumber, `${label}.sourceKey.employeeNumber`);
  return { key, companyCode, employeeNumber };
}

async function importPayrollRuns(client, batchId, artifact) {
  return forEachBatch(streamDeterministicJsonArray(artifact.path), 300, async (records) => {
    const rows = records.map((record) => {
      const key = record?.sourceKey;
      const companySourceId = requiredText(key?.companyCode, 'payrollRuns.sourceKey.companyCode');
      const payrollDate = assertPayrollDate(key?.payrollDate, 'payrollRuns.sourceKey.payrollDate');
      const sourcePeriod = requiredInteger(key?.period, 'payrollRuns.sourceKey.period');
      const sourceMonth = requiredInteger(key?.month, 'payrollRuns.sourceKey.month');
      if (sourceMonth < 1 || sourceMonth > 12) throw new Error(`Mes de corrida fuera de rango: ${sourceMonth}`);
      const payrollType = requiredText(key?.payrollType, 'payrollRuns.sourceKey.payrollType');
      if (!['closed', 'open', 'unknown'].includes(record.closureStatus)) {
        throw new Error(`Estado de cierre desconocido: ${record.closureStatus}`);
      }
      if (![null, 1].includes(record.sourceClosureFlag)) {
        throw new Error(`Bandera histocal.CIER_31 invalida: ${record.sourceClosureFlag}`);
      }
      if (
        (record.sourceClosureFlag === 1) !== (record.closureStatus === 'closed')
        || record.executivePublishable !== (record.closureStatus === 'closed')
      ) {
        throw new Error(`Evidencia de cierre inconsistente para ${stableJson(key)}`);
      }
      const sourceDateIg = record.sourceDateIg === null
        ? null
        : assertIsoDate(record.sourceDateIg, 'payrollRuns.sourceDateIg');
      const sourceId = compactSourceId(key);
      if (sourceId.length > 256) throw new Error(`source_id de corrida excede 256 caracteres: ${sourceId}`);
      return {
        company_source_id: companySourceId,
        payroll_date: payrollDate,
        source_period: sourcePeriod,
        source_month: sourceMonth,
        payroll_type: payrollType,
        source_closed_flag: record.sourceClosureFlag,
        closure_status: record.closureStatus,
        source_date_ig: sourceDateIg,
        source_id: sourceId,
        source_payload: {},
      };
    });
    await client.query(
      `INSERT INTO payroll_run (
         id, company_source_id, payroll_date, source_period, source_month,
         payroll_type, source_closed_flag, closure_status, source_date_ig,
         source_system, source_batch_id, source_id, source_payload
       )
       SELECT md5('payroll_run|GRH|' || $1::text || '|' || input.source_id)::uuid,
              input.company_source_id, input.payroll_date, input.source_period,
              input.source_month, input.payroll_type, input.source_closed_flag,
              input.closure_status, input.source_date_ig,
              'GRH', $1::uuid, input.source_id, input.source_payload
       FROM jsonb_to_recordset($2::jsonb) AS input(
         company_source_id text, payroll_date date, source_period integer,
         source_month integer, payroll_type text, source_closed_flag smallint,
         closure_status text, source_date_ig date, source_id text, source_payload jsonb
       )
       ON CONFLICT DO NOTHING`,
      [batchId, postgresJson(rows)],
    );
  });
}

async function importPayrollSnapshot(client, batchId, artifact, currentPayrollDate) {
  return forEachBatch(streamDeterministicJsonArray(artifact.path), 300, async (records) => {
    const rows = records.map((record) => {
      const { key, companyCode, employeeNumber } = sourceKey(record, 'payrollSnapshot');
      const snapshotDate = assertIsoDate(record.payrollDate, 'payrollSnapshot.payrollDate');
      if (snapshotDate !== currentPayrollDate) throw new Error(`Snapshot fuera del corte actual: ${snapshotDate}`);
      const sourceId = compactSourceId(key);
      if (sourceId.length > 128) throw new Error(`source_record_id excede 128 caracteres: ${sourceId}`);
      return {
        company_code: companyCode,
        employee_number: employeeNumber,
        snapshot_date: snapshotDate,
        source_period: requiredInteger(record.period, 'payrollSnapshot.period'),
        source_month: requiredInteger(record.month, 'payrollSnapshot.month'),
        payroll_type: requiredText(record.payrollType, 'payrollSnapshot.payrollType'),
        source_record_id: sourceId,
        agreement_source_id: cleanSourceCode(record.agreement?.id),
        agreement_name: cleanSourceCode(record.agreement?.name),
        category_name: cleanSourceCode(record.category),
        role_name: cleanSourceCode(record.role),
        budget_structure: cleanSourceCode(record.budget?.structure),
        budget_detail: cleanSourceCode(record.budget?.detail),
        budget_account: cleanSourceCode(record.budget?.account),
        department_source_id: cleanSourceCode(record.organization?.departmentId),
        department_name: cleanSourceCode(record.organization?.department),
        area_name: cleanSourceCode(record.organization?.area),
        source_payload: {},
      };
    });
    const result = await client.query(
      `WITH input AS (
         SELECT * FROM jsonb_to_recordset($2::jsonb) AS row(
           company_code bigint, employee_number text, snapshot_date date,
           source_period integer, source_month integer, payroll_type text,
           source_record_id text, agreement_source_id text,
           agreement_name text, category_name text, role_name text,
           budget_structure text, budget_detail text, budget_account text,
           department_source_id text, department_name text, area_name text,
           source_payload jsonb
         )
       ), resolved AS (
         SELECT input.*, contract.id AS contract_id, run.id AS payroll_run_id
         FROM input
         JOIN employment_contract contract
           ON contract.legacy_company_id = input.company_code
          AND contract.legacy_legajo = input.employee_number
         AND contract.source_system = 'GRH'
          AND contract.source_batch_id = $1::uuid
         JOIN payroll_run run
           ON run.source_batch_id = $1::uuid
          AND run.company_source_id = input.company_code::text
          AND run.payroll_date = input.snapshot_date
          AND run.source_period = input.source_period
          AND run.source_month = input.source_month
          AND run.payroll_type = input.payroll_type
       ), inserted AS (
         INSERT INTO payroll_snapshot_assignment (
           employment_contract_id, payroll_run_id, snapshot_date, payroll_type, source_record_id,
           agreement_source_id, agreement_name, category_name, role_name,
           budget_structure, budget_detail, budget_account,
           department_source_id, department_name, area_name,
           source_system, source_batch_id, source_payload
         )
         SELECT contract_id, payroll_run_id, snapshot_date, payroll_type, source_record_id,
                agreement_source_id, agreement_name, category_name, role_name,
                budget_structure, budget_detail, budget_account,
                department_source_id, department_name, area_name,
                'GRH', $1::uuid, source_payload
         FROM resolved ON CONFLICT DO NOTHING RETURNING 1
       )
       SELECT (SELECT count(*)::int FROM input) AS input_count,
              (SELECT count(*)::int FROM resolved) AS resolved_count`,
      [batchId, postgresJson(rows)],
    );
    if (result.rows[0].input_count !== result.rows[0].resolved_count) {
      throw new Error(`histolegajo contiene legajos sin contrato: ${result.rows[0].input_count - result.rows[0].resolved_count}`);
    }
  });
}

async function importMovements(client, batchId, artifact) {
  return forEachBatch(streamDeterministicJsonArray(artifact.path), 500, async (records) => {
    const rows = records.map((record) => {
      const { key, companyCode, employeeNumber } = sourceKey(record, 'movements');
      const year = requiredInteger(key.year, 'movements.sourceKey.year');
      const month = requiredInteger(key.month, 'movements.sourceKey.month');
      if (year < 2008 || year > 2026 || month < 1 || month > 12) {
        throw new Error(`Periodo de movimiento fuera de rango: ${year}-${month}`);
      }
      const sourceId = compactSourceId(key);
      if (sourceId.length > 256) throw new Error(`source_id de movimiento excede 256 caracteres: ${sourceId}`);
      return {
        company_code: companyCode,
        employee_number: employeeNumber,
        movement_period: `${year}-${String(month).padStart(2, '0')}-01`,
        payroll_type: cleanSourceCode(key.payrollType),
        movement_type: cleanSourceCode(record.movementType),
        concept_source_id: cleanSourceCode(key.conceptCode),
        cost_center_source_id: cleanSourceCode(key.costCenterCode),
        quantity: cleanSourceCode(record.quantity),
        installment: cleanSourceCode(record.installment),
        automatic_source_value: cleanSourceCode(record.automatic),
        adjustment_source_value: cleanSourceCode(record.adjustment),
        forced_source_value: cleanSourceCode(record.forced),
        legal_instrument: cleanSourceCode(record.legalInstrument),
        movement_status: cleanSourceCode(record.status),
        source_id: sourceId,
        source_payload: {},
      };
    });
    const result = await client.query(
      `WITH input AS (
         SELECT * FROM jsonb_to_recordset($2::jsonb) AS row(
           company_code bigint, employee_number text, movement_period date,
           payroll_type text, movement_type text, concept_source_id text,
           cost_center_source_id text, quantity numeric, installment text,
           automatic_source_value text, adjustment_source_value text,
           forced_source_value text, legal_instrument text, movement_status text,
           source_id text, source_payload jsonb
         )
       ), resolved AS (
         SELECT input.*, contract.id AS contract_id
         FROM input
         JOIN employment_contract contract
           ON contract.legacy_company_id = input.company_code
          AND contract.legacy_legajo = input.employee_number
         AND contract.source_system = 'GRH'
          AND contract.source_batch_id = $1::uuid
       ), inserted AS (
         INSERT INTO employment_movement (
           id, employment_contract_id, movement_period, payroll_type,
           movement_type, concept_source_id, cost_center_source_id, quantity,
           installment, automatic_source_value, adjustment_source_value,
           forced_source_value, legal_instrument, movement_status,
           source_system, source_batch_id, source_id, source_payload
         )
         SELECT md5('employment_movement|GRH|' || $1::text || '|' || source_id)::uuid,
                contract_id, movement_period, payroll_type, movement_type,
                concept_source_id, cost_center_source_id, quantity, installment,
                automatic_source_value, adjustment_source_value, forced_source_value,
                legal_instrument, movement_status, 'GRH', $1::uuid, source_id, source_payload
         FROM resolved ON CONFLICT DO NOTHING RETURNING 1
       )
       SELECT (SELECT count(*)::int FROM input) AS input_count,
              (SELECT count(*)::int FROM resolved) AS resolved_count`,
      [batchId, postgresJson(rows)],
    );
    if (result.rows[0].input_count !== result.rows[0].resolved_count) {
      throw new Error(`legamov contiene legajos sin contrato: ${result.rows[0].input_count - result.rows[0].resolved_count}`);
    }
  });
}

async function importPayrollMonthly(client, batchId, artifact) {
  return forEachBatch(streamDeterministicJsonArray(artifact.path), 400, async (records) => {
    const rows = records.map((record) => {
      const { key, companyCode, employeeNumber } = sourceKey(record, 'payrollMonthly');
      const payrollDate = assertPayrollDate(key.payrollDate, 'payrollMonthly.sourceKey.payrollDate');
      const sourcePeriod = requiredInteger(key.period, 'payrollMonthly.sourceKey.period');
      const sourceMonth = requiredInteger(key.month, 'payrollMonthly.sourceKey.month');
      const sourceId = compactSourceId(key);
      if (sourceId.length > 256) throw new Error(`source_id mensual excede 256 caracteres: ${sourceId}`);
      const totals = record.sourceTotals ?? {};
      for (const field of Object.keys(totals)) {
        if (!SOURCE_TOTAL_FIELDS.includes(field)) throw new Error(`Total GRH mensual desconocido: ${field}`);
      }
      const qualityFlags = record.qualityFlags ?? [];
      if (!Array.isArray(qualityFlags) || qualityFlags.some((flag) => !['SOURCE_MONTH_MISMATCH', 'SOURCE_PERIOD_MISMATCH'].includes(flag))) {
        throw new Error(`qualityFlags mensuales invalidos en ${sourceId}`);
      }
      return {
        company_code: companyCode,
        employee_number: employeeNumber,
        payroll_date: payrollDate,
        source_period: sourcePeriod,
        source_month: sourceMonth,
        payroll_type: requiredText(key.payrollType, 'payrollMonthly.sourceKey.payrollType'),
        item_count: requiredInteger(record.itemCount, 'payrollMonthly.itemCount'),
        quantity_sum: requiredText(record.quantitySum, 'payrollMonthly.quantitySum'),
        technical_source_amount_sum: requiredText(
          record.technicalSourceAmountSum,
          'payrollMonthly.technicalSourceAmountSum',
        ),
        employer_contributions: totals.employerContributions ?? null,
        social_security_taxable_base: totals.socialSecurityTaxableBase ?? null,
        health_taxable_base: totals.healthTaxableBase ?? null,
        total_subject_earnings: totals.subjectEarnings ?? null,
        total_non_subject_earnings: totals.nonSubjectEarnings ?? null,
        family_allowance: totals.familyAllowances ?? null,
        employee_withholdings: totals.employeeWithholdings ?? null,
        employer_taxable_base: totals.employerTaxableBase ?? null,
        net: totals.net ?? null,
        net_payable: totals.netPayable ?? null,
        dominant_agreement_source_id: cleanSourceCode(record.dominantAgreementCode),
        dominant_sector_source_id: cleanSourceCode(record.dominantSectorCode),
        distinct_concepts: requiredInteger(record.distinctConcepts, 'payrollMonthly.distinctConcepts'),
        source_id: sourceId,
        source_payload: qualityFlags.length ? { qualityFlags } : {},
        quality_flags: qualityFlags,
      };
    });
    const result = await client.query(
      `WITH input AS (
         SELECT * FROM jsonb_to_recordset($2::jsonb) AS row(
           company_code bigint, employee_number text, payroll_date date,
           source_period integer, source_month integer, payroll_type text,
           item_count integer, quantity_sum numeric, technical_source_amount_sum numeric,
           employer_contributions numeric, social_security_taxable_base numeric,
           health_taxable_base numeric, total_subject_earnings numeric,
           total_non_subject_earnings numeric, family_allowance numeric,
           employee_withholdings numeric, employer_taxable_base numeric,
           net numeric, net_payable numeric, dominant_agreement_source_id text,
           dominant_sector_source_id text, distinct_concepts integer,
           source_id text, source_payload jsonb, quality_flags jsonb
         )
       ), resolved AS (
         SELECT input.*, contract.id AS contract_id, run.id AS payroll_run_id
         FROM input
         JOIN employment_contract contract
           ON contract.legacy_company_id = input.company_code
          AND contract.legacy_legajo = input.employee_number
         AND contract.source_system = 'GRH'
          AND contract.source_batch_id = $1::uuid
         JOIN payroll_run run
           ON run.source_batch_id = $1::uuid
          AND run.company_source_id = input.company_code::text
          AND run.payroll_date = input.payroll_date
          AND run.source_period = input.source_period
          AND run.source_month = input.source_month
          AND run.payroll_type = input.payroll_type
       ), inserted_facts AS (
         INSERT INTO payroll_monthly_fact (
           employment_contract_id, payroll_run_id, payroll_date, source_period, source_month,
           payroll_type, item_count, quantity_sum, technical_source_amount_sum,
           employer_contributions, social_security_taxable_base, health_taxable_base,
           total_subject_earnings, total_non_subject_earnings, family_allowance,
           employee_withholdings, employer_taxable_base, net, net_payable,
           dominant_agreement_source_id, dominant_sector_source_id, distinct_concepts,
           monetary_basis, source_system, source_batch_id, source_id, source_payload
         )
         SELECT contract_id, payroll_run_id, payroll_date, source_period, source_month, payroll_type,
                item_count, quantity_sum, technical_source_amount_sum,
                employer_contributions, social_security_taxable_base, health_taxable_base,
                total_subject_earnings, total_non_subject_earnings, family_allowance,
                employee_withholdings, employer_taxable_base, net, net_payable,
                dominant_agreement_source_id, dominant_sector_source_id, distinct_concepts,
                'nominal', 'GRH', $1::uuid, source_id, source_payload
         FROM resolved ON CONFLICT DO NOTHING RETURNING 1
       ), inserted_issues AS (
         INSERT INTO data_quality_issue (
           source_batch_id, source_system, source_entity, source_id,
           canonical_entity, canonical_id, issue_code, severity,
           field_name, observed_value, details
         )
         SELECT $1::uuid, 'GRH', 'calculo_monthly', resolved.source_id,
                'employment_contract', resolved.contract_id, flag.value, 'warning',
                CASE flag.value
                  WHEN 'SOURCE_MONTH_MISMATCH' THEN 'source_month'
                  ELSE 'source_period'
                END,
                CASE flag.value
                  WHEN 'SOURCE_MONTH_MISMATCH' THEN resolved.source_month::text
                  ELSE resolved.source_period::text
                END,
                jsonb_build_object(
                  'payrollDate', resolved.payroll_date,
                  'sourceMonth', resolved.source_month,
                  'sourcePeriod', resolved.source_period,
                  'excludedFromImport', false
                )
         FROM resolved
         CROSS JOIN LATERAL jsonb_array_elements_text(resolved.quality_flags) AS flag(value)
         WHERE NOT EXISTS (
           SELECT 1 FROM data_quality_issue existing
           WHERE existing.source_batch_id = $1::uuid
             AND existing.source_entity = 'calculo_monthly'
             AND COALESCE(existing.source_id, '') = COALESCE(resolved.source_id, '')
             AND existing.issue_code = flag.value
             AND COALESCE(existing.field_name, '') = CASE flag.value
               WHEN 'SOURCE_MONTH_MISMATCH' THEN 'source_month'
               ELSE 'source_period' END
             AND COALESCE(existing.canonical_id, '00000000-0000-0000-0000-000000000000'::uuid)
               = COALESCE(resolved.contract_id, '00000000-0000-0000-0000-000000000000'::uuid)
         )
         ON CONFLICT DO NOTHING RETURNING 1
       )
       SELECT (SELECT count(*)::int FROM input) AS input_count,
              (SELECT count(*)::int FROM resolved) AS resolved_count`,
      [batchId, postgresJson(rows)],
    );
    if (result.rows[0].input_count !== result.rows[0].resolved_count) {
      throw new Error(`calculo mensual contiene legajos sin contrato: ${result.rows[0].input_count - result.rows[0].resolved_count}`);
    }
  });
}

function reconciliationState(record, currentPayrollDate, currentClosureStatus) {
  const administrativeActive = record.administrativeActive;
  const liquidatedCurrent = record.liquidatedCurrent;
  if (typeof administrativeActive !== 'boolean' || typeof liquidatedCurrent !== 'boolean') {
    throw new Error('Reconciliacion sin estados booleanos explicitos.');
  }
  if (!administrativeActive) {
    if (liquidatedCurrent || record.evidenceStatus !== 'administrative_inactive') {
      throw new Error('Reconciliacion administrativa inactiva inconsistente.');
    }
    return { administrativeStatus: 'inactive', payrollStatus: 'not_applicable', reasonCode: null, explanation: null };
  }
  if (liquidatedCurrent) {
    if (record.evidenceStatus !== 'active_liquidated_current') {
      throw new Error('Reconciliacion liquidada inconsistente.');
    }
    if (currentClosureStatus !== 'open') {
      throw new Error(`El snapshot actual esperaba una corrida abierta, no ${currentClosureStatus}.`);
    }
    return { administrativeStatus: 'active', payrollStatus: 'preliquidated', reasonCode: null, explanation: null };
  }
  const allowed = new Set([
    'active_not_liquidated_never_observed',
    'active_not_liquidated_historical',
    'active_not_liquidated_previous_cycle',
  ]);
  if (!allowed.has(record.evidenceStatus)) throw new Error(`Estado de reconciliacion desconocido: ${record.evidenceStatus}`);
  return {
    administrativeStatus: 'active',
    payrollStatus: 'not_liquidated',
    reasonCode: record.evidenceStatus,
    explanation: `GRH no registra liquidacion al ${currentPayrollDate}; causa operativa pendiente de clasificacion.`,
  };
}

async function importReconciliation(client, batchId, artifact, currentPayrollDate, currentClosureStatus) {
  return forEachBatch(streamDeterministicJsonArray(artifact.path), 400, async (records) => {
    const rows = records.map((record) => {
      const { key, companyCode, employeeNumber } = sourceKey(record, 'reconciliation');
      const state = reconciliationState(record, currentPayrollDate, currentClosureStatus);
      return {
        company_code: companyCode,
        employee_number: employeeNumber,
        administrative_status: state.administrativeStatus,
        payroll_status: state.payrollStatus,
        discrepancy_reason_code: state.reasonCode,
        discrepancy_explanation: state.explanation,
        payroll_observed: record.liquidatedCurrent,
        evidence: {
          evidenceStatus: record.evidenceStatus,
          lastPayrollDate: record.lastPayrollDate,
          administrativeActive: record.administrativeActive,
          liquidatedCurrent: record.liquidatedCurrent,
          sourceKey: key,
          causeInferred: false,
        },
      };
    });
    const result = await client.query(
      `WITH input AS (
         SELECT * FROM jsonb_to_recordset($2::jsonb) AS row(
           company_code bigint, employee_number text,
           administrative_status text, payroll_status text,
           discrepancy_reason_code text, discrepancy_explanation text,
           payroll_observed boolean, evidence jsonb
         )
       ), resolved AS (
         SELECT input.*, contract.id AS contract_id, assignment.payroll_run_id
         FROM input
         JOIN employment_contract contract
           ON contract.legacy_company_id = input.company_code
          AND contract.legacy_legajo = input.employee_number
         AND contract.source_system = 'GRH'
          AND contract.source_batch_id = $1::uuid
         LEFT JOIN LATERAL (
           SELECT snapshot.payroll_run_id
           FROM payroll_snapshot_assignment snapshot
           WHERE snapshot.employment_contract_id = contract.id
             AND snapshot.snapshot_date = $3::date
             AND snapshot.source_batch_id = $1::uuid
             AND snapshot.source_system = 'GRH'
           ORDER BY snapshot.payroll_type
           LIMIT 1
         ) assignment ON true
       ), upserted AS (
         INSERT INTO employment_status_snapshot (
           employment_contract_id, snapshot_date, payroll_run_id, administrative_status,
           payroll_status, discrepancy_reason_code, discrepancy_explanation,
           source_system, source_batch_id, evidence
         )
         SELECT contract_id, $3::date, payroll_run_id, administrative_status, payroll_status,
                discrepancy_reason_code, discrepancy_explanation,
                'GRH', $1::uuid, evidence
         FROM resolved
         ON CONFLICT (employment_contract_id, snapshot_date) DO UPDATE
         SET administrative_status = EXCLUDED.administrative_status,
             payroll_status = EXCLUDED.payroll_status,
             payroll_run_id = EXCLUDED.payroll_run_id,
             discrepancy_reason_code = EXCLUDED.discrepancy_reason_code,
             discrepancy_explanation = EXCLUDED.discrepancy_explanation,
             evidence = EXCLUDED.evidence
         WHERE employment_status_snapshot.source_batch_id = EXCLUDED.source_batch_id
         RETURNING 1
       )
       SELECT (SELECT count(*)::int FROM input) AS input_count,
              (SELECT count(*)::int FROM resolved) AS resolved_count,
              (SELECT count(*)::int FROM resolved
                WHERE payroll_observed AND payroll_run_id IS NULL) AS missing_run_count`,
      [batchId, postgresJson(rows), currentPayrollDate],
    );
    if (result.rows[0].input_count !== result.rows[0].resolved_count) {
      throw new Error(`reconciliacion contiene legajos sin contrato: ${result.rows[0].input_count - result.rows[0].resolved_count}`);
    }
    if (result.rows[0].missing_run_count !== 0) {
      throw new Error(`reconciliacion contiene ${result.rows[0].missing_run_count} preliquidaciones sin corrida.`);
    }
  });
}

async function insertAggregateQualityIssues(client, batchId, manifest) {
  const issues = [
    {
      source_id: manifest.outputs.payrollMonthly.file,
      source_entity: 'artifact:calculo',
      issue_code: 'DATE_OUT_OF_RANGE',
      field_name: 'payroll_date',
      observed_value: String(manifest.quality.invalidCalculationDatesExcluded.records),
      details: { ...manifest.quality.invalidCalculationDatesExcluded, excludedFromImport: true },
    },
    {
      source_id: manifest.outputs.movements.file,
      source_entity: 'artifact:legamov',
      issue_code: 'DATE_OUT_OF_RANGE',
      field_name: 'movement_year',
      observed_value: String(manifest.quality.invalidMovementYearsExcluded.records),
      details: { ...manifest.quality.invalidMovementYearsExcluded, excludedFromImport: true },
    },
    {
      source_id: manifest.outputs.payrollRuns.file,
      source_entity: 'artifact:histocal',
      issue_code: 'DATE_OUT_OF_RANGE',
      field_name: 'payroll_run_date',
      observed_value: String(manifest.quality.invalidPayrollRunDatesExcluded.records),
      details: { ...manifest.quality.invalidPayrollRunDatesExcluded, excludedFromImport: true },
    },
  ].filter((issue) => Number(issue.observed_value) > 0);
  await client.query(
    `INSERT INTO data_quality_issue (
       source_batch_id, source_system, source_entity, source_id,
       issue_code, severity, field_name, observed_value, details
     )
     SELECT $1::uuid, 'GRH', input.source_entity, input.source_id,
            input.issue_code, 'error', input.field_name, input.observed_value, input.details
     FROM jsonb_to_recordset($2::jsonb) AS input(
       source_id text, source_entity text, issue_code text,
       field_name text, observed_value text, details jsonb
     )
     WHERE NOT EXISTS (
       SELECT 1 FROM data_quality_issue existing
       WHERE existing.source_batch_id = $1::uuid
         AND existing.source_entity = input.source_entity
         AND COALESCE(existing.source_id, '') = COALESCE(input.source_id, '')
         AND existing.issue_code = input.issue_code
         AND COALESCE(existing.field_name, '') = COALESCE(input.field_name, '')
         AND COALESCE(existing.canonical_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = '00000000-0000-0000-0000-000000000000'::uuid
     )
     ON CONFLICT DO NOTHING`,
    [batchId, postgresJson(issues)],
  );
}

async function verifyDatabase(client, batchId, manifest) {
  const currentDate = manifest.source.currentPayrollDate;
  const result = await client.query(
    `SELECT
       (SELECT count(*)::int FROM source_staging_row
         WHERE batch_id = $1 AND source_entity LIKE 'artifact:%') AS artifact_staging,
       (SELECT count(*)::int FROM payroll_run
         WHERE source_batch_id = $1) AS payroll_runs,
       (SELECT count(*)::int FROM payroll_snapshot_assignment
         WHERE source_batch_id = $1) AS payroll_snapshot,
       (SELECT count(*)::int FROM payroll_monthly_fact
         WHERE source_batch_id = $1) AS payroll_monthly,
       (SELECT count(*)::int FROM employment_movement
         WHERE source_batch_id = $1) AS movements,
       (SELECT count(*)::int FROM employment_status_snapshot
         WHERE source_batch_id = $1 AND snapshot_date = $2::date) AS reconciliation,
       (SELECT count(*)::int FROM employment_status_snapshot
         WHERE source_batch_id = $1 AND snapshot_date = $2::date
           AND administrative_status = 'active') AS administrative_active,
       (SELECT count(*)::int FROM employment_status_snapshot
         WHERE source_batch_id = $1 AND snapshot_date = $2::date
           AND payroll_status = 'liquidated') AS closed_liquidated_current,
       (SELECT count(*)::int FROM employment_status_snapshot
         WHERE source_batch_id = $1 AND snapshot_date = $2::date
           AND payroll_status = 'preliquidated') AS preliquidated_current,
       (SELECT count(*)::int FROM employment_status_snapshot
         WHERE source_batch_id = $1 AND snapshot_date = $2::date
           AND administrative_status = 'active' AND payroll_status = 'not_liquidated') AS active_not_liquidated,
       (SELECT max(payroll_date)::text FROM payroll_run
         WHERE source_batch_id = $1 AND closure_status = 'closed') AS latest_closed_date,
       (SELECT count(DISTINCT fact.employment_contract_id)::int
          FROM payroll_monthly_fact fact
          JOIN payroll_run run ON run.id = fact.payroll_run_id
         WHERE fact.source_batch_id = $1
           AND run.closure_status = 'closed'
           AND run.payroll_date = (
             SELECT max(closed_run.payroll_date)
             FROM payroll_run closed_run
             WHERE closed_run.source_batch_id = $1 AND closed_run.closure_status = 'closed'
           )) AS latest_closed_headcount`,
    [batchId, currentDate],
  );
  const actual = result.rows[0];
  const expected = {
    artifact_staging: Object.keys(OUTPUT_TABLES).length,
    payroll_runs: Number(manifest.outputs.payrollRuns.records),
    payroll_snapshot: Number(manifest.outputs.payrollSnapshot.records),
    payroll_monthly: Number(manifest.outputs.payrollMonthly.records),
    movements: Number(manifest.outputs.movements.records),
    reconciliation: Number(manifest.outputs.employmentReconciliation.records),
    administrative_active: Number(manifest.reconciliation.administrativeActive),
    closed_liquidated_current: 0,
    preliquidated_current: Number(manifest.reconciliation.liquidatedCurrent),
    active_not_liquidated: Number(manifest.reconciliation.activeNotLiquidated),
    latest_closed_headcount: 856,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`Verificacion GRH core fallo: ${key} ${actual[key]} != ${value}`);
  }
  if (actual.latest_closed_date !== manifest.source.latestClosedPayrollDate) {
    throw new Error(
      `Ultimo cierre GRH invalido: ${actual.latest_closed_date} != ${manifest.source.latestClosedPayrollDate}`,
    );
  }
  const mislabeled = await client.query(
    `SELECT count(*)::int AS records FROM payroll_monthly_fact
      WHERE source_batch_id = $1
        AND source_payload ? 'nominalAmountSum'`,
    [batchId],
  );
  if (mislabeled.rows[0].records !== 0) throw new Error('Se detecto nominalAmountSum prohibido en payroll_monthly_fact.');
  return actual;
}

/** The caller owns the transaction and must roll it back after any rejection. */
export async function importGrhCoreWithinTransaction({ client, source, batchId, importRunId, checkpoint = async () => {} } = {}) {
  let stage = 'TRANSACTION_REQUIRED';
  try {
    if (typeof client?.query !== 'function') throw new GrhCoreError('TRANSACTION_CLIENT_REQUIRED');
    await client.query('SAVEPOINT grh_core_external_transaction');
    await client.query('RELEASE SAVEPOINT grh_core_external_transaction');
    ({ batchId, importRunId } = explicitSourceIds(batchId, importRunId));
    if (typeof checkpoint !== 'function') throw new GrhCoreError('CHECKPOINT_CALLBACK_REQUIRED');
    stage = 'PUBLICATION_LOCK_FAILED';
    await acquireGrhPublicationLocks(client);
    stage = 'SOURCE_REVALIDATION_FAILED';
    source = await revalidateSource(source);
    stage = 'BATCH_VALIDATION_FAILED';
    await resolveGrhBatch(client, source.manifest, batchId, importRunId);
    await requireCanonicalContracts(client, batchId);
    await rejectSnapshotCohortCollision(client, batchId, source.manifest.source.currentPayrollDate);
    stage = 'ARTIFACT_STAGING_FAILED';
    await insertArtifactStaging(client, batchId, source.manifest);
    await checkpoint('core_artifact_staging', Object.freeze({ records: Object.keys(OUTPUT_TABLES).length }));
    stage = 'PAYROLL_RUNS_FAILED';
    const payrollRuns = await importPayrollRuns(client, batchId, source.artifacts.payrollRuns);
    await checkpoint('core_payroll_runs', Object.freeze({ records: payrollRuns }));
    stage = 'PAYROLL_SNAPSHOT_FAILED';
    const payrollSnapshot = await importPayrollSnapshot(
      client,
      batchId,
      source.artifacts.payrollSnapshot,
      source.manifest.source.currentPayrollDate,
    );
    await checkpoint('core_payroll_snapshot', Object.freeze({ records: payrollSnapshot }));
    stage = 'MOVEMENTS_FAILED';
    const movements = await importMovements(client, batchId, source.artifacts.movements);
    await checkpoint('core_movements', Object.freeze({ records: movements }));
    stage = 'PAYROLL_MONTHLY_FAILED';
    const payrollMonthly = await importPayrollMonthly(client, batchId, source.artifacts.payrollMonthly);
    await checkpoint('core_payroll_monthly', Object.freeze({ records: payrollMonthly }));
    stage = 'RECONCILIATION_FAILED';
    const reconciliation = await importReconciliation(
      client,
      batchId,
      source.artifacts.employmentReconciliation,
      source.manifest.source.currentPayrollDate,
      source.manifest.source.currentPayrollClosureStatus,
    );
    await checkpoint('core_reconciliation', Object.freeze({ records: reconciliation }));
    stage = 'QUALITY_ISSUES_FAILED';
    await insertAggregateQualityIssues(client, batchId, source.manifest);
    await checkpoint('core_quality_issues', Object.freeze({ artifacts: Object.keys(OUTPUT_TABLES).length }));
    stage = 'DATABASE_VERIFICATION_FAILED';
    const counts = await verifyDatabase(client, batchId, source.manifest);
    stage = 'FINAL_SOURCE_REVALIDATION_FAILED';
    await revalidateSource(source);
    stage = 'FINAL_CHECKPOINT_FAILED';
    await checkpoint('core_verified', Object.freeze({ ...counts }));
    return {
      batchId,
      importRunId,
      logicalBytesEstimate: source.logicalBytes,
      rowOverheadEstimate: source.rowOverheadEstimate,
      counts,
      moneySemantics: 'source totals nominal; technicalSourceAmountSum is not a financial KPI',
    };
  } catch (error) {
    throw safeCoreError(error, stage);
  }
}

function singleCliValue(argv, name) {
  const values = argv.filter((arg) => arg.startsWith(`--${name}=`));
  if (values.length > 1) throw new GrhCoreError('AMBIGUOUS_CLI_ARGUMENT');
  return values[0]?.slice(name.length + 3);
}

/** CLI lifecycle only: the caller supplies a new dedicated client and operation. */
export async function runGrhCoreCliTransaction({ client, operation, apply = false } = {}) {
  let transactionStarted = false;
  let commitAttempted = false;
  let committed = false;
  let rollbackAttempted = false;
  let rollbackConfirmed = false;
  try {
    if (typeof client?.connect !== 'function' || typeof client.query !== 'function'
        || typeof client.end !== 'function' || typeof operation !== 'function' || typeof apply !== 'boolean') {
      throw new GrhCoreError('CLI_TRANSACTION_INPUT_INVALID');
    }
    await client.connect();
    await client.query('BEGIN');
    transactionStarted = true;
    const result = await operation(client);
    if (apply) {
      commitAttempted = true;
      await client.query('COMMIT');
      committed = true;
    } else {
      rollbackAttempted = true;
      await client.query('ROLLBACK');
      rollbackConfirmed = true;
    }
    transactionStarted = false;
    return {
      ...result, ok: true, status: apply ? 'completed' : 'verified-rolled-back', source: 'GRH core',
      committed, rollbackConfirmed, requiresLedgerReconciliation: false,
    };
  } catch (error) {
    if (transactionStarted && !commitAttempted && !rollbackAttempted) {
      rollbackAttempted = true;
      try {
        await client.query('ROLLBACK');
        rollbackConfirmed = true;
      } catch { /* Closing the dedicated connection is the only remaining cleanup. */ }
    }
    const uncertainCommit = commitAttempted && !committed;
    return {
      ok: false,
      code: uncertainCommit ? 'GRH_CORE_COMMIT_UNCONFIRMED' : safeCoreError(error, 'CLI_FAILED').code,
      committed: uncertainCommit ? null : committed,
      rollbackConfirmed,
      requiresLedgerReconciliation: uncertainCommit,
    };
  } finally {
    if (typeof client?.end === 'function') {
      try { await client.end(); } catch { /* Do not replace known commit evidence with a cleanup error. */ }
    }
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const preflightOnly = argv.includes('--preflight-only');
  const apply = argv.includes('--apply');
  if (apply && preflightOnly) throw new GrhCoreError('AMBIGUOUS_CLI_MODE');
  for (const arg of argv) {
    if (!['--preflight-only', '--apply', '--confirm-isolated-branch'].includes(arg)
        && !/^--(?:batch-id|import-run-id|data-dir|confirm-production-branch)=.+$/.test(arg)) {
      throw new GrhCoreError('UNSUPPORTED_CLI_ARGUMENT');
    }
  }
  const dataDirArg = singleCliValue(argv, 'data-dir');
  const dataDir = dataDirArg === undefined ? DATA_DIR : new URL(dataDirArg);
  const ids = preflightOnly ? null : explicitSourceIds(
    singleCliValue(argv, 'batch-id'), singleCliValue(argv, 'import-run-id'),
  );
  const databaseUrl = preflightOnly ? null : directCanonicalDatabaseUrl();
  const source = await preflightGrhCore({ dataDir });
  if (preflightOnly) {
    console.log(JSON.stringify({
      status: 'preflight-ok', source: 'GRH core',
      logicalBytesEstimate: source.logicalBytes,
      rowOverheadEstimate: source.rowOverheadEstimate,
      outputs: Object.fromEntries(Object.entries(source.artifacts).map(([name, artifact]) => [name, {
        records: artifact.records, bytes: artifact.bytes, sha256: artifact.sha256,
      }])),
    }, null, 2));
    return;
  }
  const client = new Client({ connectionString: databaseUrl });
  const report = await runGrhCoreCliTransaction({
    client, apply, operation: (transactionClient) => importGrhCoreWithinTransaction({ client: transactionClient, source, ...ids }),
  });
  if (report.ok) console.log(JSON.stringify(report, null, 2));
  else {
    console.error(JSON.stringify(report));
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { await main(); } catch (error) {
    console.error(JSON.stringify({ ok: false, code: safeCoreError(error, 'CLI_FAILED').code,
      committed: false, requiresLedgerReconciliation: false }));
    process.exitCode = 1;
  }
}
