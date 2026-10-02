-- Employee-account linkage and self-service for an existing native contract.
-- No account, permission, contract, GRH row or salary is created by installation.
-- Productive installation requires review of this exact source and authorization.
DO $prerequisite$
BEGIN
 IF to_regprocedure('public.native_account_contract_v1(uuid,uuid,uuid,boolean)') IS NOT NULL
  OR to_regprocedure('public.native_employee_self_bootstrap_v1(jsonb)') IS NOT NULL
 THEN RAISE EXCEPTION 'NATIVE_SELF_ALREADY_INSTALLED'; END IF;
 IF to_regclass('public.native_employee_registration') IS NULL OR to_regclass('public.native_leave_event') IS NULL
  OR to_regprocedure('public.payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)') IS NULL
 THEN RAISE EXCEPTION 'NATIVE_SELF_PREREQUISITE'; END IF;
END $prerequisite$;

CREATE FUNCTION public.native_account_contract_v1(tenant uuid,binding uuid,target uuid,hold_lock boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE b public.platform_tenant_source_binding; subject jsonb;
BEGIN
 SELECT s.* INTO b FROM public.platform_tenant_source_binding s
 JOIN public.tenant_identity_policy policy ON policy.tenant_id=s.tenant_id AND policy.certified_source_binding_id=s.id AND policy.tenant_data_plane_ready
 WHERE s.id=binding AND s.tenant_id=tenant AND s.verified FOR SHARE OF s,policy;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.employment_contract ec WHERE ec.id=target AND ec.tenant_id=tenant AND ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL) THEN RAISE EXCEPTION 'NATIVE_SELF_IDENTITY_INVALID'; END IF;
 subject:=public.payroll_fixed_registry_subject_by_contract_v1(jsonb_build_object('tenantId',tenant,'sourceBindingId',binding,'certifiedBindingId',binding,'sourceCompanyId',b.source_company_id,'sourceDatabase',b.source_database),target,hold_lock);
 IF subject#>>'{subject,origin}' IS DISTINCT FROM 'MUNICONTROL' THEN RAISE EXCEPTION 'NATIVE_SELF_IDENTITY_INVALID'; END IF;
 RETURN subject;
END $$;
REVOKE ALL ON FUNCTION public.native_account_contract_v1(uuid,uuid,uuid,boolean) FROM PUBLIC,municontrol_actions_runtime_app;

-- Patch the reviewed functions in place, preserving their ACL, owner, session,
-- version, idempotency, lock order and original GRH verification branches.
DO $patch$
DECLARE signature text; expected text; old_body text; new_body text; definition text; p pg_proc; after_patch pg_proc; expected_config text[];
BEGIN
 FOR signature,expected,old_body,new_body IN SELECT * FROM(VALUES
 ('public.tenant_action_validate_binding()','4779493de4fef64ea2ff459bce50a1da34e66ba7c280003f69d2999e7298052d',
 $old$    IF (row_payload->>'active')::boolean IS TRUE THEN
      PERFORM 1$old$,
 $new$    IF (row_payload->>'active')::boolean IS TRUE THEN
      IF EXISTS(SELECT 1 FROM public.employment_contract ec WHERE ec.id=(row_payload->>'employment_contract_id')::uuid AND ec.source_system='MUNICONTROL') THEN
        PERFORM public.native_account_contract_v1((row_payload->>'tenant_id')::uuid,binding_row.id,(row_payload->>'employment_contract_id')::uuid,true);
        RETURN NEW;
      END IF;
      PERFORM 1$new$),
 ('public.tenant_action_apply_provisioning_command_v2(text,uuid,integer,text,uuid,text,uuid,text,integer,jsonb)','68155ba9a85d703efa9290888bfa8183047cc1f920127f3a0fea7c0d5435ff70',
 $old$    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_INVALID' USING ERRCODE = 'P0001'; END IF;$old$,
 $new$    IF NOT FOUND AND EXISTS(SELECT 1 FROM public.employment_contract ec WHERE ec.id=contract_id_value AND ec.source_system='MUNICONTROL') THEN
      PERFORM public.native_account_contract_v1(membership.tenant_id,binding.id,contract_id_value,true);
      SELECT * INTO contract FROM public.employment_contract ec WHERE ec.id=contract_id_value AND ec.tenant_id=membership.tenant_id AND ec.source_system='MUNICONTROL' FOR SHARE;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'TENANT_ACTION_EMPLOYMENT_INVALID' USING ERRCODE = 'P0001'; END IF;$new$),
 ('public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)','3efaa78aa8a792b7701ac3f6981d1478101040dc0f1e26e10911117fba4bc1df',
 $old$  SELECT COALESCE(jsonb_agg(item.capability_key ORDER BY item.capability_key), '[]'::jsonb)$old$,
 $new$  IF employment_id IS NULL THEN
    SELECT link.employment_contract_id, contract.person_id INTO employment_id,actor_person_id
    FROM public.tenant_action_employment_link link
    JOIN public.employment_contract contract ON contract.id=link.employment_contract_id AND contract.source_system='MUNICONTROL' AND contract.tenant_id=membership_row.tenant_id AND contract.status='active' AND contract.source_batch_id IS NULL AND contract.legacy_company_id=binding_row.source_company_id
    JOIN public.native_employee_registration registration ON registration.contract_id=contract.id AND registration.person_id=contract.person_id AND registration.tenant_id=contract.tenant_id AND registration.source_binding_id=binding_row.id
    WHERE link.membership_id=membership_row.id AND link.tenant_id=membership_row.tenant_id AND link.source_binding_id=binding_row.id AND link.active
    FOR SHARE OF link,contract,registration;
    IF employment_id IS NOT NULL THEN PERFORM public.native_account_contract_v1(membership_row.tenant_id,binding_row.id,employment_id,true); END IF;
  END IF;
  SELECT COALESCE(jsonb_agg(item.capability_key ORDER BY item.capability_key), '[]'::jsonb)$new$),
 ('public.native_leave_context_v1(jsonb)','9c2357a8242e3d3a1b90c440639662bc88f46c58a648941d910fc1fbf3b6ac30',
 $old$ ctx:=public.native_employment_change_context_v1(p);$old$,
 $new$ IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k) IS DISTINCT FROM ARRAY['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']::text[] THEN RAISE EXCEPTION 'NATIVE_LEAVE_SESSION_INVALID'; END IF;
 ctx:=public.action_center_assert_tenant_read_session_v2(p->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',(p->>'tenantId')::uuid,(p->>'membershipId')::uuid);
 IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') THEN
  IF NOT public.action_center_context_has_capability(ctx,'leave.request.self.read') OR ctx->>'actorPersonId' IS NULL OR ctx->>'employmentContractId' IS NULL THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
  PERFORM public.native_account_contract_v1((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'employmentContractId')::uuid,true);
 END IF;
 ctx:=ctx||jsonb_build_object('actorEmail',lower(btrim(p->>'actorEmail')),'actorLabel',left(coalesce((SELECT nullif(btrim(full_name),'') FROM public.person_identity WHERE id=(ctx->>'actorPersonId')::uuid),'Responsable municipal'),160));$new$),
 ('public.native_leave_authorized_v1(jsonb,uuid,text,text,text)','35fe033688e5c53bf415fc4ebd74686f3ea1ae430d9a20b1210a1f1b949ee2ba',
 $old$ SELECT * INTO ec FROM public.employment_contract WHERE id=target$old$,
 $new$ IF NOT public.action_center_context_has_capability(ctx,'workforce.employee.read') AND target IS DISTINCT FROM (ctx->>'employmentContractId')::uuid THEN RETURN false; END IF;
 SELECT * INTO ec FROM public.employment_contract WHERE id=target$new$),
 ('public.tenant_action_lookup_employment_v2(text,uuid,integer,text,uuid,text,integer)','66e987599d74f6fc70249d323eb5f6a2fc971c6f66caa1cb7a54319c1ce26031',
 $old$  RETURN jsonb_build_object(
    'tenantId', membership.tenant_id, 'membershipId', membership.id,
    'candidates', candidates, 'ephemeral', true, 'limit', p_limit
  );$old$,
 $new$  SELECT coalesce(jsonb_agg(item ORDER BY item->>'displayName',item->>'legajo',item->>'employmentContractId'),'[]') INTO candidates FROM(
    SELECT item FROM(
      SELECT value||jsonb_build_object('origin','GRH') AS item FROM jsonb_array_elements(candidates)
      UNION ALL
      SELECT jsonb_build_object('employmentContractId',ec.id,'sourceBindingId',binding.id,'legajo',ec.legacy_legajo,'displayName',coalesce(nullif(i.full_name,''),'Nombre no informado'),'organizationUnitSourceId',ec.organization_unit_source_id,'organizationLabel',coalesce(ec.source_payload#>>'{employment,organizationName}',ec.organization_unit_source_id,'Organizacion no informada'),'sectorSourceId',ec.sector_source_id,'sectorLabel',coalesce(ec.source_payload#>>'{employment,sectorName}',ec.sector_source_id,'Sector no informado'),'origin','MUNICONTROL')
      FROM public.employment_contract ec
      JOIN public.person_identity i ON i.id=ec.person_id
      JOIN public.native_employee_registration r ON r.contract_id=ec.id AND r.person_id=ec.person_id AND r.tenant_id=ec.tenant_id AND r.source_binding_id=binding.id
      WHERE ec.source_system='MUNICONTROL' AND ec.source_batch_id IS NULL AND ec.tenant_id=membership.tenant_id AND ec.status='active' AND ec.legacy_company_id=binding.source_company_id
       AND (ec.legacy_legajo ILIKE '%'||escaped_query||'%' ESCAPE '\' OR i.full_name ILIKE '%'||escaped_query||'%' ESCAPE '\' OR coalesce(ec.source_payload#>>'{employment,sectorName}',ec.sector_source_id,'') ILIKE '%'||escaped_query||'%' ESCAPE '\')
    ) matches ORDER BY item->>'displayName',item->>'legajo',item->>'employmentContractId' LIMIT p_limit
  ) bounded;
  PERFORM public.native_account_contract_v1(membership.tenant_id,binding.id,(value->>'employmentContractId')::uuid,false) FROM jsonb_array_elements(candidates) WHERE value->>'origin'='MUNICONTROL';
  RETURN jsonb_build_object(
    'tenantId', membership.tenant_id, 'membershipId', membership.id,
    'candidates', candidates, 'ephemeral', true, 'limit', p_limit
  );$new$)
 ) patches(sig,sha,old_value,new_value) LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(signature);
  expected_config:=CASE WHEN signature IN('public.native_leave_context_v1(jsonb)','public.native_leave_authorized_v1(jsonb,uuid,text,text,text)') THEN ARRAY['search_path=pg_catalog, public, pg_temp','timezone=UTC'] ELSE ARRAY['search_path=public, pg_temp'] END;
  IF p.oid IS NULL OR p.proowner<>current_user::regrole OR NOT p.prosecdef OR p.prokind<>'f'
   OR p.proconfig IS DISTINCT FROM expected_config OR p.provolatile IS DISTINCT FROM (CASE WHEN signature='public.native_leave_authorized_v1(jsonb,uuid,text,text,text)' THEN 's' ELSE 'v' END)::"char" OR p.proparallel<>'u' OR p.proleakproof OR p.proretset
   OR p.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql')
   OR encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex')<>expected THEN RAISE EXCEPTION 'NATIVE_SELF_PREREQUISITE_DRIFT' USING DETAIL=signature; END IF;
  definition:=replace(pg_get_functiondef(p.oid),E'\r\n',E'\n');
  IF (length(definition)-length(replace(definition,old_body,'')))/length(old_body)<>1 THEN RAISE EXCEPTION 'NATIVE_SELF_PATCH_DRIFT' USING DETAIL=signature; END IF;
  EXECUTE replace(definition,old_body,new_body);
  SELECT * INTO after_patch FROM pg_proc WHERE oid=p.oid;
  IF to_jsonb(after_patch)-'prosrc' IS DISTINCT FROM to_jsonb(p)-'prosrc' OR replace(after_patch.prosrc,E'\r\n',E'\n') IS DISTINCT FROM replace(replace(p.prosrc,E'\r\n',E'\n'),old_body,new_body) THEN RAISE EXCEPTION 'NATIVE_SELF_SECURITY_DRIFT'; END IF;
 END LOOP;
END $patch$;

CREATE FUNCTION public.native_employee_self_bootstrap_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb; source text; subject jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k) IS DISTINCT FROM ARRAY['actorEmail','actorSessionId','actorSessionVersion','membershipId','releaseSha','tenantId']::text[] THEN RAISE EXCEPTION 'NATIVE_SELF_SESSION_INVALID'; END IF;
 ctx:=public.action_center_assert_tenant_read_session_v2(p->>'actorEmail',(p->>'actorSessionId')::uuid,(p->>'actorSessionVersion')::integer,p->>'releaseSha',(p->>'tenantId')::uuid,(p->>'membershipId')::uuid);
 IF NOT public.action_center_context_has_capability(ctx,'actions.read') OR NOT public.action_center_context_has_capability(ctx,'leave.request.self.read') THEN RAISE EXCEPTION 'NATIVE_SELF_FORBIDDEN'; END IF;
 IF ctx->>'employmentContractId' IS NULL THEN RETURN jsonb_build_object('version','native-employee-self.v1','state','unlinked','subject',NULL); END IF;
 SELECT source_system INTO source FROM public.employment_contract WHERE id=(ctx->>'employmentContractId')::uuid;
 IF source IS DISTINCT FROM 'MUNICONTROL' THEN RETURN jsonb_build_object('version','native-employee-self.v1','state','reference','subject',NULL); END IF;
 subject:=public.native_account_contract_v1((ctx->>'tenantId')::uuid,(ctx->>'sourceBindingId')::uuid,(ctx->>'employmentContractId')::uuid,true);
 IF subject->>'personId' IS DISTINCT FROM ctx->>'actorPersonId' THEN RAISE EXCEPTION 'NATIVE_SELF_IDENTITY_INVALID'; END IF;
 RETURN jsonb_build_object('version','native-employee-self.v1','state','native','subject',subject->'subject');
END $$;
REVOKE ALL ON FUNCTION public.native_employee_self_bootstrap_v1(jsonb) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.native_employee_self_bootstrap_v1(jsonb) TO municontrol_actions_runtime_app;

CREATE FUNCTION public.native_self_leave_bootstrap_v1(p jsonb,target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE self_view jsonb; result jsonb; ctx jsonb;
BEGIN
 self_view:=public.native_employee_self_bootstrap_v1(p);
 IF self_view->>'state' IS DISTINCT FROM 'native' OR self_view#>>'{subject,contractId}' IS DISTINCT FROM target::text THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
 result:=public.native_leave_bootstrap_v1(p,target);
 ctx:=public.native_leave_context_v1(p);
 result:=jsonb_set(result,'{permissions}',jsonb_build_object('canCreate',(result#>>'{permissions,canCreate}')::boolean AND public.action_center_context_has_capability(ctx,'leave.request.self.create'),'canProposeProfile',false));
 result:=jsonb_set(result,'{requests}',coalesce((SELECT jsonb_agg(row||jsonb_build_object('canUpdate',(row->>'canUpdate')::boolean AND public.action_center_context_has_capability(ctx,'leave.request.self.update'),'canSubmit',(row->>'canSubmit')::boolean AND public.action_center_context_has_capability(ctx,'leave.request.self.submit'),'canCancel',(row->>'canCancel')::boolean AND public.action_center_context_has_capability(ctx,'leave.request.self.cancel'),'canReview',false) ORDER BY n) FROM jsonb_array_elements(result->'requests') WITH ORDINALITY entries(row,n)),'[]'::jsonb));
 RETURN jsonb_set(result,'{profileProposals}',coalesce((SELECT jsonb_agg(row||jsonb_build_object('canReview',false) ORDER BY n) FROM jsonb_array_elements(result->'profileProposals') WITH ORDINALITY entries(row,n)),'[]'::jsonb));
END $$;

CREATE FUNCTION public.native_self_leave_attempt_v1(p jsonb,target uuid,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE self_view jsonb;
BEGIN
 self_view:=public.native_employee_self_bootstrap_v1(p);
 IF self_view->>'state' IS DISTINCT FROM 'native' OR self_view#>>'{subject,contractId}' IS DISTINCT FROM target::text THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
 RETURN public.native_leave_attempt_v1(p,target,key);
END $$;

CREATE FUNCTION public.native_self_leave_command_v1(p jsonb,body jsonb,key uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE self_view jsonb; ctx jsonb; required_capability text;
BEGIN
 self_view:=public.native_employee_self_bootstrap_v1(p);
 IF self_view->>'state' IS DISTINCT FROM 'native' OR self_view#>>'{subject,contractId}' IS DISTINCT FROM body->>'contractId' THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
 required_capability:=CASE body->>'command' WHEN 'create' THEN 'leave.request.self.create' WHEN 'update_draft' THEN 'leave.request.self.update' WHEN 'submit' THEN 'leave.request.self.submit' WHEN 'cancel' THEN 'leave.request.self.cancel' ELSE NULL END;
 ctx:=public.native_leave_context_v1(p);
 IF required_capability IS NULL OR NOT public.action_center_context_has_capability(ctx,required_capability) THEN RAISE EXCEPTION 'NATIVE_LEAVE_FORBIDDEN'; END IF;
 RETURN public.native_leave_command_v1(p,body,key);
END $$;
REVOKE ALL ON FUNCTION public.native_self_leave_bootstrap_v1(jsonb,uuid),public.native_self_leave_attempt_v1(jsonb,uuid,uuid),public.native_self_leave_command_v1(jsonb,jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
GRANT EXECUTE ON FUNCTION public.native_self_leave_bootstrap_v1(jsonb,uuid),public.native_self_leave_attempt_v1(jsonb,uuid,uuid),public.native_self_leave_command_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app;
