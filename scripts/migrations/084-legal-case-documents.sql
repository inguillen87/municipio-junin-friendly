-- E5 phase 2a: immutable PDF documents attached to an expediente.
CREATE TABLE public.legal_case_document (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL,case_id uuid NOT NULL,
 series_id uuid NOT NULL,version integer NOT NULL CHECK(version BETWEEN 1 AND 100),supersedes_document_id uuid,
 kind text NOT NULL CHECK(kind IN ('original','antecedente','respuesta','informe','otro')),
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 240 AND title !~ '[<>[:cntrl:]]'),
 source_reference text NOT NULL CHECK(length(source_reference) BETWEEN 3 AND 500 AND source_reference !~ '[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
 filename text NOT NULL CHECK(length(filename) BETWEEN 5 AND 180 AND filename !~ '[<>/\\[:cntrl:]]'),
 content bytea NOT NULL CHECK(octet_length(content) BETWEEN 10 AND 2097152),
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),pages integer NOT NULL CHECK(pages BETWEEN 1 AND 30),
 reason text NOT NULL CHECK(length(reason) BETWEEN 5 AND 500 AND reason !~ '[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL,actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),
 actor_label text NOT NULL CHECK(length(actor_label) BETWEEN 1 AND 254),request_key uuid NOT NULL,
 request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,case_id,id),UNIQUE(tenant_id,case_id,series_id,version),
 UNIQUE(tenant_id,case_id,supersedes_document_id),UNIQUE(tenant_id,case_id,sha256),
 UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,case_id) REFERENCES public.legal_case(tenant_id,id),
 FOREIGN KEY(tenant_id,case_id,supersedes_document_id) REFERENCES public.legal_case_document(tenant_id,case_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK((version=1 AND supersedes_document_id IS NULL) OR (version>1 AND supersedes_document_id IS NOT NULL))
);
CREATE INDEX legal_case_document_case_idx ON public.legal_case_document(tenant_id,case_id,created_at DESC);
ALTER TABLE public.legal_case_document ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.legal_case_document FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER legal_case_document_immutable BEFORE UPDATE OR DELETE ON public.legal_case_document FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_source_change();
CREATE TRIGGER legal_case_document_no_truncate BEFORE TRUNCATE ON public.legal_case_document FOR EACH STATEMENT EXECUTE FUNCTION public.reject_immutable_source_change();

CREATE FUNCTION public.legal_case_document_operation_v1(p jsonb,op text,d jsonb DEFAULT '{}'::jsonb,k uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;member uuid;keys text[];case_id uuid;doc_id uuid;case_record jsonb;
 prior public.legal_case_document%ROWTYPE;old public.legal_case_document%ROWTYPE;
 pdf bytea;fingerprint text;series uuid;v integer;kind_value text;doc jsonb;rows jsonb;
 total_bytes bigint;can_manage boolean;
BEGIN
 ctx:=public.legal_norm_context_v1(p,op IN ('save','attempt'));t:=(ctx->>'tenantId')::uuid;member:=(ctx->>'membershipId')::uuid;
 IF op IS NULL OR op NOT IN ('list','download','save','attempt') OR d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>3145728 THEN RAISE EXCEPTION 'CASE_DOCUMENT_INPUT_INVALID';END IF;
 SELECT array_agg(key ORDER BY key) INTO keys FROM jsonb_object_keys(d) key;
 IF op='list' THEN
  IF keys IS DISTINCT FROM ARRAY['caseId'] OR jsonb_typeof(d->'caseId') IS DISTINCT FROM 'string' OR d->>'caseId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'CASE_DOCUMENT_INPUT_INVALID';END IF;
  case_id:=(d->>'caseId')::uuid;case_record:=public.legal_case_record_v1(t,case_id,false);IF case_record IS NULL THEN RAISE EXCEPTION 'CASE_DOCUMENT_CASE_NOT_FOUND';END IF;
  SELECT coalesce(sum(octet_length(content)),0) INTO total_bytes FROM public.legal_case_document WHERE tenant_id=t;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'seriesId',x.series_id,'version',x.version,'supersedesId',x.supersedes_document_id,'kind',x.kind,'title',x.title,'sourceReference',x.source_reference,'filename',x.filename,'sha256',x.sha256,'bytes',octet_length(x.content),'pages',x.pages,'reason',x.reason,'recordedBy',x.actor_label,'recordedAt',x.created_at,'isLatest',NOT EXISTS(SELECT 1 FROM public.legal_case_document n WHERE n.tenant_id=x.tenant_id AND n.case_id=x.case_id AND n.supersedes_document_id=x.id)) ORDER BY x.created_at DESC,x.id),'[]'::jsonb) INTO rows FROM public.legal_case_document x WHERE x.tenant_id=t AND x.case_id=case_id;
  can_manage:=(ctx->>'canRegister')::boolean AND case_record->>'state'='open';
  RETURN jsonb_build_object('version','legal-case-document-list.v1','case',jsonb_build_object('id',case_record->>'id','number',case_record->>'number','year',(case_record->>'year')::int,'state',case_record->>'state','revision',(case_record->>'revision')::int,'subject',case_record->>'subject'),'canManage',can_manage,'storageBytes',total_bytes,'storageLimitBytes',16777216,'rows',rows);
 END IF;
 IF op='download' THEN
  IF keys IS DISTINCT FROM ARRAY['id'] OR jsonb_typeof(d->'id') IS DISTINCT FROM 'string' OR d->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'CASE_DOCUMENT_INPUT_INVALID';END IF;
  doc_id:=(d->>'id')::uuid;SELECT jsonb_build_object('version','legal-case-document-download.v1','id',x.id,'filename',x.filename,'contentBase64',encode(x.content,'base64'),'sha256',x.sha256,'bytes',octet_length(x.content),'pages',x.pages) INTO rows FROM public.legal_case_document x WHERE x.tenant_id=t AND x.id=doc_id;
  IF rows IS NULL THEN RAISE EXCEPTION 'CASE_DOCUMENT_NOT_FOUND';END IF;RETURN rows;
 END IF;
 IF op IN ('save','attempt') AND (k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'CASE_DOCUMENT_INPUT_INVALID';END IF;
 IF op='attempt' THEN
  IF keys IS NOT NULL THEN RAISE EXCEPTION 'CASE_DOCUMENT_INPUT_INVALID';END IF;
  SELECT * INTO prior FROM public.legal_case_document WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASE_DOCUMENT_NOT_FOUND';END IF;
  RETURN jsonb_build_object('version','legal-case-document-receipt.v1','id',prior.id,'caseId',prior.case_id,'seriesId',prior.series_id,'documentVersion',prior.version,'replayed',true);
 END IF;
 IF keys IS DISTINCT FROM ARRAY['caseId','document','kind','reason','sourceReference','supersedesId','title']
  OR jsonb_typeof(d->'caseId') IS DISTINCT FROM 'string' OR d->>'caseId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR jsonb_typeof(d->'kind') IS DISTINCT FROM 'string' OR d->>'kind' NOT IN ('original','antecedente','respuesta','informe','otro')
  OR jsonb_typeof(d->'title') IS DISTINCT FROM 'string' OR d->>'title'<>btrim(d->>'title') OR length(d->>'title') NOT BETWEEN 3 AND 240 OR d->>'title'~'[<>[:cntrl:]]'
  OR jsonb_typeof(d->'sourceReference') IS DISTINCT FROM 'string' OR d->>'sourceReference'<>btrim(d->>'sourceReference') OR length(d->>'sourceReference') NOT BETWEEN 3 AND 500 OR d->>'sourceReference'~'[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'
  OR jsonb_typeof(d->'reason') IS DISTINCT FROM 'string' OR d->>'reason'<>btrim(d->>'reason') OR length(d->>'reason') NOT BETWEEN 5 AND 500 OR d->>'reason'~'[<>[:cntrl:]]'
  OR (d->'supersedesId'<>'null'::jsonb AND (jsonb_typeof(d->'supersedesId') IS DISTINCT FROM 'string' OR d->>'supersedesId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
 THEN RAISE EXCEPTION 'CASE_DOCUMENT_INPUT_INVALID';END IF;
 case_id:=(d->>'caseId')::uuid;case_record:=public.legal_case_record_v1(t,case_id,false);IF case_record IS NULL THEN RAISE EXCEPTION 'CASE_DOCUMENT_CASE_NOT_FOUND';END IF;IF case_record->>'state'<>'open' THEN RAISE EXCEPTION 'CASE_DOCUMENT_CASE_CLOSED';END IF;
 doc:=d->'document';
 IF jsonb_typeof(doc) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(doc) key) IS DISTINCT FROM ARRAY['contentBase64','filename','pages','sha256'] OR jsonb_typeof(doc->'contentBase64') IS DISTINCT FROM 'string' OR jsonb_typeof(doc->'filename') IS DISTINCT FROM 'string' OR jsonb_typeof(doc->'sha256') IS DISTINCT FROM 'string' OR jsonb_typeof(doc->'pages') IS DISTINCT FROM 'number' OR doc->>'pages'!~'^[0-9]{1,2}$' OR (doc->>'pages')::int NOT BETWEEN 1 AND 30 OR doc->>'sha256'!~'^[a-f0-9]{64}$' OR length(doc->>'filename') NOT BETWEEN 5 AND 180 OR lower(doc->>'filename') !~ '\.pdf$' OR doc->>'filename'~'[<>/\\[:cntrl:]]' OR length(doc->>'contentBase64')>2796204 THEN RAISE EXCEPTION 'CASE_DOCUMENT_INVALID';END IF;
 BEGIN pdf:=decode(doc->>'contentBase64','base64');EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'CASE_DOCUMENT_INVALID';END;
 IF octet_length(pdf) NOT BETWEEN 10 AND 2097152 OR substring(pdf from 1 for 5)<>convert_to('%PDF-','UTF8') OR encode(digest(pdf,'sha256'),'hex')<>doc->>'sha256' THEN RAISE EXCEPTION 'CASE_DOCUMENT_INVALID';END IF;
 IF current_setting('transaction_isolation')<>'read committed' OR NOT pg_try_advisory_xact_lock(hashtextextended('legal-case-document:'||t::text||':'||case_id::text,0)) THEN RAISE EXCEPTION 'CASE_DOCUMENT_BUSY';END IF;
 fingerprint:=encode(digest(convert_to(d::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO prior FROM public.legal_case_document WHERE tenant_id=t AND actor_membership_id=member AND request_key=k;
 IF FOUND THEN IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'CASE_DOCUMENT_IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('version','legal-case-document-receipt.v1','id',prior.id,'caseId',prior.case_id,'seriesId',prior.series_id,'documentVersion',prior.version,'replayed',true);END IF;
 IF EXISTS(SELECT 1 FROM public.legal_case_document x WHERE x.tenant_id=t AND x.case_id=case_id AND x.sha256=doc->>'sha256') THEN RAISE EXCEPTION 'CASE_DOCUMENT_DUPLICATE';END IF;
 IF (SELECT count(*) FROM public.legal_case_document WHERE tenant_id=t)>=500 OR (SELECT count(*) FROM public.legal_case_document x WHERE x.tenant_id=t AND x.case_id=case_id)>=100 THEN RAISE EXCEPTION 'CASE_DOCUMENT_CAPACITY';END IF;
 SELECT coalesce(sum(octet_length(content)),0) INTO total_bytes FROM public.legal_case_document WHERE tenant_id=t;IF total_bytes+octet_length(pdf)>16777216 THEN RAISE EXCEPTION 'CASE_DOCUMENT_CAPACITY';END IF;
 kind_value:=d->>'kind';
 IF d->'supersedesId'='null'::jsonb THEN series:=gen_random_uuid();v:=1;
 ELSE
  SELECT * INTO old FROM public.legal_case_document x WHERE x.tenant_id=t AND x.case_id=case_id AND x.id=(d->>'supersedesId')::uuid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CASE_DOCUMENT_NOT_FOUND';END IF;
  IF old.kind<>kind_value THEN RAISE EXCEPTION 'CASE_DOCUMENT_KIND_IMMUTABLE';END IF;
  IF old.version>=100 OR EXISTS(SELECT 1 FROM public.legal_case_document n WHERE n.tenant_id=t AND n.case_id=case_id AND n.supersedes_document_id=old.id) THEN RAISE EXCEPTION 'CASE_DOCUMENT_VERSION_CONFLICT';END IF;
  series:=old.series_id;v:=old.version+1;
 END IF;
 INSERT INTO public.legal_case_document(tenant_id,case_id,series_id,version,supersedes_document_id,kind,title,source_reference,filename,content,sha256,pages,reason,actor_membership_id,actor_session_id,actor_label,request_key,request_sha256)
 VALUES(t,case_id,series,v,(d->>'supersedesId')::uuid,kind_value,d->>'title',d->>'sourceReference',doc->>'filename',pdf,doc->>'sha256',(doc->>'pages')::int,d->>'reason',member,(ctx->>'sessionId')::uuid,ctx->>'email',k,fingerprint) RETURNING id INTO doc_id;
 RETURN jsonb_build_object('version','legal-case-document-receipt.v1','id',doc_id,'caseId',case_id,'seriesId',series,'documentVersion',v,'replayed',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'CASE_DOCUMENT_DUPLICATE';WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'CASE_DOCUMENT_BUSY';END $$;
REVOKE ALL ON FUNCTION public.legal_case_document_operation_v1(jsonb,text,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.legal_case_document_operation_v1(jsonb,text,jsonb,uuid) TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION public.legal_case_document_operation_v1(jsonb,text,jsonb,uuid) IS 'Immutable versioned PDF documents for an expediente; 2 MiB/file, 16 MiB/tenant; no OCR, legal validity, signature or payroll effects';
