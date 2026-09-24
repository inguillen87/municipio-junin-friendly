-- 106: private successor staging. Never changes the selected source or an operational table.
-- All ten domains must be verified and sealed in the same transaction.
DO $install$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('municontrol:successor-staging:106',0));
 IF to_regclass('public.grh_successor_stage') IS NOT NULL THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_ALREADY_INSTALLED'; END IF;
 IF to_regclass('public.grh_curated_source_version_seal') IS NULL OR to_regclass('public.grh_effective_source_binding') IS NULL THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_PREREQUISITE_REQUIRED'; END IF;
END $install$;
CREATE TABLE public.grh_successor_stage(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,source_binding_id uuid NOT NULL,
 parent_core_version_id uuid NOT NULL REFERENCES public.grh_core_source_version(id),
 parent_curated_version_id uuid NOT NULL REFERENCES public.grh_curated_source_version(id),
 parent_publication_sha256 text NOT NULL CHECK(parent_publication_sha256~'^[a-f0-9]{64}$'),
 source_profile text NOT NULL,source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),source_cutoff timestamp NOT NULL,
 core_manifest_sha256 text NOT NULL CHECK(core_manifest_sha256~'^[a-f0-9]{64}$'),curated_manifest_sha256 text NOT NULL CHECK(curated_manifest_sha256~'^[a-f0-9]{64}$'),
 package_sha256 text NOT NULL CHECK(package_sha256~'^[a-f0-9]{64}$'),evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),created_transaction bigint NOT NULL DEFAULT txid_current(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 UNIQUE(tenant_id,source_binding_id,source_sha256)
);
CREATE TABLE public.grh_successor_stage_delta(
 stage_id uuid NOT NULL REFERENCES public.grh_successor_stage(id),entity text NOT NULL,row_key text NOT NULL CHECK(row_key~'^[a-f0-9]{64}$'),
 operation text NOT NULL CHECK(operation IN('add','replace','remove')),previous_record jsonb,record jsonb,source_payload jsonb,
 PRIMARY KEY(stage_id,entity,row_key),
 CHECK(entity IN('core/payrollRuns','core/payrollSnapshot','core/payrollMonthly','core/movements','core/employmentReconciliation','curated/grh_employees','curated/grh_absences','curated/grh_leaves','curated/grh_family','curated/grh_catalog_rows')),
 CHECK((operation='add' AND previous_record IS NULL AND record IS NOT NULL) OR(operation='replace' AND previous_record IS NOT NULL AND record IS NOT NULL AND previous_record<>record) OR(operation='remove' AND previous_record IS NOT NULL AND record IS NULL)),
 CHECK(record IS NULL OR jsonb_typeof(record)='object'),CHECK(previous_record IS NULL OR jsonb_typeof(previous_record)='object'),CHECK(source_payload IS NULL OR jsonb_typeof(source_payload)='object')
);
CREATE TABLE public.grh_successor_stage_seal(stage_id uuid PRIMARY KEY REFERENCES public.grh_successor_stage(id),fingerprints jsonb NOT NULL CHECK(jsonb_typeof(fingerprints)='object'),sealed_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE public.grh_successor_stage ENABLE ROW LEVEL SECURITY;ALTER TABLE public.grh_successor_stage_delta ENABLE ROW LEVEL SECURITY;ALTER TABLE public.grh_successor_stage_seal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grh_successor_stage,public.grh_successor_stage_delta,public.grh_successor_stage_seal FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.grh_successor_entities_v1() RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT ARRAY['core/payrollRuns','core/payrollSnapshot','core/payrollMonthly','core/movements','core/employmentReconciliation','curated/grh_employees','curated/grh_absences','curated/grh_leaves','curated/grh_family','curated/grh_catalog_rows']::text[] $$;
CREATE FUNCTION public.grh_successor_stage_parent_v1(p_stage uuid) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.grh_successor_stage%ROWTYPE; c public.grh_core_source_version%ROWTYPE; v public.grh_curated_source_version%ROWTYPE;
BEGIN
 SELECT * INTO STRICT s FROM public.grh_successor_stage WHERE id=p_stage;
 SELECT * INTO c FROM public.grh_core_source_version WHERE id=s.parent_core_version_id;
 SELECT * INTO v FROM public.grh_curated_source_version WHERE id=s.parent_curated_version_id;
 IF c.id IS NULL OR v.id IS NULL OR c.tenant_id<>s.tenant_id OR v.tenant_id<>s.tenant_id OR c.source_binding_id<>s.source_binding_id OR v.source_binding_id<>s.source_binding_id OR v.core_version_id<>c.id OR v.source_sha256<>c.source_sha256 OR v.source_cutoff<>c.source_cutoff OR s.source_cutoff<=c.source_cutoff OR s.source_sha256=c.source_sha256 THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_PARENT_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.grh_core_source_version_seal WHERE version_id=c.id) OR NOT EXISTS(SELECT 1 FROM public.grh_curated_source_version_seal WHERE version_id=v.id) THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_PARENT_UNSEALED'; END IF;
 PERFORM 1 FROM public.grh_effective_source_binding p JOIN public.platform_tenant_source_binding b ON b.id=p.source_binding_id AND b.tenant_id=p.tenant_id JOIN public.tenant_identity_policy policy ON policy.tenant_id=b.tenant_id AND policy.certified_source_binding_id=b.id
 WHERE p.tenant_id=s.tenant_id AND p.source_binding_id=s.source_binding_id AND p.source_version_id=c.id AND p.publication_sha256=s.parent_publication_sha256 AND p.source_batch_id=v.source_batch_id AND p.import_run_id=v.import_run_id AND b.verified AND policy.tenant_data_plane_ready
 FOR SHARE OF p,b,policy NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_PARENT_CHANGED'; END IF;
END $$;
CREATE FUNCTION public.grh_successor_stage_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_IMMUTABLE'; END IF;
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.grh_successor_stage'::regclass)) THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_OWNER_REQUIRED'; END IF;
 IF TG_TABLE_NAME='grh_successor_stage' THEN
  IF NEW.created_transaction<>txid_current() THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_TRANSACTION_REQUIRED'; END IF;
  IF NEW.source_profile<>'grh-junin-2026-09-22' OR NEW.source_sha256<>'8fd91c34e3757a19f3f772631f5734d4934050d4823bc6127b61220236155a8e' OR NEW.source_cutoff<>timestamp '2026-09-22 15:16:58' THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_PROFILE_INVALID'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.grh_successor_stage s WHERE s.id=NEW.stage_id AND s.created_transaction=txid_current()) OR EXISTS(SELECT 1 FROM public.grh_successor_stage_seal WHERE stage_id=NEW.stage_id) THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_SEALED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.grh_successor_stage_seal_required_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN IF NOT EXISTS(SELECT 1 FROM public.grh_successor_stage_seal WHERE stage_id=NEW.id) THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_SEAL_REQUIRED'; END IF;RETURN NULL;END $$;
CREATE FUNCTION public.grh_successor_stage_base_rows_v1(p_stage uuid,p_entity text) RETURNS TABLE(row_key text,record jsonb) LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.grh_successor_stage%ROWTYPE;
BEGIN
 IF p_entity IS NULL OR NOT(p_entity=ANY(public.grh_successor_entities_v1())) THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_ENTITY_INVALID'; END IF;
 SELECT * INTO STRICT s FROM public.grh_successor_stage WHERE id=p_stage;
 IF p_entity LIKE 'core/%' THEN RETURN QUERY SELECT r.source_id,r.record FROM public.grh_core_source_unsealed_rows_v1(s.parent_core_version_id,split_part(p_entity,'/',2)) r;
 ELSE RETURN QUERY SELECT r.row_key,r.record FROM public.grh_curated_source_unsealed_rows_v1(s.parent_curated_version_id,split_part(p_entity,'/',2)) r;END IF;
END $$;
CREATE FUNCTION public.grh_successor_stage_rows_v1(p_stage uuid,p_entity text) RETURNS TABLE(row_key text,record jsonb) LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT b.row_key,b.record FROM public.grh_successor_stage_base_rows_v1(p_stage,p_entity) b WHERE NOT EXISTS(SELECT 1 FROM public.grh_successor_stage_delta d WHERE d.stage_id=p_stage AND d.entity=p_entity AND d.row_key=b.row_key)
 UNION ALL SELECT d.row_key,d.record FROM public.grh_successor_stage_delta d WHERE d.stage_id=p_stage AND d.entity=p_entity AND d.operation IN('add','replace')
$$;
CREATE FUNCTION public.grh_successor_stage_fingerprint_v1(p_stage uuid,p_entity text,p_baseline boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_baseline IS NULL THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_REVISION_INVALID'; END IF;
 IF p_baseline THEN SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(r.row_key||r.record::text),'' ORDER BY r.row_key),''))) INTO result FROM public.grh_successor_stage_base_rows_v1(p_stage,p_entity) r;
 ELSE SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(r.row_key||r.record::text),'' ORDER BY r.row_key),''))) INTO result FROM public.grh_successor_stage_rows_v1(p_stage,p_entity) r;END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.grh_successor_stage_seal_guard_v1() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s public.grh_successor_stage%ROWTYPE; e text; proof jsonb; observed jsonb; parent_seal jsonb; company text; bad boolean;
BEGIN
 PERFORM public.grh_successor_stage_parent_v1(NEW.stage_id);SELECT * INTO STRICT s FROM public.grh_successor_stage WHERE id=NEW.stage_id;
 SELECT source_company_id::text INTO company FROM public.grh_core_source_version WHERE id=s.parent_core_version_id;
 IF ARRAY(SELECT jsonb_object_keys(s.evidence) ORDER BY 1)<>ARRAY(SELECT unnest(public.grh_successor_entities_v1()) ORDER BY 1) OR ARRAY(SELECT jsonb_object_keys(NEW.fingerprints) ORDER BY 1)<>ARRAY(SELECT unnest(public.grh_successor_entities_v1()) ORDER BY 1) THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_INCOMPLETE'; END IF;
 IF (SELECT count(*) FROM public.grh_successor_stage_delta WHERE stage_id=s.id)>100000 THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_DELTA_LIMIT'; END IF;
 FOREACH e IN ARRAY public.grh_successor_entities_v1() LOOP
  proof:=s.evidence->e;
  IF jsonb_typeof(proof)<>'object' OR ARRAY(SELECT jsonb_object_keys(proof) ORDER BY 1)<>ARRAY['baseline','candidate','changes'] OR jsonb_typeof(proof->'changes')<>'object' OR ARRAY(SELECT jsonb_object_keys(proof->'changes') ORDER BY 1)<>ARRAY['add','remove','replace'] THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_EVIDENCE_INVALID'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(proof->'changes') x WHERE jsonb_typeof(x.value)<>'number' OR x.value::text!~'^[0-9]{1,7}$') THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_EVIDENCE_INVALID'; END IF;
  IF (SELECT jsonb_build_object('add',count(*) FILTER(WHERE operation='add'),'remove',count(*) FILTER(WHERE operation='remove'),'replace',count(*) FILTER(WHERE operation='replace')) FROM public.grh_successor_stage_delta WHERE stage_id=s.id AND entity=e) IS DISTINCT FROM proof->'changes' THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_CHANGE_COUNT'; END IF;
  IF e LIKE 'core/%' THEN
   PERFORM public.grh_core_source_version_assert_v1(s.parent_core_version_id,split_part(e,'/',2));
   SELECT entity_fingerprints->split_part(e,'/',2) INTO parent_seal FROM public.grh_core_source_version_seal WHERE version_id=s.parent_core_version_id;
  ELSE
   PERFORM public.grh_curated_source_version_assert_v1(s.parent_curated_version_id,split_part(e,'/',2));
   SELECT entity_fingerprints->split_part(e,'/',2) INTO parent_seal FROM public.grh_curated_source_version_seal WHERE version_id=s.parent_curated_version_id;
  END IF;
  observed:=public.grh_successor_stage_fingerprint_v1(s.id,e,true);
  IF observed IS DISTINCT FROM proof->'baseline' OR observed IS DISTINCT FROM parent_seal THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_BASELINE_DRIFT'; END IF;
  IF EXISTS(SELECT 1 FROM public.grh_successor_stage_delta d LEFT JOIN public.grh_successor_stage_base_rows_v1(s.id,e) b ON b.row_key=d.row_key WHERE d.stage_id=s.id AND d.entity=e AND ((d.operation='add' AND b.row_key IS NOT NULL) OR(d.operation IN('replace','remove') AND (b.row_key IS NULL OR b.record IS DISTINCT FROM d.previous_record)))) THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_PREVIOUS_MISMATCH'; END IF;
  IF EXISTS(SELECT 1 FROM public.grh_successor_stage_rows_v1(s.id,e) r WHERE CASE WHEN e LIKE 'core/%' THEN r.record->>'company_source_id' IS DISTINCT FROM company WHEN e<>'curated/grh_catalog_rows' THEN r.record->>'company_id' IS DISTINCT FROM company ELSE false END) THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_COMPANY_MISMATCH'; END IF;
  observed:=public.grh_successor_stage_fingerprint_v1(s.id,e,false);
  IF observed IS DISTINCT FROM proof->'candidate' OR observed IS DISTINCT FROM NEW.fingerprints->e OR (observed->>'rows')::bigint>2000000 THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_CANDIDATE_DRIFT'; END IF;
 END LOOP;
 -- An employee may have several runs but not the same semantic assignment twice.
 IF EXISTS(SELECT 1 FROM public.grh_successor_stage_rows_v1(s.id,'core/payrollSnapshot') r GROUP BY r.record->'company_source_id',r.record->'employee_number',r.record->'snapshot_date',r.record->'source_period',r.record->'source_month',r.record->'payroll_type' HAVING count(*)>1) THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_SNAPSHOT_DUPLICATE'; END IF;
 RETURN NEW;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'GRH_SUCCESSOR_STAGE_BUSY';
END $$;
DO $triggers$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['grh_successor_stage','grh_successor_stage_delta','grh_successor_stage_seal'] LOOP
  EXECUTE format('CREATE TRIGGER a_successor_stage_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.grh_successor_stage_guard_v1()',t);
  EXECUTE format('CREATE TRIGGER a_successor_stage_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.grh_successor_stage_guard_v1()',t);
 END LOOP;
 CREATE TRIGGER b_successor_stage_seal BEFORE INSERT ON public.grh_successor_stage_seal FOR EACH ROW EXECUTE FUNCTION public.grh_successor_stage_seal_guard_v1();
 CREATE CONSTRAINT TRIGGER successor_stage_seal_at_commit AFTER INSERT ON public.grh_successor_stage DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.grh_successor_stage_seal_required_v1();
END $triggers$;
REVOKE ALL ON FUNCTION public.grh_successor_entities_v1(),public.grh_successor_stage_parent_v1(uuid),public.grh_successor_stage_guard_v1(),public.grh_successor_stage_seal_required_v1(),public.grh_successor_stage_base_rows_v1(uuid,text),public.grh_successor_stage_rows_v1(uuid,text),public.grh_successor_stage_fingerprint_v1(uuid,text,boolean),public.grh_successor_stage_seal_guard_v1() FROM PUBLIC,municontrol_actions_runtime_app;
CREATE VIEW public.grh_successor_stage_summary_v1 AS
 SELECT s.id,s.tenant_id,s.source_binding_id,s.parent_core_version_id,s.parent_curated_version_id,s.parent_publication_sha256,
 s.source_profile,s.source_sha256,s.source_cutoff,s.package_sha256,s.core_manifest_sha256,s.curated_manifest_sha256,s.evidence,s.created_at,seal.sealed_at,
 false AS operational,false AS publication_authorized
 FROM public.grh_successor_stage s JOIN public.grh_successor_stage_seal seal ON seal.stage_id=s.id;
REVOKE ALL ON public.grh_successor_stage_summary_v1 FROM PUBLIC,municontrol_actions_runtime_app;
COMMENT ON TABLE public.grh_successor_stage IS 'Private source staging only. Sealing never updates grh_effective_source_binding, source_import_batch, payroll, canonical records or native operations.';
COMMENT ON VIEW public.grh_successor_stage_summary_v1 IS 'A sealed candidate is not an operational publication. Reconciliation, typed canonical mapping, native-conflict resolution and explicit selection remain required.';
