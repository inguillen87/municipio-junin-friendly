-- Private integration draft: current municipal reads, never entitlement/writes.
-- Requires 110/132/133. Installation/repetition and operator adoption remain gated.
CREATE FUNCTION public.native_employee_read_projection_v1(p jsonb,target uuid) RETURNS jsonb
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
   periods:=public.native_employment_lifecycle_intervals_v1(periods);
   state_value:=public.native_employment_lifecycle_activity_v1(periods,today);
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
 IF c.status IN('inactive','state_error') THEN state_value:=c.status; END IF;
 RETURN jsonb_build_object('version','native-employee-read.v1',
 'scope',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId','bindingId',ctx->>'sourceBindingId','companyId',c.legacy_company_id,'database',ctx->>'sourceDatabase'),
 'contract',chosen||jsonb_build_object('id',c.id,'personId',c.person_id,'registrationId',n.id,'legajo',c.legacy_legajo,'recordKind',kind,
 'readVersion',encode(sha256(convert_to((to_jsonb(c)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex'),
 'identityReadVersion',encode(sha256(convert_to((to_jsonb(i)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex'),
 'status',state_value,'jurisdictionCode',c.jurisdiction_code,'legalReference',n.legal_reference,'registeredAt',n.created_at));
END $$;

CREATE FUNCTION public.native_employee_directory_snapshot_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;scope_value jsonb;facts jsonb;total integer;registered integer;imported integer;binding_value jsonb;
BEGIN
 ctx:=public.native_employee_context_v1(p);
 scope_value:=jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId','bindingId',ctx->>'sourceBindingId','companyId',(ctx->>'sourceCompanyId')::bigint,'database',ctx->>'sourceDatabase');
 SELECT count(*),count(n.id),coalesce(jsonb_agg(jsonb_build_object('contract',to_jsonb(c),'identity',to_jsonb(i),'registration',to_jsonb(n),
  'periods',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.revision),'[]'::jsonb) FROM public.native_employment_lifecycle_review l WHERE l.contract_id=c.id AND l.tenant_id=c.tenant_id AND l.source_binding_id=n.source_binding_id AND l.decision='approve')) ORDER BY c.id),'[]'::jsonb)
  INTO total,registered,facts FROM public.employment_contract c JOIN public.person_identity i ON i.id=c.person_id
  LEFT JOIN public.native_employee_registration n ON n.contract_id=c.id AND n.person_id=c.person_id AND n.tenant_id=c.tenant_id AND n.source_binding_id=(ctx->>'sourceBindingId')::uuid
  WHERE c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL AND c.tenant_id=(ctx->>'tenantId')::uuid AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint;
 IF total<>registered THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_READ_ORIGIN_INVALID'; END IF;
 SELECT count(*) INTO imported FROM public.employment_contract WHERE source_system='GRH' AND legacy_company_id=(ctx->>'sourceCompanyId')::bigint;
 SELECT to_jsonb(b) INTO binding_value FROM public.platform_tenant_source_binding b WHERE b.id=(ctx->>'sourceBindingId')::uuid AND b.tenant_id=(ctx->>'tenantId')::uuid;
 RETURN jsonb_build_object('version','native-directory-snapshot.v1','scope',scope_value,'total',total,'imported',imported,
  'token',encode(sha256(convert_to(jsonb_build_object('scope',scope_value,'binding',binding_value,'today',(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date,'facts',facts,'imported',imported)::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION public.native_employee_read_projection_v1(jsonb,uuid),public.native_employee_directory_snapshot_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.native_employee_read_projection_v1(jsonb,uuid),public.native_employee_directory_snapshot_v1(jsonb) TO municontrol_actions_runtime_app;
