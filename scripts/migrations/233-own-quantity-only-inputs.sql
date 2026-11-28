-- Migration 233 semantic delta on Root teacher cd027 / 3e0fdda. Compose release pins before operational use.
BEGIN;
SET LOCAL search_path=pg_catalog,public,pg_temp;
DO $quantity_only_prerequisites$ DECLARE pin jsonb;actual text; BEGIN
 FOR pin IN SELECT value FROM jsonb_array_elements('[{"signature":"public.municipal_owner_program_command_core_v1(jsonb,jsonb,uuid,text,jsonb)","beforeBodySha256":"193b0c5ba3220c569369fa4844b8dc960d1bfd8799170ab1c02baf5767b4dd08"},{"signature":"public.own_policy_resolve_candidate_v1(jsonb,text)","beforeBodySha256":"5ae793f12daa09b4466757ea787a6a8f84960a8d8552ae13ae692cc56e4854bf"},{"signature":"public.own_program_definition_composed_v1(jsonb,jsonb)","beforeBodySha256":"1b4bcac24551b91aa5c17755c906f277f3035632ced32af677c192e518b81b70"},{"signature":"public.own_program_quantity_only_history_v1(jsonb,jsonb)","beforeBodySha256":null},{"signature":"public.own_program_quantity_only_options_v1(jsonb)","beforeBodySha256":null},{"signature":"public.own_run_capture_v1(jsonb,jsonb,uuid,text)","beforeBodySha256":"70e661272c9d554c8c03d4544da2f13d8a026e9d21909b43b142ee8fcc6e16e6"},{"signature":"public.own_run_complete_full_v1(jsonb,uuid,jsonb,jsonb,text)","beforeBodySha256":"569e4d088ca47882c7e251e9ca01bf8cb9ba8bc5d28e1e22b0e3cf5c6ca79956"},{"signature":"public.own_run_complete_quantity_full_v1(jsonb,uuid,jsonb,jsonb,text)","beforeBodySha256":"20061d89d9ec83befde5fdd6ecb9145da7d261ed6c540d8cbd560d45f6ba17e9"},{"signature":"public.own_run_complete_quantity_v1(jsonb,uuid,jsonb,jsonb,text)","beforeBodySha256":"293f2de5e2de5a4689c5979ce52ba0d986acfcddbc7f539589c6dadec6e73336"},{"signature":"public.own_run_complete_v1(jsonb,uuid,jsonb,jsonb,text)","beforeBodySha256":"7827f02dfa997e2ee6c8c6fd98ad6d4fc79688bb3fe20ff7a8dc4ecbf6c449a9"},{"signature":"public.own_run_official_capture_check_v1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)","beforeBodySha256":"20596c2244b471e8a4c7107a48912f56c40ff3ec262627cf4f0d8d6b764599a9"},{"signature":"public.own_run_quantity_check_v1(jsonb,jsonb,jsonb,jsonb)","beforeBodySha256":"7be1dcbdcf40e0928359cd0ccc59385d98cb94ed6b9115950814a3b323008767"},{"signature":"public.own_run_quantity_only_admit_v1(jsonb,jsonb,text,jsonb,text,text,text,text)","beforeBodySha256":null},{"signature":"public.own_run_quantity_only_expected_inputs_v1(jsonb)","beforeBodySha256":null},{"signature":"public.own_run_quantity_only_verify_v1(jsonb,jsonb)","beforeBodySha256":null}]'::jsonb) LOOP
 IF pin->'beforeBodySha256'='null'::jsonb THEN
  IF to_regprocedure(pin->>'signature') IS NOT NULL THEN RAISE EXCEPTION 'QUANTITY_ONLY_OBJECT_CONFLICT';END IF;
 ELSE
  SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') INTO actual FROM pg_proc WHERE oid=to_regprocedure(pin->>'signature');
  IF actual IS DISTINCT FROM pin->>'beforeBodySha256' THEN RAISE EXCEPTION 'QUANTITY_ONLY_PREIMAGE_CHANGED: %',pin->>'signature';END IF;
 END IF;
 END LOOP;
END $quantity_only_prerequisites$;
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
  definition:=public.own_program_definition_composed_v1(body->'program',catalog->'items');IF current_program#>>'{definition,optionalScalesVersion}'='own-payroll-optional-scales.v1' AND definition->>'optionalScalesVersion' IS DISTINCT FROM 'own-payroll-optional-scales.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;PERFORM public.own_program_family_tariff_history_candidate_v2(current_program->'definition',definition);PERFORM public.own_program_source_coverage_history_v1(current_program->'definition',definition);PERFORM public.own_program_row_emission_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_monthly_forced_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_declared_adjustments_history_v1(current_program->'definition',definition);PERFORM public.own_program_quantity_only_history_v1(current_program->'definition',definition);IF definition ? 'quantityPhasesVersion' OR definition ? 'officialTotalsVersion' OR definition ? 'familyTariffsVersion' OR definition ? 'rowEmissionVersion' OR definition ? 'rowEmissionPolicies' OR definition ? 'monthlyForcedAmountsVersion' OR definition ? 'monthlyForcedAmountPolicies' THEN
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
  IF cmd='approve' THEN IF body->>'baseVersion' IS DISTINCT FROM current_program->>'version' OR body->>'salaryVersion' IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'OWN_PROGRAM_BASE_CHANGED';END IF;definition:=public.own_program_definition_composed_v1(proposal.body->'program',catalog->'items');IF current_program#>>'{definition,optionalScalesVersion}'='own-payroll-optional-scales.v1' AND definition->>'optionalScalesVersion' IS DISTINCT FROM 'own-payroll-optional-scales.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;PERFORM public.own_program_family_tariff_history_candidate_v2(current_program->'definition',definition);PERFORM public.own_program_source_coverage_history_v1(current_program->'definition',definition);PERFORM public.own_program_row_emission_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_monthly_forced_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_declared_adjustments_history_v1(current_program->'definition',definition);PERFORM public.own_program_quantity_only_history_v1(current_program->'definition',definition);IF definition ? 'quantityPhasesVersion' OR definition ? 'officialTotalsVersion' OR definition ? 'familyTariffsVersion' OR definition ? 'rowEmissionVersion' OR definition ? 'rowEmissionPolicies' OR definition ? 'monthlyForcedAmountsVersion' OR definition ? 'monthlyForcedAmountPolicies' THEN
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
CREATE OR REPLACE FUNCTION public.own_policy_resolve_candidate_v1(policies jsonb,kind text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $policy_resolve$
DECLARE p jsonb;e jsonb;prior jsonb;entries jsonb:='{}';resolved jsonb:='[]';ids text[]:='{}';id text;prior_id text;scope_value text;start_value text;end_value text;next_id text;seen text[];temporal boolean;
BEGIN
 IF kind IS NULL OR kind NOT IN('family-tariff','row-emission','official-totals','source-coverage','declared-adjustment','quantity-only') OR jsonb_typeof(policies) IS DISTINCT FROM 'array' OR jsonb_array_length(policies) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'POLICY_SUCCESSION_INVALID';END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(policies) LOOP
  temporal:=CASE kind WHEN 'quantity-only' THEN true WHEN 'declared-adjustment' THEN true WHEN 'source-coverage' THEN true WHEN 'family-tariff' THEN p->>'version' IN('own-payroll-family-tariffs.v3','own-payroll-family-tariffs.v4') WHEN 'official-totals' THEN p->>'version'='own-payroll-official-totals.v2' ELSE p->>'version'='own-payroll-row-emission.v2' END;
  IF temporal THEN
   PERFORM public.own_policy_declaration_candidate_v1(p);id:=p->>'policyId';start_value:=p->>'validFrom';end_value:=p->>'validUntil';
  ELSE
   IF jsonb_typeof(p->'period') IS DISTINCT FROM 'string' OR p->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
   OR jsonb_typeof(p->'agreementCode') IS DISTINCT FROM 'string' OR p->>'agreementCode'!~'^[0-9]{1,9}$'
   OR jsonb_typeof(p->'liquidationType') IS DISTINCT FROM 'string' OR p->>'liquidationType' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other')
   OR p ?| ARRAY['policyId','supersedes','validFrom','validUntil'] THEN RAISE EXCEPTION 'POLICY_SUCCESSION_INVALID';END IF;
   start_value:=p->>'period';end_value:=start_value;
   id:='legacy:'||kind||':'||(p->>'agreementCode')||':'||start_value||':'||(p->>'liquidationType')||CASE kind WHEN 'row-emission' THEN ':'||(p->>'conceptCode') WHEN 'quantity-only' THEN ':'||(p->>'sourceCode') WHEN 'declared-adjustment' THEN ':'||(p->>'sourceCode') ELSE '' END;
  END IF;
  IF id IS NULL OR entries ? id THEN RAISE EXCEPTION 'POLICY_ID_DUPLICATE';END IF;
  scope_value:=(p->>'agreementCode')||':'||(p->>'liquidationType')||CASE kind WHEN 'row-emission' THEN ':'||(p->>'conceptCode') WHEN 'quantity-only' THEN ':'||(p->>'sourceCode') WHEN 'declared-adjustment' THEN ':'||(p->>'sourceCode') ELSE '' END;
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
CREATE OR REPLACE FUNCTION public.own_program_definition_composed_v1(p jsonb,items jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE normalized jsonb;base_program jsonb:=p-ARRAY['monthlyForcedAmountsVersion','monthlyForcedAmountPolicies','sourceCoverageVersion','sourceCoveragePolicies','monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies','quantityOnlyInputsVersion','quantityOnlyInputPolicies'];extension jsonb:='{}';coverage jsonb:='{}';
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
 RETURN normalized||extension||coverage;
END $function$;
CREATE OR REPLACE FUNCTION public.own_program_quantity_only_history_v1(prior jsonb,next_programme jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $quantity_only_history$
BEGIN
 IF NOT coalesce(prior ?| ARRAY['quantityOnlyInputsVersion','quantityOnlyInputPolicies'],false) THEN RETURN;END IF;
 IF next_programme->'quantityOnlyInputsVersion' IS DISTINCT FROM prior->'quantityOnlyInputsVersion'
 OR jsonb_typeof(next_programme->'quantityOnlyInputPolicies') IS DISTINCT FROM 'array'
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior->'quantityOnlyInputPolicies') p WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(next_programme->'quantityOnlyInputPolicies') n WHERE n=p))
 THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
 PERFORM public.own_program_quantity_only_options_v1(next_programme);
END $quantity_only_history$;
ALTER FUNCTION public.own_program_quantity_only_history_v1(jsonb,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_program_quantity_only_history_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_program_quantity_only_options_v1(programme jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $quantity_only_options$
DECLARE policies jsonb:=programme->'quantityOnlyInputPolicies';policy jsonb;entry jsonb;relevant jsonb;rules jsonb;found jsonb;binding jsonb;probe text;
BEGIN
 IF programme->>'quantityOnlyInputsVersion' IS DISTINCT FROM 'own-quantity-only-inputs.v1'
 OR programme->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2'
 OR jsonb_typeof(policies) IS DISTINCT FROM 'array' OR jsonb_array_length(policies) NOT BETWEEN 1 AND 128
 THEN RAISE EXCEPTION 'QUANTITY_ONLY_CONTRACT_INVALID';END IF;
 FOR policy IN SELECT value FROM jsonb_array_elements(policies) LOOP
  IF NOT public.own_program_exact_v1(policy,ARRAY['policyId','supersedes','agreementCode','validFrom','validUntil','liquidationType','sourceCode','quantityInputKey','quantityUnit','sourceKind','sourceContracts','amountPolicy','forcedPolicy','otherChannelPolicy','adjustmentMonthPolicy','absencePolicy','sourceSha256','ruleReference'])
  OR policy->>'liquidationType' IS DISTINCT FROM 'monthly'
  OR jsonb_typeof(policy->'sourceCode') IS DISTINCT FROM 'string' OR coalesce(policy->>'sourceCode','')!~'^[0-9]{1,9}$'
  OR jsonb_typeof(policy->'quantityInputKey') IS DISTINCT FROM 'string' OR coalesce(policy->>'quantityInputKey','')!~'^[A-Za-z][A-Za-z0-9_]{0,63}$'
  OR coalesce(policy->>'quantityUnit' IN('money','days','hours','minutes','units','percent','coefficient'),false) IS NOT TRUE
  OR coalesce(policy->>'sourceKind' IN('monthly_quantity','fixed_quantity'),false) IS NOT TRUE
  OR policy->'sourceContracts' IS DISTINCT FROM (CASE policy->>'sourceKind' WHEN 'monthly_quantity' THEN '["own-payroll-novelty-batch.v1","payroll-novelty-batch.v2"]'::jsonb ELSE '["payroll-fixed-export.v1"]'::jsonb END)
  OR policy->>'amountPolicy' IS DISTINCT FROM 'absent_or_zero' OR policy->>'forcedPolicy' IS DISTINCT FROM 'reject'
  OR policy->>'otherChannelPolicy' IS DISTINCT FROM 'reject' OR policy->>'adjustmentMonthPolicy' IS DISTINCT FROM 'absent_or_current_month'
  OR policy->>'absencePolicy' IS DISTINCT FROM 'zero_only_after_existing_complete_capture'
  OR jsonb_typeof(policy->'sourceSha256') IS DISTINCT FROM 'string' OR coalesce(policy->>'sourceSha256','')!~'^[a-f0-9]{64}$'
  OR public.own_program_text_v1(policy->'ruleReference',3,180) IS NOT TRUE
  OR policy->>'ruleReference' IS DISTINCT FROM normalize(policy->>'ruleReference',NFC)
  THEN RAISE EXCEPTION 'QUANTITY_ONLY_CONTRACT_INVALID';END IF;
  PERFORM public.own_policy_declaration_candidate_v1(policy);
 END LOOP;
 rules:=public.own_participation_rules_v1(programme);
 FOR entry IN SELECT value FROM jsonb_array_elements(public.own_policy_resolve_candidate_v1(policies,'quantity-only')) LOOP
  policy:=entry->'policy';
  SELECT coalesce(jsonb_agg(r),'[]') INTO relevant FROM jsonb_array_elements(rules||coalesce(programme->'quantityPhases','[]')) r WHERE r->'agreementCode'=policy->'agreementCode' AND r->'liquidationTypes' ? (policy->>'liquidationType');
  SELECT coalesce(jsonb_agg(b),'[]') INTO found FROM jsonb_array_elements(programme->'bindings') b WHERE b->'agreementCode'=policy->'agreementCode' AND b->'sourceCode'=policy->'sourceCode' AND b->>'sourceKind'~'^(monthly|fixed)_';
  binding:=found->0;
  IF jsonb_array_length(found)<>1 OR binding->'key' IS DISTINCT FROM policy->'quantityInputKey' OR binding->'sourceKind' IS DISTINCT FROM policy->'sourceKind' OR binding->'unit' IS DISTINCT FROM policy->'quantityUnit' OR binding->>'combine' IS DISTINCT FROM 'sum' OR binding->>'onMissing' IS DISTINCT FROM 'zero' THEN RAISE EXCEPTION 'QUANTITY_ONLY_BINDING_REQUIRED';END IF;
  FOR probe IN SELECT value FROM jsonb_array_elements_text(public.own_policy_boundaries_candidate_v1(entry,relevant)) LOOP
   SELECT coalesce(jsonb_agg(r),'[]') INTO found FROM jsonb_array_elements(rules) r WHERE r->'agreementCode'=policy->'agreementCode' AND r->'code'=policy->'sourceCode' AND r->>'nature'<>'auxiliary' AND public.own_program_quantity_active_v1(r,probe,policy->>'liquidationType');
   IF jsonb_array_length(found)<>1 OR found#>>'{0,unit}' IS DISTINCT FROM 'money' THEN RAISE EXCEPTION 'QUANTITY_ONLY_OWNER_REQUIRED';END IF;
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(relevant) r WHERE public.own_program_quantity_active_v1(r,probe,policy->>'liquidationType')
    AND jsonb_path_exists(r->'expression','$.** ? ((@.op == "input" || @.op == "match") && @.key == $key)',jsonb_build_object('key',policy->'quantityInputKey')))
   THEN RAISE EXCEPTION 'QUANTITY_ONLY_CONSUMER_REQUIRED';END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(programme->'monthlyForcedAmountPolicies','[]')) f WHERE f->'agreementCode'=policy->'agreementCode' AND f->'sourceCode'=policy->'sourceCode' AND f->'liquidationType'=policy->'liquidationType' AND f->>'period'>=entry->>'validFrom' AND (entry->'validUntil'='null'::jsonb OR f->>'period'<=entry->>'validUntil'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(programme->'monthlyDeclaredAdjustmentPolicies','[]')) f WHERE f->'agreementCode'=policy->'agreementCode' AND f->'sourceCode'=policy->'sourceCode' AND f->'liquidationType'=policy->'liquidationType' AND (f->'validUntil'='null'::jsonb OR f->>'validUntil'>=entry->>'validFrom') AND (entry->'validUntil'='null'::jsonb OR entry->>'validUntil'>=f->>'validFrom'))
  THEN RAISE EXCEPTION 'QUANTITY_ONLY_POLICY_COLLISION';END IF;
 END LOOP;
 RETURN jsonb_build_object('quantityOnlyInputsVersion','own-quantity-only-inputs.v1','quantityOnlyInputPolicies',policies);
END $quantity_only_options$;
ALTER FUNCTION public.own_program_quantity_only_options_v1(jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_program_quantity_only_options_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
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
   IF (CASE WHEN emission_enabled OR coalesce((program_state#>'{program,definition}') ?| ARRAY['sourceCoverageVersion','sourceCoveragePolicies','monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies','quantityOnlyInputsVersion','quantityOnlyInputPolicies'],false) THEN public.own_program_definition_composed_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') ELSE public.own_program_definition_official_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') END) IS DISTINCT FROM program_state#>'{program,definition}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
  ELSE
   IF (CASE WHEN coalesce((program_state#>'{program,definition}') ?| ARRAY['sourceCoverageVersion','sourceCoveragePolicies','monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies','quantityOnlyInputsVersion','quantityOnlyInputPolicies'],false) THEN public.own_program_definition_composed_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') ELSE public.own_program_quantity_definition_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') END) IS DISTINCT FROM program_state#>'{program,definition}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
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
 payload_value:=jsonb_build_object('programState',program_state,'population',population,'monthly',CASE WHEN jsonb_array_length(native_batches)=0 AND NOT coalesce((program_state#>'{program,definition}') ?| ARRAY['sourceCoverageVersion','sourceCoveragePolicies','quantityOnlyInputsVersion','quantityOnlyInputPolicies'],false) THEN jsonb_build_object('complete',true,'batches',batches) ELSE jsonb_build_object('complete',true,'batches',batches,'nativeBatches',native_batches) END,'fixed',jsonb_build_object('list',jsonb_build_object('ok',true,'data',list_value),'export',jsonb_build_object('ok',true,'data',export_value)),'period',body->>'period','liquidationType',body->>'liquidationType','selection',body->'selection','sourceInventory',inventory);
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
 IF octet_length(payload_value::text)+octet_length(body::text)+8192>4194304 OR (SELECT count(*) FROM public.own_payroll_run_capture WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 PERFORM public.own_run_capacity_v1(octet_length(payload_value::text)+octet_length(body::text));
 PERFORM public.own_close_guard_v1(ctx,body->>'period',body->>'liquidationType',ids);
 INSERT INTO public.own_payroll_run_capture(tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,algorithm_sha256,payload,payload_sha256) VALUES((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,body,fingerprint,algorithm,payload_value,public.own_run_hash_v1(payload_value)) RETURNING * INTO c;
 RETURN public.own_run_receipt_v1(c,false);END $function$;
CREATE OR REPLACE FUNCTION public.own_run_complete_full_v1(p jsonb, capture uuid, input_value jsonb, result_value jsonb, algorithm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE ctx jsonb;c public.own_payroll_run_capture;r public.own_payroll_run_result;ih text;rh text;BEGIN ctx:=public.own_run_context_v1(p,true,true);PERFORM public.own_run_lock_v1(ctx);
 SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=capture;PERFORM public.own_run_owned_v1(ctx,c);
 IF algorithm IS DISTINCT FROM c.algorithm_sha256 THEN RAISE EXCEPTION 'OWN_RUN_ENGINE_CHANGED';END IF;
 PERFORM public.own_run_source_coverage_check_v1(c.payload);
 PERFORM public.own_run_salary_native_input_verify_v2(c.payload,input_value);
 -- A small receipt uses the existing authoritative finalizer, retaining its
 -- exact validation and installed close policy even for a legacy programme.
 IF octet_length(input_value::text)+octet_length(result_value::text)+octet_length(c.payload::text)+octet_length(c.body::text)+8192<=4194304 THEN
  RETURN public.own_run_complete_v1(p,capture,input_value,result_value,algorithm);
 END IF;
 PERFORM public.own_run_family_input_verify_v1(c.payload,input_value);
 PERFORM public.own_run_optional_scale_input_verify_v1(c.payload,input_value);PERFORM public.own_run_declared_adjustments_verify_v1(c.payload,input_value,result_value);
 PERFORM public.own_run_quantity_only_verify_v1(c.payload,input_value);
 IF (CASE WHEN c.payload#>>'{programState,program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN input_value->>'salaryConditionsVersion' IS DISTINCT FROM c.payload#>>'{programState,program,definition,salaryConditionsVersion}' ELSE input_value ? 'salaryConditionsVersion' END) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(input_value,ARRAY['version','period','liquidationType','selection','sourceVersions','populationComplete','totalsPrecision','employees','rules']||CASE WHEN c.payload#>>'{programState,program,definition,familyPayrollFactsVersion}'='own-contract-family-payroll-facts.v1' THEN ARRAY['familyPayrollFactsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN c.payload#>>'{programState,program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN ARRAY['salaryConditionsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN c.payload#>'{programState,program,definition}' ? 'fixedForcedAmountsVersion' OR c.payload#>'{programState,program,definition}' ? 'fixedForcedAmountsPolicy' THEN ARRAY['fixedForcedAmountsVersion','fixedForcedAmountsPolicy'] ELSE ARRAY[]::text[] END) OR NOT public.own_program_exact_v1(result_value,ARRAY['version','period','liquidationType','selection','sourceVersions','employeeCount','rowCount','rows','employeeTotals','payrollCalculated','payrollPosted','municipalApprovalVerified','paymentExecuted']) OR input_value->>'version' IS DISTINCT FROM (CASE WHEN c.payload#>>'{programState,program,definition,namespaceVersion}'='own-payroll-namespaces.v2' THEN 'own-payroll-input.v2' ELSE 'own-payroll-input.v1' END) OR result_value->>'version' IS DISTINCT FROM (CASE WHEN input_value->>'version'='own-payroll-input.v2' THEN 'own-payroll-result.v2' ELSE 'own-payroll-result.v1' END) OR input_value->>'period' IS DISTINCT FROM c.body->>'period' OR input_value->>'liquidationType' IS DISTINCT FROM c.body->>'liquidationType' OR input_value->'selection' IS DISTINCT FROM c.body->'selection' OR result_value->>'period' IS DISTINCT FROM input_value->>'period' OR result_value->>'liquidationType' IS DISTINCT FROM input_value->>'liquidationType' OR result_value->'selection' IS DISTINCT FROM input_value->'selection' OR result_value->'sourceVersions' IS DISTINCT FROM input_value->'sourceVersions' OR input_value->'populationComplete' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollCalculated' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollPosted' IS DISTINCT FROM 'false'::jsonb OR result_value->'municipalApprovalVerified' IS DISTINCT FROM 'false'::jsonb OR result_value->'paymentExecuted' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF octet_length(input_value::text)+octet_length(result_value::text)+octet_length(c.payload::text)+octet_length(c.body::text)+8192>33554432 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 IF input_value->'rules' IS DISTINCT FROM public.own_participation_rules_v1(c.payload#>'{programState,program,definition}') OR input_value->'totalsPrecision' IS DISTINCT FROM c.payload#>'{programState,program,definition,totalsPrecision}' OR input_value#>>'{sourceVersions,population}' IS DISTINCT FROM c.payload#>>'{population,version}' OR input_value#>>'{sourceVersions,rules}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('program',c.payload#>'{programState,program}','salary',c.payload#>'{programState,salaryCatalog}')) OR input_value#>>'{sourceVersions,novelties}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('monthly',c.payload->'monthly','fixed',c.payload#>'{fixed,export,data}')) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF jsonb_typeof(input_value->'employees') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'employeeTotals') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF (SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId') FROM jsonb_array_elements(input_value->'employees') e) IS DISTINCT FROM(SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId') FROM jsonb_array_elements(c.payload#>'{population,employees}') e) OR result_value->'employeeCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(input_value->'employees')) OR result_value->'employeeCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(result_value->'employeeTotals')) OR result_value->'rowCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(result_value->'rows')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'rows') row_value WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(input_value->'employees') e WHERE e->>'contractId'=row_value->>'contractId')) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 PERFORM public.own_fixed_forced_capture_v1(c,input_value,result_value);
  ih:=public.own_run_hash_v1(input_value);rh:=public.own_run_hash_v1(result_value);SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
 IF FOUND THEN IF r.input_sha256<>ih OR r.result_sha256<>rh OR r.input<>input_value OR r.result<>result_value THEN RAISE EXCEPTION 'OWN_RUN_RESULT_CONFLICT';END IF;RETURN public.own_run_saved_v1(r);END IF;
 PERFORM public.own_run_capacity_v1(octet_length(input_value::text)+octet_length(result_value::text));
 PERFORM public.own_close_guard_v1(ctx,c.body->>'period',c.body->>'liquidationType',ARRAY(SELECT(value->>'contractId')::uuid FROM jsonb_array_elements(input_value->'employees')));
 INSERT INTO public.own_payroll_run_result(capture_id,algorithm_sha256,input,result,input_sha256,result_sha256) VALUES(c.id,algorithm,input_value,result_value,ih,rh) RETURNING * INTO r;RETURN public.own_run_saved_v1(r);END $function$;
CREATE OR REPLACE FUNCTION public.own_run_complete_quantity_full_v1(p jsonb, capture uuid, input_value jsonb, result_value jsonb, algorithm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE ctx jsonb;c public.own_payroll_run_capture;r public.own_payroll_run_result;ih text;rh text;official_family jsonb;quantity_family jsonb;BEGIN ctx:=public.own_run_context_v1(p,true,true);PERFORM public.own_run_lock_v1(ctx);
 SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=capture;PERFORM public.own_run_owned_v1(ctx,c);
 IF algorithm IS DISTINCT FROM c.algorithm_sha256 THEN RAISE EXCEPTION 'OWN_RUN_ENGINE_CHANGED';END IF;
 PERFORM public.own_run_source_coverage_check_v1(c.payload);
 PERFORM public.own_run_salary_native_input_verify_v2(c.payload,input_value);
 -- A small receipt uses the existing authoritative finalizer, retaining its
 -- exact validation and installed close policy even for a legacy programme.
 IF octet_length(input_value::text)+octet_length(result_value::text)+octet_length(c.payload::text)+octet_length(c.body::text)+8192<=4194304 THEN
  RETURN public.own_run_complete_quantity_v1(p,capture,input_value,result_value,algorithm);
 END IF;
 IF octet_length(input_value::text)+octet_length(result_value::text)+octet_length(c.payload::text)+octet_length(c.body::text)+8192>33554432 OR octet_length(input_value::text)>8388608 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 IF to_regprocedure('public.own_run_quantity_family_v1()') IS NULL THEN RAISE EXCEPTION 'OWN_RUN_QUANTITY_FAMILY_REQUIRED';END IF;
 quantity_family:=public.own_run_quantity_family_v1();
 IF public.own_run_official_family_shape_v1(quantity_family,'own-run-quantity-family.v1') IS NOT TRUE OR quantity_family IS DISTINCT FROM c.payload#>'{sourceInventory,quantityPhases,family}' THEN RAISE EXCEPTION 'OWN_RUN_QUANTITY_FAMILY_REQUIRED';END IF;
 IF c.payload#>'{programState,program,definition}' ? 'officialTotalsVersion' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_FINALIZER_REQUIRED';END IF;
 PERFORM public.own_run_quantity_check_v1(c.payload,c.body,input_value,result_value);
 PERFORM public.own_run_family_input_verify_v1(c.payload,input_value);
 PERFORM public.own_run_optional_scale_input_verify_v1(c.payload,input_value);PERFORM public.own_run_declared_adjustments_verify_v1(c.payload,input_value,result_value);
 PERFORM public.own_run_quantity_only_verify_v1(c.payload,input_value);
 PERFORM public.own_fixed_forced_capture_v1(c,input_value,result_value);
  ih:=public.own_run_hash_v1(input_value);rh:=public.own_run_hash_v1(result_value);SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
 IF FOUND THEN IF r.input_sha256<>ih OR r.result_sha256<>rh OR r.input<>input_value OR r.result<>result_value THEN RAISE EXCEPTION 'OWN_RUN_RESULT_CONFLICT';END IF;RETURN public.own_run_saved_v1(r);END IF;
 PERFORM public.own_run_capacity_v1(octet_length(input_value::text)+octet_length(result_value::text));
 PERFORM public.own_close_guard_v1(ctx,c.body->>'period',c.body->>'liquidationType',ARRAY(SELECT(value->>'contractId')::uuid FROM jsonb_array_elements(input_value->'employees')));
 INSERT INTO public.own_payroll_run_result(capture_id,algorithm_sha256,input,result,input_sha256,result_sha256) VALUES(c.id,algorithm,input_value,result_value,ih,rh) RETURNING * INTO r;RETURN public.own_run_saved_v1(r);END $function$;
CREATE OR REPLACE FUNCTION public.own_run_complete_quantity_v1(p jsonb, capture uuid, input_value jsonb, result_value jsonb, algorithm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE ctx jsonb;c public.own_payroll_run_capture;r public.own_payroll_run_result;ih text;rh text;official_family jsonb;quantity_family jsonb;BEGIN ctx:=public.own_run_context_v1(p,true,true);PERFORM public.own_run_lock_v1(ctx);
 SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=capture;PERFORM public.own_run_owned_v1(ctx,c);
 IF algorithm IS DISTINCT FROM c.algorithm_sha256 THEN RAISE EXCEPTION 'OWN_RUN_ENGINE_CHANGED';END IF;
 PERFORM public.own_run_source_coverage_check_v1(c.payload);
 PERFORM public.own_run_salary_native_input_verify_v2(c.payload,input_value);
 IF octet_length(input_value::text)+octet_length(result_value::text)+octet_length(c.payload::text)+octet_length(c.body::text)+8192>4194304 OR octet_length(input_value::text)>8388608 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 IF to_regprocedure('public.own_run_quantity_family_v1()') IS NULL THEN RAISE EXCEPTION 'OWN_RUN_QUANTITY_FAMILY_REQUIRED';END IF;
 quantity_family:=public.own_run_quantity_family_v1();
 IF public.own_run_official_family_shape_v1(quantity_family,'own-run-quantity-family.v1') IS NOT TRUE OR quantity_family IS DISTINCT FROM c.payload#>'{sourceInventory,quantityPhases,family}' THEN RAISE EXCEPTION 'OWN_RUN_QUANTITY_FAMILY_REQUIRED';END IF;
 IF c.payload#>'{programState,program,definition}' ? 'officialTotalsVersion' THEN RAISE EXCEPTION 'OWN_RUN_OFFICIAL_FINALIZER_REQUIRED';END IF;
 PERFORM public.own_run_quantity_check_v1(c.payload,c.body,input_value,result_value);
 PERFORM public.own_run_family_input_verify_v1(c.payload,input_value);
 PERFORM public.own_run_optional_scale_input_verify_v1(c.payload,input_value);PERFORM public.own_run_declared_adjustments_verify_v1(c.payload,input_value,result_value);
 PERFORM public.own_run_quantity_only_verify_v1(c.payload,input_value);
 PERFORM public.own_fixed_forced_capture_v1(c,input_value,result_value);
  ih:=public.own_run_hash_v1(input_value);rh:=public.own_run_hash_v1(result_value);SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
 IF FOUND THEN IF r.input_sha256<>ih OR r.result_sha256<>rh OR r.input<>input_value OR r.result<>result_value THEN RAISE EXCEPTION 'OWN_RUN_RESULT_CONFLICT';END IF;RETURN public.own_run_saved_v1(r);END IF;
 PERFORM public.own_run_capacity_v1(octet_length(input_value::text)+octet_length(result_value::text));
 PERFORM public.own_close_guard_v1(ctx,c.body->>'period',c.body->>'liquidationType',ARRAY(SELECT(value->>'contractId')::uuid FROM jsonb_array_elements(input_value->'employees')));
 INSERT INTO public.own_payroll_run_result(capture_id,algorithm_sha256,input,result,input_sha256,result_sha256) VALUES(c.id,algorithm,input_value,result_value,ih,rh) RETURNING * INTO r;RETURN public.own_run_saved_v1(r);END $function$;
CREATE OR REPLACE FUNCTION public.own_run_complete_v1(p jsonb, capture uuid, input_value jsonb, result_value jsonb, algorithm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
 SET "TimeZone" TO 'UTC'
AS $function$
DECLARE ctx jsonb;c public.own_payroll_run_capture;r public.own_payroll_run_result;ih text;rh text;BEGIN ctx:=public.own_run_context_v1(p,true,true);PERFORM public.own_run_lock_v1(ctx);
 SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=capture;PERFORM public.own_run_owned_v1(ctx,c);
 IF algorithm IS DISTINCT FROM c.algorithm_sha256 THEN RAISE EXCEPTION 'OWN_RUN_ENGINE_CHANGED';END IF;
 PERFORM public.own_run_source_coverage_check_v1(c.payload);
 PERFORM public.own_run_salary_native_input_verify_v2(c.payload,input_value);
 PERFORM public.own_run_family_input_verify_v1(c.payload,input_value);
 PERFORM public.own_run_optional_scale_input_verify_v1(c.payload,input_value);PERFORM public.own_run_declared_adjustments_verify_v1(c.payload,input_value,result_value);
 PERFORM public.own_run_quantity_only_verify_v1(c.payload,input_value);
 IF (CASE WHEN c.payload#>>'{programState,program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN input_value->>'salaryConditionsVersion' IS DISTINCT FROM c.payload#>>'{programState,program,definition,salaryConditionsVersion}' ELSE input_value ? 'salaryConditionsVersion' END) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(input_value,ARRAY['version','period','liquidationType','selection','sourceVersions','populationComplete','totalsPrecision','employees','rules']||CASE WHEN c.payload#>>'{programState,program,definition,familyPayrollFactsVersion}'='own-contract-family-payroll-facts.v1' THEN ARRAY['familyPayrollFactsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN c.payload#>>'{programState,program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2') THEN ARRAY['salaryConditionsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN c.payload#>'{programState,program,definition}' ? 'fixedForcedAmountsVersion' OR c.payload#>'{programState,program,definition}' ? 'fixedForcedAmountsPolicy' THEN ARRAY['fixedForcedAmountsVersion','fixedForcedAmountsPolicy'] ELSE ARRAY[]::text[] END) OR NOT public.own_program_exact_v1(result_value,ARRAY['version','period','liquidationType','selection','sourceVersions','employeeCount','rowCount','rows','employeeTotals','payrollCalculated','payrollPosted','municipalApprovalVerified','paymentExecuted']) OR input_value->>'version' IS DISTINCT FROM (CASE WHEN c.payload#>>'{programState,program,definition,namespaceVersion}'='own-payroll-namespaces.v2' THEN 'own-payroll-input.v2' ELSE 'own-payroll-input.v1' END) OR result_value->>'version' IS DISTINCT FROM (CASE WHEN input_value->>'version'='own-payroll-input.v2' THEN 'own-payroll-result.v2' ELSE 'own-payroll-result.v1' END) OR input_value->>'period' IS DISTINCT FROM c.body->>'period' OR input_value->>'liquidationType' IS DISTINCT FROM c.body->>'liquidationType' OR input_value->'selection' IS DISTINCT FROM c.body->'selection' OR result_value->>'period' IS DISTINCT FROM input_value->>'period' OR result_value->>'liquidationType' IS DISTINCT FROM input_value->>'liquidationType' OR result_value->'selection' IS DISTINCT FROM input_value->'selection' OR result_value->'sourceVersions' IS DISTINCT FROM input_value->'sourceVersions' OR input_value->'populationComplete' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollCalculated' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollPosted' IS DISTINCT FROM 'false'::jsonb OR result_value->'municipalApprovalVerified' IS DISTINCT FROM 'false'::jsonb OR result_value->'paymentExecuted' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF octet_length(input_value::text)+octet_length(result_value::text)+octet_length(c.payload::text)+octet_length(c.body::text)+8192>4194304 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 IF input_value->'rules' IS DISTINCT FROM public.own_participation_rules_v1(c.payload#>'{programState,program,definition}') OR input_value->'totalsPrecision' IS DISTINCT FROM c.payload#>'{programState,program,definition,totalsPrecision}' OR input_value#>>'{sourceVersions,population}' IS DISTINCT FROM c.payload#>>'{population,version}' OR input_value#>>'{sourceVersions,rules}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('program',c.payload#>'{programState,program}','salary',c.payload#>'{programState,salaryCatalog}')) OR input_value#>>'{sourceVersions,novelties}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('monthly',c.payload->'monthly','fixed',c.payload#>'{fixed,export,data}')) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF jsonb_typeof(input_value->'employees') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'employeeTotals') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF (SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId') FROM jsonb_array_elements(input_value->'employees') e) IS DISTINCT FROM(SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId') FROM jsonb_array_elements(c.payload#>'{population,employees}') e) OR result_value->'employeeCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(input_value->'employees')) OR result_value->'employeeCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(result_value->'employeeTotals')) OR result_value->'rowCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(result_value->'rows')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'rows') row_value WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(input_value->'employees') e WHERE e->>'contractId'=row_value->>'contractId')) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 PERFORM public.own_fixed_forced_capture_v1(c,input_value,result_value);
  ih:=public.own_run_hash_v1(input_value);rh:=public.own_run_hash_v1(result_value);SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
 IF FOUND THEN IF r.input_sha256<>ih OR r.result_sha256<>rh OR r.input<>input_value OR r.result<>result_value THEN RAISE EXCEPTION 'OWN_RUN_RESULT_CONFLICT';END IF;RETURN public.own_run_saved_v1(r);END IF;
 PERFORM public.own_run_capacity_v1(octet_length(input_value::text)+octet_length(result_value::text));
 PERFORM public.own_close_guard_v1(ctx,c.body->>'period',c.body->>'liquidationType',ARRAY(SELECT(value->>'contractId')::uuid FROM jsonb_array_elements(input_value->'employees')));
 INSERT INTO public.own_payroll_run_result(capture_id,algorithm_sha256,input,result,input_sha256,result_sha256) VALUES(c.id,algorithm,input_value,result_value,ih,rh) RETURNING * INTO r;RETURN public.own_run_saved_v1(r);END $function$;
CREATE OR REPLACE FUNCTION public.own_run_official_capture_check_v1(payload jsonb,body jsonb,input_value jsonb,result_value jsonb,official_family jsonb,quantity_family jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE programme jsonb:=payload#>'{programState,program,definition}';
 qblock jsonb:=payload#>'{sourceInventory,quantityPhases}';oblock jsonb:=payload#>'{sourceInventory,officialTotals}';
 official_proof jsonb;expected jsonb;policy jsonb;found_policies jsonb;conditions boolean;
BEGIN
 PERFORM public.own_run_source_coverage_check_v1(payload);
 PERFORM public.own_run_salary_native_input_verify_v2(payload,input_value);
 PERFORM public.own_run_monthly_forced_capture_check_candidate_v1(payload,input_value,result_value);
 PERFORM public.own_run_declared_adjustments_verify_v1(payload,input_value,result_value);
 PERFORM public.own_run_quantity_only_verify_v1(payload,input_value);
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
CREATE OR REPLACE FUNCTION public.own_run_quantity_check_v1(payload jsonb,body jsonb,input_value jsonb,result_value jsonb) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE family_facts boolean:=coalesce(payload#>>'{programState,program,definition,familyPayrollFactsVersion}'='own-contract-family-payroll-facts.v1',false);conditions boolean:=coalesce(payload#>>'{programState,program,definition,salaryConditionsVersion}' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2'),false);block jsonb:=payload#>'{sourceInventory,quantityPhases}';expected jsonb;joined bigint;bad bigint;
BEGIN
 PERFORM public.own_run_family_input_verify_v1(payload,input_value);
 PERFORM public.own_run_optional_scale_input_verify_v1(payload,input_value);
 PERFORM public.own_run_declared_adjustments_verify_v1(payload,input_value,result_value);
 PERFORM public.own_run_quantity_only_verify_v1(payload,input_value);
 -- Monetary contract of own_run_complete_v1 (f303a276…), moved verbatim except the V3 versions and keys.
 IF (CASE WHEN conditions THEN input_value->>'salaryConditionsVersion' IS DISTINCT FROM payload#>>'{programState,program,definition,salaryConditionsVersion}' ELSE input_value ? 'salaryConditionsVersion' END) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(input_value,ARRAY['version','namespaceVersion','period','liquidationType','selection','sourceVersions','populationComplete','totalsPrecision','employees','rules','quantityPhasesVersion','quantityPhases']||CASE WHEN conditions THEN ARRAY['salaryConditionsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN family_facts THEN ARRAY['familyPayrollFactsVersion'] ELSE ARRAY[]::text[] END) OR NOT public.own_program_exact_v1(result_value,ARRAY['version','period','liquidationType','selection','sourceVersions','employeeCount','rowCount','rows','employeeTotals','payrollCalculated','payrollPosted','municipalApprovalVerified','paymentExecuted','quantityCount','quantities']) OR input_value->>'version' IS DISTINCT FROM 'own-payroll-input.v3' OR input_value->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2' OR input_value->>'quantityPhasesVersion' IS DISTINCT FROM 'own-payroll-quantity-phases.v1' OR payload#>>'{programState,program,definition,namespaceVersion}' IS DISTINCT FROM 'own-payroll-namespaces.v2' OR payload#>>'{programState,program,definition,quantityPhasesVersion}' IS DISTINCT FROM 'own-payroll-quantity-phases.v1' OR result_value->>'version' IS DISTINCT FROM 'own-payroll-result.v3' OR input_value->>'period' IS DISTINCT FROM body->>'period' OR input_value->>'liquidationType' IS DISTINCT FROM body->>'liquidationType' OR input_value->'selection' IS DISTINCT FROM body->'selection' OR result_value->>'period' IS DISTINCT FROM input_value->>'period' OR result_value->>'liquidationType' IS DISTINCT FROM input_value->>'liquidationType' OR result_value->'selection' IS DISTINCT FROM input_value->'selection' OR result_value->'sourceVersions' IS DISTINCT FROM input_value->'sourceVersions' OR input_value->'populationComplete' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollCalculated' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollPosted' IS DISTINCT FROM 'false'::jsonb OR result_value->'municipalApprovalVerified' IS DISTINCT FROM 'false'::jsonb OR result_value->'paymentExecuted' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF input_value->'rules' IS DISTINCT FROM public.own_participation_rules_v1(payload#>'{programState,program,definition}') OR input_value->'totalsPrecision' IS DISTINCT FROM payload#>'{programState,program,definition,totalsPrecision}' OR input_value#>>'{sourceVersions,population}' IS DISTINCT FROM payload#>>'{population,version}' OR input_value#>>'{sourceVersions,rules}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('program',payload#>'{programState,program}','salary',payload#>'{programState,salaryCatalog}')) OR input_value#>>'{sourceVersions,novelties}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('monthly',payload->'monthly','fixed',payload#>'{fixed,export,data}')) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF jsonb_typeof(input_value->'employees') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'employeeTotals') IS DISTINCT FROM 'array' OR jsonb_typeof(input_value->'quantityPhases') IS DISTINCT FROM 'array' OR jsonb_typeof(result_value->'quantities') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF (SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId') FROM jsonb_array_elements(input_value->'employees') e) IS DISTINCT FROM(SELECT jsonb_agg(e->>'contractId' ORDER BY e->>'contractId') FROM jsonb_array_elements(payload#>'{population,employees}') e) OR result_value->'employeeCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(input_value->'employees')) OR result_value->'employeeCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(result_value->'employeeTotals')) OR result_value->'rowCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(result_value->'rows')) OR EXISTS(SELECT 1 FROM jsonb_array_elements(result_value->'rows') row_value WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(input_value->'employees') e WHERE e->>'contractId'=row_value->>'contractId')) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 -- The R2 JS reader binds totals to selected contracts, not only array length.
 IF (SELECT coalesce(jsonb_agg(x.value->>'contractId' ORDER BY x.ordinality),'[]') FROM jsonb_array_elements(result_value->'employeeTotals') WITH ORDINALITY x)
  IS DISTINCT FROM(SELECT coalesce(jsonb_agg(e->>'contractId' ORDER BY e->>'contractId' COLLATE "C"),'[]') FROM jsonb_array_elements(input_value->'employees') e)
 THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 -- Frozen capture audit: same scope and the same declared phases the capture hashed.
 IF NOT public.own_program_exact_v1(block,ARRAY['version','quantityPhasesVersion','period','liquidationType','definitionSha256','family','agreements']) OR block->>'version' IS DISTINCT FROM 'own-run-quantity-capture.v1' OR block->>'quantityPhasesVersion' IS DISTINCT FROM 'own-payroll-quantity-phases.v1' OR block->>'period' IS DISTINCT FROM body->>'period' OR block->>'liquidationType' IS DISTINCT FROM body->>'liquidationType' OR block->>'definitionSha256' IS DISTINCT FROM public.own_run_hash_v1(payload#>'{programState,program,definition,quantityPhases}') OR jsonb_typeof(block->'agreements') IS DISTINCT FROM 'array' OR jsonb_typeof(payload#>'{programState,program,definition,quantityPhases}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 -- Persisted phases are exactly the SQL lowering of the captured approved definition, ordered like the JS input.
 SELECT coalesce(jsonb_agg(x ORDER BY public.own_program_quantity_key_v1(x) COLLATE "C"),'[]') INTO expected FROM jsonb_array_elements(public.own_program_quantity_effective_v1(payload#>'{programState,program,definition}')) x;
 IF input_value->'quantityPhases' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 -- Per agreement: captured population count, declared phases and active keys for this period and type.
 SELECT coalesce(jsonb_agg(jsonb_build_object('agreementCode',a.code,'employees',a.total,'declared',(SELECT count(*) FROM jsonb_array_elements(payload#>'{programState,program,definition,quantityPhases}') q WHERE q->>'agreementCode'=a.code),'active',(SELECT coalesce(jsonb_agg(public.own_program_quantity_key_v1(q) ORDER BY public.own_program_quantity_key_v1(q) COLLATE "C"),'[]') FROM jsonb_array_elements(input_value->'quantityPhases') q WHERE q->>'agreementCode'=a.code AND public.own_program_quantity_active_v1(q,input_value->>'period',input_value->>'liquidationType'))) ORDER BY a.code COLLATE "C"),'[]') INTO expected FROM(SELECT e->>'agreementCode' AS code,count(*) AS total FROM jsonb_array_elements(input_value->'employees') e GROUP BY e->>'agreementCode') a;
 IF block->'agreements' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 -- Exactly one row per employee and active phase of its own agreement, ordered by contract and concept.
 IF result_value->'quantityCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(result_value->'quantities')) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array(e->>'contractId',q->>'code') ORDER BY e->>'contractId' COLLATE "C",q->>'code' COLLATE "C"),'[]') INTO expected FROM jsonb_array_elements(input_value->'employees') e JOIN jsonb_array_elements(input_value->'quantityPhases') q ON q->>'agreementCode'=e->>'agreementCode' AND public.own_program_quantity_active_v1(q,input_value->>'period',input_value->>'liquidationType');
 IF expected IS DISTINCT FROM(SELECT coalesce(jsonb_agg(jsonb_build_array(x.value->>'contractId',x.value->>'conceptCode') ORDER BY x.ordinality),'[]') FROM jsonb_array_elements(result_value->'quantities') WITH ORDINALITY x) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 -- Each row: employee identity, phase identity/unit/stage/rounding/source/use, static dependencies, canonical rationals and stage arithmetic.
 SELECT count(*),count(*) FILTER(WHERE public.own_run_quantity_row_v1(qx.row_value,e.employee,p.phase,p.dependencies) IS NOT TRUE) INTO joined,bad
 FROM jsonb_array_elements(result_value->'quantities') qx(row_value)
 JOIN jsonb_array_elements(input_value->'employees') e(employee) ON e.employee->>'contractId'=qx.row_value->>'contractId'
 JOIN(SELECT ph.phase,public.own_run_quantity_dependencies_v1(ph.phase->'expression') AS dependencies FROM jsonb_array_elements(input_value->'quantityPhases') ph(phase) WHERE public.own_program_quantity_active_v1(ph.phase,input_value->>'period',input_value->>'liquidationType')) p ON p.phase->>'agreementCode'=e.employee->>'agreementCode' AND p.phase->>'code'=qx.row_value->>'conceptCode';
 IF joined IS DISTINCT FROM jsonb_array_length(result_value->'quantities')::bigint OR bad<>0 THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
END $function$;
CREATE OR REPLACE FUNCTION public.own_run_quantity_only_admit_v1(policies jsonb,row_value jsonb,family text,person jsonb,period_value text,type_value text,source_contract text,source_reference text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $quantity_only_admit$
DECLARE found jsonb;policy jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(e->'policy'),'[]') INTO found FROM jsonb_array_elements(public.own_policy_resolve_candidate_v1(policies,'quantity-only')) e
 WHERE e#>'{policy,agreementCode}'=person->'agreementCode' AND e#>'{policy,sourceCode}'=row_value->'conceptSourceId'
 AND e#>>'{policy,liquidationType}'=type_value AND e->>'validFrom'<=period_value AND coalesce(e->>'validUntil','9999-12')>=period_value;
 IF jsonb_array_length(found)=0 THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(policies) p WHERE p->'agreementCode'=person->'agreementCode' AND p->'sourceCode'=row_value->'conceptSourceId') THEN RAISE EXCEPTION 'QUANTITY_ONLY_POLICY_REQUIRED';END IF;
  RETURN NULL;
 END IF;
 IF jsonb_array_length(found)<>1 THEN RAISE EXCEPTION 'QUANTITY_ONLY_POLICY_AMBIGUOUS';END IF;
 policy:=found->0;
 IF family IS DISTINCT FROM split_part(policy->>'sourceKind','_',1) THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPATIBLE';END IF;
 IF NOT(policy->'sourceContracts' ? source_contract) THEN RAISE EXCEPTION 'QUANTITY_ONLY_SOURCE_CONTRACT_INVALID';END IF;
 IF row_value->'forced' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'QUANTITY_ONLY_FORCED_INCOMPATIBLE';END IF;
 IF row_value->'amountCents' IS DISTINCT FROM 'null'::jsonb AND row_value->'amountCents' IS DISTINCT FROM '"0"'::jsonb THEN RAISE EXCEPTION 'QUANTITY_ONLY_AMOUNT_INCOMPATIBLE';END IF;
 IF jsonb_typeof(row_value->'quantityDecimal') IS DISTINCT FROM 'string' OR coalesce(row_value->>'quantityDecimal','')!~'^-?(0|[1-9][0-9]{0,11})([.][0-9]{1,6})?$' OR row_value->>'quantityDecimal'~'^-0([.]0+)?$' THEN RAISE EXCEPTION 'QUANTITY_ONLY_QUANTITY_REQUIRED';END IF;
 IF family='monthly' AND row_value->'adjustmentMonth' IS DISTINCT FROM 'null'::jsonb AND row_value->>'adjustmentMonth' IS DISTINCT FROM period_value||'-01' THEN RAISE EXCEPTION 'QUANTITY_ONLY_ORIGIN_INCOMPATIBLE';END IF;
 IF public.own_program_text_v1(to_jsonb(source_reference),3,180) IS NOT TRUE THEN RAISE EXCEPTION 'QUANTITY_ONLY_IDENTITY_REQUIRED';END IF;
 RETURN jsonb_build_object('sourceKind',family,'contractId',person->'contractId','concept',row_value->'conceptSourceId','quantity',row_value->'quantityDecimal','amount',row_value->'amountCents','reference',source_reference);
END $quantity_only_admit$;
ALTER FUNCTION public.own_run_quantity_only_admit_v1(jsonb,jsonb,text,jsonb,text,text,text,text) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_quantity_only_admit_v1(jsonb,jsonb,text,jsonb,text,text,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_run_quantity_only_expected_inputs_v1(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $quantity_only_expected$
DECLARE programme jsonb:=payload#>'{programState,program,definition}';options jsonb;policies jsonb;
 period_value text:=payload->>'period';type_value text:=payload->>'liquidationType';population jsonb:=payload->'population';monthly jsonb:=payload->'monthly';
 batches jsonb;batch jsonb;row_value jsonb;values_value jsonb;person jsonb;subject jsonb;admission jsonb;admissions jsonb:='[]';entries jsonb;entry jsonb;policy jsonb;binding jsonb;matches jsonb;expected_inputs jsonb:='[]';family text;total_value numeric;reference_value text;
 list_value jsonb:=payload#>'{fixed,list,data}';export_value jsonb:=payload#>'{fixed,export,data}';expected jsonb;previous jsonb;actor jsonb;actors jsonb;rows_hash text;ids text[]:='{}';n integer;selected integer;review_count integer;
BEGIN
 IF NOT coalesce(programme ?| ARRAY['quantityOnlyInputsVersion','quantityOnlyInputPolicies'],false) THEN RETURN NULL;END IF;
 options:=public.own_program_quantity_only_options_v1(programme);policies:=options->'quantityOnlyInputPolicies';
 IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR coalesce(type_value IN('monthly','first_fortnight','sac','vacation','supplementary','final','other'),false) IS NOT TRUE
 OR population->'complete' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(population->'employees') IS DISTINCT FROM 'array' OR jsonb_array_length(population->'employees') NOT BETWEEN 1 AND 10000
 OR public.own_program_exact_v1(monthly,ARRAY['complete','batches','nativeBatches']) IS NOT TRUE OR monthly->'complete' IS DISTINCT FROM 'true'::jsonb
 OR jsonb_typeof(monthly->'batches') IS DISTINCT FROM 'array' OR jsonb_typeof(monthly->'nativeBatches') IS DISTINCT FROM 'array'
 OR jsonb_array_length(monthly->'batches')>10000 OR jsonb_array_length(monthly->'nativeBatches')>1000
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(population->'employees') e GROUP BY e->'contractId' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPLETE';END IF;
 FOR batch IN SELECT value FROM jsonb_array_elements(monthly->'batches') LOOP
  IF batch->>'id'=ANY(ids) OR batch->>'contractVersion' IS DISTINCT FROM 'payroll-novelty-batch.v2' OR batch->>'status' IS DISTINCT FROM 'approved' OR batch->'exportable' IS DISTINCT FROM 'true'::jsonb
  OR batch->>'periodMonth' IS DISTINCT FROM period_value||'-01' OR batch->>'payrollType' IS DISTINCT FROM type_value OR type_value<>'monthly'
  OR batch->>'sourceMode' IS DISTINCT FROM 'individual' OR batch->'rowCount' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(batch->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(batch->'rows')<>1
  OR batch->'grhMutation' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollCalculated' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollPosted' IS DISTINCT FROM 'false'::jsonb
  THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPLETE';END IF;
  ids:=array_append(ids,batch->>'id');
  FOR row_value IN SELECT value FROM jsonb_array_elements(batch->'rows') LOOP
   SELECT count(*),jsonb_agg(e)->0 INTO n,person FROM jsonb_array_elements(population->'employees') e WHERE e->'contractId'=row_value->'employmentContractId';subject:=row_value->'subject';
   IF n<>1 OR row_value->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR subject->'contractId' IS DISTINCT FROM person->'contractId' OR subject->'legajo' IS DISTINCT FROM person->'employeeNumber' OR subject->'identityToken' IS DISTINCT FROM person->'identityToken'
   OR jsonb_typeof(row_value->'issues') IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(row_value->'issues') issue WHERE issue IS DISTINCT FROM '{"code":"concept_not_observed","severity":"warning","blocking":false,"field":"conceptSourceId","details":{"basis":"published_grh_observation"}}'::jsonb)
   THEN RAISE EXCEPTION 'QUANTITY_ONLY_IDENTITY_REQUIRED';END IF;
   -- Validate the imported values through the existing strict native value
   -- grammar. The imported row itself remains untouched and is hashed below.
   values_value:=(row_value-ARRAY['employmentContractId','issues','subject','identityCurrent'])||jsonb_build_object('contractId',person->'contractId','identityToken',subject->'identityToken');
   IF public.payroll_novelty_native_rows_valid_v2(jsonb_build_array(values_value),'individual') IS NOT TRUE OR (row_value->>'adjustmentMonth' IS NOT NULL AND row_value->>'adjustmentMonth'>period_value||'-01') THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPLETE';END IF;
   admission:=public.own_run_quantity_only_admit_v1(policies,row_value,'monthly',person,period_value,type_value,batch->>'contractVersion',(batch->>'id')||':'||(row_value->>'rowOrdinal'));
   IF admission IS NOT NULL THEN admissions:=admissions||jsonb_build_array(admission);END IF;
  END LOOP;
 END LOOP;
 FOR batch IN SELECT value FROM jsonb_array_elements(monthly->'nativeBatches') LOOP
  IF public.own_program_exact_v1(batch,ARRAY['version','id','revision','status','periodMonth','payrollType','rows','rowCount','rowsSha256','preparedBy','decidedBy','approvals','grhMutation','payrollCalculated','payrollPosted']) IS NOT TRUE
  OR batch->>'id'=ANY(ids) OR batch->>'version' IS DISTINCT FROM 'own-payroll-novelty-batch.v1' OR batch->>'status' IS DISTINCT FROM 'approved'
  OR batch->>'periodMonth' IS DISTINCT FROM period_value||'-01' OR batch->>'payrollType' IS DISTINCT FROM type_value
  OR jsonb_typeof(batch->'rows') IS DISTINCT FROM 'array' OR batch->'rowCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(batch->'rows'))
  OR batch->'grhMutation' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollCalculated' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollPosted' IS DISTINCT FROM 'false'::jsonb
  OR jsonb_typeof(batch->'approvals') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPLETE';END IF;
  ids:=array_append(ids,batch->>'id');review_count:=jsonb_array_length(batch->'approvals');
  IF review_count<1 OR review_count>(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(batch->'rows') r WHERE r#>'{values,forced}'='true'::jsonb) THEN 2 ELSE 1 END) OR batch->'decidedBy' IS DISTINCT FROM (batch->'approvals')->(review_count-1) THEN RAISE EXCEPTION 'QUANTITY_ONLY_REVIEW_REQUIRED';END IF;
  actors:=jsonb_build_array(batch->'preparedBy')||(batch->'approvals');
  FOR actor IN SELECT value FROM jsonb_array_elements(actors) LOOP
   IF public.own_program_exact_v1(actor,ARRAY['membershipId','personId']) IS NOT TRUE OR coalesce(actor->>'membershipId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR coalesce(actor->>'personId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'QUANTITY_ONLY_REVIEW_REQUIRED';END IF;
  END LOOP;
  IF (SELECT count(DISTINCT a->>'membershipId') FROM jsonb_array_elements(actors) a)<>review_count+1 OR (SELECT count(DISTINCT a->>'personId') FROM jsonb_array_elements(actors) a)<>review_count+1 THEN RAISE EXCEPTION 'QUANTITY_ONLY_REVIEW_REQUIRED';END IF;
  SELECT public.own_run_hash_v1(jsonb_agg(jsonb_build_object('values',r->'values','subject',r->'subject') ORDER BY ordinal)) INTO rows_hash FROM jsonb_array_elements(batch->'rows') WITH ORDINALITY x(r,ordinal);
  IF batch->>'rowsSha256' IS DISTINCT FROM rows_hash THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPLETE';END IF;
  PERFORM public.own_novelty_rows_v1((SELECT jsonb_agg(r->'values' ORDER BY ordinal) FROM jsonb_array_elements(batch->'rows') WITH ORDINALITY x(r,ordinal)),(period_value||'-01')::date);
  selected:=0;
  FOR row_value IN SELECT value FROM jsonb_array_elements(batch->'rows') LOOP
   values_value:=row_value->'values';subject:=row_value->'subject';
   IF public.own_program_exact_v1(row_value,ARRAY['values','subject','identityCurrent']) IS NOT TRUE OR values_value->'contractId' IS DISTINCT FROM subject->'contractId' OR values_value->'legajo' IS DISTINCT FROM subject->'legajo' OR values_value->'identityToken' IS DISTINCT FROM subject->'identityToken' THEN RAISE EXCEPTION 'QUANTITY_ONLY_IDENTITY_REQUIRED';END IF;
   SELECT count(*),jsonb_agg(e)->0 INTO n,person FROM jsonb_array_elements(population->'employees') e WHERE e->'contractId'=values_value->'contractId';
   IF n=0 THEN CONTINUE;END IF;selected:=selected+1;
   IF n<>1 OR row_value->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR subject->'contractId' IS DISTINCT FROM person->'contractId' OR subject->'legajo' IS DISTINCT FROM person->'employeeNumber' OR subject->'identityToken' IS DISTINCT FROM person->'identityToken' THEN RAISE EXCEPTION 'QUANTITY_ONLY_IDENTITY_REQUIRED';END IF;
   admission:=public.own_run_quantity_only_admit_v1(policies,values_value,'monthly',person,period_value,type_value,batch->>'version',(batch->>'id')||':'||(values_value->>'rowOrdinal'));
   IF admission IS NOT NULL THEN admissions:=admissions||jsonb_build_array(admission);END IF;
  END LOOP;
  IF selected=0 THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPLETE';END IF;
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
 THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPLETE';END IF;
 SELECT coalesce(jsonb_agg(r),'[]') INTO expected FROM jsonb_array_elements(list_value->'rows') r WHERE r#>>'{approved,operation}'='set' AND r#>>'{approved,values,validFrom}'<=to_char((period_value||'-01')::date+interval '1 month'-interval '1 day','YYYY-MM-DD') AND (r#>'{approved,values,validTo}'='null'::jsonb OR r#>>'{approved,values,validTo}'>=period_value||'-01');
 IF jsonb_array_length(expected)<>jsonb_array_length(export_value->'rows') THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPLETE';END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(export_value->'rows') LOOP
  SELECT count(*),jsonb_agg(r)->0 INTO n,previous FROM jsonb_array_elements(expected) r WHERE r->'id'=row_value->'recordId';
  IF n<>1 OR previous->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR previous->'version' IS DISTINCT FROM row_value->'version' OR previous#>'{approved,id}' IS DISTINCT FROM row_value->'proposalId'
  OR previous->'subject' IS DISTINCT FROM row_value->'subject' OR previous#>'{approved,values}' IS DISTINCT FROM row_value->'values' OR previous#>>'{approved,review,decision}' IS DISTINCT FROM 'approve'
  THEN RAISE EXCEPTION 'QUANTITY_ONLY_CHANNEL_INCOMPLETE';END IF;
  subject:=row_value->'subject';values_value:=row_value->'values';
  SELECT count(*),jsonb_agg(e)->0 INTO n,person FROM jsonb_array_elements(population->'employees') e WHERE e->'contractId'=subject->'contractId';
  IF n<>1 OR subject->'legajo' IS DISTINCT FROM person->'employeeNumber' OR subject->'identityToken' IS DISTINCT FROM person->'identityToken' OR values_value->>'payrollType' IS DISTINCT FROM type_value THEN RAISE EXCEPTION 'QUANTITY_ONLY_IDENTITY_REQUIRED';END IF;
  admission:=public.own_run_quantity_only_admit_v1(policies,values_value,'fixed',person,period_value,type_value,export_value->>'version',(row_value->>'recordId')||':'||(row_value->>'proposalId'));
  IF admission IS NOT NULL THEN admissions:=admissions||jsonb_build_array(admission);END IF;
 END LOOP;
 IF jsonb_array_length(admissions)>100000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(admissions) a GROUP BY a->'reference' HAVING count(*)<>1) THEN RAISE EXCEPTION 'QUANTITY_ONLY_ROW_DUPLICATE';END IF;
 entries:=public.own_policy_resolve_candidate_v1(policies,'quantity-only');
 FOR person IN SELECT value FROM jsonb_array_elements(population->'employees') LOOP
  FOR entry IN SELECT value FROM jsonb_array_elements(entries) e WHERE e#>'{policy,agreementCode}'=person->'agreementCode' AND e#>>'{policy,liquidationType}'=type_value AND e->>'validFrom'<=period_value AND coalesce(e->>'validUntil','9999-12')>=period_value LOOP
   policy:=entry->'policy';family:=split_part(policy->>'sourceKind','_',1);
   SELECT b INTO binding FROM jsonb_array_elements(programme->'bindings') b WHERE b->'agreementCode'=person->'agreementCode' AND b->'key'=policy->'quantityInputKey';
   SELECT coalesce(jsonb_agg(a ORDER BY ordinal),'[]'),coalesce(sum((a->>'quantity')::numeric),0) INTO matches,total_value FROM jsonb_array_elements(admissions) WITH ORDINALITY x(a,ordinal) WHERE a->'contractId'=person->'contractId' AND a->'concept'=policy->'sourceCode' AND a->>'sourceKind'=family;
   reference_value:=(CASE family WHEN 'monthly' THEN 'Novedades:' ELSE 'Fijas:' END)||public.own_run_hash_v1(CASE WHEN jsonb_array_length(matches)>0 THEN matches ELSE jsonb_build_object('complete',true,'period',period_value,'liquidationType',type_value,'contractId',person->'contractId','binding',binding) END);
   expected_inputs:=expected_inputs||jsonb_build_array(jsonb_build_object('contractId',person->'contractId','agreementCode',person->'agreementCode','key',policy->'quantityInputKey','unit',policy->'quantityUnit','value',to_char(total_value,'FM'||repeat('9',60)||'0.00000000'),'sourceReference',reference_value));
  END LOOP;
 END LOOP;
 RETURN expected_inputs;
END $quantity_only_expected$;
ALTER FUNCTION public.own_run_quantity_only_expected_inputs_v1(jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_quantity_only_expected_inputs_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE OR REPLACE FUNCTION public.own_run_quantity_only_verify_v1(payload jsonb,input_value jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $quantity_only_verify$
DECLARE expected jsonb;row_value jsonb;employee jsonb;input_row jsonb;n integer;
BEGIN
 expected:=public.own_run_quantity_only_expected_inputs_v1(payload);
 IF expected IS NULL THEN RETURN;END IF;
 IF input_value->'period' IS DISTINCT FROM payload->'period' OR input_value->'liquidationType' IS DISTINCT FROM payload->'liquidationType'
 OR input_value#>>'{sourceVersions,rules}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('program',payload#>'{programState,program}','salary',payload#>'{programState,salaryCatalog}'))
 OR input_value#>>'{sourceVersions,novelties}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('monthly',payload->'monthly','fixed',payload#>'{fixed,export,data}'))
 THEN RAISE EXCEPTION 'QUANTITY_ONLY_CAPTURE_INVALID';END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(expected) LOOP
  SELECT count(*),jsonb_agg(e)->0 INTO n,employee FROM jsonb_array_elements(input_value->'employees') e WHERE e->'contractId'=row_value->'contractId';
  IF n<>1 OR employee->'agreementCode' IS DISTINCT FROM row_value->'agreementCode' THEN RAISE EXCEPTION 'QUANTITY_ONLY_INPUT_CHANGED';END IF;
  SELECT count(*),jsonb_agg(i)->0 INTO n,input_row FROM jsonb_array_elements(employee->'inputs') i WHERE i->'key'=row_value->'key';
  IF n<>1 OR input_row->'unit' IS DISTINCT FROM row_value->'unit' OR input_row->'value' IS DISTINCT FROM row_value->'value' OR input_row->'sourceReference' IS DISTINCT FROM row_value->'sourceReference' THEN RAISE EXCEPTION 'QUANTITY_ONLY_INPUT_CHANGED';END IF;
 END LOOP;
END $quantity_only_verify$;
ALTER FUNCTION public.own_run_quantity_only_verify_v1(jsonb,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_quantity_only_verify_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
COMMIT;
