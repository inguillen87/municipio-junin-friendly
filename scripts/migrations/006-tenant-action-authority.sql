-- MuniControl Friendly - Sprint 006A
-- Autoridad operativa tenant-owned para el Centro de Acciones.
-- PLATFORM_OWNER configura vinculos y alcances desde contexto plataforma MFA,
-- pero nunca hereda autoridad para operar casos municipales.

INSERT INTO iam_capability (capability_key, label, description, scope_kind, sensitivity) VALUES
  ('leave.request.self.create', 'Crear licencia propia', 'Crea una solicitud para el vinculo laboral propio.', 'tenant', 'privileged'),
  ('leave.request.self.read', 'Ver licencias propias', 'Consulta solicitudes del vinculo laboral propio.', 'tenant', 'standard'),
  ('leave.request.self.update', 'Editar licencia propia', 'Edita un borrador del vinculo laboral propio.', 'tenant', 'privileged'),
  ('leave.request.self.submit', 'Presentar licencia propia', 'Presenta un borrador del vinculo laboral propio.', 'tenant', 'privileged'),
  ('leave.request.self.cancel', 'Cancelar licencia propia', 'Cancela una solicitud propia pendiente.', 'tenant', 'privileged'),
  ('leave.request.area.create', 'Crear licencias por alcance', 'Crea solicitudes dentro de un alcance explicito.', 'tenant', 'privileged'),
  ('leave.request.area.read', 'Ver licencias por alcance', 'Consulta solicitudes dentro de un alcance explicito.', 'tenant', 'privileged'),
  ('leave.request.area.update', 'Editar licencias por alcance', 'Edita borradores dentro de un alcance explicito.', 'tenant', 'privileged'),
  ('leave.request.area.submit', 'Presentar licencias por alcance', 'Presenta borradores dentro de un alcance explicito.', 'tenant', 'privileged'),
  ('leave.request.area.cancel_pending', 'Cancelar licencias pendientes', 'Cancela solicitudes pendientes dentro de un alcance explicito.', 'tenant', 'privileged'),
  ('leave.request.area.decide', 'Decidir licencias', 'Aprueba o rechaza solicitudes dentro de un alcance explicito.', 'tenant', 'restricted'),
  ('leave.request.area.cancel_approved', 'Cancelar licencias aprobadas', 'Cancela una licencia aprobada dentro de un alcance explicito.', 'tenant', 'restricted'),
  ('leave.request.all.manage', 'Administrar todas las licencias', 'Autoridad operativa total, nunca implicita para administradores.', 'tenant', 'restricted'),
  ('leave.request.all.read', 'Ver licencias autorizadas', 'Consulta nominal estandar en todo el tenant.', 'tenant', 'restricted'),
  ('leave.request.aggregate.read', 'Ver agregados de licencias', 'Consulta indicadores sin detalle nominal.', 'tenant', 'standard'),
  ('leave.request.audit.read', 'Auditar licencias', 'Consulta trazabilidad autorizada de licencias.', 'tenant', 'restricted'),
  ('leave.request.restricted.read', 'Ver licencias confidenciales', 'Habilita datos confidenciales junto con un permiso nominal.', 'tenant', 'restricted'),
  ('leave.request.restricted.decide', 'Decidir licencias confidenciales', 'Habilita decisiones confidenciales junto con un permiso de decision.', 'tenant', 'restricted'),
  ('leave.request.payroll.read', 'Ver impacto pendiente en nomina', 'Consulta resumen minimizado de licencias aprobadas.', 'tenant', 'restricted')
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind, sensitivity = EXCLUDED.sensitivity;

INSERT INTO iam_role (role_key, label, description, scope_kind) VALUES
  ('JUNIN_EMPLEADO', 'Empleado municipal', 'Autogestion de solicitudes propias, sin autoridad sobre terceros.', 'tenant')
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label, description = EXCLUDED.description, scope_kind = EXCLUDED.scope_kind;

INSERT INTO iam_role_capability (role_key, capability_key) VALUES
  ('JUNIN_EMPLEADO', 'actions.read'),
  ('JUNIN_EMPLEADO', 'leave.request.self.create'),
  ('JUNIN_EMPLEADO', 'leave.request.self.read'),
  ('JUNIN_EMPLEADO', 'leave.request.self.update'),
  ('JUNIN_EMPLEADO', 'leave.request.self.submit'),
  ('JUNIN_EMPLEADO', 'leave.request.self.cancel'),
  ('JUNIN_RRHH_OPERADOR', 'leave.request.area.create'),
  ('JUNIN_RRHH_OPERADOR', 'leave.request.area.read'),
  ('JUNIN_RRHH_OPERADOR', 'leave.request.area.update'),
  ('JUNIN_RRHH_OPERADOR', 'leave.request.area.submit'),
  ('JUNIN_RRHH_OPERADOR', 'leave.request.area.cancel_pending'),
  ('JUNIN_RRHH_APROBADOR', 'leave.request.area.read'),
  ('JUNIN_RRHH_APROBADOR', 'leave.request.area.decide'),
  ('JUNIN_RRHH_APROBADOR', 'leave.request.area.cancel_approved'),
  ('JUNIN_RRHH_APROBADOR', 'leave.request.restricted.read'),
  ('JUNIN_RRHH_APROBADOR', 'leave.request.restricted.decide'),
  ('JUNIN_RRHH_APROBADOR', 'leave.request.audit.read'),
  ('JUNIN_TESORERIA_CARGA', 'leave.request.payroll.read')
ON CONFLICT DO NOTHING;

-- La funcion 004 no filtraba membresias suspendidas ni capacidades platform.
CREATE OR REPLACE FUNCTION tenant_iam_effective_capabilities(p_membership_id uuid)
RETURNS TABLE (capability_key varchar(96))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH valid_membership AS (
    SELECT membership.id, membership.role_key
    FROM tenant_membership membership
    JOIN platform_tenant tenant ON tenant.id = membership.tenant_id AND tenant.status = 'active'
    JOIN iam_role role_row ON role_row.role_key = membership.role_key AND role_row.scope_kind = 'tenant'
    WHERE membership.id = p_membership_id AND membership.status = 'active'
  ), role_grants AS (
    SELECT role_capability.capability_key
    FROM valid_membership membership
    JOIN iam_role_capability role_capability ON role_capability.role_key = membership.role_key
    JOIN iam_capability capability ON capability.capability_key = role_capability.capability_key
      AND capability.scope_kind = 'tenant'
  ), allowed AS (
    SELECT override_row.capability_key
    FROM valid_membership membership
    JOIN tenant_membership_capability_override override_row
      ON override_row.membership_id = membership.id AND override_row.allow_override IS TRUE
    JOIN iam_capability capability ON capability.capability_key = override_row.capability_key
      AND capability.scope_kind = 'tenant'
  ), denied AS (
    SELECT override_row.capability_key
    FROM valid_membership membership
    JOIN tenant_membership_capability_override override_row
      ON override_row.membership_id = membership.id AND override_row.deny_override IS TRUE
  )
  SELECT DISTINCT granted.capability_key
  FROM (
    SELECT role_grants.capability_key FROM role_grants
    UNION ALL
    SELECT allowed.capability_key FROM allowed
  ) granted
  WHERE NOT EXISTS (SELECT 1 FROM denied WHERE denied.capability_key = granted.capability_key)
$$;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_membership_id_tenant_id_uk
  ON tenant_membership (id, tenant_id);

CREATE TABLE IF NOT EXISTS tenant_action_authority (
  membership_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_action_authority_membership_fk
    FOREIGN KEY (membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT tenant_action_authority_version_ck CHECK (version > 0)
);

INSERT INTO tenant_action_authority (membership_id, tenant_id)
SELECT membership.id, membership.tenant_id FROM tenant_membership membership
ON CONFLICT (membership_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_action_employment_link (
  membership_id uuid PRIMARY KEY REFERENCES tenant_action_authority(membership_id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL,
  source_binding_id uuid NOT NULL,
  employment_contract_id uuid NOT NULL REFERENCES employment_contract(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  linked_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_action_employment_membership_fk
    FOREIGN KEY (membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT tenant_action_employment_binding_fk
    FOREIGN KEY (tenant_id, source_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_action_employment_state_ck CHECK (
    (active IS TRUE AND revoked_at IS NULL) OR (active IS FALSE AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT tenant_action_employment_tenant_contract_uk UNIQUE (tenant_id, employment_contract_id)
);

CREATE TABLE IF NOT EXISTS tenant_action_area_scope (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES tenant_action_authority(membership_id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL,
  source_binding_id uuid NOT NULL,
  capability_key varchar(96) NOT NULL REFERENCES iam_capability(capability_key) ON DELETE RESTRICT,
  scope_level varchar(16) NOT NULL,
  company_id bigint NOT NULL,
  organization_unit_source_id varchar(128),
  sector_source_id varchar(128),
  active boolean NOT NULL DEFAULT true,
  granted_by_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_action_area_scope_membership_fk
    FOREIGN KEY (membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT tenant_action_area_scope_binding_fk
    FOREIGN KEY (tenant_id, source_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_action_area_scope_level_ck CHECK (scope_level IN ('company', 'organization', 'sector')),
  CONSTRAINT tenant_action_area_scope_capability_ck CHECK (capability_key LIKE 'leave.request.area.%'),
  CONSTRAINT tenant_action_area_scope_shape_ck CHECK (
    (scope_level = 'company' AND organization_unit_source_id IS NULL AND sector_source_id IS NULL)
    OR (scope_level = 'organization' AND organization_unit_source_id IS NOT NULL AND sector_source_id IS NULL)
    OR (scope_level = 'sector' AND organization_unit_source_id IS NOT NULL AND sector_source_id IS NOT NULL)
  ),
  CONSTRAINT tenant_action_area_scope_state_ck CHECK (
    (active IS TRUE AND revoked_at IS NULL) OR (active IS FALSE AND revoked_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_action_area_scope_identity_uk
  ON tenant_action_area_scope (
    membership_id, capability_key, source_binding_id, scope_level,
    COALESCE(organization_unit_source_id, ''), COALESCE(sector_source_id, '')
  );
CREATE INDEX IF NOT EXISTS tenant_action_area_scope_active_idx
  ON tenant_action_area_scope (membership_id, capability_key) WHERE active IS TRUE;

CREATE TABLE IF NOT EXISTS tenant_action_authority_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_email text NOT NULL REFERENCES internal_users(email) ON UPDATE CASCADE ON DELETE RESTRICT,
  actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES tenant_membership(id) ON DELETE RESTRICT,
  command varchar(48) NOT NULL,
  target_type varchar(48) NOT NULL,
  target_id text NOT NULL,
  idempotency_key uuid NOT NULL,
  command_hash char(64) NOT NULL,
  expected_version integer NOT NULL,
  resulting_version integer NOT NULL,
  reason_code varchar(32) NOT NULL,
  reason_hash char(64),
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  result jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_action_authority_event_idempotency_uk UNIQUE (actor_user_email, idempotency_key),
  CONSTRAINT tenant_action_authority_event_hash_ck CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT tenant_action_authority_event_reason_hash_ck CHECK (reason_hash IS NULL OR reason_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT tenant_action_authority_event_version_ck CHECK (expected_version > 0 AND resulting_version > expected_version),
  CONSTRAINT tenant_action_authority_event_json_ck CHECK (
    jsonb_typeof(before_snapshot) = 'object' AND jsonb_typeof(after_snapshot) = 'object'
    AND jsonb_typeof(result) = 'object'
  )
);

CREATE OR REPLACE FUNCTION tenant_action_reject_audit_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'TENANT_ACTION_AUDIT_IMMUTABLE' USING ERRCODE = 'P0001';
END
$$;
DROP TRIGGER IF EXISTS tenant_action_authority_event_append_only ON tenant_action_authority_event;
CREATE TRIGGER tenant_action_authority_event_append_only
BEFORE UPDATE OR DELETE ON tenant_action_authority_event
FOR EACH ROW EXECUTE FUNCTION tenant_action_reject_audit_change();

CREATE OR REPLACE FUNCTION tenant_action_initialize_authority()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO tenant_action_authority (membership_id, tenant_id) VALUES (NEW.id, NEW.tenant_id)
  ON CONFLICT (membership_id) DO NOTHING;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS tenant_action_membership_initialize ON tenant_membership;
CREATE TRIGGER tenant_action_membership_initialize
AFTER INSERT ON tenant_membership
FOR EACH ROW EXECUTE FUNCTION tenant_action_initialize_authority();

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
  row_payload := to_jsonb(NEW);
  SELECT binding.* INTO binding_row
  FROM platform_tenant_source_binding binding
  JOIN tenant_identity_policy policy
    ON policy.tenant_id = binding.tenant_id
   AND policy.certified_source_binding_id = binding.id
  WHERE binding.id = (row_payload->>'source_binding_id')::uuid
    AND binding.tenant_id = (row_payload->>'tenant_id')::uuid
    AND binding.source_system = 'GRH' AND binding.verified IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  IF TG_TABLE_NAME = 'tenant_action_employment_link' THEN
    IF (row_payload->>'active')::boolean IS TRUE THEN
      PERFORM 1
      FROM employment_contract contract
      JOIN source_import_batch batch
        ON batch.id = contract.source_batch_id
       AND batch.source_system = 'GRH'
       AND batch.source_database = binding_row.source_database
       AND batch.validation_state = 'published'
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
DROP TRIGGER IF EXISTS tenant_action_employment_binding_guard ON tenant_action_employment_link;
CREATE TRIGGER tenant_action_employment_binding_guard
BEFORE INSERT OR UPDATE ON tenant_action_employment_link
FOR EACH ROW EXECUTE FUNCTION tenant_action_validate_binding();
DROP TRIGGER IF EXISTS tenant_action_scope_binding_guard ON tenant_action_area_scope;
CREATE TRIGGER tenant_action_scope_binding_guard
BEFORE INSERT OR UPDATE ON tenant_action_area_scope
FOR EACH ROW EXECUTE FUNCTION tenant_action_validate_binding();

ALTER TABLE action_case ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE action_case ADD COLUMN IF NOT EXISTS source_binding_id uuid;

DO $$
DECLARE
  invalid_count bigint;
BEGIN
  SELECT count(*) INTO invalid_count
  FROM action_case action
  LEFT JOIN LATERAL (
    SELECT count(*) AS candidates
    FROM source_import_batch batch
    JOIN platform_tenant_source_binding binding
      ON binding.source_system = 'GRH'
     AND binding.source_database = batch.source_database
     AND binding.source_company_id = action.company_id
     AND binding.verified IS TRUE
    JOIN tenant_identity_policy policy
      ON policy.tenant_id = binding.tenant_id
     AND policy.certified_source_binding_id = binding.id
     AND policy.tenant_data_plane_ready IS TRUE
    JOIN platform_tenant tenant ON tenant.id = binding.tenant_id AND tenant.status = 'active'
    WHERE batch.id = action.source_batch_id AND batch.source_system = 'GRH'
      AND batch.validation_state = 'published'
  ) match ON true
  WHERE action.tenant_id IS NULL AND match.candidates <> 1;
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'TENANT_ACTION_BACKFILL_AMBIGUOUS: % casos sin binding certificado unico', invalid_count
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE action_case action SET tenant_id = candidate.tenant_id, source_binding_id = candidate.binding_id
  FROM (
    SELECT action_row.id AS case_id, min(binding.tenant_id::text)::uuid AS tenant_id,
           min(binding.id::text)::uuid AS binding_id
    FROM action_case action_row
    JOIN source_import_batch batch ON batch.id = action_row.source_batch_id
      AND batch.source_system = 'GRH' AND batch.validation_state = 'published'
    JOIN platform_tenant_source_binding binding
      ON binding.source_system = 'GRH'
     AND binding.source_database = batch.source_database
     AND binding.source_company_id = action_row.company_id
     AND binding.verified IS TRUE
    JOIN tenant_identity_policy policy
      ON policy.tenant_id = binding.tenant_id
     AND policy.certified_source_binding_id = binding.id
     AND policy.tenant_data_plane_ready IS TRUE
    JOIN platform_tenant tenant ON tenant.id = binding.tenant_id AND tenant.status = 'active'
    WHERE action_row.tenant_id IS NULL
    GROUP BY action_row.id HAVING count(*) = 1
  ) candidate WHERE action.id = candidate.case_id;
END
$$;

ALTER TABLE action_case ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE action_case ALTER COLUMN source_binding_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_case_tenant_fk') THEN
    ALTER TABLE action_case ADD CONSTRAINT action_case_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_case_source_binding_fk') THEN
    ALTER TABLE action_case ADD CONSTRAINT action_case_source_binding_fk
      FOREIGN KEY (tenant_id, source_binding_id)
      REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS action_case_tenant_queue_idx
  ON action_case (tenant_id, source_binding_id, case_type, status, updated_at DESC);

ALTER TABLE action_case_event ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE action_case_event ADD COLUMN IF NOT EXISTS source_binding_id uuid;
ALTER TABLE action_case_event ADD COLUMN IF NOT EXISTS actor_membership_id uuid;
UPDATE action_case_event event SET tenant_id = action.tenant_id, source_binding_id = action.source_binding_id
FROM action_case action WHERE action.id = event.case_id AND event.tenant_id IS NULL;
UPDATE action_case_event event SET actor_membership_id = membership.id
FROM tenant_membership membership
WHERE membership.tenant_id = event.tenant_id
  AND lower(membership.user_email) = lower(event.actor_user_email)
  AND event.actor_membership_id IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM action_case_event WHERE actor_membership_id IS NULL) THEN
    RAISE EXCEPTION 'TENANT_ACTION_EVENT_BACKFILL_AMBIGUOUS' USING ERRCODE = 'P0001';
  END IF;
END $$;
ALTER TABLE action_case_event ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE action_case_event ALTER COLUMN source_binding_id SET NOT NULL;
ALTER TABLE action_case_event ALTER COLUMN actor_membership_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_case_event_binding_fk') THEN
    ALTER TABLE action_case_event ADD CONSTRAINT action_case_event_binding_fk
      FOREIGN KEY (tenant_id, source_binding_id)
      REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'action_case_event_membership_fk') THEN
    ALTER TABLE action_case_event ADD CONSTRAINT action_case_event_membership_fk
      FOREIGN KEY (actor_membership_id, tenant_id)
      REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM action_command_context) THEN
    RAISE EXCEPTION 'TENANT_ACTION_CONTEXT_NOT_EMPTY' USING ERRCODE = 'P0001';
  END IF;
END $$;
ALTER TABLE action_command_context ADD COLUMN IF NOT EXISTS tenant_id uuid;
ALTER TABLE action_command_context ADD COLUMN IF NOT EXISTS source_binding_id uuid;
ALTER TABLE action_command_context ADD COLUMN IF NOT EXISTS actor_membership_id uuid;
ALTER TABLE action_command_context ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE action_command_context ALTER COLUMN source_binding_id SET NOT NULL;
ALTER TABLE action_command_context ALTER COLUMN actor_membership_id SET NOT NULL;

CREATE OR REPLACE FUNCTION action_center_set_tenant_command_context(
  p_actor_email text, p_actor_role text, p_actor_membership_id uuid,
  p_tenant_id uuid, p_source_binding_id uuid,
  p_actor_employment_contract_id uuid, p_actor_person_id uuid,
  p_event_type text, p_idempotency_key uuid, p_command_hash text, p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO action_command_context (
    backend_pid, transaction_id, actor_user_email, actor_role,
    actor_membership_id, tenant_id, source_binding_id,
    actor_employment_contract_id, actor_person_id, event_type,
    idempotency_key, command_hash, metadata
  ) VALUES (
    pg_backend_pid(), txid_current(), p_actor_email, p_actor_role,
    p_actor_membership_id, p_tenant_id, p_source_binding_id,
    p_actor_employment_contract_id, p_actor_person_id, p_event_type,
    p_idempotency_key, p_command_hash, COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (backend_pid, transaction_id) DO UPDATE SET
    actor_user_email = EXCLUDED.actor_user_email, actor_role = EXCLUDED.actor_role,
    actor_membership_id = EXCLUDED.actor_membership_id,
    tenant_id = EXCLUDED.tenant_id, source_binding_id = EXCLUDED.source_binding_id,
    actor_employment_contract_id = EXCLUDED.actor_employment_contract_id,
    actor_person_id = EXCLUDED.actor_person_id, event_type = EXCLUDED.event_type,
    idempotency_key = EXCLUDED.idempotency_key, command_hash = EXCLUDED.command_hash,
    metadata = EXCLUDED.metadata, created_at = now();
END
$$;

CREATE OR REPLACE FUNCTION action_center_require_event_context()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE context action_command_context%ROWTYPE;
BEGIN
  SELECT * INTO context FROM action_command_context
  WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  IF NOT FOUND OR NEW.actor_user_email <> context.actor_user_email
     OR NEW.actor_role <> context.actor_role
     OR NEW.actor_membership_id <> context.actor_membership_id
     OR NEW.tenant_id <> context.tenant_id
     OR NEW.source_binding_id <> context.source_binding_id
     OR NEW.actor_employment_contract_id IS DISTINCT FROM context.actor_employment_contract_id
     OR NEW.actor_person_id IS DISTINCT FROM context.actor_person_id
     OR NEW.event_type <> context.event_type OR NEW.idempotency_key <> context.idempotency_key
     OR NEW.command_hash <> context.command_hash OR NEW.metadata IS DISTINCT FROM context.metadata THEN
    RAISE EXCEPTION 'ACTION_DIRECT_DML_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION action_center_log_case_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE context action_command_context%ROWTYPE;
BEGIN
  SELECT * INTO STRICT context FROM action_command_context
  WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  IF NEW.tenant_id <> context.tenant_id OR NEW.source_binding_id <> context.source_binding_id THEN
    RAISE EXCEPTION 'ACTION_DIRECT_DML_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO action_case_event (
    case_id, case_type, case_version, event_type, from_status, to_status,
    actor_user_email, actor_role, actor_membership_id, tenant_id, source_binding_id,
    actor_employment_contract_id, actor_person_id, idempotency_key, command_hash, metadata
  ) VALUES (
    NEW.id, NEW.case_type, NEW.version, context.event_type,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status,
    context.actor_user_email, context.actor_role, context.actor_membership_id,
    context.tenant_id, context.source_binding_id,
    context.actor_employment_contract_id, context.actor_person_id,
    context.idempotency_key, context.command_hash, context.metadata
  );
  DELETE FROM action_command_context
  WHERE backend_pid = pg_backend_pid() AND transaction_id = txid_current();
  RETURN NEW;
END
$$;

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
    (OLD.status = 'draft' AND NEW.status IN ('submitted', 'cancelled'))
    OR (OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected', 'cancelled'))
    OR (OLD.status = 'approved' AND NEW.status = 'cancelled')
  ) THEN RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001'; END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'ACTION_VERSION_INCREMENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION action_center_resolve_tenant_principal(
  p_user_email text, p_tenant_id uuid, p_membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  membership tenant_membership%ROWTYPE;
  binding platform_tenant_source_binding%ROWTYPE;
  user_row internal_users%ROWTYPE;
  employment_id uuid;
  capabilities jsonb;
  scopes jsonb;
BEGIN
  SELECT membership_row.* INTO membership
  FROM tenant_membership membership_row
  JOIN platform_tenant tenant ON tenant.id = membership_row.tenant_id AND tenant.status = 'active'
  WHERE membership_row.id = p_membership_id AND membership_row.tenant_id = p_tenant_id
    AND lower(membership_row.user_email) = lower(btrim(p_user_email))
    AND membership_row.status = 'active';
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO user_row FROM internal_users
  WHERE lower(email) = lower(membership.user_email) AND active IS TRUE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT source.* INTO binding
  FROM tenant_identity_policy policy
  JOIN platform_tenant_source_binding source
    ON source.id = policy.certified_source_binding_id AND source.tenant_id = policy.tenant_id
  WHERE policy.tenant_id = membership.tenant_id AND policy.tenant_data_plane_ready IS TRUE
    AND source.source_system = 'GRH' AND source.verified IS TRUE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM tenant_iam_assert_no_sod_conflict(membership.id);
  IF NOT EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities(membership.id) effective
    WHERE effective.capability_key = 'actions.read'
  ) THEN RETURN NULL; END IF;
  SELECT link.employment_contract_id INTO employment_id
  FROM tenant_action_employment_link link
  JOIN employment_contract contract
    ON contract.id = link.employment_contract_id AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = binding.source_company_id
  JOIN source_import_batch batch
    ON batch.id = contract.source_batch_id AND batch.source_system = 'GRH'
   AND batch.source_database = binding.source_database AND batch.validation_state = 'published'
  WHERE link.membership_id = membership.id AND link.tenant_id = membership.tenant_id
    AND link.source_binding_id = binding.id AND link.active IS TRUE;
  SELECT COALESCE(jsonb_agg(item.capability_key ORDER BY item.capability_key), '[]'::jsonb)
  INTO capabilities FROM tenant_iam_effective_capabilities(membership.id) item;
  SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item."capabilityKey", item."scopeLevel", item."id"), '[]'::jsonb)
  INTO scopes FROM (
    SELECT scope.id, scope.capability_key AS "capabilityKey", scope.scope_level AS "scopeLevel",
      scope.company_id AS "companyId", scope.organization_unit_source_id AS "organizationUnitSourceId",
      scope.sector_source_id AS "sectorSourceId"
    FROM tenant_action_area_scope scope
    JOIN tenant_iam_effective_capabilities(membership.id) effective
      ON effective.capability_key = scope.capability_key
    WHERE scope.membership_id = membership.id AND scope.tenant_id = membership.tenant_id
      AND scope.source_binding_id = binding.id AND scope.company_id = binding.source_company_id
      AND scope.active IS TRUE
  ) item;
  RETURN jsonb_build_object(
    'email', user_row.email, 'displayName', user_row.display_name,
    'tenantId', membership.tenant_id, 'membershipId', membership.id,
    'roleKey', membership.role_key, 'sourceBindingId', binding.id,
    'sourceCompanyId', binding.source_company_id, 'sourceDatabase', binding.source_database,
    'employmentContractId', employment_id, 'capabilities', capabilities, 'areaScopes', scopes
  );
END
$$;

CREATE OR REPLACE FUNCTION action_center_tenant_actor_authorized(
  p_actor_email text, p_tenant_id uuid, p_membership_id uuid, p_command text,
  p_beneficiary_contract_id uuid, p_company_id bigint,
  p_organization_unit_source_id text, p_sector_source_id text,
  p_current_status text, p_confidentiality text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  self_case boolean := false;
  required_capability text;
  area_case boolean := false;
  restricted_capability text;
  binding_id uuid;
BEGIN
  SELECT policy.certified_source_binding_id INTO binding_id
  FROM tenant_membership membership
  JOIN internal_users users ON lower(users.email) = lower(membership.user_email) AND users.active IS TRUE
  JOIN platform_tenant tenant ON tenant.id = membership.tenant_id AND tenant.status = 'active'
  JOIN tenant_identity_policy policy ON policy.tenant_id = tenant.id AND policy.tenant_data_plane_ready IS TRUE
  JOIN platform_tenant_source_binding binding
    ON binding.id = policy.certified_source_binding_id AND binding.tenant_id = tenant.id
   AND binding.source_system = 'GRH' AND binding.verified IS TRUE
   AND binding.source_company_id = p_company_id
  WHERE membership.id = p_membership_id AND membership.tenant_id = p_tenant_id
    AND lower(membership.user_email) = lower(btrim(p_actor_email)) AND membership.status = 'active';
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) effective
    WHERE effective.capability_key = 'actions.read'
  ) THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM tenant_action_employment_link link
    WHERE link.membership_id = p_membership_id AND link.tenant_id = p_tenant_id
      AND link.source_binding_id = binding_id AND link.employment_contract_id = p_beneficiary_contract_id
      AND link.active IS TRUE
  ) INTO self_case;

  required_capability := CASE p_command
    WHEN 'create' THEN 'leave.request.area.create'
    WHEN 'read' THEN 'leave.request.area.read'
    WHEN 'update_draft' THEN 'leave.request.area.update'
    WHEN 'submit' THEN 'leave.request.area.submit'
    WHEN 'approve' THEN 'leave.request.area.decide'
    WHEN 'reject' THEN 'leave.request.area.decide'
    WHEN 'cancel' THEN CASE WHEN p_current_status = 'approved'
      THEN 'leave.request.area.cancel_approved' ELSE 'leave.request.area.cancel_pending' END
    ELSE NULL END;
  SELECT EXISTS (
    SELECT 1 FROM tenant_action_area_scope scope
    JOIN tenant_iam_effective_capabilities(p_membership_id) effective
      ON effective.capability_key = scope.capability_key
    WHERE scope.membership_id = p_membership_id AND scope.tenant_id = p_tenant_id
      AND scope.source_binding_id = binding_id AND scope.capability_key = required_capability
      AND scope.active IS TRUE AND scope.company_id = p_company_id
      AND (scope.scope_level = 'company'
        OR (scope.scope_level = 'organization'
          AND scope.organization_unit_source_id = p_organization_unit_source_id)
        OR (scope.scope_level = 'sector'
          AND scope.organization_unit_source_id = p_organization_unit_source_id
          AND scope.sector_source_id = p_sector_source_id))
  ) INTO area_case;

  IF p_confidentiality = 'restricted' AND NOT (
    (self_case AND p_command IN ('create', 'read', 'update_draft', 'submit', 'cancel'))
    OR EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) effective
      WHERE effective.capability_key = CASE
        WHEN p_command IN ('approve', 'reject') OR (p_command = 'cancel' AND p_current_status = 'approved')
          THEN 'leave.request.restricted.decide'
        ELSE 'leave.request.restricted.read' END
    )
  ) THEN RETURN false; END IF;

  IF p_command = 'create' THEN
    RETURN (self_case AND EXISTS (SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
      WHERE e.capability_key = 'leave.request.self.create')) OR area_case
      OR EXISTS (SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
        WHERE e.capability_key = 'leave.request.all.manage');
  ELSIF p_command = 'read' THEN
    RETURN (self_case AND EXISTS (SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
      WHERE e.capability_key = 'leave.request.self.read')) OR area_case
      OR EXISTS (SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
        WHERE e.capability_key IN ('leave.request.all.manage', 'leave.request.all.read'))
      OR (p_current_status = 'approved' AND p_confidentiality = 'standard' AND EXISTS (
        SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
        WHERE e.capability_key = 'leave.request.payroll.read'));
  ELSIF p_command = 'update_draft' THEN
    RETURN p_current_status = 'draft' AND ((self_case AND EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
      WHERE e.capability_key = 'leave.request.self.update')) OR area_case
      OR EXISTS (SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
        WHERE e.capability_key = 'leave.request.all.manage'));
  ELSIF p_command = 'submit' THEN
    RETURN p_current_status = 'draft' AND ((self_case AND EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
      WHERE e.capability_key = 'leave.request.self.submit')) OR area_case
      OR EXISTS (SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
        WHERE e.capability_key = 'leave.request.all.manage'));
  ELSIF p_command IN ('approve', 'reject') THEN
    RETURN p_current_status = 'submitted' AND (area_case OR EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
      WHERE e.capability_key = 'leave.request.all.manage'));
  ELSIF p_command = 'cancel' THEN
    RETURN p_current_status IN ('draft', 'submitted', 'approved') AND (
      (p_current_status <> 'approved' AND self_case AND EXISTS (
        SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
        WHERE e.capability_key = 'leave.request.self.cancel')) OR area_case
      OR EXISTS (SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) e
        WHERE e.capability_key = 'leave.request.all.manage'));
  END IF;
  RETURN false;
END
$$;

DROP FUNCTION IF EXISTS action_center_apply_tenant_command(
  text, uuid, uuid, text, text, uuid, integer, uuid, text, jsonb,
  uuid, text, text, text, text, boolean
);
CREATE OR REPLACE FUNCTION action_center_apply_tenant_command(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
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
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor internal_users%ROWTYPE;
  membership tenant_membership%ROWTYPE;
  binding platform_tenant_source_binding%ROWTYPE;
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
  IF p_actor_session_id IS NULL OR p_actor_session_version IS NULL OR p_actor_session_version < 1 THEN
    RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF lower(COALESCE(p_release_sha, '')) !~ '^[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'ACTION_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
  END IF;
  IF p_case_type <> 'leave_request'
     OR p_command NOT IN ('create', 'update_draft', 'submit', 'approve', 'reject', 'cancel')
     OR p_idempotency_key IS NULL OR p_command_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT actor_row.* INTO actor
  FROM tenant_identity_session session
  JOIN internal_users actor_row
    ON lower(actor_row.email) = lower(session.user_email)
   AND actor_row.active IS TRUE
   AND actor_row.identity_version = session.identity_version
  WHERE session.id = p_actor_session_id
    AND session.session_version = p_actor_session_version
    AND lower(session.user_email) = lower(btrim(p_actor_email))
    AND session.source = 'membership'
    AND session.active_tenant_id = p_tenant_id
    AND session.auth_level IN ('mfa', 'recovery')
    AND session.status = 'active'
    AND session.expires_at > now()
    AND session.last_seen_at > now() - interval '1 hour'
  FOR SHARE OF session, actor_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO membership FROM tenant_membership membership_row
  WHERE membership_row.id = p_membership_id AND membership_row.tenant_id = p_tenant_id
    AND lower(membership_row.user_email) = lower(btrim(p_actor_email))
    AND membership_row.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM platform_tenant tenant
  WHERE tenant.id = membership.tenant_id AND tenant.status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT source.* INTO binding
  FROM tenant_identity_policy policy
  JOIN platform_tenant_source_binding source
    ON source.id = policy.certified_source_binding_id AND source.tenant_id = policy.tenant_id
  WHERE policy.tenant_id = membership.tenant_id AND policy.tenant_data_plane_ready IS TRUE
    AND policy.certified_release_sha = lower(p_release_sha)
    AND source.source_system = 'GRH' AND source.verified IS TRUE
  FOR SHARE OF policy, source;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    lower(actor.email) || ':' || p_tenant_id::text || ':' || p_idempotency_key::text, 0
  ));
  PERFORM 1 FROM tenant_action_authority authority
  WHERE authority.membership_id = membership.id
    AND authority.tenant_id = membership.tenant_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  SELECT link.employment_contract_id, actor_contract.person_id
  INTO actor_contract_snapshot_id, actor_person_snapshot_id
  FROM tenant_action_employment_link link
  JOIN employment_contract actor_contract
    ON actor_contract.id = link.employment_contract_id
   AND actor_contract.status = 'active'
   AND actor_contract.source_system = 'GRH'
   AND actor_contract.legacy_company_id = binding.source_company_id
  JOIN source_import_batch actor_batch
    ON actor_batch.id = actor_contract.source_batch_id
   AND actor_batch.source_system = 'GRH'
   AND actor_batch.source_database = binding.source_database
   AND actor_batch.validation_state = 'published'
  WHERE link.membership_id = membership.id AND link.tenant_id = membership.tenant_id
    AND link.source_binding_id = binding.id AND link.active IS TRUE
  FOR SHARE OF link, actor_contract;
  IF actor_person_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  PERFORM tenant_iam_assert_no_sod_conflict(membership.id);
  SELECT * INTO existing_event FROM action_case_event
  WHERE lower(actor_user_email) = lower(actor.email) AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.command_hash <> p_command_hash
       OR existing_event.case_type <> p_case_type
       OR existing_event.tenant_id <> p_tenant_id
       OR existing_event.source_binding_id <> binding.id
       OR existing_event.actor_membership_id <> membership.id
       OR existing_event.metadata->>'tenantId' <> p_tenant_id::text
       OR existing_event.metadata->>'sourceBindingId' <> binding.id::text
       OR existing_event.metadata->>'membershipId' <> membership.id::text
       OR existing_event.metadata->>'actorSessionId' <> p_actor_session_id::text
       OR existing_event.metadata->>'actorSessionVersion' <> p_actor_session_version::text
       OR existing_event.metadata->>'releaseSha' <> lower(p_release_sha)
       OR (p_case_id IS NOT NULL AND existing_event.case_id <> p_case_id) THEN
      RAISE EXCEPTION 'ACTION_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_case FROM action_case
    WHERE id = existing_event.case_id AND tenant_id = p_tenant_id AND source_binding_id = binding.id;
    IF NOT FOUND OR existing_event.actor_person_id IS DISTINCT FROM actor_person_snapshot_id
       OR NOT action_center_tenant_actor_authorized(
         actor.email, p_tenant_id, membership.id, p_command,
         current_case.beneficiary_contract_id, current_case.company_id,
         current_case.organization_unit_source_id, current_case.sector_source_id,
         COALESCE(existing_event.from_status, 'draft'), current_case.confidentiality
       ) THEN RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF (p_command IN ('approve', 'reject')
        OR (p_command = 'cancel' AND existing_event.from_status = 'approved')) AND (
      actor_person_snapshot_id IS NULL
      OR lower(actor.email) IN (lower(current_case.created_by_user_email), lower(current_case.submitted_by_user_email))
      OR EXISTS (
        SELECT 1 FROM action_case_event preparation_event
        WHERE preparation_event.case_id = current_case.id
          AND preparation_event.tenant_id = p_tenant_id
          AND preparation_event.source_binding_id = binding.id
          AND preparation_event.event_type IN ('created', 'draft_updated', 'submitted')
          AND (preparation_event.actor_person_id IS NULL
            OR preparation_event.actor_person_id = actor_person_snapshot_id)
      ) OR EXISTS (
        SELECT 1 FROM employment_contract beneficiary_contract
        WHERE beneficiary_contract.id = current_case.beneficiary_contract_id
          AND beneficiary_contract.person_id = actor_person_snapshot_id
      )
    ) THEN RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
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
    SELECT contract_row.* INTO contract
    FROM employment_contract contract_row
    JOIN source_import_batch batch
      ON batch.id = contract_row.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
    WHERE contract_row.id = p_beneficiary_contract_id
      AND contract_row.status = 'active'
      AND contract_row.source_system = 'GRH'
      AND contract_row.legacy_company_id = binding.source_company_id;
    IF NOT FOUND OR NOT action_center_tenant_actor_authorized(
      actor.email, p_tenant_id, membership.id, p_command,
      contract.id, contract.legacy_company_id,
      contract.organization_unit_source_id, contract.sector_source_id,
      'draft', p_confidentiality
    ) THEN RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    next_status := 'draft';
    next_event := 'created';
    event_metadata := jsonb_build_object(
      'command', p_command, 'tenantId', p_tenant_id,
      'sourceBindingId', binding.id, 'membershipId', membership.id,
      'actorSessionId', p_actor_session_id,
      'actorSessionVersion', p_actor_session_version,
      'releaseSha', lower(p_release_sha),
      'reasonPresent', false, 'evidenceStatus', NULL, 'manualValidationConfirmed', false
    );
    PERFORM action_center_set_tenant_command_context(
      actor.email, membership.role_key, membership.id, p_tenant_id, binding.id,
      actor_contract_snapshot_id, actor_person_snapshot_id, next_event,
      p_idempotency_key, p_command_hash, event_metadata
    );
    INSERT INTO action_case (
      tenant_id, source_binding_id, case_type, beneficiary_contract_id, source_batch_id,
      company_id, organization_unit_source_id, sector_source_id,
      policy_version_id, confidentiality, payload, created_by_user_email
    ) VALUES (
      p_tenant_id, binding.id, p_case_type, contract.id, contract.source_batch_id,
      contract.legacy_company_id, contract.organization_unit_source_id, contract.sector_source_id,
      p_policy_version_id, p_confidentiality, p_payload, actor.email
    ) RETURNING * INTO current_case;
  ELSE
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
      RAISE EXCEPTION 'ACTION_VERSION_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_case FROM action_case
    WHERE id = p_case_id AND tenant_id = p_tenant_id AND source_binding_id = binding.id
    FOR UPDATE;
    IF NOT FOUND OR current_case.case_type <> p_case_type
       OR NOT action_center_tenant_actor_authorized(
         actor.email, p_tenant_id, membership.id, 'read',
         current_case.beneficiary_contract_id, current_case.company_id,
         current_case.organization_unit_source_id, current_case.sector_source_id,
         current_case.status, current_case.confidentiality
       ) THEN RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF current_case.version <> p_expected_version THEN
      RAISE EXCEPTION 'ACTION_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF NOT action_center_tenant_actor_authorized(
      actor.email, p_tenant_id, membership.id, p_command,
      current_case.beneficiary_contract_id, current_case.company_id,
      current_case.organization_unit_source_id, current_case.sector_source_id,
      current_case.status, CASE WHEN p_command = 'update_draft'
        THEN COALESCE(p_confidentiality, current_case.confidentiality)
        ELSE current_case.confidentiality END
    ) THEN RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    previous_status := current_case.status;
    event_metadata := jsonb_build_object(
      'command', p_command, 'tenantId', p_tenant_id,
      'sourceBindingId', binding.id, 'membershipId', membership.id,
      'actorSessionId', p_actor_session_id,
      'actorSessionVersion', p_actor_session_version,
      'releaseSha', lower(p_release_sha),
      'reasonPresent', p_reason IS NOT NULL AND length(btrim(p_reason)) > 0,
      'evidenceStatus', p_evidence_status,
      'manualValidationConfirmed', COALESCE(p_manual_validation_confirmed, false)
    );

    IF p_command = 'update_draft' THEN
      IF current_case.status <> 'draft' OR p_payload IS NULL THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'draft'; next_event := 'draft_updated';
      PERFORM action_center_set_tenant_command_context(
        actor.email, membership.role_key, membership.id, p_tenant_id, binding.id,
        actor_contract_snapshot_id, actor_person_snapshot_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case SET payload = p_payload, policy_version_id = p_policy_version_id,
        confidentiality = p_confidentiality, version = version + 1
      WHERE id = current_case.id RETURNING * INTO current_case;
    ELSIF p_command = 'submit' THEN
      IF current_case.status <> 'draft' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'submitted'; next_event := 'submitted';
      PERFORM action_center_set_tenant_command_context(
        actor.email, membership.role_key, membership.id, p_tenant_id, binding.id,
        actor_contract_snapshot_id, actor_person_snapshot_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case SET status = 'submitted', submitted_by_user_email = actor.email,
        submitted_at = now(), version = version + 1
      WHERE id = current_case.id RETURNING * INTO current_case;
    ELSIF p_command IN ('approve', 'reject') THEN
      IF current_case.status <> 'submitted' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      IF actor_person_snapshot_id IS NULL
         OR lower(actor.email) IN (lower(current_case.created_by_user_email), lower(current_case.submitted_by_user_email))
         OR EXISTS (
           SELECT 1 FROM action_case_event preparation_event
           WHERE preparation_event.case_id = current_case.id
             AND preparation_event.tenant_id = p_tenant_id
             AND preparation_event.source_binding_id = binding.id
             AND preparation_event.event_type IN ('created', 'draft_updated', 'submitted')
             AND (preparation_event.actor_person_id IS NULL
               OR preparation_event.actor_person_id = actor_person_snapshot_id)
         ) OR EXISTS (
           SELECT 1 FROM employment_contract beneficiary_contract
           WHERE beneficiary_contract.id = current_case.beneficiary_contract_id
             AND beneficiary_contract.person_id = actor_person_snapshot_id
         ) THEN RAISE EXCEPTION 'ACTION_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001'; END IF;
      IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'ACTION_DECISION_REASON_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      IF p_command = 'approve' AND (
        p_manual_validation_confirmed IS DISTINCT FROM true
        OR p_evidence_status NOT IN ('verified', 'not_required')
        OR (current_case.confidentiality = 'restricted' AND p_evidence_status <> 'verified')
      ) THEN RAISE EXCEPTION 'ACTION_MANUAL_VALIDATION_REQUIRED' USING ERRCODE = 'P0001'; END IF;
      next_status := CASE WHEN p_command = 'approve' THEN 'approved' ELSE 'rejected' END;
      next_event := next_status;
      PERFORM action_center_set_tenant_command_context(
        actor.email, membership.role_key, membership.id, p_tenant_id, binding.id,
        actor_contract_snapshot_id, actor_person_snapshot_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case SET status = next_status, decided_by_user_email = actor.email,
        decided_at = now(), decision_reason = btrim(p_reason),
        evidence_status = COALESCE(p_evidence_status, evidence_status),
        manual_validation_confirmed = COALESCE(p_manual_validation_confirmed, false),
        version = version + 1
      WHERE id = current_case.id RETURNING * INTO current_case;
    ELSIF p_command = 'cancel' THEN
      IF current_case.status NOT IN ('draft', 'submitted', 'approved') THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      IF current_case.status = 'approved' AND (
        actor_person_snapshot_id IS NULL
        OR lower(actor.email) IN (lower(current_case.created_by_user_email), lower(current_case.submitted_by_user_email))
        OR EXISTS (
          SELECT 1 FROM action_case_event preparation_event
          WHERE preparation_event.case_id = current_case.id
            AND preparation_event.tenant_id = p_tenant_id
            AND preparation_event.source_binding_id = binding.id
            AND preparation_event.event_type IN ('created', 'draft_updated', 'submitted')
            AND (preparation_event.actor_person_id IS NULL
              OR preparation_event.actor_person_id = actor_person_snapshot_id)
        ) OR EXISTS (
          SELECT 1 FROM employment_contract beneficiary_contract
          WHERE beneficiary_contract.id = current_case.beneficiary_contract_id
            AND beneficiary_contract.person_id = actor_person_snapshot_id
        )
      ) THEN RAISE EXCEPTION 'ACTION_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001'; END IF;
      IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
        RAISE EXCEPTION 'ACTION_CANCELLATION_REASON_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'cancelled'; next_event := 'cancelled';
      PERFORM action_center_set_tenant_command_context(
        actor.email, membership.role_key, membership.id, p_tenant_id, binding.id,
        actor_contract_snapshot_id, actor_person_snapshot_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case SET status = 'cancelled', cancelled_by_user_email = actor.email,
        cancelled_at = now(), cancellation_reason = btrim(p_reason), version = version + 1
      WHERE id = current_case.id RETURNING * INTO current_case;
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

CREATE OR REPLACE FUNCTION tenant_action_authority_snapshot(p_membership_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'version', authority.version,
    'employmentLink', COALESCE((
      SELECT jsonb_build_object(
        'sourceBindingId', link.source_binding_id,
        'employmentContractId', link.employment_contract_id,
        'active', link.active
      ) FROM tenant_action_employment_link link
      WHERE link.membership_id = authority.membership_id
    ), 'null'::jsonb),
    'scopes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', scope.id, 'capabilityKey', scope.capability_key,
        'sourceBindingId', scope.source_binding_id, 'scopeLevel', scope.scope_level,
        'organizationUnitSourceId', scope.organization_unit_source_id,
        'sectorSourceId', scope.sector_source_id, 'active', scope.active
      ) ORDER BY scope.capability_key, scope.scope_level, scope.id)
      FROM tenant_action_area_scope scope
      WHERE scope.membership_id = authority.membership_id AND scope.active IS TRUE
    ), '[]'::jsonb)
  ) FROM tenant_action_authority authority WHERE authority.membership_id = p_membership_id
$$;

CREATE OR REPLACE FUNCTION tenant_action_membership_configured_capabilities(p_membership_id uuid)
RETURNS TABLE (capability_key varchar(96))
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH membership_row AS (
    SELECT membership.role_key FROM tenant_membership membership
    JOIN iam_role role_row ON role_row.role_key = membership.role_key AND role_row.scope_kind = 'tenant'
    WHERE membership.id = p_membership_id
  ), grants AS (
    SELECT mapping.capability_key FROM membership_row
    JOIN iam_role_capability mapping ON mapping.role_key = membership_row.role_key
    JOIN iam_capability capability ON capability.capability_key = mapping.capability_key
      AND capability.scope_kind = 'tenant'
    UNION
    SELECT override_row.capability_key FROM tenant_membership_capability_override override_row
    JOIN iam_capability capability ON capability.capability_key = override_row.capability_key
      AND capability.scope_kind = 'tenant'
    WHERE override_row.membership_id = p_membership_id AND override_row.allow_override IS TRUE
  )
  SELECT grants.capability_key FROM grants
  WHERE NOT EXISTS (
    SELECT 1 FROM tenant_membership_capability_override denied
    WHERE denied.membership_id = p_membership_id
      AND denied.capability_key = grants.capability_key AND denied.deny_override IS TRUE
  )
$$;

CREATE OR REPLACE FUNCTION tenant_action_apply_provisioning_command(
  p_actor_email text,
  p_actor_session_id uuid,
  p_tenant_id uuid,
  p_membership_id uuid,
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
  membership tenant_membership%ROWTYPE;
  authority tenant_action_authority%ROWTYPE;
  existing_event tenant_action_authority_event%ROWTYPE;
  binding platform_tenant_source_binding%ROWTYPE;
  before_value jsonb;
  after_value jsonb;
  result_value jsonb;
  reason_code text;
  reason_value text;
  reason_hash_value text;
  scope_value jsonb;
  scope_level_value text;
  capability_value text;
  binding_id_value uuid;
  organization_value text;
  sector_value text;
  contract_id_value uuid;
BEGIN
  IF p_command NOT IN ('link_employment', 'revoke_employment_link', 'replace_action_scopes')
     OR p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_command_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1 FROM tenant_identity_session session
  JOIN internal_users users
    ON lower(users.email) = lower(session.user_email)
   AND users.active IS TRUE AND users.identity_version = session.identity_version
  WHERE session.id = p_actor_session_id AND lower(session.user_email) = actor_email
    AND session.status = 'active' AND session.active_tenant_id IS NULL
    AND session.auth_level IN ('mfa', 'recovery')
    AND session.expires_at > now() AND session.last_seen_at > now() - interval '1 hour'
  FOR SHARE OF session, users;
  IF NOT FOUND OR NOT tenant_iam_is_platform_owner(actor_email) THEN
    RAISE EXCEPTION 'TENANT_ACTION_PLATFORM_CONTEXT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO membership FROM tenant_membership membership_row
  WHERE membership_row.id = p_membership_id AND membership_row.tenant_id = p_tenant_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_MEMBERSHIP_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor_email || ':' || p_tenant_id::text || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO existing_event FROM tenant_action_authority_event
  WHERE actor_user_email = actor_email AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.command_hash <> p_command_hash OR existing_event.command <> p_command
       OR existing_event.tenant_id <> p_tenant_id OR existing_event.membership_id <> p_membership_id
       OR existing_event.expected_version <> p_expected_version THEN
      RAISE EXCEPTION 'TENANT_ACTION_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN existing_event.result || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO authority FROM tenant_action_authority authority_row
  WHERE authority_row.membership_id = membership.id AND authority_row.tenant_id = membership.tenant_id
  FOR UPDATE;
  IF NOT FOUND OR authority.version <> p_expected_version THEN
    RAISE EXCEPTION 'TENANT_ACTION_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  reason_code := p_payload->>'reasonCode';
  reason_value := NULLIF(btrim(p_payload->>'reason'), '');
  IF reason_code NOT IN ('onboarding', 'role_change', 'employment_change', 'scope_change', 'offboarding', 'correction')
     OR reason_value IS NULL OR length(reason_value) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'TENANT_ACTION_REASON_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  reason_hash_value := encode(digest(convert_to(reason_value, 'UTF8'), 'sha256'), 'hex');
  before_value := tenant_action_authority_snapshot(membership.id);

  IF p_command = 'link_employment' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) AS field(name)
      WHERE field.name NOT IN ('sourceBindingId', 'employmentContractId', 'reasonCode', 'reason')) THEN
      RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
    END IF;
    binding_id_value := (p_payload->>'sourceBindingId')::uuid;
    contract_id_value := (p_payload->>'employmentContractId')::uuid;
    SELECT source.* INTO binding FROM tenant_identity_policy policy
    JOIN platform_tenant_source_binding source
      ON source.id = policy.certified_source_binding_id AND source.tenant_id = policy.tenant_id
    WHERE policy.tenant_id = membership.tenant_id AND source.id = binding_id_value
      AND source.source_system = 'GRH' AND source.verified IS TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO tenant_action_employment_link (
      membership_id, tenant_id, source_binding_id, employment_contract_id,
      active, linked_by_user_email, linked_at, revoked_at, updated_at
    ) VALUES (
      membership.id, membership.tenant_id, binding.id, contract_id_value,
      true, actor_email, now(), NULL, now()
    ) ON CONFLICT (membership_id) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id, source_binding_id = EXCLUDED.source_binding_id,
      employment_contract_id = EXCLUDED.employment_contract_id, active = true,
      linked_by_user_email = EXCLUDED.linked_by_user_email, linked_at = now(),
      revoked_at = NULL, updated_at = now();
  ELSIF p_command = 'revoke_employment_link' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) AS field(name)
      WHERE field.name NOT IN ('reasonCode', 'reason')) THEN
      RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE tenant_action_employment_link SET active = false, revoked_at = now(), updated_at = now()
    WHERE membership_id = membership.id AND tenant_id = membership.tenant_id AND active IS TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_LINK_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) AS field(name)
      WHERE field.name NOT IN ('scopes', 'reasonCode', 'reason'))
       OR jsonb_typeof(p_payload->'scopes') <> 'array'
       OR jsonb_array_length(p_payload->'scopes') > 50 THEN
      RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE tenant_action_area_scope SET active = false, revoked_at = now(), updated_at = now()
    WHERE membership_id = membership.id AND active IS TRUE;
    FOR scope_value IN SELECT value FROM jsonb_array_elements(p_payload->'scopes') LOOP
      IF jsonb_typeof(scope_value) <> 'object' OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(scope_value) AS field(name)
        WHERE field.name NOT IN ('capabilityKey', 'sourceBindingId', 'scopeLevel',
          'organizationUnitSourceId', 'sectorSourceId')
      ) THEN RAISE EXCEPTION 'TENANT_ACTION_SCOPE_INVALID' USING ERRCODE = 'P0001'; END IF;
      capability_value := scope_value->>'capabilityKey';
      binding_id_value := (scope_value->>'sourceBindingId')::uuid;
      scope_level_value := scope_value->>'scopeLevel';
      organization_value := NULLIF(btrim(scope_value->>'organizationUnitSourceId'), '');
      sector_value := NULLIF(btrim(scope_value->>'sectorSourceId'), '');
      SELECT source.* INTO binding FROM tenant_identity_policy policy
      JOIN platform_tenant_source_binding source
        ON source.id = policy.certified_source_binding_id AND source.tenant_id = policy.tenant_id
      WHERE policy.tenant_id = membership.tenant_id AND source.id = binding_id_value
        AND source.source_system = 'GRH' AND source.verified IS TRUE;
      IF NOT FOUND OR capability_value NOT LIKE 'leave.request.area.%'
         OR NOT EXISTS (SELECT 1 FROM tenant_action_membership_configured_capabilities(membership.id) configured
           WHERE configured.capability_key = capability_value)
         OR scope_level_value NOT IN ('company', 'organization', 'sector')
         OR (scope_level_value = 'company' AND (organization_value IS NOT NULL OR sector_value IS NOT NULL))
         OR (scope_level_value = 'organization' AND (organization_value IS NULL OR sector_value IS NOT NULL))
         OR (scope_level_value = 'sector' AND (organization_value IS NULL OR sector_value IS NULL)) THEN
        RAISE EXCEPTION 'TENANT_ACTION_SCOPE_INVALID' USING ERRCODE = 'P0001';
      END IF;
      INSERT INTO tenant_action_area_scope (
        membership_id, tenant_id, source_binding_id, capability_key, scope_level,
        company_id, organization_unit_source_id, sector_source_id,
        active, granted_by_user_email, granted_at, revoked_at, updated_at
      ) VALUES (
        membership.id, membership.tenant_id, binding.id, capability_value, scope_level_value,
        binding.source_company_id, organization_value, sector_value,
        true, actor_email, now(), NULL, now()
      ) ON CONFLICT (
        membership_id, capability_key, source_binding_id, scope_level,
        (COALESCE(organization_unit_source_id, '')), (COALESCE(sector_source_id, ''))
      ) DO UPDATE SET active = true, granted_by_user_email = EXCLUDED.granted_by_user_email,
        granted_at = now(), revoked_at = NULL, updated_at = now();
    END LOOP;
  END IF;

  UPDATE tenant_action_authority SET version = version + 1, updated_at = now()
  WHERE membership_id = membership.id RETURNING * INTO authority;
  after_value := tenant_action_authority_snapshot(membership.id);
  result_value := jsonb_build_object(
    'ok', true, 'tenantId', membership.tenant_id, 'membershipId', membership.id,
    'command', p_command, 'version', authority.version,
    'before', before_value, 'after', after_value, 'replayed', false
  );
  INSERT INTO tenant_action_authority_event (
    actor_user_email, actor_session_id, tenant_id, membership_id,
    command, target_type, target_id, idempotency_key, command_hash,
    expected_version, resulting_version, reason_code, reason_hash,
    before_snapshot, after_snapshot, result
  ) VALUES (
    actor_email, p_actor_session_id, membership.tenant_id, membership.id,
    p_command, 'tenant_action_authority', membership.id::text,
    p_idempotency_key, p_command_hash, p_expected_version, authority.version,
    reason_code, reason_hash_value, before_value, after_value, result_value
  );
  RETURN result_value;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION tenant_action_assert_exclusive_capability(
  p_actor_email text, p_tenant_id uuid, p_membership_id uuid, p_capability_key text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE assignment tenant_exclusive_capability%ROWTYPE;
BEGIN
  IF p_capability_key <> 'time.overtime.enter' THEN
    RAISE EXCEPTION 'TENANT_ACTION_EXCLUSIVE_CAPABILITY_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_capability_key, 0));
  PERFORM 1 FROM tenant_membership membership
  JOIN internal_users users ON lower(users.email) = lower(membership.user_email) AND users.active IS TRUE
  JOIN platform_tenant tenant ON tenant.id = membership.tenant_id AND tenant.status = 'active'
  WHERE membership.id = p_membership_id AND membership.tenant_id = p_tenant_id
    AND lower(membership.user_email) = lower(btrim(p_actor_email)) AND membership.status = 'active'
  FOR SHARE OF membership, users, tenant;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) effective
    WHERE effective.capability_key = p_capability_key
  ) THEN RAISE EXCEPTION 'TENANT_ACTION_EXCLUSIVE_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO assignment FROM tenant_exclusive_capability exclusive_row
  WHERE exclusive_row.tenant_id = p_tenant_id
    AND exclusive_row.capability_key = p_capability_key
    AND exclusive_row.membership_id = p_membership_id
    AND exclusive_row.active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_EXCLUSIVE_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object(
    'authorized', true, 'tenantId', p_tenant_id, 'membershipId', p_membership_id,
    'capabilityKey', p_capability_key, 'assignmentId', assignment.id
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_iam_assert_platform_session_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_actor_session_id IS NULL OR p_actor_session_version IS NULL OR p_actor_session_version < 1 THEN
    RAISE EXCEPTION 'TENANT_IAM_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM 1
  FROM tenant_identity_session session
  JOIN internal_users users
    ON lower(users.email) = lower(session.user_email)
   AND users.active IS TRUE
   AND users.identity_version = session.identity_version
  JOIN platform_user_role assignment
    ON lower(assignment.user_email) = lower(users.email)
   AND assignment.role_key = 'PLATFORM_OWNER'
   AND assignment.active IS TRUE
  WHERE session.id = p_actor_session_id
    AND session.session_version = p_actor_session_version
    AND lower(session.user_email) = lower(btrim(p_actor_email))
    AND session.source = 'platform'
    AND session.active_tenant_id IS NULL
    AND session.auth_level IN ('mfa', 'recovery')
    AND session.status = 'active'
    AND session.expires_at > now()
    AND session.last_seen_at > now() - interval '1 hour'
  FOR SHARE OF session, users, assignment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_IAM_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION tenant_iam_admin_view_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_resource text,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM tenant_iam_assert_platform_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version
  );
  RETURN tenant_iam_admin_view(p_actor_email, p_resource, p_limit);
END
$$;

CREATE OR REPLACE FUNCTION tenant_iam_apply_command_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_command text,
  p_idempotency_key uuid,
  p_command_hash text,
  p_expected_version integer,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_membership tenant_membership%ROWTYPE;
BEGIN
  PERFORM tenant_iam_assert_platform_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version
  );

  IF p_command IN ('update_access', 'suspend_membership', 'assign_exclusive_capability')
     AND jsonb_typeof(p_payload) = 'object'
     AND COALESCE(p_payload->>'membershipId', '')
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT * INTO target_membership
    FROM tenant_membership membership
    WHERE membership.id = (p_payload->>'membershipId')::uuid
    FOR UPDATE;
    IF FOUND THEN
      PERFORM 1 FROM tenant_action_authority authority
      WHERE authority.membership_id = target_membership.id
        AND authority.tenant_id = target_membership.tenant_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'TENANT_ACTION_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN tenant_iam_apply_command(
    p_actor_email, p_command, p_idempotency_key, p_command_hash,
    p_expected_version, p_payload
  );
END
$$;

COMMENT ON TABLE tenant_action_authority IS
  'Version optimista de vinculos y alcances operativos tenant-owned por membresia.';
COMMENT ON TABLE tenant_action_employment_link IS
  'Vinculo usuario-legajo por membresia y binding GRH certificado; reemplaza la autoridad global por email.';
COMMENT ON TABLE tenant_action_area_scope IS
  'Alcance tenant-owned por capability exacta; leer nunca habilita crear o decidir.';
COMMENT ON TABLE tenant_action_authority_event IS
  'Auditoria append-only de provisioning platform; reason libre se conserva solo como SHA-256.';
COMMENT ON COLUMN action_case.tenant_id IS
  'Snapshot inmutable del tenant que posee el caso.';
COMMENT ON COLUMN action_case.source_binding_id IS
  'Snapshot inmutable del binding GRH certificado usado al crear el caso.';
COMMENT ON COLUMN action_case_event.actor_membership_id IS
  'Snapshot inmutable de la membresia operativa del actor; platform roles no son autoridad.';
COMMENT ON FUNCTION tenant_action_assert_exclusive_capability(text, uuid, uuid, text) IS
  'Gate transaccional futuro. No tiene EXECUTE runtime en 006A y no habilita carga de mayor esfuerzo.';
COMMENT ON FUNCTION tenant_iam_admin_view_v2(text, uuid, integer, text, integer) IS
  'Facade de control plane ligada a una sesion v2 platform MFA activa; la firma email-only queda interna.';
COMMENT ON FUNCTION tenant_iam_apply_command_v2(text, uuid, integer, text, uuid, text, integer, jsonb) IS
  'Facade de mutacion ligada a sesion v2 y serializada con tenant_action_authority para revocaciones.';

REVOKE ALL ON TABLE
  tenant_action_authority, tenant_action_employment_link, tenant_action_area_scope,
  tenant_action_authority_event
FROM PUBLIC;
REVOKE ALL ON SEQUENCE tenant_action_authority_event_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_is_platform_owner(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_effective_capabilities(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_assert_no_sod_conflict(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_reject_audit_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_initialize_authority() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_validate_binding() FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_set_tenant_command_context(
  text, text, uuid, uuid, uuid, uuid, uuid, text, uuid, text, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_resolve_tenant_principal(text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_tenant_actor_authorized(
  text, uuid, uuid, text, uuid, bigint, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_apply_tenant_command(
  text, uuid, integer, text, uuid, uuid, text, text, uuid, integer, uuid, text, jsonb,
  uuid, text, text, text, text, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_authority_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_membership_configured_capabilities(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_apply_provisioning_command(
  text, uuid, uuid, uuid, text, uuid, text, integer, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_assert_exclusive_capability(text, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_admin_view(text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_apply_command(text, text, uuid, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_assert_platform_session_v2(text, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_admin_view_v2(text, uuid, integer, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_apply_command_v2(
  text, uuid, integer, text, uuid, text, integer, jsonb
) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON TABLE
  tenant_action_authority, tenant_action_employment_link, tenant_action_area_scope,
  tenant_action_authority_event
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON SEQUENCE tenant_action_authority_event_id_seq
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_apply_command(
  text, text, text, uuid, integer, uuid, text, jsonb, uuid, text, text, text, text, boolean
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_is_platform_owner(text)
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_assert_no_sod_conflict(uuid)
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_action_assert_exclusive_capability(text, uuid, uuid, text)
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_resolve_tenant_principal(text, uuid, uuid)
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_apply_tenant_command(
  text, uuid, integer, text, uuid, uuid, text, text, uuid, integer, uuid, text, jsonb,
  uuid, text, text, text, text, boolean
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_action_apply_provisioning_command(
  text, uuid, uuid, uuid, text, uuid, text, integer, jsonb
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_admin_view(text, text, integer)
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_apply_command(text, text, uuid, text, integer, jsonb)
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_assert_platform_session_v2(text, uuid, integer)
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_admin_view_v2(text, uuid, integer, text, integer)
FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_apply_command_v2(
  text, uuid, integer, text, uuid, text, integer, jsonb
) FROM municontrol_actions_runtime_app;

-- El runtime conserva lecturas de columnas preexistentes usadas por consultas
-- parametrizadas, pero pierde toda lectura de autoridad global por email.
REVOKE SELECT (email, display_name, role, active)
  ON TABLE internal_users FROM municontrol_actions_runtime_app;
REVOKE SELECT (user_email, employment_contract_id, active)
  ON TABLE internal_user_employment_link FROM municontrol_actions_runtime_app;
REVOKE SELECT (
  user_email, scope_level, company_id,
  organization_unit_source_id, sector_source_id, active
) ON TABLE internal_user_area_scope FROM municontrol_actions_runtime_app;

GRANT SELECT (tenant_id, source_binding_id)
  ON TABLE action_case TO municontrol_actions_runtime_app;
GRANT SELECT (tenant_id, source_binding_id)
  ON TABLE action_case_event TO municontrol_actions_runtime_app;
GRANT SELECT (source_system, source_batch_id)
  ON TABLE employment_contract TO municontrol_actions_runtime_app;
GRANT SELECT (source_database)
  ON TABLE source_import_batch TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_resolve_tenant_principal(text, uuid, uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_apply_tenant_command(
  text, uuid, integer, text, uuid, uuid, text, text, uuid, integer, uuid, text, jsonb,
  uuid, text, text, text, text, boolean
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_action_apply_provisioning_command(
  text, uuid, uuid, uuid, text, uuid, text, integer, jsonb
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_iam_admin_view_v2(text, uuid, integer, text, integer)
TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_iam_apply_command_v2(
  text, uuid, integer, text, uuid, text, integer, jsonb
) TO municontrol_actions_runtime_app;
