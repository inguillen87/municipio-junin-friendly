-- MuniControl Friendly - Sprint 018
-- Completa el Centro de acciones sin ampliar la superficie del runtime:
-- * operadores area-scoped sin vinculo laboral ven los comandos de preparacion;
-- * decisiones y cancelacion de aprobadas conservan vinculo + maker-checker;
-- * las observaciones restringidas permanecen privadas y validadas, pero pueden guardarse.

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

COMMENT ON FUNCTION public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid) IS
  'Detalle tenant: preparacion area-scoped sin vinculo; decisiones y cancelacion aprobada con vinculo y maker-checker; payroll minimo.';

ALTER TABLE public.action_case
  DROP CONSTRAINT action_case_leave_confidentiality_ck;
ALTER TABLE public.action_case
  ADD CONSTRAINT action_case_leave_confidentiality_ck CHECK (
    case_type <> 'leave_request'
    OR (payload->>'reasonCode' = '19' OR confidentiality = 'restricted')
  ) NOT VALID;
ALTER TABLE public.action_case
  VALIDATE CONSTRAINT action_case_leave_confidentiality_ck;

COMMENT ON CONSTRAINT action_case_leave_confidentiality_ck ON public.action_case IS
  'Licencias sensibles siguen siendo restricted; employeeNote se valida por payload y solo aparece en proyeccion nominal.';

ALTER TABLE public.action_case
  ADD CONSTRAINT action_case_employee_note_length_ck CHECK (
    case_type <> 'leave_request'
    OR NOT (payload ? 'employeeNote')
    OR payload->'employeeNote' = 'null'::jsonb
    OR (
      jsonb_typeof(payload->'employeeNote') = 'string'
      AND length(payload->>'employeeNote') <= 500
    )
  ) NOT VALID;
ALTER TABLE public.action_case
  VALIDATE CONSTRAINT action_case_employee_note_length_ck;

COMMENT ON CONSTRAINT action_case_employee_note_length_ck ON public.action_case IS
  'Observacion opcional string/null; maximo operativo 500 caracteres, alineado con UI y API.';

REVOKE ALL ON FUNCTION public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)
  FROM PUBLIC CASCADE;

-- CREATE OR REPLACE conserva ACL preexistentes. Se normaliza a owner + runtime
-- exactos para impedir grants historicos fuera del contrato 018.
DO $action_center_operational_completion_acl$
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
      'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)'::regprocedure
      AND acl.grantee <> function_row.proowner
  LOOP
    IF acl_row.grantee = 0 THEN grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'ACTION_CENTER_DETAIL_ACL_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
      acl_row.schema_name, acl_row.function_name,
      acl_row.identity_arguments, grantee_sql
    );
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app') THEN
    GRANT EXECUTE ON FUNCTION public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)
      TO municontrol_actions_runtime_app;
  END IF;
END
$action_center_operational_completion_acl$;
