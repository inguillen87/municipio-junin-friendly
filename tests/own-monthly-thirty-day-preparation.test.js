import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {MONTHLY_THIRTY_DAY_POLICY_VERSION,MONTHLY_NATIVE_DATES_VERSION,monthlyThirtyDayPolicy,prepareMonthlyThirtyDayParticipation} from '../assets/own-monthly-thirty-day-preparation.js';
import {syntheticParticipationBootstrap} from './fixtures/own-period-participation-synthetic.js';
import {participationHash,prepareParticipation} from '../assets/own-period-participation-model.js';
import {participationRuleKey} from '../assets/own-period-participation-program.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {auxiliarySources} from './fixtures/own-payroll-auxiliary-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
const hash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const policy=()=>({version:MONTHLY_THIRTY_DAY_POLICY_VERSION,baseUnits:'30',fullPeriod:'neutral_fraction',partialMethod:'inclusive_calendar_intersection',startBoundary:'inclusive',endBoundary:'inclusive',effectiveFrom:'2020-01',effectiveUntil:'2030-12',reference:'Política exclusivamente ficticia y candidata QA'});
function fixture({period='2026-10',startDate='2026-10-16',endDate=null,fullPeriod=false}={}){
 const bootstrap=syntheticParticipationBootstrap();bootstrap.period=period;Object.assign(bootstrap.source,{period,fullPeriod});
 return {bootstrap,policy:policy(),nativeDates:{version:MONTHLY_NATIVE_DATES_VERSION,contractId:bootstrap.contractId,identityToken:bootstrap.source.subject.identityToken,sourceVersion:bootstrap.source.version,startDate,endDate},asOfDate:period+'-01',documentReference:'Constancia exclusivamente ficticia QA',reason:'Preparación de participación exclusivamente ficticia QA'};
}
test('October16 yields the documented16/30 rational and an ordinary existing157 proposal, without approval or source certification',async()=>{
 const input=fixture(),before=structuredClone(input),r=await prepareMonthlyThirtyDayParticipation(input);
 assert.deepEqual(r.command,prepareParticipation(input.bootstrap,{recognizedUnits:'16',baseUnits:'30',asOfDate:input.asOfDate,documentReference:input.documentReference},input.reason));
 assert.deepEqual(r.computation.effectiveFraction,{numerator:'16',denominator:'30'});assert.equal(r.computation.calendarDays,'16');
 assert.equal(r.command.reviewConfirmed,false);assert.equal(r.command.proposalId,null);assert.equal(r.command.command,'propose');
 assert.equal(r.pins.sourceVersion,input.bootstrap.source.version);assert.equal(r.status,'proposal_draft');assert.equal(r.approved,false);assert.equal(r.executable,false);
 assert.equal(r.policyStatus,'explicit_candidate_not_municipally_homologated');assert.equal(r.sourceVerification,'typed_caller_dates_not_server_certification');
 assert.deepEqual(input,before);assert.ok(Object.isFrozen(r.command.definition));
});
test('complete28/29/30/31-day months all retain30 as documentary base and a neutral1/1 engine factor',async()=>{
 for(const [period,days] of [['2027-02','28'],['2028-02','29'],['2026-09','30'],['2026-10','31']]){
  const r=await prepareMonthlyThirtyDayParticipation(fixture({period,startDate:'2000-01-01',fullPeriod:true}));
  assert.equal(r.computation.calendarDays,days);assert.equal(r.command.definition.recognizedUnits,'30');assert.equal(r.command.definition.baseUnits,'30');
  assert.deepEqual(r.computation.effectiveFraction,{numerator:'1',denominator:'1'});
 }
});
test('exit boundaries and partial February use only the explicitly chosen candidate convention, not an implicit municipal rule',async()=>{
 for(const [options,days] of [[{endDate:'2026-10-20'},'5'],[{startDate:'2000-01-01',endDate:'2026-10-15'},'15'],[{startDate:'2026-10-31'},'1'],[{period:'2027-02',startDate:'2027-02-16'},'13'],[{period:'2028-02',startDate:'2028-02-16'},'14']]){
  const r=await prepareMonthlyThirtyDayParticipation(fixture(options));assert.equal(r.command.definition.recognizedUnits,days);assert.equal(r.command.definition.baseUnits,'30');
  assert.equal(r.policy.partialMethod,'inclusive_calendar_intersection');assert.equal(r.policyStatus,'explicit_candidate_not_municipally_homologated');
 }
});
test('an explicit interval outside the month yields zero without selecting, deleting or fabricating an employment row',async()=>{
 for(const options of [{startDate:'2000-01-01',endDate:'2026-09-30'},{startDate:'2026-11-01'}]){
  const r=await prepareMonthlyThirtyDayParticipation(fixture(options));assert.equal(r.command.definition.recognizedUnits,'0');assert.equal(r.computation.coveredFrom,null);assert.equal(r.computation.coveredUntil,null);
  assert.equal(r.command.contractId,r.pins.contractId);assert.equal(r.command.proposalId,null);
 }
});
test('month and date input are strict civil values, independently of local clocks, payments or liquidation dates',async()=>{
 for(const mutate of [v=>{v.bootstrap.period+='\n';v.bootstrap.source.period+='\n';},v=>{v.nativeDates.startDate='2026-10-16\r';},v=>{v.nativeDates.startDate='2026-02-30';},v=>{v.nativeDates.startDate=null;},v=>{v.nativeDates.endDate='2026-10-15';},v=>{v.nativeDates.startDate='2100-01-01';},v=>{v.paymentDate='2026-10-16';},v=>{v.nativeDates.attendanceDays='16';}]){
  const input=fixture();mutate(input);await assert.rejects(prepareMonthlyThirtyDayParticipation(input));
 }
});
test('source scope, identity, exact existing157 pin and continuity must agree before preparing any command',async()=>{
 for(const mutate of [v=>{v.nativeDates.contractId=uid(77);},v=>{v.nativeDates.identityToken='b'.repeat(64);},v=>{v.nativeDates.sourceVersion='b'.repeat(64);},v=>{v.bootstrap.scopeVersion+='\n';},v=>{v.bootstrap.source.version+='\n';v.nativeDates.sourceVersion=v.bootstrap.source.version;},v=>{v.bootstrap.source.fullPeriod=true;},v=>{v.nativeDates.sourceVerified=true;},v=>{v.nativeDates.version='native-from-client-verified';}]){
  const input=fixture();mutate(input);await assert.rejects(prepareMonthlyThirtyDayParticipation(input));
 }
});
test('the caller must declare a complete policy with effective period, reference and boundary semantics; no global default is supplied',async()=>{
 assert.ok(Object.isFrozen(monthlyThirtyDayPolicy(policy())));
 for(const mutate of [v=>{delete v.policy;},v=>{delete v.policy.endBoundary;},v=>{v.policy.baseUnits=30;},v=>{v.policy.baseUnits='31';},v=>{v.policy.fullPeriod='30_days';},v=>{v.policy.partialMethod='attendance';},v=>{v.policy.startBoundary='exclusive';},v=>{v.policy.reference='';},v=>{v.policy.effectiveFrom='2027-01';},v=>{v.policy.effectiveUntil='2026-09';},v=>{v.policy.approved=true;}]){
  const input=fixture();mutate(input);await assert.rejects(prepareMonthlyThirtyDayParticipation(input));
 }
});
test('existing permissions, duplicate-declaration and civil as-of guards stay in prepareParticipation',async()=>{
 const denied=fixture();denied.bootstrap.permissions.canPropose=false;await assert.rejects(prepareMonthlyThirtyDayParticipation(denied),e=>e.code==='PARTICIPATION_FORBIDDEN');
 const future=fixture();future.asOfDate='2026-11-01';await assert.rejects(prepareMonthlyThirtyDayParticipation(future));
 const duplicate=fixture(),first=await prepareMonthlyThirtyDayParticipation(duplicate);Object.assign(duplicate.bootstrap.configuration,{revision:1,definition:first.command.definition,proposalId:uid(300),approvalId:uid(400),identityToken:duplicate.nativeDates.identityToken,sourceVersion:duplicate.nativeDates.sourceVersion});
 await assert.rejects(prepareMonthlyThirtyDayParticipation(duplicate),/no contiene cambios/);
 duplicate.bootstrap.source.version='b'.repeat(64);duplicate.nativeDates.sourceVersion='b'.repeat(64);assert.equal((await prepareMonthlyThirtyDayParticipation(duplicate)).command.sourceVersion,'b'.repeat(64));
});
test('WebCrypto evidence hashes match canonical Node hashes and bind policy, date interval and all current source pins',async()=>{
 const input=fixture(),r=await prepareMonthlyThirtyDayParticipation(input),{preparationSha256,...payload}=r;
 assert.equal(preparationSha256,hash(payload));assert.equal(r.policySha256,hash(input.policy));assert.equal(r.nativeDatesSha256,hash(input.nativeDates));assert.equal(await participationHash(payload),preparationSha256);
 const changed=fixture();changed.policy.reference='Otro respaldo exclusivamente ficticio QA';assert.notEqual((await prepareMonthlyThirtyDayParticipation(changed)).preparationSha256,preparationSha256);
 const changedScope=fixture();changedScope.bootstrap.scopeVersion='b'.repeat(64);assert.notEqual((await prepareMonthlyThirtyDayParticipation(changedScope)).preparationSha256,preparationSha256);
});
test('accessors, prototypes, sparse arrays and cyclic input fail without executing supplied code',async()=>{
 let touched=false;const input=fixture();Object.defineProperty(input.nativeDates,'startDate',{enumerable:true,get(){touched=true;return'2026-10-16';}});await assert.rejects(prepareMonthlyThirtyDayParticipation(input));assert.equal(touched,false);
 const prototype=fixture();Object.setPrototypeOf(prototype.nativeDates,{sourceVerified:true});await assert.rejects(prepareMonthlyThirtyDayParticipation(prototype));
 const cycle=fixture();cycle.nativeDates.extra=cycle;await assert.rejects(prepareMonthlyThirtyDayParticipation(cycle));
 const sparse=fixture();sparse.bootstrap.proposals=Array(1);await assert.rejects(prepareMonthlyThirtyDayParticipation(sparse));
});
test('a candidate16/30 can feed the existing approved-input adapter and exact engine once independently approved; dependent results receive no second factor',async()=>{
 const draft=await prepareMonthlyThirtyDayParticipation(fixture()),s=auxiliarySources(2),p=s.programState.program.definition,originalRules=structuredClone(p.rules);
 p.periodParticipation={version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:p.rules.map(r=>({ruleKey:participationRuleKey(r),treatment:r.code==='88'?'fraction':'declared_formula',reference:'Tratamiento exclusivamente ficticio QA'}))};
 for(const sourceField of ['recognizedUnits','baseUnits'])p.bindings.push({agreementCode:'1',key:sourceField,unit:'units',sourceKind:'period_fact',sourceField,onMissing:'error',combine:'single',ruleReference:'Participación exclusivamente ficticia QA'});
 s.periodParticipation={complete:true,version:'a'.repeat(64),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,fullPeriod:i===0,configuration:{version:'a'.repeat(64),sourceVersion:'a'.repeat(64),revision:1,definition:draft.command.definition,proposalId:uid(300+i),approvalId:uid(400+i),identityToken:e.identityToken}}))};
 s.periodParticipation.version=hash(['own-period-participation.v1',s.period,s.periodParticipation.records]);s.population.version=hash({employees:s.population.employees,periodParticipation:s.periodParticipation});
 const input=prepareOwnPayrollInput(s);assert.throws(()=>createOwnPayrollSnapshot(input),e=>e.code==='ROUNDING_NEEDED');
 // These alternative amounts are fictional and divisible at the existing
 // exact two-decimal policy. No new monetary rounding policy is invented.
 s.programState.salaryCatalog.items=s.programState.salaryCatalog.items.map(d=>({...d,value:d.kind==='auxiliary'?'100.20':d.code==='88'?'7.50':d.value}));
 const result=createOwnPayrollSnapshot(prepareOwnPayrollInput(s)).result;
 assert.equal(input.employees[0].inputs.find(i=>i.key==='recognizedUnits').value,'1');assert.equal(input.employees[0].inputs.find(i=>i.key==='baseUnits').value,'1');
 assert.equal(input.employees[1].inputs.find(i=>i.key==='recognizedUnits').value,'16');assert.equal(input.employees[1].inputs.find(i=>i.key==='baseUnits').value,'30');
 assert.equal(result.employeeTotals[0].net,'115.20');assert.equal(result.employeeTotals[1].net,'61.44');assert.deepEqual(p.rules,originalRules);
 const serialized=JSON.stringify(draft.command);assert.ok(!serialized.includes('L[18]'));assert.ok(!serialized.includes('N[101]'));assert.ok(!serialized.includes('monthly_quantity'));
});
