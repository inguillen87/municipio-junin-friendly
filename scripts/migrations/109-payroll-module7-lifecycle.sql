-- 109: Módulo 7 de Noelia: confirmar, cerrar y anular sin borrar histórico.
-- No calcula haberes, no contabiliza y no transmite a GRH/banco.
DO $baseline$ BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef('public.payroll_monthly_close_guard_run_v1()'::regprocedure),'UTF8')),'hex') <> '0a7c64605e093ad7fd040e5d2c05293dcba220b9d76f596c98628240bb7bc125' THEN RAISE EXCEPTION 'MODULE7_BASELINE_CHANGED'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.payroll_monthly_close_detail_v1(jsonb,uuid)'::regprocedure),'UTF8')),'hex') <> '542c7e5ff5fd2571af2449e3b2f0beefe855c3f49e7ab811f012e3136b68c560' THEN RAISE EXCEPTION 'MODULE7_BASELINE_CHANGED'; END IF;
 IF encode(sha256(convert_to(pg_get_functiondef('public.payroll_monthly_close_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)'::regprocedure),'UTF8')),'hex') <> 'af61929136a8710d6f5d7f7c96f02d97ec83ffd599bf3224f3fcee53c0abd881' THEN RAISE EXCEPTION 'MODULE7_BASELINE_CHANGED'; END IF;
END $baseline$;

ALTER TABLE public.payroll_monthly_close_run DROP CONSTRAINT payroll_monthly_close_run_status_ck, DROP CONSTRAINT payroll_monthly_close_run_reason_ck, DROP CONSTRAINT payroll_monthly_close_run_state_ck;
ALTER TABLE public.payroll_monthly_close_run ADD CONSTRAINT payroll_monthly_close_run_status_ck CHECK(status IN ('prepared','submitted','approved','closed','annulled','rejected','cancelled')), ADD CONSTRAINT payroll_monthly_close_run_reason_ck CHECK(reason_code IN ('sources_prepared','ready_for_review','approved_by_checker','closed_for_history','annulled_by_authority','source_mismatch','evidence_insufficient','period_not_ready','cancelled_by_preparer') AND (reason_reference IS NULL OR reason_reference ~ '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')), ADD CONSTRAINT payroll_monthly_close_run_state_ck CHECK(
 (status='prepared' AND submitted_at IS NULL AND decided_at IS NULL AND reason_code='sources_prepared' AND reason_reference IS NULL AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL AND close_approved=false) OR
 (status='submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL AND reason_code='ready_for_review' AND reason_reference IS NOT NULL AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL AND close_approved=false) OR
 (status='approved' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL AND reason_code='approved_by_checker' AND reason_reference IS NOT NULL AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL AND close_approved=true AND difference_cents=0 AND mismatch_count=0 AND blocking_issue_count=0) OR
 (status='closed' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL AND reason_code='closed_for_history' AND reason_reference IS NOT NULL AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL AND close_approved=true AND difference_cents=0 AND mismatch_count=0 AND blocking_issue_count=0) OR
 (status='annulled' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL AND reason_code='annulled_by_authority' AND reason_reference IS NOT NULL AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL AND close_approved=false) OR
 (status='rejected' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL AND reason_code IN ('source_mismatch','evidence_insufficient','period_not_ready') AND reason_reference IS NOT NULL AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL AND close_approved=false) OR
 (status='cancelled' AND decided_at IS NOT NULL AND reason_code='cancelled_by_preparer' AND reason_reference IS NOT NULL AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL AND close_approved=false));
ALTER TABLE public.payroll_monthly_close_event DROP CONSTRAINT payroll_monthly_close_event_command_ck, DROP CONSTRAINT payroll_monthly_close_event_authority_ck, DROP CONSTRAINT payroll_monthly_close_event_decider_person_ck, DROP CONSTRAINT payroll_monthly_close_event_status_ck, DROP CONSTRAINT payroll_monthly_close_event_approval_ck;
ALTER TABLE public.payroll_monthly_close_event ADD CONSTRAINT payroll_monthly_close_event_command_ck CHECK(command IN ('prepare','submit','approve','reject','cancel','close','annul')), ADD CONSTRAINT payroll_monthly_close_event_authority_ck CHECK((command IN ('prepare','submit','cancel') AND authority_capability_key='payroll.monthly_close.prepare') OR (command IN ('approve','reject','close','annul') AND authority_capability_key='payroll.monthly_close.approve')), ADD CONSTRAINT payroll_monthly_close_event_decider_person_ck CHECK(command NOT IN ('approve','reject','close','annul') OR actor_person_id IS NOT NULL), ADD CONSTRAINT payroll_monthly_close_event_status_ck CHECK((from_status IS NULL OR from_status IN ('prepared','submitted','approved','closed','annulled','rejected','cancelled')) AND to_status IN ('prepared','submitted','approved','closed','annulled','rejected','cancelled')), ADD CONSTRAINT payroll_monthly_close_event_approval_ck CHECK(close_approved=(to_status IN ('approved','closed')));
DROP INDEX public.payroll_monthly_close_run_active_period_uk;
CREATE UNIQUE INDEX payroll_monthly_close_run_active_period_uk ON public.payroll_monthly_close_run(tenant_id,certified_binding_id,period_month,jurisdiction) WHERE status IN ('prepared','submitted','approved','closed');

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_guard_run_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_RUN_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id
     OR NEW.certified_binding_id <> OLD.certified_binding_id
     OR NEW.period_month <> OLD.period_month OR NEW.jurisdiction <> OLD.jurisdiction
     OR NEW.contract_version <> OLD.contract_version OR NEW.release_sha <> OLD.release_sha
     OR NEW.source_set_sha256 <> OLD.source_set_sha256
     OR NEW.source_count <> OLD.source_count
     OR NEW.source_aggregates <> OLD.source_aggregates
     OR NEW.reconciliation <> OLD.reconciliation
     OR NEW.blocking_issues <> OLD.blocking_issues
     OR NEW.reported_earnings_less_retentions_cents
       <> OLD.reported_earnings_less_retentions_cents
     OR NEW.reported_bank_net_cents <> OLD.reported_bank_net_cents
     OR NEW.difference_cents <> OLD.difference_cents
     OR NEW.mismatch_count <> OLD.mismatch_count
     OR NEW.blocking_issue_count <> OLD.blocking_issue_count
     OR NEW.prepared_by_membership_id <> OLD.prepared_by_membership_id
     OR NEW.prepared_by_person_id IS DISTINCT FROM OLD.prepared_by_person_id
     OR NEW.created_at <> OLD.created_at OR NEW.version <> OLD.version + 1
     OR NEW.includes_personal_records IS TRUE OR NEW.raw_content_stored IS TRUE
     OR NEW.grh_mutation IS TRUE OR NEW.payroll_calculated IS TRUE
     OR NEW.payroll_posted IS TRUE OR NEW.bank_artifact_generated IS TRUE
     OR NEW.government_artifact_generated IS TRUE OR NEW.fiscal_artifact_generated IS TRUE
     OR NOT (
       (OLD.status = 'prepared' AND NEW.status IN ('submitted','cancelled'))
       OR (OLD.status = 'submitted' AND NEW.status IN ('approved','rejected','cancelled'))
       OR (OLD.status = 'approved' AND NEW.status IN ('closed','annulled'))
       OR (OLD.status = 'closed' AND NEW.status = 'annulled')
     ) THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_RUN_CHANGE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_detail_v1(
  p_context jsonb,
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  run_row public.payroll_monthly_close_run%ROWTYPE;
  commands_value jsonb := '[]'::jsonb;
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_DETAIL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_monthly_close_assert_context_v1(
    p_context, 'payroll.monthly_close.read'
  );
  SELECT * INTO run_row FROM public.payroll_monthly_close_run item
  WHERE item.id = p_run_id
    AND item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF run_row.status = 'prepared'
     AND context_value->'capabilities' ? 'payroll.monthly_close.prepare'
     AND run_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid THEN
    commands_value := jsonb_build_array('submit','cancel');
  ELSIF run_row.status = 'submitted'
     AND context_value->'capabilities' ? 'payroll.monthly_close.prepare'
     AND run_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid THEN
    commands_value := jsonb_build_array('cancel');
  ELSIF run_row.status = 'submitted'
     AND context_value->'capabilities' ? 'payroll.monthly_close.approve'
     AND (context_value->>'employmentLinked')::boolean
     AND run_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
     AND (run_row.prepared_by_person_id IS NULL OR
       run_row.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid) THEN
    commands_value := CASE
      WHEN run_row.difference_cents = 0 AND run_row.mismatch_count = 0
        AND run_row.blocking_issue_count = 0
      THEN jsonb_build_array('approve','reject')
      ELSE jsonb_build_array('reject') END;
  ELSIF run_row.status = 'approved'
     AND context_value->'capabilities' ? 'payroll.monthly_close.approve'
     AND (context_value->>'employmentLinked')::boolean
     AND run_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
     AND (run_row.prepared_by_person_id IS NULL OR run_row.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid) THEN
    commands_value := jsonb_build_array('close','annul');
  ELSIF run_row.status = 'closed'
     AND context_value->'capabilities' ? 'payroll.monthly_close.approve'
     AND (context_value->>'employmentLinked')::boolean
     AND run_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
     AND (run_row.prepared_by_person_id IS NULL OR run_row.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid) THEN
    commands_value := jsonb_build_array('annul');
  END IF;
  RETURN jsonb_build_object(
    'run', public.payroll_monthly_close_snapshot_v1(
      run_row.id, run_row.tenant_id, true,
      context_value->'capabilities' ? 'payroll.monthly_close.audit.read'
    ) || jsonb_build_object('allowedCommands', commands_value),
    'flags', public.payroll_monthly_close_flags_v1(run_row.close_approved)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_transition_v1(
  p_context jsonb,
  p_run_id uuid,
  p_command text,
  p_expected_version integer,
  p_reason_code text,
  p_reason_reference text,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  run_row public.payroll_monthly_close_run%ROWTYPE;
  existing_event public.payroll_monthly_close_event%ROWTYPE;
  required_capability text;
  next_status text;
  approved_value boolean := false;
  event_id_value bigint;
BEGIN
  IF p_run_id IS NULL OR p_command NOT IN ('submit','approve','reject','cancel','close','annul')
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR COALESCE(p_reason_reference,'') !~
       '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR (p_command = 'submit' AND p_reason_code <> 'ready_for_review')
     OR (p_command = 'approve' AND p_reason_code <> 'approved_by_checker')
     OR (p_command = 'reject' AND p_reason_code NOT IN (
       'source_mismatch','evidence_insufficient','period_not_ready'
     )) OR (p_command = 'cancel' AND p_reason_code <> 'cancelled_by_preparer')
     OR (p_command = 'close' AND p_reason_code <> 'closed_for_history')
     OR (p_command = 'annul' AND p_reason_code <> 'annulled_by_authority') THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  required_capability := CASE WHEN p_command IN ('approve','reject','close','annul')
    THEN 'payroll.monthly_close.approve' ELSE 'payroll.monthly_close.prepare' END;
  context_value := public.payroll_monthly_close_assert_context_v1(
    p_context, required_capability
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text, 0
  ));
  SELECT * INTO existing_event FROM public.payroll_monthly_close_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency FOR SHARE;
  IF FOUND THEN
    IF existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_BINDING_CHANGED' USING ERRCODE = 'P0001';
    END IF;
    IF existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <>
         (context_value->>'actorSessionVersion')::integer
       OR existing_event.release_sha <> lower(context_value->>'releaseSha')
       OR existing_event.actor_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> required_capability
       OR existing_event.run_id <> p_run_id OR existing_event.command <> p_command
       OR existing_event.command_hash <> lower(p_command_hash) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN public.payroll_monthly_close_event_result_v1(
      existing_event.id, existing_event.tenant_id
    ) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO run_row FROM public.payroll_monthly_close_run item
  WHERE item.id = p_run_id
    AND item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF run_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF p_command IN ('submit','cancel') THEN
    IF run_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF (p_command = 'submit' AND run_row.status <> 'prepared')
       OR (p_command = 'cancel' AND run_row.status NOT IN ('prepared','submitted')) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF (p_command IN ('approve','reject') AND run_row.status <> 'submitted')
       OR (p_command = 'close' AND run_row.status <> 'approved')
       OR (p_command = 'annul' AND run_row.status NOT IN ('approved','closed')) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF NOT (context_value->>'employmentLinked')::boolean THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF run_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid
       OR (run_row.prepared_by_person_id IS NOT NULL AND
         run_row.prepared_by_person_id = (context_value->>'actorPersonId')::uuid) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'approve' AND run_row.difference_cents <> 0 THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL'
        USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'approve'
       AND (run_row.mismatch_count <> 0 OR run_row.blocking_issue_count <> 0) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_BLOCKING_ISSUES' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  next_status := CASE p_command
    WHEN 'submit' THEN 'submitted'
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'close' THEN 'closed'
    WHEN 'annul' THEN 'annulled'
    ELSE 'cancelled' END;
  approved_value := p_command IN ('approve','close');
  UPDATE public.payroll_monthly_close_run item SET
    status = next_status,
    version = item.version + 1,
    reason_code = p_reason_code,
    reason_reference = p_reason_reference,
    decided_by_membership_id = CASE
      WHEN p_command IN ('approve','reject') THEN (context_value->>'membershipId')::uuid
      WHEN p_command IN ('close','annul') THEN item.decided_by_membership_id
      ELSE NULL END,
    decided_by_person_id = CASE
      WHEN p_command IN ('approve','reject') THEN (context_value->>'actorPersonId')::uuid
      WHEN p_command IN ('close','annul') THEN item.decided_by_person_id
      ELSE NULL END,
    close_approved = approved_value,
    submitted_at = CASE WHEN p_command = 'submit' THEN now() ELSE item.submitted_at END,
    decided_at = CASE WHEN p_command = 'submit' THEN NULL WHEN p_command IN ('close','annul') THEN item.decided_at ELSE now() END,
    updated_at = now()
  WHERE item.id = run_row.id;
  INSERT INTO public.payroll_monthly_close_event (
    tenant_id, run_id, certified_binding_id, actor_membership_id,
    actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha, command,
    from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash, close_approved
  ) VALUES (
    run_row.tenant_id, run_row.id, run_row.certified_binding_id,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid, context_value->>'roleKey',
    required_capability, (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'), p_command, run_row.status,
    next_status, run_row.version, run_row.version + 1, p_reason_code,
    p_reason_reference, p_idempotency, lower(p_command_hash), approved_value
  ) RETURNING id INTO event_id_value;
  RETURN public.payroll_monthly_close_event_result_v1(event_id_value, run_row.tenant_id);
END
$$;
