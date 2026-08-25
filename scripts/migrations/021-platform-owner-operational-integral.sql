-- MuniControl Friendly - Sprint 021
-- Perfil tenant para el owner operativo: union exacta de la lectura institucional
-- 019 y la preparacion operativa 013. Conserva maker-checker: no decide, aprueba,
-- cancela aprobaciones, publica nomina ni recibe capacidades platform.*.

DO $platform_owner_operational_catalog$
DECLARE
  invalid_capabilities text[];
BEGIN
  WITH expected(capability_key) AS (
    VALUES
      ('workforce.summary.read'),
      ('workforce.structure.read'),
      ('workforce.employee.read'),
      ('payroll.read'),
      ('absence.analytics.read'),
      ('absence.nominal.read'),
      ('leave.policy.read'),
      ('leave.preview.read'),
      ('management.analytics.read'),
      ('quality.read'),
      ('lineage.read'),
      ('budget.approved.read'),
      ('assistant.use'),
      ('actions.read'),
      ('leave.request.aggregate.read'),
      ('leave.request.all.read'),
      ('leave.request.audit.read'),
      ('leave.request.restricted.read'),
      ('leave.request.payroll.read'),
      ('time.overtime.read'),
      ('time.source.read'),
      ('time.source.audit.read'),
      ('time.catalog.read'),
      ('time.catalog.audit.read'),
      ('employee.record.propose'),
      ('absence.enter'),
      ('leave.enter'),
      ('leave.request.area.create'),
      ('leave.request.area.read'),
      ('leave.request.area.update'),
      ('leave.request.area.submit'),
      ('leave.request.area.cancel_pending'),
      ('time.source.propose'),
      ('time.catalog.propose')
  )
  SELECT array_agg(expected.capability_key ORDER BY expected.capability_key)
    INTO invalid_capabilities
  FROM expected
  LEFT JOIN public.iam_capability capability
    ON capability.capability_key = expected.capability_key
  WHERE capability.capability_key IS NULL OR capability.scope_kind <> 'tenant';

  IF invalid_capabilities IS NOT NULL THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_OPERATIONAL_CAPABILITY_CATALOG_DRIFT: %',
      array_to_string(invalid_capabilities, ',')
      USING ERRCODE = 'P0001';
  END IF;
END
$platform_owner_operational_catalog$;

INSERT INTO public.iam_role (
  role_key, label, description, scope_kind, system_managed
) VALUES (
  'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
  'Owner operativo integral',
  'Lectura institucional y preparacion operativa tenant; no decide, publica ni reemplaza la autoridad global.',
  'tenant',
  true
)
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  system_managed = EXCLUDED.system_managed;

DELETE FROM public.iam_role_capability role_capability
WHERE role_capability.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  AND role_capability.capability_key NOT IN (
    'workforce.summary.read',
    'workforce.structure.read',
    'workforce.employee.read',
    'payroll.read',
    'absence.analytics.read',
    'absence.nominal.read',
    'leave.policy.read',
    'leave.preview.read',
    'management.analytics.read',
    'quality.read',
    'lineage.read',
    'budget.approved.read',
    'assistant.use',
    'actions.read',
    'leave.request.aggregate.read',
    'leave.request.all.read',
    'leave.request.audit.read',
    'leave.request.restricted.read',
    'leave.request.payroll.read',
    'time.overtime.read',
    'time.source.read',
    'time.source.audit.read',
    'time.catalog.read',
    'time.catalog.audit.read',
    'employee.record.propose',
    'absence.enter',
    'leave.enter',
    'leave.request.area.create',
    'leave.request.area.read',
    'leave.request.area.update',
    'leave.request.area.submit',
    'leave.request.area.cancel_pending',
    'time.source.propose',
    'time.catalog.propose'
  );

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'workforce.summary.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'workforce.structure.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'workforce.employee.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'absence.analytics.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'absence.nominal.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.policy.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.preview.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'management.analytics.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'quality.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'lineage.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'budget.approved.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'assistant.use'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'actions.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.aggregate.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.all.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.audit.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.restricted.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.payroll.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.overtime.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.source.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.source.audit.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.catalog.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.catalog.audit.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'employee.record.propose'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'absence.enter'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.enter'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.area.create'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.area.read'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.area.update'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.area.submit'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'leave.request.area.cancel_pending'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.source.propose'),
  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.catalog.propose')
ON CONFLICT (role_key, capability_key) DO NOTHING;

DO $platform_owner_operational_invariants$
DECLARE
  role_count integer;
  union_count integer;
  union_drift_count integer;
  forbidden_count integer;
  sod_count integer;
BEGIN
  SELECT count(*) INTO role_count
  FROM public.iam_role_capability
  WHERE role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL';

  WITH source_union AS (
    SELECT capability_key
    FROM public.iam_role_capability
    WHERE role_key IN ('CONSULTA_INTEGRAL', 'TENANT_RRHH_ADMIN_OPERATIVO')
    GROUP BY capability_key
  )
  SELECT count(*) INTO union_count FROM source_union;

  WITH source_union AS (
    SELECT capability_key
    FROM public.iam_role_capability
    WHERE role_key IN ('CONSULTA_INTEGRAL', 'TENANT_RRHH_ADMIN_OPERATIVO')
    GROUP BY capability_key
  ), target AS (
    SELECT capability_key
    FROM public.iam_role_capability
    WHERE role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
  ), drift AS (
    (SELECT capability_key FROM source_union EXCEPT SELECT capability_key FROM target)
    UNION ALL
    (SELECT capability_key FROM target EXCEPT SELECT capability_key FROM source_union)
  )
  SELECT count(*) INTO union_drift_count FROM drift;

  SELECT count(*) INTO forbidden_count
  FROM public.iam_role_capability
  WHERE role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
    AND (
      capability_key LIKE 'platform.%'
      OR capability_key IN (
        'absence.validate',
        'employee.record.approve',
        'leave.approve',
        'leave.request.all.manage',
        'leave.request.area.decide',
        'leave.request.area.cancel_approved',
        'leave.request.restricted.decide',
        'time.overtime.approve',
        'time.overtime.post',
        'time.source.approve',
        'time.catalog.approve'
      )
    );

  SELECT count(*) INTO sod_count
  FROM public.iam_capability_conflict conflict
  JOIN public.iam_role_capability left_grant
    ON left_grant.role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
   AND left_grant.capability_key = conflict.capability_key
  JOIN public.iam_role_capability right_grant
    ON right_grant.role_key = left_grant.role_key
   AND right_grant.capability_key = conflict.conflicts_with_key;

  IF NOT EXISTS (
    SELECT 1 FROM public.iam_role
    WHERE role_key = 'PLATFORM_OWNER_OPERATIVO_INTEGRAL'
      AND scope_kind = 'tenant' AND system_managed IS TRUE
  ) THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_OPERATIONAL_ROLE_DRIFT' USING ERRCODE = 'P0001';
  END IF;
  IF role_count <> 34 OR union_count <> 34 OR union_drift_count <> 0 THEN
    RAISE EXCEPTION
      'PLATFORM_OWNER_OPERATIONAL_UNION_DRIFT: role %, union %, diff %',
      role_count, union_count, union_drift_count
      USING ERRCODE = 'P0001';
  END IF;
  IF forbidden_count <> 0 THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_OPERATIONAL_FORBIDDEN_CAPABILITY'
      USING ERRCODE = 'P0001';
  END IF;
  IF sod_count <> 0 THEN
    RAISE EXCEPTION 'PLATFORM_OWNER_OPERATIONAL_SOD_CONFLICT'
      USING ERRCODE = 'P0001';
  END IF;
END
$platform_owner_operational_invariants$;
