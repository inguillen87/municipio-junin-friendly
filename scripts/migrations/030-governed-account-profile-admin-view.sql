CREATE OR REPLACE FUNCTION tenant_iam_admin_view_v4(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_resource text,
  p_tenant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
$$;

COMMENT ON FUNCTION tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer) IS
  'Vista administrativa 030: expone la version de identidad como token de concurrencia y anuncia la correccion de nombre solo para tenants GRH certificados.';

REVOKE ALL ON FUNCTION tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)
  FROM PUBLIC CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'municontrol_actions_runtime_app') THEN
    RAISE EXCEPTION 'ACCOUNT_PROFILE_ADMIN_VIEW_RUNTIME_ROLE_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  REVOKE ALL PRIVILEGES ON FUNCTION tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)
    FROM municontrol_actions_runtime_app;
  GRANT EXECUTE ON FUNCTION tenant_iam_admin_view_v4(text,uuid,integer,text,text,uuid,integer)
    TO municontrol_actions_runtime_app;
END
$$;
