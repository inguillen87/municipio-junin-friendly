import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  JURISDICTION_NET_CONTROL_FORMULA_VERSION,
  JURISDICTION_NET_CONTROL_HEADER,
  JURISDICTION_NET_CONTROL_MAX_BYTES,
  JURISDICTION_NET_CONTROL_VERSION,
  JurisdictionNetControlError,
  createJurisdictionNetControlCsv,
  formatJurisdictionControlCents,
  jurisdictionControlAmountToCents,
  mountJurisdictionNetControlXlsx,
  parseJurisdictionNetControlRows,
  prepareJurisdictionNetControlWorkbook,
  validateJurisdictionNetControlFormulaXml,
} from '../assets/monthly-close-jurisdiction-xlsx-adapter.js';

const sha256 = `sha256:${'a'.repeat(64)}`;
const J42_REPARTITIONS = ['01', '02', '03', '04', '06', '07', '13', '14', '15', '16', '40'];
const J55_REPARTITIONS = [
  '17', '18', '19', '20', '21', '22', '23', '24', '25',
  '26', '27', '33', '35', '36', '37', '38', '39',
];

function repartitionRows(codes, amounts) {
  return codes.map((code, index) => [`REP.${code}`, amounts[index] || '0', null, null]);
}

function matchedRows() {
  return [
    ['JURISDICCION 42', null, null, null],
    ...repartitionRows(J42_REPARTITIONS, ['10.00999999', '20.02000001']),
    ['TOTAL', '30.030000001', '30.03', '0'],
    [null, null, null, null],
    ['JURISDICCION 55', null, null, null],
    ...repartitionRows(J55_REPARTITIONS, ['40.04', '50.05']),
    ['TOTAL', '90.09', '90.090000001', '0'],
    [null, null, null, null],
    ['TOTAL GENERAL', '120.120000001', '120.12', '0'],
  ];
}

function prepare(overrides = {}) {
  return prepareJurisdictionNetControlWorkbook({
    period: '2026-08',
    byteLength: 10729,
    sha256,
    sheets: [{ sheet: 'CONTROL', data: matchedRows() }],
    formulaContractVerified: true,
    ...overrides,
  });
}

test('recalcula J42, J55 y total general con centavos exactos', () => {
  const result = prepare();
  assert.equal(result.contractVersion, JURISDICTION_NET_CONTROL_VERSION);
  assert.equal(result.period, '2026-08');
  assert.equal(result.status, 'matched');
  assert.equal(result.readyForReview, true);
  assert.deepEqual(result.sections.map((section) => ({
    jurisdiction: section.jurisdiction,
    repartitionCount: section.repartitionCount,
    rowsTotalCents: section.rowsTotalCents,
    reportedTotalCents: section.reportedTotalCents,
    referenceTotalCents: section.referenceTotalCents,
      differenceCents: section.differenceCents,
      rowsReportedDifferenceCents: section.rowsReportedDifferenceCents,
      recalculatedDifferenceCents: section.recalculatedDifferenceCents,
    matches: section.matches,
  })), [
    {
      jurisdiction: '42', repartitionCount: 11, rowsTotalCents: '3003',
      reportedTotalCents: '3003', referenceTotalCents: '3003',
      differenceCents: '0', rowsReportedDifferenceCents: '0',
      recalculatedDifferenceCents: '0', matches: true,
    },
    {
      jurisdiction: '55', repartitionCount: 17, rowsTotalCents: '9009',
      reportedTotalCents: '9009', referenceTotalCents: '9009',
      differenceCents: '0', rowsReportedDifferenceCents: '0',
      recalculatedDifferenceCents: '0', matches: true,
    },
  ]);
  assert.deepEqual(result.general, {
    repartitionCount: 28,
    rowsTotalCents: '12012',
    reportedTotalCents: '12012',
    referenceTotalCents: '12012',
    differenceCents: '0',
    rowsReportedDifferenceCents: '0',
    recalculatedDifferenceCents: '0',
    rowsMatchReportedTotal: true,
    referencesMatch: true,
    reportedMatchesReference: true,
    differenceCellMatches: true,
    matches: true,
  });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.source, {
    sha256, byteLength: 10729, sheet: 'CONTROL',
    provenanceState: 'operator_declared', cachedFormulaValuesUsed: true,
    formulaContractVersion: JURISDICTION_NET_CONTROL_FORMULA_VERSION,
    formulaContractVerified: true,
    totalsRecalculatedFromRows: true,
  });
  assert.equal(result.normalizedOutputIncludesPersonalRecords, false);
  assert.equal(result.sourceCellsAggregatedContractVerified, true);
  assert.equal(result.sourceWorkbookMayIncludeAuthorMetadata, true);
  assert.equal(result.additionalDataSheetsAllowed, false);
  assert.equal(result.rawRowsReturned, false);
  assert.equal(result.persistencePerformed, false);
  assert.equal(result.sourceCertified, false);
  assert.equal(result.bankAccreditationProven, false);
  assert.equal(result.payrollPosted, false);
  assert.equal(result.bankInstructionGenerated, false);
  assert.equal(result.tribunalArtifactGenerated, false);
  assert.equal(result.fiscalArtifactGenerated, false);
  assert.equal(result.payrollCalculated, false);
  assert.equal(result.closeApproved, false);
});

test('normaliza sólo el residuo técnico submilicentavo y nunca usa Number', () => {
  assert.equal(jurisdictionControlAmountToCents('198159036.91999999'), 19815903692n);
  assert.equal(jurisdictionControlAmountToCents('737464009.35000014'), 73746400935n);
  assert.equal(jurisdictionControlAmountToCents('1.2e2'), 12000n);
  assert.equal(jurisdictionControlAmountToCents('-0.01', { allowNegative: true }), -1n);
  assert.equal(jurisdictionControlAmountToCents('0.00001'), 0n);
  assert.equal(jurisdictionControlAmountToCents('-0.00001', { allowNegative: true }), 0n);
  for (const rawValue of ['0.00001001', '-0.00001001']) {
    assert.throws(
      () => jurisdictionControlAmountToCents(rawValue, { allowNegative: true }),
      (error) => error.code === 'JURISDICTION_CONTROL_SUBCENT_INVALID',
    );
  }
  for (const rawValue of ['-0', '-0.00']) {
    assert.throws(
      () => jurisdictionControlAmountToCents(rawValue, { allowNegative: true }),
      (error) => error.code === 'JURISDICTION_CONTROL_AMOUNT_INVALID',
    );
  }
  assert.throws(
    () => jurisdictionControlAmountToCents('10.001'),
    (error) => error.code === 'JURISDICTION_CONTROL_SUBCENT_INVALID',
  );
  assert.throws(
    () => jurisdictionControlAmountToCents(10.01),
    (error) => error.code === 'JURISDICTION_CONTROL_AMOUNT_NOT_RAW',
  );
  assert.throws(
    () => jurisdictionControlAmountToCents('-1.00'),
    (error) => error.code === 'JURISDICTION_CONTROL_AMOUNT_NEGATIVE',
  );
});

test('una diferencia de un centavo bloquea el control y la exportación', () => {
  const rows = matchedRows();
  const firstTotalIndex = rows.findIndex((row) => row[0] === 'TOTAL');
  const generalIndex = rows.findIndex((row) => row[0] === 'TOTAL GENERAL');
  rows[firstTotalIndex] = ['TOTAL', '30.03', '30.02', '0.01'];
  rows[generalIndex] = ['TOTAL GENERAL', '120.12', '120.11', '0.01'];
  const result = prepare({ sheets: [{ sheet: 'CONTROL', data: rows }] });
  assert.equal(result.status, 'blocked');
  assert.equal(result.readyForReview, false);
  assert.equal(result.sections[0].differenceCents, '1');
  assert.equal(result.general.differenceCents, '1');
  assert.deepEqual(result.issues.map((entry) => entry.code), [
    'REFERENCE_TOTAL_MISMATCH',
    'GENERAL_NET_MISMATCH',
  ]);
  assert.throws(
    () => createJurisdictionNetControlCsv(result, '42'),
    (error) => error.code === 'JURISDICTION_CONTROL_EXPORT_BLOCKED',
  );
});

test('exporta únicamente filas agregadas normalizadas de una jurisdicción conciliada', () => {
  const result = prepare();
  const csv = new TextDecoder().decode(createJurisdictionNetControlCsv(result, '42'));
  assert.equal(csv, [
    JURISDICTION_NET_CONTROL_HEADER,
    ...J42_REPARTITIONS.map((code, index) => (
      `2026-08;42;${code};${index === 0 ? '1001' : index === 1 ? '2002' : '0'}`
    )),
    '',
  ].join('\r\n'));
  assert.doesNotMatch(csv, /nombre|cuil|cbu|cuenta|legajo/i);
});

test('bloquea hojas, orden, duplicados, celdas y contexto fuera del contrato', () => {
  const cases = [
    [{ period: '2026-13' }, 'JURISDICTION_CONTROL_PERIOD_INVALID'],
    [{ byteLength: JURISDICTION_NET_CONTROL_MAX_BYTES + 1 }, 'JURISDICTION_CONTROL_SIZE_INVALID'],
    [{ sha256: 'preview' }, 'JURISDICTION_CONTROL_HASH_INVALID'],
    [{ formulaContractVerified: false }, 'JURISDICTION_CONTROL_FORMULA_UNVERIFIED'],
    [{ sheets: [{ sheet: 'OTRA', data: matchedRows() }] }, 'JURISDICTION_CONTROL_SHEET_INVALID'],
    [{ sheets: [
      { sheet: 'CONTROL', data: matchedRows() },
      { sheet: 'NOMINAL', data: [['CUIL', 'NOMBRE']] },
    ] }, 'JURISDICTION_CONTROL_WORKBOOK_INVALID'],
    [{ sheets: [
      { sheet: 'CONTROL', data: matchedRows() },
      { sheet: 'control', data: matchedRows() },
    ] }, 'JURISDICTION_CONTROL_WORKBOOK_INVALID'],
  ];
  for (const [overrides, code] of cases) {
    assert.throws(() => prepare(overrides), (error) => {
      assert.equal(error instanceof JurisdictionNetControlError, true);
      return error.code === code;
    }, code);
  }

  const duplicate = matchedRows();
  duplicate.splice(2, 0, ['REP.01', '1.00', null, null]);
  assert.throws(
    () => parseJurisdictionNetControlRows(duplicate),
    (error) => error.code === 'JURISDICTION_CONTROL_REPARTITION_DUPLICATED',
  );
  const numberCell = matchedRows();
  numberCell[1][1] = 10.01;
  assert.throws(
    () => parseJurisdictionNetControlRows(numberCell),
    (error) => error.code === 'JURISDICTION_CONTROL_CELL_INVALID',
  );

  const incompleteRoster = matchedRows();
  incompleteRoster.splice(2, 1);
  assert.throws(
    () => parseJurisdictionNetControlRows(incompleteRoster),
    (error) => error.code === 'JURISDICTION_CONTROL_REPARTITION_ROSTER_INVALID',
  );
});

function workbookXmlFixture({ d35Attributes = ' t="shared" ref="D35" si="0"' } = {}) {
  const labelEntries = [
    ['A1', 'JURISDICCION 42'],
    ...J42_REPARTITIONS.map((code, index) => [`A${index + 2}`, `REP.${code}`]),
    ['A13', 'TOTAL'],
    ['A15', 'JURISDICCION 55'],
    ...J55_REPARTITIONS.map((code, index) => [`A${index + 16}`, `REP.${code}`]),
    ['A33', 'TOTAL'],
    ['A35', 'TOTAL GENERAL'],
  ];
  const sharedStrings = [...new Set(labelEntries.map(([, label]) => label))];
  const cells = labelEntries.map(([reference, label]) => ({
    reference,
    xml: `<c r="${reference}" t="s"><v>${sharedStrings.indexOf(label)}</v></c>`,
  }));
  for (const reference of ['B1', 'B15']) {
    cells.push({ reference, xml: `<c r="${reference}"/>` });
  }
  for (const reference of [
    ...Array.from({ length: 11 }, (_, index) => `B${index + 2}`),
    ...Array.from({ length: 17 }, (_, index) => `B${index + 16}`),
    'C13', 'C33', 'C35',
  ]) {
    cells.push({ reference, xml: `<c r="${reference}"><v>0</v></c>` });
  }
  const formulas = {
    B13: '<f>SUM(B2:B12)</f><v>0</v>',
    D13: '<f>+B13-C13</f><v>0</v>',
    B33: '<f>SUM(B16:B32)</f><v>0</v>',
    D33: '<f>+B33-C33</f><v>0</v>',
    B35: '<f>+B33+B13</f><v>0</v>',
    D35: `<f${d35Attributes}>+B35-C35</f><v>0</v>`,
  };
  for (const [reference, body] of Object.entries(formulas)) {
    cells.push({ reference, xml: `<c r="${reference}">${body}</c>` });
  }
  const byRow = new Map();
  for (const cell of cells) {
    const row = Number(/[0-9]+$/.exec(cell.reference)[0]);
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(cell);
  }
  const column = (reference) => reference.charCodeAt(0);
  const rows = [...byRow.entries()].sort(([left], [right]) => left - right).map(([row, entries]) => (
    `<row r="${row}">${entries.sort((left, right) => column(left.reference) - column(right.reference)).map((entry) => entry.xml).join('')}</row>`
  )).join('');
  return {
    worksheetXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,
    sharedStringsXml: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sharedStrings.length}" uniqueCount="${sharedStrings.length}">${sharedStrings.map((label) => `<si><t>${label}</t></si>`).join('')}</sst>`,
  };
}

test('verifica el contrato exacto de fórmulas antes de aceptar valores cacheados', () => {
  const fixture = workbookXmlFixture();
  assert.deepEqual(validateJurisdictionNetControlFormulaXml(
    fixture.worksheetXml, fixture.sharedStringsXml,
  ), {
    version: JURISDICTION_NET_CONTROL_FORMULA_VERSION,
    cellCount: 72,
    formulaCount: 6,
    verified: true,
  });
  const invalidDocuments = [
    fixture.worksheetXml.replace('<c r="B2"><v>0</v></c>', '<c r="B2"><f>999999.99</f><v>0</v></c>'),
    fixture.worksheetXml.replace('SUM(B2:B12)', 'SUM(B2:B11)'),
    fixture.worksheetXml.replace('<c r="D13"><f>+B13-C13</f><v>0</v></c>', ''),
    workbookXmlFixture({ d35Attributes: '' }).worksheetXml,
    fixture.worksheetXml.replace('<c r="B2"><v>0</v></c>', '<x:c xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" r="B2"><x:v>0</x:v></x:c>'),
    fixture.worksheetXml.replace('r="A13"', 'r="A14"'),
    fixture.worksheetXml.replace('<c r="B13"><f>SUM(B2:B12)</f><v>0</v></c>', '<c r="B13"><f>SUM(B2:B12)</f></c>'),
    fixture.worksheetXml.replace('</sheetData>', '<row r="13"></row></sheetData>'),
  ];
  for (const xml of invalidDocuments) {
    assert.throws(
      () => validateJurisdictionNetControlFormulaXml(xml, fixture.sharedStringsXml),
      (error) => error.code === 'JURISDICTION_CONTROL_FORMULA_INVALID',
    );
  }
  assert.throws(
    () => validateJurisdictionNetControlFormulaXml(fixture.worksheetXml, '<sst/>'),
    (error) => error.code === 'JURISDICTION_CONTROL_FORMULA_INVALID',
  );
});

test('formatea importes y el módulo mantiene procesamiento local sin PII', () => {
  assert.equal(formatJurisdictionControlCents('85894317095'), '$ 858.943.170,95');
  assert.equal(formatJurisdictionControlCents('-1'), '-$ 0,01');
  const source = fs.readFileSync(
    new URL('../assets/monthly-close-jurisdiction-xlsx-adapter.js', import.meta.url), 'utf8',
  );
  const worker = fs.readFileSync(
    new URL('../assets/monthly-close-jurisdiction-xlsx-worker.js', import.meta.url), 'utf8',
  );
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /file\.name|filename/i);
  assert.match(source, /setTimeout\(\(\) => URL\.revokeObjectURL\(url\), 0\)/);
  assert.doesNotMatch(worker, /fetch\s*\(|localStorage|sessionStorage|indexedDB|console\./);
  assert.match(worker, /parseNumber: \(rawValue\) => rawValue/);
  assert.match(worker, /validateJurisdictionNetControlFormulaXml/);
  assert.match(worker, /vendor\/fflate\.min\.js/);
  assert.match(worker, /bytes\.fill\(0\)/);
  assert.match(source, /rawRowsReturned: false/);
  assert.match(source, /normalizedOutputIncludesPersonalRecords: false/);
  assert.match(source, /sourceWorkbookMayIncludeAuthorMetadata: true/);
  assert.equal(mountJurisdictionNetControlXlsx({ querySelector: () => null }), false);
});

test('Nómina publica el flujo Excel recomendado y el build mantiene el worker privado', () => {
  const html = fs.readFileSync(new URL('../nomina-control.html', import.meta.url), 'utf8');
  const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  const worker = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(html, /10 · CONTROL MENSUAL/);
  assert.match(html, /Convertir y conciliar el paquete mensual de GRH/);
  assert.match(html, /CONTROL DE JURISDICCION\.xlsx/);
  assert.match(html, /verifica las seis fórmulas del formato/);
  assert.match(html, /El libro puede conservar metadatos de autor/);
  assert.match(html, /data-jurisdiction-xlsx-form novalidate/);
  assert.match(html, /data-jurisdiction-xlsx-file/);
  assert.match(html, /data-jurisdiction-xlsx-rows/);
  assert.match(html, /data-jurisdiction-xlsx-total-recalculated/);
  assert.match(html, /data-jurisdiction-xlsx-total-saved/);
  assert.match(html, /Diferencia recalculada/);
  assert.match(html, /Descargar J42 CSV/);
  assert.match(html, /No prueba que el archivo haya sido enviado, aceptado o acreditado/);
  assert.equal((html.match(/assets\/monthly-close-jurisdiction-xlsx-adapter\.js/g) || []).length, 1);
  assert.match(build, /'assets\/monthly-close-jurisdiction-xlsx-adapter\.js'/);
  assert.match(build, /'assets\/monthly-close-jurisdiction-xlsx-worker\.js'/);
  assert.match(build, /node_modules\/read-excel-file\/bundle\/read-excel-file\.min\.js/);
  assert.match(build, /node_modules\/fflate\/umd\/index\.js/);
  assert.doesNotMatch(worker, /monthly-close-jurisdiction|read-excel-file/);
});
