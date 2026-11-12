import {monthlyForcedCaptureSourceRecords,monthlyForcedCaptureHashChecks} from './own-payroll-monthly-forced-amounts.js';
// Private V4/V5 readers. A saved capture is checked in its original version;
// this module neither admits a calculation nor supplies missing source facts.
import {salaryExact,salaryHash,salaryUuid,salarySerialized} from './native-salary-catalog-model.js';
import {ownRunCapture} from './own-payroll-run-model.js';
import {ownRunWorkspaceResult} from './own-payroll-run-workspace-model.js';
import {ownPayrollEmployeeNumber,OWN_PAYROLL_NAMESPACE_VERSION} from './own-payroll-engine.js';
import {ownProgramBootstrap} from './own-payroll-program-model.js';
import {captureOfficialTotalsPolicy} from './own-payroll-official-program.js';
import {participationRules} from './own-period-participation-program.js';
import {quantityInputPhases} from './own-payroll-quantity-program.js';
import {normalizeOwnPayrollQuantityPhase,OWN_PAYROLL_QUANTITY_PHASES_VERSION} from './own-payroll-quantity.js';
import {ownProgramPeriodContext,verifiedPeriodContextCapture} from './own-payroll-period-context.js';
import {ownRunJurisdictions,ownJurisdictionMapForCapture,ownJurisdictionRecord} from './own-payroll-jurisdiction-model.js';
import {normalizeOwnPayrollOfficialInput,calculateOwnPayrollWithOfficialTotals,normalizeOfficialTotalsEvidence,verifyOwnPayrollOfficialEconomicRows} from './own-payroll-official-totals.js';
import {normalizeOwnPayrollRowEmissionInput,calculateOwnPayrollWithRowEmission,copyRowEmissionData,normalizeRowEmissionPolicies,selectRowEmissionPolicies,ownPayrollRowEmission,rowEmissionRowKey,rowEmissionPolicyKey,OWN_PAYROLL_ROW_EMISSION_V2_VERSION} from './own-payroll-row-emission.js';
import {normalizeFamilyTariffPolicy,selectFamilyTariffPolicies,familyTariffInputKeys,familyTariffPolicyVersionCompatible,OWN_PAYROLL_FAMILY_TARIFFS_V2_VERSION,OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION,OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_VERSION,OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_V2_VERSION} from './own-payroll-family-tariffs.js';
import {selectFamilyTariff,methodExact} from './own-payroll-special-methods.js';
import {civilDay} from './employment-adoption-review-model.js';
import {FAMILY_FACT_FIELD_UNITS,OWN_PAYROLL_FAMILY_FACTS_VERSION} from './own-payroll-family-facts.js';
import {conditionUnit} from './own-payroll-conditions.js';
import {payrollExpressionReference} from './own-payroll-expression.js';
import {decimal,rational,exactEvidence,exactAdd,exactSubtract,exactCompare,quantize,payrollRequire as require} from './own-payroll-exact.js';

export const OWN_OFFICIAL_TOTAL_KEYS=Object.freeze(['remuneration','non_remuneration','deduction','employer_contribution','gross','net']);
const inputVersions=['own-payroll-input.v4','own-payroll-input.v5'];
const allInputVersions=['own-payroll-input.v1','own-payroll-input.v2',...inputVersions];
const snapshotVersions=['own-close-snapshot.v4','own-close-snapshot.v5'];
const types=['monthly','first_fortnight','sac','vacation','supplementary','final','other'];
const code=v=>typeof v==='string'&&/^[0-9]{1,9}$/.test(v);
const period=v=>typeof v==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const need=(condition,message)=>require(condition,'CLOSE_OFFICIAL_CONTRACT_INVALID',message);
const order=(a,b)=>a<b?-1:a>b?1:0;
const list=(v,max=1000000)=>Array.isArray(v)&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1;
const emptyTotals=()=>Object.fromEntries(OWN_OFFICIAL_TOTAL_KEYS.map(k=>[k,rational(0n)]));
const addTotals=(a,b)=>{for(const k of OWN_OFFICIAL_TOTAL_KEYS)a[k]=exactAdd(a[k],decimal(b[k]));};
const formatTotals=(values,precision)=>Object.fromEntries(OWN_OFFICIAL_TOTAL_KEYS.map(k=>[k,quantize(values[k],{precision,mode:'exact'}).amount]));
const amount=(v,precision)=>{need(typeof v==='string','Un importe histórico debe conservar su texto decimal exacto.');need(quantize(decimal(v),{precision,mode:'exact'}).amount===v,'El importe histórico cambió de precisión.');return v;};
function fraction(v){
 need(salaryExact(v,['numerator','denominator'])&&typeof v.numerator==='string'&&typeof v.denominator==='string'&&/^-?(0|[1-9][0-9]{0,255})$/.test(v.numerator)&&/^[1-9][0-9]{0,255}$/.test(v.denominator),'La evidencia requiere una fracción exacta.');
 const value=rational(BigInt(v.numerator),BigInt(v.denominator));need(same(exactEvidence(value),v),'La fracción histórica debe ser canónica.');return value;
}
function selection(value){
 need(salaryExact(value,['kind','values'])&&['all','contracts','agreements','departments'].includes(value.kind)&&list(value.values,10000)&&(value.kind==='all'?value.values.length===0:value.values.length>0&&value.values.every(value.kind==='contracts'?salaryUuid:code))&&new Set(value.values).size===value.values.length,'El alcance debe ser explícito, completo y sin repeticiones.');
 return {kind:value.kind,values:[...value.values].sort()};
}
export const isOwnOfficialCapture=capture=>inputVersions.includes(capture?.saved?.input?.version);
export const isOwnOfficialCloseSnapshot=snapshot=>snapshotVersions.includes(snapshot?.version);
export async function ownOfficialHash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salarySerialized(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');}

/** Same return shape as ownRunWorkspaceResult. Original objects are returned;
 * canonical normalization and recomputation are comparisons, not replacements.
 */
export function ownOfficialCapture(capture){
 copyRowEmissionData(capture);
 need(isOwnOfficialCapture(capture),'La captura oficial exige opt-in V4 o V5.');
 // Validate the unchanged envelope with the historical envelope validator.
 // Its saved adapter is V1/V2-only, so the original saved value is checked below.
 ownRunCapture({...capture,saved:null});ownRunJurisdictions(capture);
 const saved=capture.saved,{input,result}=saved,payload=capture.payload,program=payload.programState.program,definition=program.definition;
 need(salaryExact(saved,['version','id','algorithmSha256','inputSha256','resultSha256','input','result','recordedAt'])&&saved.version==='own-payroll-saved.v1'&&saved.id===capture.id&&saved.algorithmSha256===capture.algorithmSha256&&[saved.inputSha256,saved.resultSha256].every(salaryHash)&&date(saved.recordedAt),'El resultado original debe conservar identificador, algoritmo y huellas.');
 need(!Object.hasOwn(definition,'fixedForcedAmountsVersion')&&!Object.hasOwn(definition,'fixedForcedAmountsPolicy'),'La composición de importes forzados sigue requiriendo su circuito propio.');
 ownProgramBootstrap(payload.programState);
 monthlyForcedCaptureSourceRecords(payload,input,result);
 need(program.revision>0&&program.salaryVersion===payload.programState.salaryCatalog.version,'La captura debe conservar el programa aprobado y su catálogo original.');
 const normalize=input.version==='own-payroll-input.v5'?normalizeOwnPayrollRowEmissionInput:normalizeOwnPayrollOfficialInput;
 const calculate=input.version==='own-payroll-input.v5'?calculateOwnPayrollWithRowEmission:calculateOwnPayrollWithOfficialTotals;
 need(same(normalize(input),input),'La entrada original no conserva su representación canónica.');
 need(input.period===capture.body.period&&input.liquidationType===capture.body.liquidationType&&same(input.selection,capture.body.selection)&&input.namespaceVersion===definition.namespaceVersion&&same(input.rules,participationRules(definition))&&same(input.quantityPhases,quantityInputPhases(definition))&&input.totalsPrecision===definition.totalsPrecision,'Las reglas, cantidades o el alcance cambiaron respecto del programa original.');
 const selectedField={contracts:'contractId',agreements:'agreementCode',departments:'departmentCode'}[input.selection.kind];
 const selected=input.employees.filter(e=>input.selection.kind==='all'||input.selection.values.includes(e[selectedField]));
 const official=captureOfficialTotalsPolicy(definition,input.period,input.liquidationType,selected);
 need(same(official.officialTotalsPolicy,input.officialTotalsPolicy)&&same(official.officialTotalsCapture??null,input.officialTotalsCapture??null),'El total oficial debe conservar la política y cadena completa del programa original.');
 if(input.version==='own-payroll-input.v5'){
  const active=selectRowEmissionPolicies(definition,input.period,input.liquidationType,input.officialTotalsPolicy.agreementCode);
  const original=definition.rowEmissionVersion===OWN_PAYROLL_ROW_EMISSION_V2_VERSION?definition.rowEmissionPolicies.filter(p=>p.agreementCode===input.officialTotalsPolicy.agreementCode&&p.liquidationType===input.liquidationType):active;
  need(definition.rowEmissionVersion===input.rowEmissionVersion&&same(original,input.rowEmissionPolicies),'La emisión debe conservar las políticas y sucesiones explícitas del programa original.');
 }
 else need(!['rowEmissionVersion','rowEmissionPolicies'].some(k=>Object.hasOwn(definition,k)||Object.hasOwn(input,k)),'V4 no puede eliminar la política de emisión de un programa V5.');
 const people=new Map(input.employees.map(e=>[e.contractId,e])),population=payload.population;
 need(population.complete===true&&population.version===input.sourceVersions.population&&list(population.employees,10000)&&population.employees.length===people.size&&new Set(population.employees.map(e=>e.contractId)).size===people.size,'La población original debe estar completa y sin duplicados.');
 for(const e of population.employees){const original=people.get(e.contractId);need(original&&['employeeNumber','agreementCode','departmentCode'].every(k=>original[k]===e[k]),'Un contrato cambió de identidad o encuadre respecto de su captura.');}
 need(input.familyPayrollFactsVersion===definition.familyPayrollFactsVersion,'La entrada debe conservar la versión original de hechos familiares.');
 if(definition.familyPayrollFactsVersion===OWN_PAYROLL_FAMILY_FACTS_VERSION){
  const family=payload.familyPayrollFacts;
  for(const e of input.employees)for(const observed of e.inputs){
   const b=definition.bindings.find(b=>b.agreementCode===e.agreementCode&&b.key===observed.key);if(!b||!['family_fact','family_tariff'].includes(b.sourceKind))continue;
   const record=family.records.find(r=>r.contractId===e.contractId),person=population.employees.find(r=>r.contractId===e.contractId);
   need(record?.revision>0&&record.definition&&record.identityToken===person.identityToken,'Falta el hecho familiar aprobado original de una entrada.');
   if(b.sourceKind==='family_tariff')need(same(observed,{key:b.key,unit:'money',value:null,sourceReference:['Tarifa familiar diferida',family.version,b.sourceCode,record.approvalId].join(':')}),'La entrada tarifaria debe quedar diferida y enlazada a su hecho original.');
   else{
    const d=record.definition,field=b.sourceField,raw=field==='tariffRegion'?d.tariffSelection.region:field==='semesterAverage'?d.tariffSelection.semesterAverage:field==='prenatalAdjustmentMonths'?d.prenatalAdjustmentMonths:d.quantities[field];
    need(FAMILY_FACT_FIELD_UNITS[field]===b.unit,'El hecho familiar cambió de unidad.');
    const expected={key:b.key,unit:b.unit,value:raw===null||conditionUnit(b.unit)?raw:quantize(decimal(raw),{precision:8,mode:'exact'}).amount,sourceReference:['Familia aprobada',family.version,record.approvalId,input.period,field,d.asOfDate].join(':')};
    need(same(expected,observed),'La entrada familiar no coincide con el hecho capturado; un valor ausente no equivale a cero.');
   }
  }
 }
 const tariffPresent=['familyTariffsVersion','familyTariffCapture'].some(k=>Object.hasOwn(input,k))||Object.hasOwn(definition,'familyTariffsVersion')||Object.hasOwn(result,'familyTariffsVersion');
 if(tariffPresent){
  const temporal=definition.familyTariffsVersion===OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION;
  const agreements=new Set(population.employees.map(e=>e.agreementCode));
  const activeRules=definition.rules.filter(r=>r.validFrom<=input.period&&(r.validUntil===null||r.validUntil>=input.period)&&r.liquidationTypes.includes(input.liquidationType));
  const expectedBindings=definition.bindings.filter(b=>b.sourceKind==='family_tariff'&&(!temporal||agreements.has(b.agreementCode)&&activeRules.some(r=>r.agreementCode===b.agreementCode&&familyTariffInputKeys(r.expression).includes(b.key)))).map(({agreementCode,key,sourceCode})=>({agreementCode,key,sourceCode})).sort((a,b)=>order(a.key,b.key));
  const expectedPolicies=temporal?definition.familyTariffPolicies.filter(p=>expectedBindings.some(b=>b.agreementCode===p.agreementCode)&&p.liquidationType===input.liquidationType):definition.familyTariffPolicies;
  need([OWN_PAYROLL_FAMILY_TARIFFS_V2_VERSION,OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION].includes(input.familyTariffsVersion)&&definition.familyTariffsVersion===input.familyTariffsVersion&&result.familyTariffsVersion===input.familyTariffsVersion&&input.familyTariffCapture.version===(temporal?OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_V2_VERSION:OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_VERSION)&&same(input.familyTariffCapture.policies,expectedPolicies)&&input.familyTariffCapture.familyFactsVersion===payload.familyPayrollFacts.version,'La tarifa debe conservar su versión y las tablas vigentes del programa original.');
  need(same(input.familyTariffCapture.bindings,expectedBindings),'Las claves de tarifa cambiaron respecto de su programa.');
  for(const r of input.familyTariffCapture.records){const original=payload.familyPayrollFacts.records.find(x=>x.contractId===r.contractId),person=population.employees.find(x=>x.contractId===r.contractId);need(original?.definition&&person&&original.identityToken===person.identityToken&&r.identityToken===person.identityToken&&r.agreementCode===person.agreementCode&&r.revision===original.revision&&r.approvalId===original.approvalId&&r.regionCode===original.definition.tariffSelection.region&&r.priorSemesterAverage===original.definition.tariffSelection.semesterAverage&&r.asOfDate===original.definition.asOfDate,'La selección tarifaria debe conservar los hechos familiares originales.');}
 }
 need(same(calculate(input),result),'El resultado guardado difiere del cálculo íntegro de su versión original.');
 return {input,result,people};
}

export async function verifiedOwnOfficialCapture(value){
 const capture=copyRowEmissionData(value);
 const {input}=ownOfficialCapture(capture),payload=capture.payload;
 const checks=[[capture.body,capture.bodySha256],[payload,capture.payloadSha256],[input,capture.saved.inputSha256],[capture.saved.result,capture.saved.resultSha256],[{program:payload.programState.program,salary:payload.programState.salaryCatalog},input.sourceVersions.rules],[{monthly:payload.monthly,fixed:payload.fixed.export.data},input.sourceVersions.novelties]];
 if(ownProgramPeriodContext(payload.programState.program.definition))await verifiedPeriodContextCapture(payload.periodContext,input.period);
 const populationSources={employees:payload.population.employees};
 for(const k of ['periodContext','employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions','familyPayrollFacts'])if(Object.hasOwn(payload,k))populationSources[k]=payload[k];
 if(Object.keys(populationSources).length>1)checks.push([populationSources,payload.population.version]);
 const factVersions={employmentFacts:'own-salary-seniority.v1',periodParticipation:'own-period-participation.v1',workingTime:'own-contract-working-time.v1',agreementWorkingTime:'own-agreement-working-time.v1',salaryConditions:'own-contract-salary-conditions.v1',familyPayrollFacts:'own-contract-family-payroll-facts.v1'};
 for(const [key,version] of Object.entries(factVersions))if(payload[key])checks.push([[version,input.period,payload[key].records],payload[key].version]);
 if(input.familyTariffCapture){const f=input.familyTariffCapture;checks.push([f.policies,f.policySha256]);for(const p of f.policies)checks.push([p.rows,p.rowsSha256]);for(const r of f.records)checks.push([payload.familyPayrollFacts.records.find(x=>x.contractId===r.contractId).definition,r.definitionSha256]);}
 checks.push(...await monthlyForcedCaptureHashChecks(payload,input,capture.saved.result,ownOfficialHash));
 for(const [value,hash] of checks)need(salaryHash(hash)&&await ownOfficialHash(value)===hash,'Una fuente, tabla, entrada o salida no conserva su huella original.');
 return capture;
}

const rowFields=['contractId','employeeNumber','agreementCode','departmentCode','conceptCode','nature','unit','amount','exactValue','rounding','ruleReference','dependencies','trace'];
const quantityFields=['contractId','employeeNumber','agreementCode','departmentCode','conceptCode','unit','stage','rounding','exactValue','value','decimalValue','sourceReference','sourceSha256','amountUse','dependencies','trace'];
const sourceFields=['runId','inputVersion','resultVersion','payloadSha256','inputSha256','resultSha256','officialTotalsPolicy','quantityPhasesVersion','quantityPhases','familyTariffsVersion','familyTariffCaptureMetadata','rowEmissionVersion','rowEmissionPolicies'];
const officialContext=source=>source.officialTotalsCapture??source.officialTotalsPolicy;
function sourceEvidence(source){
 need(salaryExact(source,[...sourceFields,...(Object.hasOwn(source,'officialTotalsCapture')?['officialTotalsCapture']:[])])&&salaryUuid(source.runId)&&allInputVersions.includes(source.inputVersion)&&source.resultVersion===source.inputVersion.replace('input','result')&&[source.payloadSha256,source.inputSha256,source.resultSha256].every(salaryHash),'La fuente del cierre perdió su identidad, versión o huellas originales.');
 if(inputVersions.includes(source.inputVersion)){
  const official=normalizeOfficialTotalsEvidence(source);
  need(same(official.policy,source.officialTotalsPolicy)&&same(official.capture,source.officialTotalsCapture??null),'La política oficial y su cadena deben conservar la representación canónica original.');
  need(source.quantityPhasesVersion===OWN_PAYROLL_QUANTITY_PHASES_VERSION&&list(source.quantityPhases,10000)&&source.quantityPhases.length>0&&same(source.quantityPhases.map(p=>normalizeOwnPayrollQuantityPhase(p,{typedConditions:true})),source.quantityPhases),'La fuente oficial requiere todas sus fases originales de cantidad.');
 }else need(!Object.hasOwn(source,'officialTotalsCapture')&&source.officialTotalsPolicy===null&&source.quantityPhasesVersion===null&&same(source.quantityPhases,[]),'Una captura histórica no puede declarar totales o cantidades oficiales retroactivamente.');
 if(source.inputVersion==='own-payroll-input.v5'){
  need(ownPayrollRowEmission(source)&&same(normalizeRowEmissionPolicies(source.rowEmissionPolicies,source.rowEmissionVersion),source.rowEmissionPolicies)&&source.rowEmissionPolicies.every(p=>p.agreementCode===source.officialTotalsPolicy.agreementCode&&p.liquidationType===source.officialTotalsPolicy.liquidationType),'La fuente V5 requiere su política completa de emisión para el alcance original.');
  const active=selectRowEmissionPolicies(source,officialContext(source).period,source.officialTotalsPolicy.liquidationType,source.officialTotalsPolicy.agreementCode);
  need(source.rowEmissionVersion===OWN_PAYROLL_ROW_EMISSION_V2_VERSION||active.length===source.rowEmissionPolicies.length,'La captura histórica conserva el período exacto de todas sus políticas.');
 }
 else need(source.rowEmissionVersion===null&&same(source.rowEmissionPolicies,[]),'La emisión sólo puede declararse en una captura V5.');
 if(source.familyTariffsVersion===null)need(source.familyTariffCaptureMetadata===null,'Una fuente sin tarifas no puede agregar una tabla.');
 else{
  const m=source.familyTariffCaptureMetadata;
  const temporal=source.familyTariffsVersion===OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION;
  need(inputVersions.includes(source.inputVersion)&&[OWN_PAYROLL_FAMILY_TARIFFS_V2_VERSION,OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION].includes(source.familyTariffsVersion)&&salaryExact(m,['version',...(temporal?['period','liquidationType']:[]),'familyFactsVersion','policies','policySha256','bindings'])&&m.version===(temporal?OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_V2_VERSION:OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_VERSION)&&(!temporal||m.period===officialContext(source).period&&m.liquidationType===source.officialTotalsPolicy.liquidationType)&&[m.familyFactsVersion,m.policySha256].every(salaryHash)&&list(m.policies,temporal?1000:1)&&m.policies.length>0&&same(m.policies.map(normalizeFamilyTariffPolicy),m.policies)&&m.policies.every(p=>familyTariffPolicyVersionCompatible(source.familyTariffsVersion,p.version)&&p.agreementCode===source.officialTotalsPolicy.agreementCode&&p.liquidationType===source.officialTotalsPolicy.liquidationType)&&list(m.bindings,512)&&m.bindings.length>0,'La fuente tarifaria requiere metadata completa del período y alcance originales.');
  const [active]=selectFamilyTariffPolicies({familyTariffsVersion:source.familyTariffsVersion,familyTariffPolicies:m.policies},officialContext(source).period,source.officialTotalsPolicy.liquidationType,[source.officialTotalsPolicy.agreementCode]);
  const seen=new Set();for(const b of m.bindings){need(salaryExact(b,['agreementCode','key','sourceCode'])&&b.agreementCode===active.agreementCode&&typeof b.key==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(b.key)&&active.mappings.some(x=>x.sourceCode===b.sourceCode)&&!seen.has(b.key),'Una tarifa contiene claves ajenas o repetidas.');seen.add(b.key);}
 }
 return source;
}

function tariffEvidence(value){
 const {sourceEvidence:s,familyTariffRecord:r,familyTariffDecisions:decisions,contractId,rows}=value;
 need(list(decisions,512),'La evidencia tarifaria debe conservar todas sus decisiones.');
 if(s.familyTariffsVersion===null){need(r===null&&decisions.length===0,'Una captura sin tarifas no puede agregar decisiones tarifarias.');return;}
 const m=s.familyTariffCaptureMetadata,[p]=selectFamilyTariffPolicies({familyTariffsVersion:s.familyTariffsVersion,familyTariffPolicies:m.policies},officialContext(s).period,s.officialTotalsPolicy.liquidationType,[s.officialTotalsPolicy.agreementCode]);
 need(salaryExact(r,['contractId','agreementCode','identityToken','revision','approvalId','definitionSha256','regionCode','priorSemesterAverage','asOfDate'])&&r.contractId===contractId&&r.agreementCode===p.agreementCode&&[r.identityToken,r.definitionSha256].every(salaryHash)&&Number.isSafeInteger(r.revision)&&r.revision>0&&salaryUuid(r.approvalId)&&(r.regionCode===null||code(r.regionCode))&&(r.priorSemesterAverage===null||typeof r.priorSemesterAverage==='string'&&/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/.test(r.priorSemesterAverage))&&civilDay(r.asOfDate)&&r.asOfDate.slice(0,7)<=officialContext(s).period,'La tarifa debe conservar el registro familiar exacto del contrato.');
 const expected=[];
 for(const b of m.bindings){
  const mapping=p.mappings.find(x=>x.sourceCode===b.sourceCode),reads=rows.flatMap(row=>row.trace).filter(t=>t.operation==='input'&&t.reference===b.key),count=reads.length;
  let selected=null,amountValue=null;
  if(count){need(r.regionCode!==null&&r.priorSemesterAverage!==null,'Una lectura de tarifa requiere región y promedio originales.');selected=selectFamilyTariff({regionCode:r.regionCode,typeCode:mapping.typeCode,priorSemesterAverage:r.priorSemesterAverage,rows:p.rows,policy:{selection:p.selection,outsideRange:p.outsideRange,reference:p.sourceReference}});amountValue=quantize(methodExact(selected.unitAmount),{precision:8,mode:'exact'}).amount;need(reads.every(t=>same(t.result,exactEvidence(decimal(amountValue)))),'La traza monetaria no coincide con la tarifa seleccionada.');}
  expected.push({contractId,agreementCode:r.agreementCode,key:b.key,sourceCode:b.sourceCode,conceptCode:mapping.conceptCode,typeCode:mapping.typeCode,status:count?'resolved':'not_requested',readCount:count,value:amountValue,selection:selected,familyFactsVersion:m.familyFactsVersion,familyApprovalId:r.approvalId,familyDefinitionSha256:r.definitionSha256,policySha256:m.policySha256,rowsSha256:p.rowsSha256});
 }
 expected.sort((a,b)=>order(a.key,b.key));need(same(expected,decisions),'Las decisiones tarifarias no coinciden con los registros, tablas y lecturas originales.');
}

/** Shared by close and receipt readers. All rows remain economic evidence;
 * receiptRowKeys only controls presentation after the original policy passes.
 */
export function ownOfficialEconomicEvidence(value){
 copyRowEmissionData(value);
 const {contractId,rows,totals,lineTotals,totalReconciliation,quantities,familyTariffDecisions,familyTariffRecord,rowEmissions,receiptRowKeys,sourceEvidence:s,precision,inputVersion,resultVersion}=value;
 sourceEvidence(s);
 need(salaryUuid(contractId)&&inputVersion===s.inputVersion&&resultVersion===s.resultVersion&&Number.isInteger(precision)&&precision>=0&&precision<=8&&list(rows)&&(!inputVersions.includes(inputVersion)||rows.length>0),'La evidencia económica debe identificar contrato, versión y precisión originales.');
 need(salaryExact(totals,['contractId',...OWN_OFFICIAL_TOTAL_KEYS])&&salaryExact(lineTotals,['contractId',...OWN_OFFICIAL_TOTAL_KEYS])&&totals.contractId===contractId&&lineTotals.contractId===contractId,'Los totales deben corresponder al mismo contrato.');
 for(const k of OWN_OFFICIAL_TOTAL_KEYS){amount(totals[k],precision);amount(lineTotals[k],precision);}
 const sums=emptyTotals(),seen=new Set(),first=rows[0];
 for(const r of rows){
  need(salaryExact(r,rowFields)&&r.contractId===contractId&&['employeeNumber','agreementCode','departmentCode'].every(k=>r[k]===first[k])&&ownPayrollEmployeeNumber(r.employeeNumber)&&code(r.agreementCode)&&code(r.departmentCode)&&code(r.conceptCode)&&['remuneration','non_remuneration','deduction','employer_contribution','auxiliary'].includes(r.nature)&&['money','days','hours','minutes','units','percent','coefficient'].includes(r.unit)&&list(r.dependencies)&&list(r.trace)&&payrollExpressionReference(r.ruleReference),'Una fila económica perdió su contrato o su evidencia.');
  const key=inputVersion==='own-payroll-input.v1'?r.conceptCode:rowEmissionRowKey(r);need(!seen.has(key),'La evidencia contiene una fila económica repetida.');seen.add(key);
  need(quantize(fraction(r.exactValue),r.rounding).amount===r.amount,'Un importe no corresponde a su valor exacto y redondeo originales.');
  if(OWN_OFFICIAL_TOTAL_KEYS.slice(0,4).includes(r.nature))sums[r.nature]=exactAdd(sums[r.nature],decimal(r.amount));
 }
 sums.gross=exactAdd(sums.remuneration,sums.non_remuneration);sums.net=exactSubtract(sums.gross,sums.deduction);
 need(same(formatTotals(sums,precision),Object.fromEntries(OWN_OFFICIAL_TOTAL_KEYS.map(k=>[k,lineTotals[k]]))),'Las filas económicas deben conciliar con los totales de renglones originales.');
 need(list(quantities)&&list(rowEmissions,s.rowEmissionVersion===OWN_PAYROLL_ROW_EMISSION_V2_VERSION?1000:2)&&list(receiptRowKeys)&&list(familyTariffDecisions,512),'La evidencia de cantidades, emisión y tarifas no puede estar recortada.');
 const official=inputVersions.includes(inputVersion),qmap=new Map();
 if(official){
  need(precision===2&&rows.every(r=>r.agreementCode===s.officialTotalsPolicy.agreementCode),'La política oficial no coincide con el contrato y precisión del cierre.');
  verifyOwnPayrollOfficialEconomicRows({rows,lineTotals,totals,totalReconciliation,officialTotalsPolicy:s.officialTotalsPolicy,...(Object.hasOwn(s,'officialTotalsCapture')?{officialTotalsCapture:s.officialTotalsCapture}:{})});
  for(const q of quantities){
   need(salaryExact(q,quantityFields)&&q.contractId===contractId&&['employeeNumber','agreementCode','departmentCode'].every(k=>q[k]===first[k])&&code(q.conceptCode)&&['days','hours','minutes','units','percent','money','coefficient'].includes(q.unit)&&['exact','rounded'].includes(q.stage)&&salaryHash(q.sourceSha256)&&payrollExpressionReference(q.sourceReference)&&!qmap.has(q.conceptCode)&&list(q.dependencies)&&list(q.trace),'Una cantidad perdió identidad, unidad o fuente.');
   const exact=fraction(q.exactValue);fraction(q.value);
   if(q.stage==='exact')need(q.rounding===null&&q.decimalValue===null&&same(q.value,q.exactValue),'La cantidad exacta no admite redondeo implícito.');
   else{const rounded=quantize(exact,q.rounding);need(rounded.amount===q.decimalValue&&same(exactEvidence(decimal(rounded.amount)),q.value),'La cantidad redondeada perdió su evidencia exacta.');}
   qmap.set(q.conceptCode,q);
  }
  const phases=s.quantityPhases.filter(p=>p.agreementCode===first.agreementCode&&p.validFrom<=officialContext(s).period&&(p.validUntil===null||p.validUntil>=officialContext(s).period)&&p.liquidationTypes.includes(s.officialTotalsPolicy.liquidationType));
  need(phases.length>0&&new Set(phases.map(p=>p.code)).size===phases.length&&same(phases.map(p=>p.code),quantities.map(q=>q.conceptCode)),'El registro debe conservar exactamente todas las cantidades de las fases vigentes originales.');
  for(const p of phases){const q=qmap.get(p.code);need(rows.some(r=>r.nature!=='auxiliary'&&r.conceptCode===p.code)&&['unit','stage','rounding','amountUse','sourceReference','sourceSha256'].every(k=>same(q[k],p[k])),'Una cantidad cambió su unidad, tratamiento o fuente original.');}
  tariffEvidence(value);
 }else need(same(totals,lineTotals)&&totalReconciliation===null&&quantities.length===0&&familyTariffDecisions.length===0&&familyTariffRecord===null,'Un resultado histórico no puede recibir evidencia oficial retroactiva.');
 const omitted=new Set(),expected=[];
 if(inputVersion==='own-payroll-input.v5'){
  for(const p of selectRowEmissionPolicies(s,officialContext(s).period,s.officialTotalsPolicy.liquidationType,s.officialTotalsPolicy.agreementCode)){
   const row=rows.find(r=>r.nature!=='auxiliary'&&r.conceptCode===p.conceptCode);need(row&&row.nature==='non_remuneration'&&row.unit==='money'&&row.agreementCode===p.agreementCode&&s.officialTotalsPolicy.contributions['995'].includes(row.conceptCode),'La política debe corresponder a una fila familiar y su acumulador original.');
    const temporal=p.version===OWN_PAYROLL_ROW_EMISSION_V2_VERSION;
    const conditions=p.conditions.map(c=>{
     const q=qmap.get(c.quantityCode);need(q&&q.unit===c.unit&&(temporal?q.stage===c.stage:c.quantityCode==='1'||q.stage==='exact'),'Falta la cantidad original de la decisión de emisión.');
     const n=fraction(q.value);need(n.n>=0n&&(temporal?c.valueDomain==='nonnegative'||n.d===1n:c.quantityCode==='1'||n.d===1n),'La cantidad no conserva el dominio declarado por la política original.');
     const comparison=exactCompare(n,decimal(c.value)),passed=temporal?{lt:comparison<0,le:comparison<=0,eq:comparison===0,ne:comparison!==0,ge:comparison>=0,gt:comparison>0}[c.operator]:comparison>0;
     return {...c,observed:exactEvidence(n),passed,quantitySourceSha256:q.sourceSha256};
    });
   const emit=conditions.every(c=>c.passed),key=rowEmissionRowKey(row);
   if(!emit){need(exactCompare(fraction(row.exactValue),rational(0n))===0&&exactCompare(decimal(row.amount),rational(0n))===0,'La omisión no puede ocultar un importe ni una fracción no nula.');omitted.add(key);}
   expected.push({rowKey:key,contractId,agreementCode:row.agreementCode,conceptCode:row.conceptCode,policyKey:rowEmissionPolicyKey(p),decision:emit?'emit':'omit',reason:emit?'conditions_met':'conditions_not_met',conditions,sourceReference:p.sourceReference,sourceSha256:p.sourceSha256});
  }
 }
 expected.sort((a,b)=>order(a.rowKey,b.rowKey));
 need(same(rowEmissions,expected)&&same(receiptRowKeys,rows.filter(r=>r.nature!=='auxiliary'&&!omitted.has(rowEmissionRowKey(r))).map(rowEmissionRowKey)),'La selección impresa no conserva exactamente la política y todas las filas económicas.');
 return value;
}

export function ownOfficialCloseSnapshot(snapshot){
 copyRowEmissionData(snapshot);
 const fields=['version','period','liquidationType','populationDomain','rosterVersion','selection','employeeCount','populationCount','populationComplete','precision','totals','employees','concepts','conceptCount','payrollCalculated','payrollPosted','paymentExecuted','lineTotals','netDifferenceFromLines','sources','quantityCount','familyTariffDecisionCount','emissionDecisionCount','receiptRowCount','economicRowsPreserved'];
 need(salaryExact(snapshot,fields)&&isOwnOfficialCloseSnapshot(snapshot)&&period(snapshot.period)&&types.includes(snapshot.liquidationType)&&snapshot.populationDomain==='native_registered'&&salaryHash(snapshot.rosterVersion)&&Number.isSafeInteger(snapshot.employeeCount)&&snapshot.employeeCount>0&&snapshot.employeeCount<=10000&&Number.isSafeInteger(snapshot.populationCount)&&snapshot.populationCount>=snapshot.employeeCount&&snapshot.populationCount<=10000&&snapshot.populationComplete===(snapshot.employeeCount===snapshot.populationCount)&&Number.isInteger(snapshot.precision)&&snapshot.precision>=0&&snapshot.precision<=8&&list(snapshot.employees,10000)&&snapshot.employees.length===snapshot.employeeCount&&list(snapshot.concepts)&&snapshot.conceptCount===snapshot.concepts.length&&list(snapshot.sources,1000)&&snapshot.payrollCalculated===true&&snapshot.payrollPosted===false&&snapshot.paymentExecuted===false&&snapshot.economicRowsPreserved===true,'El cierre oficial debe conservar su contrato completo.');
 need(same(selection(snapshot.selection),snapshot.selection),'El alcance histórico debe conservar su orden canónico.');
 need(salaryExact(snapshot.totals,OWN_OFFICIAL_TOTAL_KEYS)&&salaryExact(snapshot.lineTotals,OWN_OFFICIAL_TOTAL_KEYS),'Faltan totales oficiales o de renglones.');
 const sources=new Map();for(const s of snapshot.sources){sourceEvidence(s);need(!sources.has(s.runId),'Una fuente original se repite.');sources.set(s.runId,s);if(s.officialTotalsPolicy)need(officialContext(s).period===snapshot.period&&s.officialTotalsPolicy.liquidationType===snapshot.liquidationType,'Una política pertenece a otro período o tipo.');}
 const ids=new Set(),runs=new Set(),totals=emptyTotals(),lineTotals=emptyTotals(),counts={quantityCount:0,familyTariffDecisionCount:0,emissionDecisionCount:0,receiptRowCount:0};let hasV5=false,hasOfficial=false;
 const field={contracts:'contractId',agreements:'agreementCode',departments:'departmentCode'}[snapshot.selection.kind],found=new Set();
 for(const e of snapshot.employees){
  const namespaced=e.inputVersion!=='own-payroll-input.v1';
  need(salaryExact(e,['contractId','employeeNumber','agreementCode','departmentCode','runId','inputSha256','resultSha256','liquidationVersion','precision','conceptCount','totals','jurisdiction',...(namespaced?['namespaceVersion']:[]),'lineTotals','totalReconciliation','inputVersion','resultVersion','quantities','familyTariffDecisions','familyTariffRecord','rowEmissions','receiptRowKeys'])&&salaryUuid(e.contractId)&&!ids.has(e.contractId)&&salaryUuid(e.runId)&&ownPayrollEmployeeNumber(e.employeeNumber)&&[e.agreementCode,e.departmentCode].every(code)&&Number.isSafeInteger(e.liquidationVersion)&&e.liquidationVersion>0&&Number.isInteger(e.precision)&&e.precision>=0&&e.precision<=snapshot.precision&&Number.isSafeInteger(e.conceptCount)&&e.conceptCount>=0&&(!namespaced||e.namespaceVersion===OWN_PAYROLL_NAMESPACE_VERSION),'Un empleado del cierre perdió identidad, versión o evidencia.');
  const s=sources.get(e.runId),rows=snapshot.concepts.filter(r=>r.contractId===e.contractId);
  need(s&&s.inputSha256===e.inputSha256&&s.resultSha256===e.resultSha256&&rows.length===e.conceptCount&&rows.every(r=>['employeeNumber','agreementCode','departmentCode'].every(k=>r[k]===e[k])),'La fuente y todas las filas económicas deben corresponder al empleado.');
  ownJurisdictionRecord(e.jurisdiction);if(e.jurisdiction.basis!=='not_captured')need(e.jurisdiction.sourceSha256===s.payloadSha256,'La jurisdicción pertenece a otra captura.');
  if(field){need(snapshot.selection.values.includes(e[field]),'El cierre contiene un empleado ajeno al alcance.');found.add(e[field]);}
  ownOfficialEconomicEvidence({contractId:e.contractId,rows,totals:e.totals,lineTotals:e.lineTotals,totalReconciliation:e.totalReconciliation,quantities:e.quantities,familyTariffDecisions:e.familyTariffDecisions,familyTariffRecord:e.familyTariffRecord,rowEmissions:e.rowEmissions,receiptRowKeys:e.receiptRowKeys,sourceEvidence:s,precision:e.precision,inputVersion:e.inputVersion,resultVersion:e.resultVersion});
  addTotals(totals,e.totals);addTotals(lineTotals,e.lineTotals);ids.add(e.contractId);runs.add(e.runId);hasV5||=e.inputVersion==='own-payroll-input.v5';hasOfficial||=inputVersions.includes(e.inputVersion);
  counts.quantityCount+=e.quantities.length;counts.familyTariffDecisionCount+=e.familyTariffDecisions.length;counts.emissionDecisionCount+=e.rowEmissions.length;counts.receiptRowCount+=e.receiptRowKeys.length;
 }
 need(hasOfficial&&snapshot.version===(hasV5?'own-close-snapshot.v5':'own-close-snapshot.v4')&&snapshot.sources.length===runs.size&&snapshot.concepts.every(r=>ids.has(r.contractId))&&(!field||snapshot.selection.values.every(v=>found.has(v))),'El cierre requiere el conjunto completo y la versión explícita de sus fuentes.');
 need(same(formatTotals(totals,snapshot.precision),snapshot.totals)&&same(formatTotals(lineTotals,snapshot.precision),snapshot.lineTotals)&&quantize(exactSubtract(totals.net,lineTotals.net),{precision:snapshot.precision,mode:'exact'}).amount===snapshot.netDifferenceFromLines&&Object.entries(counts).every(([k,n])=>snapshot[k]===n),'Los totales y conteos oficiales deben conciliar con todas las evidencias conservadas.');
 return snapshot;
}

export async function verifiedOwnOfficialEconomicSource(value){
 const source=copyRowEmissionData(value);
 sourceEvidence(source);const metadata=source.familyTariffCaptureMetadata;
 if(source.officialTotalsCapture)need(await ownOfficialHash(source.officialTotalsCapture.policies)===source.officialTotalsCapture.policiesSha256,'La cadena oficial cerrada no conserva su huella original.');
 if(metadata){
  need(await ownOfficialHash(metadata.policies)===metadata.policySha256,'La política tarifaria cerrada no conserva su huella original.');
  for(const policy of metadata.policies)need(await ownOfficialHash(policy.rows)===policy.rowsSha256,'La tabla tarifaria cerrada no conserva su huella original.');
 }
 return source;
}
export async function verifiedOwnOfficialCloseSnapshot(value){
 const snapshot=copyRowEmissionData(value);
 ownOfficialCloseSnapshot(snapshot);for(const source of snapshot.sources)await verifiedOwnOfficialEconomicSource(source);
 return snapshot;
}

function captureSource(capture){
 const {input:i}=capture.saved,{records,...metadata}=i.familyTariffCapture??{};
 return {runId:capture.id,inputVersion:i.version,resultVersion:capture.saved.result.version,payloadSha256:capture.payloadSha256,inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,officialTotalsPolicy:structuredClone(i.officialTotalsPolicy??null),...(i.officialTotalsCapture?{officialTotalsCapture:structuredClone(i.officialTotalsCapture)}:{}),quantityPhasesVersion:i.quantityPhasesVersion??null,quantityPhases:structuredClone(i.quantityPhases??[]),familyTariffsVersion:i.familyTariffsVersion??null,familyTariffCaptureMetadata:i.familyTariffCapture?structuredClone(metadata):null,rowEmissionVersion:i.rowEmissionVersion??null,rowEmissionPolicies:structuredClone(i.rowEmissionPolicies??[])};
}

/** Mechanical close projection from complete, immutable, confirmed captures.
 * No result is replaced by a line-total projection and no approval is inferred.
 */
export function buildOwnOfficialCloseSnapshot(detail,rawSelection){
 copyRowEmissionData(detail);const chosen=selection(rawSelection),field={contracts:'contractId',agreements:'agreementCode',departments:'departmentCode'}[chosen.kind];
 need(['own-close-detail.v1','own-close-detail.v2'].includes(detail.version)&&period(detail.period)&&types.includes(detail.liquidationType)&&detail.populationDomain==='native_registered'&&salaryHash(detail.rosterVersion)&&detail.complete===true&&detail.canWrite===true&&list(detail.rows,10000)&&list(detail.captures,1000)&&new Set(detail.rows.map(r=>r.contractId)).size===detail.rows.length,'La revisión de cierre debe conservar población y fuentes completas.');
 const rows=detail.rows.filter(r=>!field||chosen.values.includes(r[field])).sort((a,b)=>order(a.contractId,b.contractId));
 need(rows.length>0&&chosen.values.every(v=>rows.some(r=>r[field]===v))&&rows.every(r=>r.state==='confirmed'&&r.canClose===true&&r.groupId===null),'El alcance debe contener solamente decisiones confirmadas y revisadas.');
 const captures=new Map(),verified=new Map(),jurisdictions=new Map();for(const c of detail.captures){need(!captures.has(c.id),'Una captura original se repite.');captures.set(c.id,c);}
 const employees=[],concepts=[],sources=[],seenSources=new Set(),totals=emptyTotals(),lineTotals=emptyTotals();let precision=0,hasV5=false,hasOfficial=false;
 for(const row of rows){
  const capture=captures.get(row.runId);need(capture?.saved&&capture.body.period===detail.period&&capture.body.liquidationType===detail.liquidationType,'Falta una captura completa del período y tipo elegidos.');
  if(!verified.has(capture.id)){verified.set(capture.id,isOwnOfficialCapture(capture)?ownOfficialCapture(capture):ownRunWorkspaceResult(capture));jurisdictions.set(capture.id,ownJurisdictionMapForCapture(capture));}
  const {input:i,result:r,people}=verified.get(capture.id),original=people.get(row.contractId),official=inputVersions.includes(i.version);
  need(original&&['employeeNumber','agreementCode','departmentCode'].every(k=>original[k]===row[k])&&row.resultSha256===capture.saved.resultSha256&&Number.isSafeInteger(row.liquidationVersion)&&row.liquidationVersion>0,'El empleado debe coincidir con la identidad y resultado originales.');
  const economic=r.rows.filter(x=>x.contractId===row.contractId),total=r.employeeTotals.find(x=>x.contractId===row.contractId),lineTotal=official?r.lineEmployeeTotals.find(x=>x.contractId===row.contractId):total;
  const classified=jurisdictions.get(capture.id),jurisdiction=classified===null?{code:null,basis:'not_captured',sourceSha256:null}:classified?.get(row.contractId);need(jurisdiction,'Falta la jurisdicción original de un contrato elegido.');
  const employee={contractId:row.contractId,employeeNumber:row.employeeNumber,agreementCode:row.agreementCode,departmentCode:row.departmentCode,runId:row.runId,inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,liquidationVersion:row.liquidationVersion,precision:i.totalsPrecision,conceptCount:economic.length,totals:structuredClone(total),jurisdiction:structuredClone(jurisdiction),...(i.version!=='own-payroll-input.v1'?{namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION}:{}),lineTotals:structuredClone(lineTotal),totalReconciliation:official?structuredClone(r.totalReconciliations.find(x=>x.contractId===row.contractId)):null,inputVersion:i.version,resultVersion:r.version,quantities:structuredClone(official?r.quantities.filter(x=>x.contractId===row.contractId):[]),familyTariffDecisions:structuredClone(r.familyTariffDecisions?.filter(x=>x.contractId===row.contractId)??[]),familyTariffRecord:structuredClone(i.familyTariffCapture?.records.find(x=>x.contractId===row.contractId)??null),rowEmissions:structuredClone(r.rowEmissions?.filter(x=>x.contractId===row.contractId)??[]),receiptRowKeys:i.version==='own-payroll-input.v5'?r.receiptRowKeys.filter(k=>k.split(':')[0]===row.contractId):economic.filter(x=>x.nature!=='auxiliary').map(rowEmissionRowKey)};
  employees.push(employee);concepts.push(...structuredClone(economic));addTotals(totals,total);addTotals(lineTotals,lineTotal);precision=Math.max(precision,i.totalsPrecision);hasOfficial||=official;hasV5||=i.version==='own-payroll-input.v5';
  if(!seenSources.has(capture.id)){sources.push(captureSource(capture));seenSources.add(capture.id);}
 }
 need(hasOfficial,'El cierre nuevo requiere al menos una captura oficial V4/V5.');
 return ownOfficialCloseSnapshot({version:hasV5?'own-close-snapshot.v5':'own-close-snapshot.v4',period:detail.period,liquidationType:detail.liquidationType,populationDomain:detail.populationDomain,rosterVersion:detail.rosterVersion,selection:chosen,employeeCount:rows.length,populationCount:detail.rows.length,populationComplete:rows.length===detail.rows.length,precision,totals:formatTotals(totals,precision),employees,concepts,conceptCount:concepts.length,payrollCalculated:true,payrollPosted:false,paymentExecuted:false,lineTotals:formatTotals(lineTotals,precision),netDifferenceFromLines:quantize(exactSubtract(totals.net,lineTotals.net),{precision,mode:'exact'}).amount,sources,quantityCount:employees.reduce((n,e)=>n+e.quantities.length,0),familyTariffDecisionCount:employees.reduce((n,e)=>n+e.familyTariffDecisions.length,0),emissionDecisionCount:employees.reduce((n,e)=>n+e.rowEmissions.length,0),receiptRowCount:employees.reduce((n,e)=>n+e.receiptRowKeys.length,0),economicRowsPreserved:true});
}
