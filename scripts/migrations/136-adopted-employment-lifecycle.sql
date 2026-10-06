-- Integration draft, local synthetic QA only. Requires 110/133/135.
-- Exact contract UUID and approved adoption ledger; no TXT/DNI resolver.
-- Existing v1 entrypoints, pending payloads, IAM and adoption grants stay intact.
-- First install only. Repetition/durability protocol must precede publication.
DO $prerequisite$ BEGIN
 IF to_regprocedure('public.native_employee_read_projection_v1(jsonb,uuid)') IS NULL
 OR to_regprocedure('public.native_employment_lifecycle_review_v1(jsonb,jsonb,uuid)') IS NULL
 OR to_regclass('public.employment_adoption_application') IS NULL
 THEN RAISE EXCEPTION 'ADOPTED_LIFECYCLE_PREREQUISITE'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_employment_lifecycle_adopted_%')
 THEN RAISE EXCEPTION 'ADOPTED_LIFECYCLE_ALREADY_INSTALLED'; END IF;
END $prerequisite$;

-- Reuse the existing explicit employment link after approved adoption. Session,
-- capabilities and tenant binding are still checked by the original guard.
CREATE FUNCTION public.native_employment_lifecycle_adopted_context_v2(p jsonb,required_capability text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;linked uuid;person_value uuid;proof jsonb;actor_label text;
BEGIN
 ctx:=public.native_employee_context_v1(p);
 IF required_capability IS NOT NULL AND (required_capability NOT IN('employee.record.propose','employee.record.approve') OR NOT public.action_center_context_has_capability(ctx,required_capability)) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_FORBIDDEN'; END IF;
 IF ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN
  SELECT c.id,c.person_id INTO linked,person_value FROM public.tenant_action_employment_link l
  JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.source_system='MUNICONTROL' AND c.tenant_id=l.tenant_id AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
  JOIN public.native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=l.tenant_id AND n.source_binding_id=l.source_binding_id AND n.id::text=c.source_payload#>>'{native,registrationId}'
  JOIN public.employment_adoption_application a ON a.contract_id=c.id AND a.registration_id=n.id AND a.before_person->>'id'=c.person_id::text
  JOIN public.employment_adoption_decision d ON d.id=a.decision_id AND d.decision='approve' AND d.tenant_id=l.tenant_id AND d.source_binding_id=l.source_binding_id
  JOIN public.person_identity i ON i.id=c.person_id AND i.identity_state IN('active','provisional')
  WHERE l.active AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid AND l.source_binding_id=(ctx->>'sourceBindingId')::uuid FOR SHARE OF l,c,n,a,d,i;
  IF FOUND THEN
   proof:=public.native_employee_read_projection_v1(p,linked);
   IF proof#>>'{contract,status}'='active' THEN ctx:=ctx||jsonb_build_object('actorPersonId',person_value,'employmentContractId',linked); END IF;
  END IF;
 END IF;
 IF required_capability IS NOT NULL AND (ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_EMPLOYMENT_REQUIRED'; END IF;
 SELECT full_name INTO actor_label FROM public.person_identity WHERE id=(ctx->>'actorPersonId')::uuid;
 RETURN ctx||jsonb_build_object('actorEmail',lower(btrim(p->>'actorEmail')),'actorLabel',left(coalesce(nullif(btrim(actor_label),''),'Responsable municipal'),160));
END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_date_v2(raw text) RETURNS date
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE result date;
BEGIN
 IF raw IS NULL THEN RETURN NULL; END IF;
 IF raw!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID'; END IF;
 result:=raw::date;
 IF to_char(result,'YYYY-MM-DD')<>raw OR result NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID'; END IF;
 RETURN result;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID'; END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_subject_v2(ctx jsonb,target uuid,p jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE proof jsonb;c public.employment_contract;i public.person_identity;n public.native_employee_registration;token text;
BEGIN
 -- Only the verified current ownership reader can admit an adopted contract.
 proof:=public.native_employee_read_projection_v1(p,target);
 IF proof#>>'{contract,recordKind}' IS DISTINCT FROM 'adopted' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 SELECT * INTO STRICT c FROM public.employment_contract WHERE id=target;
 SELECT * INTO STRICT i FROM public.person_identity WHERE id=c.person_id;
 SELECT * INTO STRICT n FROM public.native_employee_registration WHERE id=(proof#>>'{contract,registrationId}')::uuid;
 IF i.identity_state NOT IN('active','provisional') OR i.full_name IS NULL OR length(btrim(i.full_name)) NOT BETWEEN 1 AND 160
 OR c.legacy_legajo IS NULL OR length(c.legacy_legajo) NOT BETWEEN 1 AND 64 OR c.legacy_legajo~'[[:cntrl:]]'
 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_IDENTITY_CHANGED'; END IF;
 token:=encode(sha256(convert_to(jsonb_build_object('domain','adopted-lifecycle-identity.v2','tenant',c.tenant_id,'binding',n.source_binding_id,
 'contractId',c.id,'legajo',c.legacy_legajo,'registration',to_jsonb(n),'adoption',c.source_payload->'native',
 'person',to_jsonb(i)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex');
 RETURN jsonb_build_object('contractId',c.id,'legajo',c.legacy_legajo,'employeeName',i.full_name,'identityToken',token,'sourceCutoff',NULL,
 'origin','MUNICONTROL','registrationId',n.id,'registeredAt',n.created_at,'recordKind','adopted');
END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_state_v2(ctx jsonb,target uuid,subject jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE canonical_row jsonb;snapshot jsonb;revision_value integer;applied_at timestamptz;rows_value jsonb;verified boolean:=true;
 today date:=(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;state_value text;
BEGIN
 SELECT to_jsonb(ec) INTO canonical_row FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(ctx->>'tenantId')::uuid AND ec.source_system='MUNICONTROL';
 IF canonical_row IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 SELECT r.revision,r.reviewed_at,r.after_contract->'intervals' INTO revision_value,applied_at,rows_value FROM public.native_employment_lifecycle_review r
 WHERE r.contract_id=target AND r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid AND r.decision='approve' ORDER BY r.revision DESC LIMIT 1;
 revision_value:=coalesce(revision_value,0);
 IF rows_value IS NULL THEN
  verified:=canonical_row->>'start_date' IS NOT NULL AND canonical_row->>'status' IN('active','inactive')
   AND (canonical_row->>'end_date' IS NULL OR (canonical_row->>'end_date')::date>=(canonical_row->>'start_date')::date)
   AND (canonical_row->>'status'<>'inactive' OR canonical_row->>'end_date' IS NOT NULL);
  rows_value:=CASE WHEN verified THEN jsonb_build_array(jsonb_build_object('startDate',canonical_row->>'start_date','endDate',canonical_row->>'end_date')) ELSE '[]'::jsonb END;
 END IF;
 IF verified THEN rows_value:=public.native_employment_lifecycle_adopted_intervals_v2(rows_value);state_value:=public.native_employment_lifecycle_adopted_activity_v2(rows_value,today);
 ELSE state_value:=CASE WHEN canonical_row->>'status' IN('inactive','state_error') THEN canonical_row->>'status' ELSE 'unknown' END; END IF;
 snapshot:=jsonb_build_object('contract',canonical_row,'intervals',rows_value);
 RETURN jsonb_build_object('version',public.native_employment_lifecycle_version_v1(snapshot,subject,revision_value),'revision',revision_value,'appliedAt',applied_at,
 'intervals',rows_value,'today',to_char(today,'YYYY-MM-DD'),'status',state_value,'datesVerified',verified);
END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_intervals_v2(rows_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE item jsonb; first_date date; last_date date; previous_end date; ordinal integer:=0;
BEGIN
 IF jsonb_typeof(rows_value) IS DISTINCT FROM 'array' OR jsonb_array_length(rows_value) NOT BETWEEN 1 AND 51 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(rows_value) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(item) k) IS DISTINCT FROM ARRAY['endDate','startDate']::text[] OR jsonb_typeof(item->'startDate') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'endDate') NOT IN ('string','null') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID'; END IF;
  first_date:=public.native_employment_lifecycle_adopted_date_v2(item->>'startDate'); last_date:=public.native_employment_lifecycle_adopted_date_v2(item->>'endDate');
  IF first_date IS NULL OR (last_date IS NOT NULL AND last_date<first_date) OR (ordinal>0 AND (previous_end IS NULL OR first_date<=previous_end)) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID'; END IF;
  ordinal:=ordinal+1; previous_end:=last_date;
 END LOOP;
 RETURN rows_value;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE 'NATIVE_EMPLOYMENT_LIFECYCLE_%' THEN RAISE; END IF; RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID';
END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_activity_v2(rows_value jsonb,today date) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(public.native_employment_lifecycle_adopted_intervals_v2(rows_value)) r WHERE (r->>'startDate')::date<=today AND (r->>'endDate' IS NULL OR (r->>'endDate')::date>=today)) THEN 'active' WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(rows_value) r WHERE (r->>'startDate')::date>today) THEN 'pending_start' ELSE 'inactive' END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_after_v2(before_row jsonb,movement text,event_date date) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE rows_value jsonb; last_row jsonb; n integer;
BEGIN
 rows_value:=public.native_employment_lifecycle_adopted_intervals_v2(before_row->'intervals'); n:=jsonb_array_length(rows_value); last_row:=rows_value->(n-1);
 IF event_date IS NULL OR event_date NOT BETWEEN DATE '1900-01-01' AND DATE '2099-12-31' OR movement IS NULL OR movement NOT IN ('terminate','reenter') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID'; END IF;
 IF movement='terminate' THEN
  IF last_row->>'endDate' IS NOT NULL OR event_date<(last_row->>'startDate')::date THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID'; END IF;
  rows_value:=jsonb_set(rows_value,ARRAY[(n-1)::text,'endDate'],to_jsonb(to_char(event_date,'YYYY-MM-DD')),false);
 ELSE
  IF last_row->>'endDate' IS NULL OR event_date<=(last_row->>'endDate')::date THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID'; END IF;
  IF n>=51 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT'; END IF;
  rows_value:=rows_value||jsonb_build_array(jsonb_build_object('startDate',to_char(event_date,'YYYY-MM-DD'),'endDate',NULL));
 END IF;
 RETURN before_row||jsonb_build_object('intervals',public.native_employment_lifecycle_adopted_intervals_v2(rows_value));
END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_bootstrap_v2(ctx jsonb,contract_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb; proposals jsonb; total integer;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx); PERFORM public.native_employment_lifecycle_lock_v1(c,contract_id); subject:=public.native_employment_lifecycle_adopted_subject_v2(c,contract_id,ctx);
 SELECT count(*) INTO total FROM public.native_employment_lifecycle_proposal p WHERE p.contract_id=native_employment_lifecycle_adopted_bootstrap_v2.contract_id AND p.tenant_id=(c->>'tenantId')::uuid AND p.source_binding_id=(c->>'sourceBindingId')::uuid;
 SELECT coalesce(jsonb_agg(public.native_employment_lifecycle_summary_v1(c,p) ORDER BY p.created_at DESC,p.id DESC),'[]') INTO proposals FROM public.native_employment_lifecycle_proposal p WHERE p.id IN (SELECT q.id FROM public.native_employment_lifecycle_proposal q WHERE q.contract_id=native_employment_lifecycle_adopted_bootstrap_v2.contract_id AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid ORDER BY q.created_at DESC,q.id DESC LIMIT 20);
 RETURN jsonb_build_object('version','native-employment-lifecycle.v2','scopeVersion',public.native_employment_lifecycle_scope_v1(c,subject),'subject',subject,'employment',public.native_employment_lifecycle_adopted_state_v2(c,contract_id,subject),
  'permissions',jsonb_build_object('canPropose',(public.native_employment_lifecycle_adopted_state_v2(c,contract_id,subject)->>'datesVerified')::boolean AND public.action_center_context_has_capability(c,'employee.record.propose') AND c->>'actorPersonId' IS NOT NULL AND c->>'employmentContractId' IS NOT NULL,'canReview',public.action_center_context_has_capability(c,'employee.record.approve') AND c->>'actorPersonId' IS NOT NULL AND c->>'employmentContractId' IS NOT NULL),'proposals',proposals,'historyTruncated',total>20);
END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_proposal_v2(ctx jsonb,contract_id uuid,id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; p public.native_employment_lifecycle_proposal; review_value jsonb; summary_value jsonb;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx); PERFORM public.native_employment_lifecycle_adopted_subject_v2(c,contract_id,ctx);
 SELECT q.* INTO p FROM public.native_employment_lifecycle_proposal q WHERE q.id=native_employment_lifecycle_adopted_proposal_v2.id AND q.contract_id=native_employment_lifecycle_adopted_proposal_v2.contract_id AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 -- STABLE summary and its review share one statement snapshot under READ COMMITTED.
 SELECT public.native_employment_lifecycle_summary_v1(c,p),
  (SELECT jsonb_build_object('decision',r.decision,'reason',r.reason,'reviewedAt',r.reviewed_at,'reviewerLabel',r.reviewer_label) FROM public.native_employment_lifecycle_review r WHERE r.proposal_id=p.id)
 INTO summary_value,review_value;
 RETURN jsonb_build_object('version','native-employment-lifecycle.v2','proposal',summary_value||jsonb_build_object('contractId',p.contract_id,'subject',p.subject,'before',public.native_employment_lifecycle_display_v1(p.before_contract),'after',public.native_employment_lifecycle_display_v1(p.after_contract),'review',review_value));
END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_propose_v2(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 before_row jsonb; after_row jsonb; values_value jsonb; reason_value text; reference_value text; proposal_id uuid:=gen_random_uuid(); receipt_value jsonb;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx,'employee.record.propose');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['baseVersion','contractId','date','identityToken','legalReference','movement','reason','scopeVersion']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR body->>'identityToken'!~'^[a-f0-9]{64}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; IF body->>'movement' NOT IN ('terminate','reenter') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF; BEGIN values_value:=to_jsonb(public.payroll_fixed_registry_date_v1(body->>'date')); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END;
 reason_value:=normalize(btrim(body->>'reason'),NFC); reference_value:=normalize(btrim(body->>'legalReference'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' OR length(reference_value) NOT BETWEEN 3 AND 180 OR reference_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'reason',reason_value,'legalReference',reference_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-lifecycle.v2','operation','propose','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_lifecycle_lock_v1(c,target); replay:=public.native_employment_lifecycle_replay_v1(c,target,key,'propose',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO before_row FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 subject:=public.native_employment_lifecycle_adopted_subject_v2(c,target,ctx);
 IF body->>'identityToken' IS DISTINCT FROM subject->>'identityToken' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_IDENTITY_CHANGED'; END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_lifecycle_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_SCOPE_CHANGED'; END IF;
 current_value:=public.native_employment_lifecycle_adopted_state_v2(c,target,subject);
 IF NOT (current_value->>'datesVerified')::boolean THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_REQUIRED'; END IF;
 IF body->>'baseVersion' IS DISTINCT FROM current_value->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED'; END IF;
 before_row:=jsonb_build_object('contract',before_row,'intervals',current_value->'intervals');
 after_row:=public.native_employment_lifecycle_adopted_after_v2(before_row,body->>'movement',(body->>'date')::date);
 IF before_row=after_row THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NO_CHANGE'; END IF;
 IF (SELECT count(*) FROM public.native_employment_lifecycle_proposal WHERE contract_id=target)>=100 OR (SELECT count(*) FROM public.native_employment_lifecycle_proposal WHERE tenant_id=(c->>'tenantId')::uuid AND source_binding_id=(c->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT'; END IF;
 PERFORM public.native_employment_lifecycle_capacity_v1(octet_length(before_row::text)+octet_length(after_row::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-lifecycle.v2','operation','propose','contractId',target,'proposalId',proposal_id,'status','pending','employmentVersion',current_value->>'version','revision',(current_value->>'revision')::integer,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_lifecycle_proposal(id,tenant_id,source_binding_id,contract_id,registration_id,subject,base_revision,base_version,movement,movement_date,before_contract,after_contract,reason,legal_reference,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,author_label,request_key,request_sha256,receipt)
 VALUES(proposal_id,(c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,(subject->>'registrationId')::uuid,subject,(current_value->>'revision')::integer,current_value->>'version',body->>'movement',(body->>'date')::date,before_row,after_row,reason_value,reference_value,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BUSY'; END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_review_v2(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 p public.native_employment_lifecycle_proposal; snapshot jsonb; reason_value text; decision_value text; revision_value integer; version_value text; receipt_value jsonb;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx,'employee.record.approve');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['contractId','decision','proposalId','reason','scopeVersion']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'proposalId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR body->>'decision' NOT IN ('approve','reject') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; decision_value:=body->>'decision'; reason_value:=normalize(btrim(body->>'reason'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'proposalId',(body->>'proposalId')::uuid,'reason',reason_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-lifecycle.v2','operation','review','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_lifecycle_lock_v1(c,target); replay:=public.native_employment_lifecycle_replay_v1(c,target,key,'review',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO snapshot FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 subject:=public.native_employment_lifecycle_adopted_subject_v2(c,target,ctx);
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_lifecycle_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_SCOPE_CHANGED'; END IF;
 SELECT q.* INTO p FROM public.native_employment_lifecycle_proposal q WHERE q.id=(body->>'proposalId')::uuid AND q.contract_id=target AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_lifecycle_review WHERE proposal_id=p.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DECIDED'; END IF;
 IF NOT public.native_employment_lifecycle_can_review_v1(c,p) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_MAKER_CHECKER_REQUIRED'; END IF;
 IF p.subject IS DISTINCT FROM subject THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_IDENTITY_CHANGED'; END IF;
 current_value:=public.native_employment_lifecycle_adopted_state_v2(c,target,subject); revision_value:=(current_value->>'revision')::integer; version_value:=current_value->>'version';
 snapshot:=jsonb_build_object('contract',snapshot,'intervals',current_value->'intervals');
 IF decision_value='approve' THEN
  IF NOT (current_value->>'datesVerified')::boolean THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DATES_REQUIRED'; END IF;
  IF p.base_version<>version_value OR p.base_revision<>revision_value OR snapshot<>p.before_contract THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED'; END IF;
  IF p.after_contract IS DISTINCT FROM public.native_employment_lifecycle_adopted_after_v2(snapshot,p.movement,p.movement_date) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED'; END IF;
  IF revision_value>=100 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT'; END IF;
  revision_value:=revision_value+1; version_value:=public.native_employment_lifecycle_version_v1(p.after_contract,subject,revision_value);
 END IF;
 PERFORM public.native_employment_lifecycle_capacity_v1(octet_length(p.before_contract::text)+octet_length(p.after_contract::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-lifecycle.v2','operation','review','contractId',target,'proposalId',p.id,'status',CASE decision_value WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'employmentVersion',version_value,'revision',revision_value,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_lifecycle_review(tenant_id,source_binding_id,contract_id,proposal_id,decision,reason,revision,employment_version,applied_xid,before_contract,after_contract,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt)
 VALUES((c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,p.id,decision_value,reason_value,revision_value,version_value,CASE WHEN decision_value='approve' THEN pg_current_xact_id() END,CASE WHEN decision_value='approve' THEN p.before_contract END,CASE WHEN decision_value='approve' THEN p.after_contract END,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BUSY'; END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_read_v2(ctx jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb;
BEGIN c:=public.native_employment_lifecycle_adopted_context_v2(ctx); PERFORM public.native_employment_lifecycle_lock_v1(c,target); subject:=public.native_employment_lifecycle_adopted_subject_v2(c,target,ctx); RETURN public.native_employment_lifecycle_adopted_state_v2(c,target,subject);
END $$;

CREATE FUNCTION public.native_employment_lifecycle_adopted_projection_v2(ctx jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE state_value jsonb; interval_value jsonb; today date;
BEGIN state_value:=public.native_employment_lifecycle_adopted_read_v2(ctx,target); today:=(state_value->>'today')::date;
 SELECT value INTO interval_value FROM jsonb_array_elements(state_value->'intervals') WHERE (value->>'startDate')::date<=today AND (value->>'endDate' IS NULL OR (value->>'endDate')::date>=today) ORDER BY value->>'startDate' DESC LIMIT 1;
 IF interval_value IS NULL THEN SELECT value INTO interval_value FROM jsonb_array_elements(state_value->'intervals') WHERE (value->>'startDate')::date>today ORDER BY value->>'startDate' LIMIT 1; END IF;
 interval_value:=coalesce(interval_value,(state_value->'intervals')->-1);
 RETURN interval_value||jsonb_build_object('status',state_value->>'status');
END $$;


-- Fresh-hire transport/receipts/fingerprints remain v1. Only the authenticated
-- actor bridge is shared with adopted contracts; old RPCs remain untouched.
CREATE FUNCTION public.native_employment_lifecycle_fresh_bootstrap_v2(ctx jsonb,contract_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb; proposals jsonb; total integer;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx); PERFORM public.native_employment_lifecycle_lock_v1(c,contract_id); subject:=public.native_employment_lifecycle_subject_v1(c,contract_id);
 SELECT count(*) INTO total FROM public.native_employment_lifecycle_proposal p WHERE p.contract_id=native_employment_lifecycle_fresh_bootstrap_v2.contract_id AND p.tenant_id=(c->>'tenantId')::uuid AND p.source_binding_id=(c->>'sourceBindingId')::uuid;
 SELECT coalesce(jsonb_agg(public.native_employment_lifecycle_summary_v1(c,p) ORDER BY p.created_at DESC,p.id DESC),'[]') INTO proposals FROM public.native_employment_lifecycle_proposal p WHERE p.id IN (SELECT q.id FROM public.native_employment_lifecycle_proposal q WHERE q.contract_id=native_employment_lifecycle_fresh_bootstrap_v2.contract_id AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid ORDER BY q.created_at DESC,q.id DESC LIMIT 20);
 RETURN jsonb_build_object('version','native-employment-lifecycle.v1','scopeVersion',public.native_employment_lifecycle_scope_v1(c,subject),'subject',subject,'employment',public.native_employment_lifecycle_state_v1(c,contract_id,subject),
  'permissions',jsonb_build_object('canPropose',public.action_center_context_has_capability(c,'employee.record.propose') AND c->>'actorPersonId' IS NOT NULL AND c->>'employmentContractId' IS NOT NULL,'canReview',public.action_center_context_has_capability(c,'employee.record.approve') AND c->>'actorPersonId' IS NOT NULL AND c->>'employmentContractId' IS NOT NULL),'proposals',proposals,'historyTruncated',total>20);
END $$;
REVOKE ALL ON FUNCTION public.native_employment_lifecycle_fresh_bootstrap_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.native_employment_lifecycle_fresh_proposal_v2(ctx jsonb,contract_id uuid,id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; p public.native_employment_lifecycle_proposal; review_value jsonb; summary_value jsonb;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx); PERFORM public.native_employment_lifecycle_subject_v1(c,contract_id);
 SELECT q.* INTO p FROM public.native_employment_lifecycle_proposal q WHERE q.id=native_employment_lifecycle_fresh_proposal_v2.id AND q.contract_id=native_employment_lifecycle_fresh_proposal_v2.contract_id AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 -- STABLE summary and its review share one statement snapshot under READ COMMITTED.
 SELECT public.native_employment_lifecycle_summary_v1(c,p),
  (SELECT jsonb_build_object('decision',r.decision,'reason',r.reason,'reviewedAt',r.reviewed_at,'reviewerLabel',r.reviewer_label) FROM public.native_employment_lifecycle_review r WHERE r.proposal_id=p.id)
 INTO summary_value,review_value;
 RETURN jsonb_build_object('version','native-employment-lifecycle.v1','proposal',summary_value||jsonb_build_object('contractId',p.contract_id,'subject',p.subject,'before',public.native_employment_lifecycle_display_v1(p.before_contract),'after',public.native_employment_lifecycle_display_v1(p.after_contract),'review',review_value));
END $$;
REVOKE ALL ON FUNCTION public.native_employment_lifecycle_fresh_proposal_v2(jsonb,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.native_employment_lifecycle_fresh_propose_v2(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 before_row jsonb; after_row jsonb; values_value jsonb; reason_value text; reference_value text; proposal_id uuid:=gen_random_uuid(); receipt_value jsonb;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx,'employee.record.propose');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['baseVersion','contractId','date','identityToken','legalReference','movement','reason','scopeVersion']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR body->>'identityToken'!~'^[a-f0-9]{64}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; IF body->>'movement' NOT IN ('terminate','reenter') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF; BEGIN values_value:=to_jsonb(public.payroll_fixed_registry_date_v1(body->>'date')); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END;
 reason_value:=normalize(btrim(body->>'reason'),NFC); reference_value:=normalize(btrim(body->>'legalReference'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' OR length(reference_value) NOT BETWEEN 3 AND 180 OR reference_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'reason',reason_value,'legalReference',reference_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-lifecycle.v1','operation','propose','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_lifecycle_lock_v1(c,target); replay:=public.native_employment_lifecycle_replay_v1(c,target,key,'propose',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO before_row FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 subject:=public.native_employment_lifecycle_subject_v1(c,target);
 IF body->>'identityToken' IS DISTINCT FROM subject->>'identityToken' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_IDENTITY_CHANGED'; END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_lifecycle_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_SCOPE_CHANGED'; END IF;
 current_value:=public.native_employment_lifecycle_state_v1(c,target,subject);
 IF body->>'baseVersion' IS DISTINCT FROM current_value->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED'; END IF;
 before_row:=jsonb_build_object('contract',before_row,'intervals',current_value->'intervals');
 after_row:=public.native_employment_lifecycle_after_v1(before_row,body->>'movement',(body->>'date')::date);
 IF before_row=after_row THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NO_CHANGE'; END IF;
 IF (SELECT count(*) FROM public.native_employment_lifecycle_proposal WHERE contract_id=target)>=100 OR (SELECT count(*) FROM public.native_employment_lifecycle_proposal WHERE tenant_id=(c->>'tenantId')::uuid AND source_binding_id=(c->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT'; END IF;
 PERFORM public.native_employment_lifecycle_capacity_v1(octet_length(before_row::text)+octet_length(after_row::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-lifecycle.v1','operation','propose','contractId',target,'proposalId',proposal_id,'status','pending','employmentVersion',current_value->>'version','revision',(current_value->>'revision')::integer,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_lifecycle_proposal(id,tenant_id,source_binding_id,contract_id,registration_id,subject,base_revision,base_version,movement,movement_date,before_contract,after_contract,reason,legal_reference,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,author_label,request_key,request_sha256,receipt)
 VALUES(proposal_id,(c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,(subject->>'registrationId')::uuid,subject,(current_value->>'revision')::integer,current_value->>'version',body->>'movement',(body->>'date')::date,before_row,after_row,reason_value,reference_value,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BUSY'; END $$;
REVOKE ALL ON FUNCTION public.native_employment_lifecycle_fresh_propose_v2(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.native_employment_lifecycle_fresh_review_v2(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 p public.native_employment_lifecycle_proposal; snapshot jsonb; reason_value text; decision_value text; revision_value integer; version_value text; receipt_value jsonb;
BEGIN
 c:=public.native_employment_lifecycle_adopted_context_v2(ctx,'employee.record.approve');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['contractId','decision','proposalId','reason','scopeVersion']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'proposalId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR body->>'decision' NOT IN ('approve','reject') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; decision_value:=body->>'decision'; reason_value:=normalize(btrim(body->>'reason'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'proposalId',(body->>'proposalId')::uuid,'reason',reason_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-lifecycle.v1','operation','review','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_lifecycle_lock_v1(c,target); replay:=public.native_employment_lifecycle_replay_v1(c,target,key,'review',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO snapshot FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 subject:=public.native_employment_lifecycle_subject_v1(c,target);
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_lifecycle_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_SCOPE_CHANGED'; END IF;
 SELECT q.* INTO p FROM public.native_employment_lifecycle_proposal q WHERE q.id=(body->>'proposalId')::uuid AND q.contract_id=target AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_lifecycle_review WHERE proposal_id=p.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_DECIDED'; END IF;
 IF NOT public.native_employment_lifecycle_can_review_v1(c,p) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_MAKER_CHECKER_REQUIRED'; END IF;
 IF p.subject IS DISTINCT FROM subject THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_IDENTITY_CHANGED'; END IF;
 current_value:=public.native_employment_lifecycle_state_v1(c,target,subject); revision_value:=(current_value->>'revision')::integer; version_value:=current_value->>'version';
 snapshot:=jsonb_build_object('contract',snapshot,'intervals',current_value->'intervals');
 IF decision_value='approve' THEN
  IF p.base_version<>version_value OR p.base_revision<>revision_value OR snapshot<>p.before_contract THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED'; END IF;
  IF p.after_contract IS DISTINCT FROM public.native_employment_lifecycle_after_v1(snapshot,p.movement,p.movement_date) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BASE_CHANGED'; END IF;
  IF revision_value>=100 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_LIMIT'; END IF;
  revision_value:=revision_value+1; version_value:=public.native_employment_lifecycle_version_v1(p.after_contract,subject,revision_value);
 END IF;
 PERFORM public.native_employment_lifecycle_capacity_v1(octet_length(p.before_contract::text)+octet_length(p.after_contract::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-lifecycle.v1','operation','review','contractId',target,'proposalId',p.id,'status',CASE decision_value WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'employmentVersion',version_value,'revision',revision_value,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_lifecycle_review(tenant_id,source_binding_id,contract_id,proposal_id,decision,reason,revision,employment_version,applied_xid,before_contract,after_contract,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt)
 VALUES((c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,p.id,decision_value,reason_value,revision_value,version_value,CASE WHEN decision_value='approve' THEN pg_current_xact_id() END,CASE WHEN decision_value='approve' THEN p.before_contract END,CASE WHEN decision_value='approve' THEN p.after_contract END,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_BUSY'; END $$;
REVOKE ALL ON FUNCTION public.native_employment_lifecycle_fresh_review_v2(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.native_employment_lifecycle_fresh_read_v2(ctx jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb;
BEGIN c:=public.native_employment_lifecycle_adopted_context_v2(ctx); PERFORM public.native_employment_lifecycle_lock_v1(c,target); subject:=public.native_employment_lifecycle_subject_v1(c,target); RETURN public.native_employment_lifecycle_state_v1(c,target,subject);
END $$;
REVOKE ALL ON FUNCTION public.native_employment_lifecycle_fresh_read_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.native_employment_lifecycle_fresh_projection_v2(ctx jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE state_value jsonb; interval_value jsonb; today date;
BEGIN state_value:=public.native_employment_lifecycle_fresh_read_v2(ctx,target); today:=(state_value->>'today')::date;
 SELECT value INTO interval_value FROM jsonb_array_elements(state_value->'intervals') WHERE (value->>'startDate')::date<=today AND (value->>'endDate' IS NULL OR (value->>'endDate')::date>=today) ORDER BY value->>'startDate' DESC LIMIT 1;
 IF interval_value IS NULL THEN SELECT value INTO interval_value FROM jsonb_array_elements(state_value->'intervals') WHERE (value->>'startDate')::date>today ORDER BY value->>'startDate' LIMIT 1; END IF;
 interval_value:=coalesce(interval_value,(state_value->'intervals')->-1);
 RETURN interval_value||jsonb_build_object('status',state_value->>'status');
END $$;
REVOKE ALL ON FUNCTION public.native_employment_lifecycle_fresh_projection_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.native_employment_lifecycle_bootstrap_v2(ctx jsonb,contract_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority jsonb;target uuid;adopted boolean;
BEGIN
 authority:=public.native_employment_lifecycle_adopted_context_v2(ctx);
 target:=contract_id;
 SELECT (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId' INTO adopted
 FROM public.employment_contract c WHERE c.id=target AND c.tenant_id=(authority->>'tenantId')::uuid AND c.legacy_company_id=(authority->>'sourceCompanyId')::bigint AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF adopted THEN RETURN public.native_employment_lifecycle_adopted_bootstrap_v2(ctx,contract_id); END IF;
 RETURN public.native_employment_lifecycle_fresh_bootstrap_v2(ctx,contract_id);
END $$;

CREATE FUNCTION public.native_employment_lifecycle_proposal_v2(ctx jsonb,contract_id uuid,id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority jsonb;target uuid;adopted boolean;
BEGIN
 authority:=public.native_employment_lifecycle_adopted_context_v2(ctx);
 target:=contract_id;
 SELECT (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId' INTO adopted
 FROM public.employment_contract c WHERE c.id=target AND c.tenant_id=(authority->>'tenantId')::uuid AND c.legacy_company_id=(authority->>'sourceCompanyId')::bigint AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF adopted THEN RETURN public.native_employment_lifecycle_adopted_proposal_v2(ctx,contract_id,id); END IF;
 RETURN public.native_employment_lifecycle_fresh_proposal_v2(ctx,contract_id,id);
END $$;

CREATE FUNCTION public.native_employment_lifecycle_propose_v2(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority jsonb;target uuid;adopted boolean;
BEGIN
 authority:=public.native_employment_lifecycle_adopted_context_v2(ctx,'employee.record.propose');
 target:=(body->>'contractId')::uuid;
 SELECT (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId' INTO adopted
 FROM public.employment_contract c WHERE c.id=target AND c.tenant_id=(authority->>'tenantId')::uuid AND c.legacy_company_id=(authority->>'sourceCompanyId')::bigint AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF adopted THEN RETURN public.native_employment_lifecycle_adopted_propose_v2(ctx,body,key); END IF;
 RETURN public.native_employment_lifecycle_fresh_propose_v2(ctx,body,key);
END $$;

CREATE FUNCTION public.native_employment_lifecycle_review_v2(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority jsonb;target uuid;adopted boolean;
BEGIN
 authority:=public.native_employment_lifecycle_adopted_context_v2(ctx,'employee.record.approve');
 target:=(body->>'contractId')::uuid;
 SELECT (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId' INTO adopted
 FROM public.employment_contract c WHERE c.id=target AND c.tenant_id=(authority->>'tenantId')::uuid AND c.legacy_company_id=(authority->>'sourceCompanyId')::bigint AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF adopted THEN RETURN public.native_employment_lifecycle_adopted_review_v2(ctx,body,key); END IF;
 RETURN public.native_employment_lifecycle_fresh_review_v2(ctx,body,key);
END $$;

CREATE FUNCTION public.native_employment_lifecycle_attempt_v2(ctx jsonb,contract_id uuid,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority jsonb;target uuid;adopted boolean;
BEGIN
 authority:=public.native_employment_lifecycle_adopted_context_v2(ctx);
 DECLARE result jsonb;BEGIN result:=public.native_employment_lifecycle_replay_v1(authority,contract_id,key);IF result IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND';END IF;RETURN result;END;
END $$;

CREATE FUNCTION public.native_employment_lifecycle_read_v2(ctx jsonb,contract_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority jsonb;target uuid;adopted boolean;
BEGIN
 authority:=public.native_employment_lifecycle_adopted_context_v2(ctx);
 target:=contract_id;
 SELECT (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId' INTO adopted
 FROM public.employment_contract c WHERE c.id=target AND c.tenant_id=(authority->>'tenantId')::uuid AND c.legacy_company_id=(authority->>'sourceCompanyId')::bigint AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF adopted THEN RETURN public.native_employment_lifecycle_adopted_read_v2(ctx,contract_id); END IF;
 RETURN public.native_employment_lifecycle_fresh_read_v2(ctx,contract_id);
END $$;

CREATE FUNCTION public.native_employment_lifecycle_projection_v2(ctx jsonb,contract_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE authority jsonb;target uuid;adopted boolean;
BEGIN
 authority:=public.native_employment_lifecycle_adopted_context_v2(ctx);
 target:=contract_id;
 SELECT (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId' INTO adopted
 FROM public.employment_contract c WHERE c.id=target AND c.tenant_id=(authority->>'tenantId')::uuid AND c.legacy_company_id=(authority->>'sourceCompanyId')::bigint AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND'; END IF;
 IF adopted THEN RETURN public.native_employment_lifecycle_adopted_projection_v2(ctx,contract_id); END IF;
 RETURN public.native_employment_lifecycle_fresh_projection_v2(ctx,contract_id);
END $$;

DO $reader_pin$ DECLARE p pg_proc;BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.native_employee_read_projection_v1(jsonb,uuid)');
 IF p.proowner<>current_user::regrole OR NOT p.prosecdef OR p.prorettype<>'jsonb'::regtype OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']
 OR encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>'1498261e41640f1d07ea3f62ccf57d3d53c159b8637af17404b15119f1bc986b'
 OR NOT has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE')
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND (a.grantee<>'municontrol_actions_runtime_app'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable))
 THEN RAISE EXCEPTION 'ADOPTED_LIFECYCLE_READER_CHANGED'; END IF;
END $reader_pin$;
CREATE OR REPLACE FUNCTION public.native_employee_read_projection_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;c public.employment_contract;i public.person_identity;n public.native_employee_registration;
 a public.employment_adoption_application;d public.employment_adoption_decision;r public.employment_adoption_proposal;
 projection jsonb;periods jsonb;chosen jsonb;kind text:='hire';state_value text;today date:=(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
 ctx:=public.native_employee_context_v1(p);
 SELECT * INTO c FROM public.employment_contract WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND source_system='MUNICONTROL' AND source_batch_id IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_READ_NOT_FOUND'; END IF;
 SELECT * INTO n FROM public.native_employee_registration WHERE contract_id=c.id AND person_id=c.person_id AND tenant_id=c.tenant_id AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM n.id::text THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_READ_ORIGIN_INVALID'; END IF;
 SELECT * INTO i FROM public.person_identity WHERE id=c.person_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_READ_NOT_FOUND'; END IF;
 IF (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId' THEN
  kind:='adopted';
  SELECT * INTO a FROM public.employment_adoption_application WHERE contract_id=c.id;
  SELECT * INTO d FROM public.employment_adoption_decision WHERE id=a.decision_id AND decision='approve' AND tenant_id=c.tenant_id AND source_binding_id=n.source_binding_id;
  SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=d.proposal_id AND tenant_id=d.tenant_id AND source_binding_id=d.source_binding_id;
  IF a.contract_id IS NULL OR d.id IS NULL OR r.id IS NULL OR a.registration_id<>n.id
   OR c.source_payload#>>'{native,adoptionProposalId}' IS DISTINCT FROM r.id::text
   OR c.source_payload#>>'{native,adoptionReviewId}' IS DISTINCT FROM d.id::text
   OR a.before_contract->>'person_id' IS DISTINCT FROM c.person_id::text
   OR a.before_contract->>'legacy_legajo' IS DISTINCT FROM c.legacy_legajo
   OR (a.before_contract->>'legacy_company_id')::bigint IS DISTINCT FROM c.legacy_company_id
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_READ_ORIGIN_INVALID'; END IF;
  -- Current ownership does not depend on the effective historical source cut.
  -- Historical retrieval retains its separate frozen-source guard in 134.
  SELECT after_contract->'intervals' INTO periods FROM public.native_employment_lifecycle_review
   WHERE contract_id=c.id AND tenant_id=c.tenant_id AND source_binding_id=n.source_binding_id AND decision='approve' ORDER BY revision DESC LIMIT 1;
  IF periods IS NOT NULL THEN
   periods:=public.native_employment_lifecycle_adopted_intervals_v2(periods);
   state_value:=public.native_employment_lifecycle_adopted_activity_v2(periods,today);
   SELECT value INTO chosen FROM jsonb_array_elements(periods) WHERE (value->>'startDate')::date<=today AND (value->>'endDate' IS NULL OR (value->>'endDate')::date>=today) ORDER BY value->>'startDate' DESC LIMIT 1;
   IF chosen IS NULL THEN SELECT value INTO chosen FROM jsonb_array_elements(periods) WHERE (value->>'startDate')::date>today ORDER BY value->>'startDate' LIMIT 1; END IF;
   chosen:=coalesce(chosen,periods->-1);
  ELSE
   state_value:=CASE WHEN c.status<>'active' THEN c.status WHEN c.start_date IS NULL THEN 'unknown' WHEN c.start_date>today THEN 'pending_start' WHEN c.end_date<today THEN 'inactive' ELSE 'active' END;
   chosen:=jsonb_build_object('startDate',to_char(c.start_date,'YYYY-MM-DD'),'endDate',to_char(c.end_date,'YYYY-MM-DD'));
  END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.employment_adoption_application WHERE contract_id=c.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_READ_ORIGIN_INVALID'; END IF;
  projection:=public.native_employment_lifecycle_projection_v1(p,c.id);state_value:=projection->>'status';chosen:=projection-'status';
 END IF;
 IF c.status='state_error' OR (c.status='inactive' AND periods IS NULL) THEN state_value:=c.status; END IF;
 RETURN jsonb_build_object('version','native-employee-read.v1',
 'scope',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId','bindingId',ctx->>'sourceBindingId','companyId',c.legacy_company_id,'database',ctx->>'sourceDatabase'),
 'contract',chosen||jsonb_build_object('id',c.id,'personId',c.person_id,'registrationId',n.id,'legajo',c.legacy_legajo,'recordKind',kind,
 'readVersion',encode(sha256(convert_to((to_jsonb(c)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex'),
 'identityReadVersion',encode(sha256(convert_to((to_jsonb(i)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex'),
 'status',state_value,'jurisdictionCode',c.jurisdiction_code,'legalReference',n.legal_reference,'registeredAt',n.created_at));
END $$;

REVOKE ALL ON FUNCTION public.native_employment_lifecycle_adopted_context_v2(jsonb,text),public.native_employment_lifecycle_adopted_date_v2(text),
public.native_employment_lifecycle_adopted_subject_v2(jsonb,uuid,jsonb),
public.native_employment_lifecycle_adopted_state_v2(jsonb,uuid,jsonb),
public.native_employment_lifecycle_adopted_intervals_v2(jsonb),
public.native_employment_lifecycle_adopted_activity_v2(jsonb,date),
public.native_employment_lifecycle_adopted_after_v2(jsonb,text,date),
public.native_employment_lifecycle_adopted_bootstrap_v2(jsonb,uuid),
public.native_employment_lifecycle_adopted_proposal_v2(jsonb,uuid,uuid),
public.native_employment_lifecycle_adopted_propose_v2(jsonb,jsonb,uuid),
public.native_employment_lifecycle_adopted_review_v2(jsonb,jsonb,uuid),
public.native_employment_lifecycle_adopted_read_v2(jsonb,uuid),
public.native_employment_lifecycle_adopted_projection_v2(jsonb,uuid),
public.native_employment_lifecycle_bootstrap_v2(jsonb,uuid),
public.native_employment_lifecycle_proposal_v2(jsonb,uuid,uuid),
public.native_employment_lifecycle_propose_v2(jsonb,jsonb,uuid),
public.native_employment_lifecycle_review_v2(jsonb,jsonb,uuid),
public.native_employment_lifecycle_attempt_v2(jsonb,uuid,uuid),
public.native_employment_lifecycle_read_v2(jsonb,uuid),
public.native_employment_lifecycle_projection_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.native_employment_lifecycle_bootstrap_v2(jsonb,uuid),
public.native_employment_lifecycle_proposal_v2(jsonb,uuid,uuid),
public.native_employment_lifecycle_propose_v2(jsonb,jsonb,uuid),
public.native_employment_lifecycle_review_v2(jsonb,jsonb,uuid),
public.native_employment_lifecycle_attempt_v2(jsonb,uuid,uuid),
public.native_employment_lifecycle_read_v2(jsonb,uuid),
public.native_employment_lifecycle_projection_v2(jsonb,uuid) TO municontrol_actions_runtime_app;
