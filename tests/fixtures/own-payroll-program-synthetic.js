import { payrollInput, payrollId } from './own-payroll-synthetic.js';
import { salaryItems } from '../../assets/native-salary-catalog-model.js';
import { ownProgramStructure } from '../../assets/own-payroll-program-model.js';
export const hash = c => c.repeat(64);
export const uid = payrollId;
export function program() { return ownProgramStructure({ rules: payrollInput().rules, bindings: [
  { agreementCode: '1', key: 'base', unit: 'money', sourceKind: 'parameter', sourceCode: '8800', onMissing: 'error', combine: 'single', ruleReference: 'Parámetro inventado QA' },
  { agreementCode: '1', key: 'addition', unit: 'money', sourceKind: 'monthly_amount', sourceCode: '120', onMissing: 'zero', combine: 'sum', ruleReference: 'Importe sintético completo QA' },
], totalsPrecision: 2 }); }
export function definitions() { return salaryItems([...program().rules.map(r => ({ active: true, agreementCode: r.agreementCode, categoryCode: null, code: r.code, dependencies: [], kind: 'concept', label: 'Concepto inventado QA', nature: r.nature, precision: 6, ruleReference: 'Sólo QA; sin norma municipal', unit: r.code === '100' ? 'units' : r.unit, validFrom: r.validFrom, validUntil: null, value: null })), { active: true, agreementCode: '1', categoryCode: null, code: '8800', dependencies: [], kind: 'concept', label: 'Parámetro sintético QA', nature: 'auxiliary', precision: 2, ruleReference: 'Parámetro inventado QA', unit: 'money', validFrom: '2026-10', validUntil: null, value: '100.10' }]); }
export function command(patch = {}) { return { command: 'propose', scopeVersion: hash('a'), baseVersion: hash('b'), salaryVersion: hash('c'), proposalId: null, proposalSha256: null, program: program(), reason: 'Prueba sintética sin efecto municipal', reviewConfirmed: false, ...patch }; }
export function bootstrap(patch = {}) { return { version: 'own-payroll-program.v1', scopeVersion: hash('a'), salaryCatalog: { version: hash('c'), revision: 1, items: definitions() }, program: { version: hash('b'), revision: 0, definition: null, salaryVersion: null, proposalId: null, approvalId: null }, proposals: [], permissions: { canPropose: true, canReview: false }, payrollCalculated: false, payrollPosted: false, ...patch }; }
