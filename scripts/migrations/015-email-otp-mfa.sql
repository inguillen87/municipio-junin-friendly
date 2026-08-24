-- MuniControl Friendly - Sprint 015
-- Segundo factor de recuperacion por email. Este canal NO amplia ni modifica
-- tenant_identity_mfa_factor: TOTP conserva su contrato, su secreto y su ACL.
-- El destino se cifra; destination_hash y code_hash son HMAC SHA-256 (hash-only).
-- La tabla de desafios es una auditoria separada del factor TOTP y nunca guarda
-- el codigo en claro ni lo incorpora a resultados de funciones o eventos.

CREATE TABLE IF NOT EXISTS tenant_identity_email_factor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL REFERENCES internal_users(email)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  destination_ciphertext text NOT NULL,
  destination_hash char(64) NOT NULL,
  key_version smallint NOT NULL DEFAULT 1,
  status varchar(16) NOT NULL DEFAULT 'pending',
  provision_reason_hash char(64) NOT NULL,
  provision_idempotency_key uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT tenant_identity_email_factor_ciphertext_ck CHECK (
    length(destination_ciphertext) BETWEEN 24 AND 4096
  ),
  CONSTRAINT tenant_identity_email_factor_destination_hash_ck CHECK (
    destination_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT tenant_identity_email_factor_reason_hash_ck CHECK (
    provision_reason_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT tenant_identity_email_factor_key_version_ck CHECK (key_version > 0),
  CONSTRAINT tenant_identity_email_factor_status_ck CHECK (
    status IN ('pending', 'verified', 'revoked')
  ),
  CONSTRAINT tenant_identity_email_factor_state_ck CHECK (
    (status = 'pending' AND verified_at IS NULL AND revoked_at IS NULL)
    OR (status = 'verified' AND verified_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT tenant_identity_email_factor_version_ck CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_identity_email_factor_live_uk
  ON tenant_identity_email_factor (lower(user_email))
  WHERE status IN ('pending', 'verified');
CREATE INDEX IF NOT EXISTS tenant_identity_email_factor_destination_idx
  ON tenant_identity_email_factor (destination_hash, status);

CREATE TABLE IF NOT EXISTS tenant_identity_email_otp_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_challenge_id uuid NOT NULL REFERENCES tenant_identity_auth_challenge(id)
    ON DELETE RESTRICT,
  auth_challenge_version integer NOT NULL,
  factor_id uuid NOT NULL REFERENCES tenant_identity_email_factor(id)
    ON DELETE RESTRICT,
  factor_version integer NOT NULL,
  destination_hash char(64) NOT NULL,
  delivery_attempt_id uuid NOT NULL UNIQUE,
  code_hash char(64) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'pending_delivery',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  provider_accepted_at timestamptz,
  failed_at timestamptz,
  consumed_at timestamptz,
  locked_at timestamptz,
  superseded_at timestamptz,
  completed_session_id uuid REFERENCES tenant_identity_session(id) ON DELETE RESTRICT,
  prepare_idempotency_key uuid NOT NULL UNIQUE,
  completion_idempotency_key uuid UNIQUE,
  completion_command_hash char(64),
  completion_expected_version integer,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT tenant_identity_email_otp_auth_version_ck CHECK (
    auth_challenge_version > 0 AND factor_version > 0 AND version > 0
  ),
  CONSTRAINT tenant_identity_email_otp_destination_hash_ck CHECK (
    destination_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT tenant_identity_email_otp_code_hash_ck CHECK (
    code_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT tenant_identity_email_otp_completion_hash_ck CHECK (
    completion_command_hash IS NULL
    OR completion_command_hash ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT tenant_identity_email_otp_status_ck CHECK (
    status IN (
      'pending_delivery', 'active', 'failed', 'consumed', 'locked', 'superseded'
    )
  ),
  CONSTRAINT tenant_identity_email_otp_attempts_ck CHECK (
    max_attempts = 5 AND attempts BETWEEN 0 AND max_attempts
  ),
  CONSTRAINT tenant_identity_email_otp_expiry_ck CHECK (
    expires_at > issued_at AND expires_at <= issued_at + interval '5 minutes'
  ),
  CONSTRAINT tenant_identity_email_otp_state_ck CHECK (
    (status = 'pending_delivery'
      AND provider_accepted_at IS NULL AND failed_at IS NULL AND consumed_at IS NULL
      AND locked_at IS NULL AND superseded_at IS NULL
      AND completed_session_id IS NULL AND completion_idempotency_key IS NULL
      AND completion_command_hash IS NULL AND completion_expected_version IS NULL)
    OR (status = 'active'
      AND provider_accepted_at IS NOT NULL AND failed_at IS NULL AND consumed_at IS NULL
      AND locked_at IS NULL AND superseded_at IS NULL AND attempts < max_attempts
      AND completed_session_id IS NULL AND completion_idempotency_key IS NULL
      AND completion_command_hash IS NULL AND completion_expected_version IS NULL)
    OR (status = 'failed'
      AND failed_at IS NOT NULL AND consumed_at IS NULL AND locked_at IS NULL
      AND superseded_at IS NULL AND completed_session_id IS NULL
      AND completion_idempotency_key IS NULL AND completion_command_hash IS NULL
      AND completion_expected_version IS NULL)
    OR (status = 'consumed'
      AND provider_accepted_at IS NOT NULL AND consumed_at IS NOT NULL
      AND failed_at IS NULL AND locked_at IS NULL AND superseded_at IS NULL
      AND completed_session_id IS NOT NULL AND completion_idempotency_key IS NOT NULL
      AND completion_command_hash IS NOT NULL AND completion_expected_version IS NOT NULL)
    OR (status = 'locked'
      AND provider_accepted_at IS NOT NULL AND locked_at IS NOT NULL
      AND attempts = max_attempts AND failed_at IS NULL AND consumed_at IS NULL
      AND superseded_at IS NULL AND completed_session_id IS NULL
      AND completion_idempotency_key IS NULL AND completion_command_hash IS NULL
      AND completion_expected_version IS NULL)
    OR (status = 'superseded'
      AND superseded_at IS NOT NULL AND failed_at IS NULL AND consumed_at IS NULL
      AND locked_at IS NULL AND completed_session_id IS NULL
      AND completion_idempotency_key IS NULL AND completion_command_hash IS NULL
      AND completion_expected_version IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_identity_email_otp_live_uk
  ON tenant_identity_email_otp_challenge (auth_challenge_id)
  WHERE status IN ('pending_delivery', 'active');
CREATE INDEX IF NOT EXISTS tenant_identity_email_otp_cooldown_idx
  ON tenant_identity_email_otp_challenge (factor_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS tenant_identity_email_otp_auth_history_idx
  ON tenant_identity_email_otp_challenge (auth_challenge_id, issued_at DESC);

CREATE OR REPLACE FUNCTION tenant_identity_email_factor_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_FACTOR_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'IDENTITY_EMAIL_FACTOR_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR lower(NEW.user_email) IS DISTINCT FROM lower(OLD.user_email)
     OR NEW.destination_ciphertext IS DISTINCT FROM OLD.destination_ciphertext
     OR NEW.destination_hash IS DISTINCT FROM OLD.destination_hash
     OR NEW.key_version IS DISTINCT FROM OLD.key_version
     OR NEW.provision_reason_hash IS DISTINCT FROM OLD.provision_reason_hash
     OR NEW.provision_idempotency_key IS DISTINCT FROM OLD.provision_idempotency_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_FACTOR_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('verified', 'revoked'))
    OR (OLD.status = 'verified' AND NEW.status = 'revoked')
  ) THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_FACTOR_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_identity_email_factor_guard ON tenant_identity_email_factor;
CREATE TRIGGER tenant_identity_email_factor_guard
BEFORE INSERT OR UPDATE OR DELETE ON tenant_identity_email_factor
FOR EACH ROW EXECUTE FUNCTION tenant_identity_email_factor_guard_v1();

CREATE OR REPLACE FUNCTION tenant_identity_email_otp_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  auth_row tenant_identity_auth_challenge%ROWTYPE;
  factor_row tenant_identity_email_factor%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_OTP_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT * INTO auth_row FROM tenant_identity_auth_challenge
      WHERE id = NEW.auth_challenge_id;
    SELECT * INTO factor_row FROM tenant_identity_email_factor
      WHERE id = NEW.factor_id;
    IF NOT FOUND OR auth_row.id IS NULL OR auth_row.purpose <> 'login_mfa'
       OR auth_row.version IS DISTINCT FROM NEW.auth_challenge_version
       OR lower(auth_row.user_email) IS DISTINCT FROM lower(factor_row.user_email)
       OR factor_row.status NOT IN ('pending', 'verified')
       OR factor_row.version IS DISTINCT FROM NEW.factor_version
       OR factor_row.destination_hash IS DISTINCT FROM NEW.destination_hash
       OR NEW.status <> 'pending_delivery' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'IDENTITY_EMAIL_OTP_BINDING_INVALID' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.auth_challenge_id IS DISTINCT FROM OLD.auth_challenge_id
     OR NEW.auth_challenge_version IS DISTINCT FROM OLD.auth_challenge_version
     OR NEW.factor_id IS DISTINCT FROM OLD.factor_id
     OR NEW.factor_version IS DISTINCT FROM OLD.factor_version
     OR NEW.destination_hash IS DISTINCT FROM OLD.destination_hash
     OR NEW.delivery_attempt_id IS DISTINCT FROM OLD.delivery_attempt_id
     OR NEW.code_hash IS DISTINCT FROM OLD.code_hash
     OR NEW.max_attempts IS DISTINCT FROM OLD.max_attempts
     OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.prepare_idempotency_key IS DISTINCT FROM OLD.prepare_idempotency_key
     OR NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_OTP_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status IN ('failed', 'consumed', 'locked', 'superseded') THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_OTP_TERMINAL' USING ERRCODE = 'P0001';
  ELSIF OLD.status = 'pending_delivery' AND NEW.status NOT IN ('active', 'failed', 'superseded') THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_OTP_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  ELSIF OLD.status = 'active' AND NEW.status NOT IN ('active', 'consumed', 'locked', 'superseded') THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_OTP_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'active' AND NEW.status IN ('active', 'locked')
     AND NEW.attempts IS DISTINCT FROM OLD.attempts + 1 THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_OTP_ATTEMPT_INVALID' USING ERRCODE = 'P0001';
  ELSIF NOT (OLD.status = 'active' AND NEW.status IN ('active', 'locked'))
     AND NEW.attempts IS DISTINCT FROM OLD.attempts THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_OTP_ATTEMPT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_identity_email_otp_guard ON tenant_identity_email_otp_challenge;
CREATE TRIGGER tenant_identity_email_otp_guard
BEFORE INSERT OR UPDATE OR DELETE ON tenant_identity_email_otp_challenge
FOR EACH ROW EXECUTE FUNCTION tenant_identity_email_otp_guard_v1();

-- Owner-only: alta o reemplazo del destino cifrado. El reason_hash y la clave
-- idempotente quedan como evidencia; no se devuelve email, hash ni ciphertext.
CREATE OR REPLACE FUNCTION tenant_identity_provision_email_factor_v1(
  p_user_email text,
  p_destination_ciphertext text,
  p_destination_hash text,
  p_reason_hash text,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  normalized_email text := lower(btrim(p_user_email));
  user_row internal_users%ROWTYPE;
  replay tenant_identity_email_factor%ROWTYPE;
  previous tenant_identity_email_factor%ROWTYPE;
  created tenant_identity_email_factor%ROWTYPE;
BEGIN
  IF normalized_email IS NULL OR normalized_email = '' OR p_idempotency_key IS NULL
     OR length(COALESCE(p_destination_ciphertext, '')) NOT BETWEEN 24 AND 4096
     OR COALESCE(p_destination_hash, '') !~ '^[a-f0-9]{64}$'
     OR COALESCE(p_reason_hash, '') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_FACTOR_PROVISION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-factor:' || normalized_email, 0));
  SELECT * INTO user_row FROM internal_users
    WHERE lower(email) = normalized_email AND active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_FACTOR_USER_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO replay FROM tenant_identity_email_factor
    WHERE provision_idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF lower(replay.user_email) IS DISTINCT FROM lower(user_row.email)
       OR replay.destination_hash IS DISTINCT FROM p_destination_hash
       OR replay.provision_reason_hash IS DISTINCT FROM p_reason_hash THEN
      RAISE EXCEPTION 'IDENTITY_EMAIL_FACTOR_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'id', replay.id, 'status', replay.status,
      'version', replay.version, 'replayed', true
    );
  END IF;
  SELECT * INTO previous FROM tenant_identity_email_factor
    WHERE lower(user_email) = lower(user_row.email)
      AND status IN ('pending', 'verified') FOR UPDATE;
  IF FOUND THEN
    UPDATE tenant_identity_email_factor
      SET status = 'revoked', revoked_at = now(), version = version + 1
      WHERE id = previous.id;
  END IF;
  INSERT INTO tenant_identity_email_factor (
    user_email, destination_ciphertext, destination_hash,
    provision_reason_hash, provision_idempotency_key
  ) VALUES (
    user_row.email, p_destination_ciphertext, p_destination_hash,
    p_reason_hash, p_idempotency_key
  ) RETURNING * INTO created;
  RETURN jsonb_build_object(
    'id', created.id, 'status', created.status,
    'version', created.version, 'replayed', false
  );
END
$$;

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
     OR p_expires_at IS NULL
     OR p_expires_at <= now_value + interval '1 minute'
     OR p_expires_at > now_value + interval '5 minutes' THEN
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
  SELECT * INTO replay FROM tenant_identity_email_otp_challenge
    WHERE prepare_idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF replay.auth_challenge_id IS DISTINCT FROM auth_row.id
       OR replay.auth_challenge_version IS DISTINCT FROM p_expected_version
       OR replay.factor_id IS DISTINCT FROM factor_row.id
       OR replay.factor_version IS DISTINCT FROM factor_row.version
       OR replay.destination_hash IS DISTINCT FROM factor_row.destination_hash
       OR replay.delivery_attempt_id IS DISTINCT FROM p_delivery_attempt_id
       OR replay.code_hash IS DISTINCT FROM p_code_hash
       OR replay.expires_at IS DISTINCT FROM p_expires_at THEN
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

CREATE OR REPLACE FUNCTION tenant_identity_mark_email_mfa_delivery(
  p_flow_hash text,
  p_delivery_attempt_id uuid,
  p_provider_accepted boolean
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  now_value timestamptz := now();
  auth_row tenant_identity_auth_challenge%ROWTYPE;
  factor_row tenant_identity_email_factor%ROWTYPE;
  otp_row tenant_identity_email_otp_challenge%ROWTYPE;
  replayed_value boolean := false;
BEGIN
  IF COALESCE(p_flow_hash, '') !~ '^[a-f0-9]{64}$' OR p_delivery_attempt_id IS NULL
     OR p_provider_accepted IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_DELIVERY_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-mfa:' || p_flow_hash, 0));
  SELECT * INTO auth_row FROM tenant_identity_auth_challenge
    WHERE flow_hash = p_flow_hash;
  IF NOT FOUND OR auth_row.purpose <> 'login_mfa' THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_FLOW_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO otp_row FROM tenant_identity_email_otp_challenge
    WHERE auth_challenge_id = auth_row.id
      AND delivery_attempt_id = p_delivery_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_DELIVERY_STALE' USING ERRCODE = 'P0001';
  END IF;
  IF otp_row.status = 'active' AND p_provider_accepted IS TRUE THEN
    replayed_value := true;
  ELSIF otp_row.status = 'failed' AND p_provider_accepted IS FALSE THEN
    replayed_value := true;
  ELSIF otp_row.status <> 'pending_delivery' THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_DELIVERY_STALE' USING ERRCODE = 'P0001';
  ELSE
    SELECT * INTO factor_row FROM tenant_identity_email_factor
      WHERE id = otp_row.factor_id;
    IF p_provider_accepted IS FALSE OR auth_row.status <> 'pending'
       OR auth_row.expires_at <= now_value OR otp_row.expires_at <= now_value
       OR factor_row.status NOT IN ('pending', 'verified')
       OR factor_row.version IS DISTINCT FROM otp_row.factor_version
       OR factor_row.destination_hash IS DISTINCT FROM otp_row.destination_hash THEN
      UPDATE tenant_identity_email_otp_challenge
        SET status = 'failed', failed_at = now_value, version = version + 1
        WHERE id = otp_row.id RETURNING * INTO otp_row;
    ELSE
      UPDATE tenant_identity_email_otp_challenge
        SET status = 'active', provider_accepted_at = now_value, version = version + 1
        WHERE id = otp_row.id RETURNING * INTO otp_row;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'id', otp_row.id, 'status', otp_row.status,
    'expiresAt', otp_row.expires_at, 'version', otp_row.version,
    'replayed', replayed_value
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_complete_email_mfa(
  p_flow_hash text,
  p_idempotency_key uuid,
  p_code_hash text,
  p_session_id uuid,
  p_session_expires_at timestamptz,
  p_device text,
  p_ip_approx text,
  p_expected_version integer,
  p_delivery_attempt_id uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  now_value timestamptz := now();
  auth_row tenant_identity_auth_challenge%ROWTYPE;
  factor_row tenant_identity_email_factor%ROWTYPE;
  otp_row tenant_identity_email_otp_challenge%ROWTYPE;
  audit_row tenant_iam_event%ROWTYPE;
  session_value jsonb;
  response_value jsonb;
  audit_value jsonb;
  next_attempts integer;
  locked_value boolean;
BEGIN
  IF COALESCE(p_flow_hash, '') !~ '^[a-f0-9]{64}$'
     OR COALESCE(p_code_hash, '') !~ '^[a-f0-9]{64}$'
     OR COALESCE(p_command_hash, '') !~ '^[a-f0-9]{64}$'
     OR p_idempotency_key IS NULL
     OR p_session_id IS NULL OR p_delivery_attempt_id IS NULL
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_session_expires_at IS NULL
     OR p_session_expires_at <= now_value + interval '5 minutes'
     OR p_session_expires_at > now_value + interval '12 hours' THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_COMPLETE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('email-mfa:' || p_flow_hash, 0));
  SELECT * INTO auth_row FROM tenant_identity_auth_challenge
    WHERE flow_hash = p_flow_hash FOR UPDATE;
  IF NOT FOUND OR auth_row.purpose <> 'login_mfa' THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_FLOW_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO otp_row FROM tenant_identity_email_otp_challenge
    WHERE auth_challenge_id = auth_row.id
      AND delivery_attempt_id = p_delivery_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_ATTEMPT_STALE' USING ERRCODE = 'P0001';
  END IF;

  -- tenant_iam_event hace idempotentes tambien los intentos incorrectos: un
  -- retry de red no consume dos de los cinco intentos. El result no lleva PII.
  SELECT * INTO audit_row FROM tenant_iam_event
    WHERE lower(actor_user_email) = lower(auth_row.user_email)
      AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF audit_row.command <> 'complete_email_mfa'
       OR audit_row.target_type <> 'email_otp_challenge'
       OR audit_row.target_id <> otp_row.id::text
       OR audit_row.command_hash IS DISTINCT FROM p_command_hash
       OR audit_row.result->>'deliveryAttemptId' IS DISTINCT FROM p_delivery_attempt_id::text
       OR (audit_row.result->>'requestVersion')::integer IS DISTINCT FROM p_expected_version
       OR audit_row.result->>'requestSessionId' IS DISTINCT FROM p_session_id::text THEN
      RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_REPLAY' USING ERRCODE = 'P0001';
    END IF;
    IF COALESCE((audit_row.result->>'verified')::boolean, false) IS TRUE
       AND (otp_row.status <> 'consumed'
         OR otp_row.completion_idempotency_key IS DISTINCT FROM p_idempotency_key
         OR otp_row.completion_command_hash IS DISTINCT FROM p_command_hash
         OR otp_row.completion_expected_version IS DISTINCT FROM p_expected_version
         OR otp_row.completed_session_id IS DISTINCT FROM p_session_id
         OR otp_row.code_hash IS DISTINCT FROM p_code_hash) THEN
      RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_REPLAY' USING ERRCODE = 'P0001';
    END IF;
    response_value := (audit_row.result
      - 'deliveryAttemptId' - 'requestVersion' - 'requestSessionId')
      || jsonb_build_object('replayed', true);
    IF COALESCE((response_value->>'verified')::boolean, false) IS TRUE THEN
      response_value := jsonb_set(
        response_value, '{session,email}', to_jsonb(auth_row.user_email), true
      );
    END IF;
    RETURN response_value;
  END IF;

  IF auth_row.status <> 'pending' OR auth_row.expires_at <= now_value
     OR auth_row.version IS DISTINCT FROM otp_row.auth_challenge_version
     OR otp_row.status <> 'active' OR otp_row.expires_at <= now_value
     OR otp_row.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_CHALLENGE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO factor_row FROM tenant_identity_email_factor
    WHERE id = otp_row.factor_id FOR UPDATE;
  IF NOT FOUND OR factor_row.status NOT IN ('pending', 'verified')
     OR factor_row.version IS DISTINCT FROM otp_row.factor_version
     OR factor_row.destination_hash IS DISTINCT FROM otp_row.destination_hash
     OR lower(factor_row.user_email) IS DISTINCT FROM lower(auth_row.user_email) THEN
    RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_FACTOR_STALE' USING ERRCODE = 'P0001';
  END IF;

  IF otp_row.code_hash IS DISTINCT FROM p_code_hash THEN
    next_attempts := otp_row.attempts + 1;
    locked_value := next_attempts >= otp_row.max_attempts;
    UPDATE tenant_identity_email_otp_challenge
      SET attempts = next_attempts,
        status = CASE WHEN locked_value THEN 'locked' ELSE 'active' END,
        locked_at = CASE WHEN locked_value THEN now_value ELSE NULL END,
        version = version + 1
      WHERE id = otp_row.id RETURNING * INTO otp_row;
    response_value := jsonb_build_object(
      'verified', false, 'locked', locked_value,
      'remainingAttempts', otp_row.max_attempts - otp_row.attempts,
      'version', otp_row.version, 'replayed', false
    );
    audit_value := response_value || jsonb_build_object(
      'deliveryAttemptId', p_delivery_attempt_id,
      'requestVersion', p_expected_version,
      'requestSessionId', p_session_id
    );
    INSERT INTO tenant_iam_event (
      actor_user_email, tenant_id, command, target_type, target_id,
      idempotency_key, command_hash, result
    ) VALUES (
      auth_row.user_email, auth_row.requested_tenant_id, 'complete_email_mfa',
      'email_otp_challenge', otp_row.id::text, p_idempotency_key,
      p_command_hash, audit_value
    );
    RETURN response_value;
  END IF;

  IF factor_row.status = 'pending' THEN
    UPDATE tenant_identity_email_factor
      SET status = 'verified', verified_at = now_value, version = version + 1
      WHERE id = factor_row.id RETURNING * INTO factor_row;
    UPDATE internal_users
      SET identity_version = identity_version + 1, updated_at = now_value
      WHERE lower(email) = lower(auth_row.user_email);
  END IF;
  session_value := tenant_identity_create_session(
    auth_row.user_email, p_session_id, p_session_expires_at, 'recovery',
    p_device, p_ip_approx, auth_row.requested_tenant_id
  );
  UPDATE tenant_identity_auth_challenge
    SET status = 'consumed', consumed_at = now_value,
      completion_idempotency_key = p_idempotency_key,
      completed_session_id = p_session_id, version = version + 1
    WHERE id = auth_row.id;
  UPDATE tenant_identity_email_otp_challenge
    SET status = 'consumed', consumed_at = now_value,
      completed_session_id = p_session_id,
      completion_idempotency_key = p_idempotency_key,
      completion_command_hash = p_command_hash,
      completion_expected_version = p_expected_version,
      version = version + 1
    WHERE id = otp_row.id RETURNING * INTO otp_row;
  response_value := jsonb_build_object(
    'verified', true, 'locked', false,
    'remainingAttempts', otp_row.max_attempts - otp_row.attempts,
    'version', otp_row.version,
    'session', session_value,
    'replayed', false
  );
  audit_value := (response_value - 'session') || jsonb_build_object(
    'session', session_value - 'email',
    'deliveryAttemptId', p_delivery_attempt_id,
    'requestVersion', p_expected_version,
    'requestSessionId', p_session_id
  );
  INSERT INTO tenant_iam_event (
    actor_user_email, tenant_id, command, target_type, target_id,
    idempotency_key, command_hash, result
  ) VALUES (
    auth_row.user_email, auth_row.requested_tenant_id, 'complete_email_mfa',
    'email_otp_challenge', otp_row.id::text, p_idempotency_key,
    p_command_hash, audit_value
  );
  RETURN response_value;
END
$$;

COMMENT ON TABLE tenant_identity_email_factor IS
  'Destino de recuperacion cifrado y HMAC-only; provisioning owner-only, versionado e idempotente.';
COMMENT ON TABLE tenant_identity_email_otp_challenge IS
  'Auditoria separada para recovery email: entrega, expiracion, lockout, consumo e idempotencia; nunca codigo ni PII en resultados.';
COMMENT ON FUNCTION tenant_identity_provision_email_factor_v1(text,text,text,text,uuid) IS
  'Owner-only: crea o reemplaza un factor email pending sin devolver destino, hash ni ciphertext.';
COMMENT ON FUNCTION tenant_identity_prepare_email_mfa(text,uuid,text,timestamptz,integer,uuid) IS
  'Runtime interno: prepara OTP email hash-only y devuelve ciphertext solo al backend de entrega.';
COMMENT ON FUNCTION tenant_identity_mark_email_mfa_delivery(text,uuid,boolean) IS
  'Runtime interno: activa o falla idempotentemente el intento de entrega exacto.';
COMMENT ON FUNCTION tenant_identity_complete_email_mfa(text,uuid,text,uuid,timestamptz,text,text,integer,uuid,text) IS
  'Runtime interno: completa recovery email one-time, lockout 5 y devuelve la sesion completa solo al backend.';

REVOKE ALL PRIVILEGES ON TABLE tenant_identity_email_factor,
  tenant_identity_email_otp_challenge FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_email_factor_guard_v1() FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_email_otp_guard_v1() FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_provision_email_factor_v1(text,text,text,text,uuid)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_prepare_email_mfa(text,uuid,text,timestamptz,integer,uuid)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_mark_email_mfa_delivery(text,uuid,boolean)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_complete_email_mfa(text,uuid,text,uuid,timestamptz,text,text,integer,uuid,text)
  FROM PUBLIC CASCADE;

-- ALTER DEFAULT PRIVILEGES previos no pueden abrir estas dos tablas: se revoca
-- toda ACL de tabla/columna que no pertenezca al owner de la migracion.
DO $email_mfa_table_acl$
DECLARE
  acl_row record;
  grantee_sql text;
BEGIN
  FOR acl_row IN
    SELECT namespace.nspname AS schema_name, relation.relname AS table_name,
      acl.grantee, role_row.rolname AS grantee_name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      relation.relacl, acldefault('r', relation.relowner)
    )) acl
    LEFT JOIN pg_roles role_row ON role_row.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'tenant_identity_email_factor', 'tenant_identity_email_otp_challenge'
      )
      AND acl.grantee <> relation.relowner
  LOOP
    IF acl_row.grantee = 0 THEN grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_TABLE_ACL_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM %s CASCADE',
      acl_row.schema_name, acl_row.table_name, grantee_sql
    );
  END LOOP;
  FOR acl_row IN
    SELECT namespace.nspname AS schema_name, relation.relname AS table_name,
      attribute.attname AS column_name, acl.grantee,
      role_row.rolname AS grantee_name, acl.privilege_type
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE
    CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
    LEFT JOIN pg_roles role_row ON role_row.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'tenant_identity_email_factor', 'tenant_identity_email_otp_challenge'
      )
      AND acl.grantee <> relation.relowner
  LOOP
    IF acl_row.grantee = 0 THEN grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'IDENTITY_EMAIL_MFA_COLUMN_ACL_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    EXECUTE format(
      'REVOKE %s (%I) ON TABLE %I.%I FROM %s CASCADE',
      acl_row.privilege_type, acl_row.column_name,
      acl_row.schema_name, acl_row.table_name, grantee_sql
    );
  END LOOP;
END
$email_mfa_table_acl$;

DO $email_mfa_function_acl$
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
    WHERE function_row.oid IN (
      'public.tenant_identity_email_factor_guard_v1()'::regprocedure,
      'public.tenant_identity_email_otp_guard_v1()'::regprocedure,
      'public.tenant_identity_provision_email_factor_v1(text,text,text,text,uuid)'::regprocedure,
      'public.tenant_identity_prepare_email_mfa(text,uuid,text,timestamptz,integer,uuid)'::regprocedure,
      'public.tenant_identity_mark_email_mfa_delivery(text,uuid,boolean)'::regprocedure,
      'public.tenant_identity_complete_email_mfa(text,uuid,text,uuid,timestamptz,text,text,integer,uuid,text)'::regprocedure
    ) AND acl.grantee <> function_row.proowner
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
    REVOKE ALL PRIVILEGES ON TABLE tenant_identity_email_factor,
      tenant_identity_email_otp_challenge
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_identity_email_factor_guard_v1()
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_identity_email_otp_guard_v1()
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_identity_provision_email_factor_v1(text,text,text,text,uuid)
      FROM municontrol_actions_runtime_app CASCADE;
    GRANT EXECUTE ON FUNCTION tenant_identity_prepare_email_mfa(text,uuid,text,timestamptz,integer,uuid)
      TO municontrol_actions_runtime_app;
    GRANT EXECUTE ON FUNCTION tenant_identity_mark_email_mfa_delivery(text,uuid,boolean)
      TO municontrol_actions_runtime_app;
    GRANT EXECUTE ON FUNCTION tenant_identity_complete_email_mfa(text,uuid,text,uuid,timestamptz,text,text,integer,uuid,text)
      TO municontrol_actions_runtime_app;
  END IF;
END
$email_mfa_function_acl$;
