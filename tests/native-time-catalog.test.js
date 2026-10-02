import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeTimeCandidate,nativeTimePrerequisiteSource} from '../scripts/prepare-native-time-catalog.mjs';
import {nativeTimeDefinitions,timeFunction,NATIVE_TIME_PATCHES} from '../scripts/lib/native-time-catalog-migration.mjs';
import {buildNativeTimeCatalogQa} from '../scripts/verify-native-time-catalog-sql.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replaceAll('\r\n','\n');
const original=nativeTimePrerequisiteSource();
const candidate=read('scripts/migrations/116-native-time-catalog.sql');
test('SQL116 is reproduced from exact011 and canonical/native period prerequisites',()=>{
 assert.equal(candidate,nativeTimeCandidate());
 assert.equal((candidate.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,7);
 assert.equal((candidate.match(/pin\(signature,sha256\)/g)||[]).length,1);
 assert.doesNotMatch(candidate,/\b(?:GRANT|CREATE TABLE|ALTER TABLE|TRUNCATE|DROP|UPDATE employment_contract|INSERT INTO (?:employment_contract|native_employee_registration))\b/i);
 assert.match(candidate,/TIME_CATALOG_NATIVE_ALREADY_INSTALLED/);
});
test('all4 modified bodies pin the original and keep the original GRH proof',()=>{
 const patches=nativeTimeDefinitions(original);assert.equal(patches.length,4);
 for(const p of patches){assert.match(candidate,new RegExp(p.oldSha));assert.notEqual(p.oldSha,p.newSha);}
 for(const name of ['time_catalog_assert_actor_authority_v1','time_catalog_guard_entry_v1','time_catalog_assert_approvable_v1']){
  const body=timeFunction(candidate,name).body;
  for(const marker of ["contract.source_system = 'GRH'","batch.validation_state = 'published'","batch.legacy_import_run_id IS NOT NULL"])
   assert.ok(body.includes(marker),name+': '+marker);
 }
});
test('native scope is canonical registration plus complete work-period coverage, never an import lookup',()=>{
 const body=timeFunction(candidate,'time_catalog_native_subject_v2').body;
 assert.match(body,/contract.tenant_id=p_tenant/);assert.match(body,/contract.source_system='MUNICONTROL'/);
 assert.match(body,/contract.source_batch_id IS NULL/);
 assert.match(body,/payroll_fixed_registry_subject_by_contract_v1\(ctx,p_contract,true\)/);
 assert.match(body,/native_employment_lifecycle_range_v1\(ctx,p_contract,p_from,p_to,true\)/);
 assert.doesNotMatch(body,/JOIN public\.source_import_batch|legacy_legajo\s*=/);
});
test('actor verification requires one current link, active membership and current municipal day',()=>{
 const body=timeFunction(candidate,'time_catalog_native_actor_v2').body;
 assert.match(body,/total<>1/);assert.match(body,/membership.status='active'/);
 assert.match(body,/America\/Argentina\/Mendoza/);assert.match(body,/target,today,today/);
 assert.match(body,/LOCK TABLE public.tenant_action_employment_link IN SHARE MODE NOWAIT/);
});
test('native multi-account duties are combined with legacy duties, not substituted',()=>{
 const body=timeFunction(candidate,'time_catalog_assert_person_sod_v1').body;
 assert.match(body,/has_propose:=has_propose OR/);assert.match(body,/has_approve:=has_approve OR/);
 assert.match(body,/has_overtime_post:=has_overtime_post OR/);
 assert.match(body,/has_approve AND has_overtime_post/);assert.match(body,/TIME_CATALOG_PERSON_SOD_CONFLICT/);
 assert.match(body,/NOT public\.tenant_iam_operational_person_pair_v1/);
 assert.match(timeFunction(candidate,'time_catalog_native_person_caps_v2').body,/tenant_iam_assert_no_sod_conflict\(member\)/);
});
test('migration preserves command/body/session/idempotency, geometry, payload validators and all4 runtime facades',()=>{
 const changed=NATIVE_TIME_PATCHES.map(([name])=>name);
 for(const name of ['time_catalog_apply_command_v1','time_catalog_bootstrap_v1','time_catalog_list_v1','time_catalog_detail_v1','time_catalog_payload_valid_v1','time_catalog_normalized_week_segments_v1'])assert.ok(!changed.includes(name));
 assert.doesNotMatch(candidate,/CREATE OR REPLACE FUNCTION (?:public\.)?(?:time_catalog_apply_command_v1|time_catalog_bootstrap_v1|time_catalog_list_v1|time_catalog_detail_v1|time_catalog_payload_valid_v1|time_catalog_normalized_week_segments_v1)\(/);
 assert.match(candidate,/FROM PUBLIC,municontrol_actions_runtime_app/);
 assert.match(candidate,/has_function_privilege\('municontrol_actions_runtime_app',p.oid,'EXECUTE'\) IS FALSE/);
});
test('an ambiguous or changed source cannot be generated silently',()=>{
 assert.throws(()=>nativeTimeDefinitions(original+'\n'+timeFunction(original,'time_catalog_assert_actor_authority_v1').definition),/AMBIGUOUS/);
 assert.throws(()=>nativeTimeDefinitions(original.replace('  related_membership_id uuid;','  renamed_member uuid;')),/PATCH_DRIFT/);
});
test('integration uses real writers, both source origins, period gap and a separate-connection lock',()=>{
 const qa=buildNativeTimeCatalogQa({serverMajor:17,requireConcurrency:true});
 assert.equal(qa.report.timeCatalogChecksPassed,23);assert.equal(qa.report.checksPassed,558);
 assert.match(qa.sql,/native_time_catalog_qa/);assert.match(qa.sql,/TIME_CATALOG_NATIVE_PERIOD_INVALID/);
 assert.match(qa.sql,/time_catalog_apply_command_v1/);assert.match(qa.sql,/native_employee_create_v1/);
 assert.match(qa.sql,/tenant_iam_assert_no_sod_conflict/);
 assert.match(qa.lockSql,/native-employment-lifecycle:v1:/);
 assert.match(qa.sql,/ROLLBACK/);assert.doesNotMatch(qa.sql,/COMMIT;/);
});
