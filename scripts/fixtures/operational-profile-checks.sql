CREATE FUNCTION pg_temp.qa_expect_error(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; RAISE EXCEPTION 'QA_EXPECTED_DENIAL_MISSING';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM IS DISTINCT FROM expected THEN RAISE EXCEPTION 'QA_WRONG_ERROR: expected %, got %',expected,SQLERRM; END IF; END;
END $$;
CREATE FUNCTION pg_temp.qa_family(write_requested boolean DEFAULT false) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.school_certificate_context_v1('operator@qa.invalid','44444444-4444-4444-8444-444444444444',1,repeat('a',40),'11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',write_requested,'qa-attempt')
$$;
CREATE FUNCTION pg_temp.qa_parameter(capability text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.payroll_parameter_assert_context_v1(jsonb_build_object('actorEmail','operator@qa.invalid','actorSessionId','44444444-4444-4444-8444-444444444444','actorSessionVersion',1,'releaseSha',repeat('a',40),'tenantId','11111111-1111-4111-8111-111111111111','membershipId','22222222-2222-4222-8222-222222222222'),capability)
$$;
DO $checks$ DECLARE ctx jsonb; capability text; p native_employment_catalog_proposal; BEGIN
 PERFORM tenant_iam_assert_no_sod_conflict('22222222-2222-4222-8222-222222222222');
 ctx:=pg_temp.qa_family(true);
 IF ctx->>'actorPersonId'<>'33333333-3333-4333-8333-333333333333' OR ctx->>'sourceCompanyId'<>'101' OR ctx->>'sourceDatabase'<>'GRH_QA' THEN RAISE EXCEPTION 'QA_CONTEXT_LOST'; END IF;
 IF NOT (ctx->'capabilities' ? 'employee.record.propose') THEN RAISE EXCEPTION 'QA_FAMILY_WRITE_UNAVAILABLE'; END IF;
 FOREACH capability IN ARRAY ARRAY['payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','payroll.parameter.audit.read'] LOOP
  IF (pg_temp.qa_parameter(capability)->>'employmentLinked')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'QA_PARAMETER_UNAVAILABLE'; END IF;
 END LOOP;
 p:=ROW(gen_random_uuid(),'22222222-2222-4222-8222-222222222222'::uuid,'33333333-3333-4333-8333-333333333333'::uuid,'operator@qa.invalid');
 ctx:=ctx||jsonb_build_object('actorEmail','operator@qa.invalid');
 IF native_employment_catalog_can_review_v1(ctx,p) THEN RAISE EXCEPTION 'QA_SELF_REVIEW_ALLOWED'; END IF;
 ctx:=ctx||jsonb_build_object('membershipId','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','actorEmail','other@qa.invalid');
 IF native_employment_catalog_can_review_v1(ctx,p) THEN RAISE EXCEPTION 'QA_SAME_PERSON_OTHER_ACCOUNT_ALLOWED'; END IF;
 ctx:=ctx||jsonb_build_object('actorPersonId','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
 IF NOT native_employment_catalog_can_review_v1(ctx,p) THEN RAISE EXCEPTION 'QA_INDEPENDENT_REVIEW_REFUSED'; END IF;
END $checks$;
SAVEPOINT unexpected_pair;
INSERT INTO iam_capability_conflict VALUES('actions.read','workforce.employee.read');
SELECT pg_temp.qa_expect_error('SELECT pg_temp.qa_family()','SCHOOL_CERTIFICATE_PROFILE_CONFLICT');
ROLLBACK TO SAVEPOINT unexpected_pair;
SAVEPOINT unknown_internal_failure;
ALTER TABLE tenant_action_authority RENAME TO qa_missing_authority;
SELECT pg_temp.qa_expect_error('SELECT pg_temp.qa_family()','SCHOOL_CERTIFICATE_SERVICE_UNAVAILABLE');
ROLLBACK TO SAVEPOINT unknown_internal_failure;
DO $unchanged$ BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef('public.tenant_iam_assert_no_sod_conflict(uuid)'::regprocedure),'UTF8')),'hex')<>'60e5a0b4cd6dc1d70621b260ebaaa9077bd42fb36548c36bc69704ed844671e9'
 OR encode(sha256(convert_to(pg_get_functiondef('public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)'::regprocedure),'UTF8')),'hex')<>'674d2ecc976149056f2fef31375a039c50ae48227e06a2937ad227953c0ebee6'
 OR encode(sha256(convert_to(pg_get_functiondef('public.payroll_parameter_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)'::regprocedure),'UTF8')),'hex')<>'1d040954317cd5489f10b80376868ce59576b862736d3923c9f5fb8692b76125'
 THEN RAISE EXCEPTION 'QA_UNRELATED_FUNCTION_CHANGED'; END IF;
 IF tenant_iam_reviewed_operational_pair_v1('QA_OTHER_ROLE','employee.catalog.approve','employee.catalog.propose')
 OR tenant_iam_reviewed_operational_pair_v1('MUNICIPIO_ADMIN_OPERATIVO','arbitrary.approve','arbitrary.prepare')
 OR tenant_iam_reviewed_operational_pair_v1(NULL,'employee.catalog.approve','employee.catalog.propose') THEN RAISE EXCEPTION 'QA_BROAD_EXCEPTION'; END IF;
 RAISE NOTICE 'OPERATIVE_PROFILE_QA: positive, negative, tenant, session, source and maker-checker checks passed';
END $unchanged$;
