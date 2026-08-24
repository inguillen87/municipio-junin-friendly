-- MuniControl Friendly - Sprint 017
-- Desbloquea create/update_draft/submit y cancel pendiente para operadores RRHH
-- con membership, capability y scope tenant exactos aunque no tengan vinculo laboral.
-- Las decisiones y la cancelacion de aprobadas siguen exigiendo vinculo y SoD.

CREATE OR REPLACE FUNCTION public.action_center_apply_tenant_command(
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
          AND (preparation_event.actor_membership_id = membership.id
            OR (preparation_event.actor_person_id IS NOT NULL
              AND preparation_event.actor_person_id = actor_person_snapshot_id))
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
             AND (preparation_event.actor_membership_id = membership.id
               OR (preparation_event.actor_person_id IS NOT NULL
                 AND preparation_event.actor_person_id = actor_person_snapshot_id))
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
            AND (preparation_event.actor_membership_id = membership.id
              OR (preparation_event.actor_person_id IS NOT NULL
                AND preparation_event.actor_person_id = actor_person_snapshot_id))
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

COMMENT ON FUNCTION public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean) IS
  'Runtime tenant: permite crear, editar, presentar y cancelar pendiente por scope sin vinculo; decisiones y cancelacion aprobada exigen actor vinculado y SoD.';

COMMENT ON COLUMN public.action_case_event.actor_person_id IS
  'Snapshot de identidad natural cuando existe vinculo: puede ser NULL en preparacion area-scoped; decisiones exigen vinculo y SoD por membership y persona conocida.';

REVOKE ALL ON FUNCTION public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)
  FROM PUBLIC CASCADE;

-- CREATE OR REPLACE conserva ACL preexistentes. Se normaliza a owner + runtime
-- exactos para impedir grants heredados o historicos fuera del contrato 017.
DO $tenant_action_unlinked_operator_acl$
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
      'public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)'::regprocedure
      AND acl.grantee <> function_row.proowner
  LOOP
    IF acl_row.grantee = 0 THEN grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'TENANT_ACTION_FUNCTION_ACL_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
      acl_row.schema_name, acl_row.function_name,
      acl_row.identity_arguments, grantee_sql
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app') THEN
    GRANT EXECUTE ON FUNCTION public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)
      TO municontrol_actions_runtime_app;
  END IF;
END
$tenant_action_unlinked_operator_acl$;
