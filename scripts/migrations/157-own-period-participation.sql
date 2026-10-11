-- Declared recognized salary participation per owned contract and payroll month.
-- Immutable proposals/independent decisions. No derivation, payroll or adoption.
DO $$ BEGIN
 IF to_regclass('public.own_participation_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_participation_%') THEN RAISE EXCEPTION 'PARTICIPATION_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.native_salary_administrative_context_v1(jsonb)') IS NULL OR to_regprocedure('public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)') IS NULL OR to_regprocedure('public.own_program_exact_v1(jsonb,text[])') IS NULL THEN RAISE EXCEPTION 'PARTICIPATION_PREREQUISITE';END IF;
END $$;
CREATE TABLE public.own_participation_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id),period_month date NOT NULL CHECK(extract(day FROM period_month)=1 AND period_month BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'),
 proposal_id uuid REFERENCES public.own_participation_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
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
CREATE UNIQUE INDEX own_participation_approval_revision ON public.own_participation_event(tenant_id,source_binding_id,contract_id,period_month,revision) WHERE command='approve';
CREATE INDEX own_participation_contract_period ON public.own_participation_event(tenant_id,source_binding_id,contract_id,period_month);
ALTER TABLE public.own_participation_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_participation_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_participation_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'PARTICIPATION_IMMUTABLE';END $$;
CREATE TRIGGER own_participation_immutable BEFORE UPDATE OR DELETE ON public.own_participation_event FOR EACH ROW EXECUTE FUNCTION public.own_participation_immutable_v1();
CREATE TRIGGER own_participation_no_truncate BEFORE TRUNCATE ON public.own_participation_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_participation_immutable_v1();
CREATE FUNCTION public.own_participation_definition_v1(d jsonb,period_value text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE date_value text;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR NOT public.own_program_exact_v1(d,ARRAY['recognizedUnits','baseUnits','asOfDate','documentReference']) THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
 IF d->'recognizedUnits' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(d->'recognizedUnits') IS DISTINCT FROM 'string' OR d->>'recognizedUnits'!~'^(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$') OR d->'baseUnits' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(d->'baseUnits') IS DISTINCT FROM 'string' OR d->>'baseUnits'!~'^(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$') OR NOT public.own_program_text_v1(d->'documentReference',3,180) THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
 IF d->'baseUnits'<>'null' AND (d->>'baseUnits')::numeric<=0 OR d->'recognizedUnits'<>'null' AND d->'baseUnits'<>'null' AND (d->>'recognizedUnits')::numeric>(d->>'baseUnits')::numeric THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
 date_value:=d->>'asOfDate';
 IF jsonb_typeof(d->'asOfDate') IS DISTINCT FROM 'string' OR date_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' OR NOT pg_input_is_valid(date_value,'date') OR to_char(date_value::date,'YYYY-MM-DD')<>date_value OR left(date_value,7)>period_value THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
 RETURN d;
END $$;
CREATE FUNCTION public.own_participation_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-participation:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'PARTICIPATION_BUSY';END IF;
 LOCK TABLE public.native_employee_registration,public.employment_contract,public.person_identity IN SHARE MODE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PARTICIPATION_BUSY';
END $$;
CREATE FUNCTION public.own_participation_source_v1(ctx jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s jsonb;
BEGIN
 -- Use the already-published exact-contract reader, shared with own payroll.
 -- Adopted contracts retain their approved identity; no historical lookup occurs.
 s:=public.payroll_fixed_registry_subject_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),target,true)->'subject';
 IF s->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR s->>'contractId' IS DISTINCT FROM target::text THEN RAISE EXCEPTION 'PARTICIPATION_SOURCE_REQUIRED';END IF;
 RETURN jsonb_build_object('subject',s,'period',period_value,'fullPeriod',public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),target,(period_value||'-01')::date,((period_value||'-01')::date+interval '1 month - 1 day')::date,true),'version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-participation.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,s,(SELECT to_jsonb(ec) FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(ctx->>'tenantId')::uuid),(SELECT jsonb_build_array(r.revision,r.after_contract) FROM public.native_employment_lifecycle_review r WHERE r.contract_id=target AND r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid AND r.decision='approve' ORDER BY r.revision DESC LIMIT 1))),'sha256'),'hex'));
END $$;
CREATE FUNCTION public.own_participation_scope_v1(ctx jsonb,target uuid,period_value text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-participation.v1',public.native_salary_scope_v1(ctx),target,period_value)),'sha256'),'hex')
$$;
CREATE FUNCTION public.own_participation_current_v1(ctx jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.own_participation_event;p public.own_participation_event;rev integer;d jsonb;
BEGIN
 SELECT * INTO e FROM public.own_participation_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.contract_id=target AND x.period_month=(period_value||'-01')::date AND x.command='approve' ORDER BY x.revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO p FROM public.own_participation_event WHERE id=e.proposal_id;END IF;d:=p.body->'definition';
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-participation.v1',ctx->>'tenantId',ctx->>'sourceBindingId',target,period_value,rev,e.id,d)),'sha256'),'hex'),'revision',rev,'definition',d,'proposalId',p.id,'approvalId',e.id,'identityToken',p.source_snapshot#>>'{subject,identityToken}','sourceVersion',p.body->>'sourceVersion');
END $$;
CREATE FUNCTION public.own_participation_summary_v1(ctx jsonb,e public.own_participation_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_participation_event;independent boolean;
BEGIN
 SELECT * INTO d FROM public.own_participation_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND coalesce((ctx->>'parameterActorVerified')::boolean,false) AND ctx->>'actorPersonId' IS NOT NULL AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'requestSha256',e.request_sha256,'baseVersion',e.body->>'baseVersion','sourceVersion',e.body->>'sourceVersion','reason',e.body->>'reason','createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;
CREATE FUNCTION public.own_participation_bootstrap_v1(p jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;source_value jsonb;proposals jsonb;
BEGIN
 IF target IS NULL OR period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
 ctx:=public.native_salary_administrative_context_v1(p);PERFORM public.own_participation_lock_v1(ctx);source_value:=public.own_participation_source_v1(ctx,target,period_value);
 SELECT coalesce(jsonb_agg(public.own_participation_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals FROM public.own_participation_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.contract_id=target AND e.period_month=(period_value||'-01')::date AND e.command='propose';
 IF jsonb_array_length(proposals)>500 THEN RAISE EXCEPTION 'PARTICIPATION_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-period-participation.v1','contractId',target,'period',period_value,'scopeVersion',public.own_participation_scope_v1(ctx,target,period_value),'source',source_value,'configuration',public.own_participation_current_v1(ctx,target,period_value),'proposals',proposals,'permissions',jsonb_build_object('canPropose',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),'canReview',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),'complete',true,'payrollCalculated',false,'payrollPosted',false);
END $$;
CREATE FUNCTION public.own_participation_detail_v1(p jsonb,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_participation_event;source_value jsonb;configuration jsonb;period_value text;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);PERFORM public.own_participation_lock_v1(ctx);
 SELECT * INTO e FROM public.own_participation_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'PARTICIPATION_NOT_FOUND';END IF;period_value:=to_char(e.period_month,'YYYY-MM');
 source_value:=public.own_participation_source_v1(ctx,e.contract_id,period_value);configuration:=public.own_participation_current_v1(ctx,e.contract_id,period_value);
 RETURN jsonb_build_object('version','own-period-participation.v1','scopeVersion',public.own_participation_scope_v1(ctx,e.contract_id,period_value),'proposal',public.own_participation_summary_v1(ctx,e),'body',e.body,'baseDefinition',e.base_definition,'source',e.source_snapshot,'current',e.body->>'baseVersion'=configuration->>'version' AND e.body->>'sourceVersion'=source_value->>'version');
END $$;
CREATE FUNCTION public.own_participation_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_participation_event;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);
 SELECT * INTO e FROM public.own_participation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'PARTICIPATION_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'PARTICIPATION_FORBIDDEN';END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.own_participation_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;target uuid;period_value text;configuration jsonb;source_value jsonb;proposal public.own_participation_event;prior public.own_participation_event;definition jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_source jsonb;field text;added_bytes bigint;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);cmd:=body->>'command';
 IF NOT public.own_program_exact_v1(body,ARRAY['command','contractId','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','definition','reason','reviewConfirmed']) OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_text_v1(body->'reason',10,1000) OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>32768 OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(body->'contractId') IS DISTINCT FROM 'string' OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
 target:=(body->>'contractId')::uuid;period_value:=body->>'period';
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;END LOOP;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) OR ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) THEN RAISE EXCEPTION 'PARTICIPATION_FORBIDDEN';END IF;
 PERFORM public.own_participation_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_participation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint OR prior.body<>body THEN RAISE EXCEPTION 'PARTICIPATION_IDEMPOTENCY_REUSE';END IF;RETURN public.own_participation_attempt_v1(p,key);END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.own_participation_scope_v1(ctx,target,period_value) THEN RAISE EXCEPTION 'PARTICIPATION_SCOPE_CHANGED';END IF;
 configuration:=public.own_participation_current_v1(ctx,target,period_value);rev:=(configuration->>'revision')::integer;
 IF cmd='propose' THEN
  source_value:=public.own_participation_source_v1(ctx,target,period_value);
  IF body->'proposalId'<>'null' OR body->'proposalSha256'<>'null' OR body->'reviewConfirmed'<>'false' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
  IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'PARTICIPATION_BASE_CHANGED';END IF;
  definition:=public.own_participation_definition_v1(body->'definition',period_value);
  IF definition=configuration->'definition' AND configuration->>'sourceVersion'=source_value->>'version' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
  pid:=eid;baseline:=configuration->'definition';captured_source:=source_value;
 ELSE
  IF body->'definition'<>'null' OR body->'reviewConfirmed'<>'true' OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.own_participation_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND period_month=(period_value||'-01')::date;
  IF NOT FOUND THEN RAISE EXCEPTION 'PARTICIPATION_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_participation_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'PARTICIPATION_DECIDED';END IF;
  IF NOT(public.own_participation_summary_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'PARTICIPATION_INDEPENDENT_REQUIRED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'sourceVersion' IS DISTINCT FROM proposal.body->>'sourceVersion' THEN RAISE EXCEPTION 'PARTICIPATION_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_definition;captured_source:=proposal.source_snapshot;
  IF cmd='approve' THEN
   source_value:=public.own_participation_source_v1(ctx,target,period_value);
   IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'PARTICIPATION_BASE_CHANGED';END IF;
   definition:=public.own_participation_definition_v1(proposal.body->'definition',period_value);rev:=rev+1;
   configuration:=jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-participation.v1',ctx->>'tenantId',ctx->>'sourceBindingId',target,period_value,rev,eid,definition)),'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_participation_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND period_month=(period_value||'-01')::date AND command='propose')>=500 THEN RAISE EXCEPTION 'PARTICIPATION_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-participation:capacity:v1',0)) THEN RAISE EXCEPTION 'PARTICIPATION_BUSY';END IF;
 added_bytes:=4*octet_length(body::text)+octet_length(coalesce(baseline,'null')::text)+octet_length(captured_source::text);
 IF (SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_definition::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_participation_event e)+added_bytes>268435456 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_definition::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_participation_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid)+added_bytes>134217728 THEN RAISE EXCEPTION 'PARTICIPATION_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','own-period-participation.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'configurationVersion',configuration->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.own_participation_event(id,tenant_id,source_binding_id,contract_id,period_month,proposal_id,command,body,base_definition,source_snapshot,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,target,(period_value||'-01')::date,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,coalesce(baseline,'null'),captured_source,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;
CREATE FUNCTION public.own_participation_capture_v1(ctx jsonb,employees jsonb,period_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e jsonb;c jsonb;fresh jsonb;records jsonb:='[]';
BEGIN
 -- The calling published run facade supplies its already selected population.
 -- SHARE blocks a concurrent new approval until the complete capture commits.
 LOCK TABLE public.own_participation_event IN SHARE MODE NOWAIT;
 FOR e IN SELECT value FROM jsonb_array_elements(employees) LOOP
  c:=public.own_participation_current_v1(ctx,(e->>'contractId')::uuid,period_value);
  fresh:=public.own_participation_source_v1(ctx,(e->>'contractId')::uuid,period_value);
  IF (c->>'revision')::integer>0 AND c->>'sourceVersion' IS DISTINCT FROM fresh->>'version' THEN RAISE EXCEPTION 'PARTICIPATION_SOURCE_CHANGED';END IF;
  IF (c->>'revision')::integer>0 AND c->>'identityToken' IS DISTINCT FROM e->>'identityToken' THEN RAISE EXCEPTION 'PARTICIPATION_IDENTITY_CHANGED';END IF;
  records:=records||jsonb_build_array(jsonb_build_object('contractId',e->>'contractId','identityToken',e->>'identityToken','fullPeriod',public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),(e->>'contractId')::uuid,(period_value||'-01')::date,((period_value||'-01')::date+interval '1 month - 1 day')::date,true),'configuration',c));
 END LOOP;
 RETURN jsonb_build_object('complete',true,'records',records,'version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-participation.v1',period_value,records)),'sha256'),'hex'));
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PARTICIPATION_BUSY';
END $$;
CREATE FUNCTION public.own_participation_rule_key_v1(r jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT (r->>'agreementCode')||':'||(CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(r->>'code')||':'||(r->>'validFrom')||':'||(SELECT string_agg(t,',' ORDER BY t COLLATE "C") FROM jsonb_array_elements_text(r->'liquidationTypes') t)
$$;
CREATE FUNCTION public.own_participation_policy_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE policy jsonb:=p->'periodParticipation';t jsonb;r jsonb;n integer;field text;
BEGIN
 IF NOT public.own_program_exact_v1(policy,ARRAY['version','fullPeriod','fixedValidity','treatments']) OR policy->>'version' IS DISTINCT FROM 'own-period-participation.v1' OR policy->>'fullPeriod' IS DISTINCT FROM 'neutral_fraction' OR coalesce(policy->>'fixedValidity' IN('reject','declared_values'),false) IS NOT TRUE OR jsonb_typeof(policy->'treatments') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'rules') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'bindings') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_PROGRAM_PARTICIPATION_POLICY_REQUIRED';END IF;
 IF jsonb_array_length(policy->'treatments')<>jsonb_array_length(p->'rules') OR jsonb_array_length(p->'rules') NOT BETWEEN 1 AND 1000 OR (SELECT count(*)<>count(DISTINCT x->>'ruleKey') FROM jsonb_array_elements(policy->'treatments') x) THEN RAISE EXCEPTION 'OWN_PROGRAM_PARTICIPATION_POLICY_INVALID';END IF;
 FOR t IN SELECT value FROM jsonb_array_elements(policy->'treatments') LOOP
  IF NOT public.own_program_exact_v1(t,ARRAY['ruleKey','treatment','reference']) OR jsonb_typeof(t->'ruleKey') IS DISTINCT FROM 'string' OR coalesce(t->>'treatment' IN('fraction','declared_formula'),false) IS NOT TRUE OR NOT public.own_program_text_v1(t->'reference',3,180) THEN RAISE EXCEPTION 'OWN_PROGRAM_PARTICIPATION_POLICY_INVALID';END IF;
  SELECT count(*),(jsonb_agg(x))->0 INTO n,r FROM jsonb_array_elements(p->'rules') x WHERE public.own_participation_rule_key_v1(x)=t->>'ruleKey';
  IF n<>1 THEN RAISE EXCEPTION 'OWN_PROGRAM_PARTICIPATION_POLICY_INVALID';END IF;
  IF t->>'treatment'='fraction' THEN
   IF r->>'unit' IS DISTINCT FROM 'money' THEN RAISE EXCEPTION 'OWN_PROGRAM_PARTICIPATION_POLICY_INVALID';END IF;
   FOREACH field IN ARRAY ARRAY['recognizedUnits','baseUnits'] LOOP
    IF(SELECT count(*) FROM jsonb_array_elements(p->'bindings') b WHERE b->>'agreementCode'=r->>'agreementCode' AND b->>'sourceKind'='period_fact' AND b->>'sourceField'=field)<>1 THEN RAISE EXCEPTION 'OWN_PROGRAM_PARTICIPATION_BINDING_REQUIRED';END IF;
   END LOOP;
  END IF;
 END LOOP;
 RETURN jsonb_set(policy,'{treatments}',(SELECT jsonb_agg(x ORDER BY x->>'ruleKey' COLLATE "C") FROM jsonb_array_elements(policy->'treatments') x));
END $$;
CREATE FUNCTION public.own_participation_expression_v1(r jsonb,p jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE treatment text;numerator text;denominator text;
BEGIN
 IF p#>>'{periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN RETURN r->'expression';END IF;
 SELECT t->>'treatment' INTO treatment FROM jsonb_array_elements(p#>'{periodParticipation,treatments}') t WHERE t->>'ruleKey'=public.own_participation_rule_key_v1(r);
 IF treatment='declared_formula' THEN RETURN r->'expression';END IF;
 IF treatment IS DISTINCT FROM 'fraction' THEN RAISE EXCEPTION 'OWN_PROGRAM_PARTICIPATION_POLICY_INVALID';END IF;
 SELECT b->>'key' INTO numerator FROM jsonb_array_elements(p->'bindings') b WHERE b->>'agreementCode'=r->>'agreementCode' AND b->>'sourceKind'='period_fact' AND b->>'sourceField'='recognizedUnits';
 SELECT b->>'key' INTO denominator FROM jsonb_array_elements(p->'bindings') b WHERE b->>'agreementCode'=r->>'agreementCode' AND b->>'sourceKind'='period_fact' AND b->>'sourceField'='baseUnits';
 RETURN jsonb_build_object('op','multiply','left',r->'expression','right',jsonb_build_object('op','divide','left',jsonb_build_object('op','input','unit','units','key',numerator),'right',jsonb_build_object('op','input','unit','units','key',denominator)));
END $$;
CREATE FUNCTION public.own_participation_rules_v1(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT CASE WHEN p#>>'{periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN p->'rules' ELSE (SELECT jsonb_agg(jsonb_set(r,'{expression}',public.own_participation_expression_v1(r,p)) ORDER BY n) FROM jsonb_array_elements(p->'rules') WITH ORDINALITY x(r,n)) END
$$;
REVOKE ALL ON FUNCTION public.own_participation_rule_key_v1(jsonb),public.own_participation_policy_v1(jsonb),public.own_participation_expression_v1(jsonb,jsonb),public.own_participation_rules_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_participation_immutable_v1(),public.own_participation_definition_v1(jsonb,text),public.own_participation_lock_v1(jsonb),public.own_participation_source_v1(jsonb,uuid,text),public.own_participation_scope_v1(jsonb,uuid,text),public.own_participation_current_v1(jsonb,uuid,text),public.own_participation_summary_v1(jsonb,public.own_participation_event),public.own_participation_bootstrap_v1(jsonb,uuid,text),public.own_participation_detail_v1(jsonb,uuid),public.own_participation_attempt_v1(jsonb,uuid),public.own_participation_command_v1(jsonb,jsonb,uuid),public.own_participation_capture_v1(jsonb,jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_participation_bootstrap_v1(jsonb,uuid,text),public.own_participation_detail_v1(jsonb,uuid),public.own_participation_attempt_v1(jsonb,uuid),public.own_participation_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
