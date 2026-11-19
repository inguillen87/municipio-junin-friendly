import {catalogueValueResolver,catalogueValueSource} from '../assets/own-payroll-catalogue-values.js';
import {verifyCappedSources} from '../assets/own-payroll-capped-sources.js';
import {conditionalSourceResolver,conditionalSourceKind} from '../assets/own-payroll-conditional-sources.js';
import {captureCappedPolicies,verifyCappedSource} from '../assets/own-payroll-capped-deductions.js';
import {optionalScaleResolver} from '../assets/own-payroll-optional-scales.js';
import {captureSourceCoverage,assertSourceCoverageEvent} from '../assets/own-payroll-source-coverage.js';
import {quantityOnlyExpectedInputs} from '../assets/own-payroll-quantity-only-capture.js';
import {captureDeclaredAdjustmentSources} from '../assets/own-payroll-declared-adjustments-capture.js';
import {monthlyForcedSourceResolver} from '../assets/own-payroll-monthly-forced-amounts.js';
import {ownPayrollFamilyTariffs} from '../assets/own-payroll-family-tariffs.js';
import {prepareOwnPayrollProgrammeNonapplicationSource} from './own-payroll-programme-source-preparation.js';
import {captureOwnPayrollNonapplication,nonapplicationCopy,nonapplicationHash,freezeNonapplication} from './own-payroll-nonapplication.js';
import {captureOwnPayrollFamilyTariffSources} from './own-payroll-family-tariff-source.js';
import {ownProgramRowEmission} from '../assets/own-payroll-row-emission-program.js';
import {normalizeOwnPayrollRowEmissionInput,selectRowEmissionPolicies,OWN_PAYROLL_ROW_EMISSION_V2_VERSION,OWN_PAYROLL_EMISSION_INPUT_VERSION} from '../assets/own-payroll-row-emission.js';
import {ownProgramOfficialTotals,captureOfficialTotalsPolicy} from '../assets/own-payroll-official-program.js';
import {normalizeOwnPayrollOfficialInput,OWN_PAYROLL_OFFICIAL_INPUT_VERSION} from '../assets/own-payroll-official-totals.js';
import { ownProgramQuantities, quantityInputPhases } from '../assets/own-payroll-quantity-program.js';
import { normalizeOwnPayrollQuantityInput, OWN_PAYROLL_QUANTITY_INPUT_VERSION, OWN_PAYROLL_QUANTITY_PHASES_VERSION } from '../assets/own-payroll-quantity.js';
import { OWN_PAYROLL_NAMESPACE_VERSION } from '../assets/own-payroll-engine.js';
import {ownNoveltyPresenceKind} from '../assets/own-payroll-novelty-presence.js';
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
import {salaryNativeCapture,salaryNativeCaptureMaterial,SALARY_NATIVE_VERSION} from '../assets/own-contract-salary-conditions-native-model.js';
import {familyPayrollFactsCapture} from '../assets/own-contract-family-payroll-facts-model.js';
import {ownPayrollFamilyFacts,FAMILY_FACT_FIELD_UNITS,OWN_PAYROLL_FAMILY_FACTS_VERSION} from '../assets/own-payroll-family-facts.js';
import {ownPayrollConditions,conditionFieldUnits,NATIVE_CONDITION_FIELD_UNITS,CLASSIFICATION_FIELD_UNITS,conditionUnit,OWN_PAYROLL_CONDITIONS_VERSION} from '../assets/own-payroll-conditions.js';
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
function prepareOwnPayrollInputInternal({ period, liquidationType, selection, programState, population, monthly, fixed, employmentFacts, periodParticipation, workingTime, agreementWorkingTime, salaryConditions, periodContext, familyPayrollFacts, sourceInventory }, {quantityOptIn=false,officialOptIn=false,emissionOptIn=false,tariffOptIn=false,preparationOnlyCandidate=null} = {}) {
  ownProgramBootstrap(programState);
  const p = programState.program;
  const candidate=preparationOnlyCandidate;
  const catalogueValues=catalogueValueResolver({programState,sourceInventory,period});
  require(candidate ? programState.salaryCatalog.revision > 0 : p.revision > 0 && (catalogueValues!==null||p.salaryVersion === programState.salaryCatalog.version), 'PROGRAM_APPROVAL_REQUIRED', 'Se necesita un programa aprobado contra el catálogo salarial vigente.');
  // Only the explicit preparation preview below supplies candidate. The source
  // program keeps its real revision and approvals; its derived definition is
  // separately identified in the rules hash and never becomes an approval.
  const definition = ownProgramDefinition(candidate?.definition ?? p.definition, programState.salaryCatalog.items);
  const optionalScale=optionalScaleResolver({programState,sourceInventory,period});
  const hasTariffs=ownPayrollFamilyTariffs(definition);
  require(!hasTariffs||tariffOptIn,'FAMILY_TARIFF_OPT_IN_REQUIRED','La tarifa diferida requiere su adaptador explícito; no se reemplaza por una entrada monetaria estática.');
  require(!tariffOptIn||hasTariffs,'FAMILY_TARIFF_PROGRAM_REQUIRED','Falta la política versionada de tarifa del programa.');
  const hasEmission=ownProgramRowEmission(definition);
  require(!hasEmission||emissionOptIn,'ROW_EMISSION_OPT_IN_REQUIRED','La decisión de emisión necesita su adaptador explícito; no se descarta.');
  require(!emissionOptIn||hasEmission,'ROW_EMISSION_PROGRAM_REQUIRED','Falta la política de emisión en el programa capturado.');
  const hasQuantities = ownProgramQuantities(definition);
  const hasOfficial = ownProgramOfficialTotals(definition);
  require(!hasOfficial || officialOptIn, 'OFFICIAL_INPUT_OPT_IN_REQUIRED', 'La política oficial necesita el adaptador explícito; no se descarta.');
  require(!officialOptIn || hasOfficial, 'OFFICIAL_TOTALS_PROGRAM_REQUIRED', 'Falta la política aprobada de totales oficiales.');
  require(!hasQuantities || quantityOptIn, 'QUANTITY_INPUT_OPT_IN_REQUIRED', 'La captura de cantidades requiere el adaptador explícito.');
  require(!quantityOptIn || hasQuantities, 'QUANTITY_PROGRAM_REQUIRED', 'Falta el programa explícito con cantidades.');
  require(salaryExact(population, ['complete', 'version', 'employees']) && population.complete === true && salaryHash(population.version) && Array.isArray(population.employees) && population.employees.length > 0 && population.employees.length <= 10000, 'POPULATION_INCOMPLETE', 'La población propia debe estar completa y versionada.');
  const byId = new Map();
  for (const e of population.employees) {
    require(salaryExact(e, ['contractId', 'employeeNumber', 'agreementCode', 'departmentCode', 'categoryCode', 'identityToken', 'origin']) && salaryUuid(e.contractId) && ownPayrollEmployeeNumber(e.employeeNumber) && [e.agreementCode, e.departmentCode, e.categoryCode].every(code) && salaryHash(e.identityToken) && e.origin === 'MUNICONTROL' && !byId.has(e.contractId), 'POPULATION_INVALID', 'La población contiene un contrato repetido o un encuadre propio sin verificar.'); byId.set(e.contractId, e);
  }
  const sourceCoverage=captureSourceCoverage(definition,{period,liquidationType,population,monthly});
  const hasPeriodContext=ownProgramPeriodContext(definition);
  require(hasPeriodContext||periodContext===undefined,'SOURCE_SCOPE_INVALID','El programa no declara contexto del período; no se agregan datos implícitos.');
  const context=hasPeriodContext?periodContextCapture(periodContext,period):null;
  if(context)require(context.sha256===hash(periodContextFields(period)),'SOURCE_VERSION_INVALID','La huella del contexto no conserva el período declarado.');
  const hasSeniority = ownProgramSeniority(definition);
  require(hasSeniority || employmentFacts === undefined, 'SOURCE_SCOPE_INVALID', 'El programa anterior no declara antigüedad; no se agregan datos implícitos.');
  const facts = hasSeniority ? seniorityCapture(employmentFacts, population.employees, period) : null;
  const hasParticipation = ownProgramParticipation(definition);
  require(hasParticipation || periodParticipation === undefined, 'SOURCE_SCOPE_INVALID', 'El programa no declara participación del período.');
  const periodFacts = hasParticipation ? participationCapture(periodParticipation, population.employees, period) : null;
  const hasWorkingTime = ownProgramWorkingTime(definition);
  require(hasWorkingTime || workingTime === undefined, 'SOURCE_SCOPE_INVALID', 'El programa anterior no declara jornada; no se agregan horas implícitas.');
  const workingFacts = hasWorkingTime ? workingTimeCapture(workingTime, population.employees, period) : null;
  const hasAgreementWorkingTime = ownProgramAgreementWorkingTime(definition);
  require(hasAgreementWorkingTime || agreementWorkingTime === undefined, 'SOURCE_SCOPE_INVALID', 'El programa no declara horas mensuales del convenio; no se agregan valores implícitos.');
  const agreementFacts = hasAgreementWorkingTime ? agreementWorkingTimeCapture(agreementWorkingTime, population.employees, period) : null;
  const agreementByCode = new Map(agreementFacts?.records.map(r => [r.agreementCode, r]) ?? []);
  const hasConditions=ownPayrollConditions(definition);
  require(hasConditions||salaryConditions===undefined,'SOURCE_SCOPE_INVALID','El programa anterior no declara condiciones propias; no se agregan atributos implícitos.');
  const conditionFacts=hasConditions?(definition.salaryConditionsVersion===SALARY_NATIVE_VERSION?salaryNativeCapture:salaryConditionsCapture)(salaryConditions,population.employees,period):null;
  const hasFamilyFacts=ownPayrollFamilyFacts(definition);
  require(hasFamilyFacts||familyPayrollFacts===undefined,'SOURCE_SCOPE_INVALID','El programa no declara hechos familiares; no se agregan datos implícitos.');
  const familyFacts=hasFamilyFacts?familyPayrollFactsCapture(familyPayrollFacts,population.employees,period):null;
  const populationSources = {employees:population.employees, ...(context?{periodContext:context}:{}), ...(facts?{employmentFacts:facts}:{}), ...(periodFacts?{periodParticipation:periodFacts}:{}), ...(workingFacts?{workingTime:workingFacts}:{}), ...(agreementFacts?{agreementWorkingTime:agreementFacts}:{}),...(conditionFacts?{salaryConditions:conditionFacts}:{}),...(familyFacts?{familyPayrollFacts:familyFacts}:{})};
  if (context || facts || periodFacts || workingFacts || agreementFacts || conditionFacts || familyFacts) require((!facts || facts.version === hash(['own-salary-seniority.v1',period,facts.records])) && (!periodFacts || periodFacts.version === hash(['own-period-participation.v1',period,periodFacts.records])) && (!workingFacts || workingFacts.version === hash(['own-contract-working-time.v1',period,workingFacts.records])) && (!agreementFacts || agreementFacts.version === hash([OWN_AGREEMENT_WORKING_TIME_VERSION,period,agreementFacts.records])) && (!conditionFacts||(definition.salaryConditionsVersion===SALARY_NATIVE_VERSION?conditionFacts.legacy.version===hash([OWN_PAYROLL_CONDITIONS_VERSION,period,conditionFacts.legacy.records])&&conditionFacts.version===hash(salaryNativeCaptureMaterial(conditionFacts,period)):conditionFacts.version===hash([OWN_PAYROLL_CONDITIONS_VERSION,period,conditionFacts.records]))) && (!familyFacts||familyFacts.version===hash([OWN_PAYROLL_FAMILY_FACTS_VERSION,period,familyFacts.records])) && population.version === hash(populationSources), 'SOURCE_VERSION_INVALID', 'La población no conserva sus fuentes aprobadas exactas.');
  const conditionalSource=conditionalSourceResolver({period,liquidationType,population,monthly,fixed,employmentFacts,periodParticipation,workingTime,agreementWorkingTime,salaryConditions,periodContext,familyPayrollFacts,sourceInventory,programState:{...programState,program:{...p,definition}}});
  const familyById=new Map(familyFacts?.records.map(r=>[r.contractId.toLowerCase(),r])??[]);
  const conditionsById=new Map(conditionFacts?.records.map(r=>[r.contractId.toLowerCase(),r])??[]);
  const workingById = new Map(workingFacts?.records.map(r => [r.contractId.toLowerCase(), r.configuration]) ?? []);
  const periodById = new Map(periodFacts?.records.map(r=>[r.contractId.toLowerCase(),r]) ?? []);
  for (const r of periodFacts?.records ?? []) require(r.fullPeriod || r.configuration.revision>0 && r.configuration.definition.recognizedUnits!==null && r.configuration.definition.baseUnits!==null, 'PARTICIPATION_APPROVAL_REQUIRED', 'Una vigencia parcial necesita cantidad y base documentadas y aprobadas; no se omite el contrato.');
  const effectiveRules = participationRules(definition);
  const effectiveQuantities = hasQuantities ? quantityInputPhases(definition) : [];
  const factById = new Map(facts?.records.map(r => [r.contractId.toLowerCase(), r.configuration]) ?? []);
  // A quantity-only input has no monetary rule of its own in this period.
  // CIVITAS documents Unidades with an explicit zero in the unused Importe
  // field. Forzado cannot replace a nonexistent monetary output. The original
  // flag remains in the approved source hash and in the observation provenance.
  const quantityOnlyByAgreement = new Map();
  const quantityOnlyInput = (contractId, family, concept) => {
    const agreement = byId.get(contractId)?.agreementCode;
    if (!agreement) return false;
    if (!quantityOnlyByAgreement.has(agreement)) {
      const rules = effectiveRules.filter(r => r.agreementCode === agreement && active(r, period) && r.liquidationTypes.includes(liquidationType));
      // Before V2, auxiliary and monetary outputs share the same code space.
      // That version cannot prove that a same-code auxiliary is a separate input.
      const owned = new Set(rules.filter(r => !ownProgramNamespaced(definition) || r.nature !== 'auxiliary').map(r => r.code));
      const keys = new Set(), walk = n => { if (n.op === 'input' || n.op === 'match') keys.add(n.key); for (const k of ['left','right','value','condition','then','else']) if (n[k] && typeof n[k] === 'object') walk(n[k]); };
      for (const r of rules) walk(r.expression);
      for (const phase of effectiveQuantities.filter(q => q.agreementCode === agreement && active(q, period) && q.liquidationTypes.includes(liquidationType))) walk(phase.expression);
      const groups = new Map();
      for (const b of definition.bindings) {
        if (b.agreementCode !== agreement || !keys.has(b.key) || !/^(monthly|fixed)_/.test(b.sourceKind) || owned.has(b.sourceCode)) continue;
        const group = b.sourceKind.split('_')[0] + ':' + b.sourceCode;
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group).push(b.sourceKind);
      }
      quantityOnlyByAgreement.set(agreement, new Set([...groups].filter(([id, kinds]) => {
        const f = id.split(':')[0];
        return kinds.includes(f + '_quantity') && kinds.every(k => k === f + '_quantity' || k === f + '_presence');
      }).map(([id]) => id)));
    }
    return quantityOnlyByAgreement.get(agreement).has(family + ':' + concept);
  };
  quantityOnlyExpectedInputs(definition,{period,liquidationType,population,monthly,fixed});
  if(definition.cappedDeductionsVersion)verifyCappedSources({period,liquidationType,population,monthly,fixed},definition.cappedDeductionPolicies);
  const declaredAdjustments=captureDeclaredAdjustmentSources(definition,{period,liquidationType,population,monthly,fixed});
  const declaredReferences=new Set(declaredAdjustments?.admissions.map(row=>row.reference)??[]);
  const resolveMonthlyForced=monthlyForcedSourceResolver(definition);
  const sourceObservation = (r, contractId, family, reference, sourceContract=null) => {
    // A quantity binding can feed another auxiliary even when the source code
    // is excluded as a payable definition. Reject its event before consumption,
    // quantity-only treatment or forced-amount resolution can hide that fact.
    assertSourceCoverageEvent(sourceCoverage,{agreementCode:byId.get(contractId)?.agreementCode,conceptCode:r.conceptSourceId});
    const onlyQuantity = quantityOnlyInput(contractId, family, r.conceptSourceId);
    require(!onlyQuantity || r.amountCents === null || r.amountCents === '0', 'SOURCE_INPUT_AMOUNT_UNUSED', 'La entrada usa sólo cantidad y declara un importe sin tratamiento. Revisá el importe; no se descarta.');
    const monthlyForced=r.forced===true&&!onlyQuantity?resolveMonthlyForced({row:r,family,agreementCode:byId.get(contractId)?.agreementCode,period,liquidationType,sourceContract}):null;
    require(r.forced === false || monthlyForced!==null || onlyQuantity && r.amountCents === '0' && r.quantityDecimal !== null, 'FORCED_RULE_REQUIRED', 'Un reemplazo monetario forzado necesita una regla explícita. La entrada sólo de cantidad requiere cantidad informada e importe cero explícito.');
    return {sourceKind:family,contractId,concept:r.conceptSourceId,quantity:r.quantityDecimal,amount:r.amountCents,reference,...(r.forced ? {forced:true,forcedTreatment:monthlyForced?'declared_monthly_amount_passthrough':'declared_quantity_input_no_monetary_owner',...(monthlyForced?{forcedPolicySha256:hash(monthlyForced)}:{})} : {})};
  };
  const observations = [], identities = s => { assertNativeMonthlySubject(s); const e = byId.get(s.contractId); require(e && e.employeeNumber === s.legajo && e.identityToken === s.identityToken, 'SOURCE_IDENTITY_CHANGED', 'Una novedad no coincide con la identidad de la población capturada.'); return e; };
  require((salaryExact(monthly, ['complete', 'batches']) || salaryExact(monthly, ['complete', 'batches', 'nativeBatches'])) && monthly.complete === true && Array.isArray(monthly.batches) && monthly.batches.length <= 10000 && (!Object.hasOwn(monthly,'nativeBatches') || Array.isArray(monthly.nativeBatches) && monthly.nativeBatches.length <= 1000), 'SOURCE_INCOMPLETE', 'Se necesita el conjunto completo de novedades aprobadas.');
  const batchIds = new Set();
  for (const batch of monthly.batches) {
    verifyMonthlyBatch(batch, { mode: 'export' });
    require(!batchIds.has(batch.id) && batch.periodMonth === period + '-01' && batch.payrollType === liquidationType && batch.contractVersion === 'payroll-novelty-batch.v2', 'SOURCE_SCOPE_INVALID', 'Una novedad está repetida o no pertenece al período, tipo y fuente propia.'); batchIds.add(batch.id);
    for (const r of batch.rows) {
      require(r.identityCurrent === true && r.issues.every(ownConceptObservation), 'SOURCE_INVALID', 'Una novedad aprobada tiene una identidad o incidencias sin resolver.'); identities(r.subject);
      require(r.adjustmentMonth === null || r.adjustmentMonth === period + '-01' || declaredReferences.has(batch.id + ':' + r.rowOrdinal), 'RETROACTIVE_RULE_REQUIRED', 'El ajuste de otro mes necesita una regla explícita de retroactividad.');
      observations.push(sourceObservation(r, r.employmentContractId, 'monthly', batch.id + ':' + r.rowOrdinal));
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
      require(r.adjustmentMonth === null || r.adjustmentMonth === period + '-01' || declaredReferences.has(batch.id + ':' + r.rowOrdinal), 'RETROACTIVE_RULE_REQUIRED', 'El ajuste de otro mes necesita una regla explícita de retroactividad.');
      observations.push(sourceObservation(r, r.contractId, 'monthly', batch.id + ':' + r.rowOrdinal, batch.version));
    }
    require(selected > 0, 'SOURCE_SCOPE_INVALID', 'El lote capturado no corresponde a la selección declarada.');
  }
  const fixedData = fixedList(fixed.list, period + '-01'), fixedRows = fixedExportData(fixed.export, fixedData);
  for (const r of fixedRows.rows) {
    identities(r.subject);
    require(r.values.payrollType === liquidationType, 'SOURCE_SCOPE_INVALID', 'Una novedad fija pertenece a otro tipo de liquidación.');
    require(hasParticipation && definition.periodParticipation.fixedValidity === 'declared_values' || !fixedCoverage(r.values, period + '-01').partial, 'PRORATION_REQUIRED', 'Una vigencia parcial necesita una regla de prorrateo expresa.');
    observations.push(sourceObservation(r.values, r.subject.contractId, 'fixed', r.recordId + ':' + r.proposalId));
  }
  const used = new Set(), inputsFor = e => {
    const usedKeys = new Set();
    const walk = n => { if (n.op === 'input'||n.op==='match') usedKeys.add(n.key); for (const k of ['left', 'right', 'value', 'condition', 'then', 'else']) if (n[k] && typeof n[k] === 'object') walk(n[k]); };
    for (const rule of effectiveRules.filter(r => r.agreementCode === e.agreementCode && active(r, period) && r.liquidationTypes.includes(liquidationType))) walk(rule.expression);
    for (const phase of effectiveQuantities.filter(q => q.agreementCode === e.agreementCode && active(q, period) && q.liquidationTypes.includes(liquidationType))) walk(phase.expression);
    return definition.bindings.filter(b => b.agreementCode === e.agreementCode && usedKeys.has(b.key)).map(b => {
      let values, reference;
      if(catalogueValues&&catalogueValueSource(b.sourceKind))return catalogueValues(e,b);
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
        const field=b.sourceField,native=definition.salaryConditionsVersion===SALARY_NATIVE_VERSION&&Object.hasOwn(NATIVE_CONDITION_FIELD_UNITS,field);
        const c=definition.salaryConditionsVersion===SALARY_NATIVE_VERSION&&!native?conditionFacts.legacy.records.find(r=>r.contractId.toLowerCase()===e.contractId.toLowerCase()):conditionsById.get(e.contractId.toLowerCase());
        require(c?.revision>0&&c.definition!==null,'SOURCE_VALUE_MISSING','Falta la declaración completa aprobada para el contrato y período; no se supone cero, no ni ausencia de título.');
        const d=c.definition,value=field==='titleStatus'?(d.title.status==='not_reported'?null:d.title.status):field==='titleCode'?d.title.code:field==='titlePercentage'?d.title.percentage:d[field];
        require(conditionFieldUnits(definition)[field]===b.unit,'SOURCE_VALUE_MISSING','El componente de la condición tiene otra unidad.');
        // Keep nullable declarations intact. Only an evaluated reviewed branch
        // may consume a value; no-title is not a zero percentage.
        const sourceReference=[native?'Condiciones nativas':'Condiciones propias',definition.salaryConditionsVersion===SALARY_NATIVE_VERSION&&!native?conditionFacts.legacy.version:conditionFacts.version,c.approvalId,period,field,d.asOfDate].join(':');
        return{key:b.key,unit:b.unit,value:conditionUnit(b.unit)||value===null?value:quantize(decimal(value),{precision:8,mode:'exact'}).amount,sourceReference};
      }
      if(b.sourceKind==='family_tariff'){
        const captured=familyById.get(e.contractId.toLowerCase());
        require(captured?.revision>0&&captured.definition!==null,'FAMILY_TARIFF_FACT_SOURCE_REQUIRED','Falta la declaración familiar aprobada original del contrato.');
        return{key:b.key,unit:'money',value:null,sourceReference:['Tarifa familiar diferida',familyFacts.version,b.sourceCode,captured.approvalId].join(':')};
      }
      if(b.sourceKind==='family_fact'){
        const captured=familyById.get(e.contractId.toLowerCase()),field=b.sourceField;
        require(captured?.revision>0&&captured.definition!==null,'SOURCE_VALUE_MISSING','Falta la declaración familiar aprobada del contrato y período; la ausencia no equivale a cero.');
        require(FAMILY_FACT_FIELD_UNITS[field]===b.unit,'SOURCE_VALUE_MISSING','El hecho familiar tiene otra unidad.');
        const d=captured.definition,value=field==='tariffRegion'?d.tariffSelection.region:field==='semesterAverage'?d.tariffSelection.semesterAverage:field==='prenatalAdjustmentMonths'?d.prenatalAdjustmentMonths:d.quantities[field];
        const sourceReference=['Familia aprobada',familyFacts.version,captured.approvalId,period,field,d.asOfDate].join(':');
        // Preserve null and categorical codes. An evaluated branch requires its
        // declared value; neither family links nor school records fill it.
        return{key:b.key,unit:b.unit,value:value===null||conditionUnit(b.unit)?value:quantize(decimal(value),{precision:8,mode:'exact'}).amount,sourceReference};
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
      } else if(conditionalSourceKind(b.sourceKind)){require(conditionalSource,'CONDITIONAL_SOURCE_CAPTURE_INVALID','Falta la captura íntegra de la fuente condicional.');return conditionalSource(e,b);
      } else if(b.sourceKind==='optional_scale'){
        require(optionalScale,'OPTIONAL_SCALE_CAPTURE_INVALID','Falta la captura íntegra del maestro aprobado.');return optionalScale(e,b);
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
        if(ownNoveltyPresenceKind(b.sourceKind)){
          const provenance=(family==='monthly'?'Presencia mensual:':'Presencia fija:')+hash({complete:true,period,liquidationType,contractId:e.contractId,binding:b,observations:matches});
          return {key:b.key,unit:'coefficient',value:matches.length?'1':'0',sourceReference:provenance};
        }
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
  const prepared = { version: ownProgramNamespaced(definition) ? 'own-payroll-input.v2' : 'own-payroll-input.v1',...(hasConditions?{salaryConditionsVersion:definition.salaryConditionsVersion}:{}),...(hasFamilyFacts?{familyPayrollFactsVersion:OWN_PAYROLL_FAMILY_FACTS_VERSION}:{}), period, liquidationType, selection, populationComplete: true, totalsPrecision: definition.totalsPrecision, sourceVersions: { population: population.version, rules: hash({ program: p, salary: programState.salaryCatalog,...(candidate?{preparationOnlyCandidate:candidate}:{}) }), novelties: hash({ monthly, fixed: fixedRows }) }, employees, rules: effectiveRules };
  if(hasTariffs)Object.assign(prepared,{familyTariffsVersion:definition.familyTariffsVersion,familyTariffCapture:captureOwnPayrollFamilyTariffSources({definition,familyFacts,population,employees,period,liquidationType})});
  const quantityInput = hasQuantities ? normalizeOwnPayrollQuantityInput({...prepared,version:OWN_PAYROLL_QUANTITY_INPUT_VERSION,namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION,quantityPhasesVersion:OWN_PAYROLL_QUANTITY_PHASES_VERSION,quantityPhases:effectiveQuantities}) : normalizeOwnPayrollInput(prepared);
  if(!hasOfficial)return quantityInput;
  const selectField={contracts:'contractId',agreements:'agreementCode',departments:'departmentCode'}[selection.kind];
  const selected=quantityInput.employees.filter(e=>selection.kind==='all'||selection.values.includes(e[selectField]));
  const officialEvidence=captureOfficialTotalsPolicy(definition,period,liquidationType,selected),{officialTotalsPolicy}=officialEvidence;
  const capped=captureCappedPolicies(definition,period,liquidationType,officialTotalsPolicy);
  const officialInput=normalizeOwnPayrollOfficialInput({...quantityInput,version:OWN_PAYROLL_OFFICIAL_INPUT_VERSION,...officialEvidence,...capped});
  verifyCappedSource({programState,sourceInventory,period,liquidationType,population,monthly,fixed,selection},officialInput);
  if(!hasEmission)return officialInput;
  const activeEmissionPolicies=selectRowEmissionPolicies(definition,period,liquidationType,officialTotalsPolicy.agreementCode);
  // A temporal capture keeps the complete immutable chain for its scope. The
  // normalizer derives active policies from that chain; it never trusts a
  // client-supplied effective end or rewrites an earlier approved policy.
  const rowEmissionPolicies=definition.rowEmissionVersion===OWN_PAYROLL_ROW_EMISSION_V2_VERSION?definition.rowEmissionPolicies.filter(p=>p.agreementCode===officialTotalsPolicy.agreementCode&&p.liquidationType===liquidationType):activeEmissionPolicies;
  return normalizeOwnPayrollRowEmissionInput({...officialInput,version:OWN_PAYROLL_EMISSION_INPUT_VERSION,rowEmissionVersion:definition.rowEmissionVersion,rowEmissionPolicies});
}

export function prepareOwnPayrollInput(sources) { return prepareOwnPayrollInputInternal(sources); }
export function prepareOwnPayrollQuantityApprovedInput(sources) { return prepareOwnPayrollInputInternal(sources,{quantityOptIn:true}); }

export function prepareOwnPayrollOfficialApprovedInput(sources) { return prepareOwnPayrollInputInternal(sources,{quantityOptIn:true,officialOptIn:true}); }

export function prepareOwnPayrollRowEmissionApprovedInput(sources){return prepareOwnPayrollInputInternal(sources,{quantityOptIn:true,officialOptIn:true,emissionOptIn:true});}

// Explicit producer adapter; retains each existing quantity/official/emission opt-in.
export function prepareOwnPayrollFamilyTariffApprovedInput(sources){const p=sources.programState?.program?.definition;return prepareOwnPayrollInputInternal(sources,{quantityOptIn:ownProgramQuantities(p),officialOptIn:ownProgramOfficialTotals(p),emissionOptIn:ownProgramRowEmission(p),tariffOptIn:true});}

export const OWN_PAYROLL_JOINT_PREVIEW_INPUT_VERSION='own-payroll-joint-preview-input.v1';
export const OWN_PAYROLL_JOINT_PREVIEW_MODE='own-payroll-joint-preparation-preview.v1';
const jointOptInKeys=['nonapplication','quantityPhases','officialTotals','rowEmission','familyTariffs'];
const jointGates=['NONAPPLICATION_PREPARATION_ONLY','PROGRAM_FAMILY_TARIFF_PREPARATION_ONLY','PROGRAM_ROW_EMISSION_PREPARATION_ONLY'];

/** Shared boundary for the previous 14N-only preview and the new explicit joint
 * preview. The joint request keeps all original source reads for deterministic
 * replay; no caller can supply a precomputed candidate or absence decision. */
function prepareNonapplicationPreviewInput(raw,{joint=false}={}){
  const input=nonapplicationCopy(raw);
  require(salaryExact(input,joint?['source','policy','capture','sources','optIns']:['source','policy','capture','sources']),'NONAPPLICATION_CONTRACT_INVALID','La previa necesita fuente, política, captura y lecturas completas explícitas.');
  if(joint)require(salaryExact(input.optIns,jointOptInKeys)&&jointOptInKeys.every(k=>input.optIns[k]===true),'JOINT_PREVIEW_OPT_IN_REQUIRED','La previa conjunta exige cada opción nombrada y explícita; no se deducen ni se descartan políticas.');
  const {source,policy,capture,sources}=input;
  const preparation=prepareOwnPayrollProgrammeNonapplicationSource({source,policy});
  const gates=joint?jointGates:['NONAPPLICATION_PREPARATION_ONLY'];
  require(preparation.draft.programme!==null&&preparation.incidents.every(i=>gates.includes(i.code))&&gates.every(code=>preparation.incidents.some(i=>i.code===code)),'NONAPPLICATION_PROGRAMME_INCOMPLETE','La política no resuelve otras reglas, unidades, vigencias o aprobaciones pendientes. Los gates de preparación permanecen explícitos.');
  const evidence=captureOwnPayrollNonapplication(capture,policy);
  require(sources.period===evidence.capture.period&&sources.liquidationType===policy.scope.liquidationType&&salarySerialized(sources.programState)===salarySerialized(source.programme)&&['population','monthly','fixed'].every(k=>salarySerialized(sources[k])===salarySerialized(evidence.capture[k])),'NONAPPLICATION_SOURCE_CHANGED','La previa no puede mezclar la captura verificada con otras lecturas o bases.');
  const selection=sources.selection;
  require(salaryExact(selection,['kind','values'])&&Array.isArray(selection.values)&&(selection.kind==='all'&&selection.values.length===0||selection.kind==='contracts'&&salarySerialized([...selection.values].sort())===salarySerialized(evidence.capture.contractIds)),'NONAPPLICATION_POPULATION_INCOMPLETE','La selección debe incluir todos los contratos de la captura, sin filtros de pantalla.');
  const {nonApplicationVersion,nonApplicationPolicy,...definition}=preparation.draft.programme;
  require(nonApplicationVersion===policy.version&&salarySerialized(nonApplicationPolicy)===salarySerialized(policy),'NONAPPLICATION_POLICY_CHANGED','El borrador perdió su política condicional.');
  if(joint)require(ownProgramQuantities(definition)&&ownProgramOfficialTotals(definition)&&ownProgramRowEmission(definition)&&ownPayrollFamilyTariffs(definition),'JOINT_PREVIEW_PROGRAM_REQUIRED','La previa conjunta debe conservar cantidades, totales oficiales, emisión y tarifas versionadas.');
  const candidate={definition,sourcePreparationSha256:preparation.pins.preparationSha256,nonApplicationPolicySha256:nonapplicationHash(policy),nativeCaptureSha256:evidence.captureSha256,...(joint?{mode:OWN_PAYROLL_JOINT_PREVIEW_MODE,optIns:input.optIns}:{}),approved:false,registered:false};
  const calculationInput=prepareOwnPayrollInputInternal(sources,{quantityOptIn:ownProgramQuantities(definition),officialOptIn:ownProgramOfficialTotals(definition),emissionOptIn:joint,tariffOptIn:joint,preparationOnlyCandidate:candidate});
  const result={version:joint?OWN_PAYROLL_JOINT_PREVIEW_INPUT_VERSION:'own-payroll-nonapplication-preview-input.v1',nonApplicationVersion:policy.version,...(joint?{request:input,requestSha256:nonapplicationHash(input),preparationOnlyCandidate:candidate,candidateSha256:nonapplicationHash(candidate),preparationGates:[...gates]}:{}),preparation,policy,evidence,calculationInput,calculationInputSha256:nonapplicationHash(calculationInput),approved:false,registered:false,payrollPosted:false};
  require(Buffer.byteLength(salarySerialized(result),'utf8')<=32*1024*1024,'JOINT_PREVIEW_INPUT_LIMIT','La captura conjunta se conserva completa; no se recorta la evidencia.');
  return freezeNonapplication(result);
}

/** Compatibility entrypoint: still refuses emission/tariff preparation gates. */
export function prepareOwnPayrollNonapplicationPreviewInput(raw){return prepareNonapplicationPreviewInput(raw);}

/** Named opt-ins, no SQL, registration or approval. This is a distinct private
 * QA input contract, not an extension of an approved-input API. */
export function prepareOwnPayrollJointPreviewInput(raw){return prepareNonapplicationPreviewInput(raw,{joint:true});}
