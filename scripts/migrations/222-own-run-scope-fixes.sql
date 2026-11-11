-- 222 · own_run_capture_v1: two scope fixes found in production on 05/11/2026 (owner approval 23:5x, Marcelo Guillén).
-- Base: the INSTALLED definition (pg_get_functiondef sha256 b08d8d4069aefe1f460f78c9f362944a505507d6d586aee6d0965f97ad3f0a3f), not 182, which later migrations already replaced.
-- 1) «Legajos seleccionados»: contract ids are canonical lowercase UUIDs; 783 of the 848 own contracts are not RFC 4122
--    v1-5/variant 89ab, so the stricter pattern rejected the whole selection (OWN_RUN_SELECTION_INVALID). The client
--    (salaryUuid) and every later step already use the canonical pattern.
-- 2) «Reparticiones» / «Convenios»: `NOT values ? NULL` is NULL, so a contract whose period code is NULL was not skipped and
--    then failed the numeric-code check, rejecting the run. A NULL code is outside the chosen set: it is skipped now.
--    «Todos» keeps requiring every code (unchanged).
-- Nothing else changes: same signature, owner, SECURITY DEFINER, search_path and TimeZone. Idempotent: re-running on the fixed
-- definition is a no-op; any other base aborts with OWN_RUN_222_BASE_CHANGED and changes nothing.
BEGIN;
DO $guard$
DECLARE current text:=encode(sha256(convert_to(pg_get_functiondef('public.own_run_capture_v1(jsonb,jsonb,uuid,text)'::regprocedure),'UTF8')),'hex');
BEGIN
 IF current NOT IN ('b08d8d4069aefe1f460f78c9f362944a505507d6d586aee6d0965f97ad3f0a3f','6f85596545087378590cd43253812b7c567da5da4b86fe8fd2c7d29aa8d27a1e') THEN RAISE EXCEPTION 'OWN_RUN_222_BASE_CHANGED %',current; END IF;
END
$guard$;
CREATE OR REPLACE FUNCTION public.own_run_capture_v1(p jsonb, body jsonb, key uuid, algorithm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE declared_day_facts jsonb;population_sources jsonb;needs_participation boolean;day_facts jsonb;day_scope jsonb;classification_value jsonb;classifications jsonb:='[]';condition_facts jsonb;working_facts jsonb;agreement_facts jsonb;period_context jsonb;period_facts jsonb;ctx jsonb;prior public.own_payroll_run_capture;c public.own_payroll_run_capture;reg record;s jsonb;program_state jsonb;employees jsonb:='[]';ids uuid[]:='{}';batches jsonb:='[]';native_batches jsonb:='[]';b record;batch_data jsonb;list_value jsonb;export_value jsonb;list_rows jsonb;export_rows jsonb;population jsonb;payload_value jsonb;inventory jsonb;first_date date;last_date date;kind text;v text;fingerprint text;field text;
BEGIN ctx:=public.own_run_context_v1(p,true,true);
 IF body ? 'version' THEN
  IF body->>'version' IS DISTINCT FROM 'own-payroll-run-command.v2' OR jsonb_typeof(body->'liquidationDate') IS DISTINCT FROM 'string' OR body->>'liquidationDate'!~'^(19|20)[0-9]{2}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
  BEGIN
   IF to_char((body->>'liquidationDate')::date,'YYYY-MM-DD') IS DISTINCT FROM body->>'liquidationDate' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END;
 END IF;
 IF NOT public.own_program_exact_v1(body,ARRAY['period','liquidationType','selection','scopeVersion','programVersion','populationDomain']||CASE WHEN body ? 'version' THEN ARRAY['version','liquidationDate'] ELSE ARRAY[]::text[] END) OR NOT public.own_program_exact_v1(body->'selection',ARRAY['kind','values']) OR octet_length(body::text)>524288 THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 FOREACH field IN ARRAY ARRAY['period','liquidationType','scopeVersion','programVersion','populationDomain'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;END LOOP;
 IF coalesce(body->>'period','')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR body->>'liquidationType' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') OR body->>'populationDomain'<>'native_registered' OR coalesce(body->>'scopeVersion','')!~'^[a-f0-9]{64}$' OR coalesce(body->>'programVersion','')!~'^[a-f0-9]{64}$' OR coalesce(algorithm,'')!~'^[a-f0-9]{64}$' OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 kind:=body#>>'{selection,kind}';IF jsonb_typeof(body#>'{selection,kind}') IS DISTINCT FROM 'string' OR kind NOT IN('all','contracts','agreements','departments') OR jsonb_typeof(body#>'{selection,values}') IS DISTINCT FROM 'array' OR jsonb_array_length(body#>'{selection,values}')>10000 THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
 IF (kind='all')<>(jsonb_array_length(body#>'{selection,values}')=0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(body#>'{selection,values}') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}'!~CASE WHEN kind='contracts' THEN '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' ELSE '^[0-9]{1,9}$' END) OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements_text(body#>'{selection,values}') x) OR body#>'{selection,values}' IS DISTINCT FROM(SELECT coalesce(jsonb_agg(x ORDER BY x COLLATE "C"),'[]') FROM jsonb_array_elements_text(body#>'{selection,values}') x) THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
 PERFORM public.own_run_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body);
 SELECT * INTO prior FROM public.own_payroll_run_capture WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN PERFORM public.own_run_owned_v1(ctx,prior);IF prior.body<>body OR prior.body_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_RUN_IDEMPOTENCY_REUSE';END IF;IF NOT EXISTS(SELECT 1 FROM public.own_payroll_run_result WHERE capture_id=prior.id) THEN PERFORM public.own_close_guard_v1(ctx,prior.body->>'period',prior.body->>'liquidationType',ARRAY(SELECT(value->>'contractId')::uuid FROM jsonb_array_elements(prior.payload#>'{population,employees}'))); END IF;RETURN public.own_run_receipt_v1(prior,true);END IF;
 IF body->>'scopeVersion'<>public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'OWN_RUN_SCOPE_CHANGED';END IF;
 -- SHARE locks prevent concurrent source changes during this read-committed
 -- transaction. Existing advisory locks remain effective. No source mutation.
 LOCK TABLE public.person_identity,public.employment_contract,public.native_employee_registration,public.native_employment_change_review,public.native_employment_lifecycle_review,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal,public.native_salary_event,public.own_payroll_program_event,public.payroll_novelty_batch,public.payroll_novelty_row,public.payroll_novelty_issue,public.payroll_novelty_event,public.payroll_fixed_novelty,public.payroll_fixed_novelty_event,public.own_period_classification_event,public.employment_adoption_seal IN SHARE MODE NOWAIT;
 program_state:=public.own_program_bootstrap_v1(p);
 IF program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN LOCK TABLE public.own_salary_conditions_event IN SHARE MODE NOWAIT;END IF;
 IF body->>'programVersion'<>program_state#>>'{program,version}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_CHANGED';END IF;
 IF (program_state#>>'{program,revision}')::integer<1 OR program_state#>>'{program,salaryVersion}' IS DISTINCT FROM program_state#>>'{salaryCatalog,version}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
 -- Only actual period_fact bindings need157 for an opted193 monthly programme.
 -- Legacy programmes and other types retain the original participation contract.
 needs_participation:=program_state#>>'{program,definition,periodParticipation,version}'='own-period-participation.v1'
  AND(NOT coalesce(program_state#>>'{program,definition,monthlyDayDeclarationVersion}'='own-monthly-approved-days.v1' AND body->>'liquidationType'='monthly',false)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(program_state#>'{program,definition,bindings}') bound WHERE bound->>'sourceKind'='period_fact'));
 first_date:=(body->>'period'||'-01')::date;last_date:=(first_date+interval '1 month - 1 day')::date;
 FOR reg IN SELECT n.*,n.contract_id AS employment_contract_id,ec.legacy_legajo,ec.agreement_code,ec.category_code,ec.sector_source_id FROM public.native_employee_registration n JOIN public.employment_contract ec ON ec.id=n.contract_id WHERE n.tenant_id=(ctx->>'tenantId')::uuid AND n.source_binding_id=(ctx->>'sourceBindingId')::uuid AND ec.tenant_id=n.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL AND(kind<>'contracts' OR body#>'{selection,values}' ? ec.id::text) ORDER BY ec.id LOOP
  IF NOT public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.employment_contract_id,first_date,last_date,false) THEN IF kind='contracts' THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;CONTINUE;END IF;
  classification_value:=public.own_period_classification_resolve_v1(ctx,reg.employment_contract_id,body->>'period');
  IF kind IN('agreements','departments') AND (body#>'{selection,values}' ? (classification_value#>>ARRAY['definition',CASE kind WHEN 'agreements' THEN 'agreementCode' ELSE 'sectorCode' END])) IS NOT TRUE THEN CONTINUE;END IF;
  IF NOT public.payroll_fixed_registry_range_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),reg.employment_contract_id,first_date,last_date,true) AND program_state#>>'{program,definition,periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;
  -- Current classification is not a historical reconstruction. Never apply
  -- a later registration/correction retroactively to an earlier payroll.
  -- The shared resolver above retains this guard unless explicit facts were approved.
  s:=public.payroll_fixed_registry_subject_v2(ctx,reg.employment_contract_id,true)->'subject';
  IF s->>'origin'<>'MUNICONTROL' OR s->>'contractId'<>reg.employment_contract_id::text OR s->>'legajo'<>reg.legacy_legajo OR coalesce((classification_value#>>'{definition,agreementCode}'),'')!~'^[0-9]{1,9}$' OR coalesce((classification_value#>>'{definition,categoryCode}'),'')!~'^[0-9]{1,9}$' OR coalesce((classification_value#>>'{definition,sectorCode}'),'')!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
  ids:=array_append(ids,reg.employment_contract_id);employees:=employees||jsonb_build_array(jsonb_build_object('contractId',reg.employment_contract_id,'employeeNumber',reg.legacy_legajo,'agreementCode',(classification_value#>>'{definition,agreementCode}'),'categoryCode',(classification_value#>>'{definition,categoryCode}'),'departmentCode',(classification_value#>>'{definition,sectorCode}'),'identityToken',s->>'identityToken','origin','MUNICONTROL'));
  classifications:=classifications||jsonb_build_array(classification_value||jsonb_build_object('identityToken',s->>'identityToken'));
  IF cardinality(ids)>10000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 END LOOP;
 IF cardinality(ids)=0 OR kind='contracts' AND cardinality(ids)<>jsonb_array_length(body#>'{selection,values}') OR kind IN('agreements','departments') AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(body#>'{selection,values}') chosen WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(employees) e WHERE e->>CASE kind WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END=chosen)) THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
 population:=jsonb_build_object('complete',true,'version',public.own_run_hash_v1(employees),'employees',employees);
 FOR b IN SELECT nb.id FROM public.payroll_novelty_batch nb WHERE nb.tenant_id=(ctx->>'tenantId')::uuid AND nb.certified_binding_id=(ctx->>'sourceBindingId')::uuid AND nb.period_month=first_date AND nb.payroll_type=body->>'liquidationType' AND nb.status='approved' AND EXISTS(SELECT 1 FROM public.payroll_novelty_row nr WHERE nr.batch_id=nb.id AND nr.employment_contract_id=ANY(ids)) ORDER BY nb.id LOOP
  batch_data:=public.payroll_novelty_export_v2(p,b.id)->'data';
  IF batch_data IS NULL OR batch_data->>'contractVersion'<>'payroll-novelty-batch.v2' OR EXISTS(SELECT 1 FROM jsonb_array_elements(batch_data->'rows') r WHERE NOT((r->>'employmentContractId')::uuid=ANY(ids))) THEN RAISE EXCEPTION 'OWN_RUN_SELECTION_INVALID';END IF;
  batches:=batches||jsonb_build_array(batch_data);IF jsonb_array_length(batches)>10000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 END LOOP;
 native_batches:=public.own_novelty_sources_v1(p,first_date,body->>'liquidationType',ids);
 s:=public.own_run_fixed_v1(p,first_date,ids,body->>'liquidationType');list_value:=s#>'{list,data}';export_value:=s#>'{export,data}';
 inventory:=jsonb_build_object('populationDomain','native_registered','departmentSource','sourceInventory.periodClassifications.rows[].definition.sectorCode','monthlyBatches',jsonb_array_length(batches),'ownNativeBatches',jsonb_array_length(native_batches),'fixedScope','approved_selected_native','fixedSnapshotToken',list_value->>'snapshotToken','fixedListCount',list_value->'total','fixedExportCount',export_value->'total','fixedExportSha256',public.own_run_hash_v1(export_value));
  inventory:=inventory||jsonb_build_object('periodClassifications',jsonb_build_object('version','own-period-classification-capture.v1','complete',true,'total',cardinality(ids),'rows',classifications),'jurisdictions',jsonb_build_object('version','own-run-jurisdictions.v1','complete',true,'total',cardinality(ids),'rows',(SELECT coalesce(jsonb_agg(jsonb_build_object('contractId',r->>'contractId','employeeNumber',e->>'employeeNumber','registrationId',r->>'registrationId','identityToken',r->>'identityToken','jurisdictionCode',r#>'{definition,jurisdictionCode}') ORDER BY r->>'contractId' COLLATE "C"),'[]') FROM jsonb_array_elements(classifications) r JOIN jsonb_array_elements(employees) e ON e->>'contractId'=r->>'contractId')));
  IF program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN
  s:=public.own_seniority_capture_v1(ctx,employees,body->>'period');
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'employmentFacts',s))));
  inventory:=inventory||jsonb_build_object('employmentFacts',jsonb_build_object('version',s->>'version','total',jsonb_array_length(s->'records'),'complete',true));
 END IF;
 IF needs_participation THEN
  period_facts:=public.own_participation_capture_v1(ctx,employees,body->>'period');
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'periodParticipation',period_facts)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END)));
  inventory:=inventory||jsonb_build_object('periodParticipation',jsonb_build_object('version',period_facts->>'version','total',jsonb_array_length(period_facts->'records'),'complete',true));
 END IF;
 IF program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN
  working_facts:=public.own_working_time_capture_v1(ctx,employees,body->>'period');
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'workingTime',working_facts)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END)));
  inventory:=inventory||jsonb_build_object('workingTime',jsonb_build_object('version',working_facts->>'version','total',jsonb_array_length(working_facts->'records'),'complete',true));
 END IF;
 IF program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN
  condition_facts:=public.own_salary_conditions_capture_v1(ctx,employees,body->>'period');
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'salaryConditions',condition_facts)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END)));
  inventory:=inventory||jsonb_build_object('salaryConditions',jsonb_build_object('version',condition_facts->>'version','total',jsonb_array_length(condition_facts->'records'),'complete',true));
 END IF;
 IF program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN
  agreement_facts:=public.own_agreement_working_time_capture_v1(ctx,employees,body->>'period');
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'agreementWorkingTime',agreement_facts)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END)));
  inventory:=inventory||jsonb_build_object('agreementWorkingTime',jsonb_build_object('version',agreement_facts->>'version','total',jsonb_array_length(agreement_facts->'records'),'complete',true));
 END IF;
 IF program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN
  IF jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR length(body->>'period')<>7 OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
  period_context:=jsonb_build_object('version','own-payroll-period-context.v1','period',body->>'period','monthNumber',CASE WHEN substring(body->>'period',6,1)='0' THEN right(body->>'period',1) ELSE right(body->>'period',2) END);
  period_context:=period_context||jsonb_build_object('sha256',public.own_run_hash_v1(period_context));
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'periodContext',period_context)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN jsonb_build_object('agreementWorkingTime',agreement_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END)));
  inventory:=inventory||jsonb_build_object('periodContext',jsonb_build_object('version',period_context->>'sha256','total',1,'complete',true));
 END IF;
 IF program_state#>>'{program,definition,monthlyDaysVersion}'='own-monthly-day-facts.v2' AND body->>'liquidationType'='monthly' THEN
  day_facts:=public.own_monthly_day_capture_v2(p,ctx,employees,body->>'period',body->>'liquidationType',program_state);day_scope:=day_facts->'scope';
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'monthlyDays',day_facts,'monthlyDaysScope',day_scope)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN jsonb_build_object('agreementWorkingTime',agreement_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN jsonb_build_object('periodContext',period_context) ELSE '{}'::jsonb END)));
  inventory:=inventory||jsonb_build_object('monthlyDays',jsonb_build_object('version',day_facts->>'version','total',jsonb_array_length(day_facts->'records'),'complete',true,'authority','approved_program_full_month','programApprovalId',program_state#>>'{program,approvalId}'));
 END IF;

 -- Complete approved193 facts are read under the helper's SHARE NOWAIT lock.
 -- No approval, derivation or update follows insertion of the immutable capture.
 IF program_state#>>'{program,definition,monthlyDayDeclarationVersion}'='own-monthly-approved-days.v1' AND body->>'liquidationType'='monthly' THEN
  -- Same explicit partial157 readiness required by approved-input JS; only new193 opt-in.
  IF needs_participation AND EXISTS(SELECT 1 FROM jsonb_array_elements(period_facts->'records') fact WHERE NOT coalesce((fact->>'fullPeriod')::boolean,false) AND(coalesce((fact#>>'{configuration,revision}')::integer,0)<1 OR fact#>>'{configuration,definition,recognizedUnits}' IS NULL OR fact#>>'{configuration,definition,baseUnits}' IS NULL)) THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;
  declared_day_facts:=public.own_monthly_days_capture_v1(ctx,employees,body->>'period');
  population_sources:=jsonb_build_object('employees',employees)
   ||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END
   ||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END
   ||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END
   ||CASE WHEN program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN jsonb_build_object('agreementWorkingTime',agreement_facts) ELSE '{}'::jsonb END
   ||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END
   ||CASE WHEN program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN jsonb_build_object('periodContext',period_context) ELSE '{}'::jsonb END
   ||CASE WHEN day_facts IS NOT NULL THEN jsonb_build_object('monthlyDays',day_facts,'monthlyDaysScope',day_scope) ELSE '{}'::jsonb END
   ||jsonb_build_object('monthlyDayDeclarations',declared_day_facts);
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(population_sources)));
  inventory:=inventory||jsonb_build_object('monthlyDayDeclarations',jsonb_build_object('version',declared_day_facts->>'version','total',jsonb_array_length(declared_day_facts->'records'),'complete',true,'authority','independently_approved_monthly_declaration'));
 END IF;
 payload_value:=jsonb_build_object('programState',program_state,'population',population,'monthly',CASE WHEN jsonb_array_length(native_batches)=0 THEN jsonb_build_object('complete',true,'batches',batches) ELSE jsonb_build_object('complete',true,'batches',batches,'nativeBatches',native_batches) END,'fixed',jsonb_build_object('list',jsonb_build_object('ok',true,'data',list_value),'export',jsonb_build_object('ok',true,'data',export_value)),'period',body->>'period','liquidationType',body->>'liquidationType','selection',body->'selection','sourceInventory',inventory);
 IF program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN payload_value:=payload_value||jsonb_build_object('employmentFacts',s);END IF;
 IF needs_participation THEN payload_value:=payload_value||jsonb_build_object('periodParticipation',period_facts);END IF;
 IF program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN payload_value:=payload_value||jsonb_build_object('workingTime',working_facts);END IF;
 IF program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN payload_value:=payload_value||jsonb_build_object('salaryConditions',condition_facts);END IF;
 IF program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN payload_value:=payload_value||jsonb_build_object('agreementWorkingTime',agreement_facts);END IF;
 IF program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN payload_value:=payload_value||jsonb_build_object('periodContext',period_context);END IF;
 IF day_facts IS NOT NULL THEN payload_value:=payload_value||jsonb_build_object('monthlyDays',day_facts,'monthlyDaysScope',day_scope);END IF;
 IF declared_day_facts IS NOT NULL THEN payload_value:=payload_value||jsonb_build_object('monthlyDayDeclarations',declared_day_facts);END IF;
 IF octet_length(payload_value::text)+octet_length(body::text)+8192>4194304 OR (SELECT count(*) FROM public.own_payroll_run_capture WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 PERFORM public.own_run_capacity_v1(octet_length(payload_value::text)+octet_length(body::text));
 PERFORM public.own_close_guard_v1(ctx,body->>'period',body->>'liquidationType',ids);
 INSERT INTO public.own_payroll_run_capture(tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,algorithm_sha256,payload,payload_sha256) VALUES((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,body,fingerprint,algorithm,payload_value,public.own_run_hash_v1(payload_value)) RETURNING * INTO c;
 RETURN public.own_run_receipt_v1(c,false);END $function$;
DO $verify$
BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef('public.own_run_capture_v1(jsonb,jsonb,uuid,text)'::regprocedure),'UTF8')),'hex')<>'6f85596545087378590cd43253812b7c567da5da4b86fe8fd2c7d29aa8d27a1e' THEN RAISE EXCEPTION 'OWN_RUN_222_RESULT_MISMATCH'; END IF;
END
$verify$;
COMMIT;
