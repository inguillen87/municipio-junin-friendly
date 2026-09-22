-- 098: sealed compact curated revisions. Original tables/OIDs remain intact.
-- No runtime grant or publication pointer is created here.
DO $installation$
BEGIN
 IF to_regclass('public.grh_curated_source_version') IS NOT NULL
  OR to_regprocedure('public.grh_curated_source_record_v1(text,jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_ALREADY_INSTALLED'; END IF;
 IF to_regclass('public.grh_effective_source_binding') IS NULL THEN
  RAISE EXCEPTION 'GRH_CURATED_VERSION_PREREQUISITE_REQUIRED'; END IF;
END $installation$;
CREATE TABLE grh_curated_source_version(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,source_binding_id uuid NOT NULL,
 core_version_id uuid NOT NULL UNIQUE REFERENCES grh_core_source_version(id),
 source_batch_id uuid NOT NULL UNIQUE REFERENCES source_import_batch(id),
 import_run_id bigint NOT NULL UNIQUE REFERENCES data_import_runs(id),
 baseline_batch_id uuid NOT NULL REFERENCES source_import_batch(id),baseline_import_run_id bigint NOT NULL REFERENCES data_import_runs(id),
 baseline_source_sha256 text NOT NULL CHECK(baseline_source_sha256~'^[a-f0-9]{64}$'),source_sha256 text NOT NULL CHECK(source_sha256~'^[a-f0-9]{64}$'),
 baseline_cutoff timestamp NOT NULL,source_cutoff timestamp NOT NULL,payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),
 baseline_manifest_sha256 text NOT NULL CHECK(baseline_manifest_sha256~'^[a-f0-9]{64}$'),manifest_sha256 text NOT NULL CHECK(manifest_sha256~'^[a-f0-9]{64}$'),
 source_database text NOT NULL,source_company_id bigint NOT NULL,entity_evidence jsonb NOT NULL,baseline_fingerprints jsonb NOT NULL,candidate_expected jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),created_transaction bigint NOT NULL DEFAULT txid_current(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 UNIQUE(tenant_id,source_binding_id,source_sha256),CHECK(source_cutoff>baseline_cutoff AND source_sha256<>baseline_source_sha256),
 CHECK(source_batch_id<>baseline_batch_id AND import_run_id<>baseline_import_run_id),
 CHECK(jsonb_typeof(entity_evidence)='object' AND jsonb_typeof(baseline_fingerprints)='object' AND jsonb_typeof(candidate_expected)='object')
);
CREATE TABLE grh_curated_source_delta(
 version_id uuid NOT NULL REFERENCES grh_curated_source_version(id),entity text NOT NULL,
 row_key text NOT NULL CHECK(row_key~'^[a-f0-9]{64}$'),key_fields jsonb NOT NULL CHECK(jsonb_typeof(key_fields)='object'),
 operation text NOT NULL CHECK(operation IN('add','replace','remove')),
 previous_sha256 text CHECK(previous_sha256~'^[a-f0-9]{64}$'),candidate_sha256 text CHECK(candidate_sha256~'^[a-f0-9]{64}$'),record jsonb,patch jsonb,
 PRIMARY KEY(version_id,entity,row_key),
 CHECK(entity IN('grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows')),
 CHECK((operation='add' AND previous_sha256 IS NULL AND candidate_sha256 IS NOT NULL AND record IS NOT NULL AND patch IS NULL)
  OR(operation='replace' AND previous_sha256 IS NOT NULL AND candidate_sha256 IS NOT NULL AND previous_sha256<>candidate_sha256 AND record IS NULL AND patch IS NOT NULL)
  OR(operation='remove' AND previous_sha256 IS NOT NULL AND candidate_sha256 IS NULL AND record IS NULL AND patch IS NULL)),
 CHECK(record IS NULL OR jsonb_typeof(record)='object'),CHECK(patch IS NULL OR (jsonb_typeof(patch)='array' AND jsonb_array_length(patch)>0))
);
CREATE TABLE grh_curated_source_version_seal(
 version_id uuid PRIMARY KEY REFERENCES grh_curated_source_version(id),entity_fingerprints jsonb NOT NULL CHECK(jsonb_typeof(entity_fingerprints)='object'),
 sealed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON grh_curated_source_version,grh_curated_source_delta,grh_curated_source_version_seal FROM PUBLIC,municontrol_actions_runtime_app;
ALTER TABLE grh_curated_source_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE grh_curated_source_delta ENABLE ROW LEVEL SECURITY;
ALTER TABLE grh_curated_source_version_seal ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION grh_curated_source_version_immutable_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'GRH_CURATED_VERSION_IMMUTABLE'; END $$;
CREATE FUNCTION grh_curated_source_version_insert_guard_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='grh_curated_source_version' THEN
  IF NEW.created_transaction<>txid_current() THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_TRANSACTION_INVALID'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM grh_curated_source_version WHERE id=NEW.version_id AND created_transaction=txid_current())
   OR EXISTS(SELECT 1 FROM grh_curated_source_version_seal WHERE version_id=NEW.version_id) THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_ALREADY_SEALED'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION grh_curated_source_version_seal_required_v1() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF NOT EXISTS(SELECT 1 FROM grh_curated_source_version_seal WHERE version_id=NEW.id) THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_SEAL_REQUIRED'; END IF; RETURN NULL; END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['grh_curated_source_version','grh_curated_source_delta','grh_curated_source_version_seal'] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION grh_curated_source_version_immutable_v1()',t||'_immutable',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION grh_curated_source_version_immutable_v1()',t||'_no_truncate',t);
  EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION grh_curated_source_version_insert_guard_v1()',t||'_insert_guard',t);
 END LOOP;
 CREATE CONSTRAINT TRIGGER grh_curated_source_version_sealed_at_commit AFTER INSERT ON grh_curated_source_version
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION grh_curated_source_version_seal_required_v1();
END $$;

CREATE FUNCTION grh_curated_source_record_v1(p_entity text,p_record jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE result jsonb:=p_record-'import_run_id';
BEGIN
 IF p_entity='grh_employees' THEN RETURN result||jsonb_build_object('person_id',p_record->>'person_id');
 ELSIF p_entity='grh_family' THEN RETURN result||jsonb_build_object('family_id',p_record->>'family_id');
 ELSIF p_entity='grh_absences' THEN RETURN result||jsonb_build_object('cantidad',trim_scale((p_record->>'cantidad')::numeric)::text,'dias',trim_scale((p_record->>'dias')::numeric)::text);
 ELSIF p_entity IN('grh_leaves','grh_catalog_rows') THEN RETURN result;
 ELSE RAISE EXCEPTION 'GRH_CURATED_VERSION_ENTITY_INVALID'; END IF;
END $$;
CREATE FUNCTION grh_curated_source_key_v1(p_entity text,r jsonb) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE parts text[];
BEGIN
 CASE p_entity WHEN 'grh_employees' THEN parts:=ARRAY[r->>'company_id',r->>'legajo'];
 WHEN 'grh_absences' THEN parts:=ARRAY[r->>'company_id',r->>'legajo',r->>'fecha'];
 WHEN 'grh_leaves' THEN parts:=ARRAY[r->>'company_id',r->>'periodo',r->>'legajo',r->>'fecha_inicio'];
 WHEN 'grh_family' THEN parts:=ARRAY[r->>'family_id'];
 WHEN 'grh_catalog_rows' THEN parts:=ARRAY[r->>'catalog',r->>'source_key'];
 ELSE RAISE EXCEPTION 'GRH_CURATED_VERSION_ENTITY_INVALID'; END CASE;
 IF EXISTS(SELECT 1 FROM unnest(parts) p WHERE p IS NULL OR strpos(p,chr(31))>0) THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_KEY_INVALID'; END IF;
 RETURN encode(digest(array_to_string(parts,chr(31)),'sha256'),'hex');
END $$;
CREATE FUNCTION grh_curated_source_base_rows_v1(p_run bigint,p_entity text)
RETURNS TABLE(row_key text,record jsonb) LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
BEGIN
 IF p_entity NOT IN('grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows') OR p_entity IS NULL THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_ENTITY_INVALID'; END IF;
 RETURN QUERY EXECUTE format('SELECT grh_curated_source_key_v1($2,to_jsonb(r)),grh_curated_source_record_v1($2,to_jsonb(r)) FROM public.%I r WHERE import_run_id=$1',p_entity) USING p_run,p_entity;
END $$;
CREATE FUNCTION grh_curated_source_base_fingerprint_v1(p_run bigint,p_entity text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(row_key||record::text),'' ORDER BY row_key),''))) FROM grh_curated_source_base_rows_v1(p_run,p_entity)
$$;
CREATE FUNCTION grh_curated_source_apply_patch_v1(p_record jsonb,p_patch jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE result jsonb:=p_record;c jsonb;p text[];
BEGIN
 IF jsonb_typeof(p_patch) IS DISTINCT FROM 'array' OR jsonb_array_length(p_patch)=0 THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_PATCH_INVALID'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p_patch) LOOP
  IF c->>'op' NOT IN('set','remove') OR c->>'op' IS NULL OR jsonb_typeof(c->'path') IS DISTINCT FROM 'array' OR jsonb_array_length(c->'path') NOT BETWEEN 1 AND 64
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(c->'path') k WHERE jsonb_typeof(k)<>'string') THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_PATCH_INVALID'; END IF;
  p:=ARRAY(SELECT jsonb_array_elements_text(c->'path'));
  IF array_length(p,1)>1 AND jsonb_typeof(result#>p[1:array_length(p,1)-1]) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_PATCH_INVALID'; END IF;
  IF c->>'op'='set' THEN IF NOT(c?'value') THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_PATCH_INVALID'; END IF;result:=jsonb_set(result,p,c->'value',true);
  ELSE IF c?'value' OR result#>p IS NULL THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_PATCH_INVALID'; END IF;result:=result#-p; END IF;
 END LOOP;RETURN result;
END $$;
CREATE FUNCTION grh_curated_source_unsealed_rows_v1(p_version uuid,p_entity text)
RETURNS TABLE(row_key text,record jsonb) LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT b.row_key,CASE WHEN d.operation='replace' THEN grh_curated_source_apply_patch_v1(b.record,d.patch) ELSE b.record END
 FROM grh_curated_source_version v CROSS JOIN LATERAL grh_curated_source_base_rows_v1(v.baseline_import_run_id,p_entity) b
 LEFT JOIN grh_curated_source_delta d ON d.version_id=v.id AND d.entity=p_entity AND d.row_key=b.row_key
 WHERE v.id=p_version AND (d.operation IS NULL OR d.operation='replace')
 UNION ALL SELECT row_key,record FROM grh_curated_source_delta WHERE version_id=p_version AND entity=p_entity AND operation='add'
$$;
CREATE FUNCTION grh_curated_source_version_fingerprint_v1(p_version uuid,p_entity text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('rows',count(*),'md5',md5(coalesce(string_agg(md5(row_key||record::text),'' ORDER BY row_key),''))) FROM grh_curated_source_unsealed_rows_v1(p_version,p_entity)
$$;
CREATE FUNCTION grh_curated_source_version_assert_v1(p_version uuid,p_entity text) RETURNS void LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE v grh_curated_source_version%ROWTYPE;s grh_curated_source_version_seal%ROWTYPE;observed jsonb;
BEGIN
 IF p_entity NOT IN('grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows') OR p_entity IS NULL THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_ENTITY_INVALID'; END IF;
 SELECT * INTO v FROM grh_curated_source_version WHERE id=p_version;IF NOT FOUND THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_NOT_FOUND'; END IF;
 SELECT * INTO s FROM grh_curated_source_version_seal WHERE version_id=p_version;IF NOT FOUND THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_NOT_SEALED'; END IF;
 IF v.baseline_fingerprints->p_entity IS DISTINCT FROM grh_curated_source_base_fingerprint_v1(v.baseline_import_run_id,p_entity) THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_BASELINE_DRIFT'; END IF;
 observed:=grh_curated_source_version_fingerprint_v1(p_version,p_entity);
 IF s.entity_fingerprints->p_entity IS DISTINCT FROM observed OR (observed->>'rows')::bigint IS DISTINCT FROM (v.entity_evidence->p_entity->'counts'->>'candidate')::bigint
  THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_CONTENT_DRIFT'; END IF;
END $$;
CREATE FUNCTION grh_curated_source_version_rows_v1(p_version uuid,p_entity text,p_revision text DEFAULT 'candidate')
RETURNS TABLE(row_key text,record jsonb,source_version_id uuid,source_revision text,source_sha256 text,source_cutoff timestamp,operational boolean)
LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE v grh_curated_source_version%ROWTYPE;
BEGIN
 IF p_revision IS NULL OR p_revision NOT IN('baseline','candidate') THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_REVISION_INVALID'; END IF;
 PERFORM grh_curated_source_version_assert_v1(p_version,p_entity);SELECT * INTO v FROM grh_curated_source_version WHERE id=p_version;
 IF p_revision='baseline' THEN RETURN QUERY SELECT r.row_key,r.record,v.id,p_revision,v.baseline_source_sha256,v.baseline_cutoff,false FROM grh_curated_source_base_rows_v1(v.baseline_import_run_id,p_entity) r ORDER BY r.row_key;
 ELSE RETURN QUERY SELECT r.row_key,r.record,v.id,p_revision,v.source_sha256,v.source_cutoff,false FROM grh_curated_source_unsealed_rows_v1(p_version,p_entity) r ORDER BY r.row_key; END IF;
END $$;

-- Same literal payload, source key, row numbering and PostgreSQL JSONB hash as
-- canonical-promote-current-grh.sql. No second full staging payload is stored.
CREATE FUNCTION grh_curated_source_staging_v1(p_version uuid,p_revision text DEFAULT 'candidate')
RETURNS TABLE(source_schema text,source_entity text,source_id text,source_row_number bigint,source_row_sha256 text,source_payload jsonb)
LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE e text;
BEGIN
 FOREACH e IN ARRAY ARRAY['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'] LOOP
  PERFORM grh_curated_source_version_assert_v1(p_version,e);
 END LOOP;
 IF p_revision IS NULL OR p_revision NOT IN('baseline','candidate') THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_REVISION_INVALID'; END IF;
 RETURN QUERY WITH rows AS MATERIALIZED (
  SELECT e.entity,r.record FROM unnest(ARRAY['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows']) e(entity)
  CROSS JOIN LATERAL grh_curated_source_version_rows_v1(p_version,e.entity,p_revision) r
 ), staged AS (
  SELECT 'legajo'::text AS entity,jsonb_build_object('companyCode',(record->>'company_id')::integer,'employeeNumber',record->>'legajo')::text AS id,
   row_number() OVER(ORDER BY (record->>'company_id')::integer,record->>'legajo') AS n,record->'source_payload' AS payload FROM rows WHERE entity='grh_employees'
  UNION ALL SELECT 'ausencia',jsonb_build_object('companyCode',(record->>'company_id')::integer,'employeeNumber',record->>'legajo','absenceDate',(record->>'fecha')::date)::text,
   row_number() OVER(ORDER BY (record->>'company_id')::integer,record->>'legajo',(record->>'fecha')::date),record->'source_payload' FROM rows WHERE entity='grh_absences'
  UNION ALL SELECT 'licencia',jsonb_build_object('companyCode',(record->>'company_id')::integer,'employeeNumber',record->>'legajo','period',(record->>'periodo')::integer,'startDate',(record->>'fecha_inicio')::date)::text,
   row_number() OVER(ORDER BY (record->>'company_id')::integer,(record->>'periodo')::integer,record->>'legajo',(record->>'fecha_inicio')::date),record->'source_payload' FROM rows WHERE entity='grh_leaves'
  UNION ALL SELECT 'familia',record->>'family_id',row_number() OVER(ORDER BY (record->>'family_id')::bigint),record->'source_payload' FROM rows WHERE entity='grh_family'
  UNION ALL SELECT 'catalog:'||(record->>'catalog'),record->>'source_key',row_number() OVER(ORDER BY record->>'catalog',record->>'source_key'),record->'source_payload' FROM rows WHERE entity='grh_catalog_rows'
 ) SELECT 'grh_junin'::text,s.entity,s.id,s.n,encode(digest(s.payload::text,'sha256'),'hex'),s.payload FROM staged s;
END $$;
REVOKE ALL ON FUNCTION grh_curated_source_version_immutable_v1(),grh_curated_source_version_insert_guard_v1(),grh_curated_source_version_seal_required_v1(),
 grh_curated_source_record_v1(text,jsonb),grh_curated_source_key_v1(text,jsonb),grh_curated_source_base_rows_v1(bigint,text),grh_curated_source_base_fingerprint_v1(bigint,text),
 grh_curated_source_apply_patch_v1(jsonb,jsonb),grh_curated_source_unsealed_rows_v1(uuid,text),grh_curated_source_version_fingerprint_v1(uuid,text),grh_curated_source_version_assert_v1(uuid,text),
 grh_curated_source_version_rows_v1(uuid,text,text),grh_curated_source_staging_v1(uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;

-- Typed, filterable reads. Full fingerprint routines above are preflight only.
CREATE VIEW public.grh_source_employees_v1 AS
 SELECT b.* FROM public.grh_employees b
 UNION ALL
 SELECT b.company_id,b.legajo,b.person_id,b.nombre,b.sexo,b.fecha_nacimiento,b.dni,b.cuil,b.telefono,b.email,b.domicilio,b.localidad,b.fecha_ingreso,b.fecha_egreso,b.activo,b.sector_code,b.sector,b.categoria_code,b.categoria,b.convenio_code,b.convenio,b.cargo_code,b.cargo,b.gremio,b.lugar_trabajo,b.profesion,b.source_payload,v.import_run_id
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_employees b ON b.import_run_id=v.baseline_import_run_id
 WHERE NOT EXISTS(SELECT 1 FROM public.grh_curated_source_delta d WHERE d.version_id=v.id AND d.entity='grh_employees'
 AND d.row_key=public.grh_curated_source_key_v1('grh_employees',jsonb_build_object('company_id',b.company_id,'legajo',b.legajo)))
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_employees' AND d.operation='replace'
 JOIN public.grh_employees b ON b.import_run_id=v.baseline_import_run_id AND b.company_id=(d.key_fields->>'company_id')::integer AND b.legajo=(d.key_fields->>'legajo')
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_employees,public.grh_curated_source_apply_patch_v1(public.grh_curated_source_record_v1('grh_employees',to_jsonb(b)),d.patch)||jsonb_build_object('import_run_id',v.import_run_id)) typed
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_employees' AND d.operation='add'
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_employees,d.record||jsonb_build_object('import_run_id',v.import_run_id)) typed;
CREATE VIEW public.grh_effective_employees_v1 AS
 SELECT b.* FROM public.grh_employees b WHERE NOT EXISTS(SELECT 1 FROM public.grh_effective_source_binding p
 JOIN public.grh_curated_source_version v ON v.core_version_id=p.source_version_id WHERE b.import_run_id=v.baseline_import_run_id)
 UNION ALL SELECT r.* FROM public.grh_source_employees_v1 r JOIN public.grh_curated_source_version v ON r.import_run_id=v.import_run_id
 JOIN public.grh_effective_source_binding p ON p.source_version_id=v.core_version_id AND p.tenant_id=v.tenant_id AND p.source_binding_id=v.source_binding_id
 AND p.source_batch_id=v.source_batch_id AND p.import_run_id=v.import_run_id;
REVOKE ALL ON public.grh_source_employees_v1,public.grh_effective_employees_v1 FROM PUBLIC,municontrol_actions_runtime_app;
CREATE VIEW public.grh_source_absences_v1 AS
 SELECT b.* FROM public.grh_absences b
 UNION ALL
 SELECT b.company_id,b.legajo,b.fecha,b.motivo_code,b.cantidad,b.dias,b.fecha_hasta,b.comentario,b.source_payload,v.import_run_id
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_absences b ON b.import_run_id=v.baseline_import_run_id
 WHERE NOT EXISTS(SELECT 1 FROM public.grh_curated_source_delta d WHERE d.version_id=v.id AND d.entity='grh_absences'
 AND d.row_key=public.grh_curated_source_key_v1('grh_absences',jsonb_build_object('company_id',b.company_id,'legajo',b.legajo,'fecha',b.fecha)))
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_absences' AND d.operation='replace'
 JOIN public.grh_absences b ON b.import_run_id=v.baseline_import_run_id AND b.company_id=(d.key_fields->>'company_id')::integer AND b.legajo=(d.key_fields->>'legajo') AND b.fecha=(d.key_fields->>'fecha')::date
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_absences,public.grh_curated_source_apply_patch_v1(public.grh_curated_source_record_v1('grh_absences',to_jsonb(b)),d.patch)||jsonb_build_object('import_run_id',v.import_run_id)) typed
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_absences' AND d.operation='add'
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_absences,d.record||jsonb_build_object('import_run_id',v.import_run_id)) typed;
CREATE VIEW public.grh_effective_absences_v1 AS
 SELECT b.* FROM public.grh_absences b WHERE NOT EXISTS(SELECT 1 FROM public.grh_effective_source_binding p
 JOIN public.grh_curated_source_version v ON v.core_version_id=p.source_version_id WHERE b.import_run_id=v.baseline_import_run_id)
 UNION ALL SELECT r.* FROM public.grh_source_absences_v1 r JOIN public.grh_curated_source_version v ON r.import_run_id=v.import_run_id
 JOIN public.grh_effective_source_binding p ON p.source_version_id=v.core_version_id AND p.tenant_id=v.tenant_id AND p.source_binding_id=v.source_binding_id
 AND p.source_batch_id=v.source_batch_id AND p.import_run_id=v.import_run_id;
REVOKE ALL ON public.grh_source_absences_v1,public.grh_effective_absences_v1 FROM PUBLIC,municontrol_actions_runtime_app;
CREATE VIEW public.grh_source_leaves_v1 AS
 SELECT b.* FROM public.grh_leaves b
 UNION ALL
 SELECT b.company_id,b.legajo,b.periodo,b.tipo,b.fecha_inicio,b.fecha_fin,b.dias,b.observaciones,b.source_payload,v.import_run_id
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_leaves b ON b.import_run_id=v.baseline_import_run_id
 WHERE NOT EXISTS(SELECT 1 FROM public.grh_curated_source_delta d WHERE d.version_id=v.id AND d.entity='grh_leaves'
 AND d.row_key=public.grh_curated_source_key_v1('grh_leaves',jsonb_build_object('company_id',b.company_id,'periodo',b.periodo,'legajo',b.legajo,'fecha_inicio',b.fecha_inicio)))
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_leaves' AND d.operation='replace'
 JOIN public.grh_leaves b ON b.import_run_id=v.baseline_import_run_id AND b.company_id=(d.key_fields->>'company_id')::integer AND b.periodo=(d.key_fields->>'periodo')::integer AND b.legajo=(d.key_fields->>'legajo') AND b.fecha_inicio=(d.key_fields->>'fecha_inicio')::date
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_leaves,public.grh_curated_source_apply_patch_v1(public.grh_curated_source_record_v1('grh_leaves',to_jsonb(b)),d.patch)||jsonb_build_object('import_run_id',v.import_run_id)) typed
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_leaves' AND d.operation='add'
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_leaves,d.record||jsonb_build_object('import_run_id',v.import_run_id)) typed;
CREATE VIEW public.grh_effective_leaves_v1 AS
 SELECT b.* FROM public.grh_leaves b WHERE NOT EXISTS(SELECT 1 FROM public.grh_effective_source_binding p
 JOIN public.grh_curated_source_version v ON v.core_version_id=p.source_version_id WHERE b.import_run_id=v.baseline_import_run_id)
 UNION ALL SELECT r.* FROM public.grh_source_leaves_v1 r JOIN public.grh_curated_source_version v ON r.import_run_id=v.import_run_id
 JOIN public.grh_effective_source_binding p ON p.source_version_id=v.core_version_id AND p.tenant_id=v.tenant_id AND p.source_binding_id=v.source_binding_id
 AND p.source_batch_id=v.source_batch_id AND p.import_run_id=v.import_run_id;
REVOKE ALL ON public.grh_source_leaves_v1,public.grh_effective_leaves_v1 FROM PUBLIC,municontrol_actions_runtime_app;
CREATE VIEW public.grh_source_family_v1 AS
 SELECT b.* FROM public.grh_family b
 UNION ALL
 SELECT b.family_id,b.company_id,b.legajo,b.nombre,b.sexo,b.fecha_nacimiento,b.dni,b.cuil,b.vinculo_code,b.fecha_baja,b.source_payload,v.import_run_id
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_family b ON b.import_run_id=v.baseline_import_run_id
 WHERE NOT EXISTS(SELECT 1 FROM public.grh_curated_source_delta d WHERE d.version_id=v.id AND d.entity='grh_family'
 AND d.row_key=public.grh_curated_source_key_v1('grh_family',jsonb_build_object('family_id',b.family_id)))
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_family' AND d.operation='replace'
 JOIN public.grh_family b ON b.import_run_id=v.baseline_import_run_id AND b.family_id=(d.key_fields->>'family_id')::bigint
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_family,public.grh_curated_source_apply_patch_v1(public.grh_curated_source_record_v1('grh_family',to_jsonb(b)),d.patch)||jsonb_build_object('import_run_id',v.import_run_id)) typed
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_family' AND d.operation='add'
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_family,d.record||jsonb_build_object('import_run_id',v.import_run_id)) typed;
CREATE VIEW public.grh_effective_family_v1 AS
 SELECT b.* FROM public.grh_family b WHERE NOT EXISTS(SELECT 1 FROM public.grh_effective_source_binding p
 JOIN public.grh_curated_source_version v ON v.core_version_id=p.source_version_id WHERE b.import_run_id=v.baseline_import_run_id)
 UNION ALL SELECT r.* FROM public.grh_source_family_v1 r JOIN public.grh_curated_source_version v ON r.import_run_id=v.import_run_id
 JOIN public.grh_effective_source_binding p ON p.source_version_id=v.core_version_id AND p.tenant_id=v.tenant_id AND p.source_binding_id=v.source_binding_id
 AND p.source_batch_id=v.source_batch_id AND p.import_run_id=v.import_run_id;
REVOKE ALL ON public.grh_source_family_v1,public.grh_effective_family_v1 FROM PUBLIC,municontrol_actions_runtime_app;
CREATE VIEW public.grh_source_catalog_rows_v1 AS
 SELECT b.* FROM public.grh_catalog_rows b
 UNION ALL
 SELECT b.catalog,b.source_key,b.label,b.source_payload,v.import_run_id
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_catalog_rows b ON b.import_run_id=v.baseline_import_run_id
 WHERE NOT EXISTS(SELECT 1 FROM public.grh_curated_source_delta d WHERE d.version_id=v.id AND d.entity='grh_catalog_rows'
 AND d.row_key=public.grh_curated_source_key_v1('grh_catalog_rows',jsonb_build_object('catalog',b.catalog,'source_key',b.source_key)))
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_catalog_rows' AND d.operation='replace'
 JOIN public.grh_catalog_rows b ON b.import_run_id=v.baseline_import_run_id AND b.catalog=(d.key_fields->>'catalog') AND b.source_key=(d.key_fields->>'source_key')
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_catalog_rows,public.grh_curated_source_apply_patch_v1(public.grh_curated_source_record_v1('grh_catalog_rows',to_jsonb(b)),d.patch)||jsonb_build_object('import_run_id',v.import_run_id)) typed
 UNION ALL
 SELECT typed.* FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_curated_source_delta d ON d.version_id=v.id AND d.entity='grh_catalog_rows' AND d.operation='add'
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.grh_catalog_rows,d.record||jsonb_build_object('import_run_id',v.import_run_id)) typed;
CREATE VIEW public.grh_effective_catalog_rows_v1 AS
 SELECT b.* FROM public.grh_catalog_rows b WHERE NOT EXISTS(SELECT 1 FROM public.grh_effective_source_binding p
 JOIN public.grh_curated_source_version v ON v.core_version_id=p.source_version_id WHERE b.import_run_id=v.baseline_import_run_id)
 UNION ALL SELECT r.* FROM public.grh_source_catalog_rows_v1 r JOIN public.grh_curated_source_version v ON r.import_run_id=v.import_run_id
 JOIN public.grh_effective_source_binding p ON p.source_version_id=v.core_version_id AND p.tenant_id=v.tenant_id AND p.source_binding_id=v.source_binding_id
 AND p.source_batch_id=v.source_batch_id AND p.import_run_id=v.import_run_id;
REVOKE ALL ON public.grh_source_catalog_rows_v1,public.grh_effective_catalog_rows_v1 FROM PUBLIC,municontrol_actions_runtime_app;

-- Literal staging payload/hash/ordinal, matching canonical promotion. Batch
-- predicates enter each typed source branch; no full PLpgSQL reader is used.
CREATE VIEW public.grh_effective_source_staging_v1 AS
 SELECT s.* FROM public.source_staging_row s
 UNION ALL
 SELECT v.source_batch_id,'grh_junin'::varchar(128),'legajo'::varchar(128),
  jsonb_build_object('companyCode',r.company_id,'employeeNumber',r.legajo)::text,
  row_number() OVER(PARTITION BY v.id ORDER BY r.company_id,r.legajo),
  encode(digest(r.source_payload::text,'sha256'),'hex')::char(64),r.source_payload,v.created_at
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_source_employees_v1 r ON r.import_run_id=v.import_run_id
 UNION ALL
 SELECT v.source_batch_id,'grh_junin'::varchar(128),'ausencia'::varchar(128),
  jsonb_build_object('companyCode',r.company_id,'employeeNumber',r.legajo,'absenceDate',r.fecha)::text,
  row_number() OVER(PARTITION BY v.id ORDER BY r.company_id,r.legajo,r.fecha),
  encode(digest(r.source_payload::text,'sha256'),'hex')::char(64),r.source_payload,v.created_at
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_source_absences_v1 r ON r.import_run_id=v.import_run_id
 UNION ALL
 SELECT v.source_batch_id,'grh_junin'::varchar(128),'licencia'::varchar(128),
  jsonb_build_object('companyCode',r.company_id,'employeeNumber',r.legajo,'period',r.periodo,'startDate',r.fecha_inicio)::text,
  row_number() OVER(PARTITION BY v.id ORDER BY r.company_id,r.periodo,r.legajo,r.fecha_inicio),
  encode(digest(r.source_payload::text,'sha256'),'hex')::char(64),r.source_payload,v.created_at
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_source_leaves_v1 r ON r.import_run_id=v.import_run_id
 UNION ALL
 SELECT v.source_batch_id,'grh_junin'::varchar(128),'familia'::varchar(128),r.family_id::text,
  row_number() OVER(PARTITION BY v.id ORDER BY r.family_id),
  encode(digest(r.source_payload::text,'sha256'),'hex')::char(64),r.source_payload,v.created_at
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_source_family_v1 r ON r.import_run_id=v.import_run_id
 UNION ALL
 SELECT v.source_batch_id,'grh_junin'::varchar(128),('catalog:'||r.catalog)::varchar(128),r.source_key,
  row_number() OVER(PARTITION BY v.id ORDER BY r.catalog,r.source_key),
  encode(digest(r.source_payload::text,'sha256'),'hex')::char(64),r.source_payload,v.created_at
 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
 JOIN public.grh_source_catalog_rows_v1 r ON r.import_run_id=v.import_run_id;
REVOKE ALL ON public.grh_effective_source_staging_v1 FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.grh_curated_baseline_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $baseline$
DECLARE old_row jsonb; new_row jsonb;
BEGIN
 IF TG_OP='TRUNCATE' THEN
  IF EXISTS(SELECT 1 FROM public.grh_curated_source_version_seal) THEN RAISE EXCEPTION 'GRH_CURATED_BASELINE_IMMUTABLE'; END IF;
  RETURN NULL;
 END IF;
 IF TG_OP<>'INSERT' THEN old_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN new_row:=to_jsonb(NEW); END IF;
 IF TG_TABLE_NAME='source_staging_row' THEN
  IF EXISTS(SELECT 1 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
   WHERE v.baseline_batch_id IN((old_row->>'batch_id')::uuid,(new_row->>'batch_id')::uuid)
    OR (v.source_batch_id=(old_row->>'batch_id')::uuid AND (old_row->>'source_entity' IN('legajo','ausencia','licencia','familia') OR old_row->>'source_entity' LIKE 'catalog:%'))
    OR (v.source_batch_id=(new_row->>'batch_id')::uuid AND (new_row->>'source_entity' IN('legajo','ausencia','licencia','familia') OR new_row->>'source_entity' LIKE 'catalog:%')))
  THEN RAISE EXCEPTION 'GRH_CURATED_BASELINE_IMMUTABLE'; END IF;
 ELSIF EXISTS(SELECT 1 FROM public.grh_curated_source_version v JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
  WHERE v.baseline_import_run_id IN((old_row->>'import_run_id')::bigint,(new_row->>'import_run_id')::bigint)
   OR v.import_run_id IN((old_row->>'import_run_id')::bigint,(new_row->>'import_run_id')::bigint)) THEN
  RAISE EXCEPTION 'GRH_CURATED_BASELINE_IMMUTABLE';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $baseline$;
DO $protect$
DECLARE entity text;
BEGIN
 FOREACH entity IN ARRAY ARRAY['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows','source_staging_row'] LOOP
  EXECUTE format('CREATE TRIGGER grh_curated_baseline_rows BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.grh_curated_baseline_guard_v1()',entity);
  EXECUTE format('CREATE TRIGGER grh_curated_baseline_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.grh_curated_baseline_guard_v1()',entity);
 END LOOP;
END $protect$;

-- Final pointer insertion must include the sealed curated half of the same
-- publication. Fingerprints are checked at publication, never on runtime reads.
CREATE FUNCTION public.grh_curated_publication_guard_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $publication$
DECLARE v public.grh_curated_source_version%ROWTYPE; entity text;
BEGIN
 SELECT * INTO v FROM public.grh_curated_source_version WHERE core_version_id=NEW.source_version_id;
 IF NOT FOUND OR v.tenant_id<>NEW.tenant_id OR v.source_binding_id<>NEW.source_binding_id
  OR v.baseline_batch_id<>NEW.baseline_batch_id OR v.source_batch_id<>NEW.source_batch_id OR v.import_run_id<>NEW.import_run_id
  OR NOT EXISTS(SELECT 1 FROM public.source_import_batch b JOIN public.data_import_runs r ON r.id=b.legacy_import_run_id
    WHERE b.id=v.source_batch_id AND r.id=v.import_run_id AND b.source_system='GRH' AND b.source_database=v.source_database
     AND b.validation_state='published' AND r.status='completed' AND r.source_name='grh_junin_curated'
     AND lower(b.source_sha256)=v.source_sha256 AND lower(r.source_sha256)=v.source_sha256 AND r.source_cutoff=v.source_cutoff
     AND b.source_cutoff=v.source_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires'
     AND r.table_counts=v.candidate_expected->'tableCounts' AND r.quality_flags=v.candidate_expected->'qualityFlags')
 THEN RAISE EXCEPTION 'GRH_CURATED_PUBLICATION_MISMATCH'; END IF;
 FOREACH entity IN ARRAY ARRAY['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'] LOOP
  PERFORM public.grh_curated_source_version_assert_v1(v.id,entity);
 END LOOP;
 RETURN NEW;
END $publication$;
CREATE TRIGGER grh_curated_publication_guard BEFORE INSERT ON public.grh_effective_source_binding
 FOR EACH ROW EXECUTE FUNCTION public.grh_curated_publication_guard_v1();

CREATE FUNCTION public.grh_curated_seal_guard_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $seal$
DECLARE v public.grh_curated_source_version%ROWTYPE; entity_name text; observed jsonb; present boolean;
BEGIN
 LOCK TABLE public.grh_employees,public.grh_absences,public.grh_leaves,public.grh_family,public.grh_catalog_rows,public.source_staging_row IN SHARE MODE NOWAIT;
 SELECT * INTO STRICT v FROM public.grh_curated_source_version WHERE id=NEW.version_id;
 IF NOT EXISTS(SELECT 1 FROM public.grh_core_source_version core WHERE core.id=v.core_version_id
  AND core.tenant_id=v.tenant_id AND core.source_binding_id=v.source_binding_id AND core.baseline_batch_id=v.baseline_batch_id
  AND core.baseline_import_run_id=v.baseline_import_run_id AND core.source_sha256=v.source_sha256
  AND core.baseline_source_sha256=v.baseline_source_sha256 AND core.source_database=v.source_database
  AND core.source_company_id=v.source_company_id AND core.source_cutoff=v.source_cutoff AND core.baseline_cutoff=v.baseline_cutoff)
 THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_CORE_MISMATCH'; END IF;
 IF EXISTS(SELECT 1 FROM public.source_staging_row WHERE batch_id=v.source_batch_id
  AND (source_entity IN('legajo','ausencia','licencia','familia') OR source_entity LIKE 'catalog:%'))
 THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_DUPLICATED_SOURCE'; END IF;
 FOREACH entity_name IN ARRAY ARRAY['grh_employees','grh_absences','grh_leaves','grh_family','grh_catalog_rows'] LOOP
  IF EXISTS(SELECT 1 FROM public.grh_curated_source_delta d WHERE d.version_id=v.id AND d.entity=entity_name
    AND public.grh_curated_source_key_v1(entity_name,d.key_fields)<>d.row_key)
   OR EXISTS(SELECT 1 FROM public.grh_curated_source_unsealed_rows_v1(v.id,entity_name) r
    WHERE public.grh_curated_source_key_v1(entity_name,r.record)<>r.row_key) THEN
   RAISE EXCEPTION 'GRH_CURATED_VERSION_KEY_INVALID'; END IF;
  -- Cast only during sealing, so malformed/overflowing dates or numbers cannot
  -- produce a sealed version which fails only when a particular row is read.
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.grh_curated_source_unsealed_rows_v1($1,$2) r
    CROSS JOIN LATERAL jsonb_populate_record(NULL::public.%I,r.record||jsonb_build_object(''import_run_id'',$3)) typed
    WHERE public.grh_curated_source_record_v1($2,to_jsonb(typed)) IS DISTINCT FROM r.record)',entity_name)
   INTO present USING v.id,entity_name,v.import_run_id;
  IF present THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_TYPED_DRIFT'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.%I WHERE import_run_id=$1)',entity_name) INTO present USING v.import_run_id;
  IF present THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_DUPLICATED_SOURCE'; END IF;
  IF v.baseline_fingerprints->entity_name IS DISTINCT FROM public.grh_curated_source_base_fingerprint_v1(v.baseline_import_run_id,entity_name) THEN
   RAISE EXCEPTION 'GRH_CURATED_VERSION_BASELINE_DRIFT'; END IF;
  observed:=public.grh_curated_source_version_fingerprint_v1(v.id,entity_name);
  IF NEW.entity_fingerprints->entity_name IS DISTINCT FROM observed
   OR (observed->>'rows')::bigint IS DISTINCT FROM (v.entity_evidence->entity_name->'counts'->>'candidate')::bigint THEN
   RAISE EXCEPTION 'GRH_CURATED_VERSION_CONTENT_DRIFT'; END IF;
 END LOOP;
 RETURN NEW;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'GRH_CURATED_VERSION_BUSY';
END $seal$;
CREATE TRIGGER grh_curated_seal_validation BEFORE INSERT ON public.grh_curated_source_version_seal
 FOR EACH ROW EXECUTE FUNCTION public.grh_curated_seal_guard_v1();
REVOKE ALL ON FUNCTION public.grh_curated_baseline_guard_v1(),public.grh_curated_publication_guard_v1(),public.grh_curated_seal_guard_v1()
 FROM PUBLIC,municontrol_actions_runtime_app;
