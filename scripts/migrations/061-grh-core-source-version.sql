-- Reviewable source versions. Existing canonical history and active views stay intact.
CREATE TABLE IF NOT EXISTS grh_core_source_version(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,source_binding_id uuid NOT NULL,
 baseline_batch_id uuid NOT NULL REFERENCES source_import_batch(id),baseline_import_run_id bigint NOT NULL REFERENCES data_import_runs(id),
 source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),baseline_source_sha256 text NOT NULL CHECK(baseline_source_sha256~'^[a-f0-9]{64}$'),
 payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),manifest_sha256 text NOT NULL CHECK(manifest_sha256~'^[a-f0-9]{64}$'),
 baseline_manifest_sha256 text NOT NULL CHECK(baseline_manifest_sha256~'^[a-f0-9]{64}$'),
 source_cutoff timestamp NOT NULL,baseline_cutoff timestamp NOT NULL,source_payroll_date date NOT NULL,baseline_payroll_date date NOT NULL,
 source_profile text NOT NULL,source_database text NOT NULL,source_company_id bigint NOT NULL,
 entity_evidence jsonb NOT NULL CHECK(jsonb_typeof(entity_evidence)='object'),baseline_fingerprints jsonb NOT NULL CHECK(jsonb_typeof(baseline_fingerprints)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),created_transaction bigint NOT NULL DEFAULT txid_current(),
 UNIQUE(tenant_id,source_binding_id,source_sha256),CHECK(source_cutoff>baseline_cutoff AND source_sha256<>baseline_source_sha256),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS grh_core_source_delta(
 version_id uuid NOT NULL REFERENCES grh_core_source_version(id),entity text NOT NULL,source_id text NOT NULL CHECK(source_id~'^[a-f0-9]{64}$'),
 operation text NOT NULL CHECK(operation IN('add','replace','remove')),
 previous_source_sha256 text CHECK(previous_source_sha256~'^[a-f0-9]{64}$'),candidate_source_sha256 text CHECK(candidate_source_sha256~'^[a-f0-9]{64}$'),
 previous_record jsonb,record jsonb,previous_source_payload jsonb,source_payload jsonb,
 PRIMARY KEY(version_id,entity,source_id),
 CHECK(entity IN('payrollRuns','payrollSnapshot','movements','payrollMonthly','employmentReconciliation')),
 CHECK((operation='add' AND previous_record IS NULL AND previous_source_payload IS NULL AND previous_source_sha256 IS NULL
   AND record IS NOT NULL AND source_payload IS NOT NULL AND candidate_source_sha256 IS NOT NULL)
  OR(operation='replace' AND previous_record IS NOT NULL AND previous_source_payload IS NOT NULL AND previous_source_sha256 IS NOT NULL
   AND record IS NOT NULL AND source_payload IS NOT NULL AND candidate_source_sha256 IS NOT NULL AND previous_source_sha256<>candidate_source_sha256)
  OR(operation='remove' AND previous_record IS NOT NULL AND previous_source_payload IS NOT NULL AND previous_source_sha256 IS NOT NULL
   AND record IS NULL AND source_payload IS NULL AND candidate_source_sha256 IS NULL)),
 CHECK(record IS NULL OR jsonb_typeof(record)='object'),CHECK(previous_record IS NULL OR jsonb_typeof(previous_record)='object'),
 CHECK(source_payload IS NULL OR jsonb_typeof(source_payload)='object'),CHECK(previous_source_payload IS NULL OR jsonb_typeof(previous_source_payload)='object')
);
CREATE TABLE IF NOT EXISTS grh_core_source_version_seal(
 version_id uuid PRIMARY KEY REFERENCES grh_core_source_version(id),entity_fingerprints jsonb NOT NULL CHECK(jsonb_typeof(entity_fingerprints)='object'),
 sealed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON grh_core_source_version,grh_core_source_delta,grh_core_source_version_seal FROM PUBLIC,municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION grh_core_source_version_immutable_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'GRH_VERSION_IMMUTABLE'; END $$;
CREATE OR REPLACE FUNCTION grh_core_source_version_insert_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='grh_core_source_version' THEN
  IF NEW.created_transaction<>txid_current() THEN RAISE EXCEPTION 'GRH_VERSION_TRANSACTION_INVALID'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM grh_core_source_version v WHERE v.id=NEW.version_id AND v.created_transaction=txid_current())
   OR EXISTS(SELECT 1 FROM grh_core_source_version_seal s WHERE s.version_id=NEW.version_id) THEN RAISE EXCEPTION 'GRH_VERSION_ALREADY_SEALED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION grh_core_source_version_seal_required_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM grh_core_source_version_seal WHERE version_id=NEW.id) THEN RAISE EXCEPTION 'GRH_VERSION_SEAL_REQUIRED'; END IF;
 RETURN NULL;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['grh_core_source_version','grh_core_source_delta','grh_core_source_version_seal'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t::regclass AND tgname=t||'_immutable') THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION grh_core_source_version_immutable_v1()',t||'_immutable',t);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t::regclass AND tgname=t||'_no_truncate') THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION grh_core_source_version_immutable_v1()',t||'_no_truncate',t);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t::regclass AND tgname=t||'_insert_guard') THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION grh_core_source_version_insert_guard_v1()',t||'_insert_guard',t);
  END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='grh_core_source_version'::regclass AND tgname='grh_core_source_version_sealed_at_commit') THEN
  CREATE CONSTRAINT TRIGGER grh_core_source_version_sealed_at_commit AFTER INSERT ON grh_core_source_version
   DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION grh_core_source_version_seal_required_v1();
 END IF;
END $$;

-- Projection vocabulary matches projectGrhVersionRecord. Monetary strings use
-- exact PostgreSQL numeric values. No current employee attributes are inferred.
CREATE OR REPLACE FUNCTION grh_core_source_base_rows_v1(p_batch uuid,p_entity text)
RETURNS TABLE(source_id text,record jsonb) LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
BEGIN
 IF p_entity='payrollRuns' THEN RETURN QUERY
  SELECT r.source_id::text,jsonb_build_object('company_source_id',r.company_source_id,'payroll_date',to_char(r.payroll_date,'YYYY-MM-DD'),
   'source_period',r.source_period,'source_month',r.source_month,'payroll_type',r.payroll_type,'closure_status',r.closure_status,
   'source_closed_flag',r.source_closed_flag,'source_date_ig',to_char(r.source_date_ig,'YYYY-MM-DD'))
  FROM payroll_run r WHERE r.source_batch_id=p_batch AND r.source_system='GRH';
 ELSIF p_entity='payrollMonthly' THEN RETURN QUERY
  SELECT f.source_id::text,jsonb_build_object('company_source_id',c.legacy_company_id::text,'employee_number',c.legacy_legajo,
   'payroll_date',to_char(f.payroll_date,'YYYY-MM-DD'),'source_period',f.source_period,'source_month',f.source_month,'payroll_type',f.payroll_type,
   'item_count',f.item_count,'quantity_sum',trim_scale(f.quantity_sum)::text,'technical_source_amount_sum',trim_scale(f.technical_source_amount_sum)::text,
   'employer_contributions',trim_scale(f.employer_contributions)::text,'social_security_taxable_base',trim_scale(f.social_security_taxable_base)::text,
   'health_taxable_base',trim_scale(f.health_taxable_base)::text,'total_subject_earnings',trim_scale(f.total_subject_earnings)::text,
   'total_non_subject_earnings',trim_scale(f.total_non_subject_earnings)::text,'family_allowance',trim_scale(f.family_allowance)::text,
   'employee_withholdings',trim_scale(f.employee_withholdings)::text,'employer_taxable_base',trim_scale(f.employer_taxable_base)::text,
   'net',trim_scale(f.net)::text,'net_payable',trim_scale(f.net_payable)::text,'dominant_agreement_source_id',f.dominant_agreement_source_id,
   'dominant_sector_source_id',f.dominant_sector_source_id,'distinct_concepts',f.distinct_concepts,'quality_flags',coalesce(f.source_payload->'qualityFlags','[]'::jsonb))
  FROM payroll_monthly_fact f JOIN employment_contract c ON c.id=f.employment_contract_id
  WHERE f.source_batch_id=p_batch AND f.source_system='GRH';
 ELSIF p_entity='movements' THEN RETURN QUERY
  SELECT m.source_id::text,jsonb_build_object('company_source_id',c.legacy_company_id::text,'employee_number',c.legacy_legajo,
   'movement_period',to_char(m.movement_period,'YYYY-MM-DD'),'payroll_type',m.payroll_type,'movement_type',m.movement_type,
   'concept_source_id',m.concept_source_id,'cost_center_source_id',m.cost_center_source_id,'quantity',trim_scale(m.quantity)::text,
   'installment',m.installment,'automatic_source_value',m.automatic_source_value,'adjustment_source_value',m.adjustment_source_value,
   'forced_source_value',m.forced_source_value,'legal_instrument',m.legal_instrument,'movement_status',m.movement_status)
  FROM employment_movement m JOIN employment_contract c ON c.id=m.employment_contract_id
  WHERE m.source_batch_id=p_batch AND m.source_system='GRH';
 ELSIF p_entity='payrollSnapshot' THEN RETURN QUERY
  SELECT s.source_record_id::text,jsonb_build_object('company_source_id',c.legacy_company_id::text,'employee_number',c.legacy_legajo,
   'snapshot_date',to_char(s.snapshot_date,'YYYY-MM-DD'),'source_period',r.source_period,'source_month',r.source_month,'payroll_type',s.payroll_type,
   'agreement_source_id',s.agreement_source_id,'agreement_name',s.agreement_name,'category_name',s.category_name,'role_name',s.role_name,
   'budget_structure',s.budget_structure,'budget_detail',s.budget_detail,'budget_account',s.budget_account,
   'department_source_id',s.department_source_id,'department_name',s.department_name,'area_name',s.area_name)
  FROM payroll_snapshot_assignment s JOIN employment_contract c ON c.id=s.employment_contract_id
  JOIN payroll_run r ON r.id=s.payroll_run_id AND r.source_batch_id=s.source_batch_id
  WHERE s.source_batch_id=p_batch AND s.source_system='GRH';
 ELSIF p_entity='employmentReconciliation' THEN RETURN QUERY
  SELECT encode(digest(format('{"companyCode":%s,"employeeNumber":%s}',to_json(c.legacy_company_id::text),to_json(c.legacy_legajo)),'sha256'),'hex'),
   jsonb_build_object('company_source_id',c.legacy_company_id::text,'employee_number',c.legacy_legajo,
    'administrative_active',s.evidence->'administrativeActive','liquidated_current',s.evidence->'liquidatedCurrent',
    'evidence_status',s.evidence->>'evidenceStatus','last_payroll_date',s.evidence->>'lastPayrollDate')
  FROM employment_status_snapshot s JOIN employment_contract c ON c.id=s.employment_contract_id
  WHERE s.source_batch_id=p_batch AND s.source_system='GRH' AND s.evidence?'evidenceStatus';
 ELSE RAISE EXCEPTION 'GRH_VERSION_ENTITY_INVALID'; END IF;
END $$;
CREATE OR REPLACE FUNCTION grh_core_source_base_fingerprint_v1(p_batch uuid,p_entity text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(source_id||record::text),'' ORDER BY source_id),'')))
 FROM grh_core_source_base_rows_v1(p_batch,p_entity)
$$;
CREATE OR REPLACE FUNCTION grh_core_source_unsealed_rows_v1(p_version uuid,p_entity text)
RETURNS TABLE(source_id text,record jsonb) LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT b.source_id,b.record FROM grh_core_source_version v CROSS JOIN LATERAL grh_core_source_base_rows_v1(v.baseline_batch_id,p_entity) b
 WHERE v.id=p_version AND NOT EXISTS(SELECT 1 FROM grh_core_source_delta d WHERE d.version_id=v.id AND d.entity=p_entity AND d.source_id=b.source_id)
 UNION ALL SELECT d.source_id,d.record FROM grh_core_source_delta d WHERE d.version_id=p_version AND d.entity=p_entity AND d.operation IN('add','replace')
$$;
CREATE OR REPLACE FUNCTION grh_core_source_version_fingerprint_v1(p_version uuid,p_entity text) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(source_id||record::text),'' ORDER BY source_id),'')))
 FROM grh_core_source_unsealed_rows_v1(p_version,p_entity)
$$;
CREATE OR REPLACE FUNCTION grh_core_source_version_assert_v1(p_version uuid,p_entity text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE v grh_core_source_version%ROWTYPE; s grh_core_source_version_seal%ROWTYPE; observed jsonb;
BEGIN
 IF p_entity NOT IN('payrollRuns','payrollSnapshot','movements','payrollMonthly','employmentReconciliation') OR p_entity IS NULL THEN RAISE EXCEPTION 'GRH_VERSION_ENTITY_INVALID'; END IF;
 SELECT * INTO v FROM grh_core_source_version WHERE id=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'GRH_VERSION_NOT_FOUND'; END IF;
 SELECT * INTO s FROM grh_core_source_version_seal WHERE version_id=p_version;
 IF NOT FOUND THEN RAISE EXCEPTION 'GRH_VERSION_NOT_SEALED'; END IF;
 IF v.baseline_fingerprints->p_entity IS DISTINCT FROM grh_core_source_base_fingerprint_v1(v.baseline_batch_id,p_entity) THEN RAISE EXCEPTION 'GRH_VERSION_BASELINE_DRIFT'; END IF;
 observed:=grh_core_source_version_fingerprint_v1(p_version,p_entity);
 IF s.entity_fingerprints->p_entity IS DISTINCT FROM observed OR (observed->>'rows')::bigint IS DISTINCT FROM (v.entity_evidence->p_entity->'counts'->>'candidate')::bigint
  THEN RAISE EXCEPTION 'GRH_VERSION_CONTENT_DRIFT'; END IF;
END $$;
CREATE OR REPLACE FUNCTION grh_core_source_version_rows_v1(p_version uuid,p_entity text,p_revision text DEFAULT 'candidate')
RETURNS TABLE(source_id text,record jsonb,source_version_id uuid,source_revision text,source_sha256 text,source_cutoff timestamp,source_payroll_date date,operational boolean)
LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE v grh_core_source_version%ROWTYPE;
BEGIN
 IF p_revision IS NULL OR p_revision NOT IN('baseline','candidate') THEN RAISE EXCEPTION 'GRH_VERSION_REVISION_INVALID'; END IF;
 PERFORM grh_core_source_version_assert_v1(p_version,p_entity);
 SELECT * INTO v FROM grh_core_source_version WHERE id=p_version;
 IF p_revision='baseline' THEN RETURN QUERY SELECT r.source_id,r.record,v.id,p_revision,v.baseline_source_sha256,v.baseline_cutoff,v.baseline_payroll_date,false
  FROM grh_core_source_base_rows_v1(v.baseline_batch_id,p_entity) r ORDER BY r.source_id;
 ELSE RETURN QUERY SELECT r.source_id,r.record,v.id,p_revision,v.source_sha256,v.source_cutoff,v.source_payroll_date,false
  FROM grh_core_source_unsealed_rows_v1(p_version,p_entity) r ORDER BY r.source_id; END IF;
END $$;

-- A new snapshot is never selected by date or implicit "latest". No runtime
-- access is granted until an authenticated adapter and coordinated activation.
REVOKE ALL ON FUNCTION grh_core_source_version_immutable_v1(),grh_core_source_version_insert_guard_v1(),grh_core_source_version_seal_required_v1(),
 grh_core_source_base_rows_v1(uuid,text),grh_core_source_base_fingerprint_v1(uuid,text),grh_core_source_unsealed_rows_v1(uuid,text),
 grh_core_source_version_fingerprint_v1(uuid,text),grh_core_source_version_assert_v1(uuid,text),grh_core_source_version_rows_v1(uuid,text,text)
 FROM PUBLIC,municontrol_actions_runtime_app;
