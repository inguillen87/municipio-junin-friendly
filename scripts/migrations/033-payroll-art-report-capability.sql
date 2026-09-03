-- MuniControl Friendly - Sprint 033
-- Autoridad explicita para generar el reporte ART nominal de Junin.
-- La capacidad queda separada de payroll.read y no concede escritura sobre
-- liquidaciones, legajos, novedades ni fuentes GRH.

DO $payroll_art_report_prerequisites$
DECLARE
  invalid_roles text[];
  junin_tenant_count integer;
BEGIN
  WITH expected(role_key) AS (
    VALUES
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
    RAISE EXCEPTION 'PAYROLL_ART_REPORT_ROLE_PREREQUISITE_DRIFT: %',
      array_to_string(invalid_roles, ',') USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO junin_tenant_count
  FROM public.platform_tenant tenant
  WHERE lower(tenant.slug) = 'junin-mendoza'
    AND tenant.status IN ('onboarding','active');

  IF junin_tenant_count <> 1 THEN
    RAISE EXCEPTION 'PAYROLL_ART_REPORT_JUNIN_TENANT_REQUIRED: %',
      junin_tenant_count USING ERRCODE = 'P0001';
  END IF;
END
$payroll_art_report_prerequisites$;

INSERT INTO public.iam_capability (
  capability_key, label, description, scope_kind, sensitivity
) VALUES (
  'payroll.art_report.generate',
  'Generar reporte ART',
  'Genera el reporte nominal ART del tenant Junin desde datos salariales autorizados, sin modificar la liquidacion ni la fuente GRH.',
  'tenant',
  'restricted'
)
ON CONFLICT (capability_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  sensitivity = EXCLUDED.sensitivity;

-- Las excepciones por membresia no pueden ampliar esta capacidad restringida.
DELETE FROM public.tenant_membership_capability_override override_row
WHERE override_row.capability_key = 'payroll.art_report.generate';

DELETE FROM public.iam_role_capability mapping
WHERE mapping.capability_key = 'payroll.art_report.generate'
  AND mapping.role_key NOT IN (
    'HUGO_APROBADOR_INTEGRAL',
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  );

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.art_report.generate'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.art_report.generate')
ON CONFLICT (role_key, capability_key) DO NOTHING;

DO $payroll_art_report_final_contract$
DECLARE
  mapping_drift integer;
  override_count integer;
  conflicting_memberships integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.iam_capability capability
    WHERE capability.capability_key = 'payroll.art_report.generate'
      AND capability.scope_kind = 'tenant'
      AND capability.sensitivity = 'restricted'
  ) THEN
    RAISE EXCEPTION 'PAYROLL_ART_REPORT_CAPABILITY_DRIFT' USING ERRCODE = 'P0001';
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
    RAISE EXCEPTION 'PAYROLL_ART_REPORT_ROLE_ALLOWLIST_DRIFT: %', mapping_drift
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO override_count
  FROM public.tenant_membership_capability_override override_row
  WHERE override_row.capability_key = 'payroll.art_report.generate';

  IF override_count <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_ART_REPORT_OVERRIDE_FORBIDDEN: %', override_count
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO conflicting_memberships
  FROM public.tenant_membership membership
  JOIN public.platform_tenant tenant ON tenant.id = membership.tenant_id
  JOIN public.tenant_iam_effective_capabilities(membership.id) effective
    ON effective.capability_key = 'payroll.art_report.generate'
  WHERE lower(tenant.slug) = 'junin-mendoza'
    AND membership.role_key NOT IN (
      'HUGO_APROBADOR_INTEGRAL',
      'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
    );

  IF conflicting_memberships <> 0 THEN
    RAISE EXCEPTION 'PAYROLL_ART_REPORT_EFFECTIVE_AUTHORITY_DRIFT: %',
      conflicting_memberships USING ERRCODE = 'P0001';
  END IF;
END
$payroll_art_report_final_contract$;
