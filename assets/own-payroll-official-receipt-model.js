// Explicit V4/V5 receipt reader. Economic rows and emission decisions remain
// immutable; only the frozen receipt selector controls the visible projection.
import {salaryExact,salaryHash,salarySerialized} from './native-salary-catalog-model.js';
import {ownOfficialEconomicEvidence,verifiedOwnOfficialEconomicSource} from './own-payroll-official-snapshot-model.js';
import {OWN_PAYROLL_NAMESPACE_VERSION} from './own-payroll-engine.js';
import {OWN_PAYROLL_ROW_EMISSION_V2_VERSION} from './own-payroll-row-emission.js';

const need=(condition,message)=>{if(!condition)throw Error(message);};
const same=(left,right)=>salarySerialized(left)===salarySerialized(right);
const baseKeys=['sourceGroupId','contractId','personId','registrationId','employeeNumber','name','dni','cuil','agreementCode','departmentCode','runId','liquidationVersion','precision','totals','concepts','namespaceVersion'];
const evidenceKeys=['inputVersion','resultVersion','inputSha256','resultSha256','payloadSha256','lineTotals','totalReconciliation','quantities','familyTariffDecisions','familyTariffRecord','sourceEvidence','economicRows','economicConcepts','economicConceptCount','rowEmissions','receiptRowKeys','omissionAudit','omittedRowCount'];
const rowKey=row=>(row.nature==='auxiliary'?'auxiliary:':'concept:')+(row.conceptCode??row.code);

export const hasOwnOfficialReceipt=record=>['own-payroll-input.v4','own-payroll-input.v5'].includes(record?.inputVersion);

export function ownOfficialReceiptRecord(record,validateLegacyRecord){
 need(hasOwnOfficialReceipt(record)&&salaryExact(record,[...baseKeys,...evidenceKeys])&&record.namespaceVersion===OWN_PAYROLL_NAMESPACE_VERSION,'No se verificó la versión explícita ni la evidencia económica del recibo.');
 need(record.resultVersion===record.inputVersion.replace('input','result')&&[record.inputSha256,record.resultSha256,record.payloadSha256].every(salaryHash),'No se verificaron las huellas originales del cálculo del recibo.');
 need(Array.isArray(record.economicConcepts)&&Array.isArray(record.economicRows)&&record.economicConceptCount===record.economicConcepts.length&&record.economicRows.length===record.economicConceptCount&&record.economicConceptCount<=250000,'Faltan renglones económicos de la copia conservada.');
 // Reuse the historical identity, label, decimal and line-total checks on a
 // local validation view. Neither the receipt nor any original is modified.
 const view=Object.fromEntries(baseKeys.map(key=>[key,record[key]]));
 view.concepts=record.economicConcepts;view.totals=record.lineTotals;
 validateLegacyRecord(view);
 need(record.sourceEvidence.runId===record.runId&&record.sourceEvidence.inputVersion===record.inputVersion&&record.sourceEvidence.resultVersion===record.resultVersion&&record.sourceEvidence.payloadSha256===record.payloadSha256&&record.sourceEvidence.inputSha256===record.inputSha256&&record.sourceEvidence.resultSha256===record.resultSha256,'La evidencia del recibo no corresponde al cálculo original conservado.');
 ownOfficialEconomicEvidence({contractId:record.contractId,rows:record.economicRows,totals:{contractId:record.contractId,...record.totals},lineTotals:{contractId:record.contractId,...record.lineTotals},totalReconciliation:record.totalReconciliation,quantities:record.quantities,familyTariffDecisions:record.familyTariffDecisions,familyTariffRecord:record.familyTariffRecord,rowEmissions:record.rowEmissions,receiptRowKeys:record.receiptRowKeys,sourceEvidence:record.sourceEvidence,precision:record.precision,inputVersion:record.inputVersion,resultVersion:record.resultVersion});
 const rows=new Map(record.economicRows.map(row=>[rowKey(row),row]));
 const labels=new Map(record.economicConcepts.map(concept=>[rowKey(concept),concept]));
 need(rows.size===record.economicRows.length&&labels.size===record.economicConcepts.length,'Hay un renglón económico duplicado en el recibo.');
 for(const concept of record.economicConcepts){
  const row=rows.get(rowKey(concept));
  need(row&&row.contractId===record.contractId&&row.conceptCode===concept.code&&row.nature===concept.nature&&row.unit===concept.unit&&row.amount===concept.amount&&concept.labelSourceSha256===record.payloadSha256,'Una etiqueta o un importe no corresponde al renglón económico original.');
 }
 const visible=record.economicConcepts.filter(concept=>concept.nature!=='auxiliary'&&record.receiptRowKeys.includes(record.contractId+':concept:'+concept.code));
 need(same(visible,record.concepts)&&visible.length===record.receiptRowKeys.length,'La impresión no coincide con el selector conservado del recibo.');
 const quantities=new Map(record.quantities.map(quantity=>[quantity.conceptCode,quantity]));
 const temporal=record.sourceEvidence.rowEmissionVersion===OWN_PAYROLL_ROW_EMISSION_V2_VERSION;
 const omissions=record.rowEmissions.filter(decision=>decision.decision==='omit').map(decision=>({decision,calculatedRow:rows.get('concept:'+decision.conceptCode),quantity:quantities.get(decision.conceptCode)??(temporal?null:undefined),labeledConcept:labels.get('concept:'+decision.conceptCode)}));
 need(Array.isArray(record.omissionAudit)&&Number.isSafeInteger(record.omittedRowCount)&&record.omittedRowCount>=0&&record.omittedRowCount===omissions.length&&same(record.omissionAudit,omissions),'Se alteró la auditoría de renglones omitidos de la impresión.');
 need(record.economicConceptCount===record.concepts.length+record.omittedRowCount+record.economicRows.filter(row=>row.nature==='auxiliary').length,'La impresión o su auditoría perdieron un renglón económico.');
 return record;
}

export async function verifiedOwnOfficialReceiptEvidence(value){
 value=structuredClone(value);
 const records=Array.isArray(value?.records)?value.records:Array.isArray(value?.items)?value.items.map(item=>item.record):[value];
 const seen=new Set();
 for(const record of records){
  if(!hasOwnOfficialReceipt(record))continue;
  const serialized=salarySerialized(record.sourceEvidence);
  if(seen.has(serialized))continue;
  await verifiedOwnOfficialEconomicSource(record.sourceEvidence);seen.add(serialized);
 }
 return value;
}
