-- Private reporting validation only. Install with the conservative composition
-- in own-payroll-jurisdiction-installation.mjs, not as a standalone migration.
-- No new API, salary rule, nominal backfill, IAM assignment, signature or payment.
CREATE FUNCTION public.own_run_jurisdictions_v1(capture jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE inventory jsonb:=capture#>'{payload,sourceInventory}';value jsonb;row_value jsonb;employee jsonb;result jsonb:='{}';registrations text[]:='{}';n integer;BEGIN
 IF NOT coalesce(inventory ? 'jurisdictions',false) THEN RETURN 'null'::jsonb;END IF;
 value:=inventory->'jurisdictions';
 IF NOT public.own_program_exact_v1(value,ARRAY['version','complete','total','rows']) OR value->>'version' IS DISTINCT FROM 'own-run-jurisdictions.v1' OR value->'complete' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(value->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(value->'total') IS DISTINCT FROM 'number' OR jsonb_typeof(capture#>'{payload,population,employees}') IS DISTINCT FROM 'array' OR capture->>'payloadSha256' IS DISTINCT FROM public.own_run_hash_v1(capture->'payload') THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;
 n:=jsonb_array_length(value->'rows');
 IF n>10000 OR value->'total' IS DISTINCT FROM to_jsonb(n) OR jsonb_array_length(capture#>'{payload,population,employees}')<>n OR (SELECT count(DISTINCT x->>'contractId') FROM jsonb_array_elements(capture#>'{payload,population,employees}') x)<>n THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;
 FOR row_value IN SELECT x FROM jsonb_array_elements(value->'rows') x LOOP
  IF NOT public.own_program_exact_v1(row_value,ARRAY['contractId','employeeNumber','registrationId','identityToken','jurisdictionCode']) OR jsonb_typeof(row_value->'contractId') IS DISTINCT FROM 'string' OR row_value->>'contractId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(row_value->'registrationId') IS DISTINCT FROM 'string' OR row_value->>'registrationId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(row_value->'identityToken') IS DISTINCT FROM 'string' OR row_value->>'identityToken'!~'^[a-f0-9]{64}$' OR (row_value->'jurisdictionCode' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(row_value->'jurisdictionCode') IS DISTINCT FROM 'string' OR row_value->>'jurisdictionCode' NOT IN('42','55'))) OR result ? (row_value->>'contractId') OR row_value->>'registrationId'=ANY(registrations) THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;
  SELECT x INTO employee FROM jsonb_array_elements(capture#>'{payload,population,employees}') x WHERE x->>'contractId'=row_value->>'contractId';
  IF employee IS NULL OR employee->>'origin' IS DISTINCT FROM 'MUNICONTROL' OR row_value->'employeeNumber' IS DISTINCT FROM employee->'employeeNumber' OR row_value->'identityToken' IS DISTINCT FROM employee->'identityToken' THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;
  registrations:=array_append(registrations,row_value->>'registrationId');
  result:=result||jsonb_build_object(row_value->>'contractId',jsonb_build_object('code',row_value->'jurisdictionCode','basis','captured_own_registration','sourceSha256',capture->>'payloadSha256'));
 END LOOP;RETURN result;END $$;
REVOKE ALL ON FUNCTION public.own_run_jurisdictions_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
