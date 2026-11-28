-- 248: resolución de legajos nativos/adoptados y ampliación a 5000 novedades fijas.
-- Agrega payroll_fixed_registry_employee_v2 (resolución MUNICONTROL activo no anulado -> GRH)
-- y payroll_fixed_registry_employees_by_contracts_v1 (consulta por lote de hasta 250 UUID).
-- Mantiene intacto payroll_fixed_registry_employee_v1 (contrato GRH legado).
-- Sube el tope de registros fijos de 500 a 5000 en bootstrap/list/propose y capturas de corrida,
-- recompone los pines de municipal_adoption_ready_v1 y del atestador/familias si existen.
-- Migración autónoma sobre el esquema base 246 y definiciones vigentes.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $prereq_248$
BEGIN
 IF to_regprocedure('public.payroll_fixed_registry_context_v1(jsonb,text)') IS NULL
  OR to_regprocedure('public.payroll_fixed_registry_subject_v1(jsonb,text,boolean)') IS NULL
  OR to_regprocedure('public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)') IS NULL
  OR to_regprocedure('public.payroll_fixed_registry_bootstrap_v1(jsonb)') IS NULL
  OR to_regprocedure('public.payroll_fixed_registry_list_v1(jsonb,date)') IS NULL
  OR to_regprocedure('public.payroll_fixed_registry_propose_v1(jsonb,jsonb,uuid)') IS NULL
  OR to_regprocedure('public.own_run_fixed_v1(jsonb,date,uuid[],text)') IS NULL
  OR to_regclass('public.native_employment_void_review') IS NULL
 THEN
  RAISE EXCEPTION 'FIXED_248_PREREQUISITE';
 END IF;
END $prereq_248$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_employee_v2(p_context jsonb, p_legajo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
 ctx jsonb;
 normalized text;
 canon_num text;
 grh_legajo text;
 native_matches uuid[];
 subject_value jsonb;
BEGIN
 ctx := public.payroll_fixed_registry_context_v1(p_context);
 normalized := btrim(coalesce(p_legajo, ''));
 IF normalized = '' OR length(normalized) > 64 OR normalized ~ '[[:cntrl:]]' OR normalized ~ E'[\\u0080-\\u009f]' THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD';
 END IF;

 LOCK TABLE
  public.employment_contract,
  public.source_import_batch,
  public.person_identity,
  public.native_employee_registration,
  public.platform_tenant_source_binding,
  public.employment_adoption_application,
  public.employment_adoption_decision,
  public.employment_adoption_proposal,
  public.native_employment_lifecycle_review,
  public.native_employment_void_review
 IN SHARE MODE NOWAIT;

 IF normalized ~ '^[0-9]+$' THEN
  canon_num := coalesce(nullif(ltrim(normalized, '0'), ''), '0');
 ELSE
  canon_num := NULL;
 END IF;

 SELECT array_agg(c.id ORDER BY c.id)
   INTO native_matches
   FROM public.employment_contract c
   JOIN public.native_employee_registration r
     ON r.contract_id = c.id
    AND r.person_id = c.person_id
    AND r.tenant_id = c.tenant_id
    AND r.source_binding_id = (ctx->>'certifiedBindingId')::uuid
  WHERE c.source_system = 'MUNICONTROL'
    AND c.source_batch_id IS NULL
    AND c.tenant_id = (ctx->>'tenantId')::uuid
    AND c.legacy_company_id = (ctx->>'sourceCompanyId')::bigint
    AND c.status = 'active'
    AND c.legacy_legajo = normalized
    AND NOT EXISTS (
     SELECT 1
       FROM public.native_employment_void_review vr
      WHERE vr.tenant_id = c.tenant_id
        AND vr.source_binding_id = r.source_binding_id
        AND vr.contract_id = c.id
        AND vr.decision = 'approve'
    );

 IF coalesce(array_length(native_matches, 1), 0) = 0 AND canon_num IS NOT NULL THEN
  SELECT array_agg(c.id ORDER BY c.id)
    INTO native_matches
    FROM public.employment_contract c
    JOIN public.native_employee_registration r
      ON r.contract_id = c.id
     AND r.person_id = c.person_id
     AND r.tenant_id = c.tenant_id
     AND r.source_binding_id = (ctx->>'certifiedBindingId')::uuid
   WHERE c.source_system = 'MUNICONTROL'
     AND c.source_batch_id IS NULL
     AND c.tenant_id = (ctx->>'tenantId')::uuid
     AND c.legacy_company_id = (ctx->>'sourceCompanyId')::bigint
     AND c.status = 'active'
     AND c.legacy_legajo ~ '^[0-9]+$'
     AND coalesce(nullif(ltrim(c.legacy_legajo, '0'), ''), '0') = canon_num
     AND NOT EXISTS (
      SELECT 1
        FROM public.native_employment_void_review vr
       WHERE vr.tenant_id = c.tenant_id
         AND vr.source_binding_id = r.source_binding_id
         AND vr.contract_id = c.id
         AND vr.decision = 'approve'
     );
 END IF;

 IF coalesce(array_length(native_matches, 1), 0) > 1 THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_LEGAJO_AMBIGUOUS';
 END IF;

 IF coalesce(array_length(native_matches, 1), 0) = 1 THEN
  subject_value := public.payroll_fixed_registry_subject_v2(ctx, native_matches[1], false);
  RETURN jsonb_build_object('version', 'payroll-fixed-employee.v1', 'subject', subject_value->'subject');
 END IF;

 -- Evitar resolver como GRH previo un legajo ya adoptado/registrado en MUNICONTROL que esté inactivo o anulado.
 IF EXISTS (
  SELECT 1
    FROM public.employment_contract c
    JOIN public.native_employee_registration r
      ON r.contract_id = c.id
     AND r.person_id = c.person_id
     AND r.tenant_id = c.tenant_id
     AND r.source_binding_id = (ctx->>'certifiedBindingId')::uuid
   WHERE c.source_system = 'MUNICONTROL'
     AND c.source_batch_id IS NULL
     AND c.tenant_id = (ctx->>'tenantId')::uuid
     AND c.legacy_company_id = (ctx->>'sourceCompanyId')::bigint
     AND (
      c.legacy_legajo = normalized
      OR (
       canon_num IS NOT NULL
       AND c.legacy_legajo ~ '^[0-9]+$'
       AND coalesce(nullif(ltrim(c.legacy_legajo, '0'), ''), '0') = canon_num
      )
     )
 ) THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_LEGAJO_NOT_FOUND';
 END IF;

 IF normalized ~ '^(0|[1-9][0-9]{0,19})$' THEN
  grh_legajo := normalized;
 ELSIF canon_num IS NOT NULL AND length(canon_num) <= 20 AND canon_num ~ '^(0|[1-9][0-9]{0,19})$' THEN
  grh_legajo := canon_num;
 ELSE
  RAISE EXCEPTION 'PAYROLL_FIXED_LEGAJO_NOT_FOUND';
 END IF;

 subject_value := public.payroll_fixed_registry_subject_v1(ctx, grh_legajo, false);
 RETURN jsonb_build_object('version', 'payroll-fixed-employee.v1', 'subject', subject_value->'subject');
EXCEPTION
 WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY';
END $function$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_employees_by_contracts_v1(p_context jsonb, p_contracts uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE
 ctx jsonb;
 rec record;
 rows_json jsonb := '[]'::jsonb;
 subject_val jsonb;
 err_msg text;
 err_state text;
 distinct_count integer;
BEGIN
 ctx := public.payroll_fixed_registry_context_v1(p_context);
 IF p_contracts IS NULL OR coalesce(array_length(p_contracts, 1), 0) NOT BETWEEN 1 AND 250 THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD';
 END IF;

 SELECT count(DISTINCT cid)::integer INTO distinct_count FROM unnest(p_contracts) AS t(cid) WHERE cid IS NOT NULL;
 IF distinct_count NOT BETWEEN 1 AND 250 OR distinct_count <> array_length(p_contracts, 1) THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD';
 END IF;

 LOCK TABLE
  public.employment_contract,
  public.source_import_batch,
  public.person_identity,
  public.native_employee_registration,
  public.platform_tenant_source_binding,
  public.employment_adoption_application,
  public.employment_adoption_decision,
  public.employment_adoption_proposal,
  public.native_employment_lifecycle_review,
  public.native_employment_void_review
 IN SHARE MODE NOWAIT;

 FOR rec IN SELECT cid FROM unnest(p_contracts) WITH ORDINALITY AS t(cid, ord) ORDER BY ord LOOP
  BEGIN
   subject_val := public.payroll_fixed_registry_subject_v2(ctx, rec.cid, false);
   rows_json := rows_json || jsonb_build_array(jsonb_build_object('contractId', rec.cid, 'ok', true, 'subject', subject_val->'subject'));
  EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT, err_state = RETURNED_SQLSTATE;
   IF err_msg = 'PAYROLL_FIXED_SESSION_BUSY' OR err_state IN ('55P03', '40P01', '40001') THEN
    RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY';
   END IF;
   rows_json := rows_json || jsonb_build_array(jsonb_build_object('contractId', rec.cid, 'ok', false, 'error', err_msg));
  END;
 END LOOP;

 RETURN jsonb_build_object('version', 'payroll-fixed-employees.v1', 'rows', rows_json, 'total', jsonb_array_length(rows_json));
EXCEPTION
 WHEN lock_not_available OR deadlock_detected THEN
  RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY';
END $function$;

REVOKE ALL ON FUNCTION public.payroll_fixed_registry_employee_v2(jsonb, text) FROM PUBLIC, municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_fixed_registry_employee_v2(jsonb, text) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_fixed_registry_employees_by_contracts_v1(jsonb, uuid[]) FROM PUBLIC, municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_fixed_registry_employees_by_contracts_v1(jsonb, uuid[]) TO municontrol_actions_runtime_app;

DO $capacity_248$
DECLARE
 spec jsonb;
 proc_oid oid;
 src text;
 def text;
 before_sha text;
 after_sha text;
 pin_pairs jsonb := '[]'::jsonb;
 pair jsonb;
 adoption_oid oid := to_regprocedure('public.municipal_adoption_ready_v1()');
 attester_oid oid := to_regprocedure('public.own_run_release_attest_c1_v1(text)');
 family_oid oid;
 family_sig text;
 changed_flag boolean;
BEGIN
 FOR spec IN SELECT value FROM jsonb_array_elements('[
  {"sig":"public.payroll_fixed_registry_bootstrap_v1(jsonb)","from":"''maxRecords'',500,''maxHistory''","to":"''maxRecords'',5000,''maxHistory''","required":true},
  {"sig":"public.payroll_fixed_registry_list_v1(jsonb,date)","from":"IF row_count>500 THEN RAISE EXCEPTION ''PAYROLL_FIXED_ROW_LIMIT''; END IF;","to":"IF row_count>5000 THEN RAISE EXCEPTION ''PAYROLL_FIXED_ROW_LIMIT''; END IF;","required":true},
  {"sig":"public.payroll_fixed_registry_propose_v1(jsonb,jsonb,uuid)","from":">=500 THEN RAISE EXCEPTION ''PAYROLL_FIXED_ROW_LIMIT'';","to":">=5000 THEN RAISE EXCEPTION ''PAYROLL_FIXED_ROW_LIMIT'';","required":true},
  {"sig":"public.own_run_fixed_v1(jsonb,date,uuid[],text)","from":"IF jsonb_array_length(list_rows)>500 THEN RAISE EXCEPTION ''OWN_RUN_LIMIT'';END IF;","to":"IF jsonb_array_length(list_rows)>5000 THEN RAISE EXCEPTION ''OWN_RUN_LIMIT'';END IF;","required":true},
  {"sig":"public.own_run_declared_adjustments_capture_v1(jsonb)","from":"jsonb_array_length(list_value->''rows'')>500 OR jsonb_array_length(export_value->''rows'')>500","to":"jsonb_array_length(list_value->''rows'')>5000 OR jsonb_array_length(export_value->''rows'')>5000","required":false},
  {"sig":"public.own_run_quantity_only_expected_inputs_v1(jsonb)","from":"jsonb_array_length(list_value->''rows'')>500 OR jsonb_array_length(export_value->''rows'')>500","to":"jsonb_array_length(list_value->''rows'')>5000 OR jsonb_array_length(export_value->''rows'')>5000","required":false},
  {"sig":"public.own_run_capped_sources_v1(jsonb)","from":"jsonb_array_length(list_value->''rows'')>500 OR jsonb_array_length(export_value->''rows'')>500","to":"jsonb_array_length(list_value->''rows'')>5000 OR jsonb_array_length(export_value->''rows'')>5000","required":false}
 ]'::jsonb) LOOP
  proc_oid := to_regprocedure(spec->>'sig');
  IF proc_oid IS NULL THEN
   IF (spec->>'required')::boolean THEN
    RAISE EXCEPTION 'FIXED_248_PREREQUISITE: %', spec->>'sig';
   END IF;
   CONTINUE;
  END IF;
  SELECT replace(f.prosrc, E'\r\n', E'\n'), pg_get_functiondef(f.oid)
    INTO src, def
    FROM pg_proc f
   WHERE f.oid = proc_oid;
  before_sha := encode(sha256(convert_to(src, 'UTF8')), 'hex');

  IF position((spec->>'to') IN src) > 0 AND position((spec->>'from') IN src) = 0 THEN
   CONTINUE;
  END IF;
  IF (length(src) - length(replace(src, spec->>'from', ''))) / length(spec->>'from') <> 1 THEN
   RAISE EXCEPTION 'FIXED_248_SOURCE_CHANGED: %', spec->>'sig';
  END IF;
  IF (length(def) - length(replace(def, spec->>'from', ''))) / length(spec->>'from') <> 1 THEN
   RAISE EXCEPTION 'FIXED_248_SOURCE_CHANGED: %', spec->>'sig';
  END IF;

  EXECUTE replace(def, spec->>'from', spec->>'to');

  SELECT encode(sha256(convert_to(replace(f.prosrc, E'\r\n', E'\n'), 'UTF8')), 'hex')
    INTO after_sha
    FROM pg_proc f
   WHERE f.oid = proc_oid;
  IF before_sha IS DISTINCT FROM after_sha THEN
   pin_pairs := pin_pairs || jsonb_build_array(jsonb_build_object('before', before_sha, 'after', after_sha));
  END IF;
 END LOOP;

 IF jsonb_array_length(pin_pairs) = 0 THEN
  RETURN;
 END IF;

 IF adoption_oid IS NOT NULL THEN
  SELECT replace(f.prosrc, E'\r\n', E'\n'), pg_get_functiondef(f.oid)
    INTO src, def
    FROM pg_proc f
   WHERE f.oid = adoption_oid;
  before_sha := encode(sha256(convert_to(src, 'UTF8')), 'hex');
  changed_flag := false;
  FOR pair IN SELECT value FROM jsonb_array_elements(pin_pairs) LOOP
   IF position((pair->>'before') IN def) > 0 THEN
    def := replace(def, pair->>'before', pair->>'after');
    changed_flag := true;
   END IF;
  END LOOP;
  IF changed_flag THEN
   EXECUTE def;
   SELECT encode(sha256(convert_to(replace(f.prosrc, E'\r\n', E'\n'), 'UTF8')), 'hex')
     INTO after_sha
     FROM pg_proc f
    WHERE f.oid = adoption_oid;
   IF before_sha IS DISTINCT FROM after_sha THEN
    pin_pairs := pin_pairs || jsonb_build_array(jsonb_build_object('before', before_sha, 'after', after_sha));
   END IF;
  END IF;
 END IF;

 IF attester_oid IS NOT NULL THEN
  SELECT replace(f.prosrc, E'\r\n', E'\n'), pg_get_functiondef(f.oid)
    INTO src, def
    FROM pg_proc f
   WHERE f.oid = attester_oid;
  before_sha := encode(sha256(convert_to(src, 'UTF8')), 'hex');
  changed_flag := false;
  FOR pair IN SELECT value FROM jsonb_array_elements(pin_pairs) LOOP
   IF position((pair->>'before') IN def) > 0 THEN
    def := replace(def, pair->>'before', pair->>'after');
    changed_flag := true;
   END IF;
  END LOOP;
  IF changed_flag THEN
   EXECUTE def;
   SELECT encode(sha256(convert_to(replace(f.prosrc, E'\r\n', E'\n'), 'UTF8')), 'hex')
     INTO after_sha
     FROM pg_proc f
    WHERE f.oid = attester_oid;
   IF before_sha IS DISTINCT FROM after_sha THEN
    pin_pairs := pin_pairs || jsonb_build_array(jsonb_build_object('before', before_sha, 'after', after_sha));
   END IF;
  END IF;
 END IF;

 FOREACH family_sig IN ARRAY ARRAY['public.own_run_official_family_v1()', 'public.own_run_quantity_family_v1()'] LOOP
  family_oid := to_regprocedure(family_sig);
  IF family_oid IS NULL THEN
   CONTINUE;
  END IF;
  SELECT pg_get_functiondef(f.oid) INTO def FROM pg_proc f WHERE f.oid = family_oid;
  changed_flag := false;
  FOR pair IN SELECT value FROM jsonb_array_elements(pin_pairs) LOOP
   IF position((pair->>'before') IN def) > 0 THEN
    def := replace(def, pair->>'before', pair->>'after');
    changed_flag := true;
   END IF;
  END LOOP;
  IF changed_flag THEN
   EXECUTE def;
  END IF;
 END LOOP;
END $capacity_248$;

COMMIT;
