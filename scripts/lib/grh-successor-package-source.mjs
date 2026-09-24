// Lee fuentes extraídas y verificadas. No carga variables privadas ni conecta a PostgreSQL.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {preflightGrhCore} from '../import-grh-core-canonical.mjs';
import {verifyMultirunCandidate} from '../verify-grh-multirun-candidate.mjs';
import {projectCuratedReviewTables} from '../import-rrhh-neon.mjs';
import {openCuratedSource,boundedCuratedRead,recheckCuratedManifest} from './grh-curated-source-reader.mjs';
import {canonicalCuratedNumber} from './grh-curated-numbers.mjs';
import {streamDeterministicJsonArray,sha256File} from './canonical-import.mjs';
import {CURATED_REVIEW_DOMAINS} from '../../assets/grh-curated-review-model.js';
import {getGrhSourceProfile} from './grh-source-profile.mjs';
import {SUCCESSOR_ENTITIES,buildSuccessorDelta,sealSuccessorPackage,successorHash,successorFault} from './grh-successor-package.mjs';
const fail=successorFault;
const profiles={baseline:'grh-junin-2026-09-10',candidate:'grh-junin-2026-09-22'};
export function parseSuccessorJson(bytes){
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes),(_key,value,context)=>{
    if(typeof value!=='number')return value;
    if(!Number.isFinite(value)||typeof context?.source!=='string'
      ||canonicalCuratedNumber(context.source)!==canonicalCuratedNumber(JSON.stringify(value)))fail('SUCCESSOR_NUMBER_PRECISION');
    if(Number.isInteger(value)&&!Number.isSafeInteger(value))fail('SUCCESSOR_NUMBER_PRECISION');
    return value;
  });}catch(e){if(e.code==='SUCCESSOR_NUMBER_PRECISION')throw e;fail('SUCCESSOR_JSON_INVALID');}
}
async function confined(directory,name){
  const file=path.join(directory,name),entry=await fs.lstat(file);
  if(!entry.isFile()||entry.isSymbolicLink()||path.dirname(await fs.realpath(file))!==directory)fail('SUCCESSOR_FILE_OUTSIDE_DIRECTORY');
  return file;
}
async function openCore(directory,side){
  const root=await fs.realpath(directory),profileId=profiles[side];
  const manifestPath=await confined(root,'grh-core-manifest.json');
  const bytes=await boundedCuratedRead(manifestPath,1024*1024),manifest=parseSuccessorJson(bytes);
  const checked=side==='baseline'
    ?await preflightGrhCore({dataDir:pathToFileURL(root+path.sep),profileId})
    :await verifyMultirunCandidate({dataDir:root,profileId});
  if(checked.manifestSha256.toLowerCase()!==successorHash(bytes))fail('SUCCESSOR_CORE_MANIFEST_CHANGED');
  const artifacts={};
  for(const entity of SUCCESSOR_ENTITIES.filter(e=>e.startsWith('core/'))){
    const name=entity.slice(5),descriptor=manifest.outputs[name];
    artifacts[name]={path:await confined(root,descriptor.file),descriptor};
  }
  return {root,manifest,manifestPath,manifestSha256:successorHash(bytes),artifacts};
}
async function loadCurated(directory,side){
  const source=await openCuratedSource(directory,profiles[side]),datasets={};
  for(const name of CURATED_REVIEW_DOMAINS){
    const descriptor=source.manifest.outputs[name];
    const bytes=await boundedCuratedRead(await confined(source.root,descriptor.file),48*1024*1024);
    if(bytes.length!==descriptor.bytes||successorHash(bytes)!==descriptor.sha256.toLowerCase())fail('SUCCESSOR_CURATED_ARTIFACT_CHANGED');
    const rows=parseSuccessorJson(bytes);
    if(!Array.isArray(rows)||rows.length!==descriptor.records)fail('SUCCESSOR_CURATED_COUNT');
    datasets[name]=rows;
  }
  const embedded=datasets.employees.reduce((n,e)=>n+(e.unionMemberships?.length??0),0);
  if(embedded!==datasets.unionMemberships.length)fail('SUCCESSOR_CURATED_MEMBERSHIP_COUNT');
  return {...source,tables:projectCuratedReviewTables(datasets,source.profile.source.cutoff)};
}
async function recheck(source,kind){
  if(kind==='core'){
    if(successorHash(await boundedCuratedRead(source.manifestPath,1024*1024))!==source.manifestSha256)fail('SUCCESSOR_CORE_MANIFEST_CHANGED');
    for(const value of Object.values(source.artifacts)){
      const current=await confined(source.root,path.basename(value.path));
      if((await fs.stat(current)).size!==value.descriptor.bytes
        ||(await sha256File(current)).toLowerCase()!==value.descriptor.sha256.toLowerCase())fail('SUCCESSOR_CORE_ARTIFACT_CHANGED');
    }
  }else{
    await recheckCuratedManifest(source);
    for(const descriptor of Object.values(source.manifest.outputs)){
      const file=await confined(source.root,descriptor.file);
      if((await fs.stat(file)).size!==descriptor.bytes
        ||(await sha256File(file)).toLowerCase()!==descriptor.sha256.toLowerCase())fail('SUCCESSOR_CURATED_ARTIFACT_CHANGED');
    }
  }
}
export async function prepareSuccessorPackage({baselineCore,candidateCore,baselineCurated,candidateCurated,onProgress=()=>{}}={}){
  if(![baselineCore,candidateCore,baselineCurated,candidateCurated].every(v=>typeof v==='string'&&path.isAbsolute(v)))fail('SUCCESSOR_SOURCE_DIRECTORY_REQUIRED');
  const core={},curated={};
  for(const side of ['baseline','candidate']){
    core[side]=await openCore(side==='baseline'?baselineCore:candidateCore,side);
    curated[side]=await loadCurated(side==='baseline'?baselineCurated:candidateCurated,side);
    const profile=getGrhSourceProfile(profiles[side],{allowCandidateRead:true});
    if(core[side].manifest.source.sha256.toLowerCase()!==curated[side].manifest.source.sha256.toLowerCase()
      ||core[side].manifest.source.sha256.toLowerCase()!==profile.source.sha256.toLowerCase())fail('SUCCESSOR_COORDINATED_SOURCE_MISMATCH');
    onProgress({phase:'source_verified',side,profileId:profile.id});
  }
  if(core.baseline.root===core.candidate.root||curated.baseline.root===curated.candidate.root)fail('SUCCESSOR_DISTINCT_SOURCES_REQUIRED');
  const results=[];
  for(const entity of SUCCESSOR_ENTITIES){
    const [kind,name]=entity.split('/');
    const reader=side=>kind==='core'
      ?()=>streamDeterministicJsonArray(core[side].artifacts[name].path,core[side].artifacts[name].descriptor)
      :()=>curated[side].tables[name];
    const result=await buildSuccessorDelta(entity,{baseline:reader('baseline'),candidate:reader('candidate')});
    results.push(result);
    onProgress({phase:'entity_complete',entity,baselineRows:result.baseline.rows,candidateRows:result.candidate.rows,changes:result.changes});
  }
  for(const side of ['baseline','candidate']){await recheck(core[side],'core');await recheck(curated[side],'curated');}
  const source=side=>({profileId:profiles[side],sourceSha256:core[side].manifest.source.sha256.toLowerCase(),
    cutoff:curated[side].profile.source.cutoff,coreManifestSha256:core[side].manifestSha256,
    curatedManifestSha256:curated[side].manifestSha256.toLowerCase()});
  return sealSuccessorPackage({baseline:source('baseline'),candidate:source('candidate'),results});
}
