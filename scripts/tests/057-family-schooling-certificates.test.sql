-- Run only on an explicitly restored local database. No nominal output; all fixtures roll back.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database()<>'restore_check' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  OR inet_server_port()<>55439 THEN RAISE EXCEPTION 'QA_SCHOOL_LOCAL_RESTORE_REQUIRED'; END IF;
 PERFORM set_config('qa.school_baseline',jsonb_build_array((SELECT count(*) FROM grh_family),(SELECT count(*) FROM employment_contract),
  (SELECT count(*) FROM internal_users),(SELECT count(*) FROM tenant_membership),(SELECT count(*) FROM tenant_identity_session),
  (SELECT count(*) FROM source_import_batch),(SELECT count(*) FROM school_certificate),(SELECT count(*) FROM school_certificate_blob),
  (SELECT count(*) FROM school_certificate_event),(SELECT count(*) FROM attendance_canonical_punch),
  (SELECT to_jsonb(p) FROM school_certificate_storage_policy p WHERE singleton))::text,false);
END $$;
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF current_database()<>'restore_check' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  OR inet_server_port()<>55439 THEN RAISE EXCEPTION 'QA_SCHOOL_LOCAL_RESTORE_REQUIRED'; END IF;
END $$;
-- Only the restore owner can raise this local fixture's physical cluster bound.
-- The production server's protected Neon ceiling still clamps any higher policy.
UPDATE school_certificate_storage_policy SET cluster_limit_bytes=2147483648 WHERE singleton;

CREATE FUNCTION pg_temp.qa_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'QA_SCHOOL_ASSERT_%',label; END IF; END $$;
CREATE FUNCTION pg_temp.qa_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN observed:=SQLERRM; END;
 IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'QA_SCHOOL_REJECTION_%',expected; END IF;
END $$;
CREATE FUNCTION pg_temp.qa_read(contract_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;
BEGIN RETURN school_certificate_read_v1(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,contract_id); END $$;
CREATE FUNCTION pg_temp.qa_register(payload jsonb,key text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;
BEGIN RETURN school_certificate_register_v1(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,payload,key); END $$;
CREATE FUNCTION pg_temp.qa_download(id uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;
BEGIN RETURN school_certificate_download_v1(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,id); END $$;

DO $$ DECLARE c record;b source_import_batch%ROWTYPE;person uuid:=gen_random_uuid();contract uuid:=gen_random_uuid();
 email text:='qa-school-'||gen_random_uuid()||'@example.invalid';membership uuid:=gen_random_uuid();session uuid:=gen_random_uuid();
 family bigint:=900000000057000001;key text;
BEGIN
 SELECT p.tenant_id,p.certified_release_sha,binding.id binding_id,binding.source_company_id,binding.source_database INTO c
 FROM tenant_identity_policy p JOIN platform_tenant_source_binding binding ON binding.id=p.certified_source_binding_id AND binding.tenant_id=p.tenant_id
 JOIN platform_tenant t ON t.id=p.tenant_id AND t.status='active'
 WHERE p.tenant_data_plane_ready AND binding.verified AND binding.source_system='GRH' ORDER BY p.tenant_id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'QA_SCHOOL_CERTIFIED_FIXTURE_REQUIRED'; END IF;
 SELECT sb.* INTO b FROM source_import_batch sb JOIN employment_contract ec ON ec.source_batch_id=sb.id
 WHERE sb.source_database=c.source_database AND sb.source_system='GRH' AND sb.validation_state='published'
  AND sb.legacy_import_run_id IS NOT NULL AND ec.legacy_company_id=c.source_company_id
  AND EXISTS(SELECT 1 FROM grh_catalog_rows cat WHERE cat.catalog='family_relationships' AND cat.import_run_id=sb.legacy_import_run_id
   AND cat.source_payload #>> '{sourceKey,relationshipId}'='2' AND cat.label='HIJO')
 ORDER BY sb.source_cutoff DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'QA_SCHOOL_PUBLISHED_FIXTURE_REQUIRED'; END IF;
 INSERT INTO internal_users(email,display_name,role,password_hash,active,auth_mode,identity_version)
 VALUES(email,'QA escolar sintético','EMPLEADO',NULL,true,'managed',1);
 INSERT INTO tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at)
 VALUES(membership,c.tenant_id,email,'JUNIN_ASISTENCIA_REVISOR','active',email,now());
 INSERT INTO tenant_action_authority(membership_id,tenant_id) VALUES(membership,c.tenant_id) ON CONFLICT DO NOTHING;
 INSERT INTO tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,status,device_label,last_seen_at,expires_at)
 VALUES(session,email,c.tenant_id,'membership','mfa',1,1,'active','QA rollback',now(),now()+interval '1 hour');
 FOREACH key IN ARRAY ARRAY['actions.read','workforce.employee.read','employee.record.propose'] LOOP
  INSERT INTO tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email)
  VALUES(membership,key,true,false,'Fixture sintética rollback obligatorio',email);
 END LOOP;
 INSERT INTO person_identity(id,full_name) VALUES(person,'Persona QA escolar');
 INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status)
 VALUES(contract,person,'GRH',b.id,c.source_company_id,'9999995701','active');
 INSERT INTO employment_status_snapshot(employment_contract_id,snapshot_date,administrative_status,payroll_status,source_system,source_batch_id)
 VALUES(contract,b.source_cutoff::date,'active','not_applicable','GRH',b.id);
 INSERT INTO grh_family(family_id,company_id,legajo,nombre,fecha_nacimiento,vinculo_code,import_run_id)
 VALUES(family,c.source_company_id,'9999995701','Hijo QA escolar','2012-02-29','2',b.legacy_import_run_id),
  (family+1,c.source_company_id,'9999995701','Prenatal QA excluido',NULL,'9',b.legacy_import_run_id);
 PERFORM set_config('qa.school_context',jsonb_build_object('email',email,'session',session,'release',btrim(c.certified_release_sha),
  'tenant',c.tenant_id,'binding',c.binding_id,'membership',membership,'contract',contract,'person',person,'family',family::text,
  'batch',b.id,'import',b.legacy_import_run_id,'cutoff',b.source_cutoff,'database',c.source_database,'company',c.source_company_id)::text,true);
 PERFORM set_config('qa.school_foreign_family',(SELECT min(family_id)::text FROM grh_family WHERE legajo<>'9999995701'),true);
END $$;

SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;r jsonb;row_value jsonb;payload jsonb;a jsonb;other jsonb;pdf bytea:=convert_to(E'%PDF-1.7\nQA synthetic SQL fixture\n%%EOF\n','UTF8');
BEGIN
 r:=pg_temp.qa_read((c->>'contract')::uuid);
 PERFORM pg_temp.qa_assert(r->>'version'='family-schooling.v1' AND r#>>'{scope,cohort}'='contract_children','read_contract_shape');
 PERFORM pg_temp.qa_assert((r->>'canRegister')::boolean AND jsonb_array_length(r->'rows')=1,'propose_without_employment_link');
 PERFORM pg_temp.qa_assert(r#>>'{storage,mode}'='database_pilot' AND r#>>'{storage,capacityBytes}'='8388608'
  AND (r#>>'{storage,remainingBytes}')::bigint>=0 AND (r#>>'{storage,usedBytes}')::bigint>=0,'bounded_pilot_storage_contract');
 row_value:=r->'rows'->0;
 PERFORM pg_temp.qa_assert(NOT row_value ? 'personId' AND row_value->>'familyId'=c->>'family' AND row_value->>'familyName'='Hijo QA escolar'
  AND row_value->>'birthDate'='2012-02-29' AND row_value->>'certificate' IS NULL AND (row_value->>'historyCount')::integer=0,'source_identity_no_personid');
 r:=pg_temp.qa_read();
 PERFORM pg_temp.qa_assert(r#>>'{scope,cohort}'='administrative_active_with_children'
  AND r#>>'{scope,currentCensusCertified}'='false' AND r#>>'{scope,payrollEligibilityCertified}'='false','scope_disclaimers');
 PERFORM pg_temp.qa_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') x WHERE x->>'contractId'=c->>'contract'),'active_child_in_cohort');
 payload:=jsonb_build_object('contractId',c->>'contract','familyId',c->>'family','identityToken',row_value->>'identityToken',
  'filename','certificado.pdf','contentBase64',replace(encode(pdf,'base64'),E'\n',''),'sha256',encode(digest(pdf,'sha256'),'hex'),
  'presentedOn','2026-09-14','expiresOn','2025-12-31');
 a:=pg_temp.qa_register(payload,'qa-school-first');other:=pg_temp.qa_register(payload,'qa-school-first');
 PERFORM pg_temp.qa_assert(a->>'version'='family-schooling-register.v1' AND a->>'duplicate'='false'
  AND other->>'duplicate'='true' AND a->>'certificateId'=other->>'certificateId','durable_replay');
 other:=pg_temp.qa_download((a->>'certificateId')::uuid);
 PERFORM pg_temp.qa_assert(other->>'contentBase64'=payload->>'contentBase64' AND other->>'sha256'=payload->>'sha256'
  AND (other->>'byteLength')::integer=octet_length(pdf),'download_exact_bytes');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||'{"filename":"otro.pdf"}'::jsonb,'qa-school-first'),'SCHOOL_CERTIFICATE_IDEMPOTENCY_REUSE');
 other:=pg_temp.qa_register(payload||'{"filename":"version2.pdf","expiresOn":null}'::jsonb,'qa-school-second');
 r:=pg_temp.qa_read((c->>'contract')::uuid);row_value:=r->'rows'->0;
 PERFORM pg_temp.qa_assert((row_value->>'historyCount')::integer=2 AND row_value#>>'{certificate,id}'=other->>'certificateId'
  AND row_value#>>'{certificate,expiresOn}' IS NULL,'latest_version_preserves_history');
 PERFORM set_config('qa.school_payload',payload::text,true);PERFORM set_config('qa.school_certificate',a->>'certificateId',true);
 -- Also exercised with this unrelated family row locked by a second real connection.
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||jsonb_build_object('familyId',current_setting('qa.school_foreign_family')),'qa-foreign-family'),'SCHOOL_CERTIFICATE_NOT_FOUND');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||'{"unexpected":true}'::jsonb,'qa-invalid-extra'),'SCHOOL_CERTIFICATE_INVALID_PAYLOAD');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||'{"filename":"../escape.pdf"}'::jsonb,'qa-invalid-path'),'SCHOOL_CERTIFICATE_INVALID_PAYLOAD');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||jsonb_build_object('filename',E'C:\\escape.pdf'),'qa-invalid-winpath'),'SCHOOL_CERTIFICATE_INVALID_PAYLOAD');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||jsonb_build_object('identityToken',repeat('0',64)),'qa-stale'),'SCHOOL_CERTIFICATE_IDENTITY_CHANGED');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||'{"presentedOn":"2026-02-30"}'::jsonb,'qa-invalid-date'),'SCHOOL_CERTIFICATE_DATES_INVALID');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||'{"expiresOn":"1899-12-31"}'::jsonb,'qa-invalid-range'),'SCHOOL_CERTIFICATE_DATES_INVALID');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||jsonb_build_object('contentBase64',repeat('A',2796205)),'qa-oversized'),'SCHOOL_CERTIFICATE_TOO_LARGE');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||jsonb_build_object('contentBase64',E'\n'||(payload->>'contentBase64')),'qa-base64'),'SCHOOL_CERTIFICATE_PDF_INVALID');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||jsonb_build_object('sha256',repeat('0',64)),'qa-sha'),'SCHOOL_CERTIFICATE_PDF_INVALID');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload||jsonb_build_object('contentBase64',encode(convert_to('not a PDF document','UTF8'),'base64'),'sha256',encode(digest(convert_to('not a PDF document','UTF8'),'sha256'),'hex')),'qa-magic'),'SCHOOL_CERTIFICATE_PDF_INVALID');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_download(%L::uuid)',gen_random_uuid()),'SCHOOL_CERTIFICATE_NOT_FOUND');
END $$;
RESET ROLE;

DO $$ DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;t text;
BEGIN
 PERFORM pg_temp.qa_assert((SELECT count(*)=1 FROM school_certificate_blob WHERE tenant_id=(c->>'tenant')::uuid
  AND sha256=current_setting('qa.school_payload')::jsonb->>'sha256'),'blob_deduplicated_in_tenant');
 PERFORM pg_temp.qa_assert((SELECT count(*)=2 FROM school_certificate WHERE contract_id=(c->>'contract')::uuid),'versions_append_only');
 PERFORM pg_temp.qa_assert((SELECT count(*)>=6 FROM school_certificate_event WHERE actor_membership_id=(c->>'membership')::uuid),'reads_writes_download_audited');
 FOREACH t IN ARRAY ARRAY['school_certificate','school_certificate_blob','school_certificate_event'] LOOP
  PERFORM pg_temp.qa_assert(NOT has_table_privilege('municontrol_actions_runtime_app',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'runtime_no_tables_'||t);
  PERFORM pg_temp.qa_error(format('UPDATE %I SET recorded_at=recorded_at',t),'SCHOOL_CERTIFICATE_IMMUTABLE');
 END LOOP;
 PERFORM pg_temp.qa_error('TRUNCATE school_certificate,school_certificate_blob,school_certificate_event','SCHOOL_CERTIFICATE_IMMUTABLE');
 PERFORM pg_temp.qa_assert(NOT has_function_privilege('municontrol_actions_runtime_app','school_certificate_current_family_v1(jsonb,uuid)','EXECUTE')
  AND NOT has_function_privilege('municontrol_actions_runtime_app','school_certificate_context_v1(text,uuid,integer,text,uuid,uuid,boolean,text)','EXECUTE'),'helpers_private');
 PERFORM pg_temp.qa_assert(NOT has_table_privilege('municontrol_actions_runtime_app','school_certificate_storage_policy','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  AND NOT has_function_privilege('municontrol_actions_runtime_app','school_certificate_storage_capacity_v1()','EXECUTE')
  AND NOT has_function_privilege('municontrol_actions_runtime_app','school_certificate_storage_reserve_v1(uuid,text,integer)','EXECUTE'),'storage_policy_private');
END $$;

SAVEPOINT closed_quota_test;
UPDATE school_certificate_storage_policy SET pdf_quota_bytes=0 WHERE singleton;
SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;r jsonb;BEGIN
 r:=pg_temp.qa_read((c->>'contract')::uuid);
 PERFORM pg_temp.qa_assert(r->>'canRegister'='false' AND r#>>'{storage,remainingBytes}'='0'
  AND r#>>'{storage,capacityBytes}'='0' AND (r#>>'{storage,usedBytes}')::bigint>0
  AND r#>>'{rows,0,historyCount}'='2','closed_quota_preserves_reads_and_history');
 PERFORM pg_temp.qa_assert(pg_temp.qa_register(current_setting('qa.school_payload')::jsonb,'qa-school-first')->>'duplicate'='true','closed_quota_keeps_replay');
 PERFORM pg_temp.qa_download(current_setting('qa.school_certificate')::uuid);
 PERFORM pg_temp.qa_error('SELECT pg_temp.qa_register(current_setting(''qa.school_payload'')::jsonb,''qa-closed-quota'')','SCHOOL_CERTIFICATE_STORAGE_FULL');
 -- Custom client variables are irrelevant to the owner-only policy.
 PERFORM set_config('school_certificate.pdf_quota_bytes','999999999999',true);
 PERFORM set_config('school_certificate.cluster_limit_bytes','999999999999',true);
 IF NOT EXISTS(SELECT 1 FROM pg_settings WHERE name='neon.max_cluster_size') THEN
  PERFORM set_config('neon.max_cluster_size','999999999MB',true);
 END IF;
 PERFORM pg_temp.qa_error('SELECT pg_temp.qa_register(current_setting(''qa.school_payload'')::jsonb,''qa-guc-bypass'')','SCHOOL_CERTIFICATE_STORAGE_FULL');
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT closed_quota_test;

SAVEPOINT dedup_quota_test;
UPDATE school_certificate_storage_policy SET pdf_quota_bytes=(SELECT sum(byte_length) FROM school_certificate_blob) WHERE singleton;
SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE before_read jsonb;after_read jsonb;BEGIN
 before_read:=pg_temp.qa_read((current_setting('qa.school_context')::jsonb->>'contract')::uuid);
 PERFORM pg_temp.qa_assert(before_read->>'canRegister'='false','unique_quota_exhausted_visible');
 PERFORM pg_temp.qa_register(current_setting('qa.school_payload')::jsonb||'{"filename":"deduplicated-version.pdf"}'::jsonb,'qa-dedup-quota');
 after_read:=pg_temp.qa_read((current_setting('qa.school_context')::jsonb->>'contract')::uuid);
 PERFORM pg_temp.qa_assert(before_read#>>'{storage,usedBytes}'=after_read#>>'{storage,usedBytes}' AND after_read#>>'{rows,0,historyCount}'='3','duplicate_blob_never_counted_twice');
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT dedup_quota_test;

SAVEPOINT full_unique_quota_test;
UPDATE school_certificate_storage_policy SET pdf_quota_bytes=(SELECT sum(byte_length) FROM school_certificate_blob) WHERE singleton;
SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE bytes bytea:=convert_to(E'%PDF-1.7\nNew synthetic content\n%%EOF\n','UTF8');payload jsonb;BEGIN
 payload:=current_setting('qa.school_payload')::jsonb||jsonb_build_object('contentBase64',replace(encode(bytes,'base64'),E'\n',''),'sha256',encode(digest(bytes,'sha256'),'hex'));
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_register(%L::jsonb,%L)',payload,'qa-no-unique-capacity'),'SCHOOL_CERTIFICATE_STORAGE_FULL');
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT full_unique_quota_test;

SAVEPOINT physical_cluster_test;
-- Leave less than the required 16KiB metadata allowance, even for a reused blob.
UPDATE school_certificate_storage_policy SET cluster_limit_bytes=(SELECT sum(pg_database_size(oid))::bigint FROM pg_database)+cluster_reserve_bytes+8192 WHERE singleton;
SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE r jsonb;BEGIN
 r:=pg_temp.qa_read((current_setting('qa.school_context')::jsonb->>'contract')::uuid);
 PERFORM pg_temp.qa_assert(r->>'canRegister'='false' AND r#>>'{storage,remainingBytes}'='0'
  AND (r#>>'{storage,usedBytes}')::bigint<(r#>>'{storage,capacityBytes}')::bigint,'physical_cluster_reserve_detected');
 PERFORM pg_temp.qa_error('SELECT pg_temp.qa_register(current_setting(''qa.school_payload'')::jsonb,''qa-physical-full'')','SCHOOL_CERTIFICATE_STORAGE_FULL');
 PERFORM pg_temp.qa_assert(pg_temp.qa_register(current_setting('qa.school_payload')::jsonb,'qa-school-first')->>'duplicate'='true','physical_full_keeps_replay');
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT physical_cluster_test;

SAVEPOINT capability_test;
UPDATE tenant_membership_capability_override SET allow_override=false,deny_override=true WHERE membership_id=(current_setting('qa.school_context')::jsonb->>'membership')::uuid AND capability_key='employee.record.propose';
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(pg_temp.qa_read((current_setting('qa.school_context')::jsonb->>'contract')::uuid)->>'canRegister'='false','read_only_capability');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_register(current_setting(''qa.school_payload'')::jsonb,''qa-denied'')','SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED');
RESET ROLE;
UPDATE tenant_membership_capability_override SET allow_override=false,deny_override=true WHERE membership_id=(current_setting('qa.school_context')::jsonb->>'membership')::uuid AND capability_key='workforce.employee.read';
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read()','SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED');
RESET ROLE;
ROLLBACK TO SAVEPOINT capability_test;

SAVEPOINT session_test;
UPDATE tenant_identity_session SET status='revoked',version=version+1,revoked_at=clock_timestamp(),revoked_by_user_email=current_setting('qa.school_context')::jsonb->>'email' WHERE id=(current_setting('qa.school_context')::jsonb->>'session')::uuid;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read()','SCHOOL_CERTIFICATE_SESSION_INVALID');
RESET ROLE;
ROLLBACK TO SAVEPOINT session_test;

SAVEPOINT release_test;
DO $$ BEGIN PERFORM set_config('qa.school_context',(current_setting('qa.school_context')::jsonb||jsonb_build_object('release',repeat('a',40)))::text,true); END $$;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read()','SCHOOL_CERTIFICATE_RELEASE_NOT_CERTIFIED');
RESET ROLE;
ROLLBACK TO SAVEPOINT release_test;

SAVEPOINT tenant_test;
DO $$ BEGIN PERFORM set_config('qa.school_context',(current_setting('qa.school_context')::jsonb||jsonb_build_object('tenant',gen_random_uuid()))::text,true); END $$;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read()','SCHOOL_CERTIFICATE_SESSION_INVALID');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_download(current_setting(''qa.school_certificate'')::uuid)','SCHOOL_CERTIFICATE_SESSION_INVALID');
RESET ROLE;
ROLLBACK TO SAVEPOINT tenant_test;

SAVEPOINT binding_test;
UPDATE platform_tenant_source_binding SET verified=false,verified_at=NULL WHERE id=(current_setting('qa.school_context')::jsonb->>'binding')::uuid;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read()','SCHOOL_CERTIFICATE_SOURCE_BINDING_REQUIRED');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_download(current_setting(''qa.school_certificate'')::uuid)','SCHOOL_CERTIFICATE_SOURCE_BINDING_REQUIRED');
RESET ROLE;
ROLLBACK TO SAVEPOINT binding_test;

SAVEPOINT source_mapping_test;
UPDATE grh_catalog_rows SET label='PRENATAL' WHERE catalog='family_relationships' AND source_payload #>> '{sourceKey,relationshipId}'='2';
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read((current_setting(''qa.school_context'')::jsonb->>''contract'')::uuid)','SCHOOL_CERTIFICATE_SOURCE_MAPPING_DRIFT');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_register(current_setting(''qa.school_payload'')::jsonb,''qa-catalog-drift'')','SCHOOL_CERTIFICATE_SOURCE_MAPPING_DRIFT');
RESET ROLE;
ROLLBACK TO SAVEPOINT source_mapping_test;

SAVEPOINT malformed_mapping_test;
UPDATE grh_catalog_rows SET source_key='QA invalid JSON source key' WHERE catalog='family_relationships' AND source_payload #>> '{sourceKey,relationshipId}'='2';
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read((current_setting(''qa.school_context'')::jsonb->>''contract'')::uuid)','SCHOOL_CERTIFICATE_SOURCE_MAPPING_DRIFT');
RESET ROLE;
ROLLBACK TO SAVEPOINT malformed_mapping_test;

SAVEPOINT empty_children_test;
DELETE FROM grh_family WHERE family_id=(current_setting('qa.school_context')::jsonb->>'family')::bigint;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(jsonb_array_length(pg_temp.qa_read((current_setting('qa.school_context')::jsonb->>'contract')::uuid)->'rows')=0,'valid_contract_without_children');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read(''00000000-0000-4000-8000-000000005799''::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
RESET ROLE;
UPDATE grh_catalog_rows SET label='PRENATAL' WHERE catalog='family_relationships' AND source_payload #>> '{sourceKey,relationshipId}'='2';
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read((current_setting(''qa.school_context'')::jsonb->>''contract'')::uuid)','SCHOOL_CERTIFICATE_SOURCE_MAPPING_DRIFT');
RESET ROLE;
ROLLBACK TO SAVEPOINT empty_children_test;

SAVEPOINT inactive_test;
UPDATE employment_contract SET status='inactive' WHERE id=(current_setting('qa.school_context')::jsonb->>'contract')::uuid;
SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;r jsonb;BEGIN
 r:=pg_temp.qa_read();PERFORM pg_temp.qa_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') x WHERE x->>'contractId'=c->>'contract'),'inactive_not_in_cohort');
 r:=pg_temp.qa_read((c->>'contract')::uuid);PERFORM pg_temp.qa_assert(jsonb_array_length(r->'rows')=1 AND r#>>'{rows,0,administrativeActive}'='false'
  AND r#>>'{rows,0,historyCount}'='2','inactive_contract_evidence_retained');
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT inactive_test;

SAVEPOINT reassignment_test;
UPDATE grh_family SET nombre='Otro hijo QA' WHERE family_id=(current_setting('qa.school_context')::jsonb->>'family')::bigint;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(pg_temp.qa_read((current_setting('qa.school_context')::jsonb->>'contract')::uuid)#>>'{rows,0,historyCount}'='0','reassigned_family_hides_history');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_download(current_setting(''qa.school_certificate'')::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_register(current_setting(''qa.school_payload'')::jsonb,''qa-reassigned'')','SCHOOL_CERTIFICATE_IDENTITY_CHANGED');
RESET ROLE;
ROLLBACK TO SAVEPOINT reassignment_test;

SAVEPOINT person_reassignment_test;
INSERT INTO person_identity(id,full_name) VALUES('00000000-0000-4000-8000-000000005701','Otra persona QA');
UPDATE employment_contract SET person_id='00000000-0000-4000-8000-000000005701' WHERE id=(current_setting('qa.school_context')::jsonb->>'contract')::uuid;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(pg_temp.qa_read((current_setting('qa.school_context')::jsonb->>'contract')::uuid)#>>'{rows,0,historyCount}'='0','reassigned_person_hides_history');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_download(current_setting(''qa.school_certificate'')::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
RESET ROLE;
ROLLBACK TO SAVEPOINT person_reassignment_test;

SAVEPOINT refresh_test;
DO $$ DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;new_batch uuid:=gen_random_uuid();BEGIN
 INSERT INTO data_import_runs(id,source_name,source_sha256,source_cutoff,status,completed_at)
 VALUES(-570001,'Synthetic schooling refresh',repeat('5',64),'2026-09-15','completed',now());
 INSERT INTO source_import_batch(id,source_system,source_database,source_file_name,source_sha256,source_cutoff,legacy_import_run_id,validation_state)
 VALUES(new_batch,'GRH',c->>'database','Synthetic QA refresh',upper(encode(digest('schooling-refresh-'||new_batch::text,'sha256'),'hex')),'2026-09-15',-570001,'published');
 UPDATE employment_contract SET source_batch_id=new_batch WHERE id=(c->>'contract')::uuid;
 UPDATE grh_family SET import_run_id=-570001 WHERE family_id=(c->>'family')::bigint;
 UPDATE grh_catalog_rows SET import_run_id=-570001 WHERE catalog='family_relationships' AND source_payload #>> '{sourceKey,relationshipId}'='2';
 -- Latest old-batch status is not borrowed into the new census.
 PERFORM pg_temp.qa_assert(pg_temp.qa_read((c->>'contract')::uuid)#>>'{rows,0,administrativeActive}'='false','stale_status_not_borrowed');
 INSERT INTO employment_status_snapshot(employment_contract_id,snapshot_date,administrative_status,payroll_status,source_system,source_batch_id)
 VALUES((c->>'contract')::uuid,'2026-09-15','suspended','not_applicable','GRH',new_batch);
 INSERT INTO employment_status_snapshot(employment_contract_id,snapshot_date,administrative_status,payroll_status,source_system,source_batch_id)
 VALUES((c->>'contract')::uuid,'2026-09-16','inactive','not_applicable','GRH',(c->>'batch')::uuid);
END $$;
SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;r jsonb;BEGIN
 r:=pg_temp.qa_read((c->>'contract')::uuid);
 PERFORM pg_temp.qa_assert(r#>>'{rows,0,historyCount}'='2' AND r#>>'{rows,0,identityToken}'=current_setting('qa.school_payload')::jsonb->>'identityToken'
  AND r#>>'{rows,0,administrativeActive}'='true','refresh_preserves_identity_history');
 PERFORM pg_temp.qa_download(current_setting('qa.school_certificate')::uuid);
 PERFORM pg_temp.qa_assert(pg_temp.qa_register(current_setting('qa.school_payload')::jsonb,'qa-school-first')->>'duplicate'='true','replay_survives_new_batch');
END $$;
RESET ROLE;
ROLLBACK TO SAVEPOINT refresh_test;

SAVEPOINT truncate_test;
TRUNCATE grh_family;
DO $$ BEGIN PERFORM pg_temp.qa_assert((SELECT count(*)=2 FROM school_certificate WHERE contract_id=(current_setting('qa.school_context')::jsonb->>'contract')::uuid),'staging_truncate_keeps_evidence'); END $$;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_download(current_setting(''qa.school_certificate'')::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
RESET ROLE;
ROLLBACK TO SAVEPOINT truncate_test;

SAVEPOINT scope_test;
UPDATE employment_contract SET legacy_company_id=legacy_company_id+100000 WHERE id=(current_setting('qa.school_context')::jsonb->>'contract')::uuid;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read((current_setting(''qa.school_context'')::jsonb->>''contract'')::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_download(current_setting(''qa.school_certificate'')::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_register(current_setting(''qa.school_payload'')::jsonb,''qa-foreign'')','SCHOOL_CERTIFICATE_NOT_FOUND');
RESET ROLE;
ROLLBACK TO SAVEPOINT scope_test;

SAVEPOINT source_database_test;
DO $$ DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;new_batch uuid:=gen_random_uuid(); BEGIN
 INSERT INTO source_import_batch(id,source_system,source_database,source_file_name,source_sha256,source_cutoff,legacy_import_run_id,validation_state)
 VALUES(new_batch,'GRH','SCHOOL_QA_FOREIGN','Synthetic QA foreign source',upper(encode(digest('schooling-foreign-'||new_batch::text,'sha256'),'hex')),
  '2026-09-14',(c->>'import')::bigint,'published');
 UPDATE employment_contract SET source_batch_id=new_batch WHERE id=(c->>'contract')::uuid;
END $$;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read((current_setting(''qa.school_context'')::jsonb->>''contract'')::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_download(current_setting(''qa.school_certificate'')::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
RESET ROLE;
ROLLBACK TO SAVEPOINT source_database_test;

SAVEPOINT family_batch_test;
UPDATE grh_family SET import_run_id=NULL WHERE family_id=(current_setting('qa.school_context')::jsonb->>'family')::bigint;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(jsonb_array_length(pg_temp.qa_read((current_setting('qa.school_context')::jsonb->>'contract')::uuid)->'rows')=0,'family_batch_required');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_download(current_setting(''qa.school_certificate'')::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
RESET ROLE;
ROLLBACK TO SAVEPOINT family_batch_test;

SAVEPOINT limit_test;
INSERT INTO grh_family(family_id,company_id,legajo,nombre,vinculo_code,import_run_id)
SELECT 900000000058000000+n,(current_setting('qa.school_context')::jsonb->>'company')::integer,'9999995701','Hijo sintético QA','2',(current_setting('qa.school_context')::jsonb->>'import')::bigint FROM generate_series(1,5000) n;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_read((current_setting(''qa.school_context'')::jsonb->>''contract'')::uuid)','SCHOOL_CERTIFICATE_ROW_LIMIT');
RESET ROLE;
ROLLBACK TO SAVEPOINT limit_test;

SELECT 'QA_SCHOOL_TRANSACTIONAL_CHECKS_PASSED' AS result;
ROLLBACK;
DO $$ BEGIN
 IF current_setting('qa.school_baseline')::jsonb IS DISTINCT FROM jsonb_build_array((SELECT count(*) FROM grh_family),(SELECT count(*) FROM employment_contract),
  (SELECT count(*) FROM internal_users),(SELECT count(*) FROM tenant_membership),(SELECT count(*) FROM tenant_identity_session),
  (SELECT count(*) FROM source_import_batch),(SELECT count(*) FROM school_certificate),(SELECT count(*) FROM school_certificate_blob),
  (SELECT count(*) FROM school_certificate_event),(SELECT count(*) FROM attendance_canonical_punch),
  (SELECT to_jsonb(p) FROM school_certificate_storage_policy p WHERE singleton)) THEN RAISE EXCEPTION 'QA_SCHOOL_ROLLBACK_MISMATCH'; END IF;
END $$;
SELECT 'QA_SCHOOL_ROLLBACK_VERIFIED' AS result;
