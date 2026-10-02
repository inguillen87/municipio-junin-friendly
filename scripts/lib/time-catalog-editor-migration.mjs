// Preparation and authorized review in the existing011 catalog. No evaluator.
export const TIME_CATALOG_EDITOR_SCHEMA_SQL = `ALTER TABLE public.time_catalog_entry
 ADD COLUMN reference_code varchar(64),
 ADD COLUMN display_name varchar(120),
 ADD COLUMN legal_reference varchar(200),
 ADD CONSTRAINT time_catalog_reference_shape_v2 CHECK (
   (display_name IS NULL AND reference_code IS NULL AND legal_reference IS NULL)
   OR (display_name IS NOT NULL AND char_length(display_name) BETWEEN 3 AND 120
     AND display_name=btrim(display_name) AND display_name !~ '[[:cntrl:]]'
     AND (reference_code IS NULL OR reference_code ~ '^[a-z][a-z0-9_.-]{1,63}$')
     AND (legal_reference IS NULL OR (char_length(legal_reference) BETWEEN 3 AND 200
       AND legal_reference=btrim(legal_reference) AND legal_reference !~ '[[:cntrl:]]')))
 ),
 ADD CONSTRAINT time_catalog_reference_key_v2 CHECK (reference_code IS NULL OR
   logical_key_hash=encode(public.digest(catalog_kind||':'||reference_code,'sha256'),'hex'));
`;

export const TIME_CATALOG_EDITOR_HELPERS_SQL = `CREATE OR REPLACE FUNCTION public.time_catalog_edit_payload_v2(ctx jsonb,p_entry uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.time_catalog_entry%ROWTYPE; s jsonb; result jsonb;
BEGIN
 IF NOT (ctx->'capabilities' ? 'time.catalog.propose') THEN RETURN NULL; END IF;
 SELECT * INTO e FROM public.time_catalog_entry WHERE id=p_entry
   AND tenant_id=(ctx->>'tenantId')::uuid
   AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid
   AND proposer_person_id=(ctx->>'actorPersonId')::uuid AND status='draft' FOR SHARE NOWAIT;
 IF NOT FOUND OR (e.catalog_kind='assignment' AND NOT COALESCE((ctx->>'assignmentReadAllowed')::boolean,false)) THEN RETURN NULL; END IF;
 s:=public.time_catalog_entry_snapshot_v1(e.id,e.tenant_id)->'configuration';
 IF e.catalog_kind='calendar' THEN
   SELECT jsonb_build_object('days',jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
     'date',d.day_date,'kind',d.day_kind,'code',d.day_code,'evidenceSha256',d.evidence_sha256)) ORDER BY d.day_date)) INTO s
   FROM public.time_calendar_day d WHERE d.catalog_entry_id=e.id AND d.tenant_id=e.tenant_id;
 ELSIF e.catalog_kind='rule_profile' THEN
   SELECT jsonb_build_object('parameters',jsonb_agg(jsonb_build_object(
     'key',p.parameter_key,'valueKind',p.value_kind,'unitCode',p.unit_code,'value',
       CASE p.value_kind WHEN 'integer' THEN to_jsonb(p.integer_value) WHEN 'decimal' THEN to_jsonb(p.decimal_value)
         WHEN 'boolean' THEN to_jsonb(p.boolean_value) WHEN 'time' THEN to_jsonb(p.time_value) ELSE to_jsonb(p.code_value) END
   ) ORDER BY p.parameter_key)) INTO s FROM public.time_rule_parameter p WHERE p.catalog_entry_id=e.id AND p.tenant_id=e.tenant_id;
 ELSIF e.catalog_kind='assignment' THEN
   SELECT jsonb_build_object('employmentContractId',a.employment_contract_id,'shiftEntryId',a.shift_entry_id,
     'calendarEntryId',a.calendar_entry_id,'ruleProfileEntryId',a.rule_profile_entry_id) INTO s
   FROM public.time_assignment_spec a WHERE a.catalog_entry_id=e.id AND a.tenant_id=e.tenant_id;
 END IF;
 result:=jsonb_strip_nulls(jsonb_build_object('effectiveFrom',e.effective_from,'effectiveTo',e.effective_to,
   'logicalKeyHash',e.logical_key_hash,'revision',e.revision,'timezone',e.timezone,
   'sourceContractId',e.source_contract_id,'spec',s));
 IF e.display_name IS NOT NULL THEN result:=result||jsonb_build_object('reference',jsonb_strip_nulls(jsonb_build_object(
   'code',e.reference_code,'title',e.display_name,'legalReference',e.legal_reference))); END IF;
 RETURN result;
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY';
END $$;

CREATE OR REPLACE FUNCTION public.time_catalog_assignment_view_v2(ctx jsonb,p_entry uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE e public.time_catalog_entry%ROWTYPE; a public.time_assignment_spec%ROWTYPE; subject jsonb;
BEGIN
 IF NOT COALESCE((ctx->>'assignmentReadAllowed')::boolean,false) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tenant_iam_effective_capabilities((ctx->>'membershipId')::uuid) c
   WHERE c.capability_key='workforce.employee.read') THEN RAISE EXCEPTION 'TIME_CATALOG_CAPABILITY_REQUIRED'; END IF;
 SELECT * INTO e FROM public.time_catalog_entry WHERE id=p_entry
   AND tenant_id=(ctx->>'tenantId')::uuid AND certified_binding_id=(ctx->>'certifiedBindingId')::uuid
   AND catalog_kind='assignment' FOR SHARE NOWAIT;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO a FROM public.time_assignment_spec WHERE catalog_entry_id=e.id AND tenant_id=e.tenant_id FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'TIME_CATALOG_ASSIGNMENT_MISSING'; END IF;
 subject:=public.payroll_fixed_registry_subject_by_contract_v1(ctx,a.employment_contract_id,true)->'subject';
 RETURN jsonb_build_object('target',jsonb_build_object('contractId',subject->>'contractId','legajo',subject->>'legajo','name',subject->>'employeeName'),
   'shift',public.time_catalog_entry_snapshot_v1(a.shift_entry_id,e.tenant_id),
   'calendar',public.time_catalog_entry_snapshot_v1(a.calendar_entry_id,e.tenant_id),
   'ruleProfile',public.time_catalog_entry_snapshot_v1(a.rule_profile_entry_id,e.tenant_id));
EXCEPTION WHEN lock_not_available THEN RAISE EXCEPTION 'TIME_CATALOG_SESSION_BUSY';
END $$;
REVOKE ALL ON FUNCTION public.time_catalog_edit_payload_v2(jsonb,uuid),public.time_catalog_assignment_view_v2(jsonb,uuid)
 FROM PUBLIC,municontrol_actions_runtime_app;
`;

export function timeCatalogEditorDefinitions(originals, definitions, replaceOnce) {
 let d=definitions.time_catalog_assert_actor_authority_v1;
 d=replaceOnce(d,"    'areaScopes', '[]'::jsonb",`    'assignmentReadAllowed', EXISTS(SELECT 1 FROM tenant_iam_effective_capabilities((p_context->>'membershipId')::uuid) c
      WHERE c.capability_key='workforce.employee.read'),
    'areaScopes', '[]'::jsonb`);
 definitions.time_catalog_assert_actor_authority_v1=d;
 definitions.time_catalog_principal_projection_v1=replaceOnce(definitions.time_catalog_principal_projection_v1,
   "p_context->>'roleKey',p_context->'capabilities'", "p_context->>'roleKey',p_context->'capabilities',p_context->'assignmentReadAllowed'");
 d=originals.time_catalog_payload_valid_v1.definition;
 d=replaceOnce(d,"    'sourceContractId','spec','timezone'", "    'sourceContractId','spec','timezone','reference'");
 d=replaceOnce(d,"  IF p_payload ? 'sourceContractId' THEN",`  IF p_payload ? 'reference' THEN
    IF jsonb_typeof(p_payload->'reference') IS DISTINCT FROM 'object'
      OR NOT (p_payload->'reference' ? 'title')
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_payload->'reference') k WHERE k NOT IN ('code','title','legalReference'))
      OR jsonb_typeof(p_payload#>'{reference,title}') IS DISTINCT FROM 'string'
      OR char_length(p_payload#>>'{reference,title}') NOT BETWEEN 3 AND 120
      OR p_payload#>>'{reference,title}' IS DISTINCT FROM btrim(p_payload#>>'{reference,title}')
      OR p_payload#>>'{reference,title}' ~ '[[:cntrl:]]'
      OR (p_payload#>'{reference,code}' IS NOT NULL AND (jsonb_typeof(p_payload#>'{reference,code}') IS DISTINCT FROM 'string'
        OR p_payload#>>'{reference,code}' !~ '^[a-z][a-z0-9_.-]{1,63}$'
        OR p_payload->>'logicalKeyHash' IS DISTINCT FROM encode(public.digest(p_catalog_kind||':'||(p_payload#>>'{reference,code}'),'sha256'),'hex')))
      OR (p_payload#>'{reference,legalReference}' IS NOT NULL AND (jsonb_typeof(p_payload#>'{reference,legalReference}') IS DISTINCT FROM 'string'
        OR char_length(p_payload#>>'{reference,legalReference}') NOT BETWEEN 3 AND 200
        OR p_payload#>>'{reference,legalReference}' IS DISTINCT FROM btrim(p_payload#>>'{reference,legalReference}')
        OR p_payload#>>'{reference,legalReference}' ~ '[[:cntrl:]]')) THEN RETURN false; END IF;
  END IF;
  IF p_payload ? 'sourceContractId' THEN`);
 definitions.time_catalog_payload_valid_v1=d;
 definitions.time_catalog_entry_snapshot_v1=replaceOnce(originals.time_catalog_entry_snapshot_v1.definition,
   "    'sourceLinked', entry_row.source_contract_id IS NOT NULL,",`    'sourceLinked', entry_row.source_contract_id IS NOT NULL,
    'reference', CASE WHEN entry_row.display_name IS NOT NULL THEN jsonb_build_object(
      'code',entry_row.reference_code,'title',entry_row.display_name,'legalReference',entry_row.legal_reference) END,`);
 d=definitions.time_catalog_guard_entry_v1;
 d=replaceOnce(d,"     OR NEW.revision IS DISTINCT FROM OLD.revision", "     OR NEW.revision IS DISTINCT FROM OLD.revision\n     OR NEW.reference_code IS DISTINCT FROM OLD.reference_code");
 d=replaceOnce(d,"      'effective_from','effective_to','timezone','source_contract_id',", "      'display_name','legal_reference',\n      'effective_from','effective_to','timezone','source_contract_id',");
 definitions.time_catalog_guard_entry_v1=d;
 d=definitions.time_catalog_apply_command_v1;
 d=replaceOnce(d,"      p_reason_code, lower(p_reason_hash)\n    );", "      p_reason_code, lower(p_reason_hash),\n      p_payload#>>'{reference,code}',p_payload#>>'{reference,title}',p_payload#>>'{reference,legalReference}'\n    );");
 d=replaceOnce(d,"      reason_code, reason_hash\n    ) VALUES", "      reason_code, reason_hash, reference_code,display_name,legal_reference\n    ) VALUES");
 d=replaceOnce(d,"      OR (p_payload->>'revision')::integer IS DISTINCT FROM entry_row.revision", "      OR (p_payload->>'revision')::integer IS DISTINCT FROM entry_row.revision\n      OR (p_payload ? 'reference' AND (p_payload#>>'{reference,code}') IS DISTINCT FROM entry_row.reference_code)");
 d=replaceOnce(d,"    UPDATE time_catalog_entry SET\n      effective_from", `    UPDATE time_catalog_entry SET
      display_name=CASE WHEN p_payload ? 'reference' THEN p_payload#>>'{reference,title}' ELSE display_name END,
      legal_reference=CASE WHEN p_payload ? 'reference' THEN p_payload#>>'{reference,legalReference}' ELSE legal_reference END,
      effective_from`);
 d=replaceOnce(d,"  IF p_command IN ('create_draft','update_draft') THEN\n    source_contract_id_value",`  IF target_kind='assignment' AND NOT COALESCE((context_value->>'assignmentReadAllowed')::boolean,false) THEN
    RAISE EXCEPTION 'TIME_CATALOG_CAPABILITY_REQUIRED';
  END IF;
  IF p_command IN ('create_draft','update_draft') THEN
    IF target_kind='assignment' THEN
      PERFORM public.payroll_fixed_registry_subject_by_contract_v1(context_value,(p_payload#>>'{spec,employmentContractId}')::uuid,true);
    END IF;
    source_contract_id_value`);
 definitions.time_catalog_apply_command_v1=d;
 definitions.time_catalog_apply_command_v1=replaceOnce(definitions.time_catalog_apply_command_v1,
   "    RETURN existing_event.result || jsonb_build_object(",`    IF entry_row.catalog_kind='assignment' AND NOT COALESCE((context_value->>'assignmentReadAllowed')::boolean,false) THEN
      RAISE EXCEPTION 'TIME_CATALOG_CAPABILITY_REQUIRED';
    END IF;
    RETURN existing_event.result || jsonb_build_object(`);
 definitions.time_catalog_detail_v1=replaceOnce(originals.time_catalog_detail_v1.definition,
   "    'record', time_catalog_entry_snapshot_v1(entry_row.id, entry_row.tenant_id),", `    'record', time_catalog_entry_snapshot_v1(entry_row.id, entry_row.tenant_id),
    'editPayload',public.time_catalog_edit_payload_v2(context_value,entry_row.id),
    'assignment',public.time_catalog_assignment_view_v2(context_value,entry_row.id),
    'allowedCommands',CASE
      WHEN entry_row.certified_binding_id IS DISTINCT FROM (context_value->>'certifiedBindingId')::uuid
        OR (entry_row.catalog_kind='assignment' AND NOT COALESCE((context_value->>'assignmentReadAllowed')::boolean,false)) THEN '[]'::jsonb
      WHEN entry_row.status='draft' AND entry_row.proposer_person_id=(context_value->>'actorPersonId')::uuid
        AND context_value->'capabilities' ? 'time.catalog.propose' THEN '["update_draft","submit"]'::jsonb
      WHEN entry_row.status='submitted' AND entry_row.proposer_person_id IS DISTINCT FROM (context_value->>'actorPersonId')::uuid
        AND context_value->'capabilities' ? 'time.catalog.approve' THEN '["approve","reject"]'::jsonb
      WHEN entry_row.status='approved' AND entry_row.proposer_person_id IS DISTINCT FROM (context_value->>'actorPersonId')::uuid
        AND context_value->'capabilities' ? 'time.catalog.approve' THEN '["retire"]'::jsonb ELSE '[]'::jsonb END,`);
 return definitions;
}
