import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('el informe expone descargas trazables y accesibles desde el mismo corte agregado', () => {
  const html = read('reportes-rrhh.html');

  assert.match(html, /id="descargas" aria-labelledby="exportPackTitle"/);
  assert.match(html, /Paquete ejecutivo de RRHH/);
  assert.match(html, /Excel de cinco hojas o un PDF A4/);
  assert.match(html, /id="downloadRrhhXlsx" type="button" disabled>Descargar Excel/);
  assert.match(html, /id="downloadRrhhPdf" type="button" disabled>Descargar PDF/);
  assert.match(html, /id="reportPackStatus"[^>]+role="status" aria-live="polite"/);
  assert.match(html, /id="exportPackActions" aria-busy="true"/);
  assert.match(html, /No consulta ni escribe en Neon/);
  assert.match(html, /no contienen nombres, documentos ni filas personales/);
  assert.match(html, /constituyen un cierre de liquidación ni calculan remuneraciones/);
  assert.match(html, /import\('\.\/assets\/rrhh-report-pack\.js'\)/);
  assert.match(html, /createRrhhReportSnapshot\(data, \{ generatedAt: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(html, /createRrhhReportXlsxArtifact\(snapshot\)/);
  assert.match(html, /createRrhhReportPdfArtifact\(snapshot\)/);
  assert.match(html, /downloadRrhhReportArtifact\(artifact\)/);
  assert.doesNotMatch(html, /<script[^>]+rrhh-report-pack\.js/);
});

test('el build y el PWA publican el módulo agregado sin incorporar APIs internas', () => {
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');
  const module = read('assets/rrhh-report-pack.js');

  assert.match(build, /'assets\/rrhh-report-pack\.js'/);
  assert.match(worker, /'\/assets\/rrhh-report-pack\.js'/);
  assert.match(worker, /Sólo contenido público, agregado y sin identidad personal/);
  assert.doesNotMatch(module, /\/api\/internal|@neondatabase|postgres|DATABASE_URL/i);
  assert.doesNotMatch(module, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource/);
});
