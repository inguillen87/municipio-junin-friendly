-- Native individual monthly novelties, additive to 026/029/032/097.
-- Apply the entire file atomically. No IAM grants, source mutation or payroll calculation.
-- Provenance is captured once on the existing immutable row. The 093 resolver
-- retains its closed GRH/native distinction; no imported employee is invented.
DO $prerequisite$
DECLARE item record; actual text; fn oid; roleid oid; tableid regclass; native_count integer;
BEGIN
 -- Existing PG17 runtime authenticates directly; PG18 uses a group role.
 -- LOGIN alone does not grant data access. Both retain the same checked ACLs.
 SELECT oid INTO roleid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolsuper AND NOT rolbypassrls;
 IF roleid IS NULL OR to_regclass('public.native_employee_registration') IS NULL OR to_regclass('public.grh_effective_employment_movement_v1') IS NULL
 THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;
 FOR item IN SELECT * FROM (VALUES
 ('payroll_novelty_rows_valid_v1(jsonb,text)','183ec51dd323fa3a18cc4a7e93501c84892f2895ca35caad8bdcdb56372e8b4a','183ec51dd323fa3a18cc4a7e93501c84892f2895ca35caad8bdcdb56372e8b4a'),
 ('payroll_novelty_reject_change_v1()','a30f338ba172685f7d8a65af85bb756650e8c1c5346a659077209c0776a52774','a30f338ba172685f7d8a65af85bb756650e8c1c5346a659077209c0776a52774'),
 ('payroll_novelty_assert_context_v1(jsonb,text)','14f25a6e6f163da5696bf37cd7992e9ed6475e2e581a34dc0c81b3807b8d286c','14f25a6e6f163da5696bf37cd7992e9ed6475e2e581a34dc0c81b3807b8d286c'),
 ('payroll_novelty_snapshot_v1(uuid,uuid,boolean)','6469405c512f3c5b7e8319eeda443561dbabe7b789865f8d23709adca9bd70fd','6469405c512f3c5b7e8319eeda443561dbabe7b789865f8d23709adca9bd70fd'),
 ('payroll_novelty_event_snapshot_v1(bigint,uuid,boolean)','3557d92e282e4d48a820c2e6f40043d7b7e554d5e4e81653b8618b49e7d239fc','3557d92e282e4d48a820c2e6f40043d7b7e554d5e4e81653b8618b49e7d239fc'),
 ('payroll_novelty_batch_guard_v1()','62465ef6da1a2fc392854b9ca3c5ea7ba54ddea6869d667e5c6936e788dea044','62465ef6da1a2fc392854b9ca3c5ea7ba54ddea6869d667e5c6936e788dea044'),
 ('payroll_novelty_row_guard_v1()','3cd467dc215e1e921c8c88c04bbc0aee4c841487d8dfe5e33a4399075749650d','3ccc695b5e2df3420f8d24f63ffd2cfe0ad4731245b955f0be0ace7293e96769'),
 ('payroll_novelty_issue_guard_v1()','fbfc320c6a4a954267cc47ae69faba178c2fcb922075da5180afd31a7809da08','fbfc320c6a4a954267cc47ae69faba178c2fcb922075da5180afd31a7809da08'),
 ('payroll_novelty_event_guard_v1()','bbbe85e85c58f017c6e55248a7b356bc1d2ff5fe85c9d8e946ba3b46308ed708','bbbe85e85c58f017c6e55248a7b356bc1d2ff5fe85c9d8e946ba3b46308ed708'),
 ('payroll_novelty_require_audit_v1()','0ef0a69d16ffe2aa16f476d938b64e5dd8727d4956bfdb9fc9cb39cd32508d4f','0ef0a69d16ffe2aa16f476d938b64e5dd8727d4956bfdb9fc9cb39cd32508d4f'),
 ('payroll_novelty_bootstrap_v1(jsonb)','b6bcabcc0ea98920328498bd660ff78d2572d2a94a153a130063413371860b22','8616a8a071755753293466c0de9533d33aa1fcd39c422aa8a435cd21ddd3eebb'),
 ('payroll_novelty_transition_v1(jsonb,uuid,text,integer,text,text,uuid,text)','d76d4699d0bcf0571d4b5dc2f72acbd82067ee44ad4fdffc6da84b93fdf67a85','2a9c3ea01b1818e1d2debad00d10f4faa9fbfb141793d91c021dce589bd83155'),
 ('payroll_novelty_detail_v1(jsonb,uuid)','da3b02e39d5bd7ba8d4f5e613fc13c5c3f979041162bae9af96df1826790548d','f637347f6128f8727f668c580d87d6374d8a546197b5ddf5356e6551af5251b0'),
 ('payroll_novelty_export_v1(jsonb,uuid)','8585f873665e91692074e365bf9cdb2aa8b88bc6f603bc927e9f87e01757e73e','239d5848c6f210733c7f5c3b116e0a11fba68e89b5dd3b25850e29843fcfd298'),
 ('payroll_novelty_prepare_v1(jsonb,text,date,text,jsonb,uuid,text)','ab280b073c4b5ee3cb1c2e7c3f52349e83d26d987ab25da9177e031a164ef613','ab280b073c4b5ee3cb1c2e7c3f52349e83d26d987ab25da9177e031a164ef613'),
 ('payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)','7b490b4cc34bd45205dacf169c1fc2432c5a711fd99d6384bdc0d22db4236e48','7b490b4cc34bd45205dacf169c1fc2432c5a711fd99d6384bdc0d22db4236e48')
 ) pin(signature,original_sha256,installed_sha256) LOOP
  fn:=to_regprocedure('public.'||item.signature);
  SELECT encode(public.digest(replace(replace(p.prosrc,E'\r\n',E'\n'),n.nspname||'.','public'||'.'),'sha256'),'hex') INTO actual
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.oid=fn AND p.prosecdef AND p.proowner=current_user::regrole;
  IF actual IS NULL OR actual NOT IN (item.original_sha256,item.installed_sha256)
  OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee NOT IN(p.proowner,roleid) AND a.privilege_type='EXECUTE')
  OR has_function_privilege(roleid,fn,'EXECUTE') IS DISTINCT FROM (split_part(item.signature,'(',1) IN ('payroll_novelty_bootstrap_v1','payroll_novelty_prepare_v1','payroll_novelty_detail_v1','payroll_novelty_transition_v1','payroll_novelty_export_v1'))
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND proconfig=CASE WHEN item.signature LIKE 'payroll_fixed_registry_%' THEN ARRAY['search_path=pg_catalog, public, pg_temp'] ELSE ARRAY['search_path=public, pg_temp'] END)
  THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
 FOR item IN SELECT * FROM (VALUES
 ('payroll_novelty_native_rows_valid_v2(jsonb,text)','b01ad454dc70d83d1465fa84e0fcfc4454a47a2750d5be712a576e3647c7524d'),
 ('payroll_novelty_subject_v2(jsonb,uuid,boolean)','1132198260c7fef85d29f4020a65d47d695c9bf541473f8e52c4c65fbd00618a'),
 ('payroll_novelty_native_subject_v2(jsonb,jsonb,date,boolean)','584251bd6e43b6857ed51455680b62ed173e3c630aac4020df06d6ba7d3e3552'),
 ('payroll_novelty_native_current_v2(jsonb,uuid,boolean)','fdb531bf9eaab509c08f1c32bb8d6613245ca9678eb784e8e4d12c0e897ff723'),
 ('payroll_novelty_native_require_v2(jsonb,uuid)','e07931fd8331bd140194aab3b60b1fd1427c19bab30a83fb3b15c6528733829b'),
 ('payroll_novelty_augment_v2(jsonb,jsonb,boolean)','fff5a67f715e7e80cf97a3e4129a2a113a21e9f6311789d1a29bd518dd3f4077'),
 ('payroll_novelty_event_snapshot_v2(bigint,uuid,boolean)','4981da91247b56661fe50f2d785343bd709fa65432d6cb319f6beb4f05aa3c61'),
 ('payroll_novelty_employee_v2(jsonb,uuid)','a14ad1cfa500a375e7df9edeec9cbd17052f3b55487cc903e41223d2d523c9fd'),
 ('payroll_novelty_require_v1_batch_v2(jsonb,uuid)','a7f2159c336c4f7ff57f31198aab05e19ba8f0583fd2080c776019e15262daa1'),
 ('payroll_novelty_prepare_v2(jsonb,text,date,text,jsonb,uuid,text)','1c0af0647c19b7cadcaded6239ec06e97c0463bd26ef5304cc768e9dd557aab8'),
 ('payroll_novelty_transition_v2(jsonb,uuid,text,integer,text,text,uuid,text)','635ae1132908b2b6c080a43aea6e048b9e6e4029508bcd265dd07853303f2104'),
 ('payroll_novelty_bootstrap_v2(jsonb)','23985aa7fa9fdfe91175573498deb6d864d721a5f8f33fbe33a3ece1673b548f'),
 ('payroll_novelty_detail_v2(jsonb,uuid)','d805128934004aea955076975a130be856b06d07d5ab76b631d8c2e0a4dc9c3b'),
 ('payroll_novelty_export_v2(jsonb,uuid)','c218c641f89925257aca6ed647bb061b502b3fab927b9d05c34e5961d2b2eadd')
 ) pin(signature,sha256) LOOP
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=split_part(item.signature,'(',1)) THEN
   fn:=to_regprocedure('public.'||item.signature);
   SELECT encode(public.digest(replace(replace(p.prosrc,E'\r\n',E'\n'),n.nspname||'.','public'||'.'),'sha256'),'hex') INTO actual
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.oid=fn AND p.prosecdef AND p.proowner=current_user::regrole;
   IF actual IS DISTINCT FROM item.sha256 OR (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=split_part(item.signature,'(',1))<>1
   OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=fn AND a.grantee NOT IN(p.proowner,roleid) AND a.privilege_type='EXECUTE')
   OR has_function_privilege(roleid,fn,'EXECUTE') IS DISTINCT FROM (split_part(item.signature,'(',1) IN ('payroll_novelty_bootstrap_v2','payroll_novelty_prepare_v2','payroll_novelty_detail_v2','payroll_novelty_transition_v2','payroll_novelty_export_v2','payroll_novelty_employee_v2'))
   OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=fn AND proconfig=CASE WHEN split_part(item.signature,'(',1) IN ('payroll_novelty_bootstrap_v2','payroll_novelty_prepare_v2','payroll_novelty_detail_v2','payroll_novelty_transition_v2','payroll_novelty_export_v2') THEN ARRAY['search_path=public, pg_temp'] ELSE ARRAY['search_path=pg_catalog, public, pg_temp'] END)
   THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;
  END IF;
 END LOOP;
 FOREACH tableid IN ARRAY ARRAY['public.payroll_novelty_batch'::regclass,'public.payroll_novelty_row'::regclass,'public.payroll_novelty_event'::regclass,'public.payroll_novelty_issue'::regclass,'public.native_employee_registration'::regclass] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=tableid AND relowner=current_user::regrole AND (tableid<>'public.native_employee_registration'::regclass OR relrowsecurity))
  OR has_table_privilege(roleid,tableid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=tableid AND NOT tgisinternal AND tgenabled<>'O')
  OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=tableid)
  THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.native_employee_registration'::regclass AND confrelid='public.platform_tenant_source_binding'::regclass AND contype='f' AND convalidated)
 THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;

 SELECT count(*) INTO native_count FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('payroll_novelty_native_rows_valid_v2','payroll_novelty_subject_v2','payroll_novelty_native_subject_v2','payroll_novelty_native_current_v2','payroll_novelty_native_require_v2','payroll_novelty_augment_v2','payroll_novelty_event_snapshot_v2','payroll_novelty_employee_v2','payroll_novelty_require_v1_batch_v2','payroll_novelty_prepare_v2','payroll_novelty_transition_v2','payroll_novelty_bootstrap_v2','payroll_novelty_detail_v2','payroll_novelty_export_v2');
 IF native_count NOT IN (0,14) THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;
 IF native_count=0 THEN
  IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.payroll_novelty_row'::regclass AND attname IN ('native_registration_id','subject_snapshot') AND NOT attisdropped)
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payroll_novelty_batch'::regclass AND conname='payroll_novelty_batch_contract_ck' AND convalidated AND pg_get_constraintdef(oid)=$shape$CHECK (((contract_version)::text = 'payroll-novelty-batch.v1'::text))$shape$)
  THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN ('public.payroll_novelty_batch'::regclass,'public.payroll_novelty_row'::regclass,'public.payroll_novelty_issue'::regclass,'public.payroll_novelty_event'::regclass) AND (NOT relrowsecurity OR relforcerowsecurity))
  OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.payroll_novelty_row'::regclass AND attname IN ('native_registration_id','subject_snapshot') AND NOT attisdropped AND NOT attnotnull AND NOT atthasdef AND attgenerated='' AND attidentity='' AND ((attname='native_registration_id' AND atttypid='uuid'::regtype) OR (attname='subject_snapshot' AND atttypid='jsonb'::regtype)))<>2
  OR NOT EXISTS(SELECT 1 FROM pg_constraint c WHERE c.conrelid='public.payroll_novelty_row'::regclass AND c.conname='payroll_novelty_row_native_fk' AND c.contype='f' AND c.convalidated AND c.confrelid='public.native_employee_registration'::regclass AND c.confdeltype='r' AND c.confupdtype='a' AND NOT c.condeferrable AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='native_registration_id')]::smallint[] AND c.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.confrelid AND attname='id')]::smallint[])
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payroll_novelty_row'::regclass AND conname='payroll_novelty_row_native_pair_ck' AND convalidated AND pg_get_constraintdef(oid)=$shape$CHECK ((((native_registration_id IS NULL) AND (subject_snapshot IS NULL)) OR ((native_registration_id IS NOT NULL) AND (subject_snapshot IS NOT NULL) AND (jsonb_typeof(subject_snapshot) = 'object'::text))))$shape$)
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payroll_novelty_batch'::regclass AND conname='payroll_novelty_batch_contract_ck' AND convalidated AND pg_get_constraintdef(oid)=$shape$CHECK ((((contract_version)::text = 'payroll-novelty-batch.v1'::text) OR (((contract_version)::text = 'payroll-novelty-batch.v2'::text) AND ((source_mode)::text = 'individual'::text) AND ((payroll_type)::text = 'monthly'::text) AND (row_count = 1))))$shape$)
  THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;
 END IF;
 FOR item IN SELECT * FROM (VALUES
  ('payroll_novelty_batch','payroll_novelty_batch_guard_v1','payroll_novelty_batch_guard_v1',23,false),
  ('payroll_novelty_batch','payroll_novelty_batch_no_delete_v1','payroll_novelty_reject_change_v1',11,false),
  ('payroll_novelty_batch','payroll_novelty_batch_audit_required_v1','payroll_novelty_require_audit_v1',21,true),
  ('payroll_novelty_row','payroll_novelty_row_guard_v1','payroll_novelty_row_guard_v1',31,false),
  ('payroll_novelty_issue','payroll_novelty_issue_guard_v1','payroll_novelty_issue_guard_v1',31,false),
  ('payroll_novelty_event','payroll_novelty_event_guard_v1','payroll_novelty_event_guard_v1',7,false),
  ('payroll_novelty_event','payroll_novelty_event_append_only_v1','payroll_novelty_reject_change_v1',27,false),
  ('native_employee_registration','native_employee_registration_immutable','reject_immutable_source_change',27,false),
  ('native_employee_registration','native_employee_registration_no_truncate','reject_immutable_source_change',34,false)
 ) expected(table_name,trigger_name,function_name,trigger_type,deferred) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||item.table_name) AND tgname=item.trigger_name AND tgfoid=to_regprocedure('public.'||item.function_name||'()') AND tgenabled='O'
   AND tgtype=item.trigger_type AND tgdeferrable=item.deferred AND tginitdeferred=item.deferred AND tgqual IS NULL AND tgnargs=0 AND tgattr=''::int2vector)
  THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
END $prerequisite$;

ALTER TABLE public.payroll_novelty_batch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_novelty_row ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_novelty_issue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_novelty_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_novelty_row ADD COLUMN IF NOT EXISTS native_registration_id uuid;
ALTER TABLE public.payroll_novelty_row ADD COLUMN IF NOT EXISTS subject_snapshot jsonb;
DO $columns$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.payroll_novelty_row'::regclass AND attname='native_registration_id' AND atttypid='uuid'::regtype AND NOT attnotnull AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.payroll_novelty_row'::regclass AND attname='subject_snapshot' AND atttypid='jsonb'::regtype AND NOT attnotnull AND NOT attisdropped)
 THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_PREREQUISITE'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payroll_novelty_row'::regclass AND conname='payroll_novelty_row_native_fk') THEN
  ALTER TABLE public.payroll_novelty_row ADD CONSTRAINT payroll_novelty_row_native_fk FOREIGN KEY(native_registration_id) REFERENCES public.native_employee_registration(id) ON DELETE RESTRICT;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payroll_novelty_row'::regclass AND conname='payroll_novelty_row_native_pair_ck') THEN
  ALTER TABLE public.payroll_novelty_row ADD CONSTRAINT payroll_novelty_row_native_pair_ck CHECK((native_registration_id IS NULL AND subject_snapshot IS NULL) OR (native_registration_id IS NOT NULL AND subject_snapshot IS NOT NULL AND jsonb_typeof(subject_snapshot)='object'));
 END IF;
END $columns$;
ALTER TABLE public.payroll_novelty_batch DROP CONSTRAINT payroll_novelty_batch_contract_ck;
ALTER TABLE public.payroll_novelty_batch ADD CONSTRAINT payroll_novelty_batch_contract_ck CHECK(
 contract_version='payroll-novelty-batch.v1' OR (contract_version='payroll-novelty-batch.v2' AND source_mode='individual' AND payroll_type='monthly' AND row_count=1));

CREATE OR REPLACE FUNCTION public.payroll_novelty_native_rows_valid_v2(p_rows jsonb,p_source_mode text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r jsonb;
BEGIN
 IF p_source_mode IS DISTINCT FROM 'individual' OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 IF jsonb_array_length(p_rows)<>1 THEN RETURN false; END IF;
 r:=p_rows->0;
 IF jsonb_typeof(r) IS DISTINCT FROM 'object'
 OR jsonb_typeof(r->'contractId') IS DISTINCT FROM 'string' OR jsonb_typeof(r->'identityToken') IS DISTINCT FROM 'string'
 OR coalesce(r->>'contractId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 OR coalesce(r->>'identityToken','') !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
 RETURN public.payroll_novelty_rows_valid_v1(jsonb_build_array(r-'contractId'-'identityToken'),p_source_mode);
END $$;

-- Reuse the closed 093 identity resolver, not the fixed-registry authorization.
CREATE OR REPLACE FUNCTION public.payroll_novelty_subject_v2(ctx jsonb,p_contract uuid,hold_lock boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 RETURN public.payroll_fixed_registry_subject_by_contract_v1(ctx,p_contract,hold_lock)->'subject';
EXCEPTION WHEN OTHERS THEN
 CASE SQLERRM
 WHEN 'PAYROLL_FIXED_NOT_FOUND' THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_CONTRACT_NOT_FOUND';
 WHEN 'PAYROLL_FIXED_INVALID_PAYLOAD' THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_PREPARE_INVALID';
 WHEN 'PAYROLL_FIXED_IDENTITY_CHANGED' THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_IDENTITY_CHANGED';
 WHEN 'PAYROLL_FIXED_SESSION_BUSY' THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_BUSY';
 ELSE RAISE; END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_native_subject_v2(ctx jsonb,r jsonb,p_period date,hold_lock boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE s jsonb; c public.employment_contract%ROWTYPE; adjustment date;
BEGIN
 s:=public.payroll_novelty_subject_v2(ctx,(r->>'contractId')::uuid,hold_lock);
 IF s->>'origin' IS DISTINCT FROM 'MUNICONTROL' THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NATIVE_ONLY'; END IF;
 IF s->>'identityToken' IS DISTINCT FROM r->>'identityToken' OR s->>'legajo' IS DISTINCT FROM r->>'legajo'
 THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_IDENTITY_CHANGED'; END IF;
 SELECT * INTO STRICT c FROM public.employment_contract WHERE id=(s->>'contractId')::uuid;
 adjustment:=(r->>'adjustmentMonth')::date;
 -- Month membership only; this does not assert eligibility, accrual or proration.
 IF p_period IS NULL OR p_period<date_trunc('month',c.start_date)::date
 OR (c.end_date IS NOT NULL AND p_period>date_trunc('month',c.end_date)::date)
 OR (adjustment IS NOT NULL AND (adjustment<date_trunc('month',c.start_date)::date
    OR (c.end_date IS NOT NULL AND adjustment>date_trunc('month',c.end_date)::date)))
 THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_PERIOD_OUTSIDE_EMPLOYMENT'; END IF;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_native_current_v2(ctx jsonb,p_batch uuid,hold_lock boolean)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b public.payroll_novelty_batch%ROWTYPE; r public.payroll_novelty_row%ROWTYPE; fresh jsonb;
BEGIN
 SELECT * INTO b FROM public.payroll_novelty_batch WHERE id=p_batch AND tenant_id=(ctx->>'tenantId')::uuid
 AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
 IF NOT FOUND THEN RETURN false; END IF;
 IF b.contract_version='payroll-novelty-batch.v1' THEN RETURN true; END IF;
 IF b.contract_version<>'payroll-novelty-batch.v2' OR b.row_count<>1
 OR (SELECT count(*) FROM public.payroll_novelty_row WHERE batch_id=b.id AND tenant_id=b.tenant_id)<>1 THEN RETURN false; END IF;
 SELECT * INTO STRICT r FROM public.payroll_novelty_row WHERE batch_id=b.id AND tenant_id=b.tenant_id;
 fresh:=public.payroll_novelty_native_subject_v2(ctx,jsonb_build_object('contractId',r.employment_contract_id,
  'identityToken',r.subject_snapshot->>'identityToken','legajo',r.legajo_snapshot,'adjustmentMonth',r.adjustment_month),b.period_month,hold_lock);
 RETURN fresh IS NOT DISTINCT FROM r.subject_snapshot AND r.native_registration_id::text=fresh->>'registrationId';
EXCEPTION WHEN SQLSTATE 'P0001' THEN
 IF SQLERRM IN ('PAYROLL_NOVELTY_CONTRACT_NOT_FOUND','PAYROLL_NOVELTY_IDENTITY_CHANGED','PAYROLL_NOVELTY_NATIVE_ONLY','PAYROLL_NOVELTY_PERIOD_OUTSIDE_EMPLOYMENT') THEN RETURN false; END IF;
 RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_native_require_v2(ctx jsonb,p_batch uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF public.payroll_novelty_native_current_v2(ctx,p_batch,true) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_IDENTITY_CHANGED'; END IF;
END $$;

-- Nominal source snapshot is immutable. Current authority/identity belongs only
-- in a fresh read, never in a persisted command acknowledgement.
CREATE OR REPLACE FUNCTION public.payroll_novelty_augment_v2(ctx jsonb,snapshot jsonb,include_current boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE r public.payroll_novelty_row%ROWTYPE; current_identity boolean; new_rows jsonb;
BEGIN
 IF snapshot IS NULL OR snapshot->>'contractVersion'<>'payroll-novelty-batch.v2' THEN RETURN snapshot; END IF;
 IF jsonb_array_length(snapshot->'rows')=0 THEN
  IF snapshot ? 'allowedCommands' THEN snapshot:=snapshot||jsonb_build_object('allowedCommands','[]'::jsonb,'canExport',false); END IF;
  RETURN snapshot;
 END IF;
 SELECT n.* INTO STRICT r FROM public.payroll_novelty_row n JOIN public.payroll_novelty_batch b ON b.id=n.batch_id AND b.tenant_id=n.tenant_id
 WHERE n.batch_id=(snapshot->>'id')::uuid AND n.tenant_id=(ctx->>'tenantId')::uuid AND b.certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
 new_rows:=jsonb_build_array((snapshot->'rows'->0)||jsonb_build_object('subject',r.subject_snapshot));
 IF include_current THEN
  current_identity:=public.payroll_novelty_native_current_v2(ctx,r.batch_id,false);
  new_rows:=jsonb_build_array((new_rows->0)||jsonb_build_object('identityCurrent',current_identity));
  IF NOT current_identity THEN
   IF snapshot ? 'allowedCommands' THEN
    snapshot:=jsonb_set(snapshot,'{allowedCommands}',coalesce((SELECT jsonb_agg(v) FROM jsonb_array_elements(snapshot->'allowedCommands') v WHERE v NOT IN ('"submit"'::jsonb,'"approve"'::jsonb)),'[]'::jsonb));
   END IF;
   IF snapshot ? 'canExport' THEN snapshot:=jsonb_set(snapshot,'{canExport}','false'::jsonb); END IF;
  END IF;
 END IF;
 RETURN jsonb_set(snapshot,'{rows}',new_rows);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_event_snapshot_v2(p_event_id bigint,p_tenant_id uuid,p_include_nominal boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE snapshot jsonb; ctx jsonb; e public.payroll_novelty_event%ROWTYPE;
BEGIN
 snapshot:=public.payroll_novelty_event_snapshot_v1(p_event_id,p_tenant_id,p_include_nominal);
 IF snapshot IS NULL OR snapshot->>'contractVersion'<>'payroll-novelty-batch.v2' THEN RETURN snapshot; END IF;
 SELECT * INTO STRICT e FROM public.payroll_novelty_event WHERE id=p_event_id AND tenant_id=p_tenant_id;
 ctx:=jsonb_build_object('tenantId',e.tenant_id,'certifiedBindingId',e.certified_binding_id);
 snapshot:=snapshot||jsonb_build_object(
  'submittedAt',(SELECT min(occurred_at) FROM public.payroll_novelty_event WHERE batch_id=e.batch_id AND tenant_id=e.tenant_id AND command='submit' AND resulting_version<=e.resulting_version),
  'decidedAt',(SELECT min(occurred_at) FROM public.payroll_novelty_event WHERE batch_id=e.batch_id AND tenant_id=e.tenant_id AND command IN ('approve','reject','cancel') AND resulting_version<=e.resulting_version));
 RETURN public.payroll_novelty_augment_v2(ctx,snapshot,false);
END $$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_employee_v2(p_context jsonb,p_contract_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.payroll_novelty_assert_context_v1(p_context,'payroll.novelty.nominal.read');
 RETURN jsonb_build_object('version','payroll-novelty-employee.v2','subject',public.payroll_novelty_subject_v2(ctx,p_contract_id,false));
END $$;

-- Invoked only after the public facade has validated current authority.
CREATE OR REPLACE FUNCTION public.payroll_novelty_require_v1_batch_v2(ctx jsonb,p_batch uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.payroll_novelty_batch WHERE id=p_batch AND tenant_id=(ctx->>'tenantId')::uuid
 AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid AND contract_version<>'payroll-novelty-batch.v1')
 THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_VERSION_UNSUPPORTED'; END IF;
END $$;


CREATE OR REPLACE FUNCTION public.payroll_novelty_prepare_v2(
  p_context jsonb,
  p_source_mode text,
  p_period_month date,
  p_payroll_type text,
  p_rows jsonb,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  existing_event public.payroll_novelty_event%ROWTYPE;
  existing_event_found boolean := false;
  existing_batch public.payroll_novelty_batch%ROWTYPE;
  batch_id_value uuid;
  event_id_value bigint;
  row_value jsonb;
  subject_value jsonb;
  contract_id_value uuid;
  canonical_rows jsonb;
  canonical_fingerprint_rows jsonb;
  content_sha256_value text;
  stored_rows jsonb;
  event_hash_placeholder text := repeat('0', 64);
  include_nominal boolean;
BEGIN
  IF p_source_mode IS DISTINCT FROM 'individual'
     OR p_period_month IS NULL OR EXTRACT(day FROM p_period_month) <> 1
     OR p_period_month NOT BETWEEN DATE '2008-01-01' AND DATE '2099-12-01'
     OR p_payroll_type IS DISTINCT FROM 'monthly'
     OR public.payroll_novelty_native_rows_valid_v2(p_rows, p_source_mode) IS DISTINCT FROM true
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_PREPARE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.prepare'
  );
  include_nominal := context_value->'capabilities' ? 'payroll.novelty.nominal.read';
  IF NOT include_nominal THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text,
    0
  ));

  SELECT jsonb_agg(jsonb_build_object(
      'rowOrdinal', (item->>'rowOrdinal')::integer,
      'legajo', item->>'legajo',
        'contractId', item->>'contractId', 'identityToken', item->>'identityToken',
      'conceptSourceId', item->>'conceptSourceId',
      'costCenterSourceId', item->>'costCenterSourceId',
      'adjustmentMonth', item->>'adjustmentMonth',
      'quantityDecimal', CASE WHEN item->>'quantityDecimal' IS NULL
        THEN NULL ELSE trim_scale((item->>'quantityDecimal')::numeric(20,6))::text END,
      'amountCents', CASE WHEN item->>'amountCents' IS NULL
        THEN NULL ELSE ((item->>'amountCents')::bigint)::text END,
      'movementType', item->>'movementType',
      'legalInstrument', item->>'legalInstrument',
      'observation', item->>'observation',
      'forced', (item->>'forced')::boolean
    ) ORDER BY (item->>'rowOrdinal')::integer)
    INTO canonical_rows
  FROM jsonb_array_elements(p_rows) item;

  -- La huella omite orden/ordinal y modo de carga: el mismo contenido logico
  -- no puede abrir lotes paralelos cambiando el orden o individual/masivo.
  SELECT jsonb_agg(
      fingerprint_row.row_payload
      ORDER BY fingerprint_row.business_key, fingerprint_row.row_payload::text
    )
    INTO canonical_fingerprint_rows
  FROM (
    SELECT jsonb_build_object(
        'legajo', item->>'legajo',
        'contractId', item->>'contractId', 'identityToken', item->>'identityToken',
        'conceptSourceId', item->>'conceptSourceId',
        'costCenterSourceId', item->>'costCenterSourceId',
        'adjustmentMonth', item->>'adjustmentMonth',
        'quantityDecimal', CASE WHEN item->>'quantityDecimal' IS NULL
          THEN NULL ELSE trim_scale((item->>'quantityDecimal')::numeric(20,6))::text END,
        'amountCents', CASE WHEN item->>'amountCents' IS NULL
          THEN NULL ELSE ((item->>'amountCents')::bigint)::text END,
        'movementType', item->>'movementType',
        'legalInstrument', item->>'legalInstrument',
        'observation', item->>'observation',
        'forced', (item->>'forced')::boolean
      ) AS row_payload,
      (item->>'contractId') || chr(31)
        || (item->>'conceptSourceId') || chr(31)
        || COALESCE(item->>'costCenterSourceId', '') || chr(31)
        || COALESCE(item->>'adjustmentMonth', '') || chr(31)
        || COALESCE(item->>'movementType', '') AS business_key
    FROM jsonb_array_elements(p_rows) item
  ) fingerprint_row;

  content_sha256_value := encode(digest(convert_to(jsonb_build_object(
    'contractVersion', 'payroll-novelty-batch.v2',
    'tenantId', ((context_value->>'tenantId')::uuid)::text,
    'certifiedBindingId', ((context_value->>'certifiedBindingId')::uuid)::text,
    'periodMonth', to_char(p_period_month, 'YYYY-MM-DD'),
    'payrollType', p_payroll_type,
    'rows', canonical_fingerprint_rows
  )::text, 'UTF8'), 'sha256'), 'hex');

  SELECT * INTO existing_event
  FROM public.payroll_novelty_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency
  FOR SHARE;
  existing_event_found := FOUND;

  IF existing_event_found THEN
    SELECT * INTO existing_batch
    FROM public.payroll_novelty_batch batch
    WHERE batch.id = existing_event.batch_id AND batch.tenant_id = existing_event.tenant_id
    FOR SHARE;
    SELECT jsonb_agg(jsonb_build_object(
        'rowOrdinal', row_item.row_ordinal,
        'legajo', row_item.legajo_snapshot,
        'contractId', row_item.employment_contract_id, 'identityToken', row_item.subject_snapshot->>'identityToken',
        'conceptSourceId', row_item.concept_source_id,
        'costCenterSourceId', row_item.cost_center_source_id,
        'adjustmentMonth', CASE WHEN row_item.adjustment_month IS NULL
          THEN NULL ELSE to_char(row_item.adjustment_month, 'YYYY-MM-DD') END,
        'quantityDecimal', CASE WHEN row_item.quantity IS NULL
          THEN NULL ELSE trim_scale(row_item.quantity)::text END,
        'amountCents', CASE WHEN row_item.amount_cents IS NULL
          THEN NULL ELSE row_item.amount_cents::text END,
        'movementType', row_item.movement_type,
        'legalInstrument', row_item.legal_instrument,
        'observation', row_item.observation,
        'forced', row_item.forced
      ) ORDER BY row_item.row_ordinal) INTO stored_rows
    FROM public.payroll_novelty_row row_item
    WHERE row_item.batch_id = existing_batch.id
      AND row_item.tenant_id = existing_batch.tenant_id;

    IF existing_event.command <> 'prepare'
       OR btrim(existing_event.command_hash) <> lower(p_command_hash)
       OR existing_event.actor_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> 'payroll.novelty.prepare'
       OR existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid
       OR existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <>
         (context_value->>'actorSessionVersion')::integer
       OR btrim(existing_event.release_sha) <> lower(context_value->>'releaseSha')
       OR existing_batch.source_mode <> p_source_mode
       OR existing_batch.period_month <> p_period_month
       OR existing_batch.payroll_type <> p_payroll_type
       OR btrim(existing_batch.content_sha256) <> content_sha256_value
       OR stored_rows IS DISTINCT FROM canonical_rows THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'data', public.payroll_novelty_event_snapshot_v2(
        existing_event.id, existing_event.tenant_id, include_nominal
      )
    );
  END IF;

  -- Serializa por contenido canonico, independientemente del actor o de la
  -- clave de idempotencia. El indice parcial conserva la garantia aun si un
  -- futuro escritor no toma este advisory lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'payroll-novelty-active:' || content_sha256_value,
    0
  ));
  IF EXISTS (
    SELECT 1
    FROM public.payroll_novelty_batch batch
    WHERE batch.tenant_id = (context_value->>'tenantId')::uuid
      AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
      AND batch.period_month = p_period_month
      AND batch.payroll_type = p_payroll_type
      AND btrim(batch.content_sha256) = content_sha256_value
      AND batch.status IN ('draft','submitted','approved')
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_DUPLICATE_BATCH' USING ERRCODE = 'P0001';
  END IF;

  FOR row_value IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    subject_value:=public.payroll_novelty_native_subject_v2(context_value,row_value,p_period_month,true);
  END LOOP;

  INSERT INTO public.payroll_novelty_batch (
    tenant_id, certified_binding_id, source_mode, period_month, payroll_type,
    content_sha256, contract_version, release_sha, status, version, row_count,
    prepared_by_membership_id, prepared_by_person_id,
    reason_code, reason_reference, exportable,
    grh_mutation, payroll_calculated, payroll_posted
  ) VALUES (
    (context_value->>'tenantId')::uuid,
    (context_value->>'certifiedBindingId')::uuid,
    p_source_mode, p_period_month, p_payroll_type,
    content_sha256_value,
    'payroll-novelty-batch.v2', lower(context_value->>'releaseSha'),
    'draft', 1, jsonb_array_length(p_rows),
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    'draft_prepared', NULL, false, false, false, false
  ) RETURNING id INTO batch_id_value;

  FOR row_value IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    subject_value:=public.payroll_novelty_native_subject_v2(context_value,row_value,p_period_month,true);
    contract_id_value:=(subject_value->>'contractId')::uuid;

    INSERT INTO public.payroll_novelty_row (
      batch_id, tenant_id, row_ordinal, employment_contract_id, legajo_snapshot,
      concept_source_id, cost_center_source_id, adjustment_month,
      quantity, amount_cents, movement_type, legal_instrument, observation, forced,
      native_registration_id, subject_snapshot
    ) VALUES (
      batch_id_value, (context_value->>'tenantId')::uuid,
      (row_value->>'rowOrdinal')::integer, contract_id_value, row_value->>'legajo',
      row_value->>'conceptSourceId', row_value->>'costCenterSourceId',
      (row_value->>'adjustmentMonth')::date,
      (row_value->>'quantityDecimal')::numeric(20,6),
      (row_value->>'amountCents')::bigint,
      row_value->>'movementType', row_value->>'legalInstrument',
      row_value->>'observation', (row_value->>'forced')::boolean,
      (subject_value->>'registrationId')::uuid, subject_value
    );
  END LOOP;

  -- Duplicados de negocio dentro del mismo lote son visibles y bloqueantes.
  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'duplicate_business_key', 'error', true,
    'conceptSourceId', jsonb_build_object('duplicateCount', duplicates.duplicate_count)
  FROM public.payroll_novelty_row row_value
  JOIN (
    SELECT employment_contract_id, concept_source_id,
      COALESCE(cost_center_source_id, ''),
      COALESCE(adjustment_month, DATE '1900-01-01'),
      COALESCE(movement_type, ''),
      count(*)::integer AS duplicate_count
    FROM public.payroll_novelty_row
    WHERE batch_id = batch_id_value
      AND tenant_id = (context_value->>'tenantId')::uuid
    GROUP BY employment_contract_id, concept_source_id,
      COALESCE(cost_center_source_id, ''),
      COALESCE(adjustment_month, DATE '1900-01-01'),
      COALESCE(movement_type, '')
    HAVING count(*) > 1
  ) duplicates(
    employment_contract_id, concept_source_id, cost_center_source_id,
    adjustment_month, movement_type, duplicate_count
  ) ON duplicates.employment_contract_id = row_value.employment_contract_id
    AND duplicates.concept_source_id = row_value.concept_source_id
    AND duplicates.cost_center_source_id = COALESCE(row_value.cost_center_source_id, '')
    AND duplicates.adjustment_month = COALESCE(row_value.adjustment_month, DATE '1900-01-01')
    AND duplicates.movement_type = COALESCE(row_value.movement_type, '')
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid;

  -- No existe aun un catalogo canonico de conceptos/centros/tipos. Se valida
  -- formato y se explicita si el valor nunca fue observado en GRH publicado.
  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'concept_not_observed', 'warning', false,
    'conceptSourceId', jsonb_build_object('basis', 'published_grh_observation')
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND NOT EXISTS (
      SELECT 1 FROM public.grh_effective_employment_movement_v1 movement
      JOIN public.source_import_batch source_batch
        ON source_batch.id = movement.source_batch_id
       AND source_batch.source_system = 'GRH'
       AND source_batch.source_database = context_value->>'sourceDatabase'
       AND source_batch.validation_state = 'published'
      WHERE movement.employment_contract_id = row_value.employment_contract_id
        AND movement.source_system = 'GRH'
        AND movement.concept_source_id = row_value.concept_source_id
    );

  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'cost_center_not_observed', 'warning', false,
    'costCenterSourceId', jsonb_build_object('basis', 'published_grh_observation')
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND row_value.cost_center_source_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.grh_effective_employment_movement_v1 movement
      JOIN public.source_import_batch source_batch
        ON source_batch.id = movement.source_batch_id
       AND source_batch.source_system = 'GRH'
       AND source_batch.source_database = context_value->>'sourceDatabase'
       AND source_batch.validation_state = 'published'
      WHERE movement.employment_contract_id = row_value.employment_contract_id
        AND movement.source_system = 'GRH'
        AND movement.cost_center_source_id = row_value.cost_center_source_id
    );

  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'movement_type_not_observed', 'warning', false,
    'movementType', jsonb_build_object('basis', 'published_grh_observation')
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND row_value.movement_type IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.grh_effective_employment_movement_v1 movement
      JOIN public.source_import_batch source_batch
        ON source_batch.id = movement.source_batch_id
       AND source_batch.source_system = 'GRH'
       AND source_batch.source_database = context_value->>'sourceDatabase'
       AND source_batch.validation_state = 'published'
      WHERE movement.employment_contract_id = row_value.employment_contract_id
        AND movement.source_system = 'GRH'
        AND lower(movement.movement_type) = row_value.movement_type
    );

  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.grh_effective_employment_movement_v1 equal_movement
      JOIN public.source_import_batch equal_batch
        ON equal_batch.id = equal_movement.source_batch_id
       AND equal_batch.source_system = 'GRH'
       AND equal_batch.source_database = context_value->>'sourceDatabase'
       AND equal_batch.validation_state = 'published'
      WHERE equal_movement.employment_contract_id = row_value.employment_contract_id
        AND equal_movement.source_system = 'GRH'
        AND equal_movement.movement_period = p_period_month
        AND public.payroll_type_canonical_v1(equal_movement.source_system, equal_movement.payroll_type) = p_payroll_type
        AND equal_movement.concept_source_id = row_value.concept_source_id
        AND COALESCE(equal_movement.cost_center_source_id, '') =
          COALESCE(row_value.cost_center_source_id, '')
        AND equal_movement.quantity IS NOT DISTINCT FROM row_value.quantity
    ) THEN 'already_observed' ELSE 'existing_movement_conflict' END,
    'error', true, 'conceptSourceId',
    jsonb_build_object('basis', 'published_grh_same_period')
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND EXISTS (
      SELECT 1 FROM public.grh_effective_employment_movement_v1 movement
      JOIN public.source_import_batch source_batch
        ON source_batch.id = movement.source_batch_id
       AND source_batch.source_system = 'GRH'
       AND source_batch.source_database = context_value->>'sourceDatabase'
       AND source_batch.validation_state = 'published'
      WHERE movement.employment_contract_id = row_value.employment_contract_id
        AND movement.source_system = 'GRH'
        AND movement.movement_period = p_period_month
        AND public.payroll_type_canonical_v1(movement.source_system, movement.payroll_type) = p_payroll_type
        AND movement.concept_source_id = row_value.concept_source_id
        AND COALESCE(movement.cost_center_source_id, '') =
          COALESCE(row_value.cost_center_source_id, '')
    );


  -- Un movimiento con el mismo grano de negocio y TIPO_31 no homologado no
  -- puede descartarse como duplicado ni asumirse como otro tipo. Se bloquea
  -- hasta que el catalogo versionado pruebe la equivalencia.
  INSERT INTO public.payroll_novelty_issue (
    tenant_id, batch_id, row_id, row_ordinal, issue_code,
    severity, is_blocking, field_name, details
  )
  SELECT row_value.tenant_id, row_value.batch_id, row_value.id,
    row_value.row_ordinal, 'legacy_payroll_type_unclassified',
    'error', true, 'payrollType', jsonb_build_object(
      'basis', 'published_grh_same_period',
      'reason', 'versioned_payroll_type_mapping_required'
    )
  FROM public.payroll_novelty_row row_value
  WHERE row_value.batch_id = batch_id_value
    AND row_value.tenant_id = (context_value->>'tenantId')::uuid
    AND EXISTS (
      SELECT 1 FROM public.grh_effective_employment_movement_v1 unresolved_movement
      JOIN public.source_import_batch unresolved_batch
        ON unresolved_batch.id = unresolved_movement.source_batch_id
       AND unresolved_batch.source_system = 'GRH'
       AND unresolved_batch.source_database = context_value->>'sourceDatabase'
       AND unresolved_batch.validation_state = 'published'
      WHERE unresolved_movement.employment_contract_id = row_value.employment_contract_id
        AND unresolved_movement.source_system = 'GRH'
        AND unresolved_movement.movement_period = p_period_month
        AND unresolved_movement.concept_source_id = row_value.concept_source_id
        AND COALESCE(unresolved_movement.cost_center_source_id, '') =
          COALESCE(row_value.cost_center_source_id, '')
        AND public.payroll_type_canonical_v1(
          unresolved_movement.source_system, unresolved_movement.payroll_type
        ) IS NULL
    );

  INSERT INTO public.payroll_novelty_event (
    tenant_id, batch_id, certified_binding_id,
    actor_membership_id, actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha,
    command, from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash,
    event_sha256, exportable, grh_mutation, payroll_calculated, payroll_posted
  ) VALUES (
    (context_value->>'tenantId')::uuid, batch_id_value,
    (context_value->>'certifiedBindingId')::uuid,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    context_value->>'roleKey', 'payroll.novelty.prepare',
    (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'),
    'prepare', NULL, 'draft', 0, 1,
    'draft_prepared', NULL, p_idempotency, lower(p_command_hash),
    event_hash_placeholder, false, false, false, false
  ) RETURNING id INTO event_id_value;

  RETURN jsonb_build_object(
    'replayed', false,
    'data', public.payroll_novelty_event_snapshot_v2(
      event_id_value, (context_value->>'tenantId')::uuid, include_nominal
    )
  );
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_BUSY';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_transition_v2(
  p_context jsonb,
  p_batch_id uuid,
  p_command text,
  p_expected_version integer,
  p_reason_code text,
  p_reason_reference text,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  required_capability text;
  context_value jsonb;
  batch_row public.payroll_novelty_batch%ROWTYPE;
  existing_event public.payroll_novelty_event%ROWTYPE;
  event_id_value bigint;
  normalized_reference text := NULLIF(btrim(COALESCE(p_reason_reference,'')), '');
  next_status text;
  prior_status text;
  event_hash_placeholder text := repeat('0', 64);
  include_nominal boolean;
BEGIN
  IF p_batch_id IS NULL
     OR p_command NOT IN ('submit','approve','reject','cancel')
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR (normalized_reference IS NOT NULL AND normalized_reference !~
       '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
     OR NOT (
       (p_command = 'submit' AND p_reason_code = 'ready_for_review'
         AND normalized_reference IS NULL)
       OR (p_command = 'approve' AND p_reason_code = 'validated_for_export'
         AND normalized_reference IS NULL)
       OR (p_command = 'reject' AND p_reason_code IN (
          'invalid_rows','unsupported_concept','duplicate_or_conflict'
        ) AND normalized_reference IS NOT NULL)
       OR (p_command = 'cancel' AND p_reason_code = 'cancelled_by_preparer'
         AND normalized_reference IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  required_capability := CASE WHEN p_command IN ('submit','cancel')
    THEN 'payroll.novelty.prepare'
    ELSE 'payroll.novelty.approve'
  END;
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, required_capability
  );
  include_nominal := context_value->'capabilities' ? 'payroll.novelty.nominal.read';
  IF p_command IN ('approve','reject') AND NOT include_nominal THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF NOT include_nominal AND EXISTS(SELECT 1 FROM public.payroll_novelty_batch WHERE id=p_batch_id AND tenant_id=(context_value->>'tenantId')::uuid AND certified_binding_id=(context_value->>'certifiedBindingId')::uuid AND contract_version='payroll-novelty-batch.v2') THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text,
    0
  ));

  SELECT * INTO existing_event
  FROM public.payroll_novelty_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency
  FOR SHARE;
  IF FOUND THEN
    IF existing_event.batch_id <> p_batch_id
       OR existing_event.command <> p_command
       OR existing_event.expected_version <> p_expected_version
       OR existing_event.reason_code <> p_reason_code
       OR existing_event.reason_reference IS DISTINCT FROM normalized_reference
       OR btrim(existing_event.command_hash) <> lower(p_command_hash)
       OR existing_event.actor_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> required_capability
       OR existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid
       OR existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <>
         (context_value->>'actorSessionVersion')::integer
       OR btrim(existing_event.release_sha) <> lower(context_value->>'releaseSha')
       OR NOT EXISTS (
         SELECT 1 FROM public.payroll_novelty_batch replay_batch
         WHERE replay_batch.id = existing_event.batch_id
           AND replay_batch.tenant_id = existing_event.tenant_id
           AND replay_batch.certified_binding_id =
             (context_value->>'certifiedBindingId')::uuid
       ) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'data', public.payroll_novelty_event_snapshot_v2(
        existing_event.id, existing_event.tenant_id, include_nominal
      )
    );
  END IF;

  SELECT * INTO batch_row
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF batch_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  prior_status := batch_row.status;
  IF p_command IN ('submit','cancel') THEN
    IF batch_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
       OR batch_row.prepared_by_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR (p_command = 'submit' AND batch_row.status <> 'draft')
       OR (p_command = 'cancel' AND batch_row.status NOT IN ('draft','submitted')) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_PREPARER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF batch_row.status <> 'submitted'
       OR (context_value->>'actorPersonId') IS NULL
       OR batch_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid
       OR (batch_row.prepared_by_person_id IS NOT NULL AND
         batch_row.prepared_by_person_id = (context_value->>'actorPersonId')::uuid) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF batch_row.contract_version='payroll-novelty-batch.v2' AND p_command IN ('submit','approve') THEN
    PERFORM public.payroll_novelty_native_require_v2(context_value,batch_row.id);
  END IF;

  next_status := CASE p_command
    WHEN 'submit' THEN 'submitted'
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled'
  END;

  UPDATE public.payroll_novelty_batch batch SET
    status = next_status,
    version = batch.version + 1,
    approved_by_membership_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'membershipId')::uuid ELSE NULL END,
    approved_by_person_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'actorPersonId')::uuid ELSE NULL END,
    reason_code = p_reason_code,
    reason_reference = normalized_reference,
    exportable = p_command = 'approve',
    grh_mutation = false,
    payroll_calculated = false,
    payroll_posted = false
  WHERE batch.id = batch_row.id AND batch.tenant_id = batch_row.tenant_id
  RETURNING * INTO batch_row;

  INSERT INTO public.payroll_novelty_event (
    tenant_id, batch_id, certified_binding_id,
    actor_membership_id, actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha,
    command, from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash,
    event_sha256, exportable, grh_mutation, payroll_calculated, payroll_posted
  ) VALUES (
    batch_row.tenant_id, batch_row.id, batch_row.certified_binding_id,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    context_value->>'roleKey', required_capability,
    (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'),
    p_command, prior_status, next_status, p_expected_version, batch_row.version,
    p_reason_code, normalized_reference, p_idempotency, lower(p_command_hash),
    event_hash_placeholder, batch_row.exportable, false, false, false
  ) RETURNING id INTO event_id_value;

  RETURN jsonb_build_object(
    'replayed', false,
    'data', public.payroll_novelty_event_snapshot_v2(
      event_id_value, batch_row.tenant_id, include_nominal
    )
  );
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_BUSY';
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_bootstrap_v2(p_context jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  batch_list jsonb;
  event_list jsonb := '[]'::jsonb;
  has_nominal boolean;
  has_prepare boolean;
  has_approve boolean;
  has_export boolean;
  has_audit boolean;
BEGIN
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.read'
  );
  has_nominal := context_value->'capabilities' ? 'payroll.novelty.nominal.read';
  has_prepare := context_value->'capabilities' ? 'payroll.novelty.prepare';
  has_approve := context_value->'capabilities' ? 'payroll.novelty.approve';
  has_export := context_value->'capabilities' ? 'payroll.novelty.export';
  has_audit := context_value->'capabilities' ? 'payroll.novelty.audit.read';

  SELECT COALESCE(jsonb_agg(
    public.payroll_novelty_snapshot_v1(item.id, item.tenant_id, has_nominal)
    || jsonb_build_object(
      'allowedCommands', CASE
        WHEN item.status = 'draft' AND has_prepare
          AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
          AND item.prepared_by_person_id IS NOT DISTINCT FROM
            (context_value->>'actorPersonId')::uuid
          THEN jsonb_build_array('submit','cancel')
        WHEN item.status = 'submitted' AND has_prepare
          AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
          AND item.prepared_by_person_id IS NOT DISTINCT FROM
            (context_value->>'actorPersonId')::uuid
          THEN jsonb_build_array('cancel')
        WHEN item.status = 'submitted' AND has_approve AND has_nominal
          AND (context_value->>'employmentLinked')::boolean
          AND item.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
          AND (item.prepared_by_person_id IS NULL OR
            item.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid)
          THEN jsonb_build_array('approve','reject')
        ELSE '[]'::jsonb
      END,
      'canExport', item.status = 'approved' AND item.exportable
        AND has_export AND has_nominal
    ) ORDER BY item.period_month DESC, item.created_at DESC, item.id
  ), '[]'::jsonb) INTO batch_list
  FROM (
    SELECT batch.* FROM public.payroll_novelty_batch batch
    WHERE batch.tenant_id = (context_value->>'tenantId')::uuid
      AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    ORDER BY batch.period_month DESC, batch.created_at DESC, batch.id
    LIMIT 100
  ) item;

  IF has_audit THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'batchId', item.batch_id,
      'certifiedBindingId', item.certified_binding_id,
      'actorMembershipId', item.actor_membership_id,
      'actorPersonId', item.actor_person_id,
      'actorRoleKey', item.actor_role_key,
      'authorityCapabilityKey', item.authority_capability_key,
      'command', item.command,
      'fromStatus', item.from_status,
      'toStatus', item.to_status,
      'expectedVersion', item.expected_version,
      'resultingVersion', item.resulting_version,
      'reasonCode', item.reason_code,
      'reasonReference', item.reason_reference,
      'exportable', item.exportable,
      'grhMutation', item.grh_mutation,
      'payrollCalculated', item.payroll_calculated,
      'payrollPosted', item.payroll_posted,
      'eventSha256', btrim(item.event_sha256),
      'occurredAt', item.occurred_at
    ) ORDER BY item.occurred_at DESC, item.id DESC), '[]'::jsonb)
    INTO event_list
    FROM (
      SELECT event.* FROM public.payroll_novelty_event event
      JOIN public.payroll_novelty_batch audit_batch
        ON audit_batch.id = event.batch_id
       AND audit_batch.tenant_id = event.tenant_id
      WHERE event.tenant_id = (context_value->>'tenantId')::uuid
        AND audit_batch.certified_binding_id =
          (context_value->>'certifiedBindingId')::uuid
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT 100
    ) item;
  END IF;

  SELECT coalesce(jsonb_agg(public.payroll_novelty_augment_v2(context_value,x,true) ORDER BY ord),'[]'::jsonb) INTO batch_list FROM jsonb_array_elements(batch_list) WITH ORDINALITY a(x,ord);

  RETURN jsonb_build_object(
    'principal', jsonb_build_object(
      'tenantId', context_value->>'tenantId',
      'membershipId', context_value->>'membershipId',
      'certifiedBindingId', context_value->>'certifiedBindingId',
      'roleKey', context_value->>'roleKey',
      'employmentLinked', (context_value->>'employmentLinked')::boolean,
      'capabilities', context_value->'capabilities'
    ),
    'feature', jsonb_build_object(
      'key', 'payroll_novelties',
      'contractVersion', 'payroll-novelty-batch.v2',
      'approvalEffect', 'export_only'
    ),
    'batches', batch_list,
    'recentEvents', event_list,
    'limits', jsonb_build_object(
      'maxRows', 500,
      'native',jsonb_build_object('maxRows',1,'sourceModes',jsonb_build_array('individual'),'payrollTypes',jsonb_build_array('monthly')),
      'contractVersion', 'payroll-novelty-batch.v2',
      'sourceModes', jsonb_build_array('individual','bulk'),
      'payrollTypes', jsonb_build_array(
        'monthly','first_fortnight','sac','vacation','supplementary','final','other'
      ),
      'approvalEffect', 'export_only',
      'grhMutation', false,
      'payrollCalculated', false,
      'payrollPosted', false
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_detail_v2(
  p_context jsonb,
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  snapshot_value jsonb;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_DETAIL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.nominal.read'
  );
  SELECT public.payroll_novelty_snapshot_v1(
    batch.id, batch.tenant_id, true
  ) || jsonb_build_object(
    'allowedCommands', CASE
      WHEN batch.status = 'draft'
        AND (context_value->'capabilities' ? 'payroll.novelty.prepare')
        AND batch.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND batch.prepared_by_person_id IS NOT DISTINCT FROM
          (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('submit','cancel')
      WHEN batch.status = 'submitted'
        AND (context_value->'capabilities' ? 'payroll.novelty.prepare')
        AND batch.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND batch.prepared_by_person_id IS NOT DISTINCT FROM
          (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('cancel')
      WHEN batch.status = 'submitted'
        AND (context_value->'capabilities' ? 'payroll.novelty.approve')
        AND (context_value->>'employmentLinked')::boolean
        AND batch.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
        AND (batch.prepared_by_person_id IS NULL OR
          batch.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid)
        THEN jsonb_build_array('approve','reject')
      ELSE '[]'::jsonb
    END,
    'canExport', batch.status = 'approved' AND batch.exportable
      AND (context_value->'capabilities' ? 'payroll.novelty.export')
  ) INTO snapshot_value
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid;
  IF snapshot_value IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('data', public.payroll_novelty_augment_v2(context_value,snapshot_value,true));
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_export_v2(
  p_context jsonb,
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  snapshot_value jsonb;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_EXPORT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.export'
  );
  IF NOT (context_value->'capabilities' ? 'payroll.novelty.nominal.read') THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  SELECT public.payroll_novelty_snapshot_v1(
    batch.id, batch.tenant_id, true
  ) INTO snapshot_value
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    AND batch.status = 'approved'
    AND batch.exportable IS TRUE
    AND batch.grh_mutation IS FALSE
    AND batch.payroll_calculated IS FALSE
    AND batch.payroll_posted IS FALSE;
  IF snapshot_value IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOT_EXPORTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF snapshot_value->>'contractVersion'='payroll-novelty-batch.v2' THEN
    PERFORM public.payroll_novelty_native_require_v2(context_value,p_batch_id);
    snapshot_value:=public.payroll_novelty_augment_v2(context_value,snapshot_value,true);
  END IF;
  RETURN jsonb_build_object(
    'contractVersion', CASE WHEN snapshot_value->>'contractVersion'='payroll-novelty-batch.v2' THEN 'payroll-novelty-export.v2' ELSE 'payroll-novelty-export.v1' END,
    'approvalEffect', 'export_only',
    'data', snapshot_value
  );
END
$$;

-- Existing public v1 signatures retain their original GRH contract.
CREATE OR REPLACE FUNCTION public.payroll_novelty_transition_v1(
  p_context jsonb,
  p_batch_id uuid,
  p_command text,
  p_expected_version integer,
  p_reason_code text,
  p_reason_reference text,
  p_idempotency uuid,
  p_command_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  required_capability text;
  context_value jsonb;
  batch_row public.payroll_novelty_batch%ROWTYPE;
  existing_event public.payroll_novelty_event%ROWTYPE;
  event_id_value bigint;
  normalized_reference text := NULLIF(btrim(COALESCE(p_reason_reference,'')), '');
  next_status text;
  prior_status text;
  event_hash_placeholder text := repeat('0', 64);
  include_nominal boolean;
BEGIN
  IF p_batch_id IS NULL
     OR p_command NOT IN ('submit','approve','reject','cancel')
     OR p_expected_version IS NULL OR p_expected_version < 1
     OR p_idempotency IS NULL OR p_idempotency::text !~
       '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR (normalized_reference IS NOT NULL AND normalized_reference !~
       '^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
     OR NOT (
       (p_command = 'submit' AND p_reason_code = 'ready_for_review'
         AND normalized_reference IS NULL)
       OR (p_command = 'approve' AND p_reason_code = 'validated_for_export'
         AND normalized_reference IS NULL)
       OR (p_command = 'reject' AND p_reason_code IN (
          'invalid_rows','unsupported_concept','duplicate_or_conflict'
        ) AND normalized_reference IS NOT NULL)
       OR (p_command = 'cancel' AND p_reason_code = 'cancelled_by_preparer'
         AND normalized_reference IS NOT NULL)
     ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  required_capability := CASE WHEN p_command IN ('submit','cancel')
    THEN 'payroll.novelty.prepare'
    ELSE 'payroll.novelty.approve'
  END;
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, required_capability
  );
  include_nominal := context_value->'capabilities' ? 'payroll.novelty.nominal.read';
  IF p_command IN ('approve','reject') AND NOT include_nominal THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.payroll_novelty_require_v1_batch_v2(context_value,p_batch_id);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    (context_value->>'tenantId') || ':' || (context_value->>'membershipId')
      || ':' || p_idempotency::text,
    0
  ));

  SELECT * INTO existing_event
  FROM public.payroll_novelty_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency
  FOR SHARE;
  IF FOUND THEN
    IF existing_event.batch_id <> p_batch_id
       OR existing_event.command <> p_command
       OR existing_event.expected_version <> p_expected_version
       OR existing_event.reason_code <> p_reason_code
       OR existing_event.reason_reference IS DISTINCT FROM normalized_reference
       OR btrim(existing_event.command_hash) <> lower(p_command_hash)
       OR existing_event.actor_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_role_key <> context_value->>'roleKey'
       OR existing_event.authority_capability_key <> required_capability
       OR existing_event.certified_binding_id <>
         (context_value->>'certifiedBindingId')::uuid
       OR existing_event.actor_session_id <> (context_value->>'actorSessionId')::uuid
       OR existing_event.actor_session_version <>
         (context_value->>'actorSessionVersion')::integer
       OR btrim(existing_event.release_sha) <> lower(context_value->>'releaseSha')
       OR NOT EXISTS (
         SELECT 1 FROM public.payroll_novelty_batch replay_batch
         WHERE replay_batch.id = existing_event.batch_id
           AND replay_batch.tenant_id = existing_event.tenant_id
           AND replay_batch.certified_binding_id =
             (context_value->>'certifiedBindingId')::uuid
       ) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_IDEMPOTENCY_REUSE' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'replayed', true,
      'data', public.payroll_novelty_event_snapshot_v1(
        existing_event.id, existing_event.tenant_id, include_nominal
      )
    );
  END IF;

  SELECT * INTO batch_row
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF batch_row.version <> p_expected_version THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  prior_status := batch_row.status;
  IF p_command IN ('submit','cancel') THEN
    IF batch_row.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
       OR batch_row.prepared_by_person_id IS DISTINCT FROM
         (context_value->>'actorPersonId')::uuid
       OR (p_command = 'submit' AND batch_row.status <> 'draft')
       OR (p_command = 'cancel' AND batch_row.status NOT IN ('draft','submitted')) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_PREPARER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF batch_row.status <> 'submitted'
       OR (context_value->>'actorPersonId') IS NULL
       OR batch_row.prepared_by_membership_id = (context_value->>'membershipId')::uuid
       OR (batch_row.prepared_by_person_id IS NOT NULL AND
         batch_row.prepared_by_person_id = (context_value->>'actorPersonId')::uuid) THEN
      RAISE EXCEPTION 'PAYROLL_NOVELTY_MAKER_CHECKER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  next_status := CASE p_command
    WHEN 'submit' THEN 'submitted'
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    ELSE 'cancelled'
  END;

  UPDATE public.payroll_novelty_batch batch SET
    status = next_status,
    version = batch.version + 1,
    approved_by_membership_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'membershipId')::uuid ELSE NULL END,
    approved_by_person_id = CASE WHEN p_command IN ('approve','reject')
      THEN (context_value->>'actorPersonId')::uuid ELSE NULL END,
    reason_code = p_reason_code,
    reason_reference = normalized_reference,
    exportable = p_command = 'approve',
    grh_mutation = false,
    payroll_calculated = false,
    payroll_posted = false
  WHERE batch.id = batch_row.id AND batch.tenant_id = batch_row.tenant_id
  RETURNING * INTO batch_row;

  INSERT INTO public.payroll_novelty_event (
    tenant_id, batch_id, certified_binding_id,
    actor_membership_id, actor_person_id, actor_role_key, authority_capability_key,
    actor_session_id, actor_session_version, release_sha,
    command, from_status, to_status, expected_version, resulting_version,
    reason_code, reason_reference, idempotency_key, command_hash,
    event_sha256, exportable, grh_mutation, payroll_calculated, payroll_posted
  ) VALUES (
    batch_row.tenant_id, batch_row.id, batch_row.certified_binding_id,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    context_value->>'roleKey', required_capability,
    (context_value->>'actorSessionId')::uuid,
    (context_value->>'actorSessionVersion')::integer,
    lower(context_value->>'releaseSha'),
    p_command, prior_status, next_status, p_expected_version, batch_row.version,
    p_reason_code, normalized_reference, p_idempotency, lower(p_command_hash),
    event_hash_placeholder, batch_row.exportable, false, false, false
  ) RETURNING id INTO event_id_value;

  RETURN jsonb_build_object(
    'replayed', false,
    'data', public.payroll_novelty_event_snapshot_v1(
      event_id_value, batch_row.tenant_id, include_nominal
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_detail_v1(
  p_context jsonb,
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  snapshot_value jsonb;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_DETAIL_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.nominal.read'
  );
  PERFORM public.payroll_novelty_require_v1_batch_v2(context_value,p_batch_id);

  SELECT public.payroll_novelty_snapshot_v1(
    batch.id, batch.tenant_id, true
  ) || jsonb_build_object(
    'allowedCommands', CASE
      WHEN batch.status = 'draft'
        AND (context_value->'capabilities' ? 'payroll.novelty.prepare')
        AND batch.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND batch.prepared_by_person_id IS NOT DISTINCT FROM
          (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('submit','cancel')
      WHEN batch.status = 'submitted'
        AND (context_value->'capabilities' ? 'payroll.novelty.prepare')
        AND batch.prepared_by_membership_id = (context_value->>'membershipId')::uuid
        AND batch.prepared_by_person_id IS NOT DISTINCT FROM
          (context_value->>'actorPersonId')::uuid
        THEN jsonb_build_array('cancel')
      WHEN batch.status = 'submitted'
        AND (context_value->'capabilities' ? 'payroll.novelty.approve')
        AND (context_value->>'employmentLinked')::boolean
        AND batch.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
        AND (batch.prepared_by_person_id IS NULL OR
          batch.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid)
        THEN jsonb_build_array('approve','reject')
      ELSE '[]'::jsonb
    END,
    'canExport', batch.status = 'approved' AND batch.exportable
      AND (context_value->'capabilities' ? 'payroll.novelty.export')
  ) INTO snapshot_value
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid;
  IF snapshot_value IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('data', snapshot_value);
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_export_v1(
  p_context jsonb,
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  snapshot_value jsonb;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_EXPORT_INVALID' USING ERRCODE = 'P0001';
  END IF;
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.export'
  );
  IF NOT (context_value->'capabilities' ? 'payroll.novelty.nominal.read') THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.payroll_novelty_require_v1_batch_v2(context_value,p_batch_id);

  SELECT public.payroll_novelty_snapshot_v1(
    batch.id, batch.tenant_id, true
  ) INTO snapshot_value
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = p_batch_id
    AND batch.tenant_id = (context_value->>'tenantId')::uuid
    AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    AND batch.status = 'approved'
    AND batch.exportable IS TRUE
    AND batch.grh_mutation IS FALSE
    AND batch.payroll_calculated IS FALSE
    AND batch.payroll_posted IS FALSE;
  IF snapshot_value IS NULL THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_NOT_EXPORTABLE' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object(
    'contractVersion', 'payroll-novelty-export.v1',
    'approvalEffect', 'export_only',
    'data', snapshot_value
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_bootstrap_v1(p_context jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  batch_list jsonb;
  event_list jsonb := '[]'::jsonb;
  has_nominal boolean;
  has_prepare boolean;
  has_approve boolean;
  has_export boolean;
  has_audit boolean;
BEGIN
  context_value := public.payroll_novelty_assert_context_v1(
    p_context, 'payroll.novelty.read'
  );
  has_nominal := context_value->'capabilities' ? 'payroll.novelty.nominal.read';
  has_prepare := context_value->'capabilities' ? 'payroll.novelty.prepare';
  has_approve := context_value->'capabilities' ? 'payroll.novelty.approve';
  has_export := context_value->'capabilities' ? 'payroll.novelty.export';
  has_audit := context_value->'capabilities' ? 'payroll.novelty.audit.read';

  SELECT COALESCE(jsonb_agg(
    public.payroll_novelty_snapshot_v1(item.id, item.tenant_id, has_nominal)
    || jsonb_build_object(
      'allowedCommands', CASE
        WHEN item.status = 'draft' AND has_prepare
          AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
          AND item.prepared_by_person_id IS NOT DISTINCT FROM
            (context_value->>'actorPersonId')::uuid
          THEN jsonb_build_array('submit','cancel')
        WHEN item.status = 'submitted' AND has_prepare
          AND item.prepared_by_membership_id = (context_value->>'membershipId')::uuid
          AND item.prepared_by_person_id IS NOT DISTINCT FROM
            (context_value->>'actorPersonId')::uuid
          THEN jsonb_build_array('cancel')
        WHEN item.status = 'submitted' AND has_approve AND has_nominal
          AND (context_value->>'employmentLinked')::boolean
          AND item.prepared_by_membership_id <> (context_value->>'membershipId')::uuid
          AND (item.prepared_by_person_id IS NULL OR
            item.prepared_by_person_id <> (context_value->>'actorPersonId')::uuid)
          THEN jsonb_build_array('approve','reject')
        ELSE '[]'::jsonb
      END,
      'canExport', item.status = 'approved' AND item.exportable
        AND has_export AND has_nominal
    ) ORDER BY item.period_month DESC, item.created_at DESC, item.id
  ), '[]'::jsonb) INTO batch_list
  FROM (
    SELECT batch.* FROM public.payroll_novelty_batch batch
    WHERE batch.contract_version='payroll-novelty-batch.v1' AND batch.tenant_id = (context_value->>'tenantId')::uuid
      AND batch.certified_binding_id = (context_value->>'certifiedBindingId')::uuid
    ORDER BY batch.period_month DESC, batch.created_at DESC, batch.id
    LIMIT 100
  ) item;

  IF has_audit THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'batchId', item.batch_id,
      'certifiedBindingId', item.certified_binding_id,
      'actorMembershipId', item.actor_membership_id,
      'actorPersonId', item.actor_person_id,
      'actorRoleKey', item.actor_role_key,
      'authorityCapabilityKey', item.authority_capability_key,
      'command', item.command,
      'fromStatus', item.from_status,
      'toStatus', item.to_status,
      'expectedVersion', item.expected_version,
      'resultingVersion', item.resulting_version,
      'reasonCode', item.reason_code,
      'reasonReference', item.reason_reference,
      'exportable', item.exportable,
      'grhMutation', item.grh_mutation,
      'payrollCalculated', item.payroll_calculated,
      'payrollPosted', item.payroll_posted,
      'eventSha256', btrim(item.event_sha256),
      'occurredAt', item.occurred_at
    ) ORDER BY item.occurred_at DESC, item.id DESC), '[]'::jsonb)
    INTO event_list
    FROM (
      SELECT event.* FROM public.payroll_novelty_event event
      JOIN public.payroll_novelty_batch audit_batch
        ON audit_batch.id = event.batch_id
       AND audit_batch.tenant_id = event.tenant_id
      WHERE audit_batch.contract_version='payroll-novelty-batch.v1' AND event.tenant_id = (context_value->>'tenantId')::uuid
        AND audit_batch.certified_binding_id =
          (context_value->>'certifiedBindingId')::uuid
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT 100
    ) item;
  END IF;

  RETURN jsonb_build_object(
    'principal', jsonb_build_object(
      'tenantId', context_value->>'tenantId',
      'membershipId', context_value->>'membershipId',
      'certifiedBindingId', context_value->>'certifiedBindingId',
      'roleKey', context_value->>'roleKey',
      'employmentLinked', (context_value->>'employmentLinked')::boolean,
      'capabilities', context_value->'capabilities'
    ),
    'feature', jsonb_build_object(
      'key', 'payroll_novelties',
      'contractVersion', 'payroll-novelty-batch.v1',
      'approvalEffect', 'export_only'
    ),
    'batches', batch_list,
    'recentEvents', event_list,
    'limits', jsonb_build_object(
      'maxRows', 500,
      'contractVersion', 'payroll-novelty-batch.v1',
      'sourceModes', jsonb_build_array('individual','bulk'),
      'payrollTypes', jsonb_build_array(
        'monthly','first_fortnight','sac','vacation','supplementary','final','other'
      ),
      'approvalEffect', 'export_only',
      'grhMutation', false,
      'payrollCalculated', false,
      'payrollPosted', false
    )
  );
END
$$;

CREATE OR REPLACE FUNCTION public.payroll_novelty_row_guard_v1()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  batch_row public.payroll_novelty_batch%ROWTYPE; ctx jsonb; fresh jsonb;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_ROWS_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO batch_row
  FROM public.payroll_novelty_batch batch
  WHERE batch.id = NEW.batch_id AND batch.tenant_id = NEW.tenant_id
  FOR UPDATE;
  IF NOT FOUND OR batch_row.status <> 'draft' THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_ROWS_LOCKED' USING ERRCODE = 'P0001';
  END IF;

  IF batch_row.contract_version='payroll-novelty-batch.v2' THEN
    SELECT jsonb_build_object('tenantId',b.tenant_id,'certifiedBindingId',b.id,'sourceDatabase',b.source_database,'sourceCompanyId',b.source_company_id) INTO ctx
    FROM public.platform_tenant_source_binding b WHERE b.id=batch_row.certified_binding_id AND b.tenant_id=batch_row.tenant_id AND b.verified AND b.source_system='GRH';
    IF ctx IS NULL OR NEW.subject_snapshot IS NULL OR NEW.native_registration_id IS NULL THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_CONTRACT_OUT_OF_BINDING'; END IF;
    fresh:=public.payroll_novelty_native_subject_v2(ctx,jsonb_build_object('contractId',NEW.employment_contract_id,'identityToken',NEW.subject_snapshot->>'identityToken','legajo',NEW.legajo_snapshot,'adjustmentMonth',NEW.adjustment_month),batch_row.period_month,true);
    IF fresh IS DISTINCT FROM NEW.subject_snapshot OR NEW.native_registration_id::text IS DISTINCT FROM fresh->>'registrationId' THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_IDENTITY_CHANGED'; END IF;
  ELSE
    IF NEW.subject_snapshot IS NOT NULL OR NEW.native_registration_id IS NOT NULL THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_CONTRACT_OUT_OF_BINDING'; END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_tenant_source_binding binding
    JOIN public.employment_contract contract
      ON contract.id = NEW.employment_contract_id
     AND contract.legacy_company_id = binding.source_company_id
     AND contract.source_system = 'GRH'
     AND contract.status = 'active'
     AND contract.legacy_legajo = NEW.legajo_snapshot
    JOIN public.source_import_batch source_batch
      ON source_batch.id = contract.source_batch_id
     AND source_batch.source_system = 'GRH'
     AND source_batch.source_database = binding.source_database
     AND source_batch.validation_state = 'published'
     AND source_batch.legacy_import_run_id IS NOT NULL
    WHERE binding.id = batch_row.certified_binding_id
      AND binding.tenant_id = batch_row.tenant_id
      AND binding.source_system = 'GRH'
      AND binding.verified IS TRUE
  ) THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_CONTRACT_OUT_OF_BINDING' USING ERRCODE = 'P0001';
  END IF;

  END IF;

  IF NEW.adjustment_month IS NOT NULL
     AND NEW.adjustment_month > batch_row.period_month THEN
    RAISE EXCEPTION 'PAYROLL_NOVELTY_ADJUSTMENT_AFTER_PERIOD' USING ERRCODE = 'P0001';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.payroll_novelty_native_rows_valid_v2(jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_subject_v2(jsonb,uuid,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_native_subject_v2(jsonb,jsonb,date,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_native_current_v2(jsonb,uuid,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_native_require_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_augment_v2(jsonb,jsonb,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_event_snapshot_v2(bigint,uuid,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_employee_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_employee_v2(jsonb,uuid) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_require_v1_batch_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_prepare_v2(jsonb,text,date,text,jsonb,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_prepare_v2(jsonb,text,date,text,jsonb,uuid,text) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_transition_v2(jsonb,uuid,text,integer,text,text,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_transition_v2(jsonb,uuid,text,integer,text,text,uuid,text) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_bootstrap_v2(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_bootstrap_v2(jsonb) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_detail_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_detail_v2(jsonb,uuid) TO municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.payroll_novelty_export_v2(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.payroll_novelty_export_v2(jsonb,uuid) TO municontrol_actions_runtime_app;
COMMENT ON COLUMN public.payroll_novelty_row.subject_snapshot IS 'Immutable native administrative provenance. No GRH source cutoff, payroll calculation or eligibility assertion.';
