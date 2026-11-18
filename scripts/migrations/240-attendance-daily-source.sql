-- T4 A · compose area workdays/population and approved assignments.
-- No single statement is one MVCC snapshot here: attendance_area_workdays_read_v1 is plpgsql
-- VOLATILE, and under READ COMMITTED every query inside it takes a fresh snapshot. A confirmed
-- joint cut requires calling this function inside BEGIN ISOLATION LEVEL REPEATABLE READ (not READ
-- ONLY: the session checks take FOR SHARE row locks, refused in read-only transactions); until
-- then the producer declares consistency 'unconfirmed' and the evaluator blocks with
-- JOINT_CUT_UNCONFIRMED.
-- Authority (decision of Marcelo, 18/11/2026, option B): the area context alone. The caller holds
-- attendance.area.read for this exact area; attendance_area_workdays_read_v1 verifies it and returns
-- the area's population. Assignments are read only for those contracts, valid on that day, and
-- projected without name: contractId, the contract's own legajo (already visible to this reader in
-- the area source) and the linked shift, calendar and rule profile. No general catalog
-- (time.catalog.read) or staff (workforce.employee.read) authority is used or granted.
-- Additive preparation only. Codex owns installation; this file grants no capability.
DO $prerequisite$
BEGIN
  IF to_regprocedure('public.attendance_area_workdays_read_v1(jsonb,jsonb)') IS NULL
    OR to_regprocedure('public.time_catalog_entry_snapshot_v1(uuid,uuid)') IS NULL
    OR to_regclass('public.time_catalog_entry') IS NULL
    OR to_regclass('public.time_assignment_spec') IS NULL
    OR to_regclass('public.employment_contract') IS NULL
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
  result_value jsonb; area_value jsonb; binding_id uuid;
BEGIN
  -- Inside the producer's REPEATABLE READ transaction every statement below shares one snapshot.
  -- This call is the authority: attendance.area.read for this exact area, session and release.
  area_value:=public.attendance_area_workdays_read_v1(p_context,p_query);
  SELECT source.id INTO binding_id
  FROM public.platform_tenant_source_binding source
  WHERE source.id=(area_value->'principal'->>'sourceBindingId')::uuid
    AND source.tenant_id=(area_value->'principal'->>'tenantId')::uuid
    AND source.source_system='GRH' AND source.verified IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_DAILY_SOURCE_INVALID'; END IF;

  WITH scoped_contracts AS MATERIALIZED (
    SELECT (contract.value->>'id')::uuid AS contract_id
    FROM jsonb_array_elements(area_value->'population'->'contracts') contract(value)
  ), assignment_entries AS MATERIALIZED (
    -- Only contracts of the authorized area; only approved assignments valid on the requested day.
    SELECT entry.id,entry.tenant_id,spec.employment_contract_id,
      spec.shift_entry_id,spec.calendar_entry_id,spec.rule_profile_entry_id
    FROM scoped_contracts scoped
    JOIN public.time_assignment_spec spec
      ON spec.employment_contract_id=scoped.contract_id
    JOIN public.time_catalog_entry entry
      ON entry.id=spec.catalog_entry_id AND entry.tenant_id=spec.tenant_id
    WHERE entry.tenant_id=(area_value->'principal'->>'tenantId')::uuid
      AND entry.certified_binding_id=binding_id
      AND entry.catalog_kind='assignment' AND entry.status='approved'
      AND entry.effective_from<=(p_query->>'day')::date
      AND (entry.effective_to IS NULL OR entry.effective_to>=(p_query->>'day')::date)
  ), assignment_views AS MATERIALIZED (
    -- Minimized projection: no name. A contract without a valid own legajo yields no assignment,
    -- so the catalog is declared incomplete and the evaluator blocks instead of guessing.
    SELECT entry.id,entry.employment_contract_id,
      public.time_catalog_entry_snapshot_v1(entry.id,entry.tenant_id) AS record,
      CASE WHEN contract.legacy_legajo ~ '^[1-9][0-9]{0,19}$' THEN jsonb_build_object(
        'target',jsonb_build_object('contractId',entry.employment_contract_id,'legajo',contract.legacy_legajo,'name',NULL),
        'shift',public.time_catalog_entry_snapshot_v1(entry.shift_entry_id,entry.tenant_id),
        'calendar',public.time_catalog_entry_snapshot_v1(entry.calendar_entry_id,entry.tenant_id),
        'ruleProfile',public.time_catalog_entry_snapshot_v1(entry.rule_profile_entry_id,entry.tenant_id)) END AS assignment
    FROM assignment_entries entry
    LEFT JOIN public.employment_contract contract
      ON contract.id=entry.employment_contract_id AND contract.tenant_id=entry.tenant_id
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
