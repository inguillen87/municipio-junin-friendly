-- MuniControl Friendly - Sprint 007A
-- Mayor esfuerzo gobernado como declaracion operativa. Esta fase no calcula,
-- liquida, publica ni escribe novedades en GRH. Las migraciones 003-007 son
-- prerequisitos inmutables y toda autoridad se revalida dentro de fachadas.

INSERT INTO iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES (
  'time.overtime.read',
  'Ver mayor esfuerzo',
  'Consulta declaraciones nominales de mayor esfuerzo bajo autoridad tenant explicita.',
  'tenant',
  'restricted'
)
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  sensitivity = EXCLUDED.sensitivity;

INSERT INTO iam_role (role_key, label, description, scope_kind) VALUES
  (
    'JUNIN_CONTADURIA_APROBADOR',
    'Contaduria - aprobacion de mayor esfuerzo',
    'Revisa declaraciones preparadas por Tesoreria; no carga ni impacta liquidaciones.',
    'tenant'
  )
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind;

INSERT INTO iam_role_capability (role_key, capability_key) VALUES
  ('JUNIN_TESORERIA_CARGA', 'actions.read'),
  ('JUNIN_TESORERIA_CARGA', 'time.overtime.read'),
  ('JUNIN_CONTADURIA_APROBADOR', 'actions.read'),
  ('JUNIN_CONTADURIA_APROBADOR', 'time.overtime.read'),
  ('JUNIN_CONTADURIA_APROBADOR', 'time.overtime.approve')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS action_overtime_reason_catalog (
  policy_version_id varchar(128) NOT NULL,
  reason_code varchar(64) NOT NULL,
  label varchar(160) NOT NULL,
  governance_status varchar(32) NOT NULL DEFAULT 'operational_provisional',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_version_id, reason_code),
  CONSTRAINT action_overtime_reason_policy_ck CHECK (
    policy_version_id = 'junin-mayor-esfuerzo-intake.v1'
  ),
  CONSTRAINT action_overtime_reason_code_ck CHECK (
    reason_code ~ '^[a-z][a-z0-9_]{2,63}$'
  ),
  CONSTRAINT action_overtime_reason_label_ck CHECK (
    length(btrim(label)) BETWEEN 3 AND 160
  ),
  CONSTRAINT action_overtime_reason_governance_ck CHECK (
    governance_status = 'operational_provisional'
  )
);

INSERT INTO action_overtime_reason_catalog (
  policy_version_id, reason_code, label, governance_status, active
) VALUES
  ('junin-mayor-esfuerzo-intake.v1', 'service_continuity', 'Continuidad operativa del servicio', 'operational_provisional', true),
  ('junin-mayor-esfuerzo-intake.v1', 'exceptional_demand', 'Demanda operativa excepcional', 'operational_provisional', true),
  ('junin-mayor-esfuerzo-intake.v1', 'emergency_response', 'Respuesta operativa ante una emergencia', 'operational_provisional', true),
  ('junin-mayor-esfuerzo-intake.v1', 'scheduled_public_activity', 'Actividad publica programada', 'operational_provisional', true),
  ('junin-mayor-esfuerzo-intake.v1', 'other_authorized', 'Otro motivo operativo autorizado', 'operational_provisional', true)
ON CONFLICT (policy_version_id, reason_code) DO UPDATE SET
  label = EXCLUDED.label,
  governance_status = EXCLUDED.governance_status,
  active = EXCLUDED.active;

CREATE TABLE IF NOT EXISTS action_overtime_decision_reason_catalog (
  decision_reason_code varchar(64) PRIMARY KEY,
  label varchar(160) NOT NULL,
  allowed_commands text[] NOT NULL,
  governance_status varchar(32) NOT NULL DEFAULT 'operational_provisional',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_overtime_decision_reason_code_ck CHECK (
    decision_reason_code IN (
      'validated_documentation', 'insufficient_evidence', 'entered_in_error', 'duplicate'
    )
  ),
  CONSTRAINT action_overtime_decision_reason_label_ck CHECK (
    length(btrim(label)) BETWEEN 3 AND 160
  ),
  CONSTRAINT action_overtime_decision_reason_commands_ck CHECK (
    cardinality(allowed_commands) > 0
    AND allowed_commands <@ ARRAY['approve', 'reject', 'cancel']::text[]
  ),
  CONSTRAINT action_overtime_decision_reason_governance_ck CHECK (
    governance_status = 'operational_provisional'
  )
);

INSERT INTO action_overtime_decision_reason_catalog (
  decision_reason_code, label, allowed_commands, governance_status, active
) VALUES
  ('validated_documentation', 'Documentacion validada', ARRAY['approve'], 'operational_provisional', true),
  ('insufficient_evidence', 'Evidencia insuficiente', ARRAY['reject'], 'operational_provisional', true),
  ('entered_in_error', 'Carga ingresada por error', ARRAY['reject', 'cancel'], 'operational_provisional', true),
  ('duplicate', 'Declaracion duplicada', ARRAY['reject', 'cancel'], 'operational_provisional', true)
ON CONFLICT (decision_reason_code) DO UPDATE SET
  label = EXCLUDED.label,
  allowed_commands = EXCLUDED.allowed_commands,
  governance_status = EXCLUDED.governance_status,
  active = EXCLUDED.active;

CREATE OR REPLACE FUNCTION action_center_valid_overtime_payload(p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  work_date date;
  declared_minutes integer;
  work_year integer;
  work_month integer;
  work_day integer;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
     OR NOT (p_payload ?& ARRAY['workDate', 'declaredMinutes', 'reasonCode'])
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
       WHERE field.key <> ALL(ARRAY['workDate', 'declaredMinutes', 'reasonCode'])
     )
     OR jsonb_typeof(p_payload->'workDate') <> 'string'
     OR (p_payload->>'workDate') !~ '^\d{4}-\d{2}-\d{2}$'
     OR jsonb_typeof(p_payload->'declaredMinutes') <> 'number'
     OR (p_payload->>'declaredMinutes') !~ '^[1-9]\d*$'
     OR jsonb_typeof(p_payload->'reasonCode') <> 'string'
     OR (p_payload->>'reasonCode') !~ '^[a-z][a-z0-9_]{2,63}$' THEN
    RETURN false;
  END IF;
  BEGIN
    work_year := substring(p_payload->>'workDate' FROM 1 FOR 4)::integer;
    work_month := substring(p_payload->>'workDate' FROM 6 FOR 2)::integer;
    work_day := substring(p_payload->>'workDate' FROM 9 FOR 2)::integer;
    work_date := make_date(work_year, work_month, work_day);
    declared_minutes := (p_payload->>'declaredMinutes')::integer;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow
      OR invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
  END;
  IF work_date IS NULL OR declared_minutes < 1 OR declared_minutes > 1440 THEN
    RETURN false;
  END IF;
  RETURN true;
END
$$;

DO $$
DECLARE
  source_status_column_count integer;
  source_status_v16_count integer;
  source_status_v24_count integer;
BEGIN
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(16)'
         )::integer,
         count(*) FILTER (
           WHERE format_type(attribute.atttypid, attribute.atttypmod) = 'character varying(24)'
         )::integer
    INTO source_status_column_count, source_status_v16_count, source_status_v24_count
  FROM (VALUES
    ('action_case'::text, 'status'::text),
    ('action_case_event'::text, 'from_status'::text),
    ('action_case_event'::text, 'to_status'::text)
  ) expected(table_name, column_name)
  JOIN pg_namespace namespace ON namespace.nspname = 'public'
  JOIN pg_class table_row
    ON table_row.relnamespace = namespace.oid AND table_row.relname = expected.table_name
  JOIN pg_attribute attribute
    ON attribute.attrelid = table_row.oid AND attribute.attname = expected.column_name
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE;

  IF source_status_column_count <> 3
     OR NOT (
       (source_status_v16_count = 3 AND source_status_v24_count = 0)
       OR (source_status_v16_count = 0 AND source_status_v24_count = 3)
     ) THEN
    RAISE EXCEPTION 'ACTION_STATUS_SOURCE_TYPE_DRIFT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class view_row
    JOIN pg_namespace namespace ON namespace.oid = view_row.relnamespace
    WHERE namespace.nspname = 'public'
      AND view_row.relname = 'vw_action_leave_request'
      AND view_row.relkind = 'v'
  ) THEN
    RAISE EXCEPTION 'ACTION_STATUS_SOURCE_VIEW_DRIFT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_depend dependency
    JOIN pg_rewrite rewrite
      ON dependency.classid = 'pg_rewrite'::regclass AND rewrite.oid = dependency.objid
    JOIN pg_class dependent_relation ON dependent_relation.oid = rewrite.ev_class
    WHERE dependency.refclassid = 'pg_class'::regclass
      AND dependency.refobjid = 'public.action_case'::regclass
      AND dependency.refobjsubid = (
        SELECT attribute.attnum
        FROM pg_attribute attribute
        WHERE attribute.attrelid = 'public.action_case'::regclass
          AND attribute.attname = 'status'
          AND attribute.attnum > 0
          AND attribute.attisdropped IS FALSE
      )
      AND dependent_relation.oid <> 'public.vw_action_leave_request'::regclass
  ) THEN
    RAISE EXCEPTION 'ACTION_STATUS_DEPENDENCY_DRIFT';
  END IF;
END
$$;

ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_type_ck;
ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_status_ck;
ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_policy_version_ck;
ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_submission_ck;
ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_decision_ck;
ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_approval_human_ck;
ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_overtime_payload_ck;
ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_overtime_confidentiality_ck;
ALTER TABLE action_case_event DROP CONSTRAINT IF EXISTS action_case_event_type_ck;
ALTER TABLE action_case_event DROP CONSTRAINT IF EXISTS action_case_event_status_ck;

-- PostgreSQL no permite ensanchar una columna proyectada por una vista. La vista
-- tipada 003 se elimina sin CASCADE (dependencias desconocidas deben fallar
-- cerrado) y se reconstruye de forma exacta dentro de esta misma transaccion.
DROP VIEW public.vw_action_leave_request;

ALTER TABLE action_case ALTER COLUMN status TYPE varchar(24);
ALTER TABLE action_case_event ALTER COLUMN from_status TYPE varchar(24);
ALTER TABLE action_case_event ALTER COLUMN to_status TYPE varchar(24);

CREATE VIEW public.vw_action_leave_request AS
SELECT action.id,
       action.case_number,
       action.beneficiary_contract_id,
       action.source_batch_id,
       action.company_id,
       action.organization_unit_source_id,
       action.sector_source_id,
       action.status,
       action.confidentiality,
       action.policy_version_id,
       action.payload->>'reasonCode' AS reason_code,
       NULLIF(action.payload->>'policyRuleId', '') AS policy_rule_id,
       (action.payload->>'startsOn')::date AS starts_on,
       (action.payload->>'endsOn')::date AS ends_on,
       NULLIF(action.payload->>'startsAtLocal', '')::time AS starts_at_local,
       NULLIF(action.payload->>'endsAtLocal', '')::time AS ends_at_local,
       action.payload->>'durationUnit' AS duration_unit,
       CASE
         WHEN action.payload->>'durationUnit' = 'calendar_day'
           THEN ((action.payload->>'endsOn')::date - (action.payload->>'startsOn')::date + 1)
         WHEN action.payload->>'durationUnit' = 'minute'
           THEN floor(extract(epoch FROM (
             NULLIF(action.payload->>'endsAtLocal', '')::time
             - NULLIF(action.payload->>'startsAtLocal', '')::time
           )) / 60)::integer
         ELSE NULL
       END AS duration_value,
       'America/Argentina/Mendoza'::text AS time_zone,
       action.evidence_status,
       action.created_by_user_email,
       action.submitted_by_user_email,
       action.submitted_at,
       action.decided_by_user_email,
       action.decided_at,
       action.cancelled_by_user_email,
       action.cancelled_at,
       action.version,
       action.created_at,
       action.updated_at
FROM public.action_case action
WHERE action.case_type = 'leave_request';

COMMENT ON VIEW public.vw_action_leave_request IS
  'Proyeccion tipada de licencias reconstruida por 008 tras ampliar status; no incluye mayor esfuerzo.';
REVOKE ALL PRIVILEGES ON TABLE public.vw_action_leave_request FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.vw_action_leave_request FROM municontrol_actions_runtime_app;

ALTER TABLE action_case ADD CONSTRAINT action_case_type_ck
  CHECK (case_type IN ('leave_request', 'overtime_entry'));
ALTER TABLE action_case ADD CONSTRAINT action_case_status_ck CHECK (
  (case_type = 'leave_request'
    AND status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'))
  OR (case_type = 'overtime_entry'
    AND status IN ('draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'))
);
ALTER TABLE action_case ADD CONSTRAINT action_case_policy_version_ck CHECK (
  (case_type = 'leave_request' AND policy_version_id = 'mendoza-ley-5811-title-vi.v1')
  OR (case_type = 'overtime_entry' AND policy_version_id = 'junin-mayor-esfuerzo-intake.v1')
);
ALTER TABLE action_case ADD CONSTRAINT action_case_submission_ck CHECK (
  status NOT IN ('submitted', 'approved', 'pending_time_rules', 'rejected')
  OR (submitted_by_user_email IS NOT NULL AND submitted_at IS NOT NULL)
);
ALTER TABLE action_case ADD CONSTRAINT action_case_decision_ck CHECK (
  status NOT IN ('approved', 'pending_time_rules', 'rejected')
  OR (
    decided_by_user_email IS NOT NULL
    AND decided_at IS NOT NULL
    AND length(btrim(decision_reason)) > 0
  )
);
ALTER TABLE action_case ADD CONSTRAINT action_case_approval_human_ck CHECK (
  status NOT IN ('approved', 'pending_time_rules')
  OR (
    manual_validation_confirmed IS TRUE
    AND evidence_status IN ('verified', 'not_required')
    AND (
      (case_type = 'leave_request'
        AND (confidentiality = 'standard' OR evidence_status = 'verified'))
      OR (case_type = 'overtime_entry' AND evidence_status = 'verified')
    )
  )
);
ALTER TABLE action_case ADD CONSTRAINT action_case_overtime_payload_ck CHECK (
  case_type <> 'overtime_entry'
  OR action_center_valid_overtime_payload(payload) IS TRUE
);
ALTER TABLE action_case ADD CONSTRAINT action_case_overtime_confidentiality_ck CHECK (
  case_type <> 'overtime_entry' OR confidentiality = 'restricted'
);

ALTER TABLE action_case_event ADD CONSTRAINT action_case_event_type_ck CHECK (
  (case_type = 'leave_request' AND event_type IN (
    'created', 'draft_updated', 'submitted', 'approved', 'rejected', 'cancelled'
  ))
  OR (case_type = 'overtime_entry' AND event_type IN (
    'created', 'draft_updated', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'
  ))
);
ALTER TABLE action_case_event ADD CONSTRAINT action_case_event_status_ck CHECK (
  (case_type = 'leave_request'
    AND (from_status IS NULL OR from_status IN (
      'draft', 'submitted', 'approved', 'rejected', 'cancelled'
    ))
    AND to_status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'))
  OR (case_type = 'overtime_entry'
    AND (from_status IS NULL OR from_status IN (
      'draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'
    ))
    AND to_status IN ('draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS action_case_overtime_active_entry_uk
  ON action_case (
    tenant_id,
    source_binding_id,
    beneficiary_contract_id,
    (payload->>'workDate')
  )
  WHERE case_type = 'overtime_entry'
    AND status IN ('draft', 'submitted', 'pending_time_rules');

CREATE OR REPLACE FUNCTION action_center_validate_case_update()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id <> OLD.id OR NEW.case_number <> OLD.case_number OR NEW.case_type <> OLD.case_type
     OR NEW.tenant_id <> OLD.tenant_id OR NEW.source_binding_id <> OLD.source_binding_id
     OR NEW.beneficiary_contract_id <> OLD.beneficiary_contract_id
     OR NEW.source_batch_id <> OLD.source_batch_id OR NEW.company_id <> OLD.company_id
     OR NEW.organization_unit_source_id IS DISTINCT FROM OLD.organization_unit_source_id
     OR NEW.sector_source_id IS DISTINCT FROM OLD.sector_source_id
     OR NEW.created_by_user_email <> OLD.created_by_user_email OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'ACTION_CASE_IMMUTABLE_FIELDS' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.payload IS DISTINCT FROM OLD.payload AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'ACTION_CASE_PAYLOAD_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.case_type = 'leave_request' AND (
      (OLD.status = 'draft' AND NEW.status IN ('submitted', 'cancelled'))
      OR (OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected', 'cancelled'))
      OR (OLD.status = 'approved' AND NEW.status = 'cancelled')
    ))
    OR (OLD.case_type = 'overtime_entry' AND (
      (OLD.status = 'draft' AND NEW.status IN ('submitted', 'cancelled'))
      OR (OLD.status = 'submitted' AND NEW.status IN ('pending_time_rules', 'rejected', 'cancelled'))
    ))
  ) THEN
    RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'ACTION_VERSION_INCREMENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION action_center_valid_overtime_decision_reason_v1(
  p_command text,
  p_decision_reason_code text
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1
  FROM action_overtime_decision_reason_catalog reason
  WHERE reason.decision_reason_code = p_decision_reason_code
    AND p_command = ANY(reason.allowed_commands)
    AND reason.governance_status = 'operational_provisional'
    AND reason.active IS TRUE
  FOR SHARE;
  RETURN FOUND;
END
$$;

CREATE OR REPLACE FUNCTION action_center_overtime_decider_separated_v1(
  p_case_id uuid,
  p_tenant_id uuid,
  p_source_binding_id uuid,
  p_actor_email text,
  p_actor_person_id uuid
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_actor_person_id IS NOT NULL
    AND lower(action.created_by_user_email) <> lower(btrim(p_actor_email))
    AND lower(COALESCE(action.submitted_by_user_email, '')) <> lower(btrim(p_actor_email))
    AND beneficiary.person_id <> p_actor_person_id
    AND NOT EXISTS (
      SELECT 1
      FROM action_case_event preparation
      WHERE preparation.case_id = action.id
        AND preparation.tenant_id = action.tenant_id
        AND preparation.source_binding_id = action.source_binding_id
        AND preparation.event_type IN ('created', 'draft_updated', 'submitted')
        AND (
          preparation.actor_person_id IS NULL
          OR preparation.actor_person_id = p_actor_person_id
        )
    )
  FROM action_case action
  JOIN employment_contract beneficiary
    ON beneficiary.id = action.beneficiary_contract_id
  WHERE action.id = p_case_id
    AND action.case_type = 'overtime_entry'
    AND action.tenant_id = p_tenant_id
    AND action.source_binding_id = p_source_binding_id
$$;

CREATE OR REPLACE FUNCTION action_center_overtime_mutation_context_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  user_row internal_users%ROWTYPE;
  membership_row tenant_membership%ROWTYPE;
  session_row tenant_identity_session%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  binding_row platform_tenant_source_binding%ROWTYPE;
  authority_row tenant_action_authority%ROWTYPE;
  actor_contract_id uuid;
  actor_person_id uuid;
BEGIN
  IF p_actor_session_id IS NULL
     OR p_actor_session_version IS NULL OR p_actor_session_version < 1
     OR p_tenant_id IS NULL OR p_membership_id IS NULL OR p_idempotency_key IS NULL
     OR lower(COALESCE(p_release_sha, '')) !~ '^[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO user_row
  FROM internal_users users
  WHERE lower(users.email) = lower(btrim(p_actor_email))
    AND users.active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO membership_row
  FROM tenant_membership membership
  WHERE membership.id = p_membership_id
    AND membership.tenant_id = p_tenant_id
    AND lower(membership.user_email) = lower(user_row.email)
    AND membership.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO session_row
  FROM tenant_identity_session identity_session
  WHERE identity_session.id = p_actor_session_id
    AND identity_session.session_version = p_actor_session_version
    AND lower(identity_session.user_email) = lower(user_row.email)
    AND identity_session.identity_version = user_row.identity_version
    AND identity_session.active_tenant_id = p_tenant_id
    AND identity_session.source = 'membership'
    AND identity_session.auth_level IN ('mfa', 'recovery')
    AND identity_session.status = 'active'
    AND identity_session.expires_at > now()
    AND identity_session.last_seen_at > now() - interval '1 hour'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM platform_tenant tenant
  WHERE tenant.id = membership_row.tenant_id
    AND tenant.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO policy_row
  FROM tenant_identity_policy policy
  WHERE policy.tenant_id = membership_row.tenant_id
    AND policy.tenant_data_plane_ready IS TRUE
    AND lower(policy.certified_release_sha) = lower(p_release_sha)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO binding_row
  FROM platform_tenant_source_binding binding
  WHERE binding.id = policy_row.certified_source_binding_id
    AND binding.tenant_id = membership_row.tenant_id
    AND binding.source_system = 'GRH'
    AND binding.verified IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Orden compartido con provisioning 006: membership -> advisory -> authority
  -- -> employment link. Evita que una revocacion compita con una escritura ya
  -- autorizada o que dos reintentos creen eventos distintos.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    lower(user_row.email) || ':' || membership_row.tenant_id::text || ':' || p_idempotency_key::text,
    0
  ));

  SELECT * INTO authority_row
  FROM tenant_action_authority authority
  WHERE authority.membership_id = membership_row.id
    AND authority.tenant_id = membership_row.tenant_id
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_TENANT_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT link.employment_contract_id, contract.person_id
    INTO actor_contract_id, actor_person_id
  FROM tenant_action_employment_link link
  JOIN employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = binding_row.source_company_id
  JOIN source_import_batch batch
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
  IF actor_contract_id IS NULL OR actor_person_id IS NULL THEN
    RAISE EXCEPTION 'ACTION_TENANT_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM tenant_iam_assert_no_sod_conflict(membership_row.id);
  IF NOT EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities(membership_row.id) effective
    WHERE effective.capability_key = 'actions.read'
  ) THEN
    RAISE EXCEPTION 'ACTION_TENANT_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'email', lower(user_row.email),
    'tenantId', membership_row.tenant_id,
    'membershipId', membership_row.id,
    'roleKey', membership_row.role_key,
    'sourceBindingId', binding_row.id,
    'sourceCompanyId', binding_row.source_company_id,
    'sourceDatabase', binding_row.source_database,
    'actorEmploymentContractId', actor_contract_id,
    'actorPersonId', actor_person_id
  );
EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'ACTION_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION action_center_apply_overtime_command_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_command text,
  p_case_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_command_hash text,
  p_payload jsonb,
  p_beneficiary_contract_id uuid,
  p_policy_version_id text,
  p_decision_reason_code text,
  p_evidence_status text,
  p_manual_validation_confirmed boolean
)
RETURNS TABLE (
  case_id uuid,
  case_number bigint,
  current_status varchar(24),
  current_version integer,
  replayed boolean
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  binding_id uuid;
  source_company_id bigint;
  binding_source_database text;
  actor_contract_id uuid;
  actor_person_id uuid;
  actor_role text;
  existing_event action_case_event%ROWTYPE;
  current_case action_case%ROWTYPE;
  contract employment_contract%ROWTYPE;
  previous_status varchar(24);
  next_status varchar(24);
  next_event varchar(32);
  event_metadata jsonb;
  requires_exclusive boolean;
BEGIN
  IF p_command NOT IN ('create', 'update_draft', 'submit', 'approve', 'reject', 'cancel')
     OR p_idempotency_key IS NULL
     OR COALESCE(p_command_hash, '') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_command = 'create' THEN
    IF p_case_id IS NOT NULL OR p_expected_version IS NOT NULL
       OR p_beneficiary_contract_id IS NULL
       OR p_policy_version_id <> 'junin-mayor-esfuerzo-intake.v1'
       OR action_center_valid_overtime_payload(p_payload) IS DISTINCT FROM true
       OR p_decision_reason_code IS NOT NULL OR p_evidence_status IS NOT NULL
       OR p_manual_validation_confirmed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command = 'update_draft' THEN
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
       OR p_beneficiary_contract_id IS NOT NULL
       OR p_policy_version_id <> 'junin-mayor-esfuerzo-intake.v1'
       OR action_center_valid_overtime_payload(p_payload) IS DISTINCT FROM true
       OR p_decision_reason_code IS NOT NULL OR p_evidence_status IS NOT NULL
       OR p_manual_validation_confirmed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command = 'submit' THEN
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
       OR p_payload IS NOT NULL OR p_beneficiary_contract_id IS NOT NULL
       OR p_policy_version_id IS NOT NULL OR p_decision_reason_code IS NOT NULL
       OR p_evidence_status IS NOT NULL OR p_manual_validation_confirmed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command = 'approve' THEN
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
       OR p_payload IS NOT NULL OR p_beneficiary_contract_id IS NOT NULL
       OR p_policy_version_id IS NOT NULL
       OR p_decision_reason_code <> 'validated_documentation'
       OR p_evidence_status <> 'verified'
       OR p_manual_validation_confirmed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command IN ('reject', 'cancel') THEN
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
       OR p_payload IS NOT NULL OR p_beneficiary_contract_id IS NOT NULL
       OR p_policy_version_id IS NOT NULL OR p_decision_reason_code IS NULL
       OR p_evidence_status IS NOT NULL OR p_manual_validation_confirmed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  context_value := action_center_overtime_mutation_context_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id, p_idempotency_key
  );
  binding_id := (context_value->>'sourceBindingId')::uuid;
  source_company_id := (context_value->>'sourceCompanyId')::bigint;
  binding_source_database := context_value->>'sourceDatabase';
  actor_contract_id := (context_value->>'actorEmploymentContractId')::uuid;
  actor_person_id := (context_value->>'actorPersonId')::uuid;
  actor_role := context_value->>'roleKey';
  requires_exclusive := p_command IN ('create', 'update_draft', 'submit', 'cancel');

  IF p_command IN ('create', 'update_draft') THEN
    PERFORM 1
    FROM action_overtime_reason_catalog reason
    WHERE reason.policy_version_id = p_policy_version_id
      AND reason.reason_code = p_payload->>'reasonCode'
      AND reason.governance_status = 'operational_provisional'
      AND reason.active IS TRUE
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'OVERTIME_REASON_NOT_AVAILABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF requires_exclusive THEN
    IF NOT EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) effective
      WHERE effective.capability_key = 'time.overtime.enter'
    ) THEN
      RAISE EXCEPTION 'OVERTIME_EXCLUSIVE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1
    FROM tenant_exclusive_capability assignment
    WHERE assignment.tenant_id = p_tenant_id
      AND assignment.capability_key = 'time.overtime.enter'
      AND assignment.membership_id = p_membership_id
      AND assignment.active IS TRUE
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'OVERTIME_EXCLUSIVE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) effective
      WHERE effective.capability_key = 'time.overtime.approve'
    ) THEN
      RAISE EXCEPTION 'OVERTIME_APPROVAL_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT * INTO existing_event
  FROM action_case_event event
  WHERE lower(event.actor_user_email) = lower(context_value->>'email')
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.command_hash <> p_command_hash
       OR existing_event.case_type <> 'overtime_entry'
       OR existing_event.tenant_id <> p_tenant_id
       OR existing_event.source_binding_id <> binding_id
       OR existing_event.actor_membership_id <> p_membership_id
       OR existing_event.actor_person_id IS DISTINCT FROM actor_person_id
       OR existing_event.metadata->>'command' <> p_command
       OR existing_event.metadata->>'tenantId' <> p_tenant_id::text
       OR existing_event.metadata->>'sourceBindingId' <> binding_id::text
       OR existing_event.metadata->>'membershipId' <> p_membership_id::text
       OR existing_event.metadata->>'actorSessionId' <> p_actor_session_id::text
       OR existing_event.metadata->>'actorSessionVersion' <> p_actor_session_version::text
       OR existing_event.metadata->>'releaseSha' <> lower(p_release_sha)
       OR (p_case_id IS NOT NULL AND existing_event.case_id <> p_case_id) THEN
      RAISE EXCEPTION 'ACTION_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_case
    FROM action_case action
    WHERE action.id = existing_event.case_id
      AND action.case_type = 'overtime_entry'
      AND action.tenant_id = p_tenant_id
      AND action.source_binding_id = binding_id
      AND action.company_id = source_company_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF p_command IN ('approve', 'reject') AND NOT action_center_overtime_decider_separated_v1(
      current_case.id, p_tenant_id, binding_id, context_value->>'email', actor_person_id
    ) THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    case_id := current_case.id;
    case_number := current_case.case_number;
    current_status := existing_event.to_status;
    current_version := existing_event.case_version;
    replayed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_command = 'create' THEN
    SELECT contract_row.* INTO contract
    FROM employment_contract contract_row
    JOIN source_import_batch batch
      ON batch.id = contract_row.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding_source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE contract_row.id = p_beneficiary_contract_id
      AND contract_row.status = 'active'
      AND contract_row.source_system = 'GRH'
      AND contract_row.legacy_company_id = source_company_id
    FOR SHARE OF contract_row, batch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    next_status := 'draft';
    next_event := 'created';
    event_metadata := jsonb_strip_nulls(jsonb_build_object(
      'command', p_command,
      'tenantId', p_tenant_id,
      'sourceBindingId', binding_id,
      'membershipId', p_membership_id,
      'actorSessionId', p_actor_session_id,
      'actorSessionVersion', p_actor_session_version,
      'releaseSha', lower(p_release_sha),
      'policyVersionId', p_policy_version_id,
      'reasonPresent', false,
      'manualValidationConfirmed', false,
      'payrollCalculated', false,
      'payrollPosted', false
    ));
    PERFORM action_center_set_tenant_command_context(
      context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
      actor_contract_id, actor_person_id, next_event,
      p_idempotency_key, p_command_hash, event_metadata
    );
    INSERT INTO action_case (
      tenant_id, source_binding_id, case_type, beneficiary_contract_id, source_batch_id,
      company_id, organization_unit_source_id, sector_source_id,
      status, confidentiality, policy_version_id, payload,
      evidence_status, created_by_user_email
    ) VALUES (
      p_tenant_id, binding_id, 'overtime_entry', contract.id, contract.source_batch_id,
      contract.legacy_company_id, contract.organization_unit_source_id, contract.sector_source_id,
      'draft', 'restricted', p_policy_version_id, p_payload,
      'pending', context_value->>'email'
    ) RETURNING * INTO current_case;
  ELSE
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
      RAISE EXCEPTION 'ACTION_VERSION_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_case
    FROM action_case action
    WHERE action.id = p_case_id
      AND action.case_type = 'overtime_entry'
      AND action.tenant_id = p_tenant_id
      AND action.source_binding_id = binding_id
      AND action.company_id = source_company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF current_case.version <> p_expected_version THEN
      RAISE EXCEPTION 'ACTION_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    previous_status := current_case.status;
    event_metadata := jsonb_build_object(
      'command', p_command,
      'tenantId', p_tenant_id,
      'sourceBindingId', binding_id,
      'membershipId', p_membership_id,
      'actorSessionId', p_actor_session_id,
      'actorSessionVersion', p_actor_session_version,
      'releaseSha', lower(p_release_sha),
      'policyVersionId', current_case.policy_version_id,
      'decisionReasonCode', CASE WHEN p_command IN ('approve', 'reject', 'cancel')
        THEN p_decision_reason_code END,
      'reasonPresent', CASE WHEN p_command IN ('approve', 'reject', 'cancel') THEN true END,
      'evidenceStatus', CASE WHEN p_command = 'approve' THEN 'verified' END,
      'manualValidationConfirmed', CASE WHEN p_command = 'approve' THEN true END,
      'payrollCalculated', false,
      'payrollPosted', false
    );

    IF p_command = 'update_draft' THEN
      IF current_case.status <> 'draft' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'draft';
      next_event := 'draft_updated';
      PERFORM action_center_set_tenant_command_context(
        context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
        actor_contract_id, actor_person_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case
      SET payload = p_payload,
        policy_version_id = p_policy_version_id,
        confidentiality = 'restricted',
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSIF p_command = 'submit' THEN
      IF current_case.status <> 'draft' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'submitted';
      next_event := 'submitted';
      PERFORM action_center_set_tenant_command_context(
        context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
        actor_contract_id, actor_person_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case
      SET status = 'submitted',
        submitted_by_user_email = context_value->>'email',
        submitted_at = now(),
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSIF p_command IN ('approve', 'reject') THEN
      IF current_case.status <> 'submitted' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      IF NOT action_center_overtime_decider_separated_v1(
        current_case.id, p_tenant_id, binding_id, context_value->>'email', actor_person_id
      ) THEN
        RAISE EXCEPTION 'ACTION_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
      END IF;
      IF action_center_valid_overtime_decision_reason_v1(
        p_command, p_decision_reason_code
      ) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'ACTION_DECISION_REASON_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      IF p_command = 'approve' AND (
        p_manual_validation_confirmed IS DISTINCT FROM true
        OR p_evidence_status <> 'verified'
      ) THEN
        RAISE EXCEPTION 'ACTION_MANUAL_VALIDATION_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      next_status := CASE WHEN p_command = 'approve' THEN 'pending_time_rules' ELSE 'rejected' END;
      next_event := next_status;
      PERFORM action_center_set_tenant_command_context(
        context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
        actor_contract_id, actor_person_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case
      SET status = next_status,
        decided_by_user_email = context_value->>'email',
        decided_at = now(),
        decision_reason = p_decision_reason_code,
        evidence_status = CASE WHEN p_command = 'approve' THEN 'verified' ELSE evidence_status END,
        manual_validation_confirmed = p_command = 'approve',
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSIF p_command = 'cancel' THEN
      IF current_case.status NOT IN ('draft', 'submitted') THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      IF action_center_valid_overtime_decision_reason_v1(
        p_command, p_decision_reason_code
      ) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'ACTION_CANCELLATION_REASON_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'cancelled';
      next_event := 'cancelled';
      PERFORM action_center_set_tenant_command_context(
        context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
        actor_contract_id, actor_person_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case
      SET status = 'cancelled',
        cancelled_by_user_email = context_value->>'email',
        cancelled_at = now(),
        cancellation_reason = p_decision_reason_code,
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSE
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  case_id := current_case.id;
  case_number := current_case.case_number;
  current_status := current_case.status;
  current_version := current_case.version;
  replayed := false;
  RETURN NEXT;
END
$$;

CREATE OR REPLACE FUNCTION action_center_overtime_read_context_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE context_value jsonb;
BEGIN
  context_value := action_center_assert_tenant_read_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  IF COALESCE(context_value->>'employmentContractId', '') = ''
     OR COALESCE(context_value->>'actorPersonId', '') = ''
     OR NOT action_center_context_has_capability(context_value, 'time.overtime.read') THEN
    RAISE EXCEPTION 'OVERTIME_READ_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  RETURN context_value;
END
$$;

CREATE OR REPLACE FUNCTION action_center_overtime_has_exclusive_entry_v1(p_context jsonb)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT action_center_context_has_capability(p_context, 'time.overtime.enter')
    AND EXISTS (
      SELECT 1
      FROM tenant_exclusive_capability assignment
      WHERE assignment.tenant_id = (p_context->>'tenantId')::uuid
        AND assignment.capability_key = 'time.overtime.enter'
        AND assignment.membership_id = (p_context->>'membershipId')::uuid
        AND assignment.active IS TRUE
    )
$$;

CREATE OR REPLACE FUNCTION action_center_overtime_bootstrap_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_subject_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  normalized_query text := btrim(COALESCE(p_subject_query, ''));
  escaped_query text;
  subjects_value jsonb := '[]'::jsonb;
  reasons_value jsonb := '[]'::jsonb;
  decision_reasons_value jsonb := '[]'::jsonb;
  source_value jsonb;
  result_count integer := 0;
  can_enter boolean := false;
BEGIN
  context_value := action_center_overtime_read_context_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  IF normalized_query <> ''
     AND (char_length(normalized_query) < 2 OR char_length(normalized_query) > 50) THEN
    RAISE EXCEPTION 'ACTION_SUBJECT_QUERY_INVALID' USING ERRCODE = 'P0001';
  END IF;
  escaped_query := replace(replace(replace(normalized_query, '\', '\\'), '%', '\%'), '_', '\_');
  can_enter := action_center_overtime_has_exclusive_entry_v1(context_value);

  IF normalized_query <> '' AND can_enter THEN
    WITH candidates AS MATERIALIZED (
      SELECT contract.id,
        contract.legacy_legajo,
        COALESCE(NULLIF(employee.nombre, ''), NULLIF(identity.full_name, ''), 'Nombre no informado') AS display_name,
        COALESCE(NULLIF(employee.sector, ''), 'Sector no informado') AS sector
      FROM employment_contract contract
      JOIN source_import_batch batch
        ON batch.id = contract.source_batch_id
       AND batch.source_system = 'GRH'
       AND batch.source_database = context_value->>'sourceDatabase'
       AND batch.validation_state = 'published'
       AND batch.legacy_import_run_id IS NOT NULL
      JOIN person_identity identity ON identity.id = contract.person_id
      LEFT JOIN grh_employees employee
        ON employee.company_id = contract.legacy_company_id
       AND employee.legajo = contract.legacy_legajo
       AND employee.import_run_id = batch.legacy_import_run_id
      WHERE contract.status = 'active'
        AND contract.source_system = 'GRH'
        AND contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint
        AND (
          contract.legacy_legajo ILIKE '%' || escaped_query || '%' ESCAPE '\'
          OR COALESCE(employee.nombre, identity.full_name, '') ILIKE '%' || escaped_query || '%' ESCAPE '\'
          OR COALESCE(employee.sector, '') ILIKE '%' || escaped_query || '%' ESCAPE '\'
        )
    ), page_rows AS (
      SELECT jsonb_build_object(
        'contractId', id,
        'displayName', display_name,
        'legajo', legacy_legajo,
        'sector', sector,
        'accessBasis', 'exclusive_entry'
      ) AS item,
      display_name,
      legacy_legajo,
      id
      FROM candidates
      ORDER BY display_name, legacy_legajo, id
      LIMIT 51
    )
    SELECT COALESCE(jsonb_agg(item ORDER BY display_name, legacy_legajo, id), '[]'::jsonb),
      count(*)::integer
      INTO subjects_value, result_count
    FROM page_rows;
    IF result_count > 50 THEN subjects_value := subjects_value - 50; END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'reasonCode', reason.reason_code,
      'label', reason.label,
      'governanceStatus', reason.governance_status
    ) ORDER BY reason.label, reason.reason_code), '[]'::jsonb)
    INTO reasons_value
  FROM action_overtime_reason_catalog reason
  WHERE reason.policy_version_id = 'junin-mayor-esfuerzo-intake.v1'
    AND reason.governance_status = 'operational_provisional'
    AND reason.active IS TRUE;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'decisionReasonCode', reason.decision_reason_code,
      'label', reason.label,
      'allowedCommands', to_jsonb(reason.allowed_commands)
    ) ORDER BY reason.label, reason.decision_reason_code), '[]'::jsonb)
    INTO decision_reasons_value
  FROM action_overtime_decision_reason_catalog reason
  WHERE reason.governance_status = 'operational_provisional'
    AND reason.active IS TRUE;

  WITH published AS (
    SELECT batch.*
    FROM source_import_batch batch
    WHERE batch.source_system = 'GRH'
      AND batch.source_database = context_value->>'sourceDatabase'
      AND batch.validation_state = 'published'
      AND batch.legacy_import_run_id IS NOT NULL
    ORDER BY batch.source_cutoff DESC, batch.recorded_at DESC, batch.id DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'label', 'GRH canonica',
    'cutoff', published.source_cutoff,
    'version', 'snapshot publicado'
  ) INTO source_value
  FROM published;

  IF source_value IS NULL THEN
    RAISE EXCEPTION 'ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_array_length(reasons_value) = 0 THEN
    RAISE EXCEPTION 'OVERTIME_FEATURE_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'principal', context_value,
    'source', source_value,
    'feature', jsonb_build_object(
      'caseType', 'overtime_entry',
      'policyVersionId', 'junin-mayor-esfuerzo-intake.v1',
      'governanceStatus', 'operational_provisional',
      'canEnter', can_enter,
      'canDecide', action_center_context_has_capability(context_value, 'time.overtime.approve'),
      'calculated', false,
      'posted', false
    ),
    'subjects', subjects_value,
    'subjectsTruncated', result_count > 50,
    'reasonRows', reasons_value,
    'decisionReasonRows', decision_reasons_value
  );
END
$$;

CREATE OR REPLACE FUNCTION action_center_overtime_list_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_status text,
  p_page integer,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  normalized_status text := NULLIF(lower(btrim(COALESCE(p_status, ''))), '');
  records_value jsonb := '[]'::jsonb;
  total_value integer := 0;
BEGIN
  context_value := action_center_overtime_read_context_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  IF normalized_status IS NOT NULL
     AND normalized_status NOT IN (
       'draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'
     ) THEN
    RAISE EXCEPTION 'ACTION_STATUS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 200
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'ACTION_PAGINATION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  WITH candidate AS MATERIALIZED (
    SELECT action.id, action.case_number, action.case_type, action.beneficiary_contract_id,
      action.status, action.confidentiality, action.policy_version_id, action.payload,
      action.evidence_status, action.updated_at, action.version,
      contract.legacy_legajo, contract.person_id,
      batch.legacy_import_run_id
    FROM action_case action
    JOIN employment_contract contract
      ON contract.id = action.beneficiary_contract_id
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = action.company_id
     AND contract.source_batch_id = action.source_batch_id
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = context_value->>'sourceDatabase'
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE action.case_type = 'overtime_entry'
      AND action.tenant_id = (context_value->>'tenantId')::uuid
      AND action.source_binding_id = (context_value->>'sourceBindingId')::uuid
      AND action.company_id = (context_value->>'sourceCompanyId')::bigint
      AND (normalized_status IS NULL OR action.status = normalized_status)
  ), page_rows AS MATERIALIZED (
    SELECT candidate.*
    FROM candidate
    ORDER BY updated_at DESC, id DESC
    OFFSET (p_page - 1) * p_limit
    LIMIT p_limit
  ), projected AS (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'id', page.id,
      'caseNumber', page.case_number,
      'caseType', page.case_type,
      'beneficiaryContractId', page.beneficiary_contract_id,
      'subject', jsonb_build_object(
        'contractId', page.beneficiary_contract_id,
        'displayName', COALESCE(NULLIF(employee.nombre, ''), NULLIF(identity.full_name, ''), 'Nombre no informado'),
        'legajo', page.legacy_legajo,
        'sector', COALESCE(NULLIF(employee.sector, ''), 'Sector no informado')
      ),
      'status', page.status,
      'confidentiality', page.confidentiality,
      'policyVersionId', page.policy_version_id,
      'payload', jsonb_build_object(
        'workDate', page.payload->>'workDate',
        'declaredMinutes', (page.payload->>'declaredMinutes')::integer,
        'reasonCode', page.payload->>'reasonCode'
      ),
      'evidenceStatus', page.evidence_status,
      'updatedAt', page.updated_at,
      'version', page.version,
      'payrollImpact', jsonb_build_object(
        'amount', NULL,
        'rate', NULL,
        'calculated', false,
        'posted', false,
        'attendanceReconciled', false
      ),
      'projection', 'restricted_nominal'
    )) AS item, page.updated_at, page.id
    FROM page_rows page
    JOIN person_identity identity ON identity.id = page.person_id
    LEFT JOIN grh_employees employee
      ON employee.company_id = (context_value->>'sourceCompanyId')::bigint
     AND employee.legajo = page.legacy_legajo
     AND employee.import_run_id = page.legacy_import_run_id
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY updated_at DESC, id DESC), '[]'::jsonb),
    (SELECT count(*)::integer FROM candidate)
    INTO records_value, total_value
  FROM projected;

  RETURN jsonb_build_object(
    'principal', context_value,
    'records', records_value,
    'total', total_value
  );
END
$$;

CREATE OR REPLACE FUNCTION action_center_overtime_detail_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  action_row action_case%ROWTYPE;
  contract_row employment_contract%ROWTYPE;
  batch_row source_import_batch%ROWTYPE;
  subject_name text;
  subject_sector text;
  reason_label text;
  decision_reason_label text;
  cancellation_reason_label text;
  timeline_value jsonb := '[]'::jsonb;
  commands_value jsonb := '[]'::jsonb;
  exclusive_entry boolean := false;
  separated_decider boolean := false;
BEGIN
  context_value := action_center_overtime_read_context_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );

  SELECT * INTO action_row
  FROM action_case action
  WHERE action.id = p_case_id
    AND action.case_type = 'overtime_entry'
    AND action.tenant_id = (context_value->>'tenantId')::uuid
    AND action.source_binding_id = (context_value->>'sourceBindingId')::uuid
    AND action.company_id = (context_value->>'sourceCompanyId')::bigint
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL);
  END IF;

  SELECT contract.* INTO contract_row
  FROM employment_contract contract
  WHERE contract.id = action_row.beneficiary_contract_id
    AND contract.source_system = 'GRH'
    AND contract.source_batch_id = action_row.source_batch_id
    AND contract.legacy_company_id = action_row.company_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL);
  END IF;

  SELECT * INTO batch_row
  FROM source_import_batch batch
  WHERE batch.id = contract_row.source_batch_id
    AND batch.source_system = 'GRH'
    AND batch.source_database = context_value->>'sourceDatabase'
    AND batch.validation_state = 'published'
    AND batch.legacy_import_run_id IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL);
  END IF;

  SELECT COALESCE(NULLIF(employee.nombre, ''), NULLIF(identity.full_name, ''), 'Nombre no informado'),
    COALESCE(NULLIF(employee.sector, ''), 'Sector no informado')
    INTO subject_name, subject_sector
  FROM person_identity identity
  LEFT JOIN grh_employees employee
    ON employee.company_id = contract_row.legacy_company_id
   AND employee.legajo = contract_row.legacy_legajo
   AND employee.import_run_id = batch_row.legacy_import_run_id
  WHERE identity.id = contract_row.person_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL);
  END IF;

  SELECT reason.label INTO reason_label
  FROM action_overtime_reason_catalog reason
  WHERE reason.policy_version_id = action_row.policy_version_id
    AND reason.reason_code = action_row.payload->>'reasonCode';
  SELECT reason.label INTO decision_reason_label
  FROM action_overtime_decision_reason_catalog reason
  WHERE reason.decision_reason_code = action_row.decision_reason;
  SELECT reason.label INTO cancellation_reason_label
  FROM action_overtime_decision_reason_catalog reason
  WHERE reason.decision_reason_code = action_row.cancellation_reason;

  exclusive_entry := action_center_overtime_has_exclusive_entry_v1(context_value);
  separated_decider := action_center_overtime_decider_separated_v1(
    action_row.id,
    (context_value->>'tenantId')::uuid,
    (context_value->>'sourceBindingId')::uuid,
    context_value->>'email',
    (context_value->>'actorPersonId')::uuid
  );
  IF action_row.status = 'draft' AND exclusive_entry THEN
    commands_value := jsonb_build_array('update_draft', 'submit', 'cancel');
  ELSIF action_row.status = 'submitted' THEN
    IF action_center_context_has_capability(context_value, 'time.overtime.approve')
       AND separated_decider THEN
      commands_value := commands_value || jsonb_build_array('approve', 'reject');
    END IF;
    IF exclusive_entry THEN
      commands_value := commands_value || jsonb_build_array('cancel');
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', event.id,
      'caseVersion', event.case_version,
      'eventType', event.event_type,
      'fromStatus', event.from_status,
      'toStatus', event.to_status,
      'actorRole', event.actor_role,
      'metadata', jsonb_strip_nulls(jsonb_build_object(
        'command', event.metadata->>'command',
        'decisionReasonCode', event.metadata->>'decisionReasonCode',
        'reasonPresent', CASE WHEN event.metadata ? 'reasonPresent'
          THEN (event.metadata->>'reasonPresent')::boolean END,
        'evidenceStatus', event.metadata->>'evidenceStatus',
        'manualValidationConfirmed', CASE WHEN event.metadata ? 'manualValidationConfirmed'
          THEN (event.metadata->>'manualValidationConfirmed')::boolean END,
        'payrollCalculated', false,
        'payrollPosted', false
      )),
      'occurredAt', event.occurred_at
    )) ORDER BY event.id), '[]'::jsonb)
    INTO timeline_value
  FROM action_case_event event
  WHERE event.case_id = action_row.id
    AND event.case_type = 'overtime_entry'
    AND event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.source_binding_id = (context_value->>'sourceBindingId')::uuid;

  RETURN jsonb_build_object(
    'principal', context_value,
    'record', jsonb_strip_nulls(jsonb_build_object(
      'id', action_row.id,
      'caseNumber', action_row.case_number,
      'caseType', action_row.case_type,
      'beneficiaryContractId', action_row.beneficiary_contract_id,
      'subject', jsonb_build_object(
        'contractId', action_row.beneficiary_contract_id,
        'displayName', subject_name,
        'legajo', contract_row.legacy_legajo,
        'sector', subject_sector
      ),
      'status', action_row.status,
      'confidentiality', action_row.confidentiality,
      'policyVersionId', action_row.policy_version_id,
      'payload', jsonb_build_object(
        'workDate', action_row.payload->>'workDate',
        'declaredMinutes', (action_row.payload->>'declaredMinutes')::integer,
        'reasonCode', action_row.payload->>'reasonCode',
        'reasonLabel', reason_label
      ),
      'evidenceStatus', action_row.evidence_status,
      'decision', CASE WHEN action_row.decision_reason IS NOT NULL THEN jsonb_build_object(
        'decisionReasonCode', action_row.decision_reason,
        'label', decision_reason_label,
        'manualValidationConfirmed', action_row.manual_validation_confirmed
      ) END,
      'cancellation', CASE WHEN action_row.cancellation_reason IS NOT NULL THEN jsonb_build_object(
        'decisionReasonCode', action_row.cancellation_reason,
        'label', cancellation_reason_label
      ) END,
      'timestamps', jsonb_strip_nulls(jsonb_build_object(
        'createdAt', action_row.created_at,
        'updatedAt', action_row.updated_at,
        'submittedAt', action_row.submitted_at,
        'decidedAt', action_row.decided_at,
        'cancelledAt', action_row.cancelled_at
      )),
      'version', action_row.version,
      'payrollImpact', jsonb_build_object(
        'amount', NULL,
        'rate', NULL,
        'calculated', false,
        'posted', false,
        'attendanceReconciled', false
      ),
      'projection', 'restricted_nominal'
    )),
    'timeline', timeline_value,
    'allowedCommands', commands_value
  );
END
$$;

CREATE OR REPLACE FUNCTION action_center_overtime_routing_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  detail_value jsonb;
  record_value jsonb;
BEGIN
  detail_value := action_center_overtime_detail_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id, p_case_id
  );
  record_value := detail_value->'record';
  IF record_value IS NULL OR record_value = 'null'::jsonb THEN
    RETURN jsonb_build_object('principal', detail_value->'principal', 'routing', NULL);
  END IF;
  RETURN jsonb_build_object(
    'principal', detail_value->'principal',
    'routing', jsonb_build_object(
      'id', record_value->>'id',
      'caseType', 'overtime_entry',
      'beneficiaryContractId', record_value->>'beneficiaryContractId',
      'policyVersionId', record_value->>'policyVersionId',
      'status', record_value->>'status'
    )
  );
END
$$;

COMMENT ON TABLE action_overtime_reason_catalog IS
  'Catalogo operativo provisional de motivos de mayor esfuerzo; no expresa una regla legal ni salarial.';
COMMENT ON TABLE action_overtime_decision_reason_catalog IS
  'Codigos gobernados para decidir o cancelar sin almacenar fundamentos libres con PII.';
COMMENT ON FUNCTION action_center_apply_overtime_command_v1(
  text, uuid, integer, text, uuid, uuid, text, uuid, integer, uuid, text,
  jsonb, uuid, text, text, text, boolean
) IS
  'Workflow tenant-bound de declaraciones de mayor esfuerzo. Aprobar solo deja pending_time_rules; nunca calcula ni publica nomina.';

REVOKE ALL ON TABLE
  action_overtime_reason_catalog,
  action_overtime_decision_reason_catalog
FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_valid_overtime_payload(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_valid_overtime_decision_reason_v1(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_overtime_decider_separated_v1(
  uuid, uuid, uuid, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_overtime_mutation_context_v1(
  text, uuid, integer, text, uuid, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_apply_overtime_command_v1(
  text, uuid, integer, text, uuid, uuid, text, uuid, integer, uuid, text,
  jsonb, uuid, text, text, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_overtime_read_context_v1(
  text, uuid, integer, text, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_overtime_has_exclusive_entry_v1(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_overtime_bootstrap_v1(
  text, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_overtime_list_v1(
  text, uuid, integer, text, uuid, uuid, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_overtime_detail_v1(
  text, uuid, integer, text, uuid, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_overtime_routing_v1(
  text, uuid, integer, text, uuid, uuid, uuid
) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE
  action_overtime_reason_catalog,
  action_overtime_decision_reason_catalog
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_valid_overtime_payload(jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_valid_overtime_decision_reason_v1(text, text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_overtime_decider_separated_v1(
  uuid, uuid, uuid, text, uuid
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_overtime_mutation_context_v1(
  text, uuid, integer, text, uuid, uuid, uuid
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_overtime_read_context_v1(
  text, uuid, integer, text, uuid, uuid
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_overtime_has_exclusive_entry_v1(jsonb)
  FROM municontrol_actions_runtime_app;

REVOKE ALL PRIVILEGES ON FUNCTION action_center_apply_overtime_command_v1(
  text, uuid, integer, text, uuid, uuid, text, uuid, integer, uuid, text,
  jsonb, uuid, text, text, text, boolean
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_overtime_bootstrap_v1(
  text, uuid, integer, text, uuid, uuid, text
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_overtime_list_v1(
  text, uuid, integer, text, uuid, uuid, text, integer, integer
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_overtime_detail_v1(
  text, uuid, integer, text, uuid, uuid, uuid
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_overtime_routing_v1(
  text, uuid, integer, text, uuid, uuid, uuid
) FROM municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION action_center_apply_overtime_command_v1(
  text, uuid, integer, text, uuid, uuid, text, uuid, integer, uuid, text,
  jsonb, uuid, text, text, text, boolean
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_overtime_bootstrap_v1(
  text, uuid, integer, text, uuid, uuid, text
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_overtime_list_v1(
  text, uuid, integer, text, uuid, uuid, text, integer, integer
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_overtime_detail_v1(
  text, uuid, integer, text, uuid, uuid, uuid
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_overtime_routing_v1(
  text, uuid, integer, text, uuid, uuid, uuid
) TO municontrol_actions_runtime_app;
