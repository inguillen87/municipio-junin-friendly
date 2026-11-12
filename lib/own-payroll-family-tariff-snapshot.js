import {createHash} from 'node:crypto';
import {salaryExact,salaryHash,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {payrollRequire as require} from '../assets/own-payroll-exact.js';
import {ownPayrollFamilyTariffs} from '../assets/own-payroll-family-tariffs.js';
import {normalizeOwnPayrollInput,calculateOwnPayroll} from '../assets/own-payroll-engine.js';
import {normalizeOwnPayrollQuantityInput,calculateOwnPayrollWithQuantities} from '../assets/own-payroll-quantity.js';
import {normalizeOwnPayrollOfficialInput,calculateOwnPayrollWithOfficialTotals} from '../assets/own-payroll-official-totals.js';
import {normalizeOwnPayrollRowEmissionInput,calculateOwnPayrollWithRowEmission,copyRowEmissionData} from '../assets/own-payroll-row-emission.js';
import {prepareOwnPayrollFamilyTariffApprovedInput} from './own-payroll-approved-input.js';
import {verifyOwnPayrollFamilyTariffCaptureHashes} from './own-payroll-family-tariff-source.js';
export const OWN_PAYROLL_FAMILY_TARIFF_SNAPSHOT_VERSION='own-payroll-family-tariff-snapshot.v1';
const hash=v=>createHash('sha256').update(salarySerialized(v),'utf8').digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const versions=new Map([
 ['own-payroll-input.v2',[normalizeOwnPayrollInput,calculateOwnPayroll]],
 ['own-payroll-input.v3',[normalizeOwnPayrollQuantityInput,calculateOwnPayrollWithQuantities]],
 ['own-payroll-input.v4',[normalizeOwnPayrollOfficialInput,calculateOwnPayrollWithOfficialTotals]],
 ['own-payroll-input.v5',[normalizeOwnPayrollRowEmissionInput,calculateOwnPayrollWithRowEmission]],
]);
export function createOwnPayrollFamilyTariffSnapshot(raw){
 const source=copyRowEmissionData(raw),pair=versions.get(source.version);require(pair&&ownPayrollFamilyTariffs(source),'FAMILY_TARIFF_VERSION_REQUIRED','La tarifa necesita su captura versionada explícita.');
 const input=verifyOwnPayrollFamilyTariffCaptureHashes(pair[0](source)),result=pair[1](input);
 require(Buffer.byteLength(salarySerialized(input),'utf8')<=8*1024*1024&&Buffer.byteLength(salarySerialized(result),'utf8')<=32*1024*1024,'FAMILY_TARIFF_SNAPSHOT_LIMIT','La captura y evidencia deben conservarse completas.');
 return freeze({version:OWN_PAYROLL_FAMILY_TARIFF_SNAPSHOT_VERSION,inputSha256:hash(input),resultSha256:hash(result),familyTariffCaptureSha256:hash(input.familyTariffCapture),familyTariffDecisionsSha256:hash(result.familyTariffDecisions),input,result,approved:false,payrollPosted:false,paymentExecuted:false});
}
export function prepareOwnPayrollFamilyTariffSnapshot(sources){return createOwnPayrollFamilyTariffSnapshot(prepareOwnPayrollFamilyTariffApprovedInput(sources));}
export function verifyOwnPayrollFamilyTariffSnapshot(raw){
 const s=copyRowEmissionData(raw);require(salaryExact(s,['version','inputSha256','resultSha256','familyTariffCaptureSha256','familyTariffDecisionsSha256','input','result','approved','payrollPosted','paymentExecuted'])&&s.version===OWN_PAYROLL_FAMILY_TARIFF_SNAPSHOT_VERSION&&[s.inputSha256,s.resultSha256,s.familyTariffCaptureSha256,s.familyTariffDecisionsSha256].every(salaryHash)&&s.approved===false&&s.payrollPosted===false&&s.paymentExecuted===false,'FAMILY_TARIFF_SNAPSHOT_INVALID','La copia conserva el contrato completo y sus estados de candidato.');
 const expected=createOwnPayrollFamilyTariffSnapshot(s.input);require(salarySerialized(expected)===salarySerialized(s),'FAMILY_TARIFF_SNAPSHOT_CHANGED','La selección de tarifa o su cálculo cambió respecto de la captura original.');return freeze(s);
}
