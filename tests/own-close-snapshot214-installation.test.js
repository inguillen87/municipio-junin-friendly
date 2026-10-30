// Source/orchestration focals; no PostgreSQL or browser acceptance is inferred.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {deriveOwnCloseSnapshot214,composeOwnCloseSnapshot214Plan,installOwnCloseSnapshot214,assertOwnCloseSnapshot214Proof,projectOwnCloseSnapshot214Postflight,OWN_CLOSE_SNAPSHOT214_SOURCE_PINS,OWN_CLOSE_SNAPSHOT214_SQL,OWN_CLOSE_SNAPSHOT214_ENTRIES} from '../scripts/lib/own-close-snapshot214-installation.mjs';
import {composeOwnFullCapacity190Installation} from '../scripts/lib/own-payroll-full-capacity-190-installation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),commit='a'.repeat(40);
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n?/g,'\n');
const source124='scripts/migrations/125-own-payroll-close.sql',source176='scripts/migrations/143-own-payroll-jurisdiction-snapshot.sql';
const foundations=new Map();
function foundation(letter='b',major=17){const key=letter+major;if(!foundations.has(key))foundations.set(key,buildOwnerProgramQa({major,sourceCommit:commit,read,schema:'mc_qa_fixed_092_'+letter.repeat(32),operationalPairBaseline:'published107'}));return foundations.get(key);}
const compose=(qa=foundation(),reader=read)=>composeOwnCloseSnapshot214Plan({foundation:qa,major:qa.major,sourceCommit:commit,read:reader});
function proof(plan,mode){return {version:'own-close-snapshot214-installation.v1',sourceCommit:commit,schema:plan.schema,mode,sourceHashes:structuredClone(plan.sourceHashes),newTables:0,newFunctions:0,adaptedFunctions:1,newCapabilities:0,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,priorStatePreserved:true,priorFingerprint:'c'.repeat(64),objectFingerprint:'d'.repeat(64)};}
function setup({alterRead,alterReply,alterSnapshot}={}){
 const qa=foundation(),reader=file=>alterRead?alterRead(file,read(file)):read(file),plan=compose(qa,reader),calls=[],phases=[],checks=[];
 let current={rows:'all old rows',iam:'same',functionEpoch:'before214'};
 const h={qa,major:qa.major,sourceCommit:commit,sourceCustody:{sourceCommit:commit},prepared:{closeSnapshot214:plan},
  setPhase:value=>phases.push(value),check:value=>checks.push(value),
  readFullSnapshot:()=>alterSnapshot?alterSnapshot(structuredClone(current),calls):structuredClone(current),
  json:(statements,options={})=>{
   assert.ok(statements===plan.rehearsal||statements===plan.installation||statements===plan.verification,'prepared batches must be forwarded whole');calls.push({statements,options});
   const mode=calls.length<=2?'install':'verify';if(calls.length===2)current={...current,functionEpoch:'after214'};
   const value=proof(plan,mode);return alterReply?alterReply(value,calls):value;
  }};return {h,plan,calls,phases,checks};
}

test('214 preserves the whole predecessor with only three finite concept collection substitutions',()=>{
 const plan=compose(),old=plan.original,next=plan.changed;assert.equal(deriveOwnCloseSnapshot214(old),next);
 let restored=next;for(const [before,after]of [["'concepts',concepts,'conceptCount',jsonb_array_length(concepts)","'concepts',to_jsonb(concepts),'conceptCount',cardinality(concepts)"],["concepts:=concepts||jsonb_build_array(concept)","concepts:=array_append(concepts,concept)"],["concepts jsonb:='[]'","concepts jsonb[]:='{}'"]]){assert.equal(restored.split(after).length,2);restored=restored.replace(after,()=>before);}assert.equal(restored,old);
 assert.equal(plan.rawBefore.sha256,"11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0");assert.equal(plan.rawAfter.sha256,"78a18dfddffdd72f7aab386e459e54a03b674eff105fe54fccd6633cf5dc8540");
 assert.deepEqual({...plan.rawBefore,sha256:null},{...plan.rawAfter,sha256:null});assert.equal(plan.rawAfter.runtime,false);
 assert.equal(/\b(GRANT|REVOKE|INSERT|UPDATE|DELETE|ALTER TABLE|CREATE TABLE)\b/.test(next),false);
 for(const token of ['OWN_CLOSE_SELECTION_INVALID','OWN_CLOSE_DECISION_INVALID','OWN_CLOSE_CONTRACT_INVALID','OWN_CLOSE_JURISDICTION_INVALID','jurisdiction_cache','has_namespaced','scale(amount)','COLLATE "C"'])assert.ok(next.includes(token),token);
});

test('foreign predecessor body or function metadata cannot enter the forward definition',()=>{
 const old=compose().original;
 for(const next of [old.replace('RETURNS jsonb','RETURNS text'),old.replace('SECURITY DEFINER','SECURITY INVOKER'),old.replace(' IMMUTABLE ',' VOLATILE '),old.replace('concepts jsonb:=','concepts jsonb :='),old+'\n-- changed'])assert.throws(()=>deriveOwnCloseSnapshot214(next));
});

for(const [name,file]of [['historical125',source124],['jurisdiction143',source176],['forward214',OWN_CLOSE_SNAPSHOT214_SQL]])test(name+' source drift fails before a prepared plan is returned',()=>{
 let changed=false;assert.throws(()=>compose(foundation(),name=>name===file?(changed=true,read(name)+'\n-- foreign delta\n'):read(name)),/CLOSE_SNAPSHOT214_SOURCE_CHANGED/);assert.equal(changed,true);
});

test('normalization uses the same real QA190 foundation, keeps its map intact and derives distinct local successors',()=>{
 const first=foundation('b'),second=foundation('e'),before=structuredClone(first.hashes),plan=compose(first),other=compose(second);
 assert.strictEqual(plan.foundation,first);assert.deepEqual(first.hashes,before);
 assert.notEqual(plan.afterPin.sha256,plan.rawAfter.sha256);assert.notEqual(plan.afterPin.sha256,other.afterPin.sha256);
 assert.equal(plan.normalize(plan.rawAfter.sha256),plan.afterPin.sha256);
 assert.equal(plan.beforePin.signature,first.schema+'.own_close_snapshot_v1(jsonb,jsonb)');
 assert.deepEqual(plan.prerequisites.map(pin=>[pin.name,pin.runtime]),[['own_close_command_capacity_core_v2',false]]);
 assert.equal(plan.beforePin.runtime,false);assert.equal(plan.afterPin.runtime,false);
 assert.equal(new Set(plan.sourceEntries).size,plan.sourceEntries.length);assert.ok(Object.keys(OWN_CLOSE_SNAPSHOT214_SOURCE_PINS).every(file=>plan.sourceEntries.includes(file)));
 assert.deepEqual(plan.sourceEntries,OWN_CLOSE_SNAPSHOT214_ENTRIES);
});

test('whole protocol rehearses ROLLBACK, commits, reads RO independently and repeats without another business effect',()=>{
 const f=setup(),result=installOwnCloseSnapshot214(f.h,f.h.prepared.closeSnapshot214);assert.equal(result.passed,true);
 assert.deepEqual(result.rehearsalEquivalence,{version:f.plan.equivalence.version,caseCount:14,positives:7,negatives:7,caseDigest:f.plan.equivalence.caseDigest,caseIds:[...f.plan.equivalence.caseIds],passed:true,oldNewEqual:true,javascriptOracleEqual:true,metadataEqual:true,omitted:0,transactionEnd:'ROLLBACK'});assert.equal(result.rehearsalEquivalence.caseCount,14);assert.equal(result.rehearsalEquivalence.positives,7);assert.equal(result.rehearsalEquivalence.negatives,7);
 assert.deepEqual(f.calls.map(call=>call.options),[{end:'ROLLBACK',fullJson:true},{fullJson:true},{readOnly:true,fullJson:true},{fullJson:true}]);
 assert.strictEqual(f.calls[0].statements,f.plan.rehearsal);assert.strictEqual(f.calls[1].statements,f.plan.installation);assert.strictEqual(f.calls[2].statements,f.plan.verification);assert.strictEqual(f.calls[3].statements,f.plan.installation);assert.equal(f.checks.length,1);
 assert.equal(f.plan.rehearsal.filter(s=>/^DO \$close214_equivalence_(?:before|after|proof)\$/.test(s)).length,3);
 for(const batch of[f.plan.installation,f.plan.verification])assert.equal(batch.some(s=>s.includes('$close214_equivalence_')),false,'The fixture battery belongs only to ROLLBACK rehearsal');
 assert.deepEqual(f.phases,['close-snapshot214-rehearsal','close-snapshot214-installation','close-snapshot214-durable-readonly','close-snapshot214-repetition']);
 // Readback cannot invoke the writable mode/apply/advisory path.
 assert.equal(/pg_(?:try_)?advisory|\bLOCK\s|\$close_snapshot214_apply\$|\bCREATE\s/.test(f.plan.verification.join('\n')),false);
});

test('a changed rehearsal snapshot prevents any COMMIT or acceptance',()=>{
 const f=setup({alterSnapshot:(state,calls)=>calls.length===1?{...state,iam:'changed'}:state});assert.throws(()=>installOwnCloseSnapshot214(f.h,f.h.prepared.closeSnapshot214),/CLOSE_SNAPSHOT214_REHEARSAL_CHANGED_STATE/);assert.equal(f.calls.length,1);assert.equal(f.checks.length,0);
});

test('durable foreign fingerprint or transport failure stops before repetition and acceptance',()=>{
 for(const transport of [false,true]){
  const f=setup({alterReply:(value,calls)=>{if(calls.length===3){if(transport)throw Error('capture persistence failed');return {...value,objectFingerprint:'e'.repeat(64)};}return value;}});
  assert.throws(()=>installOwnCloseSnapshot214(f.h,f.h.prepared.closeSnapshot214),transport?/capture persistence failed/:/CLOSE_SNAPSHOT214_DURABILITY_CHANGED/);assert.equal(f.calls.length,3);assert.equal(f.checks.length,0);
 }
});

test('proof rejects every undeclared business/security delta and foreign custody field',()=>{
 const plan=compose(),value=proof(plan,'install');assert.strictEqual(assertOwnCloseSnapshot214Proof(value,plan),value);
 for(const [key,replacement]of Object.entries({sourceCommit:'f'.repeat(40),schema:'foreign',mode:'unknown',newTables:1,newFunctions:1,adaptedFunctions:2,newCapabilities:1,roleAssignmentsAdded:1,existingAclChanges:1,associationWrites:1,businessWrites:1,priorStatePreserved:false,priorFingerprint:'bad',objectFingerprint:'bad',sourceHashes:{}}))assert.throws(()=>assertOwnCloseSnapshot214Proof({...value,[key]:replacement},plan),undefined,key);
 assert.throws(()=>assertOwnCloseSnapshot214Proof({...value,extra:true},plan));
});

test('unminted plan, substituted host and post-preparation source changes fail before transport',()=>{
 const cloned=setup();cloned.h.prepared.closeSnapshot214={...cloned.plan};assert.throws(()=>installOwnCloseSnapshot214(cloned.h,cloned.h.prepared.closeSnapshot214),/CLOSE_SNAPSHOT214_UNMINTED_PLAN/);assert.equal(cloned.calls.length,0);
 const host=setup();host.h.qa={...host.h.qa};assert.throws(()=>installOwnCloseSnapshot214(host.h,host.h.prepared.closeSnapshot214));assert.equal(host.calls.length,0);
 const custody=setup();custody.h.sourceCustody.sourceCommit='f'.repeat(40);assert.throws(()=>installOwnCloseSnapshot214(custody.h,custody.h.prepared.closeSnapshot214),/CLOSE_SNAPSHOT214_SOURCE_CUSTODY_REQUIRED/);assert.equal(custody.calls.length,0);
 let drift=false;const changed=setup({alterRead:(file,value)=>drift&&file===source176?value+'\n-- changed after preparation':value});drift=true;assert.throws(()=>installOwnCloseSnapshot214(changed.h,changed.h.prepared.closeSnapshot214),/CLOSE_SNAPSHOT214_SOURCE_CHANGED/);assert.equal(changed.calls.length,0);
});

test('post214 authority keeps the complete historical201 guard except its exact protected snapshot successor',()=>{
 const plan=compose(),h={qa:plan.foundation,sourceCommit:commit,read};
 const historical=composeOwnFullCapacity190Installation(h).postflight;
 const updated=projectOwnCloseSnapshot214Postflight(h,plan,historical);
 assert.notEqual(updated,historical);
 assert.equal(updated.split(plan.afterPin.sha256).length,2);
 assert.equal(updated.replace(plan.afterPin.sha256,plan.beforePin.sha256),historical);
 assert.equal(historical.split(plan.beforePin.sha256).length,2);
 for(const token of ['OWN_DECISION_CAPACITY_POST_METADATA_CHANGED','OWN_DECISION_CAPACITY_POST_ACL_CHANGED','own_annul_selected_v1','protected_dependency'])assert.equal(updated.includes(token),historical.includes(token));
});

test('post214 rejects any foreign201 guard, undeclared companion edit, or cloned successor plan',()=>{
 const plan=compose(),h={qa:plan.foundation,sourceCommit:commit,read};
 const historical=composeOwnFullCapacity190Installation(h).postflight;
 for(const foreign of [historical+'\n',historical.replace('OWN_DECISION_CAPACITY_POST_METADATA_CHANGED','OTHER_TOKEN'),historical.replace(plan.beforePin.sha256,plan.afterPin.sha256)])assert.throws(()=>projectOwnCloseSnapshot214Postflight(h,plan,foreign),/CLOSE_SNAPSHOT214_HISTORICAL201_GUARD_CHANGED/);
 assert.throws(()=>projectOwnCloseSnapshot214Postflight(h,{...plan},historical),/CLOSE_SNAPSHOT214_UNMINTED_PLAN/);
});
