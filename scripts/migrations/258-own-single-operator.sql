-- 258 · Liquidación con aprobación propia y control posterior («operadora única»).
-- Autorizado por nota firmada el 25/11/2026 (solicita: Liquidación de Haberes; autoriza: Hugo Leucrini).
-- Esta migración crea el mecanismo y NO lo activa: sin una autorización vigente registrada nada cambia.
--  · own_single_operator_authorization: autorizaciones (persona, nota de respaldo, huella del PDF, responsable del
--    control posterior, vigencia). Sólo se agregan; se pueden revocar una vez; nunca se modifican ni se borran.
--  · own_single_operator_v1(ctx,preparó): verdadero sólo si quien decide ES quien preparó y tiene una autorización
--    vigente. Las demás condiciones de cada aprobación (permiso de aprobar, identidad verificada, versión, etc.) siguen
--    igual: la autorización sólo levanta la condición «otra persona».
--  · Se aplica a las entradas de la liquidación propia: novedades, novedades fijas, reglas del programa, escala
--    salarial, condiciones salariales, antigüedad, jornada, jornada del convenio, asignaciones familiares y participación.
--    No toca pagos, cuentas bancarias, contabilidad, presupuesto, legajos, licencias ni accesos.
--  · own_single_operator_report_v1: el resumen para el control posterior (todo lo aprobado por quien lo preparó).
-- Las huellas (sha256) que fijan las funciones cambiadas se actualizan en cadena, como en 255 y 256.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
CREATE TABLE public.own_single_operator_authorization(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id) ON DELETE RESTRICT,
 membership_id uuid NOT NULL REFERENCES public.tenant_membership(id) ON DELETE RESTRICT,
 operator_label text NOT NULL CHECK(length(operator_label) BETWEEN 3 AND 200),
 authorized_by text NOT NULL CHECK(length(authorized_by) BETWEEN 3 AND 200),
 reviewer text NOT NULL CHECK(length(reviewer) BETWEEN 3 AND 200),
 authorization_reference text NOT NULL CHECK(length(authorization_reference) BETWEEN 10 AND 500),
 document_sha256 text NOT NULL CHECK(document_sha256 ~ '^[0-9a-f]{64}$'),
 valid_from date NOT NULL,
 valid_until date NOT NULL CHECK(valid_until>=valid_from),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 revoked_reason text CHECK(revoked_reason IS NULL OR length(revoked_reason) BETWEEN 10 AND 500),
 CHECK((revoked_at IS NULL)=(revoked_reason IS NULL))
);
CREATE UNIQUE INDEX own_single_operator_one_active_uk ON public.own_single_operator_authorization(tenant_id,membership_id) WHERE revoked_at IS NULL;
REVOKE ALL ON public.own_single_operator_authorization FROM PUBLIC;

CREATE FUNCTION public.own_single_operator_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public','pg_temp' AS $g$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'OWN_SINGLE_OPERATOR_IMMUTABLE';END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
   OR (to_jsonb(NEW)-ARRAY['revoked_at','revoked_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revoked_at','revoked_reason'])
  THEN RAISE EXCEPTION 'OWN_SINGLE_OPERATOR_IMMUTABLE';END IF;
 END IF;
 RETURN NEW;
END $g$;
CREATE TRIGGER own_single_operator_guard BEFORE UPDATE OR DELETE ON public.own_single_operator_authorization
 FOR EACH ROW EXECUTE FUNCTION public.own_single_operator_guard_v1();

CREATE FUNCTION public.own_single_operator_v1(ctx jsonb, prepared_by uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $f$
 SELECT coalesce(prepared_by=(ctx->>'membershipId')::uuid AND EXISTS(
  SELECT 1 FROM public.own_single_operator_authorization a
  WHERE a.tenant_id=(ctx->>'tenantId')::uuid AND a.membership_id=prepared_by AND a.revoked_at IS NULL
    AND (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date BETWEEN a.valid_from AND a.valid_until),false)
$f$;
REVOKE ALL ON FUNCTION public.own_single_operator_v1(jsonb,uuid) FROM PUBLIC;

-- Resumen para el control posterior: decisiones tomadas por la misma membresía que preparó la propuesta.
CREATE FUNCTION public.own_single_operator_report_v1(p_tenant uuid, p_from date, p_to date) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog','public','pg_temp' AS $r$
DECLARE t record; part jsonb; result jsonb:='[]'::jsonb;
 labels constant jsonb:=jsonb_build_object('own_payroll_program_event','Reglas de liquidación','native_salary_event','Escala salarial',
  'own_salary_conditions_event','Condiciones salariales','own_salary_conditions_native_event','Condiciones salariales',
  'own_seniority_event','Antigüedad','own_working_time_event','Jornada','own_agreement_working_time_event','Jornada del convenio',
  'own_family_payroll_facts_event','Asignaciones familiares','own_participation_event','Participación del período');
BEGIN
 FOR t IN SELECT k FROM jsonb_object_keys(labels) k WHERE to_regclass('public.'||k) IS NOT NULL LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''area'',%L,''decision'',d.command,''decidedAt'',d.recorded_at,''decidedBy'',d.actor_label,''proposalId'',p.id,''reason'',d.body->>''reason'') ORDER BY d.recorded_at),''[]''::jsonb)
    FROM public.%I d JOIN public.%I p ON p.id=d.proposal_id
    WHERE d.tenant_id=$1 AND d.actor_membership_id=p.actor_membership_id AND d.recorded_at>=$2 AND d.recorded_at<($3+1)',labels->>t.k,t.k,t.k)
   INTO part USING p_tenant,p_from,p_to;
  result:=result||part;
 END LOOP;
 SELECT result||coalesce(jsonb_agg(jsonb_build_object('area','Novedades fijas','decision',d.payload->>'decision','decidedAt',d.occurred_at,'decidedBy',d.actor_email,'proposalId',p.id,'reason',d.payload->>'reason') ORDER BY d.occurred_at),'[]'::jsonb)
  INTO result FROM public.payroll_fixed_novelty_event d JOIN public.payroll_fixed_novelty_event p ON p.id=d.proposal_id
  WHERE d.tenant_id=p_tenant AND d.actor_membership_id=p.actor_membership_id AND d.occurred_at>=p_from AND d.occurred_at<(p_to+1);
 RETURN jsonb_build_object('version','own-single-operator-report.v1','tenantId',p_tenant,'from',p_from,'to',p_to,
  'authorizations',(SELECT coalesce(jsonb_agg(jsonb_build_object('operator',a.operator_label,'authorizedBy',a.authorized_by,'reviewer',a.reviewer,
     'reference',a.authorization_reference,'documentSha256',a.document_sha256,'validFrom',a.valid_from,'validUntil',a.valid_until,'revokedAt',a.revoked_at) ORDER BY a.recorded_at),'[]'::jsonb)
   FROM public.own_single_operator_authorization a WHERE a.tenant_id=p_tenant),
  'count',jsonb_array_length(result),'decisions',result);
END $r$;
REVOKE ALL ON FUNCTION public.own_single_operator_report_v1(uuid,date,date) FROM PUBLIC;

DO $m258$
DECLARE
 same constant text := 'AND e.actor_membership_id<>(ctx->>''membershipId'')::uuid AND e.actor_person_id<>(ctx->>''actorPersonId'')::uuid AND e.actor_email<>ctx->>''actorEmail''';
 same_new constant text := 'AND((e.actor_membership_id<>(ctx->>''membershipId'')::uuid AND e.actor_person_id<>(ctx->>''actorPersonId'')::uuid AND e.actor_email<>ctx->>''actorEmail'') OR public.own_single_operator_v1(ctx,e.actor_membership_id))';
 summaries constant text[] := ARRAY['public.own_program_proposal_v1(jsonb,own_payroll_program_event)','public.native_salary_proposal_v1(jsonb,native_salary_event)',
  'public.own_seniority_summary_v1(jsonb,own_seniority_event)','public.own_working_time_summary_v1(jsonb,own_working_time_event)',
  'public.own_participation_summary_v1(jsonb,own_participation_event)','public.own_family_payroll_facts_summary_v1(jsonb,own_family_payroll_facts_event)',
  'public.own_salary_conditions_native_summary_v2(jsonb,own_salary_conditions_native_event)','public.own_salary_conditions_summary_v1(jsonb,own_salary_conditions_event)',
  'public.own_agreement_working_time_summary_v1(jsonb,own_agreement_working_time_event)'];
 edits jsonb := '[]'::jsonb; ed jsonb; fn text; defs jsonb := '{}'::jsonb; def text; before text; after text; changed jsonb := '{}'::jsonb;
 f record; k text; pass int := 0; touched int; cnt int;
BEGIN
 FOREACH fn IN ARRAY summaries LOOP edits:=edits||jsonb_build_array(jsonb_build_object('fn',fn,'needle',same,'replacement',same_new));END LOOP;
 edits:=edits||jsonb_build_array(
  jsonb_build_object('fn','public.payroll_fixed_registry_proposal_json_v1(jsonb,payroll_fixed_novelty_event,boolean)',
   'needle','AND item.actor_membership_id<>(ctx->>''membershipId'')::uuid AND item.actor_person_id<>(ctx->>''actorPersonId'')::uuid AND item.actor_email<>ctx->>''actorEmail'';',
   'replacement','AND((item.actor_membership_id<>(ctx->>''membershipId'')::uuid AND item.actor_person_id<>(ctx->>''actorPersonId'')::uuid AND item.actor_email<>ctx->>''actorEmail'') OR public.own_single_operator_v1(ctx,item.actor_membership_id));'),
  jsonb_build_object('fn','public.payroll_fixed_registry_review_v1(jsonb,jsonb,uuid)',
   'needle','IF proposal_row.actor_membership_id=(ctx->>''membershipId'')::uuid OR proposal_row.actor_person_id=(ctx->>''actorPersonId'')::uuid OR proposal_row.actor_email=ctx->>''actorEmail'' THEN RAISE EXCEPTION ''PAYROLL_FIXED_MAKER_CHECKER_REQUIRED'';',
   'replacement','IF (proposal_row.actor_membership_id=(ctx->>''membershipId'')::uuid OR proposal_row.actor_person_id=(ctx->>''actorPersonId'')::uuid OR proposal_row.actor_email=ctx->>''actorEmail'') AND NOT public.own_single_operator_v1(ctx,proposal_row.actor_membership_id) THEN RAISE EXCEPTION ''PAYROLL_FIXED_MAKER_CHECKER_REQUIRED'';'),
  jsonb_build_object('fn','public.own_novelty_command_v1(jsonb,jsonb,uuid)',
   'needle','IF command_value IN(''approve'',''reject'') AND(e.snapshot#>>''{preparedBy,personId}''=ctx->>''actorPersonId'' OR e.snapshot#>>''{preparedBy,membershipId}''=ctx->>''membershipId'') THEN RAISE EXCEPTION ''OWN_NOVELTY_INDEPENDENT_REQUIRED'';',
   'replacement','IF command_value IN(''approve'',''reject'') AND(e.snapshot#>>''{preparedBy,personId}''=ctx->>''actorPersonId'' OR e.snapshot#>>''{preparedBy,membershipId}''=ctx->>''membershipId'') AND NOT public.own_single_operator_v1(ctx,(e.snapshot#>>''{preparedBy,membershipId}'')::uuid) THEN RAISE EXCEPTION ''OWN_NOVELTY_INDEPENDENT_REQUIRED'';')
 );
 FOR ed IN SELECT value FROM jsonb_array_elements(edits) LOOP
  fn:=ed->>'fn';
  IF NOT defs ? fn THEN
   SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
   IF def IS NULL THEN RAISE EXCEPTION 'M258_FUNCTION_MISSING: %',fn;END IF;
   IF position('own_single_operator_v1' IN def)>0 THEN RAISE EXCEPTION 'M258_ALREADY_INSTALLED: %',fn;END IF;
   defs:=defs||jsonb_build_object(fn,def);
  END IF;
  def:=defs->>fn;
  cnt:=(length(def)-length(replace(def,ed->>'needle','')))/length(ed->>'needle');
  IF cnt<>1 THEN RAISE EXCEPTION 'M258_NEEDLE (%): % veces en %',left(ed->>'needle',60),cnt,fn;END IF;
  defs:=jsonb_set(defs,ARRAY[fn],to_jsonb(replace(def,ed->>'needle',ed->>'replacement')));
 END LOOP;
 FOR fn IN SELECT jsonb_object_keys(defs) LOOP
  SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO before FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
  EXECUTE defs->>fn;
  SELECT encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') INTO after FROM pg_proc p WHERE p.oid=to_regprocedure(fn);
  changed:=changed||jsonb_build_object(before,after);
 END LOOP;
 LOOP
  pass:=pass+1; touched:=0;
  IF pass>12 THEN RAISE EXCEPTION 'M258_PIN_CHAIN_TOO_LONG';END IF;
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
 RAISE NOTICE 'M258 funciones con aprobación propia: %, huellas actualizadas: %',(SELECT count(*) FROM jsonb_object_keys(defs)),(SELECT count(*) FROM jsonb_object_keys(changed));
END
$m258$;
