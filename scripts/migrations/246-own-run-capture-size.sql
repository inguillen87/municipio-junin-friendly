-- 246 · La captura de una corrida propia admite hasta 32 MB, el mismo tope que ya tiene su tabla.
-- own_run_capture_v1 rechazaba toda captura de más de 4 MB (payload + cuerpo + 8 KB). Cada captura incrusta el estado
-- completo del programa y del maestro propio, sin filtrar por convenio: la del convenio 1 de octubre (81 personas) ya pesa
-- 2,65 MB, de los cuales 1,63 MB son el programa. Con un segundo convenio en el programa ninguna captura entra, tampoco
-- la del convenio 1. La tabla own_payroll_run_capture admite payload de hasta 32 MB y los resultados ya admiten 32 MB.
-- Esta migración cambia sólo ese número. No cambia el límite de 1.000 capturas, ni el de cada parte, ni el cálculo.
-- La captura está fijada por huella en municipal_adoption_ready_v1 y en el atestador; el atestador fija también la huella
-- de municipal_adoption_ready_v1, y las dos familias fijan la del atestador. Todo se recompone en el mismo paso, con huella
-- previa exacta, cantidad exacta de apariciones y huella resultante, igual que la 245. No concede permisos ni escribe datos.
-- Ensayo: copia aislada de la base el 19/11/2026; las cinco huellas resultantes son las medidas allí y la captura de 292
-- contratos del convenio 6 (7 a 8 MB) se guardó y se calculó.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $own_run_capture_size$
DECLARE item record;definition text;actual text;occurrences integer;attester_definition text;
 official_before jsonb;quantity_before jsonb;family_before jsonb;family_after jsonb;changed jsonb:='{}'::jsonb;
 needle constant text:=$needle$octet_length(payload_value::text)+octet_length(body::text)+8192>4194304$needle$;
 replacement constant text:=$replacement$octet_length(payload_value::text)+octet_length(body::text)+8192>33554432$replacement$;
 capture constant text:='public.own_run_capture_v1(jsonb,jsonb,uuid,text)';
 capture_before constant text:='60a62776902b1c5a0f07f03c99daf97e7565e934801e0be9b34400ef93ef3a03';
 capture_after constant text:='750c804f2395c87ff1372737284c127e52cb8810b7a91b8f2d6c5ebb9e30fe57';
 adoption constant text:='public.municipal_adoption_ready_v1()';
 adoption_before constant text:='56de54bfca34b454fd5ed113b462605d6dcd066e85a02d02d5089dd2e691f5a6';
 adoption_after constant text:='74761287013c1b19f052f1e48ba427dded9d302c8e0ec346d662107afe7a98d3';
 attester constant text:='public.own_run_release_attest_c1_v1(text)';
 attester_before constant text:='be87ff2b259c1d01986e9674fea90fcc04c69c6892e1c07c0c3ffbbcc791deaa';
 attester_after constant text:='f361b5f585f91466cda8bfc7769bfa6be13326cfbc7c182e2460406baac90c27';
BEGIN
 IF to_regprocedure(capture) IS NULL OR to_regprocedure(adoption) IS NULL OR to_regprocedure(attester) IS NULL
 OR to_regprocedure('public.own_run_official_family_v1()') IS NULL OR to_regprocedure('public.own_run_quantity_family_v1()') IS NULL
 THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_PREREQUISITE' USING ERRCODE='P0001';END IF;
 SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO attester_definition,actual
 FROM pg_proc f WHERE f.oid=to_regprocedure(attester);
 IF actual=attester_after THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_ALREADY_INSTALLED' USING ERRCODE='P0001';END IF;
 IF actual IS DISTINCT FROM attester_before THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_ATTESTER_CHANGED' USING ERRCODE='P0001';END IF;
 official_before:=public.own_run_official_family_v1();quantity_before:=public.own_run_quantity_family_v1();
 IF official_before->'complete' IS DISTINCT FROM 'true'::jsonb OR quantity_before->'complete' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_FAMILY_INCOMPLETE' USING ERRCODE='P0001';END IF;

 -- 1 · El tope de la captura: una sola aparición, huella previa y resultante exactas.
 SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),(length(f.prosrc)-length(replace(f.prosrc,needle,'')))/length(needle)
 INTO definition,actual,occurrences FROM pg_proc f WHERE f.oid=to_regprocedure(capture);
 IF actual IS DISTINCT FROM capture_before OR occurrences IS DISTINCT FROM 1 OR (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1
 THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_PREIMAGE_CHANGED: %',capture USING ERRCODE='P0001';END IF;
 EXECUTE replace(definition,needle,replacement);
 SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(capture);
 IF actual IS DISTINCT FROM capture_after THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_RESULT: %',capture USING ERRCODE='P0001';END IF;
 changed:=changed||jsonb_build_object(capture_before,capture_after);

 -- 2 · La verificación de adopción fija la huella nueva de la captura.
 SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),(length(f.prosrc)-length(replace(f.prosrc,capture_before,'')))/64
 INTO definition,actual,occurrences FROM pg_proc f WHERE f.oid=to_regprocedure(adoption);
 IF actual IS DISTINCT FROM adoption_before OR occurrences IS DISTINCT FROM 1 OR (length(definition)-length(replace(definition,capture_before,'')))/64<>1
 THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_PREIMAGE_CHANGED: %',adoption USING ERRCODE='P0001';END IF;
 EXECUTE replace(definition,capture_before,capture_after);
 SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(adoption);
 IF actual IS DISTINCT FROM adoption_after THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_RESULT: %',adoption USING ERRCODE='P0001';END IF;
 changed:=changed||jsonb_build_object(adoption_before,adoption_after);

 -- 3 · El atestador fija las dos huellas nuevas: cada una aparece exactamente una vez.
 FOR item IN SELECT * FROM (VALUES (capture_before,capture_after),(adoption_before,adoption_after)) pins(before_sha256,after_sha256) LOOP
  IF (length(attester_definition)-length(replace(attester_definition,item.before_sha256,'')))/64<>1 OR position(item.after_sha256 IN attester_definition)<>0
  THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_ATTESTER_CHANGED' USING ERRCODE='P0001';END IF;
  attester_definition:=replace(attester_definition,item.before_sha256,item.after_sha256);
 END LOOP;
 EXECUTE attester_definition;
 SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(attester);
 IF actual IS DISTINCT FROM attester_after THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_ATTESTER_RESULT' USING ERRCODE='P0001';END IF;
 changed:=changed||jsonb_build_object(attester_before,attester_after);

 -- 4 · Las dos familias fijan la huella nueva del atestador.
 FOR item IN SELECT * FROM (VALUES
  ('public.own_run_official_family_v1()','32f9fa070e99cf1a580d3ee53df9c555f21392d8c81fdf50c2685f6344590259','5bafc8f725f8b9a4bc1f52cb686d483c3d57352a814562d868e4cbbf8319323e'),
  ('public.own_run_quantity_family_v1()','dbb087dd6828d612abd8b8a114dcf9942ff10bb064b39d55cdc97fc4de58339d','a26d46abf70bbb12c76e9289d439e3eb9fc00a118d20610932cdb04c0d0b9900')
 ) expected(signature,before_sha256,after_sha256) LOOP
  SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),(length(f.prosrc)-length(replace(f.prosrc,attester_before,'')))/64
  INTO definition,actual,occurrences FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF definition IS NULL OR actual IS DISTINCT FROM item.before_sha256 OR occurrences IS DISTINCT FROM 2
  OR (length(definition)-length(replace(definition,attester_before,'')))/64<>2
  THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_FAMILY_CHANGED: %',item.signature USING ERRCODE='P0001';END IF;
  EXECUTE replace(definition,attester_before,attester_after);
  SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF actual IS DISTINCT FROM item.after_sha256 THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_FAMILY_RESULT: %',item.signature USING ERRCODE='P0001';END IF;
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
  THEN RAISE EXCEPTION 'OWN_RUN_CAPTURE_SIZE_FAMILY_RESULT: %',item.kind USING ERRCODE='P0001';END IF;
 END LOOP;
END
$own_run_capture_size$;
