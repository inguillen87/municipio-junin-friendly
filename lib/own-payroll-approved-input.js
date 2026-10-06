// Server-side adapter of complete, already authorized source reads. This is not
// an HTTP calculation endpoint, an identity resolver or a source-certification
// mechanism: the calling transaction must acquire and certify every source.
import { createHash } from 'node:crypto';
import { salaryExact, salaryHash, salaryUuid, salarySerialized } from '../assets/native-salary-catalog-model.js';
import { ownProgramBootstrap, ownProgramDefinition } from '../assets/own-payroll-program-model.js';
import { verifyMonthlyBatch, assertNativeMonthlySubject } from '../assets/payroll-native-monthly-model.js';
import { fixedList, fixedExportData, fixedCoverage } from '../assets/payroll-fixed-novelties-model.js';
import { decimal, exactAdd, quantize, payrollRequire as require } from '../assets/own-payroll-exact.js';
import { normalizeOwnPayrollInput } from '../assets/own-payroll-engine.js';
import { ownNoveltyBatch } from '../assets/own-payroll-novelties-model.js';
const hash = v => createHash('sha256').update(salarySerialized(v)).digest('hex');
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const active = (r, period) => r.validFrom <= period && (r.validUntil === null || r.validUntil >= period);
// SQL101 records absence in GRH as a nonblocking observation. Eligibility here
// comes from the independently approved own catalog and program, checked above
// and below; no other observation is waived. The complete issue remains hashed
// in the captured sources, so this never rewrites the original approved batch.
const ownConceptObservation = issue => salaryExact(issue, ['code', 'severity', 'blocking', 'field', 'details'])
  && issue.code === 'concept_not_observed' && issue.severity === 'warning' && issue.blocking === false
  && issue.field === 'conceptSourceId' && salaryExact(issue.details, ['basis']) && issue.details.basis === 'published_grh_observation';
const cents = v => { require(typeof v === 'string' && /^-?(0|[1-9][0-9]{0,17})$/.test(v) && v !== '-0', 'SOURCE_VALUE_MISSING', 'El importe debe estar informado como centavos exactos.'); const n = BigInt(v), a = n < 0n ? -n : n; return (n < 0n ? '-' : '') + a / 100n + '.' + String(a % 100n).padStart(2, '0'); };
export function prepareOwnPayrollInput({ period, liquidationType, selection, programState, population, monthly, fixed }) {
  ownProgramBootstrap(programState);
  const p = programState.program;
  require(p.revision > 0 && p.salaryVersion === programState.salaryCatalog.version, 'PROGRAM_APPROVAL_REQUIRED', 'Se necesita un programa aprobado contra el catálogo salarial vigente.');
  const definition = ownProgramDefinition(p.definition, programState.salaryCatalog.items);
  require(salaryExact(population, ['complete', 'version', 'employees']) && population.complete === true && salaryHash(population.version) && Array.isArray(population.employees) && population.employees.length > 0 && population.employees.length <= 10000, 'POPULATION_INCOMPLETE', 'La población propia debe estar completa y versionada.');
  const byId = new Map();
  for (const e of population.employees) {
    require(salaryExact(e, ['contractId', 'employeeNumber', 'agreementCode', 'departmentCode', 'categoryCode', 'identityToken', 'origin']) && salaryUuid(e.contractId) && [e.employeeNumber, e.agreementCode, e.departmentCode, e.categoryCode].every(code) && salaryHash(e.identityToken) && e.origin === 'MUNICONTROL' && !byId.has(e.contractId), 'POPULATION_INVALID', 'La población contiene un contrato repetido o un encuadre propio sin verificar.'); byId.set(e.contractId, e);
  }
  const observations = [], identities = s => { assertNativeMonthlySubject(s); const e = byId.get(s.contractId); require(e && e.employeeNumber === s.legajo && e.identityToken === s.identityToken, 'SOURCE_IDENTITY_CHANGED', 'Una novedad no coincide con la identidad de la población capturada.'); return e; };
  require((salaryExact(monthly, ['complete', 'batches']) || salaryExact(monthly, ['complete', 'batches', 'nativeBatches'])) && monthly.complete === true && Array.isArray(monthly.batches) && monthly.batches.length <= 10000 && (!Object.hasOwn(monthly,'nativeBatches') || Array.isArray(monthly.nativeBatches) && monthly.nativeBatches.length <= 1000), 'SOURCE_INCOMPLETE', 'Se necesita el conjunto completo de novedades aprobadas.');
  const batchIds = new Set();
  for (const batch of monthly.batches) {
    verifyMonthlyBatch(batch, { mode: 'export' });
    require(!batchIds.has(batch.id) && batch.periodMonth === period + '-01' && batch.payrollType === liquidationType && batch.contractVersion === 'payroll-novelty-batch.v2', 'SOURCE_SCOPE_INVALID', 'Una novedad está repetida o no pertenece al período, tipo y fuente propia.'); batchIds.add(batch.id);
    for (const r of batch.rows) {
      require(r.identityCurrent === true && r.issues.every(ownConceptObservation), 'SOURCE_INVALID', 'Una novedad aprobada tiene una identidad o incidencias sin resolver.'); identities(r.subject);
      require(r.adjustmentMonth === null || r.adjustmentMonth === period + '-01', 'RETROACTIVE_RULE_REQUIRED', 'El ajuste de otro mes necesita una regla explícita de retroactividad.');
      require(r.forced === false, 'FORCED_RULE_REQUIRED', 'El modo forzado necesita una regla explícita; no se aplica como reemplazo implícito.');
      observations.push({ sourceKind: 'monthly', contractId: r.employmentContractId, concept: r.conceptSourceId, quantity: r.quantityDecimal, amount: r.amountCents, reference: batch.id + ':' + r.rowOrdinal });
    }
  }
  // Capture every original row; the explicit payroll scope determines which
  // rows are consumed. Search/pagination never define this selection.
  for (const batch of monthly.nativeBatches ?? []) {
    ownNoveltyBatch(batch);
    require(!batchIds.has(batch.id) && batch.status === 'approved' && batch.periodMonth === period + '-01' && batch.payrollType === liquidationType && batch.rowsSha256 === hash(batch.rows.map(({values,subject})=>({values,subject}))), 'SOURCE_SCOPE_INVALID', 'El lote propio completo no coincide con la aprobación, integridad, período o tipo.');batchIds.add(batch.id);
    let selected = 0;
    for (const row of batch.rows) {
      const r=row.values;
      if (!byId.has(r.contractId)) continue;
      selected++; require(row.identityCurrent === true, 'SOURCE_IDENTITY_CHANGED', 'Cambió una identidad seleccionada del lote propio.');identities(row.subject);
      require(r.adjustmentMonth === null || r.adjustmentMonth === period + '-01', 'RETROACTIVE_RULE_REQUIRED', 'El ajuste de otro mes necesita una regla explícita de retroactividad.');
      require(r.forced === false, 'FORCED_RULE_REQUIRED', 'El modo forzado necesita una regla explícita; no se aplica como reemplazo implícito.');
      observations.push({sourceKind:'monthly',contractId:r.contractId,concept:r.conceptSourceId,quantity:r.quantityDecimal,amount:r.amountCents,reference:batch.id+':'+r.rowOrdinal});
    }
    require(selected > 0, 'SOURCE_SCOPE_INVALID', 'El lote capturado no corresponde a la selección declarada.');
  }
  const fixedData = fixedList(fixed.list, period + '-01'), fixedRows = fixedExportData(fixed.export, fixedData);
  for (const r of fixedRows.rows) {
    identities(r.subject);
    require(r.values.payrollType === liquidationType, 'SOURCE_SCOPE_INVALID', 'Una novedad fija pertenece a otro tipo de liquidación.');
    require(!fixedCoverage(r.values, period + '-01').partial, 'PRORATION_REQUIRED', 'Una vigencia parcial necesita una regla de prorrateo expresa.');
    require(r.values.forced === false, 'FORCED_RULE_REQUIRED', 'La novedad fija forzada necesita una regla explícita.');
    observations.push({ sourceKind: 'fixed', contractId: r.subject.contractId, concept: r.values.conceptSourceId, quantity: r.values.quantityDecimal, amount: r.values.amountCents, reference: r.recordId + ':' + r.proposalId });
  }
  const used = new Set(), inputsFor = e => {
    const usedKeys = new Set();
    const walk = n => { if (n.op === 'input') usedKeys.add(n.key); for (const k of ['left', 'right', 'value', 'condition', 'then', 'else']) if (n[k] && typeof n[k] === 'object') walk(n[k]); };
    for (const rule of definition.rules.filter(r => r.agreementCode === e.agreementCode && active(r, period) && r.liquidationTypes.includes(liquidationType))) walk(rule.expression);
    return definition.bindings.filter(b => b.agreementCode === e.agreementCode && usedKeys.has(b.key)).map(b => {
      let values, reference;
      if (b.sourceKind === 'parameter' || b.sourceKind === 'scale') {
        const rows = programState.salaryCatalog.items.filter(d => d.active && d.kind === (b.sourceKind === 'scale' ? 'scale' : 'concept') && d.code === b.sourceCode && d.agreementCode === e.agreementCode && active(d, period) && (b.sourceKind !== 'scale' || d.categoryCode === e.categoryCode));
        require(rows.length === 1 && rows[0].value !== null && rows[0].unit === b.unit, 'SOURCE_VALUE_MISSING', 'Falta el parámetro o la escala exacta del convenio, clase y período.'); values = [rows[0].value]; reference = 'Catálogo:' + p.salaryVersion;
      } else {
        const family = b.sourceKind.startsWith('monthly_') ? 'monthly' : 'fixed', field = b.sourceKind.endsWith('_quantity') ? 'quantity' : 'amount';
        const matches = observations.filter(r => r.sourceKind === family && r.contractId === e.contractId && r.concept === b.sourceCode);
        for (const r of matches) used.add(r.reference);
        require(matches.length > 0 || b.onMissing === 'zero', 'SOURCE_VALUE_MISSING', 'No hay un valor informado; la regla no autoriza suponer cero.');
        require(b.combine === 'sum' || matches.length <= 1, 'SOURCE_AMBIGUOUS', 'La regla exige una fuente única y se encontraron varias.');
        values = matches.length ? matches.map(r => { require(r[field] !== null, 'SOURCE_VALUE_MISSING', 'El valor ausente de una novedad no equivale a cero.'); return field === 'amount' ? cents(r[field]) : r[field]; }) : ['0'];
        reference = (family === 'monthly' ? 'Novedades:' : 'Fijas:') + hash(matches.length ? matches : { complete: true, period, liquidationType, contractId: e.contractId, binding: b });
      }
      const value = values.reduce((sum, v) => exactAdd(sum, decimal(v)), decimal('0'));
      return { key: b.key, unit: b.unit, value: quantize(value, { precision: 8, mode: 'exact' }).amount, sourceReference: reference };
    });
  };
  const employees = population.employees.map(e => ({ contractId: e.contractId, employeeNumber: e.employeeNumber, agreementCode: e.agreementCode, departmentCode: e.departmentCode, inputs: inputsFor(e) }));
  require(observations.every(r => used.has(r.reference)), 'SOURCE_UNUSED', 'Hay una novedad aprobada sin tratamiento en las reglas; no se omitió del conjunto.');
  return normalizeOwnPayrollInput({ version: 'own-payroll-input.v1', period, liquidationType, selection, populationComplete: true, totalsPrecision: definition.totalsPrecision, sourceVersions: { population: population.version, rules: hash({ program: p, salary: programState.salaryCatalog }), novelties: hash({ monthly, fixed: fixedRows }) }, employees, rules: definition.rules });
}
