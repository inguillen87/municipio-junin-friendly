import {createHash} from 'node:crypto';
import {salaryExact,salaryHash,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {decimal,rational,exactAdd,exactSubtract,quantize,payrollRequire as require} from '../assets/own-payroll-exact.js';
import {ownProgramBootstrap} from '../assets/own-payroll-program-model.js';
import {normalizeOwnPayrollRowEmissionInput,calculateOwnPayrollWithRowEmission,verifyOwnPayrollRowEmissionResult,selectOwnPayrollReceiptRows,rowEmissionBaseResult,rowEmissionRowKey,copyRowEmissionData,OWN_PAYROLL_ROW_EMISSION_V2_VERSION} from '../assets/own-payroll-row-emission.js';
import {prepareOwnPayrollRowEmissionApprovedInput} from './own-payroll-approved-input.js';

export const OWN_PAYROLL_ROW_EMISSION_SNAPSHOT_VERSION='own-payroll-row-emission-snapshot.v1';
export const OWN_PAYROLL_ROW_EMISSION_RECEIPT_VERSION='own-payroll-row-emission-receipt-preview.v1';
const hash=v=>createHash('sha256').update(salarySerialized(v),'utf8').digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const totalKeys=['remuneration','non_remuneration','deduction','employer_contribution','gross','net'];

/** Pure candidate. No HTTP/SQL registration, municipal approval or PDF emission. */
export function createOwnPayrollRowEmissionSnapshot(rawInput){
 const input=normalizeOwnPayrollRowEmissionInput(rawInput),result=calculateOwnPayrollWithRowEmission(input);
 return freeze({version:OWN_PAYROLL_ROW_EMISSION_SNAPSHOT_VERSION,inputSha256:hash(input),resultSha256:hash(result),baseResultSha256:hash(rowEmissionBaseResult(result)),rowEmissionPolicySha256:hash(input.rowEmissionPolicies),input,result,approved:false,payrollPosted:false,paymentExecuted:false});
}
export function prepareOwnPayrollRowEmissionSnapshot(sources){
 return createOwnPayrollRowEmissionSnapshot(prepareOwnPayrollRowEmissionApprovedInput(sources));
}
function hashes(raw){
 const s=copyRowEmissionData(raw);
 require(salaryExact(s,['version','inputSha256','resultSha256','baseResultSha256','rowEmissionPolicySha256','input','result','approved','payrollPosted','paymentExecuted'])&&s.version===OWN_PAYROLL_ROW_EMISSION_SNAPSHOT_VERSION&&[s.inputSha256,s.resultSha256,s.baseResultSha256,s.rowEmissionPolicySha256].every(salaryHash)&&s.approved===false&&s.payrollPosted===false&&s.paymentExecuted===false,'ROW_EMISSION_SNAPSHOT_INVALID','La previa conserva su estado y las huellas originales completas.');
 const input=normalizeOwnPayrollRowEmissionInput(s.input);
 require(salarySerialized(input)===salarySerialized(s.input)&&hash(input)===s.inputSha256&&hash(s.result)===s.resultSha256&&hash(rowEmissionBaseResult(s.result))===s.baseResultSha256&&hash(input.rowEmissionPolicies)===s.rowEmissionPolicySha256,'ROW_EMISSION_SNAPSHOT_CHANGED','La captura, decisión de emisión o resultado perdió su huella original.');
 return s;
}
export function verifyOwnPayrollRowEmissionSnapshot(raw){
 const s=hashes(raw);verifyOwnPayrollRowEmissionResult(s.input,s.result);return freeze(s);
}

/** A V4-aware, single-contract receipt projection for review.
 * Source identities/labels, original line totals, official totals and the full
 * reconciliation remain separate. Omitted zero rows live in omissionAudit.
 * This is deliberately not an own-receipt-snapshot.v1/v2/v3 or approved PDF. */
export function projectOwnPayrollRowEmissionReceipt(rawSnapshot,rawProgramState,contractId){
 const s=hashes(rawSnapshot),state=copyRowEmissionData(rawProgramState);
 ownProgramBootstrap(state);
 require(hash({program:state.program,salary:state.salaryCatalog})===s.input.sourceVersions.rules,'ROW_EMISSION_LABEL_SOURCE_CHANGED','Las etiquetas deben provenir del catálogo congelado con el programa; no se reemplazan por el catálogo actual.');
 const visible=selectOwnPayrollReceiptRows(s.input,s.result).filter(r=>r.contractId===contractId);
 const employee=s.input.employees.find(e=>e.contractId===contractId),totals=s.result.employeeTotals.find(e=>e.contractId===contractId),lineTotals=s.result.lineEmployeeTotals.find(e=>e.contractId===contractId),reconciliation=s.result.totalReconciliations.find(e=>e.contractId===contractId);
 require(employee&&totals&&lineTotals&&reconciliation,'ROW_EMISSION_RECEIPT_SCOPE_INVALID','El contrato debe pertenecer a la población calculada y seleccionada completa.');
 const sums=Object.fromEntries(totalKeys.slice(0,4).map(k=>[k,rational(0n)]));
 for(const row of visible)if(Object.hasOwn(sums,row.nature))sums[row.nature]=exactAdd(sums[row.nature],decimal(row.amount));
 sums.gross=exactAdd(sums.remuneration,sums.non_remuneration);sums.net=exactSubtract(sums.gross,sums.deduction);
 require(totalKeys.every(k=>quantize(sums[k],{precision:s.input.totalsPrecision,mode:'exact'}).amount===lineTotals[k]),'ROW_EMISSION_RECEIPT_TOTAL_CHANGED','Las filas emitidas deben conservar exactamente los totales originales de renglones.');
 const labelSourceSha256=hash(state.salaryCatalog),quantities=new Map(s.result.quantities.filter(q=>q.contractId===contractId).map(q=>[q.conceptCode,q]));
 const concepts=visible.map(row=>{
  const labels=state.salaryCatalog.items.filter(d=>d.active&&d.kind==='concept'&&d.agreementCode===row.agreementCode&&d.code===row.conceptCode&&d.nature===row.nature&&d.validFrom<=s.input.period&&(d.validUntil===null||d.validUntil>=s.input.period));
  require(labels.length===1,'ROW_EMISSION_LABEL_SOURCE_INVALID','Cada concepto emitido necesita una etiqueta única del catálogo congelado.');
  return{code:row.conceptCode,label:labels[0].label,nature:row.nature,unit:row.unit,amount:row.amount,exactValue:structuredClone(row.exactValue),quantity:structuredClone(quantities.get(row.conceptCode)??null),labelSourceSha256};
 });
 const rows=new Map(s.result.rows.filter(r=>r.contractId===contractId).map(r=>[rowEmissionRowKey(r),r]));
 const temporal=s.input.rowEmissionVersion===OWN_PAYROLL_ROW_EMISSION_V2_VERSION;
 const omissionAudit=s.result.rowEmissions.filter(d=>d.contractId===contractId&&d.decision==='omit').map(d=>({decision:structuredClone(d),calculatedRow:structuredClone(rows.get(d.rowKey)),quantity:structuredClone(quantities.get(d.conceptCode)??(temporal?null:undefined))}));
 return freeze({version:OWN_PAYROLL_ROW_EMISSION_RECEIPT_VERSION,period:s.input.period,liquidationType:s.input.liquidationType,contractId,employeeNumber:employee.employeeNumber,agreementCode:employee.agreementCode,departmentCode:employee.departmentCode,inputSha256:s.inputSha256,resultSha256:s.resultSha256,baseResultSha256:s.baseResultSha256,rowEmissionPolicySha256:s.rowEmissionPolicySha256,labelSourceSha256,conceptCount:concepts.length,concepts,omittedRowCount:omissionAudit.length,omissionAudit,economicRowCount:rows.size,totals:structuredClone(totals),lineTotals:structuredClone(lineTotals),totalReconciliation:structuredClone(reconciliation),economicTotalsUnchanged:true,officialReceiptReady:false,approved:false,payrollPosted:false,paymentExecuted:false});
}
