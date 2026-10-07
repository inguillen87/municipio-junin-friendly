-- First-install adapter after SQL136-140 and the existing SQL125 guards.
-- Only the private authoritative roster changes. Saved closes, amounts,
-- pending commands, request keys, owners, grants and public facades stay intact.
DO $patch$
DECLARE original pg_proc;updated pg_proc;definition text;metadata jsonb;
 old_call text;new_call text;
BEGIN
 IF to_regprocedure('public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)') IS NULL
 OR to_regprocedure('public.payroll_fixed_registry_range_v2(jsonb,uuid,date,date,boolean)') IS NULL
 THEN RAISE EXCEPTION 'OWN_CLOSE_ADOPTION_PREREQUISITE';END IF;
 SELECT * INTO original FROM pg_proc WHERE oid=to_regprocedure('public.own_close_roster_v1(jsonb,text)');
 IF original.oid IS NULL OR original.proowner<>current_user::regrole OR NOT original.prosecdef
 OR original.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
 OR encode(sha256(convert_to(replace(original.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>'63dcc6cb15f921d5c36ef9510ad9bceb4b4160d8cb69fcf51c1d0ee5ec750996'
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) acl
  WHERE acl.grantee<>original.proowner)
 THEN RAISE EXCEPTION 'OWN_CLOSE_ADOPTION_DEFINITION_CHANGED';END IF;
 definition:=pg_get_functiondef(original.oid);metadata:=to_jsonb(original)-'prosrc';
 old_call:='public.native_employment_lifecycle_range_v1(ctx,reg.contract_id,';
 new_call:='public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object(''certifiedBindingId'',ctx->>''sourceBindingId''),reg.contract_id,';
 IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>2
 THEN RAISE EXCEPTION 'OWN_CLOSE_ADOPTION_PATCH_CHANGED';END IF;
 definition:=replace(definition,old_call,new_call);
 old_call:='public.payroll_fixed_registry_subject_by_contract_v1';new_call:='public.payroll_fixed_registry_subject_v2';
 IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>1
 THEN RAISE EXCEPTION 'OWN_CLOSE_ADOPTION_PATCH_CHANGED';END IF;
 definition:=replace(definition,old_call,new_call);
 old_call:='public.native_employment_lifecycle_review IN SHARE MODE NOWAIT;';
 new_call:='public.native_employment_lifecycle_review,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal IN SHARE MODE NOWAIT;';
 IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>1
 THEN RAISE EXCEPTION 'OWN_CLOSE_ADOPTION_PATCH_CHANGED';END IF;
 definition:=replace(definition,old_call,new_call);
 old_call:='coalesce(reg.legacy_legajo,'''')!~''^[0-9]{1,9}$''';
 new_call:=$number$reg.legacy_legajo IS NULL OR length(reg.legacy_legajo) NOT BETWEEN 1 AND 64 OR reg.legacy_legajo~'[[:cntrl:]]' OR reg.legacy_legajo~E'[\u0080-\u009f]'$number$;
 IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>1
 THEN RAISE EXCEPTION 'OWN_CLOSE_ADOPTION_PATCH_CHANGED';END IF;
 definition:=replace(definition,old_call,new_call);
 EXECUTE definition;
 SELECT * INTO updated FROM pg_proc WHERE oid=original.oid;
 IF to_jsonb(updated)-'prosrc' IS DISTINCT FROM metadata
 THEN RAISE EXCEPTION 'OWN_CLOSE_ADOPTION_METADATA_CHANGED';END IF;
END $patch$;
