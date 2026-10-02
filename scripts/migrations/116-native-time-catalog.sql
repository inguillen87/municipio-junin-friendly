-- SQL116: native actors and subjects in the existing temporal catalog.
-- No new tables, runtime privileges, account grants, punches, rules or payroll writes.
-- Whole transaction only. A second installation or unknown body fails closed.
DO $prerequisite$
DECLARE item record; actual text;
BEGIN
 IF to_regprocedure('public.time_catalog_native_subject_v2(uuid,uuid,uuid,date,date)') IS NOT NULL
   OR to_regprocedure('public.time_catalog_native_actor_v2(uuid,uuid,uuid)') IS NOT NULL
   OR to_regprocedure('public.time_catalog_native_person_caps_v2(uuid,uuid,uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'TIME_CATALOG_NATIVE_ALREADY_INSTALLED'; END IF;
 IF to_regprocedure('public.payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)') IS NULL
   OR to_regprocedure('public.native_employment_lifecycle_range_v1(jsonb,uuid,date,date,boolean)') IS NULL
   OR to_regclass('public.native_employee_registration') IS NULL
   OR to_regclass('public.native_employment_lifecycle_review') IS NULL
 THEN RAISE EXCEPTION 'TIME_CATALOG_NATIVE_PREREQUISITE'; END IF;
 FOR item IN SELECT * FROM (VALUES
 ('time_catalog_assert_actor_authority_v1(jsonb,text)','3aab92d252fc108dc5c08bb78142cb61e74c4b8bed310941f9009fb6722717fb',false),
 ('time_catalog_assert_person_sod_v1(uuid,uuid,uuid)','4c4042fb3b71d03d9ccd1da82c6f63f2023b1b2b7808397969edfab3aecb660b',false),
 ('time_catalog_guard_entry_v1()','64185f00eab6d347f6b0a12045619117332214913b2e174aaa346930601b9a50',false),
 ('time_catalog_assert_approvable_v1(uuid,uuid,uuid)','3510543ef293e222bef0072429fda52df21e56e5fd448156f44b485f1c80db18',false),
 ('time_catalog_apply_command_v1(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,text,text)','6ad1d544f0aa8c1359d716c429d6074fe9ee9193ced2e4166cf5da3bdf50faa7',true),
 ('time_catalog_guard_draft_child_v1()','30432b60a6dda6b32666a6db5a03918c2fb294dad6d905fd8d25639f58c9535d',false),
 ('payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)','7b490b4cc34bd45205dacf169c1fc2432c5a711fd99d6384bdc0d22db4236e48',false),
 ('native_employment_change_subject_v1(jsonb,uuid)','3a50695689cc90517b0ef9795ce1588cc8a4e49b5515f16832c6c2d4521459b0',false),
 ('native_employment_lifecycle_subject_v1(jsonb,uuid)','4c5a4785240c5ebfb91c2445d265c2ebe6d3063710fe5d01ebc2b2bbfa591e95',false),
 ('native_employment_lifecycle_range_v1(jsonb,uuid,date,date,boolean)','d3d8b65fbcb27cfa3926c224be27832007e5a55f7e933c839fa7bb39d954fed7',false),
 ('native_employment_lifecycle_state_v1(jsonb,uuid,jsonb)','dd5ea2251c5e7279df3bdab239381c80b2112aca3731464d3cb551e1fb45b380',false),
 ('native_employment_lifecycle_intervals_v1(jsonb)','8b195f02bb936108c373f14b7338b707771966fec8c064ac51d0132d38f2b988',false),
 ('native_employment_lifecycle_activity_v1(jsonb,date)','6a31b3c7be5e6226975e0283954ef2ca0b217aac8799010f98ef07b8d64fac23',false),
 ('native_employment_lifecycle_version_v1(jsonb,jsonb,integer)','44b8e2f32e6f55b9fbd994657e3a69f5de17991cc4680307734c48302f72d2f3',false)
 ) pin(signature,sha256,runtime_execute) LOOP
  SELECT encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex') INTO actual
  FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||item.signature)
    AND p.prosecdef AND p.proowner=current_user::regrole
    AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS NOT DISTINCT FROM item.runtime_execute;
  IF actual IS DISTINCT FROM item.sha256 THEN RAISE EXCEPTION 'TIME_CATALOG_NATIVE_PREREQUISITE'; END IF;
 END LOOP;
END $prerequisite$;

CREATE OR REPLACE FUNCTION public.time_catalog_native_subject_v2(
 p_tenant uuid,p_binding uuid,p_contract uuid,p_from date,p_to date
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE ctx jsonb; resolved jsonb; person_value uuid;
BEGIN
 IF p_tenant IS NULL OR p_binding IS NULL OR p_contract IS NULL OR p_from IS NULL
   OR (p_to IS NOT NULL AND p_to<p_from) THEN
  RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID' USING ERRCODE='P0001';
 END IF;
 SELECT jsonb_build_object('tenantId',binding.tenant_id,'certifiedBindingId',binding.id,
   'sourceBindingId',binding.id,'sourceCompanyId',binding.source_company_id,
   'sourceDatabase',binding.source_database) INTO ctx
 FROM public.platform_tenant_source_binding binding
 JOIN public.tenant_identity_policy policy ON policy.tenant_id=binding.tenant_id
   AND policy.certified_source_binding_id=binding.id AND policy.tenant_data_plane_ready IS TRUE
 WHERE binding.id=p_binding AND binding.tenant_id=p_tenant
   AND binding.source_system='GRH' AND binding.verified IS TRUE
 FOR SHARE OF binding,policy NOWAIT;
 IF ctx IS NULL THEN RAISE EXCEPTION 'TIME_CATALOG_BINDING_STALE' USING ERRCODE='P0001'; END IF;
 -- Same lock as SQL110 review: a work-period decision cannot race an assignment.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('native-employment-lifecycle:v1:'||
   p_tenant::text||':'||p_binding::text||':'||p_contract::text,0)) THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE='P0001';
 END IF;
 -- Locks canonical identity and immutable registration before verifying periods.
 -- A native subject never needs a GRH person, import batch or live GRH request.
 IF NOT EXISTS (SELECT 1 FROM public.employment_contract contract
   WHERE contract.id=p_contract AND contract.tenant_id=p_tenant
     AND contract.source_system='MUNICONTROL' AND contract.source_batch_id IS NULL) THEN
  RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID' USING ERRCODE='P0001';
 END IF;
 resolved:=public.payroll_fixed_registry_subject_by_contract_v1(ctx,p_contract,true);
 IF public.native_employment_lifecycle_range_v1(ctx,p_contract,p_from,p_to,true) IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'TIME_CATALOG_NATIVE_PERIOD_INVALID' USING ERRCODE='P0001';
 END IF;
 person_value:=(resolved->>'personId')::uuid;
 IF person_value IS NULL THEN RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID' USING ERRCODE='P0001'; END IF;
 RETURN person_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE='P0001';
END $$;

CREATE OR REPLACE FUNCTION public.time_catalog_native_actor_v2(
 p_tenant uuid,p_binding uuid,p_membership uuid
) RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE target uuid; total integer; person_value uuid;
 today date:=(statement_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
 IF p_tenant IS NULL OR p_binding IS NULL OR p_membership IS NULL THEN
  RAISE EXCEPTION 'TIME_CATALOG_EMPLOYMENT_REQUIRED' USING ERRCODE='P0001';
 END IF;
 -- Serialize mappings and membership revocation until the command finishes.
 LOCK TABLE public.tenant_action_employment_link IN SHARE MODE NOWAIT;
 PERFORM 1 FROM public.tenant_membership membership
 WHERE membership.id=p_membership AND membership.tenant_id=p_tenant
   AND membership.status='active' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'TIME_CATALOG_EMPLOYMENT_REQUIRED' USING ERRCODE='P0001'; END IF;
 SELECT count(*),(array_agg(link.employment_contract_id))[1] INTO total,target
 FROM public.tenant_action_employment_link link
 WHERE link.membership_id=p_membership AND link.tenant_id=p_tenant
   AND link.source_binding_id=p_binding AND link.active IS TRUE;
 IF total<>1 THEN RAISE EXCEPTION 'TIME_CATALOG_EMPLOYMENT_REQUIRED' USING ERRCODE='P0001'; END IF;
 person_value:=public.time_catalog_native_subject_v2(p_tenant,p_binding,target,today,today);
 RETURN person_value;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE='P0001';
END $$;

CREATE OR REPLACE FUNCTION public.time_catalog_native_person_caps_v2(
 p_tenant uuid,p_person uuid,p_binding uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $$
DECLARE member uuid; found_person uuid; capabilities jsonb:='[]'::jsonb; current_caps jsonb;
BEGIN
 IF p_tenant IS NULL OR p_person IS NULL OR p_binding IS NULL THEN
  RAISE EXCEPTION 'TIME_CATALOG_SEPARATION_OF_DUTIES' USING ERRCODE='P0001';
 END IF;
 LOCK TABLE public.tenant_action_employment_link IN SHARE MODE NOWAIT;
 FOR member IN
  SELECT DISTINCT membership.id FROM public.tenant_membership membership
  JOIN public.tenant_action_employment_link link ON link.membership_id=membership.id
   AND link.tenant_id=membership.tenant_id AND link.source_binding_id=p_binding AND link.active IS TRUE
  JOIN public.employment_contract contract ON contract.id=link.employment_contract_id
   AND contract.person_id=p_person AND contract.source_system='MUNICONTROL'
  WHERE membership.tenant_id=p_tenant AND membership.status='active'
  ORDER BY membership.id
 LOOP
  found_person:=public.time_catalog_native_actor_v2(p_tenant,p_binding,member);
  IF found_person IS DISTINCT FROM p_person THEN
   RAISE EXCEPTION 'TIME_CATALOG_PERSON_SOD_CONFLICT' USING ERRCODE='P0001';
  END IF;
  PERFORM public.tenant_iam_assert_no_sod_conflict(member);
  SELECT coalesce(jsonb_agg(e.capability_key),'[]'::jsonb) INTO current_caps
  FROM public.tenant_iam_effective_capabilities(member) e
  WHERE e.capability_key IN ('time.catalog.propose','time.catalog.approve','time.overtime.post');
  capabilities:=capabilities||current_caps;
 END LOOP;
 RETURN capabilities;
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
 RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE='P0001';
END $$;

REVOKE ALL ON FUNCTION public.time_catalog_native_subject_v2(uuid,uuid,uuid,date,date),
 public.time_catalog_native_actor_v2(uuid,uuid,uuid),
 public.time_catalog_native_person_caps_v2(uuid,uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;

CREATE OR REPLACE FUNCTION time_catalog_assert_actor_authority_v1(
  p_context jsonb,
  p_required_capability text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  authority_row tenant_action_authority%ROWTYPE;
  actor_employment_contract_id uuid;
  actor_person_id uuid;
  capabilities jsonb;
BEGIN
  IF jsonb_typeof(p_context) IS DISTINCT FROM 'object'
     OR p_required_capability NOT IN (
       'time.catalog.read','time.catalog.propose',
       'time.catalog.approve','time.catalog.audit.read'
     ) THEN
    RAISE EXCEPTION 'TIME_CATALOG_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO authority_row FROM tenant_action_authority authority
  WHERE authority.membership_id = (p_context->>'membershipId')::uuid
    AND authority.tenant_id = (p_context->>'tenantId')::uuid
  FOR SHARE NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_CATALOG_AUTHORITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;
  PERFORM tenant_iam_assert_no_sod_conflict((p_context->>'membershipId')::uuid);
  IF NOT EXISTS (
    SELECT 1 FROM tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
    WHERE capability.capability_key = p_required_capability
  ) THEN
    RAISE EXCEPTION 'TIME_CATALOG_CAPABILITY_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tenant_action_employment_link link
    JOIN employment_contract contract ON contract.id=link.employment_contract_id
    WHERE link.membership_id=(p_context->>'membershipId')::uuid
      AND link.tenant_id=(p_context->>'tenantId')::uuid
      AND link.source_binding_id=(p_context->>'certifiedBindingId')::uuid
      AND link.active IS TRUE AND contract.source_system='MUNICONTROL'
  ) THEN
    actor_person_id:=public.time_catalog_native_actor_v2(
      (p_context->>'tenantId')::uuid,(p_context->>'certifiedBindingId')::uuid,
      (p_context->>'membershipId')::uuid);
  ELSE
  SELECT link.employment_contract_id, contract.person_id
    INTO actor_employment_contract_id, actor_person_id
  FROM tenant_action_employment_link link
  JOIN employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = (p_context->>'sourceCompanyId')::bigint
  JOIN source_import_batch batch
    ON batch.id = contract.source_batch_id
   AND batch.source_system = 'GRH'
   AND batch.source_database = p_context->>'sourceDatabase'
   AND batch.validation_state = 'published'
   AND batch.legacy_import_run_id IS NOT NULL
  WHERE link.membership_id = (p_context->>'membershipId')::uuid
    AND link.tenant_id = (p_context->>'tenantId')::uuid
    AND link.source_binding_id = (p_context->>'certifiedBindingId')::uuid
    AND link.active IS TRUE
  FOR SHARE OF link, contract, batch NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_CATALOG_EMPLOYMENT_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  END IF;

  PERFORM time_catalog_assert_person_sod_v1(
    (p_context->>'tenantId')::uuid,
    actor_person_id,
    (p_context->>'certifiedBindingId')::uuid
  );
  SELECT COALESCE(jsonb_agg(capability.capability_key ORDER BY capability.capability_key), '[]'::jsonb)
    INTO capabilities
  FROM tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) capability
  WHERE capability.capability_key IN (
    'time.catalog.read','time.catalog.propose',
    'time.catalog.approve','time.catalog.audit.read'
  );
  RETURN p_context || jsonb_build_object(
    'authorityVersion', authority_row.version,
    'actorPersonId', actor_person_id,
    'capabilities', capabilities,
    'areaScopes', '[]'::jsonb
  );
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_assert_person_sod_v1(
  p_tenant_id uuid,
  p_actor_person_id uuid,
  p_certified_binding_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  has_propose boolean := false;
  has_approve boolean := false;
  has_overtime_post boolean := false;
  related_membership_id uuid;
  capabilities_native jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_person_id IS NULL OR p_certified_binding_id IS NULL THEN
    RAISE EXCEPTION 'TIME_CATALOG_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
  END IF;
  FOR related_membership_id IN
    SELECT membership.id
    FROM tenant_membership membership
    JOIN platform_tenant_source_binding binding
      ON binding.id = p_certified_binding_id
     AND binding.tenant_id = membership.tenant_id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    JOIN tenant_action_employment_link link
      ON link.membership_id = membership.id
     AND link.tenant_id = membership.tenant_id
     AND link.source_binding_id = p_certified_binding_id
     AND link.active IS TRUE
    JOIN employment_contract contract
      ON contract.id = link.employment_contract_id
     AND contract.person_id = p_actor_person_id
     AND contract.status = 'active'
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding.source_company_id
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE membership.tenant_id = p_tenant_id
      AND membership.status = 'active'
    ORDER BY membership.id
    FOR SHARE OF membership, link, contract, batch NOWAIT
  LOOP
    PERFORM tenant_iam_assert_no_sod_conflict(related_membership_id);
  END LOOP;

  SELECT
    COALESCE(bool_or(effective.capability_key = 'time.catalog.propose'), false),
    COALESCE(bool_or(effective.capability_key = 'time.catalog.approve'), false),
    COALESCE(bool_or(effective.capability_key = 'time.overtime.post'), false)
    INTO has_propose, has_approve, has_overtime_post
  FROM tenant_membership membership
  JOIN platform_tenant_source_binding binding
    ON binding.id = p_certified_binding_id
   AND binding.tenant_id = membership.tenant_id
   AND binding.source_system = 'GRH'
   AND binding.verified IS TRUE
  JOIN tenant_action_employment_link link
    ON link.membership_id = membership.id
   AND link.tenant_id = membership.tenant_id
   AND link.source_binding_id = p_certified_binding_id
   AND link.active IS TRUE
  JOIN employment_contract contract
    ON contract.id = link.employment_contract_id
   AND contract.person_id = p_actor_person_id
   AND contract.status = 'active'
   AND contract.source_system = 'GRH'
   AND contract.legacy_company_id = binding.source_company_id
  JOIN source_import_batch batch
    ON batch.id = contract.source_batch_id
   AND batch.source_system = 'GRH'
   AND batch.source_database = binding.source_database
   AND batch.validation_state = 'published'
   AND batch.legacy_import_run_id IS NOT NULL
  CROSS JOIN LATERAL tenant_iam_effective_capabilities(membership.id) effective
  WHERE membership.tenant_id = p_tenant_id
    AND membership.status = 'active'
    AND effective.capability_key IN (
      'time.catalog.propose','time.catalog.approve','time.overtime.post'
    );

  -- Merge native accounts with the original GRH result. Neither origin can
  -- split proposal, approval or payroll posting across accounts of one person.
  capabilities_native:=public.time_catalog_native_person_caps_v2(
    p_tenant_id,p_actor_person_id,p_certified_binding_id);
  has_propose:=has_propose OR (capabilities_native ? 'time.catalog.propose');
  has_approve:=has_approve OR (capabilities_native ? 'time.catalog.approve');
  has_overtime_post:=has_overtime_post OR (capabilities_native ? 'time.overtime.post');
  IF (has_propose AND has_approve AND (capabilities_native<>'[]'::jsonb OR NOT public.tenant_iam_operational_person_pair_v1(p_tenant_id,p_actor_person_id,p_certified_binding_id,'catalog'))) OR (has_approve AND has_overtime_post) THEN
    RAISE EXCEPTION 'TIME_CATALOG_PERSON_SOD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_guard_entry_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  transition_command text;
  mutable_fields text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'TIME_CATALOG_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.version <> 1
       OR NOT time_catalog_reason_allowed_v1('create_draft', NEW.reason_code) THEN
      RAISE EXCEPTION 'TIME_CATALOG_CREATE_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM tenant_action_employment_link link
      JOIN employment_contract contract ON contract.id=link.employment_contract_id
      WHERE link.membership_id=NEW.proposer_membership_id
        AND link.tenant_id=NEW.tenant_id
        AND link.source_binding_id=NEW.certified_binding_id
        AND link.active IS TRUE AND contract.source_system='MUNICONTROL'
    ) THEN
      IF public.time_catalog_native_actor_v2(NEW.tenant_id,NEW.certified_binding_id,
        NEW.proposer_membership_id) IS DISTINCT FROM NEW.proposer_person_id THEN
        RAISE EXCEPTION 'TIME_CATALOG_PROPOSER_INVALID' USING ERRCODE='P0001';
      END IF;
    ELSE
    PERFORM 1
    FROM tenant_membership membership
    JOIN tenant_identity_policy policy
      ON policy.tenant_id = membership.tenant_id
     AND policy.tenant_data_plane_ready IS TRUE
     AND policy.certified_source_binding_id = NEW.certified_binding_id
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = policy.tenant_id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    JOIN tenant_action_employment_link link
      ON link.membership_id = membership.id
     AND link.tenant_id = membership.tenant_id
     AND link.source_binding_id = NEW.certified_binding_id
     AND link.active IS TRUE
    JOIN employment_contract contract
      ON contract.id = link.employment_contract_id
     AND contract.person_id = NEW.proposer_person_id
     AND contract.status = 'active'
     AND contract.source_system = 'GRH'
     AND contract.legacy_company_id = binding.source_company_id
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE membership.id = NEW.proposer_membership_id
      AND membership.tenant_id = NEW.tenant_id
      AND membership.status = 'active'
    FOR SHARE OF membership, policy, binding, link, contract, batch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_PROPOSER_INVALID' USING ERRCODE = 'P0001';
    END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.certified_binding_id IS DISTINCT FROM OLD.certified_binding_id
     OR NEW.catalog_kind IS DISTINCT FROM OLD.catalog_kind
     OR NEW.logical_key_hash IS DISTINCT FROM OLD.logical_key_hash
     OR NEW.revision IS DISTINCT FROM OLD.revision
     OR NEW.proposer_person_id IS DISTINCT FROM OLD.proposer_person_id
     OR NEW.proposer_membership_id IS DISTINCT FROM OLD.proposer_membership_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'TIME_CATALOG_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
    RAISE EXCEPTION 'TIME_CATALOG_VERSION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    transition_command := 'update_draft';
    mutable_fields := ARRAY[
      'effective_from','effective_to','timezone','source_contract_id',
      'source_contract_certified_binding_id','version','reason_code','reason_hash','updated_at'
    ];
  ELSIF OLD.status = 'draft' AND NEW.status = 'submitted' THEN
    transition_command := 'submit';
    mutable_fields := ARRAY[
      'status','version','reason_code','reason_hash','updated_at','submitted_at'
    ];
  ELSIF OLD.status = 'submitted' AND NEW.status IN ('approved','rejected') THEN
    transition_command := CASE NEW.status WHEN 'approved' THEN 'approve' ELSE 'reject' END;
    mutable_fields := ARRAY[
      'status','version','reason_code','reason_hash','updated_at','decided_at',
      'approver_person_id','approver_membership_id'
    ];
  ELSIF OLD.status = 'approved' AND NEW.status = 'retired' THEN
    transition_command := 'retire';
    mutable_fields := ARRAY[
      'status','version','reason_code','reason_hash','updated_at','retired_at'
    ];
  ELSE
    RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
  END IF;

  IF (to_jsonb(NEW) - mutable_fields) IS DISTINCT FROM (to_jsonb(OLD) - mutable_fields)
     OR NOT time_catalog_reason_allowed_v1(transition_command, NEW.reason_code) THEN
    RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_SHAPE_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF transition_command IN ('approve','reject') THEN
    PERFORM 1
    FROM tenant_membership membership
    JOIN tenant_action_employment_link link
      ON link.membership_id = membership.id
     AND link.tenant_id = membership.tenant_id
     AND link.source_binding_id = NEW.certified_binding_id
     AND link.active IS TRUE
    JOIN employment_contract contract
      ON contract.id = link.employment_contract_id
     AND contract.status = 'active'
     AND contract.person_id = NEW.approver_person_id
    WHERE membership.id = NEW.approver_membership_id
      AND membership.tenant_id = NEW.tenant_id
      AND membership.status = 'active'
    FOR SHARE OF membership, link, contract;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_APPROVER_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM tenant_action_employment_link link
      JOIN employment_contract contract ON contract.id=link.employment_contract_id
      WHERE link.membership_id=NEW.approver_membership_id AND link.tenant_id=NEW.tenant_id
        AND link.source_binding_id=NEW.certified_binding_id AND link.active IS TRUE
        AND contract.source_system='MUNICONTROL') THEN
      IF public.time_catalog_native_actor_v2(NEW.tenant_id,NEW.certified_binding_id,
        NEW.approver_membership_id) IS DISTINCT FROM NEW.approver_person_id THEN
        RAISE EXCEPTION 'TIME_CATALOG_APPROVER_INVALID' USING ERRCODE='P0001';
      END IF;
    END IF;
  END IF;
  -- Native assignments must already have coherent periods and approved
  -- dependencies when submitted. The original GRH submission path is kept.
  IF transition_command='submit' AND NEW.catalog_kind='assignment' AND EXISTS (
    SELECT 1 FROM time_assignment_spec spec
    JOIN employment_contract contract ON contract.id=spec.employment_contract_id
    WHERE spec.catalog_entry_id=NEW.id AND spec.tenant_id=NEW.tenant_id
      AND contract.source_system='MUNICONTROL'
  ) THEN
    PERFORM time_catalog_assert_approvable_v1(NEW.id,NEW.tenant_id,NEW.certified_binding_id);
  END IF;
  IF transition_command = 'approve' THEN
    PERFORM time_catalog_assert_approvable_v1(
      NEW.id, NEW.tenant_id, NEW.certified_binding_id
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_assert_approvable_v1(
  p_catalog_entry_id uuid,
  p_tenant_id uuid,
  p_certified_binding_id uuid
)
RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  entry_row time_catalog_entry%ROWTYPE;
  assignment_row time_assignment_spec%ROWTYPE;
BEGIN
  SELECT * INTO entry_row FROM time_catalog_entry entry
  WHERE entry.id = p_catalog_entry_id
    AND entry.tenant_id = p_tenant_id
    AND entry.certified_binding_id = p_certified_binding_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_CATALOG_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  PERFORM 1
  FROM tenant_identity_policy policy
  JOIN platform_tenant_source_binding binding
    ON binding.id = policy.certified_source_binding_id
   AND binding.tenant_id = policy.tenant_id
   AND binding.source_system = 'GRH'
   AND binding.verified IS TRUE
  WHERE policy.tenant_id = entry_row.tenant_id
    AND policy.tenant_data_plane_ready IS TRUE
    AND binding.id = entry_row.certified_binding_id
  FOR SHARE OF policy, binding;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TIME_CATALOG_BINDING_STALE' USING ERRCODE = 'P0001';
  END IF;

  IF entry_row.source_contract_id IS NOT NULL THEN
    PERFORM 1 FROM time_source_contract source
    WHERE source.id = entry_row.source_contract_id
      AND source.tenant_id = entry_row.tenant_id
      AND source.certified_binding_id = entry_row.certified_binding_id
      AND source.status = 'approved'
      AND source.domain = CASE entry_row.catalog_kind
        WHEN 'calendar' THEN 'holiday_calendar'
        WHEN 'rule_profile' THEN 'municipal_rule_profile'
        ELSE 'shift_assignment'
      END
      AND source.coverage_from <= entry_row.effective_from
      AND source.coverage_to >= COALESCE(entry_row.effective_to, DATE '2100-12-31')
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_SOURCE_NOT_APPROVED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF entry_row.catalog_kind = 'calendar' THEN
    IF NOT EXISTS (
      SELECT 1 FROM time_calendar_day day
      WHERE day.catalog_entry_id = entry_row.id
        AND day.tenant_id = entry_row.tenant_id
        AND day.day_date BETWEEN entry_row.effective_from
          AND COALESCE(entry_row.effective_to, DATE 'infinity')
    ) THEN
      RAISE EXCEPTION 'TIME_CATALOG_CALENDAR_EMPTY' USING ERRCODE = 'P0001';
    END IF;
  ELSIF entry_row.catalog_kind = 'shift' THEN
    IF NOT EXISTS (
      SELECT 1 FROM time_shift_spec spec
      JOIN time_shift_weekly_interval interval
        ON interval.catalog_entry_id = spec.catalog_entry_id
       AND interval.tenant_id = spec.tenant_id
      WHERE spec.catalog_entry_id = entry_row.id
        AND spec.tenant_id = entry_row.tenant_id
        AND interval.interval_kind = 'work'
    ) THEN
      RAISE EXCEPTION 'TIME_CATALOG_SHIFT_EMPTY' USING ERRCODE = 'P0001';
    END IF;
  ELSIF entry_row.catalog_kind = 'rule_profile' THEN
    IF NOT EXISTS (
      SELECT 1 FROM time_rule_parameter parameter
      WHERE parameter.catalog_entry_id = entry_row.id
        AND parameter.tenant_id = entry_row.tenant_id
    ) THEN
      RAISE EXCEPTION 'TIME_CATALOG_RULES_EMPTY' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT * INTO assignment_row FROM time_assignment_spec assignment
    WHERE assignment.catalog_entry_id = entry_row.id
      AND assignment.tenant_id = entry_row.tenant_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_EMPTY' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM employment_contract contract
      WHERE contract.id=assignment_row.employment_contract_id
        AND contract.source_system='MUNICONTROL') THEN
      PERFORM public.time_catalog_native_subject_v2(entry_row.tenant_id,
        entry_row.certified_binding_id,assignment_row.employment_contract_id,
        entry_row.effective_from,entry_row.effective_to);
    ELSE
    PERFORM 1
    FROM platform_tenant_source_binding binding
    JOIN employment_contract contract
      ON contract.id = assignment_row.employment_contract_id
     AND contract.source_system = 'GRH'
     AND contract.status = 'active'
     AND contract.legacy_company_id = binding.source_company_id
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = binding.source_database
     AND batch.validation_state = 'published'
     AND batch.legacy_import_run_id IS NOT NULL
    WHERE binding.id = entry_row.certified_binding_id
      AND binding.tenant_id = entry_row.tenant_id
      AND binding.verified IS TRUE
    FOR SHARE OF binding, contract, batch;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID' USING ERRCODE = 'P0001';
    END IF;
    END IF;
    PERFORM 1
    FROM time_catalog_entry shift_entry
    JOIN time_catalog_entry calendar_entry
      ON calendar_entry.id = assignment_row.calendar_entry_id
     AND calendar_entry.tenant_id = shift_entry.tenant_id
     AND calendar_entry.catalog_kind = 'calendar'
     AND calendar_entry.status = 'approved'
    JOIN time_catalog_entry rule_entry
      ON rule_entry.id = assignment_row.rule_profile_entry_id
     AND rule_entry.tenant_id = shift_entry.tenant_id
     AND rule_entry.catalog_kind = 'rule_profile'
     AND rule_entry.status = 'approved'
    WHERE shift_entry.id = assignment_row.shift_entry_id
      AND shift_entry.tenant_id = entry_row.tenant_id
      AND shift_entry.catalog_kind = 'shift'
      AND shift_entry.status = 'approved'
      AND shift_entry.certified_binding_id = entry_row.certified_binding_id
      AND calendar_entry.certified_binding_id = entry_row.certified_binding_id
      AND rule_entry.certified_binding_id = entry_row.certified_binding_id
      AND shift_entry.effective_from <= entry_row.effective_from
      AND calendar_entry.effective_from <= entry_row.effective_from
      AND rule_entry.effective_from <= entry_row.effective_from
      AND COALESCE(shift_entry.effective_to, DATE 'infinity')
        >= COALESCE(entry_row.effective_to, DATE '2100-12-31')
      AND COALESCE(calendar_entry.effective_to, DATE 'infinity')
        >= COALESCE(entry_row.effective_to, DATE '2100-12-31')
      AND COALESCE(rule_entry.effective_to, DATE 'infinity')
        >= COALESCE(entry_row.effective_to, DATE '2100-12-31')
    FOR SHARE OF shift_entry, calendar_entry, rule_entry;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_DEPENDENCY_INVALID' USING ERRCODE = 'P0001';
    END IF;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_apply_command_v1(
  p_actor_email text,
  p_actor_session_id uuid,
  p_actor_session_version integer,
  p_release_sha text,
  p_tenant_id uuid,
  p_membership_id uuid,
  p_command text,
  p_catalog_kind text,
  p_catalog_entry_id uuid,
  p_expected_version integer,
  p_idempotency_key uuid,
  p_command_hash text,
  p_payload jsonb,
  p_reason_code text,
  p_reason_hash text
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  context_value jsonb;
  entry_row time_catalog_entry%ROWTYPE;
  existing_event time_catalog_governance_event%ROWTYPE;
  target_id uuid;
  target_kind text;
  source_contract_id_value uuid;
  before_value jsonb := '{}'::jsonb;
  after_value jsonb;
  result_value jsonb;
  required_capability text;
BEGIN
  IF p_command IS NULL OR p_command NOT IN (
       'create_draft','update_draft','submit','approve','reject','retire'
     )
     OR p_idempotency_key IS NULL
     OR lower(COALESCE(p_command_hash,'')) !~ '^[a-f0-9]{64}$'
     OR p_expected_version IS NULL OR p_expected_version < 0
     OR lower(COALESCE(p_reason_hash,'')) !~ '^[a-f0-9]{64}$'
     OR time_catalog_reason_allowed_v1(p_command, p_reason_code) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'TIME_CATALOG_COMMAND_INVALID' USING ERRCODE = 'P0001';
  END IF;
  IF p_command = 'create_draft' THEN
    IF p_catalog_kind NOT IN ('calendar','shift','rule_profile','assignment')
       OR p_catalog_entry_id IS NOT NULL OR p_expected_version <> 0
       OR NOT time_catalog_payload_valid_v1(p_catalog_kind, p_payload) THEN
      RAISE EXCEPTION 'TIME_CATALOG_COMMAND_SHAPE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_command = 'update_draft' THEN
    IF p_catalog_kind NOT IN ('calendar','shift','rule_profile','assignment')
       OR p_catalog_entry_id IS NULL OR p_expected_version < 1
       OR NOT time_catalog_payload_valid_v1(p_catalog_kind, p_payload) THEN
      RAISE EXCEPTION 'TIME_CATALOG_COMMAND_SHAPE_INVALID' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_catalog_kind IS NOT NULL OR p_catalog_entry_id IS NULL
     OR p_expected_version < 1 OR p_payload IS NOT NULL THEN
    RAISE EXCEPTION 'TIME_CATALOG_COMMAND_SHAPE_INVALID' USING ERRCODE = 'P0001';
  END IF;

  context_value := time_source_assert_tenant_session_v1(
    p_actor_email, p_actor_session_id, p_actor_session_version,
    p_release_sha, p_tenant_id, p_membership_id
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'time-catalog-idempotency:' || (context_value->>'tenantId') || ':'
      || (context_value->>'membershipId') || ':' || p_idempotency_key::text, 0
  ));
  required_capability := CASE
    WHEN p_command IN ('create_draft','update_draft','submit')
      THEN 'time.catalog.propose'
    ELSE 'time.catalog.approve'
  END;
  context_value := time_catalog_assert_actor_authority_v1(
    context_value, required_capability
  );

  SELECT * INTO existing_event FROM time_catalog_governance_event event
  WHERE event.tenant_id = (context_value->>'tenantId')::uuid
    AND event.actor_membership_id = (context_value->>'membershipId')::uuid
    AND event.idempotency_key = p_idempotency_key
  FOR SHARE;
  IF FOUND THEN
    IF existing_event.command IS DISTINCT FROM p_command
       OR existing_event.command_hash IS DISTINCT FROM lower(p_command_hash)
       OR existing_event.expected_version IS DISTINCT FROM p_expected_version
       OR existing_event.actor_person_id IS DISTINCT FROM (context_value->>'actorPersonId')::uuid
       OR existing_event.actor_session_id IS DISTINCT FROM p_actor_session_id
       OR existing_event.actor_session_version IS DISTINCT FROM p_actor_session_version
       OR existing_event.release_sha IS DISTINCT FROM lower(p_release_sha)
       OR existing_event.actor_certified_binding_id
          IS DISTINCT FROM (context_value->>'certifiedBindingId')::uuid
       OR (p_catalog_entry_id IS NOT NULL
         AND existing_event.catalog_entry_id IS DISTINCT FROM p_catalog_entry_id) THEN
      RAISE EXCEPTION 'TIME_CATALOG_IDEMPOTENCY_REUSED' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO entry_row FROM time_catalog_entry entry
    WHERE entry.id = existing_event.catalog_entry_id
      AND entry.tenant_id = existing_event.tenant_id
    FOR SHARE;
    IF NOT FOUND OR entry_row.certified_binding_id
       IS DISTINCT FROM existing_event.catalog_certified_binding_id THEN
      RAISE EXCEPTION 'TIME_CATALOG_AUDIT_DRIFT' USING ERRCODE = 'P0001';
    END IF;
    RETURN existing_event.result || jsonb_build_object(
      'replayed', true,
      'historical', entry_row.version IS DISTINCT FROM existing_event.resulting_version
        OR entry_row.status IS DISTINCT FROM existing_event.after_snapshot->>'status'
    );
  END IF;

  IF p_command = 'create_draft' THEN
    target_id := gen_random_uuid();
    target_kind := p_catalog_kind;
  ELSE
    SELECT * INTO entry_row FROM time_catalog_entry entry
    WHERE entry.id = p_catalog_entry_id
      AND entry.tenant_id = (context_value->>'tenantId')::uuid
    FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION 'TIME_CATALOG_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    target_id := entry_row.id;
    target_kind := entry_row.catalog_kind;
    IF entry_row.version IS DISTINCT FROM p_expected_version THEN
      RAISE EXCEPTION 'TIME_CATALOG_VERSION_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'update_draft' AND (
      p_catalog_kind IS DISTINCT FROM entry_row.catalog_kind
      OR lower(p_payload->>'logicalKeyHash') IS DISTINCT FROM entry_row.logical_key_hash
      OR (p_payload->>'revision')::integer IS DISTINCT FROM entry_row.revision
    ) THEN
      RAISE EXCEPTION 'TIME_CATALOG_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
    END IF;
    IF p_command <> 'retire'
       AND entry_row.certified_binding_id
         IS DISTINCT FROM (context_value->>'certifiedBindingId')::uuid THEN
      RAISE EXCEPTION 'TIME_CATALOG_BINDING_STALE' USING ERRCODE = 'P0001';
    END IF;
    IF p_command IN ('update_draft','submit')
       AND entry_row.proposer_person_id
         IS DISTINCT FROM (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'TIME_CATALOG_PROPOSER_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF p_command IN ('approve','reject','retire')
       AND entry_row.proposer_person_id
         IS NOT DISTINCT FROM (context_value->>'actorPersonId')::uuid THEN
      RAISE EXCEPTION 'TIME_CATALOG_SEPARATION_OF_DUTIES' USING ERRCODE = 'P0001';
    END IF;
    before_value := time_catalog_entry_snapshot_v1(entry_row.id, entry_row.tenant_id);
  END IF;

  IF p_command IN ('create_draft','update_draft') THEN
    source_contract_id_value := CASE WHEN p_payload ? 'sourceContractId'
      THEN (p_payload->>'sourceContractId')::uuid END;
  END IF;

  IF p_command = 'create_draft' THEN
    INSERT INTO time_catalog_entry (
      id, tenant_id, certified_binding_id, catalog_kind, logical_key_hash,
      revision, effective_from, effective_to, timezone,
      source_contract_id, source_contract_certified_binding_id,
      status, version, proposer_person_id, proposer_membership_id,
      reason_code, reason_hash
    ) VALUES (
      target_id, (context_value->>'tenantId')::uuid,
      (context_value->>'certifiedBindingId')::uuid, target_kind,
      lower(p_payload->>'logicalKeyHash'), (p_payload->>'revision')::integer,
      (p_payload->>'effectiveFrom')::date,
      CASE WHEN p_payload ? 'effectiveTo' THEN (p_payload->>'effectiveTo')::date END,
      p_payload->>'timezone', source_contract_id_value,
      CASE WHEN source_contract_id_value IS NOT NULL
        THEN (context_value->>'certifiedBindingId')::uuid END,
      'draft', 1, (context_value->>'actorPersonId')::uuid,
      (context_value->>'membershipId')::uuid,
      p_reason_code, lower(p_reason_hash)
    );
  ELSIF p_command = 'update_draft' THEN
    IF entry_row.status <> 'draft' THEN
      RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE time_catalog_entry SET
      effective_from = (p_payload->>'effectiveFrom')::date,
      effective_to = CASE WHEN p_payload ? 'effectiveTo'
        THEN (p_payload->>'effectiveTo')::date END,
      timezone = p_payload->>'timezone',
      source_contract_id = source_contract_id_value,
      source_contract_certified_binding_id = CASE WHEN source_contract_id_value IS NOT NULL
        THEN (context_value->>'certifiedBindingId')::uuid END,
      version = version + 1, reason_code = p_reason_code,
      reason_hash = lower(p_reason_hash), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command = 'submit' THEN
    IF entry_row.status <> 'draft' THEN
      RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE time_catalog_entry SET
      status = 'submitted', version = version + 1,
      reason_code = p_reason_code, reason_hash = lower(p_reason_hash),
      submitted_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command IN ('approve','reject') THEN
    IF entry_row.status <> 'submitted' THEN
      RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    IF p_command = 'approve' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended(
        'time-catalog-approval:' || entry_row.tenant_id::text || ':'
          || entry_row.catalog_kind || ':' || entry_row.logical_key_hash, 0
      ));
    END IF;
    UPDATE time_catalog_entry SET
      status = CASE p_command WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
      version = version + 1, reason_code = p_reason_code,
      reason_hash = lower(p_reason_hash),
      approver_person_id = (context_value->>'actorPersonId')::uuid,
      approver_membership_id = (context_value->>'membershipId')::uuid,
      decided_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  ELSIF p_command = 'retire' THEN
    IF entry_row.status <> 'approved' THEN
      RAISE EXCEPTION 'TIME_CATALOG_TRANSITION_INVALID' USING ERRCODE = 'P0001';
    END IF;
    UPDATE time_catalog_entry SET
      status = 'retired', version = version + 1,
      reason_code = p_reason_code, reason_hash = lower(p_reason_hash),
      retired_at = now(), updated_at = now()
    WHERE id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
  END IF;

  IF p_command IN ('create_draft','update_draft') THEN
    DELETE FROM time_calendar_day
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
    DELETE FROM time_shift_weekly_interval
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
    DELETE FROM time_shift_spec
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
    DELETE FROM time_rule_parameter
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;
    DELETE FROM time_assignment_spec
    WHERE catalog_entry_id = target_id AND tenant_id = (context_value->>'tenantId')::uuid;

    IF target_kind = 'calendar' THEN
      INSERT INTO time_calendar_day (
        catalog_entry_id, tenant_id, catalog_kind,
        day_date, day_kind, day_code, evidence_sha256
      )
      SELECT target_id, (context_value->>'tenantId')::uuid, 'calendar',
        (item->>'date')::date, item->>'kind', item->>'code',
        CASE WHEN item ? 'evidenceSha256' THEN lower(item->>'evidenceSha256') END
      FROM jsonb_array_elements(p_payload->'spec'->'days') row(item);
    ELSIF target_kind = 'shift' THEN
      INSERT INTO time_shift_spec (
        catalog_entry_id, tenant_id, catalog_kind,
        entry_tolerance_seconds, exit_tolerance_seconds
      ) VALUES (
        target_id, (context_value->>'tenantId')::uuid, 'shift',
        (p_payload->'spec'->>'entryToleranceSeconds')::integer,
        (p_payload->'spec'->>'exitToleranceSeconds')::integer
      );
      INSERT INTO time_shift_weekly_interval (
        catalog_entry_id, tenant_id, catalog_kind, weekday,
        interval_sequence, interval_kind, starts_at, ends_at, crosses_midnight
      )
      SELECT target_id, (context_value->>'tenantId')::uuid, 'shift',
        (item->>'day')::smallint, (item->>'sequence')::smallint,
        item->>'kind', (item->>'start')::time, (item->>'end')::time,
        (item->>'crossesMidnight')::boolean
      FROM jsonb_array_elements(p_payload->'spec'->'intervals') row(item);
    ELSIF target_kind = 'rule_profile' THEN
      INSERT INTO time_rule_parameter (
        catalog_entry_id, tenant_id, catalog_kind, parameter_key, value_kind,
        integer_value, decimal_value, boolean_value, time_value, code_value, unit_code
      )
      SELECT target_id, (context_value->>'tenantId')::uuid, 'rule_profile',
        item->>'key', item->>'valueKind',
        CASE WHEN item->>'valueKind' = 'integer' THEN (item->>'value')::bigint END,
        CASE WHEN item->>'valueKind' = 'decimal' THEN (item->>'value')::numeric END,
        CASE WHEN item->>'valueKind' = 'boolean' THEN (item->>'value')::boolean END,
        CASE WHEN item->>'valueKind' = 'time' THEN (item->>'value')::time END,
        CASE WHEN item->>'valueKind' = 'code' THEN item->>'value' END,
        item->>'unitCode'
      FROM jsonb_array_elements(p_payload->'spec'->'parameters') row(item);
    ELSE
      INSERT INTO time_assignment_spec (
        catalog_entry_id, tenant_id, catalog_kind, employment_contract_id,
        shift_entry_id, shift_kind, calendar_entry_id, calendar_kind,
        rule_profile_entry_id, rule_profile_kind
      ) VALUES (
        target_id, (context_value->>'tenantId')::uuid, 'assignment',
        (p_payload->'spec'->>'employmentContractId')::uuid,
        (p_payload->'spec'->>'shiftEntryId')::uuid, 'shift',
        (p_payload->'spec'->>'calendarEntryId')::uuid, 'calendar',
        (p_payload->'spec'->>'ruleProfileEntryId')::uuid, 'rule_profile'
      );
    END IF;
  END IF;

  after_value := time_catalog_entry_snapshot_v1(
    target_id, (context_value->>'tenantId')::uuid
  );
  result_value := jsonb_build_object(
    'data', after_value,
    'replayed', false,
    'catalogReady', false,
    'attendanceEvaluationReady', false,
    'punchesLoaded', false,
    'minutesCalculated', false,
    'payrollPosted', false,
    'grhMutation', false
  );
  INSERT INTO time_catalog_governance_event (
    tenant_id, catalog_entry_id, catalog_certified_binding_id,
    actor_certified_binding_id, actor_membership_id, actor_person_id,
    actor_session_id, actor_session_version, release_sha,
    command, idempotency_key, command_hash, expected_version, resulting_version,
    reason_code, reason_hash, before_snapshot, after_snapshot, result
  ) VALUES (
    (context_value->>'tenantId')::uuid, target_id,
    CASE WHEN p_command = 'create_draft'
      THEN (context_value->>'certifiedBindingId')::uuid
      ELSE entry_row.certified_binding_id END,
    (context_value->>'certifiedBindingId')::uuid,
    (context_value->>'membershipId')::uuid,
    (context_value->>'actorPersonId')::uuid,
    p_actor_session_id, p_actor_session_version, lower(p_release_sha),
    p_command, p_idempotency_key, lower(p_command_hash), p_expected_version,
    (after_value->>'version')::integer, p_reason_code, lower(p_reason_hash),
    before_value, after_value, result_value
  );
  RETURN result_value;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$;

CREATE OR REPLACE FUNCTION time_catalog_guard_draft_child_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target_id uuid;
  target_tenant uuid;
  entry_row time_catalog_entry%ROWTYPE;
BEGIN
  target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.catalog_entry_id ELSE NEW.catalog_entry_id END;
  target_tenant := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  SELECT * INTO entry_row FROM time_catalog_entry entry
  WHERE entry.id = target_id AND entry.tenant_id = target_tenant
  FOR SHARE;
  IF NOT FOUND OR entry_row.status <> 'draft' THEN
    RAISE EXCEPTION 'TIME_CATALOG_CHILD_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.catalog_entry_id IS DISTINCT FROM OLD.catalog_entry_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.catalog_kind IS DISTINCT FROM OLD.catalog_kind
  ) THEN
    RAISE EXCEPTION 'TIME_CATALOG_CHILD_IDENTITY_IMMUTABLE' USING ERRCODE = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'time_calendar_day' AND TG_OP <> 'DELETE' THEN
    IF NEW.day_date < entry_row.effective_from
       OR NEW.day_date > COALESCE(entry_row.effective_to, DATE 'infinity') THEN
      RAISE EXCEPTION 'TIME_CATALOG_CALENDAR_DAY_OUTSIDE_EFFECTIVE_RANGE' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
