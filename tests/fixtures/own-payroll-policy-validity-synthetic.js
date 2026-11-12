// Entirely invented tariffs, scopes, source hashes and approval identifiers.
// Starts from the synthetic emission fixture, never from the R9 tariff tables.
import {createHash} from 'node:crypto';
import {emissionSources} from './own-payroll-row-emission-synthetic.js';
import {sealFamilySources} from './own-payroll-family-consumer-synthetic.js';
import {salaryItems,salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION,normalizeFamilyTariffPolicy} from '../../assets/own-payroll-family-tariffs.js';
import {OWN_PAYROLL_ROW_EMISSION_V2_VERSION,normalizeRowEmissionPolicies} from '../../assets/own-payroll-row-emission.js';

export const policyFixtureHash=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
export function temporalTariffPolicy({validFrom='2027-08',validUntil='2027-12',agreementCode='1',rate='7.00',policyId='qa-tariff-'+agreementCode+'-'+validFrom,supersedes=null}={}){
 const sourceSha256=policyFixtureHash(['invented-policy-fixture',validFrom,validUntil,agreementCode,rate]);
 const rows=['3','8'].map(typeCode=>({regionCode:'1',typeCode,upperBound:'999999.00',amount:rate,sourceSha256}));
 return normalizeFamilyTariffPolicy({version:OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION,policyId,supersedes,agreementCode,validFrom,validUntil,liquidationType:'monthly',selection:'first_upper_bound_inclusive',outsideRange:'error',mappings:[{sourceCode:'82',conceptCode:'302',typeCode:'3'},{sourceCode:'87',conceptCode:'306',typeCode:'8'}].map(m=>({...m,sourceReference:'Wholly invented mapping for multi-period QA',sourceSha256})),rows,rowsSha256:policyFixtureHash(rows),sourceReference:'Wholly invented amount table for multi-period QA',sourceSha256});
}
export function temporalEmissionPolicies({validFrom='2027-08',validUntil='2027-12',agreementCode='1'}={}){
 const sourceSha256=policyFixtureHash(['invented-emission-fixture',validFrom,validUntil,agreementCode]);
 return normalizeRowEmissionPolicies(['302','306'].map(conceptCode=>({version:OWN_PAYROLL_ROW_EMISSION_V2_VERSION,policyId:'qa-emission-'+agreementCode+'-'+conceptCode+'-'+validFrom,supersedes:null,agreementCode,validFrom,validUntil,liquidationType:'monthly',conceptCode,conditions:[{quantityCode:'1',unit:'days',stage:'exact',valueDomain:'nonnegative',operator:'gt',value:'14'},{quantityCode:conceptCode,unit:'units',stage:'exact',valueDomain:'nonnegative_integer',operator:'gt',value:'0'}],whenFalse:'omit_receipt_row',nonzeroAction:'error',sourceReference:'Invented emission decision; no municipal authority',sourceSha256})),OWN_PAYROLL_ROW_EMISSION_V2_VERSION);
}
export function temporalPolicySources({period='2027-08',validFrom=period,validUntil=period,rate='7.00',days='30',children='1',primary='1',tariffs=true,emission=true}={}){
 const source=emissionSources({optIn:false,days,children,primary}),program=source.programState.program.definition;
 source.period=period;source.monthly={complete:true,batches:[],nativeBatches:[]};
 for(const channel of ['list','export'])source.fixed[channel].data.periodMonth=period+'-01';
 for(const rule of program.rules){rule.validFrom=validFrom;rule.validUntil=validUntil;}
 for(const phase of program.quantityPhases){phase.validFrom=validFrom;phase.validUntil=validUntil;}
 for(const policy of program.officialTotalsPolicies){policy.period=period;policy.sourceReference='Invented complete monthly totals declaration for QA';policy.sourceSha256=policyFixtureHash(['invented-official',period]);}
 source.programState.salaryCatalog.items=salaryItems(source.programState.salaryCatalog.items.map(item=>({...item,validFrom,validUntil})));
 if(tariffs){
  program.familyTariffsVersion=OWN_PAYROLL_FAMILY_TARIFFS_V3_VERSION;
  program.familyTariffPolicies=[temporalTariffPolicy({validFrom,validUntil,rate})];
  for(const binding of program.bindings)if(binding.key.startsWith('syntheticTariff')){
   binding.sourceKind='family_tariff';binding.sourceCode=binding.key.endsWith('302')?'82':'87';
   binding.ruleReference='Invented versioned tariff input for QA';
  }
 }
 if(emission){program.rowEmissionVersion=OWN_PAYROLL_ROW_EMISSION_V2_VERSION;program.rowEmissionPolicies=temporalEmissionPolicies({validFrom,validUntil});}
 for(const record of source.familyPayrollFacts.records){
  record.definition.asOfDate=period+'-01';record.definition.tariffSelection={region:'1',semesterAverage:'0.00'};
 }
 source.programState.program.definition=ownProgramDefinition(program,source.programState.salaryCatalog.items);
 return sealFamilySources(source);
}
