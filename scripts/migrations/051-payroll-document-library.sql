-- Read-only document availability, independent of the older monthly summary.
-- Changes no payroll fact, liquidated amount, document signature or source dataset.
CREATE OR REPLACE FUNCTION employee_payroll_documents_v1(
 p_email text,p_session uuid,p_version integer,p_release text,
 p_tenant uuid,p_membership uuid,p_contract uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; ec employment_contract%ROWTYPE; result_items jsonb:='[]';
 total_items integer:=0; outcome_value text:='not_found';
BEGIN
 IF p_contract IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_PAYROLL_QUERY_INVALID'; END IF;
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'workforce.employee.read')
    OR NOT action_center_context_has_capability(ctx,'payroll.read') THEN
   RAISE EXCEPTION 'EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED';
 END IF;
 SELECT c.* INTO ec FROM employment_contract c
 JOIN source_import_batch sb ON sb.id=c.source_batch_id AND sb.source_system='GRH'
   AND sb.source_database=ctx->>'sourceDatabase' AND sb.validation_state='published'
   AND sb.legacy_import_run_id IS NOT NULL
 WHERE c.id=p_contract AND c.source_system='GRH'
   AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint FOR SHARE OF c,sb;
 IF FOUND THEN
   WITH available AS (
     SELECT d.id AS dataset_id,d.payroll_date,d.source_period,d.source_month,d.payroll_type,
       d.source_closed_flag,d.source_label,d.imported_at,jsonb_array_length(st.lines) AS concept_count,
       row_number() OVER (PARTITION BY d.payroll_date,d.source_period,d.source_month,d.payroll_type
         ORDER BY d.imported_at DESC,d.id ASC) AS revision_rank,
       count(*) OVER (PARTITION BY d.payroll_date,d.source_period,d.source_month,d.payroll_type) AS versions
     FROM payroll_detail_dataset d JOIN payroll_detail_statement st
       ON st.dataset_id=d.id AND st.tenant_id=d.tenant_id AND st.source_legajo=ec.legacy_legajo::text
     WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
       AND d.company_id=ec.legacy_company_id AND d.source_database=ctx->>'sourceDatabase'
   ), latest AS (SELECT * FROM available WHERE revision_rank=1),
   bounded AS (SELECT * FROM latest ORDER BY payroll_date DESC,payroll_type,source_period DESC,source_month DESC LIMIT 1000)
   SELECT (SELECT count(*)::integer FROM latest),
     coalesce(jsonb_agg(jsonb_build_object(
       'datasetId',x.dataset_id,'payrollDate',to_char(x.payroll_date,'YYYY-MM-DD'),
       'sourcePeriod',x.source_period,'sourceMonth',x.source_month,'payrollType',x.payroll_type,
       'closureStatus',CASE x.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END,
       'sourceLabel',x.source_label,'importedAt',x.imported_at,'conceptCount',x.concept_count,
       'versionsAvailable',x.versions,
       'historySummaryAvailable',EXISTS(
         SELECT 1 FROM payroll_monthly_fact f JOIN payroll_run r ON r.id=f.payroll_run_id
           AND r.source_system=f.source_system AND r.source_batch_id=f.source_batch_id
         JOIN source_import_batch sb ON sb.id=f.source_batch_id AND sb.source_system='GRH'
           AND sb.source_database=ctx->>'sourceDatabase' AND sb.validation_state='published'
           AND sb.legacy_import_run_id IS NOT NULL
         WHERE f.employment_contract_id=ec.id AND f.source_system='GRH'
           AND r.company_source_id=ec.legacy_company_id::text
           AND f.payroll_date=x.payroll_date AND f.payroll_type=x.payroll_type
           AND f.source_period=x.source_period AND f.source_month=x.source_month
       )) ORDER BY x.payroll_date DESC,x.payroll_type,x.source_period DESC,x.source_month DESC),'[]'::jsonb)
   INTO total_items,result_items FROM bounded x;
   outcome_value:=CASE WHEN total_items>0 THEN 'success' ELSE 'no_detail' END;
 END IF;
 INSERT INTO employee_payroll_detail_read_event(
   tenant_id,source_binding_id,actor_membership_id,actor_session_id,target_contract_id,
   dataset_id,request_sha256,outcome,result_count
 ) VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,
   CASE WHEN outcome_value<>'not_found' THEN p_contract END,NULL,
   encode(digest(jsonb_build_array('document_library.v1',p_contract)::text,'sha256'),'hex'),
   outcome_value,jsonb_array_length(result_items));
 RETURN jsonb_build_object('version','payroll-document-library.v1','found',outcome_value<>'not_found',
   'items',result_items,'total',total_items,'truncated',total_items>1000,
   'officialReceipt',false,'signatureApplied',false);
END $$;
REVOKE ALL ON FUNCTION employee_payroll_documents_v1(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION employee_payroll_documents_v1(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;
