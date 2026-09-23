// Disposable PostgreSQL 17/18 only. Real 026+029+032+097, 067/093/095 and 101;
// inherited IAM capability/SoD fixtures are declared by the existing harness.
// Every synthetic schema and write is inside the outer rollback transaction.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildNativeJurisdictionQa} from './verify-native-jurisdiction-sql.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const j=x=>q(JSON.stringify(x))+'::jsonb';
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=n=>fs.readFileSync(path.join(root,'scripts/migrations',n),'utf8').replaceAll('\r\n','\n');
export function buildNativeMonthlyQa({serverMajor,requireConcurrency=false}){
 const base=buildNativeJurisdictionQa({serverMajor,requireConcurrency});const{schema,ids}=base;
 const contentionKey=randomUUID();
 const nativeLock=`hashtextextended(${q(ids.tenant+':'+ids.maker+':'+contentionKey)},0)`;
 const finishSignal=`hashtextextended(${q('native-monthly-qa-finished:'+randomUUID())},0)`;
 const migration=read('101-native-monthly-novelties.sql');
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replaceAll("ARRAY['search_path=public, pg_temp']",`ARRAY['search_path=pg_catalog, ${schema}, public, pg_temp']`)
  .replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp']",`ARRAY['search_path=pg_catalog, ${schema}, public, pg_temp']`)
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const install=q(relocate(migration));
 const patch097=/DO \$patch_4\$[\s\S]+?\$patch_4\$;/.exec(read('097-grh-effective-consumers.sql'))?.[0];assert.ok(patch097);
 // Namespace relocation is the only QA difference; the production source body
 // is normalized back before evaluating the exact original 097 hash pins.
 let effectivePatch=relocate(patch097)
  .replaceAll("replace(prosrc, E'\\r\\n', E'\\n')",`replace(replace(prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`)
  .replaceAll("replace(prosrc,E'\\r\\n',E'\\n')",`replace(replace(prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`)
  .replace("proconfig=ARRAY['search_path=public, pg_temp']",`proconfig=ARRAY['search_path=pg_catalog, ${schema}, public, pg_temp']`);
 const originals=['026-governed-payroll-novelties.sql','029-payroll-novelty-first-fortnight.sql','032-payroll-type-mapping-fail-closed.sql'];
 const setup=`
 ALTER TABLE iam_role ADD PRIMARY KEY(role_key);
 INSERT INTO iam_role VALUES('QA_ROLE','tenant');
 CREATE TABLE employment_movement(employment_contract_id uuid,source_batch_id uuid,source_system text,movement_period date,concept_source_id text,cost_center_source_id text,quantity numeric,amount numeric,movement_type text,payroll_type text);
 -- Typed fixture projection only: no replacement of a writer or auth guard.
 CREATE VIEW grh_effective_employment_movement_v1 AS SELECT * FROM employment_movement;
 ${originals.map(n=>`EXECUTE ${q(relocate(read(n)))};`).join('\n')}
 EXECUTE ${q(effectivePatch)};
 `;
 const statements=[];let checks=0;
 const exec=s=>statements.push(s);
 const ok=(s,label)=>{statements.push(`PERFORM qa_assert((${s}),${q(label)}); checks:=checks+1;`);checks++;};
 const rejects=(sql,error,label)=>ok(`qa_rejects(${sql},${q(error)})`,label);
 const fault=(mutation,body)=>exec(`BEGIN ${mutation} ${body} RAISE EXCEPTION USING ERRCODE='P1012',MESSAGE='RESTORE_NATIVE_MONTHLY_FAULT'; EXCEPTION WHEN SQLSTATE 'P1012' THEN NULL; END;`);
 const prep=(r='monthly_rows',key='prepare_key',actor='maker',version=2,period="DATE '2026-10-01'",mode="'individual'",type="'monthly'")=>`payroll_novelty_prepare_v${version}(${actor},${mode},${period},${type},${r},${key},repeat('a',64))`;
 const prepReject=(r,error,label,{actor='maker',key='gen_random_uuid()',period="'2026-10-01'",mode="'individual'",type="'monthly'"}={})=>rejects(`format('SELECT payroll_novelty_prepare_v2(%L::jsonb,%L,%L::date,%L,%L::jsonb,%L::uuid,%L)',${actor},${mode},${period},${type},${r},${key},repeat('a',64))`,'PAYROLL_NOVELTY_'+error,label);
 const tx=(actor,command,version,key='gen_random_uuid()',reference='NULL',batch='monthly_id',sqlversion=2)=>`payroll_novelty_transition_v${sqlversion}(${actor},${batch},'${command}',${version},'${{submit:'ready_for_review',approve:'validated_for_export',reject:'invalid_rows',cancel:'cancelled_by_preparer'}[command]}',${reference},${key},repeat('b',64))`;
 const txReject=(actor,command,version,error,label,{key='gen_random_uuid()',reference='NULL',batch='monthly_id',sqlversion=2}={})=>rejects(`format('SELECT payroll_novelty_transition_v${sqlversion}(%L::jsonb,%L::uuid,%L,%L::integer,%L,%L,%L::uuid,%L)',${actor},${batch},'${command}',${version},'${{submit:'ready_for_review',approve:'validated_for_export',reject:'invalid_rows',cancel:'cancelled_by_preparer'}[command]}',${reference},${key},repeat('b',64))`,'PAYROLL_NOVELTY_'+error,label);
 const readReject=(op,error,label,actor='maker',batch='monthly_id',version=2)=>rejects(`format('SELECT payroll_novelty_${op}_v${version}(%L::jsonb,%L::uuid)',${actor},${batch})`,'PAYROLL_NOVELTY_'+error,label);
 const baseRow={rowOrdinal:1,legajo:'903',conceptSourceId:'80',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:'1.5',amountCents:null,movementType:null,legalInstrument:'Referencia administrativa de ensayo',observation:null,forced:false};
 exec(`grh_rows:=${j([baseRow])};grh_key_monthly:=gen_random_uuid();
 grh_before:=${prep('grh_rows','grh_key_monthly','maker',1)};
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 SELECT md5(string_agg(p.prosrc||coalesce(p.proacl::text,'')||p.proowner::text,E'\n' ORDER BY p.oid)) INTO untouched_before FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname IN ('payroll_novelty_prepare_v1','payroll_novelty_assert_context_v1','payroll_fixed_registry_subject_by_contract_v1','native_employee_create_v1','native_employee_receipt_v1');
 ALTER ROLE municontrol_actions_runtime_app LOGIN;
 EXECUTE ${install};
 SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\n' ORDER BY p.oid)) INTO installed_before FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace;
 ALTER ROLE municontrol_actions_runtime_app NOLOGIN;
 EXECUTE ${install};`);
 for(const flag of ['SUPERUSER','BYPASSRLS']){
  const start=statements.length;rejects(install,'PAYROLL_NOVELTY_NATIVE_PREREQUISITE','101 rejects runtime '+flag+' regardless of LOGIN');
  fault(`ALTER ROLE municontrol_actions_runtime_app ${flag};`,statements.splice(start).join('\n'));
 }
 for(const table of ['payroll_novelty_batch','payroll_novelty_row','payroll_novelty_issue','payroll_novelty_event']){
  const start=statements.length;rejects(install,'PAYROLL_NOVELTY_NATIVE_PREREQUISITE','101 rejects missing RLS on installed '+table);
  fault(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`,statements.splice(start).join('\n'));
 }
 for(const [mutation,label]of [
 ['ALTER TABLE payroll_novelty_row DROP CONSTRAINT payroll_novelty_row_native_pair_ck; ALTER TABLE payroll_novelty_row ADD CONSTRAINT payroll_novelty_row_native_pair_ck CHECK(true);','altered provenance pair constraint'],
 ['ALTER TABLE payroll_novelty_batch DROP CONSTRAINT payroll_novelty_batch_contract_ck; ALTER TABLE payroll_novelty_batch ADD CONSTRAINT payroll_novelty_batch_contract_ck CHECK(true);','altered batch version constraint'],
 ['ALTER TABLE payroll_novelty_row DROP CONSTRAINT payroll_novelty_row_native_fk;','missing registration foreign key'],
 ['ALTER TABLE payroll_novelty_row ALTER COLUMN subject_snapshot SET DEFAULT \'{}\'::jsonb;','invented subject default'],
 ['DROP TRIGGER payroll_novelty_row_guard_v1 ON payroll_novelty_row;','missing immutable row trigger'],
 ['DROP TRIGGER payroll_novelty_batch_audit_required_v1 ON payroll_novelty_batch; CREATE CONSTRAINT TRIGGER payroll_novelty_batch_audit_required_v1 AFTER INSERT OR UPDATE ON payroll_novelty_batch NOT DEFERRABLE FOR EACH ROW EXECUTE FUNCTION payroll_novelty_require_audit_v1();','audit no longer deferred'],
 ['GRANT EXECUTE ON FUNCTION payroll_novelty_native_current_v2(jsonb,uuid,boolean) TO PUBLIC;','public private-helper execution'],
 ['GRANT EXECUTE ON FUNCTION payroll_novelty_native_current_v2(jsonb,uuid,boolean) TO municontrol_actions_runtime_app;','runtime private-helper execution'],
 ['ALTER FUNCTION payroll_novelty_prepare_v2(jsonb,text,date,text,jsonb,uuid,text) SET search_path=pg_temp;','altered function search path'],
 ['CREATE POLICY qa_unexpected ON payroll_novelty_row USING(true);','unreviewed row policy']
 ]){
  const start=statements.length;rejects(install,'PAYROLL_NOVELTY_NATIVE_PREREQUISITE','101 rejects '+label);
  fault(mutation,statements.splice(start).join('\n'));
 }
 ok(`installed_before=(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace)`,'101 reapplies with exact definitions, ACL and owners');
 ok(`untouched_before=(SELECT md5(string_agg(p.prosrc||coalesce(p.proacl::text,'')||p.proowner::text,E'\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname IN ('payroll_novelty_prepare_v1','payroll_novelty_assert_context_v1','payroll_fixed_registry_subject_by_contract_v1','native_employee_create_v1','native_employee_receipt_v1'))`,'101 preserves original monthly prepare/context, native 095 writer and 093 resolver byte for byte');
 ok(`(${prep('grh_rows','grh_key_monthly','maker',1)}-'replayed')=(grh_before-'replayed')`,'pre-101 GRH replay preserves the historical receipt');
 ok(`payroll_novelty_employee_v2(maker,${q(ids.targetContract)}::uuid)->'subject'=grh_subject`,'UUID getter preserves exact five-key GRH subject');
 ok("payroll_novelty_employee_v2(maker,native_contract)->'subject'=native_subject",'UUID getter preserves exact eight-key native subject');
 readReject('employee','CONTRACT_NOT_FOUND','another tenant cannot select native UUID','outsider','native_contract');
 readReject('employee','CONTRACT_NOT_FOUND','foreign contract is hidden', 'maker',q(ids.foreignContract)+'::uuid');
 exec(`monthly_rows:=jsonb_build_array((grh_rows->0)||jsonb_build_object('legajo',native_subject->>'legajo','contractId',native_contract,'identityToken',native_subject->>'identityToken'));
 prepare_receipt:=${prep()};monthly_id:=(prepare_receipt#>>'{data,id}')::uuid;`);
 ok("prepare_receipt#>>'{data,contractVersion}'='payroll-novelty-batch.v2' AND prepare_receipt#>>'{data,rows,0,employmentContractId}'=native_contract::text AND prepare_receipt#>'{data,rows,0,subject}'=native_subject AND NOT (prepare_receipt#>'{data,rows,0}' ? 'identityCurrent')",'prepare receipt stores native provenance without dynamic identity claims');
 ok("(SELECT native_registration_id=(native_subject->>'registrationId')::uuid AND subject_snapshot=native_subject FROM payroll_novelty_row WHERE batch_id=monthly_id)",'native provenance uses real registration FK and immutable closed snapshot');
 ok("payroll_novelty_detail_v2(maker,monthly_id)#>>'{data,rows,0,identityCurrent}'='true'",'fresh detail reports current native identity');
 if(requireConcurrency){
  ok(`EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND granted AND pid<>pg_backend_pid() AND classid=((${nativeLock}>>32)&4294967295)::oid AND objid=(${nativeLock}&4294967295)::oid)`,'independent backend holds the native actor command lock');
  prepReject('monthly_rows','SESSION_BUSY','native prepare waits for the independent actor lock and makes no new record',{key:q(contentionKey)+'::uuid'});
  txReject('maker','submit',1,'SESSION_BUSY','native transition cannot bypass another actor command lock',{key:q(contentionKey)+'::uuid'});
  ok("(SELECT count(*)=1 FROM payroll_novelty_event WHERE batch_id=monthly_id) AND (SELECT status='draft' AND version=1 FROM payroll_novelty_batch WHERE id=monthly_id)",'concurrent lock failures preserve exact draft and audit version');
 }
 ok("(SELECT jsonb_array_length(payroll_novelty_bootstrap_v1(maker)->'batches')=1) AND (SELECT jsonb_array_length(payroll_novelty_bootstrap_v2(maker)->'batches')=2)",'bootstrap v1 excludes v2 while v2 includes both contracts');
 ok("payroll_novelty_bootstrap_v2(maker)#>>'{limits,maxRows}'='500' AND payroll_novelty_bootstrap_v2(maker)#>>'{limits,native,maxRows}'='1' AND payroll_novelty_bootstrap_v2(maker)#>'{limits,payrollTypes}' ? 'first_fortnight'",'v2 adds native limits without reducing historical GRH limits');
 readReject('detail','VERSION_UNSUPPORTED','legacy detail rejects native batch','maker','monthly_id',1);
 readReject('export','VERSION_UNSUPPORTED','legacy export rejects native batch','maker','monthly_id',1);
 txReject('maker','submit',1,'VERSION_UNSUPPORTED','legacy transition rejects native batch',{sqlversion:1});
 prepReject('monthly_rows','DUPLICATE_BATCH','a new key cannot duplicate an active native batch');
 prepReject("jsonb_build_array((monthly_rows->0)||'{\"amountCents\":\"100\"}'::jsonb)",'IDEMPOTENCY_REUSE','same key cannot change native payload',{key:'prepare_key'});
 for(const [rows,error,label]of [
 ["jsonb_build_array((monthly_rows->0)-'identityToken')",'PREPARE_INVALID','missing identity token'],
 ["jsonb_build_array((monthly_rows->0)||jsonb_build_object('identityToken',repeat('0',64)))",'IDENTITY_CHANGED','changed identity token'],
 ["jsonb_build_array((monthly_rows->0)||'{\"legajo\":\"19002\"}'::jsonb)",'IDENTITY_CHANGED','legajo cannot override selected UUID'],
 ["jsonb_build_array((monthly_rows->0)||'{\"forced\":true}'::jsonb)",'PREPARE_INVALID','forced requires explicit amount and reason'],
 ["jsonb_build_array((grh_rows->0)||jsonb_build_object('contractId',grh_subject->>'contractId','identityToken',grh_subject->>'identityToken'))",'NATIVE_ONLY','native writer rejects GRH origin'],
 ["jsonb_build_array((monthly_rows->0)||'{\"adjustmentMonth\":\"2026-08-01\"}'::jsonb)",'PERIOD_OUTSIDE_EMPLOYMENT','adjustment month predates registration employment']
 ])prepReject(rows,error,label);
 prepReject('monthly_rows','PREPARE_INVALID','native bulk mode is forbidden',{mode:"'bulk'"});
 prepReject('monthly_rows','PREPARE_INVALID','native first fortnight is outside this slice',{type:"'first_fortnight'"});
 prepReject('monthly_rows','PERIOD_OUTSIDE_EMPLOYMENT','period before hire month is forbidden',{period:"'2026-08-01'"});
 exec(`submit_receipt:=${tx('maker','submit',1,'submit_key')};`);
 ok("submit_receipt#>>'{data,status}'='submitted' AND submit_receipt#>>'{data,version}'='2'",'native submit records exact next version');
 txReject('maker','approve',2,'MAKER_CHECKER_REQUIRED','maker cannot approve own native batch');
 txReject('same_person','approve',2,'MAKER_CHECKER_REQUIRED','another membership of same person cannot approve');
 txReject('unlinked','approve',2,'EMPLOYMENT_REQUIRED','unlinked checker cannot approve');
 txReject('checker','approve',1,'VERSION_CONFLICT','stale approval version is rejected');
 exec(`approval_receipt:=${tx('checker','approve',2,'approval_key')};`);
 ok("approval_receipt#>>'{data,status}'='approved' AND approval_receipt#>>'{data,version}'='3' AND approval_receipt#>>'{data,exportable}'='true'",'independent checker approves native administrative export');
 ok(`(${prep()}-'replayed')=(prepare_receipt-'replayed') AND (${tx('maker','submit',1,'submit_key')}-'replayed')=(submit_receipt-'replayed') AND (${tx('checker','approve',2,'approval_key')}-'replayed')=(approval_receipt-'replayed')`,'all native replays retain exact original receipts after later transitions');
 txReject('maker','submit',1,'VERSION_UNSUPPORTED','legacy transition cannot replay native receipt',{key:'submit_key',sqlversion:1});
 ok("payroll_novelty_export_v2(maker,monthly_id)->>'contractVersion'='payroll-novelty-export.v2' AND payroll_novelty_export_v2(maker,monthly_id)#>>'{data,rows,0,identityCurrent}'='true'",'approved export revalidates native identity and declares v2');
 readReject('detail','NOT_FOUND','foreign tenant cannot read native batch','outsider');
 readReject('export','NOT_EXPORTABLE','foreign tenant cannot export native batch','outsider');
 // Source changes are deliberately injected by the fixture owner and rolled back.
 for(const [mutation,label]of [
 [`ALTER TABLE person_identity DISABLE TRIGGER native_employee_person_guard; UPDATE person_identity SET full_name='Identidad de ensayo cambiada' WHERE id=(SELECT person_id FROM employment_contract WHERE id=native_contract); ALTER TABLE person_identity ENABLE TRIGGER native_employee_person_guard;`,'name'],
 [`ALTER TABLE employment_contract DISABLE TRIGGER employment_contract_batch_system; UPDATE employment_contract SET start_date='2026-09-15' WHERE id=native_contract; ALTER TABLE employment_contract ENABLE TRIGGER employment_contract_batch_system;`,'start date'],
 [`ALTER TABLE employment_contract DISABLE TRIGGER employment_contract_batch_system; UPDATE employment_contract SET source_payload='{}' WHERE id=native_contract; ALTER TABLE employment_contract ENABLE TRIGGER employment_contract_batch_system;`,'registration provenance'],
 [`UPDATE platform_tenant_source_binding SET verified=false WHERE id=${q(ids.binding)}::uuid;`,'binding']
 ]){
  const start=statements.length;
  if(label==='binding')readReject('detail','BINDING_REQUIRED','revoked binding rejects nominal detail');
  else{
   ok("payroll_novelty_detail_v2(maker,monthly_id)#>>'{data,rows,0,identityCurrent}'='false' AND payroll_novelty_detail_v2(maker,monthly_id)#>>'{data,canExport}'='false'",'fresh native read marks changed '+label);
   readReject('export','IDENTITY_CHANGED','export rejects changed '+label);
   ok(`(${prep()}-'replayed')=(prepare_receipt-'replayed')`,'authorized replay preserves receipt after changed '+label);
  }
  fault(mutation,statements.splice(start).join('\n'));
 }
 // Identity drift still permits controlled rejection and cancellation.
 const startDrift=statements.length;
 exec(`draft_receipt:=${prep("jsonb_build_array((monthly_rows->0)||'{\"amountCents\":\"321\"}'::jsonb)",'gen_random_uuid()')};drift_id:=(draft_receipt#>>'{data,id}')::uuid;
 result:=${tx('maker','submit',1,'gen_random_uuid()','NULL','drift_id')};
 ALTER TABLE person_identity DISABLE TRIGGER native_employee_person_guard; UPDATE person_identity SET full_name='Identidad de ensayo cambiada' WHERE id=(SELECT person_id FROM employment_contract WHERE id=native_contract); ALTER TABLE person_identity ENABLE TRIGGER native_employee_person_guard;`);
 txReject('checker','approve',2,'IDENTITY_CHANGED','fresh approval rejects changed target',{batch:'drift_id'});
 ok(`(${tx('checker','reject',2,'gen_random_uuid()',"'ref:'||gen_random_uuid()::text",'drift_id')}#>>'{data,status}')='rejected'`,'checker can reject obsolete identity without approving it');
 fault('',statements.splice(startDrift).join('\n'));
 const startCancel=statements.length;
 exec(`draft_receipt:=${prep("jsonb_build_array((monthly_rows->0)||'{\"amountCents\":\"322\"}'::jsonb)",'gen_random_uuid()')};drift_id:=(draft_receipt#>>'{data,id}')::uuid;
 ALTER TABLE person_identity DISABLE TRIGGER native_employee_person_guard; UPDATE person_identity SET full_name='Identidad de ensayo cambiada' WHERE id=(SELECT person_id FROM employment_contract WHERE id=native_contract); ALTER TABLE person_identity ENABLE TRIGGER native_employee_person_guard;`);
 txReject('maker','submit',1,'IDENTITY_CHANGED','fresh submit rejects changed target',{batch:'drift_id'});
 ok(`(${tx('maker','cancel',1,'gen_random_uuid()',"'ref:'||gen_random_uuid()::text",'drift_id')}#>>'{data,status}')='cancelled'`,'maker can cancel obsolete identity without submitting it');
 fault('',statements.splice(startCancel).join('\n'));
 for(const [mutation,error,label]of [
 [`UPDATE tenant_identity_session SET status='revoked' WHERE id=${q(ids.makerSession)}::uuid;`,'SESSION_INVALID','revoked session'],
 [`UPDATE tenant_action_authority SET tenant_id=${q(ids.foreignTenant)}::uuid WHERE membership_id=${q(ids.maker)}::uuid;`,'AUTHORITY_REQUIRED','removed authority'],
 [`DELETE FROM capabilities WHERE membership_id=${q(ids.maker)}::uuid AND capability_key='payroll.novelty.nominal.read';`,'NOMINAL_READ_REQUIRED','revoked nominal capability']
 ]){
  const start=statements.length;prepReject('monthly_rows',error,'replay fails under '+label,{key:'prepare_key'});
  txReject('maker','submit',1,error,'transition replay fails under '+label,{key:'submit_key'});
  if(label==='revoked nominal capability')ok("(SELECT bool_and(jsonb_array_length(x->'rows')=0 AND (x->>'canExport')::boolean=false AND jsonb_array_length(x->'allowedCommands')=0) FROM jsonb_array_elements(payroll_novelty_bootstrap_v2(maker)->'batches') x WHERE x->>'contractVersion'='payroll-novelty-batch.v2')",'redacted bootstrap contains neither subject nor available native writes');
  fault(mutation,statements.splice(start).join('\n'));
 }
 for(const name of ['prepare_v1','assert_context_v1','subject_v2','prepare_v2','augment_v2']){
  const start=statements.length;rejects(install,'PAYROLL_NOVELTY_NATIVE_PREREQUISITE','101 rejects altered '+name+' on reapplication');
  fault(`SELECT pg_get_functiondef(oid) INTO damaged FROM pg_proc WHERE pronamespace=${q(schema)}::regnamespace AND proname=${q('payroll_novelty_'+name)}; EXECUTE replace(damaged,'AS $function$',E'AS $function$\n-- 101 unauthorized drift');`,statements.splice(start).join('\n'));
 }
 rejects(`format('UPDATE payroll_novelty_row SET subject_snapshot=''{}'' WHERE batch_id=%L::uuid',monthly_id)`,'PAYROLL_NOVELTY_ROWS_IMMUTABLE','native stored subject cannot be updated');
 rejects(`format('DELETE FROM payroll_novelty_event WHERE batch_id=%L::uuid',monthly_id)`,'PAYROLL_NOVELTY_APPEND_ONLY','native audit cannot be deleted');
 exec(`SET CONSTRAINTS ALL IMMEDIATE;SET CONSTRAINTS ALL DEFERRED;
 SET LOCAL ROLE municontrol_actions_runtime_app;result:=payroll_novelty_detail_v2(maker,monthly_id);RESET ROLE;`);
 ok("result#>>'{data,rows,0,identityCurrent}'='true'",'real runtime role invokes nominal v2 through authenticated facade');
 for(const table of ['payroll_novelty_batch','payroll_novelty_row','payroll_novelty_event','payroll_novelty_issue'])ok(`NOT has_table_privilege('municontrol_actions_runtime_app',${q(schema+'.'+table)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AND (SELECT relrowsecurity FROM pg_class WHERE oid=${q(schema+'.'+table)}::regclass)`,'runtime direct access denied and RLS retained for '+table);
 for(const signature of ['native_subject_v2(jsonb,jsonb,date,boolean)','native_current_v2(jsonb,uuid,boolean)','augment_v2(jsonb,jsonb,boolean)','event_snapshot_v2(bigint,uuid,boolean)','require_v1_batch_v2(jsonb,uuid)'])ok(`NOT has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.payroll_novelty_'+signature)},'EXECUTE')`,'runtime cannot bypass facade through '+signature);
 ok(`NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname LIKE 'payroll_novelty_%_v2' AND a.grantee=0 AND a.privilege_type='EXECUTE')`,'all new functions revoke PUBLIC execute');
 ok("(SELECT bool_and(NOT grh_mutation AND NOT payroll_calculated AND NOT payroll_posted) FROM payroll_novelty_batch) AND (SELECT bool_and(NOT grh_mutation AND NOT payroll_calculated AND NOT payroll_posted) FROM payroll_novelty_event) AND (SELECT count(*)=0 FROM employment_movement)",'native cycle records no payroll calculation, payment or GRH movement');
 const block=`
 DECLARE monthly_rows jsonb; grh_rows jsonb; grh_before jsonb; grh_key_monthly uuid; prepare_receipt jsonb; submit_receipt jsonb; approval_receipt jsonb; draft_receipt jsonb;
 monthly_id uuid; drift_id uuid; prepare_key uuid:=gen_random_uuid(); submit_key uuid:=gen_random_uuid(); approval_key uuid:=gen_random_uuid(); untouched_before text; installed_before text; damaged text;
 BEGIN
 ${setup}
 ${statements.join('\n')}
 RAISE EXCEPTION USING ERRCODE='P1010',MESSAGE='RESTORE_NATIVE_MONTHLY_FIXTURES';
 EXCEPTION WHEN SQLSTATE 'P1010' THEN NULL;
 END;
 `;
 const anchor="RAISE EXCEPTION USING ERRCODE='P0930',MESSAGE='NATIVE_FIXED_QA_RESTORE_BASELINE';";
 assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,nativeMonthlyChecksPassed:checks,checksPassed:base.report.checksPassed+checks,nativeMonthlyConcurrentLockChecked:requireConcurrency,migration101Sha256:sha(migration),monthlyPrerequisites:originals.map(n=>({file:n,sha256:sha(read(n))})),limitations:[...base.report.limitations,'101 uses actual composed 026/029/032/097 functions, real native writers and a typed empty effective-movement projection. Core IAM capability resolution/SoD are the explicit inherited synthetic scaffold; this does not certify production IAM or payroll eligibility.','Native concurrency uses an independent connection holding the exact actor-command advisory lock; real prepare and transition must fail without mutation. Duplicate content and stale version rejection are exercised sequentially, not represented as simultaneous committed writers.']};
 let sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report)).replaceAll('fixed_novelties_qa','native_monthly_qa')
  .replace('CREATE SCHEMA '+schema+';',`CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;\n CREATE SCHEMA ${schema};`);
 if(requireConcurrency)sql=sql.replace(" PERFORM set_config('mc.native_monthly_qa_report'",`
 PERFORM pg_advisory_xact_lock(${finishSignal});
 DECLARE release_deadline timestamptz:=clock_timestamp()+interval '10 seconds'; BEGIN
  LOOP
   EXIT WHEN pg_try_advisory_xact_lock(${nativeLock});
   IF clock_timestamp()>release_deadline THEN RAISE EXCEPTION 'NATIVE_MONTHLY_QA_BLOCKER_RELEASE_TIMEOUT'; END IF;
   PERFORM pg_sleep(0.05);
  END LOOP;
 END;
 PERFORM set_config('mc.native_monthly_qa_report'`);
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql),'Synthetic public writes prohibited');
 const lockSql=base.lockSql.replaceAll('fixed_novelties_qa','native_monthly_qa').replace(" SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'",` SELECT pg_advisory_xact_lock(${nativeLock});\n SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'`)
  .replace(' SELECT pg_sleep(45);',` DO $hold$ DECLARE deadline timestamptz:=clock_timestamp()+interval '120 seconds'; BEGIN
   LOOP
    IF NOT pg_try_advisory_lock(${finishSignal}) THEN EXIT; END IF;
    PERFORM pg_advisory_unlock(${finishSignal});
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'NATIVE_MONTHLY_QA_MAIN_TIMEOUT'; END IF;
    PERFORM pg_sleep(0.05);
   END LOOP;
  END $hold$;`);
 return{...base,sql,report,lockSql};
}
function main(){
 const args={};for(const a of process.argv.slice(2)){
  if(a==='--ci'){args.ci=true;continue;}if(a==='--require-concurrency'){args.requireConcurrency=true;continue;}
  const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m,'Unknown or incomplete argument');assert.equal(args[m[1]],undefined);args[m[1]]=m[2];
 }
 assert.equal(args.ci,true,'Only disposable CI generation is supported');assert.ok(args['write-sql']);assert.ok(!args.requireConcurrency||args['write-lock-sql']);
 const test=buildNativeMonthlyQa({serverMajor:args['expected-major'],requireConcurrency:Boolean(args.requireConcurrency)});
 const outputs=[['write-sql',test.sql],['write-lock-sql',test.lockSql]].filter(([k])=>args[k]).map(([k,data])=>({output:path.resolve(args[k]),data}));assert.equal(new Set(outputs.map(x=>x.output)).size,outputs.length);
 for(const{output}of outputs)assert.ok(!fs.existsSync(output),'Output exists; choose a new path');
 for(const{output,data}of outputs){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:test.report.checksPassed,nativeMonthlyChecksPlanned:test.report.nativeMonthlyChecksPassed,migration101Sha256:test.report.migration101Sha256}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}
