// Pure arithmetic and explicit policies for the C1 R8 preparation candidate.
// This module neither verifies approvals nor writes balances or payroll results.
// It must be called with the frozen sources verified by the normal run adapter.
import {
  payrollRequire, rational, decimal, exactAdd, exactSubtract, exactMultiply,
  exactCompare, exactEvidence, quantize,
} from './own-payroll-exact.js';

export const SPECIAL_METHODS_VERSION = 'own-payroll-special-methods.preparation-r8';
const ZERO = rational(0n);
const LINE_POLICY = Object.freeze({ precision: 2, mode: 'half_up' });
const code = (value, label) => {
  payrollRequire(typeof value === 'string' && /^[1-9][0-9]{0,8}$/.test(value), 'METHOD_CODE_REQUIRED', `Falta ${label}.`);
  return value;
};
function record(value, keys, error = 'METHOD_INPUT_INVALID') {
  payrollRequire(value && Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).every(k => typeof k === 'string' && keys.includes(k)) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(d => Object.hasOwn(d, 'value')),
  error, 'La entrada del método debe declarar sólo los campos admitidos.');
}
function requiredText(value, label) {
  payrollRequire(typeof value === 'string' && value.length > 0 && value.length <= 500,
    'METHOD_POLICY_REQUIRED', `Falta la referencia de ${label}.`);
  return value;
}
export function methodExact(value, label = 'importe') {
  if (typeof value === 'string') return decimal(value);
  record(value, ['numerator', 'denominator'], 'METHOD_VALUE_REQUIRED');
  payrollRequire(typeof value.numerator === 'string' && /^(?:0|-?[1-9][0-9]{0,511})$/.test(value.numerator) &&
    typeof value.denominator === 'string' && /^[1-9][0-9]{0,511}$/.test(value.denominator),
  'METHOD_VALUE_REQUIRED', `Falta el valor exacto de ${label}; no se reemplaza por cero.`);
  return rational(BigInt(value.numerator), BigInt(value.denominator));
}
const nonnegative = (value, label) => {
  const result = methodExact(value, label);
  payrollRequire(exactCompare(result, ZERO) >= 0, 'METHOD_NEGATIVE_VALUE_UNSUPPORTED', `${label} no admite un valor negativo en este contrato.`);
  return result;
};
const rowAmount = value => quantize(value, LINE_POLICY).amount;
const result = value => ({ exact: exactEvidence(value), amount: rowAmount(value) });

/**
 * One exact deduction, with an allowance already resolved at this sequence.
 * The requested amount is not implicitly increased by any previous debt.
 * Method 27 emits a DCTONEFE contribution, not a persisted or global L152 value.
 * Method 29 emits the exact L133 candidate and does not fabricate a carry rule.
 */
export function applyCappedDeduction(input) {
  record(input, ['method', 'conceptCode', 'requestedAmount', 'availableAmount']);
  payrollRequire(input.method === '27' || input.method === '29', 'METHOD_NOT_SUPPORTED', 'El núcleo admite los métodos 27 y 29.');
  const conceptCode = code(input.conceptCode, 'concepto');
  const requested = nonnegative(input.requestedAmount, 'importe solicitado');
  const available = methodExact(input.availableAmount, 'disponible en la secuencia');
  const allowance = exactCompare(available, ZERO) < 0 ? ZERO : available;
  const applied = exactCompare(requested, allowance) <= 0 ? requested : allowance;
  const unapplied = exactSubtract(requested, applied);
  const remaining = exactSubtract(available, applied);
  return {
    version: SPECIAL_METHODS_VERSION, method: input.method, conceptCode,
    requested: result(requested), available: exactEvidence(available),
    applied: result(applied), unapplied: result(unapplied),
    remainingAvailable: exactEvidence(remaining),
    balanceEffect: input.method === '27'
      ? { kind: 'unapplied_discount_contribution', sourceConceptCode: conceptCode, exact: exactEvidence(unapplied) }
      : null,
    variableEffects: input.method === '29' ? { 'L[133]': exactEvidence(applied) } : {},
  };
}

/**
 * Applies an explicitly ordered capped subset to a common allowance.
 * This is not a full payroll scheduler: other deductions must be represented by
 * the caller's allowance/stage. Equal SEQU requires a declared order, never an
 * implicit lexical or concept-code tie break.
 */
export function applyCappedSeries(input) {
  record(input, ['availableAmount', 'steps', 'tieOrder', 'orderReference']);
  payrollRequire(Array.isArray(input.steps) && input.steps.length <= 1000, 'METHOD_STEPS_REQUIRED', 'Falta la secuencia de descuentos.');
  let available = methodExact(input.availableAmount, 'disponible inicial');
  const steps = input.steps.map(step => {
    record(step, ['conceptCode', 'sequence', 'requestedAmount']);
    code(step.conceptCode, 'concepto');
    payrollRequire(Number.isSafeInteger(step.sequence) && step.sequence >= 0, 'METHOD_SEQUENCE_REQUIRED', 'Falta la secuencia del concepto.');
    return { ...step };
  });
  payrollRequire(new Set(steps.map(s => s.conceptCode)).size === steps.length, 'METHOD_DUPLICATE_CONCEPT', 'Un concepto aparece dos veces en la secuencia.');
  const duplicateSequence = new Set(steps.map(s => s.sequence)).size !== steps.length;
  const tieOrder = input.tieOrder;
  if (duplicateSequence) {
    payrollRequire(Array.isArray(tieOrder) && tieOrder.length === steps.length &&
      new Set(tieOrder).size === steps.length && steps.every(s => tieOrder.includes(s.conceptCode)),
    'METHOD_TIE_ORDER_REQUIRED', 'Hay descuentos con la misma secuencia; declarar el orden de desempate.');
    requiredText(input.orderReference, 'orden de desempate');
  } else {
    payrollRequire(tieOrder === undefined && input.orderReference === undefined,
      'METHOD_TIE_ORDER_NOT_USED', 'No declarar un desempate que esta secuencia no utiliza.');
  }
  steps.sort((a, b) => a.sequence - b.sequence || (tieOrder ? tieOrder.indexOf(a.conceptCode) - tieOrder.indexOf(b.conceptCode) : 0));
  const outputs = [];
  let unpaid = ZERO;
  for (const step of steps) {
    const output = applyCappedDeduction({method: '27', conceptCode: step.conceptCode,
      requestedAmount: step.requestedAmount, availableAmount: exactEvidence(available)});
    available = methodExact(output.remainingAvailable);
    unpaid = exactAdd(unpaid, methodExact(output.unapplied.exact));
    outputs.push({ ...output, sequence: step.sequence });
  }
  return { version: SPECIAL_METHODS_VERSION, steps: outputs,
    remainingAvailable: exactEvidence(available), unpaidContribution: exactEvidence(unpaid),
    orderReference: duplicateSequence ? input.orderReference : null };
}

/** Evaluate the literal, transitively closed A12/A13 definitions from C1. */
export function evaluateC1CapAuxiliaries(input) {
  record(input, ['categoryCode', 'r993', 'r994', 'r995', 'r996', 'r608', 'stageReference']);
  const categoryCode = code(input.categoryCode, 'clase');
  const stageReference = requiredText(input.stageReference, 'etapa de lectura de R[]');
  const r993 = methodExact(input.r993, 'R993'), r994 = methodExact(input.r994, 'R994');
  const r996 = methodExact(input.r996, 'R996'), r608 = methodExact(input.r608, 'R608');
  const includeFamily = exactCompare(r608, ZERO) > 0;
  let base = exactAdd(r993, r994);
  if (includeFamily) base = exactAdd(base, methodExact(input.r995, 'R995'));
  const a12 = exactSubtract(base, r996);
  // Exact closure: A13 -> A85 -> A86 -> A87. Infix and postfix agree here.
  const a13 = decimal(categoryCode === '3' ? '300' : categoryCode === '4' ? '290' : BigInt(categoryCode) <= 8n ? '250' : '220');
  return { version: SPECIAL_METHODS_VERSION, categoryCode, stageReference,
    a12: exactEvidence(a12), a13: exactEvidence(a13), includeFamily,
    referencesRead: ['L[8]', 'R[993]', 'R[994]', 'R[996]', 'R[608]', ...(includeFamily ? ['R[995]'] : [])],
  };
}

/**
 * Proposed own-program policy for method29, NOT proof of GRH's hidden executor.
 * Required policy fixes both unresolved points; it is reviewed as part of the
 * existing programme, not through an additional approval workflow.
 */
export function applyC1Method29(input) {
  record(input, ['requestedAmount', 'categoryCode', 'r993', 'r994', 'r995',
    'deductionsBeforeCurrent', 'priorR608', 'policy']);
  record(input.policy, ['reference', 'reserveOperator', 'deductionsStage', 'r608Stage'], 'METHOD_POLICY_REQUIRED');
  const reference = requiredText(input.policy.reference, 'política del método 29');
  payrollRequire(input.policy.reserveOperator === 'minimum_remaining_net' &&
    input.policy.deductionsStage === 'before_current_deduction' &&
    ['current_requested_amount', 'prior_result'].includes(input.policy.r608Stage),
  'METHOD29_POLICY_UNSUPPORTED', 'Declarar la reserva y la etapa de lectura admitidas por esta propuesta.');
  const requested = nonnegative(input.requestedAmount, 'importe solicitado');
  const r608 = input.policy.r608Stage === 'current_requested_amount'
    ? exactEvidence(requested) : input.priorR608;
  payrollRequire(input.policy.r608Stage !== 'current_requested_amount' || input.priorR608 === undefined,
    'METHOD29_UNUSED_STAGE_VALUE', 'El valor anterior de R608 no corresponde a la etapa seleccionada.');
  const auxiliaries = evaluateC1CapAuxiliaries({categoryCode: input.categoryCode,
    r993: input.r993, r994: input.r994, r995: input.r995, r996: input.deductionsBeforeCurrent,
    r608, stageReference: reference});
  const available = exactSubtract(methodExact(auxiliaries.a12), methodExact(auxiliaries.a13));
  const step = applyCappedDeduction({method: '29', conceptCode: '608',
    requestedAmount: exactEvidence(requested), availableAmount: exactEvidence(available)});
  return { ...step, policy: {...input.policy}, auxiliaries,
    netAfterCurrent: exactEvidence(exactSubtract(methodExact(auxiliaries.a12), methodExact(step.applied.exact))),
  };
}

/**
 * Tariff lookup with an explicit first-upper-bound-inclusive policy. Source rows
 * exist; this policy does not assert that an undocumented GRH boundary matches.
 * Outside range is an error, never a zero or a silent last-row fallback.
 */
export function selectFamilyTariff(input) {
  record(input, ['regionCode', 'typeCode', 'priorSemesterAverage', 'rows', 'policy']);
  const regionCode = code(input.regionCode, 'región'), typeCode = code(input.typeCode, 'tipo de asignación');
  record(input.policy, ['reference', 'selection', 'outsideRange'], 'METHOD_POLICY_REQUIRED');
  const reference = requiredText(input.policy.reference, 'selección de tarifa');
  payrollRequire(input.policy.selection === 'first_upper_bound_inclusive' && input.policy.outsideRange === 'error',
    'FAMILY_TARIFF_POLICY_UNSUPPORTED', 'La selección de tramo debe estar expresamente declarada.');
  const average = nonnegative(input.priorSemesterAverage, 'promedio semestral');
  payrollRequire(Array.isArray(input.rows) && input.rows.length <= 10000, 'FAMILY_TARIFF_SOURCE_REQUIRED', 'Falta la tabla de tarifas.');
  const rows = input.rows.map(row => {
    record(row, ['regionCode', 'typeCode', 'upperBound', 'amount', 'sourceSha256']);
    code(row.regionCode, 'región de tarifa'); code(row.typeCode, 'tipo de tarifa');
    payrollRequire(typeof row.sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(row.sourceSha256),
      'FAMILY_TARIFF_SOURCE_PIN_REQUIRED', 'Falta la huella de la fila de tarifa.');
    return {source: row, bound: nonnegative(row.upperBound, 'tope de tarifa'), amount: nonnegative(row.amount, 'importe de tarifa')};
  }).filter(r => r.source.regionCode === regionCode && r.source.typeCode === typeCode)
    .sort((a, b) => exactCompare(a.bound, b.bound));
  payrollRequire(rows.length > 0, 'FAMILY_TARIFF_NOT_FOUND', 'No hay tarifa para esta región y tipo.');
  payrollRequire(rows.every((r, i) => i === 0 || exactCompare(r.bound, rows[i - 1].bound) !== 0),
    'FAMILY_TARIFF_AMBIGUOUS', 'Hay más de una tarifa con el mismo tope.');
  const chosen = rows.find(r => exactCompare(average, r.bound) <= 0);
  payrollRequire(chosen, 'FAMILY_TARIFF_OUTSIDE_RANGE', 'El promedio supera todos los tramos disponibles.');
  return { version: SPECIAL_METHODS_VERSION, regionCode, typeCode, policyReference: reference,
    priorSemesterAverage: exactEvidence(average), upperBound: exactEvidence(chosen.bound),
    unitAmount: exactEvidence(chosen.amount), sourceSha256: chosen.source.sourceSha256 };
}

const FAMILY_METHOD22 = Object.freeze({
  '302': {type: '3', units: 'L[62]', tariff: 'L[82]'},
  '305': {type: '7', units: 'L[66]', tariff: 'L[86]'},
  '306': {type: '8', units: 'L[67]', tariff: 'L[87]'},
  '307': {type: '10', units: 'L[69]', tariff: 'L[89]'},
  '308': {type: '9', units: 'L[68]', tariff: 'L[88]'},
  '309': {type: '11', units: 'L[70]', tariff: 'L[90]'},
});

/** Six C1 method22 formulas whose L quantity/tariff mapping is documented. */
export function calculateC1Method22(input) {
  record(input, ['conceptCode', 'basicDays', 'quantity', 'regionCode', 'priorSemesterAverage', 'rows', 'policy']);
  const conceptCode = code(input.conceptCode, 'concepto');
  payrollRequire(!['315', '316'].includes(conceptCode), 'FAMILY_EVENT_VARIABLE_MAPPING_UNPROVEN',
    'L160/L161 requieren acreditar su correspondencia con matrimonio/nacimiento.');
  const definition = FAMILY_METHOD22[conceptCode];
  payrollRequire(definition, 'METHOD22_CONCEPT_UNSUPPORTED', 'El concepto no tiene este contrato de unidades y tarifa.');
  const days = nonnegative(input.basicDays, 'U1');
  const active = exactCompare(days, decimal('14')) > 0;
  if (!active) return {version: SPECIAL_METHODS_VERSION, method: '22', conceptCode, active: false,
    reason: 'U1_NOT_GREATER_THAN_14', applied: result(ZERO), referencesRead: ['U[1]']};
  const quantity = nonnegative(input.quantity, definition.units);
  payrollRequire(quantity.d === 1n, 'FAMILY_QUANTITY_NOT_INTEGER', 'La cantidad de beneficiarios debe ser un entero conocido.');
  if (quantity.n === 0n) return {version: SPECIAL_METHODS_VERSION, method: '22', conceptCode, active: true,
    reason: 'EXPLICIT_ZERO_ELIGIBLE_BENEFICIARIES', applied: result(ZERO), quantity: exactEvidence(quantity),
    referencesRead: ['U[1]', definition.units]};
  const tariff = selectFamilyTariff({regionCode: input.regionCode, typeCode: definition.type,
    priorSemesterAverage: input.priorSemesterAverage, rows: input.rows, policy: input.policy});
  const amount = exactMultiply(quantity, methodExact(tariff.unitAmount));
  return {version: SPECIAL_METHODS_VERSION, method: '22', conceptCode, active: true, reason: 'APPLIED',
    applied: result(amount), quantity: exactEvidence(quantity), tariff,
    referencesRead: ['U[1]', definition.units, definition.tariff, 'L[131]', 'family_region']};
}
