-- Clock source store v1. Run this entire file in ONE caller-owned transaction.
-- Only a new, dedicated municontrol_clocks / clock_source_qa database is eligible.
-- No core migrations, employees, IAM, payroll, or device configuration are copied.
-- A receipt acknowledges durable source bytes after transaction COMMIT only.
-- It does not establish attendance, identity, payroll eligibility or legal acceptance.

DO $guard$
DECLARE existing_version text;
BEGIN
 IF current_database() NOT IN ('municontrol_clocks','clock_source_qa')
 OR current_setting('server_version_num')::integer / 10000 NOT IN (17,18) THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_INSTALLATION_DENIED';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('clock-source:installation:v1',0));
 -- Empty means no application objects, even under a different schema. Extension
 -- objects are allowed; pgcrypto must live in public for the pinned digest calls.
 IF EXISTS (
  SELECT 1 FROM pg_namespace n WHERE n.nspname NOT IN ('public','clock_source','information_schema')
   AND n.nspname !~ '^pg_' AND NOT EXISTS (
    SELECT 1 FROM pg_depend d WHERE d.classid='pg_namespace'::regclass AND d.objid=n.oid AND d.deptype='e'))
 OR EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname NOT IN ('clock_source','information_schema') AND n.nspname !~ '^pg_'
   AND c.relkind IN ('r','p','v','m','S','f','c') AND NOT EXISTS (
    SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e'))
 OR EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname NOT IN ('clock_source','information_schema') AND n.nspname !~ '^pg_'
   AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'))
 OR EXISTS (
  SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
  WHERE n.nspname NOT IN ('clock_source','information_schema') AND n.nspname !~ '^pg_'
   AND t.typtype IN ('d','e','r','m') AND NOT EXISTS (
    SELECT 1 FROM pg_depend d WHERE d.classid='pg_type'::regclass AND d.objid=t.oid AND d.deptype='e')) THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_INSTALLATION_DENIED';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
           WHERE e.extname='pgcrypto' AND n.nspname<>'public') THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_INSTALLATION_DENIED';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='clock_source') THEN
  IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='clock_source' AND nspowner=current_user::regrole)
  OR to_regclass('clock_source.installation') IS NULL THEN
   RAISE EXCEPTION 'CLOCK_SOURCE_INSTALLATION_DENIED';
  END IF;
  EXECUTE 'SELECT version FROM clock_source.installation WHERE singleton' INTO existing_version;
  IF existing_version IS DISTINCT FROM 'clock-source-store.v1'
  OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='clock_source' AND c.relkind IN ('r','p','v','m','S','f'))<>5
  OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='clock_source' AND c.relkind IN ('r','p','v','m','S','f')
       AND (c.relname NOT IN ('installation','enrollment','batch','part','completion') OR c.relowner<>current_user::regrole))
  OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='clock_source')<>4
  OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='clock_source'
       AND (p.proname NOT IN ('reject_mutation_v1','enrollment_guard_v1','installation_guard_v1','receive_v1') OR p.proowner<>current_user::regrole)) THEN
   RAISE EXCEPTION 'CLOCK_SOURCE_INSTALLATION_DENIED';
  END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clocks_source_runtime') THEN
  CREATE ROLE clocks_source_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 -- PG17/18 may automatically give a non-superuser creator ADMIN ONLY. That
 -- exact owner grant is harmless; no login/other role may inherit or SET this
 -- runtime role at this foundation stage, nor may runtime inherit another role.
 IF current_user='clocks_source_runtime'
 OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clocks_source_runtime'
           AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))
 OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member='clocks_source_runtime'::regrole
           OR (roleid='clocks_source_runtime'::regrole AND NOT (
               member=current_user::regrole AND admin_option AND NOT inherit_option AND NOT set_option))) THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_INSTALLATION_DENIED';
 END IF;
END $guard$;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE SCHEMA IF NOT EXISTS clock_source;
REVOKE ALL ON SCHEMA clock_source FROM PUBLIC,clocks_source_runtime;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
-- A per-schema REVOKE cannot cancel PostgreSQL's global default PUBLIC execute.
-- This dedicated database has no other application functions or shared modules.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE IF NOT EXISTS clock_source.installation (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 version text NOT NULL CHECK(version='clock-source-store.v1'),
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 max_database_bytes bigint NOT NULL DEFAULT 419430400 CHECK(max_database_bytes BETWEEN 1048576 AND 419430400)
);
-- Technical metadata only; no municipal tenants, devices or credentials are seeded.
INSERT INTO clock_source.installation(singleton,version) VALUES(true,'clock-source-store.v1') ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS clock_source.enrollment (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL CHECK(tenant_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 connector_key text NOT NULL UNIQUE CHECK(connector_key ~ '^[a-z0-9][a-z0-9._-]{7,127}$'),
 serial text NOT NULL CHECK(serial ~ '^[A-Za-z0-9-]{6,64}$'),
 token_sha256 text NOT NULL UNIQUE CHECK(token_sha256 ~ '^[a-f0-9]{64}$'),
 enabled boolean NOT NULL DEFAULT false,
 enrolled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(id,tenant_id,serial)
);
CREATE UNIQUE INDEX IF NOT EXISTS clock_source_enrollment_serial_uq ON clock_source.enrollment(tenant_id,lower(serial));

CREATE TABLE IF NOT EXISTS clock_source.batch (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 enrollment_id uuid NOT NULL,
 tenant_id uuid NOT NULL,
 serial text NOT NULL,
 batch_key text NOT NULL CHECK(batch_key ~ '^[a-f0-9]{64}$'),
 manifest_sha256 text NOT NULL CHECK(manifest_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 records_sha256 text NOT NULL CHECK(records_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot_record_count integer NOT NULL CHECK(snapshot_record_count BETWEEN 1 AND 104857),
 total_records integer NOT NULL CHECK(total_records BETWEEN 1 AND snapshot_record_count),
 captured_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(enrollment_id,batch_key),
 FOREIGN KEY(enrollment_id,tenant_id,serial) REFERENCES clock_source.enrollment(id,tenant_id,serial),
 CHECK(batch_key=encode(public.digest(snapshot_sha256||':'||records_sha256,'sha256'),'hex'))
);

CREATE TABLE IF NOT EXISTS clock_source.part (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES clock_source.batch(id),
 part_start integer NOT NULL CHECK(part_start BETWEEN 0 AND 104856 AND part_start%500=0),
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 part_sha256 text NOT NULL CHECK(part_sha256 ~ '^[a-f0-9]{64}$'),
 record_count integer NOT NULL CHECK(record_count BETWEEN 1 AND 500),
 raw_payload bytea NOT NULL,
 source_ordinals integer[] NOT NULL,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(batch_id,part_start),
 CHECK(octet_length(raw_payload)=record_count*40),
 CHECK(cardinality(source_ordinals)=record_count AND array_ndims(source_ordinals)=1 AND array_lower(source_ordinals,1)=1),
 CHECK(array_position(source_ordinals,NULL) IS NULL),
 CHECK(encode(public.digest(raw_payload,'sha256'),'hex')=part_sha256)
);

CREATE TABLE IF NOT EXISTS clock_source.completion (
 batch_id uuid PRIMARY KEY REFERENCES clock_source.batch(id),
 completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 record_count integer NOT NULL CHECK(record_count BETWEEN 1 AND 104857),
 part_count integer NOT NULL CHECK(part_count BETWEEN 1 AND 210),
 records_sha256 text NOT NULL CHECK(records_sha256 ~ '^[a-f0-9]{64}$')
);

CREATE OR REPLACE FUNCTION clock_source.reject_mutation_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,clock_source,pg_temp AS $$
BEGIN RAISE EXCEPTION 'CLOCK_SOURCE_IMMUTABLE'; END $$;

CREATE OR REPLACE FUNCTION clock_source.enrollment_guard_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,clock_source,pg_temp AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'CLOCK_SOURCE_IMMUTABLE'; END IF;
 IF ROW(NEW.id,NEW.tenant_id,NEW.connector_key,NEW.serial,NEW.enrolled_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.connector_key,OLD.serial,OLD.enrolled_at) THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION clock_source.installation_guard_v1() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,clock_source,pg_temp AS $$
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'CLOCK_SOURCE_IMMUTABLE'; END IF;
 IF ROW(NEW.singleton,NEW.version,NEW.installed_at) IS DISTINCT FROM ROW(OLD.singleton,OLD.version,OLD.installed_at) THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_IMMUTABLE';
 END IF;
 RETURN NEW;
END $$;

DO $triggers$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['installation','enrollment','batch','part','completion'] LOOP
  EXECUTE format('ALTER TABLE clock_source.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE OR REPLACE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON clock_source.%I FOR EACH ROW EXECUTE FUNCTION clock_source.%I()',t,
   CASE t WHEN 'installation' THEN 'installation_guard_v1' WHEN 'enrollment' THEN 'enrollment_guard_v1' ELSE 'reject_mutation_v1' END);
  EXECUTE format('CREATE OR REPLACE TRIGGER immutable_truncate BEFORE TRUNCATE ON clock_source.%I FOR EACH STATEMENT EXECUTE FUNCTION clock_source.reject_mutation_v1()',t);
 END LOOP;
END $triggers$;

CREATE OR REPLACE FUNCTION clock_source.receive_v1(p_connector text,p_token_hash text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,clock_source,pg_temp
AS $receive$
DECLARE
 e clock_source.enrollment%ROWTYPE;
 b clock_source.batch%ROWTYPE;
 saved clock_source.part%ROWTYPE;
 keys text[];
 total_n integer; snapshot_n integer; start_n integer; count_n integer; ordinal_n integer; previous_n integer:=0;
 captured timestamptz; data bytea; ordinals integer[]:='{}'; request_hash text; manifest_hash text;
 prior_count integer; prior_parts integer; combined bytea; final_part boolean; was_replay boolean:=false;
 max_bytes bigint; used_bytes bigint;
BEGIN
 IF p_connector IS NULL OR p_connector !~ '^[a-z0-9][a-z0-9._-]{7,127}$'
 OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CLOCK_SOURCE_AUTH_DENIED'; END IF;
 -- This lock serializes all batches for an enrollment and its revocation/token
 -- rotation. A current credential is required even to recover a persisted ACK.
 SELECT * INTO e FROM clock_source.enrollment WHERE connector_key=p_connector FOR UPDATE NOWAIT;
 IF NOT FOUND OR NOT e.enabled OR e.token_sha256 IS DISTINCT FROM p_token_hash THEN RAISE EXCEPTION 'CLOCK_SOURCE_AUTH_DENIED'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>40000 THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_PAYLOAD_INVALID';
 END IF;
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p_payload) k;
 IF keys IS DISTINCT FROM ARRAY['batchId','capturedAt','ordinals','partSha256','partStart','recordsBase64','recordsSha256','serial','snapshotRecordCount','snapshotSha256','totalRecords','version']::text[]
 OR p_payload->>'version' IS DISTINCT FROM 'zk40-delivery.v1'
 OR jsonb_typeof(p_payload->'serial') IS DISTINCT FROM 'string'
 OR (p_payload->>'serial') !~ '^[A-Za-z0-9-]{6,64}$'
 OR jsonb_typeof(p_payload->'ordinals') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'CLOCK_SOURCE_PAYLOAD_INVALID'; END IF;
 IF p_payload->>'serial' IS DISTINCT FROM e.serial THEN RAISE EXCEPTION 'CLOCK_SOURCE_AUTH_DENIED'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['batchId','snapshotSha256','recordsSha256','partSha256']) k
           WHERE jsonb_typeof(p_payload->k) IS DISTINCT FROM 'string' OR (p_payload->>k) !~ '^[a-f0-9]{64}$')
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['snapshotRecordCount','totalRecords','partStart']) k
           WHERE jsonb_typeof(p_payload->k) IS DISTINCT FROM 'number' OR (p_payload->>k) !~ '^[0-9]{1,6}$')
 OR jsonb_typeof(p_payload->'recordsBase64') IS DISTINCT FROM 'string'
 OR length(p_payload->>'recordsBase64') NOT BETWEEN 56 AND 26668
 OR (p_payload->>'recordsBase64') !~ '^[A-Za-z0-9+/]+={0,2}$'
 OR jsonb_typeof(p_payload->'capturedAt') IS DISTINCT FROM 'string'
 OR (p_payload->>'capturedAt') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_PAYLOAD_INVALID';
 END IF;
 BEGIN
  captured:=(p_payload->>'capturedAt')::timestamptz;
  data:=decode(p_payload->>'recordsBase64','base64');
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_parameter_value THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_PAYLOAD_INVALID';
 END;
 IF to_char(captured AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') IS DISTINCT FROM p_payload->>'capturedAt'
 OR captured>clock_timestamp()+interval '5 minutes' THEN RAISE EXCEPTION 'CLOCK_SOURCE_PAYLOAD_INVALID'; END IF;
 total_n:=(p_payload->>'totalRecords')::integer; snapshot_n:=(p_payload->>'snapshotRecordCount')::integer;
 start_n:=(p_payload->>'partStart')::integer; count_n:=octet_length(data)/40;
 IF total_n NOT BETWEEN 1 AND 104857 OR snapshot_n NOT BETWEEN total_n AND 104857
 OR start_n<0 OR start_n>=total_n OR start_n%500<>0
 OR octet_length(data)%40<>0 OR count_n<>least(500,total_n-start_n)
 OR count_n NOT BETWEEN 1 AND 500 OR jsonb_array_length(p_payload->'ordinals')<>count_n
 OR replace(encode(data,'base64'),E'\n','') IS DISTINCT FROM p_payload->>'recordsBase64'
 OR encode(public.digest(data,'sha256'),'hex') IS DISTINCT FROM p_payload->>'partSha256'
 OR encode(public.digest((p_payload->>'snapshotSha256')||':'||(p_payload->>'recordsSha256'),'sha256'),'hex') IS DISTINCT FROM p_payload->>'batchId' THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_PAYLOAD_INVALID';
 END IF;
 FOR i IN 0..count_n-1 LOOP
  IF jsonb_typeof(p_payload->'ordinals'->i) IS DISTINCT FROM 'number'
  OR (p_payload->'ordinals'->>i) !~ '^[0-9]{1,6}$' THEN RAISE EXCEPTION 'CLOCK_SOURCE_PAYLOAD_INVALID'; END IF;
  ordinal_n:=(p_payload->'ordinals'->>i)::integer;
  IF ordinal_n<=previous_n OR ordinal_n>snapshot_n THEN RAISE EXCEPTION 'CLOCK_SOURCE_PAYLOAD_INVALID'; END IF;
  ordinals:=array_append(ordinals,ordinal_n); previous_n:=ordinal_n;
 END LOOP;
 request_hash:=encode(public.digest(p_payload::text,'sha256'),'hex');
 manifest_hash:=encode(public.digest((p_payload-ARRAY['partStart','partSha256','ordinals','recordsBase64'])::text,'sha256'),'hex');
 SELECT * INTO b FROM clock_source.batch WHERE enrollment_id=e.id AND batch_key=p_payload->>'batchId';
 IF FOUND THEN
  IF b.manifest_sha256 IS DISTINCT FROM manifest_hash THEN RAISE EXCEPTION 'CLOCK_SOURCE_IDEMPOTENCY_CONFLICT'; END IF;
  SELECT * INTO saved FROM clock_source.part WHERE batch_id=b.id AND part_start=start_n;
  IF FOUND THEN
   IF saved.request_sha256 IS DISTINCT FROM request_hash THEN RAISE EXCEPTION 'CLOCK_SOURCE_IDEMPOTENCY_CONFLICT'; END IF;
   was_replay:=true;
  END IF;
 END IF;
 IF NOT was_replay THEN
  -- This is a conservative database-level budget, not a provider/project quota.
  -- It excludes other databases/branches, never deletes data, and does not block
  -- recovery of an existing receipt. Global serialization covers other devices.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('clock-source:capacity:v1',0)) THEN RAISE EXCEPTION 'CLOCK_SOURCE_BUSY'; END IF;
  SELECT max_database_bytes INTO max_bytes FROM clock_source.installation WHERE singleton FOR SHARE NOWAIT;
  used_bytes:=pg_database_size(current_database());
  IF max_bytes IS NULL OR used_bytes+262144>max_bytes THEN RAISE EXCEPTION 'CLOCK_SOURCE_CAPACITY_LIMIT'; END IF;
  IF b.id IS NULL THEN
   INSERT INTO clock_source.batch(enrollment_id,tenant_id,serial,batch_key,manifest_sha256,snapshot_sha256,records_sha256,snapshot_record_count,total_records,captured_at)
   VALUES(e.id,e.tenant_id,e.serial,p_payload->>'batchId',manifest_hash,p_payload->>'snapshotSha256',p_payload->>'recordsSha256',snapshot_n,total_n,captured)
   RETURNING * INTO b;
  END IF;
  SELECT coalesce(sum(record_count),0)::integer,count(*)::integer INTO prior_count,prior_parts FROM clock_source.part WHERE batch_id=b.id;
  IF prior_count+count_n>total_n OR EXISTS(SELECT 1 FROM clock_source.completion WHERE batch_id=b.id) THEN
   RAISE EXCEPTION 'CLOCK_SOURCE_BATCH_INTEGRITY_INVALID';
  END IF;
  final_part:=prior_count+count_n=total_n;
  IF final_part THEN
   SELECT string_agg(piece,decode('','hex') ORDER BY pos) INTO combined FROM (
    SELECT part_start AS pos,raw_payload AS piece FROM clock_source.part WHERE batch_id=b.id
    UNION ALL SELECT start_n,data
   ) pieces;
   IF prior_parts+1<>(total_n+499)/500 OR octet_length(combined)<>total_n*40
   OR encode(public.digest(combined,'sha256'),'hex') IS DISTINCT FROM b.records_sha256
   OR EXISTS (
    SELECT 1 FROM (
     SELECT ordinal,lag(ordinal) OVER(ORDER BY pos,array_pos) AS previous_ordinal FROM (
      SELECT p.part_start AS pos,u.ordinal,u.array_pos FROM clock_source.part p
      CROSS JOIN LATERAL unnest(p.source_ordinals) WITH ORDINALITY AS u(ordinal,array_pos) WHERE p.batch_id=b.id
      UNION ALL SELECT start_n,u.ordinal,u.array_pos FROM unnest(ordinals) WITH ORDINALITY AS u(ordinal,array_pos)
     ) ordered_ordinals
    ) checked_ordinals WHERE ordinal<=previous_ordinal
   ) THEN RAISE EXCEPTION 'CLOCK_SOURCE_BATCH_INTEGRITY_INVALID'; END IF;
  END IF;
  INSERT INTO clock_source.part(batch_id,part_start,request_sha256,part_sha256,record_count,raw_payload,source_ordinals)
  VALUES(b.id,start_n,request_hash,p_payload->>'partSha256',count_n,data,ordinals) RETURNING * INTO saved;
  IF final_part THEN
   INSERT INTO clock_source.completion(batch_id,record_count,part_count,records_sha256) VALUES(b.id,total_n,prior_parts+1,b.records_sha256);
  END IF;
 END IF;
 RETURN jsonb_build_object('version','clock-source-receipt.v1','receiptId',saved.id,'tenantId',e.tenant_id,'serial',e.serial,
  'batchId',b.batch_key,'partStart',saved.part_start,'partSha256',saved.part_sha256,'snapshotSha256',b.snapshot_sha256,
  'recordsSha256',b.records_sha256,'count',saved.record_count,
  'receivedAt',to_char(saved.received_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'persisted',true,'scope','source_only','payrollModified',false,'replayed',was_replay);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'CLOCK_SOURCE_BUSY';
END $receive$;

REVOKE ALL ON ALL TABLES IN SCHEMA clock_source FROM PUBLIC,clocks_source_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA clock_source FROM PUBLIC,clocks_source_runtime;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA clock_source FROM PUBLIC,clocks_source_runtime;
GRANT USAGE ON SCHEMA clock_source TO clocks_source_runtime;
GRANT EXECUTE ON FUNCTION clock_source.receive_v1(text,text,jsonb) TO clocks_source_runtime;

COMMENT ON SCHEMA clock_source IS 'Private immutable clock source evidence only; no HR, attendance approval or payroll interpretation.';
COMMENT ON FUNCTION clock_source.receive_v1(text,text,jsonb) IS 'Trusted backend only. Hash credential before calling; never expose this SQL role/connection to a device. A receipt is usable only after successful COMMIT. JSONB identity ignores object key order; an HTTP adapter must reject duplicate JSON keys.';
COMMENT ON TABLE clock_source.completion IS 'Verifies received delta bytes and source ordinal ordering only. Does not certify full device history or period coverage.';
COMMENT ON COLUMN clock_source.enrollment.token_sha256 IS 'Globally unique among current enrollments, including disabled ones. Rotation replaces this hash; historical non-reuse requires a future provisioning ledger. No legacy/core token is imported or compared here.';
COMMENT ON COLUMN clock_source.installation.max_database_bytes IS 'Owner-only ceiling <=400 MiB for this database, with 256 KiB reserve per new part. Excludes other databases, branches, backups and project-wide usage; no automatic cleanup.';
