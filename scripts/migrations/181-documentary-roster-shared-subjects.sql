-- 181: shared, compact documentary subjects for the complete roster.
-- Preserve authenticated binding, adoption proof, directory, full-set hashes,
-- audit, helper privacy and all reader metadata. No business mutation.
DO $documentary181$
DECLARE target regprocedure:='public.payroll_export_roster_v1(text,uuid,integer,text,uuid,uuid,uuid)'::regprocedure;
 prior pg_proc;updated pg_proc;helper pg_proc;old_body text;definition text;body_hash text;
 replacement_body constant text:=$body181$
DECLARE ctx jsonb; ds payroll_detail_dataset%ROWTYPE; rows_json jsonb; answer jsonb; actual_n integer;directory_batches jsonb;directory_batch public.source_import_batch;directory_records jsonb;directory_value jsonb;
BEGIN
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'payroll.read') OR NOT action_center_context_has_capability(ctx,'workforce.employee.read') THEN
  RAISE EXCEPTION 'PAYROLL_ROSTER_CAPABILITY_REQUIRED';
 END IF;
 SELECT * INTO ds FROM payroll_detail_dataset d
 WHERE d.id=p_dataset AND d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.company_id=(ctx->>'sourceCompanyId')::bigint AND d.source_database=ctx->>'sourceDatabase';
 IF NOT FOUND THEN RETURN jsonb_build_object('version','payroll-export-roster.v1','found',false,'official',false); END IF;
 SELECT count(*) INTO actual_n FROM payroll_detail_statement s WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant;
 IF actual_n<>ds.statement_count OR actual_n>2000 THEN RAISE EXCEPTION 'PAYROLL_ROSTER_SOURCE_INCOMPLETE'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(batch)),'[]'::jsonb) INTO directory_batches
 FROM public.grh_effective_source_batch_v1 batch
 WHERE batch.source_database=ctx->>'sourceDatabase' AND batch.source_system='GRH';
 IF jsonb_array_length(directory_batches)<>1 THEN RAISE EXCEPTION 'GRH_SOURCE_CHANGED'; END IF;
 directory_batch:=jsonb_populate_record(NULL::public.source_import_batch,directory_batches->0);
 -- Resolve each candidate exactly once in this authenticated roster read.
 -- Keep only the fields consumed below; never cache full source payloads.
 WITH documentary_candidates AS MATERIALIZED(
  SELECT candidate.id,candidate.legacy_legajo FROM public.employment_contract candidate
  WHERE candidate.legacy_company_id=ds.company_id AND EXISTS(
   SELECT 1 FROM public.payroll_detail_statement statement_row WHERE statement_row.dataset_id=ds.id
    AND statement_row.tenant_id=p_tenant AND statement_row.source_legajo=candidate.legacy_legajo)
 ), documentary_subjects AS MATERIALIZED(
  SELECT candidate.id AS contract_id,candidate.legacy_legajo AS legajo,subject.value IS NOT NULL AS present,
   subject.value#>>'{person,full_name}' AS name,subject.value#>>'{person,dni}' AS dni,
   subject.value#>>'{person,cuil}' AS cuil,subject.value#>>'{person,sex_code}' AS sex,
   (subject.value->>'sourceCutoff')::timestamptz AS cutoff,subject.value#>>'{contract,status}' AS status,
   subject.value#>>'{contract,source_batch_id}' AS source_batch_id,
   nullif(subject.value#>>'{contract,source_payload,personId}','') AS source_person_id,
   subject.value->>'adopted'='true' AS adopted
  FROM documentary_candidates candidate
  CROSS JOIN LATERAL(SELECT public.payroll_document_subject_v1(ctx,candidate.id) AS value OFFSET 0) subject
 ), effective_directory AS MATERIALIZED(
  SELECT employee.legajo,employee.person_id,employee.nombre,employee.sector_code,employee.sector
  FROM public.grh_effective_employees_v1 employee
  WHERE employee.company_id=ds.company_id AND employee.import_run_id=directory_batch.legacy_import_run_id
   AND EXISTS(SELECT 1 FROM public.payroll_detail_statement statement_row WHERE statement_row.dataset_id=ds.id
    AND statement_row.tenant_id=p_tenant AND statement_row.source_legajo=employee.legajo)
 ), statement_rows AS MATERIALIZED(
  SELECT statement_row.source_legajo,identity_info.*,amounts.a993,amounts.a995,mapped.assignments
  FROM public.payroll_detail_statement statement_row
  LEFT JOIN LATERAL(
   SELECT count(*) FILTER(WHERE resolved.present)::integer AS n,min(resolved.name) AS name,
    min(resolved.dni) AS dni,min(resolved.cuil) AS cuil,min(resolved.sex) AS sex,
    min(resolved.cutoff) AS cutoff,min(resolved.status) AS status
   FROM documentary_subjects resolved WHERE resolved.legajo=statement_row.source_legajo
  ) identity_info ON true
  LEFT JOIN LATERAL(
   SELECT CASE WHEN count(*) FILTER(WHERE ln->>'code'='993')=1 THEN max((ln->>'amount')::numeric) FILTER(WHERE ln->>'code'='993') END::numeric(24,2)::text a993,
    CASE WHEN count(*) FILTER(WHERE ln->>'code'='995')=1 THEN max((ln->>'amount')::numeric) FILTER(WHERE ln->>'code'='995') END::numeric(24,2)::text a995
   FROM jsonb_array_elements(statement_row.lines) ln
  ) amounts ON true
  LEFT JOIN LATERAL(
   SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',resolved.contract_id::text,'name',employee.nombre,
    'sectorCode',employee.sector_code,'sectorLabel',employee.sector) ORDER BY resolved.contract_id)
    FILTER(WHERE resolved.present AND(resolved.adopted OR resolved.source_batch_id=directory_batch.id::text)),'[]'::jsonb) AS assignments
   FROM documentary_subjects resolved LEFT JOIN effective_directory employee ON employee.legajo=statement_row.source_legajo
    AND(resolved.source_batch_id=directory_batch.id::text OR(resolved.source_person_id IS NOT NULL AND employee.person_id::text=resolved.source_person_id))
   WHERE resolved.legajo=statement_row.source_legajo
  ) mapped ON true
  WHERE statement_row.dataset_id=ds.id AND statement_row.tenant_id=p_tenant
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'legajo',s.source_legajo,'contractMatches',s.n,'name',CASE WHEN s.n=1 THEN s.name END,
  'dni',CASE WHEN s.n=1 THEN s.dni END,'cuil',CASE WHEN s.n=1 THEN s.cuil END,
  'sex',CASE WHEN s.n=1 THEN s.sex END,'identityCutoff',CASE WHEN s.n=1 THEN s.cutoff::text END,
  'contractStatus',CASE WHEN s.n=1 THEN s.status END,'concept993',s.a993,'concept995',s.a995
 ) ORDER BY length(s.source_legajo),s.source_legajo),'[]'::jsonb),
 coalesce(jsonb_agg(jsonb_build_object('number',s.source_legajo,'assignments',s.assignments)
  ORDER BY length(s.source_legajo),s.source_legajo),'[]'::jsonb)
 INTO rows_json,directory_records FROM statement_rows s;
 answer:=jsonb_build_object('version','payroll-export-roster.v1','found',true,'official',false,'datasetId',ds.id,
  'date',to_char(ds.payroll_date,'YYYY-MM-DD'),'type',ds.payroll_type,'total',actual_n,'sourceLabel',ds.source_label,
  'closureStatus',CASE ds.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END,
  'payloadHash',ds.payload_sha256,'reportHash',encode(digest(rows_json::text,'sha256'),'hex'),'rows',rows_json);
 -- Private projection; public HTTP whitelist remains unchanged.
 directory_value:=jsonb_build_object('version','payroll-document-assignments.v1',
  'scope',jsonb_build_object('tenantId',p_tenant,'bindingId',ctx->>'sourceBindingId',
   'database',ds.source_database,'companyId',ds.company_id,'datasetId',ds.id),
  'cutoff',to_char(directory_batch.source_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS')||'Z','records',directory_records);
 directory_value:=directory_value||jsonb_build_object('readVersion',public.employment_adoption_hash_v1(directory_value));
 answer:=answer||jsonb_build_object('documentaryDirectory',directory_value);
 INSERT INTO payroll_export_roster_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,dataset_id,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,ds.id,actual_n);
 RETURN answer;
END $body181$;
BEGIN
 PERFORM pg_advisory_xact_lock(181);PERFORM pg_advisory_xact_lock(178);
 SELECT * INTO prior FROM pg_proc WHERE oid=target;
 SELECT * INTO helper FROM pg_proc WHERE oid=to_regprocedure('public.payroll_document_subject_v1(jsonb,uuid)');
 IF prior.oid IS NULL OR prior.proowner<>current_user::regrole OR prior.prokind<>'f' OR NOT prior.prosecdef
  OR prior.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']
  OR helper.oid IS NULL OR helper.proowner<>prior.proowner OR helper.prokind<>'f' OR NOT helper.prosecdef
  OR helper.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']
  OR prior.proargnames IS DISTINCT FROM ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_dataset']::text[]
  OR helper.proargnames IS DISTINCT FROM ARRAY['ctx','target']::text[]
  OR EXISTS(SELECT 1 FROM pg_proc audited WHERE audited.oid IN(prior.oid,helper.oid) AND(
   audited.prorettype<>'jsonb'::regtype OR audited.proretset OR audited.proisstrict OR audited.provolatile<>'v'
   OR audited.proparallel<>'u' OR audited.proleakproof OR audited.prosupport<>0 OR audited.procost<>100 OR audited.prorows<>0
   OR audited.proargmodes IS NOT NULL OR audited.proallargtypes IS NOT NULL OR audited.pronargdefaults<>0
   OR(SELECT lanname FROM pg_language WHERE oid=audited.prolang)<>'plpgsql'))
  OR NOT has_function_privilege('municontrol_actions_runtime_app',prior.oid,'EXECUTE')
  OR has_function_privilege('municontrol_actions_runtime_app',helper.oid,'EXECUTE')
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(prior.proacl,acldefault('f',prior.proowner))) privilege
   WHERE privilege.grantee<>prior.proowner AND NOT(privilege.grantee='municontrol_actions_runtime_app'::regrole AND privilege.privilege_type='EXECUTE' AND NOT privilege.is_grantable))
  OR encode(public.digest(helper.prosrc,'sha256'),'hex')<>'b92e8220de522a9644bca8ccc5261c1a345101f88ae046e4519d36b42c48c7dd'
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(helper.proacl,acldefault('f',helper.proowner))) privilege WHERE privilege.grantee<>helper.proowner)
 THEN RAISE EXCEPTION 'DOCUMENTARY_ROSTER181_PREREQUISITE_CHANGED';END IF;
 old_body:=replace(prior.prosrc,E'\r\n',E'\n');body_hash:=encode(public.digest(old_body,'sha256'),'hex');
 IF body_hash NOT IN('35fd9c09629bfb49687c446c0293aa8ea748aefa4e4d66031d0358bb87a6702b','65b2d0f266b3cac9e5870f79e68e67d10f0a9ca459aa06609328f61523288659') THEN RAISE EXCEPTION 'DOCUMENTARY_ROSTER181_BODY_DRIFT';END IF;
 IF encode(public.digest(replacement_body,'sha256'),'hex')<>'65b2d0f266b3cac9e5870f79e68e67d10f0a9ca459aa06609328f61523288659' THEN RAISE EXCEPTION 'DOCUMENTARY_ROSTER181_PATCH_DRIFT';END IF;
 IF body_hash='65b2d0f266b3cac9e5870f79e68e67d10f0a9ca459aa06609328f61523288659' THEN RETURN;END IF;
 definition:=pg_get_functiondef(target);
 IF length(definition)-length(replace(definition,prior.prosrc,''))<>length(prior.prosrc) THEN RAISE EXCEPTION 'DOCUMENTARY_ROSTER181_ANCHOR_DRIFT';END IF;
 EXECUTE replace(definition,prior.prosrc,replacement_body);
 SELECT * INTO updated FROM pg_proc WHERE oid=target;
 IF to_jsonb(updated)-'prosrc' IS DISTINCT FROM to_jsonb(prior)-'prosrc'
  OR encode(public.digest(updated.prosrc,'sha256'),'hex')<>'65b2d0f266b3cac9e5870f79e68e67d10f0a9ca459aa06609328f61523288659'
 THEN RAISE EXCEPTION 'DOCUMENTARY_ROSTER181_METADATA_CHANGED';END IF;
END $documentary181$;
