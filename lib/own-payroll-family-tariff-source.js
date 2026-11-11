import {createHash} from 'node:crypto';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {payrollRequire as require} from '../assets/own-payroll-exact.js';
import {OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_VERSION,normalizeFamilyTariffCapture} from '../assets/own-payroll-family-tariffs.js';
const hash=v=>createHash('sha256').update(salarySerialized(v),'utf8').digest('hex');

// Called only after the existing full family/population capture and hashes have
// passed the normal approved-input adapter. No new approval or fact producer.
export function captureOwnPayrollFamilyTariffSources({definition,familyFacts,population,employees,period,liquidationType}){
 const policies=definition.familyTariffPolicies;
 for(const policy of policies)require(hash(policy.rows)===policy.rowsSha256,'FAMILY_TARIFF_ROWS_CHANGED','La tabla completa difiere de su huella declarada.');
 const bindings=definition.bindings.filter(b=>b.sourceKind==='family_tariff').map(({agreementCode,key,sourceCode})=>({agreementCode,key,sourceCode}));
 const sourceById=new Map(familyFacts.records.map(r=>[r.contractId.toLowerCase(),r]));
 const records=population.employees.filter(e=>bindings.some(b=>b.agreementCode===e.agreementCode)).map(e=>{
  const record=sourceById.get(e.contractId.toLowerCase());require(record?.revision>0&&record.definition!==null&&record.identityToken===e.identityToken,'FAMILY_TARIFF_FACT_SOURCE_REQUIRED','Falta la declaración familiar propia aprobada de un contrato del conjunto.');
  return{contractId:e.contractId,agreementCode:e.agreementCode,identityToken:e.identityToken,revision:record.revision,approvalId:record.approvalId,definitionSha256:hash(record.definition),regionCode:record.definition.tariffSelection.region,priorSemesterAverage:record.definition.tariffSelection.semesterAverage,asOfDate:record.definition.asOfDate};
 });
 return normalizeFamilyTariffCapture({version:OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_VERSION,familyFactsVersion:familyFacts.version,policies,policySha256:hash(policies),bindings,records},employees,period,liquidationType);
}

export function verifyOwnPayrollFamilyTariffCaptureHashes(input){
 const capture=input.familyTariffCapture;require(hash(capture.policies)===capture.policySha256&&capture.policies.every(p=>hash(p.rows)===p.rowsSha256),'FAMILY_TARIFF_ROWS_CHANGED','La captura original no conserva las políticas y la tabla completas.');return input;
}
