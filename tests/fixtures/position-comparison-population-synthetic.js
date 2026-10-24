// Synthetic calculation sources, independent approvals and close receipts.
// This fixture does not execute SQL, infer positions from payroll codes or
// certify municipal authority. No stored population version is replaced.
import {comparisonFixture} from './position-comparison-synthetic.js';
import {syntheticCapture} from './own-monthly-days-capture-synthetic.js';
import {periodContextCaptureFixture,periodContextSources,sealPeriodContextSources} from './own-payroll-period-context-synthetic.js';
import {conditionReportFixture} from './own-payroll-conditions-report-synthetic.js';
import {saved} from './own-payroll-run-synthetic.js';
import {row} from './native-salary-synthetic.js';
import {rule,policy} from './own-payroll-synthetic.js';
import {uid} from './own-payroll-program-synthetic.js';
import {reportGroup} from './own-payroll-report-synthetic.js';
import {participationRuleKey} from '../../assets/own-period-participation-program.js';
import {ownCloseDetail,ownCloseReceipt,ownCloseSnapshot} from '../../assets/own-payroll-close-model.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';

export const POPULATION_PROOF_SOURCE_KEYS=Object.freeze(['employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions','periodContext','monthlyDays','monthlyDaysScope','monthlyDayDeclarations']);

// Exact forms already authored in own-payroll-period-context-input.test.js:
// context plus all five180 sources, including meaningful interior nulls.
function allContextCapture(count){
 const s=periodContextSources('2026-10',count),p=s.programState.program.definition,date=s.period+'-01';
 Object.assign(p,{employmentFactsVersion:'own-salary-seniority.v1',workingTimeVersion:'own-contract-working-time.v1',agreementWorkingTimeVersion:'own-agreement-working-time.v1',salaryConditionsVersion:'own-contract-salary-conditions.v1'});
 for(const [code,key,sourceKind,sourceField,unit]of [['991','years','employment_fact','seniorityYears','units'],['992','contractHours','working_time_fact','monthlyHours','hours'],['993','agreementHours','agreement_time_fact','monthlyHours','hours'],['994','partialYears','salary_condition_fact','partialSeniorityYears','units']]){
  s.programState.salaryCatalog.items.push(row({kind:'auxiliary',code,nature:'auxiliary',unit}));
  p.rules.push(rule(code,{op:'input',key,unit},{nature:'auxiliary',unit,rounding:policy('exact',8)}));
  p.bindings.push({agreementCode:'1',key,unit,sourceKind,sourceField,combine:'single',onMissing:'error',ruleReference:'Fuente independiente ficticia QA'});
 }
 const configuration=(e,i,definition)=>({version:'a'.repeat(64),revision:1,proposalId:uid(500+i),approvalId:uid(600+i),identityToken:e.identityToken,definition});
 s.employmentFacts={complete:true,version:'a'.repeat(64),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,configuration:configuration(e,i,{years:'8',months:null,asOfDate:date,documentReference:'Antigüedad exclusivamente ficticia QA'})}))};
 s.workingTime={complete:true,version:'a'.repeat(64),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,configuration:configuration(e,i,{dailyHours:null,monthlyHours:'80.125',asOfDate:date,documentReference:'Jornada exclusivamente ficticia QA'})}))};
 s.agreementWorkingTime={complete:true,version:'a'.repeat(64),records:[{agreementCode:'1',agreementToken:'b'.repeat(64),revision:1,definition:{monthlyHours:'160.250',asOfDate:date,documentReference:'Convenio exclusivamente ficticio QA'},approvalId:uid(900),approvedAgreementToken:'b'.repeat(64)}]};
 s.salaryConditions={complete:true,version:'a'.repeat(64),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,revision:1,approvalId:uid(700+i),definition:{partialSeniorityYears:'0',title:{status:'not_reported',code:null,percentage:null},unhealthyWork:null,asOfDate:date,documentReference:'Condiciones exclusivamente ficticias QA'}}))};
 p.periodParticipation={version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:p.rules.map(r=>({ruleKey:participationRuleKey(r),treatment:'declared_formula',reference:'Tratamiento exclusivamente ficticio QA'}))};
 s.periodParticipation={complete:true,version:'a'.repeat(64),records:s.population.employees.map(e=>({contractId:e.contractId,identityToken:e.identityToken,fullPeriod:true,configuration:{version:'a'.repeat(64),revision:0,definition:null,proposalId:null,approvalId:null,identityToken:null,sourceVersion:null}}))};
 for(const [key,version]of [['employmentFacts',p.employmentFactsVersion],['periodParticipation',p.periodParticipation.version],['workingTime',p.workingTimeVersion],['agreementWorkingTime',p.agreementWorkingTimeVersion],['salaryConditions',p.salaryConditionsVersion]])s[key].version=ownRunHash([version,s.period,s[key].records]);
 sealPeriodContextSources(s);
 const c=periodContextCaptureFixture('2026-10','2026-10-31');
 c.payload={...s,sourceInventory:c.payload.sourceInventory};c.payloadSha256=ownRunHash(c.payload);c.saved=saved(c);return c;
}

function calculationCapture(source,days,count){
 if(source==='sql192'||source==='sql193'){
  if(count!==1)throw Error('La fixture mensual existente contiene un contrato; no se replica ni reseña su población.');
  return syntheticCapture(source,{days:source==='sql192'?'30':days,saved:true,forcedFixed:false});
 }
 if(source==='context'){
  if(count!==1)throw Error('La captura simple de contexto conserva su población original de un contrato.');
  return periodContextCaptureFixture('2026-10','2026-10-31');
 }
 if(source==='conditions')return structuredClone(conditionReportFixture(count).captures[0]);
 if(source==='context-all')return allContextCapture(count);
 throw Error('Fuente sintética M10 no admitida.');
}

function closeOriginal(c){
 const detail={version:'own-close-detail.v2',period:c.body.period,liquidationType:c.body.liquidationType,scopeVersion:c.body.scopeVersion,stateVersion:ownRunHash('M10 synthetic independent close'),populationDomain:'native_registered',rosterVersion:c.payload.population.version,
  rows:c.saved.input.employees.map(e=>({contractId:e.contractId,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,state:'confirmed',runId:c.id,resultSha256:c.saved.resultSha256,liquidationVersion:1,groupId:null,canClose:true})),captures:[structuredClone(c)],groups:[],canWrite:true,complete:true};
 ownCloseDetail(detail);
 const body={period:detail.period,liquidationType:detail.liquidationType,scopeVersion:detail.scopeVersion,stateVersion:detail.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason:'Cierre exclusivamente sintético para comparación de población M10',reviewConfirmed:true};
 const snapshot=ownCloseSnapshot(detail,body.selection),receipt={version:'own-close-receipt.v1',id:uid(810),key:uid(811),body,bodySha256:ownRunHash(body),groupId:uid(810),snapshot,snapshotSha256:ownRunHash(snapshot),recordedAt:'2026-10-18T12:01:00.000Z',replayed:false};
 detail.groups=[reportGroup(receipt)];for(const e of detail.rows)Object.assign(e,{state:'closed',groupId:receipt.groupId,canClose:false});ownCloseDetail(detail);ownCloseReceipt(receipt);
 return {detail,receipt};
}

// Future browser callers can choose conditions/context-all with count>25.
// The comparison DTO stays exact; original capture/close are separate evidence.
export async function comparisonPopulationFixture({source='sql192',days='16',count=1,assigned=true}={}){
 if(!Number.isInteger(count)||count<1||count>100||!['16','30'].includes(days)||typeof assigned!=='boolean')throw Error('Alcance sintético M10 inválido.');
 const originalCapture=calculationCapture(source,days,count),closed=closeOriginal(originalCapture),people=originalCapture.payload.population.employees;
 const comparison=await comparisonFixture(people.length),prior=comparison.captures[0],positions=structuredClone(prior.positions),dimensions=structuredClone(prior.dimensions);
 Object.assign(positions,{captureId:originalCapture.id,capturePayloadSha256:originalCapture.payloadSha256,period:originalCapture.body.period,liquidationType:originalCapture.body.liquidationType});
 if(assigned){
  positions.payload.populationVersion=originalCapture.payload.population.version;
  positions.payload.employees=people.map((e,i)=>({...positions.payload.employees[i],contractId:e.contractId,employeeNumber:e.employeeNumber,identityToken:e.identityToken}));
  positions.payloadSha256=ownRunHash(positions.payload);
 }else Object.assign(positions,{status:'not_captured',payload:null,payloadSha256:null});
 Object.assign(dimensions,{captureId:originalCapture.id,capturePayloadSha256:originalCapture.payloadSha256});
 dimensions.payload.populationVersion=originalCapture.payload.population.version;
 dimensions.payload.employees=people.map((e,i)=>({...dimensions.payload.employees[i],contractId:e.contractId,employeeNumber:e.employeeNumber,identityToken:e.identityToken}));dimensions.payloadSha256=ownRunHash(dimensions.payload);
 const sources={};for(const key of POPULATION_PROOF_SOURCE_KEYS)if(Object.hasOwn(originalCapture.payload,key))sources[key]=structuredClone(originalCapture.payload[key]);
 const receipt=closed.receipt,s=receipt.snapshot;
 Object.assign(comparison,{version:'own-position-comparison.v2',period:originalCapture.body.period,liquidationType:originalCapture.body.liquidationType,
  groups:[{id:receipt.groupId,snapshotSha256:receipt.snapshotSha256,recordedAt:receipt.recordedAt,employeeCount:s.employeeCount,populationCount:s.populationCount,populationComplete:s.populationComplete}],
  employees:s.employees.map(e=>({groupId:receipt.groupId,contractId:e.contractId,employeeNumber:e.employeeNumber,captureId:e.runId,resultSha256:e.resultSha256,liquidationVersion:e.liquidationVersion})),
  captures:[{id:originalCapture.id,payloadSha256:originalCapture.payloadSha256,population:structuredClone(originalCapture.payload.population),positions,dimensions,populationProof:{version:'own-position-population-proof.v1',shape:Object.keys(sources).length?'sources':'employees',sources}}]});
 return {comparison,originalCapture,closed};
}
