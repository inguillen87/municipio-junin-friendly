// Revalidate original approved rows before consumption and finalization.
// No derived event, input/result field or persisted capture extension is created.
import {salaryExact} from './native-salary-catalog-model.js';
import {payrollRequire as require,decimal,exactAdd,quantize} from './own-payroll-exact.js';
import {policySha256,resolvePolicySuccession,resolvedPolicyAppliesTo} from './own-payroll-policy-validity.js';
import {verifyMonthlyBatch,assertNativeMonthlySubject} from './payroll-native-monthly-model.js';
import {ownNoveltyBatch} from './own-payroll-novelties-model.js';
import {fixedList,fixedExportData} from './payroll-fixed-novelties-model.js';
import {quantityOnlyProgramFields,normalizeQuantityOnlyProgram,quantityOnlySourceResolver,quantityOnlyScope} from './own-payroll-quantity-only-inputs.js';
const sourceHash=value=>policySha256(value,{preserveLegacyUnicode:true});
const ownConceptObservation=issue=>salaryExact(issue,['code','severity','blocking','field','details'])&&issue.code==='concept_not_observed'&&issue.severity==='warning'&&issue.blocking===false&&issue.field==='conceptSourceId'&&salaryExact(issue.details,['basis'])&&issue.details.basis==='published_grh_observation';

export function quantityOnlyExpectedInputs(programme, { period, liquidationType, population, monthly, fixed }) {
  if (quantityOnlyProgramFields(programme).length===0) return null;
  const options = normalizeQuantityOnlyProgram(programme);
  require(population?.complete === true && Array.isArray(population.employees) && population.employees.length > 0 &&
    salaryExact(monthly,['complete','batches','nativeBatches']) && monthly.complete === true &&
    Array.isArray(monthly.batches) && monthly.batches.length<=10000 && Array.isArray(monthly.nativeBatches) && monthly.nativeBatches.length<=1000,
  'QUANTITY_ONLY_CHANNEL_INCOMPLETE', 'La ausencia requiere población y ambos canales mensuales completos.');
  const byId = new Map(population.employees.map(employee => [employee.contractId, employee]));
  require(byId.size === population.employees.length, 'QUANTITY_ONLY_IDENTITY_REQUIRED', 'La población no puede repetir contratos.');
  const identity = (subject, contractId) => {
    assertNativeMonthlySubject(subject);
    const employee = byId.get(contractId);
    require(employee && subject.contractId === contractId && subject.legajo === employee.employeeNumber &&
      subject.identityToken === employee.identityToken, 'SOURCE_IDENTITY_CHANGED', 'La fuente no conserva la identidad de la población capturada.');
    return employee;
  };
  const policies = options.quantityOnlyInputPolicies;
  const resolver = quantityOnlySourceResolver(programme);
  const admissions = [], batchIds = new Set();
  const admit = (row, employee, family, sourceContract, reference) => {
    const result = resolver({ row, family, contractId: employee.contractId, agreementCode: employee.agreementCode,
      period, liquidationType, sourceContract, reference });
    if (result) admissions.push({sourceKind:family,contractId:employee.contractId,concept:row.conceptSourceId,quantity:row.quantityDecimal,amount:row.amountCents,reference});
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
  const references=new Set();
  for(const row of admissions){require(!references.has(row.reference),'QUANTITY_ONLY_ROW_DUPLICATE','La misma fila no puede consumirse dos veces.');references.add(row.reference);}
  const expected=[],resolved=resolvePolicySuccession(policies,{identity:p=>p.policyId,scope:quantityOnlyScope});
  for(const person of population.employees)for(const entry of resolved.filter(e=>resolvedPolicyAppliesTo(e,{period,liquidationType,agreementCode:person.agreementCode}))){
    const policy=entry.policy,family=policy.sourceKind.split('_')[0],binding=programme.bindings.find(b=>b.agreementCode===person.agreementCode&&b.key===policy.quantityInputKey);
    const matches=admissions.filter(r=>r.contractId===person.contractId&&r.concept===policy.sourceCode&&r.sourceKind===family);
    const value=matches.reduce((sum,row)=>exactAdd(sum,decimal(row.quantity)),decimal('0'));
    const sourceReference=(family==='monthly'?'Novedades:':'Fijas:')+sourceHash(matches.length?matches:{complete:true,period,liquidationType,contractId:person.contractId,binding});
    expected.push({contractId:person.contractId,agreementCode:person.agreementCode,key:policy.quantityInputKey,unit:policy.quantityUnit,value:quantize(value,{precision:8,mode:'exact'}).amount,sourceReference});
  }
  return expected;
}

export function verifyQuantityOnlyInput(payload,input=null){
  const expected=quantityOnlyExpectedInputs(payload.programState.program.definition,payload);
  if(expected===null||input===null)return expected;
  for(const row of expected){
    const employees=input.employees.filter(e=>e.contractId===row.contractId),values=employees[0]?.inputs.filter(v=>v.key===row.key)??[];
    require(employees.length===1&&employees[0].agreementCode===row.agreementCode&&values.length===1&&values[0].unit===row.unit&&values[0].value===row.value&&values[0].sourceReference===row.sourceReference,'QUANTITY_ONLY_INPUT_CHANGED','La cantidad o su procedencia no coincide con las filas originales completas.');
  }
  return expected;
}
