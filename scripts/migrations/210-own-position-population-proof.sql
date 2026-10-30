-- Versioned read-only comparison over ORIGINAL own-run population sources.
-- No backfill, new table, replacement of v1, or municipal operation.
DO $$ BEGIN
 IF to_regprocedure('public.own_position_population_proof_v2(jsonb)') IS NOT NULL OR to_regprocedure('public.position_comparison_detail_v2(jsonb,integer,integer,text,text)') IS NOT NULL THEN RAISE EXCEPTION 'POSITION_POPULATION_ALREADY_INSTALLED';END IF;
 IF to_regprocedure('public.position_comparison_detail_v1(jsonb,integer,integer,text,text)') IS NULL OR to_regprocedure('public.position_comparison_dimensions_v1(jsonb,public.own_payroll_run_capture)') IS NULL OR to_regprocedure('public.position_assignment_capture_v1(jsonb,uuid)') IS NULL THEN RAISE EXCEPTION 'POSITION_POPULATION_PREREQUISITE';END IF;
END $$;
CREATE FUNCTION public.own_position_population_proof_v2(payload_value jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE definition jsonb;population_value jsonb;sources jsonb:='{}';entry record;enabled boolean;declared_days boolean;monthly_days boolean;participation boolean;preimage jsonb;shape_value text;BEGIN
 definition:=payload_value#>'{programState,program,definition}';population_value:=payload_value->'population';
 IF jsonb_typeof(payload_value) IS DISTINCT FROM 'object' OR jsonb_typeof(definition) IS DISTINCT FROM 'object' OR jsonb_typeof(definition->'bindings') IS DISTINCT FROM 'array' OR jsonb_typeof(population_value) IS DISTINCT FROM 'object' OR population_value->'complete' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(population_value->'employees') IS DISTINCT FROM 'array' OR jsonb_array_length(population_value->'employees') NOT BETWEEN 1 AND 10000 OR (population_value->>'version') IS NULL OR (population_value->>'version')!~'^[a-f0-9]{64}$' OR payload_value->>'liquidationType' IS NULL OR payload_value->>'liquidationType' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
 -- Presence is part of the original hash. Inactive sources are ABSENT;
 -- a present null is never stripped or replaced by an empty/default source.
 FOR entry IN SELECT * FROM(VALUES
  ('employmentFacts','employmentFactsVersion','own-salary-seniority.v1'),
  ('workingTime','workingTimeVersion','own-contract-working-time.v1'),
  ('agreementWorkingTime','agreementWorkingTimeVersion','own-agreement-working-time.v1'),
  ('salaryConditions','salaryConditionsVersion','own-contract-salary-conditions.v1'),
  ('periodContext','periodContextVersion','own-payroll-period-context.v1')
 ) AS facts(source_key,feature_key,feature_version) LOOP
  enabled:=coalesce(definition->>entry.feature_key=entry.feature_version,false);
  IF definition ? entry.feature_key AND NOT enabled THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
  IF (payload_value ? entry.source_key) IS DISTINCT FROM enabled OR enabled AND jsonb_typeof(payload_value->entry.source_key) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
  IF enabled THEN sources:=sources||jsonb_build_object(entry.source_key,payload_value->entry.source_key);END IF;
 END LOOP;
 IF definition ? 'monthlyDaysVersion' AND definition->>'monthlyDaysVersion' IS DISTINCT FROM 'own-monthly-day-facts.v2' OR definition ? 'monthlyDayDeclarationVersion' AND definition->>'monthlyDayDeclarationVersion' IS DISTINCT FROM 'own-monthly-approved-days.v1' OR definition ? 'periodParticipation' AND definition#>>'{periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
 monthly_days:=coalesce(definition->>'monthlyDaysVersion'='own-monthly-day-facts.v2' AND payload_value->>'liquidationType'='monthly',false);
 declared_days:=coalesce(definition->>'monthlyDayDeclarationVersion'='own-monthly-approved-days.v1' AND payload_value->>'liquidationType'='monthly',false);
 participation:=coalesce(definition#>>'{periodParticipation,version}'='own-period-participation.v1',false) AND (NOT declared_days OR EXISTS(SELECT 1 FROM jsonb_array_elements(definition->'bindings') b WHERE b->>'sourceKind'='period_fact'));
 FOR entry IN SELECT * FROM(VALUES('periodParticipation',participation),('monthlyDays',monthly_days),('monthlyDaysScope',monthly_days),('monthlyDayDeclarations',declared_days)) AS facts(source_key,is_enabled) LOOP
  IF (payload_value ? entry.source_key) IS DISTINCT FROM entry.is_enabled OR entry.is_enabled AND jsonb_typeof(payload_value->entry.source_key) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
  IF entry.is_enabled THEN sources:=sources||jsonb_build_object(entry.source_key,payload_value->entry.source_key);END IF;
 END LOOP;
 shape_value:=CASE WHEN sources='{}'::jsonb THEN 'employees' ELSE 'sources' END;
 preimage:=CASE WHEN shape_value='employees' THEN population_value->'employees' ELSE jsonb_build_object('employees',population_value->'employees')||sources END;
 IF public.own_run_hash_v1(preimage) IS DISTINCT FROM population_value->>'version' THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
 RETURN jsonb_build_object('version','own-position-population-proof.v1','shape',shape_value,'sources',sources);
END $$;
CREATE FUNCTION public.position_comparison_detail_v2(p jsonb,y integer,norm_revision integer,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;annual jsonb;g public.own_payroll_close_event;c public.own_payroll_run_capture;r public.own_payroll_run_result;e jsonb;groups_value jsonb:='[]';employees jsonb:='[]';captures jsonb:='[]';ids uuid[]:='{}';result_value jsonb;population_proof jsonb;BEGIN
 IF y NOT BETWEEN 1900 AND 2099 OR norm_revision NOT BETWEEN 1 AND 1000 OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR left(period_value,4)<>y::text OR type_value NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') OR y IS NULL OR norm_revision IS NULL OR period_value IS NULL OR type_value IS NULL THEN RAISE EXCEPTION 'POSITION_COMPARISON_INPUT_INVALID';END IF;
 ctx:=public.annual_budget_context_v1(p);PERFORM public.own_close_context_v1(p,true,false);annual:=public.annual_budget_bootstrap_v1(p,y);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(annual->'proposals') a WHERE a->>'status'='approved' AND(a#>>'{decision,revision}')::integer=norm_revision) THEN RAISE EXCEPTION 'POSITION_COMPARISON_NORM_REQUIRED';END IF;
 FOR g IN SELECT e.* FROM public.own_payroll_close_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=period_value AND e.liquidation_type=type_value AND e.command='close' AND NOT EXISTS(SELECT 1 FROM public.own_payroll_close_event opened WHERE opened.tenant_id=e.tenant_id AND opened.source_binding_id=e.source_binding_id AND opened.group_id=e.id AND opened.command='reopen') ORDER BY e.id LOOP
  IF public.own_run_hash_v1(g.snapshot) IS DISTINCT FROM g.snapshot_sha256 OR g.snapshot->>'period' IS DISTINCT FROM period_value OR g.snapshot->>'liquidationType' IS DISTINCT FROM type_value OR(g.snapshot->>'employeeCount')::integer IS DISTINCT FROM jsonb_array_length(g.snapshot->'employees') THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
  groups_value:=groups_value||jsonb_build_array(jsonb_build_object('id',g.id,'snapshotSha256',g.snapshot_sha256,'recordedAt',g.recorded_at,'employeeCount',g.snapshot->'employeeCount','populationCount',g.snapshot->'populationCount','populationComplete',g.snapshot->'populationComplete'));
  FOR e IN SELECT value FROM jsonb_array_elements(g.snapshot->'employees') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(employees) old WHERE old->>'contractId'=e->>'contractId') THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
   SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=(e->>'runId')::uuid AND tenant_id=g.tenant_id AND source_binding_id=g.source_binding_id;
   SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
   IF c.id IS NULL OR r.capture_id IS NULL OR e->>'resultSha256' IS DISTINCT FROM r.result_sha256 OR e->>'inputSha256' IS DISTINCT FROM r.input_sha256 OR c.payload->>'period' IS DISTINCT FROM period_value OR c.payload->>'liquidationType' IS DISTINCT FROM type_value OR(SELECT count(*) FROM jsonb_array_elements(c.payload#>'{population,employees}') person WHERE person->>'contractId'=e->>'contractId' AND person->>'employeeNumber'=e->>'employeeNumber')<>1 THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
   employees:=employees||jsonb_build_array(jsonb_build_object('groupId',g.id,'contractId',e->>'contractId','employeeNumber',e->>'employeeNumber','captureId',c.id,'resultSha256',e->>'resultSha256','liquidationVersion',e->'liquidationVersion'));
   -- One stable snapshot; each capture/result is hashed once. Every closed
   -- employee above still binds its own input/result and original identity.
   IF NOT c.id=ANY(ids) THEN
    IF public.own_run_hash_v1(c.payload) IS DISTINCT FROM c.payload_sha256 OR public.own_run_hash_v1(r.result) IS DISTINCT FROM r.result_sha256 THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
    population_proof:=public.own_position_population_proof_v2(c.payload);
    ids:=array_append(ids,c.id);captures:=captures||jsonb_build_array(jsonb_build_object('id',c.id,'payloadSha256',c.payload_sha256,'population',c.payload->'population','populationProof',population_proof,'positions',public.position_assignment_capture_v1(p,c.id),'dimensions',public.position_comparison_dimensions_v1(ctx,c)));
   END IF;
  END LOOP;
  IF jsonb_array_length(groups_value)>1000 OR jsonb_array_length(employees)>10000 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 END LOOP;
 result_value:=jsonb_build_object('version','own-position-comparison.v2','year',y,'revision',norm_revision,'period',period_value,'liquidationType',type_value,'scopeVersion',annual->>'scopeVersion','annual',annual,'complete',true,'groups',groups_value,'employees',employees,'captures',captures);
 IF octet_length(result_value::text)>67108864 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.own_position_population_proof_v2(jsonb),public.position_comparison_detail_v2(jsonb,integer,integer,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.position_comparison_detail_v2(jsonb,integer,integer,text,text) TO municontrol_actions_runtime_app;
