// Paquete privado de diferencias: no abre conexiones ni selecciona una fuente operativa.
import {createHash} from 'node:crypto';
import {getGrhSourceProfile} from './grh-source-profile.mjs';
import {stableJson} from './canonical-import.mjs';
import {projectGrhVersionRecord, GRH_VERSION_ENTITIES} from './grh-core-source-version.mjs';
import {normalizeGrhCuratedVersionRecord, grhCuratedVersionKey, GRH_CURATED_VERSION_ENTITIES} from './grh-curated-source-version.mjs';
export const SUCCESSOR_ENTITIES = Object.freeze([
  ...GRH_VERSION_ENTITIES.map(name=>'core/'+name),
  ...GRH_CURATED_VERSION_ENTITIES.map(name=>'curated/'+name)
]);
export const SUCCESSOR_PACKAGE_VERSION = 'grh-successor-package.v1';
export const SUCCESSOR_LIMITS = Object.freeze({rowsPerEntity:1000000,changes:100000,bytes:24*1024*1024});
export const successorHash = value=>createHash('sha256').update(value).digest('hex');
export function successorFault(code){throw Object.assign(new Error(code),{code});}
function project(entity, raw){
  if(!SUCCESSOR_ENTITIES.includes(entity))successorFault('SUCCESSOR_ENTITY_INVALID');
  const [scope,name]=entity.split('/');
  const record=scope==='core'?projectGrhVersionRecord(name,raw):normalizeGrhCuratedVersionRecord(name,raw);
  const rowKey=scope==='core'?successorHash(stableJson(raw.sourceKey)):grhCuratedVersionKey(name,record);
  const company=scope==='core'?record.company_source_id:record.company_id;
  if(name!=='grh_catalog_rows'&&String(company)!=='101')successorFault('SUCCESSOR_COMPANY_INVALID');
  return {rowKey,record,sha256:successorHash(stableJson(record))};
}
function fingerprint(index){
  const digest=createHash('sha256');
  for(const key of [...index.keys()].sort())digest.update(key+':'+index.get(key)+'\n');
  return {rows:index.size,sha256:digest.digest('hex')};
}
export async function buildSuccessorDelta(entity,{baseline,candidate}){
  if(!SUCCESSOR_ENTITIES.includes(entity))successorFault('SUCCESSOR_ENTITY_INVALID');
  if(typeof baseline!=='function'||typeof candidate!=='function')successorFault('SUCCESSOR_READER_REQUIRED');
  const before=new Map(),after=new Map(),changes=[],pending=new Map();let bytes=0;
  for await(const raw of baseline()){
    const row=project(entity,raw);
    if(before.has(row.rowKey))successorFault('SUCCESSOR_BASE_DUPLICATE');
    before.set(row.rowKey,row.sha256);
    if(before.size>SUCCESSOR_LIMITS.rowsPerEntity)successorFault('SUCCESSOR_ROW_LIMIT');
  }
  function add(change){
    bytes+=Buffer.byteLength(stableJson(change));
    if(changes.length>=SUCCESSOR_LIMITS.changes||bytes>SUCCESSOR_LIMITS.bytes)successorFault('SUCCESSOR_PACKAGE_LIMIT');
    changes.push(change);if(change.operation!=='add')pending.set(change.rowKey,change);
  }
  for await(const raw of candidate()){
    const row=project(entity,raw);
    if(after.has(row.rowKey))successorFault('SUCCESSOR_CANDIDATE_DUPLICATE');
    after.set(row.rowKey,row.sha256);
    if(after.size>SUCCESSOR_LIMITS.rowsPerEntity)successorFault('SUCCESSOR_ROW_LIMIT');
    if(before.get(row.rowKey)===row.sha256)continue;
    add({entity,rowKey:row.rowKey,operation:before.has(row.rowKey)?'replace':'add',
      previousRecord:null,record:row.record,previousSourcePayload:null,
      sourcePayload:entity.startsWith('core/')?structuredClone(raw):null});
  }
  for(const key of before.keys())if(!after.has(key))add({entity,rowKey:key,operation:'remove',
    previousRecord:null,record:null,previousSourcePayload:null,sourcePayload:null});
  const observed=new Map();
  for await(const raw of baseline()){
    const row=project(entity,raw);
    if(observed.has(row.rowKey)||before.get(row.rowKey)!==row.sha256)successorFault('SUCCESSOR_BASE_CHANGED');
    observed.set(row.rowKey,row.sha256);const change=pending.get(row.rowKey);
    if(change){change.previousRecord=row.record;
      change.previousSourcePayload=entity.startsWith('core/')?structuredClone(raw):null;pending.delete(row.rowKey);}
  }
  if(observed.size!==before.size||pending.size)successorFault('SUCCESSOR_BASE_CHANGED');
  changes.sort((a,b)=>a.rowKey<b.rowKey?-1:a.rowKey>b.rowKey?1:0);
  if(Buffer.byteLength(stableJson(changes))>SUCCESSOR_LIMITS.bytes)successorFault('SUCCESSOR_PACKAGE_LIMIT');
  const counts={add:0,replace:0,remove:0};for(const change of changes)counts[change.operation]++;
  return {entity,baseline:fingerprint(before),candidate:fingerprint(after),changes:counts,rows:changes};
}
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>plain(value)&&Object.keys(value).sort().join('|')===[...keys].sort().join('|');
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function validFingerprint(value){
  return exact(value,['rows','sha256'])&&Number.isSafeInteger(value.rows)&&value.rows>=0
    &&value.rows<=SUCCESSOR_LIMITS.rowsPerEntity&&digest(value.sha256);
}
function validSource(value){
  return exact(value,['profileId','sourceSha256','cutoff','coreManifestSha256','curatedManifestSha256'])
    &&typeof value.profileId==='string'&&typeof value.cutoff==='string'
    &&[value.sourceSha256,value.coreManifestSha256,value.curatedManifestSha256].every(digest);
}
// Verificación offline del archivo, sin acceso a Neon ni autorización de publicación.
export function verifySuccessorPackage(input){
  const bad=()=>successorFault('SUCCESSOR_PACKAGE_INVALID');
  if(!exact(input,['version','baseline','candidate','entities','changes','operational','sourcePromoted','payloadSha256']))bad();
  if(input.version!==SUCCESSOR_PACKAGE_VERSION||input.operational!==false||input.sourcePromoted!==false)bad();
  if(!validSource(input.baseline)||!validSource(input.candidate)||!digest(input.payloadSha256))bad();
  if(input.baseline.profileId!=='grh-junin-2026-09-10'||input.candidate.profileId!=='grh-junin-2026-09-22')bad();
  if(!exact(input.entities,SUCCESSOR_ENTITIES)||!Array.isArray(input.changes)||input.changes.length>SUCCESSOR_LIMITS.changes)bad();
  const {payloadSha256,...payload}=input;
  if(Buffer.byteLength(stableJson(input))>SUCCESSOR_LIMITS.bytes||successorHash(stableJson(payload))!==payloadSha256)bad();
  const counts=new Map(),seen=new Set();
  for(const entity of SUCCESSOR_ENTITIES){
    const proof=input.entities[entity];
    if(!exact(proof,['baseline','candidate','changes'])||!validFingerprint(proof.baseline)||!validFingerprint(proof.candidate))bad();
    if(!exact(proof.changes,['add','replace','remove']))bad();
    for(const value of Object.values(proof.changes))if(!Number.isSafeInteger(value)||value<0||value>SUCCESSOR_LIMITS.changes)bad();
    if(proof.candidate.rows!==proof.baseline.rows+proof.changes.add-proof.changes.remove)bad();
    if(proof.changes.remove+proof.changes.replace>proof.baseline.rows)bad();
    counts.set(entity,{add:0,replace:0,remove:0});
  }
  for(const change of input.changes){
    if(!exact(change,['entity','rowKey','operation','previousRecord','record','previousSourcePayload','sourcePayload']))bad();
    if(!SUCCESSOR_ENTITIES.includes(change.entity)||!digest(change.rowKey)||!['add','replace','remove'].includes(change.operation))bad();
    const key=change.entity+':'+change.rowKey;if(seen.has(key))bad();seen.add(key);
    counts.get(change.entity)[change.operation]++;
  }
  assertSuccessorChanges(input,counts);
  for(const side of [input.baseline,input.candidate]){const profile=getGrhSourceProfile(side.profileId,{allowCandidateRead:true});if(side.sourceSha256!==profile.source.sha256.toLowerCase()||side.cutoff!==profile.source.cutoff)bad();}
  return input;
}
function assertSuccessorChanges(input,counts){
  const bad=()=>successorFault('SUCCESSOR_PACKAGE_INVALID');let last='';
  for(const change of input.changes){
    const key=change.entity+':'+change.rowKey;if(last&&key<=last)bad();last=key;
    const core=change.entity.startsWith('core/');
    for(const [record,source,needed]of [
      [change.previousRecord,change.previousSourcePayload,change.operation!=='add'],
      [change.record,change.sourcePayload,change.operation!=='remove']
    ]){
      if(!needed){if(record!==null||source!==null)bad();continue;}
      if(!plain(record)||(core?!plain(source):source!==null))bad();
      let projected;try{projected=project(change.entity,core?source:record);}catch{bad();}
      if(projected.rowKey!==change.rowKey||stableJson(projected.record)!==stableJson(record))bad();
    }
    if(change.operation==='replace'&&stableJson(change.previousRecord)===stableJson(change.record))bad();
  }
  for(const entity of SUCCESSOR_ENTITIES){
    const proof=input.entities[entity],totals=counts.get(entity);
    if(stableJson(totals)!==stableJson(proof.changes))bad();
    const n=totals.add+totals.replace+totals.remove;
    if(n===0&&stableJson(proof.baseline)!==stableJson(proof.candidate))bad();
    if(n>0&&proof.baseline.sha256===proof.candidate.sha256)bad();
    for(const value of [proof.baseline,proof.candidate])if(value.rows===0&&value.sha256!==successorHash(''))bad();
  }
}
export function sealSuccessorPackage({baseline,candidate,results}){
  if(!Array.isArray(results)||results.length!==SUCCESSOR_ENTITIES.length)successorFault('SUCCESSOR_PACKAGE_INCOMPLETE');
  const entities={},changes=[];
  for(const result of results){
    if(!SUCCESSOR_ENTITIES.includes(result?.entity)||Object.hasOwn(entities,result.entity)||!Array.isArray(result.rows))successorFault('SUCCESSOR_PACKAGE_INCOMPLETE');
    entities[result.entity]={baseline:result.baseline,candidate:result.candidate,changes:result.changes};changes.push(...result.rows);
    if(changes.length>SUCCESSOR_LIMITS.changes)successorFault('SUCCESSOR_PACKAGE_LIMIT');
  }
  changes.sort((a,b)=>{const x=a.entity+':'+a.rowKey,y=b.entity+':'+b.rowKey;return x<y?-1:x>y?1:0;});
  const payload={version:SUCCESSOR_PACKAGE_VERSION,baseline,candidate,entities,changes,operational:false,sourcePromoted:false};
  return verifySuccessorPackage({...payload,payloadSha256:successorHash(stableJson(payload))});
}
export function successorPackageSummary(input){
  const data=verifySuccessorPackage(input);
  return {version:'grh-successor-package-summary.v1',baseline:data.baseline,candidate:data.candidate,
    entities:data.entities,changeRows:data.changes.length,packageSha256:data.payloadSha256,
    packageBytes:Buffer.byteLength(stableJson(data)),databaseQueries:0,databaseWrites:0,
    sourcePromoted:false,operational:false,containsPersonalRecords:false,
    nativeOperationsCompared:false,operationalBaselineCompared:false};
}
