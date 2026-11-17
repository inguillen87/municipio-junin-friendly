-- T4 A · compose area workdays/population and approved assignments in one MVCC statement.
-- Additive preparation only. Codex owns installation; this file grants no new catalog authority.
DO $prerequisite$
BEGIN
  IF to_regprocedure('public.attendance_area_workdays_read_v1(jsonb,jsonb)') IS NULL
    OR to_regprocedure('public.time_catalog_assert_actor_authority_v1(jsonb,text)') IS NULL
    OR to_regprocedure('public.time_catalog_assignment_view_v2(jsonb,uuid)') IS NULL
    OR to_regprocedure('public.time_catalog_entry_snapshot_v1(uuid,uuid)') IS NULL
    OR to_regclass('public.time_catalog_entry') IS NULL
    OR to_regclass('public.time_assignment_spec') IS NULL
    OR to_regrole('municontrol_actions_runtime_app') IS NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_PREREQUISITE';
  END IF;
  IF to_regprocedure('public.attendance_daily_source_read_v1(jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_ALREADY_INSTALLED';
  END IF;
END
$prerequisite$;

CREATE FUNCTION public.attendance_daily_source_read_v1(p_context jsonb,p_query jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
SET timezone='UTC'
AS $$
DECLARE
  area_value jsonb;
  catalog_context jsonb;
  binding_context jsonb;
  catalog_value jsonb;
BEGIN
  -- The existing area function authenticates the live session and returns
  -- workdays + historical area population from one server-scoped SQL source.
  area_value:=public.attendance_area_workdays_read_v1(p_context,p_query);
  IF jsonb_typeof(area_value->'principal') IS DISTINCT FROM 'object'
    OR area_value->'principal'->>'tenantId' IS NULL
    OR area_value->'principal'->>'sourceBindingId' IS NULL
    OR jsonb_typeof(area_value->'population'->'contracts') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_AREA_INVALID';
  END IF;

  -- The native catalog assignment facade is intentionally not executable by
  -- the runtime role. This SECURITY DEFINER wrapper calls it only after the
  -- contract IDs have been restricted to the area population above.
  SELECT jsonb_build_object('sourceCompanyId',binding.source_company_id,'sourceDatabase',binding.source_database)
    INTO binding_context
  FROM public.platform_tenant_source_binding binding
  WHERE binding.id=(area_value->'principal'->>'sourceBindingId')::uuid
    AND binding.tenant_id=(area_value->'principal'->>'tenantId')::uuid
    AND binding.source_system='GRH' AND binding.verified IS TRUE
  FOR SHARE;
  IF binding_context IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_BINDING_INVALID'; END IF;
  catalog_context:=public.time_catalog_assert_actor_authority_v1(
    p_context||binding_context||jsonb_build_object(
      'certifiedBindingId',area_value->'principal'->>'sourceBindingId'
    ),'time.catalog.read'
  );

  WITH scoped_contracts AS MATERIALIZED (
    SELECT contract.value->>'id' AS contract_id
    FROM jsonb_array_elements(area_value->'population'->'contracts') contract(value)
  ), assignment_entries AS MATERIALIZED (
    SELECT entry.id,entry.tenant_id,spec.employment_contract_id
    FROM scoped_contracts contract
    JOIN public.time_assignment_spec spec
      ON spec.employment_contract_id=contract.contract_id::uuid
    JOIN public.time_catalog_entry entry
      ON entry.id=spec.catalog_entry_id
     AND entry.tenant_id=spec.tenant_id
    WHERE entry.tenant_id=(area_value->'principal'->>'tenantId')::uuid
      AND entry.certified_binding_id=(area_value->'principal'->>'sourceBindingId')::uuid
      AND entry.catalog_kind='assignment'
      AND entry.status='approved'
      AND entry.effective_from<=(p_query->>'day')::date
      AND (entry.effective_to IS NULL OR entry.effective_to>=(p_query->>'day')::date)
  ), assignment_views AS MATERIALIZED (
    SELECT entry.id,entry.employment_contract_id,
      public.time_catalog_entry_snapshot_v1(entry.id,entry.tenant_id) AS record,
      public.time_catalog_assignment_view_v2(catalog_context,entry.id) AS assignment
    FROM assignment_entries entry
  )
  SELECT jsonb_build_object(
    'complete',
    (SELECT count(*) FROM scoped_contracts)=
      (SELECT count(DISTINCT employment_contract_id) FROM assignment_views WHERE assignment IS NOT NULL),
    'assignments',
    COALESCE((SELECT jsonb_agg(jsonb_build_object('record',record,'assignment',assignment)
      ORDER BY id) FROM assignment_views WHERE assignment IS NOT NULL),'[]'::jsonb)
  ) INTO catalog_value;

  RETURN jsonb_build_object('area',area_value,'catalog',catalog_value);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_BUSY' USING ERRCODE='P0001';
END
$$;

REVOKE ALL ON FUNCTION public.attendance_daily_source_read_v1(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_daily_source_read_v1(jsonb,jsonb) TO municontrol_actions_runtime_app;
