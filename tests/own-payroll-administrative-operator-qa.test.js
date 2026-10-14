import test from 'node:test';import assert from 'node:assert/strict';
import {ownAdministrativeOperatorCoverage,ownAdministrativeOperatorQaOptions,assertOwnAdministrativeOperatorCiSource,ownAdministrativeAdoptedFixtureDeclarations,assertOwnAdministrativePendingCapture,OWN_ADMIN_OPERATOR_REQUIRED_CHECKS} from '../scripts/lib/own-payroll-administrative-operator-qa.mjs';
import {capture,saved} from './fixtures/own-payroll-run-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';

test('administrative QA only accepts the existing loopback synthetic protocol and immutable source',()=>{
 const o={major:17,sourceCommit:'a'.repeat(40),output:'verification/own-admin-operator-pg17'};assert.deepEqual(ownAdministrativeOperatorQaOptions(o),{...o,transport:'local',browser:'none'});
 assert.deepEqual(ownAdministrativeOperatorQaOptions({...o,transport:'ci'}),{...o,transport:'ci',browser:'none'});
 for(const extra of[{transport:'remote'},{major:16},{databaseUrl:'postgres://localhost/prod'},{host:'prod.example'},{actorPersonId:'invented'},{skipIdentity:true},{output:'.handoff/private'},{output:'verification/../prod'},{sourceCommit:'HEAD'},{browser:'chromium'}])assert.throws(()=>ownAdministrativeOperatorQaOptions({...o,...extra}));
});
test('CI requires its exact immutable source before the verifier delegates or connects',async()=>{
 const o=ownAdministrativeOperatorQaOptions({major:17,transport:'ci',sourceCommit:'a'.repeat(40),output:'verification/own-admin-operator-pg17'});
 assert.equal(assertOwnAdministrativeOperatorCiSource(o,{GITHUB_SHA:o.sourceCommit}),o);
 for(const env of[{}, {GITHUB_SHA:'HEAD'}, {GITHUB_SHA:'b'.repeat(40)}])assert.throws(()=>assertOwnAdministrativeOperatorCiSource(o,env),/OWN_ADMIN_OPERATOR_QA_CI_SOURCE/);
 assert.doesNotThrow(()=>assertOwnAdministrativeOperatorCiSource({...o,transport:'local'},{}));
 const {verifyOwnPayrollAdministrativeOperator}=await import('../scripts/verify-own-payroll-administrative-operator.mjs');
 await assert.rejects(()=>verifyOwnPayrollAdministrativeOperator({major:o.major,transport:o.transport,output:o.output,sourceCommit:process.env.GITHUB_SHA==='b'.repeat(40)?'c'.repeat(40):'b'.repeat(40)}),/OWN_ADMIN_OPERATOR_QA_CI_SOURCE/);
});
test('helper mock or partial scenario list never turns administrative identity into verified payroll',()=>{
 const partial=ownAdministrativeOperatorCoverage(['activeActor','historicalActorNullEmployment']);assert.equal(partial.ok,false);assert.equal(partial.state,'draft');assert.ok(partial.pending.includes('adoptedEmployees'));assert.ok(partial.pending.includes('closedGroups'));assert.ok(partial.pending.includes('fullLargeFinalizer'));
 assert.ok(partial.pending.includes('unverifiedActorAttemptRejected'));assert.ok(partial.pending.includes('historicalAuthority'));assert.ok(!OWN_ADMIN_OPERATOR_REQUIRED_CHECKS.includes('oldNullActorAttemptRejected'));
 for(const omitted of OWN_ADMIN_OPERATOR_REQUIRED_CHECKS){const r=ownAdministrativeOperatorCoverage(OWN_ADMIN_OPERATOR_REQUIRED_CHECKS.filter(x=>x!==omitted));assert.equal(r.ok,false);assert.deepEqual(r.pending,[omitted]);}
 assert.throws(()=>ownAdministrativeOperatorCoverage(['helperMock']));assert.throws(()=>ownAdministrativeOperatorCoverage(['activeActor','activeActor']));
 const complete=ownAdministrativeOperatorCoverage([...OWN_ADMIN_OPERATOR_REQUIRED_CHECKS]);assert.equal(complete.ok,true);assert.equal(complete.state,'verified');assert.deepEqual(complete.pending,[]);
});
test('closed-group rejection must conserve the original pending capture and all frozen bytes',()=>{
 const original=capture();assert.doesNotThrow(()=>assertOwnAdministrativePendingCapture(original,{...structuredClone(original),replayed:true}));
 for(const change of[
  {key:'00000000-0000-4000-8000-000000000077'},
  {id:'00000000-0000-4000-8000-000000000078'},
  {algorithmSha256:'f'.repeat(64)},
  {createdAt:'2026-10-06T10:00:00Z'},
  {saved:saved(original)},
  {body:{...original.body,period:'2026-11'},bodySha256:ownRunHash({...original.body,period:'2026-11'})},
  {payload:{...original.payload,sourceInventory:{populationDomain:'native_registered',changed:true}},payloadSha256:ownRunHash({...original.payload,sourceInventory:{populationDomain:'native_registered',changed:true}})},
 ])assert.throws(()=>assertOwnAdministrativePendingCapture(original,{...structuredClone(original),...change}));
});
test('adopted QA declarations are complete typed facts validated by the existing municipal models',()=>{
 const d=ownAdministrativeAdoptedFixtureDeclarations('2026-11');assert.equal(d.workingTime.dailyHours,'7.50000001');assert.equal(d.workingTime.monthlyHours,'160.250');assert.equal(d.participation.recognizedUnits,'1');assert.equal(d.participation.baseUnits,'1');assert.equal(d.seniority.years,'0');assert.equal(d.seniority.months,'0');assert.equal(d.salaryConditions.title.code,'0056');assert.equal(d.salaryConditions.title.percentage,'12.00000001');assert.equal(d.salaryConditions.unhealthyWork,false);
 assert.ok(Object.values(d).every(v=>v.asOfDate==='2026-11-01'&&v.documentReference.includes('exclusivamente sintética')));d.salaryConditions.title.code='9999';assert.equal(ownAdministrativeAdoptedFixtureDeclarations('2026-11').salaryConditions.title.code,'0056');assert.throws(()=>ownAdministrativeAdoptedFixtureDeclarations('2026-13'));
});
