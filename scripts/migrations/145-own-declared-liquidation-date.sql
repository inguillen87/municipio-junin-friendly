-- Opt-in metadata contract. v1 remains unchanged during SQL-before-app release.
CREATE FUNCTION public.own_run_bootstrap_v2(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE value jsonb;rows_json jsonb;BEGIN
 value:=public.own_run_bootstrap_v1(p);
 -- v1 authenticates and locks the current context. Enrich only its exact list;
 -- no names, identities, amounts or other makers' captures are returned.
 SELECT coalesce(jsonb_agg(r.value||jsonb_build_object('liquidationDate',c.body->>'liquidationDate') ORDER BY r.ordinality),'[]') INTO rows_json
 FROM jsonb_array_elements(value->'runs') WITH ORDINALITY r(value,ordinality)
 JOIN public.own_payroll_run_capture c ON c.id=(r.value->>'id')::uuid;
 IF jsonb_array_length(rows_json)<>jsonb_array_length(value->'runs') THEN RAISE EXCEPTION 'OWN_RUN_CONTRACT_INVALID';END IF;
 RETURN value||jsonb_build_object('version','own-payroll-bootstrap.v2','runs',rows_json);
END $$;
REVOKE ALL ON FUNCTION public.own_run_bootstrap_v2(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_run_bootstrap_v2(jsonb) TO municontrol_actions_runtime_app;
