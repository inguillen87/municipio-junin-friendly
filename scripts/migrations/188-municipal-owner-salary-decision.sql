-- Explicit owner approval of a complete own salary master; no IAM or payroll calculation.
-- Apply only through the source-pinned installation protocol.
CREATE TABLE public.municipal_owner_salary_provenance(
 event_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,source_binding_id uuid NOT NULL,
 decision_mode text NOT NULL CHECK(decision_mode='owner'),independence boolean NOT NULL CHECK(independence IS FALSE),
 preview jsonb NOT NULL CHECK(jsonb_typeof(preview)='object'),command jsonb NOT NULL CHECK(jsonb_typeof(command)='object'),
 command_sha256 text NOT NULL CHECK(length(command_sha256)=64 AND command_sha256~'^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,source_binding_id,event_id) REFERENCES public.native_salary_event(tenant_id,source_binding_id,id),
 CHECK(octet_length(preview::text)+octet_length(command::text)+octet_length(receipt::text)<=16777216)
);
ALTER TABLE public.municipal_owner_salary_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.municipal_owner_salary_provenance FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER municipal_owner_salary_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.municipal_owner_salary_provenance FOR EACH STATEMENT EXECUTE FUNCTION public.native_salary_immutable_v1();

CREATE FUNCTION public.municipal_owner_salary_context_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE evidence jsonb;c jsonb;scope_value jsonb;
BEGIN
 evidence:=public.municipal_owner_adoption_authority_v1(p);c:=public.native_salary_administrative_context_v1(p);
 IF NOT public.action_center_context_has_capability(c,'payroll.parameter.prepare') OR c->'parameterActorVerified' IS DISTINCT FROM 'true'::jsonb OR c->>'actorPersonId' IS NULL THEN RAISE EXCEPTION 'OWNER_SALARY_AUTHORITY_REQUIRED';END IF;
 scope_value:=jsonb_build_object('tenantId',c->>'tenantId','membershipId',c->>'membershipId','bindingId',c->>'sourceBindingId','companyId',(c->>'sourceCompanyId')::bigint);
 IF evidence->'scope' IS DISTINCT FROM scope_value OR evidence#>>'{authority,actor,personId}' IS DISTINCT FROM c->>'actorPersonId'
 OR evidence#>>'{authority,actor,email}' IS DISTINCT FROM c->>'actorEmail' THEN RAISE EXCEPTION 'OWNER_SALARY_AUTHORITY_REQUIRED';END IF;
 RETURN jsonb_build_object('version','municipal-owner-salary-authority.v1','scope',scope_value,'authority',evidence->'authority',
 'policy',jsonb_build_object('version','municipal-owner-salary-policy.v1','sha256','c5f14b07e02ce1d3044627ea769b93e31803d507e025177746225d2c1dd12d71'),'scopeVersion',public.native_salary_scope_v1(c));
END $$;

CREATE FUNCTION public.municipal_owner_salary_authority_v1(p jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.municipal_owner_salary_context_v1(p) $$;

CREATE FUNCTION public.municipal_owner_salary_command_check_v1(input jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE field_name text;
BEGIN
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR ARRAY(SELECT jsonb_object_keys(input) ORDER BY 1) IS DISTINCT FROM
 ARRAY['baseVersion','classificationVersion','itemsSha256','previewSha256','proposalId','proposalSha256','reason','reviewConfirmed','scopeVersion','version']::text[]
 OR input->>'version' IS DISTINCT FROM 'municipal-owner-salary-command.v1' OR input->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR octet_length(input::text)>8192 THEN RAISE EXCEPTION 'OWNER_SALARY_INPUT_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['baseVersion','classificationVersion','itemsSha256','previewSha256','proposalId','proposalSha256','reason','scopeVersion','version'] LOOP
  IF jsonb_typeof(input->field_name) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWNER_SALARY_INPUT_INVALID';END IF;
 END LOOP;
 FOREACH field_name IN ARRAY ARRAY['baseVersion','classificationVersion','itemsSha256','previewSha256','proposalSha256','scopeVersion'] LOOP
  IF length(input->>field_name)<>64 OR input->>field_name!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWNER_SALARY_INPUT_INVALID';END IF;
 END LOOP;
 IF length(input->>'proposalId')<>36 OR input->>'proposalId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR input->>'proposalId'='00000000-0000-0000-0000-000000000000'
 OR normalize(btrim(input->>'reason'),NFC) IS DISTINCT FROM input->>'reason' OR length(input->>'reason') NOT BETWEEN 10 AND 1000 OR input->>'reason'~U&'[<>\0001-\001F\007F-\009F]' THEN RAISE EXCEPTION 'OWNER_SALARY_INPUT_INVALID';END IF;
END $$;

CREATE FUNCTION public.municipal_owner_salary_preview_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority_value jsonb;c jsonb;r public.native_salary_event;catalog jsonb;classification jsonb;value jsonb;
BEGIN
 authority_value:=public.municipal_owner_salary_context_v1(p);c:=public.native_salary_administrative_context_v1(p);PERFORM public.native_salary_lock_v1(c);
 SELECT * INTO r FROM public.native_salary_event WHERE id=target AND command='propose' AND tenant_id=(c->>'tenantId')::uuid AND source_binding_id=(c->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_SALARY_NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM public.native_salary_event WHERE proposal_id=r.id) THEN RAISE EXCEPTION 'NATIVE_SALARY_DECIDED';END IF;
 catalog:=public.native_salary_catalog_v1(c);classification:=public.native_employee_catalog_v1(c);
 IF r.body->>'baseVersion' IS DISTINCT FROM catalog->>'version' OR r.body->>'classificationVersion' IS DISTINCT FROM classification->>'version' THEN RAISE EXCEPTION 'NATIVE_SALARY_BASE_CHANGED';END IF;
 value:=jsonb_build_object('version','municipal-owner-salary-preview.v1','decisionMode','owner','independence',false,'context',authority_value,
 'proposal',jsonb_build_object('id',r.id,'requestSha256',r.request_sha256,'baseVersion',r.body->>'baseVersion','classificationVersion',r.body->>'classificationVersion',
 'baseItems',r.base_items,'items',r.body->'items','reason',r.body->>'reason','authorLabel',r.actor_label,'createdAt',r.recorded_at),
 'itemsSha256',public.employment_adoption_hash_v1(r.body->'items'),'current',true);
 RETURN value||jsonb_build_object('previewSha256',public.employment_adoption_hash_v1(value));
END $$;

CREATE FUNCTION public.municipal_owner_salary_receipt_v1(r public.native_salary_event,preview_value jsonb,command_value jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT jsonb_build_object('version','municipal-owner-salary-receipt.v1','decisionMode','owner','independence',false,'eventId',r.id,'proposalId',r.proposal_id,
 'requestKey',r.request_key,'requestSha256',public.employment_adoption_hash_v1(jsonb_build_object('operation','approve_owner','body',command_value)),
 'canonicalRequestSha256',r.request_sha256,'catalogVersion',r.receipt->>'catalogVersion','revision',r.revision,'total',jsonb_array_length(preview_value#>'{proposal,items}'),
 'previewSha256',preview_value->>'previewSha256','itemsSha256',preview_value->>'itemsSha256','policySha256','c5f14b07e02ce1d3044627ea769b93e31803d507e025177746225d2c1dd12d71','replayed',false)
$$;

CREATE FUNCTION public.municipal_owner_salary_provenance_check_v1(v public.municipal_owner_salary_provenance) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE r public.native_salary_event;proposal public.native_salary_event;resolved jsonb;expected jsonb;native_body jsonb;native_receipt jsonb;catalog_hash text;field_name text;
BEGIN
 PERFORM public.municipal_owner_salary_command_check_v1(v.command);
 SELECT * INTO r FROM public.native_salary_event WHERE id=v.event_id;SELECT * INTO proposal FROM public.native_salary_event WHERE id=r.proposal_id;
 IF r.id IS NULL OR proposal.id IS NULL OR r.command IS DISTINCT FROM 'approve' OR proposal.command IS DISTINCT FROM 'propose' OR v.decision_mode IS DISTINCT FROM 'owner' OR v.independence IS DISTINCT FROM false
 OR r.tenant_id IS DISTINCT FROM v.tenant_id OR r.source_binding_id IS DISTINCT FROM v.source_binding_id OR r.tenant_id IS DISTINCT FROM proposal.tenant_id OR r.source_binding_id IS DISTINCT FROM proposal.source_binding_id
 OR v.command->>'proposalId' IS DISTINCT FROM proposal.id::text OR v.command->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256
 OR v.command->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR v.command->>'classificationVersion' IS DISTINCT FROM proposal.body->>'classificationVersion'
 OR v.command_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(jsonb_build_object('operation','approve_owner','body',v.command)) THEN RAISE EXCEPTION 'OWNER_SALARY_PROVENANCE_INVALID';END IF;
 native_body:=jsonb_build_object('command','approve','scopeVersion',v.command->>'scopeVersion','baseVersion',v.command->>'baseVersion','classificationVersion',v.command->>'classificationVersion','proposalId',v.command->>'proposalId','proposalSha256',v.command->>'proposalSha256','items',NULL,'reason',v.command->>'reason','reviewConfirmed',true);
 catalog_hash:=encode(public.digest(jsonb_build_array('native-salary-catalog.v1',r.tenant_id::text,r.source_binding_id::text,r.revision,r.id,proposal.body->'items')::text,'sha256'),'hex');
 native_receipt:=jsonb_build_object('version','native-salary-catalog.v1','eventId',r.id,'proposalId',r.proposal_id,'requestKey',r.request_key,'requestSha256',r.request_sha256,'body',native_body,'status','approved','revision',r.revision,'catalogVersion',catalog_hash,'replayed',false,'payrollCalculated',false,'payrollPosted',false);
 IF r.body IS DISTINCT FROM native_body OR r.base_items IS DISTINCT FROM proposal.base_items OR r.revision<1 OR r.receipt IS DISTINCT FROM native_receipt
 OR r.request_sha256 IS DISTINCT FROM encode(public.digest(public.native_salary_serialized_v1(native_body),'sha256'),'hex') THEN RAISE EXCEPTION 'OWNER_SALARY_PROVENANCE_INVALID';END IF;
 resolved:=public.municipal_owner_salary_context_v1(jsonb_build_object('actorEmail',r.actor_email,'actorSessionId',r.actor_session_id,'actorSessionVersion',r.actor_session_version,'releaseSha',r.release_sha,'tenantId',r.tenant_id,'membershipId',r.actor_membership_id));
 IF resolved#>>'{authority,actor,personId}' IS DISTINCT FROM r.actor_person_id::text OR resolved#>>'{authority,actor,email}' IS DISTINCT FROM r.actor_email THEN RAISE EXCEPTION 'OWNER_SALARY_PROVENANCE_INVALID';END IF;
 expected:=jsonb_build_object('version','municipal-owner-salary-preview.v1','decisionMode','owner','independence',false,'context',resolved,
 'proposal',jsonb_build_object('id',proposal.id,'requestSha256',proposal.request_sha256,'baseVersion',proposal.body->>'baseVersion','classificationVersion',proposal.body->>'classificationVersion','baseItems',proposal.base_items,'items',proposal.body->'items','reason',proposal.body->>'reason','authorLabel',proposal.actor_label,'createdAt',proposal.recorded_at),
 'itemsSha256',public.employment_adoption_hash_v1(proposal.body->'items'),'current',true);
 expected:=expected||jsonb_build_object('previewSha256',public.employment_adoption_hash_v1(expected));
 IF v.preview IS DISTINCT FROM expected OR v.receipt IS DISTINCT FROM public.municipal_owner_salary_receipt_v1(r,expected,v.command) THEN RAISE EXCEPTION 'OWNER_SALARY_PROVENANCE_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['scopeVersion','previewSha256','itemsSha256'] LOOP
  IF v.command->>field_name IS DISTINCT FROM (CASE WHEN field_name='scopeVersion' THEN resolved->>field_name ELSE expected->>field_name END) THEN RAISE EXCEPTION 'OWNER_SALARY_PROVENANCE_INVALID';END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.municipal_owner_salary_provenance_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE inserted_xid text;
BEGIN
 SELECT r.xmin::text INTO inserted_xid FROM public.native_salary_event r WHERE r.id=NEW.event_id;
 IF inserted_xid IS DISTINCT FROM mod(pg_current_xact_id()::text::numeric,4294967296)::text THEN RAISE EXCEPTION 'OWNER_SALARY_PROVENANCE_INVALID';END IF;
 PERFORM public.municipal_owner_salary_provenance_check_v1(NEW);
 IF pg_total_relation_size('public.municipal_owner_salary_provenance')+octet_length(NEW::text)>67108864 THEN RAISE EXCEPTION 'NATIVE_SALARY_LIMIT';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER municipal_owner_salary_provenance_before BEFORE INSERT ON public.municipal_owner_salary_provenance FOR EACH ROW EXECUTE FUNCTION public.municipal_owner_salary_provenance_guard_v1();

CREATE FUNCTION public.municipal_owner_salary_stored_v1(p jsonb,k uuid,missing_ok boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority_value jsonb;r public.native_salary_event;v public.municipal_owner_salary_provenance;native_body jsonb;
BEGIN
 authority_value:=public.municipal_owner_salary_context_v1(p);
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWNER_SALARY_INPUT_INVALID';END IF;
 SELECT * INTO r FROM public.native_salary_event WHERE tenant_id=(authority_value#>>'{scope,tenantId}')::uuid AND source_binding_id=(authority_value#>>'{scope,bindingId}')::uuid AND actor_membership_id=(authority_value#>>'{scope,membershipId}')::uuid AND request_key=k;
 IF NOT FOUND THEN IF missing_ok THEN RETURN NULL;END IF;RAISE EXCEPTION 'NATIVE_SALARY_NOT_FOUND';END IF;
 SELECT * INTO v FROM public.municipal_owner_salary_provenance WHERE event_id=r.id;
 IF NOT FOUND OR r.command IS DISTINCT FROM 'approve' OR r.actor_person_id::text IS DISTINCT FROM authority_value#>>'{authority,actor,personId}' OR r.actor_email IS DISTINCT FROM authority_value#>>'{authority,actor,email}'
 OR v.preview#>'{context,scope}' IS DISTINCT FROM authority_value->'scope' THEN RAISE EXCEPTION 'NATIVE_SALARY_IDEMPOTENCY_REUSE';END IF;
 PERFORM public.municipal_owner_salary_command_check_v1(v.command);
 native_body:=jsonb_build_object('command','approve','scopeVersion',v.command->>'scopeVersion','baseVersion',v.command->>'baseVersion','classificationVersion',v.command->>'classificationVersion','proposalId',v.command->>'proposalId','proposalSha256',v.command->>'proposalSha256','items',NULL,'reason',v.command->>'reason','reviewConfirmed',true);
 -- Only current authorization is resolved. The immutable original session is evidence, not an access token.
 IF v.command_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(jsonb_build_object('operation','approve_owner','body',v.command))
 OR r.body IS DISTINCT FROM native_body OR r.request_sha256 IS DISTINCT FROM encode(public.digest(public.native_salary_serialized_v1(native_body),'sha256'),'hex')
 OR v.receipt IS DISTINCT FROM public.municipal_owner_salary_receipt_v1(r,v.preview,v.command)
 OR v.preview->>'previewSha256' IS DISTINCT FROM public.employment_adoption_hash_v1(v.preview-'previewSha256') THEN RAISE EXCEPTION 'OWNER_SALARY_PROVENANCE_INVALID';END IF;
 RETURN jsonb_build_object('version','municipal-owner-salary-attempt.v1','authorization',authority_value,'preview',v.preview,'command',v.command,'receipt',v.receipt||jsonb_build_object('replayed',true));
END $$;

CREATE FUNCTION public.municipal_owner_salary_attempt_v1(p jsonb,k uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$ SELECT public.municipal_owner_salary_stored_v1(p,k,false) $$;

CREATE FUNCTION public.municipal_owner_salary_command_core_v1(p jsonb,body jsonb,key uuid,decision_mode text,owner_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;prior public.native_salary_event;proposal public.native_salary_event;c jsonb;classification jsonb;items jsonb;fingerprint text;cmd text;eid uuid:=gen_random_uuid();pid uuid;rev integer;receipt_value jsonb;r jsonb;
 authority_value jsonb;preview_value jsonb;owner_value jsonb;existing jsonb;inserted public.native_salary_event;
BEGIN
 IF decision_mode='owner' THEN authority_value:=public.municipal_owner_salary_context_v1(p);PERFORM public.municipal_owner_salary_command_check_v1(owner_command);
 ELSIF decision_mode IS DISTINCT FROM 'independent' OR owner_command IS NOT NULL THEN RAISE EXCEPTION 'OWNER_SALARY_AUTHORITY_REQUIRED';END IF;
 ctx:=public.native_salary_administrative_context_v1(p);cmd:=body->>'command';
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['baseVersion','classificationVersion','command','items','proposalId','proposalSha256','reason','reviewConfirmed','scopeVersion']::text[]
  OR cmd IS NULL OR cmd NOT IN('propose','approve','reject') OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(body->>'reason') NOT BETWEEN 10 AND 1000 OR body->>'reason'<>btrim(body->>'reason') OR body->>'reason'<>normalize(body->>'reason',NFC) OR body->>'reason'~'[<>[:cntrl:]]'
  OR jsonb_typeof(body->'baseVersion') IS DISTINCT FROM 'string' OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR jsonb_typeof(body->'classificationVersion') IS DISTINCT FROM 'string' OR body->>'classificationVersion'!~'^[a-f0-9]{64}$' OR jsonb_typeof(body->'scopeVersion') IS DISTINCT FROM 'string' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean'
 THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
 IF decision_mode='independent' THEN
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'NATIVE_SALARY_FORBIDDEN'; END IF;
 ELSIF cmd IS DISTINCT FROM 'approve' THEN RAISE EXCEPTION 'OWNER_SALARY_INPUT_INVALID';END IF;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) THEN RAISE EXCEPTION 'NATIVE_SALARY_EMPLOYMENT_REQUIRED'; END IF;
 PERFORM public.native_salary_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 IF decision_mode='owner' THEN
  IF body IS DISTINCT FROM jsonb_build_object('command','approve','scopeVersion',owner_command->>'scopeVersion','baseVersion',owner_command->>'baseVersion','classificationVersion',owner_command->>'classificationVersion','proposalId',owner_command->>'proposalId','proposalSha256',owner_command->>'proposalSha256','items',NULL,'reason',owner_command->>'reason','reviewConfirmed',true) THEN RAISE EXCEPTION 'OWNER_SALARY_INPUT_INVALID';END IF;
  existing:=public.municipal_owner_salary_stored_v1(p,key,true);
  IF existing IS NOT NULL THEN IF existing->'command' IS DISTINCT FROM owner_command THEN RAISE EXCEPTION 'NATIVE_SALARY_IDEMPOTENCY_REUSE';END IF;RETURN existing;END IF;
 ELSE
 SELECT * INTO prior FROM public.native_salary_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF EXISTS(SELECT 1 FROM public.municipal_owner_salary_provenance WHERE event_id=prior.id) THEN RAISE EXCEPTION 'NATIVE_SALARY_IDEMPOTENCY_REUSE';END IF;IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'NATIVE_SALARY_IDEMPOTENCY_REUSE'; END IF;RETURN public.native_salary_attempt_v1(p,key);END IF;
 END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'NATIVE_SALARY_SCOPE_CHANGED'; END IF;
 c:=public.native_salary_catalog_v1(ctx);classification:=public.native_employee_catalog_v1(ctx);rev:=(c->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->'proposalId'<>'null'::jsonb OR body->'proposalSha256'<>'null'::jsonb OR body->>'reviewConfirmed'<>'false' THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
  IF body->>'baseVersion' IS DISTINCT FROM c->>'version' OR body->>'classificationVersion' IS DISTINCT FROM classification->>'version' THEN RAISE EXCEPTION 'NATIVE_SALARY_BASE_CHANGED'; END IF;
  items:=public.native_salary_items_v1(body->'items');IF jsonb_array_length(items)=0 OR items IS DISTINCT FROM body->'items' OR items=c->'items' THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(c->'items') old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(items) x WHERE public.native_salary_row_key_v1(x)=public.native_salary_row_key_v1(old))) THEN RAISE EXCEPTION 'NATIVE_SALARY_HISTORY_REQUIRED'; END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(items) LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(classification->'items') x WHERE x->>'kind'='agreements' AND x->>'code'=r->>'agreementCode')
    OR(r->>'kind'='scale' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(classification->'items') x WHERE x->>'kind'='categories' AND x->>'code'=r->>'categoryCode' AND x->>'agreementCode'=r->>'agreementCode')) THEN RAISE EXCEPTION 'NATIVE_SALARY_CLASSIFICATION_INVALID'; END IF;
  END LOOP;pid:=eid;
 ELSE
  IF body->'items'<>'null'::jsonb OR body->>'reviewConfirmed'<>'true' OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'proposalSha256' IS NULL OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NATIVE_SALARY_INPUT_INVALID'; END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.native_salary_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_SALARY_NOT_FOUND'; END IF;
  IF EXISTS(SELECT 1 FROM public.native_salary_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'NATIVE_SALARY_DECIDED'; END IF;
  IF decision_mode='independent' THEN
  IF NOT(public.native_salary_proposal_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'NATIVE_SALARY_INDEPENDENT_REQUIRED'; END IF;
  ELSE
   preview_value:=public.municipal_owner_salary_preview_v1(p,pid);
   IF preview_value->'context' IS DISTINCT FROM authority_value OR owner_command->>'previewSha256' IS DISTINCT FROM preview_value->>'previewSha256'
    OR owner_command->>'itemsSha256' IS DISTINCT FROM preview_value->>'itemsSha256' OR owner_command->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256
    OR owner_command->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR owner_command->>'classificationVersion' IS DISTINCT FROM proposal.body->>'classificationVersion'
   THEN RAISE EXCEPTION 'OWNER_SALARY_PREVIEW_CHANGED';END IF;
  END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'classificationVersion' IS DISTINCT FROM proposal.body->>'classificationVersion' THEN RAISE EXCEPTION 'NATIVE_SALARY_PROPOSAL_CHANGED'; END IF;
  IF cmd='approve' THEN
   IF body->>'baseVersion' IS DISTINCT FROM c->>'version' OR body->>'classificationVersion' IS DISTINCT FROM classification->>'version' THEN RAISE EXCEPTION 'NATIVE_SALARY_BASE_CHANGED'; END IF;
   items:=public.native_salary_items_v1(proposal.body->'items');rev:=rev+1;
   c:=jsonb_build_object('revision',rev,'items',items,'version',encode(public.digest(jsonb_build_array('native-salary-catalog.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,eid,items)::text,'sha256'),'hex'));
  END IF;
 END IF;
 IF rev>1000 OR(SELECT count(*) FROM public.native_salary_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>=1000 AND cmd='propose' THEN RAISE EXCEPTION 'NATIVE_SALARY_LIMIT'; END IF;
 -- A global lock and explicit ceiling avoid cross-tenant silent over-allocation.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-salary:capacity:v1',0)) THEN RAISE EXCEPTION 'NATIVE_SALARY_BUSY'; END IF;
 IF(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_items::text)+octet_length(e.receipt::text)),0) FROM public.native_salary_event e)+3*octet_length(body::text)+octet_length((c->'items')::text)>134217728
  OR(SELECT coalesce(sum(octet_length(e.body::text)+octet_length(e.base_items::text)+octet_length(e.receipt::text)),0) FROM public.native_salary_event e WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid)+3*octet_length(body::text)+octet_length((c->'items')::text)>67108864 THEN RAISE EXCEPTION 'NATIVE_SALARY_LIMIT'; END IF;
 receipt_value:=jsonb_build_object('version','native-salary-catalog.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'catalogVersion',c->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.native_salary_event(id,tenant_id,source_binding_id,proposal_id,command,body,base_items,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,CASE WHEN cmd='propose' THEN c->'items' ELSE proposal.base_items END,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value) RETURNING * INTO inserted;
  IF decision_mode='independent' THEN RETURN receipt_value;END IF;
  owner_value:=public.municipal_owner_salary_receipt_v1(inserted,preview_value,owner_command);
  INSERT INTO public.municipal_owner_salary_provenance(event_id,tenant_id,source_binding_id,decision_mode,independence,preview,command,command_sha256,receipt)
  VALUES(inserted.id,inserted.tenant_id,inserted.source_binding_id,'owner',false,preview_value,owner_command,public.employment_adoption_hash_v1(jsonb_build_object('operation','approve_owner','body',owner_command)),owner_value);
  RETURN jsonb_build_object('version','municipal-owner-salary-attempt.v1','authorization',authority_value,'preview',preview_value,'command',owner_command,'receipt',owner_value);
END $$;

CREATE OR REPLACE FUNCTION public.native_salary_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN RETURN public.municipal_owner_salary_command_core_v1(p,body,key,'independent',NULL);END $$;

CREATE FUNCTION public.municipal_owner_salary_command_v1(p jsonb,input jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN
 PERFORM public.municipal_owner_salary_command_check_v1(input);
 RETURN public.municipal_owner_salary_command_core_v1(p,jsonb_build_object('command','approve','scopeVersion',input->>'scopeVersion','baseVersion',input->>'baseVersion','classificationVersion',input->>'classificationVersion','proposalId',input->>'proposalId','proposalSha256',input->>'proposalSha256','items',NULL,'reason',input->>'reason','reviewConfirmed',true),k,'owner',input);
END $$;

REVOKE ALL ON FUNCTION public.municipal_owner_salary_context_v1(jsonb),public.municipal_owner_salary_authority_v1(jsonb),public.municipal_owner_salary_command_check_v1(jsonb),public.municipal_owner_salary_preview_v1(jsonb,uuid),public.municipal_owner_salary_receipt_v1(public.native_salary_event,jsonb,jsonb),public.municipal_owner_salary_provenance_check_v1(public.municipal_owner_salary_provenance),public.municipal_owner_salary_provenance_guard_v1(),public.municipal_owner_salary_stored_v1(jsonb,uuid,boolean),public.municipal_owner_salary_attempt_v1(jsonb,uuid),public.municipal_owner_salary_command_core_v1(jsonb,jsonb,uuid,text,jsonb),public.municipal_owner_salary_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.municipal_owner_salary_authority_v1(jsonb),public.municipal_owner_salary_preview_v1(jsonb,uuid),public.municipal_owner_salary_attempt_v1(jsonb,uuid),public.municipal_owner_salary_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
