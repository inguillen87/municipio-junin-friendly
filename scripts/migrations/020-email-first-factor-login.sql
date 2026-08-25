-- MuniControl Friendly - Sprint 020
-- Permite iniciar login_mfa con un factor email vivo aunque la identidad aun
-- no tenga TOTP. El OTP email conserva el cierre, versionado, lockout y
-- auditoria definidos en 015/016; esta migracion solo decide el siguiente paso
-- despues de seleccionar un contexto ya autorizado.

CREATE OR REPLACE FUNCTION tenant_identity_select_login_context_email_v1(
  p_actor_email text,
  p_idempotency_key uuid,
  p_command_hash text,
  p_expected_version integer,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  actor_email text := lower(btrim(COALESCE(p_actor_email, '')));
  replay tenant_iam_event%ROWTYPE;
  challenge tenant_identity_auth_challenge%ROWTYPE;
  user_row internal_users%ROWTYPE;
  access_context jsonb;
  tenant_id_value uuid;
  session_id_value uuid;
  session_expires_value timestamptz;
  totp_factor_active boolean := false;
  email_factor_live boolean := false;
  privileged_context boolean := false;
  result_value jsonb;
  event_target_type text;
  event_target_id text;
BEGIN
  IF length(actor_email) NOT BETWEEN 3 AND 254
     OR actor_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
     OR p_idempotency_key IS NULL
     OR COALESCE(p_command_hash, '') !~ '^[a-f0-9]{64}$'
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR NOT (p_payload ?& ARRAY[
       'flowHash','activeTenantId','mfaSecretCiphertext','sessionId',
       'sessionExpiresAt','device','ipApprox'
     ])
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
       WHERE field.key <> ALL(ARRAY[
         'flowHash','activeTenantId','mfaSecretCiphertext','sessionId',
         'sessionExpiresAt','device','ipApprox'
       ])
     )
     OR COALESCE(p_payload->>'flowHash', '') !~ '^[a-f0-9]{64}$'
     OR COALESCE(p_payload->>'sessionId', '')
       !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_payload->>'sessionExpiresAt' IS NULL
     OR (p_payload->>'activeTenantId' IS NOT NULL AND
       p_payload->>'activeTenantId'
         !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
     OR length(COALESCE(p_payload->>'device', '')) NOT BETWEEN 1 AND 120
     OR length(COALESCE(p_payload->>'ipApprox', '')) > 64
     OR length(COALESCE(p_payload->>'mfaSecretCiphertext', '')) > 2048 THEN
    RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    tenant_id_value := NULLIF(p_payload->>'activeTenantId', '')::uuid;
    session_id_value := (p_payload->>'sessionId')::uuid;
    session_expires_value := (p_payload->>'sessionExpiresAt')::timestamptz;
  EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format
      OR datetime_field_overflow THEN
    RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END;
  IF session_expires_value <= now() + interval '5 minutes'
     OR session_expires_value > now() + interval '12 hours' THEN
    RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor_email || ':' || p_idempotency_key::text, 0
  ));

  SELECT * INTO replay FROM tenant_iam_event event
  WHERE lower(event.actor_user_email) = actor_email
    AND event.idempotency_key = p_idempotency_key
  FOR SHARE;
  IF FOUND THEN
    IF replay.command IS DISTINCT FROM 'select_login_context'
       OR replay.command_hash IS DISTINCT FROM p_command_hash THEN
      RAISE EXCEPTION 'IDENTITY_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN replay.result || jsonb_build_object('replayed', true);
  END IF;

  SELECT * INTO challenge FROM tenant_identity_auth_challenge
  WHERE flow_hash = p_payload->>'flowHash' AND purpose = 'login_context'
  FOR UPDATE;
  IF NOT FOUND OR challenge.status <> 'pending' OR challenge.expires_at <= now()
     OR lower(challenge.user_email) <> actor_email THEN
    RAISE EXCEPTION 'IDENTITY_FLOW_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF challenge.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO user_row FROM internal_users
  WHERE lower(email) = actor_email AND active IS TRUE FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF tenant_id_value IS NULL AND NOT EXISTS (
    SELECT 1 FROM platform_user_role assignment
    WHERE lower(assignment.user_email) = actor_email
      AND assignment.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'IDENTITY_CONTEXT_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  access_context := tenant_identity_access_payload(challenge.user_email, tenant_id_value);
  IF access_context IS NULL OR (tenant_id_value IS NOT NULL
      AND COALESCE((access_context#>>'{tenant,dataPlaneReady}')::boolean, false) IS FALSE) THEN
    RAISE EXCEPTION 'IDENTITY_CONTEXT_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM tenant_identity_mfa_factor factor
    WHERE lower(factor.user_email) = actor_email AND factor.status = 'active'
  ) INTO totp_factor_active;
  SELECT EXISTS (
    SELECT 1 FROM tenant_identity_email_factor factor
    WHERE lower(factor.user_email) = actor_email
      AND factor.status IN ('pending', 'verified')
  ) INTO email_factor_live;
  SELECT EXISTS (
    SELECT 1 FROM iam_capability capability
    WHERE capability.capability_key IN (
      SELECT jsonb_array_elements_text(access_context#>'{platform,capabilities}')
      UNION
      SELECT jsonb_array_elements_text(COALESCE(
        access_context#>'{tenant,effectiveCapabilities}', '[]'::jsonb
      ))
    ) AND capability.sensitivity IN ('privileged', 'restricted')
  ) INTO privileged_context;

  IF totp_factor_active OR email_factor_live THEN
    UPDATE tenant_identity_auth_challenge
    SET purpose = 'login_mfa', requested_tenant_id = tenant_id_value,
      selection_idempotency_key = p_idempotency_key, version = version + 1
    WHERE id = challenge.id RETURNING * INTO challenge;
    result_value := jsonb_build_object(
      'mfaRequired', true,
      'emailMfaAvailable', email_factor_live,
      'challengeId', challenge.id,
      'version', challenge.version,
      'expiresAt', challenge.expires_at,
      'replayed', false
    );
    event_target_type := 'login_mfa';
    event_target_id := challenge.id::text;
  ELSIF privileged_context THEN
    IF COALESCE(p_payload->>'mfaSecretCiphertext', '') = '' THEN
      RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    UPDATE tenant_identity_auth_challenge
    SET purpose = 'login_enrollment', requested_tenant_id = tenant_id_value,
      mfa_secret_ciphertext = p_payload->>'mfaSecretCiphertext',
      reauthenticated_at = now(), selection_idempotency_key = p_idempotency_key,
      version = version + 1
    WHERE id = challenge.id RETURNING * INTO challenge;
    result_value := jsonb_build_object(
      'mfaEnrollmentRequired', true,
      'challengeId', challenge.id,
      'version', challenge.version,
      'expiresAt', challenge.expires_at,
      'replayed', false
    );
    event_target_type := 'login_enrollment';
    event_target_id := challenge.id::text;
  ELSE
    result_value := jsonb_build_object(
      'session', tenant_identity_create_session(
        challenge.user_email, session_id_value, session_expires_value,
        'password', p_payload->>'device', p_payload->>'ipApprox', tenant_id_value
      ),
      'mfaRequired', false,
      'replayed', false
    );
    UPDATE tenant_identity_auth_challenge
    SET status = 'consumed', consumed_at = now(),
      requested_tenant_id = tenant_id_value,
      selection_idempotency_key = p_idempotency_key,
      completed_session_id = session_id_value,
      completion_idempotency_key = p_idempotency_key,
      version = version + 1
    WHERE id = challenge.id;
    event_target_type := 'session';
    event_target_id := session_id_value::text;
  END IF;

  INSERT INTO tenant_iam_event (
    actor_user_email, tenant_id, membership_id, command, target_type, target_id,
    idempotency_key, command_hash, result
  ) VALUES (
    actor_email, tenant_id_value, NULL, 'select_login_context',
    event_target_type, event_target_id, p_idempotency_key, p_command_hash,
    result_value
  );
  RETURN result_value;
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_apply_command(
  p_command text,
  p_actor_email text,
  p_idempotency_key uuid,
  p_command_hash text,
  p_expected_version integer,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  replay tenant_iam_event%ROWTYPE;
  actor_email text := lower(btrim(p_actor_email));
BEGIN
  IF p_command IS NULL OR p_command NOT IN (
    'begin_activation','complete_activation','login_session','begin_login_context',
    'select_login_context','begin_login_mfa','complete_login_mfa','complete_login_enrollment',
    'begin_mfa_enrollment','complete_mfa_enrollment','record_challenge_failure',
    'revoke_session','logout','switch_context'
  ) OR p_idempotency_key IS NULL OR p_command_hash IS NULL
     OR p_command_hash !~ '^[a-f0-9]{64}$'
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF (p_command IN (
      'begin_activation','complete_activation','select_login_context','complete_login_mfa',
      'complete_login_enrollment','complete_mfa_enrollment',
      'revoke_session','logout','switch_context'
    ) AND (p_expected_version IS NULL OR p_expected_version < 1))
    OR (p_command NOT IN (
      'begin_activation','complete_activation','select_login_context','complete_login_mfa',
      'complete_login_enrollment','complete_mfa_enrollment',
      'revoke_session','logout','switch_context'
    ) AND p_expected_version IS NOT NULL) THEN
    RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_command IN (
    'issue_invitation', 'confirm_delivery', 'delivery_failed',
    'bind_legacy_access', 'bind_source', 'certify_data_plane', 'set_delivery_ready'
  ) THEN
    RAISE EXCEPTION 'IDENTITY_PLATFORM_COMMAND_REQUIRES_V2' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor_email || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO replay FROM tenant_iam_event event
  WHERE lower(event.actor_user_email) = actor_email
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND AND (
    replay.command IS DISTINCT FROM p_command
    OR replay.command_hash IS DISTINCT FROM p_command_hash
  ) THEN
    RAISE EXCEPTION 'IDENTITY_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
  END IF;
  IF p_command = 'select_login_context' THEN
    RETURN tenant_identity_select_login_context_email_v1(
      p_actor_email, p_idempotency_key, p_command_hash,
      p_expected_version, p_payload
    );
  END IF;
  RETURN tenant_identity_apply_command_core_009(
    p_command, p_actor_email, p_idempotency_key, p_command_hash,
    p_expected_version, p_payload
  );
END
$$;

COMMENT ON FUNCTION tenant_identity_select_login_context_email_v1(text,uuid,text,integer,jsonb) IS
  'Seleccion de contexto fail-closed: TOTP activo o email vivo abren login_mfa; privilegio sin factor exige enrollment.';
COMMENT ON FUNCTION tenant_identity_apply_command(text,text,uuid,text,integer,jsonb) IS
  'Facade runtime 020: seleccion email-first-factor; restantes comandos delegan al core gobernado 009.';

REVOKE ALL ON FUNCTION tenant_identity_select_login_context_email_v1(text,uuid,text,integer,jsonb)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)
  FROM PUBLIC CASCADE;

-- CREATE OR REPLACE conserva ACL historicas. El helper queda owner-only y la
-- facade queda exactamente owner + runtime; ningun rol obtiene acceso a tablas.
DO $email_first_factor_acl$
DECLARE
  function_oid oid;
  acl_row record;
  grantee_sql text;
BEGIN
  FOREACH function_oid IN ARRAY ARRAY[
    'public.tenant_identity_select_login_context_email_v1(text,uuid,text,integer,jsonb)'::regprocedure::oid,
    'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)'::regprocedure::oid
  ]
  LOOP
    FOR acl_row IN
      SELECT namespace.nspname AS schema_name,
        function_row.proname AS function_name,
        pg_get_function_identity_arguments(function_row.oid) AS identity_arguments,
        acl.grantee, role_row.rolname AS grantee_name
      FROM pg_proc function_row
      JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(
        function_row.proacl, acldefault('f', function_row.proowner)
      )) acl
      LEFT JOIN pg_roles role_row ON role_row.oid = acl.grantee
      WHERE function_row.oid = function_oid
        AND acl.grantee <> function_row.proowner
    LOOP
      IF acl_row.grantee = 0 THEN grantee_sql := 'PUBLIC';
      ELSIF acl_row.grantee_name IS NULL THEN
        RAISE EXCEPTION 'IDENTITY_EMAIL_FIRST_FACTOR_ACL_UNKNOWN' USING ERRCODE = 'P0001';
      ELSE grantee_sql := format('%I', acl_row.grantee_name);
      END IF;
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
        acl_row.schema_name, acl_row.function_name,
        acl_row.identity_arguments, grantee_sql
      );
    END LOOP;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app') THEN
    GRANT EXECUTE ON FUNCTION tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)
      TO municontrol_actions_runtime_app;
  END IF;
END
$email_first_factor_acl$;
