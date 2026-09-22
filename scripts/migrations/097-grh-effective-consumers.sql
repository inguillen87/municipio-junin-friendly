-- 097: effective-source readers and preflight. Install after096 in the publication transaction.
-- No canonical history rewrite, salary calculation, new authority or IAM grant.
-- Runtime facades retain existing SECURITY DEFINER, source/session checks and ACL.
-- Reprocessing snapshots intentionally keep the real historical payroll_run FK.
DO $prerequisite$
BEGIN
 IF to_regclass('public.grh_effective_source_binding') IS NULL
  OR to_regclass('public.grh_effective_payroll_run_v1') IS NULL
  OR to_regclass('public.grh_effective_payroll_monthly_fact_v1') IS NULL
  OR to_regclass('public.grh_effective_employment_movement_v1') IS NULL
 THEN RAISE EXCEPTION 'GRH_EFFECTIVE_PREREQUISITE_REQUIRED'; END IF;
END
$prerequisite$;

-- Metadata follows the selected binding or its certified current contracts before
-- activation. An unrelated staged/latest import can never become display metadata.
CREATE OR REPLACE VIEW public.grh_effective_source_batch_v1 AS
SELECT DISTINCT batch.*
FROM public.platform_tenant_source_binding binding
LEFT JOIN public.grh_effective_source_binding selected
 ON selected.source_binding_id=binding.id AND selected.tenant_id=binding.tenant_id
JOIN public.source_import_batch batch ON batch.source_system=binding.source_system
 AND batch.source_database=binding.source_database AND batch.validation_state='published'
JOIN public.data_import_runs imported ON imported.id=batch.legacy_import_run_id
 AND imported.status='completed' AND lower(imported.source_sha256)=lower(batch.source_sha256)
 AND imported.source_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires'=batch.source_cutoff
WHERE binding.verified IS TRUE AND binding.source_system='GRH'
 AND ((selected.source_batch_id=batch.id AND selected.import_run_id=imported.id)
  OR (selected.source_batch_id IS NULL AND EXISTS (
   SELECT 1 FROM public.employment_contract contract
   WHERE contract.source_system='GRH' AND contract.legacy_company_id=binding.source_company_id
    AND contract.source_batch_id=batch.id)));
REVOKE ALL ON public.grh_effective_source_batch_v1 FROM PUBLIC;
REVOKE ALL ON public.grh_effective_source_batch_v1 FROM municontrol_actions_runtime_app;

-- action_center_case_source_context_v1: preserve signature, authority, audit, ACL and replay order.
DO $patch_0$
DECLARE signature regprocedure := 'public.action_center_case_source_context_v1(uuid,uuid,uuid)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc, E'\r\n', E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash := encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='4da868f551b49e5bcbc2c662e01979b2dc0827afb59149445161ae4d7e45ff1c' THEN RETURN; END IF;
 IF current_hash<>'819905c315aef347da8555e7aa5966eb35bfd0221ff91b02e35a8d1bb9a8adbc' THEN RAISE EXCEPTION 'GRH_CONSUMER_FUNCTION_DRIFT: %',signature; END IF;
 definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
 changes := $changes$[["identity.full_name, identity.dni, identity.cuil, identity.birth_date,","identity.full_name, identity.dni, identity.cuil, identity.birth_date, identity.sex_code,"],["      -- Compare the current canonical identity too; a reused UUID alone is not evidence.\n      AND NULLIF(btrim(new_payload #>> '{identity,fullName}'), '') IS NOT DISTINCT FROM full_name\n      AND NULLIF(normalize_digits(new_payload #>> '{identity,documentNumber}'), '') IS NOT DISTINCT FROM dni\n      AND (CASE WHEN is_valid_cuil(new_payload #>> '{identity,cuil}')\n        THEN normalize_digits(new_payload #>> '{identity,cuil}') END) IS NOT DISTINCT FROM cuil\n      -- Casting is guarded independently: malformed source dates must hide, never abort a list.\n      AND CASE WHEN COALESCE(new_payload #>> '{identity,birthDate}', '') = '' THEN birth_date IS NULL\n        WHEN new_payload #>> '{identity,birthDate}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'\n          AND pg_input_is_valid(new_payload #>> '{identity,birthDate}', 'date')\n        THEN (CASE WHEN (new_payload #>> '{identity,birthDate}')::date\n          BETWEEN DATE '1900-01-01' AND current_cutoff::date\n          THEN (new_payload #>> '{identity,birthDate}')::date END) IS NOT DISTINCT FROM birth_date\n        ELSE false END\n","      -- Accept one complete source-backed profile. Never combine fields from\n      -- the legacy curated identity and the canonical identity-master profile.\n      AND CASE WHEN COALESCE(new_payload #>> '{identity,birthDate}', '') = '' THEN true\n        WHEN new_payload #>> '{identity,birthDate}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'\n          THEN pg_input_is_valid(new_payload #>> '{identity,birthDate}', 'date')\n        ELSE false END\n      AND EXISTS (\n        SELECT 1 FROM (SELECT\n          CASE WHEN is_valid_cuil(new_payload #>> '{identity,cuil}')\n            THEN normalize_digits(new_payload #>> '{identity,cuil}') END AS expected_cuil,\n          NULLIF(normalize_digits(new_payload #>> '{identity,documentNumber}'), '') AS legacy_dni,\n          CASE WHEN length(ltrim(normalize_digits(new_payload #>> '{identity,documentNumber}'), '0')) BETWEEN 6 AND 8\n            THEN ltrim(normalize_digits(new_payload #>> '{identity,documentNumber}'), '0') END AS master_dni,\n          NULLIF(btrim(new_payload #>> '{identity,fullName}'), '') AS expected_name,\n          CASE WHEN new_payload #>> '{identity,birthDate}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'\n            AND pg_input_is_valid(new_payload #>> '{identity,birthDate}', 'date')\n            THEN CASE WHEN (new_payload #>> '{identity,birthDate}')::date BETWEEN DATE '1900-01-01' AND current_cutoff::date\n              THEN (new_payload #>> '{identity,birthDate}')::date END END AS expected_birth,\n          NULLIF(btrim(COALESCE(new_payload #>> '{identity,sexLabel}', new_payload #>> '{identity,sexCode}')), '') AS legacy_sex,\n          NULLIF(btrim(new_payload #>> '{identity,sexCode}'), '') AS master_sex\n        ) expected\n        WHERE (cuil, dni, full_name, birth_date, sex_code) IS NOT DISTINCT FROM\n          (expected_cuil, legacy_dni, expected_name, expected_birth, legacy_sex)\n          OR (cuil, dni, full_name, birth_date, sex_code) IS NOT DISTINCT FROM\n          (expected_cuil, master_dni, expected_name, expected_birth, master_sex)\n      )\n"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CONSUMER_ANCHOR_MISSING: %',signature; END IF;
  definition := replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature) NOT IN ('4da868f551b49e5bcbc2c662e01979b2dc0827afb59149445161ae4d7e45ff1c')
 THEN RAISE EXCEPTION 'GRH_CONSUMER_PATCH_FAILED: %',signature; END IF;
END
$patch_0$;

-- employee_payroll_detail_v1: preserve signature, authority, audit, ACL and replay order.
DO $patch_1$
DECLARE signature regprocedure := 'public.employee_payroll_detail_v1(text,uuid,integer,text,uuid,uuid,uuid,date,text,integer,integer)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc, E'\r\n', E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash := encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='80c11c8410657b17a0739d41d11fe45c398ec309f26d5db3ea819c83eda1b827' OR current_hash='c772dbca2437db351364cd34a572bc2c09185a21715b1504a09390d44f73db2e' THEN RETURN; END IF;
 IF current_hash<>'a085d3f9b1f6b822581ce650aca6de4f82e7ccaa7768532731175c45fd000d28' AND current_hash<>'98f8dc5e7572c8c99ddaa03553f8b6e255008e1264340b9b39a4cedfdc3c6252' THEN RAISE EXCEPTION 'GRH_CONSUMER_FUNCTION_DRIFT: %',signature; END IF;
 definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
 changes := $changes$[["payroll_monthly_fact","grh_effective_payroll_monthly_fact_v1"],["JOIN payroll_run ","JOIN grh_effective_payroll_run_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CONSUMER_ANCHOR_MISSING: %',signature; END IF;
  definition := replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature) NOT IN ('80c11c8410657b17a0739d41d11fe45c398ec309f26d5db3ea819c83eda1b827', 'c772dbca2437db351364cd34a572bc2c09185a21715b1504a09390d44f73db2e')
 THEN RAISE EXCEPTION 'GRH_CONSUMER_PATCH_FAILED: %',signature; END IF;
END
$patch_1$;

-- employee_payroll_documents_v1: preserve signature, authority, audit, ACL and replay order.
DO $patch_2$
DECLARE signature regprocedure := 'public.employee_payroll_documents_v1(text,uuid,integer,text,uuid,uuid,uuid)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc, E'\r\n', E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash := encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='726d9068326a7dbc9659f2509f958d2ae062a546e0a7cd91b7b5e6abcb4cbb25' THEN RETURN; END IF;
 IF current_hash<>'50b69187dc1c460cfd1eea11bd4d78b1abf54b7abf3fd7dc483820a1bdbb2faf' THEN RAISE EXCEPTION 'GRH_CONSUMER_FUNCTION_DRIFT: %',signature; END IF;
 definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
 changes := $changes$[["payroll_monthly_fact","grh_effective_payroll_monthly_fact_v1"],["JOIN payroll_run ","JOIN grh_effective_payroll_run_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CONSUMER_ANCHOR_MISSING: %',signature; END IF;
  definition := replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature) NOT IN ('726d9068326a7dbc9659f2509f958d2ae062a546e0a7cd91b7b5e6abcb4cbb25')
 THEN RAISE EXCEPTION 'GRH_CONSUMER_PATCH_FAILED: %',signature; END IF;
END
$patch_2$;

-- employee_payroll_history_v1: preserve signature, authority, audit, ACL and replay order.
DO $patch_3$
DECLARE signature regprocedure := 'public.employee_payroll_history_v1(text,uuid,integer,text,uuid,uuid,uuid,integer,integer,integer)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc, E'\r\n', E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash := encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='75c0e1718160f906f0184e1aadec85ca795f7199b475327a479a5363bed00983' THEN RETURN; END IF;
 IF current_hash<>'2c5073eab9516106a41fa2b76557751ca402d955b21b263522ad91bb661f9cef' THEN RAISE EXCEPTION 'GRH_CONSUMER_FUNCTION_DRIFT: %',signature; END IF;
 definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
 changes := $changes$[["payroll_monthly_fact","grh_effective_payroll_monthly_fact_v1"],["JOIN payroll_run ","JOIN grh_effective_payroll_run_v1 "]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CONSUMER_ANCHOR_MISSING: %',signature; END IF;
  definition := replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature) NOT IN ('75c0e1718160f906f0184e1aadec85ca795f7199b475327a479a5363bed00983')
 THEN RAISE EXCEPTION 'GRH_CONSUMER_PATCH_FAILED: %',signature; END IF;
END
$patch_3$;

-- payroll_novelty_prepare_v1: preserve signature, authority, audit, ACL and replay order.
DO $patch_4$
DECLARE signature regprocedure := 'public.payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc, E'\r\n', E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash := encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='ab280b073c4b5ee3cb1c2e7c3f52349e83d26d987ab25da9177e031a164ef613' THEN RETURN; END IF;
 IF current_hash<>'565e51eb1bac30a4e82673dd9651eda8c5972171316fcc584e2c348351a8cdc5' THEN RAISE EXCEPTION 'GRH_CONSUMER_FUNCTION_DRIFT: %',signature; END IF;
 definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
 changes := $changes$[["public.employment_movement","public.grh_effective_employment_movement_v1"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CONSUMER_ANCHOR_MISSING: %',signature; END IF;
  definition := replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature) NOT IN ('ab280b073c4b5ee3cb1c2e7c3f52349e83d26d987ab25da9177e031a164ef613')
 THEN RAISE EXCEPTION 'GRH_CONSUMER_PATCH_FAILED: %',signature; END IF;
END
$patch_4$;

-- payroll_reprocessing_assert_context_v1: preserve signature, authority, audit, ACL and replay order.
DO $patch_5$
DECLARE signature regprocedure := 'public.payroll_reprocessing_assert_context_v1(jsonb,text)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc, E'\r\n', E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash := encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='5a47bfce55c6f7a1389a0700bf9224cd052957c9671fd320ad3a015fcc52bd09' THEN RETURN; END IF;
 IF current_hash<>'d1283ac09e89e13a4faf7db009b170364cd61669b1dadda1cb15d71e85ebc064' THEN RAISE EXCEPTION 'GRH_CONSUMER_FUNCTION_DRIFT: %',signature; END IF;
 definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
 changes := $changes$[["RETURN context_value || jsonb_build_object(\n","RETURN context_value || jsonb_build_object(\n    'actorSessionId', (p_context->>'actorSessionId')::uuid,\n    'actorSessionVersion', (p_context->>'actorSessionVersion')::integer,\n"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CONSUMER_ANCHOR_MISSING: %',signature; END IF;
  definition := replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature) NOT IN ('5a47bfce55c6f7a1389a0700bf9224cd052957c9671fd320ad3a015fcc52bd09')
 THEN RAISE EXCEPTION 'GRH_CONSUMER_PATCH_FAILED: %',signature; END IF;
END
$patch_5$;

-- payroll_reprocessing_prepare_v1: preserve signature, authority, audit, ACL and replay order.
DO $patch_6$
DECLARE signature regprocedure := 'public.payroll_reprocessing_prepare_v1(jsonb,uuid,text,text,text,uuid,text)'::regprocedure;
 current_body text; definition text; changes jsonb; change jsonb; current_hash text;
BEGIN
 SELECT replace(prosrc, E'\r\n', E'\n') INTO STRICT current_body FROM pg_proc
 WHERE oid=signature AND prosecdef IS TRUE AND proconfig=ARRAY['search_path=public, pg_temp'];
 current_hash := encode(public.digest(current_body,'sha256'),'hex');
 IF current_hash='9c7d730428e162af95c782702c81e60328859cf3d670ef83d0ad227681acbece' THEN RETURN; END IF;
 IF current_hash<>'950ac1ad975bea24c2b7c00f3988e8b5b3ab5d00977dd04935669263f5067212' THEN RAISE EXCEPTION 'GRH_CONSUMER_FUNCTION_DRIFT: %',signature; END IF;
 definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
 changes := $changes$[["WHERE run.id = p_payroll_run_id","WHERE run.id = p_payroll_run_id\n    AND EXISTS (SELECT 1 FROM public.grh_effective_payroll_run_v1 selected_run\n      WHERE selected_run.id = run.id AND selected_run.source_batch_id = run.source_batch_id)"]]$changes$::jsonb;
 FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
  IF position(change->>0 IN definition)=0 THEN RAISE EXCEPTION 'GRH_CONSUMER_ANCHOR_MISSING: %',signature; END IF;
  definition := replace(definition,change->>0,change->>1);
 END LOOP;
 EXECUTE definition;
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature) NOT IN ('9c7d730428e162af95c782702c81e60328859cf3d670ef83d0ad227681acbece')
 THEN RAISE EXCEPTION 'GRH_CONSUMER_PATCH_FAILED: %',signature; END IF;
END
$patch_6$;

CREATE OR REPLACE VIEW public.vw_empleado_actual AS
SELECT ec.id AS employment_contract_id,
       ec.person_id,
       pi.cuil,
       pi.dni,
       pi.full_name,
       ec.legacy_company_id,
       ec.legacy_legajo,
       ec.start_date,
       ec.end_date,
       ec.agreement_code,
       ec.category_code,
       ec.organization_unit_source_id,
       ec.position_source_id,
       ec.sector_source_id,
       ec.status AS contract_status,
       latest.snapshot_date,
       latest.administrative_status,
       latest.payroll_status,
       latest.payroll_run_id,
       current_run.closure_status AS payroll_closure_status,
       COALESCE(current_run.closure_status = 'closed', false) AS corrida_cerrada,
       latest.discrepancy_reason_code,
       latest.discrepancy_explanation,
       COALESCE(
         latest.administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ),
         false
       ) AS activo_administrativo,
       COALESCE(latest.payroll_status IN ('liquidated', 'preliquidated'), false)
         AS incluido_corrida_actual,
       COALESCE(latest.payroll_status IN ('liquidated', 'preliquidated'), false)
         AS activo_liquidable,
       CASE
         WHEN latest.administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ) AND latest.payroll_status = 'liquidated'
           THEN 'liquidado_en_corrida_cerrada'
         WHEN latest.administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ) AND latest.payroll_status = 'preliquidated'
           THEN 'incluido_en_corrida_abierta'
         WHEN latest.discrepancy_reason_code IS NOT NULL
           THEN latest.discrepancy_reason_code
         WHEN latest.administrative_status = 'inactive'
           THEN 'inactivo_administrativo'
         ELSE 'sin_clasificar'
       END AS estado_control
FROM employment_contract ec
JOIN person_identity pi ON pi.id = ec.person_id
LEFT JOIN LATERAL (
  SELECT ess.snapshot_date,
         ess.administrative_status,
         ess.payroll_status,
         ess.payroll_run_id,
         ess.discrepancy_reason_code,
         ess.discrepancy_explanation
  FROM employment_status_snapshot ess
  WHERE ess.employment_contract_id = ec.id
    AND ess.source_batch_id = ec.source_batch_id AND ess.source_system = ec.source_system
  ORDER BY ess.snapshot_date DESC
  LIMIT 1
) latest ON true
LEFT JOIN public.grh_effective_payroll_run_v1 current_run ON current_run.id = latest.payroll_run_id
WHERE ec.status IN ('active', 'state_error', 'unknown');

CREATE OR REPLACE VIEW public.vw_nomina_totales AS
WITH totals AS (
  SELECT run.id AS payroll_run_id,
         run.company_source_id,
         run.payroll_date,
         run.source_period,
         run.source_month,
         run.payroll_type,
         run.closure_status,
         run.source_closed_flag,
         count(DISTINCT fact.employment_contract_id)::bigint AS contracts,
         count(DISTINCT fact.employment_contract_id)
           FILTER (WHERE fact.net_payable IS NOT NULL)::bigint AS contracts_with_net_payable,
         sum(fact.item_count)::bigint AS payroll_items,
         sum(fact.quantity_sum)::numeric AS quantity_sum,
         sum(fact.technical_source_amount_sum)::numeric AS technical_source_amount_sum,
         sum(fact.employer_contributions)::numeric AS employer_contributions,
         sum(fact.social_security_taxable_base)::numeric AS social_security_taxable_base,
         sum(fact.health_taxable_base)::numeric AS health_taxable_base,
         sum(fact.total_subject_earnings)::numeric AS total_subject_earnings,
         sum(fact.total_non_subject_earnings)::numeric AS total_non_subject_earnings,
         sum(fact.family_allowance)::numeric AS family_allowance,
         sum(fact.employee_withholdings)::numeric AS employee_withholdings,
         sum(fact.employer_taxable_base)::numeric AS employer_taxable_base,
         sum(fact.net)::numeric AS net,
         sum(fact.net_payable)::numeric AS net_payable
  FROM public.grh_effective_payroll_run_v1 run
  LEFT JOIN public.grh_effective_payroll_monthly_fact_v1 fact ON fact.payroll_run_id = run.id
  GROUP BY run.id, run.company_source_id, run.payroll_date, run.source_period,
    run.source_month, run.payroll_type, run.closure_status, run.source_closed_flag
), controlled AS (
  SELECT totals.*,
         CASE
           WHEN total_subject_earnings IS NULL
             OR total_non_subject_earnings IS NULL
             OR family_allowance IS NULL
             OR employee_withholdings IS NULL
             OR net_payable IS NULL
             THEN NULL
           ELSE total_subject_earnings + total_non_subject_earnings + family_allowance
         END AS gross_payable,
         CASE
           WHEN total_subject_earnings IS NULL
             OR total_non_subject_earnings IS NULL
             OR family_allowance IS NULL
             OR employer_contributions IS NULL
             THEN NULL
           ELSE total_subject_earnings + total_non_subject_earnings
                + family_allowance + employer_contributions
         END AS employer_cost_proxy,
         CASE
           WHEN total_subject_earnings IS NULL
             OR total_non_subject_earnings IS NULL
             OR family_allowance IS NULL
             OR employee_withholdings IS NULL
             OR net_payable IS NULL
             THEN NULL
           ELSE total_subject_earnings + total_non_subject_earnings + family_allowance
                - employee_withholdings - net_payable
         END AS arithmetic_difference,
         greatest(0.01::numeric, contracts::numeric * 0.01::numeric)
           AS rounding_tolerance
  FROM totals
)
SELECT controlled.*,
       false AS technical_source_amount_is_financial_kpi,
       CASE
         WHEN arithmetic_difference IS NULL THEN false
         ELSE abs(arithmetic_difference) <= rounding_tolerance
       END AS arithmetic_reconciled,
       CASE
         WHEN closure_status = 'closed'
              AND arithmetic_difference IS NOT NULL
              AND contracts_with_net_payable = contracts
           THEN abs(arithmetic_difference) <= rounding_tolerance
         ELSE false
       END AS executive_publishable,
       'ARS'::char(3) AS currency_code,
       'nominal'::text AS monetary_basis,
       false AS inflation_adjusted
FROM controlled;

CREATE OR REPLACE VIEW public.vw_liquidacion_mensual AS
WITH totals AS (
  SELECT date_trunc('month', run.payroll_date)::date AS month,
         run.closure_status,
         count(DISTINCT run.id)::bigint AS payroll_runs,
         count(DISTINCT fact.employment_contract_id)::bigint AS contracts_with_any_fact,
         count(DISTINCT fact.employment_contract_id)
           FILTER (WHERE fact.net_payable IS NOT NULL)::bigint AS liquidated_contracts,
         sum(fact.item_count)::bigint AS payroll_items,
         sum(fact.quantity_sum)::numeric AS quantity_sum,
         sum(fact.technical_source_amount_sum)::numeric AS technical_source_amount_sum,
         sum(fact.employer_contributions)::numeric AS employer_contributions,
         sum(fact.social_security_taxable_base)::numeric AS social_security_taxable_base,
         sum(fact.health_taxable_base)::numeric AS health_taxable_base,
         sum(fact.total_subject_earnings)::numeric AS total_subject_earnings,
         sum(fact.total_non_subject_earnings)::numeric AS total_non_subject_earnings,
         sum(fact.family_allowance)::numeric AS family_allowance,
         sum(fact.employee_withholdings)::numeric AS employee_withholdings,
         sum(fact.employer_taxable_base)::numeric AS employer_taxable_base,
         sum(fact.net)::numeric AS net,
         sum(fact.net_payable)::numeric AS net_payable
  FROM public.grh_effective_payroll_run_v1 run
  JOIN public.grh_effective_payroll_monthly_fact_v1 fact ON fact.payroll_run_id = run.id
  GROUP BY date_trunc('month', run.payroll_date)::date, run.closure_status
), controlled AS (
  SELECT totals.*,
         total_subject_earnings + total_non_subject_earnings + family_allowance
           AS gross_payable,
         total_subject_earnings + total_non_subject_earnings + family_allowance
           + employer_contributions AS employer_cost_proxy,
         total_subject_earnings + total_non_subject_earnings + family_allowance
           - employee_withholdings - net_payable AS arithmetic_difference,
         greatest(0.01::numeric, liquidated_contracts::numeric * 0.01::numeric)
           AS rounding_tolerance
  FROM totals
)
SELECT controlled.*,
       false AS technical_source_amount_is_financial_kpi,
       arithmetic_difference IS NOT NULL
         AND abs(arithmetic_difference) <= rounding_tolerance AS arithmetic_reconciled,
       closure_status = 'closed'
         AND liquidated_contracts = contracts_with_any_fact
         AND arithmetic_difference IS NOT NULL
         AND abs(arithmetic_difference) <= rounding_tolerance AS executive_publishable,
       'ARS'::char(3) AS currency_code,
       'nominal'::text AS monetary_basis,
       false AS inflation_adjusted
FROM controlled;

CREATE OR REPLACE VIEW public.vw_dotacion_cierre_mensual AS
SELECT date_trunc('month', run.payroll_date)::date AS month,
       count(DISTINCT fact.employment_contract_id)::bigint AS closed_payroll_contracts
FROM public.grh_effective_payroll_run_v1 run
JOIN public.grh_effective_payroll_monthly_fact_v1 fact ON fact.payroll_run_id = run.id
WHERE run.closure_status = 'closed'
  AND fact.net_payable IS NOT NULL
GROUP BY date_trunc('month', run.payroll_date)::date;

CREATE OR REPLACE VIEW public.vw_payroll_snapshot_actual AS
WITH latest AS (
  SELECT max(snapshot_date) AS snapshot_date FROM payroll_snapshot_assignment
  WHERE source_batch_id IN (SELECT id FROM public.grh_effective_source_batch_v1)
)
SELECT assignment.*,
       run.closure_status,
       run.source_closed_flag,
       (run.closure_status = 'closed') AS payroll_run_closed
FROM payroll_snapshot_assignment assignment
JOIN latest ON latest.snapshot_date = assignment.snapshot_date
JOIN public.grh_effective_payroll_run_v1 run ON run.id = assignment.payroll_run_id;

CREATE OR REPLACE VIEW public.vw_movimientos_legajo AS
SELECT em.id,
       em.employment_contract_id,
       ec.legacy_company_id,
       ec.legacy_legajo,
       em.movement_period,
       em.payroll_type,
       em.movement_type,
       em.concept_source_id,
       em.cost_center_source_id,
       em.quantity,
       em.installment,
       em.automatic_source_value,
       em.adjustment_source_value,
       em.forced_source_value,
       em.legal_instrument,
       em.movement_status,
       em.source_id,
       em.source_batch_id
FROM public.grh_effective_employment_movement_v1 em
JOIN employment_contract ec ON ec.id = em.employment_contract_id;

CREATE OR REPLACE VIEW public.vw_estructura_actual AS
SELECT ec.organization_unit_source_id,
       ec.sector_source_id,
       ec.position_source_id,
       count(*)::bigint AS administrative_headcount,
       count(*) FILTER (WHERE current_status.payroll_status = 'liquidated')::bigint AS liquidated_headcount
FROM employment_contract ec
LEFT JOIN LATERAL (
  SELECT ess.payroll_status
  FROM employment_status_snapshot ess
  WHERE ess.employment_contract_id = ec.id
    AND ess.source_batch_id = ec.source_batch_id AND ess.source_system = ec.source_system
  ORDER BY ess.snapshot_date DESC
  LIMIT 1
) current_status ON true
WHERE ec.status IN ('active', 'state_error', 'unknown')
GROUP BY ec.organization_unit_source_id, ec.sector_source_id, ec.position_source_id;

CREATE OR REPLACE VIEW public.vw_employment_status_control AS
WITH latest_snapshot AS (
  SELECT max(snapshot_date) AS snapshot_date
  FROM employment_status_snapshot
  WHERE source_batch_id IN (SELECT id FROM public.grh_effective_source_batch_v1)
), reconciled AS (
  SELECT ess.*
  FROM employment_status_snapshot ess
  JOIN latest_snapshot latest ON latest.snapshot_date = ess.snapshot_date
  WHERE ess.source_batch_id IN (SELECT id FROM public.grh_effective_source_batch_v1)
)
SELECT snapshot_date,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         )
       )::bigint AS administrative_active,
       count(*) FILTER (
         WHERE payroll_status IN ('liquidated', 'preliquidated')
       )::bigint AS payroll_in_current_run,
       count(*) FILTER (WHERE payroll_status = 'liquidated')::bigint
         AS payroll_liquidated_closed,
       count(*) FILTER (WHERE payroll_status = 'preliquidated')::bigint
         AS payroll_preliquidated_open,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ) AND payroll_status NOT IN ('liquidated', 'preliquidated')
       )::bigint AS difference,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         ) AND payroll_status = 'unknown'
       )::bigint AS pending_payroll_source,
       count(*) FILTER (
         WHERE administrative_status IN (
           'active', 'suspended', 'leave_without_pay', 'pending_termination', 'state_error'
         )
           AND payroll_status = 'not_liquidated'
           AND (discrepancy_reason_code IS NULL OR discrepancy_explanation IS NULL)
       )::bigint AS unexplained_difference,
       bool_and(monetary_basis = 'nominal') AS monetary_values_are_nominal,
       max(run.closure_status) FILTER (WHERE reconciled.payroll_run_id IS NOT NULL)
         AS current_payroll_closure_status
FROM reconciled
LEFT JOIN public.grh_effective_payroll_run_v1 run ON run.id = reconciled.payroll_run_id
GROUP BY snapshot_date;
