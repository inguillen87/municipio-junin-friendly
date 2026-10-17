-- Explicit native fixed forced amounts, opt-in v1. Additive candidate; migration ID pending root.
-- No source-derived formula, default unit, historical-U certification, table,
-- role, grant, RLS alteration or data rewrite. Existing callable OIDs/ACLs remain.
-- Apply only after the existing chain through 190 and independent native review.

CREATE OR REPLACE FUNCTION public.own_fixed_forced_expression_set_v1(rules jsonb, policies jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp' AS $function$
 SELECT coalesce(jsonb_agg(jsonb_build_object('ruleKey',public.own_participation_rule_key_v1(r),'expression',r->'expression') ORDER BY public.own_participation_rule_key_v1(r) COLLATE "C"),'[]'::jsonb)
 FROM jsonb_array_elements(rules) r
 WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(policies) policy
  JOIN LATERAL(SELECT target FROM jsonb_array_elements(rules) target WHERE public.own_participation_rule_key_v1(target)=policy->>'ruleKey') selected ON true
  WHERE r->>'agreementCode'=selected.target->>'agreementCode'
   AND coalesce(r->>'validUntil','9999-12')>=selected.target->>'validFrom'
   AND coalesce(selected.target->>'validUntil','9999-12')>=r->>'validFrom'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'liquidationTypes') t WHERE selected.target->'liquidationTypes' ? t))
$function$;

CREATE OR REPLACE FUNCTION public.own_fixed_forced_policy_v1(p jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp' AS $function$
DECLARE feature jsonb:=p->'fixedForcedAmountsPolicy';lineage jsonb;entry jsonb;target jsonb;field text;previous text;num integer;
BEGIN
 IF NOT(p ? 'fixedForcedAmountsVersion' OR p ? 'fixedForcedAmountsPolicy') THEN RETURN false;END IF;
 IF p->>'fixedForcedAmountsVersion' IS DISTINCT FROM 'own-fixed-forced-amount.v1' OR p->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2'
  OR NOT public.own_program_exact_v1(feature,ARRAY['quantityLineage','policies']) THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_POLICY_INVALID';END IF;
 lineage:=feature->'quantityLineage';
 -- These are reviewed documentary declarations. Digests do not prove that an
 -- external historical U was preserved or that its declaration is truthful.
 IF NOT public.own_program_exact_v1(lineage,ARRAY['version','sourceSha256','sourceControlSha256','expressionSetSha256','complete'])
  OR lineage->>'version' IS DISTINCT FROM 'own-quantity-lineage-review.v1' OR lineage->'complete' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_LINEAGE_REQUIRED';END IF;
 FOREACH field IN ARRAY ARRAY['sourceSha256','sourceControlSha256','expressionSetSha256'] LOOP
  IF jsonb_typeof(lineage->field) IS DISTINCT FROM 'string' OR lineage->>field!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_LINEAGE_REQUIRED';END IF;
 END LOOP;
 IF jsonb_typeof(feature->'policies') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'rules') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_POLICY_INVALID';END IF;
 IF jsonb_array_length(feature->'policies') NOT BETWEEN 1 AND 1000 OR jsonb_array_length(feature->'policies')>jsonb_array_length(p->'rules') THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_POLICY_INVALID';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(feature->'policies') LOOP
  IF NOT public.own_program_exact_v1(entry,ARRAY['ruleKey','sourceKind','sourceCode','quantityPolicy','sourceSha256','ruleReference'])
   OR entry->>'sourceKind' IS DISTINCT FROM 'fixed_amount' OR entry->>'quantityPolicy' IS DISTINCT FROM 'reject'
   OR jsonb_typeof(entry->'ruleKey') IS DISTINCT FROM 'string' OR jsonb_typeof(entry->'sourceCode') IS DISTINCT FROM 'string'
   OR jsonb_typeof(entry->'sourceSha256') IS DISTINCT FROM 'string' OR entry->>'sourceSha256'!~'^[a-f0-9]{64}$'
   OR NOT public.own_program_text_v1(entry->'ruleReference',3,180) OR previous IS NOT NULL AND (entry->>'ruleKey') COLLATE "C"<=previous COLLATE "C" THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_POLICY_INVALID';END IF;
  previous:=entry->>'ruleKey';
  SELECT count(*),jsonb_agg(r)->0 INTO num,target FROM jsonb_array_elements(p->'rules') r WHERE public.own_participation_rule_key_v1(r)=entry->>'ruleKey';
  IF num<>1 OR target->>'nature'='auxiliary' OR target->>'unit' IS DISTINCT FROM 'money' OR entry->>'sourceCode' IS DISTINCT FROM target->>'code'
   OR jsonb_path_exists(target->'expression','$.** ? (@.op == "concept" || @.op == "auxiliary" || @.op == "quantity_phase")') THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_POLICY_INVALID';END IF;
 END LOOP;
 IF lineage->>'expressionSetSha256' IS DISTINCT FROM public.own_run_hash_v1(public.own_fixed_forced_expression_set_v1(p->'rules',feature->'policies')) THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_SOURCE_CHANGED';END IF;
 RETURN true;
END $function$;

CREATE OR REPLACE FUNCTION public.own_fixed_forced_capture_v1(c public.own_payroll_run_capture, input_value jsonb, result_value jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','pg_temp' AS $function$
DECLARE definition jsonb:=c.payload#>'{programState,program,definition}';enabled boolean;list_data jsonb;export_data jsonb;row_value jsonb;listed jsonb;values_value jsonb;employee jsonb;population_employee jsonb;batch jsonb;observation jsonb;policy jsonb;target jsonb;effective jsonb;expected jsonb;ledger jsonb;required_keys jsonb;actual_keys jsonb;input_row jsonb;binding jsonb;result_row jsonb;exact_value jsonb;expected_trace jsonb;subject_value jsonb;node jsonb;num integer;selected_count integer;consumed text[]:='{}';observations jsonb:='[]';forced_codes text[];reference_value text;family text;period_first text:=c.body->>'period'||'-01';period_last text;has_participation boolean;g bigint;a bigint;b bigint;t bigint;amount_value bigint;
BEGIN
 enabled:=public.own_fixed_forced_policy_v1(definition);
 IF NOT enabled THEN
  IF input_value ? 'fixedForcedAmountsVersion' OR input_value ? 'fixedForcedAmountsPolicy' OR EXISTS(SELECT 1 FROM jsonb_array_elements(input_value->'employees') e WHERE e ? 'fixedForcedAmounts') THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  RETURN;
 END IF;
 IF c.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(c.body) OR c.payload_sha256 IS DISTINCT FROM public.own_run_hash_v1(c.payload)
  OR input_value->'fixedForcedAmountsVersion' IS DISTINCT FROM definition->'fixedForcedAmountsVersion' OR input_value->'fixedForcedAmountsPolicy' IS DISTINCT FROM definition->'fixedForcedAmountsPolicy'
  OR coalesce((c.payload#>>'{programState,program,revision}')::integer,0)<=0 OR c.payload#>>'{programState,program,salaryVersion}' IS DISTINCT FROM c.payload#>>'{programState,salaryCatalog,version}'
  OR public.own_program_definition_v1(definition,c.payload#>'{programState,salaryCatalog,items}') IS DISTINCT FROM definition THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
 period_last:=to_char((period_first::date+interval '1 month'-interval '1 day')::date,'YYYY-MM-DD');
 has_participation:=definition#>>'{periodParticipation,version}'='own-period-participation.v1';
 effective:=public.own_participation_rules_v1(definition);
 list_data:=c.payload#>'{fixed,list,data}';export_data:=c.payload#>'{fixed,export,data}';
 IF c.payload#>'{fixed,list,ok}' IS DISTINCT FROM 'true'::jsonb OR c.payload#>'{fixed,export,ok}' IS DISTINCT FROM 'true'::jsonb
  OR list_data->>'version' IS DISTINCT FROM 'payroll-fixed-list.v1' OR export_data->>'version' IS DISTINCT FROM 'payroll-fixed-export.v1'
  OR list_data->>'periodMonth' IS DISTINCT FROM period_first OR export_data->>'periodMonth' IS DISTINCT FROM period_first
  OR jsonb_typeof(list_data->'snapshotToken') IS DISTINCT FROM 'string' OR list_data->>'snapshotToken'!~'^[a-f0-9]{64}$' OR export_data->'snapshotToken' IS DISTINCT FROM list_data->'snapshotToken'
  OR jsonb_typeof(list_data->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(export_data->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
 IF jsonb_array_length(list_data->'rows')>500 OR jsonb_array_length(export_data->'rows')>500 OR list_data->'total' IS DISTINCT FROM to_jsonb(jsonb_array_length(list_data->'rows')) OR export_data->'total' IS DISTINCT FROM to_jsonb(jsonb_array_length(export_data->'rows'))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(list_data->'rows') r GROUP BY r->>'id' HAVING count(*)>1) OR EXISTS(SELECT 1 FROM jsonb_array_elements(export_data->'rows') r GROUP BY r->>'recordId' HAVING count(*)>1) THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_COLLISION';END IF;
 IF jsonb_array_length(export_data->'rows')<>(SELECT count(*) FROM jsonb_array_elements(list_data->'rows') r WHERE r#>>'{approved,operation}'='set' AND r#>>'{approved,values,validFrom}'<=period_last AND coalesce(r#>>'{approved,values,validTo}','9999-12-31')>=period_first) THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
 FOR row_value IN SELECT value FROM jsonb_array_elements(export_data->'rows') LOOP
  IF NOT public.own_program_exact_v1(row_value,ARRAY['recordId','version','proposalId','subject','values']) OR jsonb_typeof(row_value->'recordId') IS DISTINCT FROM 'string' OR row_value->>'recordId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(row_value->'proposalId') IS DISTINCT FROM 'string' OR row_value->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(row_value->'version') IS DISTINCT FROM 'number' OR row_value->>'version'!~'^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  SELECT count(*),jsonb_agg(r)->0 INTO num,listed FROM jsonb_array_elements(list_data->'rows') r WHERE r->'id'=row_value->'recordId';
  IF num<>1 OR listed->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR listed->'version' IS DISTINCT FROM row_value->'version' OR listed#>>'{approved,operation}' IS DISTINCT FROM 'set' OR listed#>'{approved,id}' IS DISTINCT FROM row_value->'proposalId' OR listed#>>'{approved,review,decision}' IS DISTINCT FROM 'approve' OR listed->'subject' IS DISTINCT FROM row_value->'subject' OR listed#>'{approved,values}' IS DISTINCT FROM row_value->'values' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  values_value:=row_value->'values';IF values_value->'forced'='true'::jsonb THEN IF values_value->'amountCents' IS NULL OR values_value->'amountCents'='null'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_FORCED_AMOUNT_MISSING';END IF;IF values_value->'quantityDecimal' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_FORCED_QUANTITY_UNKNOWN';END IF;END IF;PERFORM public.payroll_fixed_registry_validate_values_v1(values_value);
  IF values_value->>'payrollType' IS DISTINCT FROM c.body->>'liquidationType' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  subject_value:=row_value->'subject';
  SELECT count(*),jsonb_agg(e)->0 INTO num,population_employee FROM jsonb_array_elements(c.payload#>'{population,employees}') e WHERE e->'contractId'=subject_value->'contractId';
  IF num<>1 OR subject_value->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR subject_value->'sourceCutoff' IS DISTINCT FROM 'null'::jsonb OR subject_value->'legajo' IS DISTINCT FROM population_employee->'employeeNumber' OR subject_value->'identityToken' IS DISTINCT FROM population_employee->'identityToken' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED';END IF;
  observations:=observations||jsonb_build_array(jsonb_build_object('family','fixed','contractId',subject_value->'contractId','concept',values_value->'conceptSourceId','forced',values_value->'forced','row',row_value,'reference',(row_value->>'recordId')||':'||(row_value->>'proposalId')));
 END LOOP;
 IF c.payload#>'{monthly,complete}' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(c.payload#>'{monthly,batches}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
 FOR batch IN SELECT value FROM jsonb_array_elements(c.payload#>'{monthly,batches}') LOOP
  IF batch->>'periodMonth' IS DISTINCT FROM period_first OR batch->>'payrollType' IS DISTINCT FROM c.body->>'liquidationType' OR jsonb_typeof(batch->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  FOR row_value IN SELECT value FROM jsonb_array_elements(batch->'rows') LOOP
   IF row_value->'forced' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_FORCED_RULE_REQUIRED';END IF;
   IF row_value->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR row_value#>'{subject,contractId}' IS DISTINCT FROM row_value->'employmentContractId' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{population,employees}') e WHERE e->'contractId'=row_value->'employmentContractId' AND e->'employeeNumber'=row_value#>'{subject,legajo}' AND e->'identityToken'=row_value#>'{subject,identityToken}') THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_IDENTITY_CHANGED';END IF;
   observations:=observations||jsonb_build_array(jsonb_build_object('family','monthly','contractId',row_value->'employmentContractId','concept',row_value->'conceptSourceId','forced',false,'row',row_value,'reference',(batch->>'id')||':'||(row_value->>'rowOrdinal')));
  END LOOP;
 END LOOP;
 IF c.payload->'monthly' ? 'nativeBatches' THEN
  IF jsonb_typeof(c.payload#>'{monthly,nativeBatches}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  FOR batch IN SELECT value FROM jsonb_array_elements(c.payload#>'{monthly,nativeBatches}') LOOP
   IF batch->>'status' IS DISTINCT FROM 'approved' OR batch->>'periodMonth' IS DISTINCT FROM period_first OR batch->>'payrollType' IS DISTINCT FROM c.body->>'liquidationType' OR batch->>'rowsSha256' IS DISTINCT FROM public.own_run_hash_v1((SELECT jsonb_agg(jsonb_build_object('values',r.value->'values','subject',r.value->'subject') ORDER BY r.ordinal) FROM jsonb_array_elements(batch->'rows') WITH ORDINALITY r(value,ordinal))) THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
   selected_count:=0;
   FOR row_value IN SELECT value FROM jsonb_array_elements(batch->'rows') LOOP
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{population,employees}') e WHERE e->'contractId'=row_value#>'{values,contractId}') THEN CONTINUE;END IF;
    selected_count:=selected_count+1;
    IF row_value#>'{values,forced}' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_FORCED_RULE_REQUIRED';END IF;
    IF row_value->'identityCurrent' IS DISTINCT FROM 'true'::jsonb OR row_value#>'{subject,contractId}' IS DISTINCT FROM row_value#>'{values,contractId}' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{population,employees}') e WHERE e->'contractId'=row_value#>'{values,contractId}' AND e->'employeeNumber'=row_value#>'{subject,legajo}' AND e->'identityToken'=row_value#>'{subject,identityToken}') THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_IDENTITY_CHANGED';END IF;
    observations:=observations||jsonb_build_array(jsonb_build_object('family','monthly','contractId',row_value#>'{values,contractId}','concept',row_value#>'{values,conceptSourceId}','forced',false,'row',row_value,'reference',(batch->>'id')||':'||(row_value#>>'{values,rowOrdinal}')));
   END LOOP;
   IF selected_count=0 THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  END LOOP;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(observations) o GROUP BY o->>'reference' HAVING count(*)>1) THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_COLLISION';END IF;
 FOR employee IN SELECT value FROM jsonb_array_elements(input_value->'employees') LOOP
  SELECT count(*),jsonb_agg(e)->0 INTO num,population_employee FROM jsonb_array_elements(c.payload#>'{population,employees}') e WHERE e->'contractId'=employee->'contractId';
  IF num<>1 OR employee->'employeeNumber' IS DISTINCT FROM population_employee->'employeeNumber' OR employee->'agreementCode' IS DISTINCT FROM population_employee->'agreementCode' OR employee->'departmentCode' IS DISTINCT FROM population_employee->'departmentCode' OR jsonb_typeof(employee->'fixedForcedAmounts') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  expected:='[]';forced_codes:='{}';
  FOR observation IN SELECT value FROM jsonb_array_elements(observations) o WHERE o->'contractId'=employee->'contractId' AND o->'forced'='true'::jsonb LOOP
   IF observation->>'family'<>'fixed' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_RULE_REQUIRED';END IF;
   row_value:=observation->'row';values_value:=row_value->'values';
   SELECT count(*),jsonb_agg(r)->0 INTO num,target FROM jsonb_array_elements(definition->'rules') r WHERE r->'agreementCode'=employee->'agreementCode' AND r->>'nature'<>'auxiliary' AND r->'code'=observation->'concept' AND r->>'validFrom'<=c.body->>'period' AND coalesce(r->>'validUntil','9999-12')>=c.body->>'period' AND r->'liquidationTypes' ? (c.body->>'liquidationType');
   IF num<>1 THEN RAISE EXCEPTION 'OWN_RUN_FORCED_RULE_REQUIRED';END IF;
   SELECT count(*),jsonb_agg(entry)->0 INTO num,policy FROM jsonb_array_elements(definition#>'{fixedForcedAmountsPolicy,policies}') entry WHERE entry->>'ruleKey'=public.own_participation_rule_key_v1(target);
   IF num<>1 THEN RAISE EXCEPTION 'OWN_RUN_FORCED_RULE_REQUIRED';END IF;
   IF (SELECT count(*) FROM jsonb_array_elements(observations) o WHERE o->'contractId'=employee->'contractId' AND o->'concept'=observation->'concept')<>1 THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_COLLISION';END IF;
   IF values_value->'amountCents' IS NULL OR values_value->'amountCents'='null'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_FORCED_AMOUNT_MISSING';END IF;
   IF values_value->'quantityDecimal' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_FORCED_QUANTITY_UNKNOWN';END IF;
   IF values_value->>'validFrom'>period_first OR coalesce(values_value->>'validTo','9999-12-31')<period_last THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;
   IF has_participation AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{periodParticipation,records}') r WHERE r->'contractId'=employee->'contractId' AND r->'fullPeriod'='true'::jsonb) THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED';END IF;
   ledger:=jsonb_build_object('ruleKey',policy->'ruleKey','policySha256',public.own_run_hash_v1(jsonb_build_object('version',definition->'fixedForcedAmountsVersion','policy',policy)),'recordId',row_value->'recordId','recordVersion',row_value->'version','proposalId',row_value->'proposalId','sourceRowSha256',public.own_run_hash_v1(row_value),'amountCents',values_value->'amountCents');
   expected:=expected||jsonb_build_array(ledger);forced_codes:=forced_codes||(target->>'code');consumed:=consumed||(observation->>'reference');
   SELECT count(*),jsonb_agg(r)->0 INTO num,result_row FROM jsonb_array_elements(result_value->'rows') r WHERE r->'contractId'=employee->'contractId' AND r->'conceptCode'=target->'code' AND r->'nature'=target->'nature';
   IF num<>1 OR NOT public.own_program_exact_v1(result_row,ARRAY['contractId','employeeNumber','agreementCode','departmentCode','conceptCode','nature','unit','amount','exactValue','rounding','ruleReference','dependencies','trace']) OR result_row->'employeeNumber' IS DISTINCT FROM employee->'employeeNumber' OR result_row->'agreementCode' IS DISTINCT FROM employee->'agreementCode' OR result_row->'departmentCode' IS DISTINCT FROM employee->'departmentCode' OR result_row->'unit' IS DISTINCT FROM target->'unit' OR result_row->'rounding' IS DISTINCT FROM target->'rounding' OR result_row->'ruleReference' IS DISTINCT FROM target->'ruleReference' OR jsonb_typeof(result_row->'amount') IS DISTINCT FROM 'string' OR result_row->>'amount'!~'^-?(0|[1-9][0-9]{0,95})([.][0-9]{1,8})?$' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
   amount_value:=(values_value->>'amountCents')::bigint;a:=abs(amount_value);b:=100;WHILE b<>0 LOOP t:=a%b;a:=b;b:=t;END LOOP;g:=a;
   exact_value:=jsonb_build_object('numerator',(amount_value/g)::text,'denominator',(100/g)::text);
   reference_value:=(ledger->>'recordId')||':'||(ledger->>'recordVersion')||':'||(ledger->>'proposalId')||':'||(ledger->>'policySha256')||':'||(ledger->>'sourceRowSha256');
   expected_trace:=jsonb_build_array(jsonb_build_object('operation','fixed_forced_amount','reference',reference_value,'stage','exact','result',exact_value));
   IF length(split_part(result_row->>'amount','.',2))<>(target#>>'{rounding,precision}')::integer OR (target#>>'{rounding,precision}')::integer=0 AND position('.' IN result_row->>'amount')>0 OR result_row->>'amount'~'^-0([.]0+)?$' OR (result_row->>'amount')::numeric*100<>amount_value OR result_row->'exactValue' IS DISTINCT FROM exact_value OR result_row->'trace' IS DISTINCT FROM expected_trace OR result_row->'dependencies' IS DISTINCT FROM '[]'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'ruleKey') COLLATE "C",(x->>'recordId') COLLATE "C"),'[]') INTO expected FROM jsonb_array_elements(expected) x;
  IF jsonb_array_length(employee->'fixedForcedAmounts')>500 OR employee->'fixedForcedAmounts' IS DISTINCT FROM expected THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  required_keys:='[]';
  FOR target IN SELECT r FROM jsonb_array_elements(effective) r WHERE r->'agreementCode'=employee->'agreementCode' AND r->>'validFrom'<=c.body->>'period' AND coalesce(r->>'validUntil','9999-12')>=c.body->>'period' AND r->'liquidationTypes' ? (c.body->>'liquidationType') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_path_query(target->'expression','$.** ? (@.op == "quantity_phase")') n WHERE n->>'code'=ANY(forced_codes)) THEN RAISE EXCEPTION 'OWN_RUN_FORCED_QUANTITY_UNKNOWN';END IF;
   IF target->>'nature'<>'auxiliary' AND target->>'code'=ANY(forced_codes) THEN CONTINUE;END IF;
   FOR node IN SELECT value FROM jsonb_path_query(target->'expression','$.** ? (@.op == "input" || @.op == "match")') n(value) LOOP required_keys:=required_keys||jsonb_build_array(node->'key');END LOOP;
  END LOOP;
  SELECT coalesce(jsonb_agg(value ORDER BY value::text COLLATE "C"),'[]') INTO required_keys FROM(SELECT DISTINCT value FROM jsonb_array_elements(required_keys)) keys;
  SELECT coalesce(jsonb_agg(i->'key' ORDER BY (i->>'key') COLLATE "C"),'[]') INTO actual_keys FROM jsonb_array_elements(employee->'inputs') i;
  IF actual_keys IS DISTINCT FROM required_keys THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
  FOR input_row IN SELECT value FROM jsonb_array_elements(employee->'inputs') LOOP
   SELECT x INTO binding FROM jsonb_array_elements(definition->'bindings') x WHERE x->'agreementCode'=employee->'agreementCode' AND x->'key'=input_row->'key';
   IF NOT FOUND OR input_row->'unit' IS DISTINCT FROM binding->'unit' THEN RAISE EXCEPTION 'OWN_RUN_FORCED_SOURCE_CHANGED';END IF;
   IF binding->>'sourceKind' IN('monthly_quantity','monthly_amount','fixed_quantity','fixed_amount') THEN
    family:=CASE WHEN binding->>'sourceKind' LIKE 'monthly_%' THEN 'monthly' ELSE 'fixed' END;
    FOR observation IN SELECT value FROM jsonb_array_elements(observations) o WHERE o->'family'=to_jsonb(family) AND o->'contractId'=employee->'contractId' AND o->'concept'=binding->'sourceCode' LOOP consumed:=consumed||(observation->>'reference');END LOOP;
   END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(observations) o WHERE NOT(o->>'reference'=ANY(consumed))) THEN RAISE EXCEPTION 'OWN_RUN_SOURCE_UNUSED';END IF;
END $function$;


CREATE OR REPLACE FUNCTION public.own_program_node_v2(n jsonb, depth integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE op text:=n->>'op';k text;c jsonb;nodes integer:=1;inputs jsonb:='[]';refs jsonb:='[]';keys text[];
BEGIN
 IF depth>32 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT'; END IF;
 CASE op WHEN 'literal' THEN keys:=ARRAY['op','unit','value'];WHEN 'input' THEN keys:=ARRAY['op','unit','key'];WHEN 'match' THEN keys:=ARRAY['op','key','type','operator','value'];WHEN 'concept' THEN keys:=ARRAY['op','code','stage'];WHEN 'auxiliary' THEN keys:=ARRAY['op','code','stage'];WHEN 'quantity_phase' THEN keys:=ARRAY['op','code','unit','stage','rounding','value','sourceReference','sourceSha256'];WHEN 'round' THEN keys:=ARRAY['op','value','rounding'];WHEN 'convert' THEN keys:=ARRAY['op','value','unit','factor','conversionReference'];WHEN 'choose' THEN keys:=ARRAY['op','condition','then','else'];WHEN 'compare' THEN keys:=ARRAY['op','operator','left','right'];ELSE IF op IN('add','subtract','multiply','divide','min','max') THEN keys:=ARRAY['op','left','right'];ELSE RAISE EXCEPTION 'OWN_PROGRAM_OPERATION_UNSUPPORTED';END IF;END CASE;
 IF NOT public.own_program_exact_v1(n,keys) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID'; END IF;
 IF jsonb_typeof(n->'op') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 FOREACH k IN ARRAY ARRAY['unit','key','code','stage','operator','type'] LOOP IF k=ANY(keys) AND jsonb_typeof(n->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;END LOOP;
 IF op IN('literal','input','convert') AND coalesce(n->>'unit' IN('money','hours','minutes','days','percent','units','coefficient'),false) IS NOT TRUE THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH'; END IF;
 IF op='literal' AND(jsonb_typeof(n->'value') IS DISTINCT FROM 'string' OR n->>'value'!~'^-?(0|[1-9][0-9]{0,95})(\.[0-9]{1,8})?$' OR n->>'value'~'^-0(\.0+)?$') THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF op='match' THEN
  IF n->>'key' IS NULL OR n->>'key'!~'^[A-Za-z][A-Za-z0-9_]{0,63}$'
  OR coalesce(n->>'type' IN('code','boolean'),false) IS NOT TRUE
  OR coalesce(n->>'operator' IN('eq','ne'),false) IS NOT TRUE
  OR n->>'type'='code' AND(jsonb_typeof(n->'value') IS DISTINCT FROM 'string' OR n->>'value'!~'^[A-Za-z0-9_]{1,32}$')
  OR n->>'type'='boolean' AND jsonb_typeof(n->'value') IS DISTINCT FROM 'boolean'
  THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  inputs:=jsonb_build_array(jsonb_build_object('key',n->>'key','unit',n->>'type'));
 END IF;
 IF op='input' THEN IF n->>'key' IS NULL OR n->>'key'!~'^[A-Za-z][A-Za-z0-9_]{0,63}$' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;inputs:=jsonb_build_array(jsonb_build_object('key',n->>'key','unit',n->>'unit'));END IF;
 IF op IN('concept','auxiliary') AND(n->>'code' IS NULL OR n->>'code'!~'^[0-9]{1,9}$' OR coalesce(n->>'stage' IN('exact','rounded'),false) IS NOT TRUE) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF op IN('concept','auxiliary') THEN refs:=jsonb_build_array(op||':'||(n->>'code'));END IF;
 IF op='quantity_phase' AND (n->>'code'!~'^[0-9]{1,9}$' OR n->>'unit' NOT IN('money','hours','minutes','days','percent','units','coefficient') OR n->>'stage' NOT IN('exact','rounded') OR NOT public.own_program_text_v1(n->'sourceReference',1,180) OR jsonb_typeof(n->'sourceSha256') IS DISTINCT FROM 'string' OR n->>'sourceSha256'!~'^[a-f0-9]{64}$' OR CASE WHEN n->>'stage'='exact' THEN n->'rounding' IS DISTINCT FROM 'null'::jsonb ELSE NOT public.own_program_rounding_v1(n->'rounding') END) THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_LINEAGE_REQUIRED';END IF;
  IF op='round' AND NOT public.own_program_rounding_v1(n->'rounding') THEN RAISE EXCEPTION 'OWN_PROGRAM_ROUNDING_REQUIRED';END IF;
 IF op='convert' AND(jsonb_typeof(n->'factor') IS DISTINCT FROM 'string' OR n->>'factor'!~'^-?(0|[1-9][0-9]{0,95})(\.[0-9]{1,8})?$' OR n->>'factor'~'^-0(\.0+)?$' OR NOT public.own_program_text_v1(n->'conversionReference',3,180)) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF op='compare' AND coalesce(n->>'operator' IN('lt','le','eq','ne','ge','gt'),false) IS NOT TRUE THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 FOREACH k IN ARRAY ARRAY['left','right','value','condition','then','else'] LOOP IF jsonb_typeof(n->k)='object' THEN c:=public.own_program_node_v2(n->k,depth+1);nodes:=nodes+(c->>'nodes')::integer;inputs:=inputs||(c->'inputs');refs:=refs||(c->'refs');ELSIF (k=ANY(keys) AND k IN('left','right','condition','then','else')) OR(k='value' AND op IN('round','convert','quantity_phase')) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;END LOOP;
 IF nodes>256 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;RETURN jsonb_build_object('nodes',nodes,'inputs',inputs,'refs',refs);
END $function$;

CREATE OR REPLACE FUNCTION public.own_program_unit_v2(n jsonb, rules jsonb, agreement text, period text, kind_type text, path_codes text[], depth integer DEFAULT 0)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE op text:=n->>'op';a text;b text;target jsonb;num integer;
BEGIN
 IF depth>32 OR cardinality(path_codes)>64 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
 IF op='match' THEN RETURN 'boolean';END IF;
 IF op IN('literal','input') THEN RETURN n->>'unit';END IF;
 IF op IN('concept','auxiliary') THEN
  IF (op||':'||(n->>'code'))=ANY(path_codes) THEN RAISE EXCEPTION 'OWN_PROGRAM_CYCLE';END IF;
  SELECT count(*),jsonb_agg(r)->0 INTO num,target FROM jsonb_array_elements(rules) r WHERE r->>'agreementCode'=agreement AND r->>'code'=n->>'code' AND (r->>'nature'='auxiliary')=(op='auxiliary') AND r->>'validFrom'<=period AND(r->'validUntil'='null' OR r->>'validUntil'>=period) AND r->'liquidationTypes' ? kind_type;
  IF num<>1 THEN RAISE EXCEPTION 'OWN_PROGRAM_DEPENDENCY';END IF;
  -- The definition validator checks dependencies in topological waves. Reading
  -- the already checked declared unit avoids exponential recursive DAG walks.
  RETURN target->>'unit';
 END IF;
 IF op='quantity_phase' THEN
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(rules) r WHERE r->>'agreementCode'=agreement AND r->>'nature'<>'auxiliary' AND r->>'code'=n->>'code' AND r->>'validFrom'<=period AND coalesce(r->>'validUntil','9999-12')>=period AND r->'liquidationTypes' ? kind_type) THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_LINEAGE_REQUIRED';END IF;
   a:=public.own_program_unit_v2(n->'value',rules,agreement,period,kind_type,path_codes,depth+1);
   IF a IS DISTINCT FROM n->>'unit' OR a='boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;RETURN a;
  END IF;
  IF op IN('round','convert') THEN a:=public.own_program_unit_v2(n->'value',rules,agreement,period,kind_type,path_codes,depth+1);IF a='boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;RETURN CASE WHEN op='round' THEN a ELSE n->>'unit' END;END IF;
 IF op='choose' THEN
  IF public.own_program_unit_v2(n->'condition',rules,agreement,period,kind_type,path_codes,depth+1)<>'boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;
  a:=public.own_program_unit_v2(n->'then',rules,agreement,period,kind_type,path_codes,depth+1);b:=public.own_program_unit_v2(n->'else',rules,agreement,period,kind_type,path_codes,depth+1);IF a IS DISTINCT FROM b OR a='boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;RETURN a;
 END IF;
 a:=public.own_program_unit_v2(n->'left',rules,agreement,period,kind_type,path_codes,depth+1);b:=public.own_program_unit_v2(n->'right',rules,agreement,period,kind_type,path_codes,depth+1);
 IF a='boolean' OR b='boolean' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;
 IF op='multiply' THEN IF a<>'coefficient' AND b<>'coefficient' THEN RAISE EXCEPTION 'OWN_PROGRAM_CONVERSION_REQUIRED';END IF;RETURN CASE WHEN a='coefficient' THEN b ELSE a END;END IF;
 IF op='divide' THEN IF b<>'coefficient' AND a<>b THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;RETURN CASE WHEN a=b THEN 'coefficient' ELSE a END;END IF;
 IF a IS DISTINCT FROM b THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;RETURN CASE WHEN op='compare' THEN 'boolean' ELSE a END;
END $function$;

CREATE OR REPLACE FUNCTION public.own_program_definition_v1(p jsonb, items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE forced boolean:=p ? 'fixedForcedAmountsVersion' OR p ? 'fixedForcedAmountsPolicy';period_context boolean:=coalesce(p->>'periodContextVersion'='own-payroll-period-context.v1',false);agreement_working boolean:=coalesce(p->>'agreementWorkingTimeVersion'='own-agreement-working-time.v1',false);conditions boolean:=coalesce(p->>'salaryConditionsVersion'='own-contract-salary-conditions.v1',false);working boolean:=coalesce(p->>'workingTimeVersion'='own-contract-working-time.v1',false);r jsonb;b jsonb;i jsonb;node jsonb;matching jsonb;period text;kind_type text;normalized jsonb;used_keys text[]:='{}';binding_id text;field text;group_row record;active_rules jsonb;done_codes text[];ready_codes text[];wave integer;checked integer:=0;work integer:=0;part boolean:=coalesce(p#>>'{periodParticipation,version}'='own-period-participation.v1',false);facts boolean:=coalesce(p->>'employmentFactsVersion'='own-salary-seniority.v1',false);ns boolean:=coalesce(p->>'namespaceVersion'='own-payroll-namespaces.v2',false);
BEGIN
 IF NOT public.own_program_exact_v1(p,(CASE WHEN ns THEN ARRAY['namespaceVersion','rules','bindings','totalsPrecision'] ELSE ARRAY['rules','bindings','totalsPrecision'] END)||CASE WHEN facts THEN ARRAY['employmentFactsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN part THEN ARRAY['periodParticipation'] ELSE ARRAY[]::text[] END||CASE WHEN working THEN ARRAY['workingTimeVersion'] ELSE ARRAY[]::text[] END||CASE WHEN agreement_working THEN ARRAY['agreementWorkingTimeVersion'] ELSE ARRAY[]::text[] END||CASE WHEN period_context THEN ARRAY['periodContextVersion'] ELSE ARRAY[]::text[] END||CASE WHEN conditions THEN ARRAY['salaryConditionsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN forced THEN ARRAY['fixedForcedAmountsVersion','fixedForcedAmountsPolicy'] ELSE ARRAY[]::text[] END) OR jsonb_typeof(p->'totalsPrecision') IS DISTINCT FROM 'number' OR p->>'totalsPrecision'!~'^[0-8]$' OR jsonb_typeof(p->'rules') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'rules') NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p->'bindings') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'bindings')>1000 THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF forced THEN PERFORM public.own_fixed_forced_policy_v1(p);ELSIF jsonb_path_exists(p,'$.rules[*].expression.** ? (@.op == "quantity_phase")') THEN RAISE EXCEPTION 'OWN_PROGRAM_FORCED_LINEAGE_REQUIRED';END IF;
  IF part THEN IF NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;PERFORM public.own_participation_policy_v1(p);END IF;
 IF conditions AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF period_context AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF agreement_working AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF working AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 IF facts AND NOT ns THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
 FOR b IN SELECT value FROM jsonb_array_elements(p->'bindings') LOOP
  FOREACH field IN ARRAY ARRAY['agreementCode','key','unit','sourceKind',CASE WHEN b->>'sourceKind' IN('employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') THEN 'sourceField' ELSE 'sourceCode' END,'onMissing','combine','ruleReference'] LOOP IF jsonb_typeof(b->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;END LOOP;
  IF NOT public.own_program_exact_v1(b,CASE WHEN b->>'sourceKind' IN('employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') THEN ARRAY['agreementCode','key','unit','sourceKind','sourceField','onMissing','combine','ruleReference'] WHEN b->>'sourceKind'='scale_reference' THEN ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference','sourceAgreementCode','sourceCategoryCode'] ELSE ARRAY['agreementCode','key','unit','sourceKind','sourceCode','onMissing','combine','ruleReference'] END) OR b->>'agreementCode' IS NULL OR b->>'agreementCode'!~'^[0-9]{1,9}$' OR (b->>'sourceKind' NOT IN('employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') AND(b->>'sourceCode' IS NULL OR b->>'sourceCode'!~'^[0-9]{1,9}$')) OR b->>'key' IS NULL OR b->>'key'!~'^[A-Za-z][A-Za-z0-9_]{0,63}$' OR coalesce(b->>'unit' IN('money','hours','minutes','days','percent','units','coefficient') OR conditions AND b->>'sourceKind' IN('salary_condition_fact','classification_fact') AND b->>'unit' IN('code','boolean'),false) IS NOT TRUE OR coalesce(b->>'sourceKind' IN('parameter','auxiliary_parameter','scale','scale_reference','monthly_quantity','monthly_amount','fixed_quantity','fixed_amount','employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') AND(b->>'sourceKind'<>'employment_fact' OR facts) AND(b->>'sourceKind'<>'period_fact' OR part) AND(b->>'sourceKind'<>'working_time_fact' OR working) AND(b->>'sourceKind'<>'agreement_time_fact' OR agreement_working) AND(b->>'sourceKind'<>'period_context_fact' OR period_context) AND(b->>'sourceKind'<>'salary_condition_fact' OR conditions) AND(b->>'sourceKind'<>'classification_fact' OR conditions) AND (b->>'sourceKind'<>'auxiliary_parameter' OR ns),false) IS NOT TRUE OR coalesce(b->>'combine' IN('single','sum'),false) IS NOT TRUE OR coalesce(b->>'onMissing' IN('error','zero'),false) IS NOT TRUE OR NOT public.own_program_text_v1(b->'ruleReference',3,180) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='classification_fact' AND(NOT conditions OR b->>'sourceField' NOT IN('categoryCode','agreementCode') OR b->>'unit'<>'code' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='salary_condition_fact' AND(NOT conditions OR b->>'unit' IS DISTINCT FROM CASE b->>'sourceField' WHEN 'partialSeniorityYears' THEN 'units' WHEN 'titleStatus' THEN 'code' WHEN 'titleCode' THEN 'code' WHEN 'titlePercentage' THEN 'percent' WHEN 'unhealthyWork' THEN 'boolean' ELSE NULL END OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='period_context_fact' AND(b->>'sourceField'<>'monthNumber' OR b->>'unit'<>'units' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='agreement_time_fact' AND(b->>'sourceField'<>'monthlyHours' OR b->>'unit'<>'hours' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
  IF b->>'sourceKind'='working_time_fact' AND(b->>'sourceField' NOT IN('dailyHours','monthlyHours') OR b->>'unit'<>'hours' OR b->>'combine'<>'single' OR b->>'onMissing'<>'error') THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_INVALID';END IF;
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
  IF NOT conditions AND jsonb_path_exists(r->'expression','$.** ? (@.op == "match")') THEN RAISE EXCEPTION 'OWN_PROGRAM_OPERATION_UNSUPPORTED';END IF;
  work:=work+(node->>'nodes')::integer;IF work>3000000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
  SELECT jsonb_agg(d) INTO matching FROM jsonb_array_elements(items) d WHERE d->>'active'='true' AND d->>'kind'=CASE WHEN ns AND r->>'nature'='auxiliary' THEN 'auxiliary' ELSE 'concept' END AND d->>'agreementCode'=r->>'agreementCode' AND d->>'code'=r->>'code' AND d->>'nature'=r->>'nature' AND(r->>'nature'<>'auxiliary' OR d->>'unit'=r->>'unit');
  IF NOT public.own_program_coverage_v1(matching,r->>'validFrom',r->>'validUntil') THEN RAISE EXCEPTION 'OWN_PROGRAM_DEFINITION_MISSING';END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(node->'inputs') LOOP
   SELECT x INTO b FROM jsonb_array_elements(p->'bindings') x WHERE x->>'agreementCode'=r->>'agreementCode' AND x->>'key'=i->>'key';
   IF NOT FOUND OR b->>'unit' IS DISTINCT FROM i->>'unit' THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_MISSING';END IF;binding_id:=(b->>'agreementCode')||':'||(b->>'key');used_keys:=used_keys||binding_id;
   IF b->>'sourceKind' NOT IN('employment_fact','period_fact','period_context_fact','working_time_fact','agreement_time_fact','salary_condition_fact','classification_fact') THEN
   SELECT jsonb_agg(d) INTO matching FROM jsonb_array_elements(items) d WHERE d->>'active'='true' AND d->>'agreementCode'=CASE WHEN b->>'sourceKind'='scale_reference' THEN b->>'sourceAgreementCode' ELSE b->>'agreementCode' END AND(b->>'sourceKind'<>'scale_reference' OR d->>'categoryCode'=b->>'sourceCategoryCode') AND d->>'code'=b->>'sourceCode' AND d->>'kind'=CASE WHEN b->>'sourceKind' IN('scale','scale_reference') THEN 'scale' WHEN b->>'sourceKind'='auxiliary_parameter' THEN 'auxiliary' ELSE 'concept' END AND(NOT ns OR d->>'kind'<>'concept' OR d->>'nature'<>'auxiliary') AND(b->>'sourceKind' IN('scale','scale_reference','monthly_amount','fixed_amount') OR d->>'unit'=b->>'unit') AND(b->>'sourceKind' NOT IN('parameter','auxiliary_parameter') OR d->'value'<>'null');
   IF NOT public.own_program_coverage_v1(matching,r->>'validFrom',r->>'validUntil') THEN RAISE EXCEPTION 'OWN_PROGRAM_SOURCE_DEFINITION_MISSING';END IF;END IF;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rules') WITH ORDINALITY a(value,n),jsonb_array_elements(p->'rules') WITH ORDINALITY other(value,m) WHERE a.n<other.m AND a.value->>'agreementCode'=other.value->>'agreementCode' AND a.value->>'code'=other.value->>'code' AND(NOT ns OR(a.value->>'nature'='auxiliary')=(other.value->>'nature'='auxiliary')) AND coalesce(a.value->>'validUntil','9999-12')>=other.value->>'validFrom' AND coalesce(other.value->>'validUntil','9999-12')>=a.value->>'validFrom' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(a.value->'liquidationTypes') t WHERE other.value->'liquidationTypes' ? t)) THEN RAISE EXCEPTION 'OWN_PROGRAM_OVERLAP';END IF;
 FOR group_row IN SELECT DISTINCT x->>'agreementCode' agreement,t.kind FROM jsonb_array_elements(p->'rules') x CROSS JOIN LATERAL jsonb_array_elements_text(x->'liquidationTypes') t(kind) LOOP
  kind_type:=group_row.kind;
  FOR period IN SELECT DISTINCT v FROM(SELECT x->>'validFrom' v FROM jsonb_array_elements(p->'rules') x WHERE x->>'agreementCode'=group_row.agreement AND x->'liquidationTypes' ? kind_type UNION SELECT to_char((x->>'validUntil'||'-01')::date+interval '1 month','YYYY-MM') FROM jsonb_array_elements(p->'rules') x WHERE x->>'agreementCode'=group_row.agreement AND x->'liquidationTypes' ? kind_type AND x->'validUntil'<>'null') s LOOP
   SELECT coalesce(jsonb_agg(x),'[]') INTO active_rules FROM jsonb_array_elements(p->'rules') x WHERE x->>'agreementCode'=group_row.agreement AND x->'liquidationTypes' ? kind_type AND x->>'validFrom'<=period AND coalesce(x->>'validUntil','9999-12')>=period;
   checked:=checked+jsonb_array_length(active_rules);IF checked>50000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
   done_codes:='{}';wave:=0;
   WHILE cardinality(done_codes)<jsonb_array_length(active_rules) LOOP
    wave:=wave+1;IF wave>64 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;ready_codes:='{}';
    FOR r IN SELECT x FROM jsonb_array_elements(active_rules) x WHERE NOT((CASE WHEN ns THEN (CASE WHEN x->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(x->>'code') ELSE x->>'code' END)=ANY(done_codes)) LOOP
     node:=CASE WHEN ns THEN public.own_program_node_v2(public.own_participation_expression_v1(r,p)) ELSE public.own_program_node_v1(public.own_participation_expression_v1(r,p)) END;
     work:=work+2*(node->>'nodes')::integer;IF work>3000000 THEN RAISE EXCEPTION 'OWN_PROGRAM_EXPRESSION_LIMIT';END IF;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(node->'refs') c WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(active_rules) target WHERE (CASE WHEN ns THEN (CASE WHEN target->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(target->>'code') ELSE target->>'code' END)=c)) THEN RAISE EXCEPTION 'OWN_PROGRAM_DEPENDENCY';END IF;
     IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(node->'refs') c WHERE NOT(c=ANY(done_codes))) THEN
      IF (CASE WHEN ns THEN public.own_program_unit_v2(public.own_participation_expression_v1(r,p),active_rules,group_row.agreement,period,kind_type,ARRAY[(CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(r->>'code')]) ELSE public.own_program_unit_v1(public.own_participation_expression_v1(r,p),active_rules,group_row.agreement,period,kind_type,ARRAY[r->>'code']) END) IS DISTINCT FROM r->>'unit' THEN RAISE EXCEPTION 'OWN_PROGRAM_UNIT_MISMATCH';END IF;ready_codes:=ready_codes||(CASE WHEN ns THEN (CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(r->>'code') ELSE r->>'code' END);
     END IF;
    END LOOP;
    IF cardinality(ready_codes)=0 THEN RAISE EXCEPTION 'OWN_PROGRAM_CYCLE';END IF;done_codes:=done_codes||ready_codes;
   END LOOP;
  END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'bindings') bound(value) WHERE NOT((bound.value->>'agreementCode')||':'||(bound.value->>'key')=ANY(used_keys))) THEN RAISE EXCEPTION 'OWN_PROGRAM_BINDING_UNUSED';END IF;
 SELECT jsonb_build_object('rules',(SELECT jsonb_agg(x ORDER BY (x->>'agreementCode') COLLATE "C",(x->>'code') COLLATE "C",(CASE WHEN ns THEN (CASE WHEN x->>'nature'='auxiliary' THEN 'auxiliary:' ELSE 'concept:' END)||(x->>'code') ELSE '' END) COLLATE "C",x->>'validFrom',(SELECT string_agg(t,',' ORDER BY t COLLATE "C") FROM jsonb_array_elements_text(x->'liquidationTypes') t) COLLATE "C") FROM jsonb_array_elements(p->'rules') x),'bindings',(SELECT coalesce(jsonb_agg(x ORDER BY (x->>'agreementCode') COLLATE "C",(x->>'key') COLLATE "C"),'[]') FROM jsonb_array_elements(p->'bindings') x),'totalsPrecision',p->'totalsPrecision') INTO normalized;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'rules') rule_row(value) WHERE rule_row.value->'liquidationTypes' IS DISTINCT FROM(SELECT jsonb_agg(t ORDER BY t COLLATE "C") FROM jsonb_array_elements_text(rule_row.value->'liquidationTypes') t)) THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;IF ns THEN normalized:=normalized||jsonb_build_object('namespaceVersion','own-payroll-namespaces.v2');END IF;IF facts THEN normalized:=normalized||jsonb_build_object('employmentFactsVersion','own-salary-seniority.v1');END IF;IF part THEN normalized:=normalized||jsonb_build_object('periodParticipation',public.own_participation_policy_v1(p));END IF;IF working THEN normalized:=normalized||jsonb_build_object('workingTimeVersion','own-contract-working-time.v1');END IF;IF agreement_working THEN normalized:=normalized||jsonb_build_object('agreementWorkingTimeVersion','own-agreement-working-time.v1');END IF;IF period_context THEN normalized:=normalized||jsonb_build_object('periodContextVersion','own-payroll-period-context.v1');END IF;IF conditions THEN normalized:=normalized||jsonb_build_object('salaryConditionsVersion','own-contract-salary-conditions.v1');END IF;IF forced THEN normalized:=normalized||jsonb_build_object('fixedForcedAmountsVersion',p->'fixedForcedAmountsVersion','fixedForcedAmountsPolicy',p->'fixedForcedAmountsPolicy');END IF;RETURN normalized;
END $function$;

CREATE OR REPLACE FUNCTION public.municipal_owner_program_command_core_v1(p jsonb,body jsonb,key uuid,decision_mode text,owner_command jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $function$
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
  definition:=public.own_program_definition_v1(body->'program',catalog->'items');IF definition IS DISTINCT FROM body->'program' OR definition=current_program->'definition' THEN RAISE EXCEPTION 'OWN_PROGRAM_INPUT_INVALID';END IF;
  IF current_program#>>'{definition,periodParticipation,version}'='own-period-participation.v1' AND definition#>>'{periodParticipation,version}' IS DISTINCT FROM 'own-period-participation.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,fixedForcedAmountsVersion}'='own-fixed-forced-amount.v1' AND definition->>'fixedForcedAmountsVersion' IS DISTINCT FROM 'own-fixed-forced-amount.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(current_program#>'{definition,fixedForcedAmountsPolicy,policies}','[]'::jsonb)) old_policy WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(definition#>'{fixedForcedAmountsPolicy,policies}','[]'::jsonb)) new_policy WHERE new_policy=old_policy)) THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
  IF current_program#>>'{definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' AND definition->>'salaryConditionsVersion' IS DISTINCT FROM 'own-contract-salary-conditions.v1' THEN RAISE EXCEPTION 'OWN_PROGRAM_HISTORY_REQUIRED';END IF;
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
   ) AND (candidate.value#>>'{rounding,mode}'<>'exact' OR jsonb_path_exists(candidate.value,
    '$.expression.** ? (((@.op == "round" || @.op == "quantity_phase" && @.stage == "rounded") && @.rounding.mode != "exact") || ((@.op == "concept" || @.op == "auxiliary") && @.stage != "exact"))'))
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
  IF cmd='approve' THEN IF body->>'baseVersion' IS DISTINCT FROM current_program->>'version' OR body->>'salaryVersion' IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'OWN_PROGRAM_BASE_CHANGED';END IF;definition:=public.own_program_definition_v1(proposal.body->'program',catalog->'items');rev:=rev+1;current_program:=jsonb_build_object('version',encode(public.digest(jsonb_build_array('own-payroll-program.v1',ctx->>'tenantId',ctx->>'sourceBindingId',rev,eid,definition)::text,'sha256'),'hex'));END IF;
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
 IF (CASE WHEN c.payload#>>'{programState,program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN input_value->>'salaryConditionsVersion' IS DISTINCT FROM 'own-contract-salary-conditions.v1' ELSE input_value ? 'salaryConditionsVersion' END) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(input_value,ARRAY['version','period','liquidationType','selection','sourceVersions','populationComplete','totalsPrecision','employees','rules']||CASE WHEN c.payload#>>'{programState,program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN ARRAY['salaryConditionsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN c.payload#>'{programState,program,definition}' ? 'fixedForcedAmountsVersion' OR c.payload#>'{programState,program,definition}' ? 'fixedForcedAmountsPolicy' THEN ARRAY['fixedForcedAmountsVersion','fixedForcedAmountsPolicy'] ELSE ARRAY[]::text[] END) OR NOT public.own_program_exact_v1(result_value,ARRAY['version','period','liquidationType','selection','sourceVersions','employeeCount','rowCount','rows','employeeTotals','payrollCalculated','payrollPosted','municipalApprovalVerified','paymentExecuted']) OR input_value->>'version' IS DISTINCT FROM (CASE WHEN c.payload#>>'{programState,program,definition,namespaceVersion}'='own-payroll-namespaces.v2' THEN 'own-payroll-input.v2' ELSE 'own-payroll-input.v1' END) OR result_value->>'version' IS DISTINCT FROM (CASE WHEN input_value->>'version'='own-payroll-input.v2' THEN 'own-payroll-result.v2' ELSE 'own-payroll-result.v1' END) OR input_value->>'period' IS DISTINCT FROM c.body->>'period' OR input_value->>'liquidationType' IS DISTINCT FROM c.body->>'liquidationType' OR input_value->'selection' IS DISTINCT FROM c.body->'selection' OR result_value->>'period' IS DISTINCT FROM input_value->>'period' OR result_value->>'liquidationType' IS DISTINCT FROM input_value->>'liquidationType' OR result_value->'selection' IS DISTINCT FROM input_value->'selection' OR result_value->'sourceVersions' IS DISTINCT FROM input_value->'sourceVersions' OR input_value->'populationComplete' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollCalculated' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollPosted' IS DISTINCT FROM 'false'::jsonb OR result_value->'municipalApprovalVerified' IS DISTINCT FROM 'false'::jsonb OR result_value->'paymentExecuted' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
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
 -- A small receipt uses the existing authoritative finalizer, retaining its
 -- exact validation and installed close policy even for a legacy programme.
 IF octet_length(input_value::text)+octet_length(result_value::text)+octet_length(c.payload::text)+octet_length(c.body::text)+8192<=4194304 THEN
  RETURN public.own_run_complete_v1(p,capture,input_value,result_value,algorithm);
 END IF;
 IF (CASE WHEN c.payload#>>'{programState,program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN input_value->>'salaryConditionsVersion' IS DISTINCT FROM 'own-contract-salary-conditions.v1' ELSE input_value ? 'salaryConditionsVersion' END) THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(input_value,ARRAY['version','period','liquidationType','selection','sourceVersions','populationComplete','totalsPrecision','employees','rules']||CASE WHEN c.payload#>>'{programState,program,definition,salaryConditionsVersion}'='own-contract-salary-conditions.v1' THEN ARRAY['salaryConditionsVersion'] ELSE ARRAY[]::text[] END||CASE WHEN c.payload#>'{programState,program,definition}' ? 'fixedForcedAmountsVersion' OR c.payload#>'{programState,program,definition}' ? 'fixedForcedAmountsPolicy' THEN ARRAY['fixedForcedAmountsVersion','fixedForcedAmountsPolicy'] ELSE ARRAY[]::text[] END) OR NOT public.own_program_exact_v1(result_value,ARRAY['version','period','liquidationType','selection','sourceVersions','employeeCount','rowCount','rows','employeeTotals','payrollCalculated','payrollPosted','municipalApprovalVerified','paymentExecuted']) OR input_value->>'version' IS DISTINCT FROM (CASE WHEN c.payload#>>'{programState,program,definition,namespaceVersion}'='own-payroll-namespaces.v2' THEN 'own-payroll-input.v2' ELSE 'own-payroll-input.v1' END) OR result_value->>'version' IS DISTINCT FROM (CASE WHEN input_value->>'version'='own-payroll-input.v2' THEN 'own-payroll-result.v2' ELSE 'own-payroll-result.v1' END) OR input_value->>'period' IS DISTINCT FROM c.body->>'period' OR input_value->>'liquidationType' IS DISTINCT FROM c.body->>'liquidationType' OR input_value->'selection' IS DISTINCT FROM c.body->'selection' OR result_value->>'period' IS DISTINCT FROM input_value->>'period' OR result_value->>'liquidationType' IS DISTINCT FROM input_value->>'liquidationType' OR result_value->'selection' IS DISTINCT FROM input_value->'selection' OR result_value->'sourceVersions' IS DISTINCT FROM input_value->'sourceVersions' OR input_value->'populationComplete' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollCalculated' IS DISTINCT FROM 'true'::jsonb OR result_value->'payrollPosted' IS DISTINCT FROM 'false'::jsonb OR result_value->'municipalApprovalVerified' IS DISTINCT FROM 'false'::jsonb OR result_value->'paymentExecuted' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'OWN_RUN_INPUT_INVALID';END IF;
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
REVOKE ALL ON FUNCTION public.own_fixed_forced_expression_set_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_fixed_forced_policy_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_fixed_forced_capture_v1(public.own_payroll_run_capture,jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
