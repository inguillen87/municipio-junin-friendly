import {monthlyDayDeclarationsApply,ownProgramParticipationSourceRequired} from '../assets/own-monthly-day-declaration-program.js';
import {approvedMonthlyDayInputs} from './own-monthly-day-declaration-input.js';
import {monthlyDayApplies} from '../assets/own-monthly-day-policy-program.js';
import {verifyMonthlyDayCapture} from './own-monthly-day-policy-input.js';
import { participationCapture } from '../assets/own-period-participation-model.js';
import { ownProgramParticipation, participationRules } from '../assets/own-period-participation-program.js';
// Server-side adapter of complete, already authorized source reads. This is not
// an HTTP calculation endpoint, an identity resolver or a source-certification
// mechanism: the calling transaction must acquire and certify every source.
import { createHash } from 'node:crypto';
import { salaryExact, salaryHash, salaryUuid, salarySerialized } from '../assets/native-salary-catalog-model.js';
import { ownProgramBootstrap, ownProgramDefinition, ownProgramNamespaced, ownProgramSeniority, ownProgramWorkingTime } from '../assets/own-payroll-program-model.js';
import { seniorityCapture } from '../assets/own-salary-seniority-model.js';
import { workingTimeCapture } from '../assets/own-contract-working-time-model.js';
import { agreementWorkingTimeCapture } from '../assets/own-agreement-working-time-model.js';
import { ownProgramAgreementWorkingTime, OWN_AGREEMENT_WORKING_TIME_VERSION } from '../assets/own-agreement-working-time-program.js';
import {salaryConditionsCapture} from '../assets/own-contract-salary-conditions-model.js';
import {ownPayrollConditions,CONDITION_FIELD_UNITS,CLASSIFICATION_FIELD_UNITS,conditionUnit,OWN_PAYROLL_CONDITIONS_VERSION} from '../assets/own-payroll-conditions.js';
import { verifyMonthlyBatch, assertNativeMonthlySubject } from '../assets/payroll-native-monthly-model.js';
import { fixedList, fixedExportData, fixedCoverage } from '../assets/payroll-fixed-novelties-model.js';
import { decimal, exactAdd, quantize, payrollRequire as require } from '../assets/own-payroll-exact.js';
import { normalizeOwnPayrollInput, ownPayrollEmployeeNumber } from '../assets/own-payroll-engine.js';
import { ownNoveltyBatch } from '../assets/own-payroll-novelties-model.js';
import {ownProgramPeriodContext,periodContextCapture,periodContextFields} from '../assets/own-payroll-period-context.js';
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
export function prepareOwnPayrollInput({ period, liquidationType, selection, programState, population, monthly, fixed, employmentFacts, periodParticipation, workingTime, agreementWorkingTime, salaryConditions, periodContext, monthlyDays, monthlyDaysScope, monthlyDayDeclarations }) {
  ownProgramBootstrap(programState);
  const p = programState.program;
  require(p.revision > 0 && p.salaryVersion === programState.salaryCatalog.version, 'PROGRAM_APPROVAL_REQUIRED', 'Se necesita un programa aprobado contra el catálogo salarial vigente.');
  const definition = ownProgramDefinition(p.definition, programState.salaryCatalog.items);
  require(salaryExact(population, ['complete', 'version', 'employees']) && population.complete === true && salaryHash(population.version) && Array.isArray(population.employees) && population.employees.length > 0 && population.employees.length <= 10000, 'POPULATION_INCOMPLETE', 'La población propia debe estar completa y versionada.');
  const byId = new Map();
  for (const e of population.employees) {
    require(salaryExact(e, ['contractId', 'employeeNumber', 'agreementCode', 'departmentCode', 'categoryCode', 'identityToken', 'origin']) && salaryUuid(e.contractId) && ownPayrollEmployeeNumber(e.employeeNumber) && [e.agreementCode, e.departmentCode, e.categoryCode].every(code) && salaryHash(e.identityToken) && e.origin === 'MUNICONTROL' && !byId.has(e.contractId), 'POPULATION_INVALID', 'La población contiene un contrato repetido o un encuadre propio sin verificar.'); byId.set(e.contractId, e);
  }
  const hasPeriodContext=ownProgramPeriodContext(definition);
  require(hasPeriodContext||periodContext===undefined,'SOURCE_SCOPE_INVALID','El programa no declara contexto del período; no se agregan datos implícitos.');
  const context=hasPeriodContext?periodContextCapture(periodContext,period):null;
  if(context)require(context.sha256===hash(periodContextFields(period)),'SOURCE_VERSION_INVALID','La huella del contexto no conserva el período declarado.');
  const hasSeniority = ownProgramSeniority(definition);
  require(hasSeniority || employmentFacts === undefined, 'SOURCE_SCOPE_INVALID', 'El programa anterior no declara antigüedad; no se agregan datos implícitos.');
  const facts = hasSeniority ? seniorityCapture(employmentFacts, population.employees, period) : null;
  const hasParticipation = ownProgramParticipation(definition);
  const needsParticipation=ownProgramParticipationSourceRequired(definition,liquidationType);
  require(needsParticipation || periodParticipation === undefined, 'SOURCE_SCOPE_INVALID', 'El programa no declara participación del período.');
  const periodFacts = needsParticipation ? participationCapture(periodParticipation, population.employees, period) : null;
  const hasWorkingTime = ownProgramWorkingTime(definition);
  require(hasWorkingTime || workingTime === undefined, 'SOURCE_SCOPE_INVALID', 'El programa anterior no declara jornada; no se agregan horas implícitas.');
  const workingFacts = hasWorkingTime ? workingTimeCapture(workingTime, population.employees, period) : null;
  const hasAgreementWorkingTime = ownProgramAgreementWorkingTime(definition);
  require(hasAgreementWorkingTime || agreementWorkingTime === undefined, 'SOURCE_SCOPE_INVALID', 'El programa no declara horas mensuales del convenio; no se agregan valores implícitos.');
  const agreementFacts = hasAgreementWorkingTime ? agreementWorkingTimeCapture(agreementWorkingTime, population.employees, period) : null;
  const agreementByCode = new Map(agreementFacts?.records.map(r => [r.agreementCode, r]) ?? []);
  const hasConditions=ownPayrollConditions(definition);
  require(hasConditions||salaryConditions===undefined,'SOURCE_SCOPE_INVALID','El programa anterior no declara condiciones propias; no se agregan atributos implícitos.');
  const conditionFacts=hasConditions?salaryConditionsCapture(salaryConditions,population.employees,period):null;
  const hasMonthlyDays=monthlyDayApplies(definition,liquidationType);
  require(hasMonthlyDays||monthlyDays===undefined&&monthlyDaysScope===undefined,'SOURCE_SCOPE_INVALID','No se agregan días fuera del programa mensual declarado.');
  if(hasMonthlyDays)require(monthlyDaysScope?.scopeVersion===programState.scopeVersion,'SOURCE_SCOPE_INVALID','Cambió el ámbito actual del programa y su captura de días.');
  const dayFacts=hasMonthlyDays?verifyMonthlyDayCapture(monthlyDays,population.employees,period,monthlyDaysScope,p):null,dayById=new Map(dayFacts?.records.map(r=>[r.contractId.toLowerCase(),r])??[]);
  const hasDeclaredDays=monthlyDayDeclarationsApply(definition,liquidationType);
  require(hasDeclaredDays||monthlyDayDeclarations===undefined,'SOURCE_SCOPE_INVALID','El programa y tipo no declaran días aprobados; no se agrega una fuente implícita.');
  const declaredDays=hasDeclaredDays?approvedMonthlyDayInputs(monthlyDayDeclarations,population.employees,period):null;
  const declaredDaysById=new Map(declaredDays?.map(r=>[r.contractId.toLowerCase(),r])??[]);
  const populationSources = {employees:population.employees, ...(hasDeclaredDays?{monthlyDayDeclarations}:{}), ...(dayFacts?{monthlyDays:dayFacts,monthlyDaysScope}:{}), ...(context?{periodContext:context}:{}), ...(facts?{employmentFacts:facts}:{}), ...(periodFacts?{periodParticipation:periodFacts}:{}), ...(workingFacts?{workingTime:workingFacts}:{}), ...(agreementFacts?{agreementWorkingTime:agreementFacts}:{}),...(conditionFacts?{salaryConditions:conditionFacts}:{})};
  if (hasDeclaredDays || dayFacts || context || facts || periodFacts || workingFacts || agreementFacts || conditionFacts) require((!facts || facts.version === hash(['own-salary-seniority.v1',period,facts.records])) && (!periodFacts || periodFacts.version === hash(['own-period-participation.v1',period,periodFacts.records])) && (!workingFacts || workingFacts.version === hash(['own-contract-working-time.v1',period,workingFacts.records])) && (!agreementFacts || agreementFacts.version === hash([OWN_AGREEMENT_WORKING_TIME_VERSION,period,agreementFacts.records])) && (!conditionFacts||conditionFacts.version===hash([OWN_PAYROLL_CONDITIONS_VERSION,period,conditionFacts.records])) && population.version === hash(populationSources), 'SOURCE_VERSION_INVALID', 'La población no conserva sus fuentes aprobadas exactas.');
  const conditionsById=new Map(conditionFacts?.records.map(r=>[r.contractId.toLowerCase(),r])??[]);
  const workingById = new Map(workingFacts?.records.map(r => [r.contractId.toLowerCase(), r.configuration]) ?? []);
  const periodById = new Map(periodFacts?.records.map(r=>[r.contractId.toLowerCase(),r]) ?? []);
  for (const r of periodFacts?.records ?? []) require(r.fullPeriod || r.configuration.revision>0 && r.configuration.definition.recognizedUnits!==null && r.configuration.definition.baseUnits!==null, 'PARTICIPATION_APPROVAL_REQUIRED', 'Una vigencia parcial necesita cantidad y base documentadas y aprobadas; no se omite el contrato.');
  const effectiveRules = participationRules(definition);
  const factById = new Map(facts?.records.map(r => [r.contractId.toLowerCase(), r.configuration]) ?? []);
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
    require(hasParticipation && definition.periodParticipation.fixedValidity === 'declared_values' || !fixedCoverage(r.values, period + '-01').partial, 'PRORATION_REQUIRED', 'Una vigencia parcial necesita una regla de prorrateo expresa.');
    require(r.values.forced === false, 'FORCED_RULE_REQUIRED', 'La novedad fija forzada necesita una regla explícita.');
    observations.push({ sourceKind: 'fixed', contractId: r.subject.contractId, concept: r.values.conceptSourceId, quantity: r.values.quantityDecimal, amount: r.values.amountCents, reference: r.recordId + ':' + r.proposalId });
  }
  const used = new Set(), inputsFor = e => {
    const usedKeys = new Set();
    const walk = n => { if (n.op === 'input'||n.op==='match') usedKeys.add(n.key); for (const k of ['left', 'right', 'value', 'condition', 'then', 'else']) if (n[k] && typeof n[k] === 'object') walk(n[k]); };
    for (const rule of effectiveRules.filter(r => r.agreementCode === e.agreementCode && active(r, period) && r.liquidationTypes.includes(liquidationType))) walk(rule.expression);
    return definition.bindings.filter(b => b.agreementCode === e.agreementCode && usedKeys.has(b.key)).map(b => {
      let values, reference;
      if(b.sourceKind==='monthly_day_declaration_fact'){
        const r=declaredDaysById.get(e.contractId.toLowerCase());
        require(r&&b.unit==='days'&&['recognizedDays','baseDays'].includes(b.sourceField),'SOURCE_VALUE_MISSING','Falta la declaración tipada aprobada del contrato y período. No se deduce del calendario ni de la participación genérica.');
        return{key:b.key,unit:'days',value:r[b.sourceField],sourceReference:['Días propios aprobados',r.configurationVersion,r.approvalId,period,b.sourceField].join(':')};
      }
      if(b.sourceKind==='monthly_day_fact'){const r=dayById.get(e.contractId.toLowerCase());require(r,'MONTHLY_DAY_CAPTURE_INVALID','Falta un contrato en la captura mensual completa.');return{key:b.key,unit:'days',value:r[b.sourceField],sourceReference:['monthly-day',dayFacts.version,r.source.sha256,b.sourceField].join(':')};}
      if(b.sourceKind==='period_context_fact'){
        require(context,'SOURCE_VALUE_MISSING','Falta el contexto verificado del período declarado.');
        return{key:b.key,unit:b.unit,value:context.monthNumber,sourceReference:[context.version,context.sha256,context.period,'monthNumber'].join(':')};
      }
      if (b.sourceKind === 'period_fact') {
        const r=periodById.get(e.contractId.toLowerCase());
        require(r, 'PARTICIPATION_APPROVAL_REQUIRED', 'Falta la participación capturada de un contrato.');
        const value=r.fullPeriod?'1':r.configuration.definition[b.sourceField];
        return {key:b.key,unit:b.unit,value,sourceReference:r.fullPeriod?'Período continuo; identidad 1/1; programa '+p.version:'Participación aprobada '+r.configuration.approvalId+'; '+b.sourceField};
      }
      if(b.sourceKind==='classification_fact'){
        require(CLASSIFICATION_FIELD_UNITS[b.sourceField]===b.unit&&code(e[b.sourceField]),'SOURCE_VALUE_MISSING','Falta el encuadre propio exacto de la población capturada. No se deduce del nombre o del legajo.');
        return{key:b.key,unit:b.unit,value:e[b.sourceField],sourceReference:['Encuadre propio',population.version,e.identityToken.slice(0,12),b.sourceField].join(':')};
      }
      if(b.sourceKind==='salary_condition_fact'){
        const c=conditionsById.get(e.contractId.toLowerCase()),field=b.sourceField;
        require(c?.revision>0&&c.definition!==null,'SOURCE_VALUE_MISSING','Falta la declaración completa aprobada para el contrato y período; no se supone cero, no ni ausencia de título.');
        const d=c.definition,value=field==='titleStatus'?(d.title.status==='not_reported'?null:d.title.status):field==='titleCode'?d.title.code:field==='titlePercentage'?d.title.percentage:d[field];
        require(CONDITION_FIELD_UNITS[field]===b.unit,'SOURCE_VALUE_MISSING','El componente de la condición tiene otra unidad.');
        // Keep nullable declarations intact. Only an evaluated reviewed branch
        // may consume a value; no-title is not a zero percentage.
        const sourceReference=['Condiciones propias',conditionFacts.version,c.approvalId,period,field,d.asOfDate].join(':');
        return{key:b.key,unit:b.unit,value:conditionUnit(b.unit)||value===null?value:quantize(decimal(value),{precision:8,mode:'exact'}).amount,sourceReference};
      }
      if (b.sourceKind === 'agreement_time_fact') {
        const c = agreementByCode.get(e.agreementCode);
        require(c?.revision > 0 && c.definition.monthlyHours !== null, 'SOURCE_VALUE_MISSING', 'Faltan las horas mensuales del convenio aprobadas para el período. No se sustituyen por la jornada de la persona ni se supone cero.');
        values = [c.definition.monthlyHours];
        reference = ['Horas del convenio', agreementFacts.version, c.approvalId, period, 'monthlyHours', c.definition.asOfDate].join(':');
      } else if (b.sourceKind === 'working_time_fact') {
        const c = workingById.get(e.contractId.toLowerCase()), field = b.sourceField;
        require(c?.revision > 0 && c.definition[field] !== null, 'SOURCE_VALUE_MISSING', 'Falta la jornada contractual aprobada para el contrato y período. Sin informar no equivale a cero.');
        values = [c.definition[field]];
        reference = ['Jornada propia', c.version, c.approvalId, period, field, c.definition.asOfDate].join(':');
      } else if (b.sourceKind === 'employment_fact') {
        const c = factById.get(e.contractId.toLowerCase()), field = b.sourceField === 'seniorityYears' ? 'years' : 'months';
        require(c?.revision > 0 && c.definition[field] !== null, 'SOURCE_VALUE_MISSING', 'Falta la antigüedad reconocida y aprobada para el contrato y período. Sin informar no equivale a cero.');
        values = [c.definition[field]];
        // The immutable approved revision retains the whole documentary reference.
        // Keep the engine's bounded provenance compact; never truncate the document.
        reference = ['Antigüedad propia', c.version, c.approvalId, period, field, c.definition.asOfDate].join(':');
      } else if (['parameter', 'auxiliary_parameter', 'scale', 'scale_reference'].includes(b.sourceKind)) {
        const isScale = ['scale', 'scale_reference'].includes(b.sourceKind), isReference = b.sourceKind === 'scale_reference';
        const rows = programState.salaryCatalog.items.filter(d => d.active && d.kind === (isScale ? 'scale' : b.sourceKind === 'auxiliary_parameter' ? 'auxiliary' : 'concept') && (!ownProgramNamespaced(definition) || d.kind !== 'concept' || d.nature !== 'auxiliary') && d.code === b.sourceCode && d.agreementCode === (isReference ? b.sourceAgreementCode : e.agreementCode) && active(d, period) && (!isScale || d.categoryCode === (isReference ? b.sourceCategoryCode : e.categoryCode)));
        require(rows.length === 1 && rows[0].value !== null && rows[0].unit === b.unit, 'SOURCE_VALUE_MISSING', 'Falta el parámetro o la escala exacta del convenio, clase y período.'); values = [rows[0].value]; reference = 'Catálogo:' + p.salaryVersion;
        if (isReference) reference += ':escala:' + [rows[0].agreementCode, rows[0].code, rows[0].categoryCode, rows[0].validFrom, rows[0].validUntil ?? 'sin término'].join(':');
        if (b.sourceKind === 'auxiliary_parameter') reference += ':auxiliar:' + [rows[0].agreementCode, rows[0].code, rows[0].validFrom].join(':');
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
  return normalizeOwnPayrollInput({ version: ownProgramNamespaced(definition) ? 'own-payroll-input.v2' : 'own-payroll-input.v1',...(hasConditions?{salaryConditionsVersion:OWN_PAYROLL_CONDITIONS_VERSION}:{}), period, liquidationType, selection, populationComplete: true, totalsPrecision: definition.totalsPrecision, sourceVersions: { population: population.version, rules: hash({ program: p, salary: programState.salaryCatalog }), novelties: hash({ monthly, fixed: fixedRows }) }, employees, rules: effectiveRules });
}
