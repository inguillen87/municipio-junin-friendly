-- MC-E06A: aggregate selected, existing source runs. No new payroll/source writes.
CREATE TABLE IF NOT EXISTS payroll_monthly_source_read_event (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES platform_tenant(id), source_binding_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id),
 mode text NOT NULL CHECK(mode IN ('catalog','summary')), period text,
 dataset_count integer NOT NULL CHECK(dataset_count BETWEEN 0 AND 240),
 row_count integer NOT NULL CHECK(row_count BETWEEN 0 AND 1000),
 result_sha256 text NOT NULL CHECK(result_sha256 ~ '^[a-f0-9]{64}$'),
 occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
REVOKE ALL ON payroll_monthly_source_read_event FROM PUBLIC,municontrol_actions_runtime_app;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='payroll_monthly_source_read_event'::regclass
  AND tgname='payroll_monthly_source_read_event_immutable') THEN
  CREATE TRIGGER payroll_monthly_source_read_event_immutable BEFORE UPDATE OR DELETE ON payroll_monthly_source_read_event
   FOR EACH ROW EXECUTE FUNCTION employee_payroll_read_reject_change_v1();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='payroll_monthly_source_read_event'::regclass
  AND tgname='payroll_monthly_source_read_event_no_truncate') THEN
  CREATE TRIGGER payroll_monthly_source_read_event_no_truncate BEFORE TRUNCATE ON payroll_monthly_source_read_event
   FOR EACH STATEMENT EXECUTE FUNCTION employee_payroll_read_reject_change_v1();
 END IF;
END $$;

CREATE OR REPLACE FUNCTION payroll_monthly_source_summary_v1(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,
 p_period text DEFAULT NULL,p_dataset_ids uuid[] DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 ctx jsonb; selected_ids uuid[]; dataset_n integer; concept_n integer:=0;
 period_year_value integer; period_month_value integer; sources_json jsonb; rows_json jsonb; counts_json jsonb;
 scope_json jsonb:=jsonb_build_object('kind','selected_available_general','completeMonthCertified',false,
  'payrollCalculated',false,'payrollPosted',false,'official',false);
 answer jsonb; result_hash text; catalog_missing boolean; catalog_invalid boolean; catalog_conflict boolean;
 mode_value text:=CASE WHEN p_dataset_ids IS NULL THEN 'catalog' ELSE 'summary' END;
BEGIN
 -- Existing assertion owns tenant/session/release/binding locks and SoD checks.
 BEGIN
  ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 EXCEPTION WHEN OTHERS THEN
  CASE SQLERRM
   WHEN 'ACTION_RELEASE_NOT_CERTIFIED' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_RELEASE_NOT_CERTIFIED';
   WHEN 'ACTION_SOURCE_BINDING_REQUIRED' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_BINDING_REQUIRED';
   WHEN 'ACTION_SESSION_BUSY' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SESSION_BUSY';
   WHEN 'ACTION_TENANT_AUTHORITY_REQUIRED' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_CAPABILITY_REQUIRED';
   ELSE RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SESSION_INVALID';
  END CASE;
 END;
 IF NOT action_center_context_has_capability(ctx,'payroll.read') THEN
  RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_CAPABILITY_REQUIRED';
 END IF;
 IF p_period IS NOT NULL THEN
  IF p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_QUERY_INVALID'; END IF;
  period_year_value:=left(p_period,4)::integer; period_month_value:=right(p_period,2)::integer;
  IF period_year_value NOT BETWEEN 1900 AND 2100 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_QUERY_INVALID'; END IF;
 END IF;
 IF p_dataset_ids IS NOT NULL AND (p_period IS NULL OR cardinality(p_dataset_ids) NOT BETWEEN 1 AND 24
  OR array_ndims(p_dataset_ids)<>1) THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_QUERY_INVALID'; END IF;
 IF p_dataset_ids IS NOT NULL AND (array_position(p_dataset_ids,NULL) IS NOT NULL
  OR (SELECT count(DISTINCT x) FROM unnest(p_dataset_ids) x)<>cardinality(p_dataset_ids)) THEN
  RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_QUERY_INVALID';
 END IF;

 -- Scope first: foreign/missing IDs are indistinguishable; no locks on foreign rows.
 SELECT array_agg(d.id ORDER BY d.payroll_date,d.payroll_type,d.id),count(*)::integer
 INTO selected_ids,dataset_n FROM payroll_detail_dataset d
 WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.source_database=ctx->>'sourceDatabase' AND d.company_id=(ctx->>'sourceCompanyId')::bigint
  AND (p_dataset_ids IS NULL OR d.id=ANY(p_dataset_ids))
  AND (p_dataset_ids IS NOT NULL OR p_period IS NULL OR (d.source_period=period_year_value AND d.source_month=period_month_value));
 IF p_dataset_ids IS NOT NULL AND dataset_n<>cardinality(p_dataset_ids) THEN
  RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_NOT_FOUND';
 END IF;
 IF dataset_n>240 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_ROW_LIMIT'; END IF;
 selected_ids:=coalesce(selected_ids,ARRAY[]::uuid[]);
 IF EXISTS(SELECT 1 FROM payroll_detail_dataset d WHERE d.id=ANY(selected_ids) AND
  (d.source_period NOT BETWEEN 1900 AND 2100 OR d.source_month NOT BETWEEN 1 AND 12
   OR d.payroll_type !~ '^[A-Z]$' OR length(d.source_label) NOT BETWEEN 1 AND 240
   OR d.source_label ~ '[[:cntrl:]]' OR d.payroll_date NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31')) THEN
  RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_DRIFT';
 END IF;
 IF p_dataset_ids IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM payroll_detail_dataset d WHERE d.id=ANY(selected_ids)
   AND (d.source_period<>period_year_value OR d.source_month<>period_month_value)) THEN
   RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_MIXED_PERIOD';
  END IF;
  IF EXISTS(SELECT 1 FROM payroll_detail_dataset d WHERE d.id=ANY(selected_ids)
   GROUP BY d.payroll_date,d.source_period,d.source_month,d.payroll_type HAVING count(*)>1) THEN
   RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_DUPLICATE_REVISION';
  END IF;
  IF (SELECT count(DISTINCT d.source_sha256) FROM payroll_detail_dataset d WHERE d.id=ANY(selected_ids))<>1 THEN
   RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_DRIFT';
  END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('datasetId',d.id,'date',to_char(d.payroll_date,'YYYY-MM-DD'),
  'sourcePeriod',d.source_period,'sourceMonth',d.source_month,'type',d.payroll_type,
  'closureStatus',CASE d.source_closed_flag WHEN 1 THEN 'closed' WHEN 0 THEN 'open' ELSE 'unknown' END,
  'statementCount',d.statement_count,'lineCount',d.line_count,'sourceLabel',d.source_label,
  'sourceSha256',d.source_sha256,'payloadHash',d.payload_sha256,
  'importedAt',to_char(d.imported_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
  ORDER BY d.source_period DESC,d.source_month DESC,d.payroll_date,d.payroll_type,d.id),'[]'::jsonb)
 INTO sources_json FROM payroll_detail_dataset d WHERE d.id=ANY(selected_ids);

 IF p_dataset_ids IS NULL THEN
  answer:=jsonb_build_object('version','payroll-monthly-source-summary.v1','mode','catalog','period',p_period,
   'items',sources_json,'total',dataset_n,'scope',scope_json);
 ELSE
  -- Datasets/statements are immutable and delivery commits both atomically.
  -- Every selected source must retain its full line count and statement hashes.
  IF EXISTS(SELECT 1 FROM payroll_detail_dataset d LEFT JOIN LATERAL
   (SELECT count(*)::integer statements,coalesce(sum(jsonb_array_length(s.lines)),0)::integer lines
    FROM payroll_detail_statement s WHERE s.dataset_id=d.id AND s.tenant_id=p_tenant) actual ON true
   WHERE d.id=ANY(selected_ids) AND (actual.statements<>d.statement_count OR actual.lines<>d.line_count)) THEN
   RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_INCOMPLETE';
  END IF;
  IF EXISTS(SELECT 1 FROM payroll_detail_statement s WHERE s.dataset_id=ANY(selected_ids) AND s.tenant_id=p_tenant
   AND s.statement_sha256<>encode(digest(s.lines::text,'sha256'),'hex')) THEN
   RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_DRIFT';
  END IF;
  IF EXISTS(SELECT 1 FROM payroll_detail_statement s CROSS JOIN LATERAL jsonb_array_elements(s.lines) ln
   WHERE s.dataset_id=ANY(selected_ids) AND s.tenant_id=p_tenant AND
    (jsonb_typeof(ln) IS DISTINCT FROM 'object' OR jsonb_typeof(ln->'code') IS DISTINCT FROM 'string'
     OR ln->>'code' !~ '^[0-9]{1,6}$'
     OR (ln->>'amount' IS NOT NULL AND (jsonb_typeof(ln->'amount')<>'string' OR ln->>'amount' !~ '^-?(0|[1-9][0-9]{0,12})\.[0-9]{2}$'))
     OR (ln->>'quantity' IS NOT NULL AND (jsonb_typeof(ln->'quantity')<>'string' OR ln->>'quantity' !~ '^-?(0|[1-9][0-9]{0,12})\.[0-9]{2}$')))) THEN
   RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_DRIFT';
  END IF;
  IF EXISTS(SELECT 1 FROM payroll_detail_statement s CROSS JOIN LATERAL jsonb_array_elements(s.lines) ln
   WHERE s.dataset_id=ANY(selected_ids) AND s.tenant_id=p_tenant GROUP BY s.id,ln->>'code' HAVING count(*)>1) THEN
   RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_DRIFT';
  END IF;
  -- Validate definitions actually used by each source. Unused historical codes
  -- are not part of this summary and never supply a replacement definition.
  WITH used AS MATERIALIZED (
   SELECT DISTINCT d.id,ln->>'code' code,d.concept_catalog->(ln->>'code') entry
   FROM payroll_detail_statement s JOIN payroll_detail_dataset d ON d.id=s.dataset_id
   CROSS JOIN LATERAL jsonb_array_elements(s.lines) ln WHERE s.dataset_id=ANY(selected_ids) AND s.tenant_id=p_tenant
  ) SELECT EXISTS(SELECT 1 FROM used WHERE entry IS NULL),
   EXISTS(SELECT 1 FROM used WHERE entry IS NOT NULL AND
    (jsonb_typeof(entry) IS DISTINCT FROM 'object' OR jsonb_typeof(entry->'description') IS DISTINCT FROM 'string'
     OR length(btrim(entry->>'description'))=0 OR length(entry->>'description')>240 OR entry->>'description' ~ '[[:cntrl:]]'
     OR (entry->>'unit' IS NOT NULL AND (jsonb_typeof(entry->'unit')<>'string' OR length(entry->>'unit')>32 OR entry->>'unit' ~ '[[:cntrl:]]'))
     OR (entry->>'totalGroup' IS NOT NULL AND (jsonb_typeof(entry->'totalGroup')<>'string' OR entry->>'totalGroup' !~ '^[0-9]{1,6}$')))),
   EXISTS(SELECT 1 FROM used GROUP BY code HAVING count(DISTINCT jsonb_build_array(entry->>'description',entry->>'unit',entry->>'totalGroup'))>1)
  INTO catalog_missing,catalog_invalid,catalog_conflict;
  IF catalog_missing THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_INCOMPLETE'; END IF;
  IF catalog_invalid THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_DRIFT'; END IF;
  IF catalog_conflict THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_CATALOG_CONFLICT'; END IF;
  WITH lines AS MATERIALIZED (
   SELECT s.source_legajo,ln->>'code' code,ln->>'quantity' quantity,ln->>'amount' amount,
    d.concept_catalog->(ln->>'code') catalog
   FROM payroll_detail_statement s JOIN payroll_detail_dataset d ON d.id=s.dataset_id
   CROSS JOIN LATERAL jsonb_array_elements(s.lines) ln WHERE s.dataset_id=ANY(selected_ids) AND s.tenant_id=p_tenant
  ), grouped AS (
   SELECT code,min(catalog->>'description') description,min(catalog->>'unit') unit,min(catalog->>'totalGroup') total_group,
    count(*)::integer source_rows,count(DISTINCT source_legajo)::integer legajos,
    count(*) FILTER(WHERE quantity IS NULL)::integer missing_quantities,
    CASE WHEN count(*) FILTER(WHERE quantity IS NULL)=0 THEN sum(quantity::numeric)::numeric(24,2)::text ELSE NULL END quantity,
    count(*) FILTER(WHERE amount IS NULL)::integer missing_amounts,
    CASE WHEN count(*) FILTER(WHERE amount IS NULL)=0 THEN sum(amount::numeric)::numeric(24,2)::text ELSE NULL END amount
   FROM lines GROUP BY code
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('code',code,'description',description,'unit',unit,'totalGroup',total_group,
   'sourceRows',source_rows,'distinctLegajos',legajos,'missingQuantities',missing_quantities,'quantity',quantity,
   'missingAmounts',missing_amounts,'amount',amount) ORDER BY code::integer,code),'[]'::jsonb),count(*)::integer
  INTO rows_json,concept_n FROM grouped;
  IF concept_n>1000 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_ROW_LIMIT'; END IF;
  SELECT jsonb_build_object('datasetCount',dataset_n,'statementParticipations',count(*)::integer,
   'distinctLegajos',count(DISTINCT s.source_legajo)::integer,'lineCount',sum(jsonb_array_length(s.lines))::integer,
   'conceptCount',concept_n) INTO counts_json FROM payroll_detail_statement s
  WHERE s.dataset_id=ANY(selected_ids) AND s.tenant_id=p_tenant;
  answer:=jsonb_build_object('version','payroll-monthly-source-summary.v1','mode','summary','period',p_period,
   'sources',sources_json,'counts',counts_json,'rows',rows_json,'scope',scope_json);
  result_hash:=encode(digest(answer::text,'sha256'),'hex');
  answer:=answer||jsonb_build_object('reportHash',result_hash);
 END IF;
 INSERT INTO payroll_monthly_source_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,
  mode,period,dataset_count,row_count,result_sha256)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,mode_value,p_period,dataset_n,concept_n,
  coalesce(result_hash,encode(digest(answer::text,'sha256'),'hex')));
 RETURN answer;
EXCEPTION
 WHEN numeric_value_out_of_range THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SOURCE_DRIFT';
 WHEN lock_not_available THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_SOURCE_SESSION_BUSY';
END $$;
REVOKE ALL ON FUNCTION payroll_monthly_source_summary_v1(text,uuid,integer,text,uuid,uuid,text,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payroll_monthly_source_summary_v1(text,uuid,integer,text,uuid,uuid,text,uuid[]) TO municontrol_actions_runtime_app;
