// Complete, immutable source evidence. No arithmetic version or database column
// changes: origin months stay attached to the original approved source rows.
import { salaryExact, salaryHash, salaryUuid, salarySerialized } from './native-salary-catalog-model.js';
import { payrollRequire as require } from './own-payroll-exact.js';
import { policySha256, resolvePolicySuccession, resolvedPolicyAppliesTo, POLICY_LIQUIDATION_TYPES } from './own-payroll-policy-validity.js';
import { verifyMonthlyBatch, assertNativeMonthlySubject } from './payroll-native-monthly-model.js';
import { ownNoveltyBatch } from './own-payroll-novelties-model.js';
import { fixedList, fixedExportData } from './payroll-fixed-novelties-model.js';
import { OWN_MONTHLY_DECLARED_ADJUSTMENTS_VERSION,
  declaredAdjustmentProgramFields, normalizeDeclaredAdjustmentProgram, normalizeDeclaredAdjustmentPolicies,
  declaredAdjustmentSourceResolver, sumDeclaredAdjustmentAdmissions } from './own-payroll-declared-adjustments.js';

export const OWN_DECLARED_ADJUSTMENT_CAPTURE_VERSION = 'own-monthly-declared-adjustment-capture.v1';
const sourceHash = value => policySha256(value, {preserveLegacyUnicode:true});
const same = (left, right) => salarySerialized(left) === salarySerialized(right);
const order = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const admissionKey = row => [row.contractId, row.conceptCode, row.adjustmentMonth, row.reference].join(':');
const groupKey = row => [row.contractId, row.agreementCode, row.conceptCode, row.policySha256].join(':');
const metadataFields = ['version', 'period', 'liquidationType', 'policies', 'policiesSha256',
  'populationSha256', 'channelsSha256', 'admissionsSha256', 'subtotalsSha256'];
const admissionFields = ['version', 'policyId', 'policySha256', 'contractId', 'agreementCode',
  'conceptCode', 'payrollPeriod', 'liquidationType', 'sourceContract', 'reference', 'adjustmentMonth',
  'legalInstrument', 'amountCents', 'quantityDecimal', 'monetaryRecognition', 'sourceRowSha256'];
const ownConceptObservation = issue => salaryExact(issue, ['code', 'severity', 'blocking', 'field', 'details']) &&
  issue.code === 'concept_not_observed' && issue.severity === 'warning' && issue.blocking === false &&
  issue.field === 'conceptSourceId' && salaryExact(issue.details, ['basis']) && issue.details.basis === 'published_grh_observation';
export const declaredAdjustmentMoney = (cents, precision = 2) => {
  const value = BigInt(cents), absolute = value < 0n ? -value : value;
  return (value < 0n ? '-' : '') + absolute / 100n + '.' + String(absolute % 100n).padStart(2, '0') + '0'.repeat(precision - 2);
};

function subtotalsFor(admissions) {
  const groups = new Map();
  for (const row of admissions) { const id = groupKey(row), group = groups.get(id) ?? []; group.push(row); groups.set(id, group); }
  return [...groups].sort(([left], [right]) => order(left, right)).map(([, group]) => {
    const row = group[0], sum = sumDeclaredAdjustmentAdmissions(group);
    return { contractId: row.contractId, agreementCode: row.agreementCode, conceptCode: row.conceptCode,
      policyId: row.policyId, policySha256: row.policySha256, amountCents: sum.amountCents,
      byOriginMonth: sum.byOriginMonth, admissionsSha256: sum.admissionsSha256 };
  });
}

export function normalizeDeclaredAdjustmentCapture(raw) {
  require(salaryExact(raw, [...metadataFields, 'admissions', 'subtotals']) && raw.version === OWN_DECLARED_ADJUSTMENT_CAPTURE_VERSION &&
    typeof raw.period === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(raw.period) && POLICY_LIQUIDATION_TYPES.includes(raw.liquidationType) &&
    ['policiesSha256', 'populationSha256', 'channelsSha256', 'admissionsSha256', 'subtotalsSha256'].every(field => salaryHash(raw[field])) &&
    Array.isArray(raw.admissions) && raw.admissions.length <= 100000 && Array.isArray(raw.subtotals),
  'DECLARED_ADJUSTMENT_CAPTURE_INVALID', 'La captura debe conservar políticas, filas originales y subtotales por mes.');
  const declared = normalizeDeclaredAdjustmentPolicies({ version: OWN_MONTHLY_DECLARED_ADJUSTMENTS_VERSION, policies: raw.policies });
  require(same(declared.policies, raw.policies) && policySha256(raw.policies) === raw.policiesSha256,
    'DECLARED_ADJUSTMENT_CAPTURE_INVALID', 'La captura no conserva la política completa original.');
  const resolver = declaredAdjustmentSourceResolver(declared), refs = new Set();
  for (const row of raw.admissions) {
    require(salaryExact(row, admissionFields) && salaryUuid(row.contractId) && salaryHash(row.sourceRowSha256) && !refs.has(row.reference),
      'DECLARED_ADJUSTMENT_CAPTURE_INVALID', 'Una admisión perdió su identidad o repite una fila.');
    refs.add(row.reference);
    // Revalidate every semantic field; the original row hash is retained as
    // provenance and is recomputed from actual source rows by capture below.
    const source = { conceptSourceId: row.conceptCode, amountCents: row.amountCents, quantityDecimal: row.quantityDecimal,
      adjustmentMonth: row.adjustmentMonth, legalInstrument: row.legalInstrument, forced: false,
      [row.sourceContract === 'own-payroll-novelty-batch.v1' ? 'contractId' : 'employmentContractId']: row.contractId };
    const checked = resolver({ row: source, family: 'monthly', contractId: row.contractId, agreementCode: row.agreementCode,
      period: raw.period, liquidationType: raw.liquidationType, sourceContract: row.sourceContract, reference: row.reference });
    require(checked && same({ ...checked, sourceRowSha256: row.sourceRowSha256 }, row),
      'DECLARED_ADJUSTMENT_CAPTURE_INVALID', 'La admisión no coincide con su política y alcance originales.');
  }
  require(same([...raw.admissions].sort((left, right) => order(admissionKey(left), admissionKey(right))), raw.admissions) &&
    policySha256(raw.admissions) === raw.admissionsSha256 && same(subtotalsFor(raw.admissions), raw.subtotals) &&
    policySha256(raw.subtotals) === raw.subtotalsSha256,
  'DECLARED_ADJUSTMENT_CAPTURE_INVALID', 'Los subtotales o sus meses de origen cambiaron respecto de las admisiones.');
  return structuredClone(raw);
}

export function captureDeclaredAdjustmentSources(programme, { period, liquidationType, population, monthly, fixed }) {
  if (declaredAdjustmentProgramFields(programme).length===0) return null;
  const options = normalizeDeclaredAdjustmentProgram(programme);
  require(population?.complete === true && Array.isArray(population.employees) && population.employees.length > 0 &&
    salaryExact(monthly,['complete','batches','nativeBatches']) && monthly.complete === true &&
    Array.isArray(monthly.batches) && monthly.batches.length<=10000 && Array.isArray(monthly.nativeBatches) && monthly.nativeBatches.length<=1000,
  'DECLARED_ADJUSTMENT_CHANNEL_INCOMPLETE', 'La ausencia requiere población y ambos canales mensuales completos.');
  const byId = new Map(population.employees.map(employee => [employee.contractId, employee]));
  require(byId.size === population.employees.length, 'DECLARED_ADJUSTMENT_IDENTITY_REQUIRED', 'La población no puede repetir contratos.');
  const identity = (subject, contractId) => {
    assertNativeMonthlySubject(subject);
    const employee = byId.get(contractId);
    require(employee && subject.contractId === contractId && subject.legajo === employee.employeeNumber &&
      subject.identityToken === employee.identityToken, 'SOURCE_IDENTITY_CHANGED', 'La fuente no conserva la identidad de la población capturada.');
    return employee;
  };
  const policies = options.monthlyDeclaredAdjustmentPolicies;
  const resolver = declaredAdjustmentSourceResolver({ version: OWN_MONTHLY_DECLARED_ADJUSTMENTS_VERSION, policies });
  const admissions = [], batchIds = new Set();
  const admit = (row, employee, family, sourceContract, reference) => {
    const result = resolver({ row, family, contractId: employee.contractId, agreementCode: employee.agreementCode,
      period, liquidationType, sourceContract, reference });
    if (result) admissions.push(result);
  };
  for (const batch of monthly.batches) {
    verifyMonthlyBatch(batch, { mode: 'export' });
    require(!batchIds.has(batch.id) && batch.periodMonth === period + '-01' && batch.payrollType === liquidationType &&
      batch.contractVersion === 'payroll-novelty-batch.v2', 'SOURCE_SCOPE_INVALID', 'El lote importado no coincide con el período, tipo y contrato.');
    batchIds.add(batch.id);
    for (const row of batch.rows) {
      require(row.identityCurrent === true && row.issues.every(ownConceptObservation), 'SOURCE_INVALID', 'La fila importada conserva una incidencia.');
      admit(row, identity(row.subject, row.employmentContractId), 'monthly', batch.contractVersion, batch.id + ':' + row.rowOrdinal);
    }
  }
  for (const batch of monthly.nativeBatches) {
    ownNoveltyBatch(batch);
    require(!batchIds.has(batch.id) && batch.status === 'approved' && batch.periodMonth === period + '-01' &&
      batch.payrollType === liquidationType && batch.rowsSha256 === sourceHash(batch.rows.map(({ values, subject }) => ({ values, subject }))),
    'SOURCE_SCOPE_INVALID', 'El lote nativo requiere aprobación, integridad y alcance completos.');
    batchIds.add(batch.id); let selected = 0;
    for (const entry of batch.rows) {
      const row = entry.values;
      if (!byId.has(row.contractId)) continue;
      selected++;
      require(entry.identityCurrent === true, 'SOURCE_IDENTITY_CHANGED', 'Cambió una identidad seleccionada.');
      admit(row, identity(entry.subject, row.contractId), 'monthly', batch.version, batch.id + ':' + row.rowOrdinal);
    }
    require(selected > 0, 'SOURCE_SCOPE_INVALID', 'El lote nativo no contiene contratos del alcance elegido.');
  }
  const list = fixedList(fixed?.list, period + '-01'), exported = fixedExportData(fixed?.export, list);
  for (const row of exported.rows) {
    const employee = identity(row.subject, row.subject.contractId);
    require(row.values.payrollType === liquidationType, 'SOURCE_SCOPE_INVALID', 'La fija pertenece a otro tipo.');
    admit(row.values, employee, 'fixed', exported.version, row.recordId + ':' + row.version);
  }
  admissions.sort((left, right) => order(admissionKey(left), admissionKey(right)));
  const subtotals = subtotalsFor(admissions);
  return normalizeDeclaredAdjustmentCapture({ version: OWN_DECLARED_ADJUSTMENT_CAPTURE_VERSION, period, liquidationType,
    policies: structuredClone(policies), policiesSha256: policySha256(policies),
    populationSha256: sourceHash(population.employees), channelsSha256: sourceHash({ monthly, fixed: exported }),
    admissions, admissionsSha256: policySha256(admissions), subtotals, subtotalsSha256: policySha256(subtotals) });
}

export function verifyDeclaredAdjustmentCapture(payload) {
  const programme = payload.programState.program.definition;
  const captured = payload.sourceInventory?.declaredAdjustments;
  if (declaredAdjustmentProgramFields(programme).length===0) {
    require(captured === undefined, 'DECLARED_ADJUSTMENT_CAPTURE_INVALID', 'Un programa anterior no puede agregar esta captura.');
    return null;
  }
  const expected = captureDeclaredAdjustmentSources(programme, payload);
  require(captured !== undefined && same(expected, captured), 'DECLARED_ADJUSTMENT_CAPTURE_INVALID',
    'La captura original no coincide con las filas, los meses y los subtotales declarados.');
  return expected;
}

export function verifyDeclaredAdjustmentInput(payload, input, result = null) {
  const capture = verifyDeclaredAdjustmentCapture(payload);
  if (capture === null) return null;
  const programme = payload.programState.program.definition;
  const resolved = resolvePolicySuccession(capture.policies, { identity: policy => policy.policyId,
    scope: policy => [policy.agreementCode, policy.liquidationType, policy.sourceCode].join(':') });
  for (const person of payload.population.employees) for (const entry of resolved.filter(value =>
    resolvedPolicyAppliesTo(value, { period: payload.period, liquidationType: payload.liquidationType, agreementCode: person.agreementCode }))) {
    const policy = entry.policy, employee = input.employees.find(value => value.contractId === person.contractId);
    const values = employee?.inputs.filter(value => value.key === policy.amountInputKey) ?? [];
    const total = capture.subtotals.find(value => value.contractId === person.contractId && value.conceptCode === policy.sourceCode && value.policyId === policy.policyId);
    require(values.length === 1 && values[0].unit === 'money' && values[0].value === declaredAdjustmentMoney(total?.amountCents ?? '0', 8),
      'DECLARED_ADJUSTMENT_INPUT_CHANGED', 'El importe de la entrada no coincide con todos los eventos aprobados capturados.');
    const observations = [];
    const observe = (row, contractId, reference) => {
      if (contractId === person.contractId && row.conceptSourceId === policy.sourceCode) observations.push({sourceKind:'monthly',contractId,
        concept:row.conceptSourceId,quantity:row.quantityDecimal,amount:row.amountCents,reference});
    };
    for (const batch of payload.monthly.batches) for (const row of batch.rows) observe(row,row.employmentContractId,batch.id+':'+row.rowOrdinal);
    for (const batch of payload.monthly.nativeBatches) for (const {values:row} of batch.rows) observe(row,row.contractId,batch.id+':'+row.rowOrdinal);
    const binding = programme.bindings.find(row=>row.agreementCode===person.agreementCode&&row.key===policy.amountInputKey);
    const reference = 'Novedades:'+sourceHash(observations.length?observations:{complete:true,period:payload.period,
      liquidationType:payload.liquidationType,contractId:person.contractId,binding});
    require(values[0].sourceReference===reference,'DECLARED_ADJUSTMENT_INPUT_CHANGED','La entrada debe conservar la referencia exacta a todos los eventos originales.');
    if (result !== null) {
      const rows = result.rows.filter(row => row.contractId === person.contractId && row.conceptCode === policy.sourceCode && row.nature !== 'auxiliary');
      const owner = programme.rules.find(rule => rule.agreementCode === person.agreementCode && rule.code === policy.sourceCode && rule.nature !== 'auxiliary' &&
        rule.validFrom <= payload.period && (rule.validUntil === null || rule.validUntil >= payload.period) && rule.liquidationTypes.includes(payload.liquidationType));
      require(rows.length === 1 && rows[0].nature === owner?.nature && rows[0].amount === declaredAdjustmentMoney(total?.amountCents ?? '0'),
        'DECLARED_ADJUSTMENT_RESULT_CHANGED', 'El resultado debe conservar exactamente el importe declarado y su naturaleza.');
    }
  }
  return capture;
}

export const declaredAdjustmentCaptureMetadata = capture => Object.fromEntries(metadataFields.map(field => [field, structuredClone(capture[field])]));
export const declaredAdjustmentEmployeeEvidence = (capture, contractId) => ({
  admissions: structuredClone(capture.admissions.filter(row => row.contractId === contractId)),
  subtotals: structuredClone(capture.subtotals.filter(row => row.contractId === contractId)),
});
