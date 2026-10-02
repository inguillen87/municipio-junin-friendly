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
 ('time_catalog_assert_actor_authority_v1(jsonb,text)','3aab92d252fc108dc5c08bb78142cb61e74c4b8bed310941f9009fb6722717fb'),
 ('time_catalog_assert_person_sod_v1(uuid,uuid,uuid)','4c4042fb3b71d03d9ccd1da82c6f63f2023b1b2b7808397969edfab3aecb660b'),
 ('time_catalog_guard_entry_v1()','64185f00eab6d347f6b0a12045619117332214913b2e174aaa346930601b9a50'),
 ('time_catalog_assert_approvable_v1(uuid,uuid,uuid)','3510543ef293e222bef0072429fda52df21e56e5fd448156f44b485f1c80db18'),
 ('payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)','7b490b4cc34bd45205dacf169c1fc2432c5a711fd99d6384bdc0d22db4236e48'),
 ('native_employment_change_subject_v1(jsonb,uuid)','3a50695689cc90517b0ef9795ce1588cc8a4e49b5515f16832c6c2d4521459b0'),
 ('native_employment_lifecycle_subject_v1(jsonb,uuid)','4c5a4785240c5ebfb91c2445d265c2ebe6d3063710fe5d01ebc2b2bbfa591e95'),
 ('native_employment_lifecycle_range_v1(jsonb,uuid,date,date,boolean)','d3d8b65fbcb27cfa3926c224be27832007e5a55f7e933c839fa7bb39d954fed7'),
 ('native_employment_lifecycle_state_v1(jsonb,uuid,jsonb)','dd5ea2251c5e7279df3bdab239381c80b2112aca3731464d3cb551e1fb45b380'),
 ('native_employment_lifecycle_intervals_v1(jsonb)','8b195f02bb936108c373f14b7338b707771966fec8c064ac51d0132d38f2b988'),
 ('native_employment_lifecycle_activity_v1(jsonb,date)','6a31b3c7be5e6226975e0283954ef2ca0b217aac8799010f98ef07b8d64fac23'),
 ('native_employment_lifecycle_version_v1(jsonb,jsonb,integer)','44b8e2f32e6f55b9fbd994657e3a69f5de17991cc4680307734c48302f72d2f3')
 ) pin(signature,sha256) LOOP
  SELECT encode(public.digest(replace(p.prosrc,E'\r\n',E'\n'),'sha256'),'hex') INTO actual
  FROM pg_proc p WHERE p.oid=to_regprocedure('public.'||item.signature)
    AND p.prosecdef AND p.proowner=current_user::regrole
    AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE') IS FALSE;
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
$$

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
  IF (has_propose AND has_approve AND NOT public.tenant_iam_operational_person_pair_v1(p_tenant_id,p_actor_person_id,p_certified_binding_id,'catalog')) OR (has_approve AND has_overtime_post) THEN
    RAISE EXCEPTION 'TIME_CATALOG_PERSON_SOD_CONFLICT' USING ERRCODE = 'P0001';
  END IF;
EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY' USING ERRCODE = 'P0001';
END
$$

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
  IF transition_command = 'approve' THEN
    PERFORM time_catalog_assert_approvable_v1(
      NEW.id, NEW.tenant_id, NEW.certified_binding_id
    );
  END IF;
  RETURN NEW;
END
$$

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
$$
