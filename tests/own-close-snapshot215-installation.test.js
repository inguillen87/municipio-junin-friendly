// Source/orchestration focals; no PostgreSQL or browser acceptance is inferred.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildOwnerProgramQa} from '../scripts/lib/municipal-owner-program-qa.mjs';
import {deriveOwnCloseSnapshot215,composeOwnCloseSnapshot215Plan,installOwnCloseSnapshot215,assertOwnCloseSnapshot215Proof,projectOwnCloseSnapshot215Postflight,OWN_CLOSE_SNAPSHOT215_SOURCE_PINS,OWN_CLOSE_SNAPSHOT215_SQL,OWN_CLOSE_SNAPSHOT215_ENTRIES,OWN_CLOSE_SNAPSHOT215_SUBSTITUTIONS} from '../scripts/lib/own-close-snapshot215-installation.mjs';
import {composeOwnFullCapacity190Installation} from '../scripts/lib/own-payroll-full-capacity-190-installation.mjs';
import {prepareOwnMonthlyFullCapacity} from '../scripts/verify-own-monthly-payroll-full-capacity.mjs';
import {composeOwnAnnulPreparation209On190} from '../scripts/lib/own-payroll-annulment-preparation-209-installation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),commit='a'.repeat(40);
const read=file=>fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n?/g,'\n');
const source124='scripts/migrations/125-own-payroll-close.sql',source176='scripts/migrations/143-own-payroll-jurisdiction-snapshot.sql';
const foundations=new Map();
function foundation(letter='b',major=17){const key=letter+major;if(!foundations.has(key))foundations.set(key,buildOwnerProgramQa({major,sourceCommit:commit,read,schema:'mc_qa_fixed_092_'+letter.repeat(32),operationalPairBaseline:'published107'}));return foundations.get(key);}
const compose=(qa=foundation(),reader=read)=>composeOwnCloseSnapshot215Plan({foundation:qa,major:qa.major,sourceCommit:commit,read:reader});
function proof(plan,mode){return {version:'own-close-snapshot215-installation.v1',sourceCommit:commit,schema:plan.schema,mode,sourceHashes:structuredClone(plan.sourceHashes),newTables:0,newFunctions:0,adaptedFunctions:1,newCapabilities:0,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,priorStatePreserved:true,priorFingerprint:'c'.repeat(64),objectFingerprint:'d'.repeat(64)};}
function setup({alterRead,alterReply,alterSnapshot}={}){
 const qa=foundation(),reader=file=>alterRead?alterRead(file,read(file)):read(file),plan=compose(qa,reader),calls=[],phases=[],checks=[];
 let current={rows:'all old rows',iam:'same',functionEpoch:'before215'};
 const h={qa,major:qa.major,sourceCommit:commit,sourceCustody:{sourceCommit:commit},prepared:{closeSnapshot215:plan},
  setPhase:value=>phases.push(value),check:value=>checks.push(value),
  readFullSnapshot:()=>alterSnapshot?alterSnapshot(structuredClone(current),calls):structuredClone(current),
  json:(statements,options={})=>{
   assert.ok(statements===plan.rehearsal||statements===plan.installation||statements===plan.verification,'prepared batches must be forwarded whole');calls.push({statements,options});
   const mode=calls.length<=2?'install':'verify';if(calls.length===2)current={...current,functionEpoch:'after215'};
   const value=proof(plan,mode);return alterReply?alterReply(value,calls):value;
  }};return {h,plan,calls,phases,checks};
}

test('215 preserves its whole214 predecessor, metadata, exact decimals and validation ordering',()=>{
 const plan=compose(),old=plan.original,next=plan.changed;assert.equal(deriveOwnCloseSnapshot215(old),next);
 let restored=next;for(const [before,after]of [...OWN_CLOSE_SNAPSHOT215_SUBSTITUTIONS].reverse()){assert.equal(restored.split(after).length,2);restored=restored.replace(after,()=>before);}assert.equal(restored,old);
 assert.equal(plan.rawBefore.sha256,"78a18dfddffdd72f7aab386e459e54a03b674eff105fe54fccd6633cf5dc8540");assert.equal(plan.rawAfter.sha256,"ab02d41cd331b76a1217ce04b605d1fe099891cf5d897aee3c716affe2e2cea2");
 assert.deepEqual({...plan.rawBefore,sha256:null},{...plan.rawAfter,sha256:null});assert.equal(plan.rawAfter.runtime,false);
 assert.equal(/\b(GRANT|REVOKE|INSERT|UPDATE|DELETE|ALTER TABLE|CREATE TABLE)\b/.test(next),false);
 for(const token of ['OWN_CLOSE_SELECTION_INVALID','OWN_CLOSE_DECISION_INVALID','OWN_CLOSE_CONTRACT_INVALID','OWN_CLOSE_JURISDICTION_INVALID','jurisdiction_cache','has_namespaced','scale(amount)','COLLATE "C"'])assert.ok(next.includes(token),token);
});

test('foreign predecessor body or function metadata cannot enter the forward definition',()=>{
 const old=compose().original;
 for(const next of [old.replace('RETURNS jsonb','RETURNS text'),old.replace('SECURITY DEFINER','SECURITY INVOKER'),old.replace(' IMMUTABLE ',' VOLATILE '),old.replace("concepts jsonb[]:='{}'","concepts jsonb[] := '{}'"),old+'\n-- changed'])assert.throws(()=>deriveOwnCloseSnapshot215(next));
});

for(const [name,file]of [['historical125',source124],['jurisdiction143',source176],['forward215',OWN_CLOSE_SNAPSHOT215_SQL]])test(name+' source drift fails before a prepared plan is returned',()=>{
 let changed=false;assert.throws(()=>compose(foundation(),name=>name===file?(changed=true,read(name)+'\n-- foreign delta\n'):read(name)),/CLOSE_SNAPSHOT215_SOURCE_CHANGED/);assert.equal(changed,true);
});

test('normalization uses the same real QA190 foundation, keeps its map intact and derives distinct local successors',()=>{
 const first=foundation('b'),second=foundation('e'),before=structuredClone(first.hashes),plan=compose(first),other=compose(second);
 assert.strictEqual(plan.foundation,first);assert.deepEqual(first.hashes,before);
 assert.notEqual(plan.afterPin.sha256,plan.rawAfter.sha256);assert.notEqual(plan.afterPin.sha256,other.afterPin.sha256);
 assert.equal(plan.normalize(plan.rawAfter.sha256),plan.afterPin.sha256);
 assert.equal(plan.beforePin.signature,first.schema+'.own_close_snapshot_v1(jsonb,jsonb)');
 assert.deepEqual(plan.prerequisites.map(pin=>[pin.name,pin.runtime]),[['own_close_command_capacity_core_v2',false]]);
 assert.equal(plan.beforePin.runtime,false);assert.equal(plan.afterPin.runtime,false);
 assert.equal(new Set(plan.sourceEntries).size,plan.sourceEntries.length);assert.ok(Object.keys(OWN_CLOSE_SNAPSHOT215_SOURCE_PINS).every(file=>plan.sourceEntries.includes(file)));
 assert.deepEqual(plan.sourceEntries,OWN_CLOSE_SNAPSHOT215_ENTRIES);
});

test('whole protocol rehearses ROLLBACK, commits, reads RO independently and repeats without another business effect',()=>{
 const f=setup(),result=installOwnCloseSnapshot215(f.h,f.h.prepared.closeSnapshot215);assert.equal(result.passed,true);
 assert.deepEqual(result.rehearsalEquivalence,{version:f.plan.equivalence.version,caseCount:15,positives:8,negatives:7,caseDigest:f.plan.equivalence.caseDigest,caseIds:[...f.plan.equivalence.caseIds],passed:true,oldNewEqual:true,javascriptOracleEqual:true,metadataEqual:true,omitted:0,transactionEnd:'ROLLBACK'});assert.equal(result.rehearsalEquivalence.caseCount,15);assert.equal(result.rehearsalEquivalence.positives,8);assert.equal(result.rehearsalEquivalence.negatives,7);
 assert.deepEqual(f.calls.map(call=>call.options),[{end:'ROLLBACK',fullJson:true},{fullJson:true},{readOnly:true,fullJson:true},{fullJson:true}]);
 assert.strictEqual(f.calls[0].statements,f.plan.rehearsal);assert.strictEqual(f.calls[1].statements,f.plan.installation);assert.strictEqual(f.calls[2].statements,f.plan.verification);assert.strictEqual(f.calls[3].statements,f.plan.installation);assert.equal(f.checks.length,1);
 assert.equal(f.plan.rehearsal.filter(s=>/^DO \$close215_equivalence_(?:before|after|proof)\$/.test(s)).length,3);
 for(const batch of[f.plan.installation,f.plan.verification])assert.equal(batch.some(s=>s.includes('$close215_equivalence_')),false,'The fixture battery belongs only to ROLLBACK rehearsal');
 assert.deepEqual(f.phases,['close-snapshot215-rehearsal','close-snapshot215-installation','close-snapshot215-durable-readonly','close-snapshot215-repetition']);
 // Readback cannot invoke the writable mode/apply/advisory path.
 assert.equal(/pg_(?:try_)?advisory|\bLOCK\s|\$close_snapshot215_apply\$|\bCREATE\s/.test(f.plan.verification.join('\n')),false);
});

test('a changed rehearsal snapshot prevents any COMMIT or acceptance',()=>{
 const f=setup({alterSnapshot:(state,calls)=>calls.length===1?{...state,iam:'changed'}:state});assert.throws(()=>installOwnCloseSnapshot215(f.h,f.h.prepared.closeSnapshot215),/CLOSE_SNAPSHOT215_REHEARSAL_CHANGED_STATE/);assert.equal(f.calls.length,1);assert.equal(f.checks.length,0);
});

test('durable foreign fingerprint or transport failure stops before repetition and acceptance',()=>{
 for(const transport of [false,true]){
  const f=setup({alterReply:(value,calls)=>{if(calls.length===3){if(transport)throw Error('capture persistence failed');return {...value,objectFingerprint:'e'.repeat(64)};}return value;}});
  assert.throws(()=>installOwnCloseSnapshot215(f.h,f.h.prepared.closeSnapshot215),transport?/capture persistence failed/:/CLOSE_SNAPSHOT215_DURABILITY_CHANGED/);assert.equal(f.calls.length,3);assert.equal(f.checks.length,0);
 }
});

test('proof rejects every undeclared business/security delta and foreign custody field',()=>{
 const plan=compose(),value=proof(plan,'install');assert.strictEqual(assertOwnCloseSnapshot215Proof(value,plan),value);
 for(const [key,replacement]of Object.entries({sourceCommit:'f'.repeat(40),schema:'foreign',mode:'unknown',newTables:1,newFunctions:1,adaptedFunctions:2,newCapabilities:1,roleAssignmentsAdded:1,existingAclChanges:1,associationWrites:1,businessWrites:1,priorStatePreserved:false,priorFingerprint:'bad',objectFingerprint:'bad',sourceHashes:{}}))assert.throws(()=>assertOwnCloseSnapshot215Proof({...value,[key]:replacement},plan),undefined,key);
 assert.throws(()=>assertOwnCloseSnapshot215Proof({...value,extra:true},plan));
});

test('unminted plan, substituted host and post-preparation source changes fail before transport',()=>{
 const cloned=setup();cloned.h.prepared.closeSnapshot215={...cloned.plan};assert.throws(()=>installOwnCloseSnapshot215(cloned.h,cloned.h.prepared.closeSnapshot215),/CLOSE_SNAPSHOT215_UNMINTED_PLAN/);assert.equal(cloned.calls.length,0);
 const host=setup();host.h.qa={...host.h.qa};assert.throws(()=>installOwnCloseSnapshot215(host.h,host.h.prepared.closeSnapshot215));assert.equal(host.calls.length,0);
 const custody=setup();custody.h.sourceCustody.sourceCommit='f'.repeat(40);assert.throws(()=>installOwnCloseSnapshot215(custody.h,custody.h.prepared.closeSnapshot215),/CLOSE_SNAPSHOT215_SOURCE_CUSTODY_REQUIRED/);assert.equal(custody.calls.length,0);
 let drift=false;const changed=setup({alterRead:(file,value)=>drift&&file===source176?value+'\n-- changed after preparation':value});drift=true;assert.throws(()=>installOwnCloseSnapshot215(changed.h,changed.h.prepared.closeSnapshot215),/CLOSE_SNAPSHOT215_SOURCE_CHANGED/);assert.equal(changed.calls.length,0);
});

test('post215 authority keeps the complete historical201 guard except its exact protected snapshot successor',()=>{
 const plan=compose(),h={qa:plan.foundation,sourceCommit:commit,read};
 const historical=composeOwnFullCapacity190Installation(h).postflight;
 const updated=projectOwnCloseSnapshot215Postflight(h,plan,historical);
 assert.notEqual(updated,historical);
 assert.equal(updated.split(plan.afterPin.sha256).length,2);
 assert.equal(updated.replace(plan.afterPin.sha256,plan.historicalPin.sha256),historical);
 assert.equal(historical.split(plan.historicalPin.sha256).length,2);
 for(const token of ['OWN_DECISION_CAPACITY_POST_METADATA_CHANGED','OWN_DECISION_CAPACITY_POST_ACL_CHANGED','own_annul_selected_v1','protected_dependency'])assert.equal(updated.includes(token),historical.includes(token));
});

test('post215 rejects any foreign201 guard, undeclared companion edit, or cloned successor plan',()=>{
 const plan=compose(),h={qa:plan.foundation,sourceCommit:commit,read};
 const historical=composeOwnFullCapacity190Installation(h).postflight;
 for(const foreign of [historical+'\n',historical.replace('OWN_DECISION_CAPACITY_POST_METADATA_CHANGED','OTHER_TOKEN'),historical.replace(plan.historicalPin.sha256,plan.afterPin.sha256)])assert.throws(()=>projectOwnCloseSnapshot215Postflight(h,plan,foreign),/CLOSE_SNAPSHOT215_HISTORICAL201_GUARD_CHANGED/);
 assert.throws(()=>projectOwnCloseSnapshot215Postflight(h,{...plan},historical),/CLOSE_SNAPSHOT215_UNMINTED_PLAN/);
});


// Actual canonical209 composition, no SQL transport. These observations are
// source-construction regressions, not native install/durability receipts.
let source209;
function canonical209Source(){
 if(source209)return source209;
 const qa=foundation(),calls=[];let drift=false;
 const reader=file=>read(file)+(drift&&file==='scripts/lib/own-close-snapshot215-equivalence.mjs'?'\n-- source drift after preparation':'');
 const forbidden=(...args)=>{calls.push(args);throw Error('source constructor attempted native I/O');};
 const h={qa,major:qa.major,sourceCommit:commit,read:reader,json:forbidden,check:forbidden,sourceCustody:{sourceCommit:commit}};
 const prepared=prepareOwnMonthlyFullCapacity(h);assert.strictEqual(prepared.foundation,qa);h.prepared=prepared.context;
 const capacityPlan=composeOwnFullCapacity190Installation(h),admission208={version:'own-annulment-review208-canonical-source.v1',sourceCommit:commit,monthly:h.prepared.monthly,capacityPlan};
 const installation208={version:'own-annulment-review208-canonical190-installation.v1',sourceCommit:commit,passed:true,proofs:{installed:{priorStateSha256:'b'.repeat(64)}}};
 const db={query:forbidden,run:forbidden};
 const args={h,db,admission208,installation208};
 // Cache the real prepared context before plan admission: a rejected209 plan
 //must not rebuild the same monthly source foundation for the next assertion.
 let plan;source209={args,calls,qa,capacityPlan,get plan(){return plan??=composeOwnAnnulPreparation209On190(args);},setDrift:value=>{drift=value;}};
 return source209;
}

test('all209 inherited install, verification and postflight paths retain the full201 guard with only its215 protected successor',()=>{
 const x=canonical209Source(),historical=x.capacityPlan.postflight,hashes=structuredClone(x.qa.hashes),plan215=compose(x.qa,x.args.h.read);
 const projected=projectOwnCloseSnapshot215Postflight(x.args.h,plan215,historical);
 const count=(text,needle)=>text.split(needle).length-1;
 for(const[file,digest]of Object.entries({'package.json':'9e9874bad0c978a0568818fd51688efa14731317ece39b8b4d9f1c3312f3e11e','package-lock.json':'38ae1642e218078cf2aa28fc9a811e0b50397b24265dc26ffbae0e9555a94309','api/internal-municipal-owner-salary.js':'07e0a4ee32969f51258e807e29edb6aebec89d004d20ed28f250aedfb8e26d76','src/islands/NativeSalaryCatalog.jsx':'36e7e23ff91a0b47be59f751d609e8186cada516a5406f130f0150dce5cd506e','.vercelignore':'7ec89b8bae0f3431443bc95f5afe8ba74268d70a6e58593fb9c03e0bbf9f3ef1','api/internal-municipal-owner-program.js':'32c8dabe14b958b91760f4960a1c7bee0ff3f9563c432b0f914c5be55bba29d1'}))assert.equal(x.plan.sourceHashes[file],digest,'209 retains exact inherited foundation pin '+file);
 for(const [field,expected]of [['beforeApply',1],['statements',2],['verification',1],['postflight',1]]){
  const statements=x.plan[field];assert.ok(Array.isArray(statements),field);
  const joined=statements.join(';\n');assert.equal(count(joined,projected),expected,'209 '+field+' must embed the complete projected guard');
  assert.equal(count(joined,historical),0,'209 '+field+' must not embed the stale historical guard');
 }
 assert.equal(projected.replace(plan215.afterPin.sha256,plan215.historicalPin.sha256),historical);
 assert.strictEqual(x.args.admission208.capacityPlan,x.capacityPlan);assert.equal(x.capacityPlan.postflight,historical);assert.deepEqual(x.qa.hashes,hashes);
 for(const [file,sha256]of Object.entries(OWN_CLOSE_SNAPSHOT215_SOURCE_PINS))assert.equal(x.plan.sourceHashes[file],sha256,'209 bookend includes215 source '+file);
 assert.equal(x.plan.predecessorPins.some(pin=>pin.name==='own_close_snapshot_v1'),false,'209 read closure does not call either close-command writer that owns snapshot dependency');
 const graph=x.qa.foundation.foundation.foundation.owner.graph,authority=graph.batch.authority;
 const capability=authority.prerequisitePins.find(pin=>pin.signature==='public.action_center_context_has_capability(jsonb,text)');
 assert.ok(capability);assert.equal(capability.runtime,false,'007/184 keep capability predicate private');
 assert.deepEqual(x.plan.predecessorPins.find(pin=>pin.name===capability.name),{...capability,signature:x.qa.schema+'.action_center_context_has_capability(jsonb,text)',sha256:createHash('sha256').update(x.qa.normalized(graph.pool.get(capability.signature+'|'+capability.sha256)).match(/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/)[2]).digest('hex'),config:['search_path=pg_catalog, '+x.qa.schema+', public, pg_temp']});
 assert.equal(graph.pinHints.has(capability.signature+'|'+capability.sha256),false,'209 enrichment leaves the canonical graph map unchanged');
 const privateNames=['own_run_immutable_v1','own_liquidation_immutable_v1','own_close_immutable_v1','own_annul_immutable_v1','native_salary_context_v1','payroll_fixed_registry_subject_by_contract_v1','payroll_fixed_registry_subject_v1','native_employment_change_lock_v1','native_employment_change_subject_v1','native_employment_catalog_lock_v1','grh_curated_source_read_lock_v1'];
 for(const name of privateNames){const pin=x.plan.predecessorPins.find(value=>value.name===name),source=x.plan.predecessorSources.find(value=>value.name===name);assert.ok(pin,name);assert.equal(pin.runtime,false,name);assert.ok(source.definitionSource.startsWith('scripts/migrations/'),name);assert.equal(source.aclProvenance,'complete pinned SQL REVOKE and complete final function-GRANT set',name);}
 const date=x.qa.privateDate,datePin=x.plan.predecessorPins.find(value=>value.name===date.pin.name),localDate=x.qa.normalized(date.definition);
 assert.deepEqual(datePin,{...date.pin,signature:x.qa.schema+'.payroll_fixed_registry_date_v1(text,boolean)',sha256:createHash('sha256').update(localDate.match(/\bAS\s+(\$[\w]*\$)([\s\S]*)\1\s*;?\s*$/)[2]).digest('hex'),config:['search_path=pg_catalog, '+x.qa.schema+', public, pg_temp']});
 assert.equal(datePin.defaults,'true');assert.equal(datePin.runtime,false);assert.ok(localDate.includes('required boolean DEFAULT true'));
 assert.equal(x.plan.predecessorSources.find(value=>value.name===date.pin.name).metadataKind,'private-date-default-true');
 assert.equal(graph.definitions.some(value=>value.includes('FUNCTION public.payroll_fixed_registry_date_v1(')),false,'date remains the already-installed QA190 source supplement, not a graph or seed rewrite');
 assert.deepEqual(x.calls,[]);
});

test('209 refuses a foreign or already-projected201 guard and detects later215 input drift in its existing bookend',()=>{
 const x=canonical209Source(),historical=x.capacityPlan.postflight,plan215=compose(x.qa,x.args.h.read),projected=projectOwnCloseSnapshot215Postflight(x.args.h,plan215,historical);
 for(const postflight of [historical+'\n',historical.replace('OWN_DECISION_CAPACITY_POST_METADATA_CHANGED','OTHER_TOKEN'),projected]){
  const admission208={...x.args.admission208,capacityPlan:{...x.capacityPlan,postflight}};
  assert.throws(()=>composeOwnAnnulPreparation209On190({...x.args,admission208}),/CLOSE_SNAPSHOT215_HISTORICAL201_GUARD_CHANGED/);
 }
 const graph=x.qa.foundation.foundation.foundation.owner.graph,authority=graph.batch.authority,originalHints=graph.pinHints;
 const capability=authority.prerequisitePins.find(pin=>pin.signature==='public.action_center_context_has_capability(jsonb,text)'),key=capability.signature+'|'+capability.sha256;
 assert.ok(capability);const descriptorBefore=structuredClone(capability),hintsBefore=new Map(originalHints);
 for(const contradictory of [{...capability,runtime:!capability.runtime},{...capability,volatility:'v'}]){
  graph.pinHints=new Map([...originalHints,[key,contradictory]]);
  try{assert.throws(()=>composeOwnAnnulPreparation209On190(x.args),/ANNUL209_CANONICAL_ACL_HINT_CONFLICT/);assert.deepEqual(x.calls,[]);}
  finally{graph.pinHints=originalHints;}
 }
 capability.volatility='v';
 try{assert.throws(()=>composeOwnAnnulPreparation209On190(x.args),/ANNUL209_AUTHORITY184_SOURCE_METADATA_CHANGED/);assert.deepEqual(x.calls,[]);}
 finally{Object.assign(capability,descriptorBefore);}
 assert.deepEqual(capability,descriptorBefore);assert.deepEqual(graph.pinHints,hintsBefore);assert.strictEqual(graph.pinHints,originalHints);
 const date=x.qa.privateDate,dateKey=date.pin.signature+'|'+date.pin.sha256;
 for(const changed of [{...date,pin:{...date.pin,defaults:'false'}},{...date,definition:date.definition.replace('DEFAULT true','DEFAULT false')}]){
  x.qa.privateDate=changed;
  try{assert.throws(()=>composeOwnAnnulPreparation209On190(x.args),/ANNUL209_PRIVATE_DATE_QA_SOURCE_CHANGED/);assert.deepEqual(x.calls,[]);}
  finally{x.qa.privateDate=date;}
 }
 graph.pinHints=new Map([...originalHints,[dateKey,{...date.pin,runtime:true}]]);
 try{assert.throws(()=>composeOwnAnnulPreparation209On190(x.args),/ANNUL209_PRIVATE_DATE_HINT_CONFLICT/);assert.deepEqual(x.calls,[]);}
 finally{graph.pinHints=originalHints;}
 assert.strictEqual(x.qa.privateDate,date);assert.strictEqual(graph.pinHints,originalHints);
 const sourceHashes=x.qa.sourceHashes,originalRead=x.args.h.read;let readCount=0;
 x.args.h.read=file=>{readCount++;return originalRead(file);};
 try{for(const file of['.env','src/foreign.jsx','package.json/child']){
  x.qa.sourceHashes={...sourceHashes,[file]:'c'.repeat(64)};
  assert.throws(()=>composeOwnAnnulPreparation209On190(x.args),/ANNUL208_SOURCE_PATH_REQUIRED/);
  assert.equal(readCount,0,'foreign source path rejected before reads');assert.deepEqual(x.calls,[]);
 }}finally{x.qa.sourceHashes=sourceHashes;x.args.h.read=originalRead;}
 assert.strictEqual(x.qa.sourceHashes,sourceHashes);assert.strictEqual(x.args.h.read,originalRead);
 x.setDrift(true);
 try{assert.throws(()=>x.plan.sourceBookend(),/ANNUL209_SOURCE_BOOKEND_CHANGED/);}
 finally{x.setDrift(false);}
 assert.equal(x.plan.sourceBookend().passed,true);assert.deepEqual(x.calls,[]);
});
