-- 245 · La corrida propia acepta el identificador de persona real de quien prepara y aprueba novedades.
-- Cuatro funciones controlan la doble revisión de un lote nativo de novedades antes de calcular:
--   own_run_declared_adjustments_capture_v1, own_run_quantity_only_expected_inputs_v1,
--   own_run_capped_sources_v1 y own_run_monthly_forced_capture_check_candidate_v1.
-- Las cuatro exigían que el identificador de persona de cada actor tuviera formato RFC 4122 versión 1 a 5.
-- En un municipio adoptado los identificadores de persona son derivados y no llevan versión ni variante
-- RFC, de modo que el control rechazaba todo lote real con «…_REVIEW_REQUIRED» aunque lo hubieran
-- preparado y aprobado dos personas distintas. Las pruebas usaban identificadores aleatorios versión 4.
-- Esta migración cambia sólo ese control de formato: UUID canónico en minúsculas y distinto del nulo.
-- No cambia nada más del control: claves exactas del actor, formato de la membresía, cantidad de
-- aprobaciones, que quien decide sea la última aprobación, y que membresías y personas sean distintas.
-- La cadena de atestación se recompone en el mismo paso: el atestador fija las cuatro huellas nuevas y
-- las dos familias fijan la huella nueva del atestador. Cada reemplazo exige la huella previa exacta,
-- una cantidad exacta de apariciones y la huella resultante. Las familias tienen que seguir completas
-- y con los mismos miembros. No concede permisos, no cambia dueños y no escribe datos.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $actor_person_format$
DECLARE item record;definition text;actual text;occurrences integer;attester_definition text;
 official_before jsonb;quantity_before jsonb;family_before jsonb;family_after jsonb;changed jsonb:='{}'::jsonb;
 needle constant text:=$needle$coalesce(actor->>'personId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'$needle$;
 replacement constant text:=$replacement$coalesce(actor->>'personId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR actor->>'personId'='00000000-0000-0000-0000-000000000000'$replacement$;
 attester constant text:='public.own_run_release_attest_c1_v1(text)';
 attester_before constant text:='cc7d613a267dd79e7933f0532e4d739a062822dff59501928c7037670f20fe7c';
 attester_after constant text:='be87ff2b259c1d01986e9674fea90fcc04c69c6892e1c07c0c3ffbbcc791deaa';
BEGIN
 IF to_regprocedure(attester) IS NULL OR to_regprocedure('public.own_run_official_family_v1()') IS NULL
 OR to_regprocedure('public.own_run_quantity_family_v1()') IS NULL
 THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_PREREQUISITE' USING ERRCODE='P0001';END IF;
 SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO attester_definition,actual
 FROM pg_proc f WHERE f.oid=to_regprocedure(attester);
 IF actual=attester_after THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_ALREADY_INSTALLED' USING ERRCODE='P0001';END IF;
 IF actual IS DISTINCT FROM attester_before
 THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_ATTESTER_CHANGED' USING ERRCODE='P0001';END IF;
 -- La cadena tiene que estar sana antes de tocarla: una familia incompleta no se «arregla» acá.
 official_before:=public.own_run_official_family_v1();quantity_before:=public.own_run_quantity_family_v1();
 IF official_before->'complete' IS DISTINCT FROM 'true'::jsonb OR quantity_before->'complete' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_FAMILY_INCOMPLETE' USING ERRCODE='P0001';END IF;

 -- 1 · El control de formato de las cuatro funciones.
 FOR item IN SELECT * FROM (VALUES
  ('public.own_run_declared_adjustments_capture_v1(jsonb)','fb410904c8be5c4acd5bfe06c13d2a1f8f2038de8ab315166484a8497cb888a7','68b76c216d03e5f7cce3150ecd0c3e8da8293a6eb8930ddc8c860b8afec57e6a'),
  ('public.own_run_quantity_only_expected_inputs_v1(jsonb)','887fd9cbf6dc837d01e301fa7fc976a35c74e2100bad9a8229b929a3bd27185c','b60715a658c261d1a0e4216622f8067a42ed4ac8fb9f971d3b439a1467c0b089'),
  ('public.own_run_capped_sources_v1(jsonb)','726c30e656ec6df1b09d5233cee3ab2411d66ed6431a070ef312ee2481d45d46','8487b161e97dc2ca9f817342e42a988cf81b40f843f2d11da4d05017f7a0ca38'),
  ('public.own_run_monthly_forced_capture_check_candidate_v1(jsonb,jsonb,jsonb)','6fe602785285e15b70014f3d4df6a8f71a85b36323f243c9e93d3cc21aead2ef','b3cb243c0531c98b74637921fefbea9914e0cdded061814140c5a7d1a6d7bfc1')
 ) expected(signature,before_sha256,after_sha256) LOOP
  SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),
   (length(f.prosrc)-length(replace(f.prosrc,needle,'')))/length(needle)
  INTO definition,actual,occurrences FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF definition IS NULL OR actual IS DISTINCT FROM item.before_sha256 OR occurrences IS DISTINCT FROM 1
  OR (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1
  OR (length(attester_definition)-length(replace(attester_definition,item.before_sha256,'')))/64<>1
  OR position(item.after_sha256 IN attester_definition)<>0
  THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_PREIMAGE_CHANGED: %',item.signature USING ERRCODE='P0001';END IF;
  EXECUTE replace(definition,needle,replacement);
  SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF actual IS DISTINCT FROM item.after_sha256
  THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_RESULT: %',item.signature USING ERRCODE='P0001';END IF;
  attester_definition:=replace(attester_definition,item.before_sha256,item.after_sha256);
  changed:=changed||jsonb_build_object(item.before_sha256,item.after_sha256);
 END LOOP;

 -- 2 · El atestador fija las cuatro huellas nuevas.
 EXECUTE attester_definition;
 SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(attester);
 IF actual IS DISTINCT FROM attester_after
 THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_ATTESTER_RESULT' USING ERRCODE='P0001';END IF;
 changed:=changed||jsonb_build_object(attester_before,attester_after);

 -- 3 · Las dos familias fijan la huella nueva del atestador.
 FOR item IN SELECT * FROM (VALUES
  ('public.own_run_official_family_v1()','8db443e597714425d044ab42741a7a7a95b34e975eac6d2f368e659238785988','32f9fa070e99cf1a580d3ee53df9c555f21392d8c81fdf50c2685f6344590259'),
  ('public.own_run_quantity_family_v1()','47caee03f46b8eb6512c867f7d06b6aef67d2b0206507be58876f1ad7061a2e4','dbb087dd6828d612abd8b8a114dcf9942ff10bb064b39d55cdc97fc4de58339d')
 ) expected(signature,before_sha256,after_sha256) LOOP
  SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),
   (length(f.prosrc)-length(replace(f.prosrc,attester_before,'')))/64
  INTO definition,actual,occurrences FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF definition IS NULL OR actual IS DISTINCT FROM item.before_sha256 OR occurrences IS DISTINCT FROM 2
  OR (length(definition)-length(replace(definition,attester_before,'')))/64<>2
  THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_FAMILY_CHANGED: %',item.signature USING ERRCODE='P0001';END IF;
  EXECUTE replace(definition,attester_before,attester_after);
  SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF actual IS DISTINCT FROM item.after_sha256
  THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_FAMILY_RESULT: %',item.signature USING ERRCODE='P0001';END IF;
 END LOOP;

 -- 4 · Las familias siguen completas, con la misma versión y los mismos miembros. La lista de miembros
 --     es la identidad estable de la familia: sólo puede cambiar una huella que esta migración
 --     reemplazó, y por su valor exacto. En la práctica cambia una sola: la del atestador.
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
  THEN RAISE EXCEPTION 'OWN_RUN_ACTOR_PERSON_FORMAT_FAMILY_RESULT: %',item.kind USING ERRCODE='P0001';END IF;
 END LOOP;
END
$actor_person_format$;
