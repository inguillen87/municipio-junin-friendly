export const NATIVE_TIME_HELPERS_SQL = String.raw`CREATE OR REPLACE FUNCTION public.time_catalog_native_subject_v2(
 p_tenant uuid,p_binding uuid,p_contract uuid,p_from date,p_to date
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb; resolved jsonb; person_value uuid;
BEGIN
 IF p_tenant IS NULL OR p_binding IS NULL OR p_contract IS NULL OR p_from IS NULL
   OR (p_to IS NOT NULL AND p_to<p_from) THEN
  RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID' USING ERRCODE='P0001';
 END IF;
 SELECT jsonb_build_object('tenantId',binding.tenant_id,'certifiedBindingId',binding.id,
   'sourceBindingId',binding.id,'sourceCompanyId',binding.source_company_id,
   'sourceDatabase',binding.source_database) INTO ctx
 FROM public.platform_tenant_source_binding binding
 JOIN public.tenant_identity_policy policy ON policy.tenant_id=binding.tenant_id
   AND policy.certified_source_binding_id=binding.id AND policy.tenant_data_plane_ready IS TRUE
 WHERE binding.id=p_binding AND binding.tenant_id=p_tenant
   AND binding.source_system='GRH' AND binding.verified IS TRUE
 FOR SHARE OF binding,policy NOWAIT;
 IF ctx IS NULL THEN RAISE EXCEPTION 'TIME_CATALOG_BINDING_STALE' USING ERRCODE='P0001'; END IF;
 -- Same lock as SQL110 review: a work-period decision cannot race an assignment.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-employment-lifecycle:v1:'||
   p_tenant::text||':'||p_binding::text||':'||p_contract::text,0)) THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE='P0001';
 END IF;
 -- Locks canonical identity and immutable registration before verifying periods.
 -- A native subject never needs a GRH person, import batch or live GRH request.
 IF NOT EXISTS (SELECT 1 FROM public.employment_contract contract
   WHERE contract.id=p_contract AND contract.tenant_id=p_tenant
     AND contract.source_system='MUNICONTROL' AND contract.source_batch_id IS NULL) THEN
  RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID' USING ERRCODE='P0001';
 END IF;
 resolved:=public.payroll_fixed_registry_subject_by_contract_v1(ctx,p_contract,true);
 IF public.native_employment_lifecycle_range_v1(ctx,p_contract,p_from,p_to,true) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'TIME_CATALOG_NATIVE_PERIOD_INVALID' USING ERRCODE='P0001';
 END IF;
 person_value:=(resolved->>'personId')::uuid;
 IF person_value IS NULL THEN RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID' USING ERRCODE='P0001'; END IF;
 RETURN person_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE='P0001';
END $$;

CREATE OR REPLACE FUNCTION public.time_catalog_native_actor_v2(
 p_tenant uuid,p_binding uuid,p_membership uuid
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE target uuid; total integer; person_value uuid;
 today date:=(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
 IF p_tenant IS NULL OR p_binding IS NULL OR p_membership IS NULL THEN
  RAISE EXCEPTION 'TIME_CATALOG_EMPLOYMENT_REQUIRED' USING ERRCODE='P0001';
 END IF;
 -- Serialize mappings and membership revocation until the command finishes.
 LOCK TABLE public.tenant_action_employment_link IN SHARE MODE NOWAIT;
 PERFORM 1 FROM public.tenant_membership membership
 WHERE membership.id=p_membership AND membership.tenant_id=p_tenant
   AND membership.status='active' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'TIME_CATALOG_EMPLOYMENT_REQUIRED' USING ERRCODE='P0001'; END IF;
 SELECT count(*),(array_agg(link.employment_contract_id))[1] INTO total,target
 FROM public.tenant_action_employment_link link
 WHERE link.membership_id=p_membership AND link.tenant_id=p_tenant
   AND link.source_binding_id=p_binding AND link.active IS TRUE;
 IF total<>1 THEN RAISE EXCEPTION 'TIME_CATALOG_EMPLOYMENT_REQUIRED' USING ERRCODE='P0001'; END IF;
 person_value:=public.time_catalog_native_subject_v2(p_tenant,p_binding,target,today,today);
 RETURN person_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE='P0001';
END $$;

CREATE OR REPLACE FUNCTION public.time_catalog_native_person_caps_v2(
 p_tenant uuid,p_person uuid,p_binding uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE member uuid; found_person uuid; capabilities jsonb:='[]'::jsonb; current_caps jsonb;
BEGIN
 IF p_tenant IS NULL OR p_person IS NULL OR p_binding IS NULL THEN
  RAISE EXCEPTION 'TIME_CATALOG_SEPARATION_OF_DUTIES' USING ERRCODE='P0001';
 END IF;
 LOCK TABLE public.tenant_action_employment_link IN SHARE MODE NOWAIT;
 FOR member IN
  SELECT DISTINCT membership.id FROM public.tenant_membership membership
  JOIN public.tenant_action_employment_link link ON link.membership_id=membership.id
   AND link.tenant_id=membership.tenant_id AND link.source_binding_id=p_binding AND link.active IS TRUE
  JOIN public.employment_contract contract ON contract.id=link.employment_contract_id
   AND contract.person_id=p_person AND contract.source_system='MUNICONTROL'
  WHERE membership.tenant_id=p_tenant AND membership.status='active'
  ORDER BY membership.id
 LOOP
  found_person:=public.time_catalog_native_actor_v2(p_tenant,p_binding,member);
  IF found_person IS DISTINCT FROM p_person THEN
   RAISE EXCEPTION 'TIME_CATALOG_PERSON_SOD_CONFLICT' USING ERRCODE='P0001';
  END IF;
  PERFORM public.tenant_iam_assert_no_sod_conflict(member);
  SELECT coalesce(jsonb_agg(e.capability_key),'[]'::jsonb) INTO current_caps
  FROM public.tenant_iam_effective_capabilities(member) e
  WHERE e.capability_key IN ('time.catalog.propose','time.catalog.approve','time.overtime.post');
  capabilities:=capabilities||current_caps;
 END LOOP;
 RETURN capabilities;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE='P0001';
END $$;

REVOKE ALL ON FUNCTION public.time_catalog_native_subject_v2(uuid,uuid,uuid,date,date),
 public.time_catalog_native_actor_v2(uuid,uuid,uuid),
 public.time_catalog_native_person_caps_v2(uuid,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
`;
