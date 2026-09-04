import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { readSheet } from 'read-excel-file/node';
import {
  PAYROLL_ART_CSV_BUNDLE_VERSION, PAYROLL_ART_FORMULA_VERSION,
  PAYROLL_ART_NOELIA_INPUT_CONTRACT_VERSION, PAYROLL_ART_NOELIA_REPORT_CONTRACT_VERSION,
  PayrollArtReportError, buildPayrollArtNoeliaReport, createPayrollArtCsvBundle,
} from '../assets/payroll-art-report.js';
import { createPayrollArtOfficePack } from '../assets/payroll-art-report-exporter.js';

function cuil(dni, prefix = '20') {
  const body = `${prefix}${dni.padStart(8, '0')}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(body[index]) * weight, 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return `${body}${check}`;
}
function row(overrides = {}) {
  return {
    galenoRowNumbers: [2], sussRowNumbers: [2], dni: '12345678', cuil: cuil('12345678'),
    sex: 'M', workedDays: '31', concept993Cents: '100000', concept995Cents: '5000',
    nonTaxableCents: '2500', declaredSalaryCents: '105100', formulaSalaryCents: '105000',
    differenceCents: '100', errorCodes: [], warningCodes: ['ART_DECLARED_SALARY_DIFFERENCE'],
    ...overrides,
  };
}
function input(overrides = {}) {
  const rows = overrides.rows || [row()];
  return {
    contractVersion: PAYROLL_ART_NOELIA_INPUT_CONTRACT_VERSION,
    tenantId: '11111111-1111-4111-8111-111111111111', actorId: '22222222-2222-4222-8222-222222222222',
    requestedAt: '2026-09-04T15:30:00.000Z', period: '2026-08',
    source: { snapshotId: 'noelia-art-2026-08', sha256: `sha256:${'a'.repeat(64)}`,
      cutoffAt: '2026-09-03T18:45:47.000Z', rowCount: rows.length, includesPersonalRecords: true,
      sourceFiles: [
        { kind: 'galeno', sha256: `sha256:${'b'.repeat(64)}`, rowCount: 1 },
        { kind: 'suss', sha256: `sha256:${'c'.repeat(64)}`, rowCount: 1 },
      ] },
    rows, ...overrides,
  };
}

test('arma reporte válido, exacto y con diferencia SUSS informativa', async () => {
  const report = await buildPayrollArtNoeliaReport(input(), { cryptoImpl: webcrypto });
  assert.equal(report.contractVersion, PAYROLL_ART_NOELIA_REPORT_CONTRACT_VERSION);
  assert.equal(report.formulaVersion, PAYROLL_ART_FORMULA_VERSION);
  assert.equal(report.status, 'ready_with_observations');
  assert.equal(report.readyForReview, true);
  assert.equal(report.officialSubmissionAllowed, false);
  assert.equal(report.acceptedRows[0].salaryCents, '105000');
  assert.equal(report.acceptedRows[0].differenceCents, '100');
  assert.deepEqual(report.summary, {
    sourceRows: 1, scopedRows: 1, excludedByScope: 0, acceptedRows: 1, rejectedRows: 0,
    duplicateGroups: 0, comparisonRows: 1, comparisonMatches: 0, comparisonMismatches: 1,
    concept993TotalCents: '100000', concept995TotalCents: '5000', nonTaxableTotalCents: '2500',
    declaredSalaryTotalCents: '105100', salaryTotalCents: '105000', differenceTotalCents: '100',
  });
  assert.equal(Object.isFrozen(report), true);
});

test('genera CSV y declara el universo único de filas aceptadas', async () => {
  const report = await buildPayrollArtNoeliaReport(input(), { cryptoImpl: webcrypto });
  const bundle = await createPayrollArtCsvBundle(report, { cryptoImpl: webcrypto });
  assert.equal(bundle.contractVersion, PAYROLL_ART_CSV_BUNDLE_VERSION);
  assert.deepEqual(bundle.files.map((file) => file.kind), ['detalle', 'rechazados', 'resumen', 'trazabilidad']);
  const detail = bundle.files.find((file) => file.kind === 'detalle');
  const summary = bundle.files.find((file) => file.kind === 'resumen');
  assert.match(detail.content, /fila_galeno;fila_suss;no_imponible_ars;sueldo_declarado_suss_ars/);
  assert.match(summary.content, /diferencias_informativas;1/);
  assert.match(summary.content, /universo_comparaciones_y_totales;UNICAMENTE_FILAS_ACEPTADAS_CON_DATO_DISPONIBLE/);
  assert.equal(bundle.files.every((file) => /^sha256:[a-f0-9]{64}$/.test(file.sha256)), true);
});

test('No imponible y sueldo SUSS son opcionales y no se exportan como cero inventado', async () => {
  const report = await buildPayrollArtNoeliaReport(input({ rows: [row({
    nonTaxableCents: null, declaredSalaryCents: null, differenceCents: null,
    errorCodes: ['GALENO_NON_TAXABLE_INVALID', 'SUSS_DECLARED_SALARY_INVALID'], warningCodes: [],
  })] }), { cryptoImpl: webcrypto });
  assert.equal(report.acceptedRows.length, 1);
  assert.equal(report.rejectedRows.length, 0);
  assert.equal(report.acceptedRows[0].nonTaxableCents, null);
  assert.equal(report.acceptedRows[0].declaredSalaryCents, null);
  assert.equal(report.acceptedRows[0].differenceCents, null);
  assert.deepEqual(report.acceptedRows[0].warningCodes, ['ART_DECLARED_SALARY_UNAVAILABLE', 'ART_NON_TAXABLE_UNAVAILABLE']);
  assert.equal(report.summary.comparisonRows, 0);
  assert.equal(report.summary.declaredSalaryTotalCents, '0');
  const pack = await createPayrollArtOfficePack(report, { cryptoImpl: webcrypto });
  const xlsx = pack.files.find((file) => file.fileName.endsWith('.xlsx'));
  const detail = await readSheet(Buffer.from(xlsx.bytes), 'Detalle nominal');
  assert.deepEqual(detail[4].slice(-6), ['2', '2', 'No informado', 'No informado', 'No informado', 'Sin comparación SUSS']);
});

test('rechaza referencias de origen vacías, duplicadas o fuera de orden', async () => {
  const report = await buildPayrollArtNoeliaReport(input({ rows: [
    row({ galenoRowNumbers: [], sussRowNumbers: [] }),
    row({ galenoRowNumbers: [4, 3], sussRowNumbers: [3], dni: '87654321', cuil: cuil('87654321', '27') }),
    row({ galenoRowNumbers: [5, 5], sussRowNumbers: [4], dni: '23456789', cuil: cuil('23456789') }),
  ] }), { cryptoImpl: webcrypto });
  assert.equal(report.acceptedRows.length, 0);
  assert.ok(report.rejectedRows[0].errorCodes.includes('ART_NOELIA_ROW_CONTRACT_INVALID'));
  assert.ok(report.rejectedRows[1].errorCodes.includes('ART_GALENO_ROW_NUMBER_INVALID'));
  assert.ok(report.rejectedRows[2].errorCodes.includes('ART_GALENO_ROW_NUMBER_INVALID'));
});

test('comparaciones y totales de diferencias usan sólo filas aceptadas', async () => {
  const report = await buildPayrollArtNoeliaReport(input({ rows: [row(), row({
    galenoRowNumbers: [3], sussRowNumbers: [3], dni: '87654321', cuil: cuil('87654321', '27'),
    sex: '', concept993Cents: '200000', concept995Cents: '0', nonTaxableCents: '10000',
    declaredSalaryCents: '200200', formulaSalaryCents: '200000', differenceCents: '200',
    errorCodes: ['SUSS_SEX_INVALID'],
  })] }), { cryptoImpl: webcrypto });
  assert.equal(report.acceptedRows.length, 1);
  assert.equal(report.rejectedRows.length, 1);
  assert.equal(report.summary.comparisonRows, 1);
  assert.equal(report.summary.comparisonMismatches, 1);
  assert.equal(report.summary.salaryTotalCents, '105000');
  assert.equal(report.summary.declaredSalaryTotalCents, '105100');
  assert.equal(report.summary.differenceTotalCents, '100');
});

test('separa excepciones conservando filas reales y motivos humanos', async () => {
  const report = await buildPayrollArtNoeliaReport(input({ rows: [row(), row({
    galenoRowNumbers: [27, 44], sussRowNumbers: [], dni: '87654321', cuil: cuil('87654321', '27'),
    sex: '', workedDays: '', declaredSalaryCents: null, differenceCents: null,
    errorCodes: ['SUSS_ROW_MISSING'], warningCodes: [],
  })] }), { cryptoImpl: webcrypto });
  assert.equal(report.status, 'generated_with_exceptions');
  assert.deepEqual(report.rejectedRows[0], { rowNumber: 2, galenoRowNumbers: [27, 44], sussRowNumbers: [], errorCodes: ['SUSS_ROW_MISSING'] });
  const pack = await createPayrollArtOfficePack(report, { cryptoImpl: webcrypto });
  const xlsx = pack.files.find((file) => file.fileName.endsWith('.xlsx'));
  const rejected = await readSheet(Buffer.from(xlsx.bytes), 'Rechazados');
  const summary = await readSheet(Buffer.from(xlsx.bytes), 'Resumen');
  assert.deepEqual(rejected[4], [2, '27|44', '—', 'El CUIL aparece en GALENO, pero no en la planilla SUSS.', 'SUSS_ROW_MISSING']);
  assert.ok(summary.flat().some((value) => String(value).includes('Comparaciones y totales se calculan únicamente sobre filas aceptadas')));
});

test('rechaza fila malformada y fuente inválida sin romper ejecución', async () => {
  const malformed = await buildPayrollArtNoeliaReport(input({ rows: [row({ galenoRowNumbers: '2' })] }), { cryptoImpl: webcrypto });
  assert.deepEqual(malformed.rejectedRows[0].errorCodes, ['ART_GALENO_ROW_NUMBER_INVALID']);
  const invalid = input();
  invalid.source.sourceFiles[1] = { kind: 'galeno', sha256: `sha256:${'c'.repeat(64)}`, rowCount: 1 };
  await assert.rejects(buildPayrollArtNoeliaReport(invalid, { cryptoImpl: webcrypto }),
    (error) => error instanceof PayrollArtReportError && error.code === 'ART_NOELIA_SOURCE_FILES_INVALID');
});
