-- Explicit registration use in a complete municipal catalog.
-- No catalog publication, hires, adoption, salary decisions, rows or ACL writes.
DO $classification_use$
DECLARE x jsonb;p pg_proc;updated pg_proc;mode_count integer;before_body text;after_body text;definition text;
BEGIN
 SELECT count(*) INTO mode_count FROM jsonb_array_elements('[{"signature":"public.native_employee_create_v1(jsonb,jsonb,text,uuid)","before":"8fac07fa37367cd2c4a2aa25dccb7b145fc4eafe934c6cd86e12f5081dec7261","after":"6cf784e1b026c158548692c84c000592919a26f6aa42109807c0687f943158d6"},{"signature":"public.native_employment_catalog_bootstrap_v1(jsonb)","before":"a7134c8a172a514f31883bc2b5eae7412d49c85c023ea970007a90c080f79030","after":"2622fba8bd03c7e11baa9bfe7fbe1d9cc660d1f654251ca6ac2a2f7932d53f43"},{"signature":"public.native_employment_catalog_context_v1(jsonb,text)","before":"37d7be04b2f5f3c5b5eb13ad7fc824e8823c7da44bfe45750f617961a79b5798","after":"939dc2cc92b03ab045b23c3178c05a79bbaa6284a3997fc3f00c230e84b665c0"},{"signature":"public.native_employment_catalog_items_v1(jsonb)","before":"89524aaf57c46d3def1c4e8ff0b4e31bf218b1a7b676dcfe22663ee812924141","after":"30aa07e730091240796987fa7c699bf0962308944ba34202ee0051ec4eefb697"},{"signature":"public.native_employment_catalog_can_review_v1(jsonb,public.native_employment_catalog_proposal)","before":"91dd8b1bc84772d07e426ac9e0e5501ee811e7e1e4404961bf0b6a4bc6320a9e","after":"7c56c24e36bbe84201c07d014addd9c12ac2cc7219dc196b7d8785c6e6f551b5"}]'::jsonb) AS pins(item) JOIN pg_proc AS f ON f.oid=to_regprocedure(pins.item->>'signature') WHERE encode(public.digest(replace(f.prosrc,E'\r\n',E'\n'),'sha256'),'hex')=pins.item->>'after';
 IF mode_count NOT IN(0,5) THEN RAISE EXCEPTION 'CLASSIFICATION_USE_PARTIAL_STATE';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements('[{"name":"native_employee_create_v1","signature":"public.native_employee_create_v1(jsonb,jsonb,text,uuid)","sha256":"8fac07fa37367cd2c4a2aa25dccb7b145fc4eafe934c6cd86e12f5081dec7261","argNames":["p","d","catalog_version","k"],"defaults":"","resultType":"jsonb","language":"plpgsql","returnsSet":false,"strict":false,"definer":true,"volatility":"v","config":["search_path=public, pg_temp"],"runtime":true,"after":"6cf784e1b026c158548692c84c000592919a26f6aa42109807c0687f943158d6"},{"name":"native_employment_catalog_bootstrap_v1","signature":"public.native_employment_catalog_bootstrap_v1(jsonb)","sha256":"a7134c8a172a514f31883bc2b5eae7412d49c85c023ea970007a90c080f79030","argNames":["ctx"],"defaults":"","resultType":"jsonb","language":"plpgsql","returnsSet":false,"strict":false,"definer":true,"volatility":"v","config":["search_path=pg_catalog, public, pg_temp"],"runtime":true,"after":"2622fba8bd03c7e11baa9bfe7fbe1d9cc660d1f654251ca6ac2a2f7932d53f43"},{"name":"native_employment_catalog_context_v1","signature":"public.native_employment_catalog_context_v1(jsonb,text)","sha256":"37d7be04b2f5f3c5b5eb13ad7fc824e8823c7da44bfe45750f617961a79b5798","argNames":["p","required_capability"],"defaults":"NULL::text","resultType":"jsonb","language":"plpgsql","returnsSet":false,"strict":false,"definer":true,"volatility":"v","config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"after":"939dc2cc92b03ab045b23c3178c05a79bbaa6284a3997fc3f00c230e84b665c0"},{"name":"native_employment_catalog_items_v1","signature":"public.native_employment_catalog_items_v1(jsonb)","sha256":"89524aaf57c46d3def1c4e8ff0b4e31bf218b1a7b676dcfe22663ee812924141","argNames":["raw_items"],"defaults":"","resultType":"jsonb","language":"plpgsql","returnsSet":false,"strict":false,"definer":true,"volatility":"i","config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"after":"30aa07e730091240796987fa7c699bf0962308944ba34202ee0051ec4eefb697"},{"name":"native_employment_catalog_can_review_v1","signature":"public.native_employment_catalog_can_review_v1(jsonb,public.native_employment_catalog_proposal)","sha256":"91dd8b1bc84772d07e426ac9e0e5501ee811e7e1e4404961bf0b6a4bc6320a9e","argNames":["ctx","p"],"defaults":"","resultType":"boolean","language":"sql","returnsSet":false,"strict":false,"definer":true,"volatility":"s","config":["search_path=pg_catalog, public, pg_temp"],"runtime":false,"after":"7c56c24e36bbe84201c07d014addd9c12ac2cc7219dc196b7d8785c6e6f551b5"}]'::jsonb) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(x->>'signature');
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR p.prokind<>'f' OR NOT p.prosecdef OR p.proretset OR p.proisstrict OR p.proleakproof OR p.proparallel<>'u'
   OR p.prorettype<>(x->>'resultType')::regtype OR p.provolatile::text IS DISTINCT FROM (x->>'volatility')
   OR p.proargnames IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(x->'argNames'))
   OR p.proconfig IS DISTINCT FROM ARRAY(SELECT jsonb_array_elements_text(x->'config'))
   OR coalesce(pg_get_expr(p.proargdefaults,0),'')<>x->>'defaults'
   OR(SELECT lanname FROM pg_language WHERE oid=p.prolang)<>x->>'language'
   OR has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE')<>(x->>'runtime')::boolean
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 OR(a.grantee<>p.proowner AND(a.grantee<>'municontrol_actions_runtime_app'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable)))
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>(CASE WHEN mode_count=5 THEN x->>'after' ELSE x->>'sha256' END)
  THEN RAISE EXCEPTION 'CLASSIFICATION_USE_FUNCTION_CHANGED';END IF;
  IF mode_count=0 THEN
   before_body:=p.prosrc;
   CASE x->>'name'
    WHEN 'native_employee_create_v1' THEN after_body:=$body0$
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
 PERFORM public.native_employment_catalog_lock_v1(ctx);
 PERFORM public.grh_curated_source_read_lock_v1();
 catalogs:=native_employee_catalog_v1(ctx);
 IF catalogs->>'version'<>catalog_version THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_CATALOG_CHANGED'; END IF;
 FOREACH field_name IN ARRAY ARRAY['agreementCode','categoryCode','organizationId','sectorCode'] LOOP
  kind:=CASE field_name WHEN 'agreementCode' THEN 'agreements' WHEN 'categoryCode' THEN 'categories' WHEN 'organizationId' THEN 'organizations' ELSE 'sectors' END;
  SELECT value INTO item FROM jsonb_array_elements(catalogs->'items') WHERE value->>'kind'=kind AND value->>'code'=d->>field_name
   AND (kind<>'categories' OR value->>'agreementCode'=d->>'agreementCode');
  IF item IS NULL OR item->'registrationAllowed'='false'::jsonb THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_CATALOG_SELECTION_INVALID'; END IF;
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
  OR EXISTS(SELECT 1 FROM public.grh_source_employees_v1 WHERE company_id=company_value AND ltrim(legajo,'0')=number_value) THEN RAISE EXCEPTION 'NATIVE_EMPLOYEE_NUMBER_EXISTS'; END IF;
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
END $body0$;
    WHEN 'native_employment_catalog_bootstrap_v1' THEN after_body:=$body1$
DECLARE c jsonb; proposals_json jsonb; n integer;
BEGIN
 c:=public.native_employment_catalog_context_v1(ctx);
 SELECT count(*) INTO n FROM public.native_employment_catalog_proposal p WHERE p.tenant_id=(c->>'tenantId')::uuid AND p.source_binding_id=(c->>'sourceBindingId')::uuid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'status',CASE r.decision WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'pending' END,
  'reason',p.reason,'createdAt',p.created_at,'authorLabel',p.author_label,'baseVersion',p.base_version,'canReview',public.native_employment_catalog_can_review_v1(c,p)) ORDER BY p.created_at DESC,p.id),'[]') INTO proposals_json
 FROM (SELECT * FROM public.native_employment_catalog_proposal p WHERE p.tenant_id=(c->>'tenantId')::uuid AND p.source_binding_id=(c->>'sourceBindingId')::uuid ORDER BY p.created_at DESC,p.id LIMIT 20) p LEFT JOIN public.native_employment_catalog_review r ON r.proposal_id=p.id;
 RETURN jsonb_build_object('version','native-employment-catalog.v1','scopeVersion',public.native_employment_catalog_scope_v1(c),'catalog',public.native_employee_catalog_v1(c),
  'permissions',jsonb_build_object('canPropose',public.action_center_context_has_capability(c,'employee.catalog.propose') AND c->>'actorPersonId' IS NOT NULL AND coalesce((c->>'catalogActorVerified')::boolean,false),
   'canReview',public.action_center_context_has_capability(c,'employee.catalog.approve') AND c->>'actorPersonId' IS NOT NULL AND coalesce((c->>'catalogActorVerified')::boolean,false)),
  'proposals',proposals_json,'historyTruncated',n>20);
END $body1$;
    WHEN 'native_employment_catalog_context_v1' THEN after_body:=$body2$
DECLARE ctx jsonb; administrative jsonb; actor_label text;
BEGIN
 IF required_capability IS NOT NULL AND required_capability NOT IN ('employee.catalog.propose','employee.catalog.approve') THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_FORBIDDEN'; END IF;
 ctx:=public.native_employee_context_v1(p);
 ctx:=ctx||jsonb_build_object('catalogActorVerified',ctx->>'actorPersonId' IS NOT NULL AND ctx->>'employmentContractId' IS NOT NULL);
 IF NOT coalesce((ctx->>'catalogActorVerified')::boolean,false) THEN
  administrative:=public.employment_adoption_administrative_context_v1(p);
  IF coalesce((administrative->>'adoptionActorVerified')::boolean,false) THEN
   ctx:=ctx||jsonb_build_object('actorPersonId',administrative->'actorPersonId','catalogActorVerified',true);
  END IF;
 END IF;
 IF required_capability IS NOT NULL AND NOT public.action_center_context_has_capability(ctx,required_capability) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_FORBIDDEN'; END IF;
 IF required_capability IS NOT NULL AND (ctx->>'actorPersonId' IS NULL OR NOT coalesce((ctx->>'catalogActorVerified')::boolean,false)) THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_EMPLOYMENT_REQUIRED'; END IF;
 SELECT full_name INTO actor_label FROM public.person_identity WHERE id=(ctx->>'actorPersonId')::uuid;
 RETURN ctx||jsonb_build_object('actorEmail',lower(btrim(p->>'actorEmail')),'actorLabel',left(coalesce(nullif(btrim(actor_label),''),'Responsable municipal'),160));
END $body2$;
    WHEN 'native_employment_catalog_items_v1' THEN after_body:=$body3$
DECLARE i jsonb; result jsonb:='[]'; kind text; code text; agreement text; label_value text; declared boolean;
BEGIN
 IF jsonb_typeof(raw_items) IS DISTINCT FROM 'array' OR jsonb_array_length(raw_items) NOT BETWEEN 4 AND 1500 OR octet_length(raw_items::text)>2097152 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 declared:=EXISTS(SELECT 1 FROM jsonb_array_elements(raw_items) x WHERE x ? 'registrationAllowed');
 FOR i IN SELECT value FROM jsonb_array_elements(raw_items) LOOP
  IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(i) key) IS DISTINCT FROM (CASE WHEN declared THEN ARRAY['agreementCode','code','key','kind','label','registrationAllowed']::text[] ELSE ARRAY['agreementCode','code','key','kind','label']::text[] END)
   OR jsonb_typeof(i->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(i->'code') IS DISTINCT FROM 'string' OR jsonb_typeof(i->'label') IS DISTINCT FROM 'string'
   OR (declared AND jsonb_typeof(i->'registrationAllowed') IS DISTINCT FROM 'boolean')
   OR jsonb_typeof(i->'key') IS DISTINCT FROM 'string' OR length(i->>'key') NOT BETWEEN 1 AND 120 OR i->>'key'~'[<>[:cntrl:]]'
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
  kind:=i->>'kind';code:=i->>'code';agreement:=i->>'agreementCode';label_value:=normalize(btrim(i->>'label'),NFC);
  IF kind NOT IN ('agreements','categories','organizations','sectors') OR code!~'^[0-9]{1,9}$' OR length(label_value) NOT BETWEEN 1 AND 160 OR label_value~'[<>[:cntrl:]]'
   OR (NOT declared AND ((kind='agreements' AND ltrim(code,'0') IN ('9','10')) OR (kind='categories' AND ltrim(agreement,'0') IN ('9','10'))))
   OR (kind='categories' AND (jsonb_typeof(i->'agreementCode') IS DISTINCT FROM 'string' OR agreement!~'^[0-9]{1,9}$'))
   OR (kind<>'categories' AND i->'agreementCode' IS DISTINCT FROM 'null'::jsonb)
  THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
  result:=result||jsonb_build_array(jsonb_build_object('kind',kind,'key',kind||':'||coalesce(agreement,'')||':'||code,'code',code,'label',label_value,'agreementCode',agreement)||CASE WHEN declared THEN jsonb_build_object('registrationAllowed',i->'registrationAllowed') ELSE '{}'::jsonb END);
 END LOOP;
 IF (SELECT count(DISTINCT value->>'kind') FROM jsonb_array_elements(result))<>4
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) GROUP BY value->>'kind',value->>'code',value->>'agreementCode' HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(result) cat WHERE cat->>'kind'='categories' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result) agr WHERE agr->>'kind'='agreements' AND agr->>'code'=cat->>'agreementCode'))
  OR (declared AND EXISTS(SELECT 1 FROM jsonb_array_elements(result) cat WHERE cat->>'kind'='categories' AND cat->'registrationAllowed'='true'::jsonb AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result) agr WHERE agr->>'kind'='agreements' AND agr->>'code'=cat->>'agreementCode' AND agr->'registrationAllowed'='true'::jsonb)))
 THEN RAISE EXCEPTION 'NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID'; END IF;
 RETURN (SELECT jsonb_agg(value ORDER BY value->>'kind',value->>'agreementCode' NULLS FIRST,value->>'code') FROM jsonb_array_elements(result));
END $body3$;
    WHEN 'native_employment_catalog_can_review_v1' THEN after_body:=$body4$
 SELECT coalesce(public.action_center_context_has_capability(ctx,'employee.catalog.approve') AND ctx->>'actorPersonId' IS NOT NULL AND coalesce((ctx->>'catalogActorVerified')::boolean,false)
  AND p.actor_membership_id<>(ctx->>'membershipId')::uuid AND p.actor_person_id<>(ctx->>'actorPersonId')::uuid AND p.actor_email<>ctx->>'actorEmail'
  AND NOT EXISTS(SELECT 1 FROM public.native_employment_catalog_review r WHERE r.proposal_id=p.id),false)
$body4$;
    ELSE RAISE EXCEPTION 'CLASSIFICATION_USE_FUNCTION_CHANGED';
   END CASE;
   definition:=pg_get_functiondef(p.oid);
   IF (length(definition)-length(replace(definition,before_body,'')))/length(before_body)<>1 THEN RAISE EXCEPTION 'CLASSIFICATION_USE_BODY_CHANGED';END IF;
   EXECUTE replace(definition,before_body,after_body);
   SELECT * INTO updated FROM pg_proc WHERE oid=p.oid;
   IF(to_jsonb(p)-'prosrc') IS DISTINCT FROM(to_jsonb(updated)-'prosrc') OR encode(public.digest(replace(updated.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>x->>'after' THEN RAISE EXCEPTION 'CLASSIFICATION_USE_METADATA_CHANGED';END IF;
  END IF;
 END LOOP;
END $classification_use$;
