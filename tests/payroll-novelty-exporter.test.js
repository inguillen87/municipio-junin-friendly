import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPayrollNoveltyCsv,
  payrollNoveltyCsvFileName,
} from '../assets/payroll-novelty-exporter.js';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function snapshot(overrides = {}) {
  return {
    id: ID,
    contractVersion: 'payroll-novelty-batch.v1',
    sourceMode: 'individual',
    periodMonth: '2026-08-01',
    payrollType: 'monthly',
    status: 'approved',
    exportable: true,
    grhMutation: false,
    payrollCalculated: false,
    payrollPosted: false,
    rows: [{
      rowOrdinal: 1,
      legajo: '571',
      conceptSourceId: '120',
      costCenterSourceId: '42',
      adjustmentMonth: null,
      quantityDecimal: '1.5',
      amountCents: '125050',
      movementType: 'standard',
      legalInstrument: 'Resolución 10/2026',
      observation: 'Novedad revisada y aprobada.',
      forced: false,
    }],
    ...overrides,
  };
}

test('exporta CSV UTF-8 determinístico desde la instantánea aprobada', () => {
  const csv = createPayrollNoveltyCsv(snapshot());
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /^\uFEFFperiodo;tipo_liquidacion;orden;legajo;/);
  assert.match(csv, /2026-08-01;monthly;1;571;120;42;;1\.5;125050;standard/);
  assert.match(csv, new RegExp(`${ID}\\r\\n$`));
  assert.equal(payrollNoveltyCsvFileName(snapshot()), 'novedades-aprobadas-2026-08-aaaaaaaa.csv');
  assert.equal(csv, createPayrollNoveltyCsv(snapshot()));
});

test('exporta primera quincena con su código canónico estable', () => {
  const csv = createPayrollNoveltyCsv(snapshot({ payrollType: 'first_fortnight' }));
  assert.match(csv, /2026-08-01;first_fortnight;1;571;/);
});

test('neutraliza fórmulas en texto sin convertir números canónicos', () => {
  const csv = createPayrollNoveltyCsv(snapshot({
    rows: [{
      ...snapshot().rows[0],
      legalInstrument: '+SUM(A1:A2)',
      observation: '=HYPERLINK("https://invalid.example")',
    }],
  }));
  assert.match(csv, /'\+SUM\(A1:A2\)/);
  assert.match(csv, /'=HYPERLINK\(""https:\/\/invalid\.example""\)/);
  assert.doesNotMatch(csv, /;=HYPERLINK/);
  assert.match(csv, /;571;120;42;/);
});

test('bloquea borradores, flags ampliados y filas fuera de contrato', () => {
  for (const value of [
    snapshot({ status: 'submitted', exportable: false }),
    snapshot({ payrollPosted: true }),
    snapshot({ grhMutation: true }),
    snapshot({ rows: [] }),
  ]) {
    assert.throws(
      () => createPayrollNoveltyCsv(value),
      (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_NOT_ALLOWED',
    );
  }
  assert.throws(
    () => createPayrollNoveltyCsv(snapshot({
      rows: [{ ...snapshot().rows[0], amountCents: '12.50' }],
    })),
    (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_ROW_INVALID',
  );
});

test('rechaza snapshots que contradicen cantidad, modo individual o mes de ajuste', () => {
  assert.throws(
    () => createPayrollNoveltyCsv(snapshot({
      rows: [{ ...snapshot().rows[0], quantityDecimal: null, amountCents: null }],
    })),
    (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_ROW_INVALID',
  );
  assert.throws(
    () => createPayrollNoveltyCsv(snapshot({
      rows: [
        snapshot().rows[0],
        { ...snapshot().rows[0], rowOrdinal: 2, legajo: '572' },
      ],
    })),
    (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_NOT_ALLOWED',
  );
  assert.throws(
    () => createPayrollNoveltyCsv(snapshot({
      rows: [{ ...snapshot().rows[0], adjustmentMonth: '2026-09-01' }],
    })),
    (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_ROW_INVALID',
  );
});
