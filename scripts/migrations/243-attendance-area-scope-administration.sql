-- 243 · Governed administration of attendance area scopes: the only way to grant or withdraw a row of
-- public.attendance_area_scope. Additive preparation only: three new functions, no table, trigger, capability,
-- role or existing function is created, altered or redefined. Not installed; requires a rehearsal on a branch
-- of the database and explicit approval before it runs anywhere else.
-- Authority: the platform administration that already assigns capabilities and area scopes to memberships
-- (update_access and replace_action_scopes in 009). Both facades validate the platform session through
-- tenant_lifecycle_assert_platform_capability_v2 (which calls tenant_iam_assert_platform_session_v2: platform
-- context, MFA, active PLATFORM_OWNER, live session). Reading requires platform.users.manage; changing a scope
-- requires platform.users.manage and platform.roles.manage. Nothing here grants a capability: a scope recorded
-- for a membership that lacks the capability stays inert until the existing IAM flow assigns it.
-- The administered tenant must be active with its data plane certified for the caller's release; only rows of
-- that tenant and its certified GRH binding are read or written. Areas are exact (a null sector is the exact
-- unsectored area): there is no wildcard, no company-wide scope and no inheritance.
DO $prerequisite$
BEGIN
  IF to_regclass('public.attendance_area_scope') IS NULL
    OR to_regclass('public.attendance_area_scope_event') IS NULL
    OR to_regclass('public.tenant_membership') IS NULL
    OR to_regclass('public.internal_users') IS NULL
    OR to_regclass('public.platform_tenant') IS NULL
    OR to_regclass('public.tenant_identity_policy') IS NULL
    OR to_regclass('public.platform_tenant_source_binding') IS NULL
    OR to_regclass('public.tenant_iam_event') IS NULL
    OR to_regclass('public.iam_role_capability') IS NULL
    OR to_regclass('public.tenant_membership_capability_override') IS NULL
    OR to_regclass('public.native_employment_catalog_proposal') IS NULL
    OR to_regclass('public.native_employment_catalog_review') IS NULL
    OR to_regprocedure('public.attendance_area_context_v1(jsonb,text)') IS NULL
    OR to_regprocedure('public.attendance_area_catalog_label_v1(jsonb,jsonb)') IS NULL
    OR to_regprocedure('public.native_employee_catalog_v1(jsonb)') IS NULL
    OR to_regprocedure('public.grh_curated_source_read_lock_v1()') IS NULL
    OR to_regprocedure('public.tenant_lifecycle_assert_platform_capability_v2(text,uuid,integer,text)') IS NULL
    OR to_regprocedure('public.tenant_iam_effective_capabilities(uuid)') IS NULL
    OR to_regprocedure('public.digest(text,text)') IS NULL
    OR to_regrole('municontrol_actions_runtime_app') IS NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_ADMIN_PREREQUISITE';
  END IF;
  IF to_regprocedure('public.attendance_area_scope_admin_context_v1(jsonb,boolean)') IS NOT NULL
    OR to_regprocedure('public.attendance_area_scope_admin_read_v1(jsonb,jsonb)') IS NOT NULL
    OR to_regprocedure('public.attendance_area_scope_admin_command_v1(jsonb,jsonb,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_ADMIN_ALREADY_INSTALLED';
  END IF;
END
$prerequisite$;

-- Private helper. Never granted to the runtime role: only the two facades below call it. Every call rechecks
-- the real platform session, the live platform authority, the tenant, its certified release and binding, and
-- rereads the approved catalogue under the same locks the area readers take.
CREATE FUNCTION public.attendance_area_scope_admin_context_v1(p_context jsonb,p_writer boolean)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
SET timezone='UTC'
AS $$
DECLARE
  actor_email text; actor_session uuid; actor_session_version integer; tenant_id_value uuid;
  actor_row public.internal_users%ROWTYPE;
  tenant_row public.platform_tenant%ROWTYPE;
  policy_row public.tenant_identity_policy%ROWTYPE;
  binding_row public.platform_tenant_source_binding%ROWTYPE;
  catalog jsonb; scope_versions jsonb;
BEGIN
  IF p_writer IS NULL OR jsonb_typeof(p_context) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_SESSION_INVALID' USING ERRCODE='P0001';
  END IF;
  -- Exact shape: the five keys of a platform administration session plus the administered tenant.
  IF (SELECT count(*) FROM jsonb_object_keys(p_context))<>5
    OR NOT p_context ?& ARRAY['actorEmail','actorSessionId','actorSessionVersion','releaseSha','tenantId']
    OR jsonb_typeof(p_context->'actorEmail') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_context->'actorSessionId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_context->'actorSessionVersion') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_context->'releaseSha') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_context->'tenantId') IS DISTINCT FROM 'string'
    OR length(btrim(p_context->>'actorEmail')) NOT BETWEEN 3 AND 320
    OR (p_context->>'actorSessionId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR (p_context->>'actorSessionVersion')!~'^[1-9][0-9]{0,8}$'
    OR (p_context->>'releaseSha')!~'^[a-f0-9]{40}$'
    OR (p_context->>'tenantId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_SESSION_INVALID' USING ERRCODE='P0001';
  END IF;
  actor_email:=lower(btrim(p_context->>'actorEmail'));
  actor_session:=(p_context->>'actorSessionId')::uuid;
  actor_session_version:=(p_context->>'actorSessionVersion')::integer;
  tenant_id_value:=(p_context->>'tenantId')::uuid;

  -- The same session and authority check the platform administration writers use (009, 028). It raises
  -- TENANT_IAM_SESSION_INVALID or TENANT_LIFECYCLE_PLATFORM_CAPABILITY_REQUIRED.
  PERFORM public.tenant_lifecycle_assert_platform_capability_v2(
    actor_email,actor_session,actor_session_version,'platform.users.manage');
  IF p_writer THEN
    -- A scope is an access assignment and an area assignment: both existing authorities are required.
    PERFORM public.tenant_lifecycle_assert_platform_capability_v2(
      actor_email,actor_session,actor_session_version,'platform.roles.manage');
  END IF;
  SELECT * INTO actor_row FROM public.internal_users users
  WHERE lower(users.email)=actor_email AND users.active IS TRUE
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_SESSION_INVALID' USING ERRCODE='P0001';
  END IF;

  -- The administered tenant, its certified release and its certified GRH binding (as 010 and 028 require).
  SELECT * INTO tenant_row FROM public.platform_tenant tenant
  WHERE tenant.id=tenant_id_value AND tenant.status='active'
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_TENANT_NOT_READY' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO policy_row FROM public.tenant_identity_policy policy
  WHERE policy.tenant_id=tenant_row.id AND policy.tenant_data_plane_ready IS TRUE
    AND lower(policy.certified_release_sha)=(p_context->>'releaseSha')
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_TENANT_NOT_READY' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO binding_row FROM public.platform_tenant_source_binding binding
  WHERE binding.id=policy_row.certified_source_binding_id AND binding.tenant_id=tenant_row.id
    AND binding.source_system='GRH' AND binding.verified IS TRUE
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_TENANT_NOT_READY' USING ERRCODE='P0001';
  END IF;

  IF p_writer THEN
    -- Self-conflicting and taken before the scope set is read: one scope writer at a time, so two commands
    -- can never both insert the same scope nor both pass the same scope-set version.
    LOCK TABLE public.attendance_area_scope IN SHARE ROW EXCLUSIVE MODE NOWAIT;
  END IF;
  -- The locks attendance_area_context_v1 takes: capabilities, scopes and catalogue stay stable until commit.
  LOCK TABLE public.iam_role_capability,public.tenant_membership_capability_override,public.attendance_area_scope,
    public.native_employment_catalog_proposal,public.native_employment_catalog_review IN SHARE MODE NOWAIT;
  PERFORM public.grh_curated_source_read_lock_v1();
  catalog:=public.native_employee_catalog_v1(jsonb_build_object(
    'tenantId',tenant_row.id,'sourceBindingId',binding_row.id,
    'sourceDatabase',binding_row.source_database,'sourceCompanyId',binding_row.source_company_id::text));
  IF jsonb_typeof(catalog) IS DISTINCT FROM 'object' OR jsonb_typeof(catalog->'items') IS DISTINCT FROM 'array'
    OR (catalog->>'version') IS NULL OR (catalog->>'version')!~'^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_CATALOG_UNAVAILABLE' USING ERRCODE='P0001';
  END IF;

  -- Optimistic concurrency token, not authority: every scope row of this tenant and binding with its version,
  -- bound to the catalogue the administrator saw.
  SELECT coalesce(jsonb_agg(jsonb_build_array(s.id,s.version) ORDER BY s.id),'[]'::jsonb) INTO scope_versions
  FROM public.attendance_area_scope s
  WHERE s.tenant_id=tenant_row.id AND s.source_binding_id=binding_row.id;
  RETURN jsonb_build_object(
    'tenantId',tenant_row.id,'sourceBindingId',binding_row.id,'actorEmail',actor_row.email,'catalog',catalog,
    'scopeSetVersion',encode(public.digest(jsonb_build_object(
      'version','attendance-area-scope-set.v1','tenantId',tenant_row.id,'sourceBindingId',binding_row.id,
      'catalogVersion',catalog->>'version','scopes',scope_versions)::text,'sha256'),'hex'));
END
$$;

CREATE FUNCTION public.attendance_area_scope_admin_read_v1(p_context jsonb,p_query jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
SET timezone='UTC'
AS $$
DECLARE
  ctx jsonb; result_value jsonb;
BEGIN
  IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_QUERY_INVALID' USING ERRCODE='P0001';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_query))<>1 OR NOT p_query ? 'resource'
    OR jsonb_typeof(p_query->'resource') IS DISTINCT FROM 'string' OR (p_query->>'resource')<>'scopes' THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_QUERY_INVALID' USING ERRCODE='P0001';
  END IF;
  -- Rechecks the platform session, platform.users.manage, the tenant, its certified release and binding.
  ctx:=public.attendance_area_scope_admin_context_v1(p_context,false);

  WITH item AS MATERIALIZED (
    SELECT entry.value->>'kind' AS kind,entry.value->>'code' AS code,entry.value->>'label' AS label
    FROM jsonb_array_elements(ctx->'catalog'->'items') entry(value)
    WHERE (entry.value->>'kind') IN ('organizations','sectors')
  ), selectable AS MATERIALIZED (
    -- Only what attendance_area_catalog_label_v1 can name: one entry per code, an id the scope table accepts
    -- and a clean label. The catalogue names each component; it does not assert that a sector belongs to an
    -- organization unit. The command decides with that same function.
    SELECT candidate.kind,candidate.code,btrim(candidate.label) AS label
    FROM (
      SELECT item.kind,item.code,item.label,count(*) OVER (PARTITION BY item.kind,item.code) AS matches FROM item
    ) candidate
    WHERE candidate.matches=1 AND candidate.code~'^(0|[1-9][0-9]{0,18})$'
      AND length(btrim(candidate.label)) BETWEEN 1 AND 240
      AND candidate.label!~'[<>[:cntrl:]]' AND candidate.label=normalize(candidate.label,NFC)
      AND candidate.label !~ U&'[\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B-\200F\202A-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]'
  ), held AS MATERIALIZED (
    -- Live effective capabilities; a suspended membership holds none.
    SELECT membership.id AS membership_id,effective.capability_key::text AS capability_key
    FROM public.tenant_membership membership
    CROSS JOIN LATERAL public.tenant_iam_effective_capabilities(membership.id) effective
    WHERE membership.tenant_id=(ctx->>'tenantId')::uuid
      AND effective.capability_key IN ('attendance.area.read','attendance.area.devices.propose',
        'attendance.area.devices.approve','attendance.area.devices.audit.read')
  ), scope_row AS MATERIALIZED (
    SELECT s.id,s.membership_id,s.capability_key::text AS capability_key,s.organization_unit_source_id,s.sector_source_id,
      s.active,s.version,s.authorization_reference,lower(s.updated_by_user_email) AS updated_by,s.updated_at,
      org.label AS organization_label,sec.label AS sector_label,
      (org.code IS NOT NULL AND (s.sector_source_id IS NULL OR sec.code IS NOT NULL)) AS in_catalog,
      EXISTS (SELECT 1 FROM held WHERE held.membership_id=s.membership_id
        AND held.capability_key=s.capability_key::text) AS capability_held
    FROM public.attendance_area_scope s
    LEFT JOIN selectable org ON org.kind='organizations' AND org.code=s.organization_unit_source_id
    LEFT JOIN selectable sec ON sec.kind='sectors' AND sec.code=s.sector_source_id
    WHERE s.tenant_id=(ctx->>'tenantId')::uuid AND s.source_binding_id=(ctx->>'sourceBindingId')::uuid
  ), account AS MATERIALIZED (
    -- What the users reader of 009/238 already shows to this authority, and no more: membership id, role key,
    -- display name, e-mail and status. Active memberships can receive scopes; a membership that is no longer
    -- active is listed only while it still has scope rows, so they can be seen and withdrawn.
    SELECT membership.id,membership.role_key::text AS role_key,membership.status::text AS status,
      lower(users.email) AS email,
      left(coalesce(nullif(btrim(users.display_name),''),lower(users.email)),320) AS display_name,
      (lower(membership.user_email)=lower(ctx->>'actorEmail')) AS is_self
    FROM public.tenant_membership membership
    JOIN public.internal_users users ON lower(users.email)=lower(membership.user_email)
    WHERE membership.tenant_id=(ctx->>'tenantId')::uuid
      AND (membership.status='active'
        OR EXISTS (SELECT 1 FROM scope_row WHERE scope_row.membership_id=membership.id))
  )
  SELECT jsonb_build_object(
    'version','attendance-area-scope-admin.v1','resource','scopes',
    'tenantId',ctx->>'tenantId',
    'scopeSetVersion',ctx->>'scopeSetVersion',
    'catalogVersion',ctx->'catalog'->>'version',
    'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'membershipId',account.id,'roleKey',account.role_key,'displayName',account.display_name,
        'email',account.email,'status',account.status,'self',account.is_self,
        'grantable',(account.status='active' AND NOT account.is_self),
        'areaCapabilities',coalesce((SELECT jsonb_agg(held.capability_key ORDER BY held.capability_key)
          FROM held WHERE held.membership_id=account.id),'[]'::jsonb))
      ORDER BY account.display_name,account.email,account.id) FROM account),'[]'::jsonb),
    'organizationUnits',coalesce((SELECT jsonb_agg(jsonb_build_object('id',selectable.code,'label',selectable.label)
      ORDER BY selectable.label,selectable.code) FROM selectable WHERE selectable.kind='organizations'),'[]'::jsonb),
    'sectors',coalesce((SELECT jsonb_agg(jsonb_build_object('id',selectable.code,'label',selectable.label)
      ORDER BY selectable.label,selectable.code) FROM selectable WHERE selectable.kind='sectors'),'[]'::jsonb),
    'scopes',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'scopeId',scope_row.id,'membershipId',scope_row.membership_id,'capability',scope_row.capability_key,
        'organizationUnitSourceId',scope_row.organization_unit_source_id,'sectorSourceId',scope_row.sector_source_id,
        'organizationUnitLabel',scope_row.organization_label,'sectorLabel',scope_row.sector_label,
        'areaInCatalog',scope_row.in_catalog,'active',scope_row.active,'version',scope_row.version,
        'authorizationReference',scope_row.authorization_reference,
        'updatedByEmail',scope_row.updated_by,'updatedAt',scope_row.updated_at,
        'capabilityHeld',scope_row.capability_held)
      ORDER BY scope_row.membership_id,scope_row.capability_key,scope_row.organization_unit_source_id,
        scope_row.sector_source_id NULLS FIRST,scope_row.id) FROM scope_row),'[]'::jsonb))
    INTO result_value;

  -- Never a silent cut: beyond these bounds the reader refuses instead of returning part of the tenant.
  IF jsonb_array_length(result_value->'memberships')>1000 OR jsonb_array_length(result_value->'scopes')>5000
    OR jsonb_array_length(result_value->'organizationUnits')>2000
    OR jsonb_array_length(result_value->'sectors')>2000 THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_LIMIT' USING ERRCODE='P0001';
  END IF;
  RETURN result_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_BUSY' USING ERRCODE='P0001';
END
$$;

CREATE FUNCTION public.attendance_area_scope_admin_command_v1(p_context jsonb,p_command jsonb,p_key uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
SET timezone='UTC'
AS $$
DECLARE
  ctx jsonb; operation_value text; capability_value text; unit_value text; sector_value text;
  reference_value text; command_name text; command_hash_value text; actor_email_value text;
  membership_id_value uuid; tenant_id_value uuid; binding_id_value uuid;
  area_value jsonb; named_area jsonb;
  target_row public.tenant_membership%ROWTYPE;
  scope_value public.attendance_area_scope%ROWTYPE;
  replay_row public.tenant_iam_event%ROWTYPE;
  changed_value boolean:=false; replayed_value boolean:=false;
BEGIN
  IF p_key IS NULL OR p_key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
    OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_COMMAND_INVALID' USING ERRCODE='P0001';
  END IF;
  -- Exact shape: one scope, one operation, its authorization reference and the scope set the caller saw.
  IF (SELECT count(*) FROM jsonb_object_keys(p_command))<>6
    OR NOT p_command ?& ARRAY['operation','membershipId','capability','area','authorizationReference','scopeSetVersion']
    OR jsonb_typeof(p_command->'operation') IS DISTINCT FROM 'string'
    OR (p_command->>'operation') NOT IN ('grant','withdraw')
    OR jsonb_typeof(p_command->'membershipId') IS DISTINCT FROM 'string'
    OR (p_command->>'membershipId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_command->'capability') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_command->'authorizationReference') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_command->'scopeSetVersion') IS DISTINCT FROM 'string'
    OR (p_command->>'scopeSetVersion')!~'^[a-f0-9]{64}$'
    OR jsonb_typeof(p_command->'area') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_COMMAND_INVALID' USING ERRCODE='P0001';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_command->'area'))<>2
    OR NOT (p_command->'area') ?& ARRAY['organizationUnitSourceId','sectorSourceId']
    OR jsonb_typeof(p_command->'area'->'organizationUnitSourceId') IS DISTINCT FROM 'string'
    OR (p_command->'area'->>'organizationUnitSourceId')!~'^(0|[1-9][0-9]{0,18})$'
    OR ((p_command->'area'->'sectorSourceId')<>'null'::jsonb
      AND (jsonb_typeof(p_command->'area'->'sectorSourceId') IS DISTINCT FROM 'string'
        OR (p_command->'area'->>'sectorSourceId')!~'^(0|[1-9][0-9]{0,18})$')) THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_COMMAND_INVALID' USING ERRCODE='P0001';
  END IF;
  capability_value:=p_command->>'capability';
  IF capability_value NOT IN ('attendance.area.read','attendance.area.devices.propose',
    'attendance.area.devices.approve','attendance.area.devices.audit.read') THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_CAPABILITY_INVALID' USING ERRCODE='P0001';
  END IF;
  reference_value:=normalize(btrim(p_command->>'authorizationReference'),NFC);
  IF length(reference_value) NOT BETWEEN 10 AND 500 OR reference_value~'[<>[:cntrl:]]'
    OR reference_value ~ U&'[\0080-\009F\00AD\0600-\0605\061C\06DD\070F\0890-\0891\08E2\180E\200B-\200F\202A-\202E\2060-\2064\2066-\206F\FEFF\FFF9-\FFFB\+0110BD\+0110CD\+013430-\+01343F\+01BCA0-\+01BCA3\+01D173-\+01D17A\+0E0001\+0E0020-\+0E007F]' THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_REFERENCE_INVALID' USING ERRCODE='P0001';
  END IF;
  operation_value:=p_command->>'operation';
  membership_id_value:=(p_command->>'membershipId')::uuid;
  unit_value:=p_command->'area'->>'organizationUnitSourceId';
  sector_value:=p_command->'area'->>'sectorSourceId';
  area_value:=jsonb_build_object('organizationUnitSourceId',unit_value,'sectorSourceId',sector_value);
  command_name:='attendance_area_scope_'||operation_value;

  -- Platform session, platform.users.manage and platform.roles.manage, tenant, certified release and binding;
  -- then the exclusive scope lock and the catalogue locks. Nothing below runs for another caller.
  ctx:=public.attendance_area_scope_admin_context_v1(p_context,true);
  tenant_id_value:=(ctx->>'tenantId')::uuid;
  binding_id_value:=(ctx->>'sourceBindingId')::uuid;
  actor_email_value:=ctx->>'actorEmail';

  -- The replay envelope is derived here, never taken from the caller: command, tenant, normalized payload,
  -- session and release (as 028 does).
  command_hash_value:=encode(public.digest(jsonb_build_object(
    'command',command_name,'tenantId',tenant_id_value,
    'payload',jsonb_build_object('membershipId',membership_id_value,'capability',capability_value,'area',area_value,
      'authorizationReference',reference_value,'scopeSetVersion',p_command->>'scopeSetVersion'),
    'actorSessionId',p_context->>'actorSessionId',
    'actorSessionVersion',(p_context->>'actorSessionVersion')::integer,
    'releaseSha',p_context->>'releaseSha')::text,'sha256'),'hex');
  -- The same actor and key always serialise before the event is read, with the lock key of 004 and 028.
  PERFORM pg_advisory_xact_lock(hashtextextended(lower(actor_email_value)||':'||p_key::text,0));
  SELECT * INTO replay_row FROM public.tenant_iam_event event
  WHERE event.actor_user_email=actor_email_value AND event.idempotency_key=p_key;
  IF FOUND THEN
    -- Same key again: only the very same command is answered, with the row as it is now and no new version.
    IF replay_row.command IS DISTINCT FROM command_name
      OR replay_row.command_hash IS DISTINCT FROM command_hash_value
      OR replay_row.tenant_id IS DISTINCT FROM tenant_id_value
      OR replay_row.membership_id IS DISTINCT FROM membership_id_value
      OR replay_row.target_type IS DISTINCT FROM 'attendance_area_scope'
      OR replay_row.target_id!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_IDEMPOTENCY_REUSED' USING ERRCODE='P0001';
    END IF;
    SELECT * INTO scope_value FROM public.attendance_area_scope s
    WHERE s.id=replay_row.target_id::uuid AND s.tenant_id=tenant_id_value
      AND s.source_binding_id=binding_id_value AND s.membership_id=membership_id_value;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_IDEMPOTENCY_REUSED' USING ERRCODE='P0001';
    END IF;
    replayed_value:=true;
  ELSE
    IF (p_command->>'scopeSetVersion') IS DISTINCT FROM (ctx->>'scopeSetVersion') THEN
      RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_STALE' USING ERRCODE='P0001';
    END IF;
    -- A membership of another tenant is indistinguishable from one that does not exist.
    SELECT * INTO target_row FROM public.tenant_membership membership
    WHERE membership.id=membership_id_value AND membership.tenant_id=tenant_id_value
    FOR SHARE NOWAIT;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_FOUND' USING ERRCODE='P0001';
    END IF;
    -- Nobody decides their own areas, neither to grant nor to withdraw.
    IF lower(target_row.user_email)=lower(actor_email_value) THEN
      RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_SELF_ASSIGNMENT' USING ERRCODE='P0001';
    END IF;
    IF operation_value='grant' THEN
      IF target_row.status<>'active' THEN
        RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_ACTIVE' USING ERRCODE='P0001';
      END IF;
      -- The area must be nameable by the function the area readers use: a scope they could not name would
      -- block every area of that account (ATTENDANCE_AREA_CATALOG_CHANGED in attendance_area_context_v1).
      BEGIN
        named_area:=public.attendance_area_catalog_label_v1(ctx->'catalog',area_value);
      EXCEPTION WHEN SQLSTATE 'P0001' THEN
        IF SQLERRM IN ('ATTENDANCE_AREA_CATALOG_CHANGED','ATTENDANCE_AREA_QUERY_INVALID') THEN
          RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_AREA_NOT_IN_CATALOG' USING ERRCODE='P0001';
        END IF;
        RAISE;
      END;
      IF named_area IS NULL OR (named_area->>'areaLabel') IS NULL THEN
        RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_AREA_NOT_IN_CATALOG' USING ERRCODE='P0001';
      END IF;
    END IF;
    -- Withdrawing only removes access, so it stays possible for a membership that is no longer active and
    -- for an area that left the catalogue: otherwise a suspended account would keep its scopes for the day it
    -- is reactivated, and an account blocked by a vanished area could never be repaired.

    SELECT * INTO scope_value FROM public.attendance_area_scope s
    WHERE s.tenant_id=tenant_id_value AND s.membership_id=membership_id_value
      AND s.source_binding_id=binding_id_value AND s.capability_key=capability_value
      AND s.organization_unit_source_id=unit_value
      AND coalesce(s.sector_source_id,'')=coalesce(sector_value,'')
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN
      IF operation_value='withdraw' THEN
        RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_NOT_FOUND' USING ERRCODE='P0001';
      END IF;
      INSERT INTO public.attendance_area_scope(tenant_id,membership_id,source_binding_id,capability_key,
        organization_unit_source_id,sector_source_id,active,version,authorization_reference,updated_by_user_email)
      VALUES(tenant_id_value,membership_id_value,binding_id_value,capability_value,
        unit_value,sector_value,true,1,reference_value,actor_email_value)
      RETURNING * INTO scope_value;
      changed_value:=true;
    ELSIF scope_value.active IS DISTINCT FROM (operation_value='grant') THEN
      -- Reactivation or withdrawal: the guard trigger requires exactly the next version.
      UPDATE public.attendance_area_scope SET active=(operation_value='grant'),version=version+1,
        authorization_reference=reference_value,updated_by_user_email=actor_email_value
      WHERE id=scope_value.id
      RETURNING * INTO scope_value;
      changed_value:=true;
    END IF;
    -- Already in the requested state: the current row is returned unchanged and nothing is recorded.
    IF changed_value THEN
      -- The administrative audit and replay record; the reference itself stays only on the scope row and in
      -- its append-only event written by the scope trigger.
      INSERT INTO public.tenant_iam_event(actor_user_email,tenant_id,membership_id,command,target_type,target_id,
        idempotency_key,command_hash,result)
      VALUES(actor_email_value,tenant_id_value,membership_id_value,command_name,'attendance_area_scope',
        scope_value.id::text,p_key,command_hash_value,
        jsonb_build_object('scopeId',scope_value.id,'version',scope_value.version,'active',scope_value.active));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'version','attendance-area-scope-admin.v1','resource','command','tenantId',tenant_id_value,
    'operation',operation_value,'changed',changed_value,'replayed',replayed_value,
    'scope',jsonb_build_object(
      'scopeId',scope_value.id,'membershipId',scope_value.membership_id,'capability',scope_value.capability_key,
      'organizationUnitSourceId',scope_value.organization_unit_source_id,'sectorSourceId',scope_value.sector_source_id,
      'active',scope_value.active,'version',scope_value.version,
      'authorizationReference',scope_value.authorization_reference,
      'updatedByEmail',lower(scope_value.updated_by_user_email),'updatedAt',scope_value.updated_at));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'ATTENDANCE_AREA_SCOPE_BUSY' USING ERRCODE='P0001';
END
$$;

REVOKE ALL ON FUNCTION public.attendance_area_scope_admin_context_v1(jsonb,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.attendance_area_scope_admin_read_v1(jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_area_scope_admin_command_v1(jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_area_scope_admin_read_v1(jsonb,jsonb) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.attendance_area_scope_admin_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
