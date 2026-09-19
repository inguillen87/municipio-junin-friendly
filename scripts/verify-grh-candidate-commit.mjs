// Read-only post-COMMIT verification of an explicit candidate; never promotes a source.
import assert from 'node:assert/strict';
import {GRH_VERSION_ENTITIES} from './lib/grh-core-source-version.mjs';
export const CANDIDATE_TARGET=Object.freeze({project:'wild-cake-87689498',branch:'br-plain-dawn-ac8crb1h'});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function assertCandidateIdentity(row){
 assert.equal(row?.project,CANDIDATE_TARGET.project,'CANDIDATE_PROJECT_MISMATCH');
 assert.equal(row?.branch,CANDIDATE_TARGET.branch,'CANDIDATE_BRANCH_MISMATCH');
 assert.equal(row?.database,'neondb','CANDIDATE_DATABASE_MISMATCH');
 assert.equal(row?.read_only,'on','CANDIDATE_READ_ONLY_REQUIRED');
}
export function assertCandidateCounts(row,expected){
 for(const key of ['rows','unique_keys'])assert.ok(Number.isSafeInteger(row?.[key])&&row[key]>=0,'CANDIDATE_COUNT_INVALID');
 assert.ok(Number.isSafeInteger(expected)&&expected>=0,'CANDIDATE_EXPECTATION_INVALID');
 assert.equal(row.rows,expected,'CANDIDATE_ROW_COUNT_MISMATCH');
 assert.equal(row.unique_keys,row.rows,'CANDIDATE_DUPLICATE_KEY');
 assert.equal(row.review_only,true,'CANDIDATE_NOT_REVIEW_ONLY');
 return {rows:row.rows,uniqueKeys:row.unique_keys,reviewOnly:true};
}
export async function verifyCommittedGrhCandidate(client,{versionId,payloadSha256,expectedCounts}={}){
 assert.match(versionId??'',UUID,'CANDIDATE_ID_REQUIRED');assert.match(payloadSha256??'',/^[a-f0-9]{64}$/,'CANDIDATE_HASH_REQUIRED');
 assert.deepEqual(Object.keys(expectedCounts??{}).sort(),[...GRH_VERSION_ENTITIES].sort(),'CANDIDATE_ENTITIES_REQUIRED');
 for(const count of Object.values(expectedCounts))assert.ok(Number.isSafeInteger(count)&&count>=0,'CANDIDATE_COUNT_INVALID');
 let begun=false;
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');begun=true;
  await client.query("SET LOCAL statement_timeout='180s'; SET LOCAL lock_timeout='1500ms'; SET LOCAL timezone='UTC'");
  const target=(await client.query("SELECT current_setting('neon.project_id',true) project,current_setting('neon.branch_id',true) branch,current_database() database,current_setting('transaction_read_only') read_only")).rows[0];assertCandidateIdentity(target);
  const versions=(await client.query(`SELECT v.id,v.payload_sha256,v.source_profile,v.source_cutoff::text AS source_cutoff,
   v.baseline_cutoff::text AS baseline_cutoff,v.source_payroll_date::text AS payroll_date,
   s.sealed_at::text AS sealed_at,(v.created_transaction<>txid_current()) AS prior_transaction,
   (b.validation_state='published' AND lower(b.source_sha256)=v.baseline_source_sha256) AS baseline_still_published
   FROM public.grh_core_source_version v JOIN public.grh_core_source_version_seal s ON s.version_id=v.id
   JOIN public.source_import_batch b ON b.id=v.baseline_batch_id WHERE v.id=$1`,[versionId])).rows;
  assert.equal(versions.length,1,'CANDIDATE_SEAL_MISSING');const v=versions[0];
  assert.equal(v.payload_sha256,payloadSha256,'CANDIDATE_HASH_MISMATCH');assert.equal(v.source_profile,'grh-junin-2026-09-10','CANDIDATE_PROFILE_MISMATCH');
  assert.equal(v.prior_transaction,true,'CANDIDATE_NOT_COMMITTED');assert.equal(v.baseline_still_published,true,'CANDIDATE_BASELINE_CHANGED');
  const entities={};for(const entity of GRH_VERSION_ENTITIES){
   const row=(await client.query("SELECT count(*)::int rows,count(DISTINCT source_id)::int unique_keys,bool_and(NOT operational) review_only FROM public.grh_core_source_version_rows_v1($1,$2,'candidate')",[versionId,entity])).rows[0];
   entities[entity]=assertCandidateCounts(row,expectedCounts[entity]);
  }
  const rights=(await client.query(`SELECT
   has_table_privilege('municontrol_actions_runtime_app','public.grh_core_source_version','SELECT') AS versions_read,
   has_table_privilege('municontrol_actions_runtime_app','public.grh_core_source_delta','SELECT') AS deltas_read,
   has_table_privilege('municontrol_actions_runtime_app','public.grh_core_source_version_seal','SELECT') AS seals_read,
   has_function_privilege('municontrol_actions_runtime_app','public.grh_core_source_version_rows_v1(uuid,text,text)','EXECUTE') AS reader_execute`)).rows[0];
  assert.deepEqual(rights,{versions_read:false,deltas_read:false,seals_read:false,reader_execute:false},'CANDIDATE_RUNTIME_EXPOSURE');
  return {version:'grh-candidate-commit-verification.v1',observedAt:new Date().toISOString(),versionId,payloadSha256,
   sourceProfile:v.source_profile,sourceCutoff:v.source_cutoff,baselineCutoff:v.baseline_cutoff,payrollDate:v.payroll_date,
   sealedAt:v.sealed_at,committedPreviously:true,baselineStillPublished:true,entities,runtimeSourceReaderEnabled:false,
   databaseWrites:0,productionSwitchAuthorized:false};
 }finally{if(begun)await client.query('ROLLBACK');}
}
