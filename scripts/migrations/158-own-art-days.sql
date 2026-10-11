-- Documented ART worked days, independently reviewed per own contract/month.
-- No calendar, salary, attendance or payment inference.
DO $$ BEGIN
 IF to_regclass('public.own_art_days_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_art_days_%') THEN RAISE EXCEPTION 'ART_DAYS_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.native_salary_administrative_context_v1(jsonb)') IS NULL OR to_regprocedure('public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)') IS NULL OR to_regprocedure('public.own_program_exact_v1(jsonb,text[])') IS NULL THEN RAISE EXCEPTION 'ART_DAYS_PREREQUISITE';END IF;
END $$;
CREATE TABLE public.own_art_days_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id),period_month date NOT NULL CHECK(extract(day FROM period_month)=1 AND period_month BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'),
 proposal_id uuid REFERENCES public.own_art_days_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=32768),base_definition jsonb NOT NULL CHECK(jsonb_typeof(base_definition) IN('null','object')),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object' AND octet_length(source_snapshot::text)<=32768),
 revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),actor_label text NOT NULL,
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK((command='propose')=(proposal_id IS NULL)),
 UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_art_days_approval_revision ON public.own_art_days_event(tenant_id,source_binding_id,contract_id,period_month,revision) WHERE command='approve';
CREATE INDEX own_art_days_contract_period ON public.own_art_days_event(tenant_id,source_binding_id,contract_id,period_month);
ALTER TABLE public.own_art_days_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_art_days_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_art_days_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'ART_DAYS_IMMUTABLE';END $$;
CREATE TRIGGER own_art_days_immutable BEFORE UPDATE OR DELETE ON public.own_art_days_event FOR EACH ROW EXECUTE FUNCTION public.own_art_days_immutable_v1();
CREATE TRIGGER own_art_days_no_truncate BEFORE TRUNCATE ON public.own_art_days_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_art_days_immutable_v1();
CREATE FUNCTION public.own_art_days_definition_v1(d jsonb,period_value text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE date_value text;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR NOT public.own_program_exact_v1(d,ARRAY['workedDays','asOfDate','documentReference']) THEN RAISE EXCEPTION 'ART_DAYS_INPUT_INVALID';END IF;
 IF d->'workedDays' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(d->'workedDays') IS DISTINCT FROM 'string' OR d->>'workedDays'!~'^(0|[1-9]|[12][0-9]|3[01])$') OR NOT public.own_program_text_v1(d->'documentReference',3,180) THEN RAISE EXCEPTION 'ART_DAYS_INPUT_INVALID';END IF;
 date_value:=d->>'asOfDate';
 IF jsonb_typeof(d->'asOfDate') IS DISTINCT FROM 'string' OR date_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' OR NOT pg_input_is_valid(date_value,'date') OR to_char(date_value::date,'YYYY-MM-DD')<>date_value OR left(date_value,7)>period_value THEN RAISE EXCEPTION 'ART_DAYS_INPUT_INVALID';END IF;
 RETURN d;
END $$;
CREATE FUNCTION public.own_art_days_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-art-days:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'ART_DAYS_BUSY';END IF;
 LOCK TABLE public.native_employee_registration,public.employment_contract,public.person_identity IN SHARE MODE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'ART_DAYS_BUSY';
END $$;
CREATE FUNCTION public.own_art_days_source_v1(ctx jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s jsonb;
BEGIN
 -- Use the already-published exact-contract reader, shared with own payroll.
 -- Adopted contracts retain their approved identity; no historical lookup occurs.
 s:=public.payroll_fixed_registry_subject_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),target,true)->'subject';
 IF s->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR s->>'contractId' IS DISTINCT FROM target::text THEN RAISE EXCEPTION 'ART_DAYS_SOURCE_REQUIRED';END IF;
 RETURN jsonb_build_object('subject',s,'period',period_value,'fullPeriod',public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),target,(period_value||'-01')::date,((period_value||'-01')::date+interval '1 month - 1 day')::date,true),'version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-art-days.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,s,(SELECT to_jsonb(ec) FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(ctx->>'tenantId')::uuid),(SELECT jsonb_build_array(r.revision,r.after_contract) FROM public.native_employment_lifecycle_review r WHERE r.contract_id=target AND r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid AND r.decision='approve' ORDER BY r.revision DESC LIMIT 1))),'sha256'),'hex'));
END $$;
CREATE FUNCTION public.own_art_days_scope_v1(ctx jsonb,target uuid,period_value text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-art-days.v1',public.native_salary_scope_v1(ctx),target,period_value)),'sha256'),'hex')
$$;
CREATE FUNCTION public.own_art_days_current_v1(ctx jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.own_art_days_event;p public.own_art_days_event;rev integer;d jsonb;
BEGIN
 SELECT * INTO e FROM public.own_art_days_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.contract_id=target AND x.period_month=(period_value||'-01')::date AND x.command='approve' ORDER BY x.revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO p FROM public.own_art_days_event WHERE id=e.proposal_id;END IF;d:=p.body->'definition';
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-art-days.v1',ctx->>'tenantId',ctx->>'sourceBindingId',target,period_value,rev,e.id,d)),'sha256'),'hex'),'revision',rev,'definition',d,'proposalId',p.id,'approvalId',e.id,'identityToken',p.source_snapshot#>>'{subject,identityToken}','sourceVersion',p.body->>'sourceVersion');
END $$;
CREATE FUNCTION public.own_art_days_summary_v1(ctx jsonb,e public.own_art_days_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_art_days_event;independent boolean;
BEGIN
 SELECT * INTO d FROM public.own_art_days_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND coalesce((ctx->>'parameterActorVerified')::boolean,false) AND ctx->>'actorPersonId' IS NOT NULL AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'requestSha256',e.request_sha256,'baseVersion',e.body->>'baseVersion','sourceVersion',e.body->>'sourceVersion','reason',e.body->>'reason','createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;
CREATE FUNCTION public.own_art_days_bootstrap_v1(p jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;source_value jsonb;proposals jsonb;
BEGIN
 IF target IS NULL OR period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'ART_DAYS_INPUT_INVALID';END IF;
 ctx:=public.native_salary_administrative_context_v1(p);PERFORM public.own_art_days_lock_v1(ctx);source_value:=public.own_art_days_source_v1(ctx,target,period_value);
 SELECT coalesce(jsonb_agg(public.own_art_days_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals FROM public.own_art_days_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.contract_id=target AND e.period_month=(period_value||'-01')::date AND e.command='propose';
 IF jsonb_array_length(proposals)>500 THEN RAISE EXCEPTION 'ART_DAYS_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-art-days.v1','contractId',target,'period',period_value,'scopeVersion',public.own_art_days_scope_v1(ctx,target,period_value),'source',source_value,'configuration',public.own_art_days_current_v1(ctx,target,period_value),'proposals',proposals,'permissions',jsonb_build_object('canPropose',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),'canReview',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),'complete',true,'payrollCalculated',false,'payrollPosted',false);
END $$;
CREATE FUNCTION public.own_art_days_detail_v1(p jsonb,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_art_days_event;source_value jsonb;configuration jsonb;period_value text;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);PERFORM public.own_art_days_lock_v1(ctx);
 SELECT * INTO e FROM public.own_art_days_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'ART_DAYS_NOT_FOUND';END IF;period_value:=to_char(e.period_month,'YYYY-MM');
 source_value:=public.own_art_days_source_v1(ctx,e.contract_id,period_value);configuration:=public.own_art_days_current_v1(ctx,e.contract_id,period_value);
 RETURN jsonb_build_object('version','own-art-days.v1','scopeVersion',public.own_art_days_scope_v1(ctx,e.contract_id,period_value),'proposal',public.own_art_days_summary_v1(ctx,e),'body',e.body,'baseDefinition',e.base_definition,'source',e.source_snapshot,'current',e.body->>'baseVersion'=configuration->>'version' AND e.body->>'sourceVersion'=source_value->>'version');
END $$;
CREATE FUNCTION public.own_art_days_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_art_days_event;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);
 SELECT * INTO e FROM public.own_art_days_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'ART_DAYS_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'ART_DAYS_FORBIDDEN';END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.own_art_days_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;target uuid;period_value text;configuration jsonb;source_value jsonb;proposal public.own_art_days_event;prior public.own_art_days_event;definition jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_source jsonb;field text;added_bytes bigint;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);cmd:=body->>'command';
 IF NOT public.own_program_exact_v1(body,ARRAY['command','contractId','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','definition','reason','reviewConfirmed']) OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_text_v1(body->'reason',10,1000) OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>32768 OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(body->'contractId') IS DISTINCT FROM 'string' OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'ART_DAYS_INPUT_INVALID';END IF;
 target:=(body->>'contractId')::uuid;period_value:=body->>'period';
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ART_DAYS_INPUT_INVALID';END IF;END LOOP;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) OR ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) THEN RAISE EXCEPTION 'ART_DAYS_FORBIDDEN';END IF;
 PERFORM public.own_art_days_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_art_days_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint OR prior.body<>body THEN RAISE EXCEPTION 'ART_DAYS_IDEMPOTENCY_REUSE';END IF;RETURN public.own_art_days_attempt_v1(p,key);END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.own_art_days_scope_v1(ctx,target,period_value) THEN RAISE EXCEPTION 'ART_DAYS_SCOPE_CHANGED';END IF;
 configuration:=public.own_art_days_current_v1(ctx,target,period_value);rev:=(configuration->>'revision')::integer;
 IF cmd='propose' THEN
  source_value:=public.own_art_days_source_v1(ctx,target,period_value);
  IF body->'proposalId'<>'null' OR body->'proposalSha256'<>'null' OR body->'reviewConfirmed'<>'false' THEN RAISE EXCEPTION 'ART_DAYS_INPUT_INVALID';END IF;
  IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'ART_DAYS_BASE_CHANGED';END IF;
  definition:=public.own_art_days_definition_v1(body->'definition',period_value);
  IF definition=configuration->'definition' AND configuration->>'sourceVersion'=source_value->>'version' THEN RAISE EXCEPTION 'ART_DAYS_INPUT_INVALID';END IF;
  pid:=eid;baseline:=configuration->'definition';captured_source:=source_value;
 ELSE
  IF body->'definition'<>'null' OR body->'reviewConfirmed'<>'true' OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ART_DAYS_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.own_art_days_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND period_month=(period_value||'-01')::date;
  IF NOT FOUND THEN RAISE EXCEPTION 'ART_DAYS_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_art_days_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'ART_DAYS_DECIDED';END IF;
  IF NOT(public.own_art_days_summary_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'ART_DAYS_INDEPENDENT_REQUIRED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'sourceVersion' IS DISTINCT FROM proposal.body->>'sourceVersion' THEN RAISE EXCEPTION 'ART_DAYS_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_definition;captured_source:=proposal.source_snapshot;
  IF cmd='approve' THEN
   source_value:=public.own_art_days_source_v1(ctx,target,period_value);
   IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'ART_DAYS_BASE_CHANGED';END IF;
   definition:=public.own_art_days_definition_v1(proposal.body->'definition',period_value);rev:=rev+1;
   configuration:=jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-art-days.v1',ctx->>'tenantId',ctx->>'sourceBindingId',target,period_value,rev,eid,definition)),'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_art_days_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND period_month=(period_value||'-01')::date AND command='propose')>=500 THEN RAISE EXCEPTION 'ART_DAYS_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-art-days:capacity:v1',0)) THEN RAISE EXCEPTION 'ART_DAYS_BUSY';END IF;
 added_bytes:=4*octet_length(body::text)+octet_length(coalesce(baseline,'null')::text)+octet_length(captured_source::text);
 IF (SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_definition::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_art_days_event e)+added_bytes>268435456 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_definition::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_art_days_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid)+added_bytes>134217728 THEN RAISE EXCEPTION 'ART_DAYS_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','own-art-days.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'configurationVersion',configuration->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.own_art_days_event(id,tenant_id,source_binding_id,contract_id,period_month,proposal_id,command,body,base_definition,source_snapshot,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,target,(period_value||'-01')::date,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,coalesce(baseline,'null'),captured_source,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION public.own_art_days_immutable_v1(),public.own_art_days_definition_v1(jsonb,text),public.own_art_days_lock_v1(jsonb),public.own_art_days_source_v1(jsonb,uuid,text),public.own_art_days_scope_v1(jsonb,uuid,text),public.own_art_days_current_v1(jsonb,uuid,text),public.own_art_days_summary_v1(jsonb,public.own_art_days_event),public.own_art_days_bootstrap_v1(jsonb,uuid,text),public.own_art_days_detail_v1(jsonb,uuid),public.own_art_days_attempt_v1(jsonb,uuid),public.own_art_days_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_art_days_bootstrap_v1(jsonb,uuid,text),public.own_art_days_detail_v1(jsonb,uuid),public.own_art_days_attempt_v1(jsonb,uuid),public.own_art_days_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
