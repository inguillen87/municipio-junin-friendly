import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Nómina integra un laboratorio accesible y explícitamente no operativo', () => {
  const html = read('nomina-control.html');

  assert.match(html, /03 · ESCALA SALARIAL Y FÓRMULAS/);
  assert.match(html, /<h2 id="formulaLabTitle">Actualizar la escala salarial<\/h2>/);
  assert.match(html, /Cambiar la escala con una instrucción simple/);
  assert.match(html, /<strong>Actualizar escala salarial<\/strong>/);
  assert.match(html, /data-payroll-task-section="formulas advanced" data-payroll-formula-lab/);
  assert.match(html, /El aumento de la escala salarial se calcula siempre sobre la asignación de la clase/);
  assert.match(html, /data-payroll-formula-proposal/);
  assert.match(html, /data-formula-proposal-form/);
  assert.match(html, /<label for="formulaProposalInstruction">/);
  assert.match(html, /<label for="formulaProposalJurisdiction">/);
  assert.match(html, /<label for="formulaProposalAgreement">/);
  assert.match(html, /<label for="formulaProposalValidFrom">/);
  assert.match(html, /<label for="formulaProposalPayrollType">/);
  assert.match(html, /data-formula-proposal-before/);
  assert.match(html, /data-formula-proposal-after/);
  assert.match(html, /data-formula-proposal-blockers/);
  assert.match(html, /data-formula-review-context hidden/);
  assert.match(html, /data-formula-technical-details/);
  assert.match(html, /Ver analizador técnico y auditor de fórmulas/);
  assert.match(html, /Interpretación determinística en el navegador/);
  assert.match(html, /no escribe PostgreSQL y no publica fórmulas/);
  assert.match(html, /data-payroll-formula-lab/);
  assert.match(html, /Análisis sin cálculo ni impacto/);
  assert.match(html, /No calcula haberes, no modifica una liquidación y no escribe en GRH ni PostgreSQL/);
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
  assert.equal((html.match(/assets\/payroll-formula-proposal\.js/g) || []).length, 1);
  assert.match(html, /<script type="module" src="assets\/payroll-formula-linter\.js"><\/script>/);
  assert.match(html, /<script type="module" src="assets\/payroll-formula-proposal\.js"><\/script>/);
});

test('el cliente sólo analiza en memoria y renderiza texto sin HTML dinámico', () => {
  const source = read('assets/payroll-formula-linter.js');
  const proposal = read('assets/payroll-formula-proposal.js');

  assert.match(source, /export function analyzeFormula/);
  assert.match(source, /export function analyzeFormulaCatalog/);
  assert.match(source, /export function parseFormulaCatalogText/);
  assert.match(source, /export function analyzeFormulaCatalogText/);
  assert.match(source, /export function mountPayrollFormulaLab/);
  assert.match(source, /payroll-formula:analyze-proposal/);
  assert.match(source, /\.textContent\s*=/);
  assert.match(source, /replaceChildren\(\)/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/);
  assert.match(proposal, /export function createPayrollFormulaProposal/);
  assert.match(proposal, /export function mountPayrollFormulaProposal/);
  assert.match(proposal, /Referencia y versión todavía no verificadas contra el catálogo certificado/);
  assert.doesNotMatch(proposal, /fetch\s*\(|XMLHttpRequest|indexedDB|localStorage|sessionStorage/);
  assert.doesNotMatch(proposal, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test('el build publica el analizador junto a la pantalla privada sin precachearlo', () => {
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');

  assert.match(build, /'assets\/payroll-formula-linter\.js'/);
  assert.match(build, /'assets\/payroll-formula-proposal\.js'/);
  assert.doesNotMatch(worker, /payroll-formula-linter/);
  assert.doesNotMatch(worker, /payroll-formula-proposal/);
});
