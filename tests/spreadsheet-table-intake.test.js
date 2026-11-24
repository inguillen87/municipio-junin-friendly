import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { zipSync, unzipSync, strFromU8 } from 'fflate';
import { storedZip } from '../assets/clock-dashboard-zip.js';
import { buildXlsxWorkbook, readSpreadsheetInput } from '../assets/spreadsheet-table-intake.js';
import { fixedBulkDraft, fixedBulkTemplateXlsx } from '../assets/payroll-fixed-bulk-model.js';

test('readSpreadsheetInput reads first sheet of xlsx with sharedStrings, inlineStr, sparse columns, boolean and Excel serial dates', async () => {
  const xlsx = zipSync({
    '[Content_Types].xml': Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/></Types>'),
    '_rels/.rels': Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': Buffer.from('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Novedades" sheetId="1" r:id="rId1"/><sheet name="Ignorar" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'),
    'xl/sharedStrings.xml': Buffer.from('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Legajo</t></si><si><t>Concepto</t></si><si><t>Importe</t></si><si><t>Fecha de alta</t></si><si><r><t>Resolución </t></r><r><t>A&amp;B</t></r></si></sst>'),
    'xl/styles.xml': Buffer.from('<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164"/></cellXfs></styleSheet>'),
    'xl/worksheets/sheet1.xml': Buffer.from('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="inlineStr"><is><t>Instrumento</t></is></c></row>'
      + '<row r="2"><c r="A2"><v>1001</v></c><c r="B2"><v>80</v></c><c r="C2"><v>1500.50</v></c><c r="D2" s="1"><v>46280</v></c><c r="E2" t="s"><v>4</v></c></row>'
      + '<row r="4"><c r="A4"><v>1002</v></c><c r="B4"><v>638</v></c><c r="C4"><v>0</v></c><c r="D4" t="inlineStr"><is><t>01/10/2026</t></is></c></row>'
      + '</sheetData></worksheet>'),
    'xl/worksheets/sheet2.xml': Buffer.from('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>OTRA</t></is></c></row></sheetData></worksheet>'),
  });

  const table = await readSpreadsheetInput({ name: 'carga.xlsx', bytes: xlsx }, { unzip: unzipSync });
  assert.equal(table.format, 'xlsx');
  assert.equal(table.sheetName, 'Novedades');
  assert.deepEqual(table.lineNumbers, [1, 2, 4]);
  assert.deepEqual(table.rows[0], ['Legajo', 'Concepto', 'Importe', 'Fecha de alta', 'Instrumento']);
  assert.deepEqual(table.rows[1], ['1001', '80', '1500.50', '2026-09-15', 'Resolución A&B']);
  assert.deepEqual(table.rows[2], ['1002', '638', '0', '01/10/2026', '']);

  const parsed = fixedBulkDraft(table, { reason: 'Importación sintética Excel', legalInstrument: 'Decreto común' });
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].error, null);
  assert.equal(parsed[0].draft.values.amountCents, '150050');
  assert.equal(parsed[0].draft.values.validFrom, '2026-09-15');
  assert.equal(parsed[1].draft.values.amountCents, '0');
  assert.equal(parsed[1].draft.values.legalInstrument, 'Decreto común');
});

test('buildXlsxWorkbook and fixedBulkTemplateXlsx produce round-trip readable xlsx up to 2000 rows', async () => {
  const tpl = fixedBulkTemplateXlsx({ zip: storedZip });
  const parsedTpl = await readSpreadsheetInput({ name: 'plantilla.xlsx', bytes: tpl }, { unzip: unzipSync });
  assert.equal(parsedTpl.sheetName, 'Novedades fijas');
  assert.equal(parsedTpl.rows[0][0], 'Legajo');
  assert.equal(parsedTpl.rows[1][0], '1001');

  const bigRows = [['Legajo', 'Concepto', 'Unidades', 'Importe', 'Fecha de alta', 'Vencimiento', 'Instrumento']];
  for (let i = 1; i <= 2000; i++) {
    bigRows.push([String(1000 + i), '80', '1', '', '2026-10-01', '', 'Acto común 2000']);
  }
  const bigXlsx = buildXlsxWorkbook([{ name: 'Carga 2000', rows: bigRows }]);
  const bigTable = await readSpreadsheetInput({ name: '2000.xlsx', bytes: bigXlsx }, { unzip: unzipSync });
  const drafts = fixedBulkDraft(bigTable, { reason: 'Prueba de 2000 filas', legalInstrument: 'Acto común 2000' });
  assert.equal(drafts.length, 2000);
  assert.ok(drafts.every((r) => r.error === null));
});

test('readSpreadsheetInput rejects legacy .xls binary with actionable error and decodes Latin-1 CSV cleanly', async () => {
  const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
  await assert.rejects(() => readSpreadsheetInput({ name: 'viejo.xls', bytes: ole2 }), /Excel moderno \(\.xlsx\)/);

  // "Resolución" en Windows-1252 (0xf3 para ó)
  const latin1Bytes = new Uint8Array(Buffer.from('Legajo;Concepto;Unidades;Importe;Fecha de alta;Vencimiento;Instrumento\r\n1001;80;1;;01/10/2026;;Resoluci\xf3n 12\r\n', 'latin1'));
  const csvTable = await readSpreadsheetInput({ name: 'novedades.csv', bytes: latin1Bytes });
  assert.equal(csvTable.format, 'csv');
  assert.equal(csvTable.rows[1][6], 'Resolución 12');

  const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  assert.match(build, /'assets\/spreadsheet-table-intake\.js'/);
  const files = unzipSync(fixedBulkTemplateXlsx());
  assert.match(strFromU8(files['xl/worksheets/sheet1.xml']), /Novedades fijas|Legajo/);
});

test('readSpreadsheetInput reads a browser File whose bytes() is a method (Chrome) instead of treating it as data', async () => {
  const csv = 'Legajo;Concepto;Unidades;Importe;Fecha de alta;Vencimiento;Instrumento\n300;56;1;;2025-05-01;2050-12-31;Sintético\n';
  const raw = new TextEncoder().encode(csv);
  const fileLike = {
    name: 'fijas.csv',
    type: 'text/csv',
    size: raw.byteLength,
    bytes: async () => raw,
    text: async () => csv,
    arrayBuffer: async () => raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  };
  const table = await readSpreadsheetInput(fileLike);
  assert.equal(table.format, 'csv');
  assert.equal(table.rows.length, 2);
  assert.deepEqual(table.rows[1].slice(0, 3), ['300', '56', '1']);
});
