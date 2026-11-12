import {createHash} from 'node:crypto';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {payrollRequire as require} from '../assets/own-payroll-exact.js';
import {OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_VERSION,OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_V2_VERSION,OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION,selectFamilyTariffPolicies,familyTariffInputKeys,normalizeFamilyTariffCapture} from '../assets/own-payroll-family-tariffs.js';
const hash=v=>createHash('sha256').update(salarySerialized(v),'utf8').digest('hex');

// Called only after the existing full family/population capture and hashes have
// passed the normal approved-input adapter. No new approval or fact producer.
export function captureOwnPayrollFamilyTariffSources({definition,familyFacts,population,employees,period,liquidationType}){
 const temporal=definition.familyTariffsVersion===OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION;
 const activeRules=definition.rules.filter(r=>r.validFrom<=period&&(r.validUntil===null||r.validUntil>=period)&&r.liquidationTypes.includes(liquidationType));
 const agreements=new Set(population.employees.map(e=>e.agreementCode));
 const sourceBindings=definition.bindings.filter(b=>b.sourceKind==='family_tariff'&&(!temporal||agreements.has(b.agreementCode)&&activeRules.some(r=>r.agreementCode===b.agreementCode&&familyTariffInputKeys(r.expression).includes(b.key))));
 const selectedAgreements=new Set(sourceBindings.map(b=>b.agreementCode));
 if(temporal)selectFamilyTariffPolicies(definition,period,liquidationType,[...selectedAgreements]);
 // Preserve the full captured scope's lineage, including its declared future
 // successors. The V2 normalizer derives effective intervals without edits.
 const policies=temporal?definition.familyTariffPolicies.filter(p=>selectedAgreements.has(p.agreementCode)&&p.liquidationType===liquidationType):definition.familyTariffPolicies;
 for(const policy of policies)require(hash(policy.rows)===policy.rowsSha256,'FAMILY_TARIFF_ROWS_CHANGED','La tabla completa difiere de su huella declarada.');
 const bindings=sourceBindings.map(({agreementCode,key,sourceCode})=>({agreementCode,key,sourceCode}));
 const sourceById=new Map(familyFacts.records.map(r=>[r.contractId.toLowerCase(),r]));
 const records=population.employees.filter(e=>bindings.some(b=>b.agreementCode===e.agreementCode)).map(e=>{
  const record=sourceById.get(e.contractId.toLowerCase());require(record?.revision>0&&record.definition!==null&&record.identityToken===e.identityToken,'FAMILY_TARIFF_FACT_SOURCE_REQUIRED','Falta la declaración familiar propia aprobada de un contrato del conjunto.');
  return{contractId:e.contractId,agreementCode:e.agreementCode,identityToken:e.identityToken,revision:record.revision,approvalId:record.approvalId,definitionSha256:hash(record.definition),regionCode:record.definition.tariffSelection.region,priorSemesterAverage:record.definition.tariffSelection.semesterAverage,asOfDate:record.definition.asOfDate};
 });
 return normalizeFamilyTariffCapture({version:temporal?OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_V2_VERSION:OWN_PAYROLL_FAMILY_TARIFF_CAPTURE_VERSION,...(temporal?{period,liquidationType}:{}),familyFactsVersion:familyFacts.version,policies,policySha256:hash(policies),bindings,records},employees,period,liquidationType);
}

export function verifyOwnPayrollFamilyTariffCaptureHashes(input){
 const capture=input.familyTariffCapture;require(hash(capture.policies)===capture.policySha256&&capture.policies.every(p=>hash(p.rows)===p.rowsSha256),'FAMILY_TARIFF_ROWS_CHANGED','La captura original no conserva las políticas y la tabla completas.');return input;
}
