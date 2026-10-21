-- Administrative audit identity for existing annual budget and position writers.
-- SOURCE CANDIDATE ONLY: no installation/admission/projection is provided here.
-- Seven existing function replacements; no new helper, grant, role, table or identity.
-- The original beneficiary lifecycle rules and independent approval remain.

CREATE OR REPLACE FUNCTION public.annual_budget_context_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;person_value uuid;actor_label text;linked uuid;proof jsonb;
BEGIN
 -- The existing guard accepts only its six session fields. Audit identity and
 -- the internal marker are derived here, never from p or a beneficiary target.
 ctx:=public.native_employee_context_v1(p);
 IF NOT public.action_center_context_has_capability(ctx,'workforce.structure.read') THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN';END IF;
 BEGIN
  SELECT i.id,i.full_name INTO STRICT person_value,actor_label
  FROM public.tenant_action_employment_link l
  JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.source_system='GRH' AND c.status IN('active','inactive') AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
  JOIN public.source_import_batch b ON b.id=c.source_batch_id AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL
  JOIN public.person_identity i ON i.id=c.person_id AND i.identity_state IN('active','provisional')
  WHERE l.active AND l.revoked_at IS NULL AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid
  FOR SHARE OF l,c,b,i NOWAIT;
 EXCEPTION WHEN NO_DATA_FOUND THEN NULL;WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN';END;
 IF person_value IS NULL THEN
  BEGIN
   SELECT c.id,i.id,i.full_name INTO STRICT linked,person_value,actor_label
   FROM public.tenant_action_employment_link l
   JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.source_system='MUNICONTROL' AND c.tenant_id=l.tenant_id AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   JOIN public.native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=l.tenant_id AND n.source_binding_id=l.source_binding_id AND n.id::text=c.source_payload#>>'{native,registrationId}'
   JOIN public.person_identity i ON i.id=c.person_id AND i.identity_state IN('active','provisional')
   WHERE l.active AND l.revoked_at IS NULL AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid
   FOR SHARE OF l,c,n,i NOWAIT;
  EXCEPTION WHEN NO_DATA_FOUND THEN NULL;WHEN TOO_MANY_ROWS THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN';END;
  IF person_value IS NOT NULL THEN
   proof:=public.native_employee_read_projection_v1(p,linked);
   IF proof#>>'{contract,personId}' IS DISTINCT FROM person_value::text OR proof#>>'{contract,status}' NOT IN('active','inactive') OR proof#>>'{contract,status}' IS NULL THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN';END IF;
  END IF;
 END IF;
 -- This is the verified audit person, not proof of current payroll employment.
 -- In particular an archived administrator keeps employmentContractId NULL.
 RETURN ctx||jsonb_build_object('actorPersonId',person_value,'structureActorVerified',person_value IS NOT NULL,'actorEmail',lower(btrim(p->>'actorEmail')),
 'actorLabel',left(coalesce(nullif(btrim(actor_label),''),'Responsable municipal'),160));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'ANNUAL_BUDGET_BUSY';END $$;

CREATE OR REPLACE FUNCTION public.annual_budget_proposal_v1(ctx jsonb,e public.annual_position_budget_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.annual_position_budget_event;independent boolean;BEGIN
 SELECT * INTO d FROM public.annual_position_budget_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'workforce.structure.approve') AND ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'structureActorVerified')::boolean,false) AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'body',e.body,'requestSha256',e.request_sha256,'createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;

CREATE OR REPLACE FUNCTION public.annual_budget_bootstrap_v1(p jsonb,y integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;rows jsonb;BEGIN ctx:=public.annual_budget_context_v1(p);PERFORM public.annual_budget_lock_v1(ctx,y);
 SELECT coalesce(jsonb_agg(public.annual_budget_proposal_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO rows FROM public.annual_position_budget_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.budget_year=y AND e.command='propose';
 RETURN jsonb_build_object('version','annual-position-budget.v1','year',y,'scopeVersion',public.annual_budget_scope_v1(ctx),'catalog',public.annual_budget_current_v1(ctx,y),'proposals',rows,'proposalCount',jsonb_array_length(rows),'complete',true,'permissions',jsonb_build_object('canPropose',ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'structureActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'workforce.structure.prepare'),'canReview',ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'structureActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'workforce.structure.approve')));
END $$;

CREATE OR REPLACE FUNCTION public.annual_budget_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;y integer;annual_state jsonb;proposal public.annual_position_budget_event;prior public.annual_position_budget_event;d jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;field text;
BEGIN ctx:=public.annual_budget_context_v1(p);cmd:=body->>'command';
 IF NOT public.own_program_exact_v1(body,ARRAY['command','year','scopeVersion','baseVersion','proposalId','proposalSha256','definition','reason','reviewConfirmed']) OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR jsonb_typeof(body->'year') IS DISTINCT FROM 'number' OR body->>'year'!~'^(19|20)[0-9]{2}$' OR NOT public.annual_budget_text_v1(body->'reason',10,1000) OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean' OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>4194304 THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['command','scopeVersion','baseVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;END LOOP;
 IF body->>'scopeVersion'!~'^[a-f0-9]{64}$' OR body->>'baseVersion'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'workforce.structure.prepare' ELSE 'workforce.structure.approve' END) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN';END IF;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'structureActorVerified')::boolean,false) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_EMPLOYMENT_REQUIRED';END IF;
 y:=(body->>'year')::integer;PERFORM public.annual_budget_lock_v1(ctx,y);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.annual_position_budget_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'ANNUAL_BUDGET_IDEMPOTENCY_REUSE';END IF;RETURN public.annual_budget_attempt_v1(p,key);END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.annual_budget_scope_v1(ctx) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_SCOPE_CHANGED';END IF;
 annual_state:=public.annual_budget_current_v1(ctx,y);rev:=(annual_state->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->'proposalId'<>'null' OR body->'proposalSha256'<>'null' OR body->'reviewConfirmed'<>'false' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
  IF body->>'baseVersion' IS DISTINCT FROM annual_state->>'version' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_BASE_CHANGED';END IF;
  d:=public.annual_budget_definition_v1(body->'definition');IF d IS DISTINCT FROM body->'definition' OR d=annual_state->'definition' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;pid:=eid;
 ELSE
  IF body->'definition'<>'null' OR body->'reviewConfirmed'<>'true' OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.annual_position_budget_event WHERE id=pid AND command='propose' AND budget_year=y AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'ANNUAL_BUDGET_NOT_FOUND';END IF;IF EXISTS(SELECT 1 FROM public.annual_position_budget_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_DECIDED';END IF;
  IF NOT(public.annual_budget_proposal_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INDEPENDENT_REQUIRED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_PROPOSAL_CHANGED';END IF;
  IF cmd='approve' THEN
   IF body->>'baseVersion' IS DISTINCT FROM annual_state->>'version' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_BASE_CHANGED';END IF;
   d:=public.annual_budget_definition_v1(proposal.body->'definition');rev:=rev+1;annual_state:=jsonb_build_object('version',encode(public.digest(jsonb_build_array('annual-position-budget.v1',ctx->>'tenantId',ctx->>'sourceBindingId',y,rev,eid,d)::text,'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.annual_position_budget_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND budget_year=y AND command='propose')>=1000 THEN RAISE EXCEPTION 'ANNUAL_BUDGET_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('annual-budget:capacity:v1',0)) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_BUSY';END IF;
 IF(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.receipt::text)),0) FROM public.annual_position_budget_event e)+4*octet_length(body::text)>268435456 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.receipt::text)),0) FROM public.annual_position_budget_event e WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND budget_year=y)+4*octet_length(body::text)>33554432 THEN RAISE EXCEPTION 'ANNUAL_BUDGET_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','annual-position-budget.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'catalogVersion',annual_state->>'version','replayed',false);
 INSERT INTO public.annual_position_budget_event(id,tenant_id,source_binding_id,budget_year,proposal_id,command,body,revision,actor_membership_id,actor_person_id,actor_email,actor_label,actor_session_id,actor_session_version,release_sha,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,y,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',ctx->>'actorLabel',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,fingerprint,receipt_value);RETURN receipt_value;
END $$;

CREATE OR REPLACE FUNCTION public.position_assignment_proposal_v1(ctx jsonb,e public.own_position_assignment_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_position_assignment_event;independent boolean;BEGIN
 SELECT * INTO d FROM public.own_position_assignment_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'workforce.structure.assignment.approve') AND ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'structureActorVerified')::boolean,false) AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'body',e.body,'requestSha256',e.request_sha256,'allocations',e.allocations,'createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;

CREATE OR REPLACE FUNCTION public.position_assignment_bootstrap_v1(p jsonb,target uuid,y integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;s jsonb;rows jsonb;BEGIN
 ctx:=public.annual_budget_context_v1(p);PERFORM public.own_run_lock_v1(ctx);PERFORM public.annual_budget_lock_v1(ctx,y);s:=public.native_employment_change_subject_v1(ctx,target);
 SELECT coalesce(jsonb_agg(public.position_assignment_proposal_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO rows FROM public.own_position_assignment_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.contract_id=target AND e.budget_year=y AND e.command='propose';
 RETURN jsonb_build_object('version','position-assignment.v1','contractId',target,'year',y,'subject',s,'scopeVersion',public.position_assignment_scope_v1(ctx,s),'state',public.position_assignment_state_v1(ctx,target,y),'annual',public.annual_budget_bootstrap_v1(p,y),'proposals',rows,'proposalCount',jsonb_array_length(rows),'complete',true,'permissions',jsonb_build_object('canPropose',ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'structureActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'workforce.structure.assignment.prepare'),'canReview',ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'structureActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'workforce.structure.assignment.approve')));
END $$;

CREATE OR REPLACE FUNCTION public.position_assignment_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;y integer;target uuid;s jsonb;state_value jsonb;annual_value jsonb;proposal public.own_position_assignment_event;prior public.own_position_assignment_event;a jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;field text;BEGIN
 ctx:=public.annual_budget_context_v1(p);cmd:=body->>'command';
 IF coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_exact_v1(body,ARRAY['command','contractId','year','scopeVersion','baseVersion','annualVersion','reason','reviewConfirmed']||CASE WHEN cmd='propose' THEN ARRAY['allocations'] ELSE ARRAY['proposalId','proposalSha256'] END) OR jsonb_typeof(body->'contractId') IS DISTINCT FROM 'string' OR body->>'contractId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'year') IS DISTINCT FROM 'number' OR body->>'year'!~'^(19|20)[0-9]{2}$' OR NOT public.annual_budget_text_v1(body->'reason',10,1000) OR body->'reviewConfirmed' IS DISTINCT FROM to_jsonb(cmd<>'propose') OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>4194304 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','annualVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;END LOOP;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'workforce.structure.assignment.prepare' ELSE 'workforce.structure.assignment.approve' END) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_FORBIDDEN';END IF;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'structureActorVerified')::boolean,false) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_EMPLOYMENT_REQUIRED';END IF;
 y:=(body->>'year')::integer;target:=(body->>'contractId')::uuid;
 PERFORM public.own_run_lock_v1(ctx);PERFORM public.annual_budget_lock_v1(ctx,y);fingerprint:=public.own_run_hash_v1(body);
 SELECT * INTO prior FROM public.own_position_assignment_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_IDEMPOTENCY_REUSE';END IF;RETURN public.position_assignment_attempt_v1(p,key);END IF;
 LOCK TABLE public.person_identity,public.employment_contract,public.native_employee_registration,public.native_employment_change_review,public.native_employment_lifecycle_review IN SHARE MODE NOWAIT;
 s:=public.native_employment_change_subject_v1(ctx,target);
 IF body->>'scopeVersion' IS DISTINCT FROM public.position_assignment_scope_v1(ctx,s) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_SCOPE_CHANGED';END IF;
 state_value:=public.position_assignment_state_v1(ctx,target,y);annual_value:=public.annual_budget_current_v1(ctx,y);rev:=(state_value->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->>'baseVersion' IS DISTINCT FROM state_value->>'version' OR body->>'annualVersion' IS DISTINCT FROM annual_value->>'version' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_BASE_CHANGED';END IF;
  a:=public.position_assignment_resolve_v1(ctx,target,y,body->'allocations');IF a=state_value->'allocations' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;pid:=eid;
 ELSE
  IF jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.own_position_assignment_event WHERE id=pid AND command='propose' AND contract_id=target AND budget_year=y AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_NOT_FOUND';END IF;
  IF EXISTS(SELECT 1 FROM public.own_position_assignment_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_DECIDED';END IF;
  IF NOT(public.position_assignment_proposal_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INDEPENDENT_REQUIRED';END IF;
  IF body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'annualVersion' IS DISTINCT FROM proposal.body->>'annualVersion' OR body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_PROPOSAL_CHANGED';END IF;
  a:=proposal.allocations;
  IF cmd='approve' THEN
   IF body->>'baseVersion' IS DISTINCT FROM state_value->>'version' OR body->>'annualVersion' IS DISTINCT FROM annual_value->>'version' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_BASE_CHANGED';END IF;
   IF proposal.identity_token IS DISTINCT FROM s->>'identityToken' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_IDENTITY_CHANGED';END IF;
   IF a IS DISTINCT FROM public.position_assignment_resolve_v1(ctx,target,y,proposal.body->'allocations') THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_NORMATIVE_CHANGED';END IF;rev:=rev+1;
  END IF;
 END IF;
 IF rev>1000 OR cmd='propose' AND(SELECT count(*) FROM public.own_position_assignment_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND budget_year=y AND command='propose')>=1000 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('position-assignment:capacity:v1',0)) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_BUSY';END IF;
 IF(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.allocations::text)+octet_length(e.receipt::text)),0) FROM public.own_position_assignment_event e)+4*(octet_length(body::text)+octet_length(a::text))>268435456 OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.allocations::text)+octet_length(e.receipt::text)),0) FROM public.own_position_assignment_event e WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND budget_year=y)+4*(octet_length(body::text)+octet_length(a::text))>33554432 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','position-assignment-receipt.v1','id',eid,'key',key,'command',cmd,'contractId',target,'year',y,'bodySha256',fingerprint,'proposalId',pid,'revision',rev,'replayed',false);
 INSERT INTO public.own_position_assignment_event(id,tenant_id,source_binding_id,contract_id,budget_year,identity_token,proposal_id,command,body,allocations,revision,actor_membership_id,actor_person_id,actor_email,actor_label,actor_session_id,actor_session_version,release_sha,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,target,y,s->>'identityToken',CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,a,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',ctx->>'actorLabel',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,fingerprint,receipt_value);RETURN receipt_value;
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_BUSY';
END $$;
