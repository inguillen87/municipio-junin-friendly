-- 256 · Guardar el cálculo deja de tardar más de 5 minutos.
-- El 25/11/2026 guardar noviembre del convenio 1 (76 personas, 9.272 filas, 15 MB) tardó más de 5 minutos y la
-- conexión se cortó antes de terminar. Medido en una copia de la base, el tiempo se iba en:
--  · own_run_official_result_check_v1: armaba el mapa de filas de cada persona agregando de a una fila a un objeto
--    JSON que se reconstruye entero en cada agregado (costo cuadrático), y recorría el resultado completo por cada
--    persona y por cada cantidad. Además corre tres veces por guardado con exactamente los mismos argumentos
--    (directa, y dentro de las comprobaciones de tarifas familiares y de emisión de filas).
--  · own_run_family_tariff_result_verify_candidate_v2 y own_run_declared_adjustments_verify_v1: recorrían todas las
--    filas del resultado (y todas las personas de la entrada) por cada persona y regla.
-- Ahora las filas se agrupan por contrato una sola vez, el mapa se arma con una sola agregación y la comprobación de
-- totales no se repite si en la misma transacción ya pasó con los mismos argumentos (huella md5 de ambos).
-- Las condiciones, su orden y sus errores son los mismos: no cambia qué se acepta ni qué se rechaza.
-- Las huellas (sha256) que fijan estas funciones se actualizan en cadena, igual que en la migración 255.
-- Después de instalarla hay que preparar un cálculo nuevo: los cálculos capturados antes guardan las huellas viejas.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m256$
DECLARE
 edits constant jsonb := jsonb_build_array(
  jsonb_build_object('fn',$f$public.own_run_official_result_check_v1(jsonb,jsonb)$f$,'needle',$n$DECLARE
 policy jsonb:=input_value->'officialTotalsPolicy';$n$,'replacement',$r$DECLARE
 rows_by_contract jsonb;m256_key text;
 policy jsonb:=input_value->'officialTotalsPolicy';$r$),
  jsonb_build_object('fn',$f$public.own_run_official_result_check_v1(jsonb,jsonb)$f$,'needle',$n$
BEGIN
 -- The R7 input normalizer$n$,'replacement',$r$
BEGIN
 -- 256: la misma comprobación con los mismos argumentos ya pasó en esta transacción.
 m256_key:=md5(input_value::text||chr(1)||result_value::text);
 IF current_setting('municontrol.m256_official_verified',true) IS NOT DISTINCT FROM m256_key THEN RETURN;END IF;
 -- The R7 input normalizer$r$),
  jsonb_build_object('fn',$f$public.own_run_official_result_check_v1(jsonb,jsonb)$f$,'needle',$n$ FOR employee IN SELECT value FROM jsonb_array_elements(selected) LOOP$n$,'replacement',$r$ SELECT coalesce(jsonb_object_agg(m256g.m256k,m256g.m256v),'{}'::jsonb) INTO rows_by_contract FROM(SELECT (m256a.m256x->>'contractId') m256k,jsonb_agg(m256a.m256x ORDER BY m256a.m256n) m256v FROM jsonb_array_elements(result_value->'rows') WITH ORDINALITY m256a(m256x,m256n) WHERE (m256a.m256x->>'contractId') IS NOT NULL GROUP BY (m256a.m256x->>'contractId')) m256g;
 FOR employee IN SELECT value FROM jsonb_array_elements(selected) LOOP$r$),
  jsonb_build_object('fn',$f$public.own_run_official_result_check_v1(jsonb,jsonb)$f$,'needle',$n$  FOR row_value IN SELECT value FROM jsonb_array_elements(result_value->'rows') WHERE value->>'contractId'=contract_id LOOP
   row_map:=row_map||jsonb_build_object(CASE WHEN row_value->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END||(row_value->>'conceptCode'),row_value);
   IF row_value->>'nature'<>'auxiliary' AND NOT row_value->>'conceptCode'=ANY(mapped) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_UNMAPPED_PAYABLE';END IF;
  END LOOP;$n$,'replacement',$r$  SELECT row_map||coalesce(jsonb_object_agg(CASE WHEN m256w.m256r->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END||(m256w.m256r->>'conceptCode'),m256w.m256r ORDER BY m256w.m256o),'{}'::jsonb) INTO row_map FROM jsonb_array_elements(coalesce(rows_by_contract->contract_id,'[]'::jsonb)) WITH ORDINALITY m256w(m256r,m256o);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(rows_by_contract->contract_id,'[]'::jsonb)) m256u WHERE m256u.value->>'nature'<>'auxiliary' AND NOT m256u.value->>'conceptCode'=ANY(mapped)) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_UNMAPPED_PAYABLE';END IF;$r$),
  jsonb_build_object('fn',$f$public.own_run_official_result_check_v1(jsonb,jsonb)$f$,'needle',$n$OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'quantities') q WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'rows') r WHERE r->'contractId'=q->'contractId' AND r->'conceptCode'=q->'conceptCode' AND r->>'nature'<>'auxiliary'))$n$,'replacement',$r$OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'quantities') q LEFT JOIN(SELECT DISTINCT m256r.value->'contractId' m256c,m256r.value->'conceptCode' m256k FROM jsonb_array_elements(result_value->'rows') m256r WHERE m256r.value->>'nature'<>'auxiliary') m256p ON m256p.m256c=q->'contractId' AND m256p.m256k=q->'conceptCode' WHERE m256p.m256c IS NULL)$r$),
  jsonb_build_object('fn',$f$public.own_run_official_result_check_v1(jsonb,jsonb)$f$,'needle',$n$
 END IF;
END $function$$n$,'replacement',$r$
 END IF;
 PERFORM set_config('municontrol.m256_official_verified',m256_key,true);
END $function$$r$),
  jsonb_build_object('fn',$f$public.own_run_family_tariff_result_verify_candidate_v2(jsonb,jsonb,jsonb)$f$,'needle',$n$DECLARE capture_value jsonb;$n$,'replacement',$r$DECLARE rows_by_contract jsonb;capture_value jsonb;$r$),
  jsonb_build_object('fn',$f$public.own_run_family_tariff_result_verify_candidate_v2(jsonb,jsonb,jsonb)$f$,'needle',$n$ FOR e IN SELECT value FROM jsonb_array_elements(selected) employee WHERE$n$,'replacement',$r$ SELECT coalesce(jsonb_object_agg(m256g.m256k,m256g.m256v),'{}'::jsonb) INTO rows_by_contract FROM(SELECT (m256a.m256x->'contractId')::text m256k,jsonb_agg(m256a.m256x ORDER BY m256a.m256n) m256v FROM jsonb_array_elements(result_value->'rows') WITH ORDINALITY m256a(m256x,m256n) WHERE (m256a.m256x->'contractId')::text IS NOT NULL GROUP BY (m256a.m256x->'contractId')::text) m256g;
 FOR e IN SELECT value FROM jsonb_array_elements(selected) employee WHERE$r$),
  jsonb_build_object('fn',$f$public.own_run_family_tariff_result_verify_candidate_v2(jsonb,jsonb,jsonb)$f$,'needle',$n$SELECT count(*),jsonb_agg(value)->0 INTO hits,row_value FROM jsonb_array_elements(result_value->'rows') WHERE value->'contractId'=e->'contractId' AND value->'conceptCode'=r->'code' AND value->'nature'=r->'nature';$n$,'replacement',$r$SELECT count(*),jsonb_agg(value)->0 INTO hits,row_value FROM jsonb_array_elements(coalesce(rows_by_contract->((e->'contractId')::text),'[]'::jsonb)) WHERE value->'contractId'=e->'contractId' AND value->'conceptCode'=r->'code' AND value->'nature'=r->'nature';$r$),
  jsonb_build_object('fn',$f$public.own_run_declared_adjustments_verify_v1(jsonb,jsonb,jsonb)$f$,'needle',$n$DECLARE programme jsonb:=payload#>'{programState,program,definition}';$n$,'replacement',$r$DECLARE rows_by_contract jsonb;employees_by_contract jsonb;programme jsonb:=payload#>'{programState,program,definition}';$r$),
  jsonb_build_object('fn',$f$public.own_run_declared_adjustments_verify_v1(jsonb,jsonb,jsonb)$f$,'needle',$n$ FOR person IN SELECT value FROM jsonb_array_elements(payload#>'{population,employees}') LOOP$n$,'replacement',$r$ SELECT coalesce(jsonb_object_agg(m256g.m256k,m256g.m256v),'{}'::jsonb) INTO rows_by_contract FROM(SELECT (m256a.m256x->'contractId')::text m256k,jsonb_agg(m256a.m256x ORDER BY m256a.m256n) m256v FROM jsonb_array_elements(result_value->'rows') WITH ORDINALITY m256a(m256x,m256n) WHERE (m256a.m256x->'contractId')::text IS NOT NULL GROUP BY (m256a.m256x->'contractId')::text) m256g;
 SELECT coalesce(jsonb_object_agg(m256g.m256k,m256g.m256v),'{}'::jsonb) INTO employees_by_contract FROM(SELECT (m256a.m256x->'contractId')::text m256k,jsonb_agg(m256a.m256x ORDER BY m256a.m256n) m256v FROM jsonb_array_elements(input_value->'employees') WITH ORDINALITY m256a(m256x,m256n) WHERE (m256a.m256x->'contractId')::text IS NOT NULL GROUP BY (m256a.m256x->'contractId')::text) m256g;
 FOR person IN SELECT value FROM jsonb_array_elements(payload#>'{population,employees}') LOOP$r$),
  jsonb_build_object('fn',$f$public.own_run_declared_adjustments_verify_v1(jsonb,jsonb,jsonb)$f$,'needle',$n$SELECT count(*),jsonb_agg(e)->0 INTO n,employee FROM jsonb_array_elements(input_value->'employees') e WHERE e->'contractId'=person->'contractId';$n$,'replacement',$r$SELECT count(*),jsonb_agg(e)->0 INTO n,employee FROM jsonb_array_elements(coalesce(employees_by_contract->((person->'contractId')::text),'[]'::jsonb)) e WHERE e->'contractId'=person->'contractId';$r$),
  jsonb_build_object('fn',$f$public.own_run_declared_adjustments_verify_v1(jsonb,jsonb,jsonb)$f$,'needle',$n$SELECT count(*),jsonb_agg(r)->0 INTO n,result_row FROM jsonb_array_elements(result_value->'rows') r WHERE r->'contractId'=person->'contractId'$n$,'replacement',$r$SELECT count(*),jsonb_agg(r)->0 INTO n,result_row FROM jsonb_array_elements(coalesce(rows_by_contract->((person->'contractId')::text),'[]'::jsonb)) r WHERE r->'contractId'=person->'contractId'$r$)
 );
 ed jsonb; fn text; defs jsonb := '{}'::jsonb; def text; before text; after text; changed jsonb := '{}'::jsonb;
 f record; k text; pass int := 0; touched int; cnt int;
BEGIN
 -- Aplicar todos los reemplazos sobre el texto de cada función y exigir que cada aguja aparezca exactamente una vez.
 FOR ed IN SELECT value FROM jsonb_array_elements(edits) LOOP
  fn:=ed->>'fn';
  IF NOT defs ? fn THEN
   SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
   IF def IS NULL THEN RAISE EXCEPTION 'M256_FUNCTION_MISSING: %',fn;END IF;
   IF position('rows_by_contract' IN def)>0 THEN RAISE EXCEPTION 'M256_ALREADY_INSTALLED: %',fn;END IF;
   defs:=defs||jsonb_build_object(fn,def);
  END IF;
  def:=defs->>fn;
  cnt:=(length(def)-length(replace(def,ed->>'needle','')))/length(ed->>'needle');
  IF cnt<>1 THEN RAISE EXCEPTION 'M256_NEEDLE (%): % veces en %',left(ed->>'needle',60),cnt,fn;END IF;
  defs:=jsonb_set(defs,ARRAY[fn],to_jsonb(replace(def,ed->>'needle',ed->>'replacement')));
 END LOOP;
 FOR fn IN SELECT jsonb_object_keys(defs) LOOP
  SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO before FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
  EXECUTE defs->>fn;
  SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO after FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
  changed:=changed||jsonb_build_object(before,after);
 END LOOP;
 -- Re-fijar en cadena: toda función que contenga una huella vieja pasa a la nueva.
 LOOP
  pass:=pass+1; touched:=0;
  IF pass>12 THEN RAISE EXCEPTION 'M256_PIN_CHAIN_TOO_LONG';END IF;
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
 RAISE NOTICE 'M256 huellas actualizadas: %',(SELECT count(*) FROM jsonb_object_keys(changed));
END
$m256$;
