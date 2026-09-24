-- Both detail body formats below are already certified by migration 097; no SQL normalization at runtime.
-- 105: Payroll history, detail and document availability use a dedicated read-only guard.
-- No role, capability, source, payroll value or write/approval guard is modified.
-- Run in one transaction. Drift fails closed; replay accepts only these exact bodies.
DO $payroll_read_105$
DECLARE
 source_body text; helper_body text; definition text; current_hash text; target record; original_acl aclitem[]; original_owner oid;
 guard_signature regprocedure := 'public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)'::regprocedure;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('municontrol:payroll-read:105',0));
 SELECT prosrc INTO source_body FROM pg_proc WHERE oid=guard_signature AND prosecdef IS TRUE AND proconfig=ARRAY['search_path=public, pg_temp'];
 IF source_body IS NULL OR encode(sha256(convert_to(source_body,'UTF8')),'hex')<>'3efaa78aa8a792b7701ac3f6981d1478101040dc0f1e26e10911117fba4bc1df' THEN RAISE EXCEPTION 'PAYROLL_READ_GUARD_DRIFT'; END IF;
 helper_body:=replace(source_body,'  PERFORM tenant_iam_assert_no_sod_conflict(membership_row.id);','  -- Reading an already authorized payroll record does not prepare or approve a change.
  -- Keep the shared write/approval guard unchanged; require current nominal read rights here.
  IF NOT EXISTS (SELECT 1 FROM tenant_iam_effective_capabilities(membership_row.id) e WHERE e.capability_key=''workforce.employee.read'')
     OR NOT EXISTS (SELECT 1 FROM tenant_iam_effective_capabilities(membership_row.id) e WHERE e.capability_key=''payroll.read'') THEN
    RAISE EXCEPTION ''EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED'' USING ERRCODE = ''P0001'';
  END IF;');
 helper_body:=replace(helper_body,'FROM tenant_iam_effective_capabilities(membership_row.id) item;','FROM tenant_iam_effective_capabilities(membership_row.id) item
  WHERE item.capability_key IN (''actions.read'',''workforce.employee.read'',''payroll.read'');');
 IF encode(sha256(convert_to(helper_body,'UTF8')),'hex')<>'cc4301f2d04ab89949e57cda565e78c6097a27ea5d44db93bae6f0d2630eebff' THEN RAISE EXCEPTION 'PAYROLL_READ_HELPER_BUILD_DRIFT'; END IF;
 -- Check every existing function before changing anything.
 FOR target IN SELECT * FROM (VALUES
   ('public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)','80c11c8410657b17a0739d41d11fe45c398ec309f26d5db3ea819c83eda1b827','ad5c9ce9df693d51e326b1708c79977e11fb1c49901be1c8d17d013d3fb4109c'),
   ('public.employee_payroll_documents_v1(text,uuid,integer,text,uuid,uuid,uuid)','726d9068326a7dbc9659f2509f958d2ae062a546e0a7cd91b7b5e6abcb4cbb25','fbb185e0809d25c0244c841d07b8fe44f26c6780115f8a36be3d692d7c3f50b9'),
   ('public.employee_payroll_history_v1(text,uuid,integer,text,uuid,uuid,uuid,integer,integer,integer)','75c0e1718160f906f0184e1aadec85ca795f7199b475327a479a5363bed00983','0b468fcd2484e13369e814d123bdfa81cd00ef45a7bfdb8e80faf6734b026fac')
 ) AS pins(signature,old_hash,new_hash) LOOP
   SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') INTO current_hash FROM pg_proc WHERE oid=to_regprocedure(target.signature) AND prosecdef IS TRUE AND proconfig=ARRAY['search_path=public, pg_temp'] AND proowner=(SELECT proowner FROM pg_proc WHERE oid=guard_signature);
   IF current_hash IS NULL OR (current_hash NOT IN(target.old_hash,target.new_hash) AND NOT (target.signature='public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)' AND current_hash IN('c772dbca2437db351364cd34a572bc2c09185a21715b1504a09390d44f73db2e','4d39bc0df9e3a0d68808bdf8229a997cf9b708a45ea134815e4e8fb2fa1a1c1f'))) THEN RAISE EXCEPTION 'PAYROLL_READER_SOURCE_DRIFT'; END IF;
 END LOOP;
 IF to_regprocedure('public.employee_payroll_assert_read_session_v1(text,uuid,integer,text,uuid,uuid)') IS NOT NULL THEN
   SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') INTO current_hash FROM pg_proc WHERE oid=to_regprocedure('public.employee_payroll_assert_read_session_v1(text,uuid,integer,text,uuid,uuid)');
   IF current_hash<>'cc4301f2d04ab89949e57cda565e78c6097a27ea5d44db93bae6f0d2630eebff' THEN RAISE EXCEPTION 'PAYROLL_READ_HELPER_DRIFT'; END IF;
 END IF;
 SELECT pg_get_functiondef(guard_signature) INTO definition;
 definition:=replace(definition,'FUNCTION public.action_center_assert_tenant_read_session_v2(','FUNCTION public.employee_payroll_assert_read_session_v1(');
 definition:=replace(definition,source_body,helper_body);
 EXECUTE definition;
 EXECUTE 'REVOKE ALL ON FUNCTION public.employee_payroll_assert_read_session_v1(text,uuid,integer,text,uuid,uuid) FROM PUBLIC, municontrol_actions_runtime_app';
 FOR target IN SELECT * FROM (VALUES
   ('public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)','80c11c8410657b17a0739d41d11fe45c398ec309f26d5db3ea819c83eda1b827','ad5c9ce9df693d51e326b1708c79977e11fb1c49901be1c8d17d013d3fb4109c'),
   ('public.employee_payroll_documents_v1(text,uuid,integer,text,uuid,uuid,uuid)','726d9068326a7dbc9659f2509f958d2ae062a546e0a7cd91b7b5e6abcb4cbb25','fbb185e0809d25c0244c841d07b8fe44f26c6780115f8a36be3d692d7c3f50b9'),
   ('public.employee_payroll_history_v1(text,uuid,integer,text,uuid,uuid,uuid,integer,integer,integer)','75c0e1718160f906f0184e1aadec85ca795f7199b475327a479a5363bed00983','0b468fcd2484e13369e814d123bdfa81cd00ef45a7bfdb8e80faf6734b026fac')
 ) AS pins(signature,old_hash,new_hash) LOOP
   SELECT pg_get_functiondef(oid),proacl,proowner INTO definition,original_acl,original_owner FROM pg_proc WHERE oid=to_regprocedure(target.signature);
   definition:=replace(definition,'action_center_assert_tenant_read_session_v2(','employee_payroll_assert_read_session_v1(');
   EXECUTE definition;
   IF EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(target.signature) AND (proacl IS DISTINCT FROM original_acl OR proowner<>original_owner)) THEN RAISE EXCEPTION 'PAYROLL_READER_ACL_CHANGED'; END IF;
   SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') INTO current_hash FROM pg_proc WHERE oid=to_regprocedure(target.signature);
   IF current_hash<>target.new_hash AND NOT (target.signature='public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)' AND current_hash='4d39bc0df9e3a0d68808bdf8229a997cf9b708a45ea134815e4e8fb2fa1a1c1f') THEN RAISE EXCEPTION 'PAYROLL_READER_PATCH_DRIFT'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid='public.employee_payroll_assert_read_session_v1(text,uuid,integer,text,uuid,uuid)'::regprocedure AND a.privilege_type='EXECUTE' AND a.grantee<>p.proowner) THEN RAISE EXCEPTION 'PAYROLL_READ_HELPER_EXPOSED'; END IF;
 IF has_function_privilege('municontrol_actions_runtime_app','public.employee_payroll_assert_read_session_v1(text,uuid,integer,text,uuid,uuid)','EXECUTE') THEN RAISE EXCEPTION 'PAYROLL_READ_HELPER_EXPOSED'; END IF;
 SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') INTO current_hash FROM pg_proc WHERE oid=guard_signature;
 IF current_hash<>'3efaa78aa8a792b7701ac3f6981d1478101040dc0f1e26e10911117fba4bc1df' THEN RAISE EXCEPTION 'PAYROLL_WRITE_GUARD_CHANGED'; END IF;
END
$payroll_read_105$;
