-- Complete period declarations of partial seniority, title and unhealthy work.
-- Own registered contracts only; no legacy resolution or formula evaluation.
-- Technical installation protocol and consumer integration remain separate.
DO $prerequisite$ BEGIN
 IF to_regclass('public.own_salary_conditions_event') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_salary_conditions_%')
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.native_salary_administrative_context_v1(jsonb)') IS NULL
 OR to_regprocedure('public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)') IS NULL
 OR to_regprocedure('public.payroll_fixed_registry_range_v2(jsonb,uuid,date,date,boolean)') IS NULL
 OR to_regprocedure('public.own_program_exact_v1(jsonb,text[])') IS NULL
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_PREREQUISITE';END IF;
END $prerequisite$;

CREATE TABLE public.own_salary_conditions_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 period_month date NOT NULL CHECK(extract(day FROM period_month)=1 AND period_month BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'),
 proposal_id uuid REFERENCES public.own_salary_conditions_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=4194304),
 base_items jsonb NOT NULL CHECK(jsonb_typeof(base_items)='array' AND octet_length(base_items::text)<=4194304),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object' AND octet_length(source_snapshot::text)<=8388608),
 revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),actor_membership_id uuid NOT NULL,
 actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),actor_label text NOT NULL,
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK((command='propose')=(proposal_id IS NULL)),
 UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_salary_conditions_approval_revision ON public.own_salary_conditions_event(tenant_id,source_binding_id,period_month,revision) WHERE command='approve';
CREATE INDEX own_salary_conditions_period ON public.own_salary_conditions_event(tenant_id,source_binding_id,period_month);
ALTER TABLE public.own_salary_conditions_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_salary_conditions_event FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.own_salary_conditions_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'SALARY_CONDITIONS_IMMUTABLE';END $$;
CREATE TRIGGER own_salary_conditions_immutable BEFORE UPDATE OR DELETE ON public.own_salary_conditions_event FOR EACH ROW EXECUTE FUNCTION public.own_salary_conditions_immutable_v1();
CREATE TRIGGER own_salary_conditions_no_truncate BEFORE TRUNCATE ON public.own_salary_conditions_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_salary_conditions_immutable_v1();

CREATE FUNCTION public.own_salary_conditions_context_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);
 -- This source includes the whole nominal cohort, unlike the public master.
 IF public.action_center_context_has_capability(ctx,'payroll.calculation.nominal.read') IS NOT TRUE THEN RAISE EXCEPTION 'SALARY_CONDITIONS_FORBIDDEN';END IF;
 RETURN ctx;
END $$;

CREATE FUNCTION public.own_salary_conditions_definition_v1(d jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE t jsonb;date_value text;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 OR public.own_program_exact_v1(d,ARRAY['partialSeniorityYears','title','unhealthyWork','asOfDate','documentReference']) IS NOT TRUE
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 IF d->'partialSeniorityYears' IS DISTINCT FROM 'null'::jsonb AND
 (jsonb_typeof(d->'partialSeniorityYears') IS DISTINCT FROM 'string' OR d->>'partialSeniorityYears'!~'^(0|[1-9][0-9]{0,17})$')
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 t:=d->'title';
 IF public.own_program_exact_v1(t,ARRAY['status','code','percentage']) IS NOT TRUE
 OR jsonb_typeof(t->'status') IS DISTINCT FROM 'string' OR coalesce(t->>'status' IN('not_reported','none','declared'),false) IS NOT TRUE
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 IF t->>'status'='declared' THEN
  IF jsonb_typeof(t->'code') IS DISTINCT FROM 'string' OR t->>'code'!~'^[0-9]{1,9}$'
  OR t->'percentage' IS DISTINCT FROM 'null'::jsonb AND
   (jsonb_typeof(t->'percentage') IS DISTINCT FROM 'string' OR t->>'percentage'!~'^(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$')
  THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 ELSE
  IF t->'code' IS DISTINCT FROM 'null'::jsonb OR t->'percentage' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 END IF;
 IF d->'unhealthyWork' IS DISTINCT FROM 'null'::jsonb AND jsonb_typeof(d->'unhealthyWork') IS DISTINCT FROM 'boolean'
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 IF public.own_program_text_v1(d->'documentReference',3,180) IS NOT TRUE THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 date_value:=d->>'asOfDate';
 IF jsonb_typeof(d->'asOfDate') IS DISTINCT FROM 'string' OR date_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
 OR NOT pg_input_is_valid(date_value,'date')
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 IF to_char(date_value::date,'YYYY-MM-DD')<>date_value OR left(date_value,7)>period_value
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 RETURN d;
END $$;

CREATE FUNCTION public.own_salary_conditions_items_v1(items jsonb,period_value text,allow_empty boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item jsonb;prior_id text:='';id_value text;
BEGIN
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items)>10000
 OR NOT allow_empty AND jsonb_array_length(items)=0 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 IF octet_length(items::text)>4194304 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_LIMIT';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF public.own_program_exact_v1(item,ARRAY['contractId','identityToken','definition']) IS NOT TRUE
  OR jsonb_typeof(item->'contractId') IS DISTINCT FROM 'string' OR item->>'contractId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(item->'identityToken') IS DISTINCT FROM 'string' OR item->>'identityToken'!~'^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
  id_value:=item->>'contractId';IF id_value COLLATE "C"<=prior_id COLLATE "C" THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;prior_id:=id_value;
  PERFORM public.own_salary_conditions_definition_v1(item->'definition',period_value);
 END LOOP;
 RETURN items;
END $$;

CREATE FUNCTION public.own_salary_conditions_lock_v1(ctx jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-salary-conditions:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_BUSY';END IF;
 LOCK TABLE public.native_employee_registration,public.employment_contract,public.person_identity,
 public.platform_tenant_source_binding,public.employment_adoption_application,public.employment_adoption_decision,
 public.employment_adoption_proposal,public.native_employment_lifecycle_review IN SHARE MODE NOWAIT;
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SALARY_CONDITIONS_BUSY';
END $$;

CREATE FUNCTION public.own_salary_conditions_source_v1(ctx jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE subjects jsonb;first_date date;last_date date;invalid_subject boolean;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 first_date:=(period_value||'-01')::date;last_date:=(first_date+interval '1 month'-interval '1 day')::date;
 ctx:=ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId');
 -- Range is evaluated by the published own lifecycle reader. No status/date
 -- approximation is made and registered historical contracts remain stored.
 WITH owned AS MATERIALIZED(
  SELECT r.contract_id AS id FROM public.native_employee_registration r
  WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid
 ),eligible AS MATERIALIZED(
  SELECT id FROM owned WHERE public.payroll_fixed_registry_range_v2(ctx,id,first_date,last_date,false)
 ),verified AS MATERIALIZED(
  SELECT id,public.payroll_fixed_registry_subject_v2(ctx,id,true)->'subject' AS subject FROM eligible
 ) SELECT coalesce(jsonb_agg(subject ORDER BY id),'[]'),coalesce(bool_or(
  public.own_program_exact_v1(subject,ARRAY['contractId','registrationId','legajo','employeeName','identityToken','sourceCutoff','origin','registeredAt']) IS NOT TRUE
  OR subject->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR subject->>'contractId' IS DISTINCT FROM id::text),false)
 INTO subjects,invalid_subject FROM verified;
 IF invalid_subject OR EXISTS(SELECT 1 FROM jsonb_array_elements(subjects) s GROUP BY s->>'contractId' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_SOURCE_REQUIRED';END IF;
 IF jsonb_array_length(subjects)>10000 OR octet_length(subjects::text)>8388608 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_LIMIT';END IF;
 RETURN jsonb_build_object('subjects',subjects,'version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-salary-conditions.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,subjects)),'sha256'),'hex'));
END $$;

CREATE FUNCTION public.own_salary_conditions_scope_v1(ctx jsonb,period_value text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-salary-conditions.v1',public.native_salary_scope_v1(ctx),period_value)),'sha256'),'hex')
$$;

CREATE FUNCTION public.own_salary_conditions_session_live_v1(p jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_identity_session s WHERE s.id=(p->>'actorSessionId')::uuid AND s.session_version=(p->>'actorSessionVersion')::integer
 AND s.status='active' AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '1 hour') THEN RAISE EXCEPTION 'ACTION_SESSION_INVALID';END IF;
END $$;

CREATE FUNCTION public.own_salary_conditions_current_v1(ctx jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.own_salary_conditions_event;p public.own_salary_conditions_event;rev integer;items jsonb;
BEGIN
 SELECT * INTO e FROM public.own_salary_conditions_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND x.period_month=(period_value||'-01')::date AND x.command='approve' ORDER BY x.revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO p FROM public.own_salary_conditions_event WHERE id=e.proposal_id;END IF;items:=coalesce(p.body->'items','[]');
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-salary-conditions.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,rev,e.id,items)),'sha256'),'hex'),
 'revision',rev,'items',items,'proposalId',p.id,'approvalId',e.id);
END $$;

CREATE FUNCTION public.own_salary_conditions_summary_v1(ctx jsonb,e public.own_salary_conditions_event) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_salary_conditions_event;independent boolean;
BEGIN
 SELECT * INTO d FROM public.own_salary_conditions_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND coalesce((ctx->>'parameterActorVerified')::boolean,false)
 AND ctx->>'actorPersonId' IS NOT NULL AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'requestSha256',e.request_sha256,'baseVersion',e.body->>'baseVersion','sourceVersion',e.body->>'sourceVersion',
 'itemCount',jsonb_array_length(e.body->'items'),'reason',e.body->>'reason','createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,
 'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,
 'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;

CREATE FUNCTION public.own_salary_conditions_bootstrap_v1(p jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;source_value jsonb;proposals jsonb;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 ctx:=public.own_salary_conditions_context_v1(p);PERFORM public.own_salary_conditions_lock_v1(ctx);source_value:=public.own_salary_conditions_source_v1(ctx,period_value);
 SELECT coalesce(jsonb_agg(public.own_salary_conditions_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals
 FROM public.own_salary_conditions_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND e.period_month=(period_value||'-01')::date AND e.command='propose';
 IF jsonb_array_length(proposals)>1000 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_LIMIT';END IF;
 PERFORM public.own_salary_conditions_session_live_v1(p);
 RETURN jsonb_build_object('version','own-contract-salary-conditions.v1','period',period_value,'scopeVersion',public.own_salary_conditions_scope_v1(ctx,period_value),
 'source',source_value,'configuration',public.own_salary_conditions_current_v1(ctx,period_value),'proposals',proposals,
 'permissions',jsonb_build_object('canPropose',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),
 'canReview',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),
 'complete',true,'payrollCalculated',false,'payrollPosted',false);
END $$;

CREATE FUNCTION public.own_salary_conditions_detail_v1(p jsonb,pid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_salary_conditions_event;source_value jsonb;configuration jsonb;period_value text;
BEGIN
 ctx:=public.own_salary_conditions_context_v1(p);PERFORM public.own_salary_conditions_lock_v1(ctx);
 SELECT * INTO e FROM public.own_salary_conditions_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'SALARY_CONDITIONS_NOT_FOUND';END IF;period_value:=to_char(e.period_month,'YYYY-MM');
 source_value:=public.own_salary_conditions_source_v1(ctx,period_value);configuration:=public.own_salary_conditions_current_v1(ctx,period_value);
 PERFORM public.own_salary_conditions_session_live_v1(p);
 RETURN jsonb_build_object('version','own-contract-salary-conditions.v1','period',period_value,'scopeVersion',public.own_salary_conditions_scope_v1(ctx,period_value),
 'proposal',public.own_salary_conditions_summary_v1(ctx,e),'body',e.body,'baseItems',e.base_items,'source',e.source_snapshot,
 'current',e.body->>'baseVersion'=configuration->>'version' AND e.body->>'sourceVersion'=source_value->>'version');
END $$;

CREATE FUNCTION public.own_salary_conditions_attempt_v1(p jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_salary_conditions_event;
BEGIN
 ctx:=public.own_salary_conditions_context_v1(p);
 SELECT * INTO e FROM public.own_salary_conditions_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'SALARY_CONDITIONS_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail'
 OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_FORBIDDEN';END IF;
 PERFORM public.own_salary_conditions_session_live_v1(p);
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;

CREATE FUNCTION public.own_salary_conditions_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;fresh jsonb;cmd text;period_value text;configuration jsonb;source_value jsonb;
 proposal public.own_salary_conditions_event;prior public.own_salary_conditions_event;
 eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_source jsonb;field text;added_bytes bigint;items_value jsonb;
 previous_timeout text:=current_setting('lock_timeout');limit_ms bigint;remaining_ms bigint;lock_deadline timestamptz;locked_relation text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_ISOLATION_REQUIRED';END IF;
 ctx:=public.own_salary_conditions_context_v1(p);cmd:=body->>'command';
 IF public.own_program_exact_v1(body,ARRAY['command','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','items','reason','reviewConfirmed']) IS NOT TRUE
 OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR public.own_program_text_v1(body->'reason',10,1000) IS NOT TRUE
 OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR octet_length(body::text)>4194304 OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 period_value:=body->>'period';
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion'] LOOP
  IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
 END LOOP;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_FORBIDDEN';END IF;
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-salary-conditions:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_BUSY';END IF;
 SELECT setting::bigint INTO STRICT limit_ms FROM pg_catalog.pg_settings WHERE name='lock_timeout';
 IF limit_ms<=0 OR limit_ms>1000 THEN limit_ms:=1000;END IF;lock_deadline:=clock_timestamp()+limit_ms*interval '1 millisecond';
 BEGIN
  FOREACH locked_relation IN ARRAY ARRAY['native_employee_registration','employment_contract','person_identity','platform_tenant_source_binding','employment_adoption_application','employment_adoption_decision','employment_adoption_proposal','native_employment_lifecycle_review'] LOOP
   remaining_ms:=floor(EXTRACT(EPOCH FROM(lock_deadline-clock_timestamp()))*1000)::bigint;
   IF remaining_ms<=0 THEN RAISE lock_not_available;END IF;
   PERFORM set_config('lock_timeout',remaining_ms::text||'ms',true);EXECUTE format('LOCK TABLE public.%I IN SHARE MODE',locked_relation);
  END LOOP;
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN PERFORM set_config('lock_timeout',previous_timeout,true);RAISE EXCEPTION 'SALARY_CONDITIONS_BUSY';
 END;
 PERFORM set_config('lock_timeout',previous_timeout,true);
 fresh:=public.own_salary_conditions_context_v1(p);
 IF public.native_salary_scope_v1(fresh) IS DISTINCT FROM public.native_salary_scope_v1(ctx) OR fresh->'capabilities' IS DISTINCT FROM ctx->'capabilities'
 OR fresh->'scopes' IS DISTINCT FROM ctx->'scopes' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_SCOPE_CHANGED';END IF;ctx:=fresh;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_FORBIDDEN';END IF;
 PERFORM public.own_salary_conditions_session_live_v1(p);
 PERFORM public.own_salary_conditions_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_salary_conditions_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint OR prior.body<>body THEN RAISE EXCEPTION 'SALARY_CONDITIONS_IDEMPOTENCY_REUSE';END IF;
  RETURN public.own_salary_conditions_attempt_v1(p,key);
 END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.own_salary_conditions_scope_v1(ctx,period_value) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_SCOPE_CHANGED';END IF;
 configuration:=public.own_salary_conditions_current_v1(ctx,period_value);rev:=(configuration->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->'proposalId' IS DISTINCT FROM 'null'::jsonb OR body->'proposalSha256' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
  source_value:=public.own_salary_conditions_source_v1(ctx,period_value);
  IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_BASE_CHANGED';END IF;
  items_value:=public.own_salary_conditions_items_v1(body->'items',period_value,false);
  IF jsonb_array_length(items_value)<>jsonb_array_length(source_value->'subjects') OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(items_value) WITH ORDINALITY i(value,ordinal)
   FULL JOIN jsonb_array_elements(source_value->'subjects') WITH ORDINALITY s(value,ordinal) USING(ordinal)
   WHERE i.value->>'contractId' IS DISTINCT FROM s.value->>'contractId' OR i.value->>'identityToken' IS DISTINCT FROM s.value->>'identityToken')
  THEN RAISE EXCEPTION 'SALARY_CONDITIONS_POPULATION_CHANGED';END IF;
  IF items_value=configuration->'items' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
  pid:=eid;baseline:=configuration->'items';captured_source:=source_value;
 ELSE
  IF body->'items' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;
  SELECT * INTO proposal FROM public.own_salary_conditions_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid
  AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period_month=(period_value||'-01')::date;
  IF NOT FOUND THEN RAISE EXCEPTION 'SALARY_CONDITIONS_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_salary_conditions_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_DECIDED';END IF;
  IF (public.own_salary_conditions_summary_v1(ctx,proposal)->>'canReview')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'SALARY_CONDITIONS_INDEPENDENT_REQUIRED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion'
  OR body->>'sourceVersion' IS DISTINCT FROM proposal.body->>'sourceVersion' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_items;captured_source:=proposal.source_snapshot;
  IF cmd='approve' THEN
   source_value:=public.own_salary_conditions_source_v1(ctx,period_value);
   IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'SALARY_CONDITIONS_BASE_CHANGED';END IF;
   items_value:=public.own_salary_conditions_items_v1(proposal.body->'items',period_value,false);rev:=rev+1;
   configuration:=jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-salary-conditions.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,rev,eid,items_value)),'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_salary_conditions_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period_month=(period_value||'-01')::date AND command='propose')>=1000 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-salary-conditions:capacity:v1',0)) THEN RAISE EXCEPTION 'SALARY_CONDITIONS_BUSY';END IF;
 added_bytes:=4*octet_length(body::text)+octet_length(baseline::text)+octet_length(captured_source::text);
 IF (SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_items::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_salary_conditions_event e)+added_bytes>536870912
 OR (SELECT sum(pg_database_size(oid)) FROM pg_database)+added_bytes+2097152>1056964608
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_LIMIT';END IF;
 -- A bounded wait or a large complete set must never keep an expired session
 -- alive through transaction-start now(). Check wall time before the insert.
 PERFORM public.own_salary_conditions_session_live_v1(p);
 receipt_value:=jsonb_build_object('version','own-contract-salary-conditions.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,
 'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'configurationVersion',configuration->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.own_salary_conditions_event(id,tenant_id,source_binding_id,period_month,proposal_id,command,body,base_items,source_snapshot,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(period_value||'-01')::date,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,baseline,captured_source,rev,
 (ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;

CREATE FUNCTION public.own_salary_conditions_capture_v1(ctx jsonb,employees jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE records jsonb;configuration jsonb;revision_value integer;approval uuid;identity_changed boolean;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(employees) IS DISTINCT FROM 'array' OR jsonb_array_length(employees)>10000 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_CAPTURE_INVALID';END IF;
 LOCK TABLE public.own_salary_conditions_event IN SHARE MODE NOWAIT;
 configuration:=public.own_salary_conditions_current_v1(ctx,period_value);revision_value:=(configuration->>'revision')::integer;approval:=(configuration->>'approvalId')::uuid;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(employees) e WHERE jsonb_typeof(e->'contractId') IS DISTINCT FROM 'string'
  OR e->>'contractId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(e->'identityToken') IS DISTINCT FROM 'string' OR e->>'identityToken'!~'^[a-f0-9]{64}$')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(employees) e GROUP BY e->>'contractId' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_CAPTURE_INVALID';END IF;
 WITH selected AS MATERIALIZED(SELECT value AS employee FROM jsonb_array_elements(employees)),
 facts AS MATERIALIZED(SELECT value AS item FROM jsonb_array_elements(configuration->'items'))
 SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',e.employee->>'contractId','identityToken',e.employee->>'identityToken',
  'revision',CASE WHEN f.item IS NULL THEN 0 ELSE revision_value END,'definition',f.item->'definition',
  'approvalId',CASE WHEN f.item IS NULL THEN NULL ELSE approval END) ORDER BY e.employee->>'contractId' COLLATE "C"),'[]'),
 coalesce(bool_or(f.item IS NOT NULL AND f.item->>'identityToken' IS DISTINCT FROM e.employee->>'identityToken'),false)
 INTO records,identity_changed FROM selected e LEFT JOIN facts f ON f.item->>'contractId'=e.employee->>'contractId';
 IF identity_changed THEN RAISE EXCEPTION 'SALARY_CONDITIONS_IDENTITY_CHANGED';END IF;
 IF octet_length(records::text)>4194304 THEN RAISE EXCEPTION 'SALARY_CONDITIONS_LIMIT';END IF;
 RETURN jsonb_build_object('complete',true,'records',records,'version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-salary-conditions.v1',period_value,records)),'sha256'),'hex'));
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SALARY_CONDITIONS_BUSY';
END $$;

REVOKE ALL ON FUNCTION public.own_salary_conditions_immutable_v1(),public.own_salary_conditions_context_v1(jsonb),public.own_salary_conditions_definition_v1(jsonb,text),public.own_salary_conditions_items_v1(jsonb,text,boolean),public.own_salary_conditions_lock_v1(jsonb),public.own_salary_conditions_source_v1(jsonb,text),public.own_salary_conditions_scope_v1(jsonb,text),public.own_salary_conditions_session_live_v1(jsonb),public.own_salary_conditions_current_v1(jsonb,text),public.own_salary_conditions_summary_v1(jsonb,public.own_salary_conditions_event),public.own_salary_conditions_bootstrap_v1(jsonb,text),public.own_salary_conditions_detail_v1(jsonb,uuid),public.own_salary_conditions_attempt_v1(jsonb,uuid),public.own_salary_conditions_command_v1(jsonb,jsonb,uuid),public.own_salary_conditions_capture_v1(jsonb,jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_salary_conditions_bootstrap_v1(jsonb,text),public.own_salary_conditions_detail_v1(jsonb,uuid),public.own_salary_conditions_attempt_v1(jsonb,uuid),public.own_salary_conditions_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
