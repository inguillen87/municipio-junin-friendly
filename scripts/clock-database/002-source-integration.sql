-- Dedicated clock source integration v1. ONE caller-owned transaction required.
-- Apply after 001, never reapply 001 after enabling phase-2 application logins.
-- No logins, credentials, municipal tenants, devices or bridge rows are seeded.
DO $guard$
DECLARE group_name text; app_name text; group_id oid; app_id oid;
BEGIN
 IF current_database() NOT IN ('municontrol_clocks','clock_source_qa')
 OR current_setting('server_version_num')::integer/10000 NOT IN (17,18)
 OR to_regclass('clock_source.installation') IS NULL
 OR to_regprocedure('clock_source.receive_v1(text,text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_INTEGRATION_PREREQUISITE';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('clock-source:installation:v1',0));
 IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='clock_source' AND nspowner=current_user::regrole)
 OR (SELECT version FROM clock_source.installation WHERE singleton) IS DISTINCT FROM 'clock-source-store.v1'
 OR encode(public.digest(pg_get_functiondef('clock_source.receive_v1(text,text,jsonb)'::regprocedure),'sha256'),'hex')
    IS DISTINCT FROM 'bf2d2982fc375d33d2ba3ad4695cdc32870ca17bce6e5664930fa7d1546551bd'
 OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source'
     AND c.relname IN ('installation','enrollment','batch','part','completion') AND c.relkind='r' AND c.relrowsecurity AND c.relowner=current_user::regrole)<>5
 OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source'
     AND c.relkind IN ('r','p','v','m','S','f') AND (c.relowner<>current_user::regrole OR c.relname NOT IN ('installation','enrollment','batch','part','completion','integration','device_binding')))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='clock_source'
     AND (p.proowner<>current_user::regrole OR p.proname NOT IN ('receive_v1','reject_mutation_v1','enrollment_guard_v1','installation_guard_v1','fleet_v1')))
 OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='clock_source')
    <>(CASE WHEN to_regclass('clock_source.integration') IS NULL THEN 4 ELSE 5 END) THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_INTEGRATION_PREREQUISITE';
 END IF;
 IF to_regclass('clock_source.integration') IS NOT NULL THEN
  IF (SELECT version FROM clock_source.integration WHERE singleton) IS DISTINCT FROM 'clock-source-integration.v1'
  OR to_regclass('clock_source.device_binding') IS NULL OR to_regprocedure('clock_source.fleet_v1(uuid,uuid[],text,text)') IS NULL
  OR (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source' AND c.relname IN ('integration','device_binding') AND c.relkind='r' AND c.relrowsecurity)<>2
  OR (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='clock_source' AND c.relname IN ('integration','device_binding') AND NOT t.tgisinternal
      AND t.tgname IN ('immutable_rows','immutable_truncate') AND t.tgenabled='O'
      AND t.tgtype=(CASE t.tgname WHEN 'immutable_rows' THEN 27 ELSE 34 END) AND t.tgqual IS NULL AND t.tgnargs=0
      AND t.tgfoid='clock_source.reject_mutation_v1()'::regprocedure)<>4 THEN
   RAISE EXCEPTION 'CLOCK_SOURCE_INTEGRATION_PREREQUISITE';
  END IF;
 ELSIF to_regclass('clock_source.device_binding') IS NOT NULL OR to_regprocedure('clock_source.fleet_v1(uuid,uuid[],text,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_INTEGRATION_PREREQUISITE';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='clocks_source_reader') THEN
  CREATE ROLE clocks_source_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 END IF;
 FOREACH group_name IN ARRAY ARRAY['clocks_source_runtime','clocks_source_reader'] LOOP
  app_name:=CASE group_name WHEN 'clocks_source_runtime' THEN 'clocks_source_ingest_app' ELSE 'clocks_source_reader_app' END;
  SELECT oid INTO group_id FROM pg_roles WHERE rolname=group_name;
  SELECT oid INTO app_id FROM pg_roles WHERE rolname=app_name;
  IF group_id IS NULL OR current_user=group_name
  OR EXISTS(SELECT 1 FROM pg_roles WHERE oid=group_id AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))
  OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=group_id)
  OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=group_id AND NOT (
    (member=current_user::regrole AND admin_option AND NOT inherit_option AND NOT set_option)
    OR (member=coalesce(app_id,0::oid) AND NOT admin_option AND inherit_option AND NOT set_option))) THEN
   RAISE EXCEPTION 'CLOCK_SOURCE_INTEGRATION_ROLE_DENIED';
  END IF;
  IF app_id IS NOT NULL AND (
   EXISTS(SELECT 1 FROM pg_roles WHERE oid=app_id AND (NOT rolcanlogin OR NOT rolinherit OR rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication))
   OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=app_id AND (roleid<>group_id OR admin_option OR NOT inherit_option OR set_option))
   OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=app_id AND NOT (member=current_user::regrole AND admin_option AND NOT inherit_option AND NOT set_option))
   OR has_schema_privilege(app_id,'clock_source','CREATE')
   OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source' AND c.relkind='r'
             AND has_table_privilege(app_id,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
   OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='clock_source'
             AND p.oid<>coalesce(to_regprocedure(CASE group_name WHEN 'clocks_source_runtime' THEN 'clock_source.receive_v1(text,text,jsonb)' ELSE 'clock_source.fleet_v1(uuid,uuid[],text,text)' END),0::oid)
             AND has_function_privilege(app_id,p.oid,'EXECUTE'))
   OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source' AND c.relowner=app_id)
   OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='clock_source' AND p.proowner=app_id)) THEN
   RAISE EXCEPTION 'CLOCK_SOURCE_INTEGRATION_ROLE_DENIED';
  END IF;
 END LOOP;
END $guard$;

CREATE TABLE IF NOT EXISTS clock_source.integration (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 version text NOT NULL CHECK(version='clock-source-integration.v1'),
 installed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO clock_source.integration(singleton,version) VALUES(true,'clock-source-integration.v1') ON CONFLICT(singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS clock_source.device_binding (
 enrollment_id uuid PRIMARY KEY,
 tenant_id uuid NOT NULL,
 serial text NOT NULL,
 core_device_id uuid NOT NULL CHECK(core_device_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 core_site_id uuid NOT NULL CHECK(core_site_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 source_binding_sha256 text NOT NULL CHECK(source_binding_sha256 ~ '^[a-f0-9]{64}$'),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256 ~ '^[a-f0-9]{64}$'),
 approved_by_membership_id uuid NOT NULL CHECK(approved_by_membership_id<>'00000000-0000-0000-0000-000000000000'::uuid),
 bound_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,core_device_id),
 FOREIGN KEY(enrollment_id,tenant_id,serial) REFERENCES clock_source.enrollment(id,tenant_id,serial)
);

ALTER TABLE clock_source.integration ENABLE ROW LEVEL SECURITY;
ALTER TABLE clock_source.device_binding ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON clock_source.integration FOR EACH ROW EXECUTE FUNCTION clock_source.reject_mutation_v1();
CREATE OR REPLACE TRIGGER immutable_truncate BEFORE TRUNCATE ON clock_source.integration FOR EACH STATEMENT EXECUTE FUNCTION clock_source.reject_mutation_v1();
CREATE OR REPLACE TRIGGER immutable_rows BEFORE UPDATE OR DELETE ON clock_source.device_binding FOR EACH ROW EXECUTE FUNCTION clock_source.reject_mutation_v1();
CREATE OR REPLACE TRIGGER immutable_truncate BEFORE TRUNCATE ON clock_source.device_binding FOR EACH STATEMENT EXECUTE FUNCTION clock_source.reject_mutation_v1();

CREATE OR REPLACE FUNCTION clock_source.fleet_v1(p_tenant uuid,p_device_ids uuid[],p_binding_sha256 text,p_expected_revision text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,clock_source,pg_temp
AS $fleet$
DECLARE answer jsonb; binding_changed boolean;
BEGIN
 IF p_tenant IS NULL OR p_tenant='00000000-0000-0000-0000-000000000000'::uuid
 OR p_device_ids IS NULL OR cardinality(p_device_ids)>200 OR coalesce(array_ndims(p_device_ids),1)<>1
 OR (cardinality(p_device_ids)>0 AND array_lower(p_device_ids,1)<>1)
 OR array_position(p_device_ids,NULL) IS NOT NULL
 OR '00000000-0000-0000-0000-000000000000'::uuid=ANY(p_device_ids)
 OR cardinality(p_device_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_device_ids) id)
 OR p_binding_sha256 IS NULL OR p_binding_sha256 !~ '^[a-f0-9]{64}$'
 OR (p_expected_revision IS NOT NULL AND p_expected_revision !~ '^[a-f0-9]{64}$') THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_QUERY_INVALID';
 END IF;
 -- ONE statement snapshot covers enrollment, binding, source and completion.
 -- IDs are supplied by a trusted backend AFTER current core IAM/inventory checks.
 WITH requested AS (SELECT id FROM unnest(p_device_ids) id), devices AS (
  SELECT r.id,link.core_site_id,link.source_binding_sha256,e.id AS enrollment_id,e.enabled,
   coalesce(p.receipts,0) AS receipts,coalesce(p.records,0) AS records,
   coalesce(b.completed,0) AS completed,coalesce(b.pending,0) AS pending,
   p.last_received,b.last_captured,
   -- Include receipt identities and completion, not just totals/timestamps.
   -- Disabled enrollments keep their immutable evidence visible to authorized
   -- readers, and their changed state invalidates prior snapshot revisions.
   coalesce(p.cut,'') AS part_cut,coalesce(b.cut,'') AS batch_cut
  FROM requested r
  LEFT JOIN clock_source.device_binding link ON link.tenant_id=p_tenant AND link.core_device_id=r.id
  LEFT JOIN clock_source.enrollment e ON e.id=link.enrollment_id AND e.tenant_id=p_tenant
  LEFT JOIN LATERAL (
   SELECT count(*) AS receipts,coalesce(sum(part.record_count),0) AS records,max(part.received_at) AS last_received,
    encode(public.digest(coalesce(string_agg(part.id::text||':'||part.request_sha256,'' ORDER BY part.id),''),'sha256'),'hex') AS cut
   FROM clock_source.part part JOIN clock_source.batch batch ON batch.id=part.batch_id
   WHERE batch.enrollment_id=e.id AND batch.tenant_id=p_tenant
  ) p ON true
  LEFT JOIN LATERAL (
   SELECT count(*) FILTER(WHERE c.batch_id IS NOT NULL) AS completed,count(*) FILTER(WHERE c.batch_id IS NULL) AS pending,
    max(batch.captured_at) AS last_captured,
    encode(public.digest(coalesce(string_agg(batch.id::text||':'||batch.manifest_sha256||':'||coalesce(c.batch_id::text,''),'' ORDER BY batch.id),''),'sha256'),'hex') AS cut
   FROM clock_source.batch batch LEFT JOIN clock_source.completion c ON c.batch_id=batch.id
   WHERE batch.enrollment_id=e.id AND batch.tenant_id=p_tenant
  ) b ON true
 ), assembled AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'deviceId',id,'siteId',core_site_id,'enrolled',enrollment_id IS NOT NULL,'enabled',coalesce(enabled,false),
   'receipts',receipts,'recordsPersisted',records,'completedBatches',completed,'pendingBatches',pending,
   'lastReceivedAt',CASE WHEN last_received IS NOT NULL THEN to_char(last_received AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
   'lastCapturedAt',CASE WHEN last_captured IS NOT NULL THEN to_char(last_captured AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END
  ) ORDER BY id),'[]'::jsonb) AS items,
  coalesce(bool_or(source_binding_sha256 IS DISTINCT FROM p_binding_sha256) FILTER(WHERE enrollment_id IS NOT NULL),false) AS drift,
  coalesce(string_agg(id::text||':'||coalesce(enrollment_id::text,'')||':'||coalesce(core_site_id::text,'')||':'||coalesce(enabled::text,'')||':'||part_cut||':'||batch_cut,'' ORDER BY id),'') AS cut
  FROM devices
 )
 SELECT jsonb_build_object('version','clock-source-fleet.v1',
  'checkedAt',to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'tenantId',p_tenant,'sourceBindingSha256',p_binding_sha256,
  'revision',encode(public.digest(p_tenant::text||':'||p_binding_sha256||':'||cut,'sha256'),'hex'),
  'devices',items,'scope','source_only','reconciliationState','pending','payrollModified',false),drift
 INTO answer,binding_changed FROM assembled;
 IF binding_changed THEN RAISE EXCEPTION 'CLOCK_SOURCE_BINDING_CHANGED'; END IF;
 IF p_expected_revision IS NOT NULL AND answer->>'revision' IS DISTINCT FROM p_expected_revision THEN
  RAISE EXCEPTION 'CLOCK_SOURCE_SNAPSHOT_CHANGED';
 END IF;
 RETURN answer;
END $fleet$;

REVOKE ALL ON SCHEMA clock_source FROM PUBLIC,clocks_source_reader;
GRANT USAGE ON SCHEMA clock_source TO clocks_source_reader;
REVOKE ALL ON ALL TABLES IN SCHEMA clock_source FROM PUBLIC,clocks_source_runtime,clocks_source_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA clock_source FROM PUBLIC,clocks_source_runtime,clocks_source_reader;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA clock_source FROM PUBLIC,clocks_source_runtime,clocks_source_reader;
GRANT EXECUTE ON FUNCTION clock_source.receive_v1(text,text,jsonb) TO clocks_source_runtime;
GRANT EXECUTE ON FUNCTION clock_source.fleet_v1(uuid,uuid[],text,text) TO clocks_source_reader;

COMMENT ON TABLE clock_source.device_binding IS 'Administrative bridge to verified core inventory, not replicated IAM or employee identity. Provision disabled enrollment and bridge atomically; recheck real core authority before enabling. External UUIDs have no cross-database FK. No seed data.';
COMMENT ON COLUMN clock_source.device_binding.source_binding_sha256 IS 'SHA256 of UTF8 JSON.stringify with ordered keys {version:"clock-source-binding.v1",tenantId:lowercase UUID,system:"GRH",database:exact certified database in NFC,companyId:positive safe integer}. Backend and provisioning must use the same canonical helper and current verified core tuple; no user-supplied scope.';
COMMENT ON FUNCTION clock_source.fleet_v1(uuid,uuid[],text,text) IS 'Private aggregate reader for trusted backend only. Core authorizes tenant, binding and exact device IDs before read and revalidates before responding. Never returns raw bytes, identifiers from records, credentials or employee data. A source revision is not a cross-database atomic snapshot.';
COMMENT ON TABLE clock_source.integration IS 'LOGIN provisioning is separate: clocks_source_ingest_app may inherit only clocks_source_runtime; clocks_source_reader_app only clocks_source_reader; grants INHERIT TRUE, SET FALSE, ADMIN FALSE. Both LOGIN roles must be NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS, never owners, and have no direct source-table privileges. No passwords or login roles created by this migration.';
