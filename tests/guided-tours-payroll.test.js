import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../assets/internal-guide.js', import.meta.url), 'utf8');

test('Liquidaciones tour follows the monthly flow on sidebar entries that exist today', () => {
  for (const sel of ['[data-task="calculo"]', '[data-task="decisiones"]', '[data-task="cierre"]', '[data-task="recibos"]', '[data-task="banco"]', '[data-task="reportes"]']) assert.ok(src.includes(`['${sel}'`), sel);
  assert.match(src, /'1 · Novedades del mes'/);
  assert.match(src, /'7 · Reportes y exportes'/);
  assert.doesNotMatch(src, /\['#runsTitle', 'Corridas'/);
});

test('Novedades tour points at the tabs and the guided form', () => {
  for (const sel of ['#mcTab-cargar', '[data-n-search]', '[data-n-concept]', '#mcTab-fijas', '#mcTab-otras']) assert.ok(src.includes(`['${sel}'`), sel);
  assert.doesNotMatch(src, /\['#previewPanel', 'Previsualización'/);
});
