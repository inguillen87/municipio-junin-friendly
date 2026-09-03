import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Nómina integra un conciliador poscierre agregado, local y accesible', () => {
  const html = read('nomina-control.html');
  const reconciler = read('assets/payroll-post-close-reconciler.js');

  assert.match(html, /05 · CONTROL POSCIERRE/);
  assert.match(html, /Conciliar aportes 701 y 703 sin rehacer planillas/);
  assert.match(html, /data-payroll-post-close-reconciler/);
  assert.match(html, /data-post-close-form novalidate/);
  assert.match(html, /type="month" required/);
  assert.match(html, /<option value="42">42<\/option>/);
  assert.match(html, /<option value="55">55<\/option>/);
  assert.equal((html.match(/data-post-close-observed-file(?=[\s>])/g) || []).length, 1);
  assert.equal((html.match(/data-post-close-control-file(?=[\s>])/g) || []).length, 1);
  assert.match(html, /data-post-close-observed-file[^>]+aria-invalid="false"[^>]+aria-describedby="postCloseObservedFileHelp postCloseObservedFileState"/);
  assert.match(html, /data-post-close-control-file[^>]+aria-invalid="false"[^>]+aria-describedby="postCloseControlFileHelp postCloseControlFileState"/);
  assert.equal((html.match(/>Elegir archivo CSV<\/span>/g) || []).length, 2);
  assert.match(html, /data-post-close-observed-file-state[^>]*>No hay un archivo seleccionado\.<\/span>/);
  assert.match(html, /data-post-close-control-file-state[^>]*>No hay un archivo seleccionado\.<\/span>/);
  assert.match(html, /data-post-close-error-summary role="alert" tabindex="-1"/);
  assert.match(html, /data-post-close-error-list/);
  assert.match(html, /data-post-close-observation maxlength="500"/);
  assert.match(html, /planilla de control declarada por el operador/);
  assert.doesNotMatch(html, /control independiente/);
  assert.match(html, /data-post-close-status role="status" aria-live="polite"/);
  assert.match(html, /data-post-close-rows/);
  assert.match(html, /data-post-close-evidence-summary>Sin huellas calculadas\./);
  assert.match(html, /<details class="post-close-evidence" data-post-close-evidence-details>/);
  assert.match(html, /<summary>Ver evidencia técnica<\/summary>/);
  assert.match(html, /data-post-close-export-actions hidden/);
  assert.match(html, /data-post-close-export-xlsx disabled>Descargar Excel/);
  assert.match(html, /data-post-close-export-pdf disabled>Descargar PDF/);
  assert.match(html, /data-post-close-export-status data-state="warning" role="status" aria-live="polite"/);
  assert.match(html, /\.post-close-export-status\[data-state="ok"\]/);
  assert.match(html, /\.post-close-export-status\[data-state="warning"\]/);
  assert.match(html, /\.post-close-export-status\[data-state="error"\]/);
  assert.match(html, /borradores locales, no incluyen la observación ni registros nominales, y no verifican procedencia o independencia de las fuentes/);
  assert.match(html, /\.post-close-export-actions \.button \{ width: 100%; \}/);
  assert.match(html, /<th>Jurisdicción<\/th><th>Concepto<\/th>/);
  assert.match(html, /<th colspan="2">Total jurisdicción<\/th>/);
  assert.match(html, /data-label="Reporte GRH" data-post-close-total-observed/);
  assert.match(html, /\.post-close-results tbody td::before/);
  assert.match(html, /no genera F\.931 y no escribe en GRH, PostgreSQL o Neon/);
  assert.match(html, /control poscierre y el precontrol mensual técnico/);
  assert.equal((html.match(/assets\/payroll-post-close-reconciler\.js/g) || []).length, 1);
  assert.doesNotMatch(html, /<script[^>]+payroll-post-close-exporter/);
  assert.match(reconciler, /function showFormErrors\(title, entries\)/);
  assert.match(reconciler, /errorSummary\.focus\(\)/);
  assert.match(reconciler, /input\.setAttribute\('aria-invalid', String\(tooLarge\)\)/);
  assert.match(reconciler, /setExportStatus\(\s*result\.reconciled \? 'ok' : 'warning'/);
  assert.match(reconciler, /sourceBytesDiffer \? 'warning' : 'error'/);
  assert.match(reconciler, /observation\.required = result\.observationRequired && !result\.inputRequirementsSatisfied/);
  assert.doesNotMatch(reconciler, /\.innerHTML\s*=/);
});

test('el build publica el conciliador privado sin agregarlo al precache público', () => {
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');

  assert.match(build, /'assets\/payroll-post-close-reconciler\.js'/);
  assert.match(build, /'assets\/payroll-post-close-exporter\.js'/);
  assert.doesNotMatch(worker, /payroll-post-close-reconciler/);
  assert.doesNotMatch(worker, /payroll-post-close-exporter/);
});
