-- Individual own-period classification. Install only through the
-- source-pinned composition; no source import, backfill, payroll or IAM write.
CREATE TABLE public.own_period_classification_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id),period_month date NOT NULL CHECK(extract(day FROM period_month)=1 AND period_month BETWEEN DATE '1900-01-01' AND DATE '2099-12-01'),
 proposal_id uuid REFERENCES public.own_period_classification_event(id),command text NOT NULL CHECK(command IN('propose','approve','reject')),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=32768),
 base_definition jsonb NOT NULL CHECK(jsonb_typeof(base_definition) IN('null','object')),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object' AND octet_length(source_snapshot::text)<=1048576),
 revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000),actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),
 actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),actor_label text NOT NULL,
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((command='propose')=(proposal_id IS NULL)),UNIQUE(proposal_id),UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE UNIQUE INDEX own_period_classification_approval_revision ON public.own_period_classification_event(tenant_id,source_binding_id,contract_id,period_month,revision) WHERE command='approve';
CREATE INDEX own_period_classification_contract_period ON public.own_period_classification_event(tenant_id,source_binding_id,contract_id,period_month);
ALTER TABLE public.own_period_classification_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_period_classification_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_period_classification_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_IMMUTABLE';END $$;
CREATE TRIGGER own_period_classification_immutable BEFORE UPDATE OR DELETE ON public.own_period_classification_event FOR EACH ROW EXECUTE FUNCTION public.own_period_classification_immutable_v1();
CREATE TRIGGER own_period_classification_no_truncate BEFORE TRUNCATE ON public.own_period_classification_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_period_classification_immutable_v1();

-- Exact SQL138 ownership/lifecycle subject. Salary consumers retain their
-- separately pinned jurisdiction guard before an eligible range returns true.
CREATE FUNCTION public.own_period_classification_lifecycle_subject_v1(ctx jsonb,target uuid,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c public.employment_contract;i public.person_identity;n public.native_employee_registration;
 a public.employment_adoption_application;d public.employment_adoption_decision;r public.employment_adoption_proposal;
 subject jsonb;state_value jsonb;binding uuid;
BEGIN
 IF ctx->>'sourceBindingId' IS NOT NULL AND ctx->>'certifiedBindingId' IS NOT NULL
  AND ctx->>'sourceBindingId'<>ctx->>'certifiedBindingId' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 binding:=coalesce(ctx->>'certifiedBindingId',ctx->>'sourceBindingId')::uuid;
 IF hold_lock THEN LOCK TABLE public.employment_contract,public.person_identity,public.native_employee_registration,
  public.platform_tenant_source_binding,public.employment_adoption_application,public.employment_adoption_decision,
  public.employment_adoption_proposal,public.native_employment_lifecycle_review IN SHARE MODE NOWAIT; END IF;
 SELECT * INTO c FROM public.employment_contract WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid
  AND legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND source_system='MUNICONTROL' AND source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 SELECT reg.* INTO n FROM public.native_employee_registration reg
  JOIN public.platform_tenant_source_binding b ON b.id=reg.source_binding_id AND b.tenant_id=reg.tenant_id
  WHERE reg.contract_id=c.id AND reg.person_id=c.person_id AND reg.tenant_id=c.tenant_id AND reg.source_binding_id=binding
   AND b.source_system='GRH' AND b.verified AND b.source_company_id=c.legacy_company_id AND b.source_database=ctx->>'sourceDatabase';
 IF NOT FOUND OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM n.id::text
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 SELECT * INTO a FROM public.employment_adoption_application WHERE contract_id=c.id;
 SELECT * INTO d FROM public.employment_adoption_decision WHERE id=a.decision_id AND decision='approve'
  AND tenant_id=c.tenant_id AND source_binding_id=binding;
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=d.proposal_id AND tenant_id=d.tenant_id AND source_binding_id=d.source_binding_id;
 IF a.contract_id IS NULL OR d.id IS NULL OR r.id IS NULL OR a.registration_id<>n.id
  OR c.source_payload#>>'{native,adoptionProposalId}' IS DISTINCT FROM r.id::text
  OR c.source_payload#>>'{native,adoptionReviewId}' IS DISTINCT FROM d.id::text
  OR a.before_contract->>'person_id' IS DISTINCT FROM c.person_id::text
  OR a.before_person->>'id' IS DISTINCT FROM c.person_id::text
  OR a.before_contract->>'legacy_legajo' IS DISTINCT FROM c.legacy_legajo
  OR (a.before_contract->>'legacy_company_id')::bigint IS DISTINCT FROM c.legacy_company_id
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 SELECT * INTO i FROM public.person_identity WHERE id=c.person_id AND identity_state IN('active','provisional');
 IF NOT FOUND OR c.legacy_legajo IS NULL OR length(c.legacy_legajo) NOT BETWEEN 1 AND 64 OR c.legacy_legajo~'[[:cntrl:]]'
  OR i.full_name IS NULL OR length(btrim(i.full_name)) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 subject:=jsonb_build_object('contractId',c.id,'legajo',c.legacy_legajo,'employeeName',i.full_name,
  'identityToken',encode(sha256(convert_to(jsonb_build_object('domain','fixed-adopted-identity.v1','tenant',c.tenant_id,
   'binding',binding,'registration',to_jsonb(n),'native',c.source_payload->'native','person',to_jsonb(i)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex'),
  'sourceCutoff',NULL,'origin','MUNICONTROL','registrationId',n.id,'registeredAt',n.created_at);
 state_value:=public.native_employment_lifecycle_adopted_state_v2(ctx||jsonb_build_object('sourceBindingId',binding),target,subject);
 IF state_value->>'datesVerified' IS DISTINCT FROM 'true' OR state_value->>'status'='state_error'
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_DATES_INVALID'; END IF;
 RETURN jsonb_build_object('personId',c.person_id,'subject',subject);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END $$;

CREATE FUNCTION public.own_period_classification_context_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;BEGIN
 ctx:=public.native_salary_administrative_context_v1(p);
 IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') OR NOT public.action_center_context_has_capability(ctx,'payroll.parameter.read') THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_FORBIDDEN';END IF;
 RETURN ctx;
END $$;
CREATE FUNCTION public.own_period_classification_scope_v1(ctx jsonb,target uuid,period_value text) RETURNS text LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-classification.v1',public.native_salary_scope_v1(ctx),target,period_value)),'sha256'),'hex')
$$;
CREATE FUNCTION public.own_period_classification_lock_v1(ctx jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 PERFORM public.native_salary_lock_v1(ctx);
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-period-classification:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY';END IF;
 LOCK TABLE public.native_employee_registration,public.employment_contract,public.person_identity,public.platform_tenant_source_binding,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal,public.employment_adoption_seal,public.native_employment_lifecycle_review,public.native_employment_change_review,public.native_employment_catalog_proposal,public.native_employment_catalog_review,public.own_period_classification_event IN SHARE MODE NOWAIT;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY';
 WHEN raise_exception THEN IF SQLERRM IN('NATIVE_SALARY_BUSY','NATIVE_EMPLOYMENT_CATALOG_BUSY') THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY';ELSE RAISE;END IF;END $$;

CREATE FUNCTION public.own_period_classification_definition_v1(d jsonb,period_value text) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE field text;v text;BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR public.own_program_exact_v1(d,ARRAY['agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode','startDate','endDate','effectiveFrom','effectiveUntil','documentDate','documentReference']) IS NOT TRUE THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['agreementCode','categoryCode','organizationId','sectorCode'] LOOP
  IF d->field IS DISTINCT FROM 'null'::jsonb AND(jsonb_typeof(d->field) IS DISTINCT FROM 'string' OR d->>field!~'^[0-9]{1,9}$') THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
 END LOOP;
 IF d->'jurisdictionCode' IS DISTINCT FROM 'null'::jsonb AND(jsonb_typeof(d->'jurisdictionCode') IS DISTINCT FROM 'string' OR d->>'jurisdictionCode' NOT IN('42','55')) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['startDate','endDate','effectiveFrom','effectiveUntil','documentDate'] LOOP
  IF d->field='null'::jsonb AND field<>'documentDate' THEN CONTINUE;END IF;v:=d->>field;
  IF jsonb_typeof(d->field) IS DISTINCT FROM 'string' OR v!~'^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' OR left(v,4)='0000' OR NOT pg_input_is_valid(v,'date') OR to_char(v::date,'YYYY-MM-DD')<>v THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
 END LOOP;
 IF d->>'startDate'>d->>'endDate' OR d->>'effectiveFrom'>d->>'effectiveUntil' OR public.own_program_text_v1(d->'documentReference',3,180) IS NOT TRUE OR d->>'documentReference'<>btrim(d->>'documentReference') OR d->>'documentReference'<>normalize(d->>'documentReference',NFC) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
 RETURN d;
END $$;
CREATE FUNCTION public.own_period_classification_catalogue_v1(d jsonb,classification jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE field text;kind_value text;n integer;BEGIN
 IF public.own_program_exact_v1(classification,ARRAY['version','items']) IS NOT TRUE OR jsonb_typeof(classification->'version') IS DISTINCT FROM 'string' OR classification->>'version'!~'^[a-f0-9]{64}$' OR jsonb_typeof(classification->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_CONTRACT_INVALID';END IF;
 FOR field,kind_value IN SELECT * FROM unnest(ARRAY['agreementCode','organizationId','sectorCode'],ARRAY['agreements','organizations','sectors']) LOOP
  IF d->field='null'::jsonb THEN CONTINUE;END IF;
  SELECT count(*) INTO n FROM jsonb_array_elements(classification->'items') r WHERE r->>'kind'=kind_value AND r->>'code'=d->>field;
  IF n<>1 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_CLASSIFICATION_UNKNOWN';END IF;
 END LOOP;
 IF d->'categoryCode' IS DISTINCT FROM 'null'::jsonb THEN
  SELECT count(*) INTO n FROM jsonb_array_elements(classification->'items') r WHERE r->>'kind'='categories' AND r->>'code'=d->>'categoryCode' AND(d->'agreementCode'='null'::jsonb OR r->>'agreementCode'=d->>'agreementCode');
  IF n<>1 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_CLASSIFICATION_UNKNOWN';END IF;
 END IF;
END $$;
CREATE FUNCTION public.own_period_classification_catalogue_source_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE value jsonb;BEGIN
 value:=public.native_employee_catalog_v1(ctx);
 IF value->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR coalesce((value->>'revision')::integer,0)<1 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_REQUIRED';END IF;
 RETURN jsonb_build_object('version',value->>'version','items',value->'items');
END $$;
-- Catalog proposals/reviews already form an immutable publication ledger.
-- Keep its exact pointer once per event; do not duplicate its items per employee.
CREATE FUNCTION public.own_period_classification_catalogue_reference_v1(ctx jsonb,classification jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.native_employment_catalog_review;p public.native_employment_catalog_proposal;BEGIN
 SELECT * INTO r FROM public.native_employment_catalog_review x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.decision='approve' ORDER BY x.revision DESC LIMIT 1;
 SELECT * INTO p FROM public.native_employment_catalog_proposal WHERE id=r.proposal_id AND tenant_id=r.tenant_id AND source_binding_id=r.source_binding_id;
 IF r.id IS NULL OR p.id IS NULL OR r.catalog_version IS DISTINCT FROM classification->>'version' OR p.items IS DISTINCT FROM classification->'items' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
 RETURN jsonb_build_object('version',r.catalog_version,'proposalId',p.id,'approvalId',r.id);
END $$;
CREATE FUNCTION public.own_period_classification_catalogue_read_v1(ctx jsonb,reference_value jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE value jsonb;BEGIN
 IF public.own_program_exact_v1(reference_value,ARRAY['version','proposalId','approvalId']) IS NOT TRUE OR jsonb_typeof(reference_value->'version') IS DISTINCT FROM 'string' OR reference_value->>'version'!~'^[a-f0-9]{64}$'
 OR jsonb_typeof(reference_value->'proposalId') IS DISTINCT FROM 'string' OR reference_value->>'proposalId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(reference_value->'approvalId') IS DISTINCT FROM 'string' OR reference_value->>'approvalId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
 SELECT jsonb_build_object('version',r.catalog_version,'items',p.items) INTO value FROM public.native_employment_catalog_review r JOIN public.native_employment_catalog_proposal p ON p.id=r.proposal_id AND p.tenant_id=r.tenant_id AND p.source_binding_id=r.source_binding_id
 WHERE r.id=(reference_value->>'approvalId')::uuid AND p.id=(reference_value->>'proposalId')::uuid AND r.catalog_version=reference_value->>'version' AND r.decision='approve' AND r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF value IS NULL THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;RETURN value;
END $$;
CREATE FUNCTION public.own_period_classification_full_period_v1(d jsonb,period_value text,classification jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE first_date date;last_date date;field text;BEGIN
 PERFORM public.own_period_classification_definition_v1(d,period_value);PERFORM public.own_period_classification_catalogue_v1(d,classification);
 FOREACH field IN ARRAY ARRAY['agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode','startDate','effectiveFrom','effectiveUntil'] LOOP IF d->field='null'::jsonb THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INCOMPLETE';END IF;END LOOP;
 first_date:=(period_value||'-01')::date;last_date:=(first_date+interval '1 month - 1 day')::date;
 IF (d->>'effectiveFrom')::date>first_date OR (d->>'effectiveUntil')::date<last_date OR (d->>'startDate')::date>first_date OR (d->>'endDate' IS NOT NULL AND(d->>'endDate')::date<last_date) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_PARTIAL_PERIOD';END IF;
 RETURN d;
END $$;

CREATE FUNCTION public.own_period_classification_capture_row_v1(row_value jsonb,employee jsonb,period_value text) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d jsonb;proof jsonb;final_value jsonb;field text;first_date date;last_date date;BEGIN
 IF public.own_program_exact_v1(row_value,ARRAY['contractId','registrationId','identityToken','basis','classificationVersion','approvalId','definition','provenance']) IS NOT TRUE
  OR jsonb_typeof(row_value->'contractId') IS DISTINCT FROM 'string' OR row_value->>'contractId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR jsonb_typeof(row_value->'registrationId') IS DISTINCT FROM 'string' OR row_value->>'registrationId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR row_value->>'registrationId'='00000000-0000-0000-0000-000000000000'
  OR jsonb_typeof(row_value->'identityToken') IS DISTINCT FROM 'string' OR row_value->>'identityToken'!~'^[a-f0-9]{64}$'
  OR row_value->'contractId' IS DISTINCT FROM employee->'contractId' OR row_value->'identityToken' IS DISTINCT FROM employee->'identityToken'
  OR employee->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
 d:=row_value->'definition';
 IF row_value->>'basis'='current_own_registration' THEN
  IF public.own_program_exact_v1(d,ARRAY['agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode','startDate','endDate']) IS NOT TRUE OR row_value->'classificationVersion' IS DISTINCT FROM 'null'::jsonb OR row_value->'approvalId' IS DISTINCT FROM 'null'::jsonb OR row_value->'provenance' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
 ELSIF row_value->>'basis'='approved_own_period_classification' THEN
  PERFORM public.own_period_classification_definition_v1(d,period_value);
  IF jsonb_typeof(row_value->'classificationVersion') IS DISTINCT FROM 'string' OR row_value->>'classificationVersion'!~'^[a-f0-9]{64}$' OR jsonb_typeof(row_value->'approvalId') IS DISTINCT FROM 'string' OR row_value->>'approvalId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR row_value->>'approvalId'='00000000-0000-0000-0000-000000000000' THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  FOREACH field IN ARRAY ARRAY['agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode','startDate','effectiveFrom','effectiveUntil'] LOOP IF d->field='null'::jsonb THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;END LOOP;
  first_date:=(period_value||'-01')::date;last_date:=(first_date+interval '1 month - 1 day')::date;
  IF(d->>'effectiveFrom')::date>first_date OR(d->>'effectiveUntil')::date<last_date OR(d->>'startDate')::date>first_date OR(d->>'endDate' IS NOT NULL AND(d->>'endDate')::date<last_date) THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  proof:=row_value->'provenance';
  IF proof->>'kind'='native_registration' THEN
   IF public.own_program_exact_v1(proof,ARRAY['kind','registrationId','requestSha256']) IS NOT TRUE THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  ELSIF proof->>'kind'='employment_adoption_final' THEN
   IF public.own_program_exact_v1(proof,ARRAY['kind','registrationId','requestSha256','adoptionProposalId','adoptionReviewId','sealSha256','finalRevision']) IS NOT TRUE THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   FOREACH field IN ARRAY ARRAY['adoptionProposalId','adoptionReviewId'] LOOP IF jsonb_typeof(proof->field) IS DISTINCT FROM 'string' OR proof->>field!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR proof->>field='00000000-0000-0000-0000-000000000000' THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;END LOOP;
   IF jsonb_typeof(proof->'sealSha256') IS DISTINCT FROM 'string' OR proof->>'sealSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   final_value:=proof->'finalRevision';
   IF public.own_program_exact_v1(final_value,ARRAY['revisionId','packageSha256','sourceSha256','cutoff','coreManifestSha256','curatedManifestSha256','factsSha256']) IS NOT TRUE OR jsonb_typeof(final_value->'revisionId') IS DISTINCT FROM 'string' OR final_value->>'revisionId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR final_value->>'revisionId'='00000000-0000-0000-0000-000000000000' THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   FOREACH field IN ARRAY ARRAY['packageSha256','sourceSha256','coreManifestSha256','curatedManifestSha256','factsSha256'] LOOP IF jsonb_typeof(final_value->field) IS DISTINCT FROM 'string' OR final_value->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;END LOOP;
   IF jsonb_typeof(final_value->'cutoff') IS DISTINCT FROM 'string' OR final_value->>'cutoff'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' OR left(final_value->>'cutoff',4)='0000' OR NOT pg_input_is_valid(left(final_value->>'cutoff',10),'date') OR to_char(left(final_value->>'cutoff',10)::date,'YYYY-MM-DD')<>left(final_value->>'cutoff',10) THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  ELSE RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  IF proof->'registrationId' IS DISTINCT FROM row_value->'registrationId' OR jsonb_typeof(proof->'requestSha256') IS DISTINCT FROM 'string' OR proof->>'requestSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
 ELSE RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['agreementCode','categoryCode','organizationId','sectorCode'] LOOP IF d->field IS DISTINCT FROM 'null'::jsonb AND(jsonb_typeof(d->field) IS DISTINCT FROM 'string' OR d->>field!~'^[0-9]{1,9}$') THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;END LOOP;
 IF d->'agreementCode' IS DISTINCT FROM employee->'agreementCode' OR d->'categoryCode' IS DISTINCT FROM employee->'categoryCode' OR d->'sectorCode' IS DISTINCT FROM employee->'departmentCode' OR(d->'jurisdictionCode' IS DISTINCT FROM 'null'::jsonb AND(jsonb_typeof(d->'jurisdictionCode') IS DISTINCT FROM 'string' OR d->>'jurisdictionCode' NOT IN('42','55'))) THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['startDate','endDate'] LOOP IF d->field IS DISTINCT FROM 'null'::jsonb AND(jsonb_typeof(d->field) IS DISTINCT FROM 'string' OR d->>field!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR left(d->>field,4)='0000' OR NOT pg_input_is_valid(d->>field,'date') OR to_char((d->>field)::date,'YYYY-MM-DD')<>d->>field) THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;END LOOP;
 IF d->>'startDate'>d->>'endDate' THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
END $$;

-- Exact UUID ownership projection, never a DNI/legajo resolver. It does not
-- require complete dates to prepare a declaration and never grants eligibility.
CREATE FUNCTION public.own_period_classification_source_v1(ctx jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public.employment_contract;n public.native_employee_registration;i public.person_identity;a public.employment_adoption_application;review public.employment_adoption_decision;r public.employment_adoption_proposal;seal public.employment_adoption_seal;
 proof jsonb;final_value jsonb;subject jsonb;scope_value jsonb;v jsonb;field text;token text;BEGIN
 IF target IS NULL OR target='00000000-0000-0000-0000-000000000000'::uuid OR period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
 SELECT * INTO c FROM public.employment_contract WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND source_system='MUNICONTROL' AND source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NOT_FOUND';END IF;
 SELECT reg.* INTO n FROM public.native_employee_registration reg JOIN public.platform_tenant_source_binding b ON b.id=reg.source_binding_id AND b.tenant_id=reg.tenant_id
 WHERE reg.contract_id=c.id AND reg.person_id=c.person_id AND reg.tenant_id=c.tenant_id AND reg.source_binding_id=(ctx->>'sourceBindingId')::uuid AND b.verified AND b.source_system='GRH' AND b.source_company_id=c.legacy_company_id AND b.source_database=ctx->>'sourceDatabase';
 IF NOT FOUND OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM n.id::text THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
 SELECT * INTO i FROM public.person_identity WHERE id=c.person_id AND identity_state IN('active','provisional');IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
 SELECT * INTO a FROM public.employment_adoption_application WHERE contract_id=c.id;
 IF a.contract_id IS NOT NULL OR (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId' OR c.source_payload#>>'{native,origin}'='GRH' THEN
  SELECT * INTO review FROM public.employment_adoption_decision WHERE id=a.decision_id AND decision='approve' AND tenant_id=c.tenant_id AND source_binding_id=n.source_binding_id;
  SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=review.proposal_id AND tenant_id=review.tenant_id AND source_binding_id=review.source_binding_id;
  SELECT * INTO seal FROM public.employment_adoption_seal WHERE proposal_id=r.id;
  IF a.contract_id IS NULL OR review.id IS NULL OR r.id IS NULL OR seal.proposal_id IS NULL OR a.registration_id<>n.id OR coalesce(r.body->>'version' IN('employment-adoption-input.v3','employment-adoption-input.v4','employment-adoption-input.v5','employment-adoption-input.v6','employment-adoption-input.v7'),false) IS NOT TRUE
   OR c.source_payload#>>'{native,adoptionProposalId}' IS DISTINCT FROM r.id::text OR c.source_payload#>>'{native,adoptionReviewId}' IS DISTINCT FROM review.id::text
   OR a.after_contract->>'person_id' IS DISTINCT FROM c.person_id::text OR a.before_person->>'id' IS DISTINCT FROM c.person_id::text
   OR a.after_contract->>'legacy_legajo' IS DISTINCT FROM c.legacy_legajo OR(a.after_contract->>'legacy_company_id')::bigint IS DISTINCT FROM c.legacy_company_id
   OR seal.facts_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(seal.facts)
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(seal.facts) f WHERE f->'contract'=a.before_contract AND f->'person'=a.before_person)
  THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  final_value:=r.before_snapshot#>'{source,finalRevision}';
  IF public.own_program_exact_v1(final_value,ARRAY['revisionId','packageSha256','sourceSha256','cutoff','coreManifestSha256','curatedManifestSha256','factsSha256']) IS NOT TRUE
   OR jsonb_typeof(final_value->'revisionId') IS DISTINCT FROM 'string' OR final_value->>'revisionId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
   OR final_value->>'revisionId'='00000000-0000-0000-0000-000000000000'
   OR public.own_program_exact_v1(r.body->'finalSource',ARRAY['revisionId','packageSha256']) IS NOT TRUE
   OR r.body#>>'{finalSource,revisionId}' IS DISTINCT FROM final_value->>'revisionId' OR r.body#>>'{finalSource,packageSha256}' IS DISTINCT FROM final_value->>'packageSha256'
   OR a.after_contract#>>'{source_payload,native,registrationId}' IS DISTINCT FROM n.id::text
   OR a.after_contract#>>'{source_payload,native,adoptionProposalId}' IS DISTINCT FROM r.id::text OR a.after_contract#>>'{source_payload,native,adoptionReviewId}' IS DISTINCT FROM review.id::text
   OR a.after_contract#>>'{source_payload,native,finalRevisionId}' IS DISTINCT FROM final_value->>'revisionId' OR a.after_contract#>>'{source_payload,native,finalPackageSha256}' IS DISTINCT FROM final_value->>'packageSha256'
   OR c.source_payload#>>'{native,finalRevisionId}' IS DISTINCT FROM final_value->>'revisionId' OR c.source_payload#>>'{native,finalPackageSha256}' IS DISTINCT FROM final_value->>'packageSha256'
  THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  FOREACH field IN ARRAY ARRAY['packageSha256','sourceSha256','coreManifestSha256','curatedManifestSha256','factsSha256'] LOOP IF jsonb_typeof(final_value->field) IS DISTINCT FROM 'string' OR final_value->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;END LOOP;
  v:=to_jsonb(final_value->>'cutoff');
  IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR v#>>'{}'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$' OR left(v#>>'{}',4)='0000' OR NOT pg_input_is_valid(left(v#>>'{}',10),'date') OR to_char(left(v#>>'{}',10)::date,'YYYY-MM-DD')<>left(v#>>'{}',10) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  IF(SELECT count(*) FROM jsonb_array_elements(r.before_snapshot->'rows') x WHERE x->>'contractId'=c.id::text)<>1 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.before_snapshot->'finalContracts') x WHERE x->>'contractId'=c.id::text AND x->>'personId'=c.person_id::text) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  proof:=jsonb_build_object('kind','employment_adoption_final','registrationId',n.id,'requestSha256',n.request_sha256,'adoptionProposalId',r.id,'adoptionReviewId',review.id,'sealSha256',seal.facts_sha256,'finalRevision',final_value);
 ELSE
  proof:=jsonb_build_object('kind','native_registration','registrationId',n.id,'requestSha256',n.request_sha256);
 END IF;
 -- This source token is independent of runtime novelty/payroll tokens. The
 -- registered person and sealed origin are verified again when facts are used.
 token:=encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-classification-identity.v1',c.tenant_id,n.source_binding_id,c.id,c.person_id,c.legacy_legajo,to_jsonb(n),to_jsonb(i)-ARRAY['created_at','updated_at'],proof)),'sha256'),'hex');
 subject:=jsonb_build_object('origin','MUNICONTROL','contractId',c.id,'personId',c.person_id,'registrationId',n.id,'identityToken',token);
 scope_value:=jsonb_build_object('tenantId',ctx->>'tenantId','bindingId',ctx->>'sourceBindingId','companyId',(ctx->>'sourceCompanyId')::bigint);
 -- Proposals must observe the exact current contract until independent review.
 -- Approved historical facts retain the separate immutable identity/provenance.
 RETURN jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-classification-source.v1',scope_value,period_value,subject,proof,to_jsonb(c))),'sha256'),'hex'),'scope',scope_value,'period',period_value,'subject',subject,'provenance',proof);
END $$;

CREATE FUNCTION public.own_period_classification_configuration_v1(ctx jsonb,target uuid,period_value text,revision_value integer,approval uuid,proposal jsonb,source_value jsonb,classification jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('version',encode(public.digest(public.native_salary_serialized_v1(jsonb_build_array('own-period-classification.v1',ctx->>'tenantId',ctx->>'sourceBindingId',target,period_value,revision_value,approval,proposal->'definition',source_value,classification)),'sha256'),'hex'),'revision',revision_value,'definition',proposal->'definition','proposalId',proposal->>'proposalId','approvalId',approval,'sourceVersion',source_value->>'version','identityToken',source_value#>>'{subject,identityToken}','provenance',source_value->'provenance','classificationVersion',classification->>'version')
$$;
CREATE FUNCTION public.own_period_classification_current_v1(ctx jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE e public.own_period_classification_event;r public.own_period_classification_event;BEGIN
 SELECT * INTO e FROM public.own_period_classification_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.contract_id=target AND x.period_month=(period_value||'-01')::date AND x.command='approve' ORDER BY x.revision DESC LIMIT 1;
 IF e.id IS NULL THEN RETURN public.own_period_classification_configuration_v1(ctx,target,period_value,0,NULL,NULL,NULL,NULL);END IF;
 SELECT * INTO STRICT r FROM public.own_period_classification_event WHERE id=e.proposal_id AND command='propose' AND tenant_id=e.tenant_id AND source_binding_id=e.source_binding_id AND contract_id=e.contract_id AND period_month=e.period_month;
 RETURN public.own_period_classification_configuration_v1(ctx,target,period_value,e.revision,e.id,r.body||jsonb_build_object('proposalId',r.id),r.source_snapshot->'source',r.source_snapshot->'classificationRef');
END $$;
CREATE FUNCTION public.own_period_classification_summary_v1(ctx jsonb,e public.own_period_classification_event) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_period_classification_event;independent boolean;BEGIN
 SELECT * INTO d FROM public.own_period_classification_event WHERE proposal_id=e.id;
 independent:=coalesce(public.action_center_context_has_capability(ctx,'payroll.parameter.approve') AND coalesce((ctx->>'parameterActorVerified')::boolean,false) AND ctx->>'actorPersonId' IS NOT NULL AND e.actor_membership_id<>(ctx->>'membershipId')::uuid AND e.actor_person_id<>(ctx->>'actorPersonId')::uuid AND e.actor_email<>ctx->>'actorEmail',false);
 RETURN jsonb_build_object('id',e.id,'requestSha256',e.request_sha256,'baseVersion',e.body->>'baseVersion','sourceVersion',e.body->>'sourceVersion','classificationVersion',e.body->>'classificationVersion','reason',e.body->>'reason','createdAt',e.recorded_at,'authorLabel',e.actor_label,'canReview',d.id IS NULL AND independent,'status',CASE d.command WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'decision',CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('command',d.command,'reason',d.body->>'reason','actorLabel',d.actor_label,'recordedAt',d.recorded_at,'revision',d.revision) END);
END $$;
CREATE FUNCTION public.own_period_classification_bootstrap_v1(p jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;s jsonb;c jsonb;k jsonb;rows_value jsonb;value jsonb;can_propose boolean;can_review boolean;BEGIN
 ctx:=public.own_period_classification_context_v1(p);PERFORM public.own_period_classification_lock_v1(ctx);s:=public.own_period_classification_source_v1(ctx,target,period_value);c:=public.own_period_classification_current_v1(ctx,target,period_value);k:=public.own_period_classification_catalogue_source_v1(ctx);
 SELECT coalesce(jsonb_agg(public.own_period_classification_summary_v1(ctx,e) ORDER BY e.recorded_at,e.id),'[]') INTO rows_value FROM public.own_period_classification_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.contract_id=target AND e.period_month=(period_value||'-01')::date AND e.command='propose';
 IF jsonb_array_length(rows_value)>1000 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_LIMIT';END IF;
 can_propose:=coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.prepare');can_review:=coalesce((ctx->>'parameterActorVerified')::boolean,false) AND public.action_center_context_has_capability(ctx,'payroll.parameter.approve');
 PERFORM public.own_salary_conditions_session_live_v1(p);
 value:=jsonb_build_object('version','own-period-classification.v1','preparation',jsonb_build_object('version','own-period-classification.v1','scope',s->'scope','contractId',target,'period',period_value,'scopeVersion',public.own_period_classification_scope_v1(ctx,target,period_value),'baseVersion',c->>'version','source',s,'classification',k,'canPropose',can_propose),'configuration',c,'proposals',rows_value,'permissions',jsonb_build_object('canPropose',can_propose,'canReview',can_review),'complete',true,'payrollCalculated',false,'payrollPosted',false);
 IF octet_length(value::text)+8192>4194304 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_LIMIT';END IF;RETURN value;
END $$;
CREATE FUNCTION public.own_period_classification_detail_v1(p jsonb,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_period_classification_event;s jsonb;c jsonb;k jsonb;period_value text;BEGIN
 ctx:=public.own_period_classification_context_v1(p);PERFORM public.own_period_classification_lock_v1(ctx);
 SELECT * INTO e FROM public.own_period_classification_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NOT_FOUND';END IF;period_value:=to_char(e.period_month,'YYYY-MM');
 s:=public.own_period_classification_source_v1(ctx,e.contract_id,period_value);c:=public.own_period_classification_current_v1(ctx,e.contract_id,period_value);k:=public.own_period_classification_catalogue_source_v1(ctx);PERFORM public.own_salary_conditions_session_live_v1(p);
 RETURN jsonb_build_object('version','own-period-classification.v1','scopeVersion',public.own_period_classification_scope_v1(ctx,e.contract_id,period_value),'proposal',public.own_period_classification_summary_v1(ctx,e),'body',e.body,'baseDefinition',e.base_definition,'source',e.source_snapshot->'source','classification',public.own_period_classification_catalogue_read_v1(ctx,e.source_snapshot->'classificationRef'),'current',e.body->>'baseVersion'=c->>'version' AND e.body->>'sourceVersion'=s->>'version' AND e.body->>'classificationVersion'=k->>'version');
END $$;
CREATE FUNCTION public.own_period_classification_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;e public.own_period_classification_event;BEGIN
 ctx:=public.own_period_classification_context_v1(p);
 SELECT * INTO e FROM public.own_period_classification_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NOT_FOUND';END IF;
 IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) OR NOT public.action_center_context_has_capability(ctx,CASE e.command WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_FORBIDDEN';END IF;
 PERFORM public.own_salary_conditions_session_live_v1(p);RETURN e.receipt||jsonb_build_object('replayed',true);
END $$;

CREATE FUNCTION public.own_period_classification_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;fresh jsonb;cmd text;target uuid;period_value text;c jsonb;s jsonb;k jsonb;d jsonb;proposal public.own_period_classification_event;prior public.own_period_classification_event;
 eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;captured_source jsonb;field text;added_bytes bigint;
 previous_timeout text:=current_setting('lock_timeout');limit_ms bigint;remaining_ms bigint;deadline timestamptz;relation_name text;BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_ISOLATION_REQUIRED';END IF;
 ctx:=public.own_period_classification_context_v1(p);cmd:=body->>'command';
 IF public.own_program_exact_v1(body,ARRAY['version','command','scope','contractId','period','scopeVersion','baseVersion','sourceVersion','classificationVersion','identityToken','provenance','definition','reason','proposalId','proposalSha256','reviewConfirmed']) IS NOT TRUE OR body->>'version' IS DISTINCT FROM 'own-period-classification.v1'
  OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR public.own_program_text_v1(body->'reason',10,1000) IS NOT TRUE OR body->>'reason'<>btrim(body->>'reason') OR body->>'reason'<>normalize(body->>'reason',NFC)
  OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>32768
  OR jsonb_typeof(body->'contractId') IS DISTINCT FROM 'string' OR body->>'contractId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR body->>'contractId'='00000000-0000-0000-0000-000000000000'
  OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['scopeVersion','baseVersion','sourceVersion','classificationVersion'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' OR body->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;END LOOP;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_FORBIDDEN';END IF;
 target:=(body->>'contractId')::uuid;period_value:=body->>'period';
 BEGIN PERFORM public.native_salary_lock_v1(ctx);
 EXCEPTION WHEN raise_exception THEN IF SQLERRM IN('NATIVE_SALARY_BUSY','NATIVE_EMPLOYMENT_CATALOG_BUSY') THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY';ELSE RAISE;END IF;END;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-period-classification:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0)) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY';END IF;
 SELECT setting::bigint INTO STRICT limit_ms FROM pg_catalog.pg_settings WHERE name='lock_timeout';IF limit_ms<=0 OR limit_ms>1000 THEN limit_ms:=1000;END IF;deadline:=clock_timestamp()+limit_ms*interval '1 millisecond';
 BEGIN
  FOREACH relation_name IN ARRAY ARRAY['native_employee_registration','employment_contract','person_identity','platform_tenant_source_binding','employment_adoption_application','employment_adoption_decision','employment_adoption_proposal','employment_adoption_seal','native_employment_lifecycle_review','native_employment_change_review','native_employment_catalog_proposal','native_employment_catalog_review','own_period_classification_event'] LOOP
   remaining_ms:=floor(EXTRACT(EPOCH FROM(deadline-clock_timestamp()))*1000)::bigint;IF remaining_ms<=0 THEN RAISE lock_not_available;END IF;
   PERFORM set_config('lock_timeout',remaining_ms::text||'ms',true);EXECUTE format('LOCK TABLE public.%I IN SHARE MODE',relation_name);
  END LOOP;
 EXCEPTION WHEN lock_not_available OR deadlock_detected THEN PERFORM set_config('lock_timeout',previous_timeout,true);RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY';END;
 PERFORM set_config('lock_timeout',previous_timeout,true);
 fresh:=public.own_period_classification_context_v1(p);
 IF public.native_salary_scope_v1(fresh) IS DISTINCT FROM public.native_salary_scope_v1(ctx) OR fresh->'capabilities' IS DISTINCT FROM ctx->'capabilities' OR fresh->'scopes' IS DISTINCT FROM ctx->'scopes' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SCOPE_CHANGED';END IF;ctx:=fresh;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) OR NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_FORBIDDEN';END IF;
 PERFORM public.own_salary_conditions_session_live_v1(p);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 SELECT * INTO prior FROM public.own_period_classification_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF prior.request_sha256<>fingerprint OR prior.body<>body THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_IDEMPOTENCY_REUSE';END IF;RETURN public.own_period_classification_attempt_v1(p,key);END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.own_period_classification_scope_v1(ctx,target,period_value) OR body->'scope' IS DISTINCT FROM jsonb_build_object('tenantId',ctx->>'tenantId','bindingId',ctx->>'sourceBindingId','companyId',(ctx->>'sourceCompanyId')::bigint) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SCOPE_CHANGED';END IF;
 c:=public.own_period_classification_current_v1(ctx,target,period_value);rev:=(c->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->'proposalId' IS DISTINCT FROM 'null'::jsonb OR body->'proposalSha256' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
  s:=public.own_period_classification_source_v1(ctx,target,period_value);k:=public.own_period_classification_catalogue_source_v1(ctx);d:=public.own_period_classification_definition_v1(body->'definition',period_value);PERFORM public.own_period_classification_catalogue_v1(d,k);
  IF body->>'baseVersion' IS DISTINCT FROM c->>'version' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BASE_CHANGED';END IF;
  IF body->>'sourceVersion' IS DISTINCT FROM s->>'version' OR body->>'classificationVersion' IS DISTINCT FROM k->>'version' OR body->'provenance' IS DISTINCT FROM s->'provenance' OR body->>'identityToken' IS DISTINCT FROM s#>>'{subject,identityToken}' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  IF d=c->'definition' AND body->>'sourceVersion'=c->>'sourceVersion' AND body->>'classificationVersion'=c->>'classificationVersion' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NO_CHANGES';END IF;
  pid:=eid;baseline:=c->'definition';captured_source:=jsonb_build_object('source',s,'classificationRef',public.own_period_classification_catalogue_reference_v1(ctx,k));
 ELSE
  IF body->'identityToken' IS DISTINCT FROM 'null'::jsonb OR body->'provenance' IS DISTINCT FROM 'null'::jsonb OR body->'definition' IS DISTINCT FROM 'null'::jsonb OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb
   OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR body->>'proposalId'='00000000-0000-0000-0000-000000000000' OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;
  SELECT * INTO proposal FROM public.own_period_classification_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND period_month=(period_value||'-01')::date;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_NOT_FOUND';END IF;
  IF proposal.actor_membership_id=(ctx->>'membershipId')::uuid OR proposal.actor_person_id=(ctx->>'actorPersonId')::uuid OR proposal.actor_email=ctx->>'actorEmail' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INDEPENDENT_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM public.own_period_classification_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_DECIDED';END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR proposal.request_sha256 IS DISTINCT FROM encode(public.digest(public.native_salary_serialized_v1(proposal.body),'sha256'),'hex') OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'sourceVersion' IS DISTINCT FROM proposal.body->>'sourceVersion' OR body->>'classificationVersion' IS DISTINCT FROM proposal.body->>'classificationVersion' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
  baseline:=proposal.base_definition;captured_source:=proposal.source_snapshot;
  IF cmd='approve' THEN
   s:=public.own_period_classification_source_v1(ctx,target,period_value);k:=public.own_period_classification_catalogue_source_v1(ctx);
   IF body->>'baseVersion' IS DISTINCT FROM c->>'version' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BASE_CHANGED';END IF;
   IF s IS DISTINCT FROM captured_source->'source' OR k IS DISTINCT FROM public.own_period_classification_catalogue_read_v1(ctx,captured_source->'classificationRef') OR public.own_period_classification_catalogue_reference_v1(ctx,k) IS DISTINCT FROM captured_source->'classificationRef' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_SOURCE_CHANGED';END IF;
   d:=public.own_period_classification_full_period_v1(proposal.body->'definition',period_value,k);rev:=rev+1;IF rev>1000 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_LIMIT';END IF;
   c:=public.own_period_classification_configuration_v1(ctx,target,period_value,rev,eid,proposal.body||jsonb_build_object('proposalId',pid),s,captured_source->'classificationRef');
  END IF;
 END IF;
 IF(SELECT count(*) FROM public.own_period_classification_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND contract_id=target AND period_month=(period_value||'-01')::date)>=1000 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-period-classification:capacity:v1',0)) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY';END IF;
 added_bytes:=4*octet_length(body::text)+octet_length(baseline::text)+octet_length(captured_source::text);
 IF octet_length(captured_source::text)>1048576 OR added_bytes>2147483647 THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_LIMIT';END IF;
 -- Reuse the published owner-verified cluster budget; no new ledger quota or
 -- hardcoded provider plan. The immutable catalogue is referenced, not copied.
 BEGIN PERFORM public.native_employment_catalog_capacity_v1(added_bytes::integer);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='NATIVE_EMPLOYMENT_CATALOG_BUSY' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY';
  ELSIF SQLERRM='NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_LIMIT';ELSE RAISE;END IF;
 END;
 PERFORM public.own_salary_conditions_session_live_v1(p);
 receipt_value:=jsonb_build_object('version','own-period-classification.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'configurationVersion',c->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.own_period_classification_event(id,tenant_id,source_binding_id,contract_id,period_month,proposal_id,command,body,base_definition,source_snapshot,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,target,(period_value||'-01')::date,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,baseline,captured_source,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
END $$;

-- Same resolver for fresh capture and authoritative close. The unchanged
-- employment interval and strict salary subject readers admit it separately.
CREATE FUNCTION public.own_period_classification_resolve_v1(ctx jsonb,target uuid,period_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public.employment_contract;n public.native_employee_registration;configuration jsonb;s jsonb;e public.own_period_classification_event;r public.own_period_classification_event;d jsonb;BEGIN
 SELECT * INTO c FROM public.employment_contract WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_system='MUNICONTROL' AND source_batch_id IS NULL AND legacy_company_id=(ctx->>'sourceCompanyId')::bigint;
 SELECT * INTO n FROM public.native_employee_registration WHERE contract_id=c.id AND person_id=c.person_id AND tenant_id=c.tenant_id AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF c.id IS NULL OR n.id IS NULL OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM n.id::text THEN RAISE EXCEPTION 'OWN_RUN_HISTORY_REQUIRED';END IF;
 configuration:=public.own_period_classification_current_v1(ctx,target,period_value);
 IF(configuration->>'revision')::integer>0 THEN
  SELECT * INTO STRICT e FROM public.own_period_classification_event WHERE id=(configuration->>'approvalId')::uuid AND command='approve';
  SELECT * INTO STRICT r FROM public.own_period_classification_event WHERE id=e.proposal_id AND command='propose';
  s:=public.own_period_classification_source_v1(ctx,target,period_value);
  IF s-'version' IS DISTINCT FROM (r.source_snapshot->'source')-'version' THEN RAISE EXCEPTION 'OWN_RUN_HISTORY_REQUIRED';END IF;
  d:=public.own_period_classification_full_period_v1(configuration->'definition',period_value,public.own_period_classification_catalogue_read_v1(ctx,r.source_snapshot->'classificationRef'));
  IF NOT public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),target,(period_value||'-01')::date,((period_value||'-01')::date+interval '1 month - 1 day')::date,true) THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;
  RETURN jsonb_build_object('contractId',target,'registrationId',n.id,'basis','approved_own_period_classification','classificationVersion',configuration->>'version','approvalId',configuration->>'approvalId','definition',d,'provenance',configuration->'provenance');
 END IF;
 IF(n.created_at AT TIME ZONE 'America/Argentina/Mendoza')::date>((period_value||'-01')::date+interval '1 month - 1 day')::date OR EXISTS(SELECT 1 FROM public.native_employment_change_review change_review WHERE change_review.contract_id=target AND change_review.decision='approve' AND(change_review.reviewed_at AT TIME ZONE 'America/Argentina/Mendoza')::date>=(period_value||'-01')::date) THEN RAISE EXCEPTION 'OWN_RUN_HISTORY_REQUIRED';END IF;
 RETURN jsonb_build_object('contractId',target,'registrationId',n.id,'basis','current_own_registration','classificationVersion',NULL,'approvalId',NULL,'definition',jsonb_build_object('agreementCode',c.agreement_code,'categoryCode',c.category_code,'organizationId',c.organization_unit_source_id,'sectorCode',c.sector_source_id,'jurisdictionCode',c.jurisdiction_code,'startDate',to_char(c.start_date,'YYYY-MM-DD'),'endDate',to_char(c.end_date,'YYYY-MM-DD')),'provenance',NULL);
END $$;
CREATE FUNCTION public.own_period_classification_close_match_v1(ctx jsonb,capture public.own_payroll_run_capture,target uuid,period_value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE block jsonb:=capture.payload#>'{sourceInventory,periodClassifications}';row_value jsonb;resolved jsonb;employee jsonb;BEGIN
 IF block IS NULL THEN
  resolved:=public.own_period_classification_resolve_v1(ctx,target,period_value);
  IF resolved->>'basis'<>'current_own_registration' THEN RAISE EXCEPTION 'OWN_RUN_HISTORY_REQUIRED';END IF;RETURN;
 END IF;
 IF public.own_program_exact_v1(block,ARRAY['version','complete','total','rows']) IS NOT TRUE OR block->>'version' IS DISTINCT FROM 'own-period-classification-capture.v1' OR block->'complete' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(block->'rows') IS DISTINCT FROM 'array' OR block->'total' IS DISTINCT FROM to_jsonb(jsonb_array_length(capture.payload#>'{population,employees}')) OR jsonb_array_length(block->'rows')<>(block->>'total')::integer THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
 IF(SELECT count(*) FROM jsonb_array_elements(block->'rows') r WHERE r->>'contractId'=target::text)<>1 THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
 SELECT r INTO row_value FROM jsonb_array_elements(block->'rows') r WHERE r->>'contractId'=target::text;
 SELECT r INTO employee FROM jsonb_array_elements(capture.payload#>'{population,employees}') r WHERE r->>'contractId'=target::text;
 PERFORM public.own_period_classification_capture_row_v1(row_value,employee,period_value);
 resolved:=public.own_period_classification_resolve_v1(ctx,target,period_value);
 IF row_value-'identityToken' IS DISTINCT FROM resolved THEN RAISE EXCEPTION 'OWN_RUN_HISTORY_REQUIRED';END IF;
END $$;

REVOKE ALL ON FUNCTION public.own_period_classification_immutable_v1(),public.own_period_classification_context_v1(jsonb),public.own_period_classification_scope_v1(jsonb,uuid,text),public.own_period_classification_lock_v1(jsonb),public.own_period_classification_definition_v1(jsonb,text),public.own_period_classification_catalogue_v1(jsonb,jsonb),public.own_period_classification_catalogue_source_v1(jsonb),public.own_period_classification_full_period_v1(jsonb,text,jsonb),public.own_period_classification_source_v1(jsonb,uuid,text),public.own_period_classification_configuration_v1(jsonb,uuid,text,integer,uuid,jsonb,jsonb,jsonb),public.own_period_classification_current_v1(jsonb,uuid,text),public.own_period_classification_summary_v1(jsonb,public.own_period_classification_event),public.own_period_classification_bootstrap_v1(jsonb,uuid,text),public.own_period_classification_detail_v1(jsonb,uuid),public.own_period_classification_attempt_v1(jsonb,uuid),public.own_period_classification_command_v1(jsonb,jsonb,uuid),public.own_period_classification_resolve_v1(jsonb,uuid,text),public.own_period_classification_close_match_v1(jsonb,public.own_payroll_run_capture,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_period_classification_capture_row_v1(jsonb,jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_period_classification_catalogue_reference_v1(jsonb,jsonb),public.own_period_classification_catalogue_read_v1(jsonb,jsonb),public.own_period_classification_lifecycle_subject_v1(jsonb,uuid,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_period_classification_bootstrap_v1(jsonb,uuid,text),public.own_period_classification_detail_v1(jsonb,uuid),public.own_period_classification_attempt_v1(jsonb,uuid),public.own_period_classification_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
