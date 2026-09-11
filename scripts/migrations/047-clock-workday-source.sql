-- Read-only authenticated context for deterministic workday reconstruction.
CREATE OR REPLACE FUNCTION public.attendance_clock_workday_source_v1(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_site text DEFAULT 'pm-10',p_from date DEFAULT NULL,p_to date DEFAULT NULL,p_snapshot uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public,pg_temp AS $function$
DECLARE base jsonb; cap attendance_clock_snapshot%ROWTYPE; first_day date;last_day date;nominal boolean;source_events jsonb;number_events integer;
BEGIN
 base:=attendance_clock_dashboard_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_site,p_from,p_to,1,1,'','all',NULL,p_snapshot);
 IF base#>>'{dashboard,snapshotId}' IS NULL THEN RETURN jsonb_build_object('version','clock-workday-source.v1','base',base,'events','[]'::jsonb);END IF;
 IF base#>>'{collection,status}' IS DISTINCT FROM 'operator_snapshot' OR base#>>'{collection,importComplete}' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'ATTENDANCE_CAPTURE_INCOMPLETE';END IF;
 SELECT * INTO cap FROM attendance_clock_snapshot WHERE tenant_id=p_tenant AND id=(base#>>'{dashboard,snapshotId}')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_CAPTURE_CHANGED';END IF;
 nominal:=coalesce((base->>'nominalReadAllowed')::boolean,false);
 first_day:=(base#>>'{filters,from}')::date;last_day:=(base#>>'{filters,to}')::date;
 SELECT count(*) INTO number_events FROM attendance_clock_snapshot_row WHERE tenant_id=p_tenant AND snapshot_id=cap.id AND local_timestamp >= (first_day-1)::timestamp AND local_timestamp < (last_day+2)::timestamp;
 IF number_events>25000 THEN RAISE EXCEPTION 'ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('ordinal',r.ordinal,'occurredAt',r.occurred_at,'localTimestamp',to_char(r.local_timestamp,'YYYY-MM-DD HH24:MI:SS'),
 'personKey',encode(digest('clock-person-v1:'||p_tenant||':'||r.identity_hmac,'sha256'),'hex'),
 'streamKey',encode(digest('clock-stream-v1:'||p_tenant||':'||cap.device_id||':'||r.identity_hmac||':'||coalesce(cp.employment_contract_id::text,'unmapped'),'sha256'),'hex'),
 'personLabel',CASE WHEN nominal AND pi.full_name IS NOT NULL THEN pi.full_name ELSE 'Persona '||upper(substr(encode(digest(r.identity_hmac::text,'sha256'),'hex'),1,8)) END,
 'legajo',CASE WHEN nominal THEN ec.legacy_legajo ELSE NULL END,'identityState',coalesce(cp.reconciliation_state,'unmapped'),'code',r.punch_code,'issues',r.issue_codes) ORDER BY r.occurred_at,r.ordinal),'[]'::jsonb)
 INTO source_events FROM attendance_clock_snapshot_row r
 LEFT JOIN attendance_canonical_punch cp ON cp.raw_event_id=r.raw_event_id AND cp.tenant_id=r.tenant_id
 LEFT JOIN employment_contract ec ON ec.id=cp.employment_contract_id LEFT JOIN person_identity pi ON pi.id=ec.person_id
 WHERE r.tenant_id=p_tenant AND r.snapshot_id=cap.id AND r.local_timestamp >= (first_day-1)::timestamp AND r.local_timestamp < (last_day+2)::timestamp;
 RETURN jsonb_build_object('version','clock-workday-source.v1','base',base,'events',source_events);
END $function$;
REVOKE ALL ON FUNCTION public.attendance_clock_workday_source_v1(text,uuid,integer,text,uuid,uuid,text,date,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_clock_workday_source_v1(text,uuid,integer,text,uuid,uuid,text,date,date,uuid) TO municontrol_actions_runtime_app;
