-- PRIVATE SOURCE CANDIDATE. Not parsed, installed or executed locally.
-- Three NEW functions only. This is not an admitted installer or a seed.
-- A future preservation installer MUST pin the complete prerequisite bodies,
-- signatures, ACLs, trigger/constraint definitions and source closure before
-- applying this source in one authorized transaction on PostgreSQL17/18.
-- Source-only structural checks below do not replace those exact source pins.
DO $annul_preparation_209$
DECLARE
 runtime_oid oid;effective_defaults aclitem[];signature text;new_name text;
 actual pg_proc;old_functions jsonb;after_functions jsonb;
 new_names text[]:=ARRAY['own_annul_preparation_core_v1','own_annul_preparation_v1','own_annul_preparation_full_v1'];
BEGIN
 IF current_setting('transaction_isolation')<>'repeatable read' OR current_setting('server_version_num')::integer/10000 NOT IN(17,18) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_INSTALL_CONTEXT_REQUIRED';END IF;
 runtime_oid:=to_regrole('municontrol_actions_runtime_app');
 IF runtime_oid IS NULL OR runtime_oid=current_user::regrole THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_INSTALL_PREREQUISITE';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(new_names)) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_INSTALL_ALREADY_PRESENT';END IF;
 FOREACH signature IN ARRAY ARRAY[
  'public.own_run_context_v1(jsonb,boolean,boolean)',
  'public.own_run_lock_v1(jsonb)',
  'public.own_run_hash_v1(jsonb)',
  'public.own_program_exact_v1(jsonb,text[])',
  'public.native_salary_scope_v1(jsonb)',
  'public.own_liquidation_state_v1(jsonb,public.own_payroll_run_capture)',
  'public.own_liquidation_rows_v1(jsonb,public.own_payroll_run_capture)',
  'public.own_liquidation_current_v1(jsonb,text,text)',
  'public.own_close_active_v1(jsonb,text,text)'
 ] LOOP
  SELECT * INTO actual FROM pg_proc WHERE oid=to_regprocedure(signature);
  IF actual.oid IS NULL OR actual.proowner<>current_user::regrole OR NOT actual.prosecdef THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_INSTALL_PREREQUISITE';END IF;
 END LOOP;
 -- These structures are only checked for existence here. Exact table/trigger
 -- metadata,197 approvedEdges closure and every prerequisite definition remain
 -- a REQUIRED future source-pinned installer precondition, not certified here.
 IF to_regclass('public.own_payroll_annul_event') IS NULL OR to_regclass('public.own_payroll_liquidation_event') IS NULL OR to_regclass('public.own_payroll_close_event') IS NULL THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_INSTALL_PREREQUISITE';END IF;
 effective_defaults:=coalesce((SELECT d.defaclacl FROM pg_default_acl d WHERE d.defaclrole=current_user::regrole AND d.defaclobjtype='f' AND d.defaclnamespace=0),acldefault('f',current_user::regrole))||coalesce((SELECT d.defaclacl FROM pg_default_acl d WHERE d.defaclrole=current_user::regrole AND d.defaclobjtype='f' AND d.defaclnamespace='public'::regnamespace),'{}'::aclitem[]);
 IF EXISTS(SELECT 1 FROM aclexplode(effective_defaults) a WHERE a.grantor<>current_user::regrole OR a.grantee NOT IN(0,current_user::regrole,runtime_oid) OR a.privilege_type<>'EXECUTE' OR a.is_grantable) OR NOT EXISTS(SELECT 1 FROM aclexplode(effective_defaults) a WHERE a.grantee=current_user::regrole AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_INSTALL_DEFAULT_ACL_CHANGED';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.oid),'[]') INTO old_functions FROM pg_proc f WHERE f.pronamespace='public'::regnamespace;

 EXECUTE $definition_209$CREATE FUNCTION public.own_annul_preparation_core_v1(p jsonb,source_id uuid,maximum_bytes integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $projection$
DECLARE
 ctx jsonb;scope_value text;required_capability text;parent public.own_payroll_annul_event;
 child public.own_payroll_liquidation_event;history_event public.own_payroll_liquidation_event;
 close_event public.own_payroll_close_event;capture public.own_payroll_run_capture;saved public.own_payroll_run_result;
 original jsonb;body_value jsonb;receipt_value jsonb;child_value jsonb;affected_value jsonb;person jsonb;decision jsonb;change_value jsonb;
 run_rows jsonb;run_census jsonb;global_active jsonb;active_closes jsonb;
 runs_value jsonb:='[]';projected_affected jsonb:='[]';
 inventory_digest text;census_digest text;liquidation_history_digest text;close_history_digest text;
 fold_version constant text:='own-annul-preparation-fold.v1';fold_domain jsonb;fold_record jsonb;
 child_ids uuid[]:='{}';child_keys uuid[]:='{}';child_runs uuid[]:='{}';
 affected_ids uuid[];period_value text;type_value text;kind text;selected_values jsonb;selection_values text[]:='{}';
 stored_scope text;creator_scope text;date_value jsonb;date_groups jsonb;source_value jsonb;state_commitment text;detail jsonb;
 affected_count integer;employee_count integer;concept_count integer;child_count integer:=0;union_count integer:=0;
 capture_count bigint:=0;calculated_count bigint:=0;liquidation_history_count bigint:=0;close_history_count bigint:=0;
BEGIN
 IF source_id IS NULL THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_NOT_FOUND';END IF;
 IF maximum_bytes IS NULL OR maximum_bytes NOT IN(4194304,33554432) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 BEGIN
  ctx:=public.own_run_context_v1(p,true,true);
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM IN('OWN_RUN_FORBIDDEN','OWN_RUN_EMPLOYMENT_REQUIRED','NATIVE_SALARY_FORBIDDEN','NATIVE_EMPLOYEE_FORBIDDEN') THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_FORBIDDEN';END IF;
  RAISE;
 END;
 FOREACH required_capability IN ARRAY ARRAY['workforce.employee.read','payroll.parameter.read','payroll.calculation.read','payroll.calculation.nominal.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.export','payroll.calculation.prepare'] LOOP
  IF NOT public.action_center_context_has_capability(ctx,required_capability) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_FORBIDDEN';END IF;
 END LOOP;
 -- Same tenant/binding advisory lock as all canonical capture/decision/close
 -- writers, held to the end of this statement transaction. No borrowed ctx.
 -- The future native proof must verify that shared-writer closure and snapshot
 -- behaviour. Three separate API SELECTs are NOT an atomic calculation handoff.
 PERFORM public.own_run_lock_v1(ctx);scope_value:=public.native_salary_scope_v1(ctx);
 SELECT * INTO parent FROM public.own_payroll_annul_event e WHERE e.id=source_id AND e.tenant_id=(ctx->>'tenantId')::uuid AND e.source_binding_id=(ctx->>'sourceBindingId')::uuid;
 IF parent.id IS NULL THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_NOT_FOUND';END IF;
 original:=parent.receipt;body_value:=parent.body;
 IF NOT public.own_program_exact_v1(original,ARRAY['version','id','key','body','bodySha256','affected','receipts','recordedAt','replayed']) OR coalesce(original->>'version','') NOT IN('own-annul-receipt.v1','own-annul-receipt.v2') OR original->>'id' IS DISTINCT FROM parent.id::text OR original->>'key' IS DISTINCT FROM parent.request_key::text OR original->'body' IS DISTINCT FROM body_value OR original->>'bodySha256' IS DISTINCT FROM parent.body_sha256 OR parent.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(body_value) OR original->'recordedAt' IS DISTINCT FROM to_jsonb(parent.recorded_at) OR original->'replayed' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 IF original->>'version'='own-annul-receipt.v1' THEN
  IF NOT public.own_program_exact_v1(body_value,ARRAY['period','liquidationType','scopeVersion','stateVersion','selection','reason','reviewConfirmed']) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 ELSE
  IF NOT public.own_program_exact_v1(body_value,ARRAY['version','period','liquidationType','scopeVersion','stateVersion','reviewSha256','selection','reason','reviewConfirmed']) OR body_value->>'version' IS DISTINCT FROM 'own-annul-command.v2' OR jsonb_typeof(body_value->'reviewSha256') IS DISTINCT FROM 'string' OR coalesce(body_value->>'reviewSha256','')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 END IF;
 period_value:=body_value->>'period';type_value:=body_value->>'liquidationType';
 IF jsonb_typeof(body_value->'period') IS DISTINCT FROM 'string' OR coalesce(period_value,'')!~'^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' OR jsonb_typeof(body_value->'liquidationType') IS DISTINCT FROM 'string' OR coalesce(type_value,'') NOT IN('monthly','first_fortnight','sac','vacation','supplementary','final','other') OR body_value->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(body_value->'reason') IS DISTINCT FROM 'string' OR length(body_value->>'reason') NOT BETWEEN 10 AND 500 OR btrim(body_value->>'reason')<>body_value->>'reason' OR body_value->>'reason'~'[[:cntrl:]]' OR jsonb_typeof(body_value->'stateVersion') IS DISTINCT FROM 'string' OR coalesce(body_value->>'stateVersion','')!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 -- Four typed, context-bound folds. Every ordered record advances its exact
 -- sequence counter and binds the preceding digest plus the canonical record.
 -- An empty channel has an explicit count0 and its domain-specific seed hash.
 -- This changes space for accumulated metadata, not the number/cost of reads.
 fold_domain:=jsonb_build_object('version',fold_version,'scopeVersion',scope_value,'tenantId',parent.tenant_id,'sourceBindingId',parent.source_binding_id,'sourceId',parent.id,'period',period_value,'liquidationType',type_value);
 inventory_digest:=public.own_run_hash_v1(fold_domain||jsonb_build_object('channel','capture_inventory','seed',true));
 census_digest:=public.own_run_hash_v1(fold_domain||jsonb_build_object('channel','current_census','seed',true));
 liquidation_history_digest:=public.own_run_hash_v1(fold_domain||jsonb_build_object('channel','liquidation_history','seed',true));
 close_history_digest:=public.own_run_hash_v1(fold_domain||jsonb_build_object('channel','close_history','seed',true));
 -- Pure112 provenance hashing from stored columns, NEVER an authorization ctx.
 stored_scope:=encode(public.digest(jsonb_build_array('native-salary-scope.v1',parent.tenant_id::text,parent.source_binding_id::text,parent.actor_membership_id::text,parent.actor_person_id::text,parent.actor_email)::text,'sha256'),'hex');
 IF body_value->>'scopeVersion' IS DISTINCT FROM stored_scope THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 kind:=body_value#>>'{selection,kind}';selected_values:=body_value#>'{selection,values}';
 IF NOT public.own_program_exact_v1(body_value->'selection',ARRAY['kind','values']) OR coalesce(kind,'') NOT IN('all','contracts','agreements','departments') OR jsonb_typeof(selected_values) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 IF jsonb_array_length(selected_values)>10000 OR(kind='all')<>(jsonb_array_length(selected_values)=0) OR EXISTS(SELECT 1 FROM jsonb_array_elements(selected_values) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}'!~CASE WHEN kind='contracts' THEN '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' ELSE '^[0-9]{1,9}$' END) OR selected_values IS DISTINCT FROM(SELECT coalesce(jsonb_agg(value ORDER BY value COLLATE "C"),'[]') FROM(SELECT DISTINCT value FROM jsonb_array_elements_text(selected_values)) selected) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 IF jsonb_typeof(original->'affected') IS DISTINCT FROM 'array' OR jsonb_typeof(original->'receipts') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 affected_count:=jsonb_array_length(original->'affected');
 IF affected_count NOT BETWEEN 1 AND 10000 OR jsonb_array_length(original->'receipts') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(original->'affected') a WHERE NOT public.own_program_exact_v1(a.value,ARRAY['runId','resultSha256','contractId','liquidationDate','version','liquidationVersion']) OR jsonb_typeof(a.value->'runId') IS DISTINCT FROM 'string' OR coalesce(a.value->>'runId','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(a.value->'contractId') IS DISTINCT FROM 'string' OR coalesce(a.value->>'contractId','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR coalesce(a.value->>'resultSha256','')!~'^[a-f0-9]{64}$' OR jsonb_typeof(a.value->'version') IS DISTINCT FROM 'number' OR coalesce(a.value->>'version','')!~'^[1-9][0-9]*$' OR jsonb_typeof(a.value->'liquidationVersion') IS DISTINCT FROM 'number' OR coalesce(a.value->>'liquidationVersion','')!~'^[1-9][0-9]*$') OR(SELECT count(DISTINCT value->>'contractId') FROM jsonb_array_elements(original->'affected'))<>affected_count THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 SELECT array_agg((value->>'contractId')::uuid ORDER BY value->>'contractId' COLLATE "C") INTO affected_ids FROM jsonb_array_elements(original->'affected');

 -- Validate EVERY referenced real child and the exact two-way union. No old
 -- attempt helper is called: it intentionally requires the checker identity.
 FOR child_value IN SELECT value FROM jsonb_array_elements(original->'receipts') LOOP
  IF NOT public.own_program_exact_v1(child_value,ARRAY['version','id','key','body','bodySha256','runId','resultSha256','affected','recordedAt','replayed']) OR coalesce(child_value->>'id','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  SELECT * INTO child FROM public.own_payroll_liquidation_event e WHERE e.id=(child_value->>'id')::uuid AND e.tenant_id=parent.tenant_id AND e.source_binding_id=parent.source_binding_id;
  IF child.id IS NULL OR child.id=ANY(child_ids) OR child.request_key=ANY(child_keys) OR child.capture_id=ANY(child_runs) OR child.command<>'annul' OR child.actor_membership_id IS DISTINCT FROM parent.actor_membership_id OR child.actor_person_id IS DISTINCT FROM parent.actor_person_id OR child.actor_email IS DISTINCT FROM parent.actor_email OR child_value IS DISTINCT FROM child.receipt OR child.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(child.body) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  IF NOT public.own_program_exact_v1(child.body,ARRAY['runId','resultSha256','scopeVersion','stateVersion','command','selection','reason','reviewConfirmed']) OR child.body->>'runId' IS DISTINCT FROM child.capture_id::text OR child.body->>'command' IS DISTINCT FROM 'annul' OR child.body->>'reason' IS DISTINCT FROM body_value->>'reason' OR child.body->>'scopeVersion' IS DISTINCT FROM stored_scope OR child.body->'reviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR coalesce(child.body->>'stateVersion','')!~'^[a-f0-9]{64}$' OR NOT public.own_program_exact_v1(child.body->'selection',ARRAY['kind','values']) OR child.body#>>'{selection,kind}' IS DISTINCT FROM 'contracts' OR jsonb_typeof(child.body#>'{selection,values}') IS DISTINCT FROM 'array' OR jsonb_typeof(child.changes) IS DISTINCT FROM 'array' OR jsonb_array_length(child.changes) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  receipt_value:=jsonb_build_object('version','own-liquidation-receipt.v1','id',child.id,'key',child.request_key,'body',child.body,'bodySha256',child.body_sha256,'runId',child.capture_id,'resultSha256',child.body->>'resultSha256','affected',child.changes,'recordedAt',child.recorded_at,'replayed',false);
  IF child.receipt IS DISTINCT FROM receipt_value OR(SELECT count(DISTINCT value->>'contractId') FROM jsonb_array_elements(child.changes))<>jsonb_array_length(child.changes) OR child.body#>'{selection,values}' IS DISTINCT FROM(SELECT jsonb_agg(value->>'contractId' ORDER BY value->>'contractId' COLLATE "C") FROM jsonb_array_elements(child.changes)) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  FOR change_value IN SELECT value FROM jsonb_array_elements(child.changes) LOOP
   IF NOT public.own_program_exact_v1(change_value,ARRAY['contractId','state','version','liquidationVersion']) OR change_value->>'state' IS DISTINCT FROM 'annulled' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
   SELECT value INTO affected_value FROM jsonb_array_elements(original->'affected') WHERE value->>'runId'=child.capture_id::text AND value->>'contractId'=change_value->>'contractId';
   IF affected_value IS NULL OR affected_value->>'resultSha256' IS DISTINCT FROM child.body->>'resultSha256' OR affected_value->'version' IS DISTINCT FROM change_value->'version' OR affected_value->'liquidationVersion' IS DISTINCT FROM change_value->'liquidationVersion' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
   union_count:=union_count+1;
  END LOOP;
  child_ids:=array_append(child_ids,child.id);child_keys:=array_append(child_keys,child.request_key);child_runs:=array_append(child_runs,child.capture_id);child_count:=child_count+1;
 END LOOP;
 IF union_count<>affected_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(original->'affected') a WHERE NOT((a.value->>'runId')::uuid=ANY(child_runs))) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;

 -- Reject any cross-scope ledger link before197 readers see it. Hash and
 -- commit COMPLETE relevant liquidation/close histories, never return them.
 FOR history_event IN SELECT e.* FROM public.own_payroll_liquidation_event e JOIN public.own_payroll_run_capture c ON c.id=e.capture_id WHERE(c.tenant_id=parent.tenant_id AND c.source_binding_id=parent.source_binding_id AND c.body->>'period'=period_value AND c.body->>'liquidationType'=type_value) OR(e.tenant_id=parent.tenant_id AND e.source_binding_id=parent.source_binding_id AND c.body->>'period'=period_value AND c.body->>'liquidationType'=type_value) ORDER BY e.id::text COLLATE "C" LOOP
  SELECT * INTO capture FROM public.own_payroll_run_capture c WHERE c.id=history_event.capture_id;
  SELECT * INTO saved FROM public.own_payroll_run_result r WHERE r.capture_id=capture.id;
  IF history_event.tenant_id IS DISTINCT FROM parent.tenant_id OR history_event.source_binding_id IS DISTINCT FROM parent.source_binding_id OR capture.tenant_id IS DISTINCT FROM parent.tenant_id OR capture.source_binding_id IS DISTINCT FROM parent.source_binding_id OR history_event.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(history_event.body) OR history_event.receipt->'body' IS DISTINCT FROM history_event.body OR history_event.receipt->'affected' IS DISTINCT FROM history_event.changes OR history_event.receipt->>'runId' IS DISTINCT FROM capture.id::text OR history_event.receipt->>'bodySha256' IS DISTINCT FROM history_event.body_sha256 THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  IF saved.capture_id IS NULL OR history_event.body->>'runId' IS DISTINCT FROM capture.id::text OR history_event.body->>'resultSha256' IS DISTINCT FROM saved.result_sha256 OR history_event.body->>'command' IS DISTINCT FROM history_event.command OR jsonb_typeof(history_event.changes) IS DISTINCT FROM 'array' OR jsonb_typeof(saved.input->'employees') IS DISTINCT FROM 'array' OR jsonb_array_length(history_event.changes) NOT BETWEEN 1 AND 10000 OR(SELECT count(DISTINCT value->>'contractId') FROM jsonb_array_elements(history_event.changes))<>jsonb_array_length(history_event.changes) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  receipt_value:=jsonb_build_object('version','own-liquidation-receipt.v1','id',history_event.id,'key',history_event.request_key,'body',history_event.body,'bodySha256',history_event.body_sha256,'runId',history_event.capture_id,'resultSha256',saved.result_sha256,'affected',history_event.changes,'recordedAt',history_event.recorded_at,'replayed',false);
  IF history_event.receipt IS DISTINCT FROM receipt_value THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  FOR change_value IN SELECT value FROM jsonb_array_elements(history_event.changes) LOOP
   IF NOT public.own_program_exact_v1(change_value,ARRAY['contractId','state','version','liquidationVersion']) OR change_value->>'state' IS DISTINCT FROM (CASE history_event.command WHEN 'confirm' THEN 'confirmed' WHEN 'annul' THEN 'annulled' ELSE 'cancelled' END) OR jsonb_typeof(change_value->'version') IS DISTINCT FROM 'number' OR coalesce(change_value->>'version','')!~'^[1-9][0-9]*$' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(saved.input->'employees') person_row WHERE person_row.value->>'contractId'=change_value->>'contractId') OR(history_event.command='cancel' AND change_value->'liquidationVersion' IS DISTINCT FROM 'null'::jsonb) OR(history_event.command<>'cancel' AND(jsonb_typeof(change_value->'liquidationVersion') IS DISTINCT FROM 'number' OR coalesce(change_value->>'liquidationVersion','')!~'^[1-9][0-9]*$')) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  END LOOP;
  fold_record:=jsonb_build_object('id',history_event.id,'runId',capture.id,'bodySha256',history_event.body_sha256,'changesSha256',public.own_run_hash_v1(history_event.changes),'receiptSha256',public.own_run_hash_v1(history_event.receipt));
  liquidation_history_count:=liquidation_history_count+1;
  liquidation_history_digest:=public.own_run_hash_v1(jsonb_build_object('version',fold_version,'channel','liquidation_history','sequence',liquidation_history_count,'previousSha256',liquidation_history_digest,'record',fold_record));
 END LOOP;
 FOR close_event IN SELECT e.* FROM public.own_payroll_close_event e WHERE e.tenant_id=parent.tenant_id AND e.source_binding_id=parent.source_binding_id AND e.period=period_value AND e.liquidation_type=type_value ORDER BY e.id::text COLLATE "C" LOOP
  IF close_event.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(close_event.body) OR close_event.snapshot_sha256 IS DISTINCT FROM public.own_run_hash_v1(close_event.snapshot) OR close_event.receipt->'body' IS DISTINCT FROM close_event.body OR close_event.receipt->'snapshot' IS DISTINCT FROM close_event.snapshot OR close_event.receipt->>'bodySha256' IS DISTINCT FROM close_event.body_sha256 OR close_event.receipt->>'snapshotSha256' IS DISTINCT FROM close_event.snapshot_sha256 THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  IF close_event.snapshot->>'period' IS DISTINCT FROM period_value OR close_event.snapshot->>'liquidationType' IS DISTINCT FROM type_value OR close_event.snapshot->>'populationDomain' IS DISTINCT FROM 'native_registered' OR jsonb_typeof(close_event.snapshot->'employees') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  FOR person IN SELECT value FROM jsonb_array_elements(close_event.snapshot->'employees') LOOP
   IF coalesce(person->>'runId','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR NOT EXISTS(SELECT 1 FROM public.own_payroll_run_capture c JOIN public.own_payroll_run_result r ON r.capture_id=c.id WHERE c.id=(person->>'runId')::uuid AND c.tenant_id=parent.tenant_id AND c.source_binding_id=parent.source_binding_id AND c.body->>'period'=period_value AND c.body->>'liquidationType'=type_value AND r.input_sha256=person->>'inputSha256' AND r.result_sha256=person->>'resultSha256' AND EXISTS(SELECT 1 FROM jsonb_array_elements(r.input->'employees') selected WHERE selected.value->>'contractId'=person->>'contractId')) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  END LOOP;
  fold_record:=jsonb_build_object('id',close_event.id,'groupId',close_event.group_id,'command',close_event.command,'bodySha256',close_event.body_sha256,'snapshotSha256',close_event.snapshot_sha256,'receiptSha256',public.own_run_hash_v1(close_event.receipt));
  close_history_count:=close_history_count+1;
  close_history_digest:=public.own_run_hash_v1(jsonb_build_object('version',fold_version,'channel','close_history','sequence',close_history_count,'previousSha256',close_history_digest,'record',fold_record));
 END LOOP;
 global_active:=public.own_liquidation_current_v1(ctx,period_value,type_value);active_closes:=public.own_close_active_v1(ctx,period_value,type_value);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(global_active) x WHERE x.value->>'state'='confirmed' AND(x.value->>'contractId')::uuid=ANY(affected_ids)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(active_closes) g CROSS JOIN LATERAL jsonb_array_elements(g.value#>'{snapshot,employees}') x WHERE(x.value->>'contractId')::uuid=ANY(affected_ids)) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CURRENT_STATE_CHANGED';END IF;

 -- ALL captures of the period/type enter the private inventory, including
 -- pending captures and captures from all other makers. Each calculated run
 -- contributes a hash of ALL197 rows. Complete ordered folds impose NO new
 -- global1000-row limit and never return the nominal census in the public DTO.
 FOR capture IN SELECT c.* FROM public.own_payroll_run_capture c WHERE c.tenant_id=parent.tenant_id AND c.source_binding_id=parent.source_binding_id AND c.body->>'period'=period_value AND c.body->>'liquidationType'=type_value ORDER BY c.id::text COLLATE "C" LOOP
  capture_count:=capture_count+1;
  SELECT * INTO saved FROM public.own_payroll_run_result r WHERE r.capture_id=capture.id;
  IF capture.body_sha256 IS DISTINCT FROM public.own_run_hash_v1(capture.body) OR capture.payload_sha256 IS DISTINCT FROM public.own_run_hash_v1(capture.payload) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  fold_record:=jsonb_build_object('id',capture.id,'bodySha256',capture.body_sha256,'payloadSha256',capture.payload_sha256,'algorithmSha256',capture.algorithm_sha256,'saved',saved.capture_id IS NOT NULL,'inputSha256',saved.input_sha256,'resultSha256',saved.result_sha256);
  inventory_digest:=public.own_run_hash_v1(jsonb_build_object('version',fold_version,'channel','capture_inventory','sequence',capture_count,'previousSha256',inventory_digest,'record',fold_record));
  IF saved.capture_id IS NULL THEN
   IF capture.id=ANY(child_runs) OR EXISTS(SELECT 1 FROM jsonb_array_elements(global_active) a WHERE a.value->>'runId'=capture.id::text) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
   CONTINUE;
  END IF;
  IF saved.algorithm_sha256 IS DISTINCT FROM capture.algorithm_sha256 OR saved.input_sha256 IS DISTINCT FROM public.own_run_hash_v1(saved.input) OR saved.result_sha256 IS DISTINCT FROM public.own_run_hash_v1(saved.result) OR saved.result->'payrollCalculated' IS DISTINCT FROM 'true'::jsonb OR saved.result->'paymentExecuted' IS DISTINCT FROM 'false'::jsonb OR saved.input->>'period' IS DISTINCT FROM period_value OR saved.result->>'period' IS DISTINCT FROM period_value OR saved.input->>'liquidationType' IS DISTINCT FROM type_value OR saved.result->>'liquidationType' IS DISTINCT FROM type_value OR saved.input->'selection' IS DISTINCT FROM capture.body->'selection' OR saved.result->'selection' IS DISTINCT FROM saved.input->'selection' OR capture.body->>'populationDomain' IS DISTINCT FROM 'native_registered' OR jsonb_typeof(saved.input->'employees') IS DISTINCT FROM 'array' OR jsonb_typeof(saved.result->'rows') IS DISTINCT FROM 'array' OR jsonb_typeof(capture.payload#>'{population,employees}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  employee_count:=jsonb_array_length(saved.input->'employees');concept_count:=jsonb_array_length(saved.result->'rows');
  IF employee_count NOT BETWEEN 1 AND 10000 OR concept_count<1 OR saved.result->'employeeCount' IS DISTINCT FROM to_jsonb(employee_count) OR saved.result->'rowCount' IS DISTINCT FROM to_jsonb(concept_count) OR(SELECT count(DISTINCT value->>'contractId') FROM jsonb_array_elements(saved.input->'employees'))<>employee_count OR jsonb_array_length(capture.payload#>'{population,employees}')<>employee_count THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  date_value:=coalesce(capture.body->'liquidationDate','null'::jsonb);
  IF date_value<>'null'::jsonb AND(jsonb_typeof(date_value) IS DISTINCT FROM 'string' OR coalesce(date_value#>>'{}','')!~'^(19|20)[0-9]{2}-[0-9]{2}-[0-9]{2}$') THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  IF date_value<>'null'::jsonb AND to_char((date_value#>>'{}')::date,'YYYY-MM-DD')<>date_value#>>'{}' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  run_rows:=public.own_liquidation_rows_v1(ctx,capture);run_census:='[]';
  IF jsonb_typeof(run_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(run_rows)<>employee_count OR(SELECT count(DISTINCT value->>'contractId') FROM jsonb_array_elements(run_rows))<>employee_count THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
  FOR person IN SELECT value FROM jsonb_array_elements(saved.input->'employees') ORDER BY value->>'contractId' COLLATE "C" LOOP
   IF jsonb_typeof(person->'contractId') IS DISTINCT FROM 'string' OR coalesce(person->>'contractId','')!~'^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' OR jsonb_typeof(person->'employeeNumber') IS DISTINCT FROM 'string' OR char_length(person->>'employeeNumber') NOT BETWEEN 1 AND 64 OR EXISTS(SELECT 1 FROM generate_series(1,159) cp WHERE(cp<=31 OR cp>=127) AND position(chr(cp) in person->>'employeeNumber')>0) OR jsonb_typeof(person->'agreementCode') IS DISTINCT FROM 'string' OR coalesce(person->>'agreementCode','')!~'^[0-9]{1,9}$' OR jsonb_typeof(person->'departmentCode') IS DISTINCT FROM 'string' OR coalesce(person->>'departmentCode','')!~'^[0-9]{1,9}$' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(capture.payload#>'{population,employees}') source_person WHERE source_person.value->>'contractId'=person->>'contractId' AND source_person.value->>'employeeNumber'=person->>'employeeNumber' AND source_person.value->>'agreementCode'=person->>'agreementCode' AND source_person.value->>'departmentCode'=person->>'departmentCode') THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
   SELECT value INTO decision FROM jsonb_array_elements(run_rows) WHERE value->>'contractId'=person->>'contractId';
   IF decision IS NULL OR coalesce(decision->>'state','') NOT IN('calculated','confirmed','annulled','cancelled') OR jsonb_typeof(decision->'version') IS DISTINCT FROM 'number' OR coalesce(decision->>'version','')!~'^(0|[1-9][0-9]*)$' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
   run_census:=run_census||jsonb_build_array(jsonb_build_object('contractId',person->>'contractId','state',decision->>'state','version',decision->'version','liquidationVersion',decision->'liquidationVersion'));
   IF capture.id=ANY(child_runs) THEN
    SELECT value INTO affected_value FROM jsonb_array_elements(original->'affected') a WHERE a.value->>'runId'=capture.id::text AND a.value->>'contractId'=person->>'contractId';
    IF affected_value IS NOT NULL THEN
     IF affected_value->>'resultSha256' IS DISTINCT FROM saved.result_sha256 OR affected_value->'liquidationDate' IS DISTINCT FROM date_value THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_SOURCE_CHANGED';END IF;
     IF decision->>'state' IS DISTINCT FROM 'annulled' OR decision->'version' IS DISTINCT FROM affected_value->'version' OR decision->'liquidationVersion' IS DISTINCT FROM affected_value->'liquidationVersion' THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CURRENT_STATE_CHANGED';END IF;
     IF kind<>'all' AND NOT selected_values ? (person->>CASE kind WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
     selection_values:=array_append(selection_values,person->>CASE kind WHEN 'contracts' THEN 'contractId' WHEN 'agreements' THEN 'agreementCode' ELSE 'departmentCode' END);
     projected_affected:=projected_affected||jsonb_build_array(jsonb_build_object('runId',capture.id,'resultSha256',saved.result_sha256,'contractId',person->>'contractId','employeeNumber',person->>'employeeNumber','agreementCode',person->>'agreementCode','departmentCode',person->>'departmentCode','liquidationDate',date_value,'state','annulled','version',decision->'version','liquidationVersion',decision->'liquidationVersion'));
    END IF;
   END IF;
  END LOOP;
  fold_record:=jsonb_build_object('runId',capture.id,'resultSha256',saved.result_sha256,'employeeCount',employee_count,'rowsSha256',public.own_run_hash_v1(run_census));
  calculated_count:=calculated_count+1;
  census_digest:=public.own_run_hash_v1(jsonb_build_object('version',fold_version,'channel','current_census','sequence',calculated_count,'previousSha256',census_digest,'record',fold_record));
  IF capture.id=ANY(child_runs) THEN
   creator_scope:=encode(public.digest(jsonb_build_array('native-salary-scope.v1',capture.tenant_id::text,capture.source_binding_id::text,capture.actor_membership_id::text,capture.actor_person_id::text,capture.actor_email)::text,'sha256'),'hex');
   IF capture.body->>'scopeVersion' IS DISTINCT FROM creator_scope OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(original->'receipts') child_receipt WHERE child_receipt.value->>'runId'=capture.id::text AND child_receipt.value->>'resultSha256'=saved.result_sha256) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
   runs_value:=runs_value||jsonb_build_array(jsonb_build_object('id',capture.id,'creatorScopeVersion',creator_scope,'stateVersion',public.own_liquidation_state_v1(ctx,capture),'bodySha256',capture.body_sha256,'payloadSha256',capture.payload_sha256,'algorithmSha256',capture.algorithm_sha256,'inputSha256',saved.input_sha256,'resultSha256',saved.result_sha256,'liquidationDate',date_value,'employeeCount',employee_count,'conceptRowCount',concept_count));
  END IF;
 END LOOP;
 IF jsonb_array_length(runs_value)<>child_count OR jsonb_array_length(projected_affected)<>affected_count OR kind<>'all' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(selected_values) selected WHERE NOT selected=ANY(selection_values)) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_CONTRACT_INVALID';END IF;
 SELECT jsonb_agg(value ORDER BY value->>'contractId' COLLATE "C") INTO projected_affected FROM jsonb_array_elements(projected_affected);
 SELECT jsonb_agg(jsonb_build_object('liquidationDate',liquidation_date,'count',row_count) ORDER BY coalesce(liquidation_date#>>'{}','') COLLATE "C") INTO date_groups FROM(SELECT value->'liquidationDate' liquidation_date,count(*) row_count FROM jsonb_array_elements(projected_affected) GROUP BY value->'liquidationDate') groups;
 source_value:=jsonb_build_object('id',parent.id,'receiptVersion',original->>'version','bodySha256',parent.body_sha256,'receiptSha256',public.own_run_hash_v1(original),'recordedAt',parent.recorded_at);
 state_commitment:=public.own_run_hash_v1(jsonb_build_object('version','own-annul-preparation-authority-state.v1','scopeVersion',scope_value,'source',source_value,'period',period_value,'liquidationType',type_value,'projectedRuns',runs_value,'completeRunInventory',jsonb_build_object('version',fold_version,'channel','capture_inventory','count',capture_count,'finalSha256',inventory_digest),'completeCurrentCensus',jsonb_build_object('version',fold_version,'channel','current_census','count',calculated_count,'finalSha256',census_digest),'globalActive',global_active,'activeClosesSha256',public.own_run_hash_v1(active_closes),'liquidationHistory',jsonb_build_object('version',fold_version,'channel','liquidation_history','count',liquidation_history_count,'finalSha256',liquidation_history_digest),'closeHistory',jsonb_build_object('version',fold_version,'channel','close_history','count',close_history_count,'finalSha256',close_history_digest)));
 detail:=jsonb_build_object('version','own-annul-preparation.v1','custodyPolicy','tenant_binding_projected_preparation.v1','scopeVersion',scope_value,'source',source_value,'period',period_value,'liquidationType',type_value,'populationDomain','native_registered','runs',runs_value,'affected',projected_affected,'confirmedAffectedContractIds','[]'::jsonb,'dateGroups',date_groups,'sourceStateSha256',state_commitment,'complete',true);
 detail:=detail||jsonb_build_object('preparationSha256',public.own_run_hash_v1(detail));
 IF octet_length(detail::text)+8192>maximum_bytes THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_LIMIT';END IF;
 RETURN detail;
END $projection$;$definition_209$;
 REVOKE ALL ON FUNCTION public.own_annul_preparation_core_v1(jsonb,uuid,integer) FROM PUBLIC,municontrol_actions_runtime_app;

 EXECUTE $definition_209$CREATE FUNCTION public.own_annul_preparation_v1(p jsonb,source_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $wrapper$BEGIN RETURN public.own_annul_preparation_core_v1(p,source_id,4194304);END $wrapper$;$definition_209$;
 REVOKE ALL ON FUNCTION public.own_annul_preparation_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
 GRANT EXECUTE ON FUNCTION public.own_annul_preparation_v1(jsonb,uuid) TO municontrol_actions_runtime_app;
 EXECUTE $definition_209$CREATE FUNCTION public.own_annul_preparation_full_v1(p jsonb,source_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp SET timezone='UTC' AS $wrapper$BEGIN RETURN public.own_annul_preparation_core_v1(p,source_id,33554432);END $wrapper$;$definition_209$;
 REVOKE ALL ON FUNCTION public.own_annul_preparation_full_v1(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
 GRANT EXECUTE ON FUNCTION public.own_annul_preparation_full_v1(jsonb,uuid) TO municontrol_actions_runtime_app;

 SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.oid),'[]') INTO after_functions FROM pg_proc f WHERE f.pronamespace='public'::regnamespace AND NOT f.proname=ANY(new_names);
 IF after_functions IS DISTINCT FROM old_functions THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_INSTALL_EXISTING_FUNCTION_CHANGED';END IF;
 FOREACH new_name IN ARRAY new_names LOOP
  IF(SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=new_name)<>1 THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_INSTALL_NEW_OBJECT_CHANGED';END IF;
  SELECT * INTO actual FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=new_name;
  IF actual.proowner<>current_user::regrole OR NOT actual.prosecdef OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public, pg_temp','TimeZone=UTC'] OR actual.proretset OR actual.proisstrict OR actual.prokind<>'f' OR actual.prorettype<>'jsonb'::regtype OR actual.prolang<>(SELECT oid FROM pg_language WHERE lanname='plpgsql') OR actual.pronargdefaults<>0 OR actual.proargmodes IS NOT NULL OR EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantor<>actual.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable OR(a.grantee<>actual.proowner AND NOT(new_name<>'own_annul_preparation_core_v1' AND a.grantee=runtime_oid))) OR(SELECT count(*) FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))))<>(CASE WHEN new_name='own_annul_preparation_core_v1' THEN 1 ELSE 2 END) OR NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=actual.proowner AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) OR(new_name<>'own_annul_preparation_core_v1') IS DISTINCT FROM EXISTS(SELECT 1 FROM aclexplode(coalesce(actual.proacl,acldefault('f',actual.proowner))) a WHERE a.grantee=runtime_oid AND a.privilege_type='EXECUTE' AND NOT a.is_grantable) THEN RAISE EXCEPTION 'OWN_ANNUL_PREPARATION_INSTALL_NEW_ACL_CHANGED';END IF;
 END LOOP;
END $annul_preparation_209$;
