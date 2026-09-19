-- Read-only completeness review of latest documentary revisions. Missing data is not a legal conclusion.
CREATE FUNCTION legal_documentary_review_v1(p jsonb,d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;t uuid;f text;pg integer;result jsonb;
BEGIN
 ctx:=legal_norm_context_v1(p,false);t:=(ctx->>'tenantId')::uuid;
 IF d IS NULL OR jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>1024
 OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(d) key) IS DISTINCT FROM ARRAY['filter','page']
 OR jsonb_typeof(d->'filter') IS DISTINCT FROM 'string' OR jsonb_typeof(d->'page') IS DISTINCT FROM 'number'
 OR d->>'filter' NOT IN ('all','no_articles','no_issue_date','no_publication_date','no_effective_date','no_topics','no_summary','projects')
 OR d->>'page'!~'^[1-9][0-9]{0,2}$' OR (d->>'page')::integer>200 THEN RAISE EXCEPTION 'LEGAL_INPUT_INVALID';END IF;
 f:=d->>'filter';pg:=(d->>'page')::integer;
 WITH latest AS (
 SELECT n.id,n.kind,n.issuer,n.number,n.year,n.current_version AS version,r.metadata->>'title' AS title,r.recorded_at,
 jsonb_build_object('no_articles',jsonb_array_length(r.metadata->'articles')=0,'no_issue_date',r.metadata->>'issueDate'='',
 'no_publication_date',r.metadata->>'publicationDate'='','no_effective_date',r.metadata->>'effectiveDate'='',
 'no_topics',r.metadata->>'topics'='','no_summary',r.metadata->>'summary'='','projects',r.metadata->>'stage'='proyecto') AS flags
 FROM legal_norm n JOIN legal_norm_revision r ON r.tenant_id=n.tenant_id AND r.norm_id=n.id AND r.version=n.current_version
 WHERE n.tenant_id=t), selected AS (SELECT * FROM latest WHERE f='all' OR (flags->>f)::boolean),
 page_rows AS (SELECT * FROM selected ORDER BY recorded_at DESC,id LIMIT 25 OFFSET (pg-1)*25)
 SELECT jsonb_build_object('version','legal-documentary-review.v1','filter',f,'page',pg,'pageSize',25,
 'total',(SELECT count(*) FROM selected),'summary',(SELECT jsonb_build_object('all',count(*),
 'no_articles',count(*) FILTER(WHERE (flags->>'no_articles')::boolean),'no_issue_date',count(*) FILTER(WHERE (flags->>'no_issue_date')::boolean),
 'no_publication_date',count(*) FILTER(WHERE (flags->>'no_publication_date')::boolean),'no_effective_date',count(*) FILTER(WHERE (flags->>'no_effective_date')::boolean),
 'no_topics',count(*) FILTER(WHERE (flags->>'no_topics')::boolean),'no_summary',count(*) FILTER(WHERE (flags->>'no_summary')::boolean),
 'projects',count(*) FILTER(WHERE (flags->>'projects')::boolean)) FROM latest),
 'rows',COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.recorded_at DESC,x.id) FROM page_rows x),'[]'::jsonb),
 'observedAt',clock_timestamp(),'legalConclusion',false) INTO result;RETURN result;
END $$;
REVOKE ALL ON FUNCTION legal_documentary_review_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION legal_documentary_review_v1(jsonb,jsonb) TO municontrol_actions_runtime_app;
COMMENT ON FUNCTION legal_documentary_review_v1(jsonb,jsonb) IS 'legal-documentary-review.v1; latest registered versions; explicit tenant session; no data mutation or inference of legal validity';
