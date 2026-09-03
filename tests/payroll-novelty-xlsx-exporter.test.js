import assert from 'node:assert/strict';
import test from 'node:test';
import readXlsxFile from 'read-excel-file/node';

import {
  createPayrollNoveltyXlsx,
  createPayrollNoveltyXlsxArtifact,
  PAYROLL_NOVELTY_XLSX_MIME,
  payrollNoveltyXlsxFileName,
} from '../assets/payroll-novelty-xlsx-exporter.js';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function snapshot(overrides = {}) {
  return {
    id: ID,
    contractVersion: 'payroll-novelty-batch.v1',
    sourceMode: 'bulk',
    periodMonth: '2026-08-01',
    payrollType: 'monthly',
    status: 'approved',
    exportable: true,
    grhMutation: false,
    payrollCalculated: false,
    payrollPosted: false,
    rowCount: 2,
    rows: [
      {
        rowOrdinal: 1,
        legajo: '12345678901234567890',
        conceptSourceId: '98765432109876543210',
        costCenterSourceId: '18446744073709551615',
        adjustmentMonth: null,
        quantityDecimal: null,
        amountCents: '9223372036854775807',
        movementType: 'standard',
        legalInstrument: 'Resolución 10/2026',
        observation: 'Novedad aprobada con precisión exacta.',
        forced: false,
      },
      {
        rowOrdinal: 2,
        legajo: '0',
        conceptSourceId: '0',
        costCenterSourceId: null,
        adjustmentMonth: null,
        quantityDecimal: '1.25',
        amountCents: '-9223372036854775808',
        movementType: 'adjustment',
        legalInstrument: '',
        observation: '',
        forced: false,
      },
    ],
    ...overrides,
  };
}

function storedZipEntries(bytes) {
  const entries = new Map();
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    assert.equal(view.getUint16(8, true), 0, 'el XLSX usa ZIP determinístico sin compresión');
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return entries;
}

test('genera XLSX OOXML determinístico con nombre profesional', () => {
  const first = createPayrollNoveltyXlsxArtifact(snapshot());
  const second = createPayrollNoveltyXlsxArtifact(snapshot());
  assert.equal(first.fileName,
    'municontrol_revision-novedades-nomina_2026-08_aaaaaaaa.xlsx');
  assert.equal(payrollNoveltyXlsxFileName(snapshot()), first.fileName);
  assert.equal(first.mimeType, PAYROLL_NOVELTY_XLSX_MIME);
  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual(createPayrollNoveltyXlsx(snapshot()), first.bytes);
  assert.deepEqual([...first.bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.deepEqual([...storedZipEntries(first.bytes).keys()].sort(), [
    '[Content_Types].xml',
    '_rels/.rels',
    'docProps/app.xml',
    'docProps/core.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
  ]);
});

test('preserva identificadores de 20 dígitos e int64 como STRING explícito', async () => {
  const artifact = createPayrollNoveltyXlsxArtifact(snapshot());
  const entries = storedZipEntries(artifact.bytes);
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /<c r="D2" s="0" t="inlineStr"><is><t xml:space="preserve">12345678901234567890<\/t>/);
  assert.match(sheet, /<c r="E2" s="0" t="inlineStr"><is><t xml:space="preserve">98765432109876543210<\/t>/);
  assert.match(sheet, /<c r="F2" s="0" t="inlineStr"><is><t xml:space="preserve">18446744073709551615<\/t>/);
  assert.match(sheet, /<c r="I2" s="0" t="inlineStr"><is><t xml:space="preserve">9223372036854775807<\/t>/);
  assert.match(sheet, /<c r="I3" s="0" t="inlineStr"><is><t xml:space="preserve">-9223372036854775808<\/t>/);
  const cells = [...sheet.matchAll(/<c\b[^>]*>/g)].map((match) => match[0]);
  assert.equal(cells.length, 42);
  assert.equal(cells.every((cell) => /t="inlineStr"/.test(cell)), true);
  assert.doesNotMatch(sheet, /<v>|<f>|<c\b[^>]*\bt="n"/);
  assert.doesNotMatch(sheet, /['\t]/);

  const workbook = await readXlsxFile(Buffer.from(artifact.bytes));
  const decoded = Array.isArray(workbook[0]?.data) ? workbook[0].data : workbook;
  assert.deepEqual(decoded, [
    ['periodo', 'tipo_liquidacion', 'orden', 'legajo', 'concepto', 'centro_costo',
      'mes_ajuste', 'unidades', 'importe_centavos', 'movimiento', 'instrumento_legal',
      'observacion', 'forzado', 'lote_municontrol'],
    ['2026-08-01', 'monthly', '1', '12345678901234567890',
      '98765432109876543210', '18446744073709551615', null, null,
      '9223372036854775807', 'standard', 'Resolución 10/2026',
      'Novedad aprobada con precisión exacta.', 'NO', ID],
    ['2026-08-01', 'monthly', '2', '0', '0', null, null, '1.25',
      '-9223372036854775808', 'adjustment', null, null, 'NO', ID],
  ]);
});

test('incluye encabezado profesional, autofiltro y primera fila congelada', () => {
  const sheet = storedZipEntries(
    createPayrollNoveltyXlsxArtifact(snapshot()).bytes,
  ).get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /<row r="1"[^>]*>.*periodo.*legajo.*concepto.*centro_costo.*unidades.*importe_centavos.*observacion.*lote_municontrol.*<\/row>/s);
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<autoFilter ref="A1:N3"\/>/);
});

test('exporta primera quincena al XLSX con su código canónico estable', async () => {
  const artifact = createPayrollNoveltyXlsxArtifact(snapshot({
    payrollType: 'first_fortnight',
  }));
  const workbook = await readXlsxFile(Buffer.from(artifact.bytes));
  const decoded = Array.isArray(workbook[0]?.data) ? workbook[0].data : workbook;
  assert.equal(decoded[1][1], 'first_fortnight');
  assert.equal(decoded[2][1], 'first_fortnight');
});

test('rechaza exactamente los snapshots que no son aprobados o pierden int64', () => {
  assert.throws(
    () => createPayrollNoveltyXlsxArtifact(snapshot({ status: 'submitted', exportable: false })),
    (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_NOT_ALLOWED',
  );
  const invalidAmount = snapshot();
  invalidAmount.rows = invalidAmount.rows.map((row, index) => index === 0
    ? { ...row, amountCents: '9223372036854775808' }
    : row);
  assert.throws(
    () => createPayrollNoveltyXlsxArtifact(invalidAmount),
    (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_ROW_INVALID',
  );
});

test('rechaza snapshots que contradicen cantidad, modo individual o mes de ajuste', () => {
  const withoutValue = snapshot();
  withoutValue.rows = withoutValue.rows.map((row, index) => index === 0
    ? { ...row, quantityDecimal: null, amountCents: null }
    : row);
  assert.throws(
    () => createPayrollNoveltyXlsxArtifact(withoutValue),
    (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_ROW_INVALID',
  );

  assert.throws(
    () => createPayrollNoveltyXlsxArtifact(snapshot({ sourceMode: 'individual' })),
    (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_NOT_ALLOWED',
  );

  const futureAdjustment = snapshot();
  futureAdjustment.rows = futureAdjustment.rows.map((row, index) => index === 0
    ? { ...row, adjustmentMonth: '2026-09-01' }
    : row);
  assert.throws(
    () => createPayrollNoveltyXlsxArtifact(futureAdjustment),
    (error) => error.code === 'PAYROLL_NOVELTY_EXPORT_ROW_INVALID',
  );
});
