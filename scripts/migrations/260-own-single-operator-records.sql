-- 260 · La operación propia de Liquidación y Tesorería alcanza también los legajos (nota v2).
-- Respaldo: «Nota v2: Liquidación y Tesorería con operación propia y control posterior», 25/11/2026. Solicita: Miriam
-- Noelia Scerca (contadora, Liquidación de Haberes y Tesorería). Autoriza y realiza el control posterior: Hugo Leucrini
-- (firma electrónica «Hugo Leucrini · HL»; el cargo quedó sin completar en la nota). Reemplaza a la nota del 25/11/2026.
--  · Las aprobaciones de legajos (cambios de encuadre, altas, bajas y reingresos, anulación de altas y catálogo de
--    encuadres) aceptan que decida quien preparó cuando tiene autorización vigente, con las mismas demás condiciones.
--  · La autorización de la nota anterior se revoca (queda en el historial) y se registra la nueva con su huella.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $m260$
DECLARE
 same constant text := 'p.actor_membership_id<>(ctx->>''membershipId'')::uuid AND p.actor_person_id<>(ctx->>''actorPersonId'')::uuid AND p.actor_email<>ctx->>''actorEmail''';
 same_new constant text := '((p.actor_membership_id<>(ctx->>''membershipId'')::uuid AND p.actor_person_id<>(ctx->>''actorPersonId'')::uuid AND p.actor_email<>ctx->>''actorEmail'') OR public.own_single_operator_v1(ctx,p.actor_membership_id))';
 fns constant text[] := ARRAY['public.native_employment_change_can_review_v1(jsonb,native_employment_change_proposal)',
  'public.native_employment_lifecycle_can_review_v1(jsonb,native_employment_lifecycle_proposal)',
  'public.native_employment_void_can_review_v1(jsonb,native_employment_void_proposal)',
  'public.native_employment_catalog_can_review_v1(jsonb,native_employment_catalog_proposal)'];
 fn text; def text; before text; after text; changed jsonb := '{}'::jsonb; f record; k text; pass int := 0; touched int; cnt int;
 member public.tenant_membership%ROWTYPE;
BEGIN
 IF to_regprocedure('public.own_single_operator_v1(jsonb,uuid)') IS NULL THEN RAISE EXCEPTION 'M260_REQUIRES_258';END IF;
 FOREACH fn IN ARRAY fns LOOP
  SELECT pg_get_functiondef(p.oid),encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO def,before FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
  IF def IS NULL THEN RAISE EXCEPTION 'M260_FUNCTION_MISSING: %',fn;END IF;
  IF position('own_single_operator_v1' IN def)>0 THEN RAISE EXCEPTION 'M260_ALREADY_INSTALLED: %',fn;END IF;
  cnt:=(length(def)-length(replace(def,same,'')))/length(same);
  IF cnt<>1 THEN RAISE EXCEPTION 'M260_NEEDLE: % veces en %',cnt,fn;END IF;
  EXECUTE replace(def,same,same_new);
  SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO after FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
  changed:=changed||jsonb_build_object(before,after);
 END LOOP;
 LOOP
  pass:=pass+1; touched:=0;
  IF pass>12 THEN RAISE EXCEPTION 'M260_PIN_CHAIN_TOO_LONG';END IF;
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

 SELECT * INTO member FROM public.tenant_membership m WHERE lower(m.user_email)='noelia@junin.com' AND m.status='active';
 IF NOT FOUND THEN RAISE EXCEPTION 'M260_MEMBERSHIP_NOT_FOUND';END IF;
 UPDATE public.own_single_operator_authorization SET revoked_at=clock_timestamp(),
  revoked_reason='Reemplazada por la nota v2 del 25/11/2026 (incluye legajos, cierre, recibos y pagos).'
  WHERE tenant_id=member.tenant_id AND membership_id=member.id AND revoked_at IS NULL;
 INSERT INTO public.own_single_operator_authorization(tenant_id,membership_id,operator_label,authorized_by,reviewer,
  authorization_reference,document_sha256,valid_from,valid_until)
 VALUES(member.tenant_id,member.id,'Miriam Noelia Scerca · Contadora, Liquidación de Haberes y Tesorería','Hugo Leucrini','Hugo Leucrini',
  'Nota v2 «Liquidación y Tesorería con operación propia y control posterior», 25/11/2026: legajos, entradas, liquidación, cierre, recibos y pagos. Firma electrónica de Hugo Leucrini (HL); cargo sin completar.',
  'cdc70ce3f5fb018bdd7953bf5a3cbf968e34d922c582a4d997848c1a5fb857c3','2026-11-25','2027-03-31');
 RAISE NOTICE 'M260 legajos con operación propia: % funciones, % huellas; autorización v2 registrada',array_length(fns,1),(SELECT count(*) FROM jsonb_object_keys(changed));
END
$m260$;
