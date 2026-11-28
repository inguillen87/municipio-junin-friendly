import {ownPayrollFamilyFacts} from './own-payroll-family-facts.js';
import { payrollRequire as require } from './own-payroll-exact.js';
import { salarySerialized } from './native-salary-catalog-model.js';
import { OWN_PAYROLL_LIMITS, OWN_PAYROLL_NAMESPACE_VERSION } from './own-payroll-engine.js';
import { ownPayrollConditions } from './own-payroll-conditions.js';
import { normalizeOwnPayrollQuantityPhase, compileOwnPayrollQuantityPlan, OWN_PAYROLL_QUANTITY_PHASES_VERSION } from './own-payroll-quantity.js';
import { payrollExpressionReference } from './own-payroll-expression.js';
import { ownProgramParticipation, participationRules, participationRuleKey } from './own-period-participation-program.js';

export const ownProgramQuantities = p => p !== null && typeof p === 'object' && Object.getOwnPropertyDescriptor(p, 'quantityPhasesVersion')?.value === OWN_PAYROLL_QUANTITY_PHASES_VERSION;
export const quantityProgramFields = p => ownProgramQuantities(p) ? ['quantityPhasesVersion', 'quantityPhases'] : [];
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const active = (p, month, type) => p.validFrom <= month && (p.validUntil === null || p.validUntil >= month) && p.liquidationTypes.includes(type);
const identity = r => (r.nature === 'auxiliary' ? 'auxiliary:' : 'concept:') + r.code;
export const quantityProgramPhaseKey = p => [p.agreementCode, p.code, p.validFrom, [...p.liquidationTypes].sort().join(',')].join(':');
const phaseFields = ['agreementCode', 'code', 'unit', 'stage', 'rounding', 'expression', 'validFrom', 'validUntil', 'liquidationTypes', 'sourceReference', 'sourceSha256', 'amountUse', 'periodTreatment'];
function shape(v, keys) {
  require(v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).every(k => typeof k === 'string') && Reflect.ownKeys(v).sort().join('|') === [...keys].sort().join('|') && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value') && d.enumerable), 'PROGRAM_QUANTITY_INVALID', 'La cantidad del programa contiene campos omitidos o no admitidos.');
}
function list(v) {
  require(Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length > 0 && v.length <= OWN_PAYROLL_LIMITS.rules && Reflect.ownKeys(v).length === v.length + 1 && Array.from({ length: v.length }, (_, i) => Object.getOwnPropertyDescriptor(v, String(i))).every(d => d && Object.hasOwn(d, 'value') && d.enumerable), 'PROGRAM_QUANTITY_INVALID', 'El programa requiere el conjunto completo y denso de cantidades.');
}
function phase(raw, typedConditions) {
  shape(raw, phaseFields);
  const { periodTreatment, ...core } = raw;
  shape(periodTreatment, ['kind', 'reference']);
  require(['none', 'fraction'].includes(periodTreatment.kind) && payrollExpressionReference(periodTreatment.reference), 'PROGRAM_QUANTITY_PERIOD_REQUIRED', 'Declarar el tratamiento propio de cantidad: sin prorrateo o fracción documentada.');
  return { ...normalizeOwnPayrollQuantityPhase(core, { typedConditions }), periodTreatment: { ...periodTreatment } };
}
function preparationIssue(code, phase, period, liquidationType, destination, path) {
  const error = new Error(code);
  error.code = code;
  error.quantityDiagnostic = { definition: 'quantity:' + phase.agreementCode + ':' + phase.code, sourceReference: phase.sourceReference, period, liquidationType, destination, path };
  throw error;
}
// Preparation policy only. The direct quantity core still evaluates its declared
// policies. This gate never removes a fraction or changes a rounded value.
function preparationPolicies(phases, rules, program, period, type, consume) {
  const quantities = new Map(phases.map(p => [p.code, p])), amounts = new Map(rules.map(r => [identity(r), r]));
  const treatments = ownProgramParticipation(program) ? new Map(program.periodParticipation.treatments.map(t => [t.ruleKey, t.treatment])) : new Map();
  for (const root of phases) {
    const independent = root.amountUse.kind === 'independent', fractioned = root.periodTreatment.kind === 'fraction';
    if (!independent && !fractioned) continue;
    const seen = new Set(['quantity:' + root.code]);
    const issue = (code, destination, path) => preparationIssue(code, root, period, type, destination, path);
    if (independent && root.stage === 'rounded' && root.rounding.mode !== 'exact') issue('QUANTITY_NONEXACT_POLICY_NOT_ADMITTED', 'quantity:' + root.code, 'rounding');
    function walk(node, owner, path, depth) {
      consume();
      require(depth <= OWN_PAYROLL_LIMITS.dependencyDepth, 'DEPENDENCY_LIMIT', 'La revisión transitiva de cantidad supera la capacidad.');
      if (independent && node.op === 'round' && node.rounding.mode !== 'exact') issue('QUANTITY_NONEXACT_POLICY_NOT_ADMITTED', owner, path);
      if (['quantity', 'concept', 'auxiliary'].includes(node.op)) {
        const id = node.op + ':' + node.code, target = node.op === 'quantity' ? quantities.get(node.code) : amounts.get(id);
        if (!target || seen.has(id)) return; // The canonical compiler rejects absence/cycles.
        seen.add(id);
        if (fractioned && (node.op === 'quantity' ? target.periodTreatment.kind === 'fraction' : treatments.get(participationRuleKey(target)) === 'fraction')) issue('QUANTITY_FRACTION_COMPOSITION_UNDECLARED', id, path);
        if (independent && node.op === 'quantity' && target.stage === 'rounded' && target.rounding.mode !== 'exact') issue('QUANTITY_NONEXACT_POLICY_NOT_ADMITTED', id, path + '.rounding');
        walk(target.expression, id, path + '->' + id, depth + 1);
        return;
      }
      for (const key of ['left', 'right', 'value', 'condition', 'then', 'else']) if (node[key] && typeof node[key] === 'object') walk(node[key], owner, path + '.' + key, depth);
    }
    walk(root.expression, 'quantity:' + root.code, 'expression', 0);
  }
}
function fraction(program, agreementCode) {
  require(ownProgramParticipation(program), 'PROGRAM_QUANTITY_PERIOD_REQUIRED', 'La fracción de cantidad requiere una política de participación explícita.');
  const input = sourceField => {
    const matches = program.bindings.filter(b => b.agreementCode === agreementCode && b.sourceKind === 'period_fact' && b.sourceField === sourceField);
    require(matches.length === 1 && matches[0].unit === 'units' && matches[0].onMissing === 'error' && matches[0].combine === 'single', 'PARTICIPATION_BINDING_REQUIRED', 'La cantidad necesita cantidad reconocida y base únicas del mismo convenio.');
    return { op: 'input', unit: 'units', key: matches[0].key };
  };
  return { op: 'divide', left: input('recognizedUnits'), right: input('baseUnits') };
}
// Keep the declared program unchanged; only the captured new input carries the
// explicitly lowered treatment. A monetary fraction never implies a quantity one.
export function quantityInputPhases(program) {
  if (!ownProgramQuantities(program)) return [];
  const treatments = ownProgramParticipation(program) ? new Map(program.periodParticipation.treatments.map(t => [t.ruleKey, t.treatment])) : new Map();
  return program.quantityPhases.map(raw => {
    const { periodTreatment, ...p } = raw;
    const expression = periodTreatment.kind === 'fraction' ? { op: 'multiply', left: p.expression, right: fraction(program, p.agreementCode) } : p.expression;
    if (p.amountUse.kind === 'independent') return { ...p, expression, amountUse: { kind: 'independent' } };
    const declared = Object.hasOwn(p.amountUse, 'uses') ? p.amountUse.uses : [{ rule: 'concept:' + p.code, path: p.amountUse.path }];
    const uses = declared.map(use => {
      const target = program.rules.find(r => r.agreementCode === p.agreementCode && identity(r) === use.rule && active(r, p.validFrom, p.liquidationTypes[0]));
      const path = target && treatments.get(participationRuleKey(target)) === 'fraction' ? ['left', ...use.path] : [...use.path];
      return { rule: use.rule, path };
    });
    return { ...p, expression, amountUse: { kind: 'embedded', uses } };
  });
}
export function normalizeQuantityProgram(program) {
  require(program.namespaceVersion === OWN_PAYROLL_NAMESPACE_VERSION, 'PROGRAM_QUANTITY_INVALID', 'Las cantidades necesitan referencias separadas.');
  list(program.quantityPhases);
  const phases = program.quantityPhases.map(p => phase(p, (ownPayrollConditions(program) || ownPayrollFamilyFacts(program)))).sort((a, b) => order(quantityProgramPhaseKey(a), quantityProgramPhaseKey(b)));
  for (let i = 0; i < phases.length; i++) for (let j = i + 1; j < phases.length; j++) {
    const a = phases[i], b = phases[j];
    if (a.agreementCode === b.agreementCode && a.code === b.code && a.liquidationTypes.some(t => b.liquidationTypes.includes(t))) require((a.validUntil ?? '9999-12') < b.validFrom || (b.validUntil ?? '9999-12') < a.validFrom, 'QUANTITY_PHASE_OVERLAP', 'Las fases del programa no pueden superponerse.');
  }
  for (const p of phases) if (p.amountUse.kind === 'embedded' && p.periodTreatment.kind === 'fraction') preparationIssue('QUANTITY_EMBED_FRACTION_UNSUPPORTED', p, p.validFrom, p.liquidationTypes[0], 'quantity:' + p.code, 'periodTreatment');
  const normalized = { ...program, quantityPhases: phases }, effective = quantityInputPhases(normalized), rules = participationRules(normalized);
  const nextMonth = m => { const [y, n] = m.split('-').map(Number); return String(n === 12 ? y + 1 : y) + '-' + String(n === 12 ? 1 : n + 1).padStart(2, '0'); };
  const boundaries = [...new Set([...rules, ...effective].flatMap(r => [r.validFrom, ...(r.validUntil ? [nextMonth(r.validUntil)] : [])]))].sort();
  let operations = 0, checks = 0;
  const consume = () => require(++operations <= OWN_PAYROLL_LIMITS.operations, 'EXPRESSION_LIMIT', 'La revisión completa de cantidades supera la capacidad.');
  for (const period of boundaries) for (const type of new Set(effective.flatMap(p => p.liquidationTypes))) for (const agreement of new Set(effective.map(p => p.agreementCode))) {
    const current = effective.filter(p => p.agreementCode === agreement && active(p, period, type));
    if (!current.length) continue;
    checks += current.length; require(checks <= 50000, 'EXPRESSION_LIMIT', 'La revisión de vigencias de cantidad supera la capacidad.');
    const amounts = rules.filter(r => r.agreementCode === agreement && active(r, period, type));
    for (const p of current) if (p.amountUse.kind === 'embedded') {
      const uses = Object.hasOwn(p.amountUse, 'uses') ? p.amountUse.uses : [{ rule: 'concept:' + p.code, path: p.amountUse.path }];
      for (const use of uses) if (!amounts.some(r => identity(r) === use.rule)) preparationIssue('QUANTITY_EMBED_USE_INACTIVE', p, period, type, use.rule, use.path.join('.') || '$');
    }
    preparationPolicies(phases.filter(p => p.agreementCode === agreement && active(p, period, type)), program.rules.filter(r => r.agreementCode === agreement && active(r, period, type)), normalized, period, type, consume);
    compileOwnPayrollQuantityPlan({ rules: amounts, quantityPhases: current, agreementCode: agreement, period, liquidationType: type, typedConditions: (ownPayrollConditions(program) || ownPayrollFamilyFacts(program)), consume });
  }
  return { quantityPhasesVersion: OWN_PAYROLL_QUANTITY_PHASES_VERSION, quantityPhases: phases };
}
export function quantityProgramBindingRules(program) {
  if (!ownProgramQuantities(program)) return [];
  return quantityInputPhases(program).map(p => {
    const owner = program.rules.find(r => r.agreementCode === p.agreementCode && r.code === p.code && r.nature !== 'auxiliary' && active(r, p.validFrom, p.liquidationTypes[0]));
    require(owner, 'QUANTITY_OWNER_MISSING', 'Falta el concepto de la cantidad.');
    return { ...owner, validFrom: p.validFrom, validUntil: p.validUntil, liquidationTypes: p.liquidationTypes, expression: p.expression };
  });
}
export function quantityProgramHistory(before, after) {
  if (!ownProgramQuantities(before)) return;
  require(ownProgramQuantities(after), 'PROGRAM_HISTORY_REQUIRED', 'Conservá la familia de cantidades del programa.');
  const keys = new Set(after.quantityPhases.map(quantityProgramPhaseKey));
  require(before.quantityPhases.every(p => keys.has(quantityProgramPhaseKey(p))), 'PROGRAM_HISTORY_REQUIRED', 'Conservá las fases anteriores; cerrá su vigencia sin retirarlas.');
}