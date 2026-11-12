// Versioned lazy producer. V1 preserves the six R9 mappings byte for byte;
// V2 explicitly declares four additional pairs from manuals plus source tables.
// The existing evaluator chooses branches; this module never predicts eligibility.
import {selectFamilyTariff,methodExact} from './own-payroll-special-methods.js';
import {decimal,exactCompare,exactEvidence,quantize,payrollRequire as require} from './own-payroll-exact.js';
import {salarySerialized} from './native-salary-catalog-model.js';
import {payrollExpressionReference} from './own-payroll-expression.js';
import {civilDay} from './employment-adoption-review-model.js';

export const OWN_PAYROLL_FAMILY_TARIFFS_VERSION='own-payroll-family-tariffs.v1';
export const OWN_PAYROLL_FAMILY_TARIFFS_V2_VERSION='own-payroll-family-tariffs.v2';
export const OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_VERSION='own-payroll-family-tariff-capture.v1';
export const FAMILY_TARIFF_EXECUTOR_MAP=Object.freeze({
 '82':Object.freeze({conceptCode:'302',typeCode:'3'}),
 '86':Object.freeze({conceptCode:'305',typeCode:'7'}),
 '87':Object.freeze({conceptCode:'306',typeCode:'8'}),
 '89':Object.freeze({conceptCode:'307',typeCode:'10'}),
 '88':Object.freeze({conceptCode:'308',typeCode:'9'}),
 '90':Object.freeze({conceptCode:'309',typeCode:'11'}),
});
export const FAMILY_TARIFF_V2_MAP=Object.freeze({...FAMILY_TARIFF_EXECUTOR_MAP,
 '80':Object.freeze({conceptCode:'300',typeCode:'1'}),
 '81':Object.freeze({conceptCode:'301',typeCode:'2'}),
 '84':Object.freeze({conceptCode:'303',typeCode:'5'}),
 '85':Object.freeze({conceptCode:'304',typeCode:'6'}),
});
const mapForVersion=v=>v===OWN_PAYROLL_FAMILY_TARIFFS_VERSION?FAMILY_TARIFF_EXECUTOR_MAP:v===OWN_PAYROLL_FAMILY_TARIFFS_V2_VERSION?FAMILY_TARIFF_V2_MAP:null;
export const ownPayrollFamilyTariffs=v=>v!==null&&typeof v==='object'&&mapForVersion(Object.getOwnPropertyDescriptor(v,'familyTariffsVersion')?.value)!==null;
export const familyTariffInputFields=v=>ownPayrollFamilyTariffs(v)?['familyTariffsVersion','familyTariffCapture']:[];
export const familyTariffProgramFields=v=>ownPayrollFamilyTariffs(v)?['familyTariffsVersion','familyTariffPolicies']:[];
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const code=v=>typeof v==='string'&&/^[1-9][0-9]{0,8}$/.test(v);
const key=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const order=(a,b)=>a<b?-1:a>b?1:0;
export const familyTariffPolicyKey=p=>[p.agreementCode,p.period,p.liquidationType].join(':');
function shape(v,keys){require(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).length===keys.length&&Reflect.ownKeys(v).every(k=>typeof k==='string'&&keys.includes(k))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value')&&d.enumerable),'FAMILY_TARIFF_CONTRACT_INVALID','El productor de tarifa necesita evidencia íntegra, sin accesores ni campos omitidos.');}
function list(v,min,max){require(Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length>=min&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value')&&d.enumerable),'FAMILY_TARIFF_CONTRACT_INVALID','El conjunto de tarifa no puede tener huecos ni recortes.');}
function nonnegative(value){const n=decimal(value);require(n.n>=0n,'FAMILY_TARIFF_CONTRACT_INVALID','La tabla necesita importes y topes no negativos.');quantize(n,{precision:8,mode:'exact'});return n;}
export function familyTariffInputKeys(node){if(!node||typeof node!=='object')return[];return[node.op==='input'?node.key:null,...['left','right','value','condition','then','else'].flatMap(k=>familyTariffInputKeys(node[k]))].filter(Boolean);}

export function normalizeFamilyTariffPolicy(raw){
 shape(raw,['version','agreementCode','period','liquidationType','selection','outsideRange','mappings','rows','rowsSha256','sourceReference','sourceSha256']);
 const versionMap=mapForVersion(raw.version),mappingCount=versionMap?Object.keys(versionMap).length:0;
 require(versionMap&&raw.agreementCode==='1'&&raw.period==='2026-10'&&raw.liquidationType==='monthly','FAMILY_TARIFF_SCOPE_UNSUPPORTED','Este productor conserva exclusivamente C1 mensual octubre2026.');
 require(raw.selection==='first_upper_bound_inclusive'&&raw.outsideRange==='error'&&payrollExpressionReference(raw.sourceReference)&&sha(raw.sourceSha256)&&sha(raw.rowsSha256),'FAMILY_TARIFF_POLICY_REQUIRED','Región exacta, primer tope inclusivo y error fuera de rango requieren política y huellas explícitas.');
 list(raw.mappings,mappingCount,mappingCount);const mappings=raw.mappings.map(m=>{
  shape(m,['sourceCode','conceptCode','typeCode','sourceReference','sourceSha256']);const expected=versionMap[m.sourceCode];
  require(expected&&m.conceptCode===expected.conceptCode&&m.typeCode===expected.typeCode&&payrollExpressionReference(m.sourceReference)&&sha(m.sourceSha256),'FAMILY_TARIFF_MAPPING_UNPROVEN','El par debe pertenecer al mapa explícito de su versión; no se infiere por desplazamiento.');return{...m};
 }).sort((a,b)=>order(a.sourceCode,b.sourceCode));
 require(new Set(mappings.map(m=>m.sourceCode)).size===mappingCount,'FAMILY_TARIFF_MAPPING_UNPROVEN','El mapa debe conservar todos sus pares distintos.');
 list(raw.rows,1,10000);const seen=new Set(),rows=raw.rows.map(r=>{
  shape(r,['regionCode','typeCode','upperBound','amount','sourceSha256']);require(code(r.regionCode)&&code(r.typeCode)&&sha(r.sourceSha256),'FAMILY_TARIFF_SOURCE_REQUIRED','Cada fila necesita región/tipo exactos y huella.');
  const bound=nonnegative(r.upperBound);nonnegative(r.amount);const id=r.regionCode+':'+r.typeCode+':'+salarySerialized(exactEvidence(bound));require(!seen.has(id),'FAMILY_TARIFF_AMBIGUOUS','La tabla repite el mismo tope de región y tipo.');seen.add(id);return{...r};
 });
 for(const m of mappings)require(rows.some(r=>r.typeCode===m.typeCode),'FAMILY_TARIFF_SOURCE_REQUIRED','Falta por completo un tipo requerido por el mapa.');
 return{...raw,mappings,rows};
}
export function proposeC1FamilyTariffPolicy({rows,rowsSha256,sourceReference,sourceSha256,mappingSourceReference,mappingSourceSha256}){
 return normalizeFamilyTariffPolicy({version:OWN_PAYROLL_FAMILY_TARIFFS_VERSION,agreementCode:'1',period:'2026-10',liquidationType:'monthly',selection:'first_upper_bound_inclusive',outsideRange:'error',mappings:Object.entries(FAMILY_TARIFF_EXECUTOR_MAP).map(([sourceCode,mapping])=>({sourceCode,...mapping,sourceReference:mappingSourceReference,sourceSha256:mappingSourceSha256})),rows,rowsSha256,sourceReference,sourceSha256});
}
/** Declarative new policy for review. The original six mapping sources and the
 * complete tariff table are retained; a V1 approved policy is never rewritten. */
export function proposeC1FamilyTariffPolicyV2({basePolicy,mappingSourceReference,mappingSourceSha256}){
 const before=normalizeFamilyTariffPolicy(basePolicy);
 require(before.version===OWN_PAYROLL_FAMILY_TARIFFS_VERSION,'FAMILY_TARIFF_MAPPING_UNPROVEN','La extensión parte del mapa V1 íntegro.');
 return normalizeFamilyTariffPolicy({...before,version:OWN_PAYROLL_FAMILY_TARIFFS_V2_VERSION,mappings:[...before.mappings,...Object.entries(FAMILY_TARIFF_V2_MAP).filter(([code])=>!Object.hasOwn(FAMILY_TARIFF_EXECUTOR_MAP,code)).map(([sourceCode,mapping])=>({sourceCode,...mapping,sourceReference:mappingSourceReference,sourceSha256:mappingSourceSha256}))]});
}
export function normalizeFamilyTariffProgram(program){
 require(program.namespaceVersion==='own-payroll-namespaces.v2'&&program.familyPayrollFactsVersion==='own-contract-family-payroll-facts.v1','FAMILY_TARIFF_FACT_SOURCE_REQUIRED','La tarifa requiere los hechos familiares propios existentes y referencias separadas.');
 list(program.familyTariffPolicies,1,1);const policies=program.familyTariffPolicies.map(normalizeFamilyTariffPolicy),p=policies[0];
 require(program.familyTariffsVersion===p.version,'FAMILY_TARIFF_VERSION_MISMATCH','La versión del programa debe coincidir con su política.');
 const versionMap=mapForVersion(p.version);
 const bindings=program.bindings.filter(b=>b.sourceKind==='family_tariff');require(bindings.length>0,'FAMILY_TARIFF_BINDING_REQUIRED','El opt-in debe tener un consumidor monetario declarado.');
 for(const b of bindings){
  require(b.agreementCode===p.agreementCode&&versionMap[b.sourceCode]&&b.unit==='money'&&b.combine==='single'&&b.onMissing==='error','FAMILY_TARIFF_BINDING_INVALID','La tarifa es un único importe con mapa acreditado; nunca cero por ausencia.');
  for(const r of program.rules.filter(r=>r.agreementCode===b.agreementCode&&familyTariffInputKeys(r.expression).includes(b.key)))require(r.validFrom==='2026-10'&&r.validUntil==='2026-10'&&r.liquidationTypes.length===1&&r.liquidationTypes[0]==='monthly','FAMILY_TARIFF_SCOPE_UNSUPPORTED','El consumidor debe conservar la vigencia probada de octubre, sin extenderla a otros meses.');
 }
 validateNoTariffQuantityInputs(program.quantityPhases??[],bindings);
 return{familyTariffsVersion:p.version,familyTariffPolicies:policies};
}
export function familyTariffProgramHistory(before,after){
 if(!ownPayrollFamilyTariffs(before))return;
 require(ownPayrollFamilyTariffs(after),'PROGRAM_HISTORY_REQUIRED','Conservá la versión del productor familiar anterior.');
 const next=new Map(after.familyTariffPolicies.map(p=>[familyTariffPolicyKey(p),salarySerialized(p)]));
 require(before.familyTariffPolicies.every(p=>next.get(familyTariffPolicyKey(p))===salarySerialized(p)),'PROGRAM_HISTORY_REQUIRED','No se reemplaza la tabla ni el mapa de una tarifa histórica.');
}
export function validateNoTariffQuantityInputs(phases,bindings){
 for(const q of phases){const keys=new Set(bindings.filter(b=>b.agreementCode===q.agreementCode&&(!Object.hasOwn(b,'sourceKind')||b.sourceKind==='family_tariff')).map(b=>b.key));require(!familyTariffInputKeys(q.expression).some(k=>keys.has(k)),'FAMILY_TARIFF_QUANTITY_CONSUMER_UNSUPPORTED','Este incremento sólo resuelve tarifas monetarias; no modifica las fases de cantidad.');}
}

export function normalizeFamilyTariffCapture(raw,employees,period,liquidationType){
 shape(raw,['version','familyFactsVersion','policies','policySha256','bindings','records']);
 require(raw.version===OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_VERSION&&sha(raw.familyFactsVersion)&&sha(raw.policySha256),'FAMILY_TARIFF_CAPTURE_INVALID','La captura debe referenciar los hechos propios y la política original.');
 list(raw.policies,1,1);const policies=raw.policies.map(normalizeFamilyTariffPolicy),p=policies[0];require(p.period===period&&p.liquidationType===liquidationType,'FAMILY_TARIFF_CAPTURE_SCOPE_CHANGED','La captura de tarifa pertenece a otro período o tipo.');
 const versionMap=mapForVersion(p.version);
 list(raw.bindings,1,512);const bindingSeen=new Set(),bindings=raw.bindings.map(b=>{shape(b,['agreementCode','key','sourceCode']);const id=b.agreementCode+':'+b.key;require(b.agreementCode===p.agreementCode&&key(b.key)&&versionMap[b.sourceCode]&&!bindingSeen.has(id),'FAMILY_TARIFF_BINDING_INVALID','La captura necesita claves y pares únicos del programa.');bindingSeen.add(id);return{...b};}).sort((a,b)=>order(a.key,b.key));
 const eligible=employees.filter(e=>bindings.some(b=>b.agreementCode===e.agreementCode)),expected=new Set(eligible.map(e=>e.contractId));list(raw.records,expected.size,expected.size);
 const records=raw.records.map(r=>{
  shape(r,['contractId','agreementCode','identityToken','revision','approvalId','definitionSha256','regionCode','priorSemesterAverage','asOfDate']);
  require(uuid(r.contractId)&&expected.has(r.contractId)&&r.agreementCode===p.agreementCode&&sha(r.identityToken)&&Number.isSafeInteger(r.revision)&&r.revision>0&&uuid(r.approvalId)&&sha(r.definitionSha256),'FAMILY_TARIFF_CAPTURE_IDENTITY_INVALID','Falta un hecho familiar aprobado de la población original o su identidad.');expected.delete(r.contractId);
  require((r.regionCode===null||typeof r.regionCode==='string'&&/^[0-9]{1,9}$/.test(r.regionCode))&&(r.priorSemesterAverage===null||typeof r.priorSemesterAverage==='string'&&/^(0|[1-9][0-9]{0,14})(\.[0-9]{1,2})?$/.test(r.priorSemesterAverage))&&civilDay(r.asOfDate)&&/^(19|20)/.test(r.asOfDate)&&r.asOfDate.slice(0,7)<=period,'FAMILY_TARIFF_CAPTURE_INVALID','Región y promedio conservan sus tipos y sus nulos originales.');return{...r};
 }).sort((a,b)=>order(a.contractId,b.contractId));
 for(const e of eligible)for(const b of bindings.filter(b=>b.agreementCode===e.agreementCode)){const input=e.inputs.find(i=>i.key===b.key);require(input&&input.unit==='money'&&input.value===null,'FAMILY_TARIFF_EAGER_VALUE_FORBIDDEN','Una tarifa derivada empieza sin resolver; no se admite un importe precargado que eluda el productor.');}
 return{...raw,policies,bindings,records};
}

/** The exact expression evaluator owns branch selection. Its input read invokes
 * this resolver. Unread bindings remain null and carry not_requested evidence.
 * Uses the recovered R9 selector unchanged, with no error-to-zero conversion. */
export function createFamilyTariffInputResolver(capture,employee,consume){
 const original=new Map(employee.inputs.map(i=>[i.key,i])),bindings=capture.bindings.filter(b=>b.agreementCode===employee.agreementCode),byKey=new Map(bindings.map(b=>[b.key,b])),record=capture.records.find(r=>r.contractId===employee.contractId),policy=capture.policies.find(p=>p.agreementCode===employee.agreementCode),resolved=new Map(),decisions=new Map();
 for(const b of bindings){const m=policy.mappings.find(m=>m.sourceCode===b.sourceCode);decisions.set(b.key,{contractId:employee.contractId,agreementCode:employee.agreementCode,key:b.key,sourceCode:b.sourceCode,conceptCode:m.conceptCode,typeCode:m.typeCode,status:'not_requested',readCount:0,value:null,selection:null,familyFactsVersion:capture.familyFactsVersion,familyApprovalId:record.approvalId,familyDefinitionSha256:record.definitionSha256,policySha256:capture.policySha256,rowsSha256:policy.rowsSha256});}
 const inputs={get(inputKey){
  const binding=byKey.get(inputKey);if(!binding)return original.get(inputKey);
  const decision=decisions.get(inputKey);decision.readCount++;
  if(resolved.has(inputKey))return resolved.get(inputKey);
  require(record.regionCode!==null&&record.priorSemesterAverage!==null,'FAMILY_TARIFF_FACT_MISSING','La rama solicita una tarifa pero región o promedio semestral siguen sin informar.');
  // Charge the existing budget for the recovered selector's row work.
  for(const _ of policy.rows)consume();
  const selected=selectFamilyTariff({regionCode:record.regionCode,typeCode:decision.typeCode,priorSemesterAverage:record.priorSemesterAverage,rows:policy.rows,policy:{selection:policy.selection,outsideRange:policy.outsideRange,reference:policy.sourceReference}});
  const value=quantize(methodExact(selected.unitAmount),{precision:8,mode:'exact'}).amount;
  const result={...original.get(inputKey),value};resolved.set(inputKey,result);Object.assign(decision,{status:'resolved',value,selection:selected});return result;
 }};
 return{inputs,decisions:()=>[...decisions.values()].sort((a,b)=>order(a.key,b.key))};
}
