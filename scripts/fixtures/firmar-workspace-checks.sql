-- Runs after the identity fixture and journal/workspace migrations, in a rollback transaction.
CREATE TEMP TABLE workspace_checks(label text PRIMARY KEY);
CREATE FUNCTION pg_temp.check(label text,value boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'QA failed: %',label;END IF;INSERT INTO workspace_checks VALUES(label);END $$;
CREATE FUNCTION pg_temp.denied(label text,statement text,code text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE rejected boolean:=false;BEGIN BEGIN EXECUTE statement;EXCEPTION WHEN OTHERS THEN IF position(code IN SQLERRM)=0 THEN RAISE;END IF;rejected:=true;END;PERFORM pg_temp.check(label,rejected);END $$;
CREATE FUNCTION pg_temp.ctx(n int DEFAULT 1) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('actorEmail',m.user_email,'actorSessionId',s.id,'actorSessionVersion',s.session_version,'membershipId',m.id,'tenantId',m.tenant_id) FROM public.tenant_membership m JOIN public.tenant_identity_session s ON s.id=m.id WHERE left(m.id::text,1)=n::text $$;
INSERT INTO public.firmar_signing_authority(id,tenant_id,membership_id,document_kind,signer_cuil,identity_evidence_ref,authority_evidence_ref,valid_from,valid_until,status)
 SELECT gen_random_uuid(),tenant_id,id,'institutional.report','20999999999','SYNTHETIC IDENTITY','SYNTHETIC AUTHORITY',clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 day','active' FROM public.tenant_membership;
INSERT INTO public.firmar_signing_request(tenant_id,signer_membership_id,authority_id,authority_version,document_kind,document_title,source_version_id,source_sha256,source_pdf,source_validation_ref,approval_ref,created_at)
 SELECT a.tenant_id,a.membership_id,a.id,1,'institutional.report','Informe QA '||lpad(n::text,2,'0'),gen_random_uuid(),encode(digest(convert_to('%PDF-1.4 SYNTHETIC SOURCE '||n,'UTF8'),'sha256'),'hex'),convert_to('%PDF-1.4 SYNTHETIC SOURCE '||n,'UTF8'),'SYNTHETIC CHECK','SYNTHETIC APPROVAL',statement_timestamp()-(n||' seconds')::interval
 FROM public.firmar_signing_authority a CROSS JOIN generate_series(1,12)n;
DO $$ DECLARE x jsonb;y jsonb;r public.firmar_signing_request%ROWTYPE;body jsonb;attempt jsonb;hash text;BEGIN
 body:='{"filter":"all","search":"","page":1,"pageSize":10}';
 x:=public.firmar_workspace_list_v1(pg_temp.ctx(),body);
 PERFORM pg_temp.check('personal total excludes two other signers',(x#>>'{counts,all}')::int=12);
 PERFORM pg_temp.check('count reflects full authorized cut not only visible page',jsonb_array_length(x->'documents')=10 AND (x#>>'{pagination,pages}')::int=2);
 PERFORM pg_temp.check('list cannot emit a document',x->>'officialEmissionEnabled'='false');
 PERFORM pg_temp.check('queue does not expose CUIL or source bytes',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'documents') d WHERE d ?| ARRAY['signerCuil','pdfBase64','authorizationUrl','callbackTokenSha256','returnStateSha256','approvalRef']));
 y:=public.firmar_workspace_list_v1(pg_temp.ctx(),body||'{"page":2}');
 PERFORM pg_temp.check('last page and ordering are stable',jsonb_array_length(y->'documents')=2 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(x->'documents') a CROSS JOIN jsonb_array_elements(y->'documents') b WHERE a->>'requestId'=b->>'requestId'));
 y:=public.firmar_workspace_list_v1(pg_temp.ctx(),body||'{"page":3}');PERFORM pg_temp.check('past-end page is empty not silently replaced',jsonb_array_length(y->'documents')=0 AND (y#>>'{pagination,page}')::int=3);
 y:=public.firmar_workspace_list_v1(pg_temp.ctx(),body||'{"search":"Informe QA 12"}');PERFORM pg_temp.check('search applies to counts and results together',(y#>>'{counts,all}')::int=1 AND jsonb_array_length(y->'documents')=1);
 y:=public.firmar_workspace_list_v1(pg_temp.ctx(),body||'{"search":"%"}');PERFORM pg_temp.check('wildcard characters are literal',(y#>>'{counts,all}')::int=0);
 PERFORM pg_temp.denied('filter cannot select a fictitious validated state',format('SELECT public.firmar_workspace_list_v1(%L,%L)',pg_temp.ctx(),body||'{"filter":"verified"}'),'FIRMAR_INPUT_INVALID');
 PERFORM pg_temp.denied('query cannot override signer',format('SELECT public.firmar_workspace_list_v1(%L,%L)',pg_temp.ctx(),body||jsonb_build_object('membershipId',gen_random_uuid())),'FIRMAR_INPUT_INVALID');
 PERFORM pg_temp.denied('zero page rejected',format('SELECT public.firmar_workspace_list_v1(%L,%L)',pg_temp.ctx(),body||'{"page":0}'),'FIRMAR_INPUT_INVALID');
 SELECT * INTO r FROM public.firmar_signing_request WHERE signer_membership_id='11111111-1111-4111-8111-111111111111' ORDER BY created_at DESC LIMIT 1;hash:=r.source_sha256;
 x:=public.firmar_workspace_source_v1(pg_temp.ctx(),r.id,1,hash);
 PERFORM pg_temp.check('original source bytes preserved',decode(x->>'pdfBase64','base64')=r.source_pdf);
 PERFORM pg_temp.check('source omits signer credentials and approval references',NOT (x ?| ARRAY['signerCuil','approvalRef','sourceValidationRef']));
 PERFORM pg_temp.denied('same-tenant other signer cannot fetch source',format('SELECT public.firmar_workspace_source_v1(%L,%L,1,%L)',pg_temp.ctx(2),r.id,hash),'FIRMAR_NOT_FOUND');
 PERFORM pg_temp.denied('another municipality cannot fetch source',format('SELECT public.firmar_workspace_source_v1(%L,%L,1,%L)',pg_temp.ctx(3),r.id,hash),'FIRMAR_NOT_FOUND');
 PERFORM pg_temp.denied('wrong content fingerprint rejected',format('SELECT public.firmar_workspace_source_v1(%L,%L,1,%L)',pg_temp.ctx(),r.id,repeat('0',64)),'FIRMAR_VERSION_CONFLICT');
 PERFORM pg_temp.denied('title cannot change on prepared source',format('UPDATE public.firmar_signing_request SET document_title=''changed title'' WHERE id=%L',r.id),'FIRMAR_IMMUTABLE_SOURCE');
 attempt:=public.firmar_attempt_operation_v1(pg_temp.ctx(),'reserve',jsonb_build_object('requestId',r.id,'expectedVersion',1,'attemptId',gen_random_uuid(),'callbackTokenSha256',repeat('a',64),'returnStateSha256',repeat('b',64),'expiresAt',clock_timestamp()+interval '20 minutes'));
 y:=public.firmar_workspace_list_v1(pg_temp.ctx(),body||'{"filter":"attention"}');PERFORM pg_temp.check('reservation in uncertainty appears for review',(y#>>'{counts,attention}')::int=1 AND y#>>'{documents,0,state}'='outcome_unknown');
 PERFORM public.firmar_callback_quarantine_v1(repeat('a',64),'received_unverified',encode(convert_to('%PDF-1.4 UNVERIFIED RECEIPT','UTF8'),'base64'));
 y:=public.firmar_workspace_list_v1(pg_temp.ctx(),body||'{"filter":"received"}');PERFORM pg_temp.check('received category remains explicitly unverified',y#>>'{documents,0,state}'='received_unverified' AND (y#>>'{counts,received}')::int=1);
 x:=public.firmar_workspace_source_v1(pg_temp.ctx(),r.id,1,hash);PERFORM pg_temp.check('review route never substitutes returned candidate',decode(x->>'pdfBase64','base64')=r.source_pdf);
 PERFORM public.firmar_attempt_operation_v1(pg_temp.ctx(),'cancel',jsonb_build_object('requestId',r.id));
 y:=public.firmar_workspace_list_v1(pg_temp.ctx(),body||'{"filter":"cancelled"}');PERFORM pg_temp.check('cancelled remains in authorized history without review action',y#>>'{documents,0,state}'='cancelled' AND y#>>'{documents,0,canReview}'='false');
 PERFORM pg_temp.denied('cancelled source is no longer offered for signature',format('SELECT public.firmar_workspace_source_v1(%L,%L,1,%L)',pg_temp.ctx(),r.id,hash),'FIRMAR_REQUEST_CANCELLED');
 UPDATE public.firmar_signing_authority SET status='revoked' WHERE membership_id='11111111-1111-4111-8111-111111111111';
 x:=public.firmar_workspace_list_v1(pg_temp.ctx(),body);PERFORM pg_temp.check('revoked authority removes all previously visible rows',(x#>>'{counts,all}')::int=0);
 UPDATE public.firmar_signing_authority SET status='active',version=2 WHERE membership_id='11111111-1111-4111-8111-111111111111';
 x:=public.firmar_workspace_list_v1(pg_temp.ctx(),body);PERFORM pg_temp.check('changed authority cannot silently grant access to old source',(x#>>'{counts,all}')::int=0);
 UPDATE public.tenant_identity_session SET status='revoked' WHERE id='11111111-1111-4111-8111-111111111111';
 PERFORM pg_temp.denied('revoked session cannot read counts',format('SELECT public.firmar_workspace_list_v1(%L,%L)',pg_temp.ctx(),body),'FIRMAR_SESSION_INVALID');
 PERFORM pg_temp.check('only read facades exposed to runtime',has_function_privilege('municontrol_actions_runtime_app','public.firmar_workspace_list_v1(jsonb,jsonb)','EXECUTE') AND has_function_privilege('municontrol_actions_runtime_app','public.firmar_workspace_source_v1(jsonb,uuid,integer,text)','EXECUTE') AND NOT has_table_privilege('municontrol_actions_runtime_app','public.firmar_signing_request','SELECT'));
END $$;
SELECT json_build_object('ok',true,'checks',(SELECT count(*) FROM workspace_checks),'labels',(SELECT json_agg(label ORDER BY label) FROM workspace_checks),'database','disposable_postgresql','realMunicipalData',false,'realProviderRequests',0,'realSignatures',0,'officialEmissionEnabled',false,'rolledBack',true);
