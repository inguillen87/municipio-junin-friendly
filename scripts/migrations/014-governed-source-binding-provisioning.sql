-- MuniControl Friendly - Sprint 014
-- Alta gobernada de un binding GRH real. La unica superficie runtime es la
-- fachada platform v2 ligada a sesion MFA, capability, release y version.

ALTER TABLE tenant_identity_platform_event_context
  DROP CONSTRAINT IF EXISTS tenant_identity_platform_event_context_reason_ck;
ALTER TABLE tenant_identity_platform_event_context
  ADD CONSTRAINT tenant_identity_platform_event_context_reason_ck CHECK (
    (reason_code IS NULL AND reason_hash IS NULL)
    OR (reason_code IS NOT NULL AND reason_hash IS NOT NULL
      AND reason_code IN ('certify_data_plane','delivery_kill_switch','bind_source')
      AND reason_hash ~ '^[a-f0-9]{64}$')
  );

-- Conservamos la fachada 009 como helper interno para los comandos platform ya
-- certificados. El nombre publico vuelve a crearse con un unico nuevo dispatch:
-- bind_source -> core 014 gobernado.
DO $source_binding_facade_core$
DECLARE
  migration_installed boolean := EXISTS (
    SELECT 1 FROM schema_migrations migration
    WHERE migration.version = '014-governed-source-binding-provisioning'
  );
BEGIN
  IF to_regprocedure('public.tenant_identity_apply_platform_command_core_014(text,uuid,integer,text,text,uuid,text,integer,jsonb)') IS NOT NULL
     AND migration_installed IS FALSE THEN
    RAISE EXCEPTION 'SOURCE_BINDING_UNLEDGERED_CORE' USING ERRCODE = 'P0001';
  ELSIF to_regprocedure('public.tenant_identity_apply_platform_command_core_014(text,uuid,integer,text,text,uuid,text,integer,jsonb)') IS NULL THEN
    IF migration_installed IS TRUE THEN
      RAISE EXCEPTION 'SOURCE_BINDING_PLATFORM_CORE_MISSING' USING ERRCODE = 'P0001';
    END IF;
    IF to_regprocedure('public.tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)') IS NULL THEN
      RAISE EXCEPTION 'SOURCE_BINDING_PLATFORM_FACADE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_proc function_row
      WHERE function_row.oid = 'public.tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)'::regprocedure
        AND function_row.prosecdef IS TRUE
        AND function_row.proowner = current_user::regrole::oid
        AND function_row.proconfig @> ARRAY['search_path=public, pg_temp']::text[]
    ) THEN
      RAISE EXCEPTION 'SOURCE_BINDING_PLATFORM_FACADE_UNSAFE' USING ERRCODE = 'P0001';
    END IF;
    ALTER FUNCTION tenant_identity_apply_platform_command_v2(
      text, uuid, integer, text, text, uuid, text, integer, jsonb
    ) RENAME TO tenant_identity_apply_platform_command_core_014;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc function_row
    WHERE function_row.oid = 'public.tenant_identity_apply_platform_command_core_014(text,uuid,integer,text,text,uuid,text,integer,jsonb)'::regprocedure
      AND function_row.prosecdef IS TRUE
      AND function_row.proowner = current_user::regrole::oid
      AND function_row.proconfig @> ARRAY['search_path=public, pg_temp']::text[]
  ) THEN
    RAISE EXCEPTION 'SOURCE_BINDING_PLATFORM_CORE_UNSAFE' USING ERRCODE = 'P0001';
  END IF;
END
$source_binding_facade_core$;

CREATE OR REPLACE FUNCTION tenant_identity_bind_source_core_014(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
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
  source_database_value text;
  source_company_id_value bigint;
  reason_value text;
  reason_hash_value text;
  command_hash_value text;
  tenant_row platform_tenant%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  source_batch_row source_import_batch%ROWTYPE;
  source_binding_row platform_tenant_source_binding%ROWTYPE;
  replay tenant_iam_event%ROWTYPE;
  replay_context tenant_identity_platform_event_context%ROWTYPE;
  canonical_source_cutoff timestamptz;
  canonical_batch_count bigint := 0;
  canonical_contract_count bigint := 0;
  event_id_value bigint;
  result_value jsonb;
BEGIN
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR p_idempotency_key IS NULL
     OR p_idempotency_key::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_command_hash IS NULL OR p_command_hash !~ '^[a-f0-9]{64}$'
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
     OR NOT (p_payload ?& ARRAY[
       'tenantId','sourceSystem','sourceDatabase','sourceCompanyId','reason'
     ])
     OR EXISTS (
       SELECT 1 FROM jsonb_object_keys(p_payload) field(key)
       WHERE field.key <> ALL(ARRAY[
         'tenantId','sourceSystem','sourceDatabase','sourceCompanyId','reason'
       ])
     )
     OR jsonb_typeof(p_payload->'tenantId') IS DISTINCT FROM 'string'
     OR (p_payload->>'tenantId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR jsonb_typeof(p_payload->'sourceSystem') IS DISTINCT FROM 'string'
     OR p_payload->>'sourceSystem' <> 'GRH'
     OR jsonb_typeof(p_payload->'sourceDatabase') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_payload->'sourceCompanyId') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'SOURCE_BINDING_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  tenant_id_value := (p_payload->>'tenantId')::uuid;
  source_database_value := p_payload->>'sourceDatabase';
  source_company_id_value := (p_payload->>'sourceCompanyId')::bigint;
  reason_value := btrim(p_payload->>'reason');
  IF source_database_value IS DISTINCT FROM btrim(source_database_value)
     OR source_database_value !~ '^[A-Za-z_][A-Za-z0-9_$-]{0,127}$'
     OR source_company_id_value < 1
     OR length(reason_value) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'SOURCE_BINDING_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- La autoridad del replay se deriva en PostgreSQL. El hash suministrado se
  -- liga al sobre, pero no puede reemplazar sesion/version/release/payload.
  command_hash_value := encode(digest(convert_to(jsonb_build_object(
    'command', 'bind_source',
    'idempotencyKey', p_idempotency_key,
    'expectedVersion', p_expected_version,
    'payload', p_payload,
    'actorSessionId', p_actor_session_id,
    'actorSessionVersion', p_actor_session_version,
    'releaseSha', p_release_sha,
    'callerCommandHash', p_command_hash
  )::text, 'UTF8'), 'sha256'), 'hex');
  reason_hash_value := encode(digest(convert_to(reason_value, 'UTF8'), 'sha256'), 'hex');

  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    actor_email, p_actor_session_id, p_actor_session_version,
    'platform.tenants.manage'
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    actor_email || ':' || p_idempotency_key::text, 0
  ));
  SELECT * INTO replay FROM tenant_iam_event event
  WHERE lower(event.actor_user_email) = actor_email
    AND event.idempotency_key = p_idempotency_key FOR SHARE;
  IF FOUND THEN
    SELECT * INTO replay_context
    FROM tenant_identity_platform_event_context context
    WHERE context.event_id = replay.id FOR SHARE;
    IF NOT FOUND
       OR replay.command IS DISTINCT FROM 'bind_source'
       OR replay.command_hash IS DISTINCT FROM command_hash_value
       OR replay_context.actor_session_id IS DISTINCT FROM p_actor_session_id
       OR replay_context.actor_session_version IS DISTINCT FROM p_actor_session_version
       OR replay_context.release_sha IS DISTINCT FROM p_release_sha
       OR replay_context.expected_version IS DISTINCT FROM p_expected_version
       OR replay_context.command IS DISTINCT FROM 'bind_source'
       OR replay_context.command_hash IS DISTINCT FROM command_hash_value
       OR replay_context.reason_code IS DISTINCT FROM 'bind_source'
       OR replay_context.reason_hash IS DISTINCT FROM reason_hash_value THEN
      RAISE EXCEPTION 'SOURCE_BINDING_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    RETURN replay.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    tenant_id_value::text || ':source-binding', 14014
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'GRH:' || source_database_value || ':' || source_company_id_value::text, 14014
  ));

  SELECT * INTO policy_row FROM tenant_identity_policy policy
  WHERE policy.tenant_id = tenant_id_value FOR UPDATE;
  IF NOT FOUND OR policy_row.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION 'SOURCE_BINDING_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF policy_row.tenant_data_plane_ready IS TRUE
     OR policy_row.certified_source_binding_id IS NOT NULL
     OR policy_row.certified_release_sha IS NOT NULL THEN
    RAISE EXCEPTION 'SOURCE_BINDING_DATA_PLANE_ALREADY_CERTIFIED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO tenant_row FROM platform_tenant tenant
  WHERE tenant.id = tenant_id_value FOR UPDATE;
  IF NOT FOUND OR tenant_row.status NOT IN ('onboarding','active') THEN
    RAISE EXCEPTION 'SOURCE_BINDING_TENANT_NOT_ELIGIBLE' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM platform_tenant_source_binding binding
    WHERE binding.tenant_id = tenant_id_value AND binding.source_system = 'GRH'
    FOR SHARE
  ) THEN
    RAISE EXCEPTION 'SOURCE_BINDING_ALREADY_EXISTS' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM platform_tenant_source_binding binding
    WHERE binding.source_system = 'GRH'
      AND binding.source_database = source_database_value
      AND binding.source_company_id = source_company_id_value
    FOR SHARE
  ) THEN
    RAISE EXCEPTION 'SOURCE_BINDING_COORDINATE_IN_USE' USING ERRCODE = 'P0001';
  END IF;

  SELECT max(batch.source_cutoff) INTO canonical_source_cutoff
  FROM source_import_batch batch
  WHERE batch.source_system = 'GRH'
    AND batch.source_database = source_database_value
    AND batch.validation_state = 'published'
    AND batch.legacy_import_run_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM employment_contract contract
      WHERE contract.source_system = 'GRH'
        AND contract.source_batch_id = batch.id
        AND contract.legacy_company_id = source_company_id_value
    );
  IF canonical_source_cutoff IS NULL THEN
    RAISE EXCEPTION 'SOURCE_BINDING_CANONICAL_EVIDENCE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO canonical_batch_count
  FROM source_import_batch batch
  WHERE batch.source_system = 'GRH'
    AND batch.source_database = source_database_value
    AND batch.validation_state = 'published'
    AND batch.legacy_import_run_id IS NOT NULL
    AND batch.source_cutoff = canonical_source_cutoff
    AND EXISTS (
      SELECT 1 FROM employment_contract contract
      WHERE contract.source_system = 'GRH'
        AND contract.source_batch_id = batch.id
        AND contract.legacy_company_id = source_company_id_value
    );
  IF canonical_batch_count <> 1 THEN
    RAISE EXCEPTION 'SOURCE_BINDING_CANONICAL_EVIDENCE_AMBIGUOUS' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO source_batch_row FROM source_import_batch batch
  WHERE batch.source_system = 'GRH'
    AND batch.source_database = source_database_value
    AND batch.validation_state = 'published'
    AND batch.legacy_import_run_id IS NOT NULL
    AND batch.source_cutoff = canonical_source_cutoff
    AND EXISTS (
      SELECT 1 FROM employment_contract contract
      WHERE contract.source_system = 'GRH'
        AND contract.source_batch_id = batch.id
        AND contract.legacy_company_id = source_company_id_value
    )
  FOR SHARE OF batch;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_BINDING_CANONICAL_EVIDENCE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM contract.id FROM employment_contract contract
  WHERE contract.source_system = 'GRH'
    AND contract.source_batch_id = source_batch_row.id
    AND contract.legacy_company_id = source_company_id_value
  FOR SHARE OF contract;
  GET DIAGNOSTICS canonical_contract_count = ROW_COUNT;
  IF canonical_contract_count < 1 THEN
    RAISE EXCEPTION 'SOURCE_BINDING_CANONICAL_EVIDENCE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO platform_tenant_source_binding (
    tenant_id, source_system, source_database, source_company_id,
    verified, verified_by_user_email, verified_at
  ) VALUES (
    tenant_id_value, 'GRH', source_database_value, source_company_id_value,
    true, actor_email, now()
  ) RETURNING * INTO source_binding_row;

  UPDATE tenant_identity_policy policy SET
    version = policy.version + 1,
    updated_at = now()
  WHERE policy.tenant_id = tenant_id_value
    AND policy.version = p_expected_version
  RETURNING * INTO policy_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_BINDING_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  result_value := jsonb_build_object(
    'sourceBinding', jsonb_build_object(
      'id', source_binding_row.id,
      'tenantId', source_binding_row.tenant_id,
      'sourceSystem', source_binding_row.source_system,
      'sourceDatabase', source_binding_row.source_database,
      'sourceCompanyId', source_binding_row.source_company_id,
      'verified', source_binding_row.verified
    ),
    'canonicalEvidence', jsonb_build_object(
      'sourceBatchId', source_batch_row.id,
      'sourceCutoff', source_batch_row.source_cutoff,
      'validationState', source_batch_row.validation_state,
      'contractCount', canonical_contract_count
    ),
    'policyVersion', policy_row.version,
    'releaseSha', p_release_sha,
    'actorSessionVersion', p_actor_session_version,
    'replayed', false
  );

  INSERT INTO tenant_iam_event (
    actor_user_email, tenant_id, membership_id, command, target_type, target_id,
    idempotency_key, command_hash, result
  ) VALUES (
    actor_email, tenant_id_value, NULL, 'bind_source', 'source_binding',
    source_binding_row.id::text, p_idempotency_key, command_hash_value, result_value
  ) RETURNING id INTO event_id_value;
  INSERT INTO tenant_identity_platform_event_context (
    event_id, actor_session_id, actor_session_version, release_sha,
    expected_version, command, command_hash, reason_code, reason_hash
  ) VALUES (
    event_id_value, p_actor_session_id, p_actor_session_version, p_release_sha,
    p_expected_version, 'bind_source', command_hash_value, 'bind_source', reason_hash_value
  );
  RETURN result_value;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'SOURCE_BINDING_COMMAND_INVALID' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION tenant_identity_source_onboarding_view_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  tenant_row platform_tenant%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  source_binding_row platform_tenant_source_binding%ROWTYPE;
  source_batch_row source_import_batch%ROWTYPE;
  binding_count bigint := 0;
  verified_binding_count bigint := 0;
  canonical_source_cutoff timestamptz;
  canonical_batch_count bigint := 0;
  canonical_contract_count bigint := 0;
  allowed_commands jsonb := '[]'::jsonb;
  result_value jsonb;
BEGIN
  IF p_release_sha IS NULL OR p_release_sha !~ '^[a-f0-9]{40}$'
     OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'SOURCE_ONBOARDING_VIEW_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM tenant_lifecycle_assert_platform_capability_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    'platform.tenants.manage'
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_tenant_id::text || ':source-binding', 14014
  ));

  SELECT * INTO tenant_row FROM platform_tenant tenant
  WHERE tenant.id = p_tenant_id AND tenant.status IN ('onboarding','active')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOURCE_ONBOARDING_TENANT_NOT_ELIGIBLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO policy_row FROM tenant_identity_policy policy
  WHERE policy.tenant_id = p_tenant_id FOR SHARE;
  IF NOT FOUND OR policy_row.version < 1 THEN
    RAISE EXCEPTION 'SOURCE_ONBOARDING_POLICY_DRIFT' USING ERRCODE = 'P0001';
  END IF;

  PERFORM binding.id FROM platform_tenant_source_binding binding
  WHERE binding.tenant_id = p_tenant_id AND binding.source_system = 'GRH'
  ORDER BY binding.id FOR SHARE OF binding;
  SELECT count(*), count(*) FILTER (WHERE binding.verified IS TRUE)
    INTO binding_count, verified_binding_count
  FROM platform_tenant_source_binding binding
  WHERE binding.tenant_id = p_tenant_id AND binding.source_system = 'GRH';
  IF binding_count > 1 OR verified_binding_count <> binding_count THEN
    RAISE EXCEPTION 'SOURCE_ONBOARDING_BINDING_DRIFT' USING ERRCODE = 'P0001';
  END IF;

  IF binding_count = 1 THEN
    SELECT * INTO source_binding_row
    FROM platform_tenant_source_binding binding
    WHERE binding.tenant_id = p_tenant_id
      AND binding.source_system = 'GRH'
      AND binding.verified IS TRUE
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOURCE_ONBOARDING_BINDING_DRIFT' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF policy_row.tenant_data_plane_ready IS TRUE THEN
    IF binding_count <> 1
       OR policy_row.certified_source_binding_id IS DISTINCT FROM source_binding_row.id
       OR policy_row.certified_release_sha IS DISTINCT FROM p_release_sha
       OR policy_row.certified_by_user_email IS NULL
       OR policy_row.certified_at IS NULL THEN
      RAISE EXCEPTION 'SOURCE_ONBOARDING_POLICY_DRIFT' USING ERRCODE = 'P0001';
    END IF;
  ELSIF policy_row.certified_source_binding_id IS NOT NULL
     OR policy_row.certified_release_sha IS NOT NULL
     OR policy_row.certified_by_user_email IS NOT NULL
     OR policy_row.certified_at IS NOT NULL
     OR policy_row.invitation_delivery_ready IS TRUE THEN
    RAISE EXCEPTION 'SOURCE_ONBOARDING_POLICY_DRIFT' USING ERRCODE = 'P0001';
  END IF;

  IF binding_count = 1 THEN
    SELECT max(batch.source_cutoff) INTO canonical_source_cutoff
    FROM source_import_batch batch
    WHERE batch.source_system = 'GRH'
      AND batch.source_database = source_binding_row.source_database
      AND batch.validation_state = 'published'
      AND batch.legacy_import_run_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM employment_contract contract
        WHERE contract.source_system = 'GRH'
          AND contract.source_batch_id = batch.id
          AND contract.legacy_company_id = source_binding_row.source_company_id
      );
    IF canonical_source_cutoff IS NULL THEN
      RAISE EXCEPTION 'SOURCE_ONBOARDING_CANONICAL_EVIDENCE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    SELECT count(*) INTO canonical_batch_count
    FROM source_import_batch batch
    WHERE batch.source_system = 'GRH'
      AND batch.source_database = source_binding_row.source_database
      AND batch.validation_state = 'published'
      AND batch.legacy_import_run_id IS NOT NULL
      AND batch.source_cutoff = canonical_source_cutoff
      AND EXISTS (
        SELECT 1 FROM employment_contract contract
        WHERE contract.source_system = 'GRH'
          AND contract.source_batch_id = batch.id
          AND contract.legacy_company_id = source_binding_row.source_company_id
      );
    IF canonical_batch_count <> 1 THEN
      RAISE EXCEPTION 'SOURCE_ONBOARDING_CANONICAL_EVIDENCE_AMBIGUOUS' USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO source_batch_row FROM source_import_batch batch
    WHERE batch.source_system = 'GRH'
      AND batch.source_database = source_binding_row.source_database
      AND batch.validation_state = 'published'
      AND batch.legacy_import_run_id IS NOT NULL
      AND batch.source_cutoff = canonical_source_cutoff
      AND EXISTS (
        SELECT 1 FROM employment_contract contract
        WHERE contract.source_system = 'GRH'
          AND contract.source_batch_id = batch.id
          AND contract.legacy_company_id = source_binding_row.source_company_id
      )
    FOR SHARE OF batch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'SOURCE_ONBOARDING_CANONICAL_EVIDENCE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

    PERFORM contract.id FROM employment_contract contract
    WHERE contract.source_system = 'GRH'
      AND contract.source_batch_id = source_batch_row.id
      AND contract.legacy_company_id = source_binding_row.source_company_id
    FOR SHARE OF contract;
    GET DIAGNOSTICS canonical_contract_count = ROW_COUNT;
    IF canonical_contract_count < 1 THEN
      RAISE EXCEPTION 'SOURCE_ONBOARDING_CANONICAL_EVIDENCE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF policy_row.tenant_data_plane_ready IS TRUE THEN
    allowed_commands := '[]'::jsonb;
  ELSIF binding_count = 0 THEN
    allowed_commands := jsonb_build_array('bind_source');
  ELSE
    allowed_commands := jsonb_build_array('certify_data_plane');
  END IF;

  result_value := jsonb_build_object(
    'identityPolicy', jsonb_build_object(
      'version', policy_row.version,
      'dataPlaneReady', policy_row.tenant_data_plane_ready
    ),
    'allowedCommands', allowed_commands
  );
  IF binding_count = 1 THEN
    result_value := result_value || jsonb_build_object(
      'sourceBinding', jsonb_build_object(
        'id', source_binding_row.id,
        'sourceSystem', source_binding_row.source_system,
        'verified', source_binding_row.verified
      ),
      'canonicalEvidence', jsonb_build_object(
        'sourceCutoff', source_batch_row.source_cutoff,
        'validationState', source_batch_row.validation_state,
        'contractCount', canonical_contract_count
      )
    );
  END IF;
  RETURN result_value;
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
BEGIN
  IF p_command = 'bind_source' THEN
    RETURN tenant_identity_bind_source_core_014(
      p_actor_email, p_actor_session_id, p_actor_session_version, p_release_sha,
      p_idempotency_key, p_command_hash, p_expected_version, p_payload
    );
  END IF;
  RETURN tenant_identity_apply_platform_command_core_014(
    p_actor_email, p_actor_session_id, p_actor_session_version, p_release_sha,
    p_command, p_idempotency_key, p_command_hash, p_expected_version, p_payload
  );
END
$$;

COMMENT ON FUNCTION tenant_identity_bind_source_core_014(text,uuid,integer,text,uuid,text,integer,jsonb) IS
  'Core interno 014: acredita GRH published y contratos antes de crear binding verified; no expone motivo ni PII.';
COMMENT ON FUNCTION tenant_identity_apply_platform_command_core_014(text,uuid,integer,text,text,uuid,text,integer,jsonb) IS
  'Core interno de la fachada platform 009, preservado por 014 y sin EXECUTE runtime.';
COMMENT ON FUNCTION tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb) IS
  'Fachada platform v2: bind_source session/MFA/capability/release/version-bound; los demas comandos delegan al core 009.';
COMMENT ON FUNCTION tenant_identity_source_onboarding_view_v1(text,uuid,integer,text,uuid) IS
  'Lectura reanudable del onboarding de fuente: policy/binding/evidencia agregada sin coordenadas, motivo ni PII.';

REVOKE ALL ON FUNCTION tenant_identity_bind_source_core_014(text,uuid,integer,text,uuid,text,integer,jsonb)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_apply_platform_command_core_014(text,uuid,integer,text,text,uuid,text,integer,jsonb)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_source_onboarding_view_v1(text,uuid,integer,text,uuid)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)
  FROM PUBLIC CASCADE;
REVOKE ALL ON FUNCTION tenant_identity_apply_command_core_009(text,text,uuid,text,integer,jsonb)
  FROM PUBLIC CASCADE;
REVOKE ALL ON TABLE platform_tenant_source_binding, tenant_identity_policy,
  source_import_batch, employment_contract, tenant_iam_event,
  tenant_identity_platform_event_context FROM PUBLIC CASCADE;

DO $source_binding_function_acl_hardening$
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
      'public.tenant_identity_bind_source_core_014(text,uuid,integer,text,uuid,text,integer,jsonb)'::regprocedure,
      'public.tenant_identity_apply_platform_command_core_014(text,uuid,integer,text,text,uuid,text,integer,jsonb)'::regprocedure,
      'public.tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)'::regprocedure,
      'public.tenant_identity_source_onboarding_view_v1(text,uuid,integer,text,uuid)'::regprocedure,
      'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)'::regprocedure,
      'public.tenant_identity_apply_command_core_009(text,text,uuid,text,integer,jsonb)'::regprocedure
    )
      AND acl.grantee <> function_row.proowner
  LOOP
    IF acl_row.grantee = 0 THEN
      grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'SOURCE_BINDING_FUNCTION_ACL_GRANTEE_UNKNOWN' USING ERRCODE = 'P0001';
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
$source_binding_function_acl_hardening$;

DO $source_binding_runtime_acl$
DECLARE
  table_acl record;
  column_acl record;
  grantee_sql text;
BEGIN
  FOR table_acl IN
    SELECT relation.relname AS table_name, relation.relowner,
      acl.grantee, grantee_role.rolname AS grantee_name, acl.privilege_type
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      relation.relacl, acldefault('r', relation.relowner)
    )) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'platform_tenant_source_binding', 'tenant_identity_policy',
        'source_import_batch', 'employment_contract', 'tenant_iam_event',
        'tenant_identity_platform_event_context'
      )
      AND acl.grantee <> relation.relowner
      AND acl.privilege_type IN (
        'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
      )
  LOOP
    IF table_acl.grantee = 0 THEN
      grantee_sql := 'PUBLIC';
    ELSIF table_acl.grantee_name IS NULL THEN
      RAISE EXCEPTION 'SOURCE_BINDING_TABLE_ACL_GRANTEE_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE
      grantee_sql := format('%I', table_acl.grantee_name);
    END IF;
    EXECUTE format(
      'REVOKE %s ON TABLE public.%I FROM %s CASCADE',
      table_acl.privilege_type, table_acl.table_name, grantee_sql
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
      ON TABLE platform_tenant_source_binding, tenant_identity_policy,
        source_import_batch, employment_contract, tenant_iam_event,
        tenant_identity_platform_event_context
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_identity_bind_source_core_014(text,uuid,integer,text,uuid,text,integer,jsonb)
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_identity_apply_platform_command_core_014(text,uuid,integer,text,text,uuid,text,integer,jsonb)
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_identity_apply_command_core_009(text,text,uuid,text,integer,jsonb)
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_identity_source_onboarding_view_v1(text,uuid,integer,text,uuid)
      FROM municontrol_actions_runtime_app CASCADE;
    REVOKE ALL ON FUNCTION tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)
      FROM municontrol_actions_runtime_app CASCADE;
    GRANT EXECUTE ON FUNCTION tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)
      TO municontrol_actions_runtime_app;
    GRANT EXECUTE ON FUNCTION tenant_identity_source_onboarding_view_v1(text,uuid,integer,text,uuid)
      TO municontrol_actions_runtime_app;
    GRANT EXECUTE ON FUNCTION tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)
      TO municontrol_actions_runtime_app;
  END IF;

  FOR column_acl IN
    SELECT relation.relname AS table_name, attribute.attname AS column_name,
      acl.grantee, grantee_role.rolname AS grantee_name, acl.privilege_type
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE
    CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
    LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'platform_tenant_source_binding', 'tenant_identity_policy',
        'source_import_batch', 'employment_contract', 'tenant_iam_event',
        'tenant_identity_platform_event_context'
      )
      AND (
        acl.grantee = 0
        OR (acl.grantee <> relation.relowner
          AND acl.privilege_type IN ('INSERT','UPDATE','REFERENCES'))
      )
  LOOP
    IF column_acl.grantee = 0 THEN
      grantee_sql := 'PUBLIC';
    ELSIF column_acl.grantee_name IS NULL THEN
      RAISE EXCEPTION 'SOURCE_BINDING_COLUMN_ACL_GRANTEE_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE
      grantee_sql := format('%I', column_acl.grantee_name);
    END IF;
    EXECUTE format(
      'REVOKE %s (%I) ON TABLE public.%I FROM %s CASCADE',
      column_acl.privilege_type, column_acl.column_name,
      column_acl.table_name, grantee_sql
    );
  END LOOP;
END
$source_binding_runtime_acl$;
