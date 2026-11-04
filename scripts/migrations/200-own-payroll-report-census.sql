-- Additive read facade only. Install through the separately reviewed,
-- source-pinned preservation protocol; this file is not an installer.
-- No roster, current classification, programme or accounting lookup is used.
CREATE FUNCTION public.own_close_report_census_v1(p jsonb,period_value text,type_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE
 ctx jsonb;tenant_value uuid;binding_value uuid;scope_value text;
 event_value public.own_payroll_close_event;
 original_value public.own_payroll_close_event;
 reopened_value public.own_payroll_close_event;
 event_count bigint;group_count bigint;seen_events integer:=0;seen_groups integer:=0;
 employee_count integer;population_count integer;
 selection_value jsonb;selected_value jsonb;selection_kind text;
 events_value jsonb:='[]'::jsonb;groups_value jsonb:='[]'::jsonb;source_value jsonb;
BEGIN
 ctx:=public.own_close_context_v1(p,true);
 IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$'
 OR coalesce(type_value,'') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other')
 THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;
 IF jsonb_typeof(ctx->'tenantId') IS DISTINCT FROM 'string'
 OR jsonb_typeof(ctx->'sourceBindingId') IS DISTINCT FROM 'string'
 OR coalesce(ctx->>'tenantId','')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 OR coalesce(ctx->>'sourceBindingId','')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
 tenant_value:=(ctx->>'tenantId')::uuid;binding_value:=(ctx->>'sourceBindingId')::uuid;
 PERFORM public.own_run_lock_v1(ctx);
 scope_value:=public.native_salary_scope_v1(ctx);
 IF scope_value IS NULL OR scope_value!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;

 -- Count the complete cell before materialising it. No LIMIT/OFFSET or
 -- current-employee predicate can turn a failed/unread cell into an absence.
 SELECT count(*),count(*) FILTER(WHERE e.command='close') INTO event_count,group_count
 FROM public.own_payroll_close_event e
 WHERE e.tenant_id=tenant_value AND e.source_binding_id=binding_value
 AND e.period=period_value AND e.liquidation_type=type_value;
 IF event_count>2000 OR group_count>1000 THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;

 -- group_id has no FK to a close. A reopening of one of this cell's close
 -- IDs must not disappear merely because its own scope/period/type is wrong.
 -- Such corruption is an error; no metadata of the other scope is returned.
 IF EXISTS(
  SELECT 1 FROM public.own_payroll_close_event c
  JOIN public.own_payroll_close_event r ON r.group_id=c.id AND r.command='reopen'
  WHERE c.tenant_id=tenant_value AND c.source_binding_id=binding_value
  AND c.period=period_value AND c.liquidation_type=type_value AND c.command='close'
  AND(r.tenant_id IS DISTINCT FROM c.tenant_id OR r.source_binding_id IS DISTINCT FROM c.source_binding_id
   OR r.period IS DISTINCT FROM c.period OR r.liquidation_type IS DISTINCT FROM c.liquidation_type)
 ) THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;

 FOR event_value IN SELECT e.* FROM public.own_payroll_close_event e
  WHERE e.tenant_id=tenant_value AND e.source_binding_id=binding_value
  AND e.period=period_value AND e.liquidation_type=type_value ORDER BY e.id
 LOOP
  seen_events:=seen_events+1;
  IF seen_events>2000 THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
  IF event_value.command NOT IN('close','reopen') OR NOT isfinite(event_value.recorded_at)
  OR event_value.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(event_value.body)
  OR event_value.snapshot_sha256 IS DISTINCT FROM public.own_run_hash_v1(event_value.snapshot)
  OR octet_length(event_value.body::text)>524288 OR octet_length(event_value.snapshot::text)>3145728
  OR octet_length(event_value.receipt::text)>4194304
  THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;

  -- Preserve the original command and receipt envelope, including their
  -- original scope/state versions. They are not compared with today's roster.
  IF public.own_program_exact_v1(event_value.body,ARRAY['period','liquidationType','scopeVersion','stateVersion','selection','command','groupId','reason','reviewConfirmed']) IS NOT TRUE
  OR event_value.body->'period' IS DISTINCT FROM to_jsonb(period_value)
  OR event_value.body->'liquidationType' IS DISTINCT FROM to_jsonb(type_value)
  OR event_value.body->'command' IS DISTINCT FROM to_jsonb(event_value.command)
  OR event_value.body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb
  OR jsonb_typeof(event_value.body->'scopeVersion') IS DISTINCT FROM 'string'
  OR jsonb_typeof(event_value.body->'stateVersion') IS DISTINCT FROM 'string'
  OR coalesce(event_value.body->>'scopeVersion','')!~'^[a-f0-9]{64}$'
  OR coalesce(event_value.body->>'stateVersion','')!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(event_value.body->'reason') IS DISTINCT FROM 'string'
  OR length(event_value.body->>'reason') NOT BETWEEN 10 AND 500
  OR btrim(event_value.body->>'reason') IS DISTINCT FROM event_value.body->>'reason'
  OR event_value.body->>'reason'~'[[:cntrl:]]'
  THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  IF public.own_program_exact_v1(event_value.receipt,ARRAY['version','id','key','body','bodySha256','groupId','snapshot','snapshotSha256','recordedAt','replayed']) IS NOT TRUE
  OR event_value.receipt->'version' IS DISTINCT FROM '"own-close-receipt.v1"'::jsonb
  OR event_value.receipt->'id' IS DISTINCT FROM to_jsonb(event_value.id)
  OR event_value.receipt->'key' IS DISTINCT FROM to_jsonb(event_value.request_key)
  OR event_value.receipt->'groupId' IS DISTINCT FROM to_jsonb(event_value.group_id)
  OR event_value.receipt->'bodySha256' IS DISTINCT FROM to_jsonb(event_value.body_sha256)
  OR event_value.receipt->'snapshotSha256' IS DISTINCT FROM to_jsonb(event_value.snapshot_sha256)
  OR event_value.receipt->'body' IS DISTINCT FROM event_value.body
  OR event_value.receipt->'snapshot' IS DISTINCT FROM event_value.snapshot
  OR event_value.receipt->'recordedAt' IS DISTINCT FROM to_jsonb(event_value.recorded_at)
  OR event_value.receipt->'replayed' IS DISTINCT FROM 'false'::jsonb
  THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;

  -- This is the historical snapshot envelope shared by v1/v2/v3. The
  -- original active receipt still undergoes the existing complete concept,
  -- jurisdiction and exact-total validation when the report fetches group.
  IF public.own_program_exact_v1(event_value.snapshot,ARRAY['version','period','liquidationType','populationDomain','rosterVersion','selection','employeeCount','populationCount','populationComplete','precision','totals','employees','concepts','conceptCount','payrollCalculated','payrollPosted','paymentExecuted']) IS NOT TRUE
  OR event_value.snapshot->>'version' NOT IN('own-close-snapshot.v1','own-close-snapshot.v2','own-close-snapshot.v3')
  OR jsonb_typeof(event_value.snapshot->'version') IS DISTINCT FROM 'string'
  OR event_value.snapshot->'period' IS DISTINCT FROM to_jsonb(period_value)
  OR event_value.snapshot->'liquidationType' IS DISTINCT FROM to_jsonb(type_value)
  OR event_value.snapshot->'populationDomain' IS DISTINCT FROM '"native_registered"'::jsonb
  OR jsonb_typeof(event_value.snapshot->'rosterVersion') IS DISTINCT FROM 'string'
  OR coalesce(event_value.snapshot->>'rosterVersion','')!~'^[a-f0-9]{64}$'
  OR event_value.snapshot->'payrollCalculated' IS DISTINCT FROM 'true'::jsonb
  OR event_value.snapshot->'payrollPosted' IS DISTINCT FROM 'false'::jsonb
  OR event_value.snapshot->'paymentExecuted' IS DISTINCT FROM 'false'::jsonb
  OR jsonb_typeof(event_value.snapshot->'employees') IS DISTINCT FROM 'array'
  OR jsonb_typeof(event_value.snapshot->'concepts') IS DISTINCT FROM 'array'
  OR jsonb_typeof(event_value.snapshot->'employeeCount') IS DISTINCT FROM 'number'
  OR jsonb_typeof(event_value.snapshot->'populationCount') IS DISTINCT FROM 'number'
  OR jsonb_typeof(event_value.snapshot->'conceptCount') IS DISTINCT FROM 'number'
  OR jsonb_typeof(event_value.snapshot->'precision') IS DISTINCT FROM 'number'
  OR coalesce(event_value.snapshot->>'employeeCount','')!~'^[1-9][0-9]{0,4}$'
  OR coalesce(event_value.snapshot->>'populationCount','')!~'^[1-9][0-9]{0,4}$'
  OR coalesce(event_value.snapshot->>'conceptCount','')!~'^(0|[1-9][0-9]{0,9})$'
  OR coalesce(event_value.snapshot->>'precision','')!~'^[0-8]$'
  OR public.own_program_exact_v1(event_value.snapshot->'totals',ARRAY['remuneration','non_remuneration','deduction','employer_contribution','gross','net']) IS NOT TRUE
  THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  employee_count:=(event_value.snapshot->>'employeeCount')::integer;
  population_count:=(event_value.snapshot->>'populationCount')::integer;
  IF employee_count>10000 OR population_count<employee_count OR population_count>10000
  OR jsonb_array_length(event_value.snapshot->'employees')<>employee_count
  OR jsonb_array_length(event_value.snapshot->'concepts')::numeric<>(event_value.snapshot->>'conceptCount')::numeric
  OR event_value.snapshot->'populationComplete' IS DISTINCT FROM to_jsonb(employee_count=population_count)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(event_value.snapshot->'employees') x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'object')
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(event_value.snapshot->'concepts') x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'object')
  THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  IF event_value.snapshot->>'version'='own-close-snapshot.v3'
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(event_value.snapshot->'employees') x WHERE x.value->'namespaceVersion'='"own-payroll-namespaces.v2"'::jsonb)
  THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;

  FOREACH selection_value IN ARRAY ARRAY[event_value.body->'selection',event_value.snapshot->'selection'] LOOP
   IF public.own_program_exact_v1(selection_value,ARRAY['kind','values']) IS NOT TRUE
   OR jsonb_typeof(selection_value->'kind') IS DISTINCT FROM 'string'
   OR selection_value->>'kind' NOT IN('all','contracts','agreements','departments')
   OR jsonb_typeof(selection_value->'values') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   selection_kind:=selection_value->>'kind';
   IF jsonb_array_length(selection_value->'values')>10000
   OR(selection_kind='all' AND jsonb_array_length(selection_value->'values')<>0)
   OR(selection_kind<>'all' AND jsonb_array_length(selection_value->'values')=0)
   OR(SELECT count(*)<>count(DISTINCT x.value) FROM jsonb_array_elements(selection_value->'values') x)
   THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   FOR selected_value IN SELECT x.value FROM jsonb_array_elements(selection_value->'values') x LOOP
    IF jsonb_typeof(selected_value) IS DISTINCT FROM 'string'
    OR(selection_kind='contracts' AND coalesce(selected_value#>>'{}','')!~*'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$')
    OR(selection_kind IN('agreements','departments') AND coalesce(selected_value#>>'{}','')!~'^[0-9]{1,9}$')
    THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   END LOOP;
  END LOOP;

  IF event_value.command='close' THEN
   IF event_value.id IS DISTINCT FROM event_value.group_id
   OR event_value.body->'groupId' IS DISTINCT FROM 'null'::jsonb
   OR event_value.body->'selection' IS DISTINCT FROM event_value.snapshot->'selection'
   OR(SELECT count(*) FROM public.own_payroll_close_event c WHERE c.tenant_id=tenant_value AND c.source_binding_id=binding_value AND c.group_id=event_value.group_id AND c.command='close')<>1
   OR(SELECT count(*) FROM public.own_payroll_close_event r WHERE r.tenant_id=tenant_value AND r.source_binding_id=binding_value AND r.group_id=event_value.id AND r.command='reopen')>1
   THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   SELECT * INTO reopened_value FROM public.own_payroll_close_event r
    WHERE r.tenant_id=tenant_value AND r.source_binding_id=binding_value
    AND r.group_id=event_value.id AND r.command='reopen';
   IF reopened_value.id IS NOT NULL AND(
    reopened_value.period IS DISTINCT FROM period_value OR reopened_value.liquidation_type IS DISTINCT FROM type_value
    OR reopened_value.snapshot IS DISTINCT FROM event_value.snapshot
    OR reopened_value.snapshot_sha256 IS DISTINCT FROM event_value.snapshot_sha256
    OR NOT isfinite(reopened_value.recorded_at) OR reopened_value.recorded_at<event_value.recorded_at)
   THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   seen_groups:=seen_groups+1;
   IF seen_groups>1000 THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
   groups_value:=groups_value||jsonb_build_array(jsonb_build_object(
    'id',event_value.id,'state',CASE WHEN reopened_value.id IS NULL THEN 'closed' ELSE 'reopened' END,
    'snapshotSha256',event_value.snapshot_sha256,'employeeCount',employee_count,'populationCount',population_count,
    'populationComplete',event_value.snapshot->'populationComplete','recordedAt',event_value.recorded_at,
    'reopenedAt',CASE WHEN reopened_value.id IS NULL THEN NULL ELSE reopened_value.recorded_at END));
  ELSE
   IF event_value.id IS NOT DISTINCT FROM event_value.group_id
   OR event_value.body->'groupId' IS DISTINCT FROM to_jsonb(event_value.group_id)
   OR event_value.body->'selection' IS DISTINCT FROM '{"kind":"all","values":[]}'::jsonb
   OR(SELECT count(*) FROM public.own_payroll_close_event r WHERE r.tenant_id=tenant_value AND r.source_binding_id=binding_value AND r.group_id=event_value.group_id AND r.command='reopen')<>1
   THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
   SELECT * INTO original_value FROM public.own_payroll_close_event c
    WHERE c.id=event_value.group_id AND c.command='close'
    AND c.tenant_id=tenant_value AND c.source_binding_id=binding_value
    AND c.period=period_value AND c.liquidation_type=type_value;
   IF original_value.id IS NULL OR original_value.group_id IS DISTINCT FROM original_value.id
   OR original_value.snapshot IS DISTINCT FROM event_value.snapshot
   OR original_value.snapshot_sha256 IS DISTINCT FROM event_value.snapshot_sha256
   OR NOT isfinite(original_value.recorded_at) OR event_value.recorded_at<original_value.recorded_at
   THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  END IF;
  events_value:=events_value||jsonb_build_array(jsonb_build_object(
   'id',event_value.id,'groupId',event_value.group_id,'command',event_value.command,
   'bodySha256',event_value.body_sha256,'snapshotSha256',event_value.snapshot_sha256,'recordedAt',event_value.recorded_at));
 END LOOP;
 IF seen_events<>event_count OR seen_groups<>group_count
 OR jsonb_array_length(events_value)<>event_count OR jsonb_array_length(groups_value)<>group_count
 THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
 source_value:=jsonb_build_object('version','own-report-close-census.v1','period',period_value,'liquidationType',type_value,
  'scopeVersion',scope_value,'complete',true,'eventCount',event_count,'events',events_value,'groups',groups_value);
 IF octet_length(source_value::text)+1024>4194304 THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
 RETURN source_value||jsonb_build_object('sourceVersion',public.own_run_hash_v1(source_value));
END $$;
REVOKE ALL ON FUNCTION public.own_close_report_census_v1(jsonb,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_close_report_census_v1(jsonb,text,text) TO municontrol_actions_runtime_app;
