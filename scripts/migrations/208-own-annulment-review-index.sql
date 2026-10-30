-- PRIVATE SOURCE CANDIDATE ONLY. Base785ca069; NOT parsed or executed.
-- New full-index review digest, explicit v2 body/receipt, one atomic command.
-- Legacy state201 and every existing v1 function/record stay intact.
-- No row pruning, budget increase, data/identity changes or existing ACL rewrite.
-- Requires separate source/native admission and one authorized transaction.
DO $own_annul_review_208$
DECLARE
 runtime_oid oid;expected_name text;actual pg_proc;expected_signature text;
 original_functions jsonb;original_relations jsonb;current_functions jsonb;current_relations jsonb;
 effective_defaults aclitem[];new_names text[]:=ARRAY['own_annul_review_core_v2','own_annul_selected_index_v2','own_annul_command_index_core_v2','own_annul_review_v2','own_annul_review_full_v2','own_annul_command_v2','own_annul_command_full_v2'];
BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('server_version_num')::integer/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_CONTEXT_REQUIRED';END IF;
 PERFORM pg_advisory_xact_lock(208);
 runtime_oid:=to_regrole('municontrol_actions_runtime_app');
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_PREREQUISITE';END IF;
 effective_defaults:=coalesce((SELECT d.defaclacl FROM pg_default_acl d WHERE d.defaclrole=current_user::regrole AND d.defaclobjtype='f' AND d.defaclnamespace=0),acldefault('f',current_user::regrole))||coalesce((SELECT d.defaclacl FROM pg_default_acl d WHERE d.defaclrole=current_user::regrole AND d.defaclobjtype='f' AND d.defaclnamespace='public'::regnamespace),'{}'::aclitem[]);
 IF EXISTS(SELECT 1 FROM aclexplode(effective_defaults) a WHERE a.grantor<>current_user::regrole OR a.grantee NOT IN(0,current_user::regrole,runtime_oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable) OR NOT EXISTS(SELECT 1 FROM aclexplode(effective_defaults) a WHERE a.grantee=current_user::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_DEFAULT_ACL_CHANGED';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(new_names)) THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_ALREADY_PRESENT';END IF;
 -- Structural prerequisites are additional to the admitted foundation's exact
 -- source/definition pins. No current installation is certified by this file.
 FOREACH expected_signature IN ARRAY ARRAY['public.own_liquidation_context_v1(jsonb,boolean,text)','public.own_liquidation_capture_v1(jsonb,uuid)','public.own_liquidation_current_v1(jsonb,text,text)','public.own_liquidation_rows_v1(jsonb,public.own_payroll_run_capture)','public.own_liquidation_state_v1(jsonb,public.own_payroll_run_capture)','public.own_liquidation_command_v1(jsonb,jsonb,uuid)','public.own_annul_attempt_capacity_core_v2(jsonb,uuid,integer)','public.own_close_active_v1(jsonb,text,text)','public.own_close_guard_v1(jsonb,text,text,uuid[])','public.own_run_hash_v1(jsonb)','public.own_run_lock_v1(jsonb)','public.native_salary_scope_v1(jsonb)','public.own_program_exact_v1(jsonb,text[])'] LOOP
  SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(expected_signature);
  IF actual.oid IS NULL OR actual.proowner<>current_user::regrole OR NOT actual.prosecdef OR actual.prokind<>'f' OR actual.proretset OR actual.proleakproof OR actual.proparallel<>'u' OR actual.proconfig IS NULL OR NOT actual.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp'] OR EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantor<>actual.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR(a.grantee<>actual.proowner AND NOT(expected_signature='public.own_liquidation_command_v1(jsonb,jsonb,uuid)' AND a.grantee=runtime_oid))) OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=actual.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) OR(expected_signature='public.own_liquidation_command_v1(jsonb,jsonb,uuid)') IS DISTINCT FROM EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=runtime_oid AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_PREREQUISITE_CHANGED';END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') INTO original_functions FROM pg_proc p WHERE p.pronamespace='public'::regnamespace;
 SELECT coalesce(jsonb_agg(jsonb_build_object('class',to_jsonb(c),'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid)) ORDER BY c.oid),'[]') INTO original_relations FROM pg_class c WHERE c.oid IN(to_regclass('public.own_payroll_run_capture'),to_regclass('public.own_payroll_run_result'),to_regclass('public.own_payroll_liquidation_event'),to_regclass('public.own_payroll_close_event'),to_regclass('public.own_payroll_annul_event'));
 IF jsonb_array_length(original_relations)<>5 OR EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN(to_regclass('public.own_payroll_run_capture'),to_regclass('public.own_payroll_run_result'),to_regclass('public.own_payroll_liquidation_event'),to_regclass('public.own_payroll_close_event'),to_regclass('public.own_payroll_annul_event')) AND(c.relowner<>current_user::regrole OR c.relkind<>'r' OR NOT c.relrowsecurity OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner))) THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_RELATION_CHANGED';END IF;

 EXECUTE $definition_208$CREATE FUNCTION public.own_annul_review_core_v2(p jsonb,period_value text,type_value text,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $review_body$
DECLARE
 ctx jsonb;c public.own_payroll_run_capture;r public.own_payroll_run_result;candidate_id uuid;
 index_value jsonb:='[]';closed jsonb;liquidation_history jsonb;close_history jsonb;current_rows jsonb;
 person jsonb;row_state text;state_counts jsonb;confirmed_ids jsonb;entry jsonb;state_version text;detail jsonb;
 employee_count integer;confirmed_total integer:=0;
BEGIN
 IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 ctx:=public.own_liquidation_context_v1(p,true,'annul');
 IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR coalesce(type_value,'') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 PERFORM public.own_run_lock_v1(ctx);
 current_rows:=public.own_liquidation_current_v1(ctx,period_value,type_value);
 FOR candidate_id IN SELECT a.id FROM public.own_payroll_run_capture a JOIN public.own_payroll_run_result saved ON saved.capture_id=a.id WHERE a.tenant_id=(ctx->>'tenantId')::uuid AND a.source_binding_id=(ctx->>'sourceBindingId')::uuid AND a.body->>'period'=period_value AND a.body->>'liquidationType'=type_value ORDER BY a.id LOOP
  IF jsonb_array_length(index_value)>=1000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
  -- Preserve full stored-body/payload/input/result/algorithm validation for ALL
  -- index sources. Only transport their references; never skip old annulled runs.
  c:=public.own_liquidation_capture_v1(ctx,candidate_id);
  SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
  employee_count:=jsonb_array_length(r.input->'employees');
  IF employee_count IS NULL OR employee_count NOT BETWEEN 1 AND 10000 OR r.result->'employeeCount' IS DISTINCT FROM to_jsonb(employee_count) OR jsonb_typeof(r.result->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(r.input->'totalsPrecision') IS DISTINCT FROM 'number' OR r.input->>'totalsPrecision'!~'^[0-8]$' OR(SELECT count(DISTINCT value->>'contractId') FROM jsonb_array_elements(r.input->'employees'))<>employee_count THEN RAISE EXCEPTION 'OWN_LIQ_CONTRACT_INVALID';END IF;
  state_counts:=jsonb_build_object('calculated',0,'confirmed',0,'annulled',0,'cancelled',0);confirmed_ids:='[]';
  FOR person IN SELECT value FROM jsonb_array_elements(r.input->'employees') ORDER BY value->>'contractId' COLLATE "C" LOOP
   SELECT coalesce((SELECT value->>'state' FROM jsonb_array_elements(current_rows) WHERE value->>'runId'=c.id::text AND value->>'contractId'=person->>'contractId'),'calculated') INTO row_state;
   IF row_state NOT IN('calculated','confirmed','annulled','cancelled') THEN RAISE EXCEPTION 'OWN_LIQ_CONTRACT_INVALID';END IF;
   state_counts:=jsonb_set(state_counts,ARRAY[row_state],to_jsonb((state_counts->>row_state)::integer+1));
   IF row_state='confirmed' THEN confirmed_ids:=confirmed_ids||jsonb_build_array(person->>'contractId');END IF;
  END LOOP;
  confirmed_total:=confirmed_total+jsonb_array_length(confirmed_ids);IF confirmed_total>10000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
  entry:=jsonb_build_object('id',c.id,'stateVersion',public.own_liquidation_state_v1(ctx,c),'bodySha256',c.body_sha256,'payloadSha256',c.payload_sha256,'inputSha256',r.input_sha256,'resultSha256',r.result_sha256,'algorithmSha256',c.algorithm_sha256,'employeeCount',employee_count,'conceptRowCount',jsonb_array_length(r.result->'rows'),'totalsPrecision',r.input->'totalsPrecision','createdAt',c.created_at,'liquidationDate',c.body->'liquidationDate','states',state_counts,'confirmedContractIds',confirmed_ids,'reviewAccessRequired',c.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid OR c.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR c.actor_email IS DISTINCT FROM ctx->>'actorEmail');
  index_value:=index_value||jsonb_build_array(entry);
  IF octet_length(index_value::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 END LOOP;
 IF EXISTS(SELECT ids.value FROM jsonb_array_elements(index_value) z CROSS JOIN LATERAL jsonb_array_elements_text(z.value->'confirmedContractIds') ids GROUP BY ids.value HAVING count(*)>1) THEN RAISE EXCEPTION 'OWN_LIQ_CONTRACT_INVALID';END IF;
 -- Exact active relation and canonical state basis from201. No full captures.
 SELECT coalesce(jsonb_agg(jsonb_build_object('runId',e.value->>'runId','contractId',e.value->>'contractId','groupId',g.value->>'id') ORDER BY e.value->>'contractId'),'[]') INTO closed FROM jsonb_array_elements(public.own_close_active_v1(ctx,period_value,type_value)) g CROSS JOIN LATERAL jsonb_array_elements(g.value#>'{snapshot,employees}') e;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'runId',e.capture_id,'bodySha256',e.body_sha256) ORDER BY e.id),'[]') INTO liquidation_history FROM public.own_payroll_liquidation_event e JOIN public.own_payroll_run_capture source_capture ON source_capture.id=e.capture_id WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND source_capture.body->>'period'=period_value AND source_capture.body->>'liquidationType'=type_value;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'bodySha256',e.body_sha256,'snapshotSha256',e.snapshot_sha256) ORDER BY e.id),'[]') INTO close_history FROM public.own_payroll_close_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=period_value AND e.liquidation_type=type_value;
 state_version:=public.own_run_hash_v1(jsonb_build_object('scopeVersion',public.native_salary_scope_v1(ctx),'period',period_value,'liquidationType',type_value,'runs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',value->>'id','stateVersion',value->>'stateVersion','bodySha256',value->>'bodySha256','resultSha256',value->>'resultSha256') ORDER BY value->>'id'),'[]') FROM jsonb_array_elements(index_value)),'closed',closed,'closeHistory',close_history));
 detail:=jsonb_build_object('version','own-annul-review.v2','period',period_value,'liquidationType',type_value,'scopeVersion',public.native_salary_scope_v1(ctx),'stateVersion',state_version,'index',index_value,'closed',closed,'liquidationHistory',liquidation_history,'closeHistory',close_history,'complete',true);
 -- State201 binds historical state, but not index states/confirmed IDs. Bind the
 -- ENTIRE transport separately; command-v2 compares this BEFORE any child event.
 detail:=detail||jsonb_build_object('reviewSha256',public.own_run_hash_v1(detail));
 IF octet_length(detail::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;RETURN detail;
END $review_body$;$definition_208$;
 REVOKE ALL ON FUNCTION public.own_annul_review_core_v2(jsonb,text,text,integer) FROM PUBLIC,municontrol_actions_runtime_app;

 EXECUTE $definition_208$CREATE FUNCTION public.own_annul_selected_index_v2(ctx jsonb,review jsonb,selection jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $selected_body$
DECLARE kind text:=selection->>'kind';entry jsonb;e jsonb;person jsonb;c public.own_payroll_run_capture;r public.own_payroll_run_result;rows_value jsonb;ids jsonb;val text;chosen text[]:='{}';selected jsonb:='[]';
BEGIN
 IF NOT public.own_program_exact_v1(selection,ARRAY['kind','values']) OR jsonb_typeof(selection->'kind') IS DISTINCT FROM 'string' OR kind NOT IN('all','contracts','agreements','departments') OR jsonb_typeof(selection->'values') IS DISTINCT FROM 'array' OR jsonb_array_length(selection->'values')>10000 OR(kind='all')<>(jsonb_array_length(selection->'values')=0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection->'values') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}'!~CASE WHEN kind='contracts' THEN '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' ELSE '^[0-9]{1,9}$' END) OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(selection->'values'))<>jsonb_array_length(selection->'values') OR selection->'values' IS DISTINCT FROM(SELECT coalesce(jsonb_agg(x ORDER BY x COLLATE "C"),'[]') FROM jsonb_array_elements_text(selection->'values') x) THEN RAISE EXCEPTION 'OWN_LIQ_SELECTION_INVALID';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(review->'index') WHERE jsonb_array_length(value->'confirmedContractIds')>0 ORDER BY value->>'id' LOOP
  c:=public.own_liquidation_capture_v1(ctx,(entry->>'id')::uuid);SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
  IF entry->>'stateVersion' IS DISTINCT FROM public.own_liquidation_state_v1(ctx,c) OR entry->>'resultSha256' IS DISTINCT FROM r.result_sha256 THEN RAISE EXCEPTION 'OWN_LIQ_STATE_CHANGED';END IF;
  rows_value:=public.own_liquidation_rows_v1(ctx,c);
  SELECT coalesce(jsonb_agg(value->>'contractId' ORDER BY value->>'contractId' COLLATE "C"),'[]') INTO ids FROM jsonb_array_elements(rows_value) WHERE value->>'state'='confirmed';
  IF ids IS DISTINCT FROM entry->'confirmedContractIds' THEN RAISE EXCEPTION 'OWN_LIQ_STATE_CHANGED';END IF;
  FOR e IN SELECT value FROM jsonb_array_elements(rows_value) WHERE value->>'state'='confirmed' LOOP
   SELECT value INTO person FROM jsonb_array_elements(r.input->'employees') WHERE value->>'contractId'=e->>'contractId';IF person IS NULL THEN RAISE EXCEPTION 'OWN_LIQ_CONTRACT_INVALID';END IF;
   val:=person->>CASE kind WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END;
   IF kind<>'all' AND NOT selection->'values' ? val THEN CONTINUE;END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(review->'closed') x WHERE x.value->>'runId'=c.id::text AND x.value->>'contractId'=e->>'contractId') THEN RAISE EXCEPTION 'OWN_CLOSE_REOPEN_REQUIRED';END IF;
   IF NOT e->'allowedCommands' ? 'annul' THEN RAISE EXCEPTION 'OWN_LIQ_DECISION_INVALID';END IF;
   chosen:=array_append(chosen,val);selected:=selected||jsonb_build_array(jsonb_build_object('runId',c.id::text,'resultSha256',r.result_sha256,'contractId',e->>'contractId','liquidationDate',c.body->'liquidationDate','version',(e->>'version')::integer+1,'liquidationVersion',e->'liquidationVersion'));
  END LOOP;
 END LOOP;
 IF jsonb_array_length(selected)=0 OR kind<>'all' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(selection->'values') x WHERE NOT x=ANY(chosen)) THEN RAISE EXCEPTION 'OWN_LIQ_SELECTION_INVALID';END IF;
 IF jsonb_array_length(selected)>10000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 RETURN(SELECT jsonb_agg(value ORDER BY value->>'contractId' COLLATE "C") FROM jsonb_array_elements(selected));
END $selected_body$;$definition_208$;
 REVOKE ALL ON FUNCTION public.own_annul_selected_index_v2(jsonb,jsonb,jsonb) FROM PUBLIC,municontrol_actions_runtime_app;

 EXECUTE $definition_208$CREATE FUNCTION public.own_annul_command_index_core_v2(p jsonb,body jsonb,key uuid,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $command_body$
DECLARE ctx jsonb;review jsonb;selected jsonb;run_value text;child jsonb;receipts jsonb:='[]';fingerprint text;receipt_value jsonb;event_id uuid:=gen_random_uuid();at_time timestamptz:=clock_timestamp();e public.own_payroll_annul_event;c public.own_payroll_run_capture;val text;
BEGIN
 IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(body,ARRAY['version','period','liquidationType','scopeVersion','stateVersion','reviewSha256','selection','reason','reviewConfirmed']) OR body->>'version' IS DISTINCT FROM 'own-annul-command.v2' OR octet_length(body::text)>524288 OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(body->>'reason') NOT BETWEEN 10 AND 500 OR btrim(body->>'reason')<>body->>'reason' OR body->>'reason'~'[[:cntrl:]]' OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR jsonb_typeof(body->'liquidationType') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 FOREACH val IN ARRAY ARRAY['scopeVersion','stateVersion','reviewSha256'] LOOP IF jsonb_typeof(body->val) IS DISTINCT FROM 'string' OR body->>val!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;END LOOP;
 ctx:=public.own_liquidation_context_v1(p,true,'annul');PERFORM public.own_run_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body);
 SELECT * INTO e FROM public.own_payroll_annul_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF e.body<>body OR e.body_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_LIQ_IDEMPOTENCY_REUSE';END IF;RETURN public.own_annul_attempt_capacity_core_v2(p,key,maximum_bytes);END IF;
 review:=public.own_annul_review_core_v2(p,body->>'period',body->>'liquidationType',maximum_bytes);
 IF body->>'scopeVersion'<>review->>'scopeVersion' OR body->>'stateVersion'<>review->>'stateVersion' OR body->>'reviewSha256'<>review->>'reviewSha256' THEN RAISE EXCEPTION 'OWN_LIQ_STATE_CHANGED';END IF;
 selected:=public.own_annul_selected_index_v2(ctx,review,body->'selection');
 -- All eligibility checks precede the first child event. One enclosing statement
 -- rolls every child back on any later guard or capacity failure, unchanged201.
 FOR run_value IN SELECT DISTINCT value->>'runId' FROM jsonb_array_elements(selected) ORDER BY 1 LOOP
  c:=public.own_liquidation_capture_v1(ctx,run_value::uuid);
  child:=public.own_liquidation_command_v1(p,jsonb_build_object('runId',run_value,'resultSha256',(SELECT result_sha256 FROM public.own_payroll_run_result WHERE capture_id=c.id),'scopeVersion',body->>'scopeVersion','stateVersion',public.own_liquidation_state_v1(ctx,c),'command','annul','selection',jsonb_build_object('kind','contracts','values',(SELECT jsonb_agg(value->>'contractId' ORDER BY value->>'contractId' COLLATE "C") FROM jsonb_array_elements(selected) WHERE value->>'runId'=run_value)),'reason',body->>'reason','reviewConfirmed',true),gen_random_uuid());
  receipts:=receipts||jsonb_build_array(child);
 END LOOP;
 receipt_value:=jsonb_build_object('version','own-annul-receipt.v2','id',event_id,'key',key,'body',body,'bodySha256',fingerprint,'affected',selected,'receipts',receipts,'recordedAt',at_time,'replayed',false);
 IF octet_length(receipt_value::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-run:capacity:v1',0)) THEN RAISE EXCEPTION 'OWN_LIQ_BUSY';END IF;
 IF(SELECT coalesce(sum(octet_length(a.body::text)+octet_length(a.receipt::text)),0) FROM public.own_payroll_annul_event a)+octet_length(body::text)+octet_length(receipt_value::text)>67108864 OR(SELECT count(*) FROM public.own_payroll_annul_event a WHERE a.tenant_id=(ctx->>'tenantId')::uuid AND a.source_binding_id=(ctx->>'sourceBindingId')::uuid)>=4000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 INSERT INTO public.own_payroll_annul_event(id,tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_email,actor_label,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,receipt,recorded_at) VALUES(event_id,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',coalesce(nullif(ctx->>'actorLabel',''),'Autoridad municipal'),(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,body,fingerprint,receipt_value,at_time);RETURN receipt_value;
END $command_body$;$definition_208$;
 REVOKE ALL ON FUNCTION public.own_annul_command_index_core_v2(jsonb,jsonb,uuid,integer) FROM PUBLIC,municontrol_actions_runtime_app;

 EXECUTE $definition_208$CREATE FUNCTION public.own_annul_review_v2(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $wrapper$BEGIN RETURN public.own_annul_review_core_v2(p,period_value,type_value,4194304);END $wrapper$;$definition_208$;
 REVOKE ALL ON FUNCTION public.own_annul_review_v2(jsonb,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
 GRANT EXECUTE ON FUNCTION public.own_annul_review_v2(jsonb,text,text) TO municontrol_actions_runtime_app;
 EXECUTE $definition_208$CREATE FUNCTION public.own_annul_review_full_v2(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $wrapper$BEGIN RETURN public.own_annul_review_core_v2(p,period_value,type_value,33554432);END $wrapper$;$definition_208$;
 REVOKE ALL ON FUNCTION public.own_annul_review_full_v2(jsonb,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
 GRANT EXECUTE ON FUNCTION public.own_annul_review_full_v2(jsonb,text,text) TO municontrol_actions_runtime_app;
 EXECUTE $definition_208$CREATE FUNCTION public.own_annul_command_v2(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $wrapper$BEGIN RETURN public.own_annul_command_index_core_v2(p,body,key,4194304);END $wrapper$;$definition_208$;
 REVOKE ALL ON FUNCTION public.own_annul_command_v2(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
 GRANT EXECUTE ON FUNCTION public.own_annul_command_v2(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
 EXECUTE $definition_208$CREATE FUNCTION public.own_annul_command_full_v2(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $wrapper$BEGIN RETURN public.own_annul_command_index_core_v2(p,body,key,33554432);END $wrapper$;$definition_208$;
 REVOKE ALL ON FUNCTION public.own_annul_command_full_v2(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
 GRANT EXECUTE ON FUNCTION public.own_annul_command_full_v2(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;

 -- Existing function and relation definitions/ACL/constraints must be byte-equal
 -- through installation. New private helpers expose no runtime/PUBLIC authority.
 SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.oid),'[]') INTO current_functions FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND NOT p.proname=ANY(new_names);
 IF current_functions IS DISTINCT FROM original_functions THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_EXISTING_FUNCTION_CHANGED';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('class',to_jsonb(c),'attributes',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid),'constraints',(SELECT jsonb_agg(to_jsonb(k) ORDER BY k.oid) FROM pg_constraint k WHERE k.conrelid=c.oid),'triggers',(SELECT jsonb_agg(to_jsonb(t) ORDER BY t.oid) FROM pg_trigger t WHERE t.tgrelid=c.oid)) ORDER BY c.oid),'[]') INTO current_relations FROM pg_class c WHERE c.oid IN(to_regclass('public.own_payroll_run_capture'),to_regclass('public.own_payroll_run_result'),to_regclass('public.own_payroll_liquidation_event'),to_regclass('public.own_payroll_close_event'),to_regclass('public.own_payroll_annul_event'));
 IF current_relations IS DISTINCT FROM original_relations THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_EXISTING_RELATION_CHANGED';END IF;
 FOREACH expected_name IN ARRAY new_names LOOP
  IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=expected_name)<>1 THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_OBJECT_CONFLICT';END IF;
  SELECT * INTO actual FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=expected_name;
  IF actual.proowner<>current_user::regrole OR NOT actual.prosecdef OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC'] OR EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantor<>actual.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR(a.grantee<>actual.proowner AND NOT(expected_name IN('own_annul_review_v2','own_annul_review_full_v2','own_annul_command_v2','own_annul_command_full_v2') AND a.grantee=runtime_oid))) OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=actual.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) OR(expected_name IN('own_annul_review_v2','own_annul_review_full_v2','own_annul_command_v2','own_annul_command_full_v2')) IS DISTINCT FROM EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=runtime_oid AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'OWN_ANNUL_REVIEW_NEW_ACL_CHANGED';END IF;
 END LOOP;
END $own_annul_review_208$;
