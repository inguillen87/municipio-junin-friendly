BEGIN;
-- Migration 232 composed on frozen 20ed + 231. No data or IAM mutation.
DO $optional_scale_preimage$ BEGIN
 IF to_regprocedure('public.own_run_optional_scale_catalogue_v1(uuid,uuid,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'OPTIONAL_SCALE_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.own_run_optional_scale_expected_inputs_v1(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'OPTIONAL_SCALE_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.own_run_optional_scale_input_verify_v1(jsonb,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'OPTIONAL_SCALE_OBJECT_CONFLICT';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.municipal_owner_program_command_core_v1(jsonb,jsonb,uuid,text,jsonb)')) IS DISTINCT FROM 'f71a26c1a90225f81586c0a59ec33a64e44c5e6219a9e1aed1920c585b3d0675' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.municipal_owner_program_command_core_v1(jsonb,jsonb,uuid,text,jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_definition_v1(jsonb,jsonb)')) IS DISTINCT FROM '2f6f6a98417429f43b3393cd99531283e0a25ddcf4ed5d4d889a8a93a98de4d2' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.own_program_definition_v1(jsonb,jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_quantity_definition_v1(jsonb,jsonb)')) IS DISTINCT FROM '119ad1e4462e13476925e86b46a890fb8e17056284cc0caa5e63bf71d74f8a18' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.own_program_quantity_definition_v1(jsonb,jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_run_capture_v1(jsonb,jsonb,uuid,text)')) IS DISTINCT FROM '122eb551118285ecfb618dfd1b6a0badd24b9b7fd295b90c2221cdf08ff69b4b' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.own_run_capture_v1(jsonb,jsonb,uuid,text)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_run_complete_full_v1(jsonb,uuid,jsonb,jsonb,text)')) IS DISTINCT FROM '2e947960e37f25baedf3d93c75831cc665572f4ec60932ce0ebba273995fc474' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.own_run_complete_full_v1(jsonb,uuid,jsonb,jsonb,text)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_run_complete_quantity_full_v1(jsonb,uuid,jsonb,jsonb,text)')) IS DISTINCT FROM 'ed6b476b7b75211de7e6c14a610130650e54fe44ed34ce7915b93ea3c5d4ed52' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.own_run_complete_quantity_full_v1(jsonb,uuid,jsonb,jsonb,text)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_run_complete_quantity_v1(jsonb,uuid,jsonb,jsonb,text)')) IS DISTINCT FROM '16f97c0f4c349b268c41f270837104ab8084e1b343c4e72deb0824e62b53f7cf' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.own_run_complete_quantity_v1(jsonb,uuid,jsonb,jsonb,text)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_run_complete_v1(jsonb,uuid,jsonb,jsonb,text)')) IS DISTINCT FROM 'bcaa17452782989b7fb2a8b0e31128f12eb5bd9e1935cb2665447be3228dd691' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.own_run_complete_v1(jsonb,uuid,jsonb,jsonb,text)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_run_official_capture_check_v1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)')) IS DISTINCT FROM '8cee8e0c9f8358030ff5e9a4d884f0d5965800b5065cabc7d0533bf565681e47' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.own_run_official_capture_check_v1(jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_run_quantity_check_v1(jsonb,jsonb,jsonb,jsonb)')) IS DISTINCT FROM '523365bea14255f8af2b9c583aeb3a91e1b304fd41b58db725c7d09bbf1beec7' THEN RAISE EXCEPTION 'OPTIONAL_SCALE_PREIMAGE_CHANGED: public.own_run_quantity_check_v1(jsonb,jsonb,jsonb,jsonb)';END IF;
END $optional_scale_preimage$;

CREATE FUNCTION public.own_run_optional_scale_catalogue_v1(tenant uuid,binding uuid,catalogue jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE approval public.native_salary_event;proposal_body jsonb;items jsonb;catalogue_version text;revision_value integer;
BEGIN
 IF tenant IS NULL OR binding IS NULL OR public.own_program_exact_v1(catalogue,ARRAY['revision','items','version']) IS NOT TRUE
  OR jsonb_typeof(catalogue->'revision') IS DISTINCT FROM 'number' OR catalogue->>'revision'!~'^(?:[1-9][0-9]{0,2}|1000)$'
  OR jsonb_typeof(catalogue->'version') IS DISTINCT FROM 'string' OR catalogue->>'version'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(catalogue->'items') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_CAPTURE_INVALID';END IF;
 revision_value:=(catalogue->>'revision')::integer;
 -- A capture is tied to this immutable historical approval, never latest.
 SELECT * INTO approval FROM public.native_salary_event
  WHERE tenant_id=tenant AND source_binding_id=binding AND command='approve' AND revision=revision_value;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_CAPTURE_INVALID';END IF;
 SELECT body INTO proposal_body FROM public.native_salary_event
  WHERE id=approval.proposal_id AND tenant_id=tenant AND source_binding_id=binding AND command='propose';
 IF NOT FOUND THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_CAPTURE_INVALID';END IF;
 items:=proposal_body->'items';
 IF jsonb_typeof(items) IS DISTINCT FROM 'array' OR jsonb_array_length(items) NOT BETWEEN 1 AND 10000
  OR items IS DISTINCT FROM catalogue->'items' OR octet_length(items::text)>4194304
 THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_CAPTURE_INVALID';END IF;
 PERFORM public.native_salary_items_v1(items);
 catalogue_version:=encode(public.digest(jsonb_build_array('native-salary-catalog.v1',tenant::text,binding::text,revision_value,approval.id,items)::text,'sha256'),'hex');
 IF catalogue_version IS DISTINCT FROM catalogue->>'version' THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_CAPTURE_INVALID';END IF;
 RETURN jsonb_build_object('version','own-payroll-optional-scale-catalogue.v1','complete',true,
  'tenantId',tenant::text,'sourceBindingId',binding::text,'revision',revision_value,'approvalId',approval.id,'proposalId',approval.proposal_id,
  'catalogueVersion',catalogue_version,'itemsSha256',public.own_run_hash_v1(items),'itemCount',jsonb_array_length(items));
END $function$;
ALTER FUNCTION public.own_run_optional_scale_catalogue_v1(uuid,uuid,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_optional_scale_catalogue_v1(uuid,uuid,jsonb) FROM PUBLIC,municontrol_actions_runtime_app,cloud_admin;
GRANT EXECUTE ON FUNCTION public.own_run_optional_scale_catalogue_v1(uuid,uuid,jsonb) TO neondb_owner;

CREATE FUNCTION public.own_run_optional_scale_expected_inputs_v1(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE program jsonb:=payload#>'{programState,program,definition}';catalogue jsonb:=payload#>'{programState,salaryCatalog}';
 proof jsonb:=payload#>'{sourceInventory,optionalScales}';employees jsonb:=payload#>'{population,employees}';
 period_value text:=payload->>'period';liquidation_type text:=payload->>'liquidationType';
 active_bindings jsonb;expected jsonb:='[]';inputs jsonb;e jsonb;b jsonb;rows_found jsonb;row_value jsonb;amount_value text;evidence jsonb;
BEGIN
 IF program->>'optionalScalesVersion' IS DISTINCT FROM 'own-payroll-optional-scales.v1' THEN
  IF proof IS NOT NULL THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_CAPTURE_INVALID';END IF;RETURN '[]';
 END IF;
 IF program->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2'
  OR public.own_program_exact_v1(proof,ARRAY['version','complete','tenantId','sourceBindingId','revision','approvalId','proposalId','catalogueVersion','itemsSha256','itemCount']) IS NOT TRUE
  OR jsonb_typeof(proof->'tenantId') IS DISTINCT FROM 'string' OR proof->>'tenantId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(proof->'sourceBindingId') IS DISTINCT FROM 'string' OR proof->>'sourceBindingId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(payload#>'{programState,program,revision}') IS DISTINCT FROM 'number'
  OR (payload#>>'{programState,program,revision}')::integer<1
  OR payload#>>'{programState,program,salaryVersion}' IS DISTINCT FROM catalogue->>'version'
  OR jsonb_typeof(employees) IS DISTINCT FROM 'array' OR payload#>'{population,complete}' IS DISTINCT FROM 'true'::jsonb
  OR period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
  OR liquidation_type IS NULL OR liquidation_type NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other')
 THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_CAPTURE_INVALID';END IF;
 IF proof IS DISTINCT FROM public.own_run_optional_scale_catalogue_v1((proof->>'tenantId')::uuid,(proof->>'sourceBindingId')::uuid,catalogue)
  OR jsonb_array_length(employees) NOT BETWEEN 1 AND 10000
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(employees) item GROUP BY item->>'contractId' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_CAPTURE_INVALID';END IF;
 SELECT coalesce(jsonb_agg(bound ORDER BY bound->>'agreementCode' COLLATE "C",bound->>'key' COLLATE "C"),'[]') INTO active_bindings
 FROM jsonb_array_elements(program->'bindings') bound
 WHERE bound->>'sourceKind'='optional_scale' AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(public.own_participation_rules_v1(program)) rule
  CROSS JOIN LATERAL jsonb_array_elements(public.own_program_node_v2(rule->'expression')->'inputs') node
  WHERE rule->>'agreementCode'=bound->>'agreementCode' AND rule->>'validFrom'<=period_value
   AND coalesce(rule->>'validUntil','9999-12')>=period_value AND rule->'liquidationTypes' ? liquidation_type AND node->>'key'=bound->>'key');
 FOR e IN SELECT item FROM jsonb_array_elements(employees) item ORDER BY item->>'contractId' COLLATE "C" LOOP
  IF jsonb_typeof(e->'contractId') IS DISTINCT FROM 'string' OR e->>'contractId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
   OR jsonb_typeof(e->'identityToken') IS DISTINCT FROM 'string' OR e->>'identityToken'!~'^[a-f0-9]{64}$'
   OR e->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR jsonb_typeof(e->'agreementCode') IS DISTINCT FROM 'string' OR e->>'agreementCode'!~'^[0-9]{1,9}$'
   OR jsonb_typeof(e->'categoryCode') IS DISTINCT FROM 'string' OR e->>'categoryCode'!~'^[0-9]{1,9}$'
  THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_INPUT_INVALID';END IF;
  inputs:='[]';
  FOR b IN SELECT item FROM jsonb_array_elements(active_bindings) item WHERE item->>'agreementCode'=e->>'agreementCode' ORDER BY item->>'key' COLLATE "C" LOOP
   IF b->>'unit' IS DISTINCT FROM 'money' OR b->>'combine' IS DISTINCT FROM 'single' OR b->>'onMissing' IS DISTINCT FROM 'zero'
    OR jsonb_typeof(b->'sourceCode') IS DISTINCT FROM 'string' OR b->>'sourceCode'!~'^[0-9]{1,9}$'
   THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_INPUT_INVALID';END IF;
   SELECT coalesce(jsonb_agg(item),'[]') INTO rows_found FROM jsonb_array_elements(catalogue->'items') item
    WHERE item->>'kind'='scale' AND item->'active'='true'::jsonb AND item->>'agreementCode'=e->>'agreementCode'
     AND item->>'categoryCode'=e->>'categoryCode' AND item->>'code'=b->>'sourceCode'
     AND item->>'validFrom'<=period_value AND coalesce(item->>'validUntil','9999-12')>=period_value;
   IF jsonb_array_length(rows_found)>1 THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_INPUT_INVALID';END IF;
   row_value:=rows_found->0;
   IF row_value IS NOT NULL AND(row_value->'value' IS NULL OR row_value->'value'='null'::jsonb OR row_value->>'unit' IS DISTINCT FROM 'money')
   THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_INPUT_INVALID';END IF;
   amount_value:=(CASE WHEN row_value IS NULL THEN 0 ELSE (row_value->>'value')::numeric END)::numeric(30,8)::text;
   evidence:=jsonb_build_object('version','own-payroll-optional-scale-resolution.v1','catalogueVersion',proof->>'catalogueVersion','approvalId',proof->>'approvalId',
    'itemsSha256',proof->>'itemsSha256','itemCount',proof->'itemCount','period',period_value,'contractId',e->>'contractId','identityToken',e->>'identityToken',
    'agreementCode',e->>'agreementCode','categoryCode',e->>'categoryCode','sourceCode',b->>'sourceCode',
    'status',CASE WHEN row_value IS NULL THEN 'not_configured' ELSE 'configured' END,
    'rowKey',CASE WHEN row_value IS NULL THEN NULL ELSE public.native_salary_row_key_v1(row_value) END,'value',amount_value);
   inputs:=inputs||jsonb_build_array(jsonb_build_object('key',b->>'key','unit','money','value',amount_value,'sourceReference','Escala opcional:'||public.own_run_hash_v1(evidence)));
  END LOOP;
  expected:=expected||jsonb_build_array(jsonb_build_object('contractId',e->>'contractId','employeeNumber',e->>'employeeNumber','agreementCode',e->>'agreementCode','departmentCode',e->>'departmentCode','inputs',inputs));
 END LOOP;
 RETURN expected;
END $function$;
ALTER FUNCTION public.own_run_optional_scale_expected_inputs_v1(jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_optional_scale_expected_inputs_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app,cloud_admin;
GRANT EXECUTE ON FUNCTION public.own_run_optional_scale_expected_inputs_v1(jsonb) TO neondb_owner;

CREATE FUNCTION public.own_run_optional_scale_input_verify_v1(payload jsonb,input_value jsonb) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE expected jsonb;wanted jsonb;actual jsonb;values_found jsonb;program jsonb:=payload#>'{programState,program,definition}';
BEGIN
 expected:=public.own_run_optional_scale_expected_inputs_v1(payload);
 IF program->>'optionalScalesVersion' IS DISTINCT FROM 'own-payroll-optional-scales.v1' THEN RETURN;END IF;
 IF input_value->'period' IS DISTINCT FROM payload->'period' OR input_value->'liquidationType' IS DISTINCT FROM payload->'liquidationType'
  OR jsonb_typeof(input_value->'employees') IS DISTINCT FROM 'array' OR jsonb_array_length(input_value->'employees')<>jsonb_array_length(expected)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(input_value->'employees') item GROUP BY item->>'contractId' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_INPUT_INVALID';END IF;
 FOR wanted IN SELECT value FROM jsonb_array_elements(expected) LOOP
  SELECT item INTO actual FROM jsonb_array_elements(input_value->'employees') item WHERE item->>'contractId'=wanted->>'contractId';
  IF NOT FOUND OR actual-'inputs' IS DISTINCT FROM wanted-'inputs' OR jsonb_typeof(actual->'inputs') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_INPUT_INVALID';END IF;
  SELECT coalesce(jsonb_agg(item ORDER BY item->>'key' COLLATE "C"),'[]') INTO values_found
   FROM jsonb_array_elements(actual->'inputs') item WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(program->'bindings') bound
    WHERE bound->>'sourceKind'='optional_scale' AND bound->>'agreementCode'=wanted->>'agreementCode' AND bound->>'key'=item->>'key');
  IF values_found IS DISTINCT FROM wanted->'inputs' THEN RAISE EXCEPTION 'OWN_RUN_OPTIONAL_SCALE_INPUT_INVALID';END IF;
 END LOOP;
END $function$;
ALTER FUNCTION public.own_run_optional_scale_input_verify_v1(jsonb,jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_run_optional_scale_input_verify_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app,cloud_admin;
GRANT EXECUTE ON FUNCTION public.own_run_optional_scale_input_verify_v1(jsonb,jsonb) TO neondb_owner;

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
  definition:=public.own_program_definition_composed_v1(body->'program',catalog->'items');IF current_program#>>'{definition,optionalScalesVersion}'='own-payroll-optional-scales.v1' AND definition->>'optionalScalesVersion' IS DISTINCT FROM 'own-payroll-optional-scales.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;PERFORM public.own_program_family_tariff_history_candidate_v2(current_program->'definition',definition);PERFORM public.own_program_source_coverage_history_v1(current_program->'definition',definition);PERFORM public.own_program_row_emission_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_monthly_forced_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_declared_adjustments_history_v1(current_program->'definition',definition);IF definition ? 'quantityPhasesVersion' OR definition ? 'officialTotalsVersion' OR definition ? 'familyTariffsVersion' OR definition ? 'rowEmissionVersion' OR definition ? 'rowEmissionPolicies' OR definition ? 'monthlyForcedAmountsVersion' OR definition ? 'monthlyForcedAmountPolicies' THEN
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
  IF cmd='approve' THEN IF body->>'baseVersion' IS DISTINCT FROM current_program->>'version' OR body->>'salaryVersion' IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'OWN_PROGRAM_BASE_CHANGED';END IF;definition:=public.own_program_definition_composed_v1(proposal.body->'program',catalog->'items');IF current_program#>>'{definition,optionalScalesVersion}'='own-payroll-optional-scales.v1' AND definition->>'optionalScalesVersion' IS DISTINCT FROM 'own-payroll-optional-scales.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;PERFORM public.own_program_family_tariff_history_candidate_v2(current_program->'definition',definition);PERFORM public.own_program_source_coverage_history_v1(current_program->'definition',definition);PERFORM public.own_program_row_emission_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_monthly_forced_history_candidate_v1(current_program->'definition',definition);PERFORM public.own_program_declared_adjustments_history_v1(current_program->'definition',definition);IF definition ? 'quantityPhasesVersion' OR definition ? 'officialTotalsVersion' OR definition ? 'familyTariffsVersion' OR definition ? 'rowEmissionVersion' OR definition ? 'rowEmissionPolicies' OR definition ? 'monthlyForcedAmountsVersion' OR definition ? 'monthlyForcedAmountPolicies' THEN
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

CREATE OR REPLACE FUNCTION public.own_program_definition_v1(p jsonb, items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE optional_scales boolean:=coalesce(p->>'optionalScalesVersion'='own-payroll-optional-scales.v1',false);tariffs boolean:=p ? 'familyTariffsVersion' OR p ? 'familyTariffPolicies';tariff_options jsonb;family_facts boolean:=coalesce(p->>'familyPayrollFactsVersion'='own-contract-family-payroll-facts.v1',false);presence boolean:=coalesce(p->>'noveltyPresenceVersion'='own-payroll-novelty-presence.v1',false);declared_days boolean:=coalesce(p->>'monthlyDayDeclarationVersion'='own-monthly-approved-days.v1',false);monthly_days boolean:=coalesce(p->>'monthlyDaysVersion'='own-monthly-day-facts.v2',false);day_codes text[];day_rule boolean;forced boolean:=p ? 'fixedForcedAmountsVersion' OR p ? 'fixedForcedAmountsPolicy';period_context boolean:=coalesce(p->>'periodContextVersion'='own-payroll-period-context.v1',false);agreement_working boolean:=coalesce(p->>'agreementWorkingTimeVersion'='own-agreement-working-time.v1',false);conditions boolean:=coalesce(p->>'salaryConditionsVersion' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2'),false);working boolean:=coalesce(p->>'workingTimeVersion'='own-contract-working-time.v1',false);r jsonb;b jsonb;i jsonb;node jsonb;matching jsonb;period text;kind_type text;normalized jsonb;used_keys text[]:='{}';binding_id text;field text;group_row record;active_rules jsonb;done_codes text[];ready_codes text[];wave integer;checked integer:=0;work integer:=0;part boolean:=coalesce(p#>>'{periodParticipation,version}'='own-period-participation.v1',false);facts boolean:=coalesce(p->>'employmentFactsVersion'='own-salary-seniority.v1',false);ns boolean:=coalesce(p->>'namespaceVersion'='own-payroll-namespaces.v2',false);
BEGIN
 IF NOT public.own_program_exact_v1(p,(CASE WHEN ns THEN ARRAY['namespaceVersion','rules','bindings','totalsPrecision'] ELSE ARRAY['rules','bindings','totalsPrecision'] END)||CASE WHEN optional_scales THEN ARRAY['optionalScalesVersion'] ELSE ARRAY[]::text[] END||CASE WHEN presence THEN ARRAY['noveltyPresenceVersion'] ELSE ARRAY[]::text[] END||CASE WHEN facts THEN ARRAY['employmentFactsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN part THEN ARRAY['periodParticipation'] ELSE ARRAY[]::text[] END||CASE WHEN working THEN ARRAY['workingTimeVersion'] ELSE ARRAY[]::text[] END||CASE WHEN agreement_working THEN ARRAY['agreementWorkingTimeVersion'] ELSE ARRAY[]::text[] END||CASE WHEN period_context THEN ARRAY['periodContextVersion'] ELSE ARRAY[]::text[] END||CASE WHEN conditions THEN ARRAY['salaryConditionsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN family_facts THEN ARRAY['familyPayrollFactsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN tariffs THEN ARRAY['familyTariffsVersion','familyTariffPolicies'] ELSE ARRAY[]::text[] END||CASE WHEN monthly_days THEN ARRAY['monthlyDaysVersion','monthlyDaysPolicy'] ELSE ARRAY[]::text[] END||CASE WHEN declared_days THEN ARRAY['monthlyDayDeclarationVersion'] ELSE ARRAY[]::text[] END||CASE WHEN forced THEN ARRAY['fixedForcedAmountsVersion','fixedForcedAmountsPolicy'] ELSE ARRAY[]::text[] END) OR jsonb_typeof(p->'totalsPrecision') IS DISTINCT FROM 'number' OR p->>'totalsPrecision'!~'^[0-8]$' OR jsonb_typeof(p->'rules') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rules') NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p->'bindings') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'bindings')>1000 THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF presence AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF forced THEN PERFORM public.own_fixed_forced_policy_v1(p);ELSIF jsonb_path_exists(p,'$.rules[*].expression.** ? (@.op == "quantity_phase")') THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_LINEAGE_REQUIRED';END IF;
  IF part THEN IF NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;PERFORM public.own_participation_policy_v1(p);END IF;
 IF monthly_days AND (NOT ns OR NOT part OR coalesce(public.own_program_exact_v1(p->'monthlyDaysPolicy',ARRAY['version','basis','unit','recognizedDays','baseDays','partial','reference']) AND p#>>'{monthlyDaysPolicy,version}'='own-monthly-day-policy.v1' AND p#>>'{monthlyDaysPolicy,basis}'='verified_full_month' AND p#>>'{monthlyDaysPolicy,unit}'='days' AND p#>'{monthlyDaysPolicy,recognizedDays}'='"30"'::jsonb AND p#>'{monthlyDaysPolicy,baseDays}'='"30"'::jsonb AND p#>>'{monthlyDaysPolicy,partial}'='reject' AND public.own_program_text_v1(p#>'{monthlyDaysPolicy,reference}',3,180),false) IS NOT TRUE) THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_DAY_POLICY_INVALID';END IF;
 IF declared_days AND(NOT ns OR NOT part) THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_DECLARED_DAYS_POLICY_INVALID';END IF;
 IF family_facts AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF tariffs THEN tariff_options:=public.own_program_family_tariff_options_candidate_v2(p);END IF;
 IF conditions AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF period_context AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF agreement_working AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF working AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF facts AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'bindings') AS bound_limit(value) GROUP BY bound_limit.value->>'agreementCode' HAVING count(*)>512) THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(p->'bindings') LOOP
  FOREACH field IN ARRAY ARRAY['agreementCode','key','unit','sourceKind',CASE WHEN b->>'sourceKind' IN('family_fact','monthly_day_declaration_fact','monthly_day_fact','employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') THEN 'sourceField' ELSE 'sourceCode' END,'onMissing','combine','ruleReference'] LOOP IF jsonb_typeof(b->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;END LOOP;
  IF NOT public.own_program_exact_v1(b,CASE WHEN b->>'sourceKind' IN('family_fact','monthly_day_declaration_fact','monthly_day_fact','employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') THEN ARRAY['agreementCode','key','unit','sourceKind','sourceField','onMissing','combine','ruleReference'] WHEN b->>'sourceKind'='scale_reference' THEN ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference','sourceAgreementCode','sourceCategoryCode'] ELSE ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference'] END) OR b->>'agreementCode' IS NULL OR b->>'agreementCode'!~'^[0-9]{1,9}$' OR (b->>'sourceKind' NOT IN('family_fact','monthly_day_declaration_fact','monthly_day_fact','employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') AND(b->>'sourceCode' IS NULL OR b->>'sourceCode'!~'^[0-9]{1,9}$')) OR b->>'key' IS NULL OR b->>'key'!~'^[A-Za-z][A-Za-z0-9_]{0,63}$' OR coalesce(b->>'unit' IN('money','hours','minutes','days','percent','units','coefficient') OR conditions AND b->>'sourceKind' IN('salary_condition_fact','classification_fact') AND b->>'unit' IN('code','boolean') OR family_facts AND b->>'sourceKind'='family_fact' AND b->>'unit'='code',false) IS NOT TRUE OR coalesce(b->>'sourceKind' IN('optional_scale','family_tariff','parameter','auxiliary_parameter','scale','scale_reference','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount','monthly_presence','fixed_presence','family_fact','monthly_day_declaration_fact','monthly_day_fact','employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') AND(b->>'sourceKind' NOT IN('monthly_presence','fixed_presence') OR presence) AND(b->>'sourceKind'<>'monthly_day_declaration_fact' OR declared_days) AND(b->>'sourceKind'<>'monthly_day_fact' OR monthly_days) AND(b->>'sourceKind'<>'employment_fact' OR facts) AND(b->>'sourceKind'<>'period_fact' OR part) AND(b->>'sourceKind'<>'working_time_fact' OR working) AND(b->>'sourceKind'<>'agreement_time_fact' OR agreement_working) AND(b->>'sourceKind'<>'period_context_fact' OR period_context) AND(b->>'sourceKind'<>'salary_condition_fact' OR conditions) AND(b->>'sourceKind'<>'classification_fact' OR conditions) AND(b->>'sourceKind'<>'family_fact' OR family_facts) AND(b->>'sourceKind'<>'optional_scale' OR optional_scales AND ns) AND(b->>'sourceKind'<>'family_tariff' OR tariffs) AND (b->>'sourceKind'<>'auxiliary_parameter' OR ns),false) IS NOT TRUE OR coalesce(CASE WHEN b->>'sourceKind' IN('monthly_presence','fixed_presence') THEN b->>'combine'='any' ELSE b->>'combine' IN('single','sum') END,false) IS NOT TRUE OR coalesce(b->>'onMissing' IN('error','zero'),false) IS NOT TRUE OR NOT public.own_program_text_v1(b->'ruleReference',3,180) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='optional_scale' AND(b->>'unit'<>'money' OR b->>'combine'<>'single' OR b->>'onMissing'<>'zero') THEN RAISE EXCEPTION 'OWN_PROGRAM_OPTIONAL_SCALE_BINDING_INVALID';END IF;
  IF b->>'sourceKind' IN('monthly_presence','fixed_presence') AND(NOT presence OR b->>'unit'<>'coefficient' OR b->>'combine'<>'any' OR b->>'onMissing'<>'zero') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='family_fact' AND(NOT family_facts OR b->>'unit' IS DISTINCT FROM CASE b->>'sourceField' WHEN 'spouse' THEN 'units' WHEN 'children' THEN 'units' WHEN 'childrenWithDisability' THEN 'units' WHEN 'prenatal' THEN 'units' WHEN 'largeFamily' THEN 'units' WHEN 'preschool' THEN 'units' WHEN 'preschoolWithDisability' THEN 'units' WHEN 'primary' THEN 'units' WHEN 'primaryWithDisability' THEN 'units' WHEN 'secondary' THEN 'units' WHEN 'secondaryWithDisability' THEN 'units' WHEN 'dependants' THEN 'units' WHEN 'prenatalAdjustmentMonths' THEN 'units' WHEN 'tariffRegion' THEN 'code' WHEN 'semesterAverage' THEN 'money' ELSE NULL END OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='classification_fact' AND(NOT conditions OR b->>'sourceField' NOT IN('categoryCode','agreementCode') OR b->>'unit'<>'code' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='salary_condition_fact' AND(NOT conditions OR b->>'unit' IS DISTINCT FROM CASE b->>'sourceField' WHEN 'partialSeniorityYears' THEN 'units' WHEN 'titleStatus' THEN 'code' WHEN 'titleCode' THEN 'code' WHEN 'titlePercentage' THEN 'percent' WHEN 'unhealthyWork' THEN 'boolean' WHEN 'teacherPayEnabled' THEN CASE WHEN p->>'salaryConditionsVersion'='own-contract-salary-conditions.v2' THEN 'boolean' END WHEN 'housingHigherDedicationPayEnabled' THEN CASE WHEN p->>'salaryConditionsVersion'='own-contract-salary-conditions.v2' THEN 'boolean' END WHEN 'payrollMonthBaseDays' THEN CASE WHEN p->>'salaryConditionsVersion'='own-contract-salary-conditions.v2' THEN 'days' END ELSE NULL END OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='period_context_fact' AND(b->>'sourceField'<>'monthNumber' OR b->>'unit'<>'units' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='agreement_time_fact' AND(b->>'sourceField'<>'monthlyHours' OR b->>'unit'<>'hours' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='working_time_fact' AND(b->>'sourceField' NOT IN('dailyHours','monthlyHours') OR b->>'unit'<>'hours' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind' IN('monthly_day_fact','monthly_day_declaration_fact') AND(b->>'sourceField' NOT IN('recognizedDays','baseDays') OR b->>'unit'<>'days' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_DAY_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='period_fact' AND(b->>'sourceField' NOT IN('recognizedUnits','baseUnits') OR b->>'unit'<>'units' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='employment_fact' AND(b->>'sourceField' NOT IN('seniorityYears','seniorityMonths') OR b->>'unit'<>'units' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='scale_reference' AND(jsonb_typeof(b->'sourceAgreementCode') IS DISTINCT FROM 'string' OR b->>'sourceAgreementCode'!~'^[0-9]{1,9}$' OR jsonb_typeof(b->'sourceCategoryCode') IS DISTINCT FROM 'string' OR b->>'sourceCategoryCode'!~'^[0-9]{1,9}$') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind' IN('parameter','auxiliary_parameter','scale','scale_reference') AND(b->>'combine'<>'single' OR b->>'onMissing'<>'error') OR b->>'sourceKind' IN('scale','scale_reference','monthly_amount','fixed_amount') AND b->>'unit'<>'money' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'bindings') x GROUP BY x->>'agreementCode',x->>'key' HAVING count(*)>1) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_DUPLICATE';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p->'rules') LOOP
  FOREACH field IN ARRAY ARRAY['code','agreementCode','nature','unit','validFrom','ruleReference'] LOOP IF jsonb_typeof(r->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;END LOOP;
  IF jsonb_typeof(r->'validUntil') NOT IN('string','null') THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  IF NOT public.own_program_exact_v1(r,ARRAY['code','agreementCode','nature','unit','validFrom','validUntil','liquidationTypes','ruleReference','rounding','expression']) OR r->>'code' IS NULL OR r->>'code'!~'^[0-9]{1,9}$' OR r->>'agreementCode' IS NULL OR r->>'agreementCode'!~'^[0-9]{1,9}$' OR coalesce(r->>'nature' IN('remuneration','non_remuneration','deduction','employer_contribution','auxiliary'),false) IS NOT TRUE OR coalesce(r->>'unit' IN('money','hours','minutes','days','percent','units','coefficient'),false) IS NOT TRUE OR r->>'nature'<>'auxiliary' AND r->>'unit'<>'money' OR r->>'validFrom' IS NULL OR r->>'validFrom'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR (r->'validUntil'<>'null' AND(r->>'validUntil'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR r->>'validUntil'<r->>'validFrom')) OR NOT public.own_program_text_v1(r->'ruleReference',3,180) OR NOT public.own_program_rounding_v1(r->'rounding') OR jsonb_typeof(r->'liquidationTypes') IS DISTINCT FROM 'array' OR jsonb_array_length(r->'liquidationTypes') NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(r->'liquidationTypes') t WHERE jsonb_typeof(t)<>'string' OR t#>>'{}' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other')) OR (SELECT count(*)<>count(DISTINCT t) FROM jsonb_array_elements_text(r->'liquidationTypes') t) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  node:=CASE WHEN ns THEN public.own_program_node_v2(public.own_participation_expression_v1(r,p)) ELSE public.own_program_node_v1(public.own_participation_expression_v1(r,p)) END;
  IF NOT (conditions OR family_facts) AND jsonb_path_exists(r->'expression','$.** ? (@.op == "match")') THEN RAISE EXCEPTION 'OWN_PROGRAM_OPERATION_UNSUPPORTED';END IF;
  work:=work+(node->>'nodes')::integer;IF work>3000000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
  SELECT jsonb_agg(d) INTO matching FROM jsonb_array_elements(items) d WHERE d->>'active'='true' AND d->>'kind'=CASE WHEN ns AND r->>'nature'='auxiliary' THEN 'auxiliary' ELSE 'concept' END AND d->>'agreementCode'=r->>'agreementCode' AND d->>'code'=r->>'code' AND d->>'nature'=r->>'nature' AND(r->>'nature'<>'auxiliary' OR d->>'unit'=r->>'unit');
  IF NOT public.own_program_coverage_v1(matching,r->>'validFrom',r->>'validUntil') THEN RAISE EXCEPTION 'OWN_PROGRAM_DEFINITION_MISSING';END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(node->'inputs') LOOP
   SELECT x INTO b FROM jsonb_array_elements(p->'bindings') x WHERE x->>'agreementCode'=r->>'agreementCode' AND x->>'key'=i->>'key';
   IF NOT FOUND OR b->>'unit' IS DISTINCT FROM i->>'unit' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_MISSING';END IF;binding_id:=(b->>'agreementCode')||':'||(b->>'key');used_keys:=used_keys||binding_id;
   IF b->>'sourceKind'='optional_scale' AND(r->>'nature'='auxiliary' OR r->>'code' IS DISTINCT FROM b->>'sourceCode') THEN RAISE EXCEPTION 'OWN_PROGRAM_OPTIONAL_SCALE_CONSUMER_INVALID';END IF;
   IF b->>'sourceKind' NOT IN('optional_scale','family_tariff','family_fact','monthly_day_declaration_fact','monthly_day_fact','employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') THEN
   SELECT jsonb_agg(d) INTO matching FROM jsonb_array_elements(items) d WHERE d->>'active'='true' AND d->>'agreementCode'=CASE WHEN b->>'sourceKind'='scale_reference' THEN b->>'sourceAgreementCode' ELSE b->>'agreementCode' END AND(b->>'sourceKind'<>'scale_reference' OR d->>'categoryCode'=b->>'sourceCategoryCode') AND d->>'code'=b->>'sourceCode' AND d->>'kind'=CASE WHEN b->>'sourceKind' IN('scale','scale_reference') THEN 'scale' WHEN b->>'sourceKind'='auxiliary_parameter' THEN 'auxiliary' ELSE 'concept' END AND(NOT ns OR d->>'kind'<>'concept' OR d->>'nature'<>'auxiliary') AND(b->>'sourceKind' IN('scale','scale_reference','monthly_amount','fixed_amount','monthly_presence','fixed_presence') OR d->>'unit'=b->>'unit') AND(b->>'sourceKind' NOT IN('parameter','auxiliary_parameter') OR d->'value'<>'null');
   IF NOT public.own_program_coverage_v1(matching,r->>'validFrom',r->>'validUntil') THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_DEFINITION_MISSING';END IF;END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rules') WITH ORDINALITY a(value,n),jsonb_array_elements(p->'rules') WITH ORDINALITY other(value,m) WHERE a.n<other.m AND a.value->>'agreementCode'=other.value->>'agreementCode' AND a.value->>'code'=other.value->>'code' AND(NOT ns OR(a.value->>'nature'='auxiliary')=(other.value->>'nature'='auxiliary')) AND coalesce(a.value->>'validUntil','9999-12')>=other.value->>'validFrom' AND coalesce(other.value->>'validUntil','9999-12')>=a.value->>'validFrom' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(a.value->'liquidationTypes') t WHERE other.value->'liquidationTypes' ? t)) THEN RAISE EXCEPTION 'OWN_PROGRAM_OVERLAP';END IF;
 FOR group_row IN SELECT DISTINCT x->>'agreementCode' agreement,t.kind FROM jsonb_array_elements(p->'rules') x CROSS JOIN LATERAL jsonb_array_elements_text(x->'liquidationTypes') t(kind) LOOP
  kind_type:=group_row.kind;
  FOR period IN SELECT DISTINCT v FROM(SELECT x->>'validFrom' v FROM jsonb_array_elements(p->'rules') x WHERE x->>'agreementCode'=group_row.agreement AND x->'liquidationTypes' ? kind_type UNION SELECT to_char((x->>'validUntil'||'-01')::date+interval '1 month','YYYY-MM') FROM jsonb_array_elements(p->'rules') x WHERE x->>'agreementCode'=group_row.agreement AND x->'liquidationTypes' ? kind_type AND x->'validUntil'<>'null') s LOOP
   SELECT coalesce(jsonb_agg(x),'[]') INTO active_rules FROM jsonb_array_elements(p->'rules') x WHERE x->>'agreementCode'=group_row.agreement AND x->'liquidationTypes' ? kind_type AND x->>'validFrom'<=period AND coalesce(x->>'validUntil','9999-12')>=period;
   checked:=checked+jsonb_array_length(active_rules);IF checked>50000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
   done_codes:='{}';day_codes:='{}';wave:=0;
   WHILE cardinality(done_codes)<jsonb_array_length(active_rules) LOOP
    wave:=wave+1;IF wave>64 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;ready_codes:='{}';
    FOR r IN SELECT x FROM jsonb_array_elements(active_rules) x WHERE NOT((CASE WHEN ns THEN (CASE WHEN x->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(x->>'code') ELSE x->>'code' END)=ANY(done_codes)) LOOP
     node:=CASE WHEN ns THEN public.own_program_node_v2(public.own_participation_expression_v1(r,p)) ELSE public.own_program_node_v1(public.own_participation_expression_v1(r,p)) END;
     work:=work+2*(node->>'nodes')::integer;IF work>3000000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(node->'refs') c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(active_rules) target WHERE (CASE WHEN ns THEN (CASE WHEN target->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(target->>'code') ELSE target->>'code' END)=c)) THEN RAISE EXCEPTION 'OWN_PROGRAM_DEPENDENCY';END IF;
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(node->'refs') c WHERE NOT(c=ANY(done_codes))) THEN
      IF monthly_days OR declared_days THEN
       day_rule:=EXISTS(SELECT 1 FROM jsonb_array_elements(node->'inputs') inp JOIN jsonb_array_elements(p->'bindings') bound ON bound->>'agreementCode'=r->>'agreementCode' AND bound->>'key'=inp->>'key' WHERE bound->>'sourceKind' IN('monthly_day_fact','monthly_day_declaration_fact')) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(node->'refs') ref WHERE ref=ANY(day_codes));
       IF day_rule THEN
        IF kind_type<>'monthly' THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_DAY_TYPE_UNSUPPORTED';END IF;
        IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p#>'{periodParticipation,treatments}') treatment WHERE treatment->>'ruleKey'=public.own_participation_rule_key_v1(r) AND treatment->>'treatment'='declared_formula') THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_DAY_DOUBLE_FRACTION';END IF;
        day_codes:=array_append(day_codes,(CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(r->>'code'));
       END IF;
      END IF;
      IF (CASE WHEN ns THEN public.own_program_unit_v2(public.own_participation_expression_v1(r,p),active_rules,group_row.agreement,period,kind_type,ARRAY[(CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(r->>'code')]) ELSE public.own_program_unit_v1(public.own_participation_expression_v1(r,p),active_rules,group_row.agreement,period,kind_type,ARRAY[r->>'code']) END) IS DISTINCT FROM r->>'unit' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;ready_codes:=ready_codes||(CASE WHEN ns THEN (CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(r->>'code') ELSE r->>'code' END);
     END IF;
    END LOOP;
    IF cardinality(ready_codes)=0 THEN RAISE EXCEPTION 'OWN_PROGRAM_CYCLE';END IF;done_codes:=done_codes||ready_codes;
   END LOOP;
  END LOOP;
 END LOOP;
 IF monthly_days AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'bindings') bound(value) WHERE bound.value->>'sourceKind'='monthly_day_fact') THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_DAY_BINDING_INVALID';END IF;
 IF declared_days AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'bindings') bound(value) WHERE bound.value->>'sourceKind'='monthly_day_declaration_fact') THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_DECLARED_DAYS_BINDING_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'bindings') bound(value) WHERE NOT((bound.value->>'agreementCode')||':'||(bound.value->>'key')=ANY(used_keys))) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_UNUSED';END IF;
 SELECT jsonb_build_object('rules',(SELECT jsonb_agg(x ORDER BY (x->>'agreementCode') COLLATE "C",(x->>'code') COLLATE "C",(CASE WHEN ns THEN (CASE WHEN x->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(x->>'code') ELSE '' END) COLLATE "C",x->>'validFrom',(SELECT string_agg(t,',' ORDER BY t COLLATE "C") FROM jsonb_array_elements_text(x->'liquidationTypes') t) COLLATE "C") FROM jsonb_array_elements(p->'rules') x),'bindings',(SELECT coalesce(jsonb_agg(x ORDER BY (x->>'agreementCode') COLLATE "C",(x->>'key') COLLATE "C"),'[]') FROM jsonb_array_elements(p->'bindings') x),'totalsPrecision',p->'totalsPrecision') INTO normalized;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rules') rule_row(value) WHERE rule_row.value->'liquidationTypes' IS DISTINCT FROM(SELECT jsonb_agg(t ORDER BY t COLLATE "C") FROM jsonb_array_elements_text(rule_row.value->'liquidationTypes') t)) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;IF optional_scales THEN IF NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_OPTIONAL_SCALE_BINDING_INVALID';END IF;normalized:=normalized||jsonb_build_object('optionalScalesVersion','own-payroll-optional-scales.v1');END IF;IF presence THEN normalized:=normalized||jsonb_build_object('noveltyPresenceVersion','own-payroll-novelty-presence.v1');END IF;IF ns THEN normalized:=normalized||jsonb_build_object('namespaceVersion','own-payroll-namespaces.v2');END IF;IF facts THEN normalized:=normalized||jsonb_build_object('employmentFactsVersion','own-salary-seniority.v1');END IF;IF part THEN normalized:=normalized||jsonb_build_object('periodParticipation',public.own_participation_policy_v1(p));END IF;IF working THEN normalized:=normalized||jsonb_build_object('workingTimeVersion','own-contract-working-time.v1');END IF;IF agreement_working THEN normalized:=normalized||jsonb_build_object('agreementWorkingTimeVersion','own-agreement-working-time.v1');END IF;IF period_context THEN normalized:=normalized||jsonb_build_object('periodContextVersion','own-payroll-period-context.v1');END IF;IF conditions THEN normalized:=normalized||jsonb_build_object('salaryConditionsVersion',p->'salaryConditionsVersion');END IF;IF monthly_days THEN normalized:=normalized||jsonb_build_object('monthlyDaysVersion','own-monthly-day-facts.v2','monthlyDaysPolicy',p->'monthlyDaysPolicy');END IF;IF declared_days THEN normalized:=normalized||jsonb_build_object('monthlyDayDeclarationVersion','own-monthly-approved-days.v1');END IF;IF forced THEN normalized:=normalized||jsonb_build_object('fixedForcedAmountsVersion',p->'fixedForcedAmountsVersion','fixedForcedAmountsPolicy',p->'fixedForcedAmountsPolicy');END IF;IF family_facts THEN normalized:=normalized||jsonb_build_object('familyPayrollFactsVersion','own-contract-family-payroll-facts.v1');END IF;IF tariffs THEN normalized:=normalized||tariff_options;END IF;RETURN normalized;
END $function$;

CREATE OR REPLACE FUNCTION public.own_program_quantity_definition_v1(p jsonb,items jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $function$
DECLARE monetary jsonb;normalized jsonb;conditions boolean;phases jsonb:='[]';q jsonb;effective jsonb;lowered jsonb;raw_rules jsonb;rule_keys text[]:='{}';quantity_keys text[]:='{}';r jsonb;i jsonb;info jsonb;bound jsonb;matching jsonb;owner_rule jsonb;period text;kind_type text;agreement text;active_phases jsonb;active_amounts jsonb;active_norm jsonb;policy_ctx jsonb;walk_state jsonb;inactive_use_detail jsonb;checks integer:=0;work integer:=0;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR p->'quantityPhasesVersion' IS DISTINCT FROM '"own-payroll-quantity-phases.v1"'::jsonb OR p->'namespaceVersion' IS DISTINCT FROM '"own-payroll-namespaces.v2"'::jsonb
  OR jsonb_typeof(p->'quantityPhases') IS DISTINCT FROM 'array' OR (CASE WHEN jsonb_typeof(p->'quantityPhases')='array' THEN jsonb_array_length(p->'quantityPhases') ELSE 0 END) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_INVALID';END IF;
 monetary:=p-'quantityPhasesVersion'-'quantityPhases';
 conditions:=coalesce(monetary->>'salaryConditionsVersion' IN('own-contract-salary-conditions.v1','own-contract-salary-conditions.v2'),false) OR coalesce(monetary->>'familyPayrollFactsVersion'='own-contract-family-payroll-facts.v1',false);
 BEGIN
  normalized:=public.own_program_definition_v1(monetary,items);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM IS DISTINCT FROM 'OWN_PROGRAM_BINDING_UNUSED' THEN RAISE;END IF;
  normalized:=NULL;
 END;
 -- Mismo used_keys que el legacy: entradas de own_program_node_v2 sobre la expresión con participación.
 FOR r IN SELECT xr FROM jsonb_array_elements(monetary->'rules') xr LOOP
  info:=public.own_program_node_v2(public.own_participation_expression_v1(r,monetary));
  rule_keys:=rule_keys||ARRAY(SELECT (r->>'agreementCode')||':'||(xi->>'key') FROM jsonb_array_elements(info->'inputs') xi);
 END LOOP;
 IF normalized IS NULL THEN
  normalized:=public.own_program_definition_v1(jsonb_set(monetary,'{bindings}',(SELECT coalesce(jsonb_agg(y.xb ORDER BY y.o),'[]') FROM jsonb_array_elements(monetary->'bindings') WITH ORDINALITY y(xb,o) WHERE ((y.xb->>'agreementCode')||':'||(y.xb->>'key'))=ANY(rule_keys))),items);
 END IF;
 normalized:=jsonb_set(normalized,'{bindings}',(SELECT coalesce(jsonb_agg(xb ORDER BY (xb->>'agreementCode') COLLATE "C",(xb->>'key') COLLATE "C"),'[]') FROM jsonb_array_elements(monetary->'bindings') xb));
 -- Fases: forma, orden canónico, superposición y combinación prohibida.
 FOR q IN SELECT xq FROM jsonb_array_elements(p->'quantityPhases') xq LOOP
  phases:=phases||jsonb_build_array(public.own_program_quantity_phase_v1(q,conditions));
 END LOOP;
 SELECT jsonb_agg(xq ORDER BY public.own_program_quantity_key_v1(xq) COLLATE "C") INTO phases FROM jsonb_array_elements(phases) xq;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(phases) WITH ORDINALITY pa(av,ai),jsonb_array_elements(phases) WITH ORDINALITY pb(bv,bi)
   WHERE pa.ai<pb.bi AND pa.av->>'agreementCode'=pb.bv->>'agreementCode' AND pa.av->>'code'=pb.bv->>'code'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(pa.av->'liquidationTypes') xt WHERE (pb.bv->'liquidationTypes') ? xt)
   AND NOT(coalesce(pa.av->>'validUntil','9999-12')<pb.bv->>'validFrom' OR coalesce(pb.bv->>'validUntil','9999-12')<pa.av->>'validFrom')) THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_PHASE_OVERLAP';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(phases) xq WHERE xq#>>'{amountUse,kind}'='embedded' AND xq#>>'{periodTreatment,kind}'='fraction') THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_EMBED_FRACTION_UNSUPPORTED';END IF;
 normalized:=normalized||jsonb_build_object('quantityPhasesVersion','own-payroll-quantity-phases.v1','quantityPhases',phases);
 effective:=public.own_program_quantity_effective_v1(normalized);
 lowered:=public.own_participation_rules_v1(normalized);
 raw_rules:=normalized->'rules';
 -- Revisión por cada segmento de vigencia × tipo × convenio con cantidades.
 FOR period IN SELECT s.xm FROM(
   SELECT xr->>'validFrom' AS xm FROM jsonb_array_elements(lowered) xr
   UNION SELECT to_char(((xr->>'validUntil')||'-01')::date+interval '1 month','YYYY-MM') FROM jsonb_array_elements(lowered) xr WHERE jsonb_typeof(xr->'validUntil')='string'
   UNION SELECT xq->>'validFrom' FROM jsonb_array_elements(effective) xq
   UNION SELECT to_char(((xq->>'validUntil')||'-01')::date+interval '1 month','YYYY-MM') FROM jsonb_array_elements(effective) xq WHERE jsonb_typeof(xq->'validUntil')='string') s ORDER BY s.xm COLLATE "C" LOOP
  FOR kind_type IN SELECT s.xt FROM(SELECT DISTINCT xt FROM jsonb_array_elements(effective) xq CROSS JOIN LATERAL jsonb_array_elements_text(xq->'liquidationTypes') xt) s ORDER BY s.xt COLLATE "C" LOOP
   FOR agreement IN SELECT s.xa FROM(SELECT DISTINCT xq->>'agreementCode' AS xa FROM jsonb_array_elements(effective) xq) s ORDER BY s.xa COLLATE "C" LOOP
    SELECT coalesce(jsonb_agg(xq),'[]') INTO active_phases FROM jsonb_array_elements(effective) xq WHERE xq->>'agreementCode'=agreement AND public.own_program_quantity_active_v1(xq,period,kind_type);
    IF jsonb_array_length(active_phases)=0 THEN CONTINUE;END IF;
    checks:=checks+jsonb_array_length(active_phases);IF checks>50000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
    SELECT coalesce(jsonb_agg(xr),'[]') INTO active_amounts FROM jsonb_array_elements(lowered) xr WHERE xr->>'agreementCode'=agreement AND public.own_program_quantity_active_v1(xr,period,kind_type);
    SELECT jsonb_build_object(
      'definition','quantity:'||(qrow.value->>'agreementCode')||':'||(qrow.value->>'code'),
      'sourceReference',qrow.value->>'sourceReference','period',period,'liquidationType',kind_type,
      'destination',urow.value->>'rule',
      'path',coalesce((SELECT string_agg(pathpart.segment,'.' ORDER BY pathpart.ordinal) FROM jsonb_array_elements_text(urow.value->'path') WITH ORDINALITY pathpart(segment,ordinal)),'$'))
      INTO inactive_use_detail
      FROM jsonb_array_elements(active_phases) WITH ORDINALITY qrow(value,ordinal)
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN qrow.value#>>'{amountUse,kind}'='embedded' THEN qrow.value#>'{amountUse,uses}' ELSE '[]'::jsonb END) WITH ORDINALITY urow(value,ordinal)
      WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(active_amounts) xr WHERE public.own_program_quantity_identity_v1(xr)=urow.value->>'rule')
      ORDER BY qrow.ordinal,urow.ordinal LIMIT 1;
    IF inactive_use_detail IS NOT NULL THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_EMBED_USE_INACTIVE' USING DETAIL=inactive_use_detail::text;END IF;
    SELECT coalesce(jsonb_agg(xq),'[]') INTO active_norm FROM jsonb_array_elements(phases) xq WHERE xq->>'agreementCode'=agreement AND public.own_program_quantity_active_v1(xq,period,kind_type);
    policy_ctx:=jsonb_build_object(
     'quantities',(SELECT coalesce(jsonb_object_agg(xq->>'code',xq),'{}') FROM jsonb_array_elements(active_norm) xq),
     'amounts',(SELECT coalesce(jsonb_object_agg(public.own_program_quantity_identity_v1(xr),xr),'{}') FROM jsonb_array_elements(raw_rules) xr WHERE xr->>'agreementCode'=agreement AND public.own_program_quantity_active_v1(xr,period,kind_type)),
     'fractions',(SELECT coalesce(jsonb_agg(public.own_program_quantity_identity_v1(xr)),'[]') FROM jsonb_array_elements(raw_rules) xr WHERE xr->>'agreementCode'=agreement AND public.own_program_quantity_active_v1(xr,period,kind_type) AND public.own_program_quantity_treatment_v1(normalized,xr)='fraction'));
    FOR q IN SELECT xq FROM jsonb_array_elements(active_norm) xq ORDER BY public.own_program_quantity_key_v1(xq) COLLATE "C" LOOP
     IF q#>>'{amountUse,kind}'<>'independent' AND q#>>'{periodTreatment,kind}'<>'fraction' THEN CONTINUE;END IF;
     IF q#>>'{amountUse,kind}'='independent' AND q->>'stage'='rounded' AND q#>>'{rounding,mode}'<>'exact' THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_NONEXACT_POLICY_NOT_ADMITTED';END IF;
     walk_state:=public.own_program_quantity_policy_walk_v1(q->'expression',policy_ctx,q#>>'{amountUse,kind}'='independent',q#>>'{periodTreatment,kind}'='fraction',0,jsonb_build_object('seen',jsonb_build_array('quantity:'||(q->>'code')),'work',0));
     work:=work+(walk_state->>'work')::integer;IF work>3000000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
    END LOOP;
    work:=work+public.own_program_quantity_plan_v1(active_amounts,active_phases,conditions);
    IF work>3000000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 -- Definición del dueño y bindings N/I de cada fase sobre su vigencia completa.
 FOR q IN SELECT xq FROM jsonb_array_elements(effective) xq LOOP
  SELECT y.xr INTO owner_rule FROM jsonb_array_elements(raw_rules) WITH ORDINALITY y(xr,o) WHERE y.xr->>'agreementCode'=q->>'agreementCode' AND y.xr->>'code'=q->>'code' AND y.xr->>'nature'<>'auxiliary' AND public.own_program_quantity_active_v1(y.xr,q->>'validFrom',q#>>'{liquidationTypes,0}') ORDER BY y.o LIMIT 1;
  IF owner_rule IS NULL THEN RAISE EXCEPTION 'OWN_PROGRAM_QUANTITY_OWNER_MISSING';END IF;
  SELECT jsonb_agg(xd) INTO matching FROM jsonb_array_elements(items) xd WHERE xd->>'active'='true' AND xd->>'kind'='concept' AND xd->>'agreementCode'=owner_rule->>'agreementCode' AND xd->>'code'=owner_rule->>'code' AND xd->>'nature'=owner_rule->>'nature';
  IF NOT public.own_program_coverage_v1(matching,q->>'validFrom',q->>'validUntil') THEN RAISE EXCEPTION 'OWN_PROGRAM_DEFINITION_MISSING';END IF;
  info:=public.own_program_quantity_node_v1(q->'expression',conditions);
  FOR i IN SELECT xi FROM jsonb_array_elements(info->'inputs') xi LOOP
   SELECT xb INTO bound FROM jsonb_array_elements(normalized->'bindings') xb WHERE xb->>'agreementCode'=q->>'agreementCode' AND xb->>'key'=i->>'key' LIMIT 1;
   IF bound IS NULL OR bound->>'unit' IS DISTINCT FROM i->>'unit' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_MISSING';END IF;
   IF bound->>'sourceKind'='optional_scale' THEN RAISE EXCEPTION 'OWN_PROGRAM_OPTIONAL_SCALE_CONSUMER_INVALID';END IF;
   IF bound->>'sourceKind'='family_tariff' THEN RAISE EXCEPTION 'OWN_PROGRAM_FAMILY_TARIFF_QUANTITY_UNSUPPORTED';END IF;
   quantity_keys:=quantity_keys||((bound->>'agreementCode')||':'||(bound->>'key'));
   IF bound->>'sourceKind'='family_fact' AND(
    monetary->>'familyPayrollFactsVersion' IS DISTINCT FROM 'own-contract-family-payroll-facts.v1'
    OR public.own_program_exact_v1(bound,ARRAY['agreementCode','key','unit','sourceKind','sourceField','combine','onMissing','ruleReference']) IS NOT TRUE
    OR bound->>'unit' IS DISTINCT FROM CASE bound->>'sourceField' WHEN 'spouse' THEN 'units' WHEN 'children' THEN 'units' WHEN 'childrenWithDisability' THEN 'units' WHEN 'prenatal' THEN 'units' WHEN 'largeFamily' THEN 'units' WHEN 'preschool' THEN 'units' WHEN 'preschoolWithDisability' THEN 'units' WHEN 'primary' THEN 'units' WHEN 'primaryWithDisability' THEN 'units' WHEN 'secondary' THEN 'units' WHEN 'secondaryWithDisability' THEN 'units' WHEN 'dependants' THEN 'units' WHEN 'prenatalAdjustmentMonths' THEN 'units' WHEN 'tariffRegion' THEN 'code' WHEN 'semesterAverage' THEN 'money' ELSE NULL END
    OR bound->>'combine' IS DISTINCT FROM 'single' OR bound->>'onMissing' IS DISTINCT FROM 'error'
   ) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
   IF bound->>'sourceKind' NOT IN('family_fact','employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') THEN
    SELECT jsonb_agg(xd) INTO matching FROM jsonb_array_elements(items) xd WHERE xd->>'active'='true' AND xd->>'agreementCode'=CASE WHEN bound->>'sourceKind'='scale_reference' THEN bound->>'sourceAgreementCode' ELSE bound->>'agreementCode' END AND(bound->>'sourceKind'<>'scale_reference' OR xd->>'categoryCode'=bound->>'sourceCategoryCode') AND xd->>'code'=bound->>'sourceCode' AND xd->>'kind'=CASE WHEN bound->>'sourceKind' IN('scale','scale_reference') THEN 'scale' WHEN bound->>'sourceKind'='auxiliary_parameter' THEN 'auxiliary' ELSE 'concept' END AND(xd->>'kind'<>'concept' OR xd->>'nature'<>'auxiliary') AND(bound->>'sourceKind' IN('scale','scale_reference','monthly_amount','fixed_amount','monthly_presence','fixed_presence') OR xd->>'unit'=bound->>'unit') AND(bound->>'sourceKind' NOT IN('parameter','auxiliary_parameter') OR xd->'value'<>'null');
    IF NOT public.own_program_coverage_v1(matching,q->>'validFrom',q->>'validUntil') THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_DEFINITION_MISSING';END IF;
   END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(normalized->'bindings') xb WHERE NOT(((xb->>'agreementCode')||':'||(xb->>'key'))=ANY(rule_keys||quantity_keys))) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_UNUSED';END IF;
 RETURN normalized;
END $function$;

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
   IF (CASE WHEN emission_enabled OR coalesce((program_state#>'{program,definition}') ?| ARRAY['sourceCoverageVersion','sourceCoveragePolicies','monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies'],false) THEN public.own_program_definition_composed_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') ELSE public.own_program_definition_official_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') END) IS DISTINCT FROM program_state#>'{program,definition}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
  ELSE
   IF (CASE WHEN coalesce((program_state#>'{program,definition}') ?| ARRAY['sourceCoverageVersion','sourceCoveragePolicies','monthlyDeclaredAdjustmentsVersion','monthlyDeclaredAdjustmentPolicies'],false) THEN public.own_program_definition_composed_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') ELSE public.own_program_quantity_definition_v1(program_state#>'{program,definition}',program_state#>'{salaryCatalog,items}') END) IS DISTINCT FROM program_state#>'{program,definition}' THEN RAISE EXCEPTION 'OWN_RUN_PROGRAM_REQUIRED';END IF;
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
 payload_value:=jsonb_build_object('programState',program_state,'population',population,'monthly',CASE WHEN jsonb_array_length(native_batches)=0 AND NOT coalesce((program_state#>'{program,definition}') ?| ARRAY['sourceCoverageVersion','sourceCoveragePolicies'],false) THEN jsonb_build_object('complete',true,'batches',batches) ELSE jsonb_build_object('complete',true,'batches',batches,'nativeBatches',native_batches) END,'fixed',jsonb_build_object('list',jsonb_build_object('ok',true,'data',list_value),'export',jsonb_build_object('ok',true,'data',export_value)),'period',body->>'period','liquidationType',body->>'liquidationType','selection',body->'selection','sourceInventory',inventory);
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
COMMIT;
