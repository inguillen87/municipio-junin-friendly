// Exact reviewed public schema installation, one stage per invocation. No business commands.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {prepareOwnM7CommittedReview,assertOwnM7ReviewBytes} from './prepare-own-m7-schema-batch-installation.mjs';
import {ownReleaseClient} from './lib/own-payroll-release-target.mjs';
import {assertOwnM7StageDurability,assertOwnM7StageProof,isOwnM7RehearsalRollback,OWN_M7_STAGE_IDS} from './lib/own-m7-public-schema-batch.mjs';
const proofOf=rows=>{const value=rows.at(-1)?.[0]?.proof;assert.ok(value&&typeof value==='object','OWN_M7_PROOF_REQUIRED');return value;};
export async function executeOwnM7Stage({batch,stageId,major,client,record}){
 assert.ok(OWN_M7_STAGE_IDS.includes(stageId));assert.equal(typeof record,'function');
 const target=batch.targets.find(t=>t.major===major);assert.ok(target);const stage=target.stages.find(s=>s.id===stageId);assert.ok(stage);
 const stageBatch=target.stageBatches?.[stageId]??batch.stageBatches?.[stageId];assert.ok(stageBatch,'OWN_M7_STAGE_BATCH_REQUIRED');const contract=batch.phaseContracts?.[stageId];assert.equal(contract?.stageId,stageId,'OWN_M7_STAGE_PHASE_CONTRACT_REQUIRED');if(contract.kind==='successor'){assert.equal(stageBatch.major,major,'OWN_M7_SUCCESSOR_MAJOR_DRIFT');assert.equal(stageBatch.whole201AdmissionIncluded,true,'OWN_M7_WHOLE201_SOURCE_GUARD_REQUIRED');}
 const result={stage:stageId,version:stage.version,target:null,phase:'before-client',state:'PENDING',preflight:false,rehearsed:false,installed:false,durableObserved:false,durabilityVerified:false,repeated:false,businessOperations:0,nominalRowsReturned:0,automaticRetry:false};
 let recorded=false;
 try{
  record(result);recorded=true;
  const {sql,target:actual}=await client(major);for(const k of ['major','projectId','branchId','endpointId','database','role','host'])assert.equal(actual[k],target[k],'OWN_M7_DESTINATION_DRIFT');result.target=actual;
  const tx=(s,readOnly)=>sql.transaction(s.map(statement=>sql.query(statement)),{isolationLevel:'RepeatableRead',readOnly});
  result.phase='preflight';record(result);await tx(stage.preflight,true);result.preflight=true;record(result);
  result.phase='rehearsal';record(result);let rehearsalError=null;try{await tx(stage.rehearsal,false);}catch(error){rehearsalError=error;}
  if(!isOwnM7RehearsalRollback(rehearsalError,stage.rehearsalExpectedError??batch.rehearsalCode)){
   const error=Error('OWN_M7_REHEARSAL_UNCERTAIN_NO_FURTHER_SQL');error.code='OWN_M7_REHEARSAL_UNCERTAIN';error.uncertain=true;throw error;
  }
  result.phase='rollback-verification';record(result);await tx(stage.preflight,true);result.rehearsed=true;record(result);
  result.phase='installation';record(result);const installed=proofOf(await tx(stage.installation,false));
  assertOwnM7StageProof(stageId,{phase:'installation',receipt:installed,batch:stageBatch,contract});Object.assign(result,{installed:true,installedProof:installed});record(result);
  result.phase='durable-verification';record(result);const durable=proofOf(await tx(stage.durableVerification,true));
  assertOwnM7StageProof(stageId,{phase:'durable',receipt:durable,batch:stageBatch,installed,contract});Object.assign(result,{durableObserved:true,durableProof:durable});record(result);
  let repeated;if(stage.repetition){result.phase='repetition';record(result);repeated=proofOf(await tx(stage.repetition,false));assertOwnM7StageProof(stageId,{phase:'repetition',receipt:repeated,batch:stageBatch,installed,contract});Object.assign(result,{repeated:true,repeatedProof:repeated});record(result);}
  const validation=assertOwnM7StageDurability(stageId,{installed,durable,repeated,batch:stageBatch});Object.assign(result,{validation,durabilityVerified:true,validatedReceiptCount:stage.repetition?3:2,nativeEquivalencePublicIncluded:false,state:'VALIDATED',phase:'complete'});record(result);return result;
 }catch(cause){
  const error=cause instanceof Error?cause:Object.assign(Error('OWN_M7_NON_ERROR_TRANSPORT_FAILURE'),{code:'OWN_M7_NON_ERROR_TRANSPORT_FAILURE'});
  Object.assign(result,{state:'UNCERTAIN',noFurtherSql:true,noCleanup:true,automaticRetry:false,failureCode:typeof error.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:'OWN_M7_STAGE_UNVALIDATED'});
  if(recorded)try{record(result);}catch{}
  error.uncertain=true;error.noFurtherSql=true;throw error;
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let stage='arguments';try{
  const args={};for(const a of process.argv.slice(2)){const m=/^--(major|review|output|stage)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
  assert.ok([17,18].includes(Number(args.major)));assert.ok(OWN_M7_STAGE_IDS.includes(args.stage));
  const root=path.resolve(import.meta.dirname,'..'),review=path.resolve(args.review),output=path.resolve(args.output);
  for(const file of [review,output])assert.ok(file.startsWith(path.join(root,'verification')+path.sep));assert.ok(!fs.existsSync(output));
  stage='source';const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const reviewRaw=fs.readFileSync(review),review_=JSON.parse(reviewRaw.toString('utf8'));assert.equal(review_.sourceCommit,sourceCommit);
  const batch=prepareOwnM7CommittedReview({root,sourceCommit,operationalPairBaseline:review_.operationalPairBaseline});
  // The complete canonical batch and source custody match before client acquisition.
  assertOwnM7ReviewBytes(reviewRaw,batch);
  stage='installation';let wrote=false;
  const result=await executeOwnM7Stage({batch,stageId:args.stage,major:Number(args.major),client:ownReleaseClient,record:r=>{fs.writeFileSync(output,JSON.stringify(r,null,2)+'\n',{flag:wrote?'w':'wx'});wrote=true;}});
  console.log(JSON.stringify({stage:args.stage,installed:result.installed,durabilityVerified:result.durabilityVerified,repeated:result.repeated,major:Number(args.major),sourceCommit,businessOperations:0,nominalRowsReturned:0}));
 }catch(e){console.error(JSON.stringify({ok:false,stage,code:typeof e.code==='string'?e.code:'OWN_M7_INSTALL_FAILED',automaticRetry:false}));process.exitCode=1;}
}
