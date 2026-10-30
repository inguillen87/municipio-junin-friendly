// Text candidate for tests/own-monthly-full-legacy-support.test.js.
// Transport doubles exercise orchestration and contracts, never PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {composeMonthlyFullLegacySupportPlan,installMonthlyFullLegacySupport,assertMonthlyFullLegacySupportProof} from '../scripts/lib/monthly-full-legacy-support-qa.mjs';
import {monthlyDayLegacyCompatibilityFixture,MONTHLY_DAY_LEGACY_FIXTURE_SOURCE} from '../scripts/lib/monthly-day-policy-legacy-fixture.mjs';
import {continueOwnMonthlyFullCapacity} from '../scripts/verify-own-monthly-payroll-full-capacity.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const readSource=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n?/g,'\n');
const HELPER='scripts/lib/monthly-day-policy-legacy-fixture.mjs';
const commit='a'.repeat(40),schema='mc_qa_fixed_092_'+'b'.repeat(32);
const BASELINE=Object.freeze({oldRows:'same',oldFunctions:'same',iamAssignments:'same',legacyContracts:65});

function setup(major=17){
 const reads=[],normalizations=[],phases=[],calls=[],checks=[];
 const read=file=>{reads.push(file);return readSource(file);};
 const fixture=monthlyDayLegacyCompatibilityFixture(read);
 // A caller-owned identity spy is intentional. These units check forwarding
 // of the prepared normalizer; they do not implement/retest SQL relocation.
 const normalized=value=>{normalizations.push(value);return value;};
 const foundation={schema,actor:{membershipId:'synthetic-maker'},checker:{membershipId:'synthetic-checker'}};
 const qa192={qa:foundation,schema,major,sourceCommit:commit,operationalPairBaseline:'published107',
  normalized,sourceHashes:{[MONTHLY_DAY_LEGACY_FIXTURE_SOURCE]:fixture.sourceSha256},
  legacyCompatibilitySeed:fixture.statements.map(normalized).join(';\n'),
  local:{rehearsal:['technical192-rehearsal']},batch:{}};
 const monthly={version:'own-novelty-succession-qa.v1',schema,qa192,actor:foundation.actor,checker:foundation.checker};
 const monetary={version:'own-monetary-program-qa-projection.v2',monetaryFoundationMode:'existing',qa192,
  actor:foundation.actor,checker:foundation.checker};
 const plan=composeMonthlyFullLegacySupportPlan({monthly,foundation,major,sourceCommit:commit,read});
 // These DTOs are explicit synthetic wire replies, not recorded PG evidence.
 const reply=objectFingerprint=>({version:'monthly-full-legacy-support-proof.v1',sourceCommit:commit,schema,
  helperSha256:plan.sourceHashes[HELPER],compatibilitySourceSha256:fixture.sourceSha256,
  newTables:3,emptyLegacyTables:3,capabilityDefinitionsAdded:2,conflictsAdded:1,roleAssignmentsAdded:0,businessRowsAdded:0,
  guardFunctionChanged:false,priorStatePreserved:true,priorFingerprint:'c'.repeat(64),objectFingerprint});
 const h={qa:foundation,major,sourceCommit:commit,sourceCustody:{sourceCommit:commit},
  prepared:{monthly,monetary,legacySupport:plan,sharedPrerequisites:{passed:true,sourceMetadataOnly:true,nativeExecutionProven:false}},
  setPhase:value=>phases.push(value),check:value=>checks.push(value),
  readFullSnapshot:()=>structuredClone(BASELINE),
  expectRollback:()=>assert.fail('technical protocol must not advance beyond the recording stop'),
  json:(statements,options={})=>{
   calls.push({statements,options});
   assert.strictEqual(statements,options.readOnly?plan.verification:plan.installation);
   return reply((options.end==='ROLLBACK'?'d':'e').repeat(64));
  }};
 return {read,fixture,foundation,monthly,monetary,plan,h,reply,reads,normalizations,phases,calls,checks};
}

test('one pinned six-statement fixture is forwarded, with no legacy functions or authority assignments',()=>{
 const f=setup();
 assert.strictEqual(f.plan.installation[2],f.monthly.qa192.legacyCompatibilitySeed);
 assert.equal(f.plan.installation[2],f.fixture.statements.join(';\n'));
 for(const statement of f.fixture.statements)assert.ok(f.normalizations.includes(statement));
 assert.equal(f.fixture.statements.length,6);
 assert.equal(f.fixture.statements.filter(s=>/^CREATE TABLE /.test(s)).length,3);
 assert.equal(f.fixture.statements.filter(s=>/^INSERT INTO public\.iam_capability\(/.test(s)).length,1);
 assert.equal(f.fixture.statements.filter(s=>/^INSERT INTO public\.iam_capability_conflict\(/.test(s)).length,1);
 assert.doesNotMatch(f.plan.installation[2],/CREATE (?:OR REPLACE )?FUNCTION|GRANT |CREATE ROLE|iam_role_capability|ON CONFLICT|IF NOT EXISTS/i);
 assert.ok(f.plan.sourceEntries.includes('scripts/lib/monthly-full-legacy-support-qa.mjs'));
 assert.ok(f.plan.sourceEntries.includes('tests/own-monthly-full-legacy-support.test.js'));
 assert.equal(Object.isFrozen(f.plan.sourceHashes),true);
});

test('preflight is first-only; the actual private092 guard runs in both writable batches, never durable RO',()=>{
 const {plan}=setup();
 assert.match(plan.installation[0],/MONTHLY_FULL_LEGACY_SUPPORT_ALREADY_PRESENT/);
 assert.match(plan.installation[0],/MONTHLY_FULL_LEGACY_CAPABILITY_ALREADY_PRESENT/);
 assert.match(plan.installation[0],/MONTHLY_FULL_LEGACY_CONFLICT_ALREADY_PRESENT/);
 assert.match(plan.installation[0],/LOCK TABLE .*iam_capability.*iam_capability_conflict IN SHARE ROW EXCLUSIVE MODE NOWAIT/);
 assert.equal(plan.installation[3],'SELECT '+schema+'.payroll_fixed_registry_legacy_guard_v1()');
 assert.doesNotMatch(plan.verification.join('\n'),/payroll_fixed_registry_legacy_guard_v1|LOCK TABLE|CREATE TABLE|INSERT INTO|GRANT /);
});

test('emitted shape inventories one PK and precisely two NOT NULL constraints only on PostgreSQL18',()=>{
 for(const major of [17,18]){
  const {plan}=setup(major),check=plan.verification[0];
  assert.match(plan.installation[0],new RegExp("server_version_num'\\)::integer/10000<>"+major));
  assert.match(check,/count\(\*\) FROM pg_constraint k WHERE k\.conrelid=target_oid AND k\.contype<>'n'\)<>1/);
  assert.match(check,/k\.contype='p' AND k\.convalidated AND k\.conkey=ARRAY\[1\]::smallint\[\]/);
  assert.match(check,/jsonb_agg\(to_jsonb\(k\.conkey\) ORDER BY k\.conkey\)/);
  assert.match(check,/k\.conrelid=target_oid AND k\.contype='n'/);
  assert.ok(check.includes("IS DISTINCT FROM "+(major===18?"'[[1],[2]]'::jsonb":"'[]'::jsonb")));
  assert.match(check,/NOT k\.convalidated OR NOT k\.conislocal OR k\.coninhcount<>0 OR k\.conparentid<>0 OR k\.condeferrable OR k\.condeferred/);
  assert.doesNotMatch(check,/count\(\*\) FROM pg_constraint k WHERE k\.conrelid=target_oid\)<>1/);
 }
});

test('rehearsal ROLLBACK, COMMIT and independent RO use the same plan and require durable equality',()=>{
 const f=setup(),result=installMonthlyFullLegacySupport(f.h);
 assert.deepEqual(f.calls.map(row=>row.options),[
  {end:'ROLLBACK',fullJson:true},{fullJson:true},{readOnly:true,fullJson:true}]);
 assert.deepEqual(f.phases,['monthly-full-legacy-support-rehearsal','monthly-full-legacy-support-installation','monthly-full-legacy-support-durable-readonly']);
 assert.equal(result.passed,true);assert.equal(result.newGrants,0);assert.equal(result.newRoles,0);
 assert.notEqual(result.rehearsal.objectFingerprint,result.installed.objectFingerprint);
 assert.deepEqual(result.installed,result.durable);assert.equal(f.checks.length,1);
});

test('real monthly continuation completes support admission before its first192 call',async()=>{
 const f=setup(),record=f.h.json,stop=new Error('UNIT_RECORDING_STOP_BEFORE_TECHNICAL192');
 f.h.json=(statements,options)=>{
  if(statements===f.monthly.qa192.local.rehearsal)throw stop;
  return record(statements,options);
 };
 await assert.rejects(continueOwnMonthlyFullCapacity(f.h),error=>error===stop);
 assert.deepEqual(f.calls.map(row=>row.options),[
  {end:'ROLLBACK',fullJson:true},{fullJson:true},{readOnly:true,fullJson:true}]);
 assert.deepEqual(f.phases,[
  'monthly-full-legacy-support-rehearsal','monthly-full-legacy-support-installation',
  'monthly-full-legacy-support-durable-readonly','192-installation']);
 assert.equal(f.checks.length,1);
 // Prior orchestration reaches technical192 with zero support calls: this
 // assertion is causal RED before integration, without faking192 durability.
});

test('prepared six statements cannot be replaced or silently extended',()=>{
 const f=setup();
 f.monthly.qa192.legacyCompatibilitySeed+=';\nSELECT 1';
 assert.throws(()=>composeMonthlyFullLegacySupportPlan({monthly:f.monthly,foundation:f.foundation,major:17,sourceCommit:commit,read:f.read}),/MONTHLY_FULL_LEGACY_PREPARED_SEED_CHANGED/);
 assert.equal(f.calls.length,0);
});

test('helper/verifier pins are reread before the first native effect',()=>{
 for(const target of [HELPER,MONTHLY_DAY_LEGACY_FIXTURE_SOURCE]){
  const f=setup(),base=f.read;
  const mutable={changed:false};
  const read=file=>base(file)+(mutable.changed&&file===target?'\nsource drift':'');
  f.h.prepared.legacySupport=composeMonthlyFullLegacySupportPlan({monthly:f.monthly,foundation:f.foundation,major:17,sourceCommit:commit,read});
  mutable.changed=true;
  assert.throws(()=>installMonthlyFullLegacySupport(f.h),/MONTHLY_FULL_LEGACY_SOURCE_CHANGED/);
  assert.equal(f.calls.length,0);
 }
});

test('unminted plan, a different foundation and custody mismatch are rejected before transport',()=>{
 for(const alter of [
  f=>{f.h.prepared.legacySupport={...f.plan};},
  f=>{f.h.qa={...f.foundation};},
  f=>{f.h.sourceCustody={sourceCommit:'f'.repeat(40)};}
 ]){
  const f=setup();alter(f);assert.throws(()=>installMonthlyFullLegacySupport(f.h));assert.equal(f.calls.length,0);
 }
});

test('ROLLBACK preservation mismatch prevents installation COMMIT',()=>{
 const f=setup();let snapshots=0;
 f.h.readFullSnapshot=()=>++snapshots===1?structuredClone(BASELINE):{...BASELINE,oldRows:'drift'};
 assert.throws(()=>installMonthlyFullLegacySupport(f.h),/MONTHLY_FULL_LEGACY_REHEARSAL_CHANGED_STATE/);
 assert.deepEqual(f.calls.map(row=>row.options),[{end:'ROLLBACK',fullJson:true}]);
});

test('invalid proof shape or a durable physical fingerprint mismatch cannot return admission',()=>{
 for(const mutate of [
  value=>({...value,roleAssignmentsAdded:1}),
  value=>({...value,unexpectedNativeClaim:true}),
  value=>({...value,priorFingerprint:'not-a-digest'})
 ]){
  const f=setup();
  assert.throws(()=>assertMonthlyFullLegacySupportProof(mutate(f.reply('e'.repeat(64))),f.plan));
 }
 const f=setup(),original=f.h.json;
 f.h.json=(statements,options)=>{const result=original(statements,options);return options?.readOnly?{...result,objectFingerprint:'f'.repeat(64)}:result;};
 assert.throws(()=>installMonthlyFullLegacySupport(f.h),/MONTHLY_FULL_LEGACY_DURABILITY_CHANGED/);
 assert.equal(f.checks.length,0);
});

test('a failed rehearsal is propagated once with no installation, recovery or retry',()=>{
 const f=setup(),failure=new Error('synthetic transport failure');
 f.h.json=(statements,options)=>{f.calls.push({statements,options});throw failure;};
 assert.throws(()=>installMonthlyFullLegacySupport(f.h),error=>error===failure);
 assert.equal(f.calls.length,1);assert.equal(f.checks.length,0);
});
