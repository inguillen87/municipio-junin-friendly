-- Additive detail source. Never changes a payroll run, monthly fact or payment.
CREATE TABLE IF NOT EXISTS payroll_detail_dataset (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, source_binding_id uuid NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 source_database text NOT NULL, source_label text NOT NULL,
 company_id bigint NOT NULL, payroll_date date NOT NULL, source_period integer NOT NULL,
 source_month integer NOT NULL CHECK(source_month BETWEEN 1 AND 12), payroll_type text NOT NULL,
 source_closed_flag integer CHECK(source_closed_flag IN (0,1)),
 concept_catalog jsonb NOT NULL CHECK(jsonb_typeof(concept_catalog)='object'),
 statement_count integer NOT NULL CHECK(statement_count BETWEEN 1 AND 2000),
 line_count integer NOT NULL CHECK(line_count BETWEEN 1 AND 30000),
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,tenant_id),
 UNIQUE(tenant_id,source_binding_id,source_sha256,payroll_date,source_period,source_month,payroll_type),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS payroll_detail_statement (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dataset_id uuid NOT NULL, tenant_id uuid NOT NULL,
 source_legajo text NOT NULL CHECK(source_legajo ~ '^[0-9]{1,12}$'),
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 1000),
 statement_sha256 text NOT NULL CHECK(statement_sha256 ~ '^[a-f0-9]{64}$'),
 FOREIGN KEY(dataset_id,tenant_id) REFERENCES payroll_detail_dataset(id,tenant_id),
 UNIQUE(dataset_id,source_legajo)
);
CREATE TABLE IF NOT EXISTS payroll_detail_delivery_job (
 id uuid PRIMARY KEY, tenant_id uuid NOT NULL, source_binding_id uuid NOT NULL,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 cipher_sha256 text NOT NULL CHECK(cipher_sha256 ~ '^[a-f0-9]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256 ~ '^[a-f0-9]{64}$'),
 passphrase text CHECK(length(passphrase)>=48),
 payload_bytes integer NOT NULL CHECK(payload_bytes BETWEEN 1 AND 6000000),
 statement_count integer NOT NULL CHECK(statement_count BETWEEN 1 AND 2000),
 line_count integer NOT NULL CHECK(line_count BETWEEN 1 AND 30000),
 requested_by uuid NOT NULL, expires_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'authorized' CHECK(state IN ('authorized','applied','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz, receipt jsonb,
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(requested_by,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
CREATE TABLE IF NOT EXISTS employee_payroll_detail_read_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 source_binding_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 target_contract_id uuid REFERENCES employment_contract(id),dataset_id uuid REFERENCES payroll_detail_dataset(id),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 outcome text NOT NULL CHECK(outcome IN ('success','no_detail','not_found')),
 result_count integer NOT NULL CHECK(result_count BETWEEN 0 AND 1000),occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
REVOKE ALL ON payroll_detail_dataset,payroll_detail_statement,payroll_detail_delivery_job,employee_payroll_detail_read_event FROM PUBLIC,municontrol_actions_runtime_app;
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['payroll_detail_dataset','payroll_detail_statement','employee_payroll_detail_read_event'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable') THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION employee_payroll_read_reject_change_v1()',t||'_immutable',t);
 END IF;END LOOP;END $$;

-- Exact owner-preauthorized ciphertext, not arbitrary unauthenticated imports.
CREATE OR REPLACE FUNCTION payroll_detail_delivery_v1(p_job uuid,p_cipher bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j payroll_detail_delivery_job%ROWTYPE;b platform_tenant_source_binding%ROWTYPE;
 plain bytea;payload jsonb;count_lines integer;answer jsonb;new_id uuid;
BEGIN
 IF p_job IS NULL OR p_cipher IS NULL OR octet_length(p_cipher) NOT BETWEEN 32 AND 1048576 THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 SELECT * INTO j FROM payroll_detail_delivery_job WHERE id=p_job FOR UPDATE NOWAIT;
 IF NOT FOUND OR j.cipher_sha256<>encode(digest(p_cipher,'sha256'),'hex') OR j.expires_at<clock_timestamp() OR j.state='revoked' THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 IF j.state='applied' THEN RETURN j.receipt||'{"replayed":true}'::jsonb;END IF;
 SELECT sb.* INTO b FROM platform_tenant_source_binding sb JOIN tenant_identity_policy p
 ON p.tenant_id=sb.tenant_id AND p.certified_source_binding_id=sb.id AND p.tenant_data_plane_ready
 WHERE sb.id=j.source_binding_id AND sb.tenant_id=j.tenant_id AND sb.verified FOR SHARE OF sb,p;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM tenant_membership WHERE id=j.requested_by AND tenant_id=j.tenant_id AND status='active') THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 plain:=pgp_sym_decrypt_bytea(p_cipher,j.passphrase);
 IF octet_length(plain)<>j.payload_bytes OR encode(digest(plain,'sha256'),'hex')<>j.payload_sha256 THEN RAISE EXCEPTION 'PAYROLL_DETAIL_DELIVERY_DENIED';END IF;
 payload:=convert_from(plain,'UTF8')::jsonb;
 IF payload->>'version' IS DISTINCT FROM 'payroll-detail-source.v1' OR payload->>'sourceSha256' IS DISTINCT FROM j.source_sha256 OR payload->>'sourceDatabase' IS DISTINCT FROM b.source_database OR (payload->>'company')::bigint IS DISTINCT FROM b.source_company_id OR jsonb_typeof(payload->'concepts') IS DISTINCT FROM 'object' OR jsonb_typeof(payload->'statements') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'statements')<>j.statement_count OR (payload->>'type') !~ '^[A-Z]$' OR length(payload->>'sourceLabel') NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'PAYROLL_DETAIL_SOURCE_INVALID';END IF;
 SELECT sum(jsonb_array_length(st->'lines'))::integer INTO count_lines FROM jsonb_array_elements(payload->'statements') st;
 IF count_lines<>j.line_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'statements') st WHERE st->>'legajo' !~ '^[0-9]{1,12}$' OR jsonb_typeof(st->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(st->'lines') NOT BETWEEN 1 AND 1000) THEN RAISE EXCEPTION 'PAYROLL_DETAIL_SOURCE_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'statements') st CROSS JOIN LATERAL jsonb_array_elements(st->'lines') ln WHERE ln->>'code' IS NULL OR ln->>'code' !~ '^[0-9]{1,6}$' OR (ln->>'amount' IS NOT NULL AND ln->>'amount' !~ '^-?[0-9]{1,13}\.[0-9]{2}$') OR (ln->>'quantity' IS NOT NULL AND ln->>'quantity' !~ '^-?[0-9]{1,13}\.[0-9]{2}$')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'statements') st CROSS JOIN LATERAL jsonb_array_elements(st->'lines') ln GROUP BY st->>'legajo',ln->>'code' HAVING count(*)>1) THEN RAISE EXCEPTION 'PAYROLL_DETAIL_SOURCE_INVALID';END IF;
 new_id:=j.id;
 INSERT INTO payroll_detail_dataset(id,tenant_id,source_binding_id,source_sha256,payload_sha256,source_database,source_label,company_id,payroll_date,source_period,source_month,payroll_type,source_closed_flag,concept_catalog,statement_count,line_count)
 VALUES(new_id,j.tenant_id,j.source_binding_id,j.source_sha256,j.payload_sha256,b.source_database,payload->>'sourceLabel',b.source_company_id,(payload->>'date')::date,(payload->>'period')::integer,(payload->>'month')::integer,payload->>'type',(payload->>'closedFlag')::integer,payload->'concepts',j.statement_count,count_lines);
 INSERT INTO payroll_detail_statement(dataset_id,tenant_id,source_legajo,lines,statement_sha256)
 SELECT new_id,j.tenant_id,st->>'legajo',st->'lines',encode(digest((st->'lines')::text,'sha256'),'hex') FROM jsonb_array_elements(payload->'statements') st;
 answer:=jsonb_build_object('datasetId',new_id,'statements',j.statement_count,'lines',count_lines,'replayed',false,'payrollModified',false);
 UPDATE payroll_detail_delivery_job SET state='applied',passphrase=NULL,applied_at=clock_timestamp(),receipt=answer WHERE id=j.id;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION payroll_detail_delivery_v1(uuid,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_detail_delivery_v1(uuid,bytea) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION employee_payroll_detail_v1(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_contract uuid,p_date date,p_type text,p_period integer,p_month integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb;ec employment_contract%ROWTYPE;ds payroll_detail_dataset%ROWTYPE;st payroll_detail_statement%ROWTYPE;
 actual jsonb;line_json jsonb;outcome_value text:='not_found';count_value integer:=0;result_value jsonb;
BEGIN
 IF p_contract IS NULL OR p_date IS NULL OR p_type IS NULL OR p_type!~'^[A-Z]$' OR p_period IS NULL OR p_period NOT BETWEEN 1900 AND 2100 OR p_month IS NULL OR p_month NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'EMPLOYEE_PAYROLL_QUERY_INVALID';END IF;
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'workforce.employee.read') OR NOT action_center_context_has_capability(ctx,'payroll.read') THEN RAISE EXCEPTION 'EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED';END IF;
 SELECT c.* INTO ec FROM employment_contract c JOIN source_import_batch sb ON sb.id=c.source_batch_id AND sb.source_system='GRH' AND sb.source_database=ctx->>'sourceDatabase' AND sb.validation_state='published' AND sb.legacy_import_run_id IS NOT NULL
 WHERE c.id=p_contract AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint FOR SHARE OF c,sb;
 IF FOUND THEN
 outcome_value:='no_detail';
 SELECT d.* INTO ds FROM payroll_detail_dataset d JOIN payroll_detail_statement s ON s.dataset_id=d.id AND s.tenant_id=d.tenant_id AND s.source_legajo=ec.legacy_legajo::text
 WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid AND d.company_id=ec.legacy_company_id AND d.source_database=ctx->>'sourceDatabase' AND d.payroll_date=p_date AND d.payroll_type=p_type AND d.source_period=p_period AND d.source_month=p_month ORDER BY d.imported_at DESC,d.id LIMIT 1;
 IF FOUND THEN
 SELECT * INTO st FROM payroll_detail_statement WHERE dataset_id=ds.id AND tenant_id=p_tenant AND source_legajo=ec.legacy_legajo::text;
 SELECT coalesce(jsonb_agg(jsonb_build_object('code',ln->>'code','description',ds.concept_catalog->(ln->>'code')->>'description','totalGroup',ds.concept_catalog->(ln->>'code')->>'totalGroup','calculationClass',ds.concept_catalog->(ln->>'code')->>'calculationClass','sourceType',ds.concept_catalog->(ln->>'code')->>'type','quantity',ln->>'quantity','amount',ln->>'amount','agreement',ln->>'agreement','unit',ds.concept_catalog->(ln->>'code')->>'unit') ORDER BY (ln->>'code')::integer),'[]'::jsonb) INTO line_json FROM jsonb_array_elements(st.lines) ln;
 SELECT jsonb_build_object('subjectEarnings',f.total_subject_earnings::text,'nonSubjectEarnings',f.total_non_subject_earnings::text,'familyAllowance',f.family_allowance::text,'employeeWithholdings',f.employee_withholdings::text,'netPayable',f.net_payable::text,'employerContributions',f.employer_contributions::text,'sourceCutoff',sb.source_cutoff,'itemCount',f.item_count) INTO actual
 FROM payroll_monthly_fact f JOIN payroll_run r ON r.id=f.payroll_run_id AND r.company_source_id=ec.legacy_company_id::text AND r.source_batch_id=f.source_batch_id AND r.source_system='GRH'
 JOIN source_import_batch sb ON sb.id=f.source_batch_id AND sb.source_system='GRH' AND sb.source_database=ctx->>'sourceDatabase' AND sb.validation_state='published' AND sb.legacy_import_run_id IS NOT NULL
 WHERE f.employment_contract_id=p_contract AND f.source_system='GRH' AND f.payroll_date=p_date AND f.payroll_type=p_type AND f.source_period=p_period AND f.source_month=p_month;
 outcome_value:='success';count_value:=jsonb_array_length(line_json);
 result_value:=jsonb_build_object('version','payroll-detail.v1','found',true,'available',true,'datasetId',ds.id,'statementId',st.id,'statementHash',st.statement_sha256,'sourceHash',ds.source_sha256,'sourceLabel',ds.source_label,'payrollDate',to_char(ds.payroll_date,'YYYY-MM-DD'),'sourcePeriod',ds.source_period,'sourceMonth',ds.source_month,'payrollType',ds.payroll_type,'closureStatus',CASE WHEN ds.source_closed_flag=1 THEN 'closed' ELSE 'open' END,'lines',line_json,'historyTotals',actual,'officialReceipt',false,'signatureApplied',false);
 END IF;END IF;
 INSERT INTO employee_payroll_detail_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,target_contract_id,dataset_id,request_sha256,outcome,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,CASE WHEN outcome_value<>'not_found' THEN p_contract END,ds.id,encode(digest(jsonb_build_array(p_contract,p_date,p_type,p_period,p_month)::text,'sha256'),'hex'),outcome_value,count_value);
 RETURN coalesce(result_value,jsonb_build_object('version','payroll-detail.v1','found',outcome_value<>'not_found','available',false,'lines','[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer) TO municontrol_actions_runtime_app;
