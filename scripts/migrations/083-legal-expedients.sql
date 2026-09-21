-- E5 phase 2a: expediente header linked to municipal matters. Documents/passes follow in later additive phases.
CREATE TABLE public.legal_case (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 number text NOT NULL CHECK(number ~ '^[A-Z0-9][A-Z0-9./-]{0,39}$'),
 year integer NOT NULL CHECK(year BETWEEN 1900 AND 2100),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,number,year)
);
CREATE TABLE public.legal_case_event (
 tenant_id uuid NOT NULL,case_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100),
 state text NOT NULL CHECK(state IN ('open','closed')),
 subject text NOT NULL CHECK(length(subject) BETWEEN 3 AND 240 AND subject !~ '[<>[:cntrl:]]'),
 origin_area text NOT NULL CHECK(length(origin_area) BETWEEN 2 AND 120 AND origin_area !~ '[<>[:cntrl:]]'),
 responsible_membership_id uuid NOT NULL,
 responsible_label text NOT NULL CHECK(length(responsible_label) BETWEEN 1 AND 254),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500 AND reason !~ '[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 254),
 request_key uuid NOT NULL,request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,case_id,revision),UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,case_id) REFERENCES public.legal_case(tenant_id,id),
 FOREIGN KEY(responsible_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE TABLE public.legal_matter_case_link (
 tenant_id uuid NOT NULL,matter_id uuid NOT NULL,case_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL,actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_label text NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,matter_id,case_id),
 FOREIGN KEY(tenant_id,matter_id) REFERENCES public.legal_matter(tenant_id,id),
 FOREIGN KEY(tenant_id,case_id) REFERENCES public.legal_case(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE INDEX legal_case_event_state_idx ON public.legal_case_event(tenant_id,state,recorded_at DESC);
CREATE INDEX legal_matter_case_case_idx ON public.legal_matter_case_link(tenant_id,case_id,matter_id);
ALTER TABLE public.legal_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_case_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_matter_case_link ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_case,public.legal_case_event,public.legal_matter_case_link FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_case_immutable BEFORE UPDATE OR DELETE ON public.legal_case FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_case_no_truncate BEFORE TRUNCATE ON public.legal_case FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_case_event_immutable BEFORE UPDATE OR DELETE ON public.legal_case_event FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_case_event_no_truncate BEFORE TRUNCATE ON public.legal_case_event FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_matter_case_link_immutable BEFORE UPDATE OR DELETE ON public.legal_matter_case_link FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_matter_case_link_no_truncate BEFORE TRUNCATE ON public.legal_matter_case_link FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();

CREATE FUNCTION public.legal_case_record_v1(t uuid,c uuid,include_history boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object(
  'id',x.id,'number',x.number,'year',x.year,'revision',e.revision,'state',e.state,
  'subject',e.subject,'originArea',e.origin_area,
  'responsible',jsonb_build_object('id',e.responsible_membership_id,'label',e.responsible_label,
   'eligible',public.legal_coordination_member_v1(t,e.responsible_membership_id) IS NOT NULL),
  'reason',e.reason,'recordedBy',e.actor_label,'recordedAt',e.recorded_at,
  'matters',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'title',me.title,'state',me.state,'revision',me.revision,
    'normId',m.norm_id,'normVersion',m.norm_version) ORDER BY l.linked_at,l.matter_id),'[]'::jsonb)
    FROM public.legal_matter_case_link l JOIN public.legal_matter m ON m.tenant_id=l.tenant_id AND m.id=l.matter_id
    JOIN LATERAL (SELECT * FROM public.legal_matter_event mv WHERE mv.tenant_id=m.tenant_id AND mv.matter_id=m.id ORDER BY mv.revision DESC LIMIT 1) me ON true
    WHERE l.tenant_id=t AND l.case_id=c),
  'history',CASE WHEN include_history THEN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'revision',h.revision,'state',h.state,'subject',h.subject,'originArea',h.origin_area,
      'responsibleId',h.responsible_membership_id,'responsibleLabel',h.responsible_label,
      'reason',h.reason,'recordedBy',h.actor_label,'recordedAt',h.recorded_at
    ) ORDER BY h.revision DESC),'[]'::jsonb)
    FROM public.legal_case_event h WHERE h.tenant_id=t AND h.case_id=c
  ) ELSE NULL END)
 FROM public.legal_case x
 JOIN LATERAL (SELECT * FROM public.legal_case_event v WHERE v.tenant_id=x.tenant_id AND v.case_id=x.id ORDER BY v.revision DESC LIMIT 1) e ON true
 WHERE x.tenant_id=t AND x.id=c
$$;
CREATE FUNCTION public.legal_case_operation_v1(p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;member uuid;keys text[];case_id uuid;matter uuid;target uuid;candidate jsonb;
 current public.legal_case_event%ROWTYPE;prior public.legal_case_event%ROWTYPE;rev integer;next_state text;
 fingerprint text;rows jsonb;total integer;page_number integer;query_text text;filter_state text;command text;
BEGIN
 ctx:=public.legal_norm_context_v1(p,op IN ('save','attempt'));t:=(ctx->>'tenantId')::uuid;member:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR op NOT IN ('bootstrap','list','for_matter','detail','save','attempt')
  OR d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>10000
 THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;
 IF op='bootstrap' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
  rows:='[]'::jsonb;
  IF (ctx->>'canRegister')::boolean THEN
   SELECT coalesce(jsonb_agg(q.member ORDER BY q.member->>'id'),'[]'::jsonb) INTO rows
   FROM (SELECT public.legal_coordination_member_v1(t,x.id) member
    FROM public.tenant_membership x WHERE x.tenant_id=t AND x.status='active') q
   WHERE q.member IS NOT NULL;
   IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION 'CASE_CAPACITY';END IF;
  END IF;
  RETURN jsonb_build_object('version','legal-case-bootstrap.v1','canManage',(ctx->>'canRegister')::boolean,
   'total',(SELECT count(*) FROM public.legal_case WHERE tenant_id=t),'candidates',rows);
 END IF;
 IF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['page','q','state'] OR jsonb_typeof(d->'q') IS DISTINCT FROM 'string'
   OR length(d->>'q')>120 OR d->>'page'!~'^[1-9][0-9]{0,2}$' OR (d->>'page')::int>200
   OR jsonb_typeof(d->'state') IS DISTINCT FROM 'string' OR d->>'state' NOT IN ('','open','closed')
  THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
  page_number:=(d->>'page')::int;query_text:=btrim(d->>'q');filter_state:=NULLIF(d->>'state','');
  WITH latest AS (
   SELECT DISTINCT ON(e.case_id) e.*,c.number,c.year
   FROM public.legal_case_event e JOIN public.legal_case c ON c.tenant_id=e.tenant_id AND c.id=e.case_id
   WHERE e.tenant_id=t ORDER BY e.case_id,e.revision DESC
  ), scoped AS (
   SELECT * FROM latest
   WHERE (filter_state IS NULL OR state=filter_state)
    AND (query_text='' OR concat_ws(' ',number,year,subject,origin_area,responsible_label) ILIKE '%'||query_text||'%')
  )
  SELECT (SELECT count(*)::int FROM scoped),
   coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',s.case_id,'number',s.number,'year',s.year,'revision',s.revision,'state',s.state,
    'subject',s.subject,'originArea',s.origin_area,'responsibleLabel',s.responsible_label,
    'recordedAt',s.recorded_at) ORDER BY s.recorded_at DESC,s.case_id)
    FROM (SELECT * FROM scoped ORDER BY recorded_at DESC,case_id LIMIT 25 OFFSET (page_number-1)*25) s),'[]'::jsonb)
  INTO total,rows;
  RETURN jsonb_build_object('version','legal-case-list.v1','canManage',(ctx->>'canRegister')::boolean,
    'total',total,'page',page_number,'pageSize',25,'rows',rows);
 END IF;
 IF op='for_matter' THEN
  IF keys IS DISTINCT FROM ARRAY['matterId'] OR jsonb_typeof(d->'matterId') IS DISTINCT FROM 'string'
   OR d->>'matterId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
  matter:=(d->>'matterId')::uuid;
  IF public.legal_matter_record_v1(t,matter,false) IS NULL THEN RAISE EXCEPTION 'CASE_MATTER_NOT_FOUND';END IF;
  SELECT coalesce(jsonb_agg(public.legal_case_record_v1(t,l.case_id,false) ORDER BY l.linked_at,l.case_id),'[]'::jsonb)
   INTO rows FROM public.legal_matter_case_link l WHERE l.tenant_id=t AND l.matter_id=matter;
  RETURN jsonb_build_object('version','legal-case-for-matter.v1','matterId',matter,
   'canManage',(ctx->>'canRegister')::boolean,'rows',rows);
 END IF;
 IF op='detail' THEN
  IF keys IS DISTINCT FROM ARRAY['id'] OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string'
   OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
  case_id:=(d->>'id')::uuid;rows:=public.legal_case_record_v1(t,case_id,true);
  IF rows IS NULL THEN RAISE EXCEPTION 'CASE_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-case-detail.v1','canManage',(ctx->>'canRegister')::boolean
    AND (rows->>'revision')::int<100,'record',rows,
    'candidates',CASE WHEN (ctx->>'canRegister')::boolean AND (rows->>'revision')::int<100 THEN (
      SELECT coalesce(jsonb_agg(q.member ORDER BY q.member->>'id'),'[]'::jsonb)
      FROM (SELECT public.legal_coordination_member_v1(t,x.id) member
       FROM public.tenant_membership x WHERE x.tenant_id=t AND x.status='active') q WHERE q.member IS NOT NULL
    ) ELSE '[]'::jsonb END);
 END IF;
 IF op IN ('save','attempt') AND (k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
 THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
  SELECT * INTO prior FROM public.legal_case_event WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASE_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-case-receipt.v1','id',prior.case_id,
   'revision',prior.revision,'state',prior.state,'replayed',true);
 END IF;
 IF op<>'save' OR jsonb_typeof(d->'command') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
 command:=d->>'command';
 IF current_setting('transaction_isolation')<>'read committed'
  OR NOT pg_try_advisory_xact_lock(hashtextextended('legal-case:'||t::text,0))
 THEN RAISE EXCEPTION 'CASE_BUSY';END IF;
 fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior FROM public.legal_case_event WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'CASE_IDEMPOTENCY_CONFLICT';END IF;
  RETURN jsonb_build_object('version','legal-case-receipt.v1','id',prior.case_id,
   'revision',prior.revision,'state',prior.state,'replayed',true);
 END IF;
 IF command='create' THEN
  IF keys IS DISTINCT FROM ARRAY['command','matterId','number','originArea','reason','responsibleId','subject','year']
   OR jsonb_typeof(d->'matterId') IS DISTINCT FROM 'string'
   OR d->>'matterId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'responsibleId') IS DISTINCT FROM 'string'
   OR d->>'responsibleId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'year') IS DISTINCT FROM 'number' OR d->>'year'!~'^[0-9]{4}$' OR (d->>'year')::int NOT BETWEEN 1900 AND 2100
  THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
  matter:=(d->>'matterId')::uuid;
  IF public.legal_matter_record_v1(t,matter,false) IS NULL THEN RAISE EXCEPTION 'CASE_MATTER_NOT_FOUND';END IF;
  IF jsonb_typeof(d->'number') IS DISTINCT FROM 'string' OR upper(btrim(d->>'number'))!~'^[A-Z0-9][A-Z0-9./-]{0,39}$'
   OR jsonb_typeof(d->'subject') IS DISTINCT FROM 'string' OR d->>'subject'<>btrim(d->>'subject') OR length(d->>'subject') NOT BETWEEN 3 AND 240 OR d->>'subject'~'[<>[:cntrl:]]'
   OR jsonb_typeof(d->'originArea') IS DISTINCT FROM 'string' OR d->>'originArea'<>btrim(d->>'originArea') OR length(d->>'originArea') NOT BETWEEN 2 AND 120 OR d->>'originArea'~'[<>[:cntrl:]]'
   OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string' OR d->>'reason'<>btrim(d->>'reason') OR length(d->>'reason') NOT BETWEEN 5 AND 500 OR d->>'reason'~'[<>[:cntrl:]]'
  THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
  target:=(d->>'responsibleId')::uuid;candidate:=public.legal_coordination_member_v1(t,target);
  IF candidate IS NULL THEN RAISE EXCEPTION 'CASE_MEMBER_UNAVAILABLE';END IF;
  IF (SELECT count(*) FROM public.legal_case WHERE tenant_id=t)>=2000 THEN RAISE EXCEPTION 'CASE_CAPACITY';END IF;
  BEGIN
   INSERT INTO public.legal_case(tenant_id,number,year)
    VALUES(t,upper(btrim(d->>'number')),(d->>'year')::int) RETURNING id INTO case_id;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CASE_DUPLICATE';END;
  INSERT INTO public.legal_case_event(
   tenant_id,case_id,revision,state,subject,origin_area,responsible_membership_id,responsible_label,
   reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
  VALUES(t,case_id,1,'open',d->>'subject',d->>'originArea',target,candidate->>'label',
   d->>'reason',member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint);
  INSERT INTO public.legal_matter_case_link(
   tenant_id,matter_id,case_id,actor_membership_id,actor_session_id,actor_label,reason)
  VALUES(t,matter,case_id,member,(ctx->>'sessionId')::uuid,ctx->>'email',d->>'reason');
  RETURN jsonb_build_object('version','legal-case-receipt.v1','id',case_id,'revision',1,'state','open','replayed',false);
 END IF;
 IF command NOT IN ('revise','close','reopen')
  OR keys IS DISTINCT FROM ARRAY['command','expectedRevision','id','originArea','reason','responsibleId','subject']
  OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string'
  OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'expectedRevision') IS DISTINCT FROM 'number'
  OR d->>'expectedRevision'!~'^[1-9][0-9]{0,2}$' OR (d->>'expectedRevision')::int>100
  OR jsonb_typeof(d->'responsibleId') IS DISTINCT FROM 'string'
  OR d->>'responsibleId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'subject') IS DISTINCT FROM 'string' OR d->>'subject'<>btrim(d->>'subject')
  OR length(d->>'subject') NOT BETWEEN 3 AND 240 OR d->>'subject'~'[<>[:cntrl:]]'
  OR jsonb_typeof(d->'originArea') IS DISTINCT FROM 'string' OR d->>'originArea'<>btrim(d->>'originArea')
  OR length(d->>'originArea') NOT BETWEEN 2 AND 120 OR d->>'originArea'~'[<>[:cntrl:]]'
  OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string' OR d->>'reason'<>btrim(d->>'reason')
  OR length(d->>'reason') NOT BETWEEN 5 AND 500 OR d->>'reason'~'[<>[:cntrl:]]'
 THEN RAISE EXCEPTION 'CASE_INPUT_INVALID';END IF;
 case_id:=(d->>'id')::uuid;
 SELECT * INTO current FROM public.legal_case_event e WHERE e.tenant_id=t AND e.case_id=case_id ORDER BY e.revision DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'CASE_NOT_FOUND';END IF;
 IF current.revision<>(d->>'expectedRevision')::int THEN RAISE EXCEPTION 'CASE_VERSION_CONFLICT';END IF;
 IF current.revision>=100 THEN RAISE EXCEPTION 'CASE_CAPACITY';END IF;
 target:=(d->>'responsibleId')::uuid;candidate:=public.legal_coordination_member_v1(t,target);
 IF candidate IS NULL THEN RAISE EXCEPTION 'CASE_MEMBER_UNAVAILABLE';END IF;
 IF command='close' THEN
  IF current.state<>'open' THEN RAISE EXCEPTION 'CASE_TRANSITION_INVALID';END IF;next_state:='closed';
 ELSIF command='reopen' THEN
  IF current.state<>'closed' THEN RAISE EXCEPTION 'CASE_TRANSITION_INVALID';END IF;next_state:='open';
 ELSE
  IF current.state<>'open' THEN RAISE EXCEPTION 'CASE_TRANSITION_INVALID';END IF;next_state:='open';
  IF d->>'subject'=current.subject AND d->>'originArea'=current.origin_area AND target=current.responsible_membership_id
  THEN RAISE EXCEPTION 'CASE_NO_CHANGE';END IF;
 END IF;
 rev:=current.revision+1;
 INSERT INTO public.legal_case_event(
  tenant_id,case_id,revision,state,subject,origin_area,responsible_membership_id,responsible_label,
  reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
 VALUES(t,case_id,rev,next_state,d->>'subject',d->>'originArea',target,candidate->>'label',
  d->>'reason',member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint);
 RETURN jsonb_build_object('version','legal-case-receipt.v1','id',case_id,'revision',rev,'state',next_state,'replayed',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'CASE_BUSY';
END $$;
REVOKE ALL ON FUNCTION public.legal_case_record_v1(uuid,uuid,boolean),
 public.legal_case_operation_v1(jsonb,text,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_case_operation_v1(jsonb,text,jsonb,uuid) TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_case_operation_v1(jsonb,text,jsonb,uuid)
 IS 'Tenant-scoped expediente header and matter link; no document bytes, passes, legal validity or payroll effects';
