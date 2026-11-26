-- 262 · Los cálculos guardados admiten hasta 4 GB de evidencia y cada captura hasta 32 MB.
-- own_run_capacity_v1 rechazaba todo cálculo nuevo cuando la suma del texto de capturas y resultados superaba 512 MB.
-- Cada cálculo se conserva completo como antecedente (unos 11 MB cada 29 contratos del convenio 6), y el 26/11/2026 la
-- suma llegó a 533 MB con apenas 46 capturas: ningún convenio podía volver a calcularse (OWN_RUN_LIMIT). En disco esa
-- evidencia ocupa unas seis veces menos porque se guarda comprimida. Se sube el tope a 4 GB; no se borra nada.
-- Además, donde own_run_capture_v1 todavía conserva el tope de 4 MB por captura (la 246 no llegó a instalarse en todas
-- las bases), pasa a 32 MB, el mismo tope que ya tienen su tabla y los resultados. Con dos convenios en el programa la
-- captura de un solo contrato ya pesa 3,7 MB.
-- No cambia reglas, importes, permisos ni el límite de 1.000 capturas. Las huellas (sha256) que fijan estas funciones se
-- actualizan en cadena, igual que en la 255.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m262$
DECLARE
 spec record; def text; before text; after text; changed jsonb := '{}'::jsonb; f record; k text; pass int := 0; touched int; hits int; done_count int := 0;
BEGIN
 FOR spec IN SELECT * FROM (VALUES
  ('public.own_run_capacity_v1(bigint)','+extra>536870912 THEN','+extra>4294967296 THEN',true),
  ('public.own_run_capture_v1(jsonb,jsonb,uuid,text)','octet_length(payload_value::text)+octet_length(body::text)+8192>4194304','octet_length(payload_value::text)+octet_length(body::text)+8192>33554432',false)
 ) AS t(sig,needle,replacement,required) LOOP
  SELECT pg_get_functiondef(p.oid),encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO def,before FROM pg_proc p WHERE p.oid=to_regprocedure(spec.sig);
  IF def IS NULL THEN RAISE EXCEPTION 'M262_FUNCTION_MISSING %',spec.sig;END IF;
  hits:=(length(def)-length(replace(def,spec.needle,'')))/length(spec.needle);
  IF hits=0 AND position(spec.replacement IN def)>0 THEN
   IF spec.required THEN RAISE EXCEPTION 'M262_ALREADY_INSTALLED';END IF;
   CONTINUE;
  END IF;
  IF hits<>1 THEN RAISE EXCEPTION 'M262_NEEDLE % %',spec.sig,hits;END IF;
  EXECUTE replace(def,spec.needle,spec.replacement);
  SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO after FROM pg_proc p WHERE p.oid=to_regprocedure(spec.sig);
  changed:=changed||jsonb_build_object(before,after);done_count:=done_count+1;
 END LOOP;
 -- Re-fijar en cadena: toda función que contenga una huella vieja pasa a la nueva.
 LOOP
  pass:=pass+1; touched:=0;
  IF pass>12 THEN RAISE EXCEPTION 'M262_PIN_CHAIN_TOO_LONG';END IF;
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
 RAISE NOTICE 'M262 funciones cambiadas: %; huellas actualizadas: %',done_count,(SELECT count(*) FROM jsonb_object_keys(changed));
END
$m262$;
