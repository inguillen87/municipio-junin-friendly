-- Migration 235: generic opt-in capped deduction effects.
-- Required installation order: 234 -> 236 -> 235 (the numeric order is intentional).
-- Requires exact reviewed 236 installer 565002cb0eb3e4049746a8c987c7f4d0c1e6dd71f875353e19567b0bab89b4a1.
-- This semantic delta must be composed with release readiness/attestation pins.
-- No municipal policy, user, role, source data, debt or payment is changed.
BEGIN;
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $capped_prerequisites$ DECLARE pin jsonb;actual text; BEGIN
 FOR pin IN SELECT value FROM jsonb_array_elements('[{"signature":"public.municipal_owner_program_command_core_v1(jsonb,jsonb,uuid,text,jsonb)","beforeBodySha256":"6b5c5e29cded2047e8add7d2d534de2c8c661e63e54cdd5cafd921c6b5eda235"},{"signature":"public.own_capped_closure_v1(jsonb,jsonb)","beforeBodySha256":null},{"signature":"public.own_capped_context_v1(jsonb,jsonb,text,jsonb)","beforeBodySha256":null},{"signature":"public.own_capped_contract_result_v1(jsonb,text)","beforeBodySha256":null},{"signature":"public.own_capped_math_v1(jsonb,jsonb,text)","beforeBodySha256":null},{"signature":"public.own_capped_policies_v1(text,jsonb)","beforeBodySha256":null},{"signature":"public.own_capped_references_v1(jsonb)","beforeBodySha256":null},{"signature":"public.own_capped_row_value_v1(jsonb,text,text,text,text,text)","beforeBodySha256":null},{"signature":"public.own_capped_step_expressions_v1(jsonb,integer)","beforeBodySha256":null},{"signature":"public.own_close_official_capture_check_candidate_v1(jsonb,text,text)","beforeBodySha256":"821c1310e00013a3f8c9efd874b8ff3a7403bd29372a9e21e709440c7573d6d9"},{"signature":"public.own_close_snapshot_official_candidate_v1(jsonb,jsonb)","beforeBodySha256":"65b317d613ab5db5eed63547121ae07f40416282307b0c90f2a3f67bab916221"},{"signature":"public.own_policy_resolve_candidate_v1(jsonb,text)","beforeBodySha256":"37d4efd8e2a6ed9658cdf44ec1266325bcc86305557b4d869de88ac183fac831"},{"signature":"public.own_program_capped_history_v1(jsonb,jsonb)","beforeBodySha256":null},{"signature":"public.own_program_capped_options_v1(jsonb)","beforeBodySha256":null},{"signature":"public.own_program_definition_composed_v1(jsonb,jsonb)","beforeBodySha256":"fd9f0879f8603932f75bde0b4527138c746ae483251caf5046cf8c7d6585018d"},{"signature":"public.own_receipt_official_record_candidate_v1(jsonb,jsonb,jsonb,jsonb)","beforeBodySha256":"dfd24d6f3161b7545abc52a2affc52d8d7d5b83e0ef642144588a1e95a63655b"},{"signature":"public.own_run_capped_capture_v1(jsonb,text,text,jsonb)","beforeBodySha256":null},{"signature":"public.own_run_capped_effects_v1(jsonb,jsonb)","beforeBodySha256":null},{"signature":"public.own_run_capped_input_v1(jsonb)","beforeBodySha256":null},{"signature":"public.own_run_capped_inventory_v1(jsonb)","beforeBodySha256":null},{"signature":"public.own_run_capped_sources_v1(jsonb)","beforeBodySha256":null},{"signature":"public.own_run_capped_verify_v1(jsonb,jsonb,jsonb)","beforeBodySha256":null},{"signature":"public.own_run_capture_v1(jsonb,jsonb,uuid,text)","beforeBodySha256":"bf2bc17e84d42de33869cc89051a161fea75e365ef630dffc2890a9d6b748ac6"},{"signature":"public.own_run_official_capture_check_v1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)","beforeBodySha256":"b24a56a08d1626c39a8f1e04d9cbea8dae9cf8d41f90b2a4b60455620ff5ef96"},{"signature":"public.own_run_official_result_check_v1(jsonb,jsonb)","beforeBodySha256":"b2dcd905207cfee44233f292e8d3a431e62d0291ac1b2dd292fae906a7d2cb1e"}]'::jsonb) LOOP
  IF pin->'beforeBodySha256'='null'::jsonb THEN
   IF to_regprocedure(pin->>'signature') IS NOT NULL THEN RAISE EXCEPTION 'CAPPED_OBJECT_CONFLICT: %',pin->>'signature';END IF;
  ELSE
   SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') INTO actual FROM pg_proc WHERE oid=to_regprocedure(pin->>'signature');
   IF actual IS DISTINCT FROM pin->>'beforeBodySha256' THEN RAISE EXCEPTION 'CAPPED_PREIMAGE_CHANGED_236_REQUIRED: %',pin->>'signature';END IF;
  END IF;
 END LOOP;
END $capped_prerequisites$;
CREATE OR REPLACE FUNCTION public.municipal_owner_program_command_core_v1(p jsonb, body jsonb, key uuid, decision_mode text, owner_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE ctx jsonb;cmd text;current_program jsonb;catalog jsonb;proposal public.own_payroll_program_event;prior public.own_payroll_program_event;definition jsonb;eid uuid:=gen_random_uuid();pid uuid;rev integer;fingerprint text;receipt_value jsonb;baseline jsonb;source_items jsonb;field text;
 authority_value jsonb;preview_value jsonb;owner_value jsonb;existing jsonb;inserted public.own_payroll_program_event;
BEGIN
 IF decision_mode='owner' THEN authority_value:=public.municipal_owner_program_context_v1(p);PERFORM public.municipal_owner_program_command_check_v1(owner_command);
 ELSIF decision_mode IS DISTINCT FROM 'independent' OR owner_command IS NOT NULL THEN RAISE EXCEPTION 'OWNER_PROGRAM_AUTHORITY_REQUIRED';END IF;
 ctx:=public.native_salary_administrative_context_v1(p);cmd:=body->>'command';
 FOREACH field IN ARRAY ARRAY['command','scopeVersion','baseVersion','salaryVersion','reason'] LOOP IF jsonb_typeof(body->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;END LOOP;
 IF jsonb_typeof(body->'reviewConfirmed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(body,ARRAY['command','scopeVersion','baseVersion','salaryVersion','proposalId','proposalSha256','program','reason','reviewConfirmed']) OR coalesce(cmd IN('propose','approve','reject'),false) IS NOT TRUE OR NOT public.own_program_text_v1(body->'reason',10,1000) OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR octet_length(body::text)>4194304 OR body->>'scopeVersion' IS NULL OR body->>'scopeVersion'!~'^[a-f0-9]{64}$' OR body->>'baseVersion' IS NULL OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR body->>'salaryVersion' IS NULL OR body->>'salaryVersion'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF decision_mode='independent' THEN
 IF NOT public.action_center_context_has_capability(ctx,CASE cmd WHEN 'propose' THEN 'payroll.parameter.prepare' ELSE 'payroll.parameter.approve' END) THEN RAISE EXCEPTION 'OWN_PROGRAM_FORBIDDEN';END IF;
 ELSIF cmd IS DISTINCT FROM 'approve' THEN RAISE EXCEPTION 'OWNER_PROGRAM_INPUT_INVALID';END IF;
 IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) THEN RAISE EXCEPTION 'OWN_PROGRAM_EMPLOYMENT_REQUIRED';END IF;
 PERFORM public.own_program_lock_v1(ctx);fingerprint:=encode(public.digest(public.native_salary_serialized_v1(body),'sha256'),'hex');
 IF decision_mode='owner' THEN
  IF body IS DISTINCT FROM jsonb_build_object('command','approve','scopeVersion',owner_command->>'scopeVersion','baseVersion',owner_command->>'baseVersion','salaryVersion',owner_command->>'salaryVersion','proposalId',owner_command->>'proposalId','proposalSha256',owner_command->>'proposalSha256','program',NULL,'reason',owner_command->>'reason','reviewConfirmed',true) THEN RAISE EXCEPTION 'OWNER_PROGRAM_INPUT_INVALID';END IF;
  existing:=public.municipal_owner_program_stored_v1(p,key,true);
  IF existing IS NOT NULL THEN IF existing->'command' IS DISTINCT FROM owner_command THEN RAISE EXCEPTION 'OWN_PROGRAM_IDEMPOTENCY_REUSE';END IF;RETURN existing;END IF;
 ELSE
 SELECT * INTO prior FROM public.own_payroll_program_event cap WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF EXISTS(SELECT 1 FROM public.municipal_owner_program_provenance WHERE event_id=prior.id) THEN RAISE EXCEPTION 'OWN_PROGRAM_IDEMPOTENCY_REUSE';END IF;IF prior.request_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_PROGRAM_IDEMPOTENCY_REUSE';END IF;RETURN public.own_program_attempt_v1(p,key);END IF;
 END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_salary_scope_v1(ctx) THEN RAISE EXCEPTION 'OWN_PROGRAM_SCOPE_CHANGED';END IF;
 current_program:=public.own_program_current_v1(ctx);catalog:=public.native_salary_catalog_v1(ctx);rev:=(current_program->>'revision')::integer;
 IF cmd='propose' THEN
  IF body->'proposalId'<>'null' OR body->'proposalSha256'<>'null' OR body->'reviewConfirmed'<>'false' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  IF body->>'baseVersion' IS DISTINCT FROM current_program->>'version' OR body->>'salaryVersion' IS DISTINCT FROM catalog->>'version' OR (catalog->>'revision')::integer=0 THEN RAISE EXCEPTION 'OWN_PROGRAM_BASE_CHANGED';END IF;
  definition:=public.own_program_definition_composed_v1(body->'program',catalog->'items');IF current_program#>>'{definition,optionalScalesVersion}'='own-payroll-optional-scales.v1' AND definition->>'optionalScalesVersion' IS DISTINCT FROM 'own-payroll-optional-scales.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;PERFORM public.own_program_family_tariff_history_candidate_v2(current_program->'definition',definition);PERFORM public.own_program_source_coverage_history_v1(current_program->'definition',definition);PERFORM public.own_program_row_emission_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_monthly_forced_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_declared_adjustments_history_v1(current_program->'definition',definition);PERFORM public.own_program_quantity_only_history_v1(current_program->'definition',definition);PERFORM public.own_program_conditional_history_v1(current_program->'definition',definition);PERFORM public.own_program_capped_history_v1(current_program->'definition',definition);IF definition ? 'quantityPhasesVersion' OR definition ? 'officialTotalsVersion' OR definition ? 'familyTariffsVersion' OR definition ? 'rowEmissionVersion' OR definition ? 'rowEmissionPolicies' OR definition ? 'monthlyForcedAmountsVersion' OR definition ? 'monthlyForcedAmountPolicies' THEN
   DECLARE quantity_family jsonb;official_family jsonb;
   BEGIN
    -- Admission comes from the installed server families. No request field can
    -- supply, waive or replace the operational attestation.
    IF definition->>'quantityPhasesVersion' IS DISTINCT FROM 'own-payroll-quantity-phases.v1'
     OR definition->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2'
     OR to_regprocedure('public.own_run_quantity_family_v1()') IS NULL
    THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_PREPARATION_ONLY';END IF;
    quantity_family:=public.own_run_quantity_family_v1();
    IF public.own_run_official_family_shape_v1(quantity_family,'own-run-quantity-family.v1') IS NOT TRUE
    THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_PREPARATION_ONLY';END IF;
    IF definition ?| ARRAY['officialTotalsVersion','officialTotalsPolicies','familyTariffsVersion','rowEmissionVersion','rowEmissionPolicies','monthlyForcedAmountsVersion','monthlyForcedAmountPolicies'] THEN
     IF coalesce(definition->>'officialTotalsVersion' IN('own-payroll-official-totals.v1','own-payroll-official-totals.v2'),false) IS NOT TRUE
      OR to_regprocedure('public.own_run_official_family_v1()') IS NULL
     THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_PREPARATION_ONLY';END IF;
     official_family:=public.own_run_official_family_v1();
     IF public.own_run_official_family_shape_v1(official_family,'own-run-official-totals-family.v1') IS NOT TRUE
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(quantity_family->'members') q
       WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(official_family->'members') o WHERE o=q))
     THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_PREPARATION_ONLY';END IF;
    END IF;
   END;
  END IF;IF definition IS DISTINCT FROM body->'program' OR definition=current_program->'definition' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  PERFORM public.own_program_quantity_history_v1(current_program->'definition',definition);PERFORM public.own_program_official_history_v1(current_program->'definition',definition);
  IF current_program#>>'{definition,monthlyDayDeclarationVersion}'='own-monthly-approved-days.v1' AND definition->>'monthlyDayDeclarationVersion' IS DISTINCT FROM 'own-monthly-approved-days.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,monthlyDaysVersion}'='own-monthly-day-facts.v2' AND definition->>'monthlyDaysVersion' IS DISTINCT FROM 'own-monthly-day-facts.v2' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,periodParticipation,version}'='own-period-participation.v1' AND definition#>>'{periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,fixedForcedAmountsVersion}'='own-fixed-forced-amount.v1' AND definition->>'fixedForcedAmountsVersion' IS DISTINCT FROM 'own-fixed-forced-amount.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(current_program#>'{definition,fixedForcedAmountsPolicy,policies}','[]'::jsonb)) old_policy WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(definition#>'{fixedForcedAmountsPolicy,policies}','[]'::jsonb)) new_policy WHERE new_policy=old_policy)) THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,familyPayrollFactsVersion}'='own-contract-family-payroll-facts.v1' AND definition->>'familyPayrollFactsVersion' IS DISTINCT FROM 'own-contract-family-payroll-facts.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') AND coalesce(definition->>'salaryConditionsVersion' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2'),false) IS NOT TRUE OR current_program#>>'{definition,salaryConditionsVersion}'='own-contract-salary-conditions.v2' AND definition->>'salaryConditionsVersion' IS DISTINCT FROM 'own-contract-salary-conditions.v2' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,periodContextVersion}'='own-payroll-period-context.v1' AND definition->>'periodContextVersion' IS DISTINCT FROM 'own-payroll-period-context.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' AND definition->>'agreementWorkingTimeVersion' IS DISTINCT FROM 'own-agreement-working-time.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,workingTimeVersion}'='own-contract-working-time.v1' AND definition->>'workingTimeVersion' IS DISTINCT FROM 'own-contract-working-time.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,employmentFactsVersion}'='own-salary-seniority.v1' AND definition->>'employmentFactsVersion' IS DISTINCT FROM 'own-salary-seniority.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,namespaceVersion}'='own-payroll-namespaces.v2' AND definition->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(nullif(current_program->'definition','null')->'rules','[]')) old WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(definition->'rules') n WHERE jsonb_build_array(n->>'agreementCode',n->>'code',n->>'validFrom',n->'liquidationTypes')=jsonb_build_array(old->>'agreementCode',old->>'code',old->>'validFrom',old->'liquidationTypes') AND(definition->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2' OR(n->>'nature'='auxiliary')=(old->>'nature'='auxiliary')))) THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF EXISTS(
   SELECT 1 FROM jsonb_array_elements(definition->'rules') candidate(value)
   WHERE NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(coalesce(nullif(current_program->'definition','null')->'rules','[]')) historical(value)
    WHERE jsonb_set(candidate.value-'validUntil','{expression}',public.own_participation_expression_v1(candidate.value,definition))=jsonb_set(historical.value-'validUntil','{expression}',public.own_participation_expression_v1(historical.value,current_program->'definition'))
    AND (candidate.value->'validUntil'=historical.value->'validUntil' OR candidate.value->'validUntil'<>'null'::jsonb AND (historical.value->'validUntil'='null'::jsonb OR candidate.value->>'validUntil'<=historical.value->>'validUntil'))
   ) AND (NOT (candidate.value#>>'{rounding,mode}'='exact' OR (candidate.value#>>'{rounding,mode}'='half_up' AND candidate.value#>'{rounding,precision}'='2'::jsonb)) OR jsonb_path_exists(candidate.value,
    '$.expression.** ? ((@.op == "round" || @.op == "quantity_phase" && @.stage == "rounded") && !(@.rounding.mode == "exact" || (@.rounding.mode == "half_up" && @.rounding.precision == 2)))'))
  ) THEN RAISE EXCEPTION 'OWN_PROGRAM_PRECISION_REQUIRED';END IF;
  pid:=eid;baseline:=current_program->'definition';source_items:=catalog->'items';
 ELSE
  IF body->'program'<>'null' OR body->'reviewConfirmed'<>'true' OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR jsonb_typeof(body->'proposalSha256') IS DISTINCT FROM 'string' OR body->>'proposalSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  pid:=(body->>'proposalId')::uuid;SELECT * INTO proposal FROM public.own_payroll_program_event WHERE id=pid AND command='propose' AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWN_PROGRAM_NOT_FOUND';END IF;IF EXISTS(SELECT 1 FROM public.own_payroll_program_event WHERE proposal_id=pid) THEN RAISE EXCEPTION 'OWN_PROGRAM_DECIDED';END IF;
  IF decision_mode='independent' THEN
  IF NOT(public.own_program_proposal_v1(ctx,proposal)->>'canReview')::boolean THEN RAISE EXCEPTION 'OWN_PROGRAM_INDEPENDENT_REQUIRED';END IF;
  ELSE
   preview_value:=public.municipal_owner_program_preview_v1(p,pid);
   IF preview_value->'context' IS DISTINCT FROM authority_value OR owner_command->>'previewSha256' IS DISTINCT FROM preview_value->>'previewSha256'
    OR owner_command->>'definitionSha256' IS DISTINCT FROM preview_value->>'definitionSha256' OR owner_command->>'salaryItemsSha256' IS DISTINCT FROM preview_value->>'salaryItemsSha256'
    OR owner_command->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR owner_command->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR owner_command->>'salaryVersion' IS DISTINCT FROM proposal.body->>'salaryVersion'
   THEN RAISE EXCEPTION 'OWNER_PROGRAM_PREVIEW_CHANGED';END IF;
  END IF;
  IF body->>'proposalSha256' IS DISTINCT FROM proposal.request_sha256 OR body->>'baseVersion' IS DISTINCT FROM proposal.body->>'baseVersion' OR body->>'salaryVersion' IS DISTINCT FROM proposal.body->>'salaryVersion' THEN RAISE EXCEPTION 'OWN_PROGRAM_PROPOSAL_CHANGED';END IF;
  baseline:=proposal.base_definition;source_items:=proposal.base_salary_items;
  IF cmd='approve' THEN IF body->>'baseVersion' IS DISTINCT FROM current_program->>'version' OR body->>'salaryVersion' IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'OWN_PROGRAM_BASE_CHANGED';END IF;definition:=public.own_program_definition_composed_v1(proposal.body->'program',catalog->'items');IF current_program#>>'{definition,optionalScalesVersion}'='own-payroll-optional-scales.v1' AND definition->>'optionalScalesVersion' IS DISTINCT FROM 'own-payroll-optional-scales.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;PERFORM public.own_program_family_tariff_history_candidate_v2(current_program->'definition',definition);PERFORM public.own_program_source_coverage_history_v1(current_program->'definition',definition);PERFORM public.own_program_row_emission_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_monthly_forced_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_declared_adjustments_history_v1(current_program->'definition',definition);PERFORM public.own_program_quantity_only_history_v1(current_program->'definition',definition);PERFORM public.own_program_conditional_history_v1(current_program->'definition',definition);PERFORM public.own_program_capped_history_v1(current_program->'definition',definition);IF definition ? 'quantityPhasesVersion' OR definition ? 'officialTotalsVersion' OR definition ? 'familyTariffsVersion' OR definition ? 'rowEmissionVersion' OR definition ? 'rowEmissionPolicies' OR definition ? 'monthlyForcedAmountsVersion' OR definition ? 'monthlyForcedAmountPolicies' THEN
   DECLARE quantity_family jsonb;official_family jsonb;
   BEGIN
    -- Admission comes from the installed server families. No request field can
    -- supply, waive or replace the operational attestation.
    IF definition->>'quantityPhasesVersion' IS DISTINCT FROM 'own-payroll-quantity-phases.v1'
     OR definition->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2'
     OR to_regprocedure('public.own_run_quantity_family_v1()') IS NULL
    THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_PREPARATION_ONLY';END IF;
    quantity_family:=public.own_run_quantity_family_v1();
    IF public.own_run_official_family_shape_v1(quantity_family,'own-run-quantity-family.v1') IS NOT TRUE
    THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_PREPARATION_ONLY';END IF;
    IF definition ?| ARRAY['officialTotalsVersion','officialTotalsPolicies','familyTariffsVersion','rowEmissionVersion','rowEmissionPolicies','monthlyForcedAmountsVersion','monthlyForcedAmountPolicies'] THEN
     IF coalesce(definition->>'officialTotalsVersion' IN('own-payroll-official-totals.v1','own-payroll-official-totals.v2'),false) IS NOT TRUE
      OR to_regprocedure('public.own_run_official_family_v1()') IS NULL
     THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_PREPARATION_ONLY';END IF;
     official_family:=public.own_run_official_family_v1();
     IF public.own_run_official_family_shape_v1(official_family,'own-run-official-totals-family.v1') IS NOT TRUE
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(quantity_family->'members') q
       WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(official_family->'members') o WHERE o=q))
     THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_PREPARATION_ONLY';END IF;
    END IF;
   END;
  END IF;IF current_program#>>'{definition,familyPayrollFactsVersion}'='own-contract-family-payroll-facts.v1' AND definition->>'familyPayrollFactsVersion' IS DISTINCT FROM 'own-contract-family-payroll-facts.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;rev:=rev+1;current_program:=jsonb_build_object('version',encode(public.digest(jsonb_build_array('own-payroll-program.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,eid,definition)::text,'sha256'),'hex'));END IF;
 END IF;
 IF rev>1000 OR (SELECT count(*) FROM public.own_payroll_program_event cap WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND command='propose')>=1000 AND cmd='propose' THEN RAISE EXCEPTION 'OWN_PROGRAM_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-program:capacity:v1',0)) THEN RAISE EXCEPTION 'OWN_PROGRAM_BUSY';END IF;
 IF (SELECT coalesce(sum(octet_length(cap.body::text)+octet_length(cap.base_definition::text)+octet_length(cap.base_salary_items::text)+octet_length(cap.receipt::text)),0) FROM public.own_payroll_program_event cap)+4*octet_length(body::text)+octet_length(baseline::text)+octet_length(source_items::text)>268435456 OR (SELECT coalesce(sum(octet_length(cap.body::text)+octet_length(cap.base_definition::text)+octet_length(cap.base_salary_items::text)+octet_length(cap.receipt::text)),0) FROM public.own_payroll_program_event cap WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid)+4*octet_length(body::text)+octet_length(baseline::text)+octet_length(source_items::text)>33554432 THEN RAISE EXCEPTION 'OWN_PROGRAM_LIMIT';END IF;
 receipt_value:=jsonb_build_object('version','own-payroll-program.v1','eventId',eid,'proposalId',pid,'requestKey',key,'requestSha256',fingerprint,'body',body,'status',CASE cmd WHEN 'propose' THEN 'pending' WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'revision',rev,'programVersion',current_program->>'version','replayed',false,'payrollCalculated',false,'payrollPosted',false);
 INSERT INTO public.own_payroll_program_event(id,tenant_id,source_binding_id,proposal_id,command,body,base_definition,base_salary_items,revision,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,actor_label,request_key,request_sha256,receipt)
 VALUES(eid,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,CASE WHEN cmd='propose' THEN NULL ELSE pid END,cmd,body,coalesce(baseline,'null'),source_items,rev,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',ctx->>'actorLabel',key,fingerprint,receipt_value) RETURNING * INTO inserted;
 IF decision_mode='independent' THEN RETURN receipt_value;END IF;
 owner_value:=public.municipal_owner_program_receipt_v1(inserted,preview_value,owner_command);
 INSERT INTO public.municipal_owner_program_provenance(event_id,tenant_id,source_binding_id,decision_mode,independence,preview,command,command_sha256,receipt)
 VALUES(inserted.id,inserted.tenant_id,inserted.source_binding_id,'owner',false,preview_value,owner_command,public.employment_adoption_hash_v1(jsonb_build_object('operation','approve_owner','body',owner_command)),owner_value);
 RETURN jsonb_build_object('version','municipal-owner-program-attempt.v1','authorization',authority_value,'preview',preview_value,'command',owner_command,'receipt',owner_value);
END $function$;

CREATE OR REPLACE FUNCTION public.own_capped_closure_v1(rules jsonb,roots jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE map jsonb:='{}';dependencies jsonb:='{}';r jsonb;id text;pending text[];seen text[]:='{}';done text[]:='{}';needed text[];progress boolean;
BEGIN
 IF jsonb_typeof(rules) IS DISTINCT FROM 'array' OR jsonb_typeof(roots) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'CAPPED_RULE_REQUIRED';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(rules) LOOP
  id:=(CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(r->>'code');
  IF id IS NULL OR map ? id THEN RAISE EXCEPTION 'CAPPED_RULE_AMBIGUOUS';END IF;
  map:=map||jsonb_build_object(id,r);dependencies:=dependencies||jsonb_build_object(id,public.own_capped_references_v1(r->'expression'));
 END LOOP;
 SELECT coalesce(array_agg(x),'{}') INTO pending FROM jsonb_array_elements_text(roots) x;
 WHILE cardinality(pending)>0 LOOP
  id:=pending[1];pending:=pending[2:];IF id=ANY(seen) THEN CONTINUE;END IF;
  IF NOT map ? id THEN RAISE EXCEPTION 'CAPPED_RULE_REQUIRED';END IF;
  seen:=array_append(seen,id);IF cardinality(seen)>10000 THEN RAISE EXCEPTION 'CAPPED_DEPENDENCY_LIMIT';END IF;
  SELECT coalesce(array_agg(x),'{}') INTO needed FROM jsonb_array_elements_text(dependencies->id) x;pending:=pending||needed;
 END LOOP;
 WHILE cardinality(done)<cardinality(seen) LOOP
  progress:=false;
  FOREACH id IN ARRAY seen LOOP
   IF id=ANY(done) THEN CONTINUE;END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(dependencies->id) x WHERE NOT x=ANY(done)) THEN done:=array_append(done,id);progress:=true;END IF;
  END LOOP;
  IF NOT progress THEN RAISE EXCEPTION 'CAPPED_DEPENDENCY_CYCLE';END IF;
 END LOOP;
 RETURN (SELECT coalesce(jsonb_agg(map->x ORDER BY map->x->>'agreementCode' COLLATE "C",map->x->>'code' COLLATE "C",x COLLATE "C",map->x->>'validFrom' COLLATE "C"),'[]') FROM unnest(seen) x);
END
$capped$;

ALTER FUNCTION public.own_capped_closure_v1(jsonb,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_capped_closure_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_capped_context_v1(policy jsonb,rules jsonb,month text,official jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE active_rules jsonb;map jsonb:='{}';managed jsonb:='{}';r jsonb;s jsonb;expr jsonb;closure jsonb;v jsonb;step_index integer:=0;id text;key text;roots jsonb:='[]';deductions jsonb;official_deductions jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(rule_row ORDER BY rule_row->>'code' COLLATE "C",rule_row->>'nature' COLLATE "C"),'[]') INTO active_rules FROM jsonb_array_elements(rules) rule_row WHERE rule_row->'agreementCode'=policy->'agreementCode' AND rule_row->>'validFrom'<=month AND(coalesce(rule_row->>'validUntil','9999-12')>=month) AND rule_row->'liquidationTypes' ? (policy->>'liquidationType');
 FOR r IN SELECT value FROM jsonb_array_elements(active_rules) LOOP
  id:=(CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(r->>'code');IF map ? id THEN RAISE EXCEPTION 'CAPPED_RULE_AMBIGUOUS';END IF;map:=map||jsonb_build_object(id,r);
 END LOOP;
 FOR s IN SELECT value FROM jsonb_array_elements(policy->'steps') LOOP
  managed:=managed||jsonb_build_object('concept:'||(s->>'conceptCode'),step_index,'auxiliary:'||(s->>'availableCode'),step_index,'auxiliary:'||(s->>'officialAvailableCode'),step_index);
  IF s->>'kind'='capped' THEN managed:=managed||jsonb_build_object('auxiliary:'||(s->>'limitCode'),step_index);END IF;
  step_index:=step_index+1;
 END LOOP;
 SELECT jsonb_agg(x ORDER BY x COLLATE "C") INTO deductions FROM(SELECT x FROM jsonb_array_elements_text(policy->'priorDeductionCodes') x UNION ALL SELECT step_row->>'conceptCode' FROM jsonb_array_elements(policy->'steps') step_row) a;
 SELECT coalesce(jsonb_agg(x ORDER BY x COLLATE "C"),'[]') INTO official_deductions FROM jsonb_array_elements_text(official#>'{contributions,996}') x;
 IF deductions IS DISTINCT FROM official_deductions THEN RAISE EXCEPTION 'CAPPED_ORDER_INVALID';END IF;
 FOREACH key IN ARRAY ARRAY['cashBaseReference','officialBaseReference'] LOOP
  v:=policy->key;id:=(v->>'op')||':'||(v->>'code');IF map->id->>'unit' IS DISTINCT FROM 'money' THEN RAISE EXCEPTION 'CAPPED_BASE_REQUIRED';END IF;
  closure:=public.own_capped_closure_v1(active_rules,jsonb_build_array(id));
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(closure) dependency_row WHERE managed ? ((CASE WHEN dependency_row->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(dependency_row->>'code'))) THEN RAISE EXCEPTION 'CAPPED_BASE_CYCLE';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(policy->'priorDeductionCodes') c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(closure) dependency_row WHERE dependency_row->>'nature'<>'auxiliary' AND dependency_row->>'code'=c)) THEN RAISE EXCEPTION 'CAPPED_ORDER_INVALID';END IF;
  roots:=roots||jsonb_build_array(id);
 END LOOP;
 step_index:=0;
 FOR s IN SELECT value FROM jsonb_array_elements(policy->'steps') LOOP
  FOREACH key IN ARRAY ARRAY['conceptCode','availableCode','officialAvailableCode','reserveCode','requestedCode','limitCode'] LOOP
   IF s->key='null'::jsonb THEN CONTINUE;END IF;
   id:=(CASE WHEN key='conceptCode' THEN 'concept:' ELSE 'auxiliary:' END)||(s->>key);r:=map->id;
   IF r->>'unit' IS DISTINCT FROM 'money' OR r->>'nature' IS DISTINCT FROM(CASE WHEN key='conceptCode' THEN 'deduction' ELSE 'auxiliary' END) THEN RAISE EXCEPTION 'CAPPED_RULE_REQUIRED';END IF;
   roots:=roots||jsonb_build_array(id);
  END LOOP;
  expr:=public.own_capped_step_expressions_v1(policy,step_index);
  IF map->('concept:'||(s->>'conceptCode'))->'rounding' IS DISTINCT FROM policy->'lineRounding'
   OR map->('auxiliary:'||(s->>'availableCode'))->'expression' IS DISTINCT FROM expr->'available'
   OR map->('auxiliary:'||(s->>'officialAvailableCode'))->'expression' IS DISTINCT FROM expr->'officialAvailable' THEN RAISE EXCEPTION 'CAPPED_ORDER_INVALID';END IF;
  IF s->>'kind'='capped' AND(map->('concept:'||(s->>'conceptCode'))->'expression' IS DISTINCT FROM expr->'amount' OR map->('auxiliary:'||(s->>'limitCode'))->'expression' IS DISTINCT FROM expr->'limit') THEN RAISE EXCEPTION 'CAPPED_FORMULA_INVALID';END IF;
  FOREACH key IN ARRAY ARRAY['reserveCode',CASE WHEN s->>'kind'='capped' THEN 'requestedCode' ELSE 'conceptCode' END] LOOP
   id:=(CASE WHEN key='conceptCode' THEN 'concept:' ELSE 'auxiliary:' END)||(s->>key);
   closure:=public.own_capped_closure_v1(active_rules,public.own_capped_references_v1(map->id->'expression'));
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(closure) dependency_row WHERE (managed->>((CASE WHEN dependency_row->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(dependency_row->>'code')))::integer>=step_index) THEN RAISE EXCEPTION 'CAPPED_FUTURE_DEPENDENCY';END IF;
  END LOOP;
  IF official->'agreementCode' IS DISTINCT FROM policy->'agreementCode' OR official->'liquidationType' IS DISTINCT FROM policy->'liquidationType' OR NOT official#>'{contributions,996}' ? (s->>'conceptCode') THEN RAISE EXCEPTION 'CAPPED_DESTINATION_REQUIRED';END IF;
  step_index:=step_index+1;
 END LOOP;
 RETURN public.own_capped_closure_v1(active_rules,roots);
END
$capped$;

ALTER FUNCTION public.own_capped_context_v1(jsonb,jsonb,text,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_capped_context_v1(jsonb,jsonb,text,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_capped_contract_result_v1(result_value jsonb,contract text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE effects jsonb;
BEGIN
 IF NOT coalesce(result_value ?| ARRAY['cappedDeductionsVersion','cappedDeductionEffectCount','cappedDeductionEffects'],false) THEN RETURN '{}';END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO effects FROM jsonb_array_elements(result_value->'cappedDeductionEffects') WITH ORDINALITY a(x,n) WHERE x->>'contractId'=contract;
 RETURN jsonb_build_object('cappedDeductionsVersion',result_value->'cappedDeductionsVersion','cappedDeductionEffectCount',jsonb_array_length(effects),'cappedDeductionEffects',effects);
END
$capped$;

ALTER FUNCTION public.own_capped_contract_result_v1(jsonb,text) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_capped_contract_result_v1(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_capped_math_v1(a jsonb,b jsonb,operation text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE difference numeric;
BEGIN
 IF public.own_run_quantity_rational_v1(a) IS NOT TRUE OR public.own_run_quantity_rational_v1(b) IS NOT TRUE THEN RAISE EXCEPTION 'CAPPED_EXACT_INVALID';END IF;
 difference:=(a->>'numerator')::numeric*(b->>'denominator')::numeric-(b->>'numerator')::numeric*(a->>'denominator')::numeric;
 IF operation='min' THEN RETURN CASE WHEN difference<=0 THEN a ELSE b END;
 ELSIF operation='max' THEN RETURN CASE WHEN difference>=0 THEN a ELSE b END;
 ELSIF operation='compare' THEN RETURN to_jsonb(sign(difference)::integer);
 ELSE RETURN public.own_run_official_rational_op_v1(a,b,operation);END IF;
END
$capped$;

ALTER FUNCTION public.own_capped_math_v1(jsonb,jsonb,text) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_capped_math_v1(jsonb,jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_capped_policies_v1(version text,policies jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE p jsonb;s jsonb;v jsonb;key text;concepts text[];owned text[];codes text[];prior text[];capped integer;
BEGIN
 IF version IS DISTINCT FROM 'own-capped-deductions.v1' OR jsonb_typeof(policies) IS DISTINCT FROM 'array' OR jsonb_array_length(policies) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'CAPPED_VERSION_INVALID';END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(policies) LOOP
  IF public.own_program_exact_v1(p,ARRAY['policyId','supersedes','agreementCode','validFrom','validUntil','liquidationType','cashBaseReference','officialBaseReference','consumptionStage','officialConsumptionStage','reserveStage','limitPrecision','lineRounding','officialDestination','incompatibleSourceCodes','priorDeductionCodes','steps','orderReference','sourceSha256']) IS NOT TRUE THEN RAISE EXCEPTION 'CAPPED_CONTRACT_INVALID';END IF;
  PERFORM public.own_policy_declaration_candidate_v1(p);
  IF p->>'liquidationType' IS DISTINCT FROM 'monthly' OR p->>'consumptionStage' IS DISTINCT FROM 'rounded' OR p->>'officialConsumptionStage' IS DISTINCT FROM 'exact' OR p->>'reserveStage' IS DISTINCT FROM 'exact' OR p->'limitPrecision' IS DISTINCT FROM '2'::jsonb OR p->>'limitPrecision'<>'2'
  OR p->'lineRounding' IS DISTINCT FROM '{"precision":2,"mode":"half_up"}'::jsonb OR p#>>'{lineRounding,precision}'<>'2' OR p->>'officialDestination' IS DISTINCT FROM '996' OR public.own_program_quantity_reference_v1(p->'orderReference') IS NOT TRUE OR jsonb_typeof(p->'sourceSha256') IS DISTINCT FROM 'string' OR p->>'sourceSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'CAPPED_CONTRACT_INVALID';END IF;
  FOREACH key IN ARRAY ARRAY['cashBaseReference','officialBaseReference'] LOOP
   v:=p->key;IF public.own_program_exact_v1(v,ARRAY['op','code','stage']) IS NOT TRUE OR coalesce(v->>'op' IN('concept','auxiliary'),false) IS NOT TRUE OR coalesce(v->>'stage' IN('exact','rounded'),false) IS NOT TRUE OR jsonb_typeof(v->'code') IS DISTINCT FROM 'string' OR v->>'code'!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'CAPPED_REFERENCE_INVALID';END IF;
  END LOOP;
  IF jsonb_typeof(p->'incompatibleSourceCodes') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'incompatibleSourceCodes')>1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'incompatibleSourceCodes') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}'!~'^[0-9]{1,9}$') OR(SELECT count(DISTINCT x) FROM jsonb_array_elements(p->'incompatibleSourceCodes') x)<>jsonb_array_length(p->'incompatibleSourceCodes') THEN RAISE EXCEPTION 'CAPPED_SOURCE_POLICY_INVALID';END IF;
  IF jsonb_typeof(p->'priorDeductionCodes') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'priorDeductionCodes')>1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'priorDeductionCodes') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}'!~'^[0-9]{1,9}$') OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(p->'priorDeductionCodes') x)<>jsonb_array_length(p->'priorDeductionCodes') THEN RAISE EXCEPTION 'CAPPED_ORDER_INVALID';END IF;
  SELECT coalesce(array_agg(x),'{}') INTO prior FROM jsonb_array_elements_text(p->'priorDeductionCodes') x;
  IF jsonb_typeof(p->'steps') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'steps') NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'CAPPED_STEP_INVALID';END IF;
  concepts:='{}';owned:='{}';capped:=0;
  FOR s IN SELECT value FROM jsonb_array_elements(p->'steps') LOOP
   IF public.own_program_exact_v1(s,ARRAY['kind','conceptCode','availableCode','officialAvailableCode','reserveCode','requestedCode','limitCode','method','effectStage','sourceRowSha256','ruleReference']) IS NOT TRUE OR coalesce(s->>'kind' IN('capped','existing_deduction'),false) IS NOT TRUE OR jsonb_typeof(s->'sourceRowSha256') IS DISTINCT FROM 'string' OR s->>'sourceRowSha256'!~'^[a-f0-9]{64}$' OR public.own_program_quantity_reference_v1(s->'ruleReference') IS NOT TRUE THEN RAISE EXCEPTION 'CAPPED_STEP_INVALID';END IF;
   FOREACH key IN ARRAY ARRAY['conceptCode','availableCode','officialAvailableCode','reserveCode'] LOOP IF jsonb_typeof(s->key) IS DISTINCT FROM 'string' OR s->>key!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'CAPPED_STEP_INVALID';END IF;END LOOP;
   IF s->>'conceptCode'=ANY(concepts) OR s->>'conceptCode'=ANY(prior) THEN RAISE EXCEPTION 'CAPPED_ORDER_INVALID';END IF;concepts:=array_append(concepts,s->>'conceptCode');
   codes:=ARRAY[s->>'availableCode',s->>'officialAvailableCode'];
   IF s->>'kind'='capped' THEN
    capped:=capped+1;
    IF coalesce(s->>'method' IN('27','29'),false) IS NOT TRUE OR coalesce(s->>'effectStage' IN('exact','rounded'),false) IS NOT TRUE OR jsonb_typeof(s->'requestedCode') IS DISTINCT FROM 'string' OR s->>'requestedCode'!~'^[0-9]{1,9}$' OR jsonb_typeof(s->'limitCode') IS DISTINCT FROM 'string' OR s->>'limitCode'!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'CAPPED_STEP_INVALID';END IF;
    codes:=array_append(codes,s->>'limitCode');
   ELSIF EXISTS(SELECT 1 FROM unnest(ARRAY['requestedCode','limitCode','method','effectStage']) k WHERE s->k IS DISTINCT FROM 'null'::jsonb) THEN RAISE EXCEPTION 'CAPPED_STEP_INVALID';END IF;
   FOREACH key IN ARRAY codes LOOP IF key=ANY(owned) THEN RAISE EXCEPTION 'CAPPED_ORDER_INVALID';END IF;owned:=array_append(owned,key);END LOOP;
  END LOOP;
  IF capped=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'steps') step_row WHERE step_row->>'reserveCode'=ANY(owned) OR step_row->>'requestedCode'=ANY(owned)) THEN RAISE EXCEPTION 'CAPPED_STEP_INVALID';END IF;
 END LOOP;
 PERFORM public.own_policy_resolve_candidate_v1(policies,'capped-deduction');RETURN policies;
END
$capped$;

ALTER FUNCTION public.own_capped_policies_v1(text,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_capped_policies_v1(text,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_capped_references_v1(node jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
SELECT coalesce(jsonb_agg(id ORDER BY id COLLATE "C"),'[]') FROM(
 SELECT DISTINCT (n->>'op')||':'||(n->>'code') AS id FROM jsonb_path_query(node,'lax $.**') n WHERE jsonb_typeof(n)='object' AND n->>'op' IN('concept','auxiliary')) x
$capped$;

ALTER FUNCTION public.own_capped_references_v1(jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_capped_references_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_capped_row_value_v1(rows jsonb,contract text,agreement text,space text,code text,stage text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE r jsonb;found integer;
BEGIN
 SELECT count(*),jsonb_agg(x)->0 INTO found,r FROM jsonb_array_elements(rows) x WHERE x->>'contractId'=contract AND x->>'conceptCode'=code AND (CASE WHEN x->>'nature'='auxiliary' THEN 'auxiliary' ELSE 'concept' END)=space;
 IF found<>1 OR r->>'agreementCode' IS DISTINCT FROM agreement OR r->>'unit' IS DISTINCT FROM 'money' OR coalesce(stage IN('exact','rounded'),false) IS NOT TRUE OR public.own_run_quantity_rational_v1(r->'exactValue') IS NOT TRUE THEN RAISE EXCEPTION 'CAPPED_ROW_REQUIRED';END IF;
 IF stage='rounded' THEN RETURN public.own_run_official_decimal_v1(r->'amount');END IF;RETURN r->'exactValue';
END
$capped$;

ALTER FUNCTION public.own_capped_row_value_v1(jsonb,text,text,text,text,text) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_capped_row_value_v1(jsonb,text,text,text,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_capped_step_expressions_v1(p jsonb,step_index integer) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE s jsonb:=p->'steps'->step_index;prior jsonb:=p->'steps'->(step_index-1);v jsonb;
BEGIN
 IF step_index<0 OR step_index>=jsonb_array_length(p->'steps') THEN RAISE EXCEPTION 'CAPPED_ORDER_INVALID';END IF;
 v:=jsonb_build_object('available',CASE WHEN step_index=0 THEN p->'cashBaseReference' ELSE jsonb_build_object('op','subtract','left',jsonb_build_object('op','auxiliary','code',prior->'availableCode','stage','exact'),'right',jsonb_build_object('op','concept','code',prior->'conceptCode','stage','rounded')) END,
 'officialAvailable',CASE WHEN step_index=0 THEN p->'officialBaseReference' ELSE jsonb_build_object('op','subtract','left',jsonb_build_object('op','auxiliary','code',prior->'officialAvailableCode','stage','exact'),'right',jsonb_build_object('op','concept','code',prior->'conceptCode','stage','exact')) END);
 IF s->>'kind'='capped' THEN v:=v||jsonb_build_object('limit',jsonb_build_object('op','choose','condition',jsonb_build_object('op','compare','operator','gt','left',jsonb_build_object('op','round','value',jsonb_build_object('op','max','left',jsonb_build_object('op','subtract','left',jsonb_build_object('op','min','left',jsonb_build_object('op','auxiliary','code',s->'availableCode','stage','exact'),'right',jsonb_build_object('op','auxiliary','code',s->'officialAvailableCode','stage','exact')),'right',jsonb_build_object('op','auxiliary','code',s->'reserveCode','stage','exact')),'right',jsonb_build_object('op','literal','value','0','unit','money')),'rounding','{"precision":2,"mode":"half_up"}'::jsonb),'right',jsonb_build_object('op','max','left',jsonb_build_object('op','subtract','left',jsonb_build_object('op','min','left',jsonb_build_object('op','auxiliary','code',s->'availableCode','stage','exact'),'right',jsonb_build_object('op','auxiliary','code',s->'officialAvailableCode','stage','exact')),'right',jsonb_build_object('op','auxiliary','code',s->'reserveCode','stage','exact')),'right',jsonb_build_object('op','literal','value','0','unit','money'))),'then',jsonb_build_object('op','subtract','left',jsonb_build_object('op','round','value',jsonb_build_object('op','max','left',jsonb_build_object('op','subtract','left',jsonb_build_object('op','min','left',jsonb_build_object('op','auxiliary','code',s->'availableCode','stage','exact'),'right',jsonb_build_object('op','auxiliary','code',s->'officialAvailableCode','stage','exact')),'right',jsonb_build_object('op','auxiliary','code',s->'reserveCode','stage','exact')),'right',jsonb_build_object('op','literal','value','0','unit','money')),'rounding','{"precision":2,"mode":"half_up"}'::jsonb),'right',jsonb_build_object('op','literal','value','0.01','unit','money')),'else',jsonb_build_object('op','round','value',jsonb_build_object('op','max','left',jsonb_build_object('op','subtract','left',jsonb_build_object('op','min','left',jsonb_build_object('op','auxiliary','code',s->'availableCode','stage','exact'),'right',jsonb_build_object('op','auxiliary','code',s->'officialAvailableCode','stage','exact')),'right',jsonb_build_object('op','auxiliary','code',s->'reserveCode','stage','exact')),'right',jsonb_build_object('op','literal','value','0','unit','money')),'rounding','{"precision":2,"mode":"half_up"}'::jsonb)),'amount',jsonb_build_object('op','min','left',jsonb_build_object('op','auxiliary','code',s->'requestedCode','stage','exact'),'right',jsonb_build_object('op','auxiliary','code',s->'limitCode','stage','exact')));END IF;
 RETURN v;
END
$capped$;

ALTER FUNCTION public.own_capped_step_expressions_v1(jsonb,integer) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_capped_step_expressions_v1(jsonb,integer) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_close_official_capture_check_candidate_v1(capture jsonb,period_value text,type_value text)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE saved jsonb:=capture->'saved'; i jsonb:=saved->'input';r jsonb:=saved->'result';p jsonb:=capture->'payload';programme jsonb:=p#>'{programState,program,definition}'; policies jsonb;phases jsonb;
BEGIN
 PERFORM public.own_run_capped_verify_v1(p,i,r);
 PERFORM public.own_run_monthly_forced_capture_check_candidate_v1(p,i,r);
 IF jsonb_typeof(capture) IS DISTINCT FROM 'object' OR jsonb_typeof(p) IS DISTINCT FROM 'object'
 OR jsonb_typeof(saved) IS DISTINCT FROM 'object' OR jsonb_typeof(i) IS DISTINCT FROM 'object' OR jsonb_typeof(r) IS DISTINCT FROM 'object'
 OR coalesce(capture->>'id','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 OR capture->>'payloadSha256' IS DISTINCT FROM public.own_run_hash_v1(p)
 OR saved->>'inputSha256' IS DISTINCT FROM public.own_run_hash_v1(i)
 OR saved->>'resultSha256' IS DISTINCT FROM public.own_run_hash_v1(r)
 OR i->>'version' NOT IN('own-payroll-input.v4','own-payroll-input.v5')
 OR r->>'version' IS DISTINCT FROM replace(i->>'version','input','result')
 OR i->>'period' IS DISTINCT FROM period_value OR i->>'liquidationType' IS DISTINCT FROM type_value
 OR p->>'period' IS DISTINCT FROM period_value OR p->>'liquidationType' IS DISTINCT FROM type_value
 OR p->'selection' IS DISTINCT FROM i->'selection'
 THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_CAPTURE_INVALID';END IF;
 IF programme ? 'fixedForcedAmountsVersion' OR programme ? 'fixedForcedAmountsPolicy'
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_FIXED_FORCED_COMPOSITION_REQUIRED';END IF;
 IF i->'rules' IS DISTINCT FROM public.own_participation_rules_v1(programme)
 OR i->'totalsPrecision' IS DISTINCT FROM programme->'totalsPrecision'
 OR i#>>'{sourceVersions,population}' IS DISTINCT FROM p#>>'{population,version}'
 OR i#>>'{sourceVersions,rules}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('program',p#>'{programState,program}','salary',p#>'{programState,salaryCatalog}'))
 OR i#>>'{sourceVersions,novelties}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('monthly',p->'monthly','fixed',p#>'{fixed,export,data}'))
 OR p#>'{population,complete}' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_SOURCE_INVALID';END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY public.own_program_quantity_key_v1(x) COLLATE "C"),'[]') INTO phases
 FROM jsonb_array_elements(public.own_program_quantity_effective_v1(programme)) x;
 IF i->'quantityPhasesVersion' IS DISTINCT FROM programme->'quantityPhasesVersion' OR i->'quantityPhases' IS DISTINCT FROM phases
 THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_QUANTITY_PHASES_INVALID';END IF;
 IF (SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId' COLLATE "C") FROM jsonb_array_elements(i->'employees') e)
 IS DISTINCT FROM(SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId' COLLATE "C") FROM jsonb_array_elements(p#>'{population,employees}') e)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(i->'employees') e JOIN jsonb_array_elements(p#>'{population,employees}') x ON x->'contractId'=e->'contractId'
 WHERE e->'employeeNumber' IS DISTINCT FROM x->'employeeNumber' OR e->'agreementCode' IS DISTINCT FROM x->'agreementCode' OR e->'departmentCode' IS DISTINCT FROM x->'departmentCode')
 THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_POPULATION_INVALID';END IF;
 IF programme->>'officialTotalsVersion'='own-payroll-official-totals.v2' THEN
  SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO policies FROM jsonb_array_elements(public.own_program_official_policies_candidate_v2(programme->'officialTotalsPolicies','own-payroll-official-totals.v2')) WITH ORDINALITY z(x,n) WHERE x->'agreementCode'=i#>'{officialTotalsPolicy,agreementCode}' AND x->>'liquidationType'=type_value;
  IF i->'officialTotalsCapture' IS DISTINCT FROM public.own_run_official_policy_capture_candidate_v2(policies,period_value,type_value,i#>>'{officialTotalsPolicy,agreementCode}') THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_POLICY_INVALID';END IF;
  policies:=public.own_policy_active_candidate_v1(policies,'official-totals',period_value,type_value,i#>>'{officialTotalsPolicy,agreementCode}');
 ELSE
  IF i ? 'officialTotalsCapture' OR programme->>'officialTotalsVersion' IS DISTINCT FROM 'own-payroll-official-totals.v1' THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_POLICY_INVALID';END IF;
 SELECT coalesce(jsonb_agg(x),'[]') INTO policies FROM jsonb_array_elements(programme->'officialTotalsPolicies') x
 WHERE x->'agreementCode'=i#>'{officialTotalsPolicy,agreementCode}' AND x->>'period'=period_value AND x->>'liquidationType'=type_value;
 END IF;
 IF jsonb_array_length(policies)<>1 OR policies->0 IS DISTINCT FROM i->'officialTotalsPolicy'
 THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_POLICY_INVALID';END IF;
 IF i->>'version'='own-payroll-input.v5' THEN
  PERFORM public.own_run_row_emission_capture_check_v1(p,i,r);
 ELSE
  IF i ? 'rowEmissionVersion' OR i ? 'rowEmissionPolicies' OR r ? 'rowEmissions' OR r ? 'receiptRowKeys'
  OR programme ? 'rowEmissionVersion' OR programme ? 'rowEmissionPolicies'
  THEN RAISE EXCEPTION 'OWN_CLOSE_EMISSION_OPT_IN_REQUIRED';END IF;
  IF i ? 'familyTariffsVersion' OR r ? 'familyTariffsVersion' OR programme ? 'familyTariffsVersion' THEN
   PERFORM public.own_run_family_tariff_result_verify_candidate_v2(p,i,r);
  ELSE
   PERFORM public.own_run_family_input_verify_v1(p,i);
   PERFORM public.own_run_official_result_check_v1(i,r);
  END IF;
 END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.own_close_snapshot_official_candidate_v1(detail jsonb,selection jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE line_detail jsonb:=detail;captures jsonb:='[]';capture jsonb;saved jsonb;i jsonb;r jsonb;
 base jsonb;employee jsonb;out_employee jsonb;employees jsonb:='[]';sources jsonb:='[]';seen jsonb:='{}';
 total jsonb;line_total jsonb;reconciliation jsonb;quantities jsonb;decisions jsonb;emissions jsonb;keys jsonb;tariff_record jsonb;src jsonb;
 totals jsonb:='{"remuneration":0,"non_remuneration":0,"deduction":0,"employer_contribution":0,"gross":0,"net":0}';
 formatted jsonb:='{}';k text;contract_value text;run_value text;has_v5 boolean:=false;official boolean;
 capped_count integer:=0;has_capped boolean:=false;cap jsonb;quantity_count integer:=0;emission_count integer:=0;tariff_count integer:=0;receipt_count integer:=0;precision_value integer;
BEGIN
 IF jsonb_typeof(detail->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(detail->'rows')>10000
 OR (SELECT count(DISTINCT x->>'contractId') FROM jsonb_array_elements(detail->'rows') x)<>jsonb_array_length(detail->'rows')
 THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_CONTRACT_DUPLICATE';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(detail->'rows') e
  LEFT JOIN jsonb_array_elements(detail->'captures') c ON c->>'id'=e->>'runId'
  WHERE (selection->>'kind'='all' OR selection->'values' ? (e->>CASE selection->>'kind'
   WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END))
  AND (e->'resultSha256' IS DISTINCT FROM c#>'{saved,resultSha256}' OR c IS NULL))
 THEN RAISE EXCEPTION 'OWN_CLOSE_DETAIL_RESULT_CHANGED';END IF;
 -- The line projection exists only inside this pure function. It is not saved,
 -- hashed as a run, or passed to a finalizer. Every original is checked first.
 FOR capture IN SELECT value FROM jsonb_array_elements(detail->'captures') LOOP
  IF capture#>>'{saved,input,version}' IN('own-payroll-input.v4','own-payroll-input.v5') AND EXISTS(
   SELECT 1 FROM jsonb_array_elements(detail->'rows') e WHERE e->>'runId'=capture->>'id'
   AND (selection->>'kind'='all' OR selection->'values' ? (e->>CASE selection->>'kind'
    WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END))) THEN
   PERFORM public.own_close_official_capture_check_candidate_v1(capture,detail->>'period',detail->>'liquidationType');
   captures:=captures||jsonb_build_array(jsonb_set(capture,'{saved,result,employeeTotals}',capture#>'{saved,result,lineEmployeeTotals}'));
  ELSE captures:=captures||jsonb_build_array(capture);END IF;
 END LOOP;
 line_detail:=jsonb_set(line_detail,'{captures}',captures);
 -- Exact copy of the historical constructor validates selection, decisions,
 -- jurisdictions, unchanged economic rows, precision and printed line sums.
 base:=public.own_close_snapshot_legacy_r12_v1(line_detail,selection);
 precision_value:=(base->>'precision')::integer;
 FOR employee IN SELECT value FROM jsonb_array_elements(base->'employees') LOOP
  contract_value:=employee->>'contractId';run_value:=employee->>'runId';
  IF (SELECT count(*) FROM jsonb_array_elements(detail->'captures') c WHERE c->>'id'=run_value)<>1
  THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_CAPTURE_DUPLICATE';END IF;
  SELECT value INTO capture FROM jsonb_array_elements(detail->'captures') WHERE value->>'id'=run_value;
  saved:=capture->'saved';i:=saved->'input';r:=saved->'result';official:=i->>'version' IN('own-payroll-input.v4','own-payroll-input.v5');
  IF official THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(i->'employees') x WHERE x->>'contractId'=contract_value
    AND x->'employeeNumber'=employee->'employeeNumber' AND x->'agreementCode'=employee->'agreementCode' AND x->'departmentCode'=employee->'departmentCode')
   THEN RAISE EXCEPTION 'OWN_CLOSE_ORIGINAL_IDENTITY_INVALID';END IF;
   SELECT value INTO STRICT total FROM jsonb_array_elements(r->'employeeTotals') WHERE value->>'contractId'=contract_value;
   SELECT value INTO STRICT line_total FROM jsonb_array_elements(r->'lineEmployeeTotals') WHERE value->>'contractId'=contract_value;
   SELECT value INTO STRICT reconciliation FROM jsonb_array_elements(r->'totalReconciliations') WHERE value->>'contractId'=contract_value;
   SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO quantities FROM jsonb_array_elements(r->'quantities') WITH ORDINALITY z(x,n) WHERE x->>'contractId'=contract_value;
   SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO decisions FROM jsonb_array_elements(coalesce(r->'familyTariffDecisions','[]')) WITH ORDINALITY z(x,n) WHERE x->>'contractId'=contract_value;
   SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO emissions FROM jsonb_array_elements(coalesce(r->'rowEmissions','[]')) WITH ORDINALITY z(x,n) WHERE x->>'contractId'=contract_value;
   SELECT value INTO tariff_record FROM jsonb_array_elements(coalesce(i#>'{familyTariffCapture,records}','[]')) WHERE value->>'contractId'=contract_value;
   IF i->>'version'='own-payroll-input.v5' THEN
    has_v5:=true;
    SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO keys FROM jsonb_array_elements(r->'receiptRowKeys') WITH ORDINALITY z(x,n) WHERE split_part(x#>>'{}',':',1)=contract_value;
   ELSE
    SELECT coalesce(jsonb_agg(contract_value||':concept:'||(x->>'conceptCode') ORDER BY n),'[]') INTO keys FROM jsonb_array_elements(r->'rows') WITH ORDINALITY z(x,n) WHERE x->>'contractId'=contract_value AND x->>'nature'<>'auxiliary';
   END IF;
   IF employee->'totals' IS DISTINCT FROM line_total THEN RAISE EXCEPTION 'OWN_CLOSE_LINE_PROJECTION_CHANGED';END IF;
   out_employee:=employee||jsonb_build_object('totals',total,'lineTotals',line_total,'totalReconciliation',reconciliation,
    'inputVersion',i->>'version','resultVersion',r->>'version','namespaceVersion',i->>'namespaceVersion',
    'quantities',quantities,'familyTariffDecisions',decisions,'familyTariffRecord',coalesce(tariff_record,'null'),
    'rowEmissions',emissions,'receiptRowKeys',keys);
  ELSE
   total:=employee->'totals';line_total:=total;quantities:='[]';decisions:='[]';emissions:='[]';
   SELECT coalesce(jsonb_agg(contract_value||':concept:'||(x->>'conceptCode') ORDER BY n),'[]') INTO keys FROM jsonb_array_elements(base->'concepts') WITH ORDINALITY z(x,n) WHERE x->>'contractId'=contract_value AND x->>'nature'<>'auxiliary';
   out_employee:=employee||jsonb_build_object('lineTotals',line_total,'totalReconciliation',NULL,'inputVersion',i->>'version','resultVersion',r->>'version',
    'quantities',quantities,'familyTariffDecisions',decisions,'familyTariffRecord',NULL,'rowEmissions',emissions,'receiptRowKeys',keys);
  END IF;
  cap:=public.own_capped_contract_result_v1(r,contract_value);out_employee:=out_employee||cap;IF cap<>'{}' THEN has_capped:=true;capped_count:=capped_count+(cap->>'cappedDeductionEffectCount')::integer;END IF;
  FOREACH k IN ARRAY ARRAY['remuneration','non_remuneration','deduction','employer_contribution','gross','net'] LOOP
   totals:=jsonb_set(totals,ARRAY[k],to_jsonb((totals->>k)::numeric+(total->>k)::numeric));
  END LOOP;
  quantity_count:=quantity_count+jsonb_array_length(quantities);tariff_count:=tariff_count+jsonb_array_length(decisions);
  emission_count:=emission_count+jsonb_array_length(emissions);receipt_count:=receipt_count+jsonb_array_length(keys);
  employees:=employees||jsonb_build_array(out_employee);
  IF NOT seen ? run_value THEN
   src:=jsonb_build_object('runId',run_value,'inputVersion',i->>'version','resultVersion',r->>'version',
    'payloadSha256',capture->>'payloadSha256','inputSha256',saved->>'inputSha256','resultSha256',saved->>'resultSha256',
    'officialTotalsPolicy',coalesce(i->'officialTotalsPolicy','null'),
    'quantityPhasesVersion',coalesce(i->'quantityPhasesVersion','null'),'quantityPhases',coalesce(i->'quantityPhases','[]'),
    'familyTariffsVersion',coalesce(i->'familyTariffsVersion','null'),
    'familyTariffCaptureMetadata',coalesce((i->'familyTariffCapture')-'records','null'),
    'rowEmissionVersion',coalesce(i->'rowEmissionVersion','null'),'rowEmissionPolicies',coalesce(i->'rowEmissionPolicies','[]'));
   IF i ? 'officialTotalsCapture' THEN src:=src||jsonb_build_object('officialTotalsCapture',i->'officialTotalsCapture');END IF;
   IF i ? 'cappedDeductionsVersion' THEN src:=src||jsonb_build_object('cappedDeductionsVersion',i->'cappedDeductionsVersion','cappedDeductionCapture',i->'cappedDeductionCapture');END IF;
   sources:=sources||jsonb_build_array(src);seen:=seen||jsonb_build_object(run_value,true);
  END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['remuneration','non_remuneration','deduction','employer_contribution','gross','net'] LOOP
  IF (totals->>k)::numeric<>trunc((totals->>k)::numeric,precision_value) THEN RAISE EXCEPTION 'OWN_CLOSE_OFFICIAL_PRECISION_INVALID';END IF;
  formatted:=formatted||jsonb_build_object(k,trunc((totals->>k)::numeric,precision_value)::text);
 END LOOP;
 RETURN base||(CASE WHEN has_capped THEN jsonb_build_object('cappedDeductionEffectCount',capped_count) ELSE '{}'::jsonb END)||jsonb_build_object('version',CASE WHEN has_v5 THEN 'own-close-snapshot.v5' ELSE 'own-close-snapshot.v4' END,
  'employees',employees,'totals',formatted,'lineTotals',base->'totals',
  'netDifferenceFromLines',trunc((formatted->>'net')::numeric-(base#>>'{totals,net}')::numeric,precision_value)::text,
  'sources',sources,'quantityCount',quantity_count,'familyTariffDecisionCount',tariff_count,
  'emissionDecisionCount',emission_count,'receiptRowCount',receipt_count,'economicRowsPreserved',true);
END $fn$;

CREATE OR REPLACE FUNCTION public.own_policy_resolve_candidate_v1(policies jsonb,kind text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $policy_resolve$
DECLARE p jsonb;e jsonb;prior jsonb;entries jsonb:='{}';resolved jsonb:='[]';ids text[]:='{}';id text;prior_id text;scope_value text;start_value text;end_value text;next_id text;seen text[];temporal boolean;
BEGIN
 IF kind IS NULL OR kind NOT IN('monthly-forced','capped-deduction','conditional-source','family-tariff','row-emission','official-totals','source-coverage','declared-adjustment','quantity-only') OR jsonb_typeof(policies) IS DISTINCT FROM 'array' OR jsonb_array_length(policies) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'POLICY_SUCCESSION_INVALID';END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(policies) LOOP
  temporal:=CASE kind WHEN 'capped-deduction' THEN true WHEN 'monthly-forced' THEN p->>'version'='own-monthly-forced-passthrough.v2' WHEN 'conditional-source' THEN true WHEN 'quantity-only' THEN true WHEN 'declared-adjustment' THEN true WHEN 'source-coverage' THEN true WHEN 'family-tariff' THEN p->>'version' IN('own-payroll-family-tariffs.v3','own-payroll-family-tariffs.v4') WHEN 'official-totals' THEN p->>'version'='own-payroll-official-totals.v2' ELSE p->>'version'='own-payroll-row-emission.v2' END;
  IF temporal THEN
   PERFORM public.own_policy_declaration_candidate_v1(p);id:=p->>'policyId';start_value:=p->>'validFrom';end_value:=p->>'validUntil';
  ELSE
   IF jsonb_typeof(p->'period') IS DISTINCT FROM 'string' OR p->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
   OR jsonb_typeof(p->'agreementCode') IS DISTINCT FROM 'string' OR p->>'agreementCode'!~'^[0-9]{1,9}$'
   OR jsonb_typeof(p->'liquidationType') IS DISTINCT FROM 'string' OR p->>'liquidationType' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other')
   OR p ?| ARRAY['policyId','supersedes','validFrom','validUntil'] THEN RAISE EXCEPTION 'POLICY_SUCCESSION_INVALID';END IF;
   start_value:=p->>'period';end_value:=start_value;
   id:='legacy:'||kind||':'||(p->>'agreementCode')||':'||start_value||':'||(p->>'liquidationType')||CASE kind WHEN 'monthly-forced' THEN ':'||(p->>'sourceCode') WHEN 'conditional-source' THEN ':'||(p->>'inputKey') WHEN 'row-emission' THEN ':'||(p->>'conceptCode') WHEN 'quantity-only' THEN ':'||(p->>'sourceCode') WHEN 'declared-adjustment' THEN ':'||(p->>'sourceCode') ELSE '' END;
  END IF;
  IF id IS NULL OR entries ? id THEN RAISE EXCEPTION 'POLICY_ID_DUPLICATE';END IF;
  scope_value:=(p->>'agreementCode')||':'||(p->>'liquidationType')||CASE kind WHEN 'monthly-forced' THEN ':'||(p->>'sourceCode') WHEN 'conditional-source' THEN ':'||(p->>'inputKey') WHEN 'row-emission' THEN ':'||(p->>'conceptCode') WHEN 'quantity-only' THEN ':'||(p->>'sourceCode') WHEN 'declared-adjustment' THEN ':'||(p->>'sourceCode') ELSE '' END;
  IF scope_value IS NULL THEN RAISE EXCEPTION 'POLICY_SUCCESSION_INVALID';END IF;
  entries:=jsonb_set(entries,ARRAY[id],jsonb_build_object('policy',p,'policyId',id,'validFrom',start_value,'validUntil',end_value,'successor',NULL,'scope',scope_value));ids:=array_append(ids,id);
 END LOOP;
 FOREACH id IN ARRAY ids LOOP
  e:=entries->id;prior_id:=e#>>'{policy,supersedes,policyId}';IF prior_id IS NULL THEN CONTINUE;END IF;
  prior:=entries->prior_id;IF prior IS NULL THEN RAISE EXCEPTION 'POLICY_PREDECESSOR_MISSING';END IF;
  IF prior->'successor'<>'null'::jsonb THEN RAISE EXCEPTION 'POLICY_SUCCESSION_BRANCH';END IF;
  entries:=jsonb_set(entries,ARRAY[prior_id,'successor'],to_jsonb(id));
 END LOOP;
 FOREACH id IN ARRAY ids LOOP
  next_id:=id;seen:='{}';
  WHILE next_id IS NOT NULL LOOP
   IF next_id=ANY(seen) THEN RAISE EXCEPTION 'POLICY_SUCCESSION_CYCLE';END IF;
   seen:=array_append(seen,next_id);next_id:=entries#>>ARRAY[next_id,'successor'];
  END LOOP;
 END LOOP;
 FOREACH id IN ARRAY ids LOOP
  e:=entries->id;prior_id:=e#>>'{policy,supersedes,policyId}';IF prior_id IS NULL THEN CONTINUE;END IF;
  prior:=entries->prior_id;
  -- V1 official source references historically admitted decomposed Unicode.
  -- Validate its original closed shape and hash its exact text, without NFC rewriting.
  IF kind='official-totals' AND prior#>>'{policy,version}'='own-payroll-official-totals.v1' THEN PERFORM public.own_program_official_policy_v1(prior->'policy');ELSE PERFORM public.own_policy_canonical_guard_candidate_v1(prior->'policy');END IF;
  IF public.own_run_hash_v1(prior->'policy') IS DISTINCT FROM e#>>'{policy,supersedes,policySha256}' THEN RAISE EXCEPTION 'POLICY_PREDECESSOR_CHANGED';END IF;
  IF prior->'scope' IS DISTINCT FROM e->'scope' THEN RAISE EXCEPTION 'POLICY_SUCCESSION_SCOPE_CHANGED';END IF;
  IF e->>'validFrom'<=prior->>'validFrom' THEN RAISE EXCEPTION 'POLICY_SUCCESSION_DATE_INVALID';END IF;
  end_value:=to_char((e->>'validFrom'||'-01')::date-interval '1 month','YYYY-MM');
  IF prior->'validUntil'='null'::jsonb OR end_value<prior->>'validUntil' THEN entries:=jsonb_set(entries,ARRAY[prior_id,'validUntil'],to_jsonb(end_value));END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_each(entries) a, jsonb_each(entries) b WHERE a.key COLLATE "C"<b.key COLLATE "C" AND a.value->'scope'=b.value->'scope'
  AND coalesce(a.value->>'validUntil','9999-12')>=b.value->>'validFrom' AND coalesce(b.value->>'validUntil','9999-12')>=a.value->>'validFrom') THEN RAISE EXCEPTION 'POLICY_VALIDITY_OVERLAP';END IF;
 FOREACH id IN ARRAY ids LOOP resolved:=resolved||jsonb_build_array((entries->id)-'scope');END LOOP;
 RETURN resolved;
END $policy_resolve$;

CREATE OR REPLACE FUNCTION public.own_program_capped_history_v1(prior jsonb,next_programme jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
BEGIN
 IF NOT coalesce(prior ?| ARRAY['cappedDeductionsVersion','cappedDeductionPolicies'],false) THEN RETURN;END IF;
 IF next_programme->'cappedDeductionsVersion' IS DISTINCT FROM prior->'cappedDeductionsVersion' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior->'cappedDeductionPolicies') p WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(next_programme->'cappedDeductionPolicies') n WHERE public.own_run_hash_v1(p)=public.own_run_hash_v1(n))) THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
 PERFORM public.own_capped_policies_v1(next_programme->>'cappedDeductionsVersion',next_programme->'cappedDeductionPolicies');
END
$capped$;

ALTER FUNCTION public.own_program_capped_history_v1(jsonb,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_program_capped_history_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_program_capped_options_v1(programme jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE policies jsonb;rules jsonb;official_entries jsonb;entry jsonb;month text;selected jsonb;
BEGIN
 IF NOT coalesce(programme ?| ARRAY['cappedDeductionsVersion','cappedDeductionPolicies'],false) THEN RETURN '{}';END IF;
 IF programme->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2' OR programme->>'quantityPhasesVersion' IS DISTINCT FROM 'own-payroll-quantity-phases.v1' OR programme->'totalsPrecision' IS DISTINCT FROM '2'::jsonb OR coalesce(programme->>'officialTotalsVersion' IN('own-payroll-official-totals.v1','own-payroll-official-totals.v2'),false) IS NOT TRUE THEN RAISE EXCEPTION 'CAPPED_PROGRAM_REQUIRED';END IF;
 policies:=public.own_capped_policies_v1(programme->>'cappedDeductionsVersion',programme->'cappedDeductionPolicies');rules:=public.own_participation_rules_v1(programme);official_entries:=public.own_policy_resolve_candidate_v1(programme->'officialTotalsPolicies','official-totals');
 FOR entry IN SELECT value FROM jsonb_array_elements(public.own_policy_resolve_candidate_v1(policies,'capped-deduction')) LOOP
  FOR month IN SELECT value FROM jsonb_array_elements_text(public.own_policy_boundaries_candidate_v1(entry,rules||official_entries)) LOOP
   selected:=public.own_policy_active_candidate_v1(programme->'officialTotalsPolicies','official-totals',month,entry#>>'{policy,liquidationType}',entry#>>'{policy,agreementCode}');
   IF jsonb_array_length(selected)<>1 THEN RAISE EXCEPTION 'CAPPED_DESTINATION_REQUIRED';END IF;
   PERFORM public.own_capped_context_v1(entry->'policy',rules,month,selected->0);
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('cappedDeductionsVersion','own-capped-deductions.v1','cappedDeductionPolicies',policies);
END
$capped$;

ALTER FUNCTION public.own_program_capped_options_v1(jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_program_capped_options_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_program_definition_composed_v1(p jsonb,items jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE normalized jsonb;base_program jsonb:=p-ARRAY['cappedDeductionsVersion','cappedDeductionPolicies','monthlyForcedAmountsVersion','monthlyForcedAmountPolicies','sourceCoverageVersion','sourceCoveragePolicies','monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies','quantityOnlyInputsVersion','quantityOnlyInputPolicies'];extension jsonb:='{}';coverage jsonb:='{}';
BEGIN
 IF jsonb_typeof(base_program)='object' AND (base_program ?| ARRAY['rowEmissionVersion','rowEmissionPolicies']) THEN
  normalized:=public.own_program_definition_official_v1(base_program-ARRAY['rowEmissionVersion','rowEmissionPolicies'],items);
  normalized:=normalized||public.own_program_row_emission_options_candidate_v1(normalized||jsonb_build_object('rowEmissionVersion',base_program->'rowEmissionVersion','rowEmissionPolicies',base_program->'rowEmissionPolicies'));
 ELSIF jsonb_typeof(base_program)='object' AND (base_program ?| ARRAY['officialTotalsVersion','officialTotalsPolicies']) THEN normalized:=public.own_program_definition_official_v1(base_program,items);
 ELSIF jsonb_typeof(base_program)='object' AND (base_program ?| ARRAY['quantityPhasesVersion','quantityPhases']) THEN normalized:=public.own_program_quantity_definition_v1(base_program,items);
 ELSE normalized:=public.own_program_definition_v1(base_program,items);END IF;
 IF coalesce(p ?| ARRAY['monthlyForcedAmountsVersion','monthlyForcedAmountPolicies'],false) THEN
  extension:=public.own_program_monthly_forced_options_candidate_v1(normalized||jsonb_build_object('monthlyForcedAmountsVersion',p->'monthlyForcedAmountsVersion','monthlyForcedAmountPolicies',p->'monthlyForcedAmountPolicies'));
 END IF;
 IF coalesce(p ?| ARRAY['monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies'],false) THEN
  extension:=extension||public.own_program_declared_adjustments_options_v1(normalized||jsonb_build_object('monthlyDeclaredAdjustmentsVersion',p->'monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies',p->'monthlyDeclaredAdjustmentPolicies'));
 END IF;
 IF coalesce(p ?| ARRAY['sourceCoverageVersion','sourceCoveragePolicies'],false) THEN
  coverage:=public.own_program_source_coverage_options_v1(normalized||jsonb_build_object('sourceCoverageVersion',p->'sourceCoverageVersion','sourceCoveragePolicies',p->'sourceCoveragePolicies'));
 END IF;
 IF coalesce(p ?| ARRAY['quantityOnlyInputsVersion','quantityOnlyInputPolicies'],false) THEN
  extension:=extension||public.own_program_quantity_only_options_v1(normalized||extension||coverage||jsonb_build_object('quantityOnlyInputsVersion',p->'quantityOnlyInputsVersion','quantityOnlyInputPolicies',p->'quantityOnlyInputPolicies'));
 END IF;
 IF coalesce(p ?| ARRAY['conditionalSourcesVersion','conditionalSourcePolicies'],false) THEN
  normalized:=normalized||public.own_program_conditional_options_v1(normalized||extension||coverage);
 END IF;
 IF coalesce(p ?| ARRAY['cappedDeductionsVersion','cappedDeductionPolicies'],false) THEN extension:=extension||public.own_program_capped_options_v1(normalized||extension||coverage||jsonb_build_object('cappedDeductionsVersion',p->'cappedDeductionsVersion','cappedDeductionPolicies',p->'cappedDeductionPolicies'));END IF;
 RETURN normalized||extension||coverage;
END $function$;

CREATE OR REPLACE FUNCTION public.own_receipt_official_record_candidate_v1(record_value jsonb,closed jsonb,employee jsonb,capture jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE cid text:=employee->>'contractId';saved jsonb:=capture->'saved';i jsonb:=saved->'input';r jsonb:=saved->'result';
 rows_value jsonb;quantities jsonb;total jsonb;line_total jsonb;reconciliation jsonb;decisions jsonb;emissions jsonb;keys jsonb;tariff_record jsonb;
 cap jsonb;observed_cap jsonb;source_value jsonb;expected_source jsonb;visible jsonb;omissions jsonb;original_concepts jsonb:=record_value->'concepts';
 k text;amount numeric;sums jsonb:='{"remuneration":0,"non_remuneration":0,"deduction":0,"employer_contribution":0,"gross":0,"net":0}';line jsonb;
BEGIN
 PERFORM public.own_run_capped_verify_v1(capture->'payload',i,r);
 cap:=public.own_capped_contract_result_v1(r,cid);SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO observed_cap FROM jsonb_each(employee) WHERE key IN('cappedDeductionsVersion','cappedDeductionEffectCount','cappedDeductionEffects');IF public.own_run_hash_v1(observed_cap) IS DISTINCT FROM public.own_run_hash_v1(cap) THEN RAISE EXCEPTION 'CAPPED_EFFECT_MISMATCH';END IF;
 IF closed->>'version' NOT IN('own-close-snapshot.v4','own-close-snapshot.v5') OR i->>'version' NOT IN('own-payroll-input.v4','own-payroll-input.v5')
 OR capture->>'id' IS DISTINCT FROM employee->>'runId' OR employee->>'runId' IS DISTINCT FROM record_value->>'runId'
 OR employee->'contractId' IS DISTINCT FROM record_value->'contractId'
 OR closed->>'period' IS DISTINCT FROM i->>'period' OR closed->>'liquidationType' IS DISTINCT FROM i->>'liquidationType'
 OR r->>'period' IS DISTINCT FROM i->>'period' OR r->>'liquidationType' IS DISTINCT FROM i->>'liquidationType'
 OR saved->'inputSha256' IS DISTINCT FROM employee->'inputSha256' OR saved->'resultSha256' IS DISTINCT FROM employee->'resultSha256'
 THEN RAISE EXCEPTION 'OWN_RECEIPT_ORIGINAL_SOURCE_INVALID';END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO rows_value FROM jsonb_array_elements(r->'rows') WITH ORDINALITY z(x,n) WHERE x->>'contractId'=cid;
 IF rows_value IS DISTINCT FROM(SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') FROM jsonb_array_elements(closed->'concepts') WITH ORDINALITY z(x,n) WHERE x->>'contractId'=cid)
 OR jsonb_array_length(rows_value)<>(employee->>'conceptCount')::integer THEN RAISE EXCEPTION 'OWN_RECEIPT_ECONOMIC_ROWS_CHANGED';END IF;
 SELECT value INTO STRICT total FROM jsonb_array_elements(r->'employeeTotals') WHERE value->>'contractId'=cid;
 SELECT value INTO STRICT line_total FROM jsonb_array_elements(r->'lineEmployeeTotals') WHERE value->>'contractId'=cid;
 SELECT value INTO STRICT reconciliation FROM jsonb_array_elements(r->'totalReconciliations') WHERE value->>'contractId'=cid;
 SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO quantities FROM jsonb_array_elements(r->'quantities') WITH ORDINALITY z(x,n) WHERE x->>'contractId'=cid;
 SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO decisions FROM jsonb_array_elements(coalesce(r->'familyTariffDecisions','[]')) WITH ORDINALITY z(x,n) WHERE x->>'contractId'=cid;
 SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO emissions FROM jsonb_array_elements(coalesce(r->'rowEmissions','[]')) WITH ORDINALITY z(x,n) WHERE x->>'contractId'=cid;
 SELECT value INTO tariff_record FROM jsonb_array_elements(coalesce(i#>'{familyTariffCapture,records}','[]')) WHERE value->>'contractId'=cid;
 IF i->>'version'='own-payroll-input.v5' THEN
  SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO keys FROM jsonb_array_elements(r->'receiptRowKeys') WITH ORDINALITY z(x,n) WHERE split_part(x#>>'{}',':',1)=cid;
 ELSE
  SELECT coalesce(jsonb_agg(cid||':concept:'||(x->>'conceptCode') ORDER BY n),'[]') INTO keys FROM jsonb_array_elements(rows_value) WITH ORDINALITY z(x,n) WHERE x->>'nature'<>'auxiliary';
 END IF;
 IF employee->'totals' IS DISTINCT FROM total OR employee->'lineTotals' IS DISTINCT FROM line_total
 OR employee->'totalReconciliation' IS DISTINCT FROM reconciliation OR employee->'quantities' IS DISTINCT FROM quantities
 OR employee->'familyTariffDecisions' IS DISTINCT FROM decisions OR employee->'rowEmissions' IS DISTINCT FROM emissions
 OR employee->'familyTariffRecord' IS DISTINCT FROM coalesce(tariff_record,'null') OR employee->'receiptRowKeys' IS DISTINCT FROM keys
 OR employee->'inputVersion' IS DISTINCT FROM i->'version' OR employee->'resultVersion' IS DISTINCT FROM r->'version'
 OR record_value->'totals' IS DISTINCT FROM total-'contractId'
 THEN RAISE EXCEPTION 'OWN_RECEIPT_ECONOMIC_EVIDENCE_CHANGED';END IF;
 expected_source:=jsonb_build_object('runId',capture->>'id','inputVersion',i->>'version','resultVersion',r->>'version',
  'payloadSha256',capture->>'payloadSha256','inputSha256',saved->>'inputSha256','resultSha256',saved->>'resultSha256',
  'officialTotalsPolicy',coalesce(i->'officialTotalsPolicy','null'),
  'quantityPhasesVersion',coalesce(i->'quantityPhasesVersion','null'),'quantityPhases',coalesce(i->'quantityPhases','[]'),
  'familyTariffsVersion',coalesce(i->'familyTariffsVersion','null'),
  'familyTariffCaptureMetadata',coalesce((i->'familyTariffCapture')-'records','null'),
  'rowEmissionVersion',coalesce(i->'rowEmissionVersion','null'),'rowEmissionPolicies',coalesce(i->'rowEmissionPolicies','[]'));
   IF i ? 'officialTotalsCapture' THEN expected_source:=expected_source||jsonb_build_object('officialTotalsCapture',i->'officialTotalsCapture');END IF;
 IF i ? 'cappedDeductionsVersion' THEN expected_source:=expected_source||jsonb_build_object('cappedDeductionsVersion',i->'cappedDeductionsVersion','cappedDeductionCapture',i->'cappedDeductionCapture');END IF;
 SELECT value INTO STRICT source_value FROM jsonb_array_elements(closed->'sources') WHERE value->>'runId'=capture->>'id';
 IF source_value IS DISTINCT FROM expected_source THEN RAISE EXCEPTION 'OWN_RECEIPT_ECONOMIC_SOURCE_CHANGED';END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY n),'[]') INTO visible FROM jsonb_array_elements(original_concepts) WITH ORDINALITY z(x,n)
 WHERE x->>'nature'<>'auxiliary' AND keys ? (cid||':concept:'||(x->>'code'));
 IF jsonb_array_length(visible)<>jsonb_array_length(keys) THEN RAISE EXCEPTION 'OWN_RECEIPT_SELECTOR_CHANGED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('decision',e,'calculatedRow',row_value,'quantity',q,'labeledConcept',label) ORDER BY en),'[]') INTO omissions
 FROM jsonb_array_elements(emissions) WITH ORDINALITY decision_rows(e,en)
 JOIN jsonb_array_elements(rows_value) row_value ON row_value->>'nature'<>'auxiliary' AND row_value->'conceptCode'=e->'conceptCode'
 LEFT JOIN jsonb_array_elements(quantities) q ON q->'conceptCode'=e->'conceptCode'
 JOIN jsonb_array_elements(original_concepts) label ON label->>'nature'<>'auxiliary' AND label->'code'=e->'conceptCode'
 WHERE e->>'decision'='omit' AND (i->>'rowEmissionVersion'='own-payroll-row-emission.v2' OR q IS NOT NULL);
 IF jsonb_array_length(omissions)<>(SELECT count(*) FROM jsonb_array_elements(emissions) e WHERE e->>'decision'='omit')
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(omissions) o WHERE (CASE WHEN i->>'rowEmissionVersion'='own-payroll-row-emission.v2' THEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.own_policy_active_candidate_v1(i->'rowEmissionPolicies','row-emission',i->>'period',i->>'liquidationType',i#>>'{officialTotalsPolicy,agreementCode}')) p WHERE p->'conceptCode'=o#>'{calculatedRow,conceptCode}') ELSE o#>>'{calculatedRow,conceptCode}' NOT IN('302','306') END)
  OR (o#>>'{calculatedRow,amount}')::numeric<>0 OR (o#>>'{calculatedRow,exactValue,numerator}')::numeric<>0)
 THEN RAISE EXCEPTION 'OWN_RECEIPT_OMISSION_CHANGED';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(visible) LOOP
  IF sums ? (line->>'nature') THEN sums:=jsonb_set(sums,ARRAY[line->>'nature'],to_jsonb((sums->>(line->>'nature'))::numeric+(line->>'amount')::numeric));END IF;
 END LOOP;
 sums:=sums||jsonb_build_object('gross',(sums->>'remuneration')::numeric+(sums->>'non_remuneration')::numeric,
  'net',(sums->>'remuneration')::numeric+(sums->>'non_remuneration')::numeric-(sums->>'deduction')::numeric);
 FOREACH k IN ARRAY ARRAY['remuneration','non_remuneration','deduction','employer_contribution','gross','net'] LOOP
  IF (sums->>k)::numeric<>(line_total->>k)::numeric THEN RAISE EXCEPTION 'OWN_RECEIPT_PRINTED_LINE_TOTAL_CHANGED';END IF;
 END LOOP;
 RETURN record_value||cap||jsonb_build_object('concepts',visible,'inputVersion',i->>'version','resultVersion',r->>'version',
  'inputSha256',saved->>'inputSha256','resultSha256',saved->>'resultSha256','payloadSha256',capture->>'payloadSha256',
  'lineTotals',line_total-'contractId','totalReconciliation',reconciliation,'quantities',quantities,
  'familyTariffDecisions',decisions,'familyTariffRecord',coalesce(tariff_record,'null'),'sourceEvidence',source_value,
  'economicRows',rows_value,'economicConcepts',original_concepts,'economicConceptCount',jsonb_array_length(original_concepts),
  'rowEmissions',emissions,'receiptRowKeys',keys,'omissionAudit',omissions,'omittedRowCount',jsonb_array_length(omissions));
END $fn$;

CREATE OR REPLACE FUNCTION public.own_run_capped_capture_v1(programme jsonb,period text,kind text,official jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE policies jsonb;selected jsonb;closure jsonb;options jsonb;
BEGIN
 IF NOT coalesce(programme ?| ARRAY['cappedDeductionsVersion','cappedDeductionPolicies'],false) THEN RETURN '{}';END IF;
 options:=public.own_program_capped_options_v1(programme);
 SELECT coalesce(jsonb_agg(p ORDER BY n),'[]') INTO policies FROM jsonb_array_elements(options->'cappedDeductionPolicies') WITH ORDINALITY a(p,n) WHERE p->'agreementCode'=official->'agreementCode' AND p->>'liquidationType'=kind;
 selected:=public.own_policy_active_candidate_v1(policies,'capped-deduction',period,kind,official->>'agreementCode');IF jsonb_array_length(selected)<>1 THEN RAISE EXCEPTION 'CAPPED_POLICY_REQUIRED';END IF;
 closure:=public.own_capped_context_v1(selected->0,public.own_participation_rules_v1(programme),period,official);
 RETURN jsonb_build_object('cappedDeductionsVersion','own-capped-deductions.v1','cappedDeductionCapture',jsonb_build_object('version','own-capped-deductions-capture.v1','period',period,'liquidationType',kind,'agreementCode',official->'agreementCode','policies',policies,'policiesSha256',public.own_run_hash_v1(policies),'ruleClosure',closure,'ruleClosureSha256',public.own_run_hash_v1(closure),'officialPolicySha256',public.own_run_hash_v1(official)));
END
$capped$;

ALTER FUNCTION public.own_run_capped_capture_v1(jsonb,text,text,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_capped_capture_v1(jsonb,text,text,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_run_capped_effects_v1(input_value jsonb,result_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE material jsonb;c jsonb;p jsonb;policy_list jsonb;rows jsonb:=result_value->'rows';s jsonb;contract text;agreement text;step_index integer;effects jsonb:='[]';
 cash jsonb;official jsonb;before_cash jsonb;before_official jsonb;reserve jsonb;applied jsonb;line jsonb;allowance jsonb;cash_limit jsonb;requested jsonb;unapplied jsonb;effect jsonb;effect_value jsonb;
 request_money text;unapplied_money text;line_money text;rounding jsonb;row_value jsonb;official_net jsonb;cash_net jsonb;
 zero_value jsonb:='{"numerator":"0","denominator":"1"}';line_policy jsonb:='{"precision":2,"mode":"half_up"}';floor_policy jsonb:='{"precision":2,"mode":"floor"}';
BEGIN
 material:=public.own_run_capped_input_v1(input_value);IF material='{}' THEN RETURN '{}';END IF;
 c:=material->'cappedDeductionCapture';agreement:=c->>'agreementCode';policy_list:=public.own_policy_active_candidate_v1(c->'policies','capped-deduction',c->>'period',c->>'liquidationType',agreement);p:=policy_list->0;
 IF jsonb_typeof(result_value->'employeeTotals') IS DISTINCT FROM 'array' OR (SELECT count(DISTINCT x->>'contractId') FROM jsonb_array_elements(result_value->'employeeTotals') x)<>jsonb_array_length(result_value->'employeeTotals') THEN RAISE EXCEPTION 'CAPPED_POPULATION_INVALID';END IF;
 FOR contract IN SELECT x->>'contractId' FROM jsonb_array_elements(result_value->'employeeTotals') x ORDER BY x->>'contractId' COLLATE "C" LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(rows) x WHERE x->>'contractId'=contract)<>(SELECT count(DISTINCT (CASE WHEN x->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(x->>'conceptCode')) FROM jsonb_array_elements(rows) x WHERE x->>'contractId'=contract) THEN RAISE EXCEPTION 'CAPPED_ROW_DUPLICATE';END IF;
  cash:=public.own_capped_row_value_v1(rows,contract,agreement,p#>>'{cashBaseReference,op}',p#>>'{cashBaseReference,code}',p#>>'{cashBaseReference,stage}');
  official:=public.own_capped_row_value_v1(rows,contract,agreement,p#>>'{officialBaseReference,op}',p#>>'{officialBaseReference,code}',p#>>'{officialBaseReference,stage}');step_index:=0;
  FOR s IN SELECT value FROM jsonb_array_elements(p->'steps') LOOP
   before_cash:=cash;before_official:=official;
   reserve:=public.own_capped_row_value_v1(rows,contract,agreement,'auxiliary',s->>'reserveCode','exact');
   applied:=public.own_capped_row_value_v1(rows,contract,agreement,'concept',s->>'conceptCode','exact');
   line:=public.own_capped_row_value_v1(rows,contract,agreement,'concept',s->>'conceptCode','rounded');
   IF (public.own_capped_math_v1(reserve,zero_value,'compare'))::integer<0 OR (public.own_capped_math_v1(applied,zero_value,'compare'))::integer<0 OR public.own_run_quantity_quantize_v1(applied,line_policy)->'value' IS DISTINCT FROM line
    OR (SELECT x->'rounding' FROM jsonb_array_elements(rows) x WHERE x->>'contractId'=contract AND x->>'nature'<>'auxiliary' AND x->>'conceptCode'=s->>'conceptCode') IS DISTINCT FROM p->'lineRounding' THEN RAISE EXCEPTION 'CAPPED_VALUE_INVALID';END IF;
   IF before_cash IS DISTINCT FROM public.own_capped_row_value_v1(rows,contract,agreement,'auxiliary',s->>'availableCode','exact') OR before_official IS DISTINCT FROM public.own_capped_row_value_v1(rows,contract,agreement,'auxiliary',s->>'officialAvailableCode','exact') THEN RAISE EXCEPTION 'CAPPED_ORDER_INVALID';END IF;
   allowance:=public.own_capped_math_v1(public.own_capped_math_v1(public.own_capped_math_v1(before_cash,before_official,'min'),reserve,'subtract'),zero_value,'max');
   cash_limit:=public.own_run_quantity_quantize_v1(allowance,floor_policy)->'value';requested:=NULL;unapplied:=NULL;effect:=NULL;
   IF s->>'kind'='capped' THEN
    requested:=public.own_capped_row_value_v1(rows,contract,agreement,'auxiliary',s->>'requestedCode','exact');
    IF (public.own_capped_math_v1(requested,zero_value,'compare'))::integer<0 OR cash_limit IS DISTINCT FROM public.own_capped_row_value_v1(rows,contract,agreement,'auxiliary',s->>'limitCode','exact') THEN RAISE EXCEPTION 'CAPPED_VALUE_INVALID';END IF;
    IF applied IS DISTINCT FROM public.own_capped_math_v1(requested,cash_limit,'min') THEN RAISE EXCEPTION 'CAPPED_AMOUNT_MISMATCH';END IF;
    unapplied:=public.own_capped_math_v1(requested,applied,'subtract');effect_value:=CASE WHEN s->>'method'='29' THEN applied ELSE unapplied END;
    effect:=jsonb_build_object('kind',CASE WHEN s->>'method'='29' THEN 'applied_assignment' ELSE 'unapplied_discount_contribution' END,'target',CASE WHEN s->>'method'='29' THEN 'L[133]' ELSE 'DCTONEFE' END,'sourceConceptCode',s->'conceptCode','stage',s->'effectStage','exact',CASE WHEN s->>'effectStage'='rounded' THEN public.own_run_quantity_quantize_v1(effect_value,line_policy)->'value' ELSE effect_value END,'amount',public.own_run_quantity_quantize_v1(effect_value,line_policy)->>'amount','debtWritten',false);
   END IF;
   cash:=public.own_capped_math_v1(before_cash,line,'subtract');official:=public.own_capped_math_v1(before_official,applied,'subtract');
   IF (public.own_capped_math_v1(cash,public.own_capped_math_v1(before_cash,reserve,'min'),'compare'))::integer<0 OR(public.own_capped_math_v1(official,public.own_capped_math_v1(before_official,reserve,'min'),'compare'))::integer<0 THEN RAISE EXCEPTION 'CAPPED_RESERVE_VIOLATION';END IF;
   request_money:=CASE WHEN requested IS NULL THEN NULL ELSE public.own_run_quantity_quantize_v1(requested,line_policy)->>'amount' END;
   unapplied_money:=CASE WHEN unapplied IS NULL THEN NULL ELSE public.own_run_quantity_quantize_v1(unapplied,line_policy)->>'amount' END;
   line_money:=public.own_run_quantity_quantize_v1(line,line_policy)->>'amount';
   IF requested IS NOT NULL AND public.own_run_official_decimal_v1(to_jsonb(request_money)) IS DISTINCT FROM public.own_capped_math_v1(line,public.own_run_official_decimal_v1(to_jsonb(unapplied_money)),'add') THEN RAISE EXCEPTION 'CAPPED_ROUNDING_RECONCILIATION';END IF;
   rounding:=jsonb_build_object('appliedDelta',public.own_capped_math_v1(line,applied,'subtract'),'requestedDelta',CASE WHEN requested IS NULL THEN NULL ELSE public.own_capped_math_v1(public.own_run_official_decimal_v1(to_jsonb(request_money)),requested,'subtract') END,'unappliedDelta',CASE WHEN unapplied IS NULL THEN NULL ELSE public.own_capped_math_v1(public.own_run_official_decimal_v1(to_jsonb(unapplied_money)),unapplied,'subtract') END,'remainingDifference',public.own_capped_math_v1(cash,official,'subtract'));
   effects:=effects||jsonb_build_array(jsonb_build_object('contractId',contract,'agreementCode',agreement,'policyId',p->'policyId','policySha256',public.own_run_hash_v1(p),'position',step_index+1,'kind',s->'kind','conceptCode',s->'conceptCode','method',s->'method','consumptionStage',p->'consumptionStage','officialConsumptionStage',p->'officialConsumptionStage','requested',CASE WHEN requested IS NULL THEN NULL ELSE jsonb_build_object('exact',requested,'amount',request_money) END,'availableBefore',before_cash,'officialAvailableBefore',before_official,'reserve',reserve,'allowance',allowance,'cashLimit',cash_limit,'applied',jsonb_build_object('exact',applied,'amount',line_money),'unapplied',CASE WHEN unapplied IS NULL THEN NULL ELSE jsonb_build_object('exact',unapplied,'amount',unapplied_money) END,'availableAfter',cash,'officialAvailableAfter',official,'rounding',rounding,'effect',effect,'sourceRowSha256',s->'sourceRowSha256','ruleReference',s->'ruleReference'));
   step_index:=step_index+1;
  END LOOP;
  official_net:=public.own_capped_row_value_v1(rows,contract,agreement,'auxiliary',input_value#>>'{officialTotalsPolicy,totalCodes,999}','exact');cash_net:=public.own_capped_row_value_v1(rows,contract,agreement,'auxiliary',input_value#>>'{officialTotalsPolicy,totalCodes,888}','rounded');
  FOR row_value IN SELECT x FROM jsonb_array_elements(rows) x WHERE x->>'contractId'=contract AND x->>'nature' IN('remuneration','non_remuneration','deduction') LOOP
   cash_net:=public.own_capped_math_v1(cash_net,public.own_run_official_decimal_v1(row_value->'amount'),CASE WHEN row_value->>'nature'='deduction' THEN 'subtract' ELSE 'add' END);
  END LOOP;
  IF (public.own_capped_math_v1(official,official_net,'compare'))::integer>0 OR(public.own_capped_math_v1(cash,cash_net,'compare'))::integer>0 THEN RAISE EXCEPTION 'CAPPED_NET_RECONCILIATION';END IF;
 END LOOP;
 RETURN jsonb_build_object('cappedDeductionsVersion','own-capped-deductions.v1','cappedDeductionEffectCount',jsonb_array_length(effects),'cappedDeductionEffects',effects);
END
$capped$;

ALTER FUNCTION public.own_run_capped_effects_v1(jsonb,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_capped_effects_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_run_capped_input_v1(input_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE c jsonb:=input_value->'cappedDeductionCapture';policies jsonb;selected jsonb;closure jsonb;official jsonb:=input_value->'officialTotalsPolicy';
BEGIN
 IF NOT coalesce(input_value ?| ARRAY['cappedDeductionsVersion','cappedDeductionCapture'],false) THEN RETURN '{}';END IF;
 IF input_value->>'cappedDeductionsVersion' IS DISTINCT FROM 'own-capped-deductions.v1' OR public.own_program_exact_v1(c,ARRAY['version','period','liquidationType','agreementCode','policies','policiesSha256','ruleClosure','ruleClosureSha256','officialPolicySha256']) IS NOT TRUE OR c->>'version' IS DISTINCT FROM 'own-capped-deductions-capture.v1' OR c->'period' IS DISTINCT FROM input_value->'period' OR c->'liquidationType' IS DISTINCT FROM input_value->'liquidationType' OR c->'agreementCode' IS DISTINCT FROM official->'agreementCode' THEN RAISE EXCEPTION 'CAPPED_CAPTURE_INVALID';END IF;
 policies:=public.own_capped_policies_v1(input_value->>'cappedDeductionsVersion',c->'policies');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(policies) p WHERE p->'agreementCode' IS DISTINCT FROM c->'agreementCode' OR p->'liquidationType' IS DISTINCT FROM c->'liquidationType') OR public.own_run_hash_v1(policies) IS DISTINCT FROM c->>'policiesSha256' OR public.own_run_hash_v1(c->'ruleClosure') IS DISTINCT FROM c->>'ruleClosureSha256' OR public.own_run_hash_v1(official) IS DISTINCT FROM c->>'officialPolicySha256' THEN RAISE EXCEPTION 'CAPPED_CAPTURE_CHANGED';END IF;
 selected:=public.own_policy_active_candidate_v1(policies,'capped-deduction',c->>'period',c->>'liquidationType',c->>'agreementCode');IF jsonb_array_length(selected)<>1 THEN RAISE EXCEPTION 'CAPPED_POLICY_REQUIRED';END IF;
 closure:=public.own_capped_context_v1(selected->0,coalesce(input_value->'rules',c->'ruleClosure'),c->>'period',official);
 IF closure IS DISTINCT FROM c->'ruleClosure' OR public.own_run_hash_v1(closure) IS DISTINCT FROM c->>'ruleClosureSha256' THEN RAISE EXCEPTION 'CAPPED_CAPTURE_CHANGED';END IF;
 RETURN jsonb_build_object('cappedDeductionsVersion',input_value->'cappedDeductionsVersion','cappedDeductionCapture',c);
END
$capped$;

ALTER FUNCTION public.own_run_capped_input_v1(jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_capped_input_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_run_capped_inventory_v1(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE programme jsonb:=payload#>'{programState,program,definition}';agreements text[];official jsonb;
BEGIN
 IF NOT coalesce(programme ?| ARRAY['cappedDeductionsVersion','cappedDeductionPolicies'],false) THEN RETURN '{}';END IF;
 SELECT array_agg(DISTINCT e->>'agreementCode') INTO agreements FROM jsonb_array_elements(payload#>'{population,employees}') e WHERE payload#>>'{selection,kind}'='all' OR payload#>'{selection,values}' ? (e->>CASE payload#>>'{selection,kind}' WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END);
 IF cardinality(agreements) IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'CAPPED_CAPTURE_INVALID';END IF;
 official:=public.own_policy_active_candidate_v1(programme->'officialTotalsPolicies','official-totals',payload->>'period',payload->>'liquidationType',agreements[1]);IF jsonb_array_length(official)<>1 THEN RAISE EXCEPTION 'CAPPED_POLICY_REQUIRED';END IF;
 RETURN public.own_run_capped_capture_v1(programme,payload->>'period',payload->>'liquidationType',official->0);
END
$capped$;

ALTER FUNCTION public.own_run_capped_inventory_v1(jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_capped_inventory_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_run_capped_sources_v1(payload jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE programme jsonb:=payload#>'{programState,program,definition}';options jsonb;policies jsonb;
 period_value text:=payload->>'period';type_value text:=payload->>'liquidationType';population jsonb:=payload->'population';monthly jsonb:=payload->'monthly';
 batches jsonb;batch jsonb;row_value jsonb;values_value jsonb;person jsonb;subject jsonb;admission jsonb;admissions jsonb:='[]';entries jsonb;entry jsonb;policy jsonb;binding jsonb;matches jsonb;expected_inputs jsonb:='[]';family text;total_value numeric;reference_value text;
 list_value jsonb:=payload#>'{fixed,list,data}';export_value jsonb:=payload#>'{fixed,export,data}';expected jsonb;previous jsonb;actor jsonb;actors jsonb;rows_hash text;ids text[]:='{}';n integer;selected integer;review_count integer;
BEGIN
 IF NOT coalesce(programme ?| ARRAY['cappedDeductionsVersion','cappedDeductionPolicies'],false) THEN RETURN;END IF;
 options:=public.own_program_capped_options_v1(programme);policies:=options->'cappedDeductionPolicies';
 IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR coalesce(type_value IN('monthly','first_fortnight','sac','vacation','supplementary','final','other'),false) IS NOT TRUE
 OR population->'complete' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(population->'employees') IS DISTINCT FROM 'array' OR jsonb_array_length(population->'employees') NOT BETWEEN 1 AND 10000
 OR public.own_program_exact_v1(monthly,ARRAY['complete','batches','nativeBatches']) IS NOT TRUE OR monthly->'complete' IS DISTINCT FROM 'true'::jsonb
 OR jsonb_typeof(monthly->'batches') IS DISTINCT FROM 'array' OR jsonb_typeof(monthly->'nativeBatches') IS DISTINCT FROM 'array'
 OR jsonb_array_length(monthly->'batches')>10000 OR jsonb_array_length(monthly->'nativeBatches')>1000
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(population->'employees') e GROUP BY e->'contractId' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'CAPPED_CHANNEL_INCOMPLETE';END IF;
 FOR batch IN SELECT value FROM jsonb_array_elements(monthly->'batches') LOOP
  IF batch->>'id'=ANY(ids) OR batch->>'contractVersion' IS DISTINCT FROM 'payroll-novelty-batch.v2' OR batch->>'status' IS DISTINCT FROM 'approved' OR batch->'exportable' IS DISTINCT FROM 'true'::jsonb
  OR batch->>'periodMonth' IS DISTINCT FROM period_value||'-01' OR batch->>'payrollType' IS DISTINCT FROM type_value OR type_value<>'monthly'
  OR batch->>'sourceMode' IS DISTINCT FROM 'individual' OR batch->'rowCount' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(batch->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(batch->'rows')<>1
  OR batch->'grhMutation' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollCalculated' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollPosted' IS DISTINCT FROM 'false'::jsonb
  THEN RAISE EXCEPTION 'CAPPED_CHANNEL_INCOMPLETE';END IF;
  ids:=array_append(ids,batch->>'id');
  FOR row_value IN SELECT value FROM jsonb_array_elements(batch->'rows') LOOP
   SELECT count(*),jsonb_agg(e)->0 INTO n,person FROM jsonb_array_elements(population->'employees') e WHERE e->'contractId'=row_value->'employmentContractId';subject:=row_value->'subject';
   IF n<>1 OR row_value->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR subject->'contractId' IS DISTINCT FROM person->'contractId' OR subject->'legajo' IS DISTINCT FROM person->'employeeNumber' OR subject->'identityToken' IS DISTINCT FROM person->'identityToken'
   OR jsonb_typeof(row_value->'issues') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(row_value->'issues') issue WHERE issue IS DISTINCT FROM '{"code":"concept_not_observed","severity":"warning","blocking":false,"field":"conceptSourceId","details":{"basis":"published_grh_observation"}}'::jsonb)
   THEN RAISE EXCEPTION 'CAPPED_IDENTITY_REQUIRED';END IF;
   -- Validate the imported values through the existing strict native value
   -- grammar. The imported row itself remains untouched and is hashed below.
   values_value:=(row_value-ARRAY['employmentContractId','issues','subject','identityCurrent'])||jsonb_build_object('contractId',person->'contractId','identityToken',subject->'identityToken');
   IF public.payroll_novelty_native_rows_valid_v2(jsonb_build_array(values_value),'individual') IS NOT TRUE OR (row_value->>'adjustmentMonth' IS NOT NULL AND row_value->>'adjustmentMonth'>period_value||'-01') THEN RAISE EXCEPTION 'CAPPED_CHANNEL_INCOMPLETE';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.own_policy_active_candidate_v1(policies,'capped-deduction',period_value,type_value,person->>'agreementCode')) active_policy WHERE active_policy->'incompatibleSourceCodes' ? (row_value->>'conceptSourceId')) THEN RAISE EXCEPTION 'CAPPED_SOURCE_INCOMPATIBLE';END IF;
  END LOOP;
 END LOOP;
 FOR batch IN SELECT value FROM jsonb_array_elements(monthly->'nativeBatches') LOOP
  IF public.own_program_exact_v1(batch,ARRAY['version','id','revision','status','periodMonth','payrollType','rows','rowCount','rowsSha256','preparedBy','decidedBy','approvals','grhMutation','payrollCalculated','payrollPosted']) IS NOT TRUE
  OR batch->>'id'=ANY(ids) OR batch->>'version' IS DISTINCT FROM 'own-payroll-novelty-batch.v1' OR batch->>'status' IS DISTINCT FROM 'approved'
  OR batch->>'periodMonth' IS DISTINCT FROM period_value||'-01' OR batch->>'payrollType' IS DISTINCT FROM type_value
  OR jsonb_typeof(batch->'rows') IS DISTINCT FROM 'array' OR batch->'rowCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(batch->'rows'))
  OR batch->'grhMutation' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollCalculated' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollPosted' IS DISTINCT FROM 'false'::jsonb
  OR jsonb_typeof(batch->'approvals') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'CAPPED_CHANNEL_INCOMPLETE';END IF;
  ids:=array_append(ids,batch->>'id');review_count:=jsonb_array_length(batch->'approvals');
  IF review_count<1 OR review_count>(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(batch->'rows') r WHERE r#>'{values,forced}'='true'::jsonb) THEN 2 ELSE 1 END) OR batch->'decidedBy' IS DISTINCT FROM (batch->'approvals')->(review_count-1) THEN RAISE EXCEPTION 'CAPPED_REVIEW_REQUIRED';END IF;
  actors:=jsonb_build_array(batch->'preparedBy')||(batch->'approvals');
  FOR actor IN SELECT value FROM jsonb_array_elements(actors) LOOP
   IF public.own_program_exact_v1(actor,ARRAY['membershipId','personId']) IS NOT TRUE OR coalesce(actor->>'membershipId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR coalesce(actor->>'personId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'CAPPED_REVIEW_REQUIRED';END IF;
  END LOOP;
  IF (SELECT count(DISTINCT a->>'membershipId') FROM jsonb_array_elements(actors) a)<>review_count+1 OR (SELECT count(DISTINCT a->>'personId') FROM jsonb_array_elements(actors) a)<>review_count+1 THEN RAISE EXCEPTION 'CAPPED_REVIEW_REQUIRED';END IF;
  SELECT public.own_run_hash_v1(jsonb_agg(jsonb_build_object('values',r->'values','subject',r->'subject') ORDER BY ordinal)) INTO rows_hash FROM jsonb_array_elements(batch->'rows') WITH ORDINALITY x(r,ordinal);
  IF batch->>'rowsSha256' IS DISTINCT FROM rows_hash THEN RAISE EXCEPTION 'CAPPED_CHANNEL_INCOMPLETE';END IF;
  PERFORM public.own_novelty_rows_v1((SELECT jsonb_agg(r->'values' ORDER BY ordinal) FROM jsonb_array_elements(batch->'rows') WITH ORDINALITY x(r,ordinal)),(period_value||'-01')::date);
  selected:=0;
  FOR row_value IN SELECT value FROM jsonb_array_elements(batch->'rows') LOOP
   values_value:=row_value->'values';subject:=row_value->'subject';
   IF public.own_program_exact_v1(row_value,ARRAY['values','subject','identityCurrent']) IS NOT TRUE OR values_value->'contractId' IS DISTINCT FROM subject->'contractId' OR values_value->'legajo' IS DISTINCT FROM subject->'legajo' OR values_value->'identityToken' IS DISTINCT FROM subject->'identityToken' THEN RAISE EXCEPTION 'CAPPED_IDENTITY_REQUIRED';END IF;
   SELECT count(*),jsonb_agg(e)->0 INTO n,person FROM jsonb_array_elements(population->'employees') e WHERE e->'contractId'=values_value->'contractId';
   IF n=0 THEN CONTINUE;END IF;selected:=selected+1;
   IF n<>1 OR row_value->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR subject->'contractId' IS DISTINCT FROM person->'contractId' OR subject->'legajo' IS DISTINCT FROM person->'employeeNumber' OR subject->'identityToken' IS DISTINCT FROM person->'identityToken' THEN RAISE EXCEPTION 'CAPPED_IDENTITY_REQUIRED';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.own_policy_active_candidate_v1(policies,'capped-deduction',period_value,type_value,person->>'agreementCode')) active_policy WHERE active_policy->'incompatibleSourceCodes' ? (values_value->>'conceptSourceId')) THEN RAISE EXCEPTION 'CAPPED_SOURCE_INCOMPATIBLE';END IF;
  END LOOP;
  IF selected=0 THEN RAISE EXCEPTION 'CAPPED_CHANNEL_INCOMPLETE';END IF;
 END LOOP;
 IF payload#>'{fixed,list,ok}' IS DISTINCT FROM 'true'::jsonb OR payload#>'{fixed,export,ok}' IS DISTINCT FROM 'true'::jsonb
 OR list_value->>'version' IS DISTINCT FROM 'payroll-fixed-list.v1' OR export_value->>'version' IS DISTINCT FROM 'payroll-fixed-export.v1'
 OR list_value->>'periodMonth' IS DISTINCT FROM period_value||'-01' OR export_value->'periodMonth' IS DISTINCT FROM list_value->'periodMonth'
 OR list_value->'snapshotToken' IS DISTINCT FROM export_value->'snapshotToken' OR coalesce(list_value->>'snapshotToken','')!~'^[a-f0-9]{64}$'
 OR jsonb_typeof(list_value->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(export_value->'rows') IS DISTINCT FROM 'array'
 OR list_value->'total' IS DISTINCT FROM to_jsonb(jsonb_array_length(list_value->'rows')) OR export_value->'total' IS DISTINCT FROM to_jsonb(jsonb_array_length(export_value->'rows'))
 OR jsonb_array_length(list_value->'rows')>500 OR jsonb_array_length(export_value->'rows')>500
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(list_value->'rows') r GROUP BY r->'id' HAVING count(*)<>1)
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(export_value->'rows') r GROUP BY r->'recordId' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'CAPPED_CHANNEL_INCOMPLETE';END IF;
 SELECT coalesce(jsonb_agg(r),'[]') INTO expected FROM jsonb_array_elements(list_value->'rows') r WHERE r#>>'{approved,operation}'='set' AND r#>>'{approved,values,validFrom}'<=to_char((period_value||'-01')::date+interval '1 month'-interval '1 day','YYYY-MM-DD') AND (r#>'{approved,values,validTo}'='null'::jsonb OR r#>>'{approved,values,validTo}'>=period_value||'-01');
 IF jsonb_array_length(expected)<>jsonb_array_length(export_value->'rows') THEN RAISE EXCEPTION 'CAPPED_CHANNEL_INCOMPLETE';END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(export_value->'rows') LOOP
  SELECT count(*),jsonb_agg(r)->0 INTO n,previous FROM jsonb_array_elements(expected) r WHERE r->'id'=row_value->'recordId';
  IF n<>1 OR previous->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR previous->'version' IS DISTINCT FROM row_value->'version' OR previous#>'{approved,id}' IS DISTINCT FROM row_value->'proposalId'
  OR previous->'subject' IS DISTINCT FROM row_value->'subject' OR previous#>'{approved,values}' IS DISTINCT FROM row_value->'values' OR previous#>>'{approved,review,decision}' IS DISTINCT FROM 'approve'
  THEN RAISE EXCEPTION 'CAPPED_CHANNEL_INCOMPLETE';END IF;
  subject:=row_value->'subject';values_value:=row_value->'values';
  SELECT count(*),jsonb_agg(e)->0 INTO n,person FROM jsonb_array_elements(population->'employees') e WHERE e->'contractId'=subject->'contractId';
  IF n<>1 OR subject->'legajo' IS DISTINCT FROM person->'employeeNumber' OR subject->'identityToken' IS DISTINCT FROM person->'identityToken' OR values_value->>'payrollType' IS DISTINCT FROM type_value THEN RAISE EXCEPTION 'CAPPED_IDENTITY_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.own_policy_active_candidate_v1(policies,'capped-deduction',period_value,type_value,person->>'agreementCode')) active_policy WHERE active_policy->'incompatibleSourceCodes' ? (values_value->>'conceptSourceId')) THEN RAISE EXCEPTION 'CAPPED_SOURCE_INCOMPATIBLE';END IF;
 END LOOP;
 RETURN;
END
$capped$;

ALTER FUNCTION public.own_run_capped_sources_v1(jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_capped_sources_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_run_capped_verify_v1(payload jsonb,input_value jsonb,result_value jsonb) RETURNS void
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capped$
DECLARE wanted jsonb;observed jsonb;material jsonb;
BEGIN
 material:=public.own_run_capped_inventory_v1(payload);
 IF material='{}' THEN
  IF payload->'sourceInventory' ? 'cappedDeductions' OR coalesce(input_value ?| ARRAY['cappedDeductionsVersion','cappedDeductionCapture'],false) OR coalesce(result_value ?| ARRAY['cappedDeductionsVersion','cappedDeductionEffectCount','cappedDeductionEffects'],false) THEN RAISE EXCEPTION 'CAPPED_CAPTURE_UNEXPECTED';END IF;
  RETURN;
 END IF;
 PERFORM public.own_run_capped_sources_v1(payload);
 IF payload#>'{sourceInventory,cappedDeductions}' IS DISTINCT FROM material OR public.own_run_hash_v1(payload#>'{sourceInventory,cappedDeductions}') IS DISTINCT FROM public.own_run_hash_v1(material) THEN RAISE EXCEPTION 'CAPPED_CAPTURE_CHANGED';END IF;
 IF input_value IS NULL THEN RETURN;END IF;
 IF public.own_run_capped_input_v1(input_value) IS DISTINCT FROM material THEN RAISE EXCEPTION 'CAPPED_CAPTURE_CHANGED';END IF;
 IF result_value IS NOT NULL THEN
  wanted:=public.own_run_capped_effects_v1(input_value,result_value);observed:=jsonb_build_object('cappedDeductionsVersion',result_value->'cappedDeductionsVersion','cappedDeductionEffectCount',result_value->'cappedDeductionEffectCount','cappedDeductionEffects',result_value->'cappedDeductionEffects');
  IF public.own_run_hash_v1(wanted) IS DISTINCT FROM public.own_run_hash_v1(observed) THEN RAISE EXCEPTION 'CAPPED_EFFECT_MISMATCH';END IF;
 END IF;
END
$capped$;

ALTER FUNCTION public.own_run_capped_verify_v1(jsonb,jsonb,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_capped_verify_v1(jsonb,jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_run_capture_v1(p jsonb, body jsonb, key uuid, algorithm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE official_proof jsonb;official_scoped jsonb;emission_enabled boolean;family_facts jsonb;quantity_enabled boolean;official_enabled boolean;quantity_family jsonb;official_family jsonb;quantity_effective jsonb;quantity_inventory jsonb;official_policy jsonb;official_found jsonb;official_counts jsonb;declared_day_facts jsonb;population_sources jsonb;needs_participation boolean;day_facts jsonb;day_scope jsonb;classification_value jsonb;classifications jsonb:='[]';condition_facts jsonb;working_facts jsonb;agreement_facts jsonb;period_context jsonb;period_facts jsonb;ctx jsonb;prior public.own_payroll_run_capture;c public.own_payroll_run_capture;reg record;s jsonb;program_state jsonb;employees jsonb:='[]';ids uuid[]:='{}';batches jsonb:='[]';native_batches jsonb:='[]';b record;batch_data jsonb;list_value jsonb;export_value jsonb;list_rows jsonb;export_rows jsonb;population jsonb;payload_value jsonb;inventory jsonb;first_date date;last_date date;kind text;v text;fingerprint text;field text;
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
 IF program_state#>>'{program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN LOCK TABLE public.own_salary_conditions_event IN SHARE MODE NOWAIT;END IF;
 IF program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v2' THEN LOCK TABLE public.own_salary_conditions_native_event IN SHARE MODE NOWAIT;END IF;
 IF body->>'programVersion'<>program_state#>>'{program,version}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_CHANGED';END IF;
 IF (program_state#>>'{program,revision}')::integer<1 OR program_state#>>'{program,salaryVersion}' IS DISTINCT FROM program_state#>>'{salaryCatalog,version}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
 -- Versioned quantity/official composition. Families are server attestations,
 -- never caller-provided data. Legacy captures retain their original path.
 quantity_enabled:=(program_state#>'{program,definition}') ? 'quantityPhasesVersion';
 official_enabled:=(program_state#>'{program,definition}') ? 'officialTotalsVersion' OR (program_state#>'{program,definition}') ? 'officialTotalsPolicies';
 IF official_enabled AND NOT quantity_enabled THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_PROGRAM_REQUIRED';END IF;
 emission_enabled:=(program_state#>'{program,definition}') ?| ARRAY['rowEmissionVersion','rowEmissionPolicies'];
 IF emission_enabled THEN
  IF NOT official_enabled THEN RAISE EXCEPTION 'OWN_RUN_ROW_EMISSION_PROGRAM_REQUIRED';END IF;
  PERFORM public.own_program_row_emission_options_candidate_v1(program_state#>'{program,definition}');
 END IF;
 IF (program_state#>'{program,definition}') ? 'familyTariffsVersion' AND NOT official_enabled THEN RAISE EXCEPTION 'OWN_RUN_FAMILY_TARIFF_V4_REQUIRED';END IF;
 IF quantity_enabled THEN
  IF program_state#>>'{program,definition,quantityPhasesVersion}' IS DISTINCT FROM 'own-payroll-quantity-phases.v1' OR program_state#>>'{program,definition,namespaceVersion}' IS DISTINCT FROM 'own-payroll-namespaces.v2' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
  IF to_regprocedure('public.own_run_quantity_family_v1()') IS NULL THEN RAISE EXCEPTION 'OWN_RUN_QUANTITY_FAMILY_REQUIRED';END IF;
  quantity_family:=public.own_run_quantity_family_v1();
  IF public.own_run_official_family_shape_v1(quantity_family,'own-run-quantity-family.v1') IS NOT TRUE THEN RAISE EXCEPTION 'OWN_RUN_QUANTITY_FAMILY_REQUIRED';END IF;
  IF official_enabled THEN
   IF coalesce(program_state#>>'{program,definition,officialTotalsVersion}' IN('own-payroll-official-totals.v1','own-payroll-official-totals.v2'),false) IS NOT TRUE OR to_regprocedure('public.own_run_official_family_v1()') IS NULL THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_FAMILY_REQUIRED';END IF;
   official_family:=public.own_run_official_family_v1();
   IF public.own_run_official_family_shape_v1(official_family,'own-run-official-totals-family.v1') IS NOT TRUE OR EXISTS(SELECT 1 FROM jsonb_array_elements(quantity_family->'members') q WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(official_family->'members') o WHERE o=q)) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_FAMILY_REQUIRED';END IF;
   IF (CASE WHEN emission_enabled OR coalesce((program_state#>'{program,definition}') ?| ARRAY['cappedDeductionsVersion','cappedDeductionPolicies','sourceCoverageVersion','sourceCoveragePolicies','monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies','quantityOnlyInputsVersion','quantityOnlyInputPolicies','conditionalSourcesVersion','conditionalSourcePolicies'],false) THEN public.own_program_definition_composed_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') ELSE public.own_program_definition_official_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') END) IS DISTINCT FROM program_state#>'{program,definition}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
  ELSE
   IF (CASE WHEN coalesce((program_state#>'{program,definition}') ?| ARRAY['cappedDeductionsVersion','cappedDeductionPolicies','sourceCoverageVersion','sourceCoveragePolicies','monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies','quantityOnlyInputsVersion','quantityOnlyInputPolicies','conditionalSourcesVersion','conditionalSourcePolicies'],false) THEN public.own_program_definition_composed_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') ELSE public.own_program_quantity_definition_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') END) IS DISTINCT FROM program_state#>'{program,definition}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
  END IF;
  quantity_effective:=public.own_program_quantity_effective_v1(program_state#>'{program,definition}');
 END IF;
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
 IF program_state#>>'{program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN
  condition_facts:=CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v2' THEN public.own_salary_conditions_native_capture_v2(ctx,employees,body->>'period') ELSE public.own_salary_conditions_capture_v1(ctx,employees,body->>'period') END;
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'salaryConditions',condition_facts)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END)));
  inventory:=inventory||jsonb_build_object('salaryConditions',jsonb_build_object('version',condition_facts->>'version','total',jsonb_array_length(condition_facts->'records'),'complete',true));
 END IF;
 IF program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN
  agreement_facts:=public.own_agreement_working_time_capture_v1(ctx,employees,body->>'period');
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'agreementWorkingTime',agreement_facts)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END)));
  inventory:=inventory||jsonb_build_object('agreementWorkingTime',jsonb_build_object('version',agreement_facts->>'version','total',jsonb_array_length(agreement_facts->'records'),'complete',true));
 END IF;
 IF program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN
  IF jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR length(body->>'period')<>7 OR body->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
  period_context:=jsonb_build_object('version','own-payroll-period-context.v1','period',body->>'period','monthNumber',CASE WHEN substring(body->>'period',6,1)='0' THEN right(body->>'period',1) ELSE right(body->>'period',2) END);
  period_context:=period_context||jsonb_build_object('sha256',public.own_run_hash_v1(period_context));
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'periodContext',period_context)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN jsonb_build_object('agreementWorkingTime',agreement_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END)));
  inventory:=inventory||jsonb_build_object('periodContext',jsonb_build_object('version',period_context->>'sha256','total',1,'complete',true));
 END IF;
 IF program_state#>>'{program,definition,monthlyDaysVersion}'='own-monthly-day-facts.v2' AND body->>'liquidationType'='monthly' THEN
  day_facts:=public.own_monthly_day_capture_v2(p,ctx,employees,body->>'period',body->>'liquidationType',program_state);day_scope:=day_facts->'scope';
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(jsonb_build_object('employees',employees,'monthlyDays',day_facts,'monthlyDaysScope',day_scope)||CASE WHEN program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN jsonb_build_object('employmentFacts',s) ELSE '{}'::jsonb END||CASE WHEN needs_participation THEN jsonb_build_object('periodParticipation',period_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN jsonb_build_object('workingTime',working_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN jsonb_build_object('agreementWorkingTime',agreement_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END||CASE WHEN program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN jsonb_build_object('periodContext',period_context) ELSE '{}'::jsonb END)));
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
   ||CASE WHEN program_state#>>'{program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN jsonb_build_object('salaryConditions',condition_facts) ELSE '{}'::jsonb END
   ||CASE WHEN program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN jsonb_build_object('periodContext',period_context) ELSE '{}'::jsonb END
   ||CASE WHEN day_facts IS NOT NULL THEN jsonb_build_object('monthlyDays',day_facts,'monthlyDaysScope',day_scope) ELSE '{}'::jsonb END
   ||jsonb_build_object('monthlyDayDeclarations',declared_day_facts);
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(population_sources)));
  inventory:=inventory||jsonb_build_object('monthlyDayDeclarations',jsonb_build_object('version',declared_day_facts->>'version','total',jsonb_array_length(declared_day_facts->'records'),'complete',true,'authority','independently_approved_monthly_declaration'));
 END IF;
 IF quantity_enabled THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('agreementCode',a.code,'employees',a.total,'declared',(SELECT count(*) FROM jsonb_array_elements(program_state#>'{program,definition,quantityPhases}') q WHERE q->>'agreementCode'=a.code),'active',(SELECT coalesce(jsonb_agg(public.own_program_quantity_key_v1(q) ORDER BY public.own_program_quantity_key_v1(q) COLLATE "C"),'[]') FROM jsonb_array_elements(quantity_effective) q WHERE q->>'agreementCode'=a.code AND public.own_program_quantity_active_v1(q,body->>'period',body->>'liquidationType'))) ORDER BY a.code COLLATE "C"),'[]') INTO quantity_inventory FROM(SELECT e->>'agreementCode' code,count(*) total FROM jsonb_array_elements(employees) e GROUP BY e->>'agreementCode') a;
  inventory:=inventory||jsonb_build_object('quantityPhases',jsonb_build_object('version','own-run-quantity-capture.v1','quantityPhasesVersion','own-payroll-quantity-phases.v1','period',body->'period','liquidationType',body->'liquidationType','definitionSha256',public.own_run_hash_v1(program_state#>'{program,definition,quantityPhases}'),'family',quantity_family,'agreements',quantity_inventory));
 END IF;
 IF official_enabled THEN
  IF(SELECT count(DISTINCT e->>'agreementCode') FROM jsonb_array_elements(employees) e)<>1 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_MULTIPLE_AGREEMENTS_UNSUPPORTED';END IF;
  IF program_state#>>'{program,definition,officialTotalsVersion}'='own-payroll-official-totals.v2' THEN
   SELECT coalesce(jsonb_agg(item ORDER BY n),'[]') INTO official_scoped FROM jsonb_array_elements(public.own_program_official_policies_candidate_v2(program_state#>'{program,definition,officialTotalsPolicies}','own-payroll-official-totals.v2')) WITH ORDINALITY z(item,n) WHERE item->'agreementCode'=employees#>'{0,agreementCode}' AND item->'liquidationType'=body->'liquidationType';
   official_proof:=public.own_run_official_policy_capture_candidate_v2(official_scoped,body->>'period',body->>'liquidationType',employees#>>'{0,agreementCode}');
   official_found:=public.own_policy_active_candidate_v1(official_scoped,'official-totals',body->>'period',body->>'liquidationType',employees#>>'{0,agreementCode}');
  ELSE
  SELECT coalesce(jsonb_agg(official_candidate.value),'[]') INTO official_found FROM jsonb_array_elements(program_state#>'{program,definition,officialTotalsPolicies}') official_candidate(value) WHERE official_candidate.value->'agreementCode'=employees#>'{0,agreementCode}' AND official_candidate.value->'period'=body->'period' AND official_candidate.value->'liquidationType'=body->'liquidationType';
  END IF;
  IF jsonb_array_length(official_found)<>1 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_POLICY_REQUIRED';END IF;
  official_policy:=official_found->0;
  SELECT jsonb_object_agg(official_contribution.key,jsonb_array_length(official_contribution.value)) INTO official_counts FROM jsonb_each(official_policy->'contributions') official_contribution;
  inventory:=inventory||jsonb_build_object('officialTotals',jsonb_build_object('version',CASE WHEN official_proof IS NULL THEN 'own-run-official-totals-capture.v1' ELSE 'own-run-official-totals-capture.v2' END,'officialTotalsVersion',program_state#>'{program,definition,officialTotalsVersion}','period',body->'period','liquidationType',body->'liquidationType','policySha256',public.own_run_hash_v1(official_policy),'agreementCode',official_policy->'agreementCode','totalCodes',official_policy->'totalCodes','contributionCounts',official_counts,'family',official_family)||CASE WHEN official_proof IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('officialTotalsCapture',official_proof) END);
 END IF;
 IF program_state#>>'{program,definition,optionalScalesVersion}'='own-payroll-optional-scales.v1' THEN
  inventory:=inventory||jsonb_build_object('optionalScales',public.own_run_optional_scale_catalogue_v1((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,program_state->'salaryCatalog'));
 END IF;
 IF program_state#>>'{program,definition,conditionalSourcesVersion}'='own-payroll-conditional-sources.v1' THEN
  inventory:=inventory||jsonb_build_object('conditionalSources',public.own_run_conditional_catalogue_v1((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,program_state->'salaryCatalog'));
 END IF;
 payload_value:=jsonb_build_object('programState',program_state,'population',population,'monthly',CASE WHEN jsonb_array_length(native_batches)=0 AND NOT coalesce((program_state#>'{program,definition}') ?| ARRAY['cappedDeductionsVersion','cappedDeductionPolicies','sourceCoverageVersion','sourceCoveragePolicies','quantityOnlyInputsVersion','quantityOnlyInputPolicies'],false) THEN jsonb_build_object('complete',true,'batches',batches) ELSE jsonb_build_object('complete',true,'batches',batches,'nativeBatches',native_batches) END,'fixed',jsonb_build_object('list',jsonb_build_object('ok',true,'data',list_value),'export',jsonb_build_object('ok',true,'data',export_value)),'period',body->>'period','liquidationType',body->>'liquidationType','selection',body->'selection','sourceInventory',inventory);
 IF program_state#>>'{program,definition,employmentFactsVersion}'='own-salary-seniority.v1' THEN payload_value:=payload_value||jsonb_build_object('employmentFacts',s);END IF;
 IF needs_participation THEN payload_value:=payload_value||jsonb_build_object('periodParticipation',period_facts);END IF;
 IF program_state#>>'{program,definition,workingTimeVersion}'='own-contract-working-time.v1' THEN payload_value:=payload_value||jsonb_build_object('workingTime',working_facts);END IF;
 IF program_state#>>'{program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN payload_value:=payload_value||jsonb_build_object('salaryConditions',condition_facts);END IF;
 IF program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN payload_value:=payload_value||jsonb_build_object('agreementWorkingTime',agreement_facts);END IF;
 IF program_state#>>'{program,definition,periodContextVersion}'='own-payroll-period-context.v1' THEN payload_value:=payload_value||jsonb_build_object('periodContext',period_context);END IF;
 IF day_facts IS NOT NULL THEN payload_value:=payload_value||jsonb_build_object('monthlyDays',day_facts,'monthlyDaysScope',day_scope);END IF;
 IF declared_day_facts IS NOT NULL THEN payload_value:=payload_value||jsonb_build_object('monthlyDayDeclarations',declared_day_facts);END IF;

 -- Family consumption is opt-in. The original SQL226 helper takes its SHARE
 -- NOWAIT lock and captures every selected identity before the run is inserted.
 IF program_state#>>'{program,definition,familyPayrollFactsVersion}'='own-contract-family-payroll-facts.v1' THEN
  family_facts:=public.own_family_payroll_facts_capture_v1(ctx,employees,body->>'period');
  payload_value:=payload_value||jsonb_build_object('familyPayrollFacts',family_facts);
  population_sources:=jsonb_build_object('employees',employees);
  FOREACH field IN ARRAY ARRAY['employmentFacts','periodParticipation','workingTime','agreementWorkingTime','salaryConditions','periodContext','monthlyDays','monthlyDaysScope','monthlyDayDeclarations','familyPayrollFacts'] LOOP
   IF payload_value ? field THEN population_sources:=population_sources||jsonb_build_object(field,payload_value->field);END IF;
  END LOOP;
  population:=jsonb_set(population,'{version}',to_jsonb(public.own_run_hash_v1(population_sources)));
  inventory:=inventory||jsonb_build_object('familyPayrollFacts',jsonb_build_object('version',family_facts->>'version','total',jsonb_array_length(family_facts->'records'),'complete',true,'authority','approved_family_declaration'));
  payload_value:=jsonb_set(jsonb_set(payload_value,'{population}',population),'{sourceInventory}',inventory);
  PERFORM public.own_run_family_expected_inputs_v1(payload_value);
 END IF;
 IF program_state#>>'{program,definition,familyTariffsVersion}' IN('own-payroll-family-tariffs.v2','own-payroll-family-tariffs.v3','own-payroll-family-tariffs.v4') THEN
  inventory:=inventory||jsonb_build_object('familyTariffs',public.own_run_family_tariff_native_capture_candidate_v2(payload_value));
  payload_value:=jsonb_set(payload_value,'{sourceInventory}',inventory);
 END IF;
 IF emission_enabled THEN
  inventory:=inventory||jsonb_build_object('rowEmission',public.own_run_row_emission_inventory_candidate_v1(payload_value,official_family));
  payload_value:=jsonb_set(payload_value,'{sourceInventory}',inventory);
 END IF;
 PERFORM public.own_run_source_coverage_check_v1(payload_value);
 IF program_state#>>'{program,definition,monthlyDeclaredAdjustmentsVersion}'='own-monthly-declared-adjustments.v1' THEN
  payload_value:=jsonb_set(payload_value,'{monthly,nativeBatches}',native_batches);
  payload_value:=jsonb_set(payload_value,'{sourceInventory,declaredAdjustments}',public.own_run_declared_adjustments_capture_v1(payload_value));
 END IF;
 IF program_state#>>'{program,definition,optionalScalesVersion}'='own-payroll-optional-scales.v1' THEN PERFORM public.own_run_optional_scale_expected_inputs_v1(payload_value);END IF;
 PERFORM public.own_run_quantity_only_expected_inputs_v1(payload_value);
 IF program_state#>>'{program,definition,conditionalSourcesVersion}'='own-payroll-conditional-sources.v1' THEN PERFORM public.own_run_conditional_expected_inputs_v1(payload_value);END IF;
 IF program_state#>>'{program,definition,cappedDeductionsVersion}'='own-capped-deductions.v1' THEN payload_value:=jsonb_set(payload_value,'{sourceInventory,cappedDeductions}',public.own_run_capped_inventory_v1(payload_value));END IF;
 PERFORM public.own_run_capped_verify_v1(payload_value,NULL,NULL);
 IF octet_length(payload_value::text)+octet_length(body::text)+8192>4194304 OR (SELECT count(*) FROM public.own_payroll_run_capture WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 PERFORM public.own_run_capacity_v1(octet_length(payload_value::text)+octet_length(body::text));
 PERFORM public.own_close_guard_v1(ctx,body->>'period',body->>'liquidationType',ids);
 INSERT INTO public.own_payroll_run_capture(tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,algorithm_sha256,payload,payload_sha256) VALUES((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,body,fingerprint,algorithm,payload_value,public.own_run_hash_v1(payload_value)) RETURNING * INTO c;
 RETURN public.own_run_receipt_v1(c,false);END $function$;

CREATE OR REPLACE FUNCTION public.own_run_official_capture_check_v1(payload jsonb,body jsonb,input_value jsonb,result_value jsonb,official_family jsonb,quantity_family jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE programme jsonb:=payload#>'{programState,program,definition}';
 qblock jsonb:=payload#>'{sourceInventory,quantityPhases}';oblock jsonb:=payload#>'{sourceInventory,officialTotals}';
 official_proof jsonb;expected jsonb;policy jsonb;found_policies jsonb;conditions boolean;
BEGIN
 PERFORM public.own_run_capped_verify_v1(payload,input_value,result_value);
 PERFORM public.own_run_source_coverage_check_v1(payload);
 PERFORM public.own_run_salary_native_input_verify_v2(payload,input_value);
 PERFORM public.own_run_monthly_forced_capture_check_candidate_v1(payload,input_value,result_value);
 PERFORM public.own_run_declared_adjustments_verify_v1(payload,input_value,result_value);
 PERFORM public.own_run_quantity_only_verify_v1(payload,input_value);PERFORM public.own_run_conditional_input_verify_v1(payload,input_value);
 IF programme ?| ARRAY['rowEmissionVersion','rowEmissionPolicies']
 OR input_value->>'version'='own-payroll-input.v5' OR result_value->>'version'='own-payroll-result.v5'
 OR input_value ?| ARRAY['rowEmissionVersion','rowEmissionPolicies']
 OR result_value ?| ARRAY['rowEmissionVersion','rowEmissionPolicies','receiptRowKeys','receiptRowCount','rowEmissions','emissionDecisionCount']
 OR (payload->'sourceInventory') ? 'rowEmission' THEN
  IF coalesce(programme->>'rowEmissionVersion' IN('own-payroll-row-emission.v1','own-payroll-row-emission.v2'),false) IS NOT TRUE
   OR input_value->>'version' IS DISTINCT FROM 'own-payroll-input.v5'
   OR result_value->>'version' IS DISTINCT FROM 'own-payroll-result.v5'
  THEN RAISE EXCEPTION 'OWN_RUN_ROW_EMISSION_VERSION_INVALID';END IF;
  IF payload#>'{sourceInventory,rowEmission}' IS DISTINCT FROM public.own_run_row_emission_inventory_candidate_v1(payload,official_family)
  THEN RAISE EXCEPTION 'OWN_RUN_ROW_EMISSION_INVENTORY_CHANGED';END IF;
  -- Exact R14 verifier: validates the full economic result, tariffs and selector.
  PERFORM public.own_run_row_emission_capture_check_v1(payload,input_value,result_value);
  -- Only the already verified extension is removed for the unchanged R13
  -- contextual checks below. The finalizers keep and hash full V5 objects.
  input_value:=(input_value-ARRAY['rowEmissionVersion','rowEmissionPolicies'])||'{"version":"own-payroll-input.v4"}'::jsonb;
  result_value:=(result_value-ARRAY['rowEmissionVersion','rowEmissionPolicies','receiptRowKeys','receiptRowCount','rowEmissions','emissionDecisionCount'])||'{"version":"own-payroll-result.v4"}'::jsonb;
 END IF;
 -- Reuse the one closed result verifier. No alternate totals implementation.
 IF programme ? 'familyTariffsVersion' OR input_value ? 'familyTariffsVersion' OR input_value ? 'familyTariffCapture' OR result_value ? 'familyTariffsVersion' OR result_value ? 'familyTariffDecisions' OR result_value ? 'familyTariffDecisionCount' THEN
  IF payload#>'{sourceInventory,familyTariffs}' IS DISTINCT FROM public.own_run_family_tariff_native_capture_candidate_v2(payload) THEN RAISE EXCEPTION 'OWN_RUN_FAMILY_TARIFF_INVENTORY_CHANGED';END IF;
  PERFORM public.own_run_family_tariff_result_verify_candidate_v2(payload,input_value,result_value);
  -- Remove only the extension already validated in full above before calling
  -- the unchanged V4 checker. Finalizers retain and hash the complete values.
  input_value:=input_value-ARRAY['familyTariffsVersion','familyTariffCapture'];
  result_value:=result_value-ARRAY['familyTariffsVersion','familyTariffDecisionCount','familyTariffDecisions'];
 END IF;
 PERFORM public.own_run_family_input_verify_v1(payload,input_value);
 PERFORM public.own_run_optional_scale_input_verify_v1(payload,input_value);
 PERFORM public.own_run_official_result_check_v1(input_value,result_value);
 conditions:=programme->>'salaryConditionsVersion' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2');
 IF (CASE WHEN conditions THEN input_value->>'salaryConditionsVersion' IS DISTINCT FROM programme->>'salaryConditionsVersion' ELSE input_value ? 'salaryConditionsVersion' END)
  OR programme->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2'
  OR programme->>'quantityPhasesVersion' IS DISTINCT FROM 'own-payroll-quantity-phases.v1'
  OR coalesce(programme->>'officialTotalsVersion' IN('own-payroll-official-totals.v1','own-payroll-official-totals.v2'),false) IS NOT TRUE
  OR input_value->'period' IS DISTINCT FROM body->'period' OR input_value->'liquidationType' IS DISTINCT FROM body->'liquidationType' OR input_value->'selection' IS DISTINCT FROM body->'selection'
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_SCOPE_INVALID';END IF;
 -- R7 V4 does not yet implement fixed forced amounts. Preserve the current
 -- finalizer's real forced-amount guard as well; do not silently strip flags.
 IF programme ? 'fixedForcedAmountsVersion' OR programme ? 'fixedForcedAmountsPolicy' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_FIXED_FORCED_COMPOSITION_REQUIRED';END IF;
 IF input_value->'rules' IS DISTINCT FROM public.own_participation_rules_v1(programme)
  OR input_value->'totalsPrecision' IS DISTINCT FROM programme->'totalsPrecision'
  OR input_value#>>'{sourceVersions,population}' IS DISTINCT FROM payload#>>'{population,version}'
  OR input_value#>>'{sourceVersions,rules}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('program',payload#>'{programState,program}','salary',payload#>'{programState,salaryCatalog}'))
  OR input_value#>>'{sourceVersions,novelties}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('monthly',payload->'monthly','fixed',payload#>'{fixed,export,data}'))
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_SOURCE_INVALID';END IF;
 IF jsonb_typeof(payload#>'{population,employees}') IS DISTINCT FROM 'array' OR payload#>'{population,complete}' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_POPULATION_INVALID';END IF;
 IF (SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId' COLLATE "C") FROM jsonb_array_elements(input_value->'employees') e)
  IS DISTINCT FROM (SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId' COLLATE "C") FROM jsonb_array_elements(payload#>'{population,employees}') e)
  OR result_value->'employeeCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(input_value->'employees'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(input_value->'employees') e JOIN jsonb_array_elements(payload#>'{population,employees}') c ON c->'contractId'=e->'contractId' WHERE e->'employeeNumber' IS DISTINCT FROM c->'employeeNumber' OR e->'agreementCode' IS DISTINCT FROM c->'agreementCode' OR e->'departmentCode' IS DISTINCT FROM c->'departmentCode')
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_POPULATION_INVALID';END IF;
 IF public.own_run_official_family_shape_v1(official_family,'own-run-official-totals-family.v1') IS NOT TRUE
  OR public.own_run_official_family_shape_v1(quantity_family,'own-run-quantity-family.v1') IS NOT TRUE
  OR official_family IS DISTINCT FROM oblock->'family' OR quantity_family IS DISTINCT FROM qblock->'family'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(quantity_family->'members') q WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(official_family->'members') o WHERE o=q))
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_FAMILY_REQUIRED';END IF;
 IF jsonb_typeof(programme->'quantityPhases') IS DISTINCT FROM 'array' OR jsonb_typeof(programme->'officialTotalsPolicies') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_PROGRAMME_INVALID';END IF;
 SELECT coalesce(jsonb_agg(x ORDER BY public.own_program_quantity_key_v1(x) COLLATE "C"),'[]') INTO expected FROM jsonb_array_elements(public.own_program_quantity_effective_v1(programme)) x;
 IF input_value->'quantityPhases' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_PHASES_INVALID';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('agreementCode',a.code,'employees',a.total,'declared',(SELECT count(*) FROM jsonb_array_elements(programme->'quantityPhases') q WHERE q->>'agreementCode'=a.code),'active',(SELECT coalesce(jsonb_agg(public.own_program_quantity_key_v1(q) ORDER BY public.own_program_quantity_key_v1(q) COLLATE "C"),'[]') FROM jsonb_array_elements(input_value->'quantityPhases') q WHERE q->>'agreementCode'=a.code AND public.own_program_quantity_active_v1(q,input_value->>'period',input_value->>'liquidationType'))) ORDER BY a.code COLLATE "C"),'[]') INTO expected FROM(SELECT e->>'agreementCode' AS code,count(*) AS total FROM jsonb_array_elements(input_value->'employees') e GROUP BY e->>'agreementCode') a;
 expected:=jsonb_build_object('version','own-run-quantity-capture.v1','quantityPhasesVersion','own-payroll-quantity-phases.v1','period',body->'period','liquidationType',body->'liquidationType','definitionSha256',public.own_run_hash_v1(programme->'quantityPhases'),'family',quantity_family,'agreements',expected);
 IF qblock IS DISTINCT FROM expected THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_QUANTITY_INVENTORY_INVALID';END IF;
 IF programme->>'officialTotalsVersion'='own-payroll-official-totals.v2' THEN
  SELECT coalesce(jsonb_agg(p ORDER BY n),'[]') INTO found_policies FROM jsonb_array_elements(public.own_program_official_policies_candidate_v2(programme->'officialTotalsPolicies','own-payroll-official-totals.v2')) WITH ORDINALITY z(p,n) WHERE p->'agreementCode'=input_value#>'{officialTotalsPolicy,agreementCode}' AND p->'liquidationType'=body->'liquidationType';
  official_proof:=public.own_run_official_policy_capture_candidate_v2(found_policies,body->>'period',body->>'liquidationType',input_value#>>'{officialTotalsPolicy,agreementCode}');
  IF input_value->'officialTotalsCapture' IS DISTINCT FROM official_proof THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_CHANGED';END IF;
  found_policies:=public.own_policy_active_candidate_v1(found_policies,'official-totals',body->>'period',body->>'liquidationType',input_value#>>'{officialTotalsPolicy,agreementCode}');
 ELSE
  IF input_value ? 'officialTotalsCapture' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_CHANGED';END IF;
 SELECT coalesce(jsonb_agg(p),'[]') INTO found_policies FROM jsonb_array_elements(programme->'officialTotalsPolicies') p WHERE p->'agreementCode'=input_value#>'{officialTotalsPolicy,agreementCode}' AND p->'period'=body->'period' AND p->'liquidationType'=body->'liquidationType';
 END IF;
 IF jsonb_array_length(found_policies)<>1 OR found_policies->0 IS DISTINCT FROM input_value->'officialTotalsPolicy' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_POLICY_INVALID';END IF;
 policy:=found_policies->0;
 SELECT jsonb_object_agg(k,jsonb_array_length(v)) INTO expected FROM jsonb_each(policy->'contributions') c(k,v);
 expected:=jsonb_build_object('version',CASE WHEN official_proof IS NULL THEN 'own-run-official-totals-capture.v1' ELSE 'own-run-official-totals-capture.v2' END,'officialTotalsVersion',programme->'officialTotalsVersion','period',body->'period','liquidationType',body->'liquidationType','policySha256',public.own_run_hash_v1(policy),'agreementCode',policy->'agreementCode','totalCodes',policy->'totalCodes','contributionCounts',expected,'family',official_family)||CASE WHEN official_proof IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('officialTotalsCapture',official_proof) END;
 IF oblock IS DISTINCT FROM expected THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CAPTURE_TOTALS_INVENTORY_INVALID';END IF;
END $function$;

CREATE OR REPLACE FUNCTION public.own_run_official_result_check_v1(input_value jsonb,result_value jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE
 policy jsonb:=input_value->'officialTotalsPolicy';
 period_value text:=input_value->>'period';kind_value text:=input_value->>'liquidationType';
 selected jsonb;employee jsonb;rule_value jsonb;phase jsonb;row_value jsonb;v jsonb;item jsonb;
 expected jsonb;actual jsonb;expected_keys jsonb;actual_keys jsonb;conditioned boolean;familial boolean;
 targets text[]:=ARRAY['990','993','994','995','996'];
 destination text;concept_code text;nature_value text;field_value text;contract_id text;
 mapped text[]:='{}';row_map jsonb;exact_totals jsonb;printed_totals jsonb;category_differences jsonb;
 exact_sum jsonb;printed_sum jsonb;gross_exact jsonb;net_exact jsonb;nonrem_exact jsonb;
 zero_value jsonb:='{"numerator":"0","denominator":"1"}';
 line_total jsonb;official_total jsonb;expected_line jsonb;expected_official jsonb;reconciliation jsonb;expected_reconciliation jsonb;
 adjustment text;equation_rounding text;net_difference text;rounding_difference text;
 equation jsonb;joined bigint;bad bigint;people_count integer;
BEGIN
 -- The R7 input normalizer admits exactly these fields, plus typed conditions.
 PERFORM public.own_run_official_policy_evidence_candidate_v2(input_value);
 conditioned:=input_value ? 'salaryConditionsVersion';familial:=input_value ? 'familyPayrollFactsVersion';
 IF public.own_program_exact_v1(input_value,ARRAY['version','period','liquidationType','selection','sourceVersions','populationComplete','totalsPrecision','employees','rules','namespaceVersion','quantityPhasesVersion','quantityPhases','officialTotalsPolicy']||CASE WHEN input_value ?| ARRAY['cappedDeductionsVersion','cappedDeductionCapture'] THEN ARRAY['cappedDeductionsVersion','cappedDeductionCapture'] ELSE ARRAY[]::text[] END||CASE WHEN input_value ? 'officialTotalsCapture' THEN ARRAY['officialTotalsCapture'] ELSE ARRAY[]::text[] END||CASE WHEN conditioned THEN ARRAY['salaryConditionsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN familial THEN ARRAY['familyPayrollFactsVersion'] ELSE ARRAY[]::text[] END) IS NOT TRUE
  OR public.own_program_exact_v1(result_value,ARRAY['version','period','liquidationType','selection','sourceVersions','employeeCount','rowCount','rows','employeeTotals','payrollCalculated','payrollPosted','municipalApprovalVerified','paymentExecuted','quantityCount','quantities','officialTotalsVersion','officialTotalsPolicy','lineEmployeeTotals','totalReconciliations']||CASE WHEN input_value ?| ARRAY['cappedDeductionsVersion','cappedDeductionCapture'] THEN ARRAY['cappedDeductionsVersion','cappedDeductionEffectCount','cappedDeductionEffects'] ELSE ARRAY[]::text[] END||CASE WHEN input_value ? 'officialTotalsCapture' THEN ARRAY['officialTotalsCapture'] ELSE ARRAY[]::text[] END) IS NOT TRUE
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_SHAPE_INVALID';END IF;
 -- All JSON numbers in this contract are nonnegative integer counts or
 -- precision metadata. Reject retained scales such as 2.0: PostgreSQL JSONB
 -- equality treats them as 2, but its canonical hash text differs from JS.
 IF EXISTS(SELECT 1 FROM jsonb_path_query(input_value,'lax $.**') x WHERE jsonb_typeof(x)='number' AND x::text !~ '^(0|[1-9][0-9]*)$')
  OR EXISTS(SELECT 1 FROM jsonb_path_query(result_value,'lax $.**') x WHERE jsonb_typeof(x)='number' AND x::text !~ '^(0|[1-9][0-9]*)$')
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_NUMERIC_ENCODING_INVALID';END IF;
 IF input_value->>'version' IS DISTINCT FROM 'own-payroll-input.v4' OR result_value->>'version' IS DISTINCT FROM 'own-payroll-result.v4'
  OR input_value->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2' OR input_value->>'quantityPhasesVersion' IS DISTINCT FROM 'own-payroll-quantity-phases.v1'
  OR result_value->>'officialTotalsVersion' IS DISTINCT FROM (CASE WHEN input_value ? 'officialTotalsCapture' THEN 'own-payroll-official-totals.v2' ELSE 'own-payroll-official-totals.v1' END) OR result_value->'officialTotalsCapture' IS DISTINCT FROM input_value->'officialTotalsCapture' OR conditioned AND coalesce(input_value->>'salaryConditionsVersion' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2'),false) IS NOT TRUE OR familial AND input_value->>'familyPayrollFactsVersion' IS DISTINCT FROM 'own-contract-family-payroll-facts.v1'
  OR jsonb_typeof(input_value->'period') IS DISTINCT FROM 'string' OR period_value !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR kind_value IS DISTINCT FROM 'monthly'
  OR input_value->'populationComplete' IS DISTINCT FROM 'true'::jsonb OR input_value->'totalsPrecision' IS DISTINCT FROM '2'::jsonb
  OR result_value->'period' IS DISTINCT FROM input_value->'period' OR result_value->'liquidationType' IS DISTINCT FROM input_value->'liquidationType'
  OR result_value->'selection' IS DISTINCT FROM input_value->'selection' OR result_value->'sourceVersions' IS DISTINCT FROM input_value->'sourceVersions'
  OR result_value->'officialTotalsPolicy' IS DISTINCT FROM policy OR result_value->'payrollCalculated' IS DISTINCT FROM 'true'::jsonb
  OR result_value->'payrollPosted' IS DISTINCT FROM 'false'::jsonb OR result_value->'municipalApprovalVerified' IS DISTINCT FROM 'false'::jsonb OR result_value->'paymentExecuted' IS DISTINCT FROM 'false'::jsonb
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_VERSION_SCOPE_INVALID';END IF;
 IF public.own_program_exact_v1(input_value->'sourceVersions',ARRAY['population','rules','novelties']) IS NOT TRUE
  OR EXISTS(SELECT 1 FROM jsonb_each(input_value->'sourceVersions') x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'string' OR x.value#>>'{}' !~ '^[a-f0-9]{64}$')
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_SOURCE_VERSION_INVALID';END IF;
 IF public.own_program_exact_v1(input_value->'selection',ARRAY['kind','values']) IS NOT TRUE OR jsonb_typeof(input_value#>'{selection,values}') IS DISTINCT FROM 'array'
  OR coalesce(input_value#>>'{selection,kind}' IN('all','contracts','agreements','departments'),false) IS NOT TRUE
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_SELECTION_INVALID';END IF;
 IF jsonb_array_length(input_value#>'{selection,values}')>10000
  OR (input_value#>>'{selection,kind}'='all') IS DISTINCT FROM (jsonb_array_length(input_value#>'{selection,values}')=0)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(input_value#>'{selection,values}') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string'
    OR x#>>'{}' !~ CASE WHEN input_value#>>'{selection,kind}'='contracts' THEN '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' ELSE '^[0-9]{1,9}$' END)
  OR input_value#>'{selection,values}' IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x#>>'{}' COLLATE "C"),'[]') FROM(SELECT DISTINCT value x FROM jsonb_array_elements(input_value#>'{selection,values}')) a)
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_SELECTION_INVALID';END IF;
 IF jsonb_typeof(input_value->'employees') IS DISTINCT FROM 'array' OR jsonb_typeof(input_value->'rules') IS DISTINCT FROM 'array' OR jsonb_typeof(input_value->'quantityPhases') IS DISTINCT FROM 'array'
  OR jsonb_typeof(result_value->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'quantities') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'employeeTotals') IS DISTINCT FROM 'array'
  OR jsonb_typeof(result_value->'lineEmployeeTotals') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'totalReconciliations') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_COLLECTION_INVALID';END IF;
 IF jsonb_array_length(input_value->'employees') NOT BETWEEN 1 AND 10000 OR jsonb_array_length(input_value->'rules') NOT BETWEEN 1 AND 1000 OR jsonb_array_length(input_value->'quantityPhases') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_COLLECTION_LIMIT';END IF;

 -- Whole input population and per-contract values remain typed. Null is not zero.
 FOR employee IN SELECT value FROM jsonb_array_elements(input_value->'employees') LOOP
  IF public.own_program_exact_v1(employee,ARRAY['contractId','employeeNumber','agreementCode','departmentCode','inputs']) IS NOT TRUE
   OR jsonb_typeof(employee->'contractId') IS DISTINCT FROM 'string' OR employee->>'contractId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   OR jsonb_typeof(employee->'employeeNumber') IS DISTINCT FROM 'string' OR length(employee->>'employeeNumber') NOT BETWEEN 1 AND 64 OR employee->>'employeeNumber' ~ '[[:cntrl:]]'
   OR jsonb_typeof(employee->'agreementCode') IS DISTINCT FROM 'string' OR employee->>'agreementCode' !~ '^[0-9]{1,9}$' OR jsonb_typeof(employee->'departmentCode') IS DISTINCT FROM 'string' OR employee->>'departmentCode' !~ '^[0-9]{1,9}$'
   OR jsonb_typeof(employee->'inputs') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_EMPLOYEE_INVALID';END IF;
  IF jsonb_array_length(employee->'inputs')>512 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_EMPLOYEE_INPUT_LIMIT';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(employee->'inputs') LOOP
   IF public.own_program_exact_v1(item,ARRAY['key','unit','value','sourceReference']) IS NOT TRUE OR jsonb_typeof(item->'key') IS DISTINCT FROM 'string' OR item->>'key' !~ '^[A-Za-z][A-Za-z0-9_]{0,63}$'
    OR public.own_program_quantity_reference_v1(item->'sourceReference') IS NOT TRUE
    OR coalesce(item->>'unit' IN('money','hours','minutes','days','percent','units','coefficient') OR (conditioned OR familial) AND item->>'unit' IN('code','boolean'),false) IS NOT TRUE
   THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_EMPLOYEE_INPUT_INVALID';END IF;
   IF item->'value'<>'null'::jsonb THEN
    IF item->>'unit'='boolean' THEN IF jsonb_typeof(item->'value') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_EMPLOYEE_INPUT_INVALID';END IF;
    ELSIF item->>'unit'='code' THEN IF jsonb_typeof(item->'value') IS DISTINCT FROM 'string' OR item->>'value' !~ '^[A-Za-z0-9_]{1,32}$' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_EMPLOYEE_INPUT_INVALID';END IF;
    ELSE PERFORM public.own_run_official_decimal_v1(item->'value');END IF;
   END IF;
  END LOOP;
  IF (SELECT coalesce(jsonb_agg(x->>'key' ORDER BY n),'[]') FROM jsonb_array_elements(employee->'inputs') WITH ORDINALITY a(x,n)) IS DISTINCT FROM (SELECT coalesce(jsonb_agg(k ORDER BY k COLLATE "C"),'[]') FROM(SELECT DISTINCT x->>'key' k FROM jsonb_array_elements(employee->'inputs') x) a) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_EMPLOYEE_INPUT_DUPLICATE';END IF;
 END LOOP;
 IF (SELECT jsonb_agg(x->>'contractId' ORDER BY n) FROM jsonb_array_elements(input_value->'employees') WITH ORDINALITY a(x,n)) IS DISTINCT FROM (SELECT jsonb_agg(k ORDER BY k COLLATE "C") FROM(SELECT DISTINCT x->>'contractId' k FROM jsonb_array_elements(input_value->'employees') x) a) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_EMPLOYEE_DUPLICATE';END IF;
 SELECT coalesce(jsonb_agg(e ORDER BY e->>'contractId' COLLATE "C"),'[]') INTO selected FROM jsonb_array_elements(input_value->'employees') e
 WHERE input_value#>>'{selection,kind}'='all' OR input_value#>'{selection,values}' ? (e->>CASE input_value#>>'{selection,kind}' WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' WHEN 'departments' THEN 'departmentCode' END);
 people_count:=jsonb_array_length(selected);
 IF people_count=0 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(input_value#>'{selection,values}') wanted WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(selected) e WHERE e->>CASE input_value#>>'{selection,kind}' WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' WHEN 'departments' THEN 'departmentCode' END=wanted)) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_SELECTION_INCOMPLETE';END IF;

 -- Closed policy, unique destination aliases, unique payable contribution set.
 IF public.own_program_exact_v1(policy,ARRAY['version','agreementCode','liquidationType','totalCodes','contributions','rounding','nonPositiveNet','sourceReference','sourceSha256']||CASE WHEN policy->>'version'='own-payroll-official-totals.v2' THEN ARRAY['policyId','supersedes','validFrom','validUntil'] ELSE ARRAY['period'] END) IS NOT TRUE
  OR coalesce(policy->>'version' IN('own-payroll-official-totals.v1','own-payroll-official-totals.v2'),false) IS NOT TRUE OR (policy->>'version'='own-payroll-official-totals.v1' AND policy->'period' IS DISTINCT FROM input_value->'period') OR policy->'liquidationType' IS DISTINCT FROM input_value->'liquidationType'
  OR jsonb_typeof(policy->'agreementCode') IS DISTINCT FROM 'string' OR policy->>'agreementCode' !~ '^[0-9]{1,9}$' OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected) e WHERE e->'agreementCode' IS DISTINCT FROM policy->'agreementCode')
  OR policy->'rounding' IS DISTINCT FROM '{"precision":2,"mode":"half_up"}'::jsonb OR policy->>'nonPositiveNet' IS DISTINCT FROM 'reject'
  OR public.own_program_quantity_reference_v1(CASE WHEN input_value ? 'officialTotalsCapture' AND policy->>'version'='own-payroll-official-totals.v1' THEN to_jsonb(normalize(policy->>'sourceReference',NFC)) ELSE policy->'sourceReference' END) IS NOT TRUE
  OR jsonb_typeof(policy->'sourceSha256') IS DISTINCT FROM 'string' OR policy->>'sourceSha256' !~ '^[a-f0-9]{64}$'
  OR public.own_program_exact_v1(policy->'totalCodes',ARRAY['990','993','994','995','996','888','998','999']) IS NOT TRUE
  OR public.own_program_exact_v1(policy->'contributions',targets) IS NOT TRUE
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_POLICY_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(policy->'totalCodes') e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string' OR e.value#>>'{}' !~ '^[0-9]{1,9}$') OR (SELECT count(DISTINCT value) FROM jsonb_each(policy->'totalCodes'))<>8 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_TOTAL_ALIAS_INVALID';END IF;
 FOREACH destination IN ARRAY targets LOOP
  v:=policy#>ARRAY['contributions',destination];IF jsonb_typeof(v) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CONTRIBUTION_INVALID';END IF;
  IF jsonb_array_length(v)>1000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' !~ '^[0-9]{1,9}$') THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CONTRIBUTION_INVALID';END IF;
  IF v IS DISTINCT FROM (SELECT coalesce(jsonb_agg(x ORDER BY x COLLATE "C"),'[]') FROM jsonb_array_elements_text(v) x) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CONTRIBUTION_ORDER';END IF;
  FOR concept_code IN SELECT value FROM jsonb_array_elements_text(v) LOOP
   IF concept_code=ANY(mapped) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CONTRIBUTION_DUPLICATE';END IF;mapped:=array_append(mapped,concept_code);
  END LOOP;
 END LOOP;

 -- Rule and phase metadata: formulas are copied from the captured programme,
 -- not reinterpreted by this result verifier.
 FOR rule_value IN SELECT value FROM jsonb_array_elements(input_value->'rules') LOOP
  IF public.own_program_exact_v1(rule_value,ARRAY['agreementCode','code','nature','unit','rounding','validFrom','validUntil','liquidationTypes','expression','ruleReference']) IS NOT TRUE
   OR jsonb_typeof(rule_value->'agreementCode') IS DISTINCT FROM 'string' OR rule_value->>'agreementCode' !~ '^[0-9]{1,9}$' OR jsonb_typeof(rule_value->'code') IS DISTINCT FROM 'string' OR rule_value->>'code' !~ '^[0-9]{1,9}$'
   OR coalesce(rule_value->>'nature' IN('remuneration','non_remuneration','deduction','employer_contribution','auxiliary'),false) IS NOT TRUE
   OR coalesce(rule_value->>'unit' IN('money','hours','minutes','days','percent','units','coefficient'),false) IS NOT TRUE OR rule_value->>'nature'<>'auxiliary' AND rule_value->>'unit'<>'money'
   OR jsonb_typeof(rule_value->'expression') IS DISTINCT FROM 'object' OR jsonb_typeof(rule_value#>'{expression,op}') IS DISTINCT FROM 'string' OR public.own_program_quantity_reference_v1(rule_value->'ruleReference') IS NOT TRUE
   OR public.own_run_quantity_quantize_v1(zero_value,rule_value->'rounding') IS NULL
  THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_RULE_INVALID';END IF;
 END LOOP;
 FOR phase IN SELECT value FROM jsonb_array_elements(input_value->'quantityPhases') LOOP
  IF public.own_program_exact_v1(phase,ARRAY['agreementCode','code','unit','stage','rounding','expression','validFrom','validUntil','liquidationTypes','sourceReference','sourceSha256','amountUse']) IS NOT TRUE
   OR jsonb_typeof(phase->'agreementCode') IS DISTINCT FROM 'string' OR phase->>'agreementCode' !~ '^[0-9]{1,9}$' OR jsonb_typeof(phase->'code') IS DISTINCT FROM 'string' OR phase->>'code' !~ '^[0-9]{1,9}$'
   OR coalesce(phase->>'unit' IN('money','hours','minutes','days','percent','units','coefficient'),false) IS NOT TRUE OR coalesce(phase->>'stage' IN('exact','rounded'),false) IS NOT TRUE
   OR phase->>'stage'='exact' AND phase->'rounding' IS DISTINCT FROM 'null'::jsonb OR phase->>'stage'='rounded' AND public.own_run_quantity_quantize_v1(zero_value,phase->'rounding') IS NULL
   OR jsonb_typeof(phase->'expression') IS DISTINCT FROM 'object' OR jsonb_typeof(phase#>'{expression,op}') IS DISTINCT FROM 'string'
   OR public.own_program_quantity_reference_v1(phase->'sourceReference') IS NOT TRUE
   OR jsonb_typeof(phase->'sourceSha256') IS DISTINCT FROM 'string' OR phase->>'sourceSha256' !~ '^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_PHASE_INVALID';END IF;
  IF public.own_run_official_amount_use_v1(phase->'amountUse') IS NOT TRUE THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_PHASE_INVALID';END IF;
 END LOOP;
 FOR v IN SELECT value FROM jsonb_array_elements((input_value->'rules')||(input_value->'quantityPhases')) LOOP
  IF jsonb_typeof(v->'validFrom') IS DISTINCT FROM 'string' OR v->>'validFrom' !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
   OR v->'validUntil'<>'null'::jsonb AND (jsonb_typeof(v->'validUntil') IS DISTINCT FROM 'string' OR v->>'validUntil' !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR v->>'validUntil'<v->>'validFrom')
   OR jsonb_typeof(v->'liquidationTypes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_RULE_SCOPE_INVALID';END IF;
  IF jsonb_array_length(v->'liquidationTypes') NOT BETWEEN 1 AND 7 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'liquidationTypes') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other'))
   OR v->'liquidationTypes' IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x COLLATE "C") FROM(SELECT DISTINCT value x FROM jsonb_array_elements_text(v->'liquidationTypes')) a)
  THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_RULE_SCOPE_INVALID';END IF;
 END LOOP;

 -- Exact tuple coverage prevents both silent omissions and cross-namespace duplication.
 SELECT coalesce(jsonb_agg(jsonb_build_array(e->>'contractId',r->>'code',r->>'nature') ORDER BY e->>'contractId' COLLATE "C",r->>'code' COLLATE "C",r->>'nature' COLLATE "C"),'[]') INTO expected_keys
 FROM jsonb_array_elements(selected) e JOIN jsonb_array_elements(input_value->'rules') r ON r->'agreementCode'=e->'agreementCode' AND public.own_program_quantity_active_v1(r,period_value,kind_value);
 SELECT coalesce(jsonb_agg(jsonb_build_array(x->>'contractId',x->>'conceptCode',x->>'nature') ORDER BY n),'[]') INTO actual_keys FROM jsonb_array_elements(result_value->'rows') WITH ORDINALITY a(x,n);
 IF actual_keys IS DISTINCT FROM expected_keys OR result_value->'rowCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(result_value->'rows'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'rows') r GROUP BY r->>'contractId',CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary' ELSE 'concept' END,r->>'conceptCode' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_ROW_COVERAGE_INVALID';END IF;
 SELECT count(*),count(*) FILTER(WHERE public.own_run_official_money_row_v1(r,e,p) IS NOT TRUE) INTO joined,bad
 FROM jsonb_array_elements(result_value->'rows') r JOIN jsonb_array_elements(selected) e ON e->'contractId'=r->'contractId'
 JOIN jsonb_array_elements(input_value->'rules') p ON p->'agreementCode'=r->'agreementCode' AND p->'code'=r->'conceptCode' AND p->'nature'=r->'nature' AND public.own_program_quantity_active_v1(p,period_value,kind_value);
 IF joined<>jsonb_array_length(result_value->'rows') OR bad<>0 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_ROW_INVALID';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array(e->>'contractId',q->>'code') ORDER BY e->>'contractId' COLLATE "C",q->>'code' COLLATE "C"),'[]') INTO expected_keys
 FROM jsonb_array_elements(selected) e JOIN jsonb_array_elements(input_value->'quantityPhases') q ON q->'agreementCode'=e->'agreementCode' AND public.own_program_quantity_active_v1(q,period_value,kind_value);
 SELECT coalesce(jsonb_agg(jsonb_build_array(x->>'contractId',x->>'conceptCode') ORDER BY n),'[]') INTO actual_keys FROM jsonb_array_elements(result_value->'quantities') WITH ORDINALITY a(x,n);
 IF actual_keys IS DISTINCT FROM expected_keys OR result_value->'quantityCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(result_value->'quantities'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'quantities') q GROUP BY q->>'contractId',q->>'conceptCode' HAVING count(*)<>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'quantities') q WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'rows') r WHERE r->'contractId'=q->'contractId' AND r->'conceptCode'=q->'conceptCode' AND r->>'nature'<>'auxiliary'))
 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_QUANTITY_COVERAGE_INVALID';END IF;
 SELECT count(*),count(*) FILTER(WHERE public.own_run_quantity_row_v1(q,e,p,public.own_run_quantity_dependencies_v1(p->'expression')) IS NOT TRUE) INTO joined,bad
 FROM jsonb_array_elements(result_value->'quantities') q JOIN jsonb_array_elements(selected) e ON e->'contractId'=q->'contractId'
 JOIN jsonb_array_elements(input_value->'quantityPhases') p ON p->'agreementCode'=q->'agreementCode' AND p->'code'=q->'conceptCode' AND public.own_program_quantity_active_v1(p,period_value,kind_value);
 IF joined<>jsonb_array_length(result_value->'quantities') OR bad<>0 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_QUANTITY_INVALID';END IF;
 SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId' COLLATE "C") INTO expected_keys FROM jsonb_array_elements(selected) e;
 FOREACH field_value IN ARRAY ARRAY['employeeTotals','lineEmployeeTotals','totalReconciliations'] LOOP
  SELECT coalesce(jsonb_agg(x->>'contractId' ORDER BY n),'[]') INTO actual_keys FROM jsonb_array_elements(result_value->field_value) WITH ORDINALITY a(x,n);
  IF actual_keys IS DISTINCT FROM expected_keys THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_TOTAL_COVERAGE_INVALID';END IF;
 END LOOP;
 IF result_value->'employeeCount' IS DISTINCT FROM to_jsonb(people_count) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_TOTAL_COVERAGE_INVALID';END IF;

 FOR employee IN SELECT value FROM jsonb_array_elements(selected) LOOP
  contract_id:=employee->>'contractId';row_map:='{}';exact_totals:='{}';printed_totals:='{}';category_differences:='{}';
  FOR row_value IN SELECT value FROM jsonb_array_elements(result_value->'rows') WHERE value->>'contractId'=contract_id LOOP
   row_map:=row_map||jsonb_build_object(CASE WHEN row_value->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END||(row_value->>'conceptCode'),row_value);
   IF row_value->>'nature'<>'auxiliary' AND NOT row_value->>'conceptCode'=ANY(mapped) THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_UNMAPPED_PAYABLE';END IF;
  END LOOP;
  FOR destination,concept_code IN SELECT key,value FROM jsonb_each_text(policy->'totalCodes') LOOP
   row_value:=row_map->('auxiliary:'||concept_code);
   IF row_value IS NULL OR row_value->>'unit' IS DISTINCT FROM 'money' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_INTERNAL_TOTAL_MISSING';END IF;
   exact_totals:=exact_totals||jsonb_build_object(destination,row_value->'exactValue');
  END LOOP;
  FOREACH destination IN ARRAY targets LOOP
   exact_sum:=zero_value;printed_sum:=zero_value;
   nature_value:=CASE destination WHEN '990' THEN 'employer_contribution' WHEN '993' THEN 'remuneration' WHEN '994' THEN 'non_remuneration' WHEN '995' THEN 'non_remuneration' WHEN '996' THEN 'deduction' END;
   field_value:=CASE destination WHEN '990' THEN 'employer_contribution' WHEN '993' THEN 'remuneration' WHEN '994' THEN 'non_subject' WHEN '995' THEN 'family_allowances' WHEN '996' THEN 'deduction' END;
   FOR concept_code IN SELECT value FROM jsonb_array_elements_text(policy#>ARRAY['contributions',destination]) LOOP
    row_value:=row_map->('concept:'||concept_code);
    IF row_value IS NULL OR row_value->>'unit' IS DISTINCT FROM 'money' OR row_value->>'nature' IS DISTINCT FROM nature_value OR row_value->'rounding' IS DISTINCT FROM '{"precision":2,"mode":"half_up"}'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_CONTRIBUTION_SOURCE_INVALID';END IF;
    exact_sum:=public.own_run_official_rational_op_v1(exact_sum,row_value->'exactValue','add');
    printed_sum:=public.own_run_official_rational_op_v1(printed_sum,public.own_run_official_decimal_v1(row_value->'amount'),'add');
   END LOOP;
   IF exact_sum IS DISTINCT FROM exact_totals->destination THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_ACCUMULATOR_MISMATCH';END IF;
   printed_totals:=printed_totals||jsonb_build_object(destination,printed_sum);
   category_differences:=category_differences||jsonb_build_object(field_value,public.own_run_official_difference_v1(public.own_run_official_money_v1(exact_sum),public.own_run_official_money_v1(printed_sum,'exact')));
  END LOOP;
  nonrem_exact:=public.own_run_official_rational_op_v1(exact_totals->'994',exact_totals->'995','add');
  gross_exact:=public.own_run_official_rational_op_v1(public.own_run_official_rational_op_v1(exact_totals->'993',exact_totals->'994','add'),exact_totals->'995','add');
  net_exact:=public.own_run_official_rational_op_v1(public.own_run_official_rational_op_v1(gross_exact,exact_totals->'888','add'),exact_totals->'996','subtract');
  IF (net_exact->>'numerator')::numeric<=0 THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_NONPOSITIVE_NET_REVIEW_REQUIRED';END IF;
  IF exact_totals->'998' IS DISTINCT FROM net_exact OR exact_totals->'999' IS DISTINCT FROM exact_totals->'998' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_NET_ACCUMULATOR_MISMATCH';END IF;
  expected_official:=jsonb_build_object('contractId',contract_id,'remuneration',public.own_run_official_money_v1(exact_totals->'993'),'non_remuneration',public.own_run_official_money_v1(nonrem_exact),'deduction',public.own_run_official_money_v1(exact_totals->'996'),'employer_contribution',public.own_run_official_money_v1(exact_totals->'990'),'gross',public.own_run_official_money_v1(gross_exact),'net',public.own_run_official_money_v1(exact_totals->'999'));
  exact_sum:=public.own_run_official_rational_op_v1(printed_totals->'994',printed_totals->'995','add');
  expected_line:=jsonb_build_object('contractId',contract_id,'remuneration',public.own_run_official_money_v1(printed_totals->'993','exact'),'non_remuneration',public.own_run_official_money_v1(exact_sum,'exact'),'deduction',public.own_run_official_money_v1(printed_totals->'996','exact'),'employer_contribution',public.own_run_official_money_v1(printed_totals->'990','exact'));
  exact_sum:=public.own_run_official_rational_op_v1(printed_totals->'993',exact_sum,'add');
  expected_line:=expected_line||jsonb_build_object('gross',public.own_run_official_money_v1(exact_sum,'exact'),'net',public.own_run_official_money_v1(public.own_run_official_rational_op_v1(exact_sum,printed_totals->'996','subtract'),'exact'));
  SELECT value INTO official_total FROM jsonb_array_elements(result_value->'employeeTotals') WHERE value->>'contractId'=contract_id;
  SELECT value INTO line_total FROM jsonb_array_elements(result_value->'lineEmployeeTotals') WHERE value->>'contractId'=contract_id;
  IF official_total IS DISTINCT FROM expected_official OR line_total IS DISTINCT FROM expected_line THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_PRESENTED_TOTAL_MISMATCH';END IF;
  adjustment:=public.own_run_official_money_v1(exact_totals->'888');
  net_difference:=public.own_run_official_difference_v1(expected_official->>'net',expected_line->>'net');
  rounding_difference:=public.own_run_official_difference_v1(net_difference,adjustment);
  equation:=public.own_run_official_rational_op_v1(public.own_run_official_rational_op_v1(public.own_run_official_decimal_v1(expected_official->'gross'),public.own_run_official_decimal_v1(to_jsonb(adjustment)),'add'),public.own_run_official_decimal_v1(expected_official->'deduction'),'subtract');
  equation_rounding:=public.own_run_official_money_v1(public.own_run_official_rational_op_v1(public.own_run_official_decimal_v1(expected_official->'net'),equation,'subtract'),'exact');
  -- Explicitly prove both identities; the booleans in stored JSON are not proof.
  equation:=public.own_run_official_rational_op_v1(equation,public.own_run_official_decimal_v1(to_jsonb(equation_rounding)),'add');
  IF equation IS DISTINCT FROM public.own_run_official_decimal_v1(expected_official->'net') THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_RECONCILIATION_INVALID';END IF;
  equation:=public.own_run_official_rational_op_v1(public.own_run_official_rational_op_v1(public.own_run_official_decimal_v1(expected_line->'net'),public.own_run_official_decimal_v1(to_jsonb(adjustment)),'add'),public.own_run_official_decimal_v1(to_jsonb(rounding_difference)),'add');
  IF equation IS DISTINCT FROM public.own_run_official_decimal_v1(expected_official->'net') THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_RECONCILIATION_INVALID';END IF;
  expected_reconciliation:=jsonb_build_object('contractId',contract_id,'agreementCode',policy->'agreementCode','sourceTotals',policy->'totalCodes','exactComponents',exact_totals,'rounding',policy->'rounding','originalLineTotals',expected_line,'officialTotals',expected_official,'categoryDifferences',category_differences,'netAdjustmentOutsideGross',adjustment,'roundingDifferenceFromLines',rounding_difference,'netDifferenceFromLines',net_difference,'displayedEquationRounding',equation_rounding,'identities',jsonb_build_object('linesNetPlusAdjustmentPlusRoundingEqualsOfficialNet',true,'officialGrossPlusAdjustmentMinusDeductionPlusDisplayedRoundingEqualsOfficialNet',true),'sourceLineAmountsUnchanged',true,'reconciliationIsPayrollConcept',false,'reference',policy->'sourceReference');
  SELECT value INTO reconciliation FROM jsonb_array_elements(result_value->'totalReconciliations') WHERE value->>'contractId'=contract_id;
  IF reconciliation IS DISTINCT FROM expected_reconciliation THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_RECONCILIATION_INVALID';END IF;
 END LOOP;
 IF input_value ?| ARRAY['cappedDeductionsVersion','cappedDeductionCapture'] THEN
  expected:=public.own_run_capped_effects_v1(input_value,result_value);actual:=jsonb_build_object('cappedDeductionsVersion',result_value->'cappedDeductionsVersion','cappedDeductionEffectCount',result_value->'cappedDeductionEffectCount','cappedDeductionEffects',result_value->'cappedDeductionEffects');IF public.own_run_hash_v1(expected) IS DISTINCT FROM public.own_run_hash_v1(actual) THEN RAISE EXCEPTION 'CAPPED_EFFECT_MISMATCH';END IF;
 END IF;
END $function$;


COMMIT;
