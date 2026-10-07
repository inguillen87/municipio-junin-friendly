-- Adopted municipal operators may use the existing employment-change guard.
-- The adopted context still validates the original session, tenant, link,
-- approved adoption, and active interval. No capability or runtime grant changes.
DO $patch$
DECLARE routine regprocedure:=to_regprocedure('public.native_employment_change_context_v1(jsonb,text)');
  original pg_proc; updated pg_proc; definition text;
  old_call text:='ctx:=public.native_employee_context_v1(p);';
  new_call text:='ctx:=public.native_employment_lifecycle_adopted_context_v2(p);';
BEGIN
 IF routine IS NULL OR to_regprocedure('public.native_employment_lifecycle_adopted_context_v2(jsonb,text)') IS NULL
 THEN RAISE EXCEPTION 'ADOPTED_OPERATOR_CONTEXT_PREREQUISITE'; END IF;
 SELECT * INTO original FROM pg_proc WHERE oid=routine;
 IF original.proowner<>current_user::regrole OR NOT original.prosecdef OR original.prorettype<>'jsonb'::regtype
  OR original.provolatile<>'v' OR original.proargnames IS DISTINCT FROM ARRAY['p','required_capability']::text[]
  OR original.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']::text[]
  OR encode(sha256(convert_to(replace(original.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>'b821464173f73ed7457a2892e246febfe6ab8535df4f37778b2366283c84cb7d'
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) acl
    WHERE acl.grantee<>original.proowner)
 THEN RAISE EXCEPTION 'ADOPTED_OPERATOR_CONTEXT_CHANGED'; END IF;
 definition:=pg_get_functiondef(routine);
 IF (length(definition)-length(replace(definition,old_call,'')))/length(old_call)<>1
 THEN RAISE EXCEPTION 'ADOPTED_OPERATOR_CONTEXT_CHANGED'; END IF;
 EXECUTE replace(definition,old_call,new_call);
 SELECT * INTO updated FROM pg_proc WHERE oid=routine;
 IF updated.oid<>original.oid OR updated.proacl IS DISTINCT FROM original.proacl
  OR updated.proconfig IS DISTINCT FROM original.proconfig OR updated.proargnames IS DISTINCT FROM original.proargnames
  OR updated.proowner<>original.proowner OR NOT updated.prosecdef
 THEN RAISE EXCEPTION 'ADOPTED_OPERATOR_CONTEXT_CHANGED'; END IF;
END $patch$;
