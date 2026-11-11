import {prepareOwnPayrollNonapplicationPreviewInput} from './own-payroll-approved-input.js';
import {calculateOwnPayroll} from '../assets/own-payroll-engine.js';
import {calculateOwnPayrollWithQuantities} from '../assets/own-payroll-quantity.js';
import {calculateOwnPayrollWithOfficialTotals} from '../assets/own-payroll-official-totals.js';
import {freezeNonapplication,nonapplicationHash,NONAPPLICATION_CODES} from './own-payroll-nonapplication.js';
import {payrollRequire as require} from '../assets/own-payroll-exact.js';

/** Pure calculation preview, with a new envelope that existing run/receipt
 * commands do not accept. No absent concept is evaluated or emitted as zero. */
export function createOwnPayrollNonapplicationPreview(raw){
  const input=prepareOwnPayrollNonapplicationPreviewInput(raw),base=input.calculationInput;
  const result=base.version==='own-payroll-input.v4'?calculateOwnPayrollWithOfficialTotals(base):base.version==='own-payroll-input.v3'?calculateOwnPayrollWithQuantities(base):calculateOwnPayroll(base);
  require(result.rows.every(r=>r.agreementCode!=='1'||r.nature==='auxiliary'||!NONAPPLICATION_CODES.includes(r.conceptCode))&&(result.quantities??[]).every(q=>q.agreementCode!=='1'||!NONAPPLICATION_CODES.includes(q.conceptCode)),'NONAPPLICATION_RESULT_INVALID','Una no aplicación económica no puede producir renglón ni cantidad calculada del concepto omitido.');
  return freezeNonapplication({version:'own-payroll-nonapplication-preview.v1',inputSha256:nonapplicationHash(input),resultSha256:nonapplicationHash(result),input,result,nonApplicationDecisions:input.evidence.decisions,approved:false,registered:false,officialReceiptReady:false,payrollPosted:false,paymentExecuted:false});
}
