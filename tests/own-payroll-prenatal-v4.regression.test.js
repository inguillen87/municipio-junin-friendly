import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { salarySerialized } from '../assets/native-salary-catalog-model.js';
import { ownProgramStructure } from '../assets/own-payroll-program-model.js';
import { calculateOwnPayrollWithQuantities } from '../assets/own-payroll-quantity.js';
import {
  normalizeFamilyTariffPolicy,
  normalizeFamilyTariffProgram,
  proposeFamilyTariffPolicyV3,
  proposeFamilyTariffPolicyV4,
  selectFamilyTariffPolicies,
  familyTariffProgramHistory,
} from '../assets/own-payroll-family-tariffs.js';
import {
  captureOwnPayrollFamilyTariffSources,
  verifyOwnPayrollFamilyTariffCaptureHashes,
} from '../lib/own-payroll-family-tariff-source.js';

// Entirely invented data for protocol regression. No municipal catalogue,
// backup, employee, adopted amount or external fixture is read by this file.
const hash = value => createHash('sha256').update(salarySerialized(value)).digest('hex');
const V3 = 'own-payroll-family-tariffs.v3';
const V4 = 'own-payroll-family-tariffs.v4';
const contractId = '11111111-1111-4111-8111-111111111111';
const approvalId = '22222222-2222-4222-8222-222222222222';
const reference = 'Invented prenatal fixture for protocol regression only';
const expectedError = code => error => error?.code === code;
const literal = (unit, value) => ({ op: 'literal', unit, value });
const input = (key, unit) => ({ op: 'input', key, unit });

function declaration(overrides = {}) {
  const rows = [{ regionCode: '1', typeCode: '4', upperBound: '1000000.00',
    amount: '17.25', sourceSha256: hash('invented tariff row') }];
  return {
    policyId: 'ci-prenatal-v4', supersedes: null, agreementCode: '1',
    validFrom: '2027-08', validUntil: null, liquidationType: 'monthly',
    selection: 'first_upper_bound_inclusive', outsideRange: 'error',
    mappings: [{ sourceCode: '83', conceptCode: '313', typeCode: '4',
      consumerCodes: ['313', '314'], sourceReference: reference,
      sourceSha256: hash('invented shared mapping') }],
    rows, rowsSha256: hash(rows), sourceReference: reference,
    sourceSha256: hash('invented policy declaration'), ...overrides,
  };
}

function singleConsumerDeclaration(overrides = {}) {
  const raw = declaration(overrides);
  return { ...raw, mappings: raw.mappings.map(({ consumerCodes, ...mapping }) => mapping) };
}

function amountRule(code, key, validFrom = '2027-08', validUntil = null) {
  const factor = input(key, 'units');
  return {
    code, agreementCode: '1', nature: 'non_remuneration', unit: 'money',
    validFrom, validUntil, liquidationTypes: ['monthly'],
    ruleReference: reference, rounding: { precision: 2, mode: 'half_up' },
    expression: { op: 'choose',
      condition: { op: 'compare', operator: 'eq', left: factor, right: literal('units', '0') },
      then: literal('money', '0'),
      else: { op: 'multiply',
        left: { op: 'divide', left: factor, right: literal('units', '1') },
        right: input('tariff83', 'money') } },
  };
}

function program(policy = proposeFamilyTariffPolicyV4(declaration())) {
  const rules = [amountRule('313', 'prenatal'), amountRule('314', 'prenatalMonths')];
  return {
    namespaceVersion: 'own-payroll-namespaces.v2',
    familyPayrollFactsVersion: 'own-contract-family-payroll-facts.v1',
    familyTariffsVersion: policy.version, familyTariffPolicies: [policy],
    rules,
    bindings: [
      { agreementCode: '1', key: 'prenatal', unit: 'units', sourceKind: 'family_fact',
        sourceField: 'prenatal', combine: 'single', onMissing: 'error', ruleReference: reference },
      { agreementCode: '1', key: 'prenatalMonths', unit: 'units', sourceKind: 'family_fact',
        sourceField: 'prenatalAdjustmentMonths', combine: 'single', onMissing: 'error', ruleReference: reference },
      { agreementCode: '1', key: 'tariff83', unit: 'money', sourceKind: 'family_tariff',
        sourceCode: '83', combine: 'single', onMissing: 'error', ruleReference: reference },
    ],
    quantityPhasesVersion: 'own-payroll-quantity-phases.v1',
    quantityPhases: rules.map(rule => ({
      agreementCode: '1', code: rule.code, unit: 'units', stage: 'exact', rounding: null,
      expression: input('prenatal', 'units'), validFrom: rule.validFrom,
      validUntil: rule.validUntil, liquidationTypes: ['monthly'],
      sourceReference: reference, sourceSha256: hash('invented quantity ' + rule.code),
      amountUse: { kind: 'independent' },
      periodTreatment: { kind: 'none', reference },
    })),
    totalsPrecision: 2,
  };
}

function payrollInput({ period = '2027-08', prenatal = '1', months = '2',
  region = '1', average = '0.00', definition = program() } = {}) {
  const employee = { contractId, employeeNumber: 'SYNTHETIC-PRENATAL',
    agreementCode: '1', departmentCode: '1', inputs: [
      { key: 'prenatal', unit: 'units', value: prenatal, sourceReference: reference },
      { key: 'prenatalMonths', unit: 'units', value: months, sourceReference: reference },
      { key: 'tariff83', unit: 'money', value: null, sourceReference: reference },
    ] };
  const identityToken = hash('invented contract identity');
  const familyFacts = { version: hash('invented family capture'), records: [{
    contractId, identityToken, revision: 1, approvalId,
    definition: { asOfDate: period + '-01',
      tariffSelection: { region, semesterAverage: average } },
  }] };
  // This helper's contract starts after the family adapter has validated its
  // complete declaration. Only fields consumed here are synthetic inputs.
  const familyTariffCapture = captureOwnPayrollFamilyTariffSources({
    definition, familyFacts,
    population: { employees: [{ ...employee, identityToken }] },
    employees: [employee], period, liquidationType: 'monthly',
  });
  return {
    version: 'own-payroll-input.v3', namespaceVersion: 'own-payroll-namespaces.v2',
    period, liquidationType: 'monthly', selection: { kind: 'all', values: [] },
    sourceVersions: { population: hash('invented population'), rules: hash(definition),
      novelties: hash('invented complete empty novelty capture') },
    populationComplete: true, totalsPrecision: 2,
    familyPayrollFactsVersion: 'own-contract-family-payroll-facts.v1',
    familyTariffsVersion: definition.familyTariffsVersion, familyTariffCapture,
    employees: [employee], rules: definition.rules,
    quantityPhasesVersion: definition.quantityPhasesVersion,
    quantityPhases: definition.quantityPhases.map(({ periodTreatment, ...phase }) => phase),
  };
}

const run = options => calculateOwnPayrollWithQuantities(payrollInput(options));
const amount = (result, code) => result.rows.find(row => row.conceptCode === code).amount;

test('V4 validates a programme with two explicitly listed consumers of one tariff', () => {
  const raw = program();
  const normalized = ownProgramStructure(raw);
  assert.deepEqual(normalized.familyTariffPolicies, raw.familyTariffPolicies);
  assert.deepEqual(normalized.familyTariffPolicies[0].mappings[0].consumerCodes, ['313', '314']);
  assert.equal(normalized.rules.length, 2);
  assert.equal(normalized.quantityPhases.length, 2);
});

test('shared tariff reads retain both amounts, independent quantities and readCount', () => {
  const result = run();
  assert.equal(amount(result, '313'), '17.25');
  assert.equal(amount(result, '314'), '34.50');
  assert.equal(result.quantityCount, 2);
  assert.ok(result.quantities.every(row => row.unit === 'units' &&
    row.value.numerator === '1' && row.value.denominator === '1'));
  assert.equal(result.familyTariffDecisionCount, 1);
  const [decision] = result.familyTariffDecisions;
  assert.equal(decision.sourceCode, '83');
  assert.equal(decision.conceptCode, '313');
  assert.equal(decision.typeCode, '4');
  assert.equal(decision.status, 'resolved');
  assert.equal(decision.readCount, 2);
});

test('a zero factor skips only its own tariff read', () => {
  for (const [prenatal, months, amounts] of [['0', '2', ['0.00', '34.50']], ['1', '0', ['17.25', '0.00']]]) {
    const result = run({ prenatal, months });
    assert.deepEqual(['313', '314'].map(code => amount(result, code)), amounts);
    assert.equal(result.familyTariffDecisions[0].readCount, 1);
  }
});

test('both declared zero factors leave an unresolved tariff unrequested', () => {
  const result = run({ prenatal: '0', months: '0', region: null, average: null });
  assert.deepEqual(['313', '314'].map(code => amount(result, code)), ['0.00', '0.00']);
  assert.equal(result.quantityCount, 2);
  assert.equal(result.familyTariffDecisions[0].status, 'not_requested');
  assert.equal(result.familyTariffDecisions[0].readCount, 0);
});

test('missing declarations and missing requested tariff facts never become zero', () => {
  assert.throws(() => run({ prenatal: null, months: '0' }));
  assert.throws(() => run({ prenatal: '0', months: null }));
  assert.throws(() => run({ prenatal: '1', months: '0', region: null }), expectedError('FAMILY_TARIFF_FACT_MISSING'));
  assert.throws(() => run({ prenatal: '0', months: '1', average: null }), expectedError('FAMILY_TARIFF_FACT_MISSING'));
});

test('V4 rejects a missing or empty consumer list', () => {
  const missing = proposeFamilyTariffPolicyV4(declaration());
  delete missing.mappings[0].consumerCodes;
  assert.throws(() => normalizeFamilyTariffPolicy(missing), expectedError('FAMILY_TARIFF_CONTRACT_INVALID'));
  const empty = proposeFamilyTariffPolicyV4(declaration());
  empty.mappings[0].consumerCodes = [];
  assert.throws(() => normalizeFamilyTariffPolicy(empty), expectedError('FAMILY_TARIFF_CONTRACT_INVALID'));
});

test('V4 rejects duplicates, out-of-order codes and a list without its principal', () => {
  for (const consumerCodes of [['313', '313'], ['314', '313'], ['314']]) {
    const policy = proposeFamilyTariffPolicyV4(declaration());
    policy.mappings[0].consumerCodes = consumerCodes;
    assert.throws(() => normalizeFamilyTariffPolicy(policy), expectedError('FAMILY_TARIFF_CONSUMERS_INVALID'));
  }
});

test('the programme rejects an existing consumer removed from the V4 list', () => {
  const raw = program();
  raw.familyTariffPolicies[0].mappings[0].consumerCodes = ['313'];
  assert.throws(() => ownProgramStructure(raw), expectedError('FAMILY_TARIFF_SCOPE_UNSUPPORTED'));
});

test('a third consumer cannot use a shared tariff without being listed', () => {
  const raw = program();
  raw.rules.push(amountRule('315', 'prenatal'));
  assert.throws(() => ownProgramStructure(raw), expectedError('FAMILY_TARIFF_SCOPE_UNSUPPORTED'));
});

test('V3 retains its single-consumer contract and original serialized policy', () => {
  const policy = proposeFamilyTariffPolicyV3(singleConsumerDeclaration({ policyId: 'ci-prenatal-v3' }));
  const before = salarySerialized(policy);
  assert.deepEqual(normalizeFamilyTariffPolicy(policy), policy);
  const raw = program(policy);
  assert.throws(() => normalizeFamilyTariffProgram(raw), expectedError('FAMILY_TARIFF_SCOPE_UNSUPPORTED'));
  raw.rules = raw.rules.filter(rule => rule.code === '313');
  raw.quantityPhases = raw.quantityPhases.filter(phase => phase.code === '313');
  assert.doesNotThrow(() => normalizeFamilyTariffProgram(raw));
  assert.equal(salarySerialized(policy), before);
  const invalid = structuredClone(policy);
  invalid.mappings[0].consumerCodes = ['313', '314'];
  assert.throws(() => normalizeFamilyTariffPolicy(invalid), expectedError('FAMILY_TARIFF_CONTRACT_INVALID'));
});

function policyHistory() {
  const earlier = proposeFamilyTariffPolicyV3(singleConsumerDeclaration({
    policyId: 'ci-prenatal-v3-2027', validFrom: '2027-01',
  }));
  const later = proposeFamilyTariffPolicyV4(declaration({
    policyId: 'ci-prenatal-v4-2028', validFrom: '2028-01',
    supersedes: { policyId: earlier.policyId, policySha256: hash(earlier) },
  }));
  return { familyTariffsVersion: V4, familyTariffPolicies: [earlier, later] };
}

test('V3 to V4 succession selects exact months and preserves predecessor bytes', () => {
  const history = policyHistory();
  const predecessor = salarySerialized(history.familyTariffPolicies[0]);
  for (const [period, version] of [['2027-12', V3], ['2028-01', V4], ['2035-12', V4]]) {
    const [policy] = selectFamilyTariffPolicies(history, period, 'monthly', ['1']);
    assert.equal(policy.version, version);
  }
  assert.equal(salarySerialized(history.familyTariffPolicies[0]), predecessor);
  familyTariffProgramHistory({ familyTariffsVersion: V3,
    familyTariffPolicies: [history.familyTariffPolicies[0]] }, history);
});

test('history rejects a wrong predecessor hash or alteration of the prior policy', () => {
  const history = policyHistory();
  const wrongHash = structuredClone(history);
  wrongHash.familyTariffPolicies[1].supersedes.policySha256 = '0'.repeat(64);
  assert.throws(() => selectFamilyTariffPolicies(wrongHash, '2028-01', 'monthly', ['1']));
  const changed = structuredClone(history);
  changed.familyTariffPolicies[0].sourceReference = 'Changed synthetic predecessor';
  assert.throws(() => familyTariffProgramHistory(history, changed), expectedError('PROGRAM_HISTORY_REQUIRED'));
});

test('future payroll capture preserves the V3 to V4 lineage and selects its active tariff', () => {
  const history = policyHistory();
  const definition = program(history.familyTariffPolicies[1]);
  Object.assign(definition, history);
  for (const rule of definition.rules) rule.validFrom = '2028-01';
  for (const phase of definition.quantityPhases) phase.validFrom = '2028-01';
  assert.doesNotThrow(() => ownProgramStructure(definition));
  const captured = payrollInput({ period: '2035-12', definition });
  assert.equal(captured.familyTariffCapture.version, 'own-payroll-family-tariff-capture.v2');
  assert.equal(captured.familyTariffCapture.period, '2035-12');
  assert.deepEqual(captured.familyTariffCapture.policies, history.familyTariffPolicies);
  verifyOwnPayrollFamilyTariffCaptureHashes(captured);
  const result = calculateOwnPayrollWithQuantities(captured);
  assert.deepEqual(['313', '314'].map(code => amount(result, code)), ['17.25', '34.50']);
  assert.equal(result.familyTariffDecisions[0].readCount, 2);
});

test('a captured future tariff cannot be changed behind its policy hash', () => {
  const captured = payrollInput({ period: '2028-12' });
  captured.familyTariffCapture.policies[0].rows[0].amount = '99.00';
  assert.throws(() => verifyOwnPayrollFamilyTariffCaptureHashes(captured), expectedError('FAMILY_TARIFF_ROWS_CHANGED'));
});
