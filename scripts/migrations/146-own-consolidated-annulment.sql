-- One atomic decision across all currently confirmed runs of a period/type.
-- Existing immutable results and individual decision protocol remain intact.
DO $$ BEGIN
 IF to_regclass('public.own_payroll_annul_event') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_annul_%') THEN RAISE EXCEPTION 'OWN_LIQ_ALREADY_INSTALLED';END IF;
 IF to_regprocedure('public.own_close_guard_v1(jsonb,text,text,uuid[])') IS NULL OR to_regprocedure('public.own_run_bootstrap_v2(jsonb)') IS NULL THEN RAISE EXCEPTION 'OWN_LIQ_PREREQUISITE';END IF;
END $$;
CREATE TABLE public.own_payroll_annul_event(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),source_binding_id uuid NOT NULL,
 actor_membership_id uuid NOT NULL,actor_person_id uuid NOT NULL REFERENCES public.person_identity(id),actor_email text NOT NULL CHECK(actor_email=lower(actor_email)),actor_label text NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id),actor_session_version integer NOT NULL CHECK(actor_session_version>0),release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND octet_length(body::text)<=524288),body_sha256 text NOT NULL CHECK(body_sha256~'^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=4194304),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id)
);
ALTER TABLE public.own_payroll_annul_event ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.own_payroll_annul_event FROM PUBLIC,municontrol_actions_runtime_app;
CREATE FUNCTION public.own_annul_immutable_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN RAISE EXCEPTION 'OWN_LIQ_IMMUTABLE';END $$;
CREATE TRIGGER own_annul_event_immutable BEFORE UPDATE OR DELETE ON public.own_payroll_annul_event FOR EACH ROW EXECUTE FUNCTION public.own_annul_immutable_v1();
CREATE TRIGGER own_annul_event_no_truncate BEFORE TRUNCATE ON public.own_payroll_annul_event FOR EACH STATEMENT EXECUTE FUNCTION public.own_annul_immutable_v1();
CREATE FUNCTION public.own_annul_detail_v1(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;c public.own_payroll_run_capture;runs jsonb:='[]';closed jsonb;detail jsonb;state_version text;BEGIN
 ctx:=public.own_liquidation_context_v1(p,true,'annul');
 IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR coalesce(type_value,'') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 PERFORM public.own_run_lock_v1(ctx);
 FOR c IN SELECT a.* FROM public.own_payroll_run_capture a JOIN public.own_payroll_run_result r ON r.capture_id=a.id WHERE a.tenant_id=(ctx->>'tenantId')::uuid AND a.source_binding_id=(ctx->>'sourceBindingId')::uuid AND a.body->>'period'=period_value AND a.body->>'liquidationType'=type_value ORDER BY a.id LOOP
  IF jsonb_array_length(runs)>=1000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
  runs:=runs||jsonb_build_array(public.own_liquidation_detail_v1(p,c.id));
  IF octet_length(runs::text)+8192>4194304 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 END LOOP;
 IF(SELECT count(*) FROM jsonb_array_elements(runs) r CROSS JOIN LATERAL jsonb_array_elements(r.value->'employees') e WHERE e.value->>'state'='confirmed')>10000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 IF EXISTS(SELECT e.value->>'contractId' FROM jsonb_array_elements(runs) r CROSS JOIN LATERAL jsonb_array_elements(r.value->'employees') e WHERE e.value->>'state'='confirmed' GROUP BY e.value->>'contractId' HAVING count(*)>1) THEN RAISE EXCEPTION 'OWN_LIQ_CONTRACT_INVALID';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('runId',e.value->>'runId','contractId',e.value->>'contractId','groupId',g.value->>'id') ORDER BY e.value->>'contractId'),'[]') INTO closed FROM jsonb_array_elements(public.own_close_active_v1(ctx,period_value,type_value)) g CROSS JOIN LATERAL jsonb_array_elements(g.value#>'{snapshot,employees}') e;
 state_version:=public.own_run_hash_v1(jsonb_build_object('scopeVersion',public.native_salary_scope_v1(ctx),'period',period_value,'liquidationType',type_value,'runs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',value->>'id','stateVersion',value->>'stateVersion','bodySha256',value#>>'{capture,bodySha256}','resultSha256',value#>>'{capture,saved,resultSha256}') ORDER BY value->>'id'),'[]') FROM jsonb_array_elements(runs)),'closed',closed,'closeHistory',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'bodySha256',e.body_sha256,'snapshotSha256',e.snapshot_sha256) ORDER BY e.id),'[]') FROM public.own_payroll_close_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=period_value AND e.liquidation_type=type_value)));
 detail:=jsonb_build_object('version','own-annul-detail.v1','period',period_value,'liquidationType',type_value,'scopeVersion',public.native_salary_scope_v1(ctx),'stateVersion',state_version,'runs',runs,'closed',closed,'complete',true);
 IF octet_length(detail::text)+8192>4194304 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;RETURN detail;END $$;
CREATE FUNCTION public.own_annul_selected_v1(detail jsonb,selection jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE kind text:=selection->>'kind';r jsonb;e jsonb;person jsonb;val text;chosen text[]:='{}';selected jsonb:='[]';BEGIN
 IF NOT public.own_program_exact_v1(selection,ARRAY['kind','values']) OR jsonb_typeof(selection->'kind') IS DISTINCT FROM 'string' OR kind NOT IN('all','contracts','agreements','departments') OR jsonb_typeof(selection->'values') IS DISTINCT FROM 'array' OR jsonb_array_length(selection->'values')>10000 OR(kind='all')<>(jsonb_array_length(selection->'values')=0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection->'values') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}'!~CASE WHEN kind='contracts' THEN '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' ELSE '^[0-9]{1,9}$' END) OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(selection->'values'))<>jsonb_array_length(selection->'values') OR selection->'values' IS DISTINCT FROM(SELECT coalesce(jsonb_agg(x ORDER BY x COLLATE "C"),'[]') FROM jsonb_array_elements_text(selection->'values') x) THEN RAISE EXCEPTION 'OWN_LIQ_SELECTION_INVALID';END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(detail->'runs') LOOP
  FOR e IN SELECT value FROM jsonb_array_elements(r->'employees') WHERE value->>'state'='confirmed' LOOP
   SELECT value INTO person FROM jsonb_array_elements(r#>'{capture,saved,input,employees}') WHERE value->>'contractId'=e->>'contractId';IF person IS NULL THEN RAISE EXCEPTION 'OWN_LIQ_CONTRACT_INVALID';END IF;
   val:=person->>CASE kind WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END;
   IF kind<>'all' AND NOT selection->'values' ? val THEN CONTINUE;END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(detail->'closed') x WHERE x.value->>'runId'=r->>'id' AND x.value->>'contractId'=e->>'contractId') THEN RAISE EXCEPTION 'OWN_CLOSE_REOPEN_REQUIRED';END IF;
   IF NOT e->'allowedCommands' ? 'annul' THEN RAISE EXCEPTION 'OWN_LIQ_DECISION_INVALID';END IF;
   chosen:=array_append(chosen,val);selected:=selected||jsonb_build_array(jsonb_build_object('runId',r->>'id','resultSha256',r#>>'{capture,saved,resultSha256}','contractId',e->>'contractId','liquidationDate',r#>'{capture,body,liquidationDate}','version',(e->>'version')::integer+1,'liquidationVersion',e->'liquidationVersion'));
  END LOOP;
 END LOOP;
 IF jsonb_array_length(selected)=0 OR kind<>'all' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(selection->'values') x WHERE NOT x=ANY(chosen)) THEN RAISE EXCEPTION 'OWN_LIQ_SELECTION_INVALID';END IF;
 RETURN(SELECT jsonb_agg(value ORDER BY value->>'contractId' COLLATE "C") FROM jsonb_array_elements(selected));END $$;
CREATE FUNCTION public.own_annul_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;e public.own_payroll_annul_event;BEGIN ctx:=public.own_liquidation_context_v1(p,true,'annul');SELECT * INTO e FROM public.own_payroll_annul_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF e.id IS NULL THEN RAISE EXCEPTION 'OWN_LIQ_NOT_FOUND';END IF;IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'OWN_LIQ_FORBIDDEN';END IF;
 IF e.body_sha256<>public.own_run_hash_v1(e.body) OR e.receipt->'body' IS DISTINCT FROM e.body THEN RAISE EXCEPTION 'OWN_LIQ_CONTRACT_INVALID';END IF;RETURN e.receipt||jsonb_build_object('replayed',true);END $$;
CREATE FUNCTION public.own_annul_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb;detail jsonb;selected jsonb;run_value text;child jsonb;receipts jsonb:='[]';fingerprint text;receipt_value jsonb;event_id uuid:=gen_random_uuid();at_time timestamptz:=clock_timestamp();e public.own_payroll_annul_event;c public.own_payroll_run_capture;val text;BEGIN
 IF NOT public.own_program_exact_v1(body,ARRAY['period','liquidationType','scopeVersion','stateVersion','selection','reason','reviewConfirmed']) OR octet_length(body::text)>524288 OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(body->>'reason') NOT BETWEEN 10 AND 500 OR btrim(body->>'reason')<>body->>'reason' OR body->>'reason'~'[[:cntrl:]]' OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR jsonb_typeof(body->'liquidationType') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 FOREACH val IN ARRAY ARRAY['scopeVersion','stateVersion'] LOOP IF jsonb_typeof(body->val) IS DISTINCT FROM 'string' OR body->>val!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;END LOOP;
 ctx:=public.own_liquidation_context_v1(p,true,'annul');PERFORM public.own_run_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body);
 SELECT * INTO e FROM public.own_payroll_annul_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF e.body<>body OR e.body_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_LIQ_IDEMPOTENCY_REUSE';END IF;RETURN public.own_annul_attempt_v1(p,key);END IF;
 detail:=public.own_annul_detail_v1(p,body->>'period',body->>'liquidationType');IF body->>'scopeVersion'<>detail->>'scopeVersion' OR body->>'stateVersion'<>detail->>'stateVersion' THEN RAISE EXCEPTION 'OWN_LIQ_STATE_CHANGED';END IF;
 selected:=public.own_annul_selected_v1(detail,body->'selection');
 -- All eligibility checks precede the first event. The enclosing SQL statement
 -- also rolls back earlier child events if any later guard/capacity check fails.
 FOR run_value IN SELECT DISTINCT value->>'runId' FROM jsonb_array_elements(selected) ORDER BY 1 LOOP
  c:=public.own_liquidation_capture_v1(ctx,run_value::uuid);
  child:=public.own_liquidation_command_v1(p,jsonb_build_object('runId',run_value,'resultSha256',(SELECT result_sha256 FROM public.own_payroll_run_result WHERE capture_id=c.id),'scopeVersion',body->>'scopeVersion','stateVersion',public.own_liquidation_state_v1(ctx,c),'command','annul','selection',jsonb_build_object('kind','contracts','values',(SELECT jsonb_agg(value->>'contractId' ORDER BY value->>'contractId' COLLATE "C") FROM jsonb_array_elements(selected) WHERE value->>'runId'=run_value)),'reason',body->>'reason','reviewConfirmed',true),gen_random_uuid());
  receipts:=receipts||jsonb_build_array(child);
 END LOOP;
 receipt_value:=jsonb_build_object('version','own-annul-receipt.v1','id',event_id,'key',key,'body',body,'bodySha256',fingerprint,'affected',selected,'receipts',receipts,'recordedAt',at_time,'replayed',false);
 IF octet_length(receipt_value::text)+8192>4194304 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-run:capacity:v1',0)) THEN RAISE EXCEPTION 'OWN_LIQ_BUSY';END IF;
 IF(SELECT coalesce(sum(octet_length(a.body::text)+octet_length(a.receipt::text)),0) FROM public.own_payroll_annul_event a)+octet_length(body::text)+octet_length(receipt_value::text)>67108864 OR(SELECT count(*) FROM public.own_payroll_annul_event a WHERE a.tenant_id=(ctx->>'tenantId')::uuid AND a.source_binding_id=(ctx->>'sourceBindingId')::uuid)>=4000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 INSERT INTO public.own_payroll_annul_event(id,tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_email,actor_label,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,receipt,recorded_at) VALUES(event_id,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',coalesce(nullif(ctx->>'actorLabel',''),'Autoridad municipal'),(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,body,fingerprint,receipt_value,at_time);RETURN receipt_value;END $$;
DO $$ DECLARE fn record;BEGIN FOR fn IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'own_annul_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,municontrol_actions_runtime_app',fn.signature);END LOOP;END $$;
GRANT EXECUTE ON FUNCTION public.own_annul_detail_v1(jsonb,text,text),public.own_annul_attempt_v1(jsonb,uuid),public.own_annul_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
