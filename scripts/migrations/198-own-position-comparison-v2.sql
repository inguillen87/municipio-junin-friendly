-- Explicit read successor only; preserves129V1, producers and all stored rows.
-- This core DDL is NOT an admitted installer. Exact predecessor metadata and
-- preservation/durability protocol over190 must be closed before installation.
-- No capture backfill, current roster substitution, payroll evaluation or IAM
-- capability/member assignment. The new facade has the same nominal read ACL.
DO $prerequisite$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN('position_comparison_detail_v2','position_comparison_annual_v2','position_comparison_annual_value_v2','position_comparison_positions_v2')) THEN RAISE EXCEPTION 'POSITION_COMPARISON_V2_ALREADY_INSTALLED';END IF;
 IF to_regclass('public.own_payroll_run_capture') IS NULL OR to_regclass('public.own_payroll_run_result') IS NULL OR to_regclass('public.own_payroll_close_event') IS NULL OR to_regclass('public.annual_position_budget_event') IS NULL OR to_regclass('public.own_position_assignment_event') IS NULL OR to_regclass('public.own_payroll_run_position_capture') IS NULL OR to_regclass('public.own_payroll_run_position_dimensions') IS NULL
  OR to_regprocedure('public.position_comparison_detail_v1(jsonb,integer,integer,text,text)') IS NULL
  OR to_regprocedure('public.position_assignment_capture_v1(jsonb,uuid)') IS NULL
  OR to_regprocedure('public.position_comparison_dimensions_v1(jsonb,public.own_payroll_run_capture)') IS NULL
  OR to_regprocedure('public.annual_budget_context_v1(jsonb)') IS NULL
  OR to_regprocedure('public.annual_budget_bootstrap_v1(jsonb,integer)') IS NULL
  OR to_regprocedure('public.annual_budget_scope_v1(jsonb)') IS NULL
  OR to_regprocedure('public.annual_budget_current_v1(jsonb,integer)') IS NULL
  OR to_regprocedure('public.annual_budget_proposal_v1(jsonb,public.annual_position_budget_event)') IS NULL
  OR to_regprocedure('public.own_close_context_v1(jsonb,boolean,boolean)') IS NULL
  OR to_regprocedure('public.own_run_hash_v1(jsonb)') IS NULL
  OR to_regprocedure('public.own_run_receipt_v1(public.own_payroll_run_capture,boolean)') IS NULL
  OR to_regprocedure('public.own_program_definition_v1(jsonb,jsonb)') IS NULL
  OR to_regprocedure('public.own_program_exact_v1(jsonb,text[])') IS NULL
  OR to_regprocedure('public.own_participation_rules_v1(jsonb)') IS NULL
 THEN RAISE EXCEPTION 'POSITION_COMPARISON_V2_PREREQUISITE';END IF;
END $prerequisite$;

-- Private projection from the caller's already authorized canonical context.
-- Uses127's preserved STABLE/IMMUTABLE readers, not its old context/bootstrap.
CREATE FUNCTION public.position_comparison_annual_value_v2(ctx jsonb,y integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $function$
DECLARE source_event public.annual_position_budget_event;proposal_value jsonb;catalog_value jsonb;rows_value jsonb:='[]';value jsonb;response_bytes bigint:=8192;
BEGIN
 IF y IS NULL OR y NOT BETWEEN 1900 AND 2099 THEN RAISE EXCEPTION 'POSITION_COMPARISON_INPUT_INVALID';END IF;
 catalog_value:=public.annual_budget_current_v1(ctx,y);response_bytes:=response_bytes+octet_length(catalog_value::text);
 FOR source_event IN SELECT event.* FROM public.annual_position_budget_event event WHERE event.tenant_id=(ctx->>'tenantId')::uuid AND event.source_binding_id=(ctx->>'sourceBindingId')::uuid AND event.budget_year=y AND event.command='propose' ORDER BY event.recorded_at,event.id LOOP
  proposal_value:=public.annual_budget_proposal_v1(ctx,source_event);response_bytes:=response_bytes+octet_length(proposal_value::text)+2;
  IF response_bytes>67108864 OR jsonb_array_length(rows_value)>=1000 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
  rows_value:=rows_value||jsonb_build_array(proposal_value);
 END LOOP;
 value:=jsonb_build_object('version','annual-position-budget.v1','year',y,'scopeVersion',public.annual_budget_scope_v1(ctx),'catalog',catalog_value,'proposals',rows_value,'proposalCount',jsonb_array_length(rows_value),'complete',true,'permissions',jsonb_build_object('canPropose',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'workforce.structure.prepare'),'canReview',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL AND public.action_center_context_has_capability(ctx,'workforce.structure.approve')));
 IF octet_length(value::text)+8192>67108864 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 RETURN value;
END $function$;
REVOKE ALL ON FUNCTION public.position_comparison_annual_value_v2(jsonb,integer) FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.position_comparison_annual_v2(p jsonb,y integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $function$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.own_close_context_v1(p,true,false);
 IF NOT public.action_center_context_has_capability(ctx,'workforce.structure.read') THEN RAISE EXCEPTION 'POSITION_COMPARISON_FORBIDDEN';END IF;
 RETURN public.position_comparison_annual_value_v2(ctx,y);
END $function$;
REVOKE ALL ON FUNCTION public.position_comparison_annual_v2(jsonb,integer) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.position_comparison_annual_v2(jsonb,integer) TO municontrol_actions_runtime_app;

-- Private128 projection: unchanged validation and scope from an authorized ctx.
CREATE FUNCTION public.position_comparison_positions_v2(ctx jsonb,target uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public.own_payroll_run_capture;s public.own_payroll_run_position_capture;BEGIN
 IF NOT public.action_center_context_has_capability(ctx,'payroll.calculation.read') THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_FORBIDDEN';END IF;
 SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_NOT_FOUND';END IF;
 SELECT * INTO s FROM public.own_payroll_run_position_capture WHERE capture_id=c.id;
 IF s.capture_id IS NOT NULL AND(s.tenant_id<>c.tenant_id OR s.source_binding_id<>c.source_binding_id OR s.capture_payload_sha256<>c.payload_sha256 OR public.own_run_hash_v1(s.payload)<>s.payload_sha256 OR s.payload#>>'{populationVersion}' IS DISTINCT FROM c.payload#>>'{population,version}' OR s.payload->>'complete'<>'true' OR jsonb_array_length(s.payload->'employees')<>jsonb_array_length(c.payload#>'{population,employees}') OR(s.payload->>'employeeCount')::integer<>jsonb_array_length(s.payload->'employees') OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{population,employees}') e WHERE(SELECT count(*) FROM jsonb_array_elements(s.payload->'employees') a WHERE a->>'contractId'=e->>'contractId' AND a->>'employeeNumber'=e->>'employeeNumber' AND a->>'identityToken'=e->>'identityToken')<>1)) THEN RAISE EXCEPTION 'POSITION_ASSIGNMENT_CAPTURE_INVALID';END IF;
 RETURN jsonb_build_object('version','own-run-position-capture.v1','captureId',c.id,'status',CASE WHEN s.capture_id IS NULL THEN 'not_captured' ELSE 'captured' END,'capturePayloadSha256',c.payload_sha256,'period',c.payload->>'period','liquidationType',c.payload->>'liquidationType','payload',s.payload,'payloadSha256',s.payload_sha256);
END $$;
REVOKE ALL ON FUNCTION public.position_comparison_positions_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;

CREATE FUNCTION public.position_comparison_detail_v2(p jsonb,y integer,norm_revision integer,period_value text,type_value text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $function$
DECLARE
 ctx jsonb;annual jsonb;g public.own_payroll_close_event;
 c public.own_payroll_run_capture;r public.own_payroll_run_result;e jsonb;
 groups_value jsonb:='[]';employees jsonb:='[]';captures jsonb:='[]';ids uuid[]:='{}';result_value jsonb;
 definition jsonb;expected_fields text[];facts jsonb;preimage jsonb;versions jsonb;
 declared_days boolean;monthly_days boolean;needs_participation boolean;
 source_key text;source_version text;enabled boolean;source_value jsonb;source_row jsonb;
 input_people jsonb;population_people jsonb;group_value jsonb;capture_value jsonb;employee_value jsonb;response_bytes bigint:=8192;
BEGIN
 IF y NOT BETWEEN 1900 AND 2099 OR norm_revision NOT BETWEEN 1 AND 1000 OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR left(period_value,4)<>y::text
  OR type_value NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') OR y IS NULL OR norm_revision IS NULL OR period_value IS NULL OR type_value IS NULL
 THEN RAISE EXCEPTION 'POSITION_COMPARISON_INPUT_INVALID';END IF;
 ctx:=public.own_close_context_v1(p,true,false);
 IF NOT public.action_center_context_has_capability(ctx,'workforce.structure.read') THEN RAISE EXCEPTION 'POSITION_COMPARISON_FORBIDDEN';END IF;
 annual:=public.position_comparison_annual_value_v2(ctx,y);
 response_bytes:=response_bytes+octet_length(annual::text);
 IF response_bytes>67108864 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(annual->'proposals') a WHERE a->>'status'='approved' AND(a#>>'{decision,revision}')::integer=norm_revision) THEN RAISE EXCEPTION 'POSITION_COMPARISON_NORM_REQUIRED';END IF;
 -- Complete census, independent of actor/run/selected contract. No LIMIT and
 -- no filtering of old closed groups to make a new capture look complete.
 FOR g IN SELECT event.* FROM public.own_payroll_close_event event
  WHERE event.tenant_id=(ctx->>'tenantId')::uuid AND event.source_binding_id=(ctx->>'sourceBindingId')::uuid
   AND event.period=period_value AND event.liquidation_type=type_value AND event.command='close'
   AND NOT EXISTS(SELECT 1 FROM public.own_payroll_close_event opened WHERE opened.tenant_id=event.tenant_id AND opened.source_binding_id=event.source_binding_id AND opened.group_id=event.id AND opened.command='reopen')
  ORDER BY event.id
 LOOP
  IF public.own_run_hash_v1(g.snapshot) IS DISTINCT FROM g.snapshot_sha256 OR g.snapshot->>'period' IS DISTINCT FROM period_value OR g.snapshot->>'liquidationType' IS DISTINCT FROM type_value
   OR(g.snapshot->>'employeeCount')::integer IS DISTINCT FROM jsonb_array_length(g.snapshot->'employees')
  THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
  group_value:=jsonb_build_object('id',g.id,'snapshotSha256',g.snapshot_sha256,'recordedAt',g.recorded_at,'employeeCount',g.snapshot->'employeeCount','populationCount',g.snapshot->'populationCount','populationComplete',g.snapshot->'populationComplete');
  response_bytes:=response_bytes+octet_length(group_value::text)+2;
  IF response_bytes>67108864 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
  groups_value:=groups_value||jsonb_build_array(group_value);
  FOR e IN SELECT value FROM jsonb_array_elements(g.snapshot->'employees') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(employees) old WHERE old->>'contractId'=e->>'contractId') THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
   SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=(e->>'runId')::uuid AND tenant_id=g.tenant_id AND source_binding_id=g.source_binding_id;
   SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
   IF c.id IS NULL OR r.capture_id IS NULL OR e->>'resultSha256' IS DISTINCT FROM r.result_sha256 OR e->>'inputSha256' IS DISTINCT FROM r.input_sha256
    OR c.body->>'period' IS DISTINCT FROM period_value OR c.body->>'liquidationType' IS DISTINCT FROM type_value
    OR c.payload->>'period' IS DISTINCT FROM period_value OR c.payload->>'liquidationType' IS DISTINCT FROM type_value
    OR(SELECT count(*) FROM jsonb_array_elements(c.payload#>'{population,employees}') person WHERE person->>'contractId'=e->>'contractId' AND person->>'employeeNumber'=e->>'employeeNumber')<>1
    OR(SELECT count(*) FROM jsonb_array_elements(r.input->'employees') person WHERE person->>'contractId'=e->>'contractId' AND person->>'employeeNumber'=e->>'employeeNumber')<>1
    OR(SELECT count(*) FROM jsonb_array_elements(r.result->'employeeTotals') person WHERE person->>'contractId'=e->>'contractId')<>1
   THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
   IF NOT c.id=ANY(ids) THEN
    -- Immutable RAW and its entire original input/result are verified once per
    -- unique capture, before reading its position/dimension sidecars.
    IF public.own_run_hash_v1(c.body) IS DISTINCT FROM c.body_sha256 OR public.own_run_hash_v1(c.payload) IS DISTINCT FROM c.payload_sha256
     OR public.own_run_hash_v1(r.input) IS DISTINCT FROM r.input_sha256 OR public.own_run_hash_v1(r.result) IS DISTINCT FROM r.result_sha256 OR r.algorithm_sha256 IS DISTINCT FROM c.algorithm_sha256
     OR c.payload->'selection' IS DISTINCT FROM c.body->'selection' OR c.payload#>>'{programState,program,version}' IS DISTINCT FROM c.body->>'programVersion'
    THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
    definition:=c.payload#>'{programState,program,definition}';
    IF public.own_program_definition_v1(definition,c.payload#>'{programState,salaryCatalog,items}') IS DISTINCT FROM definition
     OR(c.payload#>>'{programState,program,revision}')::integer<1 OR c.payload#>>'{programState,program,salaryVersion}' IS DISTINCT FROM c.payload#>>'{programState,salaryCatalog,version}'
     OR NOT public.own_program_exact_v1(c.payload->'population',ARRAY['complete','version','employees']) OR c.payload#>'{population,complete}' IS DISTINCT FROM 'true'::jsonb
     OR jsonb_typeof(c.payload#>'{population,employees}') IS DISTINCT FROM 'array' OR jsonb_array_length(c.payload#>'{population,employees}') NOT BETWEEN 1 AND 10000
    THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
    declared_days:=coalesce(definition->>'monthlyDayDeclarationVersion'='own-monthly-approved-days.v1' AND c.body->>'liquidationType'='monthly',false);
    monthly_days:=coalesce(definition->>'monthlyDaysVersion'='own-monthly-day-facts.v2' AND c.body->>'liquidationType'='monthly',false);
    needs_participation:=coalesce(definition#>>'{periodParticipation,version}'='own-period-participation.v1'
     AND(NOT declared_days OR EXISTS(SELECT 1 FROM jsonb_array_elements(definition->'bindings') binding WHERE binding->>'sourceKind'='period_fact')),false);
    expected_fields:=ARRAY['programState','population','monthly','fixed','period','liquidationType','selection','sourceInventory'];facts:='{}';
    FOR source_key,source_version,enabled IN SELECT * FROM(VALUES
     ('employmentFacts','own-salary-seniority.v1',coalesce(definition->>'employmentFactsVersion'='own-salary-seniority.v1',false)),
     ('periodParticipation','own-period-participation.v1',needs_participation),
     ('workingTime','own-contract-working-time.v1',coalesce(definition->>'workingTimeVersion'='own-contract-working-time.v1',false)),
     ('agreementWorkingTime','own-agreement-working-time.v1',coalesce(definition->>'agreementWorkingTimeVersion'='own-agreement-working-time.v1',false)),
     ('salaryConditions','own-contract-salary-conditions.v1',coalesce(definition->>'salaryConditionsVersion'='own-contract-salary-conditions.v1',false)),
     ('monthlyDayDeclarations','own-monthly-approved-days.v1',declared_days)
    ) selected_source(source_key,source_version,enabled) LOOP
     IF enabled THEN
      source_value:=c.payload->source_key;
      IF jsonb_typeof(source_value) IS DISTINCT FROM 'object' OR source_value->'complete' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(source_value->'records') IS DISTINCT FROM 'array'
       OR source_value->>'version' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_array(source_version,c.body->>'period',source_value->'records'))
      THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
      expected_fields:=array_append(expected_fields,source_key);facts:=facts||jsonb_build_object(source_key,source_value);
     END IF;
    END LOOP;
    IF coalesce(definition->>'periodContextVersion'='own-payroll-period-context.v1',false) THEN
     source_value:=c.payload->'periodContext';
     IF NOT public.own_program_exact_v1(source_value,ARRAY['version','period','monthNumber','sha256']) OR source_value->>'version' IS DISTINCT FROM 'own-payroll-period-context.v1' OR source_value->>'period' IS DISTINCT FROM c.body->>'period'
      OR source_value->>'monthNumber' IS DISTINCT FROM (CASE WHEN substring(c.body->>'period',6,1)='0' THEN right(c.body->>'period',1) ELSE right(c.body->>'period',2) END)
      OR source_value->>'sha256' IS DISTINCT FROM public.own_run_hash_v1(source_value-'sha256')
     THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
     expected_fields:=array_append(expected_fields,'periodContext');facts:=facts||jsonb_build_object('periodContext',source_value);
    END IF;
    IF monthly_days THEN
     source_value:=c.payload->'monthlyDays';
     IF jsonb_typeof(source_value) IS DISTINCT FROM 'object' OR jsonb_typeof(c.payload->'monthlyDaysScope') IS DISTINCT FROM 'object'
      OR source_value->>'monthlyDaysVersion' IS DISTINCT FROM 'own-monthly-day-facts.v2'
      OR source_value->>'payloadSha256' IS DISTINCT FROM public.own_run_hash_v1(source_value-ARRAY['complete','version','payloadSha256'])
      OR source_value->>'version' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_array('own-monthly-day-facts.v2',source_value->>'payloadSha256'))
      OR source_value#>>'{programBasis,policySha256}' IS DISTINCT FROM public.own_run_hash_v1(source_value#>'{programBasis,policy}')
     THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
     FOR source_row IN SELECT value->'source' FROM jsonb_array_elements(source_value->'records') LOOP
      IF source_row->>'sha256' IS DISTINCT FROM public.own_run_hash_v1(source_row-'sha256') THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
     END LOOP;
     expected_fields:=expected_fields||ARRAY['monthlyDays','monthlyDaysScope'];facts:=facts||jsonb_build_object('monthlyDays',source_value,'monthlyDaysScope',c.payload->'monthlyDaysScope');
    END IF;
    -- Missing, null and undeclared extra facts are errors. One preimage is
    -- selected by the original programme/type; the alternative is never tried.
    IF NOT public.own_program_exact_v1(c.payload,expected_fields) THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
    preimage:=CASE WHEN facts='{}'::jsonb THEN c.payload#>'{population,employees}' ELSE jsonb_build_object('employees',c.payload#>'{population,employees}')||facts END;
    IF public.own_run_hash_v1(preimage) IS DISTINCT FROM c.payload#>>'{population,version}' THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
    versions:=jsonb_build_object('population',c.payload#>'{population,version}','rules',public.own_run_hash_v1(jsonb_build_object('program',c.payload#>'{programState,program}','salary',c.payload#>'{programState,salaryCatalog}')),'novelties',public.own_run_hash_v1(jsonb_build_object('monthly',c.payload->'monthly','fixed',c.payload#>'{fixed,export,data}')));
    SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',person->'contractId','employeeNumber',person->'employeeNumber','agreementCode',person->'agreementCode','departmentCode',person->'departmentCode') ORDER BY ordinal),'[]') INTO input_people FROM jsonb_array_elements(r.input->'employees') WITH ORDINALITY item(person,ordinal);
    SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',person->'contractId','employeeNumber',person->'employeeNumber','agreementCode',person->'agreementCode','departmentCode',person->'departmentCode') ORDER BY(person->>'contractId') COLLATE "C"),'[]') INTO population_people FROM jsonb_array_elements(c.payload#>'{population,employees}') person;
    IF r.input->>'period' IS DISTINCT FROM c.body->>'period' OR r.input->>'liquidationType' IS DISTINCT FROM c.body->>'liquidationType' OR r.input->'selection' IS DISTINCT FROM c.body->'selection'
     OR r.input->'sourceVersions' IS DISTINCT FROM versions OR r.result->'sourceVersions' IS DISTINCT FROM versions
     OR r.input->>'version' IS DISTINCT FROM (CASE WHEN definition->>'namespaceVersion'='own-payroll-namespaces.v2' THEN 'own-payroll-input.v2' ELSE 'own-payroll-input.v1' END)
     OR coalesce(r.input->>'salaryConditionsVersion'='own-contract-salary-conditions.v1',false) IS DISTINCT FROM coalesce(definition->>'salaryConditionsVersion'='own-contract-salary-conditions.v1',false)
     OR input_people IS DISTINCT FROM population_people OR r.input->'rules' IS DISTINCT FROM public.own_participation_rules_v1(definition) OR r.input->'totalsPrecision' IS DISTINCT FROM definition->'totalsPrecision'
     OR r.result->>'period' IS DISTINCT FROM c.body->>'period' OR r.result->>'liquidationType' IS DISTINCT FROM c.body->>'liquidationType' OR r.result->'selection' IS DISTINCT FROM c.body->'selection'
    THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
    ids:=array_append(ids,c.id);
    capture_value:=jsonb_build_object('id',c.id,'payloadSha256',c.payload_sha256,'population',c.payload->'population','positions',public.position_comparison_positions_v2(ctx,c.id),'dimensions',public.position_comparison_dimensions_v1(ctx,c),'original',public.own_run_receipt_v1(c,true));
    response_bytes:=response_bytes+octet_length(capture_value::text)+2;
    IF response_bytes>67108864 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
    captures:=captures||jsonb_build_array(capture_value);
   END IF;
   employee_value:=jsonb_build_object('groupId',g.id,'contractId',e->>'contractId','employeeNumber',e->>'employeeNumber','captureId',c.id,'inputSha256',e->>'inputSha256','resultSha256',e->>'resultSha256','liquidationVersion',e->'liquidationVersion');
   response_bytes:=response_bytes+octet_length(employee_value::text)+2;
   IF response_bytes>67108864 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
   employees:=employees||jsonb_build_array(employee_value);
   IF jsonb_array_length(employees)>10000 OR cardinality(ids)>10000 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
  END LOOP;
  IF jsonb_array_length(groups_value)>1000 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 END LOOP;
 result_value:=jsonb_build_object('version','own-position-comparison.v2','year',y,'revision',norm_revision,'period',period_value,'liquidationType',type_value,'scopeVersion',annual->>'scopeVersion','annual',annual,'complete',true,'groups',groups_value,'employees',employees,'captures',captures);
 IF octet_length(result_value::text)+8192>67108864 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 RETURN result_value;
END $function$;
REVOKE ALL ON FUNCTION public.position_comparison_detail_v2(jsonb,integer,integer,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.position_comparison_detail_v2(jsonb,integer,integer,text,text) TO municontrol_actions_runtime_app;
