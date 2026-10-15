-- A separate, explicit owner decision. No IAM, source, employee or salary writes.
-- The installer pins the complete previous functions and all new metadata.
CREATE TABLE public.municipal_owner_catalog_provenance(
 review_id uuid PRIMARY KEY REFERENCES public.native_employment_catalog_review(id),
 decision_mode text NOT NULL CHECK(decision_mode='owner'),independence boolean NOT NULL CHECK(independence IS FALSE),
 preview jsonb NOT NULL CHECK(jsonb_typeof(preview)='object'),command jsonb NOT NULL CHECK(jsonb_typeof(command)='object'),
 command_sha256 text NOT NULL CHECK(length(command_sha256)=64 AND command_sha256~'^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(octet_length(preview::text)+octet_length(command::text)+octet_length(receipt::text)<=8388608)
);
ALTER TABLE public.municipal_owner_catalog_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.municipal_owner_catalog_provenance FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER municipal_owner_catalog_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.municipal_owner_catalog_provenance FOR EACH STATEMENT EXECUTE FUNCTION public.native_employment_catalog_immutable_v1();

CREATE FUNCTION public.municipal_owner_catalog_context_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE evidence jsonb;c jsonb;scope_value jsonb;
BEGIN
 -- 184 supplies real owner/MFA/session evidence; it is not a parameters policy.
 evidence:=public.municipal_owner_adoption_authority_v1(p);
 c:=public.native_employment_catalog_context_v1(p,'employee.catalog.propose');
 scope_value:=jsonb_build_object('tenantId',c->>'tenantId','membershipId',c->>'membershipId','bindingId',c->>'sourceBindingId','companyId',(c->>'sourceCompanyId')::integer);
 IF evidence->'scope' IS DISTINCT FROM scope_value OR evidence#>>'{authority,actor,personId}' IS DISTINCT FROM c->>'actorPersonId'
 OR evidence#>>'{authority,actor,email}' IS DISTINCT FROM c->>'actorEmail' THEN RAISE EXCEPTION 'OWNER_CATALOG_AUTHORITY_REQUIRED';END IF;
 RETURN jsonb_build_object('version','municipal-owner-catalog-authority.v1','scope',scope_value,'authority',evidence->'authority',
 'policy',jsonb_build_object('version','municipal-owner-catalog-policy.v1','sha256','17fbc499030196be8e40594bd19dbc82913b7278683f87eba3aa6124f805982f'),
 'scopeVersion',public.native_employment_catalog_scope_v1(c));
END $$;

CREATE FUNCTION public.municipal_owner_catalog_authority_v1(p jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT public.municipal_owner_catalog_context_v1(p)
$$;

CREATE FUNCTION public.municipal_owner_catalog_command_check_v1(input jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE field_name text;
BEGIN
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' OR ARRAY(SELECT jsonb_object_keys(input) ORDER BY 1) IS DISTINCT FROM
 ARRAY['baseVersion','itemsSha256','previewSha256','proposalId','proposalSha256','reason','reviewConfirmed','scopeVersion','version']::text[]
 OR input->>'version' IS DISTINCT FROM 'municipal-owner-catalog-command.v1' OR input->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb
 OR octet_length(input::text)>8192 THEN RAISE EXCEPTION 'OWNER_CATALOG_INPUT_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['baseVersion','itemsSha256','previewSha256','proposalId','proposalSha256','reason','scopeVersion','version'] LOOP
  IF jsonb_typeof(input->field_name) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWNER_CATALOG_INPUT_INVALID';END IF;
 END LOOP;
 FOREACH field_name IN ARRAY ARRAY['baseVersion','itemsSha256','previewSha256','proposalSha256','scopeVersion'] LOOP
  IF length(input->>field_name)<>64 OR input->>field_name!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWNER_CATALOG_INPUT_INVALID';END IF;
 END LOOP;
 IF length(input->>'proposalId')<>36 OR input->>'proposalId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 OR input->>'proposalId'='00000000-0000-0000-0000-000000000000'
 OR normalize(btrim(input->>'reason'),NFC) IS DISTINCT FROM input->>'reason' OR length(input->>'reason') NOT BETWEEN 10 AND 1000
 OR input->>'reason'~U&'[<>\0001-\001F\007F-\009F]' THEN RAISE EXCEPTION 'OWNER_CATALOG_INPUT_INVALID';END IF;
END $$;

CREATE FUNCTION public.municipal_owner_catalog_preview_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority_value jsonb;c jsonb;r public.native_employment_catalog_proposal;catalog jsonb;value jsonb;
BEGIN
 authority_value:=public.municipal_owner_catalog_context_v1(p);c:=public.native_employment_catalog_context_v1(p,'employee.catalog.propose');
 PERFORM public.native_employment_catalog_lock_v1(c);
 SELECT * INTO r FROM public.native_employment_catalog_proposal WHERE id=target AND tenant_id=(c->>'tenantId')::uuid AND source_binding_id=(c->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_catalog_review WHERE proposal_id=r.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_DECIDED';END IF;
 PERFORM public.grh_curated_source_read_lock_v1();catalog:=public.native_employee_catalog_v1(c);
 IF r.base_version IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_BASE_CHANGED';END IF;
 value:=jsonb_build_object('version','municipal-owner-catalog-preview.v1','decisionMode','owner','independence',false,'context',authority_value,
 'proposal',jsonb_build_object('id',r.id,'requestSha256',r.request_sha256,'baseVersion',r.base_version,'baseItems',r.base_items,'items',r.items,
 'reason',r.reason,'authorLabel',r.author_label,'createdAt',r.created_at),'itemsSha256',public.employment_adoption_hash_v1(r.items),'current',true);
 RETURN value||jsonb_build_object('previewSha256',public.employment_adoption_hash_v1(value));
END $$;

CREATE FUNCTION public.municipal_owner_catalog_receipt_v1(r public.native_employment_catalog_review,preview_value jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT jsonb_build_object('version','municipal-owner-catalog-receipt.v1','decisionMode','owner','independence',false,'reviewId',r.id,'proposalId',r.proposal_id,
 'requestKey',r.request_key,'requestSha256',r.request_sha256,'catalogVersion',r.catalog_version,'revision',r.revision,
 'total',jsonb_array_length(preview_value#>'{proposal,items}'),'previewSha256',preview_value->>'previewSha256','itemsSha256',preview_value->>'itemsSha256',
 'policySha256','17fbc499030196be8e40594bd19dbc82913b7278683f87eba3aa6124f805982f','replayed',false)
$$;

CREATE FUNCTION public.municipal_owner_catalog_provenance_check_v1(v public.municipal_owner_catalog_provenance) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE r public.native_employment_catalog_review;proposal public.native_employment_catalog_proposal;resolved jsonb;expected jsonb;field_name text;
BEGIN
 PERFORM public.municipal_owner_catalog_command_check_v1(v.command);
 SELECT * INTO r FROM public.native_employment_catalog_review WHERE id=v.review_id;
 SELECT * INTO proposal FROM public.native_employment_catalog_proposal WHERE id=r.proposal_id;
 IF r.id IS NULL OR proposal.id IS NULL OR r.decision IS DISTINCT FROM 'approve' OR v.decision_mode IS DISTINCT FROM 'owner' OR v.independence IS DISTINCT FROM false
 OR r.tenant_id IS DISTINCT FROM proposal.tenant_id OR r.source_binding_id IS DISTINCT FROM proposal.source_binding_id
 OR r.reason IS DISTINCT FROM v.command->>'reason' OR r.request_sha256 IS DISTINCT FROM v.command_sha256
 OR v.command_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(jsonb_build_object('operation','approve_owner','body',v.command))
 OR v.command->>'proposalId' IS DISTINCT FROM proposal.id::text OR v.command->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256
 OR v.command->>'baseVersion' IS DISTINCT FROM proposal.base_version THEN RAISE EXCEPTION 'OWNER_CATALOG_PROVENANCE_INVALID';END IF;
 resolved:=public.municipal_owner_catalog_context_v1(jsonb_build_object('actorEmail',r.actor_email,'actorSessionId',r.actor_session_id,'actorSessionVersion',r.actor_session_version,'releaseSha',r.release_sha,'tenantId',r.tenant_id,'membershipId',r.actor_membership_id));
 expected:=jsonb_build_object('version','municipal-owner-catalog-preview.v1','decisionMode','owner','independence',false,'context',resolved,
 'proposal',jsonb_build_object('id',proposal.id,'requestSha256',proposal.request_sha256,'baseVersion',proposal.base_version,'baseItems',proposal.base_items,'items',proposal.items,
 'reason',proposal.reason,'authorLabel',proposal.author_label,'createdAt',proposal.created_at),'itemsSha256',public.employment_adoption_hash_v1(proposal.items),'current',true);
 expected:=expected||jsonb_build_object('previewSha256',public.employment_adoption_hash_v1(expected));
 IF v.preview IS DISTINCT FROM expected OR v.receipt IS DISTINCT FROM public.municipal_owner_catalog_receipt_v1(r,expected)
 OR r.catalog_version IS DISTINCT FROM encode(public.digest(jsonb_build_object('version','native-employment-catalog.v1','tenantId',r.tenant_id::text,'sourceBindingId',r.source_binding_id::text,'proposalId',proposal.id,'revision',r.revision,'items',proposal.items)::text,'sha256'),'hex')
 THEN RAISE EXCEPTION 'OWNER_CATALOG_PROVENANCE_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['scopeVersion','previewSha256','itemsSha256'] LOOP
  IF v.command->>field_name IS DISTINCT FROM (CASE WHEN field_name='scopeVersion' THEN resolved->>field_name ELSE expected->>field_name END) THEN RAISE EXCEPTION 'OWNER_CATALOG_PROVENANCE_INVALID';END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.municipal_owner_catalog_provenance_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE inserted_xid text;
BEGIN
 SELECT r.xmin::text INTO inserted_xid FROM public.native_employment_catalog_review r WHERE r.id=NEW.review_id;
 -- Compare the physical inserting xid, including xid8 epoch truncation. No
 -- existing review may be relabelled as an owner decision in a later tx.
 IF inserted_xid IS DISTINCT FROM mod(pg_current_xact_id()::text::numeric,4294967296)::text THEN RAISE EXCEPTION 'OWNER_CATALOG_PROVENANCE_INVALID';END IF;
 PERFORM public.municipal_owner_catalog_provenance_check_v1(NEW);
 IF pg_total_relation_size('public.municipal_owner_catalog_provenance')+octet_length(NEW::text)>67108864 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER municipal_owner_catalog_provenance_before BEFORE INSERT ON public.municipal_owner_catalog_provenance FOR EACH ROW EXECUTE FUNCTION public.municipal_owner_catalog_provenance_guard_v1();

CREATE FUNCTION public.municipal_owner_catalog_stored_v1(p jsonb,k uuid,missing_ok boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority_value jsonb;r public.native_employment_catalog_review;v public.municipal_owner_catalog_provenance;
BEGIN
 authority_value:=public.municipal_owner_catalog_context_v1(p);
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWNER_CATALOG_INPUT_INVALID';END IF;
 SELECT * INTO r FROM public.native_employment_catalog_review WHERE tenant_id=(authority_value#>>'{scope,tenantId}')::uuid AND source_binding_id=(authority_value#>>'{scope,bindingId}')::uuid AND actor_membership_id=(authority_value#>>'{scope,membershipId}')::uuid AND request_key=k;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM public.native_employment_catalog_proposal WHERE tenant_id=(authority_value#>>'{scope,tenantId}')::uuid AND source_binding_id=(authority_value#>>'{scope,bindingId}')::uuid AND actor_membership_id=(authority_value#>>'{scope,membershipId}')::uuid AND request_key=k) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_IDEMPOTENCY_REUSE';END IF;
  IF missing_ok THEN RETURN NULL;END IF;RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_NOT_FOUND';
 END IF;
 SELECT * INTO v FROM public.municipal_owner_catalog_provenance WHERE review_id=r.id;
 IF NOT FOUND OR r.actor_person_id::text IS DISTINCT FROM authority_value#>>'{authority,actor,personId}' OR r.actor_email IS DISTINCT FROM authority_value#>>'{authority,actor,email}'
 OR v.preview#>'{context,scope}' IS DISTINCT FROM authority_value->'scope' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_IDEMPOTENCY_REUSE';END IF;
 -- Historical proof stays unchanged; recovery authenticates the CURRENT
 -- session separately and does not require the historical session to be alive.
 IF v.command_sha256 IS DISTINCT FROM r.request_sha256 OR v.receipt IS DISTINCT FROM public.municipal_owner_catalog_receipt_v1(r,v.preview)
 OR v.preview->>'previewSha256' IS DISTINCT FROM public.employment_adoption_hash_v1(v.preview-'previewSha256')
 OR v.command_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(jsonb_build_object('operation','approve_owner','body',v.command)) THEN RAISE EXCEPTION 'OWNER_CATALOG_PROVENANCE_INVALID';END IF;
 RETURN jsonb_build_object('version','municipal-owner-catalog-attempt.v1','authorization',authority_value,'preview',v.preview,'command',v.command,'receipt',v.receipt||jsonb_build_object('replayed',true));
END $$;

CREATE FUNCTION public.municipal_owner_catalog_attempt_v1(p jsonb,k uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT public.municipal_owner_catalog_stored_v1(p,k,false)
$$;

-- The ONLY catalog review writer. The ordinary RPC fixes independent mode;
-- the owner RPC fixes owner mode. Neither client can supply this mode argument.
CREATE FUNCTION public.municipal_owner_catalog_review_core_v1(ctx jsonb,body jsonb,key uuid,decision_mode text,owner_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb;p public.native_employment_catalog_proposal;reason_value text;decision_value text;proposal_value uuid;hash_value text;existing jsonb;catalog jsonb;revision_value integer;catalog_hash text;receipt_value jsonb;
 authority_value jsonb;preview_value jsonb;owner_receipt jsonb;review_value public.native_employment_catalog_review;
BEGIN
 IF decision_mode='independent' AND owner_command IS NULL THEN c:=public.native_employment_catalog_context_v1(ctx,'employee.catalog.approve');
 ELSIF decision_mode='owner' THEN
  authority_value:=public.municipal_owner_catalog_context_v1(ctx);c:=public.native_employment_catalog_context_v1(ctx,'employee.catalog.propose');PERFORM public.municipal_owner_catalog_command_check_v1(owner_command);
 ELSE RAISE EXCEPTION 'OWNER_CATALOG_AUTHORITY_REQUIRED';END IF;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['decision','proposalId','reason','scopeVersion']::text[]
  OR jsonb_typeof(body->'scopeVersion') IS DISTINCT FROM 'string' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'decision') IS DISTINCT FROM 'string' OR body->>'decision' NOT IN ('approve','reject') OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR octet_length(body::text)>2097152 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID';END IF;
 reason_value:=normalize(btrim(body->>'reason'),NFC);decision_value:=body->>'decision';proposal_value:=(body->>'proposalId')::uuid;
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID';END IF;
 hash_value:=encode(public.digest(jsonb_build_object('operation','review','body',jsonb_build_object('proposalId',proposal_value,'decision',decision_value,'reason',reason_value,'scopeVersion',body->>'scopeVersion'))::text,'sha256'),'hex');
 PERFORM public.native_employment_catalog_lock_v1(c);
 IF decision_mode='independent' THEN existing:=public.native_employment_catalog_replay_v1(c,key,'review',hash_value);IF existing IS NOT NULL THEN RETURN existing;END IF;
 ELSE
  IF body IS DISTINCT FROM jsonb_build_object('scopeVersion',owner_command->>'scopeVersion','proposalId',owner_command->>'proposalId','decision','approve','reason',owner_command->>'reason') THEN RAISE EXCEPTION 'OWNER_CATALOG_INPUT_INVALID';END IF;
  hash_value:=public.employment_adoption_hash_v1(jsonb_build_object('operation','approve_owner','body',owner_command));existing:=public.municipal_owner_catalog_stored_v1(ctx,key,true);
  IF existing IS NOT NULL THEN IF existing#>>'{receipt,requestSha256}' IS DISTINCT FROM hash_value OR existing->'command' IS DISTINCT FROM owner_command THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_IDEMPOTENCY_REUSE';END IF;RETURN existing;END IF;
 END IF;
 IF body->>'scopeVersion'<>public.native_employment_catalog_scope_v1(c) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_SCOPE_CHANGED';END IF;
 SELECT q.* INTO p FROM public.native_employment_catalog_proposal q WHERE q.id=proposal_value AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_catalog_review r WHERE r.proposal_id=p.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_DECIDED';END IF;
 IF decision_mode='independent' THEN IF NOT public.native_employment_catalog_can_review_v1(c,p) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_MAKER_CHECKER_REQUIRED';END IF;
 ELSE
  preview_value:=public.municipal_owner_catalog_preview_v1(ctx,p.id);
  IF owner_command->>'previewSha256' IS DISTINCT FROM preview_value->>'previewSha256' OR owner_command->>'proposalSha256' IS DISTINCT FROM p.request_sha256
  OR owner_command->>'baseVersion' IS DISTINCT FROM p.base_version OR owner_command->>'itemsSha256' IS DISTINCT FROM preview_value->>'itemsSha256'
  OR preview_value->'context' IS DISTINCT FROM authority_value THEN RAISE EXCEPTION 'OWNER_CATALOG_PREVIEW_CHANGED';END IF;
 END IF;
 PERFORM public.grh_curated_source_read_lock_v1();catalog:=public.native_employee_catalog_v1(c);
 revision_value:=(catalog->>'revision')::integer;catalog_hash:=catalog->>'version';
 IF decision_value='approve' THEN
  IF p.base_version<>catalog_hash THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_BASE_CHANGED';END IF;
  revision_value:=revision_value+1;IF revision_value>1000 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_LIMIT';END IF;
  catalog_hash:=encode(public.digest(jsonb_build_object('version','native-employment-catalog.v1','tenantId',c->>'tenantId','sourceBindingId',c->>'sourceBindingId','proposalId',p.id,'revision',revision_value,'items',p.items)::text,'sha256'),'hex');
 END IF;
 PERFORM public.native_employment_catalog_capacity_v1(16384);
 receipt_value:=jsonb_build_object('version','native-employment-catalog.v1','operation','review','proposalId',p.id,'status',CASE decision_value WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'catalogVersion',catalog_hash,'revision',revision_value,'replayed',false);
 INSERT INTO public.native_employment_catalog_review(tenant_id,source_binding_id,proposal_id,decision,reason,revision,catalog_version,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt)
 VALUES((c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,p.id,decision_value,reason_value,revision_value,catalog_hash,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,hash_value,receipt_value) RETURNING * INTO review_value;
 IF decision_mode='independent' THEN RETURN receipt_value;END IF;
 owner_receipt:=public.municipal_owner_catalog_receipt_v1(review_value,preview_value);
 INSERT INTO public.municipal_owner_catalog_provenance(review_id,decision_mode,independence,preview,command,command_sha256,receipt)
 VALUES(review_value.id,'owner',false,preview_value,owner_command,hash_value,owner_receipt);
 RETURN jsonb_build_object('version','municipal-owner-catalog-attempt.v1','authorization',authority_value,'preview',preview_value,'command',owner_command,'receipt',owner_receipt);
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_review_v1(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RETURN public.municipal_owner_catalog_review_core_v1(ctx,body,key,'independent',NULL);END $$;

CREATE FUNCTION public.municipal_owner_catalog_command_v1(p jsonb,input jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN
 PERFORM public.municipal_owner_catalog_command_check_v1(input);
 RETURN public.municipal_owner_catalog_review_core_v1(p,jsonb_build_object('scopeVersion',input->>'scopeVersion','proposalId',input->>'proposalId','decision','approve','reason',input->>'reason'),k,'owner',input);
END $$;

REVOKE ALL ON FUNCTION public.municipal_owner_catalog_context_v1(jsonb),public.municipal_owner_catalog_authority_v1(jsonb),public.municipal_owner_catalog_command_check_v1(jsonb),
 public.municipal_owner_catalog_preview_v1(jsonb,uuid),public.municipal_owner_catalog_receipt_v1(public.native_employment_catalog_review,jsonb),
 public.municipal_owner_catalog_provenance_check_v1(public.municipal_owner_catalog_provenance),public.municipal_owner_catalog_provenance_guard_v1(),
 public.municipal_owner_catalog_stored_v1(jsonb,uuid,boolean),public.municipal_owner_catalog_attempt_v1(jsonb,uuid),
 public.municipal_owner_catalog_review_core_v1(jsonb,jsonb,uuid,text,jsonb),public.municipal_owner_catalog_command_v1(jsonb,jsonb,uuid)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.municipal_owner_catalog_authority_v1(jsonb),public.municipal_owner_catalog_preview_v1(jsonb,uuid),
 public.municipal_owner_catalog_attempt_v1(jsonb,uuid),public.municipal_owner_catalog_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
