// Offline composition only. Source objects and their serialization order are preserved.
import {copyRowEmissionData, normalizeRowEmissionPolicies, rowEmissionPolicyKey, OWN_PAYROLL_ROW_EMISSION_V2_VERSION} from './own-payroll-row-emission.js';
import {normalizeSourceCoverageProgram} from './own-payroll-source-coverage.js';
import {normalizePayrollExpression, payrollExpressionReference} from './own-payroll-expression.js';
import {policyCode, policyMonth, policyId, policySha256} from './own-payroll-policy-validity.js';

export const AGREEMENT_COMPOSER_VERSION = 'own-program-agreement-composer.v1';
const collections = Object.freeze([
  'rules', 'bindings', 'quantityPhases', 'rowEmissionPolicies', 'familyTariffPolicies',
  'officialTotalsPolicies', 'sourceCoveragePolicies', 'conditionalSourcePolicies',
  'quantityOnlyInputPolicies', 'monthlyForcedAmountPolicies', 'monthlyDeclaredAdjustmentPolicies',
]);
const children = ['left', 'right', 'value', 'condition', 'then', 'else'];
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0; // All scope keys are ASCII: byte order.
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const reportText = v => typeof v === 'string' && v.trim() === v && v.length >= 3 && v.length <= 180 && !/[\u0000-\u001f\u007f]/.test(v);
const copy = value => copyRowEmissionData(value);

export class AgreementCompositionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AgreementCompositionError';
    this.code = code;
    this.details = details;
  }
}
function require(ok, code, message, details) {
  if (!ok) throw new AgreementCompositionError(code, message, details);
}
function fields(value, required, optional = []) {
  require(record(value) && required.every(k => Object.hasOwn(value, k)) &&
    Object.keys(value).every(k => required.includes(k) || optional.includes(k)),
  'COMPOSER_CONTRACT_INVALID', 'Faltan campos declarados o hay campos no admitidos.');
}
function applies(row, period) {
  if (Object.hasOwn(row, 'period')) {
    require(policyMonth(row.period) && !Object.hasOwn(row, 'validFrom') && !Object.hasOwn(row, 'validUntil'),
      'COMPOSER_VALIDITY_INVALID', 'La vigencia debe declarar un mes o un intervalo inequívoco.');
    return row.period === period;
  }
  require((row.validFrom === undefined || policyMonth(row.validFrom)) &&
    (row.validUntil === undefined || row.validUntil === null || policyMonth(row.validUntil)) &&
    (!row.validFrom || !row.validUntil || row.validFrom <= row.validUntil),
  'COMPOSER_VALIDITY_INVALID', 'La vigencia tiene un mes inválido o un intervalo invertido.');
  return (!row.validFrom || row.validFrom <= period) && (!row.validUntil || period <= row.validUntil);
}
function rename(id, source, target) {
  require(policyId(id), 'COMPOSER_POLICY_ID_INVALID', 'La política necesita un identificador válido.');
  const prefix = `c${source}.`;
  const renamed = id.startsWith(prefix) ? `c${target}.${id.slice(prefix.length)}` : `${id}.c${target}`;
  require(policyId(renamed), 'COMPOSER_POLICY_ID_INVALID', 'El identificador renombrado excede el contrato del motor.');
  return renamed;
}
function partial(value, expected) {
  return record(expected) ? record(value) && Object.entries(expected).every(([k, v]) => Object.hasOwn(value, k) && partial(value[k], v)) : value === expected;
}
function normalizeExpression(expression, definition, quantity) {
  try {
    normalizePayrollExpression(expression, {limits: {depth: 32, nodes: 256},
      namespaced: definition.namespaceVersion === 'own-payroll-namespaces.v2',
      typedConditions: Boolean(definition.salaryConditionsVersion || definition.familyPayrollFactsVersion), quantities: quantity});
  } catch (error) {
    throw new AgreementCompositionError('COMPOSER_OVERRIDE_EXPRESSION_INVALID',
      'La diferencia no produce una expresión admitida por el motor.', {cause: error.code});
  }
}
function applyOverrides(definition, declaration, context, report) {
  if (declaration === undefined) return;
  fields(declaration, ['version', 'source', 'target', 'period', 'reference', 'changes', 'unresolved']);
  require(declaration.version === 'own-program-agreement-overrides.v1' &&
    ['source', 'target', 'period'].every(k => declaration[k] === context[k]) && payrollExpressionReference(declaration.reference) &&
    Array.isArray(declaration.changes) && Array.isArray(declaration.unresolved),
  'COMPOSER_OVERRIDES_SCOPE_INVALID', 'El archivo de diferencias debe corresponder al origen, destino y período pedidos.');
  const ids = new Set();
  for (const change of declaration.changes) {
    fields(change, ['id', 'collection', 'code', 'liquidationType', 'match', 'action'], ['nature', 'value', 'bindings', 'bindingPatch']);
    require(policyId(change.id) && !ids.has(change.id) && ['rules', 'quantityPhases'].includes(change.collection) &&
      policyCode(change.code) && typeof change.liquidationType === 'string' && record(change.match) && Object.keys(change.match).length > 0 &&
      ['add', 'replace', 'assert', 'rebind', 'useAsExpression'].includes(change.action) &&
      (['assert', 'rebind', 'useAsExpression'].includes(change.action) ? !Object.hasOwn(change, 'value') : record(change.value)) &&
      (change.action === 'rebind' ? record(change.bindingPatch) && !Object.hasOwn(change, 'bindings') : !Object.hasOwn(change, 'bindingPatch')),
    'COMPOSER_OVERRIDE_INVALID', 'Cada diferencia requiere identidad única, selector y operación explícitos.');
    ids.add(change.id);
    const candidates = (definition[change.collection] ?? []).filter(r => r.agreementCode === context.target && r.code === change.code &&
      (change.nature === undefined || r.nature === change.nature) && r.liquidationTypes?.includes(change.liquidationType) && applies(r, context.period));
    require(candidates.length === 1, 'COMPOSER_OVERRIDE_RULE_NOT_UNIQUE',
      'La diferencia debe encontrar una única regla o fase del destino.', {overrideId: change.id, matches: candidates.length});
    const row = candidates[0], matches = [];
    const visit = (node, path) => {
      if (!record(node)) return;
      const {binding, ...pattern} = change.match;
      const bound = binding === undefined || node.op === 'input' && definition.bindings.some(b => b.agreementCode === context.target && b.key === node.key && partial(b, binding));
      if (bound && partial(node, pattern)) { matches.push({node, path}); return; }
      for (const key of children) visit(node[key], [...path, key]);
    };
    visit(row.expression, []);
    require(matches.length === 1, 'COMPOSER_OVERRIDE_NODE_NOT_UNIQUE',
      'La diferencia debe encontrar un único nodo externo coincidente; no se elige uno por posición.', {overrideId: change.id, matches: matches.length});
    const {node, path} = matches[0];
    let replacement = change.value;
    let added = change.bindings ?? [];
    if (change.action === 'rebind') {
      fields(change.bindingPatch, ['key', 'sourceKind', 'ruleReference']);
      const bound = definition.bindings.filter(b => b.agreementCode === context.target && node.op === 'input' && b.key === node.key);
      require(bound.length === 1, 'COMPOSER_OVERRIDE_BINDING_INVALID', 'El cambio de canal requiere un único nodo de entrada enlazado.');
      const {agreementCode, ...originalBinding} = bound[0];
      // Keep the original missing-value and combination semantics: only the declared channel changes.
      added = [{...originalBinding, ...change.bindingPatch}];
      replacement = {op: 'input', key: change.bindingPatch.key, unit: originalBinding.unit};
    }
    require(Array.isArray(added) && (!['assert', 'useAsExpression'].includes(change.action) || added.length === 0), 'COMPOSER_OVERRIDE_INVALID', 'Las entradas nuevas deben declararse como un arreglo.');
    for (const binding of added) {
      fields(binding, ['key', 'unit', 'sourceKind', 'sourceCode', 'onMissing', 'combine', 'ruleReference']);
      require(/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(binding.key) && policyCode(binding.sourceCode) &&
        ['monthly_amount', 'monthly_quantity', 'fixed_amount', 'fixed_quantity'].includes(binding.sourceKind) &&
        ['money', 'hours', 'minutes', 'days', 'percent', 'units', 'coefficient'].includes(binding.unit) &&
        (!binding.sourceKind.endsWith('_amount') || binding.unit === 'money') &&
        ['error', 'zero'].includes(binding.onMissing) && ['single', 'sum'].includes(binding.combine) && payrollExpressionReference(binding.ruleReference),
      'COMPOSER_OVERRIDE_BINDING_INVALID', 'La entrada nueva requiere canal, unidad, ausencia y combinación explícitos.');
      require(!definition.bindings.some(b => b.agreementCode === context.target && b.key === binding.key),
        'COMPOSER_OVERRIDE_BINDING_EXISTS', 'La diferencia intenta agregar una entrada que ya existe.', {overrideId: change.id, key: binding.key});
      definition.bindings.push({agreementCode: context.target, ...copy(binding)});
      report.addedBindings.push({key: binding.key, overrideId: change.id});
    }
    if (change.action !== 'assert') {
      const value = change.action === 'useAsExpression' ? copy(node) : change.action === 'add' ? {op: 'add', left: node, right: copy(replacement)} : copy(replacement);
      let owner = row, key = 'expression';
      if (change.action !== 'useAsExpression') for (const step of path) { owner = owner[key]; key = step; }
      owner[key] = value;
      normalizeExpression(row.expression, definition, change.collection === 'quantityPhases');
    }
    report.appliedOverrides.push({id: change.id, collection: change.collection, code: change.code,
      action: change.action, path: ['expression', ...path].join('.'), reference: declaration.reference});
  }
  for (const item of declaration.unresolved) {
    fields(item, ['code', 'reference', 'reason']);
    require(policyCode(item.code) && reportText(item.reference) && reportText(item.reason),
      'COMPOSER_OVERRIDE_INVALID', 'Cada diferencia pendiente necesita código, referencia y motivo.');
    report.unresolvedOverrides.push(copy(item));
  }
}
function applyCoverage(definition, decisions, target, report) {
  require(Array.isArray(decisions), 'COMPOSER_COVERAGE_DECISIONS_INVALID', 'Las decisiones de cobertura deben ser un arreglo explícito.');
  const policies = (definition.sourceCoveragePolicies ?? []).filter(p => p.agreementCode === target);
  const pending = policies.flatMap(p => (p.inventory ?? []).filter(r => r.basis?.kind === 'outside_february_school_condition').map(r => ({policyId: p.policyId, code: r.code})));
  require(pending.every(r => policyCode(r.code) && policyId(r.policyId)), 'COMPOSER_COVERAGE_INVALID', 'Las exclusiones pendientes deben tener código e identidad de política válidos.');
  const missing = pending.filter(r => !decisions.some(d => d.policyId === r.policyId && d.code === r.code));
  require(missing.length === 0, 'COMPOSER_COVERAGE_DECISION_REQUIRED',
    `Las filas ${[...new Set(missing.map(r => r.code))].sort(order).join(', ')} requieren una decisión explícita en coverageDecisions; la exclusión escolar sólo admite el convenio 1.`, {rows: missing});
  const seen = new Set();
  for (const decision of decisions) {
    fields(decision, ['policyId', 'code', 'reference', 'disposition']);
    const id = `${decision.policyId}:${decision.code}`;
    require(policyId(decision.policyId) && policyCode(decision.code) && payrollExpressionReference(decision.reference) && record(decision.disposition) &&
      !Object.hasOwn(decision.disposition, 'code') && !Object.hasOwn(decision.disposition, 'sourceRowSha256') && !seen.has(id),
    'COMPOSER_COVERAGE_DECISIONS_INVALID', 'La decisión debe ser única y conservar código y huella de la fuente.');
    seen.add(id);
    require(pending.some(r => r.policyId === decision.policyId && r.code === decision.code),
      'COMPOSER_COVERAGE_DECISION_UNUSED', 'La decisión no corresponde a una exclusión escolar pendiente del destino.');
    const policy = policies.find(p => p.policyId === decision.policyId), index = policy.inventory.findIndex(r => r.code === decision.code);
    const {code, sourceRowSha256} = policy.inventory[index];
    policy.inventory[index] = {code, sourceRowSha256, ...copy(decision.disposition)};
    report.coverageDecisions.push({policyId: decision.policyId, code, kind: decision.disposition.kind, reference: decision.reference});
  }
}
function pruneBindings(definition, target, report) {
  const used = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (['input', 'match'].includes(value.op)) used.add(value.key);
    for (const [key, child] of Object.entries(value)) {
      if (key === 'inputKey' || key.endsWith('InputKey')) used.add(child);
      if (key === 'bindingKeys' || key.endsWith('InputKeys')) {
        require(Array.isArray(child), 'COMPOSER_BINDING_REFERENCE_INVALID', 'Las claves de entradas deben ser un arreglo.');
        child.forEach(k => used.add(k));
      }
      visit(child);
    }
  };
  for (const name of collections.filter(n => n !== 'bindings')) for (const row of definition[name] ?? []) if (row.agreementCode === target) visit(row);
  // Fraction treatments consume these bindings when the engine lowers participation.
  if (definition.periodParticipation?.treatments.some(t => t.ruleKey.startsWith(`${target}:`) && t.treatment === 'fraction') ||
      definition.quantityPhases?.some(q => q.agreementCode === target && q.periodTreatment?.kind === 'fraction')) {
    for (const b of definition.bindings) if (b.agreementCode === target && b.sourceKind === 'period_fact') used.add(b.key);
  }
  for (const key of used) require(definition.bindings.filter(b => b.agreementCode === target && b.key === key).length === 1,
    'COMPOSER_BINDING_MISSING', 'Una regla, fase o política requiere una entrada única del destino.', {key});
  definition.bindings = definition.bindings.filter(b => {
    if (b.agreementCode !== target || used.has(b.key)) return true;
    require(!report.addedBindings.some(a => a.key === b.key), 'COMPOSER_OVERRIDE_BINDING_UNUSED', 'Una entrada declarada por las diferencias quedó sin uso.');
    report.removedBindings.push({agreementCode: target, key: b.key});
    return false;
  });
}
function validateTargetExpressions(definition, target, period) {
  for (const collection of ['rules', 'quantityPhases']) for (const row of definition[collection] ?? []) {
    if (row.agreementCode !== target) continue;
    normalizeExpression(row.expression, definition, collection === 'quantityPhases');
    const visit = node => {
      if (!record(node)) return;
      if (['input', 'match'].includes(node.op)) {
        const matches = definition.bindings.filter(b => b.agreementCode === target && b.key === node.key);
        require(matches.length === 1 && matches[0].unit === (node.unit ?? node.type),
          'COMPOSER_BINDING_UNIT_MISMATCH', 'Cada nodo de entrada requiere un enlace único con la misma unidad.', {key: node.key});
      }
      if (['concept', 'auxiliary', 'quantity'].includes(node.op)) {
        const candidates = (node.op === 'quantity' ? definition.quantityPhases ?? [] : definition.rules).filter(r =>
          r.agreementCode === target && r.code === node.code && applies(r, period) &&
          (node.op === 'quantity' || (r.nature === 'auxiliary') === (node.op === 'auxiliary')));
        require((row.liquidationTypes ?? []).every(type => candidates.filter(r => r.liquidationTypes?.includes(type)).length === 1),
          'COMPOSER_REFERENCE_MISSING', 'La expresión requiere una referencia única del destino para cada tipo de liquidación.', {code: node.code});
      }
      for (const key of children) visit(node[key]);
    };
    visit(row.expression);
  }
}
function migrateEmission(definition, source, target, period, report) {
  if (!definition.rowEmissionPolicies?.some(p => p.agreementCode === target)) return;
  require(['own-payroll-row-emission.v1', OWN_PAYROLL_ROW_EMISSION_V2_VERSION].includes(definition.rowEmissionVersion),
    'COMPOSER_ROW_EMISSION_VERSION_INVALID', 'La emisión requiere una versión conocida y declarada.');
  const legacy = definition.rowEmissionPolicies.filter(p => p.agreementCode === target && p.version !== OWN_PAYROLL_ROW_EMISSION_V2_VERSION);
  for (const p of legacy) {
    // Validate the actual original policy before translating its legacy conditions.
    normalizeRowEmissionPolicies([{...p, agreementCode: source}], 'own-payroll-row-emission.v1');
    const conditions = p.conditions.map(c => {
      const phases = (definition.quantityPhases ?? []).filter(q => q.agreementCode === target && q.code === c.quantityCode && q.liquidationTypes?.includes(p.liquidationType) && applies(q, period));
      require(phases.length === 1 && phases[0].unit === c.unit && ['exact', 'rounded'].includes(phases[0].stage),
        'COMPOSER_ROW_EMISSION_PHASE_REQUIRED', 'La emisión v2 requiere una única fase con unidad y etapa declaradas.', {quantityCode: c.quantityCode});
      return {quantityCode: c.quantityCode, unit: c.unit, stage: phases[0].stage, valueDomain: 'nonnegative', operator: c.operator, value: c.value};
    });
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'][Number(period.slice(5)) - 1];
    const policy = {version: OWN_PAYROLL_ROW_EMISSION_V2_VERSION, policyId: `c${target}.${month}${period.slice(0, 4)}.row-emission.${p.conceptCode}`,
      supersedes: null, agreementCode: target, validFrom: period, validUntil: period, liquidationType: p.liquidationType,
      conceptCode: p.conceptCode, conditions, whenFalse: p.whenFalse, nonzeroAction: p.nonzeroAction,
      sourceReference: p.sourceReference, sourceSha256: p.sourceSha256};
    definition.rowEmissionPolicies[definition.rowEmissionPolicies.indexOf(p)] = policy;
    report.generatedPolicies.push({collection: 'rowEmissionPolicies', policyId: policy.policyId});
  }
  if (definition.rowEmissionVersion !== OWN_PAYROLL_ROW_EMISSION_V2_VERSION) {
    report.versionChanges.push({key: 'rowEmissionVersion', from: definition.rowEmissionVersion, to: OWN_PAYROLL_ROW_EMISSION_V2_VERSION});
    definition.rowEmissionVersion = OWN_PAYROLL_ROW_EMISSION_V2_VERSION;
  }
  // Validation returns normalized copies; keep original source objects byte-for-byte.
  normalizeRowEmissionPolicies(definition.rowEmissionPolicies, definition.rowEmissionVersion);
  definition.rowEmissionPolicies.sort((a, b) => order(rowEmissionPolicyKey(a), rowEmissionPolicyKey(b)));
}

/** Compose a new agreement without modifying either argument or normalizing source objects. */
export function composeAgreement(raw, options) {
  const definition = copy(raw), input = copy(options);
  fields(input, ['source', 'target', 'period'], ['overrides', 'coverageDecisions']);
  const {source, target, period} = input;
  require(record(definition) && policyCode(source) && policyCode(target) && source !== target && policyMonth(period),
    'COMPOSER_SCOPE_INVALID', 'Declarar convenios distintos y un período mensual válido.');
  require(Array.isArray(definition.rules) && Array.isArray(definition.bindings), 'COMPOSER_DEFINITION_INVALID', 'La definición necesita reglas y entradas.');
  const report = {version: AGREEMENT_COMPOSER_VERSION, source, target, period, counts: {}, removedBindings: [], addedBindings: [],
    renamedPolicies: [], generatedPolicies: [], appliedOverrides: [], unresolvedOverrides: [], coverageDecisions: [], versionChanges: []};
  for (const [key, rows] of Object.entries(definition)) if (Array.isArray(rows) && !collections.includes(key)) {
    require(!rows.some(r => record(r) && Object.hasOwn(r, 'agreementCode')), 'COMPOSER_COLLECTION_UNSUPPORTED',
      'La definición contiene un arreglo por convenio aún no admitido; no se omite en silencio.', {collection: key});
  }
  const treatments = definition.periodParticipation?.treatments ?? [];
  require((definition.periodParticipation === undefined || record(definition.periodParticipation) && Array.isArray(definition.periodParticipation.treatments)) &&
    Array.isArray(treatments) && treatments.every(t => record(t) && typeof t.ruleKey === 'string'), 'COMPOSER_PARTICIPATION_INVALID', 'Los tratamientos requieren ruleKey explícita.');
  for (const name of collections) {
    const rows = Object.hasOwn(definition, name) ? definition[name] : [];
    require(Array.isArray(rows) && rows.every(record), 'COMPOSER_COLLECTION_INVALID', 'Cada arreglo debe contener objetos completos.', {collection: name});
    require(!rows.some(r => r.agreementCode === target), 'COMPOSER_TARGET_EXISTS', 'El convenio destino ya está presente; no se compone dos veces.', {collection: name});
  }
  require(!treatments.some(t => t.ruleKey.startsWith(`${target}:`)), 'COMPOSER_TARGET_EXISTS', 'El destino ya tiene tratamientos de participación.');
  require(definition.rules.some(r => r.agreementCode === source && applies(r, period)), 'COMPOSER_SOURCE_MISSING', 'No hay reglas del origen vigentes en el período.');
  const clonedPolicies = [];
  for (const name of collections) {
    const rows = definition[name] ?? [], selected = rows.filter(r => r.agreementCode === source && applies(r, period));
    const additions = selected.map(original => {
      const row = {...copy(original), agreementCode: target};
      if (Object.hasOwn(row, 'sourceAgreementCode')) row.sourceAgreementCode = target;
      if (Object.hasOwn(row, 'policyId')) {
        row.policyId = rename(row.policyId, source, target);
        clonedPolicies.push({name, original, row});
        report.renamedPolicies.push({collection: name, from: original.policyId, to: row.policyId});
      }
      return row;
    });
    if (Object.hasOwn(definition, name)) definition[name].push(...additions);
    report.counts[name] = {before: rows.length - additions.length, cloned: additions.length, added: additions.length, removed: 0, after: rows.length};
  }
  const newTreatments = treatments.filter(t => t.ruleKey.startsWith(`${source}:`) && t.ruleKey.includes(`:${period}:`))
    .map(t => ({...copy(t), ruleKey: `${target}:${t.ruleKey.slice(source.length + 1)}`}));
  const beforeTreatments = treatments.length;
  if (definition.periodParticipation) treatments.push(...newTreatments);
  report.counts['periodParticipation.treatments'] = {before: beforeTreatments, cloned: newTreatments.length, added: newTreatments.length, removed: 0, after: treatments.length};
  applyOverrides(definition, input.overrides, input, report);
  applyCoverage(definition, input.coverageDecisions ?? [], target, report);
  // A copied succession may only point at another copied policy of the same family.
  const completed = new Set(), visiting = new Set();
  const rebase = entry => {
    if (completed.has(entry)) return;
    require(!visiting.has(entry), 'COMPOSER_POLICY_SUCCESSION_INVALID', 'La sucesión contiene un ciclo.');
    visiting.add(entry);
    if (entry.original.supersedes != null) {
      const predecessor = clonedPolicies.filter(p => p.name === entry.name && p.original.policyId === entry.original.supersedes.policyId);
      require(predecessor.length === 1, 'COMPOSER_POLICY_PREDECESSOR_MISSING', 'El antecedente no se clonó para el período; se requiere una decisión explícita sobre esa sucesión.');
      require(policySha256(predecessor[0].original) === entry.original.supersedes.policySha256,
        'COMPOSER_POLICY_SUCCESSION_INVALID', 'La huella del antecedente no coincide con la política original.');
      rebase(predecessor[0]);
      entry.row.supersedes = {policyId: predecessor[0].row.policyId, policySha256: policySha256(predecessor[0].row)};
    }
    visiting.delete(entry); completed.add(entry);
  };
  clonedPolicies.forEach(rebase);
  migrateEmission(definition, source, target, period, report);
  pruneBindings(definition, target, report);
  validateTargetExpressions(definition, target, period);
  if (definition.sourceCoveragePolicies?.some(p => p.agreementCode === target)) {
    try { normalizeSourceCoverageProgram({...definition, sourceCoveragePolicies: definition.sourceCoveragePolicies.filter(p => p.agreementCode === target)}); }
    catch (error) { throw new AgreementCompositionError('COMPOSER_COVERAGE_INVALID', 'La cobertura declarada no es admitida por el motor.', {cause: error.code}); }
  }
  for (const name of collections) {
    const ids = (definition[name] ?? []).filter(r => Object.hasOwn(r, 'policyId')).map(r => r.policyId);
    require(new Set(ids).size === ids.length, 'COMPOSER_POLICY_ID_COLLISION', 'El renombre produce identificadores de política repetidos.', {collection: name});
  }
  for (const name of collections) {
    require(JSON.stringify((raw[name] ?? []).filter(r => r.agreementCode === source)) === JSON.stringify((definition[name] ?? []).filter(r => r.agreementCode === source)),
      'COMPOSER_SOURCE_ORDER_INVALID', 'El origen debe tener sus políticas de emisión ordenadas; componer no puede reordenar su historial.');
  }
  report.counts.bindings.added += report.addedBindings.length;
  report.counts.bindings.removed = report.removedBindings.length;
  report.counts.bindings.after = definition.bindings.length;
  report.complete = report.unresolvedOverrides.length === 0;
  return {definition, report};
}
