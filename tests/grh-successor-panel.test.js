import test from 'node:test';import assert from 'node:assert/strict';
import {successorReviewData,successorReviewTotals,reviewCutoff} from '../assets/grh-successor-review-model.js';
import {curatedReviewData,coordinatedReviewData,CURATED_REVIEW_DOMAINS} from '../assets/grh-curated-review-model.js';
import {successorFixture,curatedFixture,coordinatedFixture} from './fixtures/grh-successor-panel-synthetic.js';
const rejected=(factory,validate,change)=>{const input=factory();change(input);assert.throws(()=>validate(input),error=>error.name==='Error'&&error.message.includes('contrato de revisión local')&&!error.message.includes('PRIVATE_VALUE'));};
test('successor panel contract retains exact record totals and multiple assignments without summing people',()=>{
 const source=successorFixture(),original=structuredClone(source),parsed=successorReviewData(source);assert.deepEqual(source,original);
 assert.deepEqual(successorReviewTotals(parsed),{before:31n,after:35n,added:5n,removed:1n,changed:5n,unchanged:25n,rawEvidenceChanged:10n,evidenceOnlyChanges:5n});
 assert.equal(parsed.entities.payrollSnapshot.after,4);assert.equal(parsed.entities.payrollSnapshot.contracts.after,3);
 assert.equal(parsed.entities.payrollSnapshot.evidenceOnlyChanges,3);assert.equal(parsed.entities.payrollSnapshot.changed,0);
 assert.equal(parsed.runEvidence.candidate.latestClosedByType.M,'2026-08-31');assert.equal(parsed.runEvidence.candidate.latestClosedByType.V,'2026-09-30');
 assert.equal(parsed.publication.ready,false);assert.equal(parsed.scope.sourcePromoted,false);assert.equal(Object.isFrozen(parsed.entities.payrollSnapshot.contracts),true);
});
const mutations={
 'unknown field':v=>v.privateName='PRIVATE_VALUE','nominal rows':v=>v.entities.payrollMonthly.rows=[{name:'PRIVATE_VALUE'}],
 'missing artifact':v=>delete v.entities.movements,'unknown schema':v=>v.version='grh-successor-comparison.v2',
 'partial comparison':v=>v.comparisonComplete=false,'false publication authority':v=>v.publication.ready=true,
 'legacy writer enabled':v=>v.publication.legacyImporterCompatible=true,'native operations falsely compared':v=>v.scope.nativeOperationsCompared=true,
 'curated scope falsely complete':v=>v.scope.curatedEntitiesCompared=true,'salary values admitted':v=>v.scope.containsSalaryAmounts=true,
 'string count':v=>v.entities.movements.before='12','negative count':v=>v.entities.movements.before=-1,
 'unsafe count':v=>v.entities.movements.before=Number.MAX_SAFE_INTEGER+1,'inconsistent count':v=>v.entities.movements.after++,
 'double counted evidence':v=>v.entities.payrollSnapshot.rawEvidenceChanged++,'excess evidence':v=>v.entities.payrollSnapshot.evidenceOnlyChanges=99,
 'unknown changed field':v=>v.entities.payrollMonthly.changedFields.privateSalary=1,'field count too high':v=>v.entities.payrollMonthly.changedFields.net=99,
 'missing changed fields':v=>v.entities.payrollMonthly.changedFields={},'spurious changed field':v=>v.entities.payrollSnapshot.changedFields.role_name=1,
 'equal changed fingerprints':v=>v.entities.payrollMonthly.candidateProjectionSha256=v.entities.payrollMonthly.baselineProjectionSha256,
 'unequal unchanged fingerprints':v=>v.entities.payrollSnapshot.added=0,'bad fingerprint':v=>v.entities.movements.candidateProjectionSha256='PRIVATE_VALUE',
 'contract count exceeds assignments':v=>v.entities.payrollSnapshot.contracts.after=5,
 'duplicate-contract evidence without surplus assignment':v=>v.entities.payrollSnapshot.contracts.after=4,
 'missing multi-assignment count':v=>delete v.entities.payrollSnapshot.contracts.afterWithMultipleAssignments,
 'duplicate run':v=>v.runEvidence.candidate.currentRuns.push(structuredClone(v.runEvidence.candidate.currentRuns[0])),
 'closed run without matching last closure':v=>v.runEvidence.candidate.latestClosedByType.V='2026-08-31',
 'future closure':v=>v.runEvidence.candidate.latestClosedByType.M='2026-10-31',
 'invalid calendar date':v=>v.runEvidence.candidate.currentRuns[0].payrollDate='2026-02-30',
 'mixed current payroll dates':v=>v.runEvidence.candidate.currentRuns[0].payrollDate='2026-09-29',
 'unrecognized closure':v=>v.runEvidence.candidate.currentRuns[0].closureStatus='approved',
 'unsupported type':v=>v.runEvidence.candidate.currentRuns[0].payrollType='PRIVATE_VALUE',
 'run contains personal data':v=>v.runEvidence.candidate.currentRuns[0].name='PRIVATE_VALUE',
 'zero month':v=>v.runEvidence.candidate.currentRuns[0].month=0,
 'unbounded run list':v=>v.runEvidence.candidate.currentRuns=Array(33).fill(v.runEvidence.candidate.currentRuns[0]),
 'invalid leap date':v=>{v.candidate.sourceCutoff='2026-02-29T15:00:00';v.candidate.profileId='grh-junin-2026-02-29';},
 'profile/cutoff mismatch':v=>v.candidate.profileId='grh-junin-2026-09-23',
 'same source disguised as successor':v=>v.candidate.sourceSha256=v.baseline.sourceSha256,
 'same manifest':v=>v.candidate.manifestSha256=v.baseline.manifestSha256,
 'generated timestamp without zone':v=>v.generatedAt='2026-09-24T02:00:00',
 'altered methodology':v=>v.methodology.sourceIdRotationIsNotDismissal=false,
 'missing publication prerequisite':v=>v.publication.required.pop(),
 'SQL query falsely executed':v=>v.scope.databaseQueries=1
};
for(const [name,change]of Object.entries(mutations))test('rejects '+name,()=>rejected(successorFixture,successorReviewData,change));
test('hash letter casing normalizes while source periods remain literal',()=>{
 const v=successorFixture();v.entities.payrollSnapshot.baselineProjectionSha256='A'.repeat(64);v.entities.payrollSnapshot.candidateProjectionSha256='B'.repeat(64);
 v.baseline.sourceSha256='F'.repeat(64);v.runEvidence.candidate.currentRuns[0].period=26;
 const parsed=successorReviewData(v);assert.equal(parsed.baseline.sourceSha256,'f'.repeat(64));assert.equal(parsed.runEvidence.candidate.currentRuns[0].period,26);
});
test('unknown latest monthly closure is not synthesized from vacation closure',()=>{
 const v=successorFixture();delete v.runEvidence.candidate.latestClosedByType.M;assert.equal(successorReviewData(v).runEvidence.candidate.latestClosedByType.M,undefined);
});
test('curated report requires all fifteen distinct artifact summaries and publishes no nominal data',()=>{
 const value=curatedFixture(),parsed=curatedReviewData(value);assert.equal(Object.keys(parsed.artifacts).length,15);
 assert.deepEqual(Object.keys(parsed.artifacts),CURATED_REVIEW_DOMAINS);assert.equal(parsed.scope.containsPersonalRecords,false);
 assert.equal(parsed.scope.sourcePromoted,false);assert.equal(Object.isFrozen(parsed.artifacts.familyMembers.changedFields),true);
});
for(const [name,change]of Object.entries({
 'missing family artifact':v=>delete v.artifacts.familyMembers,
 'inconsistent employee count':v=>v.artifacts.employees.before=10,
 'nominal values':v=>v.artifacts.employees.rows=[{name:'PRIVATE_VALUE'}],
 'unknown changed field':v=>v.artifacts.employees.changedFields.secret=1,
 'invalid artifact bytes':v=>v.artifacts.absences.candidateBytes=100000000,
 'falsely compared native operations':v=>v.scope.nativeOperationsCompared=true,
 'same source':v=>v.candidate.sourceSha256=v.baseline.sourceSha256,
 'published source':v=>v.scope.sourcePromoted=true,
 'extra artifact':v=>v.artifacts.other=structuredClone(v.artifacts.employees)
}))test('curated contract rejects '+name,()=>rejected(curatedFixture,curatedReviewData,change));
test('coordinated report binds curated and salary reports to exactly the same two source dumps',()=>{
 const value=coordinatedFixture(),parsed=coordinatedReviewData(value);assert.equal(parsed.scope.sourcePromoted,false);
 assert.equal(parsed.scope.coreArtifactsReread,false);assert.equal(parsed.scope.curatedArtifactsRead,true);assert.equal(parsed.scope.canonicalCompared,false);
 assert.equal(parsed.core.candidate.sourceSha256,parsed.curated.candidate.sourceSha256);
});
for(const [name,change]of Object.entries({
 'different candidate dump':v=>v.curated.candidate.sourceSha256='7'.repeat(64),
 'different baseline dump':v=>v.curated.baseline.sourceSha256='8'.repeat(64),
 'different cutoff':v=>v.curated.candidate.sourceCutoff='2026-09-22T15:17:00',
 'unchecked core reread claim':v=>v.scope.coreArtifactsReread=true,
 'extra raw records':v=>v.rawRecords=[{name:'PRIVATE_VALUE'}]
}))test('coordinated contract rejects '+name,()=>rejected(coordinatedFixture,coordinatedReviewData,change));
