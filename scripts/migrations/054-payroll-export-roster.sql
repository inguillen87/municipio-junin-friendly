-- Additive, session-bound reader. No modification of people, amounts or clock events.
CREATE TABLE IF NOT EXISTS payroll_export_roster_read_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES platform_tenant(id), source_binding_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 dataset_id uuid REFERENCES payroll_detail_dataset(id), result_count integer NOT NULL CHECK(result_count BETWEEN 0 AND 2000),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
REVOKE ALL ON payroll_export_roster_read_event FROM PUBLIC,municontrol_actions_runtime_app;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='payroll_export_roster_read_event_immutable') THEN
  CREATE TRIGGER payroll_export_roster_read_event_immutable BEFORE UPDATE OR DELETE ON payroll_export_roster_read_event
   FOR EACH ROW EXECUTE FUNCTION employee_payroll_read_reject_change_v1();
 END IF;
END $$;
CREATE OR REPLACE FUNCTION payroll_export_roster_v1(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_dataset uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; ds payroll_detail_dataset%ROWTYPE; rows_json jsonb; answer jsonb; actual_n integer;
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
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'legajo',s.source_legajo,'contractMatches',identity_info.n,
  'name',CASE WHEN identity_info.n=1 THEN identity_info.name END,
  'dni',CASE WHEN identity_info.n=1 THEN identity_info.dni END,
  'cuil',CASE WHEN identity_info.n=1 THEN identity_info.cuil END,
  'sex',CASE WHEN identity_info.n=1 THEN identity_info.sex END,
  'identityCutoff',CASE WHEN identity_info.n=1 THEN identity_info.cutoff::text END,
  'contractStatus',CASE WHEN identity_info.n=1 THEN identity_info.status END,
  'concept993',amounts.a993,'concept995',amounts.a995
 ) ORDER BY length(s.source_legajo),s.source_legajo),'[]'::jsonb) INTO rows_json
 FROM payroll_detail_statement s
 LEFT JOIN LATERAL (
  SELECT count(*)::integer n,min(i.full_name) name,min(i.dni) dni,min(i.cuil) cuil,min(i.sex_code) sex,min(sb.source_cutoff) cutoff,min(c.status) status
  FROM employment_contract c
  JOIN source_import_batch sb ON sb.id=c.source_batch_id AND sb.source_system='GRH' AND sb.source_database=ds.source_database
    AND sb.validation_state='published' AND sb.legacy_import_run_id IS NOT NULL
  LEFT JOIN person_identity i ON i.id=c.person_id
  WHERE c.source_system='GRH' AND c.legacy_company_id=ds.company_id AND c.legacy_legajo=s.source_legajo
 ) identity_info ON true
 LEFT JOIN LATERAL (
  SELECT CASE WHEN count(*) FILTER(WHERE ln->>'code'='993')=1 THEN max((ln->>'amount')::numeric) FILTER(WHERE ln->>'code'='993') END::numeric(24,2)::text a993,
   CASE WHEN count(*) FILTER(WHERE ln->>'code'='995')=1 THEN max((ln->>'amount')::numeric) FILTER(WHERE ln->>'code'='995') END::numeric(24,2)::text a995
  FROM jsonb_array_elements(s.lines) ln
 ) amounts ON true
 WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant;
 answer:=jsonb_build_object('version','payroll-export-roster.v1','found',true,'official',false,'datasetId',ds.id,
  'date',to_char(ds.payroll_date,'YYYY-MM-DD'),'type',ds.payroll_type,'total',actual_n,'sourceLabel',ds.source_label,
  'closureStatus',CASE ds.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END,
  'payloadHash',ds.payload_sha256,'reportHash',encode(digest(rows_json::text,'sha256'),'hex'),'rows',rows_json);
 INSERT INTO payroll_export_roster_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,dataset_id,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,ds.id,actual_n);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION payroll_export_roster_v1(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_export_roster_v1(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;
