-- 263 · La operación propia alcanza las decisiones de la liquidación: confirmar, anular y cerrar lo calculado por una misma.
-- Respaldo: la misma «Nota v2: Liquidación y Tesorería con operación propia y control posterior», 25/11/2026, ya
-- registrada por la migración 260 (legajos, entradas, liquidación, cierre, recibos y pagos; autoriza y controla después
-- Hugo Leucrini). Esta migración no registra ni cambia autorizaciones: sólo hace que dos pantallas las respeten.
--  · own_liquidation_rows_v1: «confirmar» y «anular» aceptan que decida quien calculó cuando tiene autorización vigente.
--  · own_close_detail_v1: «cerrar» acepta lo mismo.
-- Sin autorización vigente nada cambia: sigue haciendo falta otra persona. Las demás condiciones (permiso de aprobar o
-- cerrar, versión, bloqueos, estado) quedan igual, y cada decisión sigue registrada con persona, fecha y motivo.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m263$
DECLARE
 same constant text := 'independent:=c.actor_person_id IS DISTINCT FROM(ctx->>''actorPersonId'')::uuid AND c.actor_membership_id IS DISTINCT FROM(ctx->>''membershipId'')::uuid AND c.actor_email IS DISTINCT FROM ctx->>''actorEmail'';';
 same_new constant text := 'independent:=(c.actor_person_id IS DISTINCT FROM(ctx->>''actorPersonId'')::uuid AND c.actor_membership_id IS DISTINCT FROM(ctx->>''membershipId'')::uuid AND c.actor_email IS DISTINCT FROM ctx->>''actorEmail'') OR public.own_single_operator_v1(ctx,c.actor_membership_id);';
 fns constant text[] := ARRAY['public.own_liquidation_rows_v1(jsonb,own_payroll_run_capture)','public.own_close_detail_v1(jsonb,text,text)'];
 fn text; def text; before text; after text; changed jsonb := '{}'::jsonb; f record; k text; pass int := 0; touched int; cnt int;
BEGIN
 IF to_regprocedure('public.own_single_operator_v1(jsonb,uuid)') IS NULL THEN RAISE EXCEPTION 'M263_REQUIRES_258';END IF;
 FOREACH fn IN ARRAY fns LOOP
  SELECT pg_get_functiondef(p.oid),encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO def,before FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
  IF def IS NULL THEN RAISE EXCEPTION 'M263_FUNCTION_MISSING: %',fn;END IF;
  IF position('own_single_operator_v1' IN def)>0 THEN RAISE EXCEPTION 'M263_ALREADY_INSTALLED: %',fn;END IF;
  cnt:=(length(def)-length(replace(def,same,'')))/length(same);
  IF cnt<>1 THEN RAISE EXCEPTION 'M263_NEEDLE: % veces en %',cnt,fn;END IF;
  EXECUTE replace(def,same,same_new);
  SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO after FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
  changed:=changed||jsonb_build_object(before,after);
 END LOOP;
 -- Las funciones que fijan la huella de las que cambiaron se actualizan en cadena, como en 258 y 260.
 LOOP
  pass:=pass+1; touched:=0;
  IF pass>12 THEN RAISE EXCEPTION 'M263_PIN_CHAIN_TOO_LONG';END IF;
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
 RAISE NOTICE 'M263 decisiones con operación propia: % funciones, % huellas',array_length(fns,1),(SELECT count(*) FROM jsonb_object_keys(changed));
END
$m263$;
