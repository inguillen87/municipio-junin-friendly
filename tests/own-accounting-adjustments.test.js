// Pruebas del candidato de Root `ACCOUNTING_ADJUSTMENTS_CANDIDATE_20261112`, con los imports de este repositorio.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { cents, money, decomposeOfficialAccountingEmployee, TOTAL_KEYS, COMPONENT_KINDS } from '../assets/own-accounting-adjustments.js';
import { deriveAccountingAdjustmentCandidate } from '../assets/own-accounting-adjustments.js';
import { officialCloseCorpus, officialCloseDetail, officialCloseReceipt, hash } from './fixtures/own-payroll-official-close-synthetic.js';
import { buildOwnOfficialCloseSnapshot } from '../assets/own-payroll-official-snapshot-model.js';
const legacyReceipts = JSON.parse(readFileSync(new URL('./fixtures/legacy-close-receipts-synthetic.json', import.meta.url), 'utf8')).cases;
import { decimal, exactAdd, exactSubtract, exactEvidence, quantize } from '../assets/own-payroll-exact.js';

const clone = structuredClone;
const receipt = name => officialCloseReceipt(buildOwnOfficialCloseSnapshot(officialCloseDetail(name), { kind: 'all', values: [] }));
const h = data => createHash('sha256').update(data).digest('hex');

test('the portable corpus matches the pinned native V5 corpus', () => {
  const data = readFileSync(new URL('./fixtures/own-payroll-official-close-corpus.json', import.meta.url));
  assert.equal(h(data), 'ca9b631719631fe974ed1469bcfb62919cdc75a2b893fd9b0eb0c8208463746d');
});

for (const fixture of officialCloseCorpus) test(fixture.name + ': immutable original receipt reconstructs every official total', async () => {
  const original = receipt(fixture.name), before = JSON.stringify(original), p = await deriveAccountingAdjustmentCandidate(original);
  assert.equal(JSON.stringify(original), before);
  assert.equal(p.source.snapshotVersion, fixture.input.version.replace('payroll-input', 'close-snapshot'));
  assert.equal(p.employees.length, fixture.input.employees.length);
  assert.equal(p.allComponents.length, fixture.input.employees.length * COMPONENT_KINDS.length);
  assert.equal(new Set(p.allComponents.map(x => x.key)).size, p.allComponents.length);
  assert.ok(p.adjustments.every(a => a.amount !== '0.00' && a.isPayrollConcept === false));
  assert.ok(p.adjustments.every(a => a.budgetItemReference === null && a.accountingAccountReference === null && a.documentReference === null));
  for (const key of TOTAL_KEYS) assert.equal(cents(p.lineTotals[key]) + cents(p.totalEffects[key]), cents(p.officialTotals[key]));
  assert.equal(p.ready, false); assert.equal(p.productionIntegrationEnabled, false);
  assert.equal(p.accountingPosted, false); assert.equal(p.paymentExecuted, false);
  assert.equal(p.aggregateFieldsAreAdditionalPostings, false);
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.adjustments) && Object.isFrozen(p.employees[0].components));
  const { projectionSha256, ...body } = p; assert.equal(hash(body), projectionSha256);
});

test('37 employees retain 37 separate cent differences before aggregation', async () => {
  const p = await deriveAccountingAdjustmentCandidate(receipt('full_population37'));
  assert.equal(p.adjustments.length, 37);
  assert.ok(p.adjustments.every(a => a.kind === 'category.remuneration' && a.amount === '-0.01'));
  assert.equal(p.totalEffects.net, '-0.37');
});

test('tampering a receipt without rehashing is rejected', async () => {
  const r = receipt('days14_both_omitted'); r.snapshot.netDifferenceFromLines = '0.00';
  await assert.rejects(deriveAccountingAdjustmentCandidate(r));
});

test('rehashing does not make a false reconciliation valid', async () => {
  const r = receipt('days14_both_omitted');
  r.snapshot.employees[0].totalReconciliation.categoryDifferences.remuneration = '0.00';
  r.snapshotSha256 = hash(r.snapshot);
  await assert.rejects(deriveAccountingAdjustmentCandidate(r));
});

test('rehashing does not authorize switching the captured total source', async () => {
  const r = receipt('days14_both_omitted');
  r.snapshot.employees[0].totalReconciliation.sourceTotals['993'] = '800000995';
  r.snapshotSha256 = hash(r.snapshot);
  await assert.rejects(deriveAccountingAdjustmentCandidate(r));
});

test('removing an economic row and rehashing is rejected', async () => {
  const r = receipt('days14_both_omitted'); r.snapshot.concepts.pop();
  r.snapshot.conceptCount--; r.snapshotSha256 = hash(r.snapshot);
  await assert.rejects(deriveAccountingAdjustmentCandidate(r));
});

for (const historical of legacyReceipts) test(historical.snapshot.version + ': historical data stays on its original reader without retroactive adjustments', async () => {
  const r = clone(historical), before = JSON.stringify(r);
  const p = await deriveAccountingAdjustmentCandidate(r);
  assert.equal(JSON.stringify(r), before);
  assert.equal(p.route, 'retain_original_legacy_reader');
  assert.equal(p.source.snapshotVersion, r.snapshot.version);
  assert.deepEqual(p.adjustments, []); assert.equal(p.ready, false);
});

// Mathematical counterexamples are synthetic unit inputs, not municipal data
// and not substitutes for the complete native-corpus adapter tests above.
function mathFixture({ source = {}, printed = {} } = {}) {
  const contractId = '70000000-0000-4000-8000-000000000001';
  const v = Object.fromEntries(Object.entries({ '990': '2.005', '993': '100.005', '994': '0.005', '995': '0', '996': '0.005', '888': '0', ...source }).map(([k, v]) => [k, decimal(v)]));
  const exactGross = exactAdd(exactAdd(v['993'], v['994']), v['995']), exactNet = exactSubtract(exactAdd(exactGross, v['888']), v['996']);
  v['998'] = exactNet; v['999'] = exactNet;
  const round = x => quantize(x, { precision: 2, mode: 'half_up' }).amount;
  const categoryLineAmounts = Object.fromEntries(['990', '993', '994', '995', '996'].map(k => [k, printed[k] ?? round(v[k])]));
  const line = { remuneration: cents(categoryLineAmounts['993']), non_remuneration: cents(categoryLineAmounts['994']) + cents(categoryLineAmounts['995']), deduction: cents(categoryLineAmounts['996']), employer_contribution: cents(categoryLineAmounts['990']) };
  line.gross = line.remuneration + line.non_remuneration; line.net = line.gross - line.deduction;
  const lineTotals = { contractId, ...Object.fromEntries(TOTAL_KEYS.map(k => [k, money(line[k])])) };
  const officialTotals = { contractId, remuneration: round(v['993']), non_remuneration: round(exactAdd(v['994'], v['995'])), deduction: round(v['996']), employer_contribution: round(v['990']), gross: round(exactGross), net: round(exactNet) };
  const names = { '990': 'employer_contribution', '993': 'remuneration', '994': 'non_subject', '995': 'family_allowances', '996': 'deduction' };
  const adjustment = cents(round(v['888'])), delta = cents(officialTotals.net) - line.net;
  const reconciliation = {
    contractId, exactComponents: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, exactEvidence(x)])),
    originalLineTotals: clone(lineTotals), officialTotals: clone(officialTotals),
    categoryDifferences: Object.fromEntries(Object.entries(names).map(([code, key]) => [key, money(cents(round(v[code])) - cents(categoryLineAmounts[code]))])),
    netAdjustmentOutsideGross: money(adjustment), netDifferenceFromLines: money(delta), roundingDifferenceFromLines: money(delta - adjustment),
    displayedEquationRounding: money(cents(officialTotals.net) - cents(officialTotals.gross) - adjustment + cents(officialTotals.deduction))
  };
  return { contractId, lineTotals, officialTotals, reconciliation, categoryLineAmounts };
}
const component = (p, kind) => p.components.find(x => x.kind === kind);

test('gross consolidation and net equation are separate signed residuals', () => {
  const p = decomposeOfficialAccountingEmployee(mathFixture());
  assert.equal(component(p, 'consolidation.gross').amount, '-0.01');
  assert.equal(component(p, 'consolidation.net_equation').amount, '0.01');
  assert.equal(p.totalEffects.net, '0.00');
  assert.equal(p.components.filter(x => x.postingRequired).length, 2);
});

test('rounding 994+995 together is not the sum of separately rounded categories', () => {
  const p = decomposeOfficialAccountingEmployee(mathFixture({ source: { '993': '100', '994': '0.005', '995': '0.005', '996': '0', '990': '0' } }));
  assert.equal(component(p, 'consolidation.non_remuneration').amount, '-0.01');
  assert.equal(p.totalEffects.non_remuneration, '-0.01');
  assert.equal(p.totalEffects.net, '-0.01');
});

test('outside-gross 888 is retained once, without posting aggregate net difference again', () => {
  const p = decomposeOfficialAccountingEmployee(mathFixture({ source: { '888': '1.005' }, printed: { '993': '100.02' } }));
  assert.equal(component(p, 'adjustment.net_outside_gross').amount, '1.01');
  assert.equal(p.components.length, 9);
  assert.equal(p.diagnostics.aggregateFieldsAreAdditionalPostings, false);
  assert.equal(p.components.reduce((s, c) => s + cents(c.totalEffects.net), 0n), cents(p.diagnostics.netDifferenceFromLines));
});

test('employer contribution is reconstructed independently and never changes employee net', () => {
  const p = decomposeOfficialAccountingEmployee(mathFixture({ printed: { '990': '2.02' } }));
  const e = component(p, 'category.employer_contribution');
  assert.equal(e.amount, '-0.01'); assert.equal(e.totalEffects.employer_contribution, '-0.01'); assert.equal(e.totalEffects.net, '0.00');
});

test('negative 888 keeps its sign and does not imply a debit/credit choice', () => {
  const p = decomposeOfficialAccountingEmployee(mathFixture({ source: { '888': '-1.005' } }));
  const e = component(p, 'adjustment.net_outside_gross'); assert.equal(e.amount, '-1.01');
  assert.equal(e.totalEffects.net, '-1.01'); assert.ok(!('side' in e));
});

test('aggregate cent comparisons cannot hide two opposite components', () => {
  const p = decomposeOfficialAccountingEmployee(mathFixture());
  assert.equal(p.totalEffects.net, '0.00');
  assert.equal(p.components.filter(c => c.postingRequired).length, 2);
  assert.equal(p.ready, false);
});

test('reconciliation, exact fraction and identity tampering fail at the arithmetic boundary', () => {
  for (const mutate of [
    f => { f.reconciliation.roundingDifferenceFromLines = '99.00'; },
    f => { f.reconciliation.exactComponents['993'].denominator = '0'; },
    f => { f.reconciliation.exactComponents['999'].numerator = '1'; },
    f => { f.categoryLineAmounts['993'] = '1.00'; },
    f => { f.officialTotals.net = '100.00'; },
    f => { f.reconciliation.contractId = '70000000-0000-4000-8000-000000000099'; }
  ]) { const f = mathFixture(); mutate(f); assert.throws(() => decomposeOfficialAccountingEmployee(f)); }
});

test('noncanonical or fractional cents are not silently rounded', () => {
  for (const value of ['1.005', '1.2', '1e2', '-0.00', '00.01', 1.2, null]) assert.throws(() => cents(value));
  assert.equal(cents('-0.01'), -1n); assert.equal(money(-1n), '-0.01');
});
