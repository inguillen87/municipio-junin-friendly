-- 191: set-based historical schooling read; HTTP and payload remain version5.
-- Private candidate. Apply in one owner-reviewed transaction after exact102.
-- Existing readers, authority, source identities and audit events are unchanged.
-- Rebased 2026-11-05 on the live PG17 catalogue: school_certificate_context_v1 (107) and
-- school_certificate_native_family_v5 (110) carry their 107/110 bodies; signatures unchanged.
DO $read_v6_requires_native$
BEGIN
 IF to_regprocedure('public.school_certificate_read_v5(text,uuid,integer,text,uuid,uuid,uuid)') IS NULL
 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_READ_V6_PREREQUISITE'; END IF;
END $read_v6_requires_native$;


-- Exact post102 prerequisite, copied without altering historical pins.
DO $prerequisite$
DECLARE item record; p record; c record; installed integer; x text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 SELECT count(*) INTO installed FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY['employee_family_subject_v2','employee_family_write_context_v2','employee_family_receipt_v2','employee_family_context_v2','employee_family_attempt_v2','employee_family_native_link_v2','school_certificate_native_family_v5','school_certificate_read_v5','employee_family_declare_v2']);
 FOR item IN SELECT * FROM (VALUES
 ('school_certificate_context_v1(text,uuid,integer,text,uuid,uuid,boolean,text)','40bf8d36f6ea086941a850fac4d3196d1c790268fb1d9386d225083dd64b96a4','40bf8d36f6ea086941a850fac4d3196d1c790268fb1d9386d225083dd64b96a4',false),
 ('school_certificate_current_family_v1(jsonb,uuid)','8e5b8f66f99c58fe1689e832af368fd54d3bc32809e0ddc907d894c39310c861','8e5b8f66f99c58fe1689e832af368fd54d3bc32809e0ddc907d894c39310c861',false),
 ('school_certificate_storage_capacity_v1()','c336af98a96d8e692a682a79a2a47b490a917837b54064db1b76847d73f8e375','c336af98a96d8e692a682a79a2a47b490a917837b54064db1b76847d73f8e375',false),
 ('school_certificate_storage_reserve_v1(uuid,text,integer)','f348f462206e4765c85f7fe6ea3cd4f6aa1dce5a7e5711c6f690ebf94e72e242','f348f462206e4765c85f7fe6ea3cd4f6aa1dce5a7e5711c6f690ebf94e72e242',false),
 ('school_certificate_reject_change_v1()','09276fde5e9931d4b3f56a56631a3b77e9fb043c1594315e3829b116c679f1c8','09276fde5e9931d4b3f56a56631a3b77e9fb043c1594315e3829b116c679f1c8',false),
 ('employee_family_subject_v1(jsonb,uuid,boolean)','c529e2cecbf879a4b7dce69917a5619be6e353921ee591552e2981cc336ff7d1','c529e2cecbf879a4b7dce69917a5619be6e353921ee591552e2981cc336ff7d1',false),
 ('employee_family_declare_v1(text,uuid,integer,text,uuid,uuid,jsonb,text)','f35312befb20cf0479a5d028806688f1469abb8e25bbd7c677c8c77970cfc724','f35312befb20cf0479a5d028806688f1469abb8e25bbd7c677c8c77970cfc724',true),
 ('school_certificate_current_family_v2(jsonb,uuid)','b8d344c47f589ad07463781ad1522ba708b79a47495001df7e163fa0c8fb37df','b8d344c47f589ad07463781ad1522ba708b79a47495001df7e163fa0c8fb37df',false),
 ('school_certificate_family_v3(jsonb,uuid,text,text,text,boolean)','7399536671de9f89d8e6f9b41ff576e85ba5492635328b96dc945663bd1a95df','56de0f30959b733db61e1359c2d7a03755f2d870e10e1560acd2125ec7790802',false),
 ('school_certificate_register_v3(text,uuid,integer,text,uuid,uuid,jsonb,text)','c479f204417dc5de603ecddb667bbf0c911dcda682baa9b5e897e5e87669d125','e24b10789a8821914c9e93ede0c2ee63bb6f494ab6f3e661902f38724fb85387',true),
 ('school_certificate_records_v3(jsonb,jsonb)','7e9a9a73620d39969442c245c8d8cd2f3698d1f213d1edb806875a3c95015929','7e9a9a73620d39969442c245c8d8cd2f3698d1f213d1edb806875a3c95015929',false),
 ('school_certificate_read_v3(text,uuid,integer,text,uuid,uuid,uuid)','ab8f576cffa1807c6fdcd85b252903984f82452fcbeffc270fa96cba98ed8df4','ab8f576cffa1807c6fdcd85b252903984f82452fcbeffc270fa96cba98ed8df4',true),
 ('school_certificate_history_v3(text,uuid,integer,text,uuid,uuid,uuid,text,text,text)','6a3a274ab5dd0c3ad4d31529d3e1cc6c7125a1f95d7682520e04e4b563da0908','6a3a274ab5dd0c3ad4d31529d3e1cc6c7125a1f95d7682520e04e4b563da0908',true),
 ('school_certificate_attempt_v3(text,uuid,integer,text,uuid,uuid,text)','3d86ba6427508af3d4685a936bbe4a2ffd26b94c099ba485de277b90ff8fb40f','3d86ba6427508af3d4685a936bbe4a2ffd26b94c099ba485de277b90ff8fb40f',true),
 ('school_certificate_download_v3(text,uuid,integer,text,uuid,uuid,uuid)','f3b230676d3b1d17b1c46f2afdbe93eed5cdb8b5ac0896259c18cb4936f3012f','f3b230676d3b1d17b1c46f2afdbe93eed5cdb8b5ac0896259c18cb4936f3012f',true),
 ('school_certificate_record_immutable_v3()','09276fde5e9931d4b3f56a56631a3b77e9fb043c1594315e3829b116c679f1c8','09276fde5e9931d4b3f56a56631a3b77e9fb043c1594315e3829b116c679f1c8',false),
 ('school_certificate_read_v4(text,uuid,integer,text,uuid,uuid,uuid)','005d2b345096096e42741cfd5c627796f79d45a77ead65527bdd3a8f3dd71845','005d2b345096096e42741cfd5c627796f79d45a77ead65527bdd3a8f3dd71845',true),
 ('payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)','7b490b4cc34bd45205dacf169c1fc2432c5a711fd99d6384bdc0d22db4236e48','7b490b4cc34bd45205dacf169c1fc2432c5a711fd99d6384bdc0d22db4236e48',false),
 ('grh_curated_source_read_lock_v1()','c6c79f7761d1d777862d27d5fa84dfd9a9ad5c8c12c45541ca5069631a8c2cf2','c6c79f7761d1d777862d27d5fa84dfd9a9ad5c8c12c45541ca5069631a8c2cf2',false)
 ) v(signature,before_sha,after_sha,runtime_allowed) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||item.signature);
  IF NOT FOUND OR NOT p.prosecdef OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
   OR p.proconfig IS NULL OR p.proconfig NOT IN (ARRAY['search_path=public, pg_temp'],ARRAY['search_path=pg_catalog, public, pg_temp'])
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex') <>(CASE WHEN installed=0 THEN item.before_sha ELSE item.after_sha END)
   OR (item.runtime_allowed AND NOT has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner
    AND NOT(item.runtime_allowed AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
 FOR item IN SELECT * FROM (VALUES
 ('employee_family_subject_v2(jsonb,uuid,boolean)','fa3be7c2b8d2d803a6a0ee389788a2a875c6537d22e6f02075e4f5de89bafa47',false),
 ('employee_family_write_context_v2(text,uuid,integer,text,uuid,uuid,text)','215173d9d263ddf1039e1e3946d90a02a6cf1de3b7f9fdfa962d56f325c6c507',false),
 ('employee_family_receipt_v2(employee_family_member,boolean)','1d395aa4cf4b8b330ca400b37ca733484a8141f509b58a6ce7e26177f114197f',false),
 ('employee_family_context_v2(text,uuid,integer,text,uuid,uuid,uuid)','66a8a00cd9414eebd8e05c37a7c4a912e88bb8cd4f00d70d0a9d1ab00708d40a',true),
 ('employee_family_attempt_v2(text,uuid,integer,text,uuid,uuid,text)','96044a43802904590b7752f6bee9b7e745614b4423fa056b01cf51d310a8f3cb',true),
 ('employee_family_native_link_v2()','9ababcb9e414867845ad78f63a76e0a25f50aa2f6ff81534140a1d101467ed95',false),
 ('school_certificate_native_family_v5(jsonb,uuid)','4a6051eca23e78e417505fa5537d31d3434f151e35311474151bec80cbc1c74c',false),
 ('school_certificate_read_v5(text,uuid,integer,text,uuid,uuid,uuid)','6acaf9ff8b684060602725e8832c349d23c15594366c12daec723436e4930869',true),
 ('employee_family_declare_v2(text,uuid,integer,text,uuid,uuid,jsonb,text)','8e5636c0d63d41953995f3daf35955b03a1904502adad872060564d5214c9c71',true)
 ) v(signature,body_sha,runtime_allowed) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||item.signature);
  IF NOT FOUND THEN IF installed>0 THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF; CONTINUE; END IF;
  IF NOT p.prosecdef OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user)
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>item.body_sha
   OR (item.runtime_allowed AND NOT has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner
    AND NOT(item.runtime_allowed AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
 IF installed NOT IN(0,9) THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 FOREACH x IN ARRAY ARRAY['employee_family_member','employee_family_member_event','school_certificate_record','school_certificate_record_event','native_employee_registration'] LOOP
  SELECT * INTO c FROM pg_class WHERE oid=to_regclass('public.'||x);
  IF NOT FOUND OR c.relkind<>'r' OR c.relowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user) OR c.relforcerowsecurity
   OR ((installed>0 OR x NOT IN ('employee_family_member','employee_family_member_event')) AND NOT c.relrowsecurity) OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid)
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
  THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;

 FOR item IN SELECT * FROM (VALUES
  ('employee_family_member','source_batch_id','uuid'),
  ('school_certificate_record','source_batch_id','uuid'),
  ('school_certificate_record','source_database','text'),
  ('school_certificate_record','source_cutoff','timestamp with time zone')
 ) v(tab,col,typ) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||item.tab) AND a.attname=item.col AND NOT a.attisdropped
    AND format_type(a.atttypid,a.atttypmod)=item.typ AND a.attnotnull=(installed=0)
    AND NOT EXISTS(SELECT 1 FROM pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum))
  THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
 FOREACH x IN ARRAY ARRAY['employee_family_member','school_certificate_record'] LOOP
  IF installed=0 THEN
   IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('public.'||x) AND attname='native_registration_id' AND NOT attisdropped)
   THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=to_regclass('public.'||x) AND a.attname='native_registration_id' AND NOT a.attisdropped
    AND a.atttypid='uuid'::regtype AND NOT a.attnotnull AND NOT EXISTS(SELECT 1 FROM pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum))
   OR NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=to_regclass('public.'||x)
    AND k.conname=CASE x WHEN 'employee_family_member' THEN 'employee_family_native_registration_fk' ELSE 'school_certificate_native_registration_fk' END
    AND k.contype='f' AND k.convalidated AND NOT k.condeferrable AND k.confupdtype='a' AND k.confdeltype='a' AND k.confmatchtype='s'
    AND k.confrelid='public.native_employee_registration'::regclass
    AND k.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.conrelid AND attname='native_registration_id')]::smallint[]
    AND k.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=k.confrelid AND attname='id')]::smallint[])
  THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
 FOR item IN SELECT * FROM (VALUES
  ('employee_family_member','employee_family_member_immutable','school_certificate_reject_change_v1()',27),
  ('employee_family_member','employee_family_member_no_truncate','school_certificate_reject_change_v1()',34),
  ('employee_family_member_event','employee_family_member_event_immutable','school_certificate_reject_change_v1()',27),
  ('employee_family_member_event','employee_family_member_event_no_truncate','school_certificate_reject_change_v1()',34),
  ('school_certificate_record','school_certificate_record_immutable','school_certificate_record_immutable_v3()',58),
  ('school_certificate_record_event','school_certificate_record_event_immutable','school_certificate_record_immutable_v3()',58)
 ) v(tab,name,fn,kind) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||item.tab) AND t.tgname=item.name
   AND t.tgfoid=to_regprocedure('public.'||item.fn) AND t.tgtype=item.kind AND t.tgenabled='O' AND NOT t.tgisinternal
   AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgnargs=0 AND t.tgqual IS NULL)
  THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
 IF installed>0 THEN
  FOREACH x IN ARRAY ARRAY['employee_family_member','school_certificate_record'] LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('public.'||x) AND t.tgname=x||'_native_link_v2'
    AND t.tgfoid='public.employee_family_native_link_v2()'::regprocedure AND t.tgtype=7 AND t.tgenabled='O' AND NOT t.tgisinternal
    AND NOT t.tgdeferrable AND NOT t.tginitdeferred AND t.tgnargs=0 AND t.tgqual IS NULL)
   THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
  END LOOP;
  FOR item IN SELECT * FROM (VALUES
   ('employee_family_member','employee_family_native_pair_ck','CHECK ((((native_registration_id IS NULL) AND (source_batch_id IS NOT NULL)) OR ((native_registration_id IS NOT NULL) AND (source_batch_id IS NULL))))'),
   ('school_certificate_record','school_certificate_native_pair_ck','CHECK ((((native_registration_id IS NULL) AND (source_batch_id IS NOT NULL) AND (source_database IS NOT NULL) AND (source_cutoff IS NOT NULL)) OR ((native_registration_id IS NOT NULL) AND (source_batch_id IS NULL) AND (source_database IS NULL) AND (source_cutoff IS NULL) AND (family_kind = ''own''::text))))')
  ) v(tab,name,definition) LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=to_regclass('public.'||item.tab) AND k.conname=item.name AND k.contype='c'
    AND k.convalidated AND pg_get_constraintdef(k.oid)=item.definition)
   THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
  END LOOP;
 END IF;


 FOR item IN SELECT * FROM (VALUES
  ('employee_family_subject_v2(jsonb,uuid,boolean)',ARRAY['ctx','target','hold_lock']::text[],ARRAY['jsonb','uuid','boolean']::text[],ARRAY['i','i','i']::text[],'false','jsonb','v',false,true),
  ('employee_family_write_context_v2(text,uuid,integer,text,uuid,uuid,text)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_key']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','text']::text[],ARRAY['i','i','i','i','i','i','i']::text[],NULL::text,'jsonb','v',false,true),
  ('employee_family_receipt_v2(employee_family_member,boolean)',ARRAY['m','p_duplicate']::text[],ARRAY['public.employee_family_member','boolean']::text[],ARRAY['i','i']::text[],NULL::text,'jsonb','s',false,true),
  ('employee_family_context_v2(text,uuid,integer,text,uuid,uuid,uuid)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_contract']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','uuid']::text[],ARRAY['i','i','i','i','i','i','i']::text[],NULL::text,'jsonb','v',false,true),
  ('employee_family_attempt_v2(text,uuid,integer,text,uuid,uuid,text)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_key']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','text']::text[],ARRAY['i','i','i','i','i','i','i']::text[],NULL::text,'jsonb','v',false,true),
  ('employee_family_native_link_v2()',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL::text,'trigger','v',false,true),
  ('school_certificate_native_family_v5(jsonb,uuid)',ARRAY['ctx','target','contract_id','person_id','source_batch_id','legajo','employee_name','family_id','family_name','birth_date','family_end_date','identity_token','identity_snapshot','source_cutoff','administrative_active','family_kind','valid_from','recorded_at','identity_review_required','native_registration_id','native_registered_at']::text[],ARRAY['jsonb','uuid','uuid','uuid','uuid','text','text','text','text','date','date','text','jsonb','timestamptz','boolean','text','date','timestamptz','boolean','uuid','timestamptz']::text[],ARRAY['i','i','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t']::text[],'NULL::uuid','record','v',true,true),
  ('school_certificate_read_v5(text,uuid,integer,text,uuid,uuid,uuid)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_contract_id']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','uuid']::text[],ARRAY['i','i','i','i','i','i','i']::text[],'NULL::uuid','jsonb','v',false,true),
  ('employee_family_declare_v2(text,uuid,integer,text,uuid,uuid,jsonb,text)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_payload','p_key']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','jsonb','text']::text[],ARRAY['i','i','i','i','i','i','i','i']::text[],NULL::text,'jsonb','v',false,true),
  ('school_certificate_context_v1(text,uuid,integer,text,uuid,uuid,boolean,text)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_write','p_key']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','boolean','text']::text[],ARRAY['i','i','i','i','i','i','i','i']::text[],'false, NULL::text','jsonb','v',false,false),
  ('school_certificate_current_family_v1(jsonb,uuid)',ARRAY['p_ctx','p_contract_id','contract_id','person_id','source_batch_id','legajo','employee_name','family_id','family_name','birth_date','family_end_date','identity_token','identity_snapshot','source_cutoff','administrative_active']::text[],ARRAY['jsonb','uuid','uuid','uuid','uuid','text','text','text','text','date','date','text','jsonb','timestamptz','boolean']::text[],ARRAY['i','i','t','t','t','t','t','t','t','t','t','t','t','t','t']::text[],'NULL::uuid','record','s',true,false),
  ('school_certificate_storage_capacity_v1()',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL::text,'jsonb','v',false,false),
  ('school_certificate_storage_reserve_v1(uuid,text,integer)',ARRAY['p_tenant','p_sha256','p_byte_length']::text[],ARRAY['uuid','text','integer']::text[],ARRAY['i','i','i']::text[],NULL::text,'void','v',false,false),
  ('school_certificate_reject_change_v1()',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL::text,'trigger','v',false,false),
  ('employee_family_subject_v1(jsonb,uuid,boolean)',ARRAY['ctx','target','hold_lock']::text[],ARRAY['jsonb','uuid','boolean']::text[],ARRAY['i','i','i']::text[],'false','jsonb','v',false,false),
  ('employee_family_declare_v1(text,uuid,integer,text,uuid,uuid,jsonb,text)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_payload','p_key']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','jsonb','text']::text[],ARRAY['i','i','i','i','i','i','i','i']::text[],NULL::text,'jsonb','v',false,false),
  ('school_certificate_current_family_v2(jsonb,uuid)',ARRAY['ctx','target','contract_id','person_id','source_batch_id','legajo','employee_name','family_id','family_name','birth_date','family_end_date','identity_token','identity_snapshot','source_cutoff','administrative_active','family_kind','valid_from','recorded_at','identity_review_required']::text[],ARRAY['jsonb','uuid','uuid','uuid','uuid','text','text','text','text','date','date','text','jsonb','timestamptz','boolean','text','date','timestamptz','boolean']::text[],ARRAY['i','i','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t']::text[],'NULL::uuid','record','s',true,false),
  ('school_certificate_family_v3(jsonb,uuid,text,text,text,boolean)',ARRAY['ctx','target','kind','family','token','hold_lock']::text[],ARRAY['jsonb','uuid','text','text','text','boolean']::text[],ARRAY['i','i','i','i','i','i']::text[],'false','jsonb','v',false,false),
  ('school_certificate_register_v3(text,uuid,integer,text,uuid,uuid,jsonb,text)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_payload','p_idempotency_key']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','jsonb','text']::text[],ARRAY['i','i','i','i','i','i','i','i']::text[],NULL::text,'jsonb','v',false,false),
  ('school_certificate_records_v3(jsonb,jsonb)',ARRAY['ctx','f','recorded_at','id','certificate']::text[],ARRAY['jsonb','jsonb','timestamptz','uuid','jsonb']::text[],ARRAY['i','i','t','t','t']::text[],NULL::text,'record','s',true,false),
  ('school_certificate_read_v3(text,uuid,integer,text,uuid,uuid,uuid)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_contract_id']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','uuid']::text[],ARRAY['i','i','i','i','i','i','i']::text[],'NULL::uuid','jsonb','v',false,false),
  ('school_certificate_history_v3(text,uuid,integer,text,uuid,uuid,uuid,text,text,text)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_contract_id','p_family_kind','p_family_id','p_identity_token']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','uuid','text','text','text']::text[],ARRAY['i','i','i','i','i','i','i','i','i','i']::text[],NULL::text,'jsonb','v',false,false),
  ('school_certificate_attempt_v3(text,uuid,integer,text,uuid,uuid,text)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_idempotency_key']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','text']::text[],ARRAY['i','i','i','i','i','i','i']::text[],NULL::text,'jsonb','v',false,false),
  ('school_certificate_download_v3(text,uuid,integer,text,uuid,uuid,uuid)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_certificate_id']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','uuid']::text[],ARRAY['i','i','i','i','i','i','i']::text[],NULL::text,'jsonb','v',false,false),
  ('school_certificate_record_immutable_v3()',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],NULL::text,'trigger','v',false,false),
  ('school_certificate_read_v4(text,uuid,integer,text,uuid,uuid,uuid)',ARRAY['p_email','p_session','p_version','p_release','p_tenant','p_membership','p_contract_id']::text[],ARRAY['text','uuid','integer','text','uuid','uuid','uuid']::text[],ARRAY['i','i','i','i','i','i','i']::text[],'NULL::uuid','jsonb','v',false,false),
  ('payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)',ARRAY['ctx','p_contract','hold_lock']::text[],ARRAY['jsonb','uuid','boolean']::text[],ARRAY['i','i','i']::text[],'false','jsonb','v',false,false)
 ) v(signature,arg_names,arg_types,arg_modes,defaults_text,return_type,volatility,returns_set,is_new) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||item.signature);
  IF NOT FOUND AND installed=0 AND item.is_new THEN CONTINUE; END IF;
  IF NOT FOUND OR p.prokind<>'f' OR p.provariadic<>0 OR p.proisstrict OR p.proparallel<>'u'
   OR p.prorettype<>item.return_type::regtype OR p.proretset IS DISTINCT FROM item.returns_set
   OR p.provolatile::text<>item.volatility OR coalesce(p.proargnames,ARRAY[]::text[])<>item.arg_names
   OR ARRAY(SELECT unnest(coalesce(p.proallargtypes,p.proargtypes::oid[])))<>ARRAY(SELECT value::regtype::oid FROM unnest(item.arg_types) value)
   OR coalesce(p.proargmodes,array_fill('i'::"char",ARRAY[p.pronargs]))::text[]<>item.arg_modes
   OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM item.defaults_text
  THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
END $prerequisite$;

DO $read_v6_source_helpers$
DECLARE item jsonb; p record; installed integer;
BEGIN
 FOR item IN SELECT value FROM jsonb_array_elements($pins$[{"name":"school_certificate_source_identity_v4","signature":"public.school_certificate_source_identity_v4(jsonb)","sha256":"2f31707ca9a2c288b276a119cd20d8f404d75141ffd90340cd04b34518304c2d","argNames":["f"],"argTypes":["jsonb"],"argModes":["i"],"defaults":null,"returnType":"text","volatility":"i","returnsSet":false,"securityDefiner":false,"language":"sql","searchPaths":[["search_path=pg_catalog, public, pg_temp"]],"runtimeAllowed":false},{"name":"school_certificate_source_field_v4","signature":"public.school_certificate_source_field_v4(jsonb,text)","sha256":"b49961f29007e588d8e8b134fed415468cc5d0f83d5eacb1f7d4fc61bb6c033c","argNames":["fields","key"],"argTypes":["jsonb","text"],"argModes":["i","i"],"defaults":null,"returnType":"jsonb","volatility":"i","returnsSet":false,"securityDefiner":false,"language":"plpgsql","searchPaths":[["search_path=pg_catalog, public, pg_temp"]],"runtimeAllowed":false}]$pins$::jsonb) LOOP
  SELECT f.*,l.lanname INTO p FROM pg_proc f JOIN pg_language l ON l.oid=f.prolang WHERE f.oid=to_regprocedure(item->>'signature');
  IF NOT FOUND THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_READ_V6_PREREQUISITE'; END IF;
  IF p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user) OR p.prokind<>'f' OR p.provariadic<>0 OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
   OR p.prosecdef IS DISTINCT FROM (item->>'securityDefiner')::boolean OR p.proretset IS DISTINCT FROM (item->>'returnsSet')::boolean
   OR p.provolatile::text<>item->>'volatility' OR p.lanname<>item->>'language' OR p.prorettype<>(item->>'returnType')::regtype
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'searchPaths') config WHERE config=to_jsonb(p.proconfig))
   OR coalesce(p.proargnames,ARRAY[]::text[])<>ARRAY(SELECT jsonb_array_elements_text(item->'argNames'))
   OR ARRAY(SELECT unnest(coalesce(p.proallargtypes,p.proargtypes::oid[])))<>ARRAY(SELECT value::regtype::oid FROM jsonb_array_elements_text(item->'argTypes') t(value))
   OR coalesce(p.proargmodes,array_fill('i'::"char",ARRAY[p.pronargs]))::text[]<>ARRAY(SELECT jsonb_array_elements_text(item->'argModes'))
   OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM item->>'defaults'
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>item->>'sha256'
   OR ((item->>'runtimeAllowed')::boolean AND NOT has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner
    AND NOT((item->>'runtimeAllowed')::boolean AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_READ_V6_PREREQUISITE'; END IF;
 END LOOP;
END $read_v6_source_helpers$;

DO $read_v6_existing_targets$
DECLARE item jsonb; p record; installed integer;
BEGIN
 SELECT count(*) INTO installed FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY['school_certificate_read_source_v6','school_certificate_read_v6']);
 IF installed NOT IN(0,2) THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_READ_V6_PREREQUISITE'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements($pins$[{"name":"school_certificate_read_source_v6","signature":"public.school_certificate_read_source_v6(text,uuid,integer,text,uuid,uuid,uuid)","sha256":"581ee15f2dcd49d824b87c6399c4a4bc8c05e0d7ab459aa97907162d30c770f2","argNames":["p_email","p_session","p_version","p_release","p_tenant","p_membership","p_contract_id"],"argTypes":["text","uuid","integer","text","uuid","uuid","uuid"],"argModes":["i","i","i","i","i","i","i"],"defaults":"NULL::uuid","returnType":"jsonb","volatility":"v","returnsSet":false,"securityDefiner":true,"language":"plpgsql","searchPaths":[["search_path=pg_catalog, public, pg_temp"]],"runtimeAllowed":false},{"name":"school_certificate_read_v6","signature":"public.school_certificate_read_v6(text,uuid,integer,text,uuid,uuid,uuid)","sha256":"a2206e89dd9051cd3e6e77ac1a2a03ebfa94dcee83a1c36ed3a875aaacf47dcf","argNames":["p_email","p_session","p_version","p_release","p_tenant","p_membership","p_contract_id"],"argTypes":["text","uuid","integer","text","uuid","uuid","uuid"],"argModes":["i","i","i","i","i","i","i"],"defaults":"NULL::uuid","returnType":"jsonb","volatility":"v","returnsSet":false,"securityDefiner":true,"language":"plpgsql","searchPaths":[["search_path=pg_catalog, public, pg_temp"]],"runtimeAllowed":true}]$pins$::jsonb) LOOP
  SELECT f.*,l.lanname INTO p FROM pg_proc f JOIN pg_language l ON l.oid=f.prolang WHERE f.oid=to_regprocedure(item->>'signature');
  IF NOT FOUND THEN IF installed<>0 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_READ_V6_PREREQUISITE'; END IF; CONTINUE; END IF;
  IF p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user) OR p.prokind<>'f' OR p.provariadic<>0 OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
   OR p.prosecdef IS DISTINCT FROM (item->>'securityDefiner')::boolean OR p.proretset IS DISTINCT FROM (item->>'returnsSet')::boolean
   OR p.provolatile::text<>item->>'volatility' OR p.lanname<>item->>'language' OR p.prorettype<>(item->>'returnType')::regtype
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'searchPaths') config WHERE config=to_jsonb(p.proconfig))
   OR coalesce(p.proargnames,ARRAY[]::text[])<>ARRAY(SELECT jsonb_array_elements_text(item->'argNames'))
   OR ARRAY(SELECT unnest(coalesce(p.proallargtypes,p.proargtypes::oid[])))<>ARRAY(SELECT value::regtype::oid FROM jsonb_array_elements_text(item->'argTypes') t(value))
   OR coalesce(p.proargmodes,array_fill('i'::"char",ARRAY[p.pronargs]))::text[]<>ARRAY(SELECT jsonb_array_elements_text(item->'argModes'))
   OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM item->>'defaults'
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>item->>'sha256'
   OR ((item->>'runtimeAllowed')::boolean AND NOT has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner
    AND NOT((item->>'runtimeAllowed')::boolean AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_READ_V6_PREREQUISITE'; END IF;
 END LOOP;
END $read_v6_existing_targets$;

CREATE OR REPLACE FUNCTION public.school_certificate_read_source_v6(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_contract_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; base jsonb; items jsonb; projected_count integer;
BEGIN
 ctx:=public.school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 -- Keep v4's locked cohort and its v3 call, including the original read event.
 PERFORM public.grh_curated_source_read_lock_v1();
 LOCK TABLE public.platform_tenant_source_binding,public.tenant_identity_policy,public.source_import_batch,public.employment_contract,public.person_identity,
  public.employment_status_snapshot,public.grh_family,public.grh_catalog_rows,public.employee_family_member,public.school_certificate_source_recovery,public.school_certificate_source_date IN SHARE MODE NOWAIT;
 base:=public.school_certificate_read_v3(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_contract_id);
 WITH base_rows AS MATERIALIZED (
  SELECT r.value AS item,r.ordinality AS ordinal,(r.value->>'contractId')::uuid AS contract_id,
   CASE WHEN r.value#>>'{familyRef,kind}'='grh' THEN (r.value#>>'{familyRef,id}')::bigint ELSE NULL END AS family_id
  FROM jsonb_array_elements(base->'rows') WITH ORDINALITY AS r(value,ordinality)
 ), family_keys AS MATERIALIZED (
  SELECT DISTINCT contract_id,family_id FROM base_rows WHERE family_id IS NOT NULL
 ), recoveries AS MATERIALIZED (
  SELECT k.contract_id,k.family_id,h.source_sha256,h.source_import_run_id,h.source_batch_id,h.source_declared_cutoff,h.loaded_at,
   d.company_id,d.legajo,d.identity_sha256,d.source_fields,b.source_cutoff
  FROM family_keys k
  JOIN public.employment_contract c ON c.id=k.contract_id AND c.source_system='GRH'
  JOIN public.source_import_batch b ON b.id=c.source_batch_id AND b.validation_state='published'
  JOIN public.school_certificate_source_recovery h ON h.source_batch_id=b.id
   AND h.tenant_id=p_tenant AND h.source_binding_id=(ctx->>'sourceBindingId')::uuid
   AND lower(b.source_sha256)=h.source_sha256 AND b.legacy_import_run_id=h.source_import_run_id
   AND b.source_cutoff=(h.source_declared_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires')
  JOIN public.school_certificate_source_date d ON d.recovery_id=h.id AND d.family_id=k.family_id
   AND d.company_id=c.legacy_company_id AND d.legajo=c.legacy_legajo
 ), coordinates AS MATERIALIZED (
  SELECT DISTINCT family_id,company_id,legajo,source_import_run_id FROM recoveries
 ), source_cohorts AS MATERIALIZED (
  SELECT DISTINCT source_import_run_id,company_id FROM recoveries
 ), source_pool AS MATERIALIZED (
  SELECT f.* FROM public.grh_source_family_v1 f
  WHERE f.vinculo_code='2' AND EXISTS(
   SELECT 1 FROM source_cohorts c WHERE c.company_id=f.company_id
    AND c.source_import_run_id=f.import_run_id)
 ), source_family AS MATERIALIZED (
  SELECT f.* FROM source_pool f
  WHERE f.vinculo_code='2' AND EXISTS(
   SELECT 1 FROM coordinates c WHERE c.family_id=f.family_id AND c.company_id=f.company_id
    AND c.legajo=f.legajo AND c.source_import_run_id=f.import_run_id)
 ), identities AS MATERIALIZED (
  SELECT f.family_id,f.company_id,f.legajo,f.import_run_id,
   public.school_certificate_source_identity_v4(to_jsonb(f)) AS identity_sha256
  FROM source_family f
 ), matched AS MATERIALIZED (
  SELECT r.* FROM recoveries r JOIN identities f ON f.family_id=r.family_id AND f.company_id=r.company_id
   AND f.legajo=r.legajo AND f.import_run_id=r.source_import_run_id AND f.identity_sha256=r.identity_sha256
 ), fields AS MATERIALIZED (
  SELECT m.*,public.school_certificate_source_field_v4(m.source_fields,'PRES_14') AS presentation,
   public.school_certificate_source_field_v4(m.source_fields,'VENC_14') AS expiry FROM matched m
 ), source_dates AS MATERIALIZED (
  SELECT f.contract_id,f.family_id,jsonb_build_object(
   'presentedOn',f.presentation->'date','expiresOn',f.expiry->'date',
   'presentationState',f.presentation->>'state','expiryState',f.expiry->>'state',
   'sourceSystem','GRH','sourceTable','familia','sourceKey',f.family_id::text,
   'sourceSha256',f.source_sha256,'sourceImportRunId',f.source_import_run_id,'sourceBatchId',f.source_batch_id,
   'sourceCutoff',f.source_cutoff,'sourceDeclaredCutoff',to_char(f.source_declared_cutoff,'YYYY-MM-DD"T"HH24:MI:SS'),
   'loadedAt',f.loaded_at,'reviewState','historical_unreviewed','documentAvailable',false) AS source
  FROM fields f
 )
 SELECT count(*)::integer,coalesce(jsonb_agg(b.item||jsonb_build_object('sourceSchooling',s.source,'effectiveDates',
  CASE WHEN b.item->'certificate'<>'null'::jsonb THEN jsonb_build_object('origin','manual','presentedOn',b.item#>'{certificate,presentedOn}','expiresOn',b.item#>'{certificate,expiresOn}')
   WHEN s.source IS NOT NULL THEN jsonb_build_object('origin','grh_source','presentedOn',s.source->'presentedOn','expiresOn',s.source->'expiresOn')
   ELSE jsonb_build_object('origin','none','presentedOn',NULL,'expiresOn',NULL) END) ORDER BY b.ordinal),'[]'::jsonb)
 INTO projected_count,items FROM base_rows b
 LEFT JOIN source_dates s ON s.contract_id=b.contract_id AND s.family_id=b.family_id;
 -- Never hide duplicate matches or lose a base row while joining its evidence.
 IF projected_count<>jsonb_array_length(base->'rows') THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_CONTRACT_DRIFT'; END IF;
 RETURN base||jsonb_build_object('version','family-schooling.v4','rows',items);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF; RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE'; END 
$$;

CREATE OR REPLACE FUNCTION public.school_certificate_read_v6(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_contract_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; base jsonb; items jsonb; native_items jsonb; total integer; storage jsonb; subject jsonb;
 native_target boolean:=false;
BEGIN
 ctx:=public.school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 -- One locked cohort for the imported projection and the local registration.
 PERFORM public.grh_curated_source_read_lock_v1();
 LOCK TABLE public.platform_tenant_source_binding,public.tenant_identity_policy,public.employment_contract,public.person_identity,
  public.native_employee_registration,public.employee_family_member,public.school_certificate,public.school_certificate_record IN SHARE MODE NOWAIT;
 IF p_contract_id IS NOT NULL THEN
  subject:=public.employee_family_subject_v2(ctx,p_contract_id,true);
  native_target:=subject->>'origin'='MUNICONTROL';
 END IF;
 IF native_target IS TRUE THEN
  storage:=public.school_certificate_storage_capacity_v1();
  base:=jsonb_build_object('version','family-schooling.v5','rows','[]'::jsonb,
   'canRegister',public.action_center_context_has_capability(ctx,'employee.record.propose'),
   'storage',jsonb_build_object('mode',storage->>'mode','remainingBytes',(storage->>'remainingBytes')::bigint,'usedBytes',(storage->>'usedBytes')::bigint,'capacityBytes',(storage->>'capacityBytes')::bigint),
   'scope',jsonb_build_object('cohort','contract_children','sourceCutoffFrom',NULL,'sourceCutoffTo',NULL,
    'currentCensusCertified',false,'payrollEligibilityCertified',false,'unresolvedFamilyRows',0));
 ELSE
  base:=public.school_certificate_read_source_v6(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_contract_id);
 END IF;
 SELECT coalesce(jsonb_agg(r||jsonb_build_object('employeeOrigin','GRH','nativeRegistrationId',NULL,'nativeRegisteredAt',NULL)),'[]'::jsonb)
 INTO items FROM jsonb_array_elements(base->'rows') r;
 IF p_contract_id IS NULL OR native_target IS TRUE THEN
  WITH families AS MATERIALIZED (SELECT * FROM public.school_certificate_native_family_v5(ctx,p_contract_id) LIMIT 5001),
  decorated AS MATERIALIZED (
   SELECT f.*,h.history_count,h.cert FROM families f LEFT JOIN LATERAL (
    SELECT count(*)::integer history_count,(jsonb_agg(r.certificate ORDER BY r.recorded_at DESC,r.id DESC))->0 cert
     FROM public.school_certificate_records_v3(ctx,to_jsonb(f)) r
   ) h ON true
  )
  SELECT count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('contractId',f.contract_id,'legajo',f.legajo,'employeeName',f.employee_name,
    'familyRef',jsonb_build_object('kind','own','id',f.family_id),'familyName',f.family_name,'birthDate',to_char(f.birth_date,'YYYY-MM-DD'),
    'familyEndDate',to_char(f.family_end_date,'YYYY-MM-DD'),'validFrom',to_char(f.valid_from,'YYYY-MM-DD'),'familyRecordedAt',f.recorded_at,
    'declarationState','declared','identityReviewRequired',f.identity_review_required,'identityToken',f.identity_token,'sourceCutoff',NULL,
    'administrativeActive',f.administrative_active,'certificate',f.cert,'historyCount',f.history_count,'sourceSchooling',NULL,
    'effectiveDates',jsonb_build_object('origin',CASE WHEN f.cert IS NULL THEN 'none' ELSE 'manual' END,'presentedOn',f.cert->'presentedOn','expiresOn',f.cert->'expiresOn'),
    'employeeOrigin','MUNICONTROL','nativeRegistrationId',f.native_registration_id,'nativeRegisteredAt',f.native_registered_at)),'[]'::jsonb)
  INTO total,native_items FROM decorated f;
  IF jsonb_array_length(items)+total>5000 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_ROW_LIMIT'; END IF;
  items:=items||native_items;
 END IF;
 SELECT coalesce(jsonb_agg(r ORDER BY length(r->>'legajo'),r->>'legajo',r->>'contractId',r#>>'{familyRef,kind}',r#>>'{familyRef,id}'),'[]'::jsonb)
 INTO items FROM jsonb_array_elements(items) r;
 INSERT INTO public.school_certificate_record_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,'read',jsonb_array_length(items));
 RETURN base||jsonb_build_object('version','family-schooling.v5','rows',items);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  IF SQLERRM='EMPLOYEE_FAMILY_NOT_FOUND' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
  IF SQLERRM='EMPLOYEE_FAMILY_IDENTITY_CHANGED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED'; END IF;
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE';
END $$;

REVOKE ALL ON FUNCTION public.school_certificate_read_source_v6(text,uuid,integer,text,uuid,uuid,uuid),public.school_certificate_read_v6(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;

GRANT EXECUTE ON FUNCTION public.school_certificate_read_v6(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;

DO $read_v6_installed_targets$
DECLARE item jsonb; p record; installed integer;
BEGIN
 SELECT count(*) INTO installed FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY['school_certificate_read_source_v6','school_certificate_read_v6']);
 IF installed NOT IN(2) THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_READ_V6_PREREQUISITE'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements($pins$[{"name":"school_certificate_read_source_v6","signature":"public.school_certificate_read_source_v6(text,uuid,integer,text,uuid,uuid,uuid)","sha256":"581ee15f2dcd49d824b87c6399c4a4bc8c05e0d7ab459aa97907162d30c770f2","argNames":["p_email","p_session","p_version","p_release","p_tenant","p_membership","p_contract_id"],"argTypes":["text","uuid","integer","text","uuid","uuid","uuid"],"argModes":["i","i","i","i","i","i","i"],"defaults":"NULL::uuid","returnType":"jsonb","volatility":"v","returnsSet":false,"securityDefiner":true,"language":"plpgsql","searchPaths":[["search_path=pg_catalog, public, pg_temp"]],"runtimeAllowed":false},{"name":"school_certificate_read_v6","signature":"public.school_certificate_read_v6(text,uuid,integer,text,uuid,uuid,uuid)","sha256":"a2206e89dd9051cd3e6e77ac1a2a03ebfa94dcee83a1c36ed3a875aaacf47dcf","argNames":["p_email","p_session","p_version","p_release","p_tenant","p_membership","p_contract_id"],"argTypes":["text","uuid","integer","text","uuid","uuid","uuid"],"argModes":["i","i","i","i","i","i","i"],"defaults":"NULL::uuid","returnType":"jsonb","volatility":"v","returnsSet":false,"securityDefiner":true,"language":"plpgsql","searchPaths":[["search_path=pg_catalog, public, pg_temp"]],"runtimeAllowed":true}]$pins$::jsonb) LOOP
  SELECT f.*,l.lanname INTO p FROM pg_proc f JOIN pg_language l ON l.oid=f.prolang WHERE f.oid=to_regprocedure(item->>'signature');
  IF NOT FOUND THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_READ_V6_PREREQUISITE'; END IF;
  IF p.proowner<>(SELECT oid FROM pg_roles WHERE rolname=current_user) OR p.prokind<>'f' OR p.provariadic<>0 OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
   OR p.prosecdef IS DISTINCT FROM (item->>'securityDefiner')::boolean OR p.proretset IS DISTINCT FROM (item->>'returnsSet')::boolean
   OR p.provolatile::text<>item->>'volatility' OR p.lanname<>item->>'language' OR p.prorettype<>(item->>'returnType')::regtype
   OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(item->'searchPaths') config WHERE config=to_jsonb(p.proconfig))
   OR coalesce(p.proargnames,ARRAY[]::text[])<>ARRAY(SELECT jsonb_array_elements_text(item->'argNames'))
   OR ARRAY(SELECT unnest(coalesce(p.proallargtypes,p.proargtypes::oid[])))<>ARRAY(SELECT value::regtype::oid FROM jsonb_array_elements_text(item->'argTypes') t(value))
   OR coalesce(p.proargmodes,array_fill('i'::"char",ARRAY[p.pronargs]))::text[]<>ARRAY(SELECT jsonb_array_elements_text(item->'argModes'))
   OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM item->>'defaults'
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>item->>'sha256'
   OR ((item->>'runtimeAllowed')::boolean AND NOT has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner
    AND NOT((item->>'runtimeAllowed')::boolean AND a.grantee=(SELECT oid FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_READ_V6_PREREQUISITE'; END IF;
 END LOOP;
END $read_v6_installed_targets$;
