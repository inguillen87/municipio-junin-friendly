import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const html = fs.readFileSync(new URL('../nomina-control.html', import.meta.url), 'utf8');

test('Nómina abre con cinco trabajos contables reconocibles y deja lo técnico en segundo plano', () => {
  assert.match(html, /¿Qué necesitás hacer hoy\?/);
  assert.equal((html.match(/class="payroll-task-option"/g) || []).length, 5);
  assert.match(html, /<strong>Recibos y liquidaciones<\/strong>/);
  assert.match(html, /<strong>Control mensual<\/strong>/);
  assert.match(html, /href="reportes-rrhh\.html#bancarizacion"/);
  assert.match(html, /planilla bancaria del período/i);
  assert.match(html, /<strong>Reporte ART<\/strong>/);
  assert.match(html, /<strong>Bancos y transferencias<\/strong>/);
  assert.match(html, /<strong>OSEP y Mutual<\/strong>/);
  assert.match(html, /Herramientas avanzadas e historial/);
  assert.match(html, /data-payroll-task-section="advanced" data-payroll-formula-lab/);
  assert.match(html, /data-payroll-task-section="advanced" data-grh-source-preview/);
  assert.match(html, /id="historySection"[^>]+data-payroll-task-section="advanced"/);
  assert.match(html, /id="auditSection"[^>]+data-payroll-task-section="advanced"/);
});

test('Todos los reportes ofrece los nueve pedidos relevados sin crear nueve tarjetas gigantes', () => {
  const catalog = html.match(/<details class="payroll-report-catalog"[\s\S]*?<\/details>/)?.[0] || '';
  assert.match(catalog, /Todos los reportes/);
  assert.equal((catalog.match(/<li>/g) || []).length, 9);
  assert.match(catalog, /Bancarización Dpto\. \/ Control General/);
  assert.match(catalog, /Credicoop TXT · J42 y J55/);
  assert.match(catalog, /Nación · J42 y J55/);
  assert.match(catalog, /Transferencias varias XLSX\/TXT/);
  assert.match(catalog, /<strong>OSEP<\/strong>/);
  assert.match(catalog, /<strong>Seguro Mutual<\/strong>/);
  assert.match(catalog, /ART · conceptos 993 \+ 995/);
  assert.match(catalog, /Escolaridades XLSX/);
  assert.match(catalog, /F\.931 TXT/);
  assert.equal((catalog.match(/Prevalidación/g) || []).length, 7);
  assert.match(catalog, /href="reportes-rrhh\.html#bancarizacion"/);
  assert.match(catalog, /href="reportes-rrhh\.html#escolaridades"/);
  assert.match(catalog, /href="reportes-rrhh\.html#f931"/);
});

test('la selección conserva todos los recorridos y sólo despliega la tarea elegida', () => {
  assert.match(html, /data-payroll-task-select="prepare"/);
  assert.match(html, /data-payroll-task-select="review"/);
  assert.match(html, /data-payroll-task-show-all/);
  assert.match(html, /data-payroll-monthly-close-workflow/);
  assert.match(html, /data-payroll-control-import-workflow/);
  assert.match(html, /data-payroll-reprocessing-workflow/);
  assert.match(html, /data-payroll-art-report-workbench/);
  assert.match(html, /data-payroll-bank-report-workbench/);
  assert.match(html, /data-payroll-health-fixed-width-workbench/);

  const script = html.match(/<script data-payroll-progressive-navigation>([\s\S]*?)<\/script>/)?.[1] || '';
  assert.match(script, /section\.hidden = !sectionSupportsTask\(section, task\)/);
  assert.match(script, /setSectionExpanded\(targetSection, true\)/);
  assert.match(script, /setSubtoolExpanded\(targetSubtool, true\)/);
  assert.match(script, /toggle\.setAttribute\('aria-expanded'/);
  assert.match(script, /heading\.focus\(\{ preventScroll: true \}\)/);
  assert.match(script, /status\.replaceChildren/);
  assert.match(script, /data-payroll-task-open/);
  assert.match(script, /bankProfile\.dispatchEvent\(new Event\('change'/);
  assert.match(script, /healthProfile\.dispatchEvent\(new Event\('change'/);
  assert.doesNotMatch(script, /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|fetch\s*\(/);
});

test('la portada y los paneles progresivos mantienen semántica accesible y adaptación móvil', () => {
  assert.match(html, /id="payrollTaskStatus" role="status" aria-live="polite"/);
  assert.match(html, /data-payroll-task-select="art"[^>]+aria-pressed="false"[^>]+aria-controls="artReportSection"/);
  assert.match(html, /data-payroll-task-select="banks"[^>]+aria-pressed="false"[^>]+aria-controls="bankDiagnosticSection"/);
  assert.match(html, /data-payroll-task-select="health"[^>]+aria-pressed="false"[^>]+aria-controls="healthDiagnosticSection"/);
  assert.match(html, /\.payroll-task-list \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.payroll-task-more \{ display: grid; grid-template-columns: 1fr; \}/);
  assert.match(html, /@media print[\s\S]*\.payroll-task-section, \.payroll-section-body, \.payroll-subtool-body \{ display: block !important; \}/);
});
