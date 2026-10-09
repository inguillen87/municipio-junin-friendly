-- Own bank-account metadata, declared validity and independently reviewed revisions.
-- No bank transfer generation, payment, salary computation or municipal adoption.
DO $$ BEGIN
 IF to_regclass('public.own_bank_account_event') IS NOT NULL THEN RAISE EXCEPTION 'BANK_ACCOUNTS_ALREADY_INSTALLED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_bank_accounts_%') THEN RAISE EXCEPTION 'BANK_ACCOUNTS_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.native_salary_context_v1(jsonb)') IS NULL OR to_regprocedure('public.own_program_exact_v1(jsonb,text[])') IS NULL OR to_regclass('public.native_employee_registration') IS NULL THEN RAISE EXCEPTION 'BANK_ACCOUNTS_PREREQUISITE';END IF;
END $$;
CREATE TABLE public.own_bank_account_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 proposal_id uuid REFERENCES public.own_bank_account_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=8388608),base_definition jsonb NOT NULL CHECK(jsonb_typeof(base_definition) IN('null','object')),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object' AND octet_length(source_snapshot::text)<=8388608),
 revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),actor_label text NOT NULL,request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((command='propose')=(proposal_id IS NULL)),UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_bank_accounts_approval_revision ON public.own_bank_account_event(tenant_id,source_binding_id,revision) WHERE command='approve';
ALTER TABLE public.own_bank_account_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_bank_account_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_bank_accounts_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'BANK_ACCOUNTS_IMMUTABLE';END $$;
CREATE TRIGGER own_bank_accounts_immutable BEFORE UPDATE OR DELETE ON public.own_bank_account_event FOR EACH ROW EXECUTE FUNCTION public.own_bank_accounts_immutable_v1();
CREATE TRIGGER own_bank_accounts_no_truncate BEFORE TRUNCATE ON public.own_bank_account_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_bank_accounts_immutable_v1();
CREATE FUNCTION public.own_bank_accounts_day_v1(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN RETURN false;END IF;
 RETURN to_char((v#>>'{}')::date,'YYYY-MM-DD')=v#>>'{}';
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
END $$;
CREATE FUNCTION public.own_bank_accounts_key_v1(r jsonb,kind text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT lower(r->>'id') $$;
CREATE FUNCTION public.own_bank_accounts_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-bankAccounts:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_BUSY';END IF;
 LOCK TABLE public.native_employee_registration,public.employment_contract,public.person_identity IN SHARE MODE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'BANK_ACCOUNTS_BUSY';
END $$;
CREATE FUNCTION public.own_bank_accounts_sources_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 result:=jsonb_build_object('contracts',(SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',ec.id,'registrationId',reg.id,'employeeNumber',ec.legacy_legajo,'name',pi.full_name) ORDER BY ec.id),'[]')
 FROM public.native_employee_registration reg JOIN public.employment_contract ec ON ec.id=reg.contract_id AND ec.person_id=reg.person_id AND ec.tenant_id=reg.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL
 JOIN public.person_identity pi ON pi.id=reg.person_id WHERE reg.tenant_id=(ctx->>'tenantId')::uuid AND reg.source_binding_id=(ctx->>'sourceBindingId')::uuid));
 IF jsonb_array_length(result->'contracts')>10000 OR octet_length(result::text)>8388000 THEN RAISE EXCEPTION 'BANK_ACCOUNTS_LIMIT';END IF;
 RETURN result||jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-bank-accounts.v1',ctx->>'tenantId',ctx->>'sourceBindingId',result)),'sha256'),'hex'));
END $$;
CREATE FUNCTION public.own_bank_accounts_cbu_v1(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE n text;first_sum integer:=0;second_sum integer:=0;i integer;first_weights integer[]:=ARRAY[7,1,3,9,7,1,3];second_weights integer[]:=ARRAY[3,9,7,1,3,9,7,1,3,9,7,1,3];
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'string' THEN RETURN false;END IF;n:=v#>>'{}';IF n!~'^[0-9]{22}$' OR n~'^0+$' THEN RETURN false;END IF;
 FOR i IN 1..7 LOOP first_sum:=first_sum+substr(n,i,1)::integer*first_weights[i];END LOOP;
 FOR i IN 1..13 LOOP second_sum:=second_sum+substr(n,i+8,1)::integer*second_weights[i];END LOOP;
 RETURN (10-first_sum%10)%10=substr(n,8,1)::integer AND (10-second_sum%10)%10=substr(n,22,1)::integer;
END $$;
CREATE FUNCTION public.own_bank_accounts_definition_v1(d jsonb,sources jsonb,baseline jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;result jsonb;
BEGIN
 IF NOT public.own_program_exact_v1(d,ARRAY['accounts']) OR jsonb_typeof(d->'accounts') IS DISTINCT FROM 'array' OR jsonb_array_length(d->'accounts')=0 THEN RAISE EXCEPTION 'BANK_ACCOUNTS_INPUT_INVALID';END IF;
 IF jsonb_array_length(d->'accounts')>10000 THEN RAISE EXCEPTION 'BANK_ACCOUNTS_LIMIT';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(d->'accounts') LOOP
  IF NOT public.own_program_exact_v1(r,ARRAY['id','contractId','bankLabel','cbu','accountType','accountNumber','currency','validFrom','validUntil','status','documentReference']) OR jsonb_typeof(r->'id') IS DISTINCT FROM 'string' OR r->>'id'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(r->'contractId') IS DISTINCT FROM 'string' OR r->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR NOT public.own_program_text_v1(r->'bankLabel',1,160) OR NOT public.own_bank_accounts_cbu_v1(r->'cbu') OR (r->'accountType'<>'null' AND (jsonb_typeof(r->'accountType') IS DISTINCT FROM 'string' OR r->>'accountType' NOT IN('CA','CC'))) OR (r->'accountNumber'<>'null' AND NOT public.own_program_text_v1(r->'accountNumber',1,40)) OR jsonb_typeof(r->'currency') IS DISTINCT FROM 'string' OR r->>'currency' NOT IN('ARS','USD') OR jsonb_typeof(r->'status') IS DISTINCT FROM 'string' OR r->>'status' NOT IN('enabled','withdrawn') OR NOT public.own_program_text_v1(r->'documentReference',3,180) OR NOT public.own_bank_accounts_day_v1(r->'validFrom') OR (r->'validUntil'<>'null' AND (NOT public.own_bank_accounts_day_v1(r->'validUntil') OR r->>'validUntil'<r->>'validFrom')) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_INPUT_INVALID';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'accounts') x GROUP BY lower(x->>'id') HAVING count(*)>1) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_INPUT_INVALID';END IF;
 PERFORM public.own_bank_accounts_history_v1(baseline,d);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'accounts') x LEFT JOIN jsonb_array_elements(sources->'contracts') c ON lower(c->>'contractId')=lower(x->>'contractId') LEFT JOIN jsonb_array_elements(coalesce(nullif(baseline,'null')->'accounts','[]')) old ON lower(old->>'id')=lower(x->>'id') WHERE c IS NULL AND (old IS NULL OR NOT(x=old OR x->>'status'='withdrawn' AND x=old||jsonb_build_object('status','withdrawn')))) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_SOURCE_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM(SELECT x->>'validFrom' started,max(coalesce(x->>'validUntil','9999-12-31')) OVER(PARTITION BY lower(x->>'contractId') ORDER BY x->>'validFrom' ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) prior_end FROM jsonb_array_elements(d->'accounts') x WHERE x->>'status'='enabled') intervals WHERE intervals.prior_end>=intervals.started) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_OVERLAP';END IF;
 SELECT jsonb_build_object('accounts',jsonb_agg(x ORDER BY lower(x->>'id') COLLATE "C")) INTO result FROM jsonb_array_elements(d->'accounts') x;
 RETURN result;
END $$;
CREATE FUNCTION public.own_bank_accounts_history_v1(baseline jsonb,d jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF baseline IS NULL OR baseline='null' THEN RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(baseline->'accounts') old LEFT JOIN jsonb_array_elements(d->'accounts') fresh ON lower(fresh->>'id')=lower(old->>'id') WHERE fresh IS NULL OR lower(fresh->>'contractId') IS DISTINCT FROM lower(old->>'contractId')) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_HISTORY_REQUIRED';END IF;
END $$;
CREATE FUNCTION public.own_bank_accounts_current_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.own_bank_account_event;proposal public.own_bank_account_event;rev integer;definition jsonb;
BEGIN
 SELECT * INTO e FROM public.own_bank_account_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.command='approve' ORDER BY x.revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO proposal FROM public.own_bank_account_event WHERE id=e.proposal_id;END IF;definition:=proposal.body->'definition';
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-bank-accounts.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,e.id,definition)),'sha256'),'hex'),'revision',rev,'definition',definition,'proposalId',proposal.id,'approvalId',e.id);
END $$;
CREATE FUNCTION public.own_bank_accounts_summary_v1(ctx jsonb,e public.own_bank_account_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_bank_account_event;independent boolean;
BEGIN
 SELECT * INTO d FROM public.own_bank_account_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'requestSha256',e.request_sha256,'baseVersion',e.body->>'baseVersion','sourceVersion',e.body->>'sourceVersion','reason',e.body->>'reason','createdAt',e.recorded_at,'authorLabel',e.actor_label,'accountCount',jsonb_array_length(e.body#>'{definition,accounts}'),'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;
CREATE FUNCTION public.own_bank_accounts_bootstrap_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;sources jsonb;proposals jsonb;
BEGIN
 ctx:=public.native_salary_context_v1(p);PERFORM public.own_bank_accounts_lock_v1(ctx);sources:=public.own_bank_accounts_sources_v1(ctx);
 SELECT coalesce(jsonb_agg(public.own_bank_accounts_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals FROM public.own_bank_account_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose';
 IF jsonb_array_length(proposals)>500 THEN RAISE EXCEPTION 'BANK_ACCOUNTS_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-bank-accounts.v1','scopeVersion',public.native_salary_scope_v1(ctx),'sources',sources,'configuration',public.own_bank_accounts_current_v1(ctx),'proposals',proposals,'permissions',jsonb_build_object('canPropose',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),'canReview',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),'complete',true,'transferGenerated',false,'paymentExecuted',false);
END $$;
CREATE FUNCTION public.own_bank_accounts_detail_v1(p jsonb,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_bank_account_event;sources jsonb;configuration jsonb;
BEGIN
 ctx:=public.native_salary_context_v1(p);PERFORM public.own_bank_accounts_lock_v1(ctx);
 SELECT * INTO e FROM public.own_bank_account_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'BANK_ACCOUNTS_NOT_FOUND';END IF;
 sources:=public.own_bank_accounts_sources_v1(ctx);configuration:=public.own_bank_accounts_current_v1(ctx);
 RETURN jsonb_build_object('version','own-bank-accounts.v1','scopeVersion',public.native_salary_scope_v1(ctx),'proposal',public.own_bank_accounts_summary_v1(ctx,e),'body',e.body,'baseDefinition',e.base_definition,'sources',e.source_snapshot,'current',e.body->>'baseVersion'=configuration->>'version' AND e.body->>'sourceVersion'=sources->>'version');
END $$;
CREATE FUNCTION public.own_bank_accounts_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_bank_account_event;
BEGIN
 ctx:=public.native_salary_context_v1(p);
 SELECT * INTO e FROM public.own_bank_account_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'BANK_ACCOUNTS_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_FORBIDDEN';END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.own_bank_accounts_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;configuration jsonb;sources jsonb;proposal public.own_bank_account_event;prior public.own_bank_account_event;definition jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_sources jsonb;field text;added_bytes bigint;
BEGIN
 ctx:=public.native_salary_context_v1(p);cmd:=body->>'command';
 IF NOT public.own_program_exact_v1(body,ARRAY['command','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','definition','reason','reviewConfirmed']) OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_text_v1(body->'reason',10,1000) OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>8388608 OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'BANK_ACCOUNTS_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'BANK_ACCOUNTS_INPUT_INVALID';END IF;END LOOP;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_FORBIDDEN';END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'BANK_ACCOUNTS_EMPLOYMENT_REQUIRED';END IF;
 PERFORM public.own_bank_accounts_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_bank_account_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint OR prior.body<>body THEN RAISE EXCEPTION 'BANK_ACCOUNTS_IDEMPOTENCY_REUSE';END IF;RETURN public.own_bank_accounts_attempt_v1(p,key);END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_SCOPE_CHANGED';END IF;
 configuration:=public.own_bank_accounts_current_v1(ctx);rev:=(configuration->>'revision')::integer;
 IF cmd='propose' THEN
  sources:=public.own_bank_accounts_sources_v1(ctx);
  IF body->'proposalId'<>'null' OR body->'proposalSha256'<>'null' OR body->'reviewConfirmed'<>'false' THEN RAISE EXCEPTION 'BANK_ACCOUNTS_INPUT_INVALID';END IF;
  IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM sources->>'version' THEN RAISE EXCEPTION 'BANK_ACCOUNTS_BASE_CHANGED';END IF;
  definition:=public.own_bank_accounts_definition_v1(body->'definition',sources,configuration->'definition');
  IF definition IS DISTINCT FROM body->'definition' OR definition=configuration->'definition' THEN RAISE EXCEPTION 'BANK_ACCOUNTS_INPUT_INVALID';END IF;
  PERFORM public.own_bank_accounts_history_v1(configuration->'definition',definition);
  pid:=eid;baseline:=configuration->'definition';captured_sources:=sources;
 ELSE
  IF body->'definition'<>'null' OR body->'reviewConfirmed'<>'true' OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'BANK_ACCOUNTS_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.own_bank_account_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'BANK_ACCOUNTS_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_bank_account_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_DECIDED';END IF;
  IF NOT(public.own_bank_accounts_summary_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'BANK_ACCOUNTS_INDEPENDENT_REQUIRED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'sourceVersion' IS DISTINCT FROM proposal.body->>'sourceVersion' THEN RAISE EXCEPTION 'BANK_ACCOUNTS_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_definition;captured_sources:=proposal.source_snapshot;
  IF cmd='approve' THEN
   sources:=public.own_bank_accounts_sources_v1(ctx);
   IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM sources->>'version' THEN RAISE EXCEPTION 'BANK_ACCOUNTS_BASE_CHANGED';END IF;
   definition:=public.own_bank_accounts_definition_v1(proposal.body->'definition',sources,configuration->'definition');rev:=rev+1;
   configuration:=jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-bank-accounts.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,eid,definition)),'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_bank_account_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>=500 THEN RAISE EXCEPTION 'BANK_ACCOUNTS_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-bankAccounts:capacity:v1',0)) THEN RAISE EXCEPTION 'BANK_ACCOUNTS_BUSY';END IF;
 added_bytes:=4*octet_length(body::text)+octet_length(coalesce(baseline,'null')::text)+octet_length(captured_sources::text);
 IF (SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_definition::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_bank_account_event e)+added_bytes>268435456 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_definition::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_bank_account_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid)+added_bytes>134217728 THEN RAISE EXCEPTION 'BANK_ACCOUNTS_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','own-bank-accounts.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'configurationVersion',configuration->>'version','replayed',false,'transferGenerated',false,'paymentExecuted',false);
 INSERT INTO public.own_bank_account_event(id,tenant_id,source_binding_id,proposal_id,command,body,base_definition,source_snapshot,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,coalesce(baseline,'null'),captured_sources,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION public.own_bank_accounts_cbu_v1(jsonb),public.own_bank_accounts_immutable_v1(),public.own_bank_accounts_day_v1(jsonb),public.own_bank_accounts_key_v1(jsonb,text),public.own_bank_accounts_lock_v1(jsonb),public.own_bank_accounts_sources_v1(jsonb),public.own_bank_accounts_definition_v1(jsonb,jsonb,jsonb),public.own_bank_accounts_history_v1(jsonb,jsonb),public.own_bank_accounts_current_v1(jsonb),public.own_bank_accounts_summary_v1(jsonb,public.own_bank_account_event),public.own_bank_accounts_bootstrap_v1(jsonb),public.own_bank_accounts_detail_v1(jsonb,uuid),public.own_bank_accounts_attempt_v1(jsonb,uuid),public.own_bank_accounts_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_bank_accounts_bootstrap_v1(jsonb),public.own_bank_accounts_detail_v1(jsonb,uuid),public.own_bank_accounts_attempt_v1(jsonb,uuid),public.own_bank_accounts_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
