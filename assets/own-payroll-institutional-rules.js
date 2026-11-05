// Reglas institucionales de Junín como parámetros versionados. Lectura pura:
// este módulo no calcula nómina ni activa nada; expone el valor vigente de un
// parámetro para un período y tres cómputos auxiliares exactos declarados en
// el contrato. Toda ambigüedad falla cerrada.
import {
  decimal, exactAdd, exactCompare, exactDivide, exactMultiply, exactSubtract,
  payrollRequire as require, quantize, rational,
} from './own-payroll-exact.js';

export const INSTITUTIONAL_RULES_VERSION = 'junin-payroll-institutional-rules.v1';
export const INSTITUTIONAL_RULE_STATUSES = Object.freeze(['confirmed', 'observed', 'legal_default', 'inactive', 'pending']);
export const INSTITUTIONAL_PARAMETER_UNITS = Object.freeze(['money', 'ratio', 'percent', 'integer', 'enum', 'table']);

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const plain = v => v && Object.getPrototypeOf(v) === Object.prototype;

export function validateInstitutionalRules(contract) {
  require(plain(contract) && contract.contractVersion === INSTITUTIONAL_RULES_VERSION, 'INSTITUTIONAL_RULES_VERSION', 'El contrato de reglas institucionales no es la versión esperada.');
  require(contract.activation === 'PREPARATION_ONLY', 'INSTITUTIONAL_RULES_ACTIVATION', 'El contrato de reglas institucionales sólo puede estar en preparación.');
  require(plain(contract.sources) && Object.keys(contract.sources).length > 0, 'INSTITUTIONAL_RULES_SOURCES', 'El contrato debe declarar sus fuentes.');
  require(Array.isArray(contract.rules) && contract.rules.length > 0, 'INSTITUTIONAL_RULES_EMPTY', 'El contrato no declara reglas.');
  const ids = new Set();
  for (const rule of contract.rules) {
    require(plain(rule) && typeof rule.ruleId === 'string' && /^[a-z][a-z0-9_]{2,63}$/.test(rule.ruleId), 'INSTITUTIONAL_RULE_ID', 'Cada regla necesita un ruleId en minúsculas.');
    require(!ids.has(rule.ruleId), 'INSTITUTIONAL_RULE_DUPLICATE', `La regla ${rule.ruleId} está repetida.`);
    ids.add(rule.ruleId);
    require(INSTITUTIONAL_RULE_STATUSES.includes(rule.status), 'INSTITUTIONAL_RULE_STATUS', `La regla ${rule.ruleId} tiene un estado desconocido.`);
    require(typeof rule.statement === 'string' && rule.statement.trim().length >= 20, 'INSTITUTIONAL_RULE_STATEMENT', `La regla ${rule.ruleId} necesita un enunciado.`);
    require(Array.isArray(rule.evidence) && rule.evidence.length > 0 && rule.evidence.every(e => plain(e) && typeof e.source === 'string' && Object.hasOwn(contract.sources, e.source) && typeof e.detail === 'string' && e.detail.length > 0), 'INSTITUTIONAL_RULE_EVIDENCE', `La regla ${rule.ruleId} debe citar fuentes declaradas.`);
    require(Array.isArray(rule.parameters), 'INSTITUTIONAL_RULE_PARAMETERS', `La regla ${rule.ruleId} necesita una lista de parámetros.`);
    const keys = new Set();
    for (const p of rule.parameters) {
      require(plain(p) && typeof p.key === 'string' && /^[a-z][A-Za-z0-9]{1,63}$/.test(p.key) && !keys.has(p.key), 'INSTITUTIONAL_PARAMETER_KEY', `La regla ${rule.ruleId} tiene un parámetro sin clave válida o repetido.`);
      keys.add(p.key);
      require(INSTITUTIONAL_PARAMETER_UNITS.includes(p.unit), 'INSTITUTIONAL_PARAMETER_UNIT', `El parámetro ${rule.ruleId}.${p.key} tiene una unidad desconocida.`);
      require(Array.isArray(p.values) && p.values.length > 0, 'INSTITUTIONAL_PARAMETER_VALUES', `El parámetro ${rule.ruleId}.${p.key} no tiene valores vigentes.`);
      let last = null;
      for (const v of p.values) {
        require(plain(v) && PERIOD.test(v.validFrom) && (v.validUntil === undefined || PERIOD.test(v.validUntil) && v.validUntil >= v.validFrom), 'INSTITUTIONAL_PARAMETER_VALIDITY', `El parámetro ${rule.ruleId}.${p.key} tiene una vigencia inválida.`);
        require(last === null || v.validFrom > last, 'INSTITUTIONAL_PARAMETER_ORDER', `El parámetro ${rule.ruleId}.${p.key} debe listar vigencias crecientes sin repetir.`);
        last = v.validFrom;
        if (['money', 'ratio', 'percent'].includes(p.unit)) decimal(v.value);
        else if (p.unit === 'integer') require(typeof v.value === 'string' && /^(0|[1-9][0-9]{0,8})$/.test(v.value), 'INSTITUTIONAL_PARAMETER_INTEGER', `El parámetro ${rule.ruleId}.${p.key} debe ser entero como texto.`);
        else if (p.unit === 'enum') require(typeof v.value === 'string' && v.value.length > 0, 'INSTITUTIONAL_PARAMETER_ENUM', `El parámetro ${rule.ruleId}.${p.key} debe ser un valor nombrado.`);
        else require(v.value !== null && typeof v.value === 'object', 'INSTITUTIONAL_PARAMETER_TABLE', `El parámetro ${rule.ruleId}.${p.key} debe ser una tabla.`);
      }
    }
  }
  return contract;
}

export function institutionalRule(contract, ruleId) {
  const rule = validateInstitutionalRules(contract).rules.find(r => r.ruleId === ruleId);
  require(rule, 'INSTITUTIONAL_RULE_UNKNOWN', `La regla ${ruleId} no está declarada.`);
  return rule;
}

// Valor vigente de un parámetro para un período YYYY-MM. Falla cerrada si la
// regla está inactiva/pendiente o si no hay vigencia que cubra el período.
export function institutionalParameter(contract, ruleId, key, period) {
  require(typeof period === 'string' && PERIOD.test(period), 'INSTITUTIONAL_PERIOD', 'Indicá el período como AAAA-MM.');
  const rule = institutionalRule(contract, ruleId);
  require(!['inactive', 'pending'].includes(rule.status), 'INSTITUTIONAL_RULE_INACTIVE', `La regla ${ruleId} está ${rule.status === 'inactive' ? 'inactiva' : 'pendiente'} en Junín; no aporta valores.`);
  const parameter = rule.parameters.find(p => p.key === key);
  require(parameter, 'INSTITUTIONAL_PARAMETER_UNKNOWN', `La regla ${ruleId} no declara el parámetro ${key}.`);
  const current = [...parameter.values].reverse().find(v => v.validFrom <= period && (v.validUntil === undefined || period <= v.validUntil));
  require(current, 'INSTITUTIONAL_PARAMETER_NOT_IN_FORCE', `El parámetro ${ruleId}.${key} no tiene valor vigente para ${period}.`);
  return { unit: parameter.unit, value: current.value, validFrom: current.validFrom, validUntil: current.validUntil ?? null, status: rule.status };
}

const money = (contract, ruleId, key, period) => decimal(institutionalParameter(contract, ruleId, key, period).value);
const MONEY = Object.freeze({ precision: 2, mode: 'half_up' });
const fixed = (value, policy = MONEY) => quantize(value, policy).amount;

// Tope legal del embargo comercial (Decreto 484/87) y retención efectiva.
export function garnishmentCap(contract, period, grossSalary, courtOrderAmount) {
  const gross = decimal(grossSalary), order = decimal(courtOrderAmount);
  require(exactCompare(gross, rational(0n)) >= 0 && exactCompare(order, rational(0n)) >= 0, 'GARNISHMENT_INPUT', 'Bruto y oficio deben ser montos no negativos.');
  const smvm = money(contract, 'garnishment_commercial', 'smvm', period);
  const low = money(contract, 'garnishment_commercial', 'lowBandRate', period);
  const high = money(contract, 'garnishment_commercial', 'highBandRate', period);
  const twice = exactMultiply(smvm, rational(2n));
  let cap = rational(0n);
  if (exactCompare(gross, smvm) > 0) cap = exactMultiply(exactCompare(gross, twice) > 0 ? high : low, exactSubtract(gross, smvm));
  const withheld = exactCompare(order, cap) <= 0 ? order : cap;
  return { smvm: fixed(smvm), legalCap: fixed(cap), withheld: fixed(withheld), orderExceedsCap: exactCompare(order, cap) > 0 };
}

// SAC = mejor haber sujeto del semestre / 2 × días trabajados / divisor (180).
export function sacProportional(contract, period, bestMonthlySalary, workedDays) {
  const best = decimal(bestMonthlySalary);
  require(Number.isInteger(workedDays) && workedDays >= 0, 'SAC_DAYS', 'Los días trabajados del semestre deben ser un entero no negativo.');
  const divisor = BigInt(institutionalParameter(contract, 'sac', 'semesterDayDivisor', period).value);
  require(BigInt(workedDays) <= divisor, 'SAC_DAYS_OVER_DIVISOR', 'Los días trabajados no pueden superar el divisor del semestre.');
  const amount = exactDivide(exactMultiply(exactDivide(best, rational(2n)), rational(BigInt(workedDays))), rational(divisor));
  return { amount: fixed(amount), divisor: divisor.toString() };
}

// Licencias no gozadas: mayor sueldo percibido / 25 por día (confirmado).
export function unusedLeaveValue(contract, period, bestMonthlySalary, days) {
  const best = decimal(bestMonthlySalary);
  require(Number.isInteger(days) && days >= 0, 'UNUSED_LEAVE_DAYS', 'Los días no gozados deben ser un entero no negativo.');
  const divisor = BigInt(institutionalParameter(contract, 'vacation_days', 'unusedLeaveDayDivisor', period).value);
  const amount = exactMultiply(exactDivide(best, rational(divisor)), rational(BigInt(days)));
  return { amount: fixed(amount), divisor: divisor.toString() };
}

// Presentismo: base × 10 % × factor por inasistencias.
export function attendanceBonus(contract, period, base, absences) {
  const amountBase = decimal(base);
  require(Number.isInteger(absences) && absences >= 0, 'ATTENDANCE_ABSENCES', 'Las inasistencias deben ser un entero no negativo.');
  const rate = money(contract, 'attendance_bonus', 'baseRate', period);
  const table = institutionalParameter(contract, 'attendance_bonus', 'factorByAbsences', period).value;
  const factor = decimal(table[absences >= 3 ? '3+' : String(absences)]);
  const amount = exactMultiply(exactMultiply(amountBase, rate), exactDivide(factor, rational(100n)));
  return { amount: fixed(amount), factorPercent: factor.n.toString() };
}

// Neto sin redondeo: la suma exacta de conceptos ya expresados a dos decimales.
export function netWithoutRounding(contract, period, conceptAmounts) {
  const mode = institutionalParameter(contract, 'net_rounding', 'netRoundingMode', period).value;
  require(mode === 'none', 'NET_ROUNDING_MODE', 'La regla vigente exige neto sin redondeo.');
  require(Array.isArray(conceptAmounts) && conceptAmounts.length > 0, 'NET_CONCEPTS', 'Informá al menos un concepto.');
  const precision = Number(institutionalParameter(contract, 'net_rounding', 'conceptPrecision', period).value);
  let total = rational(0n);
  for (const amount of conceptAmounts) {
    const value = decimal(amount);
    require(value.d <= 10n ** BigInt(precision), 'NET_CONCEPT_PRECISION', `El concepto ${amount} supera la precisión declarada.`);
    total = exactAdd(total, value);
  }
  return { net: quantize(total, { precision, mode: 'exact' }).amount, roundingDifference: '0.00' };
}
