-- Private candidate. Metadata-only pending work for the authenticated conditions reader.
-- No public migration number is reserved by this file.
DO $pending_prerequisite$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace='public'::regnamespace
      AND proname='own_salary_conditions_pending_v1'
  ) THEN
    RAISE EXCEPTION 'SALARY_CONDITIONS_OBJECT_CONFLICT';
  END IF;
  IF to_regclass('public.own_salary_conditions_event') IS NULL
    OR to_regprocedure('public.own_salary_conditions_context_v1(jsonb)') IS NULL
    OR to_regprocedure('public.own_salary_conditions_session_live_v1(jsonb)') IS NULL
    OR to_regprocedure('public.action_center_context_has_capability(jsonb,text)') IS NULL
  THEN
    RAISE EXCEPTION 'SALARY_CONDITIONS_PREREQUISITE';
  END IF;
END $pending_prerequisite$;

CREATE FUNCTION public.own_salary_conditions_pending_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $conditions_pending$
DECLARE
  ctx jsonb;
  generated_at timestamptz;
  decision_window_start timestamptz;
  review_items jsonb;
  decision_items jsonb;
  review_count integer;
  decision_count integer;
BEGIN
  ctx:=public.own_salary_conditions_context_v1(p);
  PERFORM public.own_salary_conditions_session_live_v1(p);
  generated_at:=clock_timestamp();
  decision_window_start:=generated_at-interval '30 days';

  -- Both lists use the same statement snapshot. The 1001st row is an overflow
  -- sentinel only. No incomplete list is returned as a complete response.
  WITH pending_proposals AS MATERIALIZED (
    SELECT e.id,e.period_month,e.actor_label,e.recorded_at
    FROM public.own_salary_conditions_event e
    WHERE e.tenant_id=(ctx->>'tenantId')::uuid
      AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid
      AND e.command='propose'
      AND e.recorded_at<=generated_at
      AND NOT EXISTS (
        SELECT 1 FROM public.own_salary_conditions_event d
        WHERE d.proposal_id=e.id
      )
      AND coalesce(
        public.action_center_context_has_capability(ctx,'payroll.parameter.approve')
        AND coalesce((ctx->>'parameterActorVerified')::boolean,false)
        AND ctx->>'actorPersonId' IS NOT NULL
        AND e.actor_membership_id<>(ctx->>'membershipId')::uuid
        AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid
        AND e.actor_email<>ctx->>'actorEmail',
        false
      )
    ORDER BY e.recorded_at DESC,e.id DESC
    LIMIT 1001
  ), recent_decisions AS MATERIALIZED (
    SELECT d.id AS event_id,e.id AS proposal_id,e.period_month,
      d.command,d.actor_label,d.recorded_at
    FROM public.own_salary_conditions_event e
    JOIN public.own_salary_conditions_event d ON d.proposal_id=e.id
    WHERE e.tenant_id=(ctx->>'tenantId')::uuid
      AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid
      AND d.tenant_id=(ctx->>'tenantId')::uuid
      AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
      AND e.command='propose'
      AND d.command IN('approve','reject')
      AND d.period_month=e.period_month
      AND e.actor_membership_id=(ctx->>'membershipId')::uuid
      AND e.actor_person_id=(ctx->>'actorPersonId')::uuid
      AND e.actor_email=ctx->>'actorEmail'
      AND coalesce((ctx->>'parameterActorVerified')::boolean,false)
      AND e.recorded_at<=generated_at
      AND d.recorded_at>=decision_window_start
      AND d.recorded_at<=generated_at
    ORDER BY d.recorded_at DESC,d.id DESC
    LIMIT 1001
  )
  SELECT
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'proposalId',e.id,
        'period',to_char(e.period_month,'YYYY-MM'),
        'authorLabel',CASE
          WHEN labels.value='' OR position('@' in labels.value)>0 THEN 'Persona habilitada'
          ELSE left(labels.value,160)
        END,
        'createdAt',e.recorded_at,
        'canReview',true
      ) ORDER BY e.recorded_at DESC,e.id DESC),'[]'::jsonb)
      FROM pending_proposals e
      CROSS JOIN LATERAL (
        VALUES (btrim(regexp_replace(coalesce(e.actor_label,''),'[[:space:]]+',' ','g')))
      ) AS labels(value)
    ),
    (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'eventId',d.event_id,
        'proposalId',d.proposal_id,
        'period',to_char(d.period_month,'YYYY-MM'),
        'status',CASE d.command WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
        'actorLabel',CASE
          WHEN labels.value='' OR position('@' in labels.value)>0 THEN 'Persona habilitada'
          ELSE left(labels.value,160)
        END,
        'recordedAt',d.recorded_at
      ) ORDER BY d.recorded_at DESC,d.event_id DESC),'[]'::jsonb)
      FROM recent_decisions d
      CROSS JOIN LATERAL (
        VALUES (btrim(regexp_replace(coalesce(d.actor_label,''),'[[:space:]]+',' ','g')))
      ) AS labels(value)
    )
  INTO review_items,decision_items;

  review_count:=jsonb_array_length(review_items);
  decision_count:=jsonb_array_length(decision_items);
  IF review_count>1000 OR decision_count>1000 THEN
    RAISE EXCEPTION 'SALARY_CONDITIONS_LIMIT';
  END IF;
  PERFORM public.own_salary_conditions_session_live_v1(p);
  RETURN jsonb_build_object(
    'version','own-contract-salary-conditions.pending.v1',
    'generatedAt',generated_at,
    'complete',true,
    'decisionWindowDays',30,
    'toReview',review_items,
    'decided',decision_items,
    'counts',jsonb_build_object('toReview',review_count,'decided',decision_count),
    'payrollCalculated',false,
    'payrollPosted',false
  );
END $conditions_pending$;

REVOKE ALL ON FUNCTION public.own_salary_conditions_pending_v1(jsonb)
  FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_salary_conditions_pending_v1(jsonb)
  TO municontrol_actions_runtime_app;
