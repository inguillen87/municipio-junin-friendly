// Synthetic transport DTOs only. No native SQL, receipt or publication evidence.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {composeOwnM7PublicSchemaBatchWithAnnulment,assertOwnM7PublicAnnulmentTailRecord} from '../scripts/lib/own-m7-public-annulment208209.mjs';
import {M10_PUBLIC_STAGE_ORDER,assertM10PublicStagePhase} from '../scripts/lib/own-m10-public-schema-plan.mjs';
import {readOwnM7PriorReceipts,createOwnM7RecordWriter} from '../scripts/lib/own-m7-prior-receipts.mjs';
import {executeOwnM7Stage} from '../scripts/install-own-m7-schema-batch.mjs';import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
import {mockedCompleteM7Tail,mocked217And201} from './fixtures/own-m10-institutional-receipt-mocks.js';
const repo=path.resolve(import.meta.dirname,'..'),read=f=>fs.readFileSync(path.join(repo,f),'utf8'),sourceCommit='a'.repeat(40),hash=b=>createHash('sha256').update(b).digest('hex');let memo;
const batch=()=>memo??=composeOwnM7PublicSchemaBatchWithAnnulment({read,sourceCommit,operationalPairBaseline:'published107'});
function proof(stage,phase){
 const id=stage.id,b=stage.batch,install=phase==='installation';
 if(id==='216')return {...b.proofContract,mode:{installation:'install',durable:'durable',repetition:'repeat'}[phase],readOnly:phase==='durable',beforeFingerprint:'a'.repeat(64),priorFingerprint:'a'.repeat(64),objectsFingerprint:'b'.repeat(64),oldSevenMetadataFingerprint:'c'.repeat(64)};
 if(id==='212')return {version:'lifecycle212-public-installation.v1',sourceCommit,schema:'public',sourceHashes:b.sourceHashes,predecessorPins:4,newFunctions:1,newTables:0,newCapabilities:0,newRoles:0,adaptedFunctions:0,businessRowsAdded:0,priorStatePreserved:true,priorFingerprint:'a'.repeat(64),objectFingerprint:'b'.repeat(64)};
 const counts={
  '127':{allChecksPassed:true,eventRows:0,newTables:1,newFunctions:11,runtimeFacades:3,capabilityDefinitionsAdded:2,roleAssignmentsAdded:0,nominalRowsReturned:0},
  '128':{allChecksPassed:true,newTables:2,newFunctions:11,runtimeFacades:4,originalCaptureTriggersAdded:1,eventRows:0,positionCaptureRows:0,capabilityDefinitionsAdded:2,roleAssignmentsAdded:0,nominalRowsReturned:0},
  '129':{allChecksPassed:true,newTables:1,newFunctions:4,runtimeFacades:1,originalCaptureTriggersAdded:1,dimensionRows:0,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,nominalRowsReturned:0},
  'adopted-v2':{allChecksPassed:true,adaptedFunctions:5,newTables:0,newFunctions:0,permissionChanges:0,businessOperations:0,nominalRowsReturned:0},
  '210':{allChecksPassed:true,newTables:0,newFunctions:2,runtimeFacades:1,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,businessOperations:0,nominalRowsReturned:0},
  '211':{allChecksPassed:true,newTables:0,newFunctions:1,adaptedFunctions:0,runtimeFacades:1,capabilityDefinitionsAdded:0,roleAssignmentsAdded:0,existingAclChanges:0,businessOperations:0,nominalRowsReturned:0,artHistoryPreserved:true}
 };
 if(['127','128','129'].includes(id))return {sourceCommit,['sql'+id+'Sha256']:b['sql'+id+'Sha256'],...counts[id],...(install?{beforeFingerprint:'a'.repeat(64)}:{}),afterFingerprint:'a'.repeat(64),newObjectFingerprint:'b'.repeat(64)};
 return {version:{'adopted-v2':'adopted-positions-installation.v2','210':'own-position-population-installation.v1','211':'own-art-full-installation.v1'}[id],sourceCommit,sourceHashes:b.sourceHashes,...(id==='210'||id==='211'?{predecessorVersion:b.predecessorVersion}:{}),...counts[id],priorFingerprint:'a'.repeat(64),objectFingerprint:'b'.repeat(64)};
}
async function fixture(t){
 const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'m10-chain-'));fs.mkdirSync(path.join(root,'verification'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const b=batch(),target=b.targets[0],mock=mocked217And201({batch:b,read}),pin=file=>{const raw=fs.readFileSync(file);return {path:path.relative(root,file).split(path.sep).join('/'),bytes:raw.length,sha256:hash(raw)};};
 const persist=(name,record)=>{const file=path.join(root,'verification',name+'.json');createOwnM7RecordWriter({root,file})(record);return {file,pin:pin(file)};};
 const a=persist('217',mock.r217);mock.r201.novelty217Prior=a.pin;const c=persist('201',mock.r201),tail=await mockedCompleteM7Tail(b);Object.assign(tail,{novelty217Prior:a.pin,capacity201Prior:c.pin});const prior=persist('tail',tail);
 return {root,b,target,actualTarget:mock.r217.target,tailFile:prior.file,persist,pin};
}
function transport(f,id,{badInstalled=false,badFinal=false}={}){
 const source=f.target.m10PublicPlan.stages.find(stage=>stage.id===id),stage=f.target.stages.find(stage=>stage.id==='m10-'+id),calls=[];
 const lists=Object.fromEntries([['preflight','preflight'],['rehearsal','rehearsal'],['installation','installation'],['durableVerification','durable'],['repetition','repetition'],...(stage.finalVerification?[['finalVerification','final']]:[])].map(([key,phase])=>[phase,stage[key].flatMap(splitPostgresStatements)]));
 const client=async()=>({target:f.actualTarget,sql:{query:value=>value,transaction:async(sql,options)=>{
  let phase=Object.keys(lists).find(key=>JSON.stringify(lists[key])===JSON.stringify(sql));if(phase==='durable'&&calls.some(c=>c.phase==='durable'))phase='repetition';assert.ok(phase,'UNKNOWN_UNIT_PHASE');calls.push({phase,readOnly:options.readOnly});assert.equal(options.isolationLevel,'RepeatableRead');for(const s of sql)assert.equal(splitPostgresStatements(s).length,1);
  if(phase==='preflight')return [];if(phase==='rehearsal')throw Object.assign(Error(stage.rehearsalExpectedError),{code:'P0001'});
  if(phase==='final')return [[{proof:{version:'m10-public-final-function-bookend.v1',sourceCommit,sourceHashes:f.target.m10PublicPlan.sourceHashes,metadataPins:badFinal?36:37,businessOperations:0,objectFingerprint:'c'.repeat(64)}}]];
  const value=proof(source,phase);if(phase==='installation'&&badInstalled)value.newTables=99;return [[{proof:value}]];
 }}});return {client,calls};
}
test('M10 appears only after the complete208209 pair and retains closed repetition modes',()=>{
 const b=batch(),order=b.stageOrder;assert.equal(order.indexOf('m10-127'),order.indexOf('annul208209')+1);assert.deepEqual(order.slice(-8),M10_PUBLIC_STAGE_ORDER.map(id=>'m10-'+id));
 for(const target of b.targets){const stages=target.stages.filter(s=>s.id.startsWith('m10-'));assert.equal(stages.length,8);for(const s of stages)assert.equal(s.repetitionReadOnlyVerifier===true,s.id!=='m10-216');assert.equal(stages.at(-1).finalVerification[0],'SET TRANSACTION READ ONLY');}
});
test('every native phase is checked immediately with its exact source ABI; passed-only and wrong counts reject',()=>{
 for(const stage of batch().targets[0].m10PublicPlan.stages){const installed=proof(stage,'installation');assert.equal(assertM10PublicStagePhase({stage,phase:'installation',receipt:installed}).phaseValidated,true);for(const phase of ['durable','repetition'])assert.equal(assertM10PublicStagePhase({stage,phase,receipt:proof(stage,phase),installed}).phaseValidated,true);
  assert.throws(()=>assertM10PublicStagePhase({stage,phase:'installation',receipt:{passed:true}}));assert.throws(()=>assertM10PublicStagePhase({stage,phase:'installation',receipt:{...installed,newTables:99}}));assert.throws(()=>assertM10PublicStagePhase({stage,phase:'durable',receipt:proof(stage,'durable')}));}
});
test('one original RAW chain authorizes each following stage without a209 epoch replay; final37 follows212',async t=>{
 const f=await fixture(t);let priorFile=f.tailFile;
 for(const id of M10_PUBLIC_STAGE_ORDER){const stageId='m10-'+id,prior=readOwnM7PriorReceipts({root:f.root,file:priorFile,batch:f.b,stageId,major:17}),x=transport(f,id),output=path.join(f.root,'verification',id+'.json'),writer=createOwnM7RecordWriter({root:f.root,file:output});
  await executeOwnM7Stage({batch:f.b,stageId,major:17,prior,...x,record:writer});const record=JSON.parse(fs.readFileSync(output,'utf8'));assert.equal(record.state,'VALIDATED');assert.equal(record.validatedReceiptCount,3);assert.equal(x.calls.find(c=>c.phase==='repetition').readOnly,id!=='216');assert.deepEqual(x.calls.slice(0,3).map(c=>c.phase),['preflight','rehearsal','preflight']);assert.equal(record.annulmentPrior.path,'verification/tail.json');if(id==='212'){assert.equal(record.finalFunctionProof.metadataPins,37);assert.equal(x.calls.at(-1).phase,'final');assert.equal(x.calls.at(-1).readOnly,true);}priorFile=output;
 }
});
test('a bad installation proof stops before durable SQL and keeps the record uncertain',async t=>{
 const f=await fixture(t),stageId='m10-127',prior=readOwnM7PriorReceipts({root:f.root,file:f.tailFile,batch:f.b,stageId,major:17}),x=transport(f,'127',{badInstalled:true}),records=[];await assert.rejects(()=>executeOwnM7Stage({batch:f.b,stageId,major:17,prior,...x,record:r=>records.push(structuredClone(r))}));assert.deepEqual(x.calls.map(c=>c.phase),['preflight','rehearsal','preflight','installation']);assert.equal(records.at(-1).state,'UNCERTAIN');assert.equal(records.at(-1).noFurtherSql,true);assert.equal(records.at(-1).durabilityVerified,false);
});
test('missing, skipped, changed or incomplete original tail cannot acquire an M10 client',async t=>{
 const f=await fixture(t);let clients=0;const client=async()=>{clients++;throw Error('CLIENT_FORBIDDEN');};await assert.rejects(()=>executeOwnM7Stage({batch:f.b,stageId:'m10-127',major:17,client,record:()=>{}}));assert.equal(clients,0);
 assert.throws(()=>readOwnM7PriorReceipts({root:f.root,file:f.tailFile,batch:f.b,stageId:'m10-129',major:17}));const original=fs.readFileSync(f.tailFile),r=JSON.parse(original);delete r.proofs[209].durable;fs.writeFileSync(f.tailFile,JSON.stringify(r,null,2)+'\n');assert.throws(()=>readOwnM7PriorReceipts({root:f.root,file:f.tailFile,batch:f.b,stageId:'m10-127',major:17}));fs.writeFileSync(f.tailFile,original);
 const prior=readOwnM7PriorReceipts({root:f.root,file:f.tailFile,batch:f.b,stageId:'m10-127',major:17});fs.appendFileSync(f.tailFile,' ');await assert.rejects(()=>executeOwnM7Stage({batch:f.b,stageId:'m10-127',major:17,prior,client,record:()=>{}}));assert.equal(clients,0);
});
test('tail readback never mints an execution admission or makes a current catalogue claim',async()=>{
 const r=await mockedCompleteM7Tail(batch()),v=assertOwnM7PublicAnnulmentTailRecord({batch:batch(),major:17,record:r});assert.equal(v.native208AdmissionMinted,false);assert.equal(v.current209EpochReplayed,false);assert.equal(v.queriesExecuted,0);
});
