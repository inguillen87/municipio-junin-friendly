-- MuniControl Friendly - Sprint 005
-- Gateway de identidad tenant-aware. Nace cerrado: ninguna invitacion puede
-- emitirse ni aceptarse hasta certificar binding, data planes y entrega.

ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS auth_mode varchar(16) NOT NULL DEFAULT 'legacy';
ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS identity_version integer NOT NULL DEFAULT 1;
ALTER TABLE internal_users DROP CONSTRAINT IF EXISTS internal_users_active_password_ck;
ALTER TABLE internal_users ADD CONSTRAINT internal_users_active_password_ck CHECK (
  identity_version > 0
  AND auth_mode IN ('legacy', 'managed')
  AND (
    active IS FALSE
    OR (auth_mode = 'legacy' AND password_hash IS NOT NULL)
    OR (auth_mode = 'managed' AND password_hash IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS tenant_identity_policy (
  tenant_id uuid PRIMARY KEY REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  tenant_data_plane_ready boolean NOT NULL DEFAULT false,
  invitation_delivery_ready boolean NOT NULL DEFAULT false,
  certified_source_binding_id uuid REFERENCES platform_tenant_source_binding(id) ON DELETE RESTRICT,
  certified_release_sha char(40),
  certified_by_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  certified_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_identity_policy_version_ck CHECK (version > 0),
  CONSTRAINT tenant_identity_policy_release_ck CHECK (
    certified_release_sha IS NULL OR certified_release_sha ~ '^[a-f0-9]{40}$'
  ),
  CONSTRAINT tenant_identity_policy_certification_ck CHECK (
    (tenant_data_plane_ready IS FALSE)
    OR (
      certified_source_binding_id IS NOT NULL
      AND certified_release_sha IS NOT NULL
      AND certified_by_user_email IS NOT NULL
      AND certified_at IS NOT NULL
    )
  )
);

INSERT INTO tenant_identity_policy (tenant_id)
SELECT tenant.id FROM platform_tenant tenant
ON CONFLICT (tenant_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS platform_tenant_source_binding_tenant_id_id_uk
  ON platform_tenant_source_binding (tenant_id, id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tenant_identity_policy'::regclass
      AND conname = 'tenant_identity_policy_certified_binding_fk'
  ) THEN
    ALTER TABLE tenant_identity_policy ADD CONSTRAINT tenant_identity_policy_certified_binding_fk
      FOREIGN KEY (tenant_id, certified_source_binding_id)
      REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS tenant_identity_password_credential (
  user_email text PRIMARY KEY REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  password_hash text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_identity_password_hash_ck CHECK (length(password_hash) BETWEEN 64 AND 1024),
  CONSTRAINT tenant_identity_password_version_ck CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS tenant_identity_invitation_secret (
  invitation_id uuid PRIMARY KEY REFERENCES tenant_invitation(id) ON DELETE RESTRICT,
  delivery_attempt_id uuid NOT NULL,
  code_hash char(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending',
  issued_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT tenant_identity_invitation_secret_hash_uk UNIQUE (code_hash),
  CONSTRAINT tenant_identity_invitation_secret_hash_ck CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT tenant_identity_invitation_secret_status_ck CHECK (status IN ('pending', 'active', 'consumed', 'revoked')),
  CONSTRAINT tenant_identity_invitation_secret_expiry_ck CHECK (expires_at > issued_at),
  CONSTRAINT tenant_identity_invitation_secret_state_ck CHECK (
    (status IN ('pending', 'active') AND consumed_at IS NULL AND revoked_at IS NULL)
    OR (status = 'consumed' AND consumed_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT tenant_identity_invitation_secret_version_ck CHECK (version > 0)
);
ALTER TABLE tenant_identity_invitation_secret
  ADD COLUMN IF NOT EXISTS delivery_attempt_id uuid;
UPDATE tenant_identity_invitation_secret
SET delivery_attempt_id = gen_random_uuid()
WHERE delivery_attempt_id IS NULL;
ALTER TABLE tenant_identity_invitation_secret
  ALTER COLUMN delivery_attempt_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_identity_invitation_secret_attempt_uk
  ON tenant_identity_invitation_secret(delivery_attempt_id);

CREATE TABLE IF NOT EXISTS tenant_identity_auth_challenge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_hash char(64) NOT NULL UNIQUE,
  purpose varchar(24) NOT NULL,
  user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  invitation_id uuid REFERENCES tenant_invitation(id) ON DELETE RESTRICT,
  invitation_secret_version integer,
  requested_tenant_id uuid REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  mfa_secret_ciphertext text,
  reauthenticated_at timestamptz,
  status varchar(16) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  locked_at timestamptz,
  verified_totp_step bigint,
  selection_idempotency_key uuid,
  completion_idempotency_key uuid,
  completed_session_id uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_identity_auth_challenge_hash_ck CHECK (flow_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT tenant_identity_auth_challenge_purpose_ck CHECK (
    purpose IN ('activation', 'login_context', 'login_mfa', 'login_enrollment', 'mfa_enrollment')
  ),
  CONSTRAINT tenant_identity_auth_challenge_status_ck CHECK (status IN ('pending', 'consumed', 'locked')),
  CONSTRAINT tenant_identity_auth_challenge_attempts_ck CHECK (
    max_attempts BETWEEN 3 AND 10 AND attempts BETWEEN 0 AND max_attempts
  ),
  CONSTRAINT tenant_identity_auth_challenge_expiry_ck CHECK (expires_at > created_at),
  CONSTRAINT tenant_identity_auth_challenge_state_ck CHECK (
    (status = 'pending' AND consumed_at IS NULL AND locked_at IS NULL)
    OR (status = 'consumed' AND consumed_at IS NOT NULL AND locked_at IS NULL)
    OR (status = 'locked' AND locked_at IS NOT NULL)
  ),
  CONSTRAINT tenant_identity_auth_challenge_activation_ck CHECK (
    (purpose = 'activation' AND invitation_id IS NOT NULL AND invitation_secret_version IS NOT NULL)
    OR (purpose <> 'activation' AND invitation_id IS NULL)
  ),
  CONSTRAINT tenant_identity_auth_challenge_version_ck CHECK (version > 0)
);

-- Upgrade-safe binding for activation flows created by an earlier 005 revision.
-- Pending legacy flows cannot prove which one-time invitation secret they saw,
-- so invalidate them before enforcing the immutable secret-version binding.
ALTER TABLE tenant_identity_auth_challenge
  ADD COLUMN IF NOT EXISTS invitation_secret_version integer;
UPDATE tenant_identity_auth_challenge
SET status = 'locked', locked_at = now(), version = version + 1
WHERE purpose = 'activation' AND status = 'pending' AND invitation_secret_version IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tenant_identity_auth_challenge'::regclass
      AND conname = 'tenant_identity_auth_challenge_activation_ck'
  ) THEN
    ALTER TABLE tenant_identity_auth_challenge
      DROP CONSTRAINT tenant_identity_auth_challenge_activation_ck;
  END IF;
  ALTER TABLE tenant_identity_auth_challenge
    ADD CONSTRAINT tenant_identity_auth_challenge_activation_ck CHECK (
      (purpose = 'activation' AND invitation_id IS NOT NULL
        AND (status <> 'pending' OR invitation_secret_version IS NOT NULL))
      OR (purpose <> 'activation' AND invitation_id IS NULL AND invitation_secret_version IS NULL)
    );
END
$$;

CREATE TABLE IF NOT EXISTS tenant_identity_mfa_factor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  factor_kind varchar(16) NOT NULL DEFAULT 'totp',
  secret_ciphertext text NOT NULL,
  key_version smallint NOT NULL DEFAULT 1,
  status varchar(16) NOT NULL DEFAULT 'active',
  last_accepted_step bigint,
  verified_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT tenant_identity_mfa_factor_kind_ck CHECK (factor_kind = 'totp'),
  CONSTRAINT tenant_identity_mfa_factor_key_version_ck CHECK (key_version > 0),
  CONSTRAINT tenant_identity_mfa_factor_status_ck CHECK (status IN ('active', 'revoked')),
  CONSTRAINT tenant_identity_mfa_factor_state_ck CHECK (
    (status = 'active' AND revoked_at IS NULL) OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT tenant_identity_mfa_factor_version_ck CHECK (version > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_identity_mfa_factor_active_uk
  ON tenant_identity_mfa_factor (lower(user_email), factor_kind) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS tenant_identity_recovery_code (
  factor_id uuid NOT NULL REFERENCES tenant_identity_mfa_factor(id) ON DELETE RESTRICT,
  code_hash char(64) NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factor_id, code_hash),
  CONSTRAINT tenant_identity_recovery_code_hash_ck CHECK (code_hash ~ '^[a-f0-9]{64}$')
);

CREATE TABLE IF NOT EXISTS tenant_identity_legacy_binding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  legacy_role varchar(64) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  granted_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  reason text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT tenant_identity_legacy_binding_uk UNIQUE (user_email, tenant_id),
  CONSTRAINT tenant_identity_legacy_binding_reason_ck CHECK (length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT tenant_identity_legacy_binding_state_ck CHECK (
    (active IS TRUE AND revoked_at IS NULL) OR (active IS FALSE AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT tenant_identity_legacy_binding_version_ck CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS tenant_identity_legacy_binding_capability (
  binding_id uuid NOT NULL REFERENCES tenant_identity_legacy_binding(id) ON DELETE RESTRICT,
  capability_key varchar(96) NOT NULL REFERENCES iam_capability(capability_key) ON DELETE RESTRICT,
  PRIMARY KEY (binding_id, capability_key)
);

CREATE TABLE IF NOT EXISTS tenant_identity_session (
  id uuid PRIMARY KEY,
  user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  active_tenant_id uuid REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  source varchar(24) NOT NULL,
  auth_level varchar(16) NOT NULL,
  session_version integer NOT NULL DEFAULT 1,
  identity_version integer NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  device_label varchar(120) NOT NULL DEFAULT 'Navegador',
  ip_approx varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT tenant_identity_session_source_ck CHECK (source IN ('membership', 'legacy_explicit', 'platform')),
  CONSTRAINT tenant_identity_session_tenant_source_ck CHECK (
    (source = 'platform' AND active_tenant_id IS NULL)
    OR (source IN ('membership', 'legacy_explicit') AND active_tenant_id IS NOT NULL)
  ),
  CONSTRAINT tenant_identity_session_auth_level_ck CHECK (auth_level IN ('password', 'mfa', 'recovery')),
  CONSTRAINT tenant_identity_session_status_ck CHECK (status IN ('active', 'revoked')),
  CONSTRAINT tenant_identity_session_lifecycle_ck CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT tenant_identity_session_expiry_ck CHECK (expires_at > created_at),
  CONSTRAINT tenant_identity_session_versions_ck CHECK (
    session_version > 0 AND identity_version > 0 AND version > 0
  )
);
CREATE INDEX IF NOT EXISTS tenant_identity_session_user_active_idx
  ON tenant_identity_session (lower(user_email), expires_at DESC) WHERE status = 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tenant_identity_auth_challenge'::regclass
      AND conname = 'tenant_identity_auth_challenge_completed_session_fk'
  ) THEN
    ALTER TABLE tenant_identity_auth_challenge
      ADD CONSTRAINT tenant_identity_auth_challenge_completed_session_fk
      FOREIGN KEY (completed_session_id) REFERENCES tenant_identity_session(id) ON DELETE RESTRICT;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS tenant_identity_rate_limit (
  scope varchar(48) NOT NULL,
  bucket_hash char(64) NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  blocked_until timestamptz,
  PRIMARY KEY (scope, bucket_hash),
  CONSTRAINT tenant_identity_rate_limit_scope_ck CHECK (scope ~ '^[a-z][a-z0-9_.-]{2,47}$'),
  CONSTRAINT tenant_identity_rate_limit_hash_ck CHECK (bucket_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT tenant_identity_rate_limit_count_ck CHECK (attempt_count >= 0)
);

INSERT INTO iam_capability (capability_key, label, description, scope_kind, sensitivity) VALUES
  ('workforce.summary.read', 'Ver resumen de dotacion', 'Consulta indicadores agregados de dotacion.', 'tenant', 'standard'),
  ('workforce.structure.read', 'Ver estructura', 'Consulta estructura organizativa gobernada.', 'tenant', 'standard'),
  ('workforce.employee.read', 'Ver legajos', 'Consulta datos laborales nominales autorizados.', 'tenant', 'restricted'),
  ('payroll.read', 'Ver liquidacion', 'Consulta informacion salarial autorizada.', 'tenant', 'restricted'),
  ('absence.analytics.read', 'Ver analitica de ausencias', 'Consulta indicadores agregados de ausentismo.', 'tenant', 'standard'),
  ('absence.nominal.read', 'Ver ausencias nominales', 'Consulta novedades de ausencia por persona.', 'tenant', 'restricted'),
  ('leave.policy.read', 'Ver normativa de licencias', 'Consulta reglas y fuentes normativas gobernadas.', 'tenant', 'standard'),
  ('leave.preview.read', 'Previsualizar licencias', 'Calcula escenarios sin registrar ni aprobar.', 'tenant', 'privileged'),
  ('management.analytics.read', 'Ver analitica ejecutiva', 'Consulta indicadores ejecutivos agregados.', 'tenant', 'standard'),
  ('quality.read', 'Ver calidad de datos', 'Consulta controles de calidad y conciliacion.', 'tenant', 'standard'),
  ('lineage.read', 'Ver trazabilidad', 'Consulta fuente, corte y linaje de cada dato.', 'tenant', 'standard'),
  ('budget.approved.read', 'Ver presupuesto aprobado', 'Consulta exclusivamente fuentes presupuestarias aprobadas.', 'tenant', 'restricted'),
  ('assistant.use', 'Usar asistente interno', 'Habilita consultas gobernadas dentro del alcance efectivo.', 'tenant', 'privileged'),
  ('actions.read', 'Ver centro de acciones', 'Consulta expedientes y acciones autorizadas.', 'tenant', 'standard')
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind, sensitivity = EXCLUDED.sensitivity;

INSERT INTO iam_role_capability (role_key, capability_key) VALUES
  ('TENANT_ADMIN', 'workforce.summary.read'),
  ('TENANT_ADMIN', 'workforce.structure.read'),
  ('TENANT_ADMIN', 'absence.analytics.read'),
  ('TENANT_ADMIN', 'leave.policy.read'),
  ('TENANT_ADMIN', 'leave.preview.read'),
  ('TENANT_ADMIN', 'management.analytics.read'),
  ('TENANT_ADMIN', 'quality.read'),
  ('TENANT_ADMIN', 'lineage.read'),
  ('TENANT_ADMIN', 'budget.approved.read'),
  ('TENANT_ADMIN', 'assistant.use'),
  ('TENANT_ADMIN', 'actions.read'),
  ('JUNIN_TESORERIA_CARGA', 'workforce.summary.read'),
  ('JUNIN_TESORERIA_CARGA', 'payroll.read'),
  ('JUNIN_TESORERIA_CARGA', 'management.analytics.read'),
  ('JUNIN_TESORERIA_CARGA', 'budget.approved.read'),
  ('JUNIN_TESORERIA_CARGA', 'quality.read'),
  ('JUNIN_TESORERIA_CARGA', 'lineage.read'),
  ('JUNIN_TESORERIA_CARGA', 'assistant.use'),
  ('JUNIN_TESORERIA_CARGA', 'actions.read'),
  ('JUNIN_RRHH_OPERADOR', 'workforce.summary.read'),
  ('JUNIN_RRHH_OPERADOR', 'workforce.structure.read'),
  ('JUNIN_RRHH_OPERADOR', 'workforce.employee.read'),
  ('JUNIN_RRHH_OPERADOR', 'absence.analytics.read'),
  ('JUNIN_RRHH_OPERADOR', 'absence.nominal.read'),
  ('JUNIN_RRHH_OPERADOR', 'leave.policy.read'),
  ('JUNIN_RRHH_OPERADOR', 'leave.preview.read'),
  ('JUNIN_RRHH_OPERADOR', 'quality.read'),
  ('JUNIN_RRHH_OPERADOR', 'lineage.read'),
  ('JUNIN_RRHH_OPERADOR', 'assistant.use'),
  ('JUNIN_RRHH_OPERADOR', 'actions.read'),
  ('JUNIN_RRHH_APROBADOR', 'workforce.summary.read'),
  ('JUNIN_RRHH_APROBADOR', 'workforce.structure.read'),
  ('JUNIN_RRHH_APROBADOR', 'workforce.employee.read'),
  ('JUNIN_RRHH_APROBADOR', 'absence.analytics.read'),
  ('JUNIN_RRHH_APROBADOR', 'absence.nominal.read'),
  ('JUNIN_RRHH_APROBADOR', 'leave.policy.read'),
  ('JUNIN_RRHH_APROBADOR', 'leave.preview.read'),
  ('JUNIN_RRHH_APROBADOR', 'quality.read'),
  ('JUNIN_RRHH_APROBADOR', 'lineage.read'),
  ('JUNIN_RRHH_APROBADOR', 'assistant.use'),
  ('JUNIN_RRHH_APROBADOR', 'actions.read')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION tenant_identity_access_payload(p_user_email text, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  normalized_email text := lower(btrim(p_user_email));
  user_row internal_users%ROWTYPE;
  tenant_row platform_tenant%ROWTYPE;
  membership_row tenant_membership%ROWTYPE;
  binding_row tenant_identity_legacy_binding%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  platform_roles jsonb := '[]'::jsonb;
  platform_capabilities jsonb := '[]'::jsonb;
  tenant_capabilities jsonb := '[]'::jsonb;
  source_bindings jsonb := '[]'::jsonb;
  data_plane_ready boolean := false;
  access_source text;
BEGIN
  SELECT * INTO user_row FROM internal_users
  WHERE lower(email) = normalized_email AND active IS TRUE LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(item.role_key ORDER BY item.role_key), '[]'::jsonb)
  INTO platform_roles
  FROM (
    SELECT assignment.role_key
    FROM platform_user_role assignment
    WHERE lower(assignment.user_email) = normalized_email AND assignment.active IS TRUE
  ) item;

  SELECT COALESCE(jsonb_agg(item.capability_key ORDER BY item.capability_key), '[]'::jsonb)
  INTO platform_capabilities
  FROM (
    SELECT DISTINCT role_capability.capability_key
    FROM platform_user_role assignment
    JOIN iam_role_capability role_capability ON role_capability.role_key = assignment.role_key
    JOIN iam_capability capability ON capability.capability_key = role_capability.capability_key
      AND capability.scope_kind = 'platform'
    WHERE lower(assignment.user_email) = normalized_email AND assignment.active IS TRUE
  ) item;

  IF p_tenant_id IS NOT NULL THEN
    SELECT * INTO tenant_row FROM platform_tenant
      WHERE id = p_tenant_id AND status = 'active';
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO policy_row FROM tenant_identity_policy WHERE tenant_id = tenant_row.id;
    SELECT COALESCE(jsonb_agg(item ORDER BY item.system, item.database), '[]'::jsonb)
    INTO source_bindings
    FROM (
      SELECT binding.source_system AS system, binding.source_database AS database,
        binding.source_company_id AS "companyId", binding.verified
      FROM platform_tenant_source_binding binding
      WHERE binding.tenant_id = tenant_row.id AND binding.verified IS TRUE
        AND binding.id = policy_row.certified_source_binding_id
    ) item;
    data_plane_ready := COALESCE(policy_row.tenant_data_plane_ready, false) AND EXISTS (
      SELECT 1 FROM platform_tenant_source_binding binding
      WHERE binding.tenant_id = tenant_row.id
        AND binding.id = policy_row.certified_source_binding_id
        AND binding.source_system = 'GRH' AND binding.verified IS TRUE
    );

    SELECT * INTO membership_row FROM tenant_membership
      WHERE tenant_id = p_tenant_id AND lower(user_email) = normalized_email AND status = 'active';
    IF FOUND THEN
      access_source := 'membership';
      SELECT COALESCE(jsonb_agg(item.capability_key ORDER BY item.capability_key), '[]'::jsonb)
      INTO tenant_capabilities
      FROM (SELECT capability_key FROM tenant_iam_effective_capabilities(membership_row.id)) item;
    ELSE
      SELECT * INTO binding_row FROM tenant_identity_legacy_binding
        WHERE tenant_id = p_tenant_id AND lower(user_email) = normalized_email AND active IS TRUE;
      IF FOUND AND NOT EXISTS (
        SELECT 1 FROM tenant_membership any_membership
        WHERE any_membership.tenant_id = p_tenant_id
          AND lower(any_membership.user_email) = normalized_email
      ) THEN
        access_source := 'legacy_explicit';
        SELECT COALESCE(jsonb_agg(item.capability_key ORDER BY item.capability_key), '[]'::jsonb)
        INTO tenant_capabilities
        FROM (
          SELECT capability_key FROM tenant_identity_legacy_binding_capability
          WHERE binding_id = binding_row.id
        ) item;
      ELSE
        RETURN NULL;
      END IF;
    END IF;
  ELSE
    access_source := 'platform';
  END IF;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'email', user_row.email, 'name', user_row.display_name,
      'identityVersion', user_row.identity_version, 'authMode', user_row.auth_mode
    ),
    'platform', jsonb_build_object('roles', platform_roles, 'capabilities', platform_capabilities),
    'tenant', CASE WHEN p_tenant_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', tenant_row.id, 'slug', tenant_row.slug,
      'membershipId', membership_row.id, 'legacyBindingId', binding_row.id,
      'roleKey', CASE WHEN access_source = 'membership' THEN membership_row.role_key ELSE binding_row.legacy_role END,
      'source', access_source, 'effectiveCapabilities', tenant_capabilities,
      'dataPlaneReady', data_plane_ready, 'certifiedReleaseSha', policy_row.certified_release_sha,
      'sourceBindings', source_bindings
    ) END
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_resolve_access(
  p_user_email text,
  p_session_id uuid,
  p_session_version integer,
  p_identity_version integer,
  p_required_capabilities text[] DEFAULT ARRAY[]::text[],
  p_capability_mode text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  session_row tenant_identity_session%ROWTYPE;
  context jsonb;
  available text[] := ARRAY[]::text[];
  authorized boolean := false;
  mfa_required boolean := false;
BEGIN
  IF p_capability_mode NOT IN ('all', 'any')
     OR COALESCE(array_length(p_required_capabilities, 1), 0) > 50 THEN
    RAISE EXCEPTION 'IDENTITY_ACCESS_REQUEST_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT session.* INTO session_row
  FROM tenant_identity_session session
  JOIN internal_users users ON lower(users.email) = lower(session.user_email)
  WHERE session.id = p_session_id
    AND lower(session.user_email) = lower(btrim(p_user_email))
    AND session.session_version = p_session_version
    AND session.identity_version = p_identity_version
    AND session.status = 'active'
    AND session.expires_at > now()
    AND session.last_seen_at > now() - interval '1 hour'
    AND users.active IS TRUE
    AND users.identity_version = p_identity_version
  FOR UPDATE OF session;
  IF NOT FOUND THEN RETURN NULL; END IF;

  context := tenant_identity_access_payload(session_row.user_email, session_row.active_tenant_id);
  IF context IS NULL OR COALESCE(context#>>'{tenant,source}', 'platform') <> session_row.source THEN
    UPDATE tenant_identity_session SET status = 'revoked', revoked_at = now(),
      revoked_by_user_email = session_row.user_email, version = version + 1
    WHERE id = session_row.id AND status = 'active';
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT capability), ARRAY[]::text[]) INTO available
  FROM (
    SELECT jsonb_array_elements_text(context#>'{platform,capabilities}') capability
    UNION ALL
    SELECT jsonb_array_elements_text(COALESCE(context#>'{tenant,effectiveCapabilities}', '[]'::jsonb)) capability
  ) values_union;

  IF COALESCE(array_length(p_required_capabilities, 1), 0) = 0 THEN
    authorized := true;
  ELSIF p_capability_mode = 'all' THEN
    authorized := p_required_capabilities <@ available;
  ELSE
    authorized := p_required_capabilities && available;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM iam_capability capability
    WHERE capability.capability_key = ANY(p_required_capabilities)
      AND capability.sensitivity IN ('privileged', 'restricted')
  ) INTO mfa_required;
  IF mfa_required AND session_row.auth_level NOT IN ('mfa', 'recovery') THEN
    authorized := false;
  END IF;
  IF session_row.active_tenant_id IS NOT NULL
     AND COALESCE((context#>>'{tenant,dataPlaneReady}')::boolean, false) IS FALSE THEN
    authorized := false;
  END IF;

  IF session_row.last_seen_at < now() - interval '5 minutes' THEN
    UPDATE tenant_identity_session SET last_seen_at = now() WHERE id = session_row.id;
  END IF;

  RETURN context || jsonb_build_object(
    'authorized', authorized,
    'session', jsonb_build_object(
      'id', session_row.id, 'version', session_row.session_version,
      'authLevel', session_row.auth_level,
      'mfa', session_row.auth_level IN ('mfa', 'recovery'),
      'expiresAt', session_row.expires_at
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_take_rate_limit(
  p_scope text,
  p_bucket_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  limiter tenant_identity_rate_limit%ROWTYPE;
  retry_after integer := 0;
BEGIN
  IF p_scope !~ '^[a-z][a-z0-9_.-]{2,47}$' OR p_bucket_hash !~ '^[a-f0-9]{64}$'
     OR p_limit NOT BETWEEN 1 AND 100 OR p_window_seconds NOT BETWEEN 10 AND 86400
     OR p_block_seconds NOT BETWEEN 10 AND 86400 THEN
    RAISE EXCEPTION 'IDENTITY_RATE_LIMIT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_scope || ':' || p_bucket_hash));
  SELECT * INTO limiter FROM tenant_identity_rate_limit
    WHERE scope = p_scope AND bucket_hash = p_bucket_hash FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO tenant_identity_rate_limit (scope, bucket_hash, window_started_at, attempt_count)
    VALUES (p_scope, p_bucket_hash, now(), 1) RETURNING * INTO limiter;
  ELSIF limiter.blocked_until IS NOT NULL AND limiter.blocked_until > now() THEN
    retry_after := GREATEST(1, ceil(extract(epoch FROM (limiter.blocked_until - now())))::integer);
    RETURN jsonb_build_object('allowed', false, 'retryAfterSeconds', retry_after);
  ELSIF limiter.window_started_at <= now() - make_interval(secs => p_window_seconds) THEN
    UPDATE tenant_identity_rate_limit SET window_started_at = now(), attempt_count = 1, blocked_until = NULL
      WHERE scope = p_scope AND bucket_hash = p_bucket_hash RETURNING * INTO limiter;
  ELSE
    UPDATE tenant_identity_rate_limit SET attempt_count = attempt_count + 1,
      blocked_until = CASE WHEN attempt_count + 1 > p_limit
        THEN now() + make_interval(secs => p_block_seconds) ELSE NULL END
      WHERE scope = p_scope AND bucket_hash = p_bucket_hash RETURNING * INTO limiter;
  END IF;
  IF limiter.blocked_until IS NOT NULL THEN
    retry_after := GREATEST(1, ceil(extract(epoch FROM (limiter.blocked_until - now())))::integer);
    RETURN jsonb_build_object('allowed', false, 'retryAfterSeconds', retry_after);
  END IF;
  RETURN jsonb_build_object('allowed', true, 'remaining', GREATEST(0, p_limit - limiter.attempt_count));
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_record_attempt(
  p_flow_hash text,
  p_success boolean,
  p_totp_step bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  challenge tenant_identity_auth_challenge%ROWTYPE;
  factor tenant_identity_mfa_factor%ROWTYPE;
BEGIN
  SELECT * INTO challenge FROM tenant_identity_auth_challenge
    WHERE flow_hash = p_flow_hash FOR UPDATE;
  IF NOT FOUND OR challenge.status <> 'pending' OR challenge.expires_at <= now() THEN
    RAISE EXCEPTION 'IDENTITY_FLOW_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_success IS FALSE THEN
    UPDATE tenant_identity_auth_challenge SET attempts = attempts + 1,
      status = CASE WHEN attempts + 1 >= max_attempts THEN 'locked' ELSE status END,
      locked_at = CASE WHEN attempts + 1 >= max_attempts THEN now() ELSE locked_at END,
      version = version + 1
    WHERE id = challenge.id RETURNING * INTO challenge;
    RETURN jsonb_build_object('accepted', false, 'locked', challenge.status = 'locked',
      'remainingAttempts', GREATEST(0, challenge.max_attempts - challenge.attempts),
      'version', challenge.version);
  END IF;
  IF p_totp_step IS NULL OR p_totp_step < 0 THEN
    RAISE EXCEPTION 'IDENTITY_MFA_STEP_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF challenge.purpose = 'login_mfa' THEN
    SELECT * INTO factor FROM tenant_identity_mfa_factor
      WHERE lower(user_email) = lower(challenge.user_email) AND status = 'active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001'; END IF;
    IF factor.last_accepted_step IS NOT NULL AND p_totp_step <= factor.last_accepted_step THEN
      RAISE EXCEPTION 'IDENTITY_MFA_REPLAY' USING ERRCODE = 'P0001';
    END IF;
    UPDATE tenant_identity_mfa_factor SET last_accepted_step = p_totp_step,
      version = version + 1 WHERE id = factor.id;
  END IF;
  UPDATE tenant_identity_auth_challenge SET verified_totp_step = p_totp_step,
    version = version + 1 WHERE id = challenge.id RETURNING * INTO challenge;
  RETURN jsonb_build_object('accepted', true, 'version', challenge.version, 'totpStep', p_totp_step);
END
$$;

-- Upgrade seguro desde cualquier borrador 005 anterior: las firmas sin release SHA
-- no pueden sobrevivir como overloads ejecutables del runtime.
DROP FUNCTION IF EXISTS tenant_identity_lookup(text, text, text);
DROP FUNCTION IF EXISTS tenant_identity_command_replay(text, uuid);

CREATE OR REPLACE FUNCTION tenant_identity_lookup(
  p_operation text,
  p_identifier text DEFAULT '',
  p_secret_hash text DEFAULT '',
  p_release_sha text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  invitation_row tenant_invitation%ROWTYPE;
  secret_row tenant_identity_invitation_secret%ROWTYPE;
  membership_row tenant_membership%ROWTYPE;
  tenant_row platform_tenant%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  challenge tenant_identity_auth_challenge%ROWTYPE;
  user_row internal_users%ROWTYPE;
  factor tenant_identity_mfa_factor%ROWTYPE;
  password_value text;
  requires_mfa boolean := false;
  context jsonb;
  contexts jsonb := '[]'::jsonb;
BEGIN
  IF p_operation = 'invitation' THEN
    SELECT secret.* INTO secret_row FROM tenant_identity_invitation_secret secret
      WHERE secret.code_hash = p_secret_hash AND secret.status = 'active'
        AND secret.expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO invitation_row FROM tenant_invitation
      WHERE id = secret_row.invitation_id AND status = 'issued';
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO membership_row FROM tenant_membership
      WHERE id = invitation_row.membership_id AND status = 'invited';
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO tenant_row FROM platform_tenant
      WHERE id = membership_row.tenant_id AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT policy.* INTO policy_row FROM tenant_identity_policy policy
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = policy.tenant_id
     AND binding.source_system = 'GRH' AND binding.verified IS TRUE
    WHERE policy.tenant_id = tenant_row.id AND policy.tenant_data_plane_ready IS TRUE
    FOR SHARE OF policy;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_DATA_PLANE_NOT_READY' USING ERRCODE = 'P0001'; END IF;
    IF p_release_sha !~ '^[a-f0-9]{40}$'
       OR policy_row.certified_release_sha IS DISTINCT FROM lower(p_release_sha) THEN
      RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(membership_row.id) effective
      JOIN iam_capability capability ON capability.capability_key = effective.capability_key
      WHERE capability.sensitivity IN ('privileged', 'restricted')
    ) OR membership_row.role_key = 'TENANT_ADMIN' INTO requires_mfa;
    RETURN jsonb_build_object(
      'invitationId', invitation_row.id, 'invitationVersion', invitation_row.version,
      'membershipId', membership_row.id, 'membershipVersion', membership_row.version,
      'email', membership_row.user_email, 'tenant', jsonb_build_object(
        'id', tenant_row.id, 'slug', tenant_row.slug, 'name', tenant_row.short_name
      ),
      'roleKey', membership_row.role_key, 'requiresMfa', requires_mfa
    );
  ELSIF p_operation = 'invitation_delivery' THEN
    IF p_identifier !~* '^[0-9a-f]{8}-[0-9a-f-]{27}$' THEN
      RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT delivery_invitation.* INTO invitation_row FROM tenant_invitation delivery_invitation
      WHERE delivery_invitation.id = p_identifier::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO membership_row FROM tenant_membership WHERE id = invitation_row.membership_id;
    SELECT * INTO tenant_row FROM platform_tenant WHERE id = membership_row.tenant_id;
    SELECT policy.* INTO policy_row FROM tenant_identity_policy policy
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = policy.tenant_id
     AND binding.source_system = 'GRH' AND binding.verified IS TRUE
    WHERE policy.tenant_id = tenant_row.id AND policy.tenant_data_plane_ready IS TRUE
    FOR SHARE OF policy;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_DATA_PLANE_NOT_READY' USING ERRCODE = 'P0001'; END IF;
    IF p_release_sha !~ '^[a-f0-9]{40}$'
       OR policy_row.certified_release_sha IS DISTINCT FROM lower(p_release_sha) THEN
      RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO secret_row FROM tenant_identity_invitation_secret
      WHERE invitation_id = invitation_row.id;
    RETURN jsonb_build_object(
      'invitationId', invitation_row.id, 'version', invitation_row.version,
      'email', membership_row.user_email, 'membershipStatus', membership_row.status,
      'deliveryStatus', CASE
        WHEN secret_row.status = 'active' AND invitation_row.status = 'issued' THEN 'delivered'
        WHEN secret_row.status = 'pending' THEN 'pending'
        WHEN secret_row.status = 'revoked' THEN 'failed'
        ELSE 'not_issued'
      END,
      'deliveryExpiresAt', secret_row.expires_at,
      'deliveryAttemptId', secret_row.delivery_attempt_id,
      'tenant', jsonb_build_object('id', tenant_row.id, 'name', tenant_row.short_name)
    );
  ELSIF p_operation = 'login' THEN
    SELECT * INTO user_row FROM internal_users
      WHERE lower(email) = lower(btrim(p_identifier)) AND active IS TRUE LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF user_row.auth_mode = 'managed' THEN
      SELECT credential.password_hash INTO password_value
      FROM tenant_identity_password_credential credential
      WHERE lower(credential.user_email) = lower(user_row.email);
    ELSE
      password_value := user_row.password_hash;
    END IF;
    IF password_value IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO factor FROM tenant_identity_mfa_factor
      WHERE lower(user_email) = lower(user_row.email) AND status = 'active';
    context := tenant_identity_access_payload(user_row.email, NULL);
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'kind', candidate.kind, 'label', candidate.label,
      'tenantId', candidate.tenant_id, 'tenantSlug', candidate.tenant_slug,
      'tenantName', candidate.tenant_name, 'source', candidate.source
    ) ORDER BY candidate.sort_order, candidate.tenant_name), '[]'::jsonb)
    INTO contexts
    FROM (
      SELECT 'platform'::text kind, 'Administracion de plataforma'::text label,
        NULL::uuid tenant_id, NULL::text tenant_slug, NULL::text tenant_name,
        'platform'::text source, 0 sort_order
      WHERE EXISTS (
        SELECT 1 FROM platform_user_role assignment
        WHERE lower(assignment.user_email) = lower(user_row.email) AND assignment.active IS TRUE
      )
      UNION ALL
      SELECT 'tenant', tenant.short_name, tenant.id, tenant.slug, tenant.short_name,
        'membership', 1
      FROM tenant_membership membership
      JOIN platform_tenant tenant ON tenant.id = membership.tenant_id AND tenant.status = 'active'
      JOIN tenant_identity_policy policy ON policy.tenant_id = tenant.id
        AND policy.tenant_data_plane_ready IS TRUE
      JOIN platform_tenant_source_binding source_binding
        ON source_binding.id = policy.certified_source_binding_id
       AND source_binding.tenant_id = tenant.id
       AND source_binding.source_system = 'GRH' AND source_binding.verified IS TRUE
      WHERE lower(membership.user_email) = lower(user_row.email) AND membership.status = 'active'
      UNION ALL
      SELECT 'tenant', tenant.short_name, tenant.id, tenant.slug, tenant.short_name,
        'legacy_explicit', 1
      FROM tenant_identity_legacy_binding legacy
      JOIN platform_tenant tenant ON tenant.id = legacy.tenant_id AND tenant.status = 'active'
      JOIN tenant_identity_policy policy ON policy.tenant_id = tenant.id
        AND policy.tenant_data_plane_ready IS TRUE
      JOIN platform_tenant_source_binding source_binding
        ON source_binding.id = policy.certified_source_binding_id
       AND source_binding.tenant_id = tenant.id
       AND source_binding.source_system = 'GRH' AND source_binding.verified IS TRUE
      WHERE lower(legacy.user_email) = lower(user_row.email) AND legacy.active IS TRUE
        AND NOT EXISTS (
          SELECT 1 FROM tenant_membership membership
          WHERE membership.tenant_id = tenant.id AND lower(membership.user_email) = lower(user_row.email)
        )
    ) candidate;
    SELECT EXISTS (
      SELECT 1 FROM platform_user_role assignment
      JOIN iam_role_capability role_capability ON role_capability.role_key = assignment.role_key
      JOIN iam_capability capability ON capability.capability_key = role_capability.capability_key
      WHERE lower(assignment.user_email) = lower(user_row.email)
        AND assignment.active IS TRUE AND capability.sensitivity IN ('privileged', 'restricted')
    ) OR EXISTS (
      SELECT 1 FROM tenant_membership membership
      JOIN tenant_iam_effective_capabilities(membership.id) effective ON true
      JOIN iam_capability capability ON capability.capability_key = effective.capability_key
      WHERE lower(membership.user_email) = lower(user_row.email) AND membership.status = 'active'
        AND capability.sensitivity IN ('privileged', 'restricted')
    ) INTO requires_mfa;
    RETURN jsonb_build_object(
      'email', user_row.email, 'name', user_row.display_name, 'authMode', user_row.auth_mode,
      'identityVersion', user_row.identity_version, 'passwordHash', password_value,
      'requiresMfa', requires_mfa, 'mfaEnrolled', factor.id IS NOT NULL,
      'mfaSecretCiphertext', factor.secret_ciphertext, 'mfaLastAcceptedStep', factor.last_accepted_step,
      'contexts', contexts
    );
  ELSIF p_operation = 'flow' THEN
    SELECT * INTO challenge FROM tenant_identity_auth_challenge
      WHERE flow_hash = p_secret_hash AND status IN ('pending', 'consumed') AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_FLOW_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO factor FROM tenant_identity_mfa_factor
      WHERE lower(user_email) = lower(challenge.user_email) AND status = 'active';
    IF challenge.purpose = 'activation' THEN
      SELECT policy.* INTO policy_row FROM tenant_identity_policy policy
      JOIN platform_tenant_source_binding binding
        ON binding.id = policy.certified_source_binding_id
       AND binding.tenant_id = policy.tenant_id
       AND binding.source_system = 'GRH' AND binding.verified IS TRUE
      WHERE policy.tenant_id = challenge.requested_tenant_id
        AND policy.tenant_data_plane_ready IS TRUE
      FOR SHARE OF policy;
      IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_DATA_PLANE_NOT_READY' USING ERRCODE = 'P0001'; END IF;
      IF p_release_sha !~ '^[a-f0-9]{40}$'
         OR policy_row.certified_release_sha IS DISTINCT FROM lower(p_release_sha) THEN
        RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN jsonb_build_object(
      'challengeId', challenge.id, 'purpose', challenge.purpose,
      'status', challenge.status,
      'email', challenge.user_email, 'invitationId', challenge.invitation_id,
      'requestedTenantId', challenge.requested_tenant_id,
      'selectionIdempotencyKey', challenge.selection_idempotency_key,
      'completionIdempotencyKey', challenge.completion_idempotency_key,
      'mfaSecretCiphertext', CASE WHEN challenge.status = 'pending'
        THEN COALESCE(challenge.mfa_secret_ciphertext, factor.secret_ciphertext) ELSE NULL END,
      'mfaLastAcceptedStep', factor.last_accepted_step,
      'attempts', challenge.attempts, 'maxAttempts', challenge.max_attempts,
      'expiresAt', challenge.expires_at, 'version', challenge.version,
      'verifiedTotpStep', challenge.verified_totp_step,
      'completedSession', CASE WHEN challenge.completed_session_id IS NULL THEN NULL ELSE (
        SELECT jsonb_build_object(
          'id', session.id, 'email', session.user_email, 'version', session.session_version,
          'identityVersion', session.identity_version, 'authLevel', session.auth_level,
          'expiresAt', session.expires_at, 'tenantId', session.active_tenant_id, 'source', session.source
        ) FROM tenant_identity_session session
        WHERE session.id = challenge.completed_session_id AND session.status = 'active'
          AND session.expires_at > now()
      ) END
    );
  ELSE
    RAISE EXCEPTION 'IDENTITY_LOOKUP_INVALID' USING ERRCODE = 'P0001';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_command_replay(
  p_actor_email text,
  p_idempotency_key uuid,
  p_release_sha text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  replay tenant_iam_event%ROWTYPE;
  policy tenant_identity_policy%ROWTYPE;
BEGIN
  SELECT * INTO replay FROM tenant_iam_event event
    WHERE lower(event.actor_user_email) = lower(btrim(p_actor_email))
      AND event.idempotency_key = p_idempotency_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT policy_row.* INTO policy FROM tenant_identity_policy policy_row
  JOIN platform_tenant_source_binding binding_row
    ON binding_row.id = policy_row.certified_source_binding_id
   AND binding_row.tenant_id = policy_row.tenant_id
   AND binding_row.source_system = 'GRH' AND binding_row.verified IS TRUE
  WHERE policy_row.tenant_id = replay.tenant_id
    AND policy_row.tenant_data_plane_ready IS TRUE FOR SHARE OF policy_row;
  IF NOT FOUND OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR policy.certified_release_sha IS DISTINCT FROM lower(p_release_sha) THEN
    RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'command', replay.command,
    'result', replay.result || jsonb_build_object('replayed', true)
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_view(
  p_actor_email text,
  p_current_session_id uuid,
  p_resource text DEFAULT 'bootstrap',
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor internal_users%ROWTYPE;
  factor tenant_identity_mfa_factor%ROWTYPE;
  sessions jsonb := '[]'::jsonb;
  recovery_remaining integer := 0;
  requires_mfa boolean := false;
BEGIN
  SELECT * INTO actor FROM internal_users
    WHERE lower(email) = lower(btrim(p_actor_email)) AND active IS TRUE LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;
  IF p_current_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM tenant_identity_session session
    WHERE session.id = p_current_session_id AND lower(session.user_email) = lower(actor.email)
      AND session.status = 'active' AND session.expires_at > now()
  ) THEN
    RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_resource NOT IN ('bootstrap', 'sessions', 'invitations') THEN
    RAISE EXCEPTION 'IDENTITY_RESOURCE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO factor FROM tenant_identity_mfa_factor
    WHERE lower(user_email) = lower(actor.email) AND status = 'active';
  IF FOUND THEN
    SELECT count(*)::integer INTO recovery_remaining
    FROM tenant_identity_recovery_code recovery
    WHERE recovery.factor_id = factor.id AND recovery.consumed_at IS NULL;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM platform_user_role assignment
    JOIN iam_role_capability role_capability ON role_capability.role_key = assignment.role_key
    JOIN iam_capability capability ON capability.capability_key = role_capability.capability_key
    WHERE lower(assignment.user_email) = lower(actor.email) AND assignment.active IS TRUE
      AND capability.sensitivity IN ('privileged', 'restricted')
  ) INTO requires_mfa;
  IF p_resource = 'invitations' THEN
    IF NOT tenant_iam_is_platform_owner(actor.email) THEN
      RAISE EXCEPTION 'IDENTITY_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'allowedCommands', CASE WHEN EXISTS (
        SELECT 1 FROM tenant_identity_policy policy
        WHERE policy.tenant_data_plane_ready IS TRUE AND policy.invitation_delivery_ready IS TRUE
      ) THEN jsonb_build_array('issue_invitation') ELSE '[]'::jsonb END,
      'invitations', COALESCE((
        SELECT jsonb_agg(item ORDER BY invitation_items."preparedAt" DESC)
        FROM (
          SELECT jsonb_build_object(
            'id', invitation.id, 'status', invitation.status, 'version', invitation.version,
            'membershipId', membership.id, 'tenantId', membership.tenant_id,
            'email', membership.user_email, 'preparedAt', invitation.prepared_at,
            'delivery', jsonb_build_object(
              'status', CASE
                WHEN secret.status = 'active' THEN 'delivered'
                WHEN invitation.status = 'prepared' THEN 'not_issued'
                ELSE 'failed'
              END,
              'issuedAt', secret.issued_at, 'expiresAt', secret.expires_at
            ),
            'activation', jsonb_build_object('acceptedAt', secret.consumed_at)
          ) item, invitation.prepared_at AS "preparedAt"
          FROM tenant_invitation invitation
          JOIN tenant_membership membership ON membership.id = invitation.membership_id
          LEFT JOIN tenant_identity_invitation_secret secret ON secret.invitation_id = invitation.id
        ) invitation_items
      ), '[]'::jsonb)
    );
  END IF;
  SELECT COALESCE(jsonb_agg(item ORDER BY listed."createdAt" DESC), '[]'::jsonb) INTO sessions
  FROM (
    SELECT jsonb_build_object(
      'id', session.id, 'version', session.version, 'current', session.id = p_current_session_id,
      'device', session.device_label, 'ipApprox', session.ip_approx,
      'createdAt', session.created_at, 'lastSeenAt', session.last_seen_at,
      'expiresAt', session.expires_at, 'status', session.status
    ) item, session.created_at AS "createdAt"
    FROM tenant_identity_session session
    WHERE lower(session.user_email) = lower(actor.email)
      AND session.status = 'active' AND session.expires_at > now()
    ORDER BY session.created_at DESC LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  ) listed;
  RETURN jsonb_build_object(
    'security', jsonb_build_object(
      'sessionRegistryReady', true, 'mfaRequired', requires_mfa,
      'mfaEnrolled', factor.id IS NOT NULL, 'recoveryCodesRemaining', recovery_remaining
    ),
    'sessions', sessions
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_create_session(
  p_user_email text,
  p_session_id uuid,
  p_expires_at timestamptz,
  p_auth_level text,
  p_device text,
  p_ip_approx text,
  p_tenant_hint uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  normalized_email text := lower(btrim(p_user_email));
  user_row internal_users%ROWTYPE;
  tenant_id_value uuid := p_tenant_hint;
  source_value text;
  context jsonb;
  session_row tenant_identity_session%ROWTYPE;
  privileged boolean := false;
BEGIN
  SELECT * INTO user_row FROM internal_users
    WHERE lower(email) = normalized_email AND active IS TRUE FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;
  IF p_expires_at <= now() + interval '5 minutes' OR p_expires_at > now() + interval '12 hours'
     OR p_auth_level NOT IN ('password', 'mfa', 'recovery') THEN
    RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF tenant_id_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM tenant_membership membership
    WHERE membership.tenant_id = tenant_id_value AND lower(membership.user_email) = normalized_email
      AND membership.status = 'active'
  ) THEN
    source_value := 'membership';
  ELSIF tenant_id_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM tenant_identity_legacy_binding binding
    WHERE binding.tenant_id = tenant_id_value AND lower(binding.user_email) = normalized_email
      AND binding.active IS TRUE
      AND NOT EXISTS (
        SELECT 1 FROM tenant_membership any_membership
        WHERE any_membership.tenant_id = binding.tenant_id
          AND lower(any_membership.user_email) = lower(binding.user_email)
      )
  ) THEN
    source_value := 'legacy_explicit';
  ELSIF tenant_id_value IS NULL AND EXISTS (
    SELECT 1 FROM platform_user_role assignment
    WHERE lower(assignment.user_email) = normalized_email AND assignment.active IS TRUE
  ) THEN
    source_value := 'platform';
  ELSE
    RAISE EXCEPTION 'IDENTITY_MEMBERSHIP_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  context := tenant_identity_access_payload(user_row.email, tenant_id_value);
  IF context IS NULL OR (tenant_id_value IS NOT NULL
      AND COALESCE((context#>>'{tenant,dataPlaneReady}')::boolean, false) IS FALSE) THEN
    RAISE EXCEPTION 'IDENTITY_DATA_PLANE_NOT_READY' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM iam_capability capability
    WHERE capability.capability_key IN (
      SELECT jsonb_array_elements_text(context#>'{platform,capabilities}')
      UNION
      SELECT jsonb_array_elements_text(COALESCE(context#>'{tenant,effectiveCapabilities}', '[]'::jsonb))
    ) AND capability.sensitivity IN ('privileged', 'restricted')
  ) INTO privileged;
  IF privileged AND p_auth_level NOT IN ('mfa', 'recovery') THEN
    RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO tenant_identity_session (
    id, user_email, active_tenant_id, source, auth_level,
    identity_version, device_label, ip_approx, expires_at
  ) VALUES (
    p_session_id, user_row.email, tenant_id_value, source_value, p_auth_level,
    user_row.identity_version, left(COALESCE(NULLIF(btrim(p_device), ''), 'Navegador'), 120),
    NULLIF(left(COALESCE(p_ip_approx, ''), 64), ''), p_expires_at
  ) RETURNING * INTO session_row;
  RETURN jsonb_build_object(
    'id', session_row.id, 'email', session_row.user_email,
    'version', session_row.session_version, 'identityVersion', session_row.identity_version,
    'authLevel', session_row.auth_level, 'expiresAt', session_row.expires_at,
    'tenantId', session_row.active_tenant_id, 'source', session_row.source
  );
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
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor_email text := lower(btrim(p_actor_email));
  replay tenant_iam_event%ROWTYPE;
  result jsonb := '{}'::jsonb;
  tenant_id_value uuid;
  membership tenant_membership%ROWTYPE;
  invitation tenant_invitation%ROWTYPE;
  invitation_secret tenant_identity_invitation_secret%ROWTYPE;
  challenge tenant_identity_auth_challenge%ROWTYPE;
  user_row internal_users%ROWTYPE;
  factor tenant_identity_mfa_factor%ROWTYPE;
  session_row tenant_identity_session%ROWTYPE;
  policy tenant_identity_policy%ROWTYPE;
  binding tenant_identity_legacy_binding%ROWTYPE;
  source_binding platform_tenant_source_binding%ROWTYPE;
  capability_value text;
  requires_mfa boolean := false;
  factor_enrolled boolean := false;
  privileged_context boolean := false;
  access_context jsonb;
  auth_level_value text;
  event_target_type text := 'identity';
  event_target_id text := actor_email;
BEGIN
  IF p_command_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO replay FROM tenant_iam_event
    WHERE lower(actor_user_email) = actor_email AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF replay.command IN ('issue_invitation', 'confirm_delivery', 'begin_activation', 'complete_activation') THEN
      SELECT policy_row.* INTO policy FROM tenant_identity_policy policy_row
      JOIN platform_tenant_source_binding binding_row
        ON binding_row.id = policy_row.certified_source_binding_id
       AND binding_row.tenant_id = policy_row.tenant_id
       AND binding_row.source_system = 'GRH' AND binding_row.verified IS TRUE
      WHERE policy_row.tenant_id = replay.tenant_id
        AND policy_row.tenant_data_plane_ready IS TRUE FOR SHARE OF policy_row;
      IF NOT FOUND OR (p_payload->>'releaseSha') !~ '^[a-f0-9]{40}$'
         OR policy.certified_release_sha IS DISTINCT FROM lower(p_payload->>'releaseSha') THEN
        RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF replay.command_hash <> p_command_hash THEN
      RAISE EXCEPTION 'IDENTITY_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN replay.result || jsonb_build_object('replayed', true);
  END IF;

  IF p_command IN ('issue_invitation', 'confirm_delivery', 'delivery_failed') THEN
    IF NOT tenant_iam_is_platform_owner(actor_email) THEN
      RAISE EXCEPTION 'IDENTITY_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
    END IF;
    SELECT invitation_row.* INTO invitation
    FROM tenant_invitation invitation_row
    JOIN tenant_membership membership_row ON membership_row.id = invitation_row.membership_id
    WHERE invitation_row.id = (p_payload->>'invitationId')::uuid FOR UPDATE OF invitation_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO membership FROM tenant_membership WHERE id = invitation.membership_id FOR UPDATE;
    tenant_id_value := membership.tenant_id;
    IF invitation.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'issue_invitation' THEN
      SELECT policy_row.* INTO policy FROM tenant_identity_policy policy_row
      JOIN platform_tenant_source_binding binding_row
        ON binding_row.id = policy_row.certified_source_binding_id
       AND binding_row.tenant_id = policy_row.tenant_id
       AND binding_row.source_system = 'GRH' AND binding_row.verified IS TRUE
      WHERE policy_row.tenant_id = tenant_id_value FOR UPDATE OF policy_row;
      IF NOT FOUND OR policy.tenant_data_plane_ready IS FALSE THEN
        RAISE EXCEPTION 'IDENTITY_DATA_PLANE_NOT_READY' USING ERRCODE = 'P0001';
      END IF;
      IF (p_payload->>'releaseSha') !~ '^[a-f0-9]{40}$'
         OR policy.certified_release_sha IS DISTINCT FROM lower(p_payload->>'releaseSha') THEN
        RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
      END IF;
      IF policy.invitation_delivery_ready IS FALSE THEN
        RAISE EXCEPTION 'IDENTITY_DELIVERY_NOT_READY' USING ERRCODE = 'P0001';
      END IF;
      IF membership.status <> 'invited' OR invitation.status NOT IN ('prepared', 'issued') THEN
        RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001';
      END IF;
      IF (p_payload->>'codeHash') !~ '^[a-f0-9]{64}$'
         OR (p_payload->>'deliveryAttemptId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR (p_payload->>'expiresAt')::timestamptz <= now() + interval '10 minutes'
         OR (p_payload->>'expiresAt')::timestamptz > now() + interval '7 days' THEN
        RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO tenant_identity_invitation_secret (
        invitation_id, delivery_attempt_id, code_hash, status, issued_by_user_email, expires_at
      ) VALUES (
        invitation.id, (p_payload->>'deliveryAttemptId')::uuid, p_payload->>'codeHash', 'pending',
        actor_email, (p_payload->>'expiresAt')::timestamptz
      ) ON CONFLICT (invitation_id) DO UPDATE SET
        delivery_attempt_id = EXCLUDED.delivery_attempt_id, code_hash = EXCLUDED.code_hash,
        status = 'pending', issued_by_user_email = EXCLUDED.issued_by_user_email,
        issued_at = now(), expires_at = EXCLUDED.expires_at, consumed_at = NULL, revoked_at = NULL,
        version = tenant_identity_invitation_secret.version + 1
      RETURNING * INTO invitation_secret;
      UPDATE tenant_invitation SET status = 'prepared', gateway_issued_at = NULL, cancelled_at = NULL,
        version = version + 1
        WHERE id = invitation.id RETURNING * INTO invitation;
      result := jsonb_build_object(
        'invitation', jsonb_build_object(
          'id', invitation.id, 'status', invitation.status, 'version', invitation.version,
          'delivery', jsonb_build_object('status', 'pending', 'issuedAt', invitation_secret.issued_at,
            'expiresAt', invitation_secret.expires_at)
        ), 'deliveryAttemptId', invitation_secret.delivery_attempt_id, 'replayed', false
      );
    ELSIF p_command = 'confirm_delivery' THEN
      SELECT policy_row.* INTO policy FROM tenant_identity_policy policy_row
      JOIN platform_tenant_source_binding binding_row
        ON binding_row.id = policy_row.certified_source_binding_id
       AND binding_row.tenant_id = policy_row.tenant_id
       AND binding_row.source_system = 'GRH' AND binding_row.verified IS TRUE
      WHERE policy_row.tenant_id = tenant_id_value FOR UPDATE OF policy_row;
      IF NOT FOUND OR policy.tenant_data_plane_ready IS FALSE
         OR policy.invitation_delivery_ready IS FALSE THEN
        RAISE EXCEPTION 'IDENTITY_DELIVERY_NOT_READY' USING ERRCODE = 'P0001';
      END IF;
      IF (p_payload->>'releaseSha') !~ '^[a-f0-9]{40}$'
         OR policy.certified_release_sha IS DISTINCT FROM lower(p_payload->>'releaseSha') THEN
        RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
      END IF;
      IF COALESCE(p_payload->>'deliveryAttemptId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'IDENTITY_DELIVERY_ATTEMPT_STALE' USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO invitation_secret FROM tenant_identity_invitation_secret
        WHERE invitation_id = invitation.id AND status = 'pending' AND expires_at > now()
          AND delivery_attempt_id = (p_payload->>'deliveryAttemptId')::uuid FOR UPDATE;
      IF NOT FOUND OR membership.status <> 'invited' OR invitation.status <> 'prepared' THEN
        RAISE EXCEPTION 'IDENTITY_DELIVERY_ATTEMPT_STALE' USING ERRCODE = 'P0001';
      END IF;
      UPDATE tenant_identity_invitation_secret SET status = 'active', version = version + 1
        WHERE invitation_id = invitation.id
          AND delivery_attempt_id = (p_payload->>'deliveryAttemptId')::uuid
        RETURNING * INTO invitation_secret;
      UPDATE tenant_invitation SET status = 'issued', gateway_issued_at = now(), cancelled_at = NULL,
        version = version + 1 WHERE id = invitation.id RETURNING * INTO invitation;
      result := jsonb_build_object(
        'invitation', jsonb_build_object(
          'id', invitation.id, 'status', invitation.status, 'version', invitation.version,
          'delivery', jsonb_build_object('status', 'delivered', 'issuedAt', invitation_secret.issued_at,
            'expiresAt', invitation_secret.expires_at)
        ), 'replayed', false
      );
    ELSE
      IF COALESCE(p_payload->>'deliveryAttemptId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'IDENTITY_DELIVERY_ATTEMPT_STALE' USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO invitation_secret FROM tenant_identity_invitation_secret
        WHERE invitation_id = invitation.id AND status = 'pending'
          AND delivery_attempt_id = (p_payload->>'deliveryAttemptId')::uuid FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'IDENTITY_DELIVERY_ATTEMPT_STALE' USING ERRCODE = 'P0001';
      END IF;
      UPDATE tenant_identity_invitation_secret SET status = 'revoked', revoked_at = now(),
        version = version + 1 WHERE invitation_id = invitation.id AND status = 'pending'
          AND delivery_attempt_id = (p_payload->>'deliveryAttemptId')::uuid;
      UPDATE tenant_invitation SET status = 'prepared', gateway_issued_at = NULL,
        version = version + 1 WHERE id = invitation.id RETURNING * INTO invitation;
      result := jsonb_build_object(
        'invitation', jsonb_build_object('id', invitation.id, 'status', invitation.status,
          'version', invitation.version, 'delivery', jsonb_build_object('status', 'failed')),
        'replayed', false
      );
    END IF;
    event_target_type := 'invitation'; event_target_id := invitation.id::text;

  ELSIF p_command = 'begin_activation' THEN
    SELECT * INTO invitation FROM tenant_invitation
      WHERE id = (p_payload->>'invitationId')::uuid AND status = 'issued' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO membership FROM tenant_membership
      WHERE id = invitation.membership_id AND status = 'invited' FOR UPDATE;
    IF NOT FOUND OR lower(membership.user_email) <> actor_email THEN
      RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    tenant_id_value := membership.tenant_id;
    IF invitation.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    SELECT policy_row.* INTO policy FROM tenant_identity_policy policy_row
    JOIN platform_tenant_source_binding binding_row
      ON binding_row.id = policy_row.certified_source_binding_id
     AND binding_row.tenant_id = policy_row.tenant_id
     AND binding_row.source_system = 'GRH' AND binding_row.verified IS TRUE
    WHERE policy_row.tenant_id = tenant_id_value
      AND policy_row.tenant_data_plane_ready IS TRUE FOR SHARE OF policy_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_DATA_PLANE_NOT_READY' USING ERRCODE = 'P0001'; END IF;
    IF (p_payload->>'releaseSha') !~ '^[a-f0-9]{40}$'
       OR policy.certified_release_sha IS DISTINCT FROM lower(p_payload->>'releaseSha') THEN
      RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO invitation_secret FROM tenant_identity_invitation_secret
      WHERE invitation_id = invitation.id AND status = 'active' AND expires_at > now()
        AND code_hash = p_payload->>'codeHash' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(membership.id) effective
      JOIN iam_capability capability ON capability.capability_key = effective.capability_key
      WHERE capability.sensitivity IN ('privileged', 'restricted')
    ) OR membership.role_key = 'TENANT_ADMIN' INTO requires_mfa;
    IF requires_mfa <> (p_payload->>'mfaSecretCiphertext' IS NOT NULL) THEN
      RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO tenant_identity_auth_challenge (
      flow_hash, purpose, user_email, invitation_id, invitation_secret_version, requested_tenant_id,
      mfa_secret_ciphertext, expires_at
    ) VALUES (
      p_payload->>'flowHash', 'activation', membership.user_email, invitation.id,
      invitation_secret.version, membership.tenant_id, p_payload->>'mfaSecretCiphertext',
      (p_payload->>'expiresAt')::timestamptz
    ) RETURNING * INTO challenge;
    result := jsonb_build_object('challengeId', challenge.id, 'version', challenge.version,
      'expiresAt', challenge.expires_at, 'requiresMfa', requires_mfa, 'replayed', false);
    event_target_type := 'activation'; event_target_id := challenge.id::text;

  ELSIF p_command = 'complete_activation' THEN
    SELECT * INTO challenge FROM tenant_identity_auth_challenge
      WHERE flow_hash = p_payload->>'flowHash' AND purpose = 'activation' FOR UPDATE;
    IF NOT FOUND OR challenge.status <> 'pending' OR challenge.expires_at <= now()
       OR lower(challenge.user_email) <> actor_email THEN
      RAISE EXCEPTION 'IDENTITY_FLOW_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF challenge.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO invitation FROM tenant_invitation
      WHERE id = challenge.invitation_id AND status = 'issued' FOR UPDATE;
    SELECT * INTO membership FROM tenant_membership
      WHERE id = invitation.membership_id AND status = 'invited' FOR UPDATE;
    SELECT policy_row.* INTO policy FROM tenant_identity_policy policy_row
    JOIN platform_tenant_source_binding binding_row
      ON binding_row.id = policy_row.certified_source_binding_id
     AND binding_row.tenant_id = policy_row.tenant_id
     AND binding_row.source_system = 'GRH' AND binding_row.verified IS TRUE
    WHERE policy_row.tenant_id = membership.tenant_id
      AND policy_row.tenant_data_plane_ready IS TRUE FOR UPDATE OF policy_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_DATA_PLANE_NOT_READY' USING ERRCODE = 'P0001'; END IF;
    IF (p_payload->>'releaseSha') !~ '^[a-f0-9]{40}$'
       OR policy.certified_release_sha IS DISTINCT FROM lower(p_payload->>'releaseSha') THEN
      RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO invitation_secret FROM tenant_identity_invitation_secret
      WHERE invitation_id = invitation.id AND status = 'active' AND expires_at > now()
        AND version = challenge.invitation_secret_version FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_CODE_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO user_row FROM internal_users
      WHERE lower(email) = actor_email AND active IS FALSE FOR UPDATE;
    IF NOT FOUND OR user_row.password_hash IS NOT NULL THEN
      RAISE EXCEPTION 'IDENTITY_FLOW_INVALID' USING ERRCODE = 'P0001';
    END IF;
    requires_mfa := challenge.mfa_secret_ciphertext IS NOT NULL;
    IF requires_mfa THEN
      IF p_payload->>'totpStep' IS NULL THEN
        RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      UPDATE tenant_identity_auth_challenge SET verified_totp_step = (p_payload->>'totpStep')::bigint
        WHERE id = challenge.id RETURNING * INTO challenge;
    END IF;
    IF (p_payload->>'passwordHash') NOT LIKE 'scrypt$%' THEN
      RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO tenant_identity_password_credential (user_email, password_hash)
      VALUES (user_row.email, p_payload->>'passwordHash');
    UPDATE internal_users SET auth_mode = 'managed', active = true, identity_version = identity_version + 1,
      updated_at = now() WHERE email = user_row.email RETURNING * INTO user_row;
    UPDATE tenant_membership SET status = 'active', activated_at = now(), updated_at = now(),
      version = version + 1 WHERE id = membership.id RETURNING * INTO membership;
    UPDATE tenant_invitation SET status = 'accepted', version = version + 1
      WHERE id = invitation.id RETURNING * INTO invitation;
    UPDATE tenant_identity_invitation_secret SET status = 'consumed', consumed_at = now(),
      version = version + 1 WHERE invitation_id = invitation.id;
    IF requires_mfa THEN
      INSERT INTO tenant_identity_mfa_factor (
        user_email, secret_ciphertext, last_accepted_step
      ) VALUES (
        user_row.email, challenge.mfa_secret_ciphertext, challenge.verified_totp_step
      ) RETURNING * INTO factor;
      FOR capability_value IN SELECT jsonb_array_elements_text(p_payload->'recoveryCodeHashes') LOOP
        INSERT INTO tenant_identity_recovery_code (factor_id, code_hash) VALUES (factor.id, capability_value);
      END LOOP;
      auth_level_value := 'mfa';
    ELSE
      auth_level_value := 'password';
    END IF;
    UPDATE tenant_identity_auth_challenge SET status = 'consumed', consumed_at = now(),
      version = version + 1 WHERE id = challenge.id;
    result := jsonb_build_object(
      'session', tenant_identity_create_session(
        user_row.email, (p_payload->>'sessionId')::uuid,
        (p_payload->>'sessionExpiresAt')::timestamptz, auth_level_value,
        p_payload->>'device', p_payload->>'ipApprox', membership.tenant_id
      ),
      'membership', jsonb_build_object('id', membership.id, 'tenantId', membership.tenant_id,
        'roleKey', membership.role_key, 'status', membership.status, 'version', membership.version),
      'invitation', jsonb_build_object('id', invitation.id, 'status', invitation.status,
        'version', invitation.version), 'replayed', false
    );
    UPDATE tenant_identity_auth_challenge SET completed_session_id = (p_payload->>'sessionId')::uuid,
      completion_idempotency_key = p_idempotency_key WHERE id = challenge.id;
    tenant_id_value := membership.tenant_id;
    event_target_type := 'membership'; event_target_id := membership.id::text;

  ELSIF p_command = 'begin_login_context' THEN
    SELECT * INTO user_row FROM internal_users
      WHERE lower(email) = actor_email AND active IS TRUE FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO tenant_identity_auth_challenge (
      flow_hash, purpose, user_email, expires_at
    ) VALUES (
      p_payload->>'flowHash', 'login_context', user_row.email,
      (p_payload->>'expiresAt')::timestamptz
    ) RETURNING * INTO challenge;
    result := jsonb_build_object('challengeId', challenge.id, 'version', challenge.version,
      'expiresAt', challenge.expires_at, 'replayed', false);
    event_target_type := 'login_context'; event_target_id := challenge.id::text;

  ELSIF p_command = 'select_login_context' THEN
    SELECT * INTO challenge FROM tenant_identity_auth_challenge
      WHERE flow_hash = p_payload->>'flowHash' AND purpose = 'login_context' FOR UPDATE;
    IF NOT FOUND OR challenge.status <> 'pending' OR challenge.expires_at <= now()
       OR lower(challenge.user_email) <> actor_email THEN
      RAISE EXCEPTION 'IDENTITY_FLOW_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF challenge.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    tenant_id_value := NULLIF(p_payload->>'activeTenantId', '')::uuid;
    IF (tenant_id_value IS NULL AND NOT EXISTS (
      SELECT 1 FROM platform_user_role assignment
      WHERE lower(assignment.user_email) = actor_email AND assignment.active IS TRUE
    )) THEN
      RAISE EXCEPTION 'IDENTITY_CONTEXT_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    access_context := tenant_identity_access_payload(challenge.user_email, tenant_id_value);
    IF access_context IS NULL OR (tenant_id_value IS NOT NULL
       AND COALESCE((access_context#>>'{tenant,dataPlaneReady}')::boolean, false) IS FALSE) THEN
      RAISE EXCEPTION 'IDENTITY_CONTEXT_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM tenant_identity_mfa_factor mfa
      WHERE lower(mfa.user_email) = actor_email AND mfa.status = 'active'
    ) INTO factor_enrolled;
    SELECT EXISTS (
      SELECT 1 FROM iam_capability capability
      WHERE capability.capability_key IN (
        SELECT jsonb_array_elements_text(access_context#>'{platform,capabilities}')
        UNION
        SELECT jsonb_array_elements_text(COALESCE(access_context#>'{tenant,effectiveCapabilities}', '[]'::jsonb))
      ) AND capability.sensitivity IN ('privileged', 'restricted')
    ) INTO privileged_context;
    IF factor_enrolled THEN
      UPDATE tenant_identity_auth_challenge SET purpose = 'login_mfa',
        requested_tenant_id = tenant_id_value, selection_idempotency_key = p_idempotency_key,
        version = version + 1
      WHERE id = challenge.id RETURNING * INTO challenge;
      result := jsonb_build_object('mfaRequired', true, 'challengeId', challenge.id,
        'version', challenge.version, 'expiresAt', challenge.expires_at, 'replayed', false);
      event_target_type := 'login_mfa'; event_target_id := challenge.id::text;
    ELSIF privileged_context THEN
      IF p_payload->>'mfaSecretCiphertext' IS NULL THEN
        RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      UPDATE tenant_identity_auth_challenge SET purpose = 'login_enrollment',
        requested_tenant_id = tenant_id_value,
        mfa_secret_ciphertext = p_payload->>'mfaSecretCiphertext',
        reauthenticated_at = now(), selection_idempotency_key = p_idempotency_key,
        version = version + 1
      WHERE id = challenge.id RETURNING * INTO challenge;
      result := jsonb_build_object('mfaEnrollmentRequired', true, 'challengeId', challenge.id,
        'version', challenge.version, 'expiresAt', challenge.expires_at, 'replayed', false);
      event_target_type := 'login_enrollment'; event_target_id := challenge.id::text;
    ELSE
      result := jsonb_build_object('session', tenant_identity_create_session(
        challenge.user_email, (p_payload->>'sessionId')::uuid,
        (p_payload->>'sessionExpiresAt')::timestamptz, 'password',
        p_payload->>'device', p_payload->>'ipApprox', tenant_id_value
      ), 'mfaRequired', false, 'replayed', false);
      UPDATE tenant_identity_auth_challenge SET status = 'consumed', consumed_at = now(),
        requested_tenant_id = tenant_id_value, selection_idempotency_key = p_idempotency_key,
        completed_session_id = (p_payload->>'sessionId')::uuid,
        completion_idempotency_key = p_idempotency_key,
        version = version + 1 WHERE id = challenge.id;
      event_target_type := 'session'; event_target_id := p_payload->>'sessionId';
    END IF;

  ELSIF p_command IN ('login_session', 'begin_login_mfa') THEN
    SELECT * INTO user_row FROM internal_users
      WHERE lower(email) = actor_email AND active IS TRUE FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT EXISTS (
      SELECT 1 FROM tenant_identity_mfa_factor mfa
      WHERE lower(mfa.user_email) = actor_email AND mfa.status = 'active'
    ) INTO requires_mfa;
    IF p_command = 'begin_login_mfa' THEN
      IF requires_mfa IS FALSE THEN RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001'; END IF;
      INSERT INTO tenant_identity_auth_challenge (
        flow_hash, purpose, user_email, requested_tenant_id, expires_at
      ) VALUES (
        p_payload->>'flowHash', 'login_mfa', user_row.email,
        NULLIF(p_payload->>'activeTenantId', '')::uuid, (p_payload->>'expiresAt')::timestamptz
      ) RETURNING * INTO challenge;
      result := jsonb_build_object('challengeId', challenge.id, 'version', challenge.version,
        'expiresAt', challenge.expires_at, 'replayed', false);
      event_target_type := 'login_mfa'; event_target_id := challenge.id::text;
    ELSE
      IF requires_mfa THEN RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001'; END IF;
      result := jsonb_build_object('session', tenant_identity_create_session(
        user_row.email, (p_payload->>'sessionId')::uuid,
        (p_payload->>'sessionExpiresAt')::timestamptz, 'password',
        p_payload->>'device', p_payload->>'ipApprox', NULLIF(p_payload->>'activeTenantId', '')::uuid
      ), 'replayed', false);
      event_target_type := 'session'; event_target_id := p_payload->>'sessionId';
    END IF;

  ELSIF p_command = 'complete_login_mfa' THEN
    SELECT * INTO challenge FROM tenant_identity_auth_challenge
      WHERE flow_hash = p_payload->>'flowHash' AND purpose = 'login_mfa' FOR UPDATE;
    IF NOT FOUND OR challenge.status <> 'pending' OR challenge.expires_at <= now()
       OR lower(challenge.user_email) <> actor_email THEN
      RAISE EXCEPTION 'IDENTITY_FLOW_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF challenge.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO factor FROM tenant_identity_mfa_factor
      WHERE lower(user_email) = actor_email AND status = 'active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001'; END IF;
    IF p_payload->>'recoveryCodeHash' IS NOT NULL THEN
      UPDATE tenant_identity_recovery_code SET consumed_at = now()
        WHERE factor_id = factor.id AND code_hash = p_payload->>'recoveryCodeHash'
          AND consumed_at IS NULL;
      IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001'; END IF;
      auth_level_value := 'recovery';
    ELSE
      IF p_payload->>'totpStep' IS NULL THEN
        RAISE EXCEPTION 'IDENTITY_MFA_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      IF factor.last_accepted_step IS NOT NULL
         AND (p_payload->>'totpStep')::bigint <= factor.last_accepted_step THEN
        RAISE EXCEPTION 'IDENTITY_MFA_REPLAY' USING ERRCODE = 'P0001';
      END IF;
      UPDATE tenant_identity_mfa_factor SET last_accepted_step = (p_payload->>'totpStep')::bigint,
        version = version + 1 WHERE id = factor.id;
      UPDATE tenant_identity_auth_challenge SET verified_totp_step = (p_payload->>'totpStep')::bigint
        WHERE id = challenge.id;
      auth_level_value := 'mfa';
    END IF;
    UPDATE tenant_identity_auth_challenge SET status = 'consumed', consumed_at = now(),
      version = version + 1 WHERE id = challenge.id;
    result := jsonb_build_object('session', tenant_identity_create_session(
      challenge.user_email, (p_payload->>'sessionId')::uuid,
      (p_payload->>'sessionExpiresAt')::timestamptz, auth_level_value,
      p_payload->>'device', p_payload->>'ipApprox', challenge.requested_tenant_id
    ), 'replayed', false);
    UPDATE tenant_identity_auth_challenge SET completed_session_id = (p_payload->>'sessionId')::uuid,
      completion_idempotency_key = p_idempotency_key WHERE id = challenge.id;
    event_target_type := 'session'; event_target_id := p_payload->>'sessionId';

  ELSIF p_command = 'complete_login_enrollment' THEN
    SELECT * INTO challenge FROM tenant_identity_auth_challenge
      WHERE flow_hash = p_payload->>'flowHash' AND purpose = 'login_enrollment' FOR UPDATE;
    IF NOT FOUND OR challenge.status <> 'pending' OR challenge.expires_at <= now()
       OR challenge.reauthenticated_at < now() - interval '5 minutes'
       OR lower(challenge.user_email) <> actor_email THEN
      RAISE EXCEPTION 'IDENTITY_FLOW_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF challenge.version IS DISTINCT FROM p_expected_version OR p_payload->>'totpStep' IS NULL THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM tenant_identity_mfa_factor WHERE lower(user_email) = actor_email AND status = 'active') THEN
      RAISE EXCEPTION 'IDENTITY_MFA_ALREADY_ENROLLED' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO tenant_identity_mfa_factor (user_email, secret_ciphertext, last_accepted_step)
    VALUES (challenge.user_email, challenge.mfa_secret_ciphertext, (p_payload->>'totpStep')::bigint)
    RETURNING * INTO factor;
    FOR capability_value IN SELECT jsonb_array_elements_text(p_payload->'recoveryCodeHashes') LOOP
      INSERT INTO tenant_identity_recovery_code (factor_id, code_hash) VALUES (factor.id, capability_value);
    END LOOP;
    UPDATE internal_users SET identity_version = identity_version + 1, updated_at = now()
      WHERE lower(email) = actor_email RETURNING * INTO user_row;
    UPDATE tenant_identity_session SET status = 'revoked', revoked_at = now(),
      revoked_by_user_email = user_row.email, version = version + 1
      WHERE lower(user_email) = actor_email AND status = 'active';
    UPDATE tenant_identity_auth_challenge SET verified_totp_step = (p_payload->>'totpStep')::bigint,
      status = 'consumed', consumed_at = now(), version = version + 1 WHERE id = challenge.id;
    result := jsonb_build_object('session', tenant_identity_create_session(
      challenge.user_email, (p_payload->>'sessionId')::uuid,
      (p_payload->>'sessionExpiresAt')::timestamptz, 'mfa',
      p_payload->>'device', p_payload->>'ipApprox', challenge.requested_tenant_id
    ), 'mfaEnrolled', true, 'replayed', false);
    UPDATE tenant_identity_auth_challenge SET completed_session_id = (p_payload->>'sessionId')::uuid,
      completion_idempotency_key = p_idempotency_key WHERE id = challenge.id;
    tenant_id_value := challenge.requested_tenant_id;
    event_target_type := 'mfa_factor'; event_target_id := factor.id::text;

  ELSIF p_command IN ('begin_mfa_enrollment', 'complete_mfa_enrollment') THEN
    SELECT * INTO user_row FROM internal_users
      WHERE lower(email) = actor_email AND active IS TRUE FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;
    IF p_command = 'begin_mfa_enrollment' THEN
      IF EXISTS (SELECT 1 FROM tenant_identity_mfa_factor WHERE lower(user_email) = actor_email AND status = 'active') THEN
        RAISE EXCEPTION 'IDENTITY_MFA_ALREADY_ENROLLED' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO tenant_identity_auth_challenge (
        flow_hash, purpose, user_email, mfa_secret_ciphertext, reauthenticated_at, expires_at
      ) VALUES (
        p_payload->>'flowHash', 'mfa_enrollment', user_row.email,
        p_payload->>'mfaSecretCiphertext', now(), (p_payload->>'expiresAt')::timestamptz
      ) RETURNING * INTO challenge;
      result := jsonb_build_object('challengeId', challenge.id, 'version', challenge.version,
        'expiresAt', challenge.expires_at, 'replayed', false);
      event_target_type := 'mfa_enrollment'; event_target_id := challenge.id::text;
    ELSE
      SELECT * INTO challenge FROM tenant_identity_auth_challenge
        WHERE flow_hash = p_payload->>'flowHash' AND purpose = 'mfa_enrollment' FOR UPDATE;
      IF NOT FOUND OR challenge.status <> 'pending' OR challenge.expires_at <= now()
         OR challenge.reauthenticated_at < now() - interval '5 minutes'
         OR lower(challenge.user_email) <> actor_email THEN
        RAISE EXCEPTION 'IDENTITY_FLOW_INVALID' USING ERRCODE = 'P0001';
      END IF;
      IF challenge.version IS DISTINCT FROM p_expected_version OR p_payload->>'totpStep' IS NULL THEN
        RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
      END IF;
      UPDATE tenant_identity_auth_challenge SET verified_totp_step = (p_payload->>'totpStep')::bigint
        WHERE id = challenge.id RETURNING * INTO challenge;
      INSERT INTO tenant_identity_mfa_factor (user_email, secret_ciphertext, last_accepted_step)
      VALUES (user_row.email, challenge.mfa_secret_ciphertext, challenge.verified_totp_step)
      RETURNING * INTO factor;
      FOR capability_value IN SELECT jsonb_array_elements_text(p_payload->'recoveryCodeHashes') LOOP
        INSERT INTO tenant_identity_recovery_code (factor_id, code_hash) VALUES (factor.id, capability_value);
      END LOOP;
      UPDATE internal_users SET identity_version = identity_version + 1, updated_at = now()
        WHERE email = user_row.email RETURNING * INTO user_row;
      UPDATE tenant_identity_session SET status = 'revoked', revoked_at = now(),
        revoked_by_user_email = user_row.email, version = version + 1
        WHERE lower(user_email) = actor_email AND status = 'active';
      UPDATE tenant_identity_auth_challenge SET status = 'consumed', consumed_at = now(),
        version = version + 1 WHERE id = challenge.id;
      result := jsonb_build_object('session', tenant_identity_create_session(
        user_row.email, (p_payload->>'sessionId')::uuid,
        (p_payload->>'sessionExpiresAt')::timestamptz, 'mfa',
        p_payload->>'device', p_payload->>'ipApprox', NULLIF(p_payload->>'activeTenantId', '')::uuid
      ), 'mfaEnrolled', true, 'replayed', false);
      UPDATE tenant_identity_auth_challenge SET completed_session_id = (p_payload->>'sessionId')::uuid,
        completion_idempotency_key = p_idempotency_key WHERE id = challenge.id;
      event_target_type := 'mfa_factor'; event_target_id := factor.id::text;
    END IF;

  ELSIF p_command IN ('revoke_session', 'logout') THEN
    SELECT * INTO session_row FROM tenant_identity_session
      WHERE id = (p_payload->>'sessionId')::uuid AND lower(user_email) = actor_email FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;
    IF p_expected_version IS NOT NULL AND session_row.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF session_row.status = 'active' THEN
      UPDATE tenant_identity_session SET status = 'revoked', revoked_at = now(),
        revoked_by_user_email = actor_email, version = version + 1
      WHERE id = session_row.id RETURNING * INTO session_row;
    END IF;
    result := jsonb_build_object('sessionId', session_row.id, 'status', session_row.status,
      'version', session_row.version, 'replayed', false);
    tenant_id_value := session_row.active_tenant_id;
    event_target_type := 'session'; event_target_id := session_row.id::text;

  ELSIF p_command = 'switch_context' THEN
    SELECT * INTO session_row FROM tenant_identity_session
      WHERE id = (p_payload->>'currentSessionId')::uuid AND lower(user_email) = actor_email
        AND status = 'active' AND expires_at > now() AND last_seen_at > now() - interval '1 hour'
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;
    IF session_row.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    result := jsonb_build_object('session', tenant_identity_create_session(
      session_row.user_email, (p_payload->>'newSessionId')::uuid,
      (p_payload->>'sessionExpiresAt')::timestamptz, session_row.auth_level,
      p_payload->>'device', p_payload->>'ipApprox', NULLIF(p_payload->>'activeTenantId', '')::uuid
    ), 'replayed', false);
    UPDATE tenant_identity_session SET status = 'revoked', revoked_at = now(),
      revoked_by_user_email = actor_email, version = version + 1 WHERE id = session_row.id;
    event_target_type := 'session'; event_target_id := p_payload->>'newSessionId';

  ELSIF p_command = 'bind_legacy_access' THEN
    IF NOT tenant_iam_is_platform_owner(actor_email) THEN
      RAISE EXCEPTION 'IDENTITY_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO user_row FROM internal_users
      WHERE lower(email) = lower(p_payload->>'userEmail') AND active IS TRUE FOR UPDATE;
    IF NOT FOUND OR user_row.role <> p_payload->>'legacyRole' THEN
      RAISE EXCEPTION 'IDENTITY_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
    END IF;
    tenant_id_value := (p_payload->>'tenantId')::uuid;
    IF NOT EXISTS (SELECT 1 FROM platform_tenant WHERE id = tenant_id_value) THEN
      RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM tenant_membership existing_membership
      WHERE existing_membership.tenant_id = tenant_id_value
        AND lower(existing_membership.user_email) = lower(user_row.email)
    ) THEN RAISE EXCEPTION 'IDENTITY_MEMBERSHIP_SUPERSEDES_LEGACY' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO tenant_identity_legacy_binding (
      user_email, tenant_id, legacy_role, granted_by_user_email, reason
    ) VALUES (
      user_row.email, tenant_id_value, p_payload->>'legacyRole', actor_email, btrim(p_payload->>'reason')
    ) RETURNING * INTO binding;
    FOR capability_value IN SELECT jsonb_array_elements_text(p_payload->'capabilities') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM iam_capability capability
        WHERE capability.capability_key = capability_value AND capability.scope_kind = 'tenant'
      ) THEN RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001'; END IF;
      INSERT INTO tenant_identity_legacy_binding_capability (binding_id, capability_key)
        VALUES (binding.id, capability_value);
    END LOOP;
    result := jsonb_build_object('binding', jsonb_build_object(
      'id', binding.id, 'tenantId', binding.tenant_id, 'legacyRole', binding.legacy_role,
      'version', binding.version, 'capabilities', p_payload->'capabilities'
    ), 'replayed', false);
    event_target_type := 'legacy_binding'; event_target_id := binding.id::text;

  ELSIF p_command = 'bind_source' THEN
    IF NOT tenant_iam_is_platform_owner(actor_email) OR p_payload->>'sourceSystem' <> 'GRH' THEN
      RAISE EXCEPTION 'IDENTITY_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
    END IF;
    tenant_id_value := (p_payload->>'tenantId')::uuid;
    INSERT INTO platform_tenant_source_binding (
      tenant_id, source_system, source_database, source_company_id,
      verified, verified_by_user_email, verified_at
    ) VALUES (
      tenant_id_value, 'GRH', p_payload->>'sourceDatabase', (p_payload->>'sourceCompanyId')::bigint,
      true, actor_email, now()
    ) RETURNING * INTO source_binding;
    result := jsonb_build_object('sourceBinding', jsonb_build_object(
      'id', source_binding.id, 'tenantId', source_binding.tenant_id,
      'system', source_binding.source_system, 'database', source_binding.source_database,
      'companyId', source_binding.source_company_id, 'verified', source_binding.verified
    ), 'replayed', false);
    event_target_type := 'source_binding'; event_target_id := source_binding.id::text;

  ELSIF p_command = 'certify_data_plane' THEN
    IF NOT tenant_iam_is_platform_owner(actor_email) THEN
      RAISE EXCEPTION 'IDENTITY_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
    END IF;
    tenant_id_value := (p_payload->>'tenantId')::uuid;
    SELECT * INTO policy FROM tenant_identity_policy WHERE tenant_id = tenant_id_value FOR UPDATE;
    IF NOT FOUND OR policy.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO source_binding FROM platform_tenant_source_binding
      WHERE id = (p_payload->>'sourceBindingId')::uuid AND tenant_id = tenant_id_value
        AND source_system = 'GRH' AND verified IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001'; END IF;
    UPDATE platform_tenant SET status = 'active', version = version + 1, updated_at = now()
      WHERE id = tenant_id_value AND status IN ('onboarding', 'active');
    IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001'; END IF;
    UPDATE tenant_identity_policy SET tenant_data_plane_ready = true,
      certified_source_binding_id = source_binding.id,
      certified_release_sha = lower(p_payload->>'releaseSha'),
      certified_by_user_email = actor_email, certified_at = now(),
      version = version + 1, updated_at = now()
      WHERE tenant_id = tenant_id_value RETURNING * INTO policy;
    result := jsonb_build_object('policy', jsonb_build_object(
      'tenantId', policy.tenant_id, 'dataPlaneReady', policy.tenant_data_plane_ready,
      'deliveryReady', policy.invitation_delivery_ready, 'version', policy.version,
      'sourceBindingId', policy.certified_source_binding_id,
      'releaseSha', policy.certified_release_sha
    ), 'replayed', false);
    event_target_type := 'tenant_policy'; event_target_id := tenant_id_value::text;

  ELSIF p_command = 'set_delivery_ready' THEN
    IF NOT tenant_iam_is_platform_owner(actor_email) THEN
      RAISE EXCEPTION 'IDENTITY_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
    END IF;
    tenant_id_value := (p_payload->>'tenantId')::uuid;
    SELECT * INTO policy FROM tenant_identity_policy WHERE tenant_id = tenant_id_value FOR UPDATE;
    IF NOT FOUND OR policy.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'IDENTITY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF (p_payload->>'ready')::boolean IS TRUE AND (
      policy.tenant_data_plane_ready IS FALSE OR NOT EXISTS (
        SELECT 1 FROM platform_tenant_source_binding binding_row
        WHERE binding_row.id = policy.certified_source_binding_id
          AND binding_row.tenant_id = policy.tenant_id
          AND binding_row.source_system = 'GRH' AND binding_row.verified IS TRUE
      )
    ) THEN
      RAISE EXCEPTION 'IDENTITY_DATA_PLANE_NOT_READY' USING ERRCODE = 'P0001';
    END IF;
    UPDATE tenant_identity_policy SET invitation_delivery_ready = (p_payload->>'ready')::boolean,
      version = version + 1, updated_at = now() WHERE tenant_id = tenant_id_value RETURNING * INTO policy;
    result := jsonb_build_object('policy', jsonb_build_object(
      'tenantId', policy.tenant_id, 'dataPlaneReady', policy.tenant_data_plane_ready,
      'deliveryReady', policy.invitation_delivery_ready, 'version', policy.version
    ), 'replayed', false);
    event_target_type := 'tenant_policy'; event_target_id := tenant_id_value::text;
  ELSE
    RAISE EXCEPTION 'IDENTITY_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO tenant_iam_event (
    actor_user_email, tenant_id, membership_id, command, target_type, target_id,
    idempotency_key, command_hash, result
  ) VALUES (
    actor_email, tenant_id_value, membership.id, p_command, event_target_type, event_target_id,
    p_idempotency_key, p_command_hash, result
  );
  RETURN result;
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_legacy_session_policy(p_user_email text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM internal_users users
    WHERE lower(users.email) = lower(btrim(p_user_email)) AND users.active IS TRUE
  ) THEN jsonb_build_object(
    'legacySessionAllowed', NOT EXISTS (
      SELECT 1 FROM tenant_identity_policy policy WHERE policy.tenant_data_plane_ready IS TRUE
    ),
    'upgradeRequired', EXISTS (
      SELECT 1 FROM tenant_identity_policy policy WHERE policy.tenant_data_plane_ready IS TRUE
    ),
    'tenantDataPlaneReady', EXISTS (
      SELECT 1 FROM tenant_identity_policy policy WHERE policy.tenant_data_plane_ready IS TRUE
    )
  ) ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_validate_policy_binding()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.tenant_data_plane_ready IS TRUE AND NOT EXISTS (
    SELECT 1 FROM platform_tenant_source_binding binding
    WHERE binding.id = NEW.certified_source_binding_id
      AND binding.tenant_id = NEW.tenant_id
      AND binding.source_system = 'GRH'
      AND binding.verified IS TRUE
  ) THEN
    RAISE EXCEPTION 'IDENTITY_CERTIFIED_BINDING_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_identity_policy_binding_guard ON tenant_identity_policy;
CREATE TRIGGER tenant_identity_policy_binding_guard
BEFORE INSERT OR UPDATE ON tenant_identity_policy
FOR EACH ROW EXECUTE FUNCTION tenant_identity_validate_policy_binding();

CREATE OR REPLACE FUNCTION tenant_identity_revoke_sessions_on_access_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  affected_email text;
  affected_tenant uuid;
BEGIN
  IF TG_TABLE_NAME = 'tenant_membership' THEN
    affected_email := NEW.user_email; affected_tenant := NEW.tenant_id;
    IF OLD.status IS DISTINCT FROM NEW.status OR OLD.role_key IS DISTINCT FROM NEW.role_key
       OR OLD.version IS DISTINCT FROM NEW.version THEN
      UPDATE tenant_identity_session SET status = 'revoked', revoked_at = now(),
        revoked_by_user_email = NEW.user_email, version = version + 1
      WHERE lower(user_email) = lower(affected_email) AND active_tenant_id = affected_tenant
        AND status = 'active';
    END IF;
  ELSIF TG_TABLE_NAME = 'tenant_identity_legacy_binding' THEN
    affected_email := NEW.user_email; affected_tenant := NEW.tenant_id;
    IF OLD.active IS DISTINCT FROM NEW.active OR OLD.version IS DISTINCT FROM NEW.version THEN
      UPDATE tenant_identity_session SET status = 'revoked', revoked_at = now(),
        revoked_by_user_email = NEW.user_email, version = version + 1
      WHERE lower(user_email) = lower(affected_email) AND active_tenant_id = affected_tenant
        AND status = 'active';
    END IF;
  ELSIF TG_TABLE_NAME = 'internal_users' THEN
    IF OLD.active IS DISTINCT FROM NEW.active OR OLD.identity_version IS DISTINCT FROM NEW.identity_version THEN
      UPDATE tenant_identity_session SET status = 'revoked', revoked_at = now(),
        revoked_by_user_email = NEW.email, version = version + 1
      WHERE lower(user_email) = lower(NEW.email) AND status = 'active';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_disable_legacy_on_membership()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE tenant_identity_legacy_binding SET active = false, revoked_at = now(),
    version = version + 1
  WHERE tenant_id = NEW.tenant_id AND lower(user_email) = lower(NEW.user_email) AND active IS TRUE;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_identity_membership_session_revoke ON tenant_membership;
CREATE TRIGGER tenant_identity_membership_session_revoke
AFTER UPDATE ON tenant_membership
FOR EACH ROW EXECUTE FUNCTION tenant_identity_revoke_sessions_on_access_change();
DROP TRIGGER IF EXISTS tenant_identity_membership_disables_legacy ON tenant_membership;
CREATE TRIGGER tenant_identity_membership_disables_legacy
AFTER INSERT OR UPDATE OF status, role_key ON tenant_membership
FOR EACH ROW EXECUTE FUNCTION tenant_identity_disable_legacy_on_membership();
DROP TRIGGER IF EXISTS tenant_identity_legacy_session_revoke ON tenant_identity_legacy_binding;
CREATE TRIGGER tenant_identity_legacy_session_revoke
AFTER UPDATE ON tenant_identity_legacy_binding
FOR EACH ROW EXECUTE FUNCTION tenant_identity_revoke_sessions_on_access_change();
DROP TRIGGER IF EXISTS tenant_identity_user_session_revoke ON internal_users;
CREATE TRIGGER tenant_identity_user_session_revoke
AFTER UPDATE ON internal_users
FOR EACH ROW EXECUTE FUNCTION tenant_identity_revoke_sessions_on_access_change();

COMMENT ON TABLE tenant_identity_invitation_secret IS
  'Solo hash HMAC del codigo one-time; nunca codigo, URL ni credencial en reposo.';
COMMENT ON TABLE tenant_identity_auth_challenge IS
  'Flow tokens hash-only, expiracion, lockout durable y TOTP cifrado con AEAD en runtime.';
COMMENT ON TABLE tenant_identity_session IS
  'Registro server-side v2; SID rotado y revalidado con idle maximo de una hora.';

REVOKE ALL ON FUNCTION tenant_identity_access_payload(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_resolve_access(text, uuid, integer, integer, text[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_take_rate_limit(text, text, integer, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_record_attempt(text, boolean, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_lookup(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_command_replay(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_view(text, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_create_session(text, uuid, timestamptz, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_apply_command(text, text, uuid, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_legacy_session_policy(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_validate_policy_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_revoke_sessions_on_access_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_disable_legacy_on_membership() FROM PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE
  tenant_identity_policy, tenant_identity_password_credential,
  tenant_identity_invitation_secret, tenant_identity_auth_challenge,
  tenant_identity_mfa_factor, tenant_identity_recovery_code,
  tenant_identity_legacy_binding, tenant_identity_legacy_binding_capability,
  tenant_identity_session, tenant_identity_rate_limit
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_access_payload(text, uuid) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_create_session(text, uuid, timestamptz, text, text, text, uuid) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_validate_policy_binding() FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_revoke_sessions_on_access_change() FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_disable_legacy_on_membership() FROM municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_resolve_access(text, uuid, integer, integer, text[], text)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_take_rate_limit(text, text, integer, integer, integer)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_record_attempt(text, boolean, bigint)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_lookup(text, text, text, text)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_command_replay(text, uuid, text)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_view(text, uuid, text, integer)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_apply_command(text, text, uuid, text, integer, jsonb)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_legacy_session_policy(text)
  TO municontrol_actions_runtime_app;
