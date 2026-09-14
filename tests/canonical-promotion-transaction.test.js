import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { promoteCanonicalGrhWithinTransaction, parsePromotionArgs, safeCanonicalPromotionError } from '../scripts/promote-canonical-grh.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';
import { GRH_PUBLICATION_LOCKS } from '../scripts/lib/grh-publication-lock.mjs';

const SHA='A'.repeat(64), RUN='3';
const batchHash=createHash('md5').update('source_import_batch|GRH|'+SHA).digest('hex');
const BATCH=[batchHash.slice(0,8),batchHash.slice(8,12),batchHash.slice(12,16),batchHash.slice(16,20),batchHash.slice(20)].join('-');
const TABLES=['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'];
const sql=await readFile(new URL('../scripts/canonical-promote-current-grh.sql',import.meta.url),'utf8');
const moduleSource=await readFile(new URL('../scripts/promote-canonical-grh.mjs',import.meta.url),'utf8');
const statements=splitPostgresStatements(sql);
function fixture() {
  const expectedSource={sourceName:'grh_junin_curated',sourceSha256:SHA,sourceDatabase:'grh_junin',cutoff:'2026-08-06 15:15:21',
    qualityFlags:{profile:'grh-junin-2026-08-06',manifestSha256:'B'.repeat(64),strictSnapshot:true,allOutputHashesVerified:true},
    tableCounts:{employees:1,absences:0,leaves:0,family:0,catalog_rows:0}};
  const verifiedProjection=runId=>Object.fromEntries(TABLES.map(table=>[table,table==='grh_employees'
    ? [{company_id:1,legajo:'999999',person_id:'999999',import_run_id:runId,source_payload:JSON.stringify({private:'synthetic identity'})}]:[]]));
  return {importRunId:RUN,expectedSource,verifiedProjection};
}
function fakeClient(expected, options={}) {
  const calls=[],writes=[]; let guardCount=0,stageCount=0;
  const source={id:RUN,source_name:expected.sourceName,source_sha256:SHA,cutoff_matches:true,status:'completed',completed:true,
    quality_flags:structuredClone(expected.qualityFlags),table_counts:structuredClone(expected.tableCounts),batch_id:BATCH};
  const batch={id:BATCH,source_system:'GRH',source_database:'grh_junin',source_file_name:expected.sourceName,
    source_sha256:SHA,legacy_import_run_id:RUN,cutoff_matches:true,validation_state:'published'};
  const flags={identity_matches:true,contracts_match:true,cutoffs_match:true,status_day_matches:true,assertion_cutoffs_match:true};
  return {calls,writes,async connect(){assert.fail('caller owns connection');},async end(){assert.fail('caller owns connection');},
    async query(query,parameters){
      calls.push({query,parameters});
      if (/^(?:BEGIN|COMMIT|ROLLBACK)\b/.test(query)) assert.fail('callee cannot manage caller transaction');
      if (query===`SAVEPOINT municontrol_canonical_grh_promotion` && options.outsideTransaction)
        throw Object.assign(Error('private SQL detail'),{code:'25P01'});
      if (options.reject?.test(query)) throw Object.assign(Error('postgres://secret.invalid synthetic identity'),{code:options.rejectCode});
      if (/pg_try_advisory_xact_lock/.test(query)) return {rows:[{acquired:parameters[0]!==options.busyLock}]};
      if (/grh-promotion:run/.test(query)) return options.runResult ?? {rows:[{...source,...options.run}]};
      if (/FROM public.data_import_runs/.test(query) && /ORDER BY id DESC LIMIT 1025/.test(query))
        return {rows:[{...source,id:options.replayRunId ?? RUN}]};
      if (/SELECT import_run_id::text FROM/.test(query)) return {rows:(options.cohortIds ?? [RUN]).map(import_run_id=>({import_run_id}))};
      if (/^WITH grh_employees_expected/.test(query)) return {rows:[Object.fromEntries(TABLES.map(table=>[table,table!==options.driftTable]))]};
      if (/to_regclass/.test(query)) return {rows:[{present:true}]};
      if (/grh-promotion:batch/.test(query)) return options.batchResult ?? {rows:[{...batch,...options.batch}]};
      if (/FROM public.source_import_batch WHERE source_system/.test(query)) return {rows:[{legacy_import_run_id:RUN,source_database:'grh_junin'}]};
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
  assert.equal(statements.length,16);
  assert.doesNotMatch(sql,/latest_run|latest_batch|LIMIT 1|ORDER BY (?:dir\.)?completed_at/);
  assert.equal((sql.match(/dir\.id = current_setting\('municontrol\.promotion_import_run_id'\)::bigint/g)||[]).length,15);
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
    assert.equal(client.writes.length,post?16:0);
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
  assert.equal(client.writes.length,16);
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
  assert.equal(client.writes.length,16);
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
