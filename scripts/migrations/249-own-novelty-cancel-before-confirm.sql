-- 249 · Un lote de novedades propias aprobado se puede cancelar mientras ninguna liquidación lo haya confirmado.
-- own_novelty_command_v1 rechazaba la cancelación (OWN_NOVELTY_IN_USE) apenas una captura de cálculo incluía el lote,
-- aunque ese cálculo fuera un ensayo que nadie confirmó o que ni siquiera terminó. Cada captura incrusta todos los lotes
-- aprobados del período, así que bastaba un cálculo de prueba para dejar un lote mal cargado imposible de corregir.
-- Desde esta migración:
--  1 · La cancelación sólo se rechaza si una captura que incluye el lote ya tiene un evento de liquidación
--      (confirmación, anulación o cancelación registradas). Bloquea además resultados y eventos de liquidación
--      mientras decide, para que nada se confirme en paralelo.
--  2 · Un resultado o una confirmación de liquidación sobre una captura que incluye un lote que ya no está aprobado
--      se rechaza con OWN_NOVELTY_NOT_CURRENT: los cálculos hechos con un lote cancelado quedan como antecedente y
--      hay que volver a calcular.
-- own_novelty_command_v1 está fijada por huella en municipal_adoption_ready_v1 y en el atestador; el atestador fija la
-- huella de municipal_adoption_ready_v1 y las dos familias fijan la del atestador. Se recompone todo en el mismo paso,
-- con huella previa exacta, cantidad exacta de apariciones y huella resultante, igual que la 246.
-- No escribe datos ni concede permisos.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $own_novelty_cancel$
DECLARE item record;definition text;actual text;occurrences integer;attester_definition text;
 official_before jsonb;quantity_before jsonb;family_before jsonb;family_after jsonb;changed jsonb:='{}'::jsonb;
 lock_needle constant text:=$n$PERFORM public.own_run_lock_v1(ctx);LOCK TABLE public.own_payroll_run_capture IN SHARE MODE NOWAIT;$n$;
 lock_replacement constant text:=$n$PERFORM public.own_run_lock_v1(ctx);LOCK TABLE public.own_payroll_run_capture,public.own_payroll_run_result,public.own_payroll_liquidation_event IN SHARE MODE NOWAIT;$n$;
 use_needle constant text:=$n$b->>'id'=batch::text) THEN RAISE EXCEPTION 'OWN_NOVELTY_IN_USE';$n$;
 use_replacement constant text:=$n$b->>'id'=batch::text AND EXISTS(SELECT 1 FROM public.own_payroll_liquidation_event l WHERE l.capture_id=c.id)) THEN RAISE EXCEPTION 'OWN_NOVELTY_IN_USE';$n$;
 command constant text:='public.own_novelty_command_v1(jsonb,jsonb,uuid)';
 command_before constant text:='833ce45dc704aaef0bdcabb177da9d899504e210590ac679aa041d2abc435d7e';
 command_after constant text:='100d8bf93c8796131d3fb3d80379e664828cffbbd917e9753f8aaa8e49ab0896';
 adoption constant text:='public.municipal_adoption_ready_v1()';
 adoption_before constant text:='562952dcfad34e8bf568499df77ecd3a49e5a9295300a46b2c92aff2ca160e2d';
 adoption_after constant text:='d13fa244e994c47bfc040ed0b826b7914a8ee068bdfa1b6486ceac909cdbef2d';
 attester constant text:='public.own_run_release_attest_c1_v1(text)';
 attester_before constant text:='b1ab75695108d0d31390cb7a8e602452ec1f2a11556c559057fb7d99c72765af';
 attester_after constant text:='ffacf9c4d4675fe68e6db4b1c5455d29b8bc379e3d504b19a7e068d691a4296c';
BEGIN
 IF to_regprocedure(command) IS NULL OR to_regprocedure(adoption) IS NULL OR to_regprocedure(attester) IS NULL
 OR to_regprocedure('public.own_run_official_family_v1()') IS NULL OR to_regprocedure('public.own_run_quantity_family_v1()') IS NULL
 OR to_regclass('public.own_payroll_liquidation_event') IS NULL OR to_regclass('public.own_payroll_run_result') IS NULL
 THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_PREREQUISITE' USING ERRCODE='P0001';END IF;
 IF to_regprocedure('public.own_payroll_capture_novelty_guard_v1()') IS NOT NULL
 THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_ALREADY_INSTALLED' USING ERRCODE='P0001';END IF;
 SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO attester_definition,actual
 FROM pg_proc f WHERE f.oid=to_regprocedure(attester);
 IF actual IS DISTINCT FROM attester_before THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_ATTESTER_CHANGED' USING ERRCODE='P0001';END IF;
 official_before:=public.own_run_official_family_v1();quantity_before:=public.own_run_quantity_family_v1();
 IF official_before->'complete' IS DISTINCT FROM 'true'::jsonb OR quantity_before->'complete' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_FAMILY_INCOMPLETE' USING ERRCODE='P0001';END IF;

 -- 1 · La cancelación: dos reemplazos, cada uno con una sola aparición; huella previa y resultante exactas.
 SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO definition,actual
 FROM pg_proc f WHERE f.oid=to_regprocedure(command);
 IF actual IS DISTINCT FROM command_before
 OR (length(definition)-length(replace(definition,lock_needle,'')))/length(lock_needle)<>1
 OR (length(definition)-length(replace(definition,use_needle,'')))/length(use_needle)<>1
 THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_PREIMAGE_CHANGED: %',command USING ERRCODE='P0001';END IF;
 EXECUTE replace(replace(definition,lock_needle,lock_replacement),use_needle,use_replacement);
 SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(command);
 IF actual IS DISTINCT FROM command_after THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_RESULT: % %',command,actual USING ERRCODE='P0001';END IF;
 changed:=changed||jsonb_build_object(command_before,command_after);

 -- 2 · La verificación de adopción fija la huella nueva del comando.
 SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),(length(f.prosrc)-length(replace(f.prosrc,command_before,'')))/64
 INTO definition,actual,occurrences FROM pg_proc f WHERE f.oid=to_regprocedure(adoption);
 IF actual IS DISTINCT FROM adoption_before OR occurrences IS DISTINCT FROM 1 OR (length(definition)-length(replace(definition,command_before,'')))/64<>1
 THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_PREIMAGE_CHANGED: %',adoption USING ERRCODE='P0001';END IF;
 EXECUTE replace(definition,command_before,command_after);
 SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(adoption);
 IF actual IS DISTINCT FROM adoption_after THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_RESULT: % %',adoption,actual USING ERRCODE='P0001';END IF;
 changed:=changed||jsonb_build_object(adoption_before,adoption_after);

 -- 3 · El atestador fija las dos huellas nuevas: cada una aparece exactamente una vez.
 FOR item IN SELECT * FROM (VALUES (command_before,command_after),(adoption_before,adoption_after)) pins(before_sha256,after_sha256) LOOP
  IF (length(attester_definition)-length(replace(attester_definition,item.before_sha256,'')))/64<>1 OR position(item.after_sha256 IN attester_definition)<>0
  THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_ATTESTER_CHANGED' USING ERRCODE='P0001';END IF;
  attester_definition:=replace(attester_definition,item.before_sha256,item.after_sha256);
 END LOOP;
 EXECUTE attester_definition;
 SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(attester);
 IF actual IS DISTINCT FROM attester_after THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_ATTESTER_RESULT: %',actual USING ERRCODE='P0001';END IF;
 changed:=changed||jsonb_build_object(attester_before,attester_after);

 -- 4 · Las dos familias fijan la huella nueva del atestador.
 FOR item IN SELECT * FROM (VALUES
  ('public.own_run_official_family_v1()','0fe48450fd4da0a764990bb8c83cef3fce6e8afe56f406c16f1ca3869c454ac1','75c401fa070253c48bed092e3076c5bb49ae677e1b2c4ca78717055261c68afb'),
  ('public.own_run_quantity_family_v1()','485df97acdd9e36a021ed534fd80b7efa2af5dc92703af474e9dccecd0de0b3e','e4959e1fd1560f31fd9b3f49a3dd7ddc59eb7b11770a1d80a9c08afb35c9b26d')
 ) expected(signature,before_sha256,after_sha256) LOOP
  SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),(length(f.prosrc)-length(replace(f.prosrc,attester_before,'')))/64
  INTO definition,actual,occurrences FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF definition IS NULL OR actual IS DISTINCT FROM item.before_sha256 OR occurrences IS DISTINCT FROM 2
  OR (length(definition)-length(replace(definition,attester_before,'')))/64<>2
  THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_FAMILY_CHANGED: %',item.signature USING ERRCODE='P0001';END IF;
  EXECUTE replace(definition,attester_before,attester_after);
  SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF actual IS DISTINCT FROM item.after_sha256 THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_FAMILY_RESULT: % %',item.signature,actual USING ERRCODE='P0001';END IF;
 END LOOP;

 -- 5 · Las familias siguen completas, con la misma versión y los mismos miembros; sólo cambian huellas reemplazadas acá.
 FOR item IN SELECT * FROM (VALUES ('official'),('quantity')) families(kind) LOOP
  IF item.kind='official' THEN family_before:=official_before;family_after:=public.own_run_official_family_v1();
  ELSE family_before:=quantity_before;family_after:=public.own_run_quantity_family_v1();END IF;
  IF family_after->'complete' IS DISTINCT FROM 'true'::jsonb OR (family_after-'members') IS DISTINCT FROM (family_before-'members')
  OR jsonb_array_length(family_after->'members')<>jsonb_array_length(family_before->'members')
  OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(family_before->'members') WITH ORDINALITY b(member,ordinal)
   JOIN jsonb_array_elements(family_after->'members') WITH ORDINALITY a(member,ordinal) USING(ordinal)
   WHERE a.member->>'signature' IS DISTINCT FROM b.member->>'signature'
    OR (a.member-'sha256') IS DISTINCT FROM (b.member-'sha256')
    OR a.member->>'sha256' IS DISTINCT FROM coalesce(changed->>(b.member->>'sha256'),b.member->>'sha256'))
  OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(family_after->'members') a(member)
   WHERE a.member->>'signature'=attester AND a.member->>'sha256'=attester_after)
  THEN RAISE EXCEPTION 'OWN_NOVELTY_CANCEL_FAMILY_RESULT: %',item.kind USING ERRCODE='P0001';END IF;
 END LOOP;
END
$own_novelty_cancel$;

-- 6 · Un cálculo o una confirmación sólo avanzan si todos los lotes propios incrustados en la captura siguen aprobados.
CREATE FUNCTION public.own_payroll_capture_novelty_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='own_payroll_liquidation_event' THEN IF NEW.command<>'confirm' THEN RETURN NEW;END IF;END IF;
 IF EXISTS(SELECT 1 FROM public.own_payroll_run_capture c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload#>'{monthly,nativeBatches}','[]')) b
  WHERE c.id=NEW.capture_id AND (SELECT e.status FROM public.own_payroll_novelty_event e WHERE e.tenant_id=c.tenant_id AND e.source_binding_id=c.source_binding_id AND e.batch_id::text=b->>'id' ORDER BY e.revision DESC LIMIT 1) IS DISTINCT FROM 'approved')
 THEN RAISE EXCEPTION 'OWN_NOVELTY_NOT_CURRENT';END IF;
 RETURN NEW;END $$;
REVOKE ALL ON FUNCTION public.own_payroll_capture_novelty_guard_v1() FROM PUBLIC;
CREATE TRIGGER own_run_result_novelty_current BEFORE INSERT ON public.own_payroll_run_result FOR EACH ROW EXECUTE FUNCTION public.own_payroll_capture_novelty_guard_v1();
CREATE TRIGGER own_liquidation_novelty_current BEFORE INSERT ON public.own_payroll_liquidation_event FOR EACH ROW EXECUTE FUNCTION public.own_payroll_capture_novelty_guard_v1();
