// Invented definitions only; no captured program, identities or infrastructure.
import {sourceCoverageInventorySha256} from '../../assets/own-payroll-source-coverage.js';

export const syntheticHash = 'a'.repeat(64);
export const literal = (value = '1', unit = 'money') => ({op: 'literal', unit, value});
const input = key => ({op: 'input', unit: 'money', key});
const rule = (code, expression = literal()) => ({agreementCode: '1', code, expression, nature: 'remuneration', unit: 'money',
  validFrom: '2026-10', validUntil: '2026-10', liquidationTypes: ['monthly'], rounding: {precision: 2, mode: 'half_up'}, ruleReference: 'Invented rule for composer QA'});
const binding = (key, sourceCode = '670', sourceKind = 'monthly_amount') => ({agreementCode: '1', key, unit: 'money',
  sourceKind, sourceCode, onMissing: 'zero', combine: 'sum', ruleReference: 'Invented input for composer QA'});
const policy = (name, extra = {}) => ({agreementCode: '1', policyId: `c1.synthetic.${name}`, supersedes: null,
  validFrom: '2026-10', validUntil: '2026-10', liquidationType: 'monthly', ...extra});

export function syntheticDefinition({school = false} = {}) {
  const rules = [rule('1'), rule('44', {op: 'multiply', left: {op: 'add', left: literal('2'), right: literal('3')}, right: literal('1', 'coefficient')}),
    rule('48'), rule('59'), rule('649', input('amount649')), rule('670', input('amount670')), rule('302'), rule('306')];
  const inventory = rules.map(r => ({code: r.code, sourceRowSha256: syntheticHash, kind: 'rule'}));
  if (school) for (const code of ['311', '312']) inventory.push({code, sourceRowSha256: syntheticHash, kind: 'excluded', basis: {
    kind: 'outside_february_school_condition', condition: {reference: 'L[101]', operator: 'eq', value: 2}, authority: 'own_programme_decision',
    dispatchScope: 'whole_definition', quantityTreatment: 'suppressed_by_own_decision', nonAmountEffects: 'empty_source_pre_post',
    decisionSha256: syntheticHash, phaseReviewSha256: syntheticHash, evidenceSha256: syntheticHash,
  }});
  inventory.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
  return {
    namespaceVersion: 'own-payroll-namespaces.v2', quantityPhasesVersion: 'own-payroll-quantity-phases.v1', periodContextVersion: 'own-payroll-period-context.v1',
    rowEmissionVersion: 'own-payroll-row-emission.v1', sourceCoverageVersion: 'own-payroll-source-coverage.v1', totalsPrecision: 2,
    rules, bindings: [binding('amount649', '649'), binding('amount670'), binding('unused'), binding('phaseOnly'), binding('policyOnly')],
    quantityPhases: ['1', '302', '306'].map(code => ({agreementCode: '1', code, unit: code === '1' ? 'days' : 'units', stage: code === '302' ? 'rounded' : 'exact',
      expression: {op: 'convert', value: input('phaseOnly'), unit: code === '1' ? 'days' : 'units', factor: '1', conversionReference: 'Invented explicit QA conversion'},
      validFrom: '2026-10', validUntil: '2026-10', liquidationTypes: ['monthly']})),
    rowEmissionPolicies: ['302', '306'].map(conceptCode => ({agreementCode: '1', period: '2026-10', liquidationType: 'monthly', conceptCode,
      conditions: [{quantityCode: '1', unit: 'days', operator: 'gt', value: '14'}, {quantityCode: conceptCode, unit: 'units', operator: 'gt', value: '0'}],
      whenFalse: 'omit_receipt_row', nonzeroAction: 'error', sourceReference: 'Invented emission evidence for composer QA', sourceSha256: syntheticHash})),
    familyTariffPolicies: [policy('tariff')], officialTotalsPolicies: [policy('totals')],
    sourceCoveragePolicies: [policy('coverage', {sourceSha256: syntheticHash, inventorySha256: sourceCoverageInventorySha256(inventory),
      expectedSourceRows: inventory.length, inventory, nativeInputs: []})],
    conditionalSourcePolicies: [policy('conditional', {inputKey: 'policyOnly'})],
    quantityOnlyInputPolicies: [policy('quantity-only')], monthlyForcedAmountPolicies: [policy('forced')], monthlyDeclaredAdjustmentPolicies: [policy('adjustment')],
    periodParticipation: {version: 'synthetic-participation-for-composition-only', treatments: [
      {ruleKey: '1:concept:44:2026-10:monthly', treatment: 'none', reference: 'Invented participation QA'},
      {ruleKey: '1:concept:44:2026-09:monthly', treatment: 'none', reference: 'Invented historical QA'},
    ]},
  };
}
export function schoolDecisions(target = '6') {
  return ['311', '312'].map(code => ({policyId: `c${target}.synthetic.coverage`, code, reference: 'Invented explicit retirement decision for QA only',
    disposition: {kind: 'excluded', basis: {kind: 'documented_retirement', decisionSha256: syntheticHash, evidenceSha256: syntheticHash}}}));
}
