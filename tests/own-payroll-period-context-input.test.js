import test from 'node:test';import assert from 'node:assert/strict';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {ownProgramStructure,ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';
import {auxiliarySources} from './fixtures/own-payroll-auxiliary-synthetic.js';
import {periodContextSources,periodContextCaptureFixture,periodContextReportFixture,sealPeriodContextSources} from './fixtures/own-payroll-period-context-synthetic.js';
import {row} from './fixtures/native-salary-synthetic.js';import{rule,policy}from'./fixtures/own-payroll-synthetic.js';import{uid,hash}from'./fixtures/own-payroll-program-synthetic.js';
import{participationRuleKey}from'../assets/own-period-participation-program.js';
import{ownRunOperation,verifyOwnRunReceipt,RUN_CALCULATE}from'../lib/internal-own-payroll-run.js';
import{ownReportBundle,ownReportDocument}from'../assets/own-payroll-report-model.js';

test('one explicit multimonth programme uses only its declared month, with exact engine values and frozen source trace',async()=>{
 let programme=null;for(const[period,month,amount]of[['2026-09','9','1.11'],['2026-12','12','2.22'],['2028-02','2','2.22']]){
  const s=periodContextSources(period,37),before=structuredClone(s),input=prepareOwnPayrollInput(s),result=createOwnPayrollSnapshot(input).result;
  if(programme)assert.deepEqual(s.programState.program.definition,programme);else programme=structuredClone(s.programState.program.definition);
  assert.equal(input.employees.length,37);assert.equal(result.employeeCount,37);assert.ok(result.rows.filter(r=>r.conceptCode==='95').every(r=>r.amount===amount));
  for(const e of input.employees){const v=e.inputs.find(r=>r.key==='periodMonth');assert.equal(v.value,month);assert.match(v.sourceReference,new RegExp(s.periodContext.sha256+':'+period+':monthNumber$'));}
  const c=periodContextCaptureFixture(period,'2099-01-01');assert.equal(await verifiedWorkspaceCapture(c),c);assert.equal(c.saved.result.period,period);assert.deepEqual(s,before);assert.equal(result.paymentExecuted,false);
 }
});

for(const[label,change]of[
 ['missing context',s=>delete s.periodContext],['month zero',s=>s.periodContext.monthNumber='0'],['padded month',s=>s.periodContext.monthNumber='09'],['numeric month',s=>s.periodContext.monthNumber=9],['other period',s=>s.periodContext.period='2026-12'],['new version',s=>s.periodContext.version='own-payroll-period-context.v2'],['extra date',s=>s.periodContext.date='2026-09-30'],['tampered hash',s=>s.periodContext.sha256='a'.repeat(64)],['legacy population hash',s=>s.population.version=ownRunHash({employees:s.population.employees})],
])test(label+' refuses the entire input before evaluating any employee',()=>{const s=periodContextSources();change(s);assert.throws(()=>prepareOwnPayrollInput(s));});

for(const[label,change]of[
 ['absent opt-in',p=>delete p.periodContextVersion],['null version',p=>p.periodContextVersion=null],['unsupported version',p=>p.periodContextVersion='own-payroll-period-context.v2'],['missing namespace',p=>delete p.namespaceVersion],['different field',p=>p.bindings.at(-1).sourceField='liquidationMonth'],['implicit days',p=>p.bindings.at(-1).unit='days'],['missing as zero',p=>p.bindings.at(-1).onMissing='zero'],['sum months',p=>p.bindings.at(-1).combine='sum'],['extra binding date',p=>p.bindings.at(-1).date='2026-09-30'],
])test(label+' cannot normalize an approved period-context source',()=>{const s=periodContextSources();change(s.programState.program.definition);assert.throws(()=>ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items));});

test('retiring explicit context requires programme history, without changing a previous programme or result',()=>{
 const s=periodContextSources(),before=structuredClone(s.programState.program.definition),after=structuredClone(before);delete after.periodContextVersion;
 after.bindings=after.bindings.filter(b=>b.sourceKind!=='period_context_fact');after.rules.find(r=>r.code==='95').expression={op:'literal',unit:'money',value:'1.11'};
 assert.throws(()=>ownProgramHistory(before,after),e=>e.code==='PROGRAM_HISTORY_REQUIRED');assert.deepEqual(s.programState.program.definition,before);
});

test('a tampered context cannot be hidden by resealing the outer capture hashes',async()=>{
 const c=periodContextCaptureFixture();c.payload.periodContext.sha256='a'.repeat(64);c.payloadSha256=ownRunHash(c.payload);
 await assert.rejects(()=>verifiedWorkspaceCapture(c),e=>e.code==='SOURCE_VERSION_INVALID');
 assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='OWN_RUN_CONTRACT_INVALID'&&e.status===503);
});

test('legacy input retains the exact release800 fixture hash and never gains an absent/null context field',()=>{
 // This expected hash was independently obtained with the800dfc adapter before this increment.
 const s=auxiliarySources(1),before=structuredClone(s),input=prepareOwnPayrollInput(s);
 assert.equal(ownRunHash(input),'91a782db2ce4ce5e647742e2710bcba34d6b516e9b9ef6293b7950d6856fb47a');
 assert.equal(Object.hasOwn(s,'periodContext'),false);assert.equal(Object.hasOwn(input,'periodContext'),false);assert.equal(Object.hasOwn(ownProgramStructure(s.programState.program.definition),'periodContextVersion'),false);
 s.periodContext=periodContextSources().periodContext;assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_SCOPE_INVALID');delete s.periodContext;assert.deepEqual(s,before);assert.deepEqual(prepareOwnPayrollInput(s),input);
});

test('an unused context binding is refused instead of silently dropped from the programme',()=>{const s=periodContextSources(),p=s.programState.program.definition;p.rules.find(r=>r.code==='95').expression={op:'literal',unit:'money',value:'1.11'};assert.throws(()=>ownProgramDefinition(p,s.programState.salaryCatalog.items),e=>e.code==='BINDING_UNUSED');});

test('context source seals together with all five180 facts without losing their distinct units, approvals, identities or nulls',()=>{
 const s=periodContextSources('2026-10',2),p=s.programState.program.definition,date=s.period+'-01';
 Object.assign(p,{employmentFactsVersion:'own-salary-seniority.v1',workingTimeVersion:'own-contract-working-time.v1',agreementWorkingTimeVersion:'own-agreement-working-time.v1',salaryConditionsVersion:'own-contract-salary-conditions.v1'});
 for(const[code,key,sourceKind,sourceField,unit]of[['991','years','employment_fact','seniorityYears','units'],['992','contractHours','working_time_fact','monthlyHours','hours'],['993','agreementHours','agreement_time_fact','monthlyHours','hours'],['994','partialYears','salary_condition_fact','partialSeniorityYears','units']]){
  s.programState.salaryCatalog.items.push(row({kind:'auxiliary',code,nature:'auxiliary',unit}));p.rules.push(rule(code,{op:'input',key,unit},{nature:'auxiliary',unit,rounding:policy('exact',8)}));p.bindings.push({agreementCode:'1',key,unit,sourceKind,sourceField,combine:'single',onMissing:'error',ruleReference:'Fuente independiente ficticia QA'});
 }
 const config=(e,i,definition)=>({version:hash('a'),revision:1,proposalId:uid(500+i),approvalId:uid(600+i),identityToken:e.identityToken,definition});
 s.employmentFacts={complete:true,version:hash('a'),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,configuration:config(e,i,{years:'8',months:null,asOfDate:date,documentReference:'Antigüedad exclusivamente ficticia QA'})}))};
 s.workingTime={complete:true,version:hash('a'),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,configuration:config(e,i,{dailyHours:null,monthlyHours:'80.125',asOfDate:date,documentReference:'Jornada exclusivamente ficticia QA'})}))};
 s.agreementWorkingTime={complete:true,version:hash('a'),records:[{agreementCode:'1',agreementToken:hash('b'),revision:1,definition:{monthlyHours:'160.250',asOfDate:date,documentReference:'Convenio exclusivamente ficticio QA'},approvalId:uid(900),approvedAgreementToken:hash('b')}]};
 s.salaryConditions={complete:true,version:hash('a'),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,revision:1,approvalId:uid(700+i),definition:{partialSeniorityYears:'0',title:{status:'not_reported',code:null,percentage:null},unhealthyWork:null,asOfDate:date,documentReference:'Condiciones exclusivamente ficticias QA'}}))};
 p.periodParticipation={version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'reject',treatments:p.rules.map(r=>({ruleKey:participationRuleKey(r),treatment:'declared_formula',reference:'Tratamiento exclusivamente ficticio QA'}))};
 s.periodParticipation={complete:true,version:hash('a'),records:s.population.employees.map(e=>({contractId:e.contractId,identityToken:e.identityToken,fullPeriod:true,configuration:{version:hash('a'),revision:0,definition:null,proposalId:null,approvalId:null,identityToken:null,sourceVersion:null}}))};
 for(const[key,version]of[['employmentFacts',p.employmentFactsVersion],['periodParticipation',p.periodParticipation.version],['workingTime',p.workingTimeVersion],['agreementWorkingTime',p.agreementWorkingTimeVersion],['salaryConditions',p.salaryConditionsVersion]])s[key].version=ownRunHash([version,s.period,s[key].records]);
 sealPeriodContextSources(s);const before=structuredClone(s),input=prepareOwnPayrollInput(s);assert.equal(input.employees.length,2);
 const facts=input.employees[0].inputs;assert.equal(facts.find(f=>f.key==='periodMonth').value,'10');assert.equal(facts.find(f=>f.key==='years').value,'8.00000000');assert.equal(facts.find(f=>f.key==='contractHours').value,'80.12500000');assert.equal(facts.find(f=>f.key==='agreementHours').value,'160.25000000');assert.equal(facts.find(f=>f.key==='partialYears').value,'0.00000000');
 for(const key of['employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions']){const changed=structuredClone(s);changed[key].version=hash('f');assert.throws(()=>prepareOwnPayrollInput(changed),e=>e.code==='SOURCE_VERSION_INVALID');}
 assert.deepEqual(s,before);assert.equal(createOwnPayrollSnapshot(input).result.employeeCount,2);assert.equal(s.workingTime.records[0].configuration.definition.dailyHours,null);assert.equal(s.salaryConditions.records[0].definition.unhealthyWork,null);
});

test('saved L101 results survive an engine change while pending captures keep ENGINE_CHANGED and exact body/key recovery',async()=>{
 const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:RUN_CALCULATE}},session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
 const c=periodContextCaptureFixture(),before=structuredClone(c),calls=[];const sql={query:async(q,v)=>{calls.push([q,v]);return[{result:c}];}};
 const invoke=(op,input)=>ownRunOperation(sql,principal,session,op,input,{algorithmHash:()=>hash('e')});
 assert.deepEqual(await invoke('calculate',{key:c.key,body:c.body}),c);assert.equal(calls.length,1);assert.deepEqual(c,before);
 c.saved=null;await assert.rejects(()=>invoke('calculate',{key:c.key,body:c.body}),e=>e.code==='OWN_RUN_ENGINE_CHANGED'&&e.status===409);assert.equal(calls.length,2);
 assert.deepEqual(await invoke('attempt',{key:c.key}),c);assert.equal(calls.length,3);assert.ok(calls.every(([q])=>!q.includes('own_run_complete')));assert.equal(c.key,before.key);assert.deepEqual(c.body,before.body);
});

test('original variables report describes the captured month in Spanish while retaining the exact advanced source trace',()=>{
 const f=periodContextReportFixture(),before=structuredClone(f),bundle=ownReportBundle(f.query,f.details,f.receipts,f.captures),document=ownReportDocument(bundle,undefined,'variables');
 const month=document.rows.find(r=>r.some(v=>typeof v==='string'&&v.includes('Mes del período de liquidación declarado')));assert.ok(month);assert.ok(month.includes('9'));assert.ok(month.some(v=>typeof v==='string'&&v.includes('Mes del período (1 a 12)')));assert.ok(!month.some(v=>typeof v==='string'&&v.startsWith('Contexto propio del período / monthNumber')));
 assert.ok(month.some(v=>typeof v==='string'&&v.includes('own-payroll-period-context.v1')));assert.deepEqual(f,before);
});
