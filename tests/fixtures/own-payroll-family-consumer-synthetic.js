// Invented declarations only. These auxiliary rules echo facts for QA;
// they are not a municipal family allowance or a tariff table.
import { auxiliarySources } from './own-payroll-auxiliary-synthetic.js';
import { syntheticFamilyDefinition, familyId } from './own-contract-family-payroll-facts-synthetic.js';
import { row } from './native-salary-synthetic.js';
import { fact, rule, lit, policy } from './own-payroll-synthetic.js';
import { capture, saved } from './own-payroll-run-synthetic.js';
import { salaryItems, SALARY_VERSION } from '../../assets/native-salary-catalog-model.js';
import { ownProgramDefinition, OWN_PROGRAM_VERSION } from '../../assets/own-payroll-program-model.js';
import { OWN_PAYROLL_NAMESPACE_VERSION } from '../../assets/own-payroll-engine.js';
import { FAMILY_FACT_FIELD_UNITS, OWN_PAYROLL_FAMILY_FACTS_VERSION } from '../../assets/own-payroll-family-facts.js';
import { ownRunHash } from '../../lib/internal-own-payroll-run.js';
import { OWN_PROGRAMME_SOURCE_VERSION } from '../../lib/own-payroll-programme-source-preparation.js';

const fields = Object.keys(FAMILY_FACT_FIELD_UNITS);
const h = c => c.repeat(64);
export const familyKey = field => 'family_' + field;
export const familyCode = field => String(9500 + fields.indexOf(field));
export const familyBinding = field => ({ agreementCode: '1', key: familyKey(field), unit: FAMILY_FACT_FIELD_UNITS[field], sourceKind: 'family_fact', sourceField: field, combine: 'single', onMissing: 'error', ruleReference: 'Declaración familiar exclusivamente sintética QA' });
const marker = key => ({ op: 'choose', condition: { op: 'match', key, type: 'code', operator: 'eq', value: '001' }, then: lit('1', 'money'), else: lit('0', 'money') });

export function sealFamilySources(s) {
  s.familyPayrollFacts.version = ownRunHash([OWN_PAYROLL_FAMILY_FACTS_VERSION, s.period, s.familyPayrollFacts.records]);
  const sources = { employees: s.population.employees };
  for (const key of ['periodContext', 'employmentFacts', 'periodParticipation', 'workingTime', 'agreementWorkingTime', 'salaryConditions', 'familyPayrollFacts']) if (Object.hasOwn(s, key)) sources[key] = s[key];
  s.population.version = ownRunHash(sources);
  return s;
}

export function familySources(count = 1) {
  const s = auxiliarySources(count);
  const catalog = [...s.programState.salaryCatalog.items];
  const p = s.programState.program.definition;
  p.familyPayrollFactsVersion = OWN_PAYROLL_FAMILY_FACTS_VERSION;
  for (const field of fields) {
    const unit = FAMILY_FACT_FIELD_UNITS[field], outputUnit = unit === 'code' ? 'money' : unit;
    catalog.push(row({ kind: 'auxiliary', code: familyCode(field), nature: 'auxiliary', unit: outputUnit, precision: 8 }));
    p.rules.push(rule(familyCode(field), unit === 'code' ? marker(familyKey(field)) : fact(familyKey(field), unit), { nature: 'auxiliary', unit: outputUnit, rounding: policy('exact', 8) }));
    p.bindings.push(familyBinding(field));
  }
  s.programState.salaryCatalog.items = salaryItems(catalog);
  s.programState.program.definition = ownProgramDefinition(p, catalog);
  s.familyPayrollFacts = { complete: true, version: h('f'), records: s.population.employees.map((e, i) => {
    const definition = syntheticFamilyDefinition();
    for (const field of Object.keys(definition.quantities)) definition.quantities[field] = field === 'children' ? '0' : String(i % 3 + 1);
    definition.prenatalAdjustmentMonths = '3';
    definition.tariffSelection = { region: '001', semesterAverage: '12.34' };
    return { contractId: e.contractId, identityToken: e.identityToken, revision: 1, definition, approvalId: familyId(20001 + i) };
  }) };
  return sealFamilySources(s);
}

export function familyCapture(count = 1) {
  const c = capture(), sources = familySources(count), employees = sources.population.employees;
  c.payload = { ...sources, sourceInventory: { populationDomain: 'native_registered', jurisdictions: { version: 'own-run-jurisdictions.v1', complete: true, total: count, rows: employees.map((e, i) => ({ contractId: e.contractId, employeeNumber: e.employeeNumber, registrationId: familyId(40001 + i), identityToken: e.identityToken, jurisdictionCode: '42' })) } } };
  c.payloadSha256 = ownRunHash(c.payload);
  c.saved = saved(c);
  return c;
}

// Minimal source preparer evidence using every consumer field, all as auxiliaries.
// The synthetic code marker checks exact region equality; it defines no tariff.
export function familyPreparerEvidence() {
  const s = familySources(), p = s.programState.program.definition;
  const definitions = fields.map(field => {
    const binding = familyBinding(field), unit = binding.unit, code = familyCode(field);
    const expression = unit === 'code'
      ? { op: 'choose', condition: { op: 'source_match', reference: 'L[' + code + ']', type: 'code', operator: 'eq', value: '001' }, then: lit('1', 'money'), else: lit('0', 'money') }
      : { op: 'source', reference: 'L[' + code + ']', unit };
    return { kind: 'auxiliary', agreementCode: '1', code, label: 'Hecho exclusivamente sintético ' + field, active: true, nature: 'auxiliary', quantityUnit: null, outputUnit: unit === 'code' ? 'money' : unit, precision: 8, validFrom: '2026-10', validUntil: null, value: null, dependencies: [], ruleReference: 'Fuente familiar exclusivamente sintética QA', sourceSha256: h('e'), liquidationTypes: ['monthly'], rounding: policy('exact', 8), expression, quantity: null };
  });
  const items = salaryItems(definitions.map(d => row({ kind: d.kind, code: d.code, label: d.label, nature: d.nature, unit: d.outputUnit, precision: d.precision, ruleReference: d.ruleReference })));
  return {
    version: OWN_PROGRAMME_SOURCE_VERSION,
    salary: { version: SALARY_VERSION, scopeVersion: h('a'), classification: { version: h('c'), items: [] }, catalog: { version: h('b'), revision: 1, items }, proposals: [], complete: true, permissions: { canPropose: true, canReview: false }, payrollCalculated: false, payrollPosted: false },
    programme: { version: OWN_PROGRAM_VERSION, scopeVersion: h('a'), salaryCatalog: { version: h('b'), revision: 1, items: structuredClone(items) }, program: { version: h('d'), revision: 0, definition: null, salaryVersion: null, proposalId: null, approvalId: null }, proposals: [], permissions: { canPropose: true, canReview: false }, payrollCalculated: false, payrollPosted: false },
    period: '2026-10', agreementCodes: ['1'], source: { sha256: h('f'), complete: true, expectedDefinitions: definitions.length }, definitions,
    bindings: fields.map(field => ({ agreementCode: '1', reference: 'L[' + familyCode(field) + ']', sourceSha256: h('2'), binding: familyBinding(field) })),
    programmeOptions: { namespaceVersion: OWN_PAYROLL_NAMESPACE_VERSION, familyPayrollFactsVersion: p.familyPayrollFactsVersion }, totalsPrecision: 2,
  };
}
