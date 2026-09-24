// Strict, bounded reads of already extracted artifacts. The legacy importer stays unchanged.
import fs from 'node:fs/promises';import path from 'node:path';
import {reviveCuratedNumber} from './grh-curated-numbers.mjs';
import {getGrhSourceProfile} from './grh-source-profile.mjs';
import {CURATED_REVIEW_SCHEMA,CURATED_REVIEW_DOMAINS} from '../../assets/grh-curated-review-model.js';
import {curatedDigest,curatedComparisonFault as fail} from './grh-curated-comparison.mjs';
export async function boundedCuratedRead(file,maxBytes){
 const entry=await fs.lstat(file);if(entry.isSymbolicLink()||!entry.isFile())fail('GRH_CURATED_REVIEW_FILE_TYPE');
 const handle=await fs.open(file,'r');
 try{
  const before=await handle.stat();if(before.size<2||before.size>maxBytes)fail('GRH_CURATED_REVIEW_FILE_SIZE');
  const bytes=Buffer.alloc(before.size);let offset=0;
  while(offset<bytes.length){const read=await handle.read(bytes,offset,bytes.length-offset,offset);if(!read.bytesRead)fail('GRH_CURATED_REVIEW_FILE_CHANGED');offset+=read.bytesRead;}
  const extra=Buffer.alloc(1),after=await handle.stat();
  if((await handle.read(extra,0,1,offset)).bytesRead||after.size!==before.size||after.mtimeMs!==before.mtimeMs)fail('GRH_CURATED_REVIEW_FILE_CHANGED');
  return bytes;
 }finally{await handle.close();}
}
export function parseCuratedJson(bytes,{losslessNumbers=false}={}){
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes),losslessNumbers?reviveCuratedNumber:undefined);}catch{fail('GRH_CURATED_REVIEW_JSON_INVALID');}
}
export async function openCuratedSource(directory,profileId){
 const root=await fs.realpath(directory),profile=getGrhSourceProfile(profileId,{allowCandidateRead:true});
 const manifestPath=path.join(root,'curated-manifest.json');
 const bytes=await boundedCuratedRead(manifestPath,1024*1024),manifest=parseCuratedJson(bytes),sha=curatedDigest(bytes);
 if(manifest.schemaVersion!=='1.0.0'||manifest.profile!==profile.curated.profileId||manifest.sourceProfileId!==profile.id
  ||manifest.profileVersion!==profile.profileVersion||manifest.source?.sha256!==profile.source.sha256
  ||manifest.source?.database!==profile.source.database||manifest.source?.sizeBytes!==profile.source.logicalBytes
  ||manifest.source?.dumpCompletedAt?.replace(' ','T')!==profile.source.cutoff||manifest.validation?.strictSnapshot!==true)fail('GRH_CURATED_REVIEW_SOURCE_MISMATCH');
 if(Object.keys(manifest.outputs??{}).sort().join('|')!==[...CURATED_REVIEW_DOMAINS].sort().join('|'))fail('GRH_CURATED_REVIEW_ARTIFACT_SET');
 for(const [table,expected]of Object.entries(profile.curated.expectedCounts)){
  const count=manifest.validation.sourceCounts?.[table];
  if(count?.expected!==expected||count.actual!==expected||count.distinctPrimaryKeys!==expected||count.duplicatePrimaryKeyRows!==0)fail('GRH_CURATED_REVIEW_SOURCE_COUNTS');
 }
 for(const name of CURATED_REVIEW_DOMAINS){
  const descriptor=manifest.outputs[name];
  if(descriptor.file!==CURATED_REVIEW_SCHEMA[name][0]||descriptor.records!==profile.curated.expectedOutputCounts[name]
   ||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<2||descriptor.bytes>48*1024*1024||!/^[a-f0-9]{64}$/i.test(descriptor.sha256??''))fail('GRH_CURATED_REVIEW_ARTIFACT_DESCRIPTOR');
 }
 return {root,manifest,manifestSha256:sha,profile,
  summary:{profileId:profile.id,sourceSha256:profile.source.sha256.toLowerCase(),sourceCutoff:profile.source.cutoff,manifestSha256:sha}};
}
export async function readCuratedArtifact(source,name){
 if(!CURATED_REVIEW_DOMAINS.includes(name))fail('GRH_CURATED_REVIEW_ENTITY_INVALID');
 const descriptor=source.manifest.outputs[name],file=path.join(source.root,descriptor.file);
 if(path.dirname(await fs.realpath(file))!==source.root)fail('GRH_CURATED_REVIEW_FILE_ESCAPE');
 const bytes=await boundedCuratedRead(file,48*1024*1024);
 if(bytes.length!==descriptor.bytes||curatedDigest(bytes)!==descriptor.sha256.toLowerCase())fail('GRH_CURATED_REVIEW_ARTIFACT_CHANGED');
 const records=parseCuratedJson(bytes,{losslessNumbers:true});if(!Array.isArray(records)||records.length!==descriptor.records)fail('GRH_CURATED_REVIEW_OUTPUT_COUNT');
 return {records,bytes:bytes.length};
}
export async function recheckCuratedManifest(source){
 const bytes=await boundedCuratedRead(path.join(source.root,'curated-manifest.json'),1024*1024);
 if(curatedDigest(bytes)!==source.manifestSha256)fail('GRH_CURATED_REVIEW_MANIFEST_CHANGED');
}
