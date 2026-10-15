-- 178: retain informational source documents through an approved adoption.
-- Atomic, pinned read adapters only. No business writer or public/runtime grant.
DO $documentary178$
DECLARE target jsonb;change jsonb;variant jsonb;selected_pins jsonb:='[]'::jsonb;matches integer;signature regprocedure;definition text;current_body text;current_hash text;
 old_acl aclitem[];old_owner oid;old_config text[];old_defaults text;old_metadata jsonb;all_before boolean:=true;all_after boolean:=true;
 helper_oid regprocedure;helper_owner oid;facade_owner oid;
 pins constant jsonb:=$pins178$[{"signature":"public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)","beforeHash":"4d39bc0df9e3a0d68808bdf8229a997cf9b708a45ea134815e4e8fb2fa1a1c1f","afterHash":"3d8e45fac9b6b26fbc7a7f25c453e93f1c13b5eeb7320595a44cd1d6257b903d","changes":[[" SELECT c.* INTO ec FROM employment_contract c JOIN source_import_batch sb ON sb.id=c.source_batch_id AND sb.source_system='GRH' AND sb.source_database=ctx->>'sourceDatabase' AND sb.validation_state='published' AND sb.legacy_import_run_id IS NOT NULL\n WHERE c.id=p_contract AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint FOR SHARE OF c,sb;"," WITH documentary_subject AS MATERIALIZED (SELECT public.payroll_document_subject_v1(ctx,p_contract) AS value)\n SELECT (jsonb_populate_record(NULL::public.employment_contract,value->'contract')).* INTO ec\n FROM documentary_subject WHERE value IS NOT NULL;"]]},{"signature":"public.employee_payroll_documents_v1(text,uuid,integer,text,uuid,uuid,uuid)","beforeHash":"fbb185e0809d25c0244c841d07b8fe44f26c6780115f8a36be3d692d7c3f50b9","afterHash":"c76f4a8d169a1da88550560ab11836f8be42e32fd83af5bfcb09312f87bb5647","changes":[[" SELECT c.* INTO ec FROM employment_contract c\n JOIN source_import_batch sb ON sb.id=c.source_batch_id AND sb.source_system='GRH'\n   AND sb.source_database=ctx->>'sourceDatabase' AND sb.validation_state='published'\n   AND sb.legacy_import_run_id IS NOT NULL\n WHERE c.id=p_contract AND c.source_system='GRH'\n   AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint FOR SHARE OF c,sb;"," WITH documentary_subject AS MATERIALIZED (SELECT public.payroll_document_subject_v1(ctx,p_contract) AS value)\n SELECT (jsonb_populate_record(NULL::public.employment_contract,value->'contract')).* INTO ec\n FROM documentary_subject WHERE value IS NOT NULL;"]]},{"signature":"public.payroll_export_roster_v1(text,uuid,integer,text,uuid,uuid,uuid)","beforeHash":"4e38106e906d20e220b1ab58037474ab3d931f06c1e6af114f1b8a465363b3f1","afterHash":"35fd9c09629bfb49687c446c0293aa8ea748aefa4e4d66031d0358bb87a6702b","changes":[["  SELECT count(*)::integer n,min(i.full_name) name,min(i.dni) dni,min(i.cuil) cuil,min(i.sex_code) sex,min(sb.source_cutoff) cutoff,min(c.status) status\n  FROM employment_contract c\n  JOIN source_import_batch sb ON sb.id=c.source_batch_id AND sb.source_system='GRH' AND sb.source_database=ds.source_database\n    AND sb.validation_state='published' AND sb.legacy_import_run_id IS NOT NULL\n  LEFT JOIN person_identity i ON i.id=c.person_id\n  WHERE c.source_system='GRH' AND c.legacy_company_id=ds.company_id AND c.legacy_legajo=s.source_legajo","  SELECT count(subject.value)::integer n,min(subject.value#>>'{person,full_name}') name,\n   min(subject.value#>>'{person,dni}') dni,min(subject.value#>>'{person,cuil}') cuil,\n   min(subject.value#>>'{person,sex_code}') sex,min((subject.value->>'sourceCutoff')::timestamptz) cutoff,\n   min(subject.value#>>'{contract,status}') status\n  FROM employment_contract c CROSS JOIN LATERAL (SELECT public.payroll_document_subject_v1(ctx,c.id) AS value OFFSET 0) subject\n  WHERE c.legacy_company_id=ds.company_id AND c.legacy_legajo=s.source_legajo"],["actual_n integer;","actual_n integer;directory_batches jsonb;directory_batch public.source_import_batch;directory_records jsonb;directory_value jsonb;"],[" INSERT INTO payroll_export_roster_read_event("," -- This projection is private to the server; the HTTP roster whitelist omits it.\n SELECT coalesce(jsonb_agg(to_jsonb(batch)),'[]'::jsonb) INTO directory_batches\n FROM public.grh_effective_source_batch_v1 batch\n WHERE batch.source_database=ctx->>'sourceDatabase' AND batch.source_system='GRH';\n IF jsonb_array_length(directory_batches)<>1 THEN RAISE EXCEPTION 'GRH_SOURCE_CHANGED'; END IF;\n directory_batch:=jsonb_populate_record(NULL::public.source_import_batch,directory_batches->0);\n SELECT coalesce(jsonb_agg(jsonb_build_object('number',s.source_legajo,'assignments',mapped.assignments)\n  ORDER BY length(s.source_legajo),s.source_legajo),'[]'::jsonb) INTO directory_records\n FROM public.payroll_detail_statement s LEFT JOIN LATERAL (\n  SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',c.id::text,'name',e.nombre,\n   'sectorCode',e.sector_code,'sectorLabel',e.sector) ORDER BY c.id)\n   FILTER(WHERE subject.value IS NOT NULL AND\n    (subject.value->>'adopted'='true' OR subject.value#>>'{contract,source_batch_id}'=directory_batch.id::text)),'[]'::jsonb) AS assignments\n  FROM public.employment_contract c\n  CROSS JOIN LATERAL (SELECT public.payroll_document_subject_v1(ctx,c.id) AS value OFFSET 0) subject\n  LEFT JOIN public.grh_effective_employees_v1 e ON e.company_id=ds.company_id AND e.legajo=s.source_legajo\n   AND e.import_run_id=directory_batch.legacy_import_run_id\n   AND (subject.value#>>'{contract,source_batch_id}'=directory_batch.id::text OR\n    (nullif(subject.value#>>'{contract,source_payload,personId}','') IS NOT NULL\n     AND e.person_id::text=subject.value#>>'{contract,source_payload,personId}'))\n  WHERE c.legacy_company_id=ds.company_id AND c.legacy_legajo=s.source_legajo\n ) mapped ON true WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant;\n directory_value:=jsonb_build_object('version','payroll-document-assignments.v1',\n  'scope',jsonb_build_object('tenantId',p_tenant,'bindingId',ctx->>'sourceBindingId',\n   'database',ds.source_database,'companyId',ds.company_id,'datasetId',ds.id),\n  'cutoff',to_char(directory_batch.source_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS')||'Z','records',directory_records);\n directory_value:=directory_value||jsonb_build_object('readVersion',public.employment_adoption_hash_v1(directory_value));\n answer:=answer||jsonb_build_object('documentaryDirectory',directory_value);\n INSERT INTO payroll_export_roster_read_event("]]}]$pins178$::jsonb;
 -- Exact source variants observed by a read-only preflight. The older guard is
 -- deliberately retained; this migration never installs the separate 105 policy.
 observed_variants constant jsonb:=$variants178$[{"signature":"public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)","beforeHash":"ad5c9ce9df693d51e326b1708c79977e11fb1c49901be1c8d17d013d3fb4109c","afterHash":"e0400c5a94100079b6916b5203f3edfe08fd612e7879c93ecd47ec1823e5ef85","changes":[[" SELECT c.* INTO ec FROM employment_contract c JOIN source_import_batch sb ON sb.id=c.source_batch_id AND sb.source_system='GRH' AND sb.source_database=ctx->>'sourceDatabase' AND sb.validation_state='published' AND sb.legacy_import_run_id IS NOT NULL WHERE c.id=p_contract AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint FOR SHARE OF c,sb;"," WITH documentary_subject AS MATERIALIZED (SELECT public.payroll_document_subject_v1(ctx,p_contract) AS value)\n SELECT (jsonb_populate_record(NULL::public.employment_contract,value->'contract')).* INTO ec\n FROM documentary_subject WHERE value IS NOT NULL;"]]},{"signature":"public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)","beforeHash":"80c11c8410657b17a0739d41d11fe45c398ec309f26d5db3ea819c83eda1b827","afterHash":"42f089f10c3908f1dac716ec6245b1583363854e4446f9ece500703ce09dcb41","changes":[[" SELECT c.* INTO ec FROM employment_contract c JOIN source_import_batch sb ON sb.id=c.source_batch_id AND sb.source_system='GRH' AND sb.source_database=ctx->>'sourceDatabase' AND sb.validation_state='published' AND sb.legacy_import_run_id IS NOT NULL WHERE c.id=p_contract AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint FOR SHARE OF c,sb;"," WITH documentary_subject AS MATERIALIZED (SELECT public.payroll_document_subject_v1(ctx,p_contract) AS value)\n SELECT (jsonb_populate_record(NULL::public.employment_contract,value->'contract')).* INTO ec\n FROM documentary_subject WHERE value IS NOT NULL;"]]},{"signature":"public.employee_payroll_documents_v1(text,uuid,integer,text,uuid,uuid,uuid)","beforeHash":"726d9068326a7dbc9659f2509f958d2ae062a546e0a7cd91b7b5e6abcb4cbb25","afterHash":"d3df05a1548a1b637b57effcc46f29fa8ff7a0d1eba11432a5faa849a035f13d","changes":[[" SELECT c.* INTO ec FROM employment_contract c\n JOIN source_import_batch sb ON sb.id=c.source_batch_id AND sb.source_system='GRH'\n   AND sb.source_database=ctx->>'sourceDatabase' AND sb.validation_state='published'\n   AND sb.legacy_import_run_id IS NOT NULL\n WHERE c.id=p_contract AND c.source_system='GRH'\n   AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint FOR SHARE OF c,sb;"," WITH documentary_subject AS MATERIALIZED (SELECT public.payroll_document_subject_v1(ctx,p_contract) AS value)\n SELECT (jsonb_populate_record(NULL::public.employment_contract,value->'contract')).* INTO ec\n FROM documentary_subject WHERE value IS NOT NULL;"]]}]$variants178$::jsonb;
 helper_definition constant text:=$definition178$CREATE FUNCTION public.payroll_document_subject_v1(ctx jsonb,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $subject178$
DECLARE c public.employment_contract;i public.person_identity;b public.platform_tenant_source_binding;
 a public.employment_adoption_application;d public.employment_adoption_decision;r public.employment_adoption_proposal;
 n public.native_employee_registration;sealed public.employment_adoption_seal;original public.employment_contract;
 original_person jsonb;source_batch public.source_import_batch;
BEGIN
 IF target IS NULL OR ctx->>'tenantId' IS NULL OR ctx->>'sourceBindingId' IS NULL
  OR ctx->>'sourceDatabase' IS NULL OR ctx->>'sourceCompanyId' IS NULL
  OR NOT public.action_center_context_has_capability(ctx,'workforce.employee.read')
  OR NOT public.action_center_context_has_capability(ctx,'payroll.read')
 THEN RAISE EXCEPTION 'EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED'; END IF;
 SELECT * INTO b FROM public.platform_tenant_source_binding WHERE id=(ctx->>'sourceBindingId')::uuid
  AND tenant_id=(ctx->>'tenantId')::uuid AND source_system='GRH' AND verified IS TRUE
  AND source_database=ctx->>'sourceDatabase' AND source_company_id=(ctx->>'sourceCompanyId')::bigint FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_SOURCE_BINDING_REQUIRED'; END IF;
 SELECT current_contract.* INTO c FROM public.employment_contract current_contract
 WHERE current_contract.id=target AND current_contract.legacy_company_id=b.source_company_id
  AND ((current_contract.source_system='GRH' AND current_contract.tenant_id IS NULL
   AND EXISTS(SELECT 1 FROM public.source_import_batch origin_batch WHERE origin_batch.id=current_contract.source_batch_id
    AND origin_batch.source_system='GRH' AND origin_batch.source_database=b.source_database))
   OR (current_contract.source_system='MUNICONTROL' AND current_contract.tenant_id=b.tenant_id)) FOR SHARE OF current_contract;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO i FROM public.person_identity WHERE id=c.person_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_IDENTITY_CHANGED'; END IF;
 IF c.source_system='GRH' THEN
  original:=c;original_person:=to_jsonb(i);
 ELSE
  SELECT * INTO a FROM public.employment_adoption_application WHERE contract_id=c.id;
  IF NOT FOUND THEN
   IF (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId'
   THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_IDENTITY_CHANGED'; END IF;
   RETURN NULL;
  END IF;
  SELECT * INTO d FROM public.employment_adoption_decision WHERE id=a.decision_id AND decision='approve'
   AND tenant_id=b.tenant_id AND source_binding_id=b.id AND applied_xid=a.applied_xid;
  SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=d.proposal_id AND tenant_id=b.tenant_id AND source_binding_id=b.id;
  SELECT * INTO sealed FROM public.employment_adoption_seal WHERE proposal_id=r.id;
  SELECT * INTO n FROM public.native_employee_registration WHERE id=a.registration_id AND contract_id=c.id
   AND person_id=c.person_id AND tenant_id=b.tenant_id AND source_binding_id=b.id;
  IF d.id IS NULL OR r.id IS NULL OR sealed.proposal_id IS NULL OR n.id IS NULL
   OR c.source_batch_id IS NOT NULL
   OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM n.id::text
   OR c.source_payload#>>'{native,adoptionProposalId}' IS DISTINCT FROM r.id::text
   OR c.source_payload#>>'{native,adoptionReviewId}' IS DISTINCT FROM d.id::text
   OR c.source_payload#>>'{native,origin}' IS DISTINCT FROM 'GRH'
   OR a.before_contract->>'id' IS DISTINCT FROM c.id::text
   OR a.before_contract->>'person_id' IS DISTINCT FROM c.person_id::text
   OR a.before_person->>'id' IS DISTINCT FROM c.person_id::text
   OR a.before_contract->>'legacy_legajo' IS DISTINCT FROM c.legacy_legajo
   OR (a.before_contract->>'legacy_company_id')::bigint IS DISTINCT FROM c.legacy_company_id
   OR a.before_contract->>'source_system' IS DISTINCT FROM 'GRH'
   OR a.before_contract->>'tenant_id' IS NOT NULL OR a.before_contract->>'source_batch_id' IS NULL
   OR a.after_contract->>'id' IS DISTINCT FROM c.id::text
   OR a.after_contract->>'person_id' IS DISTINCT FROM c.person_id::text
   OR a.after_contract->>'legacy_legajo' IS DISTINCT FROM c.legacy_legajo
   OR (a.after_contract->>'legacy_company_id')::bigint IS DISTINCT FROM c.legacy_company_id
   OR a.after_contract->>'source_system' IS DISTINCT FROM 'MUNICONTROL'
   OR a.after_contract->>'tenant_id' IS DISTINCT FROM b.tenant_id::text
   OR a.after_contract->>'source_batch_id' IS NOT NULL
   OR a.after_contract#>>'{source_payload,native,registrationId}' IS DISTINCT FROM n.id::text
   OR a.after_contract#>>'{source_payload,native,adoptionProposalId}' IS DISTINCT FROM r.id::text
   OR a.after_contract#>>'{source_payload,native,adoptionReviewId}' IS DISTINCT FROM d.id::text
   OR n.request_sha256 IS DISTINCT FROM public.employment_adoption_hash_v1(jsonb_build_object('decisionId',d.id,'before',a.before_contract,'after',a.after_contract))
   OR n.catalog_sha256 IS DISTINCT FROM r.body->>'catalogVersion'
  THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_IDENTITY_CHANGED'; END IF;
  -- Immutable application/seal guards certified the complete before/after facts
  -- at adoption. Do not scan the entire roster seal once per document, nor
  -- require current dates/status or the current publication to equal that seal.
  original:=jsonb_populate_record(NULL::public.employment_contract,a.before_contract);
  original_person:=a.before_person;
 END IF;
 SELECT sb.* INTO source_batch FROM public.source_import_batch sb JOIN public.data_import_runs imported
  ON imported.id=sb.legacy_import_run_id AND imported.status='completed'
   AND lower(imported.source_sha256)=lower(sb.source_sha256)
 WHERE sb.id=original.source_batch_id AND sb.source_system='GRH' AND sb.source_database=b.source_database
  AND sb.validation_state='published' AND sb.legacy_import_run_id IS NOT NULL FOR SHARE OF sb,imported;
 IF NOT FOUND THEN RAISE EXCEPTION 'GRH_SOURCE_CHANGED'; END IF;
 RETURN jsonb_build_object('contract',to_jsonb(original),'person',original_person,
  'adopted',c.source_system='MUNICONTROL','sourceCutoff',source_batch.source_cutoff);
END $subject178$;$definition178$;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('municontrol:adopted-documentary-read:178',0));
 IF to_regclass('public.employment_adoption_application') IS NULL OR to_regclass('public.employment_adoption_seal') IS NULL
  OR to_regprocedure('public.employment_adoption_hash_v1(jsonb)') IS NULL
  OR to_regclass('public.grh_effective_employees_v1') IS NULL
 THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_ADOPTION_PREREQUISITE'; END IF;
 FOR target IN SELECT value FROM jsonb_array_elements(pins) LOOP
  signature:=to_regprocedure(target->>'signature');
  SELECT replace(prosrc,E'\r\n',E'\n'),proowner INTO current_body,facade_owner FROM pg_proc
   WHERE oid=signature AND prosecdef AND proconfig=ARRAY['search_path=public, pg_temp'];
  IF current_body IS NULL THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_READER_DRIFT'; END IF;
  IF helper_owner IS NULL THEN helper_owner:=facade_owner;
  ELSIF helper_owner<>facade_owner THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_OWNER_DRIFT'; END IF;
  current_hash:=encode(sha256(convert_to(current_body,'UTF8')),'hex');
  SELECT count(*),jsonb_agg(candidate.value)->0 INTO matches,variant
   FROM jsonb_array_elements(jsonb_build_array(target)||observed_variants) candidate(value)
   WHERE candidate.value->>'signature'=target->>'signature'
    AND current_hash IN(candidate.value->>'beforeHash',candidate.value->>'afterHash');
  IF matches<>1 THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_READER_DRIFT'; END IF;
  selected_pins:=selected_pins||jsonb_build_array(variant);
  all_before:=all_before AND current_hash=variant->>'beforeHash';all_after:=all_after AND current_hash=variant->>'afterHash';
 END LOOP;
 IF NOT all_before AND NOT all_after THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_PARTIAL_INSTALLATION'; END IF;
 helper_oid:=to_regprocedure('public.payroll_document_subject_v1(jsonb,uuid)');
 IF helper_oid IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=helper_oid AND prosecdef AND proowner=helper_owner
   AND proconfig=ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']
   AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='b92e8220de522a9644bca8ccc5261c1a345101f88ae046e4519d36b42c48c7dd')
   OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid=helper_oid AND a.privilege_type='EXECUTE' AND a.grantee<>p.proowner)
  THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_HELPER_DRIFT'; END IF;
 END IF;
 IF all_after THEN
  IF helper_oid IS NULL THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_PARTIAL_INSTALLATION'; END IF;
  RETURN;
 END IF;
 IF helper_oid IS NOT NULL THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_PARTIAL_INSTALLATION'; END IF;
 IF helper_owner<>current_user::regrole::oid THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_OWNER_DRIFT'; END IF;
 EXECUTE helper_definition;
 REVOKE ALL ON FUNCTION public.payroll_document_subject_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
 FOR target IN SELECT value FROM jsonb_array_elements(selected_pins) LOOP
  signature:=to_regprocedure(target->>'signature');
  SELECT replace(p.prosrc,E'\r\n',E'\n'),pg_get_functiondef(p.oid),p.proacl,p.proowner,p.proconfig,pg_get_expr(p.proargdefaults,0),to_jsonb(p)-'prosrc'
   INTO current_body,definition,old_acl,old_owner,old_config,old_defaults,old_metadata FROM pg_proc p WHERE p.oid=signature;
  FOR change IN SELECT value FROM jsonb_array_elements(target->'changes') LOOP
   IF length(current_body)-length(replace(current_body,change->>0,''))<>length(change->>0)
   THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_READER_ANCHOR_DRIFT'; END IF;
   current_body:=replace(current_body,change->>0,change->>1);
  END LOOP;
  IF encode(sha256(convert_to(current_body,'UTF8')),'hex')<>target->>'afterHash'
   THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_PATCH_DRIFT'; END IF;
  -- pg_get_functiondef keeps signature, defaults, config, owner and ACL; replace
  -- only the certified body, retaining every session/source/audit check.
  definition:=replace(definition,(SELECT prosrc FROM pg_proc WHERE oid=signature),current_body);
  EXECUTE definition;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=signature AND p.proacl IS NOT DISTINCT FROM old_acl AND p.proowner=old_owner
   AND p.proconfig IS NOT DISTINCT FROM old_config AND pg_get_expr(p.proargdefaults,0) IS NOT DISTINCT FROM old_defaults
   AND to_jsonb(p)-'prosrc' IS NOT DISTINCT FROM old_metadata
   AND p.prosecdef AND encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=target->>'afterHash')
  THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_METADATA_CHANGED'; END IF;
 END LOOP;
 IF has_function_privilege('municontrol_actions_runtime_app','public.payroll_document_subject_v1(jsonb,uuid)','EXECUTE')
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   WHERE p.oid=to_regprocedure('public.payroll_document_subject_v1(jsonb,uuid)') AND a.grantee<>p.proowner)
 THEN RAISE EXCEPTION 'PAYROLL_DOCUMENT_HELPER_EXPOSED'; END IF;
END $documentary178$;
