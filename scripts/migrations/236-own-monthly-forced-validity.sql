BEGIN;
-- Migration 236: explicit reusable validity for native monthly declared amounts.
-- Base: reviewed 234 / 23eb7b98. No business data, IAM or sessions are changed.
-- The operational release requires the separately composed readiness/attestation.
DO $monthly_validity_preimage$ BEGIN
 IF to_regprocedure('public.own_program_monthly_forced_active_candidate_v2(jsonb,text,text)') IS NOT NULL THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_OBJECT_CONFLICT: public.own_program_monthly_forced_active_candidate_v2(jsonb,text,text)';END IF;
 IF to_regprocedure('public.own_program_monthly_forced_options_candidate_v2(jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_OBJECT_CONFLICT: public.own_program_monthly_forced_options_candidate_v2(jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_policy_resolve_candidate_v1(jsonb,text)')) IS DISTINCT FROM '8aa48aef3354a5bb82cb6e551216418f66ad16a50d7a9fd25388e34e0ceab497' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_PREIMAGE_CHANGED: public.own_policy_resolve_candidate_v1(jsonb,text)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_monthly_forced_history_candidate_v1(jsonb,jsonb)')) IS DISTINCT FROM 'dad9a916c43e2d609d98c8b176e840267fb76f0903c921d17af4c9adef2e9894' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_PREIMAGE_CHANGED: public.own_program_monthly_forced_history_candidate_v1(jsonb,jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_monthly_forced_options_candidate_v1(jsonb)')) IS DISTINCT FROM 'e90c6985ce0a2d6134271b0e7c0560d2f7b12fac8eca7780a3cd80a9daa05838' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_PREIMAGE_CHANGED: public.own_program_monthly_forced_options_candidate_v1(jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_quantity_only_options_v1(jsonb)')) IS DISTINCT FROM '930fda526c884ac26d400247db5e8442391ec3b90460cf9c850c718e1c1ad0f8' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_PREIMAGE_CHANGED: public.own_program_quantity_only_options_v1(jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_run_monthly_forced_capture_check_candidate_v1(jsonb,jsonb,jsonb)')) IS DISTINCT FROM 'd8019574aaf5573dbf459257a77b2a1697c4b3dd305b1ff9de65105e1bc7aa4b' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_PREIMAGE_CHANGED: public.own_run_monthly_forced_capture_check_candidate_v1(jsonb,jsonb,jsonb)';END IF;
END $monthly_validity_preimage$;

CREATE FUNCTION public.own_program_monthly_forced_active_candidate_v2(options jsonb,period_value text,liquidation_type text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $monthly_active_v2$
DECLARE selected jsonb;
BEGIN
 IF period_value IS NULL OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR liquidation_type IS NULL THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_POLICY_INVALID';END IF;
 IF options->>'monthlyForcedAmountsVersion'='own-monthly-forced-passthrough.v2' THEN
  SELECT coalesce(jsonb_agg(e->'policy' ORDER BY ordinal),'[]') INTO selected FROM jsonb_array_elements(public.own_policy_resolve_candidate_v1(options->'monthlyForcedAmountPolicies','monthly-forced')) WITH ORDINALITY x(e,ordinal)
  WHERE e#>>'{policy,liquidationType}'=liquidation_type AND e->>'validFrom'<=period_value AND coalesce(e->>'validUntil','9999-12')>=period_value;
 ELSIF options->>'monthlyForcedAmountsVersion'='own-monthly-forced-passthrough.v1' THEN
  SELECT coalesce(jsonb_agg(p ORDER BY ordinal),'[]') INTO selected FROM jsonb_array_elements(options->'monthlyForcedAmountPolicies') WITH ORDINALITY x(p,ordinal) WHERE p->>'period'=period_value AND p->>'liquidationType'=liquidation_type;
 ELSE RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_POLICY_INVALID';END IF;
 RETURN selected;
END $monthly_active_v2$;
ALTER FUNCTION public.own_program_monthly_forced_active_candidate_v2(jsonb,text,text) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_program_monthly_forced_active_candidate_v2(jsonb,text,text) FROM PUBLIC,cloud_admin,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_program_monthly_forced_active_candidate_v2(jsonb,text,text) TO neondb_owner;

CREATE FUNCTION public.own_program_monthly_forced_options_candidate_v2(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $monthly_options_v2$
DECLARE policies jsonb:=p->'monthlyForcedAmountPolicies';policy jsonb;entry jsonb;effective jsonb;related jsonb;target jsonb;amount_binding jsonb;presence_binding jsonb;expected jsonb;n integer;probe text;
BEGIN
 IF p->>'monthlyForcedAmountsVersion' IS DISTINCT FROM 'own-monthly-forced-passthrough.v2'
 OR p->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2'
 OR p->>'noveltyPresenceVersion' IS DISTINCT FROM 'own-payroll-novelty-presence.v1'
 OR jsonb_typeof(policies) IS DISTINCT FROM 'array' OR jsonb_array_length(policies) NOT BETWEEN 1 AND 128
 OR jsonb_typeof(p->'rules') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'bindings') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_POLICY_INVALID';END IF;
 FOR policy IN SELECT value FROM jsonb_array_elements(policies) LOOP
  IF policy->>'version' IS DISTINCT FROM 'own-monthly-forced-passthrough.v2' THEN
   PERFORM public.own_program_monthly_forced_options_candidate_v1(p||jsonb_build_object('monthlyForcedAmountsVersion','own-monthly-forced-passthrough.v1','monthlyForcedAmountPolicies',jsonb_build_array(policy)));
   CONTINUE;
  END IF;
  IF public.own_program_exact_v1(policy,ARRAY['version','policyId','supersedes','agreementCode','validFrom','validUntil','liquidationType','sourceContract','sourceKind','sourceCode','amountInputKey','presenceInputKey','treatment','quantityPolicy','sourceSha256','ruleReference']) IS NOT TRUE
  OR policy->>'liquidationType' IS DISTINCT FROM 'monthly'
  OR policy->>'sourceContract' IS DISTINCT FROM 'own-payroll-novelty-batch.v1' OR policy->>'sourceKind' IS DISTINCT FROM 'monthly_amount'
  OR jsonb_typeof(policy->'sourceCode') IS DISTINCT FROM 'string' OR coalesce(policy->>'sourceCode','')!~'^[0-9]{1,9}$'
  OR jsonb_typeof(policy->'amountInputKey') IS DISTINCT FROM 'string' OR coalesce(policy->>'amountInputKey','')!~'^[A-Za-z][A-Za-z0-9_]{0,63}$'
  OR jsonb_typeof(policy->'presenceInputKey') IS DISTINCT FROM 'string' OR coalesce(policy->>'presenceInputKey','')!~'^[A-Za-z][A-Za-z0-9_]{0,63}$'
  OR policy->'amountInputKey'=policy->'presenceInputKey'
  OR policy->>'treatment' IS DISTINCT FROM 'declared_amount_passthrough' OR policy->>'quantityPolicy' IS DISTINCT FROM 'explicit_zero'
  OR jsonb_typeof(policy->'sourceSha256') IS DISTINCT FROM 'string' OR coalesce(policy->>'sourceSha256','')!~'^[a-f0-9]{64}$'
  OR public.own_program_text_v1(policy->'ruleReference',3,180) IS NOT TRUE
  OR policy->>'ruleReference' IS DISTINCT FROM normalize(policy->>'ruleReference',NFC)
  THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_POLICY_INVALID';END IF;
  PERFORM public.own_policy_declaration_candidate_v1(policy);
 END LOOP;
 effective:=public.own_participation_rules_v1(p);
 FOR entry IN SELECT value FROM jsonb_array_elements(public.own_policy_resolve_candidate_v1(policies,'monthly-forced')) LOOP
  policy:=entry->'policy';IF policy->>'version' IS DISTINCT FROM 'own-monthly-forced-passthrough.v2' THEN CONTINUE;END IF;
  SELECT coalesce(jsonb_agg(r),'[]') INTO related FROM jsonb_array_elements(effective||coalesce(p->'quantityPhases','[]')) r WHERE r->'agreementCode'=policy->'agreementCode' AND r->'liquidationTypes' ? (policy->>'liquidationType');
  SELECT count(*) INTO n FROM jsonb_array_elements(p->'bindings') b WHERE b->'agreementCode'=policy->'agreementCode' AND b->'sourceCode'=policy->'sourceCode' AND b->>'sourceKind'~'^(monthly|fixed)_';
  IF n<>2 THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_SOURCE_COLLISION';END IF;
  SELECT b INTO amount_binding FROM jsonb_array_elements(p->'bindings') b WHERE b->'agreementCode'=policy->'agreementCode' AND b->'sourceCode'=policy->'sourceCode' AND b->'key'=policy->'amountInputKey';
  SELECT b INTO presence_binding FROM jsonb_array_elements(p->'bindings') b WHERE b->'agreementCode'=policy->'agreementCode' AND b->'sourceCode'=policy->'sourceCode' AND b->'key'=policy->'presenceInputKey';
  IF amount_binding->>'sourceKind' IS DISTINCT FROM 'monthly_amount' OR amount_binding->>'unit' IS DISTINCT FROM 'money' OR amount_binding->>'combine' IS DISTINCT FROM 'single' OR amount_binding->>'onMissing' IS DISTINCT FROM 'zero'
  OR presence_binding->>'sourceKind' IS DISTINCT FROM 'monthly_presence' OR presence_binding->>'unit' IS DISTINCT FROM 'coefficient' OR presence_binding->>'combine' IS DISTINCT FROM 'any' OR presence_binding->>'onMissing' IS DISTINCT FROM 'zero'
  THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_BINDING_REQUIRED';END IF;
  expected:=jsonb_build_object('op','choose','condition',jsonb_build_object('op','compare','operator','eq','left',jsonb_build_object('op','input','key',policy->>'presenceInputKey','unit','coefficient'),'right',jsonb_build_object('op','literal','unit','coefficient','value','1')),'then',jsonb_build_object('op','input','key',policy->>'amountInputKey','unit','money'),'else',jsonb_build_object('op','literal','unit','money','value','0'));
  FOR probe IN SELECT value FROM jsonb_array_elements_text(public.own_policy_boundaries_candidate_v1(entry,related)) LOOP
   SELECT count(*),jsonb_agg(r)->0 INTO n,target FROM jsonb_array_elements(effective) r WHERE r->'agreementCode'=policy->'agreementCode' AND r->'code'=policy->'sourceCode' AND r->>'nature'<>'auxiliary' AND public.own_program_quantity_active_v1(r,probe,policy->>'liquidationType');
   IF n<>1 THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_RULE_REQUIRED';END IF;
   IF target->>'nature' IS DISTINCT FROM 'deduction' OR target->>'unit' IS DISTINCT FROM 'money'
   OR target->'liquidationTypes' IS DISTINCT FROM '["monthly"]'::jsonb OR target#>'{rounding,precision}' IS DISTINCT FROM '2'::jsonb OR target->'expression' IS DISTINCT FROM expected
   THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_PASSTHROUGH_REQUIRED';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p->'quantityPhases','[]')) q WHERE q->'agreementCode'=policy->'agreementCode' AND q->'code'=policy->'sourceCode' AND public.own_program_quantity_active_v1(q,probe,policy->>'liquidationType'))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(related) r CROSS JOIN LATERAL jsonb_path_query(r->'expression','$.** ? (@.op == "quantity_phase")') node WHERE public.own_program_quantity_active_v1(r,probe,policy->>'liquidationType') AND node->'code'=policy->'sourceCode')
   THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_QUANTITY_POLICY_REQUIRED';END IF;
  END LOOP;
 END LOOP;
 SELECT jsonb_agg(x ORDER BY ((x->>'agreementCode')||':'||CASE WHEN x->>'version'='own-monthly-forced-passthrough.v2' THEN (x->>'validFrom')||'..'||coalesce(x->>'validUntil','null') ELSE x->>'period' END||':'||(x->>'liquidationType')||':'||(x->>'sourceCode')) COLLATE "C") INTO policies FROM jsonb_array_elements(policies) x;
 RETURN jsonb_build_object('monthlyForcedAmountsVersion','own-monthly-forced-passthrough.v2','monthlyForcedAmountPolicies',policies);
END $monthly_options_v2$;
ALTER FUNCTION public.own_program_monthly_forced_options_candidate_v2(jsonb) OWNER TO neondb_owner;
REVOKE ALL ON FUNCTION public.own_program_monthly_forced_options_candidate_v2(jsonb) FROM PUBLIC,cloud_admin,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_program_monthly_forced_options_candidate_v2(jsonb) TO neondb_owner;

CREATE OR REPLACE FUNCTION public.own_policy_resolve_candidate_v1(policies jsonb,kind text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER
SET search_path=pg_catalog,public,pg_temp AS $policy_resolve$
DECLARE p jsonb;e jsonb;prior jsonb;entries jsonb:='{}';resolved jsonb:='[]';ids text[]:='{}';id text;prior_id text;scope_value text;start_value text;end_value text;next_id text;seen text[];temporal boolean;
BEGIN
 IF kind IS NULL OR kind NOT IN('monthly-forced','conditional-source','family-tariff','row-emission','official-totals','source-coverage','declared-adjustment','quantity-only') OR jsonb_typeof(policies) IS DISTINCT FROM 'array' OR jsonb_array_length(policies) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'POLICY_SUCCESSION_INVALID';END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(policies) LOOP
  temporal:=CASE kind WHEN 'monthly-forced' THEN p->>'version'='own-monthly-forced-passthrough.v2' WHEN 'conditional-source' THEN true WHEN 'quantity-only' THEN true WHEN 'declared-adjustment' THEN true WHEN 'source-coverage' THEN true WHEN 'family-tariff' THEN p->>'version' IN('own-payroll-family-tariffs.v3','own-payroll-family-tariffs.v4') WHEN 'official-totals' THEN p->>'version'='own-payroll-official-totals.v2' ELSE p->>'version'='own-payroll-row-emission.v2' END;
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

CREATE OR REPLACE FUNCTION public.own_program_monthly_forced_history_candidate_v1(before_value jsonb,after_value jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $monthly_history$
DECLARE old_value jsonb;new_value jsonb;
BEGIN
 IF NOT coalesce(before_value ?| ARRAY['monthlyForcedAmountsVersion','monthlyForcedAmountPolicies'],false) THEN RETURN;END IF;
 old_value:=public.own_program_monthly_forced_options_candidate_v1(before_value);
 new_value:=public.own_program_monthly_forced_options_candidate_v1(after_value);
 IF (new_value->'monthlyForcedAmountsVersion' IS DISTINCT FROM old_value->'monthlyForcedAmountsVersion'
  AND NOT (old_value->>'monthlyForcedAmountsVersion'='own-monthly-forced-passthrough.v1' AND new_value->>'monthlyForcedAmountsVersion'='own-monthly-forced-passthrough.v2'))
 OR EXISTS(SELECT 1 FROM jsonb_array_elements(old_value->'monthlyForcedAmountPolicies') o WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(new_value->'monthlyForcedAmountPolicies','[]'::jsonb)) n WHERE n=o))
 THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
END $monthly_history$
;

CREATE OR REPLACE FUNCTION public.own_program_monthly_forced_options_candidate_v1(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $monthly_options$
DECLARE policies jsonb;entry jsonb;effective jsonb;target jsonb;amount_binding jsonb;presence_binding jsonb;expected jsonb;n integer;seen text[]:='{}';k text;
BEGIN
 IF NOT coalesce(p ?| ARRAY['monthlyForcedAmountsVersion','monthlyForcedAmountPolicies'],false) THEN RETURN '{}'::jsonb;END IF;
 IF p->>'monthlyForcedAmountsVersion'='own-monthly-forced-passthrough.v2' THEN RETURN public.own_program_monthly_forced_options_candidate_v2(p);END IF;
 IF p->>'monthlyForcedAmountsVersion' IS DISTINCT FROM 'own-monthly-forced-passthrough.v1'
 OR p->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2'
 OR p->>'noveltyPresenceVersion' IS DISTINCT FROM 'own-payroll-novelty-presence.v1'
 OR jsonb_typeof(p->'monthlyForcedAmountPolicies') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p->'rules') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'bindings') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_POLICY_INVALID';END IF;
 policies:=p->'monthlyForcedAmountPolicies';
 IF jsonb_array_length(policies) NOT BETWEEN 1 AND 128 THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_POLICY_INVALID';END IF;
 effective:=public.own_participation_rules_v1(p);
 FOR entry IN SELECT value FROM jsonb_array_elements(policies) LOOP
  IF public.own_program_exact_v1(entry,ARRAY['agreementCode','period','liquidationType','sourceContract','sourceKind','sourceCode','amountInputKey','presenceInputKey','treatment','quantityPolicy','sourceSha256','ruleReference']) IS NOT TRUE
  OR jsonb_typeof(entry->'agreementCode') IS DISTINCT FROM 'string' OR coalesce(entry->>'agreementCode','')!~'^[0-9]{1,9}$'
  OR jsonb_typeof(entry->'period') IS DISTINCT FROM 'string' OR coalesce(entry->>'period','')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
  OR entry->>'liquidationType' IS DISTINCT FROM 'monthly'
  OR entry->>'sourceContract' IS DISTINCT FROM 'own-payroll-novelty-batch.v1'
  OR entry->>'sourceKind' IS DISTINCT FROM 'monthly_amount'
  OR jsonb_typeof(entry->'sourceCode') IS DISTINCT FROM 'string' OR coalesce(entry->>'sourceCode','')!~'^[0-9]{1,9}$'
  OR jsonb_typeof(entry->'amountInputKey') IS DISTINCT FROM 'string' OR coalesce(entry->>'amountInputKey','')!~'^[A-Za-z][A-Za-z0-9_]{0,63}$'
  OR jsonb_typeof(entry->'presenceInputKey') IS DISTINCT FROM 'string' OR coalesce(entry->>'presenceInputKey','')!~'^[A-Za-z][A-Za-z0-9_]{0,63}$'
  OR entry->'amountInputKey'=entry->'presenceInputKey'
  OR entry->>'treatment' IS DISTINCT FROM 'declared_amount_passthrough'
  OR entry->>'quantityPolicy' IS DISTINCT FROM 'explicit_zero'
  OR jsonb_typeof(entry->'sourceSha256') IS DISTINCT FROM 'string' OR coalesce(entry->>'sourceSha256','')!~'^[a-f0-9]{64}$'
  OR public.own_program_text_v1(entry->'ruleReference',3,180) IS NOT TRUE
  THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_POLICY_INVALID';END IF;
  k:=(entry->>'agreementCode')||':'||(entry->>'period')||':'||(entry->>'liquidationType')||':'||(entry->>'sourceCode');
  IF k=ANY(seen) THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_POLICY_DUPLICATE';END IF;seen:=seen||k;
  SELECT count(*),jsonb_agg(r)->0 INTO n,target FROM jsonb_array_elements(effective) r
  WHERE r->'agreementCode'=entry->'agreementCode' AND r->'code'=entry->'sourceCode' AND r->>'nature'<>'auxiliary'
   AND r->>'validFrom'<=entry->>'period' AND coalesce(r->>'validUntil','9999-12')>=entry->>'period' AND r->'liquidationTypes' ? (entry->>'liquidationType');
  IF n<>1 THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_RULE_REQUIRED';END IF;
  expected:=jsonb_build_object('op','choose','condition',jsonb_build_object('op','compare','operator','eq','left',jsonb_build_object('op','input','key',entry->>'presenceInputKey','unit','coefficient'),'right',jsonb_build_object('op','literal','unit','coefficient','value','1')),'then',jsonb_build_object('op','input','key',entry->>'amountInputKey','unit','money'),'else',jsonb_build_object('op','literal','unit','money','value','0'));
  IF target->>'nature' IS DISTINCT FROM 'deduction' OR target->>'unit' IS DISTINCT FROM 'money'
  OR target->'validFrom' IS DISTINCT FROM entry->'period' OR target->'validUntil' IS DISTINCT FROM entry->'period'
  OR target->'liquidationTypes' IS DISTINCT FROM '["monthly"]'::jsonb OR target#>'{rounding,precision}' IS DISTINCT FROM '2'::jsonb
  OR target->'expression' IS DISTINCT FROM expected
  THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_PASSTHROUGH_REQUIRED';END IF;
  SELECT count(*) INTO n FROM jsonb_array_elements(p->'bindings') b WHERE b->'agreementCode'=entry->'agreementCode' AND b->'sourceCode'=entry->'sourceCode' AND b->>'sourceKind'~'^(monthly|fixed)_';
  IF n<>2 THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_SOURCE_COLLISION';END IF;
  SELECT b INTO amount_binding FROM jsonb_array_elements(p->'bindings') b WHERE b->'agreementCode'=entry->'agreementCode' AND b->'key'=entry->'amountInputKey';
  SELECT b INTO presence_binding FROM jsonb_array_elements(p->'bindings') b WHERE b->'agreementCode'=entry->'agreementCode' AND b->'key'=entry->'presenceInputKey';
  IF amount_binding->>'sourceKind' IS DISTINCT FROM 'monthly_amount' OR amount_binding->'sourceCode' IS DISTINCT FROM entry->'sourceCode'
  OR amount_binding->>'unit' IS DISTINCT FROM 'money' OR amount_binding->>'combine' IS DISTINCT FROM 'single' OR amount_binding->>'onMissing' IS DISTINCT FROM 'zero'
  OR presence_binding->>'sourceKind' IS DISTINCT FROM 'monthly_presence' OR presence_binding->'sourceCode' IS DISTINCT FROM entry->'sourceCode'
  OR presence_binding->>'unit' IS DISTINCT FROM 'coefficient' OR presence_binding->>'combine' IS DISTINCT FROM 'any' OR presence_binding->>'onMissing' IS DISTINCT FROM 'zero'
  THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_BINDING_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p->'quantityPhases','[]'::jsonb)) q WHERE q->'agreementCode'=entry->'agreementCode' AND q->'code'=entry->'sourceCode' AND q->>'validFrom'<=entry->>'period' AND coalesce(q->>'validUntil','9999-12')>=entry->>'period' AND q->'liquidationTypes' ? (entry->>'liquidationType'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(effective||coalesce(p->'quantityPhases','[]'::jsonb)) r CROSS JOIN LATERAL jsonb_path_query(r->'expression','$.** ? (@.op == "quantity_phase")') node WHERE r->'agreementCode'=entry->'agreementCode' AND r->>'validFrom'<=entry->>'period' AND coalesce(r->>'validUntil','9999-12')>=entry->>'period' AND r->'liquidationTypes' ? (entry->>'liquidationType') AND node->'code'=entry->'sourceCode')
  THEN RAISE EXCEPTION 'OWN_PROGRAM_MONTHLY_FORCED_QUANTITY_POLICY_REQUIRED';END IF;
 END LOOP;
 SELECT jsonb_agg(x ORDER BY ((x->>'agreementCode')||':'||(x->>'period')||':'||(x->>'liquidationType')||':'||(x->>'sourceCode')) COLLATE "C") INTO policies FROM jsonb_array_elements(policies) x;
 RETURN jsonb_build_object('monthlyForcedAmountsVersion','own-monthly-forced-passthrough.v1','monthlyForcedAmountPolicies',policies);
END $monthly_options$
;

CREATE OR REPLACE FUNCTION public.own_program_quantity_only_options_v1(programme jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $quantity_only_options$
DECLARE policies jsonb:=programme->'quantityOnlyInputPolicies';policy jsonb;entry jsonb;relevant jsonb;rules jsonb;forced_entries jsonb;found jsonb;binding jsonb;probe text;
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
 IF programme->>'monthlyForcedAmountsVersion'='own-monthly-forced-passthrough.v2' THEN forced_entries:=public.own_policy_resolve_candidate_v1(programme->'monthlyForcedAmountPolicies','monthly-forced');
 ELSE SELECT coalesce(jsonb_agg(jsonb_build_object('policy',f,'validFrom',f->'period','validUntil',f->'period')),'[]') INTO forced_entries FROM jsonb_array_elements(coalesce(programme->'monthlyForcedAmountPolicies','[]')) f;END IF;
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
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(forced_entries) f WHERE f#>'{policy,agreementCode}'=policy->'agreementCode' AND f#>'{policy,sourceCode}'=policy->'sourceCode' AND f#>'{policy,liquidationType}'=policy->'liquidationType' AND (f->'validUntil'='null'::jsonb OR f->>'validUntil'>=entry->>'validFrom') AND (entry->'validUntil'='null'::jsonb OR f->>'validFrom'<=entry->>'validUntil'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(programme->'monthlyDeclaredAdjustmentPolicies','[]')) f WHERE f->'agreementCode'=policy->'agreementCode' AND f->'sourceCode'=policy->'sourceCode' AND f->'liquidationType'=policy->'liquidationType' AND (f->'validUntil'='null'::jsonb OR f->>'validUntil'>=entry->>'validFrom') AND (entry->'validUntil'='null'::jsonb OR entry->>'validUntil'>=f->>'validFrom'))
  THEN RAISE EXCEPTION 'QUANTITY_ONLY_POLICY_COLLISION';END IF;
 END LOOP;
 RETURN jsonb_build_object('quantityOnlyInputsVersion','own-quantity-only-inputs.v1','quantityOnlyInputPolicies',policies);
END $quantity_only_options$;

-- Extracted canonical function only; see FUNCTION_INVENTORY.json.
-- This file is not a standalone production migration.
CREATE OR REPLACE FUNCTION public.own_run_monthly_forced_capture_check_candidate_v1(payload jsonb,input_value jsonb,result_value jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp AS $monthly_capture$
DECLARE programme jsonb:=payload#>'{programState,program,definition}';options jsonb;active_policies jsonb;batch jsonb;row_value jsonb;values_value jsonb;person jsonb;employee jsonb;policy jsonb;amount_input jsonb;presence_input jsonb;presence_binding jsonb;result_row jsonb;observation jsonb;actor jsonb;actors jsonb;rows_hash text;n integer;review_count integer;amount numeric;selected boolean;
BEGIN
 IF NOT coalesce(programme ?| ARRAY['monthlyForcedAmountsVersion','monthlyForcedAmountPolicies'],false) THEN RETURN;END IF;
 options:=public.own_program_monthly_forced_options_candidate_v1(programme);
 active_policies:=public.own_program_monthly_forced_active_candidate_v2(options,input_value->>'period',input_value->>'liquidationType');
 IF programme IS DISTINCT FROM public.own_program_definition_composed_v1(programme,payload#>'{programState,salaryCatalog,items}')
 OR coalesce((payload#>>'{programState,program,revision}')::integer,0)<=0
 OR payload#>'{programState,program,salaryVersion}' IS DISTINCT FROM payload#>'{programState,salaryCatalog,version}'
 OR input_value->'period' IS DISTINCT FROM payload->'period' OR input_value->'liquidationType' IS DISTINCT FROM payload->'liquidationType'
 OR input_value#>>'{sourceVersions,rules}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('program',payload#>'{programState,program}','salary',payload#>'{programState,salaryCatalog}'))
 OR input_value#>>'{sourceVersions,novelties}' IS DISTINCT FROM public.own_run_hash_v1(jsonb_build_object('monthly',payload->'monthly','fixed',payload#>'{fixed,export,data}'))
 OR payload#>'{monthly,complete}' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(payload#>'{monthly,batches}') IS DISTINCT FROM 'array'
 OR jsonb_typeof(coalesce(payload#>'{monthly,nativeBatches}','[]'::jsonb)) IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload#>'{monthly,batches}') b CROSS JOIN LATERAL jsonb_array_elements(b->'rows') r
  JOIN LATERAL jsonb_array_elements(payload#>'{population,employees}') e ON e->'contractId'=r->'employmentContractId'
  JOIN LATERAL jsonb_array_elements(active_policies) policy_value ON policy_value->'agreementCode'=e->'agreementCode' AND policy_value->'liquidationType'=input_value->'liquidationType' AND policy_value->'sourceCode'=r->'conceptSourceId'
  WHERE r->'forced'='true'::jsonb) THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_NATIVE_BATCH_REQUIRED';END IF;
 FOR batch IN SELECT value FROM jsonb_array_elements(coalesce(payload#>'{monthly,nativeBatches}','[]'::jsonb)) LOOP
  IF batch->>'version' IS DISTINCT FROM 'own-payroll-novelty-batch.v1' OR batch->>'status' IS DISTINCT FROM 'approved'
  OR batch->>'periodMonth' IS DISTINCT FROM (input_value->>'period')||'-01' OR batch->'payrollType' IS DISTINCT FROM input_value->'liquidationType'
  OR jsonb_typeof(batch->'rows') IS DISTINCT FROM 'array' OR batch->'rowCount' IS DISTINCT FROM to_jsonb(jsonb_array_length(batch->'rows'))
  OR batch->'grhMutation' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollCalculated' IS DISTINCT FROM 'false'::jsonb OR batch->'payrollPosted' IS DISTINCT FROM 'false'::jsonb
  THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
  SELECT public.own_run_hash_v1(jsonb_agg(jsonb_build_object('values',r->'values','subject',r->'subject') ORDER BY ordinal)) INTO rows_hash FROM jsonb_array_elements(batch->'rows') WITH ORDINALITY x(r,ordinal);
  IF batch->>'rowsSha256' IS DISTINCT FROM rows_hash THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
  PERFORM public.own_novelty_rows_v1((SELECT jsonb_agg(r->'values' ORDER BY ordinal) FROM jsonb_array_elements(batch->'rows') WITH ORDINALITY x(r,ordinal)),((input_value->>'period')||'-01')::date);
  FOR row_value IN SELECT value FROM jsonb_array_elements(batch->'rows') LOOP
   values_value:=row_value->'values';
   SELECT count(*),jsonb_agg(e)->0 INTO n,person FROM jsonb_array_elements(payload#>'{population,employees}') e WHERE e->'contractId'=values_value->'contractId';
   IF n=0 THEN CONTINUE;END IF;
   IF n<>1 THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
   SELECT count(*),jsonb_agg(p)->0 INTO n,policy FROM jsonb_array_elements(active_policies) p WHERE p->'agreementCode'=person->'agreementCode' AND p->'liquidationType'=input_value->'liquidationType' AND p->'sourceCode'=values_value->'conceptSourceId';
   IF n=0 THEN CONTINUE;END IF;
   IF n<>1 OR (values_value->'forced'='true'::jsonb AND values_value->'quantityDecimal' IS DISTINCT FROM '"0"'::jsonb) OR jsonb_typeof(values_value->'amountCents') IS DISTINCT FROM 'string' OR coalesce(values_value->>'amountCents','')!~'^-?(0|[1-9][0-9]{0,17})$' OR values_value->>'amountCents'='-0'
   OR row_value->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR values_value->'identityToken' IS DISTINCT FROM person->'identityToken' OR values_value->'legajo' IS DISTINCT FROM person->'employeeNumber'
   OR row_value#>'{subject,contractId}' IS DISTINCT FROM person->'contractId' OR row_value#>'{subject,identityToken}' IS DISTINCT FROM person->'identityToken' OR row_value#>'{subject,legajo}' IS DISTINCT FROM person->'employeeNumber'
   OR (values_value->'adjustmentMonth' IS DISTINCT FROM 'null'::jsonb AND values_value->>'adjustmentMonth' IS DISTINCT FROM (input_value->>'period')||'-01')
   THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
   IF jsonb_typeof(batch->'approvals') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_REVIEW_REQUIRED';END IF;
   review_count:=jsonb_array_length(batch->'approvals');
   -- Current batches need one independent reviewer. Historical forced batches
   -- retain their two original reviewers; neither approvals nor provenance are rewritten.
   IF review_count<1 OR review_count>(CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(batch->'rows') r WHERE r#>'{values,forced}'='true'::jsonb) THEN 2 ELSE 1 END)
    OR batch->'decidedBy' IS DISTINCT FROM (batch->'approvals')->(review_count-1) THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_REVIEW_REQUIRED';END IF;
   actors:=jsonb_build_array(batch->'preparedBy')||(batch->'approvals');
   FOR actor IN SELECT value FROM jsonb_array_elements(actors) LOOP
    IF public.own_program_exact_v1(actor,ARRAY['membershipId','personId']) IS NOT TRUE OR coalesce(actor->>'membershipId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR coalesce(actor->>'personId','')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_REVIEW_REQUIRED';END IF;
   END LOOP;
   IF (SELECT count(DISTINCT a->>'membershipId') FROM jsonb_array_elements(actors) a)<>review_count+1 OR (SELECT count(DISTINCT a->>'personId') FROM jsonb_array_elements(actors) a)<>review_count+1 THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_REVIEW_REQUIRED';END IF;
   SELECT count(*) INTO n FROM (
    SELECT r->'employmentContractId' contract_id,r->'conceptSourceId' concept FROM jsonb_array_elements(payload#>'{monthly,batches}') b CROSS JOIN LATERAL jsonb_array_elements(b->'rows') r
    UNION ALL SELECT r#>'{values,contractId}',r#>'{values,conceptSourceId}' FROM jsonb_array_elements(coalesce(payload#>'{monthly,nativeBatches}','[]'::jsonb)) b CROSS JOIN LATERAL jsonb_array_elements(b->'rows') r
    UNION ALL SELECT r#>'{subject,contractId}',r#>'{values,conceptSourceId}' FROM jsonb_array_elements(payload#>'{fixed,export,data,rows}') r
   ) sources WHERE sources.contract_id=person->'contractId' AND sources.concept=policy->'sourceCode';
   IF n<>1 THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_SOURCE_COLLISION';END IF;
   SELECT count(*),jsonb_agg(e)->0 INTO n,employee FROM jsonb_array_elements(input_value->'employees') e WHERE e->'contractId'=person->'contractId';
   IF n<>1 OR employee->'agreementCode' IS DISTINCT FROM person->'agreementCode' THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
   SELECT count(*),jsonb_agg(i)->0 INTO n,amount_input FROM jsonb_array_elements(employee->'inputs') i WHERE i->'key'=policy->'amountInputKey';
   IF n<>1 OR amount_input->>'unit' IS DISTINCT FROM 'money' OR coalesce(amount_input->>'value','')!~'^-?(0|[1-9][0-9]{0,17})[.][0-9]{8}$' OR amount_input->>'value'='-0.00000000' THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
   amount:=(values_value->>'amountCents')::numeric;
   IF (amount_input->>'value')::numeric*100<>amount THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
   SELECT count(*),jsonb_agg(i)->0 INTO n,presence_input FROM jsonb_array_elements(employee->'inputs') i WHERE i->'key'=policy->'presenceInputKey';
   IF n<>1 OR presence_input->>'unit' IS DISTINCT FROM 'coefficient' OR presence_input->>'value' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
   SELECT b INTO presence_binding FROM jsonb_array_elements(programme->'bindings') b WHERE b->'agreementCode'=policy->'agreementCode' AND b->'key'=policy->'presenceInputKey';
   observation:=jsonb_build_object('sourceKind','monthly','contractId',person->'contractId','concept',values_value->'conceptSourceId','quantity',values_value->'quantityDecimal','amount',values_value->'amountCents','reference',(batch->>'id')||':'||(values_value->>'rowOrdinal'))||CASE WHEN values_value->'forced'='true'::jsonb THEN jsonb_build_object('forced',true,'forcedTreatment','declared_monthly_amount_passthrough','forcedPolicySha256',public.own_run_hash_v1(jsonb_build_object('version',CASE WHEN policy->>'version'='own-monthly-forced-passthrough.v2' THEN 'own-monthly-forced-passthrough.v2' ELSE 'own-monthly-forced-passthrough.v1' END,'policy',policy))) ELSE '{}'::jsonb END;
   IF amount_input->>'sourceReference' IS DISTINCT FROM 'Novedades:'||public.own_run_hash_v1(jsonb_build_array(observation))
   OR presence_input->>'sourceReference' IS DISTINCT FROM 'Presencia mensual:'||public.own_run_hash_v1(jsonb_build_object('complete',true,'period',input_value->'period','liquidationType',input_value->'liquidationType','contractId',person->'contractId','binding',presence_binding,'observations',jsonb_build_array(observation)))
   THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
   selected:=input_value#>>'{selection,kind}'='all' OR input_value#>'{selection,values}' ? (employee->>(CASE input_value#>>'{selection,kind}' WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' WHEN 'departments' THEN 'departmentCode' END));
   IF selected THEN
    SELECT count(*),jsonb_agg(r)->0 INTO n,result_row FROM jsonb_array_elements(result_value->'rows') r WHERE r->'contractId'=person->'contractId' AND r->'conceptCode'=policy->'sourceCode' AND r->>'nature'<>'auxiliary';
    IF n<>1 OR result_row->>'nature' IS DISTINCT FROM 'deduction' OR coalesce(result_row->>'amount','')!~'^-?(0|[1-9][0-9]{0,17})[.][0-9]{2}$' OR result_row->>'amount'='-0.00' THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
    IF (result_row->>'amount')::numeric*100<>amount THEN RAISE EXCEPTION 'OWN_RUN_MONTHLY_FORCED_CAPTURE_CHANGED';END IF;
   END IF;
  END LOOP;
 END LOOP;
END $monthly_capture$;

DO $monthly_validity_postimage$ BEGIN
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_monthly_forced_active_candidate_v2(jsonb,text,text)')) IS DISTINCT FROM '26d0a79875376c9e09c54476930854230f475eece59051f8ff7fd1a85c705881' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_POSTIMAGE_CHANGED: public.own_program_monthly_forced_active_candidate_v2(jsonb,text,text)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_monthly_forced_options_candidate_v2(jsonb)')) IS DISTINCT FROM 'f1adf1efd519af2021e054f620e003aa49f3775e566a08d1013e5f8f6e7407df' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_POSTIMAGE_CHANGED: public.own_program_monthly_forced_options_candidate_v2(jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_policy_resolve_candidate_v1(jsonb,text)')) IS DISTINCT FROM '37d4efd8e2a6ed9658cdf44ec1266325bcc86305557b4d869de88ac183fac831' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_POSTIMAGE_CHANGED: public.own_policy_resolve_candidate_v1(jsonb,text)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_monthly_forced_history_candidate_v1(jsonb,jsonb)')) IS DISTINCT FROM '5d99fd0bc1f8685d17f8de401e1c161d89212f074607c0d93cdaeac142f8230a' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_POSTIMAGE_CHANGED: public.own_program_monthly_forced_history_candidate_v1(jsonb,jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_monthly_forced_options_candidate_v1(jsonb)')) IS DISTINCT FROM 'b708b647fb0f0172c9cbd93805b5fe85d3915d8a7245f0ec01ca8df654001c22' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_POSTIMAGE_CHANGED: public.own_program_monthly_forced_options_candidate_v1(jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_program_quantity_only_options_v1(jsonb)')) IS DISTINCT FROM 'd03d5f28eb6d71685bc29dc73b7dbdcdebbe0d0da15adbc3a3b9023946f83717' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_POSTIMAGE_CHANGED: public.own_program_quantity_only_options_v1(jsonb)';END IF;
 IF (SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc WHERE oid=to_regprocedure('public.own_run_monthly_forced_capture_check_candidate_v1(jsonb,jsonb,jsonb)')) IS DISTINCT FROM '5795a3e8758a36ffea344db81d15ca360c5ebfbea6ebfa3466d1be355bb3b411' THEN RAISE EXCEPTION 'MONTHLY_FORCED_VALIDITY_POSTIMAGE_CHANGED: public.own_run_monthly_forced_capture_check_candidate_v1(jsonb,jsonb,jsonb)';END IF;
END $monthly_validity_postimage$;
COMMIT;
