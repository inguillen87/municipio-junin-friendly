import assert from 'node:assert/strict';
import test from 'node:test';
import { CATALOG_AREAS, catalogEntries, filterCatalog, catalogAreaCounts, normalizeCatalogSearch } from '../src/islands/report-catalog-model.js';

const cards = [
  ['Dotación por sector', 'Distribución al corte.', 'PDF · Excel · CSV', '#analizar-sectores', 'RR. HH.'],
  ['Hijos y certificados escolares', 'Fechas registradas.', 'Acceso interno · Excel', '#certificados-escolares', 'RR. HH.'],
  ['Haberes y descuentos', 'Conceptos conservados.', 'Requiere sesión · PDF · Excel · CSV', '#haberes', 'Nómina'],
  ['Planilla bancaria', 'Cuentas y netos por banco.', 'Acceso interno · Excel de control · PDF', '#planilla-bancaria', 'Nómina'],
  ['Jornadas y tiempos', 'Tramos por persona.', 'Acceso interno', '/relojes', 'Asistencia'],
  ['Documentos por legajo', 'Descargar detalle.', 'Acceso interno', '/personal#legajos', 'Nómina'],
  ['Informe ejecutivo completo', 'Cinco hojas del corte.', 'PDF · Excel', '#descargas', 'Institucional'],
  ['Formatos bancarios y fiscales', 'Herramientas de control.', 'Control externo · no presentación', '#formatos', 'Controles'],
];
const entries = catalogEntries(cards);
const hrefs = options => filterCatalog(entries, options).map(entry => entry.href);

test('empty search preserves every original destination and order without mutation', () => {
  const before = JSON.stringify(cards);
  assert.deepEqual(hrefs({}), cards.map(card => card[3]));
  assert.equal(JSON.stringify(cards), before);
  for (let index = 0; index < cards.length; index++) {
    assert.deepEqual([entries[index].title, entries[index].description, entries[index].tag, entries[index].href, entries[index].kind], cards[index]);
  }
});
test('search normalizes accents, punctuation, case and whitespace', () => {
  assert.equal(normalizeCatalogSearch('  DOTACIÓN — por  SECTOR  '), 'dotacion por sector');
  assert.deepEqual(hrefs({ query: '  DOTACION  ' }), ['#analizar-sectores']);
  assert.equal(normalizeCatalogSearch(null), '');
});
test('multiword search matches all words regardless of their order', () => {
  assert.deepEqual(hrefs({ query: 'sector dotacion' }), ['#analizar-sectores']);
  assert.deepEqual(hrefs({ query: 'planilla nacion' }), ['#planilla-bancaria']);
  assert.deepEqual(hrefs({ query: 'dotacion bancarizacion' }), []);
});
for (const [query, destination] of [
  ['mutuales', '#haberes'], ['retenciones', '#haberes'], ['bancarización', '#planilla-bancaria'],
  ['Credicoop', '#planilla-bancaria'], ['Santander', '#planilla-bancaria'], ['Nación', '#planilla-bancaria'],
  ['escolaridad', '#certificados-escolares'], ['recibos', '/personal#legajos'],
  ['fichadas', '/relojes'], ['F.931', '#formatos'], ['F931', '#formatos'], ['931 F', '#formatos'],
]) {
  test(`administrative term ${query} finds its existing task`, () => {
    assert.deepEqual(hrefs({ query }), [destination]);
  });
}
test('area and advertised format are intersected, never treated as alternatives', () => {
  assert.deepEqual(hrefs({ area: 'Nómina', format: 'CSV' }), ['#haberes']);
  assert.deepEqual(hrefs({ area: 'RR. HH.', format: 'Excel' }), ['#analizar-sectores', '#certificados-escolares']);
  assert.deepEqual(hrefs({ area: 'Asistencia', format: 'PDF' }), []);
  assert.deepEqual(hrefs({ area: 'Nómina', format: 'PDF', query: 'bancarizacion' }), ['#planilla-bancaria']);
});
test('TXT search finds external controls but never declares a TXT generator', () => {
  assert.deepEqual(hrefs({ query: 'TXT' }), ['#formatos']);
  assert.deepEqual(hrefs({ format: 'TXT' }), []);
  assert.deepEqual(entries.find(entry => entry.href === '#formatos').formats, []);
  assert.equal(entries.find(entry => entry.href === '#formatos').external, true);
  assert.equal(entries.find(entry => entry.href === '#planilla-bancaria').external, false);
});
test('area counts follow query and format, independent of selected area', () => {
  const counts = catalogAreaCounts(entries, { query: 'Excel', format: 'PDF', area: 'Asistencia' });
  assert.equal(counts.all, 4);
  assert.equal(counts['Nómina'], 2);
  assert.equal(counts['RR. HH.'], 1);
  assert.equal(counts.Asistencia, 0);
});
test('unknown filters and queries return an honest empty result', () => {
  assert.deepEqual(hrefs({ area: 'invalid' }), []);
  assert.deepEqual(hrefs({ format: 'invalid' }), []);
  assert.deepEqual(hrefs({ query: 'not-a-real-task' }), []);
});
test('legacy destinations keep their href while gaining the same task vocabulary', () => {
  const legacy = catalogEntries([
    ['Tiempo', '', 'Acceso interno', 'relojes-marcaciones.html', 'Asistencia'],
    ['Documentos', '', 'Acceso interno', 'internal-dashboard.html#legajos', 'Nómina'],
  ]);
  assert.equal(filterCatalog(legacy, { query: 'fichadas' })[0].href, 'relojes-marcaciones.html');
  assert.equal(filterCatalog(legacy, { query: 'recibos' })[0].href, 'internal-dashboard.html#legajos');
});
test('unknown task descriptions remain searchable without invented source or output', () => {
  const custom = catalogEntries([['Sintético de prueba', 'Consulta QA', 'Control', '#qa', 'QA']]);
  assert.equal(filterCatalog(custom, { query: 'sintetico' }).length, 1);
  assert.equal(custom[0].origin, 'Consultar alcance');
  assert.deepEqual(custom[0].formats, []);
  assert.equal(custom[0].external, false);
  assert.deepEqual(Object.keys(catalogAreaCounts(custom)), CATALOG_AREAS.map(area => area.id));
});
test('counting and filtering do not mutate caller filters or entries', () => {
  const frozen = entries.map(entry => Object.freeze({ ...entry, formats: Object.freeze([...entry.formats]) }));
  const filters = Object.freeze({ area: 'Nómina', format: 'Excel', query: 'liquidaciones' });
  const before = JSON.stringify(frozen);
  catalogAreaCounts(Object.freeze(frozen), filters);
  filterCatalog(frozen, filters);
  assert.equal(JSON.stringify(frozen), before);
});
