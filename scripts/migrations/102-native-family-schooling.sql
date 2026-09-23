-- 102: declared native children and administrative schooling. No imported source,
-- payroll, fiscal status, canonical identity or entitlement is fabricated.
-- Apply in one transaction after the exact 099 source-consumer installation.
DO $prerequisite$
DECLARE item record; p record; c record; installed integer; x text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE'; END IF;
 SELECT count(*) INTO installed FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY['employee_family_subject_v2','employee_family_write_context_v2','employee_family_receipt_v2','employee_family_context_v2','employee_family_attempt_v2','employee_family_native_link_v2','school_certificate_native_family_v5','school_certificate_read_v5','employee_family_declare_v2']);
 FOR item IN SELECT * FROM (VALUES
 ('school_certificate_context_v1(text,uuid,integer,text,uuid,uuid,boolean,text)','7724d80c2924c0727b923909953bff96d515ae816234a58e9b196d573286b488','7724d80c2924c0727b923909953bff96d515ae816234a58e9b196d573286b488',false),
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
 ('school_certificate_native_family_v5(jsonb,uuid)','9204d4fd4350ce9f66f5544422a01453421286e7b278a349d344a22f9338e042',false),
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

ALTER TABLE public.employee_family_member ADD COLUMN IF NOT EXISTS native_registration_id uuid;
ALTER TABLE public.employee_family_member ALTER COLUMN source_batch_id DROP NOT NULL;
ALTER TABLE public.school_certificate_record ADD COLUMN IF NOT EXISTS native_registration_id uuid;
ALTER TABLE public.school_certificate_record ALTER COLUMN source_batch_id DROP NOT NULL;
ALTER TABLE public.school_certificate_record ALTER COLUMN source_database DROP NOT NULL;
ALTER TABLE public.school_certificate_record ALTER COLUMN source_cutoff DROP NOT NULL;
ALTER TABLE public.employee_family_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_family_member_event ENABLE ROW LEVEL SECURITY;
DO $constraints$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.employee_family_member'::regclass AND conname='employee_family_native_pair_ck') THEN
  ALTER TABLE public.employee_family_member ADD CONSTRAINT employee_family_native_pair_ck CHECK
   ((native_registration_id IS NULL AND source_batch_id IS NOT NULL) OR (native_registration_id IS NOT NULL AND source_batch_id IS NULL));
  ALTER TABLE public.employee_family_member ADD CONSTRAINT employee_family_native_registration_fk FOREIGN KEY(native_registration_id) REFERENCES public.native_employee_registration(id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.school_certificate_record'::regclass AND conname='school_certificate_native_pair_ck') THEN
  ALTER TABLE public.school_certificate_record ADD CONSTRAINT school_certificate_native_pair_ck CHECK
   ((native_registration_id IS NULL AND source_batch_id IS NOT NULL AND source_database IS NOT NULL AND source_cutoff IS NOT NULL)
    OR (native_registration_id IS NOT NULL AND source_batch_id IS NULL AND source_database IS NULL AND source_cutoff IS NULL AND family_kind='own'));
  ALTER TABLE public.school_certificate_record ADD CONSTRAINT school_certificate_native_registration_fk FOREIGN KEY(native_registration_id) REFERENCES public.native_employee_registration(id);
 END IF;
END $constraints$;
CREATE OR REPLACE FUNCTION public.employee_family_subject_v2(ctx jsonb,target uuid,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE origin_value text; resolved jsonb;
BEGIN
 SELECT c.source_system INTO origin_value FROM public.employment_contract c WHERE c.id=target;
 IF origin_value='GRH' THEN RETURN public.employee_family_subject_v1(ctx,target,hold_lock); END IF;
 IF origin_value IS DISTINCT FROM 'MUNICONTROL' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NOT_FOUND'; END IF;
 resolved:=public.payroll_fixed_registry_subject_by_contract_v1(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),target,hold_lock);
 RETURN resolved->'subject'||jsonb_build_object('personId',resolved->'personId','sourceBatchId',NULL);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'EMPLOYEE_FAMILY_%' THEN RAISE; END IF;
  CASE SQLERRM WHEN 'PAYROLL_FIXED_NOT_FOUND' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NOT_FOUND';
   WHEN 'PAYROLL_FIXED_IDENTITY_CHANGED' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDENTITY_CHANGED';
   WHEN 'PAYROLL_FIXED_SESSION_BUSY' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_SESSION_BUSY';
   ELSE RAISE EXCEPTION 'EMPLOYEE_FAMILY_UNAVAILABLE'; END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.employee_family_write_context_v2(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;
BEGIN
 ctx:=public.school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 IF NOT public.action_center_context_has_capability(ctx,'employee.record.propose') THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED'; END IF;
 IF p_key IS NULL OR p_key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDEMPOTENCY_KEY_INVALID'; END IF;
 -- Same key namespace as 064. Unlike its blocking acquisition, fail briefly
 -- under concurrent delivery; never weaken the actual session/SoD assertion.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('school-certificate:'||p_tenant::text||':'||(ctx->>'sourceBindingId')||':'||p_membership::text||':family:'||p_key,0))
 THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_SESSION_BUSY'; END IF;
 RETURN ctx;
END $$;

CREATE OR REPLACE FUNCTION public.employee_family_receipt_v2(m public.employee_family_member,p_duplicate boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT jsonb_build_object('version','employee-family-declare.v2','contractId',m.contract_id,'contractIdentityToken',m.contract_identity_token,
  'familyRef',jsonb_build_object('kind','own','id',m.id),'identityToken',m.identity_token,'state','declared','recordedAt',m.recorded_at,'duplicate',p_duplicate)
$$;

CREATE OR REPLACE FUNCTION public.employee_family_context_v2(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_contract uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; subject jsonb;
BEGIN
 ctx:=public.school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership);
 subject:=public.employee_family_subject_v2(ctx,p_contract,true);
 INSERT INTO public.employee_family_member_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,operation)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,'context');
 RETURN jsonb_build_object('version','employee-family-context.v2','subject',subject-'personId'-'sourceBatchId',
  'canDeclare',public.action_center_context_has_capability(ctx,'employee.record.propose'));
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'EMPLOYEE_FAMILY_%' OR SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  RAISE EXCEPTION 'EMPLOYEE_FAMILY_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION public.employee_family_attempt_v2(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; previous public.employee_family_member%ROWTYPE;
BEGIN
 ctx:=public.employee_family_write_context_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_key);
 IF p_key IS NULL OR p_key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDEMPOTENCY_KEY_INVALID'; END IF;
 SELECT * INTO previous FROM public.employee_family_member m WHERE m.tenant_id=p_tenant AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND m.recorded_by_membership_id=p_membership AND m.idempotency_key=p_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_NOT_FOUND'; END IF;
 -- Authority is current; provenance and acknowledgement belong to the original
 -- immutable operation. A later identity change cannot erase its receipt.
 INSERT INTO public.employee_family_member_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,member_id,operation)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,previous.id,'replay');
 RETURN public.employee_family_receipt_v2(previous,true);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'EMPLOYEE_FAMILY_%' OR SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  RAISE EXCEPTION 'EMPLOYEE_FAMILY_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION public.employee_family_native_link_v2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target_person uuid; is_member boolean:=TG_TABLE_NAME='employee_family_member';
BEGIN
 target_person:=CASE WHEN is_member THEN (to_jsonb(NEW)->>'employee_person_id')::uuid ELSE (to_jsonb(NEW)->>'person_id')::uuid END;
 IF NEW.native_registration_id IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.employment_contract c JOIN public.source_import_batch b ON b.id=c.source_batch_id
    JOIN public.platform_tenant_source_binding s ON s.id=NEW.source_binding_id AND s.tenant_id=NEW.tenant_id
    WHERE c.id=NEW.contract_id AND c.person_id=target_person AND c.source_system='GRH' AND c.source_batch_id=NEW.source_batch_id
     AND b.source_system='GRH' AND b.source_database=s.source_database AND c.legacy_company_id=s.source_company_id AND s.verified)
   THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_PROVENANCE_INVALID'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.native_employee_registration r JOIN public.employment_contract c ON c.id=r.contract_id
    JOIN public.platform_tenant_source_binding b ON b.id=r.source_binding_id AND b.tenant_id=r.tenant_id
    WHERE r.id=NEW.native_registration_id AND r.tenant_id=NEW.tenant_id AND r.source_binding_id=NEW.source_binding_id
     AND r.contract_id=NEW.contract_id AND r.person_id=target_person AND c.person_id=r.person_id AND c.tenant_id=r.tenant_id
     AND c.source_system='MUNICONTROL' AND c.source_batch_id IS NULL AND c.legacy_company_id=b.source_company_id
     AND b.verified AND c.source_payload#>>'{native,registrationId}'=r.id::text)
   THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_PROVENANCE_INVALID'; END IF;
  IF NOT is_member AND NOT EXISTS(SELECT 1 FROM public.employee_family_member m
    WHERE m.id::text=to_jsonb(NEW)->>'family_id' AND m.tenant_id=NEW.tenant_id AND m.source_binding_id=NEW.source_binding_id
     AND m.contract_id=NEW.contract_id AND m.employee_person_id=target_person AND m.native_registration_id=NEW.native_registration_id
     AND m.identity_token=NEW.identity_token)
   THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_PROVENANCE_INVALID'; END IF;
 END IF;
 RETURN NEW;
END $$;

-- Only native declarations. GRH remains on the exact 064/099 reader and token.
CREATE OR REPLACE FUNCTION public.school_certificate_native_family_v5(ctx jsonb,target uuid DEFAULT NULL)
RETURNS TABLE(contract_id uuid,person_id uuid,source_batch_id uuid,legajo text,employee_name text,
 family_id text,family_name text,birth_date date,family_end_date date,identity_token text,
 identity_snapshot jsonb,source_cutoff timestamptz,administrative_active boolean,
 family_kind text,valid_from date,recorded_at timestamptz,identity_review_required boolean,
 native_registration_id uuid,native_registered_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE contract_value uuid; subject jsonb;
BEGIN
 FOR contract_value IN SELECT DISTINCT m.contract_id FROM public.employee_family_member m
  JOIN public.employment_contract c ON c.id=m.contract_id AND c.person_id=m.employee_person_id
  WHERE m.tenant_id=(ctx->>'tenantId')::uuid AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid
   AND m.native_registration_id IS NOT NULL AND c.source_system='MUNICONTROL' AND c.tenant_id=m.tenant_id
   AND (target IS NULL OR c.id=target) AND (target IS NOT NULL OR c.status='active')
 LOOP
  subject:=public.employee_family_subject_v2(ctx,contract_value,true);
  RETURN QUERY SELECT m.contract_id,m.employee_person_id,NULL::uuid,subject->>'legajo',subject->>'employeeName',
   m.id::text,m.family_name,m.birth_date,m.valid_to,m.identity_token,m.identity_snapshot,NULL::timestamptz,true,
   'own'::text,m.valid_from,m.recorded_at,false,m.native_registration_id,(subject->>'registeredAt')::timestamptz
  FROM public.employee_family_member m WHERE m.contract_id=contract_value AND m.tenant_id=(ctx->>'tenantId')::uuid
   AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid AND m.employee_person_id=(subject->>'personId')::uuid
   AND m.native_registration_id=(subject->>'registrationId')::uuid AND m.contract_identity_token=subject->>'identityToken';
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.school_certificate_read_v5(
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
  base:=public.school_certificate_read_v4(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_contract_id);
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

CREATE OR REPLACE FUNCTION public.employee_family_declare_v2(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_payload jsonb,p_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; subject jsonb; previous employee_family_member%ROWTYPE; target uuid; new_id uuid:=gen_random_uuid();
 name_value text; dni_value text; birth_value date; from_value date; to_value date; request_hash text; snapshot jsonb; token text;
BEGIN
 ctx:=public.employee_family_write_context_v2(p_email,p_session,p_version,p_release,p_tenant,p_membership,p_key);
 -- Advisory serialization needs a fresh snapshot after a prior declaration commits.
 -- Reject fixed-snapshot callers rather than mutate the canonical employment row.
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_ISOLATION_UNSUPPORTED'; END IF;
 IF p_key IS NULL OR p_key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDEMPOTENCY_KEY_INVALID'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR NOT p_payload ?& ARRAY['contractId','contractIdentityToken','familyName','birthDate','dni','validFrom','validTo']
  OR p_payload-ARRAY['contractId','contractIdentityToken','familyName','birthDate','dni','validFrom','validTo']<>'{}'::jsonb
  OR EXISTS(SELECT 1 FROM jsonb_each(p_payload) e WHERE jsonb_typeof(e.value) NOT IN ('string','null'))
  OR coalesce(p_payload->>'contractId','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR coalesce(p_payload->>'contractIdentityToken','') !~ '^[a-f0-9]{64}$'
  OR coalesce(length(p_payload->>'familyName'),0) NOT BETWEEN 1 AND 180
  OR p_payload->>'familyName' ~ '[[:cntrl:]<>]' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_INVALID_PAYLOAD'; END IF;
 name_value:=normalize(regexp_replace(btrim(p_payload->>'familyName'),'[[:space:]]+',' ','g'),NFC);
 IF name_value IS DISTINCT FROM p_payload->>'familyName' OR name_value !~ '[^[:digit:][:space:][:punct:]]' COLLATE "C" THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_INVALID_PAYLOAD'; END IF;
 dni_value:=p_payload->>'dni';
 IF dni_value IS NOT NULL AND (dni_value !~ '^[0-9]{5,12}$' OR dni_value ~ '^0+$') THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_DOCUMENT_INVALID'; END IF;
 BEGIN
  IF EXISTS(SELECT 1 FROM jsonb_each_text(p_payload) e WHERE e.key IN ('birthDate','validFrom','validTo') AND e.value IS NOT NULL
   AND (e.value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR to_char(e.value::date,'YYYY-MM-DD')<>e.value OR e.value::date NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31')) THEN RAISE EXCEPTION 'invalid'; END IF;
  birth_value:=(p_payload->>'birthDate')::date; from_value:=(p_payload->>'validFrom')::date; to_value:=(p_payload->>'validTo')::date;
  IF birth_value>(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date OR to_value<from_value
   OR from_value<birth_value OR to_value<birth_value THEN RAISE EXCEPTION 'invalid'; END IF;
 EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_DATES_INVALID'; END;
 target:=(p_payload->>'contractId')::uuid;
 request_hash:=encode(digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO previous FROM employee_family_member m WHERE m.tenant_id=p_tenant AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND m.recorded_by_membership_id=p_membership AND m.idempotency_key=p_key;
 IF FOUND THEN
  IF previous.request_sha256<>request_hash THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDEMPOTENCY_REUSE'; END IF;
  INSERT INTO employee_family_member_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,member_id,operation)
  VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,previous.id,'replay');
  RETURN public.employee_family_receipt_v2(previous,true);
 END IF;
 -- New declarations alone resolve current identity; replay remains immutable.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('employee-family:'||p_tenant::text||':'||(ctx->>'sourceBindingId')||':'||target::text,0))
 THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_SESSION_BUSY'; END IF;
 subject:=public.employee_family_subject_v2(ctx,target,true);
 IF subject->>'identityToken'<>p_payload->>'contractIdentityToken' THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_IDENTITY_CHANGED'; END IF;
 -- Freeze the imported duplicate search, including inserts/refreshes, until commit.
 PERFORM public.grh_curated_source_read_lock_v1();
 LOCK TABLE grh_family,grh_catalog_rows IN SHARE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM employee_family_member m WHERE m.tenant_id=p_tenant AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid
   AND m.contract_id=target AND m.employee_person_id=(subject->>'personId')::uuid
   AND employee_family_identity_matches_v1(name_value,birth_value,dni_value,m.family_name,m.birth_date,m.dni))
 THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_DUPLICATE'; END IF;
 IF subject->>'origin' IS DISTINCT FROM 'MUNICONTROL' THEN
  IF EXISTS(SELECT 1 FROM school_certificate_current_family_v1(ctx,target) f
   WHERE employee_family_identity_matches_v1(name_value,birth_value,dni_value,f.family_name,f.birth_date,normalize_digits(f.identity_snapshot->>'dni'))) THEN
  RAISE EXCEPTION 'EMPLOYEE_FAMILY_DUPLICATE';
 END IF;
 END IF;
 snapshot:=jsonb_build_object('kind','own','id',new_id,'tenantId',p_tenant,'sourceBindingId',ctx->>'sourceBindingId',
  'contractId',target,'personId',subject->>'personId','familyName',name_value,'birthDate',birth_value,'dni',dni_value,'validFrom',from_value,'validTo',to_value);
 token:=encode(digest(convert_to(snapshot::text,'UTF8'),'sha256'),'hex');
 INSERT INTO employee_family_member(id,tenant_id,source_binding_id,contract_id,employee_person_id,source_batch_id,native_registration_id,contract_identity_token,
  family_name,name_key,birth_date,dni,valid_from,valid_to,identity_token,identity_snapshot,recorded_by_membership_id,recorded_by_session_id,idempotency_key,request_sha256)
 VALUES(new_id,p_tenant,(ctx->>'sourceBindingId')::uuid,target,(subject->>'personId')::uuid,(subject->>'sourceBatchId')::uuid,(subject->>'registrationId')::uuid,subject->>'identityToken',
  name_value,employee_family_name_key_v1(name_value),birth_value,dni_value,from_value,to_value,token,snapshot,p_membership,p_session,p_key,request_hash)
 RETURNING * INTO previous;
 INSERT INTO employee_family_member_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,member_id,operation)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,new_id,'declare');
 RETURN public.employee_family_receipt_v2(previous,false);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_SESSION_BUSY';
 WHEN unique_violation THEN RAISE EXCEPTION 'EMPLOYEE_FAMILY_DUPLICATE';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'EMPLOYEE_FAMILY_%' OR SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  RAISE EXCEPTION 'EMPLOYEE_FAMILY_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION school_certificate_family_v3(ctx jsonb,target uuid,kind text,family text,token text,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result_value jsonb; subject jsonb; native_target boolean;
BEGIN
 IF kind IS NULL OR kind NOT IN ('grh','own') OR family IS NULL OR token IS NULL OR token !~ '^[a-f0-9]{64}$' OR target IS NULL
  OR (kind='grh' AND family !~ '^[0-9]{1,20}$')
  OR (kind='own' AND family !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 SELECT c.source_system='MUNICONTROL' INTO native_target FROM public.employment_contract c WHERE c.id=target;
 IF native_target IS TRUE THEN
  IF kind<>'own' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
  subject:=public.employee_family_subject_v2(ctx,target,hold_lock);
  IF hold_lock THEN LOCK TABLE public.employee_family_member IN SHARE MODE NOWAIT; END IF;
  SELECT to_jsonb(f) INTO result_value FROM public.school_certificate_native_family_v5(ctx,target) f WHERE f.family_id=family;
  IF result_value IS NULL THEN
   IF EXISTS(SELECT 1 FROM public.employee_family_member m WHERE m.id::text=family AND m.tenant_id=(ctx->>'tenantId')::uuid
    AND m.source_binding_id=(ctx->>'sourceBindingId')::uuid AND m.contract_id=target) THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED'; END IF;
   RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND';
  END IF;
  IF result_value->>'identity_token'<>token THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED'; END IF;
  RETURN result_value;
 END IF;
 IF hold_lock THEN
  PERFORM public.grh_curated_source_read_lock_v1();
  LOCK TABLE grh_family,grh_catalog_rows,employee_family_member IN SHARE MODE NOWAIT;
  PERFORM employee_family_subject_v1(ctx,target,true);
 END IF;
 SELECT to_jsonb(f) INTO result_value FROM school_certificate_current_family_v2(ctx,target) f WHERE f.family_kind=kind AND f.family_id=family;
 IF result_value IS NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
 IF result_value->>'identity_token'<>token THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED'; END IF;
 RETURN result_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF;
  IF SQLERRM='EMPLOYEE_FAMILY_IDENTITY_CHANGED' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_CHANGED'; END IF;
  IF SQLERRM='EMPLOYEE_FAMILY_SESSION_BUSY' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY'; END IF;
  IF SQLERRM='EMPLOYEE_FAMILY_NOT_FOUND' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_NOT_FOUND'; END IF;
  RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE';
END $$;
CREATE OR REPLACE FUNCTION school_certificate_register_v3(
 p_email text,p_session uuid,p_version integer,p_release text,p_tenant uuid,p_membership uuid,p_payload jsonb,p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; f jsonb; previous school_certificate_record%ROWTYPE; contract_value uuid; kind_value text; family_value text;
 content_value bytea; issued_value date; presented_value date; expires_value date; request_hash text; latest_id uuid; expected_id uuid; new_id uuid; latest_recorded_at timestamptz;
 history_count integer; field_value text; max_length integer;
BEGIN
 ctx:=school_certificate_context_v1(p_email,p_session,p_version,p_release,p_tenant,p_membership,true,p_idempotency_key);
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY'; END IF;
 IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDEMPOTENCY_KEY_INVALID'; END IF;
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object'
  OR NOT p_payload ?& ARRAY['contractId','familyRef','identityToken','expectedCertificateId','institution','educationLevel','course','schoolYear','issuedOn','presentedOn','expiresOn','evidenceMode','paperReference','filename','contentBase64','sha256','reason']
  OR p_payload-ARRAY['contractId','familyRef','identityToken','expectedCertificateId','institution','educationLevel','course','schoolYear','issuedOn','presentedOn','expiresOn','evidenceMode','paperReference','filename','contentBase64','sha256','reason']<>'{}'::jsonb
  OR jsonb_typeof(p_payload->'familyRef') IS DISTINCT FROM 'object'
  OR NOT (p_payload->'familyRef') ?& ARRAY['kind','id'] OR (p_payload->'familyRef')-ARRAY['kind','id']<>'{}'::jsonb
  OR jsonb_typeof(p_payload#>'{familyRef,kind}') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload#>'{familyRef,id}') IS DISTINCT FROM 'string'
  OR EXISTS(SELECT 1 FROM jsonb_each(p_payload-ARRAY['familyRef','schoolYear']) e WHERE jsonb_typeof(e.value) NOT IN ('string','null'))
  OR coalesce(p_payload->>'contractId','') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
  OR coalesce(p_payload->>'identityToken','') !~ '^[a-f0-9]{64}$'
  OR (p_payload->>'expectedCertificateId' IS NOT NULL AND p_payload->>'expectedCertificateId' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
  OR (p_payload->'schoolYear'<>'null'::jsonb AND (jsonb_typeof(p_payload->'schoolYear')<>'number' OR p_payload->>'schoolYear' !~ '^(19|20)[0-9]{2}$|^2100$'))
  OR coalesce(p_payload->>'evidenceMode','') NOT IN ('pdf','paper_declared') THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 FOREACH field_value IN ARRAY ARRAY['institution','educationLevel','course','paperReference','reason'] LOOP
  max_length:=CASE field_value WHEN 'institution' THEN 180 WHEN 'educationLevel' THEN 80 WHEN 'course' THEN 100 ELSE 500 END;
  IF p_payload->>field_value IS NOT NULL AND (length(p_payload->>field_value) NOT BETWEEN CASE WHEN field_value IN ('reason','paperReference') THEN 5 ELSE 1 END AND max_length
   OR p_payload->>field_value<>btrim(p_payload->>field_value) OR p_payload->>field_value<>normalize(p_payload->>field_value,NFC)
   OR p_payload->>field_value ~ '[[:cntrl:]<>]') THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 END LOOP;
 IF p_payload->>'reason' IS NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 issued_value:=school_certificate_date_v3(p_payload->>'issuedOn');
 presented_value:=school_certificate_date_v3(p_payload->>'presentedOn',true);
 expires_value:=school_certificate_date_v3(p_payload->>'expiresOn');
 IF p_payload->>'evidenceMode'='paper_declared' THEN
  IF p_payload->>'paperReference' IS NULL OR p_payload->>'filename' IS NOT NULL OR p_payload->>'contentBase64' IS NOT NULL OR p_payload->>'sha256' IS NOT NULL THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
 ELSE
  IF p_payload->>'paperReference' IS NOT NULL OR p_payload->>'filename' IS NULL OR p_payload->>'contentBase64' IS NULL
   OR length(p_payload->>'filename') NOT BETWEEN 5 AND 180 OR p_payload->>'filename'<>btrim(p_payload->>'filename') OR lower(right(p_payload->>'filename',4))<>'.pdf'
   OR p_payload->>'filename' ~ '[[:cntrl:]/\\:*?"<>|]' OR coalesce(p_payload->>'sha256','') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_INVALID_PAYLOAD'; END IF;
  IF length(p_payload->>'contentBase64')>2796204 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_TOO_LARGE'; END IF;
  BEGIN content_value:=decode(p_payload->>'contentBase64','base64'); EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_PDF_INVALID'; END;
  IF octet_length(content_value) NOT BETWEEN 10 AND 2097152 OR substring(content_value FROM 1 FOR 5)<>decode('255044462d','hex')
   OR replace(encode(content_value,'base64'),E'\n','')<>p_payload->>'contentBase64'
   OR encode(digest(content_value,'sha256'),'hex')<>p_payload->>'sha256' THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_PDF_INVALID'; END IF;
 END IF;
 contract_value:=(p_payload->>'contractId')::uuid; kind_value:=p_payload#>>'{familyRef,kind}'; family_value:=p_payload#>>'{familyRef,id}';
 IF NOT pg_try_advisory_xact_lock(hashtextextended('school-certificate:record:v3:'||p_tenant||':'||(ctx->>'sourceBindingId')||':'||contract_value||':'||kind_value||':'||family_value||':'||(p_payload->>'identityToken'),0)) THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY'; END IF;
 f:=school_certificate_family_v3(ctx,contract_value,kind_value,family_value,p_payload->>'identityToken',true);
 request_hash:=encode(digest(convert_to(p_payload::text,'UTF8'),'sha256'),'hex');
 SELECT * INTO previous FROM school_certificate_record d WHERE d.tenant_id=p_tenant AND d.source_binding_id=(ctx->>'sourceBindingId')::uuid
  AND d.recorded_by_membership_id=p_membership AND d.idempotency_key=p_idempotency_key;
 IF FOUND THEN
  IF previous.request_sha256<>request_hash THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDEMPOTENCY_REUSE'; END IF;
  INSERT INTO school_certificate_record_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,record_id,operation,result_count)
  VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,previous.id,'replay',1);
  RETURN jsonb_build_object('version','family-schooling-register.v3','certificateId',previous.id,'duplicate',true);
 END IF;
 IF (f->>'identity_review_required')::boolean THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_IDENTITY_REVIEW_REQUIRED'; END IF;
 -- Legacy writers do not take the v3 advisory lock: serialize their inserts
 -- while selecting the latest record. Never rewrite the legacy facade.
 LOCK TABLE school_certificate IN SHARE MODE NOWAIT;
 SELECT count(*)::integer,(array_agg(r.id ORDER BY r.recorded_at DESC,r.id DESC))[1],max(r.recorded_at) INTO history_count,latest_id,latest_recorded_at FROM school_certificate_records_v3(ctx,f) r;
 expected_id:=(p_payload->>'expectedCertificateId')::uuid;
 IF latest_id IS DISTINCT FROM expected_id THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_REVISION_CONFLICT'; END IF;
 IF history_count>=5000 THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_ROW_LIMIT'; END IF;
 IF content_value IS NOT NULL THEN
  PERFORM school_certificate_storage_reserve_v1(p_tenant,p_payload->>'sha256',octet_length(content_value));
  INSERT INTO school_certificate_blob(tenant_id,sha256,content,byte_length) VALUES(p_tenant,p_payload->>'sha256',content_value,octet_length(content_value)) ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO school_certificate_record(tenant_id,source_binding_id,contract_id,person_id,source_batch_id,native_registration_id,source_database,company_id,source_legajo,
  family_kind,family_id,identity_token,identity_snapshot,source_cutoff,institution,education_level,course,school_year,issued_on,presented_on,expires_on,
  evidence_mode,paper_reference,filename,blob_sha256,reason,supersedes_id,recorded_by,recorded_by_membership_id,recorded_by_session_id,idempotency_key,request_sha256,recorded_at)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,contract_value,(f->>'person_id')::uuid,(f->>'source_batch_id')::uuid,(f->>'native_registration_id')::uuid,CASE WHEN f->>'native_registration_id' IS NULL THEN ctx->>'sourceDatabase' ELSE NULL END,(ctx->>'sourceCompanyId')::bigint,f->>'legajo',
  kind_value,family_value,p_payload->>'identityToken',f->'identity_snapshot',(f->>'source_cutoff')::timestamptz,p_payload->>'institution',p_payload->>'educationLevel',p_payload->>'course',
  (p_payload->>'schoolYear')::integer,issued_value,presented_value,expires_value,p_payload->>'evidenceMode',p_payload->>'paperReference',p_payload->>'filename',p_payload->>'sha256',
  p_payload->>'reason',latest_id,lower(btrim(p_email)),p_membership,p_session,p_idempotency_key,request_hash,
  greatest(clock_timestamp(),latest_recorded_at+interval '1 microsecond')) RETURNING id INTO new_id;
 INSERT INTO school_certificate_record_event(tenant_id,source_binding_id,actor_membership_id,actor_session_id,record_id,operation,result_count)
 VALUES(p_tenant,(ctx->>'sourceBindingId')::uuid,p_membership,p_session,new_id,'register',1);
 RETURN jsonb_build_object('version','family-schooling-register.v3','certificateId',new_id,'duplicate',false);
EXCEPTION WHEN lock_not_available OR deadlock_detected OR serialization_failure THEN RAISE EXCEPTION 'SCHOOL_CERTIFICATE_SESSION_BUSY';
 WHEN OTHERS THEN IF SQLERRM LIKE 'SCHOOL_CERTIFICATE_%' THEN RAISE; END IF; RAISE EXCEPTION 'SCHOOL_CERTIFICATE_UNAVAILABLE'; END $$;

DROP TRIGGER IF EXISTS employee_family_member_native_link_v2 ON public.employee_family_member;
CREATE TRIGGER employee_family_member_native_link_v2 BEFORE INSERT ON public.employee_family_member FOR EACH ROW EXECUTE FUNCTION public.employee_family_native_link_v2();
DROP TRIGGER IF EXISTS school_certificate_record_native_link_v2 ON public.school_certificate_record;
CREATE TRIGGER school_certificate_record_native_link_v2 BEFORE INSERT ON public.school_certificate_record FOR EACH ROW EXECUTE FUNCTION public.employee_family_native_link_v2();
REVOKE ALL ON public.employee_family_member,public.employee_family_member_event FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.employee_family_subject_v2(jsonb,uuid,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.employee_family_write_context_v2(text,uuid,integer,text,uuid,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.employee_family_receipt_v2(employee_family_member,boolean) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.employee_family_context_v2(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.employee_family_attempt_v2(text,uuid,integer,text,uuid,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.employee_family_native_link_v2() FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.school_certificate_native_family_v5(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.school_certificate_read_v5(text,uuid,integer,text,uuid,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.employee_family_declare_v2(text,uuid,integer,text,uuid,uuid,jsonb,text) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.employee_family_context_v2(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.employee_family_attempt_v2(text,uuid,integer,text,uuid,uuid,text) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.school_certificate_read_v5(text,uuid,integer,text,uuid,uuid,uuid) TO municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.employee_family_declare_v2(text,uuid,integer,text,uuid,uuid,jsonb,text) TO municontrol_actions_runtime_app;
