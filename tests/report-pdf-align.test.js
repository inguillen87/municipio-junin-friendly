import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPdf} from '../assets/report-document.js';
import {readFileSync} from 'node:fs';
import {reportCsv,reportXlsx} from '../assets/report-document.js';
import {ownReportBundle,ownReportDocument} from '../assets/own-payroll-report-model.js';
import {reportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {analysisModel,analysisDocument} from '../assets/report-analysis.js';


// Posición x de cada texto dibujado: «1 0 0 1 x y Tm <hex> Tj».
const placed = bytes => [...Buffer.from(bytes).toString('latin1').matchAll(/1 0 0 1 ([0-9.]+) ([0-9.]+) Tm <([0-9a-f]*)> Tj/g)]
  .map(m => ({x: Number(m[1]), text: Buffer.from(m[3], 'hex').toString('latin1')}));
const doc = align => ({layout: 'own-grh-comparison.v1', title: 'Alineación sintética', filename: 'municontrol_qa_align',
  columns: [{label: 'Legajo', type: 'text', width: 20}, {label: 'Importe', type: 'text', width: 20, pdfExact: true, ...(align ? {align} : {})}],
  rows: [['1001', '-150.00'], ['1002', '1234567.89']], totals: [], metadata: [], notes: []});

test('una columna con align:right alinea importes y encabezado al borde derecho de su celda; sin align no cambia nada', () => {
  const left = placed(reportPdf(doc())), right = placed(reportPdf(doc('right')));
  const find = (list, text) => list.filter(p => p.text === text);
  // Sin align: el texto empieza a 6 puntos del borde izquierdo de la celda (igual que antes del cambio).
  const [a1] = find(left, '1.234.567,89'), [a2] = find(left, '-150,00');
  assert.ok(a1 && a2, 'los importes se dibujan con su forma exacta');
  assert.equal(a1.x, a2.x, 'sin align todos empiezan en la misma x');
  // Con align:right: los dos importes terminan en el mismo borde, así que el más corto empieza más a la derecha.
  const [b1] = find(right, '1.234.567,89'), [b2] = find(right, '-150,00');
  assert.ok(b2.x > b1.x && b1.x > a1.x, 'el importe corto empieza más a la derecha y ambos se corren hacia el borde');
  // El legajo (sin align) queda igual en ambos documentos.
  assert.deepEqual(find(left, '1001').map(p => p.x), find(right, '1001').map(p => p.x));
  // El encabezado de la columna alineada también se corre a la derecha.
  assert.ok(find(right, 'Importe')[0].x > find(left, 'Importe')[0].x);
});

const position = (placements, value) => {
  const matches = placements.filter(p => p.text === value);
  assert.equal(matches.length, 1, 'Debe aparecer una sola celda con ' + value);
  return matches[0].x;
};
const withoutAlignment = document => ({
  ...document,
  columns: document.columns.map(({align, ...column}) => column),
});
const assertOnlyPdfPositionChanges = document => {
  const left = withoutAlignment(document);
  assert.equal(reportCsv(document), reportCsv(left), 'CSV conserva exactamente los bytes');
  assert.deepEqual(reportXlsx(document), reportXlsx(left), 'XLSX conserva exactamente los bytes');
  return {right: placed(reportPdf(document)), left: placed(reportPdf(left))};
};

test('nómina propia: bruto, retenciones y neto alinean a la derecha; legajos, fechas y CSV/XLSX no cambian', () => {
  const fixture = reportFixture(2);
  const document = ownReportDocument(ownReportBundle(fixture.query, fixture.details, fixture.receipts));
  for (const label of ['Bruto exacto', 'Retenciones exactas', 'Neto exacto']) {
    assert.equal(document.columns.find(c => c.label === label)?.align, 'right', label);
  }
  for (const label of ['Período', 'Tipo', 'Legajo', 'Convenio', 'Repartición']) {
    assert.notEqual(document.columns.find(c => c.label === label)?.align, 'right', label);
  }
  assert.ok(document.rows.length >= 2);
  const index = document.columns.findIndex(c => c.label === 'Bruto exacto');
  const rows = document.rows.slice(0, 2).map(row => [...row]);
  rows[0][index] = '-150.00';
  rows[1][index] = '1234567.89';
  const {right, left} = assertOnlyPdfPositionChanges({...document, rows});
  assert.equal(position(left, '-150,00'), position(left, '1.234.567,89'));
  assert.ok(position(right, '-150,00') > position(right, '1.234.567,89'));
  assert.ok(position(right, '1.234.567,89') > position(left, '1.234.567,89'));
});

test('RRHH: altas y bajas quedan a la derecha pero el año permanece a la izquierda; CSV/XLSX idénticos', () => {
  const raw = JSON.parse(readFileSync(new URL('../friendly-data.json', import.meta.url), 'utf8'));
  const document = analysisDocument(analysisModel(raw, {kind: 'movimientos'}));
  assert.equal(document.columns.find(c => c.label === 'Año')?.align, undefined);
  for (const label of ['Altas', 'Bajas', 'Balance registral']) {
    assert.equal(document.columns.find(c => c.label === label)?.align, 'right', label);
  }
  assert.ok(document.rows.length >= 2);
  const index = document.columns.findIndex(c => c.label === 'Altas');
  const rows = document.rows.slice(0, 2).map(row => [...row]);
  rows[0][index] = 9;
  rows[1][index] = 12345;
  const {right, left} = assertOnlyPdfPositionChanges({...document, rows});
  assert.equal(position(left, '9'), position(left, '12.345'));
  assert.ok(position(right, '9') > position(right, '12.345'));
  assert.ok(position(right, '12.345') > position(left, '12.345'));
});
