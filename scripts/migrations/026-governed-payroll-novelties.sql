-- MuniControl Friendly - Sprint 026
-- Novedades de nomina individuales y masivas, tenant-bound y gobernadas.
-- Una aprobacion habilita exclusivamente un snapshot exportable de MuniControl.
-- Esta migracion no escribe GRH, employment_movement, calculos ni liquidaciones.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES
  (
    'payroll.novelty.read',
    'Consultar lotes de novedades',
    'Consulta lotes, estados y conteos sin exponer legajos ni observaciones.',
    'tenant',
    'standard'
  ),
  (
    'payroll.novelty.nominal.read',
    'Consultar detalle nominal de novedades',
    'Consulta filas nominales y observaciones de lotes autorizados del tenant.',
    'tenant',
    'restricted'
  ),
  (
    'payroll.novelty.prepare',
    'Preparar novedades de nomina',
    'Prepara y envia lotes de novedades sin impactar la fuente GRH.',
    'tenant',
    'privileged'
  ),
  (
    'payroll.novelty.approve',
    'Aprobar novedades de nomina',
    'Aprueba o rechaza lotes preparados por otra persona y membresia.',
    'tenant',
    'restricted'
  ),
  (
    'payroll.novelty.export',
    'Exportar novedades aprobadas',
    'Obtiene un snapshot nominal aprobado para una exportacion controlada.',
    'tenant',
    'restricted'
  ),
  (
    'payroll.novelty.audit.read',
    'Auditar novedades de nomina',
    'Consulta eventos tecnicos inmutables de los lotes de novedades.',
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
  'payroll.novelty.approve',
  'payroll.novelty.prepare',
  'La preparacion y aprobacion de novedades deben recaer en personas y membresias diferentes.'
)
ON CONFLICT (capability_key, conflicts_with_key) DO UPDATE SET
  reason = EXCLUDED.reason;

CREATE OR REPLACE FUNCTION public.payroll_novelty_rows_valid_v1(
  p_rows jsonb,
  p_source_mode text
)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  row_value jsonb;
  row_ordinal_text text;
  adjustment_text text;
  quantity_text text;
  amount_text text;
  observation_text text;
  legal_text text;
  movement_text text;
  ordinals integer[] := ARRAY[]::integer[];
  duplicate_keys text[] := ARRAY[]::text[];
  duplicate_key text;
  expected_ordinal integer := 0;
BEGIN
  IF p_source_mode NOT IN ('individual','bulk')
     OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RETURN false;
  END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500
     OR (p_source_mode = 'individual' AND jsonb_array_length(p_rows) <> 1) THEN
    RETURN false;
  END IF;

  FOR row_value IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF jsonb_typeof(row_value) IS DISTINCT FROM 'object'
       OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(row_value) key)
          IS DISTINCT FROM ARRAY[
            'adjustmentMonth','amountCents','conceptSourceId','costCenterSourceId',
            'forced','legajo','legalInstrument','movementType','observation',
            'quantityDecimal','rowOrdinal'
          ]::text[]
       OR jsonb_typeof(row_value->'rowOrdinal') IS DISTINCT FROM 'number'
       OR jsonb_typeof(row_value->'legajo') IS DISTINCT FROM 'string'
       OR jsonb_typeof(row_value->'conceptSourceId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(row_value->'forced') IS DISTINCT FROM 'boolean'
       OR jsonb_typeof(row_value->'costCenterSourceId') NOT IN ('string','null')
       OR jsonb_typeof(row_value->'adjustmentMonth') NOT IN ('string','null')
       OR jsonb_typeof(row_value->'quantityDecimal') NOT IN ('string','null')
       OR jsonb_typeof(row_value->'amountCents') NOT IN ('string','null')
       OR jsonb_typeof(row_value->'movementType') NOT IN ('string','null')
       OR jsonb_typeof(row_value->'legalInstrument') NOT IN ('string','null')
       OR jsonb_typeof(row_value->'observation') NOT IN ('string','null') THEN
      RETURN false;
    END IF;

    row_ordinal_text := row_value->>'rowOrdinal';
    adjustment_text := row_value->>'adjustmentMonth';
    quantity_text := row_value->>'quantityDecimal';
    amount_text := row_value->>'amountCents';
    movement_text := row_value->>'movementType';
    legal_text := row_value->>'legalInstrument';
    observation_text := row_value->>'observation';

    IF row_ordinal_text !~ '^[1-9][0-9]{0,2}$' THEN
      RETURN false;
    END IF;
    IF row_ordinal_text::integer NOT BETWEEN 1 AND 500
       OR row_ordinal_text::integer = ANY(ordinals)
       OR COALESCE(row_value->>'legajo','') !~ '^(0|[1-9][0-9]{0,19})$'
       OR COALESCE(row_value->>'conceptSourceId','') !~ '^(0|[1-9][0-9]{0,19})$'
       OR (row_value->'costCenterSourceId' <> 'null'::jsonb
         AND COALESCE(row_value->>'costCenterSourceId','') !~ '^(0|[1-9][0-9]{0,19})$')
       OR (row_value->'movementType' <> 'null'::jsonb AND (
         movement_text !~ '^[a-z0-9][a-z0-9_.-]{0,31}$'
         OR movement_text <> btrim(movement_text)
       ))
       OR (row_value->'legalInstrument' <> 'null'::jsonb AND (
         length(legal_text) NOT BETWEEN 1 AND 160 OR legal_text <> btrim(legal_text)
       ))
       OR (row_value->'observation' <> 'null'::jsonb AND (
         length(observation_text) NOT BETWEEN 1 AND 500
         OR observation_text <> btrim(observation_text)
       ))
       OR (quantity_text IS NOT NULL AND (
         quantity_text !~ '^-?(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$'
         OR quantity_text ~ '^-0(?:\.0+)?$'
       ))
       OR (amount_text IS NOT NULL AND (
         amount_text !~ '^-?(0|[1-9][0-9]{0,17})$' OR amount_text = '-0'
       ))
       OR (quantity_text IS NULL AND amount_text IS NULL)
       OR ((row_value->>'forced')::boolean IS TRUE
         AND (amount_text IS NULL OR observation_text IS NULL
           OR length(observation_text) < 10)) THEN
      RETURN false;
    END IF;

    IF adjustment_text IS NOT NULL THEN
      IF adjustment_text !~ '^[0-9]{4}-(0[1-9]|1[0-2])-01$' THEN
        RETURN false;
      END IF;
      BEGIN
        IF to_char(adjustment_text::date, 'YYYY-MM-DD') <> adjustment_text THEN
          RETURN false;
        END IF;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
        RETURN false;
      END;
    END IF;

    BEGIN
      IF quantity_text IS NOT NULL THEN
        PERFORM quantity_text::numeric(20,6);
      END IF;
      IF amount_text IS NOT NULL THEN
        PERFORM amount_text::bigint;
      END IF;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN false;
    END;
    expected_ordinal := expected_ordinal + 1;
    IF row_ordinal_text::integer <> expected_ordinal THEN
      RETURN false;
    END IF;
    duplicate_key := (row_value->>'legajo') || chr(31)
      || (row_value->>'conceptSourceId') || chr(31)
      || COALESCE(row_value->>'costCenterSourceId', '') || chr(31)
      || COALESCE(row_value->>'adjustmentMonth', '') || chr(31)
      || COALESCE(row_value->>'movementType', '');
    IF duplicate_key = ANY(duplicate_keys) THEN
      RETURN false;
    END IF;
    duplicate_keys := array_append(duplicate_keys, duplicate_key);
    ordinals := array_append(ordinals, row_ordinal_text::integer);
  END LOOP;

  RETURN true;
END
$$;

CREATE TABLE IF NOT EXISTS public.payroll_novelty_batch (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  certified_binding_id uuid NOT NULL,
  source_mode varchar(16) NOT NULL,
  period_month date NOT NULL,
  payroll_type varchar(24) NOT NULL,
  content_sha256 char(64) NOT NULL,
  contract_version varchar(64) NOT NULL DEFAULT 'payroll-novelty-batch.v1',
  release_sha char(40) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  row_count integer NOT NULL,
  prepared_by_membership_id uuid NOT NULL,
  -- Un preparador de plataforma puede operar sin inventar un legajo propio.
  -- La membresia y la sesion MFA conservan su identidad; decidir exige persona GRH.
  prepared_by_person_id uuid,
  approved_by_membership_id uuid,
  approved_by_person_id uuid,
  reason_code varchar(64) NOT NULL DEFAULT 'draft_prepared',
  reason_reference varchar(128),
  exportable boolean NOT NULL DEFAULT false,
  grh_mutation boolean NOT NULL DEFAULT false,
  payroll_calculated boolean NOT NULL DEFAULT false,
  payroll_posted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  CONSTRAINT payroll_novelty_batch_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_novelty_batch_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_batch_id_tenant_uk UNIQUE (id, tenant_id),
  CONSTRAINT payroll_novelty_batch_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES public.platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_batch_preparer_membership_fk
    FOREIGN KEY (prepared_by_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_batch_preparer_person_fk
    FOREIGN KEY (prepared_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_batch_approver_membership_fk
    FOREIGN KEY (approved_by_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_batch_approver_person_fk
    FOREIGN KEY (approved_by_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_batch_source_mode_ck
    CHECK (source_mode IN ('individual','bulk')),
  CONSTRAINT payroll_novelty_batch_period_ck CHECK (
    EXTRACT(day FROM period_month) = 1
    AND period_month BETWEEN DATE '2008-01-01' AND DATE '2099-12-01'
  ),
  CONSTRAINT payroll_novelty_batch_payroll_type_ck CHECK (
    payroll_type IN ('monthly','sac','vacation','supplementary','final','other')
  ),
  CONSTRAINT payroll_novelty_batch_content_sha256_ck
    CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT payroll_novelty_batch_contract_ck
    CHECK (contract_version = 'payroll-novelty-batch.v1'),
  CONSTRAINT payroll_novelty_batch_release_ck
    CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT payroll_novelty_batch_status_ck CHECK (
    status IN ('draft','submitted','approved','rejected','cancelled')
  ),
  CONSTRAINT payroll_novelty_batch_version_ck CHECK (version > 0),
  CONSTRAINT payroll_novelty_batch_row_count_ck CHECK (
    row_count BETWEEN 1 AND 500
    AND (source_mode = 'bulk' OR row_count = 1)
  ),
  CONSTRAINT payroll_novelty_batch_reason_ck CHECK (
    reason_code IN (
      'draft_prepared','ready_for_review','validated_for_export',
      'invalid_rows','unsupported_concept','duplicate_or_conflict',
      'cancelled_by_preparer'
    )
  ),
  CONSTRAINT payroll_novelty_batch_reason_reference_ck CHECK (
    reason_reference IS NULL
    OR reason_reference ~
      '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_novelty_batch_checker_pair_ck CHECK (
    (approved_by_membership_id IS NULL AND approved_by_person_id IS NULL)
    OR (approved_by_membership_id IS NOT NULL AND approved_by_person_id IS NOT NULL)
  ),
  CONSTRAINT payroll_novelty_batch_maker_checker_ck CHECK (
    approved_by_person_id IS NULL OR (
      approved_by_membership_id <> prepared_by_membership_id
      AND (
        prepared_by_person_id IS NULL
        OR approved_by_person_id <> prepared_by_person_id
      )
    )
  ),
  CONSTRAINT payroll_novelty_batch_state_ck CHECK (
    (status = 'draft' AND submitted_at IS NULL AND decided_at IS NULL
      AND approved_by_membership_id IS NULL AND approved_by_person_id IS NULL)
    OR (status = 'submitted' AND submitted_at IS NOT NULL AND decided_at IS NULL
      AND approved_by_membership_id IS NULL AND approved_by_person_id IS NULL)
    OR (status IN ('approved','rejected') AND submitted_at IS NOT NULL
      AND decided_at IS NOT NULL AND approved_by_membership_id IS NOT NULL
      AND approved_by_person_id IS NOT NULL)
    OR (status = 'cancelled' AND decided_at IS NOT NULL
      AND approved_by_membership_id IS NULL AND approved_by_person_id IS NULL)
  ),
  CONSTRAINT payroll_novelty_batch_reference_required_ck CHECK (
    status NOT IN ('rejected','cancelled') OR reason_reference IS NOT NULL
  ),
  CONSTRAINT payroll_novelty_batch_exportable_ck CHECK (
    (status = 'approved' AND exportable IS TRUE)
    OR (status <> 'approved' AND exportable IS FALSE)
  ),
  CONSTRAINT payroll_novelty_batch_no_side_effect_ck CHECK (
    grh_mutation IS FALSE
    AND payroll_calculated IS FALSE
    AND payroll_posted IS FALSE
  )
);

CREATE TABLE IF NOT EXISTS public.payroll_novelty_row (
  id bigint GENERATED ALWAYS AS IDENTITY,
  batch_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  row_ordinal integer NOT NULL,
  employment_contract_id uuid NOT NULL,
  legajo_snapshot varchar(20) NOT NULL,
  concept_source_id varchar(20) NOT NULL,
  cost_center_source_id varchar(20),
  adjustment_month date,
  quantity numeric(20,6),
  amount_cents bigint,
  movement_type varchar(32),
  legal_instrument varchar(160),
  observation varchar(500),
  forced boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_novelty_row_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_novelty_row_id_scope_uk UNIQUE (id, tenant_id, batch_id),
  CONSTRAINT payroll_novelty_row_batch_fk
    FOREIGN KEY (batch_id, tenant_id)
    REFERENCES public.payroll_novelty_batch(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_row_contract_fk
    FOREIGN KEY (employment_contract_id)
    REFERENCES public.employment_contract(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_row_ordinal_uk UNIQUE (batch_id, row_ordinal),
  CONSTRAINT payroll_novelty_row_ordinal_ck CHECK (row_ordinal BETWEEN 1 AND 500),
  CONSTRAINT payroll_novelty_row_legajo_ck
    CHECK (legajo_snapshot ~ '^(0|[1-9][0-9]{0,19})$'),
  CONSTRAINT payroll_novelty_row_concept_ck
    CHECK (concept_source_id ~ '^(0|[1-9][0-9]{0,19})$'),
  CONSTRAINT payroll_novelty_row_cost_center_ck CHECK (
    cost_center_source_id IS NULL
    OR cost_center_source_id ~ '^(0|[1-9][0-9]{0,19})$'
  ),
  CONSTRAINT payroll_novelty_row_adjustment_ck CHECK (
    adjustment_month IS NULL OR (
      EXTRACT(day FROM adjustment_month) = 1
      AND adjustment_month BETWEEN DATE '2008-01-01' AND DATE '2099-12-01'
    )
  ),
  CONSTRAINT payroll_novelty_row_value_ck CHECK (
    quantity IS NOT NULL OR amount_cents IS NOT NULL
  ),
  CONSTRAINT payroll_novelty_row_movement_ck CHECK (
    movement_type IS NULL OR movement_type ~ '^[a-z0-9][a-z0-9_.-]{0,31}$'
  ),
  CONSTRAINT payroll_novelty_row_legal_ck CHECK (
    legal_instrument IS NULL OR (
      length(legal_instrument) BETWEEN 1 AND 160
      AND legal_instrument = btrim(legal_instrument)
    )
  ),
  CONSTRAINT payroll_novelty_row_observation_ck CHECK (
    observation IS NULL OR (
      length(observation) BETWEEN 1 AND 500 AND observation = btrim(observation)
    )
  ),
  CONSTRAINT payroll_novelty_row_forced_ck CHECK (
    forced IS FALSE OR (
      amount_cents IS NOT NULL
      AND observation IS NOT NULL
      AND length(observation) >= 10
    )
  )
);

CREATE TABLE IF NOT EXISTS public.payroll_novelty_issue (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  row_id bigint,
  row_ordinal integer,
  issue_code varchar(64) NOT NULL,
  severity varchar(16) NOT NULL,
  is_blocking boolean NOT NULL,
  field_name varchar(64),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_novelty_issue_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_novelty_issue_batch_fk
    FOREIGN KEY (batch_id, tenant_id)
    REFERENCES public.payroll_novelty_batch(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_issue_row_fk
    FOREIGN KEY (row_id, tenant_id, batch_id)
    REFERENCES public.payroll_novelty_row(id, tenant_id, batch_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_issue_row_pair_ck CHECK (
    (row_id IS NULL AND row_ordinal IS NULL)
    OR (row_id IS NOT NULL AND row_ordinal BETWEEN 1 AND 500)
  ),
  CONSTRAINT payroll_novelty_issue_code_ck CHECK (
    issue_code IN (
      'duplicate_business_key','concept_not_observed','cost_center_not_observed',
      'movement_type_not_observed','already_observed','existing_movement_conflict'
    )
  ),
  CONSTRAINT payroll_novelty_issue_severity_ck
    CHECK (severity IN ('info','warning','error')),
  CONSTRAINT payroll_novelty_issue_field_ck CHECK (
    field_name IS NULL OR field_name IN (
      'legajo','conceptSourceId','costCenterSourceId','movementType',
      'quantityDecimal','amountCents'
    )
  ),
  CONSTRAINT payroll_novelty_issue_details_ck CHECK (jsonb_typeof(details) = 'object')
);

CREATE TABLE IF NOT EXISTS public.payroll_novelty_event (
  id bigint GENERATED ALWAYS AS IDENTITY,
  tenant_id uuid NOT NULL,
  batch_id uuid NOT NULL,
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
  event_sha256 char(64) NOT NULL,
  exportable boolean NOT NULL DEFAULT false,
  grh_mutation boolean NOT NULL DEFAULT false,
  payroll_calculated boolean NOT NULL DEFAULT false,
  payroll_posted boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_novelty_event_pkey PRIMARY KEY (id),
  CONSTRAINT payroll_novelty_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_event_batch_fk
    FOREIGN KEY (batch_id, tenant_id)
    REFERENCES public.payroll_novelty_batch(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_event_binding_fk
    FOREIGN KEY (tenant_id, certified_binding_id)
    REFERENCES public.platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_event_membership_fk
    FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES public.tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_event_person_fk
    FOREIGN KEY (actor_person_id) REFERENCES public.person_identity(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_event_role_fk
    FOREIGN KEY (actor_role_key) REFERENCES public.iam_role(role_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_event_capability_fk
    FOREIGN KEY (authority_capability_key)
    REFERENCES public.iam_capability(capability_key) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_event_session_fk
    FOREIGN KEY (actor_session_id) REFERENCES public.tenant_identity_session(id) ON DELETE RESTRICT,
  CONSTRAINT payroll_novelty_event_batch_version_uk UNIQUE (batch_id, resulting_version),
  CONSTRAINT payroll_novelty_event_actor_idempotency_uk
    UNIQUE (tenant_id, actor_membership_id, idempotency_key),
  CONSTRAINT payroll_novelty_event_command_ck CHECK (
    command IN ('prepare','submit','approve','reject','cancel')
  ),
  CONSTRAINT payroll_novelty_event_decider_person_ck CHECK (
    command NOT IN ('approve','reject') OR actor_person_id IS NOT NULL
  ),
  CONSTRAINT payroll_novelty_event_authority_ck CHECK (
    (command IN ('prepare','submit','cancel')
      AND authority_capability_key = 'payroll.novelty.prepare')
    OR (command IN ('approve','reject')
      AND authority_capability_key = 'payroll.novelty.approve')
  ),
  CONSTRAINT payroll_novelty_event_status_ck CHECK (
    (from_status IS NULL OR from_status IN (
      'draft','submitted','approved','rejected','cancelled'
    ))
    AND to_status IN ('draft','submitted','approved','rejected','cancelled')
  ),
  CONSTRAINT payroll_novelty_event_version_ck CHECK (
    expected_version >= 0 AND resulting_version = expected_version + 1
  ),
  CONSTRAINT payroll_novelty_event_session_version_ck CHECK (actor_session_version > 0),
  CONSTRAINT payroll_novelty_event_release_ck CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT payroll_novelty_event_idempotency_v4_ck CHECK (
    idempotency_key::text ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_novelty_event_hash_ck CHECK (
    command_hash ~ '^[a-f0-9]{64}$' AND event_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT payroll_novelty_event_reference_ck CHECK (
    reason_reference IS NULL OR reason_reference ~
      '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  CONSTRAINT payroll_novelty_event_exportable_ck CHECK (
    exportable = (to_status = 'approved')
  ),
  CONSTRAINT payroll_novelty_event_no_side_effect_ck CHECK (
    grh_mutation IS FALSE
    AND payroll_calculated IS FALSE
    AND payroll_posted IS FALSE
  )
);

CREATE INDEX IF NOT EXISTS payroll_novelty_batch_tenant_period_idx
  ON public.payroll_novelty_batch (
    tenant_id, period_month DESC, payroll_type, status, id
  );
CREATE UNIQUE INDEX IF NOT EXISTS payroll_novelty_batch_active_content_uk
  ON public.payroll_novelty_batch (
    tenant_id, certified_binding_id, period_month, payroll_type, content_sha256
  )
  WHERE status IN ('draft','submitted','approved');
CREATE INDEX IF NOT EXISTS payroll_novelty_row_batch_idx
  ON public.payroll_novelty_row (tenant_id, batch_id, row_ordinal);
CREATE INDEX IF NOT EXISTS payroll_novelty_issue_batch_idx
  ON public.payroll_novelty_issue (tenant_id, batch_id, is_blocking, row_ordinal, id);
CREATE INDEX IF NOT EXISTS payroll_novelty_event_timeline_idx
  ON public.payroll_novelty_event (tenant_id, batch_id, occurred_at, id);

CREATE OR REPLACE FUNCTION public.payroll_novelty_reject_change_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'PAYROLL_NOVELTY_APPEND_ONLY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_assert_context_v1(
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
       'payroll.novelty.read','payroll.novelty.nominal.read',
       'payroll.novelty.prepare','payroll.novelty.approve',
       'payroll.novelty.export','payroll.novelty.audit.read'
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
    RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO user_row
  FROM public.internal_users users
  WHERE lower(users.email) = lower(btrim(p_context->>'actorEmail'))
    AND users.active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO membership_row
  FROM public.tenant_membership membership
  WHERE membership.id = (p_context->>'membershipId')::uuid
    AND membership.tenant_id = (p_context->>'tenantId')::uuid
    AND lower(membership.user_email) = lower(user_row.email)
    AND membership.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_INVALID' USING ERRCODE = 'P0001';
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
    RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.platform_tenant tenant
  WHERE tenant.id = membership_row.tenant_id AND tenant.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO policy_row
  FROM public.tenant_identity_policy policy
  WHERE policy.tenant_id = membership_row.tenant_id
    AND policy.tenant_data_plane_ready IS TRUE
    AND lower(policy.certified_release_sha) = lower(p_context->>'releaseSha')
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO binding_row
  FROM public.platform_tenant_source_binding binding
  WHERE binding.id = policy_row.certified_source_binding_id
    AND binding.tenant_id = membership_row.tenant_id
    AND binding.source_system = 'GRH'
    AND binding.verified IS TRUE
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_BINDING_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM public.tenant_action_authority authority
  WHERE authority.membership_id = membership_row.id
    AND authority.tenant_id = membership_row.tenant_id
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.tenant_iam_assert_no_sod_conflict(membership_row.id);
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_iam_effective_capabilities(membership_row.id) effective
    WHERE effective.capability_key = p_required_capability
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT contract.person_id INTO actor_person_id
  FROM public.tenant_action_employment_link link
  JOIN public.employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = binding_row.source_company_id
  JOIN public.source_import_batch source_batch
    ON source_batch.id = contract.source_batch_id
   AND source_batch.source_system = 'GRH'
   AND source_batch.source_database = binding_row.source_database
   AND source_batch.validation_state = 'published'
   AND source_batch.legacy_import_run_id IS NOT NULL
  WHERE link.membership_id = membership_row.id
    AND link.tenant_id = membership_row.tenant_id
    AND link.source_binding_id = binding_row.id
    AND link.active IS TRUE
  FOR SHARE OF link, contract, source_batch NOWAIT;
  employment_linked := FOUND;

  IF NOT employment_linked
     AND p_required_capability = 'payroll.novelty.approve' THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(
      jsonb_agg(effective.capability_key ORDER BY effective.capability_key),
      '[]'::jsonb
    ) INTO capabilities
  FROM public.tenant_iam_effective_capabilities(membership_row.id) effective
  WHERE effective.capability_key LIKE 'payroll.novelty.%';

  RETURN jsonb_build_object(
    'tenantId', membership_row.tenant_id,
    'membershipId', membership_row.id,
    'roleKey', membership_row.role_key,
    'actorSessionId', session_row.id,
    'actorSessionVersion', session_row.session_version,
    'releaseSha', lower(p_context->>'releaseSha'),
    'certifiedBindingId', binding_row.id,
    'sourceDatabase', binding_row.source_database,
    'sourceCompanyId', binding_row.source_company_id,
    'actorPersonId', actor_person_id,
    'employmentLinked', employment_linked,
    'capabilities', capabilities
  );
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_snapshot_v1(
  p_batch_id uuid,
  p_tenant_id uuid,
  p_include_nominal boolean
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'id', batch.id,
    'sourceMode', batch.source_mode,
    'periodMonth', to_char(batch.period_month, 'YYYY-MM-DD'),
    'payrollType', batch.payroll_type,
    'contractVersion', batch.contract_version,
    'releaseSha', btrim(batch.release_sha),
    'status', batch.status,
    'version', batch.version,
    'rowCount', batch.row_count,
    'reasonCode', batch.reason_code,
    'reasonReference', batch.reason_reference,
    'exportable', batch.exportable,
    'grhMutation', batch.grh_mutation,
    'payrollCalculated', batch.payroll_calculated,
    'payrollPosted', batch.payroll_posted,
    'blockingIssueCount', (
      SELECT count(*)::integer FROM public.payroll_novelty_issue issue
      WHERE issue.batch_id = batch.id AND issue.tenant_id = batch.tenant_id
        AND issue.is_blocking IS TRUE
    ),
    'warningIssueCount', (
      SELECT count(*)::integer FROM public.payroll_novelty_issue issue
      WHERE issue.batch_id = batch.id AND issue.tenant_id = batch.tenant_id
        AND issue.is_blocking IS FALSE
    ),
    'createdAt', batch.created_at,
    'updatedAt', batch.updated_at,
    'submittedAt', batch.submitted_at,
    'decidedAt', batch.decided_at,
    'rows', CASE WHEN p_include_nominal THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'rowOrdinal', row_value.row_ordinal,
        'employmentContractId', row_value.employment_contract_id,
        'legajo', row_value.legajo_snapshot,
        'conceptSourceId', row_value.concept_source_id,
        'costCenterSourceId', row_value.cost_center_source_id,
        'adjustmentMonth', CASE WHEN row_value.adjustment_month IS NULL
          THEN NULL ELSE to_char(row_value.adjustment_month, 'YYYY-MM-DD') END,
        'quantityDecimal', CASE WHEN row_value.quantity IS NULL
          THEN NULL ELSE trim_scale(row_value.quantity)::text END,
        'amountCents', CASE WHEN row_value.amount_cents IS NULL
          THEN NULL ELSE row_value.amount_cents::text END,
        'movementType', row_value.movement_type,
        'legalInstrument', row_value.legal_instrument,
        'observation', row_value.observation,
        'forced', row_value.forced,
        'issues', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'code', issue.issue_code,
            'severity', issue.severity,
            'blocking', issue.is_blocking,
            'field', issue.field_name,
            'details', issue.details
          ) ORDER BY issue.is_blocking DESC, issue.id)
          FROM public.payroll_novelty_issue issue
          WHERE issue.batch_id = row_value.batch_id
            AND issue.tenant_id = row_value.tenant_id
            AND issue.row_id = row_value.id
        ), '[]'::jsonb)
      ) ORDER BY row_value.row_ordinal)
      FROM public.payroll_novelty_row row_value
      WHERE row_value.batch_id = batch.id AND row_value.tenant_id = batch.tenant_id
    ), '[]'::jsonb) ELSE '[]'::jsonb END
  )
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id AND batch.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_event_snapshot_v1(
  p_event_id bigint,
  p_tenant_id uuid,
  p_include_nominal boolean
)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.payroll_novelty_snapshot_v1(
    event.batch_id, event.tenant_id, p_include_nominal
  ) || jsonb_build_object(
    'status', event.to_status,
    'version', event.resulting_version,
    'reasonCode', event.reason_code,
    'reasonReference', event.reason_reference,
    'exportable', event.exportable,
    'grhMutation', event.grh_mutation,
    'payrollCalculated', event.payroll_calculated,
    'payrollPosted', event.payroll_posted,
    'updatedAt', event.occurred_at
  )
  FROM public.payroll_novelty_event event
  JOIN public.payroll_novelty_batch batch
    ON batch.id = event.batch_id AND batch.tenant_id = event.tenant_id
  WHERE event.id = p_event_id AND event.tenant_id = p_tenant_id
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_batch_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  stored_rows integer;
  blocking_issues integer;
BEGIN
  IF NEW.grh_mutation IS DISTINCT FROM false
     OR NEW.payroll_calculated IS DISTINCT FROM false
     OR NEW.payroll_posted IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_SIDE_EFFECT_BLOCKED' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.version <> 1
       OR NEW.reason_code <> 'draft_prepared' OR NEW.reason_reference IS NOT NULL
       OR NEW.exportable IS TRUE
       OR NEW.approved_by_membership_id IS NOT NULL
       OR NEW.approved_by_person_id IS NOT NULL
       OR NEW.submitted_at IS NOT NULL OR NEW.decided_at IS NOT NULL THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_INSERT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    NEW.created_at := now();
    NEW.updated_at := NEW.created_at;
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.tenant_id, NEW.certified_binding_id, NEW.source_mode,
    NEW.period_month, NEW.payroll_type, NEW.content_sha256, NEW.contract_version,
    NEW.release_sha, NEW.row_count,
    NEW.prepared_by_membership_id, NEW.prepared_by_person_id, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.certified_binding_id, OLD.source_mode,
    OLD.period_month, OLD.payroll_type, OLD.content_sha256, OLD.contract_version,
    OLD.release_sha, OLD.row_count,
    OLD.prepared_by_membership_id, OLD.prepared_by_person_id, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_CONTEXT_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.version <> OLD.version + 1 OR NOT (
    (OLD.status = 'draft' AND NEW.status IN ('submitted','cancelled'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('approved','rejected','cancelled'))
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (NEW.status = 'submitted' AND NEW.reason_code = 'ready_for_review')
    OR (NEW.status = 'approved' AND NEW.reason_code = 'validated_for_export')
    OR (NEW.status = 'rejected'
      AND NEW.reason_code IN (
        'invalid_rows','unsupported_concept','duplicate_or_conflict'
      ))
    OR (NEW.status = 'cancelled' AND NEW.reason_code = 'cancelled_by_preparer')
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_REASON_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status IN ('submitted','approved') THEN
    SELECT count(*) INTO stored_rows
    FROM public.payroll_novelty_row row_value
    WHERE row_value.batch_id = NEW.id AND row_value.tenant_id = NEW.tenant_id;
    SELECT count(*) INTO blocking_issues
    FROM public.payroll_novelty_issue issue
    WHERE issue.batch_id = NEW.id AND issue.tenant_id = NEW.tenant_id
      AND issue.is_blocking IS TRUE;
    IF stored_rows <> NEW.row_count THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_ROWS_INCOMPLETE' USING ERRCODE = 'P0001';
    END IF;
    IF blocking_issues <> 0 THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_BLOCKING_ISSUES' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF NEW.status = 'submitted' THEN
    NEW.submitted_at := now();
    NEW.decided_at := NULL;
    NEW.approved_by_membership_id := NULL;
    NEW.approved_by_person_id := NULL;
    NEW.exportable := false;
  ELSIF NEW.status IN ('approved','rejected') THEN
    NEW.submitted_at := OLD.submitted_at;
    NEW.decided_at := now();
    IF NEW.approved_by_membership_id IS NULL OR NEW.approved_by_person_id IS NULL
       OR NEW.approved_by_membership_id = NEW.prepared_by_membership_id
       OR (NEW.prepared_by_person_id IS NOT NULL
         AND NEW.approved_by_person_id = NEW.prepared_by_person_id) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    NEW.exportable := NEW.status = 'approved';
  ELSE
    NEW.submitted_at := OLD.submitted_at;
    NEW.decided_at := now();
    NEW.approved_by_membership_id := NULL;
    NEW.approved_by_person_id := NULL;
    NEW.exportable := false;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_row_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  batch_row public.payroll_novelty_batch%ROWTYPE;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_ROWS_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO batch_row
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = NEW.batch_id AND batch.tenant_id = NEW.tenant_id
  FOR UPDATE;
  IF NOT FOUND OR batch_row.status <> 'draft' THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_ROWS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_tenant_source_binding binding
    JOIN public.employment_contract contract
      ON contract.id = NEW.employment_contract_id
     AND contract.legacy_company_id = binding.source_company_id
     AND contract.source_system = 'GRH'
     AND contract.status = 'active'
     AND contract.legacy_legajo = NEW.legajo_snapshot
    JOIN public.source_import_batch source_batch
      ON source_batch.id = contract.source_batch_id
     AND source_batch.source_system = 'GRH'
     AND source_batch.source_database = binding.source_database
     AND source_batch.validation_state = 'published'
     AND source_batch.legacy_import_run_id IS NOT NULL
    WHERE binding.id = batch_row.certified_binding_id
      AND binding.tenant_id = batch_row.tenant_id
      AND binding.source_system = 'GRH'
      AND binding.verified IS TRUE
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_CONTRACT_OUT_OF_BINDING' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.adjustment_month IS NOT NULL
     AND NEW.adjustment_month > batch_row.period_month THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_ADJUSTMENT_AFTER_PERIOD' USING ERRCODE = 'P0001';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_issue_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  parent_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_ISSUES_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  SELECT batch.status INTO parent_status
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = NEW.batch_id AND batch.tenant_id = NEW.tenant_id
  FOR UPDATE;
  IF NOT FOUND OR parent_status <> 'draft' THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_ISSUES_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.row_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payroll_novelty_row row_value
    WHERE row_value.id = NEW.row_id AND row_value.batch_id = NEW.batch_id
      AND row_value.tenant_id = NEW.tenant_id
      AND row_value.row_ordinal = NEW.row_ordinal
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_ISSUE_ROW_INVALID' USING ERRCODE = 'P0001';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_event_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  batch_row public.payroll_novelty_batch%ROWTYPE;
BEGIN
  SELECT * INTO batch_row
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = NEW.batch_id AND batch.tenant_id = NEW.tenant_id
  FOR SHARE;
  IF NOT FOUND OR batch_row.version <> NEW.resulting_version
     OR batch_row.status <> NEW.to_status OR batch_row.reason_code <> NEW.reason_code
     OR batch_row.reason_reference IS DISTINCT FROM NEW.reason_reference
     OR batch_row.certified_binding_id <> NEW.certified_binding_id
     OR batch_row.exportable <> NEW.exportable THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_EVENT_CONTEXT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_membership membership
    WHERE membership.id = NEW.actor_membership_id
      AND membership.tenant_id = NEW.tenant_id
      AND membership.status = 'active'
      AND membership.role_key = NEW.actor_role_key
  ) OR NOT EXISTS (
    SELECT 1 FROM public.tenant_iam_effective_capabilities(NEW.actor_membership_id) effective
    WHERE effective.capability_key = NEW.authority_capability_key
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_EVENT_AUTHORITY_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (NEW.command = 'prepare' AND NEW.from_status IS NULL
      AND NEW.to_status = 'draft' AND NEW.expected_version = 0
      AND NEW.resulting_version = 1)
    OR (NEW.command = 'submit' AND NEW.from_status = 'draft'
      AND NEW.to_status = 'submitted')
    OR (NEW.command = 'approve' AND NEW.from_status = 'submitted'
      AND NEW.to_status = 'approved')
    OR (NEW.command = 'reject' AND NEW.from_status = 'submitted'
      AND NEW.to_status = 'rejected')
    OR (NEW.command = 'cancel' AND NEW.from_status IN ('draft','submitted')
      AND NEW.to_status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_EVENT_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.command <> 'prepare' AND NOT EXISTS (
    SELECT 1 FROM public.payroll_novelty_event previous_event
    WHERE previous_event.batch_id = NEW.batch_id
      AND previous_event.tenant_id = NEW.tenant_id
      AND previous_event.resulting_version = NEW.expected_version
      AND previous_event.to_status = NEW.from_status
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_EVENT_CHAIN_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF (NEW.command IN ('prepare','submit','cancel') AND (
      NEW.actor_membership_id <> batch_row.prepared_by_membership_id
      OR NEW.actor_person_id IS DISTINCT FROM batch_row.prepared_by_person_id
    )) OR (NEW.command IN ('approve','reject') AND (
      NEW.actor_membership_id IS DISTINCT FROM batch_row.approved_by_membership_id
      OR NEW.actor_person_id IS DISTINCT FROM batch_row.approved_by_person_id
    )) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_EVENT_ACTOR_INVALID' USING ERRCODE = 'P0001';
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
    'commandHash', btrim(NEW.command_hash),
    'exportable', NEW.exportable,
    'grhMutation', false,
    'payrollCalculated', false,
    'payrollPosted', false
  )::text, 'UTF8'), 'sha256'), 'hex');
  NEW.grh_mutation := false;
  NEW.payroll_calculated := false;
  NEW.payroll_posted := false;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_require_audit_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.payroll_novelty_event event
    WHERE event.batch_id = NEW.id AND event.tenant_id = NEW.tenant_id
      AND event.resulting_version = NEW.version AND event.to_status = NEW.status
      AND event.reason_code = NEW.reason_code
      AND event.reason_reference IS NOT DISTINCT FROM NEW.reason_reference
      AND event.exportable = NEW.exportable
      AND event.grh_mutation IS FALSE
      AND event.payroll_calculated IS FALSE
      AND event.payroll_posted IS FALSE
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_AUDIT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS payroll_novelty_batch_guard_v1 ON public.payroll_novelty_batch;
CREATE TRIGGER payroll_novelty_batch_guard_v1
BEFORE INSERT OR UPDATE ON public.payroll_novelty_batch
FOR EACH ROW EXECUTE FUNCTION public.payroll_novelty_batch_guard_v1();

DROP TRIGGER IF EXISTS payroll_novelty_batch_no_delete_v1 ON public.payroll_novelty_batch;
CREATE TRIGGER payroll_novelty_batch_no_delete_v1
BEFORE DELETE ON public.payroll_novelty_batch
FOR EACH ROW EXECUTE FUNCTION public.payroll_novelty_reject_change_v1();

DROP TRIGGER IF EXISTS payroll_novelty_row_guard_v1 ON public.payroll_novelty_row;
CREATE TRIGGER payroll_novelty_row_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_novelty_row
FOR EACH ROW EXECUTE FUNCTION public.payroll_novelty_row_guard_v1();

DROP TRIGGER IF EXISTS payroll_novelty_issue_guard_v1 ON public.payroll_novelty_issue;
CREATE TRIGGER payroll_novelty_issue_guard_v1
BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_novelty_issue
FOR EACH ROW EXECUTE FUNCTION public.payroll_novelty_issue_guard_v1();

DROP TRIGGER IF EXISTS payroll_novelty_event_guard_v1 ON public.payroll_novelty_event;
CREATE TRIGGER payroll_novelty_event_guard_v1
BEFORE INSERT ON public.payroll_novelty_event
FOR EACH ROW EXECUTE FUNCTION public.payroll_novelty_event_guard_v1();

DROP TRIGGER IF EXISTS payroll_novelty_event_append_only_v1 ON public.payroll_novelty_event;
CREATE TRIGGER payroll_novelty_event_append_only_v1
BEFORE UPDATE OR DELETE ON public.payroll_novelty_event
FOR EACH ROW EXECUTE FUNCTION public.payroll_novelty_reject_change_v1();

DROP TRIGGER IF EXISTS payroll_novelty_batch_audit_required_v1 ON public.payroll_novelty_batch;
CREATE CONSTRAINT TRIGGER payroll_novelty_batch_audit_required_v1
AFTER INSERT OR UPDATE ON public.payroll_novelty_batch
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.payroll_novelty_require_audit_v1();

CREATE OR REPLACE FUNCTION public.payroll_novelty_bootstrap_v1(p_context jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  batch_list jsonb;
  event_list jsonb := '[]'::jsonb;
  has_nominal boolean;
  has_prepare boolean;
  has_approve boolean;
  has_export boolean;
  has_audit boolean;
BEGIN
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.read'
  );
  has_nominal := context_value->'capabilities' ? 'payroll.novelty.nominal.read';
  has_prepare := context_value->'capabilities' ? 'payroll.novelty.prepare';
  has_approve := context_value->'capabilities' ? 'payroll.novelty.approve';
  has_export := context_value->'capabilities' ? 'payroll.novelty.export';
  has_audit := context_value->'capabilities' ? 'payroll.novelty.audit.read';

  SELECT COALESCE(jsonb_agg(
    public.payroll_novelty_snapshot_v1(item.id, item.tenant_id, has_nominal)
    || jsonb_build_object(
      'allowedCommands', CASE
        WHEN item.status = 'draft' AND has_prepare
          AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
          AND item.prepared_by_person_id IS NOT DISTINCT FROM
            (context_value->>'actorPersonId')::uuid
          THEN jsonb_build_array('submit','cancel')
        WHEN item.status = 'submitted' AND has_prepare
          AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
          AND item.prepared_by_person_id IS NOT DISTINCT FROM
            (context_value->>'actorPersonId')::uuid
          THEN jsonb_build_array('cancel')
        WHEN item.status = 'submitted' AND has_approve AND has_nominal
          AND (context_value->>'employmentLinked')::boolean
          AND item.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
          AND (item.prepared_by_person_id IS NULL OR
            item.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid)
          THEN jsonb_build_array('approve','reject')
        ELSE '[]'::jsonb
      END,
      'canExport', item.status = 'approved' AND item.exportable
        AND has_export AND has_nominal
    ) ORDER BY item.period_month DESC, item.created_at DESC, item.id
  ), '[]'::jsonb) INTO batch_list
  FROM (
    SELECT batch.* FROM public.payroll_novelty_batch batch
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
      'exportable', item.exportable,
      'grhMutation', item.grh_mutation,
      'payrollCalculated', item.payroll_calculated,
      'payrollPosted', item.payroll_posted,
      'eventSha256', btrim(item.event_sha256),
      'occurredAt', item.occurred_at
    ) ORDER BY item.occurred_at DESC, item.id DESC), '[]'::jsonb)
    INTO event_list
    FROM (
      SELECT event.* FROM public.payroll_novelty_event event
      JOIN public.payroll_novelty_batch audit_batch
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
    'feature', jsonb_build_object(
      'key', 'payroll_novelties',
      'contractVersion', 'payroll-novelty-batch.v1',
      'approvalEffect', 'export_only'
    ),
    'batches', batch_list,
    'recentEvents', event_list,
    'limits', jsonb_build_object(
      'maxRows', 500,
      'contractVersion', 'payroll-novelty-batch.v1',
      'sourceModes', jsonb_build_array('individual','bulk'),
      'payrollTypes', jsonb_build_array(
        'monthly','sac','vacation','supplementary','final','other'
      ),
      'approvalEffect', 'export_only',
      'grhMutation', false,
      'payrollCalculated', false,
      'payrollPosted', false
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_transition_v1(
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
  batch_row public.payroll_novelty_batch%ROWTYPE;
  existing_event public.payroll_novelty_event%ROWTYPE;
  event_id_value bigint;
  normalized_reference text := NULLIF(btrim(COALESCE(p_reason_reference,'')), '');
  next_status text;
  prior_status text;
  event_hash_placeholder text := repeat('0', 64);
  include_nominal boolean;
BEGIN
  IF p_batch_id IS NULL
     OR p_command NOT IN ('submit','approve','reject','cancel')
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR (normalized_reference IS NOT NULL AND normalized_reference !~
       '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
     OR NOT (
       (p_command = 'submit' AND p_reason_code = 'ready_for_review'
         AND normalized_reference IS NULL)
       OR (p_command = 'approve' AND p_reason_code = 'validated_for_export'
         AND normalized_reference IS NULL)
       OR (p_command = 'reject' AND p_reason_code IN (
          'invalid_rows','unsupported_concept','duplicate_or_conflict'
        ) AND normalized_reference IS NOT NULL)
       OR (p_command = 'cancel' AND p_reason_code = 'cancelled_by_preparer'
         AND normalized_reference IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  required_capability := CASE WHEN p_command IN ('submit','cancel')
    THEN 'payroll.novelty.prepare'
    ELSE 'payroll.novelty.approve'
  END;
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, required_capability
  );
  include_nominal := context_value->'capabilities' ? 'payroll.novelty.nominal.read';
  IF p_command IN ('approve','reject') AND NOT include_nominal THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text,
    0
  ));

  SELECT * INTO existing_event
  FROM public.payroll_novelty_event event
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
       OR existing_event.actor_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> required_capability
       OR existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid
       OR existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <>
         (context_value->>'actorSessionVersion')::integer
       OR btrim(existing_event.release_sha) <> lower(context_value->>'releaseSha')
       OR NOT EXISTS (
         SELECT 1 FROM public.payroll_novelty_batch replay_batch
         WHERE replay_batch.id = existing_event.batch_id
           AND replay_batch.tenant_id = existing_event.tenant_id
           AND replay_batch.certified_binding_id =
             (context_value->>'certifiedBindingId')::uuid
       ) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'data', public.payroll_novelty_event_snapshot_v1(
        existing_event.id, existing_event.tenant_id, include_nominal
      )
    );
  END IF;

  SELECT * INTO batch_row
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF batch_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  prior_status := batch_row.status;
  IF p_command IN ('submit','cancel') THEN
    IF batch_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
       OR batch_row.prepared_by_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR (p_command = 'submit' AND batch_row.status <> 'draft')
       OR (p_command = 'cancel' AND batch_row.status NOT IN ('draft','submitted')) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_PREPARER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF batch_row.status <> 'submitted'
       OR (context_value->>'actorPersonId') IS NULL
       OR batch_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid
       OR (batch_row.prepared_by_person_id IS NOT NULL AND
         batch_row.prepared_by_person_id = (context_value->>'actorPersonId')::uuid) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  next_status := CASE p_command
    WHEN 'submit' THEN 'submitted'
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled'
  END;

  UPDATE public.payroll_novelty_batch batch SET
    status = next_status,
    version = batch.version + 1,
    approved_by_membership_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'membershipId')::uuid ELSE NULL END,
    approved_by_person_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'actorPersonId')::uuid ELSE NULL END,
    reason_code = p_reason_code,
    reason_reference = normalized_reference,
    exportable = p_command = 'approve',
    grh_mutation = false,
    payroll_calculated = false,
    payroll_posted = false
  WHERE batch.id = batch_row.id AND batch.tenant_id = batch_row.tenant_id
  RETURNING * INTO batch_row;

  INSERT INTO public.payroll_novelty_event (
    tenant_id, batch_id, certified_binding_id,
    actor_membership_id, actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha,
    command, from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash,
    event_sha256, exportable, grh_mutation, payroll_calculated, payroll_posted
  ) VALUES (
    batch_row.tenant_id, batch_row.id, batch_row.certified_binding_id,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    context_value->>'roleKey', required_capability,
    (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'),
    p_command, prior_status, next_status, p_expected_version, batch_row.version,
    p_reason_code, normalized_reference, p_idempotency, lower(p_command_hash),
    event_hash_placeholder, batch_row.exportable, false, false, false
  ) RETURNING id INTO event_id_value;

  RETURN jsonb_build_object(
    'replayed', false,
    'data', public.payroll_novelty_event_snapshot_v1(
      event_id_value, batch_row.tenant_id, include_nominal
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_detail_v1(
  p_context jsonb,
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  snapshot_value jsonb;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_DETAIL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.nominal.read'
  );
  SELECT public.payroll_novelty_snapshot_v1(
    batch.id, batch.tenant_id, true
  ) || jsonb_build_object(
    'allowedCommands', CASE
      WHEN batch.status = 'draft'
        AND (context_value->'capabilities' ? 'payroll.novelty.prepare')
        AND batch.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND batch.prepared_by_person_id IS NOT DISTINCT FROM
          (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('submit','cancel')
      WHEN batch.status = 'submitted'
        AND (context_value->'capabilities' ? 'payroll.novelty.prepare')
        AND batch.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND batch.prepared_by_person_id IS NOT DISTINCT FROM
          (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('cancel')
      WHEN batch.status = 'submitted'
        AND (context_value->'capabilities' ? 'payroll.novelty.approve')
        AND (context_value->>'employmentLinked')::boolean
        AND batch.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
        AND (batch.prepared_by_person_id IS NULL OR
          batch.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid)
        THEN jsonb_build_array('approve','reject')
      ELSE '[]'::jsonb
    END,
    'canExport', batch.status = 'approved' AND batch.exportable
      AND (context_value->'capabilities' ? 'payroll.novelty.export')
  ) INTO snapshot_value
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid;
  IF snapshot_value IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('data', snapshot_value);
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_export_v1(
  p_context jsonb,
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  snapshot_value jsonb;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_EXPORT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.export'
  );
  IF NOT (context_value->'capabilities' ? 'payroll.novelty.nominal.read') THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  SELECT public.payroll_novelty_snapshot_v1(
    batch.id, batch.tenant_id, true
  ) INTO snapshot_value
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    AND batch.status = 'approved'
    AND batch.exportable IS TRUE
    AND batch.grh_mutation IS FALSE
    AND batch.payroll_calculated IS FALSE
    AND batch.payroll_posted IS FALSE;
  IF snapshot_value IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOT_EXPORTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'contractVersion', 'payroll-novelty-export.v1',
    'approvalEffect', 'export_only',
    'data', snapshot_value
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_prepare_v1(
  p_context jsonb,
  p_source_mode text,
  p_period_month date,
  p_payroll_type text,
  p_rows jsonb,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  existing_event public.payroll_novelty_event%ROWTYPE;
  existing_event_found boolean := false;
  existing_batch public.payroll_novelty_batch%ROWTYPE;
  batch_id_value uuid;
  event_id_value bigint;
  row_value jsonb;
  contract_matches integer;
  contract_id_value uuid;
  canonical_rows jsonb;
  canonical_fingerprint_rows jsonb;
  content_sha256_value text;
  stored_rows jsonb;
  event_hash_placeholder text := repeat('0', 64);
  include_nominal boolean;
BEGIN
  IF p_source_mode NOT IN ('individual','bulk')
     OR p_period_month IS NULL OR EXTRACT(day FROM p_period_month) <> 1
     OR p_period_month NOT BETWEEN DATE '2008-01-01' AND DATE '2099-12-01'
     OR p_payroll_type NOT IN (
       'monthly','sac','vacation','supplementary','final','other'
     )
     OR public.payroll_novelty_rows_valid_v1(p_rows, p_source_mode) IS DISTINCT FROM true
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.prepare'
  );
  include_nominal := context_value->'capabilities' ? 'payroll.novelty.nominal.read';

  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text,
    0
  ));

  SELECT jsonb_agg(jsonb_build_object(
      'rowOrdinal', (item->>'rowOrdinal')::integer,
      'legajo', item->>'legajo',
      'conceptSourceId', item->>'conceptSourceId',
      'costCenterSourceId', item->>'costCenterSourceId',
      'adjustmentMonth', item->>'adjustmentMonth',
      'quantityDecimal', CASE WHEN item->>'quantityDecimal' IS NULL
        THEN NULL ELSE trim_scale((item->>'quantityDecimal')::numeric(20,6))::text END,
      'amountCents', CASE WHEN item->>'amountCents' IS NULL
        THEN NULL ELSE ((item->>'amountCents')::bigint)::text END,
      'movementType', item->>'movementType',
      'legalInstrument', item->>'legalInstrument',
      'observation', item->>'observation',
      'forced', (item->>'forced')::boolean
    ) ORDER BY (item->>'rowOrdinal')::integer)
    INTO canonical_rows
  FROM jsonb_array_elements(p_rows) item;

  -- La huella omite orden/ordinal y modo de carga: el mismo contenido logico
  -- no puede abrir lotes paralelos cambiando el orden o individual/masivo.
  SELECT jsonb_agg(
      fingerprint_row.row_payload
      ORDER BY fingerprint_row.business_key, fingerprint_row.row_payload::text
    )
    INTO canonical_fingerprint_rows
  FROM (
    SELECT jsonb_build_object(
        'legajo', item->>'legajo',
        'conceptSourceId', item->>'conceptSourceId',
        'costCenterSourceId', item->>'costCenterSourceId',
        'adjustmentMonth', item->>'adjustmentMonth',
        'quantityDecimal', CASE WHEN item->>'quantityDecimal' IS NULL
          THEN NULL ELSE trim_scale((item->>'quantityDecimal')::numeric(20,6))::text END,
        'amountCents', CASE WHEN item->>'amountCents' IS NULL
          THEN NULL ELSE ((item->>'amountCents')::bigint)::text END,
        'movementType', item->>'movementType',
        'legalInstrument', item->>'legalInstrument',
        'observation', item->>'observation',
        'forced', (item->>'forced')::boolean
      ) AS row_payload,
      (item->>'legajo') || chr(31)
        || (item->>'conceptSourceId') || chr(31)
        || COALESCE(item->>'costCenterSourceId', '') || chr(31)
        || COALESCE(item->>'adjustmentMonth', '') || chr(31)
        || COALESCE(item->>'movementType', '') AS business_key
    FROM jsonb_array_elements(p_rows) item
  ) fingerprint_row;

  content_sha256_value := encode(digest(convert_to(jsonb_build_object(
    'contractVersion', 'payroll-novelty-batch.v1',
    'tenantId', ((context_value->>'tenantId')::uuid)::text,
    'certifiedBindingId', ((context_value->>'certifiedBindingId')::uuid)::text,
    'periodMonth', to_char(p_period_month, 'YYYY-MM-DD'),
    'payrollType', p_payroll_type,
    'rows', canonical_fingerprint_rows
  )::text, 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO existing_event
  FROM public.payroll_novelty_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency
  FOR SHARE;
  existing_event_found := FOUND;

  IF existing_event_found THEN
    SELECT * INTO existing_batch
    FROM public.payroll_novelty_batch batch
    WHERE batch.id = existing_event.batch_id AND batch.tenant_id = existing_event.tenant_id
    FOR SHARE;
    SELECT jsonb_agg(jsonb_build_object(
        'rowOrdinal', row_item.row_ordinal,
        'legajo', row_item.legajo_snapshot,
        'conceptSourceId', row_item.concept_source_id,
        'costCenterSourceId', row_item.cost_center_source_id,
        'adjustmentMonth', CASE WHEN row_item.adjustment_month IS NULL
          THEN NULL ELSE to_char(row_item.adjustment_month, 'YYYY-MM-DD') END,
        'quantityDecimal', CASE WHEN row_item.quantity IS NULL
          THEN NULL ELSE trim_scale(row_item.quantity)::text END,
        'amountCents', CASE WHEN row_item.amount_cents IS NULL
          THEN NULL ELSE row_item.amount_cents::text END,
        'movementType', row_item.movement_type,
        'legalInstrument', row_item.legal_instrument,
        'observation', row_item.observation,
        'forced', row_item.forced
      ) ORDER BY row_item.row_ordinal) INTO stored_rows
    FROM public.payroll_novelty_row row_item
    WHERE row_item.batch_id = existing_batch.id
      AND row_item.tenant_id = existing_batch.tenant_id;

    IF existing_event.command <> 'prepare'
       OR btrim(existing_event.command_hash) <> lower(p_command_hash)
       OR existing_event.actor_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> 'payroll.novelty.prepare'
       OR existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid
       OR existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <>
         (context_value->>'actorSessionVersion')::integer
       OR btrim(existing_event.release_sha) <> lower(context_value->>'releaseSha')
       OR existing_batch.source_mode <> p_source_mode
       OR existing_batch.period_month <> p_period_month
       OR existing_batch.payroll_type <> p_payroll_type
       OR btrim(existing_batch.content_sha256) <> content_sha256_value
       OR stored_rows IS DISTINCT FROM canonical_rows THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'data', public.payroll_novelty_event_snapshot_v1(
        existing_event.id, existing_event.tenant_id, include_nominal
      )
    );
  END IF;

  -- Serializa por contenido canonico, independientemente del actor o de la
  -- clave de idempotencia. El indice parcial conserva la garantia aun si un
  -- futuro escritor no toma este advisory lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'payroll-novelty-active:' || content_sha256_value,
    0
  ));
  IF EXISTS (
    SELECT 1
    FROM public.payroll_novelty_batch batch
    WHERE batch.tenant_id = (context_value->>'tenantId')::uuid
      AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
      AND batch.period_month = p_period_month
      AND batch.payroll_type = p_payroll_type
      AND btrim(batch.content_sha256) = content_sha256_value
      AND batch.status IN ('draft','submitted','approved')
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_DUPLICATE_BATCH' USING ERRCODE = 'P0001';
  END IF;

  FOR row_value IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    SELECT count(*)::integer, (array_agg(contract.id ORDER BY contract.id))[1]
      INTO contract_matches, contract_id_value
    FROM public.employment_contract contract
    JOIN public.source_import_batch source_batch
      ON source_batch.id = contract.source_batch_id
     AND source_batch.source_system = 'GRH'
     AND source_batch.source_database = context_value->>'sourceDatabase'
     AND source_batch.validation_state = 'published'
     AND source_batch.legacy_import_run_id IS NOT NULL
    WHERE contract.source_system = 'GRH'
      AND contract.status = 'active'
      AND contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint
      AND contract.legacy_legajo = row_value->>'legajo';
    IF contract_matches <> 1 OR contract_id_value IS NULL THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_LEGAJO_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  INSERT INTO public.payroll_novelty_batch (
    tenant_id, certified_binding_id, source_mode, period_month, payroll_type,
    content_sha256, contract_version, release_sha, status, version, row_count,
    prepared_by_membership_id, prepared_by_person_id,
    reason_code, reason_reference, exportable,
    grh_mutation, payroll_calculated, payroll_posted
  ) VALUES (
    (context_value->>'tenantId')::uuid,
    (context_value->>'certifiedBindingId')::uuid,
    p_source_mode, p_period_month, p_payroll_type,
    content_sha256_value,
    'payroll-novelty-batch.v1', lower(context_value->>'releaseSha'),
    'draft', 1, jsonb_array_length(p_rows),
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    'draft_prepared', NULL, false, false, false, false
  ) RETURNING id INTO batch_id_value;

  FOR row_value IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    SELECT (array_agg(contract.id ORDER BY contract.id))[1] INTO contract_id_value
    FROM public.employment_contract contract
    JOIN public.source_import_batch source_batch
      ON source_batch.id = contract.source_batch_id
     AND source_batch.source_system = 'GRH'
     AND source_batch.source_database = context_value->>'sourceDatabase'
     AND source_batch.validation_state = 'published'
     AND source_batch.legacy_import_run_id IS NOT NULL
    WHERE contract.source_system = 'GRH'
      AND contract.status = 'active'
      AND contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint
      AND contract.legacy_legajo = row_value->>'legajo';

    INSERT INTO public.payroll_novelty_row (
      batch_id, tenant_id, row_ordinal, employment_contract_id, legajo_snapshot,
      concept_source_id, cost_center_source_id, adjustment_month,
      quantity, amount_cents, movement_type, legal_instrument, observation, forced
    ) VALUES (
      batch_id_value, (context_value->>'tenantId')::uuid,
      (row_value->>'rowOrdinal')::integer, contract_id_value, row_value->>'legajo',
      row_value->>'conceptSourceId', row_value->>'costCenterSourceId',
      (row_value->>'adjustmentMonth')::date,
      (row_value->>'quantityDecimal')::numeric(20,6),
      (row_value->>'amountCents')::bigint,
      row_value->>'movementType', row_value->>'legalInstrument',
      row_value->>'observation', (row_value->>'forced')::boolean
    );
  END LOOP;

  -- Duplicados de negocio dentro del mismo lote son visibles y bloqueantes.
  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'duplicate_business_key', 'error', true,
    'conceptSourceId', jsonb_build_object('duplicateCount', duplicates.duplicate_count)
  FROM public.payroll_novelty_row row_value
  JOIN (
    SELECT employment_contract_id, concept_source_id,
      COALESCE(cost_center_source_id, ''),
      COALESCE(adjustment_month, DATE '1900-01-01'),
      COALESCE(movement_type, ''),
      count(*)::integer AS duplicate_count
    FROM public.payroll_novelty_row
    WHERE batch_id = batch_id_value
      AND tenant_id = (context_value->>'tenantId')::uuid
    GROUP BY employment_contract_id, concept_source_id,
      COALESCE(cost_center_source_id, ''),
      COALESCE(adjustment_month, DATE '1900-01-01'),
      COALESCE(movement_type, '')
    HAVING count(*) > 1
  ) duplicates(
    employment_contract_id, concept_source_id, cost_center_source_id,
    adjustment_month, movement_type, duplicate_count
  ) ON duplicates.employment_contract_id = row_value.employment_contract_id
    AND duplicates.concept_source_id = row_value.concept_source_id
    AND duplicates.cost_center_source_id = COALESCE(row_value.cost_center_source_id, '')
    AND duplicates.adjustment_month = COALESCE(row_value.adjustment_month, DATE '1900-01-01')
    AND duplicates.movement_type = COALESCE(row_value.movement_type, '')
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid;

  -- No existe aun un catalogo canonico de conceptos/centros/tipos. Se valida
  -- formato y se explicita si el valor nunca fue observado en GRH publicado.
  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'concept_not_observed', 'warning', false,
    'conceptSourceId', jsonb_build_object('basis', 'published_grh_observation')
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND NOT EXISTS (
      SELECT 1 FROM public.employment_movement movement
      JOIN public.source_import_batch source_batch
        ON source_batch.id = movement.source_batch_id
       AND source_batch.source_system = 'GRH'
       AND source_batch.source_database = context_value->>'sourceDatabase'
       AND source_batch.validation_state = 'published'
      WHERE movement.employment_contract_id = row_value.employment_contract_id
        AND movement.source_system = 'GRH'
        AND movement.concept_source_id = row_value.concept_source_id
    );

  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'cost_center_not_observed', 'warning', false,
    'costCenterSourceId', jsonb_build_object('basis', 'published_grh_observation')
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND row_value.cost_center_source_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.employment_movement movement
      JOIN public.source_import_batch source_batch
        ON source_batch.id = movement.source_batch_id
       AND source_batch.source_system = 'GRH'
       AND source_batch.source_database = context_value->>'sourceDatabase'
       AND source_batch.validation_state = 'published'
      WHERE movement.employment_contract_id = row_value.employment_contract_id
        AND movement.source_system = 'GRH'
        AND movement.cost_center_source_id = row_value.cost_center_source_id
    );

  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'movement_type_not_observed', 'warning', false,
    'movementType', jsonb_build_object('basis', 'published_grh_observation')
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND row_value.movement_type IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.employment_movement movement
      JOIN public.source_import_batch source_batch
        ON source_batch.id = movement.source_batch_id
       AND source_batch.source_system = 'GRH'
       AND source_batch.source_database = context_value->>'sourceDatabase'
       AND source_batch.validation_state = 'published'
      WHERE movement.employment_contract_id = row_value.employment_contract_id
        AND movement.source_system = 'GRH'
        AND lower(movement.movement_type) = row_value.movement_type
    );

  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.employment_movement equal_movement
      JOIN public.source_import_batch equal_batch
        ON equal_batch.id = equal_movement.source_batch_id
       AND equal_batch.source_system = 'GRH'
       AND equal_batch.source_database = context_value->>'sourceDatabase'
       AND equal_batch.validation_state = 'published'
      WHERE equal_movement.employment_contract_id = row_value.employment_contract_id
        AND equal_movement.source_system = 'GRH'
        AND equal_movement.movement_period = p_period_month
        AND lower(COALESCE(equal_movement.payroll_type, '')) = p_payroll_type
        AND equal_movement.concept_source_id = row_value.concept_source_id
        AND COALESCE(equal_movement.cost_center_source_id, '') =
          COALESCE(row_value.cost_center_source_id, '')
        AND equal_movement.quantity IS NOT DISTINCT FROM row_value.quantity
    ) THEN 'already_observed' ELSE 'existing_movement_conflict' END,
    'error', true, 'conceptSourceId',
    jsonb_build_object('basis', 'published_grh_same_period')
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND EXISTS (
      SELECT 1 FROM public.employment_movement movement
      JOIN public.source_import_batch source_batch
        ON source_batch.id = movement.source_batch_id
       AND source_batch.source_system = 'GRH'
       AND source_batch.source_database = context_value->>'sourceDatabase'
       AND source_batch.validation_state = 'published'
      WHERE movement.employment_contract_id = row_value.employment_contract_id
        AND movement.source_system = 'GRH'
        AND movement.movement_period = p_period_month
        AND lower(COALESCE(movement.payroll_type, '')) = p_payroll_type
        AND movement.concept_source_id = row_value.concept_source_id
        AND COALESCE(movement.cost_center_source_id, '') =
          COALESCE(row_value.cost_center_source_id, '')
    );

  INSERT INTO public.payroll_novelty_event (
    tenant_id, batch_id, certified_binding_id,
    actor_membership_id, actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha,
    command, from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash,
    event_sha256, exportable, grh_mutation, payroll_calculated, payroll_posted
  ) VALUES (
    (context_value->>'tenantId')::uuid, batch_id_value,
    (context_value->>'certifiedBindingId')::uuid,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    context_value->>'roleKey', 'payroll.novelty.prepare',
    (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'),
    'prepare', NULL, 'draft', 0, 1,
    'draft_prepared', NULL, p_idempotency, lower(p_command_hash),
    event_hash_placeholder, false, false, false, false
  ) RETURNING id INTO event_id_value;

  RETURN jsonb_build_object(
    'replayed', false,
    'data', public.payroll_novelty_event_snapshot_v1(
      event_id_value, (context_value->>'tenantId')::uuid, include_nominal
    )
  );
END
$$;

COMMENT ON TABLE public.payroll_novelty_batch IS
  'Lote tenant-bound de novedades. Aprobado significa exportable desde MuniControl; nunca aplicado a GRH o nomina.';
COMMENT ON TABLE public.payroll_novelty_row IS
  'Filas nominales inmutables resueltas a contratos GRH activos del binding certificado.';
COMMENT ON TABLE public.payroll_novelty_issue IS
  'Resultado determinista e inmutable de validaciones; los bloqueantes impiden enviar o aprobar.';
COMMENT ON TABLE public.payroll_novelty_event IS
  'Auditoria append-only e idempotente por actor, sesion, binding, comando y version.';
COMMENT ON COLUMN public.payroll_novelty_batch.exportable IS
  'Solo true para estado approved; no implica calculo, posting ni mutacion de GRH.';
COMMENT ON COLUMN public.payroll_novelty_batch.content_sha256 IS
  'Huella SHA-256 canonica de tenant, binding, periodo, tipo y contenido semantico; no incluye orden ni modo de carga.';

REVOKE ALL PRIVILEGES ON TABLE
  public.payroll_novelty_batch,
  public.payroll_novelty_row,
  public.payroll_novelty_issue,
  public.payroll_novelty_event
FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE
  public.payroll_novelty_batch,
  public.payroll_novelty_row,
  public.payroll_novelty_issue,
  public.payroll_novelty_event
FROM municontrol_actions_runtime_app;

REVOKE ALL ON FUNCTION public.payroll_novelty_rows_valid_v1(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_reject_change_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_assert_context_v1(jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_snapshot_v1(uuid,uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_event_snapshot_v1(bigint,uuid,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_batch_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_row_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_issue_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_event_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_require_audit_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_bootstrap_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_prepare_v1(
  jsonb,text,date,text,jsonb,uuid,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_detail_v1(jsonb,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_novelty_export_v1(jsonb,uuid) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_rows_valid_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_reject_change_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_assert_context_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_snapshot_v1(uuid,uuid,boolean)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_event_snapshot_v1(bigint,uuid,boolean)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_batch_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_row_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_issue_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_event_guard_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_require_audit_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_bootstrap_v1(jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_prepare_v1(
  jsonb,text,date,text,jsonb,uuid,text
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_detail_v1(jsonb,uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_novelty_export_v1(jsonb,uuid)
  FROM municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION public.payroll_novelty_bootstrap_v1(jsonb)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_prepare_v1(
  jsonb,text,date,text,jsonb,uuid,text
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_transition_v1(
  jsonb,uuid,text,integer,text,text,uuid,text
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_detail_v1(jsonb,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_export_v1(jsonb,uuid)
  TO municontrol_actions_runtime_app;
