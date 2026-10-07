-- Read adapter for the private adoption draft; not an installation protocol.
-- No current entitlement, salary, identity or imported source is changed.
CREATE FUNCTION public.employment_adoption_history_read_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;c public.employment_contract;i public.person_identity;n public.native_employee_registration;a public.employment_adoption_application;
 d public.employment_adoption_decision;r public.employment_adoption_proposal;source_value jsonb;state_value text;
BEGIN
 ctx:=public.native_employee_context_v1(p);
 SELECT * INTO c FROM public.employment_contract WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_system='MUNICONTROL' AND source_batch_id IS NULL AND legacy_company_id=(ctx->>'sourceCompanyId')::bigint FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_HISTORY_NOT_FOUND'; END IF;
 SELECT * INTO i FROM public.person_identity WHERE id=c.person_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_HISTORY_NOT_FOUND'; END IF;
 SELECT * INTO a FROM public.employment_adoption_application WHERE contract_id=c.id;
 SELECT * INTO d FROM public.employment_adoption_decision WHERE id=a.decision_id AND decision='approve' AND tenant_id=c.tenant_id AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=d.proposal_id AND tenant_id=d.tenant_id AND source_binding_id=d.source_binding_id;
 SELECT * INTO n FROM public.native_employee_registration WHERE id=a.registration_id AND contract_id=c.id AND person_id=c.person_id AND tenant_id=c.tenant_id AND source_binding_id=r.source_binding_id;
 IF a.contract_id IS NULL OR d.id IS NULL OR r.id IS NULL OR n.id IS NULL
 OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM n.id::text
 OR c.source_payload#>>'{native,adoptionProposalId}' IS DISTINCT FROM r.id::text
 OR c.source_payload#>>'{native,adoptionReviewId}' IS DISTINCT FROM d.id::text
 OR a.before_contract->>'person_id' IS DISTINCT FROM c.person_id::text
 OR a.before_contract->>'legacy_legajo' IS DISTINCT FROM c.legacy_legajo
 OR (a.before_contract->>'legacy_company_id')::bigint IS DISTINCT FROM c.legacy_company_id
 THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_HISTORY_NOT_FOUND'; END IF;
 source_value:=public.employment_adoption_source_v1(p)->'source';
 IF source_value IS DISTINCT FROM r.before_snapshot->'source' THEN RAISE EXCEPTION 'EMPLOYMENT_ADOPTION_HISTORY_SOURCE_CHANGED'; END IF;
 -- These are current canonical facts after governed changes, not a relabelled
 -- historical payroll status. Missing dates do not become invented intervals.
 state_value:=CASE WHEN c.status<>'active' THEN c.status WHEN c.start_date IS NULL THEN 'unknown'
 WHEN c.start_date>(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date THEN 'pending_start'
 WHEN c.end_date<(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date THEN 'inactive' ELSE 'active' END;
 RETURN jsonb_build_object('version','employment-adoption-history.v1',
 'scope',jsonb_build_object('tenantId',ctx->>'tenantId','membershipId',ctx->>'membershipId','bindingId',ctx->>'sourceBindingId','companyId',c.legacy_company_id,'database',ctx->>'sourceDatabase'),
 'contract',jsonb_build_object('id',c.id,'personId',c.person_id,'legajo',c.legacy_legajo,'registrationId',n.id,
 'readVersion',encode(sha256(convert_to((to_jsonb(c)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex'),
 'identityReadVersion',encode(sha256(convert_to((to_jsonb(i)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex'),
 'status',state_value,'startDate',to_char(c.start_date,'YYYY-MM-DD'),'endDate',to_char(c.end_date,'YYYY-MM-DD'),
 'jurisdictionCode',c.jurisdiction_code,'legalReference',n.legal_reference,'registeredAt',n.created_at),
 'history',source_value||jsonb_build_object('origin','GRH','contractSourceBatchId',a.before_contract->>'source_batch_id','adoptedAt',d.created_at));
END $$;
REVOKE ALL ON FUNCTION public.employment_adoption_history_read_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.employment_adoption_history_read_v1(jsonb,uuid) TO municontrol_actions_runtime_app;
