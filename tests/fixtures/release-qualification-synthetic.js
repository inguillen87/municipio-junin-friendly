// PROPOSED by Claude (source only; not run by Claude). Target: tests/fixtures/release-qualification-synthetic.js
// Synthetic provider answers shaped like the GitHub/Vercel objects already read by root's sources.
// Workflow, package.json and vercel.json bytes are the repository's own files, so the fixture also
// fails if the reviewed contract and the repository drift apart.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {RELEASE_CONTRACT as C} from '../../scripts/release-qualification-contract.mjs';
import {stageBuildCommand} from '../../scripts/release-qualification-gate.mjs';
import {OWN_RELEASE_TARGETS} from '../../scripts/lib/own-payroll-release-target.mjs';
import {ATTESTATION_VERSION} from '../../scripts/verify-vercel-build-db-attestation.mjs';
import {withPr250Collection} from './release-pr250-collection-synthetic.js';

export const SHA='a'.repeat(40),OTHER='b'.repeat(40),TREE='c'.repeat(40),ADMIN='d'.repeat(64),PREVIOUS_ADMIN='e'.repeat(64);
export const PREVIOUS='dpl_previous1',STAGED='dpl_staged1';
export const hash=v=>createHash('sha256').update(v).digest('hex');
const blob=b=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),Buffer.from(b)])).digest('hex');
export const enc=v=>new Uint8Array(Buffer.from(typeof v==='string'?v:JSON.stringify(v,null,2)+'\n'));
export const repoBytes=p=>new Uint8Array(fs.readFileSync(new URL('../../'+p,import.meta.url)));
export const contentAnswer=(p,bytes=repoBytes(p))=>({type:'file',encoding:'base64',path:p,size:bytes.length,sha:blob(bytes),
 content:Buffer.from(bytes).toString('base64').replace(/.{60}/g,'$&\n')});

/** Deflated entries with data descriptors and sizes in the central directory, like upload-artifact ZIPs. */
export function zipOf(files){
 const locals=[],centrals=[];let offset=0;
 for(const [name,content] of Object.entries(files)){
  const data=Buffer.from(content),deflated=zlib.deflateRawSync(data),nameBytes=Buffer.from(name),crc=zlib.crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,6);local.writeUInt16LE(8,8);local.writeUInt16LE(nameBytes.length,26);
  const descriptor=Buffer.alloc(16);descriptor.writeUInt32LE(0x08074b50,0);descriptor.writeUInt32LE(crc,4);descriptor.writeUInt32LE(deflated.length,8);descriptor.writeUInt32LE(data.length,12);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(8,8);central.writeUInt16LE(8,10);
  central.writeUInt32LE(crc,16);central.writeUInt32LE(deflated.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBytes.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,nameBytes,deflated,descriptor);centrals.push(central,nameBytes);offset+=30+nameBytes.length+deflated.length+16;
 }
 const cd=Buffer.concat(centrals),eocd=Buffer.alloc(22),count=Object.keys(files).length;
 eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(count,8);eocd.writeUInt16LE(count,10);eocd.writeUInt32LE(cd.length,12);eocd.writeUInt32LE(offset,16);
 return new Uint8Array(Buffer.concat([...locals,cd,eocd]));
}
export const reportFor=(spec,sha=SHA,over={})=>({...Object.fromEntries(Object.entries(spec.report.fields).map(([k,v])=>[k,v==='<sha>'?sha:v])),checks:1,...over});
// Real successful jobs end every step completed/success, including GitHub's own setup/post steps.
export const stepsFor=w=>['Set up job','Initialize containers','Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',...w.steps,
 'Post Run actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1','Stop containers','Complete job'].map((name,i)=>({number:i+1,name,status:'completed',conclusion:'success'}));
export const reportZip=(w,spec,report=reportFor(spec))=>zipOf({'other-ci/result.json':'{}',[(w===C.workflows[0]?'':'verification/')+spec.report.entry]:JSON.stringify(report)});

export function observation(){
 const R=C.repository,jobsPagesByRun={},artifactsPagesByRun={},artifactZips={};let jobId=900,artifactId=500;
 const runs=C.workflows.map((w,i)=>({id:100+i,path:w.path,name:w.name,head_sha:SHA,head_branch:R.productionBranch,event:'push',status:'completed',conclusion:'success',
  run_attempt:1,created_at:`2026-10-28T19:0${i}:00Z`,repository:{id:R.id,full_name:R.fullName},head_repository:{id:R.id,full_name:R.fullName}}));
 C.workflows.forEach((w,i)=>{
  const run=runs[i];
  const jobs=w.jobs.map(spec=>({id:jobId++,run_id:run.id,run_attempt:1,name:spec.name,head_sha:SHA,status:'completed',conclusion:'success',steps:stepsFor(w)}));
  jobsPagesByRun[run.id]=[{total_count:jobs.length,jobs}];
  const artifacts=w.jobs.map(spec=>{const zip=reportZip(w,spec),id=artifactId++;artifactZips[id]=zip;
   return{id,name:spec.artifact.replaceAll('<sha>',SHA),expired:false,digest:'sha256:'+hash(zip),size_in_bytes:zip.length,
    workflow_run:{id:run.id,repository_id:R.id,head_repository_id:R.id,head_branch:R.productionBranch,head_sha:SHA}};});
  artifactsPagesByRun[run.id]=[{total_count:artifacts.length,artifacts}];
 });
 const contents=Object.fromEntries(['package.json','vercel.json',...C.workflows.map(w=>w.path),...C.pinnedSources.map(s=>s.path)].map(p=>[p,contentAnswer(p)]));
 return{sha:SHA,masterRef:{ref:'refs/heads/master',object:{sha:SHA,type:'commit'}},commit:{sha:SHA,tree:{sha:TREE}},contents,
  runsPages:[{total_count:runs.length,workflow_runs:runs}],jobsPagesByRun,artifactsPagesByRun,artifactZips};
}
export const setPages=(o,kind,runId,rows)=>{(kind==='jobs'?o.jobsPagesByRun:o.artifactsPagesByRun)[runId]=[{total_count:rows.length,[kind]:rows}];};
export const replaceZip=(o,runId,index,zip)=>{const a=o.artifactsPagesByRun[runId][0].artifacts[index];o.artifactZips[a.id]=zip;a.digest='sha256:'+hash(zip);a.size_in_bytes=zip.length;};

export const releaseInfo=(commitSha=SHA,adminUiSha256=ADMIN)=>({version:'municontrol-release.v1',commitSha,sourceState:'committed',adminUiSha256});
export const deployment=(id,over={})=>({id,name:C.vercel.projectName,projectId:C.vercel.projectId,project:{id:C.vercel.projectId,name:C.vercel.projectName},
 ownerId:C.vercel.teamId,team:{id:C.vercel.teamId,slug:C.vercel.teamSlug},deletedAt:null,target:'production',customEnvironment:null,readyState:'READY',
 url:id.slice(4)+'.vercel.app',alias:[id.slice(4)+'-team.vercel.app'],gitSource:{type:'github',sha:SHA,repoId:C.repository.id,ref:SHA},
 projectSettings:{buildCommand:stageBuildCommand(SHA)},...over});
export const createObservation=(over={})=>({id:STAGED,url:'staged1.vercel.app',target:'production',autoAssignCustomDomains:false,effectiveBuildCommand:stageBuildCommand(SHA),
 gitSource:{type:'github',sha:SHA,repoId:C.repository.id,ref:SHA},...over});
// R3. Expected destination = canonical OWN_RELEASE_TARGETS entry named by the admission (major 17 here).
export const TARGET=OWN_RELEASE_TARGETS.find(t=>t.major===17),RUNTIME_ROLE='municontrol_actions_runtime_app';
export const observationRecord=(clientClass,user,over={})=>({version:ATTESTATION_VERSION,event:'observation',sourceSha:SHA,environment:'production',clientClass,
 serverMajor:TARGET.major,database:TARGET.database,currentUser:user,sessionUser:user,neonProjectId:TARGET.projectId,neonBranchId:TARGET.branchId,
 neonEndpointId:TARGET.endpointId,transactionReadOnly:'on',neonIdentityComplete:true,configuredHostname:'[REDACTED]',configuredHostnameSource:'configured-build-env',...over});
export const completeRecord=(over={})=>({version:ATTESTATION_VERSION,event:'complete',sourceSha:SHA,environment:'production',clientsObserved:2,neonIdentityComplete:true,observationOnly:true,...over});
// Shape of the records in BUILD_BINDING_RESULT_2A2CDA0A.json: {created, value} as printed by the verifier.
export const attestationRecords=()=>[{created:1793100766887,value:observationRecord('DATABASE_URL',TARGET.role)},
 {created:1793100767264,value:observationRecord('ACTIONS_DATABASE_URL',RUNTIME_ROLE)},{created:1793100767264,value:completeRecord()}];
export const binding=(over={})=>({version:'vercel-normal-build-binding-observation.v1',sourceCommit:SHA,deploymentId:STAGED,deploymentReadyObserved:true,effectiveBuildCommandObserved:true,
 builtinShaMatchedByPinnedVerifier:true,normalBuildEnvironment:true,ddl:0,dml:0,municipalOperations:0,productionDomainPromoted:false,records:attestationRecords(),...over});
export const admission=(over={})=>({version:'municontrol-release-admission.v1',sourceSha:SHA,previousProductionDeploymentId:PREVIOUS,
 providerSettingsAttested:{productionBranch:'master',projectBuildCommand:null},productionDatabaseMajor:17,...over});
export const inspectionsFor=id=>Object.fromEntries(C.vercel.productionDomains.map(d=>[d,{id,target:'production',readyState:'READY',aliases:[d]}]));

/**
 * In-memory providers. `holder` maps each production domain to the deployment serving it (seen through
 * `inspect` and the domain's release-info; `alias` stays creation-time only, as no source shows otherwise); the adapter
 * moves domains only when called. Every call is recorded so tests can prove what did NOT happen.
 */
export function fakeWorld({obs=observation(),head=()=>SHA,promoteDomains=C.vercel.productionDomains,stageRelease=releaseInfo()}={}){
 const calls=[],domains=C.vercel.productionDomains,ok=v=>({exitCode:0,text:JSON.stringify(v)});
 const state={holder:Object.fromEntries(domains.map(d=>[d,PREVIOUS])),deployments:{[PREVIOUS]:deployment(PREVIOUS,{gitSource:{type:'github',sha:OTHER,repoId:C.repository.id,ref:OTHER}})},
  releases:{[PREVIOUS]:releaseInfo(OTHER,PREVIOUS_ADMIN)},headReads:0,pendingDomains:[]};
 const view=id=>{const d=state.deployments[id];return d&&structuredClone(d);};
 const github={
  get:async e=>{calls.push('github.get');
   if(e===C.github.masterRef){const sha=head(state.headReads++);return ok({ref:'refs/heads/master',object:{sha,type:'commit'}});}
   if(e==='git/commits/'+SHA)return ok(obs.commit);
   const m=/^contents\/(.+)\?ref=([a-f0-9]{40})$/.exec(e);if(m&&m[2]===SHA&&obs.contents[m[1]])return ok(obs.contents[m[1]]);
   return{exitCode:1,text:''};},
  pages:async e=>{calls.push('github.pages');
   if(e==='actions/runs?head_sha='+SHA+'&per_page=100')return ok(obs.runsPages);
   let m=/^actions\/runs\/(\d+)\/jobs\?filter=all&per_page=100$/.exec(e);if(m&&obs.jobsPagesByRun[m[1]])return ok(obs.jobsPagesByRun[m[1]]);
   m=/^actions\/runs\/(\d+)\/artifacts\?per_page=100$/.exec(e);if(m&&obs.artifactsPagesByRun[m[1]])return ok(obs.artifactsPagesByRun[m[1]]);
   return{exitCode:1,text:''};},
  bytes:async e=>{calls.push('github.bytes');const m=/^actions\/artifacts\/(\d+)\/zip$/.exec(e);const b=m&&obs.artifactZips[m[1]];return b?{exitCode:0,bytes:b}:{exitCode:1,bytes:null};}
 };
 const vercel={
  createDeployment:async request=>{calls.push('vercel.create');
   // GET of the created deployment exposes the effective command; tests may change state.deployments[STAGED].
   state.deployments[STAGED]=deployment(STAGED,{gitSource:request.gitSource,projectSettings:{buildCommand:request.buildCommand}});state.releases[STAGED]=stageRelease;
   return ok({id:STAGED,url:'staged1.vercel.app',target:'production',autoAssignCustomDomains:request.autoAssignCustomDomains,projectSettings:{buildCommand:request.buildCommand},gitSource:request.gitSource});},
  getDeployment:async id=>{calls.push('vercel.get');const d=view(id);return d?ok(d):{exitCode:1,text:''};},
  inspect:async domain=>{calls.push('vercel.inspect');const id=state.holder[domain];return ok({id,target:'production',readyState:'READY',aliases:domains.filter(x=>state.holder[x]===id)});},
  run:async args=>{calls.push('vercel.run');return{exitCode:0,text:JSON.stringify({args})};}
 };
 const readRelease=async host=>{calls.push('readRelease');
  const byUrl=Object.values(state.deployments).find(d=>d.url===host);const id=byUrl?.id??state.holder[host];
  return id&&state.releases[id]?ok(state.releases[id]):{exitCode:1,text:''};};
 const adapter={promoteOnce:async args=>{calls.push('adapter.promote');
  for(const d of domains)if(promoteDomains.includes(d))state.holder[d]=args.deploymentId;else state.pendingDomains.push([d,args.deploymentId]);return{exitCode:0};}};
 // A pause lets the provider converge: domains not moved by the adapter call arrive on the next read.
 const pause=async()=>{calls.push('pause');for(const [d,id] of state.pendingDomains.splice(0))state.holder[d]=id;};
 return withPr250Collection({calls,state,adapter,pause,transport:{github,vercel,readRelease}},{obs,sha:SHA,staged:STAGED,stageRelease});
}
