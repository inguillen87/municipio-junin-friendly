SET lock_timeout = '5s';
SET statement_timeout = '45s';

DO $preflight$
BEGIN
  IF to_regclass('public.payroll_novelty_batch') IS NULL
     OR to_regprocedure('public.payroll_novelty_bootstrap_v1(jsonb)') IS NULL
     OR to_regprocedure(
       'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_FIRST_FORTNIGHT_PREREQUISITE_MISSING'
      USING ERRCODE = 'P0001';
  END IF;
END
$preflight$;

ALTER TABLE public.payroll_novelty_batch
  DROP CONSTRAINT payroll_novelty_batch_payroll_type_ck;

ALTER TABLE public.payroll_novelty_batch
  ADD CONSTRAINT payroll_novelty_batch_payroll_type_ck CHECK (
    payroll_type IN (
      'monthly','first_fortnight','sac','vacation','supplementary','final','other'
    )
  );

DO $upgrade$
DECLARE
  old_types constant text :=
    '''monthly'',''sac'',''vacation'',''supplementary'',''final'',''other''';
  new_types constant text :=
    '''monthly'',''first_fortnight'',''sac'',''vacation'',''supplementary'',''final'',''other''';
  function_signature regprocedure;
  function_definition text;
  patched_definition text;
  occurrence_count integer;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.payroll_novelty_bootstrap_v1(jsonb)'::regprocedure,
    'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)'::regprocedure
  ] LOOP
    SELECT pg_get_functiondef(function_signature) INTO STRICT function_definition;
    occurrence_count := (
      length(function_definition) - length(replace(function_definition, old_types, ''))
    ) / length(old_types);
    IF occurrence_count <> 1 OR position('first_fortnight' IN function_definition) > 0 THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_FIRST_FORTNIGHT_FUNCTION_DRIFT: %',
        function_signature::text
        USING ERRCODE = 'P0001';
    END IF;
    patched_definition := replace(function_definition, old_types, new_types);
    IF patched_definition = function_definition
       OR position('first_fortnight' IN patched_definition) = 0 THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_FIRST_FORTNIGHT_PATCH_FAILED: %',
        function_signature::text
        USING ERRCODE = 'P0001';
    END IF;
    EXECUTE patched_definition;
  END LOOP;
END
$upgrade$;

COMMENT ON CONSTRAINT payroll_novelty_batch_payroll_type_ck
  ON public.payroll_novelty_batch IS
  'Tipos canonicos habilitados para novedades, incluida la primera quincena incorporada por 029.';
