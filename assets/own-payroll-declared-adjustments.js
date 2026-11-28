// Versioned opt-in for approved monthly amounts with an explicit origin month.
// Source admission runs only AFTER the normal batch/review/identity validators.
import { salaryExact, salaryHash, salaryUuid, salarySerialized } from './native-salary-catalog-model.js';
import { payrollRequire as require, decimal } from './own-payroll-exact.js';
import { participationRules } from './own-period-participation-program.js';
import { policyMonth, policyCode, policySha256, requirePolicyScope, requirePolicyDeclaration,
  resolvePolicySuccession, resolvedPolicyAppliesTo, policyBoundaryMonths } from './own-payroll-policy-validity.js';

export const OWN_MONTHLY_DECLARED_ADJUSTMENTS_VERSION = 'own-monthly-declared-adjustments.v1';
const fields = ['policyId', 'supersedes', 'agreementCode', 'validFrom', 'validUntil',
  'liquidationType', 'sourceCode', 'amountInputKey', 'sourceContracts', 'adjustmentMonthPolicy',
  'evidencePolicy', 'quantityPolicy', 'forcedPolicy', 'fixedPolicy', 'monetaryRecognition',
  'absencePolicy', 'sourceSha256', 'ruleReference'];
const contracts = ['own-payroll-novelty-batch.v1', 'payroll-novelty-batch.v2'];
const same = (left, right) => salarySerialized(left) === salarySerialized(right);
const scope = policy => [policy.agreementCode, policy.liquidationType, policy.sourceCode].join(':');
const key = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value);
const text = (value, minimum, maximum) => typeof value === 'string' &&
  value === value.trim() && value === value.normalize('NFC') && value.length >= minimum &&
  value.length <= maximum && !/[<>\u0000-\u001f\u007f]/.test(value);
const cents = value => typeof value === 'string' && /^-?(0|[1-9][0-9]{0,17})$/.test(value) && value !== '-0';
const active = (rule, policy, period) => rule.agreementCode === policy.agreementCode &&
  rule.validFrom <= period && (rule.validUntil === null || period <= rule.validUntil) &&
  rule.liquidationTypes.includes(policy.liquidationType);

export function normalizeDeclaredAdjustmentPolicies(raw) {
  require(salaryExact(raw, ['version', 'policies']) && raw.version === OWN_MONTHLY_DECLARED_ADJUSTMENTS_VERSION &&
    Array.isArray(raw.policies) && raw.policies.length > 0 && raw.policies.length <= 128 &&
    Reflect.ownKeys(raw.policies).length === raw.policies.length + 1,
  'DECLARED_ADJUSTMENT_CONTRACT_INVALID', 'La decisión de importe declarado requiere versión y políticas explícitas.');
  const policies = raw.policies.map(policy => {
    require(salaryExact(policy, fields), 'DECLARED_ADJUSTMENT_CONTRACT_INVALID', 'La política contiene campos ausentes o no admitidos.');
    requirePolicyScope(policy); requirePolicyDeclaration(policy);
    require(policy.liquidationType === 'monthly' && policyCode(policy.sourceCode) && key(policy.amountInputKey) &&
      same(policy.sourceContracts, contracts) && ['explicit_prior_month', 'explicit_not_future_month'].includes(policy.adjustmentMonthPolicy) &&
      policy.evidencePolicy === 'nonempty_legal_instrument' && policy.quantityPolicy === 'absent_or_zero' &&
      policy.forcedPolicy === 'reject' && policy.fixedPolicy === 'reject' &&
      policy.monetaryRecognition === 'current_payroll_no_historical_recalculation' &&
      policy.absencePolicy === 'zero_only_after_existing_complete_capture' &&
      salaryHash(policy.sourceSha256) && text(policy.ruleReference, 3, 180),
    'DECLARED_ADJUSTMENT_CONTRACT_INVALID', 'Declarar mes de origen, constancia, importe y canales exactos.');
    return structuredClone(policy);
  });
  resolvePolicySuccession(policies, { identity: policy => policy.policyId, scope });
  return { version: OWN_MONTHLY_DECLARED_ADJUSTMENTS_VERSION, policies };
}

export function declaredAdjustmentHistory(before, after) {
  const original = normalizeDeclaredAdjustmentPolicies(before), next = normalizeDeclaredAdjustmentPolicies(after);
  require(original.policies.every(policy => next.policies.some(candidate => same(policy, candidate))),
    'PROGRAM_HISTORY_REQUIRED', 'La política anterior y su mes de origen se conservan íntegros.');
  return next;
}

const programFields = ['monthlyDeclaredAdjustmentsVersion', 'monthlyDeclaredAdjustmentPolicies'];
const present = program => programFields.some(field => Object.hasOwn(program ?? {}, field));
export const ownProgramDeclaredAdjustments = program => Object.getOwnPropertyDescriptor(program ?? {}, 'monthlyDeclaredAdjustmentsVersion')?.value === OWN_MONTHLY_DECLARED_ADJUSTMENTS_VERSION;
export const declaredAdjustmentProgramFields = program => present(program) ? [...programFields] : [];
export function normalizeDeclaredAdjustmentProgram(programme) {
  if (!present(programme)) return {};
  require(programme.namespaceVersion === 'own-payroll-namespaces.v2', 'DECLARED_ADJUSTMENT_CONTRACT_INVALID', 'Los importes declarados necesitan referencias separadas.');
  const declared = normalizeDeclaredAdjustmentPolicies({ version: programme.monthlyDeclaredAdjustmentsVersion,
    policies: programme.monthlyDeclaredAdjustmentPolicies });
  for (const entry of resolvePolicySuccession(declared.policies, { identity: policy => policy.policyId, scope })) {
    const policy = entry.policy;
    const related = participationRules(programme).filter(rule => rule.agreementCode === policy.agreementCode &&
      rule.liquidationTypes.includes(policy.liquidationType));
    for (const period of policyBoundaryMonths(entry, related)) {
      const targets = related.filter(rule => active(rule, policy, period) && rule.code === policy.sourceCode && rule.nature !== 'auxiliary');
      require(targets.length === 1 && targets[0].unit === 'money' &&
        same(targets[0].expression, { op: 'input', key: policy.amountInputKey, unit: 'money' }) &&
        same(targets[0].rounding, { precision: 2, mode: 'half_up' }),
      'DECLARED_ADJUSTMENT_RULE_REQUIRED', 'La política admite únicamente una regla propia de importe directo declarado.');
      const bindings = programme.bindings.filter(binding => binding.agreementCode === policy.agreementCode &&
        binding.sourceCode === policy.sourceCode && /^(monthly|fixed)_/.test(binding.sourceKind));
      require(bindings.length === 1 && bindings[0].key === policy.amountInputKey &&
        bindings[0].sourceKind === 'monthly_amount' && bindings[0].unit === 'money' &&
        bindings[0].combine === 'sum' && bindings[0].onMissing === 'zero',
      'DECLARED_ADJUSTMENT_BINDING_REQUIRED', 'La fuente es la suma exacta de importes mensuales; no se mezcla con fijas.');
      require(!(programme.quantityPhases ?? []).some(phase => active(phase, policy, period) && phase.code === policy.sourceCode),
        'DECLARED_ADJUSTMENT_QUANTITY_UNSUPPORTED', 'La decisión no crea una fase de cantidad.');
    }
  }
  return { monthlyDeclaredAdjustmentsVersion: declared.version, monthlyDeclaredAdjustmentPolicies: declared.policies };
}
export function declaredAdjustmentProgramHistory(before, after) {
  if (!present(before)) return;
  require(present(after), 'PROGRAM_HISTORY_REQUIRED', 'Conservá el contrato de importes declarados.');
  declaredAdjustmentHistory({ version: before.monthlyDeclaredAdjustmentsVersion, policies: before.monthlyDeclaredAdjustmentPolicies },
    { version: after.monthlyDeclaredAdjustmentsVersion, policies: after.monthlyDeclaredAdjustmentPolicies });
}

export function declaredAdjustmentSourceResolver(raw) {
  const declared = normalizeDeclaredAdjustmentPolicies(raw);
  const resolved = resolvePolicySuccession(declared.policies, { identity: policy => policy.policyId, scope });
  return ({ row, family, agreementCode, period, liquidationType, sourceContract, reference, contractId }) => {
    require(policyMonth(period) && policyCode(agreementCode) && row && typeof row === 'object',
      'DECLARED_ADJUSTMENT_SCOPE_INVALID', 'La entrada necesita el alcance original de la captura.');
    const matching = resolved.filter(entry => entry.policy.sourceCode === row.conceptSourceId &&
      resolvedPolicyAppliesTo(entry, { period, liquidationType, agreementCode }));
    if (!matching.length) {
      require(!resolved.some(entry => entry.policy.agreementCode === agreementCode && entry.policy.sourceCode === row.conceptSourceId),
        'DECLARED_ADJUSTMENT_POLICY_REQUIRED', 'El concepto declarado no tiene una política vigente para este período y tipo.');
      return null;
    }
    require(matching.length === 1, 'DECLARED_ADJUSTMENT_POLICY_AMBIGUOUS', 'Hay más de una decisión para la misma fuente.');
    const policy = matching[0].policy;
    require(family === 'monthly', 'DECLARED_ADJUSTMENT_FIXED_INCOMPATIBLE', 'Una fija no sustituye el importe mensual declarado.');
    require(policy.sourceContracts.includes(sourceContract), 'DECLARED_ADJUSTMENT_SOURCE_CONTRACT_INVALID', 'El canal requiere su contrato de aprobación completo.');
    require(row.forced === false, 'DECLARED_ADJUSTMENT_FORCED_INCOMPATIBLE', 'Esta política no admite reemplazos forzados.');
    require(cents(row.amountCents), 'DECLARED_ADJUSTMENT_AMOUNT_REQUIRED', 'El importe aprobado debe estar informado en centavos exactos.');
    const origin = row.adjustmentMonth;
    require(typeof origin === 'string' && origin.endsWith('-01') && origin.length === 10 && policyMonth(origin.slice(0, 7)),
      'DECLARED_ADJUSTMENT_ORIGIN_REQUIRED', 'Se requiere el mes de origen explícito, sin tomarlo del nombre del concepto.');
    require(origin.slice(0, 7) <= period, 'DECLARED_ADJUSTMENT_FUTURE_ORIGIN', 'El origen no puede ser posterior al mes liquidado.');
    require(policy.adjustmentMonthPolicy !== 'explicit_prior_month' || origin.slice(0, 7) < period,
      'DECLARED_ADJUSTMENT_PRIOR_MONTH_REQUIRED', 'Este retroactivo necesita un mes de origen anterior.');
    require(text(row.legalInstrument, 5, 300), 'DECLARED_ADJUSTMENT_EVIDENCE_REQUIRED', 'Falta la constancia identificable del importe aprobado.');
    const quantity = row.quantityDecimal;
    require(quantity === null || typeof quantity === 'string' && /^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$/.test(quantity) &&
      !/^-0(?:\.0+)?$/.test(quantity) && decimal(quantity).n === 0n,
    'DECLARED_ADJUSTMENT_QUANTITY_INCOMPATIBLE', 'Una cantidad no cero requiere otra decisión; no se omite de la fuente.');
    require(text(reference, 3, 180) && salaryUuid(contractId) &&
      (sourceContract === 'own-payroll-novelty-batch.v1' ? row.contractId : row.employmentContractId) === contractId,
      'DECLARED_ADJUSTMENT_IDENTITY_REQUIRED', 'Conservar el contrato y la referencia de fila ya verificados.');
    return { version: 'own-monthly-declared-adjustment-admission.v1',
      policyId: policy.policyId, policySha256: policySha256(policy),
      contractId, agreementCode, conceptCode: row.conceptSourceId,
      payrollPeriod: period, liquidationType, sourceContract, reference,
      adjustmentMonth: origin, legalInstrument: row.legalInstrument,
      amountCents: row.amountCents, quantityDecimal: quantity,
      monetaryRecognition: policy.monetaryRecognition, sourceRowSha256: policySha256(row, {preserveLegacyUnicode:true}) };
  };
}

// This function never manufactures an absent event or certifies capture scope.
// Existing full source capture must handle absence before a binding may use zero.
export function sumDeclaredAdjustmentAdmissions(admissions) {
  require(Array.isArray(admissions) && admissions.length > 0,
    'DECLARED_ADJUSTMENT_EMPTY_NOT_ABSENCE', 'Una lista vacía no acredita captura completa ni un importe cero.');
  const first = admissions[0], references = new Set(), origins = new Map();
  let total = 0n;
  for (const row of admissions) {
    require(row.version === 'own-monthly-declared-adjustment-admission.v1' && cents(row.amountCents) &&
      ['contractId', 'agreementCode', 'conceptCode', 'payrollPeriod', 'liquidationType', 'policySha256'].every(field => row[field] === first[field]),
    'DECLARED_ADJUSTMENT_GROUP_SCOPE_INVALID', 'No se suman personas, conceptos, vigencias o políticas distintos.');
    require(!references.has(row.reference), 'DECLARED_ADJUSTMENT_ROW_DUPLICATE', 'La misma fila no puede contarse dos veces.');
    references.add(row.reference);
    const amount = BigInt(row.amountCents), origin = origins.get(row.adjustmentMonth) ?? { amount: 0n, references: [] };
    total += amount; origin.amount += amount; origin.references.push(row.reference); origins.set(row.adjustmentMonth, origin);
  }
  return { amountCents: total.toString(), byOriginMonth: [...origins].sort(([left], [right]) => left.localeCompare(right))
    .map(([adjustmentMonth, group]) => ({ adjustmentMonth, amountCents: group.amount.toString(), references: group.references })),
    admissionsSha256: policySha256(admissions), completeCaptureCertified: false };
}
