-- Run only on an explicitly restored local database. No nominal output; all fixtures roll back.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database()<>'restore_monthly_20260914' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  OR inet_server_port()<>5432 OR current_user<>'restore_owner' OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'QA_SCHOOL_LOCAL_RESTORE_REQUIRED'; END IF;
 PERFORM set_config('qa.school_baseline',jsonb_build_array((SELECT count(*) FROM grh_family),(SELECT count(*) FROM employment_contract),
  (SELECT count(*) FROM internal_users),(SELECT count(*) FROM tenant_membership),(SELECT count(*) FROM tenant_identity_session),
  (SELECT count(*) FROM source_import_batch),(SELECT count(*) FROM school_certificate),(SELECT count(*) FROM school_certificate_blob),
  (SELECT count(*) FROM school_certificate_event),(SELECT count(*) FROM attendance_canonical_punch),
  (SELECT to_jsonb(p) FROM school_certificate_storage_policy p WHERE singleton))::text,false);
 PERFORM set_config('qa.family64_baseline',jsonb_build_array((SELECT count(*) FROM employee_family_member),(SELECT count(*) FROM employee_family_member_event))::text,false);
END $$;
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF current_database()<>'restore_monthly_20260914' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  OR inet_server_port()<>5432 OR current_user<>'restore_owner' OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'QA_SCHOOL_LOCAL_RESTORE_REQUIRED'; END IF;
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
 email text:='qa-family64-'||gen_random_uuid()||'@example.invalid';membership uuid:=gen_random_uuid();session uuid:=gen_random_uuid();
 family bigint:=900000000064000001;key text;
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
 VALUES(contract,person,'GRH',b.id,c.source_company_id,'9999996401','active');
 INSERT INTO employment_status_snapshot(employment_contract_id,snapshot_date,administrative_status,payroll_status,source_system,source_batch_id)
 VALUES(contract,b.source_cutoff::date,'active','not_applicable','GRH',b.id);
 INSERT INTO grh_family(family_id,company_id,legajo,nombre,fecha_nacimiento,vinculo_code,import_run_id)
 VALUES(family,c.source_company_id,'9999996401','Hijo QA escolar','2012-02-29','2',b.legacy_import_run_id),
  (family+1,c.source_company_id,'9999996401','Prenatal QA excluido',NULL,'9',b.legacy_import_run_id);
 PERFORM set_config('qa.school_context',jsonb_build_object('email',email,'session',session,'release',btrim(c.certified_release_sha),
  'tenant',c.tenant_id,'binding',c.binding_id,'membership',membership,'contract',contract,'person',person,'family',family::text,
  'batch',b.id,'import',b.legacy_import_run_id,'cutoff',b.source_cutoff,'database',c.source_database,'company',c.source_company_id)::text,true);
 PERFORM set_config('qa.school_foreign_family',(SELECT min(family_id)::text FROM grh_family WHERE legajo<>'9999996401'),true);
END $$;

CREATE FUNCTION pg_temp.qa_family_context() RETURNS jsonb LANGUAGE sql AS $$
 SELECT employee_family_context_v1(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,(c->>'contract')::uuid)
 FROM (SELECT current_setting('qa.school_context')::jsonb c) x $$;
CREATE FUNCTION pg_temp.qa_family_declare(payload jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT employee_family_declare_v1(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,payload,key)
 FROM (SELECT current_setting('qa.school_context')::jsonb c) x $$;
CREATE FUNCTION pg_temp.qa_family_read() RETURNS jsonb LANGUAGE sql AS $$
 SELECT school_certificate_read_v2(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,(c->>'contract')::uuid)
 FROM (SELECT current_setting('qa.school_context')::jsonb c) x $$;
CREATE FUNCTION pg_temp.qa_family_certificate(payload jsonb,key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT school_certificate_register_v2(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,payload,key)
 FROM (SELECT current_setting('qa.school_context')::jsonb c) x $$;
CREATE FUNCTION pg_temp.qa_family_download(document uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT school_certificate_download_v2(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,document)
 FROM (SELECT current_setting('qa.school_context')::jsonb c) x $$;

SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE c jsonb:=current_setting('qa.school_context')::jsonb;context_value jsonb;payload jsonb;result_value jsonb;certificate_payload jsonb;report jsonb;pdf bytea;
BEGIN
 context_value:=pg_temp.qa_family_context();
 PERFORM pg_temp.qa_assert(context_value->>'version'='employee-family-context.v1' AND context_value->>'canDeclare'='true','own_context_without_operator_legajo');
 payload:=jsonb_build_object('contractId',c->>'contract','contractIdentityToken',context_value#>>'{subject,identityToken}',
  'familyName','Hija propia sintética QA','birthDate','2016-02-29','dni','64000001','validFrom',NULL,'validTo',NULL);
 result_value:=pg_temp.qa_family_declare(payload,'64000000-0000-4000-8000-000000000001');
 PERFORM pg_temp.qa_assert(result_value->>'state'='declared' AND result_value#>>'{familyRef,kind}'='own' AND result_value->>'duplicate'='false','own_declaration');
 PERFORM set_config('qa.family64_payload',payload::text,true);PERFORM set_config('qa.family64_created',result_value::text,true);
 PERFORM pg_temp.qa_assert(pg_temp.qa_family_declare(payload,'64000000-0000-4000-8000-000000000001')->>'duplicate'='true','own_idempotent_replay');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_family_declare(%L::jsonb,%L)',payload||'{"familyName":"Otro nombre QA"}'::jsonb,'64000000-0000-4000-8000-000000000001'),'EMPLOYEE_FAMILY_IDEMPOTENCY_REUSE');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_family_declare(%L::jsonb,%L)',payload||'{"familyName":"HIJA PROPIA SINTETICA QA","dni":null}'::jsonb,'64000000-0000-4000-8000-000000000002'),'EMPLOYEE_FAMILY_DUPLICATE');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_family_declare(%L::jsonb,%L)',payload||'{"familyName":"Otro nombre QA"}'::jsonb,'64000000-0000-4000-8000-000000000003'),'EMPLOYEE_FAMILY_DUPLICATE');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_family_declare(%L::jsonb,%L)',payload||'{"familyName":"Hijo QA escolar","birthDate":"2012-02-29","dni":null}'::jsonb,'64000000-0000-4000-8000-000000000004'),'EMPLOYEE_FAMILY_DUPLICATE');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_family_declare(%L::jsonb,%L)',payload||jsonb_build_object('contractIdentityToken',repeat('0',64)),'64000000-0000-4000-8000-000000000005'),'EMPLOYEE_FAMILY_IDENTITY_CHANGED');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_family_declare(%L::jsonb,%L)',payload||'{"birthDate":"2026-02-30"}'::jsonb,'64000000-0000-4000-8000-000000000006'),'EMPLOYEE_FAMILY_DATES_INVALID');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_family_declare(%L::jsonb,%L)',payload||'{"state":"approved"}'::jsonb,'64000000-0000-4000-8000-000000000007'),'EMPLOYEE_FAMILY_INVALID_PAYLOAD');
 -- Optional document/birth/validity; a different name with the same birth is allowed.
 PERFORM pg_temp.qa_family_declare(payload||'{"familyName":"Hermano propio sintético QA","dni":null}'::jsonb,'64000000-0000-4000-8000-000000000008');
 PERFORM pg_temp.qa_family_declare(payload||'{"familyName":"Nombre mínimo QA","birthDate":null,"dni":null}'::jsonb,'64000000-0000-4000-8000-000000000009');
 report:=pg_temp.qa_family_read();
 PERFORM pg_temp.qa_assert(report->>'version'='family-schooling.v2' AND jsonb_array_length(report->'rows')=4
  AND report#>>'{scope,unresolvedFamilyRows}'='0','unified_source_and_owned_rows');
 PERFORM pg_temp.qa_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(report->'rows') r WHERE r ?| ARRAY['dni','cuil','personId','identitySnapshot']),'no_private_identity_in_report');
 PERFORM pg_temp.qa_assert(jsonb_array_length(pg_temp.qa_read((c->>'contract')::uuid)->'rows')=1,'v1_keeps_legacy_contract');
 -- SQL structural fixture is intentionally not a real PDF: the HTTP parser is tested separately.
 pdf:=convert_to(E'%PDF-1.4\nSynthetic SQL metadata fixture\n%%EOF\n','UTF8');
 certificate_payload:=jsonb_build_object('contractId',c->>'contract','familyRef',result_value->'familyRef','identityToken',result_value->>'identityToken',
  'filename','certificado-qa.pdf','contentBase64',replace(encode(pdf,'base64'),E'\n',''),'sha256',encode(digest(pdf,'sha256'),'hex'),'presentedOn','2026-09-14','expiresOn',NULL);
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_family_certificate(%L::jsonb,%L)',certificate_payload||'{"sha256":"invalid"}'::jsonb,'64000000-0000-4000-8000-000000000010'),'SCHOOL_CERTIFICATE_INVALID_PAYLOAD');
 PERFORM pg_temp.qa_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.qa_family_read()->'rows') r WHERE r->'familyRef'=result_value->'familyRef'),'failed_pdf_preserves_child');
 result_value:=pg_temp.qa_family_certificate(certificate_payload,'64000000-0000-4000-8000-000000000011');
 PERFORM set_config('qa.family64_certificate',result_value->>'certificateId',true);PERFORM set_config('qa.family64_certificate_payload',certificate_payload::text,true);
 PERFORM pg_temp.qa_assert(result_value->>'version'='family-schooling-register.v2' AND result_value->>'duplicate'='false','own_certificate_registered');
 PERFORM pg_temp.qa_assert(pg_temp.qa_family_certificate(certificate_payload,'64000000-0000-4000-8000-000000000011')->>'duplicate'='true','own_certificate_replay');
 PERFORM pg_temp.qa_assert(pg_temp.qa_family_download((result_value->>'certificateId')::uuid)->>'sha256'=certificate_payload->>'sha256','own_certificate_download');
 PERFORM pg_temp.qa_error(format('SELECT pg_temp.qa_download(%L::uuid)',result_value->>'certificateId'),'SCHOOL_CERTIFICATE_NOT_FOUND');
END $$;
RESET ROLE;

SELECT pg_temp.qa_assert(employee_family_name_key_v1('ÁLVARO PEÑA' COLLATE "C")=employee_family_name_key_v1('álvaro Peña' COLLATE "C"),'name_normalization_unicode_c_collation');

-- DB invariants still protect callers bypassing HTTP.
SELECT pg_temp.qa_error('UPDATE employee_family_member SET family_name=''Modified'' WHERE id=(current_setting(''qa.family64_created'')::jsonb#>>''{familyRef,id}'')::uuid','SCHOOL_CERTIFICATE_IMMUTABLE');
SELECT pg_temp.qa_error('TRUNCATE employee_family_member_event','SCHOOL_CERTIFICATE_IMMUTABLE');
SELECT pg_temp.qa_assert((SELECT family_id IS NULL AND own_family_id=(current_setting('qa.family64_created')::jsonb#>>'{familyRef,id}')::uuid
 FROM school_certificate WHERE id=current_setting('qa.family64_certificate')::uuid),'own_certificate_has_no_fake_legacy_key');
SELECT pg_temp.qa_assert(NOT has_table_privilege('municontrol_actions_runtime_app','employee_family_member','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
 AND NOT has_function_privilege('municontrol_actions_runtime_app','employee_family_subject_v1(jsonb,uuid,boolean)','EXECUTE'),'private_domain_runtime_grants');

SAVEPOINT quota_test;
UPDATE school_certificate_storage_policy SET pdf_quota_bytes=0 WHERE singleton;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(pg_temp.qa_family_context()->>'canDeclare'='true' AND pg_temp.qa_family_read()->>'canRegister'='false','own_creation_independent_of_pdf_quota');
SELECT pg_temp.qa_assert(pg_temp.qa_family_declare(current_setting('qa.family64_payload')::jsonb||'{"familyName":"Sin PDF QA","dni":null}'::jsonb,'64000000-0000-4000-8000-000000000012')->>'state'='declared','own_creation_with_exhausted_quota');
SELECT pg_temp.qa_assert(pg_temp.qa_family_certificate(current_setting('qa.family64_certificate_payload')::jsonb,'64000000-0000-4000-8000-000000000011')->>'duplicate'='true','certificate_replay_with_exhausted_quota');
RESET ROLE;
ROLLBACK TO SAVEPOINT quota_test;

SAVEPOINT permission_test;
UPDATE tenant_membership_capability_override SET allow_override=false,deny_override=true WHERE membership_id=(current_setting('qa.school_context')::jsonb->>'membership')::uuid AND capability_key='employee.record.propose';
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(pg_temp.qa_family_context()->>'canDeclare'='false','read_only_context');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_family_declare(current_setting(''qa.family64_payload'')::jsonb,''64000000-0000-4000-8000-000000000001'')','SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED');
SELECT pg_temp.qa_assert(pg_temp.qa_family_download(current_setting('qa.family64_certificate')::uuid) IS NOT NULL,'read_remains_when_propose_revoked');
RESET ROLE;
ROLLBACK TO SAVEPOINT permission_test;

SAVEPOINT reassignment_test;
INSERT INTO person_identity(id,full_name) VALUES('64000000-0000-4000-8000-000000000099','Otra persona sintética QA');
UPDATE employment_contract SET person_id='64000000-0000-4000-8000-000000000099' WHERE id=(current_setting('qa.school_context')::jsonb->>'contract')::uuid;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.qa_family_read()->'rows') r WHERE r#>>'{familyRef,kind}'='own'),'reassignment_never_transfers_owned_children');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_family_declare(current_setting(''qa.family64_payload'')::jsonb,''64000000-0000-4000-8000-000000000001'')','EMPLOYEE_FAMILY_IDENTITY_CHANGED');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_family_certificate(current_setting(''qa.family64_certificate_payload'')::jsonb,''64000000-0000-4000-8000-000000000011'')','SCHOOL_CERTIFICATE_IDENTITY_CHANGED');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_family_download(current_setting(''qa.family64_certificate'')::uuid)','SCHOOL_CERTIFICATE_NOT_FOUND');
RESET ROLE;
ROLLBACK TO SAVEPOINT reassignment_test;

SAVEPOINT equivalent_refresh;
DO $$ DECLARE c jsonb:=current_setting('qa.school_context')::jsonb; batch uuid:=gen_random_uuid(); BEGIN
 INSERT INTO data_import_runs(id,source_name,source_sha256,source_cutoff,status,completed_at) VALUES(-640001,'Synthetic family refresh',repeat('6',64),'2026-09-15','completed',now());
 INSERT INTO source_import_batch(id,source_system,source_database,source_file_name,source_sha256,source_cutoff,legacy_import_run_id,validation_state)
 VALUES(batch,'GRH',c->>'database','Synthetic family refresh',upper(encode(digest(batch::text,'sha256'),'hex')),'2026-09-15',-640001,'published');
 UPDATE employment_contract SET source_batch_id=batch WHERE id=(c->>'contract')::uuid;
 UPDATE grh_family SET import_run_id=-640001 WHERE family_id=(c->>'family')::bigint;
 UPDATE grh_catalog_rows SET import_run_id=-640001 WHERE catalog='family_relationships' AND source_payload#>>'{sourceKey,relationshipId}'='2';
 INSERT INTO employment_status_snapshot(employment_contract_id,snapshot_date,administrative_status,payroll_status,source_system,source_batch_id)
 VALUES((c->>'contract')::uuid,'2026-09-15','active','not_applicable','GRH',batch);
END $$;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(pg_temp.qa_family_declare(current_setting('qa.family64_payload')::jsonb,'64000000-0000-4000-8000-000000000001')->>'duplicate'='true','equivalent_refresh_preserves_declaration');
SELECT pg_temp.qa_assert(pg_temp.qa_family_certificate(current_setting('qa.family64_certificate_payload')::jsonb,'64000000-0000-4000-8000-000000000011')->>'duplicate'='true','equivalent_refresh_preserves_certificate');
SELECT pg_temp.qa_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.qa_family_read()->'rows') r WHERE r->'familyRef'=current_setting('qa.family64_created')::jsonb->'familyRef'
 AND r->>'identityToken'=current_setting('qa.family64_created')::jsonb->>'identityToken' AND r->>'historyCount'='1' AND r->>'administrativeActive'='true'),'equivalent_refresh_unified_identity');
SELECT pg_temp.qa_family_download(current_setting('qa.family64_certificate')::uuid) IS NOT NULL AS download_ok;
RESET ROLE;
ROLLBACK TO SAVEPOINT equivalent_refresh;

SAVEPOINT future_source_overlap;
INSERT INTO grh_family(family_id,company_id,legajo,nombre,fecha_nacimiento,dni,vinculo_code,import_run_id)
SELECT 900000000064000099,(c->>'company')::integer,'9999996401','Hija propia sintética QA','2016-02-29','64000001','2',(c->>'import')::bigint
 FROM (SELECT current_setting('qa.school_context')::jsonb c) x;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(pg_temp.qa_family_read()#>>'{scope,unresolvedFamilyRows}'='2','future_grh_match_is_observed');
SELECT pg_temp.qa_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.qa_family_read()->'rows') r WHERE r->'familyRef'=current_setting('qa.family64_created')::jsonb->'familyRef'
 AND r->>'identityReviewRequired'='true' AND r->>'historyCount'='1'),'match_preserves_own_certificate');
SELECT pg_temp.qa_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.qa_family_read()->'rows') r WHERE r#>>'{familyRef,id}'='900000000064000099'
 AND r->>'identityReviewRequired'='true' AND r->>'historyCount'='0'),'match_does_not_assign_certificate_to_grh');
RESET ROLE;
ROLLBACK TO SAVEPOINT future_source_overlap;

SAVEPOINT source_truncate;
TRUNCATE grh_family;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_assert(jsonb_array_length(pg_temp.qa_family_read()->'rows')=3,'own_children_survive_grh_replacement');
SELECT pg_temp.qa_assert(pg_temp.qa_family_download(current_setting('qa.family64_certificate')::uuid) IS NOT NULL,'own_document_survives_grh_replacement');
RESET ROLE;
ROLLBACK TO SAVEPOINT source_truncate;

SAVEPOINT wrong_tenant;
SELECT set_config('qa.school_context',(current_setting('qa.school_context')::jsonb||jsonb_build_object('tenant',gen_random_uuid()))::text,true) IS NOT NULL AS context_set;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_error('SELECT pg_temp.qa_family_context()','SCHOOL_CERTIFICATE_SESSION_INVALID');
SELECT pg_temp.qa_error('SELECT pg_temp.qa_family_download(current_setting(''qa.family64_certificate'')::uuid)','SCHOOL_CERTIFICATE_SESSION_INVALID');
RESET ROLE;
ROLLBACK TO SAVEPOINT wrong_tenant;

ROLLBACK;
DO $$ BEGIN
 IF current_setting('qa.school_baseline')::jsonb IS DISTINCT FROM jsonb_build_array((SELECT count(*) FROM grh_family),(SELECT count(*) FROM employment_contract),
  (SELECT count(*) FROM internal_users),(SELECT count(*) FROM tenant_membership),(SELECT count(*) FROM tenant_identity_session),
  (SELECT count(*) FROM source_import_batch),(SELECT count(*) FROM school_certificate),(SELECT count(*) FROM school_certificate_blob),
  (SELECT count(*) FROM school_certificate_event),(SELECT count(*) FROM attendance_canonical_punch),
  (SELECT to_jsonb(p) FROM school_certificate_storage_policy p WHERE singleton)) THEN RAISE EXCEPTION 'QA_FAMILY64_EXISTING_FIXTURE_ROLLBACK_FAILED'; END IF;
 IF current_setting('qa.family64_baseline')::jsonb IS DISTINCT FROM jsonb_build_array((SELECT count(*) FROM employee_family_member),(SELECT count(*) FROM employee_family_member_event)) THEN RAISE EXCEPTION 'QA_FAMILY64_OWN_FIXTURE_ROLLBACK_FAILED'; END IF;
END $$;
