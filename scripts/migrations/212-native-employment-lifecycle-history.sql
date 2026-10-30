-- Complete read projection after SQL136, for both fresh and adopted contracts.
-- Adds one RPC, no tables or mutation/grant changes to existing functions.
-- Source candidate only: successor native qualification must inventory this
-- extra function; the prior 110/136 function-count guards are not replaced.
DO $history_prerequisites$
DECLARE required_signature text;
BEGIN
 IF to_regprocedure('public.native_employment_lifecycle_history_v2(jsonb,uuid)') IS NOT NULL THEN
  RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_HISTORY_ALREADY_INSTALLED';
 END IF;
 IF to_regclass('public.native_employment_lifecycle_proposal') IS NULL THEN
  RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_HISTORY_PREREQUISITE_MISSING';
 END IF;
 FOREACH required_signature IN ARRAY ARRAY[
  'public.native_employment_lifecycle_bootstrap_v2(jsonb,uuid)',
  'public.native_employment_lifecycle_adopted_context_v2(jsonb,text)',
  'public.native_employment_lifecycle_scope_v1(jsonb,jsonb)',
  'public.native_employment_lifecycle_summary_v1(jsonb,public.native_employment_lifecycle_proposal)'
 ] LOOP
  IF to_regprocedure(required_signature) IS NULL THEN
   RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_HISTORY_PREREQUISITE_MISSING';
  END IF;
 END LOOP;
END $history_prerequisites$;

CREATE FUNCTION public.native_employment_lifecycle_history_v2(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE b jsonb; c jsonb; proposals jsonb; total integer;
BEGIN
 -- The existing dispatcher validates the live managed authority, resolves
 -- fresh/adopted identity, and holds the same contract transaction lock as
 -- propose/review. Its twenty-summary bootstrap is returned unchanged.
 b:=public.native_employment_lifecycle_bootstrap_v2(p,target);
 c:=public.native_employment_lifecycle_adopted_context_v2(p);
 IF b->>'scopeVersion' IS DISTINCT FROM public.native_employment_lifecycle_scope_v1(c,b->'subject') THEN
  RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_SCOPE_CHANGED';
 END IF;
 -- Summary and count share one statement snapshot, including review status.
 SELECT coalesce(jsonb_agg(public.native_employment_lifecycle_summary_v1(c,q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb),count(*)
 INTO proposals,total FROM public.native_employment_lifecycle_proposal q
 WHERE q.contract_id=target AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid;
 IF total>100 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT'; END IF;
 IF b->'proposals' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(e.value ORDER BY e.ordinality),'[]'::jsonb) FROM jsonb_array_elements(proposals) WITH ORDINALITY e WHERE e.ordinality<=20)
  OR (b->>'historyTruncated')::boolean IS DISTINCT FROM (total>20) THEN
  RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED';
 END IF;
 RETURN jsonb_build_object('version','native-employment-lifecycle-history.v1','bootstrap',b,'proposals',proposals,'total',total,'complete',true);
END $$;
REVOKE ALL ON FUNCTION public.native_employment_lifecycle_history_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.native_employment_lifecycle_history_v2(jsonb,uuid) TO municontrol_actions_runtime_app;
