import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRH_CONCEPTS, searchConcepts, conceptInfo, conceptLabel } from '../assets/grh-concept-dictionary.js';

test('concept catalogue: codes, groups and search by code or words without personal data', () => {
  assert.ok(GRH_CONCEPTS.length >= 200);
  for (const c of GRH_CONCEPTS) { assert.match(c.code, /^[1-9]\d{0,3}$/); assert.ok(['haber', 'no_remunerativo', 'asignacion', 'descuento', 'contribucion'].includes(c.group)); assert.equal(typeof c.novelty, 'boolean'); }
  assert.equal(searchConcepts('638')[0].code, '638');
  assert.ok(searchConcepts('sindicato').some(c => c.code === '617'));
  assert.equal(conceptInfo('0638')?.code, '638');
  assert.match(conceptLabel(conceptInfo('600')), /^600 · .+ · Descuento/);
  assert.equal(conceptInfo('99999'), null);
  const source = fs.readFileSync('assets/grh-concept-dictionary.js', 'utf8');
  assert.doesNotMatch(source, /\b\d{7,8}\b/, 'no DNI-like numbers in the catalogue');
});

test('Novedades: guided own flow, no endless roster, tabs and catalogue on every concept field', () => {
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.match(panel, /filtered=!query\|\|many\?\[\]:/, 'nothing is listed until something is typed');
  assert.match(panel, /data-n-concept list="ownNoveltyConcepts"/);
  assert.match(panel, /<select data-n-movement><option value="">Sin movimiento<\/option><option value="standard">Normal<\/option><option value="adjustment">Ajuste<\/option><\/select>/);
  assert.match(panel, /<details class="own-novelties-more">/);
  const page = fs.readFileSync('novedades-nomina.html', 'utf8');
  assert.match(page, /<script type="module" src="assets\/novedades-tabs.js"><\/script>/);
  const tabs = fs.readFileSync('assets/novedades-tabs.js', 'utf8');
  assert.match(tabs, /panels: \['#ownNativeBulkNovelties'\]/);
  assert.match(tabs, /panels: \['#noveltyReferenceWorkspace'\]/);
  assert.match(tabs, /setAttribute\('list', 'mcConceptList'\)/);
  const quickbar = fs.readFileSync('assets/workspace-quickbar.js', 'utf8');
  assert.match(quickbar, /globalThis\.mcSectionTabsReveal\?\.\(node\)/);
  const css = fs.readFileSync('assets/section-tabs.css', 'utf8');
  assert.match(css, /\.mc-tab-off\{display:none!important\}/);
  assert.match(css, /@media print\{\.mc-section-tabs\{display:none\}\.mc-tab-off\{display:block!important\}\}/);
});
