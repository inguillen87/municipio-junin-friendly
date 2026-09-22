-- Fail closed before changing an unknown or modified installation. Source bodies
-- are pinned after LF normalization; only the namespace changes in isolated QA.
DO $source_prerequisite$
DECLARE item record; proc record; table_oid oid; table_count integer; function_count integer; columns_json jsonb; constraints_json jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('schooling-source-installation:094',0));
 FOR item IN SELECT * FROM (VALUES
 ('school_certificate_context_v1','text, uuid, integer, text, uuid, uuid, boolean, text','7724d80c2924c0727b923909953bff96d515ae816234a58e9b196d573286b488',true,'v',true),
 ('school_certificate_current_family_v2','jsonb, uuid','b8d344c47f589ad07463781ad1522ba708b79a47495001df7e163fa0c8fb37df',true,'s',true),
 ('school_certificate_read_v3','text, uuid, integer, text, uuid, uuid, uuid','ab8f576cffa1807c6fdcd85b252903984f82452fcbeffc270fa96cba98ed8df4',true,'v',true),
 ('school_certificate_source_immutable_v4','','5c00c8dff3c8362e82420557169b83967500a396dd567671ad5e26a3d798b925',false,'v',false),
 ('school_certificate_source_identity_v4','jsonb','2f31707ca9a2c288b276a119cd20d8f404d75141ffd90340cd04b34518304c2d',false,'i',false),
 ('school_certificate_source_field_v4','jsonb, text','b49961f29007e588d8e8b134fed415468cc5d0f83d5eacb1f7d4fc61bb6c033c',false,'i',false),
 ('school_certificate_source_import_v4','uuid, uuid, uuid, jsonb, text, boolean','0029cee18a4f629fec154f483136b382d8f293d1b168067de0bff8f491c69635',false,'v',false),
 ('school_certificate_read_v4','text, uuid, integer, text, uuid, uuid, uuid','d612d9c36f5fe7d4712db75f9fa56a2979787713105011fa2c8188c2c60ce479',true,'v',false)
 ) pin(name,args,body_sha256,definer,volatility,required) LOOP
  SELECT p.*,n.nspname,l.lanname INTO proc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
   WHERE p.oid=to_regprocedure('public.'||item.name||'('||item.args||')');
  IF NOT FOUND THEN
   IF item.required OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname=item.name)
   THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_PREREQUISITE'; END IF;
  ELSIF proc.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user) OR proc.prosecdef<>item.definer OR proc.provolatile::text<>item.volatility
   OR encode(public.digest(replace(replace(proc.prosrc,E'\r\n',E'\n'),proc.nspname||'.','public'||'.'),'sha256'),'hex')<>item.body_sha256
   OR (NOT item.required AND (proc.prokind<>'f' OR proc.proisstrict OR proc.proleakproof OR proc.proretset
    OR proc.lanname<>CASE WHEN item.name='school_certificate_source_identity_v4' THEN 'sql' ELSE 'plpgsql' END
    OR proc.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, '||proc.nspname||', pg_temp']
    OR EXISTS(SELECT 1 FROM aclexplode(coalesce(proc.proacl,acldefault('f',proc.proowner))) a WHERE a.grantee<>proc.proowner
      AND NOT(item.name='school_certificate_read_v4' AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))))
  THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_PREREQUISITE'; END IF;
 END LOOP;
 SELECT count(*) INTO table_count FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relname IN('school_certificate_source_recovery','school_certificate_source_date');
 SELECT count(*) INTO function_count FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
  ('school_certificate_source_immutable_v4','school_certificate_source_identity_v4','school_certificate_source_field_v4','school_certificate_source_import_v4','school_certificate_read_v4');
 IF (table_count<>0 OR function_count<>0) AND (table_count<>2 OR function_count<>5)
 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_PREREQUISITE'; END IF;
 FOR item IN SELECT * FROM (VALUES
 ('school_certificate_source_date',$columns$[["recovery_id","uuid",true,null],["family_id","bigint",true,null],["company_id","bigint",true,null],["legajo","text",true,null],["identity_sha256","text",true,null],["source_fields","jsonb",true,null]]$columns$::jsonb,$constraints$[["school_certificate_source_date_company_id_check","CHECK ((company_id > 0))",true],["school_certificate_source_date_family_id_check","CHECK ((family_id > 0))",true],["school_certificate_source_date_identity_sha256_check","CHECK ((identity_sha256 ~ '^[a-f0-9]{64}$'::text))",true],["school_certificate_source_date_legajo_check","CHECK (((length(legajo) >= 1) AND (length(legajo) <= 64)))",true],["school_certificate_source_date_pkey","PRIMARY KEY (recovery_id, family_id)",true],["school_certificate_source_date_recovery_id_fkey","FOREIGN KEY (recovery_id) REFERENCES school_certificate_source_recovery(id)",true],["school_certificate_source_date_source_fields_check","CHECK (((jsonb_typeof(source_fields) = 'object'::text) AND ((source_fields - ARRAY['PRES_14'::text, 'VENC_14'::text]) = '{}'::jsonb)))",true]]$constraints$::jsonb),
 ('school_certificate_source_recovery',$columns$[["id","uuid",true,"gen_random_uuid()"],["tenant_id","uuid",true,null],["source_binding_id","uuid",true,null],["source_batch_id","uuid",true,null],["source_import_run_id","bigint",true,null],["source_sha256","text",true,null],["rowset_sha256","text",true,null],["source_declared_cutoff","timestamp without time zone",true,null],["row_count","integer",true,null],["operator_label","text",true,null],["loaded_at","timestamp with time zone",true,"clock_timestamp()"]]$columns$::jsonb,$constraints$[["school_certificate_source_rec_tenant_id_source_binding_id_s_key","UNIQUE (tenant_id, source_binding_id, source_batch_id)",true],["school_certificate_source_recovery_operator_label_check","CHECK ((((length(btrim(operator_label)) >= 5) AND (length(btrim(operator_label)) <= 160)) AND (operator_label !~ '[[:cntrl:]]'::text)))",true],["school_certificate_source_recovery_pkey","PRIMARY KEY (id)",true],["school_certificate_source_recovery_row_count_check","CHECK (((row_count >= 1) AND (row_count <= 5000)))",true],["school_certificate_source_recovery_rowset_sha256_check","CHECK ((rowset_sha256 ~ '^[a-f0-9]{64}$'::text))",true],["school_certificate_source_recovery_source_batch_id_fkey","FOREIGN KEY (source_batch_id) REFERENCES source_import_batch(id)",true],["school_certificate_source_recovery_source_binding_id_fkey","FOREIGN KEY (source_binding_id) REFERENCES platform_tenant_source_binding(id)",true],["school_certificate_source_recovery_source_import_run_id_fkey","FOREIGN KEY (source_import_run_id) REFERENCES data_import_runs(id)",true],["school_certificate_source_recovery_source_sha256_check","CHECK ((source_sha256 ~ '^[a-f0-9]{64}$'::text))",true],["school_certificate_source_recovery_tenant_id_fkey","FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id)",true]]$constraints$::jsonb)
 ) pin(name,columns_expected,constraints_expected) LOOP
  table_oid:=to_regclass('public.'||item.name);
  IF table_oid IS NULL THEN CONTINUE; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=table_oid AND c.relkind='r' AND c.relpersistence='p' AND c.relrowsecurity AND NOT c.relforcerowsecurity
    AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=table_oid)
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=table_oid AND a.grantee<>c.relowner)
   OR (SELECT count(*) FROM pg_trigger WHERE tgrelid=table_oid AND NOT tgisinternal)<>1
   OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=table_oid AND tgname=item.name||'_immutable' AND NOT tgisinternal AND tgenabled='O'
      AND tgtype=58 AND tgfoid=to_regprocedure('public.school_certificate_source_immutable_v4()'))
  THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_PREREQUISITE'; END IF;
  SELECT jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,replace(pg_get_expr(d.adbin,d.adrelid),'public.','public'||'.')) ORDER BY a.attnum)
   INTO columns_json FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=table_oid AND a.attnum>0 AND NOT a.attisdropped;
  -- PostgreSQL 18 also catalogs table NOT NULL constraints here. Their exact
  -- column semantics are already pinned by attnotnull above on both majors.
  SELECT jsonb_agg(jsonb_build_array(c.conname,replace(pg_get_constraintdef(c.oid),'public.','public'||'.'),c.convalidated) ORDER BY c.conname)
   INTO constraints_json FROM pg_constraint c WHERE c.conrelid=table_oid AND c.contype<>'n';
  IF columns_json IS DISTINCT FROM item.columns_expected OR constraints_json IS DISTINCT FROM item.constraints_expected
   OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid=table_oid AND contype='n' AND NOT convalidated)
   OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=table_oid AND attnum>0 AND (attisdropped OR attgenerated<>'' OR attidentity<>''))
  THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_PREREQUISITE'; END IF;
 END LOOP;
END $source_prerequisite$;

-- Historical GRH schooling dates. Original sources and manual 057/064/091 evidence remain unchanged.
CREATE TABLE IF NOT EXISTS school_certificate_source_recovery (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 source_binding_id uuid NOT NULL REFERENCES platform_tenant_source_binding(id),
 source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
 source_import_run_id bigint NOT NULL REFERENCES data_import_runs(id),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 rowset_sha256 text NOT NULL CHECK(rowset_sha256 ~ '^[a-f0-9]{64}$'),
 source_declared_cutoff timestamp NOT NULL,
 row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 5000),
 operator_label text NOT NULL CHECK(length(btrim(operator_label)) BETWEEN 5 AND 160 AND operator_label !~ '[[:cntrl:]]'),
 loaded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,source_batch_id)
);
CREATE TABLE IF NOT EXISTS school_certificate_source_date (
 recovery_id uuid NOT NULL REFERENCES school_certificate_source_recovery(id),
 family_id bigint NOT NULL CHECK(family_id>0),
 company_id bigint NOT NULL CHECK(company_id>0),
 legajo text NOT NULL CHECK(length(legajo) BETWEEN 1 AND 64),
 identity_sha256 text NOT NULL CHECK(identity_sha256 ~ '^[a-f0-9]{64}$'),
 source_fields jsonb NOT NULL CHECK(jsonb_typeof(source_fields)='object' AND source_fields-ARRAY['PRES_14','VENC_14']='{}'::jsonb),
 PRIMARY KEY(recovery_id,family_id)
);
ALTER TABLE school_certificate_source_recovery ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_certificate_source_date ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION school_certificate_source_immutable_v4() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS school_certificate_source_recovery_immutable ON school_certificate_source_recovery;
CREATE TRIGGER school_certificate_source_recovery_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON school_certificate_source_recovery
FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_source_immutable_v4();
DROP TRIGGER IF EXISTS school_certificate_source_date_immutable ON school_certificate_source_date;
CREATE TRIGGER school_certificate_source_date_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON school_certificate_source_date
FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_source_immutable_v4();

-- JSON array text is also produced by the extractor (UTF-8, no ASCII escaping,
-- comma+space separators). No name, document or date is matched approximately.
CREATE OR REPLACE FUNCTION school_certificate_source_identity_v4(f jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(digest(convert_to(jsonb_build_array(f->>'family_id',f->>'company_id',f->>'legajo',f->>'nombre',f->>'sexo',
  f->>'fecha_nacimiento',f->>'dni',f->>'cuil',f->>'vinculo_code',f->>'fecha_baja')::text,'UTF8'),'sha256'),'hex')
$$;

CREATE OR REPLACE FUNCTION school_certificate_source_field_v4(fields jsonb,key text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE raw text; parsed date;
BEGIN
 IF NOT fields ? key THEN RETURN jsonb_build_object('state','absent','date',NULL); END IF;
 IF fields->key='null'::jsonb THEN RETURN jsonb_build_object('state','null','date',NULL); END IF;
 raw:=fields->>key;
 IF jsonb_typeof(fields->key)='string' AND raw ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  BEGIN
   parsed:=raw::date;
   IF parsed BETWEEN DATE '1900-01-01' AND DATE '2100-12-31' AND to_char(parsed,'YYYY-MM-DD')=raw THEN
    RETURN jsonb_build_object('state','valid','date',raw);
   END IF;
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN NULL; END;
 END IF;
 RETURN jsonb_build_object('state','invalid','date',NULL);
END $$;

-- Owner-only maintenance facade. p_apply=false performs the same complete pairing
-- without writing. Operator_label records a technical recovery attribution, NOT
-- an application login/session or a municipal approval of schooling eligibility.
CREATE OR REPLACE FUNCTION school_certificate_source_import_v4(
 p_tenant uuid,p_binding uuid,p_batch uuid,p_payload jsonb,p_operator text,p_apply boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b source_import_batch%ROWTYPE; r data_import_runs%ROWTYPE; binding platform_tenant_source_binding%ROWTYPE;
 prior school_certificate_source_recovery%ROWTYPE; n integer; expected integer; matched integer; rowset text; new_id uuid;
BEGIN
 IF current_user IS DISTINCT FROM (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid='school_certificate_source_recovery'::regclass)
 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_OWNER_REQUIRED'; END IF;
 IF p_tenant IS NULL OR p_binding IS NULL OR p_batch IS NULL OR p_apply IS NULL OR p_operator IS NULL OR length(btrim(p_operator)) NOT BETWEEN 5 AND 160 OR p_operator<>btrim(p_operator) OR p_operator ~ '[[:cntrl:]]'
  OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR NOT p_payload ?& ARRAY['version','sourceSystem','sourceDatabase','sourceSha256','sourceDeclaredCutoff','rows']
  OR p_payload-ARRAY['version','sourceSystem','sourceDatabase','sourceSha256','sourceDeclaredCutoff','rows']<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(p_payload)='object' THEN p_payload-'rows' ELSE '{}'::jsonb END) v WHERE jsonb_typeof(v.value)<>'string')
  OR p_payload->>'version'<>'schooling-source-recovery.v1' OR p_payload->>'sourceSystem'<>'GRH'
  OR p_payload->>'sourceSha256' !~ '^[a-f0-9]{64}$' OR p_payload->>'sourceDeclaredCutoff' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$'
  OR jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_PAYLOAD_INVALID'; END IF;
 n:=jsonb_array_length(p_payload->'rows');
 IF n NOT BETWEEN 1 AND 5000 OR octet_length(p_payload::text)>2097152 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_PAYLOAD_INVALID'; END IF;
 IF p_apply THEN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_ISOLATION_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('schooling-source-recovery:'||p_tenant||':'||p_binding||':'||p_batch,0));
  LOCK TABLE platform_tenant,platform_tenant_source_binding,tenant_identity_policy,source_import_batch,data_import_runs,grh_family,grh_catalog_rows IN SHARE MODE;
 END IF;
 SELECT sb.* INTO binding FROM platform_tenant_source_binding sb JOIN tenant_identity_policy ip ON ip.tenant_id=sb.tenant_id AND ip.certified_source_binding_id=sb.id
 JOIN platform_tenant t ON t.id=sb.tenant_id AND t.status='active'
 WHERE sb.id=p_binding AND sb.tenant_id=p_tenant AND sb.source_system='GRH' AND sb.verified AND ip.tenant_data_plane_ready;
 SELECT * INTO b FROM source_import_batch WHERE id=p_batch;
 SELECT * INTO r FROM data_import_runs WHERE id=b.legacy_import_run_id;
 IF binding.id IS NULL OR b.id IS NULL OR r.id IS NULL OR b.source_system IS DISTINCT FROM 'GRH' OR b.validation_state IS DISTINCT FROM 'published' OR r.status IS DISTINCT FROM 'completed'
  OR b.source_database IS DISTINCT FROM binding.source_database OR (p_payload->>'sourceDatabase') IS DISTINCT FROM b.source_database
  OR lower(b.source_sha256) IS DISTINCT FROM (p_payload->>'sourceSha256') OR lower(r.source_sha256) IS DISTINCT FROM (p_payload->>'sourceSha256')
  OR b.source_cutoff IS DISTINCT FROM (r.source_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires')
  OR to_char(r.source_cutoff,'YYYY-MM-DD"T"HH24:MI:SS') IS DISTINCT FROM (p_payload->>'sourceDeclaredCutoff')
 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_MISMATCH'; END IF;
 -- The original catalog authority distinguishes HIJO id2 from PRENATAL code H.
 IF NOT (SELECT count(*)=1 AND coalesce(bool_and(label='HIJO' AND source_payload->>'code'='H' AND source_payload->>'name'='HIJO'),false)
  FROM grh_catalog_rows WHERE catalog='family_relationships' AND import_run_id=r.id AND source_payload#>>'{sourceKey,relationshipId}'='2')
 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_MAPPING_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'rows') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
  OR NOT x ?& ARRAY['familyId','companyId','legajo','identitySha256','sourceFields'] OR x-ARRAY['familyId','companyId','legajo','identitySha256','sourceFields']<>'{}'::jsonb
  OR jsonb_typeof(x->'familyId') IS DISTINCT FROM 'string' OR x->>'familyId' !~ '^[1-9][0-9]{0,17}$'
  OR jsonb_typeof(x->'companyId') IS DISTINCT FROM 'number' OR x->>'companyId' !~ '^[1-9][0-9]{0,8}$'
  OR jsonb_typeof(x->'legajo') IS DISTINCT FROM 'string' OR length(x->>'legajo') NOT BETWEEN 1 AND 64
  OR jsonb_typeof(x->'identitySha256') IS DISTINCT FROM 'string' OR x->>'identitySha256' !~ '^[a-f0-9]{64}$'
  OR jsonb_typeof(x->'sourceFields') IS DISTINCT FROM 'object' OR (x->'sourceFields')-ARRAY['PRES_14','VENC_14']<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(x->'sourceFields')='object' THEN x->'sourceFields' ELSE '{}'::jsonb END) v
   WHERE jsonb_typeof(v.value) NOT IN ('string','null') OR length(v.value#>>'{}')>80))
 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_PAYLOAD_INVALID'; END IF;
 IF (SELECT count(DISTINCT x->>'familyId') FROM jsonb_array_elements(p_payload->'rows') x)<>n THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_PAYLOAD_INVALID'; END IF;
 SELECT count(*) INTO expected FROM grh_family f WHERE f.import_run_id=r.id AND f.company_id=binding.source_company_id AND f.vinculo_code='2';
 SELECT count(*) INTO matched FROM jsonb_array_elements(p_payload->'rows') x JOIN grh_family f
  ON f.family_id=(x->>'familyId')::bigint AND f.company_id=(x->>'companyId')::bigint AND f.legajo=x->>'legajo'
  AND f.import_run_id=r.id AND f.company_id=binding.source_company_id AND f.vinculo_code='2'
  AND school_certificate_source_identity_v4(to_jsonb(f))=x->>'identitySha256';
 IF expected<>n OR matched<>n THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_IDENTITY_MISMATCH'; END IF;
 SELECT encode(digest(convert_to(jsonb_agg(x ORDER BY (x->>'familyId')::bigint)::text,'UTF8'),'sha256'),'hex') INTO rowset FROM jsonb_array_elements(p_payload->'rows') x;
 SELECT * INTO prior FROM school_certificate_source_recovery WHERE tenant_id=p_tenant AND source_binding_id=p_binding AND source_batch_id=p_batch;
 IF prior.id IS NOT NULL AND (prior.source_sha256<>p_payload->>'sourceSha256' OR prior.rowset_sha256<>rowset OR prior.row_count<>n
  OR (SELECT count(*) FROM school_certificate_source_date WHERE recovery_id=prior.id)<>n)
 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_CONFLICT'; END IF;
 IF p_apply AND prior.id IS NULL THEN
  INSERT INTO school_certificate_source_recovery(tenant_id,source_binding_id,source_batch_id,source_import_run_id,source_sha256,rowset_sha256,source_declared_cutoff,row_count,operator_label)
  VALUES(p_tenant,p_binding,p_batch,r.id,p_payload->>'sourceSha256',rowset,(p_payload->>'sourceDeclaredCutoff')::timestamp,n,p_operator) RETURNING id INTO new_id;
  INSERT INTO school_certificate_source_date(recovery_id,family_id,company_id,legajo,identity_sha256,source_fields)
  SELECT new_id,(x->>'familyId')::bigint,(x->>'companyId')::bigint,x->>'legajo',x->>'identitySha256',x->'sourceFields' FROM jsonb_array_elements(p_payload->'rows') x;
 END IF;
 RETURN jsonb_build_object('version','schooling-source-import.v1','applied',p_apply,'replayed',prior.id IS NOT NULL,'rows',n,'matched',matched,
  'sourceSha256',p_payload->>'sourceSha256','rowsetSha256',rowset,'originalRowsModified',0,'manualRecordsCreated',0,'payrollModified',false);
END $$;

CREATE OR REPLACE FUNCTION school_certificate_read_v4(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_contract_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; base jsonb; items jsonb; source jsonb; item jsonb; effective jsonb; rec record;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 -- v3 and the added source projection must describe the same source identity.
 -- Fail briefly when an import is in progress instead of combining two cuts.
 LOCK TABLE platform_tenant_source_binding,tenant_identity_policy,source_import_batch,employment_contract,person_identity,
  employment_status_snapshot,grh_family,grh_catalog_rows,employee_family_member,school_certificate_source_recovery,school_certificate_source_date IN SHARE MODE NOWAIT;
 base:=school_certificate_read_v3(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_contract_id);
 items:='[]'::jsonb;
 FOR item IN SELECT value FROM jsonb_array_elements(base->'rows') LOOP
  source:=NULL;
  IF item#>>'{familyRef,kind}'='grh' THEN
   SELECT h.*,d.source_fields,b.source_cutoff,f.family_id INTO rec
   FROM school_certificate_source_recovery h JOIN school_certificate_source_date d ON d.recovery_id=h.id
   JOIN source_import_batch b ON b.id=h.source_batch_id AND b.validation_state='published' AND lower(b.source_sha256)=h.source_sha256 AND b.legacy_import_run_id=h.source_import_run_id
    AND b.source_cutoff=(h.source_declared_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires')
   JOIN employment_contract c ON c.id=(item->>'contractId')::uuid AND c.source_batch_id=b.id AND c.source_system='GRH'
   JOIN grh_family f ON f.family_id=d.family_id AND f.company_id=d.company_id AND f.legajo=d.legajo AND f.import_run_id=h.source_import_run_id
    AND f.company_id=c.legacy_company_id AND f.legajo=c.legacy_legajo AND f.vinculo_code='2' AND school_certificate_source_identity_v4(to_jsonb(f))=d.identity_sha256
   WHERE h.tenant_id=p_tenant AND h.source_binding_id=(ctx->>'sourceBindingId')::uuid AND d.family_id=(item#>>'{familyRef,id}')::bigint;
   IF FOUND THEN
    source:=jsonb_build_object('presentedOn',school_certificate_source_field_v4(rec.source_fields,'PRES_14')->'date','expiresOn',school_certificate_source_field_v4(rec.source_fields,'VENC_14')->'date',
     'presentationState',school_certificate_source_field_v4(rec.source_fields,'PRES_14')->>'state','expiryState',school_certificate_source_field_v4(rec.source_fields,'VENC_14')->>'state',
     'sourceSystem','GRH','sourceTable','familia','sourceKey',rec.family_id::text,'sourceSha256',rec.source_sha256,'sourceImportRunId',rec.source_import_run_id,
     'sourceBatchId',rec.source_batch_id,'sourceCutoff',rec.source_cutoff,'sourceDeclaredCutoff',to_char(rec.source_declared_cutoff,'YYYY-MM-DD"T"HH24:MI:SS'),
     'loadedAt',rec.loaded_at,'reviewState','historical_unreviewed','documentAvailable',false);
   END IF;
  END IF;
  effective:=CASE WHEN item->'certificate'<>'null'::jsonb THEN jsonb_build_object('origin','manual','presentedOn',item#>'{certificate,presentedOn}','expiresOn',item#>'{certificate,expiresOn}')
   WHEN source IS NOT NULL THEN jsonb_build_object('origin','grh_source','presentedOn',source->'presentedOn','expiresOn',source->'expiresOn')
   ELSE jsonb_build_object('origin','none','presentedOn',NULL,'expiresOn',NULL) END;
  items:=items||jsonb_build_array(item||jsonb_build_object('sourceSchooling',source,'effectiveDates',effective));
 END LOOP;
 RETURN base||jsonb_build_object('version','family-schooling.v4','rows',items);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF; RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE'; END $$;

REVOKE ALL ON school_certificate_source_recovery,school_certificate_source_date FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION school_certificate_source_immutable_v4(),school_certificate_source_identity_v4(jsonb),school_certificate_source_field_v4(jsonb,text),
 school_certificate_source_import_v4(uuid,uuid,uuid,jsonb,text,boolean),school_certificate_read_v4(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION school_certificate_read_v4(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;
