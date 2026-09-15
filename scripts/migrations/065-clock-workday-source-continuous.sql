-- MC-A03 preparation only: continuous declared intervals, not homologated/payable time.
-- Additive, unapplied migration. Requires 045/055; leaves 047 and dashboard v3 intact.
CREATE OR REPLACE FUNCTION public.attendance_clock_workday_source_v2(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,
 p_site text DEFAULT 'pm-10',p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_snapshot uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 ctx jsonb; answer jsonb; binding_ok boolean; site_ok boolean; complete_ok boolean;
 device_ok boolean; conflict_found boolean; window_count bigint;
BEGIN
 ctx:=attendance_gateway_assert_session_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 ctx:=attendance_gateway_assert_actor_v1(ctx,'attendance.read');
 IF p_site IS NULL OR p_site!~'^[a-z0-9][a-z0-9._-]{1,95}$'
 OR (p_from IS NULL)<>(p_to IS NULL)
 OR (p_from IS NOT NULL AND (p_to<p_from OR p_to-p_from>92)) THEN
  RAISE EXCEPTION 'ATTENDANCE_OPERATIONS_QUERY_INVALID';
 END IF;

 -- Every source, integrity check, identity projection, event and revision below
 -- shares ONE statement's MVCC snapshot. No dashboard call followed by a new read.
 WITH access AS MATERIALIZED (
  SELECT EXISTS(SELECT 1 FROM tenant_iam_effective_capabilities(p_membership)
   WHERE capability_key='workforce.employee.read') nominal
 ), binding AS MATERIALIZED (
  SELECT sb.* FROM tenant_identity_policy policy
  JOIN platform_tenant_source_binding sb ON sb.id=policy.certified_source_binding_id AND sb.tenant_id=policy.tenant_id
  JOIN platform_tenant tenant ON tenant.id=policy.tenant_id AND tenant.status='active'
  WHERE policy.tenant_id=p_tenant AND policy.tenant_data_plane_ready AND sb.verified
   AND policy.certified_release_sha=p_release
 ), site AS MATERIALIZED (
  SELECT * FROM attendance_marking_site WHERE tenant_id=p_tenant AND external_key=p_site
 ), devices AS MATERIALIZED (
  SELECT d.* FROM attendance_device d JOIN site s ON s.id=d.site_id WHERE d.tenant_id=p_tenant
 ), captures AS MATERIALIZED (
  SELECT c.* FROM attendance_clock_snapshot c JOIN devices d ON d.id=c.device_id WHERE c.tenant_id=p_tenant
 ), receipts AS MATERIALIZED (
  SELECT q.* FROM attendance_pm10_receipt q JOIN devices d ON d.id=q.device_id WHERE q.tenant_id=p_tenant
 ), batch_ordinals AS MATERIALIZED (
  SELECT connector_id,batch_key,ordinal,
   lag(ordinal) OVER(PARTITION BY connector_id,batch_key ORDER BY part_start,position) previous_ordinal
  FROM receipts CROSS JOIN LATERAL unnest(source_ordinals) WITH ORDINALITY AS u(ordinal,position)
 ), batches AS MATERIALIZED (
  SELECT connector_id,batch_key,
   count(DISTINCT device_id)=1 AND count(DISTINCT manifest_sha256)=1
   AND count(DISTINCT snapshot_sha256)=1 AND count(DISTINCT captured_at)=1
   AND count(DISTINCT total_records)=1 AND count(DISTINCT records_sha256)=1
   AND sum(record_count)=min(total_records)
   AND min(part_start)=0 AND count(*)=(min(total_records)+499)/500
   AND max(part_start)=((min(total_records)-1)/500)*500
   AND bool_and(record_count=least(500,total_records-part_start)
    AND cardinality(source_ordinals)=record_count AND octet_length(records_payload)=record_count*40)
   AND encode(digest(string_agg(records_payload,decode('','hex') ORDER BY part_start),'sha256'),'hex')=min(records_sha256)::text
   AND encode(digest(min(snapshot_sha256)::text||':'||min(records_sha256)::text,'sha256'),'hex')=batch_key::text
   AND NOT EXISTS(SELECT 1 FROM batch_ordinals o WHERE o.connector_id=q.connector_id AND o.batch_key=q.batch_key
    AND (o.ordinal<=0 OR o.ordinal<=o.previous_ordinal)) complete
  FROM receipts q GROUP BY connector_id,batch_key
 ), integrity AS MATERIALIZED (
  SELECT NOT EXISTS(SELECT 1 FROM captures c WHERE NOT c.transport_complete OR c.record_count<>(
   SELECT count(*) FROM attendance_clock_snapshot_row r WHERE r.tenant_id=p_tenant AND r.snapshot_id=c.id))
   AND NOT EXISTS(SELECT 1 FROM batches WHERE complete IS DISTINCT FROM true) complete,
   NOT EXISTS(SELECT 1 FROM devices d CROSS JOIN site s WHERE d.timezone IS DISTINCT FROM s.timezone) device_context
 ), source_rows AS MATERIALIZED (
  SELECT c.device_id,c.id source_id,'historical'::text source_kind,0 priority,r.ordinal,
   r.raw_record_sha256::text raw_hash,r.occurred_at,r.local_timestamp,r.identity_hmac::text identity_hmac,
   r.punch_code,r.issue_codes,r.raw_event_id
  FROM attendance_clock_snapshot_row r JOIN captures c ON c.id=r.snapshot_id AND c.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant
  UNION ALL
  SELECT r.device_id,q.id,'receipt',1,r.source_ordinal,r.raw_sha256::text,r.occurred_at,r.local_timestamp,
   r.identity_hmac::text,r.punch_code,r.issue_codes,r.raw_event_id
  FROM attendance_pm10_record r JOIN receipts q ON q.id=r.receipt_id AND q.tenant_id=r.tenant_id AND q.device_id=r.device_id
  WHERE r.tenant_id=p_tenant
 ), confirmed_records AS MATERIALIZED (
  -- A complete receipt manifest also needs every confirmed 40-byte record in
  -- the projection. Previously known bytes may exist only in historical rows.
  SELECT q.device_id,encode(digest(substring(q.records_payload FROM 1+position*40 FOR 40),'sha256'),'hex') raw_hash
  FROM receipts q CROSS JOIN LATERAL generate_series(0,q.record_count-1) AS record(position)
 ), projection_missing AS MATERIALIZED (
  SELECT c.device_id,c.raw_hash FROM confirmed_records c
  WHERE NOT EXISTS(SELECT 1 FROM source_rows r WHERE r.device_id=c.device_id AND r.raw_hash=c.raw_hash)
 ), source_conflicts AS MATERIALIZED (
  SELECT device_id,raw_hash FROM source_rows GROUP BY device_id,raw_hash
  HAVING count(DISTINCT jsonb_build_array(occurred_at,local_timestamp,identity_hmac,punch_code))>1
 ), unique_rows AS MATERIALIZED (
  -- Exact bytes per device, never document/time proximity. The event reference
  -- stays the same if another capture or receipt repeats the source ordinal.
  SELECT DISTINCT ON(device_id,raw_hash) * FROM source_rows
  ORDER BY device_id,raw_hash,priority,source_id,ordinal
 ), period AS MATERIALIZED (
  SELECT coalesce(p_to,(max(local_timestamp) FILTER(WHERE cardinality(issue_codes)=0))::date,
   (statement_timestamp() AT TIME ZONE coalesce((SELECT timezone FROM site),'America/Argentina/Mendoza'))::date) to_day
  FROM unique_rows
 ), bounds AS MATERIALIZED (
  SELECT coalesce(p_from,to_day) from_day,to_day FROM period
 ), context_rows AS MATERIALIZED (
  SELECT r.* FROM unique_rows r CROSS JOIN bounds b CROSS JOIN site s
  WHERE r.local_timestamp IS NULL OR r.occurred_at IS NULL
   OR (r.local_timestamp>=(b.from_day-1)::timestamp AND r.local_timestamp<(b.to_day+2)::timestamp)
   OR ((r.occurred_at AT TIME ZONE s.timezone)>=(b.from_day-1)::timestamp
    AND (r.occurred_at AT TIME ZONE s.timezone)<(b.to_day+2)::timestamp)
 ), context_count AS MATERIALIZED (
  SELECT count(*) records FROM context_rows
 ), ready AS MATERIALIZED (
  SELECT i.complete AND i.device_context AND c.records<=25000
   AND EXISTS(SELECT 1 FROM binding) AND NOT EXISTS(SELECT 1 FROM source_conflicts)
   AND NOT EXISTS(SELECT 1 FROM projection_missing) ok
  FROM integrity i CROSS JOIN context_count c
 ), linked AS MATERIALIZED (
  SELECT r.*,d.model,d.timezone,s.timezone site_timezone,cp.review_state,
   CASE WHEN ec.id IS NOT NULL AND cp.reconciliation_state='mapped' THEN 'mapped'
    WHEN cp.reconciliation_state='ambiguous' OR overlap.present THEN 'ambiguous' ELSE 'unmapped' END identity_state,
   ec.id contract_id,ec.legacy_legajo,pi.full_name
  FROM context_rows r JOIN devices d ON d.id=r.device_id CROSS JOIN site s CROSS JOIN binding b CROSS JOIN ready
  LEFT JOIN attendance_canonical_punch cp ON cp.raw_event_id=r.raw_event_id AND cp.tenant_id=p_tenant
   AND cp.device_id=r.device_id AND cp.site_id=s.id AND cp.occurred_at=r.occurred_at
  LEFT JOIN attendance_identity_map im ON im.id=cp.identity_map_id AND im.tenant_id=p_tenant
   AND im.device_id=r.device_id AND im.identity_hmac_sha256=r.identity_hmac
   AND im.employment_contract_id=cp.employment_contract_id AND im.status='active'
   AND im.valid_from<=r.local_timestamp::date AND (im.valid_to IS NULL OR im.valid_to>=r.local_timestamp::date)
  LEFT JOIN LATERAL (
   SELECT EXISTS(SELECT 1 FROM attendance_identity_map other
    WHERE other.tenant_id=p_tenant AND other.device_id=r.device_id AND other.identity_hmac_sha256=r.identity_hmac
     AND other.status='active' AND other.id IS DISTINCT FROM im.id
     AND other.valid_from<=r.local_timestamp::date AND (other.valid_to IS NULL OR other.valid_to>=r.local_timestamp::date)) present
  ) overlap ON true
  LEFT JOIN employment_contract ec ON ec.id=im.employment_contract_id AND NOT overlap.present
   AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id
   AND ec.status IN('active','inactive') AND ec.start_date<=r.local_timestamp::date
   AND (ec.end_date IS NULL OR ec.end_date>=r.local_timestamp::date)
   AND EXISTS(SELECT 1 FROM source_import_batch ib WHERE ib.id=ec.source_batch_id
    AND ib.source_system=b.source_system AND ib.source_database=b.source_database
    AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL)
  LEFT JOIN person_identity pi ON pi.id=ec.person_id
  WHERE ready.ok
 ), projected AS MATERIALIZED (
  SELECT r.*,
   encode(digest('clock-event-v2:'||p_tenant||':'||device_id||':'||raw_hash,'sha256'),'hex') event_ref,
   encode(digest('clock-device-v2:'||p_tenant||':'||device_id,'sha256'),'hex') device_key,
   encode(digest('clock-person-v1:'||p_tenant||':'||identity_hmac,'sha256'),'hex') person_key,
   encode(digest('clock-stream-v2:'||p_tenant||':'||device_id||':'||identity_hmac||':'||
    coalesce(contract_id::text,'unmapped')||':'||identity_state,'sha256'),'hex') stream_key,
   CASE WHEN a.nominal AND full_name IS NOT NULL THEN full_name
    ELSE 'Persona '||upper(substr(encode(digest(identity_hmac,'sha256'),'hex'),1,8)) END person_label,
   CASE WHEN a.nominal THEN legacy_legajo ELSE NULL END legajo,
   identity_hmac IS NOT NULL AND occurred_at IS NOT NULL AND local_timestamp IS NOT NULL
    AND local_timestamp=(occurred_at AT TIME ZONE site_timezone) placeable,
   ARRAY(SELECT DISTINCT issue FROM (
    SELECT unnest(sr.issue_codes) issue FROM source_rows sr WHERE sr.device_id=r.device_id AND sr.raw_hash=r.raw_hash
    UNION ALL SELECT 'canonical_review_rejected' WHERE r.review_state='rejected'
    UNION ALL SELECT 'identity_unusable' WHERE r.identity_hmac IS NULL
    UNION ALL SELECT 'timestamp_unusable' WHERE r.occurred_at IS NULL OR r.local_timestamp IS NULL
     OR r.local_timestamp IS DISTINCT FROM (r.occurred_at AT TIME ZONE r.site_timezone)
   ) issues ORDER BY issue) all_issues
  FROM linked r CROSS JOIN access a
 ), payloads AS MATERIALIZED (
  SELECT event_ref,placeable,jsonb_build_object('eventRef',event_ref,'deviceKey',device_key,
   'source',jsonb_build_object('kind',source_kind,'id',source_id,'ordinal',ordinal),
   'occurredAt',occurred_at,'localTimestamp',to_char(local_timestamp,'YYYY-MM-DD HH24:MI:SS'),
   'issues',all_issues)||CASE WHEN placeable THEN jsonb_build_object(
    'model',model,'personKey',person_key,'streamKey',stream_key,'personLabel',person_label,
    'legajo',legajo,'identityState',identity_state,'code',punch_code) ELSE '{}'::jsonb END payload
  FROM projected
 ), fingerprint AS (
  SELECT encode(digest(concat_ws('|','clock-workday-source.v2','declared-intervals.v2',p_tenant,p_site,a.nominal,
   b.from_day,b.to_day,(SELECT timezone FROM site),(SELECT id FROM binding),
   (SELECT string_agg(jsonb_build_array(id,model,timezone,status)::text,',' ORDER BY id) FROM devices),
   (SELECT string_agg(jsonb_build_array(id,source_sha256,record_count,transport_complete)::text,',' ORDER BY id) FROM captures),
   (SELECT string_agg(jsonb_build_array(id,manifest_sha256,request_sha256)::text,',' ORDER BY id) FROM receipts),
   (SELECT string_agg(payload::text,',' ORDER BY event_ref) FROM payloads)), 'sha256'),'hex') hash
  FROM bounds b CROSS JOIN access a
 ), revision AS (
  SELECT (substr(hash,1,8)||'-'||substr(hash,9,4)||'-5'||substr(hash,14,3)||'-8'||substr(hash,18,3)||'-'||substr(hash,21,12))::uuid id FROM fingerprint
 )
 SELECT jsonb_build_object('version','clock-workday-source.v2','generatedAt',statement_timestamp(),
  'sourceMode','continuous','revision',rev.id,'rulesVersion','declared-intervals.v2',
  'site',(SELECT jsonb_build_object('key',external_key,'label',label) FROM site),
  'timezone',(SELECT timezone FROM site),'nominalReadAllowed',a.nominal,
  'filters',jsonb_build_object('from',b.from_day,'to',b.to_day,'anchoredToLatest',p_from IS NULL),
  'context',jsonb_build_object('from',b.from_day-1,'to',b.to_day+1,'recordCount',cc.records,
   'eventCount',(SELECT count(*) FROM payloads WHERE placeable),'observationCount',(SELECT count(*) FROM payloads WHERE NOT placeable)),
  'collection',jsonb_build_object('status',CASE WHEN NOT EXISTS(SELECT 1 FROM source_rows) THEN 'no_data' ELSE 'continuous_receipts' END,
   'sourceComplete',i.complete,'captureCount',(SELECT count(*) FROM captures),'receiptCount',(SELECT count(*) FROM receipts),
   'batchCount',(SELECT count(*) FROM batches),'lastReceiptAt',(SELECT max(received_at) FROM receipts),
   'periodCoverageCertified',false,'automaticCollectorVerified',false),
  'events',(SELECT coalesce(jsonb_agg(payload ORDER BY event_ref),'[]'::jsonb) FROM payloads WHERE placeable),
  'observations',(SELECT coalesce(jsonb_agg(payload ORDER BY event_ref),'[]'::jsonb) FROM payloads WHERE NOT placeable)),
  EXISTS(SELECT 1 FROM binding),EXISTS(SELECT 1 FROM site),i.complete,i.device_context,
  EXISTS(SELECT 1 FROM source_conflicts) OR EXISTS(SELECT 1 FROM projection_missing),cc.records
 INTO answer,binding_ok,site_ok,complete_ok,device_ok,conflict_found,window_count
 FROM bounds b CROSS JOIN access a CROSS JOIN integrity i CROSS JOIN context_count cc CROSS JOIN revision rev;

 IF NOT binding_ok THEN RAISE EXCEPTION 'ATTENDANCE_BINDING_REQUIRED';END IF;
 IF NOT site_ok THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_SITE_NOT_FOUND';END IF;
 IF NOT complete_ok THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE';END IF;
 IF NOT device_ok THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_DEVICE_CONTEXT_INVALID';END IF;
 IF conflict_found THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_SOURCE_CONFLICT';END IF;
 IF window_count>25000 THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE';END IF;
 IF p_snapshot IS NOT NULL AND p_snapshot::text IS DISTINCT FROM answer->>'revision' THEN
  RAISE EXCEPTION 'ATTENDANCE_CAPTURE_CHANGED';
 END IF;
 RETURN answer;
END $$;
REVOKE ALL ON FUNCTION public.attendance_clock_workday_source_v2(text,uuid,integer,text,uuid,uuid,text,date,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_clock_workday_source_v2(text,uuid,integer,text,uuid,uuid,text,date,date,uuid) TO municontrol_actions_runtime_app;
