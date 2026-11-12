// Entirely invented mappings, sources, identities and approvals for temporal
// QA. No historical V1 policy is extended or rewritten by production code.
import {temporalPolicySources,policyFixtureHash} from './own-payroll-policy-validity-synthetic.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,normalizeOfficialTotalsPolicy} from '../../assets/own-payroll-official-totals.js';
import {sealTemporalSources,temporalTestId} from './own-payroll-temporal-capture-synthetic.js';
import {prepareOwnPayrollFamilyTariffApprovedInput,prepareOwnPayrollOfficialApprovedInput,prepareOwnPayrollRowEmissionApprovedInput} from '../../lib/own-payroll-approved-input.js';
import {calculateOwnPayrollWithOfficialTotals} from '../../assets/own-payroll-official-totals.js';
import {calculateOwnPayrollWithRowEmission} from '../../assets/own-payroll-row-emission.js';

export function temporalOfficialPolicy({validFrom='2026-08',validUntil=null,agreementCode='1',policyId='qa-official-'+agreementCode+'-'+validFrom,supersedes=null,sourceReference='Invented complete totals policy with explicit validity for isolated QA',totalCodes=Object.fromEntries(['990','993','994','995','996','888','998','999'].map(code=>[code,'800000'+code])),contributions={'990':[],'993':['1','48'],'994':[],'995':['302','306'],'996':[]}}={}){
 return normalizeOfficialTotalsPolicy({version:OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION,policyId,supersedes,agreementCode,validFrom,validUntil,liquidationType:'monthly',totalCodes,contributions,rounding:{precision:2,mode:'half_up'},nonPositiveNet:'reject',sourceReference,sourceSha256:policyFixtureHash(['invented-official-policy-v2',policyId,validFrom,validUntil,agreementCode,totalCodes,contributions])});
}
export function temporalOfficialSources({period='2027-08',validFrom='2026-08',validUntil=null,emission=true,...options}={}){
 const source=temporalPolicySources({period,validFrom,validUntil,emission,...options}),program=source.programState.program.definition;
 program.officialTotalsVersion=OWN_PAYROLL_OFFICIAL_TOTALS_V2_VERSION;
 program.officialTotalsPolicies=[temporalOfficialPolicy({validFrom,validUntil})];
 source.programState.program.definition=ownProgramDefinition(program,source.programState.salaryCatalog.items);
 return sealTemporalSources(source);
}

export function officialValidityCapture(source=temporalOfficialSources(),number=1){
 const p=source.programState.program.definition;
 const prepare=p.familyTariffsVersion?prepareOwnPayrollFamilyTariffApprovedInput:p.rowEmissionVersion?prepareOwnPayrollRowEmissionApprovedInput:prepareOwnPayrollOfficialApprovedInput;
 const input=prepare(source),emission=input.version==='own-payroll-input.v5',result=emission?calculateOwnPayrollWithRowEmission(input):calculateOwnPayrollWithOfficialTotals(input);
 const sourceInventory={...(input.familyTariffCapture?{familyTariffs:structuredClone(input.familyTariffCapture)}:{}),...(emission?{rowEmission:{rulesSha256:input.sourceVersions.rules,policiesSha256:policyFixtureHash(input.rowEmissionPolicies),populationVersion:input.sourceVersions.population,expectedDecisionCount:result.emissionDecisionCount,contractIds:input.employees.map(e=>e.contractId).sort()}}:{})};
 const payload={...structuredClone(source),sourceInventory};
 const body={period:source.period,liquidationType:source.liquidationType,selection:structuredClone(source.selection),scopeVersion:source.programState.scopeVersion,programVersion:source.programState.program.version,populationDomain:'native_registered'};
 const id=temporalTestId(number),algorithmSha256=policyFixtureHash('invented-official-validity-algorithm'),createdAt=source.period+'-28T12:00:00.000Z';
 return{version:'own-payroll-run.v1',id,key:temporalTestId(number+1000),body,bodySha256:policyFixtureHash(body),algorithmSha256,payload,payloadSha256:policyFixtureHash(payload),createdAt,replayed:false,saved:{version:'own-payroll-saved.v1',id,algorithmSha256,inputSha256:policyFixtureHash(input),resultSha256:policyFixtureHash(result),input,result,recordedAt:createdAt}};
}
