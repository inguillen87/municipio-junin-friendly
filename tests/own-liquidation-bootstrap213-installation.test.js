// Source/orchestration focals; no PostgreSQL or browser acceptance is inferred.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {deriveOwnLiquidationBootstrap213,composeOwnLiquidationBootstrap213Plan,installOwnLiquidationBootstrap213,assertOwnLiquidationBootstrap213Proof,OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS,OWN_LIQUIDATION_BOOTSTRAP213_SQL,OWN_LIQUIDATION_BOOTSTRAP213_ENTRIES} from '../scripts/lib/own-liquidation-bootstrap213-installation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),commit='a'.repeat(40);
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n?/g,'\n');
const source124='scripts/migrations/124-own-payroll-liquidation-decisions.sql',source176='scripts/migrations/176-own-payroll-administrative-operator.sql';
const foundations=new Map();
function foundation(letter='b',major=17){const key=letter+major;if(!foundations.has(key))foundations.set(key,buildOwnerProgramQa({major,sourceCommit:commit,read,schema:'mc_qa_fixed_092_'+letter.repeat(32),operationalPairBaseline:'published107'}));return foundations.get(key);}
const compose=(qa=foundation(),reader=read)=>composeOwnLiquidationBootstrap213Plan({foundation:qa,major:qa.major,sourceCommit:commit,read:reader});
function proof(plan,mode){return {version:'own-liquidation-bootstrap213-installation.v1',sourceCommit:commit,schema:plan.schema,mode,sourceHashes:structuredClone(plan.sourceHashes),newTables:0,newFunctions:0,adaptedFunctions:1,newCapabilities:0,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,priorStatePreserved:true,priorFingerprint:'c'.repeat(64),objectFingerprint:'d'.repeat(64)};}
function setup({alterRead,alterReply,alterSnapshot}={}){
 const qa=foundation(),reader=file=>alterRead?alterRead(file,read(file)):read(file),plan=compose(qa,reader),calls=[],phases=[],checks=[];
 let current={rows:'all old rows',iam:'same',functionEpoch:'before213'};
 const h={qa,major:qa.major,sourceCommit:commit,sourceCustody:{sourceCommit:commit},prepared:{liquidationBootstrap213:plan},
  setPhase:value=>phases.push(value),check:value=>checks.push(value),
  readFullSnapshot:()=>alterSnapshot?alterSnapshot(structuredClone(current),calls):structuredClone(current),
  json:(statements,options={})=>{
   assert.ok(statements===plan.installation||statements===plan.verification,'prepared batches must be forwarded whole');calls.push({statements,options});
   const mode=calls.length<=2?'install':'verify';if(calls.length===2)current={...current,functionEpoch:'after213'};
   const value=proof(plan,mode);return alterReply?alterReply(value,calls):value;
  }};return {h,plan,calls,phases,checks};
}

test('213 derives a whole forward bootstrap and preserves complete query/DTO/ownership without a grant',()=>{
 const plan=compose(),old=plan.original,next=plan.changed;
 assert.equal(deriveOwnLiquidationBootstrap213(old),next);
 const suffix=text=>text.slice(text.indexOf(' IF(SELECT count(*)'));
 assert.equal(suffix(next).replace('actor_ready AND nominal_ready',"ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export']) cap WHERE NOT public.action_center_context_has_capability(ctx,cap))"),suffix(old));
 assert.equal((next.match(/CREATE OR REPLACE FUNCTION /g)||[]).length,1);
 assert.equal(/\b(GRANT|REVOKE|INSERT|UPDATE|DELETE|ALTER TABLE|CREATE TABLE)\b/.test(next),false);
 assert.equal(next.includes('ctx:=public.own_liquidation_context_v1(p,true);'),true);
 assert.equal(next.includes("IF SQLERRM NOT IN('OWN_RUN_EMPLOYMENT_REQUIRED','NATIVE_SALARY_IDENTITY_CHANGED') THEN RAISE;END IF;"),true);
});

test('source metadata drift is rejected even when the old body digest is intact',()=>{
 const plan=compose();assert.throws(()=>deriveOwnLiquidationBootstrap213(plan.original.replace('RETURNS jsonb','RETURNS text')),/LIQ_BOOT213_PREIMAGE_METADATA_CHANGED/);
 assert.throws(()=>deriveOwnLiquidationBootstrap213(plan.original.replace('SECURITY DEFINER','SECURITY INVOKER')),/LIQ_BOOT213_PREIMAGE_METADATA_CHANGED/);
});

for(const [name,file]of [['historical124',source124],['context176',source176],['forward213',OWN_LIQUIDATION_BOOTSTRAP213_SQL]])test(name+' source drift fails before a prepared plan is returned',()=>{
 let changed=false;assert.throws(()=>compose(foundation(),name=>name===file?(changed=true,read(name)+'\n-- foreign delta\n'):read(name)),/LIQ_BOOT213_SOURCE_CHANGED/);assert.equal(changed,true);
});

test('normalization uses the same real QA190 foundation, keeps its map intact and derives distinct local successors',()=>{
 const first=foundation('b'),second=foundation('e'),before=structuredClone(first.hashes),plan=compose(first),other=compose(second);
 assert.strictEqual(plan.foundation,first);assert.deepEqual(first.hashes,before);
 assert.notEqual(plan.afterPin.sha256,plan.rawAfter.sha256);assert.notEqual(plan.afterPin.sha256,other.afterPin.sha256);
 assert.equal(plan.normalize(plan.rawAfter.sha256),plan.afterPin.sha256);
 assert.equal(plan.beforePin.signature,first.schema+'.own_liquidation_bootstrap_v1(jsonb)');
 assert.deepEqual(plan.prerequisites.map(pin=>[pin.name,pin.runtime]),[['own_liquidation_context_v1',false],['own_run_context_v1',false],['native_salary_administrative_context_v1',false]]);
 assert.equal(plan.beforePin.runtime,true);assert.equal(plan.afterPin.runtime,true);
 assert.equal(new Set(plan.sourceEntries).size,plan.sourceEntries.length);assert.ok(Object.keys(OWN_LIQUIDATION_BOOTSTRAP213_SOURCE_PINS).every(file=>plan.sourceEntries.includes(file)));
 assert.deepEqual(plan.sourceEntries,OWN_LIQUIDATION_BOOTSTRAP213_ENTRIES);
});

test('whole protocol rehearses ROLLBACK, commits, reads RO independently and repeats without another business effect',()=>{
 const f=setup(),result=installOwnLiquidationBootstrap213(f.h);assert.equal(result.passed,true);
 assert.deepEqual(f.calls.map(call=>call.options),[{end:'ROLLBACK',fullJson:true},{fullJson:true},{readOnly:true,fullJson:true},{fullJson:true}]);
 assert.strictEqual(f.calls[2].statements,f.plan.verification);assert.equal(f.checks.length,1);
 assert.deepEqual(f.phases,['liquidation-bootstrap213-rehearsal','liquidation-bootstrap213-installation','liquidation-bootstrap213-durable-readonly','liquidation-bootstrap213-repetition']);
 // Readback cannot invoke the writable mode/apply/advisory path.
 assert.equal(/pg_(?:try_)?advisory|\bLOCK\s|\$liq_boot213_apply\$|\bCREATE\s/.test(f.plan.verification.join('\n')),false);
});

test('a changed rehearsal snapshot prevents any COMMIT or acceptance',()=>{
 const f=setup({alterSnapshot:(state,calls)=>calls.length===1?{...state,iam:'changed'}:state});assert.throws(()=>installOwnLiquidationBootstrap213(f.h),/LIQ_BOOT213_REHEARSAL_CHANGED_STATE/);assert.equal(f.calls.length,1);assert.equal(f.checks.length,0);
});

test('durable foreign fingerprint or transport failure stops before repetition and acceptance',()=>{
 for(const transport of [false,true]){
  const f=setup({alterReply:(value,calls)=>{if(calls.length===3){if(transport)throw Error('capture persistence failed');return {...value,objectFingerprint:'e'.repeat(64)};}return value;}});
  assert.throws(()=>installOwnLiquidationBootstrap213(f.h),transport?/capture persistence failed/:/LIQ_BOOT213_DURABILITY_CHANGED/);assert.equal(f.calls.length,3);assert.equal(f.checks.length,0);
 }
});

test('proof rejects every undeclared business/security delta and foreign custody field',()=>{
 const plan=compose(),value=proof(plan,'install');assert.strictEqual(assertOwnLiquidationBootstrap213Proof(value,plan),value);
 for(const [key,replacement]of Object.entries({sourceCommit:'f'.repeat(40),schema:'foreign',mode:'unknown',newTables:1,newFunctions:1,adaptedFunctions:2,newCapabilities:1,roleAssignmentsAdded:1,existingAclChanges:1,associationWrites:1,businessWrites:1,priorStatePreserved:false,priorFingerprint:'bad',objectFingerprint:'bad',sourceHashes:{}}))assert.throws(()=>assertOwnLiquidationBootstrap213Proof({...value,[key]:replacement},plan),undefined,key);
 assert.throws(()=>assertOwnLiquidationBootstrap213Proof({...value,extra:true},plan));
});

test('unminted plan, substituted host and post-preparation source changes fail before transport',()=>{
 const cloned=setup();cloned.h.prepared.liquidationBootstrap213={...cloned.plan};assert.throws(()=>installOwnLiquidationBootstrap213(cloned.h),/LIQ_BOOT213_UNMINTED_PLAN/);assert.equal(cloned.calls.length,0);
 const host=setup();host.h.qa={...host.h.qa};assert.throws(()=>installOwnLiquidationBootstrap213(host.h));assert.equal(host.calls.length,0);
 const custody=setup();custody.h.sourceCustody.sourceCommit='f'.repeat(40);assert.throws(()=>installOwnLiquidationBootstrap213(custody.h),/LIQ_BOOT213_SOURCE_CUSTODY_REQUIRED/);assert.equal(custody.calls.length,0);
 let drift=false;const changed=setup({alterRead:(file,value)=>drift&&file===source176?value+'\n-- changed after preparation':value});drift=true;assert.throws(()=>installOwnLiquidationBootstrap213(changed.h),/LIQ_BOOT213_SOURCE_CHANGED/);assert.equal(changed.calls.length,0);
});
