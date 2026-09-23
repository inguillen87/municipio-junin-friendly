-- Municipal employment catalogs apply only to subsequent native registrations.
-- No person, contract, payroll, source batch or historical receipt is rewritten.
-- Run the complete file in one transaction. Historical migrations remain unchanged.
DO $prerequisite$
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
END $prerequisite$;

CREATE TABLE IF NOT EXISTS public.native_employment_catalog_proposal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.platform_tenant(id),
 source_binding_id uuid NOT NULL, base_version text NOT NULL CHECK(base_version~'^[a-f0-9]{64}$'),
 base_items jsonb NOT NULL CHECK(jsonb_typeof(base_items)='array'), items jsonb NOT NULL CHECK(jsonb_typeof(items)='array' AND jsonb_array_length(items) BETWEEN 4 AND 1500),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000 AND reason!~'[<>[:cntrl:]]'),
 actor_membership_id uuid NOT NULL, actor_person_id uuid NOT NULL REFERENCES public.person_identity(id), actor_email text NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id), actor_session_version integer NOT NULL CHECK(actor_session_version>0), release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'), author_label text NOT NULL CHECK(length(author_label) BETWEEN 1 AND 160),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'), request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,source_binding_id,id), UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES public.platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 CHECK(actor_email=lower(btrim(actor_email)) AND length(actor_email) BETWEEN 3 AND 320),
 CHECK(octet_length(items::text)+octet_length(base_items::text)<=4194304)
);
CREATE TABLE IF NOT EXISTS public.native_employment_catalog_review (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, source_binding_id uuid NOT NULL, proposal_id uuid NOT NULL UNIQUE,
 decision text NOT NULL CHECK(decision IN ('approve','reject')), reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 1000 AND reason!~'[<>[:cntrl:]]'),
 revision integer NOT NULL CHECK(revision BETWEEN 0 AND 1000), catalog_version text NOT NULL CHECK(catalog_version~'^[a-f0-9]{64}$'),
 actor_membership_id uuid NOT NULL, actor_person_id uuid NOT NULL REFERENCES public.person_identity(id), actor_email text NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES public.tenant_identity_session(id), actor_session_version integer NOT NULL CHECK(actor_session_version>0), release_sha text NOT NULL CHECK(release_sha~'^[a-f0-9]{40}$'), reviewer_label text NOT NULL CHECK(length(reviewer_label) BETWEEN 1 AND 160),
 request_key uuid NOT NULL CHECK(request_key::text~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'), request_sha256 text NOT NULL CHECK(request_sha256~'^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL CHECK(jsonb_typeof(receipt)='object'), reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(tenant_id,source_binding_id,proposal_id) REFERENCES public.native_employment_catalog_proposal(tenant_id,source_binding_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES public.tenant_membership(id,tenant_id),
 UNIQUE(tenant_id,source_binding_id,actor_membership_id,request_key),
 CHECK(actor_email=lower(btrim(actor_email)) AND length(actor_email) BETWEEN 3 AND 320), CHECK(decision<>'approve' OR revision>0)
);
CREATE UNIQUE INDEX IF NOT EXISTS native_employment_catalog_publication_revision ON public.native_employment_catalog_review(tenant_id,source_binding_id,revision) WHERE decision='approve';
ALTER TABLE public.native_employment_catalog_proposal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.native_employment_catalog_review ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.native_employment_catalog_proposal,public.native_employment_catalog_review FROM PUBLIC,municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_immutable_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_IMMUTABLE'; END $$;
DROP TRIGGER IF EXISTS native_employment_catalog_proposal_immutable ON public.native_employment_catalog_proposal;
CREATE TRIGGER native_employment_catalog_proposal_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_employment_catalog_proposal FOR EACH STATEMENT EXECUTE FUNCTION public.native_employment_catalog_immutable_v1();
DROP TRIGGER IF EXISTS native_employment_catalog_review_immutable ON public.native_employment_catalog_review;
CREATE TRIGGER native_employment_catalog_review_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON public.native_employment_catalog_review FOR EACH STATEMENT EXECUTE FUNCTION public.native_employment_catalog_immutable_v1();

INSERT INTO public.iam_capability(capability_key,label,description,scope_kind,sensitivity) VALUES
 ('employee.catalog.propose','Proponer catálogo de encuadres','Prepara una versión completa municipal para futuras altas.','tenant','privileged'),
 ('employee.catalog.approve','Aprobar y publicar catálogo de encuadres','Revisa una versión preparada por otra persona; aprobar la publica para futuras altas.','tenant','restricted')
ON CONFLICT(capability_key) DO NOTHING;
INSERT INTO public.iam_capability_conflict(capability_key,conflicts_with_key,reason) VALUES
 ('employee.catalog.approve','employee.catalog.propose','La preparación y la aprobación del catálogo requieren personas diferentes.') ON CONFLICT DO NOTHING;
INSERT INTO public.iam_role_capability(role_key,capability_key)
 SELECT r.role_key,CASE rc.capability_key WHEN 'employee.record.propose' THEN 'employee.catalog.propose' ELSE 'employee.catalog.approve' END
 FROM public.iam_role r JOIN public.iam_role_capability rc ON rc.role_key=r.role_key
 WHERE r.scope_kind='tenant' AND rc.capability_key IN ('employee.record.propose','employee.record.approve')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_context_v1(p jsonb,required_capability text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb; actor_label text;
BEGIN
 IF required_capability IS NOT NULL AND required_capability NOT IN ('employee.catalog.propose','employee.catalog.approve') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_FORBIDDEN'; END IF;
 ctx:=public.native_employee_context_v1(p);
 IF required_capability IS NOT NULL AND NOT public.action_center_context_has_capability(ctx,required_capability) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_FORBIDDEN'; END IF;
 IF required_capability IS NOT NULL AND (ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_EMPLOYMENT_REQUIRED'; END IF;
 SELECT full_name INTO actor_label FROM public.person_identity WHERE id=(ctx->>'actorPersonId')::uuid;
 RETURN ctx||jsonb_build_object('actorEmail',lower(btrim(p->>'actorEmail')),'actorLabel',left(coalesce(nullif(btrim(actor_label),''),'Responsable municipal'),160));
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_lock_v1(ctx jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' OR NOT pg_try_advisory_xact_lock(hashtextextended('native-employment-catalog:v1:'||(ctx->>'tenantId')||':'||(ctx->>'sourceBindingId'),0))
 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_BUSY'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_scope_v1(ctx jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT encode(public.digest(jsonb_build_object('version','native-employment-catalog-scope.v1','tenantId',ctx->>'tenantId','sourceBindingId',ctx->>'sourceBindingId','membershipId',ctx->>'membershipId','actorPersonId',ctx->>'actorPersonId','actorEmail',ctx->>'actorEmail')::text,'sha256'),'hex')
$$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_items_v1(raw_items jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i jsonb; result jsonb:='[]'; kind text; code text; agreement text; label_value text;
BEGIN
 IF jsonb_typeof(raw_items) IS DISTINCT FROM 'array' OR jsonb_array_length(raw_items) NOT BETWEEN 4 AND 1500 OR octet_length(raw_items::text)>2097152 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(raw_items) LOOP
  IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM ARRAY['agreementCode','code','key','kind','label']::text[]
   OR jsonb_typeof(i->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(i->'code') IS DISTINCT FROM 'string' OR jsonb_typeof(i->'label') IS DISTINCT FROM 'string'
   OR jsonb_typeof(i->'key') IS DISTINCT FROM 'string' OR length(i->>'key') NOT BETWEEN 1 AND 120 OR i->>'key'~'[<>[:cntrl:]]'
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
  kind:=i->>'kind';code:=i->>'code';agreement:=i->>'agreementCode';label_value:=normalize(btrim(i->>'label'),NFC);
  IF kind NOT IN ('agreements','categories','organizations','sectors') OR code!~'^[0-9]{1,9}$' OR length(label_value) NOT BETWEEN 1 AND 160 OR label_value~'[<>[:cntrl:]]'
   OR (kind='agreements' AND ltrim(code,'0') IN ('9','10')) OR (kind='categories' AND ltrim(agreement,'0') IN ('9','10'))
   OR (kind='categories' AND (jsonb_typeof(i->'agreementCode') IS DISTINCT FROM 'string' OR agreement!~'^[0-9]{1,9}$'))
   OR (kind<>'categories' AND i->'agreementCode' IS DISTINCT FROM 'null'::jsonb)
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
  result:=result||jsonb_build_array(jsonb_build_object('kind',kind,'key',kind||':'||coalesce(agreement,'')||':'||code,'code',code,'label',label_value,'agreementCode',agreement));
 END LOOP;
 IF (SELECT count(DISTINCT value->>'kind') FROM jsonb_array_elements(result))<>4
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) GROUP BY value->>'kind',value->>'code',value->>'agreementCode' HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) cat WHERE cat->>'kind'='categories' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result) agr WHERE agr->>'kind'='agreements' AND agr->>'code'=cat->>'agreementCode'))
 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 RETURN (SELECT jsonb_agg(value ORDER BY value->>'kind',value->>'agreementCode' NULLS FIRST,value->>'code') FROM jsonb_array_elements(result));
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_capacity_v1(extra_bytes integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-employment-catalog:capacity:v1',0)) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_BUSY'; END IF;
 IF extra_bytes IS NULL OR extra_bytes<0 OR (SELECT sum(pg_database_size(oid)) FROM pg_database)+extra_bytes+262144>520093696 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_replay_v1(ctx jsonb,k uuid,command_name text DEFAULT NULL,fingerprint text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE item record;
BEGIN
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 SELECT * INTO item FROM (
  SELECT 'propose' command,p.receipt,p.request_sha256,p.actor_person_id,p.actor_email FROM public.native_employment_catalog_proposal p WHERE p.tenant_id=(ctx->>'tenantId')::uuid AND p.source_binding_id=(ctx->>'sourceBindingId')::uuid AND p.actor_membership_id=(ctx->>'membershipId')::uuid AND p.request_key=k
  UNION ALL SELECT 'review',r.receipt,r.request_sha256,r.actor_person_id,r.actor_email FROM public.native_employment_catalog_review r WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid AND r.actor_membership_id=(ctx->>'membershipId')::uuid AND r.request_key=k
 ) records;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF NOT public.action_center_context_has_capability(ctx,CASE WHEN item.command='propose' THEN 'employee.catalog.propose' ELSE 'employee.catalog.approve' END)
  OR item.actor_person_id IS DISTINCT FROM (ctx->>'actorPersonId')::uuid OR item.actor_email IS DISTINCT FROM ctx->>'actorEmail' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_FORBIDDEN'; END IF;
 IF (command_name IS NOT NULL AND command_name<>item.command) OR (fingerprint IS NOT NULL AND fingerprint<>item.request_sha256) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_IDEMPOTENCY_REUSE'; END IF;
 RETURN item.receipt||jsonb_build_object('replayed',true);
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_can_review_v1(ctx jsonb,p public.native_employment_catalog_proposal) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(public.action_center_context_has_capability(ctx,'employee.catalog.approve') AND ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL
  AND p.actor_membership_id<>(ctx->>'membershipId')::uuid AND p.actor_person_id<>(ctx->>'actorPersonId')::uuid AND p.actor_email<>ctx->>'actorEmail'
  AND NOT EXISTS(SELECT 1 FROM public.native_employment_catalog_review r WHERE r.proposal_id=p.id),false)
$$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_bootstrap_v1(ctx jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb; proposals_json jsonb; n integer;
BEGIN
 c:=public.native_employment_catalog_context_v1(ctx);
 SELECT count(*) INTO n FROM public.native_employment_catalog_proposal p WHERE p.tenant_id=(c->>'tenantId')::uuid AND p.source_binding_id=(c->>'sourceBindingId')::uuid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',CASE r.decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,
  'reason',p.reason,'createdAt',p.created_at,'authorLabel',p.author_label,'baseVersion',p.base_version,'canReview',public.native_employment_catalog_can_review_v1(c,p)) ORDER BY p.created_at DESC,p.id),'[]') INTO proposals_json
 FROM (SELECT * FROM public.native_employment_catalog_proposal p WHERE p.tenant_id=(c->>'tenantId')::uuid AND p.source_binding_id=(c->>'sourceBindingId')::uuid ORDER BY p.created_at DESC,p.id LIMIT 20) p LEFT JOIN public.native_employment_catalog_review r ON r.proposal_id=p.id;
 RETURN jsonb_build_object('version','native-employment-catalog.v1','scopeVersion',public.native_employment_catalog_scope_v1(c),'catalog',public.native_employee_catalog_v1(c),
  'permissions',jsonb_build_object('canPropose',public.action_center_context_has_capability(c,'employee.catalog.propose') AND c->>'actorPersonId' IS NOT NULL AND c->>'employmentContractId' IS NOT NULL,
   'canReview',public.action_center_context_has_capability(c,'employee.catalog.approve') AND c->>'actorPersonId' IS NOT NULL AND c->>'employmentContractId' IS NOT NULL),
  'proposals',proposals_json,'historyTruncated',n>20);
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_proposal_v1(ctx jsonb,id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb; p public.native_employment_catalog_proposal; r public.native_employment_catalog_review;
BEGIN
 c:=public.native_employment_catalog_context_v1(ctx);
 SELECT q.* INTO p FROM public.native_employment_catalog_proposal q WHERE q.id=native_employment_catalog_proposal_v1.id AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_NOT_FOUND'; END IF;
 SELECT q.* INTO r FROM public.native_employment_catalog_review q WHERE q.proposal_id=p.id;
 RETURN jsonb_build_object('version','native-employment-catalog.v1','proposal',jsonb_build_object('id',p.id,
  'status',CASE r.decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,'reason',p.reason,'createdAt',p.created_at,'authorLabel',p.author_label,
  'baseVersion',p.base_version,'items',p.items,'baseItems',p.base_items,'canReview',public.native_employment_catalog_can_review_v1(c,p),
  'review',CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('decision',r.decision,'reason',r.reason,'reviewedAt',r.reviewed_at,'reviewerLabel',r.reviewer_label) END));
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_propose_v1(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb; payload jsonb; items_value jsonb; reason_value text; hash_value text; existing jsonb; catalog jsonb; receipt_value jsonb; new_id uuid:=gen_random_uuid();
BEGIN
 c:=public.native_employment_catalog_context_v1(ctx,'employee.catalog.propose');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['baseVersion','items','reason','scopeVersion']::text[]
  OR jsonb_typeof(body->'scopeVersion') IS DISTINCT FROM 'string' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(body->'baseVersion') IS DISTINCT FROM 'string' OR body->>'baseVersion'!~'^[a-f0-9]{64}$' OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string'
  OR octet_length(body::text)>2097152 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 reason_value:=normalize(btrim(body->>'reason'),NFC);
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 items_value:=public.native_employment_catalog_items_v1(body->'items'); payload:=jsonb_build_object('baseVersion',body->>'baseVersion','items',items_value,'reason',reason_value,'scopeVersion',body->>'scopeVersion');
 hash_value:=encode(public.digest(jsonb_build_object('operation','propose','body',payload)::text,'sha256'),'hex');
 PERFORM public.native_employment_catalog_lock_v1(c);
 existing:=public.native_employment_catalog_replay_v1(c,key,'propose',hash_value); IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF body->>'scopeVersion'<>public.native_employment_catalog_scope_v1(c) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_SCOPE_CHANGED'; END IF;
 PERFORM public.grh_curated_source_read_lock_v1(); catalog:=public.native_employee_catalog_v1(c);
 IF catalog->>'version'<>body->>'baseVersion' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_BASE_CHANGED'; END IF;
 IF (SELECT count(*) FROM public.native_employment_catalog_proposal p WHERE p.tenant_id=(c->>'tenantId')::uuid AND p.source_binding_id=(c->>'sourceBindingId')::uuid)>=1000 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_LIMIT'; END IF;
 PERFORM public.native_employment_catalog_capacity_v1(2*(octet_length(items_value::text)+octet_length((catalog->'items')::text)));
 receipt_value:=jsonb_build_object('version','native-employment-catalog.v1','operation','propose','proposalId',new_id,'status','pending','catalogVersion',catalog->>'version','revision',(catalog->>'revision')::integer,'replayed',false);
 INSERT INTO public.native_employment_catalog_proposal(id,tenant_id,source_binding_id,base_version,base_items,items,reason,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,author_label,request_key,request_sha256,receipt)
 VALUES(new_id,(c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,catalog->>'version',catalog->'items',items_value,reason_value,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,hash_value,receipt_value);
 RETURN receipt_value;
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_review_v1(ctx jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb; p public.native_employment_catalog_proposal; reason_value text; decision_value text; proposal_value uuid; hash_value text; existing jsonb; catalog jsonb; revision_value integer; catalog_hash text; receipt_value jsonb;
BEGIN
 c:=public.native_employment_catalog_context_v1(ctx,'employee.catalog.approve');
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(body) k) IS DISTINCT FROM ARRAY['decision','proposalId','reason','scopeVersion']::text[]
  OR jsonb_typeof(body->'scopeVersion') IS DISTINCT FROM 'string' OR body->>'scopeVersion'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(body->'proposalId') IS DISTINCT FROM 'string' OR body->>'proposalId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR jsonb_typeof(body->'decision') IS DISTINCT FROM 'string' OR body->>'decision' NOT IN ('approve','reject') OR jsonb_typeof(body->'reason') IS DISTINCT FROM 'string' OR octet_length(body::text)>2097152 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 reason_value:=normalize(btrim(body->>'reason'),NFC);decision_value:=body->>'decision';proposal_value:=(body->>'proposalId')::uuid;
 IF length(reason_value) NOT BETWEEN 10 AND 1000 OR reason_value~'[<>[:cntrl:]]' THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 hash_value:=encode(public.digest(jsonb_build_object('operation','review','body',jsonb_build_object('proposalId',proposal_value,'decision',decision_value,'reason',reason_value,'scopeVersion',body->>'scopeVersion'))::text,'sha256'),'hex');
 PERFORM public.native_employment_catalog_lock_v1(c);
 existing:=public.native_employment_catalog_replay_v1(c,key,'review',hash_value); IF existing IS NOT NULL THEN RETURN existing; END IF;
 IF body->>'scopeVersion'<>public.native_employment_catalog_scope_v1(c) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_SCOPE_CHANGED'; END IF;
 SELECT q.* INTO p FROM public.native_employment_catalog_proposal q WHERE q.id=proposal_value AND q.tenant_id=(c->>'tenantId')::uuid AND q.source_binding_id=(c->>'sourceBindingId')::uuid;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_NOT_FOUND'; END IF;
 IF EXISTS(SELECT 1 FROM public.native_employment_catalog_review r WHERE r.proposal_id=p.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_DECIDED'; END IF;
 IF NOT public.native_employment_catalog_can_review_v1(c,p) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_MAKER_CHECKER_REQUIRED'; END IF;
 PERFORM public.grh_curated_source_read_lock_v1(); catalog:=public.native_employee_catalog_v1(c);
 revision_value:=(catalog->>'revision')::integer;catalog_hash:=catalog->>'version';
 IF decision_value='approve' THEN
  IF p.base_version<>catalog_hash THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_BASE_CHANGED'; END IF;
  revision_value:=revision_value+1; IF revision_value>1000 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_LIMIT'; END IF;
  catalog_hash:=encode(public.digest(jsonb_build_object('version','native-employment-catalog.v1','tenantId',c->>'tenantId','sourceBindingId',c->>'sourceBindingId','proposalId',p.id,'revision',revision_value,'items',p.items)::text,'sha256'),'hex');
 END IF;
 PERFORM public.native_employment_catalog_capacity_v1(16384);
 receipt_value:=jsonb_build_object('version','native-employment-catalog.v1','operation','review','proposalId',p.id,'status',CASE decision_value WHEN 'approve' THEN 'approved' ELSE 'rejected' END,'catalogVersion',catalog_hash,'revision',revision_value,'replayed',false);
 INSERT INTO public.native_employment_catalog_review(tenant_id,source_binding_id,proposal_id,decision,reason,revision,catalog_version,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt)
 VALUES((c->>'tenantId')::uuid,(c->>'sourceBindingId')::uuid,p.id,decision_value,reason_value,revision_value,catalog_hash,(c->>'membershipId')::uuid,(c->>'actorPersonId')::uuid,c->>'actorEmail',(ctx->>'actorSessionId')::uuid,(ctx->>'actorSessionVersion')::integer,ctx->>'releaseSha',c->>'actorLabel',key,hash_value,receipt_value);
 RETURN receipt_value;
END $$;

CREATE OR REPLACE FUNCTION public.native_employment_catalog_attempt_v1(ctx jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE c jsonb; result jsonb;
BEGIN
 c:=public.native_employment_catalog_context_v1(ctx);result:=public.native_employment_catalog_replay_v1(c,key);
 IF result IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_NOT_FOUND'; END IF;
 RETURN result;
END $$;

-- The historical GRH selection is copied exactly into this private fallback.
CREATE OR REPLACE FUNCTION public.native_employment_catalog_grh_v1(ctx jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE run_id bigint; result jsonb; BEGIN SELECT legacy_import_run_id INTO run_id FROM public.grh_effective_source_batch_v1 WHERE source_system='GRH' AND source_database=ctx->>'sourceDatabase' AND validation_state='published' AND legacy_import_run_id IS NOT NULL ORDER BY source_cutoff DESC,recorded_at DESC,id DESC LIMIT 1; IF run_id IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_CATALOG_UNAVAILABLE'; END IF; SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',catalog,'key',source_key,'label',label,'code',CASE catalog WHEN 'agreements' THEN source_payload#>>'{sourceKey,agreementCode}' WHEN 'categories' THEN source_payload#>>'{sourceKey,categoryCode}' WHEN 'organizations' THEN source_payload#>>'{sourceKey,organizationId}' WHEN 'sectors' THEN source_payload#>>'{sourceKey,sectorCode}' END,'agreementCode',CASE WHEN catalog='categories' THEN source_payload#>>'{sourceKey,agreementCode}' ELSE NULL END) ORDER BY catalog,source_key),'[]'::jsonb) INTO result FROM public.grh_source_catalog_rows_v1 WHERE import_run_id=run_id AND catalog IN('agreements','categories','organizations','sectors') AND length(btrim(COALESCE(label,'')))>0 AND (catalog NOT IN('agreements','categories') OR source_payload#>>'{sourceKey,agreementCode}' NOT IN('9','10')) AND (catalog<>'organizations' OR source_payload->>'activeSourceValue'='1') AND COALESCE(source_payload->>'companyCode',source_payload#>>'{sourceKey,companyCode}',ctx->>'sourceCompanyId')=ctx->>'sourceCompanyId'; RETURN jsonb_build_object('items',result,'version',encode(digest(convert_to(result::text,'UTF8'),'sha256'),'hex')); END $$;

CREATE OR REPLACE FUNCTION public.native_employee_catalog_v1(ctx jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 SELECT jsonb_build_object('items',p.items,'version',r.catalog_version,'origin','MUNICONTROL','revision',r.revision,'publishedAt',r.reviewed_at) INTO result
 FROM public.native_employment_catalog_review r JOIN public.native_employment_catalog_proposal p ON p.id=r.proposal_id
 WHERE r.tenant_id=(ctx->>'tenantId')::uuid AND r.source_binding_id=(ctx->>'sourceBindingId')::uuid AND r.decision='approve' ORDER BY r.revision DESC LIMIT 1;
 IF result IS NOT NULL THEN RETURN result; END IF;
 RETURN public.native_employment_catalog_grh_v1(ctx)||jsonb_build_object('origin','GRH','revision',0,'publishedAt',NULL);
END $$;

DO $patch$
DECLARE signature regprocedure:='public.native_employee_create_v1(jsonb,jsonb,text,uuid)'::regprocedure; definition text;
BEGIN
 IF (SELECT encode(public.digest(replace(prosrc,E'\r\n',E'\n'),'sha256'),'hex') FROM pg_proc WHERE oid=signature)='8fac07fa37367cd2c4a2aa25dccb7b145fc4eafe934c6cd86e12f5081dec7261' THEN RETURN; END IF;
 definition:=pg_get_functiondef(signature);
 IF position('PERFORM public.grh_curated_source_read_lock_v1();' IN definition)=0 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE'; END IF;
 definition:=replace(definition,'PERFORM public.grh_curated_source_read_lock_v1();','PERFORM public.native_employment_catalog_lock_v1(ctx);'||E'\n PERFORM public.grh_curated_source_read_lock_v1();');
 EXECUTE definition;
END $patch$;

-- BEGIN ACL_FUNCTION_LIST
REVOKE ALL ON FUNCTION public.native_employment_catalog_immutable_v1(),
 public.native_employment_catalog_context_v1(jsonb,text),
 public.native_employment_catalog_lock_v1(jsonb),
 public.native_employment_catalog_scope_v1(jsonb),
 public.native_employment_catalog_items_v1(jsonb),
 public.native_employment_catalog_capacity_v1(integer),
 public.native_employment_catalog_replay_v1(jsonb,uuid,text,text),
 public.native_employment_catalog_can_review_v1(jsonb,public.native_employment_catalog_proposal),
 public.native_employment_catalog_bootstrap_v1(jsonb),
 public.native_employment_catalog_proposal_v1(jsonb,uuid),
 public.native_employment_catalog_propose_v1(jsonb,jsonb,uuid),
 public.native_employment_catalog_review_v1(jsonb,jsonb,uuid),
 public.native_employment_catalog_attempt_v1(jsonb,uuid),
 public.native_employment_catalog_grh_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.native_employment_catalog_bootstrap_v1(jsonb),
 public.native_employment_catalog_proposal_v1(jsonb,uuid),
 public.native_employment_catalog_propose_v1(jsonb,jsonb,uuid),
 public.native_employment_catalog_review_v1(jsonb,jsonb,uuid),
 public.native_employment_catalog_attempt_v1(jsonb,uuid) TO municontrol_actions_runtime_app;
-- END ACL_FUNCTION_LIST
