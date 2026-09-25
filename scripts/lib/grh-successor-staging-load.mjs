// Carga sólo las tres tablas privadas 106. El llamador es dueño de BEGIN/COMMIT/ROLLBACK.
import fs from 'node:fs';
import {verifySuccessorPackage,SUCCESSOR_ENTITIES,successorHash} from './grh-successor-package.mjs';
import {planSuccessorStagingRead,evaluateSuccessorStagingRead,validateSuccessorTarget} from './grh-successor-operational-read.mjs';
import {stableJson} from './canonical-import.mjs';
import {readSourceCapacity} from './grh-source-capacity.mjs';
import {GRH_VERSION_STORAGE_BUDGET} from './grh-core-source-version.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const stageTables=['grh_successor_stage','grh_successor_stage_delta','grh_successor_stage_seal'];
export const SUCCESSOR_STAGE_SCHEMA_URL=new URL('../migrations/106-grh-successor-staging.sql',import.meta.url);
const stateQuery=`/* successor-load:state */ SELECT current_database() AS database,
 current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch,
 current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,
 current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.grh_effective_source_binding'::regclass)) AS owner,
 to_regclass('public.grh_successor_stage') IS NOT NULL AS installed`;
const existingQuery=`/* successor-load:existing */ SELECT s.id::text,s.tenant_id::text,s.source_binding_id::text,
 s.parent_core_version_id::text,s.parent_curated_version_id::text,s.parent_publication_sha256,
 s.source_profile,s.source_sha256,to_char(s.source_cutoff,'YYYY-MM-DD"T"HH24:MI:SS') AS source_cutoff,
 s.core_manifest_sha256,s.curated_manifest_sha256,s.package_sha256,s.evidence,seal.fingerprints,
 seal.stage_id IS NOT NULL AS sealed
 FROM public.grh_successor_stage s LEFT JOIN public.grh_successor_stage_seal seal ON seal.stage_id=s.id
 WHERE s.tenant_id=$1::uuid AND s.source_binding_id=$2::uuid AND s.source_sha256=$3`;
const deltaColumns=`entity text,"rowKey" text,operation text,"previousRecord" jsonb,record jsonb,"sourcePayload" jsonb`;
const persistedChanges=pack=>pack.changes.map(({entity,rowKey,operation,previousRecord,record,sourcePayload})=>({entity,rowKey,operation,previousRecord,record,sourcePayload}));
function expectedHeader(pack,target,evidence){return {
 tenant_id:target.tenantId,source_binding_id:target.bindingId,parent_core_version_id:target.coreVersionId,
 parent_curated_version_id:target.curatedVersionId,parent_publication_sha256:target.publicationSha256,
 source_profile:pack.candidate.profileId,source_sha256:pack.candidate.sourceSha256,source_cutoff:pack.candidate.cutoff,
 core_manifest_sha256:pack.candidate.coreManifestSha256,curated_manifest_sha256:pack.candidate.curatedManifestSha256,
 package_sha256:pack.payloadSha256,evidence};}
function assertHeader(row,expected,fingerprints){
 if(!row||!uuid(row.id)||row.sealed!==true)fail('SUCCESSOR_STAGE_INCOMPLETE');
 for(const key of Object.keys(expected))if(stableJson(row[key])!==stableJson(expected[key]))fail('SUCCESSOR_STAGE_REPLAY_CONFLICT');
 if(stableJson(row.fingerprints)!==stableJson(fingerprints))fail('SUCCESSOR_STAGE_SEAL_DRIFT');
}
function preserved(report){return {target:report.target,packageSha256:report.packageSha256,
 baselineSourceSha256:report.baselineSourceSha256,candidateSourceSha256:report.candidateSourceSha256,
 sourceBatchId:report.sourceBatchId,importRunId:report.importRunId,entities:report.entities,
 cohort:report.cohort,native:report.native,manifests:report.manifests};}
async function inspectStored(query,id,changes,fingerprints){
 const result=await query(`/* successor-load:delta-check */ WITH expected AS(SELECT * FROM jsonb_to_recordset($2::jsonb) AS x(${deltaColumns})),
 stored AS(SELECT * FROM public.grh_successor_stage_delta WHERE stage_id=$1::uuid)
 SELECT count(*) FILTER(WHERE e.entity IS NULL OR d.entity IS NULL OR
 (e.operation,e."previousRecord",e.record,e."sourcePayload") IS DISTINCT FROM (d.operation,d.previous_record,d.record,d.source_payload))::integer AS mismatches,
 (SELECT count(*)::integer FROM stored) AS rows
 FROM expected e FULL JOIN stored d ON d.entity=e.entity AND d.row_key=e."rowKey"`,[id,JSON.stringify(changes)]);
 if(result.rows?.length!==1||result.rows[0].mismatches!==0||result.rows[0].rows!==changes.length)fail('SUCCESSOR_STAGE_DELTA_DRIFT');
 for(const entity of SUCCESSOR_ENTITIES){const r=await query('SELECT public.grh_successor_stage_fingerprint_v1($1::uuid,$2::text,false) AS fingerprint',[id,entity]);
  if(r.rows?.length!==1||stableJson(r.rows[0].fingerprint)!==stableJson(fingerprints[entity]))fail('SUCCESSOR_STAGE_CONTENT_DRIFT');}
}
export async function stageSuccessorWithinTransaction({client,prepared,target:targetInput,expectedPackageSha256,installSchema=false,signal}={}){
 if(typeof client?.query!=='function'||typeof installSchema!=='boolean')fail('SUCCESSOR_STAGE_ARGUMENT_INVALID');
 signal?.throwIfAborted();const pack=verifySuccessorPackage(structuredClone(prepared)),target=validateSuccessorTarget(targetInput);
 if(typeof expectedPackageSha256!=='string'||pack.payloadSha256!==expectedPackageSha256)fail('SUCCESSOR_STAGE_PACKAGE_CHANGED');
 const changes=persistedChanges(pack),plan=planSuccessorStagingRead(pack,target);
 const query=async(text,values)=>{signal?.throwIfAborted();const r=await client.query(text,values);signal?.throwIfAborted();return r;};
 const state=await query(stateQuery);const s=state.rows?.[0];
 if(state.rows?.length!==1||s.database!==target.databaseName||s.project!==target.projectId||s.branch!==target.branchId
  ||s.read_only!=='off'||s.isolation!=='serializable'||s.owner!==true)fail('SUCCESSOR_STAGE_TARGET_OR_TRANSACTION');
 await query('SAVEPOINT grh_successor_load_transaction');
 const lock=await query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",['municontrol:successor-stage:'+target.tenantId+':'+target.bindingId]);
 if(lock.rows?.length!==1||lock.rows[0].acquired!==true)fail('SUCCESSOR_STAGE_BUSY');
 const read=async()=>{const results=[];for(const q of plan.queries)results.push((await query(q.text,q.values)).rows);return evaluateSuccessorStagingRead(plan,results);};
 let existing=[];
 const lookup=async()=>{const r=await query(existingQuery,[target.tenantId,target.bindingId,pack.candidate.sourceSha256]);if(!Array.isArray(r.rows)||r.rows.length>1)fail('SUCCESSOR_STAGE_LOOKUP_INVALID');return r.rows;};
 if(s.installed)existing=await lookup();else if(!installSchema)fail('SUCCESSOR_STAGE_SCHEMA_REQUIRED');
 const capacityBefore=await readSourceCapacity({query},GRH_VERSION_STORAGE_BUDGET,existing.length?0:GRH_VERSION_STORAGE_BUDGET.maximumGrowthBytes);
 if(!capacityBefore.fits)fail('SUCCESSOR_STAGE_CAPACITY_REQUIRED');
 const before=await read();if(!before.baselineCompatible)fail('SUCCESSOR_STAGE_BASELINE_INCOMPATIBLE');
 const evidence={},fingerprints={};
 for(const entity of SUCCESSOR_ENTITIES){evidence[entity]={baseline:before.entities[entity].baselineFingerprint,candidate:before.entities[entity].candidateFingerprint,changes:pack.entities[entity].changes};fingerprints[entity]=before.entities[entity].candidateFingerprint;}
 const expected=expectedHeader(pack,target,evidence);let schemaInstalled=false,id;
 if(!s.installed){await query(fs.readFileSync(SUCCESSOR_STAGE_SCHEMA_URL,'utf8'));schemaInstalled=true;}
 const guard=await query(`/* successor-load:private-schema */ SELECT count(*)::integer AS tables,
 bool_and(c.relrowsecurity AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)) AS protected,
 bool_or(has_table_privilege('municontrol_actions_runtime_app',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) AS runtime_access
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND c.relkind='r'`,[stageTables]);
 if(guard.rows?.length!==1||guard.rows[0].tables!==3||guard.rows[0].protected!==true||guard.rows[0].runtime_access!==false)fail('SUCCESSOR_STAGE_SCHEMA_NOT_PRIVATE');
 if(existing.length){id=existing[0].id;assertHeader(existing[0],expected,fingerprints);}
 else{
  const r=await query(`/* successor-load:create */ INSERT INTO public.grh_successor_stage(tenant_id,source_binding_id,parent_core_version_id,parent_curated_version_id,parent_publication_sha256,
 source_profile,source_sha256,source_cutoff,core_manifest_sha256,curated_manifest_sha256,package_sha256,evidence)
 VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8::timestamp,$9,$10,$11,$12::jsonb) RETURNING id::text`,
  [target.tenantId,target.bindingId,target.coreVersionId,target.curatedVersionId,target.publicationSha256,pack.candidate.profileId,pack.candidate.sourceSha256,pack.candidate.cutoff,pack.candidate.coreManifestSha256,pack.candidate.curatedManifestSha256,pack.payloadSha256,JSON.stringify(evidence)]);
  if(r.rows?.length!==1||!uuid(r.rows[0].id))fail('SUCCESSOR_STAGE_CREATE_UNCONFIRMED');id=r.rows[0].id;
  for(let i=0;i<changes.length;i+=200)await query(`/* successor-load:delta */ INSERT INTO public.grh_successor_stage_delta(stage_id,entity,row_key,operation,previous_record,record,source_payload)
 SELECT $1::uuid,entity,"rowKey",operation,"previousRecord",record,"sourcePayload" FROM jsonb_to_recordset($2::jsonb) AS x(${deltaColumns})`,[id,JSON.stringify(changes.slice(i,i+200))]);
  await query('INSERT INTO public.grh_successor_stage_seal(stage_id,fingerprints) VALUES($1::uuid,$2::jsonb)',[id,JSON.stringify(fingerprints)]);
  await query('SET CONSTRAINTS successor_stage_seal_at_commit IMMEDIATE');
  const stored=await lookup();if(stored.length!==1)fail('SUCCESSOR_STAGE_CREATE_UNCONFIRMED');assertHeader(stored[0],expected,fingerprints);
 }
 await query('SELECT public.grh_successor_stage_parent_v1($1::uuid)',[id]);
 await inspectStored(query,id,changes,fingerprints);
 const after=await read();if(!after.baselineCompatible||stableJson(preserved(before))!==stableJson(preserved(after)))fail('SUCCESSOR_STAGE_OPERATIONAL_DRIFT');
 const capacityAfter=await readSourceCapacity({query},GRH_VERSION_STORAGE_BUDGET,0);
 if(!capacityAfter.fits||capacityAfter.databaseBytes-capacityBefore.databaseBytes>GRH_VERSION_STORAGE_BUDGET.maximumGrowthBytes)fail('SUCCESSOR_STAGE_CAPACITY_EXCEEDED');
 await query('RELEASE SAVEPOINT grh_successor_load_transaction');
 return Object.freeze({version:'grh-successor-staging-receipt.v1',stageId:id,packageSha256:pack.payloadSha256,deltaRows:changes.length,entities:SUCCESSOR_ENTITIES.length,
 inserted:!existing.length,schemaInstalled,replayed:existing.length===1,sealed:true,committed:false,callerOwnedTransaction:true,
 operational:false,sourcePromoted:false,nativeHeadsPreserved:true,nativeReviewRequired:after.nativeReviewRequired,nativeConflictsResolved:false,
 capacityBefore,capacityAfter,preservationSha256:successorHash(stableJson(preserved(after))),schemaSha256:successorHash(fs.readFileSync(SUCCESSOR_STAGE_SCHEMA_URL)),containsPersonalRecords:false});
}
