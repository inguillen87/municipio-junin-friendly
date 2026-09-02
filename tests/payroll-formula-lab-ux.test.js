import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Nómina integra un laboratorio accesible y explícitamente no operativo', () => {
  const html = read('nomina-control.html');

  assert.match(html, /03 · LABORATORIO DE FÓRMULAS/);
  assert.match(html, /data-payroll-formula-lab/);
  assert.match(html, /Análisis sin cálculo ni impacto/);
  assert.match(html, /No calcula importes, no modifica una liquidación y no escribe en GRH ni en PostgreSQL/);
  assert.match(html, /ejemplo es sintético y no representa una regla municipal vigente/);
  assert.match(html, /<label for="payrollFormulaInput">/);
  assert.match(html, /maxlength="4096"/);
  assert.match(html, /data-formula-status role="status" aria-live="polite"/);
  assert.match(html, /data-formula-dependencies/);
  assert.match(html, /data-formula-constants/);
  assert.match(html, /data-formula-diagnostics/);
  assert.match(html, /data-formula-structure aria-label=/);
  assert.match(html, /Auditor de catálogo/);
  assert.match(html, /una asignación por línea/i);
  assert.match(html, /data-catalog-input maxlength="65536"/);
  assert.match(html, /data-catalog-status role="status" aria-live="polite"/);
  assert.match(html, /data-catalog-graph/);
  assert.match(html, /data-catalog-diagnostics/);
  assert.equal((html.match(/assets\/payroll-formula-linter\.js/g) || []).length, 1);
  assert.match(html, /<script type="module" src="assets\/payroll-formula-linter\.js"><\/script>/);
});

test('el cliente sólo analiza en memoria y renderiza texto sin HTML dinámico', () => {
  const source = read('assets/payroll-formula-linter.js');

  assert.match(source, /export function analyzeFormula/);
  assert.match(source, /export function analyzeFormulaCatalog/);
  assert.match(source, /export function parseFormulaCatalogText/);
  assert.match(source, /export function analyzeFormulaCatalogText/);
  assert.match(source, /export function mountPayrollFormulaLab/);
  assert.match(source, /\.textContent\s*=/);
  assert.match(source, /replaceChildren\(\)/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/);
});

test('el build publica el analizador junto a la pantalla privada sin precachearlo', () => {
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');

  assert.match(build, /'assets\/payroll-formula-linter\.js'/);
  assert.doesNotMatch(worker, /payroll-formula-linter/);
});
