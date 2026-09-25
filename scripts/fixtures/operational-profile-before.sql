-- Código de funciones anterior; no contiene filas ni cuentas municipales.
CREATE OR REPLACE FUNCTION public.tenant_iam_reviewed_operational_pair_v1(p_role text, p_left text, p_right text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT COALESCE(p_role='MUNICIPIO_ADMIN_OPERATIVO' AND (p_left,p_right) IN (
('absence.enter','absence.validate'),
('employee.record.approve','employee.record.propose'),
('leave.approve','leave.enter'),
('time.source.approve','time.source.propose'),
('time.catalog.approve','time.catalog.propose'),
('attendance.evaluation.approve','attendance.evaluation.prepare'),
('payroll.control_import.prepare','payroll.control_import.validate'),
('payroll.novelty.approve','payroll.novelty.prepare'),
('payroll.reprocessing.approve','payroll.reprocessing.prepare'),
('payroll.monthly_close.approve','payroll.monthly_close.prepare'),
('payroll.parameter.approve','payroll.parameter.prepare'),
('payroll.fixed.approve','payroll.fixed.prepare')
 ),false)
$function$;

CREATE OR REPLACE FUNCTION public.action_center_assert_tenant_read_session_v2(p_actor_email text, p_actor_session_id uuid, p_actor_session_version integer, p_release_sha text, p_tenant_id uuid, p_membership_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.payroll_parameter_assert_context_v1(p_context jsonb, p_required_capability text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  context_value jsonb;
BEGIN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
     OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_context) key)
       IS DISTINCT FROM ARRAY[
         'actorEmail','actorSessionId','actorSessionVersion',
         'membershipId','releaseSha','tenantId'
       ]::text[]
     OR p_required_capability IS NULL OR p_required_capability NOT IN (
       'payroll.parameter.read','payroll.parameter.prepare',
       'payroll.parameter.approve','payroll.parameter.audit.read'
     ) THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_SESSION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.action_center_assert_tenant_read_session_v2(
    p_context->>'actorEmail',
    (p_context->>'actorSessionId')::uuid,
    (p_context->>'actorSessionVersion')::integer,
    lower(p_context->>'releaseSha'),
    (p_context->>'tenantId')::uuid,
    (p_context->>'membershipId')::uuid
  );
  IF NOT public.action_center_context_has_capability(context_value, p_required_capability) THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  RETURN context_value || jsonb_build_object(
    'actorSessionId', p_context->>'actorSessionId',
    'actorSessionVersion', (p_context->>'actorSessionVersion')::integer,
    'certifiedBindingId', context_value->>'sourceBindingId',
    'employmentLinked', context_value->>'actorPersonId' IS NOT NULL,
    'releaseSha', lower(p_context->>'releaseSha')
  );
EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$function$;

CREATE OR REPLACE FUNCTION public.school_certificate_context_v1(p_email text, p_session uuid, p_version integer, p_release text, p_tenant uuid, p_membership uuid, p_write boolean DEFAULT false, p_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE ctx jsonb;
BEGIN
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'workforce.employee.read')
  OR (p_write AND NOT action_center_context_has_capability(ctx,'employee.record.propose')) THEN
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED';
 END IF;
 IF p_write THEN
  -- Evidence preparation uses the read authority (including SoD), not payroll approval.
  -- Identity/session/policy/binding are locked by that assertion. Serialize retries
  -- by tenant, binding, membership and key without requiring the operator's legajo.
  PERFORM pg_advisory_xact_lock(hashtextextended('school-certificate:'||p_tenant::text||':'||
   (ctx->>'sourceBindingId')||':'||p_membership::text||':'||p_key,0));
 END IF;
 RETURN ctx;
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
 CASE SQLERRM
  WHEN 'ACTION_RELEASE_NOT_CERTIFIED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_RELEASE_NOT_CERTIFIED';
  WHEN 'ACTION_SOURCE_BINDING_REQUIRED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_BINDING_REQUIRED';
  WHEN 'ACTION_SESSION_BUSY' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
  WHEN 'ACTION_TENANT_AUTHORITY_REQUIRED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED';
  ELSE RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_INVALID';
 END CASE;
END $function$;

CREATE OR REPLACE FUNCTION public.tenant_iam_assert_no_sod_conflict(p_membership_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  membership_role text;
BEGIN
  SELECT membership.role_key INTO membership_role
  FROM public.tenant_membership membership
  WHERE membership.id = p_membership_id AND membership.status = 'active';
  IF EXISTS (
    SELECT 1 FROM public.iam_capability_conflict conflict
    JOIN public.tenant_iam_effective_capabilities(p_membership_id) left_cap
      ON left_cap.capability_key = conflict.capability_key
    JOIN public.tenant_iam_effective_capabilities(p_membership_id) right_cap
      ON right_cap.capability_key = conflict.conflicts_with_key
    WHERE NOT (
      public.tenant_iam_reviewed_operational_pair_v1(membership_role,conflict.capability_key,conflict.conflicts_with_key)
      OR       (membership_role = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
        AND (conflict.capability_key, conflict.conflicts_with_key) IN (
          ('payroll.control_import.prepare', 'payroll.control_import.validate'),
          ('payroll.novelty.approve', 'payroll.novelty.prepare'),
          ('payroll.reprocessing.approve', 'payroll.reprocessing.prepare')
        ))
      OR (membership_role = 'NOMINA_GESTION_INTEGRAL'
        AND (conflict.capability_key, conflict.conflicts_with_key) IN (
          ('payroll.novelty.approve', 'payroll.novelty.prepare'),
          ('payroll.reprocessing.approve', 'payroll.reprocessing.prepare'),
          ('payroll.monthly_close.approve', 'payroll.monthly_close.prepare')
        ))
    )
  ) THEN
    RAISE EXCEPTION 'TENANT_IAM_SOD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_can_review_v1(ctx jsonb, p native_employment_catalog_proposal)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
 SELECT coalesce(public.action_center_context_has_capability(ctx,'employee.catalog.approve') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL
  AND p.actor_membership_id<>(ctx->>'membershipId')::uuid AND p.actor_person_id<>(ctx->>'actorPersonId')::uuid AND p.actor_email<>ctx->>'actorEmail'
  AND NOT EXISTS(SELECT 1 FROM public.native_employment_catalog_review r WHERE r.proposal_id=p.id),false)
$function$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_review_v1(ctx jsonb, body jsonb, key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE c jsonb; p public.native_employment_catalog_proposal; reason_value text; decision_value text; proposal_value uuid; hash_value text; existing jsonb; catalog jsonb; revision_value integer; catalog_hash text; receipt_value jsonb;
BEGIN
 c:=public.native_employment_catalog_context_v1(ctx,'employee.catalog.approve');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['decision','proposalId','reason','scopeVersion']::text[]
  OR jsonb_typeof(body->'scopeVersion') IS DISTINCT FROM 'string' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'decision') IS DISTINCT FROM 'string' OR body->>'decision' NOT IN ('approve','reject') OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR octet_length(body::text)>2097152 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 reason_value:=normalize(btrim(body->>'reason'),NFC);decision_value:=body->>'decision';proposal_value:=(body->>'proposalId')::uuid;
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 hash_value:=encode(public.digest(jsonb_build_object('operation','review','body',jsonb_build_object('proposalId',proposal_value,'decision',decision_value,'reason',reason_value,'scopeVersion',body->>'scopeVersion'))::text,'sha256'),'hex');
 PERFORM public.native_employment_catalog_lock_v1(c);
 existing:=public.native_employment_catalog_replay_v1(c,key,'review',hash_value); IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF body->>'scopeVersion'<>public.native_employment_catalog_scope_v1(c) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_SCOPE_CHANGED'; END IF;
 SELECT q.* INTO p FROM public.native_employment_catalog_proposal q WHERE q.id=proposal_value AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_catalog_review r WHERE r.proposal_id=p.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_DECIDED'; END IF;
 IF NOT public.native_employment_catalog_can_review_v1(c,p) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_MAKER_CHECKER_REQUIRED'; END IF;
 PERFORM public.grh_curated_source_read_lock_v1(); catalog:=public.native_employee_catalog_v1(c);
 revision_value:=(catalog->>'revision')::integer;catalog_hash:=catalog->>'version';
 IF decision_value='approve' THEN
  IF p.base_version<>catalog_hash THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_BASE_CHANGED'; END IF;
  revision_value:=revision_value+1; IF revision_value>1000 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_LIMIT'; END IF;
  catalog_hash:=encode(public.digest(jsonb_build_object('version','native-employment-catalog.v1','tenantId',c->>'tenantId','sourceBindingId',c->>'sourceBindingId','proposalId',p.id,'revision',revision_value,'items',p.items)::text,'sha256'),'hex');
 END IF;
 PERFORM public.native_employment_catalog_capacity_v1(16384);
 receipt_value:=jsonb_build_object('version','native-employment-catalog.v1','operation','review','proposalId',p.id,'status',CASE decision_value WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'catalogVersion',catalog_hash,'revision',revision_value,'replayed',false);
 INSERT INTO public.native_employment_catalog_review(tenant_id,source_binding_id,proposal_id,decision,reason,revision,catalog_version,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt)
 VALUES((c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,p.id,decision_value,reason_value,revision_value,catalog_hash,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,hash_value,receipt_value);
 RETURN receipt_value;
END $function$;

CREATE OR REPLACE FUNCTION public.payroll_parameter_transition_v1(p_context jsonb, p_proposal_id uuid, p_command text, p_expected_version integer, p_reason_code text, p_reason_reference text, p_idempotency uuid, p_command_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  context_value jsonb;
  proposal_row public.payroll_parameter_proposal%ROWTYPE;
  existing_event public.payroll_parameter_event%ROWTYPE;
  required_capability text;
  next_status text;
  approved_value boolean := false;
  event_id_value bigint;
BEGIN
  IF p_proposal_id IS NULL OR p_command IS NULL OR p_reason_code IS NULL OR p_command NOT IN ('submit','approve','reject','cancel')
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR COALESCE(p_reason_reference,'') !~
       '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR (p_command = 'submit' AND p_reason_code <> 'ready_for_review')
     OR (p_command = 'approve' AND p_reason_code <> 'approved_by_checker')
     OR (p_command = 'reject' AND p_reason_code NOT IN (
       'source_mismatch','evidence_insufficient','period_not_ready'
     )) OR (p_command = 'cancel' AND p_reason_code <> 'cancelled_by_preparer') THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;
  required_capability := CASE WHEN p_command IN ('approve','reject')
    THEN 'payroll.parameter.approve' ELSE 'payroll.parameter.prepare' END;
  context_value := public.payroll_parameter_assert_context_v1(
    p_context, required_capability
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text, 0
  ));
  SELECT * INTO existing_event FROM public.payroll_parameter_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency FOR SHARE;
  IF FOUND THEN
    IF existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_BINDING_CHANGED' USING ERRCODE = 'P0001';
    END IF;
    IF existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <>
         (context_value->>'actorSessionVersion')::integer
       OR existing_event.release_sha <> lower(context_value->>'releaseSha')
       OR existing_event.actor_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> required_capability
       OR existing_event.proposal_id <> p_proposal_id OR existing_event.command <> p_command
       OR existing_event.command_hash <> lower(p_command_hash)
       OR existing_event.expected_version <> p_expected_version
       OR existing_event.reason_code IS DISTINCT FROM p_reason_code
       OR existing_event.reason_reference IS DISTINCT FROM p_reason_reference THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN public.payroll_parameter_event_result_v1(
      existing_event.id, existing_event.tenant_id
    ) || jsonb_build_object('replayed', true);
  END IF;
  SELECT * INTO proposal_row FROM public.payroll_parameter_proposal item
  WHERE item.id = p_proposal_id
    AND item.tenant_id = (context_value->>'tenantId')::uuid
    AND item.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF proposal_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'PAYROLL_PARAMETER_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
  IF p_command IN ('submit','cancel') THEN
    IF proposal_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
       OR proposal_row.prepared_by_person_id IS DISTINCT FROM (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_PREPARER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF (p_command = 'submit' AND proposal_row.status <> 'prepared')
       OR (p_command = 'cancel' AND proposal_row.status NOT IN ('prepared','submitted')) THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF proposal_row.status <> 'submitted' THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF NOT (context_value->>'employmentLinked')::boolean THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF proposal_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid
       OR (proposal_row.prepared_by_person_id IS NOT NULL AND
         proposal_row.prepared_by_person_id = (context_value->>'actorPersonId')::uuid) THEN
      RAISE EXCEPTION 'PAYROLL_PARAMETER_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;

  END IF;
  next_status := CASE p_command
    WHEN 'submit' THEN 'submitted'
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled' END;
  approved_value := p_command = 'approve';
  UPDATE public.payroll_parameter_proposal item SET
    status = next_status,
    version = item.version + 1,
    reason_code = p_reason_code,
    reason_reference = p_reason_reference,
    decided_by_membership_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'membershipId')::uuid ELSE NULL END,
    decided_by_person_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'actorPersonId')::uuid ELSE NULL END,
    proposal_approved = approved_value,
    submitted_at = CASE WHEN p_command = 'submit' THEN now() ELSE item.submitted_at END,
    decided_at = CASE WHEN p_command = 'submit' THEN NULL ELSE now() END,
    updated_at = now()
  WHERE item.id = proposal_row.id;
  INSERT INTO public.payroll_parameter_event (
    tenant_id, proposal_id, certified_binding_id, actor_membership_id,
    actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha, command,
    from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash, proposal_approved
  ) VALUES (
    proposal_row.tenant_id, proposal_row.id, proposal_row.certified_binding_id,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid, context_value->>'roleKey',
    required_capability, (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'), p_command, proposal_row.status,
    next_status, proposal_row.version, proposal_row.version + 1, p_reason_code,
    p_reason_reference, p_idempotency, lower(p_command_hash), approved_value
  ) RETURNING id INTO event_id_value;
  RETURN public.payroll_parameter_event_result_v1(event_id_value, proposal_row.tenant_id);
END
$function$;
