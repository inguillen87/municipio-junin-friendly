// Fictional QA composition through the actual program/catalogue validators.
// This suite neither connects to PostgreSQL nor changes municipal definitions.
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOwnPeriodClassificationFixtureProgram} from '../scripts/lib/own-period-classification-qa.mjs';
import {ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {salaryRowKey,salaryItems} from '../assets/native-salary-catalog-model.js';
import {program,definitions} from './fixtures/own-payroll-program-synthetic.js';

const period='2026-09';

test('legacy177 fixture reproduces the namespace rejection and repairs it with separate approved definitions',()=>{
 const prior=program(),catalog=definitions(),before=structuredClone({prior,catalog}),prepared=prepareOwnPeriodClassificationFixtureProgram(prior,catalog,period);
 const ambiguous=structuredClone(prepared.program);ambiguous.bindings.find(b=>b.key==='base').sourceKind='parameter';
 assert.throws(()=>ownProgramDefinition(ambiguous,prepared.items),e=>e.code==='SOURCE_DEFINITION_MISSING');
 assert.deepEqual(ownProgramDefinition(prepared.program,prepared.items),prepared.program);
 assert.doesNotThrow(()=>ownProgramHistory(prior,prepared.program));
 assert.equal(prepared.auxiliaryCopies,2);assert.equal(prepared.program.bindings.find(b=>b.key==='base').sourceKind,'auxiliary_parameter');
 assert.deepEqual(prepared.program.rules.filter(r=>r.code!=='1771'),prior.rules);
 const afterByKey=new Map(prepared.items.map(r=>[salaryRowKey(r),r]));
 for(const original of catalog){assert.deepEqual(afterByKey.get(salaryRowKey(original)),original);if(original.kind==='concept'&&original.nature==='auxiliary')assert.deepEqual(afterByKey.get(salaryRowKey({...original,kind:'auxiliary'})),{...original,kind:'auxiliary'});}
 assert.deepEqual({prior,catalog},before,'approved fixture inputs remain unchanged');
});

test('an existing namespaced fixture retains every rule and binding without another namespace conversion',()=>{
 const first=prepareOwnPeriodClassificationFixtureProgram(program(),definitions(),period),prior=structuredClone(first.program),catalog=structuredClone(first.items),second=prepareOwnPeriodClassificationFixtureProgram(prior,catalog,'2026-08');
 assert.equal(second.auxiliaryCopies,0);assert.equal(second.items.length,catalog.length+1);
 for(const r of prior.rules)assert.ok(second.program.rules.some(next=>JSON.stringify(next)===JSON.stringify(r)));
 assert.deepEqual(second.program.bindings,prior.bindings);assert.doesNotThrow(()=>ownProgramHistory(prior,second.program));
 assert.deepEqual(prior,first.program);assert.deepEqual(catalog,first.items);
});

test('missing legacy values and catalogue coverage still reject the synthetic program without invented values or dates',()=>{
 for(const patch of [{value:null},{validFrom:'2026-11'},{validUntil:'2026-10'}]){
  const catalog=definitions().map(r=>r.code==='8800'?{...r,...patch}:r),before=structuredClone(catalog);
  assert.throws(()=>prepareOwnPeriodClassificationFixtureProgram(program(),catalog,period),e=>e.code==='SOURCE_DEFINITION_MISSING');
  assert.deepEqual(catalog,before);
 }
});

test('a pre-existing auxiliary is reused only when its exact declared values, units and validity match',()=>{
 const prior=program(),catalog=definitions(),auxiliaries=catalog.filter(r=>r.kind==='concept'&&r.nature==='auxiliary').map(r=>({...r,kind:'auxiliary'}));
 const prepared=prepareOwnPeriodClassificationFixtureProgram(prior,salaryItems([...catalog,...auxiliaries]),period);assert.equal(prepared.auxiliaryCopies,0);
 for(const patch of [{value:'101.10'},{unit:'hours'},{validUntil:'2026-10'}]){
  const changed=auxiliaries.map(r=>r.code==='8800'?{...r,...patch}:r),before=structuredClone(changed);
  assert.throws(()=>prepareOwnPeriodClassificationFixtureProgram(prior,[...catalog,...changed],period),/QA177_EXISTING_AUXILIARY_MUST_MATCH_LEGACY_DEFINITION/);
  assert.deepEqual(changed,before);
 }
});

test('the namespace transition cannot reinterpret a same-code parameter in another agreement',()=>{
 const prior=program(),catalog=definitions().map(r=>r.code==='8800'?{...r,agreementCode:'2'}:r);
 assert.throws(()=>prepareOwnPeriodClassificationFixtureProgram(prior,catalog,period),e=>e.code==='SOURCE_DEFINITION_MISSING');
});

test('a native fixture with no previous program needs only its explicit historical rule and definition',()=>{
 const prepared=prepareOwnPeriodClassificationFixtureProgram(null,[],period);assert.equal(prepared.auxiliaryCopies,0);assert.equal(prepared.items.length,1);assert.equal(prepared.program.rules.length,1);assert.equal(prepared.program.rules[0].validFrom,period);assert.equal(prepared.program.rules[0].validUntil,period);
 assert.deepEqual(prepared.program.rules[0].expression.then,{op:'literal',value:'500.22',unit:'money'});
 assert.deepEqual(ownProgramDefinition(prepared.program,prepared.items),prepared.program);
});
