-- MuniControl Friendly - Sprint 019
-- Perfiles institucionales demostrables con autoridad acotada:
-- * CONSULTA_INTEGRAL: lectura transversal exacta, sin mutaciones;
-- * HUGO_APROBADOR_INTEGRAL: la misma lectura + decisiones humanas exactas.
-- No incorpora preparacion, posting, administracion de plataforma ni autoridad total.

DO $institutional_access_profiles_catalog$
DECLARE
  missing_capabilities text[];
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
      ('absence.validate'),
      ('employee.record.approve'),
      ('leave.approve'),
      ('leave.request.area.read'),
      ('leave.request.area.decide'),
      ('leave.request.area.cancel_approved'),
      ('leave.request.restricted.decide'),
      ('time.overtime.approve'),
      ('time.source.approve'),
      ('time.catalog.approve')
  )
  SELECT array_agg(expected.capability_key ORDER BY expected.capability_key)
    INTO missing_capabilities
  FROM expected
  LEFT JOIN public.iam_capability capability
    ON capability.capability_key = expected.capability_key
  WHERE capability.capability_key IS NULL;

  IF missing_capabilities IS NOT NULL THEN
    RAISE EXCEPTION 'INSTITUTIONAL_PROFILE_CAPABILITY_CATALOG_DRIFT: %',
      array_to_string(missing_capabilities, ',')
      USING ERRCODE = 'P0001';
  END IF;
END
$institutional_access_profiles_catalog$;

INSERT INTO public.iam_role (
  role_key, label, description, scope_kind, system_managed
) VALUES
  (
    'CONSULTA_INTEGRAL',
    'Consulta institucional integral',
    'Consulta transversal de datos y auditoria; no prepara, decide ni impacta operaciones.',
    'tenant',
    true
  ),
  (
    'HUGO_APROBADOR_INTEGRAL',
    'Aprobador institucional integral',
    'Consulta transversal y decide novedades separadas del actor que las preparo; no publica ni administra plataforma.',
    'tenant',
    true
  )
ON CONFLICT (role_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  scope_kind = EXCLUDED.scope_kind,
  system_managed = EXCLUDED.system_managed;

DELETE FROM public.iam_role_capability role_capability
WHERE role_capability.role_key = 'CONSULTA_INTEGRAL'
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
    'time.catalog.audit.read'
  );

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('CONSULTA_INTEGRAL', 'workforce.summary.read'),
  ('CONSULTA_INTEGRAL', 'workforce.structure.read'),
  ('CONSULTA_INTEGRAL', 'workforce.employee.read'),
  ('CONSULTA_INTEGRAL', 'payroll.read'),
  ('CONSULTA_INTEGRAL', 'absence.analytics.read'),
  ('CONSULTA_INTEGRAL', 'absence.nominal.read'),
  ('CONSULTA_INTEGRAL', 'leave.policy.read'),
  ('CONSULTA_INTEGRAL', 'leave.preview.read'),
  ('CONSULTA_INTEGRAL', 'management.analytics.read'),
  ('CONSULTA_INTEGRAL', 'quality.read'),
  ('CONSULTA_INTEGRAL', 'lineage.read'),
  ('CONSULTA_INTEGRAL', 'budget.approved.read'),
  ('CONSULTA_INTEGRAL', 'assistant.use'),
  ('CONSULTA_INTEGRAL', 'actions.read'),
  ('CONSULTA_INTEGRAL', 'leave.request.aggregate.read'),
  ('CONSULTA_INTEGRAL', 'leave.request.all.read'),
  ('CONSULTA_INTEGRAL', 'leave.request.audit.read'),
  ('CONSULTA_INTEGRAL', 'leave.request.restricted.read'),
  ('CONSULTA_INTEGRAL', 'leave.request.payroll.read'),
  ('CONSULTA_INTEGRAL', 'time.overtime.read'),
  ('CONSULTA_INTEGRAL', 'time.source.read'),
  ('CONSULTA_INTEGRAL', 'time.source.audit.read'),
  ('CONSULTA_INTEGRAL', 'time.catalog.read'),
  ('CONSULTA_INTEGRAL', 'time.catalog.audit.read')
ON CONFLICT (role_key, capability_key) DO NOTHING;

DELETE FROM public.iam_role_capability role_capability
WHERE role_capability.role_key = 'HUGO_APROBADOR_INTEGRAL'
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
    'absence.validate',
    'employee.record.approve',
    'leave.approve',
    'leave.request.area.read',
    'leave.request.area.decide',
    'leave.request.area.cancel_approved',
    'leave.request.restricted.decide',
    'time.overtime.approve',
    'time.source.approve',
    'time.catalog.approve'
  );

INSERT INTO public.iam_role_capability (role_key, capability_key) VALUES
  ('HUGO_APROBADOR_INTEGRAL', 'workforce.summary.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'workforce.structure.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'workforce.employee.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'payroll.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'absence.analytics.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'absence.nominal.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.policy.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.preview.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'management.analytics.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'quality.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'lineage.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'budget.approved.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'assistant.use'),
  ('HUGO_APROBADOR_INTEGRAL', 'actions.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.aggregate.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.all.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.audit.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.restricted.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.payroll.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'time.overtime.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'time.source.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'time.source.audit.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'time.catalog.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'time.catalog.audit.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'absence.validate'),
  ('HUGO_APROBADOR_INTEGRAL', 'employee.record.approve'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.approve'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.area.read'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.area.decide'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.area.cancel_approved'),
  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.restricted.decide'),
  ('HUGO_APROBADOR_INTEGRAL', 'time.overtime.approve'),
  ('HUGO_APROBADOR_INTEGRAL', 'time.source.approve'),
  ('HUGO_APROBADOR_INTEGRAL', 'time.catalog.approve')
ON CONFLICT (role_key, capability_key) DO NOTHING;

DO $institutional_access_profiles_verify$
DECLARE
  consulta_count integer;
  aprobador_count integer;
  conflict_count integer;
  forbidden_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.iam_role
    WHERE role_key = 'CONSULTA_INTEGRAL'
      AND scope_kind = 'tenant'
      AND system_managed IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public.iam_role
    WHERE role_key = 'HUGO_APROBADOR_INTEGRAL'
      AND scope_kind = 'tenant'
      AND system_managed IS TRUE
  ) THEN
    RAISE EXCEPTION 'INSTITUTIONAL_PROFILE_ROLE_DRIFT' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO consulta_count
  FROM public.iam_role_capability
  WHERE role_key = 'CONSULTA_INTEGRAL';
  SELECT count(*) INTO aprobador_count
  FROM public.iam_role_capability
  WHERE role_key = 'HUGO_APROBADOR_INTEGRAL';
  IF consulta_count <> 24 OR aprobador_count <> 34 THEN
    RAISE EXCEPTION 'INSTITUTIONAL_PROFILE_CARDINALITY_DRIFT: consulta=%, aprobador=%',
      consulta_count, aprobador_count USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO forbidden_count
  FROM public.iam_role_capability role_capability
  JOIN public.iam_capability capability
    ON capability.capability_key = role_capability.capability_key
  WHERE role_capability.role_key IN ('CONSULTA_INTEGRAL', 'HUGO_APROBADOR_INTEGRAL')
    AND (
      capability.scope_kind <> 'tenant'
      OR capability.capability_key = 'leave.request.all.manage'
      OR capability.capability_key IN (
        'absence.enter', 'employee.record.propose', 'leave.enter',
        'time.overtime.enter', 'time.overtime.post',
        'time.source.propose', 'time.catalog.propose'
      )
      OR capability.capability_key ~ '\.(create|update|submit|cancel|cancel_pending|propose|enter|post|manage)$'
    );
  IF forbidden_count <> 0 THEN
    RAISE EXCEPTION 'INSTITUTIONAL_PROFILE_FORBIDDEN_CAPABILITY: %', forbidden_count
      USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO conflict_count
  FROM public.iam_capability_conflict conflict
  JOIN public.iam_role_capability left_grant
    ON left_grant.capability_key = conflict.capability_key
  JOIN public.iam_role_capability right_grant
    ON right_grant.capability_key = conflict.conflicts_with_key
   AND right_grant.role_key = left_grant.role_key
  WHERE left_grant.role_key IN ('CONSULTA_INTEGRAL', 'HUGO_APROBADOR_INTEGRAL');
  IF conflict_count <> 0 THEN
    RAISE EXCEPTION 'INSTITUTIONAL_PROFILE_SOD_CONFLICT: %', conflict_count
      USING ERRCODE = 'P0001';
  END IF;
END
$institutional_access_profiles_verify$;
