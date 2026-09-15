-- Additive private source, matched by the exact GRH backup hash. No payroll writes.
CREATE TABLE IF NOT EXISTS payroll_bank_source (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, source_binding_id uuid NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 source_database text NOT NULL, company_id bigint NOT NULL, source_cutoff text NOT NULL,
 employee_count integer NOT NULL CHECK(employee_count BETWEEN 1 AND 5000),
 assignment_count integer NOT NULL CHECK(assignment_count BETWEEN 0 AND 5000),
 source_payload jsonb NOT NULL CHECK(jsonb_typeof(source_payload)='object'),
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,source_binding_id,source_sha256,source_database,company_id),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS payroll_bank_report_read_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, source_binding_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 dataset_id uuid REFERENCES payroll_detail_dataset(id), row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 5000),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
REVOKE ALL ON payroll_bank_source,payroll_bank_report_read_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION payroll_bank_source_immutable_v1() RETURNS trigger
 LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'PAYROLL_BANK_SOURCE_IMMUTABLE'; END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='payroll_bank_source_immutable') THEN
  CREATE TRIGGER payroll_bank_source_immutable BEFORE UPDATE OR DELETE ON payroll_bank_source FOR EACH ROW EXECUTE FUNCTION payroll_bank_source_immutable_v1();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='payroll_bank_report_read_event_immutable') THEN
  CREATE TRIGGER payroll_bank_report_read_event_immutable BEFORE UPDATE OR DELETE ON payroll_bank_report_read_event FOR EACH ROW EXECUTE FUNCTION payroll_bank_source_immutable_v1();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='payroll_bank_source_no_truncate') THEN
  CREATE TRIGGER payroll_bank_source_no_truncate BEFORE TRUNCATE ON payroll_bank_source FOR EACH STATEMENT EXECUTE FUNCTION payroll_bank_source_immutable_v1();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='payroll_bank_report_read_event_no_truncate') THEN
  CREATE TRIGGER payroll_bank_report_read_event_no_truncate BEFORE TRUNCATE ON payroll_bank_report_read_event FOR EACH STATEMENT EXECUTE FUNCTION payroll_bank_source_immutable_v1();
 END IF;
END $$;
CREATE OR REPLACE FUNCTION payroll_bank_source_report_v1(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_dataset uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; ds payroll_detail_dataset%ROWTYPE; bs payroll_bank_source%ROWTYPE; result_rows jsonb; result_value jsonb; actual_count integer;
BEGIN
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'payroll.read') OR NOT action_center_context_has_capability(ctx,'workforce.employee.read') THEN
  RAISE EXCEPTION 'PAYROLL_BANK_CAPABILITY_REQUIRED';
 END IF;
 IF p_dataset IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('datasetId',d.id,'period',d.source_period::text||'-'||lpad(d.source_month::text,2,'0'),
   'date',to_char(d.payroll_date,'YYYY-MM-DD'),'type',d.payroll_type,'statementCount',d.statement_count,'sourceLabel',d.source_label,'sourceSha256',d.source_sha256,
   'bankSourceAvailable',EXISTS(SELECT 1 FROM payroll_bank_source b WHERE b.tenant_id=d.tenant_id AND b.source_binding_id=d.source_binding_id
    AND b.source_sha256=d.source_sha256 AND b.source_database=d.source_database AND b.company_id=d.company_id)) ORDER BY d.payroll_date DESC,d.payroll_type,d.id),'[]'::jsonb)
  INTO result_rows FROM (SELECT * FROM payroll_detail_dataset
   WHERE tenant_id=p_tenant AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND company_id=(ctx->>'sourceCompanyId')::bigint
    AND source_database=ctx->>'sourceDatabase' ORDER BY payroll_date DESC,payroll_type,id LIMIT 240) d;
  result_value:=jsonb_build_object('version','payroll-bank-report.v1','mode','catalog','items',result_rows);
  actual_count:=jsonb_array_length(result_rows);
 ELSE
  SELECT * INTO ds FROM payroll_detail_dataset d WHERE d.id=p_dataset AND d.tenant_id=p_tenant
   AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid AND d.company_id=(ctx->>'sourceCompanyId')::bigint AND d.source_database=ctx->>'sourceDatabase';
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_BANK_NOT_FOUND'; END IF;
  SELECT * INTO bs FROM payroll_bank_source b WHERE b.tenant_id=p_tenant AND b.source_binding_id=ds.source_binding_id
   AND b.source_sha256=ds.source_sha256 AND b.source_database=ds.source_database AND b.company_id=ds.company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_BANK_SOURCE_REQUIRED'; END IF;
  IF bs.source_payload->>'version' IS DISTINCT FROM 'payroll-bank-source.v1' OR bs.source_payload->>'sourceSha256' IS DISTINCT FROM ds.source_sha256
   OR bs.source_payload->>'sourceDatabase' IS DISTINCT FROM ds.source_database OR bs.source_payload->>'company' IS DISTINCT FROM ds.company_id::text
   OR jsonb_array_length(bs.source_payload->'employees')<>bs.employee_count OR jsonb_array_length(bs.source_payload->'assignments')<>bs.assignment_count
   OR upper(btrim(ds.concept_catalog->'999'->>'description')) IS DISTINCT FROM 'NETO A PAGAR' THEN RAISE EXCEPTION 'PAYROLL_BANK_SOURCE_DRIFT'; END IF;
  SELECT count(*) INTO actual_count FROM payroll_detail_statement WHERE dataset_id=ds.id AND tenant_id=p_tenant;
  IF actual_count<>ds.statement_count OR actual_count NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'PAYROLL_BANK_SOURCE_DRIFT'; END IF;
  WITH employee AS MATERIALIZED (SELECT e FROM jsonb_array_elements(bs.source_payload->'employees') e),
   banks AS MATERIALIZED (SELECT b FROM jsonb_array_elements(bs.source_payload->'banks') b),
   assignment AS MATERIALIZED (SELECT a FROM jsonb_array_elements(bs.source_payload->'assignments') a
    WHERE a->>'period'=ds.source_period::text||'-'||lpad(ds.source_month::text,2,'0') AND a->>'date'=to_char(ds.payroll_date,'YYYY-MM-DD') AND a->>'type'=ds.payroll_type)
  SELECT coalesce(jsonb_agg(jsonb_build_object('legajo',s.source_legajo,'name',e->>'name','cuil',e->>'cuil','bankCode',e->>'bankCode',
   'bankLabel',b->>'label','accountTypeCode',e->>'accountTypeCode','accountNumber',e->>'accountNumber','cbuLegacy',e->>'cbuLegacy','cbuCurrent',e->>'cbuCurrent',
   'repartitionCode',a->>'repartitionCode','repartitionLabel',a->>'repartitionLabel','netAmount',net.amount)
   ORDER BY length(s.source_legajo),s.source_legajo),'[]'::jsonb) INTO result_rows
  FROM payroll_detail_statement s LEFT JOIN employee ON e->>'legajo'=s.source_legajo LEFT JOIN banks ON b->>'code'=e->>'bankCode'
  LEFT JOIN assignment ON a->>'legajo'=s.source_legajo
  LEFT JOIN LATERAL (SELECT CASE WHEN count(*)=1 AND count(ln->>'amount')=1 THEN max((ln->>'amount')::numeric)::numeric(24,2)::text END amount
   FROM jsonb_array_elements(s.lines) ln WHERE ln->>'code'='999') net ON true
  WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant;
  IF jsonb_array_length(result_rows)<>actual_count THEN RAISE EXCEPTION 'PAYROLL_BANK_SOURCE_DRIFT'; END IF;
  result_value:=jsonb_build_object('version','payroll-bank-source-read.v1','mode','report',
   'dataset',jsonb_build_object('datasetId',ds.id,'period',ds.source_period::text||'-'||lpad(ds.source_month::text,2,'0'),'date',to_char(ds.payroll_date,'YYYY-MM-DD'),
    'type',ds.payroll_type,'statementCount',ds.statement_count,'sourceLabel',ds.source_label,'sourceSha256',ds.source_sha256,'payloadHash',ds.payload_sha256),
   'bankSource',jsonb_build_object('sourceSha256',bs.source_sha256,'payloadSha256',bs.payload_sha256,'cutoff',bs.source_cutoff),'rows',result_rows);
 END IF;
 INSERT INTO payroll_bank_report_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,dataset_id,row_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,p_dataset,actual_count);
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION payroll_bank_source_report_v1(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_bank_source_report_v1(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;
