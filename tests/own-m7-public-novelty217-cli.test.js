// Proposed causal unit/source regressions. Native-shaped DTOs are mocks only;
// these tests produce no admission, receipt or PostgreSQL evidence.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {composeOwnM7PublicSchemaBatch,publicPrerequisiteDefinitions,ownM7SourcePhaseContract,OWN_M7_STAGE_IDS,OWN_M7_ORIGINAL_STAGE_IDS,OWN_M7_REHEARSAL_CODE} from '../scripts/lib/own-m7-public-schema-batch.mjs';
import {composeOwnM7PublicNovelty217,assertOwnM7PublicNovelty217Durability} from '../scripts/lib/own-m7-public-novelty217-source.mjs';
import {readOwnM7PriorReceipts,createOwnM7RecordWriter} from '../scripts/lib/own-m7-prior-receipts.mjs';
import {executeOwnM7Stage} from '../scripts/install-own-m7-schema-batch.mjs';
const repo=path.resolve(import.meta.dirname,'..'),sourceCommit='a'.repeat(40),read=f=>fs.readFileSync(path.join(repo,f),'utf8');
let p;const plan=()=>p??=composeOwnM7PublicNovelty217({read,sourceCommit,operationalPairBaseline:'published107',prerequisites:publicPrerequisiteDefinitions(read)});
function workspace(t){const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'m7-prior-'));fs.mkdirSync(path.join(root,'verification'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function mock217(){
 const source=plan().source217,targetPlan=plan().targets[0],target={...targetPlan.target,transport:'neon_https',postgresSsl:true};
 const installed={version:source.version,sourceCommit,sourceHashes:source.sourceHashes,mode:'install',...source.counters,transactionDataPreserved:true,preservationSha256:'1'.repeat(64),priorMetadataSha256:'2'.repeat(64),objectSha256:'3'.repeat(64)};
 const durable={...installed,mode:'verify',transactionDataPreserved:false},repeated={...installed,mode:'verify'};
 return {stage:'novelty217',version:source.version,sourceCommit,target,phase:'complete',state:'VALIDATED',preflight:true,rehearsed:true,installed:true,durableObserved:true,durabilityVerified:true,repeated:true,businessOperations:0,nominalRowsReturned:0,automaticRetry:false,installedProof:installed,durableProof:durable,repeatedProof:repeated,validation:assertOwnM7PublicNovelty217Durability({targetPlan,installed,durable,repeated}),validatedReceiptCount:3,nativeEquivalencePublicIncluded:false};
}
const boundary=(epoch,r)=>({version:'novelty217-capacity201-bookend.v1',sourceCommit,sourceHashes:plan().bookend.sourceHashes,capacity201SourceSha256:plan().capacity201.sourceSqlSha256,epoch,functions:3,newFunctions:0,adaptedFunctions:0,newTables:0,iamWrites:0,businessWrites:0,objectSha256:r.installedProof.objectSha256});
const proof201=()=>({version:'own-full-capacity-canonical190-installation.v1',sourceCommit,sourceSqlSha256:plan().capacity201.sourceSqlSha256,priorStateSha256:'4'.repeat(64),priorStatePreserved:true,existingFunctionMetadataPreserved:true,businessWrites:0,newFunctions:16,adaptedFunctions:9,changedChecks:3});
function fixture(t){
 const root=workspace(t),r=mock217(),targetPlan=plan().targets[0],stage={id:'capacity201',version:plan().capacity201.version,preflight:['preflight'],rehearsal:['rehearsal'],installation:['installation'],durableVerification:['durable'],repetition:null,rehearsalExpectedError:OWN_M7_REHEARSAL_CODE};
 const target={...targetPlan.target,stages:[stage],stageBatches:{novelty217:targetPlan}},batch={sourceCommit,stageOrder:[...OWN_M7_STAGE_IDS],targets:[target],stageBatches:{capacity201:plan().capacity201},phaseContracts:{capacity201:ownM7SourcePhaseContract('capacity201',read,plan().capacity201)},rehearsalCode:OWN_M7_REHEARSAL_CODE};
 const original=path.join(root,'verification','217.json');createOwnM7RecordWriter({root,file:original})(r);
 return {root,r,batch,targetPlan,original};
}
test('the exact original ten-stage order survives removal of217 and source-bound200 is projected once per phase',()=>{
 const batch=composeOwnM7PublicSchemaBatch({read,sourceCommit,operationalPairBaseline:'published107'});
 assert.deepEqual(batch.stageOrder.filter(id=>id!=='novelty217'),[...OWN_M7_ORIGINAL_STAGE_IDS]);assert.deepEqual(batch.stageOrder.slice(4,8),['novelty197','novelty217','census200','capacity201']);
 for(const target of batch.targets){assert.strictEqual(target.stages.find(s=>s.id==='novelty217'),target.stageBatches.novelty217);assert.equal(target.novelty217CensusProjection.length,3);assert.ok(target.novelty217CensusProjection.every(p=>p.multiplicity===1&&p.wholeArrayInverse));}
});
test('the closed prior gate refuses missing, wrong-stage, wrong-commit and passed-only files before a client',async t=>{
 const f=fixture(t);let clients=0;const call=prior=>executeOwnM7Stage({batch:f.batch,stageId:'capacity201',major:17,prior,client:async()=>{clients++;throw Error('CLIENT_FORBIDDEN');},record:()=>{}});
 await assert.rejects(()=>call(),/UNMINTED_RECEIPTS/);assert.equal(clients,0);
 for(const change of [v=>v.stage='capacity201',v=>v.sourceCommit='b'.repeat(40),v=>v.installedProof={passed:true},v=>delete v.repeatedProof,v=>v.target={...v.target,role:'other'}]){
  const r=structuredClone(f.r);change(r);fs.writeFileSync(f.original,JSON.stringify(r,null,2)+'\n');assert.throws(()=>readOwnM7PriorReceipts({root:f.root,file:f.original,batch:f.batch,stageId:'capacity201',major:17}));
 }
 assert.equal(clients,0);
});
test('canonical RAW custody refuses duplicate keys, trailers, invalid UTF8 and outside paths',t=>{
 const f=fixture(t),original=fs.readFileSync(f.original);for(const raw of [Buffer.concat([Buffer.from('{"stage":"x",'),original.subarray(1)]),Buffer.concat([original,Buffer.from(' ')]),Buffer.from([0xff,0xfe,0xfd])]){
  fs.writeFileSync(f.original,raw);assert.throws(()=>readOwnM7PriorReceipts({root:f.root,file:f.original,batch:f.batch,stageId:'capacity201',major:17}));
 }
 fs.writeFileSync(f.original,original);assert.throws(()=>readOwnM7PriorReceipts({root:f.root,file:path.join(f.root,'outside.json'),batch:f.batch,stageId:'capacity201',major:17}),/VERIFICATION_PATH/);
 assert.throws(()=>readOwnM7PriorReceipts({root:f.root,file:f.original,batch:f.batch,stageId:'novelty217',major:17}),/PRIOR_FORBIDDEN/);
});
test('hardlinked or symbolic prior files cannot acquire custody',t=>{
 const f=fixture(t),linked=path.join(f.root,'verification','linked.json');fs.linkSync(f.original,linked);assert.throws(()=>readOwnM7PriorReceipts({root:f.root,file:linked,batch:f.batch,stageId:'capacity201',major:17}),/HARDLINK/);
 fs.unlinkSync(linked);const symlink=path.join(f.root,'verification','symbolic.json');try{fs.symlinkSync(f.original,symlink);}catch(error){if(error.code==='EPERM'){t.diagnostic('Host did not permit creation of the symlink fixture; hardlink rejection was exercised.');return;}throw error;}
 assert.throws(()=>readOwnM7PriorReceipts({root:f.root,file:symlink,batch:f.batch,stageId:'capacity201',major:17}),/REPARSE/);
});
function transport(f,{badBefore=false,badAfter=false,changePriorAfterClient=false}={}){
 const calls=[],records=[];let clients=0;const output=path.join(f.root,'verification','201.json'),writer=createOwnM7RecordWriter({root:f.root,file:output});
 const prior=readOwnM7PriorReceipts({root:f.root,file:f.original,batch:f.batch,stageId:'capacity201',major:17});
 const client=async()=>{clients++;if(changePriorAfterClient)fs.appendFileSync(f.original,' ');return {target:f.r.target,sql:{query:s=>s,transaction:async(list,options)=>{
  assert.equal(options.isolationLevel,'RepeatableRead');let phase=list[0];
  if(list.at(-1).includes("'epoch','pre201'"))phase='before201';if(list.at(-1).includes("'epoch','post201'"))phase='after201';calls.push({phase,ro:options.readOnly});
  if(phase==='before201'||phase==='after201'){const proof=boundary(phase==='before201'?'pre201':'post201',f.r);if(phase==='before201'&&badBefore||phase==='after201'&&badAfter)proof.objectSha256='9'.repeat(64);return [[{proof}]];}
  if(phase==='preflight')return [];if(phase==='rehearsal')throw Object.assign(Error(OWN_M7_REHEARSAL_CODE),{code:'P0001'});return [[{proof:proof201()}]];
 }}};};
 return {prior,client,record:r=>{records.push(structuredClone(r));writer(r);},calls,records,output,get clients(){return clients;}};
}
test('201 validates both native boundaries before VALIDATED; its two native receipts keep their ABI',async t=>{
 const f=fixture(t),x=transport(f);await executeOwnM7Stage({batch:f.batch,stageId:'capacity201',major:17,...x});
 assert.deepEqual(x.calls.map(v=>v.phase),['before201','preflight','rehearsal','preflight','installation','durable','after201']);assert.deepEqual(x.calls.map(v=>v.ro),[true,true,false,true,false,true,true]);
 assert.ok(x.records.slice(0,-1).every(v=>v.state!=='VALIDATED'&&v.durabilityVerified===false));const record=JSON.parse(fs.readFileSync(x.output,'utf8'));
 assert.equal(record.validatedReceiptCount,2);assert.equal(record.novelty217BoundaryReceiptCount,2);assert.equal(record.installedProof.version,'own-full-capacity-canonical190-installation.v1');
 for(const stageId of ['bootstrap213','snapshot214','snapshot215','annul208209']){const prior=readOwnM7PriorReceipts({root:f.root,file:x.output,batch:f.batch,stageId,major:17});assert.equal(prior.recheck(),true);assert.deepEqual(prior.links.novelty217Prior,record.novelty217Prior);assert.equal(prior.links.capacity201Prior.path,'verification/201.json');}
});
test('a failed217 boundary prevents subsequent SQL or a false201 durable claim',async t=>{
 for(const [options,wanted]of [[{badBefore:true},['before201']],[{badAfter:true},['before201','preflight','rehearsal','preflight','installation','durable','after201']]]){
  const f=fixture(t),x=transport(f,options);await assert.rejects(()=>executeOwnM7Stage({batch:f.batch,stageId:'capacity201',major:17,...x}),/THREE_FUNCTION_METADATA_CHANGED/);assert.deepEqual(x.calls.map(v=>v.phase),wanted);assert.equal(x.records.at(-1).state,'UNCERTAIN');assert.equal(x.records.at(-1).durabilityVerified,false);assert.equal(x.records.at(-1).noFurtherSql,true);
 }
});
test('changed original RAW stops before the next transaction; a plain clone cannot replace branded custody',async t=>{
 const f=fixture(t),x=transport(f,{changePriorAfterClient:true});await assert.rejects(()=>executeOwnM7Stage({batch:f.batch,stageId:'capacity201',major:17,...x}));assert.equal(x.clients,1);assert.deepEqual(x.calls,[]);
 const g=fixture(t),y=transport(g);await assert.rejects(()=>executeOwnM7Stage({batch:g.batch,stageId:'capacity201',major:17,...y,prior:{...y.prior}}),/UNMINTED/);assert.equal(y.clients,0);
});
test('transport lexical splitting preserves an opaque function body within the existing transaction',async t=>{
 const f=fixture(t),x=transport(f);const target=f.batch.targets[0],stage=target.stages[0],compound="DO $one$ BEGIN PERFORM ';'; END $one$; DO $two$ BEGIN PERFORM 2; END $two$;";
 stage.preflight=[compound];const queryCalls=[];const client=async()=>{const result=await x.client(),transaction=result.sql.transaction;result.sql.query=s=>{queryCalls.push(s);return s;};result.sql.transaction=(list,options)=>list[0].startsWith('DO $one$')?(assert.equal(list.length,2),assert.match(list[0],/PERFORM ';'/),assert.equal(options.readOnly,true),Promise.resolve([])):transaction(list,options);return result;};
 await executeOwnM7Stage({batch:f.batch,stageId:'capacity201',major:17,...x,client});assert.equal(queryCalls.filter(s=>s.startsWith('DO $one$')).length,2);assert.equal(queryCalls.filter(s=>s.startsWith('DO $two$')).length,2);
});
