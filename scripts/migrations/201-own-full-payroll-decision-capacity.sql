-- PRIVATE SOURCE CANDIDATE ONLY. Source base383649a4, not an executed migration.
-- Installation must be one authorized transaction, with complete conservation
-- evidence before COMMIT. No GUC, identity rewrite, writer clone or data pruning.
DO $capacity_preflight$
DECLARE expected jsonb;actual pg_proc;runtime_oid oid;constraint_row pg_constraint;target_relation regclass;definition text;effective_function_defaults aclitem[];
BEGIN
 runtime_oid:=to_regrole('municontrol_actions_runtime_app');
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_PREREQUISITE';END IF;
 -- Global defaults replace acldefault; public-schema defaults add to them.
 -- PUBLIC/runtime grants are removed on cores. No unexpected grantee,
 -- grantor, privilege or grant option may reach any CREATE statement.
 effective_function_defaults:=coalesce((SELECT d.defaclacl FROM pg_default_acl d WHERE d.defaclrole=current_user::regrole AND d.defaclobjtype='f' AND d.defaclnamespace=0),acldefault('f',current_user::regrole))
  ||coalesce((SELECT d.defaclacl FROM pg_default_acl d WHERE d.defaclrole=current_user::regrole AND d.defaclobjtype='f' AND d.defaclnamespace='public'::regnamespace),'{}'::aclitem[]);
 IF EXISTS(SELECT 1 FROM aclexplode(effective_function_defaults) a WHERE a.grantor<>current_user::regrole OR a.grantee NOT IN(0,current_user::regrole,runtime_oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable)
  OR NOT EXISTS(SELECT 1 FROM aclexplode(effective_function_defaults) a WHERE a.grantee=current_user::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
 THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_DEFAULT_ACL_CHANGED';END IF;

 FOR expected IN SELECT value FROM jsonb_array_elements('[{"name":"own_liquidation_detail_v1","signature":"public.own_liquidation_detail_v1(jsonb,uuid)","argNames":["p","run_id"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"806b3743cfb193dbc96de8ea9924f348854f484cde1a255d1d195e41f7668ded","definitionSha256":"0ec8dd587a0e2a9930345d0c16da4bc1a88555061a279301154cacd8747d81a9","volatility":"v"},{"name":"own_annul_detail_v1","signature":"public.own_annul_detail_v1(jsonb,text,text)","argNames":["p","period_value","type_value"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"a0ac76f463360ad15daec6aa8b6f21e28c241bec48c5d45048140519eb1cabe0","definitionSha256":"3ef2ec9373a0d76b563fdbe191e8e693a853ba41c10eae572eb8cd195ee09284","volatility":"v"},{"name":"own_annul_attempt_v1","signature":"public.own_annul_attempt_v1(jsonb,uuid)","argNames":["p","key"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"bodySha256":"f09145af9a84cd88483b2c8cef3df711cc7328775798e2977a1d487f6d1e4a8d","definitionSha256":"5591f57a0fe570d593e63e4e8b1e7d951615fcd68df44a52b171f9c49959a0eb","volatility":"v"},{"name":"own_annul_command_v1","signature":"public.own_annul_command_v1(jsonb,jsonb,uuid)","argNames":["p","body","key"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"a8f41f70ef76c9266348721fa531b78e115c793921491b35ace436737b16c92f","definitionSha256":"845c2c55064b9a65c7e09bce156402bc643b8c08f97b545f776fd902508b4f94","volatility":"v"},{"name":"own_close_detail_v1","signature":"public.own_close_detail_v1(jsonb,text,text)","argNames":["p","period_value","type_value"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"cf59ba377c978346872f88d3dfd144fac13d7c0615ec0ed289839451513b540f","definitionSha256":"ce61fc00c7f4bb5fc075a98771f59dbde6cbe02dcf37e95a06a032c215155236","volatility":"v"},{"name":"own_close_attempt_v1","signature":"public.own_close_attempt_v1(jsonb,uuid)","argNames":["p","key"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"bodySha256":"4a0b209001ef38f926e6fc36109820298fd041150ee28b1ae5824225c7858e25","definitionSha256":"c822ae748981a1b6c7788f4b2a7ddb3790a9e59d3d73738b067fb60ae2d0cb9c","volatility":"v"},{"name":"own_close_group_v1","signature":"public.own_close_group_v1(jsonb,uuid)","argNames":["p","group_value"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"bodySha256":"a3ce164f8ec9ebe298c76d4b9d88967f3add104457df7ca07f47d605faa75a86","definitionSha256":"bdda9e760e4a9a82de3a94dd163bd8c81bce22880410aaba46270095fd8e4d5b","volatility":"v"},{"name":"own_close_command_v1","signature":"public.own_close_command_v1(jsonb,jsonb,uuid)","argNames":["p","body","key"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"eb3df3a03688835055b365ff58961f677210987e523ce973c9fa3441e5c30b94","definitionSha256":"11dac0f1c4f442c0f923b4b60753571fe663e38282e4ddf32534a79092287f5b","volatility":"v"},{"name":"own_close_snapshot_v1","signature":"public.own_close_snapshot_v1(jsonb,jsonb)","argNames":["detail","selection"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"bodySha256":"11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0","definitionSha256":"3d531c5c531aae3fc559ddb287fb00ea610f9ae7f42f492a68141715ca3e05b0","volatility":"i"},{"name":"own_annul_selected_v1","signature":"public.own_annul_selected_v1(jsonb,jsonb)","argNames":["detail","selection"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"bodySha256":"e191fd94787a93e809e79b97d751b1c9c9371833eb7275fe4d3c272eceeadd31","definitionSha256":"bc13d2b02e084173375ac0ed554d40f8f64e719cbf63322873f0e5e5f12269a5","volatility":"v"},{"name":"own_close_report_census_v1","signature":"public.own_close_report_census_v1(jsonb,text,text)","argNames":["p","period_value","type_value"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"16b0b8faa8016cac5d70d8c34d5e303567ec84686af2f63fbc3cef51a1216f2c","definitionSha256":"3baf6bfa9a5e3ebbb74576c470c8f6c0f67415e9d9b7b0ebb45fc00645c04166","volatility":"v"}]'::jsonb) LOOP
  SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(expected->>'signature');
  IF actual.oid IS NULL OR actual.proowner<>current_user::regrole OR NOT actual.prosecdef OR actual.proretset OR actual.proisstrict OR actual.provolatile IS DISTINCT FROM (expected->>'volatility')::"char"
   OR actual.prokind<>'f' OR actual.proleakproof OR actual.proparallel<>'u' OR actual.procost<>100 OR actual.prorows<>0 OR actual.prosupport<>0 OR actual.probin IS NOT NULL OR actual.proallargtypes IS NOT NULL
   OR actual.prorettype<>'jsonb'::regtype OR actual.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql') OR actual.pronargdefaults<>0 OR actual.proargmodes IS NOT NULL
   OR to_jsonb(actual.proargnames) IS DISTINCT FROM expected->'argNames' OR to_jsonb(actual.proconfig) IS DISTINCT FROM expected->'config'
   OR encode(sha256(convert_to(replace(actual.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>expected->>'bodySha256'
  THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_DEFINITION_CHANGED';END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantor<>actual.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR (a.grantee<>actual.proowner AND NOT((expected->>'runtime')::boolean AND a.grantee=runtime_oid)))
   OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=actual.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
   OR (expected->>'runtime')::boolean IS DISTINCT FROM EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=runtime_oid AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
   OR (SELECT count(*) FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))))<>(CASE WHEN (expected->>'runtime')::boolean THEN 2 ELSE 1 END)
  THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ACL_CHANGED';END IF;
 END LOOP;
 IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_report_census_v1')<>1 THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CENSUS_OVERLOAD';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_liquidation_detail_capacity_core_v2') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_liquidation_detail_full_v1') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_annul_detail_capacity_core_v2') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_annul_detail_full_v1') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_annul_attempt_capacity_core_v2') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_annul_attempt_full_v1') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_annul_command_capacity_core_v2') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_annul_command_full_v1') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_detail_capacity_core_v2') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_detail_full_v1') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_attempt_capacity_core_v2') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_attempt_full_v1') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_group_capacity_core_v2') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_group_full_v1') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_command_capacity_core_v2') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_command_full_v1') THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_ALREADY_PRESENT';END IF;
 target_relation:=to_regclass('public.own_payroll_close_event');
 IF target_relation IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=target_relation AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relrowsecurity) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=target_relation AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_TABLE_CHANGED';END IF;
 SELECT * INTO constraint_row FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_close_event_snapshot_check';
 IF constraint_row.oid IS NULL OR constraint_row.contype<>'c' OR NOT constraint_row.convalidated OR NOT constraint_row.conislocal OR constraint_row.coninhcount<>0 OR constraint_row.connoinherit THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CHECK_CHANGED';END IF;
 definition:=pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false);
 IF definition IS DISTINCT FROM '((jsonb_typeof(snapshot) = ''object''::text) AND (octet_length((snapshot)::text) <= 3145728))' THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CHECK_CHANGED';END IF;
 target_relation:=to_regclass('public.own_payroll_close_event');
 IF target_relation IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=target_relation AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relrowsecurity) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=target_relation AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_TABLE_CHANGED';END IF;
 SELECT * INTO constraint_row FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_close_event_receipt_check';
 IF constraint_row.oid IS NULL OR constraint_row.contype<>'c' OR NOT constraint_row.convalidated OR NOT constraint_row.conislocal OR constraint_row.coninhcount<>0 OR constraint_row.connoinherit THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CHECK_CHANGED';END IF;
 definition:=pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false);
 IF definition IS DISTINCT FROM '((jsonb_typeof(receipt) = ''object''::text) AND (octet_length((receipt)::text) <= 4194304))' THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CHECK_CHANGED';END IF;
 target_relation:=to_regclass('public.own_payroll_annul_event');
 IF target_relation IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=target_relation AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relrowsecurity) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=target_relation AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_TABLE_CHANGED';END IF;
 SELECT * INTO constraint_row FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_annul_event_receipt_check';
 IF constraint_row.oid IS NULL OR constraint_row.contype<>'c' OR NOT constraint_row.convalidated OR NOT constraint_row.conislocal OR constraint_row.coninhcount<>0 OR constraint_row.connoinherit THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CHECK_CHANGED';END IF;
 definition:=pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false);
 IF definition IS DISTINCT FROM '((jsonb_typeof(receipt) = ''object''::text) AND (octet_length((receipt)::text) <= 4194304))' THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CHECK_CHANGED';END IF;
END $capacity_preflight$;

-- Three finite table caps only; body/identity/hash/FK/RLS/immutability controls unchanged.
ALTER TABLE public.own_payroll_close_event DROP CONSTRAINT own_payroll_close_event_snapshot_check;
ALTER TABLE public.own_payroll_close_event ADD CONSTRAINT own_payroll_close_event_snapshot_check CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=33546240);
ALTER TABLE public.own_payroll_close_event DROP CONSTRAINT own_payroll_close_event_receipt_check;
ALTER TABLE public.own_payroll_close_event ADD CONSTRAINT own_payroll_close_event_receipt_check CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=33554432);
ALTER TABLE public.own_payroll_annul_event DROP CONSTRAINT own_payroll_annul_event_receipt_check;
ALTER TABLE public.own_payroll_annul_event ADD CONSTRAINT own_payroll_annul_event_receipt_check CHECK(jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=33554432);

-- Private implementation cores. Their authority/SoD/locks/hash/selection/writes
-- are the complete existing bodies, plus finite-profile and capacity changes only.
CREATE FUNCTION public.own_liquidation_detail_capacity_core_v2(p jsonb,run_id uuid,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_core$
DECLARE ctx jsonb;c public.own_payroll_run_capture;value jsonb;BEGIN IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF; ctx:=public.own_liquidation_context_v1(p,true);PERFORM public.own_run_lock_v1(ctx);c:=public.own_liquidation_capture_v1(ctx,run_id);
 value:=jsonb_build_object('version','own-liquidation-detail.v1','id',c.id,'scopeVersion',public.native_salary_scope_v1(ctx),'stateVersion',public.own_liquidation_state_v1(ctx,c),'reviewAccessRequired',c.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid OR c.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR c.actor_email IS DISTINCT FROM ctx->>'actorEmail','capture',public.own_run_receipt_v1(c,true),'employees',public.own_liquidation_rows_v1(ctx,c),'effects',jsonb_build_object('paymentExecuted',false,'accountingPosted',false,'periodClosed',false));
 IF octet_length(value::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;RETURN value;END $capacity_core$;

CREATE FUNCTION public.own_annul_detail_capacity_core_v2(p jsonb,period_value text,type_value text,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_core$
DECLARE ctx jsonb;c public.own_payroll_run_capture;runs jsonb:='[]';closed jsonb;detail jsonb;state_version text;BEGIN IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 ctx:=public.own_liquidation_context_v1(p,true,'annul');
 IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR coalesce(type_value,'') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 PERFORM public.own_run_lock_v1(ctx);
 FOR c IN SELECT a.* FROM public.own_payroll_run_capture a JOIN public.own_payroll_run_result r ON r.capture_id=a.id WHERE a.tenant_id=(ctx->>'tenantId')::uuid AND a.source_binding_id=(ctx->>'sourceBindingId')::uuid AND a.body->>'period'=period_value AND a.body->>'liquidationType'=type_value ORDER BY a.id LOOP
  IF jsonb_array_length(runs)>=1000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
  runs:=runs||jsonb_build_array(public.own_liquidation_detail_capacity_core_v2(p,c.id,maximum_bytes));
  IF octet_length(runs::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 END LOOP;
 IF(SELECT count(*) FROM jsonb_array_elements(runs) r CROSS JOIN LATERAL jsonb_array_elements(r.value->'employees') e WHERE e.value->>'state'='confirmed')>10000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 IF EXISTS(SELECT e.value->>'contractId' FROM jsonb_array_elements(runs) r CROSS JOIN LATERAL jsonb_array_elements(r.value->'employees') e WHERE e.value->>'state'='confirmed' GROUP BY e.value->>'contractId' HAVING count(*)>1) THEN RAISE EXCEPTION 'OWN_LIQ_CONTRACT_INVALID';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('runId',e.value->>'runId','contractId',e.value->>'contractId','groupId',g.value->>'id') ORDER BY e.value->>'contractId'),'[]') INTO closed FROM jsonb_array_elements(public.own_close_active_v1(ctx,period_value,type_value)) g CROSS JOIN LATERAL jsonb_array_elements(g.value#>'{snapshot,employees}') e;
 state_version:=public.own_run_hash_v1(jsonb_build_object('scopeVersion',public.native_salary_scope_v1(ctx),'period',period_value,'liquidationType',type_value,'runs',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',value->>'id','stateVersion',value->>'stateVersion','bodySha256',value#>>'{capture,bodySha256}','resultSha256',value#>>'{capture,saved,resultSha256}') ORDER BY value->>'id'),'[]') FROM jsonb_array_elements(runs)),'closed',closed,'closeHistory',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'bodySha256',e.body_sha256,'snapshotSha256',e.snapshot_sha256) ORDER BY e.id),'[]') FROM public.own_payroll_close_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=period_value AND e.liquidation_type=type_value)));
 detail:=jsonb_build_object('version','own-annul-detail.v1','period',period_value,'liquidationType',type_value,'scopeVersion',public.native_salary_scope_v1(ctx),'stateVersion',state_version,'runs',runs,'closed',closed,'complete',true);
 IF octet_length(detail::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;RETURN detail;END $capacity_core$;

CREATE FUNCTION public.own_annul_attempt_capacity_core_v2(p jsonb,key uuid,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capacity_core$
DECLARE ctx jsonb;e public.own_payroll_annul_event;BEGIN IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF; ctx:=public.own_liquidation_context_v1(p,true,'annul');SELECT * INTO e FROM public.own_payroll_annul_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF e.id IS NULL THEN RAISE EXCEPTION 'OWN_LIQ_NOT_FOUND';END IF;IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'OWN_LIQ_FORBIDDEN';END IF;
 IF e.body_sha256<>public.own_run_hash_v1(e.body) OR e.receipt->'body' IS DISTINCT FROM e.body THEN RAISE EXCEPTION 'OWN_LIQ_CONTRACT_INVALID';END IF;IF octet_length((e.receipt||jsonb_build_object('replayed',true))::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;RETURN e.receipt||jsonb_build_object('replayed',true);END $capacity_core$;

CREATE FUNCTION public.own_annul_command_capacity_core_v2(p jsonb,body jsonb,key uuid,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_core$
DECLARE ctx jsonb;detail jsonb;selected jsonb;run_value text;child jsonb;receipts jsonb:='[]';fingerprint text;receipt_value jsonb;event_id uuid:=gen_random_uuid();at_time timestamptz:=clock_timestamp();e public.own_payroll_annul_event;c public.own_payroll_run_capture;val text;BEGIN IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(body,ARRAY['period','liquidationType','scopeVersion','stateVersion','selection','reason','reviewConfirmed']) OR octet_length(body::text)>524288 OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(body->>'reason') NOT BETWEEN 10 AND 500 OR btrim(body->>'reason')<>body->>'reason' OR body->>'reason'~'[[:cntrl:]]' OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR jsonb_typeof(body->'liquidationType') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;
 FOREACH val IN ARRAY ARRAY['scopeVersion','stateVersion'] LOOP IF jsonb_typeof(body->val) IS DISTINCT FROM 'string' OR body->>val!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_LIQ_INPUT_INVALID';END IF;END LOOP;
 ctx:=public.own_liquidation_context_v1(p,true,'annul');PERFORM public.own_run_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body);
 SELECT * INTO e FROM public.own_payroll_annul_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF e.body<>body OR e.body_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_LIQ_IDEMPOTENCY_REUSE';END IF;RETURN public.own_annul_attempt_capacity_core_v2(p,key,maximum_bytes);END IF;
 detail:=public.own_annul_detail_capacity_core_v2(p,body->>'period',body->>'liquidationType',maximum_bytes);IF body->>'scopeVersion'<>detail->>'scopeVersion' OR body->>'stateVersion'<>detail->>'stateVersion' THEN RAISE EXCEPTION 'OWN_LIQ_STATE_CHANGED';END IF;
 selected:=public.own_annul_selected_v1(detail,body->'selection');
 -- All eligibility checks precede the first event. The enclosing SQL statement
 -- also rolls back earlier child events if any later guard/capacity check fails.
 FOR run_value IN SELECT DISTINCT value->>'runId' FROM jsonb_array_elements(selected) ORDER BY 1 LOOP
  c:=public.own_liquidation_capture_v1(ctx,run_value::uuid);
  child:=public.own_liquidation_command_v1(p,jsonb_build_object('runId',run_value,'resultSha256',(SELECT result_sha256 FROM public.own_payroll_run_result WHERE capture_id=c.id),'scopeVersion',body->>'scopeVersion','stateVersion',public.own_liquidation_state_v1(ctx,c),'command','annul','selection',jsonb_build_object('kind','contracts','values',(SELECT jsonb_agg(value->>'contractId' ORDER BY value->>'contractId' COLLATE "C") FROM jsonb_array_elements(selected) WHERE value->>'runId'=run_value)),'reason',body->>'reason','reviewConfirmed',true),gen_random_uuid());
  receipts:=receipts||jsonb_build_array(child);
 END LOOP;
 receipt_value:=jsonb_build_object('version','own-annul-receipt.v1','id',event_id,'key',key,'body',body,'bodySha256',fingerprint,'affected',selected,'receipts',receipts,'recordedAt',at_time,'replayed',false);
 IF octet_length(receipt_value::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-run:capacity:v1',0)) THEN RAISE EXCEPTION 'OWN_LIQ_BUSY';END IF;
 IF(SELECT coalesce(sum(octet_length(a.body::text)+octet_length(a.receipt::text)),0) FROM public.own_payroll_annul_event a)+octet_length(body::text)+octet_length(receipt_value::text)>67108864 OR(SELECT count(*) FROM public.own_payroll_annul_event a WHERE a.tenant_id=(ctx->>'tenantId')::uuid AND a.source_binding_id=(ctx->>'sourceBindingId')::uuid)>=4000 THEN RAISE EXCEPTION 'OWN_LIQ_LIMIT';END IF;
 INSERT INTO public.own_payroll_annul_event(id,tenant_id,source_binding_id,actor_membership_id,actor_person_id,actor_email,actor_label,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,receipt,recorded_at) VALUES(event_id,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',coalesce(nullif(ctx->>'actorLabel',''),'Autoridad municipal'),(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,body,fingerprint,receipt_value,at_time);RETURN receipt_value;END $capacity_core$;

CREATE FUNCTION public.own_close_detail_capacity_core_v2(p jsonb,period_value text,type_value text,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_core$
DECLARE ctx jsonb;roster jsonb;current_rows jsonb;closed jsonb;groups_value jsonb;rows_value jsonb:='[]';captures jsonb:='[]';person jsonb;decision jsonb;group_value jsonb;c public.own_payroll_run_capture;r public.own_payroll_run_result;state_version text;detail_value jsonb;independent boolean;run_ids uuid[]:='{}';capture_cache public.own_payroll_run_capture[]:='{}';result_cache public.own_payroll_run_result[]:='{}';cache_index integer;next_capture jsonb;next_row jsonb;item_bytes bigint;detail_bytes bigint:=8192+4;BEGIN IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;
 ctx:=public.own_close_context_v1(p,true);IF coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR coalesce(type_value,'') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;
 PERFORM public.own_run_lock_v1(ctx);roster:=public.own_close_roster_v1(ctx||jsonb_build_object('ownCloseLiquidationType',type_value),period_value);current_rows:=public.own_liquidation_current_v1(ctx,period_value,type_value);closed:=public.own_close_active_v1(ctx,period_value,type_value);
 IF(SELECT count(*) FROM public.own_payroll_close_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=period_value AND e.liquidation_type=type_value AND e.command='close')>1000 THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'state',CASE WHEN reopened.id IS NULL THEN 'closed' ELSE 'reopened' END,'employeeCount',e.snapshot->'employeeCount','populationCount',e.snapshot->'populationCount','populationComplete',e.snapshot->'populationComplete','recordedAt',e.recorded_at,'reopenedAt',reopened.recorded_at,'actorLabel',e.actor_label,'reason',e.body->>'reason','snapshotSha256',e.snapshot_sha256,'canReopen',reopened.id IS NULL AND public.action_center_context_has_capability(ctx,'payroll.calculation.close') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(e.snapshot->'employees') selected JOIN public.own_payroll_run_capture source_capture ON source_capture.id=(selected.value->>'runId')::uuid WHERE source_capture.actor_person_id=(ctx->>'actorPersonId')::uuid OR source_capture.actor_membership_id=(ctx->>'membershipId')::uuid OR source_capture.actor_email=ctx->>'actorEmail')) ORDER BY e.recorded_at DESC,e.id),'[]') INTO groups_value FROM public.own_payroll_close_event e LEFT JOIN public.own_payroll_close_event reopened ON reopened.tenant_id=e.tenant_id AND reopened.source_binding_id=e.source_binding_id AND reopened.group_id=e.id AND reopened.command='reopen' WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=period_value AND e.liquidation_type=type_value AND e.command='close';
 -- Running lower bound: two array delimiters, groups once, each new object once.
 -- Final exact detail serialization remains authoritative.
 detail_bytes:=detail_bytes+octet_length(groups_value::text);
 IF detail_bytes>maximum_bytes THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
 FOR person IN SELECT value FROM jsonb_array_elements(roster) LOOP
  SELECT g.value INTO group_value FROM jsonb_array_elements(closed) g WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(g.value#>'{snapshot,employees}') x WHERE x.value->>'contractId'=person->>'contractId');
  IF group_value IS NULL THEN
  IF(SELECT count(*) FROM jsonb_array_elements(current_rows) x WHERE x.value->>'contractId'=person->>'contractId' AND x.value->>'state'='confirmed')>1 THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  SELECT x.value INTO decision FROM jsonb_array_elements(current_rows) x WHERE x.value->>'contractId'=person->>'contractId' AND x.value->>'state'='confirmed';
  ELSE SELECT x.value INTO decision FROM jsonb_array_elements(group_value#>'{snapshot,employees}') x WHERE x.value->>'contractId'=person->>'contractId';END IF;
  IF decision IS NULL THEN
   next_row:=person||jsonb_build_object('state','missing','runId',NULL,'resultSha256',NULL,'liquidationVersion',NULL,'groupId',NULL,'canClose',false);
   item_bytes:=octet_length(next_row::text)+(CASE WHEN jsonb_array_length(rows_value)=0 THEN 0 ELSE 2 END);
   IF detail_bytes+item_bytes>maximum_bytes THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
   detail_bytes:=detail_bytes+item_bytes;rows_value:=rows_value||jsonb_build_array(next_row);CONTINUE;
  END IF;
  cache_index:=array_position(run_ids,(decision->>'runId')::uuid);
  IF cache_index IS NULL THEN
   c:=public.own_liquidation_capture_v1(ctx,(decision->>'runId')::uuid);SELECT * INTO r FROM public.own_payroll_run_result WHERE capture_id=c.id;
   next_capture:=public.own_run_receipt_v1(c,true);
   item_bytes:=octet_length(next_capture::text)+(CASE WHEN cardinality(run_ids)=0 THEN 0 ELSE 2 END);
   IF cardinality(run_ids)>=1000 OR detail_bytes+item_bytes>maximum_bytes THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
   detail_bytes:=detail_bytes+item_bytes;
   run_ids:=array_append(run_ids,c.id);capture_cache:=array_append(capture_cache,c);result_cache:=array_append(result_cache,r);
   captures:=captures||jsonb_build_array(next_capture);
  ELSE c:=capture_cache[cache_index];r:=result_cache[cache_index];END IF;
  IF group_value IS NULL THEN PERFORM public.own_period_classification_close_match_v1(ctx,c,(person->>'contractId')::uuid,period_value);END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.input->'employees') x WHERE x.value->>'contractId'=person->>'contractId' AND x.value->>'employeeNumber'=person->>'employeeNumber' AND x.value->>'agreementCode'=person->>'agreementCode' AND x.value->>'departmentCode'=person->>'departmentCode') THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;
  -- The one admitted capture was budgeted and appended before cache retention.

  independent:=c.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid AND c.actor_membership_id IS DISTINCT FROM(ctx->>'membershipId')::uuid AND c.actor_email IS DISTINCT FROM ctx->>'actorEmail';
  next_row:=person||jsonb_build_object('state',CASE WHEN group_value IS NULL THEN 'confirmed' ELSE 'closed' END,'runId',c.id,'resultSha256',r.result_sha256,'liquidationVersion',decision->'liquidationVersion','groupId',group_value->>'id','canClose',group_value IS NULL AND independent AND public.action_center_context_has_capability(ctx,'payroll.calculation.close'));
  item_bytes:=octet_length(next_row::text)+(CASE WHEN jsonb_array_length(rows_value)=0 THEN 0 ELSE 2 END);
  IF detail_bytes+item_bytes>maximum_bytes THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
  detail_bytes:=detail_bytes+item_bytes;rows_value:=rows_value||jsonb_build_array(next_row);
 END LOOP;
 state_version:=public.own_run_hash_v1(jsonb_build_object('snapshotVersion','own-close-snapshot.v2','scopeVersion',public.native_salary_scope_v1(ctx),'roster',roster,'rows',rows_value,'groups',groups_value,'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',le.id,'bodySha256',le.body_sha256) ORDER BY le.id),'[]') FROM public.own_payroll_liquidation_event le JOIN public.own_payroll_run_capture pc ON pc.id=le.capture_id WHERE le.tenant_id=(ctx->>'tenantId')::uuid AND le.source_binding_id=(ctx->>'sourceBindingId')::uuid AND pc.body->>'period'=period_value AND pc.body->>'liquidationType'=type_value)));
 detail_value:=jsonb_build_object('version','own-close-detail.v2','period',period_value,'liquidationType',type_value,'scopeVersion',public.native_salary_scope_v1(ctx),'stateVersion',state_version,'populationDomain','native_registered','rosterVersion',public.own_run_hash_v1(roster),'rows',rows_value,'captures',captures,'groups',groups_value,'canWrite',public.action_center_context_has_capability(ctx,'payroll.calculation.close'),'complete',true);
 IF jsonb_array_length(captures)>1000 OR octet_length(detail_value::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;RETURN detail_value;END $capacity_core$;

CREATE FUNCTION public.own_close_attempt_capacity_core_v2(p jsonb,key uuid,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capacity_core$
DECLARE ctx jsonb;e public.own_payroll_close_event;BEGIN IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF; ctx:=public.own_close_context_v1(p,true);SELECT * INTO e FROM public.own_payroll_close_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF e.id IS NULL THEN RAISE EXCEPTION 'OWN_CLOSE_NOT_FOUND';END IF;IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'OWN_CLOSE_FORBIDDEN';END IF;IF octet_length((e.receipt||jsonb_build_object('replayed',true))::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;RETURN e.receipt||jsonb_build_object('replayed',true);END $capacity_core$;

CREATE FUNCTION public.own_close_group_capacity_core_v2(p jsonb,group_value uuid,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capacity_core$
DECLARE ctx jsonb;e public.own_payroll_close_event;BEGIN IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF; ctx:=public.own_close_context_v1(p,true);SELECT * INTO e FROM public.own_payroll_close_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND id=group_value AND command='close';IF e.id IS NULL THEN RAISE EXCEPTION 'OWN_CLOSE_NOT_FOUND';END IF;IF octet_length((e.receipt||jsonb_build_object('replayed',true))::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;RETURN e.receipt||jsonb_build_object('replayed',true);END $capacity_core$;

CREATE FUNCTION public.own_close_command_capacity_core_v2(p jsonb,body jsonb,key uuid,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_core$
DECLARE ctx jsonb;e public.own_payroll_close_event;original public.own_payroll_close_event;detail jsonb;snapshot_value jsonb;fingerprint text;event_id uuid:=gen_random_uuid();group_value uuid;at_time timestamptz:=clock_timestamp();receipt_value jsonb;val text;period_value text;type_value text;BEGIN IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(body,ARRAY['period','liquidationType','scopeVersion','stateVersion','selection','command','groupId','reason','reviewConfirmed']) OR octet_length(body::text)>524288 OR body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(body->'command') IS DISTINCT FROM 'string' OR body->>'command' NOT IN('close','reopen') OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR length(body->>'reason') NOT BETWEEN 10 AND 500 OR btrim(body->>'reason')<>body->>'reason' OR body->>'reason'~'[[:cntrl:]]' OR key IS NULL OR key::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;
 FOREACH val IN ARRAY ARRAY['scopeVersion','stateVersion'] LOOP IF jsonb_typeof(body->val) IS DISTINCT FROM 'string' OR body->>val!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;END LOOP;
 ctx:=public.own_close_context_v1(p,true,true);PERFORM public.own_run_lock_v1(ctx);fingerprint:=public.own_run_hash_v1(body);
 SELECT * INTO e FROM public.own_payroll_close_event WHERE tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=key;
 IF FOUND THEN IF e.actor_person_id IS DISTINCT FROM(ctx->>'actorPersonId')::uuid OR e.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'OWN_CLOSE_FORBIDDEN';END IF;IF e.body<>body OR e.body_sha256<>fingerprint THEN RAISE EXCEPTION 'OWN_CLOSE_IDEMPOTENCY_REUSE';END IF;IF octet_length((e.receipt||jsonb_build_object('replayed',true))::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;RETURN e.receipt||jsonb_build_object('replayed',true);END IF;
 IF jsonb_typeof(body->'period') IS DISTINCT FROM 'string' OR jsonb_typeof(body->'liquidationType') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;
 period_value:=body->>'period';type_value:=body->>'liquidationType';detail:=public.own_close_detail_capacity_core_v2(p,period_value,type_value,maximum_bytes);IF body->>'scopeVersion'<>detail->>'scopeVersion' OR body->>'stateVersion'<>detail->>'stateVersion' THEN RAISE EXCEPTION 'OWN_CLOSE_STATE_CHANGED';END IF;
 IF body->>'command'='close' THEN IF body->'groupId' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;group_value:=event_id;snapshot_value:=public.own_close_snapshot_v1(detail,body->'selection');
 ELSE
  IF jsonb_typeof(body->'groupId') IS DISTINCT FROM 'string' OR body->>'groupId'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR body->'selection' IS DISTINCT FROM '{"kind":"all","values":[]}'::jsonb THEN RAISE EXCEPTION 'OWN_CLOSE_INPUT_INVALID';END IF;group_value:=(body->>'groupId')::uuid;
  SELECT * INTO original FROM public.own_payroll_close_event WHERE id=group_value AND tenant_id=(ctx->>'tenantId')::uuid AND source_binding_id=(ctx->>'sourceBindingId')::uuid AND period=period_value AND liquidation_type=type_value AND command='close';
  IF original.id IS NULL OR EXISTS(SELECT 1 FROM public.own_payroll_close_event r WHERE r.group_id=group_value AND r.command='reopen') THEN RAISE EXCEPTION 'OWN_CLOSE_DECISION_INVALID';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(original.snapshot->'employees') x JOIN public.own_payroll_run_capture c ON c.id=(x.value->>'runId')::uuid WHERE c.actor_person_id=(ctx->>'actorPersonId')::uuid OR c.actor_membership_id=(ctx->>'membershipId')::uuid OR c.actor_email=ctx->>'actorEmail') THEN RAISE EXCEPTION 'OWN_CLOSE_FORBIDDEN';END IF;
  IF original.snapshot_sha256<>public.own_run_hash_v1(original.snapshot) THEN RAISE EXCEPTION 'OWN_CLOSE_CONTRACT_INVALID';END IF;snapshot_value:=original.snapshot;
 END IF;
 receipt_value:=jsonb_build_object('version','own-close-receipt.v1','id',event_id,'key',key,'body',body,'bodySha256',fingerprint,'groupId',group_value,'snapshot',snapshot_value,'snapshotSha256',public.own_run_hash_v1(snapshot_value),'recordedAt',at_time,'replayed',false);
 IF octet_length(snapshot_value::text)>(CASE WHEN maximum_bytes=4194304 THEN 3145728 ELSE maximum_bytes-8192 END) OR octet_length(receipt_value::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('own-run:capacity:v1',0)) THEN RAISE EXCEPTION 'OWN_CLOSE_BUSY';END IF;
 IF(SELECT coalesce(sum(octet_length(le.body::text)+octet_length(le.snapshot::text)+octet_length(le.receipt::text)),0) FROM public.own_payroll_close_event le)+octet_length(body::text)+octet_length(snapshot_value::text)+octet_length(receipt_value::text)>67108864 OR(SELECT count(*) FROM public.own_payroll_close_event le WHERE le.tenant_id=(ctx->>'tenantId')::uuid AND le.source_binding_id=(ctx->>'sourceBindingId')::uuid)>=4000 THEN RAISE EXCEPTION 'OWN_CLOSE_LIMIT';END IF;
 INSERT INTO public.own_payroll_close_event(id,tenant_id,source_binding_id,group_id,command,period,liquidation_type,actor_membership_id,actor_person_id,actor_email,actor_label,actor_session_id,actor_session_version,release_sha,request_key,body,body_sha256,snapshot,snapshot_sha256,receipt,recorded_at) VALUES(event_id,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,group_value,body->>'command',body->>'period',body->>'liquidationType',(ctx->>'membershipId')::uuid,(ctx->>'actorPersonId')::uuid,ctx->>'actorEmail',coalesce(nullif(ctx->>'actorLabel',''),'Autoridad municipal'),(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',key,body,fingerprint,snapshot_value,public.own_run_hash_v1(snapshot_value),receipt_value,at_time);RETURN receipt_value;END $capacity_core$;

REVOKE ALL ON FUNCTION public.own_liquidation_detail_capacity_core_v2(jsonb,uuid,integer) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_annul_detail_capacity_core_v2(jsonb,text,text,integer) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_annul_attempt_capacity_core_v2(jsonb,uuid,integer) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_annul_command_capacity_core_v2(jsonb,jsonb,uuid,integer) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_close_detail_capacity_core_v2(jsonb,text,text,integer) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_close_attempt_capacity_core_v2(jsonb,uuid,integer) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_close_group_capacity_core_v2(jsonb,uuid,integer) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.own_close_command_capacity_core_v2(jsonb,jsonb,uuid,integer) FROM PUBLIC,municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.own_liquidation_detail_v1(p jsonb,run_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_liquidation_detail_capacity_core_v2(p,run_id,4194304);END
$capacity_wrapper$;

CREATE FUNCTION public.own_liquidation_detail_full_v1(p jsonb,run_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_liquidation_detail_capacity_core_v2(p,run_id,33554432);END
$capacity_wrapper$;
REVOKE ALL ON FUNCTION public.own_liquidation_detail_full_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_liquidation_detail_full_v1(jsonb,uuid) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.own_annul_detail_v1(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_annul_detail_capacity_core_v2(p,period_value,type_value,4194304);END
$capacity_wrapper$;

CREATE FUNCTION public.own_annul_detail_full_v1(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_annul_detail_capacity_core_v2(p,period_value,type_value,33554432);END
$capacity_wrapper$;
REVOKE ALL ON FUNCTION public.own_annul_detail_full_v1(jsonb,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_annul_detail_full_v1(jsonb,text,text) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.own_annul_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capacity_wrapper$
BEGIN RETURN public.own_annul_attempt_capacity_core_v2(p,key,4194304);END
$capacity_wrapper$;

CREATE FUNCTION public.own_annul_attempt_full_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capacity_wrapper$
BEGIN RETURN public.own_annul_attempt_capacity_core_v2(p,key,33554432);END
$capacity_wrapper$;
REVOKE ALL ON FUNCTION public.own_annul_attempt_full_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_annul_attempt_full_v1(jsonb,uuid) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.own_annul_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_annul_command_capacity_core_v2(p,body,key,4194304);END
$capacity_wrapper$;

CREATE FUNCTION public.own_annul_command_full_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_annul_command_capacity_core_v2(p,body,key,33554432);END
$capacity_wrapper$;
REVOKE ALL ON FUNCTION public.own_annul_command_full_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_annul_command_full_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.own_close_detail_v1(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_close_detail_capacity_core_v2(p,period_value,type_value,4194304);END
$capacity_wrapper$;

CREATE FUNCTION public.own_close_detail_full_v1(p jsonb,period_value text,type_value text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_close_detail_capacity_core_v2(p,period_value,type_value,33554432);END
$capacity_wrapper$;
REVOKE ALL ON FUNCTION public.own_close_detail_full_v1(jsonb,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_close_detail_full_v1(jsonb,text,text) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.own_close_attempt_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capacity_wrapper$
BEGIN RETURN public.own_close_attempt_capacity_core_v2(p,key,4194304);END
$capacity_wrapper$;

CREATE FUNCTION public.own_close_attempt_full_v1(p jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capacity_wrapper$
BEGIN RETURN public.own_close_attempt_capacity_core_v2(p,key,33554432);END
$capacity_wrapper$;
REVOKE ALL ON FUNCTION public.own_close_attempt_full_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_close_attempt_full_v1(jsonb,uuid) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.own_close_group_v1(p jsonb,group_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capacity_wrapper$
BEGIN RETURN public.own_close_group_capacity_core_v2(p,group_value,4194304);END
$capacity_wrapper$;

CREATE FUNCTION public.own_close_group_full_v1(p jsonb,group_value uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $capacity_wrapper$
BEGIN RETURN public.own_close_group_capacity_core_v2(p,group_value,33554432);END
$capacity_wrapper$;
REVOKE ALL ON FUNCTION public.own_close_group_full_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_close_group_full_v1(jsonb,uuid) TO municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.own_close_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_close_command_capacity_core_v2(p,body,key,4194304);END
$capacity_wrapper$;

CREATE FUNCTION public.own_close_command_full_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $capacity_wrapper$
BEGIN RETURN public.own_close_command_capacity_core_v2(p,body,key,33554432);END
$capacity_wrapper$;
REVOKE ALL ON FUNCTION public.own_close_command_full_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.own_close_command_full_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;

-- All writes still use the two original atomic writer bodies; liquidation
-- confirm/annul/cancel remains its one unchanged canonical small writer.
-- Global67108864 storage and4000 event caps intentionally remain unchanged.

-- Future authorized installation must execute this in the SAME transaction.
-- Any inherited grant or metadata change aborts the complete DDL increment.
-- This candidate never changes default privileges to make a check pass.
-- Known SQL200 successor: only the two historical item caps change.
-- The census still returns <=4MiB of complete metadata (2000events/1000groups).
-- Preserve the existing function OID and every catalog/ACL field except prosrc.
DO $capacity_census_successor$
DECLARE census_original pg_proc;census_updated pg_proc;census_metadata jsonb;
BEGIN
 SELECT * INTO census_original FROM pg_proc WHERE oid=to_regprocedure('public.own_close_report_census_v1(jsonb,text,text)');
 IF census_original.oid IS NULL OR encode(sha256(convert_to(replace(census_original.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>'16b0b8faa8016cac5d70d8c34d5e303567ec84686af2f63fbc3cef51a1216f2c' THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CENSUS_DEFINITION_CHANGED';END IF;
 census_metadata:=to_jsonb(census_original)-'prosrc';
 EXECUTE $capacity_census_definition$CREATE OR REPLACE FUNCTION public.own_close_report_census_v1(p jsonb,period_value text,type_value text) RETURNS jsonb
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
  OR octet_length(event_value.body::text)>524288 OR octet_length(event_value.snapshot::text)>33546240
  OR octet_length(event_value.receipt::text)>33554432
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
END $$;$capacity_census_definition$;
 SELECT * INTO census_updated FROM pg_proc WHERE oid=census_original.oid;
 IF census_updated.oid IS NULL OR (to_jsonb(census_updated)-'prosrc') IS DISTINCT FROM census_metadata THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CENSUS_METADATA_CHANGED';END IF;
END $capacity_census_successor$;

DO $capacity_postflight$
DECLARE expected jsonb;actual pg_proc;runtime_oid oid;constraint_row pg_constraint;target_relation regclass;definition text;
BEGIN
 runtime_oid:=to_regrole('municontrol_actions_runtime_app');
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_PREREQUISITE';END IF;
 FOR expected IN SELECT value FROM jsonb_array_elements('[{"name":"own_liquidation_detail_capacity_core_v2","signature":"public.own_liquidation_detail_capacity_core_v2(jsonb,uuid,integer)","argNames":["p","run_id","maximum_bytes"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":false,"bodySha256":"1d5f5ec2c93ff8f44d1bb7b48ceb72a7040511d52c1af03f0eb1338c788f199d","volatility":"v","kind":"core"},{"name":"own_annul_detail_capacity_core_v2","signature":"public.own_annul_detail_capacity_core_v2(jsonb,text,text,integer)","argNames":["p","period_value","type_value","maximum_bytes"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":false,"bodySha256":"4629a26b403ee276fcefe92e58220f8970a06598e164e1a4d1dc957de924ae1d","volatility":"v","kind":"core"},{"name":"own_annul_attempt_capacity_core_v2","signature":"public.own_annul_attempt_capacity_core_v2(jsonb,uuid,integer)","argNames":["p","key","maximum_bytes"],"config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"bodySha256":"065289cc9cc0ffc01e2d14b8150db804cffbea5f166d0768d497cc9a7e27e325","volatility":"v","kind":"core"},{"name":"own_annul_command_capacity_core_v2","signature":"public.own_annul_command_capacity_core_v2(jsonb,jsonb,uuid,integer)","argNames":["p","body","key","maximum_bytes"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":false,"bodySha256":"0c371e7bb19402b939177031ec2dfa78c6b8a29e6b0d54daa6ceb05ec387fe68","volatility":"v","kind":"core"},{"name":"own_close_detail_capacity_core_v2","signature":"public.own_close_detail_capacity_core_v2(jsonb,text,text,integer)","argNames":["p","period_value","type_value","maximum_bytes"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":false,"bodySha256":"4c233868907b657be44cbdca510a45e48b36614f156fa8afa9fbb08b5b1c8666","volatility":"v","kind":"core"},{"name":"own_close_attempt_capacity_core_v2","signature":"public.own_close_attempt_capacity_core_v2(jsonb,uuid,integer)","argNames":["p","key","maximum_bytes"],"config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"bodySha256":"82aec4af1a0d24cfbde99c7be352774630f1b4dddec10ee44818791cd64deb5e","volatility":"v","kind":"core"},{"name":"own_close_group_capacity_core_v2","signature":"public.own_close_group_capacity_core_v2(jsonb,uuid,integer)","argNames":["p","group_value","maximum_bytes"],"config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"bodySha256":"af9061d40d2569082254c2fe52cc3ebb1bcbb3689d53cb24450db881faabcb92","volatility":"v","kind":"core"},{"name":"own_close_command_capacity_core_v2","signature":"public.own_close_command_capacity_core_v2(jsonb,jsonb,uuid,integer)","argNames":["p","body","key","maximum_bytes"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":false,"bodySha256":"280da3adbfd2ec0fd8ed26fabf21b3a1e3a7fab2e625f4a1d336a33707ccad53","volatility":"v","kind":"core"},{"name":"own_liquidation_detail_v1","signature":"public.own_liquidation_detail_v1(jsonb,uuid)","argNames":["p","run_id"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"a3ee7f3316a8017d3813eb1c17e9962d6b25a37e994e9223448fc425f4018a76","volatility":"v","kind":"legacy"},{"name":"own_liquidation_detail_full_v1","signature":"public.own_liquidation_detail_full_v1(jsonb,uuid)","argNames":["p","run_id"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"8b0bd3213b3b025f92892742bd5846822fabb254787214b6ce912a9de90ec5d8","volatility":"v","kind":"full"},{"name":"own_annul_detail_v1","signature":"public.own_annul_detail_v1(jsonb,text,text)","argNames":["p","period_value","type_value"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"02d4699a7f34a13fca85bed40586789be06f7228e8d387d7eaa8474cd60a9d3b","volatility":"v","kind":"legacy"},{"name":"own_annul_detail_full_v1","signature":"public.own_annul_detail_full_v1(jsonb,text,text)","argNames":["p","period_value","type_value"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"854537ad8edc98fd3276f4f82ccf380c59503f117b82eb0706993990f2c30c95","volatility":"v","kind":"full"},{"name":"own_annul_attempt_v1","signature":"public.own_annul_attempt_v1(jsonb,uuid)","argNames":["p","key"],"config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"bodySha256":"5031732cc332eabe9c67e9e3caf739af93b85009098065bb12abd3af1b976c4d","volatility":"v","kind":"legacy"},{"name":"own_annul_attempt_full_v1","signature":"public.own_annul_attempt_full_v1(jsonb,uuid)","argNames":["p","key"],"config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"bodySha256":"a24ece1132ff9ef64a9ff20822a531f4c9a78cca24b17b845daab69cf5c276ab","volatility":"v","kind":"full"},{"name":"own_annul_command_v1","signature":"public.own_annul_command_v1(jsonb,jsonb,uuid)","argNames":["p","body","key"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"de0579321c662390e9f68efdd7c177dcd1be9b759fd78a6635513de392457ce9","volatility":"v","kind":"legacy"},{"name":"own_annul_command_full_v1","signature":"public.own_annul_command_full_v1(jsonb,jsonb,uuid)","argNames":["p","body","key"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"82c81fa319b0956877a23613945dfa8282e54761dde7c746594ee08bac2a2c56","volatility":"v","kind":"full"},{"name":"own_close_detail_v1","signature":"public.own_close_detail_v1(jsonb,text,text)","argNames":["p","period_value","type_value"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"522b68c7be31974fe4adf060b65deaf77a0ca6a8d33bc5df315131cb9e1061d0","volatility":"v","kind":"legacy"},{"name":"own_close_detail_full_v1","signature":"public.own_close_detail_full_v1(jsonb,text,text)","argNames":["p","period_value","type_value"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"4f2b03bd8551c580307d8591575fa33e3056fb08599d8917d0dfe0b210e2f59f","volatility":"v","kind":"full"},{"name":"own_close_attempt_v1","signature":"public.own_close_attempt_v1(jsonb,uuid)","argNames":["p","key"],"config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"bodySha256":"691da592cefa8e820f4ac8dbdec1746afbedc8302529e2b402003381ac7c458c","volatility":"v","kind":"legacy"},{"name":"own_close_attempt_full_v1","signature":"public.own_close_attempt_full_v1(jsonb,uuid)","argNames":["p","key"],"config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"bodySha256":"4b66c8afe0ccab25095b18b630944821a2e83ada8689fa4d8b2d632d66026e34","volatility":"v","kind":"full"},{"name":"own_close_group_v1","signature":"public.own_close_group_v1(jsonb,uuid)","argNames":["p","group_value"],"config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"bodySha256":"028777cf3e85c7d3f7b78995da2b1f2aea4da8a7914fddaed0585d19964744f6","volatility":"v","kind":"legacy"},{"name":"own_close_group_full_v1","signature":"public.own_close_group_full_v1(jsonb,uuid)","argNames":["p","group_value"],"config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"bodySha256":"2bb9b017085a8441e44f70dfe8545ed52a7fda9ce4258e4829baf2b9b7e36c91","volatility":"v","kind":"full"},{"name":"own_close_command_v1","signature":"public.own_close_command_v1(jsonb,jsonb,uuid)","argNames":["p","body","key"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"337f942b243c9d46a06f317c63139a5b2c02404ee3f1fb8dd706e79222f9f69d","volatility":"v","kind":"legacy"},{"name":"own_close_command_full_v1","signature":"public.own_close_command_full_v1(jsonb,jsonb,uuid)","argNames":["p","body","key"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"ea3e8a076b7122b1f58cf6fd4d21a7455996233a7f4a6e3092bb5437aab5969e","volatility":"v","kind":"full"},{"name":"own_close_snapshot_v1","signature":"public.own_close_snapshot_v1(jsonb,jsonb)","argNames":["detail","selection"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"bodySha256":"11d46e478ab606b0a9d4602e83a072a16924e47d7b8d2da064ed1d7abd2885b0","definitionSha256":"3d531c5c531aae3fc559ddb287fb00ea610f9ae7f42f492a68141715ca3e05b0","volatility":"i","kind":"protected_dependency"},{"name":"own_annul_selected_v1","signature":"public.own_annul_selected_v1(jsonb,jsonb)","argNames":["detail","selection"],"result":"jsonb","language":"plpgsql","config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"bodySha256":"e191fd94787a93e809e79b97d751b1c9c9371833eb7275fe4d3c272eceeadd31","definitionSha256":"bc13d2b02e084173375ac0ed554d40f8f64e719cbf63322873f0e5e5f12269a5","volatility":"v","kind":"protected_dependency"},{"name":"own_close_report_census_v1","signature":"public.own_close_report_census_v1(jsonb,text,text)","argNames":["p","period_value","type_value"],"config":["search_path=pg_catalog, public, pg_temp","TimeZone=UTC"],"runtime":true,"bodySha256":"5912530eb374316518cf7b33006b0bb7555040391131321b82c000a455da1ebd","volatility":"v","kind":"known_census_successor"}]'::jsonb) LOOP
  SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(expected->>'signature');
  IF actual.oid IS NULL OR actual.proowner<>current_user::regrole OR actual.prokind<>'f' OR NOT actual.prosecdef OR actual.proretset OR actual.proisstrict OR actual.proleakproof OR actual.proparallel<>'u'
   OR actual.procost<>100 OR actual.prorows<>0 OR actual.prosupport<>0 OR actual.probin IS NOT NULL
   OR actual.provolatile IS DISTINCT FROM (expected->>'volatility')::"char" OR actual.prorettype<>'jsonb'::regtype OR actual.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
   OR actual.pronargdefaults<>0 OR actual.proargmodes IS NOT NULL OR actual.proallargtypes IS NOT NULL OR to_jsonb(actual.proargnames) IS DISTINCT FROM expected->'argNames' OR to_jsonb(actual.proconfig) IS DISTINCT FROM expected->'config'
   OR encode(sha256(convert_to(replace(actual.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>expected->>'bodySha256'
  THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_METADATA_CHANGED';END IF;
  IF EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantor<>actual.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR (a.grantee<>actual.proowner AND NOT((expected->>'runtime')::boolean AND a.grantee=runtime_oid)))
   OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=actual.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
   OR (expected->>'runtime')::boolean IS DISTINCT FROM EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=runtime_oid AND a.privilege_type='EXECUTE' AND NOT a.is_grantable)
   OR (SELECT count(*) FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))))<>(CASE WHEN (expected->>'runtime')::boolean THEN 2 ELSE 1 END)
  THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_ACL_CHANGED';END IF;
 END LOOP;
 IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='own_close_report_census_v1')<>1 THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_CENSUS_OVERLOAD';END IF;
 target_relation:=to_regclass('public.own_payroll_close_event');
 IF target_relation IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=target_relation AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relrowsecurity) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=target_relation AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_TABLE_CHANGED';END IF;
 SELECT * INTO constraint_row FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_close_event_snapshot_check';
 IF constraint_row.oid IS NULL OR constraint_row.contype<>'c' OR NOT constraint_row.convalidated OR NOT constraint_row.conislocal OR constraint_row.coninhcount<>0 OR constraint_row.connoinherit THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_CHECK_CHANGED';END IF;
 definition:=pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false);
 IF definition IS DISTINCT FROM '((jsonb_typeof(snapshot) = ''object''::text) AND (octet_length((snapshot)::text) <= 33546240))' THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_CHECK_CHANGED';END IF;
 target_relation:=to_regclass('public.own_payroll_close_event');
 IF target_relation IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=target_relation AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relrowsecurity) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=target_relation AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_TABLE_CHANGED';END IF;
 SELECT * INTO constraint_row FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_close_event_receipt_check';
 IF constraint_row.oid IS NULL OR constraint_row.contype<>'c' OR NOT constraint_row.convalidated OR NOT constraint_row.conislocal OR constraint_row.coninhcount<>0 OR constraint_row.connoinherit THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_CHECK_CHANGED';END IF;
 definition:=pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false);
 IF definition IS DISTINCT FROM '((jsonb_typeof(receipt) = ''object''::text) AND (octet_length((receipt)::text) <= 33554432))' THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_CHECK_CHANGED';END IF;
 target_relation:=to_regclass('public.own_payroll_annul_event');
 IF target_relation IS NULL OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=target_relation AND c.relowner=current_user::regrole AND c.relkind='r' AND c.relrowsecurity) OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE c.oid=target_relation AND a.grantee<>c.relowner) THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_TABLE_CHANGED';END IF;
 SELECT * INTO constraint_row FROM pg_constraint WHERE conrelid=target_relation AND conname='own_payroll_annul_event_receipt_check';
 IF constraint_row.oid IS NULL OR constraint_row.contype<>'c' OR NOT constraint_row.convalidated OR NOT constraint_row.conislocal OR constraint_row.coninhcount<>0 OR constraint_row.connoinherit THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_CHECK_CHANGED';END IF;
 definition:=pg_get_expr(constraint_row.conbin,constraint_row.conrelid,false);
 IF definition IS DISTINCT FROM '((jsonb_typeof(receipt) = ''object''::text) AND (octet_length((receipt)::text) <= 33554432))' THEN RAISE EXCEPTION 'OWN_DECISION_CAPACITY_POST_CHECK_CHANGED';END IF;
END $capacity_postflight$;
