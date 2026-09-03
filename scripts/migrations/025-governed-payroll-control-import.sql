-- MuniControl Friendly - Sprint 025 / S008-B2.1
-- Importacion gobernada del control agregado 701/703.
-- Conserva un manifiesto HMAC contextual y centavos canonicos; nunca conserva
-- bytes, nombres de archivo, filas nominales ni datos personales de la fuente.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES
  (
    'payroll.control_import.read',
    'Consultar controles de cierre',
    'Consulta lotes agregados 701/703 sin acceder a archivos ni filas nominales.',
    'tenant',
    'standard'
  ),
  (
    'payroll.control_import.prepare',
    'Preparar controles de cierre',
    'Registra en cuarentena una fuente agregada para revision independiente.',
    'tenant',
    'privileged'
  ),
  (
    'payroll.control_import.validate',
    'Validar controles de cierre',
    'Valida o rechaza una fuente preparada por otra persona y membresia.',
    'tenant',
    'restricted'
  ),
  (
    'payroll.control_import.audit.read',
    'Auditar controles de cierre',
    'Consulta eventos tecnicos inmutables de importacion agregada.',
    'tenant',
    'restricted'
  )
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  sensitivity = EXCLUDED.sensitivity;

INSERT INTO public.iam_capability_conflict (
  capability_key, conflicts_with_key, reason
) VALUES (
  'payroll.control_import.prepare',
  'payroll.control_import.validate',
  'La preparacion y la validacion del control de cierre deben estar separadas.'
)
ON CONFLICT (capability_key, conflicts_with_key) DO UPDATE SET
  reason = EXCLUDED.reason;

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('CONSULTA_INTEGRAL', 'payroll.control_import.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.control_import.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.control_import.validate'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.control_import.audit.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.control_import.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.control_import.prepare'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.control_import.audit.read')
ON CONFLICT (role_key, capability_key) DO NOTHING;

DO $payroll_control_import_role_contract$
DECLARE
  conflict_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.iam_role_capability
    WHERE role_key = 'CONSULTA_INTEGRAL'
      AND capability_key = 'payroll.control_import.read'
  ) OR EXISTS (
    SELECT 1 FROM public.iam_role_capability
    WHERE role_key = 'CONSULTA_INTEGRAL'
      AND capability_key LIKE 'payroll.control_import.%'
      AND capability_key <> 'payroll.control_import.read'
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_CONSULTA_ROLE_DRIFT' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.iam_role_capability
    WHERE role_key = 'HUGO_APROBADOR_INTEGRAL'
      AND capability_key = 'payroll.control_import.validate'
  ) OR EXISTS (
    SELECT 1 FROM public.iam_role_capability
    WHERE role_key = 'HUGO_APROBADOR_INTEGRAL'
      AND capability_key = 'payroll.control_import.prepare'
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_APPROVER_ROLE_DRIFT' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.iam_role_capability
    WHERE role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
      AND capability_key = 'payroll.control_import.prepare'
  ) OR EXISTS (
    SELECT 1 FROM public.iam_role_capability
    WHERE role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
      AND capability_key = 'payroll.control_import.validate'
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_PREPARER_ROLE_DRIFT' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO conflict_count
  FROM public.iam_capability_conflict conflict
  JOIN public.iam_role_capability left_grant
    ON left_grant.capability_key = conflict.capability_key
  JOIN public.iam_role_capability right_grant
    ON right_grant.role_key = left_grant.role_key
   AND right_grant.capability_key = conflict.conflicts_with_key
  WHERE left_grant.role_key IN (
    'CONSULTA_INTEGRAL',
    'HUGO_APROBADOR_INTEGRAL',
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  );
  IF conflict_count <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_ROLE_SOD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.iam_role_capability mapping
    WHERE mapping.capability_key LIKE 'payroll.control_import.%'
      AND (mapping.role_key, mapping.capability_key) NOT IN (
        ('CONSULTA_INTEGRAL', 'payroll.control_import.read'),
        ('HUGO_APROBADOR_INTEGRAL', 'payroll.control_import.read'),
        ('HUGO_APROBADOR_INTEGRAL', 'payroll.control_import.validate'),
        ('HUGO_APROBADOR_INTEGRAL', 'payroll.control_import.audit.read'),
        ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.control_import.read'),
        ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.control_import.prepare'),
        ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.control_import.audit.read')
      )
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_ROLE_ALLOWLIST_DRIFT' USING ERRCODE = 'P0001';
  END IF;
END
$payroll_control_import_role_contract$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_rows_valid_v1(p_rows jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  row_value jsonb;
  concept_value text;
  amount_text text;
  amount_value bigint;
  concepts text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) <> 2 THEN
    RETURN false;
  END IF;

  FOR row_value IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(row_value) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(row_value) key)
          IS DISTINCT FROM ARRAY['amountCents','concept']::text[]
       OR jsonb_typeof(row_value->'concept') IS DISTINCT FROM 'string'
       OR jsonb_typeof(row_value->'amountCents') IS DISTINCT FROM 'string' THEN
      RETURN false;
    END IF;

    concept_value := row_value->>'concept';
    amount_text := row_value->>'amountCents';
    IF concept_value NOT IN ('701','703')
       OR amount_text !~ '^-?(0|[1-9][0-9]{0,18})$'
       OR amount_text = '-0' THEN
      RETURN false;
    END IF;
    BEGIN
      amount_value := amount_text::bigint;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RETURN false;
    END;
    concepts := array_append(concepts, concept_value);
  END LOOP;

  RETURN concepts @> ARRAY['701','703']::text[]
    AND cardinality(ARRAY(SELECT DISTINCT item FROM unnest(concepts) item)) = 2;
END
$$;

CREATE TABLE IF NOT EXISTS public.payroll_control_import_batch (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  certified_binding_id uuid NOT NULL,
  source_kind varchar(32) NOT NULL,
  provenance_state varchar(32) NOT NULL DEFAULT 'operator_declared',
  period_month date NOT NULL,
  jurisdiction varchar(2) NOT NULL,
  definition_key varchar(64) NOT NULL,
  contract_version varchar(64) NOT NULL DEFAULT 'payroll-control-import.v1',
  hmac_key_version varchar(32) NOT NULL DEFAULT 'hmac-v1',
  content_hmac_sha256 char(64) NOT NULL,
  byte_length integer NOT NULL,
  row_count smallint NOT NULL DEFAULT 2,
  release_sha char(40) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'quarantined',
  version integer NOT NULL DEFAULT 1,
  prepared_by_membership_id uuid NOT NULL,
  prepared_by_person_id uuid NOT NULL,
  validated_by_membership_id uuid,
  validated_by_person_id uuid,
  reason_code varchar(64) NOT NULL DEFAULT 'source_uploaded',
  reason_reference varchar(128),
  payroll_posted boolean NOT NULL DEFAULT false,
  fiscal_artifact_generated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  CONSTRAINT payroll_control_import_batch_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_control_import_batch_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_batch_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT payroll_control_import_batch_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES public.platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_batch_preparer_membership_fk
    FOREIGN KEY (prepared_by_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_batch_preparer_person_fk
    FOREIGN KEY (prepared_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_batch_validator_membership_fk
    FOREIGN KEY (validated_by_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_batch_validator_person_fk
    FOREIGN KEY (validated_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_batch_content_uk UNIQUE (
    tenant_id, certified_binding_id, content_hmac_sha256
  ),
  CONSTRAINT payroll_control_import_batch_source_ck
    CHECK (source_kind IN ('grh_observed','operator_control')),
  CONSTRAINT payroll_control_import_batch_provenance_ck
    CHECK (provenance_state = 'operator_declared'),
  CONSTRAINT payroll_control_import_batch_period_ck CHECK (
    EXTRACT(day FROM period_month) = 1
    AND period_month BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'
  ),
  CONSTRAINT payroll_control_import_batch_jurisdiction_ck
    CHECK (jurisdiction IN ('42','55')),
  CONSTRAINT payroll_control_import_batch_definition_ck
    CHECK (definition_key = 'payroll-post-close-701-703.v1'),
  CONSTRAINT payroll_control_import_batch_contract_ck
    CHECK (contract_version = 'payroll-control-import.v1'),
  CONSTRAINT payroll_control_import_batch_hmac_key_ck
    CHECK (hmac_key_version = 'hmac-v1'),
  CONSTRAINT payroll_control_import_batch_hmac_ck
    CHECK (content_hmac_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT payroll_control_import_batch_release_ck
    CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT payroll_control_import_batch_size_ck
    CHECK (byte_length BETWEEN 1 AND 16384 AND row_count = 2),
  CONSTRAINT payroll_control_import_batch_status_ck CHECK (
    status IN ('quarantined','submitted','validated','rejected','cancelled')
  ),
  CONSTRAINT payroll_control_import_batch_version_ck CHECK (version > 0),
  CONSTRAINT payroll_control_import_batch_reason_ck CHECK (
    reason_code IN (
      'source_uploaded','ready_for_validation','source_validated',
      'contract_invalid','amounts_inconsistent','source_unverifiable',
      'cancelled_by_preparer'
    )
  ),
  CONSTRAINT payroll_control_import_batch_reason_reference_ck CHECK (
    reason_reference IS NULL
    OR reason_reference ~
      '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_control_import_batch_checker_pair_ck CHECK (
    (validated_by_membership_id IS NULL AND validated_by_person_id IS NULL)
    OR (validated_by_membership_id IS NOT NULL AND validated_by_person_id IS NOT NULL)
  ),
  CONSTRAINT payroll_control_import_batch_maker_checker_ck CHECK (
    validated_by_person_id IS NULL OR (
      validated_by_person_id <> prepared_by_person_id
      AND validated_by_membership_id <> prepared_by_membership_id
    )
  ),
  CONSTRAINT payroll_control_import_batch_state_ck CHECK (
    (status = 'quarantined' AND submitted_at IS NULL AND decided_at IS NULL
      AND validated_by_membership_id IS NULL AND validated_by_person_id IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL
      AND validated_by_membership_id IS NULL AND validated_by_person_id IS NULL)
    OR (status IN ('validated','rejected') AND submitted_at IS NOT NULL
      AND decided_at IS NOT NULL AND validated_by_membership_id IS NOT NULL
      AND validated_by_person_id IS NOT NULL)
    OR (status = 'cancelled' AND decided_at IS NOT NULL
      AND validated_by_membership_id IS NULL AND validated_by_person_id IS NULL)
  ),
  CONSTRAINT payroll_control_import_batch_reference_required_ck CHECK (
    status NOT IN ('rejected','cancelled') OR reason_reference IS NOT NULL
  ),
  CONSTRAINT payroll_control_import_batch_payroll_block_ck CHECK (
    payroll_posted IS FALSE AND fiscal_artifact_generated IS FALSE
  )
);

CREATE TABLE IF NOT EXISTS public.payroll_control_import_row (
  batch_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  concept_code smallint NOT NULL,
  amount_cents bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_control_import_row_pkey PRIMARY KEY (batch_id, concept_code),
  CONSTRAINT payroll_control_import_row_batch_fk
    FOREIGN KEY (batch_id, tenant_id)
    REFERENCES public.payroll_control_import_batch(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_row_concept_ck CHECK (concept_code IN (701,703))
);

CREATE TABLE IF NOT EXISTS public.payroll_control_import_event (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  certified_binding_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_person_id uuid NOT NULL,
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
  event_sha256 char(64) NOT NULL,
  payroll_posted boolean NOT NULL DEFAULT false,
  fiscal_artifact_generated boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_control_import_event_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_control_import_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_event_batch_fk
    FOREIGN KEY (batch_id, tenant_id)
    REFERENCES public.payroll_control_import_batch(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_event_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES public.platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_event_membership_fk
    FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_event_person_fk
    FOREIGN KEY (actor_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_event_role_fk
    FOREIGN KEY (actor_role_key) REFERENCES public.iam_role(role_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_event_capability_fk
    FOREIGN KEY (authority_capability_key)
    REFERENCES public.iam_capability(capability_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_event_session_fk
    FOREIGN KEY (actor_session_id) REFERENCES public.tenant_identity_session(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_control_import_event_batch_version_uk
    UNIQUE (batch_id, resulting_version),
  CONSTRAINT payroll_control_import_event_actor_idempotency_uk
    UNIQUE (tenant_id, actor_membership_id, idempotency_key),
  CONSTRAINT payroll_control_import_event_command_ck CHECK (
    command IN ('prepare','submit','validate','reject','cancel')
  ),
  CONSTRAINT payroll_control_import_event_authority_ck CHECK (
    (command IN ('prepare','submit','cancel')
      AND authority_capability_key = 'payroll.control_import.prepare')
    OR (command IN ('validate','reject')
      AND authority_capability_key = 'payroll.control_import.validate')
  ),
  CONSTRAINT payroll_control_import_event_status_ck CHECK (
    (from_status IS NULL OR from_status IN (
      'quarantined','submitted','validated','rejected','cancelled'
    ))
    AND to_status IN ('quarantined','submitted','validated','rejected','cancelled')
  ),
  CONSTRAINT payroll_control_import_event_version_ck CHECK (
    expected_version >= 0 AND resulting_version = expected_version + 1
  ),
  CONSTRAINT payroll_control_import_event_session_version_ck
    CHECK (actor_session_version > 0),
  CONSTRAINT payroll_control_import_event_release_ck
    CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT payroll_control_import_event_idempotency_v4_ck CHECK (
    idempotency_key::text ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_control_import_event_hash_ck CHECK (
    command_hash ~ '^[a-f0-9]{64}$' AND event_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT payroll_control_import_event_reason_reference_ck CHECK (
    reason_reference IS NULL
    OR reason_reference ~
      '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_control_import_event_payroll_block_ck CHECK (
    payroll_posted IS FALSE AND fiscal_artifact_generated IS FALSE
  )
);

CREATE INDEX IF NOT EXISTS payroll_control_import_batch_tenant_period_idx
  ON public.payroll_control_import_batch (
    tenant_id, period_month DESC, jurisdiction, source_kind, status, id
  );
CREATE INDEX IF NOT EXISTS payroll_control_import_event_timeline_idx
  ON public.payroll_control_import_event (tenant_id, batch_id, occurred_at, id);

CREATE OR REPLACE FUNCTION public.payroll_control_import_reject_change_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_APPEND_ONLY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_assert_context_v1(
  p_context jsonb,
  p_required_capability text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  user_row public.internal_users%ROWTYPE;
  membership_row public.tenant_membership%ROWTYPE;
  session_row public.tenant_identity_session%ROWTYPE;
  policy_row public.tenant_identity_policy%ROWTYPE;
  binding_row public.platform_tenant_source_binding%ROWTYPE;
  authority_row public.tenant_action_authority%ROWTYPE;
  actor_person_id uuid;
  employment_linked boolean := false;
  capabilities jsonb;
BEGIN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_context) key)
        IS DISTINCT FROM ARRAY[
          'actorEmail','actorSessionId','actorSessionVersion',
          'membershipId','releaseSha','tenantId'
        ]::text[]
     OR p_required_capability NOT IN (
       'payroll.control_import.read','payroll.control_import.prepare',
       'payroll.control_import.validate','payroll.control_import.audit.read'
     )
     OR length(btrim(COALESCE(p_context->>'actorEmail',''))) NOT BETWEEN 3 AND 320
     OR COALESCE(p_context->>'actorSessionId','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_context->>'tenantId','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_context->>'membershipId','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_context->>'actorSessionVersion','') !~ '^[1-9][0-9]{0,8}$'
     OR lower(COALESCE(p_context->>'releaseSha','')) !~ '^[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO user_row
  FROM public.internal_users users
  WHERE lower(users.email) = lower(btrim(p_context->>'actorEmail'))
    AND users.active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO membership_row
  FROM public.tenant_membership membership
  WHERE membership.id = (p_context->>'membershipId')::uuid
    AND membership.tenant_id = (p_context->>'tenantId')::uuid
    AND lower(membership.user_email) = lower(user_row.email)
    AND membership.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO session_row
  FROM public.tenant_identity_session identity_session
  WHERE identity_session.id = (p_context->>'actorSessionId')::uuid
    AND identity_session.session_version = (p_context->>'actorSessionVersion')::integer
    AND lower(identity_session.user_email) = lower(user_row.email)
    AND identity_session.identity_version = user_row.identity_version
    AND identity_session.active_tenant_id = membership_row.tenant_id
    AND identity_session.source = 'membership'
    AND identity_session.auth_level IN ('mfa','recovery')
    AND identity_session.status = 'active'
    AND identity_session.expires_at > now()
    AND identity_session.last_seen_at > now() - interval '1 hour'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.platform_tenant tenant
  WHERE tenant.id = membership_row.tenant_id AND tenant.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO policy_row
  FROM public.tenant_identity_policy policy
  WHERE policy.tenant_id = membership_row.tenant_id
    AND policy.tenant_data_plane_ready IS TRUE
    AND lower(policy.certified_release_sha) = lower(p_context->>'releaseSha')
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO binding_row
  FROM public.platform_tenant_source_binding binding
  WHERE binding.id = policy_row.certified_source_binding_id
    AND binding.tenant_id = membership_row.tenant_id
    AND binding.source_system = 'GRH'
    AND binding.verified IS TRUE
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_BINDING_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO authority_row
  FROM public.tenant_action_authority authority
  WHERE authority.membership_id = membership_row.id
    AND authority.tenant_id = membership_row.tenant_id
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.tenant_iam_assert_no_sod_conflict(membership_row.id);
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_iam_effective_capabilities(membership_row.id) effective
    WHERE effective.capability_key = p_required_capability
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT contract.person_id INTO actor_person_id
  FROM public.tenant_action_employment_link link
  JOIN public.employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = binding_row.source_company_id
  JOIN public.source_import_batch batch
    ON batch.id = contract.source_batch_id
   AND batch.source_system = 'GRH'
   AND batch.source_database = binding_row.source_database
   AND batch.validation_state = 'published'
   AND batch.legacy_import_run_id IS NOT NULL
  WHERE link.membership_id = membership_row.id
    AND link.tenant_id = membership_row.tenant_id
    AND link.source_binding_id = binding_row.id
    AND link.active IS TRUE
  FOR SHARE OF link, contract, batch NOWAIT;
  employment_linked := FOUND;

  IF NOT employment_linked
     AND p_required_capability IN (
       'payroll.control_import.prepare','payroll.control_import.validate'
     ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(
      jsonb_agg(effective.capability_key ORDER BY effective.capability_key),
      '[]'::jsonb
    ) INTO capabilities
  FROM public.tenant_iam_effective_capabilities(membership_row.id) effective
  WHERE effective.capability_key LIKE 'payroll.control_import.%';

  RETURN jsonb_build_object(
    'tenantId', membership_row.tenant_id,
    'membershipId', membership_row.id,
    'roleKey', membership_row.role_key,
    'actorSessionId', session_row.id,
    'actorSessionVersion', session_row.session_version,
    'releaseSha', lower(p_context->>'releaseSha'),
    'certifiedBindingId', binding_row.id,
    'actorPersonId', actor_person_id,
    'employmentLinked', employment_linked,
    'capabilities', capabilities
  );
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_snapshot_v1(
  p_batch_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', batch.id,
    'sourceKind', batch.source_kind,
    'provenanceState', batch.provenance_state,
    'period', to_char(batch.period_month, 'YYYY-MM'),
    'jurisdiction', batch.jurisdiction,
    'definitionKey', batch.definition_key,
    'contractVersion', batch.contract_version,
    'hmacKeyVersion', batch.hmac_key_version,
    'contentFingerprint', btrim(batch.content_hmac_sha256),
    'byteLength', batch.byte_length,
    'rowCount', batch.row_count,
    'releaseSha', btrim(batch.release_sha),
    'status', batch.status,
    'version', batch.version,
    'reasonCode', batch.reason_code,
    'reasonReference', batch.reason_reference,
    'payrollPosted', batch.payroll_posted,
    'fiscalArtifactGenerated', batch.fiscal_artifact_generated,
    'createdAt', batch.created_at,
    'updatedAt', batch.updated_at,
    'submittedAt', batch.submitted_at,
    'decidedAt', batch.decided_at,
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'concept', row_value.concept_code::text,
        'amountCents', row_value.amount_cents::text
      ) ORDER BY row_value.concept_code)
      FROM public.payroll_control_import_row row_value
      WHERE row_value.batch_id = batch.id AND row_value.tenant_id = batch.tenant_id
    ), '[]'::jsonb)
  )
  FROM public.payroll_control_import_batch batch
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_event_snapshot_v1(
  p_event_id bigint,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', batch.id,
    'sourceKind', batch.source_kind,
    'provenanceState', batch.provenance_state,
    'period', to_char(batch.period_month, 'YYYY-MM'),
    'jurisdiction', batch.jurisdiction,
    'definitionKey', batch.definition_key,
    'contractVersion', batch.contract_version,
    'hmacKeyVersion', batch.hmac_key_version,
    'contentFingerprint', btrim(batch.content_hmac_sha256),
    'byteLength', batch.byte_length,
    'rowCount', batch.row_count,
    'releaseSha', btrim(batch.release_sha),
    'status', event.to_status,
    'version', event.resulting_version,
    'reasonCode', event.reason_code,
    'reasonReference', event.reason_reference,
    'payrollPosted', event.payroll_posted,
    'fiscalArtifactGenerated', event.fiscal_artifact_generated,
    'createdAt', batch.created_at,
    'updatedAt', event.occurred_at,
    'submittedAt', (
      SELECT submit_event.occurred_at
      FROM public.payroll_control_import_event submit_event
      WHERE submit_event.batch_id = batch.id
        AND submit_event.tenant_id = batch.tenant_id
        AND submit_event.command = 'submit'
        AND submit_event.resulting_version <= event.resulting_version
      ORDER BY submit_event.resulting_version DESC
      LIMIT 1
    ),
    'decidedAt', CASE WHEN event.to_status IN ('validated','rejected','cancelled')
      THEN event.occurred_at ELSE NULL END,
    'rows', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'concept', row_value.concept_code::text,
        'amountCents', row_value.amount_cents::text
      ) ORDER BY row_value.concept_code)
      FROM public.payroll_control_import_row row_value
      WHERE row_value.batch_id = batch.id AND row_value.tenant_id = batch.tenant_id
    ), '[]'::jsonb)
  )
  FROM public.payroll_control_import_event event
  JOIN public.payroll_control_import_batch batch
    ON batch.id = event.batch_id AND batch.tenant_id = event.tenant_id
  WHERE event.id = p_event_id AND event.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_batch_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  stored_rows integer;
  stored_concepts integer;
BEGIN
  IF NEW.payroll_posted IS DISTINCT FROM false
     OR NEW.fiscal_artifact_generated IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_POSTING_BLOCKED' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'quarantined' OR NEW.version <> 1 OR NEW.row_count <> 2
       OR NEW.reason_code <> 'source_uploaded' OR NEW.reason_reference IS NOT NULL
       OR NEW.validated_by_membership_id IS NOT NULL OR NEW.validated_by_person_id IS NOT NULL
       OR NEW.submitted_at IS NOT NULL OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_INSERT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    NEW.created_at := now();
    NEW.updated_at := NEW.created_at;
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.certified_binding_id, NEW.source_kind, NEW.provenance_state,
    NEW.period_month,
    NEW.jurisdiction, NEW.definition_key, NEW.contract_version,
    NEW.hmac_key_version, NEW.content_hmac_sha256,
    NEW.byte_length, NEW.row_count, NEW.release_sha,
    NEW.prepared_by_membership_id, NEW.prepared_by_person_id, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.certified_binding_id, OLD.source_kind, OLD.provenance_state,
    OLD.period_month,
    OLD.jurisdiction, OLD.definition_key, OLD.contract_version,
    OLD.hmac_key_version, OLD.content_hmac_sha256,
    OLD.byte_length, OLD.row_count, OLD.release_sha,
    OLD.prepared_by_membership_id, OLD.prepared_by_person_id, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_CONTEXT_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.version <> OLD.version + 1 OR NOT (
    (OLD.status = 'quarantined' AND NEW.status IN ('submitted','cancelled'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('validated','rejected','cancelled'))
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (NEW.status = 'submitted' AND NEW.reason_code = 'ready_for_validation')
    OR (NEW.status = 'validated' AND NEW.reason_code = 'source_validated')
    OR (NEW.status = 'rejected' AND NEW.reason_code IN (
      'contract_invalid','amounts_inconsistent','source_unverifiable'
    ))
    OR (NEW.status = 'cancelled' AND NEW.reason_code = 'cancelled_by_preparer')
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status IN ('submitted','validated') THEN
    SELECT count(*), count(DISTINCT row_value.concept_code)
      INTO stored_rows, stored_concepts
    FROM public.payroll_control_import_row row_value
    WHERE row_value.batch_id = NEW.id AND row_value.tenant_id = NEW.tenant_id
      AND row_value.concept_code IN (701,703);
    IF stored_rows <> 2 OR stored_concepts <> 2 THEN
      RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_ROWS_INCOMPLETE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.status = 'submitted' THEN
    NEW.submitted_at := now();
    NEW.decided_at := NULL;
    NEW.validated_by_membership_id := NULL;
    NEW.validated_by_person_id := NULL;
  ELSIF NEW.status IN ('validated','rejected') THEN
    NEW.submitted_at := OLD.submitted_at;
    NEW.decided_at := now();
    IF NEW.validated_by_membership_id IS NULL OR NEW.validated_by_person_id IS NULL
       OR NEW.validated_by_membership_id = NEW.prepared_by_membership_id
       OR NEW.validated_by_person_id = NEW.prepared_by_person_id THEN
      RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    NEW.submitted_at := OLD.submitted_at;
    NEW.decided_at := now();
    NEW.validated_by_membership_id := NULL;
    NEW.validated_by_person_id := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_row_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_ROWS_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  SELECT batch.status INTO parent_status
  FROM public.payroll_control_import_batch batch
  WHERE batch.id = NEW.batch_id AND batch.tenant_id = NEW.tenant_id
  FOR UPDATE;
  IF NOT FOUND OR parent_status <> 'quarantined' THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_ROWS_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_event_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  batch_row public.payroll_control_import_batch%ROWTYPE;
BEGIN
  SELECT * INTO batch_row
  FROM public.payroll_control_import_batch batch
  WHERE batch.id = NEW.batch_id AND batch.tenant_id = NEW.tenant_id
  FOR SHARE;
  IF NOT FOUND OR batch_row.version <> NEW.resulting_version
     OR batch_row.status <> NEW.to_status OR batch_row.reason_code <> NEW.reason_code
     OR batch_row.reason_reference IS DISTINCT FROM NEW.reason_reference
     OR batch_row.certified_binding_id <> NEW.certified_binding_id THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_EVENT_CONTEXT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_membership membership
    WHERE membership.id = NEW.actor_membership_id
      AND membership.tenant_id = NEW.tenant_id
      AND membership.status = 'active'
      AND membership.role_key = NEW.actor_role_key
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_iam_effective_capabilities(NEW.actor_membership_id) effective
    WHERE effective.capability_key = NEW.authority_capability_key
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_EVENT_AUTHORITY_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (NEW.command = 'prepare' AND NEW.from_status IS NULL
      AND NEW.to_status = 'quarantined' AND NEW.expected_version = 0
      AND NEW.resulting_version = 1)
    OR (NEW.command = 'submit' AND NEW.from_status = 'quarantined'
      AND NEW.to_status = 'submitted')
    OR (NEW.command = 'validate' AND NEW.from_status = 'submitted'
      AND NEW.to_status = 'validated')
    OR (NEW.command = 'reject' AND NEW.from_status = 'submitted'
      AND NEW.to_status = 'rejected')
    OR (NEW.command = 'cancel' AND NEW.from_status IN ('quarantined','submitted')
      AND NEW.to_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_EVENT_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.command <> 'prepare' AND NOT EXISTS (
    SELECT 1 FROM public.payroll_control_import_event previous_event
    WHERE previous_event.batch_id = NEW.batch_id
      AND previous_event.tenant_id = NEW.tenant_id
      AND previous_event.resulting_version = NEW.expected_version
      AND previous_event.to_status = NEW.from_status
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_EVENT_CHAIN_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.command IN ('prepare','submit','cancel') AND (
      NEW.actor_membership_id <> batch_row.prepared_by_membership_id
      OR NEW.actor_person_id <> batch_row.prepared_by_person_id
    )) OR (NEW.command IN ('validate','reject') AND (
      NEW.actor_membership_id IS DISTINCT FROM batch_row.validated_by_membership_id
      OR NEW.actor_person_id IS DISTINCT FROM batch_row.validated_by_person_id
    )) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_EVENT_ACTOR_INVALID' USING ERRCODE = 'P0001';
  END IF;

  NEW.occurred_at := now();
  NEW.event_sha256 := encode(digest(convert_to(jsonb_build_object(
    'tenantId', NEW.tenant_id,
    'batchId', NEW.batch_id,
    'certifiedBindingId', NEW.certified_binding_id,
    'actorMembershipId', NEW.actor_membership_id,
    'actorPersonId', NEW.actor_person_id,
    'actorRoleKey', NEW.actor_role_key,
    'authorityCapabilityKey', NEW.authority_capability_key,
    'actorSessionId', NEW.actor_session_id,
    'actorSessionVersion', NEW.actor_session_version,
    'releaseSha', btrim(NEW.release_sha),
    'command', NEW.command,
    'fromStatus', NEW.from_status,
    'toStatus', NEW.to_status,
    'expectedVersion', NEW.expected_version,
    'resultingVersion', NEW.resulting_version,
    'reasonCode', NEW.reason_code,
    'reasonReference', NEW.reason_reference,
    'idempotencyKey', NEW.idempotency_key,
    'commandHash', btrim(NEW.command_hash)
  )::text, 'UTF8'), 'sha256'), 'hex');
  NEW.payroll_posted := false;
  NEW.fiscal_artifact_generated := false;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_require_audit_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_control_import_event event
    WHERE event.batch_id = NEW.id AND event.tenant_id = NEW.tenant_id
      AND event.resulting_version = NEW.version AND event.to_status = NEW.status
      AND event.reason_code = NEW.reason_code
      AND event.reason_reference IS NOT DISTINCT FROM NEW.reason_reference
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_AUDIT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS payroll_control_import_batch_guard_v1
  ON public.payroll_control_import_batch;
CREATE TRIGGER payroll_control_import_batch_guard_v1
BEFORE INSERT OR UPDATE ON public.payroll_control_import_batch
FOR EACH ROW EXECUTE FUNCTION public.payroll_control_import_batch_guard_v1();

DROP TRIGGER IF EXISTS payroll_control_import_batch_no_delete_v1
  ON public.payroll_control_import_batch;
CREATE TRIGGER payroll_control_import_batch_no_delete_v1
BEFORE DELETE ON public.payroll_control_import_batch
FOR EACH ROW EXECUTE FUNCTION public.payroll_control_import_reject_change_v1();

DROP TRIGGER IF EXISTS payroll_control_import_row_guard_v1
  ON public.payroll_control_import_row;
CREATE TRIGGER payroll_control_import_row_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_control_import_row
FOR EACH ROW EXECUTE FUNCTION public.payroll_control_import_row_guard_v1();

DROP TRIGGER IF EXISTS payroll_control_import_event_guard_v1
  ON public.payroll_control_import_event;
CREATE TRIGGER payroll_control_import_event_guard_v1
BEFORE INSERT ON public.payroll_control_import_event
FOR EACH ROW EXECUTE FUNCTION public.payroll_control_import_event_guard_v1();

DROP TRIGGER IF EXISTS payroll_control_import_event_append_only_v1
  ON public.payroll_control_import_event;
CREATE TRIGGER payroll_control_import_event_append_only_v1
BEFORE UPDATE OR DELETE ON public.payroll_control_import_event
FOR EACH ROW EXECUTE FUNCTION public.payroll_control_import_reject_change_v1();

DROP TRIGGER IF EXISTS payroll_control_import_batch_audit_required_v1
  ON public.payroll_control_import_batch;
CREATE CONSTRAINT TRIGGER payroll_control_import_batch_audit_required_v1
AFTER INSERT OR UPDATE ON public.payroll_control_import_batch
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.payroll_control_import_require_audit_v1();

CREATE OR REPLACE FUNCTION public.payroll_control_import_bootstrap_v1(p_context jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  batch_list jsonb;
  event_list jsonb := '[]'::jsonb;
  has_prepare boolean;
  has_validate boolean;
  has_audit boolean;
BEGIN
  context_value := public.payroll_control_import_assert_context_v1(
    p_context, 'payroll.control_import.read'
  );
  has_prepare := context_value->'capabilities' ? 'payroll.control_import.prepare';
  has_validate := context_value->'capabilities' ? 'payroll.control_import.validate';
  has_audit := context_value->'capabilities' ? 'payroll.control_import.audit.read';

  SELECT COALESCE(jsonb_agg(
    public.payroll_control_import_snapshot_v1(item.id, item.tenant_id)
    || jsonb_build_object('allowedCommands', CASE
      WHEN item.status = 'quarantined' AND has_prepare
        AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND item.prepared_by_person_id = (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('submit','cancel')
      WHEN item.status = 'submitted' AND has_prepare
        AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND item.prepared_by_person_id = (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('cancel')
      WHEN item.status = 'submitted' AND has_validate
        AND item.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
        AND item.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('validate','reject')
      ELSE '[]'::jsonb
    END)
    ORDER BY item.period_month DESC, item.created_at DESC, item.id
  ), '[]'::jsonb) INTO batch_list
  FROM (
    SELECT batch.* FROM public.payroll_control_import_batch batch
    WHERE batch.tenant_id = (context_value->>'tenantId')::uuid
      AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    ORDER BY batch.period_month DESC, batch.created_at DESC, batch.id
    LIMIT 100
  ) item;

  IF has_audit THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'batchId', item.batch_id,
      'certifiedBindingId', item.certified_binding_id,
      'actorMembershipId', item.actor_membership_id,
      'actorPersonId', item.actor_person_id,
      'actorRoleKey', item.actor_role_key,
      'authorityCapabilityKey', item.authority_capability_key,
      'command', item.command,
      'fromStatus', item.from_status,
      'toStatus', item.to_status,
      'expectedVersion', item.expected_version,
      'resultingVersion', item.resulting_version,
      'reasonCode', item.reason_code,
      'reasonReference', item.reason_reference,
      'eventSha256', btrim(item.event_sha256),
      'occurredAt', item.occurred_at
    ) ORDER BY item.occurred_at DESC, item.id DESC), '[]'::jsonb)
    INTO event_list
    FROM (
      SELECT event.* FROM public.payroll_control_import_event event
      JOIN public.payroll_control_import_batch audit_batch
        ON audit_batch.id = event.batch_id
       AND audit_batch.tenant_id = event.tenant_id
      WHERE event.tenant_id = (context_value->>'tenantId')::uuid
        AND audit_batch.certified_binding_id =
          (context_value->>'certifiedBindingId')::uuid
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT 100
    ) item;
  END IF;

  RETURN jsonb_build_object(
    'principal', jsonb_build_object(
      'tenantId', context_value->>'tenantId',
      'membershipId', context_value->>'membershipId',
      'certifiedBindingId', context_value->>'certifiedBindingId',
      'roleKey', context_value->>'roleKey',
      'employmentLinked', (context_value->>'employmentLinked')::boolean,
      'capabilities', context_value->'capabilities'
    ),
    'batches', batch_list,
    'recentEvents', event_list,
    'limits', jsonb_build_object(
      'maxSourceBytes', 16384,
      'contractVersion', 'payroll-control-import.v1',
      'hmacKeyVersion', 'hmac-v1',
      'definitionKey', 'payroll-post-close-701-703.v1',
      'sourceKinds', jsonb_build_array('grh_observed','operator_control'),
      'concepts', jsonb_build_array('701','703')
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_prepare_v1(
  p_context jsonb,
  p_source_kind text,
  p_period_month date,
  p_jurisdiction text,
  p_definition_key text,
  p_content_hmac_sha256 text,
  p_byte_length integer,
  p_rows jsonb,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  existing_event public.payroll_control_import_event%ROWTYPE;
  existing_event_found boolean := false;
  existing_batch public.payroll_control_import_batch%ROWTYPE;
  batch_id_value uuid;
  event_id_value bigint;
  canonical_rows jsonb;
  stored_rows jsonb;
  event_hash_placeholder text := repeat('0', 64);
BEGIN
  IF p_source_kind NOT IN ('grh_observed','operator_control')
     OR p_period_month IS NULL OR EXTRACT(day FROM p_period_month) <> 1
     OR p_period_month NOT BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'
     OR p_jurisdiction NOT IN ('42','55')
     OR p_definition_key <> 'payroll-post-close-701-703.v1'
     OR lower(COALESCE(p_content_hmac_sha256,'')) !~ '^[a-f0-9]{64}$'
     OR p_byte_length NOT BETWEEN 1 AND 16384
     OR public.payroll_control_import_rows_valid_v1(p_rows) IS DISTINCT FROM true
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  context_value := public.payroll_control_import_assert_context_v1(
    p_context, 'payroll.control_import.prepare'
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text,
    0
  ));

  SELECT * INTO existing_event
  FROM public.payroll_control_import_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency
  FOR SHARE;
  existing_event_found := FOUND;

  SELECT jsonb_agg(jsonb_build_object(
      'concept', item->>'concept',
      'amountCents', ((item->>'amountCents')::bigint)::text
    ) ORDER BY (item->>'concept')::smallint)
    INTO canonical_rows
  FROM jsonb_array_elements(p_rows) item;

  IF existing_event_found THEN
    SELECT * INTO existing_batch
    FROM public.payroll_control_import_batch batch
    WHERE batch.id = existing_event.batch_id
      AND batch.tenant_id = existing_event.tenant_id
    FOR SHARE;
    SELECT jsonb_agg(jsonb_build_object(
        'concept', row_value.concept_code::text,
        'amountCents', row_value.amount_cents::text
      ) ORDER BY row_value.concept_code)
      INTO stored_rows
    FROM public.payroll_control_import_row row_value
    WHERE row_value.batch_id = existing_batch.id
      AND row_value.tenant_id = existing_batch.tenant_id;
    IF existing_event.command <> 'prepare'
       OR btrim(existing_event.command_hash) <> lower(p_command_hash)
       OR existing_event.actor_person_id <> (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> 'payroll.control_import.prepare'
       OR existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid
       OR existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <> (context_value->>'actorSessionVersion')::integer
       OR btrim(existing_event.release_sha) <> lower(context_value->>'releaseSha')
       OR existing_batch.certified_binding_id <> (context_value->>'certifiedBindingId')::uuid
       OR existing_batch.source_kind <> p_source_kind
       OR existing_batch.period_month <> p_period_month
       OR existing_batch.jurisdiction <> p_jurisdiction
       OR existing_batch.definition_key <> p_definition_key
       OR btrim(existing_batch.content_hmac_sha256) <> lower(p_content_hmac_sha256)
       OR existing_batch.byte_length <> p_byte_length
       OR stored_rows IS DISTINCT FROM canonical_rows THEN
      RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'data', public.payroll_control_import_event_snapshot_v1(
        existing_event.id, existing_event.tenant_id
      )
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'certifiedBindingId')
      || ':' || lower(p_content_hmac_sha256),
    1
  ));
  IF EXISTS (
    SELECT 1 FROM public.payroll_control_import_batch batch
    WHERE batch.tenant_id = (context_value->>'tenantId')::uuid
      AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
      AND btrim(batch.content_hmac_sha256) = lower(p_content_hmac_sha256)
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_DUPLICATE_SOURCE' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.payroll_control_import_batch (
    tenant_id, certified_binding_id, source_kind, provenance_state,
    period_month, jurisdiction,
    definition_key, contract_version, hmac_key_version,
    content_hmac_sha256, byte_length, row_count, release_sha,
    status, version, prepared_by_membership_id, prepared_by_person_id,
    reason_code, reason_reference, payroll_posted, fiscal_artifact_generated
  ) VALUES (
    (context_value->>'tenantId')::uuid,
    (context_value->>'certifiedBindingId')::uuid,
    p_source_kind, 'operator_declared', p_period_month, p_jurisdiction, p_definition_key,
    'payroll-control-import.v1', 'hmac-v1',
    lower(p_content_hmac_sha256), p_byte_length, 2,
    lower(context_value->>'releaseSha'), 'quarantined', 1,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    'source_uploaded', NULL, false, false
  ) RETURNING id INTO batch_id_value;

  INSERT INTO public.payroll_control_import_row (
    batch_id, tenant_id, concept_code, amount_cents
  )
  SELECT batch_id_value, (context_value->>'tenantId')::uuid,
    (item->>'concept')::smallint, (item->>'amountCents')::bigint
  FROM jsonb_array_elements(p_rows) item;

  INSERT INTO public.payroll_control_import_event (
    tenant_id, batch_id, certified_binding_id,
    actor_membership_id, actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha,
    command, from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash,
    event_sha256, payroll_posted, fiscal_artifact_generated
  ) VALUES (
    (context_value->>'tenantId')::uuid, batch_id_value,
    (context_value->>'certifiedBindingId')::uuid,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    context_value->>'roleKey', 'payroll.control_import.prepare',
    (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'),
    'prepare', NULL, 'quarantined', 0, 1,
    'source_uploaded', NULL, p_idempotency, lower(p_command_hash),
    event_hash_placeholder, false, false
  ) RETURNING id INTO event_id_value;

  RETURN jsonb_build_object(
    'replayed', false,
    'data', public.payroll_control_import_event_snapshot_v1(
      event_id_value, (context_value->>'tenantId')::uuid
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_transition_v1(
  p_context jsonb,
  p_batch_id uuid,
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
  required_capability text;
  context_value jsonb;
  batch_row public.payroll_control_import_batch%ROWTYPE;
  existing_event public.payroll_control_import_event%ROWTYPE;
  event_id_value bigint;
  normalized_reference text := NULLIF(btrim(COALESCE(p_reason_reference,'')), '');
  next_status text;
  event_hash_placeholder text := repeat('0', 64);
BEGIN
  IF p_batch_id IS NULL OR p_command NOT IN ('submit','validate','reject','cancel')
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR normalized_reference IS NOT NULL AND normalized_reference !~
       '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR NOT (
       (p_command = 'submit' AND p_reason_code = 'ready_for_validation'
         AND normalized_reference IS NULL)
       OR (p_command = 'validate' AND p_reason_code = 'source_validated'
         AND normalized_reference IS NULL)
       OR (p_command = 'reject' AND p_reason_code IN (
          'contract_invalid','amounts_inconsistent','source_unverifiable'
        ) AND normalized_reference IS NOT NULL)
       OR (p_command = 'cancel' AND p_reason_code = 'cancelled_by_preparer'
         AND normalized_reference IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  required_capability := CASE WHEN p_command IN ('submit','cancel')
    THEN 'payroll.control_import.prepare'
    ELSE 'payroll.control_import.validate'
  END;
  context_value := public.payroll_control_import_assert_context_v1(
    p_context, required_capability
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text,
    0
  ));

  SELECT * INTO existing_event
  FROM public.payroll_control_import_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency
  FOR SHARE;
  IF FOUND THEN
    IF existing_event.batch_id <> p_batch_id
       OR existing_event.command <> p_command
       OR existing_event.expected_version <> p_expected_version
       OR existing_event.reason_code <> p_reason_code
       OR existing_event.reason_reference IS DISTINCT FROM normalized_reference
       OR btrim(existing_event.command_hash) <> lower(p_command_hash)
       OR existing_event.actor_person_id <> (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> required_capability
       OR existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid
       OR existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <> (context_value->>'actorSessionVersion')::integer
       OR btrim(existing_event.release_sha) <> lower(context_value->>'releaseSha')
       OR NOT EXISTS (
         SELECT 1 FROM public.payroll_control_import_batch replay_batch
         WHERE replay_batch.id = existing_event.batch_id
           AND replay_batch.tenant_id = existing_event.tenant_id
           AND replay_batch.certified_binding_id =
             (context_value->>'certifiedBindingId')::uuid
       ) THEN
      RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'data', public.payroll_control_import_event_snapshot_v1(
        existing_event.id, existing_event.tenant_id
      )
    );
  END IF;

  SELECT * INTO batch_row
  FROM public.payroll_control_import_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF batch_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  IF p_command IN ('submit','cancel') THEN
    IF batch_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
       OR batch_row.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid
       OR (p_command = 'submit' AND batch_row.status <> 'quarantined')
       OR (p_command = 'cancel' AND batch_row.status NOT IN ('quarantined','submitted')) THEN
      RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_PREPARER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF batch_row.status <> 'submitted'
       OR batch_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid
       OR batch_row.prepared_by_person_id = (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  next_status := CASE p_command
    WHEN 'submit' THEN 'submitted'
    WHEN 'validate' THEN 'validated'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled'
  END;

  UPDATE public.payroll_control_import_batch batch SET
    status = next_status,
    version = batch.version + 1,
    validated_by_membership_id = CASE WHEN p_command IN ('validate','reject')
      THEN (context_value->>'membershipId')::uuid ELSE NULL END,
    validated_by_person_id = CASE WHEN p_command IN ('validate','reject')
      THEN (context_value->>'actorPersonId')::uuid ELSE NULL END,
    reason_code = p_reason_code,
    reason_reference = normalized_reference
  WHERE batch.id = batch_row.id AND batch.tenant_id = batch_row.tenant_id
  RETURNING * INTO batch_row;

  INSERT INTO public.payroll_control_import_event (
    tenant_id, batch_id, certified_binding_id,
    actor_membership_id, actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha,
    command, from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash,
    event_sha256, payroll_posted, fiscal_artifact_generated
  ) VALUES (
    batch_row.tenant_id, batch_row.id, batch_row.certified_binding_id,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    context_value->>'roleKey', required_capability,
    (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'),
    p_command, CASE p_command
      WHEN 'submit' THEN 'quarantined'
      WHEN 'cancel' THEN CASE WHEN batch_row.submitted_at IS NULL
        THEN 'quarantined' ELSE 'submitted' END
      ELSE 'submitted'
    END,
    next_status, p_expected_version, batch_row.version,
    p_reason_code, normalized_reference, p_idempotency,
    lower(p_command_hash), event_hash_placeholder, false, false
  ) RETURNING id INTO event_id_value;

  RETURN jsonb_build_object(
    'replayed', false,
    'data', public.payroll_control_import_event_snapshot_v1(
      event_id_value, batch_row.tenant_id
    )
  );
END
$$;

COMMENT ON TABLE public.payroll_control_import_batch IS
  'Lote agregado tenant-bound en cuarentena y de procedencia declarada por operador; su validacion no publica ni impacta nomina.';
COMMENT ON TABLE public.payroll_control_import_row IS
  'Dos importes BIGINT, conceptos 701/703; no conserva filas nominales ni identificadores de empleados.';
COMMENT ON TABLE public.payroll_control_import_event IS
  'Auditoria append-only e idempotente; actor por membership/person, sin email ni contenido de fuente.';
COMMENT ON COLUMN public.payroll_control_import_batch.content_hmac_sha256 IS
  'HMAC-SHA256 durable calculado por el servidor con versiones de contrato y clave, tenant, binding y bytes; el release se audita por separado y no es SHA crudo.';
COMMENT ON COLUMN public.payroll_control_import_batch.reason_reference IS
  'Referencia opaca ref:UUIDv4; no admite texto libre ni datos personales.';
COMMENT ON FUNCTION public.payroll_control_import_prepare_v1(
  jsonb,text,date,text,text,text,integer,jsonb,uuid,text
) IS
  'Registra una fuente agregada en cuarentena; p_content_hmac_sha256 debe ser calculado por el servidor.';

REVOKE ALL PRIVILEGES ON TABLE
  public.payroll_control_import_batch,
  public.payroll_control_import_row,
  public.payroll_control_import_event
FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE
  public.payroll_control_import_batch,
  public.payroll_control_import_row,
  public.payroll_control_import_event
FROM municontrol_actions_runtime_app;

REVOKE ALL ON FUNCTION public.payroll_control_import_rows_valid_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_reject_change_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_assert_context_v1(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_snapshot_v1(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_event_snapshot_v1(bigint,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_batch_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_row_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_event_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_require_audit_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_bootstrap_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_prepare_v1(
  jsonb,text,date,text,text,text,integer,jsonb,uuid,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_control_import_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_rows_valid_v1(jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_reject_change_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_assert_context_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_snapshot_v1(uuid,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_event_snapshot_v1(bigint,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_batch_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_row_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_event_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_require_audit_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_bootstrap_v1(jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_prepare_v1(
  jsonb,text,date,text,text,text,integer,jsonb,uuid,text
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) FROM municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION public.payroll_control_import_bootstrap_v1(jsonb)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_control_import_prepare_v1(
  jsonb,text,date,text,text,text,integer,jsonb,uuid,text
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_control_import_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) TO municontrol_actions_runtime_app;
