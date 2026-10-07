-- First-install adapter after SQL136-141 and published SQL126.
-- Private receipt consumers: complete UUID selection, exact source legajos,
-- approved adopted identity tied to the immutable capture. No signatures/payment.
-- Old stored snapshots, command bodies, keys, owners and grants remain unchanged.
DO $prerequisite$ BEGIN
 IF to_regprocedure('public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)') IS NULL OR to_regclass('public.employment_adoption_application') IS NULL THEN RAISE EXCEPTION 'OWN_RECEIPT_ADOPTION_PREREQUISITE';END IF;
END $prerequisite$;
DO $patch0$
DECLARE original pg_proc;updated pg_proc;metadata jsonb;
BEGIN
 SELECT * INTO original FROM pg_proc WHERE oid=to_regprocedure('public.own_receipt_params_v1(jsonb)');
 IF original.oid IS NULL OR original.proowner<>current_user::regrole OR NOT original.prosecdef
 OR original.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
 OR encode(sha256(convert_to(replace(original.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>'416064b952355b1727def79f4b80369fa59489b4f10258ef5409a89222fd9a5a'
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) acl WHERE acl.grantee<>original.proowner)
 THEN RAISE EXCEPTION 'OWN_RECEIPT_ADOPTION_DEFINITION_CHANGED';END IF;
 metadata:=to_jsonb(original)-'prosrc';
 EXECUTE $definition$CREATE OR REPLACE FUNCTION public.own_receipt_params_v1(v jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE k text;a text;b text;BEGIN
 IF NOT(public.own_program_exact_v1(v,ARRAY['period','types','filters','issuer','paymentDate','legend']) OR public.own_program_exact_v1(v,ARRAY['period','types','filters','issuer','paymentDate','legend','contracts'])) OR jsonb_typeof(v->'period') IS DISTINCT FROM 'string' OR v->>'period'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(v->'types') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RECEIPT_INPUT_INVALID';END IF;
 IF jsonb_array_length(v->'types') NOT BETWEEN 1 AND 7 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'types') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other')) OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(v->'types'))<>jsonb_array_length(v->'types') OR v->'types' IS DISTINCT FROM(SELECT jsonb_agg(x ORDER BY x COLLATE "C") FROM jsonb_array_elements_text(v->'types') x) THEN RAISE EXCEPTION 'OWN_RECEIPT_INPUT_INVALID';END IF;
 IF NOT public.own_program_exact_v1(v->'filters',ARRAY['employeeFrom','employeeTo','agreementFrom','agreementTo','departmentFrom','departmentTo']) OR NOT public.own_program_exact_v1(v->'issuer',ARRAY['name','taxId','address']) OR NOT public.own_receipt_text_v1(v#>'{issuer,name}',3,160) OR NOT public.own_receipt_text_v1(v#>'{issuer,address}',3,240) OR jsonb_typeof(v#>'{issuer,taxId}') IS DISTINCT FROM 'string' OR v#>>'{issuer,taxId}'!~'^[0-9]{11}$' OR NOT public.own_receipt_text_v1(v->'legend',0,240) THEN RAISE EXCEPTION 'OWN_RECEIPT_INPUT_INVALID';END IF;
 IF v ? 'contracts' THEN
  IF jsonb_typeof(v->'contracts') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_RECEIPT_SELECTION_INVALID';END IF;
  IF jsonb_array_length(v->'contracts')>200 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v->'contracts') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}'!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$') OR(SELECT count(DISTINCT value) FROM jsonb_array_elements(v->'contracts'))<>jsonb_array_length(v->'contracts') OR v->'contracts' IS DISTINCT FROM(SELECT coalesce(jsonb_agg(x ORDER BY x COLLATE "C"),'[]') FROM jsonb_array_elements_text(v->'contracts') x) THEN RAISE EXCEPTION 'OWN_RECEIPT_SELECTION_INVALID';END IF;
 END IF;
 FOREACH k IN ARRAY ARRAY['employee','agreement','department'] LOOP
  a:=v#>>ARRAY['filters',k||'From'];b:=v#>>ARRAY['filters',k||'To'];
  IF jsonb_typeof(v#>ARRAY['filters',k||'From']) IS DISTINCT FROM 'string' OR jsonb_typeof(v#>ARRAY['filters',k||'To']) IS DISTINCT FROM 'string' OR a!~'^([0-9]{1,9})?$' OR b!~'^([0-9]{1,9})?$' OR(a<>'' AND b<>'' AND a::numeric>b::numeric) THEN RAISE EXCEPTION 'OWN_RECEIPT_INPUT_INVALID';END IF;
 END LOOP;
 IF v->'paymentDate' IS DISTINCT FROM 'null'::jsonb THEN
  IF jsonb_typeof(v->'paymentDate') IS DISTINCT FROM 'string' OR v->>'paymentDate'!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-[0-9]{2}$' THEN RAISE EXCEPTION 'OWN_RECEIPT_INPUT_INVALID';END IF;
  BEGIN IF to_char((v->>'paymentDate')::date,'YYYY-MM-DD')<>v->>'paymentDate' THEN RAISE EXCEPTION 'OWN_RECEIPT_INPUT_INVALID';END IF;EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'OWN_RECEIPT_INPUT_INVALID';END;
 END IF;
END $$$definition$;
 SELECT * INTO updated FROM pg_proc WHERE oid=original.oid;
 IF to_jsonb(updated)-'prosrc' IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'OWN_RECEIPT_ADOPTION_METADATA_CHANGED';END IF;
END $patch0$;
DO $patch1$
DECLARE original pg_proc;updated pg_proc;metadata jsonb;
BEGIN
 SELECT * INTO original FROM pg_proc WHERE oid=to_regprocedure('public.own_receipt_snapshot_v1(jsonb,jsonb)');
 IF original.oid IS NULL OR original.proowner<>current_user::regrole OR NOT original.prosecdef
 OR original.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
 OR encode(sha256(convert_to(replace(original.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>'3d8a2efc98930a1562627c300e9d6abc4137b66dafa967ed27cfb35852ac871a'
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) acl WHERE acl.grantee<>original.proowner)
 THEN RAISE EXCEPTION 'OWN_RECEIPT_ADOPTION_DEFINITION_CHANGED';END IF;
 metadata:=to_jsonb(original)-'prosrc';
 EXECUTE $definition$CREATE OR REPLACE FUNCTION public.own_receipt_snapshot_v1(ctx jsonb,params jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE g public.own_payroll_close_event;c public.own_payroll_run_capture;employee jsonb;line jsonb;item jsonb;identity_row record;record_value jsonb;concepts jsonb;records jsonb:='[]';sources jsonb:='[]';n integer;concept_count integer:=0;result_value jsonb;subject jsonb;has_adopted boolean:=false;BEGIN
 PERFORM public.own_receipt_params_v1(params);PERFORM public.own_run_lock_v1(ctx);
 LOCK TABLE public.person_identity,public.employment_contract,public.native_employee_registration,public.employment_adoption_application,public.employment_adoption_decision,public.employment_adoption_proposal IN SHARE MODE NOWAIT;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(params->'contracts','[]')) chosen WHERE NOT EXISTS(SELECT 1 FROM public.own_payroll_close_event e CROSS JOIN LATERAL jsonb_array_elements(e.snapshot->'employees') e_row(value) WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=params->>'period' AND params->'types' ? e.liquidation_type AND e.command='close' AND e_row.value->>'contractId'=chosen AND NOT EXISTS(SELECT 1 FROM public.own_payroll_close_event r WHERE r.tenant_id=e.tenant_id AND r.source_binding_id=e.source_binding_id AND r.group_id=e.id AND r.command='reopen'))) THEN RAISE EXCEPTION 'OWN_RECEIPT_SELECTION_INVALID';END IF;
 FOR g IN SELECT e.* FROM public.own_payroll_close_event e WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.period=params->>'period' AND params->'types' ? e.liquidation_type AND e.command='close' AND NOT EXISTS(SELECT 1 FROM public.own_payroll_close_event r WHERE r.tenant_id=e.tenant_id AND r.source_binding_id=e.source_binding_id AND r.group_id=e.id AND r.command='reopen') ORDER BY e.liquidation_type,e.id LOOP
  IF g.snapshot_sha256<>public.own_run_hash_v1(g.snapshot) OR g.snapshot->>'version'<>'own-close-snapshot.v1' OR g.snapshot->>'period'<>g.period OR g.snapshot->>'liquidationType'<>g.liquidation_type OR jsonb_array_length(g.snapshot->'employees')<>(g.snapshot->>'employeeCount')::integer OR jsonb_array_length(g.snapshot->'concepts')<>(g.snapshot->>'conceptCount')::integer THEN RAISE EXCEPTION 'OWN_RECEIPT_CONTRACT_INVALID';END IF;n:=0;
  FOR employee IN SELECT value FROM jsonb_array_elements(g.snapshot->'employees') ORDER BY CASE WHEN value->>'employeeNumber'~'^[0-9]{1,9}$' THEN(value->>'employeeNumber')::numeric END,(CASE WHEN value->>'employeeNumber'~'^[0-9]{1,9}$' THEN NULL ELSE value->>'employeeNumber' END) COLLATE "C",value->>'contractId' LOOP
   IF jsonb_array_length(coalesce(params->'contracts','[]'))>0 AND NOT params->'contracts' ? (employee->>'contractId') THEN CONTINUE;END IF;
   IF EXISTS(SELECT 1 FROM unnest(ARRAY['agreement','department'],ARRAY['agreementCode','departmentCode']) f(range_key,field_key) WHERE nullif(params#>>ARRAY['filters',range_key||'From'],'')::numeric>(employee->>field_key)::numeric OR nullif(params#>>ARRAY['filters',range_key||'To'],'')::numeric<(employee->>field_key)::numeric) THEN CONTINUE;END IF;
   IF employee->>'employeeNumber' IS NULL OR length(employee->>'employeeNumber') NOT BETWEEN 1 AND 64 OR employee->>'employeeNumber'~'[[:cntrl:]]' OR employee->>'employeeNumber'~E'[\u0080-\u009f]' THEN RAISE EXCEPTION 'OWN_RECEIPT_IDENTITY_REQUIRED';END IF;
   IF coalesce(params#>>'{filters,employeeFrom}','')<>'' OR coalesce(params#>>'{filters,employeeTo}','')<>'' THEN
    IF employee->>'employeeNumber'!~'^[0-9]{1,9}$' THEN RAISE EXCEPTION 'OWN_RECEIPT_RANGE_INVALID';END IF;
    IF nullif(params#>>'{filters,employeeFrom}','')::numeric>(employee->>'employeeNumber')::numeric OR nullif(params#>>'{filters,employeeTo}','')::numeric<(employee->>'employeeNumber')::numeric THEN CONTINUE;END IF;
   END IF;
   SELECT pi.id AS person_id,pi.full_name,pi.dni,pi.cuil,reg.id AS registration_id INTO identity_row FROM public.native_employee_registration reg JOIN public.employment_contract ec ON ec.id=reg.contract_id AND ec.person_id=reg.person_id AND ec.tenant_id=reg.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL JOIN public.person_identity pi ON pi.id=reg.person_id WHERE reg.contract_id=(employee->>'contractId')::uuid AND reg.tenant_id=g.tenant_id AND reg.source_binding_id=g.source_binding_id;
   IF NOT FOUND OR NOT public.own_receipt_text_v1(to_jsonb(identity_row.full_name),3,160) OR coalesce(identity_row.dni,'')!~'^[0-9]{5,12}$' OR coalesce(identity_row.cuil,'')!~'^[0-9]{11}$' THEN RAISE EXCEPTION 'OWN_RECEIPT_IDENTITY_REQUIRED';END IF;
   SELECT * INTO c FROM public.own_payroll_run_capture WHERE id=(employee->>'runId')::uuid AND tenant_id=g.tenant_id AND source_binding_id=g.source_binding_id;
   IF c.id IS NULL OR c.payload_sha256<>public.own_run_hash_v1(c.payload) THEN RAISE EXCEPTION 'OWN_RECEIPT_CONTRACT_INVALID';END IF;
   subject:=public.payroll_fixed_registry_subject_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),(employee->>'contractId')::uuid,true);
    IF subject->>'personId' IS DISTINCT FROM identity_row.person_id::text OR subject#>>'{subject,registrationId}' IS DISTINCT FROM identity_row.registration_id::text OR subject#>>'{subject,legajo}' IS DISTINCT FROM employee->>'employeeNumber' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.payload#>'{population,employees}') captured WHERE captured->>'contractId'=employee->>'contractId' AND captured->>'identityToken'=subject#>>'{subject,identityToken}' AND captured->>'employeeNumber'=employee->>'employeeNumber') THEN RAISE EXCEPTION 'OWN_RECEIPT_IDENTITY_REQUIRED';END IF;
   IF EXISTS(SELECT 1 FROM public.employment_adoption_application WHERE contract_id=(employee->>'contractId')::uuid) THEN has_adopted:=true;END IF;concepts:='[]';
   FOR line IN SELECT value FROM jsonb_array_elements(g.snapshot->'concepts') WHERE value->>'contractId'=employee->>'contractId' ORDER BY(value->>'conceptCode')::numeric LOOP
    SELECT x.value INTO item FROM jsonb_array_elements(c.payload#>'{programState,salaryCatalog,items}') x WHERE x.value->>'kind'='concept' AND x.value->>'code'=line->>'conceptCode' AND x.value->>'agreementCode'=employee->>'agreementCode' AND x.value->'active'='true'::jsonb AND x.value->>'validFrom'<=g.period AND(x.value->'validUntil'='null'::jsonb OR x.value->>'validUntil'>=g.period);
    IF item IS NULL OR(SELECT count(*) FROM jsonb_array_elements(c.payload#>'{programState,salaryCatalog,items}') x WHERE x.value->>'kind'='concept' AND x.value->>'code'=line->>'conceptCode' AND x.value->>'agreementCode'=employee->>'agreementCode' AND x.value->'active'='true'::jsonb AND x.value->>'validFrom'<=g.period AND(x.value->'validUntil'='null'::jsonb OR x.value->>'validUntil'>=g.period))<>1 OR NOT public.own_receipt_text_v1(item->'label',1,240) OR item->>'nature'<>line->>'nature' THEN RAISE EXCEPTION 'OWN_RECEIPT_LABEL_REQUIRED';END IF;
    concepts:=concepts||jsonb_build_array(jsonb_build_object('code',line->>'conceptCode','label',item->>'label','nature',line->>'nature','unit',line->>'unit','amount',line->>'amount','labelSourceSha256',c.payload_sha256));
   END LOOP;
   IF jsonb_array_length(concepts)<>(employee->>'conceptCount')::integer OR EXISTS(SELECT 1 FROM jsonb_array_elements(records) old JOIN jsonb_array_elements(sources) source ON source.value->>'id'=old.value->>'sourceGroupId' WHERE source.value->>'type'=g.liquidation_type AND old.value->>'contractId'=employee->>'contractId') THEN RAISE EXCEPTION 'OWN_RECEIPT_CONTRACT_INVALID';END IF;
   record_value:=jsonb_build_object('sourceGroupId',g.id,'contractId',employee->>'contractId','personId',identity_row.person_id,'registrationId',identity_row.registration_id,'employeeNumber',employee->>'employeeNumber','name',identity_row.full_name,'dni',identity_row.dni,'cuil',identity_row.cuil,'agreementCode',employee->>'agreementCode','departmentCode',employee->>'departmentCode','runId',employee->>'runId','liquidationVersion',employee->'liquidationVersion','precision',employee->'precision','totals',(employee->'totals')-'contractId','concepts',concepts);
   records:=records||jsonb_build_array(record_value);n:=n+1;concept_count:=concept_count+jsonb_array_length(concepts);
   IF jsonb_array_length(records)>20000 OR concept_count>250000 THEN RAISE EXCEPTION 'OWN_RECEIPT_LIMIT';END IF;
  END LOOP;
  sources:=sources||jsonb_build_array(jsonb_build_object('id',g.id,'snapshotSha256',g.snapshot_sha256,'period',g.period,'type',g.liquidation_type,'employeeCount',g.snapshot->'employeeCount','populationCount',g.snapshot->'populationCount','selectedCount',n));IF jsonb_array_length(sources)>1000 THEN RAISE EXCEPTION 'OWN_RECEIPT_LIMIT';END IF;
 END LOOP;
 result_value:=jsonb_build_object('version',CASE WHEN has_adopted OR params ? 'contracts' THEN 'own-receipt-snapshot.v2' ELSE 'own-receipt-snapshot.v1' END,'params',params,'sourceVersion',public.own_receipt_source_version_v1(ctx,params),'sources',sources,'records',records,'recordCount',jsonb_array_length(records),'conceptCount',concept_count,'identityBasis',CASE WHEN has_adopted OR params ? 'contracts' THEN 'owned_registration_verified_at_capture' ELSE 'native_registration_immutable' END,'paymentDateBasis','declared','signatureState','pending','payrollPosted',false,'paymentExecuted',false);
 IF octet_length(result_value::text)>33546240 THEN RAISE EXCEPTION 'OWN_RECEIPT_LIMIT';END IF;RETURN result_value;
END $$$definition$;
 SELECT * INTO updated FROM pg_proc WHERE oid=original.oid;
 IF to_jsonb(updated)-'prosrc' IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'OWN_RECEIPT_ADOPTION_METADATA_CHANGED';END IF;
END $patch1$;
DO $patch2$
DECLARE original pg_proc;updated pg_proc;metadata jsonb;
BEGIN
 SELECT * INTO original FROM pg_proc WHERE oid=to_regprocedure('public.own_receipt_self_v1(jsonb)');
 IF original.oid IS NULL OR original.proowner<>current_user::regrole OR NOT original.prosecdef
 OR original.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
 OR encode(sha256(convert_to(replace(original.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>'bec75058dd0ee6bb54a1161ace42b53014af60f5e8dc14bc3235e7f5a7a147db'
 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) acl WHERE acl.grantee<>original.proowner AND (acl.grantee<>'municontrol_actions_runtime_app'::regrole OR acl.privilege_type<>'EXECUTE' OR acl.is_grantable))
 THEN RAISE EXCEPTION 'OWN_RECEIPT_ADOPTION_DEFINITION_CHANGED';END IF;
 metadata:=to_jsonb(original)-'prosrc';
 EXECUTE $definition$CREATE OR REPLACE FUNCTION public.own_receipt_self_v1(p jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ctx jsonb;target uuid;person uuid;items jsonb;BEGIN ctx:=public.own_receipt_context_v1(p,'self');
 SELECT link.employment_contract_id,ec.person_id INTO target,person FROM public.tenant_action_employment_link link JOIN public.employment_contract ec ON ec.id=link.employment_contract_id AND ec.tenant_id=link.tenant_id AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL JOIN public.native_employee_registration reg ON reg.contract_id=ec.id AND reg.person_id=ec.person_id AND reg.tenant_id=ec.tenant_id AND reg.source_binding_id=link.source_binding_id WHERE link.membership_id=(ctx->>'membershipId')::uuid AND link.tenant_id=(ctx->>'tenantId')::uuid AND link.source_binding_id=(ctx->>'sourceBindingId')::uuid AND link.active FOR SHARE OF link,ec,reg;
 IF target IS NULL OR(ctx->>'actorPersonId' IS NOT NULL AND person IS DISTINCT FROM(ctx->>'actorPersonId')::uuid) OR(SELECT count(*) FROM public.tenant_action_employment_link link WHERE link.membership_id=(ctx->>'membershipId')::uuid AND link.tenant_id=(ctx->>'tenantId')::uuid AND link.source_binding_id=(ctx->>'sourceBindingId')::uuid AND link.active)<>1 THEN RAISE EXCEPTION 'OWN_RECEIPT_FORBIDDEN';END IF;
 IF EXISTS(SELECT 1 FROM public.employment_adoption_application WHERE contract_id=target) OR EXISTS(SELECT 1 FROM public.employment_contract ec WHERE ec.id=target AND ((ec.source_payload->'native')?'adoptionProposalId' OR (ec.source_payload->'native')?'adoptionReviewId')) THEN
  IF public.payroll_fixed_registry_subject_v2(ctx||jsonb_build_object('certifiedBindingId',ctx->>'sourceBindingId'),target,true)->>'personId' IS DISTINCT FROM person::text THEN RAISE EXCEPTION 'OWN_RECEIPT_FORBIDDEN';END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('batchId',e.id,'preparedAt',e.recorded_at,'approvedAt',a.recorded_at,'params',(e.snapshot->'params')-'filters'-'types'-'contracts','record',r.value,'source',s.value-'employeeCount'-'populationCount'-'selectedCount','signatureState','pending','paymentDateBasis','declared','payrollPosted',false,'paymentExecuted',false) ORDER BY e.recorded_at DESC,e.id,r.value->>'sourceGroupId'),'[]') INTO items FROM public.own_payroll_receipt_event e JOIN public.own_payroll_receipt_event a ON a.batch_id=e.id AND a.command='approve' AND a.tenant_id=e.tenant_id AND a.source_binding_id=e.source_binding_id CROSS JOIN LATERAL jsonb_array_elements(e.snapshot->'records') r JOIN LATERAL jsonb_array_elements(e.snapshot->'sources') s ON s.value->>'id'=r.value->>'sourceGroupId' WHERE e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid AND e.command='prepare' AND r.value->>'contractId'=target::text AND r.value->>'personId'=person::text AND e.snapshot_sha256=public.own_run_hash_v1(e.snapshot) AND e.snapshot->>'sourceVersion'=public.own_receipt_source_version_v1(ctx,e.snapshot->'params') AND NOT EXISTS(SELECT 1 FROM public.own_payroll_receipt_event w WHERE w.batch_id=e.id AND w.command='withdraw');
 IF jsonb_array_length(items)>1000 OR octet_length(items::text)>33546240 THEN RAISE EXCEPTION 'OWN_RECEIPT_LIMIT';END IF;RETURN jsonb_build_object('version','own-receipt-self.v1','items',items);
END $$$definition$;
 SELECT * INTO updated FROM pg_proc WHERE oid=original.oid;
 IF to_jsonb(updated)-'prosrc' IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'OWN_RECEIPT_ADOPTION_METADATA_CHANGED';END IF;
END $patch2$;
