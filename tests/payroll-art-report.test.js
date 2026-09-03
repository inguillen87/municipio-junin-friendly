import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_ART_CSV_BUNDLE_VERSION,
  PAYROLL_ART_EXPORT_PROFILE_VERSION,
  PAYROLL_ART_FORMULA_VERSION,
  PAYROLL_ART_INPUT_CONTRACT_VERSION,
  PAYROLL_ART_REPORT_CONTRACT_VERSION,
  PayrollArtReportError,
  buildPayrollArtReport,
  createPayrollArtCsvBundle,
} from '../assets/payroll-art-report.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function cuil(dni, prefix = '20') {
  const body = `${prefix}${dni.padStart(8, '0')}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(body[index]) * weight, 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return `${body}${check}`;
}

function row({
  rowNumber = 1,
  liquidationId = 'mensual-2026-08-j42',
  jurisdiction = '42',
  legajo = '1001',
  dni = '12345678',
  cuilValue = cuil(dni),
  sex = 'M',
  workedDays = '31',
  concept993Cents = '10000000',
  concept995Cents = '250000',
} = {}) {
  return {
    rowNumber,
    liquidationId,
    jurisdiction,
    legajo,
    dni,
    cuil: cuilValue,
    sex,
    workedDays,
    concept993Cents,
    concept995Cents,
  };
}

function input(overrides = {}) {
  const rows = overrides.rows || [
    row(),
    row({
      rowNumber: 2,
      liquidationId: 'mensual-2026-08-j55',
      jurisdiction: '55',
      legajo: '2001',
      dni: '87654321',
      sex: 'F',
      concept993Cents: '8000000',
      concept995Cents: '0',
    }),
  ];
  return {
    contractVersion: PAYROLL_ART_INPUT_CONTRACT_VERSION,
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    requestedAt: '2026-09-03T21:00:00.000Z',
    period: '2026-08',
    scope: 'all',
    source: {
      snapshotId: 'grh-payroll-2026-08-safe-fixture',
      sha256: `sha256:${'a'.repeat(64)}`,
      cutoffAt: '2026-09-03T20:30:00.000Z',
      rowCount: rows.length,
      includesPersonalRecords: true,
    },
    rows,
    ...overrides,
  };
}

function hasCode(code) {
  return (error) => error instanceof PayrollArtReportError && error.code === code;
}

test('calcula sueldo ART como 993 + 995 y conserva totales exactos', async () => {
  const report = await buildPayrollArtReport(input(), { cryptoImpl: webcrypto });

  assert.equal(report.contractVersion, PAYROLL_ART_REPORT_CONTRACT_VERSION);
  assert.equal(report.formulaVersion, PAYROLL_ART_FORMULA_VERSION);
  assert.equal(report.exportProfileVersion, PAYROLL_ART_EXPORT_PROFILE_VERSION);
  assert.equal(report.status, 'ready_for_authorized_review');
  assert.equal(report.readyForReview, true);
  assert.equal(report.officialSubmissionAllowed, false);
  assert.deepEqual(report.acceptedRows.map((item) => item.salaryCents), ['10250000', '8000000']);
  assert.equal(report.summary.concept993TotalCents, '18000000');
  assert.equal(report.summary.concept995TotalCents, '250000');
  assert.equal(report.summary.salaryTotalCents, '18250000');
  assert.equal(report.traceability.formula, 'concepto 993 + concepto 995');
  assert.equal(report.traceability.rulesInferred, false);
  assert.equal(report.traceability.persistencePerformed, false);
  assert.equal(report.traceability.officialArtifactGenerated, false);
  assert.match(report.traceability.reportSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.acceptedRows), true);
  assert.equal(Object.isFrozen(report.acceptedRows[0]), true);
});

test('separa J42/J55 sin mezclar poblaciones ni totales', async () => {
  const report = await buildPayrollArtReport(input({ scope: '42' }), { cryptoImpl: webcrypto });

  assert.equal(report.summary.sourceRows, 2);
  assert.equal(report.summary.scopedRows, 1);
  assert.equal(report.summary.excludedByScope, 1);
  assert.equal(report.summary.salaryTotalCents, '10250000');
  assert.deepEqual(report.acceptedRows.map((item) => item.jurisdiction), ['42']);
});

test('rechaza faltantes e inconsistencias sin corregir ni exponer la fila', async () => {
  const marker = 'PERSONA-SECRETA-778899';
  const invalid = {
    ...row({
      dni: '12345678',
      cuilValue: cuil('87654321'),
      sex: 'NO_INFORMADO',
      workedDays: '32',
      concept993Cents: null,
      concept995Cents: '-1',
    }),
    nombre: marker,
  };
  const report = await buildPayrollArtReport(input({ rows: [invalid] }), { cryptoImpl: webcrypto });

  assert.equal(report.status, 'blocked_by_validation');
  assert.equal(report.acceptedRows.length, 0);
  assert.deepEqual(report.rejectedRows, [{
    rowNumber: 1,
    errorCodes: [
      'ART_CONCEPT_993_MISSING',
      'ART_CONCEPT_995_INVALID',
      'ART_DOCUMENT_MISMATCH',
      'ART_ROW_CONTRACT_INVALID',
      'ART_SEX_INVALID',
      'ART_WORKED_DAYS_INVALID',
    ],
  }]);
  assert.doesNotMatch(JSON.stringify(report.rejectedRows), /PERSONA-SECRETA|778899|nombre/);
});

test('valida CUIL y su dígito verificador de forma independiente', async () => {
  const wrongChecksum = `${cuil('12345678').slice(0, 10)}0`;
  const report = await buildPayrollArtReport(input({
    rows: [row({ cuilValue: wrongChecksum })],
  }), { cryptoImpl: webcrypto });

  assert.deepEqual(report.rejectedRows[0].errorCodes, ['ART_CUIL_CHECKSUM_INVALID']);
});

test('marca todas las filas de una clave persona/liquidación/período duplicada', async () => {
  const rows = [
    row(),
    row({ rowNumber: 2, legajo: '1002' }),
  ];
  const report = await buildPayrollArtReport(input({ rows }), { cryptoImpl: webcrypto });

  assert.equal(report.summary.duplicateGroups, 1);
  assert.equal(report.summary.acceptedRows, 0);
  assert.equal(report.summary.rejectedRows, 2);
  for (const rejected of report.rejectedRows) {
    assert.deepEqual(rejected.errorCodes, ['ART_DUPLICATE_PERSON_LIQUIDATION_PERIOD']);
  }
});

test('produce cuatro CSV determinísticos, compatibles con Excel y con huellas', async () => {
  const firstReport = await buildPayrollArtReport(input(), { cryptoImpl: webcrypto });
  const secondReport = await buildPayrollArtReport(input(), { cryptoImpl: webcrypto });
  const first = await createPayrollArtCsvBundle(firstReport, { cryptoImpl: webcrypto });
  const second = await createPayrollArtCsvBundle(secondReport, { cryptoImpl: webcrypto });

  assert.equal(first.contractVersion, PAYROLL_ART_CSV_BUNDLE_VERSION);
  assert.deepEqual(firstReport, secondReport);
  assert.deepEqual(first, second);
  assert.deepEqual(first.files.map((file) => file.kind), [
    'detalle', 'rechazados', 'resumen', 'trazabilidad',
  ]);
  assert.match(first.bundleSha256, /^sha256:[a-f0-9]{64}$/);
  for (const file of first.files) {
    assert.equal(file.content.charCodeAt(0), 0xfeff);
    assert.match(file.content, /\r\n$/);
    assert.doesNotMatch(file.content, /(?<!\r)\n/);
    assert.match(file.fileName, /^municontrol_art-provincia_2026-08_todos_[a-f0-9]{12}_.+\.csv$/);
    assert.match(file.sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(file.byteLength, new TextEncoder().encode(file.content).byteLength);
  }
  const detail = first.files.find((file) => file.kind === 'detalle');
  assert.match(detail.content, /concepto_993_ars;concepto_995_ars;sueldo_art_ars/);
  assert.match(detail.content, /100000,00;2500,00;102500,00/);
  assert.equal(detail.containsPersonalRecords, true);
  const summary = first.files.find((file) => file.kind === 'resumen');
  assert.match(summary.content, /masa_salarial_art_ars;182500,00/);
  assert.match(summary.content, /presentacion_oficial_habilitada;NO/);
  const trace = first.files.find((file) => file.kind === 'trazabilidad');
  assert.match(trace.content, /sha256_detalle;sha256:[a-f0-9]{64}/);
  assert.match(trace.content, /artefacto_oficial_generado;NO/);
  assert.equal(trace.containsPersonalRecords, false);
  assert.equal(Object.isFrozen(first.files), true);
});

test('el CSV de rechazados identifica fila y códigos, nunca datos personales', async () => {
  const marker = 'FORMULA-SECRETA-556677';
  const report = await buildPayrollArtReport(input({
    rows: [{ ...row(), liquidationId: `=${marker}` }],
  }), { cryptoImpl: webcrypto });
  const bundle = await createPayrollArtCsvBundle(report, { cryptoImpl: webcrypto });
  const rejected = bundle.files.find((file) => file.kind === 'rechazados');

  assert.match(rejected.content, /ART_LIQUIDATION_ID_INVALID/);
  assert.doesNotMatch(rejected.content, /FORMULA-SECRETA|556677|12345678|20123456786/);
  assert.equal(rejected.containsPersonalRecords, false);
});

test('bloquea overflow por fila y por total en vez de perder precisión', async () => {
  const rowOverflow = await buildPayrollArtReport(input({
    rows: [row({ concept993Cents: '9223372036854775807', concept995Cents: '1' })],
  }), { cryptoImpl: webcrypto });
  assert.deepEqual(rowOverflow.rejectedRows[0].errorCodes, ['ART_SALARY_OUT_OF_RANGE']);

  await assert.rejects(
    buildPayrollArtReport(input({
      rows: [
        row({ concept993Cents: '9223372036854775807', concept995Cents: '0' }),
        row({
          rowNumber: 2,
          liquidationId: 'mensual-2026-08-j55',
          jurisdiction: '55',
          legajo: '2001',
          dni: '87654321',
          concept993Cents: '1',
          concept995Cents: '0',
        }),
      ],
    }), { cryptoImpl: webcrypto }),
    hasCode('ART_TOTAL_OUT_OF_RANGE'),
  );
});

test('el contrato superior es exacto y la cantidad debe coincidir con la fuente', async () => {
  await assert.rejects(
    buildPayrollArtReport(input({ source: {
      ...input().source,
      rowCount: 999,
    } }), { cryptoImpl: webcrypto }),
    hasCode('ART_INPUT_CONTRACT_INVALID'),
  );
  await assert.rejects(
    buildPayrollArtReport({ ...input(), unexpected: true }, { cryptoImpl: webcrypto }),
    hasCode('ART_INPUT_CONTRACT_INVALID'),
  );
  await assert.rejects(
    buildPayrollArtReport(input({ source: {
      ...input().source,
      sha256: 'not-a-hash',
    } }), { cryptoImpl: webcrypto }),
    hasCode('ART_INPUT_CONTRACT_INVALID'),
  );
});

test('no acepta reportes fabricados ni depende de red, storage, DOM o logs', async () => {
  await assert.rejects(
    createPayrollArtCsvBundle({ contractVersion: PAYROLL_ART_REPORT_CONTRACT_VERSION }, {
      cryptoImpl: webcrypto,
    }),
    hasCode('ART_REPORT_NOT_TRUSTED'),
  );
  const source = fs.readFileSync(
    new URL('../assets/payroll-art-report.js', import.meta.url), 'utf8',
  );
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|innerHTML|outerHTML|document\./);
  assert.doesNotMatch(source, /from ['"]node:/);
  assert.match(source, /BigInt\(/);
  assert.match(source, /subtle\.digest\('SHA-256'/);
});
