import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {nativeTimeCandidate,nativeTimePrerequisiteSource} from '../scripts/prepare-native-time-catalog.mjs';
import {nativeTimeDefinitions,timeFunction,NATIVE_TIME_PATCHES} from '../scripts/lib/native-time-catalog-migration.mjs';
import {buildNativeTimeCatalogQa} from '../scripts/verify-native-time-catalog-sql.mjs';
import {validCuil} from '../assets/native-employee-contract.js';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8').replaceAll('\r\n','\n');
const original=nativeTimePrerequisiteSource();
const candidate=read('scripts/migrations/116-native-time-catalog.sql');
test('SQL116 is reproduced from exact011 and canonical/native period prerequisites',()=>{
 assert.equal(candidate,nativeTimeCandidate());
 assert.equal((candidate.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,15);
 const statements=splitPostgresStatements(candidate);
 assert.equal(statements.length,19);
 assert.equal(statements.filter(s=>s.includes('CREATE OR REPLACE FUNCTION')).length,15);
 for(const s of statements)assert.ok((s.match(/CREATE OR REPLACE FUNCTION/g)||[]).length<=1,'one complete definition per SQL statement');
 assert.equal((candidate.match(/pin\(signature,sha256,runtime_execute\)/g)||[]).length,1);
 assert.doesNotMatch(candidate,/\b(?:GRANT|CREATE TABLE|TRUNCATE|DROP|UPDATE employment_contract|INSERT INTO (?:employment_contract|native_employee_registration))\b/i);
 const schema=statements.filter(s=>/ALTER TABLE/.test(s));assert.equal(schema.length,1);
 assert.match(schema[0],/^ALTER TABLE public\.time_catalog_entry/);
 assert.equal((schema[0].match(/ADD COLUMN/g)||[]).length,3);
 assert.doesNotMatch(schema[0],/DEFAULT|ADD COLUMN[^,\n]*NOT NULL|UPDATE/);
 assert.match(candidate,/TIME_CATALOG_NATIVE_ALREADY_INSTALLED/);
});
test('all10 modified bodies pin the original and keep the original GRH proof',()=>{
 const patches=nativeTimeDefinitions(original);assert.equal(patches.length,10);
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
 assert.match(body,/capabilities_native<>'\[\]'::jsonb OR NOT public\.tenant_iam_operational_person_pair_v1/);
 assert.match(timeFunction(candidate,'time_catalog_native_person_caps_v2').body,/tenant_iam_assert_no_sod_conflict\(member\)/);
});
test('writer retains the existing circuit outside explicit metadata and nominal-scope changes; list and geometry are preserved',()=>{
 const changed=NATIVE_TIME_PATCHES.map(([name])=>name);
 const body=timeFunction(candidate,'time_catalog_apply_command_v1').body;
 let restored=body.replace("      'requestSha256', existing_event.command_hash,\n      'attemptKey', existing_event.idempotency_key,\n",'').replace("    'requestSha256', lower(p_command_hash),\n    'attemptKey', p_idempotency_key,\n",'');
 restored=restored.replace("    IF entry_row.catalog_kind='assignment' AND NOT COALESCE((context_value->>'assignmentReadAllowed')::boolean,false) THEN\n      RAISE EXCEPTION 'TIME_CATALOG_CAPABILITY_REQUIRED';\n    END IF;\n",'');
 restored=restored.replace("  IF target_kind='assignment' AND NOT COALESCE((context_value->>'assignmentReadAllowed')::boolean,false) THEN\n    RAISE EXCEPTION 'TIME_CATALOG_CAPABILITY_REQUIRED';\n  END IF;\n",'');
 restored=restored.replace("    IF target_kind='assignment' THEN\n      PERFORM public.payroll_fixed_registry_subject_by_contract_v1(context_value,(p_payload#>>'{spec,employmentContractId}')::uuid,true);\n    END IF;\n",'');
 restored=restored.replace("\n      OR (p_payload ? 'reference' AND (p_payload#>>'{reference,code}') IS DISTINCT FROM entry_row.reference_code)",'');
 restored=restored.replace('reason_code, reason_hash, reference_code,display_name,legal_reference','reason_code, reason_hash');
 restored=restored.replace("p_reason_code, lower(p_reason_hash),\n      p_payload#>>'{reference,code}',p_payload#>>'{reference,title}',p_payload#>>'{reference,legalReference}'","p_reason_code, lower(p_reason_hash)");
 restored=restored.replace("      display_name=CASE WHEN p_payload ? 'reference' THEN p_payload#>>'{reference,title}' ELSE display_name END,\n      legal_reference=CASE WHEN p_payload ? 'reference' THEN p_payload#>>'{reference,legalReference}' ELSE legal_reference END,\n",'');
 assert.equal(restored,timeFunction(original,'time_catalog_apply_command_v1').body.replace('  item jsonb;\n',''));
 assert.match(body,/'requestSha256', existing_event.command_hash/);assert.match(body,/'attemptKey', p_idempotency_key/);
 assert.match(timeFunction(candidate,'time_catalog_guard_draft_child_v1').body,/TG_TABLE_NAME = 'time_calendar_day' AND TG_OP <> 'DELETE' THEN\n    IF NEW.day_date/);
 for(const name of ['time_catalog_bootstrap_v1','time_catalog_list_v1','time_catalog_normalized_week_segments_v1'])assert.ok(!changed.includes(name));
 assert.doesNotMatch(candidate,/CREATE OR REPLACE FUNCTION (?:public\.)?(?:time_catalog_bootstrap_v1|time_catalog_list_v1|time_catalog_normalized_week_segments_v1)\(/);
 assert.match(candidate,/FROM PUBLIC,municontrol_actions_runtime_app/);
 assert.match(candidate,/has_function_privilege\('municontrol_actions_runtime_app',p.oid,'EXECUTE'\) IS NOT DISTINCT FROM item.runtime_execute/);
});
test('opaque projected scope includes binding, actor contract and authority without publishing those identifiers',()=>{
 const body=timeFunction(candidate,'time_catalog_principal_projection_v1').body;
 for(const name of ['tenantId','membershipId','certifiedBindingId','authorityVersion','actorPersonId','employmentContractId','roleKey','capabilities','assignmentReadAllowed'])assert.match(body,new RegExp("p_context->>?'"+name+"'"));
 assert.match(body,/encode\(public\.digest\(jsonb_build_array/);assert.match(body,/'actorPersonId','actorEmail'/);
});
test('an ambiguous or changed source cannot be generated silently',()=>{
 assert.throws(()=>nativeTimeDefinitions(original+'\n'+timeFunction(original,'time_catalog_assert_actor_authority_v1').definition),/AMBIGUOUS/);
 assert.throws(()=>nativeTimeDefinitions(original.replace('  related_membership_id uuid;','  renamed_member uuid;')),/PATCH_DRIFT/);
});
test('integration uses real writers, both source origins, period gap and a separate-connection lock',()=>{
 const qa=buildNativeTimeCatalogQa({serverMajor:17,requireConcurrency:true});
 assert.equal(qa.report.timeCatalogChecksPassed,56);assert.equal(qa.report.checksPassed,591);
 assert.match(qa.sql,/native_time_catalog_qa/);assert.match(qa.sql,/TIME_CATALOG_NATIVE_PERIOD_INVALID/);
 assert.match(qa.sql,/time_catalog_apply_command_v1/);assert.match(qa.sql,/native_employee_create_v1/);
 assert.match(qa.sql,/p_catalog_kind=>/);assert.match(qa.sql,/p_command_hash=>/);
 assert.match(qa.sql,/tenant_iam_assert_no_sod_conflict/);
 assert.doesNotMatch(qa.sql,/undefined/);
 assert.doesNotMatch(qa.sql,/"config":\["search_path=pg_catalog, public, pg_temp"/);
 assert.match(qa.lockSql,/native-employment-lifecycle:v1:/);
 assert.match(qa.sql,/ROLLBACK/);assert.doesNotMatch(qa.sql,/COMMIT;/);
});
test('synthetic identity inputs satisfy the existing canonical DNI/CUIL contract',()=>{
 const qa=read('scripts/verify-native-time-catalog-sql.mjs');
 const subjects=[...qa.matchAll(/'dni','([0-9]{8})','cuil','([0-9]{11})'/g)];assert.equal(subjects.length,3);
 for(const [,dni,cuil] of subjects){assert.equal(validCuil(cuil),true);assert.equal(cuil.slice(2,10),dni);}
});
