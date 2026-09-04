-- MuniControl Friendly - Sprint 038 / S008-C2.1
-- Corrida mensual agregada, tenant-bound y reproducible. Recibe exactamente
-- tres fuentes de control ya parseadas por el servidor y conserva solamente
-- agregados canonicos, importes bigint en centavos y huellas criptograficas.
-- No persiste bytes, nombres de archivos ni datos personales; aprobar tampoco
-- calcula, contabiliza, acredita, publica ni presenta artefactos externos.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES
  ('payroll.monthly_close.read', 'Consultar cierres mensuales',
    'Consulta corridas mensuales agregadas sin modificar datos de haberes.', 'tenant', 'standard'),
  ('payroll.monthly_close.prepare', 'Preparar cierres mensuales',
    'Prepara y presenta una corrida con tres fuentes agregadas y conciliacion exacta.', 'tenant', 'privileged'),
  ('payroll.monthly_close.approve', 'Decidir cierres mensuales',
    'Aprueba o rechaza una corrida de otra membresia; si el preparador tiene persona vinculada, exige otra persona.', 'tenant', 'restricted'),
  ('payroll.monthly_close.audit.read', 'Auditar cierres mensuales',
    'Consulta huellas, fuentes agregadas y eventos inmutables del cierre.', 'tenant', 'restricted')
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  sensitivity = EXCLUDED.sensitivity;

INSERT INTO public.iam_capability_conflict (
  capability_key, conflicts_with_key, reason
) VALUES (
  'payroll.monthly_close.approve',
  'payroll.monthly_close.prepare',
  'La decision exige otra membresia y, si el preparador tiene persona vinculada, otra persona.'
)
ON CONFLICT (capability_key, conflicts_with_key) DO UPDATE SET reason = EXCLUDED.reason;

DO $monthly_close_roles$
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
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_ROLE_DRIFT: %',
      array_to_string(invalid_roles, ',') USING ERRCODE = 'P0001';
  END IF;
END
$monthly_close_roles$;

DELETE FROM public.iam_role_capability mapping
WHERE mapping.role_key IN (
    'CONSULTA_INTEGRAL',
    'HUGO_APROBADOR_INTEGRAL',
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  )
  AND mapping.capability_key LIKE 'payroll.monthly_close.%';

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('CONSULTA_INTEGRAL', 'payroll.monthly_close.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.monthly_close.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.monthly_close.approve'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.monthly_close.audit.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.monthly_close.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.monthly_close.prepare'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.monthly_close.audit.read')
ON CONFLICT (role_key, capability_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.payroll_monthly_close_run (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  certified_binding_id uuid NOT NULL,
  period_month date NOT NULL,
  jurisdiction varchar(2) NOT NULL,
  contract_version varchar(64) NOT NULL DEFAULT 'payroll-monthly-close-run.v1',
  release_sha char(40) NOT NULL,
  source_set_sha256 char(64) NOT NULL,
  source_count smallint NOT NULL DEFAULT 3,
  source_aggregates jsonb NOT NULL,
  reconciliation jsonb NOT NULL,
  blocking_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  reported_earnings_less_retentions_cents bigint NOT NULL,
  reported_bank_net_cents bigint NOT NULL,
  difference_cents bigint NOT NULL,
  mismatch_count integer NOT NULL,
  blocking_issue_count integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'prepared',
  version integer NOT NULL DEFAULT 1,
  reason_code varchar(64) NOT NULL DEFAULT 'sources_prepared',
  reason_reference varchar(128),
  -- El owner puede preparar sin legajo: membership es la identidad maker
  -- obligatoria. El checker requiere otra membership, vinculo laboral y,
  -- cuando el maker tenia persona vinculada, una persona distinta.
  prepared_by_membership_id uuid NOT NULL,
  prepared_by_person_id uuid,
  decided_by_membership_id uuid,
  decided_by_person_id uuid,
  close_approved boolean NOT NULL DEFAULT false,
  includes_personal_records boolean NOT NULL DEFAULT false,
  raw_content_stored boolean NOT NULL DEFAULT false,
  grh_mutation boolean NOT NULL DEFAULT false,
  payroll_calculated boolean NOT NULL DEFAULT false,
  payroll_posted boolean NOT NULL DEFAULT false,
  bank_artifact_generated boolean NOT NULL DEFAULT false,
  government_artifact_generated boolean NOT NULL DEFAULT false,
  fiscal_artifact_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  CONSTRAINT payroll_monthly_close_run_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_monthly_close_run_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_run_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT payroll_monthly_close_run_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES public.platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_run_preparer_membership_fk
    FOREIGN KEY (prepared_by_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_run_preparer_person_fk
    FOREIGN KEY (prepared_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_run_decider_membership_fk
    FOREIGN KEY (decided_by_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_run_decider_person_fk
    FOREIGN KEY (decided_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_run_period_ck CHECK (
    period_month = date_trunc('month', period_month)::date
  ),
  CONSTRAINT payroll_monthly_close_run_jurisdiction_ck CHECK (jurisdiction IN ('42','55')),
  CONSTRAINT payroll_monthly_close_run_contract_ck CHECK (
    contract_version = 'payroll-monthly-close-run.v1'
  ),
  CONSTRAINT payroll_monthly_close_run_release_ck CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT payroll_monthly_close_run_hash_ck CHECK (source_set_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT payroll_monthly_close_run_sources_ck CHECK (
    source_count = 3 AND jsonb_typeof(source_aggregates) = 'array'
    AND jsonb_array_length(source_aggregates) = 3
    AND jsonb_typeof(reconciliation) = 'object'
    AND jsonb_typeof(blocking_issues) = 'array'
  ),
  CONSTRAINT payroll_monthly_close_run_counts_ck CHECK (
    mismatch_count >= 0 AND blocking_issue_count >= 0
    AND blocking_issue_count = jsonb_array_length(blocking_issues)
  ),
  CONSTRAINT payroll_monthly_close_run_status_ck CHECK (
    status IN ('prepared','submitted','approved','rejected','cancelled')
  ),
  CONSTRAINT payroll_monthly_close_run_version_ck CHECK (version > 0),
  CONSTRAINT payroll_monthly_close_run_reason_ck CHECK (
    reason_code IN (
      'sources_prepared','ready_for_review','approved_by_checker',
      'source_mismatch','evidence_insufficient','period_not_ready',
      'cancelled_by_preparer'
    ) AND (
      reason_reference IS NULL OR reason_reference ~
        '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  ),
  CONSTRAINT payroll_monthly_close_run_decider_pair_ck CHECK (
    (decided_by_membership_id IS NULL AND decided_by_person_id IS NULL)
    OR (decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL)
  ),
  CONSTRAINT payroll_monthly_close_run_maker_checker_ck CHECK (
    decided_by_person_id IS NULL OR (
      decided_by_membership_id <> prepared_by_membership_id
      AND (prepared_by_person_id IS NULL OR decided_by_person_id <> prepared_by_person_id)
    )
  ),
  CONSTRAINT payroll_monthly_close_run_state_ck CHECK (
    (status = 'prepared' AND submitted_at IS NULL AND decided_at IS NULL
      AND reason_code = 'sources_prepared' AND reason_reference IS NULL
      AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL
      AND close_approved IS FALSE)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL
      AND reason_code = 'ready_for_review' AND reason_reference IS NOT NULL
      AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL
      AND close_approved IS FALSE)
    OR (status = 'approved' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL
      AND reason_code = 'approved_by_checker' AND reason_reference IS NOT NULL
      AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL
      AND close_approved IS TRUE AND difference_cents = 0
      AND mismatch_count = 0 AND blocking_issue_count = 0)
    OR (status = 'rejected' AND submitted_at IS NOT NULL AND decided_at IS NOT NULL
      AND reason_code IN ('source_mismatch','evidence_insufficient','period_not_ready')
      AND reason_reference IS NOT NULL
      AND decided_by_membership_id IS NOT NULL AND decided_by_person_id IS NOT NULL
      AND close_approved IS FALSE)
    OR (status = 'cancelled' AND decided_at IS NOT NULL
      AND reason_code = 'cancelled_by_preparer' AND reason_reference IS NOT NULL
      AND decided_by_membership_id IS NULL AND decided_by_person_id IS NULL
      AND close_approved IS FALSE)
  ),
  CONSTRAINT payroll_monthly_close_run_no_side_effect_ck CHECK (
    includes_personal_records IS FALSE AND raw_content_stored IS FALSE
    AND grh_mutation IS FALSE AND payroll_calculated IS FALSE
    AND payroll_posted IS FALSE AND bank_artifact_generated IS FALSE
    AND government_artifact_generated IS FALSE AND fiscal_artifact_generated IS FALSE
  )
);

CREATE TABLE IF NOT EXISTS public.payroll_monthly_close_event (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  certified_binding_id uuid NOT NULL,
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
  reason_reference varchar(128),
  idempotency_key uuid NOT NULL,
  command_hash char(64) NOT NULL,
  event_sha256 char(64) NOT NULL DEFAULT repeat('0', 64),
  close_approved boolean NOT NULL DEFAULT false,
  includes_personal_records boolean NOT NULL DEFAULT false,
  raw_content_stored boolean NOT NULL DEFAULT false,
  grh_mutation boolean NOT NULL DEFAULT false,
  payroll_calculated boolean NOT NULL DEFAULT false,
  payroll_posted boolean NOT NULL DEFAULT false,
  bank_artifact_generated boolean NOT NULL DEFAULT false,
  government_artifact_generated boolean NOT NULL DEFAULT false,
  fiscal_artifact_generated boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_monthly_close_event_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_monthly_close_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_event_run_fk
    FOREIGN KEY (run_id, tenant_id)
    REFERENCES public.payroll_monthly_close_run(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_event_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES public.platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_event_membership_fk
    FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_event_person_fk
    FOREIGN KEY (actor_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_event_role_fk
    FOREIGN KEY (actor_role_key) REFERENCES public.iam_role(role_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_event_capability_fk
    FOREIGN KEY (authority_capability_key)
    REFERENCES public.iam_capability(capability_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_event_session_fk
    FOREIGN KEY (actor_session_id) REFERENCES public.tenant_identity_session(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_monthly_close_event_run_version_uk UNIQUE (run_id, resulting_version),
  CONSTRAINT payroll_monthly_close_event_actor_idempotency_uk
    UNIQUE (tenant_id, actor_membership_id, idempotency_key),
  CONSTRAINT payroll_monthly_close_event_command_ck CHECK (
    command IN ('prepare','submit','approve','reject','cancel')
  ),
  CONSTRAINT payroll_monthly_close_event_authority_ck CHECK (
    (command IN ('prepare','submit','cancel')
      AND authority_capability_key = 'payroll.monthly_close.prepare')
    OR (command IN ('approve','reject')
      AND authority_capability_key = 'payroll.monthly_close.approve')
  ),
  CONSTRAINT payroll_monthly_close_event_decider_person_ck CHECK (
    command NOT IN ('approve','reject') OR actor_person_id IS NOT NULL
  ),
  CONSTRAINT payroll_monthly_close_event_status_ck CHECK (
    (from_status IS NULL OR from_status IN (
      'prepared','submitted','approved','rejected','cancelled'
    )) AND to_status IN ('prepared','submitted','approved','rejected','cancelled')
  ),
  CONSTRAINT payroll_monthly_close_event_version_ck CHECK (
    expected_version >= 0 AND resulting_version = expected_version + 1
  ),
  CONSTRAINT payroll_monthly_close_event_session_version_ck CHECK (actor_session_version > 0),
  CONSTRAINT payroll_monthly_close_event_release_ck CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT payroll_monthly_close_event_idempotency_v4_ck CHECK (
    idempotency_key::text ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_monthly_close_event_hash_ck CHECK (
    command_hash ~ '^[a-f0-9]{64}$' AND event_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT payroll_monthly_close_event_reference_ck CHECK (
    (command = 'prepare' AND reason_reference IS NULL)
    OR (command <> 'prepare' AND reason_reference ~
      '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
  ),
  CONSTRAINT payroll_monthly_close_event_approval_ck CHECK (
    close_approved = (to_status = 'approved')
  ),
  CONSTRAINT payroll_monthly_close_event_no_side_effect_ck CHECK (
    includes_personal_records IS FALSE AND raw_content_stored IS FALSE
    AND grh_mutation IS FALSE AND payroll_calculated IS FALSE
    AND payroll_posted IS FALSE AND bank_artifact_generated IS FALSE
    AND government_artifact_generated IS FALSE AND fiscal_artifact_generated IS FALSE
  )
);

CREATE INDEX IF NOT EXISTS payroll_monthly_close_run_tenant_status_idx
  ON public.payroll_monthly_close_run (tenant_id, status, period_month DESC, id);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_monthly_close_run_active_period_uk
  ON public.payroll_monthly_close_run (
    tenant_id, certified_binding_id, period_month, jurisdiction
  ) WHERE status IN ('prepared','submitted','approved');
CREATE INDEX IF NOT EXISTS payroll_monthly_close_event_timeline_idx
  ON public.payroll_monthly_close_event (tenant_id, run_id, occurred_at, id);

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_flags_v1(p_close_approved boolean)
RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'closeApproved', COALESCE(p_close_approved, false),
    'includesPersonalRecords', false,
    'rawContentStored', false,
    'grhMutation', false,
    'payrollCalculated', false,
    'payrollPosted', false,
    'bankArtifactGenerated', false,
    'governmentArtifactGenerated', false,
    'fiscalArtifactGenerated', false
  )
$$;

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_reject_event_change_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_EVENT_APPEND_ONLY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_hash_event_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.event_sha256 := encode(digest(convert_to(jsonb_build_object(
    'tenantId', NEW.tenant_id::text,
    'runId', NEW.run_id::text,
    'bindingId', NEW.certified_binding_id::text,
    'membershipId', NEW.actor_membership_id::text,
    'personId', NEW.actor_person_id::text,
    'roleKey', NEW.actor_role_key,
    'authorityCapabilityKey', NEW.authority_capability_key,
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
    'occurredAt', to_char(
      NEW.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ),
    'closeApproved', NEW.close_approved,
    'includesPersonalRecords', false,
    'rawContentStored', false,
    'grhMutation', false,
    'payrollCalculated', false,
    'payrollPosted', false,
    'bankArtifactGenerated', false,
    'governmentArtifactGenerated', false,
    'fiscalArtifactGenerated', false
  )::text, 'UTF8'), 'sha256'), 'hex');
  RETURN NEW;
END
$$;

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
     ) THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_RUN_CHANGE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS payroll_monthly_close_event_hash_v1
  ON public.payroll_monthly_close_event;
CREATE TRIGGER payroll_monthly_close_event_hash_v1
BEFORE INSERT ON public.payroll_monthly_close_event
FOR EACH ROW EXECUTE FUNCTION public.payroll_monthly_close_hash_event_v1();

DROP TRIGGER IF EXISTS payroll_monthly_close_event_append_only_v1
  ON public.payroll_monthly_close_event;
CREATE TRIGGER payroll_monthly_close_event_append_only_v1
BEFORE UPDATE OR DELETE ON public.payroll_monthly_close_event
FOR EACH ROW EXECUTE FUNCTION public.payroll_monthly_close_reject_event_change_v1();

DROP TRIGGER IF EXISTS payroll_monthly_close_run_guard_v1
  ON public.payroll_monthly_close_run;
CREATE TRIGGER payroll_monthly_close_run_guard_v1
BEFORE UPDATE OR DELETE ON public.payroll_monthly_close_run
FOR EACH ROW EXECUTE FUNCTION public.payroll_monthly_close_guard_run_v1();

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_assert_context_v1(
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
       'payroll.monthly_close.read','payroll.monthly_close.prepare',
       'payroll.monthly_close.approve','payroll.monthly_close.audit.read'
     ) THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.action_center_assert_tenant_read_session_v2(
    p_context->>'actorEmail',
    (p_context->>'actorSessionId')::uuid,
    (p_context->>'actorSessionVersion')::integer,
    lower(p_context->>'releaseSha'),
    (p_context->>'tenantId')::uuid,
    (p_context->>'membershipId')::uuid
  );
  IF NOT public.action_center_context_has_capability(context_value, p_required_capability) THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  RETURN context_value || jsonb_build_object(
    'certifiedBindingId', context_value->>'sourceBindingId',
    'employmentLinked', context_value->>'actorPersonId' IS NOT NULL,
    'releaseSha', lower(p_context->>'releaseSha')
  );
EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_snapshot_v1(
  p_run_id uuid,
  p_tenant_id uuid,
  p_include_sources boolean,
  p_include_audit boolean
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', item.id,
    'contractVersion', item.contract_version,
    'period', to_char(item.period_month, 'YYYY-MM'),
    'jurisdiction', item.jurisdiction,
    'status', item.status,
    'version', item.version,
    'sourceSetSha256', item.source_set_sha256,
    'sourceCount', item.source_count,
    'mismatchCount', item.mismatch_count,
    'blockingIssueCount', item.blocking_issue_count,
    'reasonCode', item.reason_code,
    'reasonReference', item.reason_reference,
    'closeApproved', item.close_approved,
    'totals', jsonb_build_object(
      'reportedEarningsLessRetentionsCents', item.reported_earnings_less_retentions_cents::text,
      'reportedBankNetCents', item.reported_bank_net_cents::text,
      'differenceCents', item.difference_cents::text
    ),
    'sources', CASE WHEN p_include_sources THEN item.source_aggregates ELSE '[]'::jsonb END,
    'reconciliation', CASE WHEN p_include_sources THEN item.reconciliation ELSE NULL END,
    'blockingIssues', CASE WHEN p_include_sources THEN item.blocking_issues ELSE '[]'::jsonb END,
    'createdAt', item.created_at,
    'updatedAt', item.updated_at,
    'submittedAt', item.submitted_at,
    'decidedAt', item.decided_at,
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
      FROM public.payroll_monthly_close_event event
      WHERE event.run_id = item.id AND event.tenant_id = item.tenant_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  )
  FROM public.payroll_monthly_close_run item
  WHERE item.id = p_run_id AND item.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_event_result_v1(
  p_event_id bigint,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'replayed', false,
    'eventId', event.id,
    'eventSha256', event.event_sha256,
    'run', public.payroll_monthly_close_snapshot_v1(
      event.run_id, event.tenant_id, true, true
    ),
    'flags', public.payroll_monthly_close_flags_v1(run.close_approved)
  )
  FROM public.payroll_monthly_close_event event
  JOIN public.payroll_monthly_close_run run
    ON run.id = event.run_id AND run.tenant_id = event.tenant_id
  WHERE event.id = p_event_id AND event.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_attempt_v1(
  p_context jsonb,
  p_idempotency uuid,
  p_command text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  event_row public.payroll_monthly_close_event%ROWTYPE;
  required_capability text;
BEGIN
  IF p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_command NOT IN ('prepare','submit','approve','reject','cancel') THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  required_capability := CASE WHEN p_command IN ('approve','reject')
    THEN 'payroll.monthly_close.approve' ELSE 'payroll.monthly_close.prepare' END;
  context_value := public.payroll_monthly_close_assert_context_v1(
    p_context, required_capability
  );
  SELECT * INTO event_row FROM public.payroll_monthly_close_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency
    AND event.command = p_command;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF event_row.certified_binding_id <>
       (context_value->>'certifiedBindingId')::uuid
     OR event_row.actor_session_id <> (context_value->>'actorSessionId')::uuid
     OR event_row.actor_session_version <>
       (context_value->>'actorSessionVersion')::integer
     OR event_row.release_sha <> lower(context_value->>'releaseSha')
     OR event_row.actor_person_id IS DISTINCT FROM
       (context_value->>'actorPersonId')::uuid
     OR event_row.actor_role_key <> context_value->>'roleKey'
     OR event_row.authority_capability_key <> required_capability THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_CONTEXT_CHANGED'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN public.payroll_monthly_close_event_result_v1(
    event_row.id, event_row.tenant_id
  ) || jsonb_build_object('replayed', true);
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_bootstrap_v1(p_context jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  runs_value jsonb;
  events_value jsonb;
  capabilities_value jsonb;
BEGIN
  context_value := public.payroll_monthly_close_assert_context_v1(
    p_context, 'payroll.monthly_close.read'
  );
  SELECT COALESCE(jsonb_agg(public.payroll_monthly_close_snapshot_v1(
      recent.id, recent.tenant_id, false, false
    ) ORDER BY recent.period_month DESC, recent.created_at DESC), '[]'::jsonb)
    INTO runs_value
  FROM (
    SELECT item.* FROM public.payroll_monthly_close_run item
    WHERE item.tenant_id = (context_value->>'tenantId')::uuid
      AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    ORDER BY item.period_month DESC, item.created_at DESC LIMIT 20
  ) recent;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', recent.id, 'runId', recent.run_id, 'command', recent.command,
      'toStatus', recent.to_status, 'eventSha256', recent.event_sha256,
      'occurredAt', recent.occurred_at
    ) ORDER BY recent.id DESC), '[]'::jsonb) INTO events_value
  FROM (
    SELECT event.* FROM public.payroll_monthly_close_event event
    WHERE event.tenant_id = (context_value->>'tenantId')::uuid
      AND event.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    ORDER BY event.id DESC LIMIT 20
  ) recent;
  SELECT COALESCE(jsonb_agg(capability.value ORDER BY capability.value), '[]'::jsonb)
    INTO capabilities_value
  FROM jsonb_array_elements_text(context_value->'capabilities') capability(value)
  WHERE capability.value LIKE 'payroll.monthly_close.%';
  RETURN jsonb_build_object(
    'principal', jsonb_build_object(
      'tenantId', context_value->>'tenantId',
      'membershipId', context_value->>'membershipId',
      'certifiedBindingId', context_value->>'certifiedBindingId',
      'roleKey', context_value->>'roleKey',
      'employmentLinked', (context_value->>'employmentLinked')::boolean,
      'capabilities', capabilities_value
    ),
    'limits', jsonb_build_object(
      'contractVersion', 'payroll-monthly-close-run.v1',
      'sourceContracts', jsonb_build_array(
        jsonb_build_object('definitionKey','grh-concept-statistics.v1','sourceKind','grh_observed'),
        jsonb_build_object('definitionKey','bank-accreditation-summary.v1','sourceKind','bank_control'),
        jsonb_build_object('definitionKey','government-payroll-summary.v1','sourceKind','government_control')
      ),
      'maxSourceBytes', 262144,
      'sourceCount', 3,
      'jurisdictions', jsonb_build_array('42','55'),
      'toleranceCents', '0'
    ),
    'runs', runs_value,
    'recentEvents', CASE WHEN context_value->'capabilities'
      ? 'payroll.monthly_close.audit.read' THEN events_value ELSE '[]'::jsonb END,
    'flags', public.payroll_monthly_close_flags_v1(false)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_list_v1(
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
  runs_value jsonb;
BEGIN
  IF p_status NOT IN ('all','prepared','submitted','approved','rejected','cancelled')
     OR p_page NOT BETWEEN 1 AND 10000 OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_LIST_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_monthly_close_assert_context_v1(
    p_context, 'payroll.monthly_close.read'
  );
  SELECT count(*) INTO total_value FROM public.payroll_monthly_close_run item
  WHERE item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    AND (p_status = 'all' OR item.status = p_status);
  SELECT COALESCE(jsonb_agg(public.payroll_monthly_close_snapshot_v1(
      selected.id, selected.tenant_id, false, false
    ) ORDER BY selected.period_month DESC, selected.created_at DESC), '[]'::jsonb)
    INTO runs_value
  FROM (
    SELECT item.* FROM public.payroll_monthly_close_run item
    WHERE item.tenant_id = (context_value->>'tenantId')::uuid
      AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
      AND (p_status = 'all' OR item.status = p_status)
    ORDER BY item.period_month DESC, item.created_at DESC
    OFFSET (p_page - 1) * p_limit LIMIT p_limit
  ) selected;
  RETURN jsonb_build_object(
    'runs', runs_value, 'total', total_value, 'page', p_page, 'limit', p_limit,
    'flags', public.payroll_monthly_close_flags_v1(false)
  );
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

CREATE OR REPLACE FUNCTION public.payroll_monthly_close_prepare_v1(
  p_context jsonb,
  p_certified_binding_id uuid,
  p_period_month date,
  p_jurisdiction text,
  p_source_set_sha256 text,
  p_sources jsonb,
  p_reconciliation jsonb,
  p_blocking_issues jsonb,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  existing_event public.payroll_monthly_close_event%ROWTYPE;
  run_id_value uuid;
  event_id_value bigint;
  definition_count integer;
  reported_value bigint;
  bank_value bigint;
  difference_value bigint;
  mismatch_value integer;
  blocking_value integer;
  source_value jsonb;
  row_value jsonb;
  issue_value jsonb;
  comparison_value jsonb;
  key_set text[];
  row_count integer;
  distinct_count integer;
  government_missing integer;
  comparison_count integer;
  comparison_mismatch integer;
  partition_count integer;
  bank_mismatch integer;
  government_mismatch integer;
  computed_reported numeric;
  computed_bank numeric;
  computed_grh_earnings numeric;
  computed_grh_contributions numeric;
  computed_government_earnings numeric;
  computed_government_contributions numeric;
  expected_government_comparisons jsonb;
  expected_issue_codes jsonb;
  expected_reconciliation_issues jsonb;
  expected_blocking_issues jsonb;
  expected_source_set_sha256 text;
BEGIN
  IF p_certified_binding_id IS NULL OR p_period_month IS NULL
     OR p_period_month <> date_trunc('month', p_period_month)::date
     OR p_jurisdiction NOT IN ('42','55')
     OR lower(COALESCE(p_source_set_sha256,'')) !~ '^[a-f0-9]{64}$'
     OR jsonb_typeof(p_sources) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_sources) <> 3
     OR jsonb_typeof(p_reconciliation) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_blocking_issues) IS DISTINCT FROM 'array'
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF lower(p_sources::text) ~
    '"(name|filename|originalname|dni|cuil|cbu|legajo|email|accountnumber)"[[:space:]]*:'
     OR lower(p_sources::text) ~ '"(contentbase64|bytes|rawcontent)"[[:space:]]*:' THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  FOR source_value IN SELECT value FROM jsonb_array_elements(p_sources) source(value)
  LOOP
    IF jsonb_typeof(source_value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT array_agg(key ORDER BY key) INTO key_set
    FROM jsonb_object_keys(source_value) keys(key);
    IF key_set IS DISTINCT FROM ARRAY[
        'aggregates','byteLength','contentHmacSha256','definitionKey',
        'manifestSha256','recordCount','sourceKind'
      ]::text[]
       OR jsonb_typeof(source_value->'aggregates') IS DISTINCT FROM 'object'
       OR COALESCE(source_value->>'contentHmacSha256','') !~ '^[a-f0-9]{64}$'
       OR COALESCE(source_value->>'manifestSha256','') !~ '^[a-f0-9]{64}$'
       OR COALESCE(source_value->>'byteLength','') !~ '^[1-9][0-9]{0,5}$'
       OR (CASE WHEN COALESCE(source_value->>'byteLength','') ~ '^[1-9][0-9]{0,5}$'
         THEN (source_value->>'byteLength')::numeric NOT BETWEEN 1 AND 262144
         ELSE false END)
       OR COALESCE(source_value->>'recordCount','') !~ '^[1-9][0-9]{0,4}$' THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT array_agg(key ORDER BY key) INTO key_set
    FROM jsonb_object_keys(source_value->'aggregates') keys(key);
    IF key_set IS DISTINCT FROM ARRAY['readiness','rows','totals']::text[]
       OR jsonb_typeof(source_value->'aggregates'->'rows') IS DISTINCT FROM 'array'
       OR jsonb_typeof(source_value->'aggregates'->'readiness') IS DISTINCT FROM 'object'
       OR (CASE WHEN COALESCE(source_value->>'recordCount','') ~ '^[1-9][0-9]{0,4}$'
         THEN (source_value->>'recordCount')::integer <>
           jsonb_array_length(source_value->'aggregates'->'rows')
         ELSE true END) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT array_agg(key ORDER BY key) INTO key_set
    FROM jsonb_object_keys(source_value->'aggregates'->'readiness') keys(key);
    IF key_set IS DISTINCT FROM ARRAY[
        'blockingIssues','readyForReview','structurallyValid'
      ]::text[]
       OR jsonb_typeof(source_value->'aggregates'->'readiness'->'blockingIssues')
         IS DISTINCT FROM 'array'
       OR jsonb_typeof(source_value->'aggregates'->'readiness'->'structurallyValid')
         IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(source_value->'aggregates'->'readiness'->'readyForReview')
         IS DISTINCT FROM 'boolean'
       OR COALESCE((source_value->'aggregates'->'readiness'->>'structurallyValid')::boolean,
         false) IS FALSE
       OR COALESCE((source_value->'aggregates'->'readiness'->>'readyForReview')::boolean,
         false) IS DISTINCT FROM (
           jsonb_array_length(
             source_value->'aggregates'->'readiness'->'blockingIssues'
           ) = 0
         ) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;

    IF source_value->>'definitionKey' = 'grh-concept-statistics.v1' THEN
      IF jsonb_typeof(source_value->'aggregates'->'totals') IS DISTINCT FROM 'object'
         OR jsonb_array_length(source_value->'aggregates'->'rows') NOT BETWEEN 1 AND 5000
         OR jsonb_array_length(
           source_value->'aggregates'->'readiness'->'blockingIssues'
         ) <> 0 THEN
        RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
      END IF;
      SELECT array_agg(key ORDER BY key) INTO key_set
      FROM jsonb_object_keys(source_value->'aggregates'->'totals') keys(key);
      IF key_set IS DISTINCT FROM ARRAY[
          'asignacionesFamiliaresCents','contribucionesCents',
          'haberesNoRemunerativosCents','haberesRemunerativosCents','retencionesCents'
        ]::text[] OR EXISTS (
          SELECT 1 FROM jsonb_each_text(
            source_value->'aggregates'->'totals'
          ) total_item(key, value)
          WHERE value !~ '^(0|-?[1-9][0-9]{0,18})$'
            OR (CASE WHEN value ~ '^(0|-?[1-9][0-9]{0,18})$'
              THEN value::numeric NOT BETWEEN -9223372036854775808 AND 9223372036854775807
              ELSE false END)
        ) THEN
        RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
      END IF;
      FOR row_value IN SELECT value FROM jsonb_array_elements(
        source_value->'aggregates'->'rows'
      ) row_item(value)
      LOOP
        IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
        END IF;
        SELECT array_agg(key ORDER BY key) INTO key_set
        FROM jsonb_object_keys(row_value) keys(key);
        IF key_set IS DISTINCT FROM ARRAY[
            'asignacionesFamiliaresCents','conceptCode','contribucionesCents',
            'haberesNoRemunerativosCents','haberesRemunerativosCents','occurrences',
            'quantityHundredths','repartitionCode','retencionesCents'
          ]::text[]
           OR COALESCE(row_value->>'repartitionCode','') !~ '^[0-9]{1,8}$'
           OR COALESCE(row_value->>'conceptCode','') !~ '^[0-9]{1,8}$'
           OR COALESCE(row_value->>'occurrences','') !~ '^[1-9][0-9]{0,9}$'
           OR (CASE WHEN COALESCE(row_value->>'occurrences','') ~ '^[1-9][0-9]{0,9}$'
             THEN (row_value->>'occurrences')::numeric > 2147483647
             ELSE false END)
           OR COALESCE(row_value->>'quantityHundredths','') !~ '^(0|-?[1-9][0-9]{0,18})$'
           OR COALESCE(row_value->>'haberesRemunerativosCents','') !~ '^(0|-?[1-9][0-9]{0,18})$'
           OR COALESCE(row_value->>'haberesNoRemunerativosCents','') !~ '^(0|-?[1-9][0-9]{0,18})$'
           OR COALESCE(row_value->>'asignacionesFamiliaresCents','') !~ '^(0|-?[1-9][0-9]{0,18})$'
           OR COALESCE(row_value->>'retencionesCents','') !~ '^(0|-?[1-9][0-9]{0,18})$'
           OR COALESCE(row_value->>'contribucionesCents','') !~ '^(0|-?[1-9][0-9]{0,18})$'
           OR EXISTS (
             SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(
               row_value->>'quantityHundredths', row_value->>'haberesRemunerativosCents',
               row_value->>'haberesNoRemunerativosCents',
               row_value->>'asignacionesFamiliaresCents', row_value->>'retencionesCents',
               row_value->>'contribucionesCents'
             )) numeric_item(value)
             WHERE CASE WHEN value ~ '^(0|-?[1-9][0-9]{0,18})$'
               THEN value::numeric NOT BETWEEN -9223372036854775808 AND 9223372036854775807
               ELSE false END
           )
           OR (CASE WHEN COALESCE(row_value->>'quantityHundredths','')
                ~ '^(0|-?[1-9][0-9]{0,18})$'
             AND NOT EXISTS (
               SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(
                 row_value->>'haberesRemunerativosCents',
                 row_value->>'haberesNoRemunerativosCents',
                 row_value->>'asignacionesFamiliaresCents',
                 row_value->>'retencionesCents', row_value->>'contribucionesCents'
               )) money_item(value)
               WHERE value !~ '^(0|-?[1-9][0-9]{0,18})$'
             ) THEN (row_value->>'quantityHundredths')::numeric = 0
               AND (row_value->>'haberesRemunerativosCents')::numeric = 0
               AND (row_value->>'haberesNoRemunerativosCents')::numeric = 0
               AND (row_value->>'asignacionesFamiliaresCents')::numeric = 0
               AND (row_value->>'retencionesCents')::numeric = 0
               AND (row_value->>'contribucionesCents')::numeric = 0
             ELSE false END) THEN
          RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
        END IF;
      END LOOP;
      SELECT count(*), count(DISTINCT (row_item->>'repartitionCode')
        || ':' || (row_item->>'conceptCode')) INTO row_count, distinct_count
      FROM jsonb_array_elements(source_value->'aggregates'->'rows') row_item;
      IF row_count <> distinct_count
         OR (source_value->'aggregates'->'totals'->>'haberesRemunerativosCents')::numeric
           <> (SELECT COALESCE(sum((item->>'haberesRemunerativosCents')::numeric), 0)
               FROM jsonb_array_elements(source_value->'aggregates'->'rows') item)
         OR (source_value->'aggregates'->'totals'->>'haberesNoRemunerativosCents')::numeric
           <> (SELECT COALESCE(sum((item->>'haberesNoRemunerativosCents')::numeric), 0)
               FROM jsonb_array_elements(source_value->'aggregates'->'rows') item)
         OR (source_value->'aggregates'->'totals'->>'asignacionesFamiliaresCents')::numeric
           <> (SELECT COALESCE(sum((item->>'asignacionesFamiliaresCents')::numeric), 0)
               FROM jsonb_array_elements(source_value->'aggregates'->'rows') item)
         OR (source_value->'aggregates'->'totals'->>'retencionesCents')::numeric
           <> (SELECT COALESCE(sum((item->>'retencionesCents')::numeric), 0)
               FROM jsonb_array_elements(source_value->'aggregates'->'rows') item)
         OR (source_value->'aggregates'->'totals'->>'contribucionesCents')::numeric
           <> (SELECT COALESCE(sum((item->>'contribucionesCents')::numeric), 0)
               FROM jsonb_array_elements(source_value->'aggregates'->'rows') item) THEN
        RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
      END IF;
    ELSIF source_value->>'definitionKey' = 'bank-accreditation-summary.v1' THEN
      IF jsonb_typeof(source_value->'aggregates'->'totals') IS DISTINCT FROM 'object'
         OR jsonb_array_length(source_value->'aggregates'->'rows') NOT BETWEEN 1 AND 1000
         OR jsonb_array_length(
           source_value->'aggregates'->'readiness'->'blockingIssues'
         ) <> 0 THEN
        RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
      END IF;
      SELECT array_agg(key ORDER BY key) INTO key_set
      FROM jsonb_object_keys(source_value->'aggregates'->'totals') keys(key);
      IF key_set IS DISTINCT FROM ARRAY['netAmountCents','operations']::text[]
         OR EXISTS (
           SELECT 1 FROM jsonb_each_text(
             source_value->'aggregates'->'totals'
           ) total_item(key, value)
           WHERE value !~ '^[1-9][0-9]{0,18}$'
             OR (CASE WHEN value ~ '^[1-9][0-9]{0,18}$'
               THEN value::numeric NOT BETWEEN 1 AND 9223372036854775807
               ELSE false END)
         ) THEN
        RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
      END IF;
      FOR row_value IN SELECT value FROM jsonb_array_elements(
        source_value->'aggregates'->'rows'
      ) row_item(value)
      LOOP
        IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
        END IF;
        SELECT array_agg(key ORDER BY key) INTO key_set
        FROM jsonb_object_keys(row_value) keys(key);
        IF key_set IS DISTINCT FROM ARRAY[
            'accountType','bankCode','netAmountCents','operations','repartitionCode'
          ]::text[]
           OR COALESCE(row_value->>'repartitionCode','') !~ '^[0-9]{1,8}$'
           OR COALESCE(row_value->>'bankCode','') !~ '^[0-9]{1,8}$'
           OR COALESCE(row_value->>'accountType','') NOT IN (
             'cuenta_corriente','caja_ahorro','transferencia_especial'
           ) OR COALESCE(row_value->>'operations','') !~ '^[1-9][0-9]{0,9}$'
           OR (CASE WHEN COALESCE(row_value->>'operations','') ~ '^[1-9][0-9]{0,9}$'
             THEN (row_value->>'operations')::numeric > 2147483647
             ELSE false END)
           OR COALESCE(row_value->>'netAmountCents','') !~ '^[1-9][0-9]{0,18}$'
           OR (CASE WHEN COALESCE(row_value->>'netAmountCents','') ~ '^[1-9][0-9]{0,18}$'
             THEN (row_value->>'netAmountCents')::numeric > 9223372036854775807
             ELSE false END) THEN
          RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
        END IF;
      END LOOP;
      SELECT count(*), count(DISTINCT (row_item->>'repartitionCode') || ':'
        || (row_item->>'bankCode') || ':' || (row_item->>'accountType'))
        INTO row_count, distinct_count
      FROM jsonb_array_elements(source_value->'aggregates'->'rows') row_item;
      IF row_count <> distinct_count
         OR (source_value->'aggregates'->'totals'->>'operations')::numeric
           <> (SELECT sum((item->>'operations')::numeric)
               FROM jsonb_array_elements(source_value->'aggregates'->'rows') item)
         OR (source_value->'aggregates'->'totals'->>'netAmountCents')::numeric
           <> (SELECT sum((item->>'netAmountCents')::numeric)
               FROM jsonb_array_elements(source_value->'aggregates'->'rows') item) THEN
        RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
      END IF;
    ELSIF source_value->>'definitionKey' = 'government-payroll-summary.v1' THEN
      IF jsonb_typeof(source_value->'aggregates'->'totals') IS DISTINCT FROM 'null'
         OR jsonb_array_length(source_value->'aggregates'->'rows') <> 14 THEN
        RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
      END IF;
      FOR row_value IN SELECT value FROM jsonb_array_elements(
        source_value->'aggregates'->'rows'
      ) row_item(value)
      LOOP
        IF jsonb_typeof(row_value) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
        END IF;
        SELECT array_agg(key ORDER BY key) INTO key_set
        FROM jsonb_object_keys(row_value) keys(key);
        IF key_set IS DISTINCT FROM ARRAY['metric','state','unit','valueInteger']::text[]
           OR COALESCE(row_value->>'metric','') NOT IN (
             'cantidad_agentes','haberes_rem_no_docentes','haberes_rem_docentes',
             'haberes_no_rem','aportes_jubilatorios_no_docentes',
             'aportes_jubilatorios_docentes','aportes_jubilatorios_docentes_2',
             'aportes_osep','aportes_osep_no_rem','seguro_mutual',
             'contribuciones_jubilatorias','contribuciones_osep',
             'contribuciones_osep_no_rem','art'
           ) OR COALESCE(row_value->>'unit','') <> (CASE
             WHEN row_value->>'metric' = 'cantidad_agentes' THEN 'personas'
             ELSE 'centavos' END)
           OR COALESCE(row_value->>'state','') NOT IN ('informado','no_informado')
           OR (row_value->>'state' = 'informado' AND
             (COALESCE(row_value->>'valueInteger','') !~ '^(0|[1-9][0-9]{0,18})$'
              OR (CASE WHEN COALESCE(row_value->>'valueInteger','')
                   ~ '^(0|[1-9][0-9]{0,18})$'
                 THEN (row_value->>'valueInteger')::numeric > 9223372036854775807
                 ELSE false END)))
           OR (row_value->>'state' = 'no_informado' AND
             jsonb_typeof(row_value->'valueInteger') IS DISTINCT FROM 'null') THEN
          RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
        END IF;
      END LOOP;
      IF source_value->'aggregates'->'readiness'->'blockingIssues'
           IS DISTINCT FROM COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'code', 'MONTHLY_CLOSE_METRIC_NOT_INFORMED',
               'metric', row_item.value->>'metric'
             ) ORDER BY row_item.ordinality)
             FROM jsonb_array_elements(source_value->'aggregates'->'rows')
               WITH ORDINALITY row_item(value, ordinality)
             WHERE row_item.value->>'state' = 'no_informado'
           ), '[]'::jsonb) THEN
        RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
      END IF;
      SELECT count(*), count(DISTINCT row_item->>'metric')
        INTO row_count, distinct_count
      FROM jsonb_array_elements(source_value->'aggregates'->'rows') row_item;
      IF row_count <> 14 OR distinct_count <> 14 THEN
        RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
      END IF;
      FOR issue_value IN SELECT value FROM jsonb_array_elements(
        source_value->'aggregates'->'readiness'->'blockingIssues'
      ) issue(value)
      LOOP
        IF jsonb_typeof(issue_value) IS DISTINCT FROM 'object' THEN
          RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
        END IF;
        SELECT array_agg(key ORDER BY key) INTO key_set
        FROM jsonb_object_keys(issue_value) keys(key);
        IF key_set IS DISTINCT FROM ARRAY['code','metric']::text[]
           OR issue_value->>'code' <> 'MONTHLY_CLOSE_METRIC_NOT_INFORMED' THEN
          RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
        END IF;
      END LOOP;
    ELSE
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  SELECT count(DISTINCT source->>'definitionKey') INTO definition_count
  FROM jsonb_array_elements(p_sources) source
  WHERE jsonb_typeof(source) = 'object'
    AND source->>'definitionKey' IN (
      'grh-concept-statistics.v1','bank-accreditation-summary.v1',
      'government-payroll-summary.v1'
    )
    AND ((source->>'definitionKey' = 'grh-concept-statistics.v1'
        AND source->>'sourceKind' = 'grh_observed')
      OR (source->>'definitionKey' = 'bank-accreditation-summary.v1'
        AND source->>'sourceKind' = 'bank_control')
      OR (source->>'definitionKey' = 'government-payroll-summary.v1'
        AND source->>'sourceKind' = 'government_control'))
    AND source->>'contentHmacSha256' ~ '^[a-f0-9]{64}$'
    AND source->>'manifestSha256' ~ '^[a-f0-9]{64}$'
    AND (source->>'byteLength') ~ '^[1-9][0-9]{0,5}$'
    AND (CASE WHEN (source->>'byteLength') ~ '^[1-9][0-9]{0,5}$'
      THEN (source->>'byteLength')::integer BETWEEN 1 AND 262144 ELSE false END)
    AND (source->>'recordCount') ~ '^[1-9][0-9]{0,4}$'
    AND jsonb_typeof(source->'aggregates') = 'object'
    AND jsonb_typeof(source->'aggregates'->'rows') = 'array'
    AND jsonb_typeof(source->'aggregates'->'readiness') = 'object';
  IF definition_count <> 3 THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT encode(digest(convert_to(
    '{"contractVersion":"payroll-monthly-close-run.v1","jurisdiction":"'
      || p_jurisdiction || '","manifests":['
      || string_agg(
        '{"definitionKey":"' || (source->>'definitionKey')
          || '","manifestSha256":"' || (source->>'manifestSha256') || '"}',
        ',' ORDER BY CASE source->>'definitionKey'
          WHEN 'bank-accreditation-summary.v1' THEN 1
          WHEN 'government-payroll-summary.v1' THEN 2
          ELSE 3 END
      ) || '],"period":"' || to_char(p_period_month, 'YYYY-MM') || '"}',
    'UTF8'), 'sha256'), 'hex') INTO expected_source_set_sha256
  FROM jsonb_array_elements(p_sources) source;
  IF lower(p_source_set_sha256) <> expected_source_set_sha256 THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(p_reconciliation->>'toleranceCents','') <> '0'
     OR COALESCE(p_reconciliation->>'basis','') <>
       'three_source_exact_aggregate_reconciliation'
     OR jsonb_typeof(p_reconciliation->'totals') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_reconciliation->'comparisons') IS DISTINCT FROM 'array'
     OR COALESCE(p_reconciliation->'totals'->>'reportedEarningsLessRetentionsCents','')
       !~ '^(0|-?[1-9][0-9]{0,18})$'
     OR COALESCE(p_reconciliation->'totals'->>'reportedBankNetCents','')
       !~ '^(0|-?[1-9][0-9]{0,18})$'
     OR COALESCE(p_reconciliation->'totals'->>'differenceCents','')
       !~ '^(0|-?[1-9][0-9]{0,18})$'
     OR EXISTS (
       SELECT 1 FROM jsonb_each_text(p_reconciliation->'totals') total_item(key, value)
       WHERE CASE WHEN value ~ '^(0|-?[1-9][0-9]{0,18})$'
         THEN value::numeric NOT BETWEEN -9223372036854775808 AND 9223372036854775807
         ELSE false END
     ) THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT array_agg(key ORDER BY key) INTO key_set
  FROM jsonb_object_keys(p_reconciliation) keys(key);
  IF key_set IS DISTINCT FROM ARRAY[
      'basis','blockingIssues','comparisons','formula','governmentComparisons',
      'governmentSummaryCompared','matched','payrollNetCertified','rulesInferred',
      'status','toleranceCents','totals'
    ]::text[]
     OR p_reconciliation->>'formula' <>
       'haberes_rem + haberes_no_rem + asignaciones_familiares - retenciones'
     OR p_reconciliation->>'status' NOT IN ('matched','blocked')
     OR jsonb_typeof(p_reconciliation->'matched') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_reconciliation->'rulesInferred') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_reconciliation->'governmentSummaryCompared')
       IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_reconciliation->'payrollNetCertified')
       IS DISTINCT FROM 'boolean'
     OR COALESCE((p_reconciliation->>'rulesInferred')::boolean, true) IS TRUE
     OR COALESCE((p_reconciliation->>'governmentSummaryCompared')::boolean, false) IS FALSE
     OR COALESCE((p_reconciliation->>'payrollNetCertified')::boolean, true) IS TRUE
     OR jsonb_typeof(p_reconciliation->'blockingIssues') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_reconciliation->'governmentComparisons') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_reconciliation->'governmentComparisons') <> 2 THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT array_agg(key ORDER BY key) INTO key_set
  FROM jsonb_object_keys(p_reconciliation->'totals') keys(key);
  IF key_set IS DISTINCT FROM ARRAY[
      'differenceCents','reportedBankNetCents','reportedEarningsLessRetentionsCents'
    ]::text[] THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  FOR comparison_value IN SELECT value
    FROM jsonb_array_elements(p_reconciliation->'comparisons') comparison(value)
  LOOP
    IF jsonb_typeof(comparison_value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT array_agg(key ORDER BY key) INTO key_set
    FROM jsonb_object_keys(comparison_value) keys(key);
    IF key_set IS DISTINCT FROM ARRAY[
        'differenceCents','issueCodes','matches','repartitionCode',
        'reportedBankNetCents','reportedEarningsLessRetentionsCents'
      ]::text[]
       OR COALESCE(comparison_value->>'repartitionCode','') !~ '^[0-9]{1,8}$'
       OR jsonb_typeof(comparison_value->'issueCodes') IS DISTINCT FROM 'array'
       OR jsonb_typeof(comparison_value->'matches') IS DISTINCT FROM 'boolean'
       OR (comparison_value->'reportedEarningsLessRetentionsCents' <> 'null'::jsonb
         AND COALESCE(comparison_value->>'reportedEarningsLessRetentionsCents','')
           !~ '^(0|-?[1-9][0-9]{0,18})$')
       OR (comparison_value->'reportedBankNetCents' <> 'null'::jsonb
         AND COALESCE(comparison_value->>'reportedBankNetCents','')
           !~ '^(0|-?[1-9][0-9]{0,18})$')
       OR (comparison_value->'differenceCents' <> 'null'::jsonb
         AND COALESCE(comparison_value->>'differenceCents','')
            !~ '^(0|-?[1-9][0-9]{0,18})$')
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(
           comparison_value->>'reportedEarningsLessRetentionsCents',
           comparison_value->>'reportedBankNetCents', comparison_value->>'differenceCents'
         )) numeric_item(value)
         WHERE value IS NOT NULL
           AND (CASE WHEN value ~ '^(0|-?[1-9][0-9]{0,18})$'
             THEN value::numeric NOT BETWEEN -9223372036854775808 AND 9223372036854775807
             ELSE false END)
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(comparison_value->'issueCodes') code
         WHERE code NOT IN (
           'MONTHLY_CLOSE_REPARTITION_MISSING_IN_CONCEPT_STATISTICS',
           'MONTHLY_CLOSE_REPARTITION_MISSING_IN_BANK_SUMMARY',
           'MONTHLY_CLOSE_REPARTITION_NET_MISMATCH'
         )
       ) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT sum((row_item->>'haberesRemunerativosCents')::numeric
        + (row_item->>'haberesNoRemunerativosCents')::numeric
        + (row_item->>'asignacionesFamiliaresCents')::numeric
        - (row_item->>'retencionesCents')::numeric)
      INTO computed_reported
    FROM jsonb_array_elements(p_sources) source_item,
      jsonb_array_elements(source_item->'aggregates'->'rows') row_item
    WHERE source_item->>'definitionKey' = 'grh-concept-statistics.v1'
      AND row_item->>'repartitionCode' = comparison_value->>'repartitionCode';
    SELECT sum((row_item->>'netAmountCents')::numeric) INTO computed_bank
    FROM jsonb_array_elements(p_sources) source_item,
      jsonb_array_elements(source_item->'aggregates'->'rows') row_item
    WHERE source_item->>'definitionKey' = 'bank-accreditation-summary.v1'
      AND row_item->>'repartitionCode' = comparison_value->>'repartitionCode';
    IF (computed_reported IS NOT NULL AND computed_reported
          NOT BETWEEN -9223372036854775808 AND 9223372036854775807)
       OR (computed_bank IS NOT NULL AND computed_bank
          NOT BETWEEN -9223372036854775808 AND 9223372036854775807)
       OR (computed_reported IS NOT NULL AND computed_bank IS NOT NULL
          AND computed_reported - computed_bank
            NOT BETWEEN -9223372036854775808 AND 9223372036854775807) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    expected_issue_codes := '[]'::jsonb;
    IF computed_reported IS NULL THEN
      expected_issue_codes := expected_issue_codes ||
        jsonb_build_array('MONTHLY_CLOSE_REPARTITION_MISSING_IN_CONCEPT_STATISTICS');
    END IF;
    IF computed_bank IS NULL THEN
      expected_issue_codes := expected_issue_codes ||
        jsonb_build_array('MONTHLY_CLOSE_REPARTITION_MISSING_IN_BANK_SUMMARY');
    END IF;
    IF computed_reported IS NOT NULL AND computed_bank IS NOT NULL
       AND computed_reported <> computed_bank THEN
      expected_issue_codes := expected_issue_codes ||
        jsonb_build_array('MONTHLY_CLOSE_REPARTITION_NET_MISMATCH');
    END IF;
    IF comparison_value->'reportedEarningsLessRetentionsCents' IS DISTINCT FROM
         (CASE WHEN computed_reported IS NULL THEN 'null'::jsonb
           ELSE to_jsonb(computed_reported::bigint::text) END)
       OR comparison_value->'reportedBankNetCents' IS DISTINCT FROM
         (CASE WHEN computed_bank IS NULL THEN 'null'::jsonb
           ELSE to_jsonb(computed_bank::bigint::text) END)
       OR comparison_value->'differenceCents' IS DISTINCT FROM
         (CASE WHEN computed_reported IS NULL OR computed_bank IS NULL THEN 'null'::jsonb
           ELSE to_jsonb((computed_reported - computed_bank)::bigint::text) END)
       OR comparison_value->'matches' IS DISTINCT FROM
         to_jsonb(computed_reported IS NOT NULL AND computed_bank IS NOT NULL
           AND computed_reported = computed_bank)
       OR comparison_value->'issueCodes' IS DISTINCT FROM expected_issue_codes THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  SELECT count(DISTINCT comparison->>'repartitionCode')::integer
    INTO distinct_count
  FROM jsonb_array_elements(p_reconciliation->'comparisons') comparison;
  IF distinct_count <> jsonb_array_length(p_reconciliation->'comparisons') THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  FOR comparison_value IN SELECT value
    FROM jsonb_array_elements(p_reconciliation->'governmentComparisons') comparison(value)
  LOOP
    IF jsonb_typeof(comparison_value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT array_agg(key ORDER BY key) INTO key_set
    FROM jsonb_object_keys(comparison_value) keys(key);
    IF key_set IS DISTINCT FROM ARRAY[
        'comparisonKey','differenceCents','issueCode','matches',
        'reportedGovernmentCents','reportedGrhCents'
      ]::text[]
       OR comparison_value->>'comparisonKey' NOT IN ('earnings','employer_contributions')
       OR jsonb_typeof(comparison_value->'matches') IS DISTINCT FROM 'boolean'
       OR COALESCE(comparison_value->>'reportedGrhCents','')
         !~ '^(0|-?[1-9][0-9]{0,18})$'
       OR (comparison_value->'reportedGovernmentCents' <> 'null'::jsonb
         AND COALESCE(comparison_value->>'reportedGovernmentCents','')
           !~ '^(0|-?[1-9][0-9]{0,18})$')
       OR (comparison_value->'differenceCents' <> 'null'::jsonb
         AND COALESCE(comparison_value->>'differenceCents','')
            !~ '^(0|-?[1-9][0-9]{0,18})$')
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements_text(jsonb_build_array(
           comparison_value->>'reportedGrhCents',
           comparison_value->>'reportedGovernmentCents', comparison_value->>'differenceCents'
         )) numeric_item(value)
         WHERE value IS NOT NULL
           AND (CASE WHEN value ~ '^(0|-?[1-9][0-9]{0,18})$'
             THEN value::numeric NOT BETWEEN -9223372036854775808 AND 9223372036854775807
             ELSE false END)
       )
       OR (comparison_value->'issueCode' <> 'null'::jsonb
         AND comparison_value->>'issueCode' NOT IN (
           'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_MISMATCH',
           'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_NOT_COMPARABLE',
           'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_MISMATCH',
           'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_NOT_COMPARABLE'
         )) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  FOR issue_value IN SELECT value
    FROM jsonb_array_elements(p_reconciliation->'blockingIssues') issue(value)
  LOOP
    IF jsonb_typeof(issue_value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT array_agg(key ORDER BY key) INTO key_set
    FROM jsonb_object_keys(issue_value) keys(key);
    IF (key_set = ARRAY['code','repartitionCode']::text[] AND
          issue_value->>'code' IN (
            'MONTHLY_CLOSE_REPARTITION_MISSING_IN_CONCEPT_STATISTICS',
            'MONTHLY_CLOSE_REPARTITION_MISSING_IN_BANK_SUMMARY',
            'MONTHLY_CLOSE_REPARTITION_NET_MISMATCH'
          )) IS NOT TRUE
       AND (key_set = ARRAY['code','comparisonKey']::text[] AND
          issue_value->>'comparisonKey' IN ('earnings','employer_contributions')
          AND issue_value->>'code' IN (
            'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_MISMATCH',
            'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_NOT_COMPARABLE',
            'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_MISMATCH',
            'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_NOT_COMPARABLE'
          )) IS NOT TRUE THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  FOR issue_value IN SELECT value FROM jsonb_array_elements(p_blocking_issues) issue(value)
  LOOP
    IF jsonb_typeof(issue_value) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT array_agg(key ORDER BY key) INTO key_set
    FROM jsonb_object_keys(issue_value) keys(key);
    IF (issue_value->>'definitionKey' = 'government-payroll-summary.v1' AND (
          key_set IS DISTINCT FROM ARRAY['code','definitionKey','metric']::text[]
          OR issue_value->>'code' <> 'MONTHLY_CLOSE_METRIC_NOT_INFORMED'
        )) OR (issue_value->>'definitionKey' = 'monthly-close-net-reconciliation.v1' AND (
          key_set IS DISTINCT FROM ARRAY['code','definitionKey','repartitionCode']::text[]
          OR issue_value->>'code' NOT IN (
            'MONTHLY_CLOSE_REPARTITION_MISSING_IN_CONCEPT_STATISTICS',
            'MONTHLY_CLOSE_REPARTITION_MISSING_IN_BANK_SUMMARY',
            'MONTHLY_CLOSE_REPARTITION_NET_MISMATCH'
          )
        )) OR (issue_value->>'definitionKey' =
          'monthly-close-government-reconciliation.v1' AND (
          key_set IS DISTINCT FROM ARRAY['code','comparisonKey','definitionKey']::text[]
          OR issue_value->>'comparisonKey' NOT IN ('earnings','employer_contributions')
          OR issue_value->>'code' NOT IN (
            'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_MISMATCH',
            'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_NOT_COMPARABLE',
            'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_MISMATCH',
            'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_NOT_COMPARABLE'
          )
        )) OR issue_value->>'definitionKey' NOT IN (
          'government-payroll-summary.v1','monthly-close-net-reconciliation.v1',
          'monthly-close-government-reconciliation.v1'
        ) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  reported_value := (p_reconciliation->'totals'->>'reportedEarningsLessRetentionsCents')::bigint;
  bank_value := (p_reconciliation->'totals'->>'reportedBankNetCents')::bigint;
  difference_value := (p_reconciliation->'totals'->>'differenceCents')::bigint;
  WITH concept_totals AS (
    SELECT row_item->>'repartitionCode' AS repartition_code,
      sum((row_item->>'haberesRemunerativosCents')::numeric
        + (row_item->>'haberesNoRemunerativosCents')::numeric
        + (row_item->>'asignacionesFamiliaresCents')::numeric
        - (row_item->>'retencionesCents')::numeric) AS net_cents
    FROM jsonb_array_elements(p_sources) source_item,
      jsonb_array_elements(source_item->'aggregates'->'rows') row_item
    WHERE source_item->>'definitionKey' = 'grh-concept-statistics.v1'
    GROUP BY row_item->>'repartitionCode'
  ), bank_totals AS (
    SELECT row_item->>'repartitionCode' AS repartition_code,
      sum((row_item->>'netAmountCents')::numeric) AS net_cents
    FROM jsonb_array_elements(p_sources) source_item,
      jsonb_array_elements(source_item->'aggregates'->'rows') row_item
    WHERE source_item->>'definitionKey' = 'bank-accreditation-summary.v1'
    GROUP BY row_item->>'repartitionCode'
  ), comparison AS (
    SELECT concept.repartition_code AS concept_code,
      bank.repartition_code AS bank_code,
      concept.net_cents AS concept_cents, bank.net_cents AS bank_cents
    FROM concept_totals concept FULL OUTER JOIN bank_totals bank
      ON bank.repartition_code = concept.repartition_code
  )
  SELECT COALESCE((SELECT sum(net_cents) FROM concept_totals), 0),
    COALESCE((SELECT sum(net_cents) FROM bank_totals), 0),
    count(*)::integer,
    count(*) FILTER (WHERE concept_code IS NULL OR bank_code IS NULL
      OR concept_cents <> bank_cents)::integer
  INTO computed_reported, computed_bank, partition_count, bank_mismatch
  FROM comparison;
  WITH concept_source AS (
    SELECT source_item FROM jsonb_array_elements(p_sources) source_item
    WHERE source_item->>'definitionKey' = 'grh-concept-statistics.v1'
  ), government_source AS (
    SELECT source_item FROM jsonb_array_elements(p_sources) source_item
    WHERE source_item->>'definitionKey' = 'government-payroll-summary.v1'
  ), government_metrics AS (
    SELECT row_item->>'metric' AS metric,
      CASE WHEN row_item->>'state' = 'informado'
        THEN (row_item->>'valueInteger')::numeric ELSE NULL END AS value_integer
    FROM government_source,
      jsonb_array_elements(government_source.source_item->'aggregates'->'rows') row_item
  )
  SELECT
    (SELECT sum((row_item->>'haberesRemunerativosCents')::numeric
      + (row_item->>'haberesNoRemunerativosCents')::numeric)
      FROM concept_source,
        jsonb_array_elements(concept_source.source_item->'aggregates'->'rows') row_item),
    (SELECT sum((row_item->>'contribucionesCents')::numeric)
      FROM concept_source,
        jsonb_array_elements(concept_source.source_item->'aggregates'->'rows') row_item),
    CASE WHEN count(*) FILTER (WHERE metric IN (
        'haberes_rem_no_docentes','haberes_rem_docentes','haberes_no_rem'
      ) AND value_integer IS NULL) > 0 THEN NULL
      ELSE sum(value_integer) FILTER (WHERE metric IN (
        'haberes_rem_no_docentes','haberes_rem_docentes','haberes_no_rem'
      )) END,
    CASE WHEN count(*) FILTER (WHERE metric IN (
        'contribuciones_jubilatorias','contribuciones_osep',
        'contribuciones_osep_no_rem','art'
      ) AND value_integer IS NULL) > 0 THEN NULL
      ELSE sum(value_integer) FILTER (WHERE metric IN (
        'contribuciones_jubilatorias','contribuciones_osep',
        'contribuciones_osep_no_rem','art'
      )) END
  INTO computed_grh_earnings, computed_grh_contributions,
    computed_government_earnings, computed_government_contributions
  FROM government_metrics;
  IF computed_grh_earnings NOT BETWEEN -9223372036854775808 AND 9223372036854775807
     OR computed_grh_contributions NOT BETWEEN -9223372036854775808 AND 9223372036854775807
     OR (computed_government_earnings IS NOT NULL AND
       computed_government_earnings NOT BETWEEN -9223372036854775808 AND 9223372036854775807)
     OR (computed_government_contributions IS NOT NULL AND
       computed_government_contributions NOT BETWEEN -9223372036854775808 AND 9223372036854775807) THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  expected_government_comparisons := jsonb_build_array(
    jsonb_build_object(
      'comparisonKey', 'earnings',
      'reportedGrhCents', computed_grh_earnings::bigint::text,
      'reportedGovernmentCents', computed_government_earnings::bigint::text,
      'differenceCents', (computed_grh_earnings - computed_government_earnings)::bigint::text,
      'matches', computed_government_earnings IS NOT NULL
        AND computed_grh_earnings = computed_government_earnings,
      'issueCode', CASE
        WHEN computed_government_earnings IS NULL
          THEN 'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_NOT_COMPARABLE'
        WHEN computed_grh_earnings <> computed_government_earnings
          THEN 'MONTHLY_CLOSE_GOVERNMENT_EARNINGS_MISMATCH'
        ELSE NULL END
    ),
    jsonb_build_object(
      'comparisonKey', 'employer_contributions',
      'reportedGrhCents', computed_grh_contributions::bigint::text,
      'reportedGovernmentCents', computed_government_contributions::bigint::text,
      'differenceCents',
        (computed_grh_contributions - computed_government_contributions)::bigint::text,
      'matches', computed_government_contributions IS NOT NULL
        AND computed_grh_contributions = computed_government_contributions,
      'issueCode', CASE
        WHEN computed_government_contributions IS NULL
          THEN 'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_NOT_COMPARABLE'
        WHEN computed_grh_contributions <> computed_government_contributions
          THEN 'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_MISMATCH'
        ELSE NULL END
    )
  );
  IF p_reconciliation->'governmentComparisons'
       IS DISTINCT FROM expected_government_comparisons THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(jsonb_agg(expected.issue ORDER BY
      expected.group_order, expected.comparison_order, expected.issue_order), '[]'::jsonb)
    INTO expected_reconciliation_issues
  FROM (
    SELECT 1 AS group_order, comparison.ordinality AS comparison_order,
      issue.ordinality AS issue_order,
      jsonb_build_object(
        'code', issue.value,
        'repartitionCode', comparison.value->>'repartitionCode'
      ) AS issue
    FROM jsonb_array_elements(p_reconciliation->'comparisons')
      WITH ORDINALITY comparison(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements_text(comparison.value->'issueCodes')
      WITH ORDINALITY issue(value, ordinality)
    UNION ALL
    SELECT 2, comparison.ordinality, 1,
      jsonb_build_object(
        'code', comparison.value->>'issueCode',
        'comparisonKey', comparison.value->>'comparisonKey'
      )
    FROM jsonb_array_elements(p_reconciliation->'governmentComparisons')
      WITH ORDINALITY comparison(value, ordinality)
    WHERE comparison.value->'issueCode' <> 'null'::jsonb
  ) expected;
  IF p_reconciliation->'blockingIssues'
       IS DISTINCT FROM expected_reconciliation_issues THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT COALESCE(jsonb_agg(expected.issue ORDER BY
      expected.group_order, expected.source_order, expected.issue_order), '[]'::jsonb)
    INTO expected_blocking_issues
  FROM (
    SELECT 1 AS group_order, source.ordinality AS source_order,
      issue.ordinality AS issue_order,
      jsonb_build_object('definitionKey', source.value->>'definitionKey') || issue.value AS issue
    FROM jsonb_array_elements(p_sources) WITH ORDINALITY source(value, ordinality)
    CROSS JOIN LATERAL jsonb_array_elements(
      source.value->'aggregates'->'readiness'->'blockingIssues'
    ) WITH ORDINALITY issue(value, ordinality)
    UNION ALL
    SELECT 2, 1, issue.ordinality,
      jsonb_build_object(
        'definitionKey', CASE WHEN issue.value ? 'comparisonKey'
          THEN 'monthly-close-government-reconciliation.v1'
          ELSE 'monthly-close-net-reconciliation.v1' END
      ) || issue.value
    FROM jsonb_array_elements(expected_reconciliation_issues)
      WITH ORDINALITY issue(value, ordinality)
  ) expected;
  IF p_blocking_issues IS DISTINCT FROM expected_blocking_issues THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  government_mismatch :=
    CASE WHEN computed_government_earnings IS NULL
      OR computed_grh_earnings <> computed_government_earnings THEN 1 ELSE 0 END
    + CASE WHEN computed_government_contributions IS NULL
      OR computed_grh_contributions <> computed_government_contributions THEN 1 ELSE 0 END;
  mismatch_value := bank_mismatch + government_mismatch;
  SELECT count(*)::integer INTO government_missing
  FROM jsonb_array_elements(p_sources) source_item,
    jsonb_array_elements(source_item->'aggregates'->'rows') row_item
  WHERE source_item->>'definitionKey' = 'government-payroll-summary.v1'
    AND row_item->>'state' = 'no_informado';
  SELECT count(*)::integer,
    count(*) FILTER (WHERE COALESCE((comparison->>'matches')::boolean, false) IS FALSE)::integer
  INTO comparison_count, comparison_mismatch
  FROM jsonb_array_elements(p_reconciliation->'comparisons') comparison;
  IF computed_reported NOT BETWEEN -9223372036854775808 AND 9223372036854775807
     OR computed_bank NOT BETWEEN -9223372036854775808 AND 9223372036854775807
     OR computed_reported <> reported_value OR computed_bank <> bank_value
     OR difference_value <> reported_value::numeric - bank_value::numeric
     OR comparison_count <> partition_count OR comparison_mismatch <> bank_mismatch
     OR COALESCE((p_reconciliation->>'matched')::boolean, false)
       IS DISTINCT FROM (mismatch_value = 0)
     OR p_reconciliation->>'status' IS DISTINCT FROM (CASE
       WHEN mismatch_value = 0 THEN 'matched' ELSE 'blocked' END)
     OR jsonb_array_length(p_reconciliation->'blockingIssues') <> mismatch_value
     OR jsonb_array_length(p_blocking_issues) <> mismatch_value + government_missing
     OR (SELECT jsonb_array_length(
          source_item->'aggregates'->'readiness'->'blockingIssues'
        ) FROM jsonb_array_elements(p_sources) source_item
        WHERE source_item->>'definitionKey' = 'government-payroll-summary.v1')
       <> government_missing THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  blocking_value := jsonb_array_length(p_blocking_issues);

  context_value := public.payroll_monthly_close_assert_context_v1(
    p_context, 'payroll.monthly_close.prepare'
  );
  IF p_certified_binding_id <> (context_value->>'certifiedBindingId')::uuid THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_BINDING_CHANGED' USING ERRCODE = 'P0001';
  END IF;
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
       OR existing_event.authority_capability_key <> 'payroll.monthly_close.prepare'
       OR existing_event.command <> 'prepare'
       OR existing_event.command_hash <> lower(p_command_hash) THEN
      RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN public.payroll_monthly_close_event_result_v1(
      existing_event.id, existing_event.tenant_id
    ) || jsonb_build_object('replayed', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || p_certified_binding_id::text
      || ':' || p_period_month::text || ':' || p_jurisdiction, 0
  ));
  IF EXISTS (
    SELECT 1 FROM public.payroll_monthly_close_run item
    WHERE item.tenant_id = (context_value->>'tenantId')::uuid
      AND item.certified_binding_id = p_certified_binding_id
      AND item.period_month = p_period_month AND item.jurisdiction = p_jurisdiction
      AND item.status IN ('prepared','submitted','approved')
  ) THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_DUPLICATE_RUN' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.payroll_monthly_close_run (
    tenant_id, certified_binding_id, period_month, jurisdiction, release_sha,
    source_set_sha256, source_aggregates, reconciliation, blocking_issues,
    reported_earnings_less_retentions_cents, reported_bank_net_cents,
    difference_cents, mismatch_count, blocking_issue_count,
    prepared_by_membership_id, prepared_by_person_id
  ) VALUES (
    (context_value->>'tenantId')::uuid, p_certified_binding_id,
    p_period_month, p_jurisdiction, lower(context_value->>'releaseSha'),
    lower(p_source_set_sha256), p_sources, p_reconciliation, p_blocking_issues,
    reported_value, bank_value, difference_value, mismatch_value, blocking_value,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid
  ) RETURNING id INTO run_id_value;
  INSERT INTO public.payroll_monthly_close_event (
    tenant_id, run_id, certified_binding_id, actor_membership_id,
    actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha, command,
    from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash, close_approved
  ) VALUES (
    (context_value->>'tenantId')::uuid, run_id_value, p_certified_binding_id,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid, context_value->>'roleKey',
    'payroll.monthly_close.prepare', (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'), 'prepare', NULL, 'prepared', 0, 1,
    'sources_prepared', NULL, p_idempotency, lower(p_command_hash), false
  ) RETURNING id INTO event_id_value;
  RETURN public.payroll_monthly_close_event_result_v1(
    event_id_value, (context_value->>'tenantId')::uuid
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_DUPLICATE_RUN' USING ERRCODE = 'P0001';
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
  IF p_run_id IS NULL OR p_command NOT IN ('submit','approve','reject','cancel')
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
     )) OR (p_command = 'cancel' AND p_reason_code <> 'cancelled_by_preparer') THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  required_capability := CASE WHEN p_command IN ('approve','reject')
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
    IF run_row.status <> 'submitted' THEN
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
    ELSE 'cancelled' END;
  approved_value := p_command = 'approve';
  UPDATE public.payroll_monthly_close_run item SET
    status = next_status,
    version = item.version + 1,
    reason_code = p_reason_code,
    reason_reference = p_reason_reference,
    decided_by_membership_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'membershipId')::uuid ELSE NULL END,
    decided_by_person_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'actorPersonId')::uuid ELSE NULL END,
    close_approved = approved_value,
    submitted_at = CASE WHEN p_command = 'submit' THEN now() ELSE item.submitted_at END,
    decided_at = CASE WHEN p_command = 'submit' THEN NULL ELSE now() END,
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

COMMENT ON TABLE public.payroll_monthly_close_run IS
  'Cierre mensual gobernado: conserva solo agregados, centavos y hashes de tres fuentes.';
COMMENT ON TABLE public.payroll_monthly_close_event IS
  'Auditoria append-only e idempotente de cierres mensuales agregados.';
COMMENT ON COLUMN public.payroll_monthly_close_run.close_approved IS
  'Aprobacion maker-checker del control mensual; no implica calculo, posting, pago ni presentacion externa.';

REVOKE ALL PRIVILEGES ON TABLE
  public.payroll_monthly_close_run,
  public.payroll_monthly_close_event
FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE
  public.payroll_monthly_close_run,
  public.payroll_monthly_close_event
FROM municontrol_actions_runtime_app;

REVOKE ALL ON FUNCTION public.payroll_monthly_close_flags_v1(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_reject_event_change_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_hash_event_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_guard_run_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_assert_context_v1(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_snapshot_v1(uuid,uuid,boolean,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_event_result_v1(bigint,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_attempt_v1(jsonb,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_bootstrap_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_list_v1(jsonb,text,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_detail_v1(jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_prepare_v1(
  jsonb,uuid,date,text,text,jsonb,jsonb,jsonb,uuid,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_monthly_close_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_flags_v1(boolean)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_reject_event_change_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_hash_event_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_guard_run_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_assert_context_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_snapshot_v1(uuid,uuid,boolean,boolean)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_event_result_v1(bigint,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_attempt_v1(jsonb,uuid,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_bootstrap_v1(jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_list_v1(jsonb,text,integer,integer)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_detail_v1(jsonb,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_prepare_v1(
  jsonb,uuid,date,text,text,jsonb,jsonb,jsonb,uuid,text
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_monthly_close_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) FROM municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION public.payroll_monthly_close_bootstrap_v1(jsonb)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_monthly_close_list_v1(jsonb,text,integer,integer)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_monthly_close_detail_v1(jsonb,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_monthly_close_attempt_v1(jsonb,uuid,text)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_monthly_close_prepare_v1(
  jsonb,uuid,date,text,text,jsonb,jsonb,jsonb,uuid,text
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_monthly_close_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) TO municontrol_actions_runtime_app;

DO $monthly_close_verify_profiles$
DECLARE
  drift_count integer;
  conflict_count integer;
  override_count integer;
BEGIN
  WITH expected(role_key, capability_key) AS (
    VALUES
      ('CONSULTA_INTEGRAL', 'payroll.monthly_close.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.monthly_close.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.monthly_close.approve'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.monthly_close.audit.read'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.monthly_close.read'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.monthly_close.prepare'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.monthly_close.audit.read')
  ), actual AS (
    SELECT mapping.role_key, mapping.capability_key
    FROM public.iam_role_capability mapping
    WHERE mapping.capability_key LIKE 'payroll.monthly_close.%'
  ), drift AS (
    (SELECT role_key, capability_key FROM expected
      EXCEPT SELECT role_key, capability_key FROM actual)
    UNION ALL
    (SELECT role_key, capability_key FROM actual
      EXCEPT SELECT role_key, capability_key FROM expected)
  ) SELECT count(*) INTO drift_count FROM drift;
  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PROFILE_DRIFT: %', drift_count
      USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO conflict_count
  FROM public.iam_capability_conflict conflict
  JOIN public.iam_role_capability left_grant
    ON left_grant.capability_key = conflict.capability_key
  JOIN public.iam_role_capability right_grant
    ON right_grant.role_key = left_grant.role_key
   AND right_grant.capability_key = conflict.conflicts_with_key
  WHERE (conflict.capability_key LIKE 'payroll.monthly_close.%'
      OR conflict.conflicts_with_key LIKE 'payroll.monthly_close.%')
    AND left_grant.role_key IN (
    'CONSULTA_INTEGRAL','HUGO_APROBADOR_INTEGRAL',
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  );
  IF conflict_count <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_PROFILE_SOD_CONFLICT: %', conflict_count
      USING ERRCODE = 'P0001';
  END IF;
  SELECT count(*) INTO override_count
  FROM public.tenant_membership_capability_override
  WHERE capability_key LIKE 'payroll.monthly_close.%';
  IF override_count <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_MONTHLY_CLOSE_OVERRIDE_DRIFT: %', override_count
      USING ERRCODE = 'P0001';
  END IF;
END
$monthly_close_verify_profiles$;
