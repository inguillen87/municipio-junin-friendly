-- PRIVATE SOURCE CANDIDATE ONLY. NOT PARSED, EXECUTED, INSTALLED OR ADMITTED.
-- Input D must already be canonical against the CURRENT complete programme and
-- catalogue validator. This fragment inventories/verifies declarations only.
-- It does not authorize a caller, approve/propose, validate history, calculate,
-- install a migration, change an existing guard or certify a source document.
-- Seven new private helpers; no GRANT. Existing serializer/digest are dependencies.

CREATE FUNCTION public.own_monetary_manifest_fields_v1(v jsonb,required_fields text[],allowed_fields text[]) RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $fields$
 SELECT coalesce(jsonb_typeof(v)='object'
  AND NOT EXISTS(SELECT 1 FROM unnest(required_fields) required(key) WHERE NOT(v ? required.key))
  AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(CASE WHEN jsonb_typeof(v)='object' THEN v ELSE '{}'::jsonb END) actual(key) WHERE NOT(actual.key=ANY(allowed_fields))),false)
$fields$;

CREATE FUNCTION public.own_monetary_manifest_reference_v1(v jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $reference$
DECLARE t text;characters integer;utf16_length integer:=0;i integer;cp integer;
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'string' THEN RETURN false;END IF;
 t:=v#>>'{}';characters:=char_length(t);
 IF characters>180 OR t IS DISTINCT FROM normalize(t,NFC) THEN RETURN false;END IF;
 FOR i IN 1..characters LOOP
  cp:=ascii(substr(t,i,1));
  utf16_length:=utf16_length+CASE WHEN cp>65535 THEN 2 ELSE 1 END;
  IF cp<32 OR cp BETWEEN 127 AND 159 OR cp IN(60,62) THEN RETURN false;END IF;
  -- ECMAScript trim whitespace; C0 controls are already rejected everywhere.
  IF (i=1 OR i=characters) AND (cp IN(32,160,5760,8232,8233,8239,8287,12288,65279) OR cp BETWEEN 8192 AND 8202) THEN RETURN false;END IF;
 END LOOP;
 RETURN utf16_length BETWEEN 3 AND 180;
END $reference$;

-- JSONB has already decoded transport input. No accessor/Proxy guarantee is
-- claimed here. Count every value (not object key) exactly as R2 snapshot does.
-- Canonical PostgreSQL-representable integers only; see the contract document
-- for the unresolved broader JS-number/Unicode parity boundary.
CREATE FUNCTION public.own_monetary_manifest_json_guard_v1(v jsonb,depth_value integer,remaining_values integer) RETURNS integer
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $graph$
DECLARE kind text;counted integer:=1;child record;number_text text;
BEGIN
 IF v IS NULL OR depth_value IS NULL OR depth_value<0 OR depth_value>96 OR remaining_values IS NULL OR remaining_values<1 OR remaining_values>1000000 THEN RAISE EXCEPTION 'OWN_MONETARY_CAPTURE_LIMIT';END IF;
 kind:=jsonb_typeof(v);
 IF kind='object' THEN
  FOR child IN SELECT e.key,e.value FROM jsonb_each(v) e LOOP
   IF child.key='__proto__' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
   counted:=counted+public.own_monetary_manifest_json_guard_v1(child.value,depth_value+1,remaining_values-counted);
  END LOOP;
 ELSIF kind='array' THEN
  FOR child IN SELECT e.value FROM jsonb_array_elements(v) e LOOP
   counted:=counted+public.own_monetary_manifest_json_guard_v1(child.value,depth_value+1,remaining_values-counted);
  END LOOP;
 ELSIF kind='number' THEN
  number_text:=v#>>'{}';
  IF char_length(number_text)>17 OR number_text!~'^-?(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION 'OWN_MONETARY_NUMBER_UNREPRESENTABLE';END IF;
  IF abs(number_text::numeric)>9007199254740991::numeric THEN RAISE EXCEPTION 'OWN_MONETARY_NUMBER_UNREPRESENTABLE';END IF;
 ELSIF kind NOT IN('string','boolean','null') THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';
 END IF;
 RETURN counted;
END $graph$;

CREATE FUNCTION public.own_monetary_manifest_hash_v1(v jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $hash$
 SELECT encode(public.digest(convert_to(public.native_salary_serialized_v1(v),'UTF8'),'sha256'),'hex')
$hash$;

CREATE FUNCTION public.own_monetary_manifest_rounding_v1(v jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $rounding$
BEGIN
 IF NOT public.own_monetary_manifest_fields_v1(v,ARRAY['precision','mode'],ARRAY['precision','mode']) THEN RAISE EXCEPTION 'OWN_MONETARY_ROUNDING_REQUIRED';END IF;
 IF jsonb_typeof(v->'precision') IS DISTINCT FROM 'number' OR jsonb_typeof(v->'mode') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_MONETARY_ROUNDING_REQUIRED';END IF;
 IF (v->>'precision')!~'^[0-8]$' OR (v->>'mode') NOT IN('exact','half_up','half_even','toward_zero','floor','ceiling') THEN RAISE EXCEPTION 'OWN_MONETARY_ROUNDING_REQUIRED';END IF;
 RETURN v;
END $rounding$;

CREATE FUNCTION public.own_monetary_manifest_nodes_v1(n jsonb,path_value text,depth_value integer) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $nodes$
DECLARE operation text;rows_value jsonb;child_key text;child_value jsonb;child_rows jsonb;policy_value jsonb;
BEGIN
 IF depth_value IS NULL OR depth_value<0 OR depth_value>32 OR path_value IS NULL OR char_length(path_value)>1024 THEN RAISE EXCEPTION 'OWN_MONETARY_INVENTORY_LIMIT';END IF;
 IF NOT public.own_monetary_manifest_fields_v1(n,ARRAY['op'],ARRAY['op','unit','value','key','type','operator','code','stage','rounding','factor','conversionReference','left','right','condition','then','else','sourceReference','sourceSha256']) THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
 IF jsonb_typeof(n->'op') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_MONETARY_NODE_UNSUPPORTED';END IF;
 operation:=n->>'op';
 IF operation NOT IN('literal','input','match','concept','auxiliary','quantity_phase','round','convert','add','subtract','multiply','divide','min','max','compare','choose') THEN RAISE EXCEPTION 'OWN_MONETARY_NODE_UNSUPPORTED';END IF;
 IF operation IN('concept','auxiliary','quantity_phase') AND n->>'stage' IS DISTINCT FROM 'exact' THEN RAISE EXCEPTION 'OWN_MONETARY_INTERMEDIATE_FORBIDDEN';END IF;
 IF operation='quantity_phase' AND n->'rounding' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'OWN_MONETARY_INTERMEDIATE_FORBIDDEN';END IF;
 IF operation='round' THEN
  policy_value:=public.own_monetary_manifest_rounding_v1(n->'rounding');
  IF policy_value->>'mode' IS DISTINCT FROM 'exact' THEN RAISE EXCEPTION 'OWN_MONETARY_INTERMEDIATE_FORBIDDEN';END IF;
 END IF;
 rows_value:=jsonb_build_array(jsonb_build_object('path',path_value,'operation',operation,'declaredUnit',CASE WHEN n ? 'unit' THEN n->'unit' ELSE 'null'::jsonb END,'stage','expression_exact'));
 FOREACH child_key IN ARRAY ARRAY['left','right','value','condition','then','else'] LOOP
  child_value:=n->child_key;
  IF jsonb_typeof(child_value)='array' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  IF jsonb_typeof(child_value)='object' THEN
   child_rows:=public.own_monetary_manifest_nodes_v1(child_value,path_value||'.'||child_key,depth_value+1);
   IF jsonb_array_length(rows_value)+jsonb_array_length(child_rows)>256 THEN RAISE EXCEPTION 'OWN_MONETARY_INVENTORY_LIMIT';END IF;
   rows_value:=rows_value||child_rows;
  END IF;
 END LOOP;
 RETURN rows_value;
END $nodes$;

CREATE FUNCTION public.own_monetary_manifest_verify_v1(d jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $manifest$
DECLARE base_program jsonb;manifest_value jsonb;policy_value jsonb;source_value jsonb;inventory_value jsonb;
 canonical_definition text;source_text text;policy_text text;program_sha text;inventory_sha text;source_state_sha text;policy_sha text;
 node_count integer;policy_nodes integer;source_nodes integer;row_record record;r jsonb;entry_value jsonb;target jsonb;id_value jsonb;inventory_row jsonb;rounding_value jsonb;type_value jsonb;
 inventory_rows jsonb[]:='{}';money_rows jsonb[]:='{}';seen_identities text[]:='{}';seen_entries text[]:='{}';seen_types text[];identity_text text;field_name text;entry_number integer:=0;
BEGIN
 -- No normalization/catalogue/authority call occurs in this fragment. The caller
 -- must first validate this complete D against the canonical current programme.
 IF getdatabaseencoding() IS DISTINCT FROM 'UTF8' THEN RAISE EXCEPTION 'OWN_MONETARY_UTF8_REQUIRED';END IF;
 node_count:=public.own_monetary_manifest_json_guard_v1(d,0,1000000);
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR NOT(d ? 'monetaryPolicyVersion') OR NOT(d ? 'monetaryPolicy') THEN RAISE EXCEPTION 'OWN_MONETARY_MANIFEST_INVALID';END IF;
 IF d->>'monetaryPolicyVersion' IS DISTINCT FROM 'own-program-monetary-manifest.v1' THEN RAISE EXCEPTION 'OWN_MONETARY_MANIFEST_INVALID';END IF;
 canonical_definition:=public.native_salary_serialized_v1(d);
 IF octet_length(convert_to(canonical_definition,'UTF8'))>4194304 THEN RAISE EXCEPTION 'OWN_MONETARY_MANIFEST_LIMIT';END IF;
 base_program:=d-'monetaryPolicyVersion'-'monetaryPolicy';manifest_value:=d->'monetaryPolicy';
 IF NOT public.own_monetary_manifest_fields_v1(base_program,ARRAY['namespaceVersion','rules','bindings','totalsPrecision'],ARRAY['namespaceVersion','rules','bindings','totalsPrecision','monthlyDaysVersion','monthlyDaysPolicy','monthlyDayDeclarationVersion','employmentFactsVersion','workingTimeVersion','agreementWorkingTimeVersion','periodContextVersion','salaryConditionsVersion','periodParticipation','fixedForcedAmountsVersion','fixedForcedAmountsPolicy']) THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
 IF base_program->>'namespaceVersion' IS DISTINCT FROM 'own-payroll-namespaces.v2' OR jsonb_typeof(base_program->'totalsPrecision') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
 IF (base_program->>'totalsPrecision')!~'^[0-8]$' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
 IF jsonb_typeof(base_program->'rules') IS DISTINCT FROM 'array' OR jsonb_typeof(base_program->'bindings') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
 IF jsonb_array_length(base_program->'rules') NOT BETWEEN 1 AND 1000 OR jsonb_array_length(base_program->'bindings')>1000 THEN RAISE EXCEPTION 'OWN_MONETARY_INVENTORY_LIMIT';END IF;
 IF NOT public.own_monetary_manifest_fields_v1(manifest_value,ARRAY['sourceReference','sourceSha256','policy'],ARRAY['sourceReference','sourceSha256','policy']) THEN RAISE EXCEPTION 'OWN_MONETARY_MANIFEST_INVALID';END IF;
 IF NOT public.own_monetary_manifest_reference_v1(manifest_value->'sourceReference') OR jsonb_typeof(manifest_value->'sourceSha256') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_MONETARY_EVIDENCE_REQUIRED';END IF;
 IF (manifest_value->>'sourceSha256')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_MONETARY_EVIDENCE_REQUIRED';END IF;
 policy_value:=manifest_value->'policy';
 IF NOT public.own_monetary_manifest_fields_v1(policy_value,ARRAY['version','complete','sourceStateSha256','programSha256','inventorySha256','entries','policySha256'],ARRAY['version','complete','sourceStateSha256','programSha256','inventorySha256','entries','policySha256']) THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
 IF policy_value->>'version' IS DISTINCT FROM 'own-program-monetary-policy.v1' OR policy_value->'complete' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['sourceStateSha256','programSha256','inventorySha256','policySha256'] LOOP
  IF jsonb_typeof(policy_value->field_name) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  IF (policy_value->>field_name)!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
 END LOOP;
 source_value:=jsonb_build_object('version','own-program-monetary-source.v1','complete',true,'program',base_program,'programSha256',policy_value->'programSha256','sourceReference',manifest_value->'sourceReference','sourceSha256',manifest_value->'sourceSha256');
 -- R2 captures the policy and reconstructed source with ONE shared budget.
 -- Counting D above is a separate preflight, not a substitute for that sum.
 policy_nodes:=public.own_monetary_manifest_json_guard_v1(policy_value,0,1000000);
 source_nodes:=public.own_monetary_manifest_json_guard_v1(source_value,0,1000000-policy_nodes);
 policy_text:=public.native_salary_serialized_v1(policy_value);source_text:=public.native_salary_serialized_v1(source_value);
 IF octet_length(convert_to(policy_text,'UTF8'))+octet_length(convert_to(source_text,'UTF8'))>8388608 THEN RAISE EXCEPTION 'OWN_MONETARY_CAPTURE_LIMIT';END IF;
 program_sha:=public.own_monetary_manifest_hash_v1(base_program);
 IF policy_value->>'programSha256' IS DISTINCT FROM program_sha THEN RAISE EXCEPTION 'OWN_MONETARY_SOURCE_CHANGED';END IF;

 FOR row_record IN SELECT x.value,x.ordinal FROM jsonb_array_elements(base_program->'rules') WITH ORDINALITY x(value,ordinal) ORDER BY x.ordinal LOOP
  r:=row_record.value;
  IF NOT public.own_monetary_manifest_fields_v1(r,ARRAY['code','agreementCode','nature','unit','validFrom','validUntil','liquidationTypes','ruleReference','rounding','expression'],ARRAY['code','agreementCode','nature','unit','validFrom','validUntil','liquidationTypes','ruleReference','rounding','expression']) THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  FOREACH field_name IN ARRAY ARRAY['code','agreementCode','nature','unit','validFrom'] LOOP
   IF jsonb_typeof(r->field_name) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  END LOOP;
  IF (r->>'code')!~'^[0-9]{1,9}$' OR (r->>'agreementCode')!~'^[0-9]{1,9}$' OR (r->>'nature') NOT IN('remuneration','non_remuneration','deduction','employer_contribution','auxiliary') OR (r->>'unit') NOT IN('money','hours','minutes','days','percent','units','coefficient') OR (r->>'validFrom')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  IF r->'validUntil' IS DISTINCT FROM 'null'::jsonb THEN
   IF jsonb_typeof(r->'validUntil') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
   IF (r->>'validUntil')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR (r->>'validUntil')<(r->>'validFrom') THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  END IF;
  IF NOT public.own_monetary_manifest_reference_v1(r->'ruleReference') THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  IF jsonb_typeof(r->'liquidationTypes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  IF jsonb_array_length(r->'liquidationTypes') NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  seen_types:='{}';
  FOR type_value IN SELECT x.value FROM jsonb_array_elements(r->'liquidationTypes') WITH ORDINALITY x(value,ordinal) ORDER BY x.ordinal LOOP
   IF jsonb_typeof(type_value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
   IF (type_value#>>'{}') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') OR (type_value#>>'{}')=ANY(seen_types) THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
   seen_types:=array_append(seen_types,type_value#>>'{}');
  END LOOP;
  rounding_value:=public.own_monetary_manifest_rounding_v1(r->'rounding');
  IF r->>'unit'<>'money' AND rounding_value->>'mode'<>'exact' THEN RAISE EXCEPTION 'OWN_MONETARY_NON_MONEY_FORBIDDEN';END IF;
  id_value:=jsonb_build_object('namespaceVersion','own-payroll-namespaces.v2','kind',CASE WHEN r->>'nature'='auxiliary' THEN 'auxiliary' ELSE 'concept' END,'agreementCode',r->'agreementCode','code',r->'code','nature',r->'nature','validFrom',r->'validFrom','validUntil',r->'validUntil','liquidationTypes',r->'liquidationTypes');
  identity_text:=public.native_salary_serialized_v1(id_value);
  IF identity_text=ANY(seen_identities) THEN RAISE EXCEPTION 'OWN_MONETARY_DUPLICATE';END IF;
  seen_identities:=array_append(seen_identities,identity_text);
  inventory_row:=jsonb_build_object('identity',id_value,'unit',r->'unit','stage','rule_result','rounding',rounding_value,'ruleReference',r->'ruleReference','ruleSha256',public.own_monetary_manifest_hash_v1(r),'expressionSha256',public.own_monetary_manifest_hash_v1(r->'expression'),'nodes',public.own_monetary_manifest_nodes_v1(r->'expression','expression',0));
  inventory_rows:=array_append(inventory_rows,inventory_row);
  IF r->>'unit'='money' THEN money_rows:=array_append(money_rows,inventory_row);END IF;
 END LOOP;
 inventory_value:=to_jsonb(inventory_rows);
 inventory_sha:=public.own_monetary_manifest_hash_v1(jsonb_build_object('version','own-program-monetary-source.v1','programSha256',program_sha,'bindingsSha256',public.own_monetary_manifest_hash_v1(base_program->'bindings'),'inventory',inventory_value));
 source_state_sha:=public.own_monetary_manifest_hash_v1(source_value);
 IF policy_value->>'inventorySha256' IS DISTINCT FROM inventory_sha OR policy_value->>'sourceStateSha256' IS DISTINCT FROM source_state_sha THEN RAISE EXCEPTION 'OWN_MONETARY_SOURCE_CHANGED';END IF;
 IF jsonb_typeof(policy_value->'entries') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_MONETARY_COVERAGE_REQUIRED';END IF;
 IF cardinality(money_rows)<1 OR jsonb_array_length(policy_value->'entries') NOT BETWEEN 1 AND 1000 OR jsonb_array_length(policy_value->'entries')<>cardinality(money_rows) THEN RAISE EXCEPTION 'OWN_MONETARY_COVERAGE_REQUIRED';END IF;
 FOR row_record IN SELECT x.value,x.ordinal FROM jsonb_array_elements(policy_value->'entries') WITH ORDINALITY x(value,ordinal) ORDER BY x.ordinal LOOP
  entry_number:=entry_number+1;entry_value:=row_record.value;target:=money_rows[entry_number];
  IF NOT public.own_monetary_manifest_fields_v1(entry_value,ARRAY['identity','unit','stage','rounding','ruleSha256','expressionSha256','sourceReference','sourceSha256'],ARRAY['identity','unit','stage','rounding','ruleSha256','expressionSha256','sourceReference','sourceSha256']) THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  IF NOT public.own_monetary_manifest_fields_v1(entry_value->'identity',ARRAY['namespaceVersion','kind','agreementCode','code','nature','validFrom','validUntil','liquidationTypes'],ARRAY['namespaceVersion','kind','agreementCode','code','nature','validFrom','validUntil','liquidationTypes']) THEN RAISE EXCEPTION 'OWN_MONETARY_CONTRACT_INVALID';END IF;
  identity_text:=public.native_salary_serialized_v1(entry_value->'identity');
  IF identity_text=ANY(seen_entries) THEN RAISE EXCEPTION 'OWN_MONETARY_DUPLICATE';END IF;
  seen_entries:=array_append(seen_entries,identity_text);
  IF entry_value->>'unit' IS DISTINCT FROM 'money' OR entry_value->>'stage' IS DISTINCT FROM 'rule_result' THEN RAISE EXCEPTION 'OWN_MONETARY_STAGE_UNSUPPORTED';END IF;
  IF entry_value->'identity' IS DISTINCT FROM target->'identity' OR entry_value->'ruleSha256' IS DISTINCT FROM target->'ruleSha256' OR entry_value->'expressionSha256' IS DISTINCT FROM target->'expressionSha256' THEN RAISE EXCEPTION 'OWN_MONETARY_COVERAGE_REQUIRED';END IF;
  rounding_value:=public.own_monetary_manifest_rounding_v1(entry_value->'rounding');
  IF rounding_value IS DISTINCT FROM target->'rounding' THEN RAISE EXCEPTION 'OWN_MONETARY_ROUNDING_CHANGED';END IF;
  IF NOT public.own_monetary_manifest_reference_v1(entry_value->'sourceReference') OR jsonb_typeof(entry_value->'sourceSha256') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_MONETARY_EVIDENCE_REQUIRED';END IF;
  IF (entry_value->>'sourceSha256')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_MONETARY_EVIDENCE_REQUIRED';END IF;
 END LOOP;
 policy_sha:=public.own_monetary_manifest_hash_v1(policy_value-'policySha256');
 IF policy_value->>'policySha256' IS DISTINCT FROM policy_sha THEN RAISE EXCEPTION 'OWN_MONETARY_INTEGRITY_CHANGED';END IF;
 RETURN jsonb_build_object('version','own-program-monetary-sql-declaration-check.v1','hashesVerified',true,'sourceProgramSha256',program_sha,'sourceStateSha256',source_state_sha,'inventorySha256',inventory_sha,'monetaryPolicySha256',policy_sha,'definitionSha256',public.own_monetary_manifest_hash_v1(d),'definitionBytes',octet_length(convert_to(canonical_definition,'UTF8')),'sourceEvidence','declared_not_document_revalidated','programmeStructureValidated',false,'sqlCustodyValidated',false,'approvalAuthorityValidated',false,'legacyReplayImplemented',false,'presentable',false,'approved',false,'executable',false,'payrollCalculated',false,'payrollPosted',false);
END $manifest$;

-- Explicitly private if this SOURCE is ever admitted for a test installation.
-- No new runtime facade, grants, role/capability change or authority is created.
REVOKE ALL ON FUNCTION public.own_monetary_manifest_fields_v1(jsonb,text[],text[]),public.own_monetary_manifest_reference_v1(jsonb),public.own_monetary_manifest_json_guard_v1(jsonb,integer,integer),public.own_monetary_manifest_hash_v1(jsonb),public.own_monetary_manifest_rounding_v1(jsonb),public.own_monetary_manifest_nodes_v1(jsonb,text,integer),public.own_monetary_manifest_verify_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
