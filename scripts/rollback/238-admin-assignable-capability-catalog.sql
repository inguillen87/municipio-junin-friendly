-- 238: tenant capability catalogue for the authenticated administration view.
-- Changes one read function only. No capability, role, membership or grant DML.
-- Exact pre/post-image, owner, ACL and execution configuration are guarded.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $admin_catalog_238$
DECLARE actual_hash text; actual_owner text; actual_acl text; actual_config text[];
  actual_security boolean; actual_volatility text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('municontrol.admin-capability-catalog.238',0));
  SELECT encode(pg_catalog.sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
    pg_get_userbyid(p.proowner), p.proacl::text, p.proconfig, p.prosecdef, p.provolatile::text
  INTO actual_hash, actual_owner, actual_acl, actual_config, actual_security, actual_volatility
  FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)');
  IF actual_hash IS NULL OR actual_hash NOT IN ('f49cad7291d18f99b0dca6a2004588fbf56af7c10f8ab7ad73414c6deb3ab176','4dd56db18e6fa1befb5826a29a0ae135b87ee602c3200fb40c2acc32d0b39c12')
    OR actual_owner IS DISTINCT FROM 'neondb_owner'
    OR actual_acl IS DISTINCT FROM '{neondb_owner=X/neondb_owner,municontrol_actions_runtime_app=X/neondb_owner}'
    OR actual_config IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
    OR actual_security IS DISTINCT FROM true OR actual_volatility IS DISTINCT FROM 'v'
  THEN RAISE EXCEPTION 'ADMIN_CATALOG_238_ROLLBACK_PREIMAGE_CHANGED' USING ERRCODE='P0001'; END IF;

  IF actual_hash = '4dd56db18e6fa1befb5826a29a0ae135b87ee602c3200fb40c2acc32d0b39c12' THEN RETURN; END IF;
  EXECUTE $definition_238$CREATE OR REPLACE FUNCTION public.tenant_iam_admin_view_v4(p_actor_email text, p_actor_session_id uuid, p_actor_session_version integer, p_release_sha text, p_resource text, p_tenant_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result_value jsonb;
  users_value jsonb := '[]'::jsonb;
  tenant_ready boolean := false;
BEGIN
  result_value := tenant_iam_admin_view_v3(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_resource, p_tenant_id, p_limit
  );

  IF p_tenant_id IS NULL OR p_resource NOT IN ('bootstrap', 'users') THEN
    RETURN result_value;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM platform_tenant tenant
    JOIN tenant_identity_policy policy
      ON policy.tenant_id = tenant.id
     AND policy.tenant_data_plane_ready IS TRUE
     AND policy.certified_release_sha = p_release_sha
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = tenant.id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    WHERE tenant.id = p_tenant_id AND tenant.status = 'active'
  ) INTO tenant_ready;

  IF p_resource = 'users' THEN
    SELECT COALESCE(jsonb_agg(
      CASE WHEN account.identity_version IS NULL THEN item.value
        ELSE item.value || jsonb_build_object('identityVersion', account.identity_version)
      END ORDER BY item.ordinality
    ), '[]'::jsonb)
      INTO users_value
    FROM jsonb_array_elements(COALESCE(result_value->'users', '[]'::jsonb))
      WITH ORDINALITY AS item(value, ordinality)
    LEFT JOIN internal_users account
      ON lower(account.email) = lower(item.value->>'email');

    result_value := jsonb_set(result_value, '{users}', users_value, true);
    result_value := jsonb_set(result_value, '{items}', users_value, true);
  END IF;

  IF tenant_ready AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(
      COALESCE(result_value->'allowedCommands', '[]'::jsonb)
    ) command(value)
    WHERE command.value = 'update_account_profile'
  ) THEN
    result_value := jsonb_set(
      result_value,
      '{allowedCommands}',
      COALESCE(result_value->'allowedCommands', '[]'::jsonb)
        || jsonb_build_array('update_account_profile'),
      true
    );
  END IF;

  RETURN result_value;
END
$function$$definition_238$;
  SELECT encode(pg_catalog.sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),
    pg_get_userbyid(p.proowner), p.proacl::text, p.proconfig, p.prosecdef, p.provolatile::text
  INTO actual_hash, actual_owner, actual_acl, actual_config, actual_security, actual_volatility
  FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)');
  IF actual_hash IS NULL OR actual_hash NOT IN ('4dd56db18e6fa1befb5826a29a0ae135b87ee602c3200fb40c2acc32d0b39c12')
    OR actual_owner IS DISTINCT FROM 'neondb_owner'
    OR actual_acl IS DISTINCT FROM '{neondb_owner=X/neondb_owner,municontrol_actions_runtime_app=X/neondb_owner}'
    OR actual_config IS DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[]
    OR actual_security IS DISTINCT FROM true OR actual_volatility IS DISTINCT FROM 'v'
  THEN RAISE EXCEPTION 'ADMIN_CATALOG_238_ROLLBACK_POSTIMAGE_MISMATCH' USING ERRCODE='P0001'; END IF;

END
$admin_catalog_238$;
COMMIT;
