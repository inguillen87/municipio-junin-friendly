-- 223 · Lectura para archivos de entidades (descuentos por concepto) desde una liquidación de referencia.
-- Additive, session-bound reader like payroll_export_roster_v1 (054): payroll.read + workforce.employee.read, tenant,
-- certified source binding and company of the dataset. No writes except the existing read audit table.
-- p_concept NULL → concept list of the dataset (codes < 900 with lines, people and total).
-- p_concept '638' → every statement line of that concept with legajo, amount, repartición (line sector) and identity
--   (DNI and name only when all eligible contracts point to exactly one person, including people without DNI).
--   Contracts belong to the dataset's company: own contracts of this tenant, or unowned GRH contracts in a
--   published batch of its certified database with a legacy import run. Jurisdiction belongs to that same
--   person; a native tier takes precedence, and every contract in that tier must agree on a valid code.
--   Missing or ambiguous identity/jurisdiction is returned as NULL for review, never filled from another scope.
-- The client formats GRH «Exportacion Descuentos» (76 posiciones) from this and nothing else.
-- Read audit keeps the existing roster meaning: distinct returned legajos, not statement-line count.
-- Multiple lines per person remain available (up to 10000); the audit count is exact and never clipped.
DO $$ BEGIN
 IF to_regprocedure('public.payroll_entity_export_v1(text,uuid,integer,text,uuid,uuid,uuid,text)') IS NOT NULL THEN
  RAISE EXCEPTION 'PAYROLL_ENTITY_EXPORT_OBJECT_CONFLICT';
 END IF;
 IF to_regprocedure('public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)') IS NULL
  OR to_regprocedure('public.action_center_context_has_capability(jsonb,text)') IS NULL
  OR to_regclass('public.payroll_export_roster_read_event') IS NULL
  OR to_regrole('municontrol_actions_runtime_app') IS NULL THEN
  RAISE EXCEPTION 'PAYROLL_ENTITY_EXPORT_PREREQUISITE';
 END IF;
END $$;

CREATE FUNCTION public.payroll_entity_export_v1(p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_dataset uuid,p_concept text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; ds payroll_detail_dataset%ROWTYPE; actual_n integer; rows_json jsonb; result_n integer; audit_n integer;
BEGIN
 ctx:=action_center_assert_tenant_read_session_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT action_center_context_has_capability(ctx,'payroll.read') OR NOT action_center_context_has_capability(ctx,'workforce.employee.read') THEN
  RAISE EXCEPTION 'PAYROLL_ENTITY_EXPORT_CAPABILITY_REQUIRED';
 END IF;
 IF p_concept IS NOT NULL AND p_concept !~ '^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'PAYROLL_ENTITY_EXPORT_INPUT_INVALID'; END IF;
 SELECT * INTO ds FROM payroll_detail_dataset d
 WHERE d.id=p_dataset AND d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.company_id=(ctx->>'sourceCompanyId')::bigint AND d.source_database=ctx->>'sourceDatabase';
 IF NOT FOUND THEN RETURN jsonb_build_object('version','payroll-entity-export.v1','found',false); END IF;
 SELECT count(*) INTO actual_n FROM payroll_detail_statement s WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant;
 IF actual_n<>ds.statement_count OR actual_n>2000 THEN RAISE EXCEPTION 'PAYROLL_ENTITY_EXPORT_SOURCE_INCOMPLETE'; END IF;
 IF p_concept IS NULL THEN
  WITH listed_lines AS MATERIALIZED (
   SELECT s.source_legajo,ln->>'code' AS code,(ln->>'amount')::numeric AS amount
   FROM payroll_detail_statement s, jsonb_array_elements(s.lines) ln
   WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant AND ln->>'code' ~ '^[0-9]{1,9}$' AND (ln->>'code')::integer<900
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('code',x.code,'description',ds.concept_catalog->x.code->>'description','lines',x.lines,'people',x.people,'total',x.total::numeric(24,2)::text) ORDER BY x.code::integer),'[]'::jsonb), count(*),
   (SELECT count(DISTINCT source_legajo)::integer FROM listed_lines)
  INTO rows_json, result_n, audit_n
  FROM (SELECT code,count(*)::integer AS lines,count(DISTINCT source_legajo)::integer AS people,sum(amount) AS total
        FROM listed_lines GROUP BY code) x;
  INSERT INTO payroll_export_roster_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,dataset_id,result_count)
  VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,ds.id,audit_n);
  RETURN jsonb_build_object('version','payroll-entity-export.v1','found',true,'datasetId',ds.id,'date',to_char(ds.payroll_date,'YYYY-MM-DD'),
   'period',ds.source_period,'month',ds.source_month,'type',ds.payroll_type,'concept',NULL,'concepts',rows_json,'rows','[]'::jsonb);
 END IF;
 WITH eligible_contracts AS MATERIALIZED (
  SELECT c.legacy_legajo,c.person_id,c.jurisdiction_code,c.source_system='MUNICONTROL' AS native
  FROM employment_contract c
  WHERE c.legacy_company_id=ds.company_id
   AND EXISTS(SELECT 1 FROM payroll_detail_statement s
    WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant AND s.source_legajo=c.legacy_legajo)
   AND ((c.source_system='MUNICONTROL' AND c.tenant_id=p_tenant)
    OR (c.source_system='GRH' AND c.tenant_id IS NULL
     AND EXISTS(SELECT 1 FROM source_import_batch b
      WHERE b.id=c.source_batch_id AND b.source_system='GRH' AND b.source_database=ds.source_database
       AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL)))
 ), identities AS (
  SELECT c.legacy_legajo,count(DISTINCT i.id)::integer AS n,
   (array_agg(DISTINCT i.id ORDER BY i.id))[1] AS person_id,min(i.full_name) AS name,min(i.dni) AS dni
  FROM eligible_contracts c JOIN person_identity i ON i.id=c.person_id
  GROUP BY c.legacy_legajo
 ), jurisdictions AS (
  SELECT c.legacy_legajo,
   CASE WHEN bool_or(c.native) THEN
    CASE WHEN bool_and(coalesce(c.jurisdiction_code ~ '^[0-9]{1,4}$',false)) FILTER(WHERE c.native)
      AND count(DISTINCT c.jurisdiction_code) FILTER(WHERE c.native)=1
     THEN min(c.jurisdiction_code) FILTER(WHERE c.native) END
   ELSE
    CASE WHEN bool_and(coalesce(c.jurisdiction_code ~ '^[0-9]{1,4}$',false))
      AND count(DISTINCT c.jurisdiction_code)=1 THEN min(c.jurisdiction_code) END
   END AS code
  FROM eligible_contracts c JOIN identities i
   ON i.legacy_legajo=c.legacy_legajo AND i.n=1 AND i.person_id=c.person_id
  GROUP BY c.legacy_legajo
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'legajo',s.source_legajo,'amount',(ln->>'amount')::numeric(24,2)::text,'sector',nullif(btrim(ln->>'sector'),''),
   'contractMatches',coalesce(ident.n,0),'dni',CASE WHEN ident.n=1 THEN ident.dni END,'name',CASE WHEN ident.n=1 THEN ident.name END,
   'jurisdiction',jur.code
  ) ORDER BY length(s.source_legajo),s.source_legajo,ln->>'amount'),'[]'::jsonb), count(*), count(DISTINCT s.source_legajo)::integer
 INTO rows_json, result_n, audit_n
 FROM payroll_detail_statement s
 CROSS JOIN LATERAL jsonb_array_elements(s.lines) ln
 LEFT JOIN identities ident ON ident.legacy_legajo=s.source_legajo
 LEFT JOIN jurisdictions jur ON jur.legacy_legajo=s.source_legajo
 WHERE s.dataset_id=ds.id AND s.tenant_id=p_tenant AND ln->>'code'=p_concept;
 IF result_n>10000 THEN RAISE EXCEPTION 'PAYROLL_ENTITY_EXPORT_LIMIT'; END IF;
 INSERT INTO payroll_export_roster_read_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,dataset_id,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,ds.id,audit_n);
 RETURN jsonb_build_object('version','payroll-entity-export.v1','found',true,'datasetId',ds.id,'date',to_char(ds.payroll_date,'YYYY-MM-DD'),
  'period',ds.source_period,'month',ds.source_month,'type',ds.payroll_type,'concept',p_concept,
  'description',ds.concept_catalog->p_concept->>'description','concepts','[]'::jsonb,'rows',rows_json);
END $$;
REVOKE ALL ON FUNCTION public.payroll_entity_export_v1(text,uuid,integer,text,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payroll_entity_export_v1(text,uuid,integer,text,uuid,uuid,uuid,text) TO municontrol_actions_runtime_app;
