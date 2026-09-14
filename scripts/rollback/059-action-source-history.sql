-- Restore the six function definitions from the verified pre-059 release.
-- Only after selecting the existing operational branch and backing up; no data is changed.
-- Private unused 059 helpers may remain; the migration ledger remains historical evidence.

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

CREATE OR REPLACE FUNCTION public.action_center_tenant_detail_v2(
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

    IF COALESCE(context_value->>'employmentContractId', '') <> ''
       AND (context_value->>'actorPersonId') IS NOT NULL THEN
      sod_conflict := lower(context_value->>'email') = lower(action_row.created_by_user_email)
        OR (action_row.submitted_by_user_email IS NOT NULL
          AND lower(context_value->>'email') = lower(action_row.submitted_by_user_email))
        OR contract_row.person_id = (context_value->>'actorPersonId')::uuid
        OR EXISTS (
          SELECT 1 FROM action_case_event preparation_event
          WHERE preparation_event.case_id = action_row.id
            AND preparation_event.tenant_id = action_row.tenant_id
            AND preparation_event.source_binding_id = action_row.source_binding_id
            AND preparation_event.event_type IN ('created', 'draft_updated', 'submitted')
            AND (preparation_event.actor_membership_id = (context_value->>'membershipId')::uuid
              OR (preparation_event.actor_person_id IS NOT NULL
                AND preparation_event.actor_person_id = (context_value->>'actorPersonId')::uuid))
        );
    END IF;

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
      AND (command.command_name NOT IN ('approve', 'reject') OR (
        COALESCE(context_value->>'employmentContractId', '') <> ''
        AND (context_value->>'actorPersonId') IS NOT NULL
        AND NOT sod_conflict
      ))
      AND (command.command_name <> 'cancel' OR action_row.status <> 'approved' OR (
        COALESCE(context_value->>'employmentContractId', '') <> ''
        AND (context_value->>'actorPersonId') IS NOT NULL
        AND NOT sod_conflict
      ))
    ) allowed;
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

CREATE OR REPLACE FUNCTION action_center_overtime_list_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_status text,
  p_page integer,
  p_limit integer
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  normalized_status text := NULLIF(lower(btrim(COALESCE(p_status, ''))), '');
  records_value jsonb := '[]'::jsonb;
  total_value integer := 0;
BEGIN
  context_value := action_center_overtime_read_context_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  IF normalized_status IS NOT NULL
     AND normalized_status NOT IN (
       'draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled'
     ) THEN
    RAISE EXCEPTION 'ACTION_STATUS_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 200
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'ACTION_PAGINATION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  WITH candidate AS MATERIALIZED (
    SELECT action.id, action.case_number, action.case_type, action.beneficiary_contract_id,
      action.status, action.confidentiality, action.policy_version_id, action.payload,
      action.evidence_status, action.updated_at, action.version,
      contract.legacy_legajo, contract.person_id,
      batch.legacy_import_run_id
    FROM action_case action
    JOIN employment_contract contract
      ON contract.id = action.beneficiary_contract_id
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = action.company_id
     AND contract.source_batch_id = action.source_batch_id
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = context_value->>'sourceDatabase'
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE action.case_type = 'overtime_entry'
      AND action.tenant_id = (context_value->>'tenantId')::uuid
      AND action.source_binding_id = (context_value->>'sourceBindingId')::uuid
      AND action.company_id = (context_value->>'sourceCompanyId')::bigint
      AND (normalized_status IS NULL OR action.status = normalized_status)
  ), page_rows AS MATERIALIZED (
    SELECT candidate.*
    FROM candidate
    ORDER BY updated_at DESC, id DESC
    OFFSET (p_page - 1) * p_limit
    LIMIT p_limit
  ), projected AS (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'id', page.id,
      'caseNumber', page.case_number,
      'caseType', page.case_type,
      'beneficiaryContractId', page.beneficiary_contract_id,
      'subject', jsonb_build_object(
        'contractId', page.beneficiary_contract_id,
        'displayName', COALESCE(NULLIF(employee.nombre, ''), NULLIF(identity.full_name, ''), 'Nombre no informado'),
        'legajo', page.legacy_legajo,
        'sector', COALESCE(NULLIF(employee.sector, ''), 'Sector no informado')
      ),
      'status', page.status,
      'confidentiality', page.confidentiality,
      'policyVersionId', page.policy_version_id,
      'payload', jsonb_build_object(
        'workDate', page.payload->>'workDate',
        'declaredMinutes', (page.payload->>'declaredMinutes')::integer,
        'reasonCode', page.payload->>'reasonCode'
      ),
      'evidenceStatus', page.evidence_status,
      'updatedAt', page.updated_at,
      'version', page.version,
      'payrollImpact', jsonb_build_object(
        'amount', NULL,
        'rate', NULL,
        'calculated', false,
        'posted', false,
        'attendanceReconciled', false
      ),
      'projection', 'restricted_nominal'
    )) AS item, page.updated_at, page.id
    FROM page_rows page
    JOIN person_identity identity ON identity.id = page.person_id
    LEFT JOIN grh_employees employee
      ON employee.company_id = (context_value->>'sourceCompanyId')::bigint
     AND employee.legajo = page.legacy_legajo
     AND employee.import_run_id = page.legacy_import_run_id
  )
  SELECT COALESCE(jsonb_agg(item ORDER BY updated_at DESC, id DESC), '[]'::jsonb),
    (SELECT count(*)::integer FROM candidate)
    INTO records_value, total_value
  FROM projected;

  RETURN jsonb_build_object(
    'principal', context_value,
    'records', records_value,
    'total', total_value
  );
END
$$;

CREATE OR REPLACE FUNCTION action_center_overtime_detail_v1(
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
  subject_name text;
  subject_sector text;
  reason_label text;
  decision_reason_label text;
  cancellation_reason_label text;
  timeline_value jsonb := '[]'::jsonb;
  commands_value jsonb := '[]'::jsonb;
  exclusive_entry boolean := false;
  separated_decider boolean := false;
BEGIN
  context_value := action_center_overtime_read_context_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );

  SELECT * INTO action_row
  FROM action_case action
  WHERE action.id = p_case_id
    AND action.case_type = 'overtime_entry'
    AND action.tenant_id = (context_value->>'tenantId')::uuid
    AND action.source_binding_id = (context_value->>'sourceBindingId')::uuid
    AND action.company_id = (context_value->>'sourceCompanyId')::bigint
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL);
  END IF;

  SELECT contract.* INTO contract_row
  FROM employment_contract contract
  WHERE contract.id = action_row.beneficiary_contract_id
    AND contract.source_system = 'GRH'
    AND contract.source_batch_id = action_row.source_batch_id
    AND contract.legacy_company_id = action_row.company_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL);
  END IF;

  SELECT * INTO batch_row
  FROM source_import_batch batch
  WHERE batch.id = contract_row.source_batch_id
    AND batch.source_system = 'GRH'
    AND batch.source_database = context_value->>'sourceDatabase'
    AND batch.validation_state = 'published'
    AND batch.legacy_import_run_id IS NOT NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL);
  END IF;

  SELECT COALESCE(NULLIF(employee.nombre, ''), NULLIF(identity.full_name, ''), 'Nombre no informado'),
    COALESCE(NULLIF(employee.sector, ''), 'Sector no informado')
    INTO subject_name, subject_sector
  FROM person_identity identity
  LEFT JOIN grh_employees employee
    ON employee.company_id = contract_row.legacy_company_id
   AND employee.legajo = contract_row.legacy_legajo
   AND employee.import_run_id = batch_row.legacy_import_run_id
  WHERE identity.id = contract_row.person_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('principal', context_value, 'record', NULL);
  END IF;

  SELECT reason.label INTO reason_label
  FROM action_overtime_reason_catalog reason
  WHERE reason.policy_version_id = action_row.policy_version_id
    AND reason.reason_code = action_row.payload->>'reasonCode';
  SELECT reason.label INTO decision_reason_label
  FROM action_overtime_decision_reason_catalog reason
  WHERE reason.decision_reason_code = action_row.decision_reason;
  SELECT reason.label INTO cancellation_reason_label
  FROM action_overtime_decision_reason_catalog reason
  WHERE reason.decision_reason_code = action_row.cancellation_reason;

  exclusive_entry := action_center_overtime_has_exclusive_entry_v1(context_value);
  separated_decider := action_center_overtime_decider_separated_v1(
    action_row.id,
    (context_value->>'tenantId')::uuid,
    (context_value->>'sourceBindingId')::uuid,
    context_value->>'email',
    (context_value->>'actorPersonId')::uuid
  );
  IF action_row.status = 'draft' AND exclusive_entry THEN
    commands_value := jsonb_build_array('update_draft', 'submit', 'cancel');
  ELSIF action_row.status = 'submitted' THEN
    IF action_center_context_has_capability(context_value, 'time.overtime.approve')
       AND separated_decider THEN
      commands_value := commands_value || jsonb_build_array('approve', 'reject');
    END IF;
    IF exclusive_entry THEN
      commands_value := commands_value || jsonb_build_array('cancel');
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', event.id,
      'caseVersion', event.case_version,
      'eventType', event.event_type,
      'fromStatus', event.from_status,
      'toStatus', event.to_status,
      'actorRole', event.actor_role,
      'metadata', jsonb_strip_nulls(jsonb_build_object(
        'command', event.metadata->>'command',
        'decisionReasonCode', event.metadata->>'decisionReasonCode',
        'reasonPresent', CASE WHEN event.metadata ? 'reasonPresent'
          THEN (event.metadata->>'reasonPresent')::boolean END,
        'evidenceStatus', event.metadata->>'evidenceStatus',
        'manualValidationConfirmed', CASE WHEN event.metadata ? 'manualValidationConfirmed'
          THEN (event.metadata->>'manualValidationConfirmed')::boolean END,
        'payrollCalculated', false,
        'payrollPosted', false
      )),
      'occurredAt', event.occurred_at
    )) ORDER BY event.id), '[]'::jsonb)
    INTO timeline_value
  FROM action_case_event event
  WHERE event.case_id = action_row.id
    AND event.case_type = 'overtime_entry'
    AND event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.source_binding_id = (context_value->>'sourceBindingId')::uuid;

  RETURN jsonb_build_object(
    'principal', context_value,
    'record', jsonb_strip_nulls(jsonb_build_object(
      'id', action_row.id,
      'caseNumber', action_row.case_number,
      'caseType', action_row.case_type,
      'beneficiaryContractId', action_row.beneficiary_contract_id,
      'subject', jsonb_build_object(
        'contractId', action_row.beneficiary_contract_id,
        'displayName', subject_name,
        'legajo', contract_row.legacy_legajo,
        'sector', subject_sector
      ),
      'status', action_row.status,
      'confidentiality', action_row.confidentiality,
      'policyVersionId', action_row.policy_version_id,
      'payload', jsonb_build_object(
        'workDate', action_row.payload->>'workDate',
        'declaredMinutes', (action_row.payload->>'declaredMinutes')::integer,
        'reasonCode', action_row.payload->>'reasonCode',
        'reasonLabel', reason_label
      ),
      'evidenceStatus', action_row.evidence_status,
      'decision', CASE WHEN action_row.decision_reason IS NOT NULL THEN jsonb_build_object(
        'decisionReasonCode', action_row.decision_reason,
        'label', decision_reason_label,
        'manualValidationConfirmed', action_row.manual_validation_confirmed
      ) END,
      'cancellation', CASE WHEN action_row.cancellation_reason IS NOT NULL THEN jsonb_build_object(
        'decisionReasonCode', action_row.cancellation_reason,
        'label', cancellation_reason_label
      ) END,
      'timestamps', jsonb_strip_nulls(jsonb_build_object(
        'createdAt', action_row.created_at,
        'updatedAt', action_row.updated_at,
        'submittedAt', action_row.submitted_at,
        'decidedAt', action_row.decided_at,
        'cancelledAt', action_row.cancelled_at
      )),
      'version', action_row.version,
      'payrollImpact', jsonb_build_object(
        'amount', NULL,
        'rate', NULL,
        'calculated', false,
        'posted', false,
        'attendanceReconciled', false
      ),
      'projection', 'restricted_nominal'
    )),
    'timeline', timeline_value,
    'allowedCommands', commands_value
  );
END
$$;

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

CREATE OR REPLACE FUNCTION action_center_apply_overtime_command_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_command text,
  p_case_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_command_hash text,
  p_payload jsonb,
  p_beneficiary_contract_id uuid,
  p_policy_version_id text,
  p_decision_reason_code text,
  p_evidence_status text,
  p_manual_validation_confirmed boolean
)
RETURNS TABLE (
  case_id uuid,
  case_number bigint,
  current_status varchar(24),
  current_version integer,
  replayed boolean
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  binding_id uuid;
  source_company_id bigint;
  binding_source_database text;
  actor_contract_id uuid;
  actor_person_id uuid;
  actor_role text;
  existing_event action_case_event%ROWTYPE;
  current_case action_case%ROWTYPE;
  contract employment_contract%ROWTYPE;
  previous_status varchar(24);
  next_status varchar(24);
  next_event varchar(32);
  event_metadata jsonb;
  requires_exclusive boolean;
BEGIN
  IF p_command NOT IN ('create', 'update_draft', 'submit', 'approve', 'reject', 'cancel')
     OR p_idempotency_key IS NULL
     OR COALESCE(p_command_hash, '') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_command = 'create' THEN
    IF p_case_id IS NOT NULL OR p_expected_version IS NOT NULL
       OR p_beneficiary_contract_id IS NULL
       OR p_policy_version_id <> 'junin-mayor-esfuerzo-intake.v1'
       OR action_center_valid_overtime_payload(p_payload) IS DISTINCT FROM true
       OR p_decision_reason_code IS NOT NULL OR p_evidence_status IS NOT NULL
       OR p_manual_validation_confirmed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command = 'update_draft' THEN
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
       OR p_beneficiary_contract_id IS NOT NULL
       OR p_policy_version_id <> 'junin-mayor-esfuerzo-intake.v1'
       OR action_center_valid_overtime_payload(p_payload) IS DISTINCT FROM true
       OR p_decision_reason_code IS NOT NULL OR p_evidence_status IS NOT NULL
       OR p_manual_validation_confirmed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command = 'submit' THEN
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
       OR p_payload IS NOT NULL OR p_beneficiary_contract_id IS NOT NULL
       OR p_policy_version_id IS NOT NULL OR p_decision_reason_code IS NOT NULL
       OR p_evidence_status IS NOT NULL OR p_manual_validation_confirmed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command = 'approve' THEN
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
       OR p_payload IS NOT NULL OR p_beneficiary_contract_id IS NOT NULL
       OR p_policy_version_id IS NOT NULL
       OR p_decision_reason_code <> 'validated_documentation'
       OR p_evidence_status <> 'verified'
       OR p_manual_validation_confirmed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command IN ('reject', 'cancel') THEN
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
       OR p_payload IS NOT NULL OR p_beneficiary_contract_id IS NOT NULL
       OR p_policy_version_id IS NOT NULL OR p_decision_reason_code IS NULL
       OR p_evidence_status IS NOT NULL OR p_manual_validation_confirmed IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'ACTION_COMMAND_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  context_value := action_center_overtime_mutation_context_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id, p_idempotency_key
  );
  binding_id := (context_value->>'sourceBindingId')::uuid;
  source_company_id := (context_value->>'sourceCompanyId')::bigint;
  binding_source_database := context_value->>'sourceDatabase';
  actor_contract_id := (context_value->>'actorEmploymentContractId')::uuid;
  actor_person_id := (context_value->>'actorPersonId')::uuid;
  actor_role := context_value->>'roleKey';
  requires_exclusive := p_command IN ('create', 'update_draft', 'submit', 'cancel');

  IF p_command IN ('create', 'update_draft') THEN
    PERFORM 1
    FROM action_overtime_reason_catalog reason
    WHERE reason.policy_version_id = p_policy_version_id
      AND reason.reason_code = p_payload->>'reasonCode'
      AND reason.governance_status = 'operational_provisional'
      AND reason.active IS TRUE
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'OVERTIME_REASON_NOT_AVAILABLE' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF requires_exclusive THEN
    IF NOT EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) effective
      WHERE effective.capability_key = 'time.overtime.enter'
    ) THEN
      RAISE EXCEPTION 'OVERTIME_EXCLUSIVE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    PERFORM 1
    FROM tenant_exclusive_capability assignment
    WHERE assignment.tenant_id = p_tenant_id
      AND assignment.capability_key = 'time.overtime.enter'
      AND assignment.membership_id = p_membership_id
      AND assignment.active IS TRUE
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'OVERTIME_EXCLUSIVE_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM tenant_iam_effective_capabilities(p_membership_id) effective
      WHERE effective.capability_key = 'time.overtime.approve'
    ) THEN
      RAISE EXCEPTION 'OVERTIME_APPROVAL_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT * INTO existing_event
  FROM action_case_event event
  WHERE lower(event.actor_user_email) = lower(context_value->>'email')
    AND event.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing_event.command_hash <> p_command_hash
       OR existing_event.case_type <> 'overtime_entry'
       OR existing_event.tenant_id <> p_tenant_id
       OR existing_event.source_binding_id <> binding_id
       OR existing_event.actor_membership_id <> p_membership_id
       OR existing_event.actor_person_id IS DISTINCT FROM actor_person_id
       OR existing_event.metadata->>'command' <> p_command
       OR existing_event.metadata->>'tenantId' <> p_tenant_id::text
       OR existing_event.metadata->>'sourceBindingId' <> binding_id::text
       OR existing_event.metadata->>'membershipId' <> p_membership_id::text
       OR existing_event.metadata->>'actorSessionId' <> p_actor_session_id::text
       OR existing_event.metadata->>'actorSessionVersion' <> p_actor_session_version::text
       OR existing_event.metadata->>'releaseSha' <> lower(p_release_sha)
       OR (p_case_id IS NOT NULL AND existing_event.case_id <> p_case_id) THEN
      RAISE EXCEPTION 'ACTION_IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_case
    FROM action_case action
    WHERE action.id = existing_event.case_id
      AND action.case_type = 'overtime_entry'
      AND action.tenant_id = p_tenant_id
      AND action.source_binding_id = binding_id
      AND action.company_id = source_company_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF p_command IN ('approve', 'reject') AND NOT action_center_overtime_decider_separated_v1(
      current_case.id, p_tenant_id, binding_id, context_value->>'email', actor_person_id
    ) THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    case_id := current_case.id;
    case_number := current_case.case_number;
    current_status := existing_event.to_status;
    current_version := existing_event.case_version;
    replayed := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_command = 'create' THEN
    SELECT contract_row.* INTO contract
    FROM employment_contract contract_row
    JOIN source_import_batch batch
      ON batch.id = contract_row.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding_source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE contract_row.id = p_beneficiary_contract_id
      AND contract_row.status = 'active'
      AND contract_row.source_system = 'GRH'
      AND contract_row.legacy_company_id = source_company_id
    FOR SHARE OF contract_row, batch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    next_status := 'draft';
    next_event := 'created';
    event_metadata := jsonb_strip_nulls(jsonb_build_object(
      'command', p_command,
      'tenantId', p_tenant_id,
      'sourceBindingId', binding_id,
      'membershipId', p_membership_id,
      'actorSessionId', p_actor_session_id,
      'actorSessionVersion', p_actor_session_version,
      'releaseSha', lower(p_release_sha),
      'policyVersionId', p_policy_version_id,
      'reasonPresent', false,
      'manualValidationConfirmed', false,
      'payrollCalculated', false,
      'payrollPosted', false
    ));
    PERFORM action_center_set_tenant_command_context(
      context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
      actor_contract_id, actor_person_id, next_event,
      p_idempotency_key, p_command_hash, event_metadata
    );
    INSERT INTO action_case (
      tenant_id, source_binding_id, case_type, beneficiary_contract_id, source_batch_id,
      company_id, organization_unit_source_id, sector_source_id,
      status, confidentiality, policy_version_id, payload,
      evidence_status, created_by_user_email
    ) VALUES (
      p_tenant_id, binding_id, 'overtime_entry', contract.id, contract.source_batch_id,
      contract.legacy_company_id, contract.organization_unit_source_id, contract.sector_source_id,
      'draft', 'restricted', p_policy_version_id, p_payload,
      'pending', context_value->>'email'
    ) RETURNING * INTO current_case;
  ELSE
    IF p_case_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
      RAISE EXCEPTION 'ACTION_VERSION_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO current_case
    FROM action_case action
    WHERE action.id = p_case_id
      AND action.case_type = 'overtime_entry'
      AND action.tenant_id = p_tenant_id
      AND action.source_binding_id = binding_id
      AND action.company_id = source_company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF current_case.version <> p_expected_version THEN
      RAISE EXCEPTION 'ACTION_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    previous_status := current_case.status;
    event_metadata := jsonb_build_object(
      'command', p_command,
      'tenantId', p_tenant_id,
      'sourceBindingId', binding_id,
      'membershipId', p_membership_id,
      'actorSessionId', p_actor_session_id,
      'actorSessionVersion', p_actor_session_version,
      'releaseSha', lower(p_release_sha),
      'policyVersionId', current_case.policy_version_id,
      'decisionReasonCode', CASE WHEN p_command IN ('approve', 'reject', 'cancel')
        THEN p_decision_reason_code END,
      'reasonPresent', CASE WHEN p_command IN ('approve', 'reject', 'cancel') THEN true END,
      'evidenceStatus', CASE WHEN p_command = 'approve' THEN 'verified' END,
      'manualValidationConfirmed', CASE WHEN p_command = 'approve' THEN true END,
      'payrollCalculated', false,
      'payrollPosted', false
    );

    IF p_command = 'update_draft' THEN
      IF current_case.status <> 'draft' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'draft';
      next_event := 'draft_updated';
      PERFORM action_center_set_tenant_command_context(
        context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
        actor_contract_id, actor_person_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case
      SET payload = p_payload,
        policy_version_id = p_policy_version_id,
        confidentiality = 'restricted',
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSIF p_command = 'submit' THEN
      IF current_case.status <> 'draft' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'submitted';
      next_event := 'submitted';
      PERFORM action_center_set_tenant_command_context(
        context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
        actor_contract_id, actor_person_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case
      SET status = 'submitted',
        submitted_by_user_email = context_value->>'email',
        submitted_at = now(),
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSIF p_command IN ('approve', 'reject') THEN
      IF current_case.status <> 'submitted' THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      IF NOT action_center_overtime_decider_separated_v1(
        current_case.id, p_tenant_id, binding_id, context_value->>'email', actor_person_id
      ) THEN
        RAISE EXCEPTION 'ACTION_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
      END IF;
      IF action_center_valid_overtime_decision_reason_v1(
        p_command, p_decision_reason_code
      ) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'ACTION_DECISION_REASON_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      IF p_command = 'approve' AND (
        p_manual_validation_confirmed IS DISTINCT FROM true
        OR p_evidence_status <> 'verified'
      ) THEN
        RAISE EXCEPTION 'ACTION_MANUAL_VALIDATION_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      next_status := CASE WHEN p_command = 'approve' THEN 'pending_time_rules' ELSE 'rejected' END;
      next_event := next_status;
      PERFORM action_center_set_tenant_command_context(
        context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
        actor_contract_id, actor_person_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case
      SET status = next_status,
        decided_by_user_email = context_value->>'email',
        decided_at = now(),
        decision_reason = p_decision_reason_code,
        evidence_status = CASE WHEN p_command = 'approve' THEN 'verified' ELSE evidence_status END,
        manual_validation_confirmed = p_command = 'approve',
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
    ELSIF p_command = 'cancel' THEN
      IF current_case.status NOT IN ('draft', 'submitted') THEN
        RAISE EXCEPTION 'ACTION_INVALID_TRANSITION' USING ERRCODE = 'P0001';
      END IF;
      IF action_center_valid_overtime_decision_reason_v1(
        p_command, p_decision_reason_code
      ) IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'ACTION_CANCELLATION_REASON_REQUIRED' USING ERRCODE = 'P0001';
      END IF;
      next_status := 'cancelled';
      next_event := 'cancelled';
      PERFORM action_center_set_tenant_command_context(
        context_value->>'email', actor_role, p_membership_id, p_tenant_id, binding_id,
        actor_contract_id, actor_person_id, next_event,
        p_idempotency_key, p_command_hash, event_metadata
      );
      UPDATE action_case
      SET status = 'cancelled',
        cancelled_by_user_email = context_value->>'email',
        cancelled_at = now(),
        cancellation_reason = p_decision_reason_code,
        version = version + 1
      WHERE id = current_case.id
      RETURNING * INTO current_case;
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
