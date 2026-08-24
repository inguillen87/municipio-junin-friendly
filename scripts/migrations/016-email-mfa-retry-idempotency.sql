-- MuniControl Friendly - Sprint 016
-- Corrige el replay de preparacion del OTP email sin extender su TTL original.
-- p_expires_at es material solo al crear un desafio nuevo: un retry exacto
-- conserva expires_at, issued_at, cooldown, factor, codigo e intento existentes.

CREATE OR REPLACE FUNCTION tenant_identity_prepare_email_mfa(
  p_flow_hash text,
  p_idempotency_key uuid,
  p_code_hash text,
  p_expires_at timestamptz,
  p_expected_version integer,
  p_delivery_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  now_value timestamptz := now();
  auth_row tenant_identity_auth_challenge%ROWTYPE;
  factor_row tenant_identity_email_factor%ROWTYPE;
  replay tenant_identity_email_otp_challenge%ROWTYPE;
  created tenant_identity_email_otp_challenge%ROWTYPE;
BEGIN
  IF COALESCE(p_flow_hash, '') !~ '^[a-f0-9]{64}$'
     OR COALESCE(p_code_hash, '') !~ '^[a-f0-9]{64}$'
     OR p_idempotency_key IS NULL OR p_delivery_attempt_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('email-mfa:' || p_flow_hash, 0));

  SELECT * INTO auth_row FROM tenant_identity_auth_challenge
    WHERE flow_hash = p_flow_hash FOR UPDATE;
  IF NOT FOUND OR auth_row.purpose <> 'login_mfa' OR auth_row.status <> 'pending'
     OR auth_row.expires_at <= now_value
     OR auth_row.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_FLOW_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO factor_row FROM tenant_identity_email_factor
    WHERE lower(user_email) = lower(auth_row.user_email)
      AND status IN ('pending', 'verified') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_FACTOR_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Replay antes de validar el TTL solicitado: el vencimiento autoritativo es
  -- el ya persistido. No se lo recalcula, actualiza ni compara en un retry.
  SELECT * INTO replay FROM tenant_identity_email_otp_challenge
    WHERE prepare_idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF replay.auth_challenge_id IS DISTINCT FROM auth_row.id
       OR replay.auth_challenge_version IS DISTINCT FROM p_expected_version
       OR replay.factor_id IS DISTINCT FROM factor_row.id
       OR replay.factor_version IS DISTINCT FROM factor_row.version
       OR replay.destination_hash IS DISTINCT FROM factor_row.destination_hash
       OR replay.delivery_attempt_id IS DISTINCT FROM p_delivery_attempt_id
       OR replay.code_hash IS DISTINCT FROM p_code_hash THEN
      RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'id', replay.id,
      'deliveryAttemptId', replay.delivery_attempt_id,
      'destinationCiphertext', factor_row.destination_ciphertext,
      'destinationHash', replay.destination_hash,
      'expiresAt', replay.expires_at,
      'status', replay.status,
      'flowVersion', replay.auth_challenge_version,
      'factorVersion', replay.factor_version,
      'version', replay.version,
      'replayed', true
    );
  END IF;

  -- Un desafio nuevo conserva la ventana estricta de 015. La restriccion de
  -- tabla vuelve a cerrar expires_at respecto de issued_at como segunda barrera.
  IF p_expires_at <= now_value + interval '1 minute'
     OR p_expires_at > now_value + interval '5 minutes' THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tenant_identity_email_otp_challenge recent
    WHERE recent.factor_id = factor_row.id
      AND recent.issued_at > now_value - interval '45 seconds'
  ) THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_COOLDOWN' USING ERRCODE = 'P0001';
  END IF;

  UPDATE tenant_identity_email_otp_challenge
    SET status = 'superseded', superseded_at = now_value, version = version + 1
    WHERE auth_challenge_id = auth_row.id
      AND status IN ('pending_delivery', 'active');

  INSERT INTO tenant_identity_email_otp_challenge (
    auth_challenge_id, auth_challenge_version, factor_id, factor_version,
    destination_hash, delivery_attempt_id, code_hash, expires_at,
    prepare_idempotency_key
  ) VALUES (
    auth_row.id, auth_row.version, factor_row.id, factor_row.version,
    factor_row.destination_hash, p_delivery_attempt_id, p_code_hash, p_expires_at,
    p_idempotency_key
  ) RETURNING * INTO created;

  RETURN jsonb_build_object(
    'id', created.id,
    'deliveryAttemptId', created.delivery_attempt_id,
    'destinationCiphertext', factor_row.destination_ciphertext,
    'destinationHash', created.destination_hash,
    'expiresAt', created.expires_at,
    'status', created.status,
    'flowVersion', created.auth_challenge_version,
    'factorVersion', created.factor_version,
    'version', created.version,
    'replayed', false
  );
END
$$;

COMMENT ON FUNCTION tenant_identity_prepare_email_mfa(text,uuid,text,timestamptz,integer,uuid) IS
  'Runtime interno: prepara OTP email hash-only; retry exacto conserva el TTL persistido.';

REVOKE ALL ON FUNCTION tenant_identity_prepare_email_mfa(text,uuid,text,timestamptz,integer,uuid)
  FROM PUBLIC CASCADE;

-- CREATE OR REPLACE conserva ACL preexistentes. Se normaliza nuevamente a
-- owner + runtime exactos para no heredar grants historicos o default grants.
DO $email_mfa_retry_function_acl$
DECLARE
  acl_row record;
  grantee_sql text;
BEGIN
  FOR acl_row IN
    SELECT namespace.nspname AS schema_name, function_row.proname AS function_name,
      pg_get_function_identity_arguments(function_row.oid) AS identity_arguments,
      acl.grantee, role_row.rolname AS grantee_name
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      function_row.proacl, acldefault('f', function_row.proowner)
    )) acl
    LEFT JOIN pg_roles role_row ON role_row.oid = acl.grantee
    WHERE function_row.oid =
      'public.tenant_identity_prepare_email_mfa(text,uuid,text,timestamptz,integer,uuid)'::regprocedure
      AND acl.grantee <> function_row.proowner
  LOOP
    IF acl_row.grantee = 0 THEN grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_FUNCTION_ACL_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
      acl_row.schema_name, acl_row.function_name,
      acl_row.identity_arguments, grantee_sql
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app') THEN
    GRANT EXECUTE ON FUNCTION tenant_identity_prepare_email_mfa(text,uuid,text,timestamptz,integer,uuid)
      TO municontrol_actions_runtime_app;
  END IF;
END
$email_mfa_retry_function_acl$;
