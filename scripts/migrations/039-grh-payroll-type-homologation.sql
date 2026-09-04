-- MuniControl Friendly - Sprint 039
-- Homologación versionada de TIPO_31 observada en GRH y GRH_WEB.
-- Mantiene el cierre fail-closed para cualquier código futuro no catalogado.

SET lock_timeout = '5s';
SET statement_timeout = '45s';

DO $preflight$
DECLARE
  source_code text;
BEGIN
  IF to_regprocedure('public.payroll_type_canonical_v1(text,text)') IS NULL
     OR to_regprocedure(
       'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'GRH_PAYROLL_TYPE_HOMOLOGATION_032_PREREQUISITE_MISSING'
      USING ERRCODE = 'P0001';
  END IF;

  IF public.payroll_type_canonical_v1('GRH', 'M') IS DISTINCT FROM 'monthly'
     OR public.payroll_type_canonical_v1('OTHER', 'M') IS NOT NULL THEN
    RAISE EXCEPTION 'GRH_PAYROLL_TYPE_HOMOLOGATION_032_MAPPING_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;

  FOREACH source_code IN ARRAY ARRAY['F','O','P','S','V'] LOOP
    IF public.payroll_type_canonical_v1('GRH', source_code) IS NOT NULL THEN
      RAISE EXCEPTION 'GRH_PAYROLL_TYPE_HOMOLOGATION_UNLEDGERED_MAPPING: %',
        source_code USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.payroll_type_canonical_v1(
  p_source_system text,
  p_source_code text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $function$
  SELECT CASE
    WHEN lower(btrim(COALESCE(p_source_code, ''))) IN (
      'monthly','first_fortnight','sac','vacation','supplementary','final','other'
    ) THEN lower(btrim(p_source_code))
    WHEN upper(btrim(COALESCE(p_source_system, ''))) = 'GRH' THEN
      CASE upper(btrim(COALESCE(p_source_code, '')))
        WHEN 'F' THEN 'final'
        WHEN 'M' THEN 'monthly'
        WHEN 'O' THEN 'other'
        WHEN 'P' THEN 'first_fortnight'
        WHEN 'S' THEN 'sac'
        WHEN 'V' THEN 'vacation'
        ELSE NULL
      END
    ELSE NULL
  END
$function$;

COMMENT ON FUNCTION public.payroll_type_canonical_v1(text,text) IS
  'Normaliza tipos canónicos y TIPO_31 homologados por evidencia GRH/GRH_WEB v2: F final, M mensual/segunda quincena, O otros, P primera quincena, S SAC y V vacaciones; todo código desconocido permanece NULL.';

REVOKE ALL ON FUNCTION public.payroll_type_canonical_v1(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_type_canonical_v1(text,text)
  FROM municontrol_actions_runtime_app;

DO $final_contract$
DECLARE
  mapping_drift integer;
  helper_oid oid :=
    'public.payroll_type_canonical_v1(text,text)'::regprocedure::oid;
  prepare_oid oid :=
    'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)'::regprocedure::oid;
  helper_owner name;
  helper_security_definer boolean;
  prepare_security_definer boolean;
BEGIN
  WITH expected(ordinal, source_system, source_code, canonical_type) AS (
    VALUES
      (1, 'GRH', 'F', 'final'),
      (2, 'GRH', 'M', 'monthly'),
      (3, 'GRH', 'O', 'other'),
      (4, 'GRH', 'P', 'first_fortnight'),
      (5, 'GRH', 'S', 'sac'),
      (6, 'GRH', 'V', 'vacation'),
      (7, 'GRH', 'X', NULL::text),
      (8, 'OTHER', 'M', NULL::text),
      (9, 'GRH', NULL::text, NULL::text),
      (10, 'GRH', 'monthly', 'monthly'),
      (11, 'GRH', 'first_fortnight', 'first_fortnight'),
      (12, 'GRH', 'sac', 'sac'),
      (13, 'GRH', 'vacation', 'vacation'),
      (14, 'GRH', 'supplementary', 'supplementary'),
      (15, 'GRH', 'final', 'final'),
      (16, 'GRH', 'other', 'other')
  ), actual AS (
    SELECT expected.ordinal, expected.source_system, expected.source_code,
      public.payroll_type_canonical_v1(
        expected.source_system, expected.source_code
      ) AS canonical_type
    FROM expected
  ), drift AS (
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  )
  SELECT count(*) INTO mapping_drift FROM drift;

  IF mapping_drift <> 0 THEN
    RAISE EXCEPTION 'GRH_PAYROLL_TYPE_HOMOLOGATION_MATRIX_DRIFT: %',
      mapping_drift USING ERRCODE = 'P0001';
  END IF;

  SELECT owner_role.rolname, helper.prosecdef, prepare.prosecdef
    INTO STRICT helper_owner, helper_security_definer, prepare_security_definer
  FROM pg_proc helper
  JOIN pg_roles owner_role ON owner_role.oid = helper.proowner
  CROSS JOIN pg_proc prepare
  WHERE helper.oid = helper_oid
    AND prepare.oid = prepare_oid;

  IF helper_owner = 'municontrol_actions_runtime_app'
     OR helper_security_definer IS TRUE
     OR prepare_security_definer IS NOT TRUE
     OR EXISTS (
       SELECT 1
       FROM aclexplode(COALESCE(
         (SELECT proacl FROM pg_proc WHERE oid = helper_oid),
         acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = helper_oid))
       )) acl
       WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
     )
     OR has_function_privilege(
       'municontrol_actions_runtime_app', helper_oid, 'EXECUTE'
     )
     OR EXISTS (
       SELECT 1
       FROM aclexplode(COALESCE(
         (SELECT proacl FROM pg_proc WHERE oid = prepare_oid),
         acldefault('f', (SELECT proowner FROM pg_proc WHERE oid = prepare_oid))
       )) acl
       WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
     )
     OR NOT has_function_privilege(
       'municontrol_actions_runtime_app', prepare_oid, 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'GRH_PAYROLL_TYPE_HOMOLOGATION_ACL_DRIFT'
      USING ERRCODE = 'P0001';
  END IF;
END
$final_contract$;
