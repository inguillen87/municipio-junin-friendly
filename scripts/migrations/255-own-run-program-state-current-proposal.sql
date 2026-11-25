-- 255 · El cálculo guarda sólo la propuesta vigente del programa, no todo su historial.
-- own_run_capture_v1 copia en cada cálculo el estado del programa de reglas (own_program_bootstrap_v1), que incluye el
-- historial completo de propuestas con su programa entero. Ese historial crece ~400 KB con cada cambio de reglas
-- aprobado; el 25/11/2026 llegó a 3,3 MB de un total de 4,9 MB y superó el tope de 4 MB del cálculo (OWN_RUN_LIMIT),
-- aun calculando un solo contrato. Las únicas funciones del cálculo que leen programState.proposals
-- (own_run_catalogue_values_capture_v1 y own_run_catalogue_values_frozen_v1) buscan sólo la propuesta cuyo id es
-- program.proposalId. Se conserva esa y se deja afuera el resto. No cambia reglas, importes ni permisos.
-- Las huellas (sha256) que fijan la función en los controles de adopción y de integridad se actualizan en cadena:
-- cada función que guardaba una huella vieja pasa a guardar la nueva, y así hasta que no quede ninguna.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m255$
DECLARE
 capture constant text := 'public.own_run_capture_v1(jsonb,jsonb,uuid,text)';
 needle constant text := ' program_state:=public.own_program_bootstrap_v1(p);';
 addition constant text := ' program_state:=jsonb_set(program_state,''{proposals}'',coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(program_state->''proposals'') x WHERE x->>''id''=program_state#>>''{program,proposalId}''),''[]''::jsonb));';
 def text; before text; after text; changed jsonb := '{}'::jsonb; f record; k text; pass int := 0; touched int;
BEGIN
 SELECT pg_get_functiondef(p.oid),encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO def,before FROM pg_proc p WHERE p.oid=to_regprocedure(capture);
 IF def IS NULL THEN RAISE EXCEPTION 'M255_CAPTURE_MISSING';END IF;
 IF position(addition IN def)>0 THEN RAISE EXCEPTION 'M255_ALREADY_INSTALLED';END IF;
 IF (length(def)-length(replace(def,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'M255_CAPTURE_NEEDLE';END IF;
 EXECUTE replace(def,needle,needle||E'\n'||addition);
 SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO after FROM pg_proc p WHERE p.oid=to_regprocedure(capture);
 changed:=jsonb_build_object(before,after);
 -- Re-fijar en cadena: toda función que contenga una huella vieja pasa a la nueva.
 LOOP
  pass:=pass+1; touched:=0;
  IF pass>12 THEN RAISE EXCEPTION 'M255_PIN_CHAIN_TOO_LONG';END IF;
  FOR f IN SELECT p.oid,p.oid::regprocedure::text sig,pg_get_functiondef(p.oid) d,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') h
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
 RAISE NOTICE 'M255 huellas actualizadas: %',(SELECT count(*) FROM jsonb_object_keys(changed));
END
$m255$;
