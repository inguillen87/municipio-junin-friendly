-- Own annual normative positions. No historical extraction, assignments,
-- salary calculation, IAM role grant, signature or payment operation.
DO $$ BEGIN
 IF to_regclass('public.annual_position_budget_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'annual_budget_%') THEN RAISE EXCEPTION 'ANNUAL_BUDGET_ALREADY_INSTALLED';END IF;
 IF to_regprocedure('public.native_employment_change_context_v1(jsonb,text)') IS NULL OR to_regprocedure('public.native_salary_serialized_v1(jsonb)') IS NULL OR to_regprocedure('public.own_program_exact_v1(jsonb,text[])') IS NULL THEN RAISE EXCEPTION 'ANNUAL_BUDGET_PREREQUISITE';END IF;
 IF EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key IN('workforce.structure.prepare','workforce.structure.approve')) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_CAPABILITY_CONFLICT';END IF;
END $$;
INSERT INTO public.iam_capability(capability_key,label,description,scope_kind,sensitivity) VALUES
 ('workforce.structure.prepare','Preparar planta presupuestaria anual','Proponer cantidades y unidades con fuente normativa para un ejercicio. No asigna cargos ni liquida.','tenant','privileged'),
 ('workforce.structure.approve','Revisar planta presupuestaria anual','Aprobar o rechazar el conjunto anual presentado por otra persona, conservando sus versiones.','tenant','privileged');
CREATE TABLE public.annual_position_budget_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 budget_year integer NOT NULL CHECK(budget_year BETWEEN 1900 AND 2099),proposal_id uuid REFERENCES public.annual_position_budget_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=4194304),revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),
 actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_label text NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),receipt jsonb NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((command='propose')=(proposal_id IS NULL)),UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX annual_position_budget_approval_revision ON public.annual_position_budget_event(tenant_id,source_binding_id,budget_year,revision) WHERE command='approve';
ALTER TABLE public.annual_position_budget_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.annual_position_budget_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.annual_budget_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'ANNUAL_BUDGET_IMMUTABLE';END $$;
CREATE TRIGGER annual_budget_immutable BEFORE UPDATE OR DELETE ON public.annual_position_budget_event FOR EACH ROW EXECUTE FUNCTION public.annual_budget_immutable_v1();
CREATE TRIGGER annual_budget_no_truncate BEFORE TRUNCATE ON public.annual_position_budget_event FOR EACH STATEMENT EXECUTE FUNCTION public.annual_budget_immutable_v1();
CREATE FUNCTION public.annual_budget_text_v1(v jsonb,lo integer,hi integer) RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_typeof(v)='string' AND length(v#>>'{}') BETWEEN lo AND hi AND v#>>'{}'=btrim(v#>>'{}') AND v#>>'{}'=normalize(v#>>'{}',NFC) AND v#>>'{}'!~'[<>[:cntrl:]]' AND v#>>'{}'!~U&'[\007F-\009F\202A-\202E\2066-\2069]',false)
$$;
CREATE FUNCTION public.annual_budget_definition_v1(d jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;k text;s jsonb:=d->'source';
BEGIN
 IF NOT public.own_program_exact_v1(d,ARRAY['source','rows']) OR NOT public.own_program_exact_v1(s,ARRAY['instrument','documentSha256','coverage','reference']) OR NOT public.annual_budget_text_v1(s->'instrument',3,180) OR NOT public.annual_budget_text_v1(s->'reference',3,180) OR jsonb_typeof(s->'documentSha256') IS DISTINCT FROM 'string' OR s->>'documentSha256'!~'^[a-f0-9]{64}$' OR coalesce(s->>'coverage' IN('article_summary','annex_detail'),false) IS NOT TRUE OR jsonb_typeof(d->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
 IF jsonb_array_length(d->'rows') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'ANNUAL_BUDGET_LIMIT';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(d->'rows') LOOP
  IF NOT public.own_program_exact_v1(r,ARRAY['code','jurisdiction','regime','group','section','subsection','position','label','unit','quantity','reference']) OR NOT public.annual_budget_text_v1(r->'label',1,180) OR NOT public.annual_budget_text_v1(r->'reference',3,180) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
  FOREACH k IN ARRAY ARRAY['code','jurisdiction','regime','group','section','subsection','position'] LOOP
   IF k NOT IN('code','jurisdiction') AND r->k='null' THEN CONTINUE;END IF;
   IF jsonb_typeof(r->k) IS DISTINCT FROM 'string' OR r->>k!~'^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
  END LOOP;
  IF jsonb_typeof(r->'unit') IS DISTINCT FROM 'string' OR coalesce(r->>'unit' IN('position','teaching_hour','contracted_staff'),false) IS NOT TRUE OR jsonb_typeof(r->'quantity') IS DISTINCT FROM 'string' OR r->>'quantity'!~'^(0|[1-9][0-9]{0,17})(\.[0-9]{1,18})?$' OR r->>'unit'<>'teaching_hour' AND position('.' IN r->>'quantity')>0 THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'rows') item(value) GROUP BY item.value->>'code' HAVING count(*)>1) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
 RETURN jsonb_build_object('source',s,'rows',(SELECT jsonb_agg(item.value ORDER BY(item.value->>'code') COLLATE "C") FROM jsonb_array_elements(d->'rows') item(value)));
END $$;
CREATE FUNCTION public.annual_budget_context_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;BEGIN ctx:=public.native_employment_change_context_v1(p);IF NOT public.action_center_context_has_capability(ctx,'workforce.structure.read') THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN';END IF;RETURN ctx;END $$;
CREATE FUNCTION public.annual_budget_scope_v1(ctx jsonb) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(jsonb_build_array('annual-budget-scope.v1',ctx->>'tenantId',ctx->>'sourceBindingId',ctx->>'membershipId',ctx->>'actorPersonId',ctx->>'actorEmail')::text,'sha256'),'hex')
$$;
CREATE FUNCTION public.annual_budget_lock_v1(ctx jsonb,y integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF y IS NULL OR y NOT BETWEEN 1900 AND 2099 THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('annual-budget:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId')||':'||y,0)) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_BUSY';END IF;
END $$;
CREATE FUNCTION public.annual_budget_current_v1(ctx jsonb,y integer) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.annual_position_budget_event;p public.annual_position_budget_event;d jsonb;rev integer;BEGIN
 SELECT * INTO e FROM public.annual_position_budget_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND budget_year=y AND command='approve' ORDER BY revision DESC LIMIT 1;
 rev:=coalesce(e.revision,0);IF e.id IS NOT NULL THEN SELECT * INTO p FROM public.annual_position_budget_event WHERE id=e.proposal_id;d:=p.body->'definition';END IF;
 RETURN jsonb_build_object('version',encode(public.digest(jsonb_build_array('annual-position-budget.v1',ctx->>'tenantId',ctx->>'sourceBindingId',y,rev,e.id,d)::text,'sha256'),'hex'),'revision',rev,'definition',d,'definitionSha256',CASE WHEN d IS NULL THEN NULL ELSE encode(public.digest(public.native_salary_serialized_v1(d),'sha256'),'hex') END,'proposalId',p.id,'approvalId',e.id);
END $$;
CREATE FUNCTION public.annual_budget_proposal_v1(ctx jsonb,e public.annual_position_budget_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.annual_position_budget_event;independent boolean;BEGIN
 SELECT * INTO d FROM public.annual_position_budget_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'workforce.structure.approve') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'body',e.body,'requestSha256',e.request_sha256,'createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('id',d.id,'command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;
CREATE FUNCTION public.annual_budget_bootstrap_v1(p jsonb,y integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;rows jsonb;BEGIN ctx:=public.annual_budget_context_v1(p);PERFORM public.annual_budget_lock_v1(ctx,y);
 SELECT coalesce(jsonb_agg(public.annual_budget_proposal_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO rows FROM public.annual_position_budget_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.budget_year=y AND e.command='propose';
 RETURN jsonb_build_object('version','annual-position-budget.v1','year',y,'scopeVersion',public.annual_budget_scope_v1(ctx),'catalog',public.annual_budget_current_v1(ctx,y),'proposals',rows,'proposalCount',jsonb_array_length(rows),'complete',true,'permissions',jsonb_build_object('canPropose',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'workforce.structure.prepare'),'canReview',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'workforce.structure.approve')));
END $$;
CREATE FUNCTION public.annual_budget_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.annual_position_budget_event;BEGIN ctx:=public.annual_budget_context_v1(p);
 SELECT * INTO e FROM public.annual_position_budget_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'ANNUAL_BUDGET_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'workforce.structure.prepare' ELSE 'workforce.structure.approve' END) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN';END IF;
 RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION public.annual_budget_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;cmd text;y integer;annual_state jsonb;proposal public.annual_position_budget_event;prior public.annual_position_budget_event;d jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;field text;
BEGIN ctx:=public.annual_budget_context_v1(p);cmd:=body->>'command';
 IF NOT public.own_program_exact_v1(body,ARRAY['command','year','scopeVersion','baseVersion','proposalId','proposalSha256','definition','reason','reviewConfirmed']) OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR jsonb_typeof(body->'year') IS DISTINCT FROM 'number' OR body->>'year'!~'^(19|20)[0-9]{2}$' OR NOT public.annual_budget_text_v1(body->'reason',10,1000) OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean' OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>4194304 THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['command','scopeVersion','baseVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;END LOOP;
 IF body->>'scopeVersion'!~'^[a-f0-9]{64}$' OR body->>'baseVersion'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'ANNUAL_BUDGET_INPUT_INVALID';END IF;
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'workforce.structure.prepare' ELSE 'workforce.structure.approve' END) THEN RAISE EXCEPTION 'ANNUAL_BUDGET_FORBIDDEN';END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'ANNUAL_BUDGET_EMPLOYMENT_REQUIRED';END IF;
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
REVOKE ALL ON FUNCTION public.annual_budget_immutable_v1(),public.annual_budget_text_v1(jsonb,integer,integer),public.annual_budget_definition_v1(jsonb),public.annual_budget_context_v1(jsonb),public.annual_budget_scope_v1(jsonb),public.annual_budget_lock_v1(jsonb,integer),public.annual_budget_current_v1(jsonb,integer),public.annual_budget_proposal_v1(jsonb,public.annual_position_budget_event),public.annual_budget_bootstrap_v1(jsonb,integer),public.annual_budget_attempt_v1(jsonb,uuid),public.annual_budget_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.annual_budget_bootstrap_v1(jsonb,integer),public.annual_budget_attempt_v1(jsonb,uuid),public.annual_budget_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
