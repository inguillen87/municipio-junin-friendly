-- Existing own-run capture and fixed-source reader for approved adoption.
-- Install atomically after SQL136-139 and the SQL125 close guards.
-- No identities, stored runs, salary definitions, permissions or payments change.
DO $$ BEGIN
 IF to_regprocedure('public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)') IS NULL
 OR to_regprocedure('public.payroll_fixed_registry_range_v2(jsonb,uuid,date,date,boolean)') IS NULL
 OR to_regprocedure('public.own_close_guard_v1(jsonb,text,text,uuid[])') IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.payroll_novelty_row'::regclass
  AND attname='legajo_snapshot' AND atttypid='varchar'::regtype AND atttypmod=68 AND NOT attisdropped)
 THEN RAISE EXCEPTION 'OWN_RUN_ADOPTION_PREREQUISITE'; END IF;
END $$;

DO $patch$
DECLARE item record;original pg_proc;updated pg_proc;definition text;metadata jsonb;
 old_call text;new_call text;expected integer;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('capture_v1','jsonb,jsonb,uuid,text','adaa06a85e79e8b5bd07be16d7a5daefeb8ca5be87678756b64e898c710723f2',true),
  ('fixed_v1','jsonb,date,uuid[],text','01b765f1036feb49165efe9b8a45bae251f1fdfc7dc824d53d7744fd2abcaf6d',false)
 ) pins(name,args,sha,runtime) LOOP
  SELECT * INTO original FROM pg_proc WHERE oid=to_regprocedure('public.own_run_'||item.name||'('||item.args||')');
  IF original.oid IS NULL OR original.proowner<>current_user::regrole OR NOT original.prosecdef
   OR original.proconfig IS DISTINCT FROM (CASE WHEN item.runtime
    THEN ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']
    ELSE ARRAY['search_path=pg_catalog, public, pg_temp'] END)::text[]
   OR encode(sha256(convert_to(replace(original.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>item.sha
   OR has_function_privilege('municontrol_actions_runtime_app',original.oid,'EXECUTE')<>item.runtime
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) acl
    WHERE acl.grantee<>original.proowner AND NOT(item.runtime AND acl.grantee='municontrol_actions_runtime_app'::regrole
     AND acl.privilege_type='EXECUTE' AND NOT acl.is_grantable))
  THEN RAISE EXCEPTION 'OWN_RUN_ADOPTION_DEFINITION_CHANGED: %',item.name; END IF;
  definition:=pg_get_functiondef(original.oid);metadata:=to_jsonb(original)-'prosrc';
  old_call:='public.native_employment_lifecycle_range_v1';new_call:='public.payroll_fixed_registry_range_v2';
  expected:=CASE WHEN item.runtime THEN 2 ELSE 1 END;
  IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>expected
  THEN RAISE EXCEPTION 'OWN_RUN_ADOPTION_PATCH_CHANGED'; END IF;
  definition:=replace(definition,old_call,new_call);
  IF item.runtime THEN
   -- The own-run authority names its verified binding sourceBindingId. The
   -- shared fixed reader expects certifiedBindingId when reading interval
   -- decisions. Pass the same verified binding; never fall back to raw dates.
   old_call:='public.payroll_fixed_registry_range_v2(ctx,reg.employment_contract_id,';
   new_call:='public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object(''certifiedBindingId'',ctx->>''sourceBindingId''),reg.employment_contract_id,';
   IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>2
   THEN RAISE EXCEPTION 'OWN_RUN_ADOPTION_PATCH_CHANGED'; END IF;
   definition:=replace(definition,old_call,new_call);
   old_call:='public.payroll_fixed_registry_subject_by_contract_v1';new_call:='public.payroll_fixed_registry_subject_v2';
   IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>1
   THEN RAISE EXCEPTION 'OWN_RUN_ADOPTION_PATCH_CHANGED'; END IF;
   definition:=replace(definition,old_call,new_call);
   old_call:='public.native_employment_lifecycle_review,public.native_salary_event';
   new_call:='public.native_employment_lifecycle_review,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal,public.native_salary_event';
   IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>1
   THEN RAISE EXCEPTION 'OWN_RUN_ADOPTION_PATCH_CHANGED'; END IF;
   definition:=replace(definition,old_call,new_call);
  END IF;
  EXECUTE definition;
  SELECT * INTO updated FROM pg_proc WHERE oid=original.oid;
  IF to_jsonb(updated)-'prosrc' IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'OWN_RUN_ADOPTION_METADATA_CHANGED'; END IF;
 END LOOP;
END $patch$;
