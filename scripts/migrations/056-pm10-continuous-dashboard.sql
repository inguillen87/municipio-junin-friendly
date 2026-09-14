-- MC-C03: one read cut for history + acknowledged PM-10 records.
-- Source evidence is immutable. A changed source or identity projection rejects
-- pagination/export with 409; this is a read revision, not a physical capture ID.
-- Apply only after 055, using the separately authorized migration procedure.
CREATE OR REPLACE FUNCTION public.attendance_clock_dashboard_v3(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,
 p_site text DEFAULT 'pm-10',p_from date DEFAULT NULL,p_to date DEFAULT NULL,
 p_page integer DEFAULT 1,p_size integer DEFAULT 50,p_search text DEFAULT '',
 p_identity text DEFAULT 'all',p_hour integer DEFAULT NULL,p_snapshot uuid DEFAULT NULL,
 p_source text DEFAULT 'historical'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 ctx jsonb; answer jsonb; nominal boolean; binding platform_tenant_source_binding%ROWTYPE;
BEGIN
 ctx:=attendance_gateway_assert_session_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 ctx:=attendance_gateway_assert_actor_v1(ctx,'attendance.read');
 IF p_site IS NULL OR p_site!~'^[a-z0-9][a-z0-9._-]{1,95}$'
 OR p_source IS NULL OR p_source NOT IN ('historical','continuous')
 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000 OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 100
 OR (p_from IS NULL)<>(p_to IS NULL) OR (p_from IS NOT NULL AND (p_to<p_from OR p_to-p_from>92))
 OR p_search IS NULL OR length(p_search)>120 OR p_search ~ '[[:cntrl:]]'
 OR p_identity IS NULL OR p_identity NOT IN ('all','mapped','unmapped')
 OR (p_hour IS NOT NULL AND p_hour NOT BETWEEN 0 AND 23) THEN
  RAISE EXCEPTION 'ATTENDANCE_OPERATIONS_QUERY_INVALID';
 END IF;
 SELECT EXISTS(SELECT 1 FROM tenant_iam_effective_capabilities(p_membership)
  WHERE capability_key='workforce.employee.read') INTO nominal;
 IF btrim(p_search)<>'' AND NOT nominal THEN RAISE EXCEPTION 'ATTENDANCE_CAPABILITY_REQUIRED';END IF;
 SELECT sb.* INTO binding FROM tenant_identity_policy policy
 JOIN platform_tenant_source_binding sb ON sb.id=policy.certified_source_binding_id AND sb.tenant_id=policy.tenant_id
 WHERE policy.tenant_id=p_tenant AND policy.tenant_data_plane_ready AND sb.verified;
 IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_BINDING_REQUIRED';END IF;

 -- All source selection, revision, rows and aggregates share this statement's
 -- MVCC snapshot. No second SELECT can introduce a receipt mid-response.
 WITH site AS MATERIALIZED (
  SELECT * FROM attendance_marking_site WHERE tenant_id=p_tenant AND external_key=p_site
 ), devices AS MATERIALIZED (
  SELECT d.* FROM attendance_device d JOIN site s ON s.id=d.site_id WHERE d.tenant_id=p_tenant
 ), captures AS MATERIALIZED (
  SELECT c.* FROM attendance_clock_snapshot c JOIN devices d ON d.id=c.device_id WHERE c.tenant_id=p_tenant
 ), latest_capture AS MATERIALIZED (
  SELECT * FROM captures ORDER BY captured_at DESC,id DESC LIMIT 1
 ), selected_captures AS MATERIALIZED (
  SELECT * FROM captures WHERE p_source='continuous' OR id=(SELECT id FROM latest_capture)
 ), receipts AS MATERIALIZED (
  SELECT q.* FROM attendance_pm10_receipt q JOIN devices d ON d.id=q.device_id
  WHERE q.tenant_id=p_tenant AND p_source='continuous'
 ), source_rows AS MATERIALIZED (
  SELECT c.device_id,c.id source_id,0 priority,r.ordinal,r.raw_record_sha256::text raw_hash,
   r.occurred_at,r.local_timestamp,r.identity_hmac,r.verification_code,r.punch_code,r.issue_codes,r.raw_event_id
  FROM attendance_clock_snapshot_row r JOIN selected_captures c ON c.id=r.snapshot_id
  WHERE r.tenant_id=p_tenant
  UNION ALL
  SELECT r.device_id,q.id,1,r.source_ordinal,r.raw_sha256::text,r.occurred_at,r.local_timestamp,
   r.identity_hmac,r.verification_code,r.punch_code,r.issue_codes,r.raw_event_id
  FROM attendance_pm10_record r JOIN receipts q ON q.id=r.receipt_id AND q.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant
 ), unique_rows AS MATERIALIZED (
  -- Historical mode preserves its original row count. Continuous mode unifies
  -- exact raw-record fingerprints per device; it never merges DNI + minute.
  SELECT DISTINCT ON (device_id,CASE WHEN p_source='historical' THEN source_id::text||':'||ordinal ELSE raw_hash END) *
  FROM source_rows
  ORDER BY device_id,CASE WHEN p_source='historical' THEN source_id::text||':'||ordinal ELSE raw_hash END,priority,source_id,ordinal
 ), projected AS MATERIALIZED (
  SELECT r.*,CASE WHEN p_source='historical' THEN r.source_id::text||':'||r.ordinal
   ELSE coalesce(r.raw_event_id::text,r.source_id::text||':'||r.ordinal) END row_key,
   CASE WHEN ec.id IS NOT NULL AND cp.reconciliation_state='mapped' THEN 'mapped'
    WHEN cp.reconciliation_state='ambiguous' THEN 'ambiguous' ELSE 'unmapped' END identity_state,
   coalesce(cp.review_state,'pending') review_state,
   CASE WHEN nominal AND pi.full_name IS NOT NULL THEN pi.full_name
    ELSE 'Persona '||upper(substr(encode(digest(coalesce(r.identity_hmac::text,r.source_id::text),'sha256'),'hex'),1,8)) END person_label,
   CASE WHEN nominal THEN ec.legacy_legajo ELSE NULL END legajo
  FROM unique_rows r
  LEFT JOIN attendance_canonical_punch cp ON cp.raw_event_id=r.raw_event_id AND cp.tenant_id=p_tenant
  LEFT JOIN employment_contract ec ON ec.id=cp.employment_contract_id
   AND ec.source_system=binding.source_system AND ec.legacy_company_id=binding.source_company_id
   AND EXISTS(SELECT 1 FROM source_import_batch ib WHERE ib.id=ec.source_batch_id
    AND ib.source_system=binding.source_system AND ib.source_database=binding.source_database
    AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL)
  LEFT JOIN person_identity pi ON pi.id=ec.person_id
 ), period AS MATERIALIZED (
  SELECT coalesce(p_to,(max(local_timestamp) FILTER(WHERE cardinality(issue_codes)=0))::date,
   (statement_timestamp() AT TIME ZONE coalesce((SELECT timezone FROM site),'America/Argentina/Mendoza'))::date) to_day
  FROM projected
 ), bounds AS MATERIALIZED (
  SELECT coalesce(p_from,to_day) from_day,to_day FROM period
 ), filtered AS MATERIALIZED (
  SELECT r.* FROM projected r CROSS JOIN bounds b
  WHERE cardinality(r.issue_codes)=0 AND r.local_timestamp>=b.from_day AND r.local_timestamp<b.to_day+1
   AND (p_identity='all' OR (p_identity='mapped' AND r.identity_state='mapped') OR (p_identity='unmapped' AND r.identity_state<>'mapped'))
   AND (p_hour IS NULL OR extract(hour FROM r.local_timestamp)::integer=p_hour)
   AND (btrim(p_search)='' OR strpos(lower(r.person_label),lower(btrim(p_search)))>0 OR strpos(coalesce(r.legajo,''),btrim(p_search))>0)
 ), pages AS (
  SELECT * FROM filtered ORDER BY occurred_at DESC,row_key DESC LIMIT p_size OFFSET (p_page-1)::bigint*p_size
 ), days AS (SELECT local_timestamp::date AS day_key,count(*) marks,count(DISTINCT identity_hmac) people FROM filtered GROUP BY 1),
 hours AS (SELECT extract(hour FROM local_timestamp)::integer AS hour_key,count(*) marks FROM filtered GROUP BY 1),
 heat AS (SELECT extract(isodow FROM local_timestamp)::integer weekday,extract(hour FROM local_timestamp)::integer AS hour_key,count(*) marks FROM filtered GROUP BY 1,2),
 codes AS (SELECT punch_code code,count(*) marks FROM filtered GROUP BY 1),
 stats AS (SELECT count(*) marks,count(DISTINCT identity_hmac) people,count(*) FILTER(WHERE identity_state='mapped') mapped,
  count(DISTINCT identity_hmac) FILTER(WHERE identity_state<>'mapped') unlinked,max(occurred_at) latest FROM filtered),
 source_stats AS (SELECT count(*) stored,count(*) FILTER(WHERE cardinality(issue_codes)>0) observed FROM projected),
 fingerprint AS (
  SELECT md5(concat_ws('|',p_tenant,p_site,p_source,nominal,
   (SELECT string_agg(id::text,',' ORDER BY id) FROM selected_captures),
   (SELECT string_agg(id::text,',' ORDER BY id) FROM receipts),
   (SELECT string_agg(jsonb_build_array(row_key,identity_state,review_state,person_label,legajo,issue_codes)::text,',' ORDER BY row_key) FROM projected))) hash
 ), revision AS (
  SELECT (substr(hash,1,8)||'-'||substr(hash,9,4)||'-5'||substr(hash,14,3)||'-8'||substr(hash,18,3)||'-'||substr(hash,21,12))::uuid id FROM fingerprint
 ), complete_history AS (
  SELECT max(c.captured_at) captured_at FROM selected_captures c
  WHERE c.transport_complete AND c.record_count=(SELECT count(*) FROM attendance_clock_snapshot_row r WHERE r.snapshot_id=c.id AND r.tenant_id=p_tenant)
 ), complete_batches AS MATERIALIZED (
  SELECT connector_id,batch_key,min(captured_at) captured_at,max(received_at) received_at
  FROM receipts GROUP BY connector_id,batch_key
  HAVING sum(record_count)=min(total_records) AND min(total_records)=max(total_records)
   AND min(captured_at)=max(captured_at)
 ), latest_complete_batch AS (
  SELECT * FROM complete_batches ORDER BY captured_at DESC,connector_id,batch_key LIMIT 1
 )
 SELECT jsonb_build_object(
  'version','clock-operations.v1','generatedAt',statement_timestamp(),
  'timezone',coalesce((SELECT timezone FROM site),'America/Argentina/Mendoza'),
  'sites',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',external_key,'label',label) ORDER BY external_key),'[]'::jsonb) FROM attendance_marking_site WHERE tenant_id=p_tenant),
  'site',(SELECT jsonb_build_object('key',external_key,'label',label) FROM site),
  'filters',jsonb_build_object('from',b.from_day,'to',b.to_day,'anchoredToLatest',p_from IS NULL),
  'summary',jsonb_build_object('marks',s.marks,'people',s.people,'mappedMarks',s.mapped,'unmappedMarks',s.marks-s.mapped,
   'sourceRows',ss.stored,'observedRows',ss.observed,'latestMarkAt',s.latest),
  'collection',jsonb_build_object('status',CASE WHEN ss.stored=0 THEN 'no_data' WHEN p_source='continuous' THEN 'continuous_receipts'
    WHEN (SELECT record_count FROM latest_capture)<>ss.stored THEN 'import_incomplete' ELSE 'operator_snapshot' END,
   'capturedAt',CASE WHEN p_source='historical' THEN (SELECT captured_at FROM latest_capture) ELSE NULL END,
   'receivedAt',CASE WHEN p_source='historical' THEN (SELECT received_at FROM latest_capture) ELSE (SELECT max(received_at) FROM receipts) END,
   'periodCoverageCertified',false,'automaticCollectorVerified',false,'storedRows',ss.stored,
   'importComplete',CASE WHEN p_source='historical' THEN coalesce((SELECT record_count FROM latest_capture)=ss.stored,false)
    ELSE NOT EXISTS(SELECT 1 FROM selected_captures c WHERE c.record_count<>(SELECT count(*) FROM attendance_clock_snapshot_row r WHERE r.snapshot_id=c.id AND r.tenant_id=p_tenant)) END),
  'records',(SELECT coalesce(jsonb_agg(jsonb_build_object('rowKey',row_key,'ordinal',ordinal,'occurredAt',occurred_at,
   'personLabel',person_label,'legajo',legajo,'identityState',identity_state,'reviewState',review_state,'method','unknown','direction','unknown',
   'verificationCode',verification_code,'punchCode',punch_code) ORDER BY occurred_at DESC,row_key DESC),'[]'::jsonb) FROM pages),
  'daily',(SELECT coalesce(jsonb_agg(jsonb_build_object('day',day_key,'marks',marks,'people',people) ORDER BY day_key),'[]'::jsonb) FROM days),
  'hourly',(SELECT coalesce(jsonb_agg(jsonb_build_object('hour',hour_key,'marks',marks) ORDER BY hour_key),'[]'::jsonb) FROM hours),
  'observations',(SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',ordinal,'rowKey',row_key,
   'localTimestamp',coalesce(to_char(local_timestamp,'YYYY-MM-DD HH24:MI:SS'),'Fecha inválida'),'issues',issue_codes) ORDER BY row_key),'[]'::jsonb)
   FROM (SELECT * FROM projected WHERE cardinality(issue_codes)>0 ORDER BY row_key LIMIT 100) observations),
  'nominalReadAllowed',nominal,'pagination',jsonb_build_object('page',p_page,'pageSize',p_size,'total',s.marks,'pages',ceil(s.marks::numeric/p_size)),
  'dashboard',jsonb_build_object('version','clock-dashboard.v3','sourceMode',p_source,'snapshotId',rev.id,
   'historicalSnapshotId',(SELECT id FROM latest_capture),'filters',jsonb_build_object('search',btrim(p_search),'identity',p_identity,'hour',p_hour),
   'heatmap',(SELECT coalesce(jsonb_agg(jsonb_build_object('weekday',weekday,'hour',hour_key,'marks',marks) ORDER BY weekday,hour_key),'[]'::jsonb) FROM heat),
   'codes',(SELECT coalesce(jsonb_agg(to_jsonb(codes) ORDER BY code),'[]'::jsonb) FROM codes),'unlinkedPeople',s.unlinked,
   'device',(SELECT jsonb_build_object('model',model,'serial',serial_number,'firmware',firmware_version,
    'metadataAvailable',serial_number IS NOT NULL AND firmware_version IS NOT NULL,'automaticCollectorVerified',false)
    FROM devices ORDER BY id LIMIT 1),
   'telemetry',jsonb_build_object('lastAttemptAt',NULL,
    'lastCompleteCaptureAt',greatest((SELECT captured_at FROM complete_history),(SELECT captured_at FROM latest_complete_batch)),
    'completeCaptureScope','historical_and_confirmed_batches','lastReceiptAt',(SELECT max(received_at) FROM receipts),
    'backlog',NULL,'deliveryLatencySeconds',(SELECT floor(extract(epoch FROM received_at-captured_at))
     FROM latest_complete_batch WHERE received_at>=captured_at),
    'collectorTelemetryAvailable',false))
 ) INTO answer FROM bounds b CROSS JOIN stats s CROSS JOIN source_stats ss CROSS JOIN revision rev;
 IF p_snapshot IS NOT NULL AND p_snapshot::text IS DISTINCT FROM answer#>>'{dashboard,snapshotId}' THEN
  RAISE EXCEPTION 'ATTENDANCE_CAPTURE_CHANGED';
 END IF;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.attendance_clock_dashboard_v3(text,uuid,integer,text,uuid,uuid,text,date,date,integer,integer,text,text,integer,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_clock_dashboard_v3(text,uuid,integer,text,uuid,uuid,text,date,date,integer,integer,text,text,integer,uuid,text) TO municontrol_actions_runtime_app;
