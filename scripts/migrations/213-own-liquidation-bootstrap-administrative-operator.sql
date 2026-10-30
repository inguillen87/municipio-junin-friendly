-- Forward compatibility correction after176; install through its pinned preservation protocol.
-- No grants, capabilities, employee links, identities, rows or public DTO/RPC changes.
CREATE OR REPLACE FUNCTION public.own_liquidation_bootstrap_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;rows_value jsonb;nominal_ready boolean;actor_ready boolean:=false;
BEGIN ctx:=public.own_liquidation_context_v1(p);
 nominal_ready:=public.action_center_context_has_capability(ctx,'payroll.calculation.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.nominal.read') AND public.action_center_context_has_capability(ctx,'payroll.novelty.export');
 IF nominal_ready THEN
  BEGIN
   ctx:=public.own_liquidation_context_v1(p,true);
   actor_ready:=ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'parameterActorVerified')::boolean,false);
  EXCEPTION WHEN raise_exception THEN
   IF SQLERRM NOT IN('OWN_RUN_EMPLOYMENT_REQUIRED','NATIVE_SALARY_IDENTITY_CHANGED') THEN RAISE;END IF;
  END;
 END IF;
 IF(SELECT count(*) FROM public.own_payroll_run_capture c JOIN public.own_payroll_run_result r ON r.capture_id=c.id WHERE c.tenant_id=(ctx->>'tenantId')::uuid AND c.source_binding_id=(ctx->>'sourceBindingId')::uuid)>1000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'period',c.body->>'period','liquidationType',c.body->>'liquidationType','createdAt',c.created_at,'employeeCount',r.result->'employeeCount','resultSha256',r.result_sha256,'canConsult',actor_ready AND nominal_ready AND(c.actor_membership_id=(ctx->>'membershipId')::uuid AND c.actor_person_id=(ctx->>'actorPersonId')::uuid AND c.actor_email=ctx->>'actorEmail' OR public.action_center_context_has_capability(ctx,'payroll.calculation.approve'))) ORDER BY c.created_at DESC,c.id),'[]') INTO rows_value FROM public.own_payroll_run_capture c JOIN public.own_payroll_run_result r ON r.capture_id=c.id WHERE c.tenant_id=(ctx->>'tenantId')::uuid AND c.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 RETURN jsonb_build_object('version','own-liquidation-bootstrap.v1','scopeVersion',public.native_salary_scope_v1(ctx),'runs',rows_value,'complete',true);END $$;
