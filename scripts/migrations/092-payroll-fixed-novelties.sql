-- Permanent administrative novelties. No payroll batches, calculation or GRH writes.
-- Compact identity roots and append-only proposal/review events; no copied datasets.
-- Migration 044 already owns payroll_fixed_*_v1. Keep every legacy definition,
-- permission and row unchanged; this additive registry uses its own namespace.
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_legacy_guard_v1() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE capability_count integer;
BEGIN
 IF to_regclass('public.payroll_fixed_assignment') IS NULL OR to_regclass('public.payroll_fixed_change') IS NULL
  OR to_regclass('public.payroll_fixed_event') IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_LEGACY_RECONCILIATION_REQUIRED'; END IF;
 LOCK TABLE public.payroll_fixed_assignment,public.payroll_fixed_change,public.payroll_fixed_event IN SHARE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM public.payroll_fixed_assignment) OR EXISTS(SELECT 1 FROM public.payroll_fixed_change)
  OR EXISTS(SELECT 1 FROM public.payroll_fixed_event) THEN RAISE EXCEPTION 'PAYROLL_FIXED_LEGACY_RECONCILIATION_REQUIRED'; END IF;
 SELECT count(*) INTO capability_count FROM (SELECT capability_key FROM public.iam_capability
  WHERE capability_key IN ('payroll.fixed.prepare','payroll.fixed.approve') FOR SHARE NOWAIT) capability_rows;
 IF capability_count<>2 THEN RAISE EXCEPTION 'PAYROLL_FIXED_LEGACY_RECONCILIATION_REQUIRED'; END IF;
 PERFORM 1 FROM public.iam_capability_conflict WHERE capability_key='payroll.fixed.approve' AND conflicts_with_key='payroll.fixed.prepare' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_LEGACY_RECONCILIATION_REQUIRED'; END IF;
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY';
END $$;
REVOKE ALL ON FUNCTION public.payroll_fixed_registry_legacy_guard_v1() FROM PUBLIC,municontrol_actions_runtime_app;
SELECT public.payroll_fixed_registry_legacy_guard_v1();

CREATE TABLE IF NOT EXISTS public.payroll_fixed_novelty (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 certified_binding_id uuid NOT NULL, employment_contract_id uuid NOT NULL REFERENCES public.employment_contract(id),
 person_id uuid NOT NULL REFERENCES public.person_identity(id), identity_token text NOT NULL CHECK(identity_token ~ '^[a-f0-9]{64}$'),
 subject jsonb NOT NULL CHECK(jsonb_typeof(subject)='object'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,certified_binding_id,id),
 FOREIGN KEY(tenant_id,certified_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS public.payroll_fixed_novelty_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, certified_binding_id uuid NOT NULL, record_id uuid NOT NULL,
 version integer NOT NULL CHECK(version BETWEEN 1 AND 200), command text NOT NULL CHECK(command IN ('propose','review')),
 proposal_id uuid REFERENCES public.payroll_fixed_novelty_event(id), payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND pg_column_size(payload)<=8192),
 actor_membership_id uuid NOT NULL, actor_person_id uuid NOT NULL REFERENCES public.person_identity(id), actor_email text NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id), idempotency_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'), occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(record_id,version), UNIQUE(tenant_id,certified_binding_id,actor_membership_id,idempotency_key), UNIQUE(proposal_id),
 FOREIGN KEY(tenant_id,certified_binding_id,record_id) REFERENCES public.payroll_fixed_novelty(tenant_id,certified_binding_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK((command='propose' AND proposal_id IS NULL) OR (command='review' AND proposal_id IS NOT NULL)),
 CHECK(actor_email=lower(btrim(actor_email)) AND length(actor_email) BETWEEN 3 AND 320)
);
ALTER TABLE public.payroll_fixed_novelty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_fixed_novelty_event ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'PAYROLL_FIXED_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS payroll_fixed_novelty_immutable ON public.payroll_fixed_novelty;
CREATE TRIGGER payroll_fixed_novelty_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.payroll_fixed_novelty FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_fixed_registry_immutable_v1();
DROP TRIGGER IF EXISTS payroll_fixed_novelty_event_immutable ON public.payroll_fixed_novelty_event;
CREATE TRIGGER payroll_fixed_novelty_event_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.payroll_fixed_novelty_event FOR EACH STATEMENT EXECUTE FUNCTION public.payroll_fixed_registry_immutable_v1();

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_context_v1(p_context jsonb,capability text DEFAULT 'payroll.novelty.read') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; fixed_capabilities jsonb;
BEGIN
 IF capability IS NULL OR capability NOT IN ('payroll.novelty.read','payroll.novelty.export','payroll.fixed.prepare','payroll.fixed.approve') THEN RAISE EXCEPTION 'PAYROLL_FIXED_CAPABILITY_REQUIRED'; END IF;
 ctx:=public.payroll_novelty_assert_context_v1(p_context,'payroll.novelty.read');
 SELECT coalesce(jsonb_agg(effective.capability_key ORDER BY effective.capability_key),'[]'::jsonb) INTO fixed_capabilities
 FROM public.tenant_iam_effective_capabilities((ctx->>'membershipId')::uuid) effective
 WHERE effective.capability_key IN ('payroll.fixed.prepare','payroll.fixed.approve');
 ctx:=ctx||jsonb_build_object('capabilities',(ctx->'capabilities')||fixed_capabilities);
 IF NOT (ctx->'capabilities') ? capability THEN RAISE EXCEPTION 'PAYROLL_FIXED_CAPABILITY_REQUIRED'; END IF;
 IF NOT (ctx->'capabilities') ?& ARRAY['payroll.novelty.read','payroll.novelty.nominal.read'] THEN RAISE EXCEPTION 'PAYROLL_FIXED_CAPABILITY_REQUIRED'; END IF;
 IF capability IN ('payroll.fixed.prepare','payroll.fixed.approve') AND (ctx->>'actorPersonId' IS NULL OR ctx->>'employmentLinked' IS DISTINCT FROM 'true') THEN RAISE EXCEPTION 'PAYROLL_FIXED_EMPLOYMENT_REQUIRED'; END IF;
 PERFORM public.payroll_fixed_registry_legacy_guard_v1();
 RETURN ctx||jsonb_build_object('actorEmail',lower(btrim(p_context->>'actorEmail')));
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE 'PAYROLL_NOVELTY_%' THEN RAISE EXCEPTION '%',replace(SQLERRM,'PAYROLL_NOVELTY_','PAYROLL_FIXED_'); END IF;
 IF SQLERRM='TENANT_IAM_SOD_CONFLICT' THEN RAISE EXCEPTION 'PAYROLL_FIXED_AUTHORITY_REQUIRED'; END IF;
 RAISE;
END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_lock_v1(ctx jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR NOT pg_try_advisory_xact_lock(hashtextextended('payroll-fixed:binding:v1:'||(ctx->>'tenantId')||':'||(ctx->>'certifiedBindingId'),0)) THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_capacity_v1() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE used_bytes bigint;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('payroll-fixed:capacity:v1',0)) THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END IF;
 SELECT sum(pg_database_size(oid)) INTO used_bytes FROM pg_database;
 IF used_bytes IS NULL OR used_bytes+262144>520093696 THEN RAISE EXCEPTION 'PAYROLL_FIXED_CAPACITY_LIMIT'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_effects_v1() RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT '{"approvalEffect":"control_export_only","grhMutation":false,"payrollCalculated":false,"payrollPosted":false}'::jsonb
$$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_date_v1(value text,required boolean DEFAULT true) RETURNS date
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE parsed date;
BEGIN
 IF value IS NULL THEN IF required THEN RAISE EXCEPTION 'invalid'; END IF; RETURN NULL; END IF;
 IF value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid'; END IF;
 parsed:=value::date;
 IF parsed NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31' OR to_char(parsed,'YYYY-MM-DD')<>value THEN RAISE EXCEPTION 'invalid'; END IF;
 RETURN parsed;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'PAYROLL_FIXED_DATES_INVALID'; END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_text_v1(value text,min_length integer,max_length integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(length(value) BETWEEN min_length AND max_length AND value=btrim(value) AND value=normalize(value,NFC) AND value !~ '[[:cntrl:]<>]',false)
$$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_subject_v1(ctx jsonb,legajo text,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE snapshot jsonb; candidate record; matches integer;
BEGIN
 IF legajo IS NULL OR legajo !~ '^(0|[1-9][0-9]{0,19})$' THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 IF hold_lock THEN LOCK TABLE public.employment_contract,public.source_import_batch,public.person_identity IN SHARE MODE NOWAIT; END IF;
 SELECT count(*) INTO matches FROM public.employment_contract c JOIN public.source_import_batch b ON b.id=c.source_batch_id
 WHERE c.source_system='GRH' AND c.status='active' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND c.legacy_legajo=legajo
  AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL;
 IF matches<>1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_LEGAJO_NOT_FOUND'; END IF;
 SELECT c.id,c.person_id,c.legacy_legajo,b.source_cutoff,p.full_name INTO candidate
 FROM public.employment_contract c JOIN public.source_import_batch b ON b.id=c.source_batch_id JOIN public.person_identity p ON p.id=c.person_id
 WHERE c.source_system='GRH' AND c.status='active' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND c.legacy_legajo=legajo
  AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL;
 snapshot:=jsonb_build_object('contractId',candidate.id,'personId',candidate.person_id,'legajo',candidate.legacy_legajo,
  'sourceDatabase',ctx->>'sourceDatabase','companyId',(ctx->>'sourceCompanyId')::bigint);
 RETURN jsonb_build_object('personId',candidate.person_id,'subject',jsonb_build_object('contractId',candidate.id,'legajo',candidate.legacy_legajo,'employeeName',candidate.full_name,
  'identityToken',encode(digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),'sourceCutoff',candidate.source_cutoff));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_identity_current_v1(ctx jsonb,item public.payroll_fixed_novelty) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE fresh jsonb;
BEGIN
 fresh:=public.payroll_fixed_registry_subject_v1(ctx,item.subject->>'legajo');
 RETURN fresh#>>'{subject,contractId}'=item.employment_contract_id::text AND fresh->>'personId'=item.person_id::text AND fresh#>>'{subject,identityToken}'=item.identity_token;
EXCEPTION WHEN OTHERS THEN IF SQLERRM IN ('PAYROLL_FIXED_LEGAJO_NOT_FOUND','PAYROLL_FIXED_INVALID_PAYLOAD') THEN RETURN false; END IF; RAISE; END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_proposal_json_v1(ctx jsonb,item public.payroll_fixed_novelty_event,identity_current boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE review_event public.payroll_fixed_novelty_event%ROWTYPE; review_json jsonb; can_review boolean;
BEGIN
 SELECT * INTO review_event FROM public.payroll_fixed_novelty_event e WHERE e.proposal_id=item.id;
 IF FOUND THEN review_json:=jsonb_build_object('decision',review_event.payload->>'decision','reason',review_event.payload->>'reason',
  'reviewedAt',review_event.occurred_at,'reviewedBy',review_event.actor_email,'version',review_event.version); END IF;
 can_review:=review_json IS NULL AND identity_current AND ctx->'capabilities' ? 'payroll.fixed.approve' AND ctx->>'employmentLinked'='true'
  AND item.actor_membership_id<>(ctx->>'membershipId')::uuid AND item.actor_person_id<>(ctx->>'actorPersonId')::uuid AND item.actor_email<>ctx->>'actorEmail';
 RETURN jsonb_build_object('id',item.id,'recordId',item.record_id,'version',item.version,'operation',item.payload->>'operation','values',item.payload->'values',
  'reason',item.payload->>'reason','proposedAt',item.occurred_at,'proposedBy',item.actor_email,'review',review_json,'canReview',coalesce(can_review,false));
END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_record_json_v1(ctx jsonb,item public.payroll_fixed_novelty) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE current_identity boolean; head_version integer; latest jsonb; approved jsonb; pending jsonb;
BEGIN
 current_identity:=public.payroll_fixed_registry_identity_current_v1(ctx,item);
 SELECT max(e.version) INTO head_version FROM public.payroll_fixed_novelty_event e WHERE e.record_id=item.id;
 SELECT public.payroll_fixed_registry_proposal_json_v1(ctx,e,current_identity) INTO latest FROM public.payroll_fixed_novelty_event e WHERE e.record_id=item.id AND e.command='propose' ORDER BY e.version DESC LIMIT 1;
 SELECT public.payroll_fixed_registry_proposal_json_v1(ctx,p,current_identity) INTO approved FROM public.payroll_fixed_novelty_event p
 JOIN public.payroll_fixed_novelty_event r ON r.proposal_id=p.id AND r.payload->>'decision'='approve' WHERE p.record_id=item.id ORDER BY p.version DESC LIMIT 1;
 IF latest->'review'='null'::jsonb THEN pending:=latest; END IF;
 RETURN jsonb_build_object('id',item.id,'version',head_version,'subject',item.subject,'identityCurrent',current_identity,'approved',approved,'pending',pending,'latest',latest,
  'canPropose',current_identity AND pending IS NULL AND ctx->'capabilities' ? 'payroll.fixed.prepare' AND ctx->>'employmentLinked'='true');
END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_bootstrap_v1(p_context jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context);
 RETURN jsonb_build_object('version','payroll-fixed-bootstrap.v1','principal',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId',
  'certifiedBindingId',ctx->>'certifiedBindingId','capabilities',ctx->'capabilities','employmentLinked',(ctx->>'employmentLinked')::boolean),
  'limits',jsonb_build_object('maxRecords',500,'maxHistory',100),'payrollTypes','["monthly","first_fortnight","sac","vacation","supplementary","final","other"]'::jsonb,'effects',public.payroll_fixed_registry_effects_v1());
END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_employee_v1(p_context jsonb,p_legajo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context);
 RETURN jsonb_build_object('version','payroll-fixed-employee.v1','subject',public.payroll_fixed_registry_subject_v1(ctx,p_legajo,true)->'subject');
END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_list_v1(p_context jsonb,p_period date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; rows_json jsonb; row_count integer; fingerprint text; month_end date;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context); PERFORM public.payroll_fixed_registry_lock_v1(ctx);
 IF p_period IS NOT NULL AND (p_period NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-01' OR extract(day FROM p_period)<>1) THEN RAISE EXCEPTION 'PAYROLL_FIXED_DATES_INVALID'; END IF;
 month_end:=(p_period+interval '1 month - 1 day')::date;
 WITH items AS MATERIALIZED(SELECT public.payroll_fixed_registry_record_json_v1(ctx,n) item FROM public.payroll_fixed_novelty n
  WHERE n.tenant_id=(ctx->>'tenantId')::uuid AND n.certified_binding_id=(ctx->>'certifiedBindingId')::uuid),
 filtered AS (SELECT item FROM items WHERE p_period IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(jsonb_build_array(item->'approved',item->'latest')) p
  WHERE p->>'operation'='set' AND (p#>>'{values,validFrom}')::date<=month_end AND ((p#>>'{values,validTo}') IS NULL OR (p#>>'{values,validTo}')::date>=p_period)))
 SELECT count(*)::integer,coalesce(jsonb_agg(item ORDER BY item->>'id'),'[]'::jsonb) INTO row_count,rows_json FROM filtered;
 IF row_count>500 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ROW_LIMIT'; END IF;
 fingerprint:=encode(digest(convert_to(jsonb_build_object('tenantId',ctx->>'tenantId','bindingId',ctx->>'certifiedBindingId','membershipId',ctx->>'membershipId',
  'periodMonth',to_char(p_period,'YYYY-MM-DD'),'rows',rows_json)::text,'UTF8'),'sha256'),'hex');
 RETURN jsonb_build_object('version','payroll-fixed-list.v1','periodMonth',to_char(p_period,'YYYY-MM-DD'),'rows',rows_json,'total',row_count,'snapshotToken',fingerprint,'effects',public.payroll_fixed_registry_effects_v1());
END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_validate_values_v1(v jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE date_from date; date_to date;
BEGIN
 IF v IS NULL OR jsonb_typeof(v)<>'object' THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 IF NOT v ?& ARRAY['conceptSourceId','costCenterSourceId','payrollType','quantityDecimal','amountCents','forced','forcedReason','legalInstrument','validFrom','validTo']
  OR v-ARRAY['conceptSourceId','costCenterSourceId','payrollType','quantityDecimal','amountCents','forced','forcedReason','legalInstrument','validFrom','validTo']<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_each(v-'forced') e WHERE jsonb_typeof(e.value) NOT IN ('string','null'))
  OR jsonb_typeof(v->'forced') IS DISTINCT FROM 'boolean'
  OR coalesce(v->>'conceptSourceId','') !~ '^(0|[1-9][0-9]{0,19})$'
  OR (v->>'costCenterSourceId' IS NOT NULL AND v->>'costCenterSourceId' !~ '^(0|[1-9][0-9]{0,19})$')
  OR coalesce(v->>'payrollType','') NOT IN ('monthly','first_fortnight','sac','vacation','supplementary','final','other')
  OR NOT public.payroll_fixed_registry_text_v1(v->>'legalInstrument',5,300)
  OR (v->>'quantityDecimal' IS NOT NULL AND (v->>'quantityDecimal' !~ '^-?(0|[1-9][0-9]{0,11})([.][0-9]{1,6})?$' OR v->>'quantityDecimal' ~ '^-0([.]0+)?$'))
  OR (v->>'amountCents' IS NOT NULL AND (v->>'amountCents' !~ '^-?(0|[1-9][0-9]{0,17})$' OR v->>'amountCents'='-0'))
  OR (v->>'quantityDecimal' IS NULL AND v->>'amountCents' IS NULL)
  OR (v->>'forced'='true' AND (v->>'amountCents' IS NULL OR NOT public.payroll_fixed_registry_text_v1(v->>'forcedReason',5,500)))
  OR (v->>'forced'='false' AND v->>'forcedReason' IS NOT NULL) THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 date_from:=public.payroll_fixed_registry_date_v1(v->>'validFrom'); date_to:=public.payroll_fixed_registry_date_v1(v->>'validTo',false);
 IF date_to<date_from THEN RAISE EXCEPTION 'PAYROLL_FIXED_DATES_INVALID'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_receipt_v1(item public.payroll_fixed_novelty_event,is_duplicate boolean) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('version','payroll-fixed-receipt.v1','command',item.command,'recordId',item.record_id,
  'proposalId',coalesce(item.proposal_id,item.id),'recordVersion',item.version,'duplicate',is_duplicate)
$$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_event_identity_v1(ctx jsonb,item public.payroll_fixed_novelty_event) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE root_row public.payroll_fixed_novelty%ROWTYPE;
BEGIN
 IF item.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR item.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 SELECT * INTO root_row FROM public.payroll_fixed_novelty n WHERE n.id=item.record_id;
 PERFORM public.payroll_fixed_registry_subject_v1(ctx,root_row.subject->>'legajo',true);
 IF NOT public.payroll_fixed_registry_identity_current_v1(ctx,root_row) THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_attempt_v1(p_context jsonb,p_command text,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; item public.payroll_fixed_novelty_event%ROWTYPE;
BEGIN
 IF p_command IS NULL OR p_command NOT IN ('propose','review') OR p_key IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 ctx:=public.payroll_fixed_registry_context_v1(p_context,CASE p_command WHEN 'propose' THEN 'payroll.fixed.prepare' ELSE 'payroll.fixed.approve' END);
 PERFORM public.payroll_fixed_registry_lock_v1(ctx);
 SELECT * INTO item FROM public.payroll_fixed_novelty_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.certified_binding_id=(ctx->>'certifiedBindingId')::uuid
  AND e.actor_membership_id=(ctx->>'membershipId')::uuid AND e.idempotency_key=p_key AND e.command=p_command;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 PERFORM public.payroll_fixed_registry_event_identity_v1(ctx,item);
 RETURN public.payroll_fixed_registry_receipt_v1(item,true);
END $$;
CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_propose_v1(p_context jsonb,p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; subject_value jsonb; root_row public.payroll_fixed_novelty%ROWTYPE; previous public.payroll_fixed_novelty_event%ROWTYPE;
 event_row public.payroll_fixed_novelty_event%ROWTYPE; view_json jsonb; request_hash text; root_id uuid; expected integer; prior_time timestamptz;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context,'payroll.fixed.prepare'); PERFORM public.payroll_fixed_registry_lock_v1(ctx);
 IF p_key IS NULL OR p_key::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDEMPOTENCY_KEY_INVALID'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 IF NOT p_payload ?& ARRAY['recordId','expectedVersion','contractId','legajo','identityToken','operation','values','reason']
  OR p_payload-ARRAY['recordId','expectedVersion','contractId','legajo','identityToken','operation','values','reason']<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_each(p_payload-ARRAY['expectedVersion','values']) e WHERE jsonb_typeof(e.value) NOT IN ('string','null'))
  OR jsonb_typeof(p_payload->'expectedVersion') IS DISTINCT FROM 'number' OR coalesce(p_payload->>'expectedVersion','') !~ '^(0|[1-9][0-9]{0,2})$'
  OR (p_payload->>'recordId' IS NOT NULL AND p_payload->>'recordId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
  OR coalesce(p_payload->>'contractId','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR coalesce(p_payload->>'legajo','') !~ '^(0|[1-9][0-9]{0,19})$' OR coalesce(p_payload->>'identityToken','') !~ '^[a-f0-9]{64}$'
  OR coalesce(p_payload->>'operation','') NOT IN ('set','annul') OR NOT public.payroll_fixed_registry_text_v1(p_payload->>'reason',5,500) THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 expected:=(p_payload->>'expectedVersion')::integer;
 IF p_payload->>'recordId' IS NULL AND (expected<>0 OR p_payload->>'operation'<>'set') OR p_payload->>'recordId' IS NOT NULL AND expected<1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 IF p_payload->>'operation'='set' THEN PERFORM public.payroll_fixed_registry_validate_values_v1(p_payload->'values');
 ELSIF p_payload->'values'<>'null'::jsonb THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 request_hash:=encode(digest(convert_to(jsonb_build_object('command','propose','payload',p_payload)::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO previous FROM public.payroll_fixed_novelty_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.certified_binding_id=(ctx->>'certifiedBindingId')::uuid
  AND e.actor_membership_id=(ctx->>'membershipId')::uuid AND e.idempotency_key=p_key;
 IF FOUND THEN
  IF previous.command<>'propose' OR previous.request_sha256<>request_hash THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDEMPOTENCY_REUSE'; END IF;
  PERFORM public.payroll_fixed_registry_event_identity_v1(ctx,previous); RETURN public.payroll_fixed_registry_receipt_v1(previous,true);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employment_contract c JOIN public.source_import_batch b ON b.id=c.source_batch_id
  WHERE c.id=(p_payload->>'contractId')::uuid AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published') THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 subject_value:=public.payroll_fixed_registry_subject_v1(ctx,p_payload->>'legajo',true);
 IF subject_value#>>'{subject,contractId}'<>p_payload->>'contractId' OR subject_value#>>'{subject,identityToken}'<>p_payload->>'identityToken' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 root_id:=(p_payload->>'recordId')::uuid;
 IF root_id IS NOT NULL THEN
  SELECT * INTO root_row FROM public.payroll_fixed_novelty n WHERE n.id=root_id AND n.tenant_id=(ctx->>'tenantId')::uuid AND n.certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
  IF root_row.identity_token<>p_payload->>'identityToken' OR root_row.employment_contract_id::text<>p_payload->>'contractId'
   OR root_row.person_id::text<>subject_value->>'personId' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
  view_json:=public.payroll_fixed_registry_record_json_v1(ctx,root_row);
  IF (view_json->>'version')::integer<>expected THEN RAISE EXCEPTION 'PAYROLL_FIXED_VERSION_CONFLICT'; END IF;
  IF view_json->'pending'<>'null'::jsonb THEN RAISE EXCEPTION 'PAYROLL_FIXED_PENDING_EXISTS'; END IF;
  IF expected>=200 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ROW_LIMIT'; END IF;
  IF p_payload->>'operation'='annul' AND view_json#>>'{approved,operation}' IS DISTINCT FROM 'set' THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 ELSE
  IF (SELECT count(*) FROM public.payroll_fixed_novelty n WHERE n.tenant_id=(ctx->>'tenantId')::uuid AND n.certified_binding_id=(ctx->>'certifiedBindingId')::uuid)>=500 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ROW_LIMIT'; END IF;
 END IF;
 PERFORM public.payroll_fixed_registry_capacity_v1();
 IF root_id IS NULL THEN
  INSERT INTO public.payroll_fixed_novelty(tenant_id,certified_binding_id,employment_contract_id,person_id,identity_token,subject)
  VALUES((ctx->>'tenantId')::uuid,(ctx->>'certifiedBindingId')::uuid,(p_payload->>'contractId')::uuid,(subject_value->>'personId')::uuid,p_payload->>'identityToken',subject_value->'subject') RETURNING id INTO root_id;
 END IF;
 SELECT max(e.occurred_at) INTO prior_time FROM public.payroll_fixed_novelty_event e WHERE e.record_id=root_id;
 INSERT INTO public.payroll_fixed_novelty_event(tenant_id,certified_binding_id,record_id,version,command,payload,actor_membership_id,actor_person_id,actor_email,actor_session_id,idempotency_key,request_sha256,occurred_at)
 VALUES((ctx->>'tenantId')::uuid,(ctx->>'certifiedBindingId')::uuid,root_id,expected+1,'propose',p_payload,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,
  ctx->>'actorEmail',(ctx->>'actorSessionId')::uuid,p_key,request_hash,greatest(clock_timestamp(),prior_time+interval '1 microsecond')) RETURNING * INTO event_row;
 RETURN public.payroll_fixed_registry_receipt_v1(event_row,false);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_review_v1(p_context jsonb,p_payload jsonb,p_key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; root_row public.payroll_fixed_novelty%ROWTYPE; proposal_row public.payroll_fixed_novelty_event%ROWTYPE; previous public.payroll_fixed_novelty_event%ROWTYPE;
 event_row public.payroll_fixed_novelty_event%ROWTYPE; view_json jsonb; request_hash text; expected integer; v jsonb; prior_time timestamptz;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context,'payroll.fixed.approve'); PERFORM public.payroll_fixed_registry_lock_v1(ctx);
 IF p_key IS NULL OR p_key::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDEMPOTENCY_KEY_INVALID'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 IF NOT p_payload ?& ARRAY['recordId','proposalId','expectedVersion','decision','reason'] OR p_payload-ARRAY['recordId','proposalId','expectedVersion','decision','reason']<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_each(p_payload-'expectedVersion') e WHERE jsonb_typeof(e.value)<>'string')
  OR jsonb_typeof(p_payload->'expectedVersion') IS DISTINCT FROM 'number' OR coalesce(p_payload->>'expectedVersion','') !~ '^[1-9][0-9]{0,2}$'
  OR coalesce(p_payload->>'recordId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR coalesce(p_payload->>'proposalId','') !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR coalesce(p_payload->>'decision','') NOT IN ('approve','reject') OR NOT public.payroll_fixed_registry_text_v1(p_payload->>'reason',5,500) THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 request_hash:=encode(digest(convert_to(jsonb_build_object('command','review','payload',p_payload)::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO previous FROM public.payroll_fixed_novelty_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.certified_binding_id=(ctx->>'certifiedBindingId')::uuid
  AND e.actor_membership_id=(ctx->>'membershipId')::uuid AND e.idempotency_key=p_key;
 IF FOUND THEN
  IF previous.command<>'review' OR previous.request_sha256<>request_hash THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDEMPOTENCY_REUSE'; END IF;
  PERFORM public.payroll_fixed_registry_event_identity_v1(ctx,previous); RETURN public.payroll_fixed_registry_receipt_v1(previous,true);
 END IF;
 SELECT * INTO root_row FROM public.payroll_fixed_novelty n WHERE n.id=(p_payload->>'recordId')::uuid AND n.tenant_id=(ctx->>'tenantId')::uuid AND n.certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 PERFORM public.payroll_fixed_registry_subject_v1(ctx,root_row.subject->>'legajo',true);
 IF NOT public.payroll_fixed_registry_identity_current_v1(ctx,root_row) THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 view_json:=public.payroll_fixed_registry_record_json_v1(ctx,root_row); expected:=(p_payload->>'expectedVersion')::integer;
 IF (view_json->>'version')::integer<>expected OR view_json#>>'{pending,id}' IS DISTINCT FROM p_payload->>'proposalId' THEN RAISE EXCEPTION 'PAYROLL_FIXED_VERSION_CONFLICT'; END IF;
 SELECT * INTO proposal_row FROM public.payroll_fixed_novelty_event e WHERE e.id=(p_payload->>'proposalId')::uuid AND e.record_id=root_row.id AND e.command='propose';
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 IF proposal_row.actor_membership_id=(ctx->>'membershipId')::uuid OR proposal_row.actor_person_id=(ctx->>'actorPersonId')::uuid OR proposal_row.actor_email=ctx->>'actorEmail' THEN RAISE EXCEPTION 'PAYROLL_FIXED_MAKER_CHECKER_REQUIRED'; END IF;
 IF p_payload->>'decision'='approve' AND proposal_row.payload->>'operation'='set' THEN
  v:=proposal_row.payload->'values';
  IF EXISTS(
   SELECT 1 FROM public.payroll_fixed_novelty n CROSS JOIN LATERAL(
    SELECT p.payload->'values' data,p.payload->>'operation' operation FROM public.payroll_fixed_novelty_event p
    JOIN public.payroll_fixed_novelty_event r ON r.proposal_id=p.id AND r.payload->>'decision'='approve'
    WHERE p.record_id=n.id ORDER BY p.version DESC LIMIT 1
   ) approved WHERE n.tenant_id=root_row.tenant_id AND n.certified_binding_id=root_row.certified_binding_id AND n.id<>root_row.id
    AND n.employment_contract_id=root_row.employment_contract_id AND n.person_id=root_row.person_id AND n.identity_token=root_row.identity_token
    AND approved.operation='set' AND approved.data->>'conceptSourceId'=v->>'conceptSourceId'
    AND approved.data->>'costCenterSourceId' IS NOT DISTINCT FROM v->>'costCenterSourceId' AND approved.data->>'payrollType'=v->>'payrollType'
    AND (approved.data->>'validTo' IS NULL OR (approved.data->>'validTo')::date >= (v->>'validFrom')::date)
    AND (v->>'validTo' IS NULL OR (v->>'validTo')::date >= (approved.data->>'validFrom')::date)
  ) THEN RAISE EXCEPTION 'PAYROLL_FIXED_OVERLAP'; END IF;
 END IF;
 PERFORM public.payroll_fixed_registry_capacity_v1();
 SELECT max(e.occurred_at) INTO prior_time FROM public.payroll_fixed_novelty_event e WHERE e.record_id=root_row.id;
 INSERT INTO public.payroll_fixed_novelty_event(tenant_id,certified_binding_id,record_id,version,command,proposal_id,payload,actor_membership_id,actor_person_id,actor_email,actor_session_id,idempotency_key,request_sha256,occurred_at)
 VALUES(root_row.tenant_id,root_row.certified_binding_id,root_row.id,expected+1,'review',proposal_row.id,p_payload,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,
  ctx->>'actorEmail',(ctx->>'actorSessionId')::uuid,p_key,request_hash,greatest(clock_timestamp(),prior_time+interval '1 microsecond')) RETURNING * INTO event_row;
 RETURN public.payroll_fixed_registry_receipt_v1(event_row,false);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_export_v1(p_context jsonb,p_period date,p_snapshot text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; current_list jsonb; rows_json jsonb; month_end date;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context,'payroll.novelty.export'); PERFORM public.payroll_fixed_registry_lock_v1(ctx);
 IF p_period IS NULL OR p_snapshot IS NULL OR p_snapshot !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 LOCK TABLE public.employment_contract,public.source_import_batch,public.person_identity IN SHARE MODE NOWAIT;
 current_list:=public.payroll_fixed_registry_list_v1(p_context,p_period);
 IF current_list->>'snapshotToken'<>p_snapshot THEN RAISE EXCEPTION 'PAYROLL_FIXED_SNAPSHOT_CHANGED'; END IF;
 month_end:=(p_period+interval '1 month - 1 day')::date;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(current_list->'rows') r WHERE r#>>'{approved,operation}'='set' AND r->>'identityCurrent'='false'
  AND (r#>>'{approved,values,validFrom}')::date<=month_end AND ((r#>>'{approved,values,validTo}') IS NULL OR (r#>>'{approved,values,validTo}')::date>=p_period)) THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('recordId',r->>'id','version',(r->>'version')::integer,'proposalId',r#>>'{approved,id}','subject',r->'subject','values',r#>'{approved,values}') ORDER BY r->>'id'),'[]'::jsonb)
 INTO rows_json FROM jsonb_array_elements(current_list->'rows') r WHERE r#>>'{approved,operation}'='set' AND (r#>>'{approved,values,validFrom}')::date<=month_end
  AND ((r#>>'{approved,values,validTo}') IS NULL OR (r#>>'{approved,values,validTo}')::date>=p_period);
 RETURN jsonb_build_object('version','payroll-fixed-export.v1','periodMonth',to_char(p_period,'YYYY-MM-DD'),'snapshotToken',p_snapshot,'rows',rows_json,'total',jsonb_array_length(rows_json),'effects',public.payroll_fixed_registry_effects_v1());
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_detail_v1(p_context jsonb,p_record uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; item public.payroll_fixed_novelty%ROWTYPE; view_json jsonb; history_json jsonb; history_count integer;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context); PERFORM public.payroll_fixed_registry_lock_v1(ctx);
 SELECT * INTO item FROM public.payroll_fixed_novelty n WHERE n.id=p_record AND n.tenant_id=(ctx->>'tenantId')::uuid AND n.certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 view_json:=public.payroll_fixed_registry_record_json_v1(ctx,item);
 SELECT count(*)::integer,jsonb_agg(public.payroll_fixed_registry_proposal_json_v1(ctx,e,(view_json->>'identityCurrent')::boolean) ORDER BY e.version DESC)
 INTO history_count,history_json FROM public.payroll_fixed_novelty_event e WHERE e.record_id=p_record AND e.command='propose';
 IF history_count>100 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ROW_LIMIT'; END IF;
 RETURN jsonb_build_object('version','payroll-fixed-detail.v1','record',view_json,'history',history_json);
END $$;

REVOKE ALL ON public.payroll_fixed_novelty,public.payroll_fixed_novelty_event FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_fixed_registry_immutable_v1(),public.payroll_fixed_registry_context_v1(jsonb,text),public.payroll_fixed_registry_lock_v1(jsonb),public.payroll_fixed_registry_capacity_v1(),
 public.payroll_fixed_registry_effects_v1(),public.payroll_fixed_registry_date_v1(text,boolean),public.payroll_fixed_registry_text_v1(text,integer,integer),public.payroll_fixed_registry_subject_v1(jsonb,text,boolean),
 public.payroll_fixed_registry_identity_current_v1(jsonb,public.payroll_fixed_novelty),public.payroll_fixed_registry_proposal_json_v1(jsonb,public.payroll_fixed_novelty_event,boolean),
 public.payroll_fixed_registry_record_json_v1(jsonb,public.payroll_fixed_novelty),public.payroll_fixed_registry_validate_values_v1(jsonb),public.payroll_fixed_registry_receipt_v1(public.payroll_fixed_novelty_event,boolean),
 public.payroll_fixed_registry_event_identity_v1(jsonb,public.payroll_fixed_novelty_event),public.payroll_fixed_registry_bootstrap_v1(jsonb),public.payroll_fixed_registry_employee_v1(jsonb,text),
 public.payroll_fixed_registry_list_v1(jsonb,date),public.payroll_fixed_registry_detail_v1(jsonb,uuid),public.payroll_fixed_registry_attempt_v1(jsonb,text,uuid),
 public.payroll_fixed_registry_propose_v1(jsonb,jsonb,uuid),public.payroll_fixed_registry_review_v1(jsonb,jsonb,uuid),public.payroll_fixed_registry_export_v1(jsonb,date,text)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_fixed_registry_bootstrap_v1(jsonb),public.payroll_fixed_registry_employee_v1(jsonb,text),public.payroll_fixed_registry_list_v1(jsonb,date),
 public.payroll_fixed_registry_detail_v1(jsonb,uuid),public.payroll_fixed_registry_attempt_v1(jsonb,text,uuid),public.payroll_fixed_registry_propose_v1(jsonb,jsonb,uuid),
 public.payroll_fixed_registry_review_v1(jsonb,jsonb,uuid),public.payroll_fixed_registry_export_v1(jsonb,date,text) TO municontrol_actions_runtime_app;
