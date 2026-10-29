import { OwnPayrollError, decimal, rational, exactAdd, exactSubtract, exactMultiply, exactDivide, exactCompare, exactEvidence, quantize, roundingPolicy, payrollRequire as require } from './own-payroll-exact.js';
import {ownPayrollConditions,conditionUnit,conditionValue} from './own-payroll-conditions.js';

export const OWN_PAYROLL_INPUT_VERSION = 'own-payroll-input.v1';
export const OWN_PAYROLL_RESULT_VERSION = 'own-payroll-result.v1';
export const OWN_PAYROLL_NAMESPACED_INPUT_VERSION = 'own-payroll-input.v2';
export const OWN_PAYROLL_NAMESPACED_RESULT_VERSION = 'own-payroll-result.v2';
export const OWN_PAYROLL_NAMESPACE_VERSION = 'own-payroll-namespaces.v2';
export const ownPayrollRuleIdentity = (r, namespaced = false) => namespaced ? `${r.nature === 'auxiliary' ? 'auxiliary' : 'concept'}:${r.code}` : r.code;
const referenceIdentity = (n, namespaced) => namespaced ? `${n.op}:${n.code}` : n.code;
export const OWN_PAYROLL_LIMITS = Object.freeze({ employees: 10000, rules: 1000, inputs: 128, nodes: 256, depth: 32, dependencyDepth: 64, operations: 3000000 });
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
const quantityReference = v => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= 1 && v.length <= 180 && !/[<>\u0000-\u001f\u007f]/.test(v);
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function shape(v, keys, error = 'CONTRACT_INVALID') {
  require(v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).every(k => typeof k === 'string') && Reflect.ownKeys(v).sort().join('|') === [...keys].sort().join('|') && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value') && d.enumerable), error, 'La entrada contiene campos omitidos o no admitidos.');
}
function list(v, maximum, allowEmpty = false) {
  require(Array.isArray(v) && v.length <= maximum && (allowEmpty || v.length > 0), 'QUANTITY_LIMIT', 'El conjunto está vacío o supera la capacidad declarada. No se omiten filas.');
  require(Reflect.ownKeys(v).length === v.length + 1 && Array.from({ length: v.length }, (_, i) => Object.getOwnPropertyDescriptor(v, String(i))).every(d => d && Object.hasOwn(d, 'value')), 'CONTRACT_INVALID', 'El conjunto no puede tener huecos, propiedades adicionales ni accesores.');
}
function unique(values, error = 'DUPLICATE') { require(new Set(values).size === values.length, error, 'Hay una referencia repetida o ambigua.'); }
function expression(node, depth = 0, counter = { nodes: 0 }, namespaced = false, typedConditions = false, fixedForced = false) {
  require(depth <= OWN_PAYROLL_LIMITS.depth && ++counter.nodes <= OWN_PAYROLL_LIMITS.nodes, 'EXPRESSION_LIMIT', 'La regla supera el límite de profundidad u operaciones declaradas.');
  require(node && typeof node === 'object' && Object.getOwnPropertyDescriptor(node, 'op')?.value, 'EXPRESSION_INVALID', 'La operación de la regla no es válida.');
  const child = v => expression(v, depth + 1, counter, namespaced, typedConditions, fixedForced);
  if (node.op === 'literal') { shape(node, ['op', 'unit', 'value']); require(units.has(node.unit), 'UNIT_INVALID', 'La unidad no está declarada.'); decimal(node.value); return { ...node }; }
  if (node.op === 'input') { shape(node, ['op', 'unit', 'key']); require(units.has(node.unit) && key(node.key), 'INPUT_INVALID', 'La entrada necesita nombre y unidad explícitos.'); return { ...node }; }
  if (node.op === 'match' && typedConditions) {
    shape(node,['op','key','type','operator','value']);
    require(key(node.key)&&conditionUnit(node.type)&&['eq','ne'].includes(node.operator)&&conditionValue(node.type,node.value),'EXPRESSION_INVALID','La condición necesita un código o booleano exacto y una igualdad explícita.');return {...node};
  }
  if (node.op === 'concept' || namespaced && node.op === 'auxiliary') { shape(node, ['op', 'code', 'stage']); require(code(node.code) && ['exact', 'rounded'].includes(node.stage), 'REFERENCE_INVALID', 'La referencia necesita concepto o auxiliar y etapa explícita, antes o después de redondear.'); return { ...node }; }
  if (node.op === 'quantity_phase' && fixedForced) {
    shape(node,['op','code','unit','stage','rounding','value','sourceReference','sourceSha256']);
    require(code(node.code)&&units.has(node.unit)&&['exact','rounded'].includes(node.stage)&&quantityReference(node.sourceReference)&&hash(node.sourceSha256),'FORCED_LINEAGE_REQUIRED','La fase de unidades necesita identidad, etapa y procedencia declaradas.');
    require(node.stage==='exact'?node.rounding===null:node.rounding!==null,'FORCED_LINEAGE_REQUIRED','La etapa de unidades debe conservar su precisión declarada.');
    return {...node,value:child(node.value),rounding:node.stage==='rounded'?roundingPolicy(node.rounding):null};
  }
  if (node.op === 'round') { shape(node, ['op', 'value', 'rounding']); return { op: node.op, value: child(node.value), rounding: roundingPolicy(node.rounding) }; }
  if (node.op === 'convert') {
    shape(node, ['op', 'value', 'unit', 'factor', 'conversionReference']);
    require(units.has(node.unit) && reference(node.conversionReference), 'CONVERSION_REQUIRED', 'La conversión requiere unidad, factor exacto y respaldo explícitos.'); decimal(node.factor);
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
export const OWN_FIXED_FORCED_AMOUNTS_VERSION='own-fixed-forced-amount.v1';
export function ownFixedForcedAmounts(p){
  const present=p&&['fixedForcedAmountsVersion','fixedForcedAmountsPolicy'].some(k=>Object.hasOwn(p,k));
  require(!present||p.fixedForcedAmountsVersion===OWN_FIXED_FORCED_AMOUNTS_VERSION&&Object.hasOwn(p,'fixedForcedAmountsPolicy'),'FORCED_POLICY_INVALID','La política de importe forzado necesita su versión y declaración completas.');
  return !!present;
}
export const ownFixedForcedRuleKey=r=>[r.agreementCode,ownPayrollRuleIdentity(r,true),r.validFrom,[...r.liquidationTypes].sort().join(',')].join(':');
export function fixedForcedExpressionSet(rules,policies){
  const targets=policies.map(p=>rules.find(r=>ownFixedForcedRuleKey(r)===p.ruleKey));
  return rules.filter(r=>targets.some(t=>t&&r.agreementCode===t.agreementCode&&r.validFrom<=(t.validUntil??'9999-12')&&t.validFrom<=(r.validUntil??'9999-12')&&r.liquidationTypes.some(k=>t.liquidationTypes.includes(k)))).map(r=>({ruleKey:ownFixedForcedRuleKey(r),expression:r.expression})).sort((a,b)=>order(a.ruleKey,b.ruleKey));
}
export function normalizeFixedForcedAmountsPolicy(raw,rules){
  require(raw&&typeof raw==='object','FORCED_POLICY_INVALID','Falta la política explícita del programa.');
  require(Object.getOwnPropertyDescriptor(raw,'quantityLineage')?.value,'FORCED_LINEAGE_REQUIRED','Falta la declaración documental revisada de las unidades.');
  shape(raw,['quantityLineage','policies'],'FORCED_POLICY_INVALID');shape(raw.quantityLineage,['version','sourceSha256','sourceControlSha256','expressionSetSha256','complete'],'FORCED_LINEAGE_REQUIRED');
  const q=raw.quantityLineage;
  require(q.version==='own-quantity-lineage-review.v1'&&q.complete===true&&[q.sourceSha256,q.sourceControlSha256,q.expressionSetSha256].every(hash),'FORCED_LINEAGE_REQUIRED','Falta la declaración documental completa de las unidades. Sus hashes no prueban la equivalencia histórica.');
  list(raw.policies,Math.min(1000,rules.length));
  const policies=raw.policies.map(p=>{
    shape(p,['ruleKey','sourceKind','sourceCode','quantityPolicy','sourceSha256','ruleReference']);
    const target=rules.find(r=>ownFixedForcedRuleKey(r)===p.ruleKey);
    require(target&&target.nature!=='auxiliary'&&target.unit==='money'&&p.sourceKind==='fixed_amount'&&p.sourceCode===target.code&&p.quantityPolicy==='reject'&&hash(p.sourceSha256)&&reference(p.ruleReference),'FORCED_POLICY_INVALID','La política sólo admite un concepto monetario y una fuente fija declarada.');
    const walk=n=>{require(!['concept','auxiliary','quantity_phase'].includes(n.op),'FORCED_POLICY_INVALID','El alcance inicial no reemplaza fórmulas con dependencias R/A/U.');for(const k of ['left','right','value','condition','then','else'])if(n[k]&&typeof n[k]==='object')walk(n[k]);};walk(target.expression);
    return {...p};
  }).sort((a,b)=>order(a.ruleKey,b.ruleKey));unique(policies.map(p=>p.ruleKey),'FORCED_POLICY_INVALID');
  return {quantityLineage:{...q},policies};
}
function normalizeForcedLedger(raw,policies){
  // Digests identify content. The authoritative adapter/SQL must rederive them
  // from complete approved rows; the pure engine cannot certify source history.
  list(raw,500,true);
  const ledger=raw.map(o=>{
    shape(o,['ruleKey','policySha256','recordId','recordVersion','proposalId','sourceRowSha256','amountCents']);
    require(policies.some(p=>p.ruleKey===o.ruleKey)&&hash(o.policySha256)&&hash(o.sourceRowSha256)&&uuid(o.recordId)&&uuid(o.proposalId)&&Number.isSafeInteger(o.recordVersion)&&o.recordVersion>0,'FORCED_SOURCE_CHANGED','El reemplazo no conserva su política o registro.');
    require(typeof o.amountCents==='string'&&/^-?(?:0|[1-9]\d{0,17})$/.test(o.amountCents)&&o.amountCents!=='-0','FORCED_AMOUNT_MISSING','El importe forzado debe estar informado en centavos exactos; cero es válido.');
    return {...o};
  }).sort((a,b)=>order(a.ruleKey,b.ruleKey)||order(a.recordId,b.recordId));unique(ledger.map(o=>o.ruleKey),'FORCED_SOURCE_COLLISION');unique(ledger.map(o=>o.recordId),'FORCED_SOURCE_COLLISION');return ledger;
}
export function normalizeOwnPayrollInput(input) {
  const typedConditions=ownPayrollConditions(input), fixedForced=ownFixedForcedAmounts(input);
  shape(input, ['version', 'period', 'liquidationType', 'selection', 'sourceVersions', 'populationComplete', 'totalsPrecision', 'employees', 'rules',...(typedConditions?['salaryConditionsVersion']:[]),...(fixedForced?['fixedForcedAmountsVersion','fixedForcedAmountsPolicy']:[])]);
  require(!typedConditions||input.version===OWN_PAYROLL_NAMESPACED_INPUT_VERSION,'CONTRACT_INVALID','Las condiciones propias requieren referencias separadas y su versión explícita.');
  require([OWN_PAYROLL_INPUT_VERSION, OWN_PAYROLL_NAMESPACED_INPUT_VERSION].includes(input.version) && month(input.period) && types.has(input.liquidationType) && input.populationComplete === true && Number.isInteger(input.totalsPrecision) && input.totalsPrecision >= 0 && input.totalsPrecision <= 8, 'SCOPE_INVALID', 'Declarar período, tipo, población completa y precisión de totales es obligatorio.');
  shape(input.sourceVersions, ['population', 'rules', 'novelties']); require(Object.values(input.sourceVersions).every(hash), 'SOURCE_VERSION_REQUIRED', 'Cada fuente necesita una versión exacta.');
  shape(input.selection, ['kind', 'values']); require(['all', 'contracts', 'agreements', 'departments'].includes(input.selection.kind), 'SELECTION_INVALID', 'La población debe elegirse expresamente.');
  list(input.selection.values, OWN_PAYROLL_LIMITS.employees, input.selection.kind === 'all');
  require(input.selection.kind === 'all' ? input.selection.values.length === 0 : input.selection.values.every(input.selection.kind === 'contracts' ? uuid : code), 'SELECTION_INVALID', 'Las referencias del alcance son inválidas.'); unique(input.selection.values);
  require(!fixedForced||input.version===OWN_PAYROLL_NAMESPACED_INPUT_VERSION,'FORCED_POLICY_INVALID','El importe forzado requiere referencias separadas.');
  const rules = normalizeOwnPayrollRules(input.rules, { namespaced: input.version === OWN_PAYROLL_NAMESPACED_INPUT_VERSION, typedConditions, fixedForced });
  const forcedPolicy=fixedForced?normalizeFixedForcedAmountsPolicy(input.fixedForcedAmountsPolicy,rules):null;
  list(input.employees, OWN_PAYROLL_LIMITS.employees);
  const employees = input.employees.map(e => {
    shape(e, ['contractId', 'employeeNumber', 'agreementCode', 'departmentCode', 'inputs',...(fixedForced?['fixedForcedAmounts']:[])]);
    require(uuid(e.contractId) && ownPayrollEmployeeNumber(e.employeeNumber) && code(e.agreementCode) && code(e.departmentCode), 'EMPLOYEE_INVALID', 'El contrato y sus referencias deben ser exactos.');
    list(e.inputs, OWN_PAYROLL_LIMITS.inputs, true);
    const inputs = e.inputs.map(i => { shape(i, ['key', 'unit', 'value', 'sourceReference']); require(key(i.key) && (units.has(i.unit)||typedConditions&&conditionUnit(i.unit)) && reference(i.sourceReference), 'INPUT_INVALID', 'Cada entrada necesita clave, unidad y procedencia.'); if (i.value !== null) {if(conditionUnit(i.unit))require(conditionValue(i.unit,i.value),'INPUT_INVALID','El código o booleano debe conservar su tipo; no se convierte en una cantidad.');else decimal(i.value);} return { ...i }; }).sort((a, b) => order(a.key, b.key));
    unique(inputs.map(i => i.key)); return { ...e, inputs,...(fixedForced?{fixedForcedAmounts:normalizeForcedLedger(e.fixedForcedAmounts,forcedPolicy.policies)}:{}) };
  }).sort((a, b) => order(a.contractId, b.contractId)); unique(employees.map(e => e.contractId));
  return { ...input, selection: { kind: input.selection.kind, values: [...input.selection.values].sort() }, sourceVersions: { ...input.sourceVersions }, employees, rules,...(fixedForced?{fixedForcedAmountsPolicy:forcedPolicy}:{}) };
}
export function normalizeOwnPayrollRules(raw, { namespaced = false, typedConditions = false, fixedForced = false } = {}) {
  require(!typedConditions||namespaced,'CONTRACT_INVALID','Las condiciones propias requieren referencias separadas.');
  list(raw, OWN_PAYROLL_LIMITS.rules);
  const rules = raw.map(r => {
    shape(r, ['code', 'agreementCode', 'nature', 'unit', 'validFrom', 'validUntil', 'liquidationTypes', 'ruleReference', 'rounding', 'expression']);
    require(code(r.code) && code(r.agreementCode) && natures.has(r.nature) && units.has(r.unit) && (r.nature === 'auxiliary' || r.unit === 'money') && month(r.validFrom) && (r.validUntil === null || month(r.validUntil) && r.validUntil >= r.validFrom) && reference(r.ruleReference), 'RULE_INVALID', 'La regla necesita naturaleza, unidad, vigencia y respaldo explícitos.');
    list(r.liquidationTypes, types.size); require(r.liquidationTypes.every(t => types.has(t)), 'RULE_INVALID', 'El tipo de liquidación no está admitido.'); unique(r.liquidationTypes);
    return { ...r, liquidationTypes: [...r.liquidationTypes].sort(), rounding: roundingPolicy(r.rounding), expression: expression(r.expression, 0, { nodes: 0 }, namespaced, typedConditions, fixedForced) };
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
    function unit(n) {
      require(++budget.operations <= OWN_PAYROLL_LIMITS.operations, 'EXPRESSION_LIMIT', 'La revisión supera su capacidad de operaciones. No se omiten reglas.');
      if (['literal', 'input'].includes(n.op)) return n.unit;
      if (n.op === 'match') return 'boolean';
      if (n.op === 'concept' || n.op === 'auxiliary') { const id = referenceIdentity(n, namespaced); dependencies.add(id); return compile(id).unit; }
      if (n.op === 'quantity_phase') {
        // Quantity identity is not an amount dependency: U of the current
        // concept must not create a monetary cycle or alias an auxiliary.
        const source=map.get(namespaced?'concept:'+n.code:n.code);
        require(source&&source.nature!=='auxiliary','FORCED_LINEAGE_REQUIRED','La fase de unidades no identifica un concepto vigente del mismo convenio y tipo.');
        const result=unit(n.value);require(result===n.unit,'UNIT_MISMATCH','La fase de unidades cambió su unidad.');return result;
      }
      if (n.op === 'round') { const result = unit(n.value); require(result !== 'boolean', 'UNIT_MISMATCH', 'No se redondea una condición.'); return result; }
      if (n.op === 'convert') { require(unit(n.value) !== 'boolean', 'UNIT_MISMATCH', 'No se convierte una condición en un importe.'); return n.unit; }
      if (n.op === 'choose') { require(unit(n.condition) === 'boolean', 'UNIT_MISMATCH', 'La condición debe ser una comparación.'); const a = unit(n.then), b = unit(n.else); require(a === b && a !== 'boolean', 'UNIT_MISMATCH', 'Ambas alternativas deben declarar la misma unidad numérica.'); return a; }
      const a = unit(n.left), b = unit(n.right);
      require(a !== 'boolean' && b !== 'boolean', 'UNIT_MISMATCH', 'Una condición no es un valor numérico.');
      if (n.op === 'multiply') { require(a === 'coefficient' || b === 'coefficient', 'CONVERSION_REQUIRED', 'El producto requiere un coeficiente explícito; no se infiere una conversión.'); return a === 'coefficient' ? b : a; }
      if (n.op === 'divide') { require(b === 'coefficient' || a === b, 'UNIT_MISMATCH', 'La división mezcla unidades incompatibles.'); return a === b ? 'coefficient' : a; }
      require(a === b, 'UNIT_MISMATCH', 'La regla mezcla unidades incompatibles.'); return n.op === 'compare' ? 'boolean' : a;
    }
    const r = map.get(code), computedUnit = unit(r.expression);
    require(computedUnit === r.unit, 'UNIT_MISMATCH', 'La unidad del resultado no coincide con la definición.');
    const result = { rule: r, unit: r.unit, dependencies: [...dependencies].sort() }; visiting.delete(code); compiled.set(code, result); return result;
  }
  for (const code of map.keys()) compile(code);
  return compiled;
}
export function validateOwnPayrollRulePeriods(raw, { namespaced = false, typedConditions = false, fixedForced = false } = {}) {
  const rules = normalizeOwnPayrollRules(raw, { namespaced, typedConditions, fixedForced }), groups = new Map();
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
// An early rounding refusal keeps where it happened (concept or total, agreement, stage) so the person can act on the
// rule. Same code, same message prefix, same policy: nothing is rounded and no identity (contract, legajo) is added.
function located(compute, context) {
  try { return compute(); }
  catch (error) {
    if (error?.code !== 'ROUNDING_NEEDED' || error.context) throw error;
    const where = context.stage === 'concept' ? `concepto ${context.conceptCode} del convenio ${context.agreementCode}, al calcular el concepto` : `total ${context.key} del convenio ${context.agreementCode}, en la precisión de totales`;
    const detailed = new OwnPayrollError('ROUNDING_NEEDED', `${error.message} Ubicación: ${where}.`);
    detailed.context = Object.freeze({ ...context });
    throw detailed;
  }
}
export function calculateOwnPayroll(raw) {
  const snapshot = normalizeOwnPayrollInput(raw), { period, liquidationType, selection } = snapshot;
  const namespaced = snapshot.version === OWN_PAYROLL_NAMESPACED_INPUT_VERSION;
  const selectField = { contracts: 'contractId', agreements: 'agreementCode', departments: 'departmentCode' }[selection.kind];
  const selected = snapshot.employees.filter(e => selection.kind === 'all' || selection.values.includes(e[selectField]));
  require(selected.length > 0 && (selection.kind === 'all' || selection.values.every(v => selected.some(e => e[selectField] === v))), 'POPULATION_MISSING', 'No se pudo verificar la totalidad de la población elegida.');
  const activeRules = snapshot.rules.filter(r => r.validFrom <= period && (r.validUntil === null || r.validUntil >= period) && r.liquidationTypes.includes(liquidationType));
  const agreements = new Map(); for (const r of activeRules) { const group = agreements.get(r.agreementCode) ?? []; group.push(r); agreements.set(r.agreementCode, group); }
  const compiled = new Map([...agreements].map(([code, group]) => [code, compileRules(group, { operations: 0 }, namespaced)]));
  let operations = 0, resultBytes = 0; const rows = [], employeeTotals = [];
  for (const employee of selected) {
    const overrides=new Map((employee.fixedForcedAmounts??[]).map(o=>[o.ruleKey,o]));
    const forcedCodes=new Set();for(const [key,o] of overrides){const r=activeRules.find(r=>r.agreementCode===employee.agreementCode&&ownFixedForcedRuleKey(r)===key);require(r,'FORCED_POLICY_INVALID','La política no pertenece al período, tipo o convenio seleccionado.');forcedCodes.add(r.code);}
    const checkQuantity=n=>{require(n.op!=='quantity_phase'||!forcedCodes.has(n.code),'FORCED_QUANTITY_UNKNOWN','El importe forzado no define las unidades del concepto.');for(const k of ['left','right','value','condition','then','else'])if(n[k]&&typeof n[k]==='object')checkQuantity(n[k]);};
    for(const r of activeRules.filter(r=>r.agreementCode===employee.agreementCode))checkQuantity(r.expression);

    const rules = compiled.get(employee.agreementCode);
    require(rules && [...rules.values()].some(r => ['remuneration', 'non_remuneration'].includes(r.rule.nature)), 'PAY_RULE_MISSING', 'Faltan reglas de haberes vigentes para un contrato del conjunto.');
    const values = new Map(), inputs = new Map(employee.inputs.map(i => [i.key, i]));
    function concept(code) {
      if (values.has(code)) return values.get(code);
      const { rule, dependencies } = rules.get(code), trace = [];
      function evaluate(n) {
        require(++operations <= OWN_PAYROLL_LIMITS.operations, 'COMPUTATION_LIMIT', 'El cálculo completo supera la capacidad declarada; no se entrega un resultado parcial.');
        let value;
        if (n.op === 'literal') value = decimal(n.value);
        else if (n.op === 'input') { const input = inputs.get(n.key); require(input && input.value !== null, 'INPUT_MISSING', 'Falta una entrada necesaria; no se supone cero.'); require(input.unit === n.unit, 'UNIT_MISMATCH', 'La entrada tiene otra unidad.'); value = decimal(input.value); }
        else if(n.op==='match'){const input=inputs.get(n.key);require(input&&input.value!==null,'INPUT_MISSING','Falta la condición necesaria; no se supone no, sin título ni cero.');require(input.unit===n.type&&conditionValue(input.unit,input.value),'UNIT_MISMATCH','La condición tiene otro tipo.');value=n.operator==='eq'?input.value===n.value:input.value!==n.value;}
        else if (n.op === 'concept' || n.op === 'auxiliary') { const referenced = concept(referenceIdentity(n, namespaced)); value = n.stage === 'exact' ? referenced.exact : referenced.value; }
        else if (n.op === 'quantity_phase') { const phase=evaluate(n.value);value=n.stage==='rounded'?quantize(phase,n.rounding).value:phase; }
        else if (n.op === 'round') value = quantize(evaluate(n.value), n.rounding).value;
        else if (n.op === 'convert') value = exactMultiply(evaluate(n.value), decimal(n.factor));
        else if (n.op === 'choose') { const condition = evaluate(n.condition); value = evaluate(condition ? n.then : n.else); }
        else {
          const a = evaluate(n.left), b = evaluate(n.right), compare = exactCompare(a, b);
          if (n.op === 'compare') value = ({ lt: compare < 0, le: compare <= 0, eq: compare === 0, ne: compare !== 0, ge: compare >= 0, gt: compare > 0 })[n.operator];
          else value = ({ add: exactAdd, subtract: exactSubtract, multiply: exactMultiply, divide: exactDivide, min: (a, b) => exactCompare(a, b) <= 0 ? a : b, max: (a, b) => exactCompare(a, b) >= 0 ? a : b })[n.op](a, b);
        }
        const isReference = n.op === 'concept' || n.op === 'auxiliary';
        trace.push({ operation: n.op, reference: n.op === 'input'||n.op==='match' ? n.key : n.op==='quantity_phase'?'quantity:'+n.code:isReference ? referenceIdentity(n, namespaced) : null, stage: isReference||n.op==='quantity_phase' ? n.stage : null, result: typeof value === 'boolean' ? value : exactEvidence(value) }); return value;
      }
      const override=overrides.get(ownFixedForcedRuleKey(rule));
      const { exact, rounded } = located(() => { const exact = override?exactDivide(decimal(override.amountCents),decimal('100')):evaluate(rule.expression); return { exact, rounded: quantize(exact, rule.rounding) }; }, { stage: 'concept', conceptCode: rule.code, agreementCode: employee.agreementCode });
      if(override){require(exactCompare(exact,rounded.value)===0,'FORCED_PRECISION_LOSS','La precisión aprobada cambiaría el importe forzado; no se modificó.');trace.push({operation:'fixed_forced_amount',reference:[override.recordId,override.recordVersion,override.proposalId,override.policySha256,override.sourceRowSha256].join(':'),stage:'exact',result:exactEvidence(exact)});}

      const calculated = { value: rounded.value, exact, row: { contractId: employee.contractId, employeeNumber: employee.employeeNumber, agreementCode: employee.agreementCode, departmentCode: employee.departmentCode, conceptCode: rule.code, nature: rule.nature, unit: rule.unit, amount: rounded.amount, exactValue: exactEvidence(exact), rounding: { ...rule.rounding }, ruleReference: rule.ruleReference, dependencies, trace } }; values.set(code, calculated); return calculated;
    }
    for (const code of [...rules.keys()].sort()) concept(code);
    const totals = { remuneration: rational(0n), non_remuneration: rational(0n), deduction: rational(0n), employer_contribution: rational(0n) };
    for (const calculated of values.values()) {
      resultBytes += new TextEncoder().encode(JSON.stringify(calculated.row)).byteLength;
      require(resultBytes <= 32 * 1024 * 1024, 'RESULT_LIMIT', 'El resultado completo supera la capacidad; no se entrega parcialmente.');
      rows.push(calculated.row); if (calculated.row.nature !== 'auxiliary') totals[calculated.row.nature] = exactAdd(totals[calculated.row.nature], calculated.value);
    }
    const gross = exactAdd(totals.remuneration, totals.non_remuneration), net = exactSubtract(gross, totals.deduction);
    employeeTotals.push({ contractId: employee.contractId, ...Object.fromEntries(Object.entries({ ...totals, gross, net }).map(([k, v]) => [k, located(() => quantize(v, { precision: snapshot.totalsPrecision, mode: 'exact' }), { stage: 'contract_total', key: k, agreementCode: employee.agreementCode }).amount])) });
  }
  rows.sort((a, b) => order(a.contractId, b.contractId) || order(a.conceptCode, b.conceptCode) || (namespaced ? order(a.nature, b.nature) : 0));
  return { version: namespaced ? OWN_PAYROLL_NAMESPACED_RESULT_VERSION : OWN_PAYROLL_RESULT_VERSION, period, liquidationType, selection: { kind: selection.kind, values: [...selection.values] }, sourceVersions: { ...snapshot.sourceVersions }, employeeCount: selected.length, rowCount: rows.length, rows, employeeTotals, payrollCalculated: true, payrollPosted: false, municipalApprovalVerified: false, paymentExecuted: false };
}
