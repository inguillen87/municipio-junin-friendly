SET lock_timeout = '5s';
SET statement_timeout = '45s';

DO $preflight$
DECLARE
  prepare_definition text;
BEGIN
  IF to_regclass('public.payroll_novelty_issue') IS NULL
     OR to_regprocedure(
       'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_TYPE_MAPPING_PREREQUISITE_MISSING'
      USING ERRCODE = 'P0001';
  END IF;

  IF to_regprocedure('public.payroll_type_canonical_v1(text,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'PAYROLL_TYPE_MAPPING_UNLEDGERED_HELPER'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pg_get_functiondef(
    'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)'::regprocedure
  ) INTO STRICT prepare_definition;
  IF position('first_fortnight' IN prepare_definition) = 0 THEN
    RAISE EXCEPTION 'PAYROLL_TYPE_MAPPING_029_PREREQUISITE_MISSING'
      USING ERRCODE = 'P0001';
  END IF;
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
    WHEN upper(btrim(COALESCE(p_source_system, ''))) = 'GRH'
      AND upper(btrim(COALESCE(p_source_code, ''))) = 'M' THEN 'monthly'
    ELSE NULL
  END
$function$;

COMMENT ON FUNCTION public.payroll_type_canonical_v1(text,text) IS
  'Normaliza tipos ya canonicos y la unica equivalencia GRH homologada: M - Mensuales => monthly. P/S/V/O/F permanecen NULL hasta contar con evidencia versionada.';

REVOKE ALL ON FUNCTION public.payroll_type_canonical_v1(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payroll_type_canonical_v1(text,text)
  FROM municontrol_actions_runtime_app;

ALTER TABLE public.payroll_novelty_issue
  DROP CONSTRAINT payroll_novelty_issue_code_ck;

ALTER TABLE public.payroll_novelty_issue
  ADD CONSTRAINT payroll_novelty_issue_code_ck CHECK (
    issue_code IN (
      'duplicate_business_key','concept_not_observed','cost_center_not_observed',
      'movement_type_not_observed','already_observed','existing_movement_conflict',
      'legacy_payroll_type_unclassified'
    )
  );

ALTER TABLE public.payroll_novelty_issue
  DROP CONSTRAINT payroll_novelty_issue_field_ck;

ALTER TABLE public.payroll_novelty_issue
  ADD CONSTRAINT payroll_novelty_issue_field_ck CHECK (
    field_name IS NULL OR field_name IN (
      'legajo','conceptSourceId','costCenterSourceId','movementType','payrollType',
      'quantityDecimal','amountCents'
    )
  );

DO $upgrade$
DECLARE
  function_signature constant regprocedure :=
    'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)'::regprocedure;
  function_definition text;
  patched_definition text;
  equal_old constant text :=
    'AND lower(COALESCE(equal_movement.payroll_type, '''')) = p_payroll_type';
  equal_new constant text :=
    'AND public.payroll_type_canonical_v1(equal_movement.source_system, equal_movement.payroll_type) = p_payroll_type';
  conflict_old constant text :=
    'AND lower(COALESCE(movement.payroll_type, '''')) = p_payroll_type';
  conflict_new constant text :=
    'AND public.payroll_type_canonical_v1(movement.source_system, movement.payroll_type) = p_payroll_type';
  event_anchor constant text := E'  INSERT INTO public.payroll_novelty_event (\n';
  unresolved_guard constant text := $guard$
  -- Un movimiento con el mismo grano de negocio y TIPO_31 no homologado no
  -- puede descartarse como duplicado ni asumirse como otro tipo. Se bloquea
  -- hasta que el catalogo versionado pruebe la equivalencia.
  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'legacy_payroll_type_unclassified',
    'error', true, 'payrollType', jsonb_build_object(
      'basis', 'published_grh_same_period',
      'reason', 'versioned_payroll_type_mapping_required'
    )
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND EXISTS (
      SELECT 1 FROM public.employment_movement unresolved_movement
      JOIN public.source_import_batch unresolved_batch
        ON unresolved_batch.id = unresolved_movement.source_batch_id
       AND unresolved_batch.source_system = 'GRH'
       AND unresolved_batch.source_database = context_value->>'sourceDatabase'
       AND unresolved_batch.validation_state = 'published'
      WHERE unresolved_movement.employment_contract_id = row_value.employment_contract_id
        AND unresolved_movement.source_system = 'GRH'
        AND unresolved_movement.movement_period = p_period_month
        AND unresolved_movement.concept_source_id = row_value.concept_source_id
        AND COALESCE(unresolved_movement.cost_center_source_id, '') =
          COALESCE(row_value.cost_center_source_id, '')
        AND public.payroll_type_canonical_v1(
          unresolved_movement.source_system, unresolved_movement.payroll_type
        ) IS NULL
    );

$guard$;
  equal_count integer;
  conflict_count integer;
  anchor_count integer;
BEGIN
  SELECT pg_get_functiondef(function_signature) INTO STRICT function_definition;

  equal_count := (
    length(function_definition) - length(replace(function_definition, equal_old, ''))
  ) / length(equal_old);
  conflict_count := (
    length(function_definition) - length(replace(function_definition, conflict_old, ''))
  ) / length(conflict_old);
  anchor_count := (
    length(function_definition) - length(replace(function_definition, event_anchor, ''))
  ) / length(event_anchor);

  IF equal_count <> 1 OR conflict_count <> 1 OR anchor_count <> 1
     OR position('legacy_payroll_type_unclassified' IN function_definition) > 0
     OR position('payroll_type_canonical_v1' IN function_definition) > 0 THEN
    RAISE EXCEPTION 'PAYROLL_TYPE_MAPPING_FUNCTION_DRIFT: %', function_signature::text
      USING ERRCODE = 'P0001';
  END IF;

  patched_definition := replace(function_definition, equal_old, equal_new);
  patched_definition := replace(patched_definition, conflict_old, conflict_new);
  patched_definition := replace(
    patched_definition, event_anchor, unresolved_guard || event_anchor
  );

  IF patched_definition = function_definition
     OR position('legacy_payroll_type_unclassified' IN patched_definition) = 0
     OR position('payroll_type_canonical_v1' IN patched_definition) = 0 THEN
    RAISE EXCEPTION 'PAYROLL_TYPE_MAPPING_PATCH_FAILED: %', function_signature::text
      USING ERRCODE = 'P0001';
  END IF;

  EXECUTE patched_definition;
END
$upgrade$;

COMMENT ON CONSTRAINT payroll_novelty_issue_code_ck
  ON public.payroll_novelty_issue IS
  'Incluye el bloqueo fail-closed cuando un TIPO_31 legacy aun no tiene equivalencia homologada.';

COMMENT ON CONSTRAINT payroll_novelty_issue_field_ck
  ON public.payroll_novelty_issue IS
  'payrollType identifica problemas de clasificacion del tipo sin confundirlos con concepto o movimiento.';
