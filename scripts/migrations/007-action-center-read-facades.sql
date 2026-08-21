-- MuniControl Friendly - Sprint 006B
-- Fachadas de lectura del Centro de Acciones ligadas a sesion v2, tenant y release.
-- Esta migracion es aditiva: 003-006 son artefactos inmutables ya promovidos.

CREATE OR REPLACE FUNCTION action_center_assert_tenant_read_session_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  session_row tenant_identity_session%ROWTYPE;
  user_row internal_users%ROWTYPE;
  membership_row tenant_membership%ROWTYPE;
  policy_row tenant_identity_policy%ROWTYPE;
  binding_row platform_tenant_source_binding%ROWTYPE;
  authority_row tenant_action_authority%ROWTYPE;
  employment_id uuid;
  actor_person_id uuid;
  capabilities jsonb := '[]'::jsonb;
  scopes jsonb := '[]'::jsonb;
BEGIN
  IF p_actor_session_id IS NULL
     OR p_actor_session_version IS NULL OR p_actor_session_version < 1
     OR p_tenant_id IS NULL OR p_membership_id IS NULL
     OR lower(COALESCE(p_release_sha, '')) !~ '^[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- Orden global de identidad: usuario -> membership -> sesion. Los locks posteriores
  -- son NOWAIT para no formar ciclos con los flujos 005 que revocan sesiones desde
  -- usuario/membership ni con switch_context, que ya posee la sesion antes del usuario.
  SELECT * INTO user_row FROM internal_users users
  WHERE lower(users.email) = lower(btrim(p_actor_email))
    AND users.active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO membership_row FROM tenant_membership membership
  WHERE membership.id = p_membership_id
    AND membership.tenant_id = p_tenant_id
    AND lower(membership.user_email) = lower(user_row.email)
    AND membership.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO session_row
  FROM tenant_identity_session identity_session
  WHERE identity_session.id = p_actor_session_id
    AND identity_session.session_version = p_actor_session_version
    AND lower(identity_session.user_email) = lower(user_row.email)
    AND identity_session.identity_version = user_row.identity_version
    AND identity_session.active_tenant_id = p_tenant_id
    AND identity_session.source = 'membership'
    AND identity_session.auth_level IN ('mfa', 'recovery')
    AND identity_session.status = 'active'
    AND identity_session.expires_at > now()
    AND identity_session.last_seen_at > now() - interval '1 hour'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM platform_tenant tenant
  WHERE tenant.id = membership_row.tenant_id AND tenant.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_SESSION_INVALID' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO policy_row FROM tenant_identity_policy policy
  WHERE policy.tenant_id = membership_row.tenant_id
    AND policy.tenant_data_plane_ready IS TRUE
    AND lower(policy.certified_release_sha) = lower(p_release_sha)
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO binding_row FROM platform_tenant_source_binding binding
  WHERE binding.id = policy_row.certified_source_binding_id
    AND binding.tenant_id = membership_row.tenant_id
    AND binding.source_system = 'GRH'
    AND binding.verified IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_SOURCE_BINDING_REQUIRED' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO authority_row FROM tenant_action_authority authority
  WHERE authority.membership_id = membership_row.id
    AND authority.tenant_id = membership_row.tenant_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_TENANT_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001'; END IF;

  PERFORM tenant_iam_assert_no_sod_conflict(membership_row.id);
  IF NOT EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities(membership_row.id) effective
    WHERE effective.capability_key = 'actions.read'
  ) THEN
    RAISE EXCEPTION 'ACTION_TENANT_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT link.employment_contract_id, contract.person_id
    INTO employment_id, actor_person_id
  FROM tenant_action_employment_link link
  JOIN employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = binding_row.source_company_id
  JOIN source_import_batch batch
    ON batch.id = contract.source_batch_id
   AND batch.source_system = 'GRH'
   AND batch.source_database = binding_row.source_database
   AND batch.validation_state = 'published'
   AND batch.legacy_import_run_id IS NOT NULL
  WHERE link.membership_id = membership_row.id
    AND link.tenant_id = membership_row.tenant_id
    AND link.source_binding_id = binding_row.id
    AND link.active IS TRUE
  FOR SHARE OF link, contract, batch;

  SELECT COALESCE(jsonb_agg(item.capability_key ORDER BY item.capability_key), '[]'::jsonb)
    INTO capabilities
  FROM tenant_iam_effective_capabilities(membership_row.id) item;

  SELECT COALESCE(jsonb_agg(to_jsonb(item) ORDER BY item."capabilityKey", item."scopeLevel", item.id), '[]'::jsonb)
    INTO scopes
  FROM (
    SELECT scope.id, scope.capability_key AS "capabilityKey",
      scope.scope_level AS "scopeLevel", scope.company_id AS "companyId",
      scope.organization_unit_source_id AS "organizationUnitSourceId",
      scope.sector_source_id AS "sectorSourceId"
    FROM tenant_action_area_scope scope
    JOIN tenant_iam_effective_capabilities(membership_row.id) effective
      ON effective.capability_key = scope.capability_key
    WHERE scope.membership_id = membership_row.id
      AND scope.tenant_id = membership_row.tenant_id
      AND scope.source_binding_id = binding_row.id
      AND scope.company_id = binding_row.source_company_id
      AND scope.active IS TRUE
  ) item;

  RETURN jsonb_build_object(
    'email', lower(user_row.email),
    'displayName', user_row.display_name,
    'tenantId', membership_row.tenant_id,
    'membershipId', membership_row.id,
    'roleKey', membership_row.role_key,
    'sourceBindingId', binding_row.id,
    'sourceCompanyId', binding_row.source_company_id,
    'sourceDatabase', binding_row.source_database,
    'employmentContractId', employment_id,
    'actorPersonId', actor_person_id,
    'capabilities', capabilities,
    'areaScopes', scopes
  );
EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'ACTION_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION action_center_context_has_capability(
  p_context jsonb, p_capability text
)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(p_context->'capabilities', '[]'::jsonb) ? p_capability
$$;

CREATE OR REPLACE FUNCTION action_center_context_has_area_scope(
  p_context jsonb,
  p_capability text,
  p_company_id bigint,
  p_organization_unit_source_id text,
  p_sector_source_id text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tenant_action_area_scope scope
    JOIN tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) effective
      ON effective.capability_key = scope.capability_key
    WHERE scope.membership_id = (p_context->>'membershipId')::uuid
      AND scope.tenant_id = (p_context->>'tenantId')::uuid
      AND scope.source_binding_id = (p_context->>'sourceBindingId')::uuid
      AND scope.company_id = (p_context->>'sourceCompanyId')::bigint
      AND scope.company_id = p_company_id
      AND scope.capability_key = p_capability
      AND scope.active IS TRUE
      AND (
        scope.scope_level = 'company'
        OR (scope.scope_level = 'organization'
          AND scope.organization_unit_source_id = p_organization_unit_source_id)
        OR (scope.scope_level = 'sector'
          AND scope.organization_unit_source_id = p_organization_unit_source_id
          AND scope.sector_source_id = p_sector_source_id)
      )
  )
$$;

CREATE OR REPLACE FUNCTION action_center_context_nominal_read(
  p_context jsonb,
  p_beneficiary_contract_id uuid,
  p_company_id bigint,
  p_organization_unit_source_id text,
  p_sector_source_id text,
  p_confidentiality text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  self_case boolean := COALESCE(p_context->>'employmentContractId', '') = p_beneficiary_contract_id::text;
  confidentiality_allowed boolean;
BEGIN
  IF p_company_id <> (p_context->>'sourceCompanyId')::bigint THEN RETURN false; END IF;
  confidentiality_allowed := p_confidentiality = 'standard'
    OR self_case
    OR action_center_context_has_capability(p_context, 'leave.request.restricted.read');
  IF NOT confidentiality_allowed THEN RETURN false; END IF;
  RETURN (self_case AND action_center_context_has_capability(p_context, 'leave.request.self.read'))
    OR action_center_context_has_capability(p_context, 'leave.request.all.manage')
    OR action_center_context_has_capability(p_context, 'leave.request.all.read')
    OR action_center_context_has_area_scope(
      p_context, 'leave.request.area.read', p_company_id,
      p_organization_unit_source_id, p_sector_source_id
    );
END
$$;

CREATE OR REPLACE FUNCTION action_center_context_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE context_value jsonb;
BEGIN
  context_value := action_center_assert_tenant_read_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  RETURN jsonb_build_object('principal', context_value);
END
$$;

CREATE OR REPLACE FUNCTION action_center_tenant_bootstrap_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_subject_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  normalized_query text := btrim(COALESCE(p_subject_query, ''));
  escaped_query text;
  subject_rows jsonb := '[]'::jsonb;
  reason_rows jsonb := '[]'::jsonb;
  source_value jsonb;
  result_count integer := 0;
BEGIN
  context_value := action_center_assert_tenant_read_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  IF normalized_query <> '' AND (char_length(normalized_query) < 2 OR char_length(normalized_query) > 50) THEN
    RAISE EXCEPTION 'ACTION_SUBJECT_QUERY_INVALID' USING ERRCODE = 'P0001';
  END IF;
  escaped_query := replace(replace(replace(normalized_query, '\', '\\'), '%', '\%'), '_', '\_');

  WITH candidates AS MATERIALIZED (
    SELECT contract.id, contract.legacy_company_id, contract.legacy_legajo,
      contract.organization_unit_source_id, contract.sector_source_id,
      COALESCE(NULLIF(employee.nombre, ''), NULLIF(identity.full_name, ''), 'Nombre no informado') AS display_name,
      COALESCE(NULLIF(employee.sector, ''), 'Sector no informado') AS sector,
      contract.id::text = COALESCE(context_value->>'employmentContractId', '') AS self_candidate,
      action_center_tenant_actor_authorized(
        context_value->>'email', (context_value->>'tenantId')::uuid,
        (context_value->>'membershipId')::uuid, 'create', contract.id,
        contract.legacy_company_id, contract.organization_unit_source_id,
        contract.sector_source_id, 'draft', 'standard'
      ) AS standard_allowed,
      action_center_tenant_actor_authorized(
        context_value->>'email', (context_value->>'tenantId')::uuid,
        (context_value->>'membershipId')::uuid, 'create', contract.id,
        contract.legacy_company_id, contract.organization_unit_source_id,
        contract.sector_source_id, 'draft', 'restricted'
      ) AS restricted_allowed
    FROM employment_contract contract
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = context_value->>'sourceDatabase'
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    JOIN person_identity identity ON identity.id = contract.person_id
    LEFT JOIN grh_employees employee
      ON employee.company_id = contract.legacy_company_id
     AND employee.legajo = contract.legacy_legajo
     AND employee.import_run_id = batch.legacy_import_run_id
    WHERE contract.status = 'active'
      AND contract.source_system = 'GRH'
      AND contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint
      AND (
        (normalized_query = '' AND contract.id::text = COALESCE(context_value->>'employmentContractId', ''))
        OR (normalized_query <> '' AND (
          contract.legacy_legajo ILIKE '%' || escaped_query || '%' ESCAPE '\'
          OR COALESCE(employee.nombre, identity.full_name, '') ILIKE '%' || escaped_query || '%' ESCAPE '\'
          OR COALESCE(employee.sector, '') ILIKE '%' || escaped_query || '%' ESCAPE '\'
        ))
      )
  ), authorized AS MATERIALIZED (
    SELECT * FROM candidates WHERE standard_allowed OR restricted_allowed
  ), page_rows AS (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'contractId', id,
      'displayName', display_name,
      'legajo', legacy_legajo,
      'sector', sector,
      'allowedConfidentialities',
        CASE
          WHEN standard_allowed AND restricted_allowed THEN jsonb_build_array('standard', 'restricted')
          WHEN restricted_allowed THEN jsonb_build_array('restricted')
          ELSE jsonb_build_array('standard')
        END,
      'accessBasis', CASE WHEN self_candidate THEN 'self' ELSE 'authorized_scope' END
    )) AS item, display_name, legacy_legajo
    FROM authorized
    ORDER BY display_name, legacy_legajo, id
    LIMIT 51
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY display_name, legacy_legajo), '[]'::jsonb), count(*)::integer
    INTO subject_rows, result_count
  FROM page_rows;

  IF result_count > 50 THEN subject_rows := subject_rows - 50; END IF;

  WITH published AS (
    SELECT batch.*
    FROM source_import_batch batch
    WHERE batch.source_system = 'GRH'
      AND batch.source_database = context_value->>'sourceDatabase'
      AND batch.validation_state = 'published'
      AND batch.legacy_import_run_id IS NOT NULL
    ORDER BY batch.source_cutoff DESC, batch.recorded_at DESC, batch.id DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
      'label', 'GRH canónica',
      'cutoff', published.source_cutoff,
      'version', 'snapshot publicado'
    ),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sourceKey', catalog.source_key::jsonb ->> 'reasonCode',
        'label', catalog.label
      ) ORDER BY (catalog.source_key::jsonb ->> 'reasonCode')::integer)
      FROM grh_catalog_rows catalog
      WHERE catalog.catalog = 'absence_reasons'
        AND catalog.import_run_id = published.legacy_import_run_id
    ), '[]'::jsonb)
    INTO source_value, reason_rows
  FROM published;

  IF source_value IS NULL THEN
    source_value := jsonb_build_object(
      'label', 'GRH canónica', 'cutoff', NULL, 'version', 'sin snapshot publicado'
    );
  END IF;

  RETURN jsonb_build_object(
    'principal', context_value,
    'source', source_value,
    'subjects', COALESCE(subject_rows, '[]'::jsonb),
    'subjectsTruncated', result_count > 50,
    'reasonRows', reason_rows
  );
END
$$;

CREATE OR REPLACE FUNCTION action_center_tenant_list_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_case_type text,
  p_view text,
  p_status text,
  p_page integer,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  normalized_view text := lower(btrim(COALESCE(p_view, 'mine')));
  normalized_status text := NULLIF(lower(btrim(COALESCE(p_status, ''))), '');
  records_value jsonb := '[]'::jsonb;
  total_value integer := 0;
  has_area_read boolean := false;
  has_global_read boolean := false;
  has_closed_read boolean := false;
BEGIN
  context_value := action_center_assert_tenant_read_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  IF p_case_type <> 'leave_request' THEN
    RAISE EXCEPTION 'ACTION_CASE_TYPE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF normalized_view NOT IN ('mine', 'area', 'authorized', 'closed') THEN
    RAISE EXCEPTION 'ACTION_VIEW_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF normalized_status IS NOT NULL
     AND normalized_status NOT IN ('draft', 'submitted', 'approved', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'ACTION_STATUS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 200
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'ACTION_PAGINATION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  has_area_read := EXISTS (
    SELECT 1 FROM tenant_action_area_scope scope
    JOIN tenant_iam_effective_capabilities((context_value->>'membershipId')::uuid) effective
      ON effective.capability_key = scope.capability_key
    WHERE scope.membership_id = (context_value->>'membershipId')::uuid
      AND scope.tenant_id = (context_value->>'tenantId')::uuid
      AND scope.source_binding_id = (context_value->>'sourceBindingId')::uuid
      AND scope.company_id = (context_value->>'sourceCompanyId')::bigint
      AND scope.capability_key = 'leave.request.area.read'
      AND scope.active IS TRUE
  );
  has_global_read := action_center_context_has_capability(context_value, 'leave.request.all.manage')
    OR action_center_context_has_capability(context_value, 'leave.request.all.read')
    OR action_center_context_has_capability(context_value, 'leave.request.payroll.read');
  has_closed_read := (
      COALESCE(context_value->>'employmentContractId', '') <> ''
      AND action_center_context_has_capability(context_value, 'leave.request.self.read')
    ) OR has_area_read
      OR action_center_context_has_capability(context_value, 'leave.request.all.manage')
      OR action_center_context_has_capability(context_value, 'leave.request.all.read');
  IF (normalized_view = 'area' AND NOT has_area_read)
     OR (normalized_view = 'authorized' AND NOT has_global_read)
     OR (normalized_view = 'closed' AND NOT has_closed_read) THEN
    RAISE EXCEPTION 'ACTION_VIEW_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  WITH candidate AS MATERIALIZED (
    SELECT action.*, contract.legacy_legajo, contract.person_id,
      batch.legacy_import_run_id,
      access.nominal_allowed,
      access.payroll_allowed,
      CASE WHEN access.nominal_allowed THEN 'nominal' ELSE 'payroll' END AS access_mode
    FROM action_case action
    JOIN employment_contract contract
      ON contract.id = action.beneficiary_contract_id
     AND contract.source_system = 'GRH'
     AND contract.source_batch_id = action.source_batch_id
     AND contract.legacy_company_id = action.company_id
    JOIN source_import_batch batch
      ON batch.id = action.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = context_value->>'sourceDatabase'
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    CROSS JOIN LATERAL (
      SELECT
        action_center_context_nominal_read(
          context_value, action.beneficiary_contract_id, action.company_id,
          action.organization_unit_source_id, action.sector_source_id,
          action.confidentiality
        ) AS nominal_allowed,
        (
          action.status = 'approved'
          AND action.confidentiality = 'standard'
          AND action_center_context_has_capability(context_value, 'leave.request.payroll.read')
        ) AS payroll_allowed
    ) access
    WHERE action.case_type = 'leave_request'
      AND action.tenant_id = (context_value->>'tenantId')::uuid
      AND action.source_binding_id = (context_value->>'sourceBindingId')::uuid
      AND action.company_id = (context_value->>'sourceCompanyId')::bigint
      AND (access.nominal_allowed OR access.payroll_allowed)
      AND (normalized_status IS NULL OR action.status = normalized_status)
      AND (
        (normalized_view = 'mine'
          AND access.nominal_allowed
          AND action.beneficiary_contract_id::text = COALESCE(context_value->>'employmentContractId', '')
          AND action_center_context_has_capability(context_value, 'leave.request.self.read'))
        OR (normalized_view = 'area'
          AND access.nominal_allowed
          AND action_center_context_has_area_scope(
            context_value, 'leave.request.area.read', action.company_id,
            action.organization_unit_source_id, action.sector_source_id))
        OR (normalized_view = 'authorized')
        OR (normalized_view = 'closed'
          AND access.nominal_allowed
          AND action.status IN ('rejected', 'cancelled'))
      )
  ), page_rows AS MATERIALIZED (
    SELECT candidate.*
    FROM candidate
    ORDER BY updated_at DESC, id DESC
    LIMIT p_limit OFFSET ((p_page - 1) * p_limit)
  ), projected AS (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'id', page.id,
      'caseNumber', page.case_number,
      'tenantId', CASE WHEN page.nominal_allowed THEN page.tenant_id END,
      'sourceBindingId', CASE WHEN page.nominal_allowed THEN page.source_binding_id END,
      'caseType', page.case_type,
      'beneficiaryContractId', CASE WHEN page.nominal_allowed THEN page.beneficiary_contract_id END,
      'companyId', CASE WHEN page.nominal_allowed THEN page.company_id END,
      'organizationUnitSourceId', CASE WHEN page.nominal_allowed THEN page.organization_unit_source_id END,
      'sectorSourceId', CASE WHEN page.nominal_allowed THEN page.sector_source_id END,
      'status', page.status,
      'confidentiality', page.confidentiality,
      'policyVersionId', page.policy_version_id,
      'payload', jsonb_strip_nulls(jsonb_build_object(
        'reasonCode', page.payload->>'reasonCode',
        'policyRuleId', page.payload->>'policyRuleId',
        'startsOn', page.payload->>'startsOn',
        'endsOn', page.payload->>'endsOn',
        'startsAtLocal', page.payload->>'startsAtLocal',
        'endsAtLocal', page.payload->>'endsAtLocal',
        'durationUnit', page.payload->>'durationUnit'
      )),
      'evidenceStatus', page.evidence_status,
      'updatedAt', page.updated_at,
      'version', page.version,
      'subjectDisplayName', CASE WHEN page.nominal_allowed
        THEN COALESCE(NULLIF(employee.nombre, ''), NULLIF(identity.full_name, ''), 'Nombre no informado') END,
      'subjectLegajo', CASE WHEN page.nominal_allowed THEN page.legacy_legajo END,
      'subjectSector', CASE WHEN page.nominal_allowed
        THEN COALESCE(NULLIF(employee.sector, ''), 'Sector no informado') END,
      'nominalProjection', page.nominal_allowed,
      'projection', page.access_mode
    )) AS item, page.updated_at, page.id
    FROM page_rows page
    LEFT JOIN person_identity identity
      ON identity.id = page.person_id AND page.nominal_allowed
    LEFT JOIN grh_employees employee
      ON employee.company_id = page.company_id
     AND employee.legajo = page.legacy_legajo
     AND employee.import_run_id = page.legacy_import_run_id
     AND page.nominal_allowed
  )
  SELECT
    (SELECT count(*)::integer FROM candidate),
    COALESCE((SELECT jsonb_agg(item ORDER BY updated_at DESC, id DESC) FROM projected), '[]'::jsonb)
  INTO total_value, records_value;

  RETURN jsonb_build_object(
    'principal', context_value,
    'records', records_value,
    'total', total_value,
    'page', p_page,
    'limit', p_limit,
    'view', normalized_view,
    'status', normalized_status
  );
END
$$;

CREATE OR REPLACE FUNCTION action_center_tenant_detail_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  action_row action_case%ROWTYPE;
  contract_row employment_contract%ROWTYPE;
  batch_row source_import_batch%ROWTYPE;
  display_name text;
  display_sector text;
  nominal_allowed boolean := false;
  payroll_allowed boolean := false;
  sod_conflict boolean := true;
  record_value jsonb;
  timeline_value jsonb := '[]'::jsonb;
  commands_value jsonb := '[]'::jsonb;
BEGIN
  context_value := action_center_assert_tenant_read_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  IF p_case_id IS NULL THEN
    RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO action_row
  FROM action_case action
  WHERE action.id = p_case_id
    AND action.case_type = 'leave_request'
    AND action.tenant_id = (context_value->>'tenantId')::uuid
    AND action.source_binding_id = (context_value->>'sourceBindingId')::uuid
    AND action.company_id = (context_value->>'sourceCompanyId')::bigint
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL,
      'timeline', '[]'::jsonb, 'allowedCommands', '[]'::jsonb);
  END IF;

  SELECT * INTO contract_row
  FROM employment_contract contract
  WHERE contract.id = action_row.beneficiary_contract_id
    AND contract.source_system = 'GRH'
    AND contract.source_batch_id = action_row.source_batch_id
    AND contract.legacy_company_id = action_row.company_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL,
      'timeline', '[]'::jsonb, 'allowedCommands', '[]'::jsonb);
  END IF;

  SELECT * INTO batch_row
  FROM source_import_batch batch
  WHERE batch.id = action_row.source_batch_id
    AND batch.source_system = 'GRH'
    AND batch.source_database = context_value->>'sourceDatabase'
    AND batch.validation_state = 'published'
    AND batch.legacy_import_run_id IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL,
      'timeline', '[]'::jsonb, 'allowedCommands', '[]'::jsonb);
  END IF;

  nominal_allowed := action_center_context_nominal_read(
    context_value, action_row.beneficiary_contract_id, action_row.company_id,
    action_row.organization_unit_source_id, action_row.sector_source_id,
    action_row.confidentiality
  );
  payroll_allowed := NOT nominal_allowed
    AND action_row.status = 'approved'
    AND action_row.confidentiality = 'standard'
    AND action_center_context_has_capability(context_value, 'leave.request.payroll.read');
  IF NOT nominal_allowed AND NOT payroll_allowed THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL,
      'timeline', '[]'::jsonb, 'allowedCommands', '[]'::jsonb);
  END IF;

  IF nominal_allowed THEN
    SELECT COALESCE(NULLIF(employee.nombre, ''), NULLIF(identity.full_name, ''), 'Nombre no informado'),
      COALESCE(NULLIF(employee.sector, ''), 'Sector no informado')
      INTO display_name, display_sector
    FROM person_identity identity
    LEFT JOIN grh_employees employee
      ON employee.company_id = contract_row.legacy_company_id
     AND employee.legajo = contract_row.legacy_legajo
     AND employee.import_run_id = batch_row.legacy_import_run_id
    WHERE identity.id = contract_row.person_id;
  END IF;

  record_value := jsonb_strip_nulls(jsonb_build_object(
    'id', action_row.id,
    'caseNumber', action_row.case_number,
    'tenantId', CASE WHEN nominal_allowed THEN action_row.tenant_id END,
    'sourceBindingId', CASE WHEN nominal_allowed THEN action_row.source_binding_id END,
    'caseType', action_row.case_type,
    'beneficiaryContractId', CASE WHEN nominal_allowed THEN action_row.beneficiary_contract_id END,
    'sourceBatchId', CASE WHEN nominal_allowed THEN action_row.source_batch_id END,
    'companyId', CASE WHEN nominal_allowed THEN action_row.company_id END,
    'organizationUnitSourceId', CASE WHEN nominal_allowed THEN action_row.organization_unit_source_id END,
    'sectorSourceId', CASE WHEN nominal_allowed THEN action_row.sector_source_id END,
    'status', action_row.status,
    'confidentiality', action_row.confidentiality,
    'policyVersionId', action_row.policy_version_id,
    'payload', jsonb_strip_nulls(jsonb_build_object(
      'reasonCode', action_row.payload->>'reasonCode',
      'policyRuleId', action_row.payload->>'policyRuleId',
      'startsOn', action_row.payload->>'startsOn',
      'endsOn', action_row.payload->>'endsOn',
      'startsAtLocal', action_row.payload->>'startsAtLocal',
      'endsAtLocal', action_row.payload->>'endsAtLocal',
      'durationUnit', action_row.payload->>'durationUnit',
      'employeeNote', CASE WHEN nominal_allowed THEN action_row.payload->>'employeeNote' END
    )),
    'evidenceStatus', action_row.evidence_status,
    'createdBy', CASE WHEN nominal_allowed THEN action_row.created_by_user_email END,
    'submittedBy', CASE WHEN nominal_allowed THEN action_row.submitted_by_user_email END,
    'submittedAt', CASE WHEN nominal_allowed THEN action_row.submitted_at END,
    'decidedBy', CASE WHEN nominal_allowed THEN action_row.decided_by_user_email END,
    'decidedAt', action_row.decided_at,
    'decisionReason', CASE WHEN nominal_allowed THEN action_row.decision_reason END,
    'manualValidationConfirmed', CASE WHEN nominal_allowed THEN action_row.manual_validation_confirmed END,
    'cancelledBy', CASE WHEN nominal_allowed THEN action_row.cancelled_by_user_email END,
    'cancelledAt', CASE WHEN nominal_allowed THEN action_row.cancelled_at END,
    'cancellationReason', CASE WHEN nominal_allowed THEN action_row.cancellation_reason END,
    'version', action_row.version,
    'createdAt', CASE WHEN nominal_allowed THEN action_row.created_at END,
    'updatedAt', action_row.updated_at,
    'subjectDisplayName', CASE WHEN nominal_allowed THEN display_name END,
    'subjectLegajo', CASE WHEN nominal_allowed THEN contract_row.legacy_legajo END,
    'subjectSector', CASE WHEN nominal_allowed THEN display_sector END,
    'nominalProjection', nominal_allowed,
    'projection', CASE WHEN nominal_allowed THEN 'nominal' ELSE 'payroll' END
  ));

  IF nominal_allowed THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', event.id,
      'caseVersion', event.case_version,
      'eventType', event.event_type,
      'fromStatus', event.from_status,
      'toStatus', event.to_status,
      'actorEmail', event.actor_user_email,
      'actorRole', event.actor_role,
      'metadata', jsonb_strip_nulls(jsonb_build_object(
        'command', event.metadata->>'command',
        'reasonPresent', CASE WHEN jsonb_typeof(event.metadata->'reasonPresent') = 'boolean'
          THEN (event.metadata->>'reasonPresent')::boolean END,
        'evidenceStatus', event.metadata->>'evidenceStatus',
        'manualValidationConfirmed', CASE WHEN jsonb_typeof(event.metadata->'manualValidationConfirmed') = 'boolean'
          THEN (event.metadata->>'manualValidationConfirmed')::boolean END
      )),
      'occurredAt', event.occurred_at
    ) ORDER BY event.case_version, event.id), '[]'::jsonb)
      INTO timeline_value
    FROM action_case_event event
    WHERE event.case_id = action_row.id
      AND event.tenant_id = action_row.tenant_id
      AND event.source_binding_id = action_row.source_binding_id;

    IF COALESCE(context_value->>'employmentContractId', '') <> '' THEN
      sod_conflict := (context_value->>'actorPersonId') IS NULL
        OR lower(context_value->>'email') = lower(action_row.created_by_user_email)
        OR (action_row.submitted_by_user_email IS NOT NULL
          AND lower(context_value->>'email') = lower(action_row.submitted_by_user_email))
        OR contract_row.person_id = (context_value->>'actorPersonId')::uuid
        OR EXISTS (
          SELECT 1 FROM action_case_event preparation_event
          WHERE preparation_event.case_id = action_row.id
            AND preparation_event.tenant_id = action_row.tenant_id
            AND preparation_event.source_binding_id = action_row.source_binding_id
            AND preparation_event.event_type IN ('created', 'draft_updated', 'submitted')
            AND (preparation_event.actor_person_id IS NULL
              OR preparation_event.actor_person_id = (context_value->>'actorPersonId')::uuid)
        );

      SELECT COALESCE(jsonb_agg(command_name ORDER BY command_order), '[]'::jsonb)
        INTO commands_value
      FROM (
        SELECT command_name, command_order
        FROM (VALUES
          ('update_draft', 1), ('submit', 2), ('approve', 3),
          ('reject', 4), ('cancel', 5)
        ) command(command_name, command_order)
        WHERE action_center_tenant_actor_authorized(
          context_value->>'email', (context_value->>'tenantId')::uuid,
          (context_value->>'membershipId')::uuid, command.command_name,
          action_row.beneficiary_contract_id, action_row.company_id,
          action_row.organization_unit_source_id, action_row.sector_source_id,
          action_row.status, action_row.confidentiality
        )
        AND (command.command_name NOT IN ('approve', 'reject') OR NOT sod_conflict)
        AND (command.command_name <> 'cancel' OR action_row.status <> 'approved' OR NOT sod_conflict)
      ) allowed;
    END IF;
  END IF;

  -- La autoridad y el caso siguen bloqueados hasta finalizar este statement;
  -- una revocacion concurrente no puede intercalarse entre autorizacion y proyeccion.
  RETURN jsonb_build_object(
    'principal', context_value,
    'record', record_value,
    'timeline', CASE WHEN nominal_allowed THEN timeline_value ELSE '[]'::jsonb END,
    'allowedCommands', CASE WHEN nominal_allowed THEN commands_value ELSE '[]'::jsonb END
  );
END
$$;

CREATE OR REPLACE FUNCTION action_center_tenant_routing_v2(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  detail_value jsonb;
  record_value jsonb;
BEGIN
  detail_value := action_center_tenant_detail_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version, p_release_sha,
    p_tenant_id, p_membership_id, p_case_id
  );
  record_value := detail_value->'record';
  IF record_value IS NULL OR record_value = 'null'::jsonb
     OR record_value->>'projection' <> 'nominal' THEN
    RETURN jsonb_build_object('principal', detail_value->'principal', 'routing', NULL);
  END IF;
  RETURN jsonb_build_object(
    'principal', detail_value->'principal',
    'routing', jsonb_build_object(
      'id', record_value->>'id',
      'caseType', record_value->>'caseType',
      'tenantId', record_value->>'tenantId',
      'sourceBindingId', record_value->>'sourceBindingId',
      'beneficiaryContractId', record_value->>'beneficiaryContractId',
      'companyId', record_value->'companyId',
      'organizationUnitSourceId', record_value->>'organizationUnitSourceId',
      'sectorSourceId', record_value->>'sectorSourceId',
      'status', record_value->>'status',
      'confidentiality', record_value->>'confidentiality',
      'policyVersionId', record_value->>'policyVersionId'
    )
  );
END
$$;

COMMENT ON FUNCTION action_center_context_v2(text, uuid, integer, text, uuid, uuid) IS
  'Contexto operativo minimo ligado a sesion membership MFA y release certificado; reemplaza resolver v1 email-only.';
COMMENT ON FUNCTION action_center_tenant_bootstrap_v2(text, uuid, integer, text, uuid, uuid, text) IS
  'Bootstrap y busqueda efimera de sujetos, maximo 50, con provenance GRH exacta y autoridad tenant.';
COMMENT ON FUNCTION action_center_tenant_list_v2(text, uuid, integer, text, uuid, uuid, text, text, text, integer, integer) IS
  'Lista tenant-filtered en snapshot unico; payroll usa proyeccion minima y nunca hereda lectura nominal.';
COMMENT ON FUNCTION action_center_tenant_detail_v2(text, uuid, integer, text, uuid, uuid, uuid) IS
  'Detalle IDOR-safe bajo locks de autoridad/caso; metadata por allowlist y payroll sin timeline ni actores.';
COMMENT ON FUNCTION action_center_tenant_routing_v2(text, uuid, integer, text, uuid, uuid, uuid) IS
  'Routing minimo para update_draft, autorizado por la misma fachada de detalle y sin SELECT runtime.';

DO $role_isolation$
DECLARE
  runtime_role record;
  approved_owner_oid oid := current_user::regrole::oid;
BEGIN
  SELECT * INTO runtime_role
  FROM pg_roles role_row
  WHERE role_row.rolname = 'municontrol_actions_runtime_app';
  IF NOT FOUND
     OR runtime_role.rolcanlogin IS NOT TRUE
     OR runtime_role.rolinherit IS NOT FALSE
     OR runtime_role.rolsuper IS TRUE
     OR runtime_role.rolbypassrls IS TRUE
     OR runtime_role.rolcreatedb IS TRUE
     OR runtime_role.rolcreaterole IS TRUE
     OR runtime_role.rolreplication IS TRUE THEN
    RAISE EXCEPTION 'ACTION_RUNTIME_ROLE_ATTRIBUTES_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members membership
    WHERE membership.member = runtime_role.oid
  ) THEN
    RAISE EXCEPTION 'ACTION_RUNTIME_ROLE_MEMBERSHIP_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  -- Neon registra al owner SQL como administrador del rol creado, pero esa
  -- arista no otorga herencia ni SET ROLE. Es la unica membresia entrante
  -- admisible: el mismo current_user que posee las fachadas SECURITY DEFINER.
  IF (SELECT count(*) FROM pg_auth_members membership
      WHERE membership.roleid = runtime_role.oid) > 1
     OR EXISTS (
       SELECT 1
       FROM pg_auth_members membership
       WHERE membership.roleid = runtime_role.oid
         AND NOT (
           membership.member = approved_owner_oid
           AND membership.admin_option IS TRUE
           AND membership.inherit_option IS FALSE
           AND membership.set_option IS FALSE
         )
     ) THEN
    RAISE EXCEPTION 'ACTION_RUNTIME_ROLE_ADMIN_EDGE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
END
$role_isolation$;
REVOKE CREATE ON SCHEMA public FROM municontrol_actions_runtime_app;
GRANT USAGE ON SCHEMA public TO municontrol_actions_runtime_app;

REVOKE ALL ON FUNCTION action_center_assert_tenant_read_session_v2(
  text, uuid, integer, text, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_context_has_capability(jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_context_has_area_scope(
  jsonb, text, bigint, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_context_nominal_read(
  jsonb, uuid, bigint, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_context_v2(
  text, uuid, integer, text, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_tenant_bootstrap_v2(
  text, uuid, integer, text, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_tenant_list_v2(
  text, uuid, integer, text, uuid, uuid, text, text, text, integer, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_tenant_detail_v2(
  text, uuid, integer, text, uuid, uuid, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION action_center_tenant_routing_v2(
  text, uuid, integer, text, uuid, uuid, uuid
) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION action_center_resolve_tenant_principal(text, uuid, uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_assert_tenant_read_session_v2(
  text, uuid, integer, text, uuid, uuid
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_context_has_capability(jsonb, text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_context_has_area_scope(
  jsonb, text, bigint, text, text
) FROM municontrol_actions_runtime_app;
REVOKE ALL PRIVILEGES ON FUNCTION action_center_context_nominal_read(
  jsonb, uuid, bigint, text, text, text
) FROM municontrol_actions_runtime_app;

-- El runtime de acciones se convierte en execute-only. Se revocan tambien
-- ACL por columna, que sobreviven a un REVOKE de tabla en PostgreSQL.
DO $acl$
DECLARE
  relation_row record;
  column_list text;
  sequence_row record;
BEGIN
  FOR relation_row IN
    SELECT namespace.nspname, relation.relname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE %I.%I FROM municontrol_actions_runtime_app',
      relation_row.nspname, relation_row.relname
    );
    SELECT string_agg(quote_ident(attribute.attname), ', ' ORDER BY attribute.attnum)
      INTO column_list
    FROM pg_attribute attribute
    WHERE attribute.attrelid = format('%I.%I', relation_row.nspname, relation_row.relname)::regclass
      AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    IF column_list IS NOT NULL THEN
      EXECUTE format(
        'REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s) ON TABLE %I.%I FROM municontrol_actions_runtime_app',
        column_list, column_list, column_list, column_list,
        relation_row.nspname, relation_row.relname
      );
    END IF;
  END LOOP;

  FOR sequence_row IN
    SELECT namespace.nspname, relation.relname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON SEQUENCE %I.%I FROM municontrol_actions_runtime_app',
      sequence_row.nspname, sequence_row.relname
    );
  END LOOP;
END
$acl$;

GRANT EXECUTE ON FUNCTION action_center_context_v2(
  text, uuid, integer, text, uuid, uuid
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_tenant_bootstrap_v2(
  text, uuid, integer, text, uuid, uuid, text
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_tenant_list_v2(
  text, uuid, integer, text, uuid, uuid, text, text, text, integer, integer
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_tenant_detail_v2(
  text, uuid, integer, text, uuid, uuid, uuid
) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION action_center_tenant_routing_v2(
  text, uuid, integer, text, uuid, uuid, uuid
) TO municontrol_actions_runtime_app;
