import { normalizePayrollExpression, payrollExpressionUnit, evaluatePayrollExpression } from './own-payroll-expression.js';
import { decimal, rational, exactAdd, exactSubtract, exactMultiply, exactDivide, exactCompare, exactEvidence, quantize, roundingPolicy, payrollRequire as require } from './own-payroll-exact.js';
import {ownPayrollConditions,conditionUnit,conditionValue} from './own-payroll-conditions.js';
import {ownPayrollFamilyFacts} from './own-payroll-family-facts.js';
import {ownPayrollFamilyTariffs,familyTariffInputFields,normalizeFamilyTariffCapture,createFamilyTariffInputResolver} from './own-payroll-family-tariffs.js';

export const OWN_PAYROLL_INPUT_VERSION = 'own-payroll-input.v1';
export const OWN_PAYROLL_RESULT_VERSION = 'own-payroll-result.v1';
export const OWN_PAYROLL_NAMESPACED_INPUT_VERSION = 'own-payroll-input.v2';
export const OWN_PAYROLL_NAMESPACED_RESULT_VERSION = 'own-payroll-result.v2';
export const OWN_PAYROLL_NAMESPACE_VERSION = 'own-payroll-namespaces.v2';
export const ownPayrollRuleIdentity = (r, namespaced = false) => namespaced ? `${r.nature === 'auxiliary' ? 'auxiliary' : 'concept'}:${r.code}` : r.code;
const referenceIdentity = (n, namespaced) => namespaced ? `${n.op}:${n.code}` : n.code;
export const OWN_PAYROLL_LIMITS = Object.freeze({ employees: 10000, rules: 1000, inputs: 512, nodes: 256, depth: 32, dependencyDepth: 64, operations: 3000000 });
const units = new Set(['money', 'hours', 'minutes', 'days', 'percent', 'units', 'coefficient']);
const natures = new Set(['remuneration', 'non_remuneration', 'deduction', 'employer_contribution', 'auxiliary']);
const types = new Set(['monthly', 'first_fortnight', 'sac', 'vacation', 'supplementary', 'final', 'other']);
const uuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
export const ownPayrollEmployeeNumber = v => typeof v === 'string' && [...v].length >= 1 && [...v].length <= 64 && !/[\x00-\x1f\x7f-\x9f]/.test(v);
const key = v => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const month = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const reference = v => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= 3 && v.length <= 180 && !/[<>\u0000-\u001f\u007f]/.test(v);
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function shape(v, keys) {
  require(v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).every(k => typeof k === 'string') && Reflect.ownKeys(v).sort().join('|') === [...keys].sort().join('|') && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value') && d.enumerable), 'CONTRACT_INVALID', 'La entrada contiene campos omitidos o no admitidos.');
}
function list(v, maximum, allowEmpty = false) {
  require(Array.isArray(v) && v.length <= maximum && (allowEmpty || v.length > 0), 'QUANTITY_LIMIT', 'El conjunto está vacío o supera la capacidad declarada. No se omiten filas.');
  require(Reflect.ownKeys(v).length === v.length + 1 && Array.from({ length: v.length }, (_, i) => Object.getOwnPropertyDescriptor(v, String(i))).every(d => d && Object.hasOwn(d, 'value')), 'CONTRACT_INVALID', 'El conjunto no puede tener huecos, propiedades adicionales ni accesores.');
}
function unique(values, error = 'DUPLICATE') { require(new Set(values).size === values.length, error, 'Hay una referencia repetida o ambigua.'); }
function expression(node, depth = 0, counter = { nodes: 0 }, namespaced = false, typedConditions = false) {
  return normalizePayrollExpression(node, { limits: OWN_PAYROLL_LIMITS, namespaced, typedConditions }, depth, counter);
}
export function normalizeOwnPayrollInput(input) {
  const conditions=ownPayrollConditions(input), familyFacts=ownPayrollFamilyFacts(input), typedConditions=conditions||familyFacts;
  shape(input, ['version', 'period', 'liquidationType', 'selection', 'sourceVersions', 'populationComplete', 'totalsPrecision', 'employees', 'rules',...(conditions?['salaryConditionsVersion']:[]),...(familyFacts?['familyPayrollFactsVersion']:[]),...familyTariffInputFields(input)]);
  require(!ownPayrollFamilyTariffs(input)||familyFacts,'FAMILY_TARIFF_FACT_SOURCE_REQUIRED','El productor usa exclusivamente la captura familiar propia versionada.');
  require(!typedConditions||input.version===OWN_PAYROLL_NAMESPACED_INPUT_VERSION,'CONTRACT_INVALID','Las condiciones propias requieren referencias separadas y su versión explícita.');
  require([OWN_PAYROLL_INPUT_VERSION, OWN_PAYROLL_NAMESPACED_INPUT_VERSION].includes(input.version) && month(input.period) && types.has(input.liquidationType) && input.populationComplete === true && Number.isInteger(input.totalsPrecision) && input.totalsPrecision >= 0 && input.totalsPrecision <= 8, 'SCOPE_INVALID', 'Declarar período, tipo, población completa y precisión de totales es obligatorio.');
  shape(input.sourceVersions, ['population', 'rules', 'novelties']); require(Object.values(input.sourceVersions).every(hash), 'SOURCE_VERSION_REQUIRED', 'Cada fuente necesita una versión exacta.');
  shape(input.selection, ['kind', 'values']); require(['all', 'contracts', 'agreements', 'departments'].includes(input.selection.kind), 'SELECTION_INVALID', 'La población debe elegirse expresamente.');
  list(input.selection.values, OWN_PAYROLL_LIMITS.employees, input.selection.kind === 'all');
  require(input.selection.kind === 'all' ? input.selection.values.length === 0 : input.selection.values.every(input.selection.kind === 'contracts' ? uuid : code), 'SELECTION_INVALID', 'Las referencias del alcance son inválidas.'); unique(input.selection.values);
  list(input.employees, OWN_PAYROLL_LIMITS.employees);
  const employees = input.employees.map(e => {
    shape(e, ['contractId', 'employeeNumber', 'agreementCode', 'departmentCode', 'inputs']);
    require(uuid(e.contractId) && ownPayrollEmployeeNumber(e.employeeNumber) && code(e.agreementCode) && code(e.departmentCode), 'EMPLOYEE_INVALID', 'El contrato y sus referencias deben ser exactos.');
    list(e.inputs, OWN_PAYROLL_LIMITS.inputs, true);
    const inputs = e.inputs.map(i => { shape(i, ['key', 'unit', 'value', 'sourceReference']); require(key(i.key) && (units.has(i.unit)||typedConditions&&conditionUnit(i.unit)) && reference(i.sourceReference), 'INPUT_INVALID', 'Cada entrada necesita clave, unidad y procedencia.'); if (i.value !== null) {if(conditionUnit(i.unit))require(conditionValue(i.unit,i.value),'INPUT_INVALID','El código o booleano debe conservar su tipo; no se convierte en una cantidad.');else decimal(i.value);} return { ...i }; }).sort((a, b) => order(a.key, b.key));
    unique(inputs.map(i => i.key)); return { ...e, inputs };
  }).sort((a, b) => order(a.contractId, b.contractId)); unique(employees.map(e => e.contractId));
  const rules = normalizeOwnPayrollRules(input.rules, { namespaced: input.version === OWN_PAYROLL_NAMESPACED_INPUT_VERSION, typedConditions });
  const familyTariffCapture=ownPayrollFamilyTariffs(input)?normalizeFamilyTariffCapture(input.familyTariffCapture,employees,input.period,input.liquidationType):null;
  if(familyTariffCapture)require(familyTariffCapture.policies.every(p=>p.version===input.familyTariffsVersion),'FAMILY_TARIFF_VERSION_MISMATCH','La captura debe conservar la versión de la política declarada.');
  return { ...input,...(familyTariffCapture?{familyTariffCapture}:{}), selection: { kind: input.selection.kind, values: [...input.selection.values].sort() }, sourceVersions: { ...input.sourceVersions }, employees, rules };
}
export function normalizeOwnPayrollRules(raw, { namespaced = false, typedConditions = false } = {}) {
  require(!typedConditions||namespaced,'CONTRACT_INVALID','Las condiciones propias requieren referencias separadas.');
  list(raw, OWN_PAYROLL_LIMITS.rules);
  const rules = raw.map(r => {
    shape(r, ['code', 'agreementCode', 'nature', 'unit', 'validFrom', 'validUntil', 'liquidationTypes', 'ruleReference', 'rounding', 'expression']);
    require(code(r.code) && code(r.agreementCode) && natures.has(r.nature) && units.has(r.unit) && (r.nature === 'auxiliary' || r.unit === 'money') && month(r.validFrom) && (r.validUntil === null || month(r.validUntil) && r.validUntil >= r.validFrom) && reference(r.ruleReference), 'RULE_INVALID', 'La regla necesita naturaleza, unidad, vigencia y respaldo explícitos.');
    list(r.liquidationTypes, types.size); require(r.liquidationTypes.every(t => types.has(t)), 'RULE_INVALID', 'El tipo de liquidación no está admitido.'); unique(r.liquidationTypes);
    return { ...r, liquidationTypes: [...r.liquidationTypes].sort(), rounding: roundingPolicy(r.rounding), expression: expression(r.expression, 0, { nodes: 0 }, namespaced, typedConditions) };
  }).sort((a, b) => order(a.agreementCode, b.agreementCode) || order(a.code, b.code) || (namespaced ? order(ownPayrollRuleIdentity(a, true), ownPayrollRuleIdentity(b, true)) : 0) || order(a.validFrom, b.validFrom) || order(a.liquidationTypes.join(','), b.liquidationTypes.join(',')));
  const groups = new Map();
  for (const r of rules) for (const type of r.liquidationTypes) {
    const id = `${r.agreementCode}:${ownPayrollRuleIdentity(r, namespaced)}:${type}`, previous = groups.get(id) ?? [];
    require(previous.every(p => (r.validUntil ?? '9999-12') < p.validFrom || (p.validUntil ?? '9999-12') < r.validFrom), 'RULE_OVERLAP', 'Hay reglas superpuestas para el mismo convenio, concepto y tipo.'); previous.push(r); groups.set(id, previous);
  }
  return rules;
}
function compileRules(rules, budget = { operations: 0 }, namespaced = false) {
  const map = new Map(rules.map(r => [ownPayrollRuleIdentity(r, namespaced), r])), compiled = new Map(), visiting = new Set();
  function compile(code) {
    require(map.has(code), 'RULE_MISSING', 'Falta una regla referenciada vigente para este convenio y tipo.');
    require(!visiting.has(code), 'RULE_CYCLE', 'Las reglas forman un ciclo.');
    if (compiled.has(code)) return compiled.get(code);
    require(visiting.size < OWN_PAYROLL_LIMITS.dependencyDepth, 'DEPENDENCY_LIMIT', 'La cadena de dependencias supera la capacidad declarada; no se omiten conceptos.');
    visiting.add(code); const dependencies = new Set();
    const r = map.get(code), computedUnit = payrollExpressionUnit(r.expression, {
      consume: () => require(++budget.operations <= OWN_PAYROLL_LIMITS.operations, 'EXPRESSION_LIMIT', 'La revisión supera su capacidad de operaciones. No se omiten reglas.'),
      referenceUnit: n => { const id = referenceIdentity(n, namespaced); dependencies.add(id); return compile(id).unit; }
    });
    require(computedUnit === r.unit, 'UNIT_MISMATCH', 'La unidad del resultado no coincide con la definición.');
    const result = { rule: r, unit: r.unit, dependencies: [...dependencies].sort() }; visiting.delete(code); compiled.set(code, result); return result;
  }
  for (const code of map.keys()) compile(code);
  return compiled;
}
export function validateOwnPayrollRulePeriods(raw, { namespaced = false, typedConditions = false } = {}) {
  const rules = normalizeOwnPayrollRules(raw, { namespaced, typedConditions }), groups = new Map();
  const budget = { operations: 0 };
  let checks = 0;
  const nextMonth = m => { const [y, n] = m.split('-').map(Number); return String(n === 12 ? y + 1 : y) + '-' + String(n === 12 ? 1 : n + 1).padStart(2, '0'); };
  for (const rule of rules) for (const type of rule.liquidationTypes) { const k = `${rule.agreementCode}:${type}`, group = groups.get(k) ?? []; group.push(rule); groups.set(k, group); }
  for (const group of groups.values()) {
    const boundaries = [...new Set(group.flatMap(r => [r.validFrom, ...(r.validUntil ? [nextMonth(r.validUntil)] : [])]))].sort();
    for (const period of boundaries) {
      const active = group.filter(r => r.validFrom <= period && (r.validUntil === null || r.validUntil >= period));
      checks += active.length;
      require(checks <= 50000, 'EXPRESSION_LIMIT', 'El programa supera la capacidad de revisión de vigencias. No se omiten reglas.');
      compileRules(active, budget, namespaced);
    }
  }
  return rules;
}
function calculateOwnPayrollInternal(raw, metrics = null) {
  const snapshot = normalizeOwnPayrollInput(raw), { period, liquidationType, selection } = snapshot;
  const namespaced = snapshot.version === OWN_PAYROLL_NAMESPACED_INPUT_VERSION;
  const selectField = { contracts: 'contractId', agreements: 'agreementCode', departments: 'departmentCode' }[selection.kind];
  const selected = snapshot.employees.filter(e => selection.kind === 'all' || selection.values.includes(e[selectField]));
  require(selected.length > 0 && (selection.kind === 'all' || selection.values.every(v => selected.some(e => e[selectField] === v))), 'POPULATION_MISSING', 'No se pudo verificar la totalidad de la población elegida.');
  const activeRules = snapshot.rules.filter(r => r.validFrom <= period && (r.validUntil === null || r.validUntil >= period) && r.liquidationTypes.includes(liquidationType));
  const agreements = new Map(); for (const r of activeRules) { const group = agreements.get(r.agreementCode) ?? []; group.push(r); agreements.set(r.agreementCode, group); }
  const compiled = new Map([...agreements].map(([code, group]) => {
    const budget = { operations: 0 }, rules = compileRules(group, budget, namespaced);
    if (metrics) metrics.compilation += budget.operations;
    return [code, rules];
  }));
  let operations = 0, resultBytes = 0; const rows = [], employeeTotals = [],familyTariffDecisions=[];
  for (const employee of selected) {
    const rules = compiled.get(employee.agreementCode);
    require(rules && [...rules.values()].some(r => ['remuneration', 'non_remuneration'].includes(r.rule.nature)), 'PAY_RULE_MISSING', 'Faltan reglas de haberes vigentes para un contrato del conjunto.');
    const consume=()=>require(++operations <= OWN_PAYROLL_LIMITS.operations, 'COMPUTATION_LIMIT', 'El cálculo completo supera la capacidad declarada; no se entrega un resultado parcial.');
    const tariffResolver=ownPayrollFamilyTariffs(snapshot)?createFamilyTariffInputResolver(snapshot.familyTariffCapture,employee,consume):null;
    const values = new Map(), inputs = tariffResolver?.inputs??new Map(employee.inputs.map(i => [i.key, i]));
    function concept(code) {
      if (values.has(code)) return values.get(code);
      const { rule, dependencies } = rules.get(code), trace = [];
      const evaluate = expression => evaluatePayrollExpression(expression, {
        consume,
        inputs, reference: n => concept(referenceIdentity(n, namespaced)),
        referenceName: n => referenceIdentity(n, namespaced), trace
      });
      const exact = evaluate(rule.expression), rounded = quantize(exact, rule.rounding);
      const calculated = { value: rounded.value, exact, row: { contractId: employee.contractId, employeeNumber: employee.employeeNumber, agreementCode: employee.agreementCode, departmentCode: employee.departmentCode, conceptCode: rule.code, nature: rule.nature, unit: rule.unit, amount: rounded.amount, exactValue: exactEvidence(exact), rounding: { ...rule.rounding }, ruleReference: rule.ruleReference, dependencies, trace } }; values.set(code, calculated); return calculated;
    }
    for (const code of [...rules.keys()].sort()) concept(code);
    if(tariffResolver)familyTariffDecisions.push(...tariffResolver.decisions());
    const totals = { remuneration: rational(0n), non_remuneration: rational(0n), deduction: rational(0n), employer_contribution: rational(0n) };
    for (const calculated of values.values()) {
      resultBytes += new TextEncoder().encode(JSON.stringify(calculated.row)).byteLength;
      require(resultBytes <= 32 * 1024 * 1024, 'RESULT_LIMIT', 'El resultado completo supera la capacidad; no se entrega parcialmente.');
      rows.push(calculated.row); if (calculated.row.nature !== 'auxiliary') totals[calculated.row.nature] = exactAdd(totals[calculated.row.nature], calculated.value);
    }
    const gross = exactAdd(totals.remuneration, totals.non_remuneration), net = exactSubtract(gross, totals.deduction);
    employeeTotals.push({ contractId: employee.contractId, ...Object.fromEntries(Object.entries({ ...totals, gross, net }).map(([k, v]) => [k, quantize(v, { precision: snapshot.totalsPrecision, mode: 'exact' }).amount])) });
  }
  rows.sort((a, b) => order(a.contractId, b.contractId) || order(a.conceptCode, b.conceptCode) || (namespaced ? order(a.nature, b.nature) : 0));
  if (metrics) metrics.evaluation = operations;
  const result={ version: namespaced ? OWN_PAYROLL_NAMESPACED_RESULT_VERSION : OWN_PAYROLL_RESULT_VERSION, period, liquidationType, selection: { kind: selection.kind, values: [...selection.values] }, sourceVersions: { ...snapshot.sourceVersions }, employeeCount: selected.length, rowCount: rows.length, rows, employeeTotals, payrollCalculated: true, payrollPosted: false, municipalApprovalVerified: false, paymentExecuted: false };
  if(ownPayrollFamilyTariffs(snapshot)){Object.assign(result,{familyTariffsVersion:snapshot.familyTariffsVersion,familyTariffDecisionCount:familyTariffDecisions.length,familyTariffDecisions});require(new TextEncoder().encode(JSON.stringify(result)).byteLength<=32*1024*1024,'RESULT_LIMIT','La evidencia completa de tarifas excede el límite; no se entrega un subconjunto.');}
  return result;
}


// The historical API keeps the same output; only the new pure quantity core
// requests metering. Metrics never enter a stored V1/V2 input or result.
export function calculateOwnPayroll(raw) { return calculateOwnPayrollInternal(raw); }
export function calculateOwnPayrollMetered(raw) {
  const metrics = { compilation: 0, evaluation: 0 };
  const result = calculateOwnPayrollInternal(raw, metrics);
  return { result, metrics };
}
