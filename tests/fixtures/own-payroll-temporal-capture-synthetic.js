// All authorities, identities, tables and monetary values here are invented QA
// data. No municipal approval or future municipal amount is asserted.
import {temporalPolicySources,temporalTariffPolicy,temporalEmissionPolicies,policyFixtureHash as hash} from './own-payroll-policy-validity-synthetic.js';
import {sealFamilySources} from './own-payroll-family-consumer-synthetic.js';
import {ownProgramDefinition} from '../../assets/own-payroll-program-model.js';
import {prepareOwnPayrollFamilyTariffApprovedInput} from '../../lib/own-payroll-approved-input.js';
import {calculateOwnPayrollWithRowEmission} from '../../assets/own-payroll-row-emission.js';

export const TEMPORAL_TEST_PERIODS=Array.from({length:29},(_,i)=>{
 const month=2026*12+7+i;return Math.floor(month/12)+'-'+String(month%12+1).padStart(2,'0');
});
export const temporalTestId=n=>'82000000-0000-4000-8000-'+String(n).padStart(12,'0');
export const temporalHash=hash;

export function sealTemporalSources(source){
 const catalog=source.programState.salaryCatalog,program=source.programState.program;
 program.definition=ownProgramDefinition(program.definition,catalog.items);
 catalog.version=hash(['wholly-invented-catalog',catalog.items]);
 program.salaryVersion=catalog.version;
 program.version=hash(['wholly-invented-program',program.definition,catalog.version]);
 return sealFamilySources(source);
}

export function multiPeriodTemporalSources(period='2028-02'){
 const source=temporalPolicySources({period,validFrom:'2026-08',validUntil:'2028-12'});
 const p=source.programState.program.definition,official=p.officialTotalsPolicies[0];
 p.officialTotalsPolicies=TEMPORAL_TEST_PERIODS.map(month=>({...structuredClone(official),period:month,sourceSha256:hash(['invented-official-month',month])}));
 p.familyTariffPolicies=[
  temporalTariffPolicy({validFrom:'2026-08',validUntil:'2026-12',rate:'7.00'}),
  temporalTariffPolicy({validFrom:'2027-01',validUntil:'2027-12',rate:'9.00'}),
  temporalTariffPolicy({validFrom:'2028-01',validUntil:'2028-12',rate:'11.00'}),
 ];
 p.rowEmissionPolicies=temporalEmissionPolicies({validFrom:'2026-08',validUntil:'2028-12'});
 return sealTemporalSources(source);
}

export function successiveTemporalSources(period='2028-02',{includeSuccessor=true}={}){
 const source=temporalPolicySources({period,validFrom:'2027-08',validUntil:null});
 const p=source.programState.program.definition,official=p.officialTotalsPolicies[0];
 p.officialTotalsPolicies=['2027-08','2027-12','2028-01','2028-02','2028-12','2032-02'].map(month=>({...structuredClone(official),period:month,sourceSha256:hash(['invented-succession-official',month])}));
 if(includeSuccessor){
  const tariff=p.familyTariffPolicies[0];
  p.familyTariffPolicies.push(temporalTariffPolicy({validFrom:'2028-01',validUntil:null,rate:'9.00',supersedes:{policyId:tariff.policyId,policySha256:hash(tariff)}}));
  const next=temporalEmissionPolicies({validFrom:'2028-01',validUntil:null});
  for(const policy of next){const prior=p.rowEmissionPolicies.find(x=>x.conceptCode===policy.conceptCode);policy.supersedes={policyId:prior.policyId,policySha256:hash(prior)};}
  p.rowEmissionPolicies.push(...next);
 }
 return sealTemporalSources(source);
}

export function temporalCrossQuantitySources(){
 const source=temporalPolicySources({period:'2028-08',days:'14'}),p=source.programState.program.definition;
 p.quantityPhases=p.quantityPhases.filter(q=>q.code!=='302');
 p.rowEmissionPolicies.find(p=>p.conceptCode==='302').conditions.splice(1);
 const rename=value=>Array.isArray(value)?value.map(rename):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rename(v)])):value==='302'?'740':value;
 return sealTemporalSources(rename(source));
}

export function temporalCapture(source=multiPeriodTemporalSources(),number=1){
 const input=prepareOwnPayrollFamilyTariffApprovedInput(source),result=calculateOwnPayrollWithRowEmission(input);
 const inventory={familyTariffs:structuredClone(input.familyTariffCapture),rowEmission:{
  rulesSha256:input.sourceVersions.rules,policiesSha256:hash(input.rowEmissionPolicies),
  populationVersion:input.sourceVersions.population,expectedDecisionCount:result.emissionDecisionCount,
  contractIds:input.employees.map(e=>e.contractId).sort(),
 }};
 const payload={...structuredClone(source),sourceInventory:inventory};
 const body={period:source.period,liquidationType:source.liquidationType,selection:structuredClone(source.selection),scopeVersion:source.programState.scopeVersion,programVersion:source.programState.program.version,populationDomain:'native_registered'};
 const id=temporalTestId(number),algorithmSha256=hash('invented-temporal-algorithm'),createdAt=source.period+'-28T12:00:00.000Z';
 return{version:'own-payroll-run.v1',id,key:temporalTestId(number+1000),body,bodySha256:hash(body),algorithmSha256,payload,payloadSha256:hash(payload),createdAt,replayed:false,saved:{version:'own-payroll-saved.v1',id,algorithmSha256,inputSha256:hash(input),resultSha256:hash(result),input,result,recordedAt:createdAt}};
}

export function temporalCloseDetail(capture){
 const input=capture.saved.input,result=capture.saved.result;
 return{version:'own-close-detail.v2',period:capture.body.period,liquidationType:capture.body.liquidationType,scopeVersion:capture.body.scopeVersion,stateVersion:hash('invented-close-state'),populationDomain:'native_registered',rosterVersion:hash('invented-roster'),rows:input.employees.map(e=>({contractId:e.contractId,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,state:'confirmed',runId:capture.id,resultSha256:capture.saved.resultSha256,liquidationVersion:1,groupId:null,canClose:true})),captures:[structuredClone(capture)],groups:[],canWrite:true,complete:true};
}

export function temporalReceiptEvidence(capture,closed){
 const i=capture.saved.input,r=capture.saved.result,e=closed.employees[0],sourceEvidence=closed.sources[0],cid=e.contractId;
 const economicRows=r.rows.filter(x=>x.contractId===cid),economicConcepts=economicRows.map(row=>({code:row.conceptCode,label:'Invented preserved label '+row.conceptCode,nature:row.nature,unit:row.unit,amount:row.amount,labelSourceSha256:capture.payloadSha256}));
 const withoutContract=totals=>Object.fromEntries(Object.entries(totals).filter(([key])=>key!=='contractId'));
 const base={sourceGroupId:temporalTestId(9901),contractId:cid,personId:temporalTestId(9902),registrationId:temporalTestId(9903),employeeNumber:e.employeeNumber,name:'Invented payroll employee',dni:'99000123',cuil:'20990001234',agreementCode:e.agreementCode,departmentCode:e.departmentCode,runId:capture.id,liquidationVersion:e.liquidationVersion,precision:e.precision,totals:withoutContract(e.totals),concepts:economicConcepts,namespaceVersion:i.namespaceVersion};
 const quantityByCode=new Map(e.quantities.map(q=>[q.conceptCode,q])),temporal=i.rowEmissionVersion==='own-payroll-row-emission.v2';
 const omissionAudit=e.rowEmissions.filter(d=>d.decision==='omit').map(decision=>({decision,calculatedRow:economicRows.find(row=>row.nature!=='auxiliary'&&row.conceptCode===decision.conceptCode),quantity:quantityByCode.get(decision.conceptCode)??(temporal?null:undefined),labeledConcept:economicConcepts.find(row=>row.nature!=='auxiliary'&&row.code===decision.conceptCode)}));
 const record={...base,concepts:economicConcepts.filter(row=>row.nature!=='auxiliary'&&e.receiptRowKeys.includes(cid+':concept:'+row.code)),inputVersion:i.version,resultVersion:r.version,inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,payloadSha256:capture.payloadSha256,lineTotals:withoutContract(e.lineTotals),totalReconciliation:e.totalReconciliation,quantities:e.quantities,familyTariffDecisions:e.familyTariffDecisions,familyTariffRecord:e.familyTariffRecord,sourceEvidence,economicRows,economicConcepts,economicConceptCount:economicConcepts.length,rowEmissions:e.rowEmissions,receiptRowKeys:e.receiptRowKeys,omissionAudit,omittedRowCount:omissionAudit.length};
 return{base,record};
}
