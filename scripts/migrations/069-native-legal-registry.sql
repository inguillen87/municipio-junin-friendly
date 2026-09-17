-- J1: private normative registry, source bytes and immutable revisions. No legal conclusions or payroll changes.
CREATE TABLE legal_norm (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 kind text NOT NULL CHECK(kind IN ('ordenanza','decreto','resolucion','disposicion','declaracion')),issuer text NOT NULL CHECK(issuer IN ('HCD','EJECUTIVO')),
 number text NOT NULL CHECK(number ~ '^[A-Z0-9][A-Z0-9./-]{0,29}$'),year integer NOT NULL CHECK(year BETWEEN 1700 AND 2200),
 current_version integer NOT NULL DEFAULT 0 CHECK(current_version>=0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,kind,issuer,number,year));
CREATE TABLE legal_norm_document (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,norm_id uuid NOT NULL,
 filename text NOT NULL CHECK(length(filename) BETWEEN 5 AND 180 AND filename !~ '[<>/\\[:cntrl:]]'),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 10 AND 2097152),sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 pages integer NOT NULL CHECK(pages BETWEEN 1 AND 30),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,norm_id,id),FOREIGN KEY(tenant_id,norm_id) REFERENCES legal_norm(tenant_id,id));
CREATE TABLE legal_norm_revision (tenant_id uuid NOT NULL,norm_id uuid NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 1000),
 document_id uuid NOT NULL,metadata jsonb NOT NULL,search_text text NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500),
 actor_membership_id uuid NOT NULL,actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),actor_email text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,norm_id,version),
 FOREIGN KEY(tenant_id,norm_id) REFERENCES legal_norm(tenant_id,id),FOREIGN KEY(tenant_id,norm_id,document_id) REFERENCES legal_norm_document(tenant_id,norm_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id));
CREATE INDEX legal_norm_revision_search ON legal_norm_revision USING gin(to_tsvector('spanish',search_text));
CREATE TABLE legal_norm_attempt (tenant_id uuid NOT NULL,actor_membership_id uuid NOT NULL,request_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),norm_id uuid NOT NULL,version integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id),
 FOREIGN KEY(tenant_id,norm_id,version) REFERENCES legal_norm_revision(tenant_id,norm_id,version));
ALTER TABLE legal_norm ENABLE ROW LEVEL SECURITY;ALTER TABLE legal_norm_document ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_norm_revision ENABLE ROW LEVEL SECURITY;ALTER TABLE legal_norm_attempt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON legal_norm,legal_norm_document,legal_norm_revision,legal_norm_attempt FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_norm_document_immutable BEFORE UPDATE OR DELETE ON legal_norm_document FOR EACH ROW EXECUTE FUNCTION reject_immutable_source_change();
CREATE TRIGGER legal_norm_revision_immutable BEFORE UPDATE OR DELETE ON legal_norm_revision FOR EACH ROW EXECUTE FUNCTION reject_immutable_source_change();
CREATE TRIGGER legal_norm_attempt_immutable BEFORE UPDATE OR DELETE ON legal_norm_attempt FOR EACH ROW EXECUTE FUNCTION reject_immutable_source_change();
CREATE TRIGGER legal_norm_document_no_truncate BEFORE TRUNCATE ON legal_norm_document FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_source_change();
CREATE TRIGGER legal_norm_revision_no_truncate BEFORE TRUNCATE ON legal_norm_revision FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_source_change();
CREATE TRIGGER legal_norm_attempt_no_truncate BEFORE TRUNCATE ON legal_norm_attempt FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_source_change();
CREATE FUNCTION legal_norm_context_v1(p jsonb,writing boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u internal_users%ROWTYPE;m tenant_membership%ROWTYPE;s tenant_identity_session%ROWTYPE;can_write boolean;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p) key) IS DISTINCT FROM ARRAY['actorEmail','actorSessionId','actorSessionVersion','membershipId','tenantId'] THEN RAISE EXCEPTION 'LEGAL_SESSION_INVALID';END IF;
 SELECT * INTO u FROM internal_users WHERE email=p->>'actorEmail' AND active AND auth_mode='managed' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_SESSION_INVALID';END IF;
 SELECT * INTO m FROM tenant_membership WHERE id=(p->>'membershipId')::uuid AND tenant_id=(p->>'tenantId')::uuid AND user_email=u.email AND status='active' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_SESSION_INVALID';END IF;
 SELECT * INTO s FROM tenant_identity_session WHERE id=(p->>'actorSessionId')::uuid AND user_email=u.email AND active_tenant_id=m.tenant_id AND session_version=(p->>'actorSessionVersion')::integer
 AND identity_version=u.identity_version AND source='membership' AND auth_level IN ('mfa','recovery') AND status='active' AND expires_at>now() AND last_seen_at>now()-interval '1 hour' FOR SHARE NOWAIT;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM platform_tenant WHERE id=m.tenant_id AND status='active') THEN RAISE EXCEPTION 'LEGAL_SESSION_INVALID';END IF;
 PERFORM tenant_iam_assert_no_sod_conflict(m.id);
 IF NOT EXISTS(SELECT 1 FROM tenant_iam_effective_capabilities(m.id) WHERE capability_key='legal.norm.read') THEN RAISE EXCEPTION 'LEGAL_FORBIDDEN';END IF;
 SELECT EXISTS(SELECT 1 FROM tenant_iam_effective_capabilities(m.id) WHERE capability_key='legal.norm.register') INTO can_write;
 IF writing AND NOT can_write THEN RAISE EXCEPTION 'LEGAL_FORBIDDEN';END IF;
 RETURN jsonb_build_object('tenantId',m.tenant_id,'membershipId',m.id,'email',u.email,'sessionId',s.id,'canRegister',can_write);
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'LEGAL_BUSY';END $$;
CREATE FUNCTION legal_norm_metadata_valid_v1(m jsonb,pages integer) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text;a jsonb;day date;
BEGIN
 IF pages IS NULL OR pages NOT BETWEEN 1 AND 30 OR jsonb_typeof(m) IS DISTINCT FROM 'object' OR octet_length(m::text)>180000 OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(m) key) IS DISTINCT FROM ARRAY['articles','effectiveDate','issueDate','publicationDate','sourceReference','stage','summary','title','topics'] THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['title','summary','sourceReference','topics','stage','issueDate','publicationDate','effectiveDate'] LOOP IF jsonb_typeof(m->k) IS DISTINCT FROM 'string' OR m->>k<>btrim(m->>k) OR m->>k ~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RETURN false;END IF;END LOOP;
 IF length(m->>'title') NOT BETWEEN 3 AND 240 OR length(m->>'summary')>4000 OR length(m->>'topics')>300 OR length(m->>'sourceReference') NOT BETWEEN 3 AND 500 OR m->>'stage' NOT IN ('proyecto','acto_registrado') THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['issueDate','publicationDate','effectiveDate'] LOOP IF m->>k<>'' THEN BEGIN day:=(m->>k)::date;IF m->>k!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char(day,'YYYY-MM-DD')<>m->>k OR day NOT BETWEEN DATE '1700-01-01' AND DATE '2200-12-31' THEN RETURN false;END IF;EXCEPTION WHEN OTHERS THEN RETURN false;END;END IF;END LOOP;
 IF jsonb_typeof(m->'articles') IS DISTINCT FROM 'array' OR jsonb_array_length(m->'articles')>150 THEN RETURN false;END IF;
 FOR a IN SELECT value FROM jsonb_array_elements(m->'articles') LOOP IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(a) key) IS DISTINCT FROM ARRAY['label','page','text'] OR jsonb_typeof(a->'label') IS DISTINCT FROM 'string' OR jsonb_typeof(a->'text') IS DISTINCT FROM 'string' OR jsonb_typeof(a->'page') IS DISTINCT FROM 'number' OR a->>'page'!~'^[0-9]{1,2}$' OR (a->>'page')::int NOT BETWEEN 1 AND pages OR length(btrim(a->>'label')) NOT BETWEEN 1 AND 60 OR length(btrim(a->>'text')) NOT BETWEEN 1 AND 12000 OR ((a->>'label')||(a->>'text'))~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RETURN false;END IF;END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(m->'articles') AS article_row(value) GROUP BY lower(btrim(article_row.value->>'label')) HAVING count(*)>1) THEN RETURN false;END IF;RETURN true;
END $$;
CREATE FUNCTION legal_norm_detail_v1(t uuid,n uuid,v integer DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('id',x.id,'kind',x.kind,'issuer',x.issuer,'number',x.number,'year',x.year,'currentVersion',x.current_version,
 'version',r.version,'metadata',r.metadata,'legalStatus','no_determinada','recordedAt',r.recorded_at,'recordedBy',r.actor_email,'reason',r.reason,
 'document',jsonb_build_object('filename',d.filename,'sha256',d.sha256,'bytes',octet_length(d.content),'pages',d.pages),
 'history',(SELECT jsonb_agg(jsonb_build_object('version',h.version,'recordedAt',h.recorded_at,'recordedBy',h.actor_email,'reason',h.reason) ORDER BY h.version DESC) FROM legal_norm_revision h WHERE h.tenant_id=t AND h.norm_id=n))
 FROM legal_norm x JOIN legal_norm_revision r ON r.norm_id=x.id AND r.tenant_id=x.tenant_id AND r.version=COALESCE(v,x.current_version)
 JOIN legal_norm_document d ON d.id=r.document_id AND d.tenant_id=r.tenant_id AND d.norm_id=r.norm_id WHERE x.id=n AND x.tenant_id=t
$$;
CREATE FUNCTION legal_norm_operation_v1(p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;member uuid;record_row legal_norm%ROWTYPE;prior legal_norm_attempt%ROWTYPE;n uuid;v integer;document_id uuid;document_pages integer;pdf bytea;fingerprint text;
 result jsonb;matches jsonb;total integer;page_number integer;query_text text;filter_kind text;filter_year integer;ident jsonb;doc jsonb;meta jsonb;keys text[];
BEGIN
 ctx:=legal_norm_context_v1(p,op IN ('save','attempt'));t:=(ctx->>'tenantId')::uuid;member:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>3145728 THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;
 IF op='bootstrap' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
  RETURN jsonb_build_object('version','legal-registry.v1','canRegister',(ctx->>'canRegister')::boolean,'total',(SELECT count(*) FROM legal_norm WHERE tenant_id=t),'storageBytes',(SELECT COALESCE(sum(octet_length(content)),0) FROM legal_norm_document WHERE tenant_id=t),'storageLimitBytes',134217728);
 ELSIF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['kind','page','q','year'] OR jsonb_typeof(d->'q') IS DISTINCT FROM 'string' OR length(d->>'q')>160 OR jsonb_typeof(d->'kind') IS DISTINCT FROM 'string' OR d->>'kind' NOT IN ('','ordenanza','decreto','resolucion','disposicion','declaracion') OR d->>'page'!~'^[0-9]{1,3}$' OR (d->>'page')::int NOT BETWEEN 1 AND 200 OR (d->>'year'<>'' AND (d->>'year'!~'^[0-9]{4}$' OR (d->>'year')::int NOT BETWEEN 1700 AND 2200)) THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
  IF jsonb_typeof(d->'page') IS DISTINCT FROM 'number' OR jsonb_typeof(d->'year') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
  query_text:=btrim(d->>'q');filter_kind:=NULLIF(d->>'kind','');filter_year:=NULLIF(d->>'year','')::int;page_number:=(d->>'page')::int;
  WITH found AS (SELECT x.id,x.kind,x.issuer,x.number,x.year,x.current_version,r.metadata->>'title' AS title,r.metadata->>'stage' AS stage,r.recorded_at
   FROM legal_norm x JOIN legal_norm_revision r ON r.norm_id=x.id AND r.tenant_id=x.tenant_id AND r.version=x.current_version
   WHERE x.tenant_id=t AND (filter_kind IS NULL OR x.kind=filter_kind) AND (filter_year IS NULL OR x.year=filter_year)
   AND (query_text='' OR to_tsvector('spanish',r.search_text)@@websearch_to_tsquery('spanish',query_text) OR strpos(lower(r.search_text),lower(query_text))>0))
  SELECT (SELECT count(*) FROM found),COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (SELECT * FROM found ORDER BY recorded_at DESC,id LIMIT 25 OFFSET (page_number-1)*25) s),'[]'::jsonb) INTO total,matches;
  RETURN jsonb_build_object('version','legal-registry.v1','total',total,'page',page_number,'pageSize',25,'rows',matches);
 ELSIF op='attempt' THEN
  IF keys IS NOT NULL OR k IS NULL THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
  SELECT * INTO prior FROM legal_norm_attempt WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-registry.v1','id',prior.norm_id,'recordVersion',prior.version,'replayed',true);
 ELSIF op IN ('detail','download') THEN
  IF keys IS DISTINCT FROM ARRAY['id','version'] OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string' OR d->>'id'!~'^[a-f0-9-]{36}$' OR (d->'version'<>'null'::jsonb AND (d->>'version'!~'^[0-9]{1,4}$' OR (d->>'version')::int NOT BETWEEN 1 AND 1000)) THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
  n:=(d->>'id')::uuid;v:=(d->>'version')::int;result:=legal_norm_detail_v1(t,n,v);
  IF result IS NULL THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND';END IF;
  IF op='detail' THEN RETURN jsonb_build_object('version','legal-registry.v1','record',result);END IF;
  SELECT jsonb_build_object('version','legal-registry.v1','contentBase64',encode(x.content,'base64'),'sha256',x.sha256,'bytes',octet_length(x.content)) INTO result
   FROM legal_norm_revision r JOIN legal_norm_document x ON x.tenant_id=r.tenant_id AND x.norm_id=r.norm_id AND x.id=r.document_id
   WHERE r.tenant_id=t AND r.norm_id=n AND r.version=COALESCE(v,(SELECT current_version FROM legal_norm WHERE id=n AND tenant_id=t));RETURN result;
 ELSIF op<>'save' THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
 IF keys IS DISTINCT FROM ARRAY['document','expectedVersion','id','identity','metadata','reason'] OR k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
 ident:=d->'identity';doc:=d->'document';meta:=d->'metadata';
 IF jsonb_typeof(ident->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(ident->'issuer') IS DISTINCT FROM 'string' OR jsonb_typeof(ident->'number') IS DISTINCT FROM 'string' OR jsonb_typeof(ident->'year') IS DISTINCT FROM 'number' OR jsonb_typeof(d->'expectedVersion') IS DISTINCT FROM 'number' OR (d->'id'<>'null'::jsonb AND (jsonb_typeof(d->'id') IS DISTINCT FROM 'string' OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')) THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'LEGAL_BUSY';END IF;
 IF jsonb_typeof(ident) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(ident) key) IS DISTINCT FROM ARRAY['issuer','kind','number','year'] OR ident->>'kind' NOT IN ('ordenanza','decreto','resolucion','disposicion','declaracion') OR ident->>'issuer' NOT IN ('HCD','EJECUTIVO') OR ident->>'number'!~'^[A-Z0-9][A-Z0-9./-]{0,29}$' OR ident->>'year'!~'^[0-9]{4}$' OR (ident->>'year')::int NOT BETWEEN 1700 AND 2200 OR d->>'expectedVersion'!~'^[0-9]{1,4}$' OR (d->>'expectedVersion')::int NOT BETWEEN 0 AND 999 OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string' OR length(btrim(d->>'reason')) NOT BETWEEN 5 AND 500 OR d->>'reason'~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
 fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('legal-norm-write:'||t::text,0));
 SELECT * INTO prior FROM legal_norm_attempt WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
 IF FOUND THEN IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'LEGAL_IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('version','legal-registry.v1','id',prior.norm_id,'recordVersion',prior.version,'replayed',true);END IF;
 IF d->'id'='null'::jsonb THEN
  IF (d->>'expectedVersion')::int<>0 OR doc='null'::jsonb THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
  IF EXISTS(SELECT 1 FROM legal_norm WHERE tenant_id=t AND kind=ident->>'kind' AND issuer=ident->>'issuer' AND number=ident->>'number' AND year=(ident->>'year')::int) THEN RAISE EXCEPTION 'LEGAL_DUPLICATE';END IF;
  IF (SELECT count(*) FROM legal_norm WHERE tenant_id=t)>=5000 THEN RAISE EXCEPTION 'LEGAL_CAPACITY';END IF;
  INSERT INTO legal_norm(tenant_id,kind,issuer,number,year) VALUES(t,ident->>'kind',ident->>'issuer',ident->>'number',(ident->>'year')::int) RETURNING * INTO record_row;n:=record_row.id;v:=1;
 ELSE
  n:=(d->>'id')::uuid;SELECT * INTO record_row FROM legal_norm WHERE id=n AND tenant_id=t FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND';END IF;
  IF record_row.current_version<>(d->>'expectedVersion')::int THEN RAISE EXCEPTION 'LEGAL_VERSION_CONFLICT';END IF;
  IF (record_row.kind,record_row.issuer,record_row.number,record_row.year) IS DISTINCT FROM (ident->>'kind',ident->>'issuer',ident->>'number',(ident->>'year')::int) THEN RAISE EXCEPTION 'LEGAL_IDENTITY_IMMUTABLE';END IF;
  v:=record_row.current_version+1;IF v>1000 THEN RAISE EXCEPTION 'LEGAL_CAPACITY';END IF;
  SELECT x.id,x.pages INTO document_id,document_pages FROM legal_norm_revision r JOIN legal_norm_document x ON x.id=r.document_id AND x.tenant_id=r.tenant_id AND x.norm_id=r.norm_id WHERE r.tenant_id=t AND r.norm_id=n AND r.version=record_row.current_version;
 END IF;
 IF doc<>'null'::jsonb THEN
  IF jsonb_typeof(doc) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(doc) key) IS DISTINCT FROM ARRAY['contentBase64','filename','pages','sha256'] OR jsonb_typeof(doc->'contentBase64') IS DISTINCT FROM 'string' OR jsonb_typeof(doc->'filename') IS DISTINCT FROM 'string' OR jsonb_typeof(doc->'sha256') IS DISTINCT FROM 'string' OR doc->>'pages'!~'^[0-9]{1,2}$' OR (doc->>'pages')::int NOT BETWEEN 1 AND 30 OR doc->>'sha256'!~'^[a-f0-9]{64}$' OR length(doc->>'filename') NOT BETWEEN 5 AND 180 OR doc->>'filename' !~ '\.pdf$' OR doc->>'filename' ~ '[<>/\\[:cntrl:]]' OR length(doc->>'contentBase64')>2796204 THEN RAISE EXCEPTION 'LEGAL_DOCUMENT_INVALID';END IF;
  BEGIN pdf:=decode(doc->>'contentBase64','base64');EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'LEGAL_DOCUMENT_INVALID';END;
  IF octet_length(pdf) NOT BETWEEN 10 AND 2097152 OR substring(pdf from 1 for 5)<>convert_to('%PDF-','UTF8') OR encode(digest(pdf,'sha256'),'hex')<>doc->>'sha256' THEN RAISE EXCEPTION 'LEGAL_DOCUMENT_INVALID';END IF;
  IF (SELECT COALESCE(sum(octet_length(content)),0) FROM legal_norm_document WHERE tenant_id=t)+octet_length(pdf)>134217728 THEN RAISE EXCEPTION 'LEGAL_CAPACITY';END IF;
  INSERT INTO legal_norm_document(tenant_id,norm_id,filename,content,sha256,pages) VALUES(t,n,doc->>'filename',pdf,doc->>'sha256',(doc->>'pages')::int) RETURNING id,pages INTO document_id,document_pages;
 END IF;
 IF document_id IS NULL OR NOT legal_norm_metadata_valid_v1(meta,document_pages) THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
 INSERT INTO legal_norm_revision(tenant_id,norm_id,version,document_id,metadata,search_text,reason,actor_membership_id,actor_session_id,actor_email)
 VALUES(t,n,v,document_id,meta,concat_ws(' ',record_row.kind,record_row.issuer,record_row.number,record_row.year,meta->>'title',meta->>'summary',meta->>'topics',meta->>'sourceReference',
 (SELECT string_agg(concat_ws(' ',a->>'label',a->>'text'),' ') FROM jsonb_array_elements(meta->'articles') a)),d->>'reason',member,(ctx->>'sessionId')::uuid,ctx->>'email');
 UPDATE legal_norm SET current_version=v WHERE id=n AND tenant_id=t;
 INSERT INTO legal_norm_attempt(tenant_id,actor_membership_id,request_key,request_sha256,norm_id,version) VALUES(t,member,k,fingerprint,n,v);
 RETURN jsonb_build_object('version','legal-registry.v1','id',n,'recordVersion',v,'replayed',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'LEGAL_DUPLICATE';WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'LEGAL_BUSY';END $$;
REVOKE ALL ON FUNCTION legal_norm_context_v1(jsonb,boolean),legal_norm_metadata_valid_v1(jsonb,integer),legal_norm_detail_v1(uuid,uuid,integer),legal_norm_operation_v1(jsonb,text,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION legal_norm_operation_v1(jsonb,text,jsonb,uuid) TO municontrol_actions_runtime_app;
INSERT INTO iam_capability(capability_key,label,description,scope_kind,sensitivity) VALUES
 ('legal.norm.read','Consultar registro normativo','Consulta de fichas, versiones y originales privados del municipio. No incluye expedientes reservados.','tenant','privileged'),
 ('legal.norm.register','Registrar normas y versiones','Registro documental y correcciones auditadas. No certifica vigencia, firma ni validez jurídica.','tenant','privileged');
INSERT INTO iam_role_capability(role_key,capability_key) SELECT r.role_key,c.capability_key FROM iam_role r CROSS JOIN iam_capability c
 WHERE r.scope_kind='tenant' AND r.role_key IN ('PLATFORM_OWNER_OPERATIVO_INTEGRAL','MUNICIPIO_ADMIN_OPERATIVO','NOMINA_GESTION_INTEGRAL','HUGO_APROBADOR_INTEGRAL') AND c.capability_key IN ('legal.norm.read','legal.norm.register');
