-- Candidate for explicit native-contract selections; no data/IAM/session changes.
-- Apply only through the composed reviewed installer. Existing V1 events remain immutable.
DO $prerequisite$ BEGIN
 IF to_regprocedure('public.own_family_payroll_facts_ids_v2(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.own_family_payroll_facts_current_v1(jsonb,text)') IS NULL OR to_regclass('public.own_family_payroll_facts_event') IS NULL THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_PREREQUISITE';END IF;
END $prerequisite$;

CREATE FUNCTION public.own_family_payroll_facts_ids_v2(contract_ids jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item jsonb;prior_id text:='';id_value text;
BEGIN
 IF jsonb_typeof(contract_ids) IS DISTINCT FROM 'array' OR jsonb_array_length(contract_ids) NOT BETWEEN 1 AND 10000
 OR octet_length(contract_ids::text)>4194304 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(contract_ids) LOOP
  id_value:=item#>>'{}';
  IF jsonb_typeof(item) IS DISTINCT FROM 'string' OR id_value!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR id_value COLLATE "C"<=prior_id COLLATE "C" THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
  prior_id:=id_value;
 END LOOP;
 RETURN contract_ids;
END $$;

CREATE FUNCTION public.own_family_payroll_facts_records_v2(ctx jsonb,period_value text,contract_ids jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE records jsonb;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
 -- A complete V1 approval is the historical baseline. Only partial approvals
 -- after it overlay their own contracts. Their approval never belongs to others.
 WITH approvals AS MATERIALIZED(
  SELECT e.id,e.revision,p.body FROM public.own_family_payroll_facts_event e
  JOIN public.own_family_payroll_facts_event p ON p.id=e.proposal_id AND p.command='propose'
   AND p.tenant_id=e.tenant_id AND p.source_binding_id=e.source_binding_id AND p.period_month=e.period_month
  WHERE e.command='approve' AND e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid
   AND e.period_month=(period_value||'-01')::date
 ),legacy AS MATERIALIZED(
  SELECT * FROM approvals WHERE NOT(body?'version') ORDER BY revision DESC LIMIT 1
 ),applicable AS MATERIALIZED(
  SELECT * FROM legacy UNION ALL
  SELECT * FROM approvals WHERE body->>'version'='own-contract-family-payroll-facts.v2'
   AND revision>coalesce((SELECT revision FROM legacy),0)
 ),items AS MATERIALIZED(
  SELECT a.id,a.revision,i.value FROM applicable a CROSS JOIN LATERAL jsonb_array_elements(a.body->'items') i
  WHERE contract_ids IS NULL OR contract_ids ? (i.value->>'contractId')
 ),latest AS(
  SELECT DISTINCT ON(value->>'contractId') value,id,revision FROM items ORDER BY value->>'contractId',revision DESC
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',value->>'contractId','identityToken',value->>'identityToken',
  'revision',revision,'definition',value->'definition','approvalId',id) ORDER BY value->>'contractId' COLLATE "C"),'[]') INTO records FROM latest;
 IF octet_length(records::text)>4194304 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 RETURN records;
END $$;

CREATE FUNCTION public.own_family_payroll_facts_source_v2(ctx jsonb,period_value text,contract_ids jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE subjects jsonb;subject jsonb;item jsonb;id_value uuid;first_date date;last_date date;
BEGIN
 PERFORM public.own_family_payroll_facts_ids_v2(contract_ids);
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
 first_date:=(period_value||'-01')::date;last_date:=(first_date+interval '1 month'-interval '1 day')::date;
 ctx:=ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId');subjects:='[]';
 FOR item IN SELECT value FROM jsonb_array_elements(contract_ids) LOOP
  id_value:=(item#>>'{}')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.native_employee_registration r WHERE r.contract_id=id_value
   AND r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid)
  THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_SOURCE_REQUIRED';END IF;
  IF public.payroll_fixed_registry_range_v2(ctx,id_value,first_date,last_date,false) IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_SOURCE_REQUIRED';END IF;
  subject:=public.payroll_fixed_registry_subject_v2(ctx,id_value,true)->'subject';
  IF public.own_program_exact_v1(subject,ARRAY['contractId','registrationId','legajo','employeeName','identityToken','sourceCutoff','origin','registeredAt']) IS NOT TRUE
  OR subject->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR subject->>'contractId' IS DISTINCT FROM id_value::text
  THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_SOURCE_REQUIRED';END IF;
  subjects:=subjects||jsonb_build_array(subject);
 END LOOP;
 IF octet_length(subjects::text)>8388608 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 RETURN jsonb_build_object('subjects',subjects,'version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array(
  'own-contract-family-payroll-facts.v2',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,contract_ids,subjects)),'sha256'),'hex'));
END $$;

CREATE FUNCTION public.own_family_payroll_facts_scope_v2(ctx jsonb,period_value text,contract_ids jsonb) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-family-payroll-facts.v2',
  public.native_salary_scope_v1(ctx),period_value,public.own_family_payroll_facts_ids_v2(contract_ids))),'sha256'),'hex')
$$;

CREATE FUNCTION public.own_family_payroll_facts_current_v2(ctx jsonb,period_value text,contract_ids jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE records jsonb;items jsonb;
BEGIN
 PERFORM public.own_family_payroll_facts_ids_v2(contract_ids);
 SELECT coalesce(jsonb_agg(value ORDER BY value->>'contractId' COLLATE "C"),'[]'),
 coalesce(jsonb_agg(value-'revision'-'approvalId' ORDER BY value->>'contractId' COLLATE "C"),'[]') INTO records,items
 FROM jsonb_array_elements(public.own_family_payroll_facts_records_v2(ctx,period_value,contract_ids));
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array(
  'own-contract-family-payroll-facts.v2',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,contract_ids,records)),'sha256'),'hex'),
  'items',items,'records',records);
END $$;

CREATE FUNCTION public.own_family_payroll_facts_summary_v2(ctx jsonb,e public.own_family_payroll_facts_event) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF e.body->>'version' IS DISTINCT FROM 'own-contract-family-payroll-facts.v2' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_NOT_FOUND';END IF;
 RETURN public.own_family_payroll_facts_summary_v1(ctx,e)||jsonb_build_object('contractIds',public.own_family_payroll_facts_ids_v2(e.body->'contractIds'));
END $$;

CREATE FUNCTION public.own_family_payroll_facts_history_v2(p jsonb,period_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;proposals jsonb;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
 ctx:=public.own_family_payroll_facts_context_v1(p);PERFORM public.own_family_payroll_facts_lock_v1(ctx);
 SELECT coalesce(jsonb_agg(public.own_family_payroll_facts_summary_v2(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals
 FROM public.own_family_payroll_facts_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND e.period_month=(period_value||'-01')::date AND e.command='propose' AND e.body->>'version'='own-contract-family-payroll-facts.v2';
 IF jsonb_array_length(proposals)>1000 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 PERFORM public.own_family_payroll_facts_session_live_v1(p);
 RETURN jsonb_build_object('version','own-contract-family-payroll-facts.v2','period',period_value,'proposals',proposals,
  'permissions',jsonb_build_object('canPropose',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),
  'canReview',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),
  'complete',true,'payrollCalculated',false,'payrollPosted',false);
END $$;

CREATE FUNCTION public.own_family_payroll_facts_bootstrap_v2(p jsonb,period_value text,contract_ids jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;source_value jsonb;history_value jsonb;legacy_pending jsonb;
BEGIN
 PERFORM public.own_family_payroll_facts_ids_v2(contract_ids);
 ctx:=public.own_family_payroll_facts_context_v1(p);PERFORM public.own_family_payroll_facts_lock_v1(ctx);
 source_value:=public.own_family_payroll_facts_source_v2(ctx,period_value,contract_ids);
 history_value:=public.own_family_payroll_facts_history_v2(p,period_value);
 SELECT coalesce(jsonb_agg(public.own_family_payroll_facts_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO legacy_pending
 FROM public.own_family_payroll_facts_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND e.period_month=(period_value||'-01')::date AND e.command='propose' AND NOT(e.body?'version')
 AND NOT EXISTS(SELECT 1 FROM public.own_family_payroll_facts_event d WHERE d.proposal_id=e.id)
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(e.body->'items') item WHERE contract_ids ? (item->>'contractId'));
 IF jsonb_array_length(legacy_pending)>1000 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 PERFORM public.own_family_payroll_facts_session_live_v1(p);
 RETURN history_value||jsonb_build_object('contractIds',contract_ids,'scopeVersion',public.own_family_payroll_facts_scope_v2(ctx,period_value,contract_ids),
  'source',source_value,'configuration',public.own_family_payroll_facts_current_v2(ctx,period_value,contract_ids),'legacyPendingProposals',legacy_pending);
END $$;

CREATE FUNCTION public.own_family_payroll_facts_detail_v2(p jsonb,pid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_family_payroll_facts_event;source_value jsonb;configuration jsonb;period_value text;ids jsonb;is_current boolean;
BEGIN
 ctx:=public.own_family_payroll_facts_context_v1(p);PERFORM public.own_family_payroll_facts_lock_v1(ctx);
 SELECT * INTO e FROM public.own_family_payroll_facts_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid
 AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND body->>'version'='own-contract-family-payroll-facts.v2';
 IF NOT FOUND THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_NOT_FOUND';END IF;
 period_value:=to_char(e.period_month,'YYYY-MM');ids:=public.own_family_payroll_facts_ids_v2(e.body->'contractIds');
 configuration:=public.own_family_payroll_facts_current_v2(ctx,period_value,ids);
 BEGIN
  source_value:=public.own_family_payroll_facts_source_v2(ctx,period_value,ids);
 EXCEPTION WHEN raise_exception THEN
  -- A withdrawn/ineligible saved source remains readable and rejectable; it
  -- can never be approved without re-validating its current authoritative source.
  IF SQLERRM IN('FAMILY_PAYROLL_FACTS_SOURCE_REQUIRED','NATIVE_EMPLOYMENT_VOID_WITHDRAWN') THEN source_value:=NULL;ELSE RAISE;END IF;
 END;
 is_current:=coalesce(e.body->>'baseVersion'=configuration->>'version' AND e.body->>'sourceVersion'=source_value->>'version',false);
 PERFORM public.own_family_payroll_facts_session_live_v1(p);
 RETURN jsonb_build_object('version','own-contract-family-payroll-facts.v2','period',period_value,'contractIds',ids,
  'scopeVersion',public.own_family_payroll_facts_scope_v2(ctx,period_value,ids),'proposal',public.own_family_payroll_facts_summary_v2(ctx,e),
  'body',e.body,'baseItems',e.base_items,'source',e.source_snapshot,'current',is_current,
  'permissions',jsonb_build_object('canPropose',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),
  'canReview',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')));
END $$;

CREATE FUNCTION public.own_family_payroll_facts_attempt_v2(p jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE receipt_value jsonb;
BEGIN
 receipt_value:=public.own_family_payroll_facts_attempt_v1(p,key);
 IF receipt_value->>'version' IS DISTINCT FROM 'own-contract-family-payroll-facts.v2' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_NOT_FOUND';END IF;
 RETURN receipt_value;
END $$;

CREATE OR REPLACE FUNCTION public.own_family_payroll_facts_current_v1(ctx jsonb, period_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE e public.own_family_payroll_facts_event;p public.own_family_payroll_facts_event;rev integer;items jsonb;
BEGIN
 SELECT * INTO e FROM public.own_family_payroll_facts_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND x.period_month=(period_value||'-01')::date AND x.command='approve' ORDER BY x.revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO p FROM public.own_family_payroll_facts_event WHERE id=e.proposal_id;END IF;SELECT coalesce(jsonb_agg(value-'revision'-'approvalId' ORDER BY value->>'contractId' COLLATE "C"),'[]') INTO items
 FROM jsonb_array_elements(public.own_family_payroll_facts_records_v2(ctx,period_value));
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-family-payroll-facts.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,rev,e.id,items)),'sha256'),'hex'),
 'revision',rev,'items',items,'proposalId',p.id,'approvalId',e.id);
END $function$;

CREATE OR REPLACE FUNCTION public.own_family_payroll_facts_bootstrap_v1(p jsonb, period_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE ctx jsonb;source_value jsonb;proposals jsonb;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
 ctx:=public.own_family_payroll_facts_context_v1(p);PERFORM public.own_family_payroll_facts_lock_v1(ctx);source_value:=public.own_family_payroll_facts_source_v1(ctx,period_value);
 SELECT coalesce(jsonb_agg(public.own_family_payroll_facts_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO proposals
 FROM public.own_family_payroll_facts_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid
 AND e.period_month=(period_value||'-01')::date AND e.command='propose' AND NOT(e.body?'version');
 IF jsonb_array_length(proposals)>1000 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 PERFORM public.own_family_payroll_facts_session_live_v1(p);
 RETURN jsonb_build_object('version','own-contract-family-payroll-facts.v1','period',period_value,'scopeVersion',public.own_family_payroll_facts_scope_v1(ctx,period_value),
 'source',source_value,'configuration',public.own_family_payroll_facts_current_v1(ctx,period_value),'proposals',proposals,
 'permissions',jsonb_build_object('canPropose',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare'),
 'canReview',coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve')),
 'complete',true,'payrollCalculated',false,'payrollPosted',false);
END $function$;

CREATE OR REPLACE FUNCTION public.own_family_payroll_facts_detail_v1(p jsonb, pid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE ctx jsonb;e public.own_family_payroll_facts_event;source_value jsonb;configuration jsonb;period_value text;
BEGIN
 ctx:=public.own_family_payroll_facts_context_v1(p);PERFORM public.own_family_payroll_facts_lock_v1(ctx);
 SELECT * INTO e FROM public.own_family_payroll_facts_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND NOT(body?'version');
 IF NOT FOUND THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_NOT_FOUND';END IF;period_value:=to_char(e.period_month,'YYYY-MM');
 source_value:=public.own_family_payroll_facts_source_v1(ctx,period_value);configuration:=public.own_family_payroll_facts_current_v1(ctx,period_value);
 PERFORM public.own_family_payroll_facts_session_live_v1(p);
 RETURN jsonb_build_object('version','own-contract-family-payroll-facts.v1','period',period_value,'scopeVersion',public.own_family_payroll_facts_scope_v1(ctx,period_value),
 'proposal',public.own_family_payroll_facts_summary_v1(ctx,e),'body',e.body,'baseItems',e.base_items,'source',e.source_snapshot,
 'current',e.body->>'baseVersion'=configuration->>'version' AND e.body->>'sourceVersion'=source_value->>'version');
END $function$;

CREATE OR REPLACE FUNCTION public.own_family_payroll_facts_command_v1(p jsonb, body jsonb, key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE ctx jsonb;fresh jsonb;cmd text;period_value text;configuration jsonb;source_value jsonb;
 proposal public.own_family_payroll_facts_event;prior public.own_family_payroll_facts_event;
 eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_source jsonb;field text;added_bytes bigint;items_value jsonb;
 previous_timeout text:=current_setting('lock_timeout');limit_ms bigint;remaining_ms bigint;lock_deadline timestamptz;locked_relation text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_ISOLATION_REQUIRED';END IF;
 ctx:=public.own_family_payroll_facts_context_v1(p);cmd:=body->>'command';
 IF public.own_program_exact_v1(body,ARRAY['command','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','items','reason','reviewConfirmed']) IS NOT TRUE
 OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR public.own_program_text_v1(body->'reason',10,1000) IS NOT TRUE
 OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR octet_length(body::text)>4194304 OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
 period_value:=body->>'period';
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion'] LOOP
  IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
 END LOOP;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_FORBIDDEN';END IF;
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-family-payroll-facts:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BUSY';END IF;
 SELECT setting::bigint INTO STRICT limit_ms FROM pg_catalog.pg_settings WHERE name='lock_timeout';
 IF limit_ms<=0 OR limit_ms>1000 THEN limit_ms:=1000;END IF;lock_deadline:=clock_timestamp()+limit_ms*interval '1 millisecond';
 BEGIN
  FOREACH locked_relation IN ARRAY ARRAY['native_employee_registration','employment_contract','person_identity','platform_tenant_source_binding','employment_adoption_application','employment_adoption_decision','employment_adoption_proposal','native_employment_lifecycle_review'] LOOP
   remaining_ms:=floor(EXTRACT(EPOCH FROM(lock_deadline-clock_timestamp()))*1000)::bigint;
   IF remaining_ms<=0 THEN RAISE lock_not_available;END IF;
   PERFORM set_config('lock_timeout',remaining_ms::text||'ms',true);EXECUTE format('LOCK TABLE public.%I IN SHARE MODE',locked_relation);
  END LOOP;
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN PERFORM set_config('lock_timeout',previous_timeout,true);RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BUSY';
 END;
 PERFORM set_config('lock_timeout',previous_timeout,true);
 fresh:=public.own_family_payroll_facts_context_v1(p);
 IF public.native_salary_scope_v1(fresh) IS DISTINCT FROM public.native_salary_scope_v1(ctx) OR fresh->'capabilities' IS DISTINCT FROM ctx->'capabilities'
 OR fresh->'scopes' IS DISTINCT FROM ctx->'scopes' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_SCOPE_CHANGED';END IF;ctx:=fresh;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_FORBIDDEN';END IF;
 PERFORM public.own_family_payroll_facts_session_live_v1(p);
 PERFORM public.own_family_payroll_facts_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_family_payroll_facts_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint OR prior.body<>body THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_IDEMPOTENCY_REUSE';END IF;
  RETURN public.own_family_payroll_facts_attempt_v1(p,key);
 END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.own_family_payroll_facts_scope_v1(ctx,period_value) THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_SCOPE_CHANGED';END IF;
 configuration:=public.own_family_payroll_facts_current_v1(ctx,period_value);rev:=(configuration->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->'proposalId' IS DISTINCT FROM 'null'::jsonb OR body->'proposalSha256' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
  source_value:=public.own_family_payroll_facts_source_v1(ctx,period_value);
  IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BASE_CHANGED';END IF;
  items_value:=public.own_family_payroll_facts_items_v1(body->'items',period_value,false);
  IF jsonb_array_length(items_value)<>jsonb_array_length(source_value->'subjects') OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(items_value) WITH ORDINALITY i(value,ordinal)
   FULL JOIN jsonb_array_elements(source_value->'subjects') WITH ORDINALITY s(value,ordinal) USING(ordinal)
   WHERE i.value->>'contractId' IS DISTINCT FROM s.value->>'contractId' OR i.value->>'identityToken' IS DISTINCT FROM s.value->>'identityToken')
  THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_POPULATION_CHANGED';END IF;
  IF items_value=configuration->'items' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
  pid:=eid;baseline:=configuration->'items';captured_source:=source_value;
 ELSE
  IF body->'items' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;
  SELECT * INTO proposal FROM public.own_family_payroll_facts_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid
  AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period_month=(period_value||'-01')::date AND NOT(public.own_family_payroll_facts_event.body?'version');
  IF NOT FOUND THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_family_payroll_facts_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_DECIDED';END IF;
  IF (public.own_family_payroll_facts_summary_v1(ctx,proposal)->>'canReview')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INDEPENDENT_REQUIRED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion'
  OR body->>'sourceVersion' IS DISTINCT FROM proposal.body->>'sourceVersion' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_items;captured_source:=proposal.source_snapshot;
  IF cmd='approve' THEN
   source_value:=public.own_family_payroll_facts_source_v1(ctx,period_value);
   IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BASE_CHANGED';END IF;
   items_value:=public.own_family_payroll_facts_items_v1(proposal.body->'items',period_value,false);rev:=rev+1;
   configuration:=jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-family-payroll-facts.v1',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,rev,eid,items_value)),'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_family_payroll_facts_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period_month=(period_value||'-01')::date AND command='propose')>=1000 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-family-payroll-facts:capacity:v1',0)) THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BUSY';END IF;
 added_bytes:=4*octet_length(body::text)+octet_length(baseline::text)+octet_length(captured_source::text);
 IF (SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_items::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_family_payroll_facts_event e)+added_bytes>536870912
 OR (SELECT sum(pg_database_size(oid)) FROM pg_database)+added_bytes+2097152>1056964608
 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 -- A bounded wait or a large complete set must never keep an expired session
 -- alive through transaction-start now(). Check wall time before the insert.
 PERFORM public.own_family_payroll_facts_session_live_v1(p);
 receipt_value:=jsonb_build_object('version','own-contract-family-payroll-facts.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,
 'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'configurationVersion',configuration->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.own_family_payroll_facts_event(id,tenant_id,source_binding_id,period_month,proposal_id,command,body,base_items,source_snapshot,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(period_value||'-01')::date,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,baseline,captured_source,rev,
 (ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $function$;

CREATE OR REPLACE FUNCTION public.own_family_payroll_facts_capture_v1(ctx jsonb, employees jsonb, period_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE records jsonb;configuration jsonb;identity_changed boolean;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(employees) IS DISTINCT FROM 'array' OR jsonb_array_length(employees)>10000 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_CAPTURE_INVALID';END IF;
 LOCK TABLE public.own_family_payroll_facts_event IN SHARE MODE NOWAIT;
 -- Resolve records only after validating the selected identities below.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(employees) e WHERE jsonb_typeof(e->'contractId') IS DISTINCT FROM 'string'
  OR e->>'contractId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(e->'identityToken') IS DISTINCT FROM 'string' OR e->>'identityToken'!~'^[a-f0-9]{64}$')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(employees) e GROUP BY e->>'contractId' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_CAPTURE_INVALID';END IF;
 configuration:=jsonb_build_object('records',public.own_family_payroll_facts_records_v2(ctx,period_value,
  (SELECT coalesce(jsonb_agg(e->'contractId'),'[]') FROM jsonb_array_elements(employees) e)));
 WITH selected AS MATERIALIZED(SELECT value AS employee FROM jsonb_array_elements(employees)),
 facts AS MATERIALIZED(SELECT value AS item FROM jsonb_array_elements(configuration->'records'))
 SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',e.employee->>'contractId','identityToken',e.employee->>'identityToken',
  'revision',CASE WHEN f.item IS NULL THEN 0 ELSE (f.item->>'revision')::integer END,'definition',f.item->'definition',
  'approvalId',CASE WHEN f.item IS NULL THEN NULL ELSE (f.item->>'approvalId')::uuid END) ORDER BY e.employee->>'contractId' COLLATE "C"),'[]'),
 coalesce(bool_or(f.item IS NOT NULL AND f.item->>'identityToken' IS DISTINCT FROM e.employee->>'identityToken'),false)
 INTO records,identity_changed FROM selected e LEFT JOIN facts f ON f.item->>'contractId'=e.employee->>'contractId';
 IF identity_changed THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_IDENTITY_CHANGED';END IF;
 IF octet_length(records::text)>4194304 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 RETURN jsonb_build_object('complete',true,'records',records,'version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-family-payroll-facts.v1',period_value,records)),'sha256'),'hex'));
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BUSY';
END $function$;

CREATE OR REPLACE FUNCTION public.own_family_payroll_facts_command_v2(p jsonb, body jsonb, key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE ctx jsonb;fresh jsonb;cmd text;period_value text;configuration jsonb;source_value jsonb;
 proposal public.own_family_payroll_facts_event;prior public.own_family_payroll_facts_event;
 eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_source jsonb;field text;added_bytes bigint;items_value jsonb;ids jsonb;records jsonb;
 previous_timeout text:=current_setting('lock_timeout');limit_ms bigint;remaining_ms bigint;lock_deadline timestamptz;locked_relation text;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_ISOLATION_REQUIRED';END IF;
 ctx:=public.own_family_payroll_facts_context_v1(p);cmd:=body->>'command';
 IF public.own_program_exact_v1(body,ARRAY['version','contractIds','command','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','items','reason','reviewConfirmed']) IS NOT TRUE
 OR body->>'version' IS DISTINCT FROM 'own-contract-family-payroll-facts.v2'
 OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR public.own_program_text_v1(body->'reason',10,1000) IS NOT TRUE
 OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR octet_length(body::text)>4194304 OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
 period_value:=body->>'period';ids:=public.own_family_payroll_facts_ids_v2(body->'contractIds');
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion'] LOOP
  IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
 END LOOP;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_FORBIDDEN';END IF;
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-family-payroll-facts:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BUSY';END IF;
 SELECT setting::bigint INTO STRICT limit_ms FROM pg_catalog.pg_settings WHERE name='lock_timeout';
 IF limit_ms<=0 OR limit_ms>1000 THEN limit_ms:=1000;END IF;lock_deadline:=clock_timestamp()+limit_ms*interval '1 millisecond';
 BEGIN
  FOREACH locked_relation IN ARRAY ARRAY['native_employee_registration','employment_contract','person_identity','platform_tenant_source_binding','employment_adoption_application','employment_adoption_decision','employment_adoption_proposal','native_employment_lifecycle_review'] LOOP
   remaining_ms:=floor(EXTRACT(EPOCH FROM(lock_deadline-clock_timestamp()))*1000)::bigint;
   IF remaining_ms<=0 THEN RAISE lock_not_available;END IF;
   PERFORM set_config('lock_timeout',remaining_ms::text||'ms',true);EXECUTE format('LOCK TABLE public.%I IN SHARE MODE',locked_relation);
  END LOOP;
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN PERFORM set_config('lock_timeout',previous_timeout,true);RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BUSY';
 END;
 PERFORM set_config('lock_timeout',previous_timeout,true);
 fresh:=public.own_family_payroll_facts_context_v1(p);
 IF public.native_salary_scope_v1(fresh) IS DISTINCT FROM public.native_salary_scope_v1(ctx) OR fresh->'capabilities' IS DISTINCT FROM ctx->'capabilities'
 OR fresh->'scopes' IS DISTINCT FROM ctx->'scopes' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_SCOPE_CHANGED';END IF;ctx:=fresh;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false)
 OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_FORBIDDEN';END IF;
 PERFORM public.own_family_payroll_facts_session_live_v1(p);
 PERFORM public.own_family_payroll_facts_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_family_payroll_facts_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint OR prior.body<>body THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_IDEMPOTENCY_REUSE';END IF;
  RETURN public.own_family_payroll_facts_attempt_v2(p,key);
 END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.own_family_payroll_facts_scope_v2(ctx,period_value,ids) THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_SCOPE_CHANGED';END IF;
 configuration:=public.own_family_payroll_facts_current_v2(ctx,period_value,ids);
 SELECT coalesce(max(revision),0) INTO rev FROM public.own_family_payroll_facts_event WHERE tenant_id=(ctx->>'tenantId')::uuid
 AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period_month=(period_value||'-01')::date AND command='approve';
 IF cmd='propose' THEN
  IF body->'proposalId' IS DISTINCT FROM 'null'::jsonb OR body->'proposalSha256' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
  source_value:=public.own_family_payroll_facts_source_v2(ctx,period_value,ids);
  IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BASE_CHANGED';END IF;
  items_value:=public.own_family_payroll_facts_items_v1(body->'items',period_value,false);
  IF jsonb_array_length(items_value)<>jsonb_array_length(source_value->'subjects') OR EXISTS(
   SELECT 1 FROM jsonb_array_elements(items_value) WITH ORDINALITY i(value,ordinal)
   FULL JOIN jsonb_array_elements(source_value->'subjects') WITH ORDINALITY s(value,ordinal) USING(ordinal)
   WHERE i.value->>'contractId' IS DISTINCT FROM s.value->>'contractId' OR i.value->>'identityToken' IS DISTINCT FROM s.value->>'identityToken')
  THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_POPULATION_CHANGED';END IF;
  IF items_value=configuration->'items' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
  pid:=eid;baseline:=configuration->'items';captured_source:=source_value;
 ELSE
  IF body->'items' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;
  SELECT * INTO proposal FROM public.own_family_payroll_facts_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid
  AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period_month=(period_value||'-01')::date AND public.own_family_payroll_facts_event.body->>'version'='own-contract-family-payroll-facts.v2';
  IF NOT FOUND THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_family_payroll_facts_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_DECIDED';END IF;
  IF (public.own_family_payroll_facts_summary_v1(ctx,proposal)->>'canReview')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INDEPENDENT_REQUIRED';END IF;
  IF ids IS DISTINCT FROM proposal.body->'contractIds' OR body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion'
  OR body->>'sourceVersion' IS DISTINCT FROM proposal.body->>'sourceVersion' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_items;captured_source:=proposal.source_snapshot;
  IF cmd='approve' THEN
   source_value:=public.own_family_payroll_facts_source_v2(ctx,period_value,ids);
   IF body->>'baseVersion' IS DISTINCT FROM configuration->>'version' OR body->>'sourceVersion' IS DISTINCT FROM source_value->>'version' THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BASE_CHANGED';END IF;
   items_value:=public.own_family_payroll_facts_items_v1(proposal.body->'items',period_value,false);rev:=rev+1;
   SELECT jsonb_agg(value||jsonb_build_object('revision',rev,'approvalId',eid) ORDER BY value->>'contractId' COLLATE "C") INTO records FROM jsonb_array_elements(items_value);
   configuration:=jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-contract-family-payroll-facts.v2',ctx->>'tenantId',ctx->>'sourceBindingId',period_value,ids,records)),'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_family_payroll_facts_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period_month=(period_value||'-01')::date AND command='propose')>=1000 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-family-payroll-facts:capacity:v1',0)) THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_BUSY';END IF;
 added_bytes:=4*octet_length(body::text)+octet_length(baseline::text)+octet_length(captured_source::text);
 IF (SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_items::text)+octet_length(e.source_snapshot::text)+octet_length(e.receipt::text)),0) FROM public.own_family_payroll_facts_event e)+added_bytes>536870912
 OR (SELECT sum(pg_database_size(oid)) FROM pg_database)+added_bytes+2097152>1056964608
 THEN RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_LIMIT';END IF;
 -- A bounded wait or a large complete set must never keep an expired session
 -- alive through transaction-start now(). Check wall time before the insert.
 PERFORM public.own_family_payroll_facts_session_live_v1(p);
 receipt_value:=jsonb_build_object('version','own-contract-family-payroll-facts.v2','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,
 'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'configurationVersion',configuration->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.own_family_payroll_facts_event(id,tenant_id,source_binding_id,period_month,proposal_id,command,body,base_items,source_snapshot,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(period_value||'-01')::date,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,baseline,captured_source,rev,
 (ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $function$;

REVOKE ALL ON FUNCTION public.own_family_payroll_facts_ids_v2(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_records_v2(jsonb,text,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_source_v2(jsonb,text,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_scope_v2(jsonb,text,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_current_v2(jsonb,text,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_summary_v2(jsonb,public.own_family_payroll_facts_event) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_history_v2(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_family_payroll_facts_history_v2(jsonb,text) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_bootstrap_v2(jsonb,text,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_family_payroll_facts_bootstrap_v2(jsonb,text,jsonb) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_detail_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_family_payroll_facts_detail_v2(jsonb,uuid) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_attempt_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_family_payroll_facts_attempt_v2(jsonb,uuid) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_family_payroll_facts_command_v2(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_family_payroll_facts_command_v2(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
