-- Explicit contract UUID monthly entry for the approved municipal population.
-- No TXT/DNI resolver, identity mutation, salary formula or payment.
-- Run only through an atomic reviewed installation, after SQL136/137/138.
DO $$ BEGIN
 IF to_regprocedure('public.payroll_fixed_registry_subject_v2(jsonb,uuid,boolean)') IS NULL
 OR to_regprocedure('public.payroll_fixed_registry_actor_v2(jsonb)') IS NULL
 OR to_regprocedure('public.payroll_fixed_registry_range_v2(jsonb,uuid,date,date,boolean)') IS NULL
 OR to_regclass('public.payroll_novelty_row') IS NULL
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ADOPTION_PREREQUISITE'; END IF;
END $$;

DO $patch$
DECLARE item record;original pg_proc;updated pg_proc;definition text;old_text text;new_text text;metadata jsonb;
BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('assert_context_v1','jsonb,text','14f25a6e6f163da5696bf37cd7992e9ed6475e2e581a34dc0c81b3807b8d286c',false,true),
  ('native_rows_valid_v2','jsonb,text','b01ad454dc70d83d1465fa84e0fcfc4454a47a2750d5be712a576e3647c7524d',false,false),
  ('subject_v2','jsonb,uuid,boolean','1132198260c7fef85d29f4020a65d47d695c9bf541473f8e52c4c65fbd00618a',false,false),
  ('native_subject_v2','jsonb,jsonb,date,boolean','17d60c239a5f66540b2beef43f9b6e839aeebfb3cd6d254a4a833256fc35be20',false,false)
 ) pins(name,args,sha,runtime,original_path) LOOP
  SELECT * INTO original FROM pg_proc WHERE oid=to_regprocedure('public.payroll_novelty_'||item.name||'('||item.args||')');
  IF original.oid IS NULL OR original.proowner<>current_user::regrole OR NOT original.prosecdef
   OR original.proconfig IS DISTINCT FROM (CASE WHEN item.original_path THEN ARRAY['search_path=public, pg_temp'] ELSE ARRAY['search_path=pg_catalog, public, pg_temp'] END)::text[]
   OR encode(sha256(convert_to(replace(original.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>item.sha
   OR has_function_privilege('municontrol_actions_runtime_app',original.oid,'EXECUTE')<>item.runtime
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(original.proacl,acldefault('f',original.proowner))) acl WHERE acl.grantee<>original.proowner)
  THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ADOPTION_DEFINITION_CHANGED: %',item.name; END IF;
  definition:=pg_get_functiondef(original.oid);metadata:=to_jsonb(original)-'prosrc';
  IF item.name='assert_context_v1' THEN
   old_text:='  employment_linked := FOUND;';
   new_text:=old_text||$actor$
  IF NOT employment_linked THEN
   BEGIN
    SELECT (resolved->>'actorPersonId')::uuid,(resolved->>'employmentLinked')::boolean
    INTO actor_person_id,employment_linked FROM (
     SELECT public.payroll_fixed_registry_actor_v2(jsonb_build_object(
      'tenantId',membership_row.tenant_id,'membershipId',membership_row.id,
      'certifiedBindingId',binding_row.id,'sourceDatabase',binding_row.source_database,
      'sourceCompanyId',binding_row.source_company_id,'actorPersonId',NULL,'employmentLinked',false)) resolved
    ) checked;
   EXCEPTION WHEN OTHERS THEN
    IF SQLERRM='PAYROLL_FIXED_SESSION_BUSY' THEN RAISE EXCEPTION 'PAYROLL_NOVELTY_SESSION_BUSY'; END IF;
    RAISE;
   END;
  END IF;
$actor$;
  ELSIF item.name='subject_v2' THEN
   old_text:='public.payroll_fixed_registry_subject_by_contract_v1';new_text:='public.payroll_fixed_registry_subject_v2';
  ELSIF item.name='native_rows_valid_v2' THEN
   old_text:=' RETURN public.payroll_novelty_rows_valid_v1(jsonb_build_array(r-''contractId''-''identityToken''),p_source_mode);';
   -- Only the explicit native facade permits the opaque snapshot. The original
   -- validator still checks every business value/field; no stored legajo changes.
   new_text:=$row$
 IF jsonb_typeof(r->'legajo') IS DISTINCT FROM 'string' OR length(r->>'legajo') NOT BETWEEN 1 AND 64
 OR r->>'legajo'~'[[:cntrl:]]' OR r->>'legajo'~E'[\u0080-\u009f]' THEN RETURN false; END IF;
 RETURN public.payroll_novelty_rows_valid_v1(jsonb_build_array((r-'contractId'-'identityToken')||jsonb_build_object('legajo','0')),p_source_mode);
$row$;
  ELSE
   old_text:='public.native_employment_lifecycle_range_v1';new_text:='public.payroll_fixed_registry_range_v2';
  END IF;
  IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>(CASE WHEN item.name='native_subject_v2' THEN 2 ELSE 1 END)
  THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ADOPTION_PATCH_CHANGED: %',item.name; END IF;
  definition:=replace(definition,old_text,new_text);
  IF item.name IN('subject_v2','native_subject_v2') THEN
   old_text:=' WHEN ''PAYROLL_FIXED_IDENTITY_CHANGED'' THEN RAISE EXCEPTION ''PAYROLL_NOVELTY_IDENTITY_CHANGED'';';
   IF item.name='subject_v2' THEN
    IF (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ADOPTION_PATCH_CHANGED'; END IF;
    definition:=replace(definition,old_text,old_text||E'\n WHEN ''PAYROLL_FIXED_DATES_INVALID'' THEN RAISE EXCEPTION ''PAYROLL_NOVELTY_PERIOD_OUTSIDE_EMPLOYMENT'';');
   END IF;
  END IF;
  EXECUTE definition;
  SELECT * INTO updated FROM pg_proc WHERE oid=original.oid;
  IF (to_jsonb(updated)-'prosrc') IS DISTINCT FROM metadata THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ADOPTION_METADATA_CHANGED'; END IF;
 END LOOP;
END $patch$;

DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.payroll_novelty_row'::regclass
  AND attname='legajo_snapshot' AND atttypid='varchar'::regtype AND atttypmod=24 AND attnotnull AND NOT attisdropped)
 OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.payroll_novelty_row'::regclass
  AND conname='payroll_novelty_row_legajo_ck' AND contype='c' AND convalidated
  AND pg_get_constraintdef(oid)=$shape$CHECK (((legajo_snapshot)::text ~ '^(0|[1-9][0-9]{0,19})$'::text))$shape$)
 THEN RAISE EXCEPTION 'PAYROLL_MONTHLY_ADOPTION_SHAPE_CHANGED'; END IF;
END $$;
ALTER TABLE public.payroll_novelty_row ALTER COLUMN legajo_snapshot TYPE varchar(64);
ALTER TABLE public.payroll_novelty_row DROP CONSTRAINT payroll_novelty_row_legajo_ck;
ALTER TABLE public.payroll_novelty_row ADD CONSTRAINT payroll_novelty_row_legajo_ck CHECK (
 (native_registration_id IS NULL AND legajo_snapshot ~ '^(0|[1-9][0-9]{0,19})$')
 OR (native_registration_id IS NOT NULL AND length(legajo_snapshot) BETWEEN 1 AND 64
  AND legajo_snapshot !~ '[[:cntrl:]]' AND legajo_snapshot !~ E'[\u0080-\u009f]')
);
