-- E5 phase 4a: explicit, reviewed relations between exact norm revisions. No automatic legal status inference.
CREATE TABLE public.legal_norm_relation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 source_norm_id uuid NOT NULL,
 source_norm_version integer NOT NULL CHECK(source_norm_version BETWEEN 1 AND 1000),
 target_norm_id uuid NOT NULL,
 target_norm_version integer NOT NULL CHECK(target_norm_version BETWEEN 1 AND 1000),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,source_norm_id,source_norm_version)
  REFERENCES public.legal_norm_revision(tenant_id,norm_id,version),
 FOREIGN KEY(tenant_id,target_norm_id,target_norm_version)
  REFERENCES public.legal_norm_revision(tenant_id,norm_id,version),
 CHECK(source_norm_id<>target_norm_id)
);

CREATE TABLE public.legal_norm_relation_event (
 tenant_id uuid NOT NULL,
 relation_id uuid NOT NULL,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 100),
 status text NOT NULL CHECK(status IN ('declared','cancelled')),
 relation_type text NOT NULL CHECK(relation_type IN (
  'references','modifies','repeals','partially_repeals','complements','regulates','extends','other'
 )),
 source_article_label text NOT NULL CHECK(length(source_article_label)<=60 AND source_article_label !~ '[<>[:cntrl:]]'),
 target_article_label text NOT NULL CHECK(length(target_article_label)<=60 AND target_article_label !~ '[<>[:cntrl:]]'),
 basis_note text NOT NULL CHECK(length(basis_note) BETWEEN 5 AND 2000 AND basis_note !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500 AND reason !~ '[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 254),
 request_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,relation_id,sequence),
 UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,relation_id) REFERENCES public.legal_norm_relation(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
CREATE INDEX legal_norm_relation_source_idx ON public.legal_norm_relation(tenant_id,source_norm_id,source_norm_version,created_at DESC);
CREATE INDEX legal_norm_relation_target_idx ON public.legal_norm_relation(tenant_id,target_norm_id,target_norm_version,created_at DESC);
ALTER TABLE public.legal_norm_relation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_norm_relation_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_norm_relation,public.legal_norm_relation_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_norm_relation_immutable BEFORE UPDATE OR DELETE ON public.legal_norm_relation
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_norm_relation_no_truncate BEFORE TRUNCATE ON public.legal_norm_relation
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_norm_relation_event_immutable BEFORE UPDATE OR DELETE ON public.legal_norm_relation_event
 FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_norm_relation_event_no_truncate BEFORE TRUNCATE ON public.legal_norm_relation_event
 FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();

CREATE FUNCTION public.legal_norm_relation_article_exists_v1(t uuid,n uuid,v integer,label text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $$
 SELECT CASE WHEN label='' THEN true ELSE EXISTS(
  SELECT 1
  FROM public.legal_norm_revision r
  CROSS JOIN LATERAL jsonb_array_elements(r.metadata->'articles') a
  WHERE r.tenant_id=t AND r.norm_id=n AND r.version=v
   AND lower(btrim(a->>'label'))=lower(btrim(label))
 ) END
$$;

CREATE FUNCTION public.legal_norm_relation_operation_v1(
 p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $$
DECLARE
 ctx jsonb;
 t uuid;
 member uuid;
 keys text[];
 source_id uuid;
 source_version integer;
 target_id uuid;
 target_version integer;
 v_relation_id uuid;
 current public.legal_norm_relation_event%ROWTYPE;
 prior public.legal_norm_relation_event%ROWTYPE;
 fingerprint text;
 seq integer;
 command text;
 rows jsonb;
 targets jsonb;
 source_record jsonb;
 target_record jsonb;
 relation_type_value text;
 next_status text;
BEGIN
 ctx:=public.legal_norm_context_v1(p,op IN ('save','attempt'));
 t:=(ctx->>'tenantId')::uuid;
 member:=(ctx->>'membershipId')::uuid;

 IF op IS NULL OR op NOT IN ('bootstrap','target','list','detail','save','attempt')
  OR d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object'
  OR octet_length(d::text)>18000
 THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;

 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;

 IF op='bootstrap' THEN
  IF keys IS DISTINCT FROM ARRAY['sourceNormId','sourceVersion']
   OR jsonb_typeof(d->'sourceNormId') IS DISTINCT FROM 'string'
   OR d->>'sourceNormId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'sourceVersion') IS DISTINCT FROM 'number'
   OR d->>'sourceVersion' !~ '^[1-9][0-9]{0,3}$'
   OR (d->>'sourceVersion')::int>1000
  THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;

  source_id:=(d->>'sourceNormId')::uuid;
  source_version:=(d->>'sourceVersion')::int;
  source_record:=public.legal_norm_detail_v1(t,source_id,source_version);
  IF source_record IS NULL THEN RAISE EXCEPTION 'RELATION_NORM_NOT_FOUND'; END IF;

  IF (SELECT count(*) FROM public.legal_norm WHERE tenant_id=t)>1000
  THEN RAISE EXCEPTION 'RELATION_CATALOG_UNAVAILABLE'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',n.id,'kind',n.kind,'issuer',n.issuer,'number',n.number,'year',n.year,
   'currentVersion',n.current_version,'title',r.metadata->>'title'
  ) ORDER BY n.year DESC,n.kind,n.number,n.id),'[]'::jsonb)
  INTO targets
  FROM public.legal_norm n
  JOIN public.legal_norm_revision r
   ON r.tenant_id=n.tenant_id AND r.norm_id=n.id AND r.version=n.current_version
  WHERE n.tenant_id=t AND n.id<>source_id;

  RETURN jsonb_build_object(
   'version','legal-norm-relation-bootstrap.v1',
   'canManage',(ctx->>'canRegister')::boolean,
   'source',jsonb_build_object(
    'id',source_record->>'id','version',(source_record->>'version')::int,
    'currentVersion',(source_record->>'currentVersion')::int,
    'kind',source_record->>'kind','issuer',source_record->>'issuer',
    'number',source_record->>'number','year',(source_record->>'year')::int,
    'title',source_record->'metadata'->>'title',
    'articles',coalesce(source_record->'metadata'->'articles','[]'::jsonb)
   ),
   'targets',targets
  );
 END IF;

 IF op='target' THEN
  IF keys IS DISTINCT FROM ARRAY['normId','version']
   OR jsonb_typeof(d->'normId') IS DISTINCT FROM 'string'
   OR d->>'normId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'version') IS DISTINCT FROM 'number'
   OR d->>'version' !~ '^[1-9][0-9]{0,3}$'
   OR (d->>'version')::int>1000
  THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;
  target_record:=public.legal_norm_detail_v1(t,(d->>'normId')::uuid,(d->>'version')::int);
  IF target_record IS NULL THEN RAISE EXCEPTION 'RELATION_NORM_NOT_FOUND'; END IF;
  RETURN jsonb_build_object(
   'version','legal-norm-relation-target.v1',
   'target',jsonb_build_object(
    'id',target_record->>'id','version',(target_record->>'version')::int,
    'currentVersion',(target_record->>'currentVersion')::int,
    'kind',target_record->>'kind','issuer',target_record->>'issuer',
    'number',target_record->>'number','year',(target_record->>'year')::int,
    'title',target_record->'metadata'->>'title',
    'articles',coalesce(target_record->'metadata'->'articles','[]'::jsonb)
   )
  );
 END IF;

 IF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['normId']
   OR jsonb_typeof(d->'normId') IS DISTINCT FROM 'string'
   OR d->>'normId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;
  source_id:=(d->>'normId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.legal_norm WHERE tenant_id=t AND id=source_id)
  THEN RAISE EXCEPTION 'RELATION_NORM_NOT_FOUND'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',x.id,
   'source',jsonb_build_object(
    'id',x.source_norm_id,'version',x.source_norm_version,
    'kind',sn.kind,'issuer',sn.issuer,'number',sn.number,'year',sn.year,
    'title',sr.metadata->>'title'
   ),
   'target',jsonb_build_object(
    'id',x.target_norm_id,'version',x.target_norm_version,
    'kind',tn.kind,'issuer',tn.issuer,'number',tn.number,'year',tn.year,
    'title',tr.metadata->>'title'
   ),
   'sequence',e.sequence,'status',e.status,'relationType',e.relation_type,
   'sourceArticleLabel',e.source_article_label,'targetArticleLabel',e.target_article_label,
   'basisNote',e.basis_note,'reason',e.reason,'recordedBy',e.actor_label,'recordedAt',e.recorded_at
  ) ORDER BY e.recorded_at DESC,x.id),'[]'::jsonb)
  INTO rows
  FROM public.legal_norm_relation x
  JOIN public.legal_norm sn ON sn.tenant_id=x.tenant_id AND sn.id=x.source_norm_id
  JOIN public.legal_norm tn ON tn.tenant_id=x.tenant_id AND tn.id=x.target_norm_id
  JOIN public.legal_norm_revision sr
   ON sr.tenant_id=x.tenant_id AND sr.norm_id=x.source_norm_id AND sr.version=x.source_norm_version
  JOIN public.legal_norm_revision tr
   ON tr.tenant_id=x.tenant_id AND tr.norm_id=x.target_norm_id AND tr.version=x.target_norm_version
  JOIN LATERAL (
   SELECT *
   FROM public.legal_norm_relation_event q
   WHERE q.tenant_id=x.tenant_id AND q.relation_id=x.id
   ORDER BY q.sequence DESC LIMIT 1
  ) e ON true
  WHERE x.tenant_id=t AND (x.source_norm_id=source_id OR x.target_norm_id=source_id);

  IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION 'RELATION_CAPACITY'; END IF;
  RETURN jsonb_build_object(
   'version','legal-norm-relation-list.v1',
   'normId',source_id,
   'canManage',(ctx->>'canRegister')::boolean,
   'rows',rows
  );
 END IF;

 IF op='detail' THEN
  IF keys IS DISTINCT FROM ARRAY['id']
   OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string'
   OR d->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;
  v_relation_id:=(d->>'id')::uuid;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
   'sequence',e.sequence,'status',e.status,'relationType',e.relation_type,
   'sourceArticleLabel',e.source_article_label,'targetArticleLabel',e.target_article_label,
   'basisNote',e.basis_note,'reason',e.reason,'recordedBy',e.actor_label,'recordedAt',e.recorded_at
  ) ORDER BY e.sequence DESC),'[]'::jsonb)
  INTO rows
  FROM public.legal_norm_relation_event e
  WHERE e.tenant_id=t AND e.relation_id=v_relation_id;
  IF jsonb_array_length(rows)=0 THEN RAISE EXCEPTION 'RELATION_NOT_FOUND'; END IF;
  RETURN jsonb_build_object('version','legal-norm-relation-detail.v1','id',v_relation_id,'history',rows);
 END IF;

 IF op IN ('save','attempt') AND (
  k IS NULL OR k::text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 ) THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;

 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;
  SELECT * INTO prior
  FROM public.legal_norm_relation_event
  WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'RELATION_NOT_FOUND'; END IF;
  RETURN jsonb_build_object(
   'version','legal-norm-relation-receipt.v1',
   'id',prior.relation_id,'sequence',prior.sequence,'status',prior.status,'replayed',true
  );
 END IF;

 command:=d->>'command';
 IF jsonb_typeof(d->'command') IS DISTINCT FROM 'string' OR command NOT IN ('create','set_status')
 THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;

 IF current_setting('transaction_isolation')<>'read committed'
  OR NOT pg_try_advisory_xact_lock(hashtextextended('legal-norm-relation:'||t::text,0))
 THEN RAISE EXCEPTION 'RELATION_BUSY'; END IF;

 fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior
 FROM public.legal_norm_relation_event
 WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
 IF FOUND THEN
  IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'RELATION_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object(
   'version','legal-norm-relation-receipt.v1',
   'id',prior.relation_id,'sequence',prior.sequence,'status',prior.status,'replayed',true
  );
 END IF;

 IF command='create' THEN
  IF keys IS DISTINCT FROM ARRAY[
   'basisNote','command','reason','relationType','sourceArticleLabel','sourceNormId','sourceVersion',
   'targetArticleLabel','targetNormId','targetVersion'
  ] THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;

  IF jsonb_typeof(d->'sourceNormId') IS DISTINCT FROM 'string'
   OR d->>'sourceNormId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'targetNormId') IS DISTINCT FROM 'string'
   OR d->>'targetNormId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
   OR jsonb_typeof(d->'sourceVersion') IS DISTINCT FROM 'number'
   OR d->>'sourceVersion' !~ '^[1-9][0-9]{0,3}$'
   OR jsonb_typeof(d->'targetVersion') IS DISTINCT FROM 'number'
   OR d->>'targetVersion' !~ '^[1-9][0-9]{0,3}$'
   OR jsonb_typeof(d->'relationType') IS DISTINCT FROM 'string'
   OR d->>'relationType' NOT IN ('references','modifies','repeals','partially_repeals','complements','regulates','extends','other')
   OR jsonb_typeof(d->'sourceArticleLabel') IS DISTINCT FROM 'string'
   OR length(d->>'sourceArticleLabel')>60
   OR jsonb_typeof(d->'targetArticleLabel') IS DISTINCT FROM 'string'
   OR length(d->>'targetArticleLabel')>60
   OR jsonb_typeof(d->'basisNote') IS DISTINCT FROM 'string'
   OR d->>'basisNote'<>btrim(d->>'basisNote')
   OR length(d->>'basisNote') NOT BETWEEN 5 AND 2000
   OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string'
   OR d->>'reason'<>btrim(d->>'reason')
   OR length(d->>'reason') NOT BETWEEN 5 AND 500
  THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;

  source_id:=(d->>'sourceNormId')::uuid;
  target_id:=(d->>'targetNormId')::uuid;
  source_version:=(d->>'sourceVersion')::int;
  target_version:=(d->>'targetVersion')::int;
  IF source_id=target_id OR source_version>1000 OR target_version>1000
  THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.legal_norm_revision r WHERE r.tenant_id=t AND r.norm_id=source_id AND r.version=source_version)
   OR NOT EXISTS(SELECT 1 FROM public.legal_norm_revision r WHERE r.tenant_id=t AND r.norm_id=target_id AND r.version=target_version)
  THEN RAISE EXCEPTION 'RELATION_NORM_NOT_FOUND'; END IF;

  IF NOT public.legal_norm_relation_article_exists_v1(t,source_id,source_version,d->>'sourceArticleLabel')
   OR NOT public.legal_norm_relation_article_exists_v1(t,target_id,target_version,d->>'targetArticleLabel')
  THEN RAISE EXCEPTION 'RELATION_ARTICLE_NOT_FOUND'; END IF;

  IF (SELECT count(*) FROM public.legal_norm_relation WHERE tenant_id=t)>=5000
   OR (SELECT count(*) FROM public.legal_norm_relation WHERE tenant_id=t AND source_norm_id=source_id)>=500
   OR (SELECT count(*) FROM public.legal_norm_relation WHERE tenant_id=t AND (source_norm_id=source_id OR target_norm_id=source_id))>=1000
   OR (SELECT count(*) FROM public.legal_norm_relation WHERE tenant_id=t AND (source_norm_id=target_id OR target_norm_id=target_id))>=1000
  THEN RAISE EXCEPTION 'RELATION_CAPACITY'; END IF;

  relation_type_value:=d->>'relationType';

  IF EXISTS(
   SELECT 1
   FROM public.legal_norm_relation x
   JOIN LATERAL (
    SELECT e.*
    FROM public.legal_norm_relation_event e
    WHERE e.tenant_id=x.tenant_id AND e.relation_id=x.id
    ORDER BY e.sequence DESC LIMIT 1
   ) le ON true
   WHERE x.tenant_id=t
    AND x.source_norm_id=source_id AND x.source_norm_version=source_version
    AND x.target_norm_id=target_id AND x.target_norm_version=target_version
    AND le.status='declared' AND le.relation_type=relation_type_value
    AND lower(btrim(le.source_article_label))=lower(btrim(d->>'sourceArticleLabel'))
    AND lower(btrim(le.target_article_label))=lower(btrim(d->>'targetArticleLabel'))
  ) THEN RAISE EXCEPTION 'RELATION_DUPLICATE'; END IF;

  INSERT INTO public.legal_norm_relation(
   tenant_id,source_norm_id,source_norm_version,target_norm_id,target_norm_version
  ) VALUES(t,source_id,source_version,target_id,target_version)
  RETURNING id INTO v_relation_id;

  INSERT INTO public.legal_norm_relation_event(
   tenant_id,relation_id,sequence,status,relation_type,source_article_label,target_article_label,
   basis_note,reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256
  ) VALUES(
   t,v_relation_id,1,'declared',relation_type_value,d->>'sourceArticleLabel',d->>'targetArticleLabel',
   d->>'basisNote',d->>'reason',member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint
  );

  RETURN jsonb_build_object(
   'version','legal-norm-relation-receipt.v1',
   'id',v_relation_id,'sequence',1,'status','declared','replayed',false
  );
 END IF;

 IF keys IS DISTINCT FROM ARRAY['command','expectedSequence','id','reason','status']
  OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string'
  OR d->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'expectedSequence') IS DISTINCT FROM 'number'
  OR d->>'expectedSequence' !~ '^[1-9][0-9]{0,2}$'
  OR jsonb_typeof(d->'status') IS DISTINCT FROM 'string'
  OR d->>'status' NOT IN ('declared','cancelled')
  OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string'
  OR d->>'reason'<>btrim(d->>'reason')
  OR length(d->>'reason') NOT BETWEEN 5 AND 500
 THEN RAISE EXCEPTION 'RELATION_INPUT_INVALID'; END IF;

 v_relation_id:=(d->>'id')::uuid;
 SELECT * INTO current
 FROM public.legal_norm_relation_event e
 WHERE e.tenant_id=t AND e.relation_id=v_relation_id
 ORDER BY e.sequence DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'RELATION_NOT_FOUND'; END IF;
 IF current.sequence<>(d->>'expectedSequence')::int
 THEN RAISE EXCEPTION 'RELATION_VERSION_CONFLICT'; END IF;

 next_status:=d->>'status';
 IF next_status=current.status
  OR NOT (
   (current.status='declared' AND next_status='cancelled')
   OR (current.status='cancelled' AND next_status='declared')
  )
 THEN RAISE EXCEPTION 'RELATION_TRANSITION_INVALID'; END IF;

 -- A cancelled declaration may have been replaced. Reopening must obey the
 -- same active-duplicate rule as creation under the tenant transaction lock.
 IF next_status='declared' AND EXISTS(
  SELECT 1
  FROM public.legal_norm_relation original
  JOIN public.legal_norm_relation other
   ON other.tenant_id=original.tenant_id AND other.id<>original.id
   AND other.source_norm_id=original.source_norm_id
   AND other.source_norm_version=original.source_norm_version
   AND other.target_norm_id=original.target_norm_id
   AND other.target_norm_version=original.target_norm_version
  JOIN LATERAL (
   SELECT e.* FROM public.legal_norm_relation_event e
   WHERE e.tenant_id=other.tenant_id AND e.relation_id=other.id
   ORDER BY e.sequence DESC LIMIT 1
  ) le ON true
  WHERE original.tenant_id=t AND original.id=v_relation_id
   AND le.status='declared' AND le.relation_type=current.relation_type
   AND lower(btrim(le.source_article_label))=lower(btrim(current.source_article_label))
   AND lower(btrim(le.target_article_label))=lower(btrim(current.target_article_label))
 ) THEN RAISE EXCEPTION 'RELATION_DUPLICATE'; END IF;

 seq:=current.sequence+1;
 IF seq>100 THEN RAISE EXCEPTION 'RELATION_CAPACITY'; END IF;

 INSERT INTO public.legal_norm_relation_event(
  tenant_id,relation_id,sequence,status,relation_type,source_article_label,target_article_label,
  basis_note,reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256
 ) VALUES(
  t,v_relation_id,seq,next_status,current.relation_type,current.source_article_label,current.target_article_label,
  current.basis_note,d->>'reason',member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint
 );

 RETURN jsonb_build_object(
  'version','legal-norm-relation-receipt.v1',
  'id',v_relation_id,'sequence',seq,'status',next_status,'replayed',false
 );
EXCEPTION
 WHEN unique_violation THEN RAISE EXCEPTION 'RELATION_DUPLICATE';
 WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'RELATION_BUSY';
END
$$;

REVOKE ALL ON FUNCTION
 public.legal_norm_relation_article_exists_v1(uuid,uuid,integer,text),
 public.legal_norm_relation_operation_v1(jsonb,text,jsonb,uuid)
 FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_norm_relation_operation_v1(jsonb,text,jsonb,uuid)
 TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_norm_relation_operation_v1(jsonb,text,jsonb,uuid)
 IS 'Explicit human-reviewed relations between exact norm revisions. Relation types never infer legal status, repeal or validity automatically';
