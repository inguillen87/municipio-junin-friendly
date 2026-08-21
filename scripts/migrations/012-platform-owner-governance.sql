-- MuniControl Friendly - Sprint 012
-- Gobierno de PLATFORM_OWNER con doble control, version optimista,
-- idempotencia y auditoria append-only. No crea usuarios ni credenciales.

ALTER TABLE platform_user_role
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE platform_user_role
  ADD COLUMN IF NOT EXISTS revoked_by_user_email text
    REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.platform_user_role'::regclass
      AND conname = 'platform_user_role_version_ck'
  ) THEN
    ALTER TABLE platform_user_role ADD CONSTRAINT platform_user_role_version_ck
      CHECK (version > 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.platform_user_role'::regclass
      AND conname = 'platform_user_role_revocation_actor_ck'
  ) THEN
    ALTER TABLE platform_user_role ADD CONSTRAINT platform_user_role_revocation_actor_ck
      CHECK (
        (active IS TRUE AND revoked_by_user_email IS NULL)
        OR (active IS FALSE AND revoked_by_user_email IS NOT NULL)
      ) NOT VALID;
  END IF;
END
$$;

-- Las revocaciones historicas anteriores a 012 no acreditan actor nominal.
-- Se conservan, pero una nueva transicion gobernada siempre informa quien decidio.

CREATE TABLE IF NOT EXISTS platform_role_change_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_email text NOT NULL
    REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  role_key varchar(64) NOT NULL REFERENCES iam_role(role_key) ON DELETE RESTRICT,
  requested_action varchar(16) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  expected_assignment_version integer NOT NULL,
  reason text NOT NULL,
  requested_by_user_email text NOT NULL
    REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by_user_email text
    REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  decision_reason text,
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT platform_role_change_request_role_ck
    CHECK (role_key = 'PLATFORM_OWNER'),
  CONSTRAINT platform_role_change_request_action_ck
    CHECK (requested_action IN ('grant', 'revoke')),
  CONSTRAINT platform_role_change_request_status_ck
    CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT platform_role_change_request_assignment_version_ck
    CHECK (expected_assignment_version >= 0),
  CONSTRAINT platform_role_change_request_reason_ck
    CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT platform_role_change_request_decision_reason_ck
    CHECK (decision_reason IS NULL OR length(btrim(decision_reason)) BETWEEN 3 AND 500),
  CONSTRAINT platform_role_change_request_version_ck CHECK (version > 0),
  CONSTRAINT platform_role_change_request_state_ck CHECK (
    (status = 'pending' AND decided_by_user_email IS NULL
      AND decision_reason IS NULL AND decided_at IS NULL)
    OR (status IN ('approved', 'rejected') AND decided_by_user_email IS NOT NULL
      AND decision_reason IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_role_change_request_pending_uk
  ON platform_role_change_request (lower(target_user_email), role_key)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS platform_role_change_request_recent_idx
  ON platform_role_change_request (requested_at DESC, id);
CREATE INDEX IF NOT EXISTS platform_user_role_active_owner_idx
  ON platform_user_role (role_key, lower(user_email)) WHERE active IS TRUE;

CREATE OR REPLACE FUNCTION platform_owner_governance_lock_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Serializa todas las escrituras sobre asignaciones globales antes de tomar filas.
  -- Al ser un trigger por sentencia, tambien protege DML administrativo directo sin
  -- invertir el orden global -> sesion/actor -> filas usado por las fachadas.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'PLATFORM_OWNER:GOVERNANCE', 12012
  ));
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS platform_owner_governance_lock ON platform_user_role;
CREATE TRIGGER platform_owner_governance_lock
BEFORE INSERT OR UPDATE OR DELETE ON platform_user_role
FOR EACH STATEMENT EXECUTE FUNCTION platform_owner_governance_lock_v1();

CREATE OR REPLACE FUNCTION platform_owner_last_active_guard_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  remaining integer;
  removes_active_owner boolean := false;
BEGIN
  IF OLD.role_key = 'PLATFORM_OWNER' AND OLD.active IS TRUE THEN
    IF TG_OP = 'DELETE' THEN
      removes_active_owner := true;
    ELSE
      removes_active_owner := NEW.role_key IS DISTINCT FROM 'PLATFORM_OWNER'
        OR lower(NEW.user_email) IS DISTINCT FROM lower(OLD.user_email)
        OR NEW.active IS DISTINCT FROM true;
    END IF;
  END IF;
  IF removes_active_owner THEN
    SELECT count(*) INTO remaining
    FROM platform_user_role assignment
    WHERE assignment.role_key = 'PLATFORM_OWNER'
      AND assignment.active IS TRUE
      AND lower(assignment.user_email) <> lower(OLD.user_email);
    IF remaining < 1 THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_LAST_ACTIVE' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS platform_owner_last_active_guard ON platform_user_role;
CREATE TRIGGER platform_owner_last_active_guard
BEFORE UPDATE OR DELETE ON platform_user_role
FOR EACH ROW EXECUTE FUNCTION platform_owner_last_active_guard_v1();

CREATE OR REPLACE FUNCTION platform_owner_governance_view_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  safe_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  owner_count integer := 0;
  owners jsonb := '[]'::jsonb;
  candidates jsonb := '[]'::jsonb;
  requests jsonb := '[]'::jsonb;
BEGIN
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'TENANT_IAM_RELEASE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    'platform.roles.manage'
  );

  SELECT count(*) INTO owner_count
  FROM platform_user_role assignment
  JOIN internal_users users ON lower(users.email) = lower(assignment.user_email)
  WHERE assignment.role_key = 'PLATFORM_OWNER'
    AND assignment.active IS TRUE AND users.active IS TRUE;

  SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.display_name, item.email), '[]'::jsonb)
    INTO owners
  FROM (
    SELECT users.display_name, lower(users.email) AS email,
      jsonb_build_object(
        'email', lower(users.email), 'displayName', users.display_name,
        'roleKey', assignment.role_key, 'active', assignment.active,
        'version', assignment.version, 'grantedAt', assignment.granted_at,
        'revokedAt', assignment.revoked_at,
        'mfaEnrolled', EXISTS (
          SELECT 1 FROM tenant_identity_mfa_factor factor
          WHERE lower(factor.user_email) = lower(users.email)
            AND factor.status = 'active'
        )
      ) AS payload
    FROM platform_user_role assignment
    JOIN internal_users users ON lower(users.email) = lower(assignment.user_email)
    WHERE assignment.role_key = 'PLATFORM_OWNER'
    ORDER BY users.display_name, users.email
    LIMIT safe_limit
  ) item;

  SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.display_name, item.email), '[]'::jsonb)
    INTO candidates
  FROM (
    SELECT users.display_name, lower(users.email) AS email,
      jsonb_build_object(
        'email', lower(users.email), 'displayName', users.display_name,
        'assignmentVersion', COALESCE(assignment.version, 0),
        'previouslyRevoked', COALESCE(assignment.active IS FALSE, false),
        'mfaEnrolled', true
      ) AS payload
    FROM internal_users users
    JOIN tenant_identity_mfa_factor factor
      ON lower(factor.user_email) = lower(users.email) AND factor.status = 'active'
    LEFT JOIN platform_user_role assignment
      ON lower(assignment.user_email) = lower(users.email)
     AND assignment.role_key = 'PLATFORM_OWNER'
    WHERE users.active IS TRUE AND COALESCE(assignment.active, false) IS FALSE
    ORDER BY users.display_name, users.email
    LIMIT safe_limit
  ) item;

  SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.requested_at DESC, item.id), '[]'::jsonb)
    INTO requests
  FROM (
    SELECT request.id, request.requested_at,
      jsonb_build_object(
        'id', request.id,
        'targetEmail', lower(request.target_user_email),
        'targetDisplayName', target.display_name,
        'roleKey', request.role_key,
        'action', request.requested_action,
        'status', request.status,
        'expectedAssignmentVersion', request.expected_assignment_version,
        'reason', request.reason,
        'requestedByEmail', lower(request.requested_by_user_email),
        'requestedByDisplayName', maker.display_name,
        'requestedAt', request.requested_at,
        'decidedByEmail', lower(request.decided_by_user_email),
        'decisionReason', request.decision_reason,
        'decidedAt', request.decided_at,
        'version', request.version
      ) AS payload
    FROM platform_role_change_request request
    JOIN internal_users target ON lower(target.email) = lower(request.target_user_email)
    JOIN internal_users maker ON lower(maker.email) = lower(request.requested_by_user_email)
    ORDER BY request.requested_at DESC, request.id
    LIMIT safe_limit
  ) item;

  RETURN jsonb_build_object(
    'currentActorEmail', lower(btrim(p_actor_email)),
    'owners', owners,
    'eligibleUsers', candidates,
    'requests', requests,
    'allowedCommands', jsonb_build_array(
      'request_platform_owner_grant', 'request_platform_owner_revoke',
      'approve_platform_owner_change', 'reject_platform_owner_change'
    ),
    'controls', jsonb_build_object(
      'activeOwnerCount', owner_count,
      'makerCheckerReady', owner_count >= 2,
      'lastOwnerProtected', true,
      'selfApprovalBlocked', true,
      'mfaRequiredForGrant', true,
      'auditReady', true
    ),
    'source', jsonb_build_object(
      'label', 'PostgreSQL platform IAM', 'cutoff', now(),
      'releaseSha', p_release_sha
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION platform_owner_governance_apply_v1(
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
  target_email text;
  request_id uuid;
  reason_value text;
  replay tenant_iam_event%ROWTYPE;
  request_row platform_role_change_request%ROWTYPE;
  assignment platform_user_role%ROWTYPE;
  assignment_found boolean := false;
  target_user internal_users%ROWTYPE;
  assignment_version integer := 0;
  owner_count integer := 0;
  revoked_sessions integer := 0;
  result_value jsonb;
BEGIN
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'TENANT_IAM_RELEASE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_command NOT IN (
      'request_platform_owner_grant', 'request_platform_owner_revoke',
      'approve_platform_owner_change', 'reject_platform_owner_change'
    ) OR p_idempotency_key IS NULL OR p_command_hash IS NULL
      OR p_command_hash !~ '^[a-f0-9]{64}$'
      OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Todas las escrituras de propietarios toman primero el mismo lock global.
  -- El volumen es mínimo y el orden único evita ciclos request-row/owner-row.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'PLATFORM_OWNER:GOVERNANCE', 12012
  ));
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    actor_email, p_actor_session_id, p_actor_session_version,
    'platform.roles.manage'
  );
  SELECT * INTO STRICT actor_user
  FROM internal_users users
  WHERE lower(users.email) = actor_email AND users.active IS TRUE
  FOR SHARE;

  -- Serializa replay y primera ejecución por actor+clave. Sin este lock, dos
  -- pedidos concurrentes podrían pasar el SELECT inicial antes de que exista
  -- el evento y terminar en conflicto en lugar de devolver el mismo recibo.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor_email || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO replay FROM tenant_iam_event event
  WHERE lower(event.actor_user_email) = actor_email
    AND event.idempotency_key = p_idempotency_key FOR SHARE;
  IF FOUND THEN
    IF replay.command IS DISTINCT FROM p_command
       OR replay.command_hash IS DISTINCT FROM p_command_hash THEN
      RAISE EXCEPTION 'TENANT_IAM_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN replay.result || jsonb_build_object('replayed', true);
  END IF;

  IF p_command IN ('request_platform_owner_grant', 'request_platform_owner_revoke') THEN
    IF NOT (p_payload ?& ARRAY['targetEmail', 'reason'])
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['targetEmail', 'reason'])
       )
       OR jsonb_typeof(p_payload->'targetEmail') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string'
       OR p_expected_version IS NULL OR p_expected_version < 0 THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    target_email := lower(btrim(p_payload->>'targetEmail'));
    reason_value := btrim(p_payload->>'reason');
    IF target_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
       OR length(target_email) > 254
       OR length(reason_value) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(target_email || ':PLATFORM_OWNER', 12012));
    SELECT * INTO target_user FROM internal_users users
    WHERE lower(users.email) = target_email AND users.active IS TRUE FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_TARGET_NOT_ACTIVE' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO assignment FROM platform_user_role role_assignment
    WHERE lower(role_assignment.user_email) = target_email
      AND role_assignment.role_key = 'PLATFORM_OWNER' FOR UPDATE;
    assignment_found := FOUND;
    assignment_version := CASE WHEN assignment_found THEN assignment.version ELSE 0 END;
    IF assignment_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;

    PERFORM 1 FROM platform_user_role active_owner
    WHERE active_owner.role_key = 'PLATFORM_OWNER' AND active_owner.active IS TRUE
    FOR UPDATE;
    SELECT count(*) INTO owner_count FROM platform_user_role active_owner
    WHERE active_owner.role_key = 'PLATFORM_OWNER' AND active_owner.active IS TRUE;

    IF p_command = 'request_platform_owner_grant' THEN
      IF assignment_found AND assignment.active IS TRUE THEN
        RAISE EXCEPTION 'PLATFORM_OWNER_ALREADY_ACTIVE' USING ERRCODE = 'P0001';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM tenant_identity_mfa_factor factor
        WHERE lower(factor.user_email) = target_email AND factor.status = 'active'
      ) THEN
        RAISE EXCEPTION 'PLATFORM_OWNER_TARGET_MFA_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
    ELSE
      IF NOT assignment_found OR assignment.active IS NOT TRUE THEN
        RAISE EXCEPTION 'PLATFORM_OWNER_NOT_ACTIVE' USING ERRCODE = 'P0001';
      END IF;
      IF owner_count <= 1 THEN
        RAISE EXCEPTION 'PLATFORM_OWNER_LAST_ACTIVE' USING ERRCODE = 'P0001';
      END IF;
      IF owner_count = 2 AND target_email <> actor_email THEN
        RAISE EXCEPTION 'PLATFORM_OWNER_TARGET_REQUEST_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    INSERT INTO platform_role_change_request (
      target_user_email, role_key, requested_action,
      expected_assignment_version, reason, requested_by_user_email
    ) VALUES (
      target_user.email, 'PLATFORM_OWNER',
      CASE WHEN p_command = 'request_platform_owner_grant' THEN 'grant' ELSE 'revoke' END,
      assignment_version, reason_value, actor_user.email
    ) RETURNING * INTO request_row;

    result_value := jsonb_build_object(
      'request', jsonb_build_object(
        'id', request_row.id, 'targetEmail', lower(request_row.target_user_email),
        'roleKey', request_row.role_key, 'action', request_row.requested_action,
        'status', request_row.status, 'version', request_row.version,
        'expectedAssignmentVersion', request_row.expected_assignment_version
      ),
      'assignmentChanged', false, 'replayed', false
    );
  ELSE
    IF NOT (p_payload ?& ARRAY['requestId', 'reason'])
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['requestId', 'reason'])
       )
       OR jsonb_typeof(p_payload->'requestId') IS DISTINCT FROM 'string'
       OR (p_payload->>'requestId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string'
       OR p_expected_version IS NULL OR p_expected_version < 1 THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    request_id := (p_payload->>'requestId')::uuid;
    reason_value := btrim(p_payload->>'reason');
    IF length(reason_value) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO request_row FROM platform_role_change_request request
    WHERE request.id = request_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_REQUEST_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF request_row.status <> 'pending' THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_REQUEST_NOT_PENDING' USING ERRCODE = 'P0001';
    END IF;
    IF request_row.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF lower(request_row.requested_by_user_email) = actor_email THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    target_email := lower(request_row.target_user_email);
    IF p_command = 'approve_platform_owner_change'
       AND request_row.requested_action = 'revoke'
       AND target_email = actor_email THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_SELF_REVOKE_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;

    IF p_command = 'reject_platform_owner_change' THEN
      UPDATE platform_role_change_request SET
        status = 'rejected', decided_by_user_email = actor_user.email,
        decision_reason = reason_value, decided_at = now(), version = version + 1
      WHERE id = request_row.id RETURNING * INTO request_row;
      result_value := jsonb_build_object(
        'request', jsonb_build_object(
          'id', request_row.id, 'targetEmail', target_email,
          'action', request_row.requested_action, 'status', request_row.status,
          'version', request_row.version
        ),
        'assignmentChanged', false, 'replayed', false
      );
    ELSE
      PERFORM pg_advisory_xact_lock(hashtextextended(target_email || ':PLATFORM_OWNER', 12012));
      SELECT * INTO target_user FROM internal_users users
      WHERE lower(users.email) = target_email AND users.active IS TRUE FOR SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'PLATFORM_OWNER_TARGET_NOT_ACTIVE' USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO assignment FROM platform_user_role role_assignment
      WHERE lower(role_assignment.user_email) = target_email
        AND role_assignment.role_key = 'PLATFORM_OWNER' FOR UPDATE;
      assignment_found := FOUND;
      assignment_version := CASE WHEN assignment_found THEN assignment.version ELSE 0 END;
      IF assignment_version IS DISTINCT FROM request_row.expected_assignment_version THEN
        RAISE EXCEPTION 'PLATFORM_OWNER_VERSION_CONFLICT' USING ERRCODE = 'P0001';
      END IF;

      PERFORM 1 FROM platform_user_role active_owner
      WHERE active_owner.role_key = 'PLATFORM_OWNER' AND active_owner.active IS TRUE
      FOR UPDATE;
      SELECT count(*) INTO owner_count FROM platform_user_role active_owner
      WHERE active_owner.role_key = 'PLATFORM_OWNER' AND active_owner.active IS TRUE;

      IF request_row.requested_action = 'grant' THEN
        IF assignment_found AND assignment.active IS TRUE THEN
          RAISE EXCEPTION 'PLATFORM_OWNER_ALREADY_ACTIVE' USING ERRCODE = 'P0001';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM tenant_identity_mfa_factor factor
          WHERE lower(factor.user_email) = target_email AND factor.status = 'active'
        ) THEN
          RAISE EXCEPTION 'PLATFORM_OWNER_TARGET_MFA_REQUIRED' USING ERRCODE = 'P0001';
        END IF;
        IF assignment_found THEN
          UPDATE platform_user_role SET
            active = true, granted_by_user_email = actor_user.email,
            granted_at = now(), revoked_at = NULL, revoked_by_user_email = NULL,
            version = version + 1
          WHERE lower(user_email) = target_email AND role_key = 'PLATFORM_OWNER'
          RETURNING * INTO assignment;
        ELSE
          INSERT INTO platform_user_role (
            user_email, role_key, active, granted_by_user_email, version
          ) VALUES (target_user.email, 'PLATFORM_OWNER', true, actor_user.email, 1)
          RETURNING * INTO assignment;
        END IF;
      ELSE
        IF NOT assignment_found OR assignment.active IS NOT TRUE THEN
          RAISE EXCEPTION 'PLATFORM_OWNER_NOT_ACTIVE' USING ERRCODE = 'P0001';
        END IF;
        IF owner_count <= 1 THEN
          RAISE EXCEPTION 'PLATFORM_OWNER_LAST_ACTIVE' USING ERRCODE = 'P0001';
        END IF;
        UPDATE platform_user_role SET
          active = false, revoked_at = now(), revoked_by_user_email = actor_user.email,
          version = version + 1
        WHERE lower(user_email) = target_email AND role_key = 'PLATFORM_OWNER'
        RETURNING * INTO assignment;
        UPDATE tenant_identity_session SET
          status = 'revoked', revoked_at = now(), revoked_by_user_email = actor_user.email,
          session_version = session_version + 1, version = version + 1
        WHERE lower(user_email) = target_email AND source = 'platform'
          AND status = 'active';
        GET DIAGNOSTICS revoked_sessions = ROW_COUNT;
      END IF;

      UPDATE platform_role_change_request SET
        status = 'approved', decided_by_user_email = actor_user.email,
        decision_reason = reason_value, decided_at = now(), version = version + 1
      WHERE id = request_row.id RETURNING * INTO request_row;
      result_value := jsonb_build_object(
        'request', jsonb_build_object(
          'id', request_row.id, 'targetEmail', target_email,
          'action', request_row.requested_action, 'status', request_row.status,
          'version', request_row.version
        ),
        'assignment', jsonb_build_object(
          'email', lower(assignment.user_email), 'roleKey', assignment.role_key,
          'active', assignment.active, 'version', assignment.version
        ),
        'assignmentChanged', true, 'platformSessionsRevoked', revoked_sessions,
        'replayed', false
      );
    END IF;
  END IF;

  result_value := result_value || jsonb_build_object(
    'releaseSha', p_release_sha,
    'actorSessionVersion', p_actor_session_version
  );

  INSERT INTO tenant_iam_event (
    actor_user_email, command, target_type, target_id,
    idempotency_key, command_hash, result
  ) VALUES (
    actor_user.email, p_command, 'platform_role_request',
    COALESCE(request_row.id::text, target_email),
    p_idempotency_key, p_command_hash, result_value
  );
  RETURN result_value;
END
$$;

CREATE OR REPLACE FUNCTION platform_owner_bootstrap_secondary_v1(
  p_existing_owner_email text,
  p_target_email text,
  p_authorization_hash text,
  p_operator_approval_hash text,
  p_change_ticket text,
  p_idempotency_key uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  existing_owner_key text := lower(btrim(p_existing_owner_email));
  target_email text := lower(btrim(p_target_email));
  replay tenant_iam_event%ROWTYPE;
  existing_owner_assignment platform_user_role%ROWTYPE;
  existing_owner_user internal_users%ROWTYPE;
  target internal_users%ROWTYPE;
  active_owner_count integer := 0;
  assignment platform_user_role%ROWTYPE;
  result_value jsonb;
BEGIN
  IF existing_owner_key IS NULL OR target_email IS NULL
     OR existing_owner_key = target_email
     OR existing_owner_key !~ '^[^[:space:]@]+@[^[:space:]@]+$'
     OR target_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
     OR length(existing_owner_key) > 254 OR length(target_email) > 254
     OR p_authorization_hash IS NULL OR p_authorization_hash !~ '^[a-f0-9]{64}$'
     OR p_operator_approval_hash IS NULL OR p_operator_approval_hash !~ '^[a-f0-9]{64}$'
     OR p_authorization_hash = p_operator_approval_hash
     OR length(btrim(COALESCE(p_change_ticket, ''))) NOT BETWEEN 3 AND 120
     OR p_idempotency_key IS NULL
     OR p_command_hash IS NULL OR p_command_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_BOOTSTRAP_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('PLATFORM_OWNER:GOVERNANCE', 12012));
  SELECT * INTO replay FROM tenant_iam_event event
  WHERE lower(event.actor_user_email) = existing_owner_key
    AND event.idempotency_key = p_idempotency_key FOR SHARE;
  IF FOUND THEN
    IF replay.command IS DISTINCT FROM 'bootstrap_secondary_platform_owner'
       OR replay.command_hash IS DISTINCT FROM p_command_hash THEN
      RAISE EXCEPTION 'TENANT_IAM_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN replay.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM 1 FROM platform_user_role active_owner
  WHERE active_owner.role_key = 'PLATFORM_OWNER' AND active_owner.active IS TRUE
  FOR UPDATE;
  SELECT count(*) INTO active_owner_count
  FROM platform_user_role active_owner
  WHERE active_owner.role_key = 'PLATFORM_OWNER' AND active_owner.active IS TRUE;
  IF active_owner_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_BOOTSTRAP_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT existing_owner_assignment
  FROM platform_user_role active_owner
  WHERE active_owner.role_key = 'PLATFORM_OWNER' AND active_owner.active IS TRUE;
  IF lower(existing_owner_assignment.user_email) IS DISTINCT FROM existing_owner_key THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_BOOTSTRAP_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO existing_owner_user FROM internal_users users
  WHERE lower(users.email) = existing_owner_key AND users.active IS TRUE FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM tenant_identity_mfa_factor factor
    WHERE lower(factor.user_email) = existing_owner_key AND factor.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_BOOTSTRAP_EXISTING_MFA_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO target FROM internal_users users
  WHERE lower(users.email) = target_email AND users.active IS TRUE FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_TARGET_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenant_identity_mfa_factor factor
    WHERE lower(factor.user_email) = target_email AND factor.status = 'active'
  ) THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_TARGET_MFA_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM platform_user_role role_assignment
    WHERE lower(role_assignment.user_email) = target_email
      AND role_assignment.role_key = 'PLATFORM_OWNER'
  ) THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_BOOTSTRAP_CLOSED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO platform_user_role (
    user_email, role_key, active, granted_by_user_email, version
  ) VALUES (target.email, 'PLATFORM_OWNER', true, existing_owner_user.email, 1)
  RETURNING * INTO assignment;
  result_value := jsonb_build_object(
    'assignment', jsonb_build_object(
      'email', lower(assignment.user_email), 'roleKey', assignment.role_key,
      'active', true, 'version', assignment.version
    ),
    'bootstrap', jsonb_build_object(
      'kind', 'secondary_owner_break_glass',
      'authorizationHash', p_authorization_hash,
      'operatorApprovalHash', p_operator_approval_hash,
      'changeTicket', btrim(p_change_ticket)
    ),
    'replayed', false
  );
  INSERT INTO tenant_iam_event (
    actor_user_email, command, target_type, target_id,
    idempotency_key, command_hash, result
  ) VALUES (
    existing_owner_user.email, 'bootstrap_secondary_platform_owner',
    'platform_user_role', target_email,
    p_idempotency_key, p_command_hash, result_value
  );
  RETURN result_value;
END
$$;

COMMENT ON TABLE platform_role_change_request IS
  'Solicitudes versionadas para otorgar o revocar PLATFORM_OWNER. La persona solicitante nunca decide su propia solicitud.';
COMMENT ON FUNCTION platform_owner_governance_view_v1(text,uuid,integer,text,integer) IS
  'Vista nominal de propietarios, candidatos MFA y solicitudes; solo contexto Plataforma con platform.roles.manage.';
COMMENT ON FUNCTION platform_owner_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb) IS
  'Maker-checker de PLATFORM_OWNER con ultimo propietario, MFA, replay y sesiones platform revocadas.';
COMMENT ON FUNCTION platform_owner_bootstrap_secondary_v1(text,text,text,text,text,uuid,text) IS
  'Break-glass auditable y de un solo uso para resolver el bootstrap del segundo PLATFORM_OWNER.';

REVOKE ALL ON FUNCTION platform_owner_governance_lock_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_owner_last_active_guard_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_owner_governance_view_v1(text,uuid,integer,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_owner_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_owner_bootstrap_secondary_v1(text,text,text,text,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON TABLE
  platform_role_change_request, platform_user_role, tenant_iam_event
FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app') THEN
    REVOKE ALL ON TABLE platform_role_change_request FROM municontrol_actions_runtime_app;
    REVOKE ALL ON TABLE platform_user_role FROM municontrol_actions_runtime_app;
    REVOKE ALL ON TABLE tenant_iam_event FROM municontrol_actions_runtime_app;
    GRANT EXECUTE ON FUNCTION platform_owner_governance_view_v1(text,uuid,integer,text,integer)
      TO municontrol_actions_runtime_app;
    GRANT EXECUTE ON FUNCTION platform_owner_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)
      TO municontrol_actions_runtime_app;
    REVOKE ALL ON FUNCTION platform_owner_bootstrap_secondary_v1(text,text,text,text,text,uuid,text)
      FROM municontrol_actions_runtime_app;
  END IF;
END
$$;

-- 012 toca dos relaciones heredadas: sus ACL nominales y por columna deben
-- cerrarse con el mismo criterio que la tabla nueva, conservando solo al owner.
DO $platform_owner_acl_hardening$
DECLARE
  acl_row record;
  grantee_sql text;
BEGIN
  FOR acl_row IN
    WITH sensitive_relations AS (
      SELECT relation.oid, relation.relname, relation.relowner
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'platform_role_change_request', 'platform_user_role', 'tenant_iam_event'
        )
    ), sensitive_sequences AS (
      SELECT DISTINCT sequence_row.oid, sequence_row.relname, sequence_row.relowner
      FROM pg_class sequence_row
      JOIN pg_namespace namespace ON namespace.oid = sequence_row.relnamespace
      JOIN pg_depend dependency
        ON dependency.classid = 'pg_class'::regclass
       AND dependency.objid = sequence_row.oid
       AND dependency.refclassid = 'pg_class'::regclass
       AND dependency.deptype IN ('a','i')
      JOIN sensitive_relations relation ON relation.oid = dependency.refobjid
      WHERE namespace.nspname = 'public' AND sequence_row.relkind = 'S'
    )
    SELECT 'relation'::text AS object_kind, relation.relname AS object_name,
      NULL::text AS column_name, NULL::text AS privilege_type,
      acl.grantee, grantee_role.rolname AS grantee_name
    FROM sensitive_relations relation
    CROSS JOIN LATERAL aclexplode(COALESCE(
      (SELECT catalog_relation.relacl FROM pg_class catalog_relation
       WHERE catalog_relation.oid = relation.oid),
      acldefault('r', relation.relowner)
    )) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE acl.grantee <> relation.relowner
    UNION ALL
    SELECT 'column', relation.relname, attribute.attname, acl.privilege_type,
      acl.grantee, grantee_role.rolname
    FROM sensitive_relations relation
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE
    CROSS JOIN LATERAL aclexplode(COALESCE(attribute.attacl, '{}'::aclitem[])) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE acl.grantee <> relation.relowner
    UNION ALL
    SELECT 'sequence', sequence_row.relname, NULL::text, NULL::text,
      acl.grantee, grantee_role.rolname
    FROM sensitive_sequences sequence_row
    CROSS JOIN LATERAL aclexplode(COALESCE(
      (SELECT catalog_sequence.relacl FROM pg_class catalog_sequence
       WHERE catalog_sequence.oid = sequence_row.oid),
      acldefault('S', sequence_row.relowner)
    )) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE acl.grantee <> sequence_row.relowner
  LOOP
    IF acl_row.grantee = 0 THEN
      grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'PLATFORM_OWNER_ACL_GRANTEE_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE
      grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    IF acl_row.object_kind = 'relation' THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %s',
        acl_row.object_name, grantee_sql
      );
    ELSIF acl_row.object_kind = 'column' THEN
      IF acl_row.privilege_type NOT IN ('SELECT','INSERT','UPDATE','REFERENCES') THEN
        RAISE EXCEPTION 'PLATFORM_OWNER_COLUMN_ACL_INVALID' USING ERRCODE = 'P0001';
      END IF;
      EXECUTE format(
        'REVOKE %s (%I) ON TABLE public.%I FROM %s',
        acl_row.privilege_type, acl_row.column_name,
        acl_row.object_name, grantee_sql
      );
    ELSE
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON SEQUENCE public.%I FROM %s',
        acl_row.object_name, grantee_sql
      );
    END IF;
  END LOOP;
END
$platform_owner_acl_hardening$;
