-- Install only through the source-pinned preservation protocol.
-- No data, association, capability, role, ACL or employee eligibility changes.
CREATE OR REPLACE FUNCTION public.own_run_context_v1(p jsonb,nominal boolean DEFAULT false,write_access boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;k text;BEGIN ctx:=public.native_salary_context_v1(p);
 FOREACH k IN ARRAY CASE WHEN write_access THEN ARRAY['payroll.calculation.read','payroll.calculation.nominal.read','payroll.calculation.prepare','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export'] WHEN nominal THEN ARRAY['payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export'] ELSE ARRAY['payroll.calculation.read'] END LOOP
  IF NOT public.action_center_context_has_capability(ctx,k) THEN RAISE EXCEPTION 'OWN_RUN_FORBIDDEN';END IF;
 END LOOP;
 IF nominal OR write_access THEN
  IF ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL THEN
   ctx:=ctx||jsonb_build_object('parameterActorVerified',true);
  ELSE
   ctx:=public.native_salary_administrative_context_v1(p);
  END IF;
  IF ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) THEN RAISE EXCEPTION 'OWN_RUN_EMPLOYMENT_REQUIRED';END IF;
 END IF;
 RETURN ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId');END $$;
CREATE OR REPLACE FUNCTION public.own_run_bootstrap_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;rows_json jsonb;nominal_ready boolean;actor_ready boolean:=false;
BEGIN ctx:=public.own_run_context_v1(p);
 nominal_ready:=public.action_center_context_has_capability(ctx,'payroll.calculation.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.export');
 IF nominal_ready THEN
  BEGIN
   ctx:=public.own_run_context_v1(p,true,false);
   actor_ready:=ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'parameterActorVerified')::boolean,false);
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT IN('OWN_RUN_EMPLOYMENT_REQUIRED','NATIVE_SALARY_IDENTITY_CHANGED') THEN RAISE;END IF;
  END;
 END IF;
 PERFORM public.own_run_lock_v1(ctx);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'key',c.request_key,'period',c.body->>'period','liquidationType',c.body->>'liquidationType','selectionKind',c.body#>>'{selection,kind}','selectionValueCount',jsonb_array_length(c.body#>'{selection,values}'),'createdAt',c.created_at,'state',CASE WHEN r.capture_id IS NULL THEN 'captured' ELSE 'calculated' END,'inputSha256',r.input_sha256,'resultSha256',r.result_sha256) ORDER BY c.created_at,c.id),'[]') INTO rows_json FROM public.own_payroll_run_capture c LEFT JOIN public.own_payroll_run_result r ON r.capture_id=c.id WHERE c.tenant_id=(ctx->>'tenantId')::uuid AND c.source_binding_id=(ctx->>'sourceBindingId')::uuid AND c.actor_membership_id=(ctx->>'membershipId')::uuid AND c.actor_person_id IS NOT DISTINCT FROM(ctx->>'actorPersonId')::uuid AND c.actor_email=ctx->>'actorEmail';
 IF jsonb_array_length(rows_json)>1000 THEN RAISE EXCEPTION 'OWN_RUN_LIMIT';END IF;
 RETURN jsonb_build_object('version','own-payroll-bootstrap.v1','scopeVersion',public.native_salary_scope_v1(ctx),'programVersion',public.own_program_current_v1(ctx)->>'version','canCalculate',actor_ready AND nominal_ready AND public.action_center_context_has_capability(ctx,'payroll.calculation.prepare'),'runs',rows_json,'complete',true);END $$;
CREATE OR REPLACE FUNCTION public.own_novelty_sources_v1(p jsonb,period_value date,type_value text,selected uuid[]) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_payroll_novelty_event;s jsonb;result_value jsonb:='[]';BEGIN ctx:=public.own_run_context_v1(p,true,true);
 LOCK TABLE public.own_payroll_novelty_event IN SHARE MODE NOWAIT;
 FOR e IN SELECT x.* FROM public.own_novelty_current_v1(ctx) x WHERE x.status='approved' AND x.period_month=period_value AND x.payroll_type=type_value AND EXISTS(SELECT 1 FROM jsonb_array_elements(x.snapshot->'rows') r WHERE (r#>>'{values,contractId}')::uuid=ANY(selected)) ORDER BY x.batch_id LOOP
  s:=public.own_novelty_view_v1(ctx,e.snapshot,selected);IF EXISTS(SELECT 1 FROM jsonb_array_elements(s->'rows') r WHERE (r#>>'{values,contractId}')::uuid=ANY(selected) AND r->'identityCurrent' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'OWN_NOVELTY_IDENTITY_CHANGED';END IF;
  result_value:=result_value||jsonb_build_array(s);
 END LOOP;IF octet_length(result_value::text)>4194304 THEN RAISE EXCEPTION 'OWN_NOVELTY_LIMIT';END IF;RETURN result_value;END $$;
