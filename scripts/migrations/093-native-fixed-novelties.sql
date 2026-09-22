-- Native 067 contracts may be subjects of the administrative fixed registry092.
-- No GRH import, payroll calculation, employee/account creation or legacy044 edit.
-- Run the whole migration in one transaction. Preserve all existing root/events.
DO $prerequisite$
DECLARE item record; body text; body_sha text;
BEGIN
 IF to_regclass('public.native_employee_registration') IS NULL OR to_regclass('public.payroll_fixed_novelty') IS NULL
 OR to_regprocedure('public.native_employee_create_v1(jsonb,jsonb,text,uuid)') IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_NATIVE_PREREQUISITE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.native_employee_registration'::regclass
   AND confrelid='public.platform_tenant_source_binding'::regclass AND contype='f' AND convalidated)
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.native_employee_registration'::regclass
   AND tgname='native_employee_registration_immutable' AND tgenabled='O')
 OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.native_employee_registration'::regclass
   AND tgname='native_employee_registration_no_truncate' AND tgenabled='O') THEN RAISE EXCEPTION 'PAYROLL_FIXED_NATIVE_PREREQUISITE'; END IF;
 FOR item IN SELECT * FROM (VALUES
  ('subject','jsonb,text,boolean','5a8f4a7feb3f149ebf38858f3aa59df88b7c6e32da507e9beba5f46eef1cbd39','5a8f4a7feb3f149ebf38858f3aa59df88b7c6e32da507e9beba5f46eef1cbd39'),
  ('identity_current','jsonb,public.payroll_fixed_novelty','3fb5e1ac0cd2ff1f7ee8eabcfa6c1345ae8e1838875ebae25ad529d3e011c6ce','554623eb1ed687c6419d1866e0b1b65303ff43581b763db02276e6278eedb2e3'),
  ('propose','jsonb,jsonb,uuid','a74552c784a68e7fb3dd1277f037a11dbab75976f624a33d3a31b6e2ea21221c','11b2a9cfcedc2f3ca4856e63ac413194701fcd8c75e1b4651febd4540d0b5f13'),
  ('review','jsonb,jsonb,uuid','5ef370c1ba6cf23391325432f4f9b3202ea7c43db2964237999a0a70a628c7f6','a8a0818269be117ad3e6045d8ac98c638f01f6404e239f89e7987469db3a48b1'),
  ('event_identity','jsonb,public.payroll_fixed_novelty_event','349cff1fee0861ac0c419a2bb4531ca16bc9b305c09e7e499186a75c9bf22783','9010463484a3c849d0b37a987d3e0cc9e90912e0e171081631f69936faaab5cb'),
  ('list','jsonb,date','c65043be6b7dab9dcf2500f43dc8edbf3047db2794293c965601af639e56745c','07cc6dbb9d79b157429dd5107e45b02f05b89f26699c1a9dbd61a866bdac25da'),
  ('export','jsonb,date,text','9d0fdd15299ccbd51374c72899cfe13a6b627860beb82998b6c9d3aab6e8664b','18b1a674e825c33624a9d54b6f1824659f970eb6661d9f417d0c658db7c5f71f')
 ) pin(name,args,original_sha256,installed_sha256) LOOP
  SELECT replace(replace(p.prosrc,E'\r\n',E'\n'),n.nspname||'.','public'||'.') INTO body
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.oid=to_regprocedure('public.payroll_fixed_registry_'||item.name||'_v1('||item.args||')') AND p.prosecdef;
  body_sha:=encode(public.digest(body,'sha256'),'hex');
  IF body IS NULL OR body_sha NOT IN (item.original_sha256,item.installed_sha256)
  THEN RAISE EXCEPTION 'PAYROLL_FIXED_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
 -- A rerun may reuse only our exact bodies. A comment is never a trust anchor.
 FOR item IN SELECT * FROM (VALUES
  ('subject_by_contract','jsonb,uuid,boolean','7b490b4cc34bd45205dacf169c1fc2432c5a711fd99d6384bdc0d22db4236e48'),
  ('native_dates','jsonb,uuid,jsonb','c534bcc9001d4eaa68e8f0bc120de428b1863274f4af9163e611a98b46a47ae2'),
  ('employee_by_contract','jsonb,uuid','ca05a5b368da303e5e21e6c8e58a3d811c01b2191f88c32ce3de858567b9a18f')
 ) pin(name,args,sha256) LOOP
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='payroll_fixed_registry_'||item.name||'_v1') THEN
   SELECT replace(replace(p.prosrc,E'\r\n',E'\n'),n.nspname||'.','public'||'.') INTO body
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE p.oid=to_regprocedure('public.payroll_fixed_registry_'||item.name||'_v1('||item.args||')') AND p.prosecdef;
   IF body IS NULL OR encode(public.digest(body,'sha256'),'hex')<>item.sha256 THEN RAISE EXCEPTION 'PAYROLL_FIXED_NATIVE_PREREQUISITE'; END IF;
  END IF;
 END LOOP;
END $prerequisite$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_subject_by_contract_v1(ctx jsonb,p_contract uuid,hold_lock boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public.employment_contract%ROWTYPE; p public.person_identity%ROWTYPE; r public.native_employee_registration%ROWTYPE;
 fresh jsonb; snapshot jsonb; matches integer;
BEGIN
 IF p_contract IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_INVALID_PAYLOAD'; END IF;
 IF hold_lock THEN LOCK TABLE public.employment_contract,public.source_import_batch,public.person_identity,public.native_employee_registration,public.platform_tenant_source_binding IN SHARE MODE NOWAIT; END IF;
 SELECT * INTO c FROM public.employment_contract WHERE id=p_contract;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 IF c.source_system='GRH' THEN
  IF NOT EXISTS(SELECT 1 FROM public.source_import_batch b WHERE b.id=c.source_batch_id AND b.source_system='GRH'
   AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL)
   OR c.legacy_company_id IS DISTINCT FROM (ctx->>'sourceCompanyId')::bigint THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
  -- Keep the exact original GRH snapshot/hash and ambiguity check. Existing
  -- approvals and stored GRH subjects must not be relabeled or rewritten.
  fresh:=public.payroll_fixed_registry_subject_v1(ctx,c.legacy_legajo,false);
  IF fresh#>>'{subject,contractId}' IS DISTINCT FROM p_contract::text THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
  RETURN fresh;
 END IF;
 IF c.source_system<>'MUNICONTROL' OR c.tenant_id IS DISTINCT FROM (ctx->>'tenantId')::uuid
 OR c.legacy_company_id IS DISTINCT FROM (ctx->>'sourceCompanyId')::bigint THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 SELECT reg.* INTO r FROM public.native_employee_registration reg
 JOIN public.platform_tenant_source_binding b ON b.id=reg.source_binding_id AND b.tenant_id=reg.tenant_id
 WHERE reg.contract_id=c.id AND reg.person_id=c.person_id AND reg.tenant_id=c.tenant_id
  AND reg.source_binding_id=(ctx->>'certifiedBindingId')::uuid AND b.source_system='GRH' AND b.verified
  AND b.source_company_id=c.legacy_company_id AND b.source_database=ctx->>'sourceDatabase';
 IF NOT FOUND OR c.source_batch_id IS NOT NULL OR c.status<>'active' OR c.start_date IS NULL
 OR (c.end_date IS NOT NULL AND c.end_date<c.start_date)
 OR c.legacy_legajo !~ '^[1-9][0-9]{0,8}$'
 OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM r.id::text THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 SELECT * INTO p FROM public.person_identity WHERE id=c.person_id AND identity_state IN ('active','provisional');
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 SELECT count(*) INTO matches FROM public.employment_contract ec
 JOIN public.native_employee_registration nr ON nr.contract_id=ec.id AND nr.person_id=ec.person_id AND nr.tenant_id=ec.tenant_id
 WHERE ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL AND ec.tenant_id=c.tenant_id
  AND nr.source_binding_id=r.source_binding_id AND ec.legacy_company_id=c.legacy_company_id
  AND ec.legacy_legajo=c.legacy_legajo AND ec.status='active';
 IF matches<>1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 snapshot:=jsonb_build_object('origin','MUNICONTROL','tenantId',c.tenant_id,'bindingId',r.source_binding_id,
  'registrationId',r.id,'contractId',c.id,'personId',p.id,'legajo',c.legacy_legajo,'employeeName',p.full_name,
  'dni',p.dni,'cuil',p.cuil,'identityState',p.identity_state,'startDate',to_char(c.start_date,'YYYY-MM-DD'),
  'endDate',to_char(c.end_date,'YYYY-MM-DD'),'requestSha256',r.request_sha256,
  'registeredAt',to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 RETURN jsonb_build_object('personId',p.id,'subject',jsonb_build_object('contractId',c.id,'legajo',c.legacy_legajo,'employeeName',p.full_name,
  'identityToken',encode(public.digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex'),'sourceCutoff',NULL,
  'origin','MUNICONTROL','registrationId',r.id,'registeredAt',to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_native_dates_v1(ctx jsonb,p_contract uuid,v jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c public.employment_contract%ROWTYPE; first_date date; last_date date;
BEGIN
 SELECT * INTO c FROM public.employment_contract WHERE id=p_contract;
 IF c.source_system='MUNICONTROL' THEN
  PERFORM public.payroll_fixed_registry_subject_by_contract_v1(ctx,p_contract,true);
  first_date:=public.payroll_fixed_registry_date_v1(v->>'validFrom');
  last_date:=public.payroll_fixed_registry_date_v1(v->>'validTo',false);
  IF first_date<c.start_date OR (c.end_date IS NOT NULL AND (last_date IS NULL OR last_date>c.end_date OR first_date>c.end_date)) THEN
   RAISE EXCEPTION 'PAYROLL_FIXED_DATES_INVALID';
  END IF;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_employee_by_contract_v1(p_context jsonb,p_contract uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.payroll_fixed_registry_context_v1(p_context);
 RETURN jsonb_build_object('version','payroll-fixed-employee.v1','subject',public.payroll_fixed_registry_subject_by_contract_v1(ctx,p_contract,true)->'subject');
END $$;

CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_identity_current_v1(ctx jsonb,item public.payroll_fixed_novelty) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE fresh jsonb;
-- native-fixed093
BEGIN
 IF item.tenant_id IS DISTINCT FROM (ctx->>'tenantId')::uuid OR item.certified_binding_id IS DISTINCT FROM (ctx->>'certifiedBindingId')::uuid THEN RETURN false; END IF;
 fresh:=public.payroll_fixed_registry_subject_by_contract_v1(ctx,item.employment_contract_id);
 RETURN fresh#>>'{subject,contractId}'=item.employment_contract_id::text AND fresh->>'personId'=item.person_id::text
  AND fresh#>>'{subject,identityToken}'=item.identity_token AND fresh#>>'{subject,legajo}'=item.subject->>'legajo';
EXCEPTION WHEN OTHERS THEN IF SQLERRM IN ('PAYROLL_FIXED_NOT_FOUND','PAYROLL_FIXED_LEGAJO_NOT_FOUND','PAYROLL_FIXED_INVALID_PAYLOAD','PAYROLL_FIXED_IDENTITY_CHANGED') THEN RETURN false; END IF; RAISE; END $$;

-- Patch only the reviewed 092 facades, preserving parameter names, immutable
-- event writes, receipts, request hashes, capability and maker/checker controls.
DO $patch$
DECLARE name text; definition text; previous text; replacement text;
BEGIN
 FOREACH name IN ARRAY ARRAY['propose','review','event_identity','list','export'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.oid=to_regprocedure('public.payroll_fixed_registry_'||name||'_v1('||CASE name
   WHEN 'event_identity' THEN 'jsonb,public.payroll_fixed_novelty_event' WHEN 'list' THEN 'jsonb,date'
   WHEN 'export' THEN 'jsonb,date,text' ELSE 'jsonb,jsonb,uuid' END||')');
  IF strpos(definition,'-- native-fixed093')>0 THEN CONTINUE; END IF;
  IF name='propose' THEN
   previous:=$old$ IF NOT EXISTS(SELECT 1 FROM public.employment_contract c JOIN public.source_import_batch b ON b.id=c.source_batch_id
  WHERE c.id=(p_payload->>'contractId')::uuid AND c.source_system='GRH' AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
   AND b.source_system='GRH' AND b.source_database=ctx->>'sourceDatabase' AND b.validation_state='published') THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 subject_value:=public.payroll_fixed_registry_subject_v1(ctx,p_payload->>'legajo',true);$old$;
   replacement:=$new$ subject_value:=public.payroll_fixed_registry_subject_by_contract_v1(ctx,(p_payload->>'contractId')::uuid,true);
 IF subject_value#>>'{subject,legajo}' IS DISTINCT FROM p_payload->>'legajo' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 IF p_payload->>'operation'='set' THEN PERFORM public.payroll_fixed_registry_native_dates_v1(ctx,(p_payload->>'contractId')::uuid,p_payload->'values'); END IF;$new$;
  ELSIF name IN ('review','event_identity') THEN
   previous:=$old$ PERFORM public.payroll_fixed_registry_subject_v1(ctx,root_row.subject->>'legajo',true);$old$;
   replacement:=$new$ PERFORM public.payroll_fixed_registry_subject_by_contract_v1(ctx,root_row.employment_contract_id,true);$new$;
  ELSIF name='list' THEN
   previous:=$old$ ctx:=public.payroll_fixed_registry_context_v1(p_context); PERFORM public.payroll_fixed_registry_lock_v1(ctx);$old$;
   replacement:=previous||E'\n LOCK TABLE public.employment_contract,public.source_import_batch,public.person_identity,public.native_employee_registration,public.platform_tenant_source_binding IN SHARE MODE NOWAIT;';
  ELSE
   previous:=$old$ LOCK TABLE public.employment_contract,public.source_import_batch,public.person_identity IN SHARE MODE NOWAIT;$old$;
   replacement:=$new$ LOCK TABLE public.employment_contract,public.source_import_batch,public.person_identity,public.native_employee_registration,public.platform_tenant_source_binding IN SHARE MODE NOWAIT;$new$;
  END IF;
  definition:=replace(definition,E'\r\n',E'\n');
  IF (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_NATIVE_PATCH_DRIFT'; END IF;
  definition:=replace(definition,previous,replacement);
  IF name='review' THEN
   previous:=$old$  v:=proposal_row.payload->'values';$old$;
   replacement:=previous||E'\n  PERFORM public.payroll_fixed_registry_native_dates_v1(ctx,root_row.employment_contract_id,v);';
   IF (length(definition)-length(replace(definition,previous,'')))/length(previous)<>1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_NATIVE_PATCH_DRIFT'; END IF;
   definition:=replace(definition,previous,replacement);
  END IF;
  IF name='list' THEN
   previous:=E'\nEND $function$';
   replacement:=E'\nEXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION ''PAYROLL_FIXED_SESSION_BUSY'';\nEND $function$';
   IF strpos(definition,previous)=0 THEN RAISE EXCEPTION 'PAYROLL_FIXED_NATIVE_PATCH_DRIFT'; END IF;
   definition:=replace(definition,previous,replacement);
  END IF;
  definition:=overlay(definition placing E'-- native-fixed093\nBEGIN' from strpos(definition,E'\nBEGIN')+1 for 5);
  EXECUTE definition;
 END LOOP;
END $patch$;

REVOKE ALL ON FUNCTION public.payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean),public.payroll_fixed_registry_native_dates_v1(jsonb,uuid,jsonb),
 public.payroll_fixed_registry_employee_by_contract_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_fixed_registry_employee_by_contract_v1(jsonb,uuid) TO municontrol_actions_runtime_app;
