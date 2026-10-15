-- Preparation source only. Existing157 proposals/independent approval are intact.
-- Runtime uses READ COMMITTED and inherited authenticated session bookkeeping;
-- this is not a READ ONLY transaction facade or durable preparation evidence.
CREATE FUNCTION public.own_monthly_participation_source_v1(p jsonb,target uuid,period_value text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' SET lock_timeout='2s' AS $$
DECLARE ctx jsonb;b jsonb;l jsonb;payload jsonb;
BEGIN
 IF target IS NULL OR period_value IS NULL OR length(period_value)<>7 OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'PARTICIPATION_INPUT_INVALID';END IF;
 ctx:=public.native_salary_administrative_context_v1(p);
 IF NOT coalesce((ctx->>'parameterActorVerified')::boolean,false) OR NOT public.action_center_context_has_capability(ctx,'payroll.parameter.prepare') THEN RAISE EXCEPTION 'PARTICIPATION_FORBIDDEN';END IF;
 -- This shared canonical lock serializes participation and lifecycle writers.
 PERFORM public.own_participation_lock_v1(ctx);
 LOCK TABLE public.native_employment_lifecycle_review,public.own_participation_event IN SHARE MODE NOWAIT;
 b:=public.own_participation_bootstrap_v1(p,target,period_value);
 -- The v2 dispatcher preserves adopted unknown dates; no historical GRH read.
 l:=public.native_employment_lifecycle_read_v2(p,target);
 IF b->>'scopeVersion' IS DISTINCT FROM public.own_participation_scope_v1(ctx,target,period_value)
 OR b->'source' IS DISTINCT FROM public.own_participation_source_v1(ctx,target,period_value)
 OR b->'configuration' IS DISTINCT FROM public.own_participation_current_v1(ctx,target,period_value)
 THEN RAISE EXCEPTION 'PARTICIPATION_SOURCE_CHANGED';END IF;
 IF l ? 'datesVerified' AND l->'datesVerified' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'PARTICIPATION_SOURCE_REQUIRED';END IF;
 payload:=jsonb_build_object('version','own-monthly-participation-source.v1',
  'scope',jsonb_build_object('tenantId',ctx->>'tenantId','sourceBindingId',ctx->>'sourceBindingId','membershipId',ctx->>'membershipId','companyId',ctx->>'sourceCompanyId'),
  'bootstrap',b,'lifecycle',l);
 IF octet_length(payload::text)>2097152 THEN RAISE EXCEPTION 'PARTICIPATION_LIMIT';END IF;
 RETURN payload||jsonb_build_object('sha256',encode(public.digest(public.native_salary_serialized_v1(payload),'sha256'),'hex'));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PARTICIPATION_BUSY';
WHEN OTHERS THEN
 IF SQLERRM IN('NATIVE_EMPLOYMENT_CATALOG_BUSY','NATIVE_EMPLOYMENT_LIFECYCLE_BUSY','NATIVE_EMPLOYMENT_CHANGE_BUSY','NATIVE_SALARY_BUSY','PAYROLL_FIXED_SESSION_BUSY') THEN RAISE EXCEPTION 'PARTICIPATION_BUSY';END IF;
 IF SQLERRM IN('PAYROLL_FIXED_DATES_INVALID','NATIVE_EMPLOYMENT_LIFECYCLE_DATES_INVALID') THEN RAISE EXCEPTION 'PARTICIPATION_SOURCE_REQUIRED';END IF;
 RAISE;
END $$;
REVOKE ALL ON FUNCTION public.own_monthly_participation_source_v1(jsonb,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_monthly_participation_source_v1(jsonb,uuid,text) TO municontrol_actions_runtime_app;
