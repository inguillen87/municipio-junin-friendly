// Explicit receipt emission. Economic rows, R/U references and V4 totals remain
// untouched. V1-V4 entrypoints never infer this policy from a zero amount.
import {normalizeOwnPayrollOfficialInput,calculateOwnPayrollWithOfficialTotals,OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,normalizeOfficialTotalsPolicies,resolveOfficialTotalsPolicies} from './own-payroll-official-totals.js';
import {decimal,rational,exactCompare,exactEvidence,quantize,payrollRequire as require} from './own-payroll-exact.js';
import {salarySerialized} from './native-salary-catalog-model.js';
import {payrollExpressionReference} from './own-payroll-expression.js';
import {requirePolicyScope,policyCode,requirePolicyDeclaration,resolvePolicySuccession,resolvedPolicyAppliesTo,policyBoundaryMonths} from './own-payroll-policy-validity.js';

export const OWN_PAYROLL_ROW_EMISSION_VERSION='own-payroll-row-emission.v1';
export const OWN_PAYROLL_ROW_EMISSION_V2_VERSION='own-payroll-row-emission.v2';
export const OWN_PAYROLL_EMISSION_INPUT_VERSION='own-payroll-input.v5';
export const OWN_PAYROLL_EMISSION_RESULT_VERSION='own-payroll-result.v5';
export const ownPayrollRowEmission=v=>v!==null&&typeof v==='object'&&[OWN_PAYROLL_ROW_EMISSION_VERSION,OWN_PAYROLL_ROW_EMISSION_V2_VERSION].includes(Object.getOwnPropertyDescriptor(v,'rowEmissionVersion')?.value);
export const rowEmissionPolicyId=p=>p.version===OWN_PAYROLL_ROW_EMISSION_V2_VERSION?p.policyId:'legacy:row-emission:'+rowEmissionPolicyKey(p);
export const resolveRowEmissionPolicies=policies=>resolvePolicySuccession(policies,{identity:rowEmissionPolicyId,scope:p=>[p.agreementCode,p.liquidationType,p.conceptCode].join(':')});
export const rowEmissionPolicyKey=p=>[p.agreementCode,p.version===OWN_PAYROLL_ROW_EMISSION_V2_VERSION?p.validFrom+'..'+p.validUntil:p.period,p.liquidationType,p.conceptCode].join(':');
export const rowEmissionRowKey=r=>[r.contractId,r.nature==='auxiliary'?'auxiliary':'concept',r.conceptCode].join(':');
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const order=(a,b)=>a<b?-1:a>b?1:0;
const active=(r,p)=>r.agreementCode===p.agreementCode&&r.validFrom<=p.period&&(r.validUntil===null||r.validUntil>=p.period)&&r.liquidationTypes.includes(p.liquidationType);
const zero=decimal('0');
export function copyRowEmissionData(value,depth=0,parents=new Set(),budget={nodes:0}){
 require(depth<=64&&++budget.nodes<=1000000,'ROW_EMISSION_CONTRACT_INVALID','La evidencia supera su capacidad íntegra.');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){require(Number.isSafeInteger(value),'ROW_EMISSION_CONTRACT_INVALID','La evidencia numérica requiere enteros o decimales exactos como texto.');return value;}
 require(value&&typeof value==='object'&&!parents.has(value),'ROW_EMISSION_CONTRACT_INVALID','La evidencia no admite ciclos ni valores ejecutables.');
 const array=Array.isArray(value),descriptors=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(value);
 require(Object.getPrototypeOf(value)===(array?Array.prototype:Object.prototype)&&keys.every(k=>typeof k==='string'&&Object.hasOwn(descriptors[k],'value')&&(array&&k==='length'||descriptors[k].enumerable)),'ROW_EMISSION_CONTRACT_INVALID','La evidencia no admite accesores ni propiedades ocultas.');
 if(array)list(value,0,1000000);
 parents.add(value);
 const copy=array?Array.from({length:value.length},(_,i)=>copyRowEmissionData(descriptors[String(i)].value,depth+1,parents,budget)):Object.fromEntries(keys.map(k=>[k,copyRowEmissionData(descriptors[k].value,depth+1,parents,budget)]));
 parents.delete(value);return copy;
}
function shape(value,keys){
 require(value&&Object.getPrototypeOf(value)===Object.prototype&&Reflect.ownKeys(value).every(k=>typeof k==='string')&&Reflect.ownKeys(value).sort().join('|')===[...keys].sort().join('|')&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value')&&d.enumerable),'ROW_EMISSION_CONTRACT_INVALID','La emisión requiere un contrato completo sin campos implícitos ni accesores.');
}
function list(v,min,max){
 require(Array.isArray(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length>=min&&v.length<=max&&Reflect.ownKeys(v).length===v.length+1&&Array.from({length:v.length},(_,i)=>Object.getOwnPropertyDescriptor(v,String(i))).every(d=>d&&Object.hasOwn(d,'value')&&d.enumerable),'ROW_EMISSION_CONTRACT_INVALID','La política y su evidencia deben estar completas, sin huecos ni recortes.');
}
function numeric(v){
 shape(v,['numerator','denominator']);require(typeof v.numerator==='string'&&typeof v.denominator==='string'&&/^-?(0|[1-9][0-9]{0,255})$/.test(v.numerator)&&/^[1-9][0-9]{0,255}$/.test(v.denominator),'ROW_EMISSION_EXACT_VALUE_INVALID','La evidencia debe conservar una fracción exacta.');
 const n=rational(BigInt(v.numerator),BigInt(v.denominator));require(salarySerialized(exactEvidence(n))===salarySerialized(v),'ROW_EMISSION_EXACT_VALUE_INVALID','La fracción debe conservar su forma canónica.');return n;
}
export function normalizeRowEmissionPolicies(raw,version=OWN_PAYROLL_ROW_EMISSION_VERSION){
 const temporal=version===OWN_PAYROLL_ROW_EMISSION_V2_VERSION;
 require(temporal||version===OWN_PAYROLL_ROW_EMISSION_VERSION,'ROW_EMISSION_VERSION_INVALID','La versión de la política debe declararse explícitamente.');
 list(raw,1,temporal?1000:2);
 const policies=raw.map(p=>{
  if(temporal&&Object.getOwnPropertyDescriptor(p??{},'version')?.value===OWN_PAYROLL_ROW_EMISSION_V2_VERSION){
   shape(p,['version','policyId','supersedes','agreementCode','validFrom','validUntil','liquidationType','conceptCode','conditions','whenFalse','nonzeroAction','sourceReference','sourceSha256']);
   requirePolicyScope(p);requirePolicyDeclaration(p);
   require(p.liquidationType==='monthly'&&policyCode(p.conceptCode),'ROW_EMISSION_SCOPE_UNSUPPORTED','La emisión debe declarar el concepto y conserva el tipo mensual de los totales oficiales.');
   require(p.whenFalse==='omit_receipt_row'&&p.nonzeroAction==='error'&&payrollExpressionReference(p.sourceReference)&&sha(p.sourceSha256),'ROW_EMISSION_POLICY_REQUIRED','La omisión necesita respaldo y rechazo de contribuciones no nulas.');
   list(p.conditions,1,32);const seen=new Set();
   const conditions=p.conditions.map(c=>{
    shape(c,['quantityCode','unit','stage','valueDomain','operator','value']);
    require(policyCode(c.quantityCode)&&['days','hours','minutes','units','percent','coefficient'].includes(c.unit)&&['exact','rounded'].includes(c.stage)&&['nonnegative','nonnegative_integer'].includes(c.valueDomain)&&['lt','le','eq','ne','ge','gt'].includes(c.operator),'ROW_EMISSION_ELIGIBILITY_POLICY_INVALID','La condición debe declarar cantidad, unidad, etapa, dominio y comparación; no se deduce del importe.');
    const value=decimal(c.value);require(value.n>=0n,'ROW_EMISSION_ELIGIBILITY_POLICY_INVALID','El umbral de cantidad debe ser no negativo.');quantize(value,{precision:8,mode:'exact'});
    const key=salarySerialized(c);require(!seen.has(key),'ROW_EMISSION_ELIGIBILITY_POLICY_INVALID','No se repite una condición completa.');seen.add(key);return{...c};
   });
   return{...p,conditions};
  }
  shape(p,['agreementCode','period','liquidationType','conceptCode','conditions','whenFalse','nonzeroAction','sourceReference','sourceSha256']);
  require(p.agreementCode==='1'&&p.period==='2026-10'&&p.liquidationType==='monthly'&&['302','306'].includes(p.conceptCode),'ROW_EMISSION_SCOPE_UNSUPPORTED','Este candidato sólo alcanza302/306 del convenio1, mensual de octubre2026.');
  require(p.whenFalse==='omit_receipt_row'&&p.nonzeroAction==='error'&&payrollExpressionReference(p.sourceReference)&&sha(p.sourceSha256),'ROW_EMISSION_POLICY_REQUIRED','La omisión necesita decisión explícita, respaldo y rechazo de contribuciones no nulas.');
  list(p.conditions,2,2);
  for(const c of p.conditions)shape(c,['quantityCode','unit','operator','value']);
  const expected=[{quantityCode:'1',unit:'days',operator:'gt',value:'14'},{quantityCode:p.conceptCode,unit:'units',operator:'gt',value:'0'}];
  require(salarySerialized(p.conditions)===salarySerialized(expected),'ROW_EMISSION_ELIGIBILITY_POLICY_INVALID','Conservá U1>14 y la cantidad familiar positiva; no se deduce elegibilidad del importe.');
  return{...p,conditions:expected};
 }).sort((a,b)=>order(rowEmissionPolicyKey(a),rowEmissionPolicyKey(b)));
 require(new Set(policies.map(rowEmissionPolicyKey)).size===policies.length,'ROW_EMISSION_POLICY_DUPLICATE','Una decisión de emisión no puede repetirse para el mismo concepto y alcance.');
 if(temporal)resolveRowEmissionPolicies(policies);
 return policies;
}
export function selectRowEmissionPolicies(program,period,liquidationType,agreementCode){
 const policies=normalizeRowEmissionPolicies(program.rowEmissionPolicies,program.rowEmissionVersion);
 const selected=resolveRowEmissionPolicies(policies).filter(entry=>resolvedPolicyAppliesTo(entry,{period,liquidationType,agreementCode})).map(entry=>entry.policy);
 require(selected.length>0,'ROW_EMISSION_POLICY_REQUIRED','Falta una política de emisión declarada para el período; no se prolonga la anterior.');
 return selected;
}
export function validateRowEmissionContext(rules,phases,policies,officialPolicies,{allowInactivePolicies=false,officialTotalsVersion='own-payroll-official-totals.v1',capturedPeriod=null}={}){
 const temporalTotals=officialTotalsVersion===OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION;
 const officialEntries=temporalTotals?resolveOfficialTotalsPolicies(normalizeOfficialTotalsPolicies(officialPolicies,officialTotalsVersion)):null;
 for(const entry of resolveRowEmissionPolicies(policies)){
  const policy=entry.policy;
  const temporal=policy.version===OWN_PAYROLL_ROW_EMISSION_V2_VERSION;
  let official;
  if(temporalTotals){
   const sameScope=p=>p.agreementCode===policy.agreementCode&&p.liquidationType===policy.liquidationType;
   const contextAt=period=>({period,liquidationType:policy.liquidationType,agreementCode:policy.agreementCode});
   const scopeEntries=officialEntries.filter(e=>sameScope(e.policy));
   const declarations=[...scopeEntries,...rules.filter(r=>r.agreementCode===policy.agreementCode&&r.liquidationTypes.includes(policy.liquidationType)),...phases.filter(q=>q.agreementCode===policy.agreementCode&&q.liquidationTypes.includes(policy.liquidationType))];
   const periods=capturedPeriod===null?policyBoundaryMonths(entry,declarations):resolvedPolicyAppliesTo(entry,contextAt(capturedPeriod))?[capturedPeriod]:[];
   official=periods.map(period=>{
    const selected=scopeEntries.filter(e=>resolvedPolicyAppliesTo(e,contextAt(period)));
    require(selected.length===1,'ROW_EMISSION_TOTAL_DESTINATION_REQUIRED','Cada intervalo de emisión requiere una política oficial efectiva completa, sin huecos.');
    return{policy:selected[0].policy,period};
   });
  }else official=officialPolicies.filter(p=>resolvedPolicyAppliesTo(entry,{period:p.period,liquidationType:p.liquidationType,agreementCode:p.agreementCode})).map(policy=>({policy,period:policy.period}));
  require(official.length>0||allowInactivePolicies,'ROW_EMISSION_TOTAL_DESTINATION_REQUIRED','La política requiere al menos un período con totales oficiales explícitos. Cada captura vuelve a exigir el mes exacto.');
  for(const {policy:totals,period} of official){
   const context={agreementCode:policy.agreementCode,period,liquidationType:policy.liquidationType};
   const monetary=rules.filter(r=>active(r,context)&&r.code===policy.conceptCode&&r.nature!=='auxiliary');
   require(monetary.length===1&&monetary[0].nature==='non_remuneration'&&monetary[0].unit==='money','ROW_EMISSION_RULE_REQUIRED','La política debe identificar un único concepto familiar vigente.');
   for(const condition of policy.conditions){
    const found=phases.filter(q=>active(q,context)&&q.code===condition.quantityCode);
    require(found.length===1&&found[0].unit===condition.unit&&(temporal?found[0].stage===condition.stage:condition.quantityCode==='1'||found[0].stage==='exact'),'ROW_EMISSION_QUANTITY_REQUIRED','La emisión necesita las fases capturadas originales, con unidades y etapas exactas.');
   }
   require(totals.contributions['995'].includes(policy.conceptCode),'ROW_EMISSION_TOTAL_DESTINATION_REQUIRED','El concepto familiar debe conservar su aporte al acumulador995.');
  }
  if(!temporal&&official.length>0)require(official.length===1,'ROW_EMISSION_TOTAL_DESTINATION_REQUIRED','La decisión histórica requiere su único total oficial exacto.');
 }
 return policies;
}
export function rowEmissionBaseInput(input){
 const{rowEmissionVersion,rowEmissionPolicies,...base}=input;
 return{...base,version:'own-payroll-input.v4'};
}
export function normalizeOwnPayrollRowEmissionInput(raw){
 require(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Object.values(Object.getOwnPropertyDescriptors(raw)).every(d=>Object.hasOwn(d,'value')&&d.enumerable),'ROW_EMISSION_CONTRACT_INVALID','La captura de emisión no admite accesores.');
 require(raw.version===OWN_PAYROLL_EMISSION_INPUT_VERSION&&ownPayrollRowEmission(raw),'ROW_EMISSION_VERSION_INVALID','La omisión requiere una entrada V5 explícita; no modifica capturas anteriores.');
 const policies=normalizeRowEmissionPolicies(raw.rowEmissionPolicies,raw.rowEmissionVersion),base=normalizeOwnPayrollOfficialInput(rowEmissionBaseInput(raw));
 const context={period:base.period,liquidationType:base.liquidationType,agreementCode:base.officialTotalsPolicy.agreementCode},active=resolveRowEmissionPolicies(policies).filter(entry=>resolvedPolicyAppliesTo(entry,context));
 require(active.length>0&&policies.every(p=>p.agreementCode===context.agreementCode&&p.liquidationType===context.liquidationType)&&(raw.rowEmissionVersion===OWN_PAYROLL_ROW_EMISSION_V2_VERSION||active.length===policies.length),'ROW_EMISSION_SCOPE_INVALID','La captura debe conservar la cadena del mismo alcance y una política activa explícita.');
 validateRowEmissionContext(base.rules,base.quantityPhases,policies,base.officialTotalsCapture?.policies??[base.officialTotalsPolicy],{allowInactivePolicies:raw.rowEmissionVersion===OWN_PAYROLL_ROW_EMISSION_V2_VERSION,officialTotalsVersion:base.officialTotalsCapture?OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION:'own-payroll-official-totals.v1',capturedPeriod:base.period});
 const input={...base,version:OWN_PAYROLL_EMISSION_INPUT_VERSION,rowEmissionVersion:raw.rowEmissionVersion,rowEmissionPolicies:policies};
 require(new TextEncoder().encode(salarySerialized(input)).byteLength<=8*1024*1024,'ROW_EMISSION_INPUT_LIMIT','La captura de emisión supera su límite íntegro; no se recorta.');
 return input;
}
export function rowEmissionBaseResult(result){
 const{rowEmissionVersion,rowEmissionPolicies,receiptRowCount,receiptRowKeys,emissionDecisionCount,rowEmissions,...base}=result;
 return{...base,version:'own-payroll-result.v4'};
}
export function calculateOwnPayrollWithRowEmission(raw){
 const input=normalizeOwnPayrollRowEmissionInput(raw),base=calculateOwnPayrollWithOfficialTotals(rowEmissionBaseInput(input));
 const activePolicies=resolveRowEmissionPolicies(input.rowEmissionPolicies).filter(entry=>resolvedPolicyAppliesTo(entry,{period:input.period,liquidationType:input.liquidationType,agreementCode:input.officialTotalsPolicy.agreementCode})).map(entry=>entry.policy);
 const rows=new Map(base.rows.map(r=>[rowEmissionRowKey(r),r])),quantities=new Map(base.quantities.map(q=>[q.contractId+':'+q.conceptCode,q])),omitted=new Set(),decisions=[];
 for(const employee of base.employeeTotals){
  for(const policy of activePolicies){
   const key=employee.contractId+':concept:'+policy.conceptCode,row=rows.get(key);
   require(row&&row.agreementCode===policy.agreementCode,'ROW_EMISSION_ROW_REQUIRED','Falta una fila calculada del alcance; no se entrega un subconjunto.');
   const conditions=policy.conditions.map(c=>{
    const q=quantities.get(employee.contractId+':'+c.quantityCode);
    require(q&&q.unit===c.unit,'ROW_EMISSION_QUANTITY_REQUIRED','Falta la cantidad calculada que acredita la decisión.');
    const value=numeric(q.value);
    require(value.n>=0n&&(policy.version===OWN_PAYROLL_ROW_EMISSION_V2_VERSION?c.valueDomain==='nonnegative'||value.d===1n:c.quantityCode==='1'||value.d===1n),'ROW_EMISSION_QUANTITY_INVALID','Una cantidad familiar negativa o fraccionaria no acredita ausencia de derecho.');
    const comparison=exactCompare(value,decimal(c.value)),passed=policy.version===OWN_PAYROLL_ROW_EMISSION_V2_VERSION?{lt:comparison<0,le:comparison<=0,eq:comparison===0,ne:comparison!==0,ge:comparison>=0,gt:comparison>0}[c.operator]:comparison>0;
    return{...c,observed:exactEvidence(value),passed,quantitySourceSha256:q.sourceSha256};
   });
   const emit=conditions.every(c=>c.passed);
   if(!emit){
    require(exactCompare(numeric(row.exactValue),zero)===0&&exactCompare(decimal(row.amount),zero)===0,'ROW_EMISSION_NONZERO_CONTRIBUTION','Una decisión de no emitir no puede ocultar un importe ni una fracción no nula. Revisá la contradicción.');
    omitted.add(key);
   }
   decisions.push({rowKey:key,contractId:row.contractId,agreementCode:row.agreementCode,conceptCode:row.conceptCode,policyKey:rowEmissionPolicyKey(policy),decision:emit?'emit':'omit',reason:emit?'conditions_met':'conditions_not_met',conditions,sourceReference:policy.sourceReference,sourceSha256:policy.sourceSha256});
  }
 }
 decisions.sort((a,b)=>order(a.rowKey,b.rowKey));
 const receiptRowKeys=base.rows.filter(r=>r.nature!=='auxiliary'&&!omitted.has(rowEmissionRowKey(r))).map(rowEmissionRowKey);
 const result={...base,version:OWN_PAYROLL_EMISSION_RESULT_VERSION,rowEmissionVersion:input.rowEmissionVersion,rowEmissionPolicies:structuredClone(input.rowEmissionPolicies),receiptRowCount:receiptRowKeys.length,receiptRowKeys,emissionDecisionCount:decisions.length,rowEmissions:decisions};
 require(new TextEncoder().encode(salarySerialized(result)).byteLength<=32*1024*1024,'ROW_EMISSION_RESULT_LIMIT','El resultado íntegro con auditoría supera la capacidad; no se omiten pruebas.');
 return result;
}
export function verifyOwnPayrollRowEmissionResult(rawInput,storedResult){
 // V5 is a new, frozen algorithm contract. Recompute its decisions and economic
 // result from the original input; self-reported hashes are insufficient.
 const expected=calculateOwnPayrollWithRowEmission(rawInput),stored=copyRowEmissionData(storedResult);
 require(salarySerialized(expected)===salarySerialized(stored),'ROW_EMISSION_RESULT_MISMATCH','La emisión o su auditoría no corresponde a la captura calculada completa.');
 return storedResult;
}
export function selectOwnPayrollReceiptRows(input,result){
 verifyOwnPayrollRowEmissionResult(input,result);
 require(result?.version===OWN_PAYROLL_EMISSION_RESULT_VERSION&&ownPayrollRowEmission(result),'ROW_EMISSION_VERSION_INVALID','La selección explícita requiere el resultadoV5 verificado.');
 const keys=new Set(result.receiptRowKeys);require(keys.size===result.receiptRowCount,'ROW_EMISSION_RESULT_MISMATCH','La selección de emisión tiene duplicados o perdió filas.');
 const rows=result.rows.filter(r=>keys.has(rowEmissionRowKey(r)));
 require(rows.length===keys.size&&rows.every(r=>r.nature!=='auxiliary'),'ROW_EMISSION_RESULT_MISMATCH','La emisión contiene identidades ajenas a los conceptos calculados.');
 return rows;
}
