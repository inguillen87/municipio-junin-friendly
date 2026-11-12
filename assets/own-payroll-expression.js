import { decimal, exactAdd, exactSubtract, exactMultiply, exactDivide, exactCompare, exactEvidence, quantize, roundingPolicy, payrollRequire as require } from './own-payroll-exact.js';
import { conditionUnit, conditionValue } from './own-payroll-conditions.js';

const units = new Set(['money', 'hours', 'minutes', 'days', 'percent', 'units', 'coefficient']);
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const key = v => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v);
export const payrollExpressionReference = v => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= 3 && v.length <= 180 && !/[<>\u0000-\u001f\u007f]/.test(v);

function shape(v, keys) {
  require(v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).every(k => typeof k === 'string') && Reflect.ownKeys(v).sort().join('|') === [...keys].sort().join('|') && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value') && d.enumerable), 'CONTRACT_INVALID', 'La entrada contiene campos omitidos o no admitidos.');
}

// Same expression language for monetary rules and opt-in quantity phases.
// No source text or evaluator callback is accepted inside an expression.
export function normalizePayrollExpression(node, options, depth = 0, counter = { nodes: 0 }) {
  const { limits, namespaced = false, typedConditions = false, quantities = false } = options;
  require(depth <= limits.depth && ++counter.nodes <= limits.nodes, 'EXPRESSION_LIMIT', 'La regla supera el límite de profundidad u operaciones declaradas.');
  require(node && typeof node === 'object' && Object.getOwnPropertyDescriptor(node, 'op')?.value, 'EXPRESSION_INVALID', 'La operación de la regla no es válida.');
  const child = v => normalizePayrollExpression(v, options, depth + 1, counter);
  if (node.op === 'literal') { shape(node, ['op', 'unit', 'value']); require(units.has(node.unit), 'UNIT_INVALID', 'La unidad no está declarada.'); decimal(node.value); return { ...node }; }
  if (node.op === 'input') { shape(node, ['op', 'unit', 'key']); require(units.has(node.unit) && key(node.key), 'INPUT_INVALID', 'La entrada necesita nombre y unidad explícitos.'); return { ...node }; }
  if (node.op === 'match' && typedConditions) {
    shape(node, ['op', 'key', 'type', 'operator', 'value']);
    require(key(node.key) && conditionUnit(node.type) && ['eq', 'ne'].includes(node.operator) && conditionValue(node.type, node.value), 'EXPRESSION_INVALID', 'La condición necesita un código o booleano exacto y una igualdad explícita.'); return { ...node };
  }
  if (node.op === 'concept' || namespaced && node.op === 'auxiliary') { shape(node, ['op', 'code', 'stage']); require(code(node.code) && ['exact', 'rounded'].includes(node.stage), 'REFERENCE_INVALID', 'La referencia necesita concepto o auxiliar y etapa explícita, antes o después de redondear.'); return { ...node }; }
  if (quantities && namespaced && node.op === 'quantity') { shape(node, ['op', 'code']); require(code(node.code), 'REFERENCE_INVALID', 'La cantidad referenciada necesita un código explícito.'); return { ...node }; }
  if (node.op === 'round') { shape(node, ['op', 'value', 'rounding']); return { op: node.op, value: child(node.value), rounding: roundingPolicy(node.rounding) }; }
  if (node.op === 'convert') {
    shape(node, ['op', 'value', 'unit', 'factor', 'conversionReference']);
    require(units.has(node.unit) && payrollExpressionReference(node.conversionReference), 'CONVERSION_REQUIRED', 'La conversión requiere unidad, factor exacto y respaldo explícitos.'); decimal(node.factor);
    return { ...node, value: child(node.value) };
  }
  if (['add', 'subtract', 'multiply', 'divide', 'min', 'max', 'compare'].includes(node.op)) {
    shape(node, node.op === 'compare' ? ['op', 'operator', 'left', 'right'] : ['op', 'left', 'right']);
    if (node.op === 'compare') require(['lt', 'le', 'eq', 'ne', 'ge', 'gt'].includes(node.operator), 'EXPRESSION_INVALID', 'La comparación no está admitida.');
    return { ...node, left: child(node.left), right: child(node.right) };
  }
  if (node.op === 'choose') { shape(node, ['op', 'condition', 'then', 'else']); return { op: node.op, condition: child(node.condition), then: child(node.then), else: child(node.else) }; }
  require(false, 'OPERATION_UNSUPPORTED', 'La operación no está implementada; no se ejecuta texto o una rutina externa.');
}

// Resolvers own namespace/graph identities. Visiting every branch here preserves
// declared dependencies; the evaluator below only visits the selected branch.
export function payrollExpressionUnit(expression, { consume, referenceUnit, quantityUnit }) {
  function unit(n) {
    consume();
    if (['literal', 'input'].includes(n.op)) return n.unit;
    if (n.op === 'match') return 'boolean';
    if (n.op === 'concept' || n.op === 'auxiliary') return referenceUnit(n);
    if (n.op === 'quantity') return quantityUnit(n);
    if (n.op === 'round') { const result = unit(n.value); require(result !== 'boolean', 'UNIT_MISMATCH', 'No se redondea una condición.'); return result; }
    if (n.op === 'convert') { require(unit(n.value) !== 'boolean', 'UNIT_MISMATCH', 'No se convierte una condición en un importe.'); return n.unit; }
    if (n.op === 'choose') { require(unit(n.condition) === 'boolean', 'UNIT_MISMATCH', 'La condición debe ser una comparación.'); const a = unit(n.then), b = unit(n.else); require(a === b && a !== 'boolean', 'UNIT_MISMATCH', 'Ambas alternativas deben declarar la misma unidad numérica.'); return a; }
    const a = unit(n.left), b = unit(n.right);
    require(a !== 'boolean' && b !== 'boolean', 'UNIT_MISMATCH', 'Una condición no es un valor numérico.');
    if (n.op === 'multiply') { require(a === 'coefficient' || b === 'coefficient', 'CONVERSION_REQUIRED', 'El producto requiere un coeficiente explícito; no se infiere una conversión.'); return a === 'coefficient' ? b : a; }
    if (n.op === 'divide') { require(b === 'coefficient' || a === b, 'UNIT_MISMATCH', 'La división mezcla unidades incompatibles.'); return a === b ? 'coefficient' : a; }
    require(a === b, 'UNIT_MISMATCH', 'La regla mezcla unidades incompatibles.'); return n.op === 'compare' ? 'boolean' : a;
  }
  return unit(expression);
}

export function evaluatePayrollExpression(expression, { consume, inputs, reference, quantity, referenceName, trace }) {
  function evaluate(n) {
    consume();
    let value, quantityStage = null;
    if (n.op === 'literal') value = decimal(n.value);
    else if (n.op === 'input') { const input = inputs.get(n.key); require(input && input.value !== null, 'INPUT_MISSING', 'Falta una entrada necesaria; no se supone cero.'); require(input.unit === n.unit, 'UNIT_MISMATCH', 'La entrada tiene otra unidad.'); value = decimal(input.value); }
    else if (n.op === 'match') { const input = inputs.get(n.key); require(input && input.value !== null, 'INPUT_MISSING', 'Falta la condición necesaria; no se supone no, sin título ni cero.'); require(input.unit === n.type && conditionValue(input.unit, input.value), 'UNIT_MISMATCH', 'La condición tiene otro tipo.'); value = n.operator === 'eq' ? input.value === n.value : input.value !== n.value; }
    else if (n.op === 'concept' || n.op === 'auxiliary') { const referenced = reference(n); value = n.stage === 'exact' ? referenced.exact : referenced.value; }
    else if (n.op === 'quantity') { const referenced = quantity(n); value = referenced.value; quantityStage = referenced.stage; }
    else if (n.op === 'round') value = quantize(evaluate(n.value), n.rounding).value;
    else if (n.op === 'convert') value = exactMultiply(evaluate(n.value), decimal(n.factor));
    else if (n.op === 'choose') { const condition = evaluate(n.condition); value = evaluate(condition ? n.then : n.else); }
    else {
      const a = evaluate(n.left), b = evaluate(n.right), compare = exactCompare(a, b);
      if (n.op === 'compare') value = ({ lt: compare < 0, le: compare <= 0, eq: compare === 0, ne: compare !== 0, ge: compare >= 0, gt: compare > 0 })[n.operator];
      else value = ({ add: exactAdd, subtract: exactSubtract, multiply: exactMultiply, divide: exactDivide, min: (a, b) => exactCompare(a, b) <= 0 ? a : b, max: (a, b) => exactCompare(a, b) >= 0 ? a : b })[n.op](a, b);
    }
    const isReference = n.op === 'concept' || n.op === 'auxiliary' || n.op === 'quantity';
    trace.push({ operation: n.op, reference: n.op === 'input' || n.op === 'match' ? n.key : isReference ? referenceName(n) : null, stage: n.op === 'quantity' ? quantityStage : isReference ? n.stage : null, result: typeof value === 'boolean' ? value : exactEvidence(value) });
    return value;
  }
  return evaluate(expression);
}