import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promoteCanonicalGrhWithinTransaction, verifyCanonicalGrhStagingWithinTransaction, parsePromotionArgs, safeCanonicalPromotionError } from '../scripts/promote-canonical-grh.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';
import { GRH_PUBLICATION_LOCKS } from '../scripts/lib/grh-publication-lock.mjs';
import { getGrhSourceProfile } from '../scripts/lib/grh-source-profile.mjs';

const OLD_PROFILE=getGrhSourceProfile('grh-junin-2026-08-06');
const SHA=OLD_PROFILE.source.sha256, RUN='3';
function batchFor(sha) {
  const hash=createHash('md5').update('source_import_batch|GRH|'+sha).digest('hex');
  return [hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),hash.slice(16,20),hash.slice(20)].join('-');
}
const BATCH=batchFor(SHA);
const TABLES=['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'];
const sql=await readFile(new URL('../scripts/canonical-promote-current-grh.sql',import.meta.url),'utf8');
const moduleSource=await readFile(new URL('../scripts/promote-canonical-grh.mjs',import.meta.url),'utf8');
const statements=splitPostgresStatements(sql);
function fixture(profileId=OLD_PROFILE.id) {
  const profile=getGrhSourceProfile(profileId),output=profile.curated.expectedOutputCounts;
  const catalogs=Object.fromEntries(Object.entries({sectors:'sectors',categories:'categories',unions:'unions',agreements:'agreements',
    absenceReasons:'absence_reasons',familyRelationships:'family_relationships',jobRoles:'job_roles',organizations:'organizations',
    exitReasons:'exit_reasons',employmentStatuses:'employment_statuses'}).map(([key,name])=>[name,output[key]]));
  const critical=Object.fromEntries(['employees','absences','leaves','familyMembers','sectors','categories','unions','agreements'].map(key=>[key,output[key]]));
  const expectedSource={sourceName:'grh_junin_curated',sourceSha256:profile.source.sha256,sourceDatabase:profile.source.database,cutoff:profile.source.cutoff.replace('T',' '),
    qualityFlags:{profile:profile.curated.profileId,manifestSha256:'B'.repeat(64),strictSnapshot:true,allOutputHashesVerified:true},
    tableCounts:{employees:output.employees,absences:output.absences,leaves:output.leaves,family:output.familyMembers,
      catalog_rows:Object.values(catalogs).reduce((sum,value)=>sum+value,0),catalogs,critical,source:output}};
  const verifiedProjection=runId=>Object.fromEntries(TABLES.map(table=>[table,table==='grh_employees'
    ? [{company_id:1,legajo:'999999',person_id:'999999',import_run_id:runId,source_payload:JSON.stringify({private:'synthetic identity'})}]:[]]));
  return {importRunId:profileId===OLD_PROFILE.id?RUN:'4',expectedSource,verifiedProjection};
}
function fakeClient(expected, options={}) {
  const calls=[],writes=[]; let guardCount=0,stageCount=0,batchCount=0,referenceCount=0,assertionCount=0;
  const runId=expected.qualityFlags.profile===OLD_PROFILE.id?RUN:'4',batchId=batchFor(expected.sourceSha256);
  const source={id:runId,source_name:expected.sourceName,source_sha256:expected.sourceSha256,cutoff_matches:true,status:'completed',completed:true,
    quality_flags:structuredClone(expected.qualityFlags),table_counts:structuredClone(expected.tableCounts),batch_id:batchId};
  const batch={id:batchId,source_system:'GRH',source_database:'grh_junin',source_file_name:expected.sourceName,
    source_sha256:expected.sourceSha256,legacy_import_run_id:runId,cutoff_matches:true,validation_state:'published',
    promotion_profile:expected.qualityFlags.profile===OLD_PROFILE.id?'current-curated-grh-v1':'explicit-curated-grh-v2'};
  const flags={identity_matches:true,contracts_match:true,cutoffs_match:true,status_day_matches:true,assertion_cutoffs_match:true};
  return {calls,writes,async connect(){assert.fail('caller owns connection');},async end(){assert.fail('caller owns connection');},
    async query(query,parameters){
      calls.push({query,parameters});
      if (/^(?:BEGIN|COMMIT|ROLLBACK)\b/.test(query)) assert.fail('callee cannot manage caller transaction');
      if (/^SAVEPOINT /.test(query) && options.outsideTransaction)
        throw Object.assign(Error('private SQL detail'),{code:'25P01'});
      if (options.reject?.test(query)) throw Object.assign(Error('postgres://secret.invalid synthetic identity'),{code:options.rejectCode});
      if (/pg_try_advisory_xact_lock/.test(query)) return {rows:[{acquired:parameters[0]!==options.busyLock}]};
      if (/grh-promotion:run/.test(query)) return options.runResult ?? {rows:[{...source,...options.run}]};
      if (/FROM public.data_import_runs/.test(query) && /ORDER BY id DESC LIMIT 1025/.test(query))
        return {rows:[{...source,id:options.replayRunId ?? runId}]};
      if (/SELECT import_run_id::text FROM/.test(query)) return {rows:(options.cohortIds ?? [runId]).map(import_run_id=>({import_run_id}))};
      if (/^WITH grh_employees_expected/.test(query)) return {rows:[Object.fromEntries(TABLES.map(table=>[table,table!==options.driftTable]))]};
      if (/to_regclass/.test(query)) return {rows:[{present:true}]};
      if (/grh-promotion:batch/.test(query)) {batchCount++;return options.batchResult ?? (options.newBatch && batchCount===1?{rows:[]}:{rows:[{...batch,...options.batch}]});}
      if (/grh-promotion:baseline/.test(query)) return options.baselineResult??{rows:[{exact:true,profile:OLD_PROFILE.id,...options.baseline}]};
      if (/grh-promotion:transition/.test(query)) return {rows:[{cohort_matches:true,no_disappeared_contracts:true,baseline_snapshots_match:true,...options.transition}]};
      if (/grh-promotion:references/.test(query)) {referenceCount++;return {rows:[{exact:true,complete:true,...(referenceCount===1?options.references:options.postReferences)}]};}
      if (/grh-promotion:assertions/.test(query)) {assertionCount++;return {rows:[{lineage_matches:true,profile_matches:true,...(assertionCount===1?options.assertions:options.postAssertions)}]};}
      if (/FROM public.source_import_batch WHERE source_system/.test(query)) return {rows:options.newBatch?[]:[{legacy_import_run_id:runId,source_database:'grh_junin'}]};
      if (/grh-promotion:source-guards/.test(query)) {guardCount++;return {rows:[{...flags,...options.guards,
        ...(guardCount>1?options.postGuards:{})}]};}
      if (/grh-promotion:staging/.test(query)) {stageCount++;return {rows:[{actual_count:1,expected_count:1,exact:true,
        ...(stageCount===1?options.beforeStaging:options.afterStaging)}]};}
      if (/grh-promotion:result/.test(query)) return options.resultResponse ?? {rows:[{expected_people:1,canonical_people:1,
        expected_contracts:1,canonical_contracts:1,statuses_complete:true,...options.result}]};
      if (statements.includes(query)) {writes.push(query);return {rows:[]};}
      if (/^(SAVEPOINT|RELEASE SAVEPOINT|LOCK TABLE|SELECT set_config)/.test(query) || /grh-promotion:lock-/.test(query)) return {rows:[]};
      assert.fail(`unexpected query: ${query.slice(0,60)}`);
    }};
}

test('explicit SQL scopes every curated read and all batch selectors; no latest fallback',()=>{
  assert.equal(statements.length,17);
  assert.doesNotMatch(sql,/latest_run|latest_batch|LIMIT 1|ORDER BY (?:dir\.)?completed_at/);
  assert.equal((sql.match(/dir\.id = current_setting\('municontrol\.promotion_import_run_id'\)::bigint/g)||[]).length,16);
  assert.equal((sql.match(/FROM \(SELECT \* FROM public\.grh_/g)||[]).length,15);
  assert.doesNotMatch(sql,/FROM grh_/);
  assert.match(sql,/ON CONFLICT \(id\) DO NOTHING/);
  assert.doesNotMatch(sql,/SET cuil = EXCLUDED\.cuil/);
  assert.match(sql,/assertion\.person_id IN \(/);
  assert.match(sql,/employment_contract\.person_id = EXCLUDED\.person_id/);
});

test('replay quality issues skip nextval before conflict resolution',()=>{
  const quality=statements.filter(statement=>statement.includes('INSERT INTO data_quality_issue'));
  assert.equal(quality.length,3);
  for(const statement of quality){
    assert.match(statement,/NOT EXISTS \(\s+SELECT 1 FROM data_quality_issue existing/);
    for(const field of ['source_batch_id','source_entity','source_id','issue_code','field_name','canonical_id']) assert.ok(statement.includes(`existing.${field}`));
    assert.match(statement,/ON CONFLICT DO NOTHING/);
  }
});

test('identity guard admits only two complete source-backed profiles, preserving all shared natural fields',async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource);
  await promoteCanonicalGrhWithinTransaction({...inputs,client});
  const guard=client.calls.find(call=>/grh-promotion:source-guards/.test(call.query)).query;
  const existing='(p.cuil,p.dni,p.full_name,p.birth_date,p.sex_code)';
  const legacy='(e.cuil,e.dni,e.full_name,e.birth_date,e.sex_code)';
  const identityMaster='(e.cuil,e.identity_master_dni,e.full_name,e.birth_date,e.identity_master_sex_code)';
  const predicate=guard.slice(guard.indexOf('WHERE '+existing),guard.indexOf(' AS identity_matches'));
  assert.equal(predicate.replace(/\s+/g,' '),
    `WHERE ${existing} IS DISTINCT FROM ${legacy} AND ${existing} IS DISTINCT FROM ${identityMaster})`);
  // Both DNI and sex must match the same profile. Independent ORs would admit
  // a mixed identity that neither established importer could have produced.
  assert.doesNotMatch(predicate,/\bOR\b/);
  assert.equal((predicate.match(/p\.cuil,p\.dni,p\.full_name,p\.birth_date,p\.sex_code/g)||[]).length,2);
});

test('identity master projection uses the documented DNI bounds and verified raw sex code without label mappings',async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource);
  await promoteCanonicalGrhWithinTransaction({...inputs,client});
  const guard=client.calls.find(call=>/grh-promotion:source-guards/.test(call.query)).query;
  assert.match(guard,/CASE WHEN length\(ltrim\(normalize_digits\(p\.dni\),'0'\)\) BETWEEN 6 AND 8\s+THEN ltrim\(normalize_digits\(p\.dni\),'0'\) END AS identity_master_dni/);
  assert.match(guard,/NULLIF\(btrim\(p\.source_payload #>> '\{identity,sexCode\}'\),''\) AS identity_master_sex_code/);
  assert.doesNotMatch(guard,/Femenino|Masculino|WHEN .*sexo.*THEN/);
  assert.match(sql,/NULLIF\(btrim\(people\.sexo\), ''\)/);
  assert.doesNotMatch(sql,/identity_master_dni|identity_master_sex_code/);
  assert.doesNotMatch(sql,/SET cuil = EXCLUDED\.cuil/);
});

test('a natural identity outside both complete profiles remains blocked before writes and after a racing insert',async()=>{
  const inputs=fixture();
  for(const post of [false,true]){
    const client=fakeClient(inputs.expectedSource,post
      ? {postGuards:{identity_matches:false}} : {guards:{identity_matches:false}});
    await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code:'GRH_PROMOTION_IDENTITY_CONFLICT'});
    assert.equal(client.writes.length,post?statements.length:0);
    assert.equal(client.calls.some(call=>call.query==='RELEASE SAVEPOINT municontrol_canonical_grh_promotion'),false);
  }
});

test('complete promotion remains inside caller transaction with ordered locks and explicit source for all writes',async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource),phases=[];
  const result=await promoteCanonicalGrhWithinTransaction({...inputs,client,checkpoint:async phase=>phases.push(phase)});
  assert.deepEqual(result,{status:'promoted_in_transaction',importRunId:RUN,batchId:BATCH,sourceSha256:SHA,
    stagedRows:1,people:1,contracts:1,committed:false,callerOwnedTransaction:true});
  assert.deepEqual(phases,['promotion:validated','promotion:staged','promotion:written','promotion:verified']);
  assert.equal(client.calls[0].query,'SAVEPOINT municontrol_canonical_grh_promotion');
  assert.deepEqual(client.calls.filter(call=>/pg_try_advisory_xact_lock/.test(call.query)).map(call=>call.parameters[0]),GRH_PUBLICATION_LOCKS);
  const lock=client.calls.findIndex(call=>/^LOCK TABLE/.test(call.query));
  const people=client.calls.findIndex(call=>/grh-promotion:lock-people/.test(call.query));
  const contracts=client.calls.findIndex(call=>/grh-promotion:lock-contracts/.test(call.query));
  const guards=client.calls.findIndex(call=>/grh-promotion:source-guards/.test(call.query));
  assert.ok(lock<people && people<contracts && contracts<guards);
  assert.match(client.calls[lock].query,/IN SHARE MODE NOWAIT$/);
  assert.match(client.calls[people].query,/FOR UPDATE OF p NOWAIT$/);
  assert.match(client.calls[contracts].query,/FOR UPDATE OF c NOWAIT$/);
  assert.equal(client.writes.length,statements.length);
  for(const statement of client.writes){
    const index=client.calls.findIndex(call=>call.query===statement);
    assert.equal(client.calls[index-1].query,"SELECT set_config('municontrol.promotion_import_run_id',$1,true)");
    assert.deepEqual(client.calls[index-1].parameters,[RUN]);
  }
  assert.equal(client.calls.at(-1).query,'RELEASE SAVEPOINT municontrol_canonical_grh_promotion');
});

test('outside a transaction fails before locks or DML',async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource,{outsideTransaction:true});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code:'GRH_PROMOTION_TRANSACTION_REQUIRED'});
  assert.equal(client.calls.length,1);assert.deepEqual(client.writes,[]);
});

for(const busyLock of GRH_PUBLICATION_LOCKS) test(`existing writer lock blocks promotion: ${busyLock}`,async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource,{busyLock});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code:'GRH_PROMOTION_BUSY'});
  assert.deepEqual(client.writes,[]);assert.equal(client.calls.some(call=>/^LOCK TABLE/.test(call.query)),false);
});

for(const [label,options,code] of [
  ['different requested run',{run:{id:'2'}},'GRH_PROMOTION_SOURCE_MISMATCH'],
  ['non-GRH run',{run:{source_name:'other_source'}},'GRH_PROMOTION_SOURCE_MISMATCH'],
  ['cutoff drift',{run:{cutoff_matches:false}},'GRH_PROMOTION_SOURCE_MISMATCH'],
  ['incomplete run',{run:{completed:false}},'GRH_PROMOTION_SOURCE_MISMATCH'],
  ['different derived batch',{run:{batch_id:'00000000-0000-0000-0000-000000000001'}},'GRH_PROMOTION_SOURCE_MISMATCH'],
  ['mixed curated cohort',{cohortIds:['2','3']},'GRH_PROMOTION_COHORT_MISMATCH'],
  ['person changed',{guards:{identity_matches:false}},'GRH_PROMOTION_IDENTITY_CONFLICT'],
  ['contract reassigned',{guards:{contracts_match:false}},'GRH_PROMOTION_CONTRACT_CONFLICT'],
  ['backward cutoff',{guards:{cutoffs_match:false}},'GRH_PROMOTION_CUTOFF_CONFLICT'],
  ['same-day snapshot collision',{guards:{status_day_matches:false}},'GRH_PROMOTION_CUTOFF_CONFLICT'],
  ['assertion period collision',{guards:{assertion_cutoffs_match:false}},'GRH_PROMOTION_CUTOFF_CONFLICT'],
  ['immutable staging changed',{beforeStaging:{actual_count:1,exact:false}},'GRH_PROMOTION_STAGING_CONFLICT'],
  ['canonical batch provenance',{batch:{legacy_import_run_id:'2'}},'GRH_PROMOTION_SOURCE_MISMATCH'],
]) test(`rejects ${label} before any source or canonical write`,async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource,options);
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code});
  assert.deepEqual(client.writes,[]);
});

for(const driftTable of TABLES) test(`same count cannot conceal typed content changes in ${driftTable}`,async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource,{driftTable});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code:'GRH_PROMOTION_COHORT_MISMATCH'});
  assert.deepEqual(client.writes,[]);
});

test('an initially empty staging subset is accepted only if exact after insertion',async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource,{beforeStaging:{actual_count:0,exact:false}});
  assert.equal((await promoteCanonicalGrhWithinTransaction({...inputs,client})).stagedRows,1);
  const conflict=fakeClient(inputs.expectedSource,{beforeStaging:{actual_count:0,exact:false},afterStaging:{actual_count:1,exact:false}});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client:conflict}),{code:'GRH_PROMOTION_STAGING_CONFLICT'});
  assert.equal(conflict.writes.length,6);
});

for(const [options,code] of [
  [{postGuards:{identity_matches:false}},'GRH_PROMOTION_IDENTITY_CONFLICT'],
  [{result:{canonical_contracts:0}},'GRH_PROMOTION_RESULT_MISMATCH'],
  [{result:{statuses_complete:false}},'GRH_PROMOTION_RESULT_MISMATCH'],
]) test('postconditions reject insertion races or incomplete projection without confirming the caller transaction',async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource,options);
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code});
  assert.equal(client.writes.length,statements.length);
  assert.equal(client.calls.some(call=>/^RELEASE SAVEPOINT municontrol_canonical_grh_promotion$/.test(call.query)),false);
});

for(const phase of ['promotion:validated','promotion:staged','promotion:written','promotion:verified']) test(`checkpoint failure at ${phase} never commits or hides errors`,async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource);
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client,checkpoint:async current=>{
    if(current===phase)throw Error('postgres://secret.invalid synthetic identity');
  }}),error=>{assert.equal(error.code,'GRH_PROMOTION_UNAVAILABLE');assert.doesNotMatch(error.message,/secret|synthetic identity/);return true;});
  if(phase==='promotion:validated')assert.deepEqual(client.writes,[]);
});

for(const reject of [/grh-promotion:lock-people/,/grh-promotion:lock-contracts/,/grh-promotion:lock-statuses/]) test('concurrent row writer returns a safe busy error',async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource,{reject,rejectCode:'55P03'});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code:'GRH_PROMOTION_BUSY'});
  assert.deepEqual(client.writes,[]);
});

test('S11 and malformed input are rejected before querying',async()=>{
  for(const change of [input=>input.importRunId='0',input=>input.importRunId='9223372036854775808',
    input=>input.expectedSource.qualityFlags.profile='grh-junin-2026-09-11',input=>input.expectedSource.cutoff='2026-09-11 00:00:00',
    input=>input.expectedSource.cutoff='2026-08-06 99:00:00',input=>input.expectedSource.sourceDatabase='PERSONAS']){
    const inputs=fixture();change(inputs);const client=fakeClient(inputs.expectedSource);
    await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code:'GRH_PROMOTION_INPUT_INVALID'});
    assert.deepEqual(client.calls,[]);
  }
});

test('CLI requires explicit run and absolute source directory, rejects duplicates, and defaults to rollback',()=>{
  const directory=path.resolve('synthetic-source');
  assert.deepEqual(parsePromotionArgs([`--import-run-id=${RUN}`,`--sources-dir=${directory}`]),{importRunId:RUN,sourcesDir:directory,apply:false,databaseArgs:[]});
  assert.equal(parsePromotionArgs([`--import-run-id=${RUN}`,`--sources-dir=${directory}`,'--apply=true']).apply,true);
  assert.equal(parsePromotionArgs([`--import-run-id=${RUN}`,`--sources-dir=${directory}`,'--apply']).apply,true);
  for(const args of [[],['--import-run-id=3','--sources-dir=relative'],['--import-run-id=3',`--sources-dir=${directory}`,'--apply=yes'],
    ['--import-run-id=3',`--sources-dir=${directory}`,'--import-run-id=4'],['--import-run-id=3',`--sources-dir=${directory}`,'--latest=true'],
    ['--import-run-id=3',`--sources-dir=${directory}`,'--apply','--apply=false']]){
    assert.throws(()=>parsePromotionArgs(args),{code:'GRH_PROMOTION_INPUT_INVALID'});
  }
  assert.match(moduleSource,/import\.meta\.url===pathToFileURL\(path\.resolve\(process\.argv\[1\]\)\)\.href/);
  assert.doesNotMatch(JSON.stringify(safeCanonicalPromotionError(Error('postgres://secret.invalid synthetic identity'))),/secret|synthetic identity/);
});

test('CLI preserves the exact target confirmation for the shared canonical target gate',()=>{
  const args=['--import-run-id=3',`--sources-dir=${path.resolve('synthetic-source')}`];
  for(const flag of ['--confirm-isolated-branch','--confirm-production-branch=br-synthetic']){
    assert.deepEqual(parsePromotionArgs([...args,flag]).databaseArgs,[flag]);
    assert.throws(()=>parsePromotionArgs([...args,flag,flag]),{code:'GRH_PROMOTION_INPUT_INVALID'});
  }
  assert.throws(()=>parsePromotionArgs([...args,'--confirm-isolated-branch','--confirm-production-branch=br-synthetic']),{code:'GRH_PROMOTION_INPUT_INVALID'});
  assert.throws(()=>parsePromotionArgs([...args,'--confirm-production-branch=']),{code:'GRH_PROMOTION_INPUT_INVALID'});
  assert.match(moduleSource,/directCanonicalDatabaseUrl\(args\.databaseArgs\)/);
});

function baselineFixture() {
  return {importRunId:RUN,batchId:BATCH,sourceSha256:SHA,sourceDatabase:OLD_PROFILE.source.database,cutoff:OLD_PROFILE.source.cutoff};
}

test('a registered new cut still requires an explicit published baseline before any DML',async()=>{
  const inputs=fixture('grh-junin-2026-09-10'),client=fakeClient(inputs.expectedSource,{newBatch:true});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code:'GRH_PROMOTION_BASELINE_REQUIRED'});
  assert.deepEqual(client.writes,[]);
  assert.equal(client.calls.some(call=>/grh-promotion:lock-people/.test(call.query)),false);
});

test('A to B verifies baseline, missing contracts, snapshots and references before writing the selected cut',async()=>{
  const inputs=fixture('grh-junin-2026-09-10'),expectedBaseline=baselineFixture();
  const client=fakeClient(inputs.expectedSource,{newBatch:true}),phases=[];
  const result=await promoteCanonicalGrhWithinTransaction({...inputs,expectedBaseline,client,checkpoint:async phase=>phases.push(phase)});
  assert.equal(result.importRunId,'4');assert.equal(result.batchId,batchFor(inputs.expectedSource.sourceSha256));
  assert.equal(result.committed,false);assert.equal(client.writes.length,17);
  const firstWrite=client.calls.findIndex(call=>statements.includes(call.query));
  for(const marker of ['baseline','transition','references','assertions']){
    const index=client.calls.findIndex(call=>call.query.includes(`grh-promotion:${marker} */`));
    assert.ok(index>0 && index<firstWrite,marker);
  }
  const baselineCall=client.calls.find(call=>/grh-promotion:baseline/.test(call.query));
  assert.deepEqual(baselineCall.parameters,[BATCH,RUN,'grh_junin',SHA,OLD_PROFILE.source.cutoff]);
  const contractLock=client.calls.find(call=>/grh-promotion:lock-contracts/.test(call.query));
  assert.deepEqual(contractLock.parameters,['4',BATCH]);
  assert.match(contractLock.query,/c\.source_batch_id=\$2::uuid OR EXISTS/);
  assert.deepEqual(phases,['promotion:validated','promotion:staged','promotion:written','promotion:verified']);
  const finalReferences=client.calls.filter(call=>/grh-promotion:references/.test(call.query)).at(-1);
  assert.equal(finalReferences.parameters.at(-1),true);
});

test('B replay keeps explicit run and full assertion verification without requiring or selecting a baseline',async()=>{
  const inputs=fixture('grh-junin-2026-09-10'),client=fakeClient(inputs.expectedSource);
  await promoteCanonicalGrhWithinTransaction({...inputs,client});
  assert.equal(client.calls.some(call=>/grh-promotion:baseline/.test(call.query)),false);
  assert.doesNotMatch(client.calls.map(call=>call.query).join('\n'),/max\(.*(?:source_cutoff|completed_at)|ORDER BY .*source_cutoff DESC/i);
  const corrupted=fakeClient(inputs.expectedSource,{postAssertions:{profile_matches:false}});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client:corrupted}),{code:'GRH_PROMOTION_ASSERTION_CONFLICT'});
});

for(const [label,options,code] of [
  ['baseline provenance',{baseline:{exact:false}},'GRH_PROMOTION_BASELINE_MISMATCH'],
  ['unregistered baseline profile',{baseline:{profile:'unknown'}},'GRH_PROMOTION_BASELINE_MISMATCH'],
  ['mixed canonical cohort',{transition:{cohort_matches:false}},'GRH_PROMOTION_BASELINE_MISMATCH'],
  ['disappeared baseline contract',{transition:{no_disappeared_contracts:false}},'GRH_PROMOTION_DISAPPEARED_CONTRACT'],
  ['changed old contract snapshot',{transition:{baseline_snapshots_match:false}},'GRH_PROMOTION_STAGING_CONFLICT'],
  ['wrong xref target or source',{references:{exact:false}},'GRH_PROMOTION_REFERENCE_CONFLICT'],
  ['wrong assertion source or period',{assertions:{lineage_matches:false}},'GRH_PROMOTION_ASSERTION_CONFLICT'],
]) test(`A to B rejects ${label} before any DML`,async()=>{
  const inputs=fixture('grh-junin-2026-09-10'),client=fakeClient(inputs.expectedSource,{newBatch:true,...options});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,expectedBaseline:baselineFixture(),client}),{code});
  assert.deepEqual(client.writes,[]);
});

for(const [label,options,code] of [
  ['missing new xref',{postReferences:{complete:false}},'GRH_PROMOTION_REFERENCE_CONFLICT'],
  ['old xref remained active',{postReferences:{exact:false}},'GRH_PROMOTION_REFERENCE_CONFLICT'],
  ['old assertion remained active',{postAssertions:{lineage_matches:false}},'GRH_PROMOTION_ASSERTION_CONFLICT'],
  ['DNI promoted against accepted identity',{postAssertions:{profile_matches:false}},'GRH_PROMOTION_ASSERTION_CONFLICT'],
]) test(`A to B rejects ${label} after writes and leaves rollback to caller`,async()=>{
  const inputs=fixture('grh-junin-2026-09-10'),client=fakeClient(inputs.expectedSource,{newBatch:true,...options});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,expectedBaseline:baselineFixture(),client}),{code});
  assert.equal(client.writes.length,17);
  assert.notEqual(client.calls.at(-1).query,'RELEASE SAVEPOINT municontrol_canonical_grh_promotion');
});

test('baseline shape, identity and increasing cutoff cannot be replaced by client strings',async()=>{
  for(const change of [value=>value.unexpected=true,value=>value.importRunId='0',value=>value.importRunId='9223372036854775808',
    value=>value.batchId='00000000-0000-0000-0000-000000000001',value=>value.sourceDatabase='other',value=>value.cutoff='2026-09-10 99:00:00']){
    const inputs=fixture('grh-junin-2026-09-10'),expectedBaseline=baselineFixture();change(expectedBaseline);
    const client=fakeClient(inputs.expectedSource,{newBatch:true});
    await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,expectedBaseline,client}),{code:'GRH_PROMOTION_INPUT_INVALID'});
    assert.deepEqual(client.calls,[]);
  }
  const inputs=fixture('grh-junin-2026-09-10'),client=fakeClient(inputs.expectedSource,{newBatch:true});
  await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,expectedBaseline:{...baselineFixture(),cutoff:'2026-09-11T00:00:00'},client}),
    {code:'GRH_PROMOTION_BASELINE_MISMATCH'});
  assert.deepEqual(client.writes,[]);
});

test('registered profile requires logical SHA, cutoff and every source/catalog/critical count exactly',async()=>{
  for(const change of [value=>value.sourceSha256='A'.repeat(64),value=>value.cutoff='2026-09-10 15:17:31',
    value=>value.tableCounts.employees++,value=>value.tableCounts.catalog_rows++,value=>value.tableCounts.critical.employees++,
    value=>value.tableCounts.source={...value.tableCounts.source,employees:1},value=>value.tableCounts.catalogs.organizations++,
    value=>value.qualityFlags.profile='grh-core-junin-2026-09']){
    const inputs=fixture('grh-junin-2026-09-10');change(inputs.expectedSource);const client=fakeClient(inputs.expectedSource);
    await assert.rejects(promoteCanonicalGrhWithinTransaction({...inputs,client}),{code:'GRH_PROMOTION_INPUT_INVALID'});
    assert.deepEqual(client.calls,[]);
  }
});

test('reference rotation is scoped to selected GRH identities and retains original historical provenance',async()=>{
  const closure=statements.find(statement=>statement.includes('UPDATE source_xref existing'));
  assert.ok(closure);assert.match(closure,/SET valid_to = batch\.source_cutoff/);
  assert.match(closure,/existing\.source_entity = selected\.source_entity/);
  assert.match(closure,/existing\.source_id = selected\.source_id/);
  assert.match(closure,/existing\.canonical_entity = selected\.canonical_entity/);
  assert.match(closure,/existing\.canonical_id = selected\.canonical_id/);
  assert.match(closure,/existing\.source_system = 'GRH'/);
  assert.match(closure,/existing\.source_batch_id <> batch\.id AND existing\.valid_from < batch\.source_cutoff/);
  assert.match(closure,/prior_batch\.source_database = 'grh_junin'/);
  assert.doesNotMatch(closure,/SET (?:source_batch_id|canonical_id)|DELETE|TRUNCATE/);
  const inputs=fixture(),client=fakeClient(inputs.expectedSource);await promoteCanonicalGrhWithinTransaction({...inputs,client});
  const preflight=client.calls.find(call=>/grh-promotion:references/.test(call.query)).query;
  for(const predicate of ['x.canonical_entity<>e.canonical_entity','x.canonical_id<>e.canonical_id',
    "b.source_database IS DISTINCT FROM 'grh_junin'","b.validation_state IS DISTINCT FROM 'published'",'x.valid_from IS DISTINCT FROM b.source_cutoff'])
    assert.ok(preflight.includes(predicate));
  assert.match(client.calls.find(call=>/grh-promotion:lock-references/.test(call.query)).query,/FOR UPDATE OF x NOWAIT$/);
});

test('new assertions retain source raw values and use the complete accepted canonical identity for eligibility',()=>{
  const insertion=statements.find(statement=>statement.includes('INSERT INTO person_identity_assertion'));
  assert.match(insertion,/JOIN person_identity canonical ON canonical\.id = md5/);
  assert.match(insertion,/\('dni', people\.dni, canonical\.dni::text, canonical\.dni IS NOT NULL,/);
  assert.match(insertion,/\('sex_code', people\.raw_sex_code, canonical\.sex_code::text, canonical\.sex_code IS NOT NULL,/);
  assert.match(insertion,/COALESCE\(employee\.source_payload #>> '\{identity,sexCode\}', employee\.sexo\) AS raw_sex_code/);
  assert.doesNotMatch(insertion,/\('dni',.*5,12/);
  assert.match(insertion,/to_jsonb\(assertions\.raw_value\)/);
  assert.match(insertion,/ON CONFLICT DO NOTHING/);
  const closing=statements.find(statement=>statement.includes('UPDATE person_identity_assertion assertion'));
  assert.match(closing,/prior_batch\.source_database = 'grh_junin'/);
  assert.match(closing,/assertion\.person_id = md5\('person_identity\|GRH\|persona\|' \|\| assertion\.source_id\)::uuid/);
});

test('standalone staging verification is import-safe, transaction-bound, exact and does not acquire locks or write',async()=>{
  const inputs=fixture(),client=fakeClient(inputs.expectedSource);
  assert.equal(await verifyCanonicalGrhStagingWithinTransaction(client,RUN,BATCH),1);
  assert.equal(client.calls[0].query,'SAVEPOINT grh_canonical_staging_verification');
  assert.equal(client.calls.at(-1).query,'RELEASE SAVEPOINT grh_canonical_staging_verification');
  assert.equal(client.calls.length,3);assert.deepEqual(client.writes,[]);
  const outside=fakeClient(inputs.expectedSource,{outsideTransaction:true});
  await assert.rejects(verifyCanonicalGrhStagingWithinTransaction(outside,RUN,BATCH),{code:'GRH_PROMOTION_TRANSACTION_REQUIRED'});
  const incomplete=fakeClient(inputs.expectedSource,{beforeStaging:{actual_count:0,exact:false}});
  await assert.rejects(verifyCanonicalGrhStagingWithinTransaction(incomplete,RUN,BATCH),{code:'GRH_PROMOTION_STAGING_CONFLICT'});
});
