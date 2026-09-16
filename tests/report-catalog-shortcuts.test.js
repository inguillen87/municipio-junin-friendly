import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { CATALOG_SHORTCUTS, catalogShortcut } from '../src/islands/report-catalog-shortcuts.js';
import { catalogEntries, filterCatalog, CATALOG_AREAS } from '../src/islands/report-catalog-model.js';
const entries = catalogEntries([
  ['Haberes y descuentos', 'Conceptos', 'PDF · Excel · CSV', '#haberes', 'Nómina'],
  ['Planilla bancaria', 'Neto', 'PDF · Excel', '#planilla-bancaria', 'Nómina'],
  ['Certificados escolares', 'Hijos', 'Excel', '#certificados-escolares', 'RR. HH.'],
  ['Documentos por legajo', 'Detalle', 'Acceso interno', '/personal#legajos', 'Nómina'],
  ['Formatos', 'Control', 'Control externo', '#formatos', 'Controles'],
]);
for (const [id, destination] of [['mutuales', '#haberes'], ['bancos', '#planilla-bancaria'], ['escolaridad', '#certificados-escolares'], ['recibos', '/personal#legajos']]) {
  test(`${id} selects its existing destination without advertising new output`, () => {
    const selection = catalogShortcut(id);
    assert.deepEqual(filterCatalog(entries, selection).map(entry => entry.href), [destination]);
    assert.equal(selection.format, 'all');
    assert.ok(CATALOG_AREAS.some(area => area.id === selection.area));
  });
}
test('shortcut configuration is immutable and returns a fresh bounded filter', () => {
  assert.equal(new Set(CATALOG_SHORTCUTS.map(item => item.id)).size, 4);
  assert.ok(Object.isFrozen(CATALOG_SHORTCUTS));
  assert.ok(CATALOG_SHORTCUTS.every(Object.isFrozen));
  const first = catalogShortcut('bancos');
  first.area = 'modified';
  assert.equal(catalogShortcut('bancos').area, 'Nómina');
  assert.deepEqual(Object.keys(first).sort(), ['area', 'format', 'query']);
});
test('unknown and coercible identifiers do not choose a fallback task', () => {
  for (const value of ['', null, undefined, {}, ['bancos'], '__proto__', 'BANKS']) assert.throws(() => catalogShortcut(value), TypeError);
});
test('compact view is presentation only, preserves working forms and keeps fallback lifecycle', () => {
  const source = fs.readFileSync(new URL('../src/islands/ReportCatalog.jsx', import.meta.url), 'utf8');
  assert.ok(source.includes('data-catalog-view={view}'));
  assert.ok(source.includes("useState('cards')"));
  assert.ok(source.includes('aria-pressed={view === value}'));
  assert.ok(source.includes('onClick={() => setView(value)}'));
  assert.ok(source.includes('onReady?.(input.current)'));
  assert.doesNotMatch(source, /localStorage|sessionStorage|fetch\(|innerHTML|location\.(?:href|assign)\s*=/);
  assert.doesNotMatch(source, /setInterval|setTimeout/);
});
