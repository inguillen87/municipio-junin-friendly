-- MuniControl Friendly - Sprint 031
-- Historial mensual de liquidacion por legajo, tenant-bound y auditado.
-- La fachada es la unica superficie otorgada al runtime: no expone recibos,
-- conceptos, identificadores personales ni acceso SELECT a tablas canonicas.

CREATE TABLE IF NOT EXISTS employee_payroll_read_event (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_binding_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,
  actor_session_id uuid NOT NULL,
  target_contract_id uuid,
  request_sha256 char(64) NOT NULL,
  query_year smallint,
  query_page integer NOT NULL,
  query_limit smallint NOT NULL,
  result_count integer NOT NULL,
  outcome varchar(16) NOT NULL,
  event_sha256 char(64) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_payroll_read_event_pkey PRIMARY KEY (id),
  CONSTRAINT employee_payroll_read_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT employee_payroll_read_event_binding_fk
    FOREIGN KEY (tenant_id, source_binding_id)
    REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT employee_payroll_read_event_membership_fk
    FOREIGN KEY (actor_membership_id, tenant_id)
    REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT employee_payroll_read_event_session_fk
    FOREIGN KEY (actor_session_id) REFERENCES tenant_identity_session(id) ON DELETE RESTRICT,
  CONSTRAINT employee_payroll_read_event_contract_fk
    FOREIGN KEY (target_contract_id) REFERENCES employment_contract(id) ON DELETE RESTRICT,
  CONSTRAINT employee_payroll_read_event_request_hash_ck CHECK (
    request_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT employee_payroll_read_event_event_hash_ck CHECK (
    event_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT employee_payroll_read_event_year_ck CHECK (
    query_year IS NULL OR query_year BETWEEN 1900 AND 2100
  ),
  CONSTRAINT employee_payroll_read_event_page_ck CHECK (
    query_page BETWEEN 1 AND 10000
  ),
  CONSTRAINT employee_payroll_read_event_limit_ck CHECK (
    query_limit BETWEEN 1 AND 24
  ),
  CONSTRAINT employee_payroll_read_event_count_ck CHECK (
    result_count BETWEEN 0 AND 24
  ),
  CONSTRAINT employee_payroll_read_event_outcome_ck CHECK (
    outcome IN ('success', 'not_found')
  )
);

CREATE INDEX IF NOT EXISTS employee_payroll_read_event_tenant_timeline_idx
  ON employee_payroll_read_event (tenant_id, occurred_at DESC, id);
CREATE INDEX IF NOT EXISTS employee_payroll_read_event_actor_timeline_idx
  ON employee_payroll_read_event (tenant_id, actor_membership_id, occurred_at DESC, id);

CREATE OR REPLACE FUNCTION employee_payroll_read_reject_change_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'EMPLOYEE_PAYROLL_READ_APPEND_ONLY' USING ERRCODE = 'P0001';
END
$$;

DROP TRIGGER IF EXISTS employee_payroll_read_append_only_v1
  ON employee_payroll_read_event;
CREATE TRIGGER employee_payroll_read_append_only_v1
BEFORE UPDATE OR DELETE ON employee_payroll_read_event
FOR EACH ROW EXECUTE FUNCTION employee_payroll_read_reject_change_v1();

CREATE OR REPLACE FUNCTION employee_payroll_history_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_contract_id uuid,
  p_year integer DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 12
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  contract_row employment_contract%ROWTYPE;
  records_value jsonb := '[]'::jsonb;
  total_value integer := 0;
  result_count_value integer := 0;
  offset_value integer;
  event_id_value uuid := gen_random_uuid();
  event_time_value timestamptz := clock_timestamp();
  request_hash_value text;
  event_hash_value text;
  outcome_value text := 'not_found';
BEGIN
  IF p_contract_id IS NULL
     OR p_page IS NULL OR p_page < 1 OR p_page > 10000
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 24
     OR (p_year IS NOT NULL AND (p_year < 1900 OR p_year > 2100)) THEN
    RAISE EXCEPTION 'EMPLOYEE_PAYROLL_QUERY_INVALID' USING ERRCODE = 'P0001';
  END IF;

  context_value := action_center_assert_tenant_read_session_v2(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );

  IF NOT action_center_context_has_capability(context_value, 'workforce.employee.read')
     OR NOT action_center_context_has_capability(context_value, 'payroll.read') THEN
    RAISE EXCEPTION 'EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  request_hash_value := encode(digest(convert_to(jsonb_build_object(
    'tenantId', context_value->>'tenantId',
    'sourceBindingId', context_value->>'sourceBindingId',
    'membershipId', context_value->>'membershipId',
    'contractId', p_contract_id,
    'year', p_year,
    'page', p_page,
    'limit', p_limit
  )::text, 'UTF8'), 'sha256'), 'hex');

  -- No se acepta un contrato solo porque exista. Debe pertenecer a la empresa
  -- del binding certificado y a un lote GRH publicado de la misma base fuente.
  SELECT contract.* INTO contract_row
  FROM employment_contract contract
  JOIN source_import_batch batch
    ON batch.id = contract.source_batch_id
   AND batch.source_system = 'GRH'
   AND batch.source_database = context_value->>'sourceDatabase'
   AND batch.validation_state = 'published'
   AND batch.legacy_import_run_id IS NOT NULL
  WHERE contract.id = p_contract_id
    AND contract.source_system = 'GRH'
    AND contract.legacy_company_id = (context_value->>'sourceCompanyId')::bigint
  FOR SHARE OF contract, batch;

  IF FOUND THEN
    offset_value := (p_page - 1) * p_limit;
    WITH authorized_rows AS (
      SELECT fact.payroll_date AS "payrollDate",
             fact.source_period AS "sourcePeriod",
             fact.source_month AS "sourceMonth",
             fact.payroll_type AS "payrollType",
             run.closure_status AS "closureStatus",
             fact.item_count AS "itemCount",
             fact.distinct_concepts AS "distinctConcepts",
             fact.quantity_sum::text AS quantity,
             fact.total_subject_earnings::text AS "subjectEarnings",
             fact.total_non_subject_earnings::text AS "nonSubjectEarnings",
             fact.family_allowance::text AS "familyAllowance",
             fact.employee_withholdings::text AS "employeeWithholdings",
             fact.net::text AS net,
             fact.net_payable::text AS "netPayable",
             fact.employer_contributions::text AS "employerContributions",
             batch.source_cutoff AS "sourceCutoff"
      FROM payroll_monthly_fact fact
      JOIN payroll_run run
        ON run.id = fact.payroll_run_id
       AND run.source_batch_id = fact.source_batch_id
       AND run.source_system = 'GRH'
       AND run.company_source_id = contract_row.legacy_company_id::text
      JOIN source_import_batch batch
        ON batch.id = fact.source_batch_id
       AND batch.source_system = 'GRH'
       AND batch.source_database = context_value->>'sourceDatabase'
       AND batch.validation_state = 'published'
       AND batch.legacy_import_run_id IS NOT NULL
      WHERE fact.employment_contract_id = contract_row.id
        AND fact.source_system = 'GRH'
        AND (p_year IS NULL OR EXTRACT(YEAR FROM fact.payroll_date)::integer = p_year)
    ), page_rows AS (
      SELECT * FROM authorized_rows
      ORDER BY "payrollDate" DESC, "sourcePeriod" DESC,
               "sourceMonth" DESC, "payrollType"
      LIMIT p_limit OFFSET offset_value
    )
    SELECT
      (SELECT count(*)::integer FROM authorized_rows),
      COALESCE(jsonb_agg(to_jsonb(page_rows)
        ORDER BY "payrollDate" DESC, "sourcePeriod" DESC,
                 "sourceMonth" DESC, "payrollType"), '[]'::jsonb)
    INTO total_value, records_value
    FROM page_rows;
    result_count_value := jsonb_array_length(records_value);
    outcome_value := 'success';
  END IF;

  event_hash_value := encode(digest(convert_to(jsonb_build_object(
    'eventId', event_id_value,
    'occurredAt', event_time_value,
    'tenantId', context_value->>'tenantId',
    'sourceBindingId', context_value->>'sourceBindingId',
    'membershipId', context_value->>'membershipId',
    'sessionId', p_actor_session_id,
    'targetContractId', CASE WHEN outcome_value = 'success' THEN contract_row.id END,
    'requestSha256', request_hash_value,
    'year', p_year,
    'page', p_page,
    'limit', p_limit,
    'resultCount', result_count_value,
    'outcome', outcome_value
  )::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO employee_payroll_read_event (
    id, tenant_id, source_binding_id, actor_membership_id, actor_session_id,
    target_contract_id, request_sha256, query_year, query_page, query_limit,
    result_count, outcome, event_sha256, occurred_at
  ) VALUES (
    event_id_value, (context_value->>'tenantId')::uuid,
    (context_value->>'sourceBindingId')::uuid,
    (context_value->>'membershipId')::uuid, p_actor_session_id,
    CASE WHEN outcome_value = 'success' THEN contract_row.id END,
    request_hash_value, p_year, p_page, p_limit,
    result_count_value, outcome_value, event_hash_value, event_time_value
  );

  RETURN jsonb_build_object(
    'found', outcome_value = 'success',
    'items', records_value,
    'total', total_value,
    'page', p_page,
    'limit', p_limit,
    'year', p_year
  );
END
$$;

COMMENT ON TABLE employee_payroll_read_event IS
  'Auditoria append-only de lecturas nominales de historial salarial; no conserva nombre, legajo, documento ni importes.';
COMMENT ON FUNCTION employee_payroll_history_v1(
  text, uuid, integer, text, uuid, uuid, uuid, integer, integer, integer
) IS
  'Lectura execute-only tenant-bound del resumen mensual GRH; exige MFA, release, binding y capacidades nominales.';

REVOKE ALL PRIVILEGES ON TABLE employee_payroll_read_event FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE employee_payroll_read_event
  FROM municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION employee_payroll_read_reject_change_v1() FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION employee_payroll_read_reject_change_v1()
  FROM municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION employee_payroll_history_v1(
  text, uuid, integer, text, uuid, uuid, uuid, integer, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION employee_payroll_history_v1(
  text, uuid, integer, text, uuid, uuid, uuid, integer, integer, integer
) TO municontrol_actions_runtime_app;
