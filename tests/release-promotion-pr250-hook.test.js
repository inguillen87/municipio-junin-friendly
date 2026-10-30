// Proposed pure provider recordings. No CLI, sockets, SQL, credentials or native receipt is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import child from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';

// Install prohibitions before importing the proposed runner and actual PR250 collector.
const forbidden=[];
const deny=kind=>(..._args)=>{forbidden.push(kind);throw new Error('FORBIDDEN_REAL_IO:'+kind);};
globalThis.fetch=deny('fetch');
net.connect=deny('net.connect');net.createConnection=deny('net.createConnection');
tls.connect=deny('tls.connect');child.execFile=deny('execFile');child.spawn=deny('spawn');
syncBuiltinESMExports();
const {runReleaseStage,runReleasePromotion,observeQualification}=await import('../scripts/release-promotion-runner.mjs');
const {collectPromotionCandidate,bindCollectedCandidate,candidateReleaseReaders,deploymentFileReader}=await import('../scripts/lib/release-candidate-promotion-hook.mjs');
const {evaluateQualification}=await import('../scripts/release-qualification-gate.mjs');
const {RELEASE_CONTRACT:C}=await import('../scripts/release-qualification-contract.mjs');
const {M7_RELEASE_FILES}=await import('../scripts/lib/release-candidate-admission.mjs');
const {fakeWorld,observation,SHA,OTHER,STAGED,binding,admission}=await import('./fixtures/release-qualification-synthetic.js');
const packet=()=>fs.mkdtempSync(path.join(os.tmpdir(),'release-pr250-hook-'));
const read=(dir,name)=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const promote=(world,dir,over={})=>runReleasePromotion({sha:SHA,packet:dir,admission:admission(),binding:binding(),adapter:world.adapter,transport:world.transport,pause:world.pause,...over});
async function staged(world){
 const dir=packet();const result=await runReleaseStage({sha:SHA,packet:dir,admission:admission(),transport:world.transport,pause:world.pause});
 assert.equal(result.state,'STAGE_VERIFIED_AWAITING_ROOT_BUILD_BINDING');
 world.calls.length=0;world.candidate.events.length=0;return dir;
}
const noPromotion=world=>assert.ok(!world.calls.some(name=>['vercel.create','adapter.promote','vercel.run'].includes(name)));
async function rejected(world,dir,code){
 await assert.rejects(()=>promote(world,dir),error=>code?error.code===code:/^CANDIDATE_|^REMOTE_BASE_/.test(error.code??''));
 const result=read(dir,'PROMOTION_RESULT.json');assert.equal(result.state,'STOPPED_BEFORE_MUTATION');
 assert.equal(result.mutationRequested,false);assert.equal(result.noFurtherCalls,true);noPromotion(world);
 assert.equal(fs.existsSync(path.join(dir,'PROMOTION_REQUESTED.json')),false);
}

test('PR250 collection is real: eight ZIP proofs, twenty-one static files and ten distinct jobs precede one promotion',async()=>{
 const world=fakeWorld(),dir=await staged(world);const result=await promote(world,dir);
 assert.equal(result.state,'PROMOTED_AND_READ_BACK');
 assert.deepEqual(result.candidate.distinctJobCount,10);assert.equal(result.candidate.sharedCapacityJobs,2);
 assert.equal(result.candidate.proofCount,8);assert.equal(result.candidate.candidateSha,SHA);
 assert.equal(result.candidate.deploymentId,STAGED);assert.match(result.candidate.admissionSha256,/^[a-f0-9]{64}$/);
 assert.equal(world.candidate.events.filter(e=>e.kind==='artifact').length,8);
 assert.deepEqual(world.candidate.events.filter(e=>e.kind==='static').map(e=>e.name),M7_RELEASE_FILES);
 assert.equal(world.calls.filter(c=>c==='adapter.promote').length,1);
 assert.equal(world.calls.filter(c=>c==='vercel.create').length,0);
 const events=world.candidate.events,firstMaster=events.findIndex(e=>e.kind==='github'&&e.endpoint===C.github.masterRef);
 const lastStatic=events.findLastIndex(e=>e.kind==='static');
 const finalSelection=events.findLastIndex(e=>e.kind==='github'&&e.endpoint.startsWith('actions/workflows/'));
 assert.ok(firstMaster>lastStatic&&firstMaster>finalSelection,'all long downloads and PR250 final selections precede fresh qualification');
 const masterReads=events.map((e,i)=>e.endpoint===C.github.masterRef?i:-1).filter(i=>i>=0);
 assert.equal(masterReads.length,2,'fresh qualification plus the last head read; collector does not borrow master');
});

test('no pre-minted or serialized caller admission substitutes a missing PR250 workflow',async()=>{
 const world=fakeWorld(),dir=await staged(world);
 fs.writeFileSync(path.join(dir,'CANDIDATE_ADMISSION.json'),JSON.stringify({admitted:true,candidateSha:SHA,deploymentId:STAGED}));
 const get=world.transport.github.get;
 world.transport.github.get=async endpoint=>endpoint.startsWith('actions/workflows/own-payroll-receipts.yml/runs')
  ?{exitCode:0,text:JSON.stringify({workflow_runs:[]})}:get(endpoint);
 await rejected(world,dir,'CANDIDATE_WORKFLOW_MISSING');
});

test('the eight PR250 proofs never replace a failed Noelia PG18 job in the final fresh gate',async()=>{
 const obs=observation(),world=fakeWorld({obs}),dir=await staged(world);
 obs.jobsPagesByRun[100][0].jobs[1].conclusion='failure';
 const result=await promote(world,dir);
 assert.equal(result.state,'NOT_QUALIFIED_NO_MUTATION');assert.equal(result.mutationRequested,false);
 assert.equal(world.candidate.events.filter(e=>e.kind==='artifact').length,8);
 noPromotion(world);assert.equal(fs.existsSync(path.join(dir,'PROMOTION_REQUESTED.json')),false);
});

test('a missing PG18, failed job, failed critical step and expired proof each stop before promotion',async()=>{
 const changes=[
  record=>record.jobs.splice(1,1),
  record=>record.jobs[1].conclusion='failure',
  record=>record.jobs[0].steps.find(s=>s.name==='Record release candidate evidence').conclusion='skipped',
  record=>record.artifacts[1].metadata.expired=true
 ];
 for(const change of changes){const world=fakeWorld(),dir=await staged(world);change(world.candidate.evidence.workflows.find(w=>w.key==='reports'));await rejected(world,dir);}
});

test('running/cancelled latest PR250 run cannot borrow an older success',async()=>{
 for(const [status,conclusion] of [['in_progress',null],['completed','cancelled']]){
  const world=fakeWorld(),dir=await staged(world),record=world.candidate.evidence.workflows.find(w=>w.key==='receipts');
  record.run.status=status;record.run.conclusion=conclusion;await rejected(world,dir,'CANDIDATE_RUN_NOT_SUCCESSFUL');
 }
});

test('a new attempt observed after downloads invalidates the original success without retry',async()=>{
 const world=fakeWorld(),dir=await staged(world),get=world.transport.github.get;
 let downloadSeen=false;
 const staticRead=world.transport.readDeploymentFile;
 world.transport.readDeploymentFile=async(...args)=>{downloadSeen=true;return staticRead(...args);};
 world.transport.github.get=async endpoint=>{
  const answer=await get(endpoint);
  if(downloadSeen&&endpoint.startsWith('actions/workflows/own-payroll-calculation.yml/runs')){
   const value=JSON.parse(answer.text);value.workflow_runs[0]={...value.workflow_runs[0],run_attempt:3,status:'in_progress',conclusion:null};
   return{exitCode:0,text:JSON.stringify(value)};
  }
  return answer;
 };
 await rejected(world,dir,'CANDIDATE_RUN_NOT_SUCCESSFUL');
});

test('artifact corruption and unreadable anonymous static bytes stop at the first failed read',async()=>{
 const corrupted=fakeWorld(),d1=await staged(corrupted),artifact=corrupted.candidate.evidence.workflows[0].artifacts[0];
 corrupted.candidate.archives.set(artifact.metadata.id,Buffer.from('not the downloaded ZIP'));
 await rejected(corrupted,d1,'CANDIDATE_ARTIFACT_DIGEST_CHANGED');
 assert.equal(corrupted.candidate.events.filter(e=>e.kind==='artifact').length,1);
 assert.equal(corrupted.candidate.events.filter(e=>e.kind==='static').length,0);
 const unavailable=fakeWorld(),d2=await staged(unavailable);let reads=0;
 unavailable.transport.readDeploymentFile=async()=>{reads++;return{exitCode:401,bytes:null};};
 await rejected(unavailable,d2,'TRANSPORT_AMBIGUOUS:candidate-static');assert.equal(reads,1);
});

test('tree observed by the final qualification must equal the tree admitted by PR250',async()=>{
 const world=fakeWorld(),dir=await staged(world),get=world.transport.github.get;let commits=0;
 world.transport.github.get=async endpoint=>{
  const answer=await get(endpoint);
  if(endpoint==='git/commits/'+SHA&&++commits===2){const value=JSON.parse(answer.text);value.tree.sha=OTHER;return{exitCode:0,text:JSON.stringify(value)};}
  return answer;
 };
 await rejected(world,dir,'CANDIDATE_RELEASE_IDENTITY_MISMATCH');assert.equal(commits,2);
});

test('same major with different capacity job or attempt cannot count as the shared two jobs',async()=>{
 for(const different of ['jobId','runAttempt']){
  const world=fakeWorld(),dir=await staged(world);
  const candidate=await collectPromotionCandidate({sha:SHA,deploymentId:STAGED,transport:world.transport});
  const actual=evaluateQualification({sha:SHA,observation:await observeQualification({sha:SHA,github:world.transport.github})});
  assert.equal(actual.qualified,true);const qualified=structuredClone(actual);
  const run=qualified.evidence.runs.find(r=>r.path.endsWith('/own-payroll-full-capacity.yml'));
  if(different==='jobId')run.jobs[0].jobId=987654;else run.runAttempt++;
  assert.throws(()=>bindCollectedCandidate(candidate,qualified,read(dir,'STAGE_VERIFIED.json')),e=>e.code==='CANDIDATE_RELEASE_CAPACITY_NOT_SHARED');
  noPromotion(world);
 }
});

test('a cloned WeakSet receipt and a changed deployment are rejected even with admitted true',async()=>{
 const world=fakeWorld(),dir=await staged(world);
 const candidate=await collectPromotionCandidate({sha:SHA,deploymentId:STAGED,transport:world.transport});
 const qualified=evaluateQualification({sha:SHA,observation:await observeQualification({sha:SHA,github:world.transport.github})});
 const stage=read(dir,'STAGE_VERIFIED.json');
 assert.throws(()=>bindCollectedCandidate({...candidate},qualified,stage),e=>e.code==='REMOTE_BASE_CANDIDATE_ADMISSION_REQUIRED');
 assert.throws(()=>bindCollectedCandidate(candidate,qualified,{...stage,deploymentId:'dpl_foreign'}),e=>e.code==='CANDIDATE_RELEASE_IDENTITY_MISMATCH');
 noPromotion(world);
});

test('missing read adapter or foreign GitHub endpoint fails without trying another transport',async()=>{
 const world=fakeWorld();delete world.transport.readDeploymentFile;
 assert.throws(()=>candidateReleaseReaders(world.transport),e=>e.code==='CANDIDATE_READ_ADAPTER_REQUIRED');
 const other=fakeWorld(),readers=candidateReleaseReaders(other.transport);
 await assert.rejects(()=>readers.getGithub('/repos/someone/foreign/actions/runs'),e=>e.code==='CANDIDATE_GITHUB_ENDPOINT_INVALID');
 assert.deepEqual(other.calls,[]);
});

test('anonymous static reader only GETs closed files, refuses redirects/protection and bounds streamed bytes',async()=>{
 const calls=[];
 const response=chunks=>({status:200,body:{getReader:()=>{let i=0;return{read:async()=>i<chunks.length?{done:false,value:chunks[i++]}:{done:true},cancel:async()=>{},releaseLock:()=>{}};}}});
 let next=response([new Uint8Array([1,2])]);
 const reader=deploymentFileReader({fetchImpl:async(url,options)=>{calls.push({url,options});return next;}});
 const deployment={id:STAGED,url:'staged1.vercel.app'};
 assert.deepEqual(await reader(deployment,'nomina-control.html'),{exitCode:0,bytes:new Uint8Array([1,2])});
 assert.ok(calls[0].url.startsWith('https://staged1.vercel.app/nomina?release='));
 assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
 assert.equal(Object.hasOwn(calls[0].options,'headers'),false);
 const count=calls.length;
 assert.equal((await reader({...deployment,url:'foreign.example'},'release-info.json')).exitCode,1);
 assert.equal((await reader(deployment,'api/internal-actions')).exitCode,1);assert.equal(calls.length,count);
 for(const status of [302,401,403,404]){next={status};assert.equal((await reader(deployment,'release-info.json')).exitCode,1);}
 next=response([new Uint8Array(16*1024*1024),new Uint8Array([0])]);
 assert.equal((await reader(deployment,'release-info.json')).exitCode,1);
});

test.after(()=>assert.deepEqual(forbidden,[],'none of the proposed pure cases invoked real I/O'));
