import test from 'node:test';
import assert from 'node:assert/strict';
import {compareCuratedArtifact} from '../scripts/lib/grh-curated-comparison.mjs';

import {employee} from './fixtures/grh-employee-source-synthetic.js';

test('all 57 source rows retain the new original facts in complete comparison',()=>{
 const candidate=Array.from({length:57},(_,n)=>employee(n+1));
 const baseline=candidate.map(({sourceFields,sourceProvenance,sourceReferences,...old})=>old);
 const r=compareCuratedArtifact('employees',baseline,candidate);
 assert.equal(r.before,57);assert.equal(r.after,57);assert.equal(r.changed,57);
 assert.deepEqual(r.changedFields,{sourceFields:57,sourceProvenance:57,sourceReferences:57});
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SYNTHETIC|100\.100|LEGA_12|documentNumber/);
});
test('original fields compare without collapsing NULL, absent, blank, padded or decimal values',()=>{
 const row=employee('0007');
 for(const [a,b]of [[null,''],['','0'],['0',' 0 '],['100.100000000000000001','100.100000000000000002']]){
  const before=structuredClone(row),after=structuredClone(row);before.sourceFields.SUEL_12=a;after.sourceFields.SUEL_12=b;
  assert.equal(compareCuratedArtifact('employees',[before],[after]).changed,1);
 }
 const absent=structuredClone(row);delete absent.sourceFields.NOLI_12;
 const nil=structuredClone(absent);nil.sourceFields.NOLI_12=null;
 assert.equal(compareCuratedArtifact('employees',[absent],[nil]).changed,1);
});
test('same metadata is independent of source row ordering without renumbering',()=>{
 const rows=[employee('0007'),employee('7'),employee('A-7')];
 const r=compareCuratedArtifact('employees',rows,[...rows].reverse());
 assert.equal(r.unchanged,3);assert.equal(r.baselineProjectionSha256,r.candidateProjectionSha256);
});
for(const [name,change]of Object.entries({
 partial:r=>delete r.sourceProvenance,
 otherTable:r=>r.sourceProvenance.table='persona',
 foreignEmployee:r=>r.sourceProvenance.primaryKey.LEGA_12='999',
 foreignCompany:r=>r.sourceProvenance.primaryKey.CODI_01='102',
 foreignDepartment:r=>r.sourceReferences.department.primaryKey.iddepartamento='other',
 unexpectedReference:r=>r.sourceReferences.extra={},
 nominalField:r=>r.sourceFields.DNI='PRIVATE_SYNTHETIC_ID',
 guessedEligibility:r=>r.sourceFields.payrollEligible=true,
 coercedNumber:r=>r.sourceFields.NOLI_12=0,
 invalidState:r=>r.employment.activeProxy='true'
}))test('original employee evidence refuses '+name+' before producing a report',()=>{
 const row=employee(1);change(row);
 assert.throws(()=>compareCuratedArtifact('employees',[],[row]),e=>e.code==='GRH_CURATED_REVIEW_EMPLOYEE_FACTS_INVALID');
});
