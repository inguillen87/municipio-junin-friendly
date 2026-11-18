-- T4 · B · areas × sites a bell reader may read: the account's exact attendance.area.read scopes,
-- crossed with the marking sites of the devices that approved, unretired expected-device
-- declarations of that area cover in the requested window. Additive preparation only.
-- Codex owns installation; requires the reviewed attendance-area authority and expected-devices
-- sources of PR297 (attendance_area_context_v1 and the declaration tables). No grant of capability,
-- scope or role. Returns only area source ids and site keys: no contract, person, label or device id.
DO $prerequisite$
BEGIN
  IF to_regprocedure('public.attendance_area_context_v1(jsonb,text)') IS NULL
    OR to_regclass('public.attendance_expected_device_proposal') IS NULL
    OR to_regclass('public.attendance_expected_device_review') IS NULL
    OR to_regclass('public.attendance_expected_device_retirement') IS NULL
    OR to_regclass('public.attendance_device') IS NULL
    OR to_regclass('public.attendance_marking_site') IS NULL
    OR to_regrole('municontrol_actions_runtime_app') IS NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_DAILY_SCOPES_PREREQUISITE';
  END IF;
  IF to_regprocedure('public.attendance_daily_scopes_read_v1(jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_DAILY_SCOPES_ALREADY_INSTALLED';
  END IF;
END
$prerequisite$;

CREATE FUNCTION public.attendance_daily_scopes_read_v1(p_context jsonb,p_query jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
SET timezone='UTC'
AS $$
DECLARE
  ctx jsonb; first_day date; last_day date; result_value jsonb;
BEGIN
  IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_query))<>2
    OR NOT p_query ?& ARRAY['firstDay','lastDay']
    OR jsonb_typeof(p_query->'firstDay') IS DISTINCT FROM 'string' OR jsonb_typeof(p_query->'lastDay') IS DISTINCT FROM 'string'
    OR p_query->>'firstDay'!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' OR p_query->>'lastDay'!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION 'ATTENDANCE_DAILY_SCOPES_QUERY_INVALID';
  END IF;
  BEGIN
    first_day:=(p_query->>'firstDay')::date; last_day:=(p_query->>'lastDay')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'ATTENDANCE_DAILY_SCOPES_QUERY_INVALID';
  END;
  IF last_day<first_day OR last_day-first_day>6 THEN RAISE EXCEPTION 'ATTENDANCE_DAILY_SCOPES_QUERY_INVALID'; END IF;
  -- Rechecks session, certified release/binding, live capabilities and the exact area grants.
  ctx:=public.attendance_area_context_v1(p_context,'attendance.area.read');
  WITH scope AS (
    SELECT s->>'organizationUnitSourceId' AS unit,s->>'sectorSourceId' AS sector
    FROM jsonb_array_elements(ctx->'areaScopes') s
  ), declared AS (
    SELECT DISTINCT scope.unit,scope.sector,site.external_key AS site_key
    FROM scope
    JOIN public.attendance_expected_device_proposal prop
      ON prop.tenant_id=(ctx->>'tenantId')::uuid
     AND prop.source_binding_id=(ctx->>'sourceBindingId')::uuid
     AND prop.company_id=(ctx->>'sourceCompanyId')::bigint
     AND prop.organization_unit_source_id=scope.unit
     AND prop.sector_source_id IS NOT DISTINCT FROM scope.sector
     AND prop.valid_from<=last_day AND prop.valid_until>=first_day
    JOIN public.attendance_expected_device_review decision
      ON decision.proposal_id=prop.id AND decision.decision='approve'
    LEFT JOIN public.attendance_expected_device_retirement retired ON retired.proposal_id=prop.id
    CROSS JOIN LATERAL unnest(prop.device_ids) AS declared_device(id)
    JOIN public.attendance_device device ON device.id=declared_device.id AND device.tenant_id=prop.tenant_id
    JOIN public.attendance_marking_site site ON site.id=device.site_id AND site.tenant_id=prop.tenant_id
    -- Active on at least one day of the window: a retirement takes effect on effective_from, so the
    -- first day both valid and inside the window must come before it. A declaration retired on or
    -- before its own first valid day of the window was never active there.
    WHERE retired.id IS NULL OR retired.effective_from>GREATEST(first_day,prop.valid_from)
  )
  SELECT jsonb_build_object(
    'version','attendance-daily-scopes.v1',
    'tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId',
    'scopes',COALESCE(jsonb_agg(jsonb_build_object(
      'area',jsonb_build_object('organizationUnitSourceId',unit,'sectorSourceId',sector),'site',site_key)
      ORDER BY unit,sector NULLS FIRST,site_key),'[]'::jsonb))
    INTO result_value
  FROM declared;
  IF jsonb_array_length(result_value->'scopes')>500 THEN RAISE EXCEPTION 'ATTENDANCE_DAILY_SCOPES_LIMIT'; END IF;
  RETURN result_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'ATTENDANCE_DAILY_SCOPES_BUSY' USING ERRCODE='P0001';
END
$$;

REVOKE ALL ON FUNCTION public.attendance_daily_scopes_read_v1(jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_daily_scopes_read_v1(jsonb,jsonb) TO municontrol_actions_runtime_app;
