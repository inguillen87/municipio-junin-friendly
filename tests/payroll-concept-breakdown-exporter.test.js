import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_CONCEPT_BREAKDOWN_EXPORT_VERSION,
  PayrollConceptBreakdownExportError,
  createPayrollConceptBreakdownXlsx,
  downloadPayrollConceptBreakdownArtifact,
} from '../assets/payroll-concept-breakdown-exporter.js';

const GENERATED_AT_A = '2026-09-03T12:00:00.000Z';
const GENERATED_AT_B = '2026-09-03T18:30:00.000Z';
const COMPONENTS = [
  'occurrences', 'quantityHundredths', 'remunerativeCents',
  'nonRemunerativeCents', 'familyAllowancesCents', 'retentionsCents',
  'contributionsCents',
];

function concept(conceptCode, values = {}) {
  return {
    conceptCode,
    occurrences: '1',
    quantityHundredths: '0',
    remunerativeCents: '0',
    nonRemunerativeCents: '0',
    familyAllowancesCents: '0',
    retentionsCents: '0',
    contributionsCents: '0',
    ...values,
  };
}

function totals(rows) {
  const result = Object.fromEntries(COMPONENTS.map((key) => [key, 0n]));
  for (const row of rows) {
    for (const key of COMPONENTS) result[key] += BigInt(row[key]);
  }
  result.netCents = result.remunerativeCents + result.nonRemunerativeCents
    + result.familyAllowancesCents - result.retentionsCents;
  result.earningsPlusContributionsCents = result.remunerativeCents
    + result.nonRemunerativeCents + result.familyAllowancesCents + result.contributionsCents;
  return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, value.toString()]));
}

function report(kind, rows, hashCharacter) {
  return {
    kind,
    jurisdiction: kind === 'general' ? null : kind,
    conceptCount: rows.length,
    concepts: rows,
    totals: totals(rows),
    source: {
      sha256: `sha256:${hashCharacter.repeat(64)}`,
      byteLength: 2048,
      pageCount: 2,
      sourceLayout: 'grh-concept-statistics-aggregate-by-concept',
    },
  };
}

function summary() {
  const j42 = [
    concept('1', { occurrences: '2', quantityHundredths: '125', remunerativeCents: '10000', contributionsCents: '1500' }),
    concept('600', { retentionsCents: '2000' }),
  ];
  const j55 = [
    concept('1', { occurrences: '3', quantityHundredths: '275', remunerativeCents: '5000', contributionsCents: '500' }),
    concept('301', { familyAllowancesCents: '700' }),
  ];
  const general = [
    concept('1', { occurrences: '5', quantityHundredths: '400', remunerativeCents: '15000', contributionsCents: '2000' }),
    concept('301', { familyAllowancesCents: '700' }),
    concept('600', { retentionsCents: '2000' }),
  ];
  return {
    contractVersion: 'payroll-monthly-grh-summary.v1',
    parserVersion: 'grh-concept-statistics-pdf-layout.v1',
    period: '2026-08',
    status: 'matched',
    readyForReview: true,
    reports: [report('42', j42, 'a'), report('55', j55, 'b'), report('general', general, 'c')],
    crossReport: {
      equation: 'jurisdiction_42 + jurisdiction_55 = general',
      toleranceCents: '0',
      conceptCount: 3,
      componentComparisons: 21,
      netDifferenceCents: '0',
      matches: true,
    },
    normalizedRepartitionCode: '0',
    normalizedRepartitionMeaning: 'todas_las_reparticiones_del_pdf',
    normalizedOutputIncludesPersonalRecords: false,
    acceptedRowsAggregateOnlyVerified: true,
    rulesInferred: false,
    provenanceVerified: false,
    persistencePerformed: false,
    payrollCalculated: false,
    payrollPosted: false,
    closeApproved: false,
    bankAccreditationProven: false,
    bankArtifactGenerated: false,
    tribunalArtifactGenerated: false,
    fiscalArtifactGenerated: false,
  };
}

function storedZipEntries(bytes) {
  const entries = new Map();
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    assert.equal(view.getUint16(8, true), 0);
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

function errorCode(code) {
  return (error) => error instanceof PayrollConceptBreakdownExportError && error.code === code;
}

test('genera un XLSX agregado de cinco hojas con fórmulas y trazabilidad', () => {
  const artifact = createPayrollConceptBreakdownXlsx(summary(), { generatedAt: GENERATED_AT_A });
  assert.equal(artifact.contractVersion, PAYROLL_CONCEPT_BREAKDOWN_EXPORT_VERSION);
  assert.equal(artifact.fileName, 'municontrol_desglose-conceptos_2026-08_cccccccccccc.xlsx');
  assert.equal(artifact.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual(artifact.sheetNames, ['Resumen', 'J42', 'J55', 'General', 'Trazabilidad']);
  assert.equal(artifact.containsPersonalRecords, false);
  assert.equal(artifact.payrollCalculated, false);
  assert.deepEqual([...artifact.bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

  const entries = storedZipEntries(artifact.bytes);
  assert.equal(entries.size, 12);
  assert.match(entries.get('xl/workbook.xml'), /sheet name="Resumen".*sheet name="J42".*sheet name="J55".*sheet name="General".*sheet name="Trazabilidad"/s);
  const j42 = entries.get('xl/worksheets/sheet2.xml');
  assert.match(j42, /MuniControl · Desglose mensual J42/);
  assert.match(j42, /<f>D7\+E7\+F7-G7<\/f><v>100\.00<\/v>/);
  assert.match(j42, /<f>D7\+E7\+F7\+H7<\/f><v>115\.00<\/v>/);
  assert.match(j42, /<f>SUM\(G7:G8\)<\/f><v>20\.00<\/v>/);
  assert.match(entries.get('xl/worksheets/sheet5.xml'), /sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
  const workbookPayload = [...entries.values()].join('\n');
  assert.match(workbookPayload, /Sin nombres, legajos, DNI, CUIL, CBU ni cuentas bancarias/);
  assert.doesNotMatch(workbookPayload, /12345678|20-12345678-9|2850590000090412345678|Noelia Cercan/);
});

test('los bytes son deterministas aunque cambie el momento externo de descarga', () => {
  const first = createPayrollConceptBreakdownXlsx(summary(), { generatedAt: GENERATED_AT_A });
  const second = createPayrollConceptBreakdownXlsx(summary(), { generatedAt: GENERATED_AT_B });
  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.equal(first.fileName, second.fileName);
  assert.deepEqual(first.bytes, second.bytes);
  const payload = [...storedZipEntries(first.bytes).values()].join('\n');
  assert.doesNotMatch(payload, /2026-09-03T12:00:00\.000Z|2026-09-03T18:30:00\.000Z/);
});

test('falla cerrado ante PII, totales manipulados, cruce falso y precisión insegura', () => {
  const pii = structuredClone(summary());
  pii.reports[0].concepts[0].dni = '12345678';
  assert.throws(
    () => createPayrollConceptBreakdownXlsx(pii, { generatedAt: GENERATED_AT_A }),
    errorCode('BREAKDOWN_SOURCE_CONTRACT_INVALID'),
  );

  const altered = structuredClone(summary());
  altered.reports[0].totals.netCents = '8001';
  assert.throws(
    () => createPayrollConceptBreakdownXlsx(altered, { generatedAt: GENERATED_AT_A }),
    errorCode('BREAKDOWN_SOURCE_ARITHMETIC_INVALID'),
  );

  const falseCross = structuredClone(summary());
  falseCross.crossReport.matches = false;
  assert.throws(
    () => createPayrollConceptBreakdownXlsx(falseCross, { generatedAt: GENERATED_AT_A }),
    errorCode('BREAKDOWN_SOURCE_ARITHMETIC_INVALID'),
  );

  const huge = structuredClone(summary());
  huge.reports[0].concepts[0].remunerativeCents = '1000000000000000';
  assert.throws(
    () => createPayrollConceptBreakdownXlsx(huge, { generatedAt: GENERATED_AT_A }),
    errorCode('BREAKDOWN_XLSX_PRECISION_UNSAFE'),
  );
});

test('descarga únicamente un artefacto emitido e íntegro y revoca su URL', () => {
  const artifact = createPayrollConceptBreakdownXlsx(summary(), { generatedAt: GENERATED_AT_A });
  const events = [];
  const anchor = {
    hidden: false, href: '', download: '',
    click() { events.push(['click', this.download]); },
    remove() { events.push(['remove']); },
  };
  class BlobFixture {
    constructor(parts, options) { this.parts = parts; this.type = options.type; }
  }
  const name = downloadPayrollConceptBreakdownArtifact(artifact, {
    documentImpl: {
      createElement: (tag) => { assert.equal(tag, 'a'); return anchor; },
      body: { appendChild: (value) => { assert.equal(value, anchor); events.push(['append']); } },
    },
    urlApi: {
      createObjectURL: (blob) => { assert.equal(blob.type, artifact.mimeType); events.push(['create']); return 'blob:test'; },
      revokeObjectURL: (url) => { assert.equal(url, 'blob:test'); events.push(['revoke']); },
    },
    BlobImpl: BlobFixture,
  });
  assert.equal(name, artifact.fileName);
  assert.deepEqual(events, [['create'], ['append'], ['click', artifact.fileName], ['remove'], ['revoke']]);

  artifact.bytes[0] = 0;
  assert.throws(
    () => downloadPayrollConceptBreakdownArtifact(artifact, {}),
    errorCode('BREAKDOWN_ARTIFACT_INVALID'),
  );
});

test('el exportador no usa red, storage, HTML dinámico ni registra fuentes', () => {
  const sourceCode = fs.readFileSync(new URL('../assets/payroll-concept-breakdown-exporter.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sourceCode, /\bfetch\s*\(|localStorage|sessionStorage|indexedDB|\.innerHTML|\beval\s*\(|console\./);
  assert.doesNotMatch(sourceCode, /document\.write|window\.open/);
});
