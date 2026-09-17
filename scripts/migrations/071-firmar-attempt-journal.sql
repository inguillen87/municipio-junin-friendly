-- FD-P1: durable signing attempts, return binding and quarantine. NO official emission.
-- Request/authority preparation and signature validation are separate release gates.
-- No role assignments, accounts or existing municipal data are changed by this migration.
CREATE TABLE public.firmar_signing_authority (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 membership_id uuid NOT NULL, document_kind text NOT NULL CHECK(document_kind~'^[a-z][a-z0-9._-]{2,63}$'),
 signer_cuil text NOT NULL CHECK(signer_cuil~'^[0-9]{11}$'),
 identity_evidence_ref text NOT NULL CHECK(length(btrim(identity_evidence_ref)) BETWEEN 5 AND 240),
 authority_evidence_ref text NOT NULL CHECK(length(btrim(authority_evidence_ref)) BETWEEN 5 AND 240),
 valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL CHECK(valid_until>valid_from),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','revoked')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(tenant_id,id), FOREIGN KEY(membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE TABLE public.firmar_signing_request (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 signer_membership_id uuid NOT NULL, authority_id uuid NOT NULL, authority_version integer NOT NULL CHECK(authority_version>0),
 document_kind text NOT NULL CHECK(document_kind~'^[a-z][a-z0-9._-]{2,63}$'),
 source_version_id uuid NOT NULL, source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 source_pdf bytea NOT NULL CHECK(octet_length(source_pdf) BETWEEN 10 AND 2097152),
 source_validation_ref text NOT NULL CHECK(length(btrim(source_validation_ref)) BETWEEN 5 AND 240),
 approval_ref text NOT NULL CHECK(length(btrim(approval_ref)) BETWEEN 5 AND 240),
 version integer NOT NULL DEFAULT 1 CHECK(version=1),
 state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','cancelled')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), cancelled_at timestamptz,
 CHECK(encode(public.digest(source_pdf,'sha256'),'hex')=source_sha256),
 CHECK(substring(source_pdf FROM 1 FOR 5)=decode('255044462d','hex')),
 CHECK((state='prepared' AND cancelled_at IS NULL) OR (state='cancelled' AND cancelled_at IS NOT NULL)),
 UNIQUE(tenant_id,id), FOREIGN KEY(signer_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(tenant_id,authority_id) REFERENCES public.firmar_signing_authority(tenant_id,id)
);
CREATE TABLE public.firmar_signing_attempt (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, request_id uuid NOT NULL, source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 callback_token_sha256 text NOT NULL UNIQUE CHECK(callback_token_sha256~'^[a-f0-9]{64}$'),
 return_state_sha256 text NOT NULL UNIQUE CHECK(return_state_sha256~'^[a-f0-9]{64}$'),
 CHECK(callback_token_sha256<>return_state_sha256),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','awaiting_authorization','outcome_unknown','received_unverified')),
 authorization_url text, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
 returned_at timestamptz, submission_recorded_at timestamptz,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '30 minutes'),
 CHECK(authorization_url IS NULL OR authorization_url ~ '^https://(tst\.)?firmar\.gob\.ar/(firmador/)?api/signatures/[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}/?$'),
 UNIQUE(tenant_id,request_id), UNIQUE(tenant_id,request_id,id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES public.firmar_signing_request(tenant_id,id)
);
CREATE TABLE public.firmar_signing_receipt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, request_id uuid NOT NULL, attempt_id uuid NOT NULL,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'), content bytea NOT NULL CHECK(octet_length(content) BETWEEN 10 AND 2097152),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(), state text NOT NULL DEFAULT 'received_unverified' CHECK(state='received_unverified'),
 CHECK(encode(public.digest(content,'sha256'),'hex')=sha256), CHECK(substring(content FROM 1 FOR 5)=decode('255044462d','hex')),
 UNIQUE(attempt_id), FOREIGN KEY(tenant_id,request_id,attempt_id) REFERENCES public.firmar_signing_attempt(tenant_id,request_id,id)
);
CREATE TABLE public.firmar_signing_event (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL, request_id uuid NOT NULL, attempt_id uuid,
 kind text NOT NULL CHECK(kind IN ('reserved','submission_recorded','return_bound','cancelled','received_unverified','provider_reported_failure','receipt_conflict')),
 actor_membership_id uuid, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(request_id,kind), FOREIGN KEY(tenant_id,request_id) REFERENCES public.firmar_signing_request(tenant_id,id),
 FOREIGN KEY(tenant_id,request_id,attempt_id) REFERENCES public.firmar_signing_attempt(tenant_id,request_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE INDEX firmar_signing_requests_by_signer ON public.firmar_signing_request(tenant_id,signer_membership_id,created_at DESC,id);
CREATE INDEX firmar_signing_receipts_by_tenant ON public.firmar_signing_receipt(tenant_id);
ALTER TABLE public.firmar_signing_authority ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firmar_signing_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firmar_signing_attempt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firmar_signing_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firmar_signing_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.firmar_signing_authority,public.firmar_signing_request,public.firmar_signing_attempt,public.firmar_signing_receipt,public.firmar_signing_event FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON SEQUENCE public.firmar_signing_event_id_seq FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER firmar_receipt_immutable BEFORE UPDATE OR DELETE ON public.firmar_signing_receipt FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER firmar_receipt_no_truncate BEFORE TRUNCATE ON public.firmar_signing_receipt FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER firmar_event_immutable BEFORE UPDATE OR DELETE ON public.firmar_signing_event FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER firmar_event_no_truncate BEFORE TRUNCATE ON public.firmar_signing_event FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE FUNCTION public.firmar_request_immutable_source_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP<>'UPDATE' OR (to_jsonb(NEW)-'state'-'cancelled_at') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'cancelled_at')
 OR OLD.state<>'prepared' OR NEW.state<>'cancelled' OR NEW.cancelled_at IS NULL THEN RAISE EXCEPTION 'FIRMAR_IMMUTABLE_SOURCE';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER firmar_request_source_immutable BEFORE UPDATE OR DELETE ON public.firmar_signing_request FOR EACH ROW EXECUTE FUNCTION public.firmar_request_immutable_source_v1();
CREATE TRIGGER firmar_request_no_truncate BEFORE TRUNCATE ON public.firmar_signing_request FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();

-- Independent from GRH and employment links. Authority is per signer, document kind and validity.
CREATE FUNCTION public.firmar_actor_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u public.internal_users%ROWTYPE;m public.tenant_membership%ROWTYPE;s public.tenant_identity_session%ROWTYPE;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p) key) IS DISTINCT FROM ARRAY['actorEmail','actorSessionId','actorSessionVersion','membershipId','tenantId'] THEN RAISE EXCEPTION 'FIRMAR_SESSION_INVALID';END IF;
 SELECT * INTO u FROM public.internal_users WHERE email=p->>'actorEmail' AND active AND auth_mode='managed' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIRMAR_SESSION_INVALID';END IF;
 SELECT * INTO m FROM public.tenant_membership WHERE id=(p->>'membershipId')::uuid AND tenant_id=(p->>'tenantId')::uuid AND user_email=u.email AND status='active' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIRMAR_SESSION_INVALID';END IF;
 SELECT * INTO s FROM public.tenant_identity_session WHERE id=(p->>'actorSessionId')::uuid AND user_email=u.email AND active_tenant_id=m.tenant_id AND session_version=(p->>'actorSessionVersion')::integer
 AND identity_version=u.identity_version AND source='membership' AND auth_level='mfa' AND status='active' AND expires_at>clock_timestamp() AND last_seen_at>clock_timestamp()-interval '1 hour' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIRMAR_SESSION_INVALID';END IF;
 PERFORM 1 FROM public.platform_tenant WHERE id=m.tenant_id AND status='active' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIRMAR_SESSION_INVALID';END IF;
 PERFORM public.tenant_iam_assert_no_sod_conflict(m.id);
 RETURN jsonb_build_object('tenantId',m.tenant_id,'membershipId',m.id,'email',u.email,'sessionId',s.id);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'FIRMAR_BUSY';
 WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'FIRMAR_SESSION_INVALID';END $$;
CREATE FUNCTION public.firmar_authority_for_request_v1(r public.firmar_signing_request) RETURNS public.firmar_signing_authority LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.firmar_signing_authority%ROWTYPE; BEGIN
 SELECT * INTO a FROM public.firmar_signing_authority WHERE id=r.authority_id AND tenant_id=r.tenant_id AND membership_id=r.signer_membership_id AND document_kind=r.document_kind
 AND version=r.authority_version AND status='active' AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp() FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIRMAR_AUTHORITY_REQUIRED';END IF;RETURN a;
END $$;
CREATE FUNCTION public.firmar_attempt_view_v1(a public.firmar_signing_attempt,r public.firmar_signing_request) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('requestId',($2).id,'attemptId',($1).id,'expiresAt',($1).expires_at,
 'state',CASE WHEN ($2).state='cancelled' THEN 'cancelled' WHEN ($1).state='received_unverified' THEN 'received_unverified' WHEN ($1).expires_at<=statement_timestamp() THEN 'expired'
 WHEN ($1).returned_at IS NOT NULL AND ($1).state='awaiting_authorization' THEN 'awaiting_receipt' WHEN ($1).state='awaiting_authorization' THEN 'awaiting_authorization' ELSE 'outcome_unknown' END,
 'authorizationUrl',CASE WHEN ($2).state='prepared' AND ($1).state='awaiting_authorization' AND ($1).returned_at IS NULL AND ($1).expires_at>statement_timestamp() THEN ($1).authorization_url ELSE NULL END,
 'officialEmissionEnabled',false)
$$;
CREATE FUNCTION public.firmar_attempt_operation_v1(p jsonb,op text,d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;member uuid;r public.firmar_signing_request%ROWTYPE;a public.firmar_signing_attempt%ROWTYPE;authority public.firmar_signing_authority%ROWTYPE;k text[];expiry timestamptz;
BEGIN
 ctx:=public.firmar_actor_v1(p);t:=(ctx->>'tenantId')::uuid;member:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR op NOT IN ('source','reserve','recover','status','return','cancel') OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>2048 THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO k FROM jsonb_object_keys(d) key;
 IF op='return' THEN
  IF k IS DISTINCT FROM ARRAY['returnStateSha256'] OR jsonb_typeof(d->'returnStateSha256') IS DISTINCT FROM 'string' OR d->>'returnStateSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END IF;
  SELECT * INTO a FROM public.firmar_signing_attempt WHERE tenant_id=t AND return_state_sha256=d->>'returnStateSha256';
  IF NOT FOUND THEN RAISE EXCEPTION 'FIRMAR_NOT_FOUND';END IF;
  SELECT * INTO r FROM public.firmar_signing_request WHERE id=a.request_id AND tenant_id=t AND signer_membership_id=member FOR UPDATE NOWAIT;
 ELSE
  IF op IN ('source','recover','cancel') AND k IS DISTINCT FROM ARRAY['requestId']
   OR op='status' AND k IS DISTINCT FROM ARRAY['attemptId','requestId']
   OR op='reserve' AND k IS DISTINCT FROM ARRAY['attemptId','callbackTokenSha256','expectedVersion','expiresAt','requestId','returnStateSha256'] THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END IF;
  IF jsonb_typeof(d->'requestId') IS DISTINCT FROM 'string' OR d->>'requestId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END IF;
  SELECT * INTO r FROM public.firmar_signing_request WHERE id=(d->>'requestId')::uuid AND tenant_id=t AND signer_membership_id=member FOR UPDATE NOWAIT;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIRMAR_NOT_FOUND';END IF;
 authority:=public.firmar_authority_for_request_v1(r);
 IF op='source' THEN
  IF r.state<>'prepared' THEN RAISE EXCEPTION 'FIRMAR_REQUEST_CANCELLED';END IF;
  RETURN jsonb_build_object('requestId',r.id,'version',r.version,'sourceVersionId',r.source_version_id,'sourceSha256',r.source_sha256,
   'pdfBase64',replace(encode(r.source_pdf,'base64'),E'\n',''),'signerCuil',authority.signer_cuil,'sourceValidationRef',r.source_validation_ref,'approvalRef',r.approval_ref);
 END IF;
 SELECT * INTO a FROM public.firmar_signing_attempt WHERE tenant_id=t AND request_id=r.id FOR UPDATE NOWAIT;
 IF op='cancel' THEN
  IF r.state='prepared' THEN
   UPDATE public.firmar_signing_request SET state='cancelled',cancelled_at=clock_timestamp() WHERE id=r.id RETURNING * INTO r;
   INSERT INTO public.firmar_signing_event(tenant_id,request_id,attempt_id,kind,actor_membership_id) VALUES(t,r.id,a.id,'cancelled',member);
  END IF;
  RETURN CASE WHEN a.id IS NULL THEN jsonb_build_object('requestId',r.id,'state','cancelled','officialEmissionEnabled',false) ELSE public.firmar_attempt_view_v1(a,r) END;
 END IF;
 IF op='reserve' THEN
  IF jsonb_typeof(d->'expectedVersion') IS DISTINCT FROM 'number' OR d->>'expectedVersion'!~'^[1-9][0-9]{0,8}$' OR (d->>'expectedVersion')::int<>r.version THEN RAISE EXCEPTION 'FIRMAR_VERSION_CONFLICT';END IF;
  IF r.state<>'prepared' THEN RAISE EXCEPTION 'FIRMAR_REQUEST_CANCELLED';END IF;
  -- Lost response, multiple tabs and simultaneous clicks all recover this same attempt.
  IF a.id IS NOT NULL THEN RETURN public.firmar_attempt_view_v1(a,r)||jsonb_build_object('created',false);END IF;
  IF jsonb_typeof(d->'attemptId') IS DISTINCT FROM 'string' OR d->>'attemptId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'callbackTokenSha256') IS DISTINCT FROM 'string' OR d->>'callbackTokenSha256'!~'^[a-f0-9]{64}$'
   OR jsonb_typeof(d->'returnStateSha256') IS DISTINCT FROM 'string' OR d->>'returnStateSha256'!~'^[a-f0-9]{64}$'
   OR d->>'callbackTokenSha256'=d->>'returnStateSha256' OR jsonb_typeof(d->'expiresAt') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END IF;
  expiry:=(d->>'expiresAt')::timestamptz;
  IF expiry<=clock_timestamp() OR expiry>clock_timestamp()+interval '30 minutes' THEN RAISE EXCEPTION 'FIRMAR_ATTEMPT_EXPIRED';END IF;
  INSERT INTO public.firmar_signing_attempt(id,tenant_id,request_id,source_sha256,callback_token_sha256,return_state_sha256,expires_at)
  VALUES((d->>'attemptId')::uuid,t,r.id,r.source_sha256,d->>'callbackTokenSha256',d->>'returnStateSha256',expiry) RETURNING * INTO a;
  INSERT INTO public.firmar_signing_event(tenant_id,request_id,attempt_id,kind,actor_membership_id) VALUES(t,r.id,a.id,'reserved',member);
  RETURN public.firmar_attempt_view_v1(a,r)||jsonb_build_object('created',true);
 END IF;
 IF a.id IS NULL THEN RAISE EXCEPTION 'FIRMAR_ATTEMPT_NOT_FOUND';END IF;
 IF op='status' AND (jsonb_typeof(d->'attemptId') IS DISTINCT FROM 'string' OR d->>'attemptId'<>a.id::text) THEN RAISE EXCEPTION 'FIRMAR_NOT_FOUND';END IF;
 IF op='return' THEN
  IF a.expires_at<=clock_timestamp() OR r.state='cancelled' THEN RAISE EXCEPTION 'FIRMAR_RETURN_EXPIRED';END IF;
  -- Record one observation, but make recovery repeatable after a lost response or a remount.
  IF a.returned_at IS NULL THEN
   UPDATE public.firmar_signing_attempt SET returned_at=clock_timestamp() WHERE id=a.id RETURNING * INTO a;
   INSERT INTO public.firmar_signing_event(tenant_id,request_id,attempt_id,kind,actor_membership_id) VALUES(t,r.id,a.id,'return_bound',member);
  END IF;
  RETURN jsonb_build_object('requestId',r.id,'attemptId',a.id,'state','return_bound','officialEmissionEnabled',false);
 END IF;
 RETURN public.firmar_attempt_view_v1(a,r);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'FIRMAR_BUSY';
 WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END $$;

-- Called by the server that already reserved this attempt, NOT by a provider success flag.
CREATE FUNCTION public.firmar_submission_record_v1(token_hash text,submission_state text,launch_url text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.firmar_signing_attempt%ROWTYPE;r public.firmar_signing_request%ROWTYPE; BEGIN
 IF token_hash IS NULL OR token_hash!~'^[a-f0-9]{64}$' OR submission_state IS NULL OR submission_state NOT IN ('awaiting_authorization','outcome_unknown')
 OR submission_state='awaiting_authorization' AND (launch_url IS NULL OR length(launch_url)>400 OR launch_url!~'^https://(tst\.)?firmar\.gob\.ar/(firmador/)?api/signatures/[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}/?$')
 OR submission_state='outcome_unknown' AND launch_url IS NOT NULL THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END IF;
 SELECT * INTO a FROM public.firmar_signing_attempt WHERE callback_token_sha256=token_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIRMAR_NOT_FOUND';END IF;
 SELECT * INTO r FROM public.firmar_signing_request WHERE id=a.request_id AND tenant_id=a.tenant_id FOR UPDATE NOWAIT;
 SELECT * INTO a FROM public.firmar_signing_attempt WHERE id=a.id FOR UPDATE NOWAIT;
 IF a.submission_recorded_at IS NOT NULL THEN
  IF a.authorization_url IS DISTINCT FROM launch_url THEN RAISE EXCEPTION 'FIRMAR_SUBMISSION_CONFLICT';END IF;
  RETURN jsonb_build_object('recorded',true,'replayed',true,'officialEmissionEnabled',false);
 END IF;
 -- Callback may have arrived first; recording transport never regresses its receipt state.
 UPDATE public.firmar_signing_attempt SET state=CASE WHEN state='received_unverified' THEN state ELSE submission_state END,
 authorization_url=launch_url,submission_recorded_at=clock_timestamp() WHERE id=a.id;
 INSERT INTO public.firmar_signing_event(tenant_id,request_id,attempt_id,kind) VALUES(a.tenant_id,a.request_id,a.id,'submission_recorded');
 RETURN jsonb_build_object('recorded',true,'replayed',false,'officialEmissionEnabled',false);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'FIRMAR_BUSY';END $$;
CREATE FUNCTION public.firmar_callback_quarantine_v1(token_hash text,outcome text,pdf_base64 text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE a public.firmar_signing_attempt%ROWTYPE;r public.firmar_signing_request%ROWTYPE;receipt public.firmar_signing_receipt%ROWTYPE;pdf bytea;h text; BEGIN
 IF token_hash IS NULL OR token_hash!~'^[a-f0-9]{64}$' OR outcome IS NULL OR outcome NOT IN ('received_unverified','provider_reported_failure')
 OR outcome='provider_reported_failure' AND pdf_base64 IS NOT NULL THEN RAISE EXCEPTION 'FIRMAR_CALLBACK_INVALID';END IF;
 SELECT * INTO a FROM public.firmar_signing_attempt WHERE callback_token_sha256=token_hash;
 IF NOT FOUND THEN RAISE EXCEPTION 'FIRMAR_NOT_FOUND';END IF;
 -- Serialize quota checks by tenant, then use the same request->attempt order as interactive operations.
 PERFORM pg_advisory_xact_lock(hashtextextended('firmar-quarantine:'||a.tenant_id::text,0));
 SELECT * INTO r FROM public.firmar_signing_request WHERE id=a.request_id AND tenant_id=a.tenant_id FOR UPDATE NOWAIT;
 SELECT * INTO a FROM public.firmar_signing_attempt WHERE id=a.id FOR UPDATE NOWAIT;
 IF r.state='cancelled' THEN RAISE EXCEPTION 'FIRMAR_REQUEST_CANCELLED';END IF;
 PERFORM public.firmar_authority_for_request_v1(r);
 IF NOT EXISTS(SELECT 1 FROM public.tenant_membership m JOIN public.internal_users u ON u.email=m.user_email JOIN public.platform_tenant t ON t.id=m.tenant_id
 WHERE m.id=r.signer_membership_id AND m.tenant_id=r.tenant_id AND m.status='active' AND u.active AND t.status='active') THEN RAISE EXCEPTION 'FIRMAR_AUTHORITY_REQUIRED';END IF;
 IF outcome='provider_reported_failure' THEN
  IF a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'FIRMAR_ATTEMPT_EXPIRED';END IF;
  INSERT INTO public.firmar_signing_event(tenant_id,request_id,attempt_id,kind) VALUES(a.tenant_id,a.request_id,a.id,'provider_reported_failure') ON CONFLICT(request_id,kind) DO NOTHING;
  RETURN jsonb_build_object('outcome','provider_reported_failure','providerAuthenticated',false,'cryptographicValidation','not_performed','officialEmissionEnabled',false);
 END IF;
 IF pdf_base64 IS NULL OR length(pdf_base64)>2796204 OR pdf_base64!~'^[A-Za-z0-9+/]+={0,2}$' THEN RAISE EXCEPTION 'FIRMAR_CALLBACK_INVALID';END IF;
 pdf:=decode(pdf_base64,'base64');h:=encode(public.digest(pdf,'sha256'),'hex');
 IF octet_length(pdf) NOT BETWEEN 10 AND 2097152 OR replace(encode(pdf,'base64'),E'\n','')<>pdf_base64 OR substring(pdf FROM 1 FOR 5)<>decode('255044462d','hex') THEN RAISE EXCEPTION 'FIRMAR_CALLBACK_INVALID';END IF;
 SELECT * INTO receipt FROM public.firmar_signing_receipt WHERE attempt_id=a.id;
 IF FOUND THEN
  IF receipt.sha256<>h OR receipt.content<>pdf THEN
   INSERT INTO public.firmar_signing_event(tenant_id,request_id,attempt_id,kind) VALUES(a.tenant_id,a.request_id,a.id,'receipt_conflict') ON CONFLICT(request_id,kind) DO NOTHING;
   RETURN jsonb_build_object('outcome','receipt_conflict','officialEmissionEnabled',false);
  END IF;
  RETURN jsonb_build_object('outcome','received_unverified','receiptId',receipt.id,'sha256',receipt.sha256,'replayed',true,'providerAuthenticated',false,'cryptographicValidation','not_performed','officialEmissionEnabled',false);
 END IF;
 IF a.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'FIRMAR_ATTEMPT_EXPIRED';END IF;
 IF (SELECT COALESCE(sum(octet_length(content)),0) FROM public.firmar_signing_receipt WHERE tenant_id=a.tenant_id)+octet_length(pdf)>67108864 THEN RAISE EXCEPTION 'FIRMAR_QUARANTINE_FULL';END IF;
 INSERT INTO public.firmar_signing_receipt(tenant_id,request_id,attempt_id,sha256,content) VALUES(a.tenant_id,a.request_id,a.id,h,pdf) RETURNING * INTO receipt;
 UPDATE public.firmar_signing_attempt SET state='received_unverified' WHERE id=a.id;
 INSERT INTO public.firmar_signing_event(tenant_id,request_id,attempt_id,kind) VALUES(a.tenant_id,a.request_id,a.id,'received_unverified');
 RETURN jsonb_build_object('outcome','received_unverified','receiptId',receipt.id,'sha256',h,'replayed',false,'providerAuthenticated',false,'cryptographicValidation','not_performed','officialEmissionEnabled',false);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'FIRMAR_BUSY';
 WHEN invalid_parameter_value OR invalid_text_representation THEN RAISE EXCEPTION 'FIRMAR_CALLBACK_INVALID';END $$;
REVOKE ALL ON FUNCTION public.firmar_request_immutable_source_v1(),public.firmar_actor_v1(jsonb),public.firmar_authority_for_request_v1(public.firmar_signing_request),public.firmar_attempt_view_v1(public.firmar_signing_attempt,public.firmar_signing_request),public.firmar_attempt_operation_v1(jsonb,text,jsonb),public.firmar_submission_record_v1(text,text,text),public.firmar_callback_quarantine_v1(text,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
-- Narrow facades only; no function can provision authority, approve a source, verify a signature or emit.
GRANT EXECUTE ON FUNCTION public.firmar_attempt_operation_v1(jsonb,text,jsonb),public.firmar_submission_record_v1(text,text,text),public.firmar_callback_quarantine_v1(text,text,text) TO municontrol_actions_runtime_app;
