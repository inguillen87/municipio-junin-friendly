import test from 'node:test';
import assert from 'node:assert/strict';
import {salaryGridDocument} from '../assets/native-salary-grid-export.js';
import {reportPdf} from '../assets/report-document.js';
import {row} from './fixtures/native-salary-synthetic.js';
import {salaryItems} from '../assets/native-salary-catalog-model.js';

const text = bytes => Buffer.from(bytes).toString('latin1');
const shown = pdf => [...pdf.matchAll(/<([0-9a-f]*)> Tj/g)].map(match => Buffer.from(match[1], 'hex').toString('latin1'));
const offsetsPointToObjects = pdf => {
  const xref = pdf.slice(pdf.lastIndexOf('\nxref\n') + 1), rows = [...xref.matchAll(/([0-9]{10}) 00000 n /g)];
  assert.equal(Number(/^xref\n0 ([0-9]+)\n/.exec(xref)[1]), rows.length + 1);
  for (const [index, entry] of rows.entries()) assert.equal(pdf.slice(Number(entry[1]), Number(entry[1]) + `${index + 1} 0 obj`.length), `${index + 1} 0 obj`);
  return rows.length;
};

test('la flecha de las vigencias se dibuja como flecha en el PDF, no como signo de pregunta', () => {
  const rows = salaryItems([row({code: '1', label: 'Básico sintético', unit: 'days'}), row({code: '88', kind: 'auxiliary', nature: 'auxiliary', unit: 'money', value: '1000.50', precision: 2})]);
  const doc = salaryGridDocument({rows, filtered: rows, revision: 5, version: 'b'.repeat(64), filters: {query: '', kind: ''}});
  assert.ok(doc.rows.every(cells => cells[7].includes(' → ')), 'la planilla conserva la flecha original');
  const pdf = text(reportPdf(doc)), pieces = shown(pdf);
  assert.ok(pieces.includes('2026-10 '), 'el texto anterior a la flecha queda intacto');
  assert.ok(pieces.some(piece => /^ \u0097 · Habilitada$/.test(piece)), 'el texto posterior a la flecha queda intacto'); // \u0097 = raya en WinAnsi
  assert.ok(!pieces.some(piece => piece.includes('2026-10 ?')), 'sin signo de pregunta en lugar de la flecha');
  assert.match(pdf, /\/F3 8(?:\.[0-9]+)? Tf <ae> Tj \/F1 8(?:\.[0-9]+)? Tf /); // arrowright de Symbol y vuelta a la fuente del renglón
  const objects = offsetsPointToObjects(pdf), pages = (pdf.match(/\/Type \/Page /g) || []).length;
  assert.equal(objects, 4 + pages * 2 + 1); // catálogo, páginas, dos fuentes, (hoja, contenido) por hoja y Symbol al final
  assert.match(pdf, new RegExp(`${objects} 0 obj\\n<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>`));
  assert.ok((pdf.match(new RegExp(` /F3 ${objects} 0 R >> >>`, 'g')) || []).length === pages, 'cada hoja declara la fuente');
});

test('un informe sin flechas conserva su estructura: no declara la fuente Symbol', () => {
  const rows = salaryItems([row({code: '1', label: 'Básico sintético', unit: 'days'})]);
  const doc = salaryGridDocument({rows, filtered: rows, revision: 5, version: 'b'.repeat(64), filters: {query: '', kind: ''}});
  const plain = {...doc, rows: doc.rows.map(cells => cells.map(cell => String(cell).replaceAll('→', 'a')))};
  const pdf = text(reportPdf(plain)), pages = (pdf.match(/\/Type \/Page /g) || []).length;
  assert.doesNotMatch(pdf, /Symbol|\/F3 /);
  assert.equal(offsetsPointToObjects(pdf), 4 + pages * 2);
  assert.ok(shown(pdf).some(piece => piece.startsWith('2026-10 a ')));
});
