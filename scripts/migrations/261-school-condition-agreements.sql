-- 261 · La exclusión de ayuda escolar (311/312 fuera de febrero) admite los convenios con la misma condición de GRH.
-- El codliq de GRH (28/10/2026) condiciona 311 y 312 exactamente con L[101] == 2 en los convenios 1, 2, 3, 4, 6, 7 y 8.
-- 5 y 14 usan L[101] == 3; 9, 11, 12, 13 y 14 admiten además L[101] == 0 en 312: siguen sin esta exclusión.
-- Mismo cambio que assets/own-payroll-source-coverage.js (SCHOOL_CONDITION_AGREEMENTS). Huellas en cadena como en 255.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m261$
DECLARE
 fn constant text := 'public.own_program_source_coverage_options_v1(jsonb)';
 needle constant text := 'OR policy->>''agreementCode'' IS DISTINCT FROM ''1'' OR policy->>''liquidationType'' IS DISTINCT FROM ''monthly''';
 replacement constant text := 'OR NOT (policy->>''agreementCode'')=ANY(ARRAY[''1'',''2'',''3'',''4'',''6'',''7'',''8'']) OR policy->>''liquidationType'' IS DISTINCT FROM ''monthly''';
 def text; before text; after text; changed jsonb := '{}'::jsonb; f record; k text; pass int := 0; touched int; cnt int;
BEGIN
 SELECT pg_get_functiondef(p.oid),encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO def,before FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
 IF def IS NULL THEN RAISE EXCEPTION 'M261_FUNCTION_MISSING';END IF;
 IF position('ARRAY[''1'',''2'',''3'',''4'',''6'',''7'',''8'']' IN def)>0 THEN RAISE EXCEPTION 'M261_ALREADY_INSTALLED';END IF;
 cnt:=(length(def)-length(replace(def,needle,'')))/length(needle);
 IF cnt<>1 THEN RAISE EXCEPTION 'M261_NEEDLE: % veces',cnt;END IF;
 EXECUTE replace(def,needle,replacement);
 SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO after FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
 changed:=jsonb_build_object(before,after);
 LOOP
  pass:=pass+1; touched:=0;
  IF pass>12 THEN RAISE EXCEPTION 'M261_PIN_CHAIN_TOO_LONG';END IF;
  FOR f IN SELECT p.oid,pg_get_functiondef(p.oid) d,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') h
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
    AND EXISTS(SELECT 1 FROM jsonb_object_keys(changed) o WHERE position(o IN p.prosrc)>0) LOOP
   def:=f.d;
   FOR k IN SELECT jsonb_object_keys(changed) LOOP def:=replace(def,k,changed->>k);END LOOP;
   EXECUTE def;
   SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO after FROM pg_proc p WHERE p.oid=f.oid;
   IF after IS DISTINCT FROM f.h THEN changed:=changed||jsonb_build_object(f.h,after);END IF;
   touched:=touched+1;
  END LOOP;
  EXIT WHEN touched=0;
 END LOOP;
 RAISE NOTICE 'M261 ayuda escolar: convenios 1, 2, 3, 4, 6, 7 y 8; huellas actualizadas: %',(SELECT count(*) FROM jsonb_object_keys(changed));
END
$m261$;
