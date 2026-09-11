-- Aggregated reports from existing detail datasets. No payroll calculation or amount writes.
CREATE TABLE IF NOT EXISTS payroll_source_report_read_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 source_binding_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 dataset_id uuid REFERENCES payroll_detail_dataset(id),
 outcome text NOT NULL CHECK(outcome IN ('catalog','report','not_found')),
 result_count integer NOT NULL CHECK(result_count BETWEEN 0 AND 1000), occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
REVOKE ALL ON payroll_source_report_read_event FROM PUBLIC,municontrol_actions_runtime_app;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='payroll_source_report_read_event_immutable') THEN
 CREATE TRIGGER payroll_source_report_read_event_immutable BEFORE UPDATE OR DELETE ON payroll_source_report_read_event FOR EACH ROW EXECUTE FUNCTION employee_payroll_read_reject_change_v1();
END IF;END $$;
CREATE OR REPLACE FUNCTION payroll_source_report_v1(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_dataset uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb;ds payroll_detail_dataset%ROWTYPE;rows_json jsonb;items_json jsonb;total_n integer;actual_n integer;actual_lines integer;answer jsonb;outcome_value text;count_value integer;
BEGIN
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'payroll.read') THEN RAISE EXCEPTION 'PAYROLL_REPORT_CAPABILITY_REQUIRED';END IF;
 IF p_dataset IS NULL THEN
  SELECT count(*) INTO total_n FROM payroll_detail_dataset d WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid AND d.company_id=(ctx->>'sourceCompanyId')::bigint AND d.source_database=ctx->>'sourceDatabase';
  SELECT coalesce(jsonb_agg(jsonb_build_object('datasetId',d.id,'date',to_char(d.payroll_date,'YYYY-MM-DD'),'type',d.payroll_type,'statementCount',d.statement_count,'lineCount',d.line_count,'closureStatus',CASE d.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END,'payloadHash',d.payload_sha256,'sourceLabel',d.source_label) ORDER BY d.payroll_date DESC,d.payroll_type,d.imported_at DESC,d.id),'[]'::jsonb) INTO items_json
  FROM (SELECT * FROM payroll_detail_dataset x WHERE x.tenant_id=p_tenant AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.company_id=(ctx->>'sourceCompanyId')::bigint AND x.source_database=ctx->>'sourceDatabase' ORDER BY x.payroll_date DESC,x.payroll_type,x.imported_at DESC,x.id LIMIT 240)d;
  answer:=jsonb_build_object('version','payroll-source-report.v1','mode','catalog','items',items_json,'total',total_n,'truncated',total_n>240,'official',false);outcome_value:='catalog';count_value:=jsonb_array_length(items_json);
 ELSE
  SELECT * INTO ds FROM payroll_detail_dataset d WHERE d.id=p_dataset AND d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid AND d.company_id=(ctx->>'sourceCompanyId')::bigint AND d.source_database=ctx->>'sourceDatabase';
  IF NOT FOUND THEN answer:=jsonb_build_object('version','payroll-source-report.v1','mode','report','found',false,'official',false);outcome_value:='not_found';count_value:=0;
  ELSE
   SELECT count(*),coalesce(sum(jsonb_array_length(s.lines)),0) INTO actual_n,actual_lines FROM payroll_detail_statement s WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant;
   IF actual_n<>ds.statement_count OR actual_lines<>ds.line_count THEN RAISE EXCEPTION 'PAYROLL_REPORT_SOURCE_INCOMPLETE';END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('code',q.code,'description',ds.concept_catalog->q.code->>'description','totalGroup',ds.concept_catalog->q.code->>'totalGroup','unit',ds.concept_catalog->q.code->>'unit','sourceRows',q.n,'missingAmounts',q.missing,'amount',CASE WHEN q.missing=0 THEN q.amount::numeric(24,2)::text ELSE NULL END) ORDER BY q.code::integer),'[]'::jsonb) INTO rows_json
   FROM (SELECT ln->>'code' code,count(*)::integer n,count(*) FILTER(WHERE ln->>'amount' IS NULL)::integer missing,sum((ln->>'amount')::numeric) amount FROM payroll_detail_statement s CROSS JOIN LATERAL jsonb_array_elements(s.lines)ln WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant GROUP BY ln->>'code')q;
   count_value:=jsonb_array_length(rows_json);IF count_value>1000 THEN RAISE EXCEPTION 'PAYROLL_REPORT_LIMIT';END IF;
   outcome_value:='report';answer:=jsonb_build_object('version','payroll-source-report.v1','mode','report','found',true,'datasetId',ds.id,'payloadHash',ds.payload_sha256,'reportHash',encode(digest(rows_json::text,'sha256'),'hex'),'date',to_char(ds.payroll_date,'YYYY-MM-DD'),'type',ds.payroll_type,'statementCount',ds.statement_count,'lineCount',ds.line_count,'sourceLabel',ds.source_label,'closureStatus',CASE ds.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END,'rows',rows_json,'official',false);
  END IF;
 END IF;
 INSERT INTO payroll_source_report_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,dataset_id,outcome,result_count) VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,ds.id,outcome_value,count_value);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION payroll_source_report_v1(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_source_report_v1(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;
