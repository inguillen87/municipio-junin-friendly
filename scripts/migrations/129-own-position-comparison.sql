-- Original own-run dimensions and read-only annual comparison. No historical GRH intake.
DO $$ BEGIN
 IF to_regclass('public.own_payroll_run_position_dimensions') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'position_comparison_%') THEN RAISE EXCEPTION 'POSITION_COMPARISON_ALREADY_INSTALLED';END IF;
 IF to_regclass('public.own_payroll_run_position_capture') IS NULL OR to_regclass('public.own_payroll_close_event') IS NULL OR to_regprocedure('public.position_assignment_capture_v1(jsonb,uuid)') IS NULL THEN RAISE EXCEPTION 'POSITION_COMPARISON_PREREQUISITE';END IF;
END $$;
CREATE TABLE public.own_payroll_run_position_dimensions(
 capture_id uuid PRIMARY KEY REFERENCES public.own_payroll_run_capture(id),
 tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 capture_payload_sha256 text NOT NULL CHECK(capture_payload_sha256~'^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=4194304),
 payload_sha256 text NOT NULL CHECK(payload_sha256~'^[a-f0-9]{64}$'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id)
);
ALTER TABLE public.own_payroll_run_position_dimensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_payroll_run_position_dimensions FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.position_comparison_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'POSITION_COMPARISON_IMMUTABLE';END $$;
CREATE TRIGGER position_dimensions_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_run_position_dimensions FOR EACH ROW EXECUTE FUNCTION public.position_comparison_immutable_v1();
CREATE TRIGGER position_dimensions_no_truncate BEFORE TRUNCATE ON public.own_payroll_run_position_dimensions FOR EACH STATEMENT EXECUTE FUNCTION public.position_comparison_immutable_v1();
CREATE FUNCTION public.position_comparison_capture_trigger_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e jsonb;s jsonb;n text;b public.platform_tenant_source_binding;employees jsonb:='[]';dimensions_value jsonb;first_date date;last_date date;BEGIN
 ctx:=jsonb_build_object('tenantId',NEW.tenant_id,'sourceBindingId',NEW.source_binding_id,'certifiedBindingId',NEW.source_binding_id,'membershipId',NEW.actor_membership_id,'actorPersonId',NEW.actor_person_id,'actorEmail',NEW.actor_email);
 SELECT * INTO b FROM public.platform_tenant_source_binding WHERE id=NEW.source_binding_id AND tenant_id=NEW.tenant_id AND verified;
 IF NOT FOUND THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
 ctx:=ctx||jsonb_build_object('sourceCompanyId',b.source_company_id::text,'sourceDatabase',b.source_database);
 PERFORM public.own_run_lock_v1(ctx);first_date:=(NEW.payload->>'period'||'-01')::date;last_date:=(first_date+interval '1 month - 1 day')::date;
 FOR e IN SELECT value FROM jsonb_array_elements(NEW.payload#>'{population,employees}') LOOP
  s:=public.native_employment_change_subject_v1(ctx,(e->>'contractId')::uuid);
  IF s->>'identityToken' IS DISTINCT FROM e->>'identityToken' OR s->>'legajo' IS DISTINCT FROM e->>'employeeNumber' THEN RAISE EXCEPTION 'POSITION_COMPARISON_IDENTITY_CHANGED';END IF;
  SELECT pi.full_name INTO n FROM public.native_employee_registration reg JOIN public.employment_contract ec ON ec.id=reg.contract_id AND ec.person_id=reg.person_id AND ec.tenant_id=reg.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL JOIN public.person_identity pi ON pi.id=reg.person_id WHERE reg.contract_id=(e->>'contractId')::uuid AND reg.tenant_id=NEW.tenant_id AND reg.source_binding_id=NEW.source_binding_id;
  IF NOT FOUND OR NOT public.annual_budget_text_v1(to_jsonb(n),1,160) THEN RAISE EXCEPTION 'POSITION_COMPARISON_IDENTITY_CHANGED';END IF;
  employees:=employees||jsonb_build_array(jsonb_build_object('contractId',e->>'contractId','employeeNumber',e->>'employeeNumber','identityToken',e->>'identityToken','name',n,'activeInPeriod',public.native_employment_lifecycle_range_v1(ctx,(e->>'contractId')::uuid,first_date,last_date,true)));
 END LOOP;
 IF jsonb_array_length(employees) NOT BETWEEN 1 AND 10000 OR jsonb_array_length(employees)<>jsonb_array_length(NEW.payload#>'{population,employees}') THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
 dimensions_value:=jsonb_build_object('version','own-position-dimensions.v1','populationVersion',NEW.payload#>>'{population,version}','complete',true,'employeeCount',jsonb_array_length(employees),'employees',employees);
 IF octet_length(dimensions_value::text)>4194304 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('position-comparison:capacity:v1',0)) THEN RAISE EXCEPTION 'POSITION_COMPARISON_BUSY';END IF;
 IF(SELECT coalesce(sum(octet_length(payload::text)),0) FROM public.own_payroll_run_position_dimensions)+octet_length(dimensions_value::text)>268435456 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 INSERT INTO public.own_payroll_run_position_dimensions(capture_id,tenant_id,source_binding_id,capture_payload_sha256,payload,payload_sha256) VALUES(NEW.id,NEW.tenant_id,NEW.source_binding_id,NEW.payload_sha256,dimensions_value,public.own_run_hash_v1(dimensions_value));RETURN NEW;
END $$;
CREATE TRIGGER own_run_position_dimensions AFTER INSERT ON public.own_payroll_run_capture FOR EACH ROW EXECUTE FUNCTION public.position_comparison_capture_trigger_v1();
CREATE FUNCTION public.position_comparison_dimensions_v1(ctx jsonb,c public.own_payroll_run_capture) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE d public.own_payroll_run_position_dimensions;BEGIN
 SELECT * INTO d FROM public.own_payroll_run_position_dimensions WHERE capture_id=c.id;
 IF d.capture_id IS NOT NULL AND(d.tenant_id<>c.tenant_id OR d.source_binding_id<>c.source_binding_id OR d.capture_payload_sha256<>c.payload_sha256 OR public.own_run_hash_v1(d.payload)<>d.payload_sha256 OR d.payload#>>'{populationVersion}' IS DISTINCT FROM c.payload#>>'{population,version}' OR d.payload->>'complete'<>'true' OR jsonb_array_length(d.payload->'employees')<>jsonb_array_length(c.payload#>'{population,employees}') OR(d.payload->>'employeeCount')::integer<>jsonb_array_length(d.payload->'employees') OR EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{population,employees}') e WHERE(SELECT count(*) FROM jsonb_array_elements(d.payload->'employees') a WHERE a->>'contractId'=e->>'contractId' AND a->>'employeeNumber'=e->>'employeeNumber' AND a->>'identityToken'=e->>'identityToken')<>1)) THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
 RETURN jsonb_build_object('version','own-run-position-dimensions.v1','captureId',c.id,'capturePayloadSha256',c.payload_sha256,'status',CASE WHEN d.capture_id IS NULL THEN 'not_captured' ELSE 'captured' END,'payload',d.payload,'payloadSha256',d.payload_sha256);
END $$;
CREATE FUNCTION public.position_comparison_detail_v1(p jsonb,y integer,norm_revision integer,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;annual jsonb;g public.own_payroll_close_event;c public.own_payroll_run_capture;r public.own_payroll_run_result;e jsonb;groups_value jsonb:='[]';employees jsonb:='[]';captures jsonb:='[]';ids uuid[]:='{}';result_value jsonb;BEGIN
 IF y NOT BETWEEN 1900 AND 2099 OR norm_revision NOT BETWEEN 1 AND 1000 OR period_value!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR left(period_value,4)<>y::text OR type_value NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') OR y IS NULL OR norm_revision IS NULL OR period_value IS NULL OR type_value IS NULL THEN RAISE EXCEPTION 'POSITION_COMPARISON_INPUT_INVALID';END IF;
 ctx:=public.annual_budget_context_v1(p);PERFORM public.own_close_context_v1(p,true,false);annual:=public.annual_budget_bootstrap_v1(p,y);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(annual->'proposals') a WHERE a->>'status'='approved' AND(a#>>'{decision,revision}')::integer=norm_revision) THEN RAISE EXCEPTION 'POSITION_COMPARISON_NORM_REQUIRED';END IF;
 FOR g IN SELECT e.* FROM public.own_payroll_close_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=period_value AND e.liquidation_type=type_value AND e.command='close' AND NOT EXISTS(SELECT 1 FROM public.own_payroll_close_event opened WHERE opened.tenant_id=e.tenant_id AND opened.source_binding_id=e.source_binding_id AND opened.group_id=e.id AND opened.command='reopen') ORDER BY e.id LOOP
  IF public.own_run_hash_v1(g.snapshot)<>g.snapshot_sha256 OR g.snapshot->>'period'<>period_value OR g.snapshot->>'liquidationType'<>type_value OR(g.snapshot->>'employeeCount')::integer<>jsonb_array_length(g.snapshot->'employees') THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
  groups_value:=groups_value||jsonb_build_array(jsonb_build_object('id',g.id,'snapshotSha256',g.snapshot_sha256,'recordedAt',g.recorded_at,'employeeCount',g.snapshot->'employeeCount','populationCount',g.snapshot->'populationCount','populationComplete',g.snapshot->'populationComplete'));
  FOR e IN SELECT value FROM jsonb_array_elements(g.snapshot->'employees') LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(employees) old WHERE old->>'contractId'=e->>'contractId') THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
   SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=(e->>'runId')::uuid AND tenant_id=g.tenant_id AND source_binding_id=g.source_binding_id;
   SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
   IF c.id IS NULL OR r.capture_id IS NULL OR public.own_run_hash_v1(c.payload)<>c.payload_sha256 OR public.own_run_hash_v1(c.payload#>'{population,employees}')<>c.payload#>>'{population,version}' OR public.own_run_hash_v1(r.result)<>r.result_sha256 OR e->>'resultSha256'<>r.result_sha256 OR e->>'inputSha256'<>r.input_sha256 OR c.payload->>'period'<>period_value OR c.payload->>'liquidationType'<>type_value OR(SELECT count(*) FROM jsonb_array_elements(c.payload#>'{population,employees}') person WHERE person->>'contractId'=e->>'contractId' AND person->>'employeeNumber'=e->>'employeeNumber')<>1 THEN RAISE EXCEPTION 'POSITION_COMPARISON_SOURCE_INVALID';END IF;
   employees:=employees||jsonb_build_array(jsonb_build_object('groupId',g.id,'contractId',e->>'contractId','employeeNumber',e->>'employeeNumber','captureId',c.id,'resultSha256',e->>'resultSha256','liquidationVersion',e->'liquidationVersion'));
   IF NOT c.id=ANY(ids) THEN
    ids:=array_append(ids,c.id);captures:=captures||jsonb_build_array(jsonb_build_object('id',c.id,'payloadSha256',c.payload_sha256,'population',c.payload->'population','positions',public.position_assignment_capture_v1(p,c.id),'dimensions',public.position_comparison_dimensions_v1(ctx,c)));
   END IF;
  END LOOP;
  IF jsonb_array_length(groups_value)>1000 OR jsonb_array_length(employees)>10000 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 END LOOP;
 result_value:=jsonb_build_object('version','own-position-comparison.v1','year',y,'revision',norm_revision,'period',period_value,'liquidationType',type_value,'scopeVersion',annual->>'scopeVersion','annual',annual,'complete',true,'groups',groups_value,'employees',employees,'captures',captures);
 IF octet_length(result_value::text)>67108864 THEN RAISE EXCEPTION 'POSITION_COMPARISON_LIMIT';END IF;
 RETURN result_value;
END $$;
REVOKE ALL ON FUNCTION public.position_comparison_immutable_v1(),public.position_comparison_capture_trigger_v1(),public.position_comparison_dimensions_v1(jsonb,public.own_payroll_run_capture),public.position_comparison_detail_v1(jsonb,integer,integer,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.position_comparison_detail_v1(jsonb,integer,integer,text,text) TO municontrol_actions_runtime_app;
