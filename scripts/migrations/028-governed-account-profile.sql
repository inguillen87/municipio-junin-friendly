-- MuniControl Friendly - Sprint 028
-- Correccion gobernada del nombre visible de una cuenta institucional.
-- No modifica personas, contratos, legajos ni vinculos laborales GRH.

CREATE TABLE IF NOT EXISTS account_profile_governance_event_context (
  event_id bigint PRIMARY KEY
    REFERENCES tenant_iam_event(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL,
  target_user_email text NOT NULL
    REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  actor_session_id uuid NOT NULL
    REFERENCES tenant_identity_session(id) ON DELETE RESTRICT,
  actor_session_version integer NOT NULL,
  release_sha char(40) NOT NULL,
  expected_identity_version integer NOT NULL,
  resulting_identity_version integer NOT NULL,
  previous_display_name_hash char(64) NOT NULL,
  resulting_display_name_hash char(64) NOT NULL,
  reason_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_profile_governance_membership_tenant_fk
    FOREIGN KEY (membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT account_profile_governance_session_version_ck
    CHECK (actor_session_version > 0),
  CONSTRAINT account_profile_governance_identity_versions_ck CHECK (
    expected_identity_version > 0
    AND resulting_identity_version = expected_identity_version + 1
  ),
  CONSTRAINT account_profile_governance_release_ck
    CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT account_profile_governance_hashes_ck CHECK (
    previous_display_name_hash ~ '^[a-f0-9]{64}$'
    AND resulting_display_name_hash ~ '^[a-f0-9]{64}$'
    AND reason_hash ~ '^[a-f0-9]{64}$'
  )
);

DROP TRIGGER IF EXISTS account_profile_governance_event_context_append_only
  ON account_profile_governance_event_context;
CREATE TRIGGER account_profile_governance_event_context_append_only
BEFORE UPDATE OR DELETE ON account_profile_governance_event_context
FOR EACH ROW EXECUTE FUNCTION tenant_iam_reject_change();

CREATE OR REPLACE FUNCTION account_profile_governance_apply_v1(
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
  tenant_id_value uuid;
  target_email text;
  normalized_display_name text;
  reason_value text;
  actor_user internal_users%ROWTYPE;
  target_user internal_users%ROWTYPE;
  target_membership tenant_membership%ROWTYPE;
  tenant_row platform_tenant%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  binding_row platform_tenant_source_binding%ROWTYPE;
  replay tenant_iam_event%ROWTYPE;
  replay_context account_profile_governance_event_context%ROWTYPE;
  previous_display_name_hash_value text;
  resulting_display_name_hash_value text;
  reason_hash_value text;
  command_hash_value text;
  revoked_sessions integer := 0;
  event_id_value bigint;
  now_value timestamptz := clock_timestamp();
  result_value jsonb;
BEGIN
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'TENANT_IAM_RELEASE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_command IS DISTINCT FROM 'update_account_profile'
     OR p_idempotency_key IS NULL
     OR p_command_hash IS NULL OR p_command_hash !~ '^[a-f0-9]{64}$'
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR NOT (p_payload ?& ARRAY['tenantId','targetEmail','displayName','reason'])
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
       WHERE field.key <> ALL(ARRAY['tenantId','targetEmail','displayName','reason'])
     )
     OR jsonb_typeof(p_payload->'tenantId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_payload->'targetEmail') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_payload->'displayName') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  tenant_id_value := (p_payload->>'tenantId')::uuid;
  target_email := lower(btrim(p_payload->>'targetEmail'));
  normalized_display_name := regexp_replace(
    btrim(p_payload->>'displayName'), '[[:space:]]+', ' ', 'g'
  );
  reason_value := btrim(p_payload->>'reason');
  IF target_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
     OR length(target_email) > 254
     OR char_length(normalized_display_name) NOT BETWEEN 3 AND 160
     OR normalized_display_name ~ '[[:cntrl:]<>]'
     OR char_length(reason_value) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- La autoridad del replay se deriva dentro de PostgreSQL. El hash recibido
  -- conserva compatibilidad de firma, pero no puede sustituir al sobre real.
  command_hash_value := encode(digest(convert_to(jsonb_build_object(
    'command', p_command,
    'expectedVersion', p_expected_version,
    'payload', p_payload,
    'actorSessionId', p_actor_session_id,
    'actorSessionVersion', p_actor_session_version,
    'releaseSha', p_release_sha
  )::text, 'UTF8'), 'sha256'), 'hex');

  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    actor_email, p_actor_session_id, p_actor_session_version,
    'platform.users.manage'
  );
  SELECT * INTO STRICT actor_user
  FROM internal_users users
  WHERE lower(users.email) = actor_email AND users.active IS TRUE
  FOR SHARE;

  -- Un mismo actor e Idempotency-Key siempre serializan antes de leer el evento.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor_email || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO replay
  FROM tenant_iam_event event
  WHERE lower(event.actor_user_email) = actor_email
    AND event.idempotency_key = p_idempotency_key
  FOR SHARE;
  IF FOUND THEN
    IF replay.command IS DISTINCT FROM p_command
       OR replay.command_hash IS DISTINCT FROM command_hash_value THEN
      RAISE EXCEPTION 'ACCOUNT_PROFILE_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO replay_context
    FROM account_profile_governance_event_context context
    WHERE context.event_id = replay.id
    FOR SHARE;
    IF NOT FOUND
       OR replay_context.tenant_id IS DISTINCT FROM tenant_id_value
       OR lower(replay_context.target_user_email) IS DISTINCT FROM target_email
       OR replay_context.actor_session_id IS DISTINCT FROM p_actor_session_id
       OR replay_context.actor_session_version IS DISTINCT FROM p_actor_session_version
       OR replay_context.release_sha IS DISTINCT FROM p_release_sha
       OR replay_context.expected_identity_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'ACCOUNT_PROFILE_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN replay.result || jsonb_build_object('replayed', true);
  END IF;

  -- El tenant y la identidad son precondiciones, no objetivos secundarios.
  SELECT * INTO tenant_row
  FROM platform_tenant tenant
  WHERE tenant.id = tenant_id_value AND tenant.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_TENANT_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO policy_row
  FROM tenant_identity_policy policy
  WHERE policy.tenant_id = tenant_id_value
    AND policy.tenant_data_plane_ready IS TRUE
    AND policy.certified_release_sha = p_release_sha
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_TENANT_NOT_READY' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO binding_row
  FROM platform_tenant_source_binding binding
  WHERE binding.id = policy_row.certified_source_binding_id
    AND binding.tenant_id = tenant_id_value
    AND binding.source_system = 'GRH'
    AND binding.verified IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_TENANT_NOT_READY' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'ACCOUNT_PROFILE:' || target_email, 28028
  ));
  SELECT * INTO target_user
  FROM internal_users users
  WHERE lower(users.email) = target_email AND users.active IS TRUE
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_TARGET_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO target_membership
  FROM tenant_membership membership
  WHERE membership.tenant_id = tenant_id_value
    AND lower(membership.user_email) = target_email
    AND membership.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_MEMBERSHIP_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  IF target_user.identity_version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF target_user.display_name IS NOT DISTINCT FROM normalized_display_name THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_UNCHANGED' USING ERRCODE = 'P0001';
  END IF;

  previous_display_name_hash_value := encode(digest(
    convert_to(target_user.display_name, 'UTF8'), 'sha256'
  ), 'hex');
  resulting_display_name_hash_value := encode(digest(
    convert_to(normalized_display_name, 'UTF8'), 'sha256'
  ), 'hex');
  reason_hash_value := encode(digest(
    convert_to(reason_value, 'UTF8'), 'sha256'
  ), 'hex');

  -- Revocacion global atribuida al actor antes de incrementar identity_version.
  -- El trigger historico de internal_users encuentra luego cero sesiones activas.
  UPDATE tenant_identity_session SET
    status = 'revoked', revoked_at = now_value,
    revoked_by_user_email = actor_user.email, version = version + 1
  WHERE lower(user_email) = target_email AND status = 'active';
  GET DIAGNOSTICS revoked_sessions = ROW_COUNT;

  UPDATE internal_users SET
    display_name = normalized_display_name,
    identity_version = identity_version + 1,
    updated_at = now_value
  WHERE email = target_user.email
  RETURNING * INTO target_user;

  result_value := jsonb_build_object(
    'tenantId', tenant_id_value,
    'membershipId', target_membership.id,
    'account', jsonb_build_object(
      'identityVersion', target_user.identity_version,
      'changedFields', jsonb_build_array('displayName')
    ),
    'sessionsRevoked', revoked_sessions,
    'releaseSha', p_release_sha,
    'actorSessionVersion', p_actor_session_version,
    'replayed', false
  );

  INSERT INTO tenant_iam_event (
    actor_user_email, tenant_id, membership_id, command,
    target_type, target_id, idempotency_key, command_hash, result
  ) VALUES (
    actor_user.email, tenant_id_value, target_membership.id, p_command,
    'institutional_account_profile', target_membership.id::text,
    p_idempotency_key, command_hash_value, result_value
  ) RETURNING id INTO event_id_value;

  INSERT INTO account_profile_governance_event_context (
    event_id, tenant_id, membership_id, target_user_email,
    actor_session_id, actor_session_version, release_sha,
    expected_identity_version, resulting_identity_version,
    previous_display_name_hash, resulting_display_name_hash, reason_hash
  ) VALUES (
    event_id_value, tenant_id_value, target_membership.id, target_user.email,
    p_actor_session_id, p_actor_session_version, p_release_sha,
    p_expected_version, target_user.identity_version,
    previous_display_name_hash_value, resulting_display_name_hash_value,
    reason_hash_value
  );
  RETURN result_value;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'ACCOUNT_PROFILE_COMMAND_INVALID' USING ERRCODE = 'P0001';
END
$$;

COMMENT ON TABLE account_profile_governance_event_context IS
  'Contexto inmutable de correcciones de nombre visible. Conserva hashes, no nombres anteriores en auditoria.';
COMMENT ON FUNCTION account_profile_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb) IS
  'Corrige solo display_name de una cuenta activa ligada a un tenant; exige platform.users.manage, version, idempotencia y revoca todas sus sesiones.';

REVOKE ALL ON TABLE account_profile_governance_event_context FROM PUBLIC;
REVOKE ALL ON FUNCTION account_profile_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)
  FROM PUBLIC;

DO $account_profile_acl_hardening$
DECLARE
  acl_row record;
  grantee_sql text;
BEGIN
  FOR acl_row IN
    SELECT acl.grantee, role_row.rolname AS grantee_name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      relation.relacl, acldefault('r', relation.relowner)
    )) acl
    LEFT JOIN pg_roles role_row ON role_row.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'account_profile_governance_event_context'
      AND acl.grantee <> relation.relowner
  LOOP
    grantee_sql := CASE WHEN acl_row.grantee = 0 THEN 'PUBLIC'
      ELSE quote_ident(acl_row.grantee_name) END;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.account_profile_governance_event_context FROM %s',
      grantee_sql
    );
  END LOOP;

  FOR acl_row IN
    SELECT acl.grantee, role_row.rolname AS grantee_name
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      function_row.proacl, acldefault('f', function_row.proowner)
    )) acl
    LEFT JOIN pg_roles role_row ON role_row.oid = acl.grantee
    WHERE function_row.oid =
      'public.account_profile_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)'::regprocedure
      AND acl.grantee <> function_row.proowner
  LOOP
    grantee_sql := CASE WHEN acl_row.grantee = 0 THEN 'PUBLIC'
      ELSE quote_ident(acl_row.grantee_name) END;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION public.account_profile_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb) FROM %s',
      grantee_sql
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app') THEN
    REVOKE ALL ON TABLE account_profile_governance_event_context
      FROM municontrol_actions_runtime_app;
    GRANT EXECUTE ON FUNCTION account_profile_governance_apply_v1(text,uuid,integer,text,text,uuid,text,integer,jsonb)
      TO municontrol_actions_runtime_app;
  END IF;
END
$account_profile_acl_hardening$;
