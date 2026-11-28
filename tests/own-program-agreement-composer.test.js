import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composeAgreement} from '../assets/own-program-agreement-composer.js';
import {normalizeRowEmissionPolicies, rowEmissionPolicyKey} from '../assets/own-payroll-row-emission.js';
import {normalizeSourceCoveragePolicies, sourceCoverageInventorySha256} from '../assets/own-payroll-source-coverage.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {policySha256} from '../assets/own-payroll-policy-validity.js';
import {salaryItems} from '../assets/native-salary-catalog-model.js';
import {evaluatePayrollExpression} from '../assets/own-payroll-expression.js';
import {decimal} from '../assets/own-payroll-exact.js';
import {emissionSources} from './fixtures/own-payroll-row-emission-synthetic.js';
import {syntheticDefinition, schoolDecisions, literal} from './fixtures/own-program-agreement-composer-synthetic.js';

const options = patch => ({source: '1', target: '6', period: '2026-10', ...patch});
const overrides = target => JSON.parse(readFileSync(new URL(`../data/agreement-overrides/${target}-2026-10.json`, import.meta.url), 'utf8'));
const compose = (p = syntheticDefinition(), patch) => composeAgreement(p, options(patch));
const fails = (fn, code, check = () => true) => assert.throws(fn, e => e.code === code && check(e), code);
const targetRows = (p, name, target = '6') => p[name].filter(r => r.agreementCode === target);
function freeze(v) { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }

test('clones every requested collection, preserves version keys and reports exact counts', () => {
  const original = syntheticDefinition(), {definition, report} = compose(original);
  for (const [name, count] of Object.entries(report.counts)) {
    assert.equal(count.after, count.before + count.added - count.removed, name);
    if (name === 'periodParticipation.treatments') continue;
    assert.equal(count.before, original[name].length, name);
    assert.equal(count.cloned, original[name].length, name);
    assert.equal(definition[name].length, count.after);
  }
  assert.equal(report.counts.rules.cloned, 8);
  assert.equal(report.counts.bindings.cloned, 5);
  assert.equal(report.counts.bindings.removed, 1);
  assert.equal(report.counts.bindings.after, 9);
  assert.equal(definition.namespaceVersion, original.namespaceVersion);
  assert.equal(report.renamedPolicies.length, 7);
  assert.equal(report.complete, true);
});

test('frozen inputs remain byte-identical; output has no aliases to the inputs', () => {
  const p = freeze(syntheticDefinition({school: true})), o = freeze(options({overrides: overrides('6'), coverageDecisions: schoolDecisions()}));
  const before = JSON.stringify(p), beforeOptions = JSON.stringify(o), result = composeAgreement(p, o);
  assert.equal(JSON.stringify(p), before); assert.equal(JSON.stringify(o), beforeOptions);
  result.definition.rules[0].expression.value = '999';
  assert.equal(JSON.stringify(p), before);
});

test('agreement 1 retains identical serialized bytes in every array and participation', () => {
  const p = syntheticDefinition({school: true}), result = compose(p, {overrides: overrides('6'), coverageDecisions: schoolDecisions()});
  for (const [name, rows] of Object.entries(p)) if (Array.isArray(rows)) {
    assert.equal(JSON.stringify(rows.filter(r => r.agreementCode === '1')), JSON.stringify(result.definition[name].filter(r => r.agreementCode === '1')), name);
  }
  assert.equal(JSON.stringify(p.periodParticipation.treatments), JSON.stringify(result.definition.periodParticipation.treatments.filter(t => t.ruleKey.startsWith('1:'))));
});

test('validity is inclusive, skips past/future entries, preserves unbounded and absent validity', () => {
  const p = syntheticDefinition();
  p.rules.push(...[
    {code: '901', validFrom: '2026-09', validUntil: '2026-09'}, {code: '902', validFrom: '2026-11', validUntil: null},
    {code: '903', validFrom: '2026-09', validUntil: null}, {code: '904', validFrom: '2026-09', validUntil: '2026-11'},
  ].map(patch => ({...structuredClone(p.rules[0]), ...patch})));
  p.monthlyDeclaredAdjustmentPolicies.push({agreementCode: '1', policyId: 'without.period', supersedes: null});
  p.officialTotalsPolicies.push({agreementCode: '1', period: '2026-09'});
  const coverage = p.sourceCoveragePolicies[0];
  for (const code of ['903', '904']) coverage.inventory.push({code, kind: 'rule', sourceRowSha256: 'a'.repeat(64)});
  coverage.expectedSourceRows = coverage.inventory.length; coverage.inventorySha256 = sourceCoverageInventorySha256(coverage.inventory);
  const result = compose(p).definition, codes = targetRows(result, 'rules').map(r => r.code);
  assert.ok(!codes.includes('901') && !codes.includes('902') && codes.includes('903') && codes.includes('904'));
  assert.equal(targetRows(result, 'rules').find(r => r.code === '904').validFrom, '2026-09');
  assert.equal(targetRows(result, 'officialTotalsPolicies').length, 1);
  assert.equal(targetRows(result, 'monthlyDeclaredAdjustmentPolicies').length, 2);
});

test('renames prefix and suffix policy identities and explicit source agreement', () => {
  const p = syntheticDefinition();
  p.familyTariffPolicies[0].policyId = 'shared.tariff';
  p.bindings[0].sourceAgreementCode = '1';
  const {definition, report} = compose(p);
  assert.equal(targetRows(definition, 'familyTariffPolicies')[0].policyId, 'shared.tariff.c6');
  assert.equal(targetRows(definition, 'conditionalSourcePolicies')[0].policyId, 'c6.synthetic.conditional');
  assert.equal(targetRows(definition, 'bindings')[0].sourceAgreementCode, '6');
  assert.ok(report.renamedPolicies.some(p => p.from === 'shared.tariff' && p.to === 'shared.tariff.c6'));
});

test('copies only the exact source and period participation rule keys', () => {
  const p = syntheticDefinition();
  p.periodParticipation.treatments.push({ruleKey: '11:concept:44:2026-10:monthly', treatment: 'none'});
  const {definition, report} = compose(p);
  assert.equal(report.counts['periodParticipation.treatments'].added, 1);
  assert.equal(definition.periodParticipation.treatments.at(-1).ruleKey, '6:concept:44:2026-10:monthly');
});

test('prunes only destination inputs and retains phase, match and policy consumers', () => {
  const p = syntheticDefinition(); p.salaryConditionsVersion = 'own-salary-conditions.v1';
  p.bindings.push({...p.bindings[0], key: 'flag', unit: 'boolean'});
  p.rules[0].expression = {op: 'choose', condition: {op: 'match', key: 'flag', type: 'boolean', operator: 'eq', value: true}, then: literal(), else: literal('0')};
  const {definition, report} = compose(p), keys = targetRows(definition, 'bindings').map(b => b.key);
  assert.deepEqual(report.removedBindings, [{agreementCode: '6', key: 'unused'}]);
  for (const key of ['phaseOnly', 'policyOnly', 'flag']) assert.ok(keys.includes(key));
  assert.ok(definition.bindings.some(b => b.agreementCode === '1' && b.key === 'unused'));
});

test('implicit fraction participation retains its declared period inputs', () => {
  const p = syntheticDefinition(); p.periodParticipation.treatments[0].treatment = 'fraction';
  p.bindings.push({...p.bindings[0], key: 'periodUnits', sourceKind: 'period_fact', sourceField: 'recognizedUnits'});
  assert.ok(targetRows(compose(p).definition, 'bindings').some(b => b.key === 'periodUnits'));
});

test('upgrades emission to v2 using destination stages, explicit domains and original evidence', () => {
  const p = syntheticDefinition(), {definition, report} = compose(p), policies = targetRows(definition, 'rowEmissionPolicies');
  assert.equal(definition.rowEmissionVersion, 'own-payroll-row-emission.v2');
  assert.equal(report.generatedPolicies.length, 2); assert.equal(report.versionChanges.length, 1);
  for (const row of policies) {
    assert.equal(row.policyId, `c6.oct2026.row-emission.${row.conceptCode}`);
    assert.equal(row.validFrom, '2026-10'); assert.equal(row.validUntil, '2026-10'); assert.equal(row.supersedes, null);
    assert.equal(row.sourceSha256, p.rowEmissionPolicies[0].sourceSha256);
    assert.equal(row.sourceReference, p.rowEmissionPolicies[0].sourceReference);
    assert.deepEqual(row.conditions.map(c => c.valueDomain), ['nonnegative', 'nonnegative']);
    assert.equal(row.conditions[1].stage, row.conceptCode === '302' ? 'rounded' : 'exact');
    assert.equal(row.conditions[0].stage, 'exact');
  }
  assert.equal(normalizeRowEmissionPolicies(definition.rowEmissionPolicies, definition.rowEmissionVersion).length, 4);
});

test('emission uses the engine byte ordering across agreements, months and concepts', () => {
  const {definition} = compose(syntheticDefinition(), {target: '10'});
  const keys = definition.rowEmissionPolicies.map(rowEmissionPolicyKey);
  assert.deepEqual(keys, [...keys].sort());
});

test('existing v2 emission is cloned and renamed without losing conditions or stage', () => {
  const p = syntheticDefinition(), converted = compose(p).definition;
  p.rowEmissionVersion = converted.rowEmissionVersion;
  p.rowEmissionPolicies = targetRows(converted, 'rowEmissionPolicies').map(r => ({...r, agreementCode: '1', policyId: r.policyId.replace('c6.', 'c1.')}));
  const result = compose(p);
  assert.equal(result.report.generatedPolicies.length, 0);
  assert.equal(result.report.versionChanges.length, 0);
  assert.deepEqual(targetRows(result.definition, 'rowEmissionPolicies')[0].conditions, p.rowEmissionPolicies[0].conditions);
});

for (const mode of ['missing', 'duplicate', 'unit']) test(`emission rejects ${mode} quantity phase`, () => {
  const p = syntheticDefinition();
  if (mode === 'missing') p.quantityPhases.shift();
  if (mode === 'duplicate') p.quantityPhases.push(structuredClone(p.quantityPhases[0]));
  if (mode === 'unit') p.quantityPhases[0].unit = 'hours';
  fails(() => compose(p), 'COMPOSER_ROW_EMISSION_PHASE_REQUIRED');
});

test('coverage without a decision lists both school rows and target policy identity', () => {
  const p = syntheticDefinition({school: true}), before = JSON.stringify(p);
  fails(() => compose(p), 'COMPOSER_COVERAGE_DECISION_REQUIRED', e =>
    e.message.includes('311, 312') && e.details.rows.every(r => r.policyId === 'c6.synthetic.coverage') && e.details.rows.length === 2);
  assert.equal(JSON.stringify(p), before);
});

test('coverage requires a separate explicit decision for every school row', () => {
  fails(() => compose(syntheticDefinition({school: true}), {coverageDecisions: schoolDecisions().slice(0, 1)}),
    'COMPOSER_COVERAGE_DECISION_REQUIRED', e => e.details.rows.length === 1 && e.details.rows[0].code === '312');
});

test('explicit coverage dispositions pass the real policy validator without changing source evidence', () => {
  const p = syntheticDefinition({school: true}), {definition, report} = compose(p, {coverageDecisions: schoolDecisions()});
  const policy = targetRows(definition, 'sourceCoveragePolicies')[0];
  assert.equal(normalizeSourceCoveragePolicies([policy]).length, 1);
  assert.equal(policy.inventorySha256, p.sourceCoveragePolicies[0].inventorySha256);
  assert.equal(report.coverageDecisions.length, 2);
  assert.ok(policy.inventory.filter(r => ['311', '312'].includes(r.code)).every(r => r.basis.kind === 'documented_retirement'));
});

test('unsupported replacement basis is rejected by the real coverage validator', () => {
  const decisions = schoolDecisions(); decisions[0].disposition.basis = {kind: 'invented'};
  fails(() => compose(syntheticDefinition({school: true}), {coverageDecisions: decisions}), 'COMPOSER_COVERAGE_INVALID');
});

test('the school exclusion is kept only for agreements with the same GRH condition (L101 = 2): 6 yes, 5 no', () => {
  const p6 = syntheticDefinition({school: true}), d6 = schoolDecisions();
  d6[0].disposition.basis = p6.sourceCoveragePolicies[0].inventory.find(r => r.code === '311').basis;
  assert.doesNotThrow(() => compose(p6, {coverageDecisions: d6}));
  const p5 = syntheticDefinition({school: true}), d5 = schoolDecisions('5');
  d5[0].disposition.basis = p5.sourceCoveragePolicies[0].inventory.find(r => r.code === '311').basis;
  fails(() => compose(p5, {target: '5', coverageDecisions: d5}), 'COMPOSER_COVERAGE_INVALID');
});

test('a coverage decision cannot invent a payable school rule that the destination lacks', () => {
  const decisions = schoolDecisions(); decisions[0].disposition = {kind: 'rule'};
  fails(() => compose(syntheticDefinition({school: true}), {coverageDecisions: decisions}), 'COMPOSER_COVERAGE_INVALID', e => e.details.cause === 'SOURCE_COVERAGE_RULE_REQUIRED');
});

test('unused and duplicate coverage decisions fail instead of being ignored', () => {
  fails(() => compose(syntheticDefinition(), {coverageDecisions: schoolDecisions()}), 'COMPOSER_COVERAGE_DECISION_UNUSED');
  fails(() => compose(syntheticDefinition({school: true}), {coverageDecisions: [...schoolDecisions(), schoolDecisions()[0]]}), 'COMPOSER_COVERAGE_DECISIONS_INVALID');
});

test('C6 file wraps only the original 44 sum and changes the 670 source from amount to quantity', () => {
  const p = syntheticDefinition(), {definition, report} = compose(p, {overrides: overrides('6')}), rules = targetRows(definition, 'rules');
  const sum = rules.find(r => r.code === '44').expression.left;
  assert.deepEqual(sum, {op: 'add', left: p.rules.find(r => r.code === '44').expression.left, right: {op: 'concept', code: '59', stage: 'exact'}});
  assert.equal(rules.find(r => r.code === '670').expression.key, 'grh_N_670');
  assert.equal(targetRows(definition, 'bindings').find(b => b.key === 'grh_N_670').sourceKind, 'monthly_quantity');
  assert.ok(report.removedBindings.some(b => b.key === 'amount670'));
  assert.equal(report.appliedOverrides.length, 2); assert.equal(report.addedBindings.length, 1);
  assert.ok(report.appliedOverrides.every(o => o.reference === 'GRH codliq 28/10, convenio 6'));
  assert.doesNotMatch(JSON.stringify(report), /"expression"\s*:|"sourceSha256"\s*:/);
});

test('C4 file applies known changes, selects I649 and explicitly reports unresolved 48 and 670', () => {
  const {definition, report} = compose(syntheticDefinition(), {target: '4', overrides: overrides('4')});
  assert.equal(report.complete, false); assert.equal(report.appliedOverrides.length, 2);
  assert.deepEqual(report.unresolvedOverrides.map(r => r.code), ['48', '670']);
  assert.equal(targetRows(definition, 'rules', '4').find(r => r.code === '670').expression.key, 'amount670');
});

test('C4 uses I649 as the whole expression, not just an input inside another formula', () => {
  const p = syntheticDefinition(), original = p.rules.find(r => r.code === '649');
  original.expression = {op: 'multiply', left: original.expression, right: literal('2', 'coefficient')};
  const {definition} = compose(p, {target: '4', overrides: overrides('4')});
  assert.deepEqual(targetRows(definition, 'rules', '4').find(r => r.code === '649').expression, original.expression.left);
  assert.equal(original.expression.op, 'multiply');
});

test('engine evaluation distinguishes C6 added concept and quantity channel from the original amounts', () => {
  const p = syntheticDefinition(), result = compose(p, {overrides: overrides('6')});
  const value = expression => evaluatePayrollExpression(expression, {consume() {}, trace: [], referenceName: n => n.code,
    reference: () => ({exact: decimal('3'), value: decimal('3')}),
    inputs: new Map([['amount670', {unit: 'money', value: '2'}], ['grh_N_670', {unit: 'money', value: '7'}]])});
  for (const [code, before, after] of [['44', 5n, 8n], ['670', 2n, 7n]]) {
    assert.equal(value(p.rules.find(r => r.code === code).expression).n, before);
    assert.equal(value(targetRows(result.definition, 'rules').find(r => r.code === code).expression).n, after);
  }
});

test('override rule missing or ambiguous fails with its identifier and count', () => {
  for (const count of [0, 2]) {
    const p = syntheticDefinition(); p.rules = p.rules.filter(r => r.code !== '44');
    for (let i = 0; i < count; i++) p.rules.push(structuredClone(syntheticDefinition().rules[1]));
    fails(() => compose(p, {overrides: overrides('6')}), 'COMPOSER_OVERRIDE_RULE_NOT_UNIQUE', e => e.details.matches === count);
  }
});

test('override node missing or ambiguous fails without changing any input', () => {
  for (const expression of [literal(), {op: 'multiply', left: {op: 'add', left: literal(), right: literal()}, right: {op: 'add', left: literal(), right: literal()}}]) {
    const p = syntheticDefinition(); p.rules[1].expression = expression; const before = JSON.stringify(p);
    fails(() => compose(p, {overrides: overrides('6')}), 'COMPOSER_OVERRIDE_NODE_NOT_UNIQUE');
    assert.equal(JSON.stringify(p), before);
  }
});

test('nested sums select their one outermost node without counting its children twice', () => {
  const p = syntheticDefinition(); p.rules[1].expression.left.left = {op: 'add', left: literal(), right: literal()};
  assert.equal(compose(p, {overrides: overrides('6')}).report.appliedOverrides[0].path, 'expression.left');
});

test('an override cannot invent a missing concept dependency', () => {
  const p = syntheticDefinition(); p.rules = p.rules.filter(r => r.code !== '59');
  fails(() => compose(p, {overrides: overrides('6')}), 'COMPOSER_REFERENCE_MISSING');
});

test('override inputs require declared binding, unit and supported expression nodes', () => {
  const missing = overrides('6'); delete missing.changes[1].bindingPatch;
  missing.changes[1].action = 'replace'; missing.changes[1].value = {op: 'input', unit: 'money', key: 'missing'};
  fails(() => compose(syntheticDefinition(), {overrides: missing}), 'COMPOSER_BINDING_MISSING');
  const unit = overrides('6'); delete unit.changes[1].bindingPatch;
  unit.changes[1].action = 'replace'; unit.changes[1].value = {op: 'input', unit: 'units', key: 'amount649'};
  fails(() => compose(syntheticDefinition(), {overrides: unit}), 'COMPOSER_BINDING_UNIT_MISMATCH');
  const unsupported = overrides('6'); unsupported.changes[0].value = {op: 'evaluate', text: 'opaque'};
  fails(() => compose(syntheticDefinition(), {overrides: unsupported}), 'COMPOSER_OVERRIDE_EXPRESSION_INVALID');
});

test('C6 quantity rebind preserves declared missing-value and combination behavior', () => {
  const p = syntheticDefinition(), original = p.bindings.find(b => b.key === 'amount670');
  original.onMissing = 'error'; original.combine = 'single';
  const replacement = targetRows(compose(p, {overrides: overrides('6')}).definition, 'bindings').find(b => b.key === 'grh_N_670');
  assert.equal(replacement.onMissing, 'error'); assert.equal(replacement.combine, 'single');
});

test('C6 rebind preserves other consumers of the original amount input', () => {
  const p = syntheticDefinition(); p.rules.find(r => r.code === '649').expression.key = 'amount670';
  const result = compose(p, {overrides: overrides('6')});
  assert.ok(targetRows(result.definition, 'bindings').some(b => b.key === 'amount670'));
  assert.equal(targetRows(result.definition, 'rules').find(r => r.code === '649').expression.key, 'amount670');
});

test('an override file cannot silently run for another period or agreement', () => {
  fails(() => compose(syntheticDefinition(), {overrides: overrides('4')}), 'COMPOSER_OVERRIDES_SCOPE_INVALID');
});

test('idempotence rejects the same destination on the second composition', () => {
  const result = compose(); fails(() => compose(result.definition), 'COMPOSER_TARGET_EXISTS');
});

test('destination existing in a binding or participation alone also blocks composition', () => {
  const p = syntheticDefinition(); p.bindings.push({...p.bindings[0], agreementCode: '6'});
  fails(() => compose(p), 'COMPOSER_TARGET_EXISTS');
  const q = syntheticDefinition(); q.periodParticipation.treatments.push({ruleKey: '6:concept:44:2026-09:monthly'});
  fails(() => compose(q), 'COMPOSER_TARGET_EXISTS');
});

test('invalid scope, missing source and unknown agreement collections fail closed', () => {
  fails(() => compose(syntheticDefinition(), {target: '1'}), 'COMPOSER_SCOPE_INVALID');
  fails(() => compose(syntheticDefinition(), {period: '2026-13'}), 'COMPOSER_SCOPE_INVALID');
  fails(() => compose(syntheticDefinition(), {source: '3'}), 'COMPOSER_SOURCE_MISSING');
  const p = syntheticDefinition(); p.futurePolicies = [{agreementCode: '1'}];
  fails(() => compose(p), 'COMPOSER_COLLECTION_UNSUPPORTED');
});

test('an explicit null collection is invalid rather than an absent optional family', () => {
  const p = syntheticDefinition(); p.quantityPhases = null;
  fails(() => compose(p), 'COMPOSER_COLLECTION_INVALID');
});

test('invalid and contradictory validity are never treated as unbounded', () => {
  for (const patch of [{validFrom: '2026-13'}, {validFrom: '2026-11', validUntil: '2026-10'}, {period: '2026-10'}]) {
    const p = syntheticDefinition(); Object.assign(p.rules[0], patch);
    fails(() => compose(p), 'COMPOSER_VALIDITY_INVALID');
  }
});

test('renamed policy collisions fail', () => {
  const p = syntheticDefinition(); p.familyTariffPolicies.push({...p.familyTariffPolicies[0], agreementCode: '2', policyId: 'c6.synthetic.tariff'});
  fails(() => compose(p), 'COMPOSER_POLICY_ID_COLLISION');
});

test('policy succession rebases identity and digest only to a copied predecessor', () => {
  const p = syntheticDefinition(), predecessor = p.familyTariffPolicies[0];
  p.familyTariffPolicies.push({...predecessor, policyId: 'c1.synthetic.successor', supersedes: {policyId: predecessor.policyId, policySha256: policySha256(predecessor)}});
  const [first, second] = targetRows(compose(p).definition, 'familyTariffPolicies');
  assert.deepEqual(second.supersedes, {policyId: first.policyId, policySha256: policySha256(first)});
});

test('a predecessor outside the copied period requires an explicit succession decision', () => {
  const p = syntheticDefinition(); p.familyTariffPolicies[0].supersedes = {policyId: 'c1.previous', policySha256: 'b'.repeat(64)};
  fails(() => compose(p), 'COMPOSER_POLICY_PREDECESSOR_MISSING');
});

test('unordered original emission is rejected instead of changing source agreement bytes', () => {
  const p = syntheticDefinition(); p.rowEmissionPolicies.reverse();
  fails(() => compose(p), 'COMPOSER_SOURCE_ORDER_INVALID');
});

test('existing real JS program validator accepts a fully synthetic composed emission program', () => {
  const source = emissionSources(), original = source.programState.program.definition;
  const {definition} = compose(original);
  const catalog = source.programState.salaryCatalog.items;
  const extended = salaryItems([...catalog, ...catalog.filter(r => r.agreementCode === '1').map(r => ({...r, agreementCode: '6'}))]);
  const normalized = ownProgramDefinition(definition, extended);
  assert.equal(normalized.rules.length, original.rules.length * 2);
  assert.equal(normalized.rowEmissionPolicies.length, 4);
});

test('real JS program validator accepts both C6 formula differences with a synthetic catalog', () => {
  const p = syntheticDefinition(), raw = {namespaceVersion: p.namespaceVersion, totalsPrecision: 2,
    rules: p.rules.filter(r => ['44', '59', '649', '670'].includes(r.code)), bindings: p.bindings.slice(0, 2)};
  const catalog = salaryItems(raw.rules.map(r => ({active: true, agreementCode: '1', categoryCode: null, code: r.code,
    dependencies: [], kind: 'concept', label: 'Invented composer validation concept', nature: r.nature, precision: 2,
    ruleReference: 'Invented composer QA only', unit: r.unit, validFrom: r.validFrom, validUntil: r.validUntil, value: null})));
  ownProgramDefinition(raw, catalog);
  const {definition} = compose(raw, {overrides: overrides('6')});
  const extended = salaryItems([...catalog, ...catalog.map(r => ({...r, agreementCode: '6'}))]);
  assert.equal(ownProgramDefinition(definition, extended).rules.length, 8);
});

test('composer has no DOM, runtime network or executable-expression API', () => {
  const code = readFileSync(new URL('../assets/own-program-agreement-composer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /\b(?:document|window|fetch|XMLHttpRequest|WebSocket|eval|Function)\s*[.(]|node:|https?:\/\//);
});
