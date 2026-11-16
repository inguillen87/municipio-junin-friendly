// The loading aid knows the concept GRH liquidates in the special November run (backup 09/11/2026). Codes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {conceptInfo, searchConcepts, conceptLabel, GRH_CONCEPTS} from '../assets/grh-concept-dictionary.js';

test('260 is known by code and by name, as an automatic non-remunerative concept', () => {
  const c = conceptInfo('260');
  assert.deepEqual({...c}, {code:'260', label:'PREM. DIA MUNIC.2026', group:'no_remunerativo', novelty:false, uses:0});
  assert.equal(conceptInfo('0260')?.code, '260');
  assert.equal(searchConcepts('260')[0].code, '260');
  assert.ok(searchConcepts('prem dia munic').some(x => x.code === '260'));
  assert.equal(conceptLabel(c), '260 · PREM. DIA MUNIC.2026 · Haber no remunerativo');
});

test('the catalog stays ordered by code and without duplicates', () => {
  const codes = GRH_CONCEPTS.map(c => Number(c.code));
  assert.deepEqual(codes, [...codes].sort((a, b) => a - b));
  assert.equal(new Set(codes).size, codes.length);
});
