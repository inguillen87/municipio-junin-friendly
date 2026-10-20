import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {conditionSources,conditionMatch} from './fixtures/own-payroll-conditions-synthetic.js';
import {row} from './fixtures/native-salary-synthetic.js';
import {rule,fact,lit,policy} from './fixtures/own-payroll-synthetic.js';
import {capture,runCommand} from './fixtures/own-payroll-run-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash,ownRunOperation,RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
// Entirely synthetic fixture. No municipal convention, formula or identity is inferred.
function seal(s){
 s.salaryConditions.version=ownRunHash(['own-contract-salary-conditions.v1',s.period,s.salaryConditions.records]);
 s.workingTime.version=ownRunHash(['own-contract-working-time.v1',s.period,s.workingTime.records]);
 s.population.version=ownRunHash({employees:s.population.employees,workingTime:s.workingTime,salaryConditions:s.salaryConditions});
 return s;
}
function source(monthlyHours=null,selected=false){
 const s=conditionSources(1),p=s.programState.program.definition,e=s.population.employees[0];
 p.workingTimeVersion='own-contract-working-time.v1';
 s.programState.salaryCatalog.items.push(row({kind:'auxiliary',code:'915',nature:'auxiliary',unit:'hours'}));
 p.rules.push(rule('915',{op:'choose',condition:conditionMatch('titleStatus','code','declared'),then:fact('contractMonthly','hours'),else:lit('0','hours')},{nature:'auxiliary',unit:'hours',rounding:policy('exact',8)}));
 p.bindings.push({agreementCode:'1',key:'contractMonthly',unit:'hours',sourceKind:'working_time_fact',sourceField:'monthlyHours',onMissing:'error',combine:'single',ruleReference:'Conditional hours exclusively synthetic QA'});
 if(!selected)s.salaryConditions.records[0].definition.title={status:'none',code:null,percentage:null};
 s.workingTime={complete:true,version:'a'.repeat(64),records:[{contractId:e.contractId,identityToken:e.identityToken,configuration:{version:'a'.repeat(64),revision:1,proposalId:uid(99001),approvalId:uid(99002),identityToken:e.identityToken,definition:{dailyHours:null,monthlyHours,asOfDate:s.period+'-01',documentReference:'Contractual hours exclusively synthetic QA'}}}]};
 s.programState.program.definition=ownProgramDefinition(p,s.programState.salaryCatalog.items);
 return seal(s);
}
const hoursInput=i=>i.employees[0].inputs.find(v=>v.key==='contractMonthly');
const hoursRow=r=>r.rows.find(v=>v.conceptCode==='915');
test('an approved nullable hours component survives an unselected branch without conversion to zero',()=>{
 const s=source(),before=structuredClone(s);ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items);
 const i=prepareOwnPayrollInput(s),r=createOwnPayrollSnapshot(i).result;
 assert.equal(hoursInput(i).value,null);assert.equal(hoursInput(i).unit,'hours');assert.equal(hoursRow(r).amount,'0.00000000');
 assert.equal(hoursRow(r).trace.some(v=>v.reference==='contractMonthly'),false);
 assert.equal(i.employees[0].inputs.find(v=>v.key==='titlePercentage').value,null);assert.equal(i.employees[0].inputs.find(v=>v.key==='titleCode').value,null);assert.deepEqual(s,before);
});
test('a selected nullable hours component reaches the unchanged engine and rejects the complete result',()=>{
 const s=source(null,true),before=structuredClone(s),i=prepareOwnPayrollInput(s);
 assert.equal(hoursInput(i).value,null);assert.throws(()=>createOwnPayrollSnapshot(i),e=>e.code==='INPUT_MISSING');assert.deepEqual(s,before);
});
test('explicit zero remains distinct from null and exact nonzero hours keep all eight decimals',()=>{
 for(const [hours,expected]of[['0','0.00000000'],['7.50000001','7.50000001']]){
  const s=source(hours,true),i=prepareOwnPayrollInput(s),r=createOwnPayrollSnapshot(i).result;
  assert.equal(hoursInput(i).value,expected);assert.equal(hoursRow(r).amount,expected);assert.ok(hoursRow(r).trace.some(v=>v.reference==='contractMonthly'));
 }
});
test('nullable hours retain the exact approved source reference and approval rather than an empty provenance',()=>{
 const s=source(),c=s.workingTime.records[0].configuration,i=prepareOwnPayrollInput(s);
 assert.equal(hoursInput(i).sourceReference,['Jornada propia',c.version,c.approvalId,s.period,'monthlyHours',c.definition.asOfDate].join(':'));
 assert.ok(hoursInput(i).sourceReference.includes(c.approvalId));
});
test('a missing approval still rejects an unselected hours branch',()=>{
 const s=source();Object.assign(s.workingTime.records[0].configuration,{revision:0,definition:null,proposalId:null,approvalId:null,identityToken:null});seal(s);
 assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_VALUE_MISSING');
});
test('wrong hours unit and missing documentary reference remain rejected at their existing source boundaries',()=>{
 const a=source();a.programState.program.definition.bindings.find(b=>b.key==='contractMonthly').unit='minutes';assert.throws(()=>prepareOwnPayrollInput(a),e=>e.code==='BINDING_INVALID');
 const b=source();b.workingTime.records[0].configuration.definition.documentReference='';seal(b);assert.throws(()=>prepareOwnPayrollInput(b));
});
test('unapproved identity or stale captured hashes cannot be hidden behind an unselected branch',()=>{
 const a=source();a.workingTime.records[0].configuration.identityToken='f'.repeat(64);seal(a);assert.throws(()=>prepareOwnPayrollInput(a),e=>e.code==='WORKING_TIME_IDENTITY_CHANGED');
 const b=source('8');b.workingTime.records[0].configuration.definition.monthlyHours=null;assert.throws(()=>prepareOwnPayrollInput(b),e=>e.code==='SOURCE_VERSION_INVALID');
});
test('the binding still requires explicit working-time version and error policy; missing does not become zero',()=>{
 const a=source();a.programState.program.definition.bindings.find(b=>b.key==='contractMonthly').onMissing='zero';assert.throws(()=>prepareOwnPayrollInput(a),e=>e.code==='BINDING_INVALID');
 const b=source();delete b.programState.program.definition.workingTimeVersion;assert.throws(()=>prepareOwnPayrollInput(b));
});
test('a numeric branch not using hours preserves its complete canonical input and result for reported hours',()=>{
 const a=prepareOwnPayrollInput(source('8')),b=prepareOwnPayrollInput(source('7.50000001'));
 assert.equal(hoursRow(createOwnPayrollSnapshot(a).result).amount,'0.00000000');assert.equal(hoursRow(createOwnPayrollSnapshot(b).result).amount,'0.00000000');
 assert.deepEqual(a.rules,b.rules);assert.notEqual(a.sourceVersions.population,b.sourceVersions.population);
});
test('saved old-algorithm results remain recoverable while an old pending capture cannot run under the proposal algorithm',async()=>{
 const priorAlgorithm='f99359e0c05681b66e0df361eccd205c159b0f101a9de6fd8575cc8760d00fd2';
 const nextAlgorithm='e8ba30aeed4d0c72bcd33078850e9f109eef761d6b45ac41158a363418b6491d';
 const s=source('8'),snapshot=createOwnPayrollSnapshot(prepareOwnPayrollInput(s));
 const body=runCommand({period:s.period,liquidationType:s.liquidationType,selection:s.selection,programVersion:s.programState.program.version});
 const payload={...s,sourceInventory:{populationDomain:'native_registered'}};
 const c=capture({body,bodySha256:ownRunHash(body),algorithmSha256:priorAlgorithm,payload,payloadSha256:ownRunHash(payload)});
 c.saved={version:'own-payroll-saved.v1',id:c.id,algorithmSha256:priorAlgorithm,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,input:snapshot.input,result:snapshot.result,recordedAt:'2026-10-05T10:01:00Z'};
 const original=structuredClone(c),calls=[];
 // Inert in-memory unit-test adapter: strings are recorded, never sent to SQL.
 const memory={query:async(q,values)=>{calls.push({q,values});return[{result:c}];}};
 const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:RUN_CALCULATE}},session={email:'qa@example.invalid',id:uid(3),version:1,releaseSha:'d'.repeat(40)};
 assert.deepEqual(await ownRunOperation(memory,principal,session,'calculate',{key:c.key,body:c.body},{algorithmHash:()=>nextAlgorithm}),original);
 c.saved=null;await assert.rejects(()=>ownRunOperation(memory,principal,session,'calculate',{key:c.key,body:c.body},{algorithmHash:()=>nextAlgorithm}),e=>e.code==='OWN_RUN_ENGINE_CHANGED'&&e.status===409);
 assert.deepEqual(await ownRunOperation(memory,principal,session,'attempt',{key:c.key}),c);
 assert.equal(calls.length,3);assert.ok(calls.every(v=>!v.q.includes('own_run_complete')));
 assert.equal(c.key,original.key);assert.deepEqual(c.body,original.body);assert.equal(c.algorithmSha256,priorAlgorithm);
});
