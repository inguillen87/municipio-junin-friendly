-- Own contract assignments and a companion capture in the ORIGINAL own-run transaction.
-- No historical GRH extraction, payroll formula, backfill, role grant or business operation.
DO $$ BEGIN
 IF to_regclass('public.own_position_assignment_event') IS NOT NULL OR to_regclass('public.own_payroll_run_position_capture') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'position_assignment_%') THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_ALREADY_INSTALLED';END IF;
 IF to_regprocedure('public.annual_budget_context_v1(jsonb)') IS NULL OR to_regprocedure('public.own_run_lock_v1(jsonb)') IS NULL OR to_regprocedure('public.native_employment_change_subject_v1(jsonb,uuid)') IS NULL OR to_regclass('public.own_payroll_run_capture') IS NULL THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_PREREQUISITE';END IF;
 IF EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key IN('workforce.structure.assignment.prepare','workforce.structure.assignment.approve')) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_CAPABILITY_CONFLICT';END IF;
END $$;
INSERT INTO public.iam_capability(capability_key,label,description,scope_kind,sensitivity) VALUES
 ('workforce.structure.assignment.prepare','Preparar asignación presupuestaria','Proponer cargos por contrato propio, ejercicio, norma y fechas declaradas. No liquida.','tenant','privileged'),
 ('workforce.structure.assignment.approve','Revisar asignación presupuestaria','Decidir la asignación presentada por otra persona, conservando todas sus versiones.','tenant','privileged');
CREATE TABLE public.own_position_assignment_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id),budget_year integer NOT NULL CHECK(budget_year BETWEEN 1900 AND 2099),identity_token text NOT NULL CHECK(identity_token~'^[a-f0-9]{64}$'),
 proposal_id uuid REFERENCES public.own_position_assignment_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=4194304),allocations jsonb NOT NULL CHECK(jsonb_typeof(allocations)='array' AND jsonb_array_length(allocations)<=50 AND octet_length(allocations::text)<=4194304),revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),
 actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_label text NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((command='propose')=(proposal_id IS NULL)),UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_position_assignment_approval_revision ON public.own_position_assignment_event(tenant_id,source_binding_id,contract_id,budget_year,revision) WHERE command='approve';
CREATE TABLE public.own_payroll_run_position_capture(
 capture_id uuid PRIMARY KEY REFERENCES public.own_payroll_run_capture(id),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 capture_payload_sha256 text NOT NULL CHECK(capture_payload_sha256~'^[a-f0-9]{64}$'),payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=16777216),payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id)
);
ALTER TABLE public.own_position_assignment_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.own_payroll_run_position_capture ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_position_assignment_event,public.own_payroll_run_position_capture FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.position_assignment_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'POSITION_ASSIGNMENT_IMMUTABLE';END $$;
CREATE TRIGGER position_assignment_immutable BEFORE UPDATE OR DELETE ON public.own_position_assignment_event FOR EACH ROW EXECUTE FUNCTION public.position_assignment_immutable_v1();
CREATE TRIGGER position_assignment_no_truncate BEFORE TRUNCATE ON public.own_position_assignment_event FOR EACH STATEMENT EXECUTE FUNCTION public.position_assignment_immutable_v1();
CREATE TRIGGER position_capture_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_run_position_capture FOR EACH ROW EXECUTE FUNCTION public.position_assignment_immutable_v1();
CREATE TRIGGER position_capture_no_truncate BEFORE TRUNCATE ON public.own_payroll_run_position_capture FOR EACH STATEMENT EXECUTE FUNCTION public.position_assignment_immutable_v1();
CREATE FUNCTION public.position_assignment_date_v1(v jsonb,y integer) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN RETURN false;END IF;
 RETURN to_char((v#>>'{}')::date,'YYYY-MM-DD')=v#>>'{}' AND extract(year FROM(v#>>'{}')::date)=y;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN false;END $$;
CREATE FUNCTION public.position_assignment_scope_v1(ctx jsonb,s jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT public.own_run_hash_v1(jsonb_build_array('position-assignment-scope.v1',public.annual_budget_scope_v1(ctx),s->>'contractId',s->>'registrationId',s->>'identityToken'))
$$;
CREATE FUNCTION public.position_assignment_state_v1(ctx jsonb,target uuid,y integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.own_position_assignment_event;p public.own_position_assignment_event;a jsonb:='[]';rev integer;BEGIN
 SELECT * INTO e FROM public.own_position_assignment_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND budget_year=y AND command='approve' ORDER BY revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO p FROM public.own_position_assignment_event WHERE id=e.proposal_id;a:=p.allocations;END IF;
 RETURN jsonb_build_object('version',public.own_run_hash_v1(jsonb_build_array('position-assignment-state.v1',ctx->>'tenantId',ctx->>'sourceBindingId',target,y,rev,e.id,p.identity_token,a)),'revision',rev,'proposalId',p.id,'approvalId',e.id,'allocations',a);
END $$;
CREATE FUNCTION public.position_assignment_resolve_v1(ctx jsonb,target uuid,y integer,items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a jsonb;n public.annual_position_budget_event;p public.annual_position_budget_event;r jsonb;result jsonb:='[]';first_date date;last_date date;sorted jsonb;BEGIN
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;
 IF jsonb_array_length(items)>50 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_LIMIT';END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(items) LOOP
  IF NOT public.own_program_exact_v1(a,ARRAY['id','budgetRevision','definitionSha256','rowCode','validFrom','validTo','quantity','source']) OR jsonb_typeof(a->'id') IS DISTINCT FROM 'string' OR a->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(a->'budgetRevision') IS DISTINCT FROM 'number' OR a->>'budgetRevision'!~'^[1-9][0-9]{0,3}$' OR(a->>'budgetRevision')::integer>1000 OR jsonb_typeof(a->'definitionSha256') IS DISTINCT FROM 'string' OR a->>'definitionSha256'!~'^[a-f0-9]{64}$' OR jsonb_typeof(a->'rowCode') IS DISTINCT FROM 'string' OR a->>'rowCode'!~'^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' OR NOT public.position_assignment_date_v1(a->'validFrom',y) OR NOT public.position_assignment_date_v1(a->'validTo',y) OR a->>'validFrom'>a->>'validTo' OR jsonb_typeof(a->'quantity') IS DISTINCT FROM 'string' OR a->>'quantity'!~'^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;
  IF NOT public.own_program_exact_v1(a->'source',ARRAY['instrument','documentSha256','reference']) OR NOT public.annual_budget_text_v1(a#>'{source,instrument}',3,180) OR NOT public.annual_budget_text_v1(a#>'{source,reference}',3,180) OR jsonb_typeof(a#>'{source,documentSha256}') IS DISTINCT FROM 'string' OR a#>>'{source,documentSha256}'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;
  SELECT * INTO n FROM public.annual_position_budget_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND budget_year=y AND command='approve' AND revision=(a->>'budgetRevision')::integer;
  IF NOT FOUND THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_NORMATIVE_CHANGED';END IF;
  SELECT * INTO p FROM public.annual_position_budget_event WHERE id=n.proposal_id;
  IF public.own_run_hash_v1(p.body->'definition') IS DISTINCT FROM a->>'definitionSha256' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_NORMATIVE_CHANGED';END IF;
  SELECT value INTO r FROM jsonb_array_elements(p.body#>'{definition,rows}') WHERE value->>'code'=a->>'rowCode';
  IF r IS NULL OR r->>'unit'<>'teaching_hour' AND position('.' IN a->>'quantity')>0 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;
  first_date:=(a->>'validFrom')::date;last_date:=(a->>'validTo')::date;
  IF NOT public.native_employment_lifecycle_range_v1(ctx,target,first_date,last_date,true) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_DATES_OUTSIDE_EMPLOYMENT';END IF;
  result:=result||jsonb_build_array(a||jsonb_build_object('normative',jsonb_build_object('approvalId',n.id,'proposalId',p.id,'row',r,'source',p.body#>'{definition,source}')));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(items) GROUP BY value->>'id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) a CROSS JOIN jsonb_array_elements(items) b WHERE a.value->>'id'<b.value->>'id' AND a.value->>'rowCode'=b.value->>'rowCode' AND a.value->>'validFrom'<=b.value->>'validTo' AND b.value->>'validFrom'<=a.value->>'validTo') THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY(value->>'validFrom') COLLATE "C",(value->>'id') COLLATE "C"),'[]') INTO sorted FROM jsonb_array_elements(items);
 IF sorted IS DISTINCT FROM items THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;
 RETURN(SELECT coalesce(jsonb_agg(value ORDER BY(value->>'validFrom') COLLATE "C",(value->>'id') COLLATE "C"),'[]') FROM jsonb_array_elements(result));
END $$;
CREATE FUNCTION public.position_assignment_proposal_v1(ctx jsonb,e public.own_position_assignment_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_position_assignment_event;independent boolean;BEGIN
 SELECT * INTO d FROM public.own_position_assignment_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'workforce.structure.assignment.approve') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'body',e.body,'requestSha256',e.request_sha256,'allocations',e.allocations,'createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;
CREATE FUNCTION public.position_assignment_bootstrap_v1(p jsonb,target uuid,y integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;s jsonb;rows jsonb;BEGIN
 ctx:=public.annual_budget_context_v1(p);PERFORM public.own_run_lock_v1(ctx);PERFORM public.annual_budget_lock_v1(ctx,y);s:=public.native_employment_change_subject_v1(ctx,target);
 SELECT coalesce(jsonb_agg(public.position_assignment_proposal_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO rows FROM public.own_position_assignment_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.contract_id=target AND e.budget_year=y AND e.command='propose';
 RETURN jsonb_build_object('version','position-assignment.v1','contractId',target,'year',y,'subject',s,'scopeVersion',public.position_assignment_scope_v1(ctx,s),'state',public.position_assignment_state_v1(ctx,target,y),'annual',public.annual_budget_bootstrap_v1(p,y),'proposals',rows,'proposalCount',jsonb_array_length(rows),'complete',true,'permissions',jsonb_build_object('canPropose',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'workforce.structure.assignment.prepare'),'canReview',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'workforce.structure.assignment.approve')));
END $$;
CREATE FUNCTION public.position_assignment_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_position_assignment_event;BEGIN ctx:=public.annual_budget_context_v1(p);
 SELECT * INTO e FROM public.own_position_assignment_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'workforce.structure.assignment.prepare' ELSE 'workforce.structure.assignment.approve' END) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_FORBIDDEN';END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.position_assignment_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;y integer;target uuid;s jsonb;state_value jsonb;annual_value jsonb;proposal public.own_position_assignment_event;prior public.own_position_assignment_event;a jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;field text;BEGIN
 ctx:=public.annual_budget_context_v1(p);cmd:=body->>'command';
 IF coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_exact_v1(body,ARRAY['command','contractId','year','scopeVersion','baseVersion','annualVersion','reason','reviewConfirmed']||CASE WHEN cmd='propose' THEN ARRAY['allocations'] ELSE ARRAY['proposalId','proposalSha256'] END) OR jsonb_typeof(body->'contractId') IS DISTINCT FROM 'string' OR body->>'contractId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'year') IS DISTINCT FROM 'number' OR body->>'year'!~'^(19|20)[0-9]{2}$' OR NOT public.annual_budget_text_v1(body->'reason',10,1000) OR body->'reviewConfirmed' IS DISTINCT FROM to_jsonb(cmd<>'propose') OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>4194304 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','annualVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_INPUT_INVALID';END IF;END LOOP;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'workforce.structure.assignment.prepare' ELSE 'workforce.structure.assignment.approve' END) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_FORBIDDEN';END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_EMPLOYMENT_REQUIRED';END IF;
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
CREATE FUNCTION public.position_assignment_capture_trigger_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;person jsonb;s jsonb;proposal public.own_position_assignment_event;items jsonb;employees jsonb:='[]';payload_value jsonb;first_date date;last_date date;y integer;status_value text;BEGIN
 ctx:=jsonb_build_object('tenantId',NEW.tenant_id,'sourceBindingId',NEW.source_binding_id);PERFORM public.own_run_lock_v1(ctx);
 first_date:=(NEW.payload->>'period'||'-01')::date;last_date:=(first_date+interval '1 month - 1 day')::date;y:=extract(year FROM first_date)::integer;
 FOR person IN SELECT value FROM jsonb_array_elements(NEW.payload#>'{population,employees}') LOOP
  s:=public.position_assignment_state_v1(ctx,(person->>'contractId')::uuid,y);items:='[]';status_value:='unassigned';
  IF(s->>'revision')::integer>0 THEN
   SELECT * INTO proposal FROM public.own_position_assignment_event WHERE id=(s->>'proposalId')::uuid;
   IF proposal.identity_token IS DISTINCT FROM person->>'identityToken' THEN status_value:='identity_changed';
   ELSE
    SELECT coalesce(jsonb_agg(a.value||jsonb_build_object('coverage',CASE WHEN(a.value->>'validFrom')::date<=first_date AND(a.value->>'validTo')::date>=last_date THEN 'full' ELSE 'partial' END) ORDER BY(a.value->>'validFrom') COLLATE "C",(a.value->>'id') COLLATE "C"),'[]') INTO items FROM jsonb_array_elements(s->'allocations') a WHERE(a.value->>'validFrom')::date<=last_date AND(a.value->>'validTo')::date>=first_date;
    IF jsonb_array_length(items)>0 THEN status_value:='assigned';END IF;
   END IF;
  END IF;
  employees:=employees||jsonb_build_array(jsonb_build_object('contractId',person->>'contractId','employeeNumber',person->>'employeeNumber','identityToken',person->>'identityToken','status',status_value,'assignmentRevision',(s->>'revision')::integer,'assignmentVersion',s->>'version','allocations',items));
 END LOOP;
 IF jsonb_array_length(employees)<>jsonb_array_length(NEW.payload#>'{population,employees}') OR jsonb_array_length(employees) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_CAPTURE_INVALID';END IF;
 payload_value:=jsonb_build_object('version','own-position-population.v1','populationVersion',NEW.payload#>>'{population,version}','complete',true,'employeeCount',jsonb_array_length(employees),'employees',employees);
 IF octet_length(payload_value::text)>16777216 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('position-assignment:capacity:v1',0)) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_BUSY';END IF;
 IF(SELECT coalesce(sum(octet_length(payload::text)),0) FROM public.own_payroll_run_position_capture)+octet_length(payload_value::text)>536870912 THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_LIMIT';END IF;
 INSERT INTO public.own_payroll_run_position_capture(capture_id,tenant_id,source_binding_id,capture_payload_sha256,payload,payload_sha256) VALUES(NEW.id,NEW.tenant_id,NEW.source_binding_id,NEW.payload_sha256,payload_value,public.own_run_hash_v1(payload_value));RETURN NEW;
END $$;
CREATE TRIGGER own_run_position_capture AFTER INSERT ON public.own_payroll_run_capture FOR EACH ROW EXECUTE FUNCTION public.position_assignment_capture_trigger_v1();
CREATE FUNCTION public.position_assignment_capture_v1(p jsonb,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;c public.own_payroll_run_capture;s public.own_payroll_run_position_capture;BEGIN
 ctx:=public.annual_budget_context_v1(p);IF NOT public.action_center_context_has_capability(ctx,'payroll.calculation.read') THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_FORBIDDEN';END IF;
 SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_NOT_FOUND';END IF;
 SELECT * INTO s FROM public.own_payroll_run_position_capture WHERE capture_id=c.id;
 IF s.capture_id IS NOT NULL AND(s.tenant_id<>c.tenant_id OR s.source_binding_id<>c.source_binding_id OR s.capture_payload_sha256<>c.payload_sha256 OR public.own_run_hash_v1(s.payload)<>s.payload_sha256 OR s.payload#>>'{populationVersion}' IS DISTINCT FROM c.payload#>>'{population,version}' OR s.payload->>'complete'<>'true' OR jsonb_array_length(s.payload->'employees')<>jsonb_array_length(c.payload#>'{population,employees}') OR(s.payload->>'employeeCount')::integer<>jsonb_array_length(s.payload->'employees') OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{population,employees}') e WHERE(SELECT count(*) FROM jsonb_array_elements(s.payload->'employees') a WHERE a->>'contractId'=e->>'contractId' AND a->>'employeeNumber'=e->>'employeeNumber' AND a->>'identityToken'=e->>'identityToken')<>1)) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_CAPTURE_INVALID';END IF;
 RETURN jsonb_build_object('version','own-run-position-capture.v1','captureId',c.id,'status',CASE WHEN s.capture_id IS NULL THEN 'not_captured' ELSE 'captured' END,'capturePayloadSha256',c.payload_sha256,'period',c.payload->>'period','liquidationType',c.payload->>'liquidationType','payload',s.payload,'payloadSha256',s.payload_sha256);
END $$;
REVOKE ALL ON FUNCTION public.position_assignment_immutable_v1(),public.position_assignment_date_v1(jsonb,integer),public.position_assignment_scope_v1(jsonb,jsonb),public.position_assignment_state_v1(jsonb,uuid,integer),public.position_assignment_resolve_v1(jsonb,uuid,integer,jsonb),public.position_assignment_proposal_v1(jsonb,public.own_position_assignment_event),public.position_assignment_bootstrap_v1(jsonb,uuid,integer),public.position_assignment_attempt_v1(jsonb,uuid),public.position_assignment_command_v1(jsonb,jsonb,uuid),public.position_assignment_capture_trigger_v1(),public.position_assignment_capture_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.position_assignment_bootstrap_v1(jsonb,uuid,integer),public.position_assignment_attempt_v1(jsonb,uuid),public.position_assignment_command_v1(jsonb,jsonb,uuid),public.position_assignment_capture_v1(jsonb,uuid) TO municontrol_actions_runtime_app;
