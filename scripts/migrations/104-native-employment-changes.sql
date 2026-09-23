-- Current administrative correction of native employment framing only.
-- Install atomically. No retrospective/future effect, identity or payroll mutation.
-- BEGIN PREREQUISITE_GUARD
DO $prerequisite$
DECLARE installed boolean; p pg_proc; x record; actual_shape jsonb;
BEGIN
 -- Exact unchanged103 schema/functions/IAM are prerequisites, on first install and rerun.

DECLARE x record; p pg_proc; installed boolean; actual_shape jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND NOT rolsuper AND NOT rolbypassrls)
 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 installed:=to_regclass('public.native_employment_catalog_proposal') IS NOT NULL;
 IF installed IS DISTINCT FROM (to_regclass('public.native_employment_catalog_review') IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 FOR x IN SELECT * FROM (VALUES
 ('public.native_employee_catalog_v1(jsonb)','bfa55ea106272fadf4655997d5a29fc57cee47cff079b1ac2672732aa579826d','74a85eda0b047c1728d6479627fc04c23d5ac01ac97065650715480ab13657dc'),
 ('public.native_employee_create_v1(jsonb,jsonb,text,uuid)','d9605cd9a60364798856e78a91be946f441232244c073bf19d1bacbbc8444744','8fac07fa37367cd2c4a2aa25dccb7b145fc4eafe934c6cd86e12f5081dec7261')
 ) v(signature,before_sha,after_sha) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x.signature);
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR NOT p.prosecdef OR p.prorettype<>'jsonb'::regtype
   OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp'] OR p.prokind<>'f'
   OR p.proretset OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u' OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL OR p.pronargdefaults<>0
   OR p.proargnames IS DISTINCT FROM (CASE WHEN x.signature LIKE '%native_employee_create_v1%' THEN ARRAY['p','d','catalog_version','k'] ELSE ARRAY['ctx'] END)
   OR p.provolatile<>(CASE WHEN x.signature LIKE '%native_employee_create_v1%' THEN 'v' ELSE 's' END)
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>(CASE WHEN installed THEN x.after_sha ELSE x.before_sha END)
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 OR (a.grantee<>p.proowner AND (a.grantee<>'municontrol_actions_runtime_app'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable)))
   OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS DISTINCT FROM (x.signature LIKE '%native_employee_create_v1%')
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 END LOOP;
 -- BEGIN OWN_FUNCTION_PINS
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_employment_catalog_%')<>(CASE WHEN installed THEN 14 ELSE 0 END) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 IF installed THEN FOR x IN SELECT * FROM (VALUES
 ('native_employment_catalog_immutable_v1()','f25cf9cb32ee95dae25032fd7b1e5c2f1666c2d24b3e3bb9a5cb16a57dad113c',false,'trigger','v',ARRAY[]::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_context_v1(jsonb,text)','37d7be04b2f5f3c5b5eb13ad7fc824e8823c7da44bfe45750f617961a79b5798',false,'jsonb','v',ARRAY['p','required_capability']::text[],'NULL::text','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_lock_v1(jsonb)','f3e2c90803904b6e7582e0f12e36187b79056d5d04afd3165f1b36d12e2f7529',false,'void','v',ARRAY['ctx']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_scope_v1(jsonb)','42d8db2d8ed15baea9cce5e34751938471e132a048d8ad3358f80f52d46a64b0',false,'text','i',ARRAY['ctx']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_items_v1(jsonb)','89524aaf57c46d3def1c4e8ff0b4e31bf218b1a7b676dcfe22663ee812924141',false,'jsonb','i',ARRAY['raw_items']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_capacity_v1(integer)','d0be23b2b5f275b9ba91179bc2f303cf6828c33b5007b01cb68dc225512cb6cf',false,'void','v',ARRAY['extra_bytes']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_replay_v1(jsonb,uuid,text,text)','ef00e451a55f379e9cdb191d8958992dea0f152395216f2ebced04d375acbfde',false,'jsonb','s',ARRAY['ctx','k','command_name','fingerprint']::text[],'NULL::text, NULL::text','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_can_review_v1(jsonb,public.native_employment_catalog_proposal)','91dd8b1bc84772d07e426ac9e0e5501ee811e7e1e4404961bf0b6a4bc6320a9e',false,'boolean','s',ARRAY['ctx','p']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_bootstrap_v1(jsonb)','a7134c8a172a514f31883bc2b5eae7412d49c85c023ea970007a90c080f79030',true,'jsonb','v',ARRAY['ctx']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_proposal_v1(jsonb,uuid)','04cbc68c1f7723dd599819c18f2d92183be0833cf1424c12090c23eaa10fb5e7',true,'jsonb','v',ARRAY['ctx','id']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_propose_v1(jsonb,jsonb,uuid)','7d87f8b5d3cf3a16bed4177428b86b59d59d3e68ed006f2bbe28fc1f68105a2d',true,'jsonb','v',ARRAY['ctx','body','key']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_review_v1(jsonb,jsonb,uuid)','c4f9a03a18f624f4296b1504e4f130e02cabaa05fcb8ea2e07a60b79160ec3a8',true,'jsonb','v',ARRAY['ctx','body','key']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_attempt_v1(jsonb,uuid)','4403f8deca35f7f9a599a1be9a23b0bbc4e0d32cece18f502559755ef99f5fe7',true,'jsonb','v',ARRAY['ctx','key']::text[],'','search_path=pg_catalog, public, pg_temp'),
 ('native_employment_catalog_grh_v1(jsonb)','bfa55ea106272fadf4655997d5a29fc57cee47cff079b1ac2672732aa579826d',false,'jsonb','s',ARRAY['ctx']::text[],'','search_path=public, pg_temp')
 ) v(signature,body_sha,runtime_allowed,result_type,volatility,arg_names,defaults_text,config_value) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||x.signature);
  IF NOT FOUND THEN IF installed THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF; CONTINUE; END IF;
  IF NOT installed OR p.proowner<>current_user::regrole OR NOT p.prosecdef OR p.prokind<>'f' OR p.proretset OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
   OR p.prorettype<>x.result_type::regtype OR p.provolatile<>x.volatility OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL
   OR coalesce(p.proargnames,ARRAY[]::text[]) IS DISTINCT FROM x.arg_names OR coalesce(pg_get_expr(p.proargdefaults,0),'')<>x.defaults_text
   OR p.proconfig IS DISTINCT FROM ARRAY[x.config_value]
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>x.body_sha
   OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS DISTINCT FROM x.runtime_allowed
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND NOT(x.runtime_allowed AND a.grantee='municontrol_actions_runtime_app'::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 END LOOP; END IF;
 -- END OWN_FUNCTION_PINS
 IF NOT EXISTS(SELECT 1 FROM pg_proc authority_proc WHERE authority_proc.oid=to_regprocedure('public.native_employee_context_v1(jsonb,boolean)') AND authority_proc.proowner=current_user::regrole AND authority_proc.prosecdef
  AND authority_proc.proconfig=ARRAY['search_path=public, pg_temp'] AND encode(public.digest(replace(authority_proc.prosrc,E'\r\n',E'\n'),'sha256'),'hex') IN ('30d651a79381467d916475803e5d8ad3d5bd49b8fe611729fb159063d10fd6ed','0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c')
  AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(authority_proc.proacl,acldefault('f',authority_proc.proowner))) a WHERE a.grantee<>authority_proc.proowner))
 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 IF NOT installed AND (EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key IN ('employee.catalog.propose','employee.catalog.approve'))
  OR EXISTS(SELECT 1 FROM public.iam_capability_conflict WHERE capability_key LIKE 'employee.catalog.%' OR conflicts_with_key LIKE 'employee.catalog.%'))
 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 IF installed THEN
  IF (SELECT count(*) FROM public.iam_capability WHERE capability_key IN ('employee.catalog.propose','employee.catalog.approve'))<>2
   OR NOT EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key='employee.catalog.propose' AND scope_kind='tenant' AND sensitivity='privileged' AND label='Proponer catálogo de encuadres' AND description='Prepara una versión completa municipal para futuras altas.')
   OR NOT EXISTS(SELECT 1 FROM public.iam_capability WHERE capability_key='employee.catalog.approve' AND scope_kind='tenant' AND sensitivity='restricted' AND label='Aprobar y publicar catálogo de encuadres' AND description='Revisa una versión preparada por otra persona; aprobar la publica para futuras altas.')
   OR (SELECT count(*) FROM public.iam_capability_conflict WHERE capability_key IN ('employee.catalog.propose','employee.catalog.approve') OR conflicts_with_key IN ('employee.catalog.propose','employee.catalog.approve'))<>1
   OR NOT EXISTS(SELECT 1 FROM public.iam_capability_conflict WHERE capability_key='employee.catalog.approve' AND conflicts_with_key='employee.catalog.propose' AND reason='La preparación y la aprobación del catálogo requieren personas diferentes.')
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
  IF EXISTS(WITH expected AS(SELECT r.role_key,CASE rc.capability_key WHEN 'employee.record.propose' THEN 'employee.catalog.propose' ELSE 'employee.catalog.approve' END capability_key
   FROM public.iam_role r JOIN public.iam_role_capability rc ON rc.role_key=r.role_key WHERE r.scope_kind='tenant' AND rc.capability_key IN ('employee.record.propose','employee.record.approve')),
   actual AS(SELECT role_key,capability_key FROM public.iam_role_capability WHERE capability_key IN ('employee.catalog.propose','employee.catalog.approve'))
   SELECT 1 FROM ((SELECT * FROM expected EXCEPT ALL SELECT * FROM actual) UNION ALL (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)) differences)
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 END IF;
 -- BEGIN TABLE_PINS
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'native_employment_catalog_%')<>(CASE WHEN installed THEN 9 ELSE 0 END) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 IF installed THEN
  FOR x IN SELECT * FROM (VALUES
  ('native_employment_catalog_proposal','{"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","notnull":true},{"name":"tenant_id","type":"uuid","default":null,"notnull":true},{"name":"source_binding_id","type":"uuid","default":null,"notnull":true},{"name":"base_version","type":"text","default":null,"notnull":true},{"name":"base_items","type":"jsonb","default":null,"notnull":true},{"name":"items","type":"jsonb","default":null,"notnull":true},{"name":"reason","type":"text","default":null,"notnull":true},{"name":"actor_membership_id","type":"uuid","default":null,"notnull":true},{"name":"actor_person_id","type":"uuid","default":null,"notnull":true},{"name":"actor_email","type":"text","default":null,"notnull":true},{"name":"actor_session_id","type":"uuid","default":null,"notnull":true},{"name":"actor_session_version","type":"integer","default":null,"notnull":true},{"name":"release_sha","type":"text","default":null,"notnull":true},{"name":"author_label","type":"text","default":null,"notnull":true},{"name":"request_key","type":"uuid","default":null,"notnull":true},{"name":"request_sha256","type":"text","default":null,"notnull":true},{"name":"receipt","type":"jsonb","default":null,"notnull":true},{"name":"created_at","type":"timestamp with time zone","default":"clock_timestamp()","notnull":true}],"indexes":["CREATE UNIQUE INDEX native_employment_catalog_pro_tenant_id_source_binding_id_a_key ON native_employment_catalog_proposal USING btree (tenant_id, source_binding_id, actor_membership_id, request_key)","CREATE UNIQUE INDEX native_employment_catalog_pro_tenant_id_source_binding_id_i_key ON native_employment_catalog_proposal USING btree (tenant_id, source_binding_id, id)","CREATE UNIQUE INDEX native_employment_catalog_proposal_pkey ON native_employment_catalog_proposal USING btree (id)"],"constraints":[{"def":"FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id)","name":"native_employment_catalog_pro_actor_membership_id_tenant_i_fkey"},{"def":"UNIQUE (tenant_id, source_binding_id, actor_membership_id, request_key)","name":"native_employment_catalog_pro_tenant_id_source_binding_id_a_key"},{"def":"UNIQUE (tenant_id, source_binding_id, id)","name":"native_employment_catalog_pro_tenant_id_source_binding_id_i_key"},{"def":"FOREIGN KEY (tenant_id, source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id)","name":"native_employment_catalog_prop_tenant_id_source_binding_id_fkey"},{"def":"CHECK (((actor_email = lower(btrim(actor_email))) AND ((length(actor_email) >= 3) AND (length(actor_email) <= 320))))","name":"native_employment_catalog_proposal_actor_email_check"},{"def":"FOREIGN KEY (actor_person_id) REFERENCES person_identity(id)","name":"native_employment_catalog_proposal_actor_person_id_fkey"},{"def":"FOREIGN KEY (actor_session_id) REFERENCES tenant_identity_session(id)","name":"native_employment_catalog_proposal_actor_session_id_fkey"},{"def":"CHECK ((actor_session_version > 0))","name":"native_employment_catalog_proposal_actor_session_version_check"},{"def":"CHECK (((length(author_label) >= 1) AND (length(author_label) <= 160)))","name":"native_employment_catalog_proposal_author_label_check"},{"def":"CHECK ((jsonb_typeof(base_items) = ''array''::text))","name":"native_employment_catalog_proposal_base_items_check"},{"def":"CHECK ((base_version ~ ''^[a-f0-9]{64}$''::text))","name":"native_employment_catalog_proposal_base_version_check"},{"def":"CHECK (((octet_length((items)::text) + octet_length((base_items)::text)) <= 4194304))","name":"native_employment_catalog_proposal_check"},{"def":"CHECK (((jsonb_typeof(items) = ''array''::text) AND ((jsonb_array_length(items) >= 4) AND (jsonb_array_length(items) <= 1500))))","name":"native_employment_catalog_proposal_items_check"},{"def":"PRIMARY KEY (id)","name":"native_employment_catalog_proposal_pkey"},{"def":"CHECK ((((length(reason) >= 10) AND (length(reason) <= 1000)) AND (reason !~ ''[<>[:cntrl:]]''::text)))","name":"native_employment_catalog_proposal_reason_check"},{"def":"CHECK ((jsonb_typeof(receipt) = ''object''::text))","name":"native_employment_catalog_proposal_receipt_check"},{"def":"CHECK ((release_sha ~ ''^[a-f0-9]{40}$''::text))","name":"native_employment_catalog_proposal_release_sha_check"},{"def":"CHECK (((request_key)::text ~ ''^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$''::text))","name":"native_employment_catalog_proposal_request_key_check"},{"def":"CHECK ((request_sha256 ~ ''^[a-f0-9]{64}$''::text))","name":"native_employment_catalog_proposal_request_sha256_check"},{"def":"FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id)","name":"native_employment_catalog_proposal_tenant_id_fkey"}]}'::jsonb),
  ('native_employment_catalog_review','{"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","notnull":true},{"name":"tenant_id","type":"uuid","default":null,"notnull":true},{"name":"source_binding_id","type":"uuid","default":null,"notnull":true},{"name":"proposal_id","type":"uuid","default":null,"notnull":true},{"name":"decision","type":"text","default":null,"notnull":true},{"name":"reason","type":"text","default":null,"notnull":true},{"name":"revision","type":"integer","default":null,"notnull":true},{"name":"catalog_version","type":"text","default":null,"notnull":true},{"name":"actor_membership_id","type":"uuid","default":null,"notnull":true},{"name":"actor_person_id","type":"uuid","default":null,"notnull":true},{"name":"actor_email","type":"text","default":null,"notnull":true},{"name":"actor_session_id","type":"uuid","default":null,"notnull":true},{"name":"actor_session_version","type":"integer","default":null,"notnull":true},{"name":"release_sha","type":"text","default":null,"notnull":true},{"name":"reviewer_label","type":"text","default":null,"notnull":true},{"name":"request_key","type":"uuid","default":null,"notnull":true},{"name":"request_sha256","type":"text","default":null,"notnull":true},{"name":"receipt","type":"jsonb","default":null,"notnull":true},{"name":"reviewed_at","type":"timestamp with time zone","default":"clock_timestamp()","notnull":true}],"indexes":["CREATE UNIQUE INDEX native_employment_catalog_publication_revision ON native_employment_catalog_review USING btree (tenant_id, source_binding_id, revision) WHERE (decision = ''approve''::text)","CREATE UNIQUE INDEX native_employment_catalog_rev_tenant_id_source_binding_id_a_key ON native_employment_catalog_review USING btree (tenant_id, source_binding_id, actor_membership_id, request_key)","CREATE UNIQUE INDEX native_employment_catalog_review_pkey ON native_employment_catalog_review USING btree (id)","CREATE UNIQUE INDEX native_employment_catalog_review_proposal_id_key ON native_employment_catalog_review USING btree (proposal_id)"],"constraints":[{"def":"FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id)","name":"native_employment_catalog_rev_actor_membership_id_tenant_i_fkey"},{"def":"FOREIGN KEY (tenant_id, source_binding_id, proposal_id) REFERENCES native_employment_catalog_proposal(tenant_id, source_binding_id, id)","name":"native_employment_catalog_rev_tenant_id_source_binding_id__fkey"},{"def":"UNIQUE (tenant_id, source_binding_id, actor_membership_id, request_key)","name":"native_employment_catalog_rev_tenant_id_source_binding_id_a_key"},{"def":"CHECK (((actor_email = lower(btrim(actor_email))) AND ((length(actor_email) >= 3) AND (length(actor_email) <= 320))))","name":"native_employment_catalog_review_actor_email_check"},{"def":"FOREIGN KEY (actor_person_id) REFERENCES person_identity(id)","name":"native_employment_catalog_review_actor_person_id_fkey"},{"def":"FOREIGN KEY (actor_session_id) REFERENCES tenant_identity_session(id)","name":"native_employment_catalog_review_actor_session_id_fkey"},{"def":"CHECK ((actor_session_version > 0))","name":"native_employment_catalog_review_actor_session_version_check"},{"def":"CHECK ((catalog_version ~ ''^[a-f0-9]{64}$''::text))","name":"native_employment_catalog_review_catalog_version_check"},{"def":"CHECK (((decision <> ''approve''::text) OR (revision > 0)))","name":"native_employment_catalog_review_check"},{"def":"CHECK ((decision = ANY (ARRAY[''approve''::text, ''reject''::text])))","name":"native_employment_catalog_review_decision_check"},{"def":"PRIMARY KEY (id)","name":"native_employment_catalog_review_pkey"},{"def":"UNIQUE (proposal_id)","name":"native_employment_catalog_review_proposal_id_key"},{"def":"CHECK ((((length(reason) >= 10) AND (length(reason) <= 1000)) AND (reason !~ ''[<>[:cntrl:]]''::text)))","name":"native_employment_catalog_review_reason_check"},{"def":"CHECK ((jsonb_typeof(receipt) = ''object''::text))","name":"native_employment_catalog_review_receipt_check"},{"def":"CHECK ((release_sha ~ ''^[a-f0-9]{40}$''::text))","name":"native_employment_catalog_review_release_sha_check"},{"def":"CHECK (((request_key)::text ~ ''^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$''::text))","name":"native_employment_catalog_review_request_key_check"},{"def":"CHECK ((request_sha256 ~ ''^[a-f0-9]{64}$''::text))","name":"native_employment_catalog_review_request_sha256_check"},{"def":"CHECK (((length(reviewer_label) >= 1) AND (length(reviewer_label) <= 160)))","name":"native_employment_catalog_review_reviewer_label_check"},{"def":"CHECK (((revision >= 0) AND (revision <= 1000)))","name":"native_employment_catalog_review_revision_check"}]}'::jsonb)
  ) v(table_name,expected_shape) LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||x.table_name) AND c.relkind='r' AND c.relowner=current_user::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity
    AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid)
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
    AND NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attacl IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND NOT k.convalidated)
    AND NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgenabled<>'O')
    AND NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND (NOT i.indisvalid OR NOT i.indisready)))
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
   -- Metadata arrays use the same byte ordering as the pinned ASCII names,
   -- independently of the host/database locale (including Linux libc locales).
   SELECT jsonb_build_object(
    'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'def',replace(pg_get_constraintdef(oid),'public.','')) ORDER BY conname::text COLLATE "C") FROM pg_constraint WHERE conrelid=c.oid AND contype<>'n'),
    'indexes',(SELECT jsonb_agg(replace(pg_get_indexdef(indexrelid),'public.','') ORDER BY replace(pg_get_indexdef(indexrelid),'public.','') COLLATE "C") FROM pg_index WHERE indrelid=c.oid)) INTO actual_shape FROM pg_class c WHERE c.oid=to_regclass('public.'||x.table_name);
   IF actual_shape IS DISTINCT FROM x.expected_shape THEN
    RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE' USING DETAIL='table='||x.table_name||'; metadata='||
     (SELECT string_agg(k,',' ORDER BY k COLLATE "C") FROM unnest(ARRAY['columns','constraints','indexes']) k WHERE actual_shape->k IS DISTINCT FROM x.expected_shape->k);
   END IF;
   IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=to_regclass('public.'||x.table_name) AND NOT tgisinternal)<>1
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||x.table_name) AND tgname=x.table_name||'_immutable' AND tgfoid='public.native_employment_catalog_immutable_v1()'::regprocedure AND tgenabled='O' AND tgtype=58 AND NOT tgdeferrable AND NOT tginitdeferred AND tgnargs=0 AND tgqual IS NULL)
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
  END LOOP;
 END IF;
 -- END TABLE_PINS
END;
 IF to_regclass('public.native_employment_catalog_proposal') IS NULL OR to_regclass('public.native_employment_catalog_review') IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
 installed:=to_regclass('public.native_employment_change_proposal') IS NOT NULL;
 IF installed IS DISTINCT FROM (to_regclass('public.native_employment_change_review') IS NOT NULL) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.native_employee_contract_guard_v1()');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR NOT p.prosecdef OR p.prorettype<>'trigger'::regtype OR p.prokind<>'f' OR p.provolatile<>'v' OR p.proretset OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u' OR p.pronargs<>0 OR p.pronargdefaults<>0
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp']
  OR NOT(encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')=ANY(CASE WHEN installed THEN ARRAY['e4533a7e5bec8de12e9ad7628a3ccabec714ea92d69080de4584c57af945af28'] ELSE ARRAY['05717239f4f770498a0f4b3d118165b61fb3343bdbfc3c0083bd4537d92321f3','0fe76b5db164a2c5f89cc20b38c8150e37c1dd99974aeee9f1a4d89dad83110a'] END))
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.employment_contract'::regclass AND NOT tgisinternal)<>1
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.employment_contract'::regclass AND tgname='employment_contract_batch_system' AND tgfoid=p.oid AND tgtype=31 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgnargs=0 AND tgqual IS NULL)
 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)');
 IF p.oid IS NULL OR p.proowner<>current_user::regrole OR NOT p.prosecdef OR p.prorettype<>'jsonb'::regtype OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']
  OR p.prokind<>'f' OR p.provolatile<>'v' OR p.proretset OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u' OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL OR p.proargnames IS DISTINCT FROM ARRAY['ctx','p_contract','hold_lock'] OR p.pronargdefaults<>1 OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM 'false' OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
  OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>'7b490b4cc34bd45205dacf169c1fc2432c5a711fd99d6384bdc0d22db4236e48'
  OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'native_employment_change_%')<>(CASE WHEN installed THEN 21 ELSE 0 END) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
 IF installed THEN FOR x IN SELECT * FROM (VALUES
 ('native_employment_change_immutable_v1()','7dcef4d8cf16a0047f31ebc8ffcaee74f33cff88f6f8af9aaee64cbd6e7c5611',false,'trigger','v',ARRAY[]::text[],'','plpgsql'),
 ('native_employment_change_context_v1(jsonb,text)','b821464173f73ed7457a2892e246febfe6ab8535df4f37778b2366283c84cb7d',false,'jsonb','v',ARRAY['p','required_capability']::text[],'NULL::text','plpgsql'),
 ('native_employment_change_lock_v1(jsonb,uuid)','5930b06a97c889ac62752d3f462fc630b5d4285e3a801442fc78df0c536c38dd',false,'void','v',ARRAY['ctx','target']::text[],'','plpgsql'),
 ('native_employment_change_capacity_v1(integer)','e325566b2112c2c1a656d5ab42c251919b88fea42ea605ecb90c9ff137360e47',false,'void','v',ARRAY['extra_bytes']::text[],'','plpgsql'),
 ('native_employment_change_subject_v1(jsonb,uuid)','3a50695689cc90517b0ef9795ce1588cc8a4e49b5515f16832c6c2d4521459b0',false,'jsonb','v',ARRAY['ctx','target']::text[],'','plpgsql'),
 ('native_employment_change_scope_v1(jsonb,jsonb)','dc256dff4b8972dc4ce1fdc34d7e08d4708ef13df6b46b308e1dc80eaa63a876',false,'text','i',ARRAY['ctx','subject']::text[],'','sql'),
 ('native_employment_change_version_v1(jsonb,jsonb,integer)','519d5daab1ab0de944639e966563162c932e706183ff0a8790fc608fd8c781b8',false,'text','i',ARRAY['snapshot','subject','revision']::text[],'','sql'),
 ('native_employment_change_values_v1(jsonb)','705c367398b8d9a8ccb4be797226c739c8c713932349f43f6470a81305d83b57',false,'jsonb','i',ARRAY['raw_values']::text[],'','plpgsql'),
 ('native_employment_change_display_v1(jsonb)','cf9cb09aad9abe31261c07589b27e6f148c53cdb86d190f53283c82f990143af',false,'jsonb','i',ARRAY['snapshot']::text[],'','sql'),
 ('native_employment_change_after_v1(jsonb,jsonb,jsonb)','5294a12071cd8d16ad9ff623be787ef510719b6dfb44c047e0ee0d59f43228ea',false,'jsonb','i',ARRAY['before_row','values_value','catalog']::text[],'','plpgsql'),
 ('native_employment_change_state_v1(jsonb,uuid,jsonb)','23580ce9fba3ac16066bf2267d989a209852e5714766ce5d9c7f08b1a022a2f7',false,'jsonb','s',ARRAY['ctx','target','subject']::text[],'','plpgsql'),
 ('native_employment_change_can_review_v1(jsonb,public.native_employment_change_proposal)','d90a4ea41b710bf074ac12c3767b750b6e934dd2d3e0827edec992b96f3a435d',false,'boolean','s',ARRAY['ctx','p']::text[],'','sql'),
 ('native_employment_change_summary_v1(jsonb,public.native_employment_change_proposal)','b77bc48a382311ca7107980ed2135c29d61e1f05c2b94b10f75dfb01d75edff3',false,'jsonb','s',ARRAY['ctx','p']::text[],'','sql'),
 ('native_employment_change_replay_v1(jsonb,uuid,uuid,text,text)','6dfd4f9e35f18bc2ba87fd32e9133f08847fcde0f2205bf8a0f102db57038b08',false,'jsonb','s',ARRAY['ctx','target','k','command_name','fingerprint']::text[],'NULL::text, NULL::text','plpgsql'),
 ('native_employment_change_bootstrap_v1(jsonb,uuid)','3556056c966c5d489ae10dbfcf55fc7d88d72aa367085defd366918bf504f846',true,'jsonb','v',ARRAY['ctx','contract_id']::text[],'','plpgsql'),
 ('native_employment_change_proposal_v1(jsonb,uuid,uuid)','852a09dae5d19f232a4689d678949c2b33300a7b2cc85097447d54a5a9e13973',true,'jsonb','v',ARRAY['ctx','contract_id','id']::text[],'','plpgsql'),
 ('native_employment_change_propose_v1(jsonb,jsonb,uuid)','e9713e6bbbef41b51c59441a0e114eeb8b0b520a5a6cc3b9701f34c8ba08a8f4',true,'jsonb','v',ARRAY['ctx','body','key']::text[],'','plpgsql'),
 ('native_employment_change_review_v1(jsonb,jsonb,uuid)','3dfb86e3eedd801acb02588d7c6b7c3f9eb39211cafe26fe585a549df1784c64',true,'jsonb','v',ARRAY['ctx','body','key']::text[],'','plpgsql'),
 ('native_employment_change_attempt_v1(jsonb,uuid,uuid)','d4707abd79a8ea8c7f6b48ad0e241d6223cb1972b30ad8b5ac2bc53d1c1fd518',true,'jsonb','v',ARRAY['ctx','contract_id','key']::text[],'','plpgsql'),
 ('native_employment_change_update_allowed_v1(public.employment_contract,public.employment_contract)','f0a939bb82a21f66b08be3568436fbc8bb51821ceacb924596ec198d17bab824',false,'boolean','s',ARRAY['before_row','after_row']::text[],'','sql'),
 ('native_employment_change_application_guard_v1()','57380ceb6838c54d605480962739be128b991c38fe13025772bcee1b58a5fc78',false,'trigger','v',ARRAY[]::text[],'','plpgsql')
 ) v(signature,body_sha,runtime_allowed,result_type,volatility,arg_names,defaults_text,language_name) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.'||x.signature);
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR NOT p.prosecdef OR p.prokind<>'f' OR p.proretset OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
   OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname=x.language_name) OR p.prorettype<>x.result_type::regtype OR p.provolatile<>x.volatility OR p.proargmodes IS NOT NULL OR p.proallargtypes IS NOT NULL
   OR coalesce(p.proargnames,ARRAY[]::text[]) IS DISTINCT FROM x.arg_names OR coalesce(pg_get_expr(p.proargdefaults,0),'')<>x.defaults_text OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>x.body_sha
   OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS DISTINCT FROM x.runtime_allowed
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee<>p.proowner AND NOT(x.runtime_allowed AND a.grantee='municontrol_actions_runtime_app'::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable))
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
 END LOOP; END IF;
 -- BEGIN TABLE_PINS
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relname LIKE 'native_employment_change_%')<>(CASE WHEN installed THEN 10 ELSE 0 END) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
 IF installed THEN
  FOR x IN SELECT * FROM (VALUES
('native_employment_change_proposal','{"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","notnull":true},{"name":"tenant_id","type":"uuid","default":null,"notnull":true},{"name":"source_binding_id","type":"uuid","default":null,"notnull":true},{"name":"contract_id","type":"uuid","default":null,"notnull":true},{"name":"registration_id","type":"uuid","default":null,"notnull":true},{"name":"subject","type":"jsonb","default":null,"notnull":true},{"name":"base_revision","type":"integer","default":null,"notnull":true},{"name":"base_version","type":"text","default":null,"notnull":true},{"name":"catalog_version","type":"text","default":null,"notnull":true},{"name":"before_contract","type":"jsonb","default":null,"notnull":true},{"name":"after_contract","type":"jsonb","default":null,"notnull":true},{"name":"reason","type":"text","default":null,"notnull":true},{"name":"legal_reference","type":"text","default":null,"notnull":true},{"name":"actor_membership_id","type":"uuid","default":null,"notnull":true},{"name":"actor_person_id","type":"uuid","default":null,"notnull":true},{"name":"actor_email","type":"text","default":null,"notnull":true},{"name":"actor_session_id","type":"uuid","default":null,"notnull":true},{"name":"actor_session_version","type":"integer","default":null,"notnull":true},{"name":"release_sha","type":"text","default":null,"notnull":true},{"name":"author_label","type":"text","default":null,"notnull":true},{"name":"request_key","type":"uuid","default":null,"notnull":true},{"name":"request_sha256","type":"text","default":null,"notnull":true},{"name":"receipt","type":"jsonb","default":null,"notnull":true},{"name":"created_at","type":"timestamp with time zone","default":"clock_timestamp()","notnull":true}],"indexes":["CREATE UNIQUE INDEX native_employment_change_prop_tenant_id_source_binding_id_a_key ON native_employment_change_proposal USING btree (tenant_id, source_binding_id, actor_membership_id, request_key)","CREATE UNIQUE INDEX native_employment_change_prop_tenant_id_source_binding_id_c_key ON native_employment_change_proposal USING btree (tenant_id, source_binding_id, contract_id, id)","CREATE UNIQUE INDEX native_employment_change_proposal_pkey ON native_employment_change_proposal USING btree (id)"],"constraints":[{"def":"FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id)","name":"native_employment_change_prop_actor_membership_id_tenant_i_fkey"},{"def":"UNIQUE (tenant_id, source_binding_id, actor_membership_id, request_key)","name":"native_employment_change_prop_tenant_id_source_binding_id_a_key"},{"def":"UNIQUE (tenant_id, source_binding_id, contract_id, id)","name":"native_employment_change_prop_tenant_id_source_binding_id_c_key"},{"def":"FOREIGN KEY (tenant_id, source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id)","name":"native_employment_change_propo_tenant_id_source_binding_id_fkey"},{"def":"CHECK ((actor_email = lower(btrim(actor_email))))","name":"native_employment_change_proposal_actor_email_check"},{"def":"FOREIGN KEY (actor_person_id) REFERENCES person_identity(id)","name":"native_employment_change_proposal_actor_person_id_fkey"},{"def":"FOREIGN KEY (actor_session_id) REFERENCES tenant_identity_session(id)","name":"native_employment_change_proposal_actor_session_id_fkey"},{"def":"CHECK ((actor_session_version > 0))","name":"native_employment_change_proposal_actor_session_version_check"},{"def":"CHECK (((length(author_label) >= 1) AND (length(author_label) <= 160)))","name":"native_employment_change_proposal_author_label_check"},{"def":"CHECK (((base_revision >= 0) AND (base_revision <= 100)))","name":"native_employment_change_proposal_base_revision_check"},{"def":"CHECK ((base_version ~ ''^[a-f0-9]{64}$''::text))","name":"native_employment_change_proposal_base_version_check"},{"def":"CHECK ((jsonb_typeof(before_contract) = ''object''::text))","name":"native_employment_change_proposal_before_contract_check"},{"def":"CHECK ((catalog_version ~ ''^[a-f0-9]{64}$''::text))","name":"native_employment_change_proposal_catalog_version_check"},{"def":"CHECK (((jsonb_typeof(after_contract) = ''object''::text) AND (after_contract <> before_contract)))","name":"native_employment_change_proposal_check"},{"def":"CHECK (((octet_length((before_contract)::text) + octet_length((after_contract)::text)) <= 131072))","name":"native_employment_change_proposal_check1"},{"def":"FOREIGN KEY (contract_id) REFERENCES employment_contract(id)","name":"native_employment_change_proposal_contract_id_fkey"},{"def":"CHECK ((((length(legal_reference) >= 3) AND (length(legal_reference) <= 180)) AND (legal_reference !~ ''[<>[:cntrl:]]''::text)))","name":"native_employment_change_proposal_legal_reference_check"},{"def":"PRIMARY KEY (id)","name":"native_employment_change_proposal_pkey"},{"def":"CHECK ((((length(reason) >= 10) AND (length(reason) <= 1000)) AND (reason !~ ''[<>[:cntrl:]]''::text)))","name":"native_employment_change_proposal_reason_check"},{"def":"CHECK ((jsonb_typeof(receipt) = ''object''::text))","name":"native_employment_change_proposal_receipt_check"},{"def":"FOREIGN KEY (registration_id) REFERENCES native_employee_registration(id)","name":"native_employment_change_proposal_registration_id_fkey"},{"def":"CHECK ((release_sha ~ ''^[a-f0-9]{40}$''::text))","name":"native_employment_change_proposal_release_sha_check"},{"def":"CHECK (((request_key)::text ~ ''^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$''::text))","name":"native_employment_change_proposal_request_key_check"},{"def":"CHECK ((request_sha256 ~ ''^[a-f0-9]{64}$''::text))","name":"native_employment_change_proposal_request_sha256_check"},{"def":"CHECK ((jsonb_typeof(subject) = ''object''::text))","name":"native_employment_change_proposal_subject_check"},{"def":"FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id)","name":"native_employment_change_proposal_tenant_id_fkey"}]}'::jsonb),
('native_employment_change_review','{"columns":[{"name":"id","type":"uuid","default":"gen_random_uuid()","notnull":true},{"name":"tenant_id","type":"uuid","default":null,"notnull":true},{"name":"source_binding_id","type":"uuid","default":null,"notnull":true},{"name":"contract_id","type":"uuid","default":null,"notnull":true},{"name":"proposal_id","type":"uuid","default":null,"notnull":true},{"name":"decision","type":"text","default":null,"notnull":true},{"name":"reason","type":"text","default":null,"notnull":true},{"name":"revision","type":"integer","default":null,"notnull":true},{"name":"employment_version","type":"text","default":null,"notnull":true},{"name":"applied_xid","type":"xid8","default":null,"notnull":false},{"name":"before_contract","type":"jsonb","default":null,"notnull":false},{"name":"after_contract","type":"jsonb","default":null,"notnull":false},{"name":"actor_membership_id","type":"uuid","default":null,"notnull":true},{"name":"actor_person_id","type":"uuid","default":null,"notnull":true},{"name":"actor_email","type":"text","default":null,"notnull":true},{"name":"actor_session_id","type":"uuid","default":null,"notnull":true},{"name":"actor_session_version","type":"integer","default":null,"notnull":true},{"name":"release_sha","type":"text","default":null,"notnull":true},{"name":"reviewer_label","type":"text","default":null,"notnull":true},{"name":"request_key","type":"uuid","default":null,"notnull":true},{"name":"request_sha256","type":"text","default":null,"notnull":true},{"name":"receipt","type":"jsonb","default":null,"notnull":true},{"name":"reviewed_at","type":"timestamp with time zone","default":"clock_timestamp()","notnull":true}],"indexes":["CREATE UNIQUE INDEX native_employment_change_revi_tenant_id_source_binding_id_a_key ON native_employment_change_review USING btree (tenant_id, source_binding_id, actor_membership_id, request_key)","CREATE UNIQUE INDEX native_employment_change_review_pkey ON native_employment_change_review USING btree (id)","CREATE UNIQUE INDEX native_employment_change_review_proposal_id_key ON native_employment_change_review USING btree (proposal_id)","CREATE UNIQUE INDEX native_employment_change_revision ON native_employment_change_review USING btree (tenant_id, source_binding_id, contract_id, revision) WHERE (decision = ''approve''::text)","CREATE UNIQUE INDEX native_employment_change_transaction ON native_employment_change_review USING btree (contract_id, applied_xid) WHERE (decision = ''approve''::text)"],"constraints":[{"def":"FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id)","name":"native_employment_change_revi_actor_membership_id_tenant_i_fkey"},{"def":"FOREIGN KEY (tenant_id, source_binding_id, contract_id, proposal_id) REFERENCES native_employment_change_proposal(tenant_id, source_binding_id, contract_id, id)","name":"native_employment_change_revi_tenant_id_source_binding_id__fkey"},{"def":"UNIQUE (tenant_id, source_binding_id, actor_membership_id, request_key)","name":"native_employment_change_revi_tenant_id_source_binding_id_a_key"},{"def":"CHECK ((actor_email = lower(btrim(actor_email))))","name":"native_employment_change_review_actor_email_check"},{"def":"FOREIGN KEY (actor_person_id) REFERENCES person_identity(id)","name":"native_employment_change_review_actor_person_id_fkey"},{"def":"FOREIGN KEY (actor_session_id) REFERENCES tenant_identity_session(id)","name":"native_employment_change_review_actor_session_id_fkey"},{"def":"CHECK ((actor_session_version > 0))","name":"native_employment_change_review_actor_session_version_check"},{"def":"TRIGGER DEFERRABLE INITIALLY DEFERRED","name":"native_employment_change_review_applied"},{"def":"CHECK ((((decision = ''approve''::text) AND (revision > 0) AND (applied_xid IS NOT NULL) AND (before_contract IS NOT NULL) AND (after_contract IS NOT NULL) AND (jsonb_typeof(before_contract) = ''object''::text) AND (jsonb_typeof(after_contract) = ''object''::text) AND (before_contract <> after_contract)) OR ((decision = ''reject''::text) AND (applied_xid IS NULL) AND (before_contract IS NULL) AND (after_contract IS NULL))))","name":"native_employment_change_review_check"},{"def":"FOREIGN KEY (contract_id) REFERENCES employment_contract(id)","name":"native_employment_change_review_contract_id_fkey"},{"def":"CHECK ((decision = ANY (ARRAY[''approve''::text, ''reject''::text])))","name":"native_employment_change_review_decision_check"},{"def":"CHECK ((employment_version ~ ''^[a-f0-9]{64}$''::text))","name":"native_employment_change_review_employment_version_check"},{"def":"PRIMARY KEY (id)","name":"native_employment_change_review_pkey"},{"def":"UNIQUE (proposal_id)","name":"native_employment_change_review_proposal_id_key"},{"def":"CHECK ((((length(reason) >= 10) AND (length(reason) <= 1000)) AND (reason !~ ''[<>[:cntrl:]]''::text)))","name":"native_employment_change_review_reason_check"},{"def":"CHECK ((jsonb_typeof(receipt) = ''object''::text))","name":"native_employment_change_review_receipt_check"},{"def":"CHECK ((release_sha ~ ''^[a-f0-9]{40}$''::text))","name":"native_employment_change_review_release_sha_check"},{"def":"CHECK (((request_key)::text ~ ''^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$''::text))","name":"native_employment_change_review_request_key_check"},{"def":"CHECK ((request_sha256 ~ ''^[a-f0-9]{64}$''::text))","name":"native_employment_change_review_request_sha256_check"},{"def":"CHECK (((length(reviewer_label) >= 1) AND (length(reviewer_label) <= 160)))","name":"native_employment_change_review_reviewer_label_check"},{"def":"CHECK (((revision >= 0) AND (revision <= 100)))","name":"native_employment_change_review_revision_check"},{"def":"FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id)","name":"native_employment_change_review_tenant_id_fkey"}]}'::jsonb)
) v(table_name,expected_shape) LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||x.table_name) AND c.relkind='r' AND c.relowner=current_user::regrole AND c.relrowsecurity AND NOT c.relforcerowsecurity
    AND NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=c.oid)
    AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner)
    AND NOT EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attacl IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM pg_constraint k WHERE k.conrelid=c.oid AND NOT k.convalidated)
    AND NOT EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=c.oid AND t.tgenabled<>'O')
    AND NOT EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND (NOT i.indisvalid OR NOT i.indisready)))
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
   -- Metadata arrays use the same byte ordering as the pinned ASCII names,
   -- independently of the host/database locale (including Linux libc locales).
   SELECT jsonb_build_object(
    'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'def',replace(pg_get_constraintdef(oid),'public.','')) ORDER BY conname::text COLLATE "C") FROM pg_constraint WHERE conrelid=c.oid AND contype<>'n'),
    'indexes',(SELECT jsonb_agg(replace(pg_get_indexdef(indexrelid),'public.','') ORDER BY replace(pg_get_indexdef(indexrelid),'public.','') COLLATE "C") FROM pg_index WHERE indrelid=c.oid)) INTO actual_shape FROM pg_class c WHERE c.oid=to_regclass('public.'||x.table_name);
   IF actual_shape IS DISTINCT FROM x.expected_shape THEN
    RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE' USING DETAIL='table='||x.table_name||'; metadata='||
     (SELECT string_agg(k,',' ORDER BY k COLLATE "C") FROM unnest(ARRAY['columns','constraints','indexes']) k WHERE actual_shape->k IS DISTINCT FROM x.expected_shape->k);
   END IF;
   IF (SELECT count(*) FROM pg_trigger WHERE tgrelid=to_regclass('public.'||x.table_name) AND NOT tgisinternal)<>(CASE x.table_name WHEN 'native_employment_change_review' THEN 3 ELSE 1 END)
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||x.table_name) AND tgname=x.table_name||'_immutable' AND tgfoid='public.native_employment_change_immutable_v1()'::regprocedure AND tgenabled='O' AND tgtype=58 AND NOT tgdeferrable AND NOT tginitdeferred AND tgnargs=0 AND tgqual IS NULL)
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
   IF x.table_name='native_employment_change_review' AND (
    NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||x.table_name) AND tgname='native_employment_change_review_before' AND tgfoid='public.native_employment_change_application_guard_v1()'::regprocedure AND tgtype=7 AND tgenabled='O' AND NOT tgdeferrable AND NOT tginitdeferred AND tgnargs=0 AND tgqual IS NULL)
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=to_regclass('public.'||x.table_name) AND tgname='native_employment_change_review_applied' AND tgfoid='public.native_employment_change_application_guard_v1()'::regprocedure AND tgtype=5 AND tgenabled='O' AND tgdeferrable AND tginitdeferred AND tgnargs=0 AND tgqual IS NULL AND tgconstraint<>0))
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_PREREQUISITE'; END IF;
  END LOOP;
 END IF;
 -- END TABLE_PINS
END $prerequisite$;
-- END PREREQUISITE_GUARD

CREATE TABLE IF NOT EXISTS public.native_employment_change_proposal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 source_binding_id uuid NOT NULL, contract_id uuid NOT NULL REFERENCES public.employment_contract(id),
 registration_id uuid NOT NULL REFERENCES public.native_employee_registration(id), subject jsonb NOT NULL CHECK(jsonb_typeof(subject)='object'),
 base_revision integer NOT NULL CHECK(base_revision BETWEEN 0 AND 100), base_version text NOT NULL CHECK(base_version~'^[a-f0-9]{64}$'),
 catalog_version text NOT NULL CHECK(catalog_version~'^[a-f0-9]{64}$'),
 before_contract jsonb NOT NULL CHECK(jsonb_typeof(before_contract)='object'), after_contract jsonb NOT NULL CHECK(jsonb_typeof(after_contract)='object' AND after_contract<>before_contract),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000 AND reason!~'[<>[:cntrl:]]'),
 legal_reference text NOT NULL CHECK(length(legal_reference) BETWEEN 3 AND 180 AND legal_reference!~'[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL, actor_person_id uuid NOT NULL REFERENCES public.person_identity(id), actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id), actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'), author_label text NOT NULL CHECK(length(author_label) BETWEEN 1 AND 160),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'), receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,contract_id,id), UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK(octet_length(before_contract::text)+octet_length(after_contract::text)<=131072)
);
CREATE TABLE IF NOT EXISTS public.native_employment_change_review (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id), source_binding_id uuid NOT NULL,
 contract_id uuid NOT NULL REFERENCES public.employment_contract(id), proposal_id uuid NOT NULL UNIQUE,
 decision text NOT NULL CHECK(decision IN ('approve','reject')), reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000 AND reason!~'[<>[:cntrl:]]'),
 revision integer NOT NULL CHECK(revision BETWEEN 0 AND 100), employment_version text NOT NULL CHECK(employment_version~'^[a-f0-9]{64}$'),
 applied_xid xid8, before_contract jsonb, after_contract jsonb,
 actor_membership_id uuid NOT NULL, actor_person_id uuid NOT NULL REFERENCES public.person_identity(id), actor_email text NOT NULL CHECK(actor_email=lower(btrim(actor_email))),
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id), actor_session_version integer NOT NULL CHECK(actor_session_version>0),
 release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'), reviewer_label text NOT NULL CHECK(length(reviewer_label) BETWEEN 1 AND 160),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
 request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'), receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id,contract_id,proposal_id) REFERENCES public.native_employment_change_proposal(tenant_id,source_binding_id,contract_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK((decision='approve' AND revision>0 AND applied_xid IS NOT NULL AND before_contract IS NOT NULL AND after_contract IS NOT NULL AND jsonb_typeof(before_contract)='object' AND jsonb_typeof(after_contract)='object' AND before_contract<>after_contract)
  OR (decision='reject' AND applied_xid IS NULL AND before_contract IS NULL AND after_contract IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS native_employment_change_revision ON public.native_employment_change_review(tenant_id,source_binding_id,contract_id,revision) WHERE decision='approve';
CREATE UNIQUE INDEX IF NOT EXISTS native_employment_change_transaction ON public.native_employment_change_review(contract_id,applied_xid) WHERE decision='approve';
ALTER TABLE public.native_employment_change_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_employment_change_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_employment_change_proposal,public.native_employment_change_review FROM PUBLIC,municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.native_employment_change_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS native_employment_change_proposal_immutable ON public.native_employment_change_proposal;
CREATE TRIGGER native_employment_change_proposal_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_employment_change_proposal FOR EACH STATEMENT EXECUTE FUNCTION public.native_employment_change_immutable_v1();
DROP TRIGGER IF EXISTS native_employment_change_review_immutable ON public.native_employment_change_review;
CREATE TRIGGER native_employment_change_review_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_employment_change_review FOR EACH STATEMENT EXECUTE FUNCTION public.native_employment_change_immutable_v1();

CREATE OR REPLACE FUNCTION public.native_employment_change_context_v1(p jsonb,required_capability text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb; actor_label text;
BEGIN
 IF required_capability IS NOT NULL AND required_capability NOT IN ('employee.record.propose','employee.record.approve') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN'; END IF;
 ctx:=public.native_employee_context_v1(p);
 IF required_capability IS NOT NULL AND NOT public.action_center_context_has_capability(ctx,required_capability) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN'; END IF;
 IF required_capability IS NOT NULL AND (ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_EMPLOYMENT_REQUIRED'; END IF;
 SELECT full_name INTO actor_label FROM public.person_identity WHERE id=(ctx->>'actorPersonId')::uuid;
 RETURN ctx||jsonb_build_object('actorEmail',lower(btrim(p->>'actorEmail')),'actorLabel',left(coalesce(nullif(btrim(actor_label),''),'Responsable municipal'),160));
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_change_lock_v1(ctx jsonb,target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN
 PERFORM public.native_employment_catalog_lock_v1(ctx);
 PERFORM public.grh_curated_source_read_lock_v1();
 IF target IS NULL OR NOT pg_try_advisory_xact_lock(hashtextextended('native-employment-change:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId')||':'||target::text,0)) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY'; END IF;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY';
 WHEN OTHERS THEN IF SQLERRM='NATIVE_EMPLOYMENT_CATALOG_BUSY' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY'; END IF; RAISE;
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_change_capacity_v1(extra_bytes integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
BEGIN
 PERFORM public.native_employment_catalog_capacity_v1(extra_bytes);
EXCEPTION WHEN OTHERS THEN
 CASE SQLERRM WHEN 'NATIVE_EMPLOYMENT_CATALOG_BUSY' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY';
 WHEN 'NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_CAPACITY_LIMIT'; ELSE RAISE; END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_change_subject_v1(ctx jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.employment_contract WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid AND source_system='MUNICONTROL') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 result:=public.payroll_fixed_registry_subject_by_contract_v1(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),target,true)->'subject';
 IF result->>'origin' IS DISTINCT FROM 'MUNICONTROL' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 RETURN result;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY';
 WHEN OTHERS THEN
  IF SQLERRM LIKE 'NATIVE_EMPLOYMENT_CHANGE_%' THEN RAISE; END IF;
  CASE SQLERRM WHEN 'PAYROLL_FIXED_NOT_FOUND' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND';
   WHEN 'PAYROLL_FIXED_IDENTITY_CHANGED' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_IDENTITY_CHANGED';
   WHEN 'PAYROLL_FIXED_SESSION_BUSY' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY'; ELSE RAISE; END CASE;
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_change_scope_v1(ctx jsonb,subject jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT encode(public.digest(jsonb_build_object('version','native-employment-change-scope.v1','tenantId',ctx->>'tenantId','sourceBindingId',ctx->>'sourceBindingId','membershipId',ctx->>'membershipId','personId',ctx->>'actorPersonId','email',ctx->>'actorEmail','contractId',subject->>'contractId','registrationId',subject->>'registrationId','identityToken',subject->>'identityToken')::text,'sha256'),'hex')
$$;
CREATE OR REPLACE FUNCTION public.native_employment_change_version_v1(snapshot jsonb,subject jsonb,revision integer) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT encode(public.digest(jsonb_build_object('version','native-employment-change-state.v1','contract',snapshot,'registrationId',subject->>'registrationId','identityToken',subject->>'identityToken','revision',revision)::text,'sha256'),'hex')
$$;
CREATE OR REPLACE FUNCTION public.native_employment_change_values_v1(raw_values jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE result jsonb:='{}'; field text; val text;
BEGIN
 IF jsonb_typeof(raw_values) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(raw_values) key) IS DISTINCT FROM ARRAY['agreementCode','categoryCode','jobTitle','organizationId','sectorCode']::text[] THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 FOREACH field IN ARRAY ARRAY['agreementCode','categoryCode','organizationId','sectorCode','jobTitle'] LOOP
  IF jsonb_typeof(raw_values->field) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
  IF field<>'jobTitle' AND raw_values->>field!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
  val:=normalize(btrim(raw_values->>field),NFC);
  IF val~'[<>[:cntrl:]]' OR (field='jobTitle' AND length(val)>120) OR (field<>'jobTitle' AND val!~'^[0-9]{1,9}$') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
  result:=result||jsonb_build_object(field,val);
 END LOOP;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.native_employment_change_display_v1(snapshot jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT jsonb_build_object('values',jsonb_build_object('agreementCode',snapshot->>'agreement_code','categoryCode',snapshot->>'category_code','organizationId',snapshot->>'organization_unit_source_id','sectorCode',snapshot->>'sector_source_id','jobTitle',coalesce(snapshot#>>'{source_payload,employment,cargoName}','')),
  'labels',jsonb_build_object('agreementName',snapshot#>>'{source_payload,employment,agreementName}','categoryName',snapshot#>>'{source_payload,employment,categoryName}','organizationName',snapshot#>>'{source_payload,employment,organizationName}','sectorName',snapshot#>>'{source_payload,employment,sectorName}'))
$$;
CREATE OR REPLACE FUNCTION public.native_employment_change_after_v1(before_row jsonb,values_value jsonb,catalog jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE labels jsonb:='{}'; field text; kind text; label_key text; label_value text; matches integer; employment jsonb;
BEGIN
 FOREACH field IN ARRAY ARRAY['agreementCode','categoryCode','organizationId','sectorCode'] LOOP
  kind:=CASE field WHEN 'agreementCode' THEN 'agreements' WHEN 'categoryCode' THEN 'categories' WHEN 'organizationId' THEN 'organizations' ELSE 'sectors' END;
  label_key:=CASE field WHEN 'agreementCode' THEN 'agreementName' WHEN 'categoryCode' THEN 'categoryName' WHEN 'organizationId' THEN 'organizationName' ELSE 'sectorName' END;
  SELECT count(*),min(value->>'label') INTO matches,label_value FROM jsonb_array_elements(catalog->'items') WHERE value->>'kind'=kind AND value->>'code'=values_value->>field AND (kind<>'categories' OR value->>'agreementCode'=values_value->>'agreementCode');
  IF matches<>1 OR length(label_value) NOT BETWEEN 1 AND 160 OR label_value~'[<>[:cntrl:]]' OR (kind='agreements' AND ltrim(values_value->>field,'0') IN ('9','10')) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_CATALOG_SELECTION_INVALID'; END IF;
  labels:=labels||jsonb_build_object(label_key,label_value);
 END LOOP;
 IF jsonb_typeof(before_row#>'{source_payload,employment}') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_IDENTITY_CHANGED'; END IF;
 employment:=(before_row#>'{source_payload,employment}')||labels||jsonb_build_object('cargoName',nullif(values_value->>'jobTitle',''));
 RETURN jsonb_set(before_row||jsonb_build_object('agreement_code',values_value->>'agreementCode','category_code',values_value->>'categoryCode','organization_unit_source_id',values_value->>'organizationId','sector_source_id',values_value->>'sectorCode'),'{source_payload,employment}',employment,false);
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_change_state_v1(ctx jsonb,target uuid,subject jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE snapshot jsonb; revision_value integer; applied_at timestamptz;
BEGIN
 SELECT to_jsonb(c) INTO snapshot FROM public.employment_contract c WHERE c.id=target AND c.tenant_id=(ctx->>'tenantId')::uuid AND c.source_system='MUNICONTROL';
 IF snapshot IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 SELECT r.revision,r.reviewed_at INTO revision_value,applied_at FROM public.native_employment_change_review r WHERE r.contract_id=target AND r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid AND r.decision='approve' ORDER BY r.revision DESC LIMIT 1;
 revision_value:=coalesce(revision_value,0);
 RETURN public.native_employment_change_display_v1(snapshot)||jsonb_build_object('version',public.native_employment_change_version_v1(snapshot,subject,revision_value),'revision',revision_value,'appliedAt',applied_at);
END $$;
CREATE OR REPLACE FUNCTION public.native_employment_change_can_review_v1(ctx jsonb,p public.native_employment_change_proposal) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT coalesce(public.action_center_context_has_capability(ctx,'employee.record.approve') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL
  AND p.actor_membership_id<>(ctx->>'membershipId')::uuid AND p.actor_person_id<>(ctx->>'actorPersonId')::uuid AND p.actor_email<>ctx->>'actorEmail'
  AND NOT EXISTS(SELECT 1 FROM public.native_employment_change_review r WHERE r.proposal_id=p.id),false)
$$;
CREATE OR REPLACE FUNCTION public.native_employment_change_summary_v1(ctx jsonb,p public.native_employment_change_proposal) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT jsonb_build_object('id',p.id,'status',coalesce((SELECT CASE decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END FROM public.native_employment_change_review WHERE proposal_id=p.id),'pending'),'reason',p.reason,'legalReference',p.legal_reference,'createdAt',p.created_at,'authorLabel',p.author_label,'baseVersion',p.base_version,'canReview',public.native_employment_change_can_review_v1(ctx,p))
$$;

CREATE OR REPLACE FUNCTION public.native_employment_change_replay_v1(ctx jsonb,target uuid,k uuid,command_name text DEFAULT NULL,fingerprint text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE item record;
BEGIN
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 SELECT * INTO item FROM (
  SELECT 'propose' command,p.contract_id,p.receipt,p.request_sha256,p.actor_person_id,p.actor_email FROM public.native_employment_change_proposal p WHERE p.tenant_id=(ctx->>'tenantId')::uuid AND p.source_binding_id=(ctx->>'sourceBindingId')::uuid AND p.actor_membership_id=(ctx->>'membershipId')::uuid AND p.request_key=k
  UNION ALL SELECT 'review',r.contract_id,r.receipt,r.request_sha256,r.actor_person_id,r.actor_email FROM public.native_employment_change_review r WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid AND r.actor_membership_id=(ctx->>'membershipId')::uuid AND r.request_key=k
 ) records;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF item.contract_id IS DISTINCT FROM target THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 IF NOT public.action_center_context_has_capability(ctx,CASE WHEN item.command='propose' THEN 'employee.record.propose' ELSE 'employee.record.approve' END)
  OR item.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR item.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_FORBIDDEN'; END IF;
 IF (command_name IS NOT NULL AND command_name<>item.command) OR (fingerprint IS NOT NULL AND fingerprint<>item.request_sha256) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_IDEMPOTENCY_REUSE'; END IF;
 RETURN item.receipt||jsonb_build_object('replayed',true);
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_change_bootstrap_v1(ctx jsonb,contract_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb; proposals jsonb; total integer;
BEGIN
 c:=public.native_employment_change_context_v1(ctx); PERFORM public.native_employment_change_lock_v1(c,contract_id); subject:=public.native_employment_change_subject_v1(c,contract_id);
 SELECT count(*) INTO total FROM public.native_employment_change_proposal p WHERE p.contract_id=native_employment_change_bootstrap_v1.contract_id AND p.tenant_id=(c->>'tenantId')::uuid AND p.source_binding_id=(c->>'sourceBindingId')::uuid;
 SELECT coalesce(jsonb_agg(public.native_employment_change_summary_v1(c,p) ORDER BY p.created_at DESC,p.id DESC),'[]') INTO proposals FROM public.native_employment_change_proposal p WHERE p.id IN (SELECT q.id FROM public.native_employment_change_proposal q WHERE q.contract_id=native_employment_change_bootstrap_v1.contract_id AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid ORDER BY q.created_at DESC,q.id DESC LIMIT 20);
 RETURN jsonb_build_object('version','native-employment-change.v1','scopeVersion',public.native_employment_change_scope_v1(c,subject),'subject',subject,'employment',public.native_employment_change_state_v1(c,contract_id,subject),'catalog',public.native_employee_catalog_v1(c),
  'permissions',jsonb_build_object('canPropose',public.action_center_context_has_capability(c,'employee.record.propose') AND c->>'actorPersonId' IS NOT NULL AND c->>'employmentContractId' IS NOT NULL,'canReview',public.action_center_context_has_capability(c,'employee.record.approve') AND c->>'actorPersonId' IS NOT NULL AND c->>'employmentContractId' IS NOT NULL),'proposals',proposals,'historyTruncated',total>20);
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_change_proposal_v1(ctx jsonb,contract_id uuid,id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; p public.native_employment_change_proposal; review_value jsonb; summary_value jsonb;
BEGIN
 c:=public.native_employment_change_context_v1(ctx); PERFORM public.native_employment_change_subject_v1(c,contract_id);
 SELECT q.* INTO p FROM public.native_employment_change_proposal q WHERE q.id=native_employment_change_proposal_v1.id AND q.contract_id=native_employment_change_proposal_v1.contract_id AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 -- STABLE summary and its review share one statement snapshot under READ COMMITTED.
 SELECT public.native_employment_change_summary_v1(c,p),
  (SELECT jsonb_build_object('decision',r.decision,'reason',r.reason,'reviewedAt',r.reviewed_at,'reviewerLabel',r.reviewer_label) FROM public.native_employment_change_review r WHERE r.proposal_id=p.id)
 INTO summary_value,review_value;
 RETURN jsonb_build_object('version','native-employment-change.v1','proposal',summary_value||jsonb_build_object('contractId',p.contract_id,'subject',p.subject,'catalogVersion',p.catalog_version,'before',public.native_employment_change_display_v1(p.before_contract),'after',public.native_employment_change_display_v1(p.after_contract),'review',review_value));
END $$;

-- WRITE_FACADES
CREATE OR REPLACE FUNCTION public.native_employment_change_propose_v1(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 before_row jsonb; after_row jsonb; values_value jsonb; reason_value text; reference_value text; proposal_id uuid:=gen_random_uuid(); receipt_value jsonb;
BEGIN
 c:=public.native_employment_change_context_v1(ctx,'employee.record.propose');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['baseVersion','catalogVersion','contractId','identityToken','legalReference','reason','scopeVersion','values']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE e.key<>'values' AND jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR body->>'catalogVersion'!~'^[a-f0-9]{64}$' OR body->>'identityToken'!~'^[a-f0-9]{64}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; values_value:=public.native_employment_change_values_v1(body->'values');
 reason_value:=normalize(btrim(body->>'reason'),NFC); reference_value:=normalize(btrim(body->>'legalReference'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' OR length(reference_value) NOT BETWEEN 3 AND 180 OR reference_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'values',values_value,'reason',reason_value,'legalReference',reference_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-change.v1','operation','propose','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_change_lock_v1(c,target); replay:=public.native_employment_change_replay_v1(c,target,key,'propose',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO before_row FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 subject:=public.native_employment_change_subject_v1(c,target);
 IF body->>'identityToken' IS DISTINCT FROM subject->>'identityToken' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_IDENTITY_CHANGED'; END IF;
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_change_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_SCOPE_CHANGED'; END IF;
 current_value:=public.native_employment_change_state_v1(c,target,subject);
 IF body->>'baseVersion' IS DISTINCT FROM current_value->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BASE_CHANGED'; END IF;
 catalog:=public.native_employee_catalog_v1(c);
 IF body->>'catalogVersion' IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_CATALOG_CHANGED'; END IF;
 after_row:=public.native_employment_change_after_v1(before_row,values_value,catalog);
 IF before_row=after_row THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NO_CHANGE'; END IF;
 IF (SELECT count(*) FROM public.native_employment_change_proposal WHERE contract_id=target)>=100 OR (SELECT count(*) FROM public.native_employment_change_proposal WHERE tenant_id=(c->>'tenantId')::uuid AND source_binding_id=(c->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_LIMIT'; END IF;
 PERFORM public.native_employment_change_capacity_v1(octet_length(before_row::text)+octet_length(after_row::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-change.v1','operation','propose','contractId',target,'proposalId',proposal_id,'status','pending','employmentVersion',current_value->>'version','revision',(current_value->>'revision')::integer,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_change_proposal(id,tenant_id,source_binding_id,contract_id,registration_id,subject,base_revision,base_version,catalog_version,before_contract,after_contract,reason,legal_reference,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,author_label,request_key,request_sha256,receipt)
 VALUES(proposal_id,(c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,(subject->>'registrationId')::uuid,subject,(current_value->>'revision')::integer,current_value->>'version',catalog->>'version',before_row,after_row,reason_value,reference_value,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY'; END $$;

CREATE OR REPLACE FUNCTION public.native_employment_change_review_v1(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; subject jsonb; current_value jsonb; catalog jsonb; target uuid; payload jsonb; fingerprint text; replay jsonb;
 p public.native_employment_change_proposal; snapshot jsonb; reason_value text; decision_value text; revision_value integer; version_value text; receipt_value jsonb;
BEGIN
 c:=public.native_employment_change_context_v1(ctx,'employee.record.approve');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR octet_length(body::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['contractId','decision','proposalId','reason','scopeVersion']::text[]
  OR EXISTS(SELECT 1 FROM jsonb_each(body) e WHERE jsonb_typeof(e.value) IS DISTINCT FROM 'string')
  OR body->>'contractId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'proposalId'!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR body->>'decision' NOT IN ('approve','reject') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 target:=(body->>'contractId')::uuid; decision_value:=body->>'decision'; reason_value:=normalize(btrim(body->>'reason'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_INPUT_INVALID'; END IF;
 payload:=body||jsonb_build_object('contractId',target,'proposalId',(body->>'proposalId')::uuid,'reason',reason_value);
 fingerprint:=encode(public.digest(jsonb_build_object('version','native-employment-change.v1','operation','review','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_change_lock_v1(c,target); replay:=public.native_employment_change_replay_v1(c,target,key,'review',fingerprint); IF replay IS NOT NULL THEN RETURN replay; END IF;
 SELECT to_jsonb(ec) INTO snapshot FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=(c->>'tenantId')::uuid AND ec.source_system='MUNICONTROL' FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 subject:=public.native_employment_change_subject_v1(c,target);
 IF body->>'scopeVersion' IS DISTINCT FROM public.native_employment_change_scope_v1(c,subject) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_SCOPE_CHANGED'; END IF;
 SELECT q.* INTO p FROM public.native_employment_change_proposal q WHERE q.id=(body->>'proposalId')::uuid AND q.contract_id=target AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_change_review WHERE proposal_id=p.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_DECIDED'; END IF;
 IF NOT public.native_employment_change_can_review_v1(c,p) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_MAKER_CHECKER_REQUIRED'; END IF;
 IF p.subject IS DISTINCT FROM subject THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_IDENTITY_CHANGED'; END IF;
 current_value:=public.native_employment_change_state_v1(c,target,subject); revision_value:=(current_value->>'revision')::integer; version_value:=current_value->>'version';
 IF decision_value='approve' THEN
  IF p.base_version<>version_value OR p.base_revision<>revision_value OR snapshot<>p.before_contract THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BASE_CHANGED'; END IF;
  catalog:=public.native_employee_catalog_v1(c);
  IF p.catalog_version IS DISTINCT FROM catalog->>'version' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_CATALOG_CHANGED'; END IF;
  IF p.after_contract IS DISTINCT FROM public.native_employment_change_after_v1(snapshot,public.native_employment_change_display_v1(p.after_contract)->'values',catalog) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BASE_CHANGED'; END IF;
  IF revision_value>=100 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_LIMIT'; END IF;
  IF EXISTS(SELECT 1 FROM public.native_employment_change_review WHERE contract_id=target AND applied_xid=pg_current_xact_id()) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY'; END IF;
  revision_value:=revision_value+1; version_value:=public.native_employment_change_version_v1(p.after_contract,subject,revision_value);
 END IF;
 PERFORM public.native_employment_change_capacity_v1(octet_length(p.before_contract::text)+octet_length(p.after_contract::text)+16384);
 receipt_value:=jsonb_build_object('version','native-employment-change.v1','operation','review','contractId',target,'proposalId',p.id,'status',CASE decision_value WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'employmentVersion',version_value,'revision',revision_value,'replayed',false,'payrollModified',false);
 INSERT INTO public.native_employment_change_review(tenant_id,source_binding_id,contract_id,proposal_id,decision,reason,revision,employment_version,applied_xid,before_contract,after_contract,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt)
 VALUES((c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,target,p.id,decision_value,reason_value,revision_value,version_value,CASE WHEN decision_value='approve' THEN pg_current_xact_id() END,CASE WHEN decision_value='approve' THEN p.before_contract END,CASE WHEN decision_value='approve' THEN p.after_contract END,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,fingerprint,receipt_value);
 IF decision_value='approve' THEN
  UPDATE public.employment_contract SET agreement_code=p.after_contract->>'agreement_code',category_code=p.after_contract->>'category_code',organization_unit_source_id=p.after_contract->>'organization_unit_source_id',sector_source_id=p.after_contract->>'sector_source_id',source_payload=p.after_contract->'source_payload' WHERE id=target;
  IF NOT FOUND OR (SELECT to_jsonb(ec) FROM public.employment_contract ec WHERE ec.id=target) IS DISTINCT FROM p.after_contract THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_APPLY_FAILED'; END IF;
 END IF;
 RETURN receipt_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_BUSY'; END $$;

CREATE OR REPLACE FUNCTION public.native_employment_change_attempt_v1(ctx jsonb,contract_id uuid,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c jsonb; result jsonb;
BEGIN
 c:=public.native_employment_change_context_v1(ctx); result:=public.native_employment_change_replay_v1(c,contract_id,key);
 IF result IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_NOT_FOUND'; END IF; RETURN result;
END $$;

-- GUARDED_CANONICAL_UPDATE
CREATE OR REPLACE FUNCTION public.native_employment_change_update_allowed_v1(before_row public.employment_contract,after_row public.employment_contract) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
 SELECT before_row.source_system='MUNICONTROL' AND after_row.source_system='MUNICONTROL'
  AND (to_jsonb(before_row)-ARRAY['agreement_code','category_code','organization_unit_source_id','sector_source_id','source_payload'])=(to_jsonb(after_row)-ARRAY['agreement_code','category_code','organization_unit_source_id','sector_source_id','source_payload'])
  AND before_row.source_payload-'employment'=after_row.source_payload-'employment'
  AND (before_row.source_payload->'employment')-ARRAY['agreementName','categoryName','organizationName','sectorName','cargoName']=(after_row.source_payload->'employment')-ARRAY['agreementName','categoryName','organizationName','sectorName','cargoName']
  AND EXISTS(SELECT 1 FROM public.native_employment_change_review r JOIN public.native_employment_change_proposal p ON p.id=r.proposal_id AND p.contract_id=r.contract_id AND p.tenant_id=r.tenant_id AND p.source_binding_id=r.source_binding_id
   JOIN public.native_employee_registration n ON n.id=p.registration_id AND n.contract_id=p.contract_id AND n.tenant_id=p.tenant_id AND n.source_binding_id=p.source_binding_id AND n.person_id=before_row.person_id
   WHERE r.contract_id=before_row.id AND r.tenant_id=before_row.tenant_id AND r.decision='approve' AND r.applied_xid=pg_current_xact_id_if_assigned() AND r.before_contract=to_jsonb(before_row) AND r.after_contract=to_jsonb(after_row) AND r.before_contract=p.before_contract AND r.after_contract=p.after_contract)
$$;
CREATE OR REPLACE FUNCTION public.native_employment_change_application_guard_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE snapshot jsonb;
BEGIN
 IF NEW.decision='approve' THEN
  SELECT to_jsonb(ec) INTO snapshot FROM public.employment_contract ec WHERE ec.id=NEW.contract_id AND ec.tenant_id=NEW.tenant_id;
  IF NEW.applied_xid IS DISTINCT FROM pg_current_xact_id_if_assigned() OR (TG_WHEN='BEFORE' AND snapshot IS DISTINCT FROM NEW.before_contract) OR (TG_WHEN='AFTER' AND snapshot IS DISTINCT FROM NEW.after_contract)
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CHANGE_APPLY_FAILED'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS native_employment_change_review_before ON public.native_employment_change_review;
CREATE TRIGGER native_employment_change_review_before BEFORE INSERT ON public.native_employment_change_review FOR EACH ROW EXECUTE FUNCTION public.native_employment_change_application_guard_v1();
DROP TRIGGER IF EXISTS native_employment_change_review_applied ON public.native_employment_change_review;
CREATE CONSTRAINT TRIGGER native_employment_change_review_applied AFTER INSERT ON public.native_employment_change_review DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.native_employment_change_application_guard_v1();
-- BEGIN PATCH_NATIVE_GUARD
CREATE OR REPLACE FUNCTION public.native_employee_contract_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.source_system='MUNICONTROL' THEN
  IF TG_OP='UPDATE' AND public.native_employment_change_update_allowed_v1(OLD,NEW) IS TRUE THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'NATIVE_EMPLOYEE_IMMUTABLE';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.source_system='MUNICONTROL' THEN
  IF NEW.source_batch_id IS NOT NULL OR NOT EXISTS(
   SELECT 1 FROM native_employee_registration r JOIN platform_tenant_source_binding b ON b.id=r.source_binding_id AND b.tenant_id=r.tenant_id
   WHERE r.contract_id=NEW.id AND r.person_id=NEW.person_id AND r.tenant_id=NEW.tenant_id AND b.source_company_id=NEW.legacy_company_id AND b.verified)
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_ORIGIN_INVALID'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM employment_contract c WHERE c.source_system='MUNICONTROL' AND c.legacy_company_id=NEW.legacy_company_id AND ltrim(c.legacy_legajo,'0')=ltrim(NEW.legacy_legajo,'0')) THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_NUMBER_EXISTS'; END IF;
  IF NEW.tenant_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM source_import_batch b WHERE b.id=NEW.source_batch_id AND b.source_system=NEW.source_system)
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_ORIGIN_INVALID'; END IF;
 END IF;
 RETURN NEW;
END $$;
-- END PATCH_NATIVE_GUARD
-- BEGIN EXACT_ACL
REVOKE ALL ON FUNCTION public.native_employment_change_immutable_v1(),
 public.native_employment_change_context_v1(jsonb,text),
 public.native_employment_change_lock_v1(jsonb,uuid),
 public.native_employment_change_capacity_v1(integer),
 public.native_employment_change_subject_v1(jsonb,uuid),
 public.native_employment_change_scope_v1(jsonb,jsonb),
 public.native_employment_change_version_v1(jsonb,jsonb,integer),
 public.native_employment_change_values_v1(jsonb),
 public.native_employment_change_display_v1(jsonb),
 public.native_employment_change_after_v1(jsonb,jsonb,jsonb),
 public.native_employment_change_state_v1(jsonb,uuid,jsonb),
 public.native_employment_change_can_review_v1(jsonb,public.native_employment_change_proposal),
 public.native_employment_change_summary_v1(jsonb,public.native_employment_change_proposal),
 public.native_employment_change_replay_v1(jsonb,uuid,uuid,text,text),
 public.native_employment_change_bootstrap_v1(jsonb,uuid),
 public.native_employment_change_proposal_v1(jsonb,uuid,uuid),
 public.native_employment_change_propose_v1(jsonb,jsonb,uuid),
 public.native_employment_change_review_v1(jsonb,jsonb,uuid),
 public.native_employment_change_attempt_v1(jsonb,uuid,uuid),
 public.native_employment_change_update_allowed_v1(public.employment_contract,public.employment_contract),
 public.native_employment_change_application_guard_v1() FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.native_employment_change_bootstrap_v1(jsonb,uuid),
 public.native_employment_change_proposal_v1(jsonb,uuid,uuid),
 public.native_employment_change_propose_v1(jsonb,jsonb,uuid),
 public.native_employment_change_review_v1(jsonb,jsonb,uuid),
 public.native_employment_change_attempt_v1(jsonb,uuid,uuid) TO municontrol_actions_runtime_app;
-- END EXACT_ACL
