-- Additive coordination ledger. Existing follow-up/norm revisions are not rewritten.
CREATE TABLE public.legal_coordination_event (
 tenant_id uuid NOT NULL,followup_id uuid NOT NULL,revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100),
 followup_version integer NOT NULL CHECK(followup_version BETWEEN 1 AND 100),
 responsible_membership_id uuid,responsible_label text,
 next_action text NOT NULL CHECK(length(next_action)<=500 AND next_action !~ '[<>[:cntrl:]]'),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500 AND reason !~ '[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL,actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_label text NOT NULL,
 request_key uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,followup_id,revision),UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,followup_id) REFERENCES public.legal_followup(tenant_id,id),
 FOREIGN KEY(tenant_id,followup_id,followup_version) REFERENCES public.legal_followup_event(tenant_id,followup_id,version),
 FOREIGN KEY(responsible_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK((responsible_membership_id IS NULL AND responsible_label IS NULL) OR (responsible_membership_id IS NOT NULL AND length(responsible_label) BETWEEN 1 AND 254)),
 CHECK(responsible_membership_id IS NULL OR length(next_action)>=3)
);
ALTER TABLE public.legal_coordination_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_coordination_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_coordination_immutable BEFORE UPDATE OR DELETE ON public.legal_coordination_event FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_coordination_no_truncate BEFORE TRUNCATE ON public.legal_coordination_event FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE FUNCTION public.legal_coordination_member_v1(t uuid,m uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('id',x.id,'label',u.email) FROM tenant_membership x JOIN internal_users u ON u.email=x.user_email
 WHERE x.tenant_id=t AND x.id=m AND x.status='active' AND u.active AND u.auth_mode='managed'
 AND EXISTS(SELECT 1 FROM tenant_iam_effective_capabilities(x.id) c WHERE c.capability_key='legal.norm.read')
$$;
CREATE FUNCTION public.legal_coordination_v1(p jsonb,op text,d jsonb,k uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;m uuid;keys text[];f uuid;target uuid;candidate jsonb;candidates jsonb;history jsonb;current_event legal_coordination_event%ROWTYPE;
 prior legal_coordination_event%ROWTYPE;task jsonb;expected integer;v integer;fingerprint text;field text;can_manage boolean;
BEGIN
 ctx:=legal_norm_context_v1(p,op IN ('save','attempt'));t:=(ctx->>'tenantId')::uuid;m:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR op NOT IN ('detail','save','attempt') OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>6000 THEN RAISE EXCEPTION 'COORDINATION_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;
 IF op IN ('save','attempt') AND (k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'COORDINATION_INPUT_INVALID';END IF;
 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'COORDINATION_INPUT_INVALID';END IF;
  SELECT * INTO prior FROM legal_coordination_event WHERE tenant_id=t AND actor_membership_id=m AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'COORDINATION_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-coordination-receipt.v1','followupId',prior.followup_id,'revision',prior.revision,'followupVersion',prior.followup_version,'replayed',true);
 END IF;
 IF op='detail' AND keys IS DISTINCT FROM ARRAY['followupId'] THEN RAISE EXCEPTION 'COORDINATION_INPUT_INVALID';END IF;
 IF op='save' AND keys IS DISTINCT FROM ARRAY['expectedFollowupVersion','expectedRevision','followupId','nextAction','reason','responsibleId'] THEN RAISE EXCEPTION 'COORDINATION_INPUT_INVALID';END IF;
 IF jsonb_typeof(d->'followupId') IS DISTINCT FROM 'string' OR d->>'followupId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'COORDINATION_INPUT_INVALID';END IF;
 f:=(d->>'followupId')::uuid;
 IF op='save' THEN
  IF jsonb_typeof(d->'expectedRevision') IS DISTINCT FROM 'number' OR d->>'expectedRevision'!~'^[0-9]{1,2}$'
   OR jsonb_typeof(d->'expectedFollowupVersion') IS DISTINCT FROM 'number' OR d->>'expectedFollowupVersion'!~'^[1-9][0-9]{0,2}$' OR (d->>'expectedFollowupVersion')::int>100
   OR (d->'responsibleId'<>'null'::jsonb AND (jsonb_typeof(d->'responsibleId') IS DISTINCT FROM 'string' OR d->>'responsibleId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')) THEN RAISE EXCEPTION 'COORDINATION_INPUT_INVALID';END IF;
  FOREACH field IN ARRAY ARRAY['nextAction','reason'] LOOP
   IF jsonb_typeof(d->field) IS DISTINCT FROM 'string' OR d->>field<>btrim(d->>field) OR length(d->>field)>500 OR d->>field~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'COORDINATION_INPUT_INVALID';END IF;
  END LOOP;
  IF length(d->>'reason')<5 OR (d->>'nextAction'<>'' AND length(d->>'nextAction')<3) OR (d->'responsibleId'<>'null'::jsonb AND length(d->>'nextAction')<3) THEN RAISE EXCEPTION 'COORDINATION_INPUT_INVALID';END IF;
  IF current_setting('transaction_isolation')<>'read committed' OR NOT pg_try_advisory_xact_lock(hashtextextended('legal-followup:'||t::text,0)) THEN RAISE EXCEPTION 'COORDINATION_BUSY';END IF;
  fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
  SELECT * INTO prior FROM legal_coordination_event WHERE tenant_id=t AND actor_membership_id=m AND request_key=k;
  IF FOUND THEN
   IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'COORDINATION_IDEMPOTENCY_CONFLICT';END IF;
   RETURN jsonb_build_object('version','legal-coordination-receipt.v1','followupId',f,'revision',prior.revision,'followupVersion',prior.followup_version,'replayed',true);
  END IF;
 END IF;
 task:=legal_followup_record_v1(t,f,false);
 IF task IS NULL THEN RAISE EXCEPTION 'COORDINATION_NOT_FOUND';END IF;
 SELECT * INTO current_event FROM legal_coordination_event WHERE tenant_id=t AND followup_id=f ORDER BY revision DESC LIMIT 1;
 v:=coalesce(current_event.revision,0);can_manage:=(ctx->>'canRegister')::boolean AND task->>'status'='open' AND v<100;
 IF op='save' THEN
  IF task->>'status'<>'open' THEN RAISE EXCEPTION 'COORDINATION_CLOSED';END IF;
  IF v<>(d->>'expectedRevision')::int OR (task->>'version')::int<>(d->>'expectedFollowupVersion')::int THEN RAISE EXCEPTION 'COORDINATION_VERSION_CONFLICT';END IF;
  IF v>=100 THEN RAISE EXCEPTION 'COORDINATION_CAPACITY';END IF;
  target:=(d->>'responsibleId')::uuid;
  IF target IS NOT NULL THEN
   PERFORM 1 FROM tenant_membership x JOIN internal_users u ON u.email=x.user_email WHERE x.tenant_id=t AND x.id=target AND x.status='active' AND u.active AND u.auth_mode='managed' FOR SHARE OF x,u NOWAIT;
   candidate:=legal_coordination_member_v1(t,target);
   IF NOT FOUND OR candidate IS NULL THEN RAISE EXCEPTION 'COORDINATION_MEMBER_UNAVAILABLE';END IF;
  END IF;
  IF (current_event.responsible_membership_id,coalesce(current_event.next_action,'')) IS NOT DISTINCT FROM (target,d->>'nextAction') THEN RAISE EXCEPTION 'COORDINATION_NO_CHANGE';END IF;
  INSERT INTO legal_coordination_event(tenant_id,followup_id,revision,followup_version,responsible_membership_id,responsible_label,next_action,reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
  VALUES(t,f,v+1,(task->>'version')::int,target,candidate->>'label',d->>'nextAction',d->>'reason',m,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint);
  RETURN jsonb_build_object('version','legal-coordination-receipt.v1','followupId',f,'revision',v+1,'followupVersion',(task->>'version')::int,'replayed',false);
 END IF;
 candidates:='[]'::jsonb;
 IF can_manage THEN
  SELECT coalesce(jsonb_agg(q.member ORDER BY q.member->>'id'),'[]'::jsonb) INTO candidates FROM (
   SELECT legal_coordination_member_v1(t,x.id) AS member FROM tenant_membership x WHERE x.tenant_id=t AND x.status='active'
  ) q WHERE q.member IS NOT NULL;
  IF jsonb_array_length(candidates)>1000 THEN RAISE EXCEPTION 'COORDINATION_CAPACITY';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('revision',e.revision,'followupVersion',e.followup_version,
  'responsibleId',e.responsible_membership_id,'responsibleLabel',e.responsible_label,'nextAction',e.next_action,
  'reason',e.reason,'actorLabel',e.actor_label,'recordedAt',e.recorded_at) ORDER BY e.revision DESC),'[]'::jsonb)
 INTO history FROM legal_coordination_event e WHERE e.tenant_id=t AND e.followup_id=f;
 RETURN jsonb_build_object('version','legal-coordination.v1','followup',jsonb_build_object('id',f,'normId',task->>'normId',
  'normVersion',(task->>'normVersion')::int,'version',(task->>'version')::int,'title',task->>'title','status',task->>'status'),
  'canManage',can_manage,'candidates',candidates,'revision',v,'nextAction',coalesce(current_event.next_action,''),
  'responsible',CASE WHEN current_event.responsible_membership_id IS NULL THEN NULL ELSE jsonb_build_object(
   'id',current_event.responsible_membership_id,'label',current_event.responsible_label,
   'eligible',legal_coordination_member_v1(t,current_event.responsible_membership_id) IS NOT NULL) END,'history',history);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'COORDINATION_BUSY';
END $$;
REVOKE ALL ON FUNCTION public.legal_coordination_member_v1(uuid,uuid),public.legal_coordination_v1(jsonb,text,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_coordination_v1(jsonb,text,jsonb,uuid) TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_coordination_v1(jsonb,text,jsonb,uuid) IS 'Tenant-scoped responsibility and next-action ledger; no account grants, no automatic notifications or followup state changes';
