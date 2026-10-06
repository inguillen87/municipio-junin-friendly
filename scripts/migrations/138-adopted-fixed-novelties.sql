-- Requires an atomic installation/repetition protocol before municipal use.
-- Exact UUID consumer for fixed novelties; no TXT/DNI identity resolver.
-- Saved roots, events, request bodies, keys and receipts remain immutable.
DO $prerequisite$ BEGIN
 IF to_regprocedure('public.native_employment_lifecycle_adopted_state_v2(jsonb,uuid,jsonb)') IS NULL
  OR to_regclass('public.employment_adoption_application') IS NULL
  OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
   ('payroll_fixed_registry_adopted_subject_v1','payroll_fixed_registry_subject_v2','payroll_fixed_registry_stored_subject_v2','payroll_fixed_registry_range_v2','payroll_fixed_registry_actor_v2'))
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ADOPTION_PREREQUISITE'; END IF;
END $prerequisite$;

CREATE FUNCTION public.payroll_fixed_registry_adopted_subject_v1(ctx jsonb,target uuid,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE c public.employment_contract;i public.person_identity;n public.native_employee_registration;
 a public.employment_adoption_application;d public.employment_adoption_decision;r public.employment_adoption_proposal;
 subject jsonb;state_value jsonb;binding uuid;
BEGIN
 IF ctx->>'sourceBindingId' IS NOT NULL AND ctx->>'certifiedBindingId' IS NOT NULL
  AND ctx->>'sourceBindingId'<>ctx->>'certifiedBindingId' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 binding:=coalesce(ctx->>'certifiedBindingId',ctx->>'sourceBindingId')::uuid;
 IF hold_lock THEN LOCK TABLE public.employment_contract,public.person_identity,public.native_employee_registration,
  public.platform_tenant_source_binding,public.employment_adoption_application,public.employment_adoption_decision,
  public.employment_adoption_proposal,public.native_employment_lifecycle_review IN SHARE MODE NOWAIT; END IF;
 SELECT * INTO c FROM public.employment_contract WHERE id=target AND tenant_id=(ctx->>'tenantId')::uuid
  AND legacy_company_id=(ctx->>'sourceCompanyId')::bigint AND source_system='MUNICONTROL' AND source_batch_id IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
 SELECT reg.* INTO n FROM public.native_employee_registration reg
  JOIN public.platform_tenant_source_binding b ON b.id=reg.source_binding_id AND b.tenant_id=reg.tenant_id
  WHERE reg.contract_id=c.id AND reg.person_id=c.person_id AND reg.tenant_id=c.tenant_id AND reg.source_binding_id=binding
   AND b.source_system='GRH' AND b.verified AND b.source_company_id=c.legacy_company_id AND b.source_database=ctx->>'sourceDatabase';
 IF NOT FOUND OR c.source_payload#>>'{native,registrationId}' IS DISTINCT FROM n.id::text
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 SELECT * INTO a FROM public.employment_adoption_application WHERE contract_id=c.id;
 SELECT * INTO d FROM public.employment_adoption_decision WHERE id=a.decision_id AND decision='approve'
  AND tenant_id=c.tenant_id AND source_binding_id=binding;
 SELECT * INTO r FROM public.employment_adoption_proposal WHERE id=d.proposal_id AND tenant_id=d.tenant_id AND source_binding_id=d.source_binding_id;
 IF a.contract_id IS NULL OR d.id IS NULL OR r.id IS NULL OR a.registration_id<>n.id
  OR c.source_payload#>>'{native,adoptionProposalId}' IS DISTINCT FROM r.id::text
  OR c.source_payload#>>'{native,adoptionReviewId}' IS DISTINCT FROM d.id::text
  OR a.before_contract->>'person_id' IS DISTINCT FROM c.person_id::text
  OR a.before_person->>'id' IS DISTINCT FROM c.person_id::text
  OR a.before_contract->>'legacy_legajo' IS DISTINCT FROM c.legacy_legajo
  OR (a.before_contract->>'legacy_company_id')::bigint IS DISTINCT FROM c.legacy_company_id
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 SELECT * INTO i FROM public.person_identity WHERE id=c.person_id AND identity_state IN('active','provisional');
 IF NOT FOUND OR c.legacy_legajo IS NULL OR length(c.legacy_legajo) NOT BETWEEN 1 AND 64 OR c.legacy_legajo~'[[:cntrl:]]'
  OR i.full_name IS NULL OR length(btrim(i.full_name)) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 subject:=jsonb_build_object('contractId',c.id,'legajo',c.legacy_legajo,'employeeName',i.full_name,
  'identityToken',encode(sha256(convert_to(jsonb_build_object('domain','fixed-adopted-identity.v1','tenant',c.tenant_id,
   'binding',binding,'registration',to_jsonb(n),'native',c.source_payload->'native','person',to_jsonb(i)-ARRAY['created_at','updated_at'])::text,'UTF8')),'hex'),
  'sourceCutoff',NULL,'origin','MUNICONTROL','registrationId',n.id,'registeredAt',n.created_at);
 state_value:=public.native_employment_lifecycle_adopted_state_v2(ctx||jsonb_build_object('sourceBindingId',binding),target,subject);
 IF state_value->>'datesVerified' IS DISTINCT FROM 'true' OR state_value->>'status'='state_error'
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_DATES_INVALID'; END IF;
 RETURN jsonb_build_object('personId',c.person_id,'subject',subject);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END $$;

CREATE FUNCTION public.payroll_fixed_registry_subject_v2(ctx jsonb,target uuid,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.employment_contract c WHERE c.id=target AND c.source_system='MUNICONTROL'
  AND (EXISTS(SELECT 1 FROM public.employment_adoption_application a WHERE a.contract_id=c.id)
   OR (c.source_payload->'native')?'adoptionProposalId' OR (c.source_payload->'native')?'adoptionReviewId'))
 THEN RETURN public.payroll_fixed_registry_adopted_subject_v1(ctx,target,hold_lock); END IF;
 RETURN public.payroll_fixed_registry_subject_by_contract_v1(ctx,target,hold_lock);
END $$;

CREATE FUNCTION public.payroll_fixed_registry_stored_subject_v2(ctx jsonb,item public.payroll_fixed_novelty) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE fresh jsonb;original_token text;
BEGIN
 IF item.tenant_id IS DISTINCT FROM (ctx->>'tenantId')::uuid OR item.certified_binding_id IS DISTINCT FROM (ctx->>'certifiedBindingId')::uuid
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 fresh:=public.payroll_fixed_registry_subject_v2(ctx,item.employment_contract_id);
 IF fresh->>'personId' IS DISTINCT FROM item.person_id::text OR fresh#>>'{subject,contractId}' IS DISTINCT FROM item.employment_contract_id::text
  OR fresh#>>'{subject,legajo}' IS DISTINCT FROM item.subject->>'legajo' THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 IF fresh#>>'{subject,identityToken}'=item.identity_token AND item.subject->>'identityToken'=item.identity_token
 THEN RETURN jsonb_build_object('personId',item.person_id,'subject',item.subject); END IF;
 -- The original GRH token bound only these identity/scope fields. Approved
 -- adoption proves their ownership; do not relabel the stored historical subject.
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(item.subject) k) IS DISTINCT FROM
  ARRAY['contractId','employeeName','identityToken','legajo','sourceCutoff']::text[]
  OR NOT EXISTS(SELECT 1 FROM public.employment_adoption_application a WHERE a.contract_id=item.employment_contract_id)
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 original_token:=encode(public.digest(convert_to(jsonb_build_object('contractId',item.employment_contract_id,'personId',item.person_id,
  'legajo',item.subject->>'legajo','sourceDatabase',ctx->>'sourceDatabase','companyId',(ctx->>'sourceCompanyId')::bigint)::text,'UTF8'),'sha256'),'hex');
 IF item.identity_token IS DISTINCT FROM original_token OR item.subject->>'identityToken' IS DISTINCT FROM original_token
  OR item.subject->>'contractId' IS DISTINCT FROM item.employment_contract_id::text
 THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'; END IF;
 RETURN jsonb_build_object('personId',item.person_id,'subject',item.subject);
END $$;

CREATE FUNCTION public.payroll_fixed_registry_range_v2(ctx jsonb,target uuid,first_date date,last_date date,continuous boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE subject jsonb;state_value jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.employment_adoption_application WHERE contract_id=target)
 THEN RETURN public.native_employment_lifecycle_range_v1(ctx,target,first_date,last_date,continuous); END IF;
 subject:=public.payroll_fixed_registry_adopted_subject_v1(ctx,target,true)->'subject';
 state_value:=public.native_employment_lifecycle_adopted_state_v2(ctx||jsonb_build_object('sourceBindingId',ctx->>'certifiedBindingId'),target,subject);
 IF first_date IS NULL OR (last_date IS NOT NULL AND last_date<first_date) THEN RETURN false; END IF;
 IF continuous THEN RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(state_value->'intervals') r
  WHERE (r->>'startDate')::date<=first_date AND (r->>'endDate' IS NULL OR (last_date IS NOT NULL AND (r->>'endDate')::date>=last_date))); END IF;
 RETURN EXISTS(SELECT 1 FROM jsonb_array_elements(state_value->'intervals') r
  WHERE (last_date IS NULL OR (r->>'startDate')::date<=last_date) AND (r->>'endDate' IS NULL OR (r->>'endDate')::date>=first_date));
END $$;

CREATE FUNCTION public.payroll_fixed_registry_actor_v2(ctx jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE links uuid[];fresh jsonb;today date:=(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
 IF ctx->>'employmentLinked'='true' AND ctx->>'actorPersonId' IS NOT NULL THEN RETURN ctx; END IF;
 SELECT array_agg(linked.employment_contract_id) INTO links FROM (
  SELECT l.employment_contract_id FROM public.tenant_action_employment_link l
  JOIN public.employment_contract c ON c.id=l.employment_contract_id AND c.source_system='MUNICONTROL' AND c.tenant_id=l.tenant_id
   AND c.legacy_company_id=(ctx->>'sourceCompanyId')::bigint
  WHERE l.active AND l.membership_id=(ctx->>'membershipId')::uuid AND l.tenant_id=(ctx->>'tenantId')::uuid
   AND l.source_binding_id=(ctx->>'certifiedBindingId')::uuid FOR SHARE OF l,c NOWAIT
 ) linked;
 IF coalesce(array_length(links,1),0)<>1 THEN RETURN ctx; END IF;
 fresh:=public.payroll_fixed_registry_subject_v2(ctx,links[1],true);
 IF fresh#>>'{subject,origin}'='MUNICONTROL' AND public.payroll_fixed_registry_range_v2(ctx,links[1],today,today,true)
 THEN RETURN ctx||jsonb_build_object('actorPersonId',fresh->>'personId','employmentLinked',true); END IF;
 RETURN ctx;
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IN('PAYROLL_FIXED_NOT_FOUND','PAYROLL_FIXED_IDENTITY_CHANGED','PAYROLL_FIXED_DATES_INVALID') THEN RETURN ctx; END IF;
 IF SQLERRM IN('NATIVE_EMPLOYMENT_LIFECYCLE_NOT_FOUND','NATIVE_EMPLOYMENT_LIFECYCLE_IDENTITY_CHANGED') THEN RETURN ctx; END IF;
 IF SQLSTATE IN('55P03','40P01') THEN RAISE EXCEPTION 'PAYROLL_FIXED_SESSION_BUSY'; END IF;
 RAISE;
END $$;

DO $patch$
DECLARE item record;original pg_proc;updated pg_proc;definition text;old_text text;new_text text;metadata jsonb;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('context','jsonb,text','52c80247a7acfbfe61d628d1fb4d19098c1eb26a955860d247e5ff3c25517022',false),
  ('employee_by_contract','jsonb,uuid','ca05a5b368da303e5e21e6c8e58a3d811c01b2191f88c32ce3de858567b9a18f',true),
  ('propose','jsonb,jsonb,uuid','11b2a9cfcedc2f3ca4856e63ac413194701fcd8c75e1b4651febd4540d0b5f13',true),
  ('review','jsonb,jsonb,uuid','a8a0818269be117ad3e6045d8ac98c638f01f6404e239f89e7987469db3a48b1',true),
  ('event_identity','jsonb,public.payroll_fixed_novelty_event','9010463484a3c849d0b37a987d3e0cc9e90912e0e171081631f69936faaab5cb',false),
  ('identity_current','jsonb,public.payroll_fixed_novelty','554623eb1ed687c6419d1866e0b1b65303ff43581b763db02276e6278eedb2e3',false),
  ('native_dates','jsonb,uuid,jsonb','f0a50c8dde44955ea32e6e7d334dd50405e7b6c474511b9ba85ff9ec2b6d5423',false),
  ('export','jsonb,date,text','c3b008ba635cc4e6cb6c6ae5722c5caaebecdf7d95376e79c6375de0cea9febd',true)
 ) pins(name,args,sha,runtime) LOOP
  SELECT * INTO original FROM pg_proc WHERE oid=to_regprocedure('public.payroll_fixed_registry_'||item.name||'_v1('||item.args||')');
  IF original.oid IS NULL OR original.proowner<>current_user::regrole OR NOT original.prosecdef
   OR original.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
   OR encode(sha256(convert_to(replace(original.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>item.sha
   OR has_function_privilege('municontrol_actions_runtime_app',original.oid,'EXECUTE')<>item.runtime
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) acl WHERE acl.grantee<>original.proowner
    AND (NOT item.runtime OR acl.grantee<>'municontrol_actions_runtime_app'::regrole OR acl.privilege_type<>'EXECUTE' OR acl.is_grantable))
  THEN RAISE EXCEPTION 'PAYROLL_FIXED_ADOPTION_DEFINITION_CHANGED: %',item.name; END IF;
  definition:=pg_get_functiondef(original.oid);metadata:=to_jsonb(original)-'prosrc';
  IF item.name='context' THEN
   old_text:=' IF capability IN (''payroll.fixed.prepare'',''payroll.fixed.approve'') AND';
   new_text:=E' ctx:=public.payroll_fixed_registry_actor_v2(ctx);\n'||old_text;
  ELSIF item.name='identity_current' THEN
   old_text:=original.prosrc;
   new_text:=$body$
BEGIN
 PERFORM public.payroll_fixed_registry_stored_subject_v2(ctx,item);RETURN true;
EXCEPTION WHEN OTHERS THEN
 IF SQLERRM IN('PAYROLL_FIXED_NOT_FOUND','PAYROLL_FIXED_LEGAJO_NOT_FOUND','PAYROLL_FIXED_INVALID_PAYLOAD','PAYROLL_FIXED_IDENTITY_CHANGED','PAYROLL_FIXED_DATES_INVALID') THEN RETURN false; END IF;
 RAISE;
END $body$;
  ELSIF item.name='export' THEN
   old_text:='r#>>''{subject,origin}''=''MUNICONTROL'' AND NOT public.native_employment_lifecycle_range_v1';
   new_text:='(r#>>''{subject,origin}''=''MUNICONTROL'' OR EXISTS(SELECT 1 FROM public.employment_adoption_application a WHERE a.contract_id=(r#>>''{subject,contractId}'')::uuid)) AND NOT public.payroll_fixed_registry_range_v2';
  ELSE
   old_text:='public.payroll_fixed_registry_subject_by_contract_v1';new_text:='public.payroll_fixed_registry_subject_v2';
  END IF;
  IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ADOPTION_PATCH_CHANGED: %',item.name; END IF;
  definition:=replace(definition,old_text,new_text);
  IF item.name='native_dates' THEN definition:=replace(definition,'public.native_employment_lifecycle_range_v1','public.payroll_fixed_registry_range_v2'); END IF;
  IF item.name='review' THEN
   old_text:='AND n.identity_token=root_row.identity_token';new_text:='AND public.payroll_fixed_registry_identity_current_v1(ctx,n)';
   IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ADOPTION_PATCH_CHANGED'; END IF;
   definition:=replace(definition,old_text,new_text);
   old_text:='  v:=proposal_row.payload->''values'';';
   new_text:=old_text||E'\n  IF EXISTS(SELECT 1 FROM public.employment_adoption_application a WHERE a.contract_id=root_row.employment_contract_id) THEN PERFORM public.payroll_fixed_registry_native_dates_v1(ctx,root_row.employment_contract_id,v); END IF;';
   IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ADOPTION_PATCH_CHANGED'; END IF;
   definition:=replace(definition,old_text,new_text);
  END IF;
  IF item.name='propose' THEN
   old_text:='coalesce(p_payload->>''legajo'','''') !~ ''^(0|[1-9][0-9]{0,19})$''';
   new_text:='(length(coalesce(p_payload->>''legajo'','''')) NOT BETWEEN 1 AND 64 OR p_payload->>''legajo''~''[[:cntrl:]]'')';
   IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ADOPTION_PATCH_CHANGED'; END IF;
   definition:=replace(definition,old_text,new_text);
   old_text:=' subject_value:=public.payroll_fixed_registry_subject_v2(ctx,(p_payload->>''contractId'')::uuid,true);';
   new_text:=$proposal$ IF p_payload->>'recordId' IS NOT NULL THEN
  SELECT * INTO root_row FROM public.payroll_fixed_novelty n WHERE n.id=(p_payload->>'recordId')::uuid AND n.tenant_id=(ctx->>'tenantId')::uuid AND n.certified_binding_id=(ctx->>'certifiedBindingId')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYROLL_FIXED_NOT_FOUND'; END IF;
  subject_value:=public.payroll_fixed_registry_stored_subject_v2(ctx,root_row);
 ELSE subject_value:=public.payroll_fixed_registry_subject_v2(ctx,(p_payload->>'contractId')::uuid,true); END IF;$proposal$;
   IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'PAYROLL_FIXED_ADOPTION_PATCH_CHANGED'; END IF;
   definition:=replace(definition,old_text,new_text);
  END IF;
  EXECUTE definition;
  SELECT * INTO updated FROM pg_proc WHERE oid=original.oid;
  IF (to_jsonb(updated)-'prosrc') IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'PAYROLL_FIXED_ADOPTION_METADATA_CHANGED'; END IF;
 END LOOP;
END $patch$;
REVOKE ALL ON FUNCTION public.payroll_fixed_registry_adopted_subject_v1(jsonb,uuid,boolean),
 public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean),public.payroll_fixed_registry_stored_subject_v2(jsonb,public.payroll_fixed_novelty),
 public.payroll_fixed_registry_range_v2(jsonb,uuid,date,date,boolean),public.payroll_fixed_registry_actor_v2(jsonb)
 FROM PUBLIC,municontrol_actions_runtime_app;
