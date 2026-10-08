// Shared final-cut reader for the coordinated consumer/selection transaction.
// Explicit sealed revision only. No latest-source lookup, writes or runtime grant.
import {createHash,randomUUID} from 'node:crypto';
import {stableJson} from './canonical-import.mjs';
import {SUCCESSOR_ENTITIES} from './grh-successor-package.mjs';
import {validateSuccessorTarget} from './grh-successor-operational-read.mjs';
import {getGrhSourceProfile} from './grh-source-profile.mjs';
const sourceProfile=getGrhSourceProfile('grh-junin-2026-10-01',{allowCandidateRead:true});
const fail=code=>{throw Object.assign(new Error(code),{code});};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const digest=(algorithm,v)=>createHash(algorithm).update(v).digest('hex');
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const FINAL_CONSUMER_CONTEXT_SQL=`/* final-consumer:context */
 SELECT current_database() AS database_name,current_setting('neon.project_id',true) AS project_id,
 current_setting('neon.branch_id',true) AS branch_id,current_user::text AS reader_role,
 pg_current_xact_id()::text AS transaction_id,current_setting('transaction_isolation') AS isolation,
 current_setting('transaction_read_only') AS read_only,
 current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.grh_final_source_revision'::regclass)) AS owner,
 r.id::text AS revision_id,r.tenant_id::text,r.source_binding_id::text,
 selected.source_batch_id::text AS parent_source_batch_id,selected.import_run_id::text AS parent_import_run_id,
 r.parent_core_version_id::text,r.parent_curated_version_id::text,r.parent_publication_sha256,
 r.source_profile,r.source_sha256,to_char(r.source_cutoff,'YYYY-MM-DD"T"HH24:MI:SS') AS source_cutoff,
 r.core_manifest_sha256,r.curated_manifest_sha256,r.package_sha256,seal.fingerprints,
 b.source_database,b.source_company_id::text,b.verified,policy.tenant_data_plane_ready,
 c.source_sha256 AS parent_source_sha256,to_char(c.source_cutoff,'YYYY-MM-DD"T"HH24:MI:SS') AS parent_cutoff
 FROM public.grh_final_source_revision r
 JOIN public.grh_final_source_seal seal ON seal.revision_id=r.id
 JOIN public.grh_effective_source_binding selected ON selected.tenant_id=r.tenant_id
  AND selected.source_binding_id=r.source_binding_id AND selected.source_version_id=r.parent_core_version_id
  AND selected.publication_sha256=r.parent_publication_sha256
 JOIN public.grh_core_source_version c ON c.id=r.parent_core_version_id
  AND c.tenant_id=r.tenant_id AND c.source_binding_id=r.source_binding_id
 JOIN public.grh_core_source_version_seal cs ON cs.version_id=c.id
 JOIN public.grh_curated_source_version v ON v.id=r.parent_curated_version_id AND v.core_version_id=c.id
  AND v.tenant_id=r.tenant_id AND v.source_binding_id=r.source_binding_id
  AND v.source_batch_id=selected.source_batch_id AND v.import_run_id=selected.import_run_id
  AND v.source_sha256=c.source_sha256 AND v.source_cutoff=c.source_cutoff
 JOIN public.grh_curated_source_version_seal vs ON vs.version_id=v.id
 JOIN public.platform_tenant_source_binding b ON b.id=r.source_binding_id AND b.tenant_id=r.tenant_id
  AND b.source_system='GRH' AND b.source_database=c.source_database AND b.source_company_id=c.source_company_id
 JOIN public.tenant_identity_policy policy ON policy.tenant_id=b.tenant_id AND policy.certified_source_binding_id=b.id
 WHERE r.id=$1::uuid AND r.tenant_id=$2::uuid AND r.source_binding_id=$3::uuid`;
export const FINAL_CONSUMER_ROWS_SQL=`/* final-consumer:rows */
 SELECT row_key,record::text AS record_json
 FROM public.grh_final_source_rows_v1($1::uuid,$2::text)
 ORDER BY row_key`;

/** Source JSON stays text: JSON.parse/stringify would round a raw numeric value.
 * Pages are a transport detail. A complete receipt requires every row of all ten
 * sets, with the SQL144 seal's exact PostgreSQL JSONB fingerprint, in one actual
 * caller-owned transaction. The binding token excludes transport/transaction IDs.
 */
export async function bindFinalSourceConsumersWithinTransaction({client,target:input,revisionId,
 expectedPackageSha256,signal}={}){
 const target=validateSuccessorTarget(input);
 if(typeof client?.query!=='function'||!uuid(revisionId)||!sha(expectedPackageSha256))fail('GRH_FINAL_CONSUMER_ARGUMENT');
 const values=[revisionId,target.tenantId,target.bindingId];
 const query=async(text,args)=>{signal?.throwIfAborted();const r=await client.query(text,args);signal?.throwIfAborted();return r;};
 const inspect=async()=>{
  const rows=(await query(FINAL_CONSUMER_CONTEXT_SQL,values)).rows;
  if(rows?.length!==1)fail('GRH_FINAL_CONSUMER_REVISION');
  const r=rows[0];
  if(r.database_name!==target.databaseName||r.project_id!==target.projectId||r.branch_id!==target.branchId
   ||r.owner!==true||typeof r.reader_role!=='string'||!r.reader_role||!/^\d+$/.test(r.transaction_id??'')
   ||!['serializable','repeatable read'].includes(r.isolation)||!['on','off'].includes(r.read_only))fail('GRH_FINAL_CONSUMER_TARGET_OR_TRANSACTION');
  if(r.revision_id!==revisionId||r.tenant_id!==target.tenantId||r.source_binding_id!==target.bindingId
   ||r.parent_core_version_id!==target.coreVersionId||r.parent_curated_version_id!==target.curatedVersionId
   ||r.parent_publication_sha256!==target.publicationSha256||r.source_database!==sourceProfile.source.database
   ||r.verified!==true||r.tenant_data_plane_ready!==true||!/^\d+$/.test(r.source_company_id??'')
   ||r.source_profile!=='grh-junin-2026-10-01'
   ||r.source_sha256!=='50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'
   ||r.source_cutoff!=='2026-10-01T15:17:29'
   ||r.parent_source_sha256!=='5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7'
   ||r.parent_cutoff!=='2026-09-10T15:17:30'||r.package_sha256!==expectedPackageSha256
   ||![r.core_manifest_sha256,r.curated_manifest_sha256].every(sha)
   ||!uuid(r.parent_source_batch_id)||!/^\d+$/.test(r.parent_import_run_id??''))fail('GRH_FINAL_CONSUMER_CONTEXT');
  const fingerprints=r.fingerprints;
  if(!fingerprints||Array.isArray(fingerprints)||Object.keys(fingerprints).length!==SUCCESSOR_ENTITIES.length
   ||SUCCESSOR_ENTITIES.some(e=>!Object.hasOwn(fingerprints,e)))fail('GRH_FINAL_CONSUMER_SEAL');
  for(const e of SUCCESSOR_ENTITIES){const f=fingerprints[e];
   if(!f||Array.isArray(f)||Object.keys(f).length!==2||!Object.hasOwn(f,'rows')||!Object.hasOwn(f,'md5')
    ||!Number.isSafeInteger(f.rows)||f.rows<0||f.rows>2000000||!/^([a-f0-9]{32})$/.test(f.md5??''))fail('GRH_FINAL_CONSUMER_SEAL');
  }
  return structuredClone(r);
 };
 const before=await inspect();
 const {transaction_id,reader_role,isolation,read_only,owner,...source}=before;
 const context=freeze({version:'grh-final-consumer-context.v1',...source,
  contextSha256:digest('sha256',stableJson(source)),operationalSourceChanged:false});
 const assertCurrent=async()=>{if(stableJson(await inspect())!==stableJson(before))fail('GRH_FINAL_CONSUMER_CHANGED');};
 const completed=new Map();let active=false;
 async function* readRows(entity,options={}){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>k!=='pageSize'))fail('GRH_FINAL_CONSUMER_ARGUMENT');
  const pageSize=Object.hasOwn(options,'pageSize')?options.pageSize:500;
  if(!SUCCESSOR_ENTITIES.includes(entity)||!Number.isInteger(pageSize)||pageSize<1||pageSize>1000)fail('GRH_FINAL_CONSUMER_ARGUMENT');
  if(active)fail('GRH_FINAL_CONSUMER_READ_ACTIVE');
  active=true;completed.delete(entity);
  let cursor=null,count=0,opened=false;const stream=createHash('md5'),name='mc_final_consumer_'+randomUUID().replaceAll('-','');
  try{
   await assertCurrent();
   await query(`DECLARE ${name} NO SCROLL CURSOR FOR ${FINAL_CONSUMER_ROWS_SQL}`,[revisionId,entity]);opened=true;
   for(;;){
    await assertCurrent();
    const rows=(await query(`FETCH FORWARD ${pageSize} FROM ${name}`)).rows;
    if(!Array.isArray(rows)||rows.length>pageSize)fail('GRH_FINAL_CONSUMER_PAGE');
    if(!rows.length)break;
    for(const row of rows){
     if(!row||Object.keys(row).length!==2||!sha(row.row_key)||cursor!==null&&row.row_key<=cursor
      ||typeof row.record_json!=='string'||!row.record_json.startsWith('{')||!row.record_json.endsWith('}')
      ||Buffer.byteLength(row.record_json,'utf8')>33554432)fail('GRH_FINAL_CONSUMER_ROW');
     count++;if(count>before.fingerprints[entity].rows)fail('GRH_FINAL_CONSUMER_COUNT');
     stream.update(digest('md5',row.row_key+row.record_json));cursor=row.row_key;
     yield freeze({entity,rowKey:row.row_key,recordJson:row.record_json,contextSha256:context.contextSha256});
    }
   }
   await assertCurrent();
   if(count!==before.fingerprints[entity].rows||stream.digest('hex')!==before.fingerprints[entity].md5)fail('GRH_FINAL_CONSUMER_FINGERPRINT');
  }finally{
   try{if(opened)await client.query(`CLOSE ${name}`);}finally{active=false;}
  }
  completed.set(entity,count);
 }
 async function assertComplete(){
  await assertCurrent();
  if(active||completed.size!==SUCCESSOR_ENTITIES.length)fail('GRH_FINAL_CONSUMER_INCOMPLETE');
  return freeze({version:'grh-final-consumer-receipt.v1',contextSha256:context.contextSha256,revisionId,
   packageSha256:expectedPackageSha256,entities:SUCCESSOR_ENTITIES.length,
   counts:Object.fromEntries(SUCCESSOR_ENTITIES.map(e=>[e,completed.get(e)])),
   complete:true,callerOwnedTransaction:true,sourceSelected:false,municipalWrites:0});
 }
 return Object.freeze({context,readRows,assertComplete});
}
