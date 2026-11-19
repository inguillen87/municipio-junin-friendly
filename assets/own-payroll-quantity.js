import {ownPayrollFamilyFacts} from './own-payroll-family-facts.js';
import {ownPayrollFamilyTariffs,familyTariffInputFields,validateNoTariffQuantityInputs} from './own-payroll-family-tariffs.js';
import { calculateOwnPayrollMetered, normalizeOwnPayrollInput, normalizeOwnPayrollRules, OWN_PAYROLL_LIMITS, OWN_PAYROLL_NAMESPACE_VERSION } from './own-payroll-engine.js';
import { decimal, rational, exactEvidence, quantize, roundingPolicy, payrollRequire as require } from './own-payroll-exact.js';
import { ownPayrollConditions } from './own-payroll-conditions.js';
import { salarySerialized } from './native-salary-catalog-model.js';
import { normalizePayrollExpression, payrollExpressionUnit, evaluatePayrollExpression, payrollExpressionReference } from './own-payroll-expression.js';

export const OWN_PAYROLL_QUANTITY_PHASES_VERSION = 'own-payroll-quantity-phases.v1';
export const OWN_PAYROLL_QUANTITY_INPUT_VERSION = 'own-payroll-input.v3';
export const OWN_PAYROLL_QUANTITY_RESULT_VERSION = 'own-payroll-result.v3';
const units = new Set(['money', 'hours', 'minutes', 'days', 'percent', 'units', 'coefficient']);
const types = new Set(['monthly', 'first_fortnight', 'sac', 'vacation', 'supplementary', 'final', 'other']);
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const month = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const active = (p, period, type) => p.validFrom <= period && (p.validUntil === null || p.validUntil >= period) && p.liquidationTypes.includes(type);
const phaseKey = p => p.agreementCode + ':' + p.code + ':' + p.validFrom + ':' + p.liquidationTypes.join(',');
const numeric = v => rational(BigInt(v.numerator), BigInt(v.denominator));
const childKeys = ['left', 'right', 'value', 'condition', 'then', 'else'];

function shape(v, keys) {
  require(v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).every(k => typeof k === 'string') && Reflect.ownKeys(v).sort().join('|') === [...keys].sort().join('|') && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value') && d.enumerable), 'CONTRACT_INVALID', 'La entrada contiene campos omitidos o no admitidos.');
}
function list(v, maximum, allowEmpty = false) {
  require(Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= maximum && (allowEmpty || v.length > 0), 'QUANTITY_LIMIT', 'El conjunto está vacío o supera la capacidad declarada. No se omiten filas.');
  require(Reflect.ownKeys(v).length === v.length + 1 && Array.from({ length: v.length }, (_, i) => Object.getOwnPropertyDescriptor(v, String(i))).every(d => d && Object.hasOwn(d, 'value') && d.enumerable), 'CONTRACT_INVALID', 'El conjunto no puede tener huecos, propiedades adicionales ni accesores.');
}
// Read only descriptors, never accessors/toJSON. V1/V2 never pass through here.
function inert(value, depth = 0, ancestors = new Set(), budget = { nodes: 0 }) {
  require(depth <= 64 && ++budget.nodes <= 1000000, 'QUANTITY_LIMIT', 'La captura completa supera la capacidad de revisión.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { require(Number.isSafeInteger(value), 'CONTRACT_INVALID', 'No se convierten números implícitos.'); return value; }
  require(value && typeof value === 'object' && !ancestors.has(value), 'CONTRACT_INVALID', 'La captura contiene un ciclo o valor no admitido.');
  const array = Array.isArray(value), descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(value);
  require(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype) && keys.every(k => typeof k === 'string' && Object.hasOwn(descriptors[k], 'value') && (array && k === 'length' || descriptors[k].enumerable)), 'CONTRACT_INVALID', 'La captura no admite accesores o propiedades ocultas.');
  if (array) list(value, 1000000, true);
  ancestors.add(value);
  const result = array ? Array.from({ length: value.length }, (_, i) => inert(descriptors[String(i)].value, depth + 1, ancestors, budget)) : Object.fromEntries(keys.map(k => [k, inert(descriptors[k].value, depth + 1, ancestors, budget)]));
  ancestors.delete(value);
  return result;
}
function normalizePhase(value, typedConditions) {
  shape(value, ['agreementCode', 'code', 'unit', 'stage', 'rounding', 'expression', 'validFrom', 'validUntil', 'liquidationTypes', 'sourceReference', 'sourceSha256', 'amountUse']);
  require(code(value.agreementCode) && code(value.code) && units.has(value.unit) && ['exact', 'rounded'].includes(value.stage), 'QUANTITY_PHASE_INVALID', 'La cantidad necesita convenio, concepto, unidad y etapa.');
  require(month(value.validFrom) && (value.validUntil === null || month(value.validUntil) && value.validUntil >= value.validFrom), 'QUANTITY_PHASE_INVALID', 'La vigencia de la cantidad debe ser explícita.');
  list(value.liquidationTypes, types.size);
  require(value.liquidationTypes.every(t => types.has(t)) && new Set(value.liquidationTypes).size === value.liquidationTypes.length, 'QUANTITY_PHASE_INVALID', 'Declarar los tipos de liquidación sin duplicados.');
  require(payrollExpressionReference(value.sourceReference) && typeof value.sourceSha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sourceSha256), 'QUANTITY_SOURCE_INVALID', 'La cantidad requiere referencia normalizada y huella de fuente.');
  require(value.stage !== 'exact' || value.rounding === null, 'QUANTITY_PHASE_INVALID', 'La etapa exacta no recibe un redondeo implícito.');
  const rounding = value.stage === 'rounded' ? roundingPolicy(value.rounding) : null, use = value.amountUse;
  let amountUse;
  if (use?.kind === 'independent') { shape(use, ['kind']); amountUse = { kind: 'independent' }; }
  else if (Object.hasOwn(use ?? {}, 'path')) {
    // Compatibility for the existing opt-in V3 source: owner concept only.
    shape(use, ['kind', 'path']); list(use.path, OWN_PAYROLL_LIMITS.depth, true);
    require(use.kind === 'embedded' && use.path.every(k => childKeys.includes(k)), 'QUANTITY_EMBED_INVALID', 'La cantidad usada requiere la ruta explícita al importe.');
    amountUse = { kind: 'embedded', path: [...use.path] };
  } else {
    shape(use, ['kind', 'uses']); list(use.uses, OWN_PAYROLL_LIMITS.rules * OWN_PAYROLL_LIMITS.nodes);
    require(use.kind === 'embedded', 'QUANTITY_EMBED_INVALID', 'El uso monetario debe declararse como incrustado.');
    const uses = use.uses.map(u => {
      shape(u, ['rule', 'path']); list(u.path, OWN_PAYROLL_LIMITS.depth, true);
      require(typeof u.rule === 'string' && /^(?:concept|auxiliary):[0-9]{1,9}$/.test(u.rule) && u.path.every(k => childKeys.includes(k)), 'QUANTITY_EMBED_INVALID', 'Cada uso requiere identidad del mismo convenio y ruta explícitas.');
      return { rule: u.rule, path: [...u.path] };
    }).sort((a, b) => order(a.rule, b.rule) || order(a.path.join('.'), b.path.join('.')));
    require(new Set(uses.map(u => u.rule + ':' + u.path.join('.'))).size === uses.length, 'QUANTITY_EMBED_INVALID', 'No se repite la misma declaración de uso.');
    amountUse = { kind: 'embedded', uses };
  }
  return { ...value, liquidationTypes: [...value.liquidationTypes].sort(), rounding, expression: normalizePayrollExpression(value.expression, { limits: OWN_PAYROLL_LIMITS, namespaced: true, typedConditions, quantities: true }), amountUse };
}
function moneyInput(input) {
  const { namespaceVersion: _ns, quantityPhasesVersion: _qv, quantityPhases: _qp, ...money } = input;
  return { ...money, version: 'own-payroll-input.v2' };
}
export function normalizeOwnPayrollQuantityInput(raw) {
  const input = inert(raw), conditions = ownPayrollConditions(input), familyFacts = ownPayrollFamilyFacts(input), typedConditions = conditions || familyFacts;
  shape(input, ['version', 'namespaceVersion', 'period', 'liquidationType', 'selection', 'sourceVersions', 'populationComplete', 'totalsPrecision', 'employees', 'rules', 'quantityPhasesVersion', 'quantityPhases', ...(conditions ? ['salaryConditionsVersion'] : []), ...(familyFacts ? ['familyPayrollFactsVersion'] : []),...familyTariffInputFields(input)]);
  require(input.version === OWN_PAYROLL_QUANTITY_INPUT_VERSION && input.namespaceVersion === OWN_PAYROLL_NAMESPACE_VERSION && input.quantityPhasesVersion === OWN_PAYROLL_QUANTITY_PHASES_VERSION, 'QUANTITY_VERSION_INVALID', 'Las cantidades nuevas requieren su versión y referencias separadas explícitas.');
  list(input.quantityPhases, OWN_PAYROLL_LIMITS.rules);
  const monetary = normalizeOwnPayrollInput(moneyInput(input)), phases = input.quantityPhases.map(p => normalizePhase(p, typedConditions)).sort((a, b) => order(phaseKey(a), phaseKey(b)));
  if(ownPayrollFamilyTariffs(input))validateNoTariffQuantityInputs(phases,monetary.familyTariffCapture.bindings);
  for (let i = 0; i < phases.length; i++) for (let j = i + 1; j < phases.length; j++) {
    const a = phases[i], b = phases[j];
    if (a.agreementCode === b.agreementCode && a.code === b.code && a.liquidationTypes.some(t => b.liquidationTypes.includes(t))) require((a.validUntil ?? '9999-12') < b.validFrom || (b.validUntil ?? '9999-12') < a.validFrom, 'QUANTITY_PHASE_OVERLAP', 'Hay cantidades superpuestas para el mismo convenio, concepto y tipo.');
  }
  const result = { ...monetary, version: OWN_PAYROLL_QUANTITY_INPUT_VERSION, namespaceVersion: OWN_PAYROLL_NAMESPACE_VERSION, quantityPhasesVersion: OWN_PAYROLL_QUANTITY_PHASES_VERSION, quantityPhases: phases };
  require(new TextEncoder().encode(salarySerialized(result)).byteLength <= 8 * 1024 * 1024, 'SNAPSHOT_LIMIT', 'El conjunto completo supera la capacidad; no se parte ni se recorta.');
  return result;
}

/** Shared standalone phase boundary; never evaluates or creates an employee. */
export function normalizeOwnPayrollQuantityPhase(raw, { typedConditions = false } = {}) {
  require(typeof typedConditions === 'boolean', 'CONTRACT_INVALID', 'La versión de condiciones debe declararse.');
  return normalizePhase(inert(raw), typedConditions);
}
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const ruleIdentity = rule => (rule.nature === 'auxiliary' ? 'auxiliary:' : 'concept:') + rule.code;

/** Static plan for one agreement/period/type. No employee, result row or arithmetic evaluation.
 * Callers validate the monetary programme canonically. Compilation consumes the shared budget.
 * All active branches are visited; embedded declarations are checked once, never per employee.
 */
export function compileOwnPayrollQuantityPlan(raw) {
  require(raw && typeof raw === 'object', 'CONTRACT_INVALID', 'El plan requiere datos canónicos explícitos.');
  shape(raw, ['rules', 'quantityPhases', 'agreementCode', 'period', 'liquidationType', 'consume', ...(Object.hasOwn(raw, 'typedConditions') ? ['typedConditions'] : [])]);
  require(typeof raw.consume === 'function', 'CONTRACT_INVALID', 'La compilación requiere su presupuesto explícito.');
  const consume = raw.consume;
  const data = inert({ rules: raw.rules, quantityPhases: raw.quantityPhases, agreementCode: raw.agreementCode, period: raw.period, liquidationType: raw.liquidationType, typedConditions: Object.hasOwn(raw, 'typedConditions') ? raw.typedConditions : false });
  require(code(data.agreementCode) && month(data.period) && types.has(data.liquidationType) && typeof data.typedConditions === 'boolean', 'QUANTITY_PHASE_INVALID', 'El plan necesita convenio, período y tipo explícitos.');
  list(data.quantityPhases, OWN_PAYROLL_LIMITS.rules, true);
  const rules = normalizeOwnPayrollRules(data.rules, { namespaced: true, typedConditions: data.typedConditions }).filter(r => r.agreementCode === data.agreementCode && active(r, data.period, data.liquidationType));
  const phases = data.quantityPhases.map(p => normalizePhase(p, data.typedConditions)).filter(p => p.agreementCode === data.agreementCode && active(p, data.period, data.liquidationType)).sort((a, b) => order(phaseKey(a), phaseKey(b)));
  const rulesById = new Map(rules.map(r => [ruleIdentity(r), r])), byCode = new Map(), compiled = new Map(), visiting = new Set();
  for (const phase of phases) { require(!byCode.has(phase.code), 'QUANTITY_PHASE_OVERLAP', 'Hay cantidades activas superpuestas.'); byCode.set(phase.code, phase); }
  function compile(phaseCode) {
    require(byCode.has(phaseCode), 'QUANTITY_PHASE_MISSING', 'Falta una cantidad referenciada vigente del mismo convenio.');
    require(!visiting.has(phaseCode), 'QUANTITY_PHASE_CYCLE', 'Las cantidades forman un ciclo.');
    if (compiled.has(phaseCode)) return compiled.get(phaseCode);
    require(visiting.size < OWN_PAYROLL_LIMITS.dependencyDepth, 'DEPENDENCY_LIMIT', 'La cadena de cantidades supera la capacidad declarada.');
    const phase = byCode.get(phaseCode), dependencies = new Set();
    require(rulesById.has('concept:' + phaseCode), 'QUANTITY_OWNER_MISSING', 'La fase requiere un concepto calculado propio vigente; no crea una fila pagable.');
    visiting.add(phaseCode);
    const unit = payrollExpressionUnit(phase.expression, {
      consume,
      referenceUnit: n => { const id = n.op + ':' + n.code, rule = rulesById.get(id); dependencies.add(id); require(rule, 'QUANTITY_REFERENCE_MISSING', 'Falta el concepto o auxiliar de la cantidad en este convenio.'); return rule.unit; },
      quantityUnit: n => { dependencies.add('quantity:' + n.code); return compile(n.code).unit; }
    });
    require(unit === phase.unit, 'UNIT_MISMATCH', 'La unidad de la cantidad no coincide con la definición.');
    const value = { phase, unit, dependencies: [...dependencies].sort() };
    visiting.delete(phaseCode); compiled.set(phaseCode, value); return value;
  }
  for (const phase of phases) compile(phase.code);
  function expand(n, stack, depth = 0, budget = { nodes: 0 }) {
    consume();
    require(depth <= OWN_PAYROLL_LIMITS.depth && ++budget.nodes <= OWN_PAYROLL_LIMITS.nodes, 'EXPRESSION_LIMIT', 'La cantidad expandida supera la capacidad del árbol monetario.');
    if (n.op === 'quantity') {
      require(!stack.includes(n.code) && byCode.has(n.code), 'QUANTITY_PHASE_CYCLE', 'La cantidad expandida conserva un ciclo o referencia ausente.');
      const p = byCode.get(n.code), value = expand(p.expression, [...stack, n.code], depth + (p.stage === 'rounded' ? 1 : 0), budget);
      if (p.stage === 'rounded') { consume(); require(++budget.nodes <= OWN_PAYROLL_LIMITS.nodes, 'EXPRESSION_LIMIT', 'La cantidad expandida supera la capacidad del árbol monetario.'); return { op: 'round', value, rounding: { ...p.rounding } }; }
      return value;
    }
    return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, childKeys.includes(k) && v && typeof v === 'object' ? expand(v, stack, depth + 1, budget) : structuredClone(v)]));
  }
  for (const { phase } of compiled.values()) if (phase.amountUse.kind === 'embedded') {
    const uses = Object.hasOwn(phase.amountUse, 'uses') ? phase.amountUse.uses : [{ rule: 'concept:' + phase.code, path: phase.amountUse.path }];
    const expression = expand(phase.expression, [phase.code]), expected = phase.stage === 'rounded' ? { op: 'round', value: expression, rounding: phase.rounding } : expression;
    const checked = normalizePayrollExpression(expected, { limits: OWN_PAYROLL_LIMITS, namespaced: true, typedConditions: data.typedConditions });
    for (const use of uses) {
      const rule = rulesById.get(use.rule); require(rule, 'QUANTITY_REFERENCE_MISSING', 'El destino de uso no existe en el mismo convenio, período y tipo.');
      let node = rule.expression;
      for (const segment of use.path) {
        consume();
        require(node && typeof node === 'object' && Object.hasOwn(node, segment), 'QUANTITY_EMBED_INVALID', 'Cambió la ruta de la cantidad dentro del importe.');
        require(node.op !== 'round' && !(node.op === 'choose' && ['then', 'else'].includes(segment)), 'QUANTITY_EMBED_ANCESTOR', 'El uso declarado atraviesa un redondeo o una alternativa condicional no declarados.');
        node = node[segment];
      }
      require(salarySerialized(node) === salarySerialized(checked), 'QUANTITY_EMBED_CHANGED', 'El destino no contiene la cantidad declarada con su etapa exacta.');
    }
  }
  return freeze({ agreementCode: data.agreementCode, period: data.period, liquidationType: data.liquidationType, phases, compiled: [...compiled.values()] });
}

export function calculateOwnPayrollWithQuantities(raw) {
  const input = normalizeOwnPayrollQuantityInput(raw), monetary = moneyInput(input), { result, metrics } = calculateOwnPayrollMetered(monetary);
  const selected = new Set(result.employeeTotals.map(e => e.contractId)), quantities = [];
  let operations = metrics.compilation + metrics.evaluation, expectedCount = 0;
  require(Number.isSafeInteger(operations) && operations <= OWN_PAYROLL_LIMITS.operations, 'COMPUTATION_LIMIT', 'El cálculo completo supera la capacidad declarada; no se entrega un resultado parcial.');
  const consume = () => require(++operations <= OWN_PAYROLL_LIMITS.operations, 'COMPUTATION_LIMIT', 'El cálculo completo supera la capacidad declarada; no se entrega un resultado parcial.');
  // Index each result row once. Compilation and embedding verification are shared
  // by all selected employees of the same agreement; only values/traces are local.
  const rowsByContract = new Map(), ruleGroups = new Map(), phaseGroups = new Map(), plans = new Map();
  for (const row of result.rows) { const group = rowsByContract.get(row.contractId) ?? new Map(); group.set((row.nature === 'auxiliary' ? 'auxiliary:' : 'concept:') + row.conceptCode, row); rowsByContract.set(row.contractId, group); }
  for (const rule of monetary.rules) if (active(rule, input.period, input.liquidationType)) { const group = ruleGroups.get(rule.agreementCode) ?? []; group.push(rule); ruleGroups.set(rule.agreementCode, group); }
  for (const phase of input.quantityPhases) if (active(phase, input.period, input.liquidationType)) { const group = phaseGroups.get(phase.agreementCode) ?? []; group.push(phase); phaseGroups.set(phase.agreementCode, group); }
  const employees = monetary.employees.filter(e => selected.has(e.contractId));
  for (const agreementCode of new Set(employees.map(e => e.agreementCode))) {
    const plan = compileOwnPayrollQuantityPlan({ rules: ruleGroups.get(agreementCode), quantityPhases: phaseGroups.get(agreementCode) ?? [], agreementCode, period: input.period, liquidationType: input.liquidationType, typedConditions: ownPayrollConditions(input) || ownPayrollFamilyFacts(input), consume });
    plans.set(agreementCode, { phases: plan.phases, compiled: new Map(plan.compiled.map(c => [c.phase.code, c])) });
  }
  for (const employee of employees) {
    const { phases, compiled } = plans.get(employee.agreementCode), inputs = new Map(employee.inputs.map(i => [i.key, i])), rows = rowsByContract.get(employee.contractId), values = new Map();
    expectedCount += phases.length;
    const referenceRow = n => { const row = rows?.get(n.op + ':' + n.code); require(row && row.agreementCode === employee.agreementCode, 'QUANTITY_REFERENCE_MISSING', 'Falta el concepto o auxiliar original de la cantidad en este convenio.'); return row; };
    function evaluate(phaseCode) {
      if (values.has(phaseCode)) return values.get(phaseCode);
      const { phase, dependencies } = compiled.get(phaseCode), trace = [];
      const exact = evaluatePayrollExpression(phase.expression, {
        consume, inputs, trace,
        reference: n => { const row = referenceRow(n); return { exact: numeric(row.exactValue), value: decimal(row.amount) }; },
        quantity: n => evaluate(n.code), referenceName: n => n.op + ':' + n.code
      });
      const rounded = phase.stage === 'rounded' ? quantize(exact, phase.rounding) : null, value = rounded?.value ?? exact;
      const row = { contractId: employee.contractId, employeeNumber: employee.employeeNumber, agreementCode: employee.agreementCode, departmentCode: employee.departmentCode, conceptCode: phase.code, unit: phase.unit, stage: phase.stage, rounding: phase.rounding, exactValue: exactEvidence(exact), value: exactEvidence(value), decimalValue: rounded?.amount ?? null, sourceReference: phase.sourceReference, sourceSha256: phase.sourceSha256, amountUse: structuredClone(phase.amountUse), dependencies, trace };
      const calculated = { exact, value, stage: phase.stage, row }; values.set(phaseCode, calculated); return calculated;
    }
    for (const phase of phases) quantities.push(evaluate(phase.code).row);
  }
  require(quantities.length === expectedCount, 'QUANTITY_INCOMPLETE', 'La auditoría no conserva todas las cantidades seleccionadas.');
  quantities.sort((a, b) => order(a.contractId, b.contractId) || order(a.conceptCode, b.conceptCode));
  const complete = { ...result, version: OWN_PAYROLL_QUANTITY_RESULT_VERSION, quantityCount: quantities.length, quantities };
  require(new TextEncoder().encode(salarySerialized(complete)).byteLength <= 32 * 1024 * 1024, 'RESULT_LIMIT', 'El resultado completo supera la capacidad; no se entrega parcialmente.');
  return complete;
}
