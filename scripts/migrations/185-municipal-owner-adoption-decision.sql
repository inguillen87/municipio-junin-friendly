-- Only the source-pinned constructor installs this migration and its derived
-- writer/guard/readiness bodies together. No data is adopted by installation.
CREATE TABLE public.municipal_owner_adoption_provenance(
 decision_id uuid PRIMARY KEY REFERENCES public.employment_adoption_decision(id),
 decision_mode text NOT NULL CHECK(decision_mode='owner'),
 independence boolean NOT NULL CHECK(independence IS FALSE),
 preview jsonb NOT NULL CHECK(jsonb_typeof(preview)='object'),
 raw_review jsonb NOT NULL CHECK(jsonb_typeof(raw_review)='object'),
 command jsonb NOT NULL CHECK(jsonb_typeof(command)='object'),
 command_sha256 text NOT NULL CHECK(length(command_sha256)=64 AND command_sha256~'^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(octet_length(preview::text)+octet_length(raw_review::text)+octet_length(command::text)+octet_length(receipt::text)<=8388608)
);
ALTER TABLE public.municipal_owner_adoption_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.municipal_owner_adoption_provenance FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER municipal_owner_adoption_provenance_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.municipal_owner_adoption_provenance FOR EACH STATEMENT EXECUTE FUNCTION public.employment_adoption_immutable_v1();

CREATE FUNCTION public.municipal_owner_adoption_context_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE resolved jsonb;ctx jsonb;BEGIN
 resolved:=public.municipal_owner_adoption_authority_v1(p);
 ctx:=public.employment_adoption_administrative_context_v1(p,'employee.record.propose');
 IF resolved->'scope' IS DISTINCT FROM jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId','bindingId',ctx->>'sourceBindingId','companyId',(ctx->>'sourceCompanyId')::bigint)
 OR resolved#>>'{authority,actor,personId}' IS DISTINCT FROM ctx->>'actorPersonId' OR resolved#>>'{authority,actor,email}' IS DISTINCT FROM ctx->>'actorEmail'
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_REQUIRED';END IF;
 RETURN ctx||jsonb_build_object('ownerResolved',resolved);
END $$;

CREATE FUNCTION public.municipal_owner_adoption_command_check_v1(input jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE field_name text;BEGIN
 IF jsonb_typeof(input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'OWNER_ADOPTION_INPUT_INVALID';END IF;
 IF ARRAY(SELECT jsonb_object_keys(input) ORDER BY 1) IS DISTINCT FROM ARRAY['catalogVersion','operation','previewSha256','proposalId','proposalVersion','reason','reviewConfirmed','reviewVersion','sourceContextVersion','version']
 OR input->>'version' IS DISTINCT FROM 'municipal-adoption-owner-command.v1' OR input->>'operation' IS DISTINCT FROM 'approve_owner'
 OR input->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR octet_length(input::text)>8192 THEN RAISE EXCEPTION 'OWNER_ADOPTION_INPUT_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['catalogVersion','operation','previewSha256','proposalId','proposalVersion','reason','reviewVersion','sourceContextVersion','version'] LOOP
  IF jsonb_typeof(input->field_name) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWNER_ADOPTION_INPUT_INVALID';END IF;
 END LOOP;
 FOREACH field_name IN ARRAY ARRAY['catalogVersion','previewSha256','proposalVersion','reviewVersion','sourceContextVersion'] LOOP
  IF length(input->>field_name)<>64 OR input->>field_name!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWNER_ADOPTION_INPUT_INVALID';END IF;
 END LOOP;
 IF length(input->>'proposalId')<>36 OR input->>'proposalId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR input->>'proposalId'='00000000-0000-0000-0000-000000000000'
 OR length(input->>'reason') NOT BETWEEN 10 AND 1000 OR input->>'reason' IS DISTINCT FROM normalize(input->>'reason',NFC)
 OR input->>'reason' IS DISTINCT FROM btrim(input->>'reason',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
 OR input->>'reason'~U&'[<>\0001-\001F\007F-\009F]' THEN RAISE EXCEPTION 'OWNER_ADOPTION_INPUT_INVALID';END IF;
END $$;

-- Returns a raw stage. The API independently seals rawReview for presentation;
-- previewSha256 deliberately binds rawReviewSha256, never derived observations.
CREATE FUNCTION public.municipal_owner_adoption_preview_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE ctx jsonb;r public.employment_adoption_proposal;s public.employment_adoption_seal;raw jsonb;catalog jsonb;original jsonb;preview_value jsonb;
BEGIN
 ctx:=public.municipal_owner_adoption_context_v1(p);PERFORM public.municipal_adoption_ready_v1();
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_NOT_FOUND';END IF;
 IF EXISTS(SELECT 1 FROM public.employment_adoption_decision WHERE proposal_id=r.id) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_ALREADY_DECIDED';END IF;
 SELECT * INTO s FROM public.employment_adoption_seal WHERE proposal_id=r.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_UNSEALED';END IF;
 raw:=public.municipal_owner_adoption_source_for_proposal_v1(p,r);
 raw:=jsonb_set(raw,'{scope,membershipId}',to_jsonb(r.actor_membership_id::text));catalog:=public.native_employee_catalog_v1(ctx);
 IF raw-'queriedAt'-'today' IS DISTINCT FROM r.before_snapshot-'queriedAt'-'today'
 OR catalog->>'version' IS DISTINCT FROM r.body->>'catalogVersion' OR public.employment_adoption_facts_v1(r) IS DISTINCT FROM s.facts
 OR public.employment_adoption_hash_v1(s.facts) IS DISTINCT FROM s.facts_sha256 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 original:=r.before_snapshot-'finalContracts';
 IF jsonb_typeof(original#>'{source,finalRevision}') IS DISTINCT FROM 'object'
 OR ARRAY(SELECT jsonb_object_keys(original#>'{source,finalRevision}') ORDER BY 1) IS DISTINCT FROM ARRAY['coreManifestSha256','curatedManifestSha256','cutoff','factsSha256','packageSha256','revisionId','sourceSha256']
 OR original#>>'{source,finalRevision,revisionId}' IS DISTINCT FROM r.body#>>'{finalSource,revisionId}'
 OR original#>>'{source,finalRevision,packageSha256}' IS DISTINCT FROM r.body#>>'{finalSource,packageSha256}'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(original->'rows') row_value WHERE row_value->'sourceIssues' IS DISTINCT FROM '[]'::jsonb OR row_value->>'jurisdictionCode' NOT IN('42','55') OR row_value->>'jurisdictionCode' IS NULL)
 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 preview_value:=jsonb_build_object('version','municipal-adoption-owner-preview.v1','decisionMode','owner','independence',false,
 'scope',ctx#>'{ownerResolved,scope}','authority',ctx#>'{ownerResolved,authority}',
 'proposal',jsonb_build_object('proposalId',r.id,'proposalVersion',r.proposal_version,'sourceContextVersion',r.body->>'sourceContextVersion','catalogVersion',r.body->>'catalogVersion','total',r.total,'status','pending','author',jsonb_build_object('personId',r.actor_person_id,'membershipId',r.actor_membership_id,'email',r.actor_email)),
 'body',r.body,'rawReviewSha256',public.employment_adoption_hash_v1(original),'reviewVersion',public.employment_adoption_decision_version_v1(r,s),'current',true);
 RETURN jsonb_build_object('version','municipal-adoption-owner-stage.v1','preview',preview_value||jsonb_build_object('previewSha256',public.employment_adoption_hash_v1(preview_value)),'rawReview',original);
END $$;

CREATE FUNCTION public.municipal_owner_adoption_receipt_v1(decision_value public.employment_adoption_decision,preview_value jsonb,input jsonb,raw jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT jsonb_build_object('version','municipal-adoption-owner-receipt.v1','operation','approve_owner','decisionMode','owner','independence',false,
 'decisionId',decision_value.id,'status','approved','scope',preview_value->'scope','authority',preview_value->'authority','author',preview_value#>'{proposal,author}',
 'proposalId',decision_value.proposal_id,'proposalVersion',input->>'proposalVersion','sourceContextVersion',input->>'sourceContextVersion','catalogVersion',input->>'catalogVersion',
 'reviewVersion',input->>'reviewVersion','previewSha256',input->>'previewSha256','source',raw#>'{source,finalRevision}','reason',input->>'reason',
 'total',(preview_value#>>'{proposal,total}')::integer,'replayed',false,'decidedAt',decision_value.receipt->'decidedAt','effects',decision_value.receipt->'effects')
$$;

CREATE FUNCTION public.municipal_owner_adoption_provenance_check_v1(v public.municipal_owner_adoption_provenance) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE d public.employment_adoption_decision;r public.employment_adoption_proposal;s public.employment_adoption_seal;preview_value jsonb;field_name text;
BEGIN
 SELECT * INTO d FROM public.employment_adoption_decision WHERE id=v.decision_id;
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=d.proposal_id;
 SELECT * INTO s FROM public.employment_adoption_seal WHERE proposal_id=r.id;
 IF d.id IS NULL OR r.id IS NULL OR s.proposal_id IS NULL OR v.decision_mode IS DISTINCT FROM 'owner' OR v.independence IS DISTINCT FROM false
 OR d.decision IS DISTINCT FROM 'approve' OR d.tenant_id IS DISTINCT FROM r.tenant_id OR d.source_binding_id IS DISTINCT FROM r.source_binding_id
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_PROVENANCE_INVALID';END IF;
 PERFORM public.municipal_owner_adoption_command_check_v1(v.command);
 preview_value:=v.preview;
 IF ARRAY(SELECT jsonb_object_keys(preview_value) ORDER BY 1) IS DISTINCT FROM ARRAY['authority','body','current','decisionMode','independence','previewSha256','proposal','rawReviewSha256','reviewVersion','scope','version']
 OR preview_value->>'version' IS DISTINCT FROM 'municipal-adoption-owner-preview.v1' OR preview_value->>'decisionMode' IS DISTINCT FROM 'owner'
 OR preview_value->'independence' IS DISTINCT FROM 'false'::jsonb OR preview_value->'current' IS DISTINCT FROM 'true'::jsonb
 OR preview_value->>'previewSha256' IS DISTINCT FROM public.employment_adoption_hash_v1(preview_value-'previewSha256')
 OR preview_value->>'rawReviewSha256' IS DISTINCT FROM public.employment_adoption_hash_v1(v.raw_review)
 OR v.raw_review IS DISTINCT FROM r.before_snapshot-'finalContracts' OR preview_value->'body' IS DISTINCT FROM r.body
 OR preview_value->>'reviewVersion' IS DISTINCT FROM public.employment_adoption_decision_version_v1(r,s)
 OR preview_value->'proposal' IS DISTINCT FROM jsonb_build_object('proposalId',r.id,'proposalVersion',r.proposal_version,'sourceContextVersion',r.body->>'sourceContextVersion','catalogVersion',r.body->>'catalogVersion','total',r.total,'status','pending','author',jsonb_build_object('personId',r.actor_person_id,'membershipId',r.actor_membership_id,'email',r.actor_email))
 OR preview_value->'scope' IS DISTINCT FROM jsonb_build_object('tenantId',d.tenant_id,'membershipId',d.actor_membership_id,'bindingId',d.source_binding_id,'companyId',(v.raw_review#>>'{scope,companyId}')::bigint)
 OR preview_value#>>'{authority,actor,personId}' IS DISTINCT FROM d.actor_person_id::text OR preview_value#>>'{authority,actor,email}' IS DISTINCT FROM d.actor_email
 OR preview_value#>>'{authority,actor,sessionId}' IS DISTINCT FROM d.actor_session_id::text OR preview_value#>>'{authority,actor,sessionVersion}' IS DISTINCT FROM d.actor_session_version::text
 OR preview_value#>>'{authority,actor,releaseSha}' IS DISTINCT FROM d.release_sha
 OR v.command_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(v.command)
 OR v.receipt IS DISTINCT FROM public.municipal_owner_adoption_receipt_v1(d,preview_value,v.command,v.raw_review)
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_PROVENANCE_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['proposalId','proposalVersion','sourceContextVersion','catalogVersion'] LOOP
  IF v.command->>field_name IS DISTINCT FROM preview_value#>>ARRAY['proposal',field_name] THEN RAISE EXCEPTION 'OWNER_ADOPTION_PROVENANCE_INVALID';END IF;
 END LOOP;
 FOREACH field_name IN ARRAY ARRAY['reviewVersion','previewSha256'] LOOP
  IF v.command->>field_name IS DISTINCT FROM preview_value->>field_name THEN RAISE EXCEPTION 'OWNER_ADOPTION_PROVENANCE_INVALID';END IF;
 END LOOP;
 IF d.body IS DISTINCT FROM jsonb_build_object('reviewVersion',v.command->>'reviewVersion','review',jsonb_build_object('proposalId',v.command->>'proposalId','proposalVersion',v.command->>'proposalVersion','sourceContextVersion',v.command->>'sourceContextVersion','catalogVersion',v.command->>'catalogVersion','decision','approve','reason',v.command->>'reason'))
 OR d.body_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(d.body) THEN RAISE EXCEPTION 'OWNER_ADOPTION_PROVENANCE_INVALID';END IF;
END $$;

CREATE FUNCTION public.municipal_owner_adoption_provenance_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.employment_adoption_decision d WHERE d.id=NEW.decision_id AND d.applied_xid=pg_current_xact_id_if_assigned())
 THEN RAISE EXCEPTION 'OWNER_ADOPTION_PROVENANCE_INVALID';END IF;
 PERFORM public.municipal_owner_adoption_provenance_check_v1(NEW);
 IF pg_total_relation_size('public.municipal_owner_adoption_provenance')+octet_length(NEW::text)>67108864 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_LIMIT';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER municipal_owner_adoption_provenance_before BEFORE INSERT ON public.municipal_owner_adoption_provenance FOR EACH ROW EXECUTE FUNCTION public.municipal_owner_adoption_provenance_guard_v1();

CREATE FUNCTION public.municipal_owner_adoption_decision_guard_v1(d public.employment_adoption_decision) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE r public.employment_adoption_proposal;v public.municipal_owner_adoption_provenance;n integer;resolved jsonb;
BEGIN
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=d.proposal_id;
 SELECT * INTO v FROM public.municipal_owner_adoption_provenance WHERE decision_id=d.id;
 SELECT count(*) INTO n FROM public.employment_adoption_application WHERE decision_id=d.id;
 IF r.id IS NULL OR v.decision_id IS NULL OR d.tenant_id IS DISTINCT FROM r.tenant_id OR d.source_binding_id IS DISTINCT FROM r.source_binding_id
 OR d.decision IS DISTINCT FROM 'approve' OR d.applied_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() OR n<>r.total
 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_APPLY_FAILED';END IF;
 PERFORM public.municipal_owner_adoption_provenance_check_v1(v);
 resolved:=public.municipal_owner_adoption_authority_v1(jsonb_build_object('actorEmail',d.actor_email,'actorSessionId',d.actor_session_id,'actorSessionVersion',d.actor_session_version,'releaseSha',d.release_sha,'tenantId',d.tenant_id,'membershipId',d.actor_membership_id));
 IF resolved IS DISTINCT FROM jsonb_build_object('scope',v.preview->'scope','authority',v.preview->'authority') THEN RAISE EXCEPTION 'OWNER_ADOPTION_AUTHORITY_REQUIRED';END IF;
END $$;

CREATE FUNCTION public.municipal_owner_adoption_record_v1(target uuid,stage jsonb,input jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE d public.employment_adoption_decision;BEGIN
 SELECT * INTO d FROM public.employment_adoption_decision WHERE id=target;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_ADOPTION_PROVENANCE_INVALID';END IF;
 INSERT INTO public.municipal_owner_adoption_provenance(decision_id,decision_mode,independence,preview,raw_review,command,command_sha256,receipt)
 VALUES(d.id,'owner',false,stage->'preview',stage->'rawReview',input,public.employment_adoption_hash_v1(input),public.municipal_owner_adoption_receipt_v1(d,stage->'preview',input,stage->'rawReview'));
END $$;

CREATE FUNCTION public.municipal_owner_adoption_attempt_v1(p jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE ctx jsonb;d public.employment_adoption_decision;v public.municipal_owner_adoption_provenance;BEGIN
 ctx:=public.municipal_owner_adoption_context_v1(p);PERFORM public.municipal_adoption_ready_v1();
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWNER_ADOPTION_INPUT_INVALID';END IF;
 SELECT * INTO d FROM public.employment_adoption_decision WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=k;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_NOT_FOUND';END IF;
 IF d.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR d.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE';END IF;
 SELECT * INTO v FROM public.municipal_owner_adoption_provenance WHERE decision_id=d.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE';END IF;
 PERFORM public.municipal_owner_adoption_provenance_check_v1(v);
 IF v.preview->'scope' IS DISTINCT FROM ctx#>'{ownerResolved,scope}' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE';END IF;
 RETURN jsonb_build_object('version','municipal-adoption-owner-stored.v1','authorization',ctx->'ownerResolved','preview',v.preview,'rawReview',v.raw_review,'command',v.command,
 'attempt',jsonb_build_object('version','municipal-adoption-owner-attempt.v1','scope',v.preview->'scope','requestKey',k,'bodySha256',v.command_sha256,'receipt',v.receipt||jsonb_build_object('replayed',true)));
END $$;

CREATE FUNCTION public.municipal_owner_adoption_command_v1(p jsonb,input jsonb,k uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE ctx jsonb;d public.employment_adoption_decision;v public.municipal_owner_adoption_provenance;stage jsonb;preview_value jsonb;legacy_input jsonb;saved jsonb;field_name text;
BEGIN
 ctx:=public.municipal_owner_adoption_context_v1(p);PERFORM public.municipal_adoption_ready_v1();PERFORM public.municipal_owner_adoption_command_check_v1(input);
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWNER_ADOPTION_INPUT_INVALID';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('employment-adoption:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_BUSY';END IF;
 -- Recover before any current-source lookup, including a changed/replaced cut.
 SELECT * INTO d FROM public.employment_adoption_decision WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=k;
 IF FOUND THEN
  SELECT * INTO v FROM public.municipal_owner_adoption_provenance WHERE decision_id=d.id;
  IF NOT FOUND OR v.command IS DISTINCT FROM input OR v.command_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(input)
  OR d.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR d.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE';END IF;
  RETURN public.municipal_owner_adoption_attempt_v1(p,k);
 END IF;
 stage:=public.municipal_owner_adoption_preview_v1(p,(input->>'proposalId')::uuid);preview_value:=stage->'preview';
 FOREACH field_name IN ARRAY ARRAY['proposalId','proposalVersion','sourceContextVersion','catalogVersion'] LOOP
  IF input->>field_name IS DISTINCT FROM preview_value#>>ARRAY['proposal',field_name] THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 END LOOP;
 FOREACH field_name IN ARRAY ARRAY['reviewVersion','previewSha256'] LOOP
  IF input->>field_name IS DISTINCT FROM preview_value->>field_name THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_SELECTION_CHANGED';END IF;
 END LOOP;
 legacy_input:=jsonb_build_object('reviewVersion',input->>'reviewVersion','review',jsonb_build_object('proposalId',input->>'proposalId','proposalVersion',input->>'proposalVersion','sourceContextVersion',input->>'sourceContextVersion','catalogVersion',input->>'catalogVersion','decision','approve','reason',input->>'reason'));
 PERFORM public.municipal_owner_adoption_apply_v1(p,legacy_input,k,stage,input);
 saved:=public.municipal_owner_adoption_attempt_v1(p,k);
 RETURN jsonb_set(saved,'{attempt,receipt,replayed}','false'::jsonb);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_BUSY';END $$;
