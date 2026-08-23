-- MuniControl Friendly - Sprint 013
-- Vinculacion explicita de identidades existentes a un tenant mediante
-- maker-checker. PLATFORM_OWNER conserva el control plane, pero nunca hereda
-- acceso operativo, SUPERUSER de PostgreSQL ni membresias para tenants futuros.

INSERT INTO iam_role (
  role_key, label, description, scope_kind, system_managed
) VALUES (
  'TENANT_RRHH_ADMIN_OPERATIVO',
  'RR.HH. - administracion operativa',
  'Lectura nominal amplia y preparacion de cambios; salario, salud, aprobaciones y posting permanecen separados.',
  'tenant',
  true
)
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  system_managed = EXCLUDED.system_managed;

INSERT INTO iam_role_capability (role_key, capability_key) VALUES
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'workforce.summary.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'workforce.structure.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'workforce.employee.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'absence.analytics.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'absence.nominal.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.policy.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.preview.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'management.analytics.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'quality.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'lineage.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'assistant.use'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'actions.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'employee.record.propose'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'absence.enter'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.enter'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.request.aggregate.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.request.all.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.request.area.create'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.request.area.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.request.area.update'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.request.area.submit'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.request.area.cancel_pending'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'leave.request.audit.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'time.overtime.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'time.source.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'time.source.propose'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'time.catalog.read'),
  ('TENANT_RRHH_ADMIN_OPERATIVO', 'time.catalog.propose')
ON CONFLICT DO NOTHING;

-- Perfil base exacto: reaplicar la migracion no deja grants residuales.
DELETE FROM iam_role_capability mapping
WHERE mapping.role_key = 'TENANT_RRHH_ADMIN_OPERATIVO'
  AND mapping.capability_key <> ALL (ARRAY[
    'workforce.summary.read','workforce.structure.read','workforce.employee.read',
    'absence.analytics.read','absence.nominal.read','leave.policy.read','leave.preview.read',
    'management.analytics.read','quality.read','lineage.read','assistant.use','actions.read',
    'employee.record.propose','absence.enter','leave.enter','leave.request.aggregate.read',
    'leave.request.all.read','leave.request.area.create','leave.request.area.read',
    'leave.request.area.update','leave.request.area.submit','leave.request.area.cancel_pending',
    'leave.request.audit.read','time.overtime.read','time.source.read','time.source.propose',
    'time.catalog.read','time.catalog.propose'
  ]::varchar[]);

DO $tenant_rrhh_operational_sod$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM iam_role_capability left_mapping
    JOIN iam_capability_conflict conflict
      ON conflict.capability_key = left_mapping.capability_key
    JOIN iam_role_capability right_mapping
      ON right_mapping.role_key = left_mapping.role_key
     AND right_mapping.capability_key = conflict.conflicts_with_key
    WHERE left_mapping.role_key = 'TENANT_RRHH_ADMIN_OPERATIVO'
  ) THEN
    RAISE EXCEPTION 'TENANT_MEMBERSHIP_ROLE_SOD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
END
$tenant_rrhh_operational_sod$;

CREATE TABLE IF NOT EXISTS tenant_membership_change_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_action varchar(16) NOT NULL,
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  target_user_email text NOT NULL
    REFERENCES internal_users(email) ON UPDATE RESTRICT ON DELETE RESTRICT,
  membership_id uuid,
  role_key varchar(64) NOT NULL REFERENCES iam_role(role_key) ON DELETE RESTRICT,
  expected_membership_version integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  reason text NOT NULL,
  requested_by_user_email text NOT NULL
    REFERENCES internal_users(email) ON UPDATE RESTRICT ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  decided_by_user_email text
    REFERENCES internal_users(email) ON UPDATE RESTRICT ON DELETE RESTRICT,
  decision_reason text,
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT tenant_membership_change_request_action_ck
    CHECK (requested_action IN ('add', 'reactivate')),
  CONSTRAINT tenant_membership_change_request_role_ck
    CHECK (role_key = 'TENANT_RRHH_ADMIN_OPERATIVO'),
  CONSTRAINT tenant_membership_change_request_status_ck
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  CONSTRAINT tenant_membership_change_request_membership_fk
    FOREIGN KEY (membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT tenant_membership_change_request_shape_ck CHECK (
    (requested_action = 'add' AND membership_id IS NULL
      AND expected_membership_version = 0)
    OR (requested_action = 'reactivate' AND membership_id IS NOT NULL
      AND expected_membership_version > 0)
  ),
  CONSTRAINT tenant_membership_change_request_reason_ck
    CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT tenant_membership_change_request_decision_reason_ck
    CHECK (decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 3 AND 500),
  CONSTRAINT tenant_membership_change_request_version_ck CHECK (version > 0),
  CONSTRAINT tenant_membership_change_request_expiry_ck
    CHECK (expires_at = requested_at + interval '24 hours'),
  CONSTRAINT tenant_membership_change_request_state_ck CHECK (
    (status = 'pending' AND decided_by_user_email IS NULL
      AND decision_reason IS NULL AND decided_at IS NULL)
    OR (status IN ('approved', 'rejected') AND decided_by_user_email IS NOT NULL
      AND decision_reason IS NOT NULL AND decided_at IS NOT NULL
      AND decided_at <= expires_at
      AND lower(decided_by_user_email) <> lower(requested_by_user_email)
      AND lower(decided_by_user_email) <> lower(target_user_email))
    OR (status = 'expired' AND decided_by_user_email IS NULL
      AND decision_reason IS NULL AND decided_at IS NOT NULL
      AND decided_at >= expires_at)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_membership_change_request_pending_uk
  ON tenant_membership_change_request (tenant_id, lower(target_user_email))
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS tenant_membership_change_request_recent_idx
  ON tenant_membership_change_request (requested_at DESC, id);

CREATE OR REPLACE FUNCTION tenant_membership_change_request_guard_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.version <> 1
       OR NEW.decided_by_user_email IS NOT NULL
       OR NEW.decision_reason IS NOT NULL OR NEW.decided_at IS NOT NULL
       OR NEW.expires_at IS DISTINCT FROM (NEW.requested_at + interval '24 hours')
       OR (NEW.requested_action = 'reactivate' AND NOT EXISTS (
         SELECT 1 FROM tenant_membership membership
         WHERE membership.id = NEW.membership_id
           AND membership.tenant_id = NEW.tenant_id
           AND lower(membership.user_email) = lower(NEW.target_user_email)
       )) THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status <> 'pending'
     OR NEW.status NOT IN ('approved', 'rejected', 'expired')
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.requested_action IS DISTINCT FROM OLD.requested_action
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR lower(NEW.target_user_email) IS DISTINCT FROM lower(OLD.target_user_email)
     OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
     OR NEW.role_key IS DISTINCT FROM OLD.role_key
     OR NEW.expected_membership_version IS DISTINCT FROM OLD.expected_membership_version
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR lower(NEW.requested_by_user_email) IS DISTINCT FROM lower(OLD.requested_by_user_email)
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.decided_at < OLD.requested_at
     OR NEW.version IS DISTINCT FROM OLD.version + 1
     OR (NEW.status IN ('approved', 'rejected') AND (
        NEW.decided_by_user_email IS NULL OR NEW.decision_reason IS NULL
        OR NEW.decided_at IS NULL OR NEW.decided_at > OLD.expires_at
        OR lower(NEW.decided_by_user_email) = lower(OLD.requested_by_user_email)
        OR lower(NEW.decided_by_user_email) = lower(OLD.target_user_email)
     ))
     OR (NEW.status = 'expired' AND (
       NEW.decided_by_user_email IS NOT NULL OR NEW.decision_reason IS NOT NULL
       OR NEW.decided_at IS NULL OR NEW.decided_at < OLD.expires_at
     )) THEN
    RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;


DROP TRIGGER IF EXISTS tenant_membership_change_request_guard
  ON tenant_membership_change_request;
CREATE TRIGGER tenant_membership_change_request_guard
BEFORE INSERT OR UPDATE OR DELETE ON tenant_membership_change_request
FOR EACH ROW EXECUTE FUNCTION tenant_membership_change_request_guard_v1();

CREATE TABLE IF NOT EXISTS tenant_membership_governance_event_context (
  event_id bigint PRIMARY KEY REFERENCES tenant_iam_event(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL REFERENCES tenant_membership_change_request(id) ON DELETE RESTRICT,
  actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id) ON DELETE RESTRICT,
  actor_session_version integer NOT NULL,
  release_sha char(40) NOT NULL,
  expected_version integer NOT NULL,
  reason_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_membership_governance_context_session_version_ck
    CHECK (actor_session_version > 0),
  CONSTRAINT tenant_membership_governance_context_release_ck
    CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT tenant_membership_governance_context_expected_version_ck
    CHECK (expected_version >= 0),
  CONSTRAINT tenant_membership_governance_context_reason_hash_ck
    CHECK (reason_hash ~ '^[a-f0-9]{64}$')
);

DROP TRIGGER IF EXISTS tenant_membership_governance_event_context_append_only
  ON tenant_membership_governance_event_context;
CREATE TRIGGER tenant_membership_governance_event_context_append_only
BEFORE UPDATE OR DELETE ON tenant_membership_governance_event_context
FOR EACH ROW EXECUTE FUNCTION tenant_iam_reject_change();

-- Permite revocar autoridad histórica aun si el binding que la originó dejó de
-- ser el certificado actual. La excepción es estrictamente revocatoria y los
-- demás cambios siguen exigiendo el binding GRH vigente.
CREATE OR REPLACE FUNCTION tenant_action_validate_binding()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  binding_row platform_tenant_source_binding%ROWTYPE;
  row_payload jsonb;
BEGIN
  IF TG_TABLE_NAME NOT IN ('tenant_action_employment_link', 'tenant_action_area_scope') THEN
    RAISE EXCEPTION 'TENANT_ACTION_TRIGGER_TABLE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.active IS TRUE AND NEW.active IS FALSE THEN
    IF (to_jsonb(NEW) - ARRAY['active','revoked_at','updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['active','revoked_at','updated_at'])
       OR NEW.revoked_at IS NULL OR NEW.updated_at < OLD.updated_at THEN
      RAISE EXCEPTION 'TENANT_ACTION_REVOCATION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  row_payload := to_jsonb(NEW);
  SELECT binding.* INTO binding_row
  FROM platform_tenant_source_binding binding
  JOIN tenant_identity_policy policy
    ON policy.tenant_id = binding.tenant_id
   AND policy.certified_source_binding_id = binding.id
  WHERE binding.id = (row_payload->>'source_binding_id')::uuid
    AND binding.tenant_id = (row_payload->>'tenant_id')::uuid
    AND binding.source_system = 'GRH' AND binding.verified IS TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'tenant_action_employment_link' THEN
    IF (row_payload->>'active')::boolean IS TRUE THEN
      PERFORM 1
      FROM employment_contract contract
      JOIN source_import_batch batch
        ON batch.id = contract.source_batch_id
       AND batch.source_system = 'GRH'
       AND batch.source_database = binding_row.source_database
       AND batch.validation_state = 'published'
       AND batch.legacy_import_run_id IS NOT NULL
      WHERE contract.id = (row_payload->>'employment_contract_id')::uuid
        AND contract.status = 'active'
        AND contract.source_system = 'GRH'
        AND contract.legacy_company_id = binding_row.source_company_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_OUT_OF_SCOPE' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'tenant_action_area_scope' THEN
    IF (row_payload->>'active')::boolean IS TRUE
       AND (row_payload->>'company_id')::bigint IS DISTINCT FROM binding_row.source_company_id THEN
      RAISE EXCEPTION 'TENANT_ACTION_SCOPE_OUT_OF_BINDING' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION tenant_membership_governance_apply_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_command text,
  p_idempotency_key uuid,
  p_command_hash text,
  p_expected_version integer,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor_email text := lower(btrim(p_actor_email));
  actor_user internal_users%ROWTYPE;
  maker_user internal_users%ROWTYPE;
  target_user internal_users%ROWTYPE;
  tenant_row platform_tenant%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  binding_row platform_tenant_source_binding%ROWTYPE;
  membership_row tenant_membership%ROWTYPE;
  role_row iam_role%ROWTYPE;
  replay tenant_iam_event%ROWTYPE;
  replay_context tenant_membership_governance_event_context%ROWTYPE;
  request_row tenant_membership_change_request%ROWTYPE;
  target_email text;
  reason_value text;
  reason_hash_value text;
  tenant_id_value uuid;
  membership_id_value uuid;
  request_id_value uuid;
  event_id_value bigint;
  eligible_checker_count integer := 0;
  expired_request_ids uuid[] := ARRAY[]::uuid[];
  revoked_sessions integer := 0;
  revoked_overrides integer := 0;
  preserved_deny_overrides integer := 0;
  remaining_deny_overrides integer := 0;
  revoked_employment_links integer := 0;
  revoked_area_scopes integer := 0;
  revoked_exclusives integer := 0;
  authority_snapshot jsonb := '{}'::jsonb;
  authority_snapshot_hash text;
  authority_row tenant_action_authority%ROWTYPE;
  command_hash_value text;
  request_time_value timestamptz;
  decision_time_value timestamptz;
  conflict_constraint_name text;
  result_value jsonb;
BEGIN
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR p_command IS NULL OR p_command NOT IN (
       'request_existing_membership', 'request_membership_reactivation',
       'approve_membership_change', 'reject_membership_change'
     )
     OR p_idempotency_key IS NULL
     OR p_command_hash IS NULL OR p_command_hash !~ '^[a-f0-9]{64}$'
     OR p_expected_version IS NULL OR p_expected_version < 0
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'TENANT_MEMBERSHIP_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- El hash que gobierna replay se deriva dentro de PostgreSQL. El hash del
  -- llamador sólo conserva compatibilidad de firma y nunca es autoridad.
  command_hash_value := encode(digest(convert_to(jsonb_build_object(
    'command', p_command,
    'expectedVersion', p_expected_version,
    'payload', p_payload,
    'actorSessionId', p_actor_session_id,
    'actorSessionVersion', p_actor_session_version,
    'releaseSha', p_release_sha
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'PLATFORM_OWNER:GOVERNANCE', 12012
  ));
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    actor_email, p_actor_session_id, p_actor_session_version,
    'platform.users.manage'
  );
  SELECT * INTO STRICT actor_user FROM internal_users users
  WHERE lower(users.email) = actor_email AND users.active IS TRUE FOR SHARE;
  PERFORM 1 FROM platform_user_role assignment
  WHERE lower(assignment.user_email) = actor_email
    AND assignment.role_key = 'PLATFORM_OWNER' AND assignment.active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_MEMBERSHIP_OWNER_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM tenant_identity_mfa_factor factor
  WHERE lower(factor.user_email) = actor_email AND factor.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_MEMBERSHIP_ACTOR_MFA_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor_email || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO replay FROM tenant_iam_event event
  WHERE lower(event.actor_user_email) = actor_email
    AND event.idempotency_key = p_idempotency_key FOR SHARE;
  IF FOUND THEN
    SELECT * INTO replay_context
    FROM tenant_membership_governance_event_context context
    WHERE context.event_id = replay.id FOR SHARE;
    IF NOT FOUND
       OR replay.command IS DISTINCT FROM p_command
       OR replay.command_hash IS DISTINCT FROM command_hash_value
       OR replay_context.actor_session_id IS DISTINCT FROM p_actor_session_id
       OR replay_context.actor_session_version IS DISTINCT FROM p_actor_session_version
       OR replay_context.release_sha IS DISTINCT FROM p_release_sha
       OR replay_context.expected_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'TENANT_IAM_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN replay.result || jsonb_build_object('replayed', true);
  END IF;

  IF p_command IN ('request_existing_membership', 'request_membership_reactivation') THEN
    IF p_command = 'request_existing_membership' THEN
      IF p_expected_version <> 0
         OR NOT (p_payload ?& ARRAY['tenantId','email','roleKey','reason'])
         OR EXISTS (
           SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
           WHERE field.key <> ALL(ARRAY['tenantId','email','roleKey','reason'])
         )
         OR jsonb_typeof(p_payload->'tenantId') IS DISTINCT FROM 'string'
         OR (p_payload->>'tenantId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR jsonb_typeof(p_payload->'email') IS DISTINCT FROM 'string'
         OR jsonb_typeof(p_payload->'roleKey') IS DISTINCT FROM 'string'
         OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_COMMAND_INVALID' USING ERRCODE = 'P0001';
      END IF;
      tenant_id_value := (p_payload->>'tenantId')::uuid;
      target_email := lower(btrim(p_payload->>'email'));
      reason_value := btrim(p_payload->>'reason');
      IF target_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
         OR length(target_email) > 254
         OR p_payload->>'roleKey' <> 'TENANT_RRHH_ADMIN_OPERATIVO'
         OR length(reason_value) NOT BETWEEN 3 AND 500 THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_COMMAND_INVALID' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      IF p_expected_version < 1
         OR NOT (p_payload ?& ARRAY['membershipId','reason'])
         OR EXISTS (
           SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
           WHERE field.key <> ALL(ARRAY['membershipId','reason'])
         )
         OR jsonb_typeof(p_payload->'membershipId') IS DISTINCT FROM 'string'
         OR (p_payload->>'membershipId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_COMMAND_INVALID' USING ERRCODE = 'P0001';
      END IF;
      membership_id_value := (p_payload->>'membershipId')::uuid;
      reason_value := btrim(p_payload->>'reason');
      IF length(reason_value) NOT BETWEEN 3 AND 500 THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_COMMAND_INVALID' USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO membership_row FROM tenant_membership membership
      WHERE membership.id = membership_id_value;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_IAM_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0001';
      END IF;
      tenant_id_value := membership_row.tenant_id;
      target_email := lower(membership_row.user_email);
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      tenant_id_value::text || ':' || target_email || ':membership', 0
    ));
    IF p_command = 'request_membership_reactivation' THEN
      SELECT * INTO membership_row FROM tenant_membership membership
      WHERE membership.id = membership_id_value FOR UPDATE;
      IF NOT FOUND OR membership_row.tenant_id IS DISTINCT FROM tenant_id_value
         OR lower(membership_row.user_email) IS DISTINCT FROM target_email THEN
        RAISE EXCEPTION 'TENANT_IAM_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    SELECT * INTO tenant_row FROM platform_tenant tenant
    WHERE tenant.id = tenant_id_value AND tenant.status = 'active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_TENANT_NOT_READY' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO policy_row FROM tenant_identity_policy policy
    WHERE policy.tenant_id = tenant_id_value
      AND policy.tenant_data_plane_ready IS TRUE
      AND policy.certified_release_sha = p_release_sha FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_TENANT_NOT_READY' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO binding_row FROM platform_tenant_source_binding binding
    WHERE binding.id = policy_row.certified_source_binding_id
      AND binding.tenant_id = tenant_id_value
      AND binding.source_system = 'GRH' AND binding.verified IS TRUE FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_TENANT_NOT_READY' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO target_user FROM internal_users users
    WHERE lower(users.email) = target_email
      AND users.active IS TRUE AND users.auth_mode = 'managed' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_TARGET_MANAGED_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1 FROM tenant_identity_mfa_factor factor
    WHERE lower(factor.user_email) = target_email AND factor.status = 'active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_TARGET_MFA_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO role_row FROM iam_role role
    WHERE role.role_key = CASE WHEN p_command = 'request_existing_membership'
      THEN p_payload->>'roleKey' ELSE membership_row.role_key END
      AND role.role_key = 'TENANT_RRHH_ADMIN_OPERATIVO'
      AND role.scope_kind = 'tenant' AND role.system_managed IS TRUE FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_IAM_ROLE_INVALID' USING ERRCODE = 'P0001';
    END IF;

    IF p_command = 'request_existing_membership' THEN
      IF EXISTS (
        SELECT 1 FROM tenant_membership existing
        WHERE existing.tenant_id = tenant_id_value
          AND lower(existing.user_email) = target_email
      ) THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_ALREADY_EXISTS' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      IF membership_row.version IS DISTINCT FROM p_expected_version THEN
        RAISE EXCEPTION 'TENANT_IAM_VERSION_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
      IF membership_row.status <> 'suspended' THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_NOT_SUSPENDED' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    PERFORM 1
    FROM platform_user_role assignment
    JOIN internal_users checker
      ON lower(checker.email) = lower(assignment.user_email)
    JOIN tenant_identity_mfa_factor factor
      ON lower(factor.user_email) = lower(assignment.user_email)
     AND factor.status = 'active'
    WHERE assignment.role_key = 'PLATFORM_OWNER' AND assignment.active IS TRUE
      AND checker.active IS TRUE
      AND lower(assignment.user_email) <> actor_email
      AND lower(assignment.user_email) <> target_email
    FOR SHARE OF assignment, checker, factor;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_MAKER_CHECKER_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;
    SELECT count(DISTINCT lower(assignment.user_email))::integer
      INTO eligible_checker_count
    FROM platform_user_role assignment
    JOIN internal_users checker
      ON lower(checker.email) = lower(assignment.user_email)
    JOIN tenant_identity_mfa_factor factor
      ON lower(factor.user_email) = lower(assignment.user_email)
     AND factor.status = 'active'
    WHERE assignment.role_key = 'PLATFORM_OWNER' AND assignment.active IS TRUE
      AND checker.active IS TRUE
      AND lower(assignment.user_email) <> actor_email
      AND lower(assignment.user_email) <> target_email;

    decision_time_value := clock_timestamp();
    WITH expired AS (
      UPDATE tenant_membership_change_request request SET
        status = 'expired', decided_at = decision_time_value, version = version + 1
      WHERE request.tenant_id = tenant_id_value
        AND lower(request.target_user_email) = target_email
        AND request.status = 'pending' AND request.expires_at <= decision_time_value
      RETURNING request.id
    )
    SELECT COALESCE(array_agg(expired.id ORDER BY expired.id), ARRAY[]::uuid[])
      INTO expired_request_ids FROM expired;
    IF EXISTS (
      SELECT 1 FROM tenant_membership_change_request request
      WHERE request.tenant_id = tenant_id_value
        AND lower(request.target_user_email) = target_email
        AND request.status = 'pending'
    ) THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_PENDING' USING ERRCODE = 'P0001';
    END IF;

    BEGIN
      request_time_value := clock_timestamp();
      INSERT INTO tenant_membership_change_request (
        requested_action, tenant_id, target_user_email, membership_id, role_key,
        expected_membership_version, reason, requested_by_user_email,
        requested_at, expires_at
      ) VALUES (
        CASE WHEN p_command = 'request_existing_membership' THEN 'add' ELSE 'reactivate' END,
        tenant_id_value, target_user.email, membership_id_value, role_row.role_key,
        p_expected_version, reason_value, actor_user.email,
        request_time_value, request_time_value + interval '24 hours'
      ) RETURNING * INTO request_row;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS conflict_constraint_name = CONSTRAINT_NAME;
      IF conflict_constraint_name = 'tenant_membership_change_request_pending_uk' THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_PENDING' USING ERRCODE = 'P0001';
      END IF;
      RAISE;
    END;
    request_id_value := request_row.id;
    result_value := jsonb_build_object(
      'request', jsonb_build_object(
        'id', request_row.id, 'action', request_row.requested_action,
        'status', request_row.status, 'version', request_row.version,
        'tenantId', request_row.tenant_id,
        'targetEmail', lower(request_row.target_user_email),
        'roleKey', request_row.role_key,
        'expectedMembershipVersion', request_row.expected_membership_version,
        'expiresAt', request_row.expires_at
      ),
      'membershipChanged', false,
      'approvalRequired', true,
      'eligibleCheckerCount', eligible_checker_count,
      'expiredRequestIds', to_jsonb(expired_request_ids),
      'credentialsCreated', false,
      'futureTenantAccess', false,
      'databaseSuperuser', false,
      'replayed', false
    );
  ELSE
    IF p_expected_version < 1
       OR NOT (p_payload ?& ARRAY['requestId','reason'])
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['requestId','reason'])
       )
       OR jsonb_typeof(p_payload->'requestId') IS DISTINCT FROM 'string'
       OR (p_payload->>'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    request_id_value := (p_payload->>'requestId')::uuid;
    reason_value := btrim(p_payload->>'reason');
    IF length(reason_value) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO request_row FROM tenant_membership_change_request request
    WHERE request.id = request_id_value;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    tenant_id_value := request_row.tenant_id;
    target_email := lower(request_row.target_user_email);
    membership_id_value := request_row.membership_id;
    PERFORM pg_advisory_xact_lock(hashtextextended(
      tenant_id_value::text || ':' || target_email || ':membership', 0
    ));
    SELECT * INTO request_row FROM tenant_membership_change_request request
    WHERE request.id = request_id_value FOR UPDATE;
    IF NOT FOUND OR request_row.tenant_id IS DISTINCT FROM tenant_id_value
       OR lower(request_row.target_user_email) IS DISTINCT FROM target_email
       OR request_row.membership_id IS DISTINCT FROM membership_id_value THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF request_row.status <> 'pending' THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_NOT_PENDING' USING ERRCODE = 'P0001';
    END IF;
    IF request_row.expires_at <= clock_timestamp() THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_NOT_PENDING' USING ERRCODE = 'P0001';
    END IF;
    IF request_row.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'TENANT_IAM_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF lower(request_row.requested_by_user_email) = actor_email
       OR lower(request_row.target_user_email) = actor_email THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO maker_user FROM internal_users users
    WHERE lower(users.email) = lower(request_row.requested_by_user_email)
      AND users.active IS TRUE FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_MAKER_CHECKER_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1
    FROM platform_user_role assignment
    JOIN tenant_identity_mfa_factor factor
      ON lower(factor.user_email) = lower(assignment.user_email)
     AND factor.status = 'active'
    WHERE lower(assignment.user_email) = lower(maker_user.email)
      AND assignment.role_key = 'PLATFORM_OWNER' AND assignment.active IS TRUE
    FOR SHARE OF assignment, factor;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_MAKER_CHECKER_UNAVAILABLE' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'reject_membership_change' THEN
      decision_time_value := clock_timestamp();
      IF request_row.expires_at <= decision_time_value THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_NOT_PENDING' USING ERRCODE = 'P0001';
      END IF;
      UPDATE tenant_membership_change_request SET
        status = 'rejected', decided_by_user_email = actor_user.email,
        decision_reason = reason_value, decided_at = decision_time_value, version = version + 1
      WHERE id = request_row.id RETURNING * INTO request_row;
      result_value := jsonb_build_object(
        'request', jsonb_build_object(
          'id', request_row.id, 'action', request_row.requested_action,
          'status', request_row.status, 'version', request_row.version,
          'tenantId', request_row.tenant_id,
          'targetEmail', target_email, 'roleKey', request_row.role_key
        ),
        'membershipChanged', false,
        'approvalRequired', true,
        'credentialsCreated', false,
        'futureTenantAccess', false,
        'databaseSuperuser', false,
        'replayed', false
      );
    ELSE
      IF request_row.requested_action = 'reactivate' THEN
        SELECT * INTO membership_row FROM tenant_membership membership
        WHERE membership.id = request_row.membership_id
          AND membership.tenant_id = tenant_id_value
          AND lower(membership.user_email) = target_email FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'TENANT_IAM_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0001';
        END IF;
        IF membership_row.version IS DISTINCT FROM request_row.expected_membership_version THEN
          RAISE EXCEPTION 'TENANT_IAM_VERSION_CONFLICT' USING ERRCODE = 'P0001';
        END IF;
        IF membership_row.status <> 'suspended'
           OR membership_row.role_key IS DISTINCT FROM request_row.role_key THEN
          RAISE EXCEPTION 'TENANT_MEMBERSHIP_NOT_SUSPENDED' USING ERRCODE = 'P0001';
        END IF;
      END IF;
      SELECT * INTO tenant_row FROM platform_tenant tenant
      WHERE tenant.id = tenant_id_value AND tenant.status = 'active' FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_TENANT_NOT_READY' USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO policy_row FROM tenant_identity_policy policy
      WHERE policy.tenant_id = tenant_id_value
        AND policy.tenant_data_plane_ready IS TRUE
        AND policy.certified_release_sha = p_release_sha FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_TENANT_NOT_READY' USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO binding_row FROM platform_tenant_source_binding binding
      WHERE binding.id = policy_row.certified_source_binding_id
        AND binding.tenant_id = tenant_id_value
        AND binding.source_system = 'GRH' AND binding.verified IS TRUE FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_TENANT_NOT_READY' USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO target_user FROM internal_users users
      WHERE lower(users.email) = target_email
        AND users.active IS TRUE AND users.auth_mode = 'managed' FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_TARGET_MANAGED_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      PERFORM 1 FROM tenant_identity_mfa_factor factor
      WHERE lower(factor.user_email) = target_email AND factor.status = 'active' FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_TARGET_MFA_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO role_row FROM iam_role role
      WHERE role.role_key = request_row.role_key
        AND role.role_key = 'TENANT_RRHH_ADMIN_OPERATIVO'
        AND role.scope_kind = 'tenant' AND role.system_managed IS TRUE FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_IAM_ROLE_INVALID' USING ERRCODE = 'P0001';
      END IF;

      IF request_row.requested_action = 'add' THEN
        IF request_row.expected_membership_version <> 0 OR EXISTS (
          SELECT 1 FROM tenant_membership existing
          WHERE existing.tenant_id = tenant_id_value
            AND lower(existing.user_email) = target_email
        ) THEN
          RAISE EXCEPTION 'TENANT_MEMBERSHIP_ALREADY_EXISTS' USING ERRCODE = 'P0001';
        END IF;
        INSERT INTO tenant_membership (
          tenant_id, user_email, role_key, status, invited_by_user_email,
          activated_at, suspended_at, updated_at
        ) VALUES (
          tenant_id_value, target_user.email, role_row.role_key, 'active',
          request_row.requested_by_user_email, clock_timestamp(), NULL, clock_timestamp()
        ) RETURNING * INTO membership_row;
        membership_id_value := membership_row.id;
      ELSE
        SELECT * INTO authority_row FROM tenant_action_authority authority
        WHERE authority.membership_id = membership_row.id
          AND authority.tenant_id = tenant_id_value FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'TENANT_ACTION_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
        END IF;
        PERFORM 1 FROM tenant_membership_capability_override override_row
        WHERE override_row.membership_id = membership_row.id
        ORDER BY override_row.capability_key FOR UPDATE;
        PERFORM 1 FROM tenant_action_employment_link link
        WHERE link.membership_id = membership_row.id
        ORDER BY link.id FOR UPDATE;
        PERFORM 1 FROM tenant_action_area_scope scope
        WHERE scope.membership_id = membership_row.id
        ORDER BY scope.id FOR UPDATE;
        PERFORM 1 FROM tenant_exclusive_capability exclusive
        WHERE exclusive.membership_id = membership_row.id
        ORDER BY exclusive.id FOR UPDATE;
        SELECT count(*)::integer INTO preserved_deny_overrides
        FROM tenant_membership_capability_override override_row
        WHERE override_row.membership_id = membership_row.id
          AND override_row.deny_override IS TRUE;
        SELECT jsonb_build_object(
          'authorityVersion', authority_row.version,
          'overrides', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'capabilityKey', override_row.capability_key,
              'allow', override_row.allow_override,
              'deny', override_row.deny_override,
              'reason', override_row.reason,
              'grantedByEmail', lower(override_row.granted_by_user_email),
              'createdAt', override_row.created_at
            ) ORDER BY override_row.capability_key)
            FROM tenant_membership_capability_override override_row
            WHERE override_row.membership_id = membership_row.id
          ), '[]'::jsonb),
          'employmentLinkIds', COALESCE((
            SELECT jsonb_agg(link.id ORDER BY link.id)
            FROM tenant_action_employment_link link
            WHERE link.membership_id = membership_row.id AND link.active IS TRUE
          ), '[]'::jsonb),
          'areaScopeIds', COALESCE((
            SELECT jsonb_agg(scope.id ORDER BY scope.id)
            FROM tenant_action_area_scope scope
            WHERE scope.membership_id = membership_row.id AND scope.active IS TRUE
          ), '[]'::jsonb),
          'exclusiveAssignmentIds', COALESCE((
            SELECT jsonb_agg(exclusive.id ORDER BY exclusive.id)
            FROM tenant_exclusive_capability exclusive
            WHERE exclusive.membership_id = membership_row.id AND exclusive.active IS TRUE
          ), '[]'::jsonb)
        ) INTO authority_snapshot;
        authority_snapshot_hash := encode(digest(
          convert_to(authority_snapshot::text, 'UTF8'), 'sha256'
        ), 'hex');

        DELETE FROM tenant_membership_capability_override override_row
        WHERE override_row.membership_id = membership_row.id
          AND override_row.allow_override IS TRUE;
        GET DIAGNOSTICS revoked_overrides = ROW_COUNT;
        UPDATE tenant_action_employment_link link SET
          active = false, revoked_at = clock_timestamp(), updated_at = clock_timestamp()
        WHERE link.membership_id = membership_row.id AND link.active IS TRUE;
        GET DIAGNOSTICS revoked_employment_links = ROW_COUNT;
        UPDATE tenant_action_area_scope scope SET
          active = false, revoked_at = clock_timestamp(), updated_at = clock_timestamp()
        WHERE scope.membership_id = membership_row.id AND scope.active IS TRUE;
        GET DIAGNOSTICS revoked_area_scopes = ROW_COUNT;
        UPDATE tenant_exclusive_capability exclusive SET
          active = false, revoked_at = clock_timestamp()
        WHERE exclusive.membership_id = membership_row.id AND exclusive.active IS TRUE;
        GET DIAGNOSTICS revoked_exclusives = ROW_COUNT;
        IF EXISTS (
          SELECT 1 FROM tenant_membership_capability_override override_row
          WHERE override_row.membership_id = membership_row.id
            AND override_row.allow_override IS TRUE
        ) OR EXISTS (
          SELECT 1 FROM tenant_action_employment_link link
          WHERE link.membership_id = membership_row.id AND link.active IS TRUE
        ) OR EXISTS (
          SELECT 1 FROM tenant_action_area_scope scope
          WHERE scope.membership_id = membership_row.id AND scope.active IS TRUE
        ) OR EXISTS (
          SELECT 1 FROM tenant_exclusive_capability exclusive
          WHERE exclusive.membership_id = membership_row.id AND exclusive.active IS TRUE
        ) THEN
          RAISE EXCEPTION 'TENANT_MEMBERSHIP_STALE_AUTHORITY_REVIEW_REQUIRED' USING ERRCODE = 'P0001';
        END IF;
        SELECT count(*)::integer INTO remaining_deny_overrides
        FROM tenant_membership_capability_override override_row
        WHERE override_row.membership_id = membership_row.id
          AND override_row.deny_override IS TRUE;
        IF remaining_deny_overrides IS DISTINCT FROM preserved_deny_overrides THEN
          RAISE EXCEPTION 'TENANT_MEMBERSHIP_STALE_AUTHORITY_REVIEW_REQUIRED' USING ERRCODE = 'P0001';
        END IF;
        UPDATE tenant_action_authority SET
          version = version + 1, updated_at = clock_timestamp()
        WHERE membership_id = membership_row.id RETURNING * INTO authority_row;
        UPDATE tenant_identity_session SET
          status = 'revoked', revoked_at = clock_timestamp(), revoked_by_user_email = actor_user.email,
          version = version + 1
        WHERE lower(user_email) = target_email
          AND active_tenant_id = tenant_id_value
          AND source IN ('membership','legacy_explicit') AND status = 'active';
        GET DIAGNOSTICS revoked_sessions = ROW_COUNT;
        UPDATE tenant_membership SET
          status = 'active', activated_at = COALESCE(activated_at, clock_timestamp()),
          suspended_at = NULL, version = version + 1, updated_at = clock_timestamp()
        WHERE id = membership_row.id RETURNING * INTO membership_row;
        membership_id_value := membership_row.id;
      END IF;
      PERFORM tenant_iam_assert_no_sod_conflict(membership_row.id);
      decision_time_value := clock_timestamp();
      IF request_row.expires_at <= decision_time_value THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_REQUEST_NOT_PENDING' USING ERRCODE = 'P0001';
      END IF;
      UPDATE tenant_membership_change_request SET
        status = 'approved', decided_by_user_email = actor_user.email,
        decision_reason = reason_value, decided_at = decision_time_value, version = version + 1
      WHERE id = request_row.id RETURNING * INTO request_row;
      result_value := jsonb_build_object(
        'request', jsonb_build_object(
          'id', request_row.id, 'action', request_row.requested_action,
          'status', request_row.status, 'version', request_row.version,
          'tenantId', request_row.tenant_id,
          'targetEmail', target_email, 'roleKey', request_row.role_key
        ),
        'membership', jsonb_build_object(
          'id', membership_row.id, 'tenantId', membership_row.tenant_id,
          'roleKey', membership_row.role_key, 'status', membership_row.status,
          'version', membership_row.version, 'mfaRequired', true,
          'explicitTenantAccess', true
        ),
        'membershipChanged', true,
        'approvalRequired', true,
        'credentialsCreated', false,
        'futureTenantAccess', false,
        'databaseSuperuser', false,
        'tenantSessionsRevoked', revoked_sessions,
        'authorityRevocation', CASE WHEN request_row.requested_action = 'reactivate'
          THEN jsonb_build_object(
            'allowOverrideRowsDeleted', revoked_overrides,
            'denyOverrideRowsPreserved', preserved_deny_overrides,
            'employmentLinksRevoked', revoked_employment_links,
            'areaScopesRevoked', revoked_area_scopes,
            'exclusiveAssignmentsRevoked', revoked_exclusives,
            'resultingAuthorityVersion', authority_row.version,
            'snapshot', authority_snapshot,
            'snapshotSha256', authority_snapshot_hash
          ) ELSE NULL END,
        'replayed', false
      );
    END IF;
  END IF;

  reason_hash_value := encode(digest(convert_to(reason_value, 'UTF8'), 'sha256'), 'hex');
  result_value := result_value || jsonb_build_object(
    'releaseSha', p_release_sha,
    'actorSessionVersion', p_actor_session_version
  );
  INSERT INTO tenant_iam_event (
    actor_user_email, tenant_id, membership_id, command, target_type, target_id,
    idempotency_key, command_hash, result
  ) VALUES (
    actor_user.email, tenant_id_value, membership_id_value,
    p_command, 'tenant_membership_request', request_id_value::text,
    p_idempotency_key, command_hash_value, result_value
  ) RETURNING id INTO event_id_value;
  INSERT INTO tenant_membership_governance_event_context (
    event_id, request_id, actor_session_id, actor_session_version,
    release_sha, expected_version, reason_hash
  ) VALUES (
    event_id_value, request_id_value, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_expected_version, reason_hash_value
  );
  RETURN result_value;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'TENANT_MEMBERSHIP_COMMAND_INVALID' USING ERRCODE = 'P0001';
END
$$;

DO $$
DECLARE
  migration_installed boolean := EXISTS (
    SELECT 1 FROM schema_migrations migration
    WHERE migration.version = '013-existing-identity-membership-governance'
  );
BEGIN
  IF to_regprocedure('public.tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)') IS NOT NULL
     AND migration_installed IS FALSE THEN
    RAISE EXCEPTION 'TENANT_MEMBERSHIP_UNLEDGERED_CORE' USING ERRCODE = 'P0001';
  ELSIF to_regprocedure('public.tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)') IS NULL THEN
    IF migration_installed IS TRUE THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_ADMIN_VIEW_CORE_MISSING' USING ERRCODE = 'P0001';
    END IF;
    IF to_regprocedure('public.tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)') IS NULL THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_ADMIN_VIEW_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc function_row
      WHERE function_row.oid = 'public.tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)'::regprocedure
        AND function_row.prosecdef IS TRUE
        AND function_row.proowner = current_user::regrole::oid
        AND function_row.proconfig @> ARRAY['search_path=public, pg_temp']::text[]
    ) THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_ADMIN_VIEW_UNSAFE' USING ERRCODE = 'P0001';
    END IF;
    ALTER FUNCTION tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)
      RENAME TO tenant_iam_admin_view_core_013;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc function_row
    WHERE function_row.oid = 'public.tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)'::regprocedure
      AND function_row.prosecdef IS TRUE
      AND function_row.proowner = current_user::regrole::oid
      AND function_row.proconfig @> ARRAY['search_path=public, pg_temp']::text[]
  ) THEN
    RAISE EXCEPTION 'TENANT_MEMBERSHIP_ADMIN_VIEW_UNSAFE' USING ERRCODE = 'P0001';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION tenant_iam_admin_view_v3(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_resource text,
  p_tenant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  result_value jsonb;
  extra_commands jsonb := '[]'::jsonb;
  requests_value jsonb := '[]'::jsonb;
  eligible_tenant_ids jsonb := '[]'::jsonb;
  usable_owner_count integer := 0;
  actionable_request_count integer := 0;
  actor_governance_ready boolean := false;
  view_time_value timestamptz := clock_timestamp();
  safe_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
BEGIN
  result_value := tenant_iam_admin_view_core_013(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_resource, p_tenant_id, p_limit
  );
  IF p_resource = 'bootstrap' THEN
    SELECT EXISTS (
      SELECT 1
      FROM platform_user_role actor_assignment
      JOIN internal_users actor_user
        ON lower(actor_user.email) = lower(actor_assignment.user_email)
      WHERE lower(actor_assignment.user_email) = lower(btrim(p_actor_email))
        AND actor_assignment.role_key = 'PLATFORM_OWNER'
        AND actor_assignment.active IS TRUE AND actor_user.active IS TRUE
        AND EXISTS (
          SELECT 1 FROM tenant_identity_mfa_factor actor_factor
          WHERE lower(actor_factor.user_email) = lower(actor_assignment.user_email)
            AND actor_factor.status = 'active'
        )
    ) INTO actor_governance_ready;
    SELECT count(DISTINCT lower(assignment.user_email))::integer INTO usable_owner_count
    FROM platform_user_role assignment
    JOIN internal_users users ON lower(users.email) = lower(assignment.user_email)
    WHERE assignment.role_key = 'PLATFORM_OWNER' AND assignment.active IS TRUE
      AND users.active IS TRUE
      AND EXISTS (
        SELECT 1 FROM tenant_identity_mfa_factor factor
        WHERE lower(factor.user_email) = lower(assignment.user_email)
          AND factor.status = 'active'
      );
    IF actor_governance_ready AND usable_owner_count >= 2 THEN
      SELECT COALESCE(jsonb_agg(tenant.id ORDER BY tenant.id), '[]'::jsonb)
        INTO eligible_tenant_ids
      FROM platform_tenant tenant
      JOIN tenant_identity_policy policy
        ON policy.tenant_id = tenant.id
       AND policy.tenant_data_plane_ready IS TRUE
       AND policy.certified_release_sha = p_release_sha
      JOIN platform_tenant_source_binding binding
        ON binding.id = policy.certified_source_binding_id
       AND binding.tenant_id = tenant.id
       AND binding.source_system = 'GRH' AND binding.verified IS TRUE
      WHERE tenant.status = 'active';
    END IF;
    IF actor_governance_ready AND jsonb_array_length(eligible_tenant_ids) > 0 AND EXISTS (
      SELECT 1
      FROM platform_user_role checker_assignment
      JOIN internal_users checker_user
        ON lower(checker_user.email) = lower(checker_assignment.user_email)
      WHERE checker_assignment.role_key = 'PLATFORM_OWNER'
        AND checker_assignment.active IS TRUE AND checker_user.active IS TRUE
        AND lower(checker_assignment.user_email) <> lower(btrim(p_actor_email))
        AND EXISTS (
          SELECT 1 FROM tenant_identity_mfa_factor checker_factor
          WHERE lower(checker_factor.user_email) = lower(checker_assignment.user_email)
            AND checker_factor.status = 'active'
        )
    ) THEN
      extra_commands := jsonb_build_array(
        'request_existing_membership', 'request_membership_reactivation'
      );
    END IF;
    SELECT count(DISTINCT request.id)::integer INTO actionable_request_count
    FROM tenant_membership_change_request request
    JOIN platform_user_role maker_assignment
      ON lower(maker_assignment.user_email) = lower(request.requested_by_user_email)
     AND maker_assignment.role_key = 'PLATFORM_OWNER'
     AND maker_assignment.active IS TRUE
    JOIN internal_users maker_user
      ON lower(maker_user.email) = lower(request.requested_by_user_email)
     AND maker_user.active IS TRUE
    WHERE actor_governance_ready
      AND (p_tenant_id IS NULL OR request.tenant_id = p_tenant_id)
      AND request.status = 'pending' AND request.expires_at > view_time_value
      AND lower(request.requested_by_user_email) <> lower(btrim(p_actor_email))
      AND lower(request.target_user_email) <> lower(btrim(p_actor_email))
      AND EXISTS (
        SELECT 1 FROM tenant_identity_mfa_factor maker_factor
        WHERE lower(maker_factor.user_email) = lower(request.requested_by_user_email)
          AND maker_factor.status = 'active'
      );
    IF actionable_request_count > 0 THEN
      extra_commands := extra_commands || jsonb_build_array(
        'approve_membership_change', 'reject_membership_change'
      );
    END IF;
    SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.requested_at DESC, item.id), '[]'::jsonb)
      INTO requests_value
    FROM (
      SELECT request.id, request.requested_at,
        jsonb_build_object(
          'id', request.id,
          'action', request.requested_action,
          'status', CASE WHEN request.status = 'pending' AND request.expires_at <= view_time_value
            THEN 'expired' ELSE request.status END,
          'tenantId', request.tenant_id,
          'tenantName', tenant.short_name,
          'targetEmail', lower(request.target_user_email),
          'targetDisplayName', target.display_name,
          'membershipId', request.membership_id,
          'roleKey', request.role_key,
          'expectedMembershipVersion', request.expected_membership_version,
          'reason', request.reason,
          'requestedByEmail', lower(request.requested_by_user_email),
          'requestedByDisplayName', maker.display_name,
          'requestedAt', request.requested_at,
          'expiresAt', request.expires_at,
          'decidedByEmail', lower(request.decided_by_user_email),
          'decisionReason', request.decision_reason,
          'decidedAt', request.decided_at,
          'version', request.version,
          'canCurrentActorDecide', actor_governance_ready
            AND request.status = 'pending'
            AND request.expires_at > view_time_value
            AND lower(request.requested_by_user_email) <> lower(btrim(p_actor_email))
            AND lower(request.target_user_email) <> lower(btrim(p_actor_email))
            AND EXISTS (
              SELECT 1 FROM platform_user_role maker_assignment
              JOIN internal_users maker_user
                ON lower(maker_user.email) = lower(maker_assignment.user_email)
              JOIN tenant_identity_mfa_factor maker_factor
                ON lower(maker_factor.user_email) = lower(maker_assignment.user_email)
               AND maker_factor.status = 'active'
              WHERE lower(maker_assignment.user_email) = lower(request.requested_by_user_email)
                AND maker_assignment.role_key = 'PLATFORM_OWNER'
                AND maker_assignment.active IS TRUE AND maker_user.active IS TRUE
            )
        ) AS payload
      FROM tenant_membership_change_request request
      JOIN platform_tenant tenant ON tenant.id = request.tenant_id
      JOIN internal_users target ON lower(target.email) = lower(request.target_user_email)
      JOIN internal_users maker ON lower(maker.email) = lower(request.requested_by_user_email)
      WHERE p_tenant_id IS NULL OR request.tenant_id = p_tenant_id
      ORDER BY request.requested_at DESC, request.id
      LIMIT safe_limit
    ) item;
    result_value := result_value || jsonb_build_object(
      'allowedCommands', COALESCE(result_value->'allowedCommands', '[]'::jsonb) || extra_commands,
      'membershipRequests', requests_value,
      'membershipGovernance', jsonb_build_object(
        'explicitTenantOnly', true,
        'futureTenantAccess', false,
        'managedIdentityRequired', true,
        'mfaRequired', true,
        'databaseSuperuser', false,
        'makerCheckerRequired', true,
        'requestTtlHours', 24,
        'eligibleTenantIds', eligible_tenant_ids,
        'usableOwnerCount', usable_owner_count,
        'actorGovernanceReady', actor_governance_ready,
        'actionableRequestCount', actionable_request_count,
        'makerCheckerReady', actor_governance_ready AND usable_owner_count >= 2,
        'staleAuthorityReactivationBlocked', false,
        'staleAuthorityRevokedBeforeReactivation', true
      )
    );
  END IF;
  RETURN result_value;
END
$$;

COMMENT ON TABLE tenant_membership_change_request IS
  'Solicitudes versionadas de alta o reactivacion tenant. La persona solicitante y la objetivo nunca deciden la solicitud.';
COMMENT ON TABLE tenant_membership_governance_event_context IS
  'Contexto append-only que liga cada cambio a solicitud, sesion MFA, release, version y motivo hash.';
COMMENT ON FUNCTION tenant_membership_change_request_guard_v1() IS
  'Solo admite INSERT pending v1 y transiciones terminales; impide checker igual a maker o target.';
COMMENT ON FUNCTION tenant_action_validate_binding() IS
  'Valida binding GRH y permite exclusivamente revocar links/scopes historicos aunque el binding haya rotado.';
COMMENT ON FUNCTION tenant_membership_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb) IS
  'Maker-checker para alta o reactivacion explicita, solo en tenant certificado y para identidad managed con MFA.';
COMMENT ON FUNCTION tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer) IS
  'Vista administrativa 013 con solicitudes de membresia y controles de doble aprobacion.';

REVOKE ALL ON FUNCTION tenant_membership_change_request_guard_v1() FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_action_validate_binding() FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_iam_reject_change() FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_lifecycle_guard_employment_history_v1() FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_membership_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)
  FROM PUBLIC CASCADE;
REVOKE ALL ON TABLE tenant_membership_change_request,
  tenant_membership_governance_event_context FROM PUBLIC CASCADE;

DO $tenant_membership_function_acl_hardening$
DECLARE
  acl_row record;
  grantee_sql text;
BEGIN
  FOR acl_row IN
    SELECT namespace.nspname AS schema_name, function_row.proname AS function_name,
      pg_get_function_identity_arguments(function_row.oid) AS identity_arguments,
      acl.grantee, grantee_role.rolname AS grantee_name
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      function_row.proacl, acldefault('f', function_row.proowner)
    )) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE function_row.oid IN (
        'public.tenant_action_validate_binding()'::regprocedure,
        'public.tenant_iam_reject_change()'::regprocedure,
        'public.tenant_lifecycle_guard_employment_history_v1()'::regprocedure,
        'public.tenant_membership_change_request_guard_v1()'::regprocedure,
        'public.tenant_membership_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)'::regprocedure,
        'public.tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)'::regprocedure,
        'public.tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)'::regprocedure
      )
      AND acl.grantee <> function_row.proowner
  LOOP
    IF acl_row.grantee = 0 THEN
      grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_FUNCTION_ACL_GRANTEE_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE
      grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
      acl_row.schema_name, acl_row.function_name,
      acl_row.identity_arguments, grantee_sql
    );
  END LOOP;
END
$tenant_membership_function_acl_hardening$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app') THEN
    REVOKE ALL ON TABLE tenant_membership_change_request,
      tenant_membership_governance_event_context FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_membership_change_request_guard_v1()
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_action_validate_binding()
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_iam_reject_change()
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_lifecycle_guard_employment_history_v1()
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_iam_admin_view_core_013(text,uuid,integer,text,text,uuid,integer)
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_membership_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)
      FROM municontrol_actions_runtime_app CASCADE;
    GRANT EXECUTE ON FUNCTION tenant_membership_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)
      TO municontrol_actions_runtime_app;
    GRANT EXECUTE ON FUNCTION tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)
      TO municontrol_actions_runtime_app;
  END IF;
END
$$;

DO $tenant_membership_acl_hardening$
DECLARE
  acl_row record;
  grantee_sql text;
BEGIN
  FOR acl_row IN
    SELECT 'relation'::text AS object_kind,
      relation.relname AS object_name,
      NULL::text AS column_name,
      NULL::text AS privilege_type,
      acl.grantee,
      grantee_role.rolname AS grantee_name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'tenant_membership_change_request',
        'tenant_membership_governance_event_context'
      )
      AND acl.grantee <> relation.relowner
    UNION ALL
    SELECT 'column', relation.relname, attribute.attname, acl.privilege_type,
      acl.grantee, grantee_role.rolname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE
    CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'tenant_membership_change_request',
        'tenant_membership_governance_event_context'
      )
      AND acl.grantee <> relation.relowner
  LOOP
    IF acl_row.grantee = 0 THEN
      grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'TENANT_MEMBERSHIP_ACL_GRANTEE_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE
      grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    IF acl_row.object_kind = 'relation' THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s CASCADE',
        acl_row.object_name, grantee_sql
      );
    ELSE
      IF acl_row.privilege_type NOT IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN
        RAISE EXCEPTION 'TENANT_MEMBERSHIP_COLUMN_ACL_INVALID' USING ERRCODE = 'P0001';
      END IF;
      EXECUTE format(
        'REVOKE %s (%I) ON TABLE public.%I FROM %s CASCADE',
        acl_row.privilege_type, acl_row.column_name,
        acl_row.object_name, grantee_sql
      );
    END IF;
  END LOOP;
END
$tenant_membership_acl_hardening$;
