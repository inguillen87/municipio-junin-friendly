-- MuniControl Friendly: centro de acciones operativas.
--
-- Esta migracion NO escribe en las tablas historicas grh_* ni convierte el
-- catalogo normativo en una decision automatica. El primer tipo de caso es
-- leave_request, pero el sobre transaccional y la bitacora son generales.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE UNIQUE INDEX IF NOT EXISTS internal_users_email_lower_uk
  ON internal_users (lower(email));

CREATE OR REPLACE FUNCTION action_center_reject_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '55000';
END
$$;

CREATE OR REPLACE FUNCTION action_center_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% cannot be deleted; use a cancellation command', TG_TABLE_NAME
    USING ERRCODE = '55000';
END
$$;

CREATE OR REPLACE FUNCTION action_center_valid_leave_payload(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  starts_on date;
  ends_on date;
  starts_at_local time;
  ends_at_local time;
  duration_unit text;
BEGIN
  IF jsonb_typeof(value) <> 'object' THEN
    RETURN false;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(value) AS field(name)
    WHERE field.name NOT IN (
      'reasonCode', 'policyRuleId', 'employeeNote', 'startsOn', 'endsOn',
      'durationUnit', 'startsAtLocal', 'endsAtLocal'
    )
  ) THEN
    RETURN false;
  END IF;
  IF NOT (value ?& ARRAY['reasonCode', 'startsOn', 'endsOn', 'durationUnit']) THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(value->'reasonCode') IS DISTINCT FROM 'string'
     OR length(btrim(value->>'reasonCode')) NOT BETWEEN 1 AND 32 THEN
    RETURN false;
  END IF;
  IF jsonb_typeof(value->'startsOn') IS DISTINCT FROM 'string'
     OR jsonb_typeof(value->'endsOn') IS DISTINCT FROM 'string'
     OR jsonb_typeof(value->'durationUnit') IS DISTINCT FROM 'string' THEN
    RETURN false;
  END IF;
  IF value->>'reasonCode' NOT IN (
    '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14',
    '16', '19', '21', '30', '31', '32', '33', '36'
  ) THEN
    RETURN false;
  END IF;
  IF value ? 'policyRuleId'
     AND value->'policyRuleId' <> 'null'::jsonb
     AND (
       jsonb_typeof(value->'policyRuleId') <> 'string'
       OR length(btrim(value->>'policyRuleId')) NOT BETWEEN 1 AND 128
     ) THEN
    RETURN false;
  END IF;
  IF value ? 'policyRuleId' AND value->'policyRuleId' <> 'null'::jsonb THEN
    IF NOT (CASE
      WHEN value->>'reasonCode' IN ('19', '21', '30') THEN value->>'policyRuleId' IN (
        'annual-ordinary', 'annual-window', 'annual-carryover'
      )
      WHEN value->>'reasonCode' IN ('5', '31', '32', '33', '36') THEN value->>'policyRuleId' IN (
        'health', 'health-under-5-no-family', 'health-under-5-family',
        'health-over-5-no-family', 'health-over-5-family', 'health-exactly-5',
        'work-accident-art44-repealed', 'job-reservation'
      )
      WHEN value->>'reasonCode' IN ('4', '6', '7', '8', '9', '10', '11', '14')
        THEN value->>'policyRuleId' IN (
          'special', 'marriage', 'bereavement-direct', 'bereavement-sibling',
          'exam', 'blood-donation', 'family-care', 'training', 'personal-paid',
          'organ-donation', 'special-work'
        )
      WHEN value->>'reasonCode' IN ('3', '12', '13') THEN value->>'policyRuleId' IN (
        'family-protection', 'birth-gestating', 'birth-non-gestating', 'lactation', 'adoption'
      )
      WHEN value->>'reasonCode' = '16' THEN value->>'policyRuleId' IN (
        'unpaid-personal', 'unpaid-personal-duration'
      )
      ELSE false
    END) THEN
      RETURN false;
    END IF;
  END IF;
  IF value ? 'employeeNote'
     AND value->'employeeNote' <> 'null'::jsonb
     AND (
       jsonb_typeof(value->'employeeNote') <> 'string'
       OR length(value->>'employeeNote') > 1000
     ) THEN
    RETURN false;
  END IF;

  starts_on := (value->>'startsOn')::date;
  ends_on := (value->>'endsOn')::date;
  IF starts_on < DATE '2000-01-01'
     OR ends_on < starts_on
     OR ends_on > starts_on + 366 THEN
    RETURN false;
  END IF;

  duration_unit := value->>'durationUnit';
  IF duration_unit = 'calendar_day' THEN
    RETURN NOT (value ? 'startsAtLocal') AND NOT (value ? 'endsAtLocal');
  END IF;
  IF duration_unit <> 'minute'
     OR value->>'reasonCode' <> '13'
     OR starts_on <> ends_on
     OR jsonb_typeof(value->'startsAtLocal') <> 'string'
     OR jsonb_typeof(value->'endsAtLocal') <> 'string' THEN
    RETURN false;
  END IF;
  starts_at_local := (value->>'startsAtLocal')::time;
  ends_at_local := (value->>'endsAtLocal')::time;
  RETURN ends_at_local > starts_at_local;
EXCEPTION WHEN others THEN
  RETURN false;
END
$$;

CREATE TABLE IF NOT EXISTS internal_user_employment_link (
  user_email text PRIMARY KEY REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  employment_contract_id uuid NOT NULL UNIQUE REFERENCES employment_contract(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  linked_by_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_user_area_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  scope_level varchar(16) NOT NULL,
  company_id bigint NOT NULL,
  organization_unit_source_id varchar(128),
  sector_source_id varchar(128),
  active boolean NOT NULL DEFAULT true,
  granted_by_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_user_area_scope_level_ck
    CHECK (scope_level IN ('company', 'organization', 'sector')),
  CONSTRAINT internal_user_area_scope_shape_ck
    CHECK (
      (scope_level = 'company'
        AND organization_unit_source_id IS NULL AND sector_source_id IS NULL)
      OR (scope_level = 'organization'
        AND organization_unit_source_id IS NOT NULL AND sector_source_id IS NULL)
      OR (
        scope_level = 'sector'
        AND organization_unit_source_id IS NOT NULL
        AND sector_source_id IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS internal_user_area_scope_identity_uk
  ON internal_user_area_scope (
    lower(user_email), scope_level, company_id,
    COALESCE(organization_unit_source_id, ''), COALESCE(sector_source_id, '')
  );
CREATE INDEX IF NOT EXISTS internal_user_area_scope_actor_idx
  ON internal_user_area_scope (lower(user_email)) WHERE active;

CREATE OR REPLACE FUNCTION action_center_actor_authorized(
  p_actor_email text,
  p_actor_role text,
  p_command text,
  p_beneficiary_contract_id uuid,
  p_company_id bigint,
  p_organization_unit_source_id text,
  p_sector_source_id text,
  p_current_status text,
  p_confidentiality text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  role_name text := upper(btrim(p_actor_role));
  self_case boolean;
  area_case boolean;
BEGIN
  IF role_name = 'INTERNAL_ADMIN' THEN role_name := 'ADMIN_INTERNO'; END IF;
  IF role_name = 'ADMIN_INTERNO' THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM internal_user_employment_link link
    JOIN employment_contract actor_contract
      ON actor_contract.id = link.employment_contract_id
     AND actor_contract.status = 'active'
    WHERE lower(link.user_email) = lower(p_actor_email)
      AND link.active IS TRUE
      AND link.employment_contract_id = p_beneficiary_contract_id
  ) INTO self_case;

  SELECT EXISTS (
    SELECT 1
    FROM internal_user_area_scope scope
    WHERE lower(scope.user_email) = lower(p_actor_email)
      AND scope.active IS TRUE
      AND scope.company_id = p_company_id
      AND (
        scope.scope_level = 'company'
        OR (
          scope.scope_level = 'organization'
          AND scope.organization_unit_source_id = p_organization_unit_source_id
        )
         OR (
           scope.scope_level = 'sector'
           AND scope.sector_source_id = p_sector_source_id
           AND scope.organization_unit_source_id = p_organization_unit_source_id
         )
      )
  ) INTO area_case;

  IF p_command = 'read' THEN
    IF self_case AND role_name IN ('EMPLEADO', 'JEFE_AREA', 'RRHH_OPERADOR', 'RRHH_APROBADOR') THEN
      RETURN true;
    END IF;
    IF role_name = 'AUDITOR' THEN
      RETURN p_confidentiality = 'standard';
    END IF;
    RETURN area_case
      AND (
        role_name = 'RRHH_APROBADOR'
        OR (
          role_name IN ('JEFE_AREA', 'RRHH_OPERADOR')
          AND p_confidentiality = 'standard'
        )
      );
  END IF;

  IF p_command = 'create' THEN
    IF self_case AND role_name IN ('EMPLEADO', 'JEFE_AREA', 'RRHH_OPERADOR', 'RRHH_APROBADOR') THEN
      RETURN true;
    END IF;
    RETURN area_case AND role_name = 'RRHH_OPERADOR' AND p_confidentiality = 'standard';
  END IF;
  IF p_command = 'update_draft' THEN
    IF p_current_status <> 'draft' THEN RETURN false; END IF;
    IF self_case AND role_name IN ('EMPLEADO', 'JEFE_AREA', 'RRHH_OPERADOR', 'RRHH_APROBADOR') THEN
      RETURN true;
    END IF;
    RETURN area_case AND role_name = 'RRHH_OPERADOR' AND p_confidentiality = 'standard';
  END IF;
  IF p_command = 'submit' THEN
    IF p_current_status <> 'draft' THEN RETURN false; END IF;
    IF self_case AND role_name IN ('EMPLEADO', 'JEFE_AREA', 'RRHH_OPERADOR', 'RRHH_APROBADOR') THEN
      RETURN true;
    END IF;
    RETURN area_case
      AND role_name IN ('RRHH_OPERADOR', 'JEFE_AREA')
      AND p_confidentiality = 'standard';
  END IF;
  IF p_command IN ('approve', 'reject') THEN
    RETURN p_current_status = 'submitted'
      AND area_case
      AND role_name = 'RRHH_APROBADOR';
  END IF;
  IF p_command = 'cancel' THEN
    IF p_current_status = 'approved' THEN
      RETURN area_case AND role_name = 'RRHH_APROBADOR';
    END IF;
    IF p_current_status NOT IN ('draft', 'submitted') THEN RETURN false; END IF;
    IF self_case AND role_name IN ('EMPLEADO', 'JEFE_AREA', 'RRHH_OPERADOR', 'RRHH_APROBADOR') THEN
      RETURN true;
    END IF;
    RETURN area_case
      AND role_name IN ('RRHH_OPERADOR', 'JEFE_AREA')
      AND p_confidentiality = 'standard';
  END IF;
  RETURN false;
END
$$;

CREATE TABLE IF NOT EXISTS action_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  case_type varchar(48) NOT NULL,
  beneficiary_contract_id uuid NOT NULL REFERENCES employment_contract(id) ON DELETE RESTRICT,
  source_batch_id uuid NOT NULL REFERENCES source_import_batch(id) ON DELETE RESTRICT,
  company_id bigint NOT NULL,
  organization_unit_source_id varchar(128),
  sector_source_id varchar(128),
  status varchar(16) NOT NULL DEFAULT 'draft',
  confidentiality varchar(16) NOT NULL DEFAULT 'standard',
  policy_version_id varchar(128) NOT NULL,
  payload jsonb NOT NULL,
  evidence_status varchar(16) NOT NULL DEFAULT 'pending',
  created_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  submitted_by_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  submitted_at timestamptz,
  decided_by_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  decided_at timestamptz,
  decision_reason text,
  manual_validation_confirmed boolean NOT NULL DEFAULT false,
  cancelled_by_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  cancelled_at timestamptz,
  cancellation_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_case_type_ck CHECK (case_type IN ('leave_request')),
  CONSTRAINT action_case_status_ck
    CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT action_case_confidentiality_ck
    CHECK (confidentiality IN ('standard', 'restricted')),
  CONSTRAINT action_case_policy_version_ck
    CHECK (policy_version_id = 'mendoza-ley-5811-title-vi.v1'),
  CONSTRAINT action_case_payload_object_ck CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT action_case_leave_payload_ck
    CHECK (case_type <> 'leave_request' OR action_center_valid_leave_payload(payload) IS TRUE),
  CONSTRAINT action_case_leave_confidentiality_ck CHECK (
    case_type <> 'leave_request'
    OR (
      (payload->>'reasonCode' = '19' OR confidentiality = 'restricted')
      AND (confidentiality <> 'restricted' OR NOT (payload ? 'employeeNote'))
    )
  ),
  CONSTRAINT action_case_evidence_status_ck
    CHECK (evidence_status IN ('pending', 'received', 'verified', 'not_required', 'rejected')),
  CONSTRAINT action_case_version_ck CHECK (version > 0),
  CONSTRAINT action_case_submission_ck CHECK (
    status NOT IN ('submitted', 'approved', 'rejected')
    OR (submitted_by_user_email IS NOT NULL AND submitted_at IS NOT NULL)
  ),
  CONSTRAINT action_case_decision_ck CHECK (
    status NOT IN ('approved', 'rejected')
    OR (
      decided_by_user_email IS NOT NULL
      AND decided_at IS NOT NULL
      AND length(btrim(decision_reason)) > 0
    )
  ),
  CONSTRAINT action_case_approval_human_ck CHECK (
    status <> 'approved'
    OR (
      manual_validation_confirmed IS TRUE
      AND evidence_status IN ('verified', 'not_required')
      AND (confidentiality = 'standard' OR evidence_status = 'verified')
    )
  ),
  CONSTRAINT action_case_cancellation_ck CHECK (
    status <> 'cancelled'
    OR (
      cancelled_by_user_email IS NOT NULL
      AND cancelled_at IS NOT NULL
      AND length(btrim(cancellation_reason)) > 0
    )
  )
);

CREATE INDEX IF NOT EXISTS action_case_queue_idx
  ON action_case (case_type, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS action_case_beneficiary_idx
  ON action_case (beneficiary_contract_id, created_at DESC);
CREATE INDEX IF NOT EXISTS action_case_area_idx
  ON action_case (company_id, organization_unit_source_id, sector_source_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS action_case_leave_active_request_uk
  ON action_case (
    beneficiary_contract_id,
    (payload->>'reasonCode'),
    (payload->>'startsOn'),
    (payload->>'endsOn'),
    (payload->>'durationUnit'),
    (COALESCE(payload->>'startsAtLocal', '')),
    (COALESCE(payload->>'endsAtLocal', ''))
  )
  WHERE case_type = 'leave_request' AND status IN ('draft', 'submitted', 'approved');

CREATE TABLE IF NOT EXISTS action_case_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id uuid NOT NULL REFERENCES action_case(id) ON DELETE RESTRICT,
  case_type varchar(48) NOT NULL,
  case_version integer NOT NULL,
  event_type varchar(32) NOT NULL,
  from_status varchar(16),
  to_status varchar(16) NOT NULL,
  actor_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  actor_role varchar(64) NOT NULL,
  actor_employment_contract_id uuid REFERENCES employment_contract(id) ON DELETE RESTRICT,
  actor_person_id uuid REFERENCES person_identity(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  command_hash char(64) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_case_event_type_ck CHECK (
    event_type IN ('created', 'draft_updated', 'submitted', 'approved', 'rejected', 'cancelled')
  ),
  CONSTRAINT action_case_event_status_ck CHECK (
    (from_status IS NULL OR from_status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled'))
    AND to_status IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled')
  ),
  CONSTRAINT action_case_event_version_ck CHECK (case_version > 0),
  CONSTRAINT action_case_event_hash_ck CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT action_case_event_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT action_case_event_actor_identity_ck CHECK (
    (actor_employment_contract_id IS NULL) = (actor_person_id IS NULL)
  ),
  CONSTRAINT action_case_event_case_version_uk UNIQUE (case_id, case_version),
  CONSTRAINT action_case_event_actor_idempotency_uk UNIQUE (actor_user_email, idempotency_key)
);

CREATE INDEX IF NOT EXISTS action_case_event_case_time_idx
  ON action_case_event (case_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS action_case_event_maker_person_idx
  ON action_case_event (case_id, actor_person_id)
  WHERE event_type IN ('created', 'draft_updated', 'submitted');

-- Contexto efimero de una unica mutacion. Un rol de runtime sin privilegios DML
-- no puede fabricarlo; la funcion SECURITY DEFINER lo crea y el trigger de
-- auditoria lo consume dentro de la misma transaccion.
CREATE TABLE IF NOT EXISTS action_command_context (
  backend_pid integer NOT NULL,
  transaction_id bigint NOT NULL,
  actor_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  actor_role varchar(64) NOT NULL,
  actor_employment_contract_id uuid REFERENCES employment_contract(id) ON DELETE RESTRICT,
  actor_person_id uuid REFERENCES person_identity(id) ON DELETE RESTRICT,
  event_type varchar(32) NOT NULL,
  idempotency_key uuid NOT NULL,
  command_hash char(64) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (backend_pid, transaction_id),
  CONSTRAINT action_command_context_hash_ck CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT action_command_context_metadata_ck CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT action_command_context_actor_identity_ck CHECK (
    (actor_employment_contract_id IS NULL) = (actor_person_id IS NULL)
  )
);

CREATE OR REPLACE FUNCTION action_center_set_command_context(
  p_actor_email text,
  p_actor_role text,
  p_actor_employment_contract_id uuid,
  p_actor_person_id uuid,
  p_event_type text,
  p_idempotency_key uuid,
  p_command_hash text,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO action_command_context (
    backend_pid, transaction_id, actor_user_email, actor_role,
    actor_employment_contract_id, actor_person_id, event_type,
    idempotency_key, command_hash, metadata
  ) VALUES (
    pg_backend_pid(), txid_current(), p_actor_email, p_actor_role,
    p_actor_employment_contract_id, p_actor_person_id, p_event_type,
    p_idempotency_key, p_command_hash, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (backend_pid, transaction_id) DO UPDATE SET
    actor_user_email = EXCLUDED.actor_user_email,
    actor_role = EXCLUDED.actor_role,
    actor_employment_contract_id = EXCLUDED.actor_employment_contract_id,
    actor_person_id = EXCLUDED.actor_person_id,
    event_type = EXCLUDED.event_type,
    idempotency_key = EXCLUDED.idempotency_key,
    command_hash = EXCLUDED.command_hash,
    metadata = EXCLUDED.metadata,
    created_at = now();
END
$$;

REVOKE ALL ON FUNCTION action_center_set_command_context(text, text, uuid, uuid, text, uuid, text, jsonb)
FROM PUBLIC;

CREATE OR REPLACE FUNCTION action_center_require_case_context()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM action_command_context context
    WHERE context.backend_pid = pg_backend_pid()
      AND context.transaction_id = txid_current()
  ) THEN
    RAISE EXCEPTION 'ACTION_DIRECT_DML_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION action_center_require_event_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  context action_command_context%ROWTYPE;
BEGIN
  SELECT * INTO context
  FROM action_command_context
  WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  IF NOT FOUND
     OR NEW.actor_user_email <> context.actor_user_email
     OR NEW.actor_role <> context.actor_role
     OR NEW.actor_employment_contract_id IS DISTINCT FROM context.actor_employment_contract_id
     OR NEW.actor_person_id IS DISTINCT FROM context.actor_person_id
     OR NEW.event_type <> context.event_type
     OR NEW.idempotency_key <> context.idempotency_key
     OR NEW.command_hash <> context.command_hash
     OR NEW.metadata IS DISTINCT FROM context.metadata THEN
    RAISE EXCEPTION 'ACTION_DIRECT_DML_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION action_center_log_case_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  context action_command_context%ROWTYPE;
BEGIN
  SELECT * INTO STRICT context
  FROM action_command_context
  WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  INSERT INTO action_case_event (
    case_id, case_type, case_version, event_type, from_status, to_status,
    actor_user_email, actor_role, actor_employment_contract_id, actor_person_id,
    idempotency_key, command_hash, metadata
  ) VALUES (
    NEW.id, NEW.case_type, NEW.version,
    context.event_type,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status,
    context.actor_user_email,
    context.actor_role,
    context.actor_employment_contract_id,
    context.actor_person_id,
    context.idempotency_key,
    context.command_hash,
    context.metadata
  );
  DELETE FROM action_command_context
  WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS action_case_no_delete ON action_case;
CREATE TRIGGER action_case_no_delete
BEFORE DELETE ON action_case
FOR EACH ROW EXECUTE FUNCTION action_center_reject_delete();

DROP TRIGGER IF EXISTS action_case_require_context ON action_case;
CREATE TRIGGER action_case_require_context
BEFORE INSERT OR UPDATE ON action_case
FOR EACH ROW EXECUTE FUNCTION action_center_require_case_context();

DROP TRIGGER IF EXISTS action_case_log_event ON action_case;
CREATE TRIGGER action_case_log_event
AFTER INSERT OR UPDATE ON action_case
FOR EACH ROW EXECUTE FUNCTION action_center_log_case_event();

DROP TRIGGER IF EXISTS action_case_event_append_only ON action_case_event;
CREATE TRIGGER action_case_event_append_only
BEFORE UPDATE OR DELETE ON action_case_event
FOR EACH ROW EXECUTE FUNCTION action_center_reject_change();

DROP TRIGGER IF EXISTS action_case_event_require_context ON action_case_event;
CREATE TRIGGER action_case_event_require_context
BEFORE INSERT ON action_case_event
FOR EACH ROW EXECUTE FUNCTION action_center_require_event_context();

CREATE OR REPLACE FUNCTION action_center_validate_case_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id <> OLD.id
     OR NEW.case_number <> OLD.case_number
     OR NEW.case_type <> OLD.case_type
     OR NEW.beneficiary_contract_id <> OLD.beneficiary_contract_id
     OR NEW.source_batch_id <> OLD.source_batch_id
     OR NEW.company_id <> OLD.company_id
     OR NEW.organization_unit_source_id IS DISTINCT FROM OLD.organization_unit_source_id
     OR NEW.sector_source_id IS DISTINCT FROM OLD.sector_source_id
     OR NEW.created_by_user_email <> OLD.created_by_user_email
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'ACTION_CASE_IMMUTABLE_FIELDS' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.payload IS DISTINCT FROM OLD.payload AND OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'ACTION_CASE_PAYLOAD_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status IN ('submitted', 'cancelled'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected', 'cancelled'))
    OR (OLD.status = 'approved' AND NEW.status = 'cancelled')
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

DROP TRIGGER IF EXISTS action_case_validate_update ON action_case;
CREATE TRIGGER action_case_validate_update
BEFORE UPDATE ON action_case
FOR EACH ROW EXECUTE FUNCTION action_center_validate_case_update();

CREATE OR REPLACE FUNCTION action_center_apply_command(
  p_actor_email text,
  p_case_type text,
  p_command text,
  p_case_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_command_hash text,
  p_payload jsonb,
  p_beneficiary_contract_id uuid,
  p_policy_version_id text,
  p_confidentiality text,
  p_reason text,
  p_evidence_status text,
  p_manual_validation_confirmed boolean
)
RETURNS TABLE (
  case_id uuid,
  case_number bigint,
  current_status varchar(16),
  current_version integer,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor internal_users%ROWTYPE;
  actor_contract_snapshot_id uuid;
  actor_person_snapshot_id uuid;
  existing_event action_case_event%ROWTYPE;
  current_case action_case%ROWTYPE;
  contract employment_contract%ROWTYPE;
  previous_status varchar(16);
  next_status varchar(16);
  next_event varchar(32);
  event_metadata jsonb;
BEGIN
  SELECT * INTO actor
  FROM internal_users
  WHERE lower(email) = lower(btrim(p_actor_email)) AND active IS TRUE
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_ACTOR_INACTIVE' USING ERRCODE = 'P0001';
  END IF;
  SELECT link.employment_contract_id, actor_contract.person_id
  INTO actor_contract_snapshot_id, actor_person_snapshot_id
  FROM internal_user_employment_link link
  JOIN employment_contract actor_contract
    ON actor_contract.id = link.employment_contract_id
   AND actor_contract.status = 'active'
  WHERE lower(link.user_email) = lower(actor.email)
    AND link.active IS TRUE
  FOR SHARE OF link, actor_contract;
  IF p_case_type <> 'leave_request'
     OR p_command NOT IN ('create', 'update_draft', 'submit', 'approve', 'reject', 'cancel')
     OR p_idempotency_key IS NULL
     OR p_command_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_command IN ('create', 'update_draft', 'submit')
     AND actor_person_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(lower(actor.email) || ':' || p_idempotency_key::text, 0)
  );
  SELECT * INTO existing_event
  FROM action_case_event
  WHERE lower(actor_user_email) = lower(actor.email)
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.command_hash <> p_command_hash
       OR existing_event.case_type <> p_case_type
       OR (p_case_id IS NOT NULL AND existing_event.case_id <> p_case_id) THEN
      RAISE EXCEPTION 'ACTION_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_case FROM action_case WHERE id = existing_event.case_id;
    IF existing_event.actor_person_id IS DISTINCT FROM actor_person_snapshot_id THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF NOT action_center_actor_authorized(
      actor.email, actor.role, p_command,
      current_case.beneficiary_contract_id, current_case.company_id,
      current_case.organization_unit_source_id, current_case.sector_source_id,
      COALESCE(existing_event.from_status, 'draft'), current_case.confidentiality
    ) THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF (
      p_command IN ('approve', 'reject')
      OR (p_command = 'cancel' AND existing_event.from_status = 'approved')
    ) AND (
      actor_person_snapshot_id IS NULL
      OR lower(actor.email) IN (
        lower(current_case.created_by_user_email),
        lower(current_case.submitted_by_user_email)
      )
      OR EXISTS (
        SELECT 1
        FROM action_case_event preparation_event
        WHERE preparation_event.case_id = current_case.id
          AND preparation_event.event_type IN ('created', 'draft_updated', 'submitted')
          AND (
            preparation_event.actor_person_id IS NULL
            OR preparation_event.actor_person_id = actor_person_snapshot_id
          )
      )
      OR EXISTS (
        SELECT 1
        FROM employment_contract beneficiary_contract
        WHERE beneficiary_contract.id = current_case.beneficiary_contract_id
          AND beneficiary_contract.person_id = actor_person_snapshot_id
      )
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
    IF p_case_id IS NOT NULL OR p_expected_version IS NOT NULL
       OR p_beneficiary_contract_id IS NULL OR p_payload IS NULL THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO contract
    FROM employment_contract
    WHERE id = p_beneficiary_contract_id AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    IF NOT action_center_actor_authorized(
      actor.email, actor.role, p_command,
      contract.id, contract.legacy_company_id,
      contract.organization_unit_source_id, contract.sector_source_id,
      'draft', p_confidentiality
    ) THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    previous_status := NULL;
    next_status := 'draft';
    next_event := 'created';
    event_metadata := jsonb_build_object(
      'command', p_command, 'reasonPresent', false,
      'evidenceStatus', NULL, 'manualValidationConfirmed', false
    );
    PERFORM action_center_set_command_context(
      actor.email, actor.role, actor_contract_snapshot_id, actor_person_snapshot_id,
      next_event, p_idempotency_key, p_command_hash, event_metadata
    );

    INSERT INTO action_case (
      case_type, beneficiary_contract_id, source_batch_id,
      company_id, organization_unit_source_id, sector_source_id,
      policy_version_id, confidentiality, payload, created_by_user_email
    ) VALUES (
      p_case_type, contract.id, contract.source_batch_id,
      contract.legacy_company_id, contract.organization_unit_source_id, contract.sector_source_id,
      p_policy_version_id, p_confidentiality, p_payload, actor.email
    ) RETURNING * INTO current_case;
  ELSE
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
      RAISE EXCEPTION 'ACTION_VERSION_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_case FROM action_case WHERE id = p_case_id FOR UPDATE;
    IF NOT FOUND OR current_case.case_type <> p_case_type THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF NOT action_center_actor_authorized(
      actor.email, actor.role, 'read',
      current_case.beneficiary_contract_id, current_case.company_id,
      current_case.organization_unit_source_id, current_case.sector_source_id,
      current_case.status, current_case.confidentiality
    ) THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF current_case.version <> p_expected_version THEN
      RAISE EXCEPTION 'ACTION_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF NOT action_center_actor_authorized(
      actor.email, actor.role, p_command,
      current_case.beneficiary_contract_id, current_case.company_id,
      current_case.organization_unit_source_id, current_case.sector_source_id,
      current_case.status,
      CASE WHEN p_command = 'update_draft'
        THEN COALESCE(p_confidentiality, current_case.confidentiality)
        ELSE current_case.confidentiality END
    ) THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    previous_status := current_case.status;
    event_metadata := jsonb_build_object(
      'command', p_command,
      'reasonPresent', p_reason IS NOT NULL AND length(btrim(p_reason)) > 0,
      'evidenceStatus', p_evidence_status,
      'manualValidationConfirmed', COALESCE(p_manual_validation_confirmed, false)
    );

    IF p_command = 'update_draft' THEN
      IF current_case.status <> 'draft' OR p_payload IS NULL THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'draft';
      next_event := 'draft_updated';
      PERFORM action_center_set_command_context(
        actor.email, actor.role, actor_contract_snapshot_id, actor_person_snapshot_id,
        next_event, p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case SET
        payload = p_payload,
        policy_version_id = p_policy_version_id,
        confidentiality = p_confidentiality,
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSIF p_command = 'submit' THEN
      IF current_case.status <> 'draft' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'submitted';
      next_event := 'submitted';
      PERFORM action_center_set_command_context(
        actor.email, actor.role, actor_contract_snapshot_id, actor_person_snapshot_id,
        next_event, p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case SET
        status = 'submitted', submitted_by_user_email = actor.email,
        submitted_at = now(), version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSIF p_command IN ('approve', 'reject') THEN
      IF current_case.status <> 'submitted' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      IF actor_person_snapshot_id IS NULL THEN
        RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
      END IF;
      IF lower(actor.email) IN (
          lower(current_case.created_by_user_email),
          lower(current_case.submitted_by_user_email)
        ) OR EXISTS (
          SELECT 1
          FROM action_case_event preparation_event
          WHERE preparation_event.case_id = current_case.id
            AND preparation_event.event_type IN ('created', 'draft_updated', 'submitted')
            AND (
              preparation_event.actor_person_id IS NULL
              OR preparation_event.actor_person_id = actor_person_snapshot_id
            )
        ) OR EXISTS (
          SELECT 1
          FROM employment_contract beneficiary_contract
          WHERE beneficiary_contract.id = current_case.beneficiary_contract_id
            AND beneficiary_contract.person_id = actor_person_snapshot_id
        ) THEN
        RAISE EXCEPTION 'ACTION_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
      END IF;
      IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'ACTION_DECISION_REASON_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      IF p_command = 'approve' AND (
        p_manual_validation_confirmed IS DISTINCT FROM true
        OR p_evidence_status NOT IN ('verified', 'not_required')
        OR (
          current_case.confidentiality = 'restricted'
          AND p_evidence_status <> 'verified'
        )
      ) THEN
        RAISE EXCEPTION 'ACTION_MANUAL_VALIDATION_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      next_status := CASE WHEN p_command = 'approve' THEN 'approved' ELSE 'rejected' END;
      next_event := CASE WHEN p_command = 'approve' THEN 'approved' ELSE 'rejected' END;
      PERFORM action_center_set_command_context(
        actor.email, actor.role, actor_contract_snapshot_id, actor_person_snapshot_id,
        next_event, p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case SET
        status = next_status, decided_by_user_email = actor.email,
        decided_at = now(), decision_reason = btrim(p_reason),
        evidence_status = COALESCE(p_evidence_status, evidence_status),
        manual_validation_confirmed = COALESCE(p_manual_validation_confirmed, false),
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSIF p_command = 'cancel' THEN
      IF current_case.status NOT IN ('draft', 'submitted', 'approved') THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      IF current_case.status = 'approved' THEN
        IF actor_person_snapshot_id IS NULL THEN
          RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
        END IF;
        IF lower(actor.email) IN (
            lower(current_case.created_by_user_email),
            lower(current_case.submitted_by_user_email)
          ) OR EXISTS (
            SELECT 1
            FROM action_case_event preparation_event
            WHERE preparation_event.case_id = current_case.id
              AND preparation_event.event_type IN ('created', 'draft_updated', 'submitted')
              AND (
                preparation_event.actor_person_id IS NULL
                OR preparation_event.actor_person_id = actor_person_snapshot_id
              )
          ) OR EXISTS (
            SELECT 1
            FROM employment_contract beneficiary_contract
            WHERE beneficiary_contract.id = current_case.beneficiary_contract_id
              AND beneficiary_contract.person_id = actor_person_snapshot_id
          ) THEN
          RAISE EXCEPTION 'ACTION_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
        END IF;
      END IF;
      IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'ACTION_CANCELLATION_REASON_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'cancelled';
      next_event := 'cancelled';
      PERFORM action_center_set_command_context(
        actor.email, actor.role, actor_contract_snapshot_id, actor_person_snapshot_id,
        next_event, p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case SET
        status = 'cancelled', cancelled_by_user_email = actor.email,
        cancelled_at = now(), cancellation_reason = btrim(p_reason),
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

CREATE OR REPLACE VIEW vw_action_leave_request AS
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
FROM action_case action
WHERE action.case_type = 'leave_request';

COMMENT ON TABLE action_case IS
  'Casos operativos propios de MuniControl. No reemplazan ni sobrescriben los snapshots historicos GRH.';
COMMENT ON TABLE action_case_event IS
  'Bitacora append-only e idempotente. metadata nunca debe contener diagnosticos, documentos ni notas personales.';
COMMENT ON COLUMN action_case_event.actor_person_id IS
  'Snapshot inmutable de identidad natural del actor al ocurrir el evento; NULL bloquea decisiones maker-checker posteriores.';
COMMENT ON COLUMN action_case_event.actor_employment_contract_id IS
  'Snapshot del vinculo laboral usado para resolver actor_person_id; no se expone al runtime de lectura.';
COMMENT ON COLUMN action_case.manual_validation_confirmed IS
  'Una aprobacion exige confirmacion humana; la IA y el motor normativo no pueden establecerla.';
COMMENT ON VIEW vw_action_leave_request IS
  'Proyeccion tipada del primer case_type. duration_value expresa dias corridos o minutos solicitados, no horas trabajadas ni impacto salarial.';
COMMENT ON TABLE action_command_context IS
  'Contexto transaccional efimero. Antes de usar un rol runtime no-owner se debe conceder solo EXECUTE sobre action_center_apply_command y lecturas gobernadas; nunca DML directo.';
COMMENT ON TABLE internal_user_employment_link IS
  'Vinculo de identidad para self-service y separacion de funciones. La activacion de roles aprobadores exige gobernar sus altas/bajas con auditoria append-only.';
COMMENT ON TABLE internal_user_area_scope IS
  'Scopes explicitos por empresa/organizacion/sector. No habilitar roles no-admin en Produccion hasta auditar grants y revocaciones.';

REVOKE ALL ON TABLE
  internal_user_employment_link, internal_user_area_scope,
  action_case, action_case_event, action_command_context
FROM PUBLIC;
REVOKE ALL ON SEQUENCE action_case_case_number_seq, action_case_event_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_reject_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_reject_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_valid_leave_payload(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_actor_authorized(text, text, text, uuid, bigint, text, text, text, text)
FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_set_command_context(text, text, uuid, uuid, text, uuid, text, jsonb)
FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_require_case_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_require_event_context() FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_log_case_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_validate_case_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_apply_command(
  text, text, text, uuid, integer, uuid, text, jsonb, uuid, text, text, text, text, boolean
) FROM PUBLIC;

DO $$
DECLARE
  runtime_role pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO runtime_role FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_RUNTIME_ROLE_REQUIRED: create municontrol_actions_runtime_app with SQL, never with Neon Console/CLI/API'
      USING ERRCODE = 'P0001';
  END IF;
  IF NOT runtime_role.rolcanlogin
     OR runtime_role.rolinherit
     OR runtime_role.rolsuper
     OR runtime_role.rolcreaterole
     OR runtime_role.rolcreatedb
     OR runtime_role.rolreplication
     OR runtime_role.rolbypassrls THEN
    RAISE EXCEPTION 'ACTION_RUNTIME_ROLE_MUST_BE_UNPRIVILEGED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members membership
    WHERE membership.member = runtime_role.oid
  ) THEN
    RAISE EXCEPTION 'ACTION_RUNTIME_ROLE_MUST_HAVE_ZERO_MEMBERSHIPS' USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- Neon Console/CLI/API roles are members of neon_superuser. This role must be
-- created by SQL with LOGIN NOINHERIT and every NO* capability before applying.
REVOKE ALL PRIVILEGES ON SCHEMA public FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON TABLE
  internal_users, internal_user_employment_link, internal_user_area_scope,
  action_case, action_case_event, action_command_context,
  employment_contract, person_identity, grh_employees, grh_catalog_rows,
  source_import_batch, vw_action_leave_request
FROM municontrol_actions_runtime_app;
DO $$
DECLARE
  relation_columns record;
BEGIN
  FOR relation_columns IN
    SELECT columns.table_name,
           string_agg(format('%I', columns.column_name), ', ' ORDER BY columns.ordinal_position) AS names
    FROM information_schema.columns columns
    WHERE columns.table_schema = 'public'
      AND columns.table_name IN (
        'internal_users', 'internal_user_employment_link', 'internal_user_area_scope',
        'action_case', 'action_case_event', 'action_command_context',
        'employment_contract', 'person_identity', 'grh_employees', 'grh_catalog_rows',
        'source_import_batch', 'vw_action_leave_request'
      )
    GROUP BY columns.table_name
  LOOP
    EXECUTE format(
      'REVOKE SELECT (%1$s), INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON TABLE public.%2$I FROM municontrol_actions_runtime_app',
      relation_columns.names,
      relation_columns.table_name
    );
  END LOOP;
END
$$;
REVOKE ALL PRIVILEGES ON SEQUENCE
  action_case_case_number_seq, action_case_event_id_seq
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_reject_change()
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_reject_delete()
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_valid_leave_payload(jsonb)
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_actor_authorized(
  text, text, text, uuid, bigint, text, text, text, text
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_set_command_context(
  text, text, uuid, uuid, text, uuid, text, jsonb
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_require_case_context()
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_require_event_context()
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_log_case_event()
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_validate_case_update()
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_apply_command(
  text, text, text, uuid, integer, uuid, text, jsonb, uuid, text, text, text, text, boolean
) FROM municontrol_actions_runtime_app;

GRANT USAGE ON SCHEMA public TO municontrol_actions_runtime_app;
GRANT SELECT (email, display_name, role, active)
  ON TABLE internal_users TO municontrol_actions_runtime_app;
GRANT SELECT (user_email, employment_contract_id, active)
  ON TABLE internal_user_employment_link TO municontrol_actions_runtime_app;
GRANT SELECT (
  user_email, scope_level, company_id,
  organization_unit_source_id, sector_source_id, active
) ON TABLE internal_user_area_scope TO municontrol_actions_runtime_app;
GRANT SELECT (
  id, case_number, case_type, beneficiary_contract_id, source_batch_id,
  company_id, organization_unit_source_id, sector_source_id,
  status, confidentiality, policy_version_id, payload, evidence_status,
  created_by_user_email, submitted_by_user_email, submitted_at,
  decided_by_user_email, decided_at, decision_reason, manual_validation_confirmed,
  cancelled_by_user_email, cancelled_at, cancellation_reason,
  version, created_at, updated_at
) ON TABLE action_case TO municontrol_actions_runtime_app;
GRANT SELECT (
  id, case_id, case_version, event_type, from_status, to_status,
  actor_user_email, actor_role, metadata, occurred_at
) ON TABLE action_case_event TO municontrol_actions_runtime_app;
GRANT SELECT (
  id, person_id, legacy_company_id, legacy_legajo,
  organization_unit_source_id, sector_source_id, status
) ON TABLE employment_contract TO municontrol_actions_runtime_app;
GRANT SELECT (id, full_name)
  ON TABLE person_identity TO municontrol_actions_runtime_app;
GRANT SELECT (company_id, legajo, nombre, sector)
  ON TABLE grh_employees TO municontrol_actions_runtime_app;
GRANT SELECT (catalog, source_key, label)
  ON TABLE grh_catalog_rows TO municontrol_actions_runtime_app;
GRANT SELECT (id, source_system, source_cutoff, validation_state, recorded_at)
  ON TABLE source_import_batch TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_apply_command(
  text, text, text, uuid, integer, uuid, text, jsonb, uuid, text, text, text, text, boolean
) TO municontrol_actions_runtime_app;
