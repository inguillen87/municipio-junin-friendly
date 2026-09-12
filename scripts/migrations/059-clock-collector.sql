-- 059: autonomous collector boundary. Additive, no activation and no payroll changes.
-- Device communication remains on the municipal host; this accepts bounded records only.
CREATE TABLE IF NOT EXISTS attendance_collector_policy (
 connector_id uuid PRIMARY KEY REFERENCES attendance_connector(id),
 enabled boolean NOT NULL DEFAULT false,
 accept_from date NOT NULL,
 last_contact_at timestamptz,
 last_read_at timestamptz,
 last_state text NOT NULL DEFAULT 'not_installed' CHECK(last_state IN ('not_installed','read_ok','device_offline','blocked','spool_full')),
 pending_records integer NOT NULL DEFAULT 0 CHECK(pending_records BETWEEN 0 AND 200000),
 last_source_sha256 char(64),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS attendance_collector_receipt (
 connector_id uuid NOT NULL REFERENCES attendance_connector(id),
 request_id uuid NOT NULL,
 input_sha256 char(64) NOT NULL CHECK(input_sha256 ~ '^[a-f0-9]{64}$'),
 received_at timestamptz NOT NULL DEFAULT now(),
 receipt jsonb NOT NULL,
 PRIMARY KEY(connector_id,request_id)
);
CREATE TABLE IF NOT EXISTS attendance_collector_record (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 device_id uuid NOT NULL,
 connector_id uuid NOT NULL,
 record_sha256 char(64) NOT NULL,
 raw_record bytea NOT NULL CHECK(octet_length(raw_record)=40),
 source_sha256 char(64) NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 captured_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 local_timestamp timestamp,
 raw_event_id uuid,
 issue_code text,
 CHECK(record_sha256=encode(digest(raw_record,'sha256'),'hex')),
 CHECK(issue_code IS NULL OR issue_code IN ('invalid_identity','invalid_date','future_date','before_activation')),
 UNIQUE(device_id,record_sha256),
 FOREIGN KEY(device_id,tenant_id) REFERENCES attendance_device(id,tenant_id),
 FOREIGN KEY(connector_id,tenant_id) REFERENCES attendance_connector(id,tenant_id),
 FOREIGN KEY(raw_event_id,tenant_id) REFERENCES attendance_raw_event(id,tenant_id)
);
CREATE INDEX IF NOT EXISTS attendance_collector_receipt_time_ix ON attendance_collector_receipt(connector_id,received_at DESC);
CREATE INDEX IF NOT EXISTS attendance_collector_record_time_ix ON attendance_collector_record(tenant_id,device_id,received_at DESC,id DESC);
REVOKE ALL ON attendance_collector_policy,attendance_collector_receipt,attendance_collector_record FROM PUBLIC,municontrol_actions_runtime_app;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='attendance_collector_record_immutable') THEN
 CREATE TRIGGER attendance_collector_record_immutable BEFORE UPDATE OR DELETE ON attendance_collector_record FOR EACH ROW EXECUTE FUNCTION attendance_gateway_reject_change_v1(); END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='attendance_collector_receipt_immutable') THEN
 CREATE TRIGGER attendance_collector_receipt_immutable BEFORE UPDATE OR DELETE ON attendance_collector_receipt FOR EACH ROW EXECUTE FUNCTION attendance_gateway_reject_change_v1(); END IF;
END $$;

CREATE OR REPLACE FUNCTION attendance_collector_receive_v1(p_token_hash text,p_text text,p_release text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 j jsonb; c attendance_connector%ROWTYPE; d attendance_device%ROWTYPE; s attendance_marking_site%ROWTYPE;
 p attendance_collector_policy%ROWTYPE; b platform_tenant_source_binding%ROWTYPE; old attendance_collector_receipt%ROWTYPE;
 rid uuid; input_hash text; captured timestamptz; bytes bytea; rh text; key_bytes bytea; doc_bytes bytea; doc text; zp integer;
 v bigint; ss integer; mm integer; hh integer; dy integer; mo integer; yr integer; lt timestamp; et timestamptz; ih text;
 issue text; rawid uuid; im uuid; ec uuid; matches integer; event_key text; event_json jsonb; batchid uuid;
 inserted integer:=0; duplicates integer:=0; observed integer:=0; unmapped integer:=0; bid uuid; result jsonb; x jsonb;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash!~'^[a-f0-9]{64}$' OR p_text IS NULL OR octet_length(p_text)>90000 OR p_release IS NULL OR p_release!~'^[a-f0-9]{40}$' THEN RAISE EXCEPTION 'COLLECTOR_INVALID'; END IF;
 j:=p_text::jsonb;
 IF NOT attendance_gateway_json_keys_exact_v1(j,ARRAY['version','kind','requestId','connectorKey','serial','readAt','sourceSha256','state','pendingRecords','records'])
 OR j->>'version' IS DISTINCT FROM 'clock-collector.v1'
 OR jsonb_typeof(j->'kind') IS DISTINCT FROM 'string' OR j->>'kind' NOT IN ('batch','heartbeat')
 OR jsonb_typeof(j->'requestId') IS DISTINCT FROM 'string' OR j->>'requestId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 OR jsonb_typeof(j->'serial') IS DISTINCT FROM 'string' OR j->>'serial'!~'^[A-Za-z0-9-]{4,64}$'
 OR jsonb_typeof(j->'connectorKey') IS DISTINCT FROM 'string'
 OR jsonb_typeof(j->'sourceSha256') NOT IN ('string','null') OR (j->>'sourceSha256' IS NOT NULL AND j->>'sourceSha256'!~'^[a-f0-9]{64}$')
 OR jsonb_typeof(j->'readAt') NOT IN ('string','null') OR (j->>'readAt' IS NOT NULL AND j->>'readAt'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$')
 OR jsonb_typeof(j->'records') IS DISTINCT FROM 'array' OR jsonb_array_length(j->'records')>500
 OR jsonb_typeof(j->'state') IS DISTINCT FROM 'string' OR j->>'state' NOT IN ('read_ok','device_offline','blocked','spool_full')
 OR jsonb_typeof(j->'pendingRecords') IS DISTINCT FROM 'number' OR j->>'pendingRecords'!~'^[0-9]{1,6}$' OR (j->>'pendingRecords')::integer>200000
 OR j->>'connectorKey'!~'^[a-z0-9][a-z0-9._-]{7,127}$' THEN RAISE EXCEPTION 'COLLECTOR_INVALID'; END IF;
 rid:=(j->>'requestId')::uuid;
 IF rid IS NULL THEN RAISE EXCEPTION 'COLLECTOR_INVALID'; END IF;
 SELECT * INTO c FROM attendance_connector WHERE external_key=j->>'connectorKey' AND token_sha256=p_token_hash AND status='active' FOR UPDATE NOWAIT;
 IF NOT FOUND OR c.status<>'active' OR c.token_sha256 IS DISTINCT FROM p_token_hash THEN RAISE EXCEPTION 'COLLECTOR_AUTH_REQUIRED'; END IF;
 SELECT * INTO p FROM attendance_collector_policy WHERE connector_id=c.id FOR UPDATE;
 IF NOT FOUND OR NOT p.enabled THEN RAISE EXCEPTION 'COLLECTOR_NOT_ENABLED'; END IF;
 SELECT * INTO d FROM attendance_device WHERE id=c.device_id AND tenant_id=c.tenant_id FOR SHARE;
 SELECT * INTO s FROM attendance_marking_site WHERE id=d.site_id AND tenant_id=c.tenant_id FOR SHARE;
 IF d.id IS NULL OR s.id IS NULL OR d.status<>'active' OR s.status<>'active' OR d.driver_key<>'zk40-snapshot.v1' OR c.driver_key<>d.driver_key
 OR d.serial_number IS DISTINCT FROM j->>'serial' OR d.timezone IS DISTINCT FROM s.timezone THEN RAISE EXCEPTION 'COLLECTOR_DEVICE_MISMATCH'; END IF;
 SELECT sb.* INTO b FROM tenant_identity_policy pol JOIN platform_tenant_source_binding sb ON sb.id=pol.certified_source_binding_id AND sb.tenant_id=pol.tenant_id AND sb.verified
 WHERE pol.tenant_id=c.tenant_id AND pol.tenant_data_plane_ready AND pol.certified_release_sha=p_release FOR SHARE OF pol,sb;
 IF NOT FOUND THEN RAISE EXCEPTION 'COLLECTOR_SOURCE_NOT_READY'; END IF;
 input_hash:=encode(digest(convert_to(p_text,'UTF8'),'sha256'),'hex');
 IF j->>'kind'='batch' THEN
  SELECT * INTO old FROM attendance_collector_receipt WHERE connector_id=c.id AND request_id=rid;
  IF FOUND THEN IF old.input_sha256<>input_hash THEN RAISE EXCEPTION 'COLLECTOR_REPLAY_CONFLICT';END IF;
   RETURN old.receipt||jsonb_build_object('replayed',true);END IF;
 END IF;
 captured:=(j->>'readAt')::timestamptz;
 IF captured IS NOT NULL AND (captured>now()+interval '5 minutes' OR captured<TIMESTAMPTZ '2000-01-01') THEN RAISE EXCEPTION 'COLLECTOR_INVALID';END IF;
 IF j->>'state'='read_ok' AND (captured IS NULL OR j->>'sourceSha256' IS NULL OR j->>'sourceSha256'!~'^[a-f0-9]{64}$') THEN RAISE EXCEPTION 'COLLECTOR_INVALID';END IF;
 IF j->>'kind'='heartbeat' THEN
  IF jsonb_array_length(j->'records')<>0 THEN RAISE EXCEPTION 'COLLECTOR_INVALID'; END IF;
  -- Recent receipt is not proof of physical presence. Keep device-read time separately.
  UPDATE attendance_collector_policy SET last_contact_at=now(),last_read_at=greatest(last_read_at,captured),last_state=j->>'state',pending_records=(j->>'pendingRecords')::integer,
    last_source_sha256=CASE WHEN captured IS NOT NULL AND (last_read_at IS NULL OR captured>=last_read_at) THEN j->>'sourceSha256' ELSE last_source_sha256 END,updated_at=now() WHERE connector_id=c.id;
  RETURN jsonb_build_object('version','clock-collector-receipt.v1','requestId',rid,'inputSha256',input_hash,'accepted',0,'duplicates',0,'observed',0,'received',0,'replayed',false);
 END IF;
 IF (SELECT count(*) FROM attendance_collector_receipt WHERE connector_id=c.id AND received_at>now()-interval '1 minute')>=60 THEN RAISE EXCEPTION 'COLLECTOR_RATE_LIMIT';END IF;
 IF jsonb_array_length(j->'records')<1 OR j->>'state'<>'read_ok' OR captured IS NULL THEN RAISE EXCEPTION 'COLLECTOR_INVALID'; END IF;
 SELECT secret INTO key_bytes FROM attendance_clock_identity_key WHERE tenant_id=c.tenant_id;
 IF key_bytes IS NULL THEN RAISE EXCEPTION 'COLLECTOR_IDENTITY_KEY_REQUIRED'; END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(j->'records') LOOP
  IF jsonb_typeof(x)<>'string' OR (x#>>'{}')!~'^[a-f0-9]{80}$' THEN RAISE EXCEPTION 'COLLECTOR_INVALID'; END IF;
  bytes:=decode(x#>>'{}','hex');rh:=encode(digest(bytes,'sha256'),'hex');
  -- Preserve the initial snapshot; never create a second fact for the same raw record.
  IF EXISTS(SELECT 1 FROM attendance_clock_snapshot_row r JOIN attendance_clock_snapshot sn ON sn.id=r.snapshot_id AND sn.tenant_id=r.tenant_id WHERE r.tenant_id=c.tenant_id AND sn.device_id=d.id AND r.raw_record_sha256=rh)
   OR EXISTS(SELECT 1 FROM attendance_collector_record WHERE tenant_id=c.tenant_id AND device_id=d.id AND record_sha256=rh) THEN duplicates:=duplicates+1;CONTINUE;END IF;
  issue:=NULL;lt:=NULL;rawid:=NULL;doc_bytes:=substring(bytes FROM 3 FOR 24);zp:=position(decode('00','hex') IN doc_bytes);
  IF zp>0 THEN doc_bytes:=substring(doc_bytes FROM 1 FOR zp-1); END IF;
  BEGIN doc:=convert_from(doc_bytes,'UTF8');IF doc!~'^[0-9]{6,8}$' THEN issue:='invalid_identity';END IF;EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN issue:='invalid_identity';doc:=''; END;
  v:=get_byte(bytes,27)+get_byte(bytes,28)*256+get_byte(bytes,29)*65536+get_byte(bytes,30)::bigint*16777216;
  ss:=(v%60)::int;v:=v/60;mm:=(v%60)::int;v:=v/60;hh:=(v%24)::int;v:=v/24;dy:=(v%31)::int+1;v:=v/31;mo:=(v%12)::int+1;yr:=(v/12)::int+2000;
  BEGIN lt:=make_timestamp(yr,mo,dy,hh,mm,ss); EXCEPTION WHEN datetime_field_overflow THEN issue:=coalesce(issue,'invalid_date'); END;
  IF lt IS NOT NULL THEN et:=lt AT TIME ZONE s.timezone;
   IF et>captured+interval '5 minutes' THEN issue:=coalesce(issue,'future_date');
   ELSIF lt::date<p.accept_from THEN issue:=coalesce(issue,'before_activation');END IF;
  END IF;
  IF issue IS NULL THEN
   ih:=encode(hmac(convert_to('clock-v1:'||c.tenant_id||':'||doc,'UTF8'),key_bytes,'sha256'),'hex');
   event_key:='zk40-v1:'||lower(d.serial_number)||':'||rh;
   SELECT re.id INTO rawid FROM attendance_raw_event re WHERE re.device_id=d.id AND re.event_key='zk40-v1:'||lower(d.serial_number)||':'||rh;
   IF rawid IS NOT NULL THEN duplicates:=duplicates+1;CONTINUE;END IF;
   IF batchid IS NULL THEN
    batchid:=gen_random_uuid();INSERT INTO attendance_ingest_batch(id,tenant_id,connector_id,device_id,batch_key,payload_sha256,release_sha,status,event_count,accepted_count,duplicate_count,unmapped_count,ambiguous_count)
    VALUES(batchid,c.tenant_id,c.id,d.id,'collector:'||rid,input_hash,p_release,'accepted',1,1,0,0,0);
   END IF;
   -- Only a previously approved, date-valid identity map is used. No inferred identity grants.
   SELECT count(*),min(imap.id::text)::uuid,min(imap.employment_contract_id::text)::uuid INTO matches,im,ec FROM attendance_identity_map imap
    JOIN employment_contract contract ON contract.id=imap.employment_contract_id AND contract.source_system=b.source_system AND contract.legacy_company_id=b.source_company_id
    JOIN source_import_batch ib ON ib.id=contract.source_batch_id AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL
    WHERE imap.tenant_id=c.tenant_id AND imap.device_id=d.id AND imap.identity_hmac_sha256=ih AND imap.status='active' AND imap.valid_from<=lt::date AND (imap.valid_to IS NULL OR imap.valid_to>=lt::date)
     AND contract.start_date<=lt::date AND (contract.end_date IS NULL OR contract.end_date>=lt::date) AND contract.status IN ('active','inactive');
   IF matches<>1 THEN im:=NULL;ec:=NULL;unmapped:=unmapped+1;END IF;
   event_json:=jsonb_build_object('eventKey',event_key,'identityHmacSha256',ih,'occurredAt',et,'method','unknown','direction','unknown','verificationResult','unknown');
   INSERT INTO attendance_raw_event(tenant_id,batch_id,connector_id,device_id,event_key,event_sha256,identity_hmac_sha256,occurred_at,method,direction,verification_result)
    VALUES(c.tenant_id,batchid,c.id,d.id,event_key,encode(digest(event_json::text,'sha256'),'hex'),ih,et,'unknown','unknown','unknown') RETURNING id INTO rawid;
   INSERT INTO attendance_canonical_punch(tenant_id,raw_event_id,site_id,device_id,identity_map_id,employment_contract_id,occurred_at,method,direction,reconciliation_state,review_state)
    VALUES(c.tenant_id,rawid,s.id,d.id,im,ec,et,'unknown','unknown',CASE WHEN im IS NULL THEN 'unmapped' ELSE 'mapped' END,'pending');inserted:=inserted+1;
  ELSE observed:=observed+1; END IF;
  INSERT INTO attendance_collector_record(tenant_id,device_id,connector_id,record_sha256,raw_record,source_sha256,captured_at,local_timestamp,raw_event_id,issue_code)
   VALUES(c.tenant_id,d.id,c.id,rh,bytes,j->>'sourceSha256',captured,lt,rawid,issue);
 END LOOP;
 IF batchid IS NOT NULL THEN UPDATE attendance_ingest_batch SET event_count=inserted,accepted_count=inserted,unmapped_count=unmapped WHERE id=batchid; END IF;
 result:=jsonb_build_object('version','clock-collector-receipt.v1','requestId',rid,'inputSha256',input_hash,'accepted',inserted,'duplicates',duplicates,'observed',observed,'received',jsonb_array_length(j->'records'),'replayed',false);
 INSERT INTO attendance_collector_receipt(connector_id,request_id,input_sha256,receipt) VALUES(c.id,rid,input_hash,result);
 UPDATE attendance_connector SET last_accepted_at=now() WHERE id=c.id;
 UPDATE attendance_collector_policy SET last_contact_at=now(),last_read_at=greatest(last_read_at,captured),last_state='read_ok',pending_records=(j->>'pendingRecords')::int,
  last_source_sha256=CASE WHEN last_read_at IS NULL OR captured>=last_read_at THEN j->>'sourceSha256' ELSE last_source_sha256 END,updated_at=now() WHERE connector_id=c.id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION attendance_collector_receive_v1(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION attendance_collector_receive_v1(text,text,text) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION attendance_collector_status_v1(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_site text DEFAULT 'pm-10')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb;s attendance_marking_site%ROWTYPE;c attendance_connector%ROWTYPE;p attendance_collector_policy%ROWTYPE; recent jsonb;totals jsonb;
BEGIN
 ctx:=attendance_gateway_assert_session_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 ctx:=attendance_gateway_assert_actor_v1(ctx,'attendance.read');
 IF p_site IS NULL OR p_site!~'^[a-z0-9][a-z0-9._-]{1,95}$' THEN RAISE EXCEPTION 'ATTENDANCE_OPERATIONS_QUERY_INVALID';END IF;
 SELECT * INTO s FROM attendance_marking_site WHERE tenant_id=p_tenant AND external_key=p_site;
 SELECT co.* INTO c FROM attendance_connector co JOIN attendance_device d ON d.id=co.device_id AND d.tenant_id=co.tenant_id WHERE co.tenant_id=p_tenant AND d.site_id=s.id ORDER BY co.created_at LIMIT 1;
 SELECT * INTO p FROM attendance_collector_policy WHERE connector_id=c.id;
 SELECT jsonb_build_object('stored',count(*),'normalized',count(*) FILTER(WHERE issue_code IS NULL),'observed',count(*) FILTER(WHERE issue_code IS NOT NULL)) INTO totals FROM attendance_collector_record WHERE tenant_id=p_tenant AND device_id=c.device_id;
 SELECT coalesce(jsonb_agg(q.item ORDER BY q.id DESC),'[]'::jsonb) INTO recent FROM (
  SELECT r.id,jsonb_build_object('id',r.id::text,'localTime',to_char(r.local_timestamp,'YYYY-MM-DD HH24:MI:SS'),'receivedAt',r.received_at,'issue',r.issue_code,
    'punchCode',get_byte(r.raw_record,31),'verificationCode',get_byte(r.raw_record,26),'identityState',coalesce(cp.reconciliation_state,'unmapped')) item
  FROM attendance_collector_record r LEFT JOIN attendance_canonical_punch cp ON cp.raw_event_id=r.raw_event_id AND cp.tenant_id=r.tenant_id
  WHERE r.tenant_id=p_tenant AND r.device_id=c.device_id ORDER BY r.id DESC LIMIT 20) q;
 RETURN jsonb_build_object('version','clock-collector-status.v1','generatedAt',now(),'site',p_site,'label',s.label,
 'connectorState',coalesce(c.status,'not_registered'),'enabled',coalesce(p.enabled,false),'lastContactAt',p.last_contact_at,'lastReadAt',p.last_read_at,
 'lastBatchAt',c.last_accepted_at,'reportedState',coalesce(p.last_state,'not_installed'),'pendingReported',coalesce(p.pending_records,0),
 'captureLastAt',(SELECT max(cs.captured_at) FROM attendance_clock_snapshot cs WHERE cs.tenant_id=p_tenant AND cs.device_id=c.device_id),
 'totals',totals,'recent',recent,'payrollImpact',false);
END $$;
REVOKE ALL ON FUNCTION attendance_collector_status_v1(text,uuid,integer,text,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION attendance_collector_status_v1(text,uuid,integer,text,uuid,uuid,text) TO municontrol_actions_runtime_app;
