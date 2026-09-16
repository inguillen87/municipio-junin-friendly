-- Native employee creation: canonical IDs, no fabricated GRH rows or source file.
-- Existing imported records and their provenance constraints are retained.
CREATE TABLE native_employee_registration (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES platform_tenant(id),
 source_binding_id uuid NOT NULL, contract_id uuid NOT NULL UNIQUE REFERENCES employment_contract(id) DEFERRABLE INITIALLY DEFERRED,
 person_id uuid NOT NULL REFERENCES person_identity(id), actor_membership_id uuid NOT NULL,
 actor_session_id uuid NOT NULL REFERENCES tenant_identity_session(id), release_sha text NOT NULL CHECK(release_sha ~ '^[a-f0-9]{40}$'),
 request_key uuid NOT NULL, request_sha256 text NOT NULL CHECK(request_sha256 ~ '^[a-f0-9]{64}$'),
 catalog_sha256 text NOT NULL CHECK(catalog_sha256 ~ '^[a-f0-9]{64}$'),
 legal_reference text NOT NULL CHECK(length(legal_reference) BETWEEN 3 AND 180 AND legal_reference !~ '[<>[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,actor_membership_id,request_key),
 FOREIGN KEY(tenant_id,source_binding_id) REFERENCES platform_tenant_source_binding(tenant_id,id),
 FOREIGN KEY(actor_membership_id,tenant_id) REFERENCES tenant_membership(id,tenant_id)
);
ALTER TABLE native_employee_registration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON native_employee_registration FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TRIGGER native_employee_registration_immutable BEFORE UPDATE OR DELETE ON native_employee_registration
 FOR EACH ROW EXECUTE FUNCTION reject_immutable_source_change();
CREATE TRIGGER native_employee_registration_no_truncate BEFORE TRUNCATE ON native_employee_registration
 FOR EACH STATEMENT EXECUTE FUNCTION reject_immutable_source_change();

ALTER TABLE employment_contract ADD COLUMN tenant_id uuid REFERENCES platform_tenant(id);
ALTER TABLE employment_contract ALTER COLUMN source_batch_id DROP NOT NULL;
ALTER TABLE employment_contract DROP CONSTRAINT employment_contract_grh_authority_ck;
ALTER TABLE employment_contract ADD CONSTRAINT employment_contract_origin_ck CHECK(
 (source_system='GRH' AND source_batch_id IS NOT NULL AND tenant_id IS NULL) OR
 (source_system='MUNICONTROL' AND source_batch_id IS NULL AND tenant_id IS NOT NULL));
CREATE INDEX employment_contract_native_tenant_idx ON employment_contract(tenant_id,legacy_legajo) WHERE source_system='MUNICONTROL';
CREATE OR REPLACE FUNCTION native_employee_contract_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP<>'INSERT' AND OLD.source_system='MUNICONTROL' THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_IMMUTABLE'; END IF;
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
DROP TRIGGER employment_contract_batch_system ON employment_contract;
CREATE TRIGGER employment_contract_batch_system BEFORE INSERT OR UPDATE OR DELETE ON employment_contract
 FOR EACH ROW EXECUTE FUNCTION native_employee_contract_guard_v1();
CREATE OR REPLACE FUNCTION native_employee_person_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.dni IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('native-employee-dni:'||NEW.dni,0)); END IF;
  IF EXISTS(SELECT 1 FROM native_employee_registration r JOIN person_identity i ON i.id=r.person_id WHERE i.dni=NEW.dni OR i.cuil=NEW.cuil)
   THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_IDENTITY_EXISTS'; END IF;
  RETURN NEW;
 END IF;
 IF EXISTS(SELECT 1 FROM native_employee_registration WHERE person_id=OLD.id) THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_IDENTITY_IMMUTABLE'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER native_employee_person_guard BEFORE INSERT OR UPDATE OR DELETE ON person_identity FOR EACH ROW EXECUTE FUNCTION native_employee_person_guard_v1();

CREATE OR REPLACE FUNCTION native_employee_context_v1(p jsonb,write_access boolean DEFAULT false) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p) key)
  IS DISTINCT FROM ARRAY['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']::text[]
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_SESSION_INVALID'; END IF;
 ctx:=action_center_assert_tenant_read_session_v2(p->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,
  p->>'releaseSha',(p->>'tenantId')::uuid,(p->>'membershipId')::uuid);
 IF NOT action_center_context_has_capability(ctx,'workforce.employee.read') OR
  (write_access AND NOT action_center_context_has_capability(ctx,'employee.record.create')) THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_FORBIDDEN'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_tenant_source_binding b WHERE b.id=(ctx->>'sourceBindingId')::uuid AND b.tenant_id=(ctx->>'tenantId')::uuid
  AND b.verified AND b.source_company_id=(ctx->>'sourceCompanyId')::bigint AND b.source_database=ctx->>'sourceDatabase')
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_BINDING_INVALID'; END IF;
 RETURN ctx;
END $$;
CREATE OR REPLACE FUNCTION native_employee_catalog_v1(ctx jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE run_id bigint; result jsonb;
BEGIN
 SELECT legacy_import_run_id INTO run_id FROM source_import_batch WHERE source_system='GRH' AND source_database=ctx->>'sourceDatabase'
  AND validation_state='published' AND legacy_import_run_id IS NOT NULL ORDER BY source_cutoff DESC,recorded_at DESC,id DESC LIMIT 1;
 IF run_id IS NULL THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_CATALOG_UNAVAILABLE'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('kind',catalog,'key',source_key,'label',label,'code',CASE catalog
  WHEN 'agreements' THEN source_payload#>>'{sourceKey,agreementCode}' WHEN 'categories' THEN source_payload#>>'{sourceKey,categoryCode}'
  WHEN 'organizations' THEN source_payload#>>'{sourceKey,organizationId}' WHEN 'sectors' THEN source_payload#>>'{sourceKey,sectorCode}' END,
  'agreementCode',CASE WHEN catalog='categories' THEN source_payload#>>'{sourceKey,agreementCode}' ELSE NULL END)
  ORDER BY catalog,source_key),'[]'::jsonb) INTO result
 FROM grh_catalog_rows WHERE import_run_id=run_id AND catalog IN('agreements','categories','organizations','sectors')
  AND length(btrim(COALESCE(label,'')))>0
  AND (catalog NOT IN('agreements','categories') OR source_payload#>>'{sourceKey,agreementCode}' NOT IN('9','10'))
  AND (catalog<>'organizations' OR source_payload->>'activeSourceValue'='1')
  AND COALESCE(source_payload->>'companyCode',source_payload#>>'{sourceKey,companyCode}',ctx->>'sourceCompanyId')=ctx->>'sourceCompanyId';
 RETURN jsonb_build_object('items',result,'version',encode(digest(convert_to(result::text,'UTF8'),'sha256'),'hex'));
END $$;
CREATE OR REPLACE FUNCTION native_employee_next_number_v1(company bigint) RETURNS bigint
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE(max(n),0)+1 FROM (
 SELECT legacy_legajo::bigint n FROM employment_contract WHERE legacy_company_id=company AND legacy_legajo~'^[0-9]{1,9}$'
 UNION ALL SELECT legajo::bigint FROM grh_employees WHERE company_id=company AND legajo~'^[0-9]{1,9}$') numbers
$$;
CREATE OR REPLACE FUNCTION native_employee_bootstrap_v1(p jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; catalog jsonb;
BEGIN
 ctx:=native_employee_context_v1(p);catalog:=native_employee_catalog_v1(ctx);
 RETURN jsonb_build_object('version','native-employee.v1','canCreate',action_center_context_has_capability(ctx,'employee.record.create'),
  'today',to_char((clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date,'YYYY-MM-DD'),
  'suggestedLegajo',native_employee_next_number_v1((ctx->>'sourceCompanyId')::bigint)::text,'catalog',catalog);
END $$;
CREATE OR REPLACE FUNCTION native_employee_receipt_v1(r native_employee_registration) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('version','native-employee.v1','registrationId',r.id,'contractId',c.id,'legajo',c.legacy_legajo,
  'name',p.full_name,'startDate',to_char(c.start_date,'YYYY-MM-DD'),'createdAt',r.created_at,'origin','MUNICONTROL',
  'accountCreated',false,'payrollCalculated',false) FROM employment_contract c JOIN person_identity p ON p.id=c.person_id WHERE c.id=r.contract_id AND c.tenant_id=r.tenant_id
$$;
CREATE OR REPLACE FUNCTION native_employee_attempt_v1(p jsonb,k uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ctx jsonb; r native_employee_registration%ROWTYPE;
BEGIN
 ctx:=native_employee_context_v1(p,true);
 SELECT * INTO r FROM native_employee_registration WHERE tenant_id=(ctx->>'tenantId')::uuid AND actor_membership_id=(ctx->>'membershipId')::uuid AND request_key=k;
 IF NOT FOUND THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_ATTEMPT_NOT_FOUND'; END IF;
 RETURN native_employee_receipt_v1(r)||jsonb_build_object('replayed',true);
END $$;

CREATE OR REPLACE FUNCTION native_employee_create_v1(p jsonb,d jsonb,catalog_version text,k uuid) RETURNS jsonb
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
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(d) key) IS DISTINCT FROM
  ARRAY['agreementCode','birthDate','categoryCode','cuil','dni','fullName','jobTitle','legajo','legalReference','organizationId','sectorCode','sexCode','startDate']::text[]
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
  agreement_code,category_code,organization_unit_source_id,sector_source_id,status,source_payload)
 VALUES(contract_value,person_value,'MUNICONTROL',NULL,(ctx->>'tenantId')::uuid,company_value,number_value,start_value,
  d->>'agreementCode',d->>'categoryCode',d->>'organizationId',d->>'sectorCode','active',
  jsonb_build_object('employment',jsonb_build_object('agreementName',labels->>'agreementCode','categoryName',labels->>'categoryCode',
  'organizationName',labels->>'organizationId','sectorName',labels->>'sectorCode','cargoName',NULLIF(d->>'jobTitle','')),
  'native',jsonb_build_object('registrationId',reg_value,'legalReference',d->>'legalReference','createdAt',r.created_at,'identityDeclared',true)));
 RETURN native_employee_receipt_v1(r)||jsonb_build_object('replayed',false);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_DUPLICATE';
 WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_BUSY';
END $$;

REVOKE ALL ON FUNCTION native_employee_contract_guard_v1(),native_employee_person_guard_v1(),native_employee_context_v1(jsonb,boolean),
 native_employee_catalog_v1(jsonb),native_employee_next_number_v1(bigint),native_employee_receipt_v1(native_employee_registration),
 native_employee_bootstrap_v1(jsonb),native_employee_attempt_v1(jsonb,uuid),native_employee_create_v1(jsonb,jsonb,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION native_employee_bootstrap_v1(jsonb),native_employee_attempt_v1(jsonb,uuid),native_employee_create_v1(jsonb,jsonb,text,uuid) TO municontrol_actions_runtime_app;
INSERT INTO iam_capability(capability_key,label,description,scope_kind,sensitivity)
 VALUES('employee.record.create','Crear legajos','Alta nativa de persona y contrato; no crea cuenta ni liquida haberes.','tenant','privileged');
INSERT INTO iam_role_capability(role_key,capability_key)
 SELECT role_key,'employee.record.create' FROM iam_role WHERE role_key IN('PLATFORM_OWNER_OPERATIVO_INTEGRAL','NOMINA_GESTION_INTEGRAL') AND scope_kind='tenant';
