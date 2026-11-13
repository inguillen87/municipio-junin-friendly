// Public synthetic regression vectors for migration239; no municipal records.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeSourceCoverageProgram,captureSourceCoverage,assertSourceCoverageEvent} from '../assets/own-payroll-source-coverage.js';
import {describeProgramPolicy} from '../assets/own-payroll-program-workspace-model.js';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/school-period-source-coverage.synthetic.json',import.meta.url)));
assert.equal(fixtures.synthetic,true);
for(const key of ['legacyProgramme','programme','november'])test('normalize '+key,()=>{
 const p=fixtures[key];assert.deepEqual(normalizeSourceCoverageProgram(p),{sourceCoverageVersion:p.sourceCoverageVersion,sourceCoveragePolicies:p.sourceCoveragePolicies});
});
for(const item of fixtures.negative)test(item.name,()=>assert.throws(()=>normalizeSourceCoverageProgram(item.programme),e=>'OWN_PROGRAM_'+e.code===item.expectedSql));
test('direct capture requires the declared period context',()=>{
 const p=structuredClone(fixtures.programme);delete p.periodContextVersion;
 const source=fixtures.empty;assert.throws(()=>captureSourceCoverage(p,{period:source.period,liquidationType:source.liquidationType,population:source.population,monthly:source.monthly}),e=>e.code==='SOURCE_COVERAGE_PERIOD_CONTEXT_REQUIRED');
});
for(const item of fixtures.eventPayloads)test(item.name,()=>{
 const payload=item.payload,p=payload.programState.program.definition;
 const capture=captureSourceCoverage(p,{period:payload.period,liquidationType:payload.liquidationType,population:payload.population,monthly:payload.monthly});
 assert.throws(()=>assertSourceCoverageEvent(capture,{agreementCode:'1',conceptCode:item.code}),e=>e.code==='SOURCE_COVERAGE_EXCLUDED_EVENT');
});
test('review exposes the own decision, quantity policy and evidence pins',()=>{
 const p=fixtures.programme,school=p.sourceCoveragePolicies[0].inventory.find(r=>r.code==='311');
 const description=describeProgramPolicy('sourceCoveragePolicies',p.sourceCoveragePolicies);
 for(const term of ['Decisión propia','sujeta a revisión','Omitir cantidad','PRE y POST','L[101]',school.basis.decisionSha256,school.basis.phaseReviewSha256])assert.ok(description.includes(term),term);
});
