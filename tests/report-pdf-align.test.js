import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPdf} from '../assets/report-document.js';

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
