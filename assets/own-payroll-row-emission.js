// Explicit receipt emission. Economic rows, R/U references and V4 totals remain
// untouched. V1-V4 entrypoints never infer this policy from a zero amount.
import {normalizeOwnPayrollOfficialInput,calculateOwnPayrollWithOfficialTotals} from './own-payroll-official-totals.js';
import {decimal,rational,exactCompare,exactEvidence,payrollRequire as require} from './own-payroll-exact.js';
import {salarySerialized} from './native-salary-catalog-model.js';
import {payrollExpressionReference} from './own-payroll-expression.js';

export const OWN_PAYROLL_ROW_EMISSION_VERSION='own-payroll-row-emission.v1';
export const OWN_PAYROLL_EMISSION_INPUT_VERSION='own-payroll-input.v5';
export const OWN_PAYROLL_EMISSION_RESULT_VERSION='own-payroll-result.v5';
export const ownPayrollRowEmission=v=>v!==null&&typeof v==='object'&&Object.getOwnPropertyDescriptor(v,'rowEmissionVersion')?.value===OWN_PAYROLL_ROW_EMISSION_VERSION;
export const rowEmissionPolicyKey=p=>[p.agreementCode,p.period,p.liquidationType,p.conceptCode].join(':');
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
export function normalizeRowEmissionPolicies(raw){
 list(raw,1,2);
 const policies=raw.map(p=>{
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
 return policies;
}
export function validateRowEmissionContext(rules,phases,policies,officialPolicies){
 for(const policy of policies){
  const monetary=rules.filter(r=>active(r,policy)&&r.code===policy.conceptCode&&r.nature!=='auxiliary');
  require(monetary.length===1&&monetary[0].nature==='non_remuneration'&&monetary[0].unit==='money','ROW_EMISSION_RULE_REQUIRED','La política debe identificar un único concepto familiar vigente.');
  for(const condition of policy.conditions){
   const found=phases.filter(q=>active(q,policy)&&q.code===condition.quantityCode);
   require(found.length===1&&found[0].unit===condition.unit&&(condition.quantityCode==='1'||found[0].stage==='exact'),'ROW_EMISSION_QUANTITY_REQUIRED','La emisión necesita las fases capturadas originales, con unidades exactas.');
  }
  const official=officialPolicies.filter(p=>p.agreementCode===policy.agreementCode&&p.period===policy.period&&p.liquidationType===policy.liquidationType);
  require(official.length===1&&official[0].contributions['995'].includes(policy.conceptCode),'ROW_EMISSION_TOTAL_DESTINATION_REQUIRED','El concepto familiar debe conservar su aporte al acumulador995.');
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
 const policies=normalizeRowEmissionPolicies(raw.rowEmissionPolicies),base=normalizeOwnPayrollOfficialInput(rowEmissionBaseInput(raw));
 require(policies.every(p=>p.period===base.period&&p.liquidationType===base.liquidationType&&p.agreementCode===base.officialTotalsPolicy.agreementCode),'ROW_EMISSION_SCOPE_INVALID','La política no corresponde a la captura completa.');
 validateRowEmissionContext(base.rules,base.quantityPhases,policies,[base.officialTotalsPolicy]);
 const input={...base,version:OWN_PAYROLL_EMISSION_INPUT_VERSION,rowEmissionVersion:OWN_PAYROLL_ROW_EMISSION_VERSION,rowEmissionPolicies:policies};
 require(new TextEncoder().encode(salarySerialized(input)).byteLength<=8*1024*1024,'ROW_EMISSION_INPUT_LIMIT','La captura de emisión supera su límite íntegro; no se recorta.');
 return input;
}
export function rowEmissionBaseResult(result){
 const{rowEmissionVersion,rowEmissionPolicies,receiptRowCount,receiptRowKeys,emissionDecisionCount,rowEmissions,...base}=result;
 return{...base,version:'own-payroll-result.v4'};
}
export function calculateOwnPayrollWithRowEmission(raw){
 const input=normalizeOwnPayrollRowEmissionInput(raw),base=calculateOwnPayrollWithOfficialTotals(rowEmissionBaseInput(input));
 const rows=new Map(base.rows.map(r=>[rowEmissionRowKey(r),r])),quantities=new Map(base.quantities.map(q=>[q.contractId+':'+q.conceptCode,q])),omitted=new Set(),decisions=[];
 for(const employee of base.employeeTotals){
  for(const policy of input.rowEmissionPolicies){
   const key=employee.contractId+':concept:'+policy.conceptCode,row=rows.get(key);
   require(row&&row.agreementCode===policy.agreementCode,'ROW_EMISSION_ROW_REQUIRED','Falta una fila calculada del alcance; no se entrega un subconjunto.');
   const conditions=policy.conditions.map(c=>{
    const q=quantities.get(employee.contractId+':'+c.quantityCode);
    require(q&&q.unit===c.unit,'ROW_EMISSION_QUANTITY_REQUIRED','Falta la cantidad calculada que acredita la decisión.');
    const value=numeric(q.value);
    require(value.n>=0n&&(c.quantityCode==='1'||value.d===1n),'ROW_EMISSION_QUANTITY_INVALID','Una cantidad familiar negativa o fraccionaria no acredita ausencia de derecho.');
    return{...c,observed:exactEvidence(value),passed:exactCompare(value,decimal(c.value))>0,quantitySourceSha256:q.sourceSha256};
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
 const result={...base,version:OWN_PAYROLL_EMISSION_RESULT_VERSION,rowEmissionVersion:OWN_PAYROLL_ROW_EMISSION_VERSION,rowEmissionPolicies:structuredClone(input.rowEmissionPolicies),receiptRowCount:receiptRowKeys.length,receiptRowKeys,emissionDecisionCount:decisions.length,rowEmissions:decisions};
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
 require(result?.version===OWN_PAYROLL_EMISSION_RESULT_VERSION&&result.rowEmissionVersion===OWN_PAYROLL_ROW_EMISSION_VERSION,'ROW_EMISSION_VERSION_INVALID','La selección explícita requiere el resultadoV5 verificado.');
 const keys=new Set(result.receiptRowKeys);require(keys.size===result.receiptRowCount,'ROW_EMISSION_RESULT_MISMATCH','La selección de emisión tiene duplicados o perdió filas.');
 const rows=result.rows.filter(r=>keys.has(rowEmissionRowKey(r)));
 require(rows.length===keys.size&&rows.every(r=>r.nature!=='auxiliary'),'ROW_EMISSION_RESULT_MISMATCH','La emisión contiene identidades ajenas a los conceptos calculados.');
 return rows;
}
