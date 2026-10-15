-- Complete period declarations of agreement monthly hours.
-- Independently approved own classification only; no GRH fallback, contract
-- hour substitution, clock normalization or formula evaluation.
-- Technical installation protocol and consumer integration remain separate.
DO $prerequisite$ BEGIN
 IF to_regclass('public.own_agreement_working_time_event') IS NOT NULL
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_agreement_working_time_%')
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.native_salary_administrative_context_v1(jsonb)') IS NULL
 OR to_regclass('public.native_employment_catalog_review') IS NULL
 OR to_regclass('public.native_employment_catalog_proposal') IS NULL
 OR to_regprocedure('public.native_employment_catalog_items_v1(jsonb)') IS NULL
 OR to_regprocedure('public.native_employment_catalog_capacity_v1(integer)') IS NULL
 OR to_regprocedure('public.own_program_exact_v1(jsonb,text[])') IS NULL
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_PREREQUISITE';END IF;
END $prerequisite$;

CREATE TABLE public.own_agreement_working_time_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 period_month date NOT NULL CHECK(extract(day FROM period_month)=1 AND period_month BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'),
 proposal_id uuid REFERENCES public.own_agreement_working_time_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
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
CREATE UNIQUE INDEX own_agreement_working_time_approval_revision ON public.own_agreement_working_time_event(tenant_id,source_binding_id,period_month,revision) WHERE command='approve';
CREATE INDEX own_agreement_working_time_period ON public.own_agreement_working_time_event(tenant_id,source_binding_id,period_month);
ALTER TABLE public.own_agreement_working_time_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_agreement_working_time_event FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.own_agreement_working_time_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_IMMUTABLE';END $$;
CREATE TRIGGER own_agreement_working_time_immutable BEFORE UPDATE OR DELETE ON public.own_agreement_working_time_event FOR EACH ROW EXECUTE FUNCTION public.own_agreement_working_time_immutable_v1();
CREATE TRIGGER own_agreement_working_time_no_truncate BEFORE TRUNCATE ON public.own_agreement_working_time_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_agreement_working_time_immutable_v1();

CREATE FUNCTION public.own_agreement_working_time_context_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN RETURN public.native_salary_administrative_context_v1(p);END $$;


CREATE FUNCTION public.own_agreement_working_time_definition_v1(d jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE date_value text;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 OR public.own_program_exact_v1(d,ARRAY['monthlyHours','asOfDate','documentReference']) IS NOT TRUE
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 IF d->'monthlyHours' IS DISTINCT FROM 'null'::jsonb AND
 (jsonb_typeof(d->'monthlyHours') IS DISTINCT FROM 'string' OR d->>'monthlyHours'!~'^(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$')
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 IF public.own_program_text_v1(d->'documentReference',3,180) IS NOT TRUE THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 date_value:=d->>'asOfDate';
 IF jsonb_typeof(d->'asOfDate') IS DISTINCT FROM 'string' OR date_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
 OR NOT pg_input_is_valid(date_value,'date') THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 IF to_char(date_value::date,'YYYY-MM-DD')<>date_value OR left(date_value,7)>period_value THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 RETURN d;
END $$;


CREATE FUNCTION public.own_agreement_working_time_items_v1(items jsonb,period_value text,allow_empty boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item jsonb;prior_code text:='';code_value text;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 OR jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items)>10000 OR NOT allow_empty AND jsonb_array_length(items)=0
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 IF octet_length(items::text)>4194304 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_LIMIT';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF public.own_program_exact_v1(item,ARRAY['agreementCode','agreementToken','definition']) IS NOT TRUE
  OR jsonb_typeof(item->'agreementCode') IS DISTINCT FROM 'string' OR item->>'agreementCode'!~'^[0-9]{1,9}$'
  OR jsonb_typeof(item->'agreementToken') IS DISTINCT FROM 'string' OR item->>'agreementToken'!~'^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
  code_value:=item->>'agreementCode';IF code_value COLLATE "C"<=prior_code COLLATE "C" THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;prior_code:=code_value;
  PERFORM public.own_agreement_working_time_definition_v1(item->'definition',period_value);
 END LOOP;
 RETURN items;
END $$;


CREATE FUNCTION public.own_agreement_working_time_lock_v1(ctx jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-agreement-working-time:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_BUSY';END IF;
END $$;


CREATE FUNCTION public.own_agreement_working_time_source_v1(ctx jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE catalogue jsonb;items jsonb;agreements jsonb;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 SELECT jsonb_build_object('items',p.items,'version',r.catalog_version,'origin','MUNICONTROL','revision',r.revision)
 INTO catalogue FROM public.native_employment_catalog_review r
 JOIN public.native_employment_catalog_proposal p ON p.id=r.proposal_id
 WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND r.decision='approve' ORDER BY r.revision DESC LIMIT 1;
 IF catalogue->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR coalesce((catalogue->>'revision')::integer,0)<=0
 OR jsonb_typeof(catalogue->'version') IS DISTINCT FROM 'string' OR catalogue->>'version'!~'^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_SOURCE_REQUIRED';END IF;
 items:=public.native_employment_catalog_items_v1(catalogue->'items');
 SELECT coalesce(jsonb_agg(jsonb_build_object('agreementCode',r->>'code','label',r->>'label',
  'registrationAllowed',coalesce((r->>'registrationAllowed')::boolean,true),
  'agreementToken',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-agreement-working-time.v1',ctx->>'tenantId',ctx->>'sourceBindingId',r)),'sha256'),'hex'))
  ORDER BY r->>'code' COLLATE "C"),'[]') INTO agreements FROM jsonb_array_elements(items) r WHERE r->>'kind'='agreements';
 IF jsonb_array_length(agreements)>10000 OR octet_length(agreements::text)>4194304 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_LIMIT';END IF;
 RETURN jsonb_build_object('agreements',agreements,'version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-agreement-working-time.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,catalogue->>'version',agreements)),'sha256'),'hex'));
END $$;


CREATE FUNCTION public.own_agreement_working_time_scope_v1(ctx jsonb,period_value text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-agreement-working-time.v1',public.native_salary_scope_v1(ctx),period_value)),'sha256'),'hex')
$$;

CREATE FUNCTION public.own_agreement_working_time_session_live_v1(p jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.tenant_identity_session s WHERE s.id=(p->>'actorSessionId')::uuid AND s.session_version=(p->>'actorSessionVersion')::integer
 AND s.status='active' AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '1 hour') THEN RAISE EXCEPTION 'ACTION_SESSION_INVALID';END IF;
END $$;

CREATE FUNCTION public.own_agreement_working_time_current_v1(ctx jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.own_agreement_working_time_event;p public.own_agreement_working_time_event;rev integer;items jsonb;
BEGIN
 SELECT * INTO e FROM public.own_agreement_working_time_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND x.period_month=(period_value||'-01')::date AND x.command='approve' ORDER BY x.revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO p FROM public.own_agreement_working_time_event WHERE id=e.proposal_id;END IF;items:=coalesce(p.body->'items','[]');
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-agreement-working-time.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,rev,e.id,items)),'sha256'),'hex'),
 'revision',rev,'items',items,'proposalId',p.id,'approvalId',e.id);
END $$;

CREATE FUNCTION public.own_agreement_working_time_summary_v1(ctx jsonb,e public.own_agreement_working_time_event) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_agreement_working_time_event;independent boolean;
BEGIN
 SELECT * INTO d FROM public.own_agreement_working_time_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND coalesce((ctx->>'parameterActorVerified')::boolean,false)
 AND ctx->>'actorPersonId' IS NOT NULL AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'requestSha256',e.request_sha256,'baseVersion',e.body->>'baseVersion','sourceVersion',e.body->>'sourceVersion',
 'itemCount',jsonb_array_length(e.body->'items'),'reason',e.body->>'reason','createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,
 'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,
 'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;

CREATE FUNCTION public.own_agreement_working_time_bootstrap_v1(p jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;source_value jsonb;proposals jsonb;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 ctx:=public.own_agreement_working_time_context_v1(p);PERFORM public.own_agreement_working_time_lock_v1(ctx);source_value:=public.own_agreement_working_time_source_v1(ctx,period_value);
 SELECT coalesce(jsonb_agg(public.own_agreement_working_time_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals
 FROM public.own_agreement_working_time_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND e.period_month=(period_value||'-01')::date AND e.command='propose';
 IF jsonb_array_length(proposals)>1000 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_LIMIT';END IF;
 PERFORM public.own_agreement_working_time_session_live_v1(p);
 RETURN jsonb_build_object('version','own-agreement-working-time.v1','period',period_value,'scopeVersion',public.own_agreement_working_time_scope_v1(ctx,period_value),
 'source',source_value,'configuration',public.own_agreement_working_time_current_v1(ctx,period_value),'proposals',proposals,
 'permissions',jsonb_build_object('canPropose',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),
 'canReview',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),
 'complete',true,'payrollCalculated',false,'payrollPosted',false);
END $$;

CREATE FUNCTION public.own_agreement_working_time_detail_v1(p jsonb,pid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_agreement_working_time_event;source_value jsonb;configuration jsonb;period_value text;
BEGIN
 ctx:=public.own_agreement_working_time_context_v1(p);PERFORM public.own_agreement_working_time_lock_v1(ctx);
 SELECT * INTO e FROM public.own_agreement_working_time_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_NOT_FOUND';END IF;period_value:=to_char(e.period_month,'YYYY-MM');
 source_value:=public.own_agreement_working_time_source_v1(ctx,period_value);configuration:=public.own_agreement_working_time_current_v1(ctx,period_value);
 PERFORM public.own_agreement_working_time_session_live_v1(p);
 RETURN jsonb_build_object('version','own-agreement-working-time.v1','period',period_value,'scopeVersion',public.own_agreement_working_time_scope_v1(ctx,period_value),
 'proposal',public.own_agreement_working_time_summary_v1(ctx,e),'body',e.body,'baseItems',e.base_items,'source',e.source_snapshot,
 'current',e.body->>'baseVersion'=configuration->>'version' AND e.body->>'sourceVersion'=source_value->>'version');
END $$;

CREATE FUNCTION public.own_agreement_working_time_attempt_v1(p jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_agreement_working_time_event;
BEGIN
 ctx:=public.own_agreement_working_time_context_v1(p);
 SELECT * INTO e FROM public.own_agreement_working_time_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail'
 OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_FORBIDDEN';END IF;
 PERFORM public.own_agreement_working_time_session_live_v1(p);
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;

CREATE FUNCTION public.own_agreement_working_time_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;fresh jsonb;cmd text;period_value text;configuration jsonb;source_value jsonb;
 proposal public.own_agreement_working_time_event;prior public.own_agreement_working_time_event;
 eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_source jsonb;field text;added_bytes bigint;items_value jsonb;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_ISOLATION_REQUIRED';END IF;
 ctx:=public.own_agreement_working_time_context_v1(p);cmd:=body->>'command';
 IF public.own_program_exact_v1(body,ARRAY['command','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','items','reason','reviewConfirmed']) IS NOT TRUE
 OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR public.own_program_text_v1(body->'reason',10,1000) IS NOT TRUE
 OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR octet_length(body::text)>4194304 OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 period_value:=body->>'period';
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion'] LOOP
  IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
 END LOOP;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_FORBIDDEN';END IF;
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-agreement-working-time:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_BUSY';END IF;

 PERFORM public.own_agreement_working_time_lock_v1(ctx);
 fresh:=public.own_agreement_working_time_context_v1(p);
 IF public.native_salary_scope_v1(fresh) IS DISTINCT FROM public.native_salary_scope_v1(ctx) OR fresh->'capabilities' IS DISTINCT FROM ctx->'capabilities'
 OR fresh->'scopes' IS DISTINCT FROM ctx->'scopes' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_SCOPE_CHANGED';END IF;ctx:=fresh;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_FORBIDDEN';END IF;
 PERFORM public.own_agreement_working_time_session_live_v1(p);
 PERFORM public.own_agreement_working_time_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_agreement_working_time_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint OR prior.body<>body THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_IDEMPOTENCY_REUSE';END IF;
  RETURN public.own_agreement_working_time_attempt_v1(p,key);
 END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.own_agreement_working_time_scope_v1(ctx,period_value) THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_SCOPE_CHANGED';END IF;
 configuration:=public.own_agreement_working_time_current_v1(ctx,period_value);rev:=(configuration->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->'proposalId' IS DISTINCT FROM 'null'::jsonb OR body->'proposalSha256' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
  source_value:=public.own_agreement_working_time_source_v1(ctx,period_value);
  IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_BASE_CHANGED';END IF;
  items_value:=public.own_agreement_working_time_items_v1(body->'items',period_value,false);
  IF jsonb_array_length(items_value)<>jsonb_array_length(source_value->'agreements') OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(items_value) WITH ORDINALITY i(value,ordinal)
   FULL JOIN jsonb_array_elements(source_value->'agreements') WITH ORDINALITY s(value,ordinal) USING(ordinal)
   WHERE i.value->>'agreementCode' IS DISTINCT FROM s.value->>'agreementCode' OR i.value->>'agreementToken' IS DISTINCT FROM s.value->>'agreementToken')
  THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_POPULATION_CHANGED';END IF;
  IF items_value=configuration->'items' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
  pid:=eid;baseline:=configuration->'items';captured_source:=source_value;
 ELSE
  IF body->'items' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;
  SELECT * INTO proposal FROM public.own_agreement_working_time_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid
  AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period_month=(period_value||'-01')::date;
  IF NOT FOUND THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_agreement_working_time_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_DECIDED';END IF;
  IF (public.own_agreement_working_time_summary_v1(ctx,proposal)->>'canReview')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_INDEPENDENT_REQUIRED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion'
  OR body->>'sourceVersion' IS DISTINCT FROM proposal.body->>'sourceVersion' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_items;captured_source:=proposal.source_snapshot;
  IF cmd='approve' THEN
   source_value:=public.own_agreement_working_time_source_v1(ctx,period_value);
   IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_BASE_CHANGED';END IF;
   items_value:=public.own_agreement_working_time_items_v1(proposal.body->'items',period_value,false);rev:=rev+1;
   configuration:=jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-agreement-working-time.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,rev,eid,items_value)),'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_agreement_working_time_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period_month=(period_value||'-01')::date AND command='propose')>=1000 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-agreement-working-time:capacity:v1',0)) THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_BUSY';END IF;
 added_bytes:=4*octet_length(body::text)+octet_length(baseline::text)+octet_length(captured_source::text);
 IF added_bytes>2147483647 OR (SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_items::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_agreement_working_time_event e)+added_bytes>536870912
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_LIMIT';END IF;
 -- Reuse the existing owner-verified cluster budget and shared capacity lock.
 -- Keep this ledger's own512MiB bound; do not introduce another provider plan.
 BEGIN PERFORM public.native_employment_catalog_capacity_v1(added_bytes::integer);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='NATIVE_EMPLOYMENT_CATALOG_BUSY' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_BUSY';
  ELSIF SQLERRM='NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT' THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_LIMIT';ELSE RAISE;END IF;
 END;
 -- A bounded wait or a large complete set must never keep an expired session
 -- alive through transaction-start now(). Check wall time before the insert.
 PERFORM public.own_agreement_working_time_session_live_v1(p);
 receipt_value:=jsonb_build_object('version','own-agreement-working-time.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,
 'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'configurationVersion',configuration->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.own_agreement_working_time_event(id,tenant_id,source_binding_id,period_month,proposal_id,command,body,base_items,source_snapshot,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(period_value||'-01')::date,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,baseline,captured_source,rev,
 (ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;

CREATE FUNCTION public.own_agreement_working_time_capture_v1(ctx jsonb,employees jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE records jsonb;configuration jsonb;source_value jsonb;revision_value integer;approval uuid;identity_changed boolean;source_missing boolean;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(employees) IS DISTINCT FROM 'array' OR jsonb_array_length(employees)>10000 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_CAPTURE_INVALID';END IF;
 LOCK TABLE public.own_agreement_working_time_event IN SHARE MODE NOWAIT;
 source_value:=public.own_agreement_working_time_source_v1(ctx,period_value);configuration:=public.own_agreement_working_time_current_v1(ctx,period_value);
 revision_value:=(configuration->>'revision')::integer;approval:=(configuration->>'approvalId')::uuid;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(employees) e WHERE jsonb_typeof(e->'contractId') IS DISTINCT FROM 'string'
  OR e->>'contractId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(e->'agreementCode') IS DISTINCT FROM 'string' OR e->>'agreementCode'!~'^[0-9]{1,9}$')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(employees) e GROUP BY e->>'contractId' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_CAPTURE_INVALID';END IF;
 WITH selected AS MATERIALIZED(SELECT DISTINCT value->>'agreementCode' AS code FROM jsonb_array_elements(employees)),
 source_items AS MATERIALIZED(SELECT value AS agreement FROM jsonb_array_elements(source_value->'agreements')),
 facts AS MATERIALIZED(SELECT value AS item FROM jsonb_array_elements(configuration->'items'))
 SELECT coalesce(jsonb_agg(jsonb_build_object('agreementCode',e.code,'agreementToken',s.agreement->>'agreementToken',
  'revision',CASE WHEN f.item IS NULL THEN 0 ELSE revision_value END,'definition',f.item->'definition',
  'approvalId',CASE WHEN f.item IS NULL THEN NULL ELSE approval END,'approvedAgreementToken',f.item->>'agreementToken') ORDER BY e.code COLLATE "C"),'[]'),
 coalesce(bool_or(f.item IS NOT NULL AND f.item->>'agreementToken' IS DISTINCT FROM s.agreement->>'agreementToken'),false),coalesce(bool_or(s.agreement IS NULL),false)
 INTO records,identity_changed,source_missing FROM selected e LEFT JOIN source_items s ON s.agreement->>'agreementCode'=e.code LEFT JOIN facts f ON f.item->>'agreementCode'=e.code;
 IF source_missing THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_SOURCE_REQUIRED';END IF;
 IF identity_changed THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_IDENTITY_CHANGED';END IF;
 IF octet_length(records::text)>4194304 THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_LIMIT';END IF;
 RETURN jsonb_build_object('complete',true,'records',records,'version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-agreement-working-time.v1',period_value,records)),'sha256'),'hex'));
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'AGREEMENT_WORKING_TIME_BUSY';
END $$;


REVOKE ALL ON FUNCTION public.own_agreement_working_time_immutable_v1(),public.own_agreement_working_time_context_v1(jsonb),public.own_agreement_working_time_definition_v1(jsonb,text),public.own_agreement_working_time_items_v1(jsonb,text,boolean),public.own_agreement_working_time_lock_v1(jsonb),public.own_agreement_working_time_source_v1(jsonb,text),public.own_agreement_working_time_scope_v1(jsonb,text),public.own_agreement_working_time_session_live_v1(jsonb),public.own_agreement_working_time_current_v1(jsonb,text),public.own_agreement_working_time_summary_v1(jsonb,public.own_agreement_working_time_event),public.own_agreement_working_time_bootstrap_v1(jsonb,text),public.own_agreement_working_time_detail_v1(jsonb,uuid),public.own_agreement_working_time_attempt_v1(jsonb,uuid),public.own_agreement_working_time_command_v1(jsonb,jsonb,uuid),public.own_agreement_working_time_capture_v1(jsonb,jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_agreement_working_time_bootstrap_v1(jsonb,text),public.own_agreement_working_time_detail_v1(jsonb,uuid),public.own_agreement_working_time_attempt_v1(jsonb,uuid),public.own_agreement_working_time_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
