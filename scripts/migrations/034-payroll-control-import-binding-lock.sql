-- MuniControl Friendly - Sprint 034
-- Evolucion aditiva del contrato 025: el ledger y los bytes historicos de 025
-- permanecen inmutables. La fachada prepare exige el binding usado para el
-- HMAC y lo compara mientras conserva los locks de contexto hasta COMMIT.

DO $payroll_control_import_binding_upgrade$
DECLARE
  old_signature regprocedure := to_regprocedure(
    'public.payroll_control_import_prepare_v1(jsonb,text,date,text,text,text,integer,jsonb,uuid,text)'
  );
  locked_signature regprocedure := to_regprocedure(
    'public.payroll_control_import_prepare_locked_v1(jsonb,text,date,text,text,text,integer,jsonb,uuid,text)'
  );
  new_signature regprocedure := to_regprocedure(
    'public.payroll_control_import_prepare_v1(jsonb,uuid,text,date,text,text,text,integer,jsonb,uuid,text)'
  );
  mapping_drift integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.iam_capability capability
    WHERE capability.capability_key = 'payroll.art_report.generate'
      AND capability.scope_kind = 'tenant'
      AND capability.sensitivity = 'restricted'
  ) THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_034_PREREQUISITE_033_MISSING'
      USING ERRCODE = 'P0001';
  END IF;

  WITH expected(role_key, capability_key) AS (
    VALUES
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.art_report.generate'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.art_report.generate')
  ), actual AS (
    SELECT mapping.role_key, mapping.capability_key
    FROM public.iam_role_capability mapping
    WHERE mapping.capability_key = 'payroll.art_report.generate'
  ), drift AS (
    (SELECT role_key, capability_key FROM expected
      EXCEPT SELECT role_key, capability_key FROM actual)
    UNION ALL
    (SELECT role_key, capability_key FROM actual
      EXCEPT SELECT role_key, capability_key FROM expected)
  )
  SELECT count(*) INTO mapping_drift FROM drift;

  IF mapping_drift <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_034_PREREQUISITE_033_DRIFT: %',
      mapping_drift USING ERRCODE = 'P0001';
  END IF;

  IF locked_signature IS NULL AND new_signature IS NOT NULL THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_034_UNLEDGERED_NEW_SIGNATURE'
      USING ERRCODE = 'P0001';
  END IF;
  IF old_signature IS NOT NULL AND locked_signature IS NOT NULL THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_034_AMBIGUOUS_LEGACY_STATE'
      USING ERRCODE = 'P0001';
  END IF;
  IF old_signature IS NULL AND locked_signature IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_034_OLD_SIGNATURE_REQUIRED'
      USING ERRCODE = 'P0001';
  END IF;

  IF old_signature IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.payroll_control_import_prepare_v1('
      || 'jsonb,text,date,text,text,text,integer,jsonb,uuid,text) FROM PUBLIC';
    EXECUTE 'REVOKE ALL PRIVILEGES ON FUNCTION '
      || 'public.payroll_control_import_prepare_v1('
      || 'jsonb,text,date,text,text,text,integer,jsonb,uuid,text) '
      || 'FROM municontrol_actions_runtime_app';
    EXECUTE 'ALTER FUNCTION public.payroll_control_import_prepare_v1('
      || 'jsonb,text,date,text,text,text,integer,jsonb,uuid,text) '
      || 'RENAME TO payroll_control_import_prepare_locked_v1';
  END IF;
END
$payroll_control_import_binding_upgrade$;

COMMENT ON FUNCTION public.payroll_control_import_prepare_locked_v1(
  jsonb,text,date,text,text,text,integer,jsonb,uuid,text
) IS
  'Implementacion interna 025 sin acceso runtime; solo la fachada 034 puede invocarla luego de fijar el binding bajo lock.';

CREATE OR REPLACE FUNCTION public.payroll_control_import_prepare_v1(
  p_context jsonb,
  p_expected_binding_id uuid,
  p_source_kind text,
  p_period_month date,
  p_jurisdiction text,
  p_definition_key text,
  p_content_hmac_sha256 text,
  p_byte_length integer,
  p_rows jsonb,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
BEGIN
  IF p_expected_binding_id IS NULL
     OR p_source_kind NOT IN ('grh_observed','operator_control')
     OR p_period_month IS NULL OR EXTRACT(day FROM p_period_month) <> 1
     OR p_period_month NOT BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'
     OR p_jurisdiction NOT IN ('42','55')
     OR p_definition_key <> 'payroll-post-close-701-703.v1'
     OR lower(COALESCE(p_content_hmac_sha256,'')) !~ '^[a-f0-9]{64}$'
     OR p_byte_length NOT BETWEEN 1 AND 16384
     OR public.payroll_control_import_rows_valid_v1(p_rows) IS DISTINCT FROM true
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  -- assert_context_v1 toma FOR SHARE NOWAIT sobre membresia, sesion, tenant,
  -- politica, binding GRH, autoridad y vinculo laboral. PostgreSQL conserva
  -- esos locks hasta finalizar la transaccion; por eso la comparacion y la
  -- escritura delegada no pueden cruzar una recertificacion concurrente.
  context_value := public.payroll_control_import_assert_context_v1(
    p_context, 'payroll.control_import.prepare'
  );
  IF p_expected_binding_id <> (context_value->>'certifiedBindingId')::uuid THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_BINDING_CHANGED' USING ERRCODE = 'P0001';
  END IF;

  RETURN public.payroll_control_import_prepare_locked_v1(
    p_context,
    p_source_kind,
    p_period_month,
    p_jurisdiction,
    p_definition_key,
    p_content_hmac_sha256,
    p_byte_length,
    p_rows,
    p_idempotency,
    p_command_hash
  );
END
$$;

COMMENT ON FUNCTION public.payroll_control_import_prepare_v1(
  jsonb,uuid,text,date,text,text,text,integer,jsonb,uuid,text
) IS
  'Fachada 034: fija el binding usado por el HMAC bajo los locks de contexto y delega al contrato inmutable 025.';

REVOKE ALL ON FUNCTION public.payroll_control_import_prepare_locked_v1(
  jsonb,text,date,text,text,text,integer,jsonb,uuid,text
) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_prepare_locked_v1(
  jsonb,text,date,text,text,text,integer,jsonb,uuid,text
) FROM municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_control_import_prepare_v1(
  jsonb,uuid,text,date,text,text,text,integer,jsonb,uuid,text
) FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION public.payroll_control_import_prepare_v1(
  jsonb,uuid,text,date,text,text,text,integer,jsonb,uuid,text
) FROM municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_control_import_prepare_v1(
  jsonb,uuid,text,date,text,text,text,integer,jsonb,uuid,text
) TO municontrol_actions_runtime_app;

DO $payroll_control_import_binding_final_contract$
BEGIN
  IF to_regprocedure(
    'public.payroll_control_import_prepare_v1(jsonb,text,date,text,text,text,integer,jsonb,uuid,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_034_OLD_FACADE_REMAINS'
      USING ERRCODE = 'P0001';
  END IF;
  IF to_regprocedure(
    'public.payroll_control_import_prepare_locked_v1(jsonb,text,date,text,text,text,integer,jsonb,uuid,text)'
  ) IS NULL OR to_regprocedure(
    'public.payroll_control_import_prepare_v1(jsonb,uuid,text,date,text,text,text,integer,jsonb,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_CONTROL_IMPORT_034_FINAL_SIGNATURE_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;
END
$payroll_control_import_binding_final_contract$;
