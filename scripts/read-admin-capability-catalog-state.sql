-- Read-only pre/postflight for migration 238. No session or identity data.
WITH function_state AS (
  SELECT encode(pg_catalog.sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition_sha256,
    pg_get_userbyid(p.proowner) AS owner, p.proacl::text AS acl,
    p.proconfig AS config, p.prosecdef AS security_definer, p.provolatile::text AS volatility
  FROM pg_catalog.pg_proc p
  WHERE p.oid=to_regprocedure('public.tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)')
)
SELECT definition_sha256,
  CASE definition_sha256
    WHEN '4dd56db18e6fa1befb5826a29a0ae135b87ee602c3200fb40c2acc32d0b39c12' THEN 'before_238'
    WHEN 'f49cad7291d18f99b0dca6a2004588fbf56af7c10f8ab7ad73414c6deb3ab176' THEN 'after_238'
    ELSE 'unrecognized'
  END AS definition_state,
  owner, acl, config, security_definer, volatility,
  owner='neondb_owner'
    AND acl='{neondb_owner=X/neondb_owner,municontrol_actions_runtime_app=X/neondb_owner}'
    AND config=ARRAY['search_path=public, pg_temp']::text[]
    AND security_definer IS TRUE AND volatility='v' AS execution_metadata_matches
FROM function_state;

SELECT capability.scope_kind, count(*) AS catalog_entries,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM public.iam_role_capability role_capability
    WHERE role_capability.capability_key=capability.capability_key
  )) AS entries_not_assigned_to_any_role,
  bool_or(capability.capability_key='payroll.calculation.close') AS contains_calculation_close
FROM public.iam_capability capability
GROUP BY capability.scope_kind ORDER BY capability.scope_kind;
