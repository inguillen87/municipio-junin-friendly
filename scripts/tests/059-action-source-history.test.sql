-- Synthetic actions/source evidence only. Run after 059 on the restored LOCAL copy.
-- No importers, source files, production connections or nominal output. Full rollback.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database()<>'restore_monthly_20260914' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet
  OR inet_server_port()<>55439 THEN RAISE EXCEPTION 'QA_HISTORY_LOCAL_RESTORE_REQUIRED'; END IF;
 PERFORM set_config('qa.history_baseline',jsonb_build_array(
  (SELECT count(*) FROM action_case),(SELECT count(*) FROM action_case_event),
  (SELECT count(*) FROM source_staging_row),(SELECT count(*) FROM source_import_batch),
  (SELECT count(*) FROM grh_employees),(SELECT count(*) FROM grh_family),(SELECT count(*) FROM grh_catalog_rows),
  (SELECT count(*) FROM employment_contract),(SELECT count(*) FROM person_identity),
  (SELECT count(*) FROM school_certificate),(SELECT count(*) FROM school_certificate_blob),(SELECT count(*) FROM school_certificate_event),
  (SELECT count(*) FROM payroll_detail_statement),(SELECT count(*) FROM payroll_monthly_fact),
  (SELECT count(*) FROM attendance_canonical_punch),
  (SELECT count(*) FROM internal_users),(SELECT count(*) FROM tenant_membership),(SELECT count(*) FROM tenant_identity_session)
 )::text,false);
END $$;
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='3s';
-- pg_restore --no-privileges intentionally omits the application ACL. Restore
-- only these entry-point grants inside this rollback transaction.
GRANT USAGE ON SCHEMA public TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_tenant_list_v2(text,uuid,integer,text,uuid,uuid,text,text,text,integer,integer),
 action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid),
 action_center_overtime_list_v1(text,uuid,integer,text,uuid,uuid,text,integer,integer),
 action_center_overtime_detail_v1(text,uuid,integer,text,uuid,uuid,uuid),
 action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean),
 action_center_apply_overtime_command_v1(text,uuid,integer,text,uuid,uuid,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,boolean)
 TO municontrol_actions_runtime_app;

CREATE FUNCTION pg_temp.h_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'QA_HISTORY_ASSERT_%',label; END IF; END $$;
CREATE FUNCTION pg_temp.h_error(statement text,label text,expected text DEFAULT 'ACTION_CASE_NOT_FOUND') RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN observed:=SQLERRM; END;
 IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'QA_HISTORY_REJECTION_%',label; END IF;
END $$;
CREATE FUNCTION pg_temp.h_actor(kind text DEFAULT 'maker') RETURNS jsonb LANGUAGE sql AS $$
 SELECT current_setting('qa.history')::jsonb || (current_setting('qa.history')::jsonb->'actors'->kind)
$$;
CREATE FUNCTION pg_temp.h_detail(id uuid,kind text DEFAULT 'leave',actor text DEFAULT 'maker') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c jsonb:=pg_temp.h_actor(actor);
BEGIN
 IF kind='overtime' THEN RETURN action_center_overtime_detail_v1(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,id); END IF;
 RETURN action_center_tenant_detail_v2(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,id);
END $$;
CREATE FUNCTION pg_temp.h_list(kind text DEFAULT 'leave',actor text DEFAULT 'maker',view_name text DEFAULT 'authorized') RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c jsonb:=pg_temp.h_actor(actor);
BEGIN
 IF kind='overtime' THEN RETURN action_center_overtime_list_v1(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,NULL,1,50); END IF;
 RETURN action_center_tenant_list_v2(c->>'email',(c->>'session')::uuid,1,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid,'leave_request',view_name,NULL,1,50);
END $$;
CREATE FUNCTION pg_temp.h_command(kind text,command text,id uuid,key uuid,version integer DEFAULT 1) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c jsonb:=pg_temp.h_actor(CASE WHEN command IN ('approve','reject') THEN 'checker' ELSE 'maker' END);r record;p jsonb;reason text;policy text;
BEGIN
 p:=CASE WHEN kind='overtime' THEN '{"workDate":"2026-08-10","declaredMinutes":60,"reasonCode":"service_continuity"}'::jsonb
  ELSE '{"reasonCode":"19","startsOn":"2026-08-10","endsOn":"2026-08-11","durationUnit":"calendar_day"}'::jsonb END;
 policy:=CASE WHEN kind='overtime' THEN 'junin-mayor-esfuerzo-intake.v1' ELSE 'mendoza-ley-5811-title-vi.v1' END;
 IF kind='overtime' THEN
  reason:=CASE command WHEN 'approve' THEN 'validated_documentation' WHEN 'reject' THEN 'insufficient_evidence' WHEN 'cancel' THEN 'entered_in_error' END;
  SELECT * INTO r FROM action_center_apply_overtime_command_v1(c->>'email',(c->>'session')::uuid,1,c->>'release',
   (c->>'tenant')::uuid,(c->>'membership')::uuid,command,CASE WHEN command='create' THEN NULL ELSE id END,
   CASE WHEN command='create' THEN NULL ELSE version END,key,repeat('a',64),
   CASE WHEN command IN ('create','update_draft') THEN p END,CASE WHEN command='create' THEN (c->>'contract')::uuid END,
   CASE WHEN command IN ('create','update_draft') THEN policy END,reason,
   CASE WHEN command='approve' THEN 'verified' END,command='approve');
 ELSE
  SELECT * INTO r FROM action_center_apply_tenant_command(c->>'email',(c->>'session')::uuid,1,c->>'release',
   (c->>'tenant')::uuid,(c->>'membership')::uuid,'leave_request',command,CASE WHEN command='create' THEN NULL ELSE id END,
   CASE WHEN command='create' THEN NULL ELSE version END,key,repeat('a',64),
   CASE WHEN command IN ('create','update_draft') THEN p END,CASE WHEN command='create' THEN (c->>'contract')::uuid END,
   CASE WHEN command IN ('create','update_draft') THEN policy END,
   CASE WHEN command IN ('create','update_draft') THEN 'standard' END,
   CASE WHEN command IN ('approve','reject','cancel') THEN 'Synthetic review reason' END,
   CASE WHEN command='approve' THEN 'verified' END,command='approve');
 END IF;
 RETURN to_jsonb(r);
END $$;

-- Reuse the certified binding, never identities/rows from the restored source.
DO $$ DECLARE base record;ctx jsonb;actors jsonb:='{}';kind text;cap text;caps text[];
 membership uuid;session uuid;email text;person uuid;actor_contract uuid;raw_id bigint:=959000000001;
 contract uuid;old_batch uuid:=gen_random_uuid();new_batch uuid:=gen_random_uuid();payload jsonb;old_payload jsonb;new_payload jsonb;
BEGIN
 SELECT p.tenant_id,p.certified_release_sha,b.id binding,b.source_database,b.source_company_id INTO base
 FROM tenant_identity_policy p JOIN platform_tenant_source_binding b ON b.id=p.certified_source_binding_id AND b.tenant_id=p.tenant_id
 JOIN platform_tenant t ON t.id=p.tenant_id AND t.status='active'
 WHERE p.tenant_data_plane_ready AND b.verified AND b.source_system='GRH' ORDER BY p.tenant_id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'QA_HISTORY_CERTIFIED_POLICY_REQUIRED'; END IF;
 INSERT INTO data_import_runs(id,source_name,source_sha256,source_cutoff,status,completed_at)
 VALUES(-590001,'Synthetic history old',upper(encode(digest(old_batch::text,'sha256'),'hex')),'2026-08-01 09:00:00','completed',now()),
  (-590002,'Synthetic history current',upper(encode(digest(new_batch::text,'sha256'),'hex')),'2026-09-15 09:00:00','completed',now());
 INSERT INTO source_import_batch(id,source_system,source_database,source_file_name,source_sha256,source_cutoff,legacy_import_run_id,validation_state)
 VALUES(old_batch,'GRH',base.source_database,'Synthetic old',upper(encode(digest(old_batch::text,'sha256'),'hex')),'2026-08-01 12:00:00Z',-590001,'published'),
  (new_batch,'GRH',base.source_database,'Synthetic current',upper(encode(digest(new_batch::text,'sha256'),'hex')),'2026-09-15 12:00:00Z',-590002,'published');
 person:=md5('person_identity|GRH|persona|'||raw_id)::uuid;
 contract:=md5('employment_contract|GRH|legajo|'||base.source_company_id||'|95900001')::uuid;
 old_payload:=jsonb_build_object('sourceKey',jsonb_build_object('companyCode',base.source_company_id::text,'employeeNumber','95900001'),
  'personId',raw_id::text,'identity',jsonb_build_object('fullName','Synthetic beneficiary','documentNumber','99995901','cuil',NULL,'birthDate','1980-02-29','sexCode','M','sexLabel','Masculino'),
  'employment',jsonb_build_object('organizationId','qa-history-org-a','sectorCode','qa-history-sector-a','sectorName','Synthetic previous sector'));
 new_payload:=jsonb_set(old_payload,'{employment,sectorName}','"Synthetic current sector"');
 INSERT INTO person_identity(id,full_name,dni,birth_date,sex_code) VALUES(person,'Synthetic beneficiary','99995901','1980-02-29','Masculino');
 INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status,organization_unit_source_id,sector_source_id,source_payload)
 VALUES(contract,person,'GRH',old_batch,base.source_company_id,'95900001','active','qa-history-org-a','qa-history-sector-a',old_payload);
 INSERT INTO grh_employees(company_id,legajo,person_id,nombre,sexo,fecha_nacimiento,dni,activo,sector_code,sector,source_payload,import_run_id)
 VALUES(base.source_company_id,'95900001',raw_id,'Synthetic beneficiary','Masculino','1980-02-29','99995901',true,'qa-history-sector-a','Synthetic previous sector',old_payload,-590001);
 INSERT INTO source_staging_row(batch_id,source_schema,source_entity,source_id,source_row_number,source_row_sha256,source_payload)
 VALUES(old_batch,base.source_database,'legajo',jsonb_build_object('companyCode',base.source_company_id,'employeeNumber','95900001')::text,1,encode(digest(old_payload::text,'sha256'),'hex'),old_payload),
  (new_batch,base.source_database,'legajo',jsonb_build_object('companyCode',base.source_company_id,'employeeNumber','95900001')::text,1,encode(digest(new_payload::text,'sha256'),'hex'),new_payload);
 FOREACH kind IN ARRAY ARRAY['maker','checker','reader','payroll','area','self'] LOOP
  membership:=gen_random_uuid();session:=gen_random_uuid();email:='qa-history-'||kind||'-'||gen_random_uuid()||'@example.invalid';
  INSERT INTO internal_users(email,display_name,role,password_hash,active,auth_mode,identity_version)
   VALUES(email,'Synthetic history actor','EMPLEADO',NULL,true,'managed',1);
  INSERT INTO iam_role(role_key,label,description,scope_kind,system_managed)
   VALUES('QA_HISTORY_'||upper(kind),'Synthetic history role','Local rollback fixture','tenant',false);
  INSERT INTO tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at)
   VALUES(membership,base.tenant_id,email,'QA_HISTORY_'||upper(kind),'active',email,now());
  INSERT INTO tenant_action_authority(membership_id,tenant_id) VALUES(membership,base.tenant_id) ON CONFLICT DO NOTHING;
  INSERT INTO tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,status,device_label,last_seen_at,expires_at)
   VALUES(session,email,base.tenant_id,'membership','mfa',1,1,'active','Synthetic rollback',now(),now()+interval '1 hour');
  caps:=CASE kind WHEN 'maker' THEN ARRAY['actions.read','leave.request.all.manage','leave.request.restricted.read','time.overtime.read','time.overtime.enter']
   WHEN 'checker' THEN ARRAY['actions.read','leave.request.all.manage','leave.request.restricted.read','time.overtime.read','time.overtime.approve']
   WHEN 'reader' THEN ARRAY['actions.read','leave.request.all.read','leave.request.restricted.read','time.overtime.read']
   WHEN 'payroll' THEN ARRAY['actions.read','leave.request.payroll.read']
   WHEN 'area' THEN ARRAY['actions.read','leave.request.area.read']
   ELSE ARRAY['actions.read','leave.request.self.read'] END;
  FOREACH cap IN ARRAY caps LOOP INSERT INTO iam_role_capability(role_key,capability_key) VALUES('QA_HISTORY_'||upper(kind),cap); END LOOP;
  IF kind IN ('maker','checker','reader','self') THEN
   IF kind='self' THEN actor_contract:=contract;
   ELSE
    actor_contract:=gen_random_uuid();person:=gen_random_uuid();
    INSERT INTO person_identity(id,full_name) VALUES(person,'Synthetic actor identity');
    INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status)
     VALUES(actor_contract,person,'GRH',old_batch,base.source_company_id,CASE kind WHEN 'maker' THEN '95900002' WHEN 'checker' THEN '95900004' ELSE '95900003' END,'active');
   END IF;
   INSERT INTO tenant_action_employment_link(membership_id,tenant_id,source_binding_id,employment_contract_id,linked_by_user_email)
    VALUES(membership,base.tenant_id,base.binding,actor_contract,email);
  END IF;
  IF kind='area' THEN INSERT INTO tenant_action_area_scope(membership_id,tenant_id,source_binding_id,capability_key,scope_level,company_id,organization_unit_source_id,granted_by_user_email)
   VALUES(membership,base.tenant_id,base.binding,'leave.request.area.read','organization',base.source_company_id,'qa-history-org-a',email); END IF;
  actors:=actors||jsonb_build_object(kind,jsonb_build_object('email',email,'membership',membership,'session',session));
 END LOOP;
 UPDATE tenant_exclusive_capability SET active=false,revoked_at=now() WHERE tenant_id=base.tenant_id AND capability_key='time.overtime.enter' AND active;
 INSERT INTO tenant_exclusive_capability(tenant_id,capability_key,membership_id,assigned_by_user_email)
 VALUES(base.tenant_id,'time.overtime.enter',(actors#>>'{maker,membership}')::uuid,actors#>>'{maker,email}');
 ctx:=jsonb_build_object('tenant',base.tenant_id,'binding',base.binding,'database',base.source_database,'company',base.source_company_id,
  'release',btrim(base.certified_release_sha),'contract',contract,'person',md5('person_identity|GRH|persona|'||raw_id)::uuid,
  'oldBatch',old_batch,'newBatch',new_batch,'oldPayload',old_payload,'newPayload',new_payload,'actors',actors,
  'leaveKey',gen_random_uuid(),'overtimeKey',gen_random_uuid(),'leaveUpdateKey',gen_random_uuid(),'overtimeUpdateKey',gen_random_uuid());
 PERFORM set_config('qa.history',ctx::text,true);
END $$;

SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE c jsonb:=pg_temp.h_actor();l jsonb;o jsonb;d jsonb;r jsonb;
BEGIN
 l:=pg_temp.h_command('leave','create',NULL,(c->>'leaveKey')::uuid);
 o:=pg_temp.h_command('overtime','create',NULL,(c->>'overtimeKey')::uuid);
 PERFORM set_config('qa.history',((current_setting('qa.history')::jsonb)||jsonb_build_object('leave',l->>'case_id','overtime',o->>'case_id'))::text,true);
 PERFORM pg_temp.h_assert(pg_temp.h_command('leave','create',NULL,(c->>'leaveKey')::uuid)->>'replayed'='true','current_leave_replay');
 PERFORM pg_temp.h_assert(pg_temp.h_command('overtime','create',NULL,(c->>'overtimeKey')::uuid)->>'replayed'='true','current_overtime_replay');
 r:=pg_temp.h_command('leave','update_draft',(l->>'case_id')::uuid,(c->>'leaveUpdateKey')::uuid);
 PERFORM pg_temp.h_assert(r->>'current_version'='2' AND r->>'replayed'='false','current_leave_update');
 r:=pg_temp.h_command('overtime','update_draft',(o->>'case_id')::uuid,(c->>'overtimeUpdateKey')::uuid);
 PERFORM pg_temp.h_assert(r->>'current_version'='2' AND r->>'replayed'='false','current_overtime_update');
 PERFORM pg_temp.h_assert(pg_temp.h_command('leave','update_draft',(l->>'case_id')::uuid,(c->>'leaveUpdateKey')::uuid)->>'replayed'='true','current_leave_update_replay');
 PERFORM pg_temp.h_assert(pg_temp.h_command('overtime','update_draft',(o->>'case_id')::uuid,(c->>'overtimeUpdateKey')::uuid)->>'replayed'='true','current_overtime_update_replay');
 d:=pg_temp.h_detail((l->>'case_id')::uuid);
 PERFORM pg_temp.h_assert(d#>>'{record,sourceContext,status}'='current' AND jsonb_array_length(d->'allowedCommands')>0,'current_leave_unchanged');
 d:=pg_temp.h_detail((o->>'case_id')::uuid,'overtime');
 PERFORM pg_temp.h_assert(d#>>'{record,sourceContext,status}'='current' AND jsonb_array_length(d->'allowedCommands')>0,'current_overtime_unchanged');
END $$;
RESET ROLE;

-- Extra read-only fixtures exercise approved minimal projection and confidentiality.
DO $$ DECLARE c jsonb:=pg_temp.h_actor();kind text;id uuid;actor_contract uuid;actor_person uuid;
BEGIN
 SELECT ec.id,ec.person_id INTO actor_contract,actor_person FROM tenant_action_employment_link link JOIN employment_contract ec ON ec.id=link.employment_contract_id WHERE link.membership_id=(c->>'membership')::uuid;
 FOREACH kind IN ARRAY ARRAY['approved','restricted'] LOOP
  PERFORM action_center_set_tenant_command_context(c->>'email','QA_HISTORY_MAKER',(c->>'membership')::uuid,(c->>'tenant')::uuid,(c->>'binding')::uuid,
   actor_contract,actor_person,'created',gen_random_uuid(),repeat('b',64),'{}'::jsonb);
  INSERT INTO action_case(tenant_id,source_binding_id,case_type,beneficiary_contract_id,source_batch_id,company_id,organization_unit_source_id,sector_source_id,
   status,confidentiality,policy_version_id,payload,created_by_user_email,submitted_by_user_email,submitted_at,decided_by_user_email,decided_at,decision_reason,evidence_status,manual_validation_confirmed)
  VALUES((c->>'tenant')::uuid,(c->>'binding')::uuid,'leave_request',(c->>'contract')::uuid,(c->>'oldBatch')::uuid,(c->>'company')::bigint,'qa-history-org-a','qa-history-sector-a',
   CASE WHEN kind='approved' THEN 'approved' ELSE 'draft' END,CASE WHEN kind='restricted' THEN 'restricted' ELSE 'standard' END,'mendoza-ley-5811-title-vi.v1',
   jsonb_build_object('reasonCode',CASE WHEN kind='restricted' THEN '3' ELSE '19' END,'startsOn',CASE WHEN kind='approved' THEN '2026-08-15' ELSE '2026-08-20' END,'endsOn',CASE WHEN kind='approved' THEN '2026-08-16' ELSE '2026-08-21' END,'durationUnit','calendar_day'),
   c->>'email',CASE WHEN kind='approved' THEN c->>'email' END,CASE WHEN kind='approved' THEN now() END,
   CASE WHEN kind='approved' THEN c#>>'{actors,reader,email}' END,CASE WHEN kind='approved' THEN now() END,
   CASE WHEN kind='approved' THEN 'Synthetic decision' END,CASE WHEN kind='approved' THEN 'verified' ELSE 'pending' END,kind='approved') RETURNING action_case.id INTO id;
  PERFORM set_config('qa.history',(current_setting('qa.history')::jsonb||jsonb_build_object(kind,id))::text,true);
 END LOOP;
 PERFORM set_config('qa.history_rows_before',jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM action_case a WHERE a.id IN ((current_setting('qa.history')::jsonb->>'leave')::uuid,(current_setting('qa.history')::jsonb->>'overtime')::uuid)),
  (SELECT count(*) FROM action_case),(SELECT count(*) FROM action_case_event),
  (SELECT count(*) FROM school_certificate),(SELECT count(*) FROM school_certificate_blob),(SELECT count(*) FROM school_certificate_event),
  (SELECT count(*) FROM payroll_detail_statement),(SELECT count(*) FROM payroll_monthly_fact))::text,true);
END $$;

-- Simulate an authorized source promotion in this transaction; no source importer runs.
UPDATE employment_contract SET source_batch_id=(current_setting('qa.history')::jsonb->>'newBatch')::uuid,
 source_payload=current_setting('qa.history')::jsonb->'newPayload'
 WHERE id=(current_setting('qa.history')::jsonb->>'contract')::uuid;
TRUNCATE grh_employees,grh_absences,grh_leaves,grh_family,grh_catalog_rows;

SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE c jsonb:=pg_temp.h_actor();kind text;id uuid;d jsonb;l jsonb;row_value jsonb;command text;
BEGIN
 FOREACH kind IN ARRAY ARRAY['leave','overtime'] LOOP
  id:=(c->>kind)::uuid;d:=pg_temp.h_detail(id,kind);
  PERFORM pg_temp.h_assert(d#>>'{record,sourceContext,status}'='historical_read_only' AND d->'allowedCommands'='[]'::jsonb,'historical_detail_'||kind);
  PERFORM pg_temp.h_assert(CASE WHEN kind='overtime' THEN
   d#>>'{record,subject,displayName}'='Synthetic beneficiary' AND d#>>'{record,subject,sector}'='Synthetic previous sector'
   ELSE d#>>'{record,subjectDisplayName}'='Synthetic beneficiary' AND d#>>'{record,subjectSector}'='Synthetic previous sector' END,'historical_subject_'||kind);
  PERFORM pg_temp.h_assert((d#>>'{record,sourceContext,sourceCutoffAt}')::timestamptz='2026-08-01 12:00:00Z'::timestamptz
   AND (d#>>'{record,sourceContext,currentCutoffAt}')::timestamptz='2026-09-15 12:00:00Z'::timestamptz,'historical_cutoffs_'||kind);
  PERFORM pg_temp.h_assert((SELECT count(*)=3 FROM jsonb_object_keys(d#>'{record,sourceContext}')),'source_context_allowlist_'||kind);
  l:=pg_temp.h_list(kind);SELECT value INTO row_value FROM jsonb_array_elements(l->'records') WHERE value->>'id'=id::text;
  PERFORM pg_temp.h_assert(row_value#>>'{sourceContext,status}'='historical_read_only','historical_list_'||kind);
  FOREACH command IN ARRAY ARRAY['update_draft','submit','approve','reject','cancel'] LOOP
   PERFORM pg_temp.h_error(format('SELECT pg_temp.h_command(%L,%L,%L::uuid,%L::uuid)',kind,command,id,gen_random_uuid()),'historical_'||kind||'_'||command);
  END LOOP;
  PERFORM pg_temp.h_error(format('SELECT pg_temp.h_command(%L,''create'',NULL,%L::uuid)',kind,(c->>(kind||'Key'))::uuid),'historical_replay_'||kind);
  PERFORM pg_temp.h_error(format('SELECT pg_temp.h_command(%L,''update_draft'',%L::uuid,%L::uuid)',kind,id,(c->>(kind||'UpdateKey'))::uuid),'historical_update_replay_'||kind);
 END LOOP;
 d:=pg_temp.h_detail((c->>'approved')::uuid,'leave','payroll');
 PERFORM pg_temp.h_assert(d#>>'{record,projection}'='payroll' AND d#>>'{record,status}'='approved'
  AND NOT (d->'record' ?| ARRAY['subjectDisplayName','subjectLegajo','beneficiaryContractId','createdBy','sourceBatchId'])
  AND d->'timeline'='[]'::jsonb AND d->'allowedCommands'='[]'::jsonb,'historical_payroll_minimal');
 PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'restricted')::uuid,'leave','payroll')->'record'='null'::jsonb,'payroll_restricted_hidden');
 PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'leave')::uuid,'leave','area')->'record'<>'null'::jsonb,'historical_original_area');
 PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'restricted')::uuid,'leave','area')->'record'='null'::jsonb,'area_restricted_hidden');
 PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'restricted')::uuid,'leave','reader')->'record'<>'null'::jsonb,'authorized_restricted_reader');
 PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'leave')::uuid,'leave','self')->'record'<>'null'::jsonb,'same_person_self_history');
END $$;
RESET ROLE;

SAVEPOINT history_negative_cases;
UPDATE tenant_action_area_scope SET organization_unit_source_id='qa-history-org-b' WHERE membership_id=(pg_temp.h_actor('area')->>'membership')::uuid;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.h_assert(pg_temp.h_detail((current_setting('qa.history')::jsonb->>'leave')::uuid,'leave','area')->'record'='null'::jsonb,'different_area_hidden');
RESET ROLE;
ROLLBACK TO SAVEPOINT history_negative_cases;

SAVEPOINT history_person_reassigned;
INSERT INTO person_identity(id,full_name) VALUES('00000000-0000-4000-8000-000000005901','Synthetic replacement identity');
UPDATE employment_contract SET person_id='00000000-0000-4000-8000-000000005901' WHERE id=(current_setting('qa.history')::jsonb->>'contract')::uuid;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.h_assert(pg_temp.h_detail((current_setting('qa.history')::jsonb->>'leave')::uuid,'leave','self')->'record'='null'::jsonb,'replacement_person_cannot_inherit_history');
SELECT pg_temp.h_assert(pg_temp.h_detail((current_setting('qa.history')::jsonb->>'overtime')::uuid,'overtime')->'record'='null'::jsonb,'replacement_person_overtime_hidden');
RESET ROLE;
ROLLBACK TO SAVEPOINT history_person_reassigned;

-- Corrupt only freshly inserted synthetic staging, using rollback savepoints.
-- Rebuild rows through an extra candidate batch: do not disable immutable triggers.
CREATE FUNCTION pg_temp.h_bad_source(mode text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE c jsonb:=pg_temp.h_actor();b uuid:=gen_random_uuid();p jsonb:=c->'newPayload';sid text;sha text;
BEGIN
 INSERT INTO data_import_runs(id,source_name,source_sha256,source_cutoff,status,completed_at)
 VALUES(-590003,'Synthetic negative history',upper(encode(digest(b::text,'sha256'),'hex')),'2026-09-16 09:00:00','completed',now());
 INSERT INTO source_import_batch(id,source_system,source_database,source_file_name,source_sha256,source_cutoff,legacy_import_run_id,validation_state)
 VALUES(b,'GRH',CASE WHEN mode='database' THEN 'qa_wrong_database' ELSE c->>'database' END,'Synthetic negative',upper(encode(digest(b::text,'sha256'),'hex')),'2026-09-16 12:00:00Z',-590003,'published');
 IF mode='identity' THEN p:=jsonb_set(p,'{identity,documentNumber}','"99995902"'); END IF;
 IF mode='sex' THEN p:=jsonb_set(p,'{identity,sexCode}','"F"'); END IF;
 IF mode='raw_person' THEN p:=jsonb_set(p,'{personId}','"959000000099"'); END IF;
 IF mode='invalid_person' THEN p:=jsonb_set(p,'{personId}','"bad"'); END IF;
 IF mode='invalid_birth_date' THEN p:=jsonb_set(p,'{identity,birthDate}','"2026-02-31"'); END IF;
 IF mode='null_identity' THEN p:=jsonb_set(p,'{identity}','{"fullName":null,"documentNumber":null,"cuil":null,"birthDate":null,"sexCode":null}'); END IF;
 sid:=jsonb_build_object('companyCode',(c->>'company')::bigint,'employeeNumber','95900001')::text;
 sha:=CASE WHEN mode='hash' THEN repeat('0',64) ELSE encode(digest(p::text,'sha256'),'hex') END;
 IF mode<>'missing' THEN
  INSERT INTO source_staging_row(batch_id,source_schema,source_entity,source_id,source_row_number,source_row_sha256,source_payload)
   VALUES(b,c->>'database','legajo',sid,1,sha,p);
 END IF;
 IF mode='duplicate' THEN
  p:=p||'{"syntheticDuplicate":true}'::jsonb;
  INSERT INTO source_staging_row(batch_id,source_schema,source_entity,source_id,source_row_number,source_row_sha256,source_payload)
   VALUES(b,c->>'database','legajo',sid,2,encode(digest(p::text,'sha256'),'hex'),p);
 END IF;
 UPDATE employment_contract SET source_batch_id=b,source_payload=CASE WHEN mode='payload' THEN p||'{"syntheticDrift":true}'::jsonb ELSE p END WHERE id=(c->>'contract')::uuid;
END $$;
DO $$ DECLARE mode text;c jsonb:=pg_temp.h_actor();BEGIN
 FOREACH mode IN ARRAY ARRAY['missing','duplicate','hash','identity','sex','raw_person','invalid_person','invalid_birth_date','null_identity','payload','database'] LOOP
  BEGIN
   PERFORM pg_temp.h_bad_source(mode);
   PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'leave')::uuid)->'record'='null'::jsonb,'negative_leave_'||mode);
   PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'overtime')::uuid,'overtime')->'record'='null'::jsonb,'negative_overtime_'||mode);
   PERFORM pg_temp.h_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.h_list()->'records') WHERE value->>'id'=c->>'leave'),'negative_leave_list_'||mode);
   PERFORM pg_temp.h_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pg_temp.h_list('overtime')->'records') WHERE value->>'id'=c->>'overtime'),'negative_overtime_list_'||mode);
   PERFORM pg_temp.h_error(format('SELECT pg_temp.h_command(''leave'',''submit'',%L::uuid,%L::uuid)',c->>'leave',gen_random_uuid()),'negative_command_'||mode);
   RAISE EXCEPTION 'QA_HISTORY_ROLLBACK_NEGATIVE';
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM<>'QA_HISTORY_ROLLBACK_NEGATIVE' THEN RAISE; END IF;
  END;
 END LOOP;
END $$;

SAVEPOINT history_tenant_session;
DO $$ DECLARE c jsonb:=pg_temp.h_actor();r jsonb;BEGIN
 PERFORM pg_temp.h_assert(action_center_case_source_context_v1((c->>'leave')::uuid,gen_random_uuid(),(c->>'binding')::uuid) IS NULL,'wrong_tenant_helper_hidden');
 PERFORM pg_temp.h_assert(action_center_case_source_context_v1((c->>'leave')::uuid,(c->>'tenant')::uuid,gen_random_uuid()) IS NULL,'wrong_binding_helper_hidden');
 UPDATE tenant_identity_session SET status='revoked',revoked_at=now(),revoked_by_user_email=c->>'email',version=version+1 WHERE id=(c->>'session')::uuid;
END $$;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.h_error('SELECT pg_temp.h_detail((current_setting(''qa.history'')::jsonb->>''leave'')::uuid)','revoked_session','ACTION_SESSION_INVALID');
RESET ROLE;
ROLLBACK TO SAVEPOINT history_tenant_session;

DO $$ DECLARE actual jsonb;BEGIN
 actual:=jsonb_build_array(
  (SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM action_case a WHERE a.id IN ((current_setting('qa.history')::jsonb->>'leave')::uuid,(current_setting('qa.history')::jsonb->>'overtime')::uuid)),
  (SELECT count(*) FROM action_case),(SELECT count(*) FROM action_case_event),
  (SELECT count(*) FROM school_certificate),(SELECT count(*) FROM school_certificate_blob),(SELECT count(*) FROM school_certificate_event),
  (SELECT count(*) FROM payroll_detail_statement),(SELECT count(*) FROM payroll_monthly_fact));
 PERFORM pg_temp.h_assert(actual=current_setting('qa.history_rows_before')::jsonb,'receipts_cases_events_certificates_payroll_unchanged');
 PERFORM pg_temp.h_assert(NOT has_function_privilege('municontrol_actions_runtime_app','action_center_case_source_context_v1(uuid,uuid,uuid)','EXECUTE')
  AND NOT has_function_privilege('municontrol_actions_runtime_app','action_center_assert_case_source_current_v1(uuid,uuid,uuid)','EXECUTE'),'helpers_not_runtime');
END $$;
-- Rehearse the operational rollback without committing it. PostgreSQL must put
-- the exact 059 definitions back when this savepoint is rolled back.
SELECT set_config('qa.history_definitions',(
 SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))::text
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('action_center_case_source_context_v1','action_center_assert_case_source_current_v1',
  'action_center_tenant_list_v2','action_center_tenant_detail_v2','action_center_overtime_list_v1',
  'action_center_overtime_detail_v1','action_center_apply_tenant_command','action_center_apply_overtime_command_v1')
),true) IS NOT NULL AS definitions_captured;
SAVEPOINT history_schema_rollback;
\ir ../rollback/059-action-source-history.sql
DO $$ DECLARE c jsonb:=pg_temp.h_actor();BEGIN
 PERFORM pg_temp.h_assert((SELECT count(*)=6 AND bool_and(position('action_center_case_source_context_v1' IN prosrc)=0
   AND position('action_center_assert_case_source_current_v1' IN prosrc)=0)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname IN ('action_center_tenant_list_v2','action_center_tenant_detail_v2','action_center_overtime_list_v1',
   'action_center_overtime_detail_v1','action_center_apply_tenant_command','action_center_apply_overtime_command_v1')),'rollback_six_original_bodies');
 PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'leave')::uuid)->'record'='null'::jsonb,'rollback_leave_historical_hidden');
 PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'overtime')::uuid,'overtime')->'record'='null'::jsonb,'rollback_overtime_historical_hidden');
END $$;
ROLLBACK TO SAVEPOINT history_schema_rollback;
DO $$ DECLARE actual jsonb;c jsonb:=pg_temp.h_actor();BEGIN
 SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid))) INTO actual
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
 AND p.proname IN ('action_center_case_source_context_v1','action_center_assert_case_source_current_v1',
  'action_center_tenant_list_v2','action_center_tenant_detail_v2','action_center_overtime_list_v1',
  'action_center_overtime_detail_v1','action_center_apply_tenant_command','action_center_apply_overtime_command_v1');
 PERFORM pg_temp.h_assert(actual=current_setting('qa.history_definitions')::jsonb,'rollback_restores_exact_059');
 PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'leave')::uuid)#>>'{record,sourceContext,status}'='historical_read_only','rollback_restores_leave_history');
 PERFORM pg_temp.h_assert(pg_temp.h_detail((c->>'overtime')::uuid,'overtime')#>>'{record,sourceContext,status}'='historical_read_only','rollback_restores_overtime_history');
END $$;
ROLLBACK;
DO $$ DECLARE actual jsonb;BEGIN
 actual:=jsonb_build_array((SELECT count(*) FROM action_case),(SELECT count(*) FROM action_case_event),
  (SELECT count(*) FROM source_staging_row),(SELECT count(*) FROM source_import_batch),
  (SELECT count(*) FROM grh_employees),(SELECT count(*) FROM grh_family),(SELECT count(*) FROM grh_catalog_rows),
  (SELECT count(*) FROM employment_contract),(SELECT count(*) FROM person_identity),
  (SELECT count(*) FROM school_certificate),(SELECT count(*) FROM school_certificate_blob),(SELECT count(*) FROM school_certificate_event),
  (SELECT count(*) FROM payroll_detail_statement),(SELECT count(*) FROM payroll_monthly_fact),
  (SELECT count(*) FROM attendance_canonical_punch),(SELECT count(*) FROM internal_users),(SELECT count(*) FROM tenant_membership),(SELECT count(*) FROM tenant_identity_session));
 IF actual IS DISTINCT FROM current_setting('qa.history_baseline')::jsonb THEN RAISE EXCEPTION 'QA_HISTORY_ROLLBACK_INVARIANT'; END IF;
END $$;
SELECT 'QA_HISTORY_ROLLBACK_PASS' AS result;
