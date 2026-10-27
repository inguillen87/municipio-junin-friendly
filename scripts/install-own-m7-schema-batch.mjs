// Exact reviewed public schema installation, one stage per invocation. No business commands.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {prepareOwnM7CommittedReview,assertOwnM7ReviewBytes} from './prepare-own-m7-schema-batch-installation.mjs';
import {ownReleaseClient} from './lib/own-payroll-release-target.mjs';
import {assertM10PublicStageFinalProof} from './lib/own-m10-public-schema-plan.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {readOwnM7PriorReceipts,assertOwnM7PriorForStage,createOwnM7RecordWriter} from './lib/own-m7-prior-receipts.mjs';
import {assertOwnM7PublicNovelty217Before201,assertOwnM7PublicNovelty217After201} from './lib/own-m7-public-novelty217-source.mjs';
import {ownReleaseAnnulmentClient,ownReleaseErrorCode} from './lib/own-payroll-release-annulment-pg.mjs';
import {executeOwnM7PublicAnnulmentTail,OWN_M7_ANNULMENT_TAIL_STAGE,OWN_M7_STAGES_WITH_ANNULMENT} from './lib/own-m7-public-annulment208209.mjs';
import {assertOwnM7StageDurability,assertOwnM7StageProof,isOwnM7RehearsalRollback,OWN_M7_STAGE_IDS} from './lib/own-m7-public-schema-batch.mjs';
const proofOf=rows=>{const value=rows.at(-1)?.[0]?.proof;assert.ok(value&&typeof value==='object','OWN_M7_PROOF_REQUIRED');return value;};
export async function executeOwnM7Stage({batch,stageId,major,client,record,prior}){
 const checked=assertOwnM7PriorForStage({prior,batch,stageId,major}),links=checked?.links??{};
 const persist=value=>{checked?.recheck();record({...value,...links});};
 if(stageId===OWN_M7_ANNULMENT_TAIL_STAGE){const result=await executeOwnM7PublicAnnulmentTail({batch,major,client,record:r=>persist({...r,sourceCommit:batch.sourceCommit})});checked?.recheck();return {...result,sourceCommit:batch.sourceCommit,...links};}
 assert.ok(OWN_M7_STAGE_IDS.includes(stageId)||batch.phaseContracts?.[stageId]?.kind==='m10');assert.equal(typeof record,'function');
 const target=batch.targets.find(t=>t.major===major);assert.ok(target);const stage=target.stages.find(s=>s.id===stageId);assert.ok(stage);
 const stageBatch=target.stageBatches?.[stageId]??batch.stageBatches?.[stageId];assert.ok(stageBatch,'OWN_M7_STAGE_BATCH_REQUIRED');const contract=batch.phaseContracts?.[stageId];assert.equal(contract?.stageId,stageId,'OWN_M7_STAGE_PHASE_CONTRACT_REQUIRED');if(contract.kind==='successor'){assert.equal(stageBatch.major,major,'OWN_M7_SUCCESSOR_MAJOR_DRIFT');assert.equal(stageBatch.whole201AdmissionIncluded,true,'OWN_M7_WHOLE201_SOURCE_GUARD_REQUIRED');}
 const result={stage:stageId,version:stage.version,sourceCommit:batch.sourceCommit,target:null,phase:'before-client',state:'PENDING',preflight:false,rehearsed:false,installed:false,durableObserved:false,durabilityVerified:false,repeated:false,businessOperations:0,nominalRowsReturned:0,automaticRetry:false};
 let recorded=false;
 try{
  persist(result);recorded=true;
  const {sql,target:actual}=await client(major);for(const k of ['major','projectId','branchId','endpointId','database','role','host'])assert.equal(actual[k],target[k],'OWN_M7_DESTINATION_DRIFT');result.target=actual;
  const tx=(s,readOnly)=>{checked?.recheck();return sql.transaction(s.flatMap(splitPostgresStatements).map(statement=>sql.query(statement)),{isolationLevel:'RepeatableRead',readOnly});};
  if(stageId==='capacity201'&&checked){result.phase='novelty217-before201';persist(result);const observed=proofOf(await tx(checked.targetPlan.before201Verification,true));assertOwnM7PublicNovelty217Before201({targetPlan:checked.targetPlan,prior217Record:checked.prior217Record,actualTarget:actual,observed});result.novelty217Before201Proof=observed;persist(result);}
  result.phase='preflight';persist(result);await tx(stage.preflight,true);result.preflight=true;persist(result);
  result.phase='rehearsal';persist(result);let rehearsalError=null;try{await tx(stage.rehearsal,false);}catch(error){rehearsalError=error;}
  if(!isOwnM7RehearsalRollback(rehearsalError,stage.rehearsalExpectedError??batch.rehearsalCode)){
   const error=Error('OWN_M7_REHEARSAL_UNCERTAIN_NO_FURTHER_SQL');error.code='OWN_M7_REHEARSAL_UNCERTAIN';error.uncertain=true;throw error;
  }
  result.phase='rollback-verification';persist(result);await tx(stage.preflight,true);result.rehearsed=true;persist(result);
  result.phase='installation';persist(result);const installed=proofOf(await tx(stage.installation,false));
  assertOwnM7StageProof(stageId,{phase:'installation',receipt:installed,batch:stageBatch,contract});Object.assign(result,{installed:true,installedProof:installed});persist(result);
  result.phase='durable-verification';persist(result);const durable=proofOf(await tx(stage.durableVerification,true));
  assertOwnM7StageProof(stageId,{phase:'durable',receipt:durable,batch:stageBatch,installed,contract});Object.assign(result,{durableObserved:true,durableProof:durable});persist(result);
  let repeated;if(stage.repetition){result.phase='repetition';persist(result);repeated=proofOf(await tx(stage.repetition,stage.repetitionReadOnlyVerifier===true));assertOwnM7StageProof(stageId,{phase:'repetition',receipt:repeated,batch:stageBatch,installed,contract});Object.assign(result,{repeated:true,repeatedProof:repeated});persist(result);}
  const validation=assertOwnM7StageDurability(stageId,{installed,durable,repeated,batch:stageBatch});
  if(stageId==='capacity201'&&checked){result.phase='novelty217-after201';persist(result);const observed=proofOf(await tx(checked.targetPlan.after201Verification,true));assertOwnM7PublicNovelty217After201({targetPlan:checked.targetPlan,prior217Record:checked.prior217Record,actualTarget:actual,installed201:installed,durable201:durable,observed});result.novelty217After201Proof=observed;result.novelty217BoundaryReceiptCount=2;persist(result);}
  if(stage.finalVerification){result.phase='m10-final37';persist(result);const observed=proofOf(await tx(stage.finalVerification,true));assertM10PublicStageFinalProof({stage:stageBatch,observed});result.finalFunctionProof=observed;persist(result);}
  checked?.recheck();Object.assign(result,{validation,durabilityVerified:true,validatedReceiptCount:stage.repetition?3:2,nativeEquivalencePublicIncluded:false,state:'VALIDATED',phase:'complete'});persist(result);return result;
 }catch(cause){
  const error=cause instanceof Error?cause:Object.assign(Error('OWN_M7_NON_ERROR_TRANSPORT_FAILURE'),{code:'OWN_M7_NON_ERROR_TRANSPORT_FAILURE'});
  Object.assign(result,{state:'UNCERTAIN',noFurtherSql:true,noCleanup:true,automaticRetry:false,failureCode:ownReleaseErrorCode(error,'OWN_M7_STAGE_UNVALIDATED')});
  if(recorded)try{record({...result,...links});}catch{}
  error.uncertain=true;error.noFurtherSql=true;throw error;
 }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let stage='arguments';try{
  const args={};for(const a of process.argv.slice(2)){const m=/^--(major|review|output|stage|prior)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
  assert.ok([17,18].includes(Number(args.major)));assert.ok(OWN_M7_STAGES_WITH_ANNULMENT.includes(args.stage));
  const root=path.resolve(import.meta.dirname,'..'),review=path.resolve(args.review),output=path.resolve(args.output);
  for(const file of [review,output])assert.ok(file.startsWith(path.join(root,'verification')+path.sep));assert.ok(!fs.existsSync(output));
  stage='source';const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const reviewRaw=fs.readFileSync(review),review_=JSON.parse(reviewRaw.toString('utf8'));assert.equal(review_.sourceCommit,sourceCommit);
  const batch=prepareOwnM7CommittedReview({root,sourceCommit,operationalPairBaseline:review_.operationalPairBaseline});
  // The complete canonical batch and source custody match before client acquisition.
  assertOwnM7ReviewBytes(reviewRaw,batch);
  stage='prior-receipts';const prior=readOwnM7PriorReceipts({root,file:args.prior,batch,stageId:args.stage,major:Number(args.major)});
  if(prior)for(const pin of Object.values(prior.links))assert.notEqual(path.resolve(root,pin.path),output,'OWN_M7_PRIOR_OUTPUT_COLLISION');
  const record=createOwnM7RecordWriter({root,file:output});stage='installation';
  const result=await executeOwnM7Stage({batch,stageId:args.stage,major:Number(args.major),prior,client:args.stage===OWN_M7_ANNULMENT_TAIL_STAGE?ownReleaseAnnulmentClient:ownReleaseClient,record});
  console.log(JSON.stringify({stage:args.stage,installed:result.installed,durabilityVerified:result.durabilityVerified,repeated:result.repeated,major:Number(args.major),sourceCommit,businessOperations:0,nominalRowsReturned:0}));
 }catch(e){console.error(JSON.stringify({ok:false,stage,code:ownReleaseErrorCode(e,'OWN_M7_INSTALL_FAILED'),automaticRetry:false}));process.exitCode=1;}
}
