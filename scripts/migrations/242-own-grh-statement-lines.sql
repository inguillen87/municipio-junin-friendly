-- Comparador MuniControl contra GRH · lectura por legajo de una liquidación GRH incorporada (payroll_detail_*).
-- Additive, session-bound reader: no payroll calculation, no writes to people, amounts or datasets.
-- Codex owns installation. Same authority as the per-legajo detail and the export roster
-- (payroll.read + workforce.employee.read). Returns source legajo numbers and GRH lines only: no name,
-- DNI, CUIL or contract identity. A dataset whose stored statements or lines do not match its declared
-- counts is refused (no partial source). Every read is audited.
DO $prerequisite$
BEGIN
  IF to_regprocedure('public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)') IS NULL
    OR to_regprocedure('public.action_center_context_has_capability(jsonb,text)') IS NULL
    OR to_regprocedure('public.employee_payroll_read_reject_change_v1()') IS NULL
    OR to_regclass('public.payroll_detail_dataset') IS NULL
    OR to_regclass('public.payroll_detail_statement') IS NULL
    OR to_regrole('municontrol_actions_runtime_app') IS NULL THEN
    RAISE EXCEPTION 'OWN_GRH_STATEMENT_LINES_PREREQUISITE';
  END IF;
  IF to_regprocedure('public.own_grh_statement_lines_v1(text,uuid,integer,text,uuid,uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'OWN_GRH_STATEMENT_LINES_ALREADY_INSTALLED';
  END IF;
END
$prerequisite$;

CREATE TABLE IF NOT EXISTS own_grh_statement_lines_read_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 source_binding_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 dataset_id uuid REFERENCES payroll_detail_dataset(id),
 outcome text NOT NULL CHECK(outcome IN ('success','not_found')),
 result_count integer NOT NULL CHECK(result_count BETWEEN 0 AND 2000), occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
REVOKE ALL ON own_grh_statement_lines_read_event FROM PUBLIC,municontrol_actions_runtime_app;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='own_grh_statement_lines_read_event_immutable') THEN
 CREATE TRIGGER own_grh_statement_lines_read_event_immutable BEFORE UPDATE OR DELETE ON own_grh_statement_lines_read_event FOR EACH ROW EXECUTE FUNCTION employee_payroll_read_reject_change_v1();
END IF;END $$;

CREATE FUNCTION public.own_grh_statement_lines_v1(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_dataset uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb;ds payroll_detail_dataset%ROWTYPE;actual_n integer;actual_lines integer;statements_json jsonb;concepts_json jsonb;answer jsonb;
BEGIN
 IF p_dataset IS NULL THEN RAISE EXCEPTION 'OWN_GRH_STATEMENT_LINES_QUERY_INVALID';END IF;
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'payroll.read') OR NOT action_center_context_has_capability(ctx,'workforce.employee.read') THEN
  RAISE EXCEPTION 'OWN_GRH_STATEMENT_LINES_CAPABILITY_REQUIRED';
 END IF;
 SELECT * INTO ds FROM payroll_detail_dataset d
 WHERE d.id=p_dataset AND d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.company_id=(ctx->>'sourceCompanyId')::bigint AND d.source_database=ctx->>'sourceDatabase';
 IF NOT FOUND THEN
  INSERT INTO own_grh_statement_lines_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,dataset_id,outcome,result_count)
  VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,NULL,'not_found',0);
  RETURN jsonb_build_object('version','grh-statement-lines-compact.v1','found',false,'official',false);
 END IF;
 SELECT count(*),coalesce(sum(jsonb_array_length(s.lines)),0) INTO actual_n,actual_lines
 FROM payroll_detail_statement s WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant;
 IF actual_n<>ds.statement_count OR actual_lines<>ds.line_count THEN RAISE EXCEPTION 'OWN_GRH_STATEMENT_LINES_SOURCE_INCOMPLETE';END IF;
 -- Forma de transporte compacta (grh-statement-lines-compact.v1): el catálogo de los conceptos usados va una
 -- sola vez y cada renglón es [código, importe, cantidad]. La forma expandida superaba el límite de respuesta.
 SELECT coalesce(jsonb_object_agg(q.code,jsonb_build_object('description',ds.concept_catalog->q.code->>'description',
   'totalGroup',ds.concept_catalog->q.code->>'totalGroup','unit',ds.concept_catalog->q.code->>'unit')),'{}'::jsonb) INTO concepts_json
 FROM (SELECT DISTINCT ln->>'code' code FROM payroll_detail_statement s CROSS JOIN LATERAL jsonb_array_elements(s.lines) ln
  WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant) q;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'legajo',s.source_legajo,'statementId',s.id,'statementHash',s.statement_sha256,
   'lines',(SELECT coalesce(jsonb_agg(jsonb_build_array(ln->>'code',ln->>'amount',ln->>'quantity')
     ORDER BY (ln->>'code')::integer),'[]'::jsonb) FROM jsonb_array_elements(s.lines) ln))
  ORDER BY length(s.source_legajo),s.source_legajo),'[]'::jsonb) INTO statements_json
 FROM payroll_detail_statement s WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant;
 answer:=jsonb_build_object('version','grh-statement-lines-compact.v1','found',true,'official',false,'datasetId',ds.id,
  'period',ds.source_period::text||'-'||lpad(ds.source_month::text,2,'0'),'payrollType',ds.payroll_type,
  'closureStatus',CASE ds.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END,
  'sourceHash',ds.source_sha256,'complete',true,'concepts',concepts_json,'statements',statements_json);
 INSERT INTO own_grh_statement_lines_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,dataset_id,outcome,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,ds.id,'success',actual_n);
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.own_grh_statement_lines_v1(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.own_grh_statement_lines_v1(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;
