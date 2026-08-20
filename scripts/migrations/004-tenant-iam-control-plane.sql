-- MuniControl Friendly - Sprint 004
-- Control plane multi-tenant, IAM gobernado y CRM institucional mínimo.
-- Los invitados quedan inactivos, sin contraseña y sin token hasta que el
-- gateway tenant-aware sea desplegado y certificado.

ALTER TABLE internal_users ADD COLUMN IF NOT EXISTS tenant_iam_id uuid DEFAULT gen_random_uuid();
UPDATE internal_users SET tenant_iam_id = gen_random_uuid() WHERE tenant_iam_id IS NULL;
ALTER TABLE internal_users ALTER COLUMN tenant_iam_id SET NOT NULL;
ALTER TABLE internal_users ALTER COLUMN password_hash DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS internal_users_tenant_iam_id_uk
  ON internal_users (tenant_iam_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.internal_users'::regclass
      AND conname = 'internal_users_active_password_ck'
  ) THEN
    ALTER TABLE internal_users ADD CONSTRAINT internal_users_active_password_ck
      CHECK (active IS FALSE OR password_hash IS NOT NULL);
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS iam_capability (
  capability_key varchar(96) PRIMARY KEY,
  label varchar(160) NOT NULL,
  description text NOT NULL,
  scope_kind varchar(16) NOT NULL,
  sensitivity varchar(16) NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_capability_key_ck CHECK (capability_key ~ '^[a-z][a-z0-9_.]{2,95}$'),
  CONSTRAINT iam_capability_scope_ck CHECK (scope_kind IN ('platform', 'tenant')),
  CONSTRAINT iam_capability_sensitivity_ck
    CHECK (sensitivity IN ('standard', 'privileged', 'restricted'))
);

CREATE TABLE IF NOT EXISTS iam_capability_conflict (
  capability_key varchar(96) NOT NULL REFERENCES iam_capability(capability_key) ON DELETE RESTRICT,
  conflicts_with_key varchar(96) NOT NULL REFERENCES iam_capability(capability_key) ON DELETE RESTRICT,
  reason text NOT NULL,
  PRIMARY KEY (capability_key, conflicts_with_key),
  CONSTRAINT iam_capability_conflict_order_ck CHECK (capability_key < conflicts_with_key)
);

CREATE TABLE IF NOT EXISTS iam_role (
  role_key varchar(64) PRIMARY KEY,
  label varchar(160) NOT NULL,
  description text NOT NULL,
  scope_kind varchar(16) NOT NULL,
  system_managed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iam_role_key_ck CHECK (role_key ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  CONSTRAINT iam_role_scope_ck CHECK (scope_kind IN ('platform', 'tenant'))
);

CREATE TABLE IF NOT EXISTS iam_role_capability (
  role_key varchar(64) NOT NULL REFERENCES iam_role(role_key) ON DELETE RESTRICT,
  capability_key varchar(96) NOT NULL REFERENCES iam_capability(capability_key) ON DELETE RESTRICT,
  PRIMARY KEY (role_key, capability_key)
);

CREATE TABLE IF NOT EXISTS platform_tenant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL,
  legal_name varchar(255) NOT NULL,
  short_name varchar(120) NOT NULL,
  tenant_kind varchar(24) NOT NULL,
  jurisdiction varchar(160) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'onboarding',
  version integer NOT NULL DEFAULT 1,
  created_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_tenant_slug_ck CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT platform_tenant_kind_ck
    CHECK (tenant_kind IN ('municipality', 'province', 'national', 'agency', 'sandbox')),
  CONSTRAINT platform_tenant_status_ck
    CHECK (status IN ('onboarding', 'active', 'suspended', 'archived')),
  CONSTRAINT platform_tenant_version_ck CHECK (version > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_tenant_slug_lower_uk ON platform_tenant (lower(slug));

CREATE TABLE IF NOT EXISTS platform_tenant_source_binding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  source_system varchar(32) NOT NULL,
  source_database varchar(128) NOT NULL,
  source_company_id bigint NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  verified_by_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_tenant_source_binding_source_ck
    CHECK (source_system IN ('GRH', 'PERSONAS', 'MANUAL_GOVERNED')),
  CONSTRAINT platform_tenant_source_binding_verification_ck
    CHECK ((verified IS FALSE AND verified_at IS NULL)
      OR (verified IS TRUE AND verified_by_user_email IS NOT NULL AND verified_at IS NOT NULL)),
  CONSTRAINT platform_tenant_source_binding_source_uk
    UNIQUE (source_system, source_database, source_company_id)
);

CREATE TABLE IF NOT EXISTS platform_crm_account (
  tenant_id uuid PRIMARY KEY REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  implementation_stage varchar(24) NOT NULL DEFAULT 'onboarding',
  service_owner_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  next_action text,
  next_action_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_crm_account_stage_ck CHECK (implementation_stage IN (
    'discovery', 'contracting', 'onboarding', 'live', 'paused', 'closed'
  )),
  CONSTRAINT platform_crm_account_version_ck CHECK (version > 0),
  CONSTRAINT platform_crm_account_next_action_ck
    CHECK (next_action IS NULL OR length(btrim(next_action)) BETWEEN 1 AND 1000)
);

CREATE TABLE IF NOT EXISTS platform_user_role (
  user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  role_key varchar(64) NOT NULL REFERENCES iam_role(role_key) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  granted_by_user_email text REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (user_email, role_key),
  CONSTRAINT platform_user_role_state_ck
    CHECK ((active IS TRUE AND revoked_at IS NULL) OR (active IS FALSE AND revoked_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS tenant_membership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  role_key varchar(64) NOT NULL REFERENCES iam_role(role_key) ON DELETE RESTRICT,
  status varchar(16) NOT NULL DEFAULT 'invited',
  version integer NOT NULL DEFAULT 1,
  invited_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  invited_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  suspended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_membership_identity_uk UNIQUE (tenant_id, user_email),
  CONSTRAINT tenant_membership_status_ck CHECK (status IN ('invited', 'active', 'suspended')),
  CONSTRAINT tenant_membership_version_ck CHECK (version > 0),
  CONSTRAINT tenant_membership_lifecycle_ck CHECK (
    (status = 'invited' AND activated_at IS NULL AND suspended_at IS NULL)
    OR (status = 'active' AND activated_at IS NOT NULL AND suspended_at IS NULL)
    OR (status = 'suspended' AND suspended_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS tenant_membership_capability_override (
  membership_id uuid NOT NULL REFERENCES tenant_membership(id) ON DELETE RESTRICT,
  capability_key varchar(96) NOT NULL REFERENCES iam_capability(capability_key) ON DELETE RESTRICT,
  allow_override boolean NOT NULL DEFAULT false,
  deny_override boolean NOT NULL DEFAULT false,
  reason text NOT NULL,
  granted_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, capability_key),
  CONSTRAINT tenant_membership_capability_override_choice_ck CHECK (
    (allow_override IS TRUE AND deny_override IS FALSE)
    OR (allow_override IS FALSE AND deny_override IS TRUE)
  ),
  CONSTRAINT tenant_membership_capability_override_reason_ck
    CHECK (length(btrim(reason)) BETWEEN 3 AND 500)
);

CREATE TABLE IF NOT EXISTS tenant_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL UNIQUE REFERENCES tenant_membership(id) ON DELETE RESTRICT,
  status varchar(16) NOT NULL DEFAULT 'prepared',
  prepared_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  gateway_issued_at timestamptz,
  cancelled_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT tenant_invitation_status_ck CHECK (status IN ('prepared', 'issued', 'accepted', 'cancelled')),
  CONSTRAINT tenant_invitation_no_gateway_token_ck CHECK (
    (status = 'prepared' AND gateway_issued_at IS NULL AND cancelled_at IS NULL)
    OR (status IN ('issued', 'accepted') AND gateway_issued_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_at IS NOT NULL)
  ),
  CONSTRAINT tenant_invitation_version_ck CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS tenant_exclusive_capability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  capability_key varchar(96) NOT NULL REFERENCES iam_capability(capability_key) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES tenant_membership(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  assigned_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT tenant_exclusive_capability_state_ck CHECK (
    (active IS TRUE AND revoked_at IS NULL) OR (active IS FALSE AND revoked_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS tenant_exclusive_capability_active_uk
  ON tenant_exclusive_capability (tenant_id, capability_key) WHERE active IS TRUE;

CREATE TABLE IF NOT EXISTS tenant_iam_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  tenant_id uuid REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  membership_id uuid REFERENCES tenant_membership(id) ON DELETE RESTRICT,
  command varchar(64) NOT NULL,
  target_type varchar(64) NOT NULL,
  target_id text NOT NULL,
  outcome varchar(16) NOT NULL DEFAULT 'success',
  idempotency_key uuid NOT NULL,
  command_hash char(64) NOT NULL,
  result jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_iam_event_actor_idempotency_uk UNIQUE (actor_user_email, idempotency_key),
  CONSTRAINT tenant_iam_event_outcome_ck CHECK (outcome IN ('success')),
  CONSTRAINT tenant_iam_event_command_hash_ck CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT tenant_iam_event_result_ck CHECK (jsonb_typeof(result) = 'object')
);

CREATE OR REPLACE FUNCTION tenant_iam_reject_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'TENANT_IAM_AUDIT_IMMUTABLE' USING ERRCODE = 'P0001';
END
$$;

DROP TRIGGER IF EXISTS tenant_iam_event_append_only ON tenant_iam_event;
CREATE TRIGGER tenant_iam_event_append_only
BEFORE UPDATE OR DELETE ON tenant_iam_event
FOR EACH ROW EXECUTE FUNCTION tenant_iam_reject_change();

INSERT INTO iam_capability (capability_key, label, description, scope_kind, sensitivity) VALUES
  ('platform.tenants.read', 'Ver gobiernos', 'Consulta el catálogo real de tenants.', 'platform', 'standard'),
  ('platform.tenants.manage', 'Administrar gobiernos', 'Crea y gobierna tenants, sin acceso implícito a datos laborales.', 'platform', 'privileged'),
  ('platform.crm.read', 'Ver CRM', 'Consulta estado de implementación y seguimiento institucional.', 'platform', 'standard'),
  ('platform.crm.manage', 'Administrar CRM', 'Actualiza el seguimiento institucional.', 'platform', 'privileged'),
  ('platform.users.read', 'Ver accesos', 'Consulta membresías y permisos.', 'platform', 'standard'),
  ('platform.users.invite', 'Preparar invitaciones', 'Prepara cuentas inactivas sin contraseña ni token.', 'platform', 'privileged'),
  ('platform.users.manage', 'Administrar accesos', 'Modifica o suspende membresías.', 'platform', 'privileged'),
  ('platform.roles.read', 'Ver roles', 'Consulta roles, capacidades y conflictos.', 'platform', 'standard'),
  ('platform.roles.manage', 'Administrar roles', 'Asigna permisos gobernados.', 'platform', 'privileged'),
  ('platform.audit.read', 'Ver auditoría', 'Consulta eventos inmutables de administración.', 'platform', 'restricted'),
  ('time.overtime.enter', 'Cargar mayor esfuerzo', 'Registra horas adicionales para revisión posterior.', 'tenant', 'privileged'),
  ('time.overtime.approve', 'Aprobar mayor esfuerzo', 'Aprueba horas adicionales cargadas por otra persona.', 'tenant', 'privileged'),
  ('time.overtime.post', 'Impactar mayor esfuerzo', 'Autoriza el impacto posterior en una fuente homologada.', 'tenant', 'restricted'),
  ('absence.enter', 'Cargar ausencias', 'Registra una novedad de ausencia.', 'tenant', 'privileged'),
  ('absence.validate', 'Validar ausencias', 'Valida una ausencia cargada por otra persona.', 'tenant', 'privileged'),
  ('employee.record.propose', 'Proponer cambios de legajo', 'Propone cambios sin escribir directamente en GRH.', 'tenant', 'privileged'),
  ('employee.record.approve', 'Aprobar cambios de legajo', 'Aprueba una propuesta realizada por otra persona.', 'tenant', 'restricted'),
  ('leave.enter', 'Cargar licencias', 'Prepara y presenta solicitudes de licencia.', 'tenant', 'privileged'),
  ('leave.approve', 'Aprobar licencias', 'Decide solicitudes preparadas por otra persona.', 'tenant', 'restricted')
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind, sensitivity = EXCLUDED.sensitivity;

INSERT INTO iam_capability_conflict (capability_key, conflicts_with_key, reason) VALUES
  ('absence.enter', 'absence.validate', 'La carga y la validación deben estar separadas.'),
  ('employee.record.approve', 'employee.record.propose', 'La propuesta y su aprobación deben estar separadas.'),
  ('leave.approve', 'leave.enter', 'La preparación y la decisión deben estar separadas.'),
  ('time.overtime.approve', 'time.overtime.enter', 'La carga y la aprobación deben estar separadas.'),
  ('time.overtime.enter', 'time.overtime.post', 'La carga y el impacto deben estar separados.')
ON CONFLICT (capability_key, conflicts_with_key) DO UPDATE SET reason = EXCLUDED.reason;

INSERT INTO iam_role (role_key, label, description, scope_kind) VALUES
  ('PLATFORM_OWNER', 'Propietario de plataforma', 'Controla tenants, CRM e IAM; no hereda permisos laborales.', 'platform'),
  ('TENANT_ADMIN', 'Administrador institucional', 'Administra configuración institucional sin permisos operativos implícitos.', 'tenant'),
  ('JUNIN_TESORERIA_CARGA', 'Tesorería · carga de mayor esfuerzo', 'Responsable de carga; no aprueba ni impacta.', 'tenant'),
  ('JUNIN_RRHH_OPERADOR', 'RRHH · operador', 'Carga ausencias, licencias y propuestas de legajo.', 'tenant'),
  ('JUNIN_RRHH_APROBADOR', 'RRHH · aprobador', 'Valida ausencias, licencias y propuestas realizadas por otras personas.', 'tenant')
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description, scope_kind = EXCLUDED.scope_kind;

INSERT INTO iam_role_capability (role_key, capability_key) VALUES
  ('PLATFORM_OWNER', 'platform.tenants.read'),
  ('PLATFORM_OWNER', 'platform.tenants.manage'),
  ('PLATFORM_OWNER', 'platform.crm.read'),
  ('PLATFORM_OWNER', 'platform.crm.manage'),
  ('PLATFORM_OWNER', 'platform.users.read'),
  ('PLATFORM_OWNER', 'platform.users.invite'),
  ('PLATFORM_OWNER', 'platform.users.manage'),
  ('PLATFORM_OWNER', 'platform.roles.read'),
  ('PLATFORM_OWNER', 'platform.roles.manage'),
  ('PLATFORM_OWNER', 'platform.audit.read'),
  ('JUNIN_TESORERIA_CARGA', 'time.overtime.enter'),
  ('JUNIN_RRHH_OPERADOR', 'absence.enter'),
  ('JUNIN_RRHH_OPERADOR', 'employee.record.propose'),
  ('JUNIN_RRHH_OPERADOR', 'leave.enter'),
  ('JUNIN_RRHH_APROBADOR', 'absence.validate'),
  ('JUNIN_RRHH_APROBADOR', 'employee.record.approve'),
  ('JUNIN_RRHH_APROBADOR', 'leave.approve')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION tenant_iam_is_platform_owner(p_actor_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM internal_users users
    JOIN platform_user_role assignment
      ON lower(assignment.user_email) = lower(users.email)
     AND assignment.role_key = 'PLATFORM_OWNER'
     AND assignment.active IS TRUE
    WHERE lower(users.email) = lower(btrim(p_actor_email))
      AND users.active IS TRUE
  )
$$;

CREATE OR REPLACE FUNCTION tenant_iam_effective_capabilities(p_membership_id uuid)
RETURNS TABLE (capability_key varchar(96))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH role_grants AS (
    SELECT role_capability.capability_key
    FROM tenant_membership membership
    JOIN iam_role_capability role_capability ON role_capability.role_key = membership.role_key
    WHERE membership.id = p_membership_id
  ), allowed AS (
    SELECT override_row.capability_key
    FROM tenant_membership_capability_override override_row
    WHERE override_row.membership_id = p_membership_id
      AND override_row.allow_override IS TRUE
  ), denied AS (
    SELECT override_row.capability_key
    FROM tenant_membership_capability_override override_row
    WHERE override_row.membership_id = p_membership_id
      AND override_row.deny_override IS TRUE
  )
  SELECT DISTINCT granted.capability_key
  FROM (
    SELECT role_grants.capability_key FROM role_grants
    UNION ALL
    SELECT allowed.capability_key FROM allowed
  ) granted
  WHERE NOT EXISTS (
    SELECT 1 FROM denied WHERE denied.capability_key = granted.capability_key
  )
$$;

CREATE OR REPLACE FUNCTION tenant_iam_assert_no_sod_conflict(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM iam_capability_conflict conflict
    JOIN tenant_iam_effective_capabilities(p_membership_id) left_cap
      ON left_cap.capability_key = conflict.capability_key
    JOIN tenant_iam_effective_capabilities(p_membership_id) right_cap
      ON right_cap.capability_key = conflict.conflicts_with_key
  ) THEN
    RAISE EXCEPTION 'TENANT_IAM_SOD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION tenant_iam_admin_view(
  p_actor_email text,
  p_resource text,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor internal_users%ROWTYPE;
  safe_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
  tenants jsonb;
  roles jsonb;
  users_payload jsonb;
  events_payload jsonb;
  exclusive_payload jsonb;
BEGIN
  IF NOT tenant_iam_is_platform_owner(p_actor_email) THEN
    RAISE EXCEPTION 'TENANT_IAM_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT actor FROM internal_users
    WHERE lower(email) = lower(btrim(p_actor_email)) AND active IS TRUE LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item."legalName"), '[]'::jsonb) INTO tenants
  FROM (
    SELECT tenant.id, tenant.slug, tenant.legal_name AS "legalName",
           tenant.short_name AS "shortName", tenant.tenant_kind AS kind,
           tenant.jurisdiction, tenant.status, tenant.version,
           crm.implementation_stage AS "implementationStage",
           crm.next_action AS "nextAction", crm.next_action_at AS "nextActionAt"
    FROM platform_tenant tenant
    LEFT JOIN platform_crm_account crm ON crm.tenant_id = tenant.id
  ) item;

  SELECT COALESCE(jsonb_agg(to_jsonb(role_item) ORDER BY role_item.label), '[]'::jsonb) INTO roles
  FROM (
    SELECT role.role_key AS key, role.label, role.description, role.scope_kind AS "scopeKind",
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'key', capability.capability_key,
          'label', capability.label,
          'description', capability.description,
          'conflictsWith', COALESCE((
            SELECT jsonb_agg(other_key ORDER BY other_key)
            FROM (
              SELECT conflict.conflicts_with_key AS other_key
              FROM iam_capability_conflict conflict
              WHERE conflict.capability_key = capability.capability_key
              UNION
              SELECT conflict.capability_key AS other_key
              FROM iam_capability_conflict conflict
              WHERE conflict.conflicts_with_key = capability.capability_key
            ) conflicts
          ), '[]'::jsonb)
        ) ORDER BY capability.capability_key)
        FROM iam_role_capability role_capability
        JOIN iam_capability capability ON capability.capability_key = role_capability.capability_key
        WHERE role_capability.role_key = role.role_key
      ), '[]'::jsonb) AS capabilities
    FROM iam_role role
  ) role_item;

  SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item."displayName"), '[]'::jsonb) INTO users_payload
  FROM (
    SELECT membership.id, membership.tenant_id AS "tenantId", membership.user_email AS email,
           users.display_name AS "displayName", membership.role_key AS "roleKey",
           membership.status, membership.version,
           COALESCE((SELECT jsonb_agg(effective.capability_key ORDER BY effective.capability_key)
             FROM tenant_iam_effective_capabilities(membership.id) effective), '[]'::jsonb) AS capabilities
    FROM tenant_membership membership
    JOIN internal_users users ON lower(users.email) = lower(membership.user_email)
    LIMIT safe_limit
  ) item;

  SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item."occurredAt" DESC), '[]'::jsonb) INTO events_payload
  FROM (
    SELECT event.id, event.actor_user_email AS "actorEmail",
           event.tenant_id AS "tenantId", event.membership_id AS "membershipId",
           event.command, event.target_type AS "targetType", event.target_id AS "targetId",
           event.outcome, event.occurred_at AS "occurredAt"
    FROM tenant_iam_event event ORDER BY event.occurred_at DESC LIMIT safe_limit
  ) item;

  SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item."assignedAt" DESC), '[]'::jsonb) INTO exclusive_payload
  FROM (
    SELECT assignment.id, assignment.tenant_id AS "tenantId",
           assignment.capability_key AS "capabilityKey", assignment.membership_id AS "membershipId",
           assignment.assigned_at AS "assignedAt"
    FROM tenant_exclusive_capability assignment WHERE assignment.active IS TRUE
  ) item;

  IF p_resource = 'bootstrap' THEN
    RETURN jsonb_build_object(
      'user', jsonb_build_object(
        'email', lower(actor.email), 'displayName', actor.display_name, 'platformRole', 'PLATFORM_OWNER'
      ),
      'context', jsonb_build_object(
        'mode', 'platform', 'tenantAwareGateway', false,
        'message', 'Las invitaciones quedan preparadas e inactivas hasta certificar el gateway tenant-aware.'
      ),
      'tenants', tenants, 'roles', roles,
      'allowedCommands', jsonb_build_array(
        'create_tenant', 'invite_user', 'update_access',
        'suspend_membership', 'assign_exclusive_capability'
      ),
      'controls', jsonb_build_object(
        'sodReady', true, 'auditReady', true,
        'invitationGatewayReady', false, 'tenantDataPlaneReady', false
      ),
      'exclusiveAssignments', exclusive_payload
    );
  ELSIF p_resource = 'tenants' THEN
    RETURN jsonb_build_object('items', tenants, 'tenants', tenants);
  ELSIF p_resource = 'users' THEN
    RETURN jsonb_build_object('items', users_payload, 'users', users_payload);
  ELSIF p_resource = 'roles' THEN
    RETURN jsonb_build_object('items', roles, 'roles', roles);
  ELSIF p_resource = 'audit' THEN
    RETURN jsonb_build_object('items', events_payload, 'events', events_payload);
  END IF;
  RAISE EXCEPTION 'TENANT_IAM_RESOURCE_INVALID' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION tenant_iam_apply_command(
  p_actor_email text,
  p_command text,
  p_idempotency_key uuid,
  p_command_hash text,
  p_expected_version integer,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor internal_users%ROWTYPE;
  replay tenant_iam_event%ROWTYPE;
  tenant platform_tenant%ROWTYPE;
  membership tenant_membership%ROWTYPE;
  role_row iam_role%ROWTYPE;
  target_id text;
  result_payload jsonb;
  normalized_email text;
  invited_user internal_users%ROWTYPE;
  allow_key text;
  deny_key text;
  exclusive_revoked_count integer := 0;
  exclusive_current tenant_exclusive_capability%ROWTYPE;
  access_before jsonb;
  access_after jsonb;
BEGIN
  IF NOT tenant_iam_is_platform_owner(p_actor_email) THEN
    RAISE EXCEPTION 'TENANT_IAM_NOT_AUTHORIZED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO STRICT actor FROM internal_users
    WHERE lower(email) = lower(btrim(p_actor_email)) AND active IS TRUE LIMIT 1 FOR SHARE;
  IF p_command NOT IN (
    'create_tenant', 'invite_user', 'update_access',
    'suspend_membership', 'assign_exclusive_capability'
  ) OR p_idempotency_key IS NULL OR p_command_hash !~ '^[a-f0-9]{64}$'
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'TENANT_IAM_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(lower(p_actor_email) || ':' || p_idempotency_key::text, 0));
  SELECT * INTO replay FROM tenant_iam_event
  WHERE lower(actor_user_email) = lower(p_actor_email) AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF replay.command_hash <> p_command_hash OR replay.command <> p_command THEN
      RAISE EXCEPTION 'TENANT_IAM_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN replay.result || jsonb_build_object('replayed', true);
  END IF;

  IF p_command = 'create_tenant' THEN
    IF p_expected_version IS NOT NULL
       OR NOT (p_payload ?& ARRAY['slug', 'legalName', 'shortName', 'kind', 'jurisdiction'])
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['slug', 'legalName', 'shortName', 'kind', 'jurisdiction'])
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_each(p_payload) field(key, value)
         WHERE jsonb_typeof(field.value) IS DISTINCT FROM 'string'
       )
       OR length(btrim(p_payload->>'legalName')) NOT BETWEEN 2 AND 255
       OR length(btrim(p_payload->>'shortName')) NOT BETWEEN 1 AND 120
       OR length(btrim(p_payload->>'jurisdiction')) NOT BETWEEN 2 AND 160 THEN
      RAISE EXCEPTION 'TENANT_IAM_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO platform_tenant (
      slug, legal_name, short_name, tenant_kind, jurisdiction, status, created_by_user_email
    ) VALUES (
      lower(btrim(p_payload->>'slug')), btrim(p_payload->>'legalName'),
      btrim(p_payload->>'shortName'), p_payload->>'kind', btrim(p_payload->>'jurisdiction'),
      'onboarding', actor.email
    ) RETURNING * INTO tenant;
    INSERT INTO platform_crm_account (tenant_id, implementation_stage)
      VALUES (tenant.id, 'onboarding');
    target_id := tenant.id::text;
    result_payload := jsonb_build_object(
      'tenant', jsonb_build_object('id', tenant.id, 'slug', tenant.slug,
        'legalName', tenant.legal_name, 'status', tenant.status, 'version', tenant.version),
      'replayed', false
    );
  ELSIF p_command = 'invite_user' THEN
    IF p_expected_version IS NOT NULL
       OR NOT (p_payload ?& ARRAY['tenantId', 'email', 'displayName', 'roleKey'])
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['tenantId', 'email', 'displayName', 'roleKey'])
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_each(p_payload) field(key, value)
         WHERE jsonb_typeof(field.value) IS DISTINCT FROM 'string'
       )
       OR (p_payload->>'tenantId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'TENANT_IAM_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO tenant FROM platform_tenant WHERE id = (p_payload->>'tenantId')::uuid FOR SHARE;
    IF NOT FOUND OR tenant.status NOT IN ('onboarding', 'active') THEN
      RAISE EXCEPTION 'TENANT_IAM_TENANT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO role_row FROM iam_role WHERE role_key = p_payload->>'roleKey' AND scope_kind = 'tenant';
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_IAM_ROLE_INVALID' USING ERRCODE = 'P0001'; END IF;
    normalized_email := lower(btrim(p_payload->>'email'));
    IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
       OR length(normalized_email) > 254
       OR length(btrim(p_payload->>'displayName')) NOT BETWEEN 2 AND 160 THEN
      RAISE EXCEPTION 'TENANT_IAM_INVITATION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO invited_user FROM internal_users
      WHERE lower(email) = normalized_email LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      RAISE EXCEPTION 'TENANT_IAM_USER_ALREADY_EXISTS' USING ERRCODE = 'P0001';
    ELSE
      INSERT INTO internal_users (email, display_name, role, password_hash, active, updated_at)
        VALUES (normalized_email, btrim(p_payload->>'displayName'), 'INVITED_TENANT_USER', NULL, false, now());
    END IF;
    INSERT INTO tenant_membership (tenant_id, user_email, role_key, invited_by_user_email)
      VALUES (tenant.id, normalized_email, role_row.role_key, actor.email)
      RETURNING * INTO membership;
    PERFORM tenant_iam_assert_no_sod_conflict(membership.id);
    INSERT INTO tenant_invitation (membership_id, prepared_by_user_email)
      VALUES (membership.id, actor.email);
    target_id := membership.id::text;
    result_payload := jsonb_build_object(
      'membership', jsonb_build_object('id', membership.id, 'tenantId', membership.tenant_id,
        'roleKey', membership.role_key, 'status', membership.status, 'version', membership.version),
      'invitation', jsonb_build_object('status', 'prepared', 'gatewayReady', false),
      'credentialsCreated', false, 'replayed', false
    );
  ELSIF p_command = 'update_access' THEN
    IF NOT (p_payload ?& ARRAY['membershipId', 'roleKey', 'allowCapabilities', 'denyCapabilities', 'reason'])
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['membershipId', 'roleKey', 'allowCapabilities', 'denyCapabilities', 'reason'])
       )
       OR p_expected_version IS NULL OR p_expected_version < 1
       OR jsonb_typeof(p_payload->'membershipId') IS DISTINCT FROM 'string'
       OR (p_payload->>'membershipId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR jsonb_typeof(p_payload->'roleKey') IS DISTINCT FROM 'string'
       OR jsonb_typeof(p_payload->'allowCapabilities') IS DISTINCT FROM 'array'
       OR jsonb_typeof(p_payload->'denyCapabilities') IS DISTINCT FROM 'array'
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_payload->'allowCapabilities') item(value)
         WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'string'
       )
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_payload->'denyCapabilities') item(value)
         WHERE jsonb_typeof(item.value) IS DISTINCT FROM 'string'
       )
       OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string'
       OR length(btrim(p_payload->>'reason')) NOT BETWEEN 3 AND 500 THEN
      RAISE EXCEPTION 'TENANT_IAM_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO membership FROM tenant_membership
      WHERE id = (p_payload->>'membershipId')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_IAM_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF membership.version <> p_expected_version THEN
      RAISE EXCEPTION 'TENANT_IAM_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO role_row FROM iam_role WHERE role_key = p_payload->>'roleKey' AND scope_kind = 'tenant';
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_IAM_ROLE_INVALID' USING ERRCODE = 'P0001'; END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(p_payload->'allowCapabilities') allowed
      JOIN jsonb_array_elements_text(p_payload->'denyCapabilities') denied ON denied.value = allowed.value
    ) THEN RAISE EXCEPTION 'TENANT_IAM_OVERRIDE_AMBIGUOUS' USING ERRCODE = 'P0001'; END IF;
    SELECT jsonb_build_object(
      'version', membership.version,
      'roleKey', membership.role_key,
      'allow', COALESCE((
        SELECT jsonb_agg(access_override.capability_key ORDER BY access_override.capability_key)
        FROM tenant_membership_capability_override access_override
        WHERE access_override.membership_id = membership.id AND access_override.allow_override IS TRUE
      ), '[]'::jsonb),
      'deny', COALESCE((
        SELECT jsonb_agg(access_override.capability_key ORDER BY access_override.capability_key)
        FROM tenant_membership_capability_override access_override
        WHERE access_override.membership_id = membership.id AND access_override.deny_override IS TRUE
      ), '[]'::jsonb),
      'effectiveCapabilities', COALESCE((
        SELECT jsonb_agg(effective.capability_key ORDER BY effective.capability_key)
        FROM tenant_iam_effective_capabilities(membership.id) effective
      ), '[]'::jsonb)
    ) INTO access_before;
    DELETE FROM tenant_membership_capability_override WHERE membership_id = membership.id;
    FOR allow_key IN SELECT jsonb_array_elements_text(p_payload->'allowCapabilities') LOOP
      IF NOT EXISTS (SELECT 1 FROM iam_capability WHERE capability_key = allow_key AND scope_kind = 'tenant') THEN
        RAISE EXCEPTION 'TENANT_IAM_CAPABILITY_INVALID' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO tenant_membership_capability_override (
        membership_id, capability_key, allow_override, deny_override, reason, granted_by_user_email
      ) VALUES (membership.id, allow_key, true, false, btrim(p_payload->>'reason'), actor.email);
    END LOOP;
    FOR deny_key IN SELECT jsonb_array_elements_text(p_payload->'denyCapabilities') LOOP
      IF NOT EXISTS (SELECT 1 FROM iam_capability WHERE capability_key = deny_key AND scope_kind = 'tenant') THEN
        RAISE EXCEPTION 'TENANT_IAM_CAPABILITY_INVALID' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO tenant_membership_capability_override (
        membership_id, capability_key, allow_override, deny_override, reason, granted_by_user_email
      ) VALUES (membership.id, deny_key, false, true, btrim(p_payload->>'reason'), actor.email);
    END LOOP;
    UPDATE tenant_membership SET role_key = role_row.role_key, version = version + 1, updated_at = now()
      WHERE id = membership.id RETURNING * INTO membership;
    PERFORM tenant_iam_assert_no_sod_conflict(membership.id);
    UPDATE tenant_exclusive_capability exclusive_assignment
      SET active = false, revoked_at = now()
      WHERE exclusive_assignment.membership_id = membership.id
        AND exclusive_assignment.active IS TRUE
        AND NOT EXISTS (
          SELECT 1 FROM tenant_iam_effective_capabilities(membership.id) effective
          WHERE effective.capability_key = exclusive_assignment.capability_key
        );
    GET DIAGNOSTICS exclusive_revoked_count = ROW_COUNT;
    SELECT jsonb_build_object(
      'version', membership.version,
      'roleKey', membership.role_key,
      'allow', COALESCE((
        SELECT jsonb_agg(access_override.capability_key ORDER BY access_override.capability_key)
        FROM tenant_membership_capability_override access_override
        WHERE access_override.membership_id = membership.id AND access_override.allow_override IS TRUE
      ), '[]'::jsonb),
      'deny', COALESCE((
        SELECT jsonb_agg(access_override.capability_key ORDER BY access_override.capability_key)
        FROM tenant_membership_capability_override access_override
        WHERE access_override.membership_id = membership.id AND access_override.deny_override IS TRUE
      ), '[]'::jsonb),
      'effectiveCapabilities', COALESCE((
        SELECT jsonb_agg(effective.capability_key ORDER BY effective.capability_key)
        FROM tenant_iam_effective_capabilities(membership.id) effective
      ), '[]'::jsonb)
    ) INTO access_after;
    target_id := membership.id::text;
    result_payload := jsonb_build_object(
      'membership', jsonb_build_object('id', membership.id, 'roleKey', membership.role_key,
        'status', membership.status, 'version', membership.version),
      'accessChange', jsonb_build_object(
        'reason', btrim(p_payload->>'reason'), 'before', access_before, 'after', access_after
      ),
      'exclusiveAssignmentsRevoked', exclusive_revoked_count, 'replayed', false
    );
  ELSIF p_command = 'suspend_membership' THEN
    IF NOT (p_payload ? 'membershipId')
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload) field(key) WHERE field.key <> 'membershipId'
       )
       OR jsonb_typeof(p_payload->'membershipId') IS DISTINCT FROM 'string'
       OR (p_payload->>'membershipId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR p_expected_version IS NULL OR p_expected_version < 1 THEN
      RAISE EXCEPTION 'TENANT_IAM_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO membership FROM tenant_membership
      WHERE id = (p_payload->>'membershipId')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_IAM_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF membership.version <> p_expected_version THEN
      RAISE EXCEPTION 'TENANT_IAM_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    UPDATE tenant_exclusive_capability SET active = false, revoked_at = now()
      WHERE membership_id = membership.id AND active IS TRUE;
    UPDATE tenant_membership SET status = 'suspended', suspended_at = now(),
      version = version + 1, updated_at = now()
      WHERE id = membership.id RETURNING * INTO membership;
    target_id := membership.id::text;
    result_payload := jsonb_build_object(
      'membership', jsonb_build_object('id', membership.id, 'status', membership.status,
        'version', membership.version), 'replayed', false
    );
  ELSE
    IF NOT (p_payload ?& ARRAY['membershipId', 'capabilityKey'])
       OR EXISTS (
         SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['membershipId', 'capabilityKey'])
       )
       OR jsonb_typeof(p_payload->'membershipId') IS DISTINCT FROM 'string'
       OR (p_payload->>'membershipId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR jsonb_typeof(p_payload->'capabilityKey') IS DISTINCT FROM 'string'
       OR p_payload->>'capabilityKey' <> 'time.overtime.enter'
       OR p_expected_version IS NULL OR p_expected_version < 1 THEN
      RAISE EXCEPTION 'TENANT_IAM_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO membership FROM tenant_membership
      WHERE id = (p_payload->>'membershipId')::uuid FOR UPDATE;
    IF NOT FOUND OR membership.status <> 'active' THEN
      RAISE EXCEPTION 'TENANT_IAM_MEMBERSHIP_NOT_ACTIVE' USING ERRCODE = 'P0001';
    END IF;
    IF membership.version <> p_expected_version THEN
      RAISE EXCEPTION 'TENANT_IAM_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(membership.id) effective
      WHERE effective.capability_key = 'time.overtime.enter'
    ) THEN RAISE EXCEPTION 'TENANT_IAM_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO exclusive_current FROM tenant_exclusive_capability
      WHERE tenant_id = membership.tenant_id
        AND capability_key = 'time.overtime.enter' AND active IS TRUE FOR UPDATE;
    IF FOUND AND exclusive_current.membership_id <> membership.id THEN
      RAISE EXCEPTION 'TENANT_IAM_EXCLUSIVE_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF NOT FOUND THEN
      INSERT INTO tenant_exclusive_capability (
        tenant_id, capability_key, membership_id, assigned_by_user_email
      ) VALUES (membership.tenant_id, 'time.overtime.enter', membership.id, actor.email);
    END IF;
    UPDATE tenant_membership SET version = version + 1, updated_at = now()
      WHERE id = membership.id RETURNING * INTO membership;
    target_id := membership.id::text;
    result_payload := jsonb_build_object(
      'exclusiveAssignment', jsonb_build_object('tenantId', membership.tenant_id,
        'membershipId', membership.id, 'capabilityKey', 'time.overtime.enter'),
      'membershipVersion', membership.version, 'replayed', false
    );
  END IF;

  INSERT INTO tenant_iam_event (
    actor_user_email, tenant_id, membership_id, command, target_type,
    target_id, idempotency_key, command_hash, result
  ) VALUES (
    actor.email, COALESCE(membership.tenant_id, tenant.id), membership.id,
    p_command, CASE WHEN p_command = 'create_tenant' THEN 'tenant' ELSE 'membership' END,
    target_id, p_idempotency_key, p_command_hash, result_payload
  );
  RETURN result_payload;
END
$$;

COMMENT ON TABLE tenant_invitation IS
  'Invitación preparada sin contraseña ni token. La emisión queda bloqueada hasta certificar el gateway tenant-aware.';
COMMENT ON TABLE tenant_iam_event IS
  'Auditoría append-only e idempotencia del control plane. No almacenar contraseñas, tokens ni datos laborales sensibles.';

REVOKE ALL ON FUNCTION tenant_iam_reject_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_is_platform_owner(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_effective_capabilities(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_assert_no_sod_conflict(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_admin_view(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_apply_command(text, text, uuid, text, integer, jsonb) FROM PUBLIC;

DO $$
DECLARE runtime_role pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO runtime_role FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app';
  IF NOT FOUND
     OR NOT runtime_role.rolcanlogin OR runtime_role.rolinherit
     OR runtime_role.rolsuper OR runtime_role.rolcreaterole OR runtime_role.rolcreatedb
     OR runtime_role.rolreplication OR runtime_role.rolbypassrls
     OR EXISTS (SELECT 1 FROM pg_auth_members membership WHERE membership.member = runtime_role.oid) THEN
    RAISE EXCEPTION 'municontrol_actions_runtime_app must be isolated LOGIN NOINHERIT with no elevated attributes';
  END IF;
END
$$;

REVOKE ALL PRIVILEGES ON TABLE
  iam_capability, iam_capability_conflict, iam_role, iam_role_capability,
  platform_tenant, platform_tenant_source_binding, platform_crm_account,
  platform_user_role, tenant_membership, tenant_membership_capability_override,
  tenant_invitation, tenant_exclusive_capability, tenant_iam_event
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON SEQUENCE tenant_iam_event_id_seq FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_reject_change() FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_is_platform_owner(text) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_effective_capabilities(uuid) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_assert_no_sod_conflict(uuid) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_admin_view(text, text, integer) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_apply_command(text, text, uuid, text, integer, jsonb) FROM municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_iam_admin_view(text, text, integer) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_iam_apply_command(text, text, uuid, text, integer, jsonb) TO municontrol_actions_runtime_app;
