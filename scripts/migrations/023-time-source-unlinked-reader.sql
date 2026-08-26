-- MuniControl Friendly - Sprint 023
-- Separa lectura tenant de identidad laboral: una membresia activa con autoridad,
-- binding certificado y time.source.read puede consultar el registro temporal.
-- Las mutaciones y decisiones siguen exigiendo un actor laboral conocido.

CREATE OR REPLACE FUNCTION public.time_source_assert_actor_authority_v1(
  p_context jsonb,
  p_required_capability text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  authority_row public.tenant_action_authority%ROWTYPE;
  actor_employment_contract_id uuid;
  actor_person_id uuid;
  employment_linked boolean := false;
  capabilities jsonb;
BEGIN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
     OR p_required_capability NOT IN (
       'time.source.read','time.source.propose','time.source.approve','time.source.audit.read'
     ) THEN
    RAISE EXCEPTION 'TIME_SOURCE_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO authority_row
  FROM public.tenant_action_authority authority
  WHERE authority.membership_id = (p_context->>'membershipId')::uuid
    AND authority.tenant_id = (p_context->>'tenantId')::uuid
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_SOURCE_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.tenant_iam_assert_no_sod_conflict((p_context->>'membershipId')::uuid);
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
    WHERE capability.capability_key = p_required_capability
  ) THEN
    RAISE EXCEPTION 'TIME_SOURCE_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT link.employment_contract_id, contract.person_id
    INTO actor_employment_contract_id, actor_person_id
  FROM public.tenant_action_employment_link link
  JOIN public.employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = (p_context->>'sourceCompanyId')::bigint
  JOIN public.source_import_batch batch
    ON batch.id = contract.source_batch_id
   AND batch.source_system = 'GRH'
   AND batch.source_database = p_context->>'sourceDatabase'
   AND batch.validation_state = 'published'
   AND batch.legacy_import_run_id IS NOT NULL
  WHERE link.membership_id = (p_context->>'membershipId')::uuid
    AND link.tenant_id = (p_context->>'tenantId')::uuid
    AND link.source_binding_id = (p_context->>'certifiedBindingId')::uuid
    AND link.active IS TRUE
  FOR SHARE OF link, contract, batch NOWAIT;
  employment_linked := FOUND;

  IF NOT employment_linked AND p_required_capability <> 'time.source.read' THEN
    RAISE EXCEPTION 'TIME_SOURCE_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF employment_linked THEN
    PERFORM public.time_source_assert_person_sod_v1(
      (p_context->>'tenantId')::uuid,
      actor_person_id,
      (p_context->>'certifiedBindingId')::uuid
    );
  END IF;

  SELECT COALESCE(
      jsonb_agg(capability.capability_key ORDER BY capability.capability_key),
      '[]'::jsonb
    )
    INTO capabilities
  FROM public.tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
  WHERE capability.capability_key IN (
    'time.source.read','time.source.propose','time.source.approve','time.source.audit.read'
  );

  RETURN p_context || jsonb_build_object(
    'authorityVersion', authority_row.version,
    'employmentContractId', actor_employment_contract_id,
    'actorPersonId', actor_person_id,
    'employmentLinked', employment_linked,
    'capabilities', capabilities,
    'areaScopes', '[]'::jsonb
  );
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_SOURCE_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

COMMENT ON FUNCTION public.time_source_assert_actor_authority_v1(jsonb,text) IS
  'Autoriza lectura temporal por membership y capability; exige vinculo laboral para mutaciones y decisiones.';

DO $time_source_unlinked_reader_acl$
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
      'public.time_source_assert_actor_authority_v1(jsonb,text)'::regprocedure
      AND acl.grantee <> function_row.proowner
  LOOP
    IF acl_row.grantee = 0 THEN grantee_sql := 'PUBLIC';
    ELSIF acl_row.grantee_name IS NULL THEN
      RAISE EXCEPTION 'TIME_SOURCE_FUNCTION_ACL_UNKNOWN' USING ERRCODE = 'P0001';
    ELSE grantee_sql := format('%I', acl_row.grantee_name);
    END IF;
    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
      acl_row.schema_name, acl_row.function_name,
      acl_row.identity_arguments, grantee_sql
    );
  END LOOP;
END
$time_source_unlinked_reader_acl$;
