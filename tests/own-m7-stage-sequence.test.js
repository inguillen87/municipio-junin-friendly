// Causal sequence units. Transport, clients, Git and full-batch composition are fake.
// Real prior/writer ABI checks use only the synthetic filesystem and fake Windows attributes.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';

const repo=path.resolve(import.meta.dirname,'..');
const SELF='scripts/run-own-m7-schema-batch-sequence.mjs',COMMIT='a'.repeat(40);
const driverBytes=fs.readFileSync(path.join(repo,SELF));
const hash=b=>createHash('sha256').update(b).digest('hex'),bytes=v=>Buffer.from(JSON.stringify(v,null,2)+'\n');
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'municontrol-m7-sequence-'));
assert.equal(fs.lstatSync(scratch).isSymbolicLink(),false);
const safety={simulatedWindowsAttributeCalls:0,realChildAttempts:0,realNetworkAttempts:0};
const savedCp=new Map(['execFileSync','execSync','spawnSync','spawn','exec','execFile','fork'].map(k=>[k,cp[k]]));
for(const key of savedCp.keys())cp[key]=(...args)=>{
 if(key==='execFileSync'&&args[0]==='powershell.exe'&&args[1].at(-1).includes('MUNICONTROL_M7_CUSTODY_PATHS')){
  const names=JSON.parse(args[2].env.MUNICONTROL_M7_CUSTODY_PATHS);assert.ok(names.every(p=>path.resolve(p).toLowerCase().startsWith(scratch.toLowerCase()+path.sep)));
  safety.simulatedWindowsAttributeCalls++;return names.map(()=>0).join('\r\n')+'\r\n';
 }
 safety.realChildAttempts++;throw Error('REAL_CHILD_PROCESS_FORBIDDEN:'+key);
};
const savedFetch=globalThis.fetch;globalThis.fetch=async()=>{safety.realNetworkAttempts++;throw Error('REAL_NETWORK_FORBIDDEN');};
syncBuiltinESMExports();
const rootUrl=file=>pathToFileURL(path.join(repo,file)).href;
const driver=await import(rootUrl(SELF));
const {readOwnM7PriorReceipts,assertOwnM7PriorForStage,createOwnM7RecordWriter}=await import(rootUrl('scripts/lib/own-m7-prior-receipts.mjs'));
const {M10_PUBLIC_STAGE_ORDER}=await import(rootUrl('scripts/lib/own-m10-public-schema-plan.mjs'));
const {publicPrerequisiteDefinitions}=await import(rootUrl('scripts/lib/own-m7-public-schema-batch.mjs'));
const {composeOwnM7PublicNovelty217,assertOwnM7PublicNovelty217Durability}=await import(rootUrl('scripts/lib/own-m7-public-novelty217-source.mjs'));
const CORE=['policy192','declaration193','engine194','fixed196','novelty197','novelty217','census200','capacity201','bootstrap213','snapshot214','snapshot215','annul208209'];
const ORDER=[...CORE,...M10_PUBLIC_STAGE_ORDER.map(id=>'m10-'+id)];
after(()=>{
 assert.equal(safety.realChildAttempts,0);assert.equal(safety.realNetworkAttempts,0);
 for(const[key,fn]of savedCp)cp[key]=fn;globalThis.fetch=savedFetch;syncBuiltinESMExports();
 assert.deepEqual(fs.readdirSync(scratch),[]);fs.rmdirSync(scratch);
 console.log('M7_SEQUENCE_UNIT_SAFETY '+JSON.stringify({...safety,realSqlCalls:0,reviewBytesMaximum:140,fullBatchCompositions:0}));
});

function fixture(t,{from='novelty217',through='capacity201',externalPrior}={}){
 const root=fs.mkdtempSync(path.join(scratch,'case-'));
 t.after(()=>{
  const checked=path.resolve(root),parent=path.resolve(scratch);
  assert.ok(checked.toLowerCase().startsWith(parent.toLowerCase()+path.sep));
  assert.equal(fs.lstatSync(checked).isSymbolicLink(),false);
  assert.ok(fs.realpathSync.native(checked).toLowerCase().startsWith(fs.realpathSync.native(parent).toLowerCase()+path.sep));
  fs.rmSync(checked,{recursive:true,force:false});
 });
 fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'verification'));
 fs.writeFileSync(path.join(root,SELF),driverBytes);
 const reviewFile='verification/review.json',review=path.join(root,reviewFile),reviewRaw=bytes({sourceCommit:COMMIT,operationalPairBaseline:'published107',synthetic:true});
 assert.ok(reviewRaw.length<=140);fs.writeFileSync(review,reviewRaw);const source=path.join(root,'consumed.sql');fs.writeFileSync(source,'SYNTHETIC SOURCE ONLY\n');
 const state={heads:0,shows:0,prepare:0,assertReview:0,custody:0,bookends:0,trace:[],executed:[],writers:[],priorCalls:[],clients:[],logs:[],records:new Map(),realPrior:false,realWriter:false};
 const sourceCustody={sourceClosure:{files:{'consumed.sql':hash(fs.readFileSync(source))}},sourceBookend:{passed:true,synthetic:true},consumedBinding:{count:1,synthetic:true},consumed:[{file:'consumed.sql',bytes:22,sha256:hash(fs.readFileSync(source))}]};
 const batch={sourceCommit:COMMIT,stageOrder:ORDER,sourceCustody,sourceBookend:()=>{
  state.bookends++;state.trace.push('sourceBookend');state.onBookend?.(state.bookends);
  assert.equal(fs.readFileSync(source,'utf8'),'SYNTHETIC SOURCE ONLY\n','SYNTHETIC_CONSUMED_SOURCE_DRIFT');
 }};
 const pinFile=file=>{const raw=fs.readFileSync(path.resolve(root,file));return{path:file,bytes:raw.length,sha256:hash(raw)};};
 const output=id=>'verification/out/17-'+id+'.json';
 const clients={ownReleaseClient:async()=>{state.clients.push('ordinary');return{synthetic:true};},ownReleaseAnnulmentClient:async()=>{state.clients.push('annulment');return{synthetic:true};}};
 const deps={
  head:given=>{assert.equal(given,root);state.heads++;state.trace.push('head');return state.headValue?.(state.heads)??COMMIT;},
  show:(given,commit,file)=>{assert.equal(given,root);assert.equal(commit,COMMIT);assert.equal(file,SELF);state.shows++;return Buffer.from(driverBytes);},
  prepare:given=>{state.prepare++;assert.deepEqual(given,{root,sourceCommit:COMMIT,operationalPairBaseline:'published107'});return batch;},
  assertReview:(raw,given)=>{state.assertReview++;assert.strictEqual(given,batch);assert.deepEqual(raw,reviewRaw);state.onAssertReview?.();},
  custody:given=>{state.custody++;state.trace.push('custody');assert.strictEqual(given.consumed,sourceCustody.consumed);return structuredClone(sourceCustody);},
  readPrior:args=>{
   state.priorCalls.push(args);state.trace.push('readPrior:'+args.stageId);assert.strictEqual(args.batch,batch);assert.equal(args.major,17);state.onReadPrior?.(args);
   if(state.realPrior)return readOwnM7PriorReceipts(args);
   const producer=driver.ownM7PriorProducer(ORDER,args.stageId);
   if(!producer){assert.equal(args.file,undefined);return undefined;}
   assert.equal(typeof args.file,'string');const pin=pinFile(args.file);
   const key=producer==='novelty217'?'novelty217Prior':producer==='capacity201'?'capacity201Prior':producer==='annul208209'?'annulmentPrior':'m10Prior';
   return{links:{[key]:pin},recheck:()=>assert.deepEqual(pinFile(args.file),pin)};
  },
  writer:args=>{
   state.writers.push(args.file);state.trace.push('writer:'+path.basename(args.file));assert.equal(args.root,root);
   if(state.realWriter)return createOwnM7RecordWriter(args);
   const file=path.resolve(root,args.file);assert.equal(fs.existsSync(file),false);let first=true;
   return value=>{fs.writeFileSync(file,bytes(value),{flag:first?'wx':'w'});first=false;state.records.set(args.file,structuredClone(value));};
  },
  execute:async args=>{
   state.executed.push(args.stageId);state.trace.push('execute:'+args.stageId);assert.strictEqual(args.batch,batch);assert.equal(args.major,17);
   if(state.realPrior)assertOwnM7PriorForStage({prior:args.prior,batch,stageId:args.stageId,major:17});else args.prior?.recheck();
   await args.client();state.onExecute?.(args);
   if(state.throwAt===args.stageId){args.record({stage:args.stageId,state:'UNCERTAIN',noFurtherSql:true,automaticRetry:false});throw Object.assign(Error('SYNTHETIC_UNCERTAIN'),{uncertain:true});}
   const record=state.recordFor?.(args.stageId)??{stage:args.stageId,sourceCommit:COMMIT,state:state.nonValidatedAt===args.stageId?'PENDING':'VALIDATED',installed:true,durabilityVerified:true,repeated:false,...args.prior?.links};
   args.record(record);state.afterExecute?.(args);return record;
  },clients
 };
 const options={root,major:17,reviewFile,baseline:'published107',from,through,outDir:'verification/out',...(externalPrior?{externalPrior}:{}),deps,log:value=>state.logs.push(value)};
 return{root,review,reviewRaw,source,state,batch,deps,options,output,pinFile,run:()=>driver.runOwnM7StageSequence(options)};
}

let tiny;
function canonical217(){
 // One pure217 source fixture only, never the complete review/prepare and never SQL.
 if(!tiny){const read=file=>fs.readFileSync(path.join(repo,file),'utf8');tiny=composeOwnM7PublicNovelty217({read,sourceCommit:COMMIT,operationalPairBaseline:'published107',prerequisites:publicPrerequisiteDefinitions(read)});}
 return tiny;
}
function mock217(objectSha='3'.repeat(64)){
 const p=canonical217(),source=p.source217,targetPlan=p.targets[0],target={...targetPlan.target,transport:'neon_https',postgresSsl:true};
 const installed={version:source.version,sourceCommit:COMMIT,sourceHashes:source.sourceHashes,mode:'install',...source.counters,transactionDataPreserved:true,preservationSha256:'1'.repeat(64),priorMetadataSha256:'2'.repeat(64),objectSha256:objectSha};
 const durable={...installed,mode:'verify',transactionDataPreserved:false},repeated={...installed,mode:'verify'};
 return{stage:'novelty217',version:source.version,sourceCommit:COMMIT,target,phase:'complete',state:'VALIDATED',preflight:true,rehearsed:true,installed:true,durableObserved:true,durabilityVerified:true,repeated:true,businessOperations:0,nominalRowsReturned:0,automaticRetry:false,installedProof:installed,durableProof:durable,repeatedProof:repeated,validation:assertOwnM7PublicNovelty217Durability({targetPlan,installed,durable,repeated}),validatedReceiptCount:3,nativeEquivalencePublicIncluded:false};
}
function useRealPrior(f){
 const p=canonical217();f.batch.targets=[{...p.targets[0].target,stageBatches:{novelty217:p.targets[0]}}];f.batch.stageBatches={capacity201:p.capacity201};f.state.realPrior=true;
 f.state.recordFor=id=>id==='novelty217'?mock217():{stage:id,sourceCommit:COMMIT,state:'VALIDATED',installed:true,durabilityVerified:true,repeated:false};
}

test('U1: three stages use one prepare/assertReview and the SAME batch',async t=>{
 const f=fixture(t),result=await f.run();assert.equal(f.state.prepare,1);assert.equal(f.state.assertReview,1);assert.equal(f.state.custody,3);assert.equal(f.state.bookends,3);
 assert.deepEqual(f.state.executed,['novelty217','census200','capacity201']);assert.deepEqual(result.completed,f.state.executed);assert.equal(result.compositions,1);
 assert.equal(f.state.shows,4);assert.deepEqual(f.state.clients,['ordinary','ordinary','ordinary']);
});
test('U2: each stage rechecks review/source/custody/prior BEFORE its writer and executor',async t=>{
 const f=fixture(t),open=fs.openSync,stat=fs.statSync;
 fs.openSync=function(file,flags,...args){if(flags==='r'&&path.resolve(String(file))===f.review)f.state.trace.push('review-pin');else if(flags==='r'&&String(file).endsWith('17-novelty217.json'))f.state.trace.push('prior-pin');return open.call(fs,file,flags,...args);};
 fs.statSync=function(file,...args){if(path.resolve(String(file))===f.review)f.state.trace.push('review-stat');return stat.call(fs,file,...args);};
 try{await f.run();}finally{fs.openSync=open;fs.statSync=stat;}
 const heads=f.state.trace.flatMap((v,i)=>v==='head'?[i]:[]).slice(1);
 for(const[index,id]of f.state.executed.entries()){
  const end=f.state.trace.indexOf('execute:'+id,heads[index]),segment=f.state.trace.slice(heads[index],end+1),at=value=>{const n=segment.indexOf(value);assert.ok(n>=0,value);return n;};
  assert.ok(at('head')<at('review-stat')&&at('review-stat')<at('review-pin')&&at('review-pin')<at('sourceBookend')&&at('sourceBookend')<at('custody'));
  assert.ok(at('custody')<at('readPrior:'+id)&&at('readPrior:'+id)<at('writer:17-'+id+'.json')&&at('writer:17-'+id+'.json')<at('execute:'+id));
  if(index>0)assert.ok(at('custody')<at('prior-pin')&&at('prior-pin')<at('readPrior:'+id));
 }
});
test('U3: changed consumed source stops stage2 before prior/writer/client',async t=>{
 const f=fixture(t);f.state.afterExecute=({stageId})=>{if(stageId==='novelty217')fs.writeFileSync(f.source,'changed\n');};
 await assert.rejects(f.run,/SYNTHETIC_CONSUMED_SOURCE_DRIFT/);assert.deepEqual(f.state.executed,['novelty217']);assert.equal(f.state.priorCalls.length,1);assert.equal(f.state.writers.length,1);assert.equal(f.state.clients.length,1);assert.equal(fs.existsSync(path.join(f.root,f.output('census200'))),false);
});
test('U4: moved HEAD, replaced review, changed byte and uncommitted SELF all stop before execution',async t=>{
 for(const kind of ['head','replace','byte','self']){
  const f=fixture(t);
  if(kind==='head')f.state.headValue=n=>n===1?COMMIT:'b'.repeat(40);
  if(kind==='replace')f.state.onAssertReview=()=>{fs.renameSync(f.review,f.review+'.kept-inode');fs.writeFileSync(f.review,f.reviewRaw);};
  if(kind==='byte')f.state.onAssertReview=()=>{const changed=Buffer.from(f.reviewRaw);changed[0]^=1;fs.writeFileSync(f.review,changed);};
  if(kind==='self')fs.appendFileSync(path.join(f.root,SELF),'\n// uncommitted\n');
  const expected={head:/HEAD_CHANGED/,replace:/REVIEW_FILE_REPLACED/,byte:/REVIEW_BYTES_CHANGED/,self:/DRIVER_UNCOMMITTED/}[kind];
  await assert.rejects(f.run,expected);assert.equal(f.state.executed.length,0);assert.equal(f.state.writers.length,0);assert.equal(f.state.clients.length,0);
 }
});
test('U5: UNCERTAIN stage2 throws, records notStarted and NEVER starts stage3',async t=>{
 const f=fixture(t);f.state.throwAt='census200';await assert.rejects(f.run,e=>e.uncertain===true);
 assert.deepEqual(f.state.executed,['novelty217','census200']);assert.equal(f.state.priorCalls.length,2);assert.equal(f.state.writers.length,2);assert.equal(f.state.clients.length,2);
 const stop=f.state.logs.at(-1);assert.equal(stop.uncertain,true);assert.equal(stop.automaticRetry,false);assert.equal(stop.noFurtherSql,true);assert.deepEqual(stop.completed,['novelty217']);assert.deepEqual(stop.notStarted,['capacity201']);
});
test('U6: a non-VALIDATED return stops before the next stage',async t=>{
 const f=fixture(t);f.state.nonValidatedAt='census200';await assert.rejects(f.run,/STAGE_NOT_VALIDATED/);assert.deepEqual(f.state.executed,['novelty217','census200']);assert.equal(f.state.priorCalls.length,2);assert.equal(f.state.writers.length,2);assert.deepEqual(f.state.logs.at(-1).notStarted,['capacity201']);
});
test('U7: internal/external prior rules, pin mutation, and VALID A-to-B handoff race',async t=>{
 assert.deepEqual(driver.planOwnM7Sequence({stageOrder:ORDER,from:'census200',through:'capacity201',externalPrior:'verification/external.json'}).externalProducer,'novelty217');
 assert.throws(()=>driver.planOwnM7Sequence({stageOrder:ORDER,from:'census200',through:'capacity201'}),/EXTERNAL_PRIOR_MISMATCH/);
 assert.throws(()=>driver.planOwnM7Sequence({stageOrder:ORDER,from:'novelty217',through:'capacity201',externalPrior:'verification/no.json'}),/EXTERNAL_PRIOR_MISMATCH/);
 const external=fixture(t,{from:'census200',through:'capacity201',externalPrior:'verification/external.json'});fs.writeFileSync(path.join(external.root,'verification/external.json'),bytes({synthetic:'external217'}));await external.run();assert.ok(external.state.priorCalls.every(c=>c.file==='verification/external.json'));
 const changed=fixture(t,{through:'census200'});changed.state.onBookend=n=>{if(n===2)fs.appendFileSync(path.join(changed.root,changed.output('novelty217')),' ');};
 let pinError;try{await changed.run();}catch(error){pinError=error;}assert.ok(pinError);assert.deepEqual(changed.state.executed,['novelty217']);assert.equal(changed.state.priorCalls.length,1);
 const race=fixture(t,{through:'census200'});useRealPrior(race);let selectedA,selectedB;
 race.state.onReadPrior=args=>{if(args.stageId==='census200'){selectedA=race.pinFile(args.file);fs.writeFileSync(path.resolve(race.root,args.file),bytes(mock217('9'.repeat(64))));selectedB=race.pinFile(args.file);assert.notDeepEqual(selectedA,selectedB);}};
 let caught;try{await race.run();}catch(error){caught=error;}
 t.diagnostic(JSON.stringify({causalPriorRace:{validAAndB:true,changedWithinReadPrior:true,executed:race.state.executed,writers:race.state.writers,selectedHashChanged:selectedA?.sha256!==selectedB?.sha256,error:caught?.message?.split('\n')[0]??null}}));
 assert.ok(caught,'VALID_PRIOR_B_REPLACED_DRIVER_PIN_A_BUT_WAS_EXECUTED');assert.match(caught.message,/PRIOR_CHANGED|PRIOR_PIN_HANDOFF/);
 assert.deepEqual(race.state.executed,['novelty217']);assert.equal(race.state.writers.length,1);assert.equal(fs.existsSync(path.join(race.root,race.output('census200'))),false);
 assert.match(pinError.message,/PRIOR_CHANGED/);
});
test('U8: invalid/backward ranges and existing outdir never create a writer or executor',async t=>{
 for(const range of [{from:'capacity201',through:'novelty217'},{from:'unknown',through:'capacity201'}]){const f=fixture(t,range);await assert.rejects(f.run,/RANGE_INVALID/);assert.equal(f.state.writers.length,0);assert.equal(f.state.executed.length,0);}
 const f=fixture(t);fs.mkdirSync(path.join(f.root,'verification/out'));await assert.rejects(f.run,/OUTDIR_EXISTS/);assert.equal(f.state.prepare,0);assert.equal(f.state.writers.length,0);assert.equal(f.state.executed.length,0);
});
test('U9: SAME fake executor produces canonical CLI-identical bytes accepted by REAL prior reader',async t=>{
 const f=fixture(t,{through:'novelty217'});useRealPrior(f);f.state.realWriter=true;await f.run();
 const ordinaryOutput='verification/ordinary-cli-217.json';
 const prior=readOwnM7PriorReceipts({root:f.root,file:undefined,batch:f.batch,stageId:'novelty217',major:17});
 await f.deps.execute({batch:f.batch,stageId:'novelty217',major:17,prior,record:f.deps.writer({root:f.root,file:ordinaryOutput}),client:f.deps.clients.ownReleaseClient});
 const sequenceRaw=fs.readFileSync(path.join(f.root,f.output('novelty217'))),ordinaryRaw=fs.readFileSync(path.join(f.root,ordinaryOutput));assert.deepEqual(sequenceRaw,ordinaryRaw);
 const sequencePrior=readOwnM7PriorReceipts({root:f.root,file:f.output('novelty217'),batch:f.batch,stageId:'census200',major:17});
 const ordinaryPrior=readOwnM7PriorReceipts({root:f.root,file:ordinaryOutput,batch:f.batch,stageId:'census200',major:17});
 assert.deepEqual(sequencePrior.prior217Record,ordinaryPrior.prior217Record);assert.equal(sequencePrior.links.novelty217Prior.sha256,ordinaryPrior.links.novelty217Prior.sha256);assert.equal(sequencePrior.recheck(),true);assert.equal(ordinaryPrior.recheck(),true);
 assert.strictEqual(assertOwnM7PriorForStage({prior:sequencePrior,batch:f.batch,stageId:'census200',major:17}),sequencePrior);
});
test('U10: a real neon_https 217 record (pg_stat_ssl=false) is accepted as prior; a non-boolean observation is not',async t=>{
 const f=fixture(t,{through:'novelty217'});useRealPrior(f);f.state.realWriter=true;
 const neon=()=>{const r=mock217();return {...r,target:{...r.target,postgresSsl:false}};};
 f.state.recordFor=id=>id==='novelty217'?neon():{stage:id,sourceCommit:COMMIT,state:'VALIDATED',installed:true,durabilityVerified:true,repeated:false};
 await f.run();
 const prior=readOwnM7PriorReceipts({root:f.root,file:f.output('novelty217'),batch:f.batch,stageId:'census200',major:17});
 assert.equal(prior.prior217Record.target.postgresSsl,false);assert.equal(prior.recheck(),true);
 const bad='verification/non-boolean-ssl-217.json',r=neon();r.target={...r.target,postgresSsl:'false'};fs.writeFileSync(path.join(f.root,bad),bytes(r));
 assert.throws(()=>readOwnM7PriorReceipts({root:f.root,file:bad,batch:f.batch,stageId:'census200',major:17}),/M7_PRIOR_SSL_OBSERVATION_REQUIRED/);
});
