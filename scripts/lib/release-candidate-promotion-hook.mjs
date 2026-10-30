// PR250 collector bridge only. Inert on import; no token, SQL, deployment or admission input.
import {collectCandidateAdmission,decodeCandidateArtifact} from '../verify-release-candidate.mjs';
import {requireCandidateAdmission,RELEASE_REPOSITORY,M7_RELEASE_FILES} from './release-candidate-admission.mjs';

const ID=/^dpl_[A-Za-z0-9]+$/;
const stop=code=>{throw Object.assign(new Error(code),{code});};
const parsed=(answer,label)=>{
 if(answer?.exitCode!==0||typeof answer.text!=='string')stop('TRANSPORT_AMBIGUOUS:'+label);
 try{return JSON.parse(answer.text);}catch{stop('TRANSPORT_AMBIGUOUS:'+label);}
};

export function candidateReleaseReaders(transport){
 if(typeof transport?.readDeploymentFile!=='function')stop('CANDIDATE_READ_ADAPTER_REQUIRED');
 const prefix='/repos/'+RELEASE_REPOSITORY+'/';
 return Object.freeze({
  getGithub:async endpoint=>{
   if(typeof endpoint!=='string'||!endpoint.startsWith(prefix))stop('CANDIDATE_GITHUB_ENDPOINT_INVALID');
   return parsed(await transport.github.get(endpoint.slice(prefix.length)),'candidate-github');
  },
  getArtifact:async metadata=>{
   if(!Number.isSafeInteger(metadata?.id)||metadata.id<=0)stop('CANDIDATE_ARTIFACT_MISSING');
   const answer=await transport.github.bytes('actions/artifacts/'+metadata.id+'/zip');
   if(answer?.exitCode!==0||!(answer.bytes instanceof Uint8Array))stop('TRANSPORT_AMBIGUOUS:candidate-artifact');
   return decodeCandidateArtifact(answer.bytes,metadata);
  },
  getDeployment:async id=>{
   if(!ID.test(id??''))stop('CANDIDATE_DEPLOYMENT_CHANGED');
   const raw=parsed(await transport.vercel.getDeployment(id),'candidate-deployment');
   // Same observed-field projection as PR250 candidateHttpReaders; no invented identities.
   return{id:raw.id,projectId:raw.projectId??raw.project?.id,teamId:raw.teamId??raw.ownerId??raw.team?.id,
    target:raw.target,readyState:raw.readyState,url:raw.url,alias:raw.alias,
    gitSource:raw.gitSource?{sha:raw.gitSource.sha}:null,meta:raw.meta?{githubCommitSha:raw.meta.githubCommitSha}:null};
  },
  getDeploymentFile:async(deployment,name)=>{
   if(!M7_RELEASE_FILES.includes(name))stop('CANDIDATE_DEPLOYMENT_FILE_INVALID');
   const answer=await transport.readDeploymentFile(deployment,name);
   if(answer?.exitCode!==0||!(answer.bytes instanceof Uint8Array))stop('TRANSPORT_AMBIGUOUS:candidate-static');
   return Buffer.from(answer.bytes);
  }
 });
}

export async function collectPromotionCandidate({sha,deploymentId,transport}){
 const collected=await collectCandidateAdmission({candidateSha:sha,deploymentId,...candidateReleaseReaders(transport)});
 return requireCandidateAdmission(collected.admission,sha);
}

// Both gates bind the same tree and share exactly the two capacity jobs: 10 unique jobs.
export function bindCollectedCandidate(candidate,qualification,stage){
 const actual=requireCandidateAdmission(candidate,qualification?.sha);
 if(qualification?.qualified!==true||stage?.stageVerified!==true||actual.treeSha!==qualification.evidence?.tree
  ||actual.deploymentId!==stage.deploymentId)stop('CANDIDATE_RELEASE_IDENTITY_MISMATCH');
 const runs=qualification.evidence?.runs;
 const jobs=Array.isArray(runs)?runs.flatMap(r=>r.jobs.map(j=>({...j,runId:r.runId,runAttempt:r.runAttempt,path:r.path}))):[];
 const proofs=actual.proofs;
 if(jobs.length!==4||proofs.length!==8||new Set(jobs.map(j=>j.jobId)).size!==4||new Set(proofs.map(p=>p.jobId)).size!==8)stop('CANDIDATE_RELEASE_JOB_COVERAGE');
 const capacity='.github/workflows/own-payroll-full-capacity.yml';
 for(const major of [17,18]){
  const prior=jobs.filter(j=>j.path===capacity&&j.major===major),next=proofs.filter(p=>p.workflow===capacity&&p.major===major);
  if(prior.length!==1||next.length!==1||['jobId','runId','runAttempt'].some(k=>prior[0][k]!==next[0][k]))stop('CANDIDATE_RELEASE_CAPACITY_NOT_SHARED');
 }
 if(new Set([...jobs.map(j=>j.jobId),...proofs.map(p=>p.jobId)]).size!==10)stop('CANDIDATE_RELEASE_JOB_COVERAGE');
 return Object.freeze({candidateSha:actual.candidateSha,treeSha:actual.treeSha,deploymentId:actual.deploymentId,
  proofCount:actual.proofCount,proofs:actual.proofs,staticManifestSha256:actual.staticManifestSha256,
  admissionSha256:actual.admissionSha256,distinctJobCount:10,sharedCapacityJobs:2});
}

// Anonymous static GETs only. Protection, redirect, missing or oversized bytes fail closed.
export function deploymentFileReader({fetchImpl=globalThis.fetch,timeoutMs=30000}={}){
 return async(deployment,name)=>{
  if(!ID.test(deployment?.id??'')||!M7_RELEASE_FILES.includes(name)||!/^[a-z0-9-]+\.vercel\.app$/.test(deployment?.url??''))return{exitCode:1,bytes:null};
  const route={'nomina-control.html':'/nomina','centro-acciones.html':'/centro-acciones'}[name]??'/'+name;
  let reader;
  try{
   const response=await fetchImpl('https://'+deployment.url+route+'?release='+deployment.id,
    {method:'GET',cache:'no-store',redirect:'error',credentials:'omit',signal:AbortSignal.timeout(timeoutMs)});
   if(response.status!==200||!response.body?.getReader)stop('CANDIDATE_STATIC_UNAVAILABLE');
   reader=response.body.getReader();const chunks=[];let total=0;
   while(true){const item=await reader.read();if(item.done)break;total+=item.value.byteLength;if(total>16*1024*1024)stop('CANDIDATE_STATIC_TOO_LARGE');chunks.push(Buffer.from(item.value));}
   return{exitCode:0,bytes:new Uint8Array(Buffer.concat(chunks,total))};
  }catch{if(reader)try{await reader.cancel();}catch{}return{exitCode:1,bytes:null};}
  finally{reader?.releaseLock();}
 };
}
