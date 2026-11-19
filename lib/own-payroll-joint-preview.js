import {prepareOwnPayrollJointPreviewInput,OWN_PAYROLL_JOINT_PREVIEW_INPUT_VERSION} from './own-payroll-approved-input.js';
import {createOwnPayrollFamilyTariffSnapshot} from './own-payroll-family-tariff-snapshot.js';
import {freezeNonapplication,nonapplicationCopy,nonapplicationHash,ownPayrollNonapplicationPolicyContext} from './own-payroll-nonapplication.js';
import {salaryExact,salaryHash,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {payrollRequire as require} from '../assets/own-payroll-exact.js';

export const OWN_PAYROLL_JOINT_PREVIEW_VERSION='own-payroll-joint-preview.v1';

/** Pure QA composition. Reuses the tariff snapshot's validation and V5 engine;
 * it adds no payroll formula, no tariff selection branch and no receipt PDF.
 * The economic absence decisions and receipt-only omissions remain distinct. */
export function createOwnPayrollJointPreview(raw){
  const input=prepareOwnPayrollJointPreviewInput(raw),context=ownPayrollNonapplicationPolicyContext(input.policy);
  const snapshot=createOwnPayrollFamilyTariffSnapshot(input.calculationInput),result=snapshot.result;
  require(input.calculationInput.version==='own-payroll-input.v5'&&result.version==='own-payroll-result.v5','JOINT_PREVIEW_RESULT_INVALID','La previa conjunta debe conservar la versión explícita de emisión y sus tarifas.');
  require(result.rows.every(r=>r.agreementCode!==context.agreementCode||r.nature==='auxiliary'||!context.targetCodes.includes(r.conceptCode))&&(result.quantities??[]).every(q=>q.agreementCode!==context.agreementCode||!context.targetCodes.includes(q.conceptCode)),'NONAPPLICATION_RESULT_INVALID','Una no aplicación económica no puede producir renglón ni cantidad del concepto excluido.');
  const calculationEvidence={version:snapshot.version,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,familyTariffCaptureSha256:snapshot.familyTariffCaptureSha256,familyTariffDecisionsSha256:snapshot.familyTariffDecisionsSha256};
  require(snapshot.inputSha256===input.calculationInputSha256,'JOINT_PREVIEW_CAPTURE_CHANGED','La validación de tarifas no puede cambiar la entrada de cálculo preparada.');
  const receiptSelection={version:'own-payroll-joint-receipt-selection.v1',receiptRowCount:result.receiptRowCount,receiptRowKeys:structuredClone(result.receiptRowKeys),omittedRowCount:result.rowEmissions.filter(r=>r.decision==='omit').length,omissionAudit:structuredClone(result.rowEmissions.filter(r=>r.decision==='omit')),officialReceiptReady:false};
  const preview={version:OWN_PAYROLL_JOINT_PREVIEW_VERSION,inputSha256:nonapplicationHash(input),resultSha256:nonapplicationHash(result),input,result,calculationEvidence,nonApplicationDecisions:input.evidence.decisions,receiptSelection,approved:false,registered:false,officialReceiptReady:false,payrollPosted:false,paymentExecuted:false};
  require(Buffer.byteLength(salarySerialized(preview),'utf8')<=64*1024*1024,'JOINT_PREVIEW_LIMIT','La previa y su auditoría deben conservarse completas.');
  return freezeNonapplication(preview);
}

/** Replay from the frozen original request. Self-reported hashes, current
 * catalogue reads or independently supplied absence/tariff decisions cannot
 * substitute any of the captured policies, identities or complete sources. */
export function verifyOwnPayrollJointPreview(raw){
  const preview=nonapplicationCopy(raw);
  require(salaryExact(preview,['version','inputSha256','resultSha256','input','result','calculationEvidence','nonApplicationDecisions','receiptSelection','approved','registered','officialReceiptReady','payrollPosted','paymentExecuted'])&&preview.version===OWN_PAYROLL_JOINT_PREVIEW_VERSION&&preview.input?.version===OWN_PAYROLL_JOINT_PREVIEW_INPUT_VERSION&&[preview.inputSha256,preview.resultSha256].every(salaryHash)&&preview.approved===false&&preview.registered===false&&preview.officialReceiptReady===false&&preview.payrollPosted===false&&preview.paymentExecuted===false,'JOINT_PREVIEW_INVALID','La copia conserva el contrato completo de previa y todos sus estados no operativos.');
  require(preview.inputSha256===nonapplicationHash(preview.input)&&preview.resultSha256===nonapplicationHash(preview.result),'JOINT_PREVIEW_CHANGED','La captura o resultado perdió su huella.');
  const expected=createOwnPayrollJointPreview(preview.input.request);
  require(salarySerialized(expected)===salarySerialized(preview),'JOINT_PREVIEW_CHANGED','La previa no coincide con la reproducción de sus fuentes originales completas.');
  return freezeNonapplication(preview);
}
