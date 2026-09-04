-- MuniControl Friendly - Sprint 037
-- Restaura la traduccion estable de contencion NOWAIT en el contexto de
-- importacion de cierre, preservando el canal ART agregado por 036.

DO $payroll_control_import_lock_prerequisites$
DECLARE
  function_source text;
  function_source_compact text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.schema_migrations
    WHERE version = '036-owner-tenant-operational-authority'
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_LOCK_037_PREREQUISITE_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_get_functiondef(
    'public.payroll_control_import_assert_context_v1(jsonb,text)'::regprocedure
  ) INTO function_source;
  function_source_compact := replace(
    regexp_replace(function_source, '[[:space:]]+', '', 'g'),
    '::text',
    ''
  );
  IF function_source_compact NOT LIKE
       '%INTOreport_capabilitiesFROMpublic.tenant_iam_effective_capabilities(membership_row.id)effectiveWHEREeffective.capability_key=''payroll.art_report.generate'';%'
     OR function_source_compact NOT LIKE
       '%''capabilities'',capabilities,''reportCapabilities'',report_capabilities%' THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_LOCK_037_REPORT_CHANNEL_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;
END
$payroll_control_import_lock_prerequisites$;

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
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

COMMENT ON FUNCTION public.payroll_control_import_assert_context_v1(jsonb,text) IS
  'Valida contexto de control de cierre; separa capacidades ART y traduce contencion NOWAIT a SESSION_BUSY.';

REVOKE ALL ON FUNCTION public.payroll_control_import_assert_context_v1(jsonb,text) FROM PUBLIC;

REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_assert_context_v1(jsonb,text)
  FROM municontrol_actions_runtime_app;

DO $payroll_control_import_lock_final_contract$
DECLARE
  function_source text;
  function_source_compact text;
BEGIN
  SELECT pg_get_functiondef(
    'public.payroll_control_import_assert_context_v1(jsonb,text)'::regprocedure
  ) INTO function_source;
  function_source_compact := replace(
    regexp_replace(function_source, '[[:space:]]+', '', 'g'),
    '::text',
    ''
  );
  IF function_source_compact NOT LIKE
       '%EXCEPTIONWHENlock_not_availableTHENRAISEEXCEPTION''PAYROLL_CONTROL_IMPORT_SESSION_BUSY''USINGERRCODE=''P0001'';%'
     OR function_source_compact NOT LIKE
       '%INTOcapabilitiesFROMpublic.tenant_iam_effective_capabilities(membership_row.id)effectiveWHEREeffective.capability_keyLIKE''payroll.control_import.%'';%'
     OR function_source_compact NOT LIKE
       '%INTOreport_capabilitiesFROMpublic.tenant_iam_effective_capabilities(membership_row.id)effectiveWHEREeffective.capability_key=''payroll.art_report.generate'';%'
     OR function_source_compact NOT LIKE
       '%''capabilities'',capabilities,''reportCapabilities'',report_capabilities%' THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_LOCK_037_FINAL_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;
END
$payroll_control_import_lock_final_contract$;
