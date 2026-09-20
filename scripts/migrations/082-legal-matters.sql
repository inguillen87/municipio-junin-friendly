-- E5 phase 1: municipal legal matters, append-only review workflow over an exact normative source.
CREATE TABLE public.legal_matter (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 norm_id uuid NOT NULL,
 norm_version integer NOT NULL CHECK(norm_version BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,norm_id,norm_version)
   REFERENCES public.legal_norm_revision(tenant_id,norm_id,version)
);
CREATE TABLE public.legal_matter_event (
 tenant_id uuid NOT NULL,
 matter_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100),
 state text NOT NULL CHECK(state IN ('assigned','in_review','returned','responded','reviewed','closed','cancelled')),
 matter_type text NOT NULL CHECK(matter_type IN ('revision_normativa','consulta','dictamen','proyecto')),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 180 AND title !~ '[<>[:cntrl:]]'),
 owning_area text NOT NULL CHECK(length(owning_area) BETWEEN 2 AND 120 AND owning_area !~ '[<>[:cntrl:]]'),
 responsible_membership_id uuid NOT NULL,
 responsible_label text NOT NULL CHECK(length(responsible_label) BETWEEN 1 AND 254),
 next_action text NOT NULL CHECK(length(next_action)<=500 AND next_action !~ '[<>[:cntrl:]]'),
 target_date date CHECK(target_date BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
 observations text NOT NULL CHECK(length(observations)<=2000 AND observations !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 evidence_article_label text NOT NULL CHECK(length(evidence_article_label)<=60 AND evidence_article_label !~ '[<>[:cntrl:]]'),
 evidence_note text NOT NULL CHECK(length(evidence_note)<=2000 AND evidence_note !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500 AND reason !~ '[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 254),
 request_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,matter_id,revision),
 UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,matter_id) REFERENCES public.legal_matter(tenant_id,id),
 FOREIGN KEY(responsible_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK((state IN ('closed','cancelled') AND next_action='') OR state NOT IN ('closed','cancelled')),
 CHECK(state<>'returned' OR length(observations)>=5),
 CHECK(state<>'responded' OR length(evidence_note)>=5)
);
CREATE INDEX legal_matter_current_idx ON public.legal_matter_event(tenant_id,matter_id,revision DESC);
CREATE INDEX legal_matter_state_idx ON public.legal_matter_event(tenant_id,state,recorded_at DESC);
ALTER TABLE public.legal_matter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_matter_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_matter,public.legal_matter_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_matter_immutable BEFORE UPDATE OR DELETE ON public.legal_matter
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_matter_no_truncate BEFORE TRUNCATE ON public.legal_matter
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_matter_event_immutable BEFORE UPDATE OR DELETE ON public.legal_matter_event
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_matter_event_no_truncate BEFORE TRUNCATE ON public.legal_matter_event
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE FUNCTION public.legal_matter_record_v1(t uuid,m uuid,include_history boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object(
  'id',x.id,'normId',x.norm_id,'normVersion',x.norm_version,
  'revision',e.revision,'state',e.state,'matterType',e.matter_type,'title',e.title,
  'owningArea',e.owning_area,'responsible',jsonb_build_object(
    'id',e.responsible_membership_id,'label',e.responsible_label,
    'eligible',public.legal_coordination_member_v1(t,e.responsible_membership_id) IS NOT NULL),
  'nextAction',e.next_action,'targetDate',coalesce(to_char(e.target_date,'YYYY-MM-DD'),''),
  'observations',e.observations,'evidenceArticleLabel',e.evidence_article_label,'evidenceNote',e.evidence_note,
  'reason',e.reason,'recordedBy',e.actor_label,'recordedAt',e.recorded_at,
  'source',jsonb_build_object('kind',n.kind,'issuer',n.issuer,'number',n.number,'year',n.year,
    'title',r.metadata->>'title','currentVersion',n.current_version),
  'history',CASE WHEN include_history THEN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'revision',h.revision,'state',h.state,'responsibleId',h.responsible_membership_id,
      'responsibleLabel',h.responsible_label,'nextAction',h.next_action,
      'targetDate',coalesce(to_char(h.target_date,'YYYY-MM-DD'),''),
      'observations',h.observations,'evidenceArticleLabel',h.evidence_article_label,
      'evidenceNote',h.evidence_note,'reason',h.reason,'recordedBy',h.actor_label,
      'recordedAt',h.recorded_at) ORDER BY h.revision DESC),'[]'::jsonb)
    FROM public.legal_matter_event h WHERE h.tenant_id=t AND h.matter_id=m
  ) ELSE NULL END)
 FROM public.legal_matter x
 JOIN public.legal_norm n ON n.tenant_id=x.tenant_id AND n.id=x.norm_id
 JOIN public.legal_norm_revision r ON r.tenant_id=x.tenant_id AND r.norm_id=x.norm_id AND r.version=x.norm_version
 JOIN LATERAL (SELECT * FROM public.legal_matter_event v WHERE v.tenant_id=x.tenant_id AND v.matter_id=x.id ORDER BY v.revision DESC LIMIT 1) e ON true
 WHERE x.tenant_id=t AND x.id=m
$$;
CREATE FUNCTION public.legal_matter_operation_v1(p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;member uuid;keys text[];matter uuid;source_norm uuid;source_version integer;
 current public.legal_matter_event%ROWTYPE;prior public.legal_matter_event%ROWTYPE;
 target uuid;candidate jsonb;responsible_label text;next_state text;rev integer;fingerprint text;day date;target_day date;obs text;ev_article text;ev_note text;
 result jsonb;rows jsonb;counts jsonb;total integer;page_number integer;query_text text;filter_state text;
 body_command text;article_label text;source_meta jsonb;changed boolean;
BEGIN
 ctx:=public.legal_norm_context_v1(p,op IN ('save','attempt'));
 t:=(ctx->>'tenantId')::uuid;member:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR op NOT IN ('bootstrap','list','detail','save','attempt')
  OR d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>12000
 THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;
 day:=(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;
 IF op='bootstrap' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  rows:='[]'::jsonb;
  IF (ctx->>'canRegister')::boolean THEN
   SELECT coalesce(jsonb_agg(q.member ORDER BY q.member->>'id'),'[]'::jsonb) INTO rows
   FROM (SELECT public.legal_coordination_member_v1(t,x.id) AS member
    FROM public.tenant_membership x WHERE x.tenant_id=t AND x.status='active') q
   WHERE q.member IS NOT NULL;
   IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION 'MATTER_CAPACITY';END IF;
  END IF;
  RETURN jsonb_build_object('version','legal-matter-bootstrap.v1','today',to_char(day,'YYYY-MM-DD'),
   'canManage',(ctx->>'canRegister')::boolean,'total',(SELECT count(*) FROM public.legal_matter WHERE tenant_id=t),
   'candidates',rows);
 END IF;
 IF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['page','q','state'] OR jsonb_typeof(d->'q') IS DISTINCT FROM 'string'
   OR length(d->>'q')>120 OR d->>'page'!~'^[1-9][0-9]{0,2}$' OR (d->>'page')::int>200
   OR jsonb_typeof(d->'state') IS DISTINCT FROM 'string'
   OR d->>'state' NOT IN ('','assigned','in_review','returned','responded','reviewed','closed','cancelled')
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  page_number:=(d->>'page')::int;query_text:=btrim(d->>'q');filter_state:=NULLIF(d->>'state','');
  WITH latest AS (
   SELECT DISTINCT ON (e.matter_id) e.*,m.norm_id,m.norm_version
   FROM public.legal_matter_event e JOIN public.legal_matter m
    ON m.tenant_id=e.tenant_id AND m.id=e.matter_id
   WHERE e.tenant_id=t ORDER BY e.matter_id,e.revision DESC
  ), scoped AS (
   SELECT l.*,n.kind,n.issuer,n.number,n.year,n.current_version,r.metadata->>'title' AS source_title
   FROM latest l
   JOIN public.legal_norm n ON n.tenant_id=t AND n.id=l.norm_id
   JOIN public.legal_norm_revision r ON r.tenant_id=t AND r.norm_id=l.norm_id AND r.version=l.norm_version
   WHERE (filter_state IS NULL OR l.state=filter_state)
    AND (query_text='' OR concat_ws(' ',l.title,l.owning_area,l.responsible_label,n.number,n.year,r.metadata->>'title') ILIKE '%'||query_text||'%')
  ), counted AS (
   SELECT count(*)::int AS total,
    jsonb_build_object(
     'assigned',count(*) FILTER(WHERE state='assigned'),'inReview',count(*) FILTER(WHERE state='in_review'),
     'returned',count(*) FILTER(WHERE state='returned'),'responded',count(*) FILTER(WHERE state='responded'),
     'reviewed',count(*) FILTER(WHERE state='reviewed'),'closed',count(*) FILTER(WHERE state='closed'),
     'cancelled',count(*) FILTER(WHERE state='cancelled')) AS counts
   FROM scoped
  )
  SELECT c.total,c.counts,coalesce(jsonb_agg(jsonb_build_object(
   'id',s.matter_id,'revision',s.revision,'state',s.state,'matterType',s.matter_type,'title',s.title,
   'owningArea',s.owning_area,'responsibleLabel',s.responsible_label,'nextAction',s.next_action,
   'targetDate',coalesce(to_char(s.target_date,'YYYY-MM-DD'),''),
   'normId',s.norm_id,'normVersion',s.norm_version,
   'source',jsonb_build_object('kind',s.kind,'issuer',s.issuer,'number',s.number,'year',s.year,'title',s.source_title,'currentVersion',s.current_version),
   'recordedAt',s.recorded_at) ORDER BY s.recorded_at DESC,s.matter_id)
   FILTER(WHERE s.matter_id IS NOT NULL),'[]'::jsonb)
  INTO total,counts,rows
  FROM counted c LEFT JOIN LATERAL (
   SELECT * FROM scoped ORDER BY recorded_at DESC,matter_id
   LIMIT 25 OFFSET (page_number-1)*25
  ) s ON true GROUP BY c.total,c.counts;
  RETURN jsonb_build_object('version','legal-matter-list.v1','today',to_char(day,'YYYY-MM-DD'),
   'canManage',(ctx->>'canRegister')::boolean,'total',total,'page',page_number,'pageSize',25,
   'counts',counts,'rows',rows);
 END IF;
 IF op='detail' THEN
  IF keys IS DISTINCT FROM ARRAY['id'] OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string'
   OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  matter:=(d->>'id')::uuid;result:=public.legal_matter_record_v1(t,matter,true);
  IF result IS NULL THEN RAISE EXCEPTION 'MATTER_NOT_FOUND';END IF;
  SELECT r.metadata INTO source_meta FROM public.legal_matter m
   JOIN public.legal_norm_revision r ON r.tenant_id=m.tenant_id AND r.norm_id=m.norm_id AND r.version=m.norm_version
   WHERE m.tenant_id=t AND m.id=matter;
  SELECT coalesce(jsonb_agg(q.member ORDER BY q.member->>'id'),'[]'::jsonb) INTO rows
  FROM (
   SELECT public.legal_coordination_member_v1(t,x.id) AS member
   FROM public.tenant_membership x WHERE x.tenant_id=t AND x.status='active'
  ) q WHERE q.member IS NOT NULL;
  IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION 'MATTER_CAPACITY';END IF;
  RETURN jsonb_build_object('version','legal-matter-detail.v1','today',to_char(day,'YYYY-MM-DD'),
   'canManage',(ctx->>'canRegister')::boolean AND (result->>'revision')::int<100,
   'record',result,
   'candidates',CASE WHEN (ctx->>'canRegister')::boolean AND (result->>'revision')::int<100
      THEN rows ELSE '[]'::jsonb END,
   'sourceArticles',coalesce((
     SELECT jsonb_agg(a->>'label' ORDER BY ord)
     FROM jsonb_array_elements(source_meta->'articles') WITH ORDINALITY z(a,ord)
   ),'[]'::jsonb));
 END IF;
 IF op IN ('save','attempt') AND (k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
 THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  SELECT * INTO prior FROM public.legal_matter_event
   WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'MATTER_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-matter-receipt.v1','id',prior.matter_id,
   'revision',prior.revision,'state',prior.state,'replayed',true);
 END IF;
 IF op<>'save' OR jsonb_typeof(d->'command') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
 body_command:=d->>'command';
 IF current_setting('transaction_isolation')<>'read committed' OR NOT pg_try_advisory_xact_lock(hashtextextended('legal-matter:'||t::text,0)) THEN RAISE EXCEPTION 'MATTER_BUSY';END IF;
 IF body_command='create' THEN
  IF keys IS DISTINCT FROM ARRAY['command','matterType','nextAction','owningArea','reason','responsibleId',
    'sourceNormId','sourceNormVersion','targetDate','title']
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  IF jsonb_typeof(d->'sourceNormId') IS DISTINCT FROM 'string'
   OR d->>'sourceNormId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'sourceNormVersion') IS DISTINCT FROM 'number'
   OR d->>'sourceNormVersion'!~'^[1-9][0-9]{0,3}$' OR (d->>'sourceNormVersion')::int>1000
   OR jsonb_typeof(d->'responsibleId') IS DISTINCT FROM 'string'
   OR d->>'responsibleId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'matterType') IS DISTINCT FROM 'string'
   OR d->>'matterType' NOT IN ('revision_normativa','consulta','dictamen','proyecto')
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  IF jsonb_typeof(d->'title') IS DISTINCT FROM 'string' OR d->>'title'<>btrim(d->>'title')
   OR length(d->>'title') NOT BETWEEN 3 AND 180 OR d->>'title'~'[<>[:cntrl:]]'
   OR jsonb_typeof(d->'owningArea') IS DISTINCT FROM 'string' OR d->>'owningArea'<>btrim(d->>'owningArea')
   OR length(d->>'owningArea') NOT BETWEEN 2 AND 120 OR d->>'owningArea'~'[<>[:cntrl:]]'
   OR jsonb_typeof(d->'nextAction') IS DISTINCT FROM 'string' OR d->>'nextAction'<>btrim(d->>'nextAction')
   OR length(d->>'nextAction') NOT BETWEEN 3 AND 500 OR d->>'nextAction'~'[<>[:cntrl:]]'
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  IF jsonb_typeof(d->'targetDate') IS DISTINCT FROM 'string'
   OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string' OR d->>'reason'<>btrim(d->>'reason')
   OR length(d->>'reason') NOT BETWEEN 5 AND 500 OR d->>'reason'~'[<>[:cntrl:]]'
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  IF d->>'targetDate'<>'' THEN
   BEGIN target_day:=(d->>'targetDate')::date;
    IF d->>'targetDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR to_char(target_day,'YYYY-MM-DD')<>d->>'targetDate'
      OR target_day NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
    THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
   EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END;
  ELSE target_day:=NULL;END IF;
  source_norm:=(d->>'sourceNormId')::uuid;source_version:=(d->>'sourceNormVersion')::int;
  IF NOT EXISTS(SELECT 1 FROM public.legal_norm_revision
    WHERE tenant_id=t AND norm_id=source_norm AND version=source_version)
  THEN RAISE EXCEPTION 'MATTER_SOURCE_NOT_FOUND';END IF;
  target:=(d->>'responsibleId')::uuid;candidate:=public.legal_coordination_member_v1(t,target);
  IF candidate IS NULL THEN RAISE EXCEPTION 'MATTER_MEMBER_UNAVAILABLE';END IF;
  IF (SELECT count(*) FROM public.legal_matter WHERE tenant_id=t)>=1000 THEN RAISE EXCEPTION 'MATTER_CAPACITY';END IF;
  fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
  SELECT * INTO prior FROM public.legal_matter_event
   WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF FOUND THEN
   IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'MATTER_IDEMPOTENCY_CONFLICT';END IF;
   RETURN jsonb_build_object('version','legal-matter-receipt.v1','id',prior.matter_id,
    'revision',prior.revision,'state',prior.state,'replayed',true);
  END IF;
  INSERT INTO public.legal_matter(tenant_id,norm_id,norm_version)
   VALUES(t,source_norm,source_version) RETURNING id INTO matter;
  INSERT INTO public.legal_matter_event(
   tenant_id,matter_id,revision,state,matter_type,title,owning_area,
   responsible_membership_id,responsible_label,next_action,target_date,
   observations,evidence_article_label,evidence_note,reason,
   actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
  VALUES(t,matter,1,'assigned',d->>'matterType',d->>'title',d->>'owningArea',
   target,candidate->>'label',d->>'nextAction',target_day,'','','',d->>'reason',
   member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint);
  RETURN jsonb_build_object('version','legal-matter-receipt.v1','id',matter,
   'revision',1,'state','assigned','replayed',false);
 END IF;
 IF body_command NOT IN ('start_review','return','respond','mark_reviewed','close','cancel','reopen','reassign')
  OR keys IS DISTINCT FROM ARRAY['command','evidenceArticleLabel','evidenceNote','expectedRevision','id',
    'nextAction','observations','owningArea','reason','responsibleId','targetDate']
 THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
 IF jsonb_typeof(d->'id') IS DISTINCT FROM 'string'
  OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'expectedRevision') IS DISTINCT FROM 'number'
  OR d->>'expectedRevision'!~'^[1-9][0-9]{0,2}$' OR (d->>'expectedRevision')::int>100
  OR jsonb_typeof(d->'responsibleId') IS DISTINCT FROM 'string'
  OR d->>'responsibleId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
 IF jsonb_typeof(d->'owningArea') IS DISTINCT FROM 'string' OR d->>'owningArea'<>btrim(d->>'owningArea')
  OR length(d->>'owningArea') NOT BETWEEN 2 AND 120 OR d->>'owningArea'~'[<>[:cntrl:]]'
  OR jsonb_typeof(d->'nextAction') IS DISTINCT FROM 'string' OR d->>'nextAction'<>btrim(d->>'nextAction')
  OR length(d->>'nextAction')>500 OR d->>'nextAction'~'[<>[:cntrl:]]'
  OR jsonb_typeof(d->'targetDate') IS DISTINCT FROM 'string'
  OR jsonb_typeof(d->'observations') IS DISTINCT FROM 'string' OR d->>'observations'<>btrim(d->>'observations')
  OR length(d->>'observations')>2000 OR d->>'observations'~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'evidenceArticleLabel') IS DISTINCT FROM 'string'
  OR d->>'evidenceArticleLabel'<>btrim(d->>'evidenceArticleLabel') OR length(d->>'evidenceArticleLabel')>60
  OR d->>'evidenceArticleLabel'~'[<>[:cntrl:]]'
  OR jsonb_typeof(d->'evidenceNote') IS DISTINCT FROM 'string' OR d->>'evidenceNote'<>btrim(d->>'evidenceNote')
  OR length(d->>'evidenceNote')>2000 OR d->>'evidenceNote'~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string' OR d->>'reason'<>btrim(d->>'reason')
  OR length(d->>'reason') NOT BETWEEN 5 AND 500 OR d->>'reason'~'[<>[:cntrl:]]'
 THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
 IF d->>'targetDate'<>'' THEN
  BEGIN target_day:=(d->>'targetDate')::date;
   IF d->>'targetDate'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR to_char(target_day,'YYYY-MM-DD')<>d->>'targetDate'
    OR target_day NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'
   THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END;
 ELSE target_day:=NULL;END IF;
 matter:=(d->>'id')::uuid;
 fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior FROM public.legal_matter_event
  WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'MATTER_IDEMPOTENCY_CONFLICT';END IF;
  RETURN jsonb_build_object('version','legal-matter-receipt.v1','id',prior.matter_id,
   'revision',prior.revision,'state',prior.state,'replayed',true);
 END IF;
 SELECT * INTO current FROM public.legal_matter_event
  WHERE tenant_id=t AND matter_id=matter ORDER BY revision DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'MATTER_NOT_FOUND';END IF;
 IF current.revision<>(d->>'expectedRevision')::int THEN RAISE EXCEPTION 'MATTER_VERSION_CONFLICT';END IF;
 IF current.revision>=100 THEN RAISE EXCEPTION 'MATTER_CAPACITY';END IF;
 target:=(d->>'responsibleId')::uuid;
 IF body_command IN ('reassign','reopen') THEN candidate:=public.legal_coordination_member_v1(t,target);IF candidate IS NULL THEN RAISE EXCEPTION 'MATTER_MEMBER_UNAVAILABLE';END IF;responsible_label:=candidate->>'label';ELSE responsible_label:=current.responsible_label;END IF;
 IF body_command NOT IN ('reassign','reopen') AND (
   target<>current.responsible_membership_id OR d->>'owningArea'<>current.owning_area)
 THEN RAISE EXCEPTION 'MATTER_ASSIGNMENT_IMMUTABLE';END IF;
 IF body_command='start_review' THEN
  IF current.state<>'assigned' THEN RAISE EXCEPTION 'MATTER_TRANSITION_INVALID';END IF;
  next_state:='in_review';
 ELSIF body_command='return' THEN
  IF current.state NOT IN ('in_review','reviewed') OR length(d->>'observations')<5
   THEN RAISE EXCEPTION 'MATTER_TRANSITION_INVALID';END IF;
  next_state:='returned';
 ELSIF body_command='respond' THEN
  IF current.state<>'returned' OR length(d->>'evidenceNote')<5
   THEN RAISE EXCEPTION 'MATTER_TRANSITION_INVALID';END IF;
  next_state:='responded';
 ELSIF body_command='mark_reviewed' THEN
  IF current.state NOT IN ('in_review','responded') THEN RAISE EXCEPTION 'MATTER_TRANSITION_INVALID';END IF;
  next_state:='reviewed';
 ELSIF body_command='close' THEN
  IF current.state<>'reviewed' OR d->>'nextAction'<>'' THEN RAISE EXCEPTION 'MATTER_TRANSITION_INVALID';END IF;
  next_state:='closed';
 ELSIF body_command='cancel' THEN
  IF current.state IN ('closed','cancelled') OR d->>'nextAction'<>'' THEN RAISE EXCEPTION 'MATTER_TRANSITION_INVALID';END IF;
  next_state:='cancelled';
 ELSIF body_command='reopen' THEN
  IF current.state NOT IN ('closed','cancelled') OR length(d->>'nextAction')<3
   THEN RAISE EXCEPTION 'MATTER_TRANSITION_INVALID';END IF;
  next_state:='assigned';
 ELSIF body_command='reassign' THEN
  IF current.state IN ('closed','cancelled') OR length(d->>'nextAction')<3
   THEN RAISE EXCEPTION 'MATTER_TRANSITION_INVALID';END IF;
  next_state:=current.state;
  changed:=target IS DISTINCT FROM current.responsible_membership_id
   OR d->>'owningArea' IS DISTINCT FROM current.owning_area
   OR d->>'nextAction' IS DISTINCT FROM current.next_action
   OR target_day IS DISTINCT FROM current.target_date;
  IF NOT changed THEN RAISE EXCEPTION 'MATTER_NO_CHANGE';END IF;
 END IF;
 IF next_state NOT IN ('closed','cancelled') AND length(d->>'nextAction')<3
 THEN RAISE EXCEPTION 'MATTER_TRANSITION_INVALID';END IF;
 IF body_command='return' THEN
  IF length(d->>'observations')<5 OR d->>'evidenceArticleLabel'<>'' OR d->>'evidenceNote'<>''
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  obs:=d->>'observations';ev_article:=current.evidence_article_label;ev_note:=current.evidence_note;
 ELSIF body_command='respond' THEN
  IF d->>'observations'<>'' OR length(d->>'evidenceNote')<5
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  obs:=current.observations;ev_article:=d->>'evidenceArticleLabel';ev_note:=d->>'evidenceNote';
  IF ev_article<>'' THEN
   SELECT r.metadata INTO source_meta FROM public.legal_matter m
    JOIN public.legal_norm_revision r ON r.tenant_id=m.tenant_id AND r.norm_id=m.norm_id AND r.version=m.norm_version
    WHERE m.tenant_id=t AND m.id=matter;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(source_meta->'articles') a WHERE a->>'label'=ev_article)
   THEN RAISE EXCEPTION 'MATTER_EVIDENCE_NOT_FOUND';END IF;
  END IF;
 ELSIF body_command='reopen' THEN
  IF d->>'observations'<>'' OR d->>'evidenceArticleLabel'<>'' OR d->>'evidenceNote'<>''
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  obs:='';ev_article:='';ev_note:='';
 ELSE
  IF d->>'observations'<>'' OR d->>'evidenceArticleLabel'<>'' OR d->>'evidenceNote'<>''
  THEN RAISE EXCEPTION 'MATTER_INPUT_INVALID';END IF;
  obs:=current.observations;ev_article:=current.evidence_article_label;ev_note:=current.evidence_note;
 END IF;
 rev:=current.revision+1;
 INSERT INTO public.legal_matter_event(
  tenant_id,matter_id,revision,state,matter_type,title,owning_area,
  responsible_membership_id,responsible_label,next_action,target_date,
  observations,evidence_article_label,evidence_note,reason,
  actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
 VALUES(t,matter,rev,next_state,current.matter_type,current.title,d->>'owningArea',
  target,responsible_label,d->>'nextAction',target_day,
  obs,ev_article,ev_note,d->>'reason',
  member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint);
 RETURN jsonb_build_object('version','legal-matter-receipt.v1','id',matter,
  'revision',rev,'state',next_state,'replayed',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'MATTER_BUSY';
END $$;
REVOKE ALL ON FUNCTION public.legal_matter_record_v1(uuid,uuid,boolean),
 public.legal_matter_operation_v1(jsonb,text,jsonb,uuid)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_matter_operation_v1(jsonb,text,jsonb,uuid)
 TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_matter_operation_v1(jsonb,text,jsonb,uuid)
 IS 'Tenant-scoped append-only legal matter workflow over an exact normative source; no validity inference, notifications or payroll effects';
