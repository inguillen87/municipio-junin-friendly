-- Bounded command wait; existing identity, scope, source, body and key remain authoritative.
-- No POST retry, new tables, permissions, formulas or municipal actions.
CREATE OR REPLACE FUNCTION public.own_participation_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;target uuid;period_value text;configuration jsonb;source_value jsonb;proposal public.own_participation_event;prior public.own_participation_event;definition jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_source jsonb;field text;added_bytes bigint;
BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);cmd:=body->>'command';
 IF NOT public.own_program_exact_v1(body,ARRAY['command','contractId','period','scopeVersion','baseVersion','sourceVersion','proposalId','proposalSha256','definition','reason','reviewConfirmed']) OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_text_v1(body->'reason',10,1000) OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>32768 OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean' OR jsonb_typeof(body->'contractId') IS DISTINCT FROM 'string' OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
 target:=(body->>'contractId')::uuid;period_value:=body->>'period';
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;END LOOP;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) OR ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) THEN RAISE EXCEPTION 'PARTICIPATION_FORBIDDEN';END IF;
 -- Acquire the same SHARE locks once, with a bounded wait for brief contention.
 -- The original advisory and NOWAIT guard remains unchanged and runs below.
 DECLARE previous_timeout text:=current_setting('lock_timeout');limit_ms bigint;fresh jsonb;
 BEGIN
  PERFORM public.native_salary_lock_v1(ctx);
  IF NOT pg_try_advisory_xact_lock(hashtextextended('own-participation:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'PARTICIPATION_BUSY';END IF;
  SELECT setting::bigint INTO STRICT limit_ms FROM pg_catalog.pg_settings WHERE name='lock_timeout';
  IF limit_ms<=0 OR limit_ms>1000 THEN limit_ms:=1000;END IF;
  PERFORM set_config('lock_timeout',limit_ms::text||'ms',true);
  BEGIN
   LOCK TABLE public.native_employee_registration,public.employment_contract,public.person_identity IN SHARE MODE;
  EXCEPTION WHEN lock_not_available THEN
   PERFORM set_config('lock_timeout',previous_timeout,true);RAISE EXCEPTION 'PARTICIPATION_BUSY';
  END;
  PERFORM set_config('lock_timeout',previous_timeout,true);
  fresh:=public.native_salary_administrative_context_v1(p);
  IF public.native_salary_scope_v1(fresh) IS DISTINCT FROM public.native_salary_scope_v1(ctx)
   OR fresh->'capabilities' IS DISTINCT FROM ctx->'capabilities'
   OR fresh->'scopes' IS DISTINCT FROM ctx->'scopes' THEN RAISE EXCEPTION 'PARTICIPATION_SCOPE_CHANGED';END IF;
  ctx:=fresh;
  IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END)
   OR ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) THEN RAISE EXCEPTION 'PARTICIPATION_FORBIDDEN';END IF;
  -- now() is fixed at transaction start. Validate wall-clock expiry after waiting.
  IF NOT EXISTS(SELECT 1 FROM public.tenant_identity_session s WHERE s.id=(p->>'actorSessionId')::uuid
   AND s.session_version=(p->>'actorSessionVersion')::integer AND s.status='active'
   AND s.expires_at>clock_timestamp() AND s.last_seen_at>clock_timestamp()-interval '1 hour') THEN RAISE EXCEPTION 'ACTION_SESSION_INVALID';END IF;
 END;
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
