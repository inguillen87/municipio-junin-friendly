-- Authority resolution only. Install with its source-pinned four-phase protocol.
-- No proposal, decision, adoption, audit, identity, association or IAM writes.
-- FOR SHARE and SHARE locks mean this RPC is not a READ ONLY transaction RPC.
CREATE FUNCTION public.municipal_owner_adoption_authority_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE ctx jsonb;field_name text;identity_value integer;clock_value timestamptz;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_INPUT_INVALID';END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p) key) IS DISTINCT FROM
  ARRAY['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']::text[]
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_INPUT_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['actorEmail','actorSessionId','membershipId','releaseSha','tenantId'] LOOP
  IF jsonb_typeof(p->field_name) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_INPUT_INVALID';END IF;
 END LOOP;
 IF p->>'actorEmail' IS DISTINCT FROM lower(btrim(p->>'actorEmail')) OR length(p->>'actorEmail') NOT BETWEEN 3 AND 254
  OR p->>'actorEmail'~'[[:cntrl:]]' OR length(p->>'releaseSha')<>40 OR p->>'releaseSha'!~'^[a-f0-9]{40}$'
  OR jsonb_typeof(p->'actorSessionVersion') IS DISTINCT FROM 'number'
  OR p->>'actorSessionVersion'!~'^[1-9][0-9]{0,9}$' OR (p->>'actorSessionVersion')::numeric>2147483647
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_INPUT_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['actorSessionId','membershipId','tenantId'] LOOP
  IF length(p->>field_name)<>36 OR p->>field_name!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   OR p->>field_name='00000000-0000-0000-0000-000000000000'
  THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_INPUT_INVALID';END IF;
 END LOOP;
 -- Match the global owner-governance writer's lock order without pretending
 -- that a tenant membership session is a platform-context session.
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('PLATFORM_OWNER:GOVERNANCE',12012))
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_BUSY';END IF;
 -- Stop a concurrent capability deny/mapping change, including inserted rows,
 -- while the verified context is used by a later caller in this transaction.
 LOCK TABLE public.iam_role,public.iam_capability,public.iam_role_capability,
  public.iam_capability_conflict,public.tenant_membership_capability_override IN SHARE MODE NOWAIT;
 -- This exact existing guard resolves the administrative person. Its current
 -- source validates session/MFA, tenant, binding/release, SoD, actions.read,
 -- workforce.employee.read and employee.record.propose. No salary capability.
 ctx:=public.employment_adoption_administrative_context_v1(p,'employee.record.propose');
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'actorPersonId'='00000000-0000-0000-0000-000000000000'
  OR ctx->'adoptionActorVerified' IS DISTINCT FROM 'true'::jsonb
  OR ctx->>'tenantId' IS DISTINCT FROM p->>'tenantId' OR ctx->>'membershipId' IS DISTINCT FROM p->>'membershipId'
  OR length(ctx->>'sourceBindingId') IS DISTINCT FROM 36 OR ctx->>'sourceCompanyId' IS NULL
  OR (ctx->>'sourceCompanyId')::bigint NOT BETWEEN 1 AND 9007199254740991
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_REQUIRED';END IF;
 clock_value:=clock_timestamp();
 -- Read the real email-keyed account and its current identity version. The
 -- client supplies neither an account UUID nor a historical identity version.
 BEGIN
  SELECT users.identity_version INTO STRICT identity_value
  FROM public.internal_users users
  JOIN public.tenant_identity_session session ON lower(session.user_email)=lower(users.email)
  WHERE lower(users.email)=p->>'actorEmail' AND users.active IS TRUE AND users.auth_mode='managed'
   AND users.identity_version>0 AND session.identity_version=users.identity_version
   AND session.id=(p->>'actorSessionId')::uuid AND session.session_version=(p->>'actorSessionVersion')::integer
   AND session.active_tenant_id=(p->>'tenantId')::uuid AND session.source='membership'
   AND session.auth_level IN('mfa','recovery') AND session.status='active' AND session.revoked_at IS NULL
   AND session.expires_at>clock_value AND session.last_seen_at>clock_value-interval '1 hour'
  FOR SHARE OF users,session NOWAIT;
 EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_REQUIRED';END;
 PERFORM 1 FROM public.platform_user_role assignment
 JOIN public.iam_role role_row ON role_row.role_key=assignment.role_key AND role_row.scope_kind='platform'
 JOIN public.iam_role_capability mapping ON mapping.role_key=role_row.role_key
 JOIN public.iam_capability capability ON capability.capability_key=mapping.capability_key AND capability.scope_kind='platform'
 WHERE lower(assignment.user_email)=p->>'actorEmail' AND assignment.role_key='PLATFORM_OWNER'
  AND assignment.active IS TRUE AND assignment.revoked_at IS NULL AND assignment.revoked_by_user_email IS NULL
  AND assignment.version>0 AND mapping.capability_key='platform.tenants.manage'
 FOR SHARE OF assignment,role_row,mapping,capability NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_REQUIRED';END IF;
 RETURN jsonb_build_object(
  'scope',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId',
   'bindingId',ctx->>'sourceBindingId','companyId',(ctx->>'sourceCompanyId')::bigint),
  'authority',jsonb_build_object('version','municipal-adoption-owner-authority.v1',
   'policyVersion','tenant-owner-adoption-policy.v1','policySha256','3cd05ec553d4e19e511b4d755224efe36a470a02502704a621dec608ad312305',
   'actor',jsonb_build_object('personId',ctx->>'actorPersonId','email',p->>'actorEmail','identityVersion',identity_value,
    'sessionId',p->>'actorSessionId','sessionVersion',(p->>'actorSessionVersion')::integer,'releaseSha',p->>'releaseSha')));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_BUSY';
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_INPUT_INVALID';
END $$;
REVOKE ALL ON FUNCTION public.municipal_owner_adoption_authority_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.municipal_owner_adoption_authority_v1(jsonb) TO municontrol_actions_runtime_app;
