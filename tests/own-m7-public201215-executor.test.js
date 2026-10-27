// Unit transport DTOs below are synthetic and never evidence of native SQL.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {composeOwnM7PublicSchemaBatch,ownM7SourcePhaseContract,OWN_M7_STAGE_IDS,OWN_M7_REHEARSAL_CODE} from '../scripts/lib/own-m7-public-schema-batch.mjs';
import {executeOwnM7Stage} from '../scripts/install-own-m7-schema-batch.mjs';
import {ownM7CommittedSourceClosure,OWN_M7_SOURCE_REVIEW_ENTRIES} from '../scripts/prepare-own-m7-schema-batch-installation.mjs';
import {createRecordingSourceReader} from '../scripts/lib/owner-qa-source-closure-reader.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
let sourceBatch;
const actualBatch=()=>sourceBatch??=composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline:'published107'});
test('public201 follows the same census200 and successors retain their own exact target and full201 epoch',()=>{
 const batch=actualBatch();assert.deepEqual(batch.stageOrder,['policy192','declaration193','engine194','fixed196','novelty197','census200','capacity201','bootstrap213','snapshot214','snapshot215']);
 const capacity=batch.stageBatches.capacity201;assert.deepEqual(capacity.censusStatements,batch.stageBatches.census200.statements);assert.equal(capacity.pre.length,11);assert.equal(capacity.post.length,27);
 for(const target of batch.targets){
  const stage201=target.stages.find(s=>s.id==='capacity201');assert.equal(stage201.repetition,null);assert.match(stage201.installation.join('\n'),/OWN_DECISION_CAPACITY_ALREADY_PRESENT/);
  for(const[id,n]of[['bootstrap213',213],['snapshot214',214],['snapshot215',215]]){
   const plan=target.stageBatches[id],stage=target.stages.find(s=>s.id===id);assert.equal(plan.major,target.major);assert.equal(plan.target.endpointId,target.endpointId);assert.equal(plan.whole201AdmissionIncluded,true);
   assert.equal(plan.capacity201SourceEpoch.predecessors,11);assert.equal(plan.capacity201SourceEpoch.postdecessors,27);assert.equal(plan.capacity201SourceEpoch.wholeGuardInverse,true);
   assert.deepEqual(stage.preflight,[...plan.preflight]);assert.deepEqual(stage.installation,[...plan.installation]);assert.deepEqual(stage.durableVerification,[...plan.verification]);assert.deepEqual(stage.repetition,[...plan.repetition]);
   assert.equal(stage.rehearsalExpectedError,'M7_PUBLIC'+n+'_REHEARSAL_ROLLBACK_REQUIRED');assert.deepEqual(stage.rehearsal,[...plan.rehearsal]);assert.equal(stage.nativeEquivalencePublicIncluded,false);
  }
  assert.equal(target.stageBatches.snapshot214.capacity201SourceEpoch.snapshotBodyAfter,target.stageBatches.snapshot215.capacity201SourceEpoch.snapshotBodyBefore);
 }
 assert.notEqual(batch.targets[0].stageBatches.snapshot215.target.endpointId,batch.targets[1].stageBatches.snapshot215.target.endpointId);
 assert.equal(batch.nativeEquivalencePublicIncluded,false);assert.deepEqual(batch.notComposed,['208','209','195']);
});
test('four new contracts bind their original proof asserter source and reject any whole-source drift',()=>{
 for(const stageId of OWN_M7_STAGE_IDS.slice(6)){
  const contract=ownM7SourcePhaseContract(stageId,read,{});assert.equal(contract.kind,stageId==='capacity201'?'capacity201':'successor');assert.match(contract.sourceSha256,/^[a-f0-9]{64}$/);
  assert.throws(()=>ownM7SourcePhaseContract(stageId,file=>read(file)+'\n// source drift',{}),/OWN_M7_ASSERT_REVIEWED_SOURCE_CHANGED/);
 }
});
function transportFixture(stageId,{badInstalled=false,badDurable=false,badRepeated=false,failure=null,persistFailure=null}={}){
 const capacity=stageId==='capacity201',stageNumber={bootstrap213:213,snapshot214:214,snapshot215:215}[stageId];assert.ok(capacity||stageNumber);
 const commit='a'.repeat(40),sourceHashes={'synthetic/source.sql':'b'.repeat(64)},target={major:17,projectId:'synthetic-project',branchId:'synthetic-branch',endpointId:'synthetic-endpoint',database:'synthetic-db',role:'synthetic-owner',host:'synthetic.invalid'};
 const stageBatch=capacity?{version:'own-full-capacity-canonical190-public-installation.v1',sourceCommit:commit,sourceSqlSha256:'b'.repeat(64)}:{version:stageNumber===213?'own-liquidation-bootstrap213-installation.v1':'own-close-snapshot'+stageNumber+'-installation.v1',sourceCommit:commit,schema:'public',major:17,sourceHashes,whole201AdmissionIncluded:true};
 const installed=capacity?{version:'own-full-capacity-canonical190-installation.v1',sourceCommit:commit,sourceSqlSha256:stageBatch.sourceSqlSha256,priorStateSha256:'c'.repeat(64),priorStatePreserved:true,existingFunctionMetadataPreserved:true,businessWrites:0,newFunctions:16,adaptedFunctions:9,changedChecks:3}:{version:stageBatch.version,sourceCommit:commit,schema:'public',mode:'install',sourceHashes,newTables:0,newFunctions:0,adaptedFunctions:1,newCapabilities:0,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,priorStatePreserved:true,priorFingerprint:'c'.repeat(64),objectFingerprint:'d'.repeat(64)};
 const token=capacity?OWN_M7_REHEARSAL_CODE:'M7_PUBLIC'+stageNumber+'_REHEARSAL_ROLLBACK_REQUIRED';
 const stage={id:stageId,version:stageBatch.version,rehearsalExpectedError:token,preflight:['preflight'],rehearsal:['rehearsal'],installation:['installation'],durableVerification:['durable'],repetition:capacity?null:['repetition']};
 const contract=ownM7SourcePhaseContract(stageId,read,stageBatch),batch={targets:[{...target,stages:[stage],stageBatches:capacity?{}:{[stageId]:stageBatch}}],stageBatches:capacity?{[stageId]:stageBatch}:{},phaseContracts:{[stageId]:contract},rehearsalCode:OWN_M7_REHEARSAL_CODE};
 const calls=[],records=[];let clients=0;
 const corrupt=proof=>({...proof,...(capacity?{priorStateSha256:'e'.repeat(64)}:{objectFingerprint:'e'.repeat(64)})});
 const client=async()=>{clients++;return{target,sql:{query:statement=>statement,transaction:async(list,options)=>{
  const phase=list[0];calls.push({phase,readOnly:options.readOnly,isolationLevel:options.isolationLevel});
  if(phase==='preflight')return[];
  if(phase==='rehearsal')throw failure??Object.assign(Error(token),{code:'P0001'});
  if(phase==='installation')return[[{proof:badInstalled?(capacity?{...installed,newFunctions:15}:{...installed,mode:'verify'}):structuredClone(installed)}]];
  const verified=capacity?structuredClone(installed):{...structuredClone(installed),mode:'verify'};
  if(phase==='durable')return[[{proof:badDurable?corrupt(verified):verified}]];
  if(phase==='repetition')return[[{proof:badRepeated?corrupt(verified):verified}]];
  throw Error('UNEXPECTED_SYNTHETIC_PHASE');
 }}};};
 const record=row=>{if(persistFailure==='initial'||persistFailure==='installed'&&row.installed)throw Error('SYNTHETIC_PERSISTENCE_FAILURE');records.push(structuredClone(row));};
 return{batch,client,record,calls,records,token,get clients(){return clients;}};
}
test('201 validates TWO returned receipts, performs only five transactions and never repeats installed DDL',async()=>{
 const fixture=transportFixture('capacity201'),result=await executeOwnM7Stage({...fixture,stageId:'capacity201',major:17});
 assert.deepEqual(fixture.calls.map(r=>r.phase),['preflight','rehearsal','preflight','installation','durable']);assert.deepEqual(fixture.calls.map(r=>r.readOnly),[true,false,true,false,true]);
 assert.ok(fixture.calls.every(r=>r.isolationLevel==='RepeatableRead'));assert.equal(result.validatedReceiptCount,2);assert.equal(result.repeated,false);assert.equal(result.durabilityVerified,true);assert.equal(result.state,'VALIDATED');
 assert.ok(fixture.records.slice(0,-1).every(r=>r.durabilityVerified===false));
});
test('each successor accepts its own exact rehearsal token and THREE separately returned proofs',async()=>{
 for(const stageId of OWN_M7_STAGE_IDS.slice(7)){
  const fixture=transportFixture(stageId),result=await executeOwnM7Stage({...fixture,stageId,major:17});
  assert.deepEqual(fixture.calls.map(r=>r.phase),['preflight','rehearsal','preflight','installation','durable','repetition']);assert.deepEqual(fixture.calls.map(r=>r.readOnly),[true,false,true,false,true,false]);
  assert.equal(result.validatedReceiptCount,3);assert.equal(result.durabilityVerified,true);assert.equal(result.nativeEquivalencePublicIncluded,false);
  assert.ok(fixture.records.slice(0,-1).every(r=>r.durabilityVerified===false));assert.equal(result.installedProof.mode,'install');assert.equal(result.durableProof.mode,'verify');assert.equal(result.repeatedProof.mode,'verify');
 }
});
test('invalid proof in every new stage stops before the following SQL and never claims durability',async()=>{
 for(const stageId of OWN_M7_STAGE_IDS.slice(6))for(const[options,expected]of[[{badInstalled:true},['preflight','rehearsal','preflight','installation']],[{badDurable:true},['preflight','rehearsal','preflight','installation','durable']],...(stageId==='capacity201'?[]:[[{badRepeated:true},['preflight','rehearsal','preflight','installation','durable','repetition']]])]){
  const fixture=transportFixture(stageId,options);await assert.rejects(()=>executeOwnM7Stage({...fixture,stageId,major:17}));assert.deepEqual(fixture.calls.map(r=>r.phase),expected);assert.equal(fixture.records.at(-1).state,'UNCERTAIN');assert.equal(fixture.records.at(-1).noFurtherSql,true);assert.equal(fixture.records.at(-1).durabilityVerified,false);
 }
});
test('a global token, wrong SQLSTATE or a transport message cannot satisfy a successor rehearsal',async()=>{
 const token='M7_PUBLIC214_REHEARSAL_ROLLBACK_REQUIRED';
 for(const failure of[Object.assign(Error(OWN_M7_REHEARSAL_CODE),{code:'P0001'}),Object.assign(Error(token),{code:'P0002'}),Object.assign(Error('transport: '+token),{code:'ECONNRESET'}),Object.assign(Error('prefix '+token),{code:'P0001'})]){
  const fixture=transportFixture('snapshot214',{failure});await assert.rejects(()=>executeOwnM7Stage({...fixture,stageId:'snapshot214',major:17}),/REHEARSAL_UNCERTAIN/);assert.deepEqual(fixture.calls.map(r=>r.phase),['preflight','rehearsal']);assert.equal(fixture.records.at(-1).noFurtherSql,true);
 }
});
test('persistence failure prevents client acquisition or any post-COMMIT readback',async()=>{
 for(const persistFailure of['initial','installed']){
  const fixture=transportFixture('capacity201',{persistFailure});await assert.rejects(()=>executeOwnM7Stage({...fixture,stageId:'capacity201',major:17}),/SYNTHETIC_PERSISTENCE_FAILURE/);
  assert.deepEqual(fixture.calls.map(r=>r.phase),persistFailure==='initial'?[]:['preflight','rehearsal','preflight','installation']);assert.equal(fixture.clients,persistFailure==='initial'?0:1);
 }
});
test('existing RAW gate discovers the new import chain, consumes SQL and rejects in-closure WIP while preserving outside WIP',()=>{
 const files=new Map(OWN_M7_SOURCE_REVIEW_ENTRIES.map(file=>[file,Buffer.from(file.endsWith('.json')?'{}\n':'export const synthetic = true;\n')]));
 const module='scripts/lib/own-m7-public-schema-batch.mjs',bridge='scripts/lib/own-m7-public-successors201-bridge.mjs',f201='scripts/lib/own-full-capacity-190-public-installation.mjs',successors='scripts/lib/own-m7-public-successors213215.mjs',sql='scripts/migrations/201-own-full-payroll-decision-capacity.sql';
 files.set(module,Buffer.from("export * from './own-m7-public-successors201-bridge.mjs';\n"));files.set(bridge,Buffer.from("export * from './own-full-capacity-190-public-installation.mjs';\nexport * from './own-m7-public-successors213215.mjs';\n"));files.set(f201,Buffer.from('export const synthetic201 = true;\n'));files.set(successors,Buffer.from('export const synthetic213 = true;\n'));files.set(sql,Buffer.from('-- synthetic consumed SQL\nSELECT 1;  \n\n'));
 const committed=new Map([...files].map(([file,bytes])=>[file,Buffer.from(bytes)]));const foreign='scripts/migrations/212-native-employment-lifecycle-history.sql',outside=Buffer.from('outside WIP remains\n');files.set(foreign,outside);
 const readBytes=file=>{assert.ok(files.has(file));return Buffer.from(files.get(file));},committedBytes=file=>{assert.ok(committed.has(file));return Buffer.from(committed.get(file));},recorder=createRecordingSourceReader({root,readBytes});recorder.read(sql);
 const verify=()=>ownM7CommittedSourceClosure({root,sourceCommit,consumed:recorder.consumed(),readBytes,committedBytes});const pass=verify();for(const file of[bridge,f201,successors,sql])assert.ok(Object.hasOwn(pass.sourceClosure.files,file));assert.equal(Object.hasOwn(pass.sourceClosure.files,foreign),false);
 files.set(successors,Buffer.concat([files.get(successors),Buffer.from('// uncommitted\n')]));assert.throws(verify,/OWNER_QA_COMMITTED_SOURCE_CHANGED/);assert.deepEqual(files.get(foreign),outside);
});
