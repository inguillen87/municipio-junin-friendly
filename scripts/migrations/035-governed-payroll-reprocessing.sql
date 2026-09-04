-- MuniControl Friendly - Sprint 035
-- Expedientes tenant-bound para solicitar anulacion o reliquidacion de una
-- corrida GRH cerrada. Aprobar autoriza una ejecucion externa posterior: esta
-- migracion no anula, recalcula, contabiliza ni modifica datos salariales.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES
  ('payroll.reprocessing.read', 'Consultar anulaciones y reliquidaciones',
    'Consulta expedientes y estados sin modificar corridas de haberes.', 'tenant', 'standard'),
  ('payroll.reprocessing.prepare', 'Preparar anulaciones y reliquidaciones',
    'Prepara y presenta expedientes sobre corridas GRH cerradas.', 'tenant', 'privileged'),
  ('payroll.reprocessing.approve', 'Decidir anulaciones y reliquidaciones',
    'Aprueba o rechaza expedientes preparados por otra membresia y persona.', 'tenant', 'restricted'),
  ('payroll.reprocessing.audit.read', 'Auditar anulaciones y reliquidaciones',
    'Consulta la linea de tiempo tecnica e inmutable del expediente.', 'tenant', 'restricted')
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  sensitivity = EXCLUDED.sensitivity;

INSERT INTO public.iam_capability_conflict (
  capability_key, conflicts_with_key, reason
) VALUES (
  'payroll.reprocessing.approve',
  'payroll.reprocessing.prepare',
  'La preparacion y la decision deben recaer en membresias y personas diferentes.'
)
ON CONFLICT (capability_key, conflicts_with_key) DO UPDATE SET reason = EXCLUDED.reason;

DO $payroll_reprocessing_roles$
DECLARE
  invalid_roles text[];
BEGIN
  WITH expected(role_key) AS (
    VALUES
      ('CONSULTA_INTEGRAL'),
      ('HUGO_APROBADOR_INTEGRAL'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL')
  )
  SELECT array_agg(expected.role_key ORDER BY expected.role_key) INTO invalid_roles
  FROM expected
  LEFT JOIN public.iam_role role ON role.role_key = expected.role_key
  WHERE role.role_key IS NULL OR role.scope_kind <> 'tenant'
    OR role.system_managed IS NOT TRUE;
  IF invalid_roles IS NOT NULL THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_ROLE_DRIFT: %',
      array_to_string(invalid_roles, ',') USING ERRCODE = 'P0001';
  END IF;
END
$payroll_reprocessing_roles$;

DELETE FROM public.iam_role_capability mapping
WHERE mapping.role_key IN (
    'CONSULTA_INTEGRAL',
    'HUGO_APROBADOR_INTEGRAL',
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  )
  AND mapping.capability_key LIKE 'payroll.reprocessing.%';

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('CONSULTA_INTEGRAL', 'payroll.reprocessing.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.reprocessing.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.reprocessing.approve'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.reprocessing.audit.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.reprocessing.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.reprocessing.prepare'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.reprocessing.audit.read')
ON CONFLICT (role_key, capability_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.payroll_reprocessing_case (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  certified_binding_id uuid NOT NULL,
  payroll_run_id uuid NOT NULL,
  request_kind varchar(16) NOT NULL,
  target_run_sha256 char(64) NOT NULL,
  contract_version varchar(64) NOT NULL DEFAULT 'payroll-reprocessing-case.v1',
  release_sha char(40) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  business_reason_code varchar(64) NOT NULL,
  business_reason_reference varchar(128) NOT NULL,
  decision_reason_code varchar(64),
  decision_reason_reference varchar(128),
  prepared_by_membership_id uuid NOT NULL,
  prepared_by_person_id uuid,
  decided_by_membership_id uuid,
  decided_by_person_id uuid,
  execution_authorized boolean NOT NULL DEFAULT false,
  grh_mutation boolean NOT NULL DEFAULT false,
  payroll_voided boolean NOT NULL DEFAULT false,
  payroll_calculated boolean NOT NULL DEFAULT false,
  payroll_posted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  CONSTRAINT payroll_reprocessing_case_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_reprocessing_case_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_case_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT payroll_reprocessing_case_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES public.platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_case_run_fk
    FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_run(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_case_preparer_membership_fk
    FOREIGN KEY (prepared_by_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_case_preparer_person_fk
    FOREIGN KEY (prepared_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_case_decider_membership_fk
    FOREIGN KEY (decided_by_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_case_decider_person_fk
    FOREIGN KEY (decided_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_case_kind_ck
    CHECK (request_kind IN ('void','reliquidate')),
  CONSTRAINT payroll_reprocessing_case_target_hash_ck
    CHECK (target_run_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT payroll_reprocessing_case_contract_ck
    CHECK (contract_version = 'payroll-reprocessing-case.v1'),
  CONSTRAINT payroll_reprocessing_case_release_ck
    CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT payroll_reprocessing_case_status_ck
    CHECK (status IN ('draft','submitted','approved','rejected','cancelled')),
  CONSTRAINT payroll_reprocessing_case_version_ck CHECK (version > 0),
  CONSTRAINT payroll_reprocessing_case_business_reason_ck CHECK (
    business_reason_code IN (
      'duplicate_run','incorrect_personnel','incorrect_concept','incorrect_amount',
      'source_correction','legal_adjustment','other_controlled'
    )
  ),
  CONSTRAINT payroll_reprocessing_case_reference_ck CHECK (
    business_reason_reference ~
      '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND (
      decision_reason_reference IS NULL OR decision_reason_reference ~
        '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  ),
  CONSTRAINT payroll_reprocessing_case_decision_reason_ck CHECK (
    decision_reason_code IS NULL OR decision_reason_code IN (
      'ready_for_review','approved_for_external_execution','insufficient_evidence',
      'run_not_eligible','request_not_authorized','cancelled_by_preparer'
    )
  ),
  CONSTRAINT payroll_reprocessing_case_decider_pair_ck CHECK (
    (decided_by_membership_id IS NULL AND decided_by_person_id IS NULL)
    OR (decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL)
  ),
  CONSTRAINT payroll_reprocessing_case_maker_checker_ck CHECK (
    decided_by_person_id IS NULL OR (
      decided_by_membership_id <> prepared_by_membership_id
      AND (prepared_by_person_id IS NULL OR decided_by_person_id <> prepared_by_person_id)
    )
  ),
  CONSTRAINT payroll_reprocessing_case_state_ck CHECK (
    (status = 'draft' AND submitted_at IS NULL AND decided_at IS NULL
      AND decision_reason_code IS NULL AND decision_reason_reference IS NULL
      AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL
      AND execution_authorized IS FALSE)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL
      AND decision_reason_code = 'ready_for_review'
      AND decision_reason_reference IS NOT NULL
      AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL
      AND execution_authorized IS FALSE)
    OR (status = 'approved' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL
      AND decision_reason_code = 'approved_for_external_execution'
      AND decision_reason_reference IS NOT NULL
      AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL
      AND execution_authorized IS TRUE)
    OR (status = 'rejected' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL
      AND decision_reason_code IN (
        'insufficient_evidence','run_not_eligible','request_not_authorized'
      ) AND decision_reason_reference IS NOT NULL
      AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL
      AND execution_authorized IS FALSE)
    OR (status = 'cancelled' AND decided_at IS NOT NULL
      AND decision_reason_code = 'cancelled_by_preparer'
      AND decision_reason_reference IS NOT NULL
      AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL
      AND execution_authorized IS FALSE)
  ),
  CONSTRAINT payroll_reprocessing_case_no_side_effect_ck CHECK (
    grh_mutation IS FALSE AND payroll_voided IS FALSE
    AND payroll_calculated IS FALSE AND payroll_posted IS FALSE
  )
);

CREATE TABLE IF NOT EXISTS public.payroll_reprocessing_event (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  case_id uuid NOT NULL,
  certified_binding_id uuid NOT NULL,
  payroll_run_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_person_id uuid,
  actor_role_key varchar(64) NOT NULL,
  authority_capability_key varchar(96) NOT NULL,
  actor_session_id uuid NOT NULL,
  actor_session_version integer NOT NULL,
  release_sha char(40) NOT NULL,
  command varchar(16) NOT NULL,
  from_status varchar(16),
  to_status varchar(16) NOT NULL,
  expected_version integer NOT NULL,
  resulting_version integer NOT NULL,
  reason_code varchar(64) NOT NULL,
  reason_reference varchar(128) NOT NULL,
  idempotency_key uuid NOT NULL,
  command_hash char(64) NOT NULL,
  event_sha256 char(64) NOT NULL DEFAULT repeat('0', 64),
  execution_authorized boolean NOT NULL DEFAULT false,
  grh_mutation boolean NOT NULL DEFAULT false,
  payroll_voided boolean NOT NULL DEFAULT false,
  payroll_calculated boolean NOT NULL DEFAULT false,
  payroll_posted boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_reprocessing_event_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_reprocessing_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_event_case_fk
    FOREIGN KEY (case_id, tenant_id)
    REFERENCES public.payroll_reprocessing_case(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_event_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES public.platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_event_run_fk
    FOREIGN KEY (payroll_run_id) REFERENCES public.payroll_run(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_event_membership_fk
    FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_event_person_fk
    FOREIGN KEY (actor_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_event_role_fk
    FOREIGN KEY (actor_role_key) REFERENCES public.iam_role(role_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_event_capability_fk
    FOREIGN KEY (authority_capability_key)
    REFERENCES public.iam_capability(capability_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_event_session_fk
    FOREIGN KEY (actor_session_id) REFERENCES public.tenant_identity_session(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_reprocessing_event_case_version_uk
    UNIQUE (case_id, resulting_version),
  CONSTRAINT payroll_reprocessing_event_actor_idempotency_uk
    UNIQUE (tenant_id, actor_membership_id, idempotency_key),
  CONSTRAINT payroll_reprocessing_event_command_ck
    CHECK (command IN ('prepare','submit','approve','reject','cancel')),
  CONSTRAINT payroll_reprocessing_event_authority_ck CHECK (
    (command IN ('prepare','submit','cancel')
      AND authority_capability_key = 'payroll.reprocessing.prepare')
    OR (command IN ('approve','reject')
      AND authority_capability_key = 'payroll.reprocessing.approve')
  ),
  CONSTRAINT payroll_reprocessing_event_decider_person_ck
    CHECK (command NOT IN ('approve','reject') OR actor_person_id IS NOT NULL),
  CONSTRAINT payroll_reprocessing_event_status_ck CHECK (
    (from_status IS NULL OR from_status IN (
      'draft','submitted','approved','rejected','cancelled'
    )) AND to_status IN ('draft','submitted','approved','rejected','cancelled')
  ),
  CONSTRAINT payroll_reprocessing_event_version_ck CHECK (
    expected_version >= 0 AND resulting_version = expected_version + 1
  ),
  CONSTRAINT payroll_reprocessing_event_session_version_ck
    CHECK (actor_session_version > 0),
  CONSTRAINT payroll_reprocessing_event_release_ck
    CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT payroll_reprocessing_event_idempotency_v4_ck CHECK (
    idempotency_key::text ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_reprocessing_event_hash_ck CHECK (
    command_hash ~ '^[a-f0-9]{64}$' AND event_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT payroll_reprocessing_event_reference_ck CHECK (
    reason_reference ~
      '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_reprocessing_event_authorization_ck CHECK (
    execution_authorized = (to_status = 'approved')
  ),
  CONSTRAINT payroll_reprocessing_event_no_side_effect_ck CHECK (
    grh_mutation IS FALSE AND payroll_voided IS FALSE
    AND payroll_calculated IS FALSE AND payroll_posted IS FALSE
  )
);

CREATE INDEX IF NOT EXISTS payroll_reprocessing_case_tenant_status_idx
  ON public.payroll_reprocessing_case (tenant_id, status, created_at DESC, id);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_reprocessing_case_active_target_uk
  ON public.payroll_reprocessing_case (
    tenant_id, certified_binding_id, payroll_run_id, request_kind
  ) WHERE status IN ('draft','submitted','approved');
CREATE INDEX IF NOT EXISTS payroll_reprocessing_event_timeline_idx
  ON public.payroll_reprocessing_event (tenant_id, case_id, occurred_at, id);

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_reject_event_change_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'PAYROLL_REPROCESSING_EVENT_APPEND_ONLY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_hash_event_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.event_sha256 := encode(digest(convert_to(jsonb_build_object(
    'tenantId', NEW.tenant_id::text,
    'caseId', NEW.case_id::text,
    'payrollRunId', NEW.payroll_run_id::text,
    'membershipId', NEW.actor_membership_id::text,
    'sessionId', NEW.actor_session_id::text,
    'sessionVersion', NEW.actor_session_version,
    'releaseSha', NEW.release_sha,
    'command', NEW.command,
    'fromStatus', NEW.from_status,
    'toStatus', NEW.to_status,
    'expectedVersion', NEW.expected_version,
    'resultingVersion', NEW.resulting_version,
    'reasonCode', NEW.reason_code,
    'reasonReference', NEW.reason_reference,
    'idempotencyKey', NEW.idempotency_key::text,
    'commandHash', NEW.command_hash,
    'executionAuthorized', NEW.execution_authorized,
    'grhMutation', false,
    'payrollVoided', false,
    'payrollCalculated', false,
    'payrollPosted', false
  )::text, 'UTF8'), 'sha256'), 'hex');
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_guard_case_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_CASE_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id
     OR NEW.certified_binding_id <> OLD.certified_binding_id
     OR NEW.payroll_run_id <> OLD.payroll_run_id
     OR NEW.request_kind <> OLD.request_kind
     OR NEW.target_run_sha256 <> OLD.target_run_sha256
     OR NEW.contract_version <> OLD.contract_version
     OR NEW.release_sha <> OLD.release_sha
     OR NEW.business_reason_code <> OLD.business_reason_code
     OR NEW.business_reason_reference <> OLD.business_reason_reference
     OR NEW.prepared_by_membership_id <> OLD.prepared_by_membership_id
     OR NEW.prepared_by_person_id IS DISTINCT FROM OLD.prepared_by_person_id
     OR NEW.created_at <> OLD.created_at
     OR NEW.version <> OLD.version + 1
     OR NEW.grh_mutation IS TRUE OR NEW.payroll_voided IS TRUE
     OR NEW.payroll_calculated IS TRUE OR NEW.payroll_posted IS TRUE
     OR NOT (
       (OLD.status = 'draft' AND NEW.status IN ('submitted','cancelled'))
       OR (OLD.status = 'submitted' AND NEW.status IN ('approved','rejected','cancelled'))
     ) THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_CASE_CHANGE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS payroll_reprocessing_event_hash_v1
  ON public.payroll_reprocessing_event;
CREATE TRIGGER payroll_reprocessing_event_hash_v1
BEFORE INSERT ON public.payroll_reprocessing_event
FOR EACH ROW EXECUTE FUNCTION public.payroll_reprocessing_hash_event_v1();

DROP TRIGGER IF EXISTS payroll_reprocessing_event_append_only_v1
  ON public.payroll_reprocessing_event;
CREATE TRIGGER payroll_reprocessing_event_append_only_v1
BEFORE UPDATE OR DELETE ON public.payroll_reprocessing_event
FOR EACH ROW EXECUTE FUNCTION public.payroll_reprocessing_reject_event_change_v1();

DROP TRIGGER IF EXISTS payroll_reprocessing_case_guard_v1
  ON public.payroll_reprocessing_case;
CREATE TRIGGER payroll_reprocessing_case_guard_v1
BEFORE UPDATE OR DELETE ON public.payroll_reprocessing_case
FOR EACH ROW EXECUTE FUNCTION public.payroll_reprocessing_guard_case_v1();

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_assert_context_v1(
  p_context jsonb,
  p_required_capability text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
BEGIN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_context) key)
       IS DISTINCT FROM ARRAY[
         'actorEmail','actorSessionId','actorSessionVersion',
         'membershipId','releaseSha','tenantId'
       ]::text[]
     OR p_required_capability NOT IN (
       'payroll.reprocessing.read','payroll.reprocessing.prepare',
       'payroll.reprocessing.approve','payroll.reprocessing.audit.read'
     ) THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  context_value := public.action_center_assert_tenant_read_session_v2(
    p_context->>'actorEmail',
    (p_context->>'actorSessionId')::uuid,
    (p_context->>'actorSessionVersion')::integer,
    lower(p_context->>'releaseSha'),
    (p_context->>'tenantId')::uuid,
    (p_context->>'membershipId')::uuid
  );
  IF NOT public.action_center_context_has_capability(
    context_value, p_required_capability
  ) THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  RETURN context_value || jsonb_build_object(
    'certifiedBindingId', context_value->>'sourceBindingId',
    'employmentLinked', context_value->>'actorPersonId' IS NOT NULL,
    'releaseSha', lower(p_context->>'releaseSha')
  );
EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_snapshot_v1(
  p_case_id uuid,
  p_tenant_id uuid,
  p_include_audit boolean
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', item.id,
    'contractVersion', item.contract_version,
    'requestKind', item.request_kind,
    'status', item.status,
    'version', item.version,
    'businessReasonCode', item.business_reason_code,
    'businessReasonReference', item.business_reason_reference,
    'decisionReasonCode', item.decision_reason_code,
    'decisionReasonReference', item.decision_reason_reference,
    'executionAuthorized', item.execution_authorized,
    'approvalEffect', 'external_execution_authorization_only',
    'grhMutation', false,
    'payrollVoided', false,
    'payrollCalculated', false,
    'payrollPosted', false,
    'createdAt', item.created_at,
    'updatedAt', item.updated_at,
    'submittedAt', item.submitted_at,
    'decidedAt', item.decided_at,
    'target', jsonb_build_object(
      'payrollRunId', item.payroll_run_id,
      'runSha256', item.target_run_sha256,
      'payrollDate', run.payroll_date,
      'sourcePeriod', run.source_period,
      'sourceMonth', run.source_month,
      'payrollType', run.payroll_type,
      'closureStatus', run.closure_status,
      'sourceSystem', run.source_system
    ),
    'timeline', CASE WHEN p_include_audit THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', event.id,
        'command', event.command,
        'fromStatus', event.from_status,
        'toStatus', event.to_status,
        'expectedVersion', event.expected_version,
        'resultingVersion', event.resulting_version,
        'reasonCode', event.reason_code,
        'reasonReference', event.reason_reference,
        'actorRoleKey', event.actor_role_key,
        'eventSha256', event.event_sha256,
        'occurredAt', event.occurred_at
      ) ORDER BY event.id)
      FROM public.payroll_reprocessing_event event
      WHERE event.case_id = item.id AND event.tenant_id = item.tenant_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  )
  FROM public.payroll_reprocessing_case item
  JOIN public.payroll_run run ON run.id = item.payroll_run_id
  WHERE item.id = p_case_id AND item.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_event_result_v1(
  p_event_id bigint,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'replayed', false,
    'eventId', event.id,
    'eventSha256', event.event_sha256,
    'approvalEffect', 'external_execution_authorization_only',
    'grhMutation', false,
    'payrollVoided', false,
    'payrollCalculated', false,
    'payrollPosted', false,
    'data', public.payroll_reprocessing_snapshot_v1(
      event.case_id, event.tenant_id, true
    )
  )
  FROM public.payroll_reprocessing_event event
  WHERE event.id = p_event_id AND event.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_bootstrap_v1(p_context jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  counts_value jsonb;
BEGIN
  context_value := public.payroll_reprocessing_assert_context_v1(
    p_context, 'payroll.reprocessing.read'
  );
  SELECT jsonb_build_object(
    'draft', count(*) FILTER (WHERE item.status = 'draft'),
    'submitted', count(*) FILTER (WHERE item.status = 'submitted'),
    'approved', count(*) FILTER (WHERE item.status = 'approved'),
    'rejected', count(*) FILTER (WHERE item.status = 'rejected'),
    'cancelled', count(*) FILTER (WHERE item.status = 'cancelled')
  ) INTO counts_value
  FROM public.payroll_reprocessing_case item
  WHERE item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid;
  RETURN jsonb_build_object(
    'contractVersion', 'payroll-reprocessing-case.v1',
    'approvalEffect', 'external_execution_authorization_only',
    'feature', jsonb_build_object(
      'canPrepare', context_value->'capabilities' ? 'payroll.reprocessing.prepare',
      'canApprove', context_value->'capabilities' ? 'payroll.reprocessing.approve'
        AND (context_value->>'employmentLinked')::boolean,
      'grhMutation', false,
      'payrollVoided', false,
      'payrollCalculated', false,
      'payrollPosted', false
    ),
    'counts', counts_value,
    'requestKinds', jsonb_build_array('void','reliquidate'),
    'businessReasonCodes', jsonb_build_array(
      'duplicate_run','incorrect_personnel','incorrect_concept','incorrect_amount',
      'source_correction','legal_adjustment','other_controlled'
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_list_v1(
  p_context jsonb,
  p_status text,
  p_page integer,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  total_value bigint;
  items_value jsonb;
BEGIN
  IF p_status NOT IN ('all','draft','submitted','approved','rejected','cancelled')
     OR p_page NOT BETWEEN 1 AND 10000 OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_LIST_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_reprocessing_assert_context_v1(
    p_context, 'payroll.reprocessing.read'
  );
  SELECT count(*) INTO total_value
  FROM public.payroll_reprocessing_case item
  WHERE item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    AND (p_status = 'all' OR item.status = p_status);
  SELECT COALESCE(jsonb_agg(public.payroll_reprocessing_snapshot_v1(
      selected.id, selected.tenant_id, false
    ) ORDER BY selected.created_at DESC, selected.id), '[]'::jsonb)
    INTO items_value
  FROM (
    SELECT item.* FROM public.payroll_reprocessing_case item
    WHERE item.tenant_id = (context_value->>'tenantId')::uuid
      AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
      AND (p_status = 'all' OR item.status = p_status)
    ORDER BY item.created_at DESC, item.id
    OFFSET (p_page - 1) * p_limit LIMIT p_limit
  ) selected;
  RETURN jsonb_build_object(
    'data', jsonb_build_object(
      'items', items_value, 'total', total_value, 'page', p_page, 'limit', p_limit
    ),
    'approvalEffect', 'external_execution_authorization_only',
    'grhMutation', false, 'payrollVoided', false,
    'payrollCalculated', false, 'payrollPosted', false
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_detail_v1(
  p_context jsonb,
  p_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  case_row public.payroll_reprocessing_case%ROWTYPE;
  snapshot_value jsonb;
  commands_value jsonb := '[]'::jsonb;
BEGIN
  IF p_case_id IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_DETAIL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_reprocessing_assert_context_v1(
    p_context, 'payroll.reprocessing.read'
  );
  SELECT * INTO case_row FROM public.payroll_reprocessing_case item
  WHERE item.id = p_case_id
    AND item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF case_row.status = 'draft'
     AND context_value->'capabilities' ? 'payroll.reprocessing.prepare'
     AND case_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid THEN
    commands_value := jsonb_build_array('submit','cancel');
  ELSIF case_row.status = 'submitted'
     AND context_value->'capabilities' ? 'payroll.reprocessing.prepare'
     AND case_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid THEN
    commands_value := jsonb_build_array('cancel');
  ELSIF case_row.status = 'submitted'
     AND context_value->'capabilities' ? 'payroll.reprocessing.approve'
     AND (context_value->>'employmentLinked')::boolean
     AND case_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
     AND (case_row.prepared_by_person_id IS NULL OR
       case_row.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid) THEN
    commands_value := jsonb_build_array('approve','reject');
  END IF;
  snapshot_value := public.payroll_reprocessing_snapshot_v1(
    case_row.id, case_row.tenant_id,
    context_value->'capabilities' ? 'payroll.reprocessing.audit.read'
  );
  RETURN jsonb_build_object(
    'data', snapshot_value || jsonb_build_object('allowedCommands', commands_value),
    'approvalEffect', 'external_execution_authorization_only',
    'grhMutation', false, 'payrollVoided', false,
    'payrollCalculated', false, 'payrollPosted', false
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_prepare_v1(
  p_context jsonb,
  p_payroll_run_id uuid,
  p_request_kind text,
  p_reason_code text,
  p_reason_reference text,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  run_row public.payroll_run%ROWTYPE;
  existing_event public.payroll_reprocessing_event%ROWTYPE;
  case_id_value uuid;
  event_id_value bigint;
  target_hash_value text;
BEGIN
  IF p_payroll_run_id IS NULL OR p_request_kind NOT IN ('void','reliquidate')
     OR p_reason_code NOT IN (
       'duplicate_run','incorrect_personnel','incorrect_concept','incorrect_amount',
       'source_correction','legal_adjustment','other_controlled'
     ) OR COALESCE(p_reason_reference,'') !~
       '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_reprocessing_assert_context_v1(
    p_context, 'payroll.reprocessing.prepare'
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text, 0
  ));
  SELECT * INTO existing_event FROM public.payroll_reprocessing_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency FOR SHARE;
  IF FOUND THEN
    IF existing_event.command <> 'prepare'
       OR existing_event.command_hash <> lower(p_command_hash) THEN
      RAISE EXCEPTION 'PAYROLL_REPROCESSING_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN public.payroll_reprocessing_event_result_v1(
      existing_event.id, existing_event.tenant_id
    ) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || p_payroll_run_id::text
      || ':' || p_request_kind, 0
  ));
  SELECT run.* INTO run_row
  FROM public.payroll_run run
  JOIN public.source_import_batch batch ON batch.id = run.source_batch_id
  WHERE run.id = p_payroll_run_id
    AND run.source_system = 'GRH'
    AND run.company_source_id = context_value->>'sourceCompanyId'
    AND run.closure_status = 'closed'
    AND batch.source_system = 'GRH'
    AND batch.source_database = context_value->>'sourceDatabase'
    AND batch.validation_state = 'published'
    AND batch.legacy_import_run_id IS NOT NULL
  FOR SHARE OF run, batch;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_RUN_NOT_ELIGIBLE' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payroll_reprocessing_case item
    WHERE item.tenant_id = (context_value->>'tenantId')::uuid
      AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
      AND item.payroll_run_id = run_row.id
      AND item.request_kind = p_request_kind
      AND item.status IN ('draft','submitted','approved')
  ) THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_DUPLICATE_CASE' USING ERRCODE = 'P0001';
  END IF;
  target_hash_value := encode(digest(convert_to(jsonb_build_object(
    'payrollRunId', run_row.id::text,
    'sourceBatchId', run_row.source_batch_id::text,
    'sourceId', run_row.source_id,
    'companySourceId', run_row.company_source_id,
    'payrollDate', to_char(run_row.payroll_date, 'YYYY-MM-DD'),
    'sourcePeriod', run_row.source_period,
    'sourceMonth', run_row.source_month,
    'payrollType', run_row.payroll_type,
    'closureStatus', run_row.closure_status
  )::text, 'UTF8'), 'sha256'), 'hex');
  INSERT INTO public.payroll_reprocessing_case (
    tenant_id, certified_binding_id, payroll_run_id, request_kind,
    target_run_sha256, release_sha, business_reason_code,
    business_reason_reference, prepared_by_membership_id, prepared_by_person_id
  ) VALUES (
    (context_value->>'tenantId')::uuid,
    (context_value->>'certifiedBindingId')::uuid,
    run_row.id, p_request_kind, target_hash_value,
    lower(context_value->>'releaseSha'), p_reason_code, p_reason_reference,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid
  ) RETURNING id INTO case_id_value;
  INSERT INTO public.payroll_reprocessing_event (
    tenant_id, case_id, certified_binding_id, payroll_run_id,
    actor_membership_id, actor_person_id, actor_role_key,
    authority_capability_key, actor_session_id, actor_session_version,
    release_sha, command, from_status, to_status, expected_version,
    resulting_version, reason_code, reason_reference, idempotency_key,
    command_hash, execution_authorized
  ) VALUES (
    (context_value->>'tenantId')::uuid, case_id_value,
    (context_value->>'certifiedBindingId')::uuid, run_row.id,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    context_value->>'roleKey', 'payroll.reprocessing.prepare',
    (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'), 'prepare', NULL, 'draft', 0, 1,
    p_reason_code, p_reason_reference, p_idempotency,
    lower(p_command_hash), false
  ) RETURNING id INTO event_id_value;
  RETURN public.payroll_reprocessing_event_result_v1(
    event_id_value, (context_value->>'tenantId')::uuid
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_DUPLICATE_CASE' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_reprocessing_transition_v1(
  p_context jsonb,
  p_case_id uuid,
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
  case_row public.payroll_reprocessing_case%ROWTYPE;
  existing_event public.payroll_reprocessing_event%ROWTYPE;
  required_capability text;
  next_status text;
  authorized_value boolean := false;
  event_id_value bigint;
BEGIN
  IF p_case_id IS NULL OR p_command NOT IN ('submit','approve','reject','cancel')
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR COALESCE(p_reason_reference,'') !~
       '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR (p_command = 'submit' AND p_reason_code <> 'ready_for_review')
     OR (p_command = 'approve' AND p_reason_code <> 'approved_for_external_execution')
     OR (p_command = 'reject' AND p_reason_code NOT IN (
       'insufficient_evidence','run_not_eligible','request_not_authorized'
     )) OR (p_command = 'cancel' AND p_reason_code <> 'cancelled_by_preparer') THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  required_capability := CASE WHEN p_command IN ('approve','reject')
    THEN 'payroll.reprocessing.approve' ELSE 'payroll.reprocessing.prepare' END;
  context_value := public.payroll_reprocessing_assert_context_v1(
    p_context, required_capability
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text, 0
  ));
  SELECT * INTO existing_event FROM public.payroll_reprocessing_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency FOR SHARE;
  IF FOUND THEN
    IF existing_event.case_id <> p_case_id OR existing_event.command <> p_command
       OR existing_event.command_hash <> lower(p_command_hash) THEN
      RAISE EXCEPTION 'PAYROLL_REPROCESSING_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN public.payroll_reprocessing_event_result_v1(
      existing_event.id, existing_event.tenant_id
    ) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO case_row FROM public.payroll_reprocessing_case item
  WHERE item.id = p_case_id
    AND item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF case_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF p_command IN ('submit','cancel') THEN
    IF case_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
       OR case_row.prepared_by_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'PAYROLL_REPROCESSING_PREPARER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF (p_command = 'submit' AND case_row.status <> 'draft')
       OR (p_command = 'cancel' AND case_row.status NOT IN ('draft','submitted')) THEN
      RAISE EXCEPTION 'PAYROLL_REPROCESSING_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF case_row.status <> 'submitted' THEN
      RAISE EXCEPTION 'PAYROLL_REPROCESSING_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF NOT (context_value->>'employmentLinked')::boolean THEN
      RAISE EXCEPTION 'PAYROLL_REPROCESSING_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF case_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid
       OR (case_row.prepared_by_person_id IS NOT NULL AND
         case_row.prepared_by_person_id = (context_value->>'actorPersonId')::uuid) THEN
      RAISE EXCEPTION 'PAYROLL_REPROCESSING_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  next_status := CASE p_command
    WHEN 'submit' THEN 'submitted'
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled' END;
  authorized_value := p_command = 'approve';
  UPDATE public.payroll_reprocessing_case item SET
    status = next_status,
    version = item.version + 1,
    decision_reason_code = p_reason_code,
    decision_reason_reference = p_reason_reference,
    decided_by_membership_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'membershipId')::uuid ELSE NULL END,
    decided_by_person_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'actorPersonId')::uuid ELSE NULL END,
    execution_authorized = authorized_value,
    submitted_at = CASE WHEN p_command = 'submit' THEN now() ELSE item.submitted_at END,
    decided_at = CASE WHEN p_command = 'submit' THEN NULL ELSE now() END,
    updated_at = now()
  WHERE item.id = case_row.id;
  INSERT INTO public.payroll_reprocessing_event (
    tenant_id, case_id, certified_binding_id, payroll_run_id,
    actor_membership_id, actor_person_id, actor_role_key,
    authority_capability_key, actor_session_id, actor_session_version,
    release_sha, command, from_status, to_status, expected_version,
    resulting_version, reason_code, reason_reference, idempotency_key,
    command_hash, execution_authorized
  ) VALUES (
    case_row.tenant_id, case_row.id, case_row.certified_binding_id,
    case_row.payroll_run_id, (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid, context_value->>'roleKey',
    required_capability, (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'), p_command, case_row.status,
    next_status, case_row.version, case_row.version + 1, p_reason_code,
    p_reason_reference, p_idempotency, lower(p_command_hash), authorized_value
  ) RETURNING id INTO event_id_value;
  RETURN public.payroll_reprocessing_event_result_v1(
    event_id_value, case_row.tenant_id
  );
END
$$;

COMMENT ON TABLE public.payroll_reprocessing_case IS
  'Expediente gobernado para solicitar anulacion o reliquidacion; approved solo autoriza ejecucion externa.';
COMMENT ON TABLE public.payroll_reprocessing_event IS
  'Auditoria append-only e idempotente del expediente de anulacion/reliquidacion.';
COMMENT ON COLUMN public.payroll_reprocessing_case.execution_authorized IS
  'True solo tras maker-checker; no implica que GRH haya anulado o reliquidado la corrida.';

REVOKE ALL PRIVILEGES ON TABLE
  public.payroll_reprocessing_case,
  public.payroll_reprocessing_event
FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE
  public.payroll_reprocessing_case,
  public.payroll_reprocessing_event
FROM municontrol_actions_runtime_app;

REVOKE ALL ON FUNCTION public.payroll_reprocessing_reject_event_change_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_hash_event_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_guard_case_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_assert_context_v1(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_snapshot_v1(uuid,uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_event_result_v1(bigint,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_bootstrap_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_list_v1(jsonb,text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_detail_v1(jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_prepare_v1(
  jsonb,uuid,text,text,text,uuid,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_reprocessing_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_reject_event_change_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_hash_event_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_guard_case_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_assert_context_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_snapshot_v1(uuid,uuid,boolean)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_event_result_v1(bigint,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_bootstrap_v1(jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_list_v1(jsonb,text,integer,integer)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_detail_v1(jsonb,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_prepare_v1(
  jsonb,uuid,text,text,text,uuid,text
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_reprocessing_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) FROM municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION public.payroll_reprocessing_bootstrap_v1(jsonb)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_reprocessing_list_v1(jsonb,text,integer,integer)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_reprocessing_detail_v1(jsonb,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_reprocessing_prepare_v1(
  jsonb,uuid,text,text,text,uuid,text
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_reprocessing_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) TO municontrol_actions_runtime_app;

DO $payroll_reprocessing_verify_profiles$
DECLARE
  drift_count integer;
  conflict_count integer;
BEGIN
  WITH expected(role_key, capability_key) AS (
    VALUES
      ('CONSULTA_INTEGRAL', 'payroll.reprocessing.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.reprocessing.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.reprocessing.approve'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.reprocessing.audit.read'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.reprocessing.read'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.reprocessing.prepare'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.reprocessing.audit.read')
  ), actual AS (
    SELECT mapping.role_key, mapping.capability_key
    FROM public.iam_role_capability mapping
    WHERE mapping.role_key IN (
        'CONSULTA_INTEGRAL','HUGO_APROBADOR_INTEGRAL',
        'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
      ) AND mapping.capability_key LIKE 'payroll.reprocessing.%'
  ), drift AS (
    (SELECT role_key, capability_key FROM expected
      EXCEPT SELECT role_key, capability_key FROM actual)
    UNION ALL
    (SELECT role_key, capability_key FROM actual
      EXCEPT SELECT role_key, capability_key FROM expected)
  ) SELECT count(*) INTO drift_count FROM drift;
  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_PROFILE_DRIFT: %', drift_count
      USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO conflict_count
  FROM public.iam_capability_conflict conflict
  JOIN public.iam_role_capability left_grant
    ON left_grant.capability_key = conflict.capability_key
  JOIN public.iam_role_capability right_grant
    ON right_grant.role_key = left_grant.role_key
   AND right_grant.capability_key = conflict.conflicts_with_key
  WHERE left_grant.role_key IN (
    'CONSULTA_INTEGRAL','HUGO_APROBADOR_INTEGRAL',
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  );
  IF conflict_count <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_REPROCESSING_PROFILE_SOD_CONFLICT: %', conflict_count
      USING ERRCODE = 'P0001';
  END IF;
END
$payroll_reprocessing_verify_profiles$;
