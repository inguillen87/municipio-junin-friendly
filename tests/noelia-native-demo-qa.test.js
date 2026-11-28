import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNoeliaCircuitQa} from '../scripts/lib/noelia-payroll-circuit-qa.mjs';
import {deferNoeliaNativeDemoSeed,assertNoeliaNativeDemoCycle} from '../scripts/lib/noelia-native-demo-qa.mjs';

// Entirely invented existing QA fixture. Tests are proposed, not executed here.
// Building these strings uses no SQL connection, browser, payroll engine or credentials.
const qa=buildNoeliaCircuitQa(18,{jurisdictions:true}),cut=deferNoeliaNativeDemoSeed(qa.sql);
test('deferring the one original native block is byte reversible and retains both original individual sources',()=>{
 assert.equal(cut.sql.slice(0,cut.offset)+cut.originalBlock+cut.sql.slice(cut.offset),qa.sql);
 assert.equal(cut.draft.legajo,'19041');assert.equal(cut.draft.jurisdictionCode,'42');
 assert.ok(!cut.sql.includes(cut.createStatement));
 assert.ok(cut.afterCreate.includes("ARRAY['2000','25']"));
 assert.ok(cut.afterCreate.includes("NOT EXISTS(SELECT 1 FROM grh_employees WHERE legajo='19041')"));
 assert.equal((cut.afterCreate.match(/payroll_novelty_prepare_v2\(/g)||[]).length,1);
 assert.equal((cut.afterCreate.match(/payroll_novelty_transition_v2\(/g)||[]).length,2);
});
test('only the opt-in UI fixture removes 19041, while all twenty-four explicitly declared55 hires remain',()=>{
 assert.equal(qa.nativeDemo,null);
 const ui=buildNoeliaCircuitQa(18,{jurisdictions:true,nativeDemoUi:true});
 assert.equal(ui.nativeDemo.draft.legajo,'19041');assert.ok(ui.caps.includes('employee.record.create'));
 assert.ok(!ui.sql.includes(ui.nativeDemo.createStatement));
 assert.equal([...ui.sql.matchAll(/hire:=native_employee_create_v1\(maker,'\{[^\n]*"legajo":"20[0-9]+"[^\n]*"jurisdictionCode":"55"/g)].length,24);
});
test('incomplete, duplicate or changed seed anchors cannot silently switch to another source or drop original batches',()=>{
 const start='    hire:=native_employee_create_v1(maker,';
 for(const altered of [
  qa.sql.replace(start,'    changed_create(maker,'),
  qa.sql+start,
  qa.sql.replace("ARRAY['2000','25']","ARRAY['2000']"),
  qa.sql.replace('"legajo":"19041"','"legajo":"19042"'),
  qa.sql.replace("fixture seeds approved sources but never precomputes a capture/result","changed guard")
 ])assert.throws(()=>deferNoeliaNativeDemoSeed(altered));
});
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),id=uid(901),reg=uid(902),old=uid(903),next=uid(904),group=uid(905);
const totals={remuneration:'112.61',non_remuneration:'40.25',deduction:'3.38',employer_contribution:'15.02',gross:'152.86',net:'149.48'};
function cycle(){
 // Deliberately narrow cross-link objects: full API/model validation is in the canonical circuit.
 const receipt={version:'native-employee.v1',registrationId:reg,contractId:id,legajo:'19041',name:cut.draft.fullName,startDate:cut.draft.startDate,createdAt:'2026-11-04T03:00:00.000Z',origin:'MUNICONTROL',accountCreated:false,payrollCalculated:false,replayed:false,jurisdictionCode:'42'};
 const employee={contractId:id,employeeNumber:'19041',runId:next,inputSha256:'c'.repeat(64),resultSha256:'d'.repeat(64),liquidationVersion:2,conceptCount:6,totals:{contractId:id,...totals}};
 const record={contractId:id,registrationId:reg,employeeNumber:'19041',runId:next,sourceGroupId:group,liquidationVersion:2,totals:{...totals},concepts:Array.from({length:6},()=>({}))};
 return{
  created:{key:uid(906),body:{draft:cut.draft,catalogVersion:'f'.repeat(64)},receipt},
  original:{id:old,saved:{input:{employees:[{contractId:id,employeeNumber:'19041'}]},resultSha256:'a'.repeat(64)}},
  confirmed:{runId:old,affected:[{contractId:id,state:'confirmed',liquidationVersion:1}]},
  annulled:{runId:old,resultSha256:'a'.repeat(64),affected:[{contractId:id,state:'annulled',liquidationVersion:1}]},
  recalculated:{id:next,body:{selection:{kind:'contracts',values:[id]}},saved:{inputSha256:'c'.repeat(64),resultSha256:'d'.repeat(64),result:{employeeCount:1,employeeTotals:[{contractId:id,...totals}],rows:Array.from({length:6},()=>({contractId:id,employeeNumber:'19041'}))}}},
  reconfirmed:{runId:next,affected:[{contractId:id,state:'confirmed',liquidationVersion:2}]},
  closed:{groupId:group,snapshot:{employees:[employee,...Array.from({length:28},(_,n)=>({contractId:uid(n+1)}))]}},
  printable:{state:'approved',snapshot:{recordCount:29,records:[record,...Array.from({length:28},(_,n)=>({contractId:uid(n+1)}))]}}
 };
}
test('one UI receipt links the same native contract through all decisions, final close and approved document',()=>{
 const proof=assertNoeliaNativeDemoCycle(cycle());
 assert.equal(proof.allStepsSameContract,true);assert.equal(proof.fullPersonalPage,false);
 assert.equal(proof.contractId,id);assert.equal(proof.registrationId,reg);assert.equal(proof.recalculatedRunId,next);
 assert.equal(proof.population,29);assert.equal(proof.concepts,6);
});
const negatives=[
 ['different original confirmation',v=>{v.confirmed.affected[0].contractId=uid(999);}],
 ['different annulled contract',v=>{v.annulled.affected[0].contractId=uid(999);}],
 ['different recalculated contract with equal amounts',v=>{v.recalculated.saved.result.rows[0].contractId=uid(999);}],
 ['old closed run with equal amounts',v=>{v.closed.snapshot.employees[0].runId=old;}],
 ['changed closed result hash',v=>{v.closed.snapshot.employees[0].resultSha256='0'.repeat(64);}],
 ['different receipt registration with equal amounts',v=>{v.printable.snapshot.records[0].registrationId=uid(999);}],
 ['different receipt close group',v=>{v.printable.snapshot.records[0].sourceGroupId=uid(999);}],
 ['old receipt run with equal amounts',v=>{v.printable.snapshot.records[0].runId=old;}]
];
for(const [label,change]of negatives)test('rejects '+label,()=>{const v=cycle();change(v);assert.throws(()=>assertNoeliaNativeDemoCycle(v));});
