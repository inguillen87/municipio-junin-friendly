import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {promoteCanonicalGrhWithinTransaction} from '../scripts/promote-canonical-grh.mjs';
import {getGrhSourceProfile} from '../scripts/lib/grh-source-profile.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';

const TABLES=['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'];
const profile=getGrhSourceProfile('grh-junin-2026-09-10'),old=getGrhSourceProfile('grh-junin-2026-08-06');
const REVISION='90000000-0000-4000-8000-000000000001',PAYLOAD='a'.repeat(64),RUN='4';
function batch(sha){const h=createHash('md5').update('source_import_batch|GRH|'+sha).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
const BATCH=batch(profile.source.sha256);
const originalStatements=splitPostgresStatements(await readFile(new URL('../scripts/canonical-promote-current-grh.sql',import.meta.url),'utf8'));
const names={sectors:'sectors',categories:'categories',unions:'unions',agreements:'agreements',absenceReasons:'absence_reasons',familyRelationships:'family_relationships',jobRoles:'job_roles',organizations:'organizations',exitReasons:'exit_reasons',employmentStatuses:'employment_statuses'};
function fixture(){
 const output=profile.curated.expectedOutputCounts,catalogs=Object.fromEntries(Object.entries(names).map(([a,b])=>[b,output[a]]));
 const expectedSource={sourceName:'grh_junin_curated',sourceSha256:profile.source.sha256,sourceDatabase:profile.source.database,cutoff:profile.source.cutoff,
  qualityFlags:{profile:profile.curated.profileId,manifestSha256:'b'.repeat(64),strictSnapshot:true,allOutputHashesVerified:true},
  tableCounts:{employees:output.employees,absences:output.absences,leaves:output.leaves,family:output.familyMembers,catalog_rows:Object.values(catalogs).reduce((a,b)=>a+b,0),catalogs,
   critical:Object.fromEntries(['employees','absences','leaves','familyMembers','sectors','categories','unions','agreements'].map(k=>[k,output[k]])),source:output}};
 const counts=[expectedSource.tableCounts.employees,expectedSource.tableCounts.absences,expectedSource.tableCounts.leaves,expectedSource.tableCounts.family,expectedSource.tableCounts.catalog_rows];
 const projection=Object.fromEntries(TABLES.map((t,i)=>[t,Array.from({length:counts[i]},(_,index)=>({import_run_id:RUN,source_payload:JSON.stringify({synthetic:true,index})}))]));
 return {importRunId:RUN,expectedSource,expectedBaseline:{batchId:batch(old.source.sha256),importRunId:'3',sourceDatabase:old.source.database,sourceSha256:old.source.sha256,cutoff:old.source.cutoff},
  sourceRevision:{curatedVersionId:REVISION,expectedPayloadSha256:PAYLOAD},verifiedProjection:()=>projection,projection};
}
function fake(input,options={}){
 const calls=[],writes=[],expected=input.expectedSource;let sourceChecks=0,stagingChecks=0;
 const sqlIdentity={query:null};
 const client={calls,writes,async query(sql,args){
  calls.push({sql,args}); options.onQuery?.(sql,args);
  assert.doesNotMatch(sql,/^(BEGIN|COMMIT|ROLLBACK)\b/,'callee cannot end the transaction');
  if(options.throwAt && sql.includes(options.throwAt))throw Object.assign(new Error('private postgres detail'),{code:options.throwCode});
  if(sql.startsWith('SAVEPOINT')&&options.outside)throw Object.assign(new Error('outside'),{code:'25P01'});
  if(sql.includes('pg_try_advisory_xact_lock'))return {rows:[{acquired:true}]};
  if(sql.includes('grh-promotion:run'))return {rows:[{id:RUN,source_name:expected.sourceName,source_sha256:expected.sourceSha256,cutoff_matches:true,completed:true,status:'completed',quality_flags:structuredClone(expected.qualityFlags),table_counts:structuredClone(expected.tableCounts),batch_id:BATCH}]};
  if(sql.includes('grh-promotion:revision-cohort'))return {rows:[Object.fromEntries(TABLES.map(t=>[t,t!==options.drift]))]};
  if(sql.includes('grh-promotion:revision-target'))return {rows:[{expected_count:2,target_count:options.replay?2:0,matched_count:options.replay?2:0,has_canonical_evidence:Boolean(options.replay),...options.target}]};
  if(sql.includes('grh-promotion:revision'))return {rows:options.revisionRows??[{id:REVISION}]};
  if(sql.startsWith('SELECT public.grh_curated_source_version_assert_v1'))return {rows:[{}]};
  if(sql.includes('grh-promotion:batch'))return {rows:options.noBatch?[]:[{id:BATCH,source_system:'GRH',source_database:expected.sourceDatabase,source_file_name:expected.sourceName,source_sha256:expected.sourceSha256,legacy_import_run_id:RUN,cutoff_matches:true,validation_state:'published',promotion_profile:options.profile??'explicit-curated-grh-v2'}]};
  if(sql.includes('grh-promotion:baseline'))return {rows:[{exact:true,profile:old.id,...options.baseline}]};
  if(sql.includes('grh-promotion:transition'))return {rows:[{cohort_matches:true,no_disappeared_contracts:true,baseline_snapshots_match:true,...options.transition}]};
  if(sql.includes('grh-promotion:source-guards')){sourceChecks++;return {rows:[{identity_matches:true,contracts_match:true,cutoffs_match:true,status_day_matches:true,assertion_cutoffs_match:true,...(sourceChecks>1?options.afterSource:options.beforeSource)}]};}
  if(sql.includes('grh-promotion:references'))return {rows:[{exact:true,complete:true,...options.references}]};
  if(sql.includes('grh-promotion:assertions'))return {rows:[{lineage_matches:true,profile_matches:true,...options.assertions}]};
  if(sql.includes('grh-promotion:staging')){stagingChecks++;return {rows:[{actual_count:2,expected_count:2,exact:true,...(stagingChecks>1?options.afterStaging:options.beforeStaging)}]};}
  if(sql.includes('grh-promotion:result'))return {rows:[{expected_people:2,canonical_people:2,expected_contracts:2,canonical_contracts:2,statuses_complete:true,...options.result}]};
  if(/^(SAVEPOINT|RELEASE SAVEPOINT|LOCK TABLE|SELECT set_config)/.test(sql)||sql.includes('grh-promotion:lock-'))return {rows:[]};
  if(/\b(?:INSERT INTO|UPDATE)\b/.test(sql)){writes.push(sql);return {rows:[]};}
  assert.fail('Unexpected query: '+sql.slice(0,90));
 }};
 sqlIdentity.query=client.query;
 return {...client,assertNoProxy(){assert.equal(this.query,sqlIdentity.query);}};
}

test('sealed revision uses real candidate metadata, exact views and twelve actual writes in caller transaction',async()=>{
 const input=fixture(),client=fake(input),phases=[];
 const receipt=await promoteCanonicalGrhWithinTransaction({...input,client,checkpoint:async p=>phases.push(p)});
 client.assertNoProxy();
 assert.equal(receipt.committed,false);assert.equal(receipt.callerOwnedTransaction,true);assert.equal(receipt.importRunId,RUN);assert.equal(receipt.batchId,BATCH);
 assert.deepEqual(phases,['promotion:validated','promotion:staged','promotion:written','promotion:verified']);
 assert.equal(client.writes.length,12);assert.equal(originalStatements.length,17);
 for(const sql of client.writes){assert.doesNotMatch(sql,/INSERT INTO (?:public\.)?(?:source_staging_row|grh_(?:employees|absences|leaves|family|catalog_rows))\b/);assert.doesNotMatch(sql,/\b(?:FROM|JOIN) public\.grh_(?:employees|absences|leaves|family|catalog_rows)\b/);}
 assert.ok(client.writes.some(sql=>sql.includes('INSERT INTO employment_contract')));
 assert.ok(client.writes.some(sql=>sql.includes('UPDATE source_xref')));
 assert.ok(client.writes.some(sql=>sql.includes('UPDATE person_identity_assertion')));
 const transition=client.calls.find(c=>c.sql.includes('grh-promotion:transition'));
 assert.equal(transition.args[3],false,'metadata-only is not a promoted replay');
 assert.match(transition.sql,/grh_effective_source_staging_v1/);
 const cohort=client.calls.find(c=>c.sql.includes('grh-promotion:revision-cohort'));
 for(const table of TABLES){assert.match(cohort.sql,new RegExp('NULL::public.'+table));assert.ok(cohort.sql.includes('public.grh_source_'+table.slice(4)+'_v1'));}
 assert.equal((cohort.sql.match(/EXCEPT ALL/g)||[]).length,10);assert.equal(cohort.args[5],RUN);
 assert.equal(client.calls.filter(c=>c.sql.includes('grh_curated_source_version_assert_v1')).length,5);
 for(const call of client.calls.filter(c=>c.sql.includes('grh-promotion:staging'))){assert.match(call.sql,/grh_effective_source_staging_v1/);assert.equal((call.sql.match(/EXCEPT ALL/g)||[]).length,2);}
 const revision=client.calls.find(c=>c.sql.includes('grh-promotion:revision */'));
 for(const token of ['grh_curated_source_version_seal','core.tenant_id=v.tenant_id','binding.verified','policy.tenant_data_plane_ready','v.candidate_expected=$7::jsonb','batch.manifest=jsonb_build_object','FOR SHARE'])assert.ok(revision.sql.includes(token));
 assert.equal(client.calls.some(c=>/ORDER BY id DESC LIMIT 1025/.test(c.sql)),false,'no physical-cohort replay fallback');
});

for(const sourceRevision of [null,{}, {curatedVersionId:REVISION}, {curatedVersionId:REVISION,expectedPayloadSha256:PAYLOAD,table:'injected'}, {curatedVersionId:'not-a-uuid',expectedPayloadSha256:PAYLOAD}, {curatedVersionId:REVISION,expectedPayloadSha256:'x'.repeat(64)}]){
 test('revision rejects malformed or open-ended coordinates before any query '+JSON.stringify(sourceRevision),async()=>{
  const input=fixture(),client=fake(input);await assert.rejects(promoteCanonicalGrhWithinTransaction({...input,client,sourceRevision}),{code:'GRH_PROMOTION_INPUT_INVALID'});assert.equal(client.calls.length,0);
 });
}
test('revision requires explicit distinct baseline and exact registered projection counts',async()=>{
 for(const change of ['baseline','run','count']){
  const input=fixture(),client=fake(input);if(change==='baseline')delete input.expectedBaseline;if(change==='run')input.expectedBaseline.importRunId=RUN;if(change==='count')input.projection.grh_family.pop();
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...input,client}),{code:change==='count'?'GRH_PROMOTION_COHORT_MISMATCH':'GRH_PROMOTION_INPUT_INVALID'});assert.equal(client.calls.length,0);
 }
});
for(const [name,options,code] of [
 ['missing seal or changed provenance',{revisionRows:[]},'GRH_PROMOTION_REVISION_MISMATCH'],
 ['missing real candidate batch',{noBatch:true},'GRH_PROMOTION_SOURCE_MISMATCH'],
 ['wrong promotion profile',{profile:'legacy'},'GRH_PROMOTION_REVISION_MISMATCH'],
 ['partial candidate contracts',{target:{target_count:1,matched_count:1}},'GRH_PROMOTION_PARTIAL_TARGET'],
 ['partial candidate evidence without contracts',{target:{has_canonical_evidence:true}},'GRH_PROMOTION_PARTIAL_TARGET'],
 ['foreign extra contract',{replay:true,target:{target_count:3}},'GRH_PROMOTION_PARTIAL_TARGET'],
 ['mixed baseline cohort',{transition:{cohort_matches:false}},'GRH_PROMOTION_BASELINE_MISMATCH'],
 ['disappeared baseline contract',{transition:{no_disappeared_contracts:false}},'GRH_PROMOTION_DISAPPEARED_CONTRACT'],
 ['changed baseline source snapshot',{transition:{baseline_snapshots_match:false}},'GRH_PROMOTION_STAGING_CONFLICT'],
 ['empty virtual staging',{beforeStaging:{actual_count:0,exact:false}},'GRH_PROMOTION_STAGING_CONFLICT'],
 ['changed projected identity',{beforeSource:{identity_matches:false}},'GRH_PROMOTION_IDENTITY_CONFLICT'],
 ['replay missing current reference',{replay:true,references:{complete:false}},'GRH_PROMOTION_REFERENCE_CONFLICT'],
 ['replay missing current assertion',{replay:true,assertions:{profile_matches:false}},'GRH_PROMOTION_ASSERTION_CONFLICT'],
 ['replay missing status snapshot',{replay:true,result:{statuses_complete:false}},'GRH_PROMOTION_PARTIAL_TARGET'],
 ...TABLES.map(drift=>['typed drift '+drift,{drift},'GRH_PROMOTION_COHORT_MISMATCH']),
])test('revision rejects '+name+' before writes',async()=>{
 const input=fixture(),client=fake(input,options);await assert.rejects(promoteCanonicalGrhWithinTransaction({...input,client}),{code});assert.equal(client.writes.length,0);assert.equal(client.calls.some(c=>c.sql==='RELEASE SAVEPOINT municontrol_canonical_grh_promotion'),false);
});

test('complete promoted replay verifies all prior canonical evidence before idempotent writes',async()=>{
 const input=fixture(),client=fake(input,{replay:true});await promoteCanonicalGrhWithinTransaction({...input,client});
 assert.equal(client.calls.find(c=>c.sql.includes('grh-promotion:transition')).args[3],true);
 assert.equal(client.calls.find(c=>c.sql.includes('grh-promotion:references')).args[3],true);
 assert.equal(client.calls.find(c=>c.sql.includes('grh-promotion:assertions')).args[3],true);
 assert.equal(client.calls.filter(c=>c.sql.includes('grh-promotion:result')).length,2);
});
for(const phase of ['promotion:validated','promotion:staged','promotion:written','promotion:verified'])test('revision checkpoint failure '+phase+' cannot commit or conceal rollback responsibility',async()=>{
 const input=fixture(),client=fake(input);await assert.rejects(promoteCanonicalGrhWithinTransaction({...input,client,checkpoint:async p=>{if(p===phase)throw new Error('private failure');}}),{code:'GRH_PROMOTION_UNAVAILABLE'});
 assert.equal(client.calls.some(c=>c.sql==='RELEASE SAVEPOINT municontrol_canonical_grh_promotion'),false);assert.equal(client.writes.some(s=>s.includes('INSERT INTO source_staging_row')),false);
});
test('revision captures input and projection before first await',async()=>{
 const input=fixture(),expected=structuredClone(input.expectedSource);let mutated=false;
 const client=fake(input,{onQuery(sql){if(!mutated&&sql.startsWith('SAVEPOINT')){mutated=true;input.sourceRevision.curatedVersionId='changed';input.projection.grh_employees[0].source_payload='changed';}}});
 await promoteCanonicalGrhWithinTransaction({...input,client});
 const revision=client.calls.find(c=>c.sql.includes('grh-promotion:revision */'));assert.equal(revision.args[0],REVISION);assert.deepEqual(JSON.parse(revision.args[6]),expected);
 const cohort=client.calls.find(c=>c.sql.includes('grh-promotion:revision-cohort'));assert.deepEqual(JSON.parse(cohort.args[0])[0].source_payload,{synthetic:true,index:0});
});
test('revision requires transaction and maps locks to busy without acquiring a new connection',async()=>{
 for(const [options,code] of [[{outside:true},'GRH_PROMOTION_TRANSACTION_REQUIRED'],[{throwAt:'grh-promotion:revision */',throwCode:'55P03'},'GRH_PROMOTION_BUSY']]){
  const input=fixture(),client=fake(input,options);await assert.rejects(promoteCanonicalGrhWithinTransaction({...input,client}),{code});assert.equal(client.writes.length,0);
 }
});
