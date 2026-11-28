// Verify both approved monthly channels and the complete fixed export.
// A declared incompatible code is rejected even when its amount is zero.
import {salaryExact} from './native-salary-catalog-model.js';
import {payrollRequire as require,decimal,exactAdd,quantize} from './own-payroll-exact.js';
import {policySha256,resolvePolicySuccession,resolvedPolicyAppliesTo} from './own-payroll-policy-validity.js';
import {verifyMonthlyBatch,assertNativeMonthlySubject} from './payroll-native-monthly-model.js';
import {ownNoveltyBatch} from './own-payroll-novelties-model.js';
import {fixedList,fixedExportData} from './payroll-fixed-novelties-model.js';
const sourceHash=value=>policySha256(value,{preserveLegacyUnicode:true});
const ownConceptObservation=issue=>salaryExact(issue,['code','severity','blocking','field','details'])&&issue.code==='concept_not_observed'&&issue.severity==='warning'&&issue.blocking===false&&issue.field==='conceptSourceId'&&salaryExact(issue.details,['basis'])&&issue.details.basis==='published_grh_observation';

export function verifyCappedSources({ period, liquidationType, population, monthly, fixed },policies) {
  require(population?.complete === true && Array.isArray(population.employees) && population.employees.length > 0 &&
    salaryExact(monthly,['complete','batches','nativeBatches']) && monthly.complete === true &&
    Array.isArray(monthly.batches) && monthly.batches.length<=10000 && Array.isArray(monthly.nativeBatches) && monthly.nativeBatches.length<=1000,
  'CAPPED_CHANNEL_INCOMPLETE', 'La ausencia requiere población y ambos canales mensuales completos.');
  const byId = new Map(population.employees.map(employee => [employee.contractId, employee]));
  require(byId.size === population.employees.length, 'QUANTITY_ONLY_IDENTITY_REQUIRED', 'La población no puede repetir contratos.');
  const identity = (subject, contractId) => {
    assertNativeMonthlySubject(subject);
    const employee = byId.get(contractId);
    require(employee && subject.contractId === contractId && subject.legajo === employee.employeeNumber &&
      subject.identityToken === employee.identityToken, 'SOURCE_IDENTITY_CHANGED', 'La fuente no conserva la identidad de la población capturada.');
    return employee;
  };
  const resolved=resolvePolicySuccession(policies,{identity:p=>p.policyId,scope:p=>p.agreementCode+':'+p.liquidationType});
  const batchIds = new Set();
  const admit = (row, employee, family, sourceContract, reference) => {
    const selected=resolved.filter(e=>resolvedPolicyAppliesTo(e,{period,liquidationType,agreementCode:employee.agreementCode}));
    require(selected.length===1,'CAPPED_POLICY_REQUIRED','El alcance debe conservar una única política efectiva.');
    require(!selected[0].policy.incompatibleSourceCodes.includes(row.conceptSourceId),'CAPPED_SOURCE_INCOMPATIBLE','La política declara esta fuente incompatible; requiere tratamiento propio antes del cálculo.');
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
    admit(row.values, employee, 'fixed', exported.version, row.recordId + ':' + row.proposalId);
  }
  return true;
}
