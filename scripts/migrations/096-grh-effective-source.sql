-- 096: selected GRH source reconstruction. No historical table is rewritten.
-- Install in the caller's transaction; publication inserts its pointer LAST.
DO $install$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('municontrol:grh-effective-source:096',0));
 IF to_regclass('public.grh_effective_source_binding') IS NOT NULL
  OR to_regclass('public.grh_effective_payroll_run_v1') IS NOT NULL
  OR to_regclass('public.grh_effective_payroll_monthly_fact_v1') IS NOT NULL
  OR to_regclass('public.grh_effective_employment_movement_v1') IS NOT NULL
  OR to_regprocedure('public.grh_effective_source_guard_v1()') IS NOT NULL
  OR to_regprocedure('public.grh_effective_baseline_guard_v1()') IS NOT NULL THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_ALREADY_INSTALLED';
 END IF;
 IF to_regclass('public.grh_core_source_version_seal') IS NULL
  OR to_regprocedure('public.grh_core_source_version_assert_v1(uuid,text)') IS NULL THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_PREREQUISITE_REQUIRED';
 END IF;
END $install$;

CREATE TABLE public.grh_effective_source_binding (
 tenant_id uuid NOT NULL,
 source_binding_id uuid NOT NULL,
 source_version_id uuid NOT NULL UNIQUE REFERENCES public.grh_core_source_version(id),
 baseline_batch_id uuid NOT NULL UNIQUE REFERENCES public.source_import_batch(id),
 source_batch_id uuid NOT NULL UNIQUE REFERENCES public.source_import_batch(id),
 import_run_id bigint NOT NULL UNIQUE REFERENCES public.data_import_runs(id),
 publication_sha256 char(64) NOT NULL CHECK(publication_sha256 ~ '^[a-f0-9]{64}$'),
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,source_binding_id),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 CHECK(source_batch_id<>baseline_batch_id)
);
ALTER TABLE public.grh_effective_source_binding ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.grh_effective_source_guard_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $guard$
DECLARE v public.grh_core_source_version%ROWTYPE; b public.source_import_batch%ROWTYPE; entity text;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'GRH_EFFECTIVE_IMMUTABLE'; END IF;
 IF current_user IS DISTINCT FROM (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='public.grh_effective_source_binding'::regclass) THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_OWNER_REQUIRED';
 END IF;
 -- This one-time validation is NOT part of any effective read/view.
 LOCK TABLE public.payroll_run,public.payroll_monthly_fact,public.employment_movement,
  public.employment_contract,public.payroll_snapshot_assignment,public.employment_status_snapshot IN SHARE MODE NOWAIT;
 SELECT * INTO v FROM public.grh_core_source_version WHERE id=NEW.source_version_id FOR SHARE;
 IF NOT FOUND OR v.tenant_id<>NEW.tenant_id OR v.source_binding_id<>NEW.source_binding_id
  OR v.baseline_batch_id<>NEW.baseline_batch_id THEN RAISE EXCEPTION 'GRH_EFFECTIVE_VERSION_MISMATCH'; END IF;
 PERFORM 1 FROM public.platform_tenant_source_binding s JOIN public.tenant_identity_policy policy
  ON policy.tenant_id=s.tenant_id AND policy.certified_source_binding_id=s.id AND policy.tenant_data_plane_ready IS TRUE
  WHERE s.id=NEW.source_binding_id AND s.tenant_id=NEW.tenant_id AND s.verified IS TRUE
   AND s.source_system='GRH' AND s.source_database=v.source_database AND s.source_company_id=v.source_company_id
  FOR SHARE OF s,policy NOWAIT;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_BINDING_MISMATCH';
 END IF;
 SELECT * INTO b FROM public.source_import_batch WHERE id=NEW.source_batch_id FOR SHARE;
 IF NOT FOUND OR b.source_system<>'GRH' OR b.source_database<>v.source_database OR b.validation_state<>'published'
  OR b.legacy_import_run_id IS DISTINCT FROM NEW.import_run_id OR lower(b.source_sha256)<>v.source_sha256
  OR b.source_cutoff IS DISTINCT FROM (v.source_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires')
  OR NOT EXISTS(SELECT 1 FROM public.data_import_runs r WHERE r.id=NEW.import_run_id AND r.status='completed'
   AND r.source_name='grh_junin_curated' AND lower(r.source_sha256)=v.source_sha256 AND r.source_cutoff=v.source_cutoff) THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_SOURCE_MISMATCH';
 END IF;
 IF EXISTS(SELECT 1 FROM public.grh_effective_source_binding p WHERE p.source_batch_id=NEW.baseline_batch_id OR p.baseline_batch_id=NEW.source_batch_id) THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_CHAIN_UNSUPPORTED';
 END IF;
 FOREACH entity IN ARRAY ARRAY['payrollRuns','payrollMonthly','movements','payrollSnapshot','employmentReconciliation'] LOOP
  PERFORM public.grh_core_source_version_assert_v1(v.id,entity);
 END LOOP;
 -- Every run has a physical identity. 035 old cases keep their original FK.
 IF (SELECT count(*) FROM public.payroll_run WHERE source_batch_id=NEW.source_batch_id AND source_system='GRH')
    IS DISTINCT FROM (v.entity_evidence->'payrollRuns'->'counts'->>'candidate')::bigint
  OR EXISTS(SELECT 1 FROM public.grh_core_source_unsealed_rows_v1(v.id,'payrollRuns') e
   LEFT JOIN public.payroll_run r ON r.source_batch_id=NEW.source_batch_id AND r.source_id=e.source_id AND r.source_system='GRH'
   WHERE r.id IS NULL OR jsonb_build_object('company_source_id',r.company_source_id,'payroll_date',to_char(r.payroll_date,'YYYY-MM-DD'),
    'source_period',r.source_period,'source_month',r.source_month,'payroll_type',r.payroll_type,'closure_status',r.closure_status,
    'source_closed_flag',r.source_closed_flag,'source_date_ig',to_char(r.source_date_ig,'YYYY-MM-DD')) IS DISTINCT FROM e.record) THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_RUNS_MISMATCH';
 END IF;
 IF EXISTS(SELECT 1 FROM public.payroll_monthly_fact WHERE source_batch_id=NEW.source_batch_id)
  OR EXISTS(SELECT 1 FROM public.employment_movement WHERE source_batch_id=NEW.source_batch_id) THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_DUPLICATED_HISTORY';
 END IF;
 IF EXISTS(SELECT 1 FROM public.employment_contract c WHERE c.source_system='GRH' AND c.legacy_company_id=v.source_company_id
  AND c.source_batch_id<>NEW.source_batch_id) OR NOT EXISTS(SELECT 1 FROM public.employment_contract c
   WHERE c.source_system='GRH' AND c.legacy_company_id=v.source_company_id AND c.source_batch_id=NEW.source_batch_id)
  OR EXISTS(SELECT 1 FROM public.grh_core_source_delta d WHERE d.version_id=v.id AND d.operation IN('add','replace')
   AND d.entity IN('payrollMonthly','movements') AND NOT EXISTS(SELECT 1 FROM public.employment_contract c
    WHERE c.source_system='GRH' AND c.source_batch_id=NEW.source_batch_id
     AND c.legacy_company_id::text=d.record->>'company_source_id' AND c.legacy_legajo=d.record->>'employee_number')) THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_CONTRACTS_MISMATCH';
 END IF;
 IF EXISTS(SELECT 1 FROM public.grh_core_source_unsealed_rows_v1(v.id,'payrollMonthly') e
  LEFT JOIN public.payroll_run r ON r.source_batch_id=NEW.source_batch_id AND r.source_system='GRH'
   AND r.company_source_id=e.record->>'company_source_id' AND r.payroll_date=(e.record->>'payroll_date')::date
   AND r.source_period=(e.record->>'source_period')::integer AND r.source_month=(e.record->>'source_month')::integer
   AND r.payroll_type=e.record->>'payroll_type' WHERE r.id IS NULL) THEN RAISE EXCEPTION 'GRH_EFFECTIVE_RUNS_MISMATCH'; END IF;
 RETURN NEW;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'GRH_EFFECTIVE_BUSY';
END $guard$;
CREATE TRIGGER grh_effective_source_guard BEFORE INSERT OR UPDATE OR DELETE ON public.grh_effective_source_binding
 FOR EACH ROW EXECUTE FUNCTION public.grh_effective_source_guard_v1();
CREATE TRIGGER grh_effective_source_no_truncate BEFORE TRUNCATE ON public.grh_effective_source_binding
 FOR EACH STATEMENT EXECUTE FUNCTION public.grh_effective_source_guard_v1();

-- Freeze the inputs on which 061's seals and the effective joins depend.
-- Before the final pointer INSERT these triggers permit the publication stages.
-- After it, ordinary owner DML is rejected as well; ALTER/DISABLE TRIGGER is not
-- part of the supported publication/rollback path.
CREATE FUNCTION public.grh_effective_baseline_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $baseline$
DECLARE old_row jsonb; new_row jsonb;
BEGIN
 IF TG_OP='TRUNCATE' THEN
  IF EXISTS(SELECT 1 FROM public.grh_effective_source_binding) THEN RAISE EXCEPTION 'GRH_EFFECTIVE_BASELINE_IMMUTABLE'; END IF;
  RETURN NULL;
 END IF;
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='employment_contract' THEN
  IF EXISTS(SELECT 1 FROM public.grh_effective_source_binding p JOIN public.grh_core_source_version v ON v.id=p.source_version_id
   WHERE (old_row->>'source_system'='GRH' AND (old_row->>'legacy_company_id')::bigint=v.source_company_id)
    OR (new_row->>'source_system'='GRH' AND (new_row->>'legacy_company_id')::bigint=v.source_company_id))
   AND (TG_OP<>'UPDATE' OR (old_row->'id',old_row->'person_id',old_row->'source_system',old_row->'source_batch_id',old_row->'legacy_company_id',old_row->'legacy_legajo')
    IS DISTINCT FROM (new_row->'id',new_row->'person_id',new_row->'source_system',new_row->'source_batch_id',new_row->'legacy_company_id',new_row->'legacy_legajo')) THEN
   RAISE EXCEPTION 'GRH_EFFECTIVE_BASELINE_IMMUTABLE';
  END IF;
 ELSIF EXISTS(SELECT 1 FROM public.grh_effective_source_binding p
  WHERE p.baseline_batch_id IN ((old_row->>'source_batch_id')::uuid,(new_row->>'source_batch_id')::uuid)
   OR p.source_batch_id IN ((old_row->>'source_batch_id')::uuid,(new_row->>'source_batch_id')::uuid)) THEN
  RAISE EXCEPTION 'GRH_EFFECTIVE_BASELINE_IMMUTABLE';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $baseline$;
DO $protect$
DECLARE item text;
BEGIN
 FOREACH item IN ARRAY ARRAY['payroll_run','payroll_monthly_fact','employment_movement','payroll_snapshot_assignment','employment_status_snapshot','employment_contract'] LOOP
  EXECUTE format('CREATE TRIGGER grh_effective_baseline_rows BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.grh_effective_baseline_guard_v1()',item);
  EXECUTE format('CREATE TRIGGER grh_effective_baseline_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.grh_effective_baseline_guard_v1()',item);
 END LOOP;
END $protect$;

-- Compatible row types; these are read-only query interfaces, not FK targets.
-- Before publication the exact previous tables remain the selected source.
CREATE VIEW public.grh_effective_payroll_run_v1 AS
 SELECT r.* FROM public.payroll_run r
 WHERE NOT EXISTS(SELECT 1 FROM public.grh_effective_source_binding p WHERE p.baseline_batch_id=r.source_batch_id);

CREATE VIEW public.grh_effective_payroll_monthly_fact_v1 AS
 SELECT f.employment_contract_id,coalesce(r.id,f.payroll_run_id) payroll_run_id,f.payroll_date,f.source_period,f.source_month,
  f.payroll_type,f.item_count,f.quantity_sum,f.technical_source_amount_sum,f.employer_contributions,
  f.social_security_taxable_base,f.health_taxable_base,f.total_subject_earnings,f.total_non_subject_earnings,
  f.family_allowance,f.employee_withholdings,f.employer_taxable_base,f.net,f.net_payable,
  f.dominant_agreement_source_id,f.dominant_sector_source_id,f.distinct_concepts,f.monetary_basis,f.source_system,
  coalesce(p.source_batch_id,f.source_batch_id) source_batch_id,f.source_id,f.source_payload,f.recorded_at
 FROM public.payroll_monthly_fact f
 LEFT JOIN public.grh_effective_source_binding p ON p.baseline_batch_id=f.source_batch_id
 LEFT JOIN public.payroll_run r ON r.source_batch_id=p.source_batch_id AND r.source_system='GRH'
  AND r.payroll_date=f.payroll_date AND r.source_period=f.source_period AND r.source_month=f.source_month
  AND r.payroll_type=f.payroll_type
  AND r.company_source_id=(SELECT c.legacy_company_id::text FROM public.employment_contract c WHERE c.id=f.employment_contract_id)
 WHERE p.source_version_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.grh_core_source_delta d
  WHERE d.version_id=p.source_version_id AND d.entity='payrollMonthly' AND d.source_id=f.source_id)
 UNION ALL
 SELECT row_value.* FROM public.grh_effective_source_binding p
 JOIN public.grh_core_source_version v ON v.id=p.source_version_id
 JOIN public.grh_core_source_delta d ON d.version_id=p.source_version_id AND d.entity='payrollMonthly' AND d.operation IN('add','replace')
 JOIN public.employment_contract c ON c.source_system='GRH' AND c.source_batch_id=p.source_batch_id
  AND c.legacy_company_id::text=d.record->>'company_source_id' AND c.legacy_legajo=d.record->>'employee_number'
 JOIN public.payroll_run r ON r.source_batch_id=p.source_batch_id AND r.source_system='GRH'
  AND r.company_source_id=d.record->>'company_source_id' AND r.payroll_date=(d.record->>'payroll_date')::date
  AND r.source_period=(d.record->>'source_period')::integer AND r.source_month=(d.record->>'source_month')::integer AND r.payroll_type=d.record->>'payroll_type'
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.payroll_monthly_fact,d.record||jsonb_build_object(
  'employment_contract_id',c.id,'payroll_run_id',r.id,'monetary_basis','nominal','source_system','GRH',
  'source_batch_id',p.source_batch_id,'source_id',d.source_id,'source_payload',d.source_payload,'recorded_at',v.created_at)) row_value;

CREATE VIEW public.grh_effective_employment_movement_v1 AS
 SELECT m.id,m.employment_contract_id,m.movement_period,m.payroll_type,m.movement_type,m.concept_source_id,
  m.cost_center_source_id,m.quantity,m.installment,m.automatic_source_value,m.adjustment_source_value,m.forced_source_value,
  m.legal_instrument,m.movement_status,m.source_system,coalesce(p.source_batch_id,m.source_batch_id) source_batch_id,
  m.source_id,m.source_payload,m.recorded_at
 FROM public.employment_movement m
 LEFT JOIN public.grh_effective_source_binding p ON p.baseline_batch_id=m.source_batch_id
 WHERE p.source_version_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.grh_core_source_delta d
  WHERE d.version_id=p.source_version_id AND d.entity='movements' AND d.source_id=m.source_id)
 UNION ALL
 SELECT row_value.* FROM public.grh_effective_source_binding p
 JOIN public.grh_core_source_version v ON v.id=p.source_version_id
 JOIN public.grh_core_source_delta d ON d.version_id=p.source_version_id AND d.entity='movements' AND d.operation IN('add','replace')
 JOIN public.employment_contract c ON c.source_system='GRH' AND c.source_batch_id=p.source_batch_id
  AND c.legacy_company_id::text=d.record->>'company_source_id' AND c.legacy_legajo=d.record->>'employee_number'
 LEFT JOIN public.employment_movement old ON old.source_batch_id=p.baseline_batch_id AND old.source_id=d.source_id AND d.operation='replace'
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.employment_movement,d.record||jsonb_build_object(
  'id',old.id,'employment_contract_id',c.id,'source_system','GRH','source_batch_id',p.source_batch_id,
  'source_id',d.source_id,'source_payload',d.source_payload,'recorded_at',v.created_at)) row_value;

REVOKE ALL ON public.grh_effective_source_binding,public.grh_effective_payroll_run_v1,
 public.grh_effective_payroll_monthly_fact_v1,public.grh_effective_employment_movement_v1 FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.grh_effective_source_guard_v1(),public.grh_effective_baseline_guard_v1() FROM PUBLIC,municontrol_actions_runtime_app;
COMMENT ON TABLE public.grh_effective_source_binding IS 'Owner inserts LAST in the publication transaction. No runtime DML; no implicit latest; original baseline remains immutable.';
COMMENT ON VIEW public.grh_effective_employment_movement_v1 IS 'Added delta rows have id NULL: no physical movement exists. Stable source_id orders the selected revision; no fabricated UUIDs.';
