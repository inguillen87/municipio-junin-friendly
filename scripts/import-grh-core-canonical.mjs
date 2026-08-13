import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { Client } from '@neondatabase/serverless';

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
const MANIFEST_URL = new URL('grh-core-manifest.json', DATA_DIR);
const LOCK_NAME = 'municipio-junin-friendly:canonical-grh-core:v2';
const IMPORT_CONTRACT_VERSION = 'grh-core-canonical-v2';
const EXPECTED_PROFILE = 'grh-core-junin-2026-08';
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

function assertManifest(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest?.profile !== EXPECTED_PROFILE) {
    throw new Error(`Perfil GRH core no soportado: ${manifest?.profile}`);
  }
  if (manifest?.quality?.strictSnapshot !== true) {
    throw new Error('El importador exige un snapshot GRH estricto, sin --allow-source-drift.');
  }
  if (manifest?.quality?.crossSourceJoinByIdPersona !== 0) {
    throw new Error('El manifiesto GRH informa un JOIN prohibido por IDPERSONA.');
  }
  for (const [table, expected] of Object.entries(EXPECTED_SOURCE_COUNTS)) {
    if (Number(manifest?.sourceCounts?.[table]) !== expected) {
      throw new Error(`Conteo fuente GRH invalido en ${table}: ${manifest?.sourceCounts?.[table]} != ${expected}`);
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
    throw new Error('La reconciliacion GRH 882/854/28 no supera el gate de aceptacion.');
  }
  const semantics = String(manifest?.quality?.moneySemantics ?? '');
  if (!semantics.includes('technicalSourceAmountSum') || !semantics.includes('never a financial KPI')) {
    throw new Error('Falta la declaracion que prohibe usar technicalSourceAmountSum como KPI financiero.');
  }
  if (
    manifest?.source?.currentPayrollClosureStatus !== 'open'
    || manifest?.source?.latestClosedPayrollDate !== '2026-07-31'
    || manifest?.quality?.payrollRunClosure?.currentRun !== 'open'
    || manifest?.quality?.payrollRunClosure?.latestClosedDate !== '2026-07-31'
  ) {
    throw new Error('El manifiesto no acredita agosto abierto y julio 2026 como ultimo cierre.');
  }
  if (!String(manifest?.quality?.payrollRunClosure?.executiveFinancialRule ?? '').includes('closureStatus=closed')) {
    throw new Error('Falta el gate que limita los KPI financieros a corridas cerradas.');
  }
}

async function preflight() {
  const manifest = JSON.parse(await readFile(MANIFEST_URL, 'utf8'));
  assertManifest(manifest);
  const artifacts = {};
  for (const outputName of Object.keys(OUTPUT_TABLES)) {
    const descriptor = manifest.outputs?.[outputName];
    const file = requiredText(descriptor?.file, `outputs.${outputName}.file`);
    const path = new URL(file, DATA_DIR);
    artifacts[outputName] = {
      path,
      descriptor,
      ...(await verifyStreamArtifact(path, descriptor, `GRH core ${outputName}`)),
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
    throw new Error('Los outputs GRH no preservan los conteos criticos 854/2450.');
  }
  return { manifest, artifacts, logicalBytes, rowOverheadEstimate };
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

async function resolveGrhBatch(client, manifest) {
  const sha256 = requiredText(manifest?.source?.sha256, 'source.sha256').toUpperCase();
  const result = await client.query(
    `SELECT id, source_database, source_file_name, source_sha256
       FROM source_import_batch
      WHERE source_system = 'GRH' AND source_sha256 = $1`,
    [sha256],
  );
  if (result.rowCount !== 1) {
    throw new Error(
      'Falta el batch GRH canonico del mismo dump; ejecute primero import-rrhh-neon y promote-canonical-grh.',
    );
  }
  const batch = result.rows[0];
  if (batch.source_database !== 'grh_junin' || batch.source_sha256.trim() !== sha256) {
    throw new Error('El batch GRH existente no corresponde al dump core verificado.');
  }
  return batch.id;
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
      const payrollDate = assertIsoDate(key?.payrollDate, 'payrollRuns.sourceKey.payrollDate');
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
      const payrollDate = assertIsoDate(key.payrollDate, 'payrollMonthly.sourceKey.payrollDate');
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
         LEFT JOIN LATERAL (
           SELECT snapshot.payroll_run_id
           FROM payroll_snapshot_assignment snapshot
           WHERE snapshot.employment_contract_id = contract.id
             AND snapshot.snapshot_date = $3::date
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

async function main() {
  const preflightOnly = process.argv.includes('--preflight-only');
  const databaseUrl = preflightOnly ? null : directCanonicalDatabaseUrl();
  const source = await preflight();
  if (preflightOnly) {
    console.log(JSON.stringify({
      status: 'preflight-ok',
      source: 'GRH core',
      logicalBytesEstimate: source.logicalBytes,
      rowOverheadEstimate: source.rowOverheadEstimate,
      outputs: Object.fromEntries(
        Object.entries(source.artifacts).map(([name, artifact]) => [name, {
          records: artifact.records,
          bytes: artifact.bytes,
          sha256: artifact.sha256,
        }]),
      ),
    }, null, 2));
    return;
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [LOCK_NAME]);
    const batchId = await resolveGrhBatch(client, source.manifest);
    await requireCanonicalContracts(client, batchId);
    await insertArtifactStaging(client, batchId, source.manifest);
    await importPayrollRuns(client, batchId, source.artifacts.payrollRuns);
    await importPayrollSnapshot(
      client,
      batchId,
      source.artifacts.payrollSnapshot,
      source.manifest.source.currentPayrollDate,
    );
    await importMovements(client, batchId, source.artifacts.movements);
    await importPayrollMonthly(client, batchId, source.artifacts.payrollMonthly);
    await importReconciliation(
      client,
      batchId,
      source.artifacts.employmentReconciliation,
      source.manifest.source.currentPayrollDate,
      source.manifest.source.currentPayrollClosureStatus,
    );
    await insertAggregateQualityIssues(client, batchId, source.manifest);
    const counts = await verifyDatabase(client, batchId, source.manifest);
    await client.query('COMMIT');
    console.log(JSON.stringify({
      status: 'completed',
      source: 'GRH core',
      batchId,
      logicalBytesEstimate: source.logicalBytes,
      rowOverheadEstimate: source.rowOverheadEstimate,
      counts,
      moneySemantics: 'source totals nominal; technicalSourceAmountSum is not a financial KPI',
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
