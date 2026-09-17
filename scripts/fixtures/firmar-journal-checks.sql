CREATE TEMP TABLE qa_checks(label text PRIMARY KEY);
CREATE FUNCTION pg_temp.check(label text,value boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'QA failed: %',label;END IF;INSERT INTO qa_checks VALUES(label);END $$;
CREATE FUNCTION pg_temp.denied(label text,statement text,code text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE rejected boolean:=false;BEGIN
 BEGIN EXECUTE statement;EXCEPTION WHEN OTHERS THEN IF position(code IN SQLERRM)=0 THEN RAISE;END IF;rejected:=true;END;
 PERFORM pg_temp.check(label,rejected);
END $$;
CREATE FUNCTION pg_temp.ctx(n integer DEFAULT 1) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('actorEmail',m.user_email,'actorSessionId',s.id,'actorSessionVersion',s.session_version,'membershipId',m.id,'tenantId',m.tenant_id) FROM public.tenant_membership m JOIN public.tenant_identity_session s ON s.id=m.id WHERE left(m.id::text,1)=n::text $$;
CREATE FUNCTION pg_temp.request(n integer) RETURNS uuid LANGUAGE plpgsql AS $$ DECLARE r uuid;BEGIN
 INSERT INTO public.firmar_signing_request(tenant_id,signer_membership_id,authority_id,authority_version,document_kind,source_version_id,source_sha256,source_pdf,source_validation_ref,approval_ref)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444',1,'institutional.report',gen_random_uuid(),encode(digest(convert_to('%PDF-1.4 QA-SOURCE-'||n||' END','UTF8'),'sha256'),'hex'),convert_to('%PDF-1.4 QA-SOURCE-'||n||' END','UTF8'),'SYNTHETIC ENVELOPE REFERENCE','SYNTHETIC APPROVAL WITHOUT LEGAL EFFECT') RETURNING id INTO r;RETURN r;
END $$;
CREATE FUNCTION pg_temp.reservation(r uuid,n integer DEFAULT 1) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('requestId',r,'expectedVersion',1,'attemptId',gen_random_uuid(),'callbackTokenSha256',encode(digest('callback-'||r||'-'||n,'sha256'),'hex'),'returnStateSha256',encode(digest('return-'||r||'-'||n,'sha256'),'hex'),'expiresAt',clock_timestamp()+interval '25 minutes') $$;
INSERT INTO public.firmar_signing_authority(id,tenant_id,membership_id,document_kind,signer_cuil,identity_evidence_ref,authority_evidence_ref,valid_from,valid_until,status)
 VALUES('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','institutional.report','20999999999','SYNTHETIC VERIFIED IDENTITY','SYNTHETIC DOCUMENT FACULTY',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','active');
DO $$ DECLARE r uuid:=pg_temp.request(1);d jsonb;reply jsonb;again jsonb;candidate text:=encode(convert_to('%PDF-1.4 QA-CANDIDATE-NOT-A-SIGNATURE END','UTF8'),'base64');cb text;ret text;url text:='https://tst.firmar.gob.ar/api/signatures/55555555-5555-4555-8555-555555555555';BEGIN
 d:=pg_temp.reservation(r);cb:=d->>'callbackTokenSha256';ret:=d->>'returnStateSha256';
 PERFORM pg_temp.check('source reads approved stored version',(public.firmar_attempt_operation_v1(pg_temp.ctx(),'source',jsonb_build_object('requestId',r))->>'version')::int=1);
 PERFORM pg_temp.denied('other signer cannot read source',format('SELECT public.firmar_attempt_operation_v1(%L,''source'',%L)',pg_temp.ctx(2),jsonb_build_object('requestId',r)),'FIRMAR_NOT_FOUND');
 PERFORM pg_temp.denied('other municipality cannot read source',format('SELECT public.firmar_attempt_operation_v1(%L,''source'',%L)',pg_temp.ctx(3),jsonb_build_object('requestId',r)),'FIRMAR_NOT_FOUND');
 PERFORM pg_temp.denied('wrong version cannot reserve',format('SELECT public.firmar_attempt_operation_v1(%L,''reserve'',%L)',pg_temp.ctx(),d||'{"expectedVersion":2}'),'FIRMAR_VERSION_CONFLICT');
 PERFORM pg_temp.denied('same return and callback secret rejected',format('SELECT public.firmar_attempt_operation_v1(%L,''reserve'',%L)',pg_temp.ctx(),d||jsonb_build_object('returnStateSha256',cb)),'FIRMAR_INPUT_INVALID');
 reply:=public.firmar_attempt_operation_v1(pg_temp.ctx(),'reserve',d);
 PERFORM pg_temp.check('first reservation committed as unknown, not signed',reply->>'state'='outcome_unknown' AND (reply->>'created')::boolean AND NOT (reply->>'officialEmissionEnabled')::boolean);
 again:=public.firmar_attempt_operation_v1(pg_temp.ctx(),'reserve',pg_temp.reservation(r,2));
 PERFORM pg_temp.check('second reservation returns first attempt',again->>'attemptId'=reply->>'attemptId' AND (again->>'created')::boolean=false);
 PERFORM pg_temp.check('one reservation and event only',(SELECT count(*)=1 FROM public.firmar_signing_attempt WHERE request_id=r) AND (SELECT count(*)=1 FROM public.firmar_signing_event WHERE request_id=r));
 PERFORM public.firmar_submission_record_v1(cb,'awaiting_authorization',url);
 PERFORM pg_temp.check('submission response replay idempotent',(public.firmar_submission_record_v1(cb,'awaiting_authorization',url)->>'replayed')::boolean);
 PERFORM pg_temp.denied('conflicting provider URL rejected',format('SELECT public.firmar_submission_record_v1(%L,''awaiting_authorization'',%L)',cb,replace(url,'55555555','66666666')),'FIRMAR_SUBMISSION_CONFLICT');
 PERFORM pg_temp.check('recovery returns exact provider URL',public.firmar_attempt_operation_v1(pg_temp.ctx(),'recover',jsonb_build_object('requestId',r))->>'authorizationUrl'=url);
 PERFORM pg_temp.denied('unexpected attempt id does not return a different document',format('SELECT public.firmar_attempt_operation_v1(%L,''status'',%L)',pg_temp.ctx(),jsonb_build_object('requestId',r,'attemptId',gen_random_uuid())),'FIRMAR_NOT_FOUND');
 PERFORM pg_temp.denied('return of other signer rejected',format('SELECT public.firmar_attempt_operation_v1(%L,''return'',%L)',pg_temp.ctx(2),jsonb_build_object('returnStateSha256',ret)),'FIRMAR_NOT_FOUND');
 PERFORM pg_temp.denied('return of other tenant rejected',format('SELECT public.firmar_attempt_operation_v1(%L,''return'',%L)',pg_temp.ctx(3),jsonb_build_object('returnStateSha256',ret)),'FIRMAR_NOT_FOUND');
 reply:=public.firmar_attempt_operation_v1(pg_temp.ctx(),'return',jsonb_build_object('returnStateSha256',ret));again:=public.firmar_attempt_operation_v1(pg_temp.ctx(),'return',jsonb_build_object('returnStateSha256',ret));
 PERFORM pg_temp.check('return repeat recovers same context',reply=again AND reply->>'state'='return_bound');
 PERFORM pg_temp.check('return writes one event only',(SELECT count(*)=1 FROM public.firmar_signing_event WHERE request_id=r AND kind='return_bound'));
 PERFORM pg_temp.check('return does not imply file receipt',public.firmar_attempt_operation_v1(pg_temp.ctx(),'recover',jsonb_build_object('requestId',r))->>'state'='awaiting_receipt' AND NOT EXISTS(SELECT 1 FROM public.firmar_signing_receipt WHERE request_id=r));
 PERFORM public.firmar_callback_quarantine_v1(cb,'provider_reported_failure');
 PERFORM pg_temp.check('unauthenticated failure does not make receipt or invalidate later success',public.firmar_attempt_operation_v1(pg_temp.ctx(),'recover',jsonb_build_object('requestId',r))->>'state'='awaiting_receipt');
 PERFORM pg_temp.denied('callback cannot use return secret',format('SELECT public.firmar_callback_quarantine_v1(%L,''received_unverified'',%L)',ret,candidate),'FIRMAR_NOT_FOUND');
 PERFORM pg_temp.denied('non-PDF candidate rejected',format('SELECT public.firmar_callback_quarantine_v1(%L,''received_unverified'',%L)',cb,encode(convert_to('bad','UTF8'),'base64')),'FIRMAR_CALLBACK_INVALID');
 reply:=public.firmar_callback_quarantine_v1(cb,'received_unverified',candidate);again:=public.firmar_callback_quarantine_v1(cb,'received_unverified',candidate);
 PERFORM pg_temp.check('callback replay preserves same bytes and receipt',reply->>'receiptId'=again->>'receiptId' AND (again->>'replayed')::boolean AND (SELECT encode(content,'base64')=candidate FROM public.firmar_signing_receipt WHERE request_id=r));
 PERFORM pg_temp.check('receipt is not validation',(reply->>'officialEmissionEnabled')::boolean=false AND (reply->>'providerAuthenticated')::boolean=false AND reply->>'cryptographicValidation'='not_performed');
 PERFORM pg_temp.check('different callback quarantines conflict, original unchanged',public.firmar_callback_quarantine_v1(cb,'received_unverified',encode(convert_to('%PDF-1.4 OTHER CANDIDATE','UTF8'),'base64'))->>'outcome'='receipt_conflict' AND (SELECT encode(content,'base64')=candidate FROM public.firmar_signing_receipt WHERE request_id=r));
 PERFORM pg_temp.denied('received bytes are immutable',format('UPDATE public.firmar_signing_receipt SET content=decode(''00'',''hex'') WHERE request_id=%L',r),'append-only');
 PERFORM pg_temp.denied('source cannot change after approval',format('UPDATE public.firmar_signing_request SET source_pdf=decode(''00'',''hex'') WHERE id=%L',r),'FIRMAR_IMMUTABLE_SOURCE');
 PERFORM pg_temp.denied('audit events are immutable','UPDATE public.firmar_signing_event SET kind=''cancelled''','append-only');
 PERFORM pg_temp.denied('receipt truncate is blocked','TRUNCATE public.firmar_signing_receipt','append-only');
 PERFORM pg_temp.check('public has no read access',NOT has_table_privilege('municontrol_actions_runtime_app','public.firmar_signing_receipt','SELECT'));
 PERFORM pg_temp.check('runtime cannot create an authority',NOT has_table_privilege('municontrol_actions_runtime_app','public.firmar_signing_authority','INSERT'));
 PERFORM pg_temp.check('private source helper is not exposed',NOT has_function_privilege('municontrol_actions_runtime_app','public.firmar_attempt_view_v1(public.firmar_signing_attempt,public.firmar_signing_request)','EXECUTE'));
 PERFORM pg_temp.check('runtime has only checked operation facade',has_function_privilege('municontrol_actions_runtime_app','public.firmar_attempt_operation_v1(jsonb,text,jsonb)','EXECUTE'));
 PERFORM pg_temp.check('all new tables enforce row security',(SELECT bool_and(relrowsecurity) FROM pg_class WHERE relname IN ('firmar_signing_authority','firmar_signing_request','firmar_signing_attempt','firmar_signing_receipt','firmar_signing_event')));
 -- Callback first and return first are independent: no fixed event ordering required.
 r:=pg_temp.request(2);d:=pg_temp.reservation(r);cb:=d->>'callbackTokenSha256';ret:=d->>'returnStateSha256';PERFORM public.firmar_attempt_operation_v1(pg_temp.ctx(),'reserve',d);
 PERFORM public.firmar_callback_quarantine_v1(cb,'received_unverified',candidate);PERFORM public.firmar_submission_record_v1(cb,'awaiting_authorization',url);
 PERFORM pg_temp.check('late transport completion cannot regress an early receipt',public.firmar_attempt_operation_v1(pg_temp.ctx(),'recover',jsonb_build_object('requestId',r))->>'state'='received_unverified');
 PERFORM public.firmar_attempt_operation_v1(pg_temp.ctx(),'return',jsonb_build_object('returnStateSha256',ret));
 PERFORM pg_temp.check('late browser return cannot regress receipt',public.firmar_attempt_operation_v1(pg_temp.ctx(),'recover',jsonb_build_object('requestId',r))->>'state'='received_unverified');
 -- Cancellation is not deletion and never reopens on a late callback.
 PERFORM public.firmar_attempt_operation_v1(pg_temp.ctx(),'cancel',jsonb_build_object('requestId',r));
 PERFORM pg_temp.check('cancel preserves original returned bytes',(SELECT count(*)=1 FROM public.firmar_signing_receipt WHERE request_id=r));
 PERFORM pg_temp.denied('late callback after cancel rejected',format('SELECT public.firmar_callback_quarantine_v1(%L,''received_unverified'',%L)',cb,candidate),'FIRMAR_REQUEST_CANCELLED');
 PERFORM pg_temp.check('repeat cancellation remains cancelled',public.firmar_attempt_operation_v1(pg_temp.ctx(),'cancel',jsonb_build_object('requestId',r))->>'state'='cancelled');
 PERFORM pg_temp.denied('cancelled source cannot be silently reopened',format('UPDATE public.firmar_signing_request SET state=''prepared'',cancelled_at=NULL WHERE id=%L',r),'FIRMAR_IMMUTABLE_SOURCE');
 -- Session and document authority are distinct from the global application role.
 r:=pg_temp.request(3);d:=pg_temp.reservation(r);cb:=d->>'callbackTokenSha256';ret:=d->>'returnStateSha256';PERFORM public.firmar_attempt_operation_v1(pg_temp.ctx(),'reserve',d);
 UPDATE public.tenant_identity_session SET status='revoked' WHERE id='11111111-1111-4111-8111-111111111111';
 PERFORM pg_temp.denied('revoked session cannot recover own attempt',format('SELECT public.firmar_attempt_operation_v1(%L,''recover'',%L)',pg_temp.ctx(),jsonb_build_object('requestId',r)),'FIRMAR_SESSION_INVALID');
 UPDATE public.tenant_identity_session SET status='active',auth_level='recovery' WHERE id='11111111-1111-4111-8111-111111111111';
 PERFORM pg_temp.denied('account recovery level cannot launch a signature',format('SELECT public.firmar_attempt_operation_v1(%L,''recover'',%L)',pg_temp.ctx(),jsonb_build_object('requestId',r)),'FIRMAR_SESSION_INVALID');
 UPDATE public.tenant_identity_session SET auth_level='mfa' WHERE id='11111111-1111-4111-8111-111111111111';
 UPDATE public.firmar_signing_authority SET status='revoked' WHERE id='44444444-4444-4444-8444-444444444444';
 PERFORM pg_temp.denied('revoked document authority denies an otherwise valid session',format('SELECT public.firmar_attempt_operation_v1(%L,''recover'',%L)',pg_temp.ctx(),jsonb_build_object('requestId',r)),'FIRMAR_AUTHORITY_REQUIRED');
 PERFORM pg_temp.denied('revoked authority denies receipt',format('SELECT public.firmar_callback_quarantine_v1(%L,''received_unverified'',%L)',cb,candidate),'FIRMAR_AUTHORITY_REQUIRED');
 UPDATE public.firmar_signing_authority SET status='active',version=2 WHERE id='44444444-4444-4444-8444-444444444444';
 PERFORM pg_temp.denied('changed authority version cannot silently authorize old request',format('SELECT public.firmar_attempt_operation_v1(%L,''recover'',%L)',pg_temp.ctx(),jsonb_build_object('requestId',r)),'FIRMAR_AUTHORITY_REQUIRED');
 UPDATE public.firmar_signing_authority SET version=1 WHERE id='44444444-4444-4444-8444-444444444444';
 UPDATE public.firmar_signing_attempt SET created_at=clock_timestamp()-interval '31 minutes',expires_at=clock_timestamp()-interval '2 minutes' WHERE request_id=r;
 PERFORM pg_temp.check('expired attempts do not authorize upload',public.firmar_attempt_operation_v1(pg_temp.ctx(),'recover',jsonb_build_object('requestId',r))->>'state'='expired');
 PERFORM pg_temp.denied('expired browser return is not accepted',format('SELECT public.firmar_attempt_operation_v1(%L,''return'',%L)',pg_temp.ctx(),jsonb_build_object('returnStateSha256',ret)),'FIRMAR_RETURN_EXPIRED');
 PERFORM pg_temp.denied('expired callback without receipt rejected',format('SELECT public.firmar_callback_quarantine_v1(%L,''received_unverified'',%L)',cb,candidate),'FIRMAR_ATTEMPT_EXPIRED');
 PERFORM pg_temp.denied('callback cannot report cryptographic success',format('SELECT public.firmar_callback_quarantine_v1(%L,''verified'',%L)',cb,candidate),'FIRMAR_CALLBACK_INVALID');
 PERFORM pg_temp.denied('arbitrary provider host rejected',format('SELECT public.firmar_submission_record_v1(%L,''awaiting_authorization'',''https://evil.invalid/redirect'')',cb),'FIRMAR_INPUT_INVALID');
END $$;
SELECT json_build_object('ok',true,'checks',(SELECT count(*) FROM qa_checks),'labels',(SELECT json_agg(label ORDER BY label) FROM qa_checks),'database','disposable_postgresql','realMunicipalData',false,'realProviderRequests',0,'realSignatures',0,'officialEmissionEnabled',false,'rolledBack',true);
