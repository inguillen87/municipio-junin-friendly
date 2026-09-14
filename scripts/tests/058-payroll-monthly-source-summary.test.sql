\set ON_ERROR_STOP on
-- Synthetic rows only. This script refuses all remote/production databases.
DO $$ BEGIN
 IF current_database() NOT IN ('restore_check','restore_schooling_20260914','restore_monthly_20260914')
  OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>55439 THEN
  RAISE EXCEPTION 'QA_MONTHLY_LOCAL_RESTORE_REQUIRED';
 END IF;
 PERFORM set_config('qa.monthly_baseline',jsonb_build_array(
  (SELECT count(*) FROM payroll_detail_dataset),(SELECT count(*) FROM payroll_detail_statement),
  (SELECT count(*) FROM payroll_monthly_source_read_event),(SELECT count(*) FROM internal_users),
  (SELECT count(*) FROM tenant_membership),(SELECT count(*) FROM tenant_identity_session),
  (SELECT count(*) FROM payroll_run),(SELECT count(*) FROM payroll_monthly_fact))::text,false);
END $$;
BEGIN;
SET LOCAL statement_timeout='45s';
SET LOCAL lock_timeout='3s';
CREATE FUNCTION pg_temp.qa_monthly_assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'QA_MONTHLY_ASSERT_%',label; END IF; END $$;
CREATE FUNCTION pg_temp.qa_monthly_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE observed text; BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN observed:=SQLERRM; END;
 IF observed IS DISTINCT FROM expected THEN RAISE EXCEPTION 'QA_MONTHLY_REJECTION_%',expected; END IF;
END $$;
CREATE FUNCTION pg_temp.qa_monthly_read(period text DEFAULT NULL,ids uuid[] DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE c jsonb:=current_setting('qa.monthly_context')::jsonb;
BEGIN RETURN payroll_monthly_source_summary_v1(c->>'email',(c->>'session')::uuid,1,c->>'release',
 (c->>'tenant')::uuid,(c->>'membership')::uuid,period,ids); END $$;
CREATE FUNCTION pg_temp.qa_monthly_dataset(
 p_type text,p_date date,p_period integer,p_month integer,p_sha text,p_catalog jsonb,p_statements jsonb,
 p_count integer DEFAULT NULL,p_company_delta bigint DEFAULT 0,p_correct_hash boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE c jsonb:=current_setting('qa.monthly_context')::jsonb;id uuid:=gen_random_uuid();n integer;
BEGIN
 SELECT coalesce(sum(jsonb_array_length(x->'lines')),0)::integer INTO n FROM jsonb_array_elements(p_statements) x;
 INSERT INTO payroll_detail_dataset(id,tenant_id,source_binding_id,source_sha256,payload_sha256,source_database,source_label,
  company_id,payroll_date,source_period,source_month,payroll_type,source_closed_flag,concept_catalog,statement_count,line_count)
 VALUES(id,(c->>'tenant')::uuid,(c->>'binding')::uuid,p_sha,encode(digest(id::text,'sha256'),'hex'),c->>'database',
  'Fuente sintética QA 058',(c->>'company')::bigint+p_company_delta,p_date,p_period,p_month,p_type,
  CASE WHEN p_type='M' THEN NULL ELSE 1 END,p_catalog,coalesce(p_count,jsonb_array_length(p_statements)),n);
 INSERT INTO payroll_detail_statement(dataset_id,tenant_id,source_legajo,lines,statement_sha256)
 SELECT id,(c->>'tenant')::uuid,x->>'legajo',x->'lines',CASE WHEN p_correct_hash THEN encode(digest((x->'lines')::text,'sha256'),'hex') ELSE repeat('0',64) END
 FROM jsonb_array_elements(p_statements) x;
 RETURN id;
END $$;

DO $$ DECLARE c record;email text:='qa-monthly-'||gen_random_uuid()||'@example.invalid';
 membership uuid:=gen_random_uuid();session uuid:=gen_random_uuid();cap text;catalog jsonb;first_id uuid;second_id uuid;
BEGIN
 SELECT p.tenant_id,p.certified_release_sha,b.id binding_id,b.source_company_id,b.source_database INTO c
 FROM tenant_identity_policy p JOIN platform_tenant_source_binding b ON b.id=p.certified_source_binding_id AND b.tenant_id=p.tenant_id
 JOIN platform_tenant t ON t.id=p.tenant_id AND t.status='active'
 WHERE p.tenant_data_plane_ready AND b.verified AND b.source_system='GRH' ORDER BY p.tenant_id LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'QA_MONTHLY_CERTIFIED_FIXTURE_REQUIRED'; END IF;
 INSERT INTO internal_users(email,display_name,role,password_hash,active,auth_mode,identity_version)
 VALUES(email,'Operador mensual sintético','EMPLEADO',NULL,true,'managed',1);
 INSERT INTO tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at)
 VALUES(membership,c.tenant_id,email,'JUNIN_ASISTENCIA_REVISOR','active',email,now());
 INSERT INTO tenant_action_authority(membership_id,tenant_id) VALUES(membership,c.tenant_id) ON CONFLICT DO NOTHING;
 INSERT INTO tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,status,device_label,last_seen_at,expires_at)
 VALUES(session,email,c.tenant_id,'membership','mfa',1,1,'active','QA mensual rollback',now(),now()+interval '1 hour');
 FOREACH cap IN ARRAY ARRAY['actions.read','payroll.read'] LOOP
  INSERT INTO tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email)
  VALUES(membership,cap,true,false,'Prueba sintética rollback',email);
 END LOOP;
 PERFORM set_config('qa.monthly_context',jsonb_build_object('email',email,'session',session,'release',c.certified_release_sha,
  'tenant',c.tenant_id,'binding',c.binding_id,'membership',membership,'database',c.source_database,'company',c.source_company_id)::text,true);
 catalog:='{"10":{"description":"Concepto sintético","unit":"V","totalGroup":"993"},"993":{"description":"Total sintético","unit":null,"totalGroup":null},"996":{"description":"Retención sintética","unit":"V","totalGroup":null}}';
 PERFORM set_config('qa.monthly_catalog',catalog::text,true);
 first_id:=pg_temp.qa_monthly_dataset('M','2096-09-01',2096,8,repeat('a',64),catalog,
  '[{"legajo":"990058001","lines":[{"code":"10","quantity":"1.25","amount":"9007199254740.01"},{"code":"993","quantity":null,"amount":"9007199254740.01"}]},
    {"legajo":"990058002","lines":[{"code":"10","quantity":"-0.25","amount":"0.09"},{"code":"996","quantity":"1.00","amount":null}]}]');
 second_id:=pg_temp.qa_monthly_dataset('V','2096-08-20',2096,8,repeat('a',64),catalog,
  '[{"legajo":"990058001","lines":[{"code":"10","quantity":"2.00","amount":"0.10"},{"code":"996","quantity":null,"amount":"-2.00"}]}]');
 PERFORM set_config('qa.monthly_ids',ARRAY[first_id,second_id]::text,true);
END $$;

SET LOCAL ROLE municontrol_actions_runtime_app;
DO $$ DECLARE ids uuid[]:=current_setting('qa.monthly_ids')::uuid[];r jsonb;x jsonb;other jsonb;
BEGIN
 r:=pg_temp.qa_monthly_read('2096-08');
 PERFORM pg_temp.qa_monthly_assert(r->>'mode'='catalog' AND r->>'version'='payroll-monthly-source-summary.v1'
  AND r->>'total'='2' AND jsonb_array_length(r->'items')=2,'catalog_complete');
 PERFORM pg_temp.qa_monthly_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(r->'items') item
  WHERE item->>'date'='2096-09-01' AND item->>'sourcePeriod'='2096' AND item->>'sourceMonth'='8' AND item->>'closureStatus'='unknown'),'period_not_posting_date_and_unknown_close');
 PERFORM pg_temp.qa_monthly_assert(pg_temp.qa_monthly_read('2096-10')->>'total'='0','empty_catalog');
 r:=pg_temp.qa_monthly_read('2096-08',ids);other:=pg_temp.qa_monthly_read('2096-08',ARRAY[ids[2],ids[1]]);
 PERFORM pg_temp.qa_monthly_assert(r=other,'order_independent_hash');
 PERFORM pg_temp.qa_monthly_assert(r->'counts'='{"datasetCount":2,"statementParticipations":3,"distinctLegajos":2,"lineCount":6,"conceptCount":3}'::jsonb,'participations_vs_unique_legajos');
 PERFORM pg_temp.qa_monthly_assert(r->'scope'='{"kind":"selected_available_general","completeMonthCertified":false,"payrollCalculated":false,"payrollPosted":false,"official":false}'::jsonb,'scope_not_approval_or_month_completeness');
 SELECT value INTO x FROM jsonb_array_elements(r->'rows') WHERE value->>'code'='10';
 PERFORM pg_temp.qa_monthly_assert(x->>'sourceRows'='3' AND x->>'distinctLegajos'='2' AND x->>'quantity'='3.00'
  AND x->>'amount'='9007199254740.20' AND x->>'missingAmounts'='0','exact_decimal_aggregate');
 SELECT value INTO x FROM jsonb_array_elements(r->'rows') WHERE value->>'code'='996';
 PERFORM pg_temp.qa_monthly_assert(x->'amount'='null'::jsonb AND x->'quantity'='null'::jsonb
  AND x->>'missingAmounts'='1' AND x->>'missingQuantities'='1','missing_is_not_zero');
 PERFORM pg_temp.qa_monthly_assert(jsonb_array_length(r->'rows')=3 AND NOT r ? 'totalAmount'
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(r->'rows') item WHERE item->>'code'='993'),'totalizers_separate');
 PERFORM pg_temp.qa_monthly_assert(NOT r::text ~ '99005800|example.invalid|source_legajo','no_nominal_response');
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-13'')','PAYROLL_MONTHLY_SOURCE_QUERY_INVALID');
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(NULL,current_setting(''qa.monthly_ids'')::uuid[])','PAYROLL_MONTHLY_SOURCE_QUERY_INVALID');
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'',ARRAY[]::uuid[])','PAYROLL_MONTHLY_SOURCE_QUERY_INVALID');
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'',ARRAY[NULL]::uuid[])','PAYROLL_MONTHLY_SOURCE_QUERY_INVALID');
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'',ARRAY(SELECT gen_random_uuid() FROM generate_series(1,25)))','PAYROLL_MONTHLY_SOURCE_QUERY_INVALID');
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'',ARRAY[ARRAY[gen_random_uuid()],ARRAY[gen_random_uuid()]])','PAYROLL_MONTHLY_SOURCE_QUERY_INVALID');
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'',current_setting(''qa.monthly_ids'')::uuid[]||current_setting(''qa.monthly_ids'')::uuid[])','PAYROLL_MONTHLY_SOURCE_QUERY_INVALID');
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-07'',current_setting(''qa.monthly_ids'')::uuid[])','PAYROLL_MONTHLY_SOURCE_MIXED_PERIOD');
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'',ARRAY[gen_random_uuid()])','PAYROLL_MONTHLY_SOURCE_NOT_FOUND');
 PERFORM pg_temp.qa_monthly_assert(NOT has_table_privilege(current_user,'payroll_monthly_source_read_event','SELECT')
  AND NOT has_table_privilege(current_user,'payroll_detail_statement','SELECT'),'runtime_facade_only');
END $$;
RESET ROLE;

DO $$ DECLARE ids uuid[]:=current_setting('qa.monthly_ids')::uuid[];catalog jsonb:=current_setting('qa.monthly_catalog')::jsonb;
 one jsonb:='[{"legajo":"990058003","lines":[{"code":"10","quantity":"1.00","amount":"0.01"}]}]';id uuid;query text;expected text;variant integer;
BEGIN
 FOR variant IN 1..9 LOOP
  -- Subtransaction rolls each rejected fixture back; preceding fixtures survive.
  BEGIN
   CASE variant
    WHEN 1 THEN id:=pg_temp.qa_monthly_dataset('M','2096-09-01',2096,8,repeat('b',64),catalog,one); expected:='DUPLICATE_REVISION';
    WHEN 2 THEN id:=pg_temp.qa_monthly_dataset('O','2096-08-21',2096,8,repeat('b',64),catalog,one); expected:='SOURCE_DRIFT';
    WHEN 3 THEN id:=pg_temp.qa_monthly_dataset('O','2096-08-21',2096,8,repeat('a',64),jsonb_set(catalog,'{10,unit}','"H"'),one); expected:='CATALOG_CONFLICT';
    WHEN 4 THEN id:=pg_temp.qa_monthly_dataset('O','2096-08-21',2096,8,repeat('a',64),catalog,one,2); expected:='SOURCE_INCOMPLETE';
    WHEN 5 THEN id:=pg_temp.qa_monthly_dataset('O','2096-08-21',2096,8,repeat('a',64),catalog,one,NULL,1); expected:='NOT_FOUND';
    WHEN 6 THEN id:=pg_temp.qa_monthly_dataset('O','2096-08-21',2096,8,repeat('a',64),catalog-'10',one); expected:='SOURCE_INCOMPLETE';
    WHEN 7 THEN id:=pg_temp.qa_monthly_dataset('O','2096-08-21',2096,8,repeat('a',64),catalog,jsonb_set(one,'{0,lines,0,amount}','0.01')); expected:='SOURCE_DRIFT';
    WHEN 8 THEN id:=pg_temp.qa_monthly_dataset('O','2096-08-21',2096,8,repeat('a',64),catalog,jsonb_set(one,'{0,lines}',(one#>'{0,lines}')||(one#>'{0,lines}'))); expected:='SOURCE_DRIFT';
    WHEN 9 THEN id:=pg_temp.qa_monthly_dataset('O','2096-08-21',2096,8,repeat('a',64),catalog,one,NULL,0,false); expected:='SOURCE_DRIFT';
   END CASE;
   query:=format('SELECT pg_temp.qa_monthly_read(%L,%L::uuid[])','2096-08',(ids||id)::text);
   SET LOCAL ROLE municontrol_actions_runtime_app;
   PERFORM pg_temp.qa_monthly_error(query,'PAYROLL_MONTHLY_SOURCE_'||expected);
   RESET ROLE;
   RAISE EXCEPTION USING ERRCODE='ZX058',MESSAGE='ROLLBACK_SYNTHETIC_CASE';
  EXCEPTION WHEN SQLSTATE 'ZX058' THEN NULL;
  END;
 END LOOP;
END $$;

SAVEPOINT boundary_fixtures;
DO $$ DECLARE catalog jsonb:=current_setting('qa.monthly_catalog')::jsonb;many_catalog jsonb;lines jsonb;one jsonb;
 id uuid;ids uuid[];r jsonb;i integer;
BEGIN
 SELECT jsonb_agg(jsonb_build_object('legajo',(990058100+n)::text,'lines',jsonb_build_array(
  jsonb_build_object('code','10','quantity','1.00','amount','9999999999999.99')))) INTO one FROM generate_series(1,10) n;
 id:=pg_temp.qa_monthly_dataset('O','2096-08-22',2096,8,repeat('a',64),catalog,one);
 SET LOCAL ROLE municontrol_actions_runtime_app;
 r:=pg_temp.qa_monthly_read('2096-08',ARRAY[id]);
 PERFORM pg_temp.qa_monthly_assert(r#>>'{rows,0,amount}'='99999999999999.90','aggregate_beyond_safe_javascript_cents');
 RESET ROLE;
 SELECT jsonb_object_agg(n::text,jsonb_build_object('description','Concepto sintético '||n,'unit','V','totalGroup',NULL)),
  jsonb_agg(jsonb_build_object('code',n::text,'quantity','1.00','amount','0.01') ORDER BY n)
 INTO many_catalog,lines FROM generate_series(1,1000) n;
 one:=jsonb_build_array(jsonb_build_object('legajo','990058300','lines',lines));
 id:=pg_temp.qa_monthly_dataset('P','2096-08-23',2096,8,repeat('a',64),many_catalog,one);
 SET LOCAL ROLE municontrol_actions_runtime_app;
 r:=pg_temp.qa_monthly_read('2096-08',ARRAY[id]);
 PERFORM pg_temp.qa_monthly_assert(jsonb_array_length(r->'rows')=1000 AND r#>>'{counts,lineCount}'='1000','exact_concept_limit');
 RESET ROLE;
 many_catalog:=many_catalog||jsonb_build_object('1001',jsonb_build_object('description','Concepto sintético 1001','unit','V','totalGroup',NULL));
 one:=one||jsonb_build_array(jsonb_build_object('legajo','990058301','lines',jsonb_build_array(jsonb_build_object('code','1001','quantity','1.00','amount','0.01'))));
 id:=pg_temp.qa_monthly_dataset('S','2096-08-24',2096,8,repeat('a',64),many_catalog,one);
 SET LOCAL ROLE municontrol_actions_runtime_app;
 PERFORM pg_temp.qa_monthly_error(format('SELECT pg_temp.qa_monthly_read(%L,%L::uuid[])','2096-08',ARRAY[id]::text),'PAYROLL_MONTHLY_SOURCE_ROW_LIMIT');
 RESET ROLE;
 one:='[{"legajo":"990058400","lines":[{"code":"10","quantity":"1.00","amount":"0.01"}]}]';
 FOR i IN 1..240 LOOP
  id:=pg_temp.qa_monthly_dataset('M',DATE '2095-01-01'+i,2095,8,repeat('c',64),catalog,one);
  IF i<=24 THEN ids:=array_append(ids,id); END IF;
 END LOOP;
 SET LOCAL ROLE municontrol_actions_runtime_app;
 r:=pg_temp.qa_monthly_read('2095-08');
 PERFORM pg_temp.qa_monthly_assert(r->>'total'='240' AND jsonb_array_length(r->'items')=240,'exact_catalog_limit');
 r:=pg_temp.qa_monthly_read('2095-08',ids);
 PERFORM pg_temp.qa_monthly_assert(r#>>'{counts,datasetCount}'='24' AND r#>>'{counts,statementParticipations}'='24'
  AND r#>>'{counts,distinctLegajos}'='1' AND r#>>'{rows,0,amount}'='0.24','exact_selection_limit');
 RESET ROLE;
 id:=pg_temp.qa_monthly_dataset('M',DATE '2095-01-01'+241,2095,8,repeat('c',64),catalog,one);
 SET LOCAL ROLE municontrol_actions_runtime_app;
 PERFORM pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2095-08'')','PAYROLL_MONTHLY_SOURCE_ROW_LIMIT');
 RESET ROLE;
END $$;
ROLLBACK TO SAVEPOINT boundary_fixtures;

SAVEPOINT denied_capability;
UPDATE tenant_membership_capability_override SET allow_override=false,deny_override=true
 WHERE membership_id=(current_setting('qa.monthly_context')::jsonb->>'membership')::uuid AND capability_key='payroll.read';
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'')','PAYROLL_MONTHLY_SOURCE_CAPABILITY_REQUIRED');
RESET ROLE;
ROLLBACK TO SAVEPOINT denied_capability;
SAVEPOINT revoked_session;
UPDATE tenant_identity_session SET status='revoked',version=version+1,revoked_at=clock_timestamp(),
 revoked_by_user_email=current_setting('qa.monthly_context')::jsonb->>'email'
 WHERE id=(current_setting('qa.monthly_context')::jsonb->>'session')::uuid;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'')','PAYROLL_MONTHLY_SOURCE_SESSION_INVALID');
RESET ROLE;
ROLLBACK TO SAVEPOINT revoked_session;
SAVEPOINT wrong_release;
SELECT set_config('qa.monthly_context',jsonb_set(current_setting('qa.monthly_context')::jsonb,'{release}',to_jsonb(repeat('0',40)))::text,true) IS NOT NULL AS fixture_prepared;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'')','PAYROLL_MONTHLY_SOURCE_RELEASE_NOT_CERTIFIED');
RESET ROLE;
ROLLBACK TO SAVEPOINT wrong_release;
SAVEPOINT wrong_tenant;
SELECT set_config('qa.monthly_context',jsonb_set(current_setting('qa.monthly_context')::jsonb,'{tenant}',to_jsonb(gen_random_uuid()))::text,true) IS NOT NULL AS fixture_prepared;
SET LOCAL ROLE municontrol_actions_runtime_app;
SELECT pg_temp.qa_monthly_error('SELECT pg_temp.qa_monthly_read(''2096-08'')','PAYROLL_MONTHLY_SOURCE_SESSION_INVALID');
RESET ROLE;
ROLLBACK TO SAVEPOINT wrong_tenant;

DO $$ BEGIN
 PERFORM pg_temp.qa_monthly_assert(EXISTS(SELECT 1 FROM payroll_monthly_source_read_event
  WHERE actor_session_id=(current_setting('qa.monthly_context')::jsonb->>'session')::uuid AND mode='summary'
  AND dataset_count=2 AND row_count=3),'small_aggregate_audit');
END $$;
SAVEPOINT truncate_audit;
SELECT pg_temp.qa_monthly_error('TRUNCATE TABLE payroll_monthly_source_read_event','EMPLOYEE_PAYROLL_READ_APPEND_ONLY');
ROLLBACK TO SAVEPOINT truncate_audit;
SELECT 'QA_MONTHLY_SOURCE_TRANSACTIONAL_CHECKS_PASSED' AS result;
ROLLBACK;
DO $$ BEGIN
 IF current_setting('qa.monthly_baseline')::jsonb IS DISTINCT FROM jsonb_build_array(
  (SELECT count(*) FROM payroll_detail_dataset),(SELECT count(*) FROM payroll_detail_statement),
  (SELECT count(*) FROM payroll_monthly_source_read_event),(SELECT count(*) FROM internal_users),
  (SELECT count(*) FROM tenant_membership),(SELECT count(*) FROM tenant_identity_session),
  (SELECT count(*) FROM payroll_run),(SELECT count(*) FROM payroll_monthly_fact)) THEN
  RAISE EXCEPTION 'QA_MONTHLY_ROLLBACK_MISMATCH';
 END IF;
END $$;
SELECT 'QA_MONTHLY_SOURCE_ROLLBACK_VERIFIED' AS result;
