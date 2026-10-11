-- Read-only ART source from verified current own closes and documented days.
-- No original payroll source, calculation, municipal decision or payment.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_art_report_source_v1') THEN RAISE EXCEPTION 'OWN_ART_OBJECT_CONFLICT';END IF;
 IF to_regprocedure('public.own_art_days_current_v1(jsonb,uuid,text)') IS NULL OR to_regprocedure('public.own_close_group_v1(jsonb,uuid)') IS NULL THEN RAISE EXCEPTION 'OWN_ART_PREREQUISITE';END IF;
END $$;
CREATE FUNCTION public.own_art_report_source_v1(p jsonb,params jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;g public.own_payroll_close_event;c public.own_payroll_run_capture;e jsonb;groups jsonb:='[]';people jsonb:='[]';subject jsonb;days jsonb;source_value jsonb;identity_row record;result_value jsonb;content jsonb;total integer:=0;
BEGIN
 IF NOT public.own_program_exact_v1(params,ARRAY['period','types']) OR jsonb_typeof(params->'period') IS DISTINCT FROM 'string' OR params->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(params->'types') IS DISTINCT FROM 'array' OR jsonb_array_length(params->'types') NOT BETWEEN 1 AND 7 OR EXISTS(SELECT 1 FROM jsonb_array_elements(params->'types') t WHERE jsonb_typeof(t) IS DISTINCT FROM 'string' OR t#>>'{}' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other')) OR(SELECT count(DISTINCT t) FROM jsonb_array_elements(params->'types') t)<>jsonb_array_length(params->'types') THEN RAISE EXCEPTION 'OWN_ART_INPUT_INVALID';END IF;
 ctx:=public.own_close_context_v1(p,true,false);
 IF NOT public.action_center_context_has_capability(ctx,'payroll.parameter.read') THEN RAISE EXCEPTION 'OWN_ART_FORBIDDEN';END IF;
 PERFORM public.own_run_lock_v1(ctx);PERFORM public.own_art_days_lock_v1(ctx);
 LOCK TABLE public.own_payroll_close_event,public.own_payroll_run_capture,public.own_art_days_event,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal,public.native_employment_lifecycle_review IN SHARE MODE NOWAIT;
 FOR g IN SELECT x.* FROM public.own_payroll_close_event x WHERE x.tenant_id=(ctx->>'tenantId')::uuid AND x.source_binding_id=(ctx->>'sourceBindingId')::uuid AND x.period=params->>'period' AND params->'types' ? x.liquidation_type AND x.command='close' AND NOT EXISTS(SELECT 1 FROM public.own_payroll_close_event r WHERE r.tenant_id=x.tenant_id AND r.source_binding_id=x.source_binding_id AND r.group_id=x.id AND r.command='reopen') ORDER BY x.liquidation_type,x.id LOOP
  IF g.snapshot_sha256<>public.own_run_hash_v1(g.snapshot) OR g.snapshot->>'period' IS DISTINCT FROM params->>'period' OR g.snapshot->>'liquidationType' IS DISTINCT FROM g.liquidation_type OR jsonb_array_length(g.snapshot->'employees')<>(g.snapshot->>'employeeCount')::integer THEN RAISE EXCEPTION 'OWN_ART_CONTRACT_INVALID';END IF;
  groups:=groups||jsonb_build_array(public.own_close_group_v1(p,g.id));total:=total+jsonb_array_length(g.snapshot->'employees');
  IF total>20000 OR jsonb_array_length(groups)>1000 THEN RAISE EXCEPTION 'OWN_ART_LIMIT';END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(g.snapshot->'employees') ORDER BY value->>'contractId' LOOP
   SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=(e->>'runId')::uuid AND tenant_id=g.tenant_id AND source_binding_id=g.source_binding_id;
   IF c.id IS NULL OR c.payload_sha256<>public.own_run_hash_v1(c.payload) THEN RAISE EXCEPTION 'OWN_ART_CONTRACT_INVALID';END IF;
   subject:=public.payroll_fixed_registry_subject_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),(e->>'contractId')::uuid,true);
   SELECT pi.id AS person_id,pi.full_name,pi.dni,pi.cuil,pi.sex_code,reg.id AS registration_id INTO identity_row FROM public.native_employee_registration reg JOIN public.employment_contract ec ON ec.id=reg.contract_id AND ec.person_id=reg.person_id AND ec.tenant_id=reg.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL JOIN public.person_identity pi ON pi.id=reg.person_id WHERE reg.contract_id=(e->>'contractId')::uuid AND reg.tenant_id=g.tenant_id AND reg.source_binding_id=g.source_binding_id;
   IF NOT FOUND OR subject->>'personId' IS DISTINCT FROM identity_row.person_id::text OR subject#>>'{subject,registrationId}' IS DISTINCT FROM identity_row.registration_id::text OR subject#>>'{subject,legajo}' IS DISTINCT FROM e->>'employeeNumber' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{population,employees}') captured WHERE captured->>'contractId'=e->>'contractId' AND captured->>'identityToken'=subject#>>'{subject,identityToken}' AND captured->>'employeeNumber'=e->>'employeeNumber') THEN RAISE EXCEPTION 'OWN_ART_IDENTITY_CHANGED';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(people) prior WHERE prior->>'contractId'=e->>'contractId') THEN CONTINUE;END IF;
   source_value:=public.own_art_days_source_v1(ctx,(e->>'contractId')::uuid,params->>'period');days:=public.own_art_days_current_v1(ctx,(e->>'contractId')::uuid,params->>'period');
   people:=people||jsonb_build_array(jsonb_build_object('contractId',e->>'contractId','personId',identity_row.person_id,'registrationId',identity_row.registration_id,'employeeNumber',e->>'employeeNumber','name',identity_row.full_name,'dni',identity_row.dni,'cuil',identity_row.cuil,'sex',identity_row.sex_code,'identityToken',subject#>>'{subject,identityToken}','days',days,'daysCurrent',days->>'identityToken'=subject#>>'{subject,identityToken}' AND days->>'sourceVersion'=source_value->>'version'));
  END LOOP;
 END LOOP;
 content:=jsonb_build_object('version','own-art-source.v1','params',params,'groups',groups,'people',people,'sourceRecordCount',total,'complete',true,'origin','MUNICONTROL');
 result_value:=jsonb_build_object('version','own-art-preview.v1','scopeVersion',public.native_salary_scope_v1(ctx),'sourceVersion',public.own_run_hash_v1(content),'content',content);
 IF octet_length(result_value::text)>33546240 THEN RAISE EXCEPTION 'OWN_ART_LIMIT';END IF;RETURN result_value;
 EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'OWN_ART_BUSY';
END $$;
REVOKE ALL ON FUNCTION public.own_art_report_source_v1(jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_art_report_source_v1(jsonb,jsonb) TO municontrol_actions_runtime_app;
