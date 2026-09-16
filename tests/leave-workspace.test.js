import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { filterLeaveRules, leaveRuleCounts, normalizeRuleSearch, leaveRuleLabel } from '../src/islands/leave-rules-model.js';

const rules = [
  { id: 'anual', code: '21', label: 'Licencia anual', category: 'calculable', basis: 'Artículo 38', unit: 'Días corridos', conditions: ['Antigüedad reconocida'], limitations: ['No equivale a saldo'] },
  { id: 'familiar', code: '10', label: 'Cuidado de familiar', category: 'conditional', basis: 'Artículo 50', conditions: ['Evidencia médica'], limitations: ['Validación humana'] },
  { id: 'horas', code: 'horas', label: 'Horas efectivas', category: 'not_calculable', summary: 'Sin fichadas completas', conditions: [], limitations: ['Calendario homologado'] },
];
test('rule filtering preserves original objects, order and duplicate source IDs', () => {
  const duplicate = [...rules, { ...rules[0], label: 'Otra regla' }];
  assert.deepEqual(filterLeaveRules(duplicate), duplicate);
  assert.equal(filterLeaveRules(duplicate)[0], rules[0]);
  assert.equal(filterLeaveRules(duplicate).length, 4);
});
for (const [query, id] of [['ANUAL licencia', 'anual'], ['antiguedad', 'anual'], ['38', 'anual'], ['medica', 'familiar'], ['humana validación', 'familiar'], ['homologado', 'horas']]) {
  test(`rule search uses explicit evidence: ${query}`, () => {
    assert.deepEqual(filterLeaveRules(rules, { query }).map(x => x.id), [id]);
  });
}
test('query and category intersect and unknown filters stay empty', () => {
  assert.equal(filterLeaveRules(rules, { query: 'anual', category: 'conditional' }).length, 0);
  assert.equal(filterLeaveRules(rules, { category: 'unknown' }).length, 0);
  assert.equal(filterLeaveRules(rules, { query: 'no existe' }).length, 0);
  assert.deepEqual(filterLeaveRules([], { category: 'all' }), []);
});
test('counts reflect search rather than an unrelated total', () => {
  assert.deepEqual(leaveRuleCounts(rules, 'medica'), { all: 1, calculable: 0, conditional: 1, not_calculable: 0 });
  assert.deepEqual(leaveRuleCounts([]), { all: 0, calculable: 0, conditional: 0, not_calculable: 0 });
});
test('accents and punctuation normalize, empty queries stay empty', () => {
  assert.equal(normalizeRuleSearch(' MÉDICA — artículo 50 '), 'medica articulo 50');
  assert.equal(normalizeRuleSearch(null), '');
  assert.equal(leaveRuleLabel('unexpected'), 'Requieren validación');
});
test('frozen rule records and caller filters are never mutated', () => {
  const frozen = Object.freeze(rules.map(x => Object.freeze({ ...x, conditions: Object.freeze(x.conditions), limitations: Object.freeze(x.limitations) })));
  filterLeaveRules(frozen, Object.freeze({ category: 'calculable', query: 'anual' }));
  leaveRuleCounts(frozen);
});
const html = fs.readFileSync(new URL('../licencias-control.html', import.meta.url), 'utf8');
const functionBody = html.match(/function normalizeStatus\(value\) \{([\s\S]*?)\n      function normalizeCalculability/)[1].replace(/\}\s*$/, '');
const context = vm.createContext({
  normalizeCode: value => String(value ?? '').toLowerCase().replace(/[\s-]+/g, '_'),
  text: (value, fallback = '') => value == null ? fallback : String(value),
});
const status = vm.runInContext(`(function(value){${functionBody}})`, context);
for (const code of ['official_local_pending', 'official_local_rule', 'official_local_not_complete', 'official_local_requires_review', 'conditional_pending_complete_junin_profile', 'official_requires_municipal_adoption_check']) {
  test(`${code} is never promoted to a verified municipal profile`, () => {
    assert.equal(status(code).key, 'partial');
    assert.equal(status(code).className, 'is-partial');
  });
}
for (const code of ['official_current_reference', 'official_current_consolidation', 'official_amendment', 'verified']) {
  test(`the existing verified source status ${code} is preserved`, () => assert.equal(status(code).key, 'ready'));
}
for (const code of ['missing', 'not_calculable', 'conflict']) {
  test(`${code} remains blocked`, () => assert.equal(status(code).key, 'blocked'));
}
test('optional island invalidates stale loads and leaves existing forms and legacy directory intact', () => {
  assert.match(html, /revision !== leaveRulesRevision \|\| redirecting/);
  assert.match(html, /function showGlobalLoading\(message\) \{\s*leaveRulesRevision \+= 1/);
  assert.match(html, /function showGlobalError\(error\)[\s\S]*?releaseLeaveRules\(\)/);
  assert.match(html, /redirecting = true;\s*releaseLeaveRules\(\)/);
  assert.match(html, /id="leaveRulesRoot" hidden/);
  assert.match(html, /id="leaveRulesLegacy"/);
  assert.match(html, /id="previewForm"/);
  assert.match(html, /id="mappingTableBody"/);
  const sources = ['LeaveRulesBrowser.jsx', 'leave-rules-entry.jsx', 'leave-rules-model.js'].map(file => fs.readFileSync(new URL('../src/islands/' + file, import.meta.url), 'utf8')).join('\n');
  assert.doesNotMatch(sources, /\bfetch\s*\(|localStorage|sessionStorage|dangerouslySetInnerHTML|\.innerHTML\s*=/);
});
