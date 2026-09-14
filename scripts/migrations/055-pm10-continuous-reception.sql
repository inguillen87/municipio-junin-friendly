-- 059.2: source-preserving incremental reception. No activation, clock or payroll writes.
CREATE TABLE IF NOT EXISTS attendance_pm10_receipt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 connector_id uuid NOT NULL, device_id uuid NOT NULL,
 batch_key char(64) NOT NULL CHECK(batch_key ~ '^[a-f0-9]{64}$'),
 part_start integer NOT NULL CHECK(part_start>=0 AND part_start%500=0),
 manifest_sha256 char(64) NOT NULL,
 request_sha256 char(64) NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 snapshot_sha256 char(64) NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 record_count integer NOT NULL CHECK(record_count BETWEEN 1 AND 500),
 total_records integer NOT NULL CHECK(total_records BETWEEN 1 AND 104857),
 records_sha256 char(64) NOT NULL CHECK(records_sha256 ~ '^[a-f0-9]{64}$'),
 records_payload bytea NOT NULL,
 source_ordinals integer[] NOT NULL,
 CHECK(octet_length(records_payload)=record_count*40),
 CHECK(cardinality(source_ordinals)=record_count),
 result jsonb NOT NULL, UNIQUE(id,tenant_id), UNIQUE(connector_id,batch_key,part_start),
 FOREIGN KEY(connector_id,tenant_id) REFERENCES attendance_connector(id,tenant_id),
 FOREIGN KEY(device_id,tenant_id) REFERENCES attendance_device(id,tenant_id)
);
CREATE TABLE IF NOT EXISTS attendance_pm10_record (
 tenant_id uuid NOT NULL, device_id uuid NOT NULL, receipt_id uuid NOT NULL,
 raw_sha256 char(64) NOT NULL CHECK(raw_sha256 ~ '^[a-f0-9]{64}$'),
 raw_record bytea NOT NULL CHECK(octet_length(raw_record)=40),
 source_ordinal integer NOT NULL CHECK(source_ordinal>0), source_sequence integer NOT NULL,
 local_timestamp timestamp, occurred_at timestamptz, identity_hmac char(64),
 verification_code integer NOT NULL CHECK(verification_code BETWEEN 0 AND 255),
 punch_code integer NOT NULL CHECK(punch_code BETWEEN 0 AND 255),
 issue_codes text[] NOT NULL DEFAULT '{}', raw_event_id uuid,
 PRIMARY KEY(device_id,raw_sha256),
 CHECK(encode(digest(raw_record,'sha256'),'hex')=raw_sha256),
 CHECK(cardinality(issue_codes)>0 OR (occurred_at IS NOT NULL AND identity_hmac IS NOT NULL AND raw_event_id IS NOT NULL)),
 FOREIGN KEY(device_id,tenant_id) REFERENCES attendance_device(id,tenant_id),
 FOREIGN KEY(receipt_id,tenant_id) REFERENCES attendance_pm10_receipt(id,tenant_id) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(raw_event_id,tenant_id) REFERENCES attendance_raw_event(id,tenant_id)
);
CREATE INDEX IF NOT EXISTS attendance_pm10_recent_idx ON attendance_pm10_record(tenant_id,device_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS attendance_pm10_receipt_recent_idx ON attendance_pm10_receipt(tenant_id,device_id,received_at DESC);
CREATE INDEX IF NOT EXISTS attendance_clock_snapshot_raw_hash_idx ON attendance_clock_snapshot_row(tenant_id,raw_record_sha256);
REVOKE ALL ON attendance_pm10_receipt,attendance_pm10_record FROM PUBLIC,municontrol_actions_runtime_app;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['attendance_pm10_receipt','attendance_pm10_record'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname=t||'_immutable') THEN
 EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION attendance_gateway_reject_change_v1()',t||'_immutable',t); END IF;
END LOOP; END $$;

CREATE OR REPLACE FUNCTION attendance_pm10_receive_v1(p_connector text,p_token_hash text,p_body jsonb,p_release text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c attendance_connector%ROWTYPE;d attendance_device%ROWTYPE;s attendance_marking_site%ROWTYPE;
 b platform_tenant_source_binding%ROWTYPE;old attendance_pm10_receipt%ROWTYPE;
 data bytea;rec bytea;db bytea;key_bytes bytea;doc text;ih text;rh text;ek text;ph text;
 captime timestamptz;lt timestamp;et timestamptz;v bigint;ss int;mi int;hh int;dd int;mm int;yy int;
 n int;part_n int;total_n int;snap_n int;ord int;prev_ord int:=0;i int;z int;issues text[];
 im uuid;ecid uuid;matches int;source_matches int;rawid uuid;bid uuid;receipt_id uuid:=gen_random_uuid();
 accepted int:=0;observed int:=0;duplicates int:=0;unmapped int:=0;ambiguous int:=0;map_state text;
 ej jsonb;answer jsonb;mh text;oldraw attendance_raw_event%ROWTYPE;
 combined_data bytea; prior_count integer; current_ordinals integer[];
BEGIN
 IF p_connector IS NULL OR p_connector !~ '^[a-z0-9][a-z0-9._-]{7,127}$'
 OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'PM10_AUTH_DENIED';END IF;
 SELECT * INTO c FROM attendance_connector WHERE external_key=p_connector FOR UPDATE NOWAIT;
 IF NOT FOUND OR c.status<>'active' OR c.token_sha256<>p_token_hash THEN RAISE EXCEPTION 'PM10_AUTH_DENIED';END IF;
 SELECT * INTO d FROM attendance_device WHERE id=c.device_id AND tenant_id=c.tenant_id FOR SHARE NOWAIT;
 IF NOT FOUND OR d.status<>'active' OR d.serial_number IS DISTINCT FROM 'CQTU225360168' OR d.driver_key<>'zk40-snapshot.v1'
 OR c.driver_key<>d.driver_key OR d.transport NOT IN('network_pull','hybrid') THEN RAISE EXCEPTION 'PM10_CONTEXT_DENIED';END IF;
 SELECT * INTO s FROM attendance_marking_site WHERE id=d.site_id AND tenant_id=c.tenant_id FOR SHARE NOWAIT;
 IF NOT FOUND OR s.status<>'active' OR s.external_key<>'pm-10' OR s.timezone<>'America/Argentina/Mendoza' OR d.timezone<>s.timezone THEN RAISE EXCEPTION 'PM10_CONTEXT_DENIED';END IF;
 SELECT sb.* INTO b FROM tenant_identity_policy p JOIN platform_tenant_source_binding sb ON sb.id=p.certified_source_binding_id AND sb.tenant_id=p.tenant_id
 JOIN platform_tenant tenant ON tenant.id=p.tenant_id AND tenant.status='active'
 WHERE p.tenant_id=c.tenant_id AND p.tenant_data_plane_ready AND sb.verified AND sb.source_system='GRH' AND p.certified_release_sha=p_release
 FOR SHARE OF p,sb,tenant NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'PM10_BINDING_REQUIRED';END IF;
 SELECT secret INTO key_bytes FROM attendance_clock_identity_key WHERE tenant_id=c.tenant_id;
 IF key_bytes IS NULL THEN RAISE EXCEPTION 'PM10_IDENTITY_KEY_REQUIRED';END IF;
 IF p_body IS NULL OR NOT coalesce(attendance_gateway_json_keys_exact_v1(p_body,ARRAY['version','serial','batchId','snapshotSha256','recordsSha256','snapshotRecordCount','totalRecords','partStart','capturedAt','partSha256','ordinals','recordsBase64']),false)
 OR p_body->>'version' IS DISTINCT FROM 'pm10-delivery.v1' OR p_body->>'serial' IS DISTINCT FROM d.serial_number
 OR jsonb_typeof(p_body->'ordinals') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PM10_PAYLOAD_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['batchId','snapshotSha256','recordsSha256','partSha256']) k WHERE jsonb_typeof(p_body->k) IS DISTINCT FROM 'string' OR (p_body->>k) !~ '^[a-f0-9]{64}$')
 OR EXISTS(SELECT 1 FROM unnest(ARRAY['snapshotRecordCount','totalRecords','partStart']) k WHERE jsonb_typeof(p_body->k) IS DISTINCT FROM 'number' OR (p_body->>k) !~ '^[0-9]{1,6}$')
 OR jsonb_typeof(p_body->'recordsBase64') IS DISTINCT FROM 'string' OR length(p_body->>'recordsBase64') NOT BETWEEN 56 AND 26668
 OR (p_body->>'recordsBase64') !~ '^[A-Za-z0-9+/]+={0,2}$'
 OR jsonb_typeof(p_body->'capturedAt') IS DISTINCT FROM 'string' OR (p_body->>'capturedAt') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN RAISE EXCEPTION 'PM10_PAYLOAD_INVALID';END IF;
 total_n:=(p_body->>'totalRecords')::integer;part_n:=(p_body->>'partStart')::integer;snap_n:=(p_body->>'snapshotRecordCount')::integer;captime:=(p_body->>'capturedAt')::timestamptz;
 data:=decode(p_body->>'recordsBase64','base64');n:=octet_length(data)/40;
 IF total_n NOT BETWEEN 1 AND 104857 OR snap_n NOT BETWEEN total_n AND 104857 OR part_n<0 OR part_n>=total_n OR part_n%500<>0
 OR octet_length(data)%40<>0 OR n<>least(500,total_n-part_n) OR n NOT BETWEEN 1 AND 500 OR jsonb_array_length(p_body->'ordinals')<>n
 OR replace(encode(data,'base64'),E'\n','')<>p_body->>'recordsBase64' OR encode(digest(data,'sha256'),'hex')<>p_body->>'partSha256'
 OR encode(digest((p_body->>'snapshotSha256')||':'||(p_body->>'recordsSha256'),'sha256'),'hex')<>p_body->>'batchId'
 OR (total_n<=500 AND (p_body->>'partSha256')<>(p_body->>'recordsSha256'))
 OR captime>clock_timestamp()+interval '5 minutes' OR captime<TIMESTAMPTZ '2000-01-01Z' THEN RAISE EXCEPTION 'PM10_PAYLOAD_INVALID';END IF;
 FOR i IN 0..n-1 LOOP
 IF jsonb_typeof(p_body->'ordinals'->i) IS DISTINCT FROM 'number' OR p_body->'ordinals'->>i !~ '^[0-9]{1,6}$' THEN RAISE EXCEPTION 'PM10_PAYLOAD_INVALID';END IF;
 ord:=(p_body->'ordinals'->>i)::int;IF ord<=prev_ord OR ord>snap_n THEN RAISE EXCEPTION 'PM10_PAYLOAD_INVALID';END IF;prev_ord:=ord;
 END LOOP;
 ph:=encode(digest(p_body::text,'sha256'),'hex');
 mh:=encode(digest((p_body-ARRAY['partStart','partSha256','ordinals','recordsBase64'])::text,'sha256'),'hex');
 -- Same device lock as initial import, so a maintenance import cannot race this receiver.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('clock-owner-import:'||c.tenant_id||':'||d.serial_number,0)) THEN RAISE EXCEPTION 'PM10_BUSY';END IF;
 SELECT * INTO old FROM attendance_pm10_receipt WHERE connector_id=c.id AND batch_key=p_body->>'batchId' AND part_start=part_n;
 IF FOUND THEN IF old.request_sha256<>ph THEN RAISE EXCEPTION 'PM10_IDEMPOTENCY_CONFLICT';END IF;RETURN old.result||'{"replayed":true}'::jsonb;END IF;
 IF EXISTS(SELECT 1 FROM attendance_pm10_receipt WHERE connector_id=c.id AND batch_key=p_body->>'batchId' AND manifest_sha256<>mh) THEN RAISE EXCEPTION 'PM10_IDEMPOTENCY_CONFLICT';END IF;
 -- A receipt confirms one committed part, never an unverified full capture.
 -- Keep its exact bytes even when all records were already known. Once every
 -- part is present, verify the declared delta hash and ordinal order together.
 SELECT array_agg(value::integer ORDER BY position) INTO current_ordinals
 FROM jsonb_array_elements_text(p_body->'ordinals') WITH ORDINALITY AS o(value,position);
 SELECT coalesce(sum(record_count),0)::integer INTO prior_count
 FROM attendance_pm10_receipt WHERE connector_id=c.id AND batch_key=p_body->>'batchId';
 IF prior_count+n>total_n THEN RAISE EXCEPTION 'PM10_IDEMPOTENCY_CONFLICT';END IF;
 IF prior_count+n=total_n THEN
   SELECT string_agg(piece,decode('','hex') ORDER BY start_at) INTO combined_data FROM (
     SELECT part_start AS start_at,records_payload AS piece
     FROM attendance_pm10_receipt WHERE connector_id=c.id AND batch_key=p_body->>'batchId'
     UNION ALL SELECT part_n,data
   ) pieces;
   IF encode(digest(combined_data,'sha256'),'hex')<>p_body->>'recordsSha256'
   OR EXISTS (
     SELECT 1 FROM (
       SELECT ordinal,lag(ordinal) OVER(ORDER BY start_at,position) AS previous_ordinal FROM (
         SELECT part_start AS start_at,u.ordinal,u.position
         FROM attendance_pm10_receipt r
         CROSS JOIN LATERAL unnest(r.source_ordinals) WITH ORDINALITY AS u(ordinal,position)
         WHERE r.connector_id=c.id AND r.batch_key=p_body->>'batchId'
         UNION ALL SELECT part_n,u.ordinal,u.position
         FROM unnest(current_ordinals) WITH ORDINALITY AS u(ordinal,position)
       ) ordered_ordinals
     ) checked_ordinals WHERE ordinal<=previous_ordinal
   ) THEN RAISE EXCEPTION 'PM10_PAYLOAD_INVALID';END IF;
 END IF;
 FOR i IN 0..n-1 LOOP
 rec:=substring(data FROM 1+i*40 FOR 40);rh:=encode(digest(rec,'sha256'),'hex');ord:=(p_body->'ordinals'->>i)::int;
 IF EXISTS(SELECT 1 FROM attendance_clock_snapshot_row sr JOIN attendance_clock_snapshot cs ON cs.id=sr.snapshot_id AND cs.tenant_id=sr.tenant_id WHERE cs.tenant_id=c.tenant_id AND cs.device_id=d.id AND sr.raw_record_sha256=rh)
 OR EXISTS(SELECT 1 FROM attendance_pm10_record r WHERE r.tenant_id=c.tenant_id AND r.device_id=d.id AND r.raw_sha256=rh) THEN duplicates:=duplicates+1;CONTINUE;END IF;
 issues:='{}';doc:=NULL;lt:=NULL;et:=NULL;ih:=NULL;rawid:=NULL;im:=NULL;ecid:=NULL;
 db:=substring(rec FROM 3 FOR 24);z:=position(decode('00','hex') IN db);IF z>0 THEN db:=substring(db FROM 1 FOR z-1);END IF;
 BEGIN doc:=convert_from(db,'UTF8');EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN issues:=array_append(issues,'identity_bytes_review');END;
 IF doc IS NULL OR doc !~ '^[0-9]{6,8}$' THEN issues:=array_append(issues,'identity_format_review');END IF;
 IF doc IS NOT NULL THEN ih:=encode(hmac(convert_to('clock-v1:'||c.tenant_id||':'||doc,'UTF8'),key_bytes,'sha256'),'hex');END IF;
 v:=get_byte(rec,27)+get_byte(rec,28)*256+get_byte(rec,29)*65536+get_byte(rec,30)::bigint*16777216;
 ss:=(v%60)::int;v:=v/60;mi:=(v%60)::int;v:=v/60;hh:=(v%24)::int;v:=v/24;dd:=(v%31)::int+1;v:=v/31;mm:=(v%12)::int+1;yy:=(v/12)::int+2000;
 BEGIN lt:=make_timestamp(yy,mm,dd,hh,mi,ss);et:=lt AT TIME ZONE s.timezone;
 EXCEPTION WHEN datetime_field_overflow THEN issues:=array_append(issues,'timestamp_invalid');END;
 IF et>captime+interval '5 minutes' THEN issues:=array_append(issues,'future_timestamp');END IF;
 IF cardinality(issues)=0 THEN
 ek:='zk40-v1:'||lower(d.serial_number)||':'||rh;
 SELECT * INTO oldraw FROM attendance_raw_event WHERE device_id=d.id AND event_key=ek;
 IF FOUND THEN
 IF oldraw.tenant_id<>c.tenant_id OR oldraw.identity_hmac_sha256<>ih OR oldraw.occurred_at<>et THEN RAISE EXCEPTION 'PM10_EVENT_CONFLICT';END IF;
 rawid:=oldraw.id;duplicates:=duplicates+1;
 ELSE
 -- Use the same transaction lock as attendance_gateway_identity_guard_v1,
 -- including identity.revoke. This also serializes automatic map creation.
 IF NOT pg_try_advisory_xact_lock(hashtextextended(
   'attendance-identity:'||c.tenant_id::text||':'||d.id::text||':'||ih,0
 )) THEN RAISE EXCEPTION 'PM10_BUSY';END IF;
 -- Revoke takes the identity row before its trigger takes the advisory lock.
 -- Never wait for that row while holding the advisory lock: NOWAIT aborts this
 -- part and releases all locks so the revocation can finish before a retry.
 -- Lock every map for this key, including revoked rows, before selecting one.
 PERFORM 1 FROM attendance_identity_map m
 WHERE m.tenant_id=c.tenant_id AND m.device_id=d.id AND m.identity_hmac_sha256=ih
 FOR SHARE OF m NOWAIT;
 SELECT count(*),min(m.id::text)::uuid,min(ec.id::text)::uuid INTO matches,im,ecid FROM attendance_identity_map m
 JOIN employment_contract ec ON ec.id=m.employment_contract_id AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 JOIN source_import_batch ib ON ib.id=ec.source_batch_id AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL
 WHERE m.tenant_id=c.tenant_id AND m.device_id=d.id AND m.identity_hmac_sha256=ih AND m.status='active' AND m.valid_from<=lt::date AND (m.valid_to IS NULL OR m.valid_to>=lt::date);
 IF matches=0 THEN
 SELECT count(*),min(ec.id::text)::uuid INTO source_matches,ecid FROM person_identity pi JOIN employment_contract ec ON ec.person_id=pi.id
 JOIN source_import_batch ib ON ib.id=ec.source_batch_id
 WHERE pi.dni=doc AND pi.identity_state IN('active','provisional') AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id AND ec.status IN('active','inactive') AND ec.start_date<=lt::date AND (ec.end_date IS NULL OR ec.end_date>=lt::date)
 AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL;
 -- Any conflicting/revoked map is kept for review, not silently overwritten.
 IF source_matches=1 AND NOT EXISTS(SELECT 1 FROM attendance_identity_map m WHERE m.tenant_id=c.tenant_id AND m.device_id=d.id AND m.identity_hmac_sha256=ih AND (m.valid_from=lt::date OR (m.valid_from<=lt::date AND (m.valid_to IS NULL OR m.valid_to>=lt::date)))) THEN
 INSERT INTO attendance_identity_map(tenant_id,device_id,identity_hmac_sha256,employment_contract_id,valid_from,valid_to,created_by_membership_id) VALUES(c.tenant_id,d.id,ih,ecid,lt::date,lt::date,c.created_by_membership_id) RETURNING id INTO im;matches:=1;
 ELSIF source_matches>1 THEN matches:=source_matches;END IF;
 END IF;
 IF matches=1 THEN map_state:='mapped';ELSIF matches>1 THEN map_state:='ambiguous';ambiguous:=ambiguous+1;im:=NULL;ecid:=NULL;ELSE map_state:='unmapped';unmapped:=unmapped+1;im:=NULL;ecid:=NULL;END IF;
 IF bid IS NULL THEN bid:=gen_random_uuid();INSERT INTO attendance_ingest_batch(id,tenant_id,connector_id,device_id,batch_key,payload_sha256,release_sha,status,event_count,accepted_count,duplicate_count,unmapped_count,ambiguous_count)
 VALUES(bid,c.tenant_id,c.id,d.id,'pm10-v1:'||(p_body->>'batchId')||':'||part_n,ph,p_release,'accepted',1,1,0,0,0);END IF;
 ej:=jsonb_build_object('eventKey',ek,'identityHmacSha256',ih,'occurredAt',et,'method','unknown','direction','unknown','verificationResult','unknown');
 INSERT INTO attendance_raw_event(tenant_id,batch_id,connector_id,device_id,event_key,event_sha256,identity_hmac_sha256,occurred_at,method,direction,verification_result)
 VALUES(c.tenant_id,bid,c.id,d.id,ek,encode(digest(ej::text,'sha256'),'hex'),ih,et,'unknown','unknown','unknown') RETURNING id INTO rawid;
 INSERT INTO attendance_canonical_punch(tenant_id,raw_event_id,site_id,device_id,identity_map_id,employment_contract_id,occurred_at,method,direction,reconciliation_state,review_state)
 VALUES(c.tenant_id,rawid,s.id,d.id,im,ecid,et,'unknown','unknown',map_state,'pending');accepted:=accepted+1;
 END IF;
 ELSE observed:=observed+1;END IF;
 INSERT INTO attendance_pm10_record(tenant_id,device_id,receipt_id,raw_sha256,raw_record,source_ordinal,source_sequence,local_timestamp,occurred_at,identity_hmac,verification_code,punch_code,issue_codes,raw_event_id)
 VALUES(c.tenant_id,d.id,receipt_id,rh,rec,ord,get_byte(rec,0)+get_byte(rec,1)*256,lt,et,ih,get_byte(rec,26),get_byte(rec,31),issues,rawid);
 END LOOP;
 IF bid IS NOT NULL THEN UPDATE attendance_ingest_batch SET event_count=accepted,accepted_count=accepted,unmapped_count=unmapped,ambiguous_count=ambiguous WHERE id=bid;END IF;
 answer:=jsonb_build_object('version','pm10-receipt.v1','receiptId',receipt_id,'batchId',p_body->>'batchId','partStart',part_n,'partSha256',p_body->>'partSha256','snapshotSha256',p_body->>'snapshotSha256','count',n,'newCanonical',accepted,'observed',observed,'duplicates',duplicates,'receivedAt',clock_timestamp(),'persisted',true,'payrollModified',false,'replayed',false);
 INSERT INTO attendance_pm10_receipt(id,tenant_id,connector_id,device_id,batch_key,part_start,manifest_sha256,request_sha256,snapshot_sha256,captured_at,record_count,total_records,records_sha256,records_payload,source_ordinals,result)
 VALUES(receipt_id,c.tenant_id,c.id,d.id,p_body->>'batchId',part_n,mh,ph,p_body->>'snapshotSha256',captime,n,total_n,p_body->>'recordsSha256',data,current_ordinals,answer);
 UPDATE attendance_connector SET last_accepted_at=clock_timestamp() WHERE id=c.id;
 INSERT INTO attendance_gateway_audit_event(tenant_id,target_kind,target_id,actor_kind,connector_id,release_sha,command,idempotency_key,command_hash,before_snapshot,after_snapshot,result)
 VALUES(c.tenant_id,'device',d.id,'connector',c.id,p_release,'pm10.receive',receipt_id,ph,'{}',jsonb_build_object('recordCount',n),answer);
 RETURN answer;
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'PM10_BUSY';
END $$;
REVOKE ALL ON FUNCTION attendance_pm10_receive_v1(text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION attendance_pm10_receive_v1(text,text,jsonb,text) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION attendance_pm10_receipt_status_v1(p_email text,p_session uuid,p_version int,p_release text,p_tenant uuid,p_membership uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb;d attendance_device%ROWTYPE;c attendance_connector%ROWTYPE;b platform_tenant_source_binding%ROWTYPE;nominal boolean;totals jsonb;latest jsonb;baseline bigint;
BEGIN
 ctx:=attendance_gateway_assert_session_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 ctx:=attendance_gateway_assert_actor_v1(ctx,'attendance.read');
 SELECT sb.* INTO b FROM tenant_identity_policy p JOIN platform_tenant_source_binding sb ON sb.id=p.certified_source_binding_id AND sb.tenant_id=p.tenant_id WHERE p.tenant_id=p_tenant AND p.tenant_data_plane_ready AND sb.verified;
 IF NOT FOUND THEN RAISE EXCEPTION 'PM10_BINDING_REQUIRED';END IF;
 SELECT dv.* INTO d FROM attendance_device dv JOIN attendance_marking_site s ON s.id=dv.site_id AND s.tenant_id=dv.tenant_id WHERE dv.tenant_id=p_tenant AND s.external_key='pm-10' AND dv.serial_number='CQTU225360168';
 SELECT * INTO c FROM attendance_connector WHERE tenant_id=p_tenant AND device_id=d.id;
 SELECT EXISTS(SELECT 1 FROM tenant_iam_effective_capabilities(p_membership) WHERE capability_key='workforce.employee.read') INTO nominal;
 SELECT count(*) INTO baseline FROM attendance_clock_snapshot_row r JOIN attendance_clock_snapshot s ON s.id=r.snapshot_id AND s.tenant_id=r.tenant_id WHERE r.tenant_id=p_tenant AND s.device_id=d.id;
 SELECT jsonb_build_object('receipts',count(*),'newMarks',coalesce(sum((result->>'newCanonical')::int),0),'observations',coalesce(sum((result->>'observed')::int),0),'knownRecords',coalesce(sum((result->>'duplicates')::int),0),'lastReceivedAt',max(received_at),'lastCapturedAt',max(captured_at)) INTO totals FROM attendance_pm10_receipt WHERE tenant_id=p_tenant AND device_id=d.id;
 SELECT coalesce(jsonb_agg(x.row_value ORDER BY x.received_at DESC,x.source_ordinal DESC),'[]'::jsonb) INTO latest FROM(
 SELECT r.source_ordinal,q.received_at,jsonb_build_object('occurredAt',r.occurred_at,'receivedAt',q.received_at,
 'personLabel',CASE WHEN nominal AND pi.full_name IS NOT NULL THEN pi.full_name ELSE 'Identidad reservada' END,
 'legajo',CASE WHEN nominal THEN ec.legacy_legajo::text ELSE NULL END,
 'state',CASE WHEN cardinality(r.issue_codes)>0 THEN 'observed' WHEN ec.id IS NOT NULL AND cp.reconciliation_state='mapped' THEN 'mapped' ELSE 'review' END,
 'issueCodes',r.issue_codes,'punchCode',r.punch_code,'verificationCode',r.verification_code) row_value
 FROM attendance_pm10_record r JOIN attendance_pm10_receipt q ON q.id=r.receipt_id AND q.tenant_id=r.tenant_id
 LEFT JOIN attendance_canonical_punch cp ON cp.raw_event_id=r.raw_event_id AND cp.tenant_id=r.tenant_id
 LEFT JOIN employment_contract ec ON ec.id=cp.employment_contract_id AND ec.source_system=b.source_system AND ec.legacy_company_id=b.source_company_id
 AND EXISTS(SELECT 1 FROM source_import_batch ib WHERE ib.id=ec.source_batch_id AND ib.source_system=b.source_system AND ib.source_database=b.source_database AND ib.validation_state='published' AND ib.legacy_import_run_id IS NOT NULL)
 LEFT JOIN person_identity pi ON pi.id=ec.person_id
 WHERE r.tenant_id=p_tenant AND r.device_id=d.id ORDER BY q.received_at DESC,r.source_ordinal DESC LIMIT 50)x;
 RETURN jsonb_build_object('version','pm10-status.v1','checkedAt',clock_timestamp(),'connectorState',coalesce(c.status,'not_configured'),'baselineRecords',baseline,'summary',totals,'records',latest,'nominalReadAllowed',nominal,'physicalClockVerified',false,'payrollModified',false);
END $$;
REVOKE ALL ON FUNCTION attendance_pm10_receipt_status_v1(text,uuid,int,text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION attendance_pm10_receipt_status_v1(text,uuid,int,text,uuid,uuid) TO municontrol_actions_runtime_app;
