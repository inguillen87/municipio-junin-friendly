-- Native operational follow-ups. No legal deadline inference, notifications or payroll effects.
CREATE TABLE legal_followup (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,norm_id uuid NOT NULL,norm_version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,norm_id,norm_version) REFERENCES legal_norm_revision(tenant_id,norm_id,version)
);
CREATE TABLE legal_followup_event (
 tenant_id uuid NOT NULL,followup_id uuid NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 100),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 160 AND title !~ '[<>[:cntrl:]]'),
 due_date date CHECK(due_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 status text NOT NULL CHECK(status IN ('open','done','cancelled')),
 note text NOT NULL CHECK(length(note)<=2000 AND note !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500 AND reason !~ '[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL,actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),actor_email text NOT NULL,
 request_key uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,followup_id,version),
 UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,followup_id) REFERENCES legal_followup(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
CREATE INDEX legal_followup_norm_idx ON legal_followup(tenant_id,norm_id,created_at,id);
ALTER TABLE legal_followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_followup_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON legal_followup,legal_followup_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_followup_immutable BEFORE UPDATE OR DELETE ON legal_followup FOR EACH ROW EXECUTE FUNCTION reject_immutable_source_change();
CREATE TRIGGER legal_followup_no_truncate BEFORE TRUNCATE ON legal_followup FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_source_change();
CREATE TRIGGER legal_followup_event_immutable BEFORE UPDATE OR DELETE ON legal_followup_event FOR EACH ROW EXECUTE FUNCTION reject_immutable_source_change();
CREATE TRIGGER legal_followup_event_no_truncate BEFORE TRUNCATE ON legal_followup_event FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_source_change();
CREATE FUNCTION legal_followup_record_v1(t uuid,f uuid,include_history boolean DEFAULT false) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('id',x.id,'normId',x.norm_id,'normVersion',x.norm_version,'currentNormVersion',n.current_version,
 'version',e.version,'title',e.title,'dueDate',COALESCE(to_char(e.due_date,'YYYY-MM-DD'),''),'status',e.status,'note',e.note,
 'reason',e.reason,'recordedBy',e.actor_email,'recordedAt',e.recorded_at,
 'history',CASE WHEN include_history THEN (SELECT jsonb_agg(jsonb_build_object('version',h.version,'title',h.title,'dueDate',COALESCE(to_char(h.due_date,'YYYY-MM-DD'),''),
 'status',h.status,'note',h.note,'reason',h.reason,'recordedBy',h.actor_email,'recordedAt',h.recorded_at) ORDER BY h.version DESC)
 FROM legal_followup_event h WHERE h.tenant_id=t AND h.followup_id=f) ELSE NULL END)
 FROM legal_followup x JOIN legal_norm n ON n.id=x.norm_id AND n.tenant_id=x.tenant_id
 JOIN LATERAL (SELECT * FROM legal_followup_event v WHERE v.tenant_id=x.tenant_id AND v.followup_id=x.id ORDER BY v.version DESC LIMIT 1) e ON true
 WHERE x.tenant_id=t AND x.id=f
$$;
CREATE FUNCTION legal_followup_operation_v1(p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;m uuid;keys text[];f uuid;n uuid;nv integer;v integer;due date;result jsonb;items jsonb;
 prior legal_followup_event%ROWTYPE;latest legal_followup_event%ROWTYPE;task legal_followup%ROWTYPE;fingerprint text;
 today text:=to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM-DD');field text;
BEGIN
 ctx:=legal_norm_context_v1(p,op IN ('save','attempt'));t:=(ctx->>'tenantId')::uuid;m:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR op NOT IN ('list','detail','save','attempt') OR d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>16000 THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;
 IF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['normId'] OR jsonb_typeof(d->'normId') IS DISTINCT FROM 'string' OR d->>'normId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
  n:=(d->>'normId')::uuid;IF NOT EXISTS(SELECT 1 FROM legal_norm WHERE tenant_id=t AND id=n) THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';END IF;
  SELECT COALESCE(jsonb_agg(legal_followup_record_v1(t,x.id)-'history' ORDER BY x.created_at DESC,x.id),'[]'::jsonb) INTO items FROM legal_followup x WHERE x.tenant_id=t AND x.norm_id=n;
  RETURN jsonb_build_object('version','legal-followup.v1','normId',n,'today',today,'canManage',(ctx->>'canRegister')::boolean,'rows',items,'limit',100);
 END IF;
 IF op='detail' THEN
  IF keys IS DISTINCT FROM ARRAY['id'] OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string' OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
  result:=legal_followup_record_v1(t,(d->>'id')::uuid,true);IF result IS NULL THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-followup.v1','today',today,'canManage',(ctx->>'canRegister')::boolean,'record',result);
 END IF;
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
  SELECT * INTO prior FROM legal_followup_event WHERE tenant_id=t AND actor_membership_id=m AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-followup.v1','id',prior.followup_id,'recordVersion',prior.version,'replayed',true);
 END IF;
 IF keys IS DISTINCT FROM ARRAY['dueDate','expectedVersion','id','normId','normVersion','note','reason','status','title'] THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['normId','title','dueDate','status','note','reason'] LOOP
  IF jsonb_typeof(d->field) IS DISTINCT FROM 'string' OR d->>field<>btrim(d->>field) OR d->>field~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
 END LOOP;
 IF d->>'normId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR (d->'id'<>'null'::jsonb AND (jsonb_typeof(d->'id') IS DISTINCT FROM 'string' OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
 OR jsonb_typeof(d->'expectedVersion') IS DISTINCT FROM 'number' OR d->>'expectedVersion'!~'^[0-9]{1,2}$'
 OR jsonb_typeof(d->'normVersion') IS DISTINCT FROM 'number' OR d->>'normVersion'!~'^[1-9][0-9]{0,3}$' OR (d->>'normVersion')::int>1000
 OR length(d->>'title') NOT BETWEEN 3 AND 160 OR d->>'title'~'[[:cntrl:]]' OR length(d->>'note')>2000
 OR length(d->>'reason') NOT BETWEEN 5 AND 500 OR d->>'reason'~'[[:cntrl:]]' OR d->>'status' NOT IN ('open','done','cancelled') THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
 IF d->>'dueDate'<>'' THEN
  BEGIN due:=(d->>'dueDate')::date;IF d->>'dueDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char(due,'YYYY-MM-DD')<>d->>'dueDate' OR due NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31' THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END;
 END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'FOLLOWUP_BUSY';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('legal-followup:'||t::text,0)) THEN RAISE EXCEPTION 'FOLLOWUP_BUSY';END IF;
 fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior FROM legal_followup_event WHERE tenant_id=t AND actor_membership_id=m AND request_key=k;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'FOLLOWUP_IDEMPOTENCY_CONFLICT';END IF;
  RETURN jsonb_build_object('version','legal-followup.v1','id',prior.followup_id,'recordVersion',prior.version,'replayed',true);
 END IF;
 n:=(d->>'normId')::uuid;nv:=(d->>'normVersion')::integer;
 IF NOT EXISTS(SELECT 1 FROM legal_norm_revision WHERE tenant_id=t AND norm_id=n AND version=nv) THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';END IF;
 IF d->'id'='null'::jsonb THEN
  IF (d->>'expectedVersion')::int<>0 OR d->>'status'<>'open' THEN RAISE EXCEPTION 'FOLLOWUP_INPUT_INVALID';END IF;
  IF (SELECT count(*) FROM legal_followup WHERE tenant_id=t)>=1000 OR (SELECT count(*) FROM legal_followup WHERE tenant_id=t AND norm_id=n)>=100 THEN RAISE EXCEPTION 'FOLLOWUP_CAPACITY';END IF;
  INSERT INTO legal_followup(tenant_id,norm_id,norm_version) VALUES(t,n,nv) RETURNING id INTO f;v:=1;
 ELSE
  f:=(d->>'id')::uuid;SELECT * INTO task FROM legal_followup WHERE tenant_id=t AND id=f;
  IF NOT FOUND THEN RAISE EXCEPTION 'FOLLOWUP_NOT_FOUND';END IF;
  IF task.norm_id<>n OR task.norm_version<>nv THEN RAISE EXCEPTION 'FOLLOWUP_SOURCE_IMMUTABLE';END IF;
  SELECT * INTO latest FROM legal_followup_event WHERE tenant_id=t AND followup_id=f ORDER BY version DESC LIMIT 1;
  IF NOT FOUND OR latest.version<>(d->>'expectedVersion')::integer THEN RAISE EXCEPTION 'FOLLOWUP_VERSION_CONFLICT';END IF;
  IF latest.version>=100 THEN RAISE EXCEPTION 'FOLLOWUP_CAPACITY';END IF;v:=latest.version+1;
  IF (latest.title,latest.due_date,latest.status,latest.note) IS NOT DISTINCT FROM (d->>'title',due,d->>'status',d->>'note') THEN RAISE EXCEPTION 'FOLLOWUP_NO_CHANGE';END IF;
 END IF;
 INSERT INTO legal_followup_event(tenant_id,followup_id,version,title,due_date,status,note,reason,actor_membership_id,actor_session_id,actor_email,request_key,request_sha256)
 VALUES(t,f,v,d->>'title',due,d->>'status',d->>'note',d->>'reason',m,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint);
 RETURN jsonb_build_object('version','legal-followup.v1','id',f,'recordVersion',v,'replayed',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'FOLLOWUP_BUSY';END $$;
REVOKE ALL ON FUNCTION legal_followup_record_v1(uuid,uuid,boolean),legal_followup_operation_v1(jsonb,text,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION legal_followup_operation_v1(jsonb,text,jsonb,uuid) TO municontrol_actions_runtime_app;
