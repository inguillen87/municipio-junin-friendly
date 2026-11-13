-- Candidate239: C1 school condition, finite non-February month. Not installed.
-- Requires recomposed release attestations; this semantic delta is not an operational installer.
BEGIN;
SET LOCAL statement_timeout='120s';
SET LOCAL lock_timeout='5s';
DO $preimage$ BEGIN
 IF (SELECT encode(public.digest(prosrc,'sha256'),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_source_coverage_options_v1(jsonb)')) IS DISTINCT FROM '098e53ed1be3cfc7a979cf0a145951c0204089dae735476d0f101b3c6058be7d' THEN RAISE EXCEPTION 'C239_PREIMAGE_CHANGED: public.own_program_source_coverage_options_v1(jsonb)';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_roles r ON r.oid=f.proowner JOIN pg_language l ON l.oid=f.prolang WHERE f.oid=to_regprocedure('public.own_program_source_coverage_options_v1(jsonb)') AND r.rolname='neondb_owner' AND f.proacl::text='{neondb_owner=X/neondb_owner}' AND f.proconfig=ARRAY['search_path=pg_catalog, public, pg_temp'] AND f.prosecdef AND f.provolatile='i' AND NOT f.proisstrict AND NOT f.proleakproof AND f.proparallel='u' AND f.prokind='f' AND l.lanname='plpgsql' AND f.procost=100 AND f.prorows=0 AND pg_get_function_result(f.oid)='jsonb' AND pg_get_function_identity_arguments(f.oid)='p jsonb') THEN RAISE EXCEPTION 'C239_PREIMAGE_METADATA_CHANGED: public.own_program_source_coverage_options_v1(jsonb)';END IF;
END $preimage$;
CREATE OR REPLACE FUNCTION public.own_program_source_coverage_options_v1(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $source_coverage$
DECLARE policies jsonb:=p->'sourceCoveragePolicies';policy jsonb;entry jsonb;row_value jsonb;basis jsonb;
 relevant jsonb;quantities jsonb;active_rules jsonb;active_phases jsonb;bindings jsonb;declared jsonb;
 previous_code text;code_value text;kind_value text;period_value text;binding_key text;used_keys text[];
 checks integer:=0;row_count integer;expected_hash text;node jsonb;
BEGIN
 IF p->>'sourceCoverageVersion' IS DISTINCT FROM 'own-payroll-source-coverage.v1'
 OR p->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2'
 OR jsonb_typeof(policies) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INVALID';END IF;
 IF jsonb_array_length(policies) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INVALID';END IF;
 PERFORM public.own_policy_canonical_guard_candidate_v1(policies);
 FOR policy IN SELECT value FROM jsonb_array_elements(policies) LOOP
  IF public.own_program_exact_v1(policy,ARRAY['policyId','supersedes','agreementCode','liquidationType','validFrom','validUntil','sourceSha256','inventorySha256','expectedSourceRows','inventory','nativeInputs']) IS NOT TRUE
  OR jsonb_typeof(policy->'sourceSha256') IS DISTINCT FROM 'string' OR policy->>'sourceSha256'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(policy->'inventorySha256') IS DISTINCT FROM 'string' OR policy->>'inventorySha256'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(policy->'expectedSourceRows') IS DISTINCT FROM 'number' OR policy->>'expectedSourceRows'!~'^[0-9]{1,4}$'
  OR jsonb_typeof(policy->'inventory') IS DISTINCT FROM 'array' OR jsonb_typeof(policy->'nativeInputs') IS DISTINCT FROM 'array'
  THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INCOMPLETE';END IF;
  row_count:=(policy->>'expectedSourceRows')::integer;
  IF row_count NOT BETWEEN 1 AND 1000 OR jsonb_array_length(policy->'inventory')<>row_count OR jsonb_array_length(policy->'nativeInputs')>512 THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INCOMPLETE';END IF;
  PERFORM public.own_policy_declaration_candidate_v1(policy);
  previous_code:=NULL;
  FOR row_value IN SELECT value FROM jsonb_array_elements(policy->'inventory') LOOP
   code_value:=row_value->>'code';kind_value:=row_value->>'kind';
   IF jsonb_typeof(row_value->'code') IS DISTINCT FROM 'string' OR code_value!~'^[0-9]{1,9}$'
   OR jsonb_typeof(row_value->'sourceRowSha256') IS DISTINCT FROM 'string' OR row_value->>'sourceRowSha256'!~'^[a-f0-9]{64}$'
   OR previous_code IS NOT NULL AND previous_code COLLATE "C">=code_value COLLATE "C"
   THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INVENTORY_CHANGED';END IF;
   previous_code:=code_value;
   IF kind_value='rule' THEN
    IF public.own_program_exact_v1(row_value,ARRAY['code','sourceRowSha256','kind']) IS NOT TRUE THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INVALID';END IF;
   ELSIF kind_value='input' THEN
    IF public.own_program_exact_v1(row_value,ARRAY['code','sourceRowSha256','kind','bindingKeys']) IS NOT TRUE THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INVALID';END IF;
   ELSIF kind_value='total' THEN
    IF public.own_program_exact_v1(row_value,ARRAY['code','sourceRowSha256','kind','targetCode']) IS NOT TRUE
    OR jsonb_typeof(row_value->'targetCode') IS DISTINCT FROM 'string' OR row_value->>'targetCode'!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INVALID';END IF;
   ELSIF kind_value='excluded_total' THEN
    IF public.own_program_exact_v1(row_value,ARRAY['code','sourceRowSha256','kind','decisionSha256']) IS NOT TRUE
    OR jsonb_typeof(row_value->'decisionSha256') IS DISTINCT FROM 'string' OR row_value->>'decisionSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
   ELSIF kind_value='excluded' THEN
    IF public.own_program_exact_v1(row_value,ARRAY['code','sourceRowSha256','kind','basis']) IS NOT TRUE THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INVALID';END IF;
    basis:=row_value->'basis';
    IF basis->>'kind'='event_activation_only' THEN
     IF public.own_program_exact_v1(basis,ARRAY['kind','sourceActivation','evidenceSha256']) IS NOT TRUE
     OR basis->>'sourceActivation' IS DISTINCT FROM 'N' THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
    ELSIF basis->>'kind'='source_dispatch_disabled' THEN
     IF public.own_program_exact_v1(basis,ARRAY['kind','methodCode','methodRowSha256','nonAmountEffects','phaseReviewSha256','evidenceSha256']) IS NOT TRUE
     OR jsonb_typeof(basis->'methodCode') IS DISTINCT FROM 'string' OR basis->>'methodCode' IS DISTINCT FROM '0' OR basis->>'nonAmountEffects' IS DISTINCT FROM 'none'
     OR jsonb_typeof(basis->'methodRowSha256') IS DISTINCT FROM 'string' OR basis->>'methodRowSha256'!~'^[a-f0-9]{64}$'
     OR jsonb_typeof(basis->'phaseReviewSha256') IS DISTINCT FROM 'string' OR basis->>'phaseReviewSha256'!~'^[a-f0-9]{64}$'
     THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
    ELSIF basis->>'kind'='outside_february_school_condition' THEN
     IF public.own_program_exact_v1(basis,ARRAY['kind','condition','authority','decisionSha256','dispatchScope','quantityTreatment','nonAmountEffects','phaseReviewSha256','evidenceSha256']) IS NOT TRUE
     OR public.own_program_exact_v1(basis->'condition',ARRAY['reference','operator','value']) IS NOT TRUE
     OR basis#>>'{condition,reference}' IS DISTINCT FROM 'L[101]' OR basis#>>'{condition,operator}' IS DISTINCT FROM 'eq'
     OR basis#>'{condition,value}' IS DISTINCT FROM '2'::jsonb
     OR basis->>'authority' IS DISTINCT FROM 'own_programme_decision'
     OR jsonb_typeof(basis->'decisionSha256') IS DISTINCT FROM 'string' OR basis->>'decisionSha256'!~'^[a-f0-9]{64}$'
     OR policy->>'agreementCode' IS DISTINCT FROM '1' OR policy->>'liquidationType' IS DISTINCT FROM 'monthly'
     OR code_value NOT IN('311','312')
     OR policy->>'validUntil' IS DISTINCT FROM policy->>'validFrom' OR right(policy->>'validFrom',2)='02'
     OR basis->>'dispatchScope' IS DISTINCT FROM 'whole_definition'
     OR basis->>'quantityTreatment' IS DISTINCT FROM 'suppressed_by_own_decision' OR basis->>'nonAmountEffects' IS DISTINCT FROM 'empty_source_pre_post'
     OR jsonb_typeof(basis->'phaseReviewSha256') IS DISTINCT FROM 'string' OR basis->>'phaseReviewSha256'!~'^[a-f0-9]{64}$'
     THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
     IF p->>'periodContextVersion' IS DISTINCT FROM 'own-payroll-period-context.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_PERIOD_CONTEXT_REQUIRED';END IF;
    ELSIF basis->>'kind'='documented_retirement' THEN
     IF public.own_program_exact_v1(basis,ARRAY['kind','decisionSha256','evidenceSha256']) IS NOT TRUE
     OR jsonb_typeof(basis->'decisionSha256') IS DISTINCT FROM 'string' OR basis->>'decisionSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
    ELSIF basis->>'kind'='outside_liquidation_type' THEN
     IF public.own_program_exact_v1(basis,ARRAY['kind','applicableLiquidationTypes','dispatchScope','evidenceSha256']) IS NOT TRUE
     OR basis->>'dispatchScope' IS DISTINCT FROM 'whole_definition' OR jsonb_typeof(basis->'applicableLiquidationTypes') IS DISTINCT FROM 'array'
     THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
     IF jsonb_array_length(basis->'applicableLiquidationTypes') NOT BETWEEN 1 AND 7
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'applicableLiquidationTypes') x WHERE jsonb_typeof(x)<>'string' OR x#>>'{}' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other'))
     OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements_text(basis->'applicableLiquidationTypes') x)
     OR basis->'applicableLiquidationTypes' ? (policy->>'liquidationType') THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
    ELSE RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
    IF jsonb_typeof(basis->'evidenceSha256') IS DISTINCT FROM 'string' OR basis->>'evidenceSha256'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
   ELSE RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_EXCLUSION_UNRESOLVED';END IF;
  END LOOP;
  SELECT public.own_run_hash_v1(jsonb_agg(jsonb_build_object('code',r->'code','sourceRowSha256',r->'sourceRowSha256') ORDER BY n)) INTO expected_hash FROM jsonb_array_elements(policy->'inventory') WITH ORDINALITY z(r,n);
  IF expected_hash IS DISTINCT FROM policy->>'inventorySha256' THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_INVENTORY_CHANGED';END IF;
  previous_code:=NULL;
  FOR row_value IN SELECT value FROM jsonb_array_elements(policy->'nativeInputs') LOOP
   code_value:=row_value->>'code';
   IF public.own_program_exact_v1(row_value,ARRAY['code','evidenceSha256','bindingKeys']) IS NOT TRUE
   OR jsonb_typeof(row_value->'code') IS DISTINCT FROM 'string' OR code_value!~'^[0-9]{1,9}$'
   OR jsonb_typeof(row_value->'evidenceSha256') IS DISTINCT FROM 'string' OR row_value->>'evidenceSha256'!~'^[a-f0-9]{64}$'
   OR previous_code IS NOT NULL AND previous_code COLLATE "C">=code_value COLLATE "C"
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'inventory') r WHERE r->>'code'=code_value)
   THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_NATIVE_INPUT_INVALID';END IF;
   previous_code:=code_value;
  END LOOP;
  FOR row_value IN SELECT value FROM jsonb_array_elements(policy->'inventory') WHERE value->>'kind'='input'
   UNION ALL SELECT value FROM jsonb_array_elements(policy->'nativeInputs') LOOP
   IF jsonb_typeof(row_value->'bindingKeys') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_BINDINGS_INVALID';END IF;
   IF jsonb_array_length(row_value->'bindingKeys') NOT BETWEEN 1 AND 512
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(row_value->'bindingKeys') k WHERE jsonb_typeof(k)<>'string' OR k#>>'{}'!~'^[A-Za-z][A-Za-z0-9_]{0,63}$')
   OR (SELECT count(*)<>count(DISTINCT k) FROM jsonb_array_elements_text(row_value->'bindingKeys') k)
   THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_BINDINGS_INVALID';END IF;
  END LOOP;
 END LOOP;
 FOR entry IN SELECT value FROM jsonb_array_elements(public.own_policy_resolve_candidate_v1(policies,'source-coverage')) LOOP
  policy:=entry->'policy';
  SELECT coalesce(jsonb_agg(r),'[]') INTO relevant FROM jsonb_array_elements(p->'rules') r WHERE r->'agreementCode'=policy->'agreementCode' AND r->'liquidationTypes' ? (policy->>'liquidationType');
  SELECT coalesce(jsonb_agg(q),'[]') INTO quantities FROM jsonb_array_elements(coalesce(p->'quantityPhases','[]')) q WHERE q->'agreementCode'=policy->'agreementCode' AND q->'liquidationTypes' ? (policy->>'liquidationType');
  FOR period_value IN SELECT value FROM jsonb_array_elements_text(public.own_policy_boundaries_candidate_v1(entry,relevant||quantities)) LOOP
   checks:=checks+jsonb_array_length(policy->'inventory')+jsonb_array_length(policy->'nativeInputs');
   IF checks>50000 THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_LIMIT';END IF;
   SELECT coalesce(jsonb_agg(r),'[]') INTO active_rules FROM jsonb_array_elements(relevant) r WHERE public.own_program_quantity_active_v1(r,period_value,policy->>'liquidationType');
   SELECT coalesce(jsonb_agg(q),'[]') INTO active_phases FROM jsonb_array_elements(quantities) q WHERE public.own_program_quantity_active_v1(q,period_value,policy->>'liquidationType');
   used_keys:='{}';
   FOR row_value IN SELECT value FROM jsonb_array_elements(active_rules||active_phases) LOOP
    FOR node IN SELECT x FROM jsonb_path_query(row_value->'expression','$.** ? (@.op == "input" || @.op == "match")') AS q(x) LOOP used_keys:=array_append(used_keys,node->>'key');END LOOP;
   END LOOP;
   SELECT coalesce(jsonb_agg(b),'[]') INTO bindings FROM jsonb_array_elements(p->'bindings') b WHERE b->'agreementCode'=policy->'agreementCode' AND (b->>'key')=ANY(used_keys);
   FOR row_value IN SELECT value FROM jsonb_array_elements(policy->'inventory') LOOP
    code_value:=row_value->>'code';kind_value:=row_value->>'kind';
    IF kind_value='rule' THEN
     IF (SELECT count(*) FROM jsonb_array_elements(active_rules) r WHERE r->>'code'=code_value AND r->>'nature'<>'auxiliary')<>1 THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_RULE_REQUIRED';END IF;
    ELSIF kind_value='total' THEN
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(active_rules) r WHERE r->>'code'=code_value AND r->>'nature'<>'auxiliary')
     OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(active_rules) r WHERE r->'code'=row_value->'targetCode' AND r->>'nature'='auxiliary' AND r->>'unit'='money') THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_TOTAL_REQUIRED';END IF;
    ELSIF kind_value IN('excluded','excluded_total') THEN
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(active_rules) r WHERE r->>'code'=code_value AND r->>'nature'<>'auxiliary')
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(active_phases) q WHERE q->>'code'=code_value) THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_ROLE_CONFLICT';END IF;
    END IF;
   END LOOP;
   FOR row_value IN SELECT value FROM jsonb_array_elements(policy->'inventory') WHERE value->>'kind'='input'
    UNION ALL SELECT value FROM jsonb_array_elements(policy->'nativeInputs') LOOP
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(active_rules) r WHERE r->'code'=row_value->'code' AND r->>'nature'<>'auxiliary') THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_ROLE_CONFLICT';END IF;
    FOR binding_key IN SELECT value FROM jsonb_array_elements_text(row_value->'bindingKeys') LOOP
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bindings) b WHERE b->>'key'=binding_key AND b->'sourceCode'=row_value->'code' AND b->>'sourceKind' IN('monthly_amount','monthly_quantity','monthly_presence','fixed_amount','fixed_quantity','fixed_presence')) THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_BINDING_REQUIRED';END IF;
    END LOOP;
   END LOOP;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(active_rules) r WHERE r->>'nature'<>'auxiliary' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'inventory') i WHERE i->'code'=r->'code' AND i->>'kind'='rule')) THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_RULE_UNACCOUNTED';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(bindings) b WHERE b->>'sourceKind' IN('monthly_amount','monthly_quantity','monthly_presence','fixed_amount','fixed_quantity','fixed_presence') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements((policy->'inventory')||(policy->'nativeInputs')) i WHERE i->'code'=b->'sourceCode')) THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_COVERAGE_BINDING_UNACCOUNTED';END IF;
  END LOOP;
 END LOOP;
 RETURN jsonb_build_object('sourceCoverageVersion','own-payroll-source-coverage.v1','sourceCoveragePolicies',policies);
END $source_coverage$;

DO $postimage$ BEGIN
 IF (SELECT encode(public.digest(prosrc,'sha256'),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_source_coverage_options_v1(jsonb)')) IS DISTINCT FROM '405d94637613a6f40e280790e6b74f2c7a32a793b39522f006b3df86d4f5bc20' THEN RAISE EXCEPTION 'C239_POSTIMAGE_CHANGED: public.own_program_source_coverage_options_v1(jsonb)';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc f JOIN pg_roles r ON r.oid=f.proowner JOIN pg_language l ON l.oid=f.prolang WHERE f.oid=to_regprocedure('public.own_program_source_coverage_options_v1(jsonb)') AND r.rolname='neondb_owner' AND f.proacl::text='{neondb_owner=X/neondb_owner}' AND f.proconfig=ARRAY['search_path=pg_catalog, public, pg_temp'] AND f.prosecdef AND f.provolatile='i' AND NOT f.proisstrict AND NOT f.proleakproof AND f.proparallel='u' AND f.prokind='f' AND l.lanname='plpgsql' AND f.procost=100 AND f.prorows=0 AND pg_get_function_result(f.oid)='jsonb' AND pg_get_function_identity_arguments(f.oid)='p jsonb') THEN RAISE EXCEPTION 'C239_POSTIMAGE_METADATA_CHANGED: public.own_program_source_coverage_options_v1(jsonb)';END IF;
END $postimage$;
COMMIT;
