import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createInternalDataHandler } from '../api/internal-data.js';
import { effectiveSourceSnapshot, assertEffectiveSourceSnapshot, operationalDirectorySql } from '../lib/workforce-operational-scope.js';
import { buildGrhEffectiveConsumersQa } from '../scripts/verify-grh-effective-consumers-postgres.mjs';

const binding={tenantId:'10000000-0000-4000-8000-000000000001',database:'synthetic_grh',companyId:1};
const read=async path=>(await readFile(new URL(`../${path}`,import.meta.url),'utf8')).replaceAll('\r\n','\n');
const sha=value=>createHash('sha256').update(value).digest('hex');
const migration=await read('scripts/migrations/097-grh-effective-consumers.sql');
const patches=[...migration.matchAll(/-- (\w+): preserve signature,[\s\S]*?IF current_hash='([a-f0-9]{64})'(?: OR current_hash='([a-f0-9]{64})')?[\s\S]*?IF current_hash<>'([a-f0-9]{64})'(?: AND current_hash<>'([a-f0-9]{64})')?[\s\S]*?changes := \$changes\$([\s\S]*?)\$changes\$/g)].map(([,name,after,canonicalAfter,before,canonicalBefore,pairs])=>({name,after,before,canonicalAfter,canonicalBefore,pairs:JSON.parse(pairs)}));
const bodyOf=(source,name)=>{const start=source.search(new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${name}\\(`));assert.notEqual(start,-1,name);const bodyStart=source.indexOf('AS $$',start)+5;assert.ok(bodyStart>4);return source.slice(bodyStart,source.indexOf('$$;',bodyStart));};
const files={action_center_case_source_context_v1:'059-action-source-history.sql',employee_payroll_detail_v1:'048-payroll-detail-source.sql',employee_payroll_documents_v1:'051-payroll-document-library.sql',employee_payroll_history_v1:'031-governed-employee-payroll-history.sql',payroll_novelty_prepare_v1:'026-governed-payroll-novelties.sql',payroll_reprocessing_assert_context_v1:'035-governed-payroll-reprocessing.sql',payroll_reprocessing_prepare_v1:'035-governed-payroll-reprocessing.sql'};
const reconstructed=new Map();
for(const patch of patches){
 let body=bodyOf(await read(`scripts/migrations/${files[patch.name]}`),patch.name);
 if(patch.name==='employee_payroll_detail_v1')body=body.replace("'closureStatus',CASE WHEN ds.source_closed_flag=1 THEN 'closed' ELSE 'open' END","'closureStatus',CASE ds.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END");
 if(patch.name==='payroll_novelty_prepare_v1'){
  body=body.replace("'monthly','sac','vacation','supplementary','final','other'","'monthly','first_fortnight','sac','vacation','supplementary','final','other'");
  body=body.replace("AND lower(COALESCE(equal_movement.payroll_type, '')) = p_payroll_type",'AND public.payroll_type_canonical_v1(equal_movement.source_system, equal_movement.payroll_type) = p_payroll_type');
  body=body.replace("AND lower(COALESCE(movement.payroll_type, '')) = p_payroll_type",'AND public.payroll_type_canonical_v1(movement.source_system, movement.payroll_type) = p_payroll_type');
  const prior=await read('scripts/migrations/032-payroll-type-mapping-fail-closed.sql');
  const guard=prior.match(/unresolved_guard constant text := \$guard\$([\s\S]*?)\$guard\$/)[1];
  body=body.replace('  INSERT INTO public.payroll_novelty_event (\n',()=>guard+'  INSERT INTO public.payroll_novelty_event (\n');
 }
 test(`097 pins original and effective body exactly: ${patch.name}`,()=>{
  assert.equal(sha(body),patch.canonicalBefore||patch.before);
  for(const [before,after] of patch.pairs){assert.ok(body.includes(before));body=body.replaceAll(before,()=>after);}
  assert.equal(sha(body),patch.canonicalAfter||patch.after);
  reconstructed.set(patch.name,body);
 });
}

test('097 preserves real reprocessing history and only limits new preparation to selected real runs',async()=>{
 assert.equal(patches.length,7);
 assert.equal(patches.some(p=>p.name==='payroll_reprocessing_snapshot_v1'),false);
 const patch=patches.find(p=>p.name==='payroll_reprocessing_prepare_v1');
 assert.equal(patch.pairs.length,1);
 assert.match(patch.pairs[0][1],/EXISTS \(SELECT 1 FROM public\.grh_effective_payroll_run_v1/);
 assert.match(bodyOf(await read('scripts/migrations/035-governed-payroll-reprocessing.sql'),'payroll_reprocessing_snapshot_v1'),/JOIN public\.payroll_run/);
});

test('historical identity accepts two complete profiles and never changes the current-source write guard',()=>{
 const patch=patches.find(p=>p.name==='action_center_case_source_context_v1');
 const comparison=patch.pairs[1][1];
 assert.match(comparison,/\(cuil, dni, full_name, birth_date, sex_code\) IS NOT DISTINCT FROM\s+\(expected_cuil, legacy_dni, expected_name, expected_birth, legacy_sex\)/);
 assert.match(comparison,/OR \(cuil, dni, full_name, birth_date, sex_code\) IS NOT DISTINCT FROM\s+\(expected_cuil, master_dni, expected_name, expected_birth, master_sex\)/);
 assert.match(comparison,/BETWEEN 6 AND 8/);
 assert.doesNotMatch(migration,/CREATE OR REPLACE FUNCTION.*action_center_assert_case_source_current_v1|DROP |GRANT /);
});

test('effective cohorts use published facts and keep directory identity/source matching',()=>{
 const query=operationalDirectorySql('WITH directory AS (SELECT 1)');
 assert.match(query,/FROM grh_effective_payroll_monthly_fact_v1 f JOIN grh_effective_payroll_run_v1/);
 assert.match(query,/d\."sourceBatchId"=f\.source_batch_id/);
 assert.match(query,/d\."sourceSystem"=f\.source_system/);
 assert.match(migration,/GROUP BY run\.id, run\.company_source_id, run\.payroll_date, run\.source_period/);
 assert.match(migration,/selected\.source_batch_id=batch\.id AND selected\.import_run_id=imported\.id/);
});

test('source snapshot is bound to tenant/company and rejects missing, ambiguous or malformed authority',async()=>{
 let captured;
 const sql={query:async(...args)=>{captured=args;return[{token:'a'.repeat(64)}];}};
 assert.equal(await effectiveSourceSnapshot(sql,binding),'a'.repeat(64));
 assert.deepEqual(captured[1],[binding.tenantId,binding.database,1]);
 assert.match(captured[0],/binding\.verified IS TRUE/);
 assert.match(captured[0],/source_version_id/);
 assert.match(captured[0],/count\(\*\) FROM grh_effective_source_batch_v1\)=1/);
 for(const rows of [[],[{token:'a'.repeat(64)},{token:'b'.repeat(64)}],[{token:null}],[{token:'unsafe'}]]){
  await assert.rejects(effectiveSourceSnapshot({query:async()=>rows},binding),{code:'GRH_SOURCE_SCOPE_INVALID'});
 }
 await assert.rejects(effectiveSourceSnapshot({query:async()=>{throw Error('must not query');}},null),{code:'GRH_SOURCE_SCOPE_INVALID'});
 await assert.rejects(assertEffectiveSourceSnapshot(sql,binding,'b'.repeat(64)),{code:'GRH_SOURCE_CHANGED'});
});

function response(){return{statusCode:null,body:null,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
function handlerFixture({rotate=false,revoke=false}={}){
 const calls=[];let snapshots=0;
 const sql={query:async(query)=>{query=String(query);calls.push(query);
  if(query.includes('effective-source:snapshot')){snapshots++;if(revoke&&snapshots===2)return[];return[{token:(rotate&&snapshots===2?'b':'a').repeat(64)}];}
  if(query.includes('AS historical_records'))return[{historical_records:2,active:1,inactive:1}];
  if(query.includes('FROM data_import_runs')){assert.match(query,/id IN \(SELECT legacy_import_run_id FROM grh_effective_source_batch_v1\)/);return[{id:7,source_name:'Synthetic publication',source_cutoff:'2026-09-10T00:00:00',source_sha256:'a'.repeat(64),status:'completed'}];}
  return[];
 }};
 const handler=createInternalDataHandler({getInternalSql:async()=>sql,requireCompatibleInternalAccess:async()=>({mode:'managed',principal:{tenant:{id:binding.tenantId}}}),env:{FRIENDLY_GRH_SOURCE_DATABASE:binding.database,FRIENDLY_GRH_COMPANY_ID:'1'}});
 return{handler,calls};
}
test('authorized API revalidates publication after every assembled query before sending',async()=>{
 const {handler,calls}=handlerFixture();const res=response();await handler({method:'GET',query:{resource:'summary'}},res);
 assert.equal(res.statusCode,200);assert.equal(res.body.source.importId,7);
 assert.match(calls[0],/effective-source:snapshot/);assert.match(calls.at(-1),/effective-source:snapshot/);assert.equal(calls.length,6);
});
test('API discards assembled data when publication changes during the read',async()=>{
 const {handler}=handlerFixture({rotate:true});const res=response();await handler({method:'GET',query:{resource:'summary'}},res);
 assert.equal(res.statusCode,503);assert.equal(res.body.code,'GRH_SOURCE_CHANGED');assert.equal('workforce'in res.body,false);assert.equal('source'in res.body,false);
});
test('API discards assembled data when source authority is revoked during the read',async()=>{
 const {handler}=handlerFixture({revoke:true});const res=response();await handler({method:'GET',query:{resource:'summary'}},res);
 assert.equal(res.statusCode,503);assert.equal(res.body.code,'INTERNAL_DATA_UNAVAILABLE');assert.equal('workforce'in res.body,false);
});

test('consumer SQL generator is bounded to an empty disposable loopback database and preserves exact migration pins',()=>{
 for(const expectedMajor of [17,18]){
  const sql=buildGrhEffectiveConsumersQa({expectedMajor});
  assert.match(sql,/current_database\(\)<>'effective_consumers_qa'/);
  assert.match(sql,/EMPTY_DISPOSABLE_DATABASE_REQUIRED/);
  assert.match(sql,/inet_server_addr\(\).*127\.0\.0\.1/);
  assert.ok(sql.includes("current_setting('server_version_num')::integer/10000<>"+expectedMajor));
  assert.equal(sql.split(migration).length,3);
  assert.match(sql,/actualSessionGuard007/);
  assert.match(sql,/fixtureCapabilityResolver/);
  assert.match(sql,/ROLLBACK;\s+SELECT to_regclass\('public\.grh_effective_source_binding'\) IS NULL AS rollback_tables_absent/);
 }
 assert.throws(()=>buildGrhEffectiveConsumersQa({expectedMajor:16}),/Invalid QA target/);
});
