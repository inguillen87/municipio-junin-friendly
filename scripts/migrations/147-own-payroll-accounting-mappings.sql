-- Own annual destinations and institutional assignments, independently reviewed.
-- Configuration only: no ledger posting, payment, salary computation or adoption.
DO $$ BEGIN
 IF to_regclass('public.own_payroll_accounting_event') IS NOT NULL THEN RAISE EXCEPTION 'ACCOUNTING_ALREADY_INSTALLED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_accounting_%') THEN RAISE EXCEPTION 'ACCOUNTING_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.native_salary_context_v1(jsonb)') IS NULL OR to_regprocedure('public.own_program_coverage_v1(jsonb,text,text)') IS NULL OR to_regclass('public.native_employee_registration') IS NULL THEN RAISE EXCEPTION 'ACCOUNTING_PREREQUISITE';END IF;
END $$;
CREATE TABLE public.own_payroll_accounting_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 proposal_id uuid REFERENCES public.own_payroll_accounting_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=8388608),base_definition jsonb NOT NULL CHECK(jsonb_typeof(base_definition) IN('null','object')),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object' AND octet_length(source_snapshot::text)<=8388608),
 revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),actor_label text NOT NULL,request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((command='propose')=(proposal_id IS NULL)),UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_accounting_approval_revision ON public.own_payroll_accounting_event(tenant_id,source_binding_id,revision) WHERE command='approve';
ALTER TABLE public.own_payroll_accounting_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_payroll_accounting_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_accounting_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'ACCOUNTING_IMMUTABLE';END $$;
CREATE TRIGGER own_accounting_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_accounting_event FOR EACH ROW EXECUTE FUNCTION public.own_accounting_immutable_v1();
CREATE TRIGGER own_accounting_no_truncate BEFORE TRUNCATE ON public.own_payroll_accounting_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_accounting_immutable_v1();
CREATE FUNCTION public.own_accounting_day_v1(v jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN RETURN false;END IF;
 RETURN to_char((v#>>'{}')::date,'YYYY-MM-DD')=v#>>'{}';
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
END $$;
CREATE FUNCTION public.own_accounting_key_v1(r jsonb,kind text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT CASE WHEN kind='mappings' THEN concat_ws(':',r->>'fiscalYear',r->>'jurisdictionCode',r->>'agreementCode',r->>'departmentCode',r->>'conceptCode',r->>'validFrom') ELSE lower(r->>'contractId')||':'||coalesce(r->>'conceptCode','*')||':'||(r->>'validFrom') END
$$;
CREATE FUNCTION public.own_accounting_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-accounting:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'ACCOUNTING_BUSY';END IF;
 LOCK TABLE public.native_employee_registration,public.employment_contract,public.person_identity IN SHARE MODE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'ACCOUNTING_BUSY';
END $$;
CREATE FUNCTION public.own_accounting_sources_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE classifications jsonb;salary_catalog jsonb;result jsonb;
BEGIN
 classifications:=public.native_employee_catalog_v1(ctx);salary_catalog:=public.native_salary_catalog_v1(ctx);
 IF classifications->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR coalesce((salary_catalog->>'revision')::integer,0)=0 THEN RAISE EXCEPTION 'ACCOUNTING_SOURCE_REQUIRED';END IF;
 result:=jsonb_build_object('classificationVersion',classifications->>'version','salaryVersion',salary_catalog->>'version',
 'agreements',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',x->>'code','label',x->>'label') ORDER BY (x->>'code') COLLATE "C"),'[]') FROM jsonb_array_elements(classifications->'items') x WHERE x->>'kind'='agreements'),
 'departments',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',x->>'code','label',x->>'label') ORDER BY (x->>'code') COLLATE "C"),'[]') FROM jsonb_array_elements(classifications->'items') x WHERE x->>'kind'='sectors'),
 'concepts',(SELECT coalesce(jsonb_agg(jsonb_build_object('agreementCode',x->>'agreementCode','code',x->>'code','nature',x->>'nature','label',x->>'label','validFrom',x->>'validFrom','validUntil',x->'validUntil') ORDER BY (x->>'agreementCode') COLLATE "C",(x->>'code') COLLATE "C",x->>'validFrom'),'[]') FROM jsonb_array_elements(salary_catalog->'items') x WHERE x->>'active'='true' AND x->>'kind'='concept' AND x->>'nature' IN('remuneration','non_remuneration','deduction','employer_contribution')),
 'contracts',(SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',ec.id,'registrationId',reg.id,'employeeNumber',ec.legacy_legajo,'name',pi.full_name) ORDER BY ec.id),'[]')
 FROM public.native_employee_registration reg JOIN public.employment_contract ec ON ec.id=reg.contract_id AND ec.person_id=reg.person_id AND ec.tenant_id=reg.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL
 JOIN public.person_identity pi ON pi.id=reg.person_id WHERE reg.tenant_id=(ctx->>'tenantId')::uuid AND reg.source_binding_id=(ctx->>'sourceBindingId')::uuid));
 IF jsonb_array_length(result->'agreements')>1000 OR jsonb_array_length(result->'departments')>1000 OR jsonb_array_length(result->'concepts')>1000 OR jsonb_array_length(result->'contracts')>10000 OR octet_length(result::text)>8388000 THEN RAISE EXCEPTION 'ACCOUNTING_LIMIT';END IF;
 RETURN result||jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-payroll-accounting.v1',ctx->>'tenantId',ctx->>'sourceBindingId',result)),'sha256'),'hex'));
END $$;
CREATE FUNCTION public.own_accounting_definition_v1(d jsonb,sources jsonb,baseline jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;field text;kind text;matching jsonb;result jsonb;
BEGIN
 IF NOT public.own_program_exact_v1(d,ARRAY['mappings','assignments']) OR jsonb_typeof(d->'mappings') IS DISTINCT FROM 'array' OR jsonb_typeof(d->'assignments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
 IF jsonb_array_length(d->'mappings')>2000 OR jsonb_array_length(d->'assignments')>10000 THEN RAISE EXCEPTION 'ACCOUNTING_LIMIT';END IF;
 IF jsonb_array_length(d->'mappings')+jsonb_array_length(d->'assignments')=0 THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
 PERFORM public.own_accounting_history_v1(baseline,d);
 FOR r IN SELECT value FROM jsonb_array_elements(d->'mappings') LOOP
  IF NOT public.own_program_exact_v1(r,ARRAY['fiscalYear','jurisdictionCode','agreementCode','departmentCode','conceptCode','nature','budgetItemReference','supplierReference','creditorReference','accountingAccountReference','bankAccountReference','bankReference','validFrom','validUntil','ruleReference']) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
  FOREACH field IN ARRAY ARRAY['fiscalYear','jurisdictionCode','agreementCode','departmentCode','conceptCode','nature'] LOOP IF jsonb_typeof(r->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;END LOOP;
  IF r->>'fiscalYear'!~'^(19|20)[0-9]{2}$' OR r->>'jurisdictionCode' NOT IN('42','55') OR r->>'agreementCode'!~'^[0-9]{1,9}$' OR r->>'departmentCode'!~'^[0-9]{1,9}$' OR r->>'conceptCode'!~'^[0-9]{1,9}$' OR r->>'nature' NOT IN('remuneration','non_remuneration','deduction','employer_contribution') OR NOT public.own_accounting_day_v1(r->'validFrom') OR NOT public.own_accounting_day_v1(r->'validUntil') OR r->>'validUntil'<r->>'validFrom' OR left(r->>'validFrom',4)<>r->>'fiscalYear' OR left(r->>'validUntil',4)<>r->>'fiscalYear' OR NOT public.own_program_text_v1(r->'budgetItemReference',1,80) OR NOT public.own_program_text_v1(r->'ruleReference',3,180) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
  FOREACH field IN ARRAY ARRAY['supplierReference','creditorReference','accountingAccountReference','bankAccountReference','bankReference'] LOOP IF r->field<>'null' AND NOT public.own_program_text_v1(r->field,1,80) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;END LOOP;
  -- Immutable prior references stay auditable when a source is later archived.
  -- Only unchanged rows or an earlier closing date qualify; history checked above.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(baseline,'null')->'mappings','[]')) old WHERE public.own_accounting_key_v1(old,'mappings')=public.own_accounting_key_v1(r,'mappings')) THEN CONTINUE;END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'agreements') x WHERE x->>'code'=r->>'agreementCode') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(sources->'departments') x WHERE x->>'code'=r->>'departmentCode') THEN RAISE EXCEPTION 'ACCOUNTING_SOURCE_REQUIRED';END IF;
  SELECT jsonb_agg(x) INTO matching FROM jsonb_array_elements(sources->'concepts') x WHERE x->>'agreementCode'=r->>'agreementCode' AND x->>'code'=r->>'conceptCode' AND x->>'nature'=r->>'nature';
  IF NOT public.own_program_coverage_v1(matching,left(r->>'validFrom',7),left(r->>'validUntil',7)) THEN RAISE EXCEPTION 'ACCOUNTING_SOURCE_REQUIRED';END IF;
 END LOOP;
 FOR r IN SELECT value FROM jsonb_array_elements(d->'assignments') LOOP
  IF NOT public.own_program_exact_v1(r,ARRAY['contractId','conceptCode','institutionalReference','functionReference','validFrom','validUntil','ruleReference']) OR jsonb_typeof(r->'contractId') IS DISTINCT FROM 'string' OR r->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR (r->'conceptCode'<>'null' AND (jsonb_typeof(r->'conceptCode') IS DISTINCT FROM 'string' OR r->>'conceptCode'!~'^[0-9]{1,9}$')) OR NOT public.own_program_text_v1(r->'institutionalReference',1,80) OR NOT public.own_program_text_v1(r->'functionReference',1,80) OR NOT public.own_program_text_v1(r->'ruleReference',3,180) OR NOT public.own_accounting_day_v1(r->'validFrom') OR (r->'validUntil'<>'null' AND (NOT public.own_accounting_day_v1(r->'validUntil') OR r->>'validUntil'<r->>'validFrom')) THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'assignments') a LEFT JOIN jsonb_array_elements(coalesce(nullif(baseline,'null')->'assignments','[]')) old ON public.own_accounting_key_v1(a,'assignments')=public.own_accounting_key_v1(old,'assignments') LEFT JOIN jsonb_array_elements(sources->'contracts') c ON lower(a->>'contractId')=lower(c->>'contractId') WHERE old IS NULL AND c IS NULL) OR EXISTS(SELECT 1 FROM jsonb_array_elements(d->'assignments') a LEFT JOIN jsonb_array_elements(coalesce(nullif(baseline,'null')->'assignments','[]')) old ON public.own_accounting_key_v1(a,'assignments')=public.own_accounting_key_v1(old,'assignments') LEFT JOIN(SELECT DISTINCT x->>'code' code FROM jsonb_array_elements(sources->'concepts') x) c ON a->>'conceptCode'=c.code WHERE old IS NULL AND a->'conceptCode'<>'null' AND c.code IS NULL) THEN RAISE EXCEPTION 'ACCOUNTING_SOURCE_REQUIRED';END IF;
 -- Window comparisons are linear after sorting, including earlier open intervals.
 FOREACH kind IN ARRAY ARRAY['mappings','assignments'] LOOP
  IF EXISTS(SELECT 1 FROM(SELECT entries.row_data->>'validFrom' started,max(coalesce(entries.row_data->>'validUntil','9999-12-31')) OVER(PARTITION BY left(public.own_accounting_key_v1(entries.row_data,kind),length(public.own_accounting_key_v1(entries.row_data,kind))-11) ORDER BY entries.row_data->>'validFrom' ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) prior_end FROM jsonb_array_elements(d->kind) AS entries(row_data)) x WHERE x.prior_end>=x.started) THEN RAISE EXCEPTION 'ACCOUNTING_OVERLAP';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM(SELECT entries.row_data,max(CASE WHEN entries.row_data->'conceptCode'='null' THEN coalesce(entries.row_data->>'validUntil','9999-12-31') END) OVER w generic_end,max(CASE WHEN entries.row_data->'conceptCode'<>'null' THEN coalesce(entries.row_data->>'validUntil','9999-12-31') END) OVER w specific_end FROM jsonb_array_elements(d->'assignments') AS entries(row_data) WINDOW w AS(PARTITION BY lower(entries.row_data->>'contractId') ORDER BY entries.row_data->>'validFrom',(entries.row_data->'conceptCode'<>'null') ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)) intervals WHERE CASE WHEN intervals.row_data->'conceptCode'='null' THEN intervals.specific_end ELSE intervals.generic_end END>=intervals.row_data->>'validFrom') THEN RAISE EXCEPTION 'ACCOUNTING_OVERLAP';END IF;
 SELECT jsonb_build_object('mappings',(SELECT coalesce(jsonb_agg(entries.row_data ORDER BY public.own_accounting_key_v1(entries.row_data,'mappings') COLLATE "C"),'[]') FROM jsonb_array_elements(d->'mappings') AS entries(row_data)),'assignments',(SELECT coalesce(jsonb_agg(entries.row_data ORDER BY public.own_accounting_key_v1(entries.row_data,'assignments') COLLATE "C"),'[]') FROM jsonb_array_elements(d->'assignments') AS entries(row_data))) INTO result;
 RETURN result;
END $$;
CREATE FUNCTION public.own_accounting_history_v1(baseline jsonb,d jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE kind text;
BEGIN
 IF baseline IS NULL OR baseline='null' THEN RETURN;END IF;
 FOREACH kind IN ARRAY ARRAY['mappings','assignments'] LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(baseline->kind) old LEFT JOIN jsonb_array_elements(d->kind) fresh ON public.own_accounting_key_v1(fresh,kind)=public.own_accounting_key_v1(old,kind) WHERE fresh IS NULL OR fresh-'validUntil' IS DISTINCT FROM old-'validUntil' OR NOT(fresh->'validUntil'=old->'validUntil' OR fresh->'validUntil'<>'null' AND (old->'validUntil'='null' OR fresh->>'validUntil'<old->>'validUntil'))) THEN RAISE EXCEPTION 'ACCOUNTING_HISTORY_REQUIRED';END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.own_accounting_current_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.own_payroll_accounting_event;proposal public.own_payroll_accounting_event;rev integer;definition jsonb;
BEGIN
 SELECT * INTO e FROM public.own_payroll_accounting_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.command='approve' ORDER BY x.revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO proposal FROM public.own_payroll_accounting_event WHERE id=e.proposal_id;END IF;definition:=proposal.body->'definition';
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-payroll-accounting.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,e.id,definition)),'sha256'),'hex'),'revision',rev,'definition',definition,'proposalId',proposal.id,'approvalId',e.id);
END $$;
CREATE FUNCTION public.own_accounting_summary_v1(ctx jsonb,e public.own_payroll_accounting_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_payroll_accounting_event;independent boolean;
BEGIN
 SELECT * INTO d FROM public.own_payroll_accounting_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'requestSha256',e.request_sha256,'baseVersion',e.body->>'baseVersion','sourceVersion',e.body->>'sourceVersion','reason',e.body->>'reason','createdAt',e.recorded_at,'authorLabel',e.actor_label,'mappingCount',jsonb_array_length(e.body#>'{definition,mappings}'),'assignmentCount',jsonb_array_length(e.body#>'{definition,assignments}'),'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;
CREATE FUNCTION public.own_accounting_bootstrap_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;sources jsonb;proposals jsonb;
BEGIN
 ctx:=public.native_salary_context_v1(p);PERFORM public.own_accounting_lock_v1(ctx);sources:=public.own_accounting_sources_v1(ctx);
 SELECT coalesce(jsonb_agg(public.own_accounting_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals FROM public.own_payroll_accounting_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='propose';
 IF jsonb_array_length(proposals)>500 THEN RAISE EXCEPTION 'ACCOUNTING_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-payroll-accounting.v1','scopeVersion',public.native_salary_scope_v1(ctx),'sources',sources,'configuration',public.own_accounting_current_v1(ctx),'proposals',proposals,'permissions',jsonb_build_object('canPropose',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),'canReview',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),'complete',true,'accountingPosted',false,'paymentExecuted',false);
END $$;
CREATE FUNCTION public.own_accounting_detail_v1(p jsonb,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_payroll_accounting_event;sources jsonb;configuration jsonb;
BEGIN
 ctx:=public.native_salary_context_v1(p);PERFORM public.own_accounting_lock_v1(ctx);
 SELECT * INTO e FROM public.own_payroll_accounting_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNTING_NOT_FOUND';END IF;
 sources:=public.own_accounting_sources_v1(ctx);configuration:=public.own_accounting_current_v1(ctx);
 RETURN jsonb_build_object('version','own-payroll-accounting.v1','scopeVersion',public.native_salary_scope_v1(ctx),'proposal',public.own_accounting_summary_v1(ctx,e),'body',e.body,'baseDefinition',e.base_definition,'sources',e.source_snapshot,'current',e.body->>'baseVersion'=configuration->>'version' AND e.body->>'sourceVersion'=sources->>'version');
END $$;
CREATE FUNCTION public.own_accounting_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_payroll_accounting_event;
BEGIN
 ctx:=public.native_salary_context_v1(p);
 SELECT * INTO e FROM public.own_payroll_accounting_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNTING_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN';END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.own_accounting_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;configuration jsonb;sources jsonb;proposal public.own_payroll_accounting_event;prior public.own_payroll_accounting_event;definition jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_sources jsonb;field text;added_bytes bigint;
BEGIN
 ctx:=public.native_salary_context_v1(p);cmd:=body->>'command';
 IF NOT public.own_program_exact_v1(body,ARRAY['command','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','definition','reason','reviewConfirmed']) OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_text_v1(body->'reason',10,1000) OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>8388608 OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;END LOOP;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN';END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'ACCOUNTING_EMPLOYMENT_REQUIRED';END IF;
 PERFORM public.own_accounting_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_payroll_accounting_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint OR prior.body<>body THEN RAISE EXCEPTION 'ACCOUNTING_IDEMPOTENCY_REUSE';END IF;RETURN public.own_accounting_attempt_v1(p,key);END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'ACCOUNTING_SCOPE_CHANGED';END IF;
 configuration:=public.own_accounting_current_v1(ctx);rev:=(configuration->>'revision')::integer;
 IF cmd='propose' THEN
  sources:=public.own_accounting_sources_v1(ctx);
  IF body->'proposalId'<>'null' OR body->'proposalSha256'<>'null' OR body->'reviewConfirmed'<>'false' THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
  IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM sources->>'version' THEN RAISE EXCEPTION 'ACCOUNTING_BASE_CHANGED';END IF;
  definition:=public.own_accounting_definition_v1(body->'definition',sources,configuration->'definition');
  IF definition IS DISTINCT FROM body->'definition' OR definition=configuration->'definition' THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
  PERFORM public.own_accounting_history_v1(configuration->'definition',definition);
  pid:=eid;baseline:=configuration->'definition';captured_sources:=sources;
 ELSE
  IF body->'definition'<>'null' OR body->'reviewConfirmed'<>'true' OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ACCOUNTING_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.own_payroll_accounting_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACCOUNTING_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_payroll_accounting_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'ACCOUNTING_DECIDED';END IF;
  IF NOT(public.own_accounting_summary_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'ACCOUNTING_INDEPENDENT_REQUIRED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'sourceVersion' IS DISTINCT FROM proposal.body->>'sourceVersion' THEN RAISE EXCEPTION 'ACCOUNTING_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_definition;captured_sources:=proposal.source_snapshot;
  IF cmd='approve' THEN
   sources:=public.own_accounting_sources_v1(ctx);
   IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM sources->>'version' THEN RAISE EXCEPTION 'ACCOUNTING_BASE_CHANGED';END IF;
   definition:=public.own_accounting_definition_v1(proposal.body->'definition',sources,configuration->'definition');rev:=rev+1;
   configuration:=jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-payroll-accounting.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,eid,definition)),'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_payroll_accounting_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>=500 THEN RAISE EXCEPTION 'ACCOUNTING_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-accounting:capacity:v1',0)) THEN RAISE EXCEPTION 'ACCOUNTING_BUSY';END IF;
 added_bytes:=4*octet_length(body::text)+octet_length(coalesce(baseline,'null')::text)+octet_length(captured_sources::text);
 IF (SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_definition::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_payroll_accounting_event e)+added_bytes>268435456 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_definition::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_payroll_accounting_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid)+added_bytes>134217728 THEN RAISE EXCEPTION 'ACCOUNTING_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','own-payroll-accounting.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'configurationVersion',configuration->>'version','replayed',false,'accountingPosted',false,'paymentExecuted',false);
 INSERT INTO public.own_payroll_accounting_event(id,tenant_id,source_binding_id,proposal_id,command,body,base_definition,source_snapshot,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,coalesce(baseline,'null'),captured_sources,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;
REVOKE ALL ON FUNCTION public.own_accounting_immutable_v1(),public.own_accounting_day_v1(jsonb),public.own_accounting_key_v1(jsonb,text),public.own_accounting_lock_v1(jsonb),public.own_accounting_sources_v1(jsonb),public.own_accounting_definition_v1(jsonb,jsonb,jsonb),public.own_accounting_history_v1(jsonb,jsonb),public.own_accounting_current_v1(jsonb),public.own_accounting_summary_v1(jsonb,public.own_payroll_accounting_event),public.own_accounting_bootstrap_v1(jsonb),public.own_accounting_detail_v1(jsonb,uuid),public.own_accounting_attempt_v1(jsonb,uuid),public.own_accounting_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_accounting_bootstrap_v1(jsonb),public.own_accounting_detail_v1(jsonb,uuid),public.own_accounting_attempt_v1(jsonb,uuid),public.own_accounting_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
