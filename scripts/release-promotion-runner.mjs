// PROPOSED by Claude (source only; never run by Claude). Target: scripts/release-promotion-runner.mjs
// Root-only, manual, single-use per packet. Three commands over one packet directory:
//   stage    fresh GitHub qualification + fresh production holder + fresh head -> ONE production deployment
//            with domain assignment disabled -> READY -> verify. Never promotes.
//   promote  fresh qualification, stage, root build binding, holder and head -> ONE call to root's
//            hash-pinned promotion adapter -> bounded read-only read-back.
//   readback read-only verification (also the manual read after any UNCERTAIN stop).
// Every provider read is made here, by this process, right before the decision that needs it.
// Ambiguous transport stops; nothing is retried or rolled back. No credentials are read or printed:
// GitHub and Vercel calls use root's already logged-in local `gh` and Vercel CLI. Nothing runs in CI.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {RELEASE_CONTRACT as C} from './release-qualification-contract.mjs';
import {evaluateQualification,evaluateProductionHolder,evaluateStage,evaluateBuildBinding,evaluateReadback,validateAdmission,stageBuildCommand} from './release-qualification-gate.mjs';
import {readPublishedRelease} from '../assets/release-status-panel.js';

export const RELEASE_RUNNER_VERSION='municontrol-release-promotion-runner.v3';
const SHA=/^[a-f0-9]{40}$/,HASH=/^[a-f0-9]{64}$/,DEPLOYMENT=/^dpl_[A-Za-z0-9]+$/,HOST=/^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export class ReleaseStop extends Error{constructor(code){super(code);this.code=code;}}
const stop=code=>new ReleaseStop(code);
const at=(packet,name)=>path.join(packet,name);
const once=(packet,name,value)=>fs.writeFileSync(at(packet,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const fromPacket=(packet,name)=>{try{return JSON.parse(fs.readFileSync(at(packet,name),'utf8'));}catch{throw stop('PACKET_MISSING:'+name);}};
const progress=(packet,name,record)=>{const save=()=>fs.writeFileSync(at(packet,name),JSON.stringify(record,null,2)+'\n');save();return save;};
const fill=(template,values)=>Object.entries(values).reduce((t,[k,v])=>t.replaceAll('{'+k+'}',String(v)),template);
const wait=ms=>()=>new Promise(resolve=>setTimeout(resolve,ms));

/** A transport answer is {exitCode,text}. A non-zero exit, a missing body or non-JSON is ambiguous. */
function parsed(answer,label){
 if(!answer||answer.exitCode!==0||typeof answer.text!=='string')throw stop('TRANSPORT_AMBIGUOUS:'+label);
 try{return JSON.parse(answer.text);}catch{throw stop('TRANSPORT_AMBIGUOUS:'+label);}
}
function admitTransport(transport){
 const shape={github:['get','pages','bytes'],vercel:['createDeployment','getDeployment','inspect','run']};
 for(const [group,names] of Object.entries(shape))for(const name of names)if(typeof transport?.[group]?.[name]!=='function')throw stop('TRANSPORT_SHAPE');
 if(typeof transport.readRelease!=='function')throw stop('TRANSPORT_SHAPE');
}
function admitInputs(sha,admission,transport){
 if(!SHA.test(sha??''))throw stop('SHA_FORMAT');
 if(validateAdmission(admission,sha).length)throw stop('ADMISSION_INVALID');
 admitTransport(transport);
}
function stopRecord(record,error,save){
 record.state=record.mutationRequested?'UNCERTAIN_STOP':'STOPPED_BEFORE_MUTATION';record.noFurtherCalls=true;
 record.failure={code:error?.code??null,message:String(error?.message??'').slice(0,200)};save();
}

/** Fresh GitHub observation of one SHA through the exact read endpoints of the contract. */
export async function observeQualification({sha,github}){
 if(!SHA.test(sha??''))throw stop('SHA_FORMAT');
 const G=C.github;
 const masterRef=parsed(await github.get(G.masterRef),'github-master');
 const commit=parsed(await github.get(fill(G.commit,{sha})),'github-commit');
 const contents={};
 for(const p of ['package.json','vercel.json',...C.workflows.map(w=>w.path),...C.pinnedSources.map(s=>s.path)])contents[p]=parsed(await github.get(fill(G.contents,{path:p,sha})),'github-contents');
 const runsPages=parsed(await github.pages(fill(G.runs,{sha})),'github-runs');
 const runs=Array.isArray(runsPages)?runsPages.flatMap(p=>Array.isArray(p?.workflow_runs)?p.workflow_runs:[]):[];
 const selected=runs.filter(r=>object(r)&&r.head_sha===sha&&Number.isSafeInteger(r.id)&&C.workflows.some(w=>w.path===r.path));
 const expectedArtifacts=new Set(C.workflows.flatMap(w=>w.jobs.map(j=>j.artifact.replaceAll('<sha>',sha))));
 const jobsPagesByRun={},artifactsPagesByRun={},artifactZips={};
 for(const r of selected){
  jobsPagesByRun[r.id]=parsed(await github.pages(fill(G.jobs,{runId:r.id})),'github-jobs');
  const pages=parsed(await github.pages(fill(G.artifacts,{runId:r.id})),'github-artifacts');artifactsPagesByRun[r.id]=pages;
  for(const a of Array.isArray(pages)?pages.flatMap(p=>Array.isArray(p?.artifacts)?p.artifacts:[]):[]){
   if(!expectedArtifacts.has(a?.name)||a?.workflow_run?.id!==r.id||!Number.isSafeInteger(a?.id)||a.expired!==false||Object.hasOwn(artifactZips,a.id))continue;
   const zip=await github.bytes(fill(G.artifactZip,{artifactId:a.id}));
   if(zip?.exitCode!==0||!(zip.bytes instanceof Uint8Array))throw stop('TRANSPORT_AMBIGUOUS:github-artifact');
   artifactZips[a.id]=zip.bytes;
  }
 }
 return {sha,masterRef,commit,contents,runsPages,jobsPagesByRun,artifactsPagesByRun,artifactZips};
}
const freshQualification=async(sha,transport)=>evaluateQualification({sha,observation:await observeQualification({sha,github:transport.github})});
const freshHead=async transport=>{const ref=parsed(await transport.github.get(C.github.masterRef),'github-master');return ref?.object?.type==='commit'?ref.object.sha:null;};
async function freshHolder(previousId,transport){
 const deployment=parsed(await transport.vercel.getDeployment(previousId),'holder-deployment'),inspections={};
 for(const domain of C.vercel.productionDomains)inspections[domain]=parsed(await transport.vercel.inspect(domain),'holder-inspect');
 return evaluateProductionHolder({previousId,deployment,inspections});
}
async function freshStage(qualification,createObservation,transport){
 const deployment=parsed(await transport.vercel.getDeployment(createObservation.id),'stage-deployment');
 const releaseInfo=parsed(await transport.readRelease(deployment?.url),'stage-release-info');
 return evaluateStage({qualification,createObservation,deployment,releaseInfo});
}
async function readBack({stage,transport,pause,maxReads}){
 for(let read=0;;read++){
  const stageDeployment=parsed(await transport.vercel.getDeployment(stage.deploymentId),'readback-stage');
  const inspections={},domainReleases={};
  for(const domain of C.vercel.productionDomains){
   inspections[domain]=parsed(await transport.vercel.inspect(domain),'readback-inspect');
   domainReleases[domain]=parsed(await transport.readRelease(domain),'readback-release');
  }
  const result=evaluateReadback({stage,stageDeployment,inspections,domainReleases});
  if(result.promotedAndReadBack||read+1>=Math.max(1,maxReads))return result;
  await pause();
 }
}

export async function runReleaseStage({sha,packet,admission,transport,pause=wait(20000),maxReadyReads=120,now=()=>new Date().toISOString()}){
 admitInputs(sha,admission,transport);
 once(packet,'STAGE_INVOCATION_STARTED.json',{version:RELEASE_RUNNER_VERSION,sha,admission,at:now(),automaticRetry:false});
 const record={version:RELEASE_RUNNER_VERSION,phase:'stage',sha,state:'STARTED',mutationRequested:false,automaticRetry:false,promotionRequested:false,readyIsNotAcceptance:true};
 const save=progress(packet,'STAGE_RESULT.json',record),finish=state=>{record.state=state;save();return record;};
 try{
  const qualification=await freshQualification(sha,transport);record.qualification=qualification;save();
  if(!qualification.qualified)return finish('NOT_QUALIFIED_NO_MUTATION');
  const holder=await freshHolder(admission.previousProductionDeploymentId,transport);record.holder=holder;save();
  if(!holder.holds)return finish('PRODUCTION_HOLDER_MISMATCH_NO_MUTATION');
  if(await freshHead(transport)!==sha)return finish('HEAD_MOVED_NO_MUTATION');
  // Same body as the admitted 2a2cda0a request, with the bundle-only command after the DB attestation verifier.
  const request={name:C.vercel.projectName,project:C.vercel.projectId,target:'production',
   gitSource:{type:'github',repoId:C.repository.id,ref:sha,sha},buildCommand:stageBuildCommand(sha),autoAssignCustomDomains:false};
  once(packet,'STAGE_REQUEST.json',request);
  // The exact bytes Vercel will receive are checked BEFORE the mutation is recorded as requested.
  if(JSON.stringify(JSON.parse(fs.readFileSync(at(packet,'STAGE_REQUEST.json'),'utf8')))!==JSON.stringify(request))return finish('STAGE_REQUEST_CHANGED_NO_MUTATION');
  record.mutationRequested=true;record.state='STAGE_REQUESTED';save();
  const created=parsed(await transport.vercel.createDeployment(request,at(packet,'STAGE_REQUEST.json')),'create');
  const d=object(created?.deployment)?created.deployment:created;
  const createObservation={id:d?.id??null,url:d?.url??null,target:d?.target??null,autoAssignCustomDomains:d?.autoAssignCustomDomains??null,
   effectiveBuildCommand:d?.projectSettings?.buildCommand??d?.buildCommand??null,gitSource:d?.gitSource??null};
  if(!DEPLOYMENT.test(createObservation.id??''))throw stop('TRANSPORT_AMBIGUOUS:create-id');
  once(packet,'STAGE_CREATE_OBSERVATION.json',createObservation);record.deploymentId=createObservation.id;record.state='STAGE_BUILDING';save();
  let deployment=null;
  for(let read=0;;read++){
   deployment=parsed(await transport.vercel.getDeployment(createObservation.id),'stage-deployment');
   if(['READY','ERROR','CANCELED'].includes(deployment?.readyState)||read+1>=Math.max(1,maxReadyReads))break;
   await pause();
  }
  record.readyState=deployment?.readyState??null;save();
  if(deployment?.readyState!=='READY')return finish('STAGE_NOT_READY_NO_PROMOTION');
  // The deployment exists and was observed; an unreadable identity (e.g. Deployment Protection on generated
  // URLs, not visible in sources) is a verification failure, not an ambiguous mutation.
  const info=await transport.readRelease(deployment.url);
  if(info?.exitCode!==0)return finish('STAGE_RELEASE_UNVERIFIABLE_NO_PROMOTION');
  const stage=evaluateStage({qualification,createObservation,deployment,releaseInfo:parsed(info,'stage-release-info')});
  record.stage=stage;save();
  if(!stage.stageVerified)return finish('STAGE_REJECTED_NO_PROMOTION');
  once(packet,'STAGE_VERIFIED.json',{...stage,previousProductionDeploymentId:admission.previousProductionDeploymentId,
   createObservationSha256:sha256(fs.readFileSync(at(packet,'STAGE_CREATE_OBSERVATION.json')))});
  return finish('STAGE_VERIFIED_AWAITING_ROOT_BUILD_BINDING');
 }catch(error){stopRecord(record,error,save);throw error;}
}

/** adapter: root-owned module, hash-pinned on the command line, exporting promoteOnce(). Absent -> no mutation. */
export async function runReleasePromotion({sha,packet,admission,binding,adapter=null,transport,pause=wait(10000),maxReadbackReads=15,now=()=>new Date().toISOString()}){
 admitInputs(sha,admission,transport);
 once(packet,'PROMOTION_INVOCATION_STARTED.json',{version:RELEASE_RUNNER_VERSION,sha,admission,at:now(),automaticRetry:false,adapterPresent:typeof adapter?.promoteOnce==='function'});
 const record={version:RELEASE_RUNNER_VERSION,phase:'promotion',sha,state:'STARTED',mutationRequested:false,automaticRetry:false,promotionRequested:false,promotedAndReadBack:false};
 const save=progress(packet,'PROMOTION_RESULT.json',record),finish=state=>{record.state=state;save();return record;};
 try{
  const verified=fromPacket(packet,'STAGE_VERIFIED.json'),createObservation=fromPacket(packet,'STAGE_CREATE_OBSERVATION.json'),previousId=admission.previousProductionDeploymentId;
  const observationSha256=sha256(fs.readFileSync(at(packet,'STAGE_CREATE_OBSERVATION.json')));
  if(verified?.kind!=='stage'||verified.stageVerified!==true||verified.sha!==sha||verified.deploymentId!==createObservation?.id||verified.previousProductionDeploymentId!==previousId
   ||verified.createObservationSha256!==observationSha256)return finish('STAGE_PACKET_INVALID_NO_MUTATION');
  const qualification=await freshQualification(sha,transport);record.qualification=qualification;save();
  if(!qualification.qualified)return finish('NOT_QUALIFIED_NO_MUTATION');
  const stage=await freshStage(qualification,createObservation,transport);record.stage=stage;save();
  if(!stage.stageVerified||stage.adminUiSha256!==verified.adminUiSha256)return finish('STAGE_REVERIFICATION_FAILED_NO_MUTATION');
  const bound=evaluateBuildBinding({stage,binding,admission});record.binding=bound;save();
  if(!bound.bound)return finish('BUILD_BINDING_REJECTED_NO_MUTATION');
  if(typeof adapter?.promoteOnce!=='function'){
   once(packet,'PROMOTION_PRECONDITIONS_VERIFIED.json',{sha,deploymentId:stage.deploymentId,previousId,at:now(),note:'No adapter: no mutation. A later manual promotion loses this freshness; run readback after it.'});
   return finish('PROMOTION_ADAPTER_REQUIRED_NO_MUTATION');
  }
  // Last fresh reads, immediately before the only mutation: nobody moved the domains, the head is still this SHA.
  const holder=await freshHolder(previousId,transport);record.holder=holder;save();
  if(!holder.holds)return finish('PRODUCTION_HOLDER_MOVED_NO_MUTATION');
  if(await freshHead(transport)!==sha)return finish('HEAD_MOVED_NO_MUTATION');
  once(packet,'PROMOTION_REQUESTED.json',{deploymentId:stage.deploymentId,previousId,sha,at:now()});
  record.mutationRequested=true;record.promotionRequested=true;record.state='PROMOTION_REQUESTED';save();
  // The adapter gets ONE provider call: a second one is refused, and the arguments are recorded first (wx).
  let used=false;
  const vercelOnce=async args=>{if(used)throw stop('ADAPTER_SECOND_CALL_REFUSED');used=true;
   once(packet,'PROMOTION_ADAPTER_CALL.json',{args,at:now()});return transport.vercel.run(args);};
  let answer;
  try{answer=await adapter.promoteOnce(Object.freeze({deploymentId:stage.deploymentId,previousDeploymentId:previousId,teamId:C.vercel.teamId,teamSlug:C.vercel.teamSlug,projectId:C.vercel.projectId,vercel:vercelOnce}));}
  catch{throw stop('TRANSPORT_AMBIGUOUS:promote');}
  // A non-zero exit may still have promoted: STOP, never re-send; `readback` is the manual read.
  if(answer?.exitCode!==0)throw stop('TRANSPORT_AMBIGUOUS:promote');
  record.state='PROMOTION_SENT_READING_BACK';save();
  const readback=await readBack({stage,transport,pause,maxReads:maxReadbackReads});
  record.readback=readback;record.promotedAndReadBack=readback.promotedAndReadBack;
  return finish(readback.promotedAndReadBack?'PROMOTED_AND_READ_BACK':'PROMOTION_READBACK_MISMATCH_UNCERTAIN');
 }catch(error){stopRecord(record,error,save);throw error;}
}

/** Read-only. Never creates, promotes or retries anything. */
export async function runReleaseReadback({sha,packet,admission,transport,pause=wait(10000),maxReadbackReads=1,now=()=>new Date().toISOString()}){
 admitInputs(sha,admission,transport);
 const verified=fromPacket(packet,'STAGE_VERIFIED.json');
 if(verified?.kind!=='stage'||verified.stageVerified!==true||verified.sha!==sha||verified.previousProductionDeploymentId!==admission.previousProductionDeploymentId)throw stop('STAGE_PACKET_INVALID');
 const readback=await readBack({stage:verified,transport,pause,maxReads:maxReadbackReads});
 const at_=now(),record={version:RELEASE_RUNNER_VERSION,phase:'readback',sha,at:at_,readOnly:true,readback,state:readback.promotedAndReadBack?'PROMOTED_AND_READ_BACK':'NOT_PROMOTED_OR_MISMATCH'};
 once(packet,'READBACK_'+at_.replace(/[^0-9TZ]/g,'')+'.json',record);
 return record;
}

/** GitHub reads exactly as root's check-pr197-ci-gate (no-cache, paginate+slurp) and artifact downloads (GET zip). */
export function githubTransport({gh='gh',timeoutMs=180000}={}){
 const run=promisify(execFile),repo='repos/'+C.repository.fullName+'/';
 const text=async args=>{try{const {stdout}=await run(gh,args,{encoding:'utf8',maxBuffer:48*1024*1024,windowsHide:true,shell:false,timeout:timeoutMs});return{exitCode:0,text:stdout};}
  catch(error){return{exitCode:Number.isInteger(error?.code)&&error.code!==0?error.code:1,text:''};}};
 return Object.freeze({
  get:endpoint=>text(['api','-H','Cache-Control: no-cache',repo+endpoint]),
  pages:endpoint=>text(['api','-H','Cache-Control: no-cache','--paginate','--slurp',repo+endpoint]),
  bytes:async endpoint=>{try{const {stdout}=await run(gh,['api','--method','GET',repo+endpoint],{encoding:'buffer',maxBuffer:128*1024*1024,windowsHide:true,shell:false,timeout:timeoutMs});return{exitCode:0,bytes:new Uint8Array(stdout)};}
   catch{return{exitCode:1,bytes:null};}}
 });
}

/** Vercel CLI module exactly as check-pr197-ci-gate resolves it: run by this node, never through cmd.exe. */
export async function resolveVercelCli(){
 const run=promisify(execFile);
 if(process.platform==='win32'){
  const {stdout}=await run('where.exe',['vercel.cmd'],{encoding:'utf8',windowsHide:true});
  for(const entry of stdout.trim().split(/\r?\n/)){const candidate=path.join(path.dirname(entry),'node_modules/vercel/dist/index.js');if(fs.existsSync(candidate))return[process.execPath,candidate];}
  throw stop('VERCEL_CLI_MODULE_NOT_FOUND');
 }
 const {stdout}=await run('which',['vercel'],{encoding:'utf8'});
 return[process.execPath,fs.realpathSync(stdout.trim())];
}

/** create: create-once.ps1. GET: check-pr197-ci-gate. inspect: verify-remote-release-base. No promotion endpoint here. */
export function vercelTransport({cli,timeoutMs=120000}){
 if(!Array.isArray(cli)||cli.length<2)throw stop('VERCEL_CLI_REQUIRED');
 const run=promisify(execFile),V=C.vercel;
 const exec=async args=>{try{const {stdout}=await run(cli[0],[...cli.slice(1),...args],{encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,shell:false,timeout:timeoutMs});return{exitCode:0,text:stdout};}
  catch(error){return{exitCode:Number.isInteger(error?.code)&&error.code!==0?error.code:1,text:''};}};
 return Object.freeze({
  createDeployment:(request,requestFile)=>{let same=false;try{same=JSON.stringify(JSON.parse(fs.readFileSync(requestFile,'utf8')))===JSON.stringify(request);}catch{}
   return same?exec(['api',fill(C.vercelApi.create,{teamId:V.teamId}),'--method','POST','--input',requestFile,'--scope',V.teamId,'--non-interactive','--raw']):{exitCode:1,text:''};},
  getDeployment:id=>DEPLOYMENT.test(id??'')?exec(['api',fill(C.vercelApi.deployment,{id}),'--scope',V.teamSlug,'--method','GET','--raw']):{exitCode:1,text:''},
  inspect:domain=>V.productionDomains.includes(domain)?exec(['inspect',domain,'--scope',V.teamId,'--json']):{exitCode:1,text:''},
  run:args=>Array.isArray(args)&&args.every(a=>typeof a==='string')?exec(args):{exitCode:1,text:''}
 });
}

/** Published identity through the existing hardened reader (200, JSON, no-store, 4 KiB, verifyRelease). */
export function releaseReader({timeoutMs=60000}={}){
 return async host=>{
  if(typeof host!=='string'||!HOST.test(host))return{exitCode:1,text:''};
  try{const value=await readPublishedRelease((endpoint,init)=>fetch(new URL(endpoint,'https://'+host+'/'),init),AbortSignal.timeout(timeoutMs));return{exitCode:0,text:JSON.stringify(value)};}
  catch{return{exitCode:1,text:''};}
 };
}

/** CLI. Every local input is hash-pinned on the command line; provider facts are always read fresh. */
export async function main(argv=process.argv.slice(2)){
 const [command,...rest]=argv;
 if(!['stage','promote','readback'].includes(command))throw stop('COMMAND_REQUIRED');
 const value=name=>{const i=rest.indexOf('--'+name);if(i<0)return null;const v=rest[i+1];if(!v||v.startsWith('--'))throw stop('ARGUMENT_REQUIRED:'+name);return v;};
 const flag=name=>{const v=value(name);if(v===null)throw stop('ARGUMENT_REQUIRED:'+name);return v;};
 const pinnedBytes=(file,expected)=>{const raw=fs.readFileSync(file);if(!HASH.test(expected??'')||sha256(raw)!==expected)throw stop('INPUT_CHANGED:'+path.basename(file));return raw;};
 const pinnedJson=(file,expected)=>JSON.parse(pinnedBytes(file,expected));
 const sha=flag('sha'),packet=flag('packet'),admission=pinnedJson(flag('admission'),flag('admission-sha256'));
 const transport={github:githubTransport(),vercel:vercelTransport({cli:await resolveVercelCli()}),readRelease:releaseReader()};
 if(command==='stage')return runReleaseStage({sha,packet,admission,transport});
 if(command==='readback')return runReleaseReadback({sha,packet,admission,transport});
 const binding=pinnedJson(flag('binding'),flag('binding-sha256'));
 const adapterFile=value('promotion-adapter'),adapterHash=value('promotion-adapter-sha256');
 if((adapterFile===null)!==(adapterHash===null))throw stop('ARGUMENT_REQUIRED:promotion-adapter');
 // The verified bytes themselves are imported (data: URL), so the file cannot change between hash and import.
 const adapter=adapterFile===null?null:await import('data:text/javascript;base64,'+pinnedBytes(adapterFile,adapterHash).toString('base64'));
 return runReleasePromotion({sha,packet,admission,binding,adapter,transport});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().then(r=>process.stdout.write(JSON.stringify({phase:r.phase,state:r.state,promotedAndReadBack:r.promotedAndReadBack??r.readback?.promotedAndReadBack??false})+'\n'))
  .catch(e=>{process.stderr.write('RELEASE_RUNNER_STOPPED '+String(e?.code??'')+'\n');process.exitCode=1;});
}
