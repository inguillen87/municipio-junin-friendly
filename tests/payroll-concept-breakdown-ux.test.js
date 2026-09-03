import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Nómina ofrece el libro mensual sólo después de validar J42, J55 y General', () => {
  const html = read('nomina-control.html');
  const adapter = read('assets/monthly-close-grh-summary-adapter.js');
  assert.match(html, /<h4>Libro mensual de conceptos<\/h4>/);
  assert.match(html, /Resumen, J42, J55, General y Trazabilidad/);
  assert.equal((html.match(/data-grh-summary-export-xlsx/g) || []).length, 1);
  assert.match(html, /data-grh-summary-export-xlsx disabled>Descargar Excel completo<\/button>/);
  assert.match(html, /data-grh-summary-export-status data-state="warning" role="status" aria-live="polite"/);
  assert.match(html, /no contiene filas personales ni datos bancarios/i);
  assert.equal((html.match(/assets\/monthly-close-grh-summary-adapter\.js/g) || []).length, 1);
  assert.doesNotMatch(html, /<script[^>]+payroll-concept-breakdown-exporter/);

  assert.match(adapter, /from '\.\/payroll-concept-breakdown-exporter\.js'/);
  assert.match(adapter, /createPayrollConceptBreakdownXlsx\(currentSummary\)/);
  assert.match(adapter, /downloadPayrollConceptBreakdownArtifact\(artifact\)/);
  assert.match(adapter, /workbookButton\.disabled = true/);
  assert.match(adapter, /workbookButton\.disabled = false/);
  assert.match(adapter, /clearResult\(\)/);
});

test('el build publica el exportador privado sin incorporarlo al precache', () => {
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');
  assert.match(build, /'assets\/payroll-concept-breakdown-exporter\.js'/);
  assert.doesNotMatch(worker, /payroll-concept-breakdown-exporter/);
  assert.doesNotMatch(worker, /monthly-close-grh-summary-adapter/);
});
