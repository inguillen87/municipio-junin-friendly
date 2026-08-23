-- MuniControl Friendly - Sprint 009A
-- Ciclo de vida tenant/identidad y provisioning laboral gobernado.
-- 004-008 son prerequisitos inmutables; esta migracion es upgrade-safe y fail-closed.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tenant_exclusive_capability assignment
    JOIN tenant_membership membership ON membership.id = assignment.membership_id
    WHERE assignment.tenant_id <> membership.tenant_id
  ) THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_EXCLUSIVE_TENANT_DRIFT' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM tenant_action_employment_link link
    JOIN tenant_membership membership ON membership.id = link.membership_id
    WHERE link.tenant_id <> membership.tenant_id
  ) THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_EMPLOYMENT_TENANT_DRIFT' USING ERRCODE = 'P0001';
  END IF;
END
$$;

INSERT INTO tenant_identity_policy (
  tenant_id, tenant_data_plane_ready, invitation_delivery_ready,
  certified_source_binding_id, certified_release_sha,
  certified_by_user_email, certified_at, version
)
SELECT tenant.id, false, false, NULL, NULL, NULL, NULL, 1
FROM platform_tenant tenant
LEFT JOIN tenant_identity_policy policy ON policy.tenant_id = tenant.id
WHERE policy.tenant_id IS NULL
ON CONFLICT (tenant_id) DO NOTHING;

CREATE OR REPLACE FUNCTION tenant_lifecycle_initialize_identity_policy_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO tenant_identity_policy (
    tenant_id, tenant_data_plane_ready, invitation_delivery_ready,
    certified_source_binding_id, certified_release_sha,
    certified_by_user_email, certified_at, version, updated_at
  ) VALUES (NEW.id, false, false, NULL, NULL, NULL, NULL, 1, now());
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS platform_tenant_initialize_identity_policy_v1 ON platform_tenant;
CREATE TRIGGER platform_tenant_initialize_identity_policy_v1
AFTER INSERT ON platform_tenant
FOR EACH ROW EXECUTE FUNCTION tenant_lifecycle_initialize_identity_policy_v1();

CREATE OR REPLACE FUNCTION tenant_lifecycle_enrich_create_tenant_event_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE policy tenant_identity_policy%ROWTYPE;
BEGIN
  IF NEW.command = 'create_tenant' THEN
    IF NEW.tenant_id IS NULL OR NEW.target_type <> 'tenant'
       OR NEW.target_id IS DISTINCT FROM NEW.tenant_id::text THEN
      RAISE EXCEPTION 'TENANT_LIFECYCLE_CREATE_EVENT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO policy FROM tenant_identity_policy identity_policy
    WHERE identity_policy.tenant_id = NEW.tenant_id FOR SHARE;
    IF NOT FOUND OR policy.version <> 1 OR policy.tenant_data_plane_ready IS TRUE
       OR policy.invitation_delivery_ready IS TRUE
       OR policy.certified_source_binding_id IS NOT NULL
       OR policy.certified_release_sha IS NOT NULL
       OR policy.certified_by_user_email IS NOT NULL OR policy.certified_at IS NOT NULL THEN
      RAISE EXCEPTION 'TENANT_LIFECYCLE_POLICY_NOT_CLOSED' USING ERRCODE = 'P0001';
    END IF;
    NEW.result := NEW.result || jsonb_build_object('identityPolicy', jsonb_build_object(
      'version', 1, 'dataPlaneReady', false, 'invitationDeliveryReady', false
    ));
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_iam_event_enrich_create_tenant_v1 ON tenant_iam_event;
CREATE TRIGGER tenant_iam_event_enrich_create_tenant_v1
BEFORE INSERT ON tenant_iam_event
FOR EACH ROW EXECUTE FUNCTION tenant_lifecycle_enrich_create_tenant_event_v1();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM platform_tenant tenant
    LEFT JOIN tenant_identity_policy policy ON policy.tenant_id = tenant.id
    WHERE policy.tenant_id IS NULL
  ) THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_POLICY_BACKFILL_FAILED' USING ERRCODE = 'P0001';
  END IF;
END
$$;

ALTER TABLE tenant_exclusive_capability
  DROP CONSTRAINT IF EXISTS tenant_exclusive_capability_membership_tenant_fk;
ALTER TABLE tenant_exclusive_capability
  ADD CONSTRAINT tenant_exclusive_capability_membership_tenant_fk
  FOREIGN KEY (membership_id, tenant_id)
  REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT NOT VALID;
ALTER TABLE tenant_exclusive_capability
  VALIDATE CONSTRAINT tenant_exclusive_capability_membership_tenant_fk;

CREATE TABLE IF NOT EXISTS tenant_identity_platform_event_context (
  event_id bigint PRIMARY KEY
    REFERENCES tenant_iam_event(id) ON DELETE RESTRICT,
  actor_session_id uuid NOT NULL
    REFERENCES tenant_identity_session(id) ON DELETE RESTRICT,
  actor_session_version integer NOT NULL,
  release_sha char(40) NOT NULL,
  expected_version integer NOT NULL,
  command varchar(64) NOT NULL,
  command_hash char(64) NOT NULL,
  reason_code varchar(64),
  reason_hash char(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_identity_platform_event_context_session_version_ck
    CHECK (actor_session_version > 0),
  CONSTRAINT tenant_identity_platform_event_context_expected_version_ck
    CHECK (expected_version > 0),
  CONSTRAINT tenant_identity_platform_event_context_release_ck
    CHECK (release_sha ~ '^[a-f0-9]{40}$'),
  CONSTRAINT tenant_identity_platform_event_context_hash_ck
    CHECK (command_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT tenant_identity_platform_event_context_reason_ck CHECK (
    (reason_code IS NULL AND reason_hash IS NULL)
    OR (reason_code IN ('certify_data_plane','delivery_kill_switch')
      AND reason_hash ~ '^[a-f0-9]{64}$')
  )
);

DROP TRIGGER IF EXISTS tenant_identity_platform_event_context_append_only
  ON tenant_identity_platform_event_context;
CREATE TRIGGER tenant_identity_platform_event_context_append_only
BEFORE UPDATE OR DELETE ON tenant_identity_platform_event_context
FOR EACH ROW EXECUTE FUNCTION tenant_iam_reject_change();

ALTER TABLE tenant_action_authority_event
  ADD COLUMN IF NOT EXISTS actor_session_version integer,
  ADD COLUMN IF NOT EXISTS release_sha char(40);
ALTER TABLE tenant_action_authority_event
  DROP CONSTRAINT IF EXISTS tenant_action_authority_event_v2_context_ck;
ALTER TABLE tenant_action_authority_event
  ADD CONSTRAINT tenant_action_authority_event_v2_context_ck CHECK (
    (actor_session_version IS NULL AND release_sha IS NULL)
    OR (actor_session_version > 0 AND release_sha ~ '^[a-f0-9]{40}$')
  );

ALTER TABLE tenant_action_employment_link
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
ALTER TABLE tenant_action_employment_link ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE tenant_action_employment_link ALTER COLUMN id SET NOT NULL;

DO $$
DECLARE primary_columns text[];
BEGIN
  SELECT array_agg(attribute.attname ORDER BY key_column.ordinality)
    INTO primary_columns
  FROM pg_constraint constraint_row
  JOIN unnest(constraint_row.conkey) WITH ORDINALITY key_column(attnum, ordinality) ON true
  JOIN pg_attribute attribute
    ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key_column.attnum
  WHERE constraint_row.conrelid = 'public.tenant_action_employment_link'::regclass
    AND constraint_row.contype = 'p';
  IF primary_columns = ARRAY['membership_id']::text[] THEN
    ALTER TABLE tenant_action_employment_link DROP CONSTRAINT tenant_action_employment_link_pkey;
  ELSIF primary_columns IS NOT NULL AND primary_columns <> ARRAY['id']::text[] THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_EMPLOYMENT_PRIMARY_KEY_DRIFT' USING ERRCODE = 'P0001';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tenant_action_employment_link'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE tenant_action_employment_link
      ADD CONSTRAINT tenant_action_employment_link_pkey PRIMARY KEY (id);
  END IF;
END
$$;

ALTER TABLE tenant_action_employment_link
  DROP CONSTRAINT IF EXISTS tenant_action_employment_tenant_contract_uk;
DO $$
DECLARE
  index_name text;
  expected_columns text[];
  actual_columns text[];
  predicate_value text;
  index_row record;
BEGIN
  FOREACH index_name IN ARRAY ARRAY[
    'tenant_action_employment_active_membership_uk',
    'tenant_action_employment_active_contract_uk'
  ] LOOP
    expected_columns := CASE index_name
      WHEN 'tenant_action_employment_active_membership_uk' THEN ARRAY['membership_id']::text[]
      ELSE ARRAY['tenant_id','employment_contract_id']::text[] END;
    SELECT index_meta.*, index_meta.indrelid = 'public.tenant_action_employment_link'::regclass AS correct_table
      INTO index_row
    FROM pg_index index_meta
    JOIN pg_class relation ON relation.oid = index_meta.indexrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = index_name;
    IF FOUND THEN
      SELECT array_agg(attribute.attname ORDER BY key_column.ordinality)
        INTO actual_columns
      FROM unnest(index_row.indkey) WITH ORDINALITY key_column(attnum, ordinality)
      JOIN pg_attribute attribute ON attribute.attrelid = index_row.indrelid
        AND attribute.attnum = key_column.attnum
      WHERE key_column.ordinality <= index_row.indnkeyatts;
      predicate_value := regexp_replace(lower(COALESCE(
        pg_get_expr(index_row.indpred, index_row.indrelid, true), ''
      )), '\s+', '', 'g');
      IF index_row.correct_table IS NOT TRUE OR index_row.indisunique IS NOT TRUE
         OR index_row.indisvalid IS NOT TRUE OR index_row.indisready IS NOT TRUE
         OR actual_columns IS DISTINCT FROM expected_columns
         OR predicate_value NOT IN ('activeistrue','(activeistrue)') THEN
        RAISE EXCEPTION 'TENANT_LIFECYCLE_EMPLOYMENT_INDEX_DRIFT' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_action_employment_active_membership_uk
  ON tenant_action_employment_link(membership_id) WHERE active IS TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS tenant_action_employment_active_contract_uk
  ON tenant_action_employment_link(tenant_id, employment_contract_id) WHERE active IS TRUE;
CREATE INDEX IF NOT EXISTS tenant_action_employment_history_idx
  ON tenant_action_employment_link(membership_id, linked_at DESC, id);

CREATE OR REPLACE FUNCTION tenant_lifecycle_guard_employment_history_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.active IS FALSE THEN
    RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_HISTORY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['active','revoked_at','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['active','revoked_at','updated_at'])
     OR NEW.active IS NOT FALSE OR NEW.revoked_at IS NULL
     OR NEW.updated_at < OLD.updated_at THEN
    RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_HISTORY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_action_employment_history_guard_v1 ON tenant_action_employment_link;
CREATE TRIGGER tenant_action_employment_history_guard_v1
BEFORE UPDATE OR DELETE ON tenant_action_employment_link
FOR EACH ROW EXECUTE FUNCTION tenant_lifecycle_guard_employment_history_v1();

CREATE OR REPLACE FUNCTION tenant_lifecycle_guard_revoked_session_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'IDENTITY_SESSION_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'IDENTITY_SESSION_ID_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'revoked' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'IDENTITY_SESSION_REVOKED_TERMINAL' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'active' AND NEW.status = 'revoked' AND (
       (to_jsonb(NEW) - ARRAY['status','revoked_at','revoked_by_user_email','version'])
         IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','revoked_at','revoked_by_user_email','version'])
       OR NEW.version IS DISTINCT FROM OLD.version + 1
       OR NEW.revoked_at IS NULL
     ) THEN
    RAISE EXCEPTION 'IDENTITY_SESSION_REVOKE_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenant_identity_session_revoked_terminal_v1 ON tenant_identity_session;
CREATE TRIGGER tenant_identity_session_revoked_terminal_v1
BEFORE UPDATE OR DELETE ON tenant_identity_session
FOR EACH ROW EXECUTE FUNCTION tenant_lifecycle_guard_revoked_session_v1();

CREATE OR REPLACE FUNCTION tenant_action_validate_binding()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  binding_row platform_tenant_source_binding%ROWTYPE;
  row_payload jsonb;
BEGIN
  IF TG_TABLE_NAME NOT IN ('tenant_action_employment_link','tenant_action_area_scope') THEN
    RAISE EXCEPTION 'TENANT_ACTION_TRIGGER_TABLE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.active IS TRUE AND NEW.active IS FALSE THEN
    IF (to_jsonb(NEW) - ARRAY['active','revoked_at','updated_at'])
         IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['active','revoked_at','updated_at'])
       OR NEW.revoked_at IS NULL THEN
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
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  IF TG_TABLE_NAME = 'tenant_action_employment_link' AND (row_payload->>'active')::boolean IS TRUE THEN
    PERFORM 1 FROM employment_contract contract
    JOIN source_import_batch batch ON batch.id = contract.source_batch_id
      AND batch.source_system = 'GRH' AND batch.source_database = binding_row.source_database
      AND batch.validation_state = 'published' AND batch.legacy_import_run_id IS NOT NULL
    WHERE contract.id = (row_payload->>'employment_contract_id')::uuid
      AND contract.status = 'active' AND contract.source_system = 'GRH'
      AND contract.legacy_company_id = binding_row.source_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_OUT_OF_SCOPE' USING ERRCODE = 'P0001'; END IF;
  ELSIF TG_TABLE_NAME = 'tenant_action_area_scope' AND (row_payload->>'active')::boolean IS TRUE
    AND (row_payload->>'company_id')::bigint IS DISTINCT FROM binding_row.source_company_id THEN
    RAISE EXCEPTION 'TENANT_ACTION_SCOPE_OUT_OF_BINDING' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION tenant_action_authority_snapshot(p_membership_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'version', authority.version,
    'employmentLink', COALESCE((
      SELECT jsonb_build_object(
        'id', link.id, 'sourceBindingId', link.source_binding_id,
        'employmentContractId', link.employment_contract_id,
        'active', true
      ) FROM tenant_action_employment_link link
      WHERE link.membership_id = authority.membership_id AND link.active IS TRUE
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

CREATE OR REPLACE FUNCTION tenant_lifecycle_assert_platform_capability_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_capability_key text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM tenant_iam_assert_platform_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version
  );
  IF p_capability_key NOT IN (
    'platform.tenants.manage', 'platform.users.manage',
    'platform.users.read', 'platform.users.invite', 'platform.roles.manage'
  ) OR NOT EXISTS (
    SELECT 1
    FROM platform_user_role assignment
    JOIN iam_role_capability mapping ON mapping.role_key = assignment.role_key
    JOIN iam_capability capability
      ON capability.capability_key = mapping.capability_key
     AND capability.scope_kind = 'platform'
    WHERE lower(assignment.user_email) = lower(btrim(p_actor_email))
      AND assignment.role_key = 'PLATFORM_OWNER'
      AND assignment.active IS TRUE
      AND mapping.capability_key = p_capability_key
  ) THEN
    RAISE EXCEPTION 'TENANT_LIFECYCLE_PLATFORM_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- 005 exponia tres superficies email-only. Conservamos los cuerpos como helpers
-- internos y volvemos a publicar unicamente wrappers de alcance cerrado.
DO $$
BEGIN
  IF to_regprocedure('public.tenant_identity_lookup_core_009(text,text,text,text)') IS NULL THEN
    IF to_regprocedure('public.tenant_identity_lookup(text,text,text,text)') IS NULL THEN
      RAISE EXCEPTION 'TENANT_LIFECYCLE_IDENTITY_LOOKUP_CORE_MISSING' USING ERRCODE = 'P0001';
    END IF;
    ALTER FUNCTION tenant_identity_lookup(text, text, text, text)
      RENAME TO tenant_identity_lookup_core_009;
  END IF;
  IF to_regprocedure('public.tenant_identity_command_replay_core_009(text,uuid,text)') IS NULL THEN
    IF to_regprocedure('public.tenant_identity_command_replay(text,uuid,text)') IS NULL THEN
      RAISE EXCEPTION 'TENANT_LIFECYCLE_IDENTITY_REPLAY_CORE_MISSING' USING ERRCODE = 'P0001';
    END IF;
    ALTER FUNCTION tenant_identity_command_replay(text, uuid, text)
      RENAME TO tenant_identity_command_replay_core_009;
  END IF;
  IF to_regprocedure('public.tenant_identity_view_core_009(text,uuid,text,integer)') IS NULL THEN
    IF to_regprocedure('public.tenant_identity_view(text,uuid,text,integer)') IS NULL THEN
      RAISE EXCEPTION 'TENANT_LIFECYCLE_IDENTITY_VIEW_CORE_MISSING' USING ERRCODE = 'P0001';
    END IF;
    ALTER FUNCTION tenant_identity_view(text, uuid, text, integer)
      RENAME TO tenant_identity_view_core_009;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_lookup(
  p_operation text,
  p_identifier text DEFAULT '',
  p_secret_hash text DEFAULT '',
  p_release_sha text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('invitation','login','flow')
     OR p_identifier IS NULL OR p_secret_hash IS NULL OR p_release_sha IS NULL
     OR (p_operation = 'invitation' AND (
       p_identifier <> '' OR p_secret_hash !~ '^[a-f0-9]{64}$'
       OR p_release_sha !~ '^[a-f0-9]{40}$'
     ))
     OR (p_operation = 'login' AND (
       length(btrim(p_identifier)) NOT BETWEEN 3 AND 254
       OR p_secret_hash <> '' OR p_release_sha <> ''
     ))
     OR (p_operation = 'flow' AND (
       p_identifier <> '' OR p_secret_hash !~ '^[a-f0-9]{64}$'
       OR (p_release_sha <> '' AND p_release_sha !~ '^[a-f0-9]{40}$')
     )) THEN
    RAISE EXCEPTION 'IDENTITY_LOOKUP_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN tenant_identity_lookup_core_009(
    p_operation, p_identifier, p_secret_hash, p_release_sha
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_platform_invitation_delivery_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    'platform.users.invite'
  );
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR p_invitation_id IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_PLATFORM_LOOKUP_INVALID' USING ERRCODE = 'P0001';
  END IF;
  RETURN tenant_identity_lookup_core_009(
    'invitation_delivery', p_invitation_id::text, '', p_release_sha
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_command_replay(
  p_actor_email text,
  p_idempotency_key uuid,
  p_release_sha text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'IDENTITY_PLATFORM_REPLAY_REQUIRES_V2' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_platform_command_replay_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_idempotency_key uuid,
  p_expected_command text,
  p_expected_version integer,
  p_expected_invitation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  replay tenant_iam_event%ROWTYPE;
  replay_context tenant_identity_platform_event_context%ROWTYPE;
BEGIN
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    'platform.users.invite'
  );
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR p_idempotency_key IS NULL
     OR p_expected_command IS DISTINCT FROM 'issue_invitation'
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_expected_invitation_id IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_PLATFORM_REPLAY_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    lower(btrim(p_actor_email)) || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO replay FROM tenant_iam_event event
  WHERE lower(event.actor_user_email) = lower(btrim(p_actor_email))
    AND event.idempotency_key = p_idempotency_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF replay.command IS DISTINCT FROM p_expected_command
     OR replay.result->'invitation'->>'id' IS NULL
     OR (replay.result->'invitation'->>'id')::uuid
       IS DISTINCT FROM p_expected_invitation_id
     OR replay.result->'invitation'->>'version' IS NULL
     OR (replay.result->'invitation'->>'version')::integer
       IS DISTINCT FROM p_expected_version + 1 THEN
    RAISE EXCEPTION 'IDENTITY_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO replay_context FROM tenant_identity_platform_event_context context
  WHERE context.event_id = replay.id FOR SHARE;
  IF NOT FOUND
     OR replay_context.actor_session_id IS DISTINCT FROM p_actor_session_id
     OR replay_context.actor_session_version IS DISTINCT FROM p_actor_session_version
     OR replay_context.release_sha IS DISTINCT FROM p_release_sha
     OR replay_context.expected_version IS DISTINCT FROM p_expected_version
     OR replay_context.command IS DISTINCT FROM p_expected_command
     OR replay_context.command_hash IS DISTINCT FROM replay.command_hash THEN
    RAISE EXCEPTION 'IDENTITY_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM tenant_identity_assert_issue_replay_current_v1(
    p_expected_invitation_id, replay.result, p_release_sha
  );
  RETURN tenant_identity_command_replay_core_009(
    p_actor_email, p_idempotency_key, p_release_sha
  );
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'IDENTITY_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_view(
  p_actor_email text,
  p_current_session_id uuid,
  p_resource text DEFAULT 'bootstrap',
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_resource IS NULL OR p_resource NOT IN ('bootstrap','sessions') THEN
    RAISE EXCEPTION 'IDENTITY_RESOURCE_REQUIRES_V2' USING ERRCODE = 'P0001';
  END IF;
  RETURN tenant_identity_view_core_009(
    p_actor_email, p_current_session_id, p_resource, p_limit
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_assert_issue_replay_current_v1(
  p_invitation_id uuid,
  p_result jsonb,
  p_release_sha text
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  invitation tenant_invitation%ROWTYPE;
  membership tenant_membership%ROWTYPE;
  secret tenant_identity_invitation_secret%ROWTYPE;
  policy tenant_identity_policy%ROWTYPE;
  expected_version integer;
  expected_attempt uuid;
BEGIN
  IF p_invitation_id IS NULL OR jsonb_typeof(p_result) IS DISTINCT FROM 'object'
     OR p_result->'invitation'->>'id' IS NULL
     OR (p_result->'invitation'->>'id')::uuid IS DISTINCT FROM p_invitation_id
     OR p_result->'invitation'->>'version' IS NULL
     OR p_result->>'deliveryAttemptId' IS NULL THEN
    RAISE EXCEPTION 'IDENTITY_DELIVERY_ATTEMPT_STALE' USING ERRCODE = 'P0001';
  END IF;
  expected_version := (p_result->'invitation'->>'version')::integer;
  expected_attempt := (p_result->>'deliveryAttemptId')::uuid;
  SELECT * INTO invitation FROM tenant_invitation invitation_row
  WHERE invitation_row.id = p_invitation_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDENTITY_DELIVERY_ATTEMPT_STALE' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO membership FROM tenant_membership membership_row
  WHERE membership_row.id = invitation.membership_id FOR SHARE;
  IF NOT FOUND OR membership.status <> 'invited' THEN
    RAISE EXCEPTION 'IDENTITY_DELIVERY_ATTEMPT_STALE' USING ERRCODE = 'P0001';
  END IF;
  SELECT policy_row.* INTO policy FROM tenant_identity_policy policy_row
  JOIN platform_tenant_source_binding binding
    ON binding.id = policy_row.certified_source_binding_id
   AND binding.tenant_id = policy_row.tenant_id
   AND binding.source_system = 'GRH' AND binding.verified IS TRUE
  WHERE policy_row.tenant_id = membership.tenant_id
    AND policy_row.tenant_data_plane_ready IS TRUE
    AND policy_row.certified_release_sha = p_release_sha
  FOR SHARE OF policy_row, binding;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDENTITY_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO secret FROM tenant_identity_invitation_secret secret_row
  WHERE secret_row.invitation_id = invitation.id FOR SHARE;
  IF NOT FOUND OR secret.delivery_attempt_id IS DISTINCT FROM expected_attempt
     OR NOT (
       (secret.status = 'pending' AND policy.invitation_delivery_ready IS TRUE
         AND secret.expires_at > now()
         AND invitation.status = 'prepared'
         AND invitation.version IS NOT DISTINCT FROM expected_version)
       OR (secret.status = 'active' AND invitation.status = 'issued'
         AND invitation.version IS NOT DISTINCT FROM expected_version + 1)
     ) THEN
    RAISE EXCEPTION 'IDENTITY_DELIVERY_ATTEMPT_STALE' USING ERRCODE = 'P0001';
  END IF;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'IDENTITY_DELIVERY_ATTEMPT_STALE' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_platform_invitations_view_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  invitations jsonb := '[]'::jsonb;
  can_invite boolean := false;
BEGIN
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    'platform.users.read'
  );
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'IDENTITY_PLATFORM_VIEW_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM platform_user_role assignment
    JOIN iam_role_capability mapping ON mapping.role_key = assignment.role_key
    WHERE lower(assignment.user_email) = lower(btrim(p_actor_email))
      AND assignment.active IS TRUE
      AND assignment.role_key = 'PLATFORM_OWNER'
      AND mapping.capability_key = 'platform.users.invite'
  ) INTO can_invite;
  SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.prepared_at DESC), '[]'::jsonb)
    INTO invitations
  FROM (
    SELECT invitation.prepared_at,
      jsonb_build_object(
        'id', invitation.id, 'status', invitation.status, 'version', invitation.version,
        'membershipId', membership.id, 'tenantId', membership.tenant_id,
        'email', membership.user_email, 'preparedAt', invitation.prepared_at,
        'delivery', jsonb_strip_nulls(jsonb_build_object(
          'status', CASE
            WHEN secret.status = 'active' THEN 'delivered'
            WHEN secret.status = 'pending' THEN 'pending'
            WHEN invitation.status = 'prepared' THEN 'not_issued'
            ELSE 'failed'
          END,
          'issuedAt', secret.issued_at, 'expiresAt', secret.expires_at
        )),
        'activation', jsonb_strip_nulls(jsonb_build_object('acceptedAt', secret.consumed_at))
      ) AS payload
    FROM tenant_invitation invitation
    JOIN tenant_membership membership ON membership.id = invitation.membership_id
    JOIN platform_tenant tenant ON tenant.id = membership.tenant_id
      AND tenant.status IN ('onboarding','active')
    JOIN tenant_identity_policy policy ON policy.tenant_id = membership.tenant_id
      AND policy.tenant_data_plane_ready IS TRUE
      AND policy.certified_release_sha = p_release_sha
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = policy.tenant_id
     AND binding.source_system = 'GRH' AND binding.verified IS TRUE
    LEFT JOIN tenant_identity_invitation_secret secret
      ON secret.invitation_id = invitation.id
    ORDER BY invitation.prepared_at DESC, invitation.id
    LIMIT p_limit
  ) item;
  RETURN jsonb_build_object(
    'allowedCommands', CASE WHEN can_invite AND EXISTS (
      SELECT 1 FROM tenant_identity_policy policy
      JOIN platform_tenant_source_binding binding
        ON binding.id = policy.certified_source_binding_id
       AND binding.tenant_id = policy.tenant_id
       AND binding.source_system = 'GRH' AND binding.verified IS TRUE
      WHERE policy.tenant_data_plane_ready IS TRUE
        AND policy.invitation_delivery_ready IS TRUE
        AND policy.certified_release_sha = p_release_sha
    ) THEN jsonb_build_array('issue_invitation') ELSE '[]'::jsonb END,
    'invitations', invitations
  );
END
$$;

DO $$
BEGIN
  IF to_regprocedure('public.tenant_identity_apply_command_core_009(text,text,uuid,text,integer,jsonb)') IS NULL THEN
    IF to_regprocedure('public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)') IS NULL THEN
      RAISE EXCEPTION 'TENANT_LIFECYCLE_IDENTITY_CORE_MISSING' USING ERRCODE = 'P0001';
    END IF;
    ALTER FUNCTION tenant_identity_apply_command(text, text, uuid, text, integer, jsonb)
      RENAME TO tenant_identity_apply_command_core_009;
  END IF;
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
  ) THEN RAISE EXCEPTION 'IDENTITY_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001'; END IF;
  RETURN tenant_identity_apply_command_core_009(
    p_command, p_actor_email, p_idempotency_key, p_command_hash,
    p_expected_version, p_payload
  );
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_apply_platform_command_v2(
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
  replay tenant_iam_event%ROWTYPE;
  replay_context tenant_identity_platform_event_context%ROWTYPE;
  result_value jsonb;
  actor_email text := lower(btrim(p_actor_email));
BEGIN
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    CASE WHEN p_command IN ('issue_invitation','confirm_delivery','delivery_failed')
      THEN 'platform.users.invite' ELSE 'platform.tenants.manage' END
  );
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR p_command IS NULL OR p_command NOT IN (
       'issue_invitation','confirm_delivery','delivery_failed',
       'certify_data_plane','set_delivery_ready'
     )
     OR p_idempotency_key IS NULL OR p_command_hash IS NULL
     OR p_command_hash !~ '^[a-f0-9]{64}$'
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR (p_command = 'certify_data_plane' AND (
       p_payload->>'releaseSha' IS DISTINCT FROM p_release_sha
       OR length(btrim(COALESCE(p_payload->>'reason',''))) NOT BETWEEN 3 AND 500
       OR NOT (p_payload ?& ARRAY['tenantId','sourceBindingId','releaseSha','reason'])
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['tenantId','sourceBindingId','releaseSha','reason']))
     ))
     OR (p_command = 'set_delivery_ready' AND (
       COALESCE((p_payload->>'ready')::boolean, true) IS NOT FALSE
       OR length(btrim(COALESCE(p_payload->>'reason',''))) NOT BETWEEN 3 AND 500
       OR NOT (p_payload ?& ARRAY['tenantId','ready','reason'])
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['tenantId','ready','reason']))
     ))
     OR (p_command = 'issue_invitation' AND (
       p_payload->>'releaseSha' IS DISTINCT FROM p_release_sha
       OR NOT (p_payload ?& ARRAY[
         'invitationId','deliveryAttemptId','codeHash','expiresAt','releaseSha'
       ])
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY[
           'invitationId','deliveryAttemptId','codeHash','expiresAt','releaseSha'
         ]))
     ))
     OR (p_command = 'confirm_delivery' AND (
       p_payload->>'releaseSha' IS DISTINCT FROM p_release_sha
       OR NOT (p_payload ?& ARRAY['invitationId','deliveryAttemptId','releaseSha'])
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['invitationId','deliveryAttemptId','releaseSha']))
     ))
     OR (p_command = 'delivery_failed' AND (
       NOT (p_payload ?& ARRAY['invitationId','deliveryAttemptId'])
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
         WHERE field.key <> ALL(ARRAY['invitationId','deliveryAttemptId']))
     )) THEN
    RAISE EXCEPTION 'IDENTITY_PLATFORM_COMMAND_CLOSED' USING ERRCODE = 'P0001';
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
  ) THEN RAISE EXCEPTION 'IDENTITY_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001'; END IF;
  IF FOUND THEN
    SELECT * INTO replay_context FROM tenant_identity_platform_event_context context
    WHERE context.event_id = replay.id FOR SHARE;
    IF NOT FOUND
       OR replay_context.actor_session_id IS DISTINCT FROM p_actor_session_id
       OR replay_context.actor_session_version IS DISTINCT FROM p_actor_session_version
       OR replay_context.release_sha IS DISTINCT FROM p_release_sha
       OR replay_context.expected_version IS DISTINCT FROM p_expected_version
       OR replay_context.command IS DISTINCT FROM p_command
       OR replay_context.command_hash IS DISTINCT FROM p_command_hash THEN
      RAISE EXCEPTION 'IDENTITY_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'issue_invitation' THEN
      PERFORM tenant_identity_assert_issue_replay_current_v1(
        (replay.result->'invitation'->>'id')::uuid, replay.result, p_release_sha
      );
    END IF;
    RETURN tenant_identity_apply_command_core_009(
      p_command, p_actor_email, p_idempotency_key, p_command_hash,
      p_expected_version, p_payload
    );
  END IF;
  result_value := tenant_identity_apply_command_core_009(
    p_command, p_actor_email, p_idempotency_key, p_command_hash,
    p_expected_version, p_payload
  );
  SELECT * INTO replay FROM tenant_iam_event event
  WHERE lower(event.actor_user_email) = actor_email
    AND event.idempotency_key = p_idempotency_key
    AND event.command = p_command
    AND event.command_hash = p_command_hash;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IDENTITY_PLATFORM_EVENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO tenant_identity_platform_event_context (
    event_id, actor_session_id, actor_session_version, release_sha,
    expected_version, command, command_hash, reason_code, reason_hash
  ) VALUES (
    replay.id, p_actor_session_id, p_actor_session_version, p_release_sha,
    p_expected_version, p_command, p_command_hash,
    CASE p_command WHEN 'certify_data_plane' THEN 'certify_data_plane'
      WHEN 'set_delivery_ready' THEN 'delivery_kill_switch' ELSE NULL END,
    CASE WHEN p_command IN ('certify_data_plane','set_delivery_ready') THEN
      encode(digest(convert_to(btrim(p_payload->>'reason'), 'UTF8'), 'sha256'), 'hex')
      ELSE NULL END
  );
  RETURN result_value;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'IDENTITY_PLATFORM_COMMAND_CLOSED' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION tenant_action_apply_provisioning_command_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
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
  contract employment_contract%ROWTYPE;
  current_link tenant_action_employment_link%ROWTYPE;
  conflicting_link tenant_action_employment_link%ROWTYPE;
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
  IF p_command IS NULL
     OR p_command NOT IN ('link_employment', 'revoke_employment_link', 'replace_action_scopes')
     OR p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_command_hash IS NULL OR p_command_hash !~ '^[a-f0-9]{64}$'
     OR p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
  END IF;
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    actor_email, p_actor_session_id, p_actor_session_version,
    CASE WHEN p_command = 'replace_action_scopes'
      THEN 'platform.roles.manage' ELSE 'platform.users.manage' END
  );
  SELECT * INTO membership FROM tenant_membership membership_row
  WHERE membership_row.id = p_membership_id FOR SHARE;
  IF NOT FOUND
     OR (p_command = 'revoke_employment_link' AND membership.status NOT IN ('active','suspended'))
     OR (p_command <> 'revoke_employment_link' AND membership.status <> 'active') THEN
    RAISE EXCEPTION 'TENANT_ACTION_MEMBERSHIP_NOT_ACTIVE' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    membership.tenant_id::text || ':employment-provisioning', 0
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor_email || ':' || membership.tenant_id::text || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO authority FROM tenant_action_authority authority_row
  WHERE authority_row.membership_id = membership.id
    AND authority_row.tenant_id = membership.tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_ACTION_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  IF p_command <> 'revoke_employment_link' THEN
    SELECT source.* INTO binding FROM tenant_identity_policy policy
    JOIN platform_tenant_source_binding source
      ON source.id = policy.certified_source_binding_id
     AND source.tenant_id = policy.tenant_id
     AND source.source_system = 'GRH' AND source.verified IS TRUE
    WHERE policy.tenant_id = membership.tenant_id
      AND policy.certified_release_sha = p_release_sha
      AND policy.tenant_data_plane_ready IS TRUE
    FOR SHARE OF policy, source;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TENANT_ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  SELECT * INTO existing_event FROM tenant_action_authority_event
  WHERE actor_user_email = actor_email AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.command_hash IS DISTINCT FROM p_command_hash
       OR existing_event.command IS DISTINCT FROM p_command
       OR existing_event.tenant_id IS DISTINCT FROM membership.tenant_id
       OR existing_event.membership_id IS DISTINCT FROM membership.id
       OR existing_event.actor_session_id IS DISTINCT FROM p_actor_session_id
       OR existing_event.actor_session_version IS DISTINCT FROM p_actor_session_version
       OR existing_event.release_sha IS DISTINCT FROM p_release_sha
       OR existing_event.expected_version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'TENANT_ACTION_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    IF authority.version IS DISTINCT FROM existing_event.resulting_version
       OR tenant_action_authority_snapshot(membership.id)
         IS DISTINCT FROM existing_event.after_snapshot THEN
      RAISE EXCEPTION 'TENANT_ACTION_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'link_employment'
       AND existing_event.after_snapshot->'employmentLink'->>'sourceBindingId'
         IS DISTINCT FROM binding.id::text THEN
      RAISE EXCEPTION 'TENANT_ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'replace_action_scopes' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(
          COALESCE(existing_event.after_snapshot->'scopes', '[]'::jsonb)
        ) scope
        WHERE scope->>'sourceBindingId' IS DISTINCT FROM binding.id::text
      ) THEN
      RAISE EXCEPTION 'TENANT_ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    RETURN existing_event.result || jsonb_build_object('replayed', true);
  END IF;
  IF authority.version <> p_expected_version THEN
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
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
      WHERE field.key <> ALL(ARRAY['sourceBindingId','employmentContractId','reasonCode','reason']))
       OR NOT (p_payload ?& ARRAY['sourceBindingId','employmentContractId','reasonCode','reason']) THEN
      RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
    END IF;
    binding_id_value := (p_payload->>'sourceBindingId')::uuid;
    contract_id_value := (p_payload->>'employmentContractId')::uuid;
    SELECT source.* INTO binding FROM tenant_identity_policy policy
    JOIN platform_tenant_source_binding source
      ON source.id = policy.certified_source_binding_id AND source.tenant_id = policy.tenant_id
    WHERE policy.tenant_id = membership.tenant_id AND source.id = binding_id_value
      AND policy.tenant_data_plane_ready IS TRUE
      AND policy.certified_release_sha = p_release_sha
      AND source.source_system = 'GRH' AND source.verified IS TRUE
    FOR SHARE OF policy, source;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001'; END IF;
    SELECT contract_row.* INTO contract
    FROM employment_contract contract_row
    JOIN source_import_batch batch ON batch.id = contract_row.source_batch_id
      AND batch.source_system = 'GRH' AND batch.source_database = binding.source_database
      AND batch.validation_state = 'published' AND batch.legacy_import_run_id IS NOT NULL
    WHERE contract_row.id = contract_id_value AND contract_row.status = 'active'
      AND contract_row.source_system = 'GRH'
      AND contract_row.legacy_company_id = binding.source_company_id
    FOR SHARE OF contract_row, batch;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_INVALID' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO conflicting_link FROM tenant_action_employment_link link
    WHERE link.tenant_id = membership.tenant_id
      AND link.employment_contract_id = contract.id AND link.active IS TRUE
    FOR UPDATE;
    IF FOUND AND conflicting_link.membership_id <> membership.id THEN
      RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_ALREADY_LINKED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_link FROM tenant_action_employment_link link
    WHERE link.membership_id = membership.id AND link.active IS TRUE FOR UPDATE;
    IF FOUND THEN
      UPDATE tenant_action_employment_link SET active = false, revoked_at = now(), updated_at = now()
      WHERE id = current_link.id;
    END IF;
    INSERT INTO tenant_action_employment_link (
      membership_id, tenant_id, source_binding_id, employment_contract_id,
      active, linked_by_user_email, linked_at, revoked_at, updated_at
    ) VALUES (
      membership.id, membership.tenant_id, binding.id, contract.id,
      true, actor_email, now(), NULL, now()
    );
  ELSIF p_command = 'revoke_employment_link' THEN
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
      WHERE field.key <> ALL(ARRAY['reasonCode','reason']))
       OR NOT (p_payload ?& ARRAY['reasonCode','reason']) THEN
      RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_link FROM tenant_action_employment_link link
    WHERE link.membership_id = membership.id
      AND link.tenant_id = membership.tenant_id AND link.active IS TRUE FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_LINK_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    UPDATE tenant_action_employment_link SET active = false, revoked_at = now(), updated_at = now()
    WHERE id = current_link.id;
  ELSE
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
      WHERE field.key <> ALL(ARRAY['scopes','reasonCode','reason']))
       OR NOT (p_payload ?& ARRAY['scopes','reasonCode','reason'])
       OR jsonb_typeof(p_payload->'scopes') IS DISTINCT FROM 'array'
       OR jsonb_array_length(p_payload->'scopes') > 50 THEN
      RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE tenant_action_area_scope SET active = false, revoked_at = now(), updated_at = now()
    WHERE membership_id = membership.id AND active IS TRUE;
    FOR scope_value IN SELECT value FROM jsonb_array_elements(p_payload->'scopes') LOOP
      IF jsonb_typeof(scope_value) <> 'object' OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(scope_value) field(key)
        WHERE field.key <> ALL(ARRAY['capabilityKey','sourceBindingId','scopeLevel',
          'organizationUnitSourceId','sectorSourceId'])
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
        AND policy.tenant_data_plane_ready IS TRUE AND policy.certified_release_sha = p_release_sha
        AND source.source_system = 'GRH' AND source.verified IS TRUE
      FOR SHARE OF policy, source;
      IF NOT FOUND OR capability_value NOT LIKE 'leave.request.area.%'
         OR NOT EXISTS (SELECT 1 FROM tenant_action_membership_configured_capabilities(membership.id) configured
           WHERE configured.capability_key = capability_value)
         OR scope_level_value NOT IN ('company','organization','sector')
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
    actor_user_email, actor_session_id, actor_session_version, release_sha,
    tenant_id, membership_id,
    command, target_type, target_id, idempotency_key, command_hash,
    expected_version, resulting_version, reason_code, reason_hash,
    before_snapshot, after_snapshot, result
  ) VALUES (
    actor_email, p_actor_session_id, p_actor_session_version, p_release_sha,
    membership.tenant_id, membership.id,
    p_command, 'tenant_action_authority', membership.id::text,
    p_idempotency_key, p_command_hash, p_expected_version, authority.version,
    reason_code, reason_hash_value, before_value, after_value, result_value
  );
  RETURN result_value;
EXCEPTION WHEN invalid_text_representation THEN
  RAISE EXCEPTION 'TENANT_ACTION_PROVISIONING_INVALID' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION tenant_action_lookup_employment_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_membership_id uuid,
  p_query text,
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  membership tenant_membership%ROWTYPE;
  binding platform_tenant_source_binding%ROWTYPE;
  normalized_query text := btrim(COALESCE(p_query, ''));
  escaped_query text;
  candidates jsonb;
BEGIN
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    'platform.users.manage'
  );
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR char_length(normalized_query) NOT BETWEEN 3 AND 80
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20 THEN
    RAISE EXCEPTION 'TENANT_ACTION_LOOKUP_INVALID' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO membership FROM tenant_membership membership_row
  WHERE membership_row.id = p_membership_id AND membership_row.status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_MEMBERSHIP_NOT_ACTIVE' USING ERRCODE = 'P0001'; END IF;
  SELECT source.* INTO binding FROM tenant_identity_policy policy
  JOIN platform_tenant_source_binding source
    ON source.id = policy.certified_source_binding_id AND source.tenant_id = policy.tenant_id
  WHERE policy.tenant_id = membership.tenant_id AND policy.tenant_data_plane_ready IS TRUE
    AND policy.certified_release_sha = p_release_sha
    AND source.source_system = 'GRH' AND source.verified IS TRUE
  FOR SHARE OF policy, source;
  IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001'; END IF;
  escaped_query := replace(replace(replace(normalized_query, '\', '\\'), '%', '\%'), '_', '\_');
  SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.display_name, item.legajo), '[]'::jsonb)
    INTO candidates
  FROM (
    SELECT jsonb_build_object(
      'employmentContractId', contract.id, 'sourceBindingId', binding.id,
      'legajo', contract.legacy_legajo,
      'displayName', COALESCE(NULLIF(employee.nombre,''), NULLIF(identity.full_name,''), 'Nombre no informado'),
      'organizationUnitSourceId', contract.organization_unit_source_id,
      'organizationLabel', COALESCE(contract.organization_unit_source_id, 'Organizacion no informada'),
      'sectorSourceId', contract.sector_source_id,
      'sectorLabel', COALESCE(NULLIF(employee.sector,''), contract.sector_source_id, 'Sector no informado')
    ) AS payload,
    COALESCE(NULLIF(employee.nombre,''), NULLIF(identity.full_name,''), '') AS display_name,
    contract.legacy_legajo AS legajo
    FROM employment_contract contract
    JOIN source_import_batch batch ON batch.id = contract.source_batch_id
      AND batch.source_system = 'GRH' AND batch.source_database = binding.source_database
      AND batch.validation_state = 'published' AND batch.legacy_import_run_id IS NOT NULL
    JOIN person_identity identity ON identity.id = contract.person_id
    LEFT JOIN grh_employees employee
      ON employee.company_id = contract.legacy_company_id
     AND employee.legajo = contract.legacy_legajo
     AND employee.import_run_id = batch.legacy_import_run_id
    WHERE contract.status = 'active' AND contract.source_system = 'GRH'
      AND contract.legacy_company_id = binding.source_company_id
      AND (contract.legacy_legajo ILIKE '%' || escaped_query || '%' ESCAPE '\'
        OR COALESCE(employee.nombre, identity.full_name, '') ILIKE '%' || escaped_query || '%' ESCAPE '\'
        OR COALESCE(employee.sector, '') ILIKE '%' || escaped_query || '%' ESCAPE '\')
    ORDER BY display_name, legajo, contract.id
    LIMIT p_limit
  ) item;
  RETURN jsonb_build_object(
    'tenantId', membership.tenant_id, 'membershipId', membership.id,
    'candidates', candidates, 'ephemeral', true, 'limit', p_limit
  );
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
  base_result jsonb;
  tenant_row platform_tenant%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  binding_row platform_tenant_source_binding%ROWTYPE;
  tenant_ready boolean := false;
  users_payload jsonb := '[]'::jsonb;
  source_bindings jsonb := '[]'::jsonb;
  scope_capabilities jsonb := '[]'::jsonb;
  organizations jsonb := '[]'::jsonb;
  sectors jsonb := '[]'::jsonb;
  safe_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 200);
BEGIN
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'TENANT_IAM_RELEASE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    CASE WHEN p_resource = 'roles' THEN 'platform.roles.manage'
      WHEN p_resource IN ('users','bootstrap') THEN 'platform.users.manage'
      ELSE 'platform.tenants.manage' END
  );
  base_result := tenant_iam_admin_view_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version, p_resource, safe_limit
  );

  IF p_tenant_id IS NOT NULL THEN
    SELECT * INTO tenant_row FROM platform_tenant tenant
    WHERE tenant.id = p_tenant_id AND tenant.status IN ('onboarding','active') FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_IAM_TENANT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO policy_row FROM tenant_identity_policy policy
    WHERE policy.tenant_id = tenant_row.id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_LIFECYCLE_POLICY_REQUIRED' USING ERRCODE = 'P0001'; END IF;
    SELECT * INTO binding_row FROM platform_tenant_source_binding binding
    WHERE binding.id = policy_row.certified_source_binding_id
      AND binding.tenant_id = tenant_row.id
      AND binding.source_system = 'GRH' AND binding.verified IS TRUE FOR SHARE;
    tenant_ready := FOUND
      AND policy_row.tenant_data_plane_ready IS TRUE
      AND policy_row.certified_release_sha = p_release_sha;
  END IF;

  IF p_resource = 'users' AND p_tenant_id IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(item.payload ORDER BY item.display_name, item.email), '[]'::jsonb)
      INTO users_payload
    FROM (
      SELECT users.display_name, lower(users.email) AS email,
        jsonb_build_object(
          'id', membership.id,
          'email', lower(users.email),
          'displayName', users.display_name,
          'tenantId', membership.tenant_id,
          'roleKey', membership.role_key,
          'roleLabel', role_row.label,
          'status', membership.status,
          'version', membership.version,
          'membership', jsonb_build_object(
            'id', membership.id, 'tenantId', membership.tenant_id,
            'status', membership.status, 'roleKey', membership.role_key,
            'version', membership.version
          ),
          'capabilities', COALESCE((
            SELECT jsonb_agg(effective.capability_key ORDER BY effective.capability_key)
            FROM tenant_iam_effective_capabilities(membership.id) effective
          ), '[]'::jsonb),
          'employmentLink', CASE WHEN active_link.id IS NULL THEN jsonb_build_object(
              'status', 'unlinked', 'version', authority.version
            ) WHEN tenant_ready IS NOT TRUE OR nominal.contract_id IS NULL THEN jsonb_build_object(
              'status', 'stale', 'version', authority.version
            ) ELSE jsonb_strip_nulls(jsonb_build_object(
              'status', 'linked',
              'version', authority.version,
              'employmentContractId', active_link.employment_contract_id,
              'sourceBindingId', active_link.source_binding_id,
              'legajo', nominal.legajo,
              'displayName', nominal.display_name,
              'organizationUnitSourceId', nominal.organization_id,
              'organizationLabel', nominal.organization_label,
              'sectorSourceId', nominal.sector_id,
              'sectorLabel', nominal.sector_label
            )) END,
          'operationalAccess', jsonb_build_object(
            'version', authority.version,
            'scopes', CASE WHEN tenant_ready IS TRUE THEN COALESCE((
              SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                'id', scope.id, 'capabilityKey', scope.capability_key,
                'sourceBindingId', scope.source_binding_id, 'scopeLevel', scope.scope_level,
                'organizationUnitSourceId', scope.organization_unit_source_id,
                'organizationLabel', scope.organization_unit_source_id,
                'sectorSourceId', scope.sector_source_id,
                'sectorLabel', scope.sector_source_id,
                'active', true
              )) ORDER BY scope.capability_key, scope.scope_level, scope.id)
              FROM tenant_action_area_scope scope
              WHERE scope.membership_id = membership.id
                AND scope.tenant_id = membership.tenant_id
                AND scope.source_binding_id = binding_row.id
                AND scope.active IS TRUE
            ), '[]'::jsonb) ELSE '[]'::jsonb END
          )
        ) AS payload
      FROM tenant_membership membership
      JOIN internal_users users ON lower(users.email) = lower(membership.user_email)
      JOIN iam_role role_row ON role_row.role_key = membership.role_key
      JOIN tenant_action_authority authority
        ON authority.membership_id = membership.id AND authority.tenant_id = membership.tenant_id
      LEFT JOIN LATERAL (
        SELECT link.* FROM tenant_action_employment_link link
        WHERE link.membership_id = membership.id AND link.tenant_id = membership.tenant_id
          AND link.active IS TRUE
      ) active_link ON true
      LEFT JOIN LATERAL (
        SELECT contract.id AS contract_id, contract.legacy_legajo AS legajo,
          COALESCE(NULLIF(employee.nombre,''), NULLIF(identity.full_name,''), users.display_name) AS display_name,
          contract.organization_unit_source_id AS organization_id,
          COALESCE(contract.organization_unit_source_id, 'Organizacion no informada') AS organization_label,
          contract.sector_source_id AS sector_id,
          COALESCE(NULLIF(employee.sector,''), contract.sector_source_id, 'Sector no informado') AS sector_label
        FROM employment_contract contract
        JOIN source_import_batch batch ON batch.id = contract.source_batch_id
          AND batch.source_system = 'GRH' AND batch.validation_state = 'published'
          AND batch.legacy_import_run_id IS NOT NULL
        JOIN person_identity identity ON identity.id = contract.person_id
        JOIN platform_tenant_source_binding source
          ON source.id = active_link.source_binding_id AND source.tenant_id = membership.tenant_id
          AND source.source_system = 'GRH' AND source.verified IS TRUE
          AND source.source_database = batch.source_database
          AND source.source_company_id = contract.legacy_company_id
        LEFT JOIN grh_employees employee
          ON employee.company_id = contract.legacy_company_id
         AND employee.legajo = contract.legacy_legajo
         AND employee.import_run_id = batch.legacy_import_run_id
        WHERE contract.id = active_link.employment_contract_id
          AND tenant_ready IS TRUE
          AND active_link.source_binding_id = binding_row.id
      ) nominal ON true
      WHERE membership.tenant_id = p_tenant_id
      ORDER BY users.display_name, users.email, membership.id
      LIMIT safe_limit
    ) item;
    RETURN jsonb_build_object('items', users_payload, 'users', users_payload,
      'tenantId', p_tenant_id, 'source', jsonb_build_object('label', 'Control plane tenant-owned'));
  END IF;

  IF p_resource = 'bootstrap' AND p_tenant_id IS NOT NULL THEN
    IF tenant_ready THEN
      source_bindings := jsonb_build_array(jsonb_build_object(
        'id', binding_row.id, 'tenantId', binding_row.tenant_id,
        'system', binding_row.source_system, 'databaseLabel', binding_row.source_database,
        'companyId', binding_row.source_company_id, 'verified', true
      ));
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'key', capability.capability_key, 'label', capability.label,
        'description', capability.description, 'sensitivity', capability.sensitivity
      ) ORDER BY capability.capability_key), '[]'::jsonb) INTO scope_capabilities
      FROM iam_capability capability
      WHERE capability.scope_kind = 'tenant'
        AND capability.capability_key LIKE 'leave.request.area.%';
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sourceBindingId', binding_row.id, 'sourceId', structure.organization_id,
        'label', structure.organization_id
      ) ORDER BY structure.organization_id), '[]'::jsonb) INTO organizations
      FROM (
        SELECT DISTINCT contract.organization_unit_source_id AS organization_id
        FROM employment_contract contract
        JOIN source_import_batch batch ON batch.id = contract.source_batch_id
          AND batch.source_system = 'GRH' AND batch.source_database = binding_row.source_database
          AND batch.validation_state = 'published' AND batch.legacy_import_run_id IS NOT NULL
        WHERE contract.status = 'active' AND contract.source_system = 'GRH'
          AND contract.legacy_company_id = binding_row.source_company_id
          AND contract.organization_unit_source_id IS NOT NULL
      ) structure;
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'sourceBindingId', binding_row.id,
        'organizationUnitSourceId', structure.organization_id,
        'sourceId', structure.sector_id, 'label', structure.sector_label
      ) ORDER BY structure.organization_id, structure.sector_label, structure.sector_id), '[]'::jsonb)
        INTO sectors
      FROM (
        SELECT DISTINCT contract.organization_unit_source_id AS organization_id,
          contract.sector_source_id AS sector_id,
          COALESCE(NULLIF(employee.sector,''), contract.sector_source_id) AS sector_label
        FROM employment_contract contract
        JOIN source_import_batch batch ON batch.id = contract.source_batch_id
          AND batch.source_system = 'GRH' AND batch.source_database = binding_row.source_database
          AND batch.validation_state = 'published' AND batch.legacy_import_run_id IS NOT NULL
        LEFT JOIN grh_employees employee
          ON employee.company_id = contract.legacy_company_id
         AND employee.legajo = contract.legacy_legajo
         AND employee.import_run_id = batch.legacy_import_run_id
        WHERE contract.status = 'active' AND contract.source_system = 'GRH'
          AND contract.legacy_company_id = binding_row.source_company_id
          AND contract.organization_unit_source_id IS NOT NULL
          AND contract.sector_source_id IS NOT NULL
      ) structure;
    END IF;
    RETURN base_result || jsonb_build_object(
      'context', jsonb_build_object(
        'mode', 'tenant', 'tenantId', tenant_row.id, 'label', tenant_row.short_name,
        'tenantAwareGateway', true
      ),
      'allowedCommands', COALESCE(base_result->'allowedCommands', '[]'::jsonb)
        || CASE WHEN EXISTS (
          SELECT 1 FROM tenant_action_employment_link link
          JOIN tenant_membership membership ON membership.id = link.membership_id
            AND membership.tenant_id = link.tenant_id
          WHERE link.tenant_id = p_tenant_id AND link.active IS TRUE
            AND membership.status IN ('active','suspended')
        ) THEN jsonb_build_array('revoke_employment_link') ELSE '[]'::jsonb END
        || CASE WHEN tenant_ready THEN jsonb_build_array(
          'lookup_employment','link_employment','replace_action_scopes'
        ) ELSE '[]'::jsonb END,
      'controls', COALESCE(base_result->'controls', '{}'::jsonb) || jsonb_build_object(
        'tenantDataPlaneReady', tenant_ready,
        'invitationGatewayReady', policy_row.invitation_delivery_ready
      ),
      'operationalCatalog', jsonb_build_object(
        'sourceBindings', source_bindings,
        'scopeCapabilities', scope_capabilities,
        'organizations', organizations,
        'sectors', sectors,
        'reasonCodes', jsonb_build_array(
          jsonb_build_object('key','onboarding','label','Alta operativa'),
          jsonb_build_object('key','role_change','label','Cambio de rol'),
          jsonb_build_object('key','employment_change','label','Cambio laboral'),
          jsonb_build_object('key','scope_change','label','Cambio de alcance'),
          jsonb_build_object('key','offboarding','label','Baja operativa'),
          jsonb_build_object('key','correction','label','Correccion auditada')
        )
      ),
      'identityPolicy', jsonb_strip_nulls(jsonb_build_object(
        'version', policy_row.version,
        'dataPlaneReady', policy_row.tenant_data_plane_ready,
        'invitationDeliveryReady', policy_row.invitation_delivery_ready,
        'sourceBindingId', policy_row.certified_source_binding_id
      ))
    );
  END IF;
  RETURN base_result;
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
  result_value jsonb;
  source_event tenant_iam_event%ROWTYPE;
BEGIN
  PERFORM tenant_iam_assert_platform_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version
  );
  IF p_command IN ('update_access','suspend_membership','assign_exclusive_capability')
     AND jsonb_typeof(p_payload) = 'object'
     AND COALESCE(p_payload->>'membershipId','')
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT * INTO target_membership FROM tenant_membership membership
    WHERE membership.id = (p_payload->>'membershipId')::uuid FOR UPDATE;
    IF FOUND THEN
      PERFORM 1 FROM tenant_action_authority authority
      WHERE authority.membership_id = target_membership.id
        AND authority.tenant_id = target_membership.tenant_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001'; END IF;
    END IF;
  END IF;
  result_value := tenant_iam_apply_command(
    p_actor_email, p_command, p_idempotency_key, p_command_hash,
    p_expected_version, p_payload
  );
  IF p_command = 'create_tenant' THEN
    SELECT * INTO source_event FROM tenant_iam_event event
    WHERE lower(event.actor_user_email) = lower(btrim(p_actor_email))
      AND event.idempotency_key = p_idempotency_key
      AND event.command = 'create_tenant'
      AND event.tenant_id = (result_value->'tenant'->>'id')::uuid FOR SHARE;
    IF NOT FOUND OR source_event.command_hash IS DISTINCT FROM p_command_hash
       OR source_event.result->'identityPolicy' IS DISTINCT FROM jsonb_build_object(
         'version', 1, 'dataPlaneReady', false, 'invitationDeliveryReady', false
       ) THEN
      RAISE EXCEPTION 'TENANT_LIFECYCLE_CREATE_EVENT_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    result_value := source_event.result || jsonb_build_object(
      'replayed', COALESCE((result_value->>'replayed')::boolean, false)
    );
  END IF;
  RETURN result_value;
END
$$;

COMMENT ON FUNCTION tenant_identity_apply_command(text,text,uuid,text,integer,jsonb) IS
  'Facade runtime 009 para auth/session; rechaza todo comando platform-only.';
COMMENT ON FUNCTION tenant_identity_lookup(text,text,text,text) IS
  'Lookup runtime cerrado a invitation/login/flow; delivery nominal requiere facade platform v2.';
COMMENT ON FUNCTION tenant_identity_platform_invitation_delivery_v2(text,uuid,integer,text,uuid) IS
  'Lookup nominal de entrega ligado a SID/version/MFA/contexto platform/capability/release.';
COMMENT ON FUNCTION tenant_identity_platform_command_replay_v2(text,uuid,integer,text,uuid,text,integer,uuid) IS
  'Replay issue_invitation ligado a contexto append-only SID/version/release/target/version.';
COMMENT ON FUNCTION tenant_identity_platform_invitations_view_v2(text,uuid,integer,text,integer) IS
  'Listado de invitaciones ligado a plataforma v2 y filtrado por release tenant certificado.';
COMMENT ON FUNCTION tenant_identity_assert_issue_replay_current_v1(uuid,jsonb,text) IS
  'Valida bajo locks que un replay issue siga pendiente y no reentregue un intento ya decidido.';
COMMENT ON FUNCTION tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb) IS
  'Control-plane session/MFA/release-bound: solo certificacion de binding ya verificado y kill switch delivery=false.';
COMMENT ON FUNCTION tenant_action_apply_provisioning_command_v2(text,uuid,integer,text,uuid,text,uuid,text,integer,jsonb) IS
  'Provisioning laboral tenant-owned con historia, version, idempotencia y release certificado.';
COMMENT ON FUNCTION tenant_action_lookup_employment_v2(text,uuid,integer,text,uuid,text,integer) IS
  'Busqueda efimera minima sobre GRH publicado y binding certificado; no genera evento.';
COMMENT ON FUNCTION tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer) IS
  'Vista platform session/release-bound; publica operaciones solo para tenant certificado.';

REVOKE ALL ON FUNCTION tenant_lifecycle_initialize_identity_policy_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_lifecycle_enrich_create_tenant_event_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_lifecycle_guard_employment_history_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_lifecycle_guard_revoked_session_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_lifecycle_assert_platform_capability_v2(text,uuid,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_lookup_core_009(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_command_replay_core_009(text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_view_core_009(text,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_lookup(text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_command_replay(text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_view(text,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_platform_invitation_delivery_v2(text,uuid,integer,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_platform_command_replay_v2(text,uuid,integer,text,uuid,text,integer,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_platform_invitations_view_v2(text,uuid,integer,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_assert_issue_replay_current_v1(uuid,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_apply_command_core_009(text,text,uuid,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_apply_command(text,text,uuid,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_apply_provisioning_command(text,uuid,uuid,uuid,text,uuid,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_apply_provisioning_command_v2(text,uuid,integer,text,uuid,text,uuid,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_action_lookup_employment_v2(text,uuid,integer,text,uuid,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_admin_view(text,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_apply_command(text,text,uuid,text,integer,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_admin_view_v2(text,uuid,integer,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION tenant_lifecycle_initialize_identity_policy_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_lifecycle_enrich_create_tenant_event_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_lifecycle_guard_employment_history_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_lifecycle_guard_revoked_session_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_lifecycle_assert_platform_capability_v2(text,uuid,integer,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_lookup_core_009(text,text,text,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_command_replay_core_009(text,uuid,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_view_core_009(text,uuid,text,integer)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_command_replay(text,uuid,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_assert_issue_replay_current_v1(uuid,jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_identity_apply_command_core_009(text,text,uuid,text,integer,jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_action_apply_provisioning_command(text,uuid,uuid,uuid,text,uuid,text,integer,jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_admin_view(text,text,integer)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_apply_command(text,text,uuid,text,integer,jsonb)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_admin_view_v2(text,uuid,integer,text,integer)
  FROM municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_lookup(text,text,text,text)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_view(text,uuid,text,integer)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_platform_invitation_delivery_v2(text,uuid,integer,text,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_platform_command_replay_v2(text,uuid,integer,text,uuid,text,integer,uuid)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_platform_invitations_view_v2(text,uuid,integer,text,integer)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_action_apply_provisioning_command_v2(text,uuid,integer,text,uuid,text,uuid,text,integer,jsonb)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_action_lookup_employment_v2(text,uuid,integer,text,uuid,text,integer)
  TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)
  TO municontrol_actions_runtime_app;

REVOKE ALL PRIVILEGES ON TABLE tenant_identity_policy, tenant_identity_session,
  tenant_identity_platform_event_context,
  tenant_exclusive_capability, tenant_action_employment_link,
  tenant_action_authority, tenant_action_area_scope, tenant_action_authority_event
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON TABLE tenant_identity_platform_event_context FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM municontrol_actions_runtime_app;
