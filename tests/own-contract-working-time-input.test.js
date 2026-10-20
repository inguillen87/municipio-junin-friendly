import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOwnPayrollInput } from '../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../lib/own-payroll-snapshot.js';
import { ownProgramHistory } from '../assets/own-payroll-program-model.js';
import { auxiliarySources } from './fixtures/own-payroll-auxiliary-synthetic.js';
import { row } from './fixtures/native-salary-synthetic.js';
import { rule, policy } from './fixtures/own-payroll-synthetic.js';
import { hash, uid } from './fixtures/own-payroll-program-synthetic.js';
import { ownRunHash } from '../lib/internal-own-payroll-run.js';
function seal(s){s.workingTime.version=ownRunHash(['own-contract-working-time.v1',s.period,s.workingTime.records]);s.population.version=ownRunHash({employees:s.population.employees,workingTime:s.workingTime});return s;}
function source(count=37){
 const s=auxiliarySources(count),p=s.programState.program.definition;p.workingTimeVersion='own-contract-working-time.v1';
 for(const [code,key,field] of [['991','daily','dailyHours'],['992','monthly','monthlyHours']]){
  s.programState.salaryCatalog.items.push(row({kind:'auxiliary',code,nature:'auxiliary',unit:'hours'}));
  p.rules.push(rule(code,{op:'input',key,unit:'hours'},{nature:'auxiliary',unit:'hours',rounding:policy('exact',8)}));
  p.bindings.push({agreementCode:'1',key,unit:'hours',sourceKind:'working_time_fact',sourceField:field,onMissing:'error',combine:'single',ruleReference:'Jornada contractual exclusivamente sintética QA'});
 }
 s.workingTime={complete:true,version:hash('a'),records:s.population.employees.map((e,i)=>({contractId:e.contractId,identityToken:e.identityToken,configuration:{version:hash('a'),revision:1,proposalId:uid(500+i),approvalId:uid(600+i),identityToken:e.identityToken,definition:{dailyHours:i===0?'0.00':'7.50000001',monthlyHours:i===0?'0':'160.250',asOfDate:'2026-10-01',documentReference:'Jornada exclusivamente sintética QA'}}}))};return seal(s);
}
test('whole native population consumes independently approved exact hours without changing money totals',()=>{
 const s=source(),input=prepareOwnPayrollInput(s),result=createOwnPayrollSnapshot(input).result;
 assert.equal(input.employees.length,37);assert.equal(input.employees[36].inputs.find(i=>i.key==='daily').value,'7.50000001');
 assert.equal(input.employees[36].inputs.find(i=>i.key==='monthly').value,'160.25000000');assert.equal(input.employees[0].inputs.find(i=>i.key==='monthly').value,'0.00000000');
 assert.ok(result.employeeTotals.every(t=>t.net==='114.69'));assert.ok(input.employees[36].inputs.find(i=>i.key==='daily').sourceReference.includes('Jornada propia'));
});
for(const [label,mutate]of[
 ['missing whole source',s=>delete s.workingTime],['missing last employee',s=>s.workingTime.records.pop()],
 ['unapproved hours',s=>Object.assign(s.workingTime.records.at(-1).configuration,{revision:0,definition:null,proposalId:null,approvalId:null,identityToken:null})],
 ['changed identity',s=>s.workingTime.records.at(-1).identityToken=hash('f')],
 ['implicit conversion to minutes',s=>s.programState.program.definition.bindings.at(-1).unit='minutes'],
 ['absence silently zero',s=>s.programState.program.definition.bindings.at(-1).onMissing='zero'],
 ['missing explicit version',s=>delete s.programState.program.definition.workingTimeVersion],
 ['invented component',s=>s.programState.program.definition.bindings.at(-1).sourceField='daysWorked'],
])test(label+' blocks the complete payroll',()=>{const s=source();mutate(s);assert.throws(()=>prepareOwnPayrollInput(s));});

test('approved null hours remain unknown until a direct numeric consumer rejects the complete result',()=>{
 const s=source();s.workingTime.records.at(-1).configuration.definition.dailyHours=null;seal(s);
 const before=structuredClone(s),input=prepareOwnPayrollInput(s);
 assert.equal(input.employees.at(-1).inputs.find(i=>i.key==='daily').value,null);
 assert.throws(()=>createOwnPayrollSnapshot(input),e=>e.code==='INPUT_MISSING');
 assert.deepEqual(s,before);
});
test('changed documentary hours alter the capture version while the original input stays intact',()=>{
 const s=source(1),old=prepareOwnPayrollInput(s);s.workingTime.records[0].configuration.definition.monthlyHours='1.25';
 assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_VERSION_INVALID');const next=prepareOwnPayrollInput(seal(s));
 assert.notEqual(old.sourceVersions.population,next.sourceVersions.population);assert.equal(old.employees[0].inputs.find(i=>i.key==='monthly').value,'0.00000000');
});
test('earlier programs reject unsolicited hours and retain exact shape and input',()=>{
 const s=auxiliarySources(),old=prepareOwnPayrollInput(s);s.workingTime=source(1).workingTime;assert.throws(()=>prepareOwnPayrollInput(s));delete s.workingTime;assert.deepEqual(prepareOwnPayrollInput(s),old);
 const p=source(1).programState.program.definition,down=structuredClone(p);delete down.workingTimeVersion;assert.throws(()=>ownProgramHistory(p,down),e=>e.code==='PROGRAM_HISTORY_REQUIRED');
});
test('an explicitly declared synthetic basic uses the approved hourly ratio and preserves fractional cents',()=>{
 const s=source(1),p=s.programState.program.definition,r=p.rules.find(r=>r.code==='95');
 s.workingTime.records[0].configuration.definition.monthlyHours='80.125';
 r.expression={op:'multiply',left:{op:'auxiliary',code:'88',stage:'exact'},right:{op:'divide',left:{op:'input',key:'monthly',unit:'hours'},right:{op:'literal',unit:'hours',value:'160.250'}}};
 r.rounding=policy('exact',3);p.totalsPrecision=3;
 const result=createOwnPayrollSnapshot(prepareOwnPayrollInput(seal(s))).result;
 assert.equal(result.employeeTotals[0].net,'57.345');
 assert.equal(result.rows.find(r=>r.conceptCode==='95').amount,'50.055');
});
