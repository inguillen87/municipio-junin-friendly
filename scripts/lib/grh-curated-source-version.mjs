import {createHash} from 'node:crypto';
import {readAndVerifySources,prepareCuratedImport} from '../import-rrhh-neon.mjs';
import {stableJson} from './canonical-import.mjs';
import {getGrhSourceProfile} from './grh-source-profile.mjs';
import {acquireGrhPublicationLocks} from './grh-publication-lock.mjs';
import {verifyCanonicalGrhStagingWithinTransaction} from '../promote-canonical-grh.mjs';
import {readSourceCapacity} from './grh-source-capacity.mjs';
import {GRH_VERSION_STORAGE_BUDGET} from './grh-core-source-version.mjs';

export const GRH_CURATED_VERSION_ENTITIES=Object.freeze(['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows']);
const definitions={
 grh_employees:{keys:['company_id','legajo'],integers:['company_id'],bigints:['person_id'],booleans:['activo'],fields:'company_id legajo person_id nombre sexo fecha_nacimiento dni cuil telefono email domicilio localidad fecha_ingreso fecha_egreso activo sector_code sector categoria_code categoria convenio_code convenio cargo_code cargo gremio lugar_trabajo profesion'},
 grh_absences:{keys:['company_id','legajo','fecha'],integers:['company_id'],decimals:['cantidad','dias'],fields:'company_id legajo fecha motivo_code cantidad dias fecha_hasta comentario'},
 grh_leaves:{keys:['company_id','periodo','legajo','fecha_inicio'],integers:['company_id','periodo','dias'],fields:'company_id legajo periodo tipo fecha_inicio fecha_fin dias observaciones'},
 grh_family:{keys:['family_id'],integers:['company_id'],bigints:['family_id'],fields:'family_id company_id legajo nombre sexo fecha_nacimiento dni cuil vinculo_code fecha_baja'},
 grh_catalog_rows:{keys:['catalog','source_key'],fields:'catalog source_key label'},
};
const hash=v=>createHash('sha256').update(v).digest('hex');
const reject=code=>{throw Object.assign(new Error(code),{code})};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
function decimal(value){const v=String(value);if(!/^-?\d+(?:\.\d+)?$/.test(v))reject('GRH_CURATED_VERSION_VALUE_INVALID');
 const [a,b='']=v.replace(/^-/,'').split('.'),whole=a.replace(/^0+(?=\d)/,''),fraction=b.replace(/0+$/,'');return (v[0]==='-'&&(whole!=='0'||fraction)?'-':'')+whole+(fraction?'.'+fraction:'');}
export function normalizeGrhCuratedVersionRecord(entity,row){
 const d=definitions[entity];if(!d||!row||Array.isArray(row))reject('GRH_CURATED_VERSION_ENTITY_INVALID');const output={};
 if(Object.keys(row).some(k=>!d.fields.split(' ').includes(k)&&!['source_payload','import_run_id'].includes(k)))reject('GRH_CURATED_VERSION_VALUE_INVALID');
 for(const key of d.fields.split(' ')){const value=row[key];if(value==null){output[key]=null;continue}
  if(d.integers?.includes(key)){const n=Number(value);if(!Number.isSafeInteger(n)||n<-2147483648||n>2147483647)reject('GRH_CURATED_VERSION_VALUE_INVALID');output[key]=n}
  else if(d.bigints?.includes(key)){if(!/^-?\d+$/.test(String(value))||BigInt(value)<-9223372036854775808n||BigInt(value)>9223372036854775807n)reject('GRH_CURATED_VERSION_VALUE_INVALID');output[key]=BigInt(value).toString()}
  else if(d.decimals?.includes(key))output[key]=decimal(value);
  else if(d.booleans?.includes(key)){if(typeof value!=='boolean')reject('GRH_CURATED_VERSION_VALUE_INVALID');output[key]=value}
  else {if(typeof value!=='string'&&typeof value!=='number')reject('GRH_CURATED_VERSION_VALUE_INVALID');output[key]=String(value)}
 }
 output.source_payload=typeof row.source_payload==='string'?JSON.parse(row.source_payload):structuredClone(row.source_payload);
 if(!output.source_payload||Array.isArray(output.source_payload)||typeof output.source_payload!=='object')reject('GRH_CURATED_VERSION_VALUE_INVALID');
 if(d.keys.some(k=>output[k]===null||String(output[k]).includes('\x1f')))reject('GRH_CURATED_VERSION_KEY_INVALID');return output;
}
export function grhCuratedVersionKey(entity,record){const d=definitions[entity];if(!d)reject('GRH_CURATED_VERSION_ENTITY_INVALID');
 if(d.keys.some(k=>record[k]==null||String(record[k]).includes('\x1f')))reject('GRH_CURATED_VERSION_KEY_INVALID');return hash(d.keys.map(k=>String(record[k])).join('\x1f'));}
function rowsDigest(rows){const sha=createHash('sha256');for(const [key,record]of [...rows].sort(([a],[b])=>a.localeCompare(b)))sha.update(key+':'+hash(stableJson(record))+'\n');return sha.digest('hex');}
export function createGrhCuratedRecordPatch(before,after,path=[]){
 if(stableJson(before)===stableJson(after))return [];
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
  return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().flatMap(key=>!Object.hasOwn(after,key)?[{op:'remove',path:[...path,key]}]
   :!Object.hasOwn(before,key)?[{op:'set',path:[...path,key],value:structuredClone(after[key])}]:createGrhCuratedRecordPatch(before[key],after[key],[...path,key]));
 }
 return [{op:'set',path,value:structuredClone(after)}];
}
export function applyGrhCuratedRecordPatch(before,patch){
 const result=structuredClone(before);if(!Array.isArray(patch)||!patch.length)reject('GRH_CURATED_VERSION_PATCH_INVALID');
 for(const change of patch){if(!change||!['set','remove'].includes(change.op)||!Array.isArray(change.path)||!change.path.length||change.path.length>64||change.path.some(k=>typeof k!=='string')
  ||(change.op==='set'&&!Object.hasOwn(change,'value'))||(change.op==='remove'&&Object.hasOwn(change,'value')))reject('GRH_CURATED_VERSION_PATCH_INVALID');
  let parent=result;for(const key of change.path.slice(0,-1)){if(!parent||Array.isArray(parent)||typeof parent!=='object'||!Object.hasOwn(parent,key))reject('GRH_CURATED_VERSION_PATCH_INVALID');parent=parent[key]}
  if(!parent||typeof parent!=='object'||Array.isArray(parent))reject('GRH_CURATED_VERSION_PATCH_INVALID');const key=change.path.at(-1);
  if(change.op==='remove'){if(!Object.hasOwn(parent,key))reject('GRH_CURATED_VERSION_PATCH_INVALID');delete parent[key]}
  else Object.defineProperty(parent,key,{value:structuredClone(change.value),enumerable:true,configurable:true,writable:true});
 }
 return result;
}
export function createGrhCuratedVersionDelta(entity,baseline,candidate){
 const sets=[baseline,candidate].map(rows=>{const m=new Map();for(const row of rows){const r=normalizeGrhCuratedVersionRecord(entity,row),key=grhCuratedVersionKey(entity,r);
  if(m.has(key))reject('GRH_CURATED_VERSION_DUPLICATE_KEY');m.set(key,r)}return m});const [a,b]=sets,changes=[];
 const counts={baseline:a.size,candidate:b.size,added:0,changed:0,removed:0,unchanged:0};
 for(const key of new Set([...a.keys(),...b.keys()])){const old=a.get(key),next=b.get(key),oldSha=old?hash(stableJson(old)):null,newSha=next?hash(stableJson(next)):null;
  if(oldSha===newSha){counts.unchanged++;continue}const operation=!old?'add':!next?'remove':'replace';counts[operation==='add'?'added':operation==='remove'?'removed':'changed']++;
  const keyFields=Object.fromEntries(definitions[entity].keys.map(field=>[field,(old??next)[field]]));
  changes.push({entity,rowKey:key,keyFields,operation,previousSha256:oldSha,candidateSha256:newSha,record:operation==='add'?next:null,patch:operation==='replace'?createGrhCuratedRecordPatch(old,next):null});}
 return {counts,baselineProjectionSha256:rowsDigest(a),candidateProjectionSha256:rowsDigest(b),changes:changes.sort((a,b)=>a.rowKey.localeCompare(b.rowKey))};
}
export async function prepareGrhCuratedSourceVersion({baselineDataDir,candidateDataDir}){
 const previous=prepareCuratedImport(await readAndVerifySources(baselineDataDir,{profileId:'grh-junin-2026-08-06'}));
 const next=prepareCuratedImport(await readAndVerifySources(candidateDataDir,{profileId:'grh-junin-2026-09-10'}));
 const a=previous.projectTables('1'),b=next.projectTables('1'),entities={},changes=[];
 for(const entity of GRH_CURATED_VERSION_ENTITIES){const result=createGrhCuratedVersionDelta(entity,a[entity],b[entity]);const {changes:delta,...evidence}=result;entities[entity]=evidence;changes.push(...delta)}
 const payload={version:'grh-curated-source-version.v2',baseline:previous.expected,candidate:next.expected,entities,changes};
 return {...payload,payloadSha256:hash(stableJson(payload))};
}
async function digestDatabase(client,sql,params,onRow=()=>{}){
 const digest=createHash('sha256');let rows=0;await client.query(`DECLARE grh_curated_version_projection NO SCROLL CURSOR FOR ${sql}`,params);
 try{for(;;){const batch=(await client.query('FETCH FORWARD 2000 FROM grh_curated_version_projection')).rows;if(!batch.length)break;
  for(const row of batch){digest.update(row.row_key+':'+hash(stableJson(row.record))+'\n');onRow(row);rows++}}}finally{await client.query('CLOSE grh_curated_version_projection')}
 return {rows,sha256:digest.digest('hex')};
}
export async function importGrhCuratedSourceVersionWithinTransaction({client,prepared,expectedPayloadSha256,coreVersionId,tenantId,sourceBindingId,baselineBatchId,baselineImportRunId,candidateBatchId,candidateImportRunId}){
 if(![coreVersionId,tenantId,sourceBindingId,baselineBatchId,candidateBatchId].every(uuid)
  ||![baselineImportRunId,candidateImportRunId].every(id=>/^[1-9][0-9]*$/.test(String(id)))
  ||String(baselineImportRunId)===String(candidateImportRunId)||baselineBatchId===candidateBatchId)reject('GRH_CURATED_VERSION_CONTEXT_INVALID');
 const {payloadSha256,...payload}=structuredClone(prepared??{});
 if(payload.version!=='grh-curated-source-version.v2'||!/^[a-f0-9]{64}$/.test(expectedPayloadSha256??'')||payloadSha256!==expectedPayloadSha256||hash(stableJson(payload))!==payloadSha256)reject('GRH_CURATED_VERSION_PAYLOAD_DRIFT');
 for(const [key,id]of [['baseline','grh-junin-2026-08-06'],['candidate','grh-junin-2026-09-10']]){const p=getGrhSourceProfile(id),v=payload[key];
  if(v.sourceDatabase!==p.source.database||v.sourceSha256.toUpperCase()!==p.source.sha256||v.cutoff.replace(' ','T')!==p.source.cutoff||v.qualityFlags.profile!==id||v.qualityFlags.allOutputHashesVerified!==true)reject('GRH_CURATED_VERSION_PROFILE_DRIFT');}
 if(Object.keys(payload.entities).sort().join('|')!==[...GRH_CURATED_VERSION_ENTITIES].sort().join('|'))reject('GRH_CURATED_VERSION_PAYLOAD_DRIFT');
 const unique=new Set();for(const row of payload.changes){const key=row.entity+row.rowKey;
  if(!GRH_CURATED_VERSION_ENTITIES.includes(row.entity)||unique.has(key)||!/^[a-f0-9]{64}$/.test(row.rowKey)||!['add','replace','remove'].includes(row.operation))reject('GRH_CURATED_VERSION_PAYLOAD_DRIFT');unique.add(key);
  if(!row.keyFields||Object.keys(row.keyFields).sort().join('|')!==[...definitions[row.entity].keys].sort().join('|')
   ||grhCuratedVersionKey(row.entity,row.keyFields)!==row.rowKey)reject('GRH_CURATED_VERSION_KEY_INVALID');
  if(row.operation==='remove'){if(row.record!==null||row.patch!==null||row.candidateSha256!==null||!/^[a-f0-9]{64}$/.test(row.previousSha256))reject('GRH_CURATED_VERSION_PAYLOAD_DRIFT')}
  else if(row.operation==='replace'){if(row.record!==null||!Array.isArray(row.patch)||!/^[a-f0-9]{64}$/.test(row.previousSha256)||!/^[a-f0-9]{64}$/.test(row.candidateSha256))reject('GRH_CURATED_VERSION_PAYLOAD_DRIFT')}
  else if(row.previousSha256!==null||row.patch!==null||stableJson(normalizeGrhCuratedVersionRecord(row.entity,row.record))!==stableJson(row.record)||grhCuratedVersionKey(row.entity,row.record)!==row.rowKey||hash(stableJson(row.record))!==row.candidateSha256)reject('GRH_CURATED_VERSION_PAYLOAD_DRIFT');
 }
 await client.query('SAVEPOINT grh_curated_version_transaction');await acquireGrhPublicationLocks(client);
 const target=(await client.query(`SELECT b.id FROM public.source_import_batch b JOIN public.data_import_runs r ON r.id=b.legacy_import_run_id
  WHERE b.id=$1::uuid AND r.id=$2::bigint AND b.source_system='GRH' AND b.source_database=$3
   AND b.validation_state='published' AND r.status='completed' AND r.source_name='grh_junin_curated'
   AND lower(b.source_sha256)=lower($4) AND lower(r.source_sha256)=lower($4)
   AND r.source_cutoff=$5::timestamp AND b.source_cutoff=$5::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires'
   AND r.quality_flags=$6::jsonb AND r.table_counts=$7::jsonb FOR SHARE OF b,r NOWAIT`,
 [candidateBatchId,candidateImportRunId,payload.candidate.sourceDatabase,payload.candidate.sourceSha256,payload.candidate.cutoff,
  JSON.stringify(payload.candidate.qualityFlags),JSON.stringify(payload.candidate.tableCounts)])).rows;
 if(target.length!==1)reject('GRH_CURATED_VERSION_TARGET_MISMATCH');
 const core=(await client.query(`SELECT id FROM grh_core_source_version WHERE id=$1 AND tenant_id=$2 AND source_binding_id=$3
  AND baseline_batch_id=$4 AND baseline_import_run_id=$5 AND source_sha256=lower($6) AND baseline_source_sha256=lower($7)`,
 [coreVersionId,tenantId,sourceBindingId,baselineBatchId,baselineImportRunId,payload.candidate.sourceSha256,payload.baseline.sourceSha256])).rows;
 if(core.length!==1)reject('GRH_CURATED_VERSION_CORE_MISMATCH');
 await client.query("SELECT grh_core_source_version_assert_v1($1,'payrollRuns')",[coreVersionId]);
 const policy=(await client.query(`SELECT b.id FROM platform_tenant_source_binding b JOIN tenant_identity_policy p ON p.tenant_id=b.tenant_id AND p.certified_source_binding_id=b.id
  WHERE b.id=$1 AND b.tenant_id=$2 AND b.verified AND b.source_system='GRH' AND b.source_database=$3 AND p.tenant_data_plane_ready FOR SHARE OF b,p`,[sourceBindingId,tenantId,payload.baseline.sourceDatabase])).rows;
 if(policy.length!==1)reject('GRH_CURATED_VERSION_BINDING_MISMATCH');
 const existing=(await client.query('SELECT id,payload_sha256,core_version_id,source_batch_id,import_run_id::text FROM grh_curated_source_version WHERE tenant_id=$1 AND source_binding_id=$2 AND source_sha256=lower($3)',[tenantId,sourceBindingId,payload.candidate.sourceSha256])).rows;
 if(existing.length){if(existing.length!==1||existing[0].payload_sha256!==payloadSha256||existing[0].core_version_id!==coreVersionId
   ||existing[0].source_batch_id!==candidateBatchId||existing[0].import_run_id!==String(candidateImportRunId))reject('GRH_CURATED_VERSION_IMMUTABLE_CONFLICT');
  for(const entity of GRH_CURATED_VERSION_ENTITIES)await client.query('SELECT grh_curated_source_version_assert_v1($1,$2)',[existing[0].id,entity]);
  await client.query('RELEASE SAVEPOINT grh_curated_version_transaction');
  return {versionId:existing[0].id,inserted:false,payloadSha256,operational:false,committed:false,callerOwnedTransaction:true};}
 const bindings=(await client.query(`SELECT b.source_company_id::text AS company FROM platform_tenant_source_binding b JOIN tenant_identity_policy p
  ON p.tenant_id=b.tenant_id AND p.certified_source_binding_id=b.id WHERE b.id=$1 AND b.tenant_id=$2 AND b.verified AND b.source_database=$3 AND b.source_system='GRH'
  AND p.tenant_data_plane_ready AND (SELECT count(DISTINCT c.source_batch_id)=1 AND min(c.source_batch_id::text)=$4 FROM employment_contract c
   WHERE c.source_system='GRH' AND c.legacy_company_id=b.source_company_id) FOR SHARE OF b,p`,[sourceBindingId,tenantId,payload.baseline.sourceDatabase,baselineBatchId])).rows;
 if(bindings.length!==1)reject('GRH_CURATED_VERSION_BINDING_MISMATCH');
 if(payload.changes.some(r=>r.record?.company_id!=null&&String(r.record.company_id)!==bindings[0].company))reject('GRH_CURATED_VERSION_COMPANY_MISMATCH');
 const base=(await client.query(`SELECT r.id FROM data_import_runs r JOIN source_import_batch b ON b.legacy_import_run_id=r.id
  WHERE r.id=$1 AND b.id=$2 AND r.status='completed' AND b.validation_state='published' AND upper(r.source_sha256)=upper($3)
  AND upper(b.source_sha256)=upper($3) AND b.source_database=$4 AND r.quality_flags=$5::jsonb AND r.table_counts=$6::jsonb`,
 [baselineImportRunId,baselineBatchId,payload.baseline.sourceSha256,payload.baseline.sourceDatabase,JSON.stringify(payload.baseline.qualityFlags),JSON.stringify(payload.baseline.tableCounts)])).rows;
 if(base.length!==1)reject('GRH_CURATED_VERSION_BASELINE_MISMATCH');
 await verifyCanonicalGrhStagingWithinTransaction(client,String(baselineImportRunId),baselineBatchId);
 const before=await readSourceCapacity(client,GRH_VERSION_STORAGE_BUDGET,0),fingerprints={};
 if(!before.fits)reject('GRH_CURATED_VERSION_STORAGE_CAPACITY_EXCEEDED');
 await client.query('LOCK TABLE public.grh_employees,public.grh_absences,public.grh_leaves,public.grh_family,public.grh_catalog_rows,public.source_staging_row IN SHARE MODE NOWAIT');
 for(const entity of GRH_CURATED_VERSION_ENTITIES){const changes=new Map(payload.changes.filter(r=>r.entity===entity).map(r=>[r.rowKey,r]));
  const observed=await digestDatabase(client,'SELECT row_key,record FROM grh_curated_source_base_rows_v1($1,$2) ORDER BY row_key',[baselineImportRunId,entity],row=>{
   if(row.record.company_id!=null&&String(row.record.company_id)!==bindings[0].company)reject('GRH_CURATED_VERSION_COMPANY_MISMATCH');
   const change=changes.get(row.row_key);if(!change)return;
   if(change.operation==='add'||hash(stableJson(row.record))!==change.previousSha256)reject('GRH_CURATED_VERSION_PREVIOUS_MISMATCH');
   if(change.operation==='replace'){const next=applyGrhCuratedRecordPatch(row.record,change.patch);
    if(hash(stableJson(next))!==change.candidateSha256||stableJson(normalizeGrhCuratedVersionRecord(entity,next))!==stableJson(next)||grhCuratedVersionKey(entity,next)!==row.row_key
     ||(next.company_id!=null&&String(next.company_id)!==bindings[0].company))reject('GRH_CURATED_VERSION_PATCH_INVALID');}
   changes.delete(row.row_key);
  });
  if([...changes.values()].some(row=>row.operation!=='add'))reject('GRH_CURATED_VERSION_PREVIOUS_MISMATCH');
  if(observed.rows!==payload.entities[entity].counts.baseline||observed.sha256!==payload.entities[entity].baselineProjectionSha256)reject('GRH_CURATED_VERSION_BASELINE_PROJECTION_MISMATCH');
  fingerprints[entity]=(await client.query('SELECT grh_curated_source_base_fingerprint_v1($1,$2) AS fingerprint',[baselineImportRunId,entity])).rows[0].fingerprint;}
 const id=(await client.query(`INSERT INTO grh_curated_source_version(tenant_id,source_binding_id,core_version_id,baseline_batch_id,baseline_import_run_id,
  baseline_source_sha256,source_sha256,baseline_cutoff,source_cutoff,payload_sha256,baseline_manifest_sha256,manifest_sha256,source_database,source_company_id,entity_evidence,baseline_fingerprints,candidate_expected,source_batch_id,import_run_id)
  VALUES($1,$2,$3,$4,$5,lower($6),lower($7),$8::timestamp,$9::timestamp,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::uuid,$19::bigint) RETURNING id`,
 [tenantId,sourceBindingId,coreVersionId,baselineBatchId,baselineImportRunId,payload.baseline.sourceSha256,payload.candidate.sourceSha256,payload.baseline.cutoff,payload.candidate.cutoff,payloadSha256,
 payload.baseline.qualityFlags.manifestSha256.toLowerCase(),payload.candidate.qualityFlags.manifestSha256.toLowerCase(),payload.candidate.sourceDatabase,bindings[0].company,JSON.stringify(payload.entities),JSON.stringify(fingerprints),JSON.stringify(payload.candidate),candidateBatchId,candidateImportRunId])).rows[0].id;
 for(let i=0;i<payload.changes.length;i+=300)await client.query(`INSERT INTO grh_curated_source_delta(version_id,entity,row_key,key_fields,operation,previous_sha256,candidate_sha256,record,patch)
  SELECT $1,entity,"rowKey","keyFields",operation,"previousSha256","candidateSha256",record,patch FROM jsonb_to_recordset($2::jsonb)
   AS r(entity text,"rowKey" text,"keyFields" jsonb,operation text,"previousSha256" text,"candidateSha256" text,record jsonb,patch jsonb)`,[id,JSON.stringify(payload.changes.slice(i,i+300))]);
 const candidateFingerprints={};
 for(const entity of GRH_CURATED_VERSION_ENTITIES){const observed=await digestDatabase(client,'SELECT row_key,record FROM grh_curated_source_unsealed_rows_v1($1,$2) ORDER BY row_key',[id,entity]);
  if(observed.rows!==payload.entities[entity].counts.candidate||observed.sha256!==payload.entities[entity].candidateProjectionSha256)reject('GRH_CURATED_VERSION_CANDIDATE_PROJECTION_MISMATCH');
  candidateFingerprints[entity]=(await client.query('SELECT grh_curated_source_version_fingerprint_v1($1,$2) AS fingerprint',[id,entity])).rows[0].fingerprint;}
 await client.query('INSERT INTO grh_curated_source_version_seal(version_id,entity_fingerprints) VALUES($1,$2::jsonb)',[id,JSON.stringify(candidateFingerprints)]);
 for(const entity of GRH_CURATED_VERSION_ENTITIES)await client.query('SELECT grh_curated_source_version_assert_v1($1,$2)',[id,entity]);
 const after=await readSourceCapacity(client,GRH_VERSION_STORAGE_BUDGET,0);
 if(!after.fits)reject('GRH_CURATED_VERSION_STORAGE_CAPACITY_EXCEEDED');
 await client.query('RELEASE SAVEPOINT grh_curated_version_transaction');
 return {versionId:id,inserted:true,payloadSha256,deltaRows:payload.changes.length,storageGrowthBytes:after.databaseBytes-before.databaseBytes,operational:false,committed:false,callerOwnedTransaction:true};
}
export async function readGrhCuratedSourceVersionEntity({client,versionId,entity,revision='candidate'}){
 if(!uuid(versionId)||!GRH_CURATED_VERSION_ENTITIES.includes(entity)||!['baseline','candidate'].includes(revision))reject('GRH_CURATED_VERSION_QUERY_INVALID');
 return (await client.query('SELECT * FROM grh_curated_source_version_rows_v1($1,$2,$3)',[versionId,entity,revision])).rows;
}

/** Read-only replay of the explicit sealed pair after canonical promotion.
 * Does not rerun the 061 baseline importer or claim that consumers are active. */
export async function inspectGrhSourceVersionPairWithinTransaction({client,tenantId,sourceBindingId,coreVersionId,curatedVersionId,expectedCorePayloadSha256,expectedCuratedPayloadSha256}){
 if(![tenantId,sourceBindingId,coreVersionId,curatedVersionId].every(uuid)||![expectedCorePayloadSha256,expectedCuratedPayloadSha256].every(v=>/^[a-f0-9]{64}$/.test(v??'')))reject('GRH_SOURCE_PAIR_CONTEXT_INVALID');
 await client.query('SAVEPOINT grh_source_pair_read');await acquireGrhPublicationLocks(client);
 const rows=(await client.query(`SELECT v.id FROM grh_curated_source_version v JOIN grh_core_source_version c ON c.id=v.core_version_id
  JOIN platform_tenant_source_binding b ON b.id=v.source_binding_id AND b.tenant_id=v.tenant_id
  JOIN tenant_identity_policy p ON p.tenant_id=b.tenant_id AND p.certified_source_binding_id=b.id
  JOIN source_import_batch batch ON batch.id=md5('source_import_batch|GRH|'||upper(v.source_sha256))::uuid
  JOIN data_import_runs run ON run.id=batch.legacy_import_run_id
  WHERE v.id=$1 AND c.id=$2 AND v.tenant_id=$3 AND v.source_binding_id=$4 AND c.tenant_id=v.tenant_id AND c.source_binding_id=v.source_binding_id
  AND v.payload_sha256=$5 AND c.payload_sha256=$6 AND c.source_sha256=v.source_sha256 AND c.baseline_batch_id=v.baseline_batch_id
  AND b.verified AND p.tenant_data_plane_ready AND b.source_system='GRH' AND b.source_database=v.source_database
  AND batch.validation_state='published' AND batch.source_system='GRH' AND batch.source_database=v.source_database AND upper(batch.source_sha256)=upper(v.source_sha256)
  AND run.status='completed' AND upper(run.source_sha256)=upper(v.source_sha256) AND run.source_cutoff=v.source_cutoff
  AND run.quality_flags=v.candidate_expected->'qualityFlags' AND run.table_counts=v.candidate_expected->'tableCounts'
  AND (SELECT count(DISTINCT ec.source_batch_id)=1 AND min(ec.source_batch_id::text)=batch.id::text FROM employment_contract ec
    WHERE ec.source_system='GRH' AND ec.legacy_company_id=b.source_company_id)
  AND NOT EXISTS(SELECT 1 FROM grh_curated_source_version_rows_v1(v.id,'grh_employees','candidate') e LEFT JOIN employment_contract ec
    ON ec.legacy_company_id=(e.record->>'company_id')::bigint AND ec.legacy_legajo=e.record->>'legajo' AND ec.source_system='GRH'
    WHERE ec.id IS NULL OR ec.source_batch_id<>batch.id OR ec.source_payload IS DISTINCT FROM e.record->'source_payload'
      OR ec.id<>md5('employment_contract|GRH|legajo|'||(e.record->>'company_id')||'|'||(e.record->>'legajo'))::uuid
      OR ec.person_id<>md5('person_identity|GRH|persona|'||(e.record->>'person_id'))::uuid)
  FOR SHARE OF b,p,batch,run`,[curatedVersionId,coreVersionId,tenantId,sourceBindingId,expectedCuratedPayloadSha256,expectedCorePayloadSha256])).rows;
 if(rows.length!==1)reject('GRH_SOURCE_PAIR_CURRENT_CONTEXT_MISMATCH');
 for(const entity of ['payrollRuns','payrollSnapshot','movements','payrollMonthly','employmentReconciliation'])await client.query('SELECT grh_core_source_version_assert_v1($1,$2)',[coreVersionId,entity]);
 for(const entity of GRH_CURATED_VERSION_ENTITIES)await client.query('SELECT grh_curated_source_version_assert_v1($1,$2)',[curatedVersionId,entity]);
 await client.query('RELEASE SAVEPOINT grh_source_pair_read');return {status:'sealed-pair-verified',inserted:false,coreVersionId,curatedVersionId,operational:false,publicationReady:false};
}
