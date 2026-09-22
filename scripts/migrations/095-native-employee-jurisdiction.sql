-- 095: jurisdiction declared when creating a native employee. No fiscal mapping.
-- Apply atomically. Existing 13-field requests, hashes and receipts stay unchanged.
-- NULL means not reported. Only new explicit declarations can store 42 or 55.
DO $prerequisite$
DECLARE item record; body text; column_info record; check_expression text;
BEGIN
 IF to_regclass('public.native_employee_registration') IS NULL OR to_regclass('public.employment_contract') IS NULL
 THEN RAISE EXCEPTION 'NATIVE_JURISDICTION_PREREQUISITE'; END IF;
 -- Accept only exact reviewed 067 and 095 bodies, including the observed compact 067 variant.
 -- Formatting is not normalized beyond line endings and the isolated QA schema.
 FOR item IN SELECT * FROM (VALUES
 ('native_employee_create_v1','jsonb,jsonb,text,uuid','43c323e6e5e4b7495cf2178a0bb8ae82c0db54ea348efa69124b6ebb0d80cea1','3ac060547845052e8466262025400bebd7267f680c41c962627dc45d384f4632','460b108e71cdfa5d873d2e9d1538b27ee0abc372aff75970fc7519d3e2f7f796'),
 ('native_employee_receipt_v1','public.native_employee_registration','05142758d60110776e232ab7894d78e82c2a52c787fba493c5f3c1517a630f8b','1a57c2445f344f37d59c8c798237efefa0bb4671d101d9a177744c8fbac2c18e','4e7160053e38011b59431a6113b0cd96239c6d863e008be032d9509656ccef86'),
 ('native_employee_context_v1','jsonb,boolean','30d651a79381467d916475803e5d8ad3d5bd49b8fe611729fb159063d10fd6ed','30d651a79381467d916475803e5d8ad3d5bd49b8fe611729fb159063d10fd6ed','0511c6a642c569791839195fb36b61ff5aa22acf0a360980e7ad45458c28cf7c'),
 ('native_employee_contract_guard_v1','','05717239f4f770498a0f4b3d118165b61fb3343bdbfc3c0083bd4537d92321f3','05717239f4f770498a0f4b3d118165b61fb3343bdbfc3c0083bd4537d92321f3','0fe76b5db164a2c5f89cc20b38c8150e37c1dd99974aeee9f1a4d89dad83110a'),
 ('native_employee_person_guard_v1','','16a592a2cc7e0e18490d4a1cabb0bf06ab4b55c418decc259d7a65dbfa4ac8ea','16a592a2cc7e0e18490d4a1cabb0bf06ab4b55c418decc259d7a65dbfa4ac8ea','90a913b6b87cd8a3a9ef12e93b21dc0d89b52b8e11bbd96982e500b016648db6')
 ) pin(name,args,original_sha256,installed_sha256,observed_067_sha256) LOOP
  SELECT replace(replace(p.prosrc,E'\r\n',E'\n'),n.nspname||'.','public'||'.') INTO body
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE p.oid=to_regprocedure('public.'||item.name||'('||item.args||')') AND p.prosecdef;
  IF body IS NULL OR encode(public.digest(body,'sha256'),'hex') NOT IN(item.original_sha256,item.installed_sha256,item.observed_067_sha256)
  THEN RAISE EXCEPTION 'NATIVE_JURISDICTION_PREREQUISITE'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.employment_contract'::regclass
    AND tgname='employment_contract_batch_system' AND tgenabled='O' AND NOT tgisinternal
    AND tgtype=31 AND tgfoid=to_regprocedure('public.native_employee_contract_guard_v1()'))
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.native_employee_registration'::regclass AND relrowsecurity)
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.native_employee_registration'::regclass
    AND confrelid='public.platform_tenant_source_binding'::regclass AND contype='f' AND convalidated)
 THEN RAISE EXCEPTION 'NATIVE_JURISDICTION_PREREQUISITE'; END IF;
 SELECT a.* INTO column_info FROM pg_attribute a WHERE a.attrelid='public.employment_contract'::regclass AND a.attname='jurisdiction_code' AND NOT a.attisdropped;
 IF FOUND AND (column_info.atttypid<>'text'::regtype OR column_info.attnotnull OR column_info.atthasdef
   OR column_info.attgenerated<>'' OR column_info.attidentity<>'') THEN RAISE EXCEPTION 'NATIVE_JURISDICTION_PREREQUISITE'; END IF;
 SELECT pg_get_expr(conbin,conrelid) INTO check_expression FROM pg_constraint
 WHERE conrelid='public.employment_contract'::regclass AND conname='employment_contract_native_jurisdiction_ck' AND contype='c' AND convalidated;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.employment_contract'::regclass AND conname='employment_contract_native_jurisdiction_ck')
 AND (check_expression IS NULL OR check_expression NOT IN (
  $expected$((jurisdiction_code IS NULL) OR (((source_system)::text = 'MUNICONTROL'::text) AND (jurisdiction_code = ANY (ARRAY['42'::text, '55'::text]))))$expected$,
  $expected$((jurisdiction_code IS NULL) OR ((source_system = 'MUNICONTROL'::text) AND (jurisdiction_code = ANY (ARRAY['42'::text, '55'::text]))))$expected$
 )) THEN RAISE EXCEPTION 'NATIVE_JURISDICTION_PREREQUISITE'; END IF;
END $prerequisite$;

ALTER TABLE public.employment_contract ADD COLUMN IF NOT EXISTS jurisdiction_code text;
DO $constraint$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.employment_contract'::regclass AND conname='employment_contract_native_jurisdiction_ck') THEN
  ALTER TABLE public.employment_contract ADD CONSTRAINT employment_contract_native_jurisdiction_ck
   CHECK(jurisdiction_code IS NULL OR (source_system::text='MUNICONTROL' AND jurisdiction_code IN ('42','55')));
 END IF;
END $constraint$;
COMMENT ON COLUMN public.employment_contract.jurisdiction_code IS 'Jurisdicción declarada al alta propia (42 o 55). NULL: no informada. No deriva encuadre fiscal ni certifica F931. Inmutable por el guard del contrato nativo.';

CREATE OR REPLACE FUNCTION public.native_employee_create_v1(p jsonb,d jsonb,catalog_version text,k uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; catalogs jsonb; fingerprint text; r native_employee_registration%ROWTYPE; number_value text;
 person_value uuid:=gen_random_uuid(); contract_value uuid:=gen_random_uuid(); reg_value uuid:=gen_random_uuid();
 company_value bigint; today date:=(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;
 birth_value date; start_value date; item jsonb; labels jsonb:='{}'; field_name text; kind text; code_value text;
BEGIN
 ctx:=native_employee_context_v1(p,true); company_value:=(ctx->>'sourceCompanyId')::bigint;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_ISOLATION_UNSUPPORTED'; END IF;
 IF k IS NULL OR k::text!~'^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR catalog_version IS NULL OR catalog_version!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_INPUT_INVALID'; END IF;
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(d-'jurisdictionCode') key) IS DISTINCT FROM
  ARRAY['agreementCode','birthDate','categoryCode','cuil','dni','fullName','jobTitle','legajo','legalReference','organizationId','sectorCode','sexCode','startDate']::text[]
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_INPUT_INVALID'; END IF;
 IF d?'jurisdictionCode' AND (jsonb_typeof(d->'jurisdictionCode') IS DISTINCT FROM 'string' OR d->>'jurisdictionCode' NOT IN ('42','55'))
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_INPUT_INVALID'; END IF;
 FOR field_name IN SELECT jsonb_object_keys(d) LOOP
  IF jsonb_typeof(d->field_name) IS DISTINCT FROM 'string' OR d->>field_name<>btrim(d->>field_name) OR length(d->>field_name)>180 OR d->>field_name~'[<>[:cntrl:]]'
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_INPUT_INVALID'; END IF;
 END LOOP;
 IF length(d->>'fullName') NOT BETWEEN 3 AND 160 OR length(d->>'jobTitle')>120 OR length(d->>'legalReference') NOT BETWEEN 3 AND 180
  OR d->>'legajo'!~'^$|^[1-9][0-9]{0,8}$' OR d->>'dni'!~'^[0-9]{5,8}$' OR d->>'dni'~'^0+$'
  OR d->>'cuil'!~'^[0-9]{11}$' OR NOT is_valid_cuil(d->>'cuil') OR substring(d->>'cuil',3,8)<>lpad(d->>'dni',8,'0')
  OR d->>'sexCode' NOT IN('','F','M','X') THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_INPUT_INVALID'; END IF;
 BEGIN
  birth_value:=(d->>'birthDate')::date;start_value:=(d->>'startDate')::date;
  IF to_char(birth_value,'YYYY-MM-DD')<>d->>'birthDate' OR to_char(start_value,'YYYY-MM-DD')<>d->>'startDate'
   OR birth_value NOT BETWEEN DATE '1900-01-01' AND today OR start_value<birth_value OR start_value>DATE '2099-12-31'
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_INPUT_INVALID'; END IF;
 EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_INPUT_INVALID'; END;
 fingerprint:=encode(digest(convert_to(jsonb_build_object('draft',d,'catalogVersion',catalog_version)::text,'UTF8'),'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('native-employee-attempt:'||(ctx->>'tenantId')||':'||(ctx->>'membershipId')||':'||k::text,0));
 SELECT * INTO r FROM native_employee_registration WHERE tenant_id=(ctx->>'tenantId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=k;
 IF FOUND THEN
  IF r.request_sha256<>fingerprint THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_ATTEMPT_CONFLICT'; END IF;
  RETURN native_employee_receipt_v1(r)||jsonb_build_object('replayed',true);
 END IF;
 catalogs:=native_employee_catalog_v1(ctx);
 IF catalogs->>'version'<>catalog_version THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_CATALOG_CHANGED'; END IF;
 FOREACH field_name IN ARRAY ARRAY['agreementCode','categoryCode','organizationId','sectorCode'] LOOP
  kind:=CASE field_name WHEN 'agreementCode' THEN 'agreements' WHEN 'categoryCode' THEN 'categories' WHEN 'organizationId' THEN 'organizations' ELSE 'sectors' END;
  SELECT value INTO item FROM jsonb_array_elements(catalogs->'items') WHERE value->>'kind'=kind AND value->>'code'=d->>field_name
   AND (kind<>'categories' OR value->>'agreementCode'=d->>'agreementCode');
  IF item IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_CATALOG_SELECTION_INVALID'; END IF;
  labels:=labels||jsonb_build_object(field_name,item->>'label');
 END LOOP;
 -- Existing canonical CUIL uniqueness plus a DNI serialization lock; no fuzzy identity merges.
 PERFORM pg_advisory_xact_lock(hashtextextended('native-employee-dni:'||(d->>'dni'),0));
 IF EXISTS(SELECT 1 FROM person_identity WHERE identity_state IN('active','provisional') AND (cuil=d->>'cuil' OR dni=d->>'dni'))
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_IDENTITY_EXISTS'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('native-employee-company:'||company_value::text,0));
 number_value:=NULLIF(d->>'legajo','');
 IF number_value IS NULL THEN number_value:=native_employee_next_number_v1(company_value)::text; END IF;
 IF number_value!~'^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_NUMBER_LIMIT'; END IF;
 IF EXISTS(SELECT 1 FROM employment_contract WHERE legacy_company_id=company_value AND ltrim(legacy_legajo,'0')=number_value)
  OR EXISTS(SELECT 1 FROM grh_employees WHERE company_id=company_value AND ltrim(legajo,'0')=number_value) THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_NUMBER_EXISTS'; END IF;
 INSERT INTO person_identity(id,cuil,dni,full_name,birth_date,sex_code,identity_state)
 VALUES(person_value,d->>'cuil',d->>'dni',d->>'fullName',birth_value,NULLIF(d->>'sexCode',''),'provisional');
 INSERT INTO native_employee_registration(id,tenant_id,source_binding_id,contract_id,person_id,actor_membership_id,actor_session_id,release_sha,request_key,request_sha256,catalog_sha256,legal_reference)
 VALUES(reg_value,(ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,contract_value,person_value,(ctx->>'membershipId')::uuid,(p->>'actorSessionId')::uuid,p->>'releaseSha',k,fingerprint,catalog_version,d->>'legalReference') RETURNING * INTO r;
 INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,tenant_id,legacy_company_id,legacy_legajo,start_date,
  agreement_code,category_code,organization_unit_source_id,sector_source_id,status,jurisdiction_code,source_payload)
 VALUES(contract_value,person_value,'MUNICONTROL',NULL,(ctx->>'tenantId')::uuid,company_value,number_value,start_value,
  d->>'agreementCode',d->>'categoryCode',d->>'organizationId',d->>'sectorCode','active',d->>'jurisdictionCode',
  jsonb_build_object('employment',jsonb_build_object('agreementName',labels->>'agreementCode','categoryName',labels->>'categoryCode',
  'organizationName',labels->>'organizationId','sectorName',labels->>'sectorCode','cargoName',NULLIF(d->>'jobTitle','')),
  'native',jsonb_build_object('registrationId',reg_value,'legalReference',d->>'legalReference','createdAt',r.created_at,'identityDeclared',true)));
 RETURN native_employee_receipt_v1(r)||jsonb_build_object('replayed',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_DUPLICATE';
 WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_BUSY';
END $$;

CREATE OR REPLACE FUNCTION public.native_employee_receipt_v1(r native_employee_registration) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('version','native-employee.v1','registrationId',r.id,'contractId',c.id,'legajo',c.legacy_legajo,
  'name',p.full_name,'startDate',to_char(c.start_date,'YYYY-MM-DD'),'createdAt',r.created_at,'origin','MUNICONTROL',
  'accountCreated',false,'payrollCalculated',false)
  || CASE WHEN c.jurisdiction_code IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('jurisdictionCode',c.jurisdiction_code) END
 FROM employment_contract c JOIN person_identity p ON p.id=c.person_id WHERE c.id=r.contract_id AND c.tenant_id=r.tenant_id
$$;

REVOKE ALL ON FUNCTION public.native_employee_receipt_v1(public.native_employee_registration) FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION public.native_employee_create_v1(jsonb,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.native_employee_create_v1(jsonb,jsonb,text,uuid) TO municontrol_actions_runtime_app;
