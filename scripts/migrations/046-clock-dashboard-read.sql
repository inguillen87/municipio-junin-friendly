-- Additive authenticated read. Original captures, identities and payroll remain unchanged.
CREATE OR REPLACE FUNCTION public.attendance_clock_dashboard_v2(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_site text DEFAULT 'pm-10',p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_page integer DEFAULT 1,p_size integer DEFAULT 50,p_search text DEFAULT '',p_identity text DEFAULT 'all',p_hour integer DEFAULT NULL,p_snapshot uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
DECLARE result jsonb;cap attendance_clock_snapshot%ROWTYPE;selected_site_id uuid;nominal boolean;from_day date;to_day date;rows_value jsonb;daily_value jsonb;hourly_value jsonb;heat_value jsonb;codes_value jsonb;device_value jsonb;total_count bigint;people_count bigint;mapped_count bigint;unlinked_people bigint;search_value text;
BEGIN
 result:=attendance_clock_operations_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_site,p_from,p_to,p_page,p_size);
 IF p_search IS NULL OR length(p_search)>120 OR p_search ~ '[[:cntrl:]]' OR p_identity IS NULL OR p_identity NOT IN ('all','mapped','unmapped') OR (p_hour IS NOT NULL AND p_hour NOT BETWEEN 0 AND 23) THEN RAISE EXCEPTION 'ATTENDANCE_OPERATIONS_QUERY_INVALID';END IF;
 nominal:=coalesce((result->>'nominalReadAllowed')::boolean,false);search_value:=btrim(p_search);
 IF search_value<>'' AND NOT nominal THEN RAISE EXCEPTION 'ATTENDANCE_CAPABILITY_REQUIRED';END IF;
 IF result->'site'='null'::jsonb THEN
  IF p_snapshot IS NOT NULL THEN RAISE EXCEPTION 'ATTENDANCE_CAPTURE_CHANGED';END IF;
  RETURN result||jsonb_build_object('dashboard',jsonb_build_object('version','clock-dashboard.v2','snapshotId',NULL,'filters',jsonb_build_object('search',search_value,'identity',p_identity,'hour',p_hour),'periodSummary',result->'summary','heatmap','[]'::jsonb,'codes','[]'::jsonb,'device',NULL,'unlinkedPeople',0));
 END IF;
 SELECT id INTO selected_site_id FROM attendance_marking_site WHERE tenant_id=p_tenant AND external_key=p_site;
 SELECT cs.* INTO cap FROM attendance_clock_snapshot cs JOIN attendance_device d ON d.id=cs.device_id AND d.tenant_id=cs.tenant_id WHERE cs.tenant_id=p_tenant AND d.site_id=selected_site_id ORDER BY cs.captured_at DESC,cs.id DESC LIMIT 1;
 IF (p_snapshot IS NOT NULL AND p_snapshot IS DISTINCT FROM cap.id) OR (result#>>'{collection,capturedAt}')::timestamptz IS DISTINCT FROM cap.captured_at THEN RAISE EXCEPTION 'ATTENDANCE_CAPTURE_CHANGED';END IF;
 from_day:=(result#>>'{filters,from}')::date;to_day:=(result#>>'{filters,to}')::date;
 SELECT jsonb_build_object('model',d.model,'serial',d.serial_number,'firmware',d.firmware_version,'metadataAvailable',d.serial_number IS NOT NULL AND d.firmware_version IS NOT NULL,'automaticCollectorVerified',false) INTO device_value FROM attendance_device d WHERE d.id=cap.device_id AND d.tenant_id=p_tenant;
 WITH filtered AS MATERIALIZED (
  SELECT r.ordinal,r.occurred_at,r.local_timestamp,r.identity_hmac,r.verification_code,r.punch_code,coalesce(cp.reconciliation_state,'unmapped') identity_state,coalesce(cp.review_state,'pending') review_state,
  CASE WHEN nominal AND pi.full_name IS NOT NULL THEN pi.full_name ELSE 'Persona '||upper(substr(encode(digest(r.identity_hmac::text,'sha256'),'hex'),1,8)) END person_label,CASE WHEN nominal THEN ec.legacy_legajo ELSE NULL END legajo
  FROM attendance_clock_snapshot_row r LEFT JOIN attendance_canonical_punch cp ON cp.raw_event_id=r.raw_event_id AND cp.tenant_id=r.tenant_id LEFT JOIN employment_contract ec ON ec.id=cp.employment_contract_id LEFT JOIN person_identity pi ON pi.id=ec.person_id
  WHERE r.snapshot_id=cap.id AND r.tenant_id=p_tenant AND cardinality(r.issue_codes)=0 AND r.local_timestamp>=from_day AND r.local_timestamp<to_day+1
  AND (p_identity='all' OR (p_identity='mapped' AND cp.reconciliation_state='mapped') OR (p_identity='unmapped' AND coalesce(cp.reconciliation_state,'unmapped')<>'mapped'))
  AND (p_hour IS NULL OR extract(hour FROM r.local_timestamp)::integer=p_hour)
  AND (search_value='' OR strpos(lower(coalesce(pi.full_name,'')),lower(search_value))>0 OR strpos(coalesce(ec.legacy_legajo::text,''),search_value)>0)
 ),pages AS (SELECT * FROM filtered ORDER BY occurred_at DESC,ordinal DESC LIMIT p_size OFFSET (p_page-1)::bigint*p_size),days AS (SELECT local_timestamp::date day_key,count(*) marks,count(DISTINCT identity_hmac) people FROM filtered GROUP BY 1),hours AS (SELECT extract(hour FROM local_timestamp)::integer hour_key,count(*) marks FROM filtered GROUP BY 1),heat AS (SELECT extract(isodow FROM local_timestamp)::integer weekday_key,extract(hour FROM local_timestamp)::integer hour_key,count(*) marks FROM filtered GROUP BY 1,2),codes AS (SELECT punch_code,count(*) marks FROM filtered GROUP BY 1)
 SELECT count(*),count(DISTINCT identity_hmac),count(*) FILTER(WHERE identity_state='mapped'),count(DISTINCT identity_hmac) FILTER(WHERE identity_state<>'mapped'),
 (SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',ordinal,'occurredAt',occurred_at,'personLabel',person_label,'legajo',legajo,'identityState',identity_state,'reviewState',review_state,'method','unknown','direction','unknown','verificationCode',verification_code,'punchCode',punch_code) ORDER BY occurred_at DESC,ordinal DESC),'[]'::jsonb) FROM pages),
 (SELECT coalesce(jsonb_agg(jsonb_build_object('day',day_key,'marks',marks,'people',people) ORDER BY day_key),'[]'::jsonb) FROM days),
 (SELECT coalesce(jsonb_agg(jsonb_build_object('hour',hour_key,'marks',marks) ORDER BY hour_key),'[]'::jsonb) FROM hours),
 (SELECT coalesce(jsonb_agg(jsonb_build_object('weekday',weekday_key,'hour',hour_key,'marks',marks) ORDER BY weekday_key,hour_key),'[]'::jsonb) FROM heat),
 (SELECT coalesce(jsonb_agg(jsonb_build_object('code',punch_code,'marks',marks) ORDER BY punch_code),'[]'::jsonb) FROM codes)
 INTO total_count,people_count,mapped_count,unlinked_people,rows_value,daily_value,hourly_value,heat_value,codes_value FROM filtered;
 RETURN result||jsonb_build_object('records',rows_value,'daily',daily_value,'hourly',hourly_value,'summary',(result->'summary')||jsonb_build_object('marks',total_count,'people',people_count,'mappedMarks',mapped_count,'unmappedMarks',total_count-mapped_count),'pagination',jsonb_build_object('page',p_page,'pageSize',p_size,'total',total_count,'pages',ceil(total_count::numeric/p_size)),'dashboard',jsonb_build_object('version','clock-dashboard.v2','snapshotId',cap.id,'filters',jsonb_build_object('search',search_value,'identity',p_identity,'hour',p_hour),'periodSummary',result->'summary','heatmap',heat_value,'codes',codes_value,'device',device_value,'unlinkedPeople',unlinked_people));
END $function$;
REVOKE ALL ON FUNCTION public.attendance_clock_dashboard_v2(text,uuid,integer,text,uuid,uuid,text,date,date,integer,integer,text,text,integer,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_clock_dashboard_v2(text,uuid,integer,text,uuid,uuid,text,date,date,integer,integer,text,text,integer,uuid) TO municontrol_actions_runtime_app;
