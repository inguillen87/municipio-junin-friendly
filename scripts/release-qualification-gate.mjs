// PROPOSED by Claude (source only; never run by Claude). Target: scripts/release-qualification-gate.mjs
// Pure decisions over FRESH provider observations gathered by the runner immediately before each
// mutation. No network, credentials or provider calls here. Self-declared results (`passed:true`,
// a hash-pinned JSON from a caller, an artifact that exists) are never sufficient on their own.
import {createHash} from 'node:crypto';
import {verifyRelease} from '../assets/release-status-model.js';
import {RELEASE_CONTRACT as C} from './release-qualification-contract.mjs';
import {zipEntries,zipEntryBytes} from './lib/release-zip-entries.mjs';
// R3. Both imports are inert: constants only, no env read, no client (see their module headers).
import {ATTESTATION_VERSION} from './verify-vercel-build-db-attestation.mjs';
import {OWN_RELEASE_TARGETS} from './lib/own-payroll-release-target.mjs';

export const RELEASE_GATE_VERSION='municontrol-release-qualification-gate.v3';
export const RELEASE_ADMISSION_VERSION='municontrol-release-admission.v1';
const SHA=/^[a-f0-9]{40}$/,DIGEST=/^sha256:[a-f0-9]{64}$/,DEPLOYMENT=/^dpl_[A-Za-z0-9]+$/;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlobSha1=bytes=>createHash('sha1').update(Buffer.concat([Buffer.from('blob '+bytes.length+'\0'),Buffer.from(bytes)])).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const freeze=v=>{if(v&&typeof v==='object'&&!ArrayBuffer.isView(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const canonical=v=>JSON.stringify(v,(_k,x)=>object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const withSha=(v,sha)=>typeof v==='string'?v.replaceAll('<sha>',sha):v;
const byCreation=(a,b)=>String(a.created_at).localeCompare(String(b.created_at))||(a.run_attempt-b.run_attempt)||(a.id-b.id);
export const stageBuildCommand=sha=>C.stageBuildCommand.replaceAll('<sha>',sha);

/** `gh api --paginate --slurp` answer -> rows. Truncated, inconsistent or repeated pages never count. */
export function paginated(pages,key){
 if(!Array.isArray(pages)||!pages.length||!pages.every(p=>object(p)&&Array.isArray(p[key])&&Number.isSafeInteger(p.total_count)))return{rows:null,reason:'PAGINATION_INVALID'};
 const total=pages[0].total_count;
 if(pages.some(p=>p.total_count!==total))return{rows:null,reason:'PAGINATION_INCONSISTENT'};
 const rows=pages.flatMap(p=>p[key]);
 if(rows.length!==total)return{rows:null,reason:'PAGINATION_INCOMPLETE'};
 if(new Set(rows.map(r=>r?.id)).size!==rows.length)return{rows:null,reason:'PAGINATION_DUPLICATE'};
 return{rows,reason:null};
}

/** GitHub contents answer -> bytes, bound to its own git blob id and size. */
export function contentBytes(answer,path){
 if(!object(answer)||answer.type!=='file'||answer.encoding!=='base64'||answer.path!==path||typeof answer.content!=='string')return{bytes:null,reason:'CONTENT_INVALID:'+path};
 const text=answer.content.replace(/\s+/g,'');
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(text)||text.length%4!==0)return{bytes:null,reason:'CONTENT_INVALID:'+path};
 const bytes=new Uint8Array(Buffer.from(text,'base64'));
 if(bytes.length!==answer.size||gitBlobSha1(bytes)!==answer.sha)return{bytes:null,reason:'CONTENT_BLOB_MISMATCH:'+path};
 return{bytes,reason:null};
}

const result=(sha,reasons,evidence)=>freeze({version:RELEASE_GATE_VERSION,kind:'qualification',sha:sha??null,qualified:reasons.length===0,reasons:[...reasons],evidence,
 note:'Necessary, never sufficient: stage verification, root build binding, fresh pre-mutation reads and read-back remain separate.'});

/**
 * observation (collected by the runner, never by the caller):
 * {sha, masterRef, commit, contents:{path:answer}, runsPages, jobsPagesByRun:{runId:pages}, artifactsPagesByRun:{runId:pages}, artifactZips:{artifactId:Uint8Array}}
 */
export function evaluateQualification({sha,observation:o}={}){
 if(!SHA.test(sha??''))return result(sha,['SHA_FORMAT'],null);
 if(!object(o))return result(sha,['OBSERVATION_MISSING'],null);
 const reasons=[],evidence={tree:null,files:{},runs:[]};
 if(o.sha!==sha)reasons.push('OBSERVATION_SHA');
 if(o.masterRef?.object?.type!=='commit'||o.masterRef?.object?.sha!==sha)reasons.push('SHA_NOT_CANONICAL_HEAD');
 if(o.commit?.sha!==sha||!SHA.test(o.commit?.tree?.sha??''))reasons.push('COMMIT_UNOBSERVED');else evidence.tree=o.commit.tree.sha;
 const file=path=>{const {bytes,reason}=contentBytes(o.contents?.[path],path);if(reason){reasons.push(reason);return null;}evidence.files[path]=sha256(bytes);return bytes;};
 const json=(bytes,path)=>{if(!bytes)return null;let v;try{v=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{v=undefined;}if(!object(v)){reasons.push('SOURCE_INVALID:'+path);return null;}return v;};
 const pkg=json(file('package.json'),'package.json'),vercelJson=json(file('vercel.json'),'vercel.json');
 if(pkg)for(const [name,value] of Object.entries(C.scripts))if(pkg.scripts?.[name]!==value)reasons.push('SOURCE_SCRIPT_CHANGED:'+name);
 if(vercelJson){
  if((vercelJson.buildCommand??null)!==C.vercelJson.buildCommand)reasons.push('SOURCE_VERCEL_BUILD_COMMAND');
  if(canonical(vercelJson.git?.deploymentEnabled??null)!==canonical(C.vercelJson.gitDeploymentEnabled))reasons.push('SOURCE_VERCEL_GIT_DEPLOYMENT_OPEN');
 }
 for(const w of C.workflows){const bytes=file(w.path);if(bytes&&sha256(bytes)!==w.sha256)reasons.push('WORKFLOW_BYTES_CHANGED:'+w.path);}
 // R3. The verifier that the stage build runs, at the SAME candidate: blob, size and reviewed sha256.
 for(const s of C.pinnedSources){const bytes=file(s.path);if(bytes&&sha256(bytes)!==s.sha256)reasons.push('PINNED_SOURCE_CHANGED:'+s.path);}
 const runs=paginated(o.runsPages,'workflow_runs');
 if(runs.reason)return result(sha,[...reasons,runs.reason+':runs'],evidence);
 for(const w of C.workflows)reasons.push(...workflowReasons(w,sha,runs.rows,o,evidence));
 return result(sha,reasons,evidence);
}

function workflowReasons(w,sha,runs,o,evidence){
 const R=C.repository,tag=w.path,reasons=[];
 // Same path, SHA, repository and head repository. Other commits, forks and homonyms are never inherited.
 const same=runs.filter(r=>object(r)&&r.path===w.path&&r.head_sha===sha&&r.repository?.id===R.id&&r.repository?.full_name===R.fullName
  &&r.head_repository?.id===R.id&&r.head_repository?.full_name===R.fullName);
 // pull_request runs test a merge reference, not this commit: never admitted.
 const admitted=same.filter(r=>['push','workflow_dispatch'].includes(r.event)&&r.head_branch===R.productionBranch);
 if(!admitted.length)return[(same.length?'RUN_NOT_CANONICAL_EVENT:':'RUN_MISSING:')+tag];
 if(admitted.some(r=>r.status!=='completed'))reasons.push('RUN_INCOMPLETE:'+tag);
 const latest=[...admitted].sort(byCreation).at(-1);
 if(latest.name!==w.name)reasons.push('WORKFLOW_NAME_CHANGED:'+tag);
 if(latest.status!=='completed'||latest.conclusion!=='success')reasons.push('RUN_NOT_SUCCESS:'+tag+':'+String(latest.conclusion));
 const jobsPage=paginated(o.jobsPagesByRun?.[latest.id],'jobs');
 if(jobsPage.reason)return[...reasons,jobsPage.reason+':jobs:'+tag];
 // Only the counted attempt: a partial re-run never borrows successes from another attempt.
 const jobs=jobsPage.rows.filter(j=>object(j)&&j.run_attempt===latest.run_attempt);
 const expected=w.jobs.map(j=>j.name);
 for(const j of jobs){
  if(!expected.includes(j.name))reasons.push('JOB_UNEXPECTED:'+tag+':'+String(j.name));
  if(j.run_id!==latest.id||j.head_sha!==sha||j.status!=='completed'||j.conclusion!=='success')reasons.push('JOB_NOT_SUCCESS:'+tag+':'+String(j.name)+':'+String(j.conclusion));
  if(!Array.isArray(j.steps)||!j.steps.length)reasons.push('JOB_STEPS_UNOBSERVED:'+tag+':'+String(j.name));
  else for(const s of j.steps)if(s?.status!=='completed'||s?.conclusion!=='success')reasons.push('STEP_NOT_SUCCESS:'+tag+':'+String(j.name)+':'+String(s?.name)+':'+String(s?.conclusion));
 }
 const artifacts=paginated(o.artifactsPagesByRun?.[latest.id],'artifacts');
 if(artifacts.reason)reasons.push(artifacts.reason+':artifacts:'+tag);
 const runEvidence={path:w.path,runId:latest.id,runAttempt:latest.run_attempt,event:latest.event,jobs:[]};
 for(const spec of w.jobs){
  const found=jobs.filter(j=>j.name===spec.name);
  if(found.length!==1){reasons.push((found.length?'JOB_DUPLICATE:':'JOB_MISSING:')+tag+':'+spec.name);continue;}
  const job=found[0],steps=Array.isArray(job.steps)?job.steps:[];
  for(const step of w.steps){const count=steps.filter(s=>s?.name===step).length;if(count!==1)reasons.push((count?'STEP_DUPLICATE:':'STEP_MISSING:')+tag+':'+spec.name+':'+step);}
  const jobEvidence={name:spec.name,major:spec.major,jobId:job.id,artifact:null};runEvidence.jobs.push(jobEvidence);
  if(!artifacts.reason)reasons.push(...artifactReasons(spec,sha,latest,artifacts.rows,o.artifactZips,tag,jobEvidence));
 }
 evidence.runs.push(runEvidence);
 return reasons;
}

function artifactReasons(spec,sha,run,artifacts,zips,tag,jobEvidence){
 const R=C.repository,name=withSha(spec.artifact,sha),label=tag+':'+name,reasons=[];
 const found=artifacts.filter(a=>object(a)&&a.name===name);
 if(found.length!==1)return[(found.length?'ARTIFACT_DUPLICATE:':'ARTIFACT_MISSING:')+label];
 const a=found[0],wr=a.workflow_run;
 if(a.expired!==false)reasons.push('ARTIFACT_EXPIRED:'+label);
 if(!object(wr)||wr.id!==run.id||wr.head_sha!==sha||wr.head_branch!==R.productionBranch||wr.repository_id!==R.id||wr.head_repository_id!==R.id)reasons.push('ARTIFACT_RUN_BINDING:'+label);
 if(!DIGEST.test(a.digest??''))return[...reasons,'ARTIFACT_DIGEST_MISSING:'+label];
 const bytes=object(zips)?zips[a.id]:null;
 if(!(bytes instanceof Uint8Array))return[...reasons,'ARTIFACT_UNOBSERVED:'+label];
 if(sha256(bytes)!==a.digest.slice(7)||bytes.length!==a.size_in_bytes)return[...reasons,'ARTIFACT_DIGEST_MISMATCH:'+label];
 // The report binds the tested checkout to this SHA/major. Uploads run `if: always()`, so presence alone is nothing.
 let report;
 try{
  const matches=[...zipEntries(bytes).values()].filter(e=>e.name===spec.report.entry||e.name.endsWith('/'+spec.report.entry));
  if(matches.length!==1)return[...reasons,(matches.length?'REPORT_DUPLICATE:':'REPORT_MISSING:')+label];
  report=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(zipEntryBytes(bytes,matches[0])));
 }catch{return[...reasons,'REPORT_UNREADABLE:'+label];}
 for(const [key,expected] of Object.entries(spec.report.fields))if(report?.[key]!==withSha(expected,sha))reasons.push('REPORT_FIELD:'+label+':'+key);
 jobEvidence.artifact={id:a.id,name,digest:a.digest,sizeInBytes:a.size_in_bytes,reportEntry:spec.report.entry};
 return reasons;
}

/**
 * Root's admission: the SHA, the deployment holding production, and root's own attestation of the two
 * Vercel project settings no repository source can show (contract.providerSettingsUnknown). Without
 * that exact attestation nothing proceeds. Provider facts are still re-read, never trusted from here.
 */
export function validateAdmission(admission,sha){
 const reasons=[];
 if(!object(admission)||admission.version!==RELEASE_ADMISSION_VERSION)return['ADMISSION_VERSION'];
 if(!SHA.test(admission.sourceSha??'')||admission.sourceSha!==sha)reasons.push('ADMISSION_SHA');
 if(!DEPLOYMENT.test(admission.previousProductionDeploymentId??''))reasons.push('ADMISSION_PREVIOUS_DEPLOYMENT');
 if(canonical(admission.providerSettingsAttested??null)!==canonical(C.providerSettingsRequired))reasons.push('ADMISSION_PROVIDER_SETTINGS_UNATTESTED');
 // R3. Root names which canonical destination the production web build must reach; the values come from source.
 if(!productionTarget(admission))reasons.push('ADMISSION_PRODUCTION_DATABASE');
 return reasons;
}
/** The OWN_RELEASE_TARGETS entry named by the admission, or null. Never derived from an observation. */
export function productionTarget(admission){
 const major=object(admission)?admission.productionDatabaseMajor:undefined;
 const found=Number.isSafeInteger(major)?OWN_RELEASE_TARGETS.filter(t=>t.major===major):[];
 return found.length===1?found[0]:null;
}

/** Fields of GET /v13/deployments/{id}?withGitRepoInfo=true, as asserted by check-pr197-ci-gate. */
function deploymentReasons(d,id,prefix){
 const V=C.vercel,reasons=[];
 if(!object(d)||d.id!==id)return[prefix+'_IDENTITY'];
 if(d.name!==V.projectName||d.projectId!==V.projectId||d.project?.id!==V.projectId||d.project?.name!==V.projectName)reasons.push(prefix+'_PROJECT');
 if(d.ownerId!==V.teamId||d.team?.id!==V.teamId||d.team?.slug!==V.teamSlug)reasons.push(prefix+'_TEAM');
 if(d.deletedAt!==null)reasons.push(prefix+'_DELETED');
 if(d.target!=='production'||(d.customEnvironment??null)!==null)reasons.push(prefix+'_TARGET');
 if(d.readyState!=='READY')reasons.push(prefix+'_NOT_READY');
 return reasons;
}
// `alias` of GET /v13 is creation-time only (no source shows it follows promotions): used only as a
// negative creation check. Live domain ownership is per-domain `vercel inspect` + the domain's release-info.
const aliases=d=>Array.isArray(d?.alias)?d.alias:[];

/** The admitted previous deployment serves EVERY production domain, per-domain inspect. */
export function evaluateProductionHolder({previousId,deployment,inspections}={}){
 const reasons=deploymentReasons(deployment,previousId,'HOLDER');
 for(const domain of C.vercel.productionDomains)if(!object(inspections)||inspections[domain]?.id!==previousId)reasons.push('HOLDER_INSPECT_MISMATCH:'+domain);
 return freeze({version:RELEASE_GATE_VERSION,kind:'holder',previousId:previousId??null,holds:reasons.length===0,reasons});
}

/** Production deployment created with domain assignment disabled. READY is necessary, never acceptance. */
export function evaluateStage({qualification,createObservation,deployment,releaseInfo}={}){
 const sha=qualification?.sha,reasons=[];let adminUiSha256=null;
 if(qualification?.kind!=='qualification'||qualification.qualified!==true||!SHA.test(sha??''))reasons.push('STAGE_NOT_QUALIFIED');
 if(!object(createObservation)||!DEPLOYMENT.test(createObservation.id??''))reasons.push('STAGE_CREATE_UNOBSERVED');
 if(createObservation?.autoAssignCustomDomains!==false)reasons.push('STAGE_DOMAIN_ASSIGNMENT_NOT_DISABLED');
 if(createObservation?.effectiveBuildCommand!==stageBuildCommand(sha??''))reasons.push('STAGE_BUILD_COMMAND_UNOBSERVED_OR_CHANGED');
 if(createObservation?.target!=='production')reasons.push('STAGE_CREATE_TARGET');
 // R3. The CREATE echo is not the effective command: the fresh GET of this READY deployment must show it too.
 const effective=[deployment?.projectSettings?.buildCommand,deployment?.buildCommand].filter(v=>v!==undefined&&v!==null);
 if(!effective.length)reasons.push('STAGE_GET_BUILD_COMMAND_UNOBSERVED');
 else if(effective.some(v=>v!==stageBuildCommand(sha??'')))reasons.push('STAGE_GET_BUILD_COMMAND_CHANGED');
 reasons.push(...deploymentReasons(deployment,createObservation?.id,'STAGE'));
 if(deployment?.gitSource?.type!=='github'||deployment?.gitSource?.sha!==sha||deployment?.gitSource?.repoId!==C.repository.id)reasons.push('STAGE_SOURCE_SHA');
 if(C.vercel.productionDomains.some(d=>aliases(deployment).includes(d)))reasons.push('STAGE_ALREADY_ON_PRODUCTION_DOMAIN');
 try{const r=verifyRelease(releaseInfo);adminUiSha256=r.adminUiSha256;if(r.commitSha!==sha||r.sourceState!=='committed')reasons.push('STAGE_RELEASE_INFO_SHA');}catch{reasons.push('STAGE_RELEASE_INFO_INVALID');}
 return freeze({version:RELEASE_GATE_VERSION,kind:'stage',sha:sha??null,deploymentId:createObservation?.id??null,adminUiSha256,stageVerified:reasons.length===0,reasons});
}

/**
 * R3. Root's binding receipt for THIS deployment must carry the real attestation records printed by the pinned
 * verifier during that build: exactly one observation per client plus one complete, all for this SHA and
 * production, both clients on the admitted canonical destination with their exact roles. Flags and counts in
 * the receipt are kept as extra conditions but never replace the records. Records/timestamps are preserved.
 */
const OBSERVATION_KEYS=['version','event','sourceSha','environment','clientClass','serverMajor','database','currentUser','sessionUser','neonProjectId','neonBranchId','neonEndpointId','transactionReadOnly','neonIdentityComplete','configuredHostname','configuredHostnameSource'].sort().join();
const COMPLETE_KEYS=['version','event','sourceSha','environment','clientsObserved','neonIdentityComplete','observationOnly'].sort().join();
export function evaluateBuildBinding({stage,binding,admission}={}){
 const reasons=[],target=productionTarget(admission),B=C.buildClients;let records=null;
 if(stage?.kind!=='stage'||stage.stageVerified!==true)reasons.push('BINDING_STAGE_NOT_VERIFIED');
 if(!target)reasons.push('BINDING_TARGET_UNADMITTED');
 if(!object(binding)||binding.version!==C.buildBindingVersion)reasons.push('BINDING_VERSION');
 else{
  if(binding.sourceCommit!==stage?.sha)reasons.push('BINDING_SOURCE_COMMIT');
  if(binding.deploymentId!==stage?.deploymentId)reasons.push('BINDING_DEPLOYMENT');
  for(const flag of ['deploymentReadyObserved','effectiveBuildCommandObserved','builtinShaMatchedByPinnedVerifier','normalBuildEnvironment'])if(binding[flag]!==true)reasons.push('BINDING_FLAG:'+flag);
  for(const count of ['ddl','dml','municipalOperations'])if(binding[count]!==0)reasons.push('BINDING_COUNT:'+count);
  if(binding.productionDomainPromoted!==false)reasons.push('BINDING_ALREADY_PROMOTED');
  records=Array.isArray(binding.records)?binding.records:null;
  if(!records)reasons.push('BINDING_RECORDS_MISSING');
 }
 if(records){
  const ok=r=>object(r)&&Number.isSafeInteger(r.created)&&r.created>0&&object(r.value);
  if(records.length!==3||!records.every(ok))reasons.push('BINDING_RECORDS_SHAPE');
  const values=records.filter(ok).map(r=>r.value);
  for(const v of values){
   if(v.version!==ATTESTATION_VERSION)reasons.push('BINDING_RECORD_VERSION');
   if(v.sourceSha!==stage?.sha)reasons.push('BINDING_RECORD_SHA');
   if(v.environment!=='production')reasons.push('BINDING_RECORD_ENVIRONMENT');
   if(!['observation','complete'].includes(v.event))reasons.push('BINDING_RECORD_EVENT:'+String(v.event));
  }
  const observations=records.filter(r=>ok(r)&&r.value.event==='observation'),completes=records.filter(r=>ok(r)&&r.value.event==='complete');
  for(const [client,role] of [[B.ownerClient,target?.role],[B.actionsClient,B.actionsRuntimeRole]]){
   const mine=observations.filter(r=>r.value.clientClass===client);
   if(mine.length!==1){reasons.push((mine.length?'BINDING_OBSERVATION_DUPLICATE:':'BINDING_OBSERVATION_MISSING:')+client);continue;}
   const v=mine[0].value;
   if(Object.keys(v).sort().join()!==OBSERVATION_KEYS)reasons.push('BINDING_OBSERVATION_FIELDS:'+client);
   if(v.transactionReadOnly!=='on')reasons.push('BINDING_READ_ONLY:'+client);
   if(v.neonIdentityComplete!==true||[v.neonProjectId,v.neonBranchId,v.neonEndpointId].some(x=>typeof x!=='string'||!x))reasons.push('BINDING_NEON_IDENTITY:'+client);
   // Expected values come from OWN_RELEASE_TARGETS / contract only. configuredHostname is never used.
   if(!target||v.serverMajor!==target.major||v.database!==target.database||v.neonProjectId!==target.projectId||v.neonBranchId!==target.branchId||v.neonEndpointId!==target.endpointId)reasons.push('BINDING_DESTINATION:'+client);
   if(typeof role!=='string'||v.currentUser!==role||v.sessionUser!==role)reasons.push('BINDING_ROLE:'+client);
  }
  if(observations.some(r=>![B.ownerClient,B.actionsClient].includes(r.value.clientClass)))reasons.push('BINDING_OBSERVATION_UNEXPECTED');
  if(completes.length!==1)reasons.push(completes.length?'BINDING_COMPLETE_DUPLICATE':'BINDING_COMPLETE_MISSING');
  else{
   const c=completes[0];
   if(Object.keys(c.value).sort().join()!==COMPLETE_KEYS||c.value.clientsObserved!==2||c.value.neonIdentityComplete!==true||c.value.observationOnly!==true)reasons.push('BINDING_COMPLETE_INCOHERENT');
   if(observations.some(o=>o.created>c.created))reasons.push('BINDING_COMPLETE_BEFORE_OBSERVATION');
  }
 }
 const evidence=records?records.map(r=>({created:r?.created??null,event:r?.value?.event??null,clientClass:r?.value?.clientClass??null})):null;
 return freeze({version:RELEASE_GATE_VERSION,kind:'binding',sha:stage?.sha??null,deploymentId:stage?.deploymentId??null,
  target:target?{major:target.major,projectId:target.projectId,branchId:target.branchId,endpointId:target.endpointId,database:target.database}:null,
  recordsSha256:records?sha256(canonical(records)):null,records:evidence,bound:reasons.length===0,reasons});
}

/** Read-only read-back after the single promotion. Mismatch is UNCERTAIN; nothing is retried or rolled back. */
export function evaluateReadback({stage,stageDeployment,inspections,domainReleases}={}){
 const reasons=[];
 if(stage?.kind!=='stage'||stage.stageVerified!==true)reasons.push('READBACK_STAGE_NOT_VERIFIED');
 reasons.push(...deploymentReasons(stageDeployment,stage?.deploymentId,'READBACK_STAGE'));
 for(const domain of C.vercel.productionDomains){
  if(!object(inspections)||inspections[domain]?.id!==stage?.deploymentId)reasons.push('READBACK_INSPECT_MISMATCH:'+domain);
  try{const r=verifyRelease(object(domainReleases)?domainReleases[domain]:null);
   if(r.commitSha!==stage?.sha||r.sourceState!=='committed'||r.adminUiSha256!==stage?.adminUiSha256)reasons.push('READBACK_DOMAIN_RELEASE:'+domain);}
  catch{reasons.push('READBACK_DOMAIN_RELEASE_INVALID:'+domain);}
 }
 return freeze({version:RELEASE_GATE_VERSION,kind:'readback',sha:stage?.sha??null,deploymentId:stage?.deploymentId??null,promotedAndReadBack:reasons.length===0,reasons});
}
