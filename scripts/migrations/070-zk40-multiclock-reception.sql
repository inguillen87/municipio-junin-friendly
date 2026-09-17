-- MuniControl 4.2: opt-in, device-bound reception. Existing PM10 receiver is untouched.
-- Legacy pm10-named source tables are already scoped by tenant/device/connector.
CREATE TABLE public.attendance_zk40_enrollment(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,device_id uuid NOT NULL,connector_id uuid NOT NULL,
 site_id uuid NOT NULL,serial_number text NOT NULL CHECK(serial_number~'^[A-Za-z0-9-]{6,64}$'),
 protocol_profile text NOT NULL CHECK(protocol_profile='zk40-readonly.v1'),
 source_evidence_sha256 text NOT NULL CHECK(source_evidence_sha256~'^[a-f0-9]{64}$'),
 capture_evidence_sha256 text NOT NULL CHECK(capture_evidence_sha256~'^[a-f0-9]{64}$'),
 enrolled_by_email text NOT NULL REFERENCES public.internal_users(email),enrolled_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(device_id),UNIQUE(connector_id),
 FOREIGN KEY(device_id,tenant_id) REFERENCES public.attendance_device(id,tenant_id),
 FOREIGN KEY(connector_id,tenant_id) REFERENCES public.attendance_connector(id,tenant_id),
 FOREIGN KEY(site_id,tenant_id) REFERENCES public.attendance_marking_site(id,tenant_id)
);
ALTER TABLE public.attendance_zk40_enrollment ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.attendance_zk40_enrollment FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER zk40_enrollment_immutable BEFORE UPDATE OR DELETE ON public.attendance_zk40_enrollment FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
-- Clone only the exact, already audited reception engine. Fail on prerequisite drift.
-- This reuses source bytes, checksum, duplicate, identity and isolation safeguards.
DO $upgrade$ DECLARE src text;old text;replacement text; BEGIN
 src:=pg_get_functiondef('public.attendance_pm10_receive_v1(text,text,jsonb,text)'::regprocedure);
 IF encode(digest(src,'sha256'),'hex')<>'d31cb1b717def6204c8fcfcef25101d12ae9843473ea181e42b0fc9377589b13' THEN RAISE EXCEPTION 'ZK40_PREREQUISITE_DRIFT';END IF;
 src:=replace(src,'FUNCTION public.attendance_pm10_receive_v1','FUNCTION public.attendance_zk40_receive_v1');
 old:='d.serial_number IS DISTINCT FROM ''CQTU225360168''';
 replacement:='NOT EXISTS(SELECT 1 FROM public.attendance_zk40_enrollment e WHERE e.tenant_id=c.tenant_id AND e.device_id=d.id AND e.connector_id=c.id AND e.serial_number=d.serial_number AND e.site_id=d.site_id AND e.protocol_profile=''zk40-readonly.v1'')';
 IF (length(src)-length(replace(src,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'ZK40_PROFILE_PATCH_DRIFT';END IF;src:=replace(src,old,replacement);
 old:=' OR s.external_key<>''pm-10''';IF (length(src)-length(replace(src,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'ZK40_SITE_PATCH_DRIFT';END IF;src:=replace(src,old,'');
 src:=replace(replace(replace(replace(src,'PM10_','ZK40_'),'pm10-delivery.v1','zk40-delivery.v1'),'pm10-v1:','zk40-v1:'),'pm10.receive','zk40.receive');
 old:='''version'',''pm10-receipt.v1'',''receiptId''';replacement:='''version'',''zk40-receipt.v1'',''serial'',d.serial_number,''receiptId''';
 IF (length(src)-length(replace(src,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'ZK40_RECEIPT_PATCH_DRIFT';END IF;src:=replace(src,old,replacement);
 EXECUTE src;
END $upgrade$;
REVOKE ALL ON FUNCTION public.attendance_zk40_receive_v1(text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_zk40_receive_v1(text,text,jsonb,text) TO municontrol_actions_runtime_app;
CREATE TRIGGER zk40_enrollment_no_truncate BEFORE TRUNCATE ON public.attendance_zk40_enrollment FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE OR REPLACE FUNCTION public.attendance_clock_fleet_v1(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb;rows jsonb;BEGIN
 ctx:=attendance_gateway_assert_session_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 ctx:=attendance_gateway_assert_actor_v1(ctx,'attendance.read');
 SELECT coalesce(jsonb_agg(jsonb_build_object('siteKey',s.external_key,'label',s.label,'deviceId',d.id,'model',d.model,
  'deviceState',d.status,'connectorState',coalesce(c.status,'not_configured'),'enrolled',e.id IS NOT NULL OR d.serial_number='CQTU225360168',
  'lastReceivedAt',q.last_received,'lastCapturedAt',q.last_captured,'receipts',q.receipts,'recordsConfirmed',q.records,
  'newCanonical',q.new_canonical,'observations',q.observations,'duplicates',q.duplicates,'canConsult',q.receipts>0 OR baseline.records>0)
  ORDER BY s.label,d.external_key),'[]'::jsonb) INTO rows
 FROM attendance_marking_site s JOIN attendance_device d ON d.tenant_id=s.tenant_id AND d.site_id=s.id
 LEFT JOIN attendance_connector c ON c.tenant_id=d.tenant_id AND c.device_id=d.id
 LEFT JOIN attendance_zk40_enrollment e ON e.tenant_id=d.tenant_id AND e.device_id=d.id AND e.connector_id=c.id
 LEFT JOIN LATERAL(SELECT max(received_at) last_received,max(captured_at) last_captured,count(*) receipts,coalesce(sum(record_count),0) records,
  coalesce(sum((result->>'newCanonical')::bigint),0) new_canonical,coalesce(sum((result->>'observed')::bigint),0) observations,
  coalesce(sum((result->>'duplicates')::bigint),0) duplicates FROM attendance_pm10_receipt r WHERE r.tenant_id=p_tenant AND r.device_id=d.id AND (c.id IS NULL OR r.connector_id=c.id))q ON true
 LEFT JOIN LATERAL(SELECT count(*) records FROM attendance_clock_snapshot b WHERE b.tenant_id=p_tenant AND b.device_id=d.id)baseline ON true
 WHERE s.tenant_id=p_tenant AND d.driver_key='zk40-snapshot.v1';
 RETURN jsonb_build_object('version','clock-fleet.v1','checkedAt',clock_timestamp(),'devices',rows,'liveConnectionVerified',false,'payrollModified',false);
END $$;
REVOKE ALL ON FUNCTION public.attendance_clock_fleet_v1(text,uuid,integer,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_clock_fleet_v1(text,uuid,integer,text,uuid,uuid) TO municontrol_actions_runtime_app;
