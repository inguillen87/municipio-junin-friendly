import assert from 'node:assert/strict';
import test from 'node:test';
import { readSheet } from 'read-excel-file/node';
import { unzipSync } from 'fflate';

import {
  PAYROLL_BANK_NOMINAL_EXPORT_VERSION,
  PayrollBankNominalExportError,
  createPayrollBankNominalXlsxArtifact,
} from '../assets/payroll-bank-nominal-exporter.js';

const SHEETS = [
  ['credicoop-42', 'Credicoop J42', '42'],
  ['credicoop-55', 'Credicoop J55', '55'],
  ['santander-42', 'Santander J42', '42'],
  ['santander-55', 'Santander J55', '55'],
  ['transferencias-funcionarios', 'Transferencias funcionarios', '42'],
  ['transferencias-varias', 'Transferencias varias', '55'],
  ['nacion-42', 'Nación J42', '42'],
  ['nacion-55', 'Nación J55', '55'],
];

function person(jurisdiction, seed = 1, changes = {}) {
  return {
    cuil: String(seed).padStart(11, '0'),
    name: `Persona de prueba ${seed}`,
    netCents: '101',
    repartitionCode: '01',
    repartitionLabel: 'Administración',
    jurisdiction,
    account: null,
    cbu: null,
    ...changes,
  };
}

function fixture() {
  return {
    period: '2026-08',
    source: { fileName: 'PLANILLA CONTROL GENERAL 08.2026.xlsx', sha256: 'b'.repeat(64) },
    total: { operations: 8, netCents: '808' },
    sheets: SHEETS.map(([sheetKey, title, jurisdiction], index) => ({
      sheetKey, title, rows: [person(jurisdiction, index + 1)], operations: 1, netCents: '101',
    })),
  };
}

function reconcile(input) {
  for (const sheet of input.sheets) {
    sheet.operations = sheet.rows.length;
    sheet.netCents = String(sheet.rows.reduce((sum, row) => sum + BigInt(row.netCents), 0n));
  }
  input.total.operations = input.sheets.reduce((sum, sheet) => sum + sheet.operations, 0);
  input.total.netCents = String(input.sheets.reduce((sum, sheet) => sum + BigInt(sheet.netCents), 0n));
  return input;
}

function entriesOf(artifact) {
  const entries = unzipSync(artifact.bytes);
  const decoder = new TextDecoder();
  return Object.fromEntries(Object.entries(entries).map(([name, bytes]) => [name, decoder.decode(bytes)]));
}

function cellXml(sheetXml, reference) {
  const result = new RegExp(`<c r="${reference}"[^>]*>.*?</c>`).exec(sheetXml);
  assert.ok(result, `Missing cell ${reference}`);
  return result[0];
}

function rejects(input, code) {
  assert.throws(() => createPayrollBankNominalXlsxArtifact(input), (error) => {
    assert.ok(error instanceof PayrollBankNominalExportError);
    assert.equal(error.code, `BANK_NOMINAL_EXPORT_${code}`);
    return true;
  });
}

test('preserves an unpadded repartition prefix instead of duplicating its code', () => {
  const input = fixture();
  input.sheets[0].rows[0].repartitionLabel = '1 - ADMINISTRATIVO';
  const xml = entriesOf(createPayrollBankNominalXlsxArtifact(input))['xl/worksheets/sheet1.xml'];
  assert.match(cellXml(xml, 'E5'), />1 - ADMINISTRATIVO<\/t>/);
  assert.doesNotMatch(cellXml(xml, 'E5'), /01 ·/);
});

test('exports an actual eight-sheet XLSX with exact artifact metadata in the supplied order', async () => {
  const input = fixture();
  input.sheets.reverse();
  const before = structuredClone(input);
  const artifact = createPayrollBankNominalXlsxArtifact(input);
  const entries = entriesOf(artifact);
  assert.equal(PAYROLL_BANK_NOMINAL_EXPORT_VERSION, 'payroll-bank-nominal-export.v1');
  assert.equal(artifact.fileName, 'municontrol_planilla-bancaria_2026-08.xlsx');
  assert.equal(artifact.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.ok(artifact.bytes instanceof Uint8Array);
  assert.equal(artifact.byteLength, artifact.bytes.byteLength);
  assert.equal(artifact.containsPersonalRecords, true);
  assert.equal(artifact.bankInstructionGenerated, false);
  assert.equal(artifact.bankAccreditationPerformed, false);
  assert.equal(artifact.operations, 8);
  assert.equal(artifact.netCents, '808');
  assert.deepEqual(artifact.sheetNames, input.sheets.map((sheet) => sheet.title));
  assert.deepEqual(input, before, 'Input must not be changed by formatting or grouping');
  assert.equal(Object.keys(entries).filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path)).length, 8);
  assert.deepEqual(createPayrollBankNominalXlsxArtifact(input).bytes, artifact.bytes, 'Same evidence creates deterministic bytes');
  for (const [index, sheet] of input.sheets.entries()) {
    const rows = await readSheet(Buffer.from(artifact.bytes), sheet.title);
    assert.equal(rows[0][0], `Planilla bancaria · ${sheet.title}`);
    assert.equal(rows[3][1], 'CUIL');
    assert.equal(rows[4][1], sheet.rows[0].cuil);
    assert.equal(rows[4][3], 1.01);
    assert.equal(rows[5][3], 1.01, 'Cached group subtotal is readable without recalculation');
    assert.equal(rows[6][3], 1.01, 'Cached sheet total is readable without recalculation');
    assert.match(entries['xl/workbook.xml'], new RegExp(`localSheetId="${index}"`));
  }
});

test('groups repartitions stably and reconciles precise SUM subtotals and a non-double-counting sheet total', async () => {
  const input = fixture();
  input.sheets[0].rows = [
    person('42', 11, { name: 'Primera B', repartitionCode: '02', netCents: '10' }),
    person('42', 12, { name: 'Primera A', repartitionCode: '01', netCents: '105' }),
    person('42', 13, { name: 'Segunda B', repartitionCode: '02', netCents: '20' }),
    person('42', 14, { name: 'Segunda A', repartitionCode: '01', netCents: '20006' }),
  ];
  reconcile(input);
  const artifact = createPayrollBankNominalXlsxArtifact(input);
  const sheet = entriesOf(artifact)['xl/worksheets/sheet1.xml'];
  assert.match(cellXml(sheet, 'D7'), /<f>SUM\(D5:D6\)<\/f><v>0\.30<\/v>/);
  assert.match(cellXml(sheet, 'D10'), /<f>SUM\(D8:D9\)<\/f><v>201\.11<\/v>/);
  assert.match(cellXml(sheet, 'D11'), /<f>SUMIF\(B5:B10,&quot;Subtotal&quot;,D5:D10\)<\/f><v>201\.41<\/v>/);
  const rows = await readSheet(Buffer.from(artifact.bytes), input.sheets[0].title);
  assert.deepEqual([rows[4][2], rows[5][2], rows[7][2], rows[8][2]], ['Primera B', 'Segunda B', 'Primera A', 'Segunda A']);
  assert.deepEqual([rows[4][0], rows[5][0], rows[7][0], rows[8][0]], [1, 2, 3, 4]);
  assert.equal(rows[10][3], 201.41);
  assert.equal(artifact.netCents, '20848');
});

test('does not merge equal repartition codes belonging to different jurisdictions in transfer sheets', () => {
  const input = fixture();
  input.sheets[4].rows = [person('42', 1), person('55', 2), person('42', 3)];
  const sheet = entriesOf(createPayrollBankNominalXlsxArtifact(reconcile(input)))['xl/worksheets/sheet5.xml'];
  assert.match(cellXml(sheet, 'D7'), /<f>SUM\(D5:D6\)<\/f><v>2\.02<\/v>/);
  assert.match(cellXml(sheet, 'D9'), /<f>SUM\(D8:D8\)<\/f><v>1\.01<\/v>/);
  assert.match(cellXml(sheet, 'F7'), />42<\/t>/);
  assert.match(cellXml(sheet, 'F9'), />55<\/t>/);
});

test('preserves original qualified repartition labels without duplicating their code', async () => {
  const input = fixture();
  const labels = [
    '01 - ADMINISTRATIVO', '01 · Administración  general', '01: Área de sueldos',
    '01 Administración', '010 - Otra repartición', '01ADMINISTRATIVO', 'Administración',
  ];
  input.sheets[0].rows = labels.map((repartitionLabel, index) => person('42', index + 1, { repartitionLabel }));
  const artifact = createPayrollBankNominalXlsxArtifact(reconcile(input));
  const rows = await readSheet(Buffer.from(artifact.bytes), input.sheets[0].title);
  assert.deepEqual(rows.slice(4, 11).map((row) => row[4]), [
    '01 - ADMINISTRATIVO', '01 · Administración  general', '01: Área de sueldos',
    '01 Administración', '01 · 010 - Otra repartición', '01 · 01ADMINISTRATIVO', '01 · Administración',
  ]);
  assert.deepEqual(input.sheets[0].rows.map((row) => row.repartitionLabel), labels, 'Never rewrite source labels');
});

test('preserves zero-prefixed identifiers and only includes account columns actually present per sheet', async () => {
  const input = fixture();
  input.sheets[0].rows.push(person('42', 19, { account: '0001234500', cbu: '0000000000000012345678' }));
  input.sheets[1].rows[0].account = '0012';
  input.sheets[2].rows[0].cbu = '0000000000000000000011';
  const artifact = createPayrollBankNominalXlsxArtifact(reconcile(input));
  const entries = entriesOf(artifact);
  const both = await readSheet(Buffer.from(artifact.bytes), input.sheets[0].title);
  assert.deepEqual(both[3], ['Nº', 'CUIL', 'Apellido y nombre', 'Neto a pagar', 'Repartición', 'Jurisdicción', 'Cuenta', 'CBU']);
  assert.equal(both[4][1], '00000000001');
  assert.equal(both[4][6], null, 'Missing account must not be synthesized');
  assert.equal(both[4][7], null, 'Missing CBU must not be synthesized');
  assert.equal(both[5][6], '0001234500');
  assert.equal(both[5][7], '0000000000000012345678');
  assert.match(cellXml(entries['xl/worksheets/sheet1.xml'], 'G6'), /t="inlineStr"/);
  assert.match(cellXml(entries['xl/worksheets/sheet1.xml'], 'B5'), /t="inlineStr"/);
  assert.match(cellXml(entries['xl/worksheets/sheet1.xml'], 'D5'), /t="n"><v>1\.01/);
  assert.match(entries['xl/worksheets/sheet2.xml'], />Cuenta<\/t>/);
  assert.doesNotMatch(entries['xl/worksheets/sheet2.xml'], />CBU<\/t>/);
  assert.match(entries['xl/worksheets/sheet3.xml'], />CBU<\/t>/);
  assert.doesNotMatch(entries['xl/worksheets/sheet3.xml'], />Cuenta<\/t>/);
  assert.doesNotMatch(entries['xl/worksheets/sheet4.xml'], />(?:Cuenta|CBU)<\/t>/);
});

test('all source texts are literal inline strings, escaped, and never executable formulas or links', async () => {
  const input = fixture();
  const literal = '=HYPERLINK("https://example.invalid", "A&B <prueba>")';
  input.sheets[0].rows[0].name = literal;
  input.sheets[0].rows[0].account = '=1+1';
  input.sheets[0].rows[0].repartitionLabel = 'Área "especial" & <otra> _x0041_';
  const artifact = createPayrollBankNominalXlsxArtifact(input);
  const entries = entriesOf(artifact);
  const sheet = entries['xl/worksheets/sheet1.xml'];
  assert.match(cellXml(sheet, 'C5'), /t="inlineStr"/);
  assert.doesNotMatch(cellXml(sheet, 'C5'), /<f>/);
  assert.match(cellXml(sheet, 'C5'), /&quot;A&amp;B &lt;prueba&gt;&quot;/);
  assert.match(cellXml(sheet, 'G5'), />=1\+1<\/t>/);
  assert.match(cellXml(sheet, 'E5'), /_x005F_x0041_/);
  assert.equal((sheet.match(/<f>/g) || []).length, 2, 'Only our subtotal and total may be formulas');
  assert.ok(Object.keys(entries).every((name) => !/externalLinks|vbaProject|macros/i.test(name)));
  for (const [path, contents] of Object.entries(entries)) {
    if (path.endsWith('.rels')) assert.doesNotMatch(contents, /TargetMode="External"|https:\/\/example/);
  }
  const rows = await readSheet(Buffer.from(artifact.bytes), input.sheets[0].title);
  assert.equal(rows[4][2], literal);
  assert.equal(rows[4][6], '=1+1');
});

test('uses frozen column headings, filters, repeated print headings, landscape pages and source evidence', () => {
  const input = fixture();
  input.sheets[0].title = "Nómina d'Área";
  const entries = entriesOf(createPayrollBankNominalXlsxArtifact(input));
  for (let index = 1; index <= 8; index += 1) {
    const sheet = entries[`xl/worksheets/sheet${index}.xml`];
    assert.match(sheet, /<pane ySplit="4" topLeftCell="A5"[^>]+state="frozen"/);
    assert.match(sheet, /<autoFilter ref="A4:F6"/);
    assert.match(sheet, /orientation="landscape" fitToWidth="1" fitToHeight="0"/);
    assert.ok(sheet.indexOf('<autoFilter') < sheet.indexOf('<mergeCells'), 'Keep worksheet schema element order');
    assert.match(sheet, /Fuente: PLANILLA CONTROL GENERAL 08\.2026\.xlsx/);
    assert.ok(sheet.includes(`SHA-256: ${input.source.sha256}`));
    assert.match(sheet, /No genera instrucciones bancarias ni acredita haberes/);
  }
  assert.equal((entries['xl/workbook.xml'].match(/name="_xlnm.Print_Titles"/g) || []).length, 8);
  assert.match(entries['xl/workbook.xml'], /&apos;Nómina d&apos;&apos;Área&apos;!\$1:\$4/);
  assert.match(entries['xl/styles.xml'], /<sz val="11"\/><color rgb="FF172C38"\/><name val="Arial"/);
  assert.match(entries['xl/styles.xml'], /formatCode="#,##0\.00"/);
  assert.match(entries['xl/styles.xml'], /fgColor rgb="FF102C3C"/);
});

test('supports empty sheets without circular references, phantom people, or invented money', async () => {
  const input = fixture();
  input.sheets.forEach((sheet) => { sheet.rows = []; });
  const artifact = createPayrollBankNominalXlsxArtifact(reconcile(input));
  const sheet = entriesOf(artifact)['xl/worksheets/sheet1.xml'];
  assert.equal(artifact.operations, 0);
  assert.equal(artifact.netCents, '0');
  assert.match(cellXml(sheet, 'D5'), /<f>SUM\(0\)<\/f><v>0\.00<\/v>/);
  assert.match(sheet, /<autoFilter ref="A4:F4"/);
  assert.doesNotMatch(sheet, /SUMIF|SUM\(D/);
  const rows = await readSheet(Buffer.from(artifact.bytes), input.sheets[0].title);
  assert.equal(rows[4][3], 0);
});

test('rejects partial or mismatched universes atomically, including a bad eighth sheet', () => {
  const cases = [
    (input) => { input.sheets.pop(); },
    (input) => { input.sheets[7].sheetKey = input.sheets[0].sheetKey; },
    (input) => { input.sheets[7].sheetKey = 'unknown'; },
  ];
  for (const alter of cases) { const input = fixture(); alter(input); rejects(input, 'CONTEXT_INVALID'); }
  const mismatches = [
    (input) => { input.sheets[7].netCents = '102'; },
    (input) => { input.sheets[7].operations = 2; },
    (input) => { input.total.operations = 9; },
    (input) => { input.total.netCents = '809'; },
    (input) => { input.sheets[7].rows.push(person('55')); },
  ];
  for (const alter of mismatches) { const input = fixture(); alter(input); rejects(input, 'TOTAL_MISMATCH'); }
});

test('rejects invalid period, source, title and non-canonical structures', () => {
  for (const period of ['2026-00', '2026-13', '2026-8', '../../01', null]) {
    const input = fixture(); input.period = period; rejects(input, 'CONTEXT_INVALID');
  }
  for (const alter of [
    (input) => { input.source.sha256 = 'bad-hash'; },
    (input) => { input.source.fileName = '../source.xlsx'; },
    (input) => { input.sheets[0].title = 'bad/name'; },
    (input) => { input.sheets[1].title = input.sheets[0].title.toUpperCase(); },
    (input) => { input.sheets[0].title = "'title"; },
  ]) { const input = fixture(); alter(input); rejects(input, 'CONTEXT_INVALID'); }
  for (const alter of [
    (input) => { input.source.fileName = ''; },
    (input) => { input.sheets[0].title = 'a'.repeat(32); },
    (input) => { input.extra = true; },
    (input) => { input.sheets[0].rows[0].formula = '=1+1'; },
    (input) => { delete input.sheets[0].rows[0].account; },
    (input) => { input.total.operations = 1.5; },
    (input) => { input.total.operations = 60001; },
  ]) { const input = fixture(); alter(input); rejects(input, 'SOURCE_INVALID'); }
});

test('rejects malformed personal records without guessing identities, accounts or jurisdictions', () => {
  for (const changes of [
    { cuil: 12345678901 }, { cuil: '123' }, { jurisdiction: 'other' }, { jurisdiction: '55' },
    { name: '' }, { name: 'a\u0000b' }, { name: 'a\ud800b' }, { name: 'a\ufffeb' },
    { account: '' }, { account: 123 }, { cbu: undefined }, { repartitionCode: '' },
    { netCents: 101 }, { netCents: '1.01' }, { netCents: '01' }, { netCents: '-1' },
    { netCents: '1e3' }, { netCents: '=100' },
  ]) {
    const input = fixture();
    Object.assign(input.sheets[0].rows[0], changes);
    rejects(input, 'SOURCE_INVALID');
  }
});

test('enforces Excel exact-cent precision for rows, sheet sums and the overall sum', async () => {
  const input = fixture();
  input.sheets.forEach((sheet) => { sheet.rows = []; });
  input.sheets[0].rows = [person('42', 1, { netCents: '999999999999999' })];
  const artifact = createPayrollBankNominalXlsxArtifact(reconcile(input));
  const sheet = entriesOf(artifact)['xl/worksheets/sheet1.xml'];
  assert.match(cellXml(sheet, 'D5'), /<v>9999999999999\.99<\/v>/);
  assert.match(cellXml(sheet, 'D6'), /<v>9999999999999\.99<\/v>/);
  assert.equal(artifact.netCents, '999999999999999');
  const rows = await readSheet(Buffer.from(artifact.bytes), input.sheets[0].title);
  assert.equal(rows[4][3].toFixed(2), '9999999999999.99');
  input.sheets[0].rows[0].netCents = '1000000000000000';
  rejects(reconcile(input), 'PRECISION_UNSAFE');

  const sheetOverflow = fixture();
  sheetOverflow.sheets[0].rows = [person('42', 1, { netCents: '999999999999999' }), person('42', 2, { netCents: '1' })];
  sheetOverflow.sheets[0].operations = 2;
  rejects(sheetOverflow, 'PRECISION_UNSAFE');

  const totalOverflow = fixture();
  totalOverflow.sheets.forEach((page) => { page.rows[0].netCents = '125000000000000'; page.netCents = '125000000000000'; });
  rejects(totalOverflow, 'PRECISION_UNSAFE');
});

test('many repartitions use a bounded total formula, never a giant SUM argument list', () => {
  const input = fixture();
  input.sheets[0].rows = Array.from({ length: 300 }, (_, index) => person('42', index + 1, {
    repartitionCode: String(index).padStart(3, '0'), netCents: '1',
  }));
  const sheet = entriesOf(createPayrollBankNominalXlsxArtifact(reconcile(input)))['xl/worksheets/sheet1.xml'];
  assert.equal((sheet.match(/<f>SUM\(D/g) || []).length, 300);
  assert.match(cellXml(sheet, 'D605'), /SUMIF\(B5:B604,&quot;Subtotal&quot;,D5:D604\)<\/f><v>3\.00/);
});

test('a person named Subtotal cannot be counted again by the total formula', async () => {
  const input = fixture();
  input.sheets[0].rows[0].name = 'Subtotal';
  input.sheets[0].rows[0].repartitionLabel = 'Subtotal';
  const artifact = createPayrollBankNominalXlsxArtifact(input);
  const sheet = entriesOf(artifact)['xl/worksheets/sheet1.xml'];
  assert.match(cellXml(sheet, 'C5'), />Subtotal<\/t>/);
  assert.match(cellXml(sheet, 'B5'), />00000000001<\/t>/);
  assert.match(cellXml(sheet, 'B6'), />Subtotal<\/t>/);
  assert.match(cellXml(sheet, 'D7'), /SUMIF\(B5:B6,&quot;Subtotal&quot;,D5:D6\)/);
  const rows = await readSheet(Buffer.from(artifact.bytes), input.sheets[0].title);
  const recalculated = rows.slice(4, 6).reduce((sum, row) => row[1] === 'Subtotal' ? sum + row[3] : sum, 0);
  assert.equal(recalculated, 1.01);
  assert.equal(rows[6][3], recalculated);
});
