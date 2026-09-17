-- FD-P3: one signer's actual queue and exact prepared PDF. No authority/source creation or issuance.
ALTER TABLE public.firmar_signing_request ADD COLUMN document_title text NOT NULL DEFAULT 'Documento preparado'
 CHECK(length(btrim(document_title)) BETWEEN 2 AND 180 AND document_title!~'[[:cntrl:]]');
-- The existing full-row immutable-source trigger also protects document_title.
CREATE FUNCTION public.firmar_workspace_list_v1(p jsonb,q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;m uuid;f text;s text;n integer;size integer;answer jsonb;
BEGIN
 ctx:=public.firmar_actor_v1(p);t:=(ctx->>'tenantId')::uuid;m:=(ctx->>'membershipId')::uuid;
 IF jsonb_typeof(q) IS DISTINCT FROM 'object' OR octet_length(q::text)>2048 OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(q) key) IS DISTINCT FROM ARRAY['filter','page','pageSize','search'] THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END IF;
 f:=q->>'filter';s:=q->>'search';
 IF jsonb_typeof(q->'filter') IS DISTINCT FROM 'string' OR f NOT IN ('all','pending','attention','received','cancelled')
 OR jsonb_typeof(q->'search') IS DISTINCT FROM 'string' OR length(s)>120 OR btrim(s)<>s OR s~'[[:cntrl:]]'
 OR jsonb_typeof(q->'page') IS DISTINCT FROM 'number' OR q->>'page'!~'^[1-9][0-9]{0,3}$'
 OR jsonb_typeof(q->'pageSize') IS DISTINCT FROM 'number' OR q->>'pageSize' NOT IN ('10','20') THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END IF;
 n:=(q->>'page')::integer;size:=(q->>'pageSize')::integer;
 WITH visible AS MATERIALIZED(
  SELECT r.*,a.id attempt_id,a.expires_at,
   CASE WHEN a.id IS NULL THEN CASE WHEN r.state='cancelled' THEN 'cancelled' ELSE 'prepared' END ELSE public.firmar_attempt_view_v1(a,r)->>'state' END item_state
  FROM public.firmar_signing_request r
  JOIN public.firmar_signing_authority auth ON auth.id=r.authority_id AND auth.tenant_id=r.tenant_id AND auth.membership_id=r.signer_membership_id AND auth.document_kind=r.document_kind
   AND auth.version=r.authority_version AND auth.status='active' AND auth.valid_from<=statement_timestamp() AND auth.valid_until>statement_timestamp()
  LEFT JOIN public.firmar_signing_attempt a ON a.tenant_id=r.tenant_id AND a.request_id=r.id
  WHERE r.tenant_id=t AND r.signer_membership_id=m
   AND (s='' OR strpos(lower(r.document_title||' '||r.document_kind),lower(s))>0)
 ),classified AS MATERIALIZED(
  SELECT *,CASE WHEN item_state IN ('prepared','awaiting_authorization','awaiting_receipt') THEN 'pending'
   WHEN item_state IN ('outcome_unknown','expired') THEN 'attention' WHEN item_state='received_unverified' THEN 'received' ELSE 'cancelled' END bucket
  FROM visible
 ),counts AS (
  SELECT count(*) total,count(*) FILTER(WHERE bucket='pending') pending,count(*) FILTER(WHERE bucket='attention') attention,
   count(*) FILTER(WHERE bucket='received') received,count(*) FILTER(WHERE bucket='cancelled') cancelled,
   count(*) FILTER(WHERE f='all' OR bucket=f) filtered FROM classified
 ),slice AS(
  SELECT * FROM classified WHERE f='all' OR bucket=f ORDER BY created_at DESC,id DESC LIMIT size OFFSET (n-1)*size
 )
 SELECT jsonb_build_object('schema','firmar-workspace.v1','checkedAt',statement_timestamp(),'query',q,
  'counts',jsonb_build_object('all',c.total,'pending',c.pending,'attention',c.attention,'received',c.received,'cancelled',c.cancelled),
  'pagination',jsonb_build_object('page',n,'pageSize',size,'total',c.filtered,'pages',ceil(c.filtered::numeric/size)),
  'documents',(SELECT coalesce(jsonb_agg(jsonb_build_object('requestId',x.id,'title',x.document_title,'documentKind',x.document_kind,'version',x.version,
   'sourceVersionId',x.source_version_id,'sourceSha256',x.source_sha256,'sourceBytes',octet_length(x.source_pdf),'createdAt',x.created_at,'state',x.item_state,
   'attemptId',x.attempt_id,'expiresAt',x.expires_at,'canReview',x.state='prepared') ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) FROM slice x),
  'officialEmissionEnabled',false) INTO answer FROM counts c;
 RETURN answer;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END $$;
CREATE FUNCTION public.firmar_workspace_source_v1(p jsonb,request_id uuid,expected_version integer,expected_sha256 text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE source jsonb;
BEGIN
 IF request_id IS NULL OR expected_version IS NULL OR expected_version<>1 OR expected_sha256 IS NULL OR expected_sha256!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'FIRMAR_INPUT_INVALID';END IF;
 -- Existing facade rechecks live session, ownership, versioned signing authority and source state.
 source:=public.firmar_attempt_operation_v1(p,'source',jsonb_build_object('requestId',request_id));
 IF (source->>'version')::integer<>expected_version OR source->>'sourceSha256'<>expected_sha256 THEN RAISE EXCEPTION 'FIRMAR_VERSION_CONFLICT';END IF;
 RETURN jsonb_build_object('requestId',source->'requestId','version',source->'version','sourceSha256',source->'sourceSha256','pdfBase64',source->'pdfBase64');
END $$;
REVOKE ALL ON FUNCTION public.firmar_workspace_list_v1(jsonb,jsonb),public.firmar_workspace_source_v1(jsonb,uuid,integer,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.firmar_workspace_list_v1(jsonb,jsonb),public.firmar_workspace_source_v1(jsonb,uuid,integer,text) TO municontrol_actions_runtime_app;
