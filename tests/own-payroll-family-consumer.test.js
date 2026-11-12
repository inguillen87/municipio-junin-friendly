import test from 'node:test';
import assert from 'node:assert/strict';
import { familySources, familyCapture, familyPreparerEvidence, sealFamilySources, familyKey, familyCode } from './fixtures/own-payroll-family-consumer-synthetic.js';
import { auxiliarySources, auxiliaryDocuments } from './fixtures/own-payroll-auxiliary-synthetic.js';
import { approvedSources } from './fixtures/own-payroll-approved-synthetic.js';
import { conditionSources } from './fixtures/own-payroll-conditions-synthetic.js';
import { saved } from './fixtures/own-payroll-run-synthetic.js';
import { fact, lit } from './fixtures/own-payroll-synthetic.js';
import { familyId } from './fixtures/own-contract-family-payroll-facts-synthetic.js';
import { ownProgramDefinition, ownProgramStructure, ownProgramHistory } from '../assets/own-payroll-program-model.js';
import { normalizeOwnPayrollInput } from '../assets/own-payroll-engine.js';
import { FAMILY_FACT_FIELD_UNITS, OWN_PAYROLL_FAMILY_FACTS_VERSION } from '../assets/own-payroll-family-facts.js';
import { ownRunCapture } from '../assets/own-payroll-run-model.js';
import { periodContextFields, OWN_PAYROLL_PERIOD_CONTEXT_VERSION } from '../assets/own-payroll-period-context.js';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { prepareOwnPayrollProgrammeSource } from '../lib/own-payroll-programme-source-preparation.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { verifyOwnRunReceipt, ownRunHash, runError } from '../lib/internal-own-payroll-run.js';

const prepare = s => prepareOwnPayrollInput(s);
const snapshot = s => createOwnPayrollSnapshot(prepare(s));
const inputFor = (input, field, n = 0) => input.employees[n].inputs.find(v => v.key === familyKey(field));
const rowFor = (result, field, contractId = result.rows[0].contractId) => result.rows.find(r => r.contractId === contractId && r.nature === 'auxiliary' && r.conceptCode === familyCode(field));
const codeIs = expected => e => e && e.code === expected;
const missing = e => /INPUT_MISSING$/.test(e.code);
const invalidFamily = e => /^FAMILY_PAYROLL_FACTS_/.test(e.code);
const captureInvalid = e => /CONTRACT_INVALID$|CAPTURE_INVALID$/.test(e.code);
const setField = (definition, field, value) => {
  if (field === 'tariffRegion') definition.tariffSelection.region = value;
  else if (field === 'semesterAverage') definition.tariffSelection.semesterAverage = value;
  else if (field === 'prenatalAdjustmentMonths') definition[field] = value;
  else definition.quantities[field] = value;
};

test('opt-in consumes all 15 declared fields with exact units, region spelling and approval provenance', () => {
  const s = familySources(), before = structuredClone(s), input = prepare(s), result = createOwnPayrollSnapshot(input).result;
  assert.equal(input.familyPayrollFactsVersion, OWN_PAYROLL_FAMILY_FACTS_VERSION);
  assert.equal(Object.hasOwn(input, 'salaryConditionsVersion'), false);
  assert.equal(Object.keys(FAMILY_FACT_FIELD_UNITS).length, 15);
  for (const [field, unit] of Object.entries(FAMILY_FACT_FIELD_UNITS)) {
    const value = inputFor(input, field);
    assert.equal(value.unit, unit);
    assert.ok(value.sourceReference.includes(s.familyPayrollFacts.version));
    assert.ok(value.sourceReference.includes(s.familyPayrollFacts.records[0].approvalId));
    assert.ok(value.sourceReference.includes('2026-10:' + field));
  }
  assert.equal(inputFor(input, 'tariffRegion').value, '001');
  assert.equal(inputFor(input, 'children').value, '0.00000000');
  assert.equal(inputFor(input, 'prenatalAdjustmentMonths').value, '3.00000000');
  assert.equal(inputFor(input, 'semesterAverage').value, '12.34000000');
  assert.equal(rowFor(result, 'tariffRegion').amount, '1.00000000');
  assert.equal(result.rowCount, 18);
  assert.deepEqual(result.employeeTotals, snapshot(auxiliarySources()).result.employeeTotals);
  assert.deepEqual(s, before);
});

test('source precision survives without JavaScript-number coercion and region is never numeric', () => {
  const s = familySources();
  s.familyPayrollFacts.records[0].definition.tariffSelection = { region: '1', semesterAverage: '900719925474099.99' };
  sealFamilySources(s);
  const r = snapshot(s);
  assert.equal(inputFor(r.input, 'tariffRegion').value, '1');
  assert.equal(rowFor(r.result, 'tariffRegion').amount, '0.00000000');
  assert.equal(rowFor(r.result, 'semesterAverage').amount, '900719925474099.99000000');
});

test('explicitly declared zeros are retained for every field rather than treated as missing', () => {
  const s = familySources();
  for (const field of Object.keys(FAMILY_FACT_FIELD_UNITS)) setField(s.familyPayrollFacts.records[0].definition, field, '0');
  sealFamilySources(s);
  const r = snapshot(s);
  for (const [field, unit] of Object.entries(FAMILY_FACT_FIELD_UNITS)) {
    assert.equal(inputFor(r.input, field).value, unit === 'code' ? '0' : '0.00000000');
    assert.equal(rowFor(r.result, field).amount, '0.00000000');
  }
});

for (const field of Object.keys(FAMILY_FACT_FIELD_UNITS)) test('undeclared ' + field + ' stays null and cannot become zero on an evaluated branch', () => {
  const s = familySources();
  setField(s.familyPayrollFacts.records[0].definition, field, null);
  sealFamilySources(s);
  const input = prepare(s);
  assert.equal(inputFor(input, field).value, null);
  assert.throws(() => createOwnPayrollSnapshot(input), missing);
});

test('an explicit unevaluated auxiliary branch does not demand or fill the null quantity', () => {
  const s = familySources(), field = 'childrenWithDisability';
  setField(s.familyPayrollFacts.records[0].definition, field, null);
  s.programState.program.definition.rules.find(r => r.code === familyCode(field)).expression = {
    op: 'choose', condition: { op: 'compare', operator: 'gt', left: lit('0', 'units'), right: lit('14', 'units') }, then: fact(familyKey(field), 'units'), else: lit('0', 'units'),
  };
  sealFamilySources(s);
  const r = snapshot(s);
  assert.equal(inputFor(r.input, field).value, null);
  assert.equal(rowFor(r.result, field).amount, '0.00000000');
  // This is an auxiliary marker. A zero row is not absence of a payable row.
});

test('a missing approved declaration is blocked even when every source field could be absent', () => {
  const s = familySources();
  Object.assign(s.familyPayrollFacts.records[0], { revision: 0, definition: null, approvalId: null });
  sealFamilySources(s);
  assert.throws(() => prepare(s), codeIs('SOURCE_VALUE_MISSING'));
});

test('family fields reject arithmetic units, aggregation, invented fields and a zero-on-absence policy', () => {
  for (const patch of [{ unit: 'coefficient' }, { combine: 'sum' }, { onMissing: 'zero' }, { sourceField: 'childrenTariff' }, { sourceKind: 'family_fact', sourceCode: '62' }]) {
    const p = familySources().programState.program.definition;
    Object.assign(p.bindings.find(b => b.sourceKind === 'family_fact'), patch);
    assert.throws(() => ownProgramStructure(p), codeIs('BINDING_INVALID'));
  }
});

test('malformed declared quantities, prenatal months, codes, precision and dates are never coerced', () => {
  const invalid = [
    ['children', 0], ['children', '01'], ['children', '-1'], ['children', '100'],
    ['prenatalAdjustmentMonths', '25'], ['prenatalAdjustmentMonths', '1.5'],
    ['tariffRegion', 1], ['tariffRegion', '001 '], ['semesterAverage', '0.001'],
  ];
  for (const [field, value] of invalid) {
    const s = familySources(); setField(s.familyPayrollFacts.records[0].definition, field, value); sealFamilySources(s);
    assert.throws(() => prepare(s), invalidFamily);
  }
  for (const date of ['2026-11-01', '2026-02-30']) {
    const s = familySources(); s.familyPayrollFacts.records[0].definition.asOfDate = date; sealFamilySources(s);
    assert.throws(() => prepare(s), invalidFamily);
  }
});

test('capture completeness, all identities, revision/approval parity and unique contracts are mandatory', () => {
  const changes = [
    s => { delete s.familyPayrollFacts; },
    s => { s.familyPayrollFacts.complete = false; },
    s => { s.familyPayrollFacts.records.pop(); },
    s => { s.familyPayrollFacts.records[1] = structuredClone(s.familyPayrollFacts.records[0]); },
    s => { s.familyPayrollFacts.records[1].contractId = familyId(90000); },
    s => { s.familyPayrollFacts.records[1].identityToken = 'a'.repeat(64); },
    s => { s.familyPayrollFacts.records[1].approvalId = null; },
    s => { s.familyPayrollFacts.records[1].revision = 0; },
  ];
  for (const change of changes) {
    const s = familySources(3); change(s);
    assert.throws(() => prepare(s), invalidFamily);
  }
});

test('family period/version, approval content and full population are independently pinned', () => {
  for (const change of [
    s => { s.familyPayrollFacts.records[0].approvalId = familyId(90000); },
    s => { s.familyPayrollFacts.records[0].definition.quantities.children = '2'; },
    s => { s.familyPayrollFacts.version = ownRunHash([OWN_PAYROLL_FAMILY_FACTS_VERSION, '2026-09', s.familyPayrollFacts.records]); },
    s => { s.population.version = ownRunHash({ employees: s.population.employees }); },
  ]) {
    const s = familySources(); change(s);
    assert.throws(() => prepare(s), codeIs('SOURCE_VERSION_INVALID'));
  }
});

for (const count of [37, 855]) test('all ' + count + ' synthetic declarations reach the frozen input and result without truncation', () => {
  const s = familySources(count), r = snapshot(s), last = s.population.employees.at(-1);
  assert.equal(r.input.employees.length, count);
  assert.equal(r.result.employeeCount, count);
  assert.equal(r.result.rows.length, 18 * count);
  assert.equal(r.input.employees.at(-1).contractId, last.contractId);
  assert.ok(rowFor(r.result, 'childrenWithDisability', last.contractId));
  s.familyPayrollFacts.records.pop();
  assert.throws(() => prepare(s), invalidFamily);
});

test('snapshot inputs, rules, hashes and output are immutable after source edits', () => {
  const s = familySources(), r = snapshot(s), before = structuredClone(r);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.input) && Object.isFrozen(r.input.employees[0].inputs[0]));
  assert.throws(() => { inputFor(r.input, 'children').value = '7'; }, TypeError);
  s.familyPayrollFacts.records[0].definition.quantities.children = '7'; sealFamilySources(s);
  assert.deepEqual(r, before);
  const after = snapshot(s);
  assert.notEqual(after.inputSha256, r.inputSha256);
  assert.notEqual(after.resultSha256, r.resultSha256);
});

test('legacy v2 program/input/result hashes stay exact and historical receipts keep their original algorithm', () => {
  const s = auxiliarySources(3), r = snapshot(s);
  assert.equal(ownRunHash(s.programState.program.definition), '0a501d5c37663197a6deac7c762b0e65aa1f88b1c00c7c173e02965f9cba6cb3');
  assert.equal(r.inputSha256, 'af4d280f1776172c098cc2bf4e27cab660c6addfc19c1ba10a4511d132edb70a');
  assert.equal(r.resultSha256, '82a71961bb6ac8abb1e987810b506fd37b22ad10b0752b05f8d63299cdc7f483');
  assert.equal(Object.hasOwn(r.input, 'familyPayrollFactsVersion'), false);
  const historical = auxiliaryDocuments(3).capture, before = structuredClone(historical);
  assert.deepEqual(verifyOwnRunReceipt(historical), before);
  assert.equal(historical.algorithmSha256, 'c'.repeat(64));
});

test('legacy v1 program/input/result hashes remain byte-for-byte identical', () => {
  const s = approvedSources(2), r = snapshot(s);
  assert.equal(r.input.version, 'own-payroll-input.v1');
  assert.equal(ownRunHash(s.programState.program.definition), 'cf70df9b8bd109ae5fa3098dc0102ef1fab28ea84a118d454494b376468cc45e');
  assert.equal(r.inputSha256, '5b44a199a0e39b9e205fbd4d9e7cf7279107da9e96cb2481b558546a2eca8355');
  assert.equal(r.resultSha256, '9d49d89a8e031a8de67b3585303b74dc409b42ce54d497315f575e17e99a78d0');
  assert.equal(Object.hasOwn(r.input, 'familyPayrollFactsVersion'), false);
});

test('unknown versions, implicit legacy adoption and a downgrade of family semantics are rejected', () => {
  const s = familySources(), p = s.programState.program.definition;
  for (const version of [undefined, 'own-contract-family-payroll-facts.v2']) {
    const changed = structuredClone(p);
    if (version === undefined) delete changed.familyPayrollFactsVersion; else changed.familyPayrollFactsVersion = version;
    assert.throws(() => ownProgramStructure(changed), e => /PROGRAM_INVALID$|BINDING_INVALID$|OPERATION_UNSUPPORTED$/.test(e.code));
  }
  const old = auxiliarySources(); old.familyPayrollFacts = s.familyPayrollFacts;
  assert.throws(() => prepare(old), codeIs('SOURCE_SCOPE_INVALID'));
  const after = structuredClone(p); delete after.familyPayrollFactsVersion;
  assert.throws(() => ownProgramHistory(p, after), codeIs('PROGRAM_HISTORY_REQUIRED'));
  const input = prepare(s); input.familyPayrollFactsVersion = 'unknown';
  assert.throws(() => normalizeOwnPayrollInput(input), codeIs('CONTRACT_INVALID'));
});

test('source preparer lowers exact family bindings into only a frozen non-approved draft', () => {
  const raw = familyPreparerEvidence(), before = structuredClone(raw), r = prepareOwnPayrollProgrammeSource(raw);
  assert.equal(r.status, 'proposal_draft'); assert.deepEqual(r.incidents, []);
  assert.equal(r.draft.programme.familyPayrollFactsVersion, OWN_PAYROLL_FAMILY_FACTS_VERSION);
  assert.equal(r.draft.programme.bindings.length, 15);
  assert.ok(r.draft.programme.bindings.every(b => b.sourceKind === 'family_fact'));
  for (const field of ['approved', 'executable', 'payrollCalculated', 'payrollPosted']) assert.equal(r[field], false);
  assert.ok(Object.isFrozen(r.draft.programme.bindings[0]));
  assert.deepEqual(raw, before);
  delete raw.programmeOptions.familyPayrollFactsVersion;
  const missing = prepareOwnPayrollProgrammeSource(raw);
  assert.equal(missing.presentable.programme, false); assert.equal(missing.draft.programme, null);
  assert.ok(missing.incidents.some(i => i.code === 'PROGRAMME_CURRENT_CONTRACT_REJECTED'));
});

test('frozen run capture and saved receipt retain exact family evidence and cannot omit its last row', () => {
  const c = familyCapture(37), before = structuredClone(c);
  assert.deepEqual(ownRunCapture(c), before);
  assert.deepEqual(verifyOwnRunReceipt(c), before);
  for (const change of [
    v => { delete v.payload.familyPayrollFacts; },
    v => { v.payload.familyPayrollFacts.records.pop(); },
    v => { v.payload.familyPayrollFacts.records[36].identityToken = 'a'.repeat(64); },
    v => { v.payload.familyPayrollFacts.version = 'a'.repeat(64); },
  ]) {
    const bad = structuredClone(c); change(bad); bad.payloadSha256 = ownRunHash(bad.payload);
    assert.throws(() => verifyOwnRunReceipt(bad), captureInvalid);
  }
});

test('even rehashed saved inputs cannot change the declared family value or drop the opt-in', () => {
  for (const [change, errorCode] of [
    [v => { inputFor(v.saved.input, 'children').value = '8.00000000'; }, 'OWN_RUN_CONTRACT_INVALID'],
    [v => { delete v.saved.input.familyPayrollFactsVersion; }, 'INPUT_INVALID'],
  ]) {
    const bad = familyCapture(); change(bad); bad.saved.inputSha256 = ownRunHash(bad.saved.input);
    assert.throws(() => verifyOwnRunReceipt(bad), codeIs(errorCode));
  }
});

test('family, salary conditions and declared period share one complete population proof', () => {
  const s = conditionSources(3), family = familySources(3), p = s.programState.program.definition;
  p.familyPayrollFactsVersion = OWN_PAYROLL_FAMILY_FACTS_VERSION;
  p.periodContextVersion = OWN_PAYROLL_PERIOD_CONTEXT_VERSION;
  p.bindings.push(...family.programState.program.definition.bindings.filter(b => b.sourceKind === 'family_fact'));
  p.rules.push(...family.programState.program.definition.rules.filter(r => Number(r.code) >= 9500));
  s.programState.salaryCatalog.items.push(...family.programState.salaryCatalog.items.filter(r => Number(r.code) >= 9500));
  s.programState.program.definition = ownProgramDefinition(p, s.programState.salaryCatalog.items);
  s.familyPayrollFacts = family.familyPayrollFacts;
  const fields = periodContextFields(s.period);
  s.periodContext = { ...fields, sha256: ownRunHash(fields) };
  sealFamilySources(s);
  const c = familyCapture(3);
  c.payload = { ...s, sourceInventory: c.payload.sourceInventory };
  c.payloadSha256 = ownRunHash(c.payload); c.saved = saved(c);
  assert.equal(verifyOwnRunReceipt(c).saved.input.sourceVersions.population, s.population.version);
  assert.equal(c.saved.input.salaryConditionsVersion, p.salaryConditionsVersion);
  const bad = structuredClone(c);
  bad.payload.salaryConditions.records[2].definition.title.percentage = '13.00000001';
  bad.payloadSha256 = ownRunHash(bad.payload);
  assert.throws(() => verifyOwnRunReceipt(bad), codeIs('OWN_RUN_CONTRACT_INVALID'));
});

test('SQL consumer failures retain actionable status without disclosing internal details', () => {
  for (const [message, code, status] of [
    ['OWN_RUN_FAMILY_APPROVAL_REQUIRED', 'OWN_RUN_FAMILY_APPROVAL_REQUIRED', 422],
    ['OWN_RUN_FAMILY_CAPTURE_INVALID', 'OWN_RUN_FAMILY_CAPTURE_INVALID', 503],
    ['OWN_RUN_FAMILY_INPUT_INVALID', 'OWN_RUN_FAMILY_INPUT_INVALID', 503],
    ['FAMILY_PAYROLL_FACTS_IDENTITY_CHANGED', 'OWN_RUN_SOURCE_IDENTITY_CHANGED', 409],
    ['FAMILY_PAYROLL_FACTS_LIMIT', 'OWN_RUN_LIMIT', 422],
    ['FAMILY_PAYROLL_FACTS_BUSY', 'OWN_RUN_BUSY', 409],
  ]) {
    const error = runError(new Error(message + ' PRIVATE_DIAGNOSTIC'));
    assert.equal(error.code, code); assert.equal(error.status, status);
    assert.equal(error.message.includes('PRIVATE_DIAGNOSTIC'), false);
  }
});
