import test from 'node:test';import assert from 'node:assert/strict';
import {summarizeEmployeeSourceFacts,verifiedEmployeeSourceSummary} from '../assets/grh-employee-source-facts.js';
import {localGrhReviewBytes} from '../assets/grh-backup-review.js';
import {employee,employeeFactsFixture,coordinatedEmployeeFactsFixture} from './fixtures/grh-employee-source-synthetic.js';
const encode=value=>new TextEncoder().encode(JSON.stringify(value));
test('a complete 57-row source summary keeps inactive and unassigned original references',()=>{
 const rows=Array.from({length:57},(_,n)=>employee(n+1));rows[56].sourceReferences={};rows[56].sourceFields.iddepartamento=null;
 const summary=summarizeEmployeeSourceFacts(rows);assert.equal(summary.total,57);assert.equal(summary.retainedFacts,57);
 assert.equal(summary.states.inactive.notDeclared,1);assert.equal(summary.states.inactive.total,19);
 assert.equal(summary.states.active.total,38);assert.equal(summary.liquidationIndicator.zero,29);
 assert.doesNotMatch(JSON.stringify(summary),/PRIVATE_SYNTHETIC|SUEL_12|100\.100|LEGA_12/);
});
test('original liquidates indicator distinguishes missing, NULL, blank, zero, one and other',()=>{
 const rows=[undefined,null,'','0','1',' 0 '].map((value,n)=>{const r=employee(n+1);if(value===undefined)delete r.sourceFields.NOLI_12;else r.sourceFields.NOLI_12=value;return r;});
 assert.deepEqual(summarizeEmployeeSourceFacts(rows).liquidationIndicator,{absent:1,null:1,blank:1,zero:1,one:1,other:1});
});
test('older extracts report absent evidence instead of inventing departments or payroll values',()=>{
 const s=summarizeEmployeeSourceFacts([{employment:{activeProxy:true}},{employment:{activeProxy:false}},{}]);
 assert.equal(s.missingFacts,3);assert.equal(s.states.notDeclared.total,1);assert.equal(s.liquidationIndicator.absent,3);
 const frozen=verifiedEmployeeSourceSummary(s,3);assert.throws(()=>frozen.states.active.total=8,TypeError);
});
for(const [name,change]of Object.entries({total:s=>s.total++,partition:s=>s.states.active.total++,indicator:s=>s.liquidationIndicator.one++,negative:s=>s.missingFacts=-1,nominal:s=>s.people=['PRIVATE'],label:s=>s.states.active.name='PRIVATE'}))test('source aggregate refuses '+name,()=>{
 const s=summarizeEmployeeSourceFacts([employee(1)]);change(s);assert.throws(()=>verifiedEmployeeSourceSummary(s,1));
});
for(const fixture of [employeeFactsFixture,coordinatedEmployeeFactsFixture])test('the existing local reader accepts the complete new report without upload',()=>{
 const report=fixture(),read=localGrhReviewBytes(encode(report));assert.equal(read.version,report.version);
 assert.equal(read.scope.sourcePromoted,false);assert.doesNotMatch(JSON.stringify(read),/PRIVATE_SYNTHETIC|100\.100/);
 const bad=fixture(),facts=bad.curated?.employeeSourceFacts??bad.employeeSourceFacts;facts.candidate.states.inactive.notDeclared++;
 assert.throws(()=>localGrhReviewBytes(encode(bad)));
});
test('new original-facts contract cannot be substituted for an old or partial coordinated report',()=>{
 const modern=employeeFactsFixture();modern.version='grh-curated-successor-comparison.v1';assert.throws(()=>localGrhReviewBytes(encode(modern)));
 const joint=coordinatedEmployeeFactsFixture();joint.version='grh-coordinated-successor-review.v1';assert.throws(()=>localGrhReviewBytes(encode(joint)));
});
