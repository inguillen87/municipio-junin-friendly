-- Accept the sealed final-source proof also produced by adoption input v8.
-- Preserve registration, source binding, immutable seal and withdrawn-contract checks.
BEGIN;
CREATE OR REPLACE FUNCTION public.own_period_classification_source_v1(ctx jsonb, target uuid, period_value text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE c public.employment_contract;n public.native_employee_registration;i public.person_identity;a public.employment_adoption_application;review public.employment_adoption_decision;r public.employment_adoption_proposal;seal public.employment_adoption_seal;
 proof jsonb;final_value jsonb;subject jsonb;scope_value jsonb;v jsonb;field text;token text;BEGIN
 IF target IS NULL OR target='00000000-0000-0000-0000-000000000000'::uuid OR period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_INPUT_INVALID';END IF;
 IF public.native_employment_void_state_v1(ctx,target)->'voided'='true'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_VOID_WITHDRAWN'; END IF;
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
  IF a.contract_id IS NULL OR review.id IS NULL OR r.id IS NULL OR seal.proposal_id IS NULL OR a.registration_id<>n.id OR coalesce(r.body->>'version' IN('employment-adoption-input.v3','employment-adoption-input.v4','employment-adoption-input.v5','employment-adoption-input.v6','employment-adoption-input.v7','employment-adoption-input.v8'),false) IS NOT TRUE
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
END $function$;
ALTER FUNCTION public.own_period_classification_source_v1(jsonb,uuid,text) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_period_classification_source_v1(jsonb,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
COMMIT;
