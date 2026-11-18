-- T4 A · compose area workdays/population and approved assignments.
-- No single statement is one MVCC snapshot here: attendance_area_workdays_read_v1 and
-- time_catalog_assignment_view_v2 are plpgsql VOLATILE, and under READ COMMITTED every query inside
-- them takes a fresh snapshot. A confirmed joint cut requires calling this function inside
-- BEGIN ISOLATION LEVEL REPEATABLE READ (not READ ONLY: the session checks take FOR SHARE row
-- locks, refused in read-only transactions); until then the producer declares consistency
-- 'unconfirmed' and the evaluator blocks with JOINT_CUT_UNCONFIRMED.
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
  result_value jsonb; area_value jsonb; catalog_value jsonb;
  binding_id uuid; binding_company bigint; binding_database text;
BEGIN
  -- Inside the producer's REPEATABLE READ transaction every statement below shares one snapshot.
  area_value:=public.attendance_area_workdays_read_v1(p_context,p_query);
  SELECT source.id,source.source_company_id,source.source_database
    INTO binding_id,binding_company,binding_database
  FROM public.platform_tenant_source_binding source
  WHERE source.id=(area_value->'principal'->>'sourceBindingId')::uuid
    AND source.tenant_id=(area_value->'principal'->>'tenantId')::uuid
    AND source.source_system='GRH' AND source.verified IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_INVALID'; END IF;
  -- The actor's catalog authority depends on the account, not on the area: authority, live
  -- capability, segregation of duties and the actor's own employment link. Those refusals leave
  -- with one code of their own, so the bell can tell «this account cannot read cuts» from a failed
  -- area. The same codes raised later for a specific assignment stay what they are.
  BEGIN
    catalog_value:=public.time_catalog_assert_actor_authority_v1(
      p_context||jsonb_build_object('certifiedBindingId',binding_id,'sourceCompanyId',binding_company,'sourceDatabase',binding_database),
      'time.catalog.read');
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM IN ('TIME_CATALOG_AUTHORITY_REQUIRED','TIME_CATALOG_CAPABILITY_REQUIRED','TIME_CATALOG_EMPLOYMENT_REQUIRED',
                   'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID','TIME_CATALOG_NATIVE_PERIOD_INVALID','TENANT_IAM_SOD_CONFLICT') THEN
      RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_ACTOR_NOT_ELIGIBLE' USING ERRCODE='P0001';
    END IF;
    RAISE;
  END;

  WITH scoped_contracts AS MATERIALIZED (
    SELECT contract.value->>'id' AS contract_id
    FROM jsonb_array_elements(area_value->'population'->'contracts') contract(value)
  ), assignment_entries AS MATERIALIZED (
    SELECT entry.id,entry.tenant_id,spec.employment_contract_id
    FROM scoped_contracts contract
    JOIN public.time_assignment_spec spec
      ON spec.employment_contract_id=contract.contract_id::uuid
    JOIN public.time_catalog_entry entry
      ON entry.id=spec.catalog_entry_id AND entry.tenant_id=spec.tenant_id
    WHERE entry.tenant_id=(area_value->'principal'->>'tenantId')::uuid
      AND entry.certified_binding_id=binding_id
      AND entry.catalog_kind='assignment' AND entry.status='approved'
      AND entry.effective_from<=(p_query->>'day')::date
      AND (entry.effective_to IS NULL OR entry.effective_to>=(p_query->>'day')::date)
  ), assignment_views AS MATERIALIZED (
    SELECT entry.id,entry.employment_contract_id,
      public.time_catalog_entry_snapshot_v1(entry.id,entry.tenant_id) AS record,
      public.time_catalog_assignment_view_v2(catalog_value,entry.id) AS assignment
    FROM assignment_entries entry
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
  -- The caller cannot vouch for its own isolation: the database reports it. Only a REPEATABLE READ
  -- transaction lets the producer declare one joint snapshot.
  SELECT jsonb_build_object('area',area_value,'catalog',catalog.data,
    'transaction',jsonb_build_object(
      'isolation',current_setting('transaction_isolation'),
      'readOnly',current_setting('transaction_read_only'),
      'snapshot',pg_current_snapshot()::text))
    INTO result_value
  FROM catalog;

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
