import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  INSTITUTIONAL_RULES_VERSION,
  attendanceBonus,
  garnishmentCap,
  institutionalParameter,
  institutionalRule,
  netWithoutRounding,
  sacProportional,
  unusedLeaveValue,
  validateInstitutionalRules,
} from '../assets/own-payroll-institutional-rules.js';

const contract = JSON.parse(await readFile(new URL('../contracts/junin-payroll-institutional-rules.v1.json', import.meta.url), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(contract));
const throwsCode = (fn, code) => assert.throws(fn, error => error.code === code);

test('el contrato es válido, está en preparación y cita fuentes declaradas', () => {
  assert.equal(validateInstitutionalRules(contract), contract);
  assert.equal(contract.contractVersion, INSTITUTIONAL_RULES_VERSION);
  assert.equal(contract.activation, 'PREPARATION_ONLY');
  assert.deepEqual(contract.rules.map(r => r.ruleId), [
    'net_rounding', 'garnishment_commercial', 'sac', 'attendance_bonus', 'vacation_days', 'severance_incapacity',
    'osep_contributions', 'retirement_contribution', 'guaranteed_minimum_salary', 'family_allowances_scale',
    'absence_day_value', 'seniority_rate', 'overtime', 'subrogation', 'income_tax', 'formula_language',
  ]);
  for (const rule of contract.rules) for (const e of rule.evidence) assert.ok(contract.sources[e.source], `${rule.ruleId} cita ${e.source}`);
});

test('el contrato falla cerrado ante activación, fuente, estado o vigencia inválidos', () => {
  const activated = clone(); activated.activation = 'ACTIVE';
  throwsCode(() => validateInstitutionalRules(activated), 'INSTITUTIONAL_RULES_ACTIVATION');
  const badSource = clone(); badSource.rules[0].evidence[0].source = 'inventada';
  throwsCode(() => validateInstitutionalRules(badSource), 'INSTITUTIONAL_RULE_EVIDENCE');
  const badStatus = clone(); badStatus.rules[0].status = 'approved';
  throwsCode(() => validateInstitutionalRules(badStatus), 'INSTITUTIONAL_RULE_STATUS');
  const unordered = clone(); unordered.rules[1].parameters[0].values.reverse();
  throwsCode(() => validateInstitutionalRules(unordered), 'INSTITUTIONAL_PARAMETER_ORDER');
  const badMoney = clone(); badMoney.rules[1].parameters[0].values[0].value = '398.800,00';
  throwsCode(() => validateInstitutionalRules(badMoney), 'DECIMAL_INVALID');
  const duplicate = clone(); duplicate.rules.push({ ...clone().rules[0] });
  throwsCode(() => validateInstitutionalRules(duplicate), 'INSTITUTIONAL_RULE_DUPLICATE');
});

test('el valor vigente se elige por período y sin vigencia no hay valor', () => {
  assert.equal(institutionalParameter(contract, 'garnishment_commercial', 'smvm', '2026-11').value, '398800.00');
  assert.equal(institutionalParameter(contract, 'garnishment_commercial', 'smvm', '2026-12').value, '406400.00');
  assert.equal(institutionalParameter(contract, 'garnishment_commercial', 'smvm', '2027-04').value, '437000.00');
  assert.equal(institutionalParameter(contract, 'garnishment_commercial', 'smvm', '2027-09').value, '437000.00');
  throwsCode(() => institutionalParameter(contract, 'garnishment_commercial', 'smvm', '2026-08'), 'INSTITUTIONAL_PARAMETER_NOT_IN_FORCE');
  throwsCode(() => institutionalParameter(contract, 'guaranteed_minimum_salary', 'guaranteedMinimum', '2026-10'), 'INSTITUTIONAL_PARAMETER_NOT_IN_FORCE');
  assert.equal(institutionalParameter(contract, 'guaranteed_minimum_salary', 'guaranteedMinimum', '2026-11').value, '525000.00');
  throwsCode(() => institutionalParameter(contract, 'garnishment_commercial', 'smvm', '2026-11-01'), 'INSTITUTIONAL_PERIOD');
  throwsCode(() => institutionalParameter(contract, 'garnishment_commercial', 'inexistente', '2026-11'), 'INSTITUTIONAL_PARAMETER_UNKNOWN');
  throwsCode(() => institutionalRule(contract, 'no_existe'), 'INSTITUTIONAL_RULE_UNKNOWN');
});

test('las reglas inactivas en Junín no aportan valores', () => {
  assert.equal(institutionalRule(contract, 'overtime').status, 'inactive');
  throwsCode(() => institutionalParameter(contract, 'overtime', 'monthlyHours', '2026-11'), 'INSTITUTIONAL_RULE_INACTIVE');
  throwsCode(() => institutionalParameter(contract, 'income_tax', 'x', '2026-11'), 'INSTITUTIONAL_RULE_INACTIVE');
  throwsCode(() => institutionalParameter(contract, 'subrogation', 'x', '2026-11'), 'INSTITUTIONAL_RULE_INACTIVE');
});

test('embargo comercial: tope del Decreto 484/87 sobre el excedente de un SMVM y retención por oficio', () => {
  assert.deepEqual(garnishmentCap(contract, '2026-11', '300000.00', '50000.00'), { smvm: '398800.00', legalCap: '0.00', withheld: '0.00', orderExceedsCap: true });
  assert.deepEqual(garnishmentCap(contract, '2026-11', '600000.00', '15000.00'), { smvm: '398800.00', legalCap: '20120.00', withheld: '15000.00', orderExceedsCap: false });
  assert.deepEqual(garnishmentCap(contract, '2026-11', '797600.00', '50000.00'), { smvm: '398800.00', legalCap: '39880.00', withheld: '39880.00', orderExceedsCap: true });
  assert.deepEqual(garnishmentCap(contract, '2026-11', '1000000.00', '200000.00'), { smvm: '398800.00', legalCap: '120240.00', withheld: '120240.00', orderExceedsCap: true });
  assert.equal(garnishmentCap(contract, '2026-12', '1000000.00', '200000.00').legalCap, '118720.00');
  throwsCode(() => garnishmentCap(contract, '2026-11', '-1.00', '0.00'), 'GARNISHMENT_INPUT');
});

test('SAC proporcional: mejor haber / 2 × días / 180', () => {
  assert.deepEqual(sacProportional(contract, '2026-06', '600000.00', 180), { amount: '300000.00', divisor: '180' });
  assert.deepEqual(sacProportional(contract, '2026-06', '600000.00', 122), { amount: '203333.33', divisor: '180' });
  assert.equal(sacProportional(contract, '2026-12', '1234567.89', 0).amount, '0.00');
  throwsCode(() => sacProportional(contract, '2026-06', '600000.00', 181), 'SAC_DAYS_OVER_DIVISOR');
  throwsCode(() => sacProportional(contract, '2026-06', '600000.00', 1.5), 'SAC_DAYS');
});

test('licencias no gozadas: mayor sueldo / 25 por día', () => {
  assert.deepEqual(unusedLeaveValue(contract, '2026-11', '750000.00', 11), { amount: '330000.00', divisor: '25' });
  assert.equal(unusedLeaveValue(contract, '2026-11', '750000.00', 0).amount, '0.00');
  throwsCode(() => unusedLeaveValue(contract, '2026-11', '750000.00', -1), 'UNUSED_LEAVE_DAYS');
});

test('presentismo escalonado: 100 / 67 / 50 / 0 sobre el 10 % de la base', () => {
  assert.deepEqual(attendanceBonus(contract, '2026-11', '399840.00', 0), { amount: '39984.00', factorPercent: '100' });
  assert.deepEqual(attendanceBonus(contract, '2026-11', '399840.00', 1), { amount: '26789.28', factorPercent: '67' });
  assert.deepEqual(attendanceBonus(contract, '2026-11', '399840.00', 2), { amount: '19992.00', factorPercent: '50' });
  assert.deepEqual(attendanceBonus(contract, '2026-11', '399840.00', 3), { amount: '0.00', factorPercent: '0' });
  assert.equal(attendanceBonus(contract, '2026-11', '399840.00', 9).amount, '0.00');
});

test('neto sin redondeo: suma exacta de conceptos a dos decimales, diferencia 0,00', () => {
  assert.deepEqual(netWithoutRounding(contract, '2026-11', ['480000.00', '96000.00', '47980.80', '-68637.89', '-4679.86']), { net: '550663.05', roundingDifference: '0.00' });
  throwsCode(() => netWithoutRounding(contract, '2026-11', ['1.005']), 'NET_CONCEPT_PRECISION');
  throwsCode(() => netWithoutRounding(contract, '2026-11', []), 'NET_CONCEPTS');
  const rounded = clone(); rounded.rules[0].parameters[0].values[0].value = '0.50';
  throwsCode(() => netWithoutRounding(rounded, '2026-11', ['1.00']), 'NET_ROUNDING_MODE');
});
