-- Schooling evidence owned by MuniControl. Additive; no GRH or payroll writes.
-- No FK to grh_family: the staging table is replaced by TRUNCATE on refresh.
CREATE TABLE IF NOT EXISTS school_certificate_blob (
 tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
 content bytea NOT NULL,
 byte_length integer NOT NULL CHECK (byte_length BETWEEN 10 AND 2097152),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (tenant_id,sha256),
 CHECK (octet_length(content)=byte_length),
 CHECK (encode(digest(content,'sha256'),'hex')=sha256),
 CHECK (substring(content FROM 1 FOR 5)=decode('255044462d','hex'))
);
CREATE TABLE IF NOT EXISTS school_certificate (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES platform_tenant(id), source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES employment_contract(id),
 person_id uuid NOT NULL REFERENCES person_identity(id),
 source_batch_id uuid NOT NULL REFERENCES source_import_batch(id),
 source_database text NOT NULL, company_id bigint NOT NULL, source_legajo text NOT NULL,
 family_id text NOT NULL CHECK (family_id ~ '^[0-9]{1,20}$'),
 identity_token text NOT NULL CHECK (identity_token ~ '^[a-f0-9]{64}$'),
 identity_snapshot jsonb NOT NULL CHECK (jsonb_typeof(identity_snapshot)='object'),
 source_cutoff timestamptz NOT NULL,
 filename text NOT NULL CHECK (length(filename) BETWEEN 5 AND 180 AND filename=btrim(filename)
  AND lower(right(filename,4))='.pdf' AND filename !~ '[[:cntrl:]/\\:*?"<>|]'),
 blob_sha256 text NOT NULL,
 presented_on date NOT NULL CHECK (presented_on BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 expires_on date CHECK (expires_on BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 recorded_by_membership_id uuid NOT NULL,
 recorded_by_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128 AND idempotency_key ~ '^[A-Za-z0-9._:-]+$'),
 request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (tenant_id,id),
 UNIQUE (tenant_id,source_binding_id,recorded_by_membership_id,idempotency_key),
 FOREIGN KEY (tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY (recorded_by_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id),
 FOREIGN KEY (tenant_id,blob_sha256) REFERENCES school_certificate_blob(tenant_id,sha256)
);
CREATE INDEX IF NOT EXISTS school_certificate_identity_idx
 ON school_certificate(tenant_id,source_binding_id,contract_id,family_id,identity_token,recorded_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS school_certificate_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 source_binding_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 certificate_id uuid, operation text NOT NULL CHECK (operation IN ('read','register','replay','download')),
 result_count integer NOT NULL CHECK (result_count BETWEEN 0 AND 5000),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY (actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id),
 FOREIGN KEY (tenant_id,certificate_id) REFERENCES school_certificate(tenant_id,id)
);
-- Initial, explicitly bounded database pilot. Configuration is owner-only;
-- no request parameter or custom session GUC controls any capacity limit.
CREATE TABLE IF NOT EXISTS school_certificate_storage_policy (
 singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
 pdf_quota_bytes bigint NOT NULL DEFAULT 8388608 CHECK (pdf_quota_bytes BETWEEN 0 AND 8388608),
 cluster_limit_bytes bigint NOT NULL DEFAULT 536870912 CHECK (cluster_limit_bytes BETWEEN 16777216 AND 1099511627776),
 cluster_reserve_bytes bigint NOT NULL DEFAULT 16777216 CHECK (cluster_reserve_bytes>=16777216 AND cluster_reserve_bytes<cluster_limit_bytes),
 generation bigint NOT NULL DEFAULT 0 CHECK (generation>=0)
);
INSERT INTO school_certificate_storage_policy(singleton) VALUES(true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION school_certificate_storage_capacity_v1() RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE policy school_certificate_storage_policy%ROWTYPE; server_setting record; used_bytes bigint; cluster_bytes bigint;
 effective_limit bigint; server_limit bigint; remaining_bytes bigint:=0; configuration_ok boolean:=true;
BEGIN
 SELECT coalesce(sum(byte_length),0)::bigint INTO used_bytes FROM school_certificate_blob;
 SELECT * INTO policy FROM school_certificate_storage_policy WHERE singleton;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('mode','database_pilot','usedBytes',used_bytes,'capacityBytes',0,'remainingBytes',0,'available',false);
 END IF;
 effective_limit:=policy.cluster_limit_bytes;
 -- pg_settings metadata identifies a real server setting. A made-up custom GUC
 -- never appears here. Only protected contexts/sources can tighten the policy.
 SELECT setting,unit,context,source INTO server_setting FROM pg_settings WHERE name='neon.max_cluster_size';
 IF FOUND THEN
  IF server_setting.context NOT IN ('internal','postmaster','sighup','superuser','superuser-backend')
   OR server_setting.source NOT IN ('default','configuration file','command line','override','environment variable')
   OR has_parameter_privilege('municontrol_actions_runtime_app','neon.max_cluster_size','SET') THEN
   configuration_ok:=false;
  ELSE
   BEGIN
    server_limit:=pg_size_bytes(server_setting.setting||coalesce(nullif(server_setting.unit,''),''));
    IF server_limit<=0 THEN configuration_ok:=false; ELSE effective_limit:=least(effective_limit,server_limit); END IF;
   EXCEPTION WHEN OTHERS THEN configuration_ok:=false; END;
  END IF;
 END IF;
 -- Includes every database in this cluster, not just the application database.
 BEGIN SELECT coalesce(sum(pg_database_size(oid)),0)::bigint INTO cluster_bytes FROM pg_database;
 EXCEPTION WHEN OTHERS THEN configuration_ok:=false; END;
 IF configuration_ok AND cluster_bytes IS NOT NULL THEN
  remaining_bytes:=greatest(0,least(policy.pdf_quota_bytes-used_bytes,
   (effective_limit-policy.cluster_reserve_bytes-cluster_bytes-16384)/2));
 END IF;
 RETURN jsonb_build_object('mode','database_pilot','usedBytes',used_bytes,'capacityBytes',policy.pdf_quota_bytes,
  'remainingBytes',remaining_bytes,'available',configuration_ok,'clusterBytes',cluster_bytes,
  'clusterLimitBytes',effective_limit,'clusterReserveBytes',policy.cluster_reserve_bytes);
END $$;

CREATE OR REPLACE FUNCTION school_certificate_storage_reserve_v1(p_tenant uuid,p_sha256 text,p_byte_length integer) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE capacity jsonb; new_bytes bigint;
BEGIN
 IF p_tenant IS NULL OR p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR p_byte_length NOT BETWEEN 10 AND 2097152
  OR p_byte_length IS NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('school-certificate:storage:v1',0));
 -- A write conflict also rejects stale REPEATABLE READ snapshots. A lock alone
 -- would serialize callers without refreshing their old view of blob usage.
 UPDATE school_certificate_storage_policy SET generation=generation+1 WHERE singleton;
 IF NOT FOUND THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_STORAGE_FULL'; END IF;
 capacity:=school_certificate_storage_capacity_v1();
 SELECT CASE WHEN EXISTS(SELECT 1 FROM school_certificate_blob WHERE tenant_id=p_tenant AND sha256=p_sha256)
  THEN 0 ELSE p_byte_length END INTO new_bytes;
 IF capacity->>'available' IS DISTINCT FROM 'true' OR (capacity->>'capacityBytes')::bigint=0
  OR (capacity->>'usedBytes')::bigint+new_bytes>(capacity->>'capacityBytes')::bigint
  OR (capacity->>'clusterBytes')::bigint+new_bytes*2+16384>
   (capacity->>'clusterLimitBytes')::bigint-(capacity->>'clusterReserveBytes')::bigint THEN
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_STORAGE_FULL';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION school_certificate_reject_change_v1() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IMMUTABLE'; END $$;
DO $$ DECLARE item text; BEGIN
 FOREACH item IN ARRAY ARRAY['school_certificate_blob','school_certificate','school_certificate_event'] LOOP
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=item||'_immutable') THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION school_certificate_reject_change_v1()',item||'_immutable',item);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=item||'_no_truncate') THEN
   EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION school_certificate_reject_change_v1()',item||'_no_truncate',item);
  END IF;
 END LOOP;
END $$;

-- Internal helper. Only the three session-bound facades below are executable by runtime.
CREATE OR REPLACE FUNCTION school_certificate_context_v1(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,
 p_write boolean DEFAULT false,p_key text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'workforce.employee.read')
  OR (p_write AND NOT action_center_context_has_capability(ctx,'employee.record.propose')) THEN
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED';
 END IF;
 IF p_write THEN
  -- Evidence preparation uses the read authority (including SoD), not payroll approval.
  -- Identity/session/policy/binding are locked by that assertion. Serialize retries
  -- by tenant, binding, membership and key without requiring the operator's legajo.
  PERFORM pg_advisory_xact_lock(hashtextextended('school-certificate:'||p_tenant::text||':'||
   (ctx->>'sourceBindingId')||':'||p_membership::text||':'||p_key,0));
 END IF;
 RETURN ctx;
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
 CASE SQLERRM
  WHEN 'ACTION_RELEASE_NOT_CERTIFIED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_RELEASE_NOT_CERTIFIED';
  WHEN 'ACTION_SOURCE_BINDING_REQUIRED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_BINDING_REQUIRED';
  WHEN 'ACTION_SESSION_BUSY' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
  WHEN 'ACTION_TENANT_AUTHORITY_REQUIRED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED';
  ELSE RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_INVALID';
 END CASE;
END $$;

CREATE OR REPLACE FUNCTION school_certificate_assert_mapping_v1(p_valid boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SOURCE_MAPPING_DRIFT'; END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION school_certificate_assert_contract_v1(p_found boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_found IS DISTINCT FROM true THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 RETURN true;
END $$;

-- One statement/snapshot resolves contract, published source batch, family and latest status.
-- The identity excludes the import ID/cutoff, so a refresh of the same people preserves evidence.
CREATE OR REPLACE FUNCTION school_certificate_current_family_v1(p_ctx jsonb,p_contract_id uuid DEFAULT NULL)
RETURNS TABLE(contract_id uuid,person_id uuid,source_batch_id uuid,legajo text,employee_name text,
 family_id text,family_name text,birth_date date,family_end_date date,identity_token text,
 identity_snapshot jsonb,source_cutoff timestamptz,administrative_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH contracts AS MATERIALIZED (
  SELECT c.*,b.source_cutoff,b.source_database,b.legacy_import_run_id FROM employment_contract c
  JOIN source_import_batch b ON b.id=c.source_batch_id AND b.source_system='GRH'
   AND b.source_database=p_ctx->>'sourceDatabase' AND b.validation_state='published'
   AND b.legacy_import_run_id IS NOT NULL
  WHERE c.source_system='GRH' AND c.legacy_company_id=(p_ctx->>'sourceCompanyId')::bigint
   AND (p_contract_id IS NULL OR c.id=p_contract_id)
 ), mapping AS MATERIALIZED (
  SELECT b.legacy_import_run_id,(SELECT count(*)=1 AND bool_and(coalesce(k.label='HIJO' AND k.source_payload->>'code'='H'
   AND k.source_payload->>'name'='HIJO' AND k.source_key ~ '^[[:space:]]*[{][[:space:]]*"relationshipId"[[:space:]]*:[[:space:]]*"2"[[:space:]]*[}][[:space:]]*$',false))
   FROM grh_catalog_rows k WHERE k.catalog='family_relationships' AND k.import_run_id=b.legacy_import_run_id
    AND k.source_payload #>> '{sourceKey,relationshipId}'='2') valid
  FROM (SELECT DISTINCT c.legacy_import_run_id FROM contracts c) b
 ), source_rows AS MATERIALIZED (
  SELECT c.id contract_id,c.person_id,c.source_batch_id,c.legacy_legajo::text legajo,
   pi.full_name::text employee_name,f.family_id::text family_id,f.nombre family_name,
   f.fecha_nacimiento birth_date,f.fecha_baja family_end_date,c.source_cutoff,
   coalesce(c.status='active' AND s.source_batch_id=c.source_batch_id
    AND s.administrative_status IN ('active','suspended','leave_without_pay','pending_termination'),false) administrative_active,
   jsonb_build_object('contractId',c.id,'personId',c.person_id,'sourceDatabase',c.source_database,
    'companyId',f.company_id,'legajo',f.legajo,'familyId',f.family_id::text,'familyName',f.nombre,
    'birthDate',f.fecha_nacimiento,'dni',f.dni,'cuil',f.cuil) identity_snapshot
  FROM contracts c
  JOIN person_identity pi ON pi.id=c.person_id
  JOIN grh_family f ON f.company_id=c.legacy_company_id AND f.legajo=c.legacy_legajo
   AND f.import_run_id=c.legacy_import_run_id AND f.vinculo_code='2'
  LEFT JOIN LATERAL (
   SELECT es.source_batch_id,es.administrative_status FROM employment_status_snapshot es
   WHERE es.employment_contract_id=c.id AND es.source_system='GRH' AND es.source_batch_id=c.source_batch_id
   ORDER BY es.snapshot_date DESC,es.recorded_at DESC LIMIT 1
  ) s ON true
 )
 SELECT r.contract_id,r.person_id,r.source_batch_id,r.legajo,r.employee_name,r.family_id,r.family_name,
  r.birth_date,r.family_end_date,encode(digest(convert_to(r.identity_snapshot::text,'UTF8'),'sha256'),'hex'),
  r.identity_snapshot,r.source_cutoff,r.administrative_active
 FROM source_rows r WHERE p_contract_id IS NOT NULL OR r.administrative_active
 -- This empty arm checks mapping even when a contract has no family rows.
 UNION ALL SELECT NULL::uuid,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,
  NULL::date,NULL::date,NULL::text,NULL::jsonb,NULL::timestamptz,NULL::boolean
 WHERE NOT school_certificate_assert_mapping_v1((SELECT coalesce(bool_and(valid),true) FROM mapping))
 UNION ALL SELECT NULL::uuid,NULL::uuid,NULL::uuid,NULL::text,NULL::text,NULL::text,NULL::text,
  NULL::date,NULL::date,NULL::text,NULL::jsonb,NULL::timestamptz,NULL::boolean
 WHERE NOT school_certificate_assert_contract_v1(p_contract_id IS NULL OR EXISTS(SELECT 1 FROM contracts))
$$;

CREATE OR REPLACE FUNCTION school_certificate_read_v1(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_contract_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; rows_json jsonb; row_count integer; cutoff_from timestamptz; cutoff_to timestamptz; can_register boolean; storage jsonb;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 storage:=school_certificate_storage_capacity_v1();
 can_register:=action_center_context_has_capability(ctx,'employee.record.propose')
  AND storage->>'available'='true' AND (storage->>'remainingBytes')::bigint>=10;
 -- A 5001st row is only an overflow sentinel; it always raises, never succeeds truncated.
 WITH family AS MATERIALIZED (SELECT * FROM school_certificate_current_family_v1(ctx,p_contract_id) LIMIT 5001),
 decorated AS MATERIALIZED (
  SELECT f.*,h.certificate,h.history_count FROM family f
  LEFT JOIN LATERAL (
   SELECT count(*)::integer history_count,(jsonb_agg(jsonb_build_object(
    'id',d.id,'filename',d.filename,'sha256',d.blob_sha256,'byteLength',b.byte_length,
    'presentedOn',to_char(d.presented_on,'YYYY-MM-DD'),'expiresOn',to_char(d.expires_on,'YYYY-MM-DD'),
    'recordedAt',d.recorded_at) ORDER BY d.recorded_at DESC,d.id DESC))->0 certificate
   FROM school_certificate d JOIN school_certificate_blob b ON b.tenant_id=d.tenant_id AND b.sha256=d.blob_sha256
   WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
    AND d.contract_id=f.contract_id AND d.person_id=f.person_id AND d.family_id=f.family_id
    AND d.identity_token=f.identity_token
  ) h ON true
 )
 SELECT count(*)::integer,min(d.source_cutoff),max(d.source_cutoff),coalesce(jsonb_agg(jsonb_build_object(
  'contractId',d.contract_id,'legajo',d.legajo,'employeeName',d.employee_name,'familyId',d.family_id,
  'familyName',d.family_name,'birthDate',to_char(d.birth_date,'YYYY-MM-DD'),'familyEndDate',to_char(d.family_end_date,'YYYY-MM-DD'),
  'identityToken',d.identity_token,'sourceCutoff',d.source_cutoff,'administrativeActive',d.administrative_active,
  'certificate',d.certificate,'historyCount',d.history_count) ORDER BY length(d.legajo),d.legajo,d.family_id),'[]'::jsonb)
 INTO row_count,cutoff_from,cutoff_to,rows_json FROM decorated d;
 IF row_count>5000 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_ROW_LIMIT'; END IF;
 INSERT INTO school_certificate_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,'read',row_count);
 RETURN jsonb_build_object('version','family-schooling.v1','rows',rows_json,'canRegister',can_register,
  'storage',jsonb_build_object('mode',storage->>'mode','remainingBytes',(storage->>'remainingBytes')::bigint,
   'usedBytes',(storage->>'usedBytes')::bigint,'capacityBytes',(storage->>'capacityBytes')::bigint),
  'scope',jsonb_build_object('cohort',CASE WHEN p_contract_id IS NULL THEN 'administrative_active_with_children' ELSE 'contract_children' END,
   'sourceCutoffFrom',cutoff_from,'sourceCutoffTo',cutoff_to,'currentCensusCertified',false,'payrollEligibilityCertified',false));
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
 RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION school_certificate_register_v1(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,
 p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; current_family record; old_certificate school_certificate%ROWTYPE; new_id uuid;
 contract_value uuid; content_value bytea; presented_value date; expires_value date; request_hash text; item text;
BEGIN
 IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 128
  OR p_idempotency_key !~ '^[A-Za-z0-9._:-]+$' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,true,p_idempotency_key);
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR NOT p_payload ?& ARRAY['contractId','familyId','identityToken','filename','contentBase64','sha256','presentedOn','expiresOn']
  OR p_payload-ARRAY['contractId','familyId','identityToken','filename','contentBase64','sha256','presentedOn','expiresOn']<>'{}'::jsonb THEN
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD';
 END IF;
 FOREACH item IN ARRAY ARRAY['contractId','familyId','identityToken','filename','contentBase64','sha256','presentedOn'] LOOP
  IF jsonb_typeof(p_payload->item) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 END LOOP;
 IF jsonb_typeof(p_payload->'expiresOn') NOT IN ('string','null') OR p_payload->>'contractId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR p_payload->>'familyId' !~ '^[0-9]{1,20}$' OR p_payload->>'identityToken' !~ '^[a-f0-9]{64}$'
  OR p_payload->>'sha256' !~ '^[a-f0-9]{64}$' OR length(p_payload->>'filename') NOT BETWEEN 5 AND 180
  OR p_payload->>'filename'<>btrim(p_payload->>'filename') OR lower(right(p_payload->>'filename',4))<>'.pdf'
  OR p_payload->>'filename' ~ '[[:cntrl:]/\\:*?"<>|]' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 contract_value:=(p_payload->>'contractId')::uuid;
 IF length(p_payload->>'contentBase64')>2796204 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_TOO_LARGE'; END IF;
 BEGIN
  content_value:=decode(p_payload->>'contentBase64','base64');
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_PDF_INVALID'; END;
 IF octet_length(content_value)>2097152 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_TOO_LARGE'; END IF;
 IF octet_length(content_value)<10 OR substring(content_value FROM 1 FOR 5)<>decode('255044462d','hex')
  OR replace(encode(content_value,'base64'),E'\n','')<>p_payload->>'contentBase64'
  OR encode(digest(content_value,'sha256'),'hex')<>p_payload->>'sha256' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_PDF_INVALID'; END IF;
 BEGIN
  IF p_payload->>'presentedOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   OR (p_payload->>'expiresOn' IS NOT NULL AND p_payload->>'expiresOn' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN RAISE EXCEPTION 'invalid'; END IF;
  presented_value:=(p_payload->>'presentedOn')::date; expires_value:=(p_payload->>'expiresOn')::date;
  IF presented_value NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31' OR to_char(presented_value,'YYYY-MM-DD')<>p_payload->>'presentedOn'
   OR (expires_value IS NOT NULL AND (expires_value NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31' OR to_char(expires_value,'YYYY-MM-DD')<>p_payload->>'expiresOn')) THEN RAISE EXCEPTION 'invalid'; END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_DATES_INVALID'; END;
 request_hash:=encode(digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO old_certificate FROM school_certificate d WHERE d.tenant_id=p_tenant
  AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid AND d.recorded_by_membership_id=p_membership AND d.idempotency_key=p_idempotency_key;
 IF FOUND AND old_certificate.request_sha256<>request_hash THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDEMPOTENCY_REUSE'; END IF;
 -- Hold source identity until commit; a refresh/reassignment cannot race persistence.
 LOCK TABLE grh_family IN ACCESS SHARE MODE NOWAIT;
 LOCK TABLE grh_catalog_rows IN ACCESS SHARE MODE NOWAIT;
 -- Filter scope before taking any row lock, including rejected target IDs.
 PERFORM 1 FROM employment_contract c JOIN source_import_batch b ON b.id=c.source_batch_id
  WHERE c.id=contract_value AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase'
   AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL FOR SHARE OF c NOWAIT;
 PERFORM 1 FROM source_import_batch b JOIN employment_contract c ON c.source_batch_id=b.id
  WHERE c.id=contract_value AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase'
   AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL FOR SHARE OF b NOWAIT;
 PERFORM 1 FROM grh_catalog_rows k JOIN source_import_batch b ON b.legacy_import_run_id=k.import_run_id
  JOIN employment_contract c ON c.source_batch_id=b.id WHERE c.id=contract_value AND k.catalog='family_relationships'
  AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
  AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published'
  AND k.source_payload #>> '{sourceKey,relationshipId}'='2' FOR SHARE OF k NOWAIT;
 PERFORM 1 FROM grh_family f JOIN employment_contract c ON c.legacy_company_id=f.company_id AND c.legacy_legajo=f.legajo
  JOIN source_import_batch b ON b.id=c.source_batch_id AND b.legacy_import_run_id=f.import_run_id
  WHERE c.id=contract_value AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published'
   AND f.vinculo_code='2' AND f.family_id::text=p_payload->>'familyId' FOR SHARE OF f NOWAIT;
 SELECT * INTO current_family FROM school_certificate_current_family_v1(ctx,contract_value) f WHERE f.family_id=p_payload->>'familyId';
 IF NOT FOUND THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 IF current_family.identity_token<>p_payload->>'identityToken' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED'; END IF;
 IF old_certificate.id IS NOT NULL THEN
  INSERT INTO school_certificate_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,certificate_id,operation,result_count)
  VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,old_certificate.id,'replay',1);
  RETURN jsonb_build_object('version','family-schooling-register.v1','certificateId',old_certificate.id,'duplicate',true);
 END IF;
 PERFORM school_certificate_storage_reserve_v1(p_tenant,p_payload->>'sha256',octet_length(content_value));
 INSERT INTO school_certificate_blob(tenant_id,sha256,content,byte_length)
 VALUES(p_tenant,p_payload->>'sha256',content_value,octet_length(content_value)) ON CONFLICT DO NOTHING;
 INSERT INTO school_certificate(tenant_id,source_binding_id,contract_id,person_id,source_batch_id,source_database,company_id,source_legajo,
  family_id,identity_token,identity_snapshot,source_cutoff,filename,blob_sha256,presented_on,expires_on,
  recorded_by_membership_id,recorded_by_session_id,idempotency_key,request_sha256)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,current_family.contract_id,current_family.person_id,current_family.source_batch_id,
  ctx->>'sourceDatabase',(ctx->>'sourceCompanyId')::bigint,current_family.legajo,current_family.family_id,current_family.identity_token,
  current_family.identity_snapshot,current_family.source_cutoff,p_payload->>'filename',p_payload->>'sha256',presented_value,expires_value,
  p_membership,p_session,p_idempotency_key,request_hash) RETURNING id INTO new_id;
 INSERT INTO school_certificate_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,certificate_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,new_id,'register',1);
 RETURN jsonb_build_object('version','family-schooling-register.v1','certificateId',new_id,'duplicate',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION school_certificate_download_v1(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_certificate_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; result_value jsonb;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 SELECT jsonb_build_object('version','family-schooling-download.v1','filename',d.filename,
  'contentBase64',replace(encode(b.content,'base64'),E'\n',''),'sha256',b.sha256,'byteLength',b.byte_length)
 INTO result_value FROM school_certificate d
 JOIN school_certificate_blob b ON b.tenant_id=d.tenant_id AND b.sha256=d.blob_sha256
 CROSS JOIN LATERAL school_certificate_current_family_v1(ctx,d.contract_id) f
 WHERE d.id=p_certificate_id AND d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND f.contract_id=d.contract_id AND f.person_id=d.person_id AND f.family_id=d.family_id AND f.identity_token=d.identity_token;
 IF result_value IS NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 INSERT INTO school_certificate_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,certificate_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,p_certificate_id,'download',1);
 RETURN result_value;
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
 RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE';
END $$;

REVOKE ALL ON school_certificate_blob,school_certificate,school_certificate_event,school_certificate_storage_policy FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION school_certificate_reject_change_v1(),
 school_certificate_storage_capacity_v1(),school_certificate_storage_reserve_v1(uuid,text,integer),
 school_certificate_assert_mapping_v1(boolean),
 school_certificate_assert_contract_v1(boolean),
 school_certificate_context_v1(text,uuid,integer,text,uuid,uuid,boolean,text),
 school_certificate_current_family_v1(jsonb,uuid),
 school_certificate_read_v1(text,uuid,integer,text,uuid,uuid,uuid),
 school_certificate_register_v1(text,uuid,integer,text,uuid,uuid,jsonb,text),
 school_certificate_download_v1(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION school_certificate_read_v1(text,uuid,integer,text,uuid,uuid,uuid),
 school_certificate_register_v1(text,uuid,integer,text,uuid,uuid,jsonb,text),
 school_certificate_download_v1(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;
