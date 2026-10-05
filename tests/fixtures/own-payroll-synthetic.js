// These are invented arithmetic cases for QA, not municipal concepts or rates.
export const payrollId = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const lit = (value, unit = 'coefficient') => ({ op: 'literal', value, unit });
export const fact = (key, unit = 'money') => ({ op: 'input', key, unit });
export const ref = (code, stage = 'rounded') => ({ op: 'concept', code, stage });
export const binary = (op, left, right) => ({ op, left, right });
export const policy = (mode = 'half_up', precision = 2) => ({ mode, precision });
export const rule = (code, expression, patch = {}) => ({ code, agreementCode: '1', nature: 'remuneration', unit: 'money', validFrom: '2026-10', validUntil: null, liquidationTypes: ['monthly'], ruleReference: 'Regla inventada QA; sin norma municipal', rounding: policy(), expression, ...patch });
export function employee(n, patch = {}) {
  return { contractId: payrollId(n), employeeNumber: String(1000 + n), agreementCode: '1', departmentCode: n % 2 ? '1' : '2', inputs: [{ key: 'base', unit: 'money', value: n === 1 ? '100.10' : '350.15', sourceReference: 'Escala sintética QA' }, { key: 'addition', unit: 'money', value: n === 1 ? '20.00' : '0.00', sourceReference: 'Novedad sintética QA' }], ...patch };
}
export function payrollInput(patch = {}) {
  return { version: 'own-payroll-input.v1', period: '2026-10', liquidationType: 'monthly', populationComplete: true, totalsPrecision: 2, selection: { kind: 'all', values: [] }, sourceVersions: { population: 'a'.repeat(64), rules: 'b'.repeat(64), novelties: 'c'.repeat(64) }, employees: [employee(1), employee(2)], rules: [
    rule('100', fact('base')),
    rule('110', binary('multiply', ref('100'), lit('0.125'))),
    rule('120', fact('addition'), { nature: 'non_remuneration' }),
    rule('210', binary('multiply', binary('add', binary('add', ref('100'), ref('110')), ref('120')), lit('0.03')), { nature: 'deduction' }),
    rule('310', binary('multiply', ref('100'), lit('0.15')), { nature: 'employer_contribution' }),
    rule('900', binary('multiply', binary('divide', lit('1'), lit('3')), ref('100')), { nature: 'auxiliary', rounding: policy('half_even', 8) }),
  ], ...patch };
}
