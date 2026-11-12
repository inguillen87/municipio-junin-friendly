import { normalizeOwnPayrollQuantityInput, calculateOwnPayrollWithQuantities } from './own-payroll-quantity.js';
import { decimal, rational, exactAdd, exactSubtract, exactCompare, exactEvidence, quantize, payrollRequire as require } from './own-payroll-exact.js';
import { salarySerialized } from './native-salary-catalog-model.js';
import {policyMonth,requirePolicyScope,requirePolicyDeclaration,policySha256,resolvePolicySuccession,resolvedPolicyAppliesTo} from './own-payroll-policy-validity.js';
import {payrollExpressionReference} from './own-payroll-expression.js';

export const OWN_PAYROLL_OFFICIAL_TOTALS_VERSION='own-payroll-official-totals.v1';
export const OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION='own-payroll-official-totals.v2';
export const OWN_PAYROLL_OFFICIAL_TOTALS_CAPTURE_V2_VERSION='own-payroll-official-totals-capture.v2';
export const OWN_PAYROLL_OFFICIAL_INPUT_VERSION='own-payroll-input.v4';
export const OWN_PAYROLL_OFFICIAL_RESULT_VERSION='own-payroll-result.v4';
const destinations=['990','993','994','995','996'];
const fields=['employer_contribution','remuneration','non_subject','family_allowances','deduction'];
const sourceFields={'990':'employer_contribution','993':'remuneration','994':'non_subject','995':'family_allowances','996':'deduction'};
const expectedNatures={'990':'employer_contribution','993':'remuneration','994':'non_remuneration','995':'non_remuneration','996':'deduction'};
const canonicalCode=x=>typeof x==='string'&&/^[0-9]{1,9}$/.test(x);
const shape=(v,keys)=>require(v&&Object.getPrototypeOf(v)===Object.prototype&&Reflect.ownKeys(v).every(k=>typeof k==='string')&&Object.keys(v).sort().join('|')===[...keys].sort().join('|')&&Object.values(Object.getOwnPropertyDescriptors(v)).every(d=>Object.hasOwn(d,'value')&&d.enumerable),'OFFICIAL_TOTALS_CONTRACT_INVALID','La proyección oficial requiere contrato exacto.');
const numeric=e=>{shape(e,['numerator','denominator']);require(/^-?(0|[1-9][0-9]*)$/.test(e.numerator)&&/^[1-9][0-9]*$/.test(e.denominator),'OFFICIAL_EXACT_VALUE_INVALID','El total debe conservar fracción exacta.');return rational(BigInt(e.numerator),BigInt(e.denominator));};
const sum=values=>values.reduce(exactAdd,decimal('0'));
const same=(a,b)=>exactCompare(a,b)===0;
const rounded=x=>quantize(x,{precision:2,mode:'half_up'}).amount;
const difference=(a,b)=>quantize(exactSubtract(decimal(a),decimal(b)),{precision:2,mode:'exact'}).amount;
const order=(a,b)=>a<b?-1:a>b?1:0;
export const officialTotalsPolicyVersionCompatible=(outer,inner)=>outer===OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION?[OWN_PAYROLL_OFFICIAL_TOTALS_VERSION,OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION].includes(inner):outer===OWN_PAYROLL_OFFICIAL_TOTALS_VERSION&&inner===outer;
export const officialTotalsPolicyKey=p=>[p.agreementCode,p.version===OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION?p.validFrom+'..'+p.validUntil:p.period,p.liquidationType].join(':');
export const officialTotalsPolicyId=p=>p.version===OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION?p.policyId:'legacy:official-totals:'+officialTotalsPolicyKey(p);
export const officialTotalsPolicySha256=policy=>policySha256(policy,{preserveLegacyUnicode:policy.version===OWN_PAYROLL_OFFICIAL_TOTALS_VERSION});
// Every new policy is independently normalized with strict NFC before a full
// lineage hash. Valid V1 text was never required to be NFC; keep its exact bytes.
export const officialTotalsPoliciesSha256=policies=>policySha256(policies,{preserveLegacyUnicode:true});
export const resolveOfficialTotalsPolicies=policies=>resolvePolicySuccession(policies,{identity:officialTotalsPolicyId,scope:p=>p.agreementCode+':'+p.liquidationType,hash:officialTotalsPolicySha256});

export function normalizeOfficialTotalsPolicy(raw){
 const temporal=Object.getOwnPropertyDescriptor(raw??{},'version')?.value===OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION;
 shape(raw,['version',...(temporal?['policyId','supersedes','validFrom','validUntil']:['period']),'agreementCode','liquidationType','totalCodes','contributions','rounding','nonPositiveNet','sourceReference','sourceSha256']);
 if(temporal){requirePolicyScope(raw);requirePolicyDeclaration(raw);require(raw.liquidationType==='monthly','OFFICIAL_TOTALS_SCOPE_INVALID','La nueva vigencia conserva el tipo mensual del contrato económico.');}
 else require(raw.version===OWN_PAYROLL_OFFICIAL_TOTALS_VERSION&&canonicalCode(raw.agreementCode)&&/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(raw.period)&&raw.liquidationType==='monthly','OFFICIAL_TOTALS_SCOPE_INVALID','La política debe declarar convenio, mes y tipo exactos.');
 require(raw.nonPositiveNet==='reject'&&raw.sourceReference?.length>=3&&raw.sourceReference.length<=180&&/^[a-f0-9]{64}$/.test(raw.sourceSha256),'OFFICIAL_TOTALS_POLICY_REQUIRED','Declarar política de neto, respaldo y huella.');
 if(temporal)require(payrollExpressionReference(raw.sourceReference),'OFFICIAL_TOTALS_POLICY_REQUIRED','La nueva política necesita una referencia documental de texto normalizado.');
 shape(raw.rounding,['precision','mode']);require(raw.rounding.precision===2&&raw.rounding.mode==='half_up','OFFICIAL_ROUNDING_UNSUPPORTED','La propuesta actual sólo permite presentación monetaria de2decimales half_up.');
 shape(raw.totalCodes,[...destinations,'888','998','999']);
 require(Object.values(raw.totalCodes).every(canonicalCode)&&new Set(Object.values(raw.totalCodes)).size===8,'OFFICIAL_TOTAL_MAPPING_INVALID','Cada total requiere un auxiliar exacto distinto.');
 shape(raw.contributions,destinations);
 const seen=new Set();
 const contributions=Object.fromEntries(destinations.map(t=>{
  const codes=raw.contributions[t];require(Array.isArray(codes)&&Object.getPrototypeOf(codes)===Array.prototype&&Reflect.ownKeys(codes).length===codes.length+1&&codes.length<=1000&&Object.values(Object.getOwnPropertyDescriptors(codes)).every(d=>Object.hasOwn(d,'value'))&&codes.every(canonicalCode),'OFFICIAL_CONTRIBUTION_INVALID','La lista completa de aportes no puede contener huecos ni códigos inválidos.');
  for(const code of codes){require(!seen.has(code),'OFFICIAL_CONTRIBUTION_DUPLICATE','Un concepto no puede entrar en dos destinos ni repetirse.');seen.add(code);}
  return[t,[...codes].sort()];
 }));
 return{...raw,totalCodes:{...raw.totalCodes},contributions,rounding:{...raw.rounding}};
}

export function normalizeOfficialTotalsPolicies(raw,version=OWN_PAYROLL_OFFICIAL_TOTALS_VERSION){
 require(officialTotalsPolicyVersionCompatible(version,version),'OFFICIAL_TOTALS_VERSION_INVALID','La versión del conjunto oficial debe ser explícita.');
 require(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length>0&&raw.length<=1000&&Reflect.ownKeys(raw).length===raw.length+1&&Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));return d&&Object.hasOwn(d,'value')&&d.enumerable;}).every(Boolean),'OFFICIAL_TOTALS_PROGRAM_INVALID','Las políticas oficiales deben declararse completas.');
 const temporal=version===OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,policies=raw.map(normalizeOfficialTotalsPolicy).sort((a,b)=>temporal?order(officialTotalsPolicyKey(a),officialTotalsPolicyKey(b)):officialTotalsPolicyKey(a).localeCompare(officialTotalsPolicyKey(b)));
 require(policies.every(p=>officialTotalsPolicyVersionCompatible(version,p.version)),'OFFICIAL_TOTALS_VERSION_INVALID','La versión del conjunto debe admitir cada política original.');
 require(new Set(policies.map(officialTotalsPolicyKey)).size===policies.length,'OFFICIAL_TOTALS_POLICY_OVERLAP','No se repite una política del mismo alcance y vigencia.');
 if(temporal)resolveOfficialTotalsPolicies(policies);
 return policies;
}

/** Captured selection is proved from the whole scoped lineage and period.
 * The declared selected ID is checked after resolving; it is not authority. */
export function normalizeOfficialTotalsCapture(raw){
 shape(raw,['version','period','liquidationType','agreementCode','policies','policiesSha256','selectedPolicyId']);
 require(raw.version===OWN_PAYROLL_OFFICIAL_TOTALS_CAPTURE_V2_VERSION&&policyMonth(raw.period)&&raw.liquidationType==='monthly'&&canonicalCode(raw.agreementCode),'OFFICIAL_TOTALS_CAPTURE_INVALID','La captura oficial necesita versión, período, tipo y convenio explícitos.');
 const policies=normalizeOfficialTotalsPolicies(raw.policies,OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION);
 require(policies.every(p=>p.agreementCode===raw.agreementCode&&p.liquidationType===raw.liquidationType),'OFFICIAL_TOTALS_CAPTURE_INVALID','La captura no puede mezclar políticas de otro alcance.');
 const selected=resolveOfficialTotalsPolicies(policies).filter(entry=>resolvedPolicyAppliesTo(entry,raw));
 require(selected.length===1&&selected[0].policyId===raw.selectedPolicyId,'OFFICIAL_TOTALS_POLICY_REQUIRED','El período requiere una única política efectiva derivada de su cadena completa.');
 require(officialTotalsPoliciesSha256(policies)===raw.policiesSha256,'OFFICIAL_TOTALS_CAPTURE_CHANGED','La captura debe conservar todas sus políticas originales y su hash canónico.');
 return{...raw,policies};
}
export function normalizeOfficialTotalsEvidence(raw){
 require(raw&&Object.getPrototypeOf(raw)===Object.prototype&&['officialTotalsPolicy',...(Object.hasOwn(raw,'officialTotalsCapture')?['officialTotalsCapture']:[])].every(k=>{const d=Object.getOwnPropertyDescriptor(raw,k);return d&&Object.hasOwn(d,'value')&&d.enumerable;}),'OFFICIAL_TOTALS_CONTRACT_INVALID','La evidencia oficial debe conservar datos propios explícitos.');
 const policy=normalizeOfficialTotalsPolicy(raw.officialTotalsPolicy);
 if(Object.hasOwn(raw,'officialTotalsCapture')){
  const capture=normalizeOfficialTotalsCapture(raw.officialTotalsCapture),selected=capture.policies.find(p=>officialTotalsPolicyId(p)===capture.selectedPolicyId);
  require(salarySerialized(selected)===salarySerialized(policy),'OFFICIAL_STORED_POLICY_MISMATCH','La política seleccionada debe ser el original exacto probado por la captura.');
  // V1 references admitted decomposed Unicode. Validate the same text safety
  // rules on its NFC form without storing or hashing that validation-only form.
  if(policy.version===OWN_PAYROLL_OFFICIAL_TOTALS_VERSION)require(payrollExpressionReference(policy.sourceReference.normalize('NFC')),'OFFICIAL_TOTALS_POLICY_REQUIRED','La referencia histórica debe conservar texto válido, sin controles ni marcado.');
  return{policy,capture,version:OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,context:{period:capture.period,liquidationType:capture.liquidationType,agreementCode:capture.agreementCode}};
 }
 require(policy.version===OWN_PAYROLL_OFFICIAL_TOTALS_VERSION,'OFFICIAL_TOTALS_CAPTURE_REQUIRED','Una política temporal necesita su captura explícita y cadena completa.');
 return{policy,capture:null,version:OWN_PAYROLL_OFFICIAL_TOTALS_VERSION,context:{period:policy.period,liquidationType:policy.liquidationType,agreementCode:policy.agreementCode}};
}
export function normalizeOwnPayrollOfficialInput(raw){
 // The quantity normalizer performs inert copying and strict shape validation.
 // Descriptors prevent getter evaluation before delegating to that boundary.
 require(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Object.values(Object.getOwnPropertyDescriptors(raw)).every(d=>Object.hasOwn(d,'value')&&d.enumerable),'OFFICIAL_TOTALS_CONTRACT_INVALID','No se admiten accesores en la captura.');
 require(raw.version===OWN_PAYROLL_OFFICIAL_INPUT_VERSION,'OFFICIAL_TOTALS_VERSION_INVALID','La nueva salida necesita captura explícita V4.');
 const{officialTotalsPolicy:rawPolicy,officialTotalsCapture:rawCapture,...monetary}=raw;
 const {policy,capture,context}=normalizeOfficialTotalsEvidence(raw);
 const input=normalizeOwnPayrollQuantityInput({...monetary,version:'own-payroll-input.v3'});
 require(input.period===context.period&&input.liquidationType===context.liquidationType&&input.totalsPrecision===2,'OFFICIAL_TOTALS_SCOPE_INVALID','La política no corresponde al período o precisión capturados.');
 return{...input,version:OWN_PAYROLL_OFFICIAL_INPUT_VERSION,officialTotalsPolicy:policy,...(capture?{officialTotalsCapture:capture}:{})};
}

function project(result,policy,capture=null){
 const selected=new Set(result.employeeTotals.map(t=>t.contractId)), rowsByContract=new Map();
 for(const row of result.rows){require(selected.has(row.contractId),'OFFICIAL_FOREIGN_ROW','Hay un renglón ajeno a la población.');const m=rowsByContract.get(row.contractId)??new Map(),key=(row.nature==='auxiliary'?'auxiliary:':'concept:')+row.conceptCode;require(!m.has(key),'OFFICIAL_ROW_DUPLICATE','Una identidad de renglón se repite.');m.set(key,row);rowsByContract.set(row.contractId,m);}
 const employeeTotals=[],totalReconciliations=[];
 for(const lineTotals of result.employeeTotals){
  const rows=rowsByContract.get(lineTotals.contractId);require(rows,'OFFICIAL_POPULATION_MISSING','Falta un contrato de la población.');
  const get=(code,space)=>{const row=rows.get(space+':'+code);require(row&&row.agreementCode===policy.agreementCode&&row.unit==='money','OFFICIAL_TOTAL_SOURCE_MISSING','Falta la fuente monetaria exacta del total.');return row;};
  const internal=Object.fromEntries(Object.entries(policy.totalCodes).map(([target,code])=>[target,numeric(get(code,'auxiliary').exactValue)]));
  const printed={},observed=new Set(),categoryDeltas={};
  for(const target of destinations){
   const sourceRows=policy.contributions[target].map(code=>{const row=get(code,'concept');require(row.nature===expectedNatures[target],'OFFICIAL_NATURE_DESTINATION_MISMATCH','La naturaleza propia no coincide con el destino global declarado.');require(row.rounding?.precision===2&&row.rounding?.mode==='half_up','OFFICIAL_LINE_ROUNDING_MISMATCH','Los importes originales deben conservar su política declarada.');observed.add(code);return row;});
   require(same(sum(sourceRows.map(r=>numeric(r.exactValue))),internal[target]),'OFFICIAL_ACCUMULATOR_MISMATCH','El total interno no coincide con todos los aportes exactos identificados.');
   printed[target]=sum(sourceRows.map(r=>decimal(r.amount)));
   categoryDeltas[sourceFields[target]]=difference(rounded(internal[target]),quantize(printed[target],{precision:2,mode:'exact'}).amount);
  }
  require([...rows.values()].filter(r=>r.nature!=='auxiliary').every(r=>observed.has(r.conceptCode)),'OFFICIAL_UNMAPPED_CONTRIBUTION','Hay un concepto pagable sin destino declarado; no se omite.');
  const grossExact=sum([internal['993'],internal['994'],internal['995']]),netExact=exactSubtract(exactAdd(grossExact,internal['888']),internal['996']);
  require(exactCompare(netExact,decimal('0'))>0,'OFFICIAL_NONPOSITIVE_NET_REVIEW_REQUIRED','El neto no es positivo; conservar cálculo para revisión sin producir salida pagable.');
  require(same(internal['998'],netExact)&&same(internal['999'],internal['998']),'OFFICIAL_NET_ACCUMULATOR_MISMATCH','Neto998/999 no coincide con los componentes exactos y la política Sinredondeo.');
  const official={contractId:lineTotals.contractId,remuneration:rounded(internal['993']),non_remuneration:rounded(exactAdd(internal['994'],internal['995'])),deduction:rounded(internal['996']),employer_contribution:rounded(internal['990']),gross:rounded(grossExact),net:rounded(internal['999'])};
  // Detect drift from the original engine's row sums before publishing any projection.
  const expectedLine={remuneration:quantize(printed['993'],{precision:2,mode:'exact'}).amount,non_remuneration:quantize(exactAdd(printed['994'],printed['995']),{precision:2,mode:'exact'}).amount,deduction:quantize(printed['996'],{precision:2,mode:'exact'}).amount,employer_contribution:quantize(printed['990'],{precision:2,mode:'exact'}).amount};
  expectedLine.gross=quantize(exactAdd(decimal(expectedLine.remuneration),decimal(expectedLine.non_remuneration)),{precision:2,mode:'exact'}).amount;
  expectedLine.net=quantize(exactSubtract(decimal(expectedLine.gross),decimal(expectedLine.deduction)),{precision:2,mode:'exact'}).amount;
  require(Object.keys(expectedLine).every(k=>expectedLine[k]===lineTotals[k]),'OFFICIAL_PRINTED_TOTAL_MISMATCH','Los totales originales no coinciden con sus renglones.');
  const adjustment=rounded(internal['888']);
  const displayedEquation=exactSubtract(exactAdd(decimal(official.gross),decimal(adjustment)),decimal(official.deduction));
  const equationRounding=quantize(exactSubtract(decimal(official.net),displayedEquation),{precision:2,mode:'exact'}).amount;
  const lineToOfficial=difference(official.net,lineTotals.net);
  const roundingOnly=quantize(exactSubtract(decimal(lineToOfficial),decimal(adjustment)),{precision:2,mode:'exact'}).amount;
  require(same(exactAdd(exactAdd(decimal(lineTotals.net),decimal(adjustment)),decimal(roundingOnly)),decimal(official.net)),'OFFICIAL_RECONCILIATION_INVALID','La conciliación no cierra exactamente.');
  totalReconciliations.push({contractId:lineTotals.contractId,agreementCode:policy.agreementCode,sourceTotals:structuredClone(policy.totalCodes),exactComponents:Object.fromEntries(Object.entries(internal).map(([k,v])=>[k,exactEvidence(v)])),rounding:policy.rounding,originalLineTotals:structuredClone(lineTotals),officialTotals:structuredClone(official),categoryDifferences:categoryDeltas,netAdjustmentOutsideGross:adjustment,roundingDifferenceFromLines:roundingOnly,netDifferenceFromLines:lineToOfficial,displayedEquationRounding:equationRounding,identities:{linesNetPlusAdjustmentPlusRoundingEqualsOfficialNet:true,officialGrossPlusAdjustmentMinusDeductionPlusDisplayedRoundingEqualsOfficialNet:true},sourceLineAmountsUnchanged:true,reconciliationIsPayrollConcept:false,reference:policy.sourceReference});
  employeeTotals.push(official);
 }
 return{...result,version:OWN_PAYROLL_OFFICIAL_RESULT_VERSION,officialTotalsVersion:capture?OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION:OWN_PAYROLL_OFFICIAL_TOTALS_VERSION,officialTotalsPolicy:structuredClone(policy),...(capture?{officialTotalsCapture:structuredClone(capture)}:{}),lineEmployeeTotals:structuredClone(result.employeeTotals),employeeTotals,totalReconciliations};
}
export function calculateOwnPayrollWithOfficialTotals(raw){
 const normalized=normalizeOwnPayrollOfficialInput(raw),{officialTotalsPolicy,officialTotalsCapture,...quantity}=normalized;
 const result=calculateOwnPayrollWithQuantities({...quantity,version:'own-payroll-input.v3'});
 let projected;
 try{projected=project(result,officialTotalsPolicy,officialTotalsCapture);}catch(error){
  if(error?.code==='OFFICIAL_NONPOSITIVE_NET_REVIEW_REQUIRED')error.calculationForReview=result;
  throw error;
 }
 require(new TextEncoder().encode(salarySerialized(projected)).byteLength<=32*1024*1024,'RESULT_LIMIT','La proyección completa supera la capacidad; no se recorta.');
 return projected;
}

/** Check the stored projection from the stored exact rows. This deliberately
 * does not re-evaluate salary expressions or replace a historic algorithm.
 * The caller validates row/quantity identities and verifies the original hashes.
 */
export function verifyOwnPayrollOfficialProjection(rawInput, storedResult){
 const input=normalizeOwnPayrollOfficialInput(rawInput);
 shape(storedResult,['version','period','liquidationType','selection','sourceVersions','employeeCount','rowCount','rows','employeeTotals','payrollCalculated','payrollPosted','municipalApprovalVerified','paymentExecuted','quantityCount','quantities','officialTotalsVersion','officialTotalsPolicy',...(input.officialTotalsCapture?['officialTotalsCapture']:[]),'lineEmployeeTotals','totalReconciliations']);
 require(storedResult.version===OWN_PAYROLL_OFFICIAL_RESULT_VERSION&&storedResult.officialTotalsVersion===(input.officialTotalsCapture?OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION:OWN_PAYROLL_OFFICIAL_TOTALS_VERSION)&&salarySerialized(storedResult.officialTotalsPolicy)===salarySerialized(input.officialTotalsPolicy)&&salarySerialized(storedResult.officialTotalsCapture??null)===salarySerialized(input.officialTotalsCapture??null),'OFFICIAL_STORED_POLICY_MISMATCH','El resultado debe conservar exactamente la política y cadena capturadas.');
 const{officialTotalsVersion,officialTotalsPolicy,officialTotalsCapture,lineEmployeeTotals,totalReconciliations,...quantityResult}=storedResult;
 const reconstructed=project({...quantityResult,version:'own-payroll-result.v3',employeeTotals:lineEmployeeTotals},input.officialTotalsPolicy,input.officialTotalsCapture);
 require(salarySerialized(reconstructed)===salarySerialized(storedResult),'OFFICIAL_STORED_PROJECTION_MISMATCH','La conciliación guardada no coincide con sus renglones exactos; no se reemplaza ni se oculta.');
 return storedResult;
}

/** Validate the immutable economic evidence retained by a close or receipt.
 * This reuses the V4 projection itself. It consumes the original exact rows
 * and line sums, not a fabricated payroll input or a replacement saved run.
 */
export function verifyOwnPayrollOfficialEconomicRows({rows,lineTotals,totals,totalReconciliation,officialTotalsPolicy,...extra}){
 require(Object.keys(extra).every(k=>k==='officialTotalsCapture'),'OFFICIAL_TOTALS_CONTRACT_INVALID','La evidencia económica no admite campos oficiales implícitos.');
 const {policy,capture}=normalizeOfficialTotalsEvidence({officialTotalsPolicy,...extra});
 require(salarySerialized(policy)===salarySerialized(officialTotalsPolicy),'OFFICIAL_STORED_POLICY_MISMATCH','La política histórica debe conservar su representación original.');
 const expected=project({rows,employeeTotals:[lineTotals]},policy,capture);
 require(salarySerialized(expected.employeeTotals)===salarySerialized([totals])&&salarySerialized(expected.totalReconciliations)===salarySerialized([totalReconciliation]),'OFFICIAL_STORED_PROJECTION_MISMATCH','Los totales oficiales y su conciliación deben corresponder a todas las filas económicas originales.');
 return {rows,lineTotals,totals,totalReconciliation,officialTotalsPolicy,...extra};
}

/** Strict decimal for exports. Exact quantity evidence is retained in the result;
 * an export never rounds an unrepresentable quantity behind the user's back. */
export function quantityDecimalForExport(quantity){
 require(quantity&&quantity.value&&['days','hours','minutes','units','percent','money','coefficient'].includes(quantity.unit),'QUANTITY_EXPORT_INVALID','La cantidad exportada requiere unidad y valor exactos.');
 const text=quantize(numeric(quantity.value),{precision:8,mode:'exact'}).amount;
 return text.includes('.')?text.replace(/0+$/,'').replace(/\.$/,''):text;
}
