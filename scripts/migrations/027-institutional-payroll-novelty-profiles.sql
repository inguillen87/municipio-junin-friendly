-- MuniControl Friendly - Sprint 027
-- Perfiles institucionales exactos para el circuito 026.
-- Separa preparacion y aprobacion, y conserva la consulta agregada sin PII.

DO $payroll_novelty_profile_catalog$
DECLARE
  missing_capabilities text[];
  invalid_roles text[];
BEGIN
  WITH expected(capability_key) AS (
    VALUES
      ('payroll.novelty.read'),
      ('payroll.novelty.nominal.read'),
      ('payroll.novelty.prepare'),
      ('payroll.novelty.approve'),
      ('payroll.novelty.export'),
      ('payroll.novelty.audit.read')
  )
  SELECT array_agg(expected.capability_key ORDER BY expected.capability_key)
    INTO missing_capabilities
  FROM expected
  LEFT JOIN public.iam_capability capability
    ON capability.capability_key = expected.capability_key
   AND capability.scope_kind = 'tenant'
  WHERE capability.capability_key IS NULL;

  IF missing_capabilities IS NOT NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_PROFILE_CAPABILITY_CATALOG_DRIFT: %',
      array_to_string(missing_capabilities, ',') USING ERRCODE = 'P0001';
  END IF;

  WITH expected(role_key) AS (
    VALUES
      ('CONSULTA_INTEGRAL'),
      ('HUGO_APROBADOR_INTEGRAL'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL')
  )
  SELECT array_agg(expected.role_key ORDER BY expected.role_key)
    INTO invalid_roles
  FROM expected
  LEFT JOIN public.iam_role role ON role.role_key = expected.role_key
  WHERE role.role_key IS NULL
     OR role.scope_kind <> 'tenant'
     OR role.system_managed IS NOT TRUE;

  IF invalid_roles IS NOT NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_PROFILE_ROLE_DRIFT: %',
      array_to_string(invalid_roles, ',') USING ERRCODE = 'P0001';
  END IF;
END
$payroll_novelty_profile_catalog$;

DELETE FROM public.iam_role_capability mapping
WHERE mapping.role_key IN (
    'CONSULTA_INTEGRAL',
    'HUGO_APROBADOR_INTEGRAL',
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  )
  AND mapping.capability_key LIKE 'payroll.novelty.%';

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('CONSULTA_INTEGRAL', 'payroll.novelty.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.novelty.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.novelty.nominal.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.novelty.approve'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.novelty.audit.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.nominal.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.prepare'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.export'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.audit.read')
ON CONFLICT (role_key, capability_key) DO NOTHING;

DO $payroll_novelty_profile_verify$
DECLARE
  drift_count integer;
  conflict_count integer;
BEGIN
  WITH expected(role_key, capability_key) AS (
    VALUES
      ('CONSULTA_INTEGRAL', 'payroll.novelty.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.novelty.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.novelty.nominal.read'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.novelty.approve'),
      ('HUGO_APROBADOR_INTEGRAL', 'payroll.novelty.audit.read'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.read'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.nominal.read'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.prepare'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.export'),
      ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.novelty.audit.read')
  ), actual AS (
    SELECT mapping.role_key, mapping.capability_key
    FROM public.iam_role_capability mapping
    WHERE mapping.role_key IN (
        'CONSULTA_INTEGRAL',
        'HUGO_APROBADOR_INTEGRAL',
        'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
      )
      AND mapping.capability_key LIKE 'payroll.novelty.%'
  ), drift AS (
    (SELECT role_key, capability_key FROM expected
      EXCEPT SELECT role_key, capability_key FROM actual)
    UNION ALL
    (SELECT role_key, capability_key FROM actual
      EXCEPT SELECT role_key, capability_key FROM expected)
  )
  SELECT count(*) INTO drift_count FROM drift;

  IF drift_count <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_PROFILE_ALLOWLIST_DRIFT: %', drift_count
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO conflict_count
  FROM public.iam_capability_conflict conflict
  JOIN public.iam_role_capability left_grant
    ON left_grant.capability_key = conflict.capability_key
  JOIN public.iam_role_capability right_grant
    ON right_grant.role_key = left_grant.role_key
   AND right_grant.capability_key = conflict.conflicts_with_key
  WHERE left_grant.role_key IN (
    'CONSULTA_INTEGRAL',
    'HUGO_APROBADOR_INTEGRAL',
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  );

  IF conflict_count <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_PROFILE_SOD_CONFLICT: %', conflict_count
      USING ERRCODE = 'P0001';
  END IF;
END
$payroll_novelty_profile_verify$;
