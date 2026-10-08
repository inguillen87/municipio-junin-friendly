-- The final backup is reconstructed against its sealed, selected predecessor.
-- This is source preparation: no effective pointer or municipal record is changed.
DO $install$ BEGIN
 IF to_regclass('public.grh_final_source_revision') IS NOT NULL THEN
  RAISE EXCEPTION 'GRH_FINAL_REVISION_ALREADY_INSTALLED';
 END IF;
 IF to_regclass('public.grh_effective_source_binding') IS NULL
  OR to_regprocedure('public.grh_core_source_version_assert_v1(uuid,text)') IS NULL
  OR to_regprocedure('public.grh_curated_source_version_assert_v1(uuid,text)') IS NULL THEN
  RAISE EXCEPTION 'GRH_FINAL_REVISION_PREREQUISITE';
 END IF;
END $install$;

CREATE TABLE public.grh_final_source_revision (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL, source_binding_id uuid NOT NULL,
 parent_core_version_id uuid NOT NULL REFERENCES public.grh_core_source_version(id),
 parent_curated_version_id uuid NOT NULL REFERENCES public.grh_curated_source_version(id),
 parent_publication_sha256 text NOT NULL CHECK(parent_publication_sha256 ~ '^[a-f0-9]{64}$'),
 source_profile text NOT NULL CHECK(source_profile='grh-junin-2026-10-01'),
 source_sha256 text NOT NULL CHECK(source_sha256='50a4cc2673be5e275dc5850aa8779f46de82dd81733a87e4b2cfa2aec49e025f'),
 source_cutoff timestamp NOT NULL CHECK(source_cutoff=timestamp '2026-10-01 15:17:29'),
 core_manifest_sha256 text NOT NULL CHECK(core_manifest_sha256 ~ '^[a-f0-9]{64}$'),
 curated_manifest_sha256 text NOT NULL CHECK(curated_manifest_sha256 ~ '^[a-f0-9]{64}$'),
 package_sha256 text NOT NULL CHECK(package_sha256 ~ '^[a-f0-9]{64}$'),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='object'),
 created_transaction bigint NOT NULL DEFAULT txid_current(),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,source_sha256),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id)
);
CREATE TABLE public.grh_final_source_delta (
 revision_id uuid NOT NULL REFERENCES public.grh_final_source_revision(id),
 entity text NOT NULL, row_key text NOT NULL CHECK(row_key ~ '^[a-f0-9]{64}$'),
 operation text NOT NULL CHECK(operation IN('add','replace','remove')),
 previous_record jsonb, record jsonb, source_payload jsonb,
 PRIMARY KEY(revision_id,entity,row_key),
 CHECK(previous_record IS NULL OR jsonb_typeof(previous_record)='object'),
 CHECK(record IS NULL OR jsonb_typeof(record)='object'),
 CHECK(source_payload IS NULL OR jsonb_typeof(source_payload)='object'),
 CHECK((operation='add' AND previous_record IS NULL AND record IS NOT NULL)
  OR (operation='replace' AND previous_record IS NOT NULL AND record IS NOT NULL AND previous_record<>record)
  OR (operation='remove' AND previous_record IS NOT NULL AND record IS NULL)),
 CHECK((entity LIKE 'core/%' AND ((operation='remove' AND source_payload IS NULL)
  OR (operation<>'remove' AND source_payload IS NOT NULL)))
  OR (entity LIKE 'curated/%' AND source_payload IS NULL))
);
CREATE TABLE public.grh_final_source_seal (
 revision_id uuid PRIMARY KEY REFERENCES public.grh_final_source_revision(id),
 fingerprints jsonb NOT NULL CHECK(jsonb_typeof(fingerprints)='object'),
 sealed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.grh_final_source_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grh_final_source_delta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grh_final_source_seal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.grh_final_source_revision,public.grh_final_source_delta,public.grh_final_source_seal
 FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.grh_final_source_entities_v1() RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT ARRAY['core/payrollRuns','core/payrollSnapshot','core/payrollMonthly','core/movements',
  'core/employmentReconciliation','curated/grh_employees','curated/grh_absences','curated/grh_leaves',
  'curated/grh_family','curated/grh_catalog_rows']::text[]
$$;
CREATE FUNCTION public.grh_final_source_parent_v1(p_revision uuid) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.grh_final_source_revision%ROWTYPE;
BEGIN
 SELECT * INTO STRICT r FROM public.grh_final_source_revision WHERE id=p_revision;
 PERFORM 1 FROM public.grh_effective_source_binding selected
 JOIN public.grh_core_source_version c ON c.id=selected.source_version_id
 JOIN public.grh_core_source_version_seal cs ON cs.version_id=c.id
 JOIN public.grh_curated_source_version v ON v.id=r.parent_curated_version_id
  AND v.core_version_id=c.id AND v.tenant_id=c.tenant_id AND v.source_binding_id=c.source_binding_id
  AND v.source_batch_id=selected.source_batch_id AND v.import_run_id=selected.import_run_id
 JOIN public.grh_curated_source_version_seal vs ON vs.version_id=v.id
 JOIN public.platform_tenant_source_binding b ON b.id=selected.source_binding_id AND b.tenant_id=selected.tenant_id
 JOIN public.tenant_identity_policy policy ON policy.tenant_id=b.tenant_id AND policy.certified_source_binding_id=b.id
 WHERE selected.tenant_id=r.tenant_id AND selected.source_binding_id=r.source_binding_id
  AND selected.source_version_id=r.parent_core_version_id AND selected.publication_sha256=r.parent_publication_sha256
  AND c.tenant_id=r.tenant_id AND c.source_binding_id=r.source_binding_id
  AND c.source_sha256='5a604acfe5ea32832b630d8aab29e494038d4c8940b231e283a53d14112665c7'
  AND c.source_cutoff=timestamp '2026-09-10 15:17:30'
  AND v.source_sha256=c.source_sha256 AND v.source_cutoff=c.source_cutoff
  AND b.verified AND policy.tenant_data_plane_ready AND b.source_system='GRH'
  AND b.source_database=c.source_database AND b.source_company_id=c.source_company_id
 FOR SHARE OF selected,c,v,b,policy NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'GRH_FINAL_REVISION_PARENT_CHANGED'; END IF;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'GRH_FINAL_REVISION_BUSY';
END $$;
CREATE FUNCTION public.grh_final_source_guard_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE revision uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'GRH_FINAL_REVISION_IMMUTABLE'; END IF;
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.grh_final_source_revision'::regclass)) THEN
  RAISE EXCEPTION 'GRH_FINAL_REVISION_OWNER_REQUIRED';
 END IF;
 IF TG_TABLE_NAME='grh_final_source_revision' THEN
  IF NEW.created_transaction<>txid_current() THEN RAISE EXCEPTION 'GRH_FINAL_REVISION_TRANSACTION'; END IF;
 ELSE
  revision:=NEW.revision_id;
  IF NOT EXISTS(SELECT 1 FROM public.grh_final_source_revision r WHERE r.id=revision AND r.created_transaction=txid_current())
   OR EXISTS(SELECT 1 FROM public.grh_final_source_seal s WHERE s.revision_id=revision) THEN
   RAISE EXCEPTION 'GRH_FINAL_REVISION_SEALED';
  END IF;
  IF TG_TABLE_NAME='grh_final_source_delta' THEN
   IF NOT (NEW.entity=ANY(public.grh_final_source_entities_v1())) THEN
    RAISE EXCEPTION 'GRH_FINAL_REVISION_ENTITY';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.grh_final_source_seal_required_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.grh_final_source_seal WHERE revision_id=NEW.id) THEN
  RAISE EXCEPTION 'GRH_FINAL_REVISION_SEAL_REQUIRED';
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION public.grh_final_source_base_rows_v1(p_revision uuid,p_entity text)
RETURNS TABLE(row_key text,record jsonb) LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.grh_final_source_revision%ROWTYPE;
BEGIN
 IF NOT (p_entity=ANY(public.grh_final_source_entities_v1())) THEN RAISE EXCEPTION 'GRH_FINAL_REVISION_ENTITY'; END IF;
 SELECT * INTO STRICT r FROM public.grh_final_source_revision WHERE id=p_revision;
 IF p_entity LIKE 'core/%' THEN RETURN QUERY
  SELECT b.source_id,b.record FROM public.grh_core_source_unsealed_rows_v1(r.parent_core_version_id,split_part(p_entity,'/',2)) b;
 ELSE RETURN QUERY
  SELECT b.row_key,b.record FROM public.grh_curated_source_unsealed_rows_v1(r.parent_curated_version_id,split_part(p_entity,'/',2)) b;
 END IF;
END $$;
CREATE FUNCTION public.grh_final_source_unsealed_rows_v1(p_revision uuid,p_entity text)
RETURNS TABLE(row_key text,record jsonb) LANGUAGE sql STABLE
SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT b.row_key,b.record FROM public.grh_final_source_base_rows_v1(p_revision,p_entity) b
 WHERE NOT EXISTS(SELECT 1 FROM public.grh_final_source_delta d
  WHERE d.revision_id=p_revision AND d.entity=p_entity AND d.row_key=b.row_key)
 UNION ALL SELECT d.row_key,d.record FROM public.grh_final_source_delta d
 WHERE d.revision_id=p_revision AND d.entity=p_entity AND d.operation IN('add','replace')
$$;
CREATE FUNCTION public.grh_final_source_fingerprint_v1(p_revision uuid,p_entity text,p_baseline boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_baseline THEN
  SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(r.row_key||r.record::text),'' ORDER BY r.row_key),'')))
  INTO result FROM public.grh_final_source_base_rows_v1(p_revision,p_entity) r;
 ELSE
  SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(r.row_key||r.record::text),'' ORDER BY r.row_key),'')))
  INTO result FROM public.grh_final_source_unsealed_rows_v1(p_revision,p_entity) r;
 END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.grh_final_source_seal_guard_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.grh_final_source_revision%ROWTYPE; selected_entity text; proof jsonb; observed jsonb; parent_seal jsonb; company text;
BEGIN
 PERFORM public.grh_final_source_parent_v1(NEW.revision_id);
 SELECT * INTO STRICT r FROM public.grh_final_source_revision WHERE id=NEW.revision_id;
 SELECT source_company_id::text INTO company FROM public.grh_core_source_version WHERE id=r.parent_core_version_id;
 IF ARRAY(SELECT jsonb_object_keys(r.evidence) ORDER BY 1) IS DISTINCT FROM ARRAY(SELECT unnest(public.grh_final_source_entities_v1()) ORDER BY 1)
  OR ARRAY(SELECT jsonb_object_keys(NEW.fingerprints) ORDER BY 1) IS DISTINCT FROM ARRAY(SELECT unnest(public.grh_final_source_entities_v1()) ORDER BY 1) THEN
  RAISE EXCEPTION 'GRH_FINAL_REVISION_INCOMPLETE';
 END IF;
 IF (SELECT count(*) FROM public.grh_final_source_delta WHERE revision_id=r.id)>100000
  OR (SELECT coalesce(sum(octet_length(to_jsonb(d)::text)),0) FROM public.grh_final_source_delta d WHERE revision_id=r.id)>33554432 THEN
  RAISE EXCEPTION 'GRH_FINAL_REVISION_LIMIT';
 END IF;
 FOREACH selected_entity IN ARRAY public.grh_final_source_entities_v1() LOOP
  proof:=r.evidence->selected_entity;
  IF jsonb_typeof(proof) IS DISTINCT FROM 'object'
   OR ARRAY(SELECT jsonb_object_keys(proof) ORDER BY 1) IS DISTINCT FROM ARRAY['baseline','candidate','changes']
   OR jsonb_typeof(proof->'changes') IS DISTINCT FROM 'object'
   OR ARRAY(SELECT jsonb_object_keys(proof->'changes') ORDER BY 1) IS DISTINCT FROM ARRAY['add','remove','replace']
   OR EXISTS(SELECT 1 FROM jsonb_each(proof->'changes') v WHERE jsonb_typeof(v.value)<>'number' OR v.value::text!~'^[0-9]{1,7}$') THEN
   RAISE EXCEPTION 'GRH_FINAL_REVISION_EVIDENCE';
  END IF;
  IF (SELECT jsonb_build_object('add',count(*) FILTER(WHERE operation='add'),'remove',count(*) FILTER(WHERE operation='remove'),
   'replace',count(*) FILTER(WHERE operation='replace')) FROM public.grh_final_source_delta WHERE revision_id=r.id AND entity=selected_entity)
   IS DISTINCT FROM proof->'changes' THEN RAISE EXCEPTION 'GRH_FINAL_REVISION_CHANGE_COUNT'; END IF;
  IF selected_entity LIKE 'core/%' THEN
   PERFORM public.grh_core_source_version_assert_v1(r.parent_core_version_id,split_part(selected_entity,'/',2));
   SELECT entity_fingerprints->split_part(selected_entity,'/',2) INTO parent_seal FROM public.grh_core_source_version_seal WHERE version_id=r.parent_core_version_id;
  ELSE
   PERFORM public.grh_curated_source_version_assert_v1(r.parent_curated_version_id,split_part(selected_entity,'/',2));
   SELECT entity_fingerprints->split_part(selected_entity,'/',2) INTO parent_seal FROM public.grh_curated_source_version_seal WHERE version_id=r.parent_curated_version_id;
  END IF;
  observed:=public.grh_final_source_fingerprint_v1(r.id,selected_entity,true);
  IF observed IS DISTINCT FROM parent_seal OR observed IS DISTINCT FROM proof->'baseline' THEN
   RAISE EXCEPTION 'GRH_FINAL_REVISION_BASELINE_DRIFT';
  END IF;
  IF EXISTS(SELECT 1 FROM public.grh_final_source_delta d
   LEFT JOIN public.grh_final_source_base_rows_v1(r.id,selected_entity) b ON b.row_key=d.row_key
   WHERE d.revision_id=r.id AND d.entity=selected_entity
    AND ((d.operation='add' AND b.row_key IS NOT NULL)
     OR (d.operation IN('replace','remove') AND (b.row_key IS NULL OR b.record IS DISTINCT FROM d.previous_record)))) THEN
   RAISE EXCEPTION 'GRH_FINAL_REVISION_PREVIOUS_MISMATCH';
  END IF;
  IF EXISTS(SELECT 1 FROM public.grh_final_source_unsealed_rows_v1(r.id,selected_entity) v WHERE
   CASE WHEN selected_entity LIKE 'core/%' THEN v.record->>'company_source_id' IS DISTINCT FROM company
    WHEN selected_entity<>'curated/grh_catalog_rows' THEN v.record->>'company_id' IS DISTINCT FROM company ELSE false END) THEN
   RAISE EXCEPTION 'GRH_FINAL_REVISION_COMPANY';
  END IF;
  observed:=public.grh_final_source_fingerprint_v1(r.id,selected_entity,false);
  IF observed IS DISTINCT FROM proof->'candidate' OR observed IS DISTINCT FROM NEW.fingerprints->selected_entity
   OR (observed->>'rows')::bigint>2000000 THEN RAISE EXCEPTION 'GRH_FINAL_REVISION_CANDIDATE_DRIFT'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.grh_final_source_unsealed_rows_v1(r.id,'core/payrollSnapshot') v
  GROUP BY v.record->'company_source_id',v.record->'employee_number',v.record->'snapshot_date',
   v.record->'source_period',v.record->'source_month',v.record->'payroll_type' HAVING count(*)>1) THEN
  RAISE EXCEPTION 'GRH_FINAL_REVISION_SNAPSHOT_DUPLICATE';
 END IF;
 RETURN NEW;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'GRH_FINAL_REVISION_BUSY';
END $$;
DO $triggers$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['grh_final_source_revision','grh_final_source_delta','grh_final_source_seal'] LOOP
  EXECUTE format('CREATE TRIGGER a_final_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.grh_final_source_guard_v1()',name);
  EXECUTE format('CREATE TRIGGER a_final_revision_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.grh_final_source_guard_v1()',name);
 END LOOP;
 CREATE TRIGGER b_final_revision_seal BEFORE INSERT ON public.grh_final_source_seal
  FOR EACH ROW EXECUTE FUNCTION public.grh_final_source_seal_guard_v1();
 CREATE CONSTRAINT TRIGGER final_revision_seal_at_commit AFTER INSERT ON public.grh_final_source_revision
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.grh_final_source_seal_required_v1();
END $triggers$;
CREATE FUNCTION public.grh_final_source_rows_v1(p_revision uuid,p_entity text)
RETURNS TABLE(row_key text,record jsonb) LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT (p_entity=ANY(public.grh_final_source_entities_v1())) THEN RAISE EXCEPTION 'GRH_FINAL_REVISION_ENTITY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.grh_final_source_seal WHERE revision_id=p_revision) THEN
  RAISE EXCEPTION 'GRH_FINAL_REVISION_UNSEALED';
 END IF;
 RETURN QUERY SELECT v.row_key,v.record FROM public.grh_final_source_unsealed_rows_v1(p_revision,p_entity) v;
END $$;
REVOKE ALL ON FUNCTION public.grh_final_source_entities_v1(),public.grh_final_source_parent_v1(uuid),
 public.grh_final_source_guard_v1(),public.grh_final_source_seal_required_v1(),
 public.grh_final_source_base_rows_v1(uuid,text),public.grh_final_source_unsealed_rows_v1(uuid,text),
 public.grh_final_source_fingerprint_v1(uuid,text,boolean),public.grh_final_source_seal_guard_v1(),
 public.grh_final_source_rows_v1(uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
COMMENT ON TABLE public.grh_final_source_revision IS 'Immutable final-backup revision against the selected September predecessor. A seal does not select a source, adopt a contract or authorize payroll.';
