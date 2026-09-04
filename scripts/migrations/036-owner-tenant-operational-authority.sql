-- MuniControl Friendly - Sprint 036
-- Autoridad operativa tenant del owner con maker-checker por expediente.
-- El rol puede preparar y decidir, pero nunca decidir un registro que haya
-- preparado la misma membresia/persona. No publica nomina ni muta GRH.

DO $owner_tenant_authority_prerequisites$
DECLARE
  missing_versions text[];
  missing_capabilities text[];
BEGIN
  WITH expected(version) AS (
    VALUES
      ('008-governed-overtime-actions'),
      ('018-action-center-operational-completion'),
      ('021-platform-owner-operational-integral'),
      ('025-governed-payroll-control-import'),
      ('026-governed-payroll-novelties'),
      ('027-institutional-payroll-novelty-profiles'),
      ('033-payroll-art-report-capability'),
      ('034-payroll-control-import-binding-lock'),
      ('035-governed-payroll-reprocessing')
  )
  SELECT array_agg(expected.version ORDER BY expected.version)
    INTO missing_versions
  FROM expected
  LEFT JOIN public.schema_migrations migration ON migration.version = expected.version
  WHERE migration.version IS NULL;

  IF missing_versions IS NOT NULL THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_PREREQUISITE_DRIFT: %',
      array_to_string(missing_versions, ',') USING ERRCODE = 'P0001';
  END IF;

  WITH expected(capability_key) AS (
    VALUES
      ('leave.request.area.create'),
      ('leave.request.area.read'),
      ('leave.request.area.update'),
      ('leave.request.area.submit'),
      ('leave.request.area.cancel_pending'),
      ('leave.request.area.decide'),
      ('leave.request.area.cancel_approved'),
      ('leave.request.restricted.read'),
      ('leave.request.restricted.decide'),
      ('time.overtime.read'),
      ('time.overtime.approve'),
      ('payroll.control_import.read'),
      ('payroll.control_import.prepare'),
      ('payroll.control_import.validate'),
      ('payroll.novelty.read'),
      ('payroll.novelty.prepare'),
      ('payroll.novelty.approve'),
      ('payroll.reprocessing.read'),
      ('payroll.reprocessing.prepare'),
      ('payroll.reprocessing.approve'),
      ('payroll.art_report.generate')
  )
  SELECT array_agg(expected.capability_key ORDER BY expected.capability_key)
    INTO missing_capabilities
  FROM expected
  LEFT JOIN public.iam_capability capability
    ON capability.capability_key = expected.capability_key
   AND capability.scope_kind = 'tenant'
  WHERE capability.capability_key IS NULL;

  IF missing_capabilities IS NOT NULL THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_CAPABILITY_DRIFT: %',
      array_to_string(missing_capabilities, ',') USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.iam_role role
    WHERE role.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
      AND role.scope_kind = 'tenant'
      AND role.system_managed IS TRUE
  ) THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_ROLE_DRIFT' USING ERRCODE = 'P0001';
  END IF;
END
$owner_tenant_authority_prerequisites$;

UPDATE public.iam_role
SET label = 'Owner operativo integral',
    description = 'Lectura, preparacion y decision tenant sobre expedientes de otro actor; sin autoaprobacion, publicacion de nomina ni mutacion GRH.'
WHERE role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL';

-- Un rol administrado no depende de excepciones individuales para estas
-- capacidades. La separacion se aplica por registro en cada workflow.
DELETE FROM public.tenant_membership_capability_override override_row
USING public.tenant_membership membership
WHERE override_row.membership_id = membership.id
  AND membership.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  AND override_row.capability_key IN (
    'leave.request.area.decide',
    'leave.request.area.cancel_approved',
    'leave.request.restricted.decide',
    'time.overtime.approve',
    'payroll.control_import.validate',
    'payroll.novelty.approve',
    'payroll.reprocessing.approve',
    'payroll.art_report.generate'
  );

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.area.decide'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.area.cancel_approved'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.restricted.decide'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.overtime.approve'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.control_import.validate'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.approve'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.reprocessing.approve'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.art_report.generate')
ON CONFLICT (role_key, capability_key) DO NOTHING;

-- Las incompatibilidades continúan en el catalogo para todos los perfiles.
-- Solo este rol combina preparar/decidir y solo porque los tres contratos
-- salariales aplican maker-checker por membresia y por persona en el registro.
CREATE OR REPLACE FUNCTION public.tenant_iam_assert_no_sod_conflict(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  membership_role text;
BEGIN
  SELECT membership.role_key INTO membership_role
  FROM public.tenant_membership membership
  WHERE membership.id = p_membership_id
    AND membership.status = 'active';

  IF EXISTS (
    SELECT 1
    FROM public.iam_capability_conflict conflict
    JOIN public.tenant_iam_effective_capabilities(p_membership_id) left_cap
      ON left_cap.capability_key = conflict.capability_key
    JOIN public.tenant_iam_effective_capabilities(p_membership_id) right_cap
      ON right_cap.capability_key = conflict.conflicts_with_key
    WHERE NOT (
      membership_role = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
      AND (conflict.capability_key, conflict.conflicts_with_key) IN (
        ('payroll.control_import.prepare', 'payroll.control_import.validate'),
        ('payroll.novelty.approve', 'payroll.novelty.prepare'),
        ('payroll.reprocessing.approve', 'payroll.reprocessing.prepare')
      )
    )
  ) THEN
    RAISE EXCEPTION 'TENANT_IAM_SOD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
END
$$;

-- El owner recibe alcance de compania exclusivamente sobre el binding GRH
-- certificado de cada membresia tenant activa. No se crean alcances sobre
-- fuentes no certificadas ni sobre otros tenants.
WITH owner_context AS (
  SELECT membership.id AS membership_id,
    membership.tenant_id,
    binding.id AS source_binding_id,
    binding.source_company_id AS company_id,
    users.email AS granted_by_user_email
  FROM public.tenant_membership membership
  JOIN public.internal_users users
    ON lower(users.email) = lower(membership.user_email)
   AND users.active IS TRUE
  JOIN public.platform_tenant tenant
    ON tenant.id = membership.tenant_id
   AND tenant.status = 'active'
  JOIN public.tenant_identity_policy policy
    ON policy.tenant_id = membership.tenant_id
   AND policy.tenant_data_plane_ready IS TRUE
  JOIN public.platform_tenant_source_binding binding
    ON binding.id = policy.certified_source_binding_id
   AND binding.tenant_id = membership.tenant_id
   AND binding.source_system = 'GRH'
   AND binding.verified IS TRUE
  JOIN public.tenant_action_authority authority
    ON authority.membership_id = membership.id
   AND authority.tenant_id = membership.tenant_id
  WHERE membership.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
    AND membership.status = 'active'
), scoped_capability(capability_key) AS (
  VALUES
    ('leave.request.area.create'),
    ('leave.request.area.read'),
    ('leave.request.area.update'),
    ('leave.request.area.submit'),
    ('leave.request.area.cancel_pending'),
    ('leave.request.area.decide'),
    ('leave.request.area.cancel_approved')
)
INSERT INTO public.tenant_action_area_scope (
  membership_id, tenant_id, source_binding_id, capability_key, scope_level,
  company_id, organization_unit_source_id, sector_source_id,
  active, granted_by_user_email, granted_at, revoked_at, updated_at
)
SELECT context.membership_id, context.tenant_id, context.source_binding_id,
  scoped_capability.capability_key, 'company', context.company_id,
  NULL, NULL, true, context.granted_by_user_email, now(), NULL, now()
FROM owner_context context
CROSS JOIN scoped_capability
ON CONFLICT (
  membership_id, capability_key, source_binding_id, scope_level,
  (COALESCE(organization_unit_source_id, '')),
  (COALESCE(sector_source_id, ''))
) DO UPDATE SET
  active = true,
  granted_by_user_email = EXCLUDED.granted_by_user_email,
  granted_at = now(),
  revoked_at = NULL,
  updated_at = now();

-- El bootstrap de controles de cierre es tambien la fuente autorizada del
-- workbench ART. Las capacidades de reportes viajan en un canal separado y
-- con allowlist exacta; no se mezclan con comandos de importacion.
CREATE OR REPLACE FUNCTION public.payroll_control_import_assert_context_v1(
  p_context jsonb,
  p_required_capability text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  user_row public.internal_users%ROWTYPE;
  membership_row public.tenant_membership%ROWTYPE;
  session_row public.tenant_identity_session%ROWTYPE;
  policy_row public.tenant_identity_policy%ROWTYPE;
  binding_row public.platform_tenant_source_binding%ROWTYPE;
  authority_row public.tenant_action_authority%ROWTYPE;
  actor_person_id uuid;
  employment_linked boolean := false;
  capabilities jsonb;
  report_capabilities jsonb;
BEGIN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_context) key)
        IS DISTINCT FROM ARRAY[
          'actorEmail','actorSessionId','actorSessionVersion',
          'membershipId','releaseSha','tenantId'
        ]::text[]
     OR p_required_capability NOT IN (
       'payroll.control_import.read','payroll.control_import.prepare',
       'payroll.control_import.validate','payroll.control_import.audit.read'
     )
     OR length(btrim(COALESCE(p_context->>'actorEmail',''))) NOT BETWEEN 3 AND 320
     OR COALESCE(p_context->>'actorSessionId','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_context->>'tenantId','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_context->>'membershipId','') !~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR COALESCE(p_context->>'actorSessionVersion','') !~ '^[1-9][0-9]{0,8}$'
     OR lower(COALESCE(p_context->>'releaseSha','')) !~ '^[a-f0-9]{40}$' THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO user_row
  FROM public.internal_users users
  WHERE lower(users.email) = lower(btrim(p_context->>'actorEmail'))
    AND users.active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO membership_row
  FROM public.tenant_membership membership
  WHERE membership.id = (p_context->>'membershipId')::uuid
    AND membership.tenant_id = (p_context->>'tenantId')::uuid
    AND lower(membership.user_email) = lower(user_row.email)
    AND membership.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO session_row
  FROM public.tenant_identity_session identity_session
  WHERE identity_session.id = (p_context->>'actorSessionId')::uuid
    AND identity_session.session_version = (p_context->>'actorSessionVersion')::integer
    AND lower(identity_session.user_email) = lower(user_row.email)
    AND identity_session.identity_version = user_row.identity_version
    AND identity_session.active_tenant_id = membership_row.tenant_id
    AND identity_session.source = 'membership'
    AND identity_session.auth_level IN ('mfa','recovery')
    AND identity_session.status = 'active'
    AND identity_session.expires_at > now()
    AND identity_session.last_seen_at > now() - interval '1 hour'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1 FROM public.platform_tenant tenant
  WHERE tenant.id = membership_row.tenant_id AND tenant.status = 'active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO policy_row
  FROM public.tenant_identity_policy policy
  WHERE policy.tenant_id = membership_row.tenant_id
    AND policy.tenant_data_plane_ready IS TRUE
    AND lower(policy.certified_release_sha) = lower(p_context->>'releaseSha')
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_RELEASE_NOT_CERTIFIED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO binding_row
  FROM public.platform_tenant_source_binding binding
  WHERE binding.id = policy_row.certified_source_binding_id
    AND binding.tenant_id = membership_row.tenant_id
    AND binding.source_system = 'GRH'
    AND binding.verified IS TRUE
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_BINDING_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO authority_row
  FROM public.tenant_action_authority authority
  WHERE authority.membership_id = membership_row.id
    AND authority.tenant_id = membership_row.tenant_id
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.tenant_iam_assert_no_sod_conflict(membership_row.id);
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_iam_effective_capabilities(membership_row.id) effective
    WHERE effective.capability_key = p_required_capability
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT contract.person_id INTO actor_person_id
  FROM public.tenant_action_employment_link link
  JOIN public.employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = binding_row.source_company_id
  JOIN public.source_import_batch batch
    ON batch.id = contract.source_batch_id
   AND batch.source_system = 'GRH'
   AND batch.source_database = binding_row.source_database
   AND batch.validation_state = 'published'
   AND batch.legacy_import_run_id IS NOT NULL
  WHERE link.membership_id = membership_row.id
    AND link.tenant_id = membership_row.tenant_id
    AND link.source_binding_id = binding_row.id
    AND link.active IS TRUE
  FOR SHARE OF link, contract, batch NOWAIT;
  employment_linked := FOUND;

  IF NOT employment_linked
     AND p_required_capability IN (
       'payroll.control_import.prepare','payroll.control_import.validate'
     ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(
      jsonb_agg(effective.capability_key ORDER BY effective.capability_key),
      '[]'::jsonb
    ) INTO capabilities
  FROM public.tenant_iam_effective_capabilities(membership_row.id) effective
  WHERE effective.capability_key LIKE 'payroll.control_import.%';

  SELECT COALESCE(
      jsonb_agg(effective.capability_key ORDER BY effective.capability_key),
      '[]'::jsonb
    ) INTO report_capabilities
  FROM public.tenant_iam_effective_capabilities(membership_row.id) effective
  WHERE effective.capability_key = 'payroll.art_report.generate';

  RETURN jsonb_build_object(
    'tenantId', membership_row.tenant_id,
    'membershipId', membership_row.id,
    'roleKey', membership_row.role_key,
    'actorSessionId', session_row.id,
    'actorSessionVersion', session_row.session_version,
    'releaseSha', lower(p_context->>'releaseSha'),
    'certifiedBindingId', binding_row.id,
    'actorPersonId', actor_person_id,
    'employmentLinked', employment_linked,
    'capabilities', capabilities,
    'reportCapabilities', report_capabilities
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_control_import_bootstrap_v1(p_context jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  batch_list jsonb;
  event_list jsonb := '[]'::jsonb;
  has_prepare boolean;
  has_validate boolean;
  has_audit boolean;
BEGIN
  context_value := public.payroll_control_import_assert_context_v1(
    p_context, 'payroll.control_import.read'
  );
  has_prepare := context_value->'capabilities' ? 'payroll.control_import.prepare';
  has_validate := context_value->'capabilities' ? 'payroll.control_import.validate';
  has_audit := context_value->'capabilities' ? 'payroll.control_import.audit.read';

  SELECT COALESCE(jsonb_agg(
    public.payroll_control_import_snapshot_v1(item.id, item.tenant_id)
    || jsonb_build_object('allowedCommands', CASE
      WHEN item.status = 'quarantined' AND has_prepare
        AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND item.prepared_by_person_id = (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('submit','cancel')
      WHEN item.status = 'submitted' AND has_prepare
        AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND item.prepared_by_person_id = (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('cancel')
      WHEN item.status = 'submitted' AND has_validate
        AND item.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
        AND item.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('validate','reject')
      ELSE '[]'::jsonb
    END)
    ORDER BY item.period_month DESC, item.created_at DESC, item.id
  ), '[]'::jsonb) INTO batch_list
  FROM (
    SELECT batch.* FROM public.payroll_control_import_batch batch
    WHERE batch.tenant_id = (context_value->>'tenantId')::uuid
      AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    ORDER BY batch.period_month DESC, batch.created_at DESC, batch.id
    LIMIT 100
  ) item;

  IF has_audit THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'batchId', item.batch_id,
      'certifiedBindingId', item.certified_binding_id,
      'actorMembershipId', item.actor_membership_id,
      'actorPersonId', item.actor_person_id,
      'actorRoleKey', item.actor_role_key,
      'authorityCapabilityKey', item.authority_capability_key,
      'command', item.command,
      'fromStatus', item.from_status,
      'toStatus', item.to_status,
      'expectedVersion', item.expected_version,
      'resultingVersion', item.resulting_version,
      'reasonCode', item.reason_code,
      'reasonReference', item.reason_reference,
      'eventSha256', btrim(item.event_sha256),
      'occurredAt', item.occurred_at
    ) ORDER BY item.occurred_at DESC, item.id DESC), '[]'::jsonb)
    INTO event_list
    FROM (
      SELECT event.* FROM public.payroll_control_import_event event
      JOIN public.payroll_control_import_batch audit_batch
        ON audit_batch.id = event.batch_id
       AND audit_batch.tenant_id = event.tenant_id
      WHERE event.tenant_id = (context_value->>'tenantId')::uuid
        AND audit_batch.certified_binding_id =
          (context_value->>'certifiedBindingId')::uuid
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT 100
    ) item;
  END IF;

  RETURN jsonb_build_object(
    'principal', jsonb_build_object(
      'tenantId', context_value->>'tenantId',
      'membershipId', context_value->>'membershipId',
      'certifiedBindingId', context_value->>'certifiedBindingId',
      'roleKey', context_value->>'roleKey',
      'employmentLinked', (context_value->>'employmentLinked')::boolean,
      'capabilities', context_value->'capabilities',
      'reportCapabilities', context_value->'reportCapabilities'
    ),
    'batches', batch_list,
    'recentEvents', event_list,
    'limits', jsonb_build_object(
      'maxSourceBytes', 16384,
      'contractVersion', 'payroll-control-import.v1',
      'hmacKeyVersion', 'hmac-v1',
      'definitionKey', 'payroll-post-close-701-703.v1',
      'sourceKinds', jsonb_build_array('grh_observed','operator_control'),
      'concepts', jsonb_build_array('701','703')
    )
  );
END
$$;

REVOKE ALL ON FUNCTION public.tenant_iam_assert_no_sod_conflict(uuid) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.tenant_iam_assert_no_sod_conflict(uuid)
  FROM municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_control_import_assert_context_v1(jsonb,text) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_assert_context_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_control_import_bootstrap_v1(jsonb) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_bootstrap_v1(jsonb)
  FROM municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_control_import_bootstrap_v1(jsonb)
  TO municontrol_actions_runtime_app;

DO $owner_tenant_authority_final_contract$
DECLARE
  missing_grants integer;
  forbidden_grants integer;
  override_count integer;
  raw_conflict_count integer;
  unexpected_conflict_count integer;
  eligible_scope_count integer;
  actual_scope_count integer;
  sod_source text;
  import_source text;
  import_source_compact text;
  bootstrap_source text;
  bootstrap_source_compact text;
BEGIN
  WITH expected(capability_key) AS (
    VALUES
      ('leave.request.area.decide'),
      ('leave.request.area.cancel_approved'),
      ('leave.request.restricted.decide'),
      ('time.overtime.approve'),
      ('payroll.control_import.validate'),
      ('payroll.novelty.approve'),
      ('payroll.reprocessing.approve'),
      ('payroll.art_report.generate')
  )
  SELECT count(*) INTO missing_grants
  FROM expected
  LEFT JOIN public.iam_role_capability mapping
    ON mapping.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
   AND mapping.capability_key = expected.capability_key
  WHERE mapping.capability_key IS NULL;
  IF missing_grants <> 0 THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_ROLE_MATRIX_DRIFT: %', missing_grants
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO forbidden_grants
  FROM public.iam_role_capability mapping
  WHERE mapping.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
    AND (mapping.capability_key LIKE 'platform.%'
      OR mapping.capability_key IN (
        'time.overtime.post',
        'payroll.novelty.post',
        'payroll.reprocessing.execute'
      ));
  IF forbidden_grants <> 0 THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_FORBIDDEN_GRANT: %', forbidden_grants
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO override_count
  FROM public.tenant_membership_capability_override override_row
  JOIN public.tenant_membership membership ON membership.id = override_row.membership_id
  WHERE membership.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
    AND override_row.capability_key IN (
      'leave.request.area.decide','leave.request.area.cancel_approved',
      'leave.request.restricted.decide','time.overtime.approve',
      'payroll.control_import.validate','payroll.novelty.approve',
      'payroll.reprocessing.approve','payroll.art_report.generate'
    );
  IF override_count <> 0 THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_OVERRIDE_DRIFT: %', override_count
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO raw_conflict_count
  FROM public.iam_capability_conflict conflict
  JOIN public.iam_role_capability left_grant
    ON left_grant.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
   AND left_grant.capability_key = conflict.capability_key
  JOIN public.iam_role_capability right_grant
    ON right_grant.role_key = left_grant.role_key
   AND right_grant.capability_key = conflict.conflicts_with_key;
  IF raw_conflict_count <> 3 THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_EXPECTED_CONFLICT_DRIFT: %', raw_conflict_count
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO unexpected_conflict_count
  FROM public.iam_capability_conflict conflict
  JOIN public.iam_role_capability left_grant
    ON left_grant.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
   AND left_grant.capability_key = conflict.capability_key
  JOIN public.iam_role_capability right_grant
    ON right_grant.role_key = left_grant.role_key
   AND right_grant.capability_key = conflict.conflicts_with_key
  WHERE (conflict.capability_key, conflict.conflicts_with_key) NOT IN (
    ('payroll.control_import.prepare', 'payroll.control_import.validate'),
    ('payroll.novelty.approve', 'payroll.novelty.prepare'),
    ('payroll.reprocessing.approve', 'payroll.reprocessing.prepare')
  );
  IF unexpected_conflict_count <> 0 THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_UNEXPECTED_SOD_CONFLICT: %',
      unexpected_conflict_count USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) * 7 INTO eligible_scope_count
  FROM public.tenant_membership membership
  JOIN public.internal_users users
    ON lower(users.email) = lower(membership.user_email) AND users.active IS TRUE
  JOIN public.platform_tenant tenant
    ON tenant.id = membership.tenant_id AND tenant.status = 'active'
  JOIN public.tenant_identity_policy policy
    ON policy.tenant_id = membership.tenant_id
   AND policy.tenant_data_plane_ready IS TRUE
  JOIN public.platform_tenant_source_binding binding
    ON binding.id = policy.certified_source_binding_id
   AND binding.tenant_id = membership.tenant_id
   AND binding.source_system = 'GRH' AND binding.verified IS TRUE
  JOIN public.tenant_action_authority authority
    ON authority.membership_id = membership.id
   AND authority.tenant_id = membership.tenant_id
  WHERE membership.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
    AND membership.status = 'active';

  SELECT count(*) INTO actual_scope_count
  FROM public.tenant_action_area_scope scope
  JOIN public.tenant_membership membership ON membership.id = scope.membership_id
  JOIN public.tenant_identity_policy policy ON policy.tenant_id = membership.tenant_id
  JOIN public.platform_tenant_source_binding binding
    ON binding.id = policy.certified_source_binding_id
   AND binding.tenant_id = membership.tenant_id
  WHERE membership.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
    AND membership.status = 'active'
    AND scope.tenant_id = membership.tenant_id
    AND scope.source_binding_id = binding.id
    AND scope.company_id = binding.source_company_id
    AND scope.scope_level = 'company'
    AND scope.organization_unit_source_id IS NULL
    AND scope.sector_source_id IS NULL
    AND scope.active IS TRUE
    AND scope.capability_key IN (
      'leave.request.area.create','leave.request.area.read',
      'leave.request.area.update','leave.request.area.submit',
      'leave.request.area.cancel_pending','leave.request.area.decide',
      'leave.request.area.cancel_approved'
    );
  IF actual_scope_count <> eligible_scope_count THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_SCOPE_DRIFT: expected %, actual %',
      eligible_scope_count, actual_scope_count USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint constraint_row
    WHERE constraint_row.conname = 'payroll_control_import_batch_maker_checker_ck'
      AND constraint_row.convalidated IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint constraint_row
    WHERE constraint_row.conname = 'payroll_novelty_batch_maker_checker_ck'
      AND constraint_row.convalidated IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint constraint_row
    WHERE constraint_row.conname = 'payroll_reprocessing_case_maker_checker_ck'
      AND constraint_row.convalidated IS TRUE
  ) OR to_regprocedure(
    'public.action_center_overtime_decider_separated_v1(uuid,uuid,uuid,text,uuid)'
  ) IS NULL OR to_regprocedure(
    'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_MAKER_CHECKER_GUARD_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_get_functiondef(
    'public.tenant_iam_assert_no_sod_conflict(uuid)'::regprocedure
  ) INTO sod_source;
  IF sod_source NOT LIKE '%PLATFORM_OWNER_OPERATIVO_INTEGRAL%'
     OR sod_source NOT LIKE '%payroll.control_import.prepare%'
     OR sod_source NOT LIKE '%payroll.novelty.approve%'
     OR sod_source NOT LIKE '%payroll.reprocessing.approve%' THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_SOD_FUNCTION_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_get_functiondef(
    'public.payroll_control_import_assert_context_v1(jsonb,text)'::regprocedure
  ) INTO import_source;
  import_source_compact := replace(
    regexp_replace(import_source, '[[:space:]]+', '', 'g'),
    '::text',
    ''
  );
  IF import_source_compact NOT LIKE
       '%INTOcapabilitiesFROMpublic.tenant_iam_effective_capabilities(membership_row.id)effectiveWHEREeffective.capability_keyLIKE''payroll.control_import.%'';%'
     OR import_source_compact NOT LIKE
       '%INTOreport_capabilitiesFROMpublic.tenant_iam_effective_capabilities(membership_row.id)effectiveWHEREeffective.capability_key=''payroll.art_report.generate'';%'
     OR import_source_compact NOT LIKE
       '%''capabilities'',capabilities,''reportCapabilities'',report_capabilities%' THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_REPORT_CHANNEL_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_get_functiondef(
    'public.payroll_control_import_bootstrap_v1(jsonb)'::regprocedure
  ) INTO bootstrap_source;
  bootstrap_source_compact := replace(
    regexp_replace(bootstrap_source, '[[:space:]]+', '', 'g'),
    '::text',
    ''
  );
  IF bootstrap_source_compact NOT LIKE
       '%''capabilities'',context_value->''capabilities'',''reportCapabilities'',context_value->''reportCapabilities''%' THEN
    RAISE EXCEPTION 'OWNER_TENANT_AUTHORITY_BOOTSTRAP_REPORT_CHANNEL_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.tenant_iam_assert_no_sod_conflict(membership.id)
  FROM public.tenant_membership membership
  WHERE membership.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
    AND membership.status = 'active';
END
$owner_tenant_authority_final_contract$;
