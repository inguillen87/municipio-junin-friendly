// Private sequential driver. ONE committed composition per process (commit + baseline + major) for an
// explicit contiguous slice of the composed stageOrder. Every stage still runs the EXISTING
// executeOwnM7Stage with the existing prior reader and record writer. Before each stage the driver
// rechecks HEAD, its own committed bytes, the review file bytes, the composition raw bookend and the full
// committed source custody. Any error or non-VALIDATED result stops before the next stage. No retry.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {prepareOwnM7CommittedReview,assertOwnM7ReviewBytes,ownM7CommittedSourceClosure} from './prepare-own-m7-schema-batch-installation.mjs';
import {executeOwnM7Stage} from './install-own-m7-schema-batch.mjs';
import {readOwnM7PriorReceipts,createOwnM7RecordWriter} from './lib/own-m7-prior-receipts.mjs';
import {OWN_M7_ANNULMENT_TAIL_STAGE} from './lib/own-m7-public-annulment208209.mjs';
import {M10_PUBLIC_STAGE_ORDER} from './lib/own-m10-public-schema-plan.mjs';
import {ownReleaseClient} from './lib/own-payroll-release-target.mjs';
import {ownReleaseAnnulmentClient,ownReleaseErrorCode} from './lib/own-payroll-release-annulment-pg.mjs';

const SELF='scripts/run-own-m7-schema-batch-sequence.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const gitHead=root=>execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const gitShow=(root,commit,file)=>execFileSync('git',['show',commit+':'+file],{cwd:root,maxBuffer:24*1024*1024});
const streamPin=file=>{const h=createHash('sha256'),buffer=Buffer.allocUnsafe(8*1024*1024),fd=fs.openSync(file,'r');let bytes=0,n;
 try{while((n=fs.readSync(fd,buffer,0,buffer.length,null))>0){h.update(buffer.subarray(0,n));bytes+=n;}}finally{fs.closeSync(fd);}return {bytes,sha256:h.digest('hex')};};
const logged=new WeakSet();

// Same dependency rules that readOwnM7PriorReceipts/readM10PriorReceipts enforce; they still validate every prior.
export function ownM7PriorProducer(stageOrder,stageId){
 if(!stageOrder.includes('novelty217'))return null;
 if(['census200','capacity201'].includes(stageId))return 'novelty217';
 if(['bootstrap213','snapshot214','snapshot215',OWN_M7_ANNULMENT_TAIL_STAGE].includes(stageId))return 'capacity201';
 if(stageId.startsWith('m10-')){const i=M10_PUBLIC_STAGE_ORDER.indexOf(stageId.slice(4));assert.ok(i>=0,'OWN_M7_SEQUENCE_UNKNOWN_M10_STAGE');return i===0?OWN_M7_ANNULMENT_TAIL_STAGE:'m10-'+M10_PUBLIC_STAGE_ORDER[i-1];}
 return null;
}
export function planOwnM7Sequence({stageOrder,from,through,externalPrior}){
 const a=stageOrder.indexOf(from),b=stageOrder.indexOf(through);assert.ok(a>=0&&b>=a,'OWN_M7_SEQUENCE_RANGE_INVALID');
 const stages=stageOrder.slice(a,b+1),external=new Set();
 stages.forEach((stageId,i)=>{const producer=ownM7PriorProducer(stageOrder,stageId);if(producer&&!stages.slice(0,i).includes(producer))external.add(producer);});
 assert.ok(external.size<=1,'OWN_M7_SEQUENCE_ONE_EXTERNAL_PRIOR');assert.equal(typeof externalPrior==='string',external.size===1,'OWN_M7_SEQUENCE_EXTERNAL_PRIOR_MISMATCH');
 return Object.freeze({stages:Object.freeze(stages),externalProducer:[...external][0]??null});
}

export async function runOwnM7StageSequence({root,major,reviewFile,baseline,from,through,outDir,externalPrior,log=line=>console.log(JSON.stringify(line)),deps={}}){
 const d={head:gitHead,show:gitShow,prepare:prepareOwnM7CommittedReview,assertReview:assertOwnM7ReviewBytes,custody:ownM7CommittedSourceClosure,readPrior:readOwnM7PriorReceipts,writer:createOwnM7RecordWriter,execute:executeOwnM7Stage,clients:{ownReleaseClient,ownReleaseAnnulmentClient},...deps};
 assert.ok([17,18].includes(major),'OWN_M7_SEQUENCE_MAJOR');assert.ok(['pre107','published107'].includes(baseline),'OWN_M7_EXPLICIT_BASELINE_REQUIRED');
 const verification=path.join(root,'verification')+path.sep,inside=file=>{const abs=path.resolve(root,file);assert.ok(abs.startsWith(verification),'OWN_M7_SEQUENCE_VERIFICATION_PATH');return abs;};
 const review=inside(reviewFile),dir=inside(outDir);assert.ok(!fs.existsSync(dir),'OWN_M7_SEQUENCE_OUTDIR_EXISTS');
 const outRel=path.relative(root,dir).split(path.sep).join('/');assert.match(outRel,/^verification\/[A-Za-z0-9_./-]+$/,'OWN_M7_SEQUENCE_OUTDIR_NAME');
 const sourceCommit=d.head(root),selfCommitted=()=>assert.ok(fs.readFileSync(path.join(root,SELF)).equals(d.show(root,sourceCommit,SELF)),'OWN_M7_SEQUENCE_DRIVER_UNCOMMITTED');selfCommitted();
 // CLI order: review RAW first, then the committed composition, then canonical byte equality. Equality also
 // proves review.sourceCommit===HEAD and its baseline, so the 521 MB JSON is never parsed here.
 let reviewRaw=fs.readFileSync(review);const reviewPin={bytes:reviewRaw.length,sha256:sha(reviewRaw)},reviewId=fs.statSync(review,{bigint:true});
 const batch=d.prepare({root,sourceCommit,operationalPairBaseline:baseline});d.assertReview(reviewRaw,batch);reviewRaw=null;
 const plan=planOwnM7Sequence({stageOrder:batch.stageOrder,from,through,externalPrior});
 const pins=new Map();if(plan.externalProducer){const abs=inside(externalPrior);pins.set(plan.externalProducer,{path:path.relative(root,abs).split(path.sep).join('/'),...streamPin(abs)});}
 const recheck=()=>{
  assert.equal(d.head(root),sourceCommit,'OWN_M7_SEQUENCE_HEAD_CHANGED');selfCommitted();
  const id=fs.statSync(review,{bigint:true});assert.ok(id.dev===reviewId.dev&&id.ino===reviewId.ino,'OWN_M7_SEQUENCE_REVIEW_FILE_REPLACED');assert.deepEqual(streamPin(review),reviewPin,'OWN_M7_SEQUENCE_REVIEW_BYTES_CHANGED');
  if(typeof batch.sourceBookend==='function')batch.sourceBookend();
  const fresh=d.custody({root,sourceCommit,consumed:batch.sourceCustody.consumed});
  for(const key of ['sourceClosure','sourceBookend','consumedBinding'])assert.deepEqual(fresh[key],batch.sourceCustody[key],'OWN_M7_SEQUENCE_CUSTODY_CHANGED:'+key);
 };
 fs.mkdirSync(dir);const completed=[];
 for(const [index,stageId] of plan.stages.entries()){
  let phase='recheck';
  try{
   recheck();
   const producer=ownM7PriorProducer(batch.stageOrder,stageId),pin=producer?pins.get(producer):undefined;
   if(producer){assert.ok(pin,'OWN_M7_SEQUENCE_PRIOR_REQUIRED');assert.deepEqual(streamPin(path.resolve(root,pin.path)),{bytes:pin.bytes,sha256:pin.sha256},'OWN_M7_SEQUENCE_PRIOR_CHANGED');}
   phase='prior-receipts';const prior=d.readPrior({root,file:pin?.path,batch,stageId,major});
   if(producer){
    const selected=Object.values(prior?.links??{}).filter(link=>link?.path===pin.path);
    assert.equal(selected.length,1,'OWN_M7_SEQUENCE_PRIOR_PIN_HANDOFF_REQUIRED');
    assert.deepEqual(selected[0],pin,'OWN_M7_SEQUENCE_PRIOR_CHANGED');
   }
   const output=`${outRel}/${major}-${stageId}.json`;
   if(prior)for(const link of Object.values(prior.links))assert.notEqual(path.resolve(root,link.path),path.resolve(root,output),'OWN_M7_PRIOR_OUTPUT_COLLISION');
   const record=d.writer({root,file:output});phase='installation';
   const result=await d.execute({batch,stageId,major,prior,record,client:stageId===OWN_M7_ANNULMENT_TAIL_STAGE?d.clients.ownReleaseAnnulmentClient:d.clients.ownReleaseClient});
   assert.equal(result?.state,'VALIDATED','OWN_M7_SEQUENCE_STAGE_NOT_VALIDATED');
   phase='output-pin';const outputPin={path:output,...streamPin(path.resolve(root,output))};pins.set(stageId,outputPin);completed.push(stageId);
   log({stage:stageId,installed:result.installed,durabilityVerified:result.durabilityVerified,repeated:result.repeated,major,sourceCommit,output,outputSha256:outputPin.sha256,businessOperations:0,nominalRowsReturned:0});
  }catch(error){
   log({ok:false,stage:stageId,phase,code:ownReleaseErrorCode(error,'OWN_M7_STAGE_UNVALIDATED'),uncertain:error?.uncertain===true,completed:[...completed],notStarted:plan.stages.slice(index+1),automaticRetry:false,noFurtherSql:true});
   if(error&&typeof error==='object')logged.add(error);throw error;
  }
 }
 return Object.freeze({sourceCommit,major,completed:Object.freeze(completed),compositions:1});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const args={};for(const a of process.argv.slice(2)){const m=/^--(major|review|baseline|from|through|outdir|prior)=(.+)$/.exec(a);assert.ok(m,'OWN_M7_SEQUENCE_ARGUMENT');assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
  await runOwnM7StageSequence({root:path.resolve(import.meta.dirname,'..'),major:Number(args.major),reviewFile:args.review,baseline:args.baseline,from:args.from,through:args.through,outDir:args.outdir,externalPrior:args.prior});
 }catch(e){if(!logged.has(e))console.error(JSON.stringify({ok:false,code:ownReleaseErrorCode(e,'OWN_M7_INSTALL_FAILED'),automaticRetry:false}));process.exitCode=1;}
}
