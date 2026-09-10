-- Clock evidence and authenticated operational read model. No nominal seeds.
-- Additive migration, applied on an isolated Neon branch before the application branch.
-- Raw evidence and HMAC keys are deliberately NOT selectable by the application role.
CREATE TABLE IF NOT EXISTS attendance_clock_snapshot (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 device_id uuid NOT NULL, source_sha256 char(64) NOT NULL,
 captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 raw_attendance bytea NOT NULL, record_count integer NOT NULL CHECK(record_count BETWEEN 1 AND 100000),
 observed_count integer NOT NULL CHECK(observed_count BETWEEN 0 AND record_count),
 requested_by_membership_id uuid NOT NULL,
 source_mode text NOT NULL DEFAULT 'operator_snapshot' CHECK(source_mode='operator_snapshot'),
 transport_complete boolean NOT NULL CHECK(transport_complete),
 period_coverage_certified boolean NOT NULL DEFAULT false CHECK(NOT period_coverage_certified),
 UNIQUE(id,tenant_id), UNIQUE(tenant_id,device_id,source_sha256),
 FOREIGN KEY(device_id,tenant_id) REFERENCES attendance_device(id,tenant_id),
 FOREIGN KEY(requested_by_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id),
 CHECK(octet_length(raw_attendance)=4+record_count*40 AND octet_length(raw_attendance)<=4194304),
 CHECK(encode(digest(raw_attendance,'sha256'),'hex')=source_sha256)
);
CREATE TABLE IF NOT EXISTS attendance_clock_snapshot_row (
 snapshot_id uuid NOT NULL, tenant_id uuid NOT NULL, ordinal integer NOT NULL CHECK(ordinal>0),
 source_sequence_16 integer NOT NULL CHECK(source_sequence_16 BETWEEN 0 AND 65535),
 identity_hmac char(64) NOT NULL CHECK(identity_hmac ~ '^[a-f0-9]{64}$'),
 local_timestamp timestamp NOT NULL, occurred_at timestamptz NOT NULL,
 verification_code integer NOT NULL CHECK(verification_code BETWEEN 0 AND 255),
 punch_code integer NOT NULL CHECK(punch_code BETWEEN 0 AND 255), raw_record_sha256 char(64) NOT NULL,
 raw_event_id uuid REFERENCES attendance_raw_event(id), issue_codes text[] NOT NULL DEFAULT '{}',
 PRIMARY KEY(snapshot_id,ordinal),
 FOREIGN KEY(snapshot_id,tenant_id) REFERENCES attendance_clock_snapshot(id,tenant_id),
 CHECK(issue_codes <@ ARRAY['year_context_review','future_timestamp','identity_format_review']::text[])
);
CREATE INDEX IF NOT EXISTS attendance_clock_snapshot_time_ix ON attendance_clock_snapshot(tenant_id,device_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS attendance_clock_snapshot_row_time_ix ON attendance_clock_snapshot_row(tenant_id,occurred_at DESC);
CREATE TABLE IF NOT EXISTS attendance_clock_identity_key (
 tenant_id uuid PRIMARY KEY REFERENCES platform_tenant(id),
 secret bytea NOT NULL DEFAULT gen_random_bytes(32) CHECK(octet_length(secret)=32),
 created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON attendance_clock_snapshot,attendance_clock_snapshot_row,attendance_clock_identity_key FROM PUBLIC,municontrol_actions_runtime_app;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='attendance_clock_snapshot_immutable') THEN
  CREATE TRIGGER attendance_clock_snapshot_immutable BEFORE UPDATE OR DELETE ON attendance_clock_snapshot
  FOR EACH ROW EXECUTE FUNCTION attendance_gateway_reject_change_v1();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='attendance_clock_snapshot_row_immutable') THEN
  CREATE TRIGGER attendance_clock_snapshot_row_immutable BEFORE UPDATE OR DELETE ON attendance_clock_snapshot_row
  FOR EACH ROW EXECUTE FUNCTION attendance_gateway_reject_change_v1();
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.attendance_clock_operations_v1(
 p_email text, p_session uuid, p_version integer, p_release text, p_tenant uuid, p_membership uuid,
 p_site text DEFAULT 'pm-10', p_from date DEFAULT NULL, p_to date DEFAULT NULL,
 p_page integer DEFAULT 1, p_size integer DEFAULT 50
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 ctx jsonb; s attendance_marking_site%ROWTYPE; cap attendance_clock_snapshot%ROWTYPE;
 from_day date; to_day date; nominal boolean; total_rows bigint; unique_people bigint; mapped bigint;
 rows_json jsonb; daily_json jsonb; hour_json jsonb; issues_json jsonb; latest timestamptz; sites_json jsonb; stored integer;
BEGIN
 ctx:=attendance_gateway_assert_session_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 ctx:=attendance_gateway_assert_actor_v1(ctx,'attendance.read');
 IF p_site IS NULL OR p_site!~'^[a-z0-9][a-z0-9._-]{1,95}$'
 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 100
 OR (p_from IS NULL)<>(p_to IS NULL) OR (p_from IS NOT NULL AND (p_to<p_from OR p_to-p_from>92)) THEN
  RAISE EXCEPTION 'ATTENDANCE_OPERATIONS_QUERY_INVALID';
 END IF;
 SELECT EXISTS(SELECT 1 FROM tenant_iam_effective_capabilities(p_membership) c WHERE c.capability_key='workforce.employee.read') INTO nominal;
 SELECT coalesce(jsonb_agg(jsonb_build_object('key',external_key,'label',label) ORDER BY external_key),'[]'::jsonb)
 INTO sites_json FROM attendance_marking_site WHERE tenant_id=p_tenant;
 SELECT * INTO s FROM attendance_marking_site WHERE tenant_id=p_tenant AND external_key=p_site;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('version','clock-operations.v1','generatedAt',now(),'sites',sites_json,'site',NULL,
   'records','[]'::jsonb,'daily','[]'::jsonb,'hourly','[]'::jsonb,'observations','[]'::jsonb,
   'summary',jsonb_build_object('marks',0,'people',0,'mappedMarks',0),
   'collection',jsonb_build_object('status','no_data','periodCoverageCertified',false),
   'pagination',jsonb_build_object('page',1,'pageSize',p_size,'total',0,'pages',0));
 END IF;
 SELECT cs.* INTO cap FROM attendance_clock_snapshot cs
 JOIN attendance_device d ON d.id=cs.device_id AND d.tenant_id=cs.tenant_id
 WHERE cs.tenant_id=p_tenant AND d.site_id=s.id ORDER BY cs.captured_at DESC,cs.id DESC LIMIT 1;
 SELECT count(*) INTO stored FROM attendance_clock_snapshot_row WHERE snapshot_id=cap.id AND tenant_id=p_tenant;
 SELECT max(occurred_at) INTO latest FROM attendance_clock_snapshot_row
 WHERE snapshot_id=cap.id AND tenant_id=p_tenant AND cardinality(issue_codes)=0;
 to_day:=coalesce(p_to,(latest AT TIME ZONE s.timezone)::date,(now() AT TIME ZONE s.timezone)::date);
 from_day:=coalesce(p_from,to_day);
 SELECT count(*),count(DISTINCT r.identity_hmac),count(*) FILTER(WHERE cp.reconciliation_state='mapped')
 INTO total_rows,unique_people,mapped
 FROM attendance_clock_snapshot_row r
 LEFT JOIN attendance_canonical_punch cp ON cp.raw_event_id=r.raw_event_id AND cp.tenant_id=r.tenant_id
 WHERE r.snapshot_id=cap.id AND r.tenant_id=p_tenant AND cardinality(r.issue_codes)=0
 AND r.occurred_at>=from_day::timestamp AT TIME ZONE s.timezone
 AND r.occurred_at<(to_day+1)::timestamp AT TIME ZONE s.timezone;
 SELECT coalesce(jsonb_agg(item ORDER BY occurred_at DESC,ordinal DESC),'[]'::jsonb) INTO rows_json FROM (
  SELECT r.occurred_at,r.ordinal,jsonb_build_object('ordinal',r.ordinal,'occurredAt',r.occurred_at,
   'personLabel',CASE WHEN nominal AND p.full_name IS NOT NULL THEN p.full_name ELSE 'Persona '||upper(substr(encode(digest(r.identity_hmac::text,'sha256'),'hex'),1,8)) END,
   'legajo',CASE WHEN nominal THEN ec.legacy_legajo ELSE NULL END,
   'identityState',coalesce(cp.reconciliation_state,'unmapped'),'reviewState',coalesce(cp.review_state,'pending'),
   'method','unknown','direction','unknown','verificationCode',r.verification_code,'punchCode',r.punch_code) item
  FROM attendance_clock_snapshot_row r
  LEFT JOIN attendance_canonical_punch cp ON cp.raw_event_id=r.raw_event_id AND cp.tenant_id=r.tenant_id
  LEFT JOIN employment_contract ec ON ec.id=cp.employment_contract_id LEFT JOIN person_identity p ON p.id=ec.person_id
  WHERE r.snapshot_id=cap.id AND r.tenant_id=p_tenant AND cardinality(r.issue_codes)=0
  AND r.occurred_at>=from_day::timestamp AT TIME ZONE s.timezone
  AND r.occurred_at<(to_day+1)::timestamp AT TIME ZONE s.timezone
  ORDER BY r.occurred_at DESC,r.ordinal DESC LIMIT p_size OFFSET (p_page-1)::bigint*p_size
 ) q;
 SELECT coalesce(jsonb_agg(jsonb_build_object('day',event_day_key,'marks',marks,'people',people) ORDER BY event_day_key),'[]'::jsonb)
 INTO daily_json FROM (
  SELECT r.local_timestamp::date event_day_key,count(*) marks,count(DISTINCT r.identity_hmac) people
  FROM attendance_clock_snapshot_row r WHERE r.snapshot_id=cap.id AND r.tenant_id=p_tenant
  AND cardinality(r.issue_codes)=0 AND r.local_timestamp>=from_day AND r.local_timestamp<(to_day+1) GROUP BY 1
 ) q;
 SELECT coalesce(jsonb_agg(jsonb_build_object('hour',event_hour_key,'marks',marks) ORDER BY event_hour_key),'[]'::jsonb)
 INTO hour_json FROM (
  SELECT extract(hour FROM r.local_timestamp)::integer event_hour_key,count(*) marks
  FROM attendance_clock_snapshot_row r WHERE r.snapshot_id=cap.id AND r.tenant_id=p_tenant
  AND cardinality(r.issue_codes)=0 AND r.local_timestamp>=from_day AND r.local_timestamp<(to_day+1) GROUP BY 1
 ) q;
 SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',ordinal,'localTimestamp',to_char(local_timestamp,'YYYY-MM-DD HH24:MI:SS'),'issues',issue_codes) ORDER BY ordinal),'[]'::jsonb)
 INTO issues_json FROM (
  SELECT ordinal,local_timestamp,issue_codes FROM attendance_clock_snapshot_row
  WHERE snapshot_id=cap.id AND tenant_id=p_tenant AND cardinality(issue_codes)>0 ORDER BY ordinal LIMIT 100
 ) q;
 RETURN jsonb_build_object('version','clock-operations.v1','generatedAt',now(),'timezone',s.timezone,'sites',sites_json,
 'site',jsonb_build_object('key',s.external_key,'label',s.label,'latitude',s.latitude,'longitude',s.longitude),
 'filters',jsonb_build_object('from',from_day,'to',to_day,'anchoredToLatest',p_from IS NULL),
 'summary',jsonb_build_object('marks',total_rows,'people',unique_people,'mappedMarks',mapped,'unmappedMarks',total_rows-mapped,
 'sourceRows',coalesce(cap.record_count,0),'observedRows',coalesce(cap.observed_count,0),'latestMarkAt',latest),
 'collection',jsonb_build_object('status',CASE WHEN cap.id IS NULL THEN 'no_data' WHEN stored<>cap.record_count THEN 'import_incomplete' ELSE 'operator_snapshot' END,
 'capturedAt',cap.captured_at,'receivedAt',cap.received_at,'transportComplete',coalesce(cap.transport_complete,false),
 'periodCoverageCertified',false,'automaticCollectorVerified',false,'storedRows',stored,'importComplete',coalesce(stored=cap.record_count,false)),
 'records',rows_json,'daily',daily_json,'hourly',hour_json,'observations',issues_json,'nominalReadAllowed',nominal,
 'pagination',jsonb_build_object('page',p_page,'pageSize',p_size,'total',total_rows,'pages',ceil(total_rows::numeric/p_size)));
END $$;
REVOKE ALL ON FUNCTION attendance_clock_operations_v1(text,uuid,integer,text,uuid,uuid,text,date,date,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION attendance_clock_operations_v1(text,uuid,integer,text,uuid,uuid,text,date,date,integer,integer) TO municontrol_actions_runtime_app;
