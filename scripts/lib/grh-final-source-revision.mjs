// Final-backup reconstruction. The caller owns the transaction and any real-data authorization.
import {readFileSync} from 'node:fs';
import {verifySuccessorPackage,SUCCESSOR_ENTITIES} from './grh-successor-package.mjs';
import {planSuccessorStagingRead,evaluateSuccessorStagingRead,validateSuccessorTarget} from './grh-successor-operational-read.mjs';
import {stableJson} from './canonical-import.mjs';
import {readSourceCapacity} from './grh-source-capacity.mjs';
import {GRH_VERSION_STORAGE_BUDGET} from './grh-core-source-version.mjs';
import {inspectMunicipalConservationWithinTransaction,compareMunicipalFootprints} from './grh-municipal-footprint.mjs';

export const FINAL_SOURCE_REVISION_SCHEMA_URL=new URL('../migrations/144-final-grh-source-revision.sql',import.meta.url);
// Neon raised existing Free projects to 1 GiB on 2026-10-02. The live server
// limit still clamps this ceiling; reserve and per-revision growth stay intact.
// https://neon.com/blog/neon-free-plan-1-gb-per-project
export const FINAL_SOURCE_REVISION_STORAGE_BUDGET=Object.freeze({...GRH_VERSION_STORAGE_BUDGET,
 maximumDatabaseBytes:1024*1024*1024});
const fail=code=>{throw Object.assign(new Error(code),{code});};
const same=(a,b)=>stableJson(a)===stableJson(b);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const stateSql=`/* final-revision:state */ SELECT current_database() AS database,
 current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,
 current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,
 current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.grh_effective_source_binding'::regclass)) AS owner,
 to_regclass('public.grh_final_source_revision') IS NOT NULL AS installed`;
const storedSql=`/* final-revision:stored */ SELECT r.id::text,r.tenant_id::text,r.source_binding_id::text,
 r.parent_core_version_id::text,r.parent_curated_version_id::text,r.parent_publication_sha256,
 r.source_profile,r.source_sha256,to_char(r.source_cutoff,'YYYY-MM-DD"T"HH24:MI:SS') AS source_cutoff,
 r.core_manifest_sha256,r.curated_manifest_sha256,r.package_sha256,r.evidence,s.fingerprints,
 s.revision_id IS NOT NULL AS sealed FROM public.grh_final_source_revision r
 LEFT JOIN public.grh_final_source_seal s ON s.revision_id=r.id
 WHERE r.tenant_id=$1::uuid AND r.source_binding_id=$2::uuid AND r.source_sha256=$3`;
const columns=`entity text,"rowKey" text,operation text,"previousRecord" jsonb,record jsonb,"sourcePayload" jsonb`;
const preserved=report=>({target:report.target,packageSha256:report.packageSha256,
 sourceBatchId:report.sourceBatchId,importRunId:report.importRunId,entities:report.entities,
 cohort:report.cohort,native:report.native,manifests:report.manifests});

export function validateFinalSourceRevisionInput(prepared,targetInput,expectedPackageSha256){
 const pack=verifySuccessorPackage(structuredClone(prepared));
 if(pack.candidate.profileId!=='grh-junin-2026-10-01')fail('GRH_FINAL_REVISION_PROFILE');
 if(typeof expectedPackageSha256!=='string'||pack.payloadSha256!==expectedPackageSha256)fail('GRH_FINAL_REVISION_PACKAGE_CHANGED');
 const target=validateSuccessorTarget(targetInput);
 return freeze({pack,target});
}
export async function prepareFinalSourceRevisionWithinTransaction({client,prepared,target:targetInput,
 expectedPackageSha256,installSchema=false,signal}={}){
 const {pack,target}=validateFinalSourceRevisionInput(prepared,targetInput,expectedPackageSha256);
 if(typeof client?.query!=='function'||typeof installSchema!=='boolean')fail('GRH_FINAL_REVISION_ARGUMENT');
 const query=async(text,values)=>{signal?.throwIfAborted();const r=await client.query(text,values);signal?.throwIfAborted();return r;};
 const state=await query(stateSql),s=state.rows?.[0];
 if(state.rows?.length!==1||s.database!==target.databaseName||s.project!==target.projectId||s.branch!==target.branchId
  ||s.read_only!=='off'||s.isolation!=='serializable'||s.owner!==true)fail('GRH_FINAL_REVISION_TARGET_OR_TRANSACTION');
 const plan=planSuccessorStagingRead(pack,target);
 const read=async()=>{const results=[];for(const q of plan.queries)results.push((await query(q.text,q.values)).rows);return evaluateSuccessorStagingRead(plan,results);};
 await query('SAVEPOINT grh_final_revision_preparation');
 try{
  const lock=await query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
   ['municontrol:final-source-revision:'+target.tenantId+':'+target.bindingId]);
  if(lock.rows?.length!==1||lock.rows[0].acquired!==true)fail('GRH_FINAL_REVISION_BUSY');
  const before=await read();
  if(!before.baselineCompatible||!before.manifests.coreExact||!before.manifests.curatedExact)fail('GRH_FINAL_REVISION_BASELINE_CHANGED');
  const municipalBefore=await inspectMunicipalConservationWithinTransaction({client:{query},target,signal});
  const existing=s.installed?(await query(storedSql,[target.tenantId,target.bindingId,pack.candidate.sourceSha256])).rows:[];
  if(!Array.isArray(existing)||existing.length>1)fail('GRH_FINAL_REVISION_STORED');
  const capacityBefore=await readSourceCapacity({query},FINAL_SOURCE_REVISION_STORAGE_BUDGET,
   existing.length?0:FINAL_SOURCE_REVISION_STORAGE_BUDGET.maximumGrowthBytes);
  if(!capacityBefore.fits)fail('GRH_FINAL_REVISION_CAPACITY_REQUIRED');
  if(!s.installed){
   if(!installSchema)fail('GRH_FINAL_REVISION_SCHEMA_REQUIRED');
   await query(readFileSync(FINAL_SOURCE_REVISION_SCHEMA_URL,'utf8'));
  }
  const protection=await query(`/* final-revision:private-schema */ SELECT count(*)::integer AS tables,
   bool_and(c.relrowsecurity AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS protected,
   bool_or(has_table_privilege('municontrol_actions_runtime_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) AS runtime_access
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
   AND c.relname=ANY($1::text[]) AND c.relkind='r'`,
  [['grh_final_source_revision','grh_final_source_delta','grh_final_source_seal']]);
  if(protection.rows?.length!==1||protection.rows[0].tables!==3||protection.rows[0].protected!==true
   ||protection.rows[0].runtime_access!==false)fail('GRH_FINAL_REVISION_SCHEMA_NOT_PRIVATE');
  const evidence=Object.fromEntries(SUCCESSOR_ENTITIES.map(entity=>[entity,{
   baseline:before.entities[entity].baselineFingerprint,candidate:before.entities[entity].candidateFingerprint,
   changes:pack.entities[entity].changes}]));
  const fingerprints=Object.fromEntries(SUCCESSOR_ENTITIES.map(entity=>[entity,before.entities[entity].candidateFingerprint]));
  const header={tenant_id:target.tenantId,source_binding_id:target.bindingId,parent_core_version_id:target.coreVersionId,
   parent_curated_version_id:target.curatedVersionId,parent_publication_sha256:target.publicationSha256,
   source_profile:pack.candidate.profileId,source_sha256:pack.candidate.sourceSha256,source_cutoff:pack.candidate.cutoff,
   core_manifest_sha256:pack.candidate.coreManifestSha256,curated_manifest_sha256:pack.candidate.curatedManifestSha256,
   package_sha256:pack.payloadSha256,evidence};
  const changes=pack.changes.map(({entity,rowKey,operation,previousRecord,record,sourcePayload})=>
   ({entity,rowKey,operation,previousRecord,record,sourcePayload}));
  let id=existing[0]?.id;const replayed=existing.length===1;
  if(replayed){
   const r=existing[0];
   if(!uuid(id)||r.sealed!==true||!same(r.fingerprints,fingerprints)
    ||Object.keys(header).some(k=>!same(r[k],header[k])))fail('GRH_FINAL_REVISION_REPLAY_CONFLICT');
  }else{
   await query('SET CONSTRAINTS public.final_revision_seal_at_commit DEFERRED');
   const insert=await query(`/* final-revision:create */ INSERT INTO public.grh_final_source_revision
    (tenant_id,source_binding_id,parent_core_version_id,parent_curated_version_id,parent_publication_sha256,
     source_profile,source_sha256,source_cutoff,core_manifest_sha256,curated_manifest_sha256,package_sha256,evidence)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::timestamp,$9,$10,$11,$12::jsonb) RETURNING id::text`,
   Object.values(header).map(v=>typeof v==='object'?JSON.stringify(v):v));
   if(insert.rows?.length!==1||!uuid(insert.rows[0].id))fail('GRH_FINAL_REVISION_STORED');id=insert.rows[0].id;
   for(let index=0;index<changes.length;index+=200)await query(`/* final-revision:delta */ INSERT INTO public.grh_final_source_delta
    (revision_id,entity,row_key,operation,previous_record,record,source_payload)
    SELECT $1::uuid,entity,"rowKey",operation,"previousRecord",record,"sourcePayload"
    FROM jsonb_to_recordset($2::jsonb) AS d(${columns})`,[id,JSON.stringify(changes.slice(index,index+200))]);
   await query('INSERT INTO public.grh_final_source_seal(revision_id,fingerprints) VALUES($1::uuid,$2::jsonb)',[id,JSON.stringify(fingerprints)]);
   await query('SET CONSTRAINTS public.final_revision_seal_at_commit IMMEDIATE');
  }
  await query('SELECT public.grh_final_source_parent_v1($1::uuid)',[id]);
  const checked=await query(`/* final-revision:delta-check */ WITH expected AS
   (SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(${columns})),stored AS
   (SELECT * FROM public.grh_final_source_delta WHERE revision_id=$1::uuid)
   SELECT count(*) FILTER(WHERE e.entity IS NULL OR d.entity IS NULL
    OR (e.operation,e."previousRecord",e.record,e."sourcePayload") IS DISTINCT FROM
     (d.operation,d.previous_record,d.record,d.source_payload))::integer AS mismatches
   FROM expected e FULL JOIN stored d ON e.entity=d.entity AND e."rowKey"=d.row_key`,[id,JSON.stringify(changes)]);
  if(checked.rows?.length!==1||checked.rows[0].mismatches!==0)fail('GRH_FINAL_REVISION_REPLAY_DRIFT');
  for(const entity of SUCCESSOR_ENTITIES){
   const result=await query('SELECT public.grh_final_source_fingerprint_v1($1::uuid,$2,false) AS fingerprint',[id,entity]);
   if(result.rows?.length!==1||!same(result.rows[0].fingerprint,fingerprints[entity]))fail('GRH_FINAL_REVISION_REPLAY_DRIFT');
  }
  const after=await read();if(!same(preserved(before),preserved(after)))fail('GRH_FINAL_REVISION_PRESERVATION');
  const municipalAfter=await inspectMunicipalConservationWithinTransaction({client:{query},target,signal});
  const municipalConservation=compareMunicipalFootprints(municipalBefore,municipalAfter);
  if(!municipalConservation.preserved)fail('GRH_FINAL_REVISION_MUNICIPAL_PRESERVATION');
  const capacityAfter=await readSourceCapacity({query},FINAL_SOURCE_REVISION_STORAGE_BUDGET,0);
  if(!capacityAfter.fits||capacityAfter.databaseBytes-capacityBefore.databaseBytes>FINAL_SOURCE_REVISION_STORAGE_BUDGET.maximumGrowthBytes)
   fail('GRH_FINAL_REVISION_CAPACITY_EXCEEDED');
  await query('RELEASE SAVEPOINT grh_final_revision_preparation');
  return freeze({version:'grh-final-source-revision-receipt.v1',revisionId:id,packageSha256:pack.payloadSha256,
   candidateSourceSha256:pack.candidate.sourceSha256,sourceDeclaredCutoff:pack.candidate.cutoff,
   entities:SUCCESSOR_ENTITIES.length,deltaRows:changes.length,replayed,committed:false,callerOwnedTransaction:true,
   nativeReviewRequired:before.nativeReviewRequired,municipalConservation,capacityBefore,capacityAfter,
   operationalSourceChanged:false,adoptionPerformed:false,payrollCalculated:false});
 }catch(error){
  try{await client.query('ROLLBACK TO SAVEPOINT grh_final_revision_preparation');}
  catch(rollbackError){throw new AggregateError([error,rollbackError],'GRH_FINAL_REVISION_TRANSACTION_UNCERTAIN');}
  throw error;
 }
}
