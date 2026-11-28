-- 244 · Declaración municipal de vigencia de área para contratos adoptados.
-- attendance_area_history_v1 acredita el área de un contrato sólo desde su alta nativa. Un contrato
-- adoptado desde GRH conserva la procedencia de la adopción, que prueba la titularidad pero no desde
-- qué día pertenece a un área: v1 responde AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED.
-- Esta migración agrega la fuente explícita que el diseño pedía («otro contrato versionado»):
--   · una persona prepara la declaración (fecha desde la que rige y referencia documental);
--   · otra persona la aprueba; el servidor sella la lista de contratos, la revisión de su cadena de
--     rectificaciones y el área de cada legajo en ese momento;
--   · attendance_area_history_v2 resuelve un contrato adoptado sólo desde la fecha declarada, sólo
--     con la última declaración aprobada que lo incluye y sólo si el área no cambió después.
-- No infiere nada hacia atrás: los días anteriores a la fecha declarada siguen sin acreditar.
-- No concede capacidades, roles ni alcances. Autoridad: employee.record.propose / .approve vigentes.
-- Los contratos con alta nativa siguen resolviéndose por v1, sin cambio de respuesta.
-- Archivo sin BEGIN/COMMIT: se instala dentro de una única transacción revisada.
DO $prerequisite$
BEGIN
  IF to_regprocedure('public.attendance_area_history_v1(jsonb,uuid,date,date)') IS NULL
    OR to_regprocedure('public.attendance_area_history_area_v1(jsonb)') IS NULL
    OR to_regprocedure('public.attendance_area_history_guards_v1()') IS NULL
    OR to_regprocedure('public.attendance_area_population_v1(jsonb,jsonb,date,date)') IS NULL
    OR to_regprocedure('public.attendance_area_workdays_read_v1(jsonb,jsonb)') IS NULL
    OR to_regprocedure('public.attendance_expected_devices_effective_v1(jsonb,uuid,date)') IS NULL
    OR to_regprocedure('public.attendance_expected_devices_subject_v1(jsonb,uuid,jsonb,date,date)') IS NULL
    OR to_regprocedure('public.attendance_gateway_assert_session_v1(text,uuid,integer,text,uuid,uuid)') IS NULL
    OR to_regprocedure('public.tenant_iam_effective_capabilities(uuid)') IS NULL
    OR to_regprocedure('public.tenant_iam_assert_no_sod_conflict(uuid)') IS NULL
    OR to_regprocedure('public.time_catalog_native_actor_v2(uuid,uuid,uuid)') IS NULL
    OR to_regprocedure('public.reject_immutable_source_change()') IS NULL
    OR to_regclass('public.employment_adoption_application') IS NULL
    OR to_regclass('public.employment_adoption_decision') IS NULL
    OR to_regclass('public.native_employee_registration') IS NULL
    OR to_regclass('public.native_employment_change_review') IS NULL
    OR to_regclass('public.native_employment_lifecycle_review') IS NULL
    OR to_regclass('public.native_employment_void_review') IS NULL
    OR to_regrole('municontrol_actions_runtime_app') IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key='employee.record.propose')
    OR NOT EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key='employee.record.approve') THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_PREREQUISITE';
  END IF;
  IF to_regclass('public.attendance_area_effectivity_proposal') IS NOT NULL
    OR to_regprocedure('public.attendance_area_history_v2(jsonb,uuid,date,date)') IS NOT NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_ALREADY_INSTALLED';
  END IF;
END
$prerequisite$;

-- La cabecera no guarda nombres ni legajos: sólo la fecha, la referencia documental, los totales y
-- las huellas. La lista sellada vive en attendance_area_effectivity_item.
CREATE TABLE public.attendance_area_effectivity_proposal(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 source_binding_id uuid NOT NULL,
 company_id bigint NOT NULL,
 effective_from date NOT NULL CHECK(effective_from BETWEEN DATE '1900-01-01' AND DATE '2099-12-31'),
 scope text NOT NULL CHECK(scope IN('all','missing')),
 authorization_reference text NOT NULL CHECK(length(authorization_reference) BETWEEN 10 AND 500
  AND authorization_reference=btrim(authorization_reference) AND authorization_reference!~'[<>[:cntrl:]]'),
 item_count integer NOT NULL CHECK(item_count BETWEEN 1 AND 5000),
 items_sha256 text NOT NULL CHECK(items_sha256~'^[a-f0-9]{64}$'),
 excluded jsonb NOT NULL CHECK(jsonb_typeof(excluded)='object'),
 proposal_sha256 text NOT NULL CHECK(proposal_sha256~'^[a-f0-9]{64}$'),
 actor_membership_id uuid NOT NULL,
 actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),
 actor_session_id uuid NOT NULL,
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 request_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id)
);
CREATE TABLE public.attendance_area_effectivity_item(
 proposal_id uuid NOT NULL REFERENCES public.attendance_area_effectivity_proposal(id),
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id),
 change_revision integer NOT NULL CHECK(change_revision BETWEEN 0 AND 100),
 organization_unit_source_id text NOT NULL CHECK(organization_unit_source_id~'^(0|[1-9][0-9]{0,18})$'),
 sector_source_id text CHECK(sector_source_id IS NULL OR sector_source_id~'^(0|[1-9][0-9]{0,18})$'),
 organization_name text NOT NULL CHECK(length(organization_name) BETWEEN 1 AND 160),
 sector_name text CHECK(sector_name IS NULL OR length(sector_name) BETWEEN 1 AND 160),
 CHECK((sector_source_id IS NULL)=(sector_name IS NULL)),
 PRIMARY KEY(proposal_id,contract_id)
);
CREATE INDEX attendance_area_effectivity_item_contract_v1 ON public.attendance_area_effectivity_item(contract_id);
CREATE TABLE public.attendance_area_effectivity_review(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 proposal_id uuid NOT NULL UNIQUE REFERENCES public.attendance_area_effectivity_proposal(id),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 source_binding_id uuid NOT NULL,
 decision text NOT NULL CHECK(decision IN('approve','reject')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000 AND reason=btrim(reason) AND reason!~'[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL,
 actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),
 actor_session_id uuid NOT NULL,
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 request_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id)
);
CREATE INDEX attendance_area_effectivity_review_cut_v1 ON public.attendance_area_effectivity_review(tenant_id,source_binding_id,reviewed_at DESC);

-- Una aprobación nunca es de quien preparó: se compara membresía, persona y correo. Un rechazo sí
-- puede ser del autor (retira su propia preparación). La regla vive en la tabla, no sólo en la fachada.
CREATE FUNCTION public.attendance_area_effectivity_review_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $review_guard$
DECLARE q public.attendance_area_effectivity_proposal;
BEGIN
 SELECT * INTO q FROM public.attendance_area_effectivity_proposal WHERE id=NEW.proposal_id;
 IF NOT FOUND OR NEW.tenant_id IS DISTINCT FROM q.tenant_id OR NEW.source_binding_id IS DISTINCT FROM q.source_binding_id
 OR NEW.reviewed_at<q.created_at
 OR (NEW.decision='approve' AND (NEW.actor_membership_id=q.actor_membership_id OR NEW.actor_person_id=q.actor_person_id
  OR NEW.actor_email=q.actor_email))
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_REVIEW_INVALID' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $review_guard$;
CREATE FUNCTION public.attendance_area_effectivity_item_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $item_guard$
DECLARE q public.attendance_area_effectivity_proposal;
BEGIN
 -- La lista se completa al nacer la cabecera: nunca supera el total sellado ni cambia tras una decisión.
 SELECT * INTO q FROM public.attendance_area_effectivity_proposal WHERE id=NEW.proposal_id;
 IF NOT FOUND OR EXISTS(SELECT 1 FROM public.attendance_area_effectivity_review r WHERE r.proposal_id=NEW.proposal_id)
 OR (SELECT count(*) FROM public.attendance_area_effectivity_item i WHERE i.proposal_id=NEW.proposal_id)>=q.item_count
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_ITEM_INVALID' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $item_guard$;
CREATE TRIGGER attendance_area_effectivity_review_guard BEFORE INSERT ON public.attendance_area_effectivity_review
 FOR EACH ROW EXECUTE FUNCTION public.attendance_area_effectivity_review_guard_v1();
CREATE TRIGGER attendance_area_effectivity_item_guard BEFORE INSERT ON public.attendance_area_effectivity_item
 FOR EACH ROW EXECUTE FUNCTION public.attendance_area_effectivity_item_guard_v1();
CREATE TRIGGER attendance_area_effectivity_proposal_immutable BEFORE UPDATE OR DELETE ON public.attendance_area_effectivity_proposal
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER attendance_area_effectivity_proposal_no_truncate BEFORE TRUNCATE ON public.attendance_area_effectivity_proposal
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER attendance_area_effectivity_item_immutable BEFORE UPDATE OR DELETE ON public.attendance_area_effectivity_item
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER attendance_area_effectivity_item_no_truncate BEFORE TRUNCATE ON public.attendance_area_effectivity_item
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER attendance_area_effectivity_review_immutable BEFORE UPDATE OR DELETE ON public.attendance_area_effectivity_review
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER attendance_area_effectivity_review_no_truncate BEFORE TRUNCATE ON public.attendance_area_effectivity_review
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
ALTER TABLE public.attendance_area_effectivity_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_area_effectivity_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_area_effectivity_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_area_effectivity_proposal,public.attendance_area_effectivity_item,
 public.attendance_area_effectivity_review FROM PUBLIC,municontrol_actions_runtime_app;

-- Guardas: las de v1 más los cuerpos originales de la adopción (132/133), sus disparadores, los de la
-- anulación (224) y los de estas tablas. Si una composición los cambia, el lector bloquea.
CREATE FUNCTION public.attendance_area_effectivity_guards_v1() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $guards$
 SELECT public.attendance_area_history_guards_v1() IS TRUE
 AND NOT EXISTS(
  SELECT 1 FROM (VALUES
   ('public.employment_adoption_immutable_v1()','67903bc23d2dec0c530c4643bd042edb11ba00d54da2c7dac8bd8161520b41bf'),
   ('public.employment_adoption_update_allowed_v1(public.employment_contract,public.employment_contract)','4cf6d63e46d2c64748cc0dfa29969d13c537ae2cc53a59566faed646611ca2ac'),
   ('public.employment_adoption_application_guard_v1()','9b8ce3370b074843bc7e95866e4cbf28a89ba289cf16dbf1fe18ea0119bf5b3c'),
   ('public.employment_adoption_application_before_v1()','0eb74e4b884d033bd4bf9f2bca62cbcadfeac9bc87bb1e574a182378ab6b01f6')
  ) expected(signature,sha256)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
  WHERE p.oid IS NULL OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') IS DISTINCT FROM expected.sha256)
 AND NOT EXISTS(
  SELECT 1 FROM (VALUES
   ('public.employment_adoption_application','employment_adoption_application_applied','public.employment_adoption_application_guard_v1()',5),
   ('public.employment_adoption_application','employment_adoption_application_before','public.employment_adoption_application_before_v1()',7),
   ('public.employment_adoption_application','employment_adoption_application_immutable','public.employment_adoption_immutable_v1()',58),
   ('public.employment_adoption_decision','employment_adoption_decision_immutable','public.employment_adoption_immutable_v1()',58),
   ('public.native_employment_void_review','native_employment_void_review_immutable','public.native_employment_void_immutable_v1()',58),
   ('public.attendance_area_effectivity_proposal','attendance_area_effectivity_proposal_immutable','public.reject_immutable_source_change()',27),
   ('public.attendance_area_effectivity_proposal','attendance_area_effectivity_proposal_no_truncate','public.reject_immutable_source_change()',34),
   ('public.attendance_area_effectivity_item','attendance_area_effectivity_item_guard','public.attendance_area_effectivity_item_guard_v1()',7),
   ('public.attendance_area_effectivity_item','attendance_area_effectivity_item_immutable','public.reject_immutable_source_change()',27),
   ('public.attendance_area_effectivity_item','attendance_area_effectivity_item_no_truncate','public.reject_immutable_source_change()',34),
   ('public.attendance_area_effectivity_review','attendance_area_effectivity_review_guard','public.attendance_area_effectivity_review_guard_v1()',7),
   ('public.attendance_area_effectivity_review','attendance_area_effectivity_review_immutable','public.reject_immutable_source_change()',27),
   ('public.attendance_area_effectivity_review','attendance_area_effectivity_review_no_truncate','public.reject_immutable_source_change()',34)
  ) expected(relation_name,trigger_name,signature,trigger_type)
  LEFT JOIN pg_trigger t ON t.tgrelid=to_regclass(expected.relation_name) AND t.tgname=expected.trigger_name
  WHERE t.oid IS NULL OR t.tgenabled NOT IN('O','A') OR t.tgfoid IS DISTINCT FROM to_regprocedure(expected.signature)
   OR t.tgtype<>expected.trigger_type OR t.tgqual IS NOT NULL OR t.tgnargs<>0)
$guards$;

-- INTERNA. Recorre la cadena completa de un contrato adoptado: ancla de la adopción (imagen
-- posterior aprobada), rectificaciones aprobadas contiguas hasta la fila canónica y ciclo laboral.
-- Devuelve el área de cada revisión (null si el legajo no la tiene completa) y los intervalos activos.
-- No autentica: ctx viene de una fachada autenticada.
CREATE FUNCTION public.attendance_area_effectivity_chain_v1(ctx jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $chain$
DECLARE c public.employment_contract;n public.native_employee_registration;
 a public.employment_adoption_application;d public.employment_adoption_decision;
 change_row public.native_employment_change_review;change_proposal public.native_employment_change_proposal;
 life_row public.native_employment_lifecycle_review;life_proposal public.native_employment_lifecycle_proposal;
 previous_snapshot jsonb;areas jsonb;active_intervals jsonb;expected_intervals jsonb;last_interval jsonb;
 change_ids jsonb:='[]'::jsonb;life_ids jsonb:='[]'::jsonb;chain_evidence jsonb:='[]'::jsonb;life_evidence jsonb:='[]'::jsonb;
 change_count integer;life_count integer;revision_value integer;interval_count integer;
BEGIN
 IF ctx IS NULL OR jsonb_typeof(ctx)<>'object' OR target IS NULL
 OR ctx->>'tenantId' IS NULL OR NOT pg_input_is_valid(ctx->>'tenantId','uuid')
 OR ctx->>'sourceBindingId' IS NULL OR NOT pg_input_is_valid(ctx->>'sourceBindingId','uuid')
 OR ctx->>'sourceCompanyId' IS NULL OR ctx->>'sourceCompanyId'!~'^(0|[1-9][0-9]{0,18})$'
 OR NOT pg_input_is_valid(ctx->>'sourceCompanyId','bigint') OR ctx->>'sourceDatabase' IS NULL
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_INPUT_INVALID' USING ERRCODE='P0001';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.platform_tenant_source_binding b JOIN public.platform_tenant t ON t.id=b.tenant_id AND t.status='active'
  WHERE b.id=(ctx->>'sourceBindingId')::uuid AND b.tenant_id=(ctx->>'tenantId')::uuid AND b.verified
   AND b.source_company_id=(ctx->>'sourceCompanyId')::bigint AND b.source_database=ctx->>'sourceDatabase')
 THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_SCOPE_MISMATCH');END IF;
 SELECT * INTO c FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(ctx->>'tenantId')::uuid
  AND ec.legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED');END IF;
 SELECT * INTO a FROM public.employment_adoption_application x WHERE x.contract_id=target;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_NOT_ADOPTED');END IF;
 SELECT * INTO d FROM public.employment_adoption_decision x WHERE x.id=a.decision_id AND x.decision='approve'
  AND x.applied_xid=a.applied_xid AND x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_REGISTRATION_UNPROVEN');END IF;
 SELECT * INTO n FROM public.native_employee_registration r WHERE r.id=a.registration_id AND r.contract_id=target
  AND r.person_id=c.person_id AND r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND OR c.source_payload#>>'{native,origin}' IS DISTINCT FROM 'GRH'
 OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM n.id::text
 OR c.source_payload#>>'{native,adoptionProposalId}' IS DISTINCT FROM d.proposal_id::text
 OR c.source_payload#>>'{native,adoptionReviewId}' IS DISTINCT FROM d.id::text
 OR a.after_contract->>'id' IS DISTINCT FROM target::text
 OR a.after_contract->>'tenant_id' IS DISTINCT FROM n.tenant_id::text
 OR a.after_contract->>'person_id' IS DISTINCT FROM n.person_id::text
 OR a.after_contract#>>'{source_payload,native,registrationId}' IS DISTINCT FROM n.id::text
 OR a.after_contract->>'source_system' IS DISTINCT FROM 'MUNICONTROL'
 OR a.after_contract->'source_batch_id' IS DISTINCT FROM 'null'::jsonb
 OR c.start_date IS NULL OR c.start_date NOT BETWEEN DATE '1900-01-01' AND DATE '2099-12-31'
 OR(c.end_date IS NOT NULL AND(c.end_date<c.start_date OR c.end_date>DATE '2099-12-31'))
 OR public.attendance_area_effectivity_guards_v1() IS NOT TRUE
 THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_REGISTRATION_UNPROVEN');END IF;
 -- La anulación 224 niega el alta misma; no es una baja con fecha.
 IF EXISTS(SELECT 1 FROM public.native_employment_void_review r WHERE r.contract_id=target AND r.decision='approve')
 THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_WITHDRAWN');END IF;
 IF c.status IS NULL OR c.status NOT IN('active','inactive') OR(c.status='inactive' AND c.end_date IS NULL)
 THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_REGISTRATION_UNPROVEN');END IF;

 SELECT count(*) INTO change_count FROM public.native_employment_change_review r
  WHERE r.contract_id=target AND r.decision='approve';
 SELECT count(*) INTO life_count FROM public.native_employment_lifecycle_review r
  WHERE r.contract_id=target AND r.decision='approve';
 IF change_count>100 OR life_count>100 THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_INCOMPLETE');END IF;
 previous_snapshot:=a.after_contract;
 areas:=jsonb_build_array(public.attendance_area_history_area_v1(previous_snapshot));
 revision_value:=0;
 FOR change_row IN SELECT r.* FROM public.native_employment_change_review r WHERE r.contract_id=target AND r.decision='approve' ORDER BY r.revision LOOP
  revision_value:=revision_value+1;
  SELECT * INTO change_proposal FROM public.native_employment_change_proposal p WHERE p.id=change_row.proposal_id;
  IF NOT FOUND OR change_row.revision<>revision_value OR change_proposal.base_revision<>revision_value-1
  OR change_row.tenant_id<>n.tenant_id OR change_row.source_binding_id<>n.source_binding_id
  OR change_proposal.tenant_id<>n.tenant_id OR change_proposal.source_binding_id<>n.source_binding_id
  OR change_proposal.contract_id<>target OR change_proposal.registration_id<>n.id
  OR change_row.applied_xid IS NULL OR change_row.actor_membership_id=change_proposal.actor_membership_id
  OR change_row.actor_person_id=change_proposal.actor_person_id OR change_row.actor_email=change_proposal.actor_email
  OR change_row.before_contract IS DISTINCT FROM change_proposal.before_contract
  OR change_row.after_contract IS DISTINCT FROM change_proposal.after_contract
  OR change_row.before_contract IS DISTINCT FROM previous_snapshot
  OR(change_row.before_contract-ARRAY['agreement_code','category_code','organization_unit_source_id','sector_source_id','source_payload'])
   IS DISTINCT FROM(change_row.after_contract-ARRAY['agreement_code','category_code','organization_unit_source_id','sector_source_id','source_payload'])
  OR((change_row.before_contract->'source_payload')-'employment') IS DISTINCT FROM((change_row.after_contract->'source_payload')-'employment')
  THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_CHAIN_INVALID');END IF;
  areas:=areas||jsonb_build_array(public.attendance_area_history_area_v1(change_row.after_contract));
  change_ids:=change_ids||jsonb_build_array(change_row.id);
  chain_evidence:=chain_evidence||jsonb_build_array(jsonb_build_object('proposalId',change_proposal.id,'approvalId',change_row.id,
   'revision',change_row.revision,'proposalSha256',change_proposal.request_sha256,'reviewSha256',change_row.request_sha256,
   'reviewedAt',change_row.reviewed_at,'employmentVersion',change_row.employment_version,
   'beforeSha256',encode(sha256(convert_to(change_row.before_contract::text,'UTF8')),'hex'),
   'afterSha256',encode(sha256(convert_to(change_row.after_contract::text,'UTF8')),'hex')));
  previous_snapshot:=change_row.after_contract;
 END LOOP;
 IF revision_value<>change_count OR previous_snapshot IS DISTINCT FROM to_jsonb(c)
 THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_CHAIN_INVALID');END IF;

 active_intervals:=jsonb_build_array(jsonb_build_object('startDate',to_char(c.start_date,'YYYY-MM-DD'),
  'endDate',CASE WHEN c.end_date IS NULL THEN NULL ELSE to_char(c.end_date,'YYYY-MM-DD') END));
 revision_value:=0;
 FOR life_row IN SELECT r.* FROM public.native_employment_lifecycle_review r WHERE r.contract_id=target AND r.decision='approve' ORDER BY r.revision LOOP
  revision_value:=revision_value+1;
  SELECT * INTO life_proposal FROM public.native_employment_lifecycle_proposal p WHERE p.id=life_row.proposal_id;
  IF NOT FOUND OR life_row.revision<>revision_value OR life_proposal.base_revision<>revision_value-1
  OR life_row.tenant_id<>n.tenant_id OR life_row.source_binding_id<>n.source_binding_id
  OR life_proposal.tenant_id<>n.tenant_id OR life_proposal.source_binding_id<>n.source_binding_id
  OR life_proposal.contract_id<>target OR life_proposal.registration_id<>n.id OR life_row.applied_xid IS NULL
  OR life_row.actor_membership_id=life_proposal.actor_membership_id OR life_row.actor_person_id=life_proposal.actor_person_id
  OR life_row.actor_email=life_proposal.actor_email OR life_row.before_contract IS DISTINCT FROM life_proposal.before_contract
  OR life_row.after_contract IS DISTINCT FROM life_proposal.after_contract
  OR life_row.before_contract->'intervals' IS DISTINCT FROM active_intervals
  OR(life_row.before_contract-'intervals') IS DISTINCT FROM(life_row.after_contract-'intervals')
  OR life_row.before_contract#>>'{contract,id}' IS DISTINCT FROM target::text
  OR life_row.before_contract#>>'{contract,tenant_id}' IS DISTINCT FROM n.tenant_id::text
  OR life_row.before_contract#>>'{contract,source_payload,native,registrationId}' IS DISTINCT FROM n.id::text
  THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_LIFECYCLE_INVALID');END IF;
  interval_count:=jsonb_array_length(active_intervals);last_interval:=active_intervals->(interval_count-1);
  IF life_proposal.movement='terminate' THEN
   IF last_interval->>'endDate' IS NOT NULL OR life_proposal.movement_date<(last_interval->>'startDate')::date
   THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_LIFECYCLE_INVALID');END IF;
   expected_intervals:=jsonb_set(active_intervals,ARRAY[(interval_count-1)::text,'endDate'],to_jsonb(to_char(life_proposal.movement_date,'YYYY-MM-DD')),false);
  ELSIF life_proposal.movement='reenter' THEN
   IF last_interval->>'endDate' IS NULL OR life_proposal.movement_date<=(last_interval->>'endDate')::date OR interval_count>=51
   THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_LIFECYCLE_INVALID');END IF;
   expected_intervals:=active_intervals||jsonb_build_array(jsonb_build_object('startDate',to_char(life_proposal.movement_date,'YYYY-MM-DD'),'endDate',NULL));
  ELSE RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_LIFECYCLE_INVALID');END IF;
  IF life_row.after_contract->'intervals' IS DISTINCT FROM expected_intervals
  THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_LIFECYCLE_INVALID');END IF;
  active_intervals:=expected_intervals;life_ids:=life_ids||jsonb_build_array(life_row.id);
  life_evidence:=life_evidence||jsonb_build_array(jsonb_build_object('proposalId',life_proposal.id,'approvalId',life_row.id,
   'revision',life_row.revision,'proposalSha256',life_proposal.request_sha256,'reviewSha256',life_row.request_sha256,
   'reviewedAt',life_row.reviewed_at,'movement',life_proposal.movement,'movementDate',life_proposal.movement_date,
   'employmentVersion',life_row.employment_version,'intervals',active_intervals));
 END LOOP;
 IF revision_value<>life_count THEN RETURN jsonb_build_object('status','blocked','reason','AREA_HISTORY_LIFECYCLE_INVALID');END IF;
 RETURN jsonb_build_object('status','proven','reason',NULL,'contractStatus',c.status,'changeRevision',change_count,
  'areas',areas,'intervals',active_intervals,'startDate',c.start_date,'endDate',c.end_date,
  'registration',jsonb_build_object('id',n.id,'requestSha256',n.request_sha256,'catalogSha256',n.catalog_sha256,'createdAt',n.created_at),
  'adoption',jsonb_build_object('proposalId',d.proposal_id,'decisionId',d.id,
   'afterSha256',encode(sha256(convert_to(a.after_contract::text,'UTF8')),'hex')),
  'changeIds',change_ids,'lifecycleIds',life_ids,'changes',chain_evidence,'lifecycle',life_evidence);
END $chain$;

-- INTERNA. Última declaración aprobada que incluye al contrato y si sigue describiendo su cadena:
-- valid (el área sellada sigue siendo la del legajo, sin cambios posteriores), chain_invalid o area_changed.
CREATE FUNCTION public.attendance_area_effectivity_in_force_v1(ctx jsonb,target uuid,chain jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $in_force$
DECLARE item record;area_value jsonb;state_value text:='valid';
BEGIN
 SELECT i.change_revision,i.organization_unit_source_id,i.sector_source_id,i.organization_name,i.sector_name,
  q.id proposal_id,q.effective_from,q.proposal_sha256,r.id approval_id,r.reviewed_at INTO item
 FROM public.attendance_area_effectivity_item i
 JOIN public.attendance_area_effectivity_proposal q ON q.id=i.proposal_id
 JOIN public.attendance_area_effectivity_review r ON r.proposal_id=q.id AND r.decision='approve'
 WHERE i.contract_id=target AND q.tenant_id=(ctx->>'tenantId')::uuid AND q.source_binding_id=(ctx->>'sourceBindingId')::uuid
 ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 area_value:=jsonb_build_object('organizationUnitSourceId',item.organization_unit_source_id,'sectorSourceId',item.sector_source_id,
  'organizationName',item.organization_name,'sectorName',item.sector_name);
 IF chain->>'status' IS DISTINCT FROM 'proven' OR item.change_revision>(chain->>'changeRevision')::integer
 OR chain->'areas'->item.change_revision IS DISTINCT FROM area_value THEN state_value:='chain_invalid';
 -- Una rectificación posterior al sello que cambie el área (aunque después vuelva) exige declarar de nuevo.
 ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(chain->'areas') WITH ORDINALITY later(value,ordinal)
  WHERE later.ordinal-1>item.change_revision AND later.value IS DISTINCT FROM area_value) THEN state_value:='area_changed';
 END IF;
 RETURN jsonb_build_object('state',state_value,'proposalId',item.proposal_id,'proposalSha256',item.proposal_sha256,
  'approvalId',item.approval_id,'reviewedAt',item.reviewed_at,'effectiveFrom',to_char(item.effective_from,'YYYY-MM-DD'),
  'changeRevision',item.change_revision,'area',area_value);
END $in_force$;

-- INTERNA. Contratos del municipio y su condición para ser declarados. Un contrato entra en la
-- declaración sólo si es adoptado, su cadena está probada, está activo y su legajo tiene repartición,
-- sector (o ninguno) y sus nombres completos. Las exclusiones se cuentan; nunca se nombran.
CREATE FUNCTION public.attendance_area_effectivity_candidates_v1(ctx jsonb)
RETURNS TABLE(contract_id uuid,exclusion text,change_revision integer,area jsonb,declared boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $candidates$
DECLARE candidate record;chain jsonb;last_area jsonb;
BEGIN
 IF (SELECT count(*) FROM public.employment_contract ec WHERE ec.tenant_id=(ctx->>'tenantId')::uuid
  AND ec.legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL)>5000
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_LIMIT' USING ERRCODE='P0001';END IF;
 FOR candidate IN SELECT ec.id FROM public.employment_contract ec WHERE ec.tenant_id=(ctx->>'tenantId')::uuid
  AND ec.legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL ORDER BY ec.id LOOP
  chain:=public.attendance_area_effectivity_chain_v1(ctx,candidate.id);
  contract_id:=candidate.id;exclusion:=NULL;change_revision:=NULL;area:=NULL;declared:=false;
  IF chain->>'status' IS DISTINCT FROM 'proven' THEN
   exclusion:=CASE chain->>'reason' WHEN 'AREA_HISTORY_NOT_ADOPTED' THEN 'nativeRegistration'
    WHEN 'AREA_HISTORY_WITHDRAWN' THEN 'withdrawn' ELSE 'unproven' END;
  ELSIF chain->>'contractStatus' IS DISTINCT FROM 'active' THEN exclusion:='notActive';
  ELSE
   last_area:=chain->'areas'->((chain->>'changeRevision')::integer);
   IF last_area IS NULL OR jsonb_typeof(last_area) IS DISTINCT FROM 'object' THEN exclusion:='areaIncomplete';
   ELSE change_revision:=(chain->>'changeRevision')::integer;area:=last_area;
    declared:=coalesce(public.attendance_area_effectivity_in_force_v1(ctx,candidate.id,chain)->>'state'='valid',false);END IF;
  END IF;
  RETURN NEXT;
 END LOOP;
END $candidates$;

CREATE FUNCTION public.attendance_area_effectivity_hash_v1(value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $hash$
 SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex')
$hash$;

-- INTERNA. Vista previa determinista con sus dos alcances: «missing» (los que todavía no tienen una
-- declaración vigente) y «all» (todos los que están en condiciones; reemplaza la fecha de cada uno).
CREATE FUNCTION public.attendance_area_effectivity_preview_v1(ctx jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $preview$
DECLARE rows_value jsonb;excluded jsonb;declared_count bigint;scopes jsonb:='{}'::jsonb;scope_name text;items jsonb;areas jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',c.contract_id,'exclusion',c.exclusion,'changeRevision',c.change_revision,
  'area',c.area,'declared',c.declared) ORDER BY c.contract_id),'[]'::jsonb)
 INTO rows_value FROM public.attendance_area_effectivity_candidates_v1(ctx) c;
 SELECT jsonb_build_object(
   'areaIncomplete',count(*) FILTER(WHERE r->>'exclusion'='areaIncomplete'),
   'withdrawn',count(*) FILTER(WHERE r->>'exclusion'='withdrawn'),
   'notActive',count(*) FILTER(WHERE r->>'exclusion'='notActive'),
   'unproven',count(*) FILTER(WHERE r->>'exclusion'='unproven'),
   'nativeRegistration',count(*) FILTER(WHERE r->>'exclusion'='nativeRegistration')),
  count(*) FILTER(WHERE r->>'exclusion' IS NULL AND (r->>'declared')::boolean)
 INTO excluded,declared_count FROM jsonb_array_elements(rows_value) r;
 FOREACH scope_name IN ARRAY ARRAY['all','missing'] LOOP
  SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',r->>'contractId','changeRevision',(r->>'changeRevision')::integer,'area',r->'area')
   ORDER BY (r->>'contractId')::uuid),'[]'::jsonb)
  INTO items FROM jsonb_array_elements(rows_value) r
  WHERE r->>'exclusion' IS NULL AND (scope_name='all' OR NOT (r->>'declared')::boolean);
  SELECT coalesce(jsonb_agg(g.item ORDER BY g.label,g.organization,g.sector),'[]'::jsonb) INTO areas FROM (
   SELECT r#>>'{area,organizationUnitSourceId}' organization,r#>>'{area,sectorSourceId}' sector,
    (r#>>'{area,organizationName}')||CASE WHEN r#>>'{area,sectorName}' IS NULL THEN '' ELSE ' / '||(r#>>'{area,sectorName}') END label,
    jsonb_build_object('organizationUnitSourceId',r#>>'{area,organizationUnitSourceId}','sectorSourceId',r#>>'{area,sectorSourceId}',
     'areaLabel',(r#>>'{area,organizationName}')||CASE WHEN r#>>'{area,sectorName}' IS NULL THEN '' ELSE ' / '||(r#>>'{area,sectorName}') END,
     'contracts',count(*)) item
   FROM jsonb_array_elements(items) r GROUP BY 1,2,3) g;
  scopes:=scopes||jsonb_build_object(scope_name,jsonb_build_object('items',items,'eligible',jsonb_array_length(items),'areas',areas,
   'version',public.attendance_area_effectivity_hash_v1(jsonb_build_object('version','attendance-area-effectivity-items.v1',
    'tenantId',ctx->>'tenantId','sourceBindingId',ctx->>'sourceBindingId','scope',scope_name,'items',items))));
 END LOOP;
 RETURN jsonb_build_object('excluded',excluded,'declared',declared_count,'scopes',scopes);
END $preview$;

-- INTERNA. Sesión real, IAM vivo y persona con relación laboral propia. Sin capacidad nueva:
-- preparar exige employee.record.propose y aprobar employee.record.approve.
CREATE FUNCTION public.attendance_area_effectivity_context_v1(p jsonb,required_capability text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $context$
DECLARE c jsonb;capabilities jsonb;actor_id uuid;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR NOT p ?& ARRAY['actorEmail','actorSessionId','actorSessionVersion','releaseSha','tenantId','membershipId']
  OR (SELECT count(*) FROM jsonb_object_keys(p))<>6
  OR (required_capability IS NOT NULL AND required_capability NOT IN('employee.record.propose','employee.record.approve'))
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_SESSION_INVALID' USING ERRCODE='P0001'; END IF;
 c:=public.attendance_gateway_assert_session_v1(p->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',(p->>'tenantId')::uuid,(p->>'membershipId')::uuid);
 LOCK TABLE public.iam_role_capability,public.tenant_membership_capability_override IN SHARE MODE NOWAIT;
 PERFORM public.tenant_iam_assert_no_sod_conflict((c->>'membershipId')::uuid);
 SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key),'[]'::jsonb) INTO capabilities
 FROM public.tenant_iam_effective_capabilities((c->>'membershipId')::uuid)
 WHERE capability_key IN('employee.record.propose','employee.record.approve');
 IF capabilities='[]'::jsonb OR (required_capability IS NOT NULL AND NOT capabilities ? required_capability)
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_CAPABILITY_REQUIRED' USING ERRCODE='P0001'; END IF;
 c:=c||jsonb_build_object('sourceBindingId',c->>'certifiedBindingId','sourceCompanyId',c->>'sourceCompanyId',
  'actorEmail',lower(btrim(p->>'actorEmail')),'actorSessionId',p->>'actorSessionId','actorSessionVersion',(p->>'actorSessionVersion')::integer,'releaseSha',p->>'releaseSha');
 BEGIN
  actor_id:=public.time_catalog_native_actor_v2((c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,(c->>'membershipId')::uuid);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM IN('TIME_CATALOG_EMPLOYMENT_REQUIRED','TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID','TIME_CATALOG_NATIVE_PERIOD_INVALID')
  THEN actor_id:=NULL; ELSE RAISE; END IF;
 END;
 IF required_capability IS NOT NULL AND actor_id IS NULL
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_ACTOR_REQUIRED' USING ERRCODE='P0001'; END IF;
 RETURN c||jsonb_build_object('actorPersonId',actor_id,'capabilities',capabilities);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_BUSY' USING ERRCODE='P0001';
END $context$;

CREATE FUNCTION public.attendance_area_effectivity_proposal_hash_v1(q public.attendance_area_effectivity_proposal) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $proposal_hash$
 SELECT public.attendance_area_effectivity_hash_v1(jsonb_build_object('version','attendance-area-effectivity-proposal.v1',
  'tenantId',q.tenant_id,'sourceBindingId',q.source_binding_id,'companyId',q.company_id,
  'effectiveFrom',to_char(q.effective_from,'YYYY-MM-DD'),'scope',q.scope,'authorizationReference',q.authorization_reference,
  'itemCount',q.item_count,'itemsSha256',q.items_sha256,'excluded',q.excluded))
$proposal_hash$;

-- INTERNA. Proyección de una declaración: sin contratos, legajos ni nombres de agentes.
CREATE FUNCTION public.attendance_area_effectivity_record_v1(ctx jsonb,q public.attendance_area_effectivity_proposal) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $record$
DECLARE r public.attendance_area_effectivity_review;own boolean;
BEGIN
 IF q.tenant_id IS DISTINCT FROM (ctx->>'tenantId')::uuid OR q.source_binding_id IS DISTINCT FROM (ctx->>'sourceBindingId')::uuid
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_NOT_FOUND' USING ERRCODE='P0001';END IF;
 SELECT * INTO r FROM public.attendance_area_effectivity_review x WHERE x.proposal_id=q.id;
 own:=q.actor_membership_id=(ctx->>'membershipId')::uuid OR q.actor_email=ctx->>'actorEmail'
  OR(ctx->>'actorPersonId' IS NOT NULL AND q.actor_person_id=(ctx->>'actorPersonId')::uuid);
 RETURN jsonb_build_object('id',q.id,'version',q.proposal_sha256,
  'status',CASE WHEN r.id IS NULL THEN 'proposed' WHEN r.decision='approve' THEN 'approved' ELSE 'rejected' END,
  'effectiveFrom',to_char(q.effective_from,'YYYY-MM-DD'),'scope',q.scope,'authorizationReference',q.authorization_reference,
  'itemCount',q.item_count,'excluded',q.excluded,'proposedBy',q.actor_email,'proposedAt',q.created_at,'ownProposal',own,
  'reviewedBy',r.actor_email,'reviewedAt',r.reviewed_at,'reviewReason',r.reason,
  'contractsInForce',CASE WHEN r.decision='approve' THEN (
    SELECT count(*) FROM public.attendance_area_effectivity_item i WHERE i.proposal_id=q.id AND NOT EXISTS(
     SELECT 1 FROM public.attendance_area_effectivity_item later
     JOIN public.attendance_area_effectivity_proposal lq ON lq.id=later.proposal_id AND lq.tenant_id=q.tenant_id AND lq.source_binding_id=q.source_binding_id
     JOIN public.attendance_area_effectivity_review lr ON lr.proposal_id=lq.id AND lr.decision='approve'
     WHERE later.contract_id=i.contract_id AND (lr.reviewed_at,lr.id)>(r.reviewed_at,r.id))) ELSE 0 END,
  'areas',CASE WHEN r.id IS NULL THEN (SELECT coalesce(jsonb_agg(g.item ORDER BY g.label,g.organization,g.sector),'[]'::jsonb) FROM (
    SELECT i.organization_unit_source_id organization,i.sector_source_id sector,
     i.organization_name||CASE WHEN i.sector_name IS NULL THEN '' ELSE ' / '||i.sector_name END label,
     jsonb_build_object('organizationUnitSourceId',i.organization_unit_source_id,'sectorSourceId',i.sector_source_id,
      'areaLabel',i.organization_name||CASE WHEN i.sector_name IS NULL THEN '' ELSE ' / '||i.sector_name END,'contracts',count(*)) item
    FROM public.attendance_area_effectivity_item i WHERE i.proposal_id=q.id GROUP BY 1,2,3) g) ELSE NULL END);
END $record$;

-- INTERNA. ¿La lista sellada sigue describiendo los legajos tal como están hoy?
CREATE FUNCTION public.attendance_area_effectivity_fresh_v1(ctx jsonb,target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $fresh$
 SELECT NOT EXISTS(
  SELECT 1 FROM public.attendance_area_effectivity_item i
  LEFT JOIN public.attendance_area_effectivity_candidates_v1(ctx) c ON c.contract_id=i.contract_id AND c.exclusion IS NULL
  WHERE i.proposal_id=target AND (c.contract_id IS NULL OR c.change_revision IS DISTINCT FROM i.change_revision
   OR c.area IS DISTINCT FROM jsonb_build_object('organizationUnitSourceId',i.organization_unit_source_id,'sectorSourceId',i.sector_source_id,
    'organizationName',i.organization_name,'sectorName',i.sector_name)))
$fresh$;

-- INTERNA. Estado para la pantalla: totales, áreas y declaraciones; nunca un contrato ni una persona declarada.
CREATE FUNCTION public.attendance_area_effectivity_state_v1(ctx jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $state$
DECLARE preview jsonb;pending public.attendance_area_effectivity_proposal;pending_value jsonb;history jsonb;
 today date:=(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
 preview:=public.attendance_area_effectivity_preview_v1(ctx);
 SELECT x.* INTO pending FROM public.attendance_area_effectivity_proposal x
 WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND NOT EXISTS(SELECT 1 FROM public.attendance_area_effectivity_review r WHERE r.proposal_id=x.id)
 ORDER BY x.created_at DESC,x.id DESC LIMIT 1;
 IF pending.id IS NOT NULL THEN
  pending_value:=public.attendance_area_effectivity_record_v1(ctx,pending)
   ||jsonb_build_object('stale',NOT public.attendance_area_effectivity_fresh_v1(ctx,pending.id));
 END IF;
 SELECT coalesce(jsonb_agg(public.attendance_area_effectivity_record_v1(ctx,x)-'areas' ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO history
 FROM (SELECT y.* FROM public.attendance_area_effectivity_proposal y
  WHERE y.tenant_id=(ctx->>'tenantId')::uuid AND y.source_binding_id=(ctx->>'sourceBindingId')::uuid
   AND EXISTS(SELECT 1 FROM public.attendance_area_effectivity_review r WHERE r.proposal_id=y.id)
  ORDER BY y.created_at DESC,y.id DESC LIMIT 20) x;
 RETURN jsonb_build_object('version','attendance-area-effectivity.v1','principal',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId','sessionId',ctx->>'actorSessionId','sessionVersion',(ctx->>'actorSessionVersion')::integer),
  'today',to_char(today,'YYYY-MM-DD'),
  'permissions',jsonb_build_object(
   'canPropose',ctx->'capabilities' ? 'employee.record.propose' AND ctx->>'actorPersonId' IS NOT NULL,
   'canReview',ctx->'capabilities' ? 'employee.record.approve' AND ctx->>'actorPersonId' IS NOT NULL),
  'preview',jsonb_build_object('excluded',preview->'excluded','scopes',jsonb_build_object(
   'all',(preview#>'{scopes,all}')-'items','missing',(preview#>'{scopes,missing}')-'items')),
  'pending',pending_value,'history',history,'declaredContracts',preview->'declared');
END $state$;

-- FACHADA de lectura: sesión real y capacidad vigente; después, el estado.
CREATE FUNCTION public.attendance_area_effectivity_read_v1(p jsonb,q jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $read$
BEGIN
 IF q IS DISTINCT FROM '{}'::jsonb THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_QUERY_INVALID' USING ERRCODE='P0001';END IF;
 RETURN public.attendance_area_effectivity_state_v1(public.attendance_area_effectivity_context_v1(p,NULL));
END $read$;

-- INTERNA. Preparar o decidir con un contexto ya autenticado. Idempotente por clave de pedido.
CREATE FUNCTION public.attendance_area_effectivity_apply_v1(ctx jsonb,input jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $apply$
DECLARE action_value text;principal_value jsonb;fingerprint text;preview jsonb;selected jsonb;q public.attendance_area_effectivity_proposal;
 r public.attendance_area_effectivity_review;new_id uuid:=gen_random_uuid();effective_value date;own boolean;
 today date:=(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR jsonb_typeof(input) IS DISTINCT FROM 'object' OR octet_length(input::text)>8192
 OR jsonb_typeof(input->'action') IS DISTINCT FROM 'string' OR input->>'action' NOT IN('propose','review')
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_INPUT_INVALID' USING ERRCODE='P0001';END IF;
 action_value:=input->>'action';
 IF action_value='propose' THEN
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(input) key) IS DISTINCT FROM ARRAY['action','authorizationReference','effectiveFrom','previewVersion','scope']::text[]
  OR jsonb_typeof(input->'authorizationReference') IS DISTINCT FROM 'string' OR jsonb_typeof(input->'effectiveFrom') IS DISTINCT FROM 'string'
  OR jsonb_typeof(input->'previewVersion') IS DISTINCT FROM 'string' OR input->>'previewVersion'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(input->'scope') IS DISTINCT FROM 'string' OR input->>'scope' NOT IN('all','missing')
  OR input->>'effectiveFrom'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR NOT pg_input_is_valid(input->>'effectiveFrom','date')
  OR length(input->>'authorizationReference') NOT BETWEEN 10 AND 500
  OR input->>'authorizationReference'<>btrim(input->>'authorizationReference') OR input->>'authorizationReference'~'[<>[:cntrl:]]'
  OR input->>'authorizationReference'<>normalize(input->>'authorizationReference',NFC)
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_INPUT_INVALID' USING ERRCODE='P0001';END IF;
 ELSE
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(input) key) IS DISTINCT FROM ARRAY['action','decision','proposalId','proposalVersion','reason']::text[]
  OR jsonb_typeof(input->'decision') IS DISTINCT FROM 'string' OR input->>'decision' NOT IN('approve','reject')
  OR jsonb_typeof(input->'proposalId') IS DISTINCT FROM 'string' OR input->>'proposalId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR jsonb_typeof(input->'proposalVersion') IS DISTINCT FROM 'string' OR input->>'proposalVersion'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(input->'reason') IS DISTINCT FROM 'string' OR length(input->>'reason') NOT BETWEEN 10 AND 1000
  OR input->>'reason'<>btrim(input->>'reason') OR input->>'reason'~'[<>[:cntrl:]]'
  OR input->>'reason'<>normalize(input->>'reason',NFC)
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_INPUT_INVALID' USING ERRCODE='P0001';END IF;
 END IF;
 IF jsonb_typeof(ctx) IS DISTINCT FROM 'object' OR jsonb_typeof(ctx->'capabilities') IS DISTINCT FROM 'array'
 OR ctx->>'membershipId' IS NULL OR ctx->>'actorEmail' IS NULL
 OR (action_value='propose' AND NOT ctx->'capabilities' ? 'employee.record.propose')
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_CAPABILITY_REQUIRED' USING ERRCODE='P0001';END IF;
 IF ctx->>'actorPersonId' IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_ACTOR_REQUIRED' USING ERRCODE='P0001';END IF;
 -- Bajo REPEATABLE READ la lectura sería anterior a los bloqueos: el sello exige una foto posterior a ellos.
 IF current_setting('transaction_isolation')<>'read committed'
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_ISOLATION_INVALID' USING ERRCODE='P0001';END IF;
 principal_value:=jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId','sessionId',ctx->>'actorSessionId','sessionVersion',(ctx->>'actorSessionVersion')::integer);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('attendance-area-effectivity:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0))
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_BUSY' USING ERRCODE='P0001';END IF;
 -- Corte conjunto: ninguna rectificación, baja o anulación puede aprobarse mientras se sella o decide.
 LOCK TABLE public.native_employment_change_review,public.native_employment_lifecycle_review,
  public.native_employment_void_review IN SHARE MODE NOWAIT;
 fingerprint:=public.attendance_area_effectivity_hash_v1(input);

 IF action_value='propose' THEN
  SELECT * INTO q FROM public.attendance_area_effectivity_proposal x WHERE x.tenant_id=(ctx->>'tenantId')::uuid
   AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.actor_membership_id=(ctx->>'membershipId')::uuid AND x.request_key=k;
  IF FOUND THEN
   IF q.request_sha256<>fingerprint THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001';END IF;
   RETURN jsonb_build_object('version','attendance-area-effectivity-receipt.v1','principal',principal_value,'action','propose','replayed',true,
    'declaration',public.attendance_area_effectivity_record_v1(ctx,q)-'areas');
  END IF;
  IF EXISTS(SELECT 1 FROM public.attendance_area_effectivity_review x WHERE x.tenant_id=(ctx->>'tenantId')::uuid
   AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.actor_membership_id=(ctx->>'membershipId')::uuid AND x.request_key=k)
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001';END IF;
  effective_value:=(input->>'effectiveFrom')::date;
  IF effective_value<DATE '1900-01-01' OR effective_value>today
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_DATE_INVALID' USING ERRCODE='P0001';END IF;
  IF EXISTS(SELECT 1 FROM public.attendance_area_effectivity_proposal x WHERE x.tenant_id=(ctx->>'tenantId')::uuid
   AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid
   AND NOT EXISTS(SELECT 1 FROM public.attendance_area_effectivity_review y WHERE y.proposal_id=x.id))
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_PENDING_EXISTS' USING ERRCODE='P0001';END IF;
  preview:=public.attendance_area_effectivity_preview_v1(ctx);selected:=preview->'scopes'->(input->>'scope');
  IF (selected->>'eligible')::integer<1 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_NOTHING_TO_DECLARE' USING ERRCODE='P0001';END IF;
  IF selected->>'version' IS DISTINCT FROM input->>'previewVersion'
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_PREVIEW_CHANGED' USING ERRCODE='P0001';END IF;
  q.id:=new_id;q.tenant_id:=(ctx->>'tenantId')::uuid;q.source_binding_id:=(ctx->>'sourceBindingId')::uuid;
  q.company_id:=(ctx->>'sourceCompanyId')::bigint;q.effective_from:=effective_value;
  q.scope:=input->>'scope';q.authorization_reference:=input->>'authorizationReference';q.item_count:=(selected->>'eligible')::integer;
  q.items_sha256:=selected->>'version';q.excluded:=preview->'excluded';
  q.proposal_sha256:=public.attendance_area_effectivity_proposal_hash_v1(q);
  INSERT INTO public.attendance_area_effectivity_proposal(id,tenant_id,source_binding_id,company_id,effective_from,scope,authorization_reference,
   item_count,items_sha256,excluded,proposal_sha256,actor_membership_id,actor_person_id,actor_email,actor_session_id,release_sha,request_key,request_sha256)
  VALUES(q.id,q.tenant_id,q.source_binding_id,q.company_id,q.effective_from,q.scope,q.authorization_reference,q.item_count,q.items_sha256,q.excluded,
   q.proposal_sha256,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(ctx->>'actorSessionId')::uuid,ctx->>'releaseSha',k,fingerprint)
  RETURNING * INTO q;
  INSERT INTO public.attendance_area_effectivity_item(proposal_id,contract_id,change_revision,organization_unit_source_id,sector_source_id,organization_name,sector_name)
  SELECT q.id,(item->>'contractId')::uuid,(item->>'changeRevision')::integer,item#>>'{area,organizationUnitSourceId}',
   item#>>'{area,sectorSourceId}',item#>>'{area,organizationName}',item#>>'{area,sectorName}'
  FROM jsonb_array_elements(selected->'items') item;
  IF (SELECT count(*) FROM public.attendance_area_effectivity_item i WHERE i.proposal_id=q.id)<>q.item_count
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_ITEM_INVALID' USING ERRCODE='P0001';END IF;
  RETURN jsonb_build_object('version','attendance-area-effectivity-receipt.v1','principal',principal_value,'action','propose','replayed',false,
   'declaration',public.attendance_area_effectivity_record_v1(ctx,q)-'areas');
 END IF;

 SELECT * INTO r FROM public.attendance_area_effectivity_review x WHERE x.tenant_id=(ctx->>'tenantId')::uuid
  AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.actor_membership_id=(ctx->>'membershipId')::uuid AND x.request_key=k;
 IF FOUND THEN
  IF r.request_sha256<>fingerprint THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001';END IF;
  SELECT * INTO q FROM public.attendance_area_effectivity_proposal x WHERE x.id=r.proposal_id;
  RETURN jsonb_build_object('version','attendance-area-effectivity-receipt.v1','principal',principal_value,'action','review','replayed',true,
   'declaration',public.attendance_area_effectivity_record_v1(ctx,q)-'areas');
 END IF;
 IF EXISTS(SELECT 1 FROM public.attendance_area_effectivity_proposal x WHERE x.tenant_id=(ctx->>'tenantId')::uuid
  AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.actor_membership_id=(ctx->>'membershipId')::uuid AND x.request_key=k)
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_IDEMPOTENCY_CONFLICT' USING ERRCODE='P0001';END IF;
 SELECT * INTO q FROM public.attendance_area_effectivity_proposal x WHERE x.id=(input->>'proposalId')::uuid
  AND x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_NOT_FOUND' USING ERRCODE='P0001';END IF;
 IF EXISTS(SELECT 1 FROM public.attendance_area_effectivity_review x WHERE x.proposal_id=q.id)
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_ALREADY_REVIEWED' USING ERRCODE='P0001';END IF;
 IF q.proposal_sha256 IS DISTINCT FROM input->>'proposalVersion' OR q.proposal_sha256<>public.attendance_area_effectivity_proposal_hash_v1(q)
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_PROPOSAL_CHANGED' USING ERRCODE='P0001';END IF;
 own:=q.actor_membership_id=(ctx->>'membershipId')::uuid OR q.actor_person_id=(ctx->>'actorPersonId')::uuid OR q.actor_email=ctx->>'actorEmail';
 IF input->>'decision'='approve' THEN
  IF NOT ctx->'capabilities' ? 'employee.record.approve' THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_CAPABILITY_REQUIRED' USING ERRCODE='P0001';END IF;
  IF own THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_SAME_ACTOR' USING ERRCODE='P0001';END IF;
  IF q.effective_from>today THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_DATE_INVALID' USING ERRCODE='P0001';END IF;
  IF (SELECT count(*) FROM public.attendance_area_effectivity_item i WHERE i.proposal_id=q.id)<>q.item_count
  OR NOT public.attendance_area_effectivity_fresh_v1(ctx,q.id)
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_STALE' USING ERRCODE='P0001';END IF;
 ELSIF NOT(ctx->'capabilities' ? 'employee.record.approve' OR(own AND ctx->'capabilities' ? 'employee.record.propose'))
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_CAPABILITY_REQUIRED' USING ERRCODE='P0001';
 END IF;
 INSERT INTO public.attendance_area_effectivity_review(id,proposal_id,tenant_id,source_binding_id,decision,reason,actor_membership_id,
  actor_person_id,actor_email,actor_session_id,release_sha,request_key,request_sha256)
 VALUES(new_id,q.id,q.tenant_id,q.source_binding_id,input->>'decision',input->>'reason',(ctx->>'membershipId')::uuid,
  (ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(ctx->>'actorSessionId')::uuid,ctx->>'releaseSha',k,fingerprint);
 RETURN jsonb_build_object('version','attendance-area-effectivity-receipt.v1','principal',principal_value,'action','review','replayed',false,
  'declaration',public.attendance_area_effectivity_record_v1(ctx,q)-'areas');
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_BUSY' USING ERRCODE='P0001';
END $apply$;

-- FACHADA de escritura. action: propose | review. La autoridad se relee en cada pedido.
CREATE FUNCTION public.attendance_area_effectivity_command_v1(p jsonb,input jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $command$
DECLARE required text;
BEGIN
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR jsonb_typeof(input->'action') IS DISTINCT FROM 'string'
 OR input->>'action' NOT IN('propose','review')
 THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_INPUT_INVALID' USING ERRCODE='P0001';END IF;
 -- Preparar exige employee.record.propose. Decidir admite cualquiera de las dos: aprobar exige
 -- employee.record.approve y otra persona; rechazar la propia preparación sólo exige haberla hecho.
 IF input->>'action'='propose' THEN required:='employee.record.propose';END IF;
 RETURN public.attendance_area_effectivity_apply_v1(public.attendance_area_effectivity_context_v1(p,required),input,k);
END $command$;

-- INTERNA. Contrato versionado nuevo. Para un contrato con alta nativa devuelve exactamente la
-- respuesta de v1. Para un contrato adoptado exige, en este orden: cadena probada, día dentro de un
-- intervalo laboral activo, declaración aprobada que lo incluya, área sin cambios desde el sello y
-- fecha pedida igual o posterior a la declarada. Rige la última declaración aprobada que lo incluye.
CREATE FUNCTION public.attendance_area_history_v2(ctx jsonb,target uuid,first_date date,last_date date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $history$
DECLARE base jsonb;chain jsonb;answer jsonb;declaration jsonb;area_value jsonb;source_evidence jsonb;
BEGIN
 base:=public.attendance_area_history_v1(ctx,target,first_date,last_date);
 IF base->>'status' IS DISTINCT FROM 'blocked'
 OR base->'reasons' IS DISTINCT FROM jsonb_build_array('AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED') THEN RETURN base;END IF;
 chain:=public.attendance_area_effectivity_chain_v1(ctx,target);
 IF chain->>'status' IS DISTINCT FROM 'proven' AND chain->>'reason' IN('AREA_HISTORY_NOT_ADOPTED','AREA_HISTORY_NATIVE_PROVENANCE_REQUIRED')
 THEN RETURN base;END IF;
 answer:=base||jsonb_build_object('version','attendance-area-history.v2');
 IF chain->>'status' IS DISTINCT FROM 'proven'
 THEN RETURN answer||jsonb_build_object('reasons',jsonb_build_array(chain->>'reason'));END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(chain->'intervals') span WHERE(span->>'startDate')::date<=first_date
  AND(span->>'endDate' IS NULL OR(last_date IS NOT NULL AND(span->>'endDate')::date>=last_date)))
 THEN RETURN answer||jsonb_build_object('reasons',jsonb_build_array('AREA_HISTORY_RANGE_NOT_ACTIVE'));END IF;
 declaration:=public.attendance_area_effectivity_in_force_v1(ctx,target,chain);
 IF declaration IS NULL THEN RETURN answer||jsonb_build_object('reasons',jsonb_build_array('AREA_HISTORY_DECLARATION_REQUIRED'));END IF;
 IF declaration->>'state'='chain_invalid'
 THEN RETURN answer||jsonb_build_object('reasons',jsonb_build_array('AREA_HISTORY_CHAIN_INVALID'));END IF;
 IF declaration->>'state' IS DISTINCT FROM 'valid'
 THEN RETURN answer||jsonb_build_object('reasons',jsonb_build_array('AREA_HISTORY_EFFECTIVITY_REQUIRED'));END IF;
 IF first_date<(declaration->>'effectiveFrom')::date
 THEN RETURN answer||jsonb_build_object('reasons',jsonb_build_array('AREA_HISTORY_DECLARATION_NOT_EFFECTIVE'));END IF;
 area_value:=declaration->'area';
 source_evidence:=jsonb_build_object('version','attendance-area-history-source.v2','tenantId',ctx->>'tenantId',
  'sourceBindingId',ctx->>'sourceBindingId','contractId',target,'validFrom',first_date,'validUntil',last_date,
  'area',area_value,'chain',chain,'declaration',(declaration-'area')-'state',
  'guardContract','adopted-declared-area-chain.133.104.110.224.244.v1');
 RETURN answer||jsonb_build_object('status','resolved','reasons','[]'::jsonb,'area',area_value||jsonb_build_object('areaLabel',
   (area_value->>'organizationName')||CASE WHEN area_value->>'sectorName' IS NULL THEN '' ELSE ' / '||(area_value->>'sectorName') END),
  'evidence',jsonb_build_object('sourceVersion',public.attendance_area_effectivity_hash_v1(source_evidence),
   'registrationId',chain#>'{registration,id}','registrationRequestSha256',chain#>'{registration,requestSha256}',
   'registrationCatalogSha256',chain#>'{registration,catalogSha256}','registeredAt',chain#>'{registration,createdAt}',
   'changeApprovalIds',chain->'changeIds','lifecycleApprovalIds',chain->'lifecycleIds',
   'declarationProposalId',declaration->'proposalId','declarationApprovalId',declaration->'approvalId',
   'declaredEffectiveFrom',declaration->'effectiveFrom'));
END $history$;

REVOKE ALL ON FUNCTION public.attendance_area_effectivity_review_guard_v1(),public.attendance_area_effectivity_item_guard_v1(),
 public.attendance_area_effectivity_guards_v1(),public.attendance_area_effectivity_chain_v1(jsonb,uuid),
 public.attendance_area_effectivity_in_force_v1(jsonb,uuid,jsonb),
 public.attendance_area_effectivity_candidates_v1(jsonb),public.attendance_area_effectivity_hash_v1(jsonb),
 public.attendance_area_effectivity_preview_v1(jsonb),public.attendance_area_effectivity_context_v1(jsonb,text),
 public.attendance_area_effectivity_proposal_hash_v1(public.attendance_area_effectivity_proposal),
 public.attendance_area_effectivity_record_v1(jsonb,public.attendance_area_effectivity_proposal),
 public.attendance_area_effectivity_fresh_v1(jsonb,uuid),public.attendance_area_effectivity_state_v1(jsonb),
 public.attendance_area_effectivity_read_v1(jsonb,jsonb),public.attendance_area_effectivity_apply_v1(jsonb,jsonb,uuid),
 public.attendance_area_effectivity_command_v1(jsonb,jsonb,uuid),
 public.attendance_area_history_v2(jsonb,uuid,date,date) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.attendance_area_effectivity_read_v1(jsonb,jsonb),
 public.attendance_area_effectivity_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;

-- Los cuatro consumidores instalados pasan a preguntar a v2. Cada cuerpo se compara con su huella
-- exacta antes y después; cualquier diferencia detiene la instalación sin cambiar nada.
DO $consumers$
DECLARE item record;definition text;actual text;occurrences integer;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('public.attendance_area_population_v1(jsonb,jsonb,date,date)','b9e85f6eb45c0990998f85bfb42a5b7db398b98ed6c28d9272b764411ac20501',1,'1fafcc7ab8d635741c93f9d982e3976fc6d68100d84b64ec4abcf247f8b07caa'),
  ('public.attendance_area_workdays_read_v1(jsonb,jsonb)','3b9b68f465d28bccf8b25723aac7faa4836c8c9625dac81ee2231268b9ceee00',1,'de1008172653455d298cc4539b0dabcb6d6f007ab48cb94372d9971219351355'),
  ('public.attendance_expected_devices_effective_v1(jsonb,uuid,date)','f36da308715831f3bd29f938bca04eba03c8a0d5ed159bafb9f13e1eb3d7df79',2,'e0ee920a026943a5051a7da0d01001390981524324476600d552cdc674cd41d8'),
  ('public.attendance_expected_devices_subject_v1(jsonb,uuid,jsonb,date,date)','f518429884cb4d8fa49c84c81f2990434aa6da6742c6c098b3ba067fd94aebd9',1,'8ef6057b8f1887c14e1bab6f48c1524650d75d9a51940fa5e4640598fcfdae35')
 ) expected(signature,before_sha256,calls,after_sha256) LOOP
  SELECT pg_get_functiondef(f.oid),encode(sha256(convert_to(f.prosrc,'UTF8')),'hex'),
   (length(f.prosrc)-length(replace(f.prosrc,'public.attendance_area_history_v1(','')))/length('public.attendance_area_history_v1(')
  INTO definition,actual,occurrences FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF definition IS NULL OR actual IS DISTINCT FROM item.before_sha256 OR occurrences IS DISTINCT FROM item.calls
  OR (length(definition)-length(replace(definition,'public.attendance_area_history_v1(','')))/length('public.attendance_area_history_v1(')<>item.calls
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_CONSUMER_CHANGED' USING ERRCODE='P0001';END IF;
  EXECUTE replace(definition,'public.attendance_area_history_v1(','public.attendance_area_history_v2(');
  SELECT encode(sha256(convert_to(f.prosrc,'UTF8')),'hex') INTO actual FROM pg_proc f WHERE f.oid=to_regprocedure(item.signature);
  IF actual IS DISTINCT FROM item.after_sha256
  THEN RAISE EXCEPTION 'ATTENDANCE_AREA_EFFECTIVITY_CONSUMER_RESULT' USING ERRCODE='P0001';END IF;
 END LOOP;
END
$consumers$;
