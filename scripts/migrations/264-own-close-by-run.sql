-- 264 · Cerrar una liquidación por corrida, sin leer el mes entero.
-- El detalle del cierre reunía en una sola respuesta todas las corridas confirmadas del período, con su cálculo íntegro
-- (unos 0,21 MB por persona): con más de ~150 personas confirmadas en el mes superaba la capacidad y no se podía cerrar.
-- Ahora se puede pedir el detalle y el cierre de UNA corrida: el padrón del detalle se reduce a las personas cuya
-- versión confirmada vigente pertenece a esa corrida y que todavía no están en un grupo cerrado. Cada corrida entra
-- en la capacidad por construcción (el cálculo ya está limitado a 32 MB). El resto queda igual: mismas verificaciones,
-- mismo motivo, mismo registro, y el cierre de todo el mes sigue disponible cuando entra.
--  · own_close_detail_run_v1(p,período,tipo,corrida,completo) y own_close_command_run_v1(p,cuerpo,clave,corrida,completo):
--    fijan la corrida para esta transacción y llaman a las funciones de siempre.
--  · El detalle (own_close_detail_capacity_core_v2 donde está instalado; si no, own_close_detail_v1) filtra el padrón
--    cuando hay corrida fijada. Sin corrida fijada no cambia nada.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m264$
DECLARE
 anchor constant text := 'closed:=public.own_close_active_v1(ctx,period_value,type_value);';
 addition constant text := 'closed:=public.own_close_active_v1(ctx,period_value,type_value);
 -- 264: cierre por corrida. Sólo las personas cuya versión confirmada vigente es de esa corrida y que no están cerradas.
 IF coalesce(current_setting(''municontrol.own_close_run'',true),'''')<>'''' THEN
  IF current_setting(''municontrol.own_close_run'',true)!~''^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'' THEN RAISE EXCEPTION ''OWN_CLOSE_INPUT_INVALID'';END IF;
  roster:=(SELECT coalesce(jsonb_agg(x.value ORDER BY x.ordinality),''[]''::jsonb) FROM jsonb_array_elements(roster) WITH ORDINALITY x(value,ordinality)
   WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(current_rows) d WHERE d.value->>''contractId''=x.value->>''contractId'' AND d.value->>''state''=''confirmed'' AND d.value->>''runId''=current_setting(''municontrol.own_close_run'',true))
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(closed) g CROSS JOIN LATERAL jsonb_array_elements(g.value#>''{snapshot,employees}'') e WHERE e.value->>''contractId''=x.value->>''contractId''));
  IF jsonb_array_length(roster)=0 THEN RAISE EXCEPTION ''OWN_CLOSE_SELECTION_INVALID'';END IF;
 END IF;';
 fn text; def text; before text; after text; changed jsonb := '{}'::jsonb; f record; k text; pass int := 0; touched int; cnt int;
BEGIN
 fn:=CASE WHEN to_regprocedure('public.own_close_detail_capacity_core_v2(jsonb,text,text,integer)') IS NOT NULL THEN 'public.own_close_detail_capacity_core_v2(jsonb,text,text,integer)'
  WHEN to_regprocedure('public.own_close_detail_v1(jsonb,text,text)') IS NOT NULL THEN 'public.own_close_detail_v1(jsonb,text,text)' ELSE NULL END;
 IF fn IS NULL THEN RAISE EXCEPTION 'M264_CLOSE_DETAIL_MISSING';END IF;
 SELECT pg_get_functiondef(p.oid),encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO def,before FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
 IF position('municontrol.own_close_run' IN def)>0 THEN RAISE EXCEPTION 'M264_ALREADY_INSTALLED';END IF;
 cnt:=(length(def)-length(replace(def,anchor,'')))/length(anchor);
 IF cnt<>1 THEN RAISE EXCEPTION 'M264_NEEDLE: % veces en %',cnt,fn;END IF;
 EXECUTE replace(def,anchor,addition);
 SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO after FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
 changed:=changed||jsonb_build_object(before,after);
 -- Las funciones que fijan la huella de la que cambió se actualizan en cadena, como en 258, 260 y 263.
 LOOP
  pass:=pass+1; touched:=0;
  IF pass>12 THEN RAISE EXCEPTION 'M264_PIN_CHAIN_TOO_LONG';END IF;
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
 -- Fachadas por corrida: la corrida vale sólo dentro de esta transacción.
 EXECUTE $f$CREATE FUNCTION public.own_close_detail_run_v1(p jsonb,period_value text,type_value text,run_id uuid,full_json boolean) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' SET "TimeZone" TO 'UTC' AS $b$
  BEGIN IF run_id IS NULL OR full_json IS NULL THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;
   PERFORM set_config('municontrol.own_close_run',run_id::text,true);
   -- Cada rama se prepara sólo si se ejecuta: donde no existe la fachada de capacidad ampliada se usa la común.
   IF full_json AND to_regprocedure('public.own_close_detail_full_v1(jsonb,text,text)') IS NOT NULL THEN RETURN public.own_close_detail_full_v1(p,period_value,type_value);END IF;
   RETURN public.own_close_detail_v1(p,period_value,type_value);END $b$$f$;
 EXECUTE $f$CREATE FUNCTION public.own_close_command_run_v1(p jsonb,body jsonb,key uuid,run_id uuid,full_json boolean) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' SET "TimeZone" TO 'UTC' AS $b$
  BEGIN IF run_id IS NULL OR full_json IS NULL THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;
   PERFORM set_config('municontrol.own_close_run',run_id::text,true);
   -- Cada rama se prepara sólo si se ejecuta: donde no existe la fachada de capacidad ampliada se usa la común.
   IF full_json AND to_regprocedure('public.own_close_command_full_v1(jsonb,jsonb,uuid)') IS NOT NULL THEN RETURN public.own_close_command_full_v1(p,body,key);END IF;
   RETURN public.own_close_command_v1(p,body,key);END $b$$f$;
 REVOKE ALL ON FUNCTION public.own_close_detail_run_v1(jsonb,text,text,uuid,boolean) FROM PUBLIC;
 REVOKE ALL ON FUNCTION public.own_close_command_run_v1(jsonb,jsonb,uuid,uuid,boolean) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION public.own_close_detail_run_v1(jsonb,text,text,uuid,boolean),public.own_close_command_run_v1(jsonb,jsonb,uuid,uuid,boolean) TO municontrol_actions_runtime_app;
 RAISE NOTICE 'M264 cierre por corrida en %: % huellas',fn,(SELECT count(*) FROM jsonb_object_keys(changed));
END
$m264$;
