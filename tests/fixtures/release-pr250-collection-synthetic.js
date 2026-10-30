// Provider recordings only. Real collectors/validators still run; no admission is injected.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {candidateEvidence} from './release-candidate-synthetic.js';
import {RELEASE_CONTRACT as C} from '../../scripts/release-qualification-contract.mjs';
import {CANDIDATE_WORKFLOWS,PROOF_SOURCE_FILES,M7_RELEASE_FILES,artifactName,digest,fileProof} from '../../scripts/lib/release-candidate-admission.mjs';

const copy=value=>structuredClone(value),json=value=>Buffer.from(JSON.stringify(value)+'\n');
const answer=value=>({exitCode:0,text:JSON.stringify(value)});
export function withPr250Collection(world,{obs,sha,staged,stageRelease}){
 const evidence=candidateEvidence(),events=[],archives=new Map();
 const capacity=CANDIDATE_WORKFLOWS.find(p=>p.key==='capacity');
 const shared=obs.runsPages.flatMap(p=>p.workflow_runs).find(r=>r.path===capacity.file);
 const sharedJobs=obs.jobsPagesByRun[shared.id][0].jobs;
 evidence.source.sha=sha;evidence.source.tree=obs.commit.tree.sha;
 evidence.source.files=Object.fromEntries(PROOF_SOURCE_FILES.map(name=>[name,fs.readFileSync(new URL('../../'+name,import.meta.url))]));
 evidence.deployedFiles['release-info.json']=json(stageRelease);
 const build={version:'municontrol-m7-static-build.v1',commitSha:sha,treeSha:evidence.source.tree,
  files:M7_RELEASE_FILES.map(name=>fileProof(name,evidence.deployedFiles[name]))};
 evidence.deployment={...evidence.deployment,id:staged,url:staged.slice(4)+'.vercel.app',alias:[],gitSource:{sha},meta:{githubCommitSha:sha}};
 for(const [index,record] of evidence.workflows.entries()){
  const policy=CANDIDATE_WORKFLOWS.find(p=>p.key===record.key),isShared=record.key==='capacity';
  record.run={...record.run,...(isShared?shared:{}),id:isShared?shared.id:200+index,
   run_number:isShared?(shared.run_number??51):70+index,head_branch:'master'};
  record.run.head_sha=sha;
  record.run.repository={id:C.repository.id,full_name:C.repository.fullName};
  record.run.head_repository={id:C.repository.id,full_name:C.repository.fullName};
  record.finalRun=copy(record.run);record.latestRun=copy(record.run);
  if(isShared)Object.assign(shared,copy(record.run));
  else{obs.runsPages[0].workflow_runs.push(copy(record.run));obs.runsPages[0].total_count++;}
  for(const [offset,major] of [17,18].entries()){
   const job=record.jobs[offset];job.run_id=record.run.id;
   if(isShared){
    const existing=sharedJobs.find(j=>j.name===policy.jobName(major));
    const steps=existing.steps.map(step=>copy(step));
    for(const step of job.steps)if(!steps.some(old=>old.name===step.name))steps.push(copy(step));
    existing.steps=steps.map((step,n)=>({...step,number:n+1}));
    Object.assign(job,copy(existing));
   }
   const artifact=record.artifacts[offset];
   const report=JSON.parse(artifact.files['report.json']);
   if(isShared)Object.assign(report,Object.fromEntries(Object.entries(C.workflows.find(w=>w.path===capacity.file).jobs.find(j=>j.major===major).report.fields).map(([k,v])=>[k,v==='<sha>'?sha:v])));
   artifact.files['report.json']=json(report);
   artifact.files['release-info.json']=json(stageRelease);artifact.files['build-manifest.json']=json(build);
   const proof=JSON.parse(artifact.files['proof.json']);
   Object.assign(proof,{checkoutSha:sha,eventSha:sha,treeSha:evidence.source.tree,runId:record.run.id,runAttempt:record.run.run_attempt,
    sourceFiles:PROOF_SOURCE_FILES.map(name=>fileProof(name,evidence.source.files[name])),
    files:Object.entries(artifact.files).filter(([name])=>name!=='proof.json').map(([name,bytes])=>fileProof(name,bytes))});
   artifact.files['proof.json']=json(proof);
   const archive=Buffer.from(zipSync(artifact.files,{level:0,mtime:new Date('2000-01-01T00:00:00Z')}));
   artifact.archiveSha256=digest(archive);
   Object.assign(artifact.metadata,{name:artifactName(record.key,major,record.run.id,record.run.run_attempt),digest:'sha256:'+digest(archive),size_in_bytes:archive.length,
    workflow_run:{id:record.run.id,head_sha:sha,head_branch:'master',repository_id:C.repository.id,head_repository_id:C.repository.id}});
   archives.set(artifact.metadata.id,archive);
  }
  const available=record.artifacts.map(a=>a.metadata);
  if(isShared){obs.artifactsPagesByRun[record.run.id][0].artifacts.push(...available);obs.artifactsPagesByRun[record.run.id][0].total_count+=available.length;}
 }
 const originalGet=world.transport.github.get,originalBytes=world.transport.github.bytes;
 world.transport.github.get=async endpoint=>{
  events.push({kind:'github',endpoint});const url=new URL(endpoint,'https://synthetic.invalid/'),pathname=url.pathname.slice(1);
  const page=Number(url.searchParams.get('page')??1),paged=rows=>copy(rows.slice((page-1)*100,page*100));
  if(pathname.startsWith('contents/')){
   const name=pathname.slice('contents/'.length);
   if(!Object.hasOwn(obs.contents,name)&&evidence.source.files[name]){
    world.calls.push('github.candidate.get');const bytes=evidence.source.files[name];
    const blob=createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),bytes])).digest('hex');
    return answer({type:'file',path:name,encoding:'base64',size:bytes.length,sha:blob,content:bytes.toString('base64')});
   }
  }
  for(const record of evidence.workflows){
   const policy=CANDIDATE_WORKFLOWS.find(p=>p.key===record.key),runPath='actions/runs/'+record.run.id;
   if(pathname==='actions/workflows/'+policy.file.split('/').at(-1)+'/runs'){
    world.calls.push('github.candidate.get');return answer({workflow_runs:paged([record.run])});
   }
   if(pathname===runPath){world.calls.push('github.candidate.get');return answer(record.run);}
   if(pathname===runPath+'/attempts/'+record.run.run_attempt+'/jobs'){
    world.calls.push('github.candidate.get');return answer({jobs:paged(record.jobs)});
   }
   if(pathname===runPath+'/artifacts'){
    world.calls.push('github.candidate.get');return answer({artifacts:paged(record.artifacts.map(a=>a.metadata))});
   }
  }
  return originalGet(endpoint);
 };
 world.transport.github.bytes=async endpoint=>{
  const match=/^actions\/artifacts\/(\d+)\/zip$/.exec(endpoint),archive=match&&archives.get(Number(match[1]));
  if(!archive)return originalBytes(endpoint);
  events.push({kind:'artifact',id:Number(match[1])});world.calls.push('github.candidate.bytes');
  return{exitCode:0,bytes:new Uint8Array(archive)};
 };
 const create=world.transport.vercel.createDeployment;
 world.transport.vercel.createDeployment=async(...args)=>{const result=await create(...args);world.state.deployments[staged].alias=[];return result;};
 world.transport.readDeploymentFile=async(deployment,name)=>{
  events.push({kind:'static',name});world.calls.push('candidate.static');
  if(deployment.id!==staged||!M7_RELEASE_FILES.includes(name))return{exitCode:1,bytes:null};
  return{exitCode:0,bytes:new Uint8Array(evidence.deployedFiles[name])};
 };
 world.candidate={evidence,events,archives};return world;
}
