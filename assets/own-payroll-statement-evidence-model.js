// Consistency check for a document built from already verified immutable closes.
// This is not an approval, a signature check, or a replacement payroll calculation.
import {salaryExact,salaryHash,salaryUuid,salarySerialized} from './native-salary-catalog-model.js';
import {decimal,rational,exactAdd,exactSubtract,exactCompare} from './own-payroll-exact.js';

const keys=['remuneration','non_remuneration','deduction','employer_contribution','gross','net'];
const labels=['Remunerativo','No remunerativo','Retenciones','Aportes patronales','Bruto','Neto'];
const need=(ok)=>{if(!ok)throw Error('La conciliación del informe no coincide con la evidencia del cierre.');};
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const amount=v=>typeof v==='string'&&/^-?(?:0|[1-9][0-9]{0,95})(?:\.[0-9]{1,8})?$/.test(v);
const equals=(a,b)=>exactCompare(a,b)===0;
const empty=()=>Object.fromEntries(keys.map(k=>[k,rational(0n)]));

export function checkOwnStatementEvidence(statement){
 const items=statement.originalEvidence;
 need(statement.version==='own-payroll-statement.v2'&&Array.isArray(items)&&items.length>0&&items.length<=250000&&Reflect.ownKeys(items).length===items.length+1);
 const totals=empty(),lines=empty(),seen=new Set();let officialCount=0;
 for(const item of items){
  need(salaryExact(item,['contractId','runId','sourceGroupId','sourceSha256','totals','lineTotals','totalReconciliation'])&&[item.contractId,item.runId,item.sourceGroupId].every(salaryUuid)&&salaryHash(item.sourceSha256));
  const id=item.sourceGroupId+':'+item.contractId;need(!seen.has(id));seen.add(id);
  for(const value of [item.totals,item.lineTotals])need(salaryExact(value,['contractId',...keys])&&value.contractId===item.contractId&&keys.every(k=>amount(value[k])));
  const r=item.totalReconciliation;
  if(r===null)need(same(item.totals,item.lineTotals));
  else{
   officialCount++;
   need(r?.contractId===item.contractId&&same(r.officialTotals,item.totals)&&same(r.originalLineTotals,item.lineTotals)&&r.sourceLineAmountsUnchanged===true&&r.reconciliationIsPayrollConcept===false);
   need(['netDifferenceFromLines','netAdjustmentOutsideGross','roundingDifferenceFromLines','displayedEquationRounding'].every(k=>amount(r[k])));
   need(equals(exactSubtract(decimal(item.totals.net),decimal(item.lineTotals.net)),decimal(r.netDifferenceFromLines)));
   need(equals(exactAdd(decimal(r.netAdjustmentOutsideGross),decimal(r.roundingDifferenceFromLines)),decimal(r.netDifferenceFromLines)));
   need(equals(exactAdd(exactSubtract(exactAdd(decimal(item.totals.gross),decimal(r.netAdjustmentOutsideGross)),decimal(item.totals.deduction)),decimal(r.displayedEquationRounding)),decimal(item.totals.net)));
   need(r.identities?.linesNetPlusAdjustmentPlusRoundingEqualsOfficialNet===true&&r.identities?.officialGrossPlusAdjustmentMinusDeductionPlusDisplayedRoundingEqualsOfficialNet===true);
  }
  for(const k of keys){totals[k]=exactAdd(totals[k],decimal(item.totals[k]));lines[k]=exactAdd(lines[k],decimal(item.lineTotals[k]));}
 }
 need(officialCount>0&&statement.reconciliation.length===6&&statement.totals.length===6);
 for(let i=0;i<keys.length;i++){
  const row=statement.reconciliation[i],key=keys[i];
  need(Array.isArray(row)&&row.length===4&&row[0]===labels[i]&&row.slice(1).every(amount)&&same(statement.totals[i],[row[0],row[1]]));
  need(equals(decimal(row[1]),totals[key])&&equals(decimal(row[2]),lines[key])&&equals(decimal(row[3]),exactSubtract(lines[key],totals[key])));
 }
 return statement;
}
