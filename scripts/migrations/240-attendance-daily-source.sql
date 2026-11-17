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
  result_value jsonb;
BEGIN
  -- Every read, authority check and projection is inside this one SQL statement.
  -- MATERIALIZED CTEs share the caller statement's MVCC snapshot.
  WITH area_source AS MATERIALIZED (
    SELECT public.attendance_area_workdays_read_v1(p_context,p_query) AS data
  ), binding AS MATERIALIZED (
    SELECT source.id,source.source_company_id,source.source_database
    FROM public.platform_tenant_source_binding source
    CROSS JOIN area_source area
    WHERE source.id=(area.data->'principal'->>'sourceBindingId')::uuid
      AND source.tenant_id=(area.data->'principal'->>'tenantId')::uuid
      AND source.source_system='GRH' AND source.verified IS TRUE
  ), catalog_context AS MATERIALIZED (
    SELECT public.time_catalog_assert_actor_authority_v1(
      p_context||jsonb_build_object(
        'certifiedBindingId',binding.id,
        'sourceCompanyId',binding.source_company_id,
        'sourceDatabase',binding.source_database
      ),'time.catalog.read'
    ) AS data
    FROM area_source area CROSS JOIN binding
  ), scoped_contracts AS MATERIALIZED (
    SELECT contract.value->>'id' AS contract_id
    FROM area_source area
    CROSS JOIN LATERAL jsonb_array_elements(area.data->'population'->'contracts') contract(value)
  ), assignment_entries AS MATERIALIZED (
    SELECT entry.id,entry.tenant_id,spec.employment_contract_id
    FROM scoped_contracts contract
    JOIN public.time_assignment_spec spec
      ON spec.employment_contract_id=contract.contract_id::uuid
    JOIN public.time_catalog_entry entry
      ON entry.id=spec.catalog_entry_id AND entry.tenant_id=spec.tenant_id
    CROSS JOIN area_source area
    WHERE entry.tenant_id=(area.data->'principal'->>'tenantId')::uuid
      AND entry.certified_binding_id=(area.data->'principal'->>'sourceBindingId')::uuid
      AND entry.catalog_kind='assignment' AND entry.status='approved'
      AND entry.effective_from<=(p_query->>'day')::date
      AND (entry.effective_to IS NULL OR entry.effective_to>=(p_query->>'day')::date)
  ), assignment_views AS MATERIALIZED (
    SELECT entry.id,entry.employment_contract_id,
      public.time_catalog_entry_snapshot_v1(entry.id,entry.tenant_id) AS record,
      public.time_catalog_assignment_view_v2(
        catalog_context.data||jsonb_build_object('assignmentReadAllowed',true),entry.id
      ) AS assignment
    FROM assignment_entries entry CROSS JOIN catalog_context
  ), catalog AS MATERIALIZED (
    SELECT jsonb_build_object(
      'complete',
      (SELECT count(*) FROM scoped_contracts)=
        (SELECT count(DISTINCT employment_contract_id) FROM assignment_views WHERE assignment IS NOT NULL),
      'assignments',
      COALESCE((SELECT jsonb_agg(jsonb_build_object('record',record,'assignment',assignment)
        ORDER BY id) FROM assignment_views WHERE assignment IS NOT NULL),'[]'::jsonb)
    ) AS data
  )
  SELECT jsonb_build_object('area',area_source.data,'catalog',catalog.data)
    INTO result_value
  FROM area_source CROSS JOIN catalog;

  IF result_value->'area'->'principal' IS NULL
    OR result_value->'area'->'population'->'contracts' IS NULL
    OR result_value->'catalog' IS NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_INVALID';
  END IF;
  RETURN result_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_BUSY' USING ERRCODE='P0001';
END
$$;

REVOKE ALL ON FUNCTION public.attendance_daily_source_read_v1(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_daily_source_read_v1(jsonb,jsonb) TO municontrol_actions_runtime_app;
